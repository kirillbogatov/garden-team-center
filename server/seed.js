// Заполняет только совершенно пустую базу актуальными данными Garden.
const seed = require('./seed-data');

const COLLECTIONS = [
  'people','projects','labs','tasks','issues','meetings','journal','goals','agreements',
  'documents','tools','processes','vacations','kbFolders','kbDocs','docFolders','toolFolders',
  'checkins',
];

function seedIfEmpty(db) {
  if (!db.isEmpty()) return false;
  for (const name of COLLECTIONS) {
    for (const item of seed[name] || []) db[name].create(item);
  }
  return true;
}

module.exports = { seedIfEmpty };
