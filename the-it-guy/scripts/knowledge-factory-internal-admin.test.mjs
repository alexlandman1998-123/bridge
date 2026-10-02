import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createKnowledgeFactoryAdminHandler } from '../api/admin/knowledge-factory/configuration.js';
import { isKnowledgeFactoryExecutive, requireKnowledgeFactoryExecutive } from '../server/services/knowledgeFactoryAdminAccess.js';

const org = '2958d402-368e-43c9-b728-0098e10505f1';
const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'private-test-key', KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT: 'https://propinfoapi.co.za/uat/v1/graphql/', KNOWLEDGE_FACTORY_EMAIL: 'test@example.test', KNOWLEDGE_FACTORY_PASSWORD: 'private-test-password' };
function database(user = { id: 'test-user', app_metadata: { role: 'executive' } }, missingOrg = false) {
  return { auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }), admin: { getUserById: async () => ({ data: { user } }) } }, from(table) {
    const result = { data: table === 'organisations' ? missingOrg ? null : { id: org } : table.includes('products') || table.includes('validations') ? [] : null, error: null };
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: async () => result, then: (resolve) => Promise.resolve(result).then(resolve) };
    return query;
  } };
}
function response() {
  return { code: null, headers: {}, body: null, status(code) { this.code = code; return this }, setHeader(key, value) { this.headers[key] = value; return this }, end(value) { this.body = value ? JSON.parse(value) : null } };
}
const request = (body, token = true) => ({ method: body ? 'POST' : 'GET', url: `/?organisationId=${org}`, headers: { ...(token ? { authorization: 'Bearer test-session' } : {}), origin: 'https://admin.arch9.co.za' }, body });

test('trusted executive metadata is required; principal and spoofed user metadata do not grant access', async () => {
  assert.equal(isKnowledgeFactoryExecutive({ user_metadata: { role: 'executive' } }), false);
  for (const user of [{ id: 'test-user', app_metadata: { role: 'principal' } }, { id: 'test-user', user_metadata: { role: 'executive' } }]) {
    const reply = response();
    await createKnowledgeFactoryAdminHandler({ env, createDb: () => database(user) })(request(), reply);
    assert.equal(reply.code, 403);
  }
  const reply = response();
  await createKnowledgeFactoryAdminHandler({ env, createDb: () => database() })(request(null, false), reply);
  assert.equal(reply.code, 401);
});
test('status is read only and never exposes supplier or service-role credentials', async () => {
  const reply = response();
  await createKnowledgeFactoryAdminHandler({ env, createDb: () => database() })(request(), reply);
  assert.equal(reply.code, 200);
  assert.equal(reply.body.activationAvailable, false);
  assert.equal(reply.body.supplier.uatEndpointConfigured, true);
  assert.equal(reply.body.policy, null);
  assert.doesNotMatch(JSON.stringify(reply.body), /private-test|test@example/);
  assert.equal(reply.headers['Access-Control-Allow-Origin'], 'https://admin.arch9.co.za');
  const missing = response();
  await createKnowledgeFactoryAdminHandler({ env, createDb: () => database(undefined, true) })(request(), missing);
  assert.equal(missing.code, 404);
});
test('saving caps cannot activate a pilot or grant report access', async () => {
  let forwarded;
  const reply = response();
  await createKnowledgeFactoryAdminHandler({ env, createDb: () => database(), policyHandler: async (req, res) => { forwarded = req.body; res.status(200).end('{}') } })(request({ action: 'save_limits', supplierCreditsPerCent: 40, rolloutStage: 'pilot', enabled: true, allowedProductIds: ['basic_owner_lookup'] }), reply);
  assert.equal(forwarded.rolloutStage, 'controlled_uat');
  assert.equal(forwarded.enabled, undefined);
  assert.equal(forwarded.organisationId, org);
  assert.equal(forwarded.action, 'save');
});
test('forwarded authentication headers survive an IncomingMessage-style prototype getter', async () => {
  const incoming = Object.assign(Object.create({ get headers() { return { authorization: 'Bearer test-session' } } }), { method: 'POST', url: `/?organisationId=${org}`, body: { action: 'save_limits', supplierCreditsPerCent: 30 } });
  const reply = response();
  await createKnowledgeFactoryAdminHandler({ env, createDb: () => database(), policyHandler: async (req, res) => { assert.equal(req.headers.authorization, 'Bearer test-session'); assert.equal(req.method, 'POST'); res.status(200).end('{}') } })(incoming, reply);
  assert.equal(reply.code, 200);
});
test('cost validation only forwards server-owned recipes on the pinned UAT endpoint', async () => {
  let forwarded;
  const options = { env, createDb: () => database(), costHandler: async (req, res, config) => { forwarded = req.body; assert.equal(config.authorize, requireKnowledgeFactoryExecutive); res.status(201).end('{}') } };
  const reply = response();
  await createKnowledgeFactoryAdminHandler(options)(request({ action: 'validate_cost', recipeId: 'package_basic_v1', propertyId: 383723, purpose: 'Test cost only', query: 'CUSTOM', paid: true }), reply);
  assert.equal(reply.code, 201);
  assert.equal(forwarded.query, undefined);
  assert.equal(forwarded.paid, undefined);
  assert.equal(forwarded.action, 'validate');
  const formattedEndpoint = response();
  await createKnowledgeFactoryAdminHandler({ ...options, env: { ...env, KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT: env.KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT + '\n' } })(request({ action: 'validate_cost', recipeId: 'package_basic_v1' }), formattedEndpoint);
  assert.equal(formattedEndpoint.code, 201);
  const wrongVersion = response();
  await createKnowledgeFactoryAdminHandler({ ...options, env: { ...env, KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT: 'https://propinfoapi.co.za/uat/v0_1/graphql/' } })(request({ action: 'validate_cost', recipeId: 'package_basic_v1' }), wrongVersion);
  assert.equal(wrongVersion.code, 409);
  const invalidRecipe = response();
  await createKnowledgeFactoryAdminHandler(options)(request({ action: 'validate_cost', recipeId: 'custom_query' }), invalidRecipe);
  assert.equal(invalidRecipe.code, 400);
  const execution = response();
  await createKnowledgeFactoryAdminHandler(options)(request({ action: 'execute' }), execution);
  assert.equal(execution.code, 400);
});
test('only internal console Settings mounts setup; legacy commercial writes require executive auth', async () => {
  const admin = await readFile(new URL('../../apps/admin/src/App.jsx', import.meta.url), 'utf8');
  assert.match(admin, /KnowledgeFactoryConfigurationView access=\{access\}/);
  const client = await readFile(new URL('../src/pages/PipelineCanvassingPage.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(client, /KnowledgeFactoryOperationsWorkspace|KnowledgeFactoryConfigurationView/);
  const policy = await readFile(new URL('../api/knowledge-factory/package-commercial-policy.js', import.meta.url), 'utf8');
  assert.match(policy, /requireKnowledgeFactoryExecutive\(request, db, organisationId\)/);
});
