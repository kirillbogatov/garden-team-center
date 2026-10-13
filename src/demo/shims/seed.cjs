'use strict';

// Основной workspace в демо не нужен: демо-данные кладёт POST /api/auth/demo.
module.exports = { seedIfEmpty: () => false, seedPublicKeyCursors: () => undefined };
