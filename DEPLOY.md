# Deploying the feedback build

A public URL your testers can open on a phone with no account and no sign-in.
Free hosting; you pay only for model usage, which is cents per order.

## Once

1. **An Anthropic API key.** console.anthropic.com → API keys. Put about $10
   on it and set a spending limit while you are there. The key lives only on
   the server; it never reaches a browser.
2. **A Vercel account** — vercel.com, sign in with GitHub. Free tier is
   enough.
3. **The blank form ships with the repository** — `public/blank-form.jpg`,
   committed, no personal data on it. Nobody is asked for it. If a
   deployment ever lacks it, the first person who asks for the filled form
   is invited to photograph theirs, and their browser remembers it.

## Deploy from a phone, no computer

vercel.com works in a phone browser.

1. **vercel.com** → sign in with GitHub
2. **Add New → Project** → *Import Git Repository* → `teoleg/dignity`
3. Leave every build setting alone. `vercel.json` already says what to run.
4. Open **Environment Variables** and add:
   - `ANTHROPIC_API_KEY` — your key
   - `DIGNITY_PASSCODE` — any word you will give your testers
5. **Deploy**, and wait a minute or two.

You get a URL. Open it, enter the passcode, and it works — the blank order
sheet is already in the build.

## Deploy from a computer

```bash
npm install
npm run build:web        # bundles the page into public/app.js
npx vercel               # first run asks a few questions; accept the defaults
```

Then set three environment variables — in the Vercel dashboard under
Settings → Environment Variables, or with `npx vercel env add`:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your key |
| `DIGNITY_PASSCODE` | any shared word you give your testers |
| `DIGNITY_MODEL` | *(optional)* defaults to `claude-sonnet-5` |

Redeploy so they take effect:

```bash
npx vercel --prod
```

You get a URL like `dignity-xxxx.vercel.app`. Send it to your testers with
the passcode. They open it, type in whatever language they are comfortable with,
and the stone builds as they go.

## Where the API key is, and where it is not

Verified, not asserted:

- The key is read only in `api/chat.ts`, which runs on Vercel's server. It is
  never sent to a browser, and `grep` over the built bundle finds no key, no
  `x-api-key`, and no call to `api.anthropic.com` — the page talks only to
  `/api/chat` on its own origin.
- Nothing injects environment variables into the bundle. The build defines
  exactly one value, the build stamp.
- No key-shaped string appears in any commit in the repository's history, and
  no `.env` file has ever been committed. `.gitignore` now covers `.env*`,
  because `vercel env pull` writes `.env.local` next to your source.
- The provider's own errors are never returned to the browser. They go to the
  server log; the page sees "Could not reach Claude."

So a tester watching their own network traffic sees their conversation going
to `/api/chat` over HTTPS and a reply coming back. The key is not in either.

**What is actually exposed is the passcode, and therefore the spend.** It
travels in a request header, so anyone who has it — or who is handed the link
by a tester — can spend your credit until you change it. It is not security;
it is a doorstop. Three things keep that bounded:

- **A spending limit on the key** at console.anthropic.com. This is the real
  backstop, and the only one that holds if the passcode leaks.
- **Size limits on each request** (`LIMITS` in `api/chat.ts`): a capped
  number of turns and characters, so one call cannot be inflated into a
  thousand calls' worth of tokens.
- **A short-lived key.** Rotating it every month or two, as above, ends any
  leak you never noticed.

There is **no rate limiting**, so someone with the passcode can call the
endpoint as fast as they like, and a guessable passcode can be attacked
without any lockout. Use something unguessable, not a word. Proper limiting
needs shared state a serverless function does not have — the spending limit
is what stands in for it, and that is the honest trade for a build with five
testers.

## Replacing the API key

Keys expire, get rotated, or run out of credit. Two things to know: you edit
the variable rather than adding a second one, and **Vercel bakes environment
variables in at deploy time, so nothing changes until you redeploy.**

From a phone:

1. `vercel.com/<your-account>/dignity/settings/environment-variables` —
   or vercel.com/dashboard → the project → the tab row under the project
   name scrolls sideways → **Settings** → **Environment Variables**. If that
   row will not cooperate, Safari's **aA** → *Request Desktop Website* makes
   the dashboard far easier to use.
2. `ANTHROPIC_API_KEY` → the **⋯** on that row → **Edit** → paste → Save.
3. **Deployments** → the top one → **⋯** → **Redeploy**. A minute or two.
4. Open the app and send one message.

From a computer: `npx vercel env rm ANTHROPIC_API_KEY production`, then
`npx vercel env add ANTHROPIC_API_KEY production`, then `npx vercel --prod`.

If a message still fails, the page says only "Something went wrong reaching
Claude" — the provider's error is deliberately never shown to a family. The
real reason is in the project's **Logs** tab (runtime logs): an expired or
revoked key and an exhausted balance look identical from the app's side, and
the Anthropic console shows which it is.

## Watching the cost

Each answered question is one model call. A whole order is roughly ten, so a
few cents on Sonnet. If you want to see the spend, the Anthropic console
shows it per day; the limit you set is the backstop.

## Rebuilding after a change

```bash
npm test && npm run typecheck   # both must pass
npm run build:web
npx vercel --prod
```
