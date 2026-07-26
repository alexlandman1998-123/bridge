# Document Generator Final-Mile Phase 7

## Scope

Phase 7 is post-live observation for the final-mile document generator repair.

The production target is `https://app.arch9.co.za` backed by Supabase project `isdowlnollckzvltkasn`. The expected promoted release is `05f5f20d14ee3a6e1ef50b8c180b078cf28a7b77`.

## Monitor

Run the non-dispatching production monitor from the app package:

```bash
node --env-file=.env.production.local scripts/document-generator-final-mile-phase7-production-observation.mjs --write
```

The monitor checks the live release manifest, final completion truth, G1 launch-chain evidence, final-artifact delivery rows, Phase 5 lifecycle traces, and final signed access for the recovered OTP and mandate packets.

## Safety Notes

This phase does not send email and does not invoke `dispatch-final-signed-document`. It reads production evidence and calls `resolve-final-signed-document-access` to prove the final signed artifact is available. That resolver may record its normal access trace, but Phase 7 does not mutate customer document state, recipient delivery state, or provider email state.

Any signed download URL is redacted to `hasDownloadUrl: true`. Recipient email addresses are not selected or printed.

## Acceptance

Phase 7 is healthy only when both pinned packets are `completed_everywhere`, every signer has a latest `sent` final-artifact delivery, `final_delivery_completed` trace evidence exists, the G1 chain has matching delivery counts, and the final signed PDF is downloadable through the workspace access resolver.
