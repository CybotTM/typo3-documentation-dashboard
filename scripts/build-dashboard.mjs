import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function json(file) {
  return JSON.parse(await readFile(path.join(root, file), 'utf8'));
}

const data = {
  repositories: await json('data/generated/repositories.json'),
  settings: await json('data/generated/settings.json'),
  people: await json('data/curated/people.json'),
  communication: await json('data/curated/communication.json'),
  rules: await json('data/curated/rules.json'),
  relations: await json('data/curated/relations.json'),
  repositoryOverrides: await json('data/curated/repository-overrides.json')
};

const overridesByName = new Map(data.repositoryOverrides.map((entry) => [entry.name, entry]));
data.repositories = data.repositories.map((repo) => ({ ...repo, ...(overridesByName.get(repo.name) ?? {}) }));

const template = await readFile(path.join(root, 'src/index.html'), 'utf8');
if (!template.includes('__DASHBOARD_DATA_JSON__')) {
  throw new Error('Placeholder __DASHBOARD_DATA_JSON__ not found in src/index.html.');
}
// Escape every "<" as a JSON unicode escape so no "</script>" (in any casing),
// "<script" or "<!--" sequence in the data can break out of the inline <script>
// element. "<" only ever occurs inside JSON string literals, so "<" keeps the
// payload valid JSON that parses back to the original text. Use a function
// replacement so "$" sequences in the data are not treated as replace() patterns.
const payload = JSON.stringify(data).replaceAll('<', '\\u003c');
const html = template.replace('__DASHBOARD_DATA_JSON__', () => payload);
await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist/index.html'), html);
console.log('Built dist/index.html.');
