# AGENTS.md

This file is for AI coding agents working on this repository. It is intentionally operational and specific. Keep it current when project structure, commands, data contracts or automation change.

## Project purpose

This repository builds a static operations dashboard for the `TYPO3-Documentation` GitHub organization.

Primary users:

- TYPO3 documentation maintainers
- new documentation team members
- volunteers/contributors looking for the right repository or contact person
- repository/tooling maintainers checking operational drift

The dashboard must distinguish between:

- **generated GitHub facts**: repository metadata, issue/PR counts, workflow state, detected files, branch protection when accessible
- **curated human context**: people, roles, expertise, communication channels, rules, ownership/contact mappings and semantic relations

Do not merge those two concepts. GitHub activity is not proof of responsibility.

## Important files

| Path | Purpose | Edit mode |
|---|---|---|
| `src/index.html` | Static dashboard template, CSS and browser-side rendering code | manual code changes |
| `scripts/collect-github-data.mjs` | GitHub API collector for generated repository facts | manual code changes |
| `scripts/build-dashboard.mjs` | Embeds all JSON data into `dist/index.html` | manual code changes |
| `scripts/validate-curated-data.mjs` | Validates curated JSON references and required fields | manual code changes |
| `data/generated/repositories.json` | Generated repository facts from GitHub API | generated; do not hand-edit except seed fallback |
| `data/generated/settings.json` | Generated collector metadata | generated; do not hand-edit except seed fallback |
| `data/curated/people.json` | People, public roles, expertise and ask-for topics | curated; update by PR with source/confidence |
| `data/curated/communication.json` | Communication channels and their intended usage | curated; update by PR with source/confidence |
| `data/curated/rules.json` | Governance, contribution and lifecycle rules/references | curated; update by PR with owner/status |
| `data/curated/relations.json` | Graph edges between repos, people, rules, channels and external systems | curated; update by PR with confidence |
| `data/curated/repository-overrides.json` | Repository purpose, lifecycle, audience and domain contacts | curated; update by PR with evidence |
| `data/curated/pipeline.json` | Shape of the documentation publishing pipeline (render/deploy/index tool repos, docs/search/api services, TYPO3 Core → phpDocumentor → api.typo3.org, service/tool contacts) — drives the "Trace the impact" tab | curated; update by PR |
| `.github/workflows/update-dashboard.yml` | Scheduled dashboard refresh and GitHub Pages publish | manual code changes |

## Commands

Run from repository root.

| Command | Purpose |
|---|---|
| `npm run validate` | Validate curated JSON structure and references |
| `npm run build:offline` | Build `dist/index.html` from existing data without GitHub API access |
| `GITHUB_TOKEN=... npm run collect` | Refresh generated data from GitHub |
| `npm run build` | Build `dist/index.html` after data updates |
| `npm run all` | Validate, collect and build |

Node.js 22+ is required because the collector uses built-in `fetch`.

## Non-automated information update rules

The following files contain human-curated information and must be updated deliberately:

- `data/curated/people.json`
- `data/curated/communication.json`
- `data/curated/rules.json`
- `data/curated/relations.json`
- `data/curated/repository-overrides.json`

### General rule

Never guess. If the information is not publicly documented, confirmed by the team, or visible in repository-owned metadata such as CODEOWNERS, mark it as `TBD`, `unknown`, `needs-canonical-url` or omit the claim.

### Updating `people.json`

Use `people.json` only for persons who should be visible as contacts in the dashboard.

Required fields:

- `id`: stable kebab-case identifier, e.g. `lina-wolf`
- `name`: display name
- `github`: GitHub username or `null`
- `publicRole`: role as publicly documented or team-confirmed
- `expertise`: array of expertise fields; use `["TBD"]` if unknown
- `askFor`: array of concrete ask-for topics; use `["TBD"]` if unknown
- `source`: where this information came from
- `confidence`: one of the established confidence labels or a clear new one

Allowed examples for `confidence`:

- `public-team-page`
- `team-confirmed`
- `codeowners`
- `repository-readme`
- `maintainer-pr-confirmed`
- `TBD`

Do not infer expertise from commits alone. A frequent committer may not be the right escalation contact.

### Updating `repository-overrides.json`

Use this file to add human meaning to generated GitHub repository facts.

Recommended fields:

- `name`: exact repository name, without organization prefix
- `category`: one of `reference`, `tutorial`, `guide`, `tooling`, `generated`, `example`, `infrastructure`, `legacy`, `uncategorized`
- `purpose`: one-sentence purpose statement
- `audience`: array of target groups
- `externalRelations`: array of external systems or source-of-truth names
- `domainContacts`: array of `people.json` ids
- `lifecycle`: one of `active-content`, `active-tooling`, `generated`, `legacy`, `archived`, `needs-owner`, `unknown`

When assigning `domainContacts`, use this evidence order:

1. explicit team confirmation
2. repository CODEOWNERS
3. repository README/CONTRIBUTING maintainer section
4. public TYPO3 team role page

