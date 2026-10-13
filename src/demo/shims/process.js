// Подставляется esbuild-ом вместо глобального process в серверном бандле.
export const process = {
  env: {},
  platform: 'browser',
  argv: [],
  exitCode: 0,
  cwd: () => '/',
};
