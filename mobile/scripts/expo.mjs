import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expoCli = path.join(projectDirectory, 'node_modules', 'expo', 'bin', 'cli');
const child = spawn(
  process.execPath,
  [expoCli, ...process.argv.slice(2)],
  {
    cwd: projectDirectory,
    env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
    stdio: 'inherit',
  },
);

child.on('error', (error) => {
  process.stderr.write(`Could not start Expo CLI: ${error.message}\n`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.stderr.write(`Expo CLI stopped after signal ${signal}.\n`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
