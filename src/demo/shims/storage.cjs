'use strict';

// server/storage.js ищет рабочий стол и создаёт папки на диске — в браузере не нужно.
module.exports = { DATA_DIR: '/garden-demo', UPLOADS_DIR: '/garden-demo/uploads', resolveDesktopDir: () => '/' };
