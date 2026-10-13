'use strict';

// Заполняет только совершенно пустую базу актуальными данными Garden.
const seed = require('./seed-data');
const { latestPublicKey } = require('./entity-keys');

const COLLECTIONS = [
  'people','projects','labs','tasks','issues','meetings','journal','goals','agreements',
  'tools','processes','vacations','kbFolders','kbDocs','docFolders','toolFolders',
  'checkins',
];

const PUBLIC_KEY_SPECS = {
  issues: ['issueKey', 'ISSUE'],
  meetings: ['meetingKey', 'MEET'],
  journal: ['noteKey', 'NOTE'],
  goals: ['goalKey', 'GOAL'],
  agreements: ['agreementKey', 'AGREE'],
  tools: ['toolKey', 'TOOL'],
  processes: ['processKey', 'PROCESS'],
};

function seedPublicKeyCursors(db) {
  for (const [collection, [field, prefix]] of Object.entries(PUBLIC_KEY_SPECS)) {
    const last = latestPublicKey(db[collection].all(), { prefix, readKey: (item) => item[field] });
    if (last) db.meta.set(`public-key-sequence:${prefix}`, last);
  }

  const labs = db.labs.all();
  const lastIdea = latestPublicKey(labs.filter((item) => item.entityType === 'idea'), {
    prefix: 'IDEA', readKey: (item) => item.ideaKey,
  });
  const lastBlueprint = latestPublicKey(labs.filter((item) => item.entityType !== 'idea'), {
    prefix: 'BLUEPRINT', readKey: (item) => item.blueprintKey,
  });
  if (lastIdea) db.meta.set('public-key-sequence:IDEA', lastIdea);
  if (lastBlueprint) db.meta.set('public-key-sequence:BLUEPRINT', lastBlueprint);
}

function seedIfEmpty(db) {
  if (!db.isEmpty()) return false;
  for (const name of COLLECTIONS) {
    for (const item of seed[name] || []) db[name].create(item);
  }
  seedPublicKeyCursors(db);
  return true;
}

module.exports = { seedIfEmpty, seedPublicKeyCursors };
