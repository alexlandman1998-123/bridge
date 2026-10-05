import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { SELLER_MANDATE_WORDING_RELEASE, SELLER_MANDATE_AGENCY_APPROVALS } from '../src/core/documents/sellerMandateWordingRelease.js'
import { mandateCanonicalJson } from '../src/core/documents/sellerMandateSigningApproval.js'

export const SELLER_RELEASE_PROJECT = 'isdowlnollckzvltkasn'
const sha = value => createHash('sha256').update(value).digest('hex')
const fingerprint = value => `sha256:${sha(mandateCanonicalJson(value))}`
const variants = [['sole', 'exclusive'], ['open', 'open'], ['dual', 'dual']]
export const SELLER_RELEASE_MIGRATIONS = [
  'supabase/migrations/20261004121736_seller_document_review_runtime_reconciliation.sql',
  'supabase/migrations/20261004181626_seller_portal_signed_upload_version_binding.sql',
]
const rollback = 'docs/seller-document-review-runtime-rollback.sql'
// These app entry points own preparation, correction, upload, review and PDF
// export. The complete Edge import graph is added separately, never guessed.
const appFiles = [
  'src/pages/AgentListingDetail.jsx', 'src/pages/agency/AgencyPipelinePage.jsx',
  'src/pages/ClientPortal.jsx', 'src/pages/SellerDocumentSigning.jsx',
  'src/components/documents/SellerMandateDetailsEditor.jsx', 'src/components/documents/SellerDocumentReviewActions.jsx',
  'src/services/privateListingService.js', 'src/services/sellerPortalDocumentSigningService.js',
  'src/services/sellerDocumentRequirementsService.js',
  'src/services/listings/listingSellerCanonicalUpdateService.js',
  'src/core/documents/sellerOnboardingManualSigningPack.js', 'src/core/documents/sellerPhysicalSigningCopy.js',
  'src/core/documents/sellerPostOnboardingDrafts.js', 'src/core/documents/sellerOnboardingSigningPackSnapshot.js',
  'src/lib/sellerMandateCapture.js', 'src/lib/sellerMandateReviewPreview.js',
  'src/lib/sellerMandateReviewPagination.js', 'src/lib/htmlDocumentPdf.js', 'src/lib/featureFlags.js',
  'src/index.css', 'src/App.css', 'tailwind.config.js', 'postcss.config.js', 'vite.config.js', 'package.json', 'package-lock.json',
].map(name => `the-it-guy/${name}`)
const qaFiles = ['scripts/seller-document-journey.test.mjs', 'scripts/fixtures/seller-document-journey-browser.jsx',
  'scripts/fixtures/seller-mandate-signing.mjs', 'scripts/fixtures/seller-mandate-review.mjs',
  'scripts/fixtures/seller-mandate-capture.mjs', 'scripts/fixtures/seller-document-corrections.mjs',
  'scripts/seller-document-release-check.mjs', 'scripts/seller-document-release-candidate.mjs'].map(name => `the-it-guy/${name}`)

async function artifact(root, name) {
  assert.ok(!path.isAbsolute(name) && !name.split('/').includes('..'), 'Artifact must be inside the repository')
  const bytes = await readFile(path.join(root, name))
  return { name, sha256: sha(bytes), bytes: bytes.length }
}

export async function collectSellerReleaseSource(root, bundle) {
  const names = [...new Set([...bundle.files.map(file => file.name), ...appFiles, ...qaFiles,
    ...SELLER_RELEASE_MIGRATIONS, rollback,
    ...variants.map(([, label]) => `the-it-guy/docs/mandate-wording-review/${label}-mandate-draft.md`)])].sort()
  const files = await Promise.all(names.map(name => artifact(root, name)))
  return { fingerprint: fingerprint(files), files }
}

