import { createClient } from '@supabase/supabase-js';
import { requireKnowledgeFactoryExecutive } from '../../../server/services/knowledgeFactoryAdminAccess.js';
import { handleCostMatrix } from '../../knowledge-factory/cost-matrix.js';
import handleCommercialPolicy from '../../knowledge-factory/package-commercial-policy.js';
import { KNOWLEDGE_FACTORY_UAT_V1_ENDPOINT } from '../../knowledge-factory/supplier-endpoint.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECIPES = new Set(['package_basic_v1', 'package_full_v1']);
const ORIGINS = new Set(['https://admin.arch9.co.za', 'http://localhost:5173', 'http://localhost:5174']);
const LIMIT_FIELDS = ['allowedProductIds', 'perReportCreditCap', 'basicReportCreditCap', 'fullReportCreditCap', 'monthlyCreditCap', 'monthlyReportCap', 'dailyReportCapPerUser', 'supplierCreditsPerCent'];
async function readBody(request) {
  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 16_384) throw Object.assign(new Error('Setup request is too large.'), { status: 413 });
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

export function createKnowledgeFactoryAdminHandler({ createDb = createClient, env = process.env, costHandler = handleCostMatrix, policyHandler = handleCommercialPolicy } = {}) {
  return async function handler(request, response) {
    const origin = Object.entries(request.headers || {}).find(([key]) => key.toLowerCase() === 'origin')?.[1];
    response.setHeader('Cache-Control', 'no-store');
    if (ORIGINS.has(origin)) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin'); }
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    const json = (status, body) => { response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8'); response.end(JSON.stringify(body)); };
    if (request.method === 'OPTIONS') return response.status(204).end();
    if (!['GET', 'POST'].includes(request.method)) return json(405, { error: 'Method not allowed.' });
    try {
      const url = new URL(request.url || '/', 'https://app.arch9.co.za');
      const organisationId = url.searchParams.get('organisationId') || '';
      if (!UUID.test(organisationId)) return json(400, { error: 'Select a valid organisation.' });
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json(503, { error: 'Internal supplier setup is not configured.' });
      const db = createDb(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      await requireKnowledgeFactoryExecutive(request, db, organisationId);
      if (request.method === 'GET') {
        const results = await Promise.all([
          db.from('knowledge_factory_package_commercial_policies').select('allowed_product_ids, basic_report_credit_cap, full_report_credit_cap, per_report_credit_cap, monthly_credit_cap, monthly_report_cap, daily_report_cap_per_user, rollout_stage, supplier_credits_per_cent').eq('organisation_id', organisationId).maybeSingle(),
          db.from('knowledge_factory_organisation_access').select('enabled, allowed_operations, suspended_at').eq('organisation_id', organisationId).maybeSingle(),
          db.from('knowledge_factory_package_pilot_enrolments').select('status, allowed_user_ids, pilot_ends_at, pilot_report_cap, pilot_credit_cap').eq('organisation_id', organisationId).maybeSingle(),
          db.from('knowledge_factory_report_products').select('product_id, name, customer_price_cents, status').eq('organisation_id', organisationId),
          db.from('knowledge_factory_cost_validations').select('property_id, recipe_id, field_cost, type_cost, price_surcharge, credits_consumed, outcome, supplier_api_version, supplier_query_sha256, created_at').eq('organisation_id', organisationId).eq('supplier_api_version', 'v1').order('created_at', { ascending: false }).limit(10),
        ]);
        if (results.some((result) => result.error)) return json(503, { error: 'Supplier setup status could not be loaded.' });
        return json(200, {
          policy: results[0].data, access: results[1].data, pilot: results[2].data,
          products: results[3].data || [], validations: results[4].data || [],
          supplier: { version: 'v1', uatEndpointConfigured: (env.KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT || '').trim() === KNOWLEDGE_FACTORY_UAT_V1_ENDPOINT, credentialsConfigured: Boolean(env.KNOWLEDGE_FACTORY_EMAIL && env.KNOWLEDGE_FACTORY_PASSWORD) },
          activationAvailable: false,
        });
      }
      const input = await readBody(request);
      if (input.action === 'save_limits') {
        if (![30, 40].includes(Number(input.supplierCreditsPerCent))) return json(400, { error: 'Confirm subscription (40 credits/cent) or prepaid (30 credits/cent).' });
        const limits = Object.fromEntries(LIMIT_FIELDS.map((field) => [field, input[field]]));
        // Saving setup never activates a pilot or grants report access.
        return await policyHandler({ method: 'POST', headers: request.headers, body: { ...limits, organisationId, action: 'save', rolloutStage: 'controlled_uat' } }, response);
      }
      if (input.action === 'validate_cost') {
        if ((env.KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT || '').trim() !== KNOWLEDGE_FACTORY_UAT_V1_ENDPOINT) return json(409, { error: 'Cost validation requires the pinned v1 UAT endpoint.' });
        if (!RECIPES.has(input.recipeId)) return json(400, { error: 'Select Basic or Full. Custom supplier queries are not accepted.' });
        return await costHandler({ method: 'POST', headers: request.headers, body: { organisationId, action: 'validate', recipeId: input.recipeId, propertyId: input.propertyId, purpose: input.purpose } }, response, { authorize: requireKnowledgeFactoryExecutive });
      }
      return json(400, { error: 'Only save_limits and validate_cost are available. Report execution is not available here.' });
    } catch (error) {
      return json(error instanceof SyntaxError ? 400 : Number(error.status || 503), { error: error.status ? error.message : 'Internal supplier setup could not be completed.' });
    }
  };
}

export default createKnowledgeFactoryAdminHandler();
