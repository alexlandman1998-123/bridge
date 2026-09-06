import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Save, Trash2 } from 'lucide-react'

const PAGE_ORDER = { home: 0, about: 1, contact: 2, valuation: 3, campaign: 4 }
const PAGE_LABELS = { home: 'Home', about: 'About', contact: 'Contact', valuation: 'Valuation', campaign: 'Campaign' }
const BLOCK_LABELS = { hero: 'Hero', rich_text: 'Story', property_collection: 'Properties', benefits: 'Benefits', faq: 'FAQ', lead_form: 'Enquiry form', cta: 'Call to action' }
const ADDABLE_BLOCKS = ['rich_text', 'benefits', 'faq', 'cta']

function copy(value) {
  return JSON.parse(JSON.stringify(value))
}

function purposeFor(pageKind) {
  if (pageKind === 'valuation') return 'valuation_request'
  if (pageKind === 'campaign') return 'campaign_enquiry'
  return 'general_enquiry'
}

function defaultBlock(type, pageKind) {
  if (type === 'hero') return { type, eyebrow: 'LOCAL PROPERTY', heading: 'A clear headline for this page.', body: 'Add a concise introduction for visitors.' }
  if (type === 'rich_text') return { type, heading: 'Add your story', body: 'Write clear, useful page copy here.' }
  if (type === 'property_collection') return { type, heading: 'Featured properties', maxItems: 3 }
  if (type === 'benefits') return { type, heading: 'Why work with us', items: [{ title: 'Local knowledge', body: 'Explain this benefit in one useful sentence.' }] }
  if (type === 'faq') return { type, heading: 'Questions, answered', items: [{ question: 'What should clients know?', answer: 'Add a clear, helpful answer.' }] }
  if (type === 'lead_form') return { type, heading: 'Start a conversation', body: 'Send us your details and our team will be in touch.', purpose: purposeFor(pageKind) }
  return { type: 'cta', heading: 'Ready for your next move?', body: 'Talk to our local property team.', ctaLabel: 'Contact us', ctaHref: '/contact' }
}

function isRequiredBlock(pageKind, blocks, index) {
  const type = blocks[index]?.type
  const visibleOfType = blocks.filter((block) => block.type === type && !block.hidden).length
  if (pageKind === 'home' && ['hero', 'property_collection', 'lead_form'].includes(type)) return visibleOfType <= 1
  if (['contact', 'valuation'].includes(pageKind) && type === 'lead_form') return visibleOfType <= 1
  return false
}

function TextField({ label, value, onChange, maxLength, area = false, hint }) {
  const Input = area ? 'textarea' : 'input'
  return <label className="ww-content-field">{label}<Input value={value || ''} maxLength={maxLength} rows={area ? 4 : undefined} onChange={(event) => onChange(event.target.value)} />{hint ? <small>{hint}</small> : null}</label>
}

function ItemEditor({ block, onChange }) {
  const benefit = block.type === 'benefits'
  const items = Array.isArray(block.items) ? block.items : []
  const setItem = (index, key, value) => onChange('items', items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item))
  const removeItem = (index) => onChange('items', items.filter((_, itemIndex) => itemIndex !== index))
  const addItem = () => onChange('items', [...items, benefit ? { title: 'New benefit', body: 'Describe this benefit.' } : { question: 'New question', answer: 'Add the answer.' }])
  return <div className="ww-content-items">{items.map((item, index) => <div className="ww-content-item" key={index}><TextField label={benefit ? 'Title' : 'Question'} value={benefit ? item.title : item.question} maxLength={benefit ? 120 : 180} onChange={(value) => setItem(index, benefit ? 'title' : 'question', value)} /><TextField area label={benefit ? 'Description' : 'Answer'} value={benefit ? item.body : item.answer} maxLength={benefit ? 600 : 1200} onChange={(value) => setItem(index, benefit ? 'body' : 'answer', value)} /><button type="button" className="ww-content-icon danger" disabled={items.length <= 1} onClick={() => removeItem(index)} aria-label={`Remove ${benefit ? 'benefit' : 'question'}`}><Trash2 size={15} /></button></div>)}<button type="button" className="ww-content-add-item" disabled={items.length >= 12} onClick={addItem}><Plus size={14} /> Add {benefit ? 'benefit' : 'question'}</button></div>
}

