# Buyer onboarding notifications

Buyer onboarding first creates a durable outbox event. The behaviour is explicit:

- digital portal: prepare and send an email, recording `sent` or `failed`;
- agent-assisted or hard-copy: prepare an in-app handoff only;
- `TEST — DO NOT ACTION` / `.invalid` recipients: record `skipped`, with no external send;
- failed sends: remain failed until an operator prepares recovery for review. They are never auto-retried.
