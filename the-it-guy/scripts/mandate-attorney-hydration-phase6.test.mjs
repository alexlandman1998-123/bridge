import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  buildSavedMandateTransferAttorneyOption,
  resolveMandateTransferAttorneySnapshot,
} from '../src/core/documents/mandateTransferAttorneyDefaults.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const onboardingFormData = {
  transferAttorneyChoice: 'preferred',
  preferredTransferAttorneyAccepted: true,
  preferredTransferAttorney: {
    preferredPartnerId: '10c216af-129f-4cae-9a56-131a7eca9ce9',
    preferred_partner_id: '10c216af-129f-4cae-9a56-131a7eca9ce9',
    partnerOrganisationId: 'c44ec08e-dc04-4f7b-9bdd-db5252f62f25',
    partner_organisation_id: 'c44ec08e-dc04-4f7b-9bdd-db5252f62f25',
    partnerRelationshipId: '10c216af-129f-4cae-9a56-131a7eca9ce9',
    companyName: 'Young Law Inc',
    company_name: 'Young Law Inc',
    contactPerson: 'Young Law Inc',
    email: '',
    phone: '',
    selectionSource: 'connected_partner',
  },
}

const attorney = resolveMandateTransferAttorneySnapshot(onboardingFormData)
assert.equal(attorney.preferredPartnerId, '10c216af-129f-4cae-9a56-131a7eca9ce9')
assert.equal(attorney.partnerOrganisationId, 'c44ec08e-dc04-4f7b-9bdd-db5252f62f25')
assert.equal(attorney.companyName, 'Young Law Inc')
assert.equal(attorney.contactPerson, 'Young Law Inc')
assert.equal(attorney.selectionSource, 'connected_partner')
assert.equal(attorney.selectionDeferred, false)

const savedOption = buildSavedMandateTransferAttorneyOption({
  transferAttorneyPreferredPartnerId: attorney.preferredPartnerId,
  transferAttorneyPartnerOrganisationId: attorney.partnerOrganisationId,
  transferAttorneyCompanyName: attorney.companyName,
  transferAttorneyContactPerson: attorney.contactPerson,
  transferAttorneySelectionSource: attorney.selectionSource,
})
assert.equal(savedOption.id, attorney.preferredPartnerId)
assert.equal(savedOption.companyName, 'Young Law Inc')
assert.equal(savedOption.partnerType, 'transfer_attorney')
assert.equal(savedOption.source, 'connected_partner')

const pageSource = await readFile(resolve(root, 'src/pages/LegalDocumentWorkspacePage.jsx'), 'utf8')
const workspaceSource = await readFile(resolve(root, 'src/components/documents/LegalDocumentWorkspace.jsx'), 'utf8')
assert.match(pageSource, /resolveMandateTransferAttorneySnapshot\(/, 'Mandate workspace must normalize attorney snapshots from saved onboarding data.')
assert.match(pageSource, /buildSavedMandateTransferAttorneyOption\(mandateDraftDefaults\)/, 'Mandate workspace must add the saved attorney snapshot to the selector options.')
assert.match(pageSource, /leadSellerOnboarding\.form_data/, 'Mandate defaults must tolerate snake-case onboarding form_data.')
assert.match(pageSource, /privateListingOnboarding\.form_data/, 'Mandate defaults must tolerate private listing onboarding form_data.')
assert.match(pageSource, /function mergeRemoteLeadContext/, 'Mandate route hydration must prefer live Supabase lead context over stale local browser cache.')
assert.match(pageSource, /immediateLeadContext = mergeRemoteLeadContext\(immediateLeadContext, supabaseLeadContext\)/, 'Initial mandate route hydration must merge live Supabase context into the rendered draft.')
assert.match(pageSource, /nextLeadContext = mergeRemoteLeadContext\(nextLeadContext, supabaseLeadContext\)/, 'Background mandate route hydration must merge live Supabase context into the settled draft.')
assert.match(pageSource, /readLead\(false\)/, 'Lead lookup must retry without a stale organisation filter.')
assert.match(pageSource, /originating_crm_lead_id\.eq/, 'Lead route must be able to find the linked private listing by originating CRM lead id.')
assert.match(pageSource, /autoGenerateEnabled=\{routeContextSettled && contextHydrated && packetType === 'mandate'\}/, 'Mandate auto-generation must wait for route packet lookup to settle before creating a new packet.')
assert.match(await readFile(resolve(root, 'src/core/documents/packetStatusResolver.js'), 'utf8'), /\['completed', 'partially_signed', 'sent', 'signing_prep'\][\s\S]+status === 'generated'[\s\S]+status === 'draft'/, 'Lead-scoped packet resolution must prefer generated packets over accidental draft duplicates.')
assert.match(workspaceSource, /setBackgroundGenerationJob\(\s+isActiveLegalDocumentGenerationJob\(initialStatus\?\.legalDocumentJob\)[\s\S]+: null,\s+\)/, 'Generated mandate refreshes must clear stale background-generation jobs from UI state.')
assert.match(workspaceSource, /function statusHasGeneratedPacketVersion/, 'Workspace must detect generated versions before trusting stale generation jobs.')
assert.match(workspaceSource, /isActiveLegalDocumentGenerationJob\(initialStatus\?\.legalDocumentJob\) &&\s+!statusHasGeneratedPacketVersion\(initialStatus\)/, 'Initial generated mandates must not adopt stale active generation jobs.')
assert.match(workspaceSource, /isMandatePacket &&\s+!statusHasGeneratedPacketVersion\(currentStatus\)/, 'Generated mandates must not continue polling stale background jobs.')
assert.match(workspaceSource, /if \(actionBusy \|\| staleGenerationMessage\)[\s\S]+setActionBusy\(false\)[\s\S]+setActionProgressMessage\(''\)/, 'Generated mandates must clear stale Working banners and busy buttons.')
assert.match(workspaceSource, /if \(!legalPermissions\.canGenerate \|\| typeof onGenerate !== 'function'\) return\n\s+if \(actionBusyRef\.current\) return\n\s+const autoGenerateKey/, 'Auto-generation rerenders must not invalidate an active generation run and leave the UI stuck on Working.')

console.log('Mandate attorney hydration Phase 6 checks passed.')
