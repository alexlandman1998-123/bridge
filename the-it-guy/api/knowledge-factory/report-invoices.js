import { createClient } from '@supabase/supabase-js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = new Set(['principal','owner','director','admin','super_admin','agency_admin']);
export function createReportInvoicesHandler({ createDb = createClient, env = process.env } = {}) {
  return async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    const json = (status, value) => { response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8'); response.end(JSON.stringify(value)); };
    if (request.method !== 'GET') return json(405, { error: 'Method not allowed.' });
    try {
      const organisationId = new URL(request.url, 'https://app.arch9.co.za').searchParams.get('organisationId');
      if (!UUID.test(organisationId || '')) return json(400, { error: 'Choose a valid organisation.' });
      const token = String(request.headers?.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token) return json(401, { error: 'Please sign in again.' });
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json(503, { error: 'Report invoices are not configured.' });
      const db = createDb(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const auth = await db.auth.getUser(token);
      if (auth.error || !auth.data?.user?.id) return json(401, { error: 'Please sign in again.' });
      const membership = await db.from('organisation_users').select('status, membership_status, workspace_role, organization_role, organisation_role, role').eq('organisation_id', organisationId).eq('user_id', auth.data.user.id).maybeSingle();
      const member = membership.data;
      let role = String(member?.workspace_role || member?.organization_role || member?.organisation_role || member?.role || '').trim().toLowerCase();
      role = ({ administrator: 'admin', superadmin: 'super_admin', 'principal / owner': 'principal' })[role] || role;
      if (membership.error || !member || String(member.membership_status || member.status).toLowerCase() !== 'active' || !ROLES.has(role))
        return json(403, { error: 'Only current agency administrators can view monthly report invoices.' });
      const { data, error } = await db.from('knowledge_factory_report_invoices')
        .select('id, invoice_month, currency, status, issued_at, knowledge_factory_report_invoice_lines(id, product_name, amount_cents, created_at)')
        .eq('organisation_id', organisationId).order('invoice_month', { ascending: false }).limit(24);
      if (error) return json(503, { error: 'Monthly report invoices could not be loaded.' });
      return json(200, { invoices: (data || []).map(invoice => ({ ...invoice,
        totalCents: invoice.knowledge_factory_report_invoice_lines.reduce((sum, line) => sum + line.amount_cents, 0) })) });
    } catch { return json(503, { error: 'Monthly report invoices could not be loaded.' }); }
  };
}
export default createReportInvoicesHandler();
