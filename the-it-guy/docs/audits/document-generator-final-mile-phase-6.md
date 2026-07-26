# Document Generator Final-Mile Phase 6

## Scope

Phase 6 promotes the Phase 0-5 final-mile repair to the production application surface.

The production target is `https://app.arch9.co.za` backed by Supabase project `isdowlnollckzvltkasn` and Vercel project `bridge`.

## Promotion Checklist

1. Keep the two database changes narrow: final completion status truth and Phase 5 lifecycle trace hash-format compatibility.
2. Deploy only the final-mile Edge Function changes: `dispatch-final-signed-document` and `resolve-final-signed-document-access`.
3. Commit the contained source before a guarded production build.
4. Run `npm run build:guarded`.
5. Deploy the Vercel app to production using prebuilt artifacts.
6. Verify live final completion, G1 launch-chain status, and final signed download access.

## Safety Notes

Phase 6 does not loosen the normal final-artifact access fence for new packets. Legacy access is only accepted when a Phase 5 `final_delivery_completed` trace exactly matches the packet, version, organisation, and artifact hash.

The smoke-test delivery behavior remains controlled: reserved test recipients are durably recorded as suppressed and do not call the email provider.

Initial production deployment completed as `dpl_Da7mx1RfrSuExg8fYzpXhRfESD8h` and aliased `https://app.arch9.co.za`.
