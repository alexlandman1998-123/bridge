// Provider commands always resolve the actor and check the requested workspace.
// A service-role connection alone never authorises access to another tenant.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADMIN_ROLES = new Set(['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']);
export async function requireInboxAdminUser(db: any, organisationId: string, userId: string) {
  if (!UUID.test(organisationId) || !UUID.test(userId)) throw new Error('A valid workspace and signed-in user are required.');
  const membership = await db.from('organisation_users').select('role,status,membership_status').eq('organisation_id', organisationId).eq('user_id', userId).maybeSingle();
  if (membership.error || !['active', 'accepted'].includes(String(membership.data?.membership_status || membership.data?.status || '').trim().toLowerCase()) || !ADMIN_ROLES.has(String(membership.data?.role || '').toLowerCase())) throw new Error('Organisation administrator access is required.');
  return userId;
}
export async function requireInboxAdmin(req: Request, db: any, organisationId: string) {
  const token = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sign in before managing an inbox connection.');
  const auth = await db.auth.getUser(token);
  if (auth.error || !auth.data?.user) throw new Error('Sign in before managing an inbox connection.');
  return requireInboxAdminUser(db, organisationId, auth.data.user.id);
}
export function isInboxReturnUrlAllowed(value: string) {
  try {
    const url = new URL(value);
    const allowedOrigin = url.origin === 'https://app.arch9.co.za' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && Boolean(url.port));
    return allowedOrigin && !url.username && !url.password && /^\/(?:revo\/)?inbox(?:\/settings)?$/.test(url.pathname);
  } catch { return false; }
}

// Service-role handlers must authorise the specific mailbox, not merely the
// workspace. The server-only RPC shares the database policy rules with RLS.
export async function requireInboxMailboxUser(db: any, organisationId: string, userId: string, channelId: string, permission = 'manage') {
  if (![organisationId, userId, channelId].every(value => UUID.test(value)) || !['read', 'work', 'send', 'manage'].includes(permission)) throw new Error('A valid workspace, mailbox and signed-in user are required.');
  const result = await db.rpc('shared_inbox_authorize_mailbox_user', {
    p_organisation_id: organisationId, p_channel_id: channelId, p_user_id: userId, p_permission: permission,
  });
  if (result.error || result.data !== true) throw new Error('Mailbox access is required.');
  return userId;
}
export async function requireInboxMailbox(req: Request, db: any, organisationId: string, channelId: string, permission = 'manage') {
  const token = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sign in before managing an inbox connection.');
  const auth = await db.auth.getUser(token);
  if (auth.error || !auth.data?.user) throw new Error('Sign in before managing an inbox connection.');
  return requireInboxMailboxUser(db, organisationId, auth.data.user.id, channelId, permission);
}
