// Start the app:  npm start        (uses Claude Code with your subscription)
//                 npm run demo     (fake drafts, no AI)
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

// Read optional settings from a .env file (KEY=value per line).
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { Store } = require('./src/store');
const { createApp } = require('./src/app');
const { createProvider } = require('./src/ai');
const { simulatedSender } = require('./src/sender');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || '';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const isLocalOnly = ['127.0.0.1', 'localhost', '::1'].includes(HOST);

if (!isLocalOnly && ACCESS_PASSWORD.length < 12) {
  console.error(
    `\nRefusing to start: HOST=${HOST} makes the dashboard reachable from other devices.\n` +
      'Set ACCESS_PASSWORD to a long random password (at least 12 characters) first. See README.\n',
  );
  process.exit(1);
}

const store = new Store(path.join(DATA_DIR, 'db.json'));
const provider = createProvider(process.env.AI_PROVIDER || 'claude', { workDir: path.join(DATA_DIR, 'claude-workdir') });
const sender = simulatedSender();
const handler = createApp({ store, provider, sender, accessToken: ACCESS_PASSWORD, allowAnyHost: !isLocalOnly });

http.createServer(handler).listen(PORT, HOST, async () => {
  console.log('\nWhatsApp Reply Assistant is running');
  console.log(`  On this computer:  http://localhost:${PORT}`);
  if (!isLocalOnly) {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const a of list || []) {
        if (a.family === 'IPv4' && !a.internal) console.log(`  On your iPad/phone (same Wi-Fi): http://${a.address}:${PORT}`);
      }
    }
  }
  console.log(`  AI drafts: ${provider.name}   Sending: ${sender.name} (nothing is really sent)`);
  const auth = await provider.checkAuth();
  console.log(auth.ok ? `  Claude sign-in: OK (${auth.method})\n` : `  Claude sign-in problem: ${auth.reason}\n`);
});
