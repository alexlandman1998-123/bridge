import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { probeSupplierLogin } from '../server/services/knowledgeFactoryLoginProbe.js';

const runtime = { endpoint: 'https://propinfoapi.co.za/uat/v1/graphql/', email: 'uat@example.test', password: 'test-only-password' };
const jsonResponse = (payload) => new Response(JSON.stringify(payload), { status: 200 });

test('no client HTTP diagnostic or supplier operations UI remains', async () => {
  for (const file of ['api/knowledge-factory/cost-matrix.js', 'src/components/canvassing/KnowledgeFactoryCostMatrixPanel.jsx', 'src/services/propertyIntelligence/knowledgeFactoryCostMatrixService.js']) {
    assert.doesNotMatch(await readFile(new URL('../' + file, import.meta.url), 'utf8'), /supplier_login_probe|Check supplier login|probeKnowledgeFactorySupplierLogin/);
  }
  assert.doesNotMatch(await readFile(new URL('../src/pages/PipelineCanvassingPage.jsx', import.meta.url), 'utf8'), /KnowledgeFactoryOperationsWorkspace/);
  assert.match(await readFile(new URL('./knowledge-factory-login-probe.mjs', import.meta.url), 'utf8'), /KNOWLEDGE_FACTORY_RUN_LOGIN_PROBE === 'true'/);
});

test('private probe sends only login, does not redirect or expose its token', async () => {
  let calls = 0;
  const result = await probeSupplierLogin(runtime, async (url, options) => {
    calls++;
    assert.equal(url, runtime.endpoint);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['GraphQL-Cost'], undefined);
    const body = JSON.parse(options.body);
    assert.match(body.query, /login\(login: \$input\)/);
    assert.doesNotMatch(body.query, /propertyById|report/i);
    assert.deepEqual(body.variables.input, { email: runtime.email, password: runtime.password });
    return jsonResponse({ data: { login: { tokenPayload: { token: 'test-only-token' } } } });
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { loginAccepted: true, environment: 'uat_v1', category: 'accepted' });
  assert.doesNotMatch(JSON.stringify(result), /test-only-token|test-only-password|uat@example/);
});

test('probe requires exact versioned UAT endpoint and configured credentials', async () => {
  const noFetch = () => { throw new Error('Must not fetch'); };
  for (const endpoint of ['https://propinfoapi.co.za/live/v1/graphql/', 'https://propinfoapi.co.za/live/uat/graphql/', runtime.endpoint + '?x=1']) {
    assert.equal((await probeSupplierLogin({ ...runtime, endpoint }, noFetch)).category, 'endpoint_not_uat_v1');
  }
  assert.equal((await probeSupplierLogin({ ...runtime, password: '' }, noFetch)).category, 'config_missing');
  const accepted = await probeSupplierLogin({ ...runtime, endpoint: runtime.endpoint + '\n' }, async (url) => {
    assert.equal(url, runtime.endpoint);
    return jsonResponse({ data: { login: { tokenPayload: { token: 'test-only-token' } } } });
  });
  assert.equal(accepted.loginAccepted, true);
});

test('supplier rejection is categorized without echoing raw supplier details', async () => {
  for (const [message, category] of [['User does not exist or has been disabled. test-only-password', 'account_not_found_or_disabled'], ['Invalid password test-only-password', 'credentials_rejected'], ['secret supplier details', 'graphql_login_error']]) {
    const result = await probeSupplierLogin(runtime, async () => jsonResponse({ data: { login: { errors: [{ message }] } } }));
    assert.equal(result.category, category);
    assert.doesNotMatch(JSON.stringify(result), /test-only-password|secret supplier/);
  }
});

test('HTTP, timeout and malformed responses fail safely', async () => {
  assert.equal((await probeSupplierLogin(runtime, async () => new Response('secret', { status: 403 }))).category, 'http_error');
  assert.equal((await probeSupplierLogin(runtime, async () => { throw new DOMException('secret', 'TimeoutError'); })).category, 'timeout');
  assert.equal((await probeSupplierLogin(runtime, async () => new Response('secret'))).category, 'network_or_response_error');
});
