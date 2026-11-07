# WhatsApp Reply Assistant (personal, manual approval)

You paste in messages people send you. Claude writes a reply draft. You **Edit**,
**Approve**, **Reject** or **Regenerate** it in a phone-friendly dashboard.

- **Nothing is ever sent without you tapping Approve and then confirming.**
- **Sending is simulated:** approved replies go to a local "sent log". Nothing
  reaches WhatsApp yet. Read [docs/WHATSAPP-RISKS.md](docs/WHATSAPP-RISKS.md)
  before changing that.
- **Uses your Claude Pro/Max subscription** through the official `claude` command.
  No API key, no API credits. It refuses to run if Claude Code is set to API-key
  billing. See [docs/SUBSCRIPTION-TERMS.md](docs/SUBSCRIPTION-TERMS.md) for what
  Anthropic's terms say (short version: fine for light personal use, not for a
  product you sell).
- Everything is stored on your computer in `data/db.json`.

## What you need

- A **Mac, Windows or Linux computer**. Claude Code can't run on an iPad, but you
  can use the dashboard from your iPad (step 5).
- A Claude Pro or Max subscription.

## Setup (about 10 minutes)

**1. Install Node.js** (the program that runs this app)
Go to <https://nodejs.org>, download the **LTS** version, install it.

**2. Install Claude Code and sign in with your subscription**
Open **Terminal** (Mac: press ⌘+Space, type "Terminal", Enter). Paste and press Enter:

```bash
npm install -g @anthropic-ai/claude-code
claude
```

Choose to sign in with your **Claude account (Pro/Max)**, *not* an API key.
When it's done, type `/exit`. Check it worked:

```bash
claude auth status
```

You want `"loggedIn": true`, and `authMethod` must **not** mention "api".

**3. Download this project**
On the GitHub page, tap **Code → Download ZIP**, unzip it, then in Terminal type
`cd ` (with a space) and drag the unzipped folder onto the Terminal window. Enter.

**4. Start it**

```bash
npm start
```

Open <http://localhost:3000> in your browser. (No `npm install` needed — this app
has no extra packages.)

Want to try it without using Claude? Run `npm run demo` instead (fake drafts).

**5. (Optional) Use it from your iPad on the same Wi-Fi**
Create a file named `.env` in the project folder (copy `.env.example`) containing:

```
HOST=0.0.0.0
ACCESS_PASSWORD=pick-a-long-random-password-here
```

Run `npm start` again. Terminal shows an address like `http://192.168.1.20:3000`.
Open it in Safari on your iPad and enter the password. Tip: Share → **Add to Home
Screen** makes it feel like an app.
⚠️ Only do this on your home Wi-Fi, never on public Wi-Fi. The connection isn't
encrypted (no https), so don't open it to the internet.

## How to use it

1. Add a contact (e.g. "Sam"). Optionally open **Contact details** and describe
   them ("my cousin, very casual, speaks Dutch").
2. Paste a message they sent you → **Add**.
3. Tap **Draft a reply**. Then:
   - **Approve** → shows the exact text → **Approve & send** records it (simulated).
   - **Edit** → change the text → **Save & approve**.
   - **Regenerate** → new version. Type an instruction first, e.g. "shorter".
   - **Reject** → throw the draft away.
4. Settings (⚙): your name and writing style.

If a draft contains `[brackets]`, Claude didn't know something (like a time). Edit it.

## Safety design

| Concern | Protection |
|---|---|
| Sending by accident | Only one code path sends. It needs a confirmed approval, blocks double-taps, and is simulated. |
| Surprise API bills | API-key variables are stripped before running `claude`; API-key or cloud billing is refused. |
| Messages tricking the AI | Claude runs with **no tools**, no connectors, in an empty folder. Chat text is marked as data. At worst it writes a bad draft, which you see before anything happens. |
| Other websites poking the dashboard | Only answers on localhost by default; blocks cross-site requests; password required when opened to Wi-Fi. |
| Privacy | Messages you paste are sent to Anthropic through Claude Code to write drafts, under your Claude account's privacy settings. Avoid pasting very sensitive info. |

## Developer notes

- `npm test` runs the tests (uses a fake `claude`, never your account).
- Settings in `.env`: `AI_PROVIDER` (`claude`/`mock`), `CLAUDE_MODEL` (e.g. `sonnet`),
  `PORT`, `HOST`, `ACCESS_PASSWORD`, `DATA_DIR`.
- Files: `server.js` (start), `src/app.js` (API + rules), `src/ai.js` (Claude CLI),
  `src/sender.js` (simulated sender), `public/` (dashboard).
