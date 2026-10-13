'use strict';

// В демо нет файловой системы: загрузки отключены, поэтому достаточно заглушек.
module.exports = {
  existsSync: () => false,
  mkdirSync: () => undefined,
  writeFileSync: () => undefined,
  unlinkSync: () => undefined,
  renameSync: () => undefined,
};
