import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { SELLER_MANDATE_WORDING_RELEASE } from '../../src/core/documents/sellerMandateWordingRelease.js'
import { mandateAgencySchedulesDigest, mandateDigest } from '../../src/core/documents/sellerMandateSigningApproval.js'
import { createMandateReviewFixture } from './seller-mandate-review.mjs'

// Explicit synthetic approval substitution, shared by browser-core and Edge
// tests. Production imports always retain pending wording and an empty register.
export async function createSyntheticMandateSigningRuntime({ archiveRuntime } = {}) {
  const releases = structuredClone(SELLER_MANDATE_WORDING_RELEASE), approvals = [], packs = {}, archive = []
  for (const type of ['sole', 'open', 'dual']) {
    const release = releases[type], pack = createMandateReviewFixture(type)
    release.approval = { status: 'approved', wordingDigest: release.wordingDigest, businessApprover: 'Synthetic business reviewer',
      counselApprover: 'Synthetic counsel fixture', reference: 'TEST-ONLY-NOT-LEGAL-APPROVAL', approvedAt: '2026-10-04T10:00:00Z' }
    const agencySchedulesDigest = await mandateAgencySchedulesDigest(pack.mandate)
    approvals.push({ ...release.approval, agencySchedulesDigest })
    pack.frozenAt = '2026-10-04T10:00:00Z'
    pack.mandateAcceptanceReview = { authorityVerified: true, disclosureVerified: true, ffcVerified: true, reviewedBy: 'Synthetic checked-evidence actor',
      reviewedAt: pack.frozenAt, authorityReference: 'AUTH-001', disclosureReference: pack.disclosureReference, agencySchedulesDigest }
    packs[type] = pack
  }
  if (archiveRuntime) {
    for (const [variant, release] of Object.entries(archiveRuntime.releases)) {
      archive.push({ ...structuredClone(release), variant })
      releases[variant].version += '-next'
      releases[variant].markdown += '\nSynthetic next wording, pending review.\n'
      releases[variant].wordingDigest = await mandateDigest(releases[variant].markdown)
      releases[variant].approval = { ...releases[variant].approval, status: 'pending', wordingDigest: releases[variant].wordingDigest }
    }
    approvals.splice(0, approvals.length, ...structuredClone(archiveRuntime.approvals))
  }
  const replacement = `export const SELLER_MANDATE_WORDING_RELEASE=${JSON.stringify(releases)}; export const SELLER_MANDATE_WORDING_ARCHIVE=${JSON.stringify(archive)}; export const SELLER_MANDATE_AGENCY_APPROVALS=${JSON.stringify(approvals)};`
  const plugin = { name: 'explicit-synthetic-mandate-approval', setup(builder) {
    builder.onLoad({ filter: /sellerMandateWordingRelease\.js$/ }, () => ({ contents: replacement, loader: 'js' }))
  } }
  const compiled = await build({ absWorkingDir: fileURLToPath(new URL('../../', import.meta.url)), stdin: { contents: `
    export * from './src/core/documents/sellerMandateSigningApproval.js';
    export * from './src/core/documents/sellerReviewedDocumentVersions.js';
    export * from './src/core/documents/sellerOnboardingManualSigningPack.js';
    export * from './src/core/documents/sellerMandateDocumentMarkup.js';
    export * from './src/core/documents/sellerPhysicalSigningCopy.js';`, resolveDir: fileURLToPath(new URL('../../', import.meta.url)) },
    bundle: true, platform: 'node', format: 'esm', write: false, plugins: [plugin] })
  return { packs, plugin, releases, approvals, archive, api: await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`) }
}
