// Сборка демо для GitHub Pages: `npm run build:demo` → dist-demo/.
//
// 1. Серверный код Garden упаковывается в браузерный бандл (build-demo-server.mjs).
// 2. Vite собирает клиент в режиме demo и подключает этот бандл как '@demo-server'.

import { build as viteBuild } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoServer } from './build-demo-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await buildDemoServer({ outfile: path.join(root, '.demo-build/server-bundle.js') });

// Любое изменение сборки инвалидирует сохранённое у посетителей состояние демо.
process.env.VITE_DEMO = '1';
process.env.VITE_DEMO_BUILD_ID = Date.now().toString(36);

await viteBuild({ root, mode: 'demo', configFile: path.join(root, 'vite.config.js') });

// Фото демо-сотрудников отдаются самим Pages: внешние сайты блокируют показ своих картинок на чужих страницах.
fs.cpSync(path.join(root, 'server/demo-photos'), path.join(root, 'dist-demo/demo-photos'), { recursive: true });
