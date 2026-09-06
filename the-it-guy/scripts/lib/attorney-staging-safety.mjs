export const ATTORNEY_PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
export const ATTORNEY_STAGING_RECOVERY_CONFIRMATION = 'I_HAVE_A_RECOVERABLE_STAGING_BACKUP'

const text = (value) => String(value || '').trim()

export function projectRefFromSupabaseUrl(value) {
  try {
    const url = new URL(text(value))
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) return ''
    return url.hostname.split('.')[0] || ''
  } catch {
    return ''
  }
}

export function inspectAttorneyStagingTarget({
  supabaseUrl,
  expectedProjectRef,
  productionProjectRef = ATTORNEY_PRODUCTION_PROJECT_REF,
  environment = 'staging',
  recoveryConfirmation = '',
  requireRecovery = false,
} = {}) {
  const projectRef = projectRefFromSupabaseUrl(supabaseUrl)
  const expected = text(expectedProjectRef)
  const production = text(productionProjectRef) || ATTORNEY_PRODUCTION_PROJECT_REF
  const blockers = []
  if (!projectRef) blockers.push({ code: 'STAGING_URL_INVALID', remedy: 'Use an HTTPS *.supabase.co staging URL.' })
  if (!expected) blockers.push({ code: 'STAGING_PROJECT_REF_MISSING', remedy: 'Configure SUPABASE_STAGING_PROJECT_REF.' })
  if (projectRef && expected && projectRef !== expected) blockers.push({ code: 'STAGING_PROJECT_REF_MISMATCH', remedy: 'Make the Supabase URL and declared staging project reference match.' })
  if (projectRef && projectRef === production) blockers.push({ code: 'PRODUCTION_TARGET_DENIED', remedy: 'Never run attorney staging operations against the production project.' })
  if (text(environment).toLowerCase() !== 'staging') blockers.push({ code: 'STAGING_ENVIRONMENT_REQUIRED', remedy: 'Set the attorney operation environment explicitly to staging.' })
  if (requireRecovery && text(recoveryConfirmation) !== ATTORNEY_STAGING_RECOVERY_CONFIRMATION) {
    blockers.push({ code: 'STAGING_RECOVERY_NOT_CONFIRMED', remedy: 'Confirm a recoverable staging backup before any write.' })
  }
  return { safe: blockers.length === 0, projectRef, expectedProjectRef: expected, productionProjectRef: production, requireRecovery, blockers }
}

export function assertAttorneyStagingTarget(options = {}) {
  const result = inspectAttorneyStagingTarget(options)
  if (!result.safe) {
    const error = new Error(result.blockers.map(({ code }) => code).join(', '))
    error.code = 'ATTORNEY_STAGING_SAFETY_CHECK_FAILED'
    error.safety = result
    throw error
  }
  return result
}
