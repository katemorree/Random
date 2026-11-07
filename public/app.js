'use strict';

// ---------- tiny helpers ----------
const $ = (id) => document.getElementById(id);

/** Create an element. Text is always set with textContent (safe against injected HTML). */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const timeFmt = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

let state = null;
let selectedId = null;
let editing = false; // true while you're editing a draft, so polling won't overwrite your typing
let pollTimer = null;
let token = '';
try { token = localStorage.getItem('accessPassword') || ''; } catch { /* private mode */ }

// ---------- API ----------
async function api(method, url, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    askPassword();
    throw new Error(data.error || 'Password needed');
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function showStatus(text, isError = false) {
  const bar = $('statusBar');
  bar.textContent = text || '';
  bar.classList.toggle('error', isError);
  bar.hidden = !text;
}

async function act(fn) {
  try {
    const result = await fn();
    if (result && result.conversations) setState(result);
    else if (result && result.state) setState(result.state);
    return result;
  } catch (err) {
    showStatus(err.message, true);
    return null;
  }
}

function setState(next) {
  state = next;
  render();
  schedulePoll();
}

function schedulePoll() {
  clearTimeout(pollTimer);
  const busy = state.conversations.some((c) => c.draft && c.draft.status === 'generating');
  pollTimer = setTimeout(refresh, busy ? 1500 : 20000);
}

async function refresh() {
  try {
    setState(await api('GET', '/api/state'));
  } catch {
    schedulePoll();
  }
}

// ---------- rendering ----------
function current() {
  return state && state.conversations.find((c) => c.id === selectedId);
}

function render() {
  const c = current();
  const mobile = !window.matchMedia('(min-width: 820px)').matches;
  $('listView').hidden = mobile && !!c;
  $('chatView').hidden = !c;
  $('backBtn').hidden = !c;
  $('title').textContent = c ? c.name : 'Reply Assistant';
  renderList();
  if (c) renderChat(c);
}

function renderList() {
  const list = $('contactList');
  list.replaceChildren(
    ...state.conversations.map((c) => {
      const last = c.messages[c.messages.length - 1];
      let pill = null;
      if (c.draft?.status === 'pending') pill = h('span', { class: 'pill' }, 'Draft ready');
      else if (c.draft?.status === 'generating') pill = h('span', { class: 'pill' }, 'Writing…');
      else if (last && last.from === 'them') pill = h('span', { class: 'pill' }, 'Needs reply');
      return h('li', {},
        h('button', { type: 'button', 'aria-current': c.id === selectedId ? 'true' : 'false', onclick: () => select(c.id) },
          h('span', { class: 'name' }, h('span', {}, c.name), pill),
          h('span', { class: 'snippet' }, last ? `${last.from === 'me' ? 'You: ' : ''}${last.text}` : 'No messages yet'),
        ),
      );
    }),
  );
  $('emptyList').hidden = state.conversations.length > 0;
}

let lastRenderedChat = null;

function renderChat(c) {
  if (lastRenderedChat !== c.id) {
    $('cName').value = c.name;
    $('cNotes').value = c.notes || '';
    lastRenderedChat = c.id;
  }
  $('thread').replaceChildren(
    ...c.messages.map((m) =>
      h('li', { class: `bubble ${m.from === 'me' ? 'me' : ''}` },
        m.text,
        h('span', { class: 'meta' }, `${m.from === 'me' ? 'You' : c.name} · ${timeFmt(m.at)}${m.simulated ? ' · simulated send' : ''}`),
      ),
    ),
  );
  if (!c.messages.length) {
    $('thread').append(h('li', { class: 'muted center' }, `Paste a message ${c.name} sent you below.`));
  }
  if (!editing) renderDraft(c);
}

function renderDraft(c) {
  const area = $('draftArea');
  const d = c.draft;
  const needsReply = c.messages.some((m) => m.from === 'them');

  if (!d) {
    area.replaceChildren(
      needsReply
        ? h('div', { class: 'row end draft-start' }, h('button', { class: 'btn primary', type: 'button', onclick: () => generate(c) }, '✨ Draft a reply'))
        : '',
    );
    return;
  }

  const instruction = h('input', { maxlength: 500, placeholder: 'Optional: e.g. shorter, warmer, say no politely', 'aria-label': 'Instruction for the next version' });
  const regen = () => generate(c, instruction.value);
  instruction.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); regen(); } });

  if (d.status === 'generating') {
    area.replaceChildren(
      h('section', { class: 'card draft', 'aria-busy': 'true' },
        h('h2', {}, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Claude is writing a draft…'),
        h('div', { class: 'row end' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => reject(d) }, 'Cancel')),
      ),
    );
    return;
  }

  if (d.status === 'error') {
    area.replaceChildren(
      h('section', { class: 'card draft' },
        h('h2', {}, 'Could not write a draft'),
        h('p', { class: 'error-text' }, d.error || 'Unknown error'),
        instruction,
        h('div', { class: 'actions' },
          h('button', { class: 'btn primary wide', type: 'button', onclick: regen }, '↻ Regenerate'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => reject(d) }, 'Dismiss'),
        ),
      ),
    );
    return;
  }

  // pending
  area.replaceChildren(
    h('section', { class: 'card draft', 'aria-label': 'Draft reply' },
      h('h2', {}, 'Draft reply', d.edited ? h('span', { class: 'pill' }, 'Edited by you') : null),
      h('p', { class: 'text' }, d.text),
      d.stale ? h('p', { class: 'warn' }, 'A new message was added after this draft was written. Consider Regenerate.') : null,
      /\[[^\]]+\]/.test(d.text) ? h('p', { class: 'warn' }, 'This draft has [placeholders?]. Edit them before sending.') : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary wide', type: 'button', onclick: () => confirmSend(c, d, d.text) }, '✓ Approve'),
        h('button', { class: 'btn', type: 'button', onclick: () => startEdit(c, d) }, '✎ Edit'),
        h('button', { class: 'btn', type: 'button', onclick: regen }, '↻ Regenerate'),
        h('button', { class: 'btn danger wide', type: 'button', onclick: () => reject(d) }, '✕ Reject'),
      ),
      h('label', {}, 'Instruction for Regenerate'),
      instruction,
    ),
  );
}

