# Phase 6 — automatic updates and linked matter conversation

Implemented locally. Not deployed; hosted multi-role acceptance remains outstanding.

## Routine updates

The conversation reader projects the durable Phase 3 task event ledger directly. Each genuine outcome change has one stable `task:<commandId>` entry, shared with every authorised recipient. No-op saves are excluded. Client wording comes only from the task catalogue plus an explicit outcome: completed, completed externally, not applicable, reopened, in progress, waiting or blocked. It never interpolates work packets, private notes, evidence, document URLs or contact details.

This is automatic in-app publication, not a second manual attorney action. No new emails, push notifications or notification-queue entries are generated. Existing notification preferences/delivery remain separate.

## Conversation

New messages are stored once in `journey_private.messages`. Both the common legal journey and attorney overview/history expose the same conversation. The existing buyer/seller reply handler and professional discussion forms write into it; professional history also reads its messages alongside historical notes.

Audiences are explicit and enforced in the database:

| Audience | Readers |
| --- | --- |
| Everyone | Authorised professionals, buyer and seller |
| Professionals | Authorised professionals only |
| Buyer + professionals | Buyer and authorised professionals |
| Seller + professionals | Seller and authorised professionals |
| Private — only me | Author only, while still authorised on the matter |

The professional composer defaults to professionals, not clients. Portal users can choose everyone or their own party plus professionals. Read-only users see no composer. Attorney posting uses existing lane `shared_updates` / `internal_notes` capabilities; other professional posting uses the existing transaction `comment` permission. The server derives authors from credentials; it does not accept caller-supplied author IDs or roles.

Buyer replies use the existing validated buyer portal link. `seller-` replies require the seller password session, and the server resolves and checks the linked matter. A portal header cannot inherit a concurrent professional login's rights. Wrong, inactive or expired access fails closed.

Public status-share/external-share trackers do not mount this conversation. Buyer/seller UI variants require the explicit portal access context and cannot fall back to a professional login.

Message inserts and refresh-signal advancement commit together. A stable command ID supports retry without duplicate messages; mismatched reuse is rejected. Plain text is rendered as text, not HTML. A message is limited to 4000 characters. The feed shows the latest 100 entries; durable history is retained in the database.

## Compatibility

Historical discussion, lane-specific updates and private notes are not bulk copied or reclassified. Their existing history remains available, and operational/evidence-specific actions retain their separate functionality. Legacy internal discussion submitted through the updated form becomes an author-only private message; wider professional discussion must explicitly use the professionals audience. Phase 7 should review historical mapping rather than guessing which old content is client-safe.

## Release

Apply `20260908153913_shared_matter_conversation.sql` after the Phase 3–5 migrations, then deploy the matching bundle. No production records, passwords, permissions or notification settings were changed during implementation.

Verification commands (from `the-it-guy` app directory):

- `PGLITE_MODULE=<isolated PGlite module> node scripts/shared-matter-conversation.test.mjs`
- `node scripts/shared-matter-conversation-ui.test.mjs`
- `node scripts/shared-matter-journey-views.test.mjs`
- `npm run build`

SQL tests use isolated permission fixtures and cover five audiences, professional read-only denial, buyer/seller attribution, wrong/expired sessions, private-function/table boundaries, idempotency, atomic rollback and all seven task outcomes. Mounted React tests cover audience options, secure seller credentials, escaped text, unchanged-message retry, read-only rendering and clearing data after access failure. These are not substitutes for staging tests with real memberships and portal sessions.
