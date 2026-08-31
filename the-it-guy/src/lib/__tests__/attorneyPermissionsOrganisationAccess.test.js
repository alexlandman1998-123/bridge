import { describe, expect, it } from 'vitest'
import { activeFirmMembershipCoversAttorneyAssignment } from '../attorneyPermissions.js'

const assignedOrganisationId = '37f3adfa-5f63-45af-95cf-9acb5037b38e'

describe('attorney matter organisation access', () => {
  it('allows an active member of the assigned organisation before staff allocation', () => {
    expect(activeFirmMembershipCoversAttorneyAssignment({
      assigned_organisation_id: assignedOrganisationId,
      assignment_status: 'pending',
      attorney_user_id: null,
    }, {
      firmId: assignedOrganisationId,
      status: 'active',
    })).toBe(true)
  })

  it('does not allow a member of another organisation', () => {
    expect(activeFirmMembershipCoversAttorneyAssignment({
      assigned_organisation_id: assignedOrganisationId,
      assignment_status: 'pending',
    }, {
      firmId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'active',
    })).toBe(false)
  })

  it('does not allow suspended members or removed assignments', () => {
    expect(activeFirmMembershipCoversAttorneyAssignment({
      firm_id: assignedOrganisationId,
      assignment_status: 'active',
    }, {
      firmId: assignedOrganisationId,
      status: 'suspended',
    })).toBe(false)

    expect(activeFirmMembershipCoversAttorneyAssignment({
      firm_id: assignedOrganisationId,
      assignment_status: 'removed',
    }, {
      firmId: assignedOrganisationId,
      status: 'active',
    })).toBe(false)
  })
})
