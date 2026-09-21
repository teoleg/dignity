# Deploying the feedback build

A public URL your testers can open on a phone with no account and no sign-in.
Free hosting; you pay only for model usage, which is cents per order.

## Once

1. **An Anthropic API key.** console.anthropic.com → API keys. Put about $10
   on it and set a spending limit while you are there. The key lives only on
   the server; it never reaches a browser.
2. **A Vercel account** — vercel.com, sign in with GitHub. Free tier is
   enough.
3. **The blank form is optional at deploy time.** It is gitignored on
   purpose — the vendor's artwork does not belong in the repository. If you
   put it at `public/blank-form.jpg` before deploying, it ships with the
   site. If you do not, the first person to ask for the filled form is
   invited to pick the image, and their browser remembers it. Either way the
   conversation works.

## Deploy from a phone, no computer

vercel.com works in a phone browser.

1. **vercel.com** → sign in with GitHub
2. **Add New → Project** → *Import Git Repository* → `teoleg/dignity`
3. Leave every build setting alone. `vercel.json` already says what to run.
4. Open **Environment Variables** and add:
   - `ANTHROPIC_API_KEY` — your key
   - `DIGNITY_PASSCODE` — any word you will give your testers
5. **Deploy**, and wait a minute or two.

You get a URL. Open it, enter the passcode, and the first time you ask for
the filled form it asks you to pick the blank form image — choose the photo
of the order sheet from your phone. It is remembered after that.

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
