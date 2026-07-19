# Arch9 MVP — 3A staging environment confirmation

Before linking Supabase or applying a migration, load staging-only environment values into the release worktree and run:

```bash
MVP_TARGET_ENV=staging \
MVP_STAGING_PROJECT_REF=<staging-project-ref> \
SUPABASE_URL=https://<staging-project-ref>.supabase.co \
VITE_SUPABASE_URL=https://<staging-project-ref>.supabase.co \
SUPABASE_ANON_KEY=<staging-anon-key> \
VITE_SUPABASE_ANON_KEY=<staging-anon-key> \
npm run mvp:staging:environment
```

The check emits only configuration presence and matching status; it never prints key values or performs a network request. It must return `staging_environment_confirmed` before 3B or 3C.

Do not use production values, and do not commit any `.env` file or key material.
