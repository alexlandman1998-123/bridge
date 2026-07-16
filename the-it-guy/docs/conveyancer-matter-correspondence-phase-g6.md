# Conveyancer matter correspondence and filing — G6

G6 creates the matter-centric communication record a conveyancing practice needs. Incoming and outgoing correspondence can be filed manually before an email provider is connected, while later provider events project into the same canonical record.

## Delivered

- Versioned firm correspondence policies and communication preferences.
- Incoming, outgoing and internal communication directions.
- Email, portal-message, letter, courier, hand-delivery and phone-note channels.
- Matter, organisation, firm, branch, team, lane, actor and policy binding through G1.
- Manual, C2-generated and integrated source provenance.
- Verified reference-only recipients with channel-preference enforcement.
- Confidential, privileged, personal and restricted G2 classifications.
- Thread, reply and chronology relationships.
- Hash-evidenced content and attachment filing.
- Duplicate attachment, provider-message and content/thread detection.
- Document-request correspondence with required evidence types and due dates.
- Independent attorney approval where policy or privilege requires it.
- Reference-only dispatch intents that do not contact a provider.
- Sent, delivered, failed and acknowledged evidence with chronological transitions.
- Reminder, escalation and delivery-failure eligibility without automatic scheduling.
- Source-neutral canonical filing projections.
- Reconstructable, chronological material communication histories.
- Common G1 audit events.

## Manual-first operation

An authorised team member can file an incoming email, letter, phone note or courier record using its source reference and hashes. A future provider adapter may file the same metadata from a signed event, but the resulting matter record has the same canonical shape.

Provider access is therefore useful automation, not a prerequisite for reconstructing the file.

## Approval and dispatch boundary

C2 correspondence remains a draft. G6 binds that draft to recipients, attachments and the matter, then applies the firm’s approval policy. Approval only makes the exact correspondence eligible for a dispatch intent.

G6 never:

- sends a message or calls an email provider;
- creates the underlying document request;
- schedules reminders or escalations;
- marks a matter action complete;
- changes a legal or provider outcome; or
- treats delivery as acknowledgement or acknowledgement as resolution.

## Productisation boundary

G6 is an executable domain contract. It does not persist the register, connect inboxes, upload attachments, install RLS or expose the communication workspace UI.

Run G1–G6 together:

```sh
npm run test:conveyancer-practice-g6
```

G6 adds no database migration.
