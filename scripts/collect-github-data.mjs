import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ORG = process.env.GITHUB_ORG || 'TYPO3-Documentation';
const TOKEN = process.env.GITHUB_TOKEN || process.env.DASHBOARD_GITHUB_TOKEN || '';
const API = process.env.GITHUB_API_URL || 'https://api.github.com';
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
  // The primary search limit (403 with x-ratelimit-remaining: 0 and no
  // Retry-After) is intentionally NOT waited on: for optional endpoints it
  // degrades to null below, which the dashboard renders as "unknown".
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

async function searchCount(query) {
  const data = await request(`${API}/search/issues?q=${encodeURIComponent(query)}&per_page=1`, { optional: true });
  return data?.total_count ?? null;
}

async function hasPath(fullName, ref, candidates) {
  for (const candidate of candidates) {
    const url = `${API}/repos/${fullName}/contents/${encodeURIComponent(candidate).replaceAll('%2F', '/')}?ref=${encodeURIComponent(ref)}`;
    const data = await request(url, { optional: true });
    if (data) return true;
  }
  return false;
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
const staleCutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const output = [];

for (const repo of repos) {
  const fullName = repo.full_name;
  const ref = repo.default_branch;
  const [openIssues, openPullRequests, stalePullRequests, workflow, protection, hasReadme, hasContributing, hasCodeowners, hasSecurity, hasDependabot, hasRenovate] = await Promise.all([
    searchCount(`repo:${fullName} is:issue is:open`),
    searchCount(`repo:${fullName} is:pr is:open`),
    searchCount(`repo:${fullName} is:pr is:open updated:<${staleCutoff}`),
    latestWorkflowConclusion(fullName),
    branchProtection(fullName, ref),
    hasPath(fullName, ref, ['README.md', 'README.rst', 'README.txt']),
    hasPath(fullName, ref, ['CONTRIBUTING.md', 'Documentation/Contribution/Index.rst']),
    hasPath(fullName, ref, ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS']),
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
    openIssues,
    openPullRequests,
    stalePullRequests,
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
    hasReadme,
    hasContributing,
    hasCodeowners,
    hasSecurity,
    hasDependabot,
    hasRenovate,
    topics: repo.topics ?? [],
    source: 'github-api'
  });
}

await mkdir(path.join(root, 'data/generated'), { recursive: true });
await writeFile(path.join(root, 'data/generated/repositories.json'), `${JSON.stringify(output, null, 2)}\n`);
await writeFile(path.join(root, 'data/generated/settings.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), source: 'github-api', organization: ORG, stalePullRequestDays: STALE_DAYS, repositoryCount: output.length }, null, 2)}\n`);
console.log(`Collected ${output.length} repositories for ${ORG}.`);
