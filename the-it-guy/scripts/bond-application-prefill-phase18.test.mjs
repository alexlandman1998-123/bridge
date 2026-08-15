import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  BOND_APPLICATION_RELEASE_READINESS_VERSION,
  buildBondApplicationBrowserE2EContract,
  buildBondApplicationPrefillConfirmationCards,
  buildBondApplicationPrefillConfirmationMetadata,
  buildBondApplicationPrefillCoverageAudit,
  buildBondApplicationPrefillDraft,
  buildBondApplicationReleaseReadinessGate,
} from '../src/modules/bond/application/index.js'
import {
  buildBondApplicationPdfHtml,
  buildBondApplicationViewModel,
} from '../src/modules/bond/utils/bondApplicationViewModel.js'

const root = process.cwd()

function makePortal() {
  return {
    buyer: {
      name: 'Naledi Khumalo',
      email: 'naledi@example.com',
      phone: '0825550101',
    },
    onboardingFormData: {
      formData: {
        first_name: 'Naledi',
        last_name: 'Khumalo',
        email: 'naledi@example.com',
        phone: '0825550101',
        identity_number: '8901015009087',
        street_address: '18 Finance Avenue',
        suburb: 'Rosebank',
        city: 'Johannesburg',
        postal_code: '2196',
        purchase_price: '2100000',
        deposit_amount: '300000',
        bond_amount: '1800000',
        employment_status: 'permanent',
        occupation: 'Operations Lead',
        employer_name: 'Arch9 Finance',
        gross_monthly_income: '72000',
        bank_name: 'Standard Bank',
        bank_account_type: 'cheque',
        bank_account_number: '1234567890',
        currently_under_debt_review: 'no',
        bound_by_surety_agreements: 'no',
      },
    },
    transaction: {
      id: 'TX-PHASE-18',
      finance_type: 'bond',
      purchase_price: 2_100_000,
      sales_price: 2_100_000,
      bond_amount: 1_800_000,
      deposit_amount: 300_000,
      purchaser_type: 'individual',
      buyer_entity_type: 'individual',
      property_address_line_1: '18 Finance Avenue',
      suburb: 'Rosebank',
    },
    unit: {
      unit_number: 'B-204',
      price: 2_100_000,
      development: {
        name: 'Matrix Gardens',
      },
    },
  }
}

function buildApplicationFixture() {
  const portal = makePortal()
  const { application, metadata } = buildBondApplicationPrefillDraft(portal)
  const cards = buildBondApplicationPrefillConfirmationCards(application, metadata)
  const prefillMetadata = buildBondApplicationPrefillConfirmationMetadata(metadata, cards, {
    confirmedSectionKeys: ['summary', 'personal_details', 'contact_address', 'loan_details'],
    now: '2026-08-15T08:00:00.000Z',
  })
  const bondApplication = {
    ...application,
    prefill_metadata: prefillMetadata,
  }
  const viewModel = buildBondApplicationViewModel({
    transaction: portal.transaction,
    buyer: portal.buyer,
    unit: portal.unit,
    development: portal.unit.development,
    onboardingFormData: {
      formData: {
        ...portal.onboardingFormData.formData,
        bond_application: bondApplication,
      },
    },
    bondApplication,
    statusLabel: bondApplication.status,
  })

  return {
    portal,
    bondApplication,
    viewModel,
    pdfHtml: buildBondApplicationPdfHtml(viewModel, '2026-08-15T10:00:00.000Z'),
  }
}

