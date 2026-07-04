import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ORG = process.env.GITHUB_ORG || 'TYPO3-Documentation';
const TOKEN = process.env.GITHUB_TOKEN || process.env.DASHBOARD_GITHUB_TOKEN || '';
const API = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
const GRAPHQL = process.env.GITHUB_GRAPHQL_URL || `${API}/graphql`;
const STALE_DAYS = Number(process.env.STALE_PR_DAYS || 30);
const root = process.cwd();
const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'typo3-documentation-dashboard'
};
if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, { optional = false, attempt = 1 } = {}) {
  const res = await fetch(url, { headers });
  if (res.ok) return res.json();

  // Retry transient failures so one flaky response does not abort the whole run
  // (output is only written after every repository succeeds). Covered:
  //   - 5xx server errors (transient)
  //   - secondary rate limits, which reply with a Retry-After header
  const retryAfter = Number(res.headers.get('retry-after'));
  const retryable = res.status >= 500 || (retryAfter > 0 && (res.status === 429 || res.status === 403));
  if (retryable && attempt <= 5) {
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
    await sleep(Math.min(waitMs, 60000));
    return request(url, { optional, attempt: attempt + 1 });
  }

  // A 404, or a rate-limited/permission-denied 403, on an optional endpoint
  // means "unknown/absent", not a hard failure.
  if ((res.status === 404 || res.status === 403) && optional) return null;
  const text = await res.text();
  throw new Error(`${res.status} ${res.statusText} for ${url}: ${text.slice(0, 400)}`);
}

async function graphql(query, variables, { attempt = 1 } = {}) {
  const res = await fetch(GRAPHQL, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
  if (res.status >= 500 || res.status === 429) {
    if (attempt <= 5) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Math.min(retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000, 60000));
      return graphql(query, variables, { attempt: attempt + 1 });
    }
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GraphQL ${res.status} ${res.statusText}: ${text.slice(0, 400)}`);
  }
  const body = await res.json();
  if (body.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(body.errors).slice(0, 400)}`);
  }
  return body.data;
}

