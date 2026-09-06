import { ATTORNEY_RELEASE_PROPAGATION_DESTINATIONS, ATTORNEY_RELEASE_ROLES, ATTORNEY_RELEASE_UPDATE_VISIBILITY } from '../constants/attorneyReleaseReadinessPhase0.js'
export const ATTORNEY_PRACTICAL_PHASE0_VERSION = 'attorney-practical-release-acceptance-phase0-v1'
const text = (value) => String(value || '').trim()
const issue = (code, remedy, details = {}) => ({ code, remedy, ...details })
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)

export function buildAttorneyPracticalPhase0Decision({ contract = null, contractFingerprint = '', approval = null } = {}) {
  const blockers = []
  const roleKeys = ATTORNEY_RELEASE_ROLES.map(({ transactionRole }) => transactionRole)
  if (contract?.version !== 'attorney-practical-release-bar-phase0-v1' || contract?.environment !== 'staging') blockers.push(issue('RELEASE_BAR_INVALID', 'Use the approved staging release-bar contract.'))
  if (!same(Object.keys(contract?.roles || {}), roleKeys)) blockers.push(issue('ROLE_MATRIX_INCOMPLETE', 'Include transfer, bond, and cancellation attorney roles in canonical order.'))
  for (const role of roleKeys) if (!Array.isArray(contract?.roles?.[role]) || contract.roles[role].length < 5) blockers.push(issue('ROLE_ACTIONS_INCOMPLETE', `Define at least five practical actions for ${role}.`, { role }))
  if (!same(contract?.viewports, ['desktop', 'mobile'])) blockers.push(issue('VIEWPORT_MATRIX_INCOMPLETE', 'Require desktop and mobile walkthroughs.'))
  if (!same(contract?.destinations, ATTORNEY_RELEASE_PROPAGATION_DESTINATIONS)) blockers.push(issue('DESTINATION_MATRIX_INCOMPLETE', 'Require every canonical propagation destination.'))
  if (!same(contract?.visibility, ATTORNEY_RELEASE_UPDATE_VISIBILITY)) blockers.push(issue('VISIBILITY_CONTRACT_MISMATCH', 'Restore the canonical internal, professional, and client visibility boundaries.'))
  const soak = contract?.soak || {}
  if (Number(soak.minimumHours) !== 24 || Number(soak.minimumTotalActions) !== 30 || Number(soak.minimumActionsPerRole) !== 5 || Number(soak.minimumSuccessfulActionRate) !== 0.99 || Number(soak.maximumPropagationP95Seconds) !== 120 || Number(soak.maximumPropagationGaps) !== 0 || Number(soak.maximumSafetyIncidents) !== 0) blockers.push(issue('SOAK_BAR_MISMATCH', 'Use the agreed 24-hour, 30-action, zero-incident release bar.'))
  if (contract?.defectPolicy?.releaseRequires !== 'zero_open_p0_p1_and_agreed_p2_disposition') blockers.push(issue('DEFECT_POLICY_INCOMPLETE', 'Block release on open P0/P1 defects and require an agreed P2 disposition.'))
  for (const key of ['authenticatedBrowserRequired','screenshotOrTraceRequired','actionReceiptRequired','destinationProofRequired']) if (contract?.evidence?.[key] !== true) blockers.push(issue('EVIDENCE_REQUIREMENT_MISSING', `Require ${key}.`, { key }))
  const contractBlockerCount = blockers.length
  if (!text(approval?.approvedBy) || !text(approval?.approvedAt) || !text(approval?.approvalReference)) blockers.push(issue('RELEASE_BAR_APPROVAL_REQUIRED', 'Record the accountable owner, timestamp, and approval reference.'))
  if (!text(contractFingerprint) || approval?.contractFingerprint !== contractFingerprint) blockers.push(issue('RELEASE_BAR_APPROVAL_MISMATCH', 'Approve the exact contract fingerprint.'))
  if (approval?.confirmation !== 'ACCEPT_ATTORNEY_RELEASE_BAR') blockers.push(issue('EXACT_RELEASE_BAR_CONFIRMATION_REQUIRED', 'Use the exact confirmation ACCEPT_ATTORNEY_RELEASE_BAR.'))
  const status = contractBlockerCount ? 'INVALID' : blockers.length ? 'READY_FOR_APPROVAL' : 'ACCEPTED'
  return { version: ATTORNEY_PRACTICAL_PHASE0_VERSION, status, contractFingerprint, contractBlockerCount, blockerCount: blockers.length, blockers }
}
