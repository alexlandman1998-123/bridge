import fs from 'node:fs'

const WRITE_FLAG = 'LEGAL_DOCUMENT_COUNSEL_REVIEW_WRITE'
const REVIEW_PATH = 'config/legal-document-counsel-review.json'
const MANIFEST_PATH = 'config/legal-document-review-manifest.json'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''

const templateId = arg('template-id')
const decision = arg('decision').toLowerCase()
const reviewedBy = arg('reviewed-by')
const reviewedAt = arg('reviewed-at')
const reviewReference = arg('reference')
const notes = arg('notes') || null
const apply = process.argv.includes('--apply')
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
const review = JSON.parse(fs.readFileSync(REVIEW_PATH, 'utf8'))
const manifestEntry = (manifest.templates || []).find((row) => row.templateId === templateId)
const reviewIndex = (review.reviews || []).findIndex((row) => row.templateId === templateId)

if (!templateId) throw new Error('--template-id is required.')
if (!['approved', 'changes_requested', 'rejected'].includes(decision)) throw new Error('--decision must be approved, changes_requested, or rejected.')
if (!manifestEntry) throw new Error('Template is not in the frozen B1 manifest.')
if (!manifestEntry.sourceAvailable) throw new Error('Counsel cannot decide this template because its exact frozen source is unreadable.')
if (reviewIndex < 0) throw new Error('Template is not in the B2 review register.')
if (!reviewedBy) throw new Error('--reviewed-by is required and must identify the accountable counsel reviewer.')
if (!reviewedAt || !Number.isFinite(Date.parse(reviewedAt))) throw new Error('--reviewed-at must be a valid timestamp supplied from the actual review.')
if (Date.parse(reviewedAt) > Date.now() + 5 * 60 * 1000) throw new Error('--reviewed-at cannot be in the future.')
if (!reviewReference) throw new Error('--reference is required and must identify the legal review evidence.')
if (arg('confirm-content-digest') !== manifestEntry.contentDigest) throw new Error('--confirm-content-digest must exactly match the B1 manifest.')
if (apply && process.env[WRITE_FLAG] !== 'true') throw new Error(`${WRITE_FLAG}=true is required for writes.`)
if (apply && arg('confirm-project-ref') !== manifest.projectRef) throw new Error('--confirm-project-ref must exactly match the B1 project.')

const recordedAt = new Date().toISOString()
const current = review.reviews[reviewIndex]
const nextEntry = {
  ...current,
  packetType: manifestEntry.packetType,
  contentDigest: manifestEntry.contentDigest,
  decision,
  reviewedBy,
  reviewedAt: new Date(reviewedAt).toISOString(),
  reviewReference,
  notes,
  history: [...(current.history || []), {
    decision,
    reviewedBy,
    reviewedAt: new Date(reviewedAt).toISOString(),
    reviewReference,
    contentDigest: manifestEntry.contentDigest,
    notes,
    recordedAt,
  }],
}
const nextReviews = [...review.reviews]
nextReviews[reviewIndex] = nextEntry
const decisions = nextReviews.map((row) => row.decision)
const status = decisions.every((value) => value === 'approved')
  ? 'approved'
  : decisions.includes('rejected')
    ? 'rejected'
    : decisions.includes('changes_requested')
      ? 'changes_requested'
      : 'in_review'
const nextReview = { ...review, status, reviews: nextReviews }

if (apply) {
  const temporaryPath = `${REVIEW_PATH}.b2.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(nextReview, null, 2)}\n`, { flag: 'wx' })
  fs.renameSync(temporaryPath, REVIEW_PATH)
}

console.log(JSON.stringify({ phase: 'B2', mode: apply ? 'applied' : 'dry-run', status, templateId, packetType: manifestEntry.packetType, decision, reviewedBy, reviewedAt: nextEntry.reviewedAt, reviewReference, contentDigest: manifestEntry.contentDigest, mutatedData: apply }, null, 2))
