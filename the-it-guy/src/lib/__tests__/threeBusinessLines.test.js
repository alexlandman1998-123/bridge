import { describe, expect, it } from 'vitest'
import { BUSINESS_WORKSPACES, normalizeBusinessWorkspaceList, resolveOrganisationBusinessWorkspaces, resolveBusinessWorkspaceRolloutAccess, resolveBusinessWorkspaceState, resolveBusinessWorkspaceRoute } from '../businessWorkspaceAccess'
import { normalizeAgencyBusinessLines, getAgencyBusinessFocusFromLines, mergeAgencyOnboardingDraft, buildDefaultAgencyOnboarding } from '../agencyOnboarding'
import { getRoleNavItems } from '../roles'

const lines = ['sales', 'rentals', 'short_term_rentals']
const workspace = { type: 'agency', settingsJson: { businessLines: lines } }
const context = { enabled: true, appRole: 'agent', workspaceType: 'agency', currentWorkspace: workspace, membershipRole: 'agent' }
describe('three business lines', () => {
  it('round-trips every nonempty combination through setup and member access', () => {
    for (let mask = 1; mask < 8; mask += 1) {
      const selected = lines.filter((_, index) => mask & (1 << index))
      const focus = getAgencyBusinessFocusFromLines(selected)
      expect(normalizeAgencyBusinessLines(focus)).toEqual(selected)
      expect(normalizeBusinessWorkspaceList(selected.join('+'))).toEqual(selected)
      const draft = mergeAgencyOnboardingDraft(buildDefaultAgencyOnboarding(), { agencyInformation: { businessLines: selected } })
      expect(draft.agencyInformation.businessLines).toEqual(selected)
      const state = resolveBusinessWorkspaceState({ ...context, currentMembership: { moduleMetadata: { businessWorkspaces: selected } }, preferredWorkspace: selected.at(-1) })
      expect(state.availableIds).toEqual(selected)
      expect(state.currentId).toBe(selected.at(-1))
      expect(state.showSwitcher).toBe(selected.some((line) => line !== 'sales'))
    }
  })
  it('does not grant short-term access to legacy Sales & Rentals members', () => {
    expect(normalizeBusinessWorkspaceList('sales_rentals')).toEqual(['sales', 'rentals'])
    expect(resolveBusinessWorkspaceState({ ...context, currentMembership: { moduleMetadata: { businessWorkspaces: ['rentals'] } } }).availableIds).toEqual(['rentals'])
  })
  it('uses explicit organisation lines over stale legacy focus', () => {
    expect(resolveOrganisationBusinessWorkspaces({ currentWorkspace: { settingsJson: { businessLines: ['short_term_rentals'], businessFocus: 'sales_rentals' } } })).toEqual(['short_term_rentals'])
  })
  it('activates from manually saved rental lines while keeping default and legacy sales setups off', () => {
    expect(resolveBusinessWorkspaceRolloutAccess({ enabled: false, currentWorkspace: workspace }).enabled).toBe(true)
    expect(resolveBusinessWorkspaceRolloutAccess({ enabled: false, currentWorkspace: { settingsJson: { businessLines: ['sales'] } } }).enabled).toBe(false)
    expect(resolveBusinessWorkspaceRolloutAccess({ enabled: false, currentWorkspace: { businessFocus: 'sales_rentals' } }).enabled).toBe(false)
    expect(resolveBusinessWorkspaceRolloutAccess({ enabled: false, currentWorkspace: { type: 'agency' } }).enabled).toBe(false)
  })
  it('enables only manually selected organisations or users when an allowlist is required', () => {
    const rollout = { enabled: true, requiresAllowlist: true, currentWorkspace: { type: 'agency', id: 'org-1', settingsJson: { businessLines: ['sales'] } }, user: { id: 'user-1' } }
    expect(resolveBusinessWorkspaceRolloutAccess({ ...rollout }).enabled).toBe(false)
    expect(resolveBusinessWorkspaceRolloutAccess({ ...rollout, allowedWorkspaceIdentifiers: ['org-1'] }).enabled).toBe(true)
    expect(resolveBusinessWorkspaceRolloutAccess({ ...rollout, allowedUserIdentifiers: ['user-1'] }).enabled).toBe(true)
    expect(resolveBusinessWorkspaceRolloutAccess({ ...rollout, enabled: false, allowedWorkspaceIdentifiers: ['org-1'] }).enabled).toBe(false)
    const disabled = resolveBusinessWorkspaceState({ ...context, enabled: false, preferredWorkspace: 'short_term_rentals', membershipRole: 'principal' })
    expect(disabled.showSwitcher).toBe(false)
    expect(disabled.currentId).toBe('sales')
  })
  it('does not regrant disabled lines from a job title or another line', () => {
    const state = resolveBusinessWorkspaceState({ ...context, currentWorkspace: { settingsJson: { businessLines: ['sales'] } }, currentMembership: { jobTitle: 'sales_agent', moduleMetadata: { businessWorkspaces: ['rentals'] } } })
    expect(state.availableIds).toEqual([])
  })
  it('inherits all three lines for principals', () => {
    expect(resolveBusinessWorkspaceState({ ...context, membershipRole: 'principal', currentMembership: { moduleMetadata: { businessWorkspaces: ['sales'] } } }).availableIds).toEqual(lines)
  })
  it('opens separate rental workspaces and preserves shared settings URLs', () => {
    expect(resolveBusinessWorkspaceRoute({ pathname: '/dashboard', targetWorkspace: BUSINESS_WORKSPACES.shortTermRentals })).toBe('/agent/rentals/short-term/dashboard')
    expect(resolveBusinessWorkspaceRoute({ pathname: '/agent/rentals/short-term/bookings', targetWorkspace: 'rentals' })).toBe('/agent/rentals/long-term/dashboard')
    expect(resolveBusinessWorkspaceRoute({ pathname: '/agent/rentals/short-term/dashboard', targetWorkspace: 'sales' })).toBe('/dashboard')
    expect(resolveBusinessWorkspaceRoute({ pathname: '/settings/business-lines', search: '?tab=setup', targetWorkspace: 'short_term_rentals' })).toBe('/settings/business-lines?tab=setup')
    expect(getRoleNavItems('agent', { businessWorkspace: 'short_term_rentals' })[0].to).toBe('/agent/rentals/short-term/dashboard')
    expect(getRoleNavItems('agent', { businessWorkspace: 'rentals' })[0].to).toBe('/agent/rentals/long-term/dashboard')
  })
})
