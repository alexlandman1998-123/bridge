import { inspectCampaignEmail } from './emailContent.js';
import { checkCampaignSourceFreshness } from './emailCampaignSourceFreshness.js';

const bucketPrefix = '/storage/v1/object/public/email-campaign-images/';
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

// Check the image links found in HTML, never a client-supplied import manifest.
// Arbitrary external hosts are not fetched: only our configured Storage origin.
export async function checkCampaignContent({ db, campaign, supabaseUrl, fetcher = fetch, context = {} }: {
  db: any; campaign: any; supabaseUrl: string; fetcher?: typeof fetch; context?: Record<string, unknown>;
}) {
  const report = inspectCampaignEmail(campaign, context);
  if (!report.ready) return report;
  const sourceFreshness = await checkCampaignSourceFreshness({ db, campaign });
  if (!sourceFreshness.ready) return { ...report, ready: false, errors: [sourceFreshness.reason], sourceFreshness };
  const errors: string[] = [];
  const own = new URL(supabaseUrl);
  const owned = new Map<string, string>();
  let external = false;
  for (const link of report.imageUrls) {
    const url = new URL(link);
    const prefix = own.pathname.replace(/\/$/, '') + bucketPrefix;
    if (url.origin !== own.origin) { external = true; continue; }
    let pathname: string;
    try { pathname = decodeURIComponent(url.pathname); } catch { errors.push('A hosted image path is invalid. Upload the image again.'); continue; }
    const renderedPrefix = prefix.replace('/object/public/', '/render/image/public/');
    if (pathname.startsWith(renderedPrefix)) { errors.push('Use the original campaign image link from the library so its upload can be confirmed.'); continue; }
    if (!pathname.startsWith(prefix)) { external = true; continue; }
    const path = pathname.slice(prefix.length);
    if (!new RegExp(`^organisations/${campaign.organisation_id}/(${uuid})\\.(?:jpg|png|gif|webp)$`, 'i').test(path)) {
      errors.push('Use campaign images belonging to this agency. Upload the image in this workspace.'); continue;
    }
    owned.set(path, `${own.origin}${prefix}${path}`);
  }
  if (external) report.warnings.push('External images remain controlled by their host. Their availability and retention have not been verified by Arch9.');
  if (owned.size && !errors.length) {
    const { data, error } = await db.from('email_campaign_assets').select('storage_path,mime_type,byte_size').eq('organisation_id', campaign.organisation_id).in('storage_path', [...owned.keys()]);
    if (error) errors.push('Campaign image hosting could not be checked. Enable image hosting or try again.');
    else {
      const rows = new Map((data || []).map((row: any) => [row.storage_path, row]));
      // One deadline bounds all public HEAD checks; six concurrent requests
      // avoid a long serial scan without creating an unbounded fetch fanout.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const pending = [...owned];
      try {
        await Promise.all(Array.from({ length: Math.min(6, pending.length) }, async () => {
          while (pending.length) {
            const [path, url] = pending.shift()!;
            const row: any = rows.get(path);
            if (!row) { errors.push('A campaign image is missing from this agency’s library. Upload it again.'); continue; }
            try {
              const response = await fetcher(url, { method: 'HEAD', redirect: 'manual', signal: controller.signal });
              const type = response.headers.get('content-type')?.split(';')[0].trim();
              if (!response.ok || type !== row.mime_type || response.headers.get('content-length') !== String(row.byte_size)) errors.push('A hosted image is missing or incomplete. Upload it again before sending.');
              await response.body?.cancel();
            } catch { errors.push('Hosted images could not be confirmed. Try the content check again before sending.'); }
          }
        }));
      } finally { clearTimeout(timeout); }
    }
  }
  return { ...report, ready: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(report.warnings)], sourceFreshness };
}
