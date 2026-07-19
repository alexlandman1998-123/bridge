const projectRef = String(process.env.MVP_STAGING_PROJECT_REF || '').trim()
const targetEnv = String(process.env.MVP_TARGET_ENV || process.env.VITE_APP_ENV || '').trim().toLowerCase()
const backendUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
const frontendUrl = String(process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const backendAnonKeyPresent = Boolean(String(process.env.SUPABASE_ANON_KEY || '').trim())
const frontendAnonKeyPresent = Boolean(String(process.env.VITE_SUPABASE_ANON_KEY || '').trim())

const blockers = []
if (targetEnv !== 'staging') blockers.push('target_environment_must_be_staging')
if (!/^[a-z0-9]{20}$/i.test(projectRef)) blockers.push('staging_project_ref_invalid_or_missing')
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(backendUrl)) blockers.push('backend_supabase_url_invalid_or_missing')
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(frontendUrl)) blockers.push('frontend_supabase_url_invalid_or_missing')
if (backendUrl && frontendUrl && backendUrl !== frontendUrl) blockers.push('frontend_backend_supabase_url_mismatch')
if (projectRef && backendUrl && !backendUrl.includes(`://${projectRef}.supabase.co`)) blockers.push('backend_url_does_not_match_project_ref')
if (!backendAnonKeyPresent) blockers.push('backend_anon_key_missing')
if (!frontendAnonKeyPresent) blockers.push('frontend_anon_key_missing')

const report = {
  version: 'arch9_mvp_staging_environment_check_v1',
  decision: blockers.length ? 'no_go' : 'staging_environment_confirmed',
  targetEnvironment: targetEnv || null,
  projectRef: projectRef || null,
  backendUrlConfigured: Boolean(backendUrl),
  frontendUrlConfigured: Boolean(frontendUrl),
  backendAnonKeyConfigured: backendAnonKeyPresent,
  frontendAnonKeyConfigured: frontendAnonKeyPresent,
  blockers,
  safety: 'No key values are emitted and no network request is made.',
}

console.log(JSON.stringify(report, null, 2))
if (report.decision !== 'staging_environment_confirmed') process.exit(1)
