// The web server's request handling: API + dashboard files.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Store } = require('./store');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const STATIC_FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
};

const LIMITS = { name: 100, notes: 2000, text: 4000, instruction: 500, myName: 100, style: 1000 };

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function str(value, field, { required = false } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text`);
  const v = value.trim();
  if (required && !v) throw new HttpError(400, `${field} is required`);
  if (v.length > LIMITS[field]) throw new HttpError(400, `${field} is too long (max ${LIMITS[field]} characters)`);
  return v;
}

function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 64 * 1024) {
        reject(new HttpError(413, 'Request too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(body && typeof body === 'object' ? body : {});
      } catch {
        reject(new HttpError(400, 'Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function createApp({ store = new Store(null), provider, sender, accessToken = '', allowAnyHost = false }) {
  // One draft at a time, so a burst of taps can't flood your Claude usage limits.
  let queue = Promise.resolve();

  const now = () => new Date().toISOString();
  const lastMessageId = (c) => (c.messages.length ? c.messages[c.messages.length - 1].id : null);

  function conversationView(c) {
    const draft = store.activeDraft(c.id);
    return {
      ...c,
      draft: draft && { ...draft, stale: draft.basedOnMessageId !== lastMessageId(c) },
    };
  }

  function state() {
    return {
      settings: store.data.settings,
      conversations: store.data.conversations
        .map(conversationView)
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')),
      outbox: store.data.outbox.slice(-50).reverse(),
      provider: provider.name,
      sender: sender.name,
    };
  }

  function mustConversation(id) {
    const c = store.getConversation(id);
    if (!c) throw new HttpError(404, 'Conversation not found');
    return c;
  }

  function mustDraft(id) {
    const d = store.getDraft(id);
    if (!d) throw new HttpError(404, 'Draft not found');
    return d;
  }

  function startDraft(c, instruction) {
    if (!c.messages.some((m) => m.from === 'them')) {
      throw new HttpError(400, 'Add at least one message from them first.');
    }
    const existing = store.activeDraft(c.id);
    if (existing && existing.status === 'generating') throw new HttpError(409, 'A draft is already being written.');
    let previousDraft = '';
    if (existing) {
      existing.status = 'superseded';
      previousDraft = existing.text || '';
    }
    const draft = {
      id: Store.id(),
      conversationId: c.id,
      status: 'generating',
      text: '',
      originalText: '',
      instruction,
      basedOnMessageId: lastMessageId(c),
      createdAt: now(),
    };
    store.data.drafts.push(draft);
    store.save();

    const ctx = {
      settings: store.data.settings,
      conversation: JSON.parse(JSON.stringify(c)),
      instruction,
      previousDraft,
    };
    queue = queue
      .then(() => provider.generate(ctx))
      .then((text) => {
        if (draft.status !== 'generating') return; // rejected while generating
        if (!text) throw new Error('Claude returned an empty draft. Tap Regenerate.');
        draft.text = text.slice(0, LIMITS.text);
        draft.originalText = draft.text;
        draft.status = 'pending';
      })
      .catch((err) => {
        if (draft.status !== 'generating') return;
        draft.status = 'error';
        draft.error = String(err.message || err).slice(0, 500);
      })
      .finally(() => store.save());
    return draft;
  }

  async function api(req, url, send) {
    const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
    const m = req.method;

    if (m === 'GET' && parts[0] === 'state') return send(200, state());
    if (m === 'GET' && parts[0] === 'status') {
      return send(200, { provider: provider.name, sender: sender.name, auth: await provider.checkAuth({ force: url.searchParams.has('refresh') }) });
    }

    const body = m === 'GET' ? {} : await readJson(req);

    if (m === 'PUT' && parts[0] === 'settings') {
      store.data.settings = { myName: str(body.myName, 'myName'), style: str(body.style, 'style') };
      store.save();
      return send(200, state());
    }

    if (parts[0] === 'conversations') {
      if (m === 'POST' && parts.length === 1) {
        const c = {
          id: Store.id(),
          name: str(body.name, 'name', { required: true }),
          notes: str(body.notes, 'notes'),
          messages: [],
          createdAt: now(),
          updatedAt: now(),
        };
        store.data.conversations.push(c);
        store.save();
        return send(201, { id: c.id, state: state() });
      }
      const c = mustConversation(parts[1]);
      if (m === 'PUT' && parts.length === 2) {
        c.name = str(body.name, 'name', { required: true });
        c.notes = str(body.notes, 'notes');
        store.save();
        return send(200, state());
      }
      if (m === 'DELETE' && parts.length === 2) {
        store.data.conversations = store.data.conversations.filter((x) => x.id !== c.id);
        store.data.drafts = store.data.drafts.filter((d) => d.conversationId !== c.id);
        store.save();
        return send(200, state());
      }
      if (m === 'POST' && parts[2] === 'messages') {
        const from = body.from === 'me' ? 'me' : 'them';
        c.messages.push({ id: Store.id(), from, text: str(body.text, 'text', { required: true }), at: now() });
        c.updatedAt = now();
        store.save();
        return send(201, state());
      }
      if (m === 'POST' && parts[2] === 'drafts') {
        startDraft(c, str(body.instruction, 'instruction'));
        return send(202, state());
      }
    }

    if (parts[0] === 'drafts' && parts[1]) {
      const d = mustDraft(parts[1]);
      if (m === 'PUT' && parts.length === 2) {
        if (d.status !== 'pending') throw new HttpError(409, 'This draft can no longer be edited.');
        d.text = str(body.text, 'text', { required: true });
        d.edited = d.text !== d.originalText;
        store.save();
        return send(200, state());
      }
      if (m === 'POST' && parts[2] === 'reject') {
        if (!['pending', 'error', 'generating'].includes(d.status)) throw new HttpError(409, 'This draft is already closed.');
        d.status = 'rejected';
        d.closedAt = now();
        store.save();
        return send(200, state());
      }
      if (m === 'POST' && parts[2] === 'approve') {
        // The ONLY path that sends anything. It needs an explicit confirmation
        // from you, and sends exactly the text you confirmed.
        if (body.confirmed !== true) throw new HttpError(400, 'Approval must be confirmed.');
        if (d.status !== 'pending') throw new HttpError(409, 'This draft is not waiting for approval (maybe it was already sent).');
        const text = str(body.text, 'text', { required: true });
        const c = mustConversation(d.conversationId);
        d.status = 'sending'; // blocks double-taps from sending twice
        try {
          const result = await sender.send({ to: c.name, text });
          if (!result || !result.ok) throw new Error('Send failed');
          d.text = text;
          d.edited = text !== d.originalText;
          d.status = 'sent';
          d.closedAt = now();
          c.messages.push({ id: Store.id(), from: 'me', text, at: now(), simulated: !!result.simulated });
          c.updatedAt = now();
          store.data.outbox.push({ id: Store.id(), conversationId: c.id, to: c.name, text, at: now(), simulated: !!result.simulated });
        } catch (err) {
          d.status = 'pending';
          throw new HttpError(502, `Could not send: ${err.message}`);
        } finally {
          store.save();
        }
        return send(200, state());
      }
    }

    throw new HttpError(404, 'Not found');
  }

  return async function handle(req, res) {
    const send = (status, data, headers = {}) => {
      res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...headers });
      res.end(JSON.stringify(data));
    };
    try {
      const host = req.headers.host || '';
      const url = new URL(req.url, `http://${host || 'localhost'}`);

      // Block "DNS rebinding" attacks: only answer to localhost unless you
      // deliberately opened the app to your network (with a password).
      if (!allowAnyHost && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
        throw new HttpError(403, 'Forbidden host');
      }

      if (url.pathname.startsWith('/api/')) {
        if (accessToken) {
          const auth = req.headers.authorization || '';
          if (!auth.startsWith('Bearer ') || !safeEqual(auth.slice(7), accessToken)) {
            throw new HttpError(401, 'Wrong or missing access password');
          }
        }
        if (req.method !== 'GET') {
          // Stops other websites you visit from secretly pressing buttons here.
          if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'JSON required');
          const origin = req.headers.origin;
          if (origin && origin !== `http://${host}` && origin !== `https://${host}`) throw new HttpError(403, 'Cross-site request blocked');
        }
        return await api(req, url, send);
      }

      const file = req.method === 'GET' && STATIC_FILES[url.pathname];
      if (!file) throw new HttpError(404, 'Not found');
      const content = fs.readFileSync(path.join(PUBLIC_DIR, file[0]));
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': file[1] });
      res.end(content);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      send(status, { error: status === 500 ? 'Something went wrong on the server.' : err.message });
    }
  };
}

module.exports = { createApp, HttpError };
