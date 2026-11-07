// Sending messages.
//
// Right now there is ONLY a simulated sender: "sending" just records the message
// in your local outbox. Nothing leaves your computer and nothing reaches WhatsApp.
// Read docs/WHATSAPP-RISKS.md before ever replacing this.
'use strict';

function simulatedSender() {
  return {
    name: 'simulated',
    async send({ to, text }) {
      return { ok: true, simulated: true, to, text, at: new Date().toISOString() };
    },
  };
}

module.exports = { simulatedSender };
