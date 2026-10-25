import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const electronExecutable = require('electron');
let viteServer;
let electronProcess;
let shuttingDown = false;

async function stop() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (electronProcess && !electronProcess.killed) electronProcess.kill('SIGTERM');
  if (viteServer) await viteServer.close();
}

try {
  viteServer = await createServer({
    configFile: resolve('vite.config.ts'),
    server: { host: '127.0.0.1', port: 5173, strictPort: true, open: false },
  });
  await viteServer.listen();
  const url = 'http://127.0.0.1:5173/?cutline-desktop=1#/desktop-home';
  console.log(`Cutline desktop development window → ${url}`);
  electronProcess = spawn(electronExecutable, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, CUTLINE_DEV_URL: url },
  });
  electronProcess.on('error', error => {
    console.error('Could not start Electron. Run npm install first.', error);
    process.exitCode = 1;
    void stop();
  });
  electronProcess.on('exit', code => {
    process.exitCode = code ?? 0;
    void stop();
  });
  process.on('SIGINT', () => { void stop(); });
  process.on('SIGTERM', () => { void stop(); });
} catch (error) {
  console.error('Cutline desktop development setup failed:', error);
  await stop();
  process.exitCode = 1;
}
