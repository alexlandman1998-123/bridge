# Agency Partner Network Refactor

## Objective

The agency Partner Network is the canonical source of truth for external relationships.

Transactions should not create partner relationships. Transactions consume connected partner organisations, their services, their people, and routing defaults.

## Canonical Model

- Agency
- Partner Network
- Connected partner organisations
- Partner services
- Partner people
- Partner offices, branches, and regions
- Partner routing defaults
- Transaction assignments

## Canonical Workflow Terms

Use these terms consistently:

- **Invite**: onboarding only. It brings a partner organisation or person onto Arch9.
- **Instruction**: work delivery to an attorney already connected to Arch9.
- **Application Request**: work delivery to a bond originator already connected to Arch9.
- **Assignment**: the transaction-level link between the transaction, partner organisation, service, and optional person or queue.

Do not call work delivery to an existing connected partner an invite.

## Transaction Partner Assignment Contract

Every partner delivery path returns the same canonical assignment shape:

- `transaction_id`
- `agency_organisation_id`
- `partner_organisation_id`
- `partner_connection_id`
- `partner_service_type`
- `partner_role`
- `assigned_person_id`
- `assigned_queue_id`
- `delivery_type`
- `assignment_status`
- `onboarding_invite_id`
- `work_item_id`
- `source`
- `routing_rule_id`
- `created_by`
- `accepted_at`
- `activated_at`
- `cancelled_at`

Assignment statuses:

- `pending_onboarding`
- `active`
- `declined`
- `cancelled`
- `completed`

Delivery types:

- `attorney_instruction`
- `bond_application_request`
- `development_collaboration`
- `manual_external_contact`

Source values:

- `routing`
- `manual`
- `override`
- `import`
- `fallback`

## Partner Organisation Lifecycle

Partner organisations can be:

- `pending`
- `connected`
- `suspended`
- `disconnected`

Pending organisations remain visible for onboarding and follow-up, but automatic routing should only use connected partners unless a transaction override explicitly permits another choice.

## Services

Connected partners advertise services. Routing should target services, not loose emails or temporary contacts.

Canonical services currently used by transaction routing:

- `property_transfers`
- `bond_registrations`
- `bond_cancellations`
- `bond_origination`
- `development_sales`
- `stock_feeds`
- `municipal_services`
- `compliance_services`

## Routing Priority

The existing resolver remains the routing engine. The Partner Network feeds it connected organisations, services, and people.

Priority:

1. Transaction override
2. Agent/user preferred partner
3. Development rules
4. Team rules
5. Branch rules
6. Region rules
7. Organisation rules
8. Partner queue
9. System fallback

Manual transaction selections always override automatic routing.

## Delivery Paths

### Path 1: Existing Partner On Arch9

When the partner organisation is already connected and active:

1. Do not create a platform invite.
2. Create a transaction partner assignment.
3. Create the relevant partner-side work item:
   - Transfer Attorney: Instruction to Attorney / Transfer Matter.
   - Bond Attorney: Instruction to Bond Attorney / Bond Registration Matter.
   - Cancellation Attorney: Instruction to Cancellation Attorney / Cancellation Matter.
   - Bond Originator: Application Request / Bond Application.
   - Developer: Development Collaboration / Stock or Sale Context.
4. Notify the partner person or queue inside Arch9.
5. Show the work inside the partner's own workspace.
6. Sync partner status updates back to the agency transaction.

### Path 2: Partner Not On Arch9

When the partner organisation or contact is not connected:

1. Create or reuse a pending partner organisation/prospect.
2. Create a platform invite for onboarding.
3. Create a pending transaction partner assignment.
4. Attach the instruction/application request payload to the pending assignment.
5. Send the email invite with transaction context.
6. After acceptance:
   - Create or link the organisation.
   - Create or link the user.
   - Activate the partner connection.
   - Convert the pending assignment to active.
   - Create the partner-side work item.
   - Notify the partner inside Arch9.

## Invitations Are Onboarding

Invitations are onboarding mechanics, not the workflow itself.

The onboarding flow is:

1. Agency creates or finds a partner organisation.
2. Agency invites the organisation/contact onto Arch9.
3. The organisation accepts and creates or links an Arch9 account.
4. The organisation becomes a connected partner.
5. Routing becomes available from the Partner Network.

Transaction partner invitations remain useful as a fallback where a transaction needs a role player before the partner organisation has been fully onboarded.

Invitation records should not be created for partners already connected to the platform unless the agency is explicitly inviting a new person into that partner organisation.

## First Implementation Pass

This pass keeps existing routing and transaction plumbing intact while moving the contract toward Partner Network as the source of truth:

- Partner connections now normalize service offerings.
- Partner routing validates that a connected partner offers the requested service.
- Direct person routing now requires an active validated person for that service.
- Development routing rules are included in resolver priority.
- Transaction creation preserves object-shaped partner connection context.
- Partner Network delivery workflow helpers now distinguish existing connected partner delivery from external partner onboarding.
- Canonical transaction invite creation is reserved for the external onboarding path and is attempted for transfer attorney, bond attorney, cancellation attorney, bond originator, and developer roles.
