import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildKnowledgeFactoryReportPdf } from '../src/services/propertyIntelligence/knowledgeFactoryReportPdf.js';

export function fullReportFixture() {
  return {
    id: 'SYNTHETIC-REPORT-ONLY', product_id: 'full_canvassing_report', property_id: 'DEMO-001',
    executed_at: '2026-10-19T10:00:00Z', report_snapshot_version: 'canvassing-report-v1',
    report_definition_snapshot: { name: 'Full report / fictional local verification', definitionVersion: 'v1', costValidationRecipeId: 'package_full_v1', excludedFields: ['Phone numbers', 'Original title deed'] },
    request_context_snapshot: { requestPurpose: 'Fictional local layout verification; no supplier request' },
    report_data: {
      property: { propertyId: 'DEMO-001', address: '24 Example Lane - FICTIONAL SAMPLE', suburb: 'Sample Gardens', town: 'Pretoria', province: 'Gauteng', postalCode: '0000', type: 'Freehold residential', name: 'Sample property', number: 'EXAMPLE-NUMBER', year: 2002, deedsOfficeId: 'EXAMPLE-OFFICE', erf: 1234, portion: 0, unit: 0, schemeId: 'EXAMPLE-SCHEME', extent: 850, parentFarm: 'EXAMPLE-FARM', hasCad: true, hasDeeds: true, hasNad: false, hasTransfer: null },
      owners: [{ name: 'Example Owner A', type: 'Natural person', share: 50 }, { name: 'Example Owner B', type: 'Natural person', share: 0 }],
      ownership: { registeredAt: '2018-04-12' },
      transactions: [{ purchasedAt: '2018-01-10', registeredAt: '2018-04-12', purchaseAmount: 1950000, purchaseReference: 'EXAMPLE-2018', extent: 850, isCurrentOwner: true }, { purchasedAt: '2010-03-15', registeredAt: '2010-04-20', purchaseAmount: 1100000, purchaseReference: 'EXAMPLE-2010', extent: 0, isCurrentOwner: false }],
      transferHistory: { limit: 5, order: 'registration_descending', hasMore: true },
      finance: { hasCurrentBond: true, currentBondCount: 1, bondRecordLimit: 5, hasMoreBondRecords: true, currentBonds: [{ registeredAt: '2018-04-12', indicator: 'EXAMPLE-BOND' }] },
      municipalValuation: { value: 2450000, date: '2024-07-01', municipality: 'City of Tshwane', zoning: 'Residential 1', reason: 'General valuation' },
    }, opportunity_signals: { ownershipRegisteredAt: '2018-04-12', ownershipTenureYears: 8.5, transferRecordsReviewed: 2, latestTransferRegisteredAt: '2018-04-12', currentFinanceRecorded: true, municipalValuationVsLatestPurchase: { difference: 500000, percentageDifference: 25.64 } },
  };
}
const content = doc => doc.internal.pages.slice(1).flat().join('\n');
test('retains all saved detail, zero values and unknown flags without mutating the report', () => {
  const report=fullReportFixture(), before=structuredClone(report);
  const pdf=buildKnowledgeFactoryReportPdf(report), text=content(pdf);
  assert.equal(pdf.getNumberOfPages(),3);
  for(const value of ['EXAMPLE-NUMBER','2002','EXAMPLE-OFFICE','EXAMPLE-SCHEME','EXAMPLE-FARM','EXAMPLE-2018','EXAMPLE-2010','EXAMPLE-BOND','Natural person / 0','1234 / 0 / 0','Yes / Yes','No / Not supplied','Further bond records exist','earlier transfers exist','canvassing-report-v1','Original title deed']) assert.ok(text.includes(value),value);
  assert.deepEqual(report,before);
});
test('long reports retain final records and split unusually long fields safely', () => {
  const report=fullReportFixture();
  report.report_data.owners=Array.from({length:85},(_,i)=>({name:`Owner-${i}`,type:'Natural person',share:0}));
  report.report_data.transactions=Array.from({length:30},(_,i)=>({purchaseReference:`TRANSFER-${i}`,purchaseAmount:i,registeredAt:'2018-01-01'}));
  report.report_data.finance.currentBonds=Array.from({length:55},(_,i)=>({indicator:`BOND-${i}`,registeredAt:'2018-01-01'}));
  report.request_context_snapshot.requestPurpose='A long authorised purpose. '.repeat(250)+'FINAL-PURPOSE-MARKER';
  const pdf=buildKnowledgeFactoryReportPdf(report),text=content(pdf);
  assert.ok(pdf.getNumberOfPages()>3);
  for(const marker of ['Owner-84','TRANSFER-29','BOND-54','FINAL-PURPOSE-MARKER','continued','Scope and provenance'])assert.ok(text.includes(marker),marker);
  for(const match of text.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) Td/g))assert.ok(Number(match[2])>=25&&Number(match[2])<=825,`Out-of-page baseline ${match[0]}`);
});
test('missing data stays unknown and missing geometry is never drawn as a boundary', () => {
  const text=content(buildKnowledgeFactoryReportPdf({product_id:'full_canvassing_report',report_data:{}}));
  assert.ok(text.includes('Not supplied'));assert.ok(text.includes('Boundary geometry is not included'));
  assert.ok(!text.includes('Supplier indicates no bond'));assert.ok(!text.includes('(R0)'));
});
test('Basic owner reports retain their existing renderer', () => {
  const report=fullReportFixture();report.product_id='basic_owner_lookup';
  const text=content(buildKnowledgeFactoryReportPdf(report));
  assert.ok(text.includes('Current ownership'));assert.ok(!text.includes('Municipal valuation and zoning'));
});

test('draws every supplied boundary ring with verified property/environment provenance and readable overflow', () => {
  const report=fullReportFixture();report.request_context_snapshot.supplierEnvironment='uat';
  report.report_data.boundary={status:'supplied',propertyId:'DEMO-001',supplierEnvironment:'uat',retrievedAt:report.executed_at,geometry:{type:'MultiPolygon',coordinates:[[[[28,-25],[28.001,-25],[28.001,-25.001],[28,-25.001],[28,-25]],[[28.0002,-25.0002],[28.0004,-25.0002],[28.0004,-25.0004],[28.0002,-25.0002]]],[[[28.002,-25],[28.003,-25],[28.003,-25.001],[28.002,-25]]]]}};
  const pdf=buildKnowledgeFactoryReportPdf(report),text=content(pdf);
  assert.equal(pdf.getNumberOfPages(),3);
  assert.ok(text.includes('Property outline'));assert.ok(text.includes('Supplier boundary'));assert.ok(text.includes('B*'));
  for(const marker of ['Example Owner B','EXAMPLE-2010','Scope and provenance'])assert.ok(text.includes(marker),marker);
  report.request_context_snapshot.supplierEnvironment='live';
  const mismatch=content(buildKnowledgeFactoryReportPdf(report));assert.ok(!mismatch.includes('Supplier boundary'));assert.ok(mismatch.includes('Boundary geometry is not included'));
  report.request_context_snapshot.supplierEnvironment='uat';report.report_data.boundary.propertyId='OTHER';assert.ok(!content(buildKnowledgeFactoryReportPdf(report)).includes('Supplier boundary'));
});
