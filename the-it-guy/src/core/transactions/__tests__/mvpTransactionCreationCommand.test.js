import assert from 'node:assert/strict'

import {
  MVP_TRANSACTION_CREATION_COMMAND_VERSION,
  prepareMvpTransactionCreationCommand,
} from '../mvpTransactionCreationCommand.js'

const routingProfile = {
  transactionType: 'resale',
  financeType: 'bond',
  propertyTenure: 'sectional_title',
  buyerEntityType: 'trust',
  sellerEntityType: 'company',
}

{
  const command = prepareMvpTransactionCreationCommand({
    routingProfile,
    organisationId: 'org-1',
    listingId: 'listing-1',
    leadId: 'lead-1',
    acceptedOfferId: 'offer-1',
    assignedAgentEmail: 'agent@arch9.test',
  })
  assert.equal(command.version, MVP_TRANSACTION_CREATION_COMMAND_VERSION)
  assert.equal(command.idempotencyKey, 'mvp_tx_org_1_offer_offer_1')
  assert.equal(command.launchScope.status, 'supported')
}

assert.throws(
  () => prepareMvpTransactionCreationCommand({
    routingProfile,
    organisationId: 'org-1',
    listingId: 'listing-1',
    leadId: 'lead-1',
    assignedAgentEmail: 'agent@arch9.test',
  }),
  (error) => error?.code === 'mvp_accepted_offer_required',
)

assert.throws(
  () => prepareMvpTransactionCreationCommand({
    routingProfile: { ...routingProfile, propertyTenure: 'share_block' },
    organisationId: 'org-1',
    listingId: 'listing-1',
    leadId: 'lead-1',
    acceptedOfferId: 'offer-1',
    assignedAgentEmail: 'agent@arch9.test',
  }),
  (error) => error?.code === 'mvp_transaction_out_of_scope',
)

console.log('mvp transaction creation command tests passed')
