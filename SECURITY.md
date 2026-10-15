# Security Policy

FridgeWise is a beta app built for a school AI competition. It stores people's food lists, receipt and product photos, and account details, so security reports are welcome and taken seriously.

## Supported versions

Only the current code on `main`, and the live app built from it, get security fixes. There are no older releases to patch.

## Reporting a vulnerability

**Please don't open a public issue, pull request or discussion about a security problem.** Report it privately:

1. Open this repository's **Security** tab.
2. Click **Report a vulnerability**, or go straight to [the private report form](https://github.com/mole-rat3832/Fridge-Wise/security/advisories/new).
3. Describe the problem. Only the maintainer can see it.

If the button isn't there, open an issue that only says you'd like to report a security problem privately. Don't put any details in it, and you'll get a private way to send them.

Please include:

- what is affected: a page, an edge function, a database policy or a file in this repository;
- steps to reproduce, or a proof of concept;
- what an attacker could do with it;
- anything you accessed or changed while testing.

If you saw someone else's data, describe what kind of data it was. Don't copy it into the report.

### What happens next

- You'll get a reply within 7 days confirming the report arrived.
- Once the problem is confirmed, it's fixed on `main` and deployed, and you'll hear when that's done.
- After the fix is live, a GitHub security advisory describes the problem and the fix. You'll be credited if you'd like.

This is a student project, so there is no bug bounty.

## Scope

**In scope**

- The code in this repository: the React app, the Supabase migrations (tables, Row Level Security, RPCs, storage policies) and the edge functions.
- The hosted FridgeWise app and its Supabase project.

Examples worth reporting:

- reading or changing another user's items, scans, photos, history or profile;
- calling an edge function or RPC without being signed in, or as someone else;
- getting around the daily AI limits or the limit of 3 attempts per photo;
- prompt injection, where text in a photo or a command makes the AI change something it shouldn't, or write a field outside the allowed list;
- a secret (API key, service role key, password) committed to this repository or sent to the browser;
- cross-site scripting, or anything else that gets around the Content Security Policy;
- flaws in sign up, sign in or password reset, including getting around the CAPTCHA.

**Out of scope**

- Problems in Supabase, Google Gemini, Cloudflare Turnstile or Netlify themselves. Please report those to the provider.
- Denial of service, load testing and spam.
- Social engineering and phishing.
- Scanner output with no demonstrated impact, such as a missing header that doesn't lead to an attack.
- The Supabase publishable key and the Turnstile site key in `netlify.toml`. Both are public by design, and Row Level Security decides what the publishable key can do.

## Testing rules

- Only use accounts you created. Never access, change or delete other people's data. If you reach someone else's data by accident, stop, don't keep it, and say so in your report.
- Don't run automated scanners or send large numbers of requests. Every AI request uses the project's limited Gemini quota, so stay within the normal daily limits.
- Don't upload malware or illegal content.
- Give the maintainer reasonable time to fix the problem before you discuss it publicly.

If you follow these rules and act in good faith, your research will be treated as authorized, and this project won't take legal action against you for it.

## How FridgeWise protects data

The [Security and privacy](README.md#security-and-privacy) section of the README has the details. In short:

- **Row Level Security on every table.** Each user can only read and change their own rows. The `anon` role has no table access.
- **The browser only has the publishable key.** The edge functions run their queries as the signed-in user, so Row Level Security applies there too. The secret (service role) key is used only by the reminder job, which only pg_cron can call.
- **AI keys stay on the server.** Gemini is only called from edge functions, and its key is an edge function secret. No secrets are kept in this repository, and `.env` files are ignored by git.
- **AI output is checked before it's used.** Every Gemini answer is validated against a schema. Text in photos and item names is treated as data, not instructions. AI changes are only proposed, and you confirm them first. They then go through `apply_ai_changes`, which allows only a fixed list of fields, skips fields you set yourself and logs every change so it can be undone.
- **Daily AI limits** are counted in an append-only table before every Gemini call.
- **Bot protection:** Cloudflare Turnstile on sign up, sign in and password reset.
- **Photos** are stored in a private bucket, readable only from the owner's folder, and deleted after 30 days.
- **Strict browser headers:** a Content Security Policy, HSTS, `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a Permissions-Policy that allows only the camera and microphone, for this site only.
