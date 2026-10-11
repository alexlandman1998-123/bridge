import { checkCampaignContent } from '../_shared/emailCampaignContentCheck.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

export function createContentCheckHandler({ createClient, env, fetcher = fetch }: { createClient: any; env: (key: string) => string | undefined; fetcher?: typeof fetch }) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
    try {
      const url = env('SUPABASE_URL'), key = env('SUPABASE_ANON_KEY');
      if (!url || !key) return json(503, { error: 'Campaign content checking is not configured.' });
      const db = createClient(url, key, { global: { headers: { Authorization: req.headers.get('authorization') || '' } }, auth: { persistSession: false } });
      const { data: userData, error: userError } = await db.auth.getUser();
      if (userError || !userData?.user) return json(401, { error: 'Sign in to check this campaign.' });
      const body = await req.json().catch(() => null);
      if (typeof body?.campaignId !== 'string') return json(400, { error: 'Choose a saved campaign to check.' });
      const { data: campaign, error } = await db.from('email_campaigns').select('id,organisation_id,html,content_json,preview_text,email_sender_identities(display_name,from_email)').eq('id', body.campaignId).maybeSingle();
      if (error || !campaign) return json(404, { error: 'This campaign is not available in your workspace.' });
      const { data: permitted, error: permissionError } = await db.rpc('email_campaign_can_send', { p_organisation_id: campaign.organisation_id });
      if (permissionError || !permitted) return json(403, { error: 'You do not have permission to check this campaign.' });
      const identity = Array.isArray(campaign.email_sender_identities) ? campaign.email_sender_identities[0] : campaign.email_sender_identities;
      const report = await checkCampaignContent({ db, campaign, supabaseUrl: url, fetcher, context: { agencyName: identity?.display_name, senderEmail: identity?.from_email, previewText: campaign.preview_text } });
      const { html: _html, imageUrls: _imageUrls, ...result } = report;
      return json(200, result);
    } catch { return json(503, { error: 'Campaign content checking is temporarily unavailable. Try again.' }); }
  };
}
