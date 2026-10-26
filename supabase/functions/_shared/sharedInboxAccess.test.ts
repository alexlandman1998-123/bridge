import { requireInboxAdmin, requireInboxAdminUser, isInboxReturnUrlAllowed } from './sharedInboxAccess.ts';
const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = '11111111-1111-4111-8111-111111111111';
function assert(value: unknown, message = 'Assertion failed') { if (!value) throw new Error(message); }
async function rejects(action: () => Promise<unknown>) { try { await action(); } catch { return; } throw new Error('Expected denied access'); }
function fixture(role = 'admin', status = 'active') {
  const filters: Record<string, unknown> = {};
  const db = {
    auth: { getUser: async (token: string) => ({ data: { user: token === 'valid' ? { id: USER } : null }, error: null }) },
    from: (table: string) => { assert(table === 'organisation_users'); return { select: () => { const query = { eq: (key: string, value: unknown) => { filters[key] = value; return query; }, maybeSingle: async () => ({ error: null, data: filters.organisation_id === ORG_A && filters.user_id === USER ? { role, status } : null }) }; return query; } }; },
  };
  return db;
}
Deno.test('allows an active administrator in their own workspace, including non-Revo accounts', async () => {
  const db = fixture();
  assert(await requireInboxAdmin(new Request('https://example.test', { headers: { authorization: 'Bearer valid' } }), db, ORG_A) === USER);
  await rejects(() => requireInboxAdminUser(db, ORG_B, USER));
  assert(await requireInboxAdminUser(fixture('admin', 'accepted'), ORG_A, USER) === USER);
});
Deno.test('rejects invalid sessions, inactive members and non-admin users', async () => {
  for (const [role, status] of [['agent', 'active'], ['admin', 'suspended'], ['admin', 'pending']]) await rejects(() => requireInboxAdminUser(fixture(role, status), ORG_A, USER));
  await rejects(() => requireInboxAdmin(new Request('https://example.test', { headers: { authorization: 'Bearer invalid' } }), fixture(), ORG_A));
  await rejects(() => requireInboxAdminUser(fixture(), 'invalid-org', USER));
});
Deno.test('allows only canonical and legacy Inbox returns on trusted origins', () => {
  for (const url of ['https://app.arch9.co.za/inbox/settings', 'https://app.arch9.co.za/revo/inbox?view=mine', 'http://127.0.0.1:5173/inbox/settings']) assert(isInboxReturnUrlAllowed(url), url);
  for (const url of ['https://app.arch9.co.za.attacker.test/inbox', 'https://app.arch9.co.za/inbox/other', 'https://attacker.test/inbox', 'https://user:password@app.arch9.co.za/inbox', 'javascript:alert(1)']) assert(!isInboxReturnUrlAllowed(url), url);
});

Deno.test('mailbox commands verify the session and pass the exact mailbox and actor to the server-only permission check', async () => {
  const { requireInboxMailbox, requireInboxMailboxUser } = await import('./sharedInboxAccess.ts');
  const channel = '44444444-4444-4444-8444-444444444444';
  let called = 0;
  const db = {
    auth: { getUser: async (token: string) => ({ data: { user: token === 'valid' ? { id: USER } : null }, error: null }) },
    rpc: async (name: string, input: Record<string, unknown>) => {
      called++;
      assert(name === 'shared_inbox_authorize_mailbox_user');
      assert(input.p_organisation_id === ORG_A && input.p_channel_id === channel && input.p_user_id === USER && input.p_permission === 'manage');
      return { data: true, error: null };
    },
  };
  assert(await requireInboxMailbox(new Request('https://example.test', { headers: { authorization: 'Bearer valid' } }), db, ORG_A, channel) === USER);
  assert(called === 1);
  await rejects(() => requireInboxMailbox(new Request('https://example.test', { headers: { authorization: 'Bearer forged' } }), db, ORG_A, channel));
  await rejects(() => requireInboxMailboxUser(db, ORG_A, USER, 'invalid'));
  assert(called === 1);
  for (const response of [{ data: false, error: null }, { data: true, error: { message: 'unavailable' } }, { data: 'true', error: null }]) {
    await rejects(() => requireInboxMailboxUser({ rpc: async () => response }, ORG_A, USER, channel));
  }
});
