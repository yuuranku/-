import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const child = spawn(process.execPath, [vite, '--host', '127.0.0.1', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_PALIS_LOCAL_ADMIN: '1',
  },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
