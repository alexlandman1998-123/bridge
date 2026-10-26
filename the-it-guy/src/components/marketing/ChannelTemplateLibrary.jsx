import { useState } from 'react'
import { ArrowRight, Copy, Plus, Search } from 'lucide-react'
import { CHANNEL_TEMPLATE_CHANNELS, channelTemplatePayload } from '../../services/marketingChannelTemplateService'
import CampaignPlatformLogo from './CampaignPlatformLogo'
import { CHANNEL_TEMPLATE_STARTERS } from './channelTemplateStarters'
import './ChannelTemplateLibrary.css'

function TemplatePreview({ template }) {
  return <div className={`ct-content-preview ct-content-preview-${template.channel}`}>
    <div className="ct-preview-channel"><CampaignPlatformLogo channel={template.channel} />{CHANNEL_TEMPLATE_CHANNELS[template.channel]}</div>
    {template.title && <strong>{template.title}</strong>}
    <p>{template.body || 'Your message preview appears here.'}</p>
    {template.cta_label && <span className="ct-preview-cta">{template.cta_label}</span>}
    {template.destination_url && <small>{template.destination_url}</small>}
  </div>
}

export function ChannelTemplateEditor({ template, duplicate = false, canShare, userId, initialChannel, onSave, onCancel, onUse }) {
  const [form, setForm] = useState(() => ({
    name: template ? `${template.name}${duplicate ? ' (copy)' : ''}` : '',
    channel: template?.channel || initialChannel || 'email',
    visibility: duplicate ? 'personal' : template?.visibility || 'personal',
    description: template?.description || '', title: template?.title || '', body: template?.body || '',
    cta_label: template?.cta_label || '', destination_url: template?.destination_url || '', image_url: template?.image_url || '',
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const field = (key) => ({ value: form[key], onChange: (event) => setForm((previous) => ({ ...previous, [key]: event.target.value })) })
  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try { await (event.nativeEvent.submitter?.value === 'campaign' ? onUse : onSave)(channelTemplatePayload(form)) } catch (failure) { setError(failure.message); setBusy(false) }
  }
  return <section className="ct-editor" aria-labelledby="ct-editor-heading">
    <form className="mc-panel" onSubmit={save}>
      <h2 id="ct-editor-heading">{duplicate ? 'Duplicate channel template' : template ? 'Edit channel template' : initialChannel ? `Create ${CHANNEL_TEMPLATE_CHANNELS[initialChannel]} template` : 'Create channel template'}</h2>
      {error && <p className="mc-error" role="alert">{error}</p>}
      <fieldset disabled={busy}>
        <label>Template name<input required maxLength={120} placeholder="e.g. Seller valuation invitation" {...field('name')} /></label>
        <div className="ct-form-row">
          <label>Channel<select disabled={Boolean(initialChannel)} {...field('channel')}>{Object.entries(CHANNEL_TEMPLATE_CHANNELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Who can use this template?<select disabled={Boolean(template?.created_by && !duplicate && template.created_by !== userId)} {...field('visibility')}><option value="personal">Only me</option>{(canShare || form.visibility === 'agency') && <option value="agency">Everyone in this agency</option>}</select></label>
        </div>
        <label>Description<textarea rows={2} maxLength={600} placeholder="When should someone use this template?" {...field('description')} /></label>
        <label>{form.channel === 'email' ? 'Email subject' : ['meta', 'chatgpt'].includes(form.channel) ? 'Ad headline' : 'Title (optional)'}<input required={form.channel === 'email'} maxLength={240} {...field('title')} /></label>
        <label>{['meta', 'chatgpt'].includes(form.channel) ? 'Primary ad text' : form.channel === 'social' ? 'Post caption' : 'Message content'}<textarea required rows={8} maxLength={9000} placeholder="Write reusable content. Use [first name], [area] or [listing link] where details need to be personalised." {...field('body')} /></label>
        <label>Call to action (optional)<input maxLength={80} placeholder="e.g. Book a valuation" {...field('cta_label')} /></label>
        <label>Destination link (optional)<input type="url" maxLength={2048} placeholder="https://…" {...field('destination_url')} /></label>
        <label>Image link (optional)<input type="url" maxLength={2048} placeholder="https://…" {...field('image_url')} /></label>
        <p className="ct-editor-note">{form.channel === 'whatsapp' ? 'This saves draft copy. WhatsApp Business template approval is managed separately.' : form.channel === 'email' ? 'This saves reusable subject and message copy. Email design and sending are handled in the email workspace.' : 'This saves draft content for your campaign. Publishing is handled separately.'}</p>
        <div className="ct-editor-actions">{onUse && <button className="mc-button" type="submit" value="campaign">Use in campaign<ArrowRight size={16} /></button>}<button className="mc-button" type="button" onClick={onCancel}>Cancel</button><button className="mc-button mc-primary" type="submit">{busy ? 'Saving…' : 'Save channel template'}</button></div>
      </fieldset>
    </form>
    <aside className="mc-panel ct-editor-preview"><h3>Preview</h3><TemplatePreview template={form} /><p className="ct-editor-note">Placeholders remain editable text. Review and personalise them when you create a campaign.</p></aside>
  </section>
}

export default function ChannelTemplateLibrary({ templates, loading, error, userId, canShare, onRetry, onCreate, onEdit, onDuplicate, onUse, onStart, fixedChannel }) {
  const [selectedChannel, setChannel] = useState('all')
  const channel = fixedChannel || selectedChannel
  const channelLabel = fixedChannel ? CHANNEL_TEMPLATE_CHANNELS[fixedChannel] : ''
  const starters = CHANNEL_TEMPLATE_STARTERS.filter(template => template.channel === channel)
  const [visibility, setVisibility] = useState('all')
  const [search, setSearch] = useState('')
  const filtered = templates.filter((item) =>
    (item.visibility === 'agency' || item.created_by === userId) &&
    (channel === 'all' || item.channel === channel) &&
    (visibility === 'all' || (visibility === 'personal' ? item.visibility === 'personal' && item.created_by === userId : item.visibility === 'agency')) &&
    `${item.name} ${item.description} ${item.title} ${item.body}`.toLowerCase().includes(search.toLowerCase()),
  )
  return <section className="ct-library" aria-labelledby="ct-library-heading">
    <header className="mc-panel-heading"><h2 id="ct-library-heading">{fixedChannel && <CampaignPlatformLogo channel={fixedChannel} />}{channelLabel ? `${channelLabel} templates` : 'Channel templates'}</h2><button className="mc-button mc-primary" onClick={onCreate}><Plus size={16} />{channelLabel ? `Create ${channelLabel} template` : 'Create channel template'}</button></header>
    {starters.length > 0 && onStart && <section className="ct-starters" aria-label={`Ready-made ${channel === 'email' ? 'email' : CHANNEL_TEMPLATE_CHANNELS[channel]} starters`}>
      <div className="ct-starters-heading"><h3>Start with a template</h3><span>Ready-made copy. Make it yours.</span></div>
      <div className="ct-starter-row">{starters.map((starter) => <button type="button" key={starter.id} className={`ct-starter ct-starter-${starter.theme}`} onClick={() => onStart(starter)} aria-label={`Customise ${starter.name}`}>
        <div className="ct-starter-art" aria-hidden="true"><div className={`ct-mini-email${channel === 'email' ? '' : ' ct-mini-social'}`}><span className="ct-mini-brand">{channel === 'email' ? 'YOUR AGENCY' : channel === 'chatgpt' ? 'CHATGPT · AD DRAFT' : 'FACEBOOK · INSTAGRAM'}</span><div className="ct-mini-banner" /><strong>{starter.title}</strong><span className="ct-mini-line" /><span className="ct-mini-line ct-mini-line-short" /><span className="ct-mini-cta">{starter.cta_label}</span></div></div>
        <div className="ct-starter-copy"><h4>{starter.name}</h4><p>{starter.description}</p><span>Customise template<ArrowRight size={15} /></span></div>
      </button>)}</div>
    </section>}
    {!fixedChannel && <nav className="ct-channel-filters" aria-label="Channel template channels">{[['all', 'All channels'], ...Object.entries(CHANNEL_TEMPLATE_CHANNELS)].map(([key, label]) => <button key={key} aria-pressed={channel === key} onClick={() => setChannel(key)}>{key !== 'all' && <CampaignPlatformLogo channel={key} />}{label}</button>)}</nav>}
    <div className="ct-library-controls"><label>Collection<select aria-label="Channel template collection" value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="all">All templates</option><option value="personal">My templates</option><option value="agency">Agency templates</option></select></label><label className="mc-search"><Search size={16} /><input aria-label="Search channel templates" placeholder="Search templates…" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
    {error ? <div className="mc-error" role="alert">{error.startsWith('Channel template storage is not enabled') ? `Saved templates are unavailable in this environment.${starters.length > 0 && onStart ? ' You can still customise a ready-made starter and use it in a campaign.' : ''}` : error} <button className="mc-text-button" onClick={onRetry}>Retry channel templates</button></div> : loading ? <p role="status">Loading channel templates…</p> : filtered.length ? <div className="ct-template-grid">{filtered.map((template) => <article className="ct-template-card" key={template.id}>
      <div className="ct-card-heading"><CampaignPlatformLogo channel={template.channel} /><span>{CHANNEL_TEMPLATE_CHANNELS[template.channel]}</span><small>{template.visibility === 'agency' ? 'Agency' : 'Personal'}</small></div>
      <h3>{template.name}</h3>{template.description && <p>{template.description}</p>}
      <details className="ct-card-preview"><summary>Preview content</summary><TemplatePreview template={template} /></details>
      <div className="ct-card-actions"><button className="mc-text-button" onClick={() => onDuplicate(template)}><Copy size={14} />Duplicate</button>{(template.visibility === 'agency' ? canShare : template.created_by === userId) && <button className="mc-text-button" onClick={() => onEdit(template.id)}>Edit template</button>}</div>
      <button className="mc-button ct-use-template" onClick={() => onUse(template)}>Use in campaign<ArrowRight size={16} /></button>
    </article>)}</div> : <div className="mc-empty"><Copy size={30} /><h3>{filtered.length === 0 && (search || visibility !== 'all') ? 'No matching templates' : channelLabel ? `Create your first ${channelLabel} template` : 'Create your first channel template'}</h3><p>{search || visibility !== 'all' ? 'Try another collection or search.' : channelLabel ? `Save reusable ${channelLabel} content in this workspace.` : 'Save reusable email, WhatsApp, Meta ad, ChatGPT ad and social content here.'}</p></div>}
  </section>
}
