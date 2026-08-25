import { describe, expect, it } from 'vitest'
import {
  BUSINESS_WORKSPACES,
  resolveBusinessWorkspaceState,
} from '../businessWorkspaceAccess'

describe('business workspace access', () => {
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
