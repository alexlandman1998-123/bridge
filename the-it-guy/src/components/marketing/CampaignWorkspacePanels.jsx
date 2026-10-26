import { useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, ChartNoAxesCombined, ExternalLink, Images, LayoutGrid, Palette, Search, UsersRound } from 'lucide-react';
import { MarketingLink as Link } from './MarketingNavigation.jsx'
import { CAMPAIGN_CHANNELS } from '../../services/marketingCampaignService';
import './CampaignWorkspacePanels.css';
const campaignPages = ['overview', 'calendar', 'studio', 'analytics', 'assets', 'agents'];
const pageIcons = [LayoutGrid, CalendarDays, Palette, ChartNoAxesCombined, Images, UsersRound];
export function CampaignWorkspaceNavigation({
  active,
  canManage,
  onNavigate
}) {
  return <nav className="mc-workspace-navigation" aria-label="Campaign workspace">
      {campaignPages.filter(page => page !== 'agents' || canManage).map(page => {
      const Icon = pageIcons[campaignPages.indexOf(page)];
      return <button key={page} type="button" aria-current={active === page ? 'page' : undefined} onClick={() => onNavigate({
        page
      })}>
            <Icon size={17} aria-hidden="true" />{page[0].toUpperCase() + page.slice(1)}
          </button>;
    })}
    </nav>;
}
export function CampaignStudioIntro({
  onCreate, onAllFormats
}) {
  return <section className="mc-studio-intro" aria-labelledby="mc-studio-heading">
      <div>
        <h2 id="mc-studio-heading">Studio</h2>
      </div>
      <div className="mc-studio-actions">
        {onAllFormats && <button type="button" className="mc-button" onClick={onAllFormats}><ArrowLeft size={16} />All marketing formats</button>}
        <button className="mc-button mc-primary" onClick={onCreate}>Build a campaign <ArrowRight size={16} /></button>
        <a className="mc-button" href="https://www.canva.com/" target="_blank" rel="noopener noreferrer">Open Canva <ExternalLink size={15} /></a>
      </div>
    </section>;
}
export function CampaignAssetLibrary({
  workspace
}) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const items = workspace.campaigns.map(campaign => ({
    campaign,
    pack: Boolean(campaign.listing_builder || campaign.campaign_builder),
    drafts: Object.entries(campaign.channel_content || {}).filter(([, content]) => content?.body?.trim() || content?.title?.trim())
  })).filter(({
    campaign,
    pack,
    drafts
  }) => (pack || drafts.length) && (kind === 'all' || (kind === 'packs' ? pack : drafts.length > 0)) && `${campaign.name} ${campaign.area || ''}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="mc-assets-library mc-panel" aria-labelledby="mc-assets-library-heading">
      <header className="mc-panel-heading">
        <div><h2 id="mc-assets-library-heading">Assets &amp; saved copy</h2></div>
        <label className="mc-search"><Search size={17} /><input aria-label="Search campaign assets" placeholder="Search assets…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      </header>
      <label className="mc-asset-kind">Show <select aria-label="Asset type" value={kind} onChange={event => setKind(event.target.value)}><option value="all">All assets</option><option value="packs">Campaign packs</option><option value="copy">Saved copy</option></select></label>
      <div className="mc-asset-grid">
        {items.map(({
        campaign,
        pack,
        drafts
      }) => <article className="mc-asset-card" key={campaign.id}>
            <div className={`mc-asset-preview${pack ? ' mc-asset-preview-pack' : ''}`}><Images size={30} strokeWidth={1.4} aria-hidden="true" /><span>{pack ? 'Campaign pack' : 'Channel copy'}</span></div>
            <div className="mc-asset-card-copy"><h3>{campaign.name}</h3><p>{campaign.area || 'Agency campaign'}</p>
              <div className="mc-asset-labels">{pack && <span>Artwork builder</span>}{drafts.map(([channel]) => <span key={channel}>{CAMPAIGN_CHANNELS[channel] || channel} draft</span>)}</div>
              <Link to={`?section=campaigns&page=assets&view=detail&id=${encodeURIComponent(campaign.id)}&tab=${pack ? 'assets' : 'activity'}`}>{pack ? 'Open campaign pack' : 'Review saved copy'}<ArrowRight size={16} /></Link>
            </div>
          </article>)}
      </div>
      {!items.length && <div className="mc-empty"><Images size={30} /><h3>{search || kind !== 'all' ? 'No matching assets' : 'Your creative library starts here'}</h3><p>{search || kind !== 'all' ? 'Try another search or asset type.' : 'Save a campaign using a Studio template to find its pack and copy here.'}</p><Link className="mc-button" to="?section=campaigns&page=studio">Explore Studio <ArrowRight size={16} /></Link></div>}
    </section>;
}
export { default as CampaignAgents } from './CampaignAgents'
