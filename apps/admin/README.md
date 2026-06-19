# Bridge Admin

Internal admin dashboard for `hq.bridgenine.co.za`.

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
hq.bridgenine.co.za
```

Required Vercel environment variables:

```txt
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

## Access roles

The first scaffold allows these internal roles:

```txt
founder
super_admin
platform_admin
internal_admin
developer
hq_staff
support_agent
customer_support
admin
```

Roles are read from Supabase user metadata and common profile fields.
