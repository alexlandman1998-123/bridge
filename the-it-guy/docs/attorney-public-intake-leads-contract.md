# Attorney Public Intake and Leads CRM Contract

Phase 1 freezes the product and domain contract for the Attorney public journey and Leads CRM. It introduces no database migration, route, UI, public submission endpoint, or runtime integration.

## Product boundary

Attorney Leads and Incoming Matters are separate products with separate sources and lifecycle rules.

| Workspace | Meaning | Canonical source | Exit |
| --- | --- | --- | --- |
| Leads | Potential future work that the firm must pursue and qualify. | Public intake or manual capture. | Won, lost, archived, or deliberately converted. |
| Incoming Matters | Formal transfer instructions routed through the ARCH9 transaction network. | Transaction and attorney-assignment readiness state. | Accepted into active Matters, declined, removed, or completed. |
| Matters | Accepted operational legal work. | Accepted instruction or a future deliberate firm-originated conversion command. | Existing Matter workflow. |

Public enquiries must never be inserted into, projected into, or made visible through Incoming Matters. The Incoming Matters queue, blocker logic, acceptance, decline, audit, and active-Matter handoff remain governed by `docs/attorney-incoming-matter-queue-contract.md`.

## Canonical first-release services

The database and application use stable keys. Labels may be changed later without changing stored values.

| Key | First-release label |
| --- | --- |
| `transfer_quote` | Request a Transfer Quote |
| `property_transfer` | Property Transfer Assistance |
| `bond_registration` | Bond Registration |
| `bond_cancellation` | Bond Cancellation |
| `property_legal_advice` | Property Legal Advice |
| `general_enquiry` | General Enquiry |

The first release does not provide a form builder or configurable service catalogue.

## Lead lifecycle

Funnel stage and lifecycle status are distinct.

### Funnel stage

- `new`
- `contacted`
- `qualified`
- `quote_sent`
- `follow_up`
- `won`
- `lost`

### Lifecycle status

- `open`: all active stages from `new` through `follow_up`
- `won`: stage is `won`
- `lost`: stage is `lost`
- `archived`: administratively retained but removed from the active funnel

Changing a stage must record the previous stage, next stage, actor, and timestamp in Lead activity history. Winning a Lead does not create a Matter automatically.

## Source and campaign attribution

Allowed source-channel keys are:

- `instagram`
- `facebook`
- `linkedin`
- `website`
- `whatsapp`
- `email`
- `qr`
- `referral`
- `manual`
- `other`

Known aliases may be normalised to these values. Unknown or manipulated values become `other`. Source and campaign values are analytics metadata only: they cannot resolve an organisation, select an assignee, bypass validation, or influence authorisation.

Campaign codes are lower-case, bounded to 80 characters by default, and limited to letters, numbers, dots, underscores, and hyphens. Raw attribution may only be retained in bounded, non-public audit metadata.

## Canonical public link

- Each Attorney organisation has one canonical organisation-level journey link.
- The intended route is `/journey/:slug`.
- The slug is a public locator, not an authentication secret.
- The slug must not contain or expose the raw organisation UUID.
- The server resolves the destination organisation from the active link; the browser never supplies or chooses `organisation_id`.
- The link must resolve only an active Attorney firm and its backing organisation.
- Disabled, archived, deleted, or invalid links return a neutral unavailable response.
- The first release has no employee-specific pages, iframe embedding, custom domains, or white-label domain plumbing.

## Submission contract

A valid public submission:

1. Resolves an active public link server-side.
2. Uses one of the canonical service keys.
3. Supplies first name, surname, a usable contact method, and affirmative privacy consent.
4. Carries a browser-generated idempotency key across retries.
5. Creates or reuses a Contact inside the resolved organisation.
6. Creates exactly one Attorney Lead for one logical submission.
7. Creates Attorney-specific details and an initial activity entry.
8. Produces a public-safe confirmation only after durable persistence.

Anonymous clients receive no direct access to shared Leads, Contacts, activities, assignment history, or internal organisation data. Submission must pass through a narrow server or Edge Function boundary and an atomic database command.

## Contact and duplicate rules

- Contact matching is scoped to one organisation.
- Exact normalised email or phone may be treated as a strong match.
- Names alone are never sufficient for automatic matching.
- Reusing a Contact does not suppress a new, legitimate enquiry; one Contact may own multiple Leads.
- Only the same public-link and idempotency-key pair automatically returns the same Lead.
- Similar submissions may be flagged for review but must not be silently merged or discarded.
- Refresh and retry must not create a second Lead for the same logical submission.

## Assignment contract

- New public Leads begin unassigned.
- `assigned_user_id` is the canonical Attorney owner.
- First-release assignment is manual to an active member of the same Attorney firm.
- Inactive or cross-firm users cannot receive assignment.
- Reassignment records previous owner, new owner, actor, reason, and timestamp.
- Advanced department queues and automatic routing are deferred.

## Permission matrix

The matrix defines the target behavior for later application permissions and RLS. Database enforcement remains mandatory even when the UI hides an action.

| Role group | Visibility | Create | Edit/status/follow-up | Assign | Archive |
| --- | --- | ---: | ---: | ---: | ---: |
| Owner, partner, director, firm admin, director partner | All firm Leads | Yes | Yes | Yes | Yes |
| Branch manager, admin staff, reception/scheduling | Branch Leads | Yes | Yes | Yes | No |
| Attorney, conveyancer, transfer attorney, bond attorney, candidate attorney | Assigned Leads plus unassigned queue | Yes | Yes | No | No |
| Paralegal, conveyancing secretary | Assigned Leads | Yes | Yes | No | No |
| Viewer | Assigned Leads | No | No | No | No |

The exact mapping between legacy `attorney_firm_members.role` values and organisation membership roles must be tested when RLS is implemented.

## Activity and audit contract

At minimum, activity history records:

- Public Lead created
- Manual Lead created
- Status/stage changed
- Assigned or reassigned
- Note added
- Follow-up date changed
- Conversion started, completed, or failed when conversion is implemented

Activities are tenant scoped and must reference a Lead in the same organisation.

## Conversion boundary

Lead-to-Matter conversion is deliberately deferred from the public-intake demo path.

The future command must:

- Be explicit and user initiated.
- Require the user to select Transfer, Bond, or Cancellation where applicable.
- Validate type-specific required data.
- Reuse or create the client/party safely.
- Create or link the platform transaction.
- Create the correct firm-specific Matter or attorney-assignment representation.
- Link the Lead, transaction, and resulting Matter for audit.
- Be atomic and idempotent.
- Mark the Lead won only after successful conversion.
- Never route a firm-originated Lead through Incoming Matters.

The existing agency `createTransactionFromLeadOverride` path is not the Attorney conversion command.

## First-release exclusions

- Lead-to-Matter conversion
- Email or marketing automation
- Configurable service catalogue
- Drag-and-drop form builder
- Individual employee journey pages
- Iframe embedding
- Custom domains
- Advanced campaign management
- AI scoring
- Automatic department routing
- Changes to Incoming Matters

## Phase 1 exit gate

Phase 1 is complete when:

- This contract is present.
- The canonical keys have pure automated coverage.
- The Incoming Matters regression baseline passes.
- No migration exists for this phase.
- No production behavior has changed.

