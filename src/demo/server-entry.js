// Точка входа браузерного бэкенда: серверный Garden без изменений.
// Собирается scripts/build-demo.mjs с подменой node-модулей (см. src/demo/shims).
export { app } from '../../server/index.js';
