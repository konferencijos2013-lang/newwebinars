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
- `stripe-webhook` — handles Stripe webhooks.
- `ai-chat` — sends messages to OpenAI and persists the response.

### Edge Function secrets

Set secrets in Supabase Studio (**Project Settings** → **Edge Functions** → **Secrets**) or via CLI:

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set STRIPE_SECRET_KEY=sk_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
```

**Never expose these keys to the frontend.** The frontend uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

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
