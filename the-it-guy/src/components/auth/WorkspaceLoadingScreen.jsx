import './workspace-loading.css'

export default function WorkspaceLoadingScreen({ slow = false, children }) {
  return (
    <section className="workspace-loading-screen" aria-busy="true">
      <div className="workspace-loading-content">
        <span className="workspace-loading-wordmark" aria-label="Arch9">arch<span>9</span><i aria-hidden="true" /></span>
        <div className="workspace-loading-track" aria-hidden="true"><span /></div>
        <div role="status" aria-live="polite">
          <h2>{slow ? 'Taking a little longer…' : 'Opening your workspace'}</h2>
          {slow && <p>Your workspace is still loading. You can try again or restart sign-in.</p>}
        </div>
        {children}
      </div>
    </section>
  )
}
