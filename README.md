# NewWebinars

A webinar SaaS platform built with React, TypeScript, Vite, and Supabase.

## Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS
- Supabase
- React Router
- i18next (English, Lithuanian, Russian)
- Zustand (state management — added later)

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

### Environment variables

Copy `.env.example` to `.env.local` and fill in your Supabase credentials.

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Phase 1 status

- [x] Clean project foundation
- [x] Tailwind CSS with light/dark tokens
- [x] Path aliases (`@/*`)
- [x] i18n foundation (`en`, `lt`, `ru`)
- [x] Theme system (light / dark / system)
- [x] Supabase client placeholder
- [x] React Router setup
- [x] Shared UI primitives
- [x] Auth skeleton (`useUser`, `ProtectedRoute`, sign-in placeholder)

## Phase 2: Database schema

See the final migration:

```text
supabase/migrations/20260708145624_init_schema.sql
```

### Final tables

| Table             | Purpose                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `accounts`        | SaaS tenant/workspace with billing plan (`free`/`paid`/`vip`)           |
| `account_members` | Many-to-many user membership inside an account                          |
| `profiles`        | Supabase Auth extension; global platform role only                      |
| `partners`        | Platform partners; `type` distinguishes affiliate/referral partners     |
| `webinars`        | Core webinar record, owned by `account_id`, presented by `presenter_id` |
| `webinar_offers`  | Sales CTA/offers per webinar                                            |
| `registrations`   | Attendee lifecycle, progress tracking, and affiliate attribution        |
| `chat_messages`   | Persisted chat history                                                  |
| `reminder_rules`  | Pre-webinar reminder configuration                                      |

### Final enums

- `profiles.role`: `guest` | `admin`
- `account_members.role`: `owner` | `admin` | `host` | `viewer`
- `accounts.plan`: `free` | `paid` | `vip`
- `webinars.type`: `live` | `automated`
- `webinars.status`: `draft` | `published` | `live` | `ended` | `cancelled`
- `registrations.status`: `registered` | `attended` | `cancelled` | `no_show`
- `chat_messages.message_type`: `chat` | `system` | `offer`
- `reminder_rules.channel`: `email` | `telegram`
- `partners.type`: `affiliate` | `business`

### Authorization vs billing

- `profiles.role` is the **global platform role** — `admin` means system-wide authority.
- `account_members.role` is a **workspace role** — permissions inside one account only.
- `accounts.plan` is a **billing/limits tier** (`free` | `paid` | `vip`), not an authorization role. RLS and workspace permissions do not depend on it. Stripe-specific billing state will move to dedicated tables later.

### RLS intent

- `published_webinars` view exposes only public-safe fields to `anon` and `authenticated`.
  - It is intentionally `SECURITY DEFINER` because `SECURITY INVOKER` would block anon users through base-table RLS. The restricted column list and explicit status filter are the intentional security boundary.
- Workspace membership checks are performed by security-definer helpers (`is_account_member`, `has_account_role`, `is_platform_admin`) to avoid recursive RLS subqueries against `account_members`.
- Private delivery URLs (`meeting_url`, `automated_video_url`, `recording_url`) are only visible to account members.
- Profile emails and platform roles are never exposed to other users.
- Account members manage webinars, offers, registrations, chat, and reminder rules within their account.
- Public users can register for published/live webinars and view active offers.

### Referral / affiliate attribution

- `partners` stores affiliate (and future business) partners.
- Each affiliate gets a unique `code`.
- Codes auto-generate if the admin leaves the field empty, and can also be set manually.
- Referral codes are immutable after creation (database trigger enforces this).
- `registrations.referral_code` attributes a webinar registration to one affiliate.
- Conversion validation uses a security-definer helper so the `partners` table stays private.
- Only `type = 'affiliate'` partners are accepted as referral sources; `type = 'business'` is rejected.
- No multi-level logic: one conversion maps to one flat affiliate code.

### Roles and grants

RLS policies alone are not enough — PostgreSQL table privileges are also required:

- `authenticated` receives broad CRUD grants on all public tables; RLS is the actual gatekeeper.
- `anon` receives only the minimum grants: `SELECT` on `published_webinars` and `webinar_offers`, plus `INSERT` on `registrations`.
- Service-role/admin access is not used by the web client; it stays outside the frontend.

### Deferred entities

These are intentionally not in the MVP schema:

- `webinar_recordings` table (single `recording_url` on webinar for now)
- `webinar_sessions` / recurring occurrences
- `ai_prompts`, `ai_outputs`, `ai_usage_logs`
- `partner_commissions` / payout logic (partners and referral codes exist; commission calculation is not yet implemented)
- `affiliate_links` (short tracking links; the public `partners.code` serves the same purpose for now)
- `contact_channels` / Telegram preferences (`telegram` is a reserved reminder channel enum)
- `reminder_logs`

### Applying migrations

Run locally with the Supabase CLI:

```bash
supabase start
supabase migration up
```

To apply to a remote project:

```bash
supabase link
supabase db push
```

**Do not commit your Supabase service-role key or `.env.local`.**

## Deployment

### GitHub

```bash
git init
git add .
git commit -m "Initial NewWebinars setup"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/newwebinars.git
git push -u origin main
```

### Cloudflare Pages

1. In the Cloudflare dashboard, go to **Pages** → **Create a project**.
2. Choose **Connect to Git** and select the `newwebinars` repository.
3. Use these build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Add the following environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Save and deploy. The included `public/_redirects` file makes client-side routing work as a single-page application.

### Custom domain

1. In your Cloudflare Pages project, go to **Custom domains** → **Set up a custom domain**.
2. Enter your domain (e.g. `newwebinars.com`) and follow the verification steps.
3. Add the DNS records Cloudflare suggests. If your domain is already in the same Cloudflare account, Cloudflare can configure these automatically. Otherwise:
   - Point the domain’s nameservers to Cloudflare, **or**
   - Add the CNAME record Cloudflare provides (e.g. `newwebinars.com` → `your-project.pages.dev`).
4. Wait for SSL/TLS provisioning to complete. Cloudflare will issue a certificate automatically.

## Scripts

- `npm run dev` — start dev server
- `npm run build` — type-check and build for production
- `npm run lint` — run ESLint
- `npm run format` — format with Prettier
- `npm run format:check` — check Prettier formatting
- `npm run preview` — preview production build
