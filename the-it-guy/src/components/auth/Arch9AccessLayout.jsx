import './arch9-access.css'

function Wordmark({ homeSeekers = false }) {
  if (homeSeekers) return <a className="arch9-access-wordmark home-seekers-access-brand" href="https://homeseeker.co.za" aria-label="Home Seekers home"><img src="/brand/homeseekers/home-seekers-horizontal-black.svg" alt="Home Seekers" /></a>
  return <span className="arch9-access-wordmark" aria-label="Arch9">arch<span>9</span><i aria-hidden="true" /></span>
}

export default function Arch9AccessLayout({ children, mode = 'login', audience = 'Professional workspace', homeSeekers = false }) {
  return (
    <div className={`arch9-access auth-page auth-page-${mode}${homeSeekers ? ' home-seekers-access' : ''}`} data-arch9-access>
      <aside className="arch9-access-story" aria-label={homeSeekers ? 'Home Seekers' : 'Arch9 platform'}>
        <Wordmark homeSeekers={homeSeekers} />
        <div className="arch9-access-story-copy">
          <p className="arch9-access-kicker">{homeSeekers ? 'YOUR NEXT CHAPTER' : 'THE PROPERTY OPERATING SYSTEM'}</p>
          <h1>{homeSeekers ? <>Move forward.<br /><span>Faster.</span></> : <>Every move.<br /><span>Connected.</span></>}</h1>
          <p>{homeSeekers ? 'Your application, your business and your next move. One place to begin.' : 'One workspace for the people, property and progress behind every transaction.'}</p>
        </div>
        {!homeSeekers && <div className="arch9-access-art" aria-hidden="true"><span /><span /><span /><i /></div>}
        <div className="arch9-access-story-footer"><span>{homeSeekers ? 'Your business. Our backing.' : 'People. Property. Progress.'}</span><span>Built for what comes next. ↗</span></div>
      </aside>
      <main className="arch9-access-main">
        <header className="arch9-access-topbar">
          <Wordmark homeSeekers={homeSeekers} />
          {audience && <span className="arch9-access-audience"><i aria-hidden="true" />{audience}</span>}
        </header>
        <div className="arch9-access-content">{children}</div>
        <footer className="arch9-access-footer">
          <span>{homeSeekers ? 'Move forward, faster.' : 'Property, connected.'}</span>
          <span>© {new Date().getFullYear()} {homeSeekers ? 'Home Seekers' : 'Arch9'}</span>
        </footer>
      </main>
    </div>
  )
}
