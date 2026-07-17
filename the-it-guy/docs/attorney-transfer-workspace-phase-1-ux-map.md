# Attorney Transfer Workspace — Phase 1 UX Map

## Outcome

Phase 1 defines one information architecture for the transfer workspace. It does not change the visible page. The contract in `src/constants/attorneyTransferWorkspacePresentation.js` is the source of truth for the layout work in later phases.

## Page hierarchy

1. Compact matter header
   - Overall status
   - Current phase
   - Progress
   - Assigned attorney
2. Do this next
   - One primary action
   - Why it matters
   - Due date
   - Responsible party
3. Workflow phases
   - Steps
   - Required information
   - Documents
   - Evidence
   - Activity

The current phase opens automatically. Completed and future phases remain collapsed unless the user opens them.

## Transfer phase map

| Phase | Steps | Count |
| --- | --- | ---: |
| Open File | Instruction received; Matter opened; OTP/source documents checked; Title deed checked; Existing bond confirmed | 5 |
| Parties & FICA | Buyer FICA requested, received and approved; Seller FICA requested, received and approved; Entity authority checked | 7 |
| Duty & Clearances | Duty assessment, submission and receipt; Rates figures, payment and clearance; Levy request and clearance; Compliance certificates | 9 |
| Documents, Signing & Guarantees | Transfer documents; Buyer scheduling and signing; Seller scheduling and signing; Guarantees requested, received and accepted | 8 |
| Lodgement & Registration | Lodgement pack; Lodgement ready; Lodged; On prep; Registered | 5 |
| Close-Out | Final accounts; Registration letter; Matter closed | 3 |

All 37 workflow steps have exactly one phase owner. Data requirements, document requirements, and evidence inherit the phase of their owning step.

## Existing content ownership

| Current surface | New owner | Decision |
| --- | --- | --- |
| Header status and metric cards | Compact matter header | Combine into one summary; remove repeated status values |
| Workflow Progress phase cards | Workflow phase accordion | Replace non-interactive cards with expandable phase rows |
| Current Focus | Expanded current phase | Remove as a separate panel |
| Next Actions | Do this next or owning phase | Only the highest-priority action appears above the phases |
| Readiness | Owning phase | Show beside the requirement it describes |
| Current Evidence | Owning phase evidence section | Remove from the right rail |
| Requirements and Documents | Owning phase information/document sections | Remove the page-level catch-all panel |
| Workflow Snapshot | Compact header and phase summaries | Remove as a separate card |
| Coordination and follow-ups | Owning phase activity/action area | Keep contextual; do not create another permanent rail |

## Status vocabulary

The presentation layer uses only:

- Complete
- In progress
- Waiting
- Blocked
- Not started

Operational statuses may remain more detailed in the data model, but the workspace must translate them into these five user-facing states.

## Action audit

| Current action type | Current result | Intended result | Alignment |
| --- | --- | --- | --- |
| `assign_attorney` | Opens assignments | Open the relevant assignment selector | Aligned |
| `request_document` | Opens a document request draft | Open a prefilled request linked to the requirement | Aligned |
| `request_corrected_document` | Opens a correction request draft | Open a request linked to the rejected document | Aligned |
| `complete_stage_evidence` | Opens a completion draft | Show evidence and complete the selected step | Aligned |
| `update_matter_data` | Opens an Add Data Note draft | Open and save the actual missing field | Misaligned |
| `manage_signing` | Opens an internal note draft | Open a signing form | Misaligned |
| `resolve_blocker` | Opens a resolution note draft | Capture resolution and update the blocked step | Misaligned |
| `review_workflow` | Opens a review note draft | Open and focus the relevant phase item | Misaligned |

Misaligned actions must not be promoted as primary buttons in the new layout until their handler matches their label.

## Phase 2 hand-off rules

- Use the exported phase map; do not recreate phase matching inside the page component.
- Render a single-column layout with no permanent right rail.
- Show one primary action above the phase list.
- Auto-expand the current phase.
- Do not show the same status, requirement, or action in multiple panels.
- Preserve existing workflow mutations until the Phase 4 action-wiring work replaces them.

