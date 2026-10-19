import handleReportProducts from '../../knowledge-factory/report-products.js';
import { createClient } from '@supabase/supabase-js';
import { requireKnowledgeFactoryExecutive } from '../../../server/services/knowledgeFactoryAdminAccess.js';
import { reviewReportCostEvidence, reportAccounting } from '../../../server/services/knowledgeFactoryReportAccounting.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export function createReportCommerceHandler({ createDb = createClient, env = process.env } = {}) {
  return async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    const origin = request.headers?.origin;
    if (origin === 'https://admin.arch9.co.za') {
      response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin');
    }
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    const json = (status, value) => { response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8'); response.end(JSON.stringify(value)); };
    if (request.method === 'OPTIONS') return response.status(204).end();
    if (!['GET','POST'].includes(request.method)) return json(405, { error: 'Method not allowed.' });
    try {
      const organisationId = new URL(request.url, 'https://app.arch9.co.za').searchParams.get('organisationId');
      if (!UUID.test(organisationId || '')) return json(400, { error: 'Choose a valid organisation.' });
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json(503, { error: 'Report accounting is not configured.' });
      const db = createDb(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const actor = await requireKnowledgeFactoryExecutive(request, db, organisationId);
      if (request.method === 'GET') {
        const results = await Promise.all([
          db.from('knowledge_factory_audit_log').select('id, operation, request_metadata, created_at').eq('organisation_id', organisationId).eq('operation', 'property_report').order('created_at', { ascending: false }).limit(50),
          db.from('knowledge_factory_report_cost_approvals').select('id, product_id, supplier_environment, maximum_credits, supplier_reference, expires_at, revoked_at').eq('organisation_id', organisationId).order('created_at', { ascending: false }).limit(30),
          db.from('knowledge_factory_report_credit_ledger').select('purchase_intent_id, supplier_environment, reserved_credits, charged_credits, deducted_credits, status, created_at').eq('organisation_id', organisationId).in('status', ['reserved','dispatched','review_required','settled']).order('created_at', { ascending: false }).limit(100),
          db.from('knowledge_factory_report_invoices').select('id, invoice_month, currency, status, knowledge_factory_report_invoice_lines(product_name, amount_cents, created_at)').eq('organisation_id', organisationId).order('invoice_month', { ascending: false }).limit(24),
        ]);
        if (results.some(r => r.error)) return json(503, { error: 'Report approval and invoice records could not be loaded.' });
        const diagnostics = (results[0].data || []).filter(row => row.request_metadata?.phase === 'execution_result').map(row => {
          const productId = row.request_metadata?.diagnostic === 'single_full_v1_uat' ? 'full_canvassing_report' : 'basic_owner_lookup';
          try { reviewReportCostEvidence(row, productId); return { id: row.id, productId, createdAt: row.created_at, complete: true }; }
          catch (error) { return { id: row.id, productId, createdAt: row.created_at, complete: false, problem: error.message }; }
        });
        return json(200, { diagnostics, approvals: results[1].data, usageReview: results[2].data, invoices: results[3].data });
      }
      let input = request.body;
      if (!input || Buffer.isBuffer(input)) {
        const chunks = []; let size = 0;
        for await (const chunk of request) { size += Buffer.byteLength(chunk); if (size > 8192) return json(413, { error: 'Request is too large.' }); chunks.push(Buffer.from(chunk)); }
        input = Buffer.concat(chunks).toString();
      }
      if (typeof input === 'string') { if (Buffer.byteLength(input) > 8192) return json(413, { error: 'Request is too large.' }); input = JSON.parse(input); }
      if (input.action === 'save_package') {
        return await handleReportProducts({ method: 'POST', headers: request.headers, body: { action: 'save', organisationId,
          productId: input.productId, customerPriceCents: input.customerPriceCents, markUatValidated: true } }, response,
          { authorize: async () => actor.userId, createDb, env });
      }
      if (input.action === 'issue_invoice' && UUID.test(input.invoiceId || '')) {
        return json(200, await reportAccounting(db, 'issue_report_invoice', { p_invoice_id: input.invoiceId, p_organisation_id: organisationId }));
      }
      if (input.action === 'review_charge' && UUID.test(input.intentId || '')) {
        if (![input.chargedCredits, input.deductedCredits].every(n => Number.isSafeInteger(n) && n >= 0) || text(input.supplierReference,250).length < 3)
          return json(400, { error: 'Provide supplier-confirmed charge amounts and a reference.' });
        return json(200, await reportAccounting(db, 'review_report_charge', { p_intent_id: input.intentId, p_actor_id: actor.userId,
          p_organisation_id: organisationId, p_credits: input.chargedCredits, p_deducted: input.deductedCredits, p_reference: text(input.supplierReference,250) }));
      }
      if (input.action === 'revoke_approval' && UUID.test(input.approvalId || '')) {
        const { data, error } = await db.from('knowledge_factory_report_cost_approvals').update({ revoked_at: new Date().toISOString() }).eq('id', input.approvalId).eq('organisation_id', organisationId).is('revoked_at', null).select('id').maybeSingle();
        if (error || !data) return json(409, { error: 'This approval could not be revoked.' });
        return json(200, { revoked: true });
      }
      if (input.action !== 'approve_cost' || !UUID.test(input.evidenceAuditId || '') ||
          !['basic_owner_lookup','full_canvassing_report'].includes(input.productId) ||
          !['uat','live'].includes(input.environment) || input.fieldsReviewed !== true || input.feeScheduleConfirmed !== true)
        return json(400, { error: 'Choose the package, environment and saved evidence; confirm field and supplier fee review.' });
      const reference = text(input.supplierReference, 250); const note = text(input.reviewNote, 1000);
      const expires = Date.parse(input.expiresAt);
      if (reference.length < 3 || note.length < 10 || !Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 30 * 86400_000)
        return json(400, { error: 'Provide a supplier reference, review note and approval expiry within 30 days.' });
      const { data: audit, error: auditError } = await db.from('knowledge_factory_audit_log').select('operation, request_metadata').eq('id', input.evidenceAuditId).eq('organisation_id', organisationId).maybeSingle();
      if (auditError || !audit) return json(409, { error: 'Saved supplier evidence could not be verified.' });
      const evidence = reviewReportCostEvidence(audit, input.productId);
      const { data, error } = await db.from('knowledge_factory_report_cost_approvals').insert({
        organisation_id: organisationId, product_id: input.productId, supplier_environment: input.environment,
        supplier_query_sha256: evidence.querySha256, schedule_version: 'kf-v1-2026-09-22', maximum_credits: evidence.maximumCredits,
        evidence_audit_id: input.evidenceAuditId, supplier_reference: reference, review_note: note,
        reviewed_by: actor.userId, expires_at: new Date(expires).toISOString(),
      }).select('id').single();
      if (error || !data) return json(503, { error: 'The reviewed report approval could not be saved.' });
      return json(201, { approval: data, message: 'Reviewed maximum saved separately from supplier billing. No report executed or access granted.' });
    } catch (error) { return json(error instanceof SyntaxError ? 400 : Number(error.status || 503), { error: error.status ? error.message : 'Report accounting could not be completed.' }); }
  };
}
export default createReportCommerceHandler();
