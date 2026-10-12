import test from 'node:test'
import assert from 'node:assert/strict'
import { assertListingEditorSellerOwnership, getListingEditorSellerOwnershipFields } from '../listingSellerHistoricalNormalizationModel.js'
import { applyListingSellerOnboardingSaveSnapshot, applyListingSellerCanonicalUpdateSnapshot, buildListingSellerCanonicalUpdate } from '../listingSellerCanonicalUpdateModel.js'

test('stale individual editor cannot overwrite a multiple-owner Seller record', () => {
  assert.throws(() => assertListingEditorSellerOwnership({ sellerType: 'individual' }, {
    sellerOnboarding: { canonicalFacts: { seller: { owner_structure_type: 'multiple_owners' } }, formData: { owners: [{}, {}] } },
  }), /Review and confirm the legal owners/)
})

test('retained owner entries also block an inconsistent individual projection', () => {
  assert.throws(() => assertListingEditorSellerOwnership({ sellerType: 'individual' }, {
    sellerOnboarding: { formData: { ownerStructureType: 'individual', owners: [{}, {}] } },
  }), /No listing changes were saved/)
})

test('checks the stored onboarding source even if the display projection chose listing facts', () => {
  assert.throws(() => assertListingEditorSellerOwnership({ sellerType: 'individual' }, {
    sellerOnboarding: {
      canonicalFacts: { seller: { owner_structure_type: 'individual' } },
      storedCanonicalFacts: { seller: { owner_structure_type: 'multiple_owners' } },
    },
  }), /Review and confirm/)
})

test('consistent single-owner and multiple-owner saves remain available', () => {
  for (const type of ['individual', 'multiple_owners']) {
    assert.doesNotThrow(() => assertListingEditorSellerOwnership({ sellerType: type }, {
      sellerOnboarding: { canonicalFacts: { seller: { owner_structure_type: type } }, formData: { owners: type === 'individual' ? [{}] : [{}, {}] } },
    }))
  }
})

test('editor reopens with the saved ownership structure rather than a stale listing entity', () => {
  for (const type of ['multiple_owners', 'company', 'trust', 'close_corporation', 'foreign_company']) {
    const listing = { sellerType: 'individual', sellerOnboarding: {
      storedCanonicalFacts: { seller: { owner_structure_type: type } },
      formData: { sellerType: 'individual' },
    } }
    const fields = getListingEditorSellerOwnershipFields(listing)
    assert.equal(fields.sellerType, type)
    assert.doesNotThrow(() => assertListingEditorSellerOwnership(fields, listing))
  }
})

test('marriage aliases retain the specific structure without rejecting the individual entity', () => {
  for (const type of ['married_cop', 'married_anc', 'married', 'natural_person', 'Pty Ltd', 'CC']) {
    const listing = { sellerOnboarding: { canonicalFacts: { seller: { owner_structure_type: type } } } }
    const fields = getListingEditorSellerOwnershipFields(listing)
    assert.equal(fields.ownerStructureType, type)
    assert.doesNotThrow(() => assertListingEditorSellerOwnership(fields, listing))
  }
})

test('a successful ownership save replaces stored facts before the next listing edit', () => {
  const oldFacts = { seller: { owner_structure_type: 'company' } }
  const facts = { seller: { owner_structure_type: 'multiple_owners' } }
  const listing = { id: 'listing', sellerOnboarding: { storedCanonicalFacts: oldFacts, canonicalFacts: oldFacts } }
  const formData = { ownerStructureType: 'multiple_owners', owners: [{ name: 'Owner One' }, { name: 'Owner Two' }] }
  const receipt = applyListingSellerOnboardingSaveSnapshot(listing, { id: 'onboarding', form_data: formData, canonical_facts_json: facts })
  const local = applyListingSellerCanonicalUpdateSnapshot(listing, { nextFormData: formData, canonicalFacts: facts })
  for (const snapshot of [receipt, local]) {
    assert.deepEqual(snapshot.sellerOnboarding.storedCanonicalFacts, facts)
    assert.deepEqual(snapshot.sellerOnboarding.canonicalFacts, facts)
    assert.doesNotThrow(() => assertListingEditorSellerOwnership({ sellerType: 'multiple_owners' }, snapshot))
    assert.throws(() => assertListingEditorSellerOwnership({ sellerType: 'company' }, snapshot), /Review and confirm/)
  }
})

