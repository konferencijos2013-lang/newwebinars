# NewWebinars

A webinar SaaS platform built with React, TypeScript, Vite, and Supabase.

## Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS
- Supabase (auth, DB, Edge Functions, storage)
- React Router
- i18next (English, Lithuanian, Russian)
- Stripe (billing)
- OpenAI (assistant)

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

### Environment variables

Copy `.env.example` to `.env.local` and fill in at least the frontend Supabase credentials.

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Edge Function secrets** are configured in Supabase Studio, not in the frontend env file. See [Edge Function secrets](#edge-function-secrets).

## Authentication

Auth is powered by Supabase Auth. The frontend uses only the public anon key and the browser client in `src/lib/supabase.ts`.

### Routes

| Route                   | Purpose                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `/login`                | Sign-in page with Google and email magic link                 |
| `/auth/callback`        | OAuth / magic-link callback; exchanges the code for a session |
| `/dashboard`            | Protected app dashboard                                       |
| `/webinars`             | Webinar list                                                  |
| `/webinars/new`         | Create webinar                                                |
| `/webinars/:id`         | Webinar detail / settings                                     |
| `/webinars/:id/edit`    | Edit webinar                                                  |
| `/funnels`              | Funnel list                                                   |
| `/funnels/new`          | Create funnel                                                 |
| `/funnels/:id`          | Funnel editor                                                 |
| `/recordings`           | Recording library with storage quota                          |
| `/billing`              | Plans, credits, usage, invoices                               |
| `/w/:slug`              | Public webinar registration page                              |
| `/w/:slug/waiting-room` | Waiting room with countdown                                   |
| `/w/:slug/room`         | Webinar room with chat and AI assistant                       |

### Supabase Auth setup

1. In Supabase Studio, go to **Authentication** → **Providers**.
2. Enable the **Email** provider.
3. Copy your `Site URL` and add the allowed redirect origins:
   - `http://localhost:5173`
   - `https://newwebinars.com`
   - `https://www.newwebinars.com`
4. Add the same origins under **Authentication** → **URL Configuration** → **Additional Redirect URLs**.

### Google OAuth setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**.
2. Create **OAuth 2.0 Client ID** (Web application).
3. Add the authorized redirect URI:
   ```text
   https://your-project-ref.supabase.co/auth/v1/callback
   ```
4. Copy the **Client ID** and **Client Secret**.
5. In Supabase Studio, enable the **Google** provider and paste the credentials.

### Magic link / email login setup

The login page uses `supabase.auth.signInWithOtp()`. For emails to be delivered, enable a custom SMTP provider:

1. Supabase Studio → **Authentication** → **Emails** → **SMTP Settings**.
2. Toggle **Enable Custom SMTP** and enter your provider details.
3. Supabase Studio → **Authentication** → **Providers** → **Email** must be enabled.

Recommended providers: Resend, SendGrid, Brevo.

### User profiles

When a user signs up, the `handle_new_user` trigger automatically inserts a row into `public.profiles`.

## Phase overview

- **Phase A: App shell & route structure** — public marketing site, authenticated app with sidebar, placeholder pages.
- **Phase B: Webinar CRUD** — webinars, access modes, evergreen schedules.
- **Phase C: Funnel editor** — funnels, funnel pages, funnel blocks, visual editor.
- **Phase D: Registration / waiting room / webinar room** — public registration, waiting room, live/evergreen room, simulated chat.
- **Phase E: Recordings library** — recordings, storage quota, archive/delete.
- **Phase F: Billing & credits** — Stripe checkout, webhooks, subscriptions, usage events.
- **Phase G: AI assistant** — OpenAI powered floating assistant in webinar room and funnel editor.
- **Phase H: Final polish + README** — env docs, deployment instructions.

## Database

Migrations live in `supabase/migrations/`. Key tables include:

| Table                   | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `accounts`              | SaaS tenant/workspace                          |
| `account_members`       | Workspace membership and roles                 |
| `profiles`              | Supabase Auth extension; global platform role  |
| `webinars`              | Core webinar record                            |
| `webinar_sessions`      | Scheduled occurrences                          |
| `webinar_schedules`     | Evergreen scheduling rules                     |
| `funnels`               | Webinar funnels                                |
| `funnel_pages`          | Pages inside a funnel                          |
| `funnel_blocks`         | Content blocks                                 |
| `registrations`         | Attendee lifecycle and affiliate attribution   |
| `chat_messages`         | Persisted chat history                         |
| `webinar_chat_scripts`  | Simulated chat messages for automated webinars |
| `recordings`            | Webinar recordings                             |
| `account_storage_usage` | Aggregated storage quota per account           |
| `credit_plans`          | Pricing plans with credit allocations          |
| `account_credits`       | Remaining credits per account                  |
| `subscriptions`         | Stripe subscriptions                           |
| `payments`              | Payment records                                |
| `ai_prompts`            | Stored AI prompt templates                     |
| `ai_threads`            | AI assistant conversation threads              |
| `ai_messages`           | AI assistant messages                          |

### Applying migrations

Local:

```bash
supabase start
supabase migration up
```

Remote (requires `supabase link`):

```bash
supabase db push
```

## Edge Functions

Edge Functions are in `supabase/functions/`:

- `create-checkout-session` — creates a Stripe Checkout session.
- `create-customer-portal-session` — creates a Stripe Customer Portal session.
- `stripe-webhook` — handles Stripe webhooks.
- `ai-chat` — sends messages to OpenAI and persists the response.
- `process-reminder-deliveries` — claims due reminder jobs and sends them through connected delivery providers.

### Edge Function secrets

Set secrets in Supabase Studio (**Project Settings** → **Edge Functions** → **Secrets**) or via CLI:

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set STRIPE_SECRET_KEY=sk_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
supabase secrets set DELIVERY_WORKER_SECRET=<long-random-value>
```

**Never expose these keys to the frontend.** The frontend uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### Live Stripe billing setup

Use a separate Stripe **Live mode** catalog; do not reuse test resources. Create six recurring EUR prices (one product per tier or one product with monthly/yearly prices):

| Plan code     |  Amount | Recurrence |
| ------------- | ------: | ---------- |
| `start-month` |  €19.00 | monthly    |
| `start-year`  | €182.40 | yearly     |
| `grow-month`  |  €39.00 | monthly    |
| `grow-year`   | €374.40 | yearly     |
| `scale-month` |  €79.00 | monthly    |
| `scale-year`  | €758.40 | yearly     |

The database plan code, amount, currency (`eur`), and interval must exactly match Stripe. Annual rows contain a full 12-month credit allocation and are granted once for each paid annual invoice.

Configure production Edge Function secrets (never put these in `.env.local` or any `VITE_` variable):

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  APP_URL=https://newwebinars.com \
  ALLOWED_ORIGINS=https://www.newwebinars.com \
  SUPABASE_SERVICE_ROLE_KEY=...
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are supplied by hosted Supabase. `ALLOWED_ORIGINS` is an optional comma-separated list; `APP_URL` is always allowed.

Apply migrations before deploying functions, then deploy all three billing functions:

```bash
supabase db push
supabase functions deploy create-checkout-session
supabase functions deploy create-customer-portal-session
supabase functions deploy stripe-webhook --no-verify-jwt
```

In Stripe Workbench/Webhooks, add this endpoint:

```text
https://<project-ref>.supabase.co/functions/v1/stripe-webhook
```

Subscribe only to the lifecycle events handled by the application:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`
- `invoice.paid`
- `invoice.payment_failed`
- `charge.refunded`

Do not add `invoice.payment_succeeded`; `invoice.paid` is the canonical grant event. Checkout and subscription events synchronize state, but paid plan access and credits are granted only by `invoice.paid`.

Enable the Stripe Customer Portal, allow customers to update payment methods, cancel subscriptions, and switch between only the six prices above. Configure proration/payment behavior deliberately in Stripe; the app relies on Stripe invoices as the source of truth.

After creating the Live prices, bind their IDs with an audited SQL change in Supabase SQL Editor (replace every placeholder):

```sql
begin;

update public.credit_plans as p
set stripe_price_id = v.price_id, is_active = true, updated_at = now()
from (values
  ('start-month', 'price_live_start_month'),
  ('start-year',  'price_live_start_year'),
  ('grow-month',  'price_live_grow_month'),
  ('grow-year',   'price_live_grow_year'),
  ('scale-month', 'price_live_scale_month'),
  ('scale-year',  'price_live_scale_year')
) as v(code, price_id)
where p.code = v.code;

-- Must return six exact canonical rows and no duplicate/noncanonical bindings.
select code, price_cents, currency, interval, stripe_price_id, is_active
from public.credit_plans
where code in ('start-month','start-year','grow-month','grow-year','scale-month','scale-year')
order by code;

select stripe_price_id, count(*)
from public.credit_plans
where stripe_price_id is not null
group by stripe_price_id
having count(*) > 1;

commit;
```

Before committing, compare each returned row against Stripe Live mode: active recurring price, exact amount, `eur`, and monthly/yearly interval. Also verify that all six rows have non-null `stripe_price_id`, annual allocations are 12× their matching monthly allocation, paid plans with no binding remain inactive, Checkout opens the selected price, an unpaid/incomplete Checkout grants no access, `invoice.paid` grants once under webhook retries, cancellation/`incomplete_expired`/`unpaid` falls back to Free when no other paid subscription remains, and the portal returns to `/billing`.

### Reminder worker schedule

The delivery worker is deployed but intentionally will not send anything until `DELIVERY_WORKER_SECRET` is configured. Trigger it every minute from a scheduler (for example, GitHub Actions, Cloudflare Cron Trigger, or Supabase Cron with `pg_net`) using `POST https://<project-ref>.supabase.co/functions/v1/process-reminder-deliveries` and the header `x-delivery-worker-secret: <same secret>`. The worker claims each due job atomically, records every attempt, retries provider failures with exponential backoff, and recovers jobs stranded by an interrupted worker after ten minutes.

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

1. Cloudflare dashboard → **Pages** → **Create a project**.
2. Connect the GitHub repository.
3. Build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. The included `public/_redirects` file enables SPA routing.

### Custom domain

1. Cloudflare Pages project → **Custom domains** → **Set up a custom domain**.
2. Enter your domain and follow the verification steps.
3. Add the suggested DNS records (CNAME to `your-project.pages.dev`).
4. Wait for SSL/TLS provisioning.

## Scripts

- `npm run dev` — start dev server
- `npm run build` — type-check and build
- `npm run lint` — run ESLint
- `npm run format` — format with Prettier
- `npm run format:check` — check formatting
- `npm run preview` — preview production build

## Security notes

- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are exposed to the browser.
- Service-role keys, Stripe secrets, and OpenAI keys are Edge Function secrets.
- Row-level security is enabled on all user-facing tables.

## License

MIT
