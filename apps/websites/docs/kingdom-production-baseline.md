# Kingdom production baseline

This check protects the current live Kingdom website while the multi-tenant public-websites platform is strengthened. It makes only read-only `GET` requests to `https://www.kingdomrealestate.co.za`; it does not send a lead, write to Arch9/Supabase, change a domain, or deploy anything.

Run the check before and after a public-websites release candidate:

```bash
npm --prefix apps/websites run baseline:kingdom
```

It verifies the public routes, response status, metadata, navigation, the visible contact/lead-form presence, robots policy, and sitemap. The expected values are intentionally stored in `kingdom-production-baseline.json` so a material public-site change needs an explicit review.

To intentionally replace the baseline after approved Kingdom website work, first run the normal check and review the intended change, then record a new snapshot:

```bash
npm --prefix apps/websites run baseline:kingdom:record
```

Recording a baseline only writes the local tracked JSON file. It makes no production changes. Do not record a new baseline merely to make an unexpected failure pass.

## Release rule

For LWP or shared public-website work, `baseline:kingdom` must pass before a release is approved. If it fails, stop promotion, review the changed route, and either fix the regression or obtain explicit approval for the Kingdom change before replacing the baseline.
