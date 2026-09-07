'use client'

import { useMemo, useState } from 'react'
import styles from './sandbox.module.css'

type Tab = 'brand' | 'pages' | 'listings' | 'leads'

type SandboxState = {
  agencyName: string
  tagline: string
  primary: string
  accent: string
  heroTitle: string
  heroCopy: string
  campaignTitle: string
  publishedListings: number
}

const initialState: SandboxState = {
  agencyName: 'Kingstons Real Estate',
  tagline: 'Property, personally.',
  primary: '#193c63',
  accent: '#d9b56d',
  heroTitle: 'Find a place you will love coming home to.',
  heroCopy: 'Kingstons pairs local knowledge with a refreshingly personal property experience across the Western Cape.',
  campaignTitle: 'Considering selling?',
  publishedListings: 12,
}

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'brand', label: 'Brand & site' },
  { id: 'pages', label: 'Pages' },
  { id: 'listings', label: 'Listings' },
  { id: 'leads', label: 'Leads' },
]

export default function KingstonsSandboxPage() {
  const [tab, setTab] = useState<Tab>('brand')
  const [state, setState] = useState<SandboxState>(initialState)
  const [toast, setToast] = useState('')

  const previewStyle = useMemo(() => ({
    '--sandbox-primary': state.primary,
    '--sandbox-accent': state.accent,
  }) as React.CSSProperties, [state.primary, state.accent])

  function update<K extends keyof SandboxState>(key: K, value: SandboxState[K]) {
    setState((current) => ({ ...current, [key]: value }))
  }

  function save(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  function reset() {
    setState(initialState)
    setTab('brand')
    save('Demo reset to the Kingstons starting point.')
  }

  return (
    <main className={styles.sandbox} style={previewStyle}>
      <header className={styles.topbar}>
        <a href="/sandbox" className={styles.brand}>arch9 <span>Sandbox</span></a>
        <p>Password-free demo · Changes stay in this browser only</p>
        <button className={styles.reset} onClick={reset}>Reset demo</button>
      </header>

      <section className={styles.intro}>
        <span>Kingstons Real Estate</span>
        <h1>Build the agency site, without touching the real one.</h1>
        <p>Try the brand editor, landing-page copy and property publication controls. Nothing here reaches the CRM, database, client domain or live website.</p>
      </section>

      <div className={styles.workspace}>
        <section className={styles.editor} aria-label="Website editor">
          <div className={styles.tabs} role="tablist" aria-label="Website editor sections">
            {tabs.map((item) => (
              <button
                key={item.id}
                className={tab === item.id ? styles.tabActive : styles.tab}
                onClick={() => setTab(item.id)}
                role="tab"
                aria-selected={tab === item.id}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'brand' && <BrandEditor state={state} update={update} save={save} />}
          {tab === 'pages' && <PagesEditor state={state} update={update} save={save} />}
          {tab === 'listings' && <ListingsEditor state={state} update={update} save={save} />}
          {tab === 'leads' && <LeadsEditor save={save} />}
        </section>

        <aside className={styles.preview} aria-label="Live site preview">
          <div className={styles.previewLabel}><span /> Live preview</div>
          <div className={styles.siteFrame}>
            <header className={styles.siteHeader}>
              <strong>{state.agencyName}</strong>
              <nav><span>Buy</span><span>Sell</span><span>About</span></nav>
            </header>
            <div className={styles.siteHero}>
              <small>{state.tagline}</small>
              <h2>{state.heroTitle}</h2>
              <p>{state.heroCopy}</p>
              <button>Explore properties</button>
            </div>
            <div className={styles.siteStats}>
              <span><strong>{state.publishedListings}</strong> published homes</span>
              <span><strong>4.9/5</strong> client rating</span>
            </div>
            <div className={styles.siteCampaign}>
              <span>Landing page</span>
              <strong>{state.campaignTitle}</strong>
              <button>Request an appraisal</button>
            </div>
          </div>
        </aside>
      </div>
      {toast ? <div className={styles.toast} role="status">{toast}</div> : null}
    </main>
  )
}

function BrandEditor({ state, update, save }: { state: SandboxState; update: <K extends keyof SandboxState>(key: K, value: SandboxState[K]) => void; save: (message: string) => void }) {
  return <div className={styles.panel}>
    <p className={styles.eyebrow}>Agency identity</p><h2>Make the template feel like Kingstons.</h2>
    <label>Agency name<input value={state.agencyName} onChange={(event) => update('agencyName', event.target.value)} /></label>
    <label>Tagline<input value={state.tagline} onChange={(event) => update('tagline', event.target.value)} /></label>
    <div className={styles.colorGrid}>
      <label>Primary colour<input type="color" value={state.primary} onChange={(event) => update('primary', event.target.value)} /><code>{state.primary}</code></label>
      <label>Accent colour<input type="color" value={state.accent} onChange={(event) => update('accent', event.target.value)} /><code>{state.accent}</code></label>
    </div>
    <div className={styles.logoPlaceholder}><span>KR</span><div><strong>Logo upload</strong><p>Demo placeholder — upload is deliberately disabled in this resettable sandbox.</p></div></div>
    <button className={styles.primaryButton} onClick={() => save('Brand changes saved in this browser.')}>Save brand changes</button>
  </div>
}

function PagesEditor({ state, update, save }: { state: SandboxState; update: <K extends keyof SandboxState>(key: K, value: SandboxState[K]) => void; save: (message: string) => void }) {
  return <div className={styles.panel}>
    <p className={styles.eyebrow}>Page builder</p><h2>Edit the home page and a campaign page.</h2>
    <label>Home page headline<textarea value={state.heroTitle} onChange={(event) => update('heroTitle', event.target.value)} rows={2} /></label>
    <label>Home page introduction<textarea value={state.heroCopy} onChange={(event) => update('heroCopy', event.target.value)} rows={4} /></label>
    <div className={styles.sectionCard}><span>Campaign landing page</span><strong>Spring seller campaign</strong><label>Headline<input value={state.campaignTitle} onChange={(event) => update('campaignTitle', event.target.value)} /></label></div>
    <button className={styles.primaryButton} onClick={() => save('Page content saved in this browser.')}>Save page changes</button>
  </div>
}

function ListingsEditor({ state, update, save }: { state: SandboxState; update: <K extends keyof SandboxState>(key: K, value: SandboxState[K]) => void; save: (message: string) => void }) {
  const listings: Array<[string, string, boolean]> = [
    ['De Waterkant apartment', 'R 3 950 000', true],
    ['Constantia family home', 'R 12 750 000', true],
    ['Claremont townhouse', 'R 4 495 000', false],
  ]
  return <div className={styles.panel}>
    <p className={styles.eyebrow}>Property publishing</p><h2>Choose what appears on the website.</h2>
    <p className={styles.helper}>These are sample listings. Publishing only updates this on-screen preview.</p>
    <div className={styles.listings}>{listings.map(([name, price, live]) => <article key={name}><div><strong>{name}</strong><span>{price}</span></div><button className={live ? styles.live : styles.draft} onClick={() => save(`${name} updated in the demo preview.`)}>{live ? 'Published' : 'Draft'}</button></article>)}</div>
    <label>Published listing count<input type="number" min="0" max="99" value={state.publishedListings} onChange={(event) => update('publishedListings', Number(event.target.value) || 0)} /></label>
    <button className={styles.primaryButton} onClick={() => save('Listing settings saved in this browser.')}>Update preview</button>
  </div>
}

function LeadsEditor({ save }: { save: (message: string) => void }) {
  return <div className={styles.panel}>
    <p className={styles.eyebrow}>Lead capture</p><h2>See how website enquiries become CRM leads.</h2>
    <div className={styles.leadCard}><span>New website enquiry</span><strong>Jordan Smith</strong><p>“I would like a valuation for my home in Rondebosch.”</p><small>Seller enquiry · Website form</small></div>
    <div className={styles.flow}><span>Website form</span><b>→</b><span>Lead inbox</span><b>→</b><span>Assigned agent</span></div>
    <button className={styles.primaryButton} onClick={() => save('Sample lead marked as reviewed — no CRM record was created.')}>Mark sample lead reviewed</button>
  </div>
}
