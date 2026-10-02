import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { APPROVED_TEST, createUatReportTestHandler, testPreflight, executionEvidence, diagnosticMetadata, interpretRecordedTest } from '../api/admin/knowledge-factory/uat-report-test.js';
import { packageReportQueryFingerprint } from '../api/knowledge-factory/package-report-recipes.js';
import { APPROVED_FULL_TEST } from '../api/admin/knowledge-factory/uat-full-report-test.js';
import { reportFieldCoverage } from '../api/admin/knowledge-factory/uat-report-test.js';

const env = { SUPABASE_URL: 'https://isdowlnollckzvltkasn.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'PRIVATE-DB-KEY', KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT: 'https://propinfoapi.co.za/uat/v1/graphql/', KNOWLEDGE_FACTORY_EMAIL: 'private@example.test', KNOWLEDGE_FACTORY_PASSWORD: 'PRIVATE-PASSWORD' };
const cost = { fieldCost: 79, typeCost: 30 };
const billing = { complexity: 109, rootSurcharge: 0, fieldSurcharge: 885, surcharge: 885, credits: 994, amountDeducted: 994, discountMultiplier: 1, rootFieldCount: 1, status: 'completed' };
const property = { propertyId: APPROVED_TEST.propertyId, streetAddress: [{ address: 'PRIVATE-STREET', isMaster: true }], currentOwnership: { nodes: [{ isCurrentOwner: true, buyers: { pageInfo: { hasNextPage: false }, nodes: [{ buyerName: 'PRIVATE-OWNER', buyerType: 'Individual', share: 1 }] } }] } };
function database({ role = 'executive', actorId = APPROVED_TEST.actorId, claimError = null } = {}) {
  const rows = new Map();
  return { rows, auth: { getUser: async () => ({ data: { user: { id: actorId } } }), admin: { getUserById: async () => ({ data: { user: { id: actorId, app_metadata: { role }, user_metadata: { role: 'executive' } } } }) } }, from(table) {
    let id;
    const query = { select: () => query, eq: (key, value) => { if (key === 'id') id = value; return query }, maybeSingle: async () => ({ data: table === 'organisations' ? { id: APPROVED_TEST.organisationId } : rows.get(id) || null }), insert: async (row) => {
      assert.equal(table, 'knowledge_factory_audit_log');
      if (claimError && row.id === APPROVED_TEST.claimId) return { error: claimError };
      if (rows.has(row.id)) return { error: { code: '23505' } };
      rows.set(row.id, row);
      return { error: null };
    } };
    return query;
  } };
}
const request = (body = { action: 'run_approved_test' }, headers = { authorization: 'Bearer PRIVATE-SESSION', origin: 'https://admin.arch9.co.za' }) => ({ method: body === null ? 'GET' : 'POST', url: `/?organisationId=${APPROVED_TEST.organisationId}`, headers, body });
function response() {
  return { code: null, headers: {}, body: null, status(code) { this.code = code; return this }, setHeader(key, value) { this.headers[key] = value; return this }, end(body) { this.body = body ? JSON.parse(body) : null } };
}
function runtime(options = {}) {
  const db = options.db || database();
  const calls = [];
  const fetcher = async (url, input) => {
    calls.push({ url, input });
    const body = JSON.parse(input.body);
    if (calls.length === 1) return Response.json({ data: { login: { tokenPayload: { token: 'PRIVATE-TOKEN' } } } });
    if (options.throwAt === calls.length) throw new Error('PRIVATE-PASSWORD provider failure');
    if (input.headers['GraphQL-Cost'] === 'validate') return Response.json(options.preflight || { extensions: { operationCost: cost } });
    assert.equal(body.variables.id, APPROVED_TEST.propertyId);
    return Response.json(options.execution || { data: { propertyReports: { nodes: [property] } }, extensions: { operationCost: cost, billing } });
  };
  return { db, calls, handler: createUatReportTestHandler({ env: options.env || env, createDb: () => db, fetcher, now: () => options.now ?? Date.parse('2026-10-01T10:00:00Z'), approvedTest: options.approvedTest || APPROVED_TEST }) };
}

test('Full diagnostic has a separate immutable claim, pinned sorted query and fresh 20,000-credit ceiling', async () => {
  assert.notEqual(APPROVED_FULL_TEST.claimId, APPROVED_TEST.claimId);
  assert.notEqual(APPROVED_FULL_TEST.resultId, APPROVED_TEST.resultId);
  assert.equal(packageReportQueryFingerprint('full_canvassing_report'), APPROVED_FULL_TEST.querySha256);
  const fullCosts = { fieldCost: 101, typeCost: 42 };
  const fullBilling = { ...billing, complexity: 143, fieldSurcharge: 17575, surcharge: 17575, credits: 17718, amountDeducted: 17718 };
  const execution = { data: { propertyReports: { nodes: [property] } }, extensions: { operationCost: fullCosts, billingCost: fullBilling } };
  const db = database();
  db.rows.set(APPROVED_TEST.claimId, { outcome: 'denied' });
  const run = runtime({ db, approvedTest: APPROVED_FULL_TEST, preflight: { extensions: { operationCost: fullCosts } }, execution });
  const reply = response(); await run.handler(request(), reply);
  assert.equal(reply.code, 200); assert.equal(reply.body.ready, true);
  assert.equal(reply.body.preflight.maximumCredits, 17718);
  assert.equal(run.calls.length, 3);
  const query = JSON.parse(run.calls[1].input.body).query;
  assert.match(query, /transfers\(first: 5, order: \{ dateRegister: DESC \}\)/);
  assert.equal(query, JSON.parse(run.calls[2].input.body).query);
  assert.equal(db.rows.get(APPROVED_FULL_TEST.resultId).request_metadata.diagnostic, 'single_full_v1_uat');
  assert.doesNotMatch(JSON.stringify([...db.rows.values()]), /PRIVATE-OWNER|PRIVATE-STREET|PRIVATE-TOKEN/);
  const repeated = response(); await run.handler(request(), repeated);
  assert.equal(repeated.code, 409); assert.equal(run.calls.length, 3);
  const status = response(); await run.handler(request(null), status);
  assert.equal(status.body.consumed, true); assert.equal(status.body.result.request_metadata.withinBudget, true);
});

test('Full invalid validation or over-budget estimate stops before any execution', async () => {
  for (const preflight of [{ errors: [{ message: 'Invalid sort' }] }, { extensions: { operationCost: { fieldCost: 2500, typeCost: 42 } } }, { extensions: { operationCost: { fieldCost: 101, typeCost: 42 }, billingCost: { status: 'charged', amountDeducted: 1 } } }]) {
    const run = runtime({ approvedTest: APPROVED_FULL_TEST, preflight }); const reply = response();
    await run.handler(request(), reply); assert.ok(reply.code >= 400); assert.equal(run.calls.length, 2);
    assert.ok(run.db.rows.has(APPROVED_FULL_TEST.claimId));
  }
  const costs = { fieldCost: 101, typeCost: 42 };
  const oversized = { ...billing, complexity: 143, credits: 18000, amountDeducted: 18000 };
  assert.equal(executionEvidence({ extensions: { operationCost: costs, billingCost: oversized } }, undefined, APPROVED_FULL_TEST, 17718).withinBudget, false);
});

test('field coverage distinguishes supplier omission, explicit null and numeric type without storing values', () => {
  const sample = { ...property, valuationValue: null, currentOwnership: { nodes: [{ dateRegister: '2000-01-01', buyers: { nodes: [{ buyerName: 'SECRET-NAME', buyerType: 1, share: null }] } }] } };
  const coverage = reportFieldCoverage(sample);
  assert.deepEqual(coverage.owners[0], { buyerName: 'string', buyerNameFix: 'missing', buyerType: 'number', share: 'null' });
  assert.equal(coverage.valuation.valuationValue, 'null');
  assert.doesNotMatch(JSON.stringify(coverage), /SECRET-NAME|2000-01-01/);
});

test('approved exact Basic query and 20-owner fee schedule fit the 12,000-credit envelope', () => {
  assert.equal(packageReportQueryFingerprint('basic_owner_lookup'), APPROVED_TEST.querySha256);
  assert.equal(APPROVED_TEST.maxFieldSurcharge, 300 + 50 + 20 * (250 + 250 + 30 + 5));
  assert.equal(testPreflight({ extensions: { operationCost: cost } }).maximumCredits, 11159);
  for (const payload of [{}, { extensions: { operationCost: { fieldCost: 950, typeCost: 1 } } }, { extensions: { operationCost: cost, billing: { rootSurcharge: 1 } } }, { extensions: { operationCost: cost, billing: { amountDeducted: 1 } } }]) assert.throws(() => testPreflight(payload), /preflight/);
});
test('only named trusted executive, fixed org, fixed request and pinned UAT may reserve a test', async () => {
  for (const [options, req, status] of [
    [{ db: database({ role: 'principal' }) }, request(), 403],
    [{ db: database({ actorId: 'another-user' }) }, request(), 403],
    [{}, request(undefined, {}), 401],
    [{}, request(undefined, { authorization: 'Bearer session', origin: 'https://client.example.test' }), 403],
    [{}, { ...request(), url: '/?organisationId=another-org' }, 403],
    [{}, request({ action: 'run_approved_test', propertyId: 1 }), 400],
    [{}, request({ action: 'run_approved_test', query: 'CUSTOM' }), 400],
    [{ env: { ...env, KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT: 'https://propinfoapi.co.za/live/v1/graphql/' } }, request(), 409],
    [{ now: Date.parse(APPROVED_TEST.expiresAt) }, request(), 410],
  ]) {
    const run = runtime(options); const reply = response();
    await run.handler(req, reply);
    assert.equal(reply.code, status); assert.equal(run.calls.length, 0); assert.equal(run.db.rows.size, 0);
  }
});
test('one report uses login, fresh exact-query validation, execution, redirects rejected and no data in audit', async () => {
  const run = runtime(); const reply = response(); await run.handler(request(), reply);
  assert.equal(reply.code, 200); assert.equal(reply.body.ready, true); assert.equal(reply.body.report.owners[0].name, 'PRIVATE-OWNER');
  assert.equal(run.calls.length, 3); assert.equal(run.db.rows.size, 2);
  assert.equal(JSON.parse(run.calls[1].input.body).query, JSON.parse(run.calls[2].input.body).query);
  assert.equal(run.calls[1].input.headers['GraphQL-Cost'], 'validate'); assert.equal(run.calls[2].input.headers['GraphQL-Cost'], 'report');
  for (const call of run.calls) { assert.equal(call.url, env.KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT); assert.equal(call.input.redirect, 'error'); assert.ok(call.input.signal); }
  assert.doesNotMatch(JSON.stringify([...run.db.rows.values()]), /PRIVATE-OWNER|PRIVATE-STREET|PRIVATE-TOKEN|PRIVATE-PASSWORD|PRIVATE-SESSION|PRIVATE-DB-KEY/);
  assert.equal(reply.headers['Cache-Control'], 'no-store');
});
test('atomic immutable claim blocks concurrent clicks and repeats even on another handler instance', async () => {
  const db = database(); const first = runtime({ db }); const second = runtime({ db }); const a = response(); const b = response();
  await Promise.all([first.handler(request(), a), second.handler(request(), b)]);
  assert.deepEqual([a.code, b.code].sort(), [200, 409]); assert.equal(first.calls.length + second.calls.length, 3);
  const again = response(); await second.handler(request(), again); assert.equal(again.code, 409);
  const status = response(); await second.handler(request(null), status); assert.equal(status.body.consumed, true); assert.equal(status.body.available, false);
});
test('reservation/database failure never sends a supplier request', async () => {
  const run = runtime({ db: database({ claimError: { code: 'network' } }) }); const reply = response(); await run.handler(request(), reply);
  assert.equal(reply.code, 503); assert.equal(run.calls.length, 0);
});
test('failed preflight or ambiguous execution is consumed permanently without automatic retries', async () => {
  for (const options of [{ preflight: { extensions: {} } }, { throwAt: 3 }]) {
    const run = runtime(options); const reply = response(); await run.handler(request(), reply);
    assert.equal(reply.body.consumed, true); assert.equal(run.db.rows.size, 2);
    const result = run.db.rows.get(APPROVED_TEST.resultId); assert.equal(result.outcome, 'failed');
    assert.equal(result.request_metadata.executionSent, options.throwAt === 3);
    assert.doesNotMatch(JSON.stringify(reply.body), /PRIVATE-PASSWORD/);
    const calls = run.calls.length; await run.handler(request(), response()); assert.equal(run.calls.length, calls);
  }
});
test('missing billing preserves diagnostic report but cannot approve pricing; data truncation fails readiness', async () => {
  for (const execution of [
    { data: { propertyReports: { nodes: [property] } }, extensions: { operationCost: cost } },
    { data: { propertyReports: { nodes: [] } }, extensions: { operationCost: cost, billing } },
    { data: { propertyReports: { nodes: [{ ...property, currentOwnership: { nodes: [{ isCurrentOwner: true, buyers: { pageInfo: { hasNextPage: true }, nodes: [] } }] } }] } }, extensions: { operationCost: cost, billing } },
  ]) {
    const run = runtime({ execution }); const reply = response(); await run.handler(request(), reply);
    assert.equal(reply.code, 200); assert.equal(reply.body.ready, false); assert.equal(run.db.rows.get(APPROVED_TEST.resultId).outcome, 'failed');
    assert.equal(run.calls.length, 3);
  }
});
test('billing metadata is numeric/key-only; zero deduction is valid and over-budget/mismatched billing is not readiness', () => {
  const payload = { extensions: { operationCost: cost, billing: { ...billing, amountDeducted: 0 }, token: 'PRIVATE-TOKEN', custom: { complexity: 1, owner: 'PRIVATE-OWNER' } } };
  assert.equal(executionEvidence(payload).withinBudget, true);
  assert.doesNotMatch(JSON.stringify(diagnosticMetadata(payload)), /PRIVATE-TOKEN|PRIVATE-OWNER/);
  const headerMetadata = diagnosticMetadata({ extensions: { billingEntries: [{ ...billing, owner: 'PRIVATE-OWNER' }] } }, new Headers({ 'x-graphql-billing-report': JSON.stringify(billing), 'x-cost-complexity': '109', 'authorization': 'PRIVATE-TOKEN' }));
  assert.equal(headerMetadata.costHeaderMetrics[0].value, 109);
  assert.equal(headerMetadata.billingCandidates.length, 2);
  assert.doesNotMatch(JSON.stringify(headerMetadata), /PRIVATE-TOKEN|PRIVATE-OWNER/);
  assert.equal(executionEvidence({ extensions: { operationCost: cost, billing: { ...billing, credits: 12001, amountDeducted: 12001 } } }).withinBudget, false);
  assert.equal(executionEvidence({ extensions: { operationCost: cost, billing: { ...billing, complexity: 108 } } }).billingVerified, false);
});
test('recorded billingCost can be reinterpreted read-only without altering the immutable audit or repeating a report', () => {
  const capturedBilling = { ...billing, fieldSurcharge: 11050, surcharge: 11050, credits: 11159, amountDeducted: 11159, status: 'charged' };
  const row = { outcome: 'failed', request_metadata: { phase: 'execution_result', querySha256: APPROVED_TEST.querySha256, reportReturned: true, reportIssue: null, costs: { fieldCost: 79, typeCost: 30, surcharge: null, credits: null }, metadata: { billingCandidates: [{ path: 'extensions.billingCost', ...capturedBilling }] } } };
  const original = JSON.stringify(row);
  const interpreted = interpretRecordedTest(row);
  assert.equal(interpreted.request_metadata.billingVerified, true);
  assert.equal(interpreted.request_metadata.withinBudget, true);
  assert.equal(interpreted.request_metadata.ready, true);
  assert.equal(interpreted.request_metadata.billing.amountDeducted, 11159);
  assert.equal(interpreted.request_metadata.originalAuditOutcome, 'failed');
  assert.equal(JSON.stringify(row), original);
  assert.equal(interpretRecordedTest({ ...row, request_metadata: { ...row.request_metadata, querySha256: 'wrong' } }).request_metadata.billingVerified, undefined);
});
test('diagnostic UI is internal and route never mutates permissions, pricing, limits or normal purchases', async () => {
  const source = await readFile(new URL('../api/admin/knowledge-factory/uat-report-test.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.upsert\(|\.update\(|\.delete\(|from\(['"]knowledge_factory_(report_results|report_purchase_intents|organisation_access|user_permissions|package_commercial_policies|cost_validations)/);
  const admin = await readFile(new URL('../../apps/admin/src/KnowledgeFactoryConfigurationView.jsx', import.meta.url), 'utf8');
  assert.match(admin, /Run approved one-time Basic UAT test/); assert.match(admin, /disabled=\{busy \|\| !status.available\}/);
  assert.match(admin, /Owner details disappear when this page is refreshed/);
  const client = await readFile(new URL('../src/pages/PipelineCanvassingPage.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(client, /uat-report-test|ApprovedUatTest/);
});
