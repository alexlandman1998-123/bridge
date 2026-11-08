# Madison Place trust reservations

The primary Arch9 application owns this flow on madisonplace.co.za and the
Madison Place development page. Other developments keep their enquiry flow.

Buyers request one unit, receive a 48-hour hold and EFT instructions for the
fully refundable R10,000 deposit into Tuckers Attorneys' confirmed trust account.
They email proof of payment to the configured address. Proof of payment is not
confirmation of funds. A Samlin development member confirms cleared funds in
Development → Availability → Madison Place reservations. Confirmation records
the user, time and bank reference. Unconfirmed holds expire automatically.
Late payments require staff review; an expired hold cannot be confirmed.

## Activation

This implementation is prepared locally. It does not apply migrations, deploy
functions, send real emails or change live units.

1. Apply the additive Madison trust-reservations migration after the existing
   developer-lead foundation and lead-reservation migration, using the repository
   release guard and runbook with explicit release approval.
2. Deploy `madison-reservations` with its declared import map and JWT verification
   disabled. It authorizes worker calls using the runtime service credential;
   public requests can only call the validated Madison-specific intake path.
3. Configure the existing Resend API key and verified sender, plus
   `MADISON_RESERVATIONS_ENABLED=true`. The two cron jobs require pg_cron,
   pg_net and existing `arch9_project_url` / `arch9_service_role_key` Vault values.
4. Samlin saves confirmed Tuckers trust details, proof-of-payment address,
   notification address and refund terms in Availability. Enable requests only
   after confirming the sender and scheduler work in the target environment.
   No banking details have been supplied or invented.
5. With separately approved test recipients, verify request → hold → both
   emails → manual confirmation → buyer email, and an expired hold's release.
   Check two browsers competing for one unit and other developments' enquiries.

Email work is stored durably with immutable payloads and provider idempotency
keys. Failed/uncertain delivery is visible to Samlin; retries stop before the
provider's 24-hour deduplication window ends. An email failure does not remove a
saved hold or falsely report that the buyer received instructions. Public
availability exposes unit IDs, states and deadlines only, never buyer details.

Focused verification: `node --test scripts/madison-place-reservations.test.mjs`,
`deno test --node-modules-dir=none --allow-env --allow-net
--config=supabase/functions/madison-reservations/deno.json
supabase/functions/madison-reservations/handler.test.ts`, and the public
form/responsive route, unit dialog, visual explorer and Samlin reservation panel
component tests, serially with one Vitest worker.

Local verification: eight database scenarios, five edge handler scenarios and
29 component scenarios pass. Deno checks the deployed entry point. Scoped ESLint
has no errors (the existing visual explorer and landing page retain warnings).
An isolated browser preview verified the mobile request/receipt and desktop
manual-confirmation controls using test data. No full production build, real
email dispatch, hosted migration or live end-to-end reservation was performed.
