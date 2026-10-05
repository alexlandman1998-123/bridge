import { buildBondSubmissionPackPlan, bondSubmissionPackFingerprint, createBondSubmissionPack } from '../modules/bond/application/exports/bondSubmissionPack.js'
import { hashBondApplicationSnapshot } from '../modules/bond/application/submission/bondApplicationSnapshotHash.js'
import { assertBondReviewedVersionIntegrity } from '../modules/bond/application/submission/bondApplicationReviewedVersion.js'
import { readBoundedDownload } from './bondApplicationDownloadService.js'

export function createBondSubmissionPackService({ fetchContext, loadFile, renderChecklist, save, recordReview }) {
  const load = async transactionId => {
    const plan = buildBondSubmissionPackPlan(await fetchContext({ transactionId }))
    if (plan.snapshot.reviewedVersion) await assertBondReviewedVersionIntegrity(plan.snapshot)
    if (await hashBondApplicationSnapshot(plan.snapshot) !== plan.submission.snapshot_hash) throw new Error('The signed application version could not be verified.')
    return plan
  }
  return {
    load,
    async review(transactionId, { submissionId, contextHash, checks }) {
      const plan = await load(transactionId)
      if (plan.submission.id !== submissionId || plan.reviewContext?.contextHash !== contextHash) throw new Error('The application changed. Refresh before reviewing.')
      const applicationIssues = plan.assessment.issues.filter(issue => issue.code !== 'consultant_review_required' && !(plan.releaseGate?.blockers || []).some(blocker => blocker.code === issue.code) && issue.code !== 'release_not_approved')
      if (applicationIssues.length) throw new Error('Resolve the application, document and signature items before recording consultant review.')
      await recordReview({ transactionId, submissionId, contextHash, checks })
      return load(transactionId)
    },
    async download(transactionId, output) {
      const plan = await load(transactionId)
      const result = await createBondSubmissionPack({ plan, output, loadFile: doc => loadFile(transactionId, doc), renderChecklist })
      const latest = await load(transactionId)
      if (bondSubmissionPackFingerprint(latest) !== bondSubmissionPackFingerprint(plan)) throw new Error('The application, approvals or document access changed during preparation. Refresh and retry; no download was created.')
      await save(result)
      return result.filename
    },
  }
}

export async function getBondSubmissionPackService() {
  const api = await import('../lib/api.js')
  const { renderBondSubmissionChecklistPdf } = await import('../modules/bond/application/exports/bondSubmissionChecklistPdf.js')
  return createBondSubmissionPackService({
    fetchContext: async args => {
      const [context, releaseGate] = await Promise.all([api.fetchBondSubmissionPackContext(args), fetchBondSubmissionReleaseGate()])
      return { ...context, releaseGate }
    },
    recordReview: api.recordBondSubmissionConsultantReview,
    loadFile: async (transactionId, doc) => readBoundedDownload(await api.fetchBondApplicationPackDocumentUrl({ transactionId, documentId: doc.id, expectedPath: doc.file_path || doc.storage_path, expectedBucket: doc.file_bucket || doc.bucket })),
    renderChecklist: renderBondSubmissionChecklistPdf,
    save: ({ bytes, filename, type }) => {
      const url = URL.createObjectURL(new Blob([bytes], { type }))
      const link = document.createElement('a')
      link.href = url; link.download = filename; document.body.appendChild(link)
      try { link.click() } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000) }
    },
  })
}

export async function fetchBondSubmissionReleaseGate() {
  try {
    const response = await fetch('/api/public/bond-submission-release', { cache: 'no-store' })
    if (!response.ok) throw new Error('Release assessment unavailable')
    const gate = await response.json()
    if (!gate.version || !Array.isArray(gate.blockers) || !gate.methods) throw new Error('Release assessment invalid')
    return gate
  } catch {
    return { ready: false, methods: {}, blockers: [{ code: 'release_assessment_unavailable', message: 'Release approvals could not be verified. Bank submission remains blocked.' }] }
  }
}
