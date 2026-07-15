# Attorney Legal Role Coordination Contract v1

## Purpose

This contract is the Phase 1 source of truth for coordinating the three transaction-level legal roles in a South African property transfer. It separates appointment, platform invitation, and legal instruction so that later UI, database, permission, and automation work does not treat those events as interchangeable.

The executable contract lives in `the-it-guy/src/core/transactions/legalRoleCoordinationContract.js`.

## Core Distinction

1. **Appointment or nomination** identifies the firm authorised for the role.
2. **Platform invitation** gives that firm access to the transaction in Bridge.
3. **Legal instruction** authorises the firm to perform the legal work.

An accepted Bridge invitation does not prove that a bank instruction has been issued. Capturing contact details does not prove invitation acceptance. A transaction participant must not be made active merely because their details are known.

## Authority Matrix

| Legal role | Appointment authority | Primary Bridge inviter | Fallback inviter | Formal instructor |
|---|---|---|---|---|
| Transfer attorney | Seller | System or agent | Seller, principal or admin | Seller |
| Cancellation attorney | Existing bondholding bank | System or accepted primary transfer attorney | Transfer-firm manager, agent, principal or admin | Existing bondholding bank |
| Bond attorney | New lending bank | System or accepted primary transfer attorney | Transfer-firm manager, bond originator, agent, principal or admin | New lending bank |

The transfer attorney coordinates the bank-appointed roles but does not choose them. Fallback inviters may capture and invite only when the bank appointment is evidenced.

## Canonical States

| State | Dimension | Meaning |
|---|---|---|
| `not_required` | Requirement | The transaction facts do not require the role. |
| `awaiting_trigger` | Requirement | The role is required, but the event that starts appointment work has not occurred. |
| `awaiting_appointment` | Appointment | The seller's transfer-attorney nomination is outstanding. |
| `awaiting_bank_appointment` | Appointment | The relevant bank has not yet identified its appointed firm. |
| `appointment_captured` | Appointment | The authorised appointment or nomination is recorded with evidence. |
| `invite_pending` | Platform invitation | An invitation is ready to be sent or resent. |
| `invite_sent` | Platform invitation | The appointed firm has been invited to Bridge. |
| `invite_accepted` | Platform invitation | The appointed firm accepted Bridge access; this is not legal instruction confirmation. |
| `instruction_confirmed` | Legal instruction | The appointing party's formal instruction has been confirmed. |
| `active` | Matter | The firm may work in its assigned legal lane. |
| `declined` | Matter | The invitation or instruction was declined. |
| `replacement_required` | Appointment | A new authorised firm must be identified. |
| `completed` | Matter | The role's legal work is complete. |

## Transition Rules

### Transfer attorney

`awaiting_trigger → awaiting_appointment → appointment_captured → invite_pending → invite_sent → invite_accepted → instruction_confirmed → active → completed`

The transfer instruction remains governed by the existing incoming-matter contract. The signed OTP is the normal readiness trigger for formal transfer-instruction acceptance.

### Bond and cancellation attorneys

`awaiting_trigger → awaiting_bank_appointment → appointment_captured → invite_pending → invite_sent → invite_accepted → instruction_confirmed → active → completed`

Decline or replacement paths move to `replacement_required`, then return to the applicable appointment state. If the replacement appointment is already evidenced, the flow may return directly to `appointment_captured`.

The transition contract deliberately rejects `invite_accepted → active`; `instruction_confirmed` must occur first.

## Invitation Guard

A bank-appointed legal-role invitation requires:

- confirmed appointment evidence;
- an actor authorised for that target role; and
- for a transfer attorney or transfer-firm manager, an accepted transfer instruction.

An individual transfer attorney must be the primary transfer attorney for the matter. A bond originator is a fallback inviter for the bond attorney only.

## Firm and Individual Assignment Boundary

The transaction appoints and invites a **firm** for a legal role. After that firm accepts the Bridge invitation, a manager belonging to the appointed firm assigns its own primary attorney, secretary, admin handler, and department. The transfer attorney coordinates the external firm invitation but may not choose another firm's internal staff.

## Canonical Events

- `legal_role_requirement_detected`
- `legal_role_appointment_awaited`
- `legal_role_appointment_captured`
- `legal_role_invite_prepared`
- `legal_role_invite_sent`
- `legal_role_invite_accepted`
- `legal_role_instruction_confirmed`
- `legal_role_activated`
- `legal_role_declined`
- `legal_role_replacement_required`
- `legal_role_completed`

## Phase 1 Boundary

Phase 1 introduces the reusable rules and tests only. It does not change the deal wizard, persist bank-appointment records, alter RLS, change invitation acceptance, backfill existing matters, or activate reminders. Those changes consume this contract in later phases.
