import { createClient } from '@supabase/supabase-js';
import { requireKnowledgeFactoryExecutive } from '../../../server/services/knowledgeFactoryAdminAccess.js';
import { packageReportQuery, packageReportQueryFingerprint } from '../../knowledge-factory/package-report-recipes.js';
import { KNOWLEDGE_FACTORY_UAT_V1_ENDPOINT, supplierProperty, currentSupplierTransfer } from '../../knowledge-factory/supplier-contract.js';
import { supplierCosts, supplierBilling, supplierMetric } from '../../knowledge-factory/supplier-costs.js';
import { reportData } from '../../knowledge-factory/report-purchase-intents.js';

// One explicitly approved diagnostic, not a configurable report execution API.
export const APPROVED_TEST = Object.freeze({
  organisationId: '2958d402-368e-43c9-b728-0098e10505f1',
  actorId: 'dde264a9-685e-4ecf-a82a-4eeb2fd8bd23',
  propertyId: 383723,
  claimId: '8af8e88f-8234-4ad9-bce7-4e8cf63c9bb3',
  resultId: '2bad8b60-9dc0-4a88-b52b-07627007c072',
  expiresAt: '2026-10-02T00:00:00Z',
  querySha256: '5f6b55aea2fb7172cbf93e74c3a6179f8f2f094dbfa5880b9bf8fc65ff3ab736',
  creditBudget: 12000,
  maxFieldSurcharge: 11050,
  productId: 'basic_owner_lookup',
  diagnostic: 'single_basic_v1_uat',
});
const PURPOSE = 'User-approved single internal Basic v1 UAT report and billing verification';
const ORIGIN = 'https://admin.arch9.co.za';
const fail = (status, message) => Object.assign(new Error(message), { status });

export function testPreflight(payload, approvedTest = APPROVED_TEST) {
  const costs = supplierCosts(payload);
  const billing = supplierBilling(payload);
  const complexity = costs.fieldCost === null || costs.typeCost === null ? null : costs.fieldCost + costs.typeCost;
  const maximumCredits = complexity === null ? null : complexity + approvedTest.maxFieldSurcharge;
  if (![costs.fieldCost, costs.typeCost].every((value) => Number.isSafeInteger(value) && value >= 0) || maximumCredits > approvedTest.creditBudget ||
      (costs.credits !== null && costs.credits > maximumCredits) ||
      (costs.surcharge !== null && costs.surcharge > approvedTest.maxFieldSurcharge) ||
      (billing.rootSurcharge !== null && billing.rootSurcharge !== 0) ||
      (billing.rootFieldCount !== null && billing.rootFieldCount !== 1) ||
      (billing.status && billing.status.toLowerCase() !== 'validated') ||
      (billing.amountDeducted !== null && billing.amountDeducted !== 0)) {
    throw fail(409, 'The exact-query preflight is missing, exceeds the approved budget, or reports unexpected charges. No report execution was sent.');
  }
  return { costs, maximumCredits, billing };
}

// Retain billing keys/numeric values only. Never log supplier data or raw headers.
export function diagnosticMetadata(payload, headers) {
  const extension = payload?.extensions && typeof payload.extensions === 'object' ? payload.extensions : {};
  const known = ['complexity', 'rootSurcharge', 'fieldSurcharge', 'surcharge', 'credits', 'amountDeducted', 'discountMultiplier', 'rootFieldCount'];
  const candidates = [];
  function inspect(value, path, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 4) return;
    if (Array.isArray(value)) { value.slice(0, 20).forEach((item, index) => inspect(item, `${path}[${index}]`, depth + 1)); return; }
    if (known.some((key) => Object.hasOwn(value, key))) {
      candidates.push({ path, ...Object.fromEntries(known.map((key) => [key, supplierMetric(value[key])])), status: typeof value.status === 'string' && /^[a-zA-Z_-]{1,60}$/.test(value.status) ? value.status : null });
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'data' && /^[a-zA-Z][a-zA-Z0-9_]{0,60}$/.test(key)) inspect(child, `${path}.${key}`, depth + 1);
    }
  }
  inspect(extension, 'extensions');
  for (const key of ['billing', 'billingReport', 'billing_report']) inspect(payload?.[key], key);
  const costHeaderMetrics = [];
  headers?.forEach((value, key) => {
    if (!/^(?:x-)?(?:graphql-)?(?:billing|cost|complexity|credits)(?:-[a-z]+)*$/.test(key)) return;
    const numeric = supplierMetric(value);
    if (numeric !== null) costHeaderMetrics.push({ name: key, value: numeric });
    try { inspect(JSON.parse(value), `header.${key}`); } catch { /* Only numeric/known billing keys are retained. */ }
  });
  return { extensionKeys: Object.keys(extension).filter((key) => /^[a-zA-Z][a-zA-Z0-9_]{0,60}$/.test(key)).slice(0, 30), billingCandidates: candidates.slice(0, 20), costHeaderMetrics: costHeaderMetrics.slice(0, 20) };
}