async function paged(url) {
  const items = [];
  for (let page = 1; page < 20; page += 1) {
    const separator = url.includes('?') ? '&' : '?';
    const batch = await request(`${url}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

// Accurate open issue/PR counts for every repo in one GraphQL sweep.
// The REST Search API caps at 30 requests/minute, which silently nulled most
// counts; GraphQL returns exact totals for all repos within the 5000 point/hour
// budget. Stale PRs are computed from the updatedAt of open PRs (exact for the
// common case of <=100 open PRs; null rather than undercount beyond that).
async function collectWorkQueues() {
  const staleCutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  const query = `
    query($org: String!, $cursor: String) {
      organization(login: $org) {
        repositories(first: 50, after: $cursor, privacy: PUBLIC, orderBy: { field: NAME, direction: ASC }) {
          pageInfo { hasNextPage endCursor }
          nodes {
            name
            issues(states: OPEN) { totalCount }
            pullRequests(states: OPEN) { totalCount }
            openPrs: pullRequests(states: OPEN, first: 100, orderBy: { field: UPDATED_AT, direction: ASC }) {
              totalCount
              nodes { updatedAt }
            }
          }
        }
      }
    }`;
  const byName = new Map();
  let cursor = null;
  do {
    const data = await graphql(query, { org: ORG, cursor });
    const conn = data.organization.repositories;
    for (const node of conn.nodes) {
      const openPrCount = node.pullRequests.totalCount;
      let stale = null;
      if (node.openPrs.totalCount <= 100) {
        stale = node.openPrs.nodes.filter((pr) => Date.parse(pr.updatedAt) < staleCutoff).length;
      }
      byName.set(node.name, {
        openIssues: node.issues.totalCount,
        openPullRequests: openPrCount,
        stalePullRequests: stale
      });
    }
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (cursor);
  return byName;
}

async function contentText(fullName, ref, candidates) {
  for (const candidate of candidates) {
    const url = `${API}/repos/${fullName}/contents/${encodeURIComponent(candidate).replaceAll('%2F', '/')}?ref=${encodeURIComponent(ref)}`;
    const data = await request(url, { optional: true });
    if (data?.content) {
      return Buffer.from(data.content, data.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');
    }
    if (data) return '';
  }
  return null;
}

async function hasPath(fullName, ref, candidates) {
  const text = await contentText(fullName, ref, candidates);
  return text !== null;
}

// Extract owner handles (@user, @org/team) from a CODEOWNERS file. This is
// repository-owned evidence (AGENTS.md evidence order #2), not inferred from
// commit history.
function parseCodeowners(text) {
  if (!text) return [];
  const owners = new Set();
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    for (const match of line.matchAll(/@[A-Za-z0-9][A-Za-z0-9-]*(?:\/[A-Za-z0-9._-]+)?/g)) {
      owners.add(match[0]);
    }
  }
  return [...owners];
}

// Category inferred from the repository name and topics. Marked as generated in
// the dashboard so it never masquerades as curated classification.
function deriveCategory(repo) {
  const name = repo.name.toLowerCase();
  const topics = (repo.topics ?? []).map((t) => t.toLowerCase());
  const has = (re) => re.test(name) || topics.some((t) => re.test(t));
  if (has(/reference|tca|typoscript|tsconfig|viewhelper|exception|cheatsheet/)) return 'reference';
  if (has(/tutorial/)) return 'tutorial';
  if (has(/guide|book|writing/)) return 'guide';
  if (has(/example|snippet|codesnippet|blog_example|calculator|inventory|demo|bmi/)) return 'example';
  if (name === '.github' || has(/policy|homepage|assets|icons|images|screenshots|resources|site_package|site-introduction|project-info|vagrant|ansible|server|t3docteam/)) return 'infrastructure';
  if (has(/render|theme|indexer|search|ci|deploy|console|ddev|tool|t3docs|guides-|sphinx|domain|generator|changelog/)) return 'tooling';
  return 'uncategorized';
}

// Lifecycle from certain facts only: archived is authoritative; otherwise fall
// back to recent-activity as an inferred signal. Everything else stays unknown.
function deriveLifecycle(repo) {
  if (repo.archived) return 'archived';
  const pushed = repo.pushed_at ? Date.parse(repo.pushed_at) : null;
  if (pushed === null) return 'unknown';
  const days = (Date.now() - pushed) / 86400000;
  if (days <= 180) return 'active';
  if (days <= 730) return 'dormant';
  return 'stale';
}

async function latestWorkflowConclusion(fullName) {
  const runs = await request(`${API}/repos/${fullName}/actions/runs?per_page=1`, { optional: true });
  const run = runs?.workflow_runs?.[0];
  return run ? { conclusion: run.conclusion, status: run.status, name: run.name, url: run.html_url, updatedAt: run.updated_at } : null;
}

async function branchProtection(fullName, branch) {
  if (!branch) return null;
  const data = await request(`${API}/repos/${fullName}/branches/${encodeURIComponent(branch)}/protection`, { optional: true });
  if (!data) return null;
  return {
    enabled: true,
    requiredStatusChecks: Boolean(data.required_status_checks),
    enforceAdmins: Boolean(data.enforce_admins?.enabled),
    requiredPullRequestReviews: Boolean(data.required_pull_request_reviews),
    restrictions: Boolean(data.restrictions)
  };
}

// type=public: this dashboard is published publicly, so never pull private
// repository metadata into the generated data even if the token could read it.
const repos = await paged(`${API}/orgs/${ORG}/repos?type=public&sort=full_name&direction=asc`);
const workQueues = await collectWorkQueues();
const output = [];

for (const repo of repos) {
  const fullName = repo.full_name;
  const ref = repo.default_branch;
  const queue = workQueues.get(repo.name) ?? { openIssues: null, openPullRequests: null, stalePullRequests: null };
  const [workflow, protection, readme, contributing, codeownersText, security, dependabot, renovate] = await Promise.all([
    latestWorkflowConclusion(fullName),
    branchProtection(fullName, ref),
    contentText(fullName, ref, ['README.md', 'README.rst', 'README.txt']),
    contentText(fullName, ref, ['CONTRIBUTING.md', 'Documentation/Contribution/Index.rst']),
    contentText(fullName, ref, ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS']),
    hasPath(fullName, ref, ['SECURITY.md', '.github/SECURITY.md']),
    hasPath(fullName, ref, ['.github/dependabot.yml', '.github/dependabot.yaml']),
    hasPath(fullName, ref, ['renovate.json', '.github/renovate.json', '.renovaterc'])
  ]);

  output.push({
    name: repo.name,
    fullName,
    url: repo.html_url,
    description: repo.description,
    defaultBranch: repo.default_branch,
    archived: repo.archived,
    visibility: repo.visibility,
    openIssues: queue.openIssues,
    openPullRequests: queue.openPullRequests,
    stalePullRequests: queue.stalePullRequests,
    latestWorkflowConclusion: workflow,
    lastPushedAt: repo.pushed_at,
    updatedAt: repo.updated_at,
    createdAt: repo.created_at,
    sizeKb: repo.size,
    hasIssues: repo.has_issues,
    hasProjects: repo.has_projects,
    hasWiki: repo.has_wiki,
    hasDiscussions: repo.has_discussions,
    allowSquashMerge: repo.allow_squash_merge ?? null,
    allowMergeCommit: repo.allow_merge_commit ?? null,
    allowRebaseMerge: repo.allow_rebase_merge ?? null,
    allowAutoMerge: repo.allow_auto_merge ?? null,
    branchProtection: protection,
    hasReadme: readme !== null,
    hasContributing: contributing !== null,
    hasCodeowners: codeownersText !== null,
    hasSecurity: security,
    hasDependabot: dependabot,
    hasRenovate: renovate,
    codeownersOwners: parseCodeowners(codeownersText),
    topics: repo.topics ?? [],
    derivedCategory: deriveCategory(repo),
    derivedLifecycle: deriveLifecycle(repo),
    source: 'github-api'
  });
}

await mkdir(path.join(root, 'data/generated'), { recursive: true });
await writeFile(path.join(root, 'data/generated/repositories.json'), `${JSON.stringify(output, null, 2)}\n`);
await writeFile(path.join(root, 'data/generated/settings.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), source: 'github-api', organization: ORG, stalePullRequestDays: STALE_DAYS, repositoryCount: output.length }, null, 2)}\n`);
console.log(`Collected ${output.length} repositories for ${ORG}.`);
