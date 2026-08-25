import { describe, expect, it } from 'vitest'
import {
  BUSINESS_WORKSPACES,
  resolveBusinessWorkspaceRolloutAccess,
  resolveBusinessWorkspaceState,
} from '../businessWorkspaceAccess'

describe('business workspace access', () => {
  it('allows production rollout access when an agency explicitly enables rentals in Business Lines', () => {
    const access = resolveBusinessWorkspaceRolloutAccess({
      enabled: true,
      requiresAllowlist: true,
      allowedWorkspaceIdentifiers: ['produktive'],
      currentWorkspace: {
        id: 'home-seekers',
        name: 'Home Seekers',
        type: 'agency',
        settingsJson: {
          businessLines: ['sales', 'rentals'],
        },
      },
    })

    expect(access.enabled).toBe(true)
    expect(access.reason).toBe('workspace_business_lines_enabled')
  })

  it('keeps production rollout blocked for non-allowlisted agencies without rentals enabled', () => {
    const access = resolveBusinessWorkspaceRolloutAccess({
      enabled: true,
      requiresAllowlist: true,
      allowedWorkspaceIdentifiers: ['produktive'],
      currentWorkspace: {
        id: 'home-seekers',
        name: 'Home Seekers',
        type: 'agency',
        settingsJson: {
          businessLines: ['sales'],
        },
      },
    })

    expect(access.enabled).toBe(false)
    expect(access.reason).toBe('allowlist_miss')
  })

  it('lets principals inherit all enabled agency business lines despite stale user-level line metadata', () => {
    const state = resolveBusinessWorkspaceState({
      enabled: true,
      appRole: 'agent',
      workspaceType: 'agency',
      membershipRole: 'principal',
      currentWorkspace: {
        type: 'agency',
        settingsJson: {
          businessLines: ['sales', 'rentals'],
        },
      },
      currentMembership: {
        role: 'principal',
        moduleMetadata: {
          businessWorkspaces: ['sales'],
        },
      },
      preferredWorkspace: 'sales',
    })

    expect(state.availableIds).toEqual([BUSINESS_WORKSPACES.sales, BUSINESS_WORKSPACES.rentals])
    expect(state.showSwitcher).toBe(true)
  })

  it('treats legacy agency principal role aliases as management access', () => {
    const state = resolveBusinessWorkspaceState({
      enabled: true,
      appRole: 'agent',
      workspaceType: 'agency',
      currentWorkspace: {
        type: 'agency',
        settingsJson: {
          businessLines: ['sales', 'rentals'],
        },
      },
      currentMembership: {
        role: 'agency_principal',
        moduleMetadata: {
          businessWorkspaces: ['sales'],
        },
      },
      preferredWorkspace: 'rentals',
    })

    expect(state.currentId).toBe(BUSINESS_WORKSPACES.rentals)
    expect(state.availableIds).toEqual([BUSINESS_WORKSPACES.sales, BUSINESS_WORKSPACES.rentals])
    expect(state.showSwitcher).toBe(true)
  })

  it('keeps normal agents restricted to explicit user-level business lines', () => {
    const state = resolveBusinessWorkspaceState({
      enabled: true,
      appRole: 'agent',
      workspaceType: 'agency',
      membershipRole: 'agent',
      currentWorkspace: {
        type: 'agency',
        settingsJson: {
          businessLines: ['sales', 'rentals'],
        },
      },
      currentMembership: {
        role: 'agent',
        moduleMetadata: {
          businessWorkspaces: ['sales'],
        },
      },
      preferredWorkspace: 'sales',
    })

    expect(state.availableIds).toEqual([BUSINESS_WORKSPACES.sales])
    expect(state.showSwitcher).toBe(false)
  })
})
