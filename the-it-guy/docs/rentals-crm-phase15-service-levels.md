# Rentals CRM phase 15 — service-level queue

Phase 15 adds `/agent/rentals/pipeline/service-levels`, a read-only service-level queue for existing rental lead follow-ups.

It treats each follow-up due date as an operational commitment and classifies open work as overdue, due within 24 hours, or on track. The queue is scoped to the current rental workspace and shows the lead, role, owner, priority, and due date. It does not infer a lead decision, alter a pipeline stage, or send an external message. Staff complete or re-plan the work from Follow-ups.