export function executionEvidence(payload, headers, approvedTest = APPROVED_TEST, maximumCredits = approvedTest.creditBudget) {
  const costs = supplierCosts(payload);
  const billing = supplierBilling(payload);
  const complete = ['complexity', 'rootSurcharge', 'fieldSurcharge', 'surcharge', 'credits', 'amountDeducted', 'discountMultiplier', 'rootFieldCount'].every((key) => billing[key] !== null);
  const billingVerified = complete && billing.rootFieldCount === 1 && Boolean(billing.status) &&
    !['notavailable', 'mixed'].includes(billing.status.toLowerCase()) &&
    billing.rootSurcharge === 0 && billing.fieldSurcharge <= approvedTest.maxFieldSurcharge &&
    billing.surcharge === billing.rootSurcharge + billing.fieldSurcharge &&
    costs.fieldCost !== null && costs.typeCost !== null && billing.complexity === costs.fieldCost + costs.typeCost;
  const withinBudget = billingVerified && costs.credits <= Math.min(approvedTest.creditBudget, maximumCredits) && billing.amountDeducted <= Math.min(approvedTest.creditBudget, maximumCredits);
  return { costs, billing, billingVerified, withinBudget, metadata: diagnosticMetadata(payload, headers) };
}

export function interpretRecordedTest(row, approvedTest = APPROVED_TEST) {
  const recorded = row?.request_metadata;
  const billing = recorded?.metadata?.billingCandidates?.find((candidate) => candidate.path === 'extensions.billingCost');
  if (!billing || recorded.phase !== 'execution_result' || recorded.querySha256 !== approvedTest.querySha256) return row;
  // Reinterpret immutable, numeric evidence only. No supplier request or DB write.
  const evidence = executionEvidence({ extensions: { operationCost: { fieldCost: recorded.costs?.fieldCost, typeCost: recorded.costs?.typeCost }, billingCost: billing } }, undefined, approvedTest, recorded.preflight?.maximumCredits);
  return { ...row, request_metadata: { ...recorded, ...evidence, ready: Boolean(recorded.reportReturned && !recorded.reportIssue && evidence.billingVerified && evidence.withinBudget), billingVerificationSource: 'recorded_extensions.billingCost', originalAuditOutcome: row.outcome } };
}

async function inputBody(request) {
  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === 'string') {
    if (Buffer.byteLength(request.body) > 1024) throw fail(413, 'Test request is too large.');
    return JSON.parse(request.body);
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 1024) throw fail(413, 'Test request is too large.');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

// Field presence and scalar kinds only; never persist owner names or report data.
export function reportFieldCoverage(property) {
  const state = (object, key) => !Object.hasOwn(object || {}, key) ? 'missing'
    : object[key] === null ? 'null' : typeof object[key];
  const transfer = currentSupplierTransfer(property);
  const buyers = Array.isArray(transfer?.buyers?.nodes) ? transfer.buyers.nodes : [];
  return {
    currentOwnershipRegisteredAt: state(transfer, 'dateRegister'),
    owners: buyers.slice(0, 20).map((buyer) => Object.fromEntries(
      ['buyerName', 'buyerNameFix', 'buyerType', 'share'].map((key) => [key, state(buyer, key)]),
    )),
    valuation: Object.fromEntries(['valuationDate', 'valuationMunicipality', 'valuationReason', 'valuationValue', 'valuationZoning'].map((key) => [key, state(property, key)])),
    transferCount: Array.isArray(property?.transfers?.nodes) ? property.transfers.nodes.length : null,
    moreTransfers: property?.transfers?.pageInfo?.hasNextPage ?? null,
    bondCount: Array.isArray(transfer?.bonds?.nodes) ? transfer.bonds.nodes.length : null,
    moreBondRecords: transfer?.bonds?.pageInfo?.hasNextPage ?? null,
  };
}

