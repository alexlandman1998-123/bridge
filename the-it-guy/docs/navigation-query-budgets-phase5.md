# Navigation and query budgets — Phase 5

Phase 5 turns the navigation and query fixes into release constraints.

| Budget | Limit |
| --- | ---: |
| Report queries while Reports is disabled | 0 |
| Organisation-context resolutions per workspace session | 1 |
| Duplicate identical requests in flight | 0 |
| Primary-menu visual feedback | 100 ms |
| Cached route visible | 500 ms |
| First route visit visible | 1,500 ms |

The app measures menu feedback when the pending navigation UI commits and route visibility when the destination route commits. A route is classified as cached only after its module has successfully loaded or prefetched.

Measurements are bounded to the latest 50 entries in session storage and emitted as the `arch9:navigation-performance` browser event. This instrumentation performs no database or network writes.

Run `npm run test:navigation-query-budgets-phase5` to enforce the complete contract.
