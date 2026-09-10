// This deliberately cannot charge. A future prepaid adapter must implement
// quote and finalise separately, while preserving the same immutable snapshot.
export const noChargeEmailBillingAdapter = {
  key: 'no_charge',
  quote: ({ recipientCount = 0, currency = 'ZAR' } = {}) => ({ recipientCount: Number(recipientCount) || 0, currency, estimatedCharge: 0, billingStatus: 'no_charge' }),
  finalise: ({ recipientCount = 0, currency = 'ZAR' } = {}) => ({ recipientCount: Number(recipientCount) || 0, currency, charged: 0, billingStatus: 'no_charge' }),
}
