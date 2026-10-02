import { createUatReportTestHandler } from './uat-report-test.js';

// Separate from the permanently consumed Basic test. Not customer execution.
export const APPROVED_FULL_TEST = Object.freeze({
  organisationId: '2958d402-368e-43c9-b728-0098e10505f1',
  actorId: 'dde264a9-685e-4ecf-a82a-4eeb2fd8bd23',
  propertyId: 383723,
  productId: 'full_canvassing_report',
  diagnostic: 'single_full_v1_uat',
  purpose: 'User-approved single internal Full v1 UAT report and field/billing verification',
  claimId: '1bf8a22d-fd16-4516-b821-090c8053668c',
  resultId: 'a8c4ee16-e619-47a4-ae2c-77698cae5f77',
  expiresAt: '2026-10-02T00:00:00Z',
  querySha256: 'f9971f118b5793791cc1cd6cb10e60e23eefee3c3581b3cb62e0c0786bfe2e32',
  creditBudget: 20000,
  maxFieldSurcharge: 17575,
});

export default createUatReportTestHandler({ approvedTest: APPROVED_FULL_TEST });
