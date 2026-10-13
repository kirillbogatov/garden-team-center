// Упаковывает настоящий серверный код Garden (server/index.js) в браузерный ESM:
// node:sqlite → sql.js, express → мини-роутер, fs/path/crypto → заглушки.
// Используется scripts/build-demo.mjs и test/demo-shim.test.js.

import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shim = (name) => path.join(root, 'src/demo/shims', name);

const MODULE_SHIMS = {
  'node:sqlite': shim('node-sqlite.cjs'),
  express: shim('express.cjs'),
  fs: shim('fs.cjs'),
  path: shim('path.cjs'),
  crypto: shim('crypto.cjs'),
  async_hooks: shim('async-hooks.cjs'),
};

// Файлы самого сервера, которые в браузере заменяются целиком.
const FILE_SHIMS = new Map([
  [path.join(root, 'server/storage.js'), shim('storage.cjs')],
  [path.join(root, 'server/seed.js'), shim('seed.cjs')],
]);

const demoServerPlugin = {
  name: 'garden-demo-server',
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      const bare = args.path.replace(/^node:/, '');
      if (MODULE_SHIMS[args.path]) return { path: MODULE_SHIMS[args.path] };
      if (args.path.startsWith('node:') && MODULE_SHIMS[bare]) return { path: MODULE_SHIMS[bare] };
      if (args.kind === 'entry-point' || !args.path.startsWith('.')) return undefined;
      const resolved = path.resolve(args.resolveDir, args.path);
      for (const [file, replacement] of FILE_SHIMS) {
        if (resolved === file || resolved === file.replace(/\.js$/, '')) return { path: replacement };
      }
      return undefined;
    });
  },
};

export function buildDemoServer({ outfile, logLevel = 'info', minify = false }) {
  return build({
    entryPoints: [path.join(root, 'src/demo/server-entry.js')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    logLevel,
    minify,
    plugins: [demoServerPlugin],
    inject: [shim('process.js'), shim('buffer.js')],
    define: { __dirname: '"/"', 'require.main': 'undefined' },
  });
}
