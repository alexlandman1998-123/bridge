# Attorney coordination operating model — Phase 0

## Decision

Transfer, bond-registration, and cancellation work remain role-specific lanes inside one attorney workspace and one canonical transaction record. Separate dashboards may present role-specific queues and actions, but must not create separate matter or progress records.

## Responsibility boundary

| Activity | Accountable actor | Phase 0 rule |
| --- | --- | --- |
| Nominate bond or cancellation firm | Assigned transfer attorney | May select or invite the external firm for that lane. Nomination does not grant access to that firm's staff directory. |
| Accept instruction | Nominated firm | An authorised member of the nominated firm accepts or declines. |
| Allocate attorney and support staff | Responsible firm | Each firm allocates its own people after acceptance. A transfer attorney cannot allocate staff inside an independent firm. |
| Coordinate | Assigned transfer attorney or responsible firm | May view shared progress, request information, comment, and remind without changing lane ownership. |
| Update another lane | Lane owner, or a specifically delegated user | Cross-lane editing is denied by default. Delegation will be matter-, lane-, action-, and time-scoped and will preserve the actual actor. |
| Reassign | Authorised coordinator or firm manager | Replacement must preserve the original nomination, acceptance, decline, and assignment history. |

## Acting on behalf

The assigned transfer attorney does not automatically impersonate a bond or cancellation attorney. Future delegated actions must record the actual user, responsible lane and firm, grant used, action performed, and whether the result is internal, professionally shared, or client visible.

Until the delegation model is implemented, the correct product behaviour is to allow coordination but reject cross-lane updates. This prevents convenience access from silently becoming legal authority.

## Terminology

- **Nomination:** select or invite the external firm responsible for a lane.
- **Firm acceptance:** the nominated firm accepts responsibility for that lane.
- **Internal allocation:** the responsible firm assigns its own attorney and support staff.
- **Coordination:** communicate and monitor without editing another lane.
- **Delegation:** an explicit, auditable, revocable and time-bounded grant to perform defined actions in another lane.
- **Reassignment:** replace a responsible firm or person without deleting history.

## Gate

Run `npm run test:attorney-coordination-phase0`. Phase 1 may change permissions and legacy roles, but it must not weaken this ownership boundary.
