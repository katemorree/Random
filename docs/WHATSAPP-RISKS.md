# Before connecting WhatsApp: the risks

The app does **not** connect to WhatsApp yet. Read this first.

## Option A — Unofficial WhatsApp Web libraries (Baileys, whatsapp-web.js, etc.)

These pretend to be a WhatsApp Web browser linked to your phone.

| Risk | What it means for you |
|---|---|
| **Your number can be banned** | WhatsApp's terms forbid unofficial clients and automated access. Bans can be temporary or permanent, with no warning or appeal guarantee. You could lose your personal number's WhatsApp, chats and groups. |
| **It breaks without warning** | WhatsApp changes its web protocol often. The app could stop working, or send oddly, the day after an update. |
| **Account takeover if your computer is hacked** | The library stores a session file that gives full access to your WhatsApp: read every chat, send as you. Anyone who copies that file *is* you on WhatsApp. |
| **Your contacts' privacy** | Their end-to-end encrypted messages are decrypted on your computer and sent to Claude (Anthropic) to write drafts. They never agreed to that. In some countries (e.g. EU/GDPR) this can be a legal issue, especially for business chats. |
| **Malicious packages** | Fake or hijacked copies of these libraries have been used to steal WhatsApp sessions. |
| **Accidental sends** | Any bug in code that *can* send is a risk. This app only sends after your approval, but the library itself has no such safety. |

Lower-risk ways to use them, if you still choose to: read-only (import incoming
messages, never send from code), a spare number instead of your main one, and
low activity. None of these remove the ban risk.

## Option B — Official WhatsApp Business Platform (Cloud API)

Legitimate and stable, but:

- Needs a **business** setup via Meta. The number can't be in use on the normal
  WhatsApp app at the same time, so it doesn't fit a personal number.
- Has per-message costs and strict rules (24-hour reply window, approved templates).
- Meta's policy restricts general-purpose AI assistants on this platform.

Good for a real business you build for a client; poor fit for a personal number.

## Option C (recommended next step) — Keep yourself as the "sender"

No connection to WhatsApp at all:

1. Copy the incoming message into the dashboard (as now).
2. After you approve, the app gives you a **Copy** button, or opens WhatsApp's
   official click-to-chat link (`https://wa.me/<number>?text=...`) with the reply
   already typed.
3. You press Send in WhatsApp yourself.

Zero ban risk, nothing stored that can take over your account, and it works on
iPhone/iPad. The cost is one paste and one tap per message.

**Recommendation:** add Option C next. Only consider Option A if you accept that
your personal number could be banned.
