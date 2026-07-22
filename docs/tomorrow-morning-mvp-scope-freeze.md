# Tomorrow Morning MVP Scope Freeze

## Decision

**Status: FROZEN**

Target operational date: **Tuesday, 2026-07-21**.

The launch objective is one bounded operating loop:

Lead capture -> outreach -> onboarding links -> Mandate -> OTP -> signing links -> shared roleplayer workspace.

This freeze exists to stop tonight's work from expanding into the larger platform release. A defect blocks launch only when it prevents that operating loop from completing with real users, real links, and the bounded launch organisation.

## Must-Have Capabilities

- Create or import a seller or buyer lead in the agency CRM.
- Log outbound calls, emails, WhatsApps, meetings, and notes against the lead.
- Create or link a seller listing shell from a seller lead.
- Send or copy a seller onboarding link after selecting a transfer attorney.
- Complete seller onboarding through seller self-service or agent-assisted capture.
- Generate a Mandate from the completed seller facts.
- Send or copy a Mandate signing link and open it through the signer portal.
- Create or capture an accepted offer and convert it to a transaction.
- Send or copy a buyer onboarding link.
- Generate an OTP from saved transaction, offer, and onboarding context.
- Send or copy an OTP signing link and open it through the signer portal.
- Verify agent, principal, seller, buyer, attorney, and invited partner access to their relevant workspace or portal.

## Deferred Until After Launch

- Multi-organisation rollout.
- Attorney accounting depth.
- Attorney calendar depth.
- Bond workflow depth.
- Commercial pipeline scope.
- Advanced dashboard polish.
- Settings cosmetic work.
- Dependency audit remediation.
- Broad migration freeze retirement.
- Non-blocking governance recertification.
- Inbound email capture, if manual capture and outreach logging are operational.

## Fallbacks Allowed

- Manual lead creation is acceptable while inbound email capture is being verified.
- Manual copy of onboarding and signing links is acceptable when email provider delivery is slow, provided the link opens and activity is logged.
- Agent-assisted onboarding is acceptable when the client cannot complete the portal before the morning launch window.

## Change Control

Default decision: **defer**.

No capability may enter tomorrow morning's launch path unless it names:

- the affected files or configuration;
- the exact must-have capability it unblocks;
- the verification command or live smoke;
- the rollback or fallback.

Anything else waits until after the first real lead-to-document operating loop is live.
