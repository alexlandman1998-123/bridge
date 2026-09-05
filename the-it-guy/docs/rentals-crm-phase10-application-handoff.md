# Rentals CRM Phase 10 — Application Handoff

Phase 10 connects the tenant CRM pipeline to the existing rental application capture surface.

An agent may optionally select a tenant lead currently at `Application pending` while saving an application. Once the application capture returns its reference, the linked lead advances to `Application submitted` using the existing evidence gate. The application capture remains valid even if the later lead-stage write fails; the UI reports that partial outcome explicitly rather than claiming the lead progressed.

The handoff does not approve an application, run screening, verify FICA, reserve a listing, or create a tenancy.
