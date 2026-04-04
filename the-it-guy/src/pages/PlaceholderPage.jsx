function PlaceholderPage({ title, description }) {
  return (
    <section className="page">
      <div className="panel card-tier-standard" style={{ display: 'grid', gap: '0.45rem' }}>
        <h3 style={{ margin: 0 }}>{title || 'Placeholder'}</h3>
        <p className="status-message" style={{ margin: 0 }}>
          {description || 'This section is ready for expanded enterprise workflows.'}
        </p>
      </div>
    </section>
  )
}

export default PlaceholderPage
