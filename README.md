# FridgeWise

FridgeWise keeps track of the food you have at home and helps you use it before it goes bad.
Photograph a grocery receipt or a single product and AI fills in the details and expiration dates.
A dashboard sorts your food into **Use today** (red), **Use soon** (yellow) and **Fresh** (green),
reminders arrive before food expires, recipes use what's closest to expiring, you can update your
kitchen in plain language ("I finished the milk"), and Stats shows the food and money you saved.

It's an installable Progressive Web App (PWA) that works in the browser on Android, iOS, Windows and Linux.

| | |
|---|---|
| Frontend | React 19, Vite 8, TypeScript, Tailwind CSS 4, vite-plugin-pwa (custom service worker) |
| Backend | Supabase: Postgres + Row Level Security, Auth, Storage, Edge Functions (Deno), pg_cron + pg_net |
| AI | Google Gemini (`gemini-3.8-flash` by default), called only from Edge Functions |
| Hosting | Netlify (static build); also works on any static host |

---

## Features

- **Scan** a receipt or a product with the phone camera, a file, drag and drop, or a desktop webcam. Photos are compressed in the browser (max 1600 px, JPEG) and stored privately for 30 days.
- **Review before anything is saved**: every line is editable, fields the AI was unsure about (< 70% confidence) are outlined and say *Check this*, and non-food lines (bags, tax, discounts) start unchecked.
- **Expiration dates**: printed date → USDA FoodKeeper shelf-life table → Gemini estimate (in that order), calculated in your timezone. Ambiguous dates like `03/04` are read with your locale.
- **Dashboard** with red / yellow / green sections, location and category filters, search, one-tap *Used* / *Tossed* with Undo. Same-name items stay separate batches with their own dates.
- **Plain-language commands** (typed or spoken): "I used half the milk", "moved the chicken to the freezer", "threw out the spinach". You see a preview, confirm, and can undo.
- **Item history** with every change, who made it (AI or you), old → new values, confidence, and Undo.
- **Recipes** from the food expiring soonest; *I made this* updates the ingredients (previewed, undoable).
- **Do I have it?** shopping check (works offline from the last saved list).
- **Reminders** by Web Push, one grouped notification per day in your morning.
- **Stats**: items used vs. tossed and money saved vs. wasted, weekly and all-time, with charts and table views.
- **Settings**: notifications, timezone, date format, light/dark theme, CSV export, demo data, delete account.
- **Offline**: the app shell loads without a connection and shows a clear offline message.

---

## How the AI edits data (for the judges)

**The AI never writes straight into `food_items`.** Every AI change follows the same path:

```
Gemini output ──► Zod validation ──► normalization ──► staging / proposed change ──► user review ──► Postgres RPC
 (JSON schema)    (retry once,       (title case,       (scan_items, or a            (preview +      (one transaction:
                   then "failed")     units, cents,      preview the user sees)        Confirm)        apply + log)
                                      dates, merge)
```

1. **Structured output only.** Each Gemini call sends a JSON schema (`responseFormat`), a low temperature and the image as inline base64. The reply is validated with **Zod**; fields that are not in the schema are dropped. Invalid JSON is retried once; if it fails again the scan is marked *failed* and the user can add items by hand.
2. **Text in images is data.** The system prompt tells Gemini to ignore any instructions printed in images or item names, and the code only accepts schema fields. In commands and recipes the model only sees short refs (`i3`, `r2`) for items; refs that weren't sent are rejected.
3. **A whitelist the database enforces.** The AI may only change `name, brand, category, storage_location, quantity, unit, price_cents, barcode, purchase_date, expiration_date, expiration_source, opened_at, notes`. The RPCs (`confirm_scan`, `apply_ai_changes`) raise an error for anything else. They never touch `id`, `user_id`, `created_at`, scan links or `user_locked_fields`. Status changes only through user-confirmed `mark_used` / `mark_wasted`. **There is no delete operation.**
4. **The user always wins.** When you edit a field yourself, a database trigger adds it to `user_locked_fields`. The AI RPCs run `set_config('app.edit_source', 'ai', true)`, so their own writes don't lock anything. They skip locked fields and report the skips ("Expiration date stays Oct 20, you set it yourself").
5. **One transaction, fully logged.** `apply_ai_changes` checks ownership through Row Level Security and writes one `ai_edit_log` row per changed field (old value, new value, confidence, model, reason) under a single `batch_id`. Moving an item to the freezer or opening it recalculates the expiration date from the shelf-life table unless you locked that date. Using the last of an item marks it used.
6. **Undo.** `undo_ai_batch(batch_id)` restores the old value only where the field still has the AI's value. Fields you changed since are left alone and listed. Items a batch created are removed only if they're untouched.
7. **Quotas.** Each user gets 40 scans and 60 AI requests (commands + recipes) per day, counted in an append-only `ai_usage` table inside the edge functions.

