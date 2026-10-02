# Branch workspace overview metrics

The primary application's Overview uses `branchDashboardDataService.js` for reads and `branchDashboardModel.js` for aggregation. The existing Overview/Performance service wrappers and branch conversion helpers share this model. No migration or RPC is required.

## Sources and scope

`getBranch` authorises the organisation and selected branch before querying. Membership, listings, leads and transactions are filtered in the database by organisation and branch. Related appointments, offers, lead activities, commission snapshots and workflow audit records are queried only for those branch record IDs, with organisation scope and existing RLS. Reads paginate at 500 rows and batch relation IDs at 100. Profile photos use only authorised branch member IDs; inaccessible photos use initials. Branch choices load branch metadata without organisation-wide operational records.

| Metric | Definition |
| --- | --- |
| Pipeline / active deals | Current open transactions only; canonical registered/cancelled classification plus rejected, lost, deleted and archived exclusions. Values use recorded sale/purchase price. |
| Projected commission | Latest recorded commission snapshot, transaction amount, actual recorded agent + agency amounts, or an actual recorded transaction/listing percentage. No default percentage. |
| Registered | Actual registration/completion date in the selected reporting period, excluding cancelled records. |
| Conversion | Qualified lead cohort in the selected period that registered in that period, linked by originating buyer lead ID or converted transaction ID. Each lead counts once. |
| Movement | Leads created, legitimate viewing appointments completed/created, submitted offers, transactions created and registrations completed. Daily, weekly or monthly buckets follow the reporting period. |
| Pipeline progression | Leads created in the selected period and their observed qualification, viewing, offer, transfer and registration milestones through period end. Adjacent conversion counts intersecting lead IDs, rather than dividing unrelated current-stage counts. |
| Financials | Registered sales and recorded gross/agency/agent commission, allocated by registration date across the last 12 or 6 calendar months. Actual amounts/split snapshots only. |
| Portfolio | Canonical listing lifecycle states; active includes active, under offer and transaction-created listings. Age uses published/listed/created date. Period affects new listings, not current inventory. |
| Agent ranking | Registered sales value for the reporting period; ties use registered deal count then gross commission. Active listings are a snapshot, leads are period-created assignments, commission is the recorded agent portion. |

## Missing data and comparisons

Missing/denied source reads produce unavailable metrics rather than valid zero totals. Empty accessible sources produce zero. Missing sale values or commission allocations keep the affected totals unavailable; the dashboard never supplies the commission service's default split. Qualification requires a recorded qualification timestamp or recognised qualification activity. A current lead stage alone cannot reconstruct historical qualification. Conversion is unavailable when registrations lack direct lead attribution or the qualified cohort cannot be established.

Historical pipeline/active-deal snapshots are not available from these sources, so those cards omit growth comparisons. Period activity comparisons use the preceding equivalent period, with an elapsed prior-month comparison for This Month. A zero or unavailable comparison denominator omits growth. Financial visibility retains the existing workspace financial-role restrictions; RLS is unchanged.

The cover uses the existing branch `cover_image_url` and branding upload flow. Overview navigation, editing, staff invitations, and other workspace tabs remain in the existing page. Browser verification uses isolated fixtures, not live database records; deployment and live-data validation are separate steps.