function BlockFields({ block, pageKind, onChange }) {
  if (block.type === 'hero') return <div className="ww-content-fields"><TextField label="Eyebrow" value={block.eyebrow} maxLength={80} onChange={(value) => onChange('eyebrow', value)} /><TextField label="Heading" value={block.heading} maxLength={180} onChange={(value) => onChange('heading', value)} /><TextField area label="Introduction" value={block.body} maxLength={2000} onChange={(value) => onChange('body', value)} />{pageKind === 'home' ? <p className="ww-field-note">The Home hero always includes the property search controls.</p> : <><TextField label="Button label" value={block.ctaLabel} maxLength={80} onChange={(value) => onChange('ctaLabel', value)} /><TextField label="Button destination" value={block.ctaHref} maxLength={240} hint="Use a website path such as /properties or /contact." onChange={(value) => onChange('ctaHref', value)} /></>}</div>
  if (block.type === 'rich_text') return <div className="ww-content-fields"><TextField label="Heading" value={block.heading} maxLength={180} onChange={(value) => onChange('heading', value)} /><TextField area label="Body" value={block.body} maxLength={2000} onChange={(value) => onChange('body', value)} /><TextField label="Optional button label" value={block.ctaLabel} maxLength={80} onChange={(value) => onChange('ctaLabel', value)} /><TextField label="Optional button destination" value={block.ctaHref} maxLength={240} hint="Leave both button fields blank to omit it." onChange={(value) => onChange('ctaHref', value)} /></div>
  if (block.type === 'property_collection') return <div className="ww-content-fields compact"><TextField label="Heading" value={block.heading} maxLength={180} onChange={(value) => onChange('heading', value)} /><label className="ww-content-field">Listings shown<select value={block.maxItems || 3} onChange={(event) => onChange('maxItems', Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count}</option>)}</select></label><label className="ww-content-field">Property type<select value={block.transactionType || ''} onChange={(event) => onChange('transactionType', event.target.value)}><option value="">Sale and rental</option><option value="sale">For sale</option><option value="rental">To rent</option></select></label></div>
  if (block.type === 'benefits' || block.type === 'faq') return <><div className="ww-content-fields compact"><TextField label="Heading" value={block.heading} maxLength={180} onChange={(value) => onChange('heading', value)} /></div><ItemEditor block={block} onChange={onChange} /></>
  if (block.type === 'lead_form') return <div className="ww-content-fields"><TextField label="Heading" value={block.heading} maxLength={180} onChange={(value) => onChange('heading', value)} /><TextField area label="Introduction" value={block.body} maxLength={2000} onChange={(value) => onChange('body', value)} /><label className="ww-content-field">CRM journey<input value={purposeFor(pageKind).replaceAll('_', ' ')} readOnly /><small>The page type fixes the CRM enquiry route.</small></label></div>
  return <div className="ww-content-fields"><TextField label="Heading" value={block.heading} maxLength={180} onChange={(value) => onChange('heading', value)} /><TextField area label="Body" value={block.body} maxLength={2000} onChange={(value) => onChange('body', value)} /><TextField label="Button label" value={block.ctaLabel} maxLength={80} onChange={(value) => onChange('ctaLabel', value)} /><TextField label="Button destination" value={block.ctaHref} maxLength={240} hint="Use a website path such as /contact." onChange={(value) => onChange('ctaHref', value)} /></div>
}