function startEdit(c, d) {
  editing = true;
  const box = h('textarea', { rows: 5, maxlength: 4000, 'aria-label': 'Edit draft' });
  box.value = d.text;
  const done = () => { editing = false; renderDraft(current() || c); };
  $('draftArea').replaceChildren(
    h('section', { class: 'card draft' },
      h('h2', {}, 'Edit draft'),
      box,
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary wide', type: 'button', onclick: async () => {
          const text = box.value.trim();
          if (!text) return;
          const ok = await act(() => api('PUT', `/api/drafts/${d.id}`, { text }));
          if (ok) { editing = false; confirmSend(c, d, text); }
        } }, '✓ Save & approve'),
        h('button', { class: 'btn', type: 'button', onclick: async () => {
          const text = box.value.trim();
          if (!text) return;
          editing = false;
          await act(() => api('PUT', `/api/drafts/${d.id}`, { text }));
        } }, 'Save'),
        h('button', { class: 'btn ghost', type: 'button', onclick: done }, 'Cancel'),
      ),
    ),
  );
  box.focus();
}

// ---------- actions ----------
function select(id) {
  selectedId = id;
  editing = false;
  showStatus('');
  render();
  window.scrollTo(0, 0);
}

async function generate(c, instruction = '') {
  showStatus('');
  editing = false;
  await act(() => api('POST', `/api/conversations/${c.id}/drafts`, { instruction }));
}

async function reject(d) {
  editing = false;
  await act(() => api('POST', `/api/drafts/${d.id}/reject`, {}));
}

/** Nothing is sent until you confirm in this dialog. */
function confirmSend(c, d, text) {
  const dlg = $('confirmDialog');
  $('confirmTo').textContent = `To: ${c.name}`;
  $('confirmText').textContent = text;
  dlg.returnValue = '';
  dlg.onclose = async () => {
    if (dlg.returnValue !== 'send') { render(); return; }
    const ok = await act(() => api('POST', `/api/drafts/${d.id}/approve`, { confirmed: true, text }));
    if (ok) showStatus('Approved. Recorded in the sent log (simulated, nothing was sent to WhatsApp).');
  };
  dlg.showModal();
}

function askPassword() {
  const dlg = $('loginDialog');
  if (dlg.open) return;
  dlg.onclose = () => {
    token = $('loginPassword').value;
    try { localStorage.setItem('accessPassword', token); } catch { /* ignore */ }
    refresh();
  };
  dlg.showModal();
}

async function loadAuth(force) {
  $('authInfo').textContent = 'Checking…';
  try {
    const s = await api('GET', `/api/status${force ? '?refresh=1' : ''}`);
    $('authInfo').textContent = s.auth.ok
      ? `Connected: ${s.provider} (${s.auth.method}). Drafts use your own Claude subscription limits.`
      : `Not ready: ${s.auth.reason}`;
    if (!s.auth.ok) showStatus(`Claude is not ready: ${s.auth.reason}`, true);
  } catch (err) {
    $('authInfo').textContent = err.message;
  }
}

// ---------- wire up the page ----------
$('newContactForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('newName').value.trim();
  if (!name) return;
  const res = await act(() => api('POST', '/api/conversations', { name, notes: '' }));
  if (res) { $('newName').value = ''; select(res.id); }
});

$('contactForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const c = current();
  if (!c) return;
  await act(() => api('PUT', `/api/conversations/${c.id}`, { name: $('cName').value, notes: $('cNotes').value }));
  e.target.closest('details').open = false;
  lastRenderedChat = null;
});

$('deleteContact').addEventListener('click', async () => {
  const c = current();
  if (!c || !window.confirm(`Delete ${c.name} and all their messages from this app?`)) return;
  selectedId = null;
  await act(() => api('DELETE', `/api/conversations/${c.id}`));
});

$('messageForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const c = current();
  const text = $('msgText').value.trim();
  if (!c || !text) return;
  const from = new FormData(e.target).get('from');
  const res = await act(() => api('POST', `/api/conversations/${c.id}/messages`, { text, from }));
  if (res) $('msgText').value = '';
});

$('backBtn').addEventListener('click', () => { selectedId = null; editing = false; render(); });

$('settingsBtn').addEventListener('click', () => {
  $('sName').value = state.settings.myName || '';
  $('sStyle').value = state.settings.style || '';
  $('settingsDialog').showModal();
  loadAuth(false);
});
$('recheckAuth').addEventListener('click', () => loadAuth(true));
$('settingsDialog').addEventListener('close', () => {
  if ($('settingsDialog').returnValue === 'save') {
    act(() => api('PUT', '/api/settings', { myName: $('sName').value, style: $('sStyle').value }));
  }
});

$('outboxBtn').addEventListener('click', () => {
  $('outboxList').replaceChildren(
    ...(state.outbox.length
      ? state.outbox.map((o) => h('li', {}, h('small', {}, `To ${o.to} · ${new Date(o.at).toLocaleString()} · ${o.simulated ? 'simulated' : 'sent'}`), o.text))
      : [h('li', { class: 'muted' }, 'Nothing approved yet.')]),
  );
  $('outboxDialog').showModal();
});

window.matchMedia('(min-width: 820px)').addEventListener('change', () => state && render());

refresh().then(() => loadAuth(false));
