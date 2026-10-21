import { test } from 'node:test';
import assert from 'node:assert/strict';
import { credentialSet, supabaseServiceKey, supabasePublishableKey, withApiCredentials } from '../supabase/functions/_shared/apiCredentials.ts';
const values = {
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_fixture', worker: 'sb_secret_worker_fixture' }),
  SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_fixture' }),
  SUPABASE_SERVICE_ROLE_KEY: 'legacy_service_fixture', SUPABASE_ANON_KEY: 'legacy_anon_fixture',
};
const env = (overrides = {}) => ({ get: name => ({ ...values, ...overrides })[name] });
const invoke = (headers, overrides = {}) => withApiCredentials(req => req, env(overrides))(new Request('https://fixture.invalid', { headers }));
test('outbound database clients prefer the new runtime credentials', () => {
 assert.equal(supabaseServiceKey(env()), 'sb_secret_fixture');
 assert.equal(supabasePublishableKey(env()), 'sb_publishable_fixture');
});
test('missing modern secrets fail closed after compatibility is disabled', () => {
 assert.equal(supabaseServiceKey(env({ SUPABASE_SECRET_KEYS: '' })), '');
 assert.equal(supabaseServiceKey(env({ SUPABASE_SECRET_KEYS: '', ARCH9_ALLOW_LEGACY_API_KEYS: 'true' })), 'legacy_service_fixture');
});
test('retired service key is rejected in either header, even with a valid publishable key', () => {
 for (const headers of [ { apikey: 'legacy_service_fixture' }, { apikey: 'sb_publishable_fixture', authorization: 'Bearer legacy_service_fixture' } ]) {
   assert.equal(invoke(headers).status, 401);
 }
});
test('transition accepts the exact old credential only when explicitly enabled', () => {
 const req = invoke({ apikey: 'legacy_service_fixture', authorization: 'Bearer legacy_service_fixture' }, { ARCH9_ALLOW_LEGACY_API_KEYS: 'true' });
 assert.equal(req.headers.get('apikey'), 'sb_secret_fixture');
 assert.equal(req.headers.get('authorization'), 'Bearer sb_secret_fixture');
});
test('known new server credentials retain server workflow authority', () => {
 const req = invoke({ apikey: 'sb_secret_worker_fixture' });
 assert.equal(req.headers.get('authorization'), 'Bearer sb_secret_fixture');
});
test('a secret apikey plus a user JWT retains user identity without privilege escalation', () => {
 const req = invoke({ apikey: 'sb_secret_worker_fixture', authorization: 'Bearer signed.user.jwt' });
 assert.equal(req.headers.get('authorization'), 'Bearer signed.user.jwt');
});
test('anonymous public workflows and webhooks retain their own authorization inputs', () => {
 assert.equal(invoke({ apikey: 'sb_publishable_fixture' }).headers.get('authorization'), 'Bearer sb_publishable_fixture');
 assert.equal(invoke({ 'x-webhook-signature': 'fixture' }).headers.get('x-webhook-signature'), 'fixture');
 assert.equal(invoke({ authorization: 'Bearer unknown.encoded.service_role' }).headers.get('authorization'), 'Bearer unknown.encoded.service_role');
});
test('malformed credential maps cannot enable a legacy fallback', () => {
 assert.throws(() => credentialSet(env({ SUPABASE_SECRET_KEYS: '[]' })));
});
test('normalization preserves POST payload and unrelated capability headers', async () => {
 const request = new Request('https://fixture.invalid', { method: 'POST', headers: { apikey: 'sb_publishable_fixture', 'x-client-token': 'scoped_fixture' }, body: JSON.stringify({ offer: 'fixture' }) });
 const result = withApiCredentials(req => req, env())(request);
 assert.equal(result.headers.get('x-client-token'), 'scoped_fixture');
 assert.deepEqual(await result.json(), { offer: 'fixture' });
});
test('modern reserved aliases after platform retirement are not retired credentials', () => {
 const aliases = { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture', SUPABASE_ANON_KEY: 'sb_publishable_fixture' };
 assert.equal(invoke({ apikey: 'sb_secret_fixture', authorization: 'Bearer sb_secret_fixture' }, aliases).headers.get('authorization'), 'Bearer sb_secret_fixture');
 assert.equal(invoke({ apikey: 'sb_publishable_fixture' }, aliases).headers.get('authorization'), 'Bearer sb_publishable_fixture');
 assert.equal(supabaseServiceKey(env({ ...aliases, SUPABASE_SECRET_KEYS: '' })), 'sb_secret_fixture');
});
