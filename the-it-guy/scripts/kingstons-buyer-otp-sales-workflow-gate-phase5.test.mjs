import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { buildKingstonsBuyerOtpReadiness } from '../src/core/transactions/kingstonsBuyerOtpReadiness.js'

const repoRoot = process.cwd()
const salesWorkflowSource = fs.readFileSync(path.join(repoRoot, 'src/core/transactions/salesWorkflow.js'), 'utf8')
const unitDetailSource = fs.readFileSync(path.join(repoRoot, 'src/pages/UnitDetail.jsx'), 'utf8')
const readinessSource = fs.readFileSync(path.join(repoRoot, 'src/core/transactions/kingstonsBuyerOtpReadiness.js'), 'utf8')
const salesWorkflowTestSource = fs.readFileSync(path.join(repoRoot, 'src/core/transactions/__tests__/salesWorkflowPhase0.test.js'), 'utf8')

function assertIncludes(source, snippet, message) {
  assert.ok(source.includes(snippet), message)
}

const readiness = buildKingstonsBuyerOtpReadiness({
  documents: [{
    id: 'transaction-doc-signed-otp',
    document_type: 'signed_otp',
    name: 'Signed OTP - Buyer.pdf',
    storage_path: 'transactions/tx-1/signed-otp.pdf',
    status: 'uploaded',
  }],
})

assert.equal(readiness.gate.salesWorkflowReady, true, 'Kingston buyer OTP readiness must expose a sales workflow gate.')

assertIncludes(
  readinessSource,
  'salesWorkflowReady: gateStatus === \'pass\'',
  'Kingston buyer OTP readiness must explicitly mark when sales workflow may proceed.',
)
assertIncludes(
  salesWorkflowSource,
  'allowKingstonsManualSignedOtp = false',
  'Sales workflow must default the Kingston manual signed OTP override off.',
)
assertIncludes(
  salesWorkflowSource,
  'allowKingstonsManualSignedOtp === true',
  'Sales workflow must require an explicit opt-in before accepting Kingston manual signed OTP evidence.',
)
assertIncludes(
  salesWorkflowSource,
  'kingstonsBuyerOtpReadiness?.gate?.salesWorkflowReady === true',
  'Sales workflow must require the Kingston OTP readiness gate to pass.',
)
assertIncludes(
  salesWorkflowSource,
  'const latestSignedOtpDocument = latestCanonicalSignedOtpDocument || latestKingstonsManualSignedOtpDocument',
  'Canonical final OTP must remain preferred over the Kingston manual upload fallback.',
)
assertIncludes(
  salesWorkflowSource,
  "signedOtpSource = latestCanonicalSignedOtpDocument",
  'Sales workflow must expose which signed OTP source satisfied the gate.',
)
assertIncludes(
  salesWorkflowSource,
  'signedOtpReceived\n      ? \'\'',
  'A satisfied signed OTP gate must clear the OTP prep stage blocker.',
)
assertIncludes(
  salesWorkflowSource,
  'if (!readyForFinance) {',
  'Sales workflow next-action selection must not ask for old OTP prep steps after the gate is ready for finance.',
)
assertIncludes(
  unitDetailSource,
  'resolveSellerProcessProfileForOrganisation',
  'Transaction workspace must resolve Kingston scope from organisation/profile context.',
)
assertIncludes(
  unitDetailSource,
  'const kingstonsBuyerOtpSalesWorkflowEnabled = Boolean(',
  'Transaction workspace must use a scoped Kingston buyer OTP sales workflow flag.',
)
assertIncludes(
  unitDetailSource,
  'buildKingstonsBuyerOtpReadiness({',
  'Transaction workspace must build Kingston buyer OTP readiness from transaction documents.',
)
assertIncludes(
  unitDetailSource,
  'allowKingstonsManualSignedOtp: kingstonsBuyerOtpSalesWorkflowEnabled',
  'Transaction workspace must pass the Kingston manual signed OTP opt-in to the sales workflow.',
)
assertIncludes(
  unitDetailSource,
  'kingstonsBuyerOtpReadiness: kingstonsBuyerOtpSalesWorkflowReadiness',
  'Transaction workspace must pass the actual Kingston OTP readiness into the sales workflow.',
)
assertIncludes(
  unitDetailSource,
  'Signed / Uploaded',
  'Transaction workspace must label Kingston manual signed OTP completion distinctly.',
)
assertIncludes(
  salesWorkflowTestSource,
  'allows Kingston manual signed OTP evidence only when the Kingston gate is explicitly enabled',
  'Behavioral tests must prove Kingston manual OTP is opt-in and generic transactions stay contained.',
)

console.log('Kingstons buyer OTP sales workflow gate phase 5 guard passed.')