export async function buildSellerReleaseCandidate(root, bundle) {
  const source = await collectSellerReleaseSource(root, bundle)
  const wording = []
  for (const [variant, label] of variants) {
    const release = SELLER_MANDATE_WORDING_RELEASE[variant]
    const name = `the-it-guy/docs/mandate-wording-review/${label}-mandate-draft.md`
    const markdown = await readFile(path.join(root, name), 'utf8')
    assert.equal(markdown, release.markdown, `${label}: runtime wording differs from reviewed source`)
    assert.equal(`sha256:${sha(markdown)}`, release.wordingDigest, `${label}: wording digest differs`)
    wording.push({ variant, label, version: release.version, name, wordingDigest: release.wordingDigest,
      approval: structuredClone(release.approval) })
  }
  const proofs = []
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const proofNames = variants.map(([, label]) => `output/pdf/${label}-mandate-review.pdf`)
  for (const branch of ['individual', 'company', 'multiple_owners', 'trust']) {
    for (const key of ['signed_mandate', 'signed_disclosure_form', 'signed_fica_declaration']) {
      const suffix = branch === 'trust' && key !== 'signed_fica_declaration' ? 'physical' : 'final'
      proofNames.push(`the-it-guy/test-results/seller-document-journey/connected-${branch}-${key}-${suffix}.pdf`)
    }
  }
  for (const name of proofNames) {
    const data = await readFile(path.join(root, name))
    const task = getDocument({ data: new Uint8Array(data), useSystemFonts: true })
    try {
      const document = await task.promise
      proofs.push({ ...await artifact(root, name), pages: document.numPages, synthetic: true })
    } finally { await task.destroy() }
  }
  const qaName = 'the-it-guy/test-results/seller-document-journey/report.json'
  const qa = JSON.parse(await readFile(path.join(root, qaName), 'utf8'))
  const candidate = {
    contract: 'arch9-seller-document-release-candidate-v1', product: 'Arch9 primary transaction workspace',
    projectRef: SELLER_RELEASE_PROJECT, generatedAt: new Date().toISOString(), source,
    wording, proofs, migrations: await Promise.all(SELLER_RELEASE_MIGRATIONS.map(name => artifact(root, name))),
    rollback: await artifact(root, rollback),
    localAcceptance: { ...await artifact(root, qaName), result: qa.result, localOnly: qa.localOnly,
      sourceMatches: qa.sourceFingerprint === source.fingerprint, journeys: qa.journeys?.length || 0,
      downloads: qa.downloads, pages: qa.downloadedPages, browserSignatures: qa.browserSignatures,
      browserPhysicalReviews: qa.browserPhysicalReviews, localRollbackVerified: qa.localRollbackVerified === true },
  }
  candidate.candidateDigest = sellerCandidateDigest(candidate)
  return candidate
}

export function sellerCandidateDigest(candidate) {
  const { candidateDigest: _digest, generatedAt: _time, ...content } = candidate
  return fingerprint(content)
}

export function verifySellerReleaseCandidate(saved, current) {
  assert.equal(saved?.contract, 'arch9-seller-document-release-candidate-v1', 'Wrong candidate contract')
  assert.equal(saved.candidateDigest, sellerCandidateDigest(saved), 'Candidate evidence changed')
  assert.equal(saved.candidateDigest, current.candidateDigest, 'Candidate is stale: refresh source, PDF or QA evidence')
  return true
}

export const SELLER_RELEASE_CHECKS = [
  'build', 'migrationReplay', 'targetIdentity', 'recovery', 'scopedDryRun',
  'schemaCatalog', 'securityReview', 'rollbackRehearsal', 'hostedAcceptance', 'emailDelivery',
]

export function createSellerReleaseDecision(candidate) {
  return {
    contract: 'arch9-seller-document-release-decision-v1', candidateDigest: candidate.candidateDigest,
    status: 'pending', decidedAt: '', releaseOwner: '', reference: '',
    projectRef: candidate.projectRef, scope: 'Exclusive, Open, Dual, disclosure and FICA',
    wording: candidate.wording.map(({ variant, wordingDigest, approval }) => ({ variant, wordingDigest, ...approval })),
    agencySchedules: [],
    design: { status: 'pending', reviewer: '', reference: '', reviewedAt: '', candidateDigest: candidate.candidateDigest },
    checks: Object.fromEntries(SELLER_RELEASE_CHECKS.map(key => [key, { status: 'pending', reference: '', checkedAt: '',
      sourceFingerprint: candidate.source.fingerprint }])),
    notes: 'Only record performed checks. Agency entries must match the server-owned exact schedule approvals. Synthetic PDFs support design review; they are not executed agreements. This decision never authorizes or performs deployment.',
  }
}

