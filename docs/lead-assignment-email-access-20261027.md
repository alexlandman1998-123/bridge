# Lead assignment email access correction — 27 October 2026

The primary Arch9 database's legacy `leads_support_role_select` policy treated an
absent JWT email as equal to a blank assigned-agent email. A read-only production
probe with an unknown authenticated actor returned 189 leads. The append-only
`20261027154740_lead_assignment_email_access_guard.sql` migration now requires a
signed-in user and nonblank emails before using that comparison. It retains the
original case-insensitive equality and all explicit user/agent, administrator and
support access paths. The other eleven lead policies, including the restrictive
agency policy, are unchanged. No lead record was edited by this correction.

The fix is applied to production `isdowlnollckzvltkasn`. The same actor now sees
zero leads. Four PostgreSQL fixture tests cover the original exposure, absent/
null/empty/whitespace claims, anonymous access, real email assignments, explicit
assignments, administrator/support access, restrictive-policy composition,
unchanged rows, repeated application and a changed-policy guard. Exact recorded
migration statements match source. Target/recovery guards passed before release.

[Release evidence](../output/remaining-mail-ai-access-20261027/lead-access-release-evidence.json)
contains the aggregate before/after result and policy-preservation checks. This
corrects the confirmed blank-email issue; it is not a claim that every historical
lead access path or privileged RPC has received a complete security audit.
