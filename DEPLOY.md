# Deploying the feedback build

A public URL your testers can open on a phone with no account and no sign-in.
Free hosting; you pay only for model usage, which is cents per order.

## Once

1. **An Anthropic API key.** console.anthropic.com → API keys. Put about $10
   on it and set a spending limit while you are there. The key lives only on
   the server; it never reaches a browser.
2. **A Vercel account** — vercel.com, sign in with GitHub. Free tier is
   enough.
3. **Put the blank form at `public/blank-form.jpg`.** It is gitignored on
   purpose: it is the vendor's artwork and does not belong in the repository.
   Without it the conversation still works and the form download does not.

## Deploy

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
the passcode. They open it, type in English, and the stone builds as they go.

## What the passcode is and is not

It stops a forwarded link from quietly spending your credit. It is not
security: anyone with the code is in, and it is stored in their browser so
they enter it once. That is the right amount for five colleagues and the
wrong amount for anything real.

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
