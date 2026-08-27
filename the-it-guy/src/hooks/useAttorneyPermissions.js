import { useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  getAttorneyProfessionalProfilePermissions,
  getCurrentUserAttorneyMembership,
  hasAttorneyProfessionalPermission,
} from '../lib/attorneyPermissions'
import { createPerfTimer } from '../lib/performanceTrace'
import { getCurrentUserPrimaryAttorneyFirm } from '../services/attorneyFirms'
import { deriveAttorneyProfessionalProfile } from '../constants/attorneyRoleCatalog.js'

const EMPTY_PERMISSIONS = getAttorneyProfessionalProfilePermissions({})

function normalizeText(value = '') {
  return String(value || '').trim()
}

function getMembershipFirmId(membership = null) {
  return normalizeText(
    membership?.firmId ||
      membership?.firm_id ||
      membership?.workspaceId ||
      membership?.workspace_id ||
      membership?.workspace?.id ||
      membership?.raw?.firm_id,
  )
}

function getMembershipUserId(membership = null) {
  return normalizeText(membership?.userId || membership?.user_id || membership?.raw?.user_id)
}

function membershipMatchesContext(membership = null, { firmId = '', userId = '' } = {}) {
  if (!membership) return false
  const membershipFirmId = getMembershipFirmId(membership)
  const membershipUserId = getMembershipUserId(membership)
  const resolvedFirmId = normalizeText(firmId)
  const resolvedUserId = normalizeText(userId)
  return Boolean(
    membershipFirmId &&
      membershipFirmId === resolvedFirmId &&
      (!resolvedUserId || !membershipUserId || membershipUserId === resolvedUserId),
  )
}

function normalizeOperationalMembership(membership = null, { firmId = '', userId = '' } = {}) {
  if (!membership) return null
  const status = String(membership.status || '').trim().toLowerCase()
  const role = normalizeText(membership.role || membership.workspaceRole || membership.rawRole || membership.raw?.role)
  const professionalProfile = deriveAttorneyProfessionalProfile({
    role,
    professionalRole: membership.professionalRole || membership.professional_role || membership.raw?.professional_role,
    practiceQualifications: membership.practiceQualifications || membership.practice_qualifications || membership.raw?.practice_qualifications,
  })
  return {
    ...membership,
    firmId: getMembershipFirmId(membership) || firmId || null,
    userId: getMembershipUserId(membership) || userId || null,
    role,
    professionalRole: professionalProfile.professionalRole,
    practiceQualifications: professionalProfile.practiceQualifications,
    status: status || 'unknown',
    isActive: status === 'active',
  }
}

export default function useAttorneyPermissions({ firmId = null } = {}) {
  const {
    role: appRole,
    profile,
    workspace,
    currentMembership,
    membershipContexts,
    workspaceReady,
    profileLoading,
  } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [resolvedFirmId, setResolvedFirmId] = useState('')
  const [membership, setMembership] = useState(null)

  useEffect(() => {
    let active = true

    async function load() {
      if (!workspaceReady || profileLoading) return
      if (appRole !== 'attorney') {
        if (!active) return
        setResolvedFirmId('')
        setMembership(null)
        setError('')
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')
      const timer = createPerfTimer('attorney.permissions', {
        firmId: normalizeText(firmId) || null,
        workspaceId: normalizeText(workspace?.id) || null,
        workspaceType: normalizeText(workspace?.type) || null,
        hasBootMembership: Boolean(membershipContexts?.attorneyFirm || currentMembership),
      })
      let outcome = 'success'
      try {
        const currentUserId = normalizeText(profile?.id || profile?.userId)
        let nextFirmId = normalizeText(firmId)
        if (!nextFirmId) {
          nextFirmId = normalizeText(profile?.primaryAttorneyFirmId || profile?.primary_attorney_firm_id)
        }
        if (!nextFirmId && normalizeText(workspace?.type) === 'attorney_firm') {
          nextFirmId = normalizeText(workspace?.id)
        }
        if (!nextFirmId) {
          timer.mark('primaryFirm:fetch:start')
          const primaryFirm = await getCurrentUserPrimaryAttorneyFirm()
          nextFirmId = normalizeText(primaryFirm?.id)
          timer.mark('primaryFirm:fetch:end', { firmId: nextFirmId || null })
        }

        if (!active) return

        if (!nextFirmId) {
          setResolvedFirmId('')
          setMembership(null)
          return
        }

        const bootMembership = membershipContexts?.attorneyFirm || currentMembership
        const canUseBootMembership = membershipMatchesContext(bootMembership, {
          firmId: nextFirmId,
          userId: currentUserId,
        })
        timer.mark('firm:resolved', {
          firmId: nextFirmId,
          userId: currentUserId || null,
          membershipSource: canUseBootMembership ? 'workspace_boot' : 'supabase_lookup',
        })
        const nextMembership = canUseBootMembership
          ? bootMembership
          : await getCurrentUserAttorneyMembership(nextFirmId, currentUserId || null)
        if (!active) return
        setResolvedFirmId(nextFirmId)
        setMembership(normalizeOperationalMembership(nextMembership, {
          firmId: nextFirmId,
          userId: currentUserId,
        }))
        timer.mark('membership:resolved', {
          firmId: nextFirmId,
          membershipSource: canUseBootMembership ? 'workspace_boot' : 'supabase_lookup',
          status: nextMembership?.status || null,
        })
      } catch (loadError) {
        outcome = 'failed'
        if (!active) return
        setError(loadError?.message || 'Unable to resolve attorney permissions.')
        setResolvedFirmId('')
        setMembership(null)
      } finally {
        timer.end({ outcome })
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [
    appRole,
    currentMembership,
    firmId,
    membershipContexts?.attorneyFirm,
    profile?.id,
    profile?.primaryAttorneyFirmId,
    profile?.primary_attorney_firm_id,
    profile?.userId,
    profileLoading,
    workspace?.id,
    workspace?.type,
    workspaceReady,
  ])

  const role = membership?.professionalRole || null
  const compatibilityRole = membership?.role || null
  const isActiveMembership = Boolean(membership?.isActive || membership?.status === 'active')
  const permissions = useMemo(
    () => (role ? getAttorneyProfessionalProfilePermissions(membership) : EMPTY_PERMISSIONS),
    [membership, role],
  )
  const exposedMembership = useMemo(
    () => (membership ? { ...membership, isActive: isActiveMembership } : null),
    [isActiveMembership, membership],
  )

  const hasPermission = useMemo(
    () => (permissionKey) => (role && isActiveMembership ? hasAttorneyProfessionalPermission(membership, permissionKey) : false),
    [isActiveMembership, membership, role],
  )

  return {
    firmId: resolvedFirmId || null,
    membership: exposedMembership,
    role,
    professionalRole: role,
    compatibilityRole,
    permissions,
    hasPermission,
    canViewManagementDashboard: hasPermission('can_view_firm_dashboard'),
    canViewAllFirmMatters: hasPermission('can_view_all_firm_matters'),
    canViewAssignedMatters: hasPermission('can_view_assigned_matters'),
    canEditTransferWorkflow: hasPermission('can_edit_transfer_workflow'),
    canEditBondWorkflow: hasPermission('can_edit_bond_workflow'),
    canManageFirmSettings: hasPermission('can_manage_firm_settings'),
    loading,
    error,
  }
}
