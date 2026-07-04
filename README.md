# TYPO3 Documentation Repository Dashboard

Static, generated operations map for the `TYPO3-Documentation` GitHub organization.

The dashboard is meant to help maintainers, new team members and occasional contributors answer practical questions:

- Which repository owns a documentation area?
- Where are open PRs and issues stuck?
- Which repositories lack ownership signals or contributor guidance?
- Who can be asked about GitHub settings, rendering/tooling, language review or general documentation direction?
- Which external systems are related to each repository?

## Current state

The dashboard is a single, self-contained, tabbed page (Overview, Repositories, Needs attention, People & channels, Relationships, Contribute & fix, Data provenance):

1. **Live GitHub operations data**: `scripts/collect-github-data.mjs` collects repository metadata, accurate open issue/PR and stale-PR counts (via GraphQL), workflow signals, repository file probes and CODEOWNERS owners.
2. **Orientation**: repositories are linked to GitHub, work-queue counts deep-link to filtered PR/issue lists, people link to their GitHub profiles, and channels/rules link to their canonical URLs. Category and lifecycle are inferred from generated signals when not curated, and marked `inferred`.
3. **Governance/readiness signals**: highlights repositories missing curated contacts, CODEOWNERS, contributor files, stale PRs or recent activity, grouped per repository, with concrete fix guidance.
4. **Archived repositories are hidden by default** across every tab (toggle on the Repositories tab).

The checked-in `data/generated/repositories.json` is only seed fallback data. Run the collector in a real repository with a GitHub token to replace it.

## Local use

Requires Node.js 22+.

```bash
npm run validate
npm run build:offline
```

Open:

```text
dist/index.html
```

## Collect live GitHub data

```bash
GITHUB_TOKEN=ghp_xxx npm run collect
npm run build
```

Optional environment variables:

| Variable | Default | Purpose |
|---|---:|---|
| `GITHUB_ORG` | `TYPO3-Documentation` | GitHub organization to scan |
| `GITHUB_TOKEN` / `DASHBOARD_GITHUB_TOKEN` | empty | Token used for GitHub API calls |
| `GITHUB_API_URL` | `https://api.github.com` | GitHub API base URL |
| `STALE_PR_DAYS` | `30` | Threshold for stale open pull requests |

## Data model

```text
data/
├── curated/
│   ├── communication.json
│   ├── people.json
│   ├── relations.json
│   ├── repository-overrides.json
│   └── rules.json
└── generated/
    ├── repositories.json
    └── settings.json
```

### Generated data

Generated files are owned by the collector:

- `data/generated/repositories.json`
- `data/generated/settings.json`

Do not manually curate these files except for seed fallback data before the first collector run.

### Curated data

Curated files are intentionally human-maintained. GitHub cannot reliably infer responsibility, expertise or team escalation paths.

- `people.json`: public roles, expertise and ask-for topics.
- `communication.json`: channels and their correct use.
- `rules.json`: contribution, governance and lifecycle rules or links.
- `relations.json`: semantic relation edges for the graph.
- `repository-overrides.json`: repository purpose, lifecycle, audience and domain contacts.

## GitHub token permissions

For public repositories, a standard token can collect most metadata. More sensitive organization/repository settings may require elevated permissions.

The collector handles unavailable branch-protection/settings endpoints as `null`. The dashboard must show `unknown`, not pretend that missing API permissions mean a feature is disabled.

## Publish with GitHub Pages

Use the included workflow in `.github/workflows/update-dashboard.yml`.

Recommended repository settings:

- Pages source: GitHub Actions.
- Secret: `DASHBOARD_GITHUB_TOKEN` with the least privileges needed for the desired settings depth.
- Schedule: nightly is enough.

## Maintenance principle

Generated facts should be refreshed automatically. Human responsibility data should be reviewed in normal PRs. Never invent maintainership from commit history alone.
