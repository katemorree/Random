// Simple JSON-file storage. Everything stays on your own computer in data/db.json.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const EMPTY = () => ({
  settings: { myName: '', style: 'Friendly, short and natural. Match the language of the conversation.' },
  conversations: [],
  drafts: [],
  outbox: [],
});

class Store {
  constructor(file) {
    this.file = file;
    this.data = EMPTY();
    if (file && fs.existsSync(file)) {
      this.data = { ...EMPTY(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    }
    // A draft that was "generating" when the app stopped will never finish.
    for (const d of this.data.drafts) {
      if (d.status === 'generating') {
        d.status = 'error';
        d.error = 'The app was restarted while this draft was being written. Tap Regenerate.';
      }
    }
  }

  save() {
    if (!this.file) return; // in-memory mode (tests)
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file); // atomic replace, so a crash can't corrupt the file
  }

  static id() {
    return crypto.randomUUID();
  }

  getConversation(id) {
    return this.data.conversations.find((c) => c.id === id) || null;
  }

  getDraft(id) {
    return this.data.drafts.find((d) => d.id === id) || null;
  }

  /** The draft currently waiting for a decision in a conversation (if any). */
  activeDraft(conversationId) {
    return (
      this.data.drafts.find(
        (d) => d.conversationId === conversationId && ['generating', 'pending', 'error'].includes(d.status),
      ) || null
    );
  }
}

module.exports = { Store };
