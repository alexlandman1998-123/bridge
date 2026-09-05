# Rentals CRM phase 18 — lead outcomes

Phase 18 adds `/agent/rentals/pipeline/outcomes` for recording explicit lead outcomes: won, lost, withdrawn, nurture, or reopened.

Lost leads require a standard reason, withdrawn leads require a reason, and nurture leads require a valid reactivation date. An outcome is stored in the rental CRM metadata and logged as CRM activity; it does not overwrite workflow evidence or advance a stage. By default, active rental CRM queues exclude non-open outcomes, while the outcome register and reporting can request the full history.
