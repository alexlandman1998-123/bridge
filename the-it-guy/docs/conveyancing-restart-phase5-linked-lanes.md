# Phase 5 restart: linked lanes and exceptions

Status: partial; no live rollout approval.

Repaired retired transfer-guarantee keys in bond/cancellation journey maps and runtime coordination targets. These now reference `payment_security_review`, matching the consolidated transfer task. Historical aliases remain intact. The transfer workspace also recognises the current key as guarantee-related work.

The cancellation structural checker previously failed on missing transfer guarantee targets; it now passes. The bond structural checker also passes. Dedicated regression checks assert current dependency targets and retained historical aliases. These reports do not demonstrate real UI/database journeys, despite the old scripts' release-gate terminology.

Still required: actionable attorney-defined requirements for exceptional matters, expiry and changed-fact handling, rejection/relodgement/cancellation lifecycle verification, and live linked-lane saves and coordination. Existing free-text exception notes are not an implementation of those requirements. No production changes were performed.

Broader check: `legal-task-workbench-phase3-multilane.test.mjs` fails its source-wide assertion prohibiting `activeLegalWorkflowDetailKey !== 'bond-registration'`. This is unresolved and must be inspected in context, not removed simply to obtain a passing result.