---

## Repository layout

```
src/                     React app (pages/, components/, lib/, state/, sw.ts service worker)
src/types/database.ts    Generated Supabase types
public/                  Icons, _headers (security headers + CSP), _redirects (SPA)
supabase/migrations/     All schema changes (the database matches these files)
supabase/functions/      scan-image, ai-command, suggest-recipes, send-reminders (+ _shared)
supabase/tests/          pgTAP database tests (55 checks)
tests/unit/              Vitest tests for normalization and command planning
scripts/                 generate-icons.mjs, generate-vapid-keys.mjs
netlify.toml             Build settings
```

---

## Setup

### 1. Prerequisites

- Node.js 20.19+ (22 recommended) and npm
- A Supabase project, plus the [Supabase CLI](https://supabase.com/docs/guides/cli) (`npx supabase` works too)
- A Google AI Studio API key for Gemini
- Optional: a Cloudflare Turnstile widget (site key + secret key)

```bash
npm install
cp .env.example .env      # fill in the values below; never commit .env
```

### 2. Browser environment variables (`.env` locally, Netlify → Site configuration → Environment variables in production)

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The **publishable** key (`sb_publishable_…`) or legacy anon key. Never the secret / service role key. |
| `VITE_TURNSTILE_SITE_KEY` | Turnstile site key. Leave empty until Turnstile is ready; the widget is then hidden. |
| `VITE_VAPID_PUBLIC_KEY` | `VAPID_PUBLIC_KEY` from step 4 |

### 3. Database, storage and functions

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push                     # applies supabase/migrations (tables, RLS, RPCs, bucket, seed, cron)
npx supabase functions deploy scan-image ai-command suggest-recipes send-reminders --no-verify-jwt
```

`--no-verify-jwt` is intentional: each function checks the caller itself. The three app functions check the user's token, and `send-reminders` checks a shared cron secret. Supabase recommends this setup with the new publishable/secret API keys.

Then in **Authentication → URL Configuration**, set the **Site URL** to your Netlify URL and add `https://<your-site>.netlify.app/**` (and any custom domain) to **Redirect URLs**. Sign-up confirmations and password-reset links return there.

### 4. Edge function secrets (Dashboard → Edge Functions → Secrets, or `supabase secrets set`)

| Secret | What it is |
|---|---|
| `GEMINI_API_KEY` | Your Google Gemini API key. Never commit it or put it in `.env`. |
| `GEMINI_MODEL` | `gemini-3.8-flash` (Google's current recommended general vision model; `gemini-3.5-flash-lite` is the cheaper option). |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Run `npm run vapid` (or `npx web-push generate-vapid-keys`). The public key also goes in `VITE_VAPID_PUBLIC_KEY`. |
| `VAPID_SUBJECT` | `mailto:you@yourdomain.com` (contact for push services) |
| `CRON_SECRET` | A long random string (`openssl rand -hex 32`); the same value goes in Vault below. |
| `ALLOWED_ORIGINS` | Optional. Comma-separated origins for CORS, e.g. `https://fridgewise.netlify.app`. |

`SUPABASE_URL` and the API keys are provided to functions automatically. The secret (service role) key is used **only** in `send-reminders`. The other functions create their client with the caller's `Authorization` header, so Row Level Security applies.

### 5. Turn on the scheduled jobs (SQL editor, once)

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<the same CRON_SECRET value>', 'cron_secret');
```

pg_cron then runs:

- `send-reminders` **hourly**, so each user gets their reminder once their local time is past 8:00;
- the deletion of scan images older than 30 days, **daily**;
- cleanup of old quota rows and unsaved recipe ideas, **daily**.

`reminder_log` is unique per item, day and channel, so nothing is sent twice.

### 6. Cloudflare Turnstile (CAPTCHA)

1. Add the **site key** as `VITE_TURNSTILE_SITE_KEY` in Netlify and redeploy.
2. In Supabase go to **Authentication → Bot and Abuse Protection** (`/dashboard/project/<ref>/auth/protection`), turn on **Enable CAPTCHA protection**, choose **Cloudflare Turnstile**, paste the **secret key**, and click **Save**.

Do step 1 before step 2. Once CAPTCHA protection is on, Supabase rejects sign-ins that don't include a token. The app renders the widget on sign up, sign in and password reset, passes `options.captchaToken`, and resets the widget after every attempt (tokens are single-use).

### 7. Logo and icons

Put `fridgewise-logo.png` (1024×1024, transparent) in the repo root. `npm run icons` runs automatically before every build. It generates the favicon, the apple-touch-icon (180), the PWA icons (192, 512, maskable 512), the notification badge and the in-app logo, all from the logo without changing it. Icons that can't be transparent go on the palette color with the best contrast against the logo, with safe-zone padding (`ICON_BG=#6BAA75 npm run icons` picks the color yourself). Until the logo is added, neutral placeholder icons are used.

---

## Deploy to Netlify

1. Push the repo to GitHub, then in Netlify: **Add new site → Import an existing project** and pick the repo.
2. Build command `npm run build`, publish directory `dist` (already in `netlify.toml`).
3. Add the four `VITE_…` variables (step 2) and deploy.
4. Add the Netlify URL to Supabase Auth redirect URLs (step 3).

`public/_headers` sets security headers and a Content Security Policy that allows only your Supabase project (`*.supabase.co`) and Turnstile. If you use a Supabase custom domain, add it to `connect-src` and `img-src` there. `public/_redirects` serves `index.html` for every route.

---

## Local development

```bash
npx supabase start                         # local Postgres, Auth, Storage, Edge Runtime (Docker)
npx supabase db reset                      # apply migrations
cp .env.example .env.local                 # use the local URL + publishable key from `supabase status`
npx supabase functions serve --env-file supabase/functions/.env   # with GEMINI_API_KEY etc.
npm run dev
```

Checks:

```bash
npm run typecheck && npm run lint && npm test      # TypeScript, oxlint, Vitest
npm run test:db                                     # pgTAP tests against the local database
npm run build
```

Test on phones at 360 px, tablets at 768 px and desktops at 1440 px. Below 1024 px the app uses a bottom navigation bar; above that, a sidebar. On iPhone, push notifications need the app added to the Home Screen (iOS 16.4+); the app explains this where it matters.

---

## Data model

Migrations are in `supabase/migrations`. The tables follow the brief, with these additions:

- `profiles.locale` (to read ambiguous printed dates), `profiles.onboarded_at`, `profiles.updated_at`
- `food_items.is_demo` (so demo data can be removed again)
- `scans.attempts` (caps retries to protect the Gemini quota)
- `scan_items.position`, `storage_instructions`, `notes`, `confidence`, and a `printed_date_type` enum
- `ai_edit_log.source` also allows `'user'` and has a `reason` column. The item history then shows your own edits and quick *Used* / *Tossed* actions next to AI edits.
- `recipes.time_minutes`, `servings`, `model`, `made_at`
- `ai_usage`: an append-only quota counter. It isn't `scans`, because deleting a scan must not give quota back.
- Composite foreign keys keep `scan_items.user_id` consistent with its scan. Every foreign key is indexed.

All tables have Row Level Security: user-owned rows require `user_id = auth.uid()` for select, insert, update and delete (`ai_usage`: select and insert only). Grants are explicit, and the `anon` role has no table access.

---

## Notes

- Gemini 3.6 and newer ignore `temperature`; it's still sent (0.15) for older models. If the API rejects `responseFormat`, the client retries once with `responseMimeType` + `responseJsonSchema`.
- Shelf-life values are based on USDA FoodKeeper guidance (conservative end of each range). They're estimates, so always trust the package and your senses.
- Email reminders are not included yet; `profiles.notify_email` is ready for them.
