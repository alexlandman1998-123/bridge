import './arch9-access.css'

function Wordmark() {
  return <span className="arch9-access-wordmark" aria-label="Arch9">arch<span>9</span><i aria-hidden="true" /></span>
}

export default function Arch9AccessLayout({ children, mode = 'login', audience = 'Professional workspace' }) {
  return (
    <div className={`arch9-access auth-page auth-page-${mode}`} data-arch9-access>
      <aside className="arch9-access-story" aria-label="Arch9 platform">
        <Wordmark />
        <div className="arch9-access-story-copy">
          <p className="arch9-access-kicker">THE PROPERTY OPERATING SYSTEM</p>
          <h1>Every move.<br /><span>Connected.</span></h1>
          <p>One workspace for the people, property and progress behind every transaction.</p>
        </div>
        <div className="arch9-access-art" aria-hidden="true"><span /><span /><span /><i /></div>
        <div className="arch9-access-story-footer"><span>People. Property. Progress.</span><span>Built for what comes next. ↗</span></div>
      </aside>
      <main className="arch9-access-main">
        <header className="arch9-access-topbar">
          <Wordmark />
          {audience && <span className="arch9-access-audience"><i aria-hidden="true" />{audience}</span>}
        </header>
        <div className="arch9-access-content">{children}</div>
        <footer className="arch9-access-footer">
          <span>Property, connected.</span>
          <span>© {new Date().getFullYear()} Arch9</span>
        </footer>
      </main>
    </div>
  )
}
