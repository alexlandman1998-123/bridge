function AttorneyBrandAccent({
  primaryColour = '#0f4c81',
  secondaryColour = '#1e2a44',
  height = 4,
  borderRadius = 999,
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: '100%',
        height,
        borderRadius,
        background: `linear-gradient(90deg, ${primaryColour || '#0f4c81'}, ${secondaryColour || '#1e2a44'})`,
      }}
    />
  )
}

export default AttorneyBrandAccent
