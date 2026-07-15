function packCondition(packKey, label) {
  return {
    enabled: true,
    field: 'legal_active_clause_packs',
    operator: 'contains',
    value: packKey,
    label,
  }
}

function starter({ key, category, title, description, lines }) {
  return Object.freeze({
    key,
    packKey: key,
    category,
    title,
    description,
    status: 'Attorney review required',
    approvalStatus: 'attorney_review',
    locked: false,
    snippet: lines.join('\n'),
    defaultCondition: packCondition(key, `Include only when ${title.toLowerCase()} applies`),
  })
}

export const SOUTH_AFRICAN_LEGAL_CLAUSE_STARTERS = Object.freeze([
  starter({ key: 'property_full_title_pack', category: 'Property', title: 'Full-title property terms', description: 'Starter wording for the registered erf and title description.', lines: ['The Property is sold as the full-title property described in this agreement, together with the improvements and fixtures included in the sale.', 'Registered erf: {{erf_number}}'] }),
  starter({ key: 'property_sectional_title_pack', category: 'Property', title: 'Sectional-title property terms', description: 'Starter wording for the section, scheme and participation interests.', lines: ['The Property includes the section and its undivided share in the common property as described in the sectional title records.', 'Section: {{property_section_number}}', 'Scheme: {{property_complex_name}}'] }),
  starter({ key: 'property_estate_hoa_pack', category: 'Property', title: 'Estate or HOA terms', description: 'Starter wording for estate rules, levies and purchaser membership obligations.', lines: ['The Purchaser acknowledges that the Property is subject to the applicable estate or homeowners association constitution, rules and levy obligations.', 'Estate / HOA: {{property_estate_or_hoa_name}}'] }),
  starter({ key: 'property_exclusive_use_pack', category: 'Property', title: 'Exclusive-use area terms', description: 'Starter wording for parking, storerooms and other exclusive-use rights.', lines: ['Any exclusive-use area forming part of the sale must be identified in the property schedule and transferred or ceded in the legally appropriate manner.'] }),
  starter({ key: 'bond_finance_pack', category: 'Finance', title: 'Bond finance terms', description: 'Bond suspensive-condition starter linked to the captured amount and deadline.', lines: ['This agreement is subject to the Purchaser obtaining written bond approval for not less than {{bond_amount}} by {{bond_approval_deadline}}.'] }),
  starter({ key: 'cash_contribution_pack', category: 'Finance', title: 'Cash contribution terms', description: 'Starter wording for the cash portion of a combination transaction.', lines: ['The Purchaser shall secure the cash contribution of {{cash_amount}} in the manner and by the date required by the transferring attorney.'] }),
  starter({ key: 'deposit_trust_pack', category: 'Finance', title: 'Deposit and trust-account terms', description: 'Starter wording for payment and investment of the deposit.', lines: ['The deposit of {{deposit_amount}} shall be paid to the nominated trust account holder recorded as {{deposit_holder}}, to be dealt with according to the agreement and applicable trust-account requirements.'] }),
  starter({ key: 'linked_property_sale_pack', category: 'Suspensive conditions', title: 'Linked property sale condition', description: 'Starter wording where the buyer must sell another property.', lines: ['This agreement is subject to the Purchaser concluding the required sale of the linked property by {{linked_sale_deadline}}, on terms acceptable under the final attorney-approved wording.'] }),
  starter({ key: 'occupation_before_transfer_pack', category: 'Occupation', title: 'Occupation before transfer terms', description: 'Starter wording for early occupation and occupational rent.', lines: ['If occupation occurs before registration of transfer, the occupying party shall pay occupational rent of {{occupational_rent}} per month and comply with the attorney-approved occupation conditions.'] }),
  starter({ key: 'existing_lease_pack', category: 'Occupation', title: 'Existing lease or occupier terms', description: 'Starter wording for a sale affected by an existing lease.', lines: ['The parties acknowledge the existing lease or occupier arrangement, including the recorded expiry date of {{lease_expiry_date}}, subject to attorney confirmation of its effect on occupation and transfer.'] }),
  starter({ key: 'transfer_duty_tax_pack', category: 'Tax', title: 'Transfer-duty treatment', description: 'Starter wording for a transfer-duty transaction.', lines: ['The parties record that the transaction is intended to attract transfer duty rather than VAT, subject to confirmation by the transferring attorney.'] }),
  starter({ key: 'vat_inclusive_tax_pack', category: 'Tax', title: 'VAT-inclusive treatment', description: 'Starter wording where the price is stated as VAT inclusive.', lines: ['The purchase price is recorded as inclusive of VAT at the legally applicable rate, subject to confirmation of the Seller’s VAT treatment.'] }),
  starter({ key: 'vat_exclusive_tax_pack', category: 'Tax', title: 'VAT-exclusive treatment', description: 'Starter wording where VAT is added to the stated price.', lines: ['VAT at the legally applicable rate shall be added to the purchase price, subject to confirmation of the Seller’s VAT treatment.'] }),
  starter({ key: 'vat_zero_rated_tax_pack', category: 'Tax', title: 'Potential zero-rated VAT treatment', description: 'Specialist starter wording requiring tax-attorney confirmation.', lines: ['The parties intend to apply zero-rated VAT treatment only if every statutory requirement is satisfied and confirmed in writing by the appointed tax or transferring attorney.'] }),
])
