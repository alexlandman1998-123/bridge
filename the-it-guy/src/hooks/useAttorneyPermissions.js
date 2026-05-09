import { useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  getAttorneyRolePermissions,
  getCurrentUserAttorneyMembership,
  hasAttorneyPermission,
} from '../lib/attorneyPermissions'
import { getCurrentUserPrimaryAttorneyFirm } from '../services/attorneyFirms'

const EMPTY_PERMISSIONS = getAttorneyRolePermissions('candidate_attorney')

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
        setMembership(nextMembership || null)
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
  }, [appRole, firmId, profile?.primaryAttorneyFirmId, profileLoading, workspaceReady])

  const role = membership?.role || null
  const permissions = role ? getAttorneyRolePermissions(role) : EMPTY_PERMISSIONS
  const isActiveMembership = Boolean(membership?.status === 'active')

  const hasPermission = useMemo(
    () => (permissionKey) => (role && isActiveMembership ? hasAttorneyPermission(role, permissionKey) : false),
    [isActiveMembership, role],
  )

  return {
    firmId: resolvedFirmId || null,
    membership: membership ? { ...membership, isActive: isActiveMembership } : null,
    role,
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