export default function WebsitePageEditor({ pages, revisionId, busy, onSave, onDeleteCampaign }) {
  const orderedPages = useMemo(() => pages.filter((page) => page.revision_id === revisionId).sort((left, right) => (PAGE_ORDER[left.page_kind] ?? 9) - (PAGE_ORDER[right.page_kind] ?? 9) || left.slug.localeCompare(right.slug)), [pages, revisionId])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState(null)
  const [newBlockType, setNewBlockType] = useState('rich_text')

  useEffect(() => {
    if (!orderedPages.length) { setSelectedId(''); setDraft(null); return }
    const selected = orderedPages.find((page) => page.id === selectedId) || orderedPages[0]
    setSelectedId(selected.id)
    setDraft(copy(selected))
  }, [orderedPages, selectedId])

  if (!draft) return null
  const blocks = Array.isArray(draft.content_blocks) ? draft.content_blocks : []
  const campaign = draft.page_kind === 'campaign'
  const changeBlock = (index, key, value) => setDraft((current) => ({ ...current, content_blocks: current.content_blocks.map((block, blockIndex) => {
    if (blockIndex !== index) return block
    const next = { ...block, [key]: value }
    if ((key === 'ctaLabel' || key === 'ctaHref' || key === 'transactionType') && !String(value).trim()) delete next[key]
    return next
  }) }))
  const moveBlock = (index, direction) => setDraft((current) => {
    const next = [...current.content_blocks]
    const target = index + direction
    if (target < 0 || target >= next.length) return current
    ;[next[index], next[target]] = [next[target], next[index]]
    return { ...current, content_blocks: next }
  })
  const removeBlock = (index) => setDraft((current) => ({ ...current, content_blocks: current.content_blocks.filter((_, blockIndex) => blockIndex !== index) }))
  const addBlock = () => setDraft((current) => ({ ...current, content_blocks: [...current.content_blocks, defaultBlock(newBlockType, current.page_kind)] }))
  const submit = (event) => {
    event.preventDefault()
    void onSave({
      pageId: draft.id,
      pageKind: draft.page_kind,
      slug: draft.slug,
      title: draft.title,
      seoTitle: draft.seo_title,
      seoDescription: draft.seo_description,
      socialImageUrl: draft.social_image_url,
      contentBlocks: blocks.map((block) => block.type === 'lead_form' ? { ...block, purpose: purposeFor(draft.page_kind) } : block),
    })
  }

  return <section className="ww-content-editor" aria-label="Website page editor">
    <div className="ww-content-heading"><div><span className="md-eyebrow">PAGE CONTENT</span><h2>Edit your website pages.</h2><p>Change structured copy and sections inside the current draft. Nothing appears publicly until the draft is published.</p></div><span>{orderedPages.length} draft page{orderedPages.length === 1 ? '' : 's'}</span></div>
    <div className="ww-content-shell">
      <aside className="ww-page-tabs" aria-label="Draft pages">{orderedPages.map((page) => <button type="button" className={page.id === draft.id ? 'active' : ''} key={page.id} onClick={() => setSelectedId(page.id)}><span>{PAGE_LABELS[page.page_kind] || 'Page'}</span><strong>{page.title}</strong><small>/{page.slug || ''}</small></button>)}</aside>
      <form className="ww-page-form" onSubmit={submit}>
        <div className="ww-page-meta"><TextField label="Page title" value={draft.title} maxLength={160} onChange={(value) => setDraft((current) => ({ ...current, title: value }))} />{campaign ? <TextField label="Campaign URL" value={draft.slug} maxLength={80} hint="Lowercase words and hyphens only." onChange={(value) => setDraft((current) => ({ ...current, slug: value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '') }))} /> : <label className="ww-content-field">Page URL<input value={`/${draft.slug || ''}`} readOnly /><small>Standard template routes are fixed.</small></label>}<TextField label="Search title" value={draft.seo_title} maxLength={180} onChange={(value) => setDraft((current) => ({ ...current, seo_title: value }))} /><TextField area label="Search description" value={draft.seo_description} maxLength={320} onChange={(value) => setDraft((current) => ({ ...current, seo_description: value }))} /><TextField label="Social image URL" value={draft.social_image_url} maxLength={2048} hint="Optional HTTPS image used when sharing this page." onChange={(value) => setDraft((current) => ({ ...current, social_image_url: value }))} /></div>
        <div className="ww-block-list">{blocks.map((block, index) => {
          const required = isRequiredBlock(draft.page_kind, blocks, index)
          return <article className={block.hidden ? 'ww-content-block hidden' : 'ww-content-block'} key={`${block.type}-${index}`}><header><div><small>SECTION {index + 1}</small><strong>{BLOCK_LABELS[block.type] || block.type}</strong></div><div className="ww-block-actions">{!campaign ? <><button type="button" className="ww-content-icon" disabled={index === 0} onClick={() => moveBlock(index, -1)} aria-label="Move section up"><ArrowUp size={15} /></button><button type="button" className="ww-content-icon" disabled={index === blocks.length - 1} onClick={() => moveBlock(index, 1)} aria-label="Move section down"><ArrowDown size={15} /></button><button type="button" className="ww-content-icon" disabled={required} onClick={() => changeBlock(index, 'hidden', !block.hidden)} aria-label={block.hidden ? 'Show section' : 'Hide section'}>{block.hidden ? <Eye size={15} /> : <EyeOff size={15} />}</button><button type="button" className="ww-content-icon danger" disabled={required} onClick={() => removeBlock(index)} aria-label="Remove section"><Trash2 size={15} /></button></> : <span>Fixed campaign layout</span>}</div></header><BlockFields block={block} pageKind={draft.page_kind} onChange={(key, value) => changeBlock(index, key, value)} /></article>
        })}</div>
        {!campaign ? <div className="ww-add-block"><select value={newBlockType} onChange={(event) => setNewBlockType(event.target.value)}>{ADDABLE_BLOCKS.map((type) => <option key={type} value={type}>{BLOCK_LABELS[type]}</option>)}</select><button type="button" disabled={blocks.length >= 12} onClick={addBlock}><Plus size={15} /> Add section</button></div> : null}
        <div className="ww-page-actions"><p><strong>Draft only.</strong> Save this page, review the full draft, then use Publish draft above.</p>{campaign ? <button className="ww-delete-page" type="button" disabled={busy} onClick={() => onDeleteCampaign(draft)}><Trash2 size={15} /> Delete campaign</button> : null}<button className="ww-publish" type="submit" disabled={busy}><Save size={15} /> {busy ? 'Saving page…' : 'Save page'}</button></div>
      </form>
    </div>
  </section>
}
