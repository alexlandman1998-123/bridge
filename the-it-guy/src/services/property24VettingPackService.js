import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

export function buildProperty24VettingPackOperatorView(pack = {}) {
  const evidence = asArray(pack.evidence).map((item) => ({
    id: normalizeText(item.id),
    label: normalizeText(item.label) || 'Property24 evidence',
    status: normalizeText(item.status).toUpperCase() || 'NEEDS_EVIDENCE',
    nextStep: normalizeText(item.nextStep),
  }))
  const blockingStatuses = new Set(['NEEDS_EVIDENCE', 'NEEDS_REVIEW'])
  const manualStatuses = new Set(['MANUAL_REQUIRED', 'READY', 'PARTIAL_PASS'])
  return {
    status: normalizeText(pack.status).toUpperCase() || 'NOT_RUN',
    generatedAt: pack.generatedAt || null,
    environment: normalizeText(pack.environment) || 'exdev',
    agencyId: normalizeText(pack.agencyId),
    listingNumber: normalizeText(pack.listingNumber),
    safety: pack.safety || {},
    summary: {
      passed: Number(pack.summary?.passCount || 0),
      manual: Number(pack.summary?.manualCount || 0),
      blockers: Number(pack.summary?.blockerCount || 0),
      total: Number(pack.summary?.evidenceCount || evidence.length),
    },
    evidence,
    blockers: evidence.filter((item) => blockingStatuses.has(item.status)),
    manualSteps: evidence.filter((item) => manualStatuses.has(item.status)),
    readyForVetting: pack.status === 'READY_FOR_VETTING' || pack.status === 'READY_WITH_MANUAL_EXDEV_STEPS',
  }
}

export async function runProperty24OrganisationVettingPack({ organisationId } = {}) {
  const normalizedOrganisationId = normalizeText(organisationId)
  if (!normalizedOrganisationId) throw new Error('Organisation ID is required before generating the Property24 vetting pack.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Sign in before generating the Property24 vetting pack.')
  const sessionResult = await supabase.auth.getSession()
  const accessToken = sessionResult.data?.session?.access_token
  if (!accessToken) throw new Error('Sign in again before generating the Property24 vetting pack.')

  const response = await fetch('/api/property24/settings/vetting-pack', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ organisationId: normalizedOrganisationId }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.message || 'Property24 vetting-pack generation failed.')
    error.code = payload.error || 'property24_vetting_pack_failed'
    error.details = payload
    throw error
  }
  return {
    pack: payload.pack,
    markdown: normalizeText(payload.markdown),
    view: buildProperty24VettingPackOperatorView(payload.pack),
  }
}

export function downloadProperty24VettingPackMarkdown(result = {}) {
  const markdown = normalizeText(result.markdown)
  if (!markdown) throw new Error('Generate the Property24 vetting pack before downloading it.')
  const blob = new Blob([`${markdown}\n`], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `property24-exdev-vetting-pack-${new Date().toISOString().slice(0, 10)}.md`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
