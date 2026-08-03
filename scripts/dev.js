const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const serverFile = path.join(root, 'server', 'server.js');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const viteConfig = path.join(root, 'client', 'vite.config.mjs');

const server = spawn(process.execPath, [serverFile], { stdio: 'inherit' });
const vite = spawn(process.execPath, [viteBin, '--config', viteConfig], { stdio: 'inherit' });

function shutdown() {
  server.kill();
  vite.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
