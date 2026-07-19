# Arch9 MVP — Phase 5 post-deploy review

Phase 5 is the release decision between staging acceptance and a controlled production pilot. It is not a feature-development review.

For each of the four Phase 4 staging transactions, an operational reviewer—not a developer and not the Phase 4 journey operator—must independently review the journey and record:

- The journey completed without developer guidance.
- The next action and owner were clear.
- Any blocked/error state was understandable and actionable.
- The post-deploy transaction records, participants, documents, lanes, and gate state were checked.

The review evidence must include `reviewedBy`, `reviewedAt`, `reviewerRole` (`operations`, `conveyancing`, or `administration`), `reviewerIsDeveloper: false`, and `reviewedIndependently: true`. This keeps the usability decision with the people who will operate the MVP.

Log every issue with severity and resolution. `p0`, `p1`, `critical`, and `high` findings must be resolved; lower-priority usability work can be deferred with an owner.

Validate the evidence after Phase 4 passes:

```bash
npm run mvp:phase5:verify -- \
  --journey-evidence=docs/staging-mvp-journeys.json \
  --deployment-evidence=/secure-local-path/staging-deployment-evidence.json \
  --review-evidence=docs/staging-mvp-review.json
```

Do not commit staging contact data, credentials, or customer documents. The evidence files are operational records, not source files.