export function createUatReportTestHandler({ env = process.env, createDb = createClient, fetcher = fetch, now = Date.now, approvedTest = APPROVED_TEST } = {}) {
  return async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    const origin = Object.entries(request.headers || {}).find(([key]) => key.toLowerCase() === 'origin')?.[1];
    if (origin === ORIGIN) { response.setHeader('Access-Control-Allow-Origin', ORIGIN); response.setHeader('Vary', 'Origin'); }
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    const json = (status, body) => { response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8'); response.end(JSON.stringify(body)); };
    if (origin && origin !== ORIGIN) return json(403, { error: 'Only the internal Operating Console may call this test.' });
    if (request.method === 'OPTIONS') return response.status(204).end();
    if (!['GET', 'POST'].includes(request.method)) return json(405, { error: 'Method not allowed.' });
    let db;
    let claimed = false;
    let executionSent = false;
    let preflight = null;
    const requests = [];
    const audit = (id, outcome, metadata, errorCode = null) => db.from('knowledge_factory_audit_log').insert({
      id, organisation_id: approvedTest.organisationId, actor_id: approvedTest.actorId,
      operation: 'property_report', request_purpose: approvedTest.purpose || PURPOSE, property_reference: String(approvedTest.propertyId),
      outcome, error_code: errorCode,
      request_metadata: { diagnostic: approvedTest.diagnostic, supplierApiVersion: 'v1', querySha256: approvedTest.querySha256, creditBudget: approvedTest.creditBudget, ...metadata },
    });
    try {
      const url = new URL(request.url || '/', 'https://app.arch9.co.za');
      if (url.searchParams.get('organisationId') !== approvedTest.organisationId) throw fail(403, 'This test was approved only for Home Seekers.');
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw fail(503, 'Private test configuration is missing.');
      db = createDb(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const actor = await requireKnowledgeFactoryExecutive(request, db, approvedTest.organisationId);
      if (actor.userId !== approvedTest.actorId) throw fail(403, 'This one-time test was approved only for the named executive.');
      if (request.method === 'GET') {
        const [claim, result] = await Promise.all([approvedTest.claimId, approvedTest.resultId].map((id) => db.from('knowledge_factory_audit_log').select('outcome, error_code, request_metadata, created_at').eq('id', id).maybeSingle()));
        if (claim.error || result.error) throw fail(503, 'The one-time test status could not be verified.');
        return json(200, { available: !claim.data && now() < Date.parse(approvedTest.expiresAt), consumed: Boolean(claim.data), propertyId: approvedTest.propertyId, creditBudget: approvedTest.creditBudget, result: interpretRecordedTest(result.data, approvedTest) });
      }
      const input = await inputBody(request);
      if (input?.action !== 'run_approved_test' || Object.keys(input).some((key) => key !== 'action')) throw fail(400, 'Only the fixed, approved UAT test is accepted.');
      if (now() >= Date.parse(approvedTest.expiresAt)) throw fail(410, 'The one-time test approval has expired.');
      if ((env.KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT || '').trim() !== KNOWLEDGE_FACTORY_UAT_V1_ENDPOINT || !env.KNOWLEDGE_FACTORY_EMAIL?.trim() || !env.KNOWLEDGE_FACTORY_PASSWORD) throw fail(409, 'Pinned v1 UAT credentials are required.');
      if (packageReportQueryFingerprint(approvedTest.productId) !== approvedTest.querySha256) throw fail(409, 'The approved query has changed. No supplier call was sent.');
      // A durable primary-key insert wins once across processes and deployments.
      // Consume before login/preflight too: any failure requires fresh human approval.
      const claim = await audit(approvedTest.claimId, 'denied', { phase: 'attempt_reserved', executionSent: false }, 'INTERNAL_UAT_ATTEMPT_RESERVED');
      if (claim.error) throw fail(claim.error.code === '23505' ? 409 : 503, 'This test is already consumed or cannot be safely reserved. No supplier call was sent.');
      claimed = true;
      const post = async (query, variables, token, mode) => {
        const result = await fetcher(KNOWLEDGE_FACTORY_UAT_V1_ENDPOINT, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}`, 'GraphQL-Cost': mode, 'GraphQL-Billing': 'report' } : {}) },
          body: JSON.stringify({ query, variables }),
        });
        const payload = await result.json();
        const errors = [...(Array.isArray(payload?.errors) ? payload.errors : []), ...(Array.isArray(payload?.data?.login?.errors) ? payload.data.login.errors : [])];
        requests.push({ stage: mode || 'login', httpStatus: result.status,
          requestId: /^[a-zA-Z0-9._:-]{1,200}$/.test(result.headers.get('x-request-id') || '') ? result.headers.get('x-request-id') : null,
          errorCodes: errors.map((error) => error?.extensions?.code).filter((value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value)).slice(0, 10),
          errorPaths: errors.map((error) => Array.isArray(error?.path) ? error.path.filter((part) => typeof part === 'number' || typeof part === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,60}$/.test(part)).slice(0, 10) : []).slice(0, 10),
        });
        if (!result.ok || payload?.errors?.length) throw fail(502, `The supplier ${mode || 'login'} request failed. No automatic retry will occur.`);
        return { payload, headers: result.headers };
      };
      const login = await post('mutation ($input: LoginInput!) { login(login: $input) { tokenPayload { token } errors { ... on Error { message } } } }', { input: { email: env.KNOWLEDGE_FACTORY_EMAIL.trim(), password: env.KNOWLEDGE_FACTORY_PASSWORD } });
      const token = login.payload?.data?.login?.tokenPayload?.token;
      if (login.payload?.data?.login?.errors?.length || typeof token !== 'string' || !token.trim()) throw fail(502, 'The supplier login was not accepted. No report was requested.');
      const query = packageReportQuery(approvedTest.productId, 'UatReportTest');
      const validation = await post(query, { id: approvedTest.propertyId }, token, 'validate');
      preflight = testPreflight(validation.payload, approvedTest);
      executionSent = true;
      const executed = await post(query, { id: approvedTest.propertyId }, token, 'report');
      const evidence = executionEvidence(executed.payload, executed.headers, approvedTest, preflight.maximumCredits);
      const property = supplierProperty(executed.payload, approvedTest.propertyId);
      let report = null;
      let reportIssue = null;
      try {
        report = reportData(property, approvedTest.productId);
        if (currentSupplierTransfer(property)?.isCurrentOwner !== true || !report.owners.length || report.owners.some((owner) => !owner.name)) {
          reportIssue = 'Current-owner data is missing or incomplete.';
        }
      } catch { reportIssue = 'The property is missing, mismatched, or its owner connection is incomplete.'; }
      const ready = Boolean(report && !reportIssue && evidence.billingVerified && evidence.withinBudget);
      const metadata = { phase: 'execution_result', executionSent, reportReturned: Boolean(report), reportIssue, ownerCount: report?.owners.length ?? 0, fieldCoverage: reportFieldCoverage(property), preflight, requests, ...evidence };
      const recorded = await audit(approvedTest.resultId, ready ? 'completed' : 'failed', metadata, ready ? null : 'INTERNAL_UAT_EVIDENCE_INCOMPLETE');
      if (recorded.error) throw fail(503, 'The report attempt has finished but its result audit could not be saved. The attempt is consumed; do not retry.');
      return json(200, { consumed: true, ready, report, reportIssue, fieldCoverage: reportFieldCoverage(property), ...evidence, preflight, requests });
    } catch (error) {
      if (claimed) {
        // The immutable claim still blocks retries even if this result insert fails.
        await audit(approvedTest.resultId, 'failed', { phase: 'attempt_failed', executionSent, preflight, requests }, 'INTERNAL_UAT_ATTEMPT_FAILED').catch(() => {});
      }
      return json(error instanceof SyntaxError ? 400 : Number(error.status || 502), { consumed: claimed, error: error.status ? error.message : 'The one-time diagnostic failed. No automatic retry will occur.' });
    }
  };
}

export default createUatReportTestHandler();