Do not use raw GitHub commit frequency as ownership evidence.

### Updating `communication.json`

Use this file for channels and where work should happen.

Required fields:

- `id`
- `name`
- `type`: `chat`, `async-work`, `review`, `meeting`, `mailing-list`, `forum`, or another clear type
- `audience`
- `purpose`
- `url`: use `null` if there is no stable public URL
- `confidence`

Be precise. Avoid vague entries such as “ask in Slack” without saying what belongs there.

### Updating `rules.json`

Use this file for policies, contribution references and operational rules.

Required fields:

- `id`
- `name`
- `category`: `contribution`, `governance`, `lifecycle`, `security`, `publishing`, `onboarding`, or similar
- `appliesTo`: array
- `status`: `active`, `recommended`, `missing-or-incomplete`, `needs-canonical-url`, `deprecated`, or `draft`
- `url`: canonical URL or `null`
- `owner`: responsible role/team/person id if known
- `note`: short operational explanation

Do not copy full policy documents into this file. Link to canonical sources.

### Updating `relations.json`

Use this file for graph edges that cannot be safely derived from GitHub API metadata.

Required fields:

- `from`
- `to`
- `type`
- `confidence`

Good relation types:

- `publishes-to`
- `published-on`
- `documents`
- `generated-from`
- `renders-for`
- `used-by`
- `communication-channel`
- `work-intake`
- `change-review`
- `owned-by`
- `reviewed-by`

Keep labels short. The graph is for orientation, not full process documentation.

## Generated data rules

Generated files are overwritten by `npm run collect`:

- `data/generated/repositories.json`
- `data/generated/settings.json`

Do not add curated fields there. Add human-maintained fields to `data/curated/repository-overrides.json` instead.

If the GitHub API returns `null` for settings/branch protection, preserve `null`. It means unknown or not accessible, not disabled.

Generated repository entries also include:

- `homepage`: the repository's GitHub homepage field — for content repositories this is the repo-declared docs.typo3.org manual URL (empty for tooling). The "Trace the impact" tab treats a repository as content that publishes a manual when its homepage points at docs.typo3.org.
- `codeownersOwners`: owner handles parsed from a CODEOWNERS file (repository-owned evidence, empty when absent).
- `derivedCategory`: category inferred from repository name/topics. The dashboard uses a curated `category` when present and marks a derived one as `inferred`.
- `derivedLifecycle`: `archived` when the repository is archived, otherwise an activity-based guess (`active`/`dormant`/`stale`/`unknown`), also marked `inferred` in the UI.

These are generated, not curated: never treat `derived*` as confirmed classification, and never hand-edit them.

## GitHub API collection rules

The collector must be safe to run with limited permissions.

- 404/403 on optional settings endpoints should become `null`, not a hard failure.
- Transient 5xx and secondary-rate-limit (Retry-After) responses are retried with backoff; only public repositories are collected (`type=public`).
- Repository listing failures should fail the command.
- Open issue/PR counts and stale-PR counts come from one GraphQL sweep (accurate for all repos within the point budget), replacing the REST Search API whose 30/minute limit silently nulled most counts.
- Keep API calls simple and transparent. Do not add heavy dependencies without a clear reason.
- Prefer GitHub REST API unless GraphQL materially reduces complexity (counts are the justified GraphQL case).

## Dashboard rendering rules

The dashboard is static and should remain easy to host via GitHub Pages.

- Do not introduce a frontend framework unless the static file becomes unmaintainable.
- Keep `dist/index.html` build output generated.
- Keep `src/index.html` readable enough for documentation contributors to review.
- Unknown data must render as `unknown`, `TBD` or `n/a`.
- Do not hide uncertainty behind fake health scores.

## Validation checklist before handing off

Run:

```bash
npm run validate
npm run build:offline
```

When GitHub API access is available, also run:

```bash
GITHUB_TOKEN=... npm run collect
npm run build
```

Then inspect:

- `dist/index.html` opens locally
- curated contacts resolve to known `people.json` ids
- repositories without known owners are visible as gaps
- generated GitHub facts are not manually mixed into curated files
- no invented person-role mappings were added

## Common next work items

Useful follow-up tasks for future agents:

1. Add CODEOWNERS parsing and map CODEOWNERS entries to `people.json` or teams.
2. Add GitHub team-permission collection when an org token is available.
3. Add ruleset/branch-protection detail for repositories where the token has sufficient access.
4. Replace seed data by a real collector run in GitHub Actions.
5. Add screenshots or a short maintainer walkthrough to `docs/`.
6. Add schema files for curated JSON if the data grows.
7. Add repository lifecycle review labels and a dashboard filter for `needs-owner`.

## Hard constraints

- Do not fabricate maintainers, expertise or rules.
- Do not treat missing API permission as a negative finding.
- Do not edit generated files for curated knowledge.
- Do not add dependencies just to make the page look modern.
- Do not turn this into a complex SPA unless the team explicitly asks for it.
