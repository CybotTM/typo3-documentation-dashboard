import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const files = [
  'data/curated/people.json',
  'data/curated/communication.json',
  'data/curated/rules.json',
  'data/curated/relations.json',
  'data/curated/repository-overrides.json',
  'data/curated/pipeline.json',
  'data/generated/repositories.json'
];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

async function loadJson(file) {
  const text = await readFile(path.join(root, file), 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${file} is not valid JSON: ${error.message}`);
    return null;
  }
}

const data = new Map();
for (const file of files) data.set(file, await loadJson(file));

const people = data.get('data/curated/people.json') ?? [];
const personIds = new Set();
for (const person of people) {
  if (!person.id) fail('Each person requires id.');
  if (!person.name) fail(`Person ${person.id ?? '(unknown)'} requires name.`);
  if (personIds.has(person.id)) fail(`Duplicate person id: ${person.id}`);
  personIds.add(person.id);
  if (!Array.isArray(person.expertise)) fail(`Person ${person.id} requires expertise array.`);
  if (!Array.isArray(person.askFor)) fail(`Person ${person.id} requires askFor array.`);
  if (!person.confidence) fail(`Person ${person.id} requires confidence.`);
}

const overrides = data.get('data/curated/repository-overrides.json') ?? [];
const repoNames = new Set();
for (const repo of overrides) {
  if (!repo.name) fail('Each repository override requires name.');
  if (repoNames.has(repo.name)) fail(`Duplicate repository override: ${repo.name}`);
  repoNames.add(repo.name);
  if (!repo.category) fail(`Repository override ${repo.name} requires category.`);
  if (!repo.purpose) fail(`Repository override ${repo.name} requires purpose.`);
  for (const id of repo.domainContacts ?? []) {
    if (!personIds.has(id)) fail(`Repository ${repo.name} references unknown person id: ${id}`);
  }
}

const relations = data.get('data/curated/relations.json') ?? [];
for (const relation of relations) {
  if (!relation.from || !relation.to || !relation.type) {
    fail(`Relation requires from/to/type: ${JSON.stringify(relation)}`);
  }
}

const pipeline = data.get('data/curated/pipeline.json') ?? {};
for (const key of ['docsService', 'searchService', 'renderTool', 'deployTool', 'indexTool', 'apiPipeline']) {
  if (!pipeline[key]) fail(`pipeline.json requires ${key}.`);
}
for (const key of ['source', 'tool', 'service']) {
  if (!pipeline.apiPipeline?.[key]) fail(`pipeline.json apiPipeline requires ${key}.`);
}
for (const [group, map] of [['serviceContacts', pipeline.serviceContacts], ['toolContacts', pipeline.toolContacts]]) {
  for (const ids of Object.values(map ?? {})) {
    for (const id of ids) {
      if (!personIds.has(id)) fail(`pipeline.json ${group} references unknown person id: ${id}`);
    }
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log('Curated data validation passed.');
