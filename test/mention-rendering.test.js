import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('relation and search surfaces render stored mentions through MentionText', () => {
  const resources = read('src/pages/resources.jsx');
  const misc = read('src/pages/misc.jsx');
  const assistant = read('src/components/assistant.jsx');
  const workspace = read('src/pages/workspace.jsx');

  assert.match(resources, /activeTab === 'issues'[\s\S]*?<MentionText text=\{titleOf\(item\)\}/);
  assert.match(resources, /function CompactList[\s\S]*?<MentionText text=\{titleOf\(item\)\} onNavigate=\{mentionNavigate\}/);
  assert.match(misc, /<MentionText text=\{titleOf\(item\)\}/);
  assert.match(misc, /<MentionText text=\{item\.description\}/);
  assert.match(assistant, /group === 'issues'[\s\S]*?<MentionText text=\{titleOf\(item\)\}/);
  assert.match(workspace, /item\.description \? <MentionText text=\{item\.description\}/);
});
