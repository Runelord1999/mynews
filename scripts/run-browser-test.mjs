// Serves the reader on a fixed port and runs the browser test against it, so
// `npm test` covers the parts only a real page can prove: which requests a
// disabled service stops making, and what the cache does on reload.
import {spawn} from 'node:child_process';

const port = Number(process.env.MYNEWS_TEST_PORT || 5180);
const base = `http://127.0.0.1:${port}/mynews/`;
const windows = process.platform === 'win32';

const server = spawn('npx', ['vite', '--config', 'vite.pages.config.ts', '--port', String(port), '--strictPort'], {stdio: ['ignore', 'pipe', 'pipe'], shell: windows});
let serverOutput = '';
server.stdout.on('data', d => {serverOutput += d;});
server.stderr.on('data', d => {serverOutput += d;});

function stop() {
 if (server.exitCode === null) {
  // Vite spawns a child of its own on Windows, so kill the tree there.
  if (windows) spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], {stdio: 'ignore'});
  else server.kill('SIGTERM');
 }
}
process.on('exit', stop);
process.on('SIGINT', () => {stop(); process.exit(130);});

async function waitForServer(timeoutMs = 60000) {
 const deadline = Date.now() + timeoutMs;
 while (Date.now() < deadline) {
  if (server.exitCode !== null) throw Error('The dev server exited before it was ready:\n' + serverOutput);
  try {
   const response = await fetch(base, {signal: AbortSignal.timeout(2000)});
   if (response.ok) return;
  } catch {/* not listening yet */}
  await new Promise(resolve => setTimeout(resolve, 250));
 }
 throw Error(`The dev server did not answer on ${base} within ${timeoutMs / 1000}s:\n` + serverOutput);
}

try {
 await waitForServer();
} catch (error) {
 stop();
 console.error(error.message);
 process.exit(1);
}

const test = spawn(process.execPath, ['scripts/test-disabled-sources.mjs'], {stdio: 'inherit', env: {...process.env, MYNEWS_TEST_URL: base}});
test.on('exit', code => {stop(); process.exit(code ?? 1);});
