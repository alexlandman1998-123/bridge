# Bridge Admin

Internal admin dashboard for `admin.arch9.co.za`.

## Local setup

```bash
npm install
npm run dev
```

Create a local `.env` file with the same Supabase frontend values used by the main Bridge app:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Never put a Supabase service-role key in this app. Browser apps must only use the anon key.

## Vercel setup

Create a separate Vercel project and point it at this folder:

```txt
Root Directory: apps/admin
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

Add the custom domain to that Vercel project:

```txt
admin.arch9.co.za
```

Required Vercel environment variables:

```txt
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

## Access levels

The admin app uses two access levels:

```txt
executive
customer_support
```

Recommended Supabase user metadata:

```json
{ "role": "executive" }
```

or

```json
{ "role": "customer_support" }
```

Executive level can access Dashboard, Growth, Revenue, Ecosystem, Platform Health, Operations, Service Desk, Audit Log, Search, and Settings.
Customer support level can access Service Desk and Search only.

Roles are read from Supabase app metadata, user metadata, and common profile fields. Legacy internal roles still map into these two levels so existing staff access continues to work.