export function assessSellerReleaseReadiness(candidate, decision, deployed = {}, agencyRegister = SELLER_MANDATE_AGENCY_APPROVALS) {
  const blockers = []
  const add = (condition, message) => { if (!condition) blockers.push(message) }
  const present = value => typeof value === 'string' && value.trim().length > 0
  const dated = value => present(value) && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now()
  add(candidate.localAcceptance.result === 'passed' && candidate.localAcceptance.sourceMatches === true &&
    candidate.localAcceptance.localOnly === true && candidate.localAcceptance.journeys >= 15 &&
    candidate.localAcceptance.browserSignatures >= 9 && candidate.localAcceptance.browserPhysicalReviews >= 2 &&
    candidate.localAcceptance.localRollbackVerified === true,
  'Complete local acceptance must match this exact source.')
  for (const item of candidate.wording) add(item.approval.status === 'approved' &&
    item.approval.wordingDigest === item.wordingDigest && present(item.approval.businessApprover) &&
    present(item.approval.counselApprover) && present(item.approval.reference) && dated(item.approval.approvedAt),
  `${item.label}: exact business/legal wording approval is missing.`)
  if (!decision) blockers.push('A completed sign-off and release decision is required.')
  else {
    add(decision.contract === 'arch9-seller-document-release-decision-v1' && decision.candidateDigest === candidate.candidateDigest,
      'The release decision must identify this exact candidate.')
    add(decision.projectRef === candidate.projectRef, 'Release evidence targets a different project.')
    add(decision.status === 'approved' && dated(decision.decidedAt) && present(decision.releaseOwner) && present(decision.reference),
      'Release owner approval is missing.')
    add(decision.design?.status === 'approved' && decision.design.candidateDigest === candidate.candidateDigest &&
      present(decision.design.reviewer) && present(decision.design.reference) && dated(decision.design.reviewedAt),
    'Human design sign-off must identify these exact PDF proofs.')
    for (const item of candidate.wording) {
      const approval = decision.wording?.find(entry => entry.variant === item.variant)
      add(approval && mandateCanonicalJson(approval) === mandateCanonicalJson({ variant: item.variant,
        wordingDigest: item.wordingDigest, ...item.approval }), `${item.label}: decision wording approval differs.`)
      const schedules = decision.agencySchedules?.filter(entry => entry.wordingDigest === item.wordingDigest) || []
      add(schedules.length > 0 && schedules.every(entry => /^sha256:[a-f0-9]{64}$/.test(entry.agencySchedulesDigest || '') &&
        agencyRegister.some(record => record.status === 'approved' && present(record.businessApprover) && present(record.counselApprover) &&
          present(record.reference) && dated(record.approvedAt) && mandateCanonicalJson(record) === mandateCanonicalJson(entry))),
      `${item.label}: exact contracting-agency schedule approval is missing.`)
    }
    for (const key of SELLER_RELEASE_CHECKS) {
      const check = decision.checks?.[key]
      add(check?.status === 'passed' && present(check.reference) && dated(check.checkedAt) &&
        check.sourceFingerprint === candidate.source.fingerprint, `${key}: performed, current-source evidence is required.`)
    }
  }
  for (const key of ['signingVerified', 'retirementVerified', 'frontendVerified']) add(deployed[key] === true,
    `${key}: retrieved deployment evidence has not passed.`)
  return { status: blockers.length ? 'blocked' : 'ready_for_release_review', blockers,
    deploymentPerformedByCheck: false, liveMutationPerformedByCheck: false }
}
