export function isKnowledgeFactoryExecutive(user) {
  const metadata = user?.app_metadata || {};
  return [metadata.role, metadata.app_role, ...(Array.isArray(metadata.roles) ? metadata.roles : [])]
    .some((role) => typeof role === 'string' && role.trim().toLowerCase() === 'executive');
}
export async function requireKnowledgeFactoryExecutive(request, db, organisationId) {
  const entry = Object.entries(request.headers || {}).find(([key]) => key.toLowerCase() === 'authorization');
  const token = String(entry?.[1] || '').replace(/^Bearer\s+/i, '');
  const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
  if (!token) fail(401, 'Sign in to the internal Operating Console.');
  const current = await db.auth.getUser(token);
  if (current.error || !current.data?.user?.id) fail(401, 'Your internal admin session could not be verified.');
  const trusted = await db.auth.admin.getUserById(current.data.user.id);
  if (trusted.error || !trusted.data?.user) fail(401, 'Your internal admin session could not be verified.');
  if (!isKnowledgeFactoryExecutive(trusted.data.user)) fail(403, 'Internal executive access is required for supplier setup.');
  const organisation = await db.from('organisations').select('id').eq('id', organisationId).maybeSingle();
  if (organisation.error) fail(503, 'The selected organisation could not be checked.');
  if (!organisation.data) fail(404, 'The selected organisation does not exist.');
  return { userId: trusted.data.user.id, stagedAccess: false };
}
