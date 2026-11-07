# Can I use my Claude Pro/Max subscription for this?

Checked: 7 November 2026, against Anthropic's Claude Code
[Legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance)
and the [headless / `claude -p` docs](https://code.claude.com/docs/en/headless).
Terms change. Re-read those two pages before relying on this.

## Short answer

**Likely OK for personal, low-volume use on your own computer. Not explicitly
confirmed, and not OK if you turn it into a product for other people.**

## What the docs say (quoted)

Allowed:

> "OAuth authentication is intended exclusively for purchasers of Claude Free, Pro,
> Max, Ultra, Team, and Enterprise subscription plans and is designed to support
> ordinary use of Claude Code and other native Anthropic applications."

> "[Nor does it prevent] an end user from signing in to the unmodified Claude Code
> binary with their own Claude subscription..."

Limits:

> "Advertised usage limits for Pro, Max, and Ultra plans assume ordinary, individual
> usage of Claude Code and the Agent SDK."

Not allowed:

> "Developers building products or services that interact with Claude's capabilities,
> including those using the Agent SDK, should use API key authentication..."

> "Anthropic does not permit third-party developers to offer Claude.ai login into their
> own applications, or to route requests through Free, Pro, Max, or Ultra plan
> credentials on behalf of their users."

> "...developers may not collect, store, or intermediate Claude.ai credentials or
> session tokens..."

## The grey area

The docs describe `claude -p` (what this app runs) as the command-line form of the
Agent SDK. They say people *building products* with the Agent SDK should use API
keys. They don't say directly whether one person scripting `claude -p` for their own
use, on their own subscription, counts as that. "Ordinary, individual usage" suggests
light personal use is expected. Anthropic says to contact them if unsure.

## How this app stays on the safe side

| Rule | How the app follows it |
|---|---|
| Use the unmodified official CLI | It runs the normal `claude` command you installed. |
| Never handle tokens | It never reads, copies or stores any login token. Sign-in happens only through Claude Code's own flow. |
| Never pretend to be Claude Code | It makes no direct API calls at all. |
| No surprise API billing | It removes `ANTHROPIC_API_KEY` (and similar) from the CLI's environment and refuses to run if `claude auth status` reports API-key or cloud billing. |
| Ordinary individual use | One draft at a time, only when you tap a button. No background loops, no auto-replies. |
| Not for other people | Personal tool only. One user, your own account. |

## Things that would cross the line

- Selling or hosting this for clients while it uses *your* subscription. For a client
  product, each user must use their own API key (paid per use) or their own login.
- Running it on a server for many people, or generating drafts in bulk 24/7.
- Copying the token out of Claude Code's storage into another tool.

## Watch for

The `claude -p` docs say `--bare` "will become the default for `-p` in a future
release", and bare mode **does not use your subscription login**. If that happens,
this app will show "not signed in" or refuse to run. It will **not** quietly switch
to API billing. Re-check the docs then.
