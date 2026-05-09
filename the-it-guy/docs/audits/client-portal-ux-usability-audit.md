# Client Portal UX/UI Audit & Usability Refactor (Post Phase 7)

## 1. Executive Summary
The portal has strong functional coverage after Phases 2–7, but usability friction remained in three high-impact areas: action hierarchy, document cognitive load, and recovery states. The biggest issue was that the new Document Centre and legacy document workspace were rendered together by default, creating duplicated information and overwhelming first-time users. Next Actions were visible, but appeared after other dense content in Overview.

This pass focused on practical clarity improvements without a full redesign:
- Prioritised “What You Need To Do Now” earlier in Overview.
- Reduced visible action noise by showing top-priority actions first.
- Kept legacy document tooling, but moved it behind an explicit advanced toggle.
- Replaced fragile loading/error shells with clearer, reassuring, actionable states.

## 2. Critical UX Problems
- Next actions were not visually first in the core overview flow.
- Documents page had duplicate systems visible at once (new centre + legacy tabs).
- Error and loading states were low-trust and minimally actionable.
- “Updates / Activity” terminology sounded internal rather than client-guided.

## 3. Information Hierarchy Issues
- Before: Journey + updates were presented before focused action execution.
- Before: completed/historical UI in advanced docs competed with immediate tasks.
- Fix: “What You Need To Do Now” is now surfaced ahead of journey/update depth.
- Fix: advanced document workspace is opt-in.

## 4. Mobile UX Issues
- Long document pages had high scroll cost due to duplicate sections.
- Notification and action density could feel heavy when stacked.
- Fix: default mobile path now routes users through the concise Document Centre first, with optional advanced expansion.

## 5. Cognitive Load Issues
- Too many concurrent cards and repeated document representations.
- Too many visible actions at once for first-pass decision making.
- Fix: action list now defaults to top priorities and shows count of hidden secondary actions.

## 6. Notification Problems
- Durable architecture exists, but value depends on concise surface behavior.
- Risk: panel can become noisy if users don’t need full detail immediately.
- Mitigation in this pass: unread count and mark-read flows remain clear; action-first copy retained.

## 7. Activity Feed Problems
- “Updates / Activity” wording read as system-centric.
- Fix: renamed client-facing section to “Recent Updates” with simpler subtitle.

## 8. Document Centre Problems
- High duplication with legacy tabs made required vs optional unclear.
- Rejected docs needed stronger proximity to required docs.
- Fix: section order now emphasizes urgency:
  1) Required From You
  2) Rejected / Needs Attention
  3) Additional Requests
  4) Uploaded / Under Review
  5) Approved / Completed
  6) Signed Documents

## 9. Educational Content Problems
- Educational content is useful, but could compete with action execution if shown too early/often.
- Current approach is acceptable: short contextual snippets on actions/documents plus stage guide.
- Recommendation: keep long-form content progressively disclosed.

## 10. Trust/Reassurance Gaps
- Previous loading/error states did not reassure users or offer clear next steps.
- Fix: improved loading and failure copy with direct recovery actions.

## 11. Empty/Error State Issues
- Empty states are generally present, but top-level failure UI needed improvement.
- Fix implemented:
  - Better loading panel copy.
  - Error panel with `Retry` and `Go to Home` actions.
  - Clear explanation for expired/invalid/temporary failures.

## 12. Accessibility Issues
- Good baseline from semantic buttons/links and visible labels.
- Remaining risks:
  - Dense card surfaces may reduce scan speed for cognitive accessibility.
  - Further contrast/keyboard audits should be run with tooling.

## 13. Recommended UI Refactors
High-impact done now:
- Prioritize immediate actions in Overview.
- De-duplicate Documents by default (advanced toggle).
- Improve top-level loading and error recovery UX.
- Simplify section language (“Recent Updates”, “What You Need To Do Now”).

Next recommended refinements:
- Add “urgent only” filter in notifications.
- Add action grouping in Next Actions (`Do now`, `Waiting`, `Completed`).
- Add sticky mini action bar on mobile Overview.
- Add compact mode in activity feed to reduce vertical noise.

## 14. Recommended Priority Order
1. Keep action-first hierarchy and monitor completion rate.
2. Continue reducing document/notification noise.
3. Tighten mobile first-scroll experience (action bar + stage chip).
4. Run accessibility pass (contrast, focus, SR labels, touch target checks).
5. Calibrate educational density from usage analytics.

## High-Impact Fixes Implemented In This Pass
- Overview hierarchy refactor to show critical actions earlier.
- Action count simplification (top 4 actions by default with overflow indicator).
- Document experience de-duplication with advanced workspace toggle.
- Document section urgency ordering adjustment.
- Improved loading and error recovery experience with explicit retry path.
- Client-friendly wording updates for updates/activity section.
