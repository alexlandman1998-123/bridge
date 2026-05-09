function toneForReadiness(value = 'ready') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'blocked') return { border: '#f2d0ce', bg: '#fff5f4', text: '#9f3028' }
  if (normalized === 'waiting on documents') return { border: '#f3dfb7', bg: '#fff8ec', text: '#8a5b1f' }
  if (normalized === 'waiting on client') return { border: '#f3dfb7', bg: '#fff8ec', text: '#8a5b1f' }
  if (normalized === 'waiting on attorney') return { border: '#d9e6f5', bg: '#eff6ff', text: '#305f8c' }
  return { border: '#cfe8d8', bg: '#eefaf2', text: '#1f7a44' }
}

function AppointmentReadinessCard({ readiness = null }) {
  if (!readiness) return null

  const tone = toneForReadiness(readiness.label)
  const blockers = Array.isArray(readiness.blockers) ? readiness.blockers : []

  return (
    <div
      style={{
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.text,
        borderRadius: '12px',
        padding: '0.55rem 0.7rem',
        display: 'grid',
        gap: '0.35rem',
      }}
    >
      <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {readiness.label || 'Ready'}
      </p>
      {blockers.length ? (
        <p style={{ margin: 0, fontSize: '0.76rem', lineHeight: 1.45 }}>
          {blockers.join(' · ')}
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: '0.76rem', lineHeight: 1.45 }}>All pre-signing checks are satisfied.</p>
      )}
    </div>
  )
}

export default AppointmentReadinessCard
