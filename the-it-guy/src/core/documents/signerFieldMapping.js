function text(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function email(value) {
  return text(value).toLowerCase()
}

export function assessSignerFieldMapping({ fields = [], signers = [] } = {}) {
  const layoutFields = Array.isArray(fields) ? fields : []
  const signerRows = Array.isArray(signers) ? signers : []
  const reasons = []
  const mappedRoles = [...new Set(layoutFields.map((field) => text(field?.signerRole || field?.signer_role).toLowerCase()).filter(Boolean))]
  const signerByRole = new Map()

  signerRows.forEach((signer) => {
    const role = text(signer?.signerRole || signer?.signer_role).toLowerCase()
    if (!role) return
    if (signerByRole.has(role)) reasons.push(`E3_DUPLICATE_SIGNER_ROLE:${role}`)
    signerByRole.set(role, signer)
  })

  mappedRoles.forEach((role) => {
    const signer = signerByRole.get(role)
    const signerEmail = email(signer?.signerEmail || signer?.signer_email)
    if (!signer) reasons.push(`E3_SIGNER_MISSING:${role}`)
    else if (!text(signer?.signerName || signer?.signer_name) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail) || signerEmail.endsWith('@bridge.local')) {
      reasons.push(`E3_SIGNER_IDENTITY_INVALID:${role}`)
    }
    if (!layoutFields.some((field) => text(field?.signerRole || field?.signer_role).toLowerCase() === role && text(field?.fieldType || field?.field_type).toLowerCase() === 'signature' && field?.required !== false)) {
      reasons.push(`E3_REQUIRED_SIGNATURE_MISSING:${role}`)
    }
  })

  return { ready: reasons.length === 0, reasons: [...new Set(reasons)], mappedRoles, fieldCount: layoutFields.length, signerCount: mappedRoles.length }
}
