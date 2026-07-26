import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const helper = read('src/lib/partnerPersonOptions.js')
assert.match(helper, /fetchPartnerOperationalPeople/, 'partner person helper should use operational people service')
assert.match(helper, /export async function loadPartnerPersonOptions/, 'partner person helper should expose loader')
assert.match(helper, /export function mergePartnerPersonIntoOption/, 'partner person helper should enrich partner option with selected person')

const rolePlayerOptions = read('src/lib/newTransactionPartnerOptions.js')
assert.match(rolePlayerOptions, /firmFirstAllocation: isAttorneyRole && Boolean\(selectedUserId\)/, 'attorney role selections should remain firm-first')
assert.match(rolePlayerOptions, /userId: isAttorneyRole \? null : selectedUserId/, 'bond originator role selections should carry selected consultant user id')
assert.match(rolePlayerOptions, /preferredAttorneyUserId: isAttorneyRole \? selectedUserId : null/, 'attorney role selections should carry preferred attorney user id')

const newTransactionWizard = read('src/components/NewTransactionWizard.jsx')
assert.match(newTransactionWizard, /attorneyPartnerPersonId/, 'new transaction wizard should track preferred attorney person')
assert.match(newTransactionWizard, /bondOriginatorPartnerPersonId/, 'new transaction wizard should track bond consultant person')
assert.match(newTransactionWizard, /<Field label="Preferred Attorney">/, 'new transaction wizard should show preferred attorney dropdown')
assert.match(newTransactionWizard, /<Field label="Bond Consultant">/, 'new transaction wizard should show bond consultant dropdown')
assert.match(newTransactionWizard, /mergePartnerPersonIntoOption\(selectedAttorneyPartner, selectedAttorneyPerson/, 'new transaction wizard should save selected attorney person')
assert.match(newTransactionWizard, /mergePartnerPersonIntoOption\(selectedBondOriginatorPartner, selectedBondOriginatorPerson/, 'new transaction wizard should save selected bond consultant')

const agentDealWizard = read('src/components/AgentNewDealWizard.jsx')
assert.match(agentDealWizard, /transferPreferredPartnerPersonId/, 'agent deal wizard should track transfer attorney person')
assert.match(agentDealWizard, /bondOriginatorPreferredPartnerPersonId/, 'agent deal wizard should track bond consultant person')
assert.match(agentDealWizard, /cancellationAttorneyPreferredPartnerPersonId/, 'agent deal wizard should track cancellation attorney person')
assert.match(agentDealWizard, /preferredAttorneyUserId: transferSelection\.preferredAttorneyUserId/, 'agent deal wizard should save transfer attorney person preference')
assert.match(agentDealWizard, /userId: bondOriginatorSelection\.userId/, 'agent deal wizard should save bond consultant user id')
assert.match(agentDealWizard, /preferredAttorneyUserId: cancellationAttorneySelection\.preferredAttorneyUserId/, 'agent deal wizard should save cancellation attorney person preference')

const agencyPipeline = read('src/pages/agency/AgencyPipelinePage.jsx')
assert.match(agencyPipeline, /Preferred attorney at this firm/, 'seller onboarding attorney modal should expose person dropdown')
assert.match(agencyPipeline, /transferAttorneyPreferredUserId/, 'seller onboarding should pass selected attorney user id')
assert.match(agencyPipeline, /loadPartnerPersonOptions\(selectedSellerAttorney, 'transfer_attorney'\)/, 'seller onboarding should load firm people')

const privateListingService = read('src/services/privateListingService.js')
assert.match(privateListingService, /transferAttorneyPreferredUserId/, 'seller onboarding service should accept preferred attorney user id')
assert.match(privateListingService, /preferredAttorneyUserId/, 'seller onboarding form data should store preferred attorney user id')

const attorneyAllocation = read('src/services/privateListingAttorneyAllocationService.js')
assert.match(attorneyAllocation, /preferredAttorneyMetadata/, 'private listing attorney allocation should preserve person preference metadata')

console.log('Phase 1 partner person routing checks passed.')