function assertReleaseGatePasses() {
  const fixture = buildApplicationFixture()
  const gate = buildBondApplicationReleaseReadinessGate({
    prefillCoverageAudit: buildBondApplicationPrefillCoverageAudit(),
    browserE2EContract: buildBondApplicationBrowserE2EContract(),
    originatorReviewWorkspace: fixture.viewModel.originatorReviewWorkspace,
    pdfHtml: fixture.pdfHtml,
    mutatedData: false,
  })

  assert.equal(gate.version, BOND_APPLICATION_RELEASE_READINESS_VERSION)
  assert.equal(gate.version, 'phase-18-v1')
  assert.equal(gate.status, 'release_readiness_locked')
  assert.equal(gate.source, 'buyer_portal_bond_application_release_gate')
  assert.equal(gate.target, 'buyer_portal_to_bond_originator_handoff')
  assert.equal(gate.requiredFailures.length, 0)
  assert.equal(gate.metrics.requiredFailureCount, 0)
  assert.equal(gate.metrics.requiredCheckCount, 7)
  assert.equal(gate.metrics.passedRequiredCheckCount, 7)
  assert.equal(gate.metrics.warningCount, 1)
  assert.match(gate.nextAction, /authenticated staging certification/i)

  const checkByKey = new Map(gate.checks.map((check) => [check.key, check]))
  assert.equal(checkByKey.get('prefill_matrix_locked')?.status, 'pass')
  assert.equal(checkByKey.get('buyer_deep_link_locked')?.status, 'pass')
  assert.equal(checkByKey.get('buyer_prefill_confirmation_locked')?.status, 'pass')
  assert.equal(checkByKey.get('browser_smoke_harness_locked')?.status, 'pass')
  assert.equal(checkByKey.get('originator_workspace_locked')?.status, 'pass')
  assert.equal(checkByKey.get('originator_handoff_pdf_locked')?.status, 'pass')
  assert.equal(checkByKey.get('known_collection_gaps_tracked')?.status, 'warn')
  assert.equal(checkByKey.get('known_collection_gaps_tracked')?.required, false)
  assert.equal(checkByKey.get('read_only_release_gate')?.status, 'pass')
}

function assertReleaseGateBlocksRequiredFailures() {
  const gate = buildBondApplicationReleaseReadinessGate({
    prefillCoverageAudit: {
      status: 'prefill_coverage_matrix_gaps',
      metrics: {
        scenarioGapCount: 2,
        matrixFieldCount: 10,
      },
      notYetCollectedPaths: [],
    },
    browserE2EContract: {
      scenarios: [],
      runtimeChecks: [],
    },
    originatorReviewWorkspace: {},
    pdfHtml: '',
    mutatedData: true,
  })

  assert.equal(gate.status, 'release_readiness_blocked')
  assert.equal(gate.requiredFailures.length >= 6, true)
  assert.equal(gate.requiredFailures.some((check) => check.key === 'read_only_release_gate'), true)
  assert.match(gate.nextAction, /Resolve required release blockers/)
}

async function assertStaticContracts() {
  const [releaseGateSource, indexSource, packageSource, docSource] = await Promise.all([
    readFile(resolve(root, 'src/modules/bond/application/release/bondApplicationReleaseReadinessGate.js'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/index.js'), 'utf8'),
    readFile(resolve(root, 'package.json'), 'utf8'),
    readFile(resolve(root, 'docs/bond-application/phase-18-release-readiness-gate.md'), 'utf8'),
  ])

  assert.match(releaseGateSource, /BOND_APPLICATION_RELEASE_READINESS_VERSION = 'phase-18-v1'/)
  assert.match(releaseGateSource, /release_readiness_locked/)
  assert.match(releaseGateSource, /buyer_portal_to_bond_originator_handoff/)
  assert.match(releaseGateSource, /known_collection_gaps_tracked/)
  assert.match(releaseGateSource, /read_only_release_gate/)
  assert.match(indexSource, /buildBondApplicationReleaseReadinessGate/)
  assert.match(packageSource, /test:bond-application-prefill-phase18/)
  assert.match(packageSource, /verify:bond-application-prefill-release-readiness/)
  assert.match(docSource, /Release Readiness Gate/)
  assert.match(docSource, /does not mutate buyer data/)
}

assertReleaseGatePasses()
assertReleaseGateBlocksRequiredFailures()
await assertStaticContracts()

console.log('Bond application prefill Phase 18 release readiness checks passed.')
