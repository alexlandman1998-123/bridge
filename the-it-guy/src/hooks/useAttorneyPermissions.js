import { useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  getAttorneyProfessionalProfilePermissions,
  getCurrentUserAttorneyMembership,
  hasAttorneyProfessionalPermission,
} from '../lib/attorneyPermissions'
import { getCurrentUserPrimaryAttorneyFirm } from '../services/attorneyFirms'

const EMPTY_PERMISSIONS = getAttorneyProfessionalProfilePermissions({})

function normalizeOperationalMembership(membership = null, { firmId = '', userId = '' } = {}) {
  if (!membership) return null
  const status = String(membership.status || '').trim().toLowerCase()
  return {
    ...membership,
    firmId: membership.firmId || firmId || null,
    userId: membership.userId || userId || null,
    role: membership.role || '',
    professionalRole: membership.professionalRole || '',
    practiceQualifications: membership.practiceQualifications || [],
    status: status || 'unknown',
    isActive: status === 'active',
  }
}

export default function useAttorneyPermissions({ firmId = null } = {}) {
  const { role: appRole, profile, workspaceReady, profileLoading } = useWorkspace()
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
      try {
        let nextFirmId = String(firmId || '').trim()
        if (!nextFirmId) {
          nextFirmId = String(profile?.primaryAttorneyFirmId || '').trim()
        }
        if (!nextFirmId) {
          const primaryFirm = await getCurrentUserPrimaryAttorneyFirm()
          nextFirmId = String(primaryFirm?.id || '').trim()
        }

        if (!active) return

        if (!nextFirmId) {
          setResolvedFirmId('')
          setMembership(null)
          return
        }

        const nextMembership = await getCurrentUserAttorneyMembership(nextFirmId)
        if (!active) return
        setResolvedFirmId(nextFirmId)
        setMembership(normalizeOperationalMembership(nextMembership, {
          firmId: nextFirmId,
          userId: profile?.id || '',
        }))
      } catch (loadError) {
        if (!active) return
        setError(loadError?.message || 'Unable to resolve attorney permissions.')
        setResolvedFirmId('')
        setMembership(null)
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [appRole, firmId, profile?.id, profile?.primaryAttorneyFirmId, profileLoading, workspaceReady])

  const role = membership?.professionalRole || null
  const compatibilityRole = membership?.role || null
  const permissions = role ? getAttorneyProfessionalProfilePermissions(membership) : EMPTY_PERMISSIONS
  const isActiveMembership = Boolean(membership?.isActive || membership?.status === 'active')

  const hasPermission = useMemo(
    () => (permissionKey) => (role && isActiveMembership ? hasAttorneyProfessionalPermission(membership, permissionKey) : false),
    [isActiveMembership, membership, role],
  )

  return {
    firmId: resolvedFirmId || null,
    membership: membership ? { ...membership, isActive: isActiveMembership } : null,
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
