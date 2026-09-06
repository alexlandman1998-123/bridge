# Phase 3 — Managed Supabase Configuration

SQL schema equivalence is not enough. Before any application traffic reaches the clean baseline, inventory production configuration without revealing secret values:

```bash
node the-it-guy/scripts/inventory-managed-supabase-config.mjs > /tmp/arch9-managed-config.json
```

Compare this inventory with the rehearsal project and explicitly recreate only approved configuration. Do not copy production users, user data, secret values, or production traffic. The required reviews are Auth, Storage, Edge Functions and secret *names*, Cron, Realtime, and application environment variables.
