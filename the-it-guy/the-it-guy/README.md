
## Development buyer leads

The agency Leads screen separates **Buyer**, **Seller**, **Development** and
**Archived**. A buyer with a development link appears only under Development;
archived records remain together. Routing uses structured enquiry development
IDs, the selected/enquired listing's development, or a development lead's
`source_lead_id` link. Development names in free text do not change the category.
The read joins preserve the original agency lead ID, contacts, assignment,
appointments, documents and history. Protected developer buyer details are not
read or copied.

Development leads reuse the buyer list, board, creation form and workspace.
Their journey adds **Unit Selection & Reservation** between **Viewing /
Presentation** and **Buyer Onboarding**, followed by **OTP** and **Transaction**.
Reservation status comes from the linked development record; moving a pipeline
card does not reserve inventory or mark a payment received. Existing transactions
remain accessible when older reservation history is missing. New enquiries may
select a development without selecting a unit, using the existing structured
lead enquiry field. No database migration is required.

Focused checks: `npx vitest run src/pages/agency/__tests__/developmentBuyerLeads.test.js src/pages/agency/__tests__/agencyLeadListReadRepository.agentScope.test.js src/pages/agency/__tests__/AgencyLeadListRoutePage.agentScope.test.jsx src/pages/agency/__tests__/LeadListPage.kanban.test.jsx src/pages/agency/__tests__/AgencyPipelinePage.initialization.test.jsx`
and `node src/services/__tests__/buyerJourneyAlignmentService.test.js`.
These use local fixtures and make no hosted writes or email sends.
