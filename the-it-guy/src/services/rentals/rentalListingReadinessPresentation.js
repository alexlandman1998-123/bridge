import { listingPublicationIssueTarget } from '../listings/listingPublicationIssueTarget.js'
import { RENTAL_PORTAL_FIELDS } from './rentalPortalFieldCatalog.js'

const text = value => String(value ?? '').trim()
const list = value => Array.isArray(value) ? value : []
const editor = step => ({ kind: 'editor', step, label: `Open ${{ property: 'Property details', features: 'Additional property details', terms: 'Rental terms', landlord: 'Landlord & Mandate', marketing: 'Marketing' }[step] || 'listing editor'}` })
const settings = channel => ({ kind: 'settings', path: channel === 'property24' ? '/settings/syndication/property24' : '/settings/syndication/private-property', label: 'Open portal settings' })

export function describeRentalPortalRequirement(value, channel, source = 'listing') {
  const code = text(typeof value === 'object' ? value?.code || value?.key || value?.message : value)
  const suppliedMessage = typeof value === 'object' ? text(value?.message || value?.detail) : ''
  let label = suppliedMessage || code.replace(/^missing_or_invalid_/, 'Enter or correct ').replace(/^missing_/, 'Add ').replace(/[_:]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
  let detail = 'Review this portal requirement with your organisation administrator or support, then run the check again.'
  let action = null
  let category = source === 'technical' ? 'Portal setup' : 'Portal requirement'
  if (code.startsWith('invalid_rental_field:')) {
    const field = RENTAL_PORTAL_FIELDS.find(item => item.key === code.slice('invalid_rental_field:'.length))
    if (field) {
      const step = ['bedrooms','bathrooms','garages','parkingBays','unitNumber','complexName'].includes(field.formKey) ? 'property' : field.derivedFrom === 'availableFrom' || field.formKey === 'furnishedStatus' ? 'terms' : 'features'
      return { key:code, label:`Enter a valid ${field.label.toLowerCase()}`, detail:`Review ${field.label} in the relevant editor step, save, then check again.`, action:{ ...editor(step), ...listingPublicationIssueTarget(code, { rental: true }), message: `Enter a valid ${field.label.toLowerCase()}` }, category:'Listing field' }
    }
    return { key:code, label, detail, action:null, category }
  }
  if (/agent.*(id|mapping)|mapping.*agent/.test(code)) {
    label = 'Assigned agent needs a portal mapping'
    detail = `Ask your organisation administrator to connect the assigned agent to ${channel === 'property24' ? 'Property24' : 'Private Property'} in portal settings.`
    action = settings(channel); category = 'Agent mapping'
  } else if (/agency|branch_guid|credential|runtime_secret|config|go_live|production_approval|live_publish|allowlist|pilot|sandbox/.test(code)) {
    label = suppliedMessage || (/branch_guid/.test(code) ? 'Office branch is not connected to the portal' : /agency.*id/.test(code) ? 'Agency portal ID is missing' : /credential|runtime_secret/.test(code) ? 'Portal credentials need configuration' : /go_live|production.*approved|production_approval/.test(code) ? 'Production publishing approval is missing' : label)
    detail = 'Ask your organisation administrator to review the portal connection and publishing approval. Editing this property will not resolve this setup requirement.'
    action = settings(channel); category = 'Portal setup'
  } else if (/expiry/.test(code)) {
    label = 'Property24 expiry date must be in the future'
    detail = 'Choose a future date in Property24 expiry date, save it, then check again.'
    action = { kind: 'expiry', label: 'Go to expiry date' }; category = 'Listing field'
  } else if (/image|photo/.test(code)) {
    label = /three/.test(code) ? 'At least three listing photos are required' : /bytes|load|failed/.test(code) ? 'Listing photos could not be prepared for the portal' : 'Add a listing photo'
    detail = 'Review the saved photos in Marketing. Replace unreadable photos or add the required images, save, then check again.'
    action = editor('marketing'); category = 'Photos'
  } else if (/description|marketing_title/.test(code)) {
    label = /title/.test(code) ? 'Add a marketing title' : suppliedMessage || 'Complete the listing description'
    detail = 'Review the title and description in Marketing, save the changes, then check again.'
    action = editor('marketing'); category = 'Listing field'
  } else if (/rent|price|deposit|available_from|pets|furnished/.test(code) && !/property_type/.test(code)) {
    label = suppliedMessage || (/monthly_rent|price_or_poa|invalid_price/.test(code) ? 'Enter a valid monthly rent' : /deposit/.test(code) ? 'Enter a valid rental deposit' : /price_frequency/.test(code) ? 'Choose the rental payment frequency' : /pets/.test(code) ? 'Choose the pets policy' : /furnished/.test(code) ? 'Choose the furnished status' : /available_from/.test(code) ? 'Add the available-from date' : label)
    detail = 'Review this value in Rental terms, save the changes, then check again.'
    action = editor(/pets/.test(code) ? 'features' : 'terms'); category = 'Listing field'
  } else if (/street|suburb|town|province|location|address/.test(code)) {
    detail = /activated_address/.test(code) ? 'This published listing’s address is protected. Ask your organisation administrator to review the address change before resubmitting.' : 'Review the address and location in Property details. If the address is correct but the portal location cannot be matched, ask your organisation administrator to review the mapping.'
    action = /activated_address/.test(code) ? settings(channel) : editor('property'); category = 'Address & location'
  } else if (/bedroom|bathroom|garage|garden|pool|flatlet|floor|land_area|home_type|property_type|business_type|farm_type|category/.test(code)) {
    detail = 'Review the property type, dimensions and features, save the changes, then check again.'
    action = editor(/type|category|bedroom|bathroom|garage|floor|land_area/.test(code) ? 'property' : 'features'); category = 'Listing field'
  }
  const target = listingPublicationIssueTarget(code, { rental: true })
  if (!action && target) { action = editor(target.step); category = 'Listing field'; detail = 'Correct this field in the listing editor, save, then check again.' }
  if (action?.kind === 'editor') action = { ...action, ...target, message: label }
  return { key: code || label, label: label || 'Portal requirement needs review', detail, action, category }
}

export function getRentalPortalReadiness(channel, payload, { error = '', checking = false } = {}) {
  const report = channel === 'property24' ? payload?.report?.preview || payload?.preview || payload?.report || payload || {} : payload?.readiness || payload?.report || payload || {}
  const preview = channel === 'property24' ? report : report.preview || payload?.preview || {}
  const blockers = [...list(report.blockers), ...list(payload?.report?.blockers), ...list(report.checks).flatMap(check => list(check.blockers)), ...list(preview.dataBlockers), ...list(preview.technicalBlockers)]
  const images = preview.imageByteLoad?.summary || {}
  if (channel === 'property24' && Number(images.failed) > 0) blockers.push('listing_image_bytes_not_loaded_for_property24_submit')
  const uniqueIssues = values => [...new Map(values.map(value => {
    const issue = describeRentalPortalRequirement(value, channel, list(preview.technicalBlockers).includes(value) ? 'technical' : 'listing')
    return [issue.key, issue]
  })).values()]
  const issues = uniqueIssues(blockers)
  const warnings = uniqueIssues([...list(report.warnings), ...list(report.checks).flatMap(check => list(check.warnings)), ...list(preview.qualityWarnings)])
  const approved = channel === 'property24' ? preview.canSubmit === true : (payload?.ready === true && report.ready !== false) || (report.ready === true && payload?.ready !== false)
  const ready = Boolean(payload && !error && !checking && approved && !issues.length && ![payload.status,payload.report?.status,report.status,preview.status].some(status => ['BLOCKED','FAILED'].includes(text(status).toUpperCase())))
  const state = checking ? 'Checking requirements…' : error ? 'Check failed' : !payload ? 'Not checked' : ready ? 'Ready to submit' : issues.length ? 'Needs attention' : 'Readiness not confirmed'
  return { ready, state, issues, warnings, imagesLoaded: Number(images.loaded) || 0, imagesFailed: Number(images.failed) || 0,
    detail: error || (!payload ? 'Run this portal’s check against the saved listing.' : ready ? 'The saved listing passed this portal’s readiness checks. Publishing is a separate action.' : !issues.length ? 'The portal did not confirm that publishing is allowed. Run the check again; if this persists, ask your organisation administrator to review the connection.' : 'Resolve the listed requirements and run this portal’s check again.') }
}

export function buildRentalChecklistIssues(detail) {
  const row = detail.row || {}
  const fields = {
    property: [['address', 'Address', 'property'], ['monthlyRent', 'Monthly rent', 'terms'], ['availableFrom', 'Available from', 'terms']],
    landlord: [['landlordName', 'Landlord name', 'landlord'], ['landlordContact', 'Landlord phone or email', 'landlord']],
  }
  return (detail.readinessItems || []).filter(item => !item.complete).map(item => {
    const missing = (fields[item.key] || []).filter(([field]) => !text(row[field])).map(([,label,step]) => ({ label, action: editor(step) }))
    return { ...item, missing, action: item.key === 'syndication' ? { kind: 'check', channel: 'property24', label: 'Check Property24 requirements' } : editor(item.key === 'mandate' || item.key === 'marketing' ? 'landlord' : item.key),
      detail: item.key === 'syndication' ? 'Property24 has not been confirmed published. This is a publication step, not a missing listing field.' : missing.length ? `Missing: ${missing.map(field => field.label.toLowerCase()).join(', ')}.` : `Current status: ${item.detail || 'Not complete'}. Review it in Landlord & Mandate.` }
  })
}
