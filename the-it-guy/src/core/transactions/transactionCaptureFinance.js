import { validateDealSetupFunding } from './dealSetupContract.js'

const text = (value) => String(value ?? '').trim()
const bondTypes = new Set(['bond', 'combination', 'hybrid'])
export const CAPTURE_BOND_STATUS_OPTIONS = [
  ['unknown', 'Not confirmed'], ['not_applied', 'Not applied yet'], ['in_progress', 'Application in progress'],
  ['submitted', 'Submitted to bank'], ['approved', 'Approval reported'], ['declined', 'Declined'],
]

export function buildTransactionCaptureFinance(form, purchasePrice = null) {
  const type = form.financeType === 'combination' ? 'hybrid' : form.financeType
  const usesBond = bondTypes.has(type)
  const usesCash = ['cash', 'hybrid'].includes(type)
  const status = CAPTURE_BOND_STATUS_OPTIONS.some(([value]) => value === form.bondStatus) ? form.bondStatus : 'unknown'
  const snapshot = { version: 'transaction_capture_finance_v1', type: ['cash', 'bond', 'hybrid'].includes(type) ? type : 'unknown',
    managedBy: usesBond ? form.financeManagedBy || 'client' : null,
    bank: usesBond ? text(form.financeBank) : '', bondStatus: usesBond ? status : null,
    sellerBondStatus: ['yes', 'no', 'unknown'].includes(form.sellerBondStatus) ? form.sellerBondStatus : 'unknown',
    sellerBondBank: form.sellerBondStatus === 'yes' ? text(form.sellerBondBank) : '',
    sellerBondReference: form.sellerBondStatus === 'yes' ? text(form.sellerBondReference) : '',
    cashAmount: usesCash ? text(form.cashAmount) : '', bondAmount: usesBond ? text(form.bondAmount) : '', depositAmount: text(form.depositAmount),
  }
  const validation = validateDealSetupFunding({ terms: { purchasePrice, depositAmount: snapshot.depositAmount },
    finance: { type: snapshot.type, managedBy: snapshot.managedBy, cashAmount: snapshot.cashAmount, bondAmount: snapshot.bondAmount } })
  const missing = [...validation.issues]
  if (usesBond && !snapshot.bank) missing.push('Confirm the bank funding the bond.')
  if (usesBond && snapshot.bondStatus === 'unknown') missing.push('Confirm the current bond application position.')
  if (usesBond && snapshot.bondStatus === 'approved' && (!form.bondAttorneyNomination || form.bondAttorneyNomination.mode === 'none')) missing.push('Confirm the bank-appointed bond registration attorney.')
  if (snapshot.sellerBondStatus === 'yes' && !snapshot.sellerBondBank) missing.push('Confirm the bank holding the seller bond.')
  if (snapshot.sellerBondStatus === 'unknown') missing.push('Confirm whether the seller has an existing bond to cancel.')
  return { snapshot, missing: [...new Set(missing)], complete: missing.length === 0 }
}

export function splitTransactionCaptureRolePlayers(selections, { financeType, financeManagedBy, sellerBondStatus } = {}) {
  const connected = [], invitations = [], missing = []
  for (const selection of selections) {
    if (selection.roleType === 'bond_originator' && (!bondTypes.has(financeType) || financeManagedBy !== 'bond_originator')) continue
    if (selection.roleType === 'bond_attorney' && !bondTypes.has(financeType)) continue
    if (selection.roleType === 'cancellation_attorney' && sellerBondStatus !== 'yes') continue
    const partner = selection.partner || selection
    const organisationId = text(selection.partnerOrganisationId || selection.organisationId || partner.partnerOrganisationId || partner.organisationId)
    if (organisationId) {
      const attorney = ['transfer_attorney', 'bond_attorney', 'cancellation_attorney'].includes(selection.roleType)
      connected.push(attorney ? { ...selection, partnerOrganisationId: organisationId, firmFirstAllocation: true,
        preferredAttorneyUserId: selection.preferredAttorneyUserId || selection.userId || null, userId: null } : selection)
      continue
    }
    const companyName = text(partner.companyName || partner.partnerName)
    const email = text(partner.email).toLowerCase()
    if (!companyName && !email) continue
    if (!companyName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { missing.push(`${selection.roleType}: confirm the company and a valid invitation email.`); continue }
    invitations.push({ roleType: selection.roleType, companyName, contactName: text(partner.contactPerson) || companyName, email, phone: text(partner.phone) })
  }
  return { connected, invitations, missing }
}

export async function resolveTransactionCaptureParticipantPolicy({ client, transactionId, explicitCapture = null, defaults }) {
  let captured = explicitCapture
  if (captured === null) {
    const result = await client.from('onboarding_form_data').select('form_data').eq('transaction_id', transactionId).maybeSingle()
    if (result.error && !['42P01', 'PGRST205', '42703', 'PGRST204'].includes(result.error.code)) throw result.error
    captured = result.data?.form_data?.__bridge_finance?.captureSnapshot?.version === 'transaction_capture_finance_v1'
  }
  return { captured: Boolean(captured), defaults: captured ? defaults.filter((row) => !['attorney', 'bond_originator'].includes(row.role_type)) : defaults }
}
