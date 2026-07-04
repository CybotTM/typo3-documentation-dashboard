# Curated data maintenance

Generated data can answer “what does GitHub currently report?”. It cannot safely answer “who is responsible?” or “which channel should I use?”. These parts stay curated.

## Review cadence

Recommended cadence:

- people/roles: quarterly or after team changes
- repository ownership: whenever a new repository is added or ownership changes
- communication channels: whenever public team onboarding changes
- rules: whenever contribution/publishing/governance workflows change
- relations: whenever publishing/source-of-truth relations change

## Evidence levels

Use this order when adding responsibility data:

1. explicit team confirmation
2. CODEOWNERS
3. repository README/CONTRIBUTING maintainer section
4. public TYPO3 team page
5. unknown/TBD

Do not use commit history as ownership proof.

## Pull request checklist

For curated data PRs:

- [ ] `npm run validate` passes
- [ ] `npm run build:offline` passes
- [ ] every new person has `source` and `confidence`
- [ ] every new domain contact points to an existing `people.json` id
- [ ] unknown information is marked as `TBD`, `unknown`, or `needs-canonical-url`
- [ ] no generated GitHub facts were pasted into curated files
