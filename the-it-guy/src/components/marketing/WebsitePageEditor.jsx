import { useEffect, useMemo, useState } from 'react'
import { Save } from 'lucide-react'

const CORE_PAGE_ORDER = { home: 0, about: 1, contact: 2, valuation: 3 }
const PAGE_LABELS = { home: 'Home', about: 'About', contact: 'Contact', valuation: 'Valuation' }

function copy(value) {
  return JSON.parse(JSON.stringify(value))
}

function TextField({ label, value, onChange, maxLength, area = false, hint }) {
  const Input = area ? 'textarea' : 'input'
  return <label className="ww-content-field">{label}<Input value={value || ''} maxLength={maxLength} rows={area ? 5 : undefined} onChange={(event) => onChange(event.target.value)} />{hint ? <small>{hint}</small> : null}</label>
}

function firstBlockIndex(blocks, type) {
  return blocks.findIndex((block) => block.type === type)
}

function updateBlock(blocks, index, values) {
  if (index < 0) return blocks
  return blocks.map((block, blockIndex) => blockIndex === index ? { ...block, ...values } : block)
}

export default function WebsitePageEditor({ pages, revisionId, busy, onSave }) {
  const corePages = useMemo(() => pages
    .filter((page) => page.revision_id === revisionId && Object.hasOwn(CORE_PAGE_ORDER, page.page_kind))
    .sort((left, right) => CORE_PAGE_ORDER[left.page_kind] - CORE_PAGE_ORDER[right.page_kind]), [pages, revisionId])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState(null)

  useEffect(() => {
    if (!corePages.length) { setSelectedId(''); setDraft(null); return }
    const selected = corePages.find((page) => page.id === selectedId) || corePages[0]
    setSelectedId(selected.id)
    setDraft(copy(selected))
  }, [corePages, selectedId])

  if (!draft) return null

  const blocks = Array.isArray(draft.content_blocks) ? draft.content_blocks : []
  const heroIndex = firstBlockIndex(blocks, 'hero')
  const storyIndex = firstBlockIndex(blocks, 'rich_text')
  const propertiesIndex = firstBlockIndex(blocks, 'property_collection')
  const formIndex = firstBlockIndex(blocks, 'lead_form')
  const updateDraftBlock = (index, values) => setDraft((current) => ({ ...current, content_blocks: updateBlock(current.content_blocks || [], index, values) }))
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
      contentBlocks: blocks,
    })
  }

  const hero = heroIndex >= 0 ? blocks[heroIndex] : null
  const story = storyIndex >= 0 ? blocks[storyIndex] : null
  const properties = propertiesIndex >= 0 ? blocks[propertiesIndex] : null
  const form = formIndex >= 0 ? blocks[formIndex] : null

  return <section className="ww-content-editor ww-content-editor-focused" aria-label="Core website page editor">
    <div className="ww-content-heading"><div><h2>Core page content</h2><p>Update the text visitors see most. The page structure, property search and enquiry routing stay in place.</p></div></div>
    <div className="ww-focused-page-tabs" aria-label="Core website pages">{corePages.map((page) => <button type="button" className={page.id === draft.id ? 'active' : ''} key={page.id} onClick={() => setSelectedId(page.id)}><strong>{PAGE_LABELS[page.page_kind]}</strong><span>{page.title}</span></button>)}</div>
    <form className="ww-focused-page-form" onSubmit={submit}>
      <section className="ww-focused-content-section"><header><h3>Page name</h3><p>Used in your website navigation and browser title.</p></header><TextField label="Page title" value={draft.title} maxLength={160} onChange={(value) => setDraft((current) => ({ ...current, title: value }))} /></section>
      {hero ? <section className="ww-focused-content-section"><header><h3>Main message</h3><p>This is the first text visitors see on the {PAGE_LABELS[draft.page_kind]} page.</p></header><div className="ww-focused-fields"><TextField label="Small heading" value={hero.eyebrow} maxLength={80} onChange={(value) => updateDraftBlock(heroIndex, { eyebrow: value })} /><TextField label="Main heading" value={hero.heading} maxLength={180} onChange={(value) => updateDraftBlock(heroIndex, { heading: value })} /><TextField area label="Introduction" value={hero.body} maxLength={2000} onChange={(value) => updateDraftBlock(heroIndex, { body: value })} /></div></section> : null}
      {story ? <section className="ww-focused-content-section"><header><h3>Supporting text</h3><p>Use this section to explain your service, local area or approach.</p></header><div className="ww-focused-fields"><TextField label="Section heading" value={story.heading} maxLength={180} onChange={(value) => updateDraftBlock(storyIndex, { heading: value })} /><TextField area label="Section text" value={story.body} maxLength={2000} onChange={(value) => updateDraftBlock(storyIndex, { body: value })} /></div></section> : null}
      {properties ? <section className="ww-focused-content-section"><header><h3>Property section</h3><p>Your published listings are pulled in automatically.</p></header><TextField label="Section heading" value={properties.heading} maxLength={180} onChange={(value) => updateDraftBlock(propertiesIndex, { heading: value })} /></section> : null}
      {form ? <section className="ww-focused-content-section"><header><h3>Enquiry invitation</h3><p>Messages submitted here still create the correct Arch9 lead automatically.</p></header><div className="ww-focused-fields"><TextField label="Form heading" value={form.heading} maxLength={180} onChange={(value) => updateDraftBlock(formIndex, { heading: value })} /><TextField area label="Form introduction" value={form.body} maxLength={2000} onChange={(value) => updateDraftBlock(formIndex, { body: value })} /></div></section> : null}
      <div className="ww-page-actions"><p><strong>Draft only.</strong> Your updates remain private until you publish website changes.</p><button className="ww-publish" type="submit" disabled={busy}><Save size={15} /> {busy ? 'Saving…' : 'Save page changes'}</button></div>
    </form>
  </section>
}
