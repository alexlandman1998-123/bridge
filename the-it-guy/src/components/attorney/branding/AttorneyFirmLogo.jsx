function getInitials(name = '') {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
  if (!parts.length) return 'AF'
  return parts.map((part) => part.charAt(0).toUpperCase()).join('')
}

function AttorneyFirmLogo({
  firmName = 'Attorney Firm',
  logoUrl = '',
  primaryColour = '#0f4c81',
  secondaryColour = '#1e2a44',
  size = 44,
  borderRadius = 12,
  className = '',
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${firmName} logo`}
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius,
          objectFit: 'cover',
          background: '#fff',
          border: '1px solid #dbe5ef',
        }}
      />
    )
  }

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius,
        display: 'grid',
        placeItems: 'center',
        color: '#fff',
        fontWeight: 700,
        letterSpacing: '0.02em',
        background: `linear-gradient(135deg, ${primaryColour || '#0f4c81'}, ${secondaryColour || '#1e2a44'})`,
        border: '1px solid rgba(15, 76, 129, 0.25)',
      }}
    >
      {getInitials(firmName)}
    </div>
  )
}

export default AttorneyFirmLogo
