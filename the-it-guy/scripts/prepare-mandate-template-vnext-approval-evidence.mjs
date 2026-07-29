import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import {
  PHASE4_B3_RELEASE_CONTRACT,
} from '../src/core/documents/legalTemplateApproval.js'
import {
  buildMandateTemplateVNextApprovalDigestPayload,
  stringifyMandateTemplateApprovalDigestPayload,
} from '../src/core/documents/mandateTemplateApprovalReleaseGate.js'
import {
  listMandateTemplateWordingVNextSections,
} from '../src/core/documents/mandateTemplateWordingVNext.js'

function arg(name, fallback = '') {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3).trim() || fallback
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

async function optionalFileDigest(path) {
  if (!path) return ''
  try {
    return digest(await readFile(path))
  } catch {
    return ''
  }
}

const sections = listMandateTemplateWordingVNextSections()
const digestPayload = buildMandateTemplateVNextApprovalDigestPayload({ sections })
const contentDigest = digest(stringifyMandateTemplateApprovalDigestPayload(digestPayload))
const approvedAt = arg('approved-at', new Date().toISOString())
const approvedBy = arg('approved-by', 'thread:user-confirmed-counsel-approval')
const reference = arg('reference', `COUNSEL-MANDATE-VNEXT-${approvedAt.slice(0, 10).replaceAll('-', '')}`)
const b3AppliedAt = arg('b3-applied-at', approvedAt)
const b3AppliedBy = arg('b3-applied-by', 'service_role:mandate-vnext-release')
const b3ApplicationReference = arg('b3-reference', `B3-MANDATE-VNEXT-${approvedAt.slice(0, 10).replaceAll('-', '')}`)
const renderedPdfPath = arg('rendered-pdf', 'output/pdf/mandate-vnext-sample-review.pdf')
const renderedPdfDigest = await optionalFileDigest(renderedPdfPath)
const b1Payload = {
  phase: 'mandate-template-vnext-b1-local-review-manifest',
  contentDigest,
  wordingVersion: digestPayload.wording_version,
  dataSourceMapVersion: digestPayload.data_source_map_version,
  pdfLayoutVersion: digestPayload.pdf_layout_version,
  sectionCount: sections.length,
  renderedPdfDigest: renderedPdfDigest || null,
}
const reviewPayload = {
  status: 'approved',
  approvedAt,
  approvedBy,
  reference,
  contentDigest,
  renderedPdfPath,
  renderedPdfDigest: renderedPdfDigest || null,
  source: 'Codex thread confirmation',
}

const evidence = {
  status: 'approved',
  approvedAt,
  approvedBy,
  reference,
  contentDigest,
  reviewEvidenceDigest: digest(JSON.stringify(reviewPayload)),
  b1ManifestDigest: digest(JSON.stringify(b1Payload)),
  b3AppliedAt,
  b3AppliedBy,
  b3ApplicationReference,
  phase4B3ReleaseContract: PHASE4_B3_RELEASE_CONTRACT,
  evidence: {
    reviewPayload,
    b1Payload,
  },
}

const outputPath = arg('out', 'config/mandate-template-vnext-approval-evidence.json')
await mkdir(new URL('../config/', import.meta.url), { recursive: true })
await writeFile(new URL(`../${outputPath}`, import.meta.url), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')

console.log(JSON.stringify({
  status: 'written',
  outputPath,
  contentDigest,
  reviewEvidenceDigest: evidence.reviewEvidenceDigest,
  b1ManifestDigest: evidence.b1ManifestDigest,
}, null, 2))
