# Rentals CRM Phase 6 — Lead Workspace

Phase 6 provides a rental-specific lead workspace. It reads one scoped CRM lead and projects only rental metadata, evidence events, shared CRM activities and follow-up tasks.

The workspace is a read model: it does not expose Sales workflow controls, create a duplicate contact, or make an application, screening, mandate or tenancy decision. Visibility first passes through the rental lead scope and is then constrained by the existing CRM repository/RLS path.
