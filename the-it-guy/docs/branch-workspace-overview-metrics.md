# Branch workspace overview metrics

The overview model lives in `src/services/branchWorkspaceOverviewService.js`. It begins with the authorised branch returned by `getBranch`, so the same organisation and branch visibility checks used by the workspace apply to every metric.

| Metric | Definition |
| --- | --- |
| Active agents | Active branch members whose role contains `agent`. |
| Active listings | Branch listings not in an inactive, sold, withdrawn, cancelled, archived, or completed state. |
| Active leads | Branch leads not closed, lost, or archived. |
| Active transactions | Branch transactions that are not registered, cancelled, archived, or completed. |
| Transaction pipeline | Sum of `sales_price`, `purchase_price`, or `sale_price` for active transactions only. Listing asking prices are never included. |
| Projected commission | Recorded gross/projected commission amount, or a recorded commission percentage applied to the transaction value. The overview never assumes a default rate. |

The selected URL range (`period`, or `from` and `to`) drives comparison notes, movement chart, funnel, staff snapshot, and recent activity. Needs-attention rules flag open leads or listings without an assigned agent and active transactions with no activity for 14 days.
