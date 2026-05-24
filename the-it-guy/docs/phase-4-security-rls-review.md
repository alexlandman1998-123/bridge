# Bridge Phase 4 RLS Review

This document records the server-side security direction for Phase 4. React route guards and hidden buttons are UX controls only; production enforcement must live in Supabase RLS policies, RPC/service functions, storage policies, and workspace-scoped queries.

| Table / area | Current risk | Required RLS direction | Priority |
| --- | --- | --- | --- |
| `profiles` | Profile role is module identity; unsafe updates could change module access. | Users may read/update own non-role fields. App-role changes require admin/service path. | P0 |
| `organisations` | Cross-workspace reads expose tenant metadata. | Select only active membership workspaces; insert owner setup; updates require `manage_workspace_settings`. | P0 |
| `organisation_users` | Membership rows drive tenant access. | Users may read own memberships; workspace admins manage users; no member may update their own role/status. | P0 |
| `organisation_branches` | Branch-level leakage affects agency segmentation. | Select by active workspace membership; branch mutations require `manage_branches`; branch-only users scoped to own branch for branch data. | P0 |
| `workspace_invites` | Invite tokens create memberships. | Workspace admins create/revoke; invited email can read/accept pending non-expired invite only. | P0 |
| `workspace_access_requests` | Pending access could leak target workspace names. | Requester reads own requests; admins read/update requests for their workspace. | P0 |
| `transactions` | Highest cross-tenant data leakage risk. | Scope by `organisation_id`; branch/assigned-only policies for agency users; participant/token policies for client links. | P0 |
| `clients` / contacts | Personal information. | Scope by workspace; assigned-only for operational roles; client portal by token/participant only. | P0 |
| `listings` / private listings | Agency inventory leakage. | Scope by `organisation_id`; branch managers by branch; agents by assigned owner/listing agent. | P0 |
| Leads / pipeline tables | Sales pipeline leakage. | Scope by `organisation_id`; branch and assigned-user policies matching permission scopes. | P0 |
| `appointments` / participants | Transaction schedule and contact data. | Scope by transaction workspace; client access by RSVP/portal token only. | P1 |
| Documents / packets / storage | Legal and financial document leakage. | Metadata scoped by transaction/workspace; storage paths include workspace/transaction ids; signed URLs only after permission check. | P0 |
| `attorney_firms` | Separate workspace abstraction remains. | Preserve existing firm membership policies; bridge to unified workspace policy later. | P0 |
| `attorney_firm_members` | Firm roles control legal access. | Users read own memberships; owners/partners manage team; no self role escalation. | P0 |
| Attorney workflow tables | Document approval/stage changes are sensitive. | Firm/matter assignment policies; mutations require legal workflow permissions. | P1 |
| Bond applications | Finance data is highly sensitive. | Scope by bond workspace and assigned consultant/team; bank submission requires explicit permission. | P1 |
| Reports / exports | Bulk leakage risk. | Prefer RPC/export functions that check permission and write audit events before returning data. | P1 |
| `security_audit_events` | Audit logs may reveal sensitive actions. | Insert by authenticated user/service; select only workspace admins/platform admins. | P1 |

Implementation priority:

1. Lock membership, organisation, invite, transaction, client, listing, lead, and document policies.
2. Move destructive/export/approval actions behind RPC or service functions with explicit permission checks.
3. Add branch/team/assigned policies after assignment columns are complete and backfilled.
4. Migrate attorney firm policy semantics into the unified workspace abstraction without breaking existing attorney dashboards.