test('snake case and listing canonical facts participate in the same ownership check', () => {
  const listing = { seller_type: 'individual', seller_onboarding: { form_data: { owner_structure_type: 'joint' } } }
  assert.equal(getListingEditorSellerOwnershipFields(listing).sellerType, 'multiple_owners')
  assert.throws(() => assertListingEditorSellerOwnership({ sellerType: 'individual' }, listing), /Review and confirm/)
  assert.throws(() => assertListingEditorSellerOwnership({ sellerType: 'individual' }, {
    sellerCanonicalFacts: { seller: { owner_structure_type: 'trust' } },
  }), /Review and confirm/)
})

test('ordinary canonical saves use stored Seller facts when the listing projection is stale', () => {
  const listing = { id: 'listing', sellerType: 'individual',
    sellerCanonicalFacts: { seller: { owner_structure_type: 'individual' } },
    sellerOnboarding: {
      storedCanonicalFacts: { seller: { owner_structure_type: 'multiple_owners', owners: [{ name: 'One' }, { name: 'Two' }] } },
      formData: { ownerStructureType: 'multiple_owners', sellerType: 'multiple_owners' },
    },
  }
  const update = buildListingSellerCanonicalUpdate({ listing, formPatch: { notes: 'New viewing instructions' } })
  assert.equal(update.authority.profileType, 'multiple_owners')
  assert.equal(update.requirementsAffected, false)
  assert.equal(update.canonicalFacts.seller.owner_structure_type, 'multiple_owners')
})

test('a note-only save preserves married signing authority without a false ownership conflict', () => {
  const listing = { id: 'listing', sellerType: 'individual',
    sellerOnboarding: {
      storedCanonicalFacts: { seller: { owner_structure_type: 'married_cop' } },
      formData: { sellerType: 'individual', ownerStructureType: 'married_cop' },
    },
  }
  const update = buildListingSellerCanonicalUpdate({ listing, formPatch: { notes: 'Call before viewing' } })
  assert.equal(update.authority.profileType, 'married')
  assert.equal(update.requirementsAffected, false)
})

test('the listing selector cannot clear a confirmed legal owner to unknown', () => {
  assert.throws(() => assertListingEditorSellerOwnership({ sellerType: 'unknown' }, {
    sellerOnboarding: { storedCanonicalFacts: { seller: { owner_structure_type: 'company' } } },
  }), /No listing changes were saved/)
})

test('foreign entity detail is retained when structure and entity are stored separately', () => {
  for (const type of ['company', 'trust', 'individual']) {
    const listing = { id: 'listing', sellerOnboarding: {
      storedCanonicalFacts: { seller: { owner_entity_type: 'foreign', owner_structure_type: type } },
      formData: { ownerEntityType: 'foreign', ownerStructureType: type },
    } }
    const fields = getListingEditorSellerOwnershipFields(listing)
    assert.equal(fields.sellerType, `foreign_${type}`)
    assert.doesNotThrow(() => assertListingEditorSellerOwnership(fields, listing))
    const update = buildListingSellerCanonicalUpdate({ listing, formPatch: { notes: 'Viewing by appointment' } })
    assert.equal(update.authority.profileType, `foreign_${type}`)
  }
})

test('a legacy individual default does not identify an uncaptured legal owner', () => {
  assert.deepEqual(getListingEditorSellerOwnershipFields({ sellerType: 'individual' }), {
    sellerType: 'unknown', ownerStructureType: '', ownerEntityType: '',
  })
})
