import { AlertTriangle, CheckCircle2, CircleOff, Loader2, MessageSquareMore, RefreshCw, ShieldCheck, Smartphone, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useOrganisation } from '../../context/OrganisationContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { buildEmbeddedSignupLoginOptions, loadFacebookSdkOnce, parseEmbeddedSignupMessage } from '../../lib/metaWhatsApp'
import { connectWhatsAppChannel, disconnectWhatsAppChannel, listWhatsAppConnections } from '../../lib/whatsappIntegrationsApi'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import {
  SettingsBanner,
  SettingsEmptyState,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsSectionCard,
  settingsActionRowClass,
  settingsFieldClass,
  settingsGridClass,
  settingsPageClass,
  settingsTableClass,
} from './settingsUi'

function normalizeText(value) {
  return String(value || '').trim()
}

function formatDateTime(value) {
  if (!value) return 'Never'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Never'
    : new Intl.DateTimeFormat('en-ZA', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}

function getBranchId(branch = {}) {
  return normalizeText(branch.id || branch.branchId || branch.branch_id)
}

function getBranchLabel(branch = {}) {
  return normalizeText(branch.name || branch.branchName || branch.branch_name || branch.displayName || branch.display_name) || 'Branch'
}

function getScopeKey(branchId = '') {
  return normalizeText(branchId) || 'agency'
}

function getScopeLabel(scopeId, branchNameMap, organisationName) {
  if (!normalizeText(scopeId)) {
    return organisationName ? `${organisationName} default` : 'Agency default'
  }
  return branchNameMap.get(normalizeText(scopeId)) || 'Branch'
}

function getConnectionScopeKey(connection = {}) {
  return getScopeKey(connection.branchId || connection.branch_id)
}

function getConnectionStatusMeta(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized === 'connected') return { label: 'Connected', tone: 'success', icon: CheckCircle2 }
  if (normalized === 'connecting') return { label: 'Connecting', tone: 'warning', icon: Loader2 }
  if (normalized === 'action_required') return { label: 'Action required', tone: 'warning', icon: AlertTriangle }
  if (normalized === 'disconnected') return { label: 'Disconnected', tone: 'neutral', icon: CircleOff }
  if (normalized === 'error') return { label: 'Error', tone: 'error', icon: X }
  return { label: normalized || 'Unknown', tone: 'neutral', icon: Smartphone }
}

async function launchEmbeddedSignup() {
  const fb = await loadFacebookSdkOnce()
  const options = buildEmbeddedSignupLoginOptions()

  return new Promise((resolve, reject) => {
    let settled = false
    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error('Embedded signup timed out.'))
    }, 10 * 60 * 1000)

    function cleanup() {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      window.removeEventListener('message', onMessage)
    }

    function finish(payload) {
      if (settled) return
      cleanup()
      resolve(payload)
    }

    function onMessage(event) {
      const payload = parseEmbeddedSignupMessage(event)
      if (!payload) return
      finish(payload)
    }

    window.addEventListener('message', onMessage)

    try {
      fb.login((response) => {
        const code = normalizeText(response?.code || response?.authResponse?.code)
        const phoneNumberId = normalizeText(response?.phoneNumberId || response?.phone_number_id)
        const wabaId = normalizeText(response?.wabaId || response?.waba_id)
        if (code && phoneNumberId && wabaId) {
          finish({
            code,
            phoneNumberId,
            wabaId,
            displayPhoneNumber: normalizeText(response?.displayPhoneNumber || response?.display_phone_number),
            businessDisplayName: normalizeText(response?.businessDisplayName || response?.business_display_name),
            metaBusinessId: normalizeText(response?.metaBusinessId || response?.business_id),
            raw: response || {},
          })
          return
        }

        const errorMessage = normalizeText(response?.errorMessage || response?.error || response?.message)
        if (errorMessage && !settled) {
          cleanup()
          reject(new Error(errorMessage))
        }
      }, options)
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}

function ConnectionCard({ connection, scopeLabel, onDisconnect, onReconnect, disconnecting, reconnecting }) {
  const statusMeta = getConnectionStatusMeta(connection.connectionStatus)
  const StatusIcon = statusMeta.icon
  const phoneNumber = normalizeText(connection.displayPhoneNumber || connection.display_phone_number)
  const businessName = normalizeText(connection.businessDisplayName || connection.business_display_name)
  const verificationStatus = normalizeText(connection.verificationStatus || connection.verification_status)
  const lastError = normalizeText(connection.lastErrorMessage || connection.last_error_message)
  const connectedAt = formatDateTime(connection.connectedAt || connection.connected_at)
  const updatedAt = formatDateTime(connection.updatedAt || connection.updated_at)

  return (
    <article className="rounded-[20px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6d7f95]">{scopeLabel}</p>
          <h3 className="text-base font-semibold tracking-[-0.02em] text-[#152132]">WhatsApp connection</h3>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
          statusMeta.tone === 'success'
            ? 'border-[#ccead8] bg-[#f2fbf5] text-[#1f7a45]'
            : statusMeta.tone === 'warning'
              ? 'border-[#f3d9a8] bg-[#fff8ec] text-[#a16207]'
              : statusMeta.tone === 'error'
                ? 'border-[#f6d4d4] bg-[#fff5f5] text-[#b42318]'
                : 'border-[#d8e2ee] bg-[#f5f8fb] text-[#55657b]'
        }`}>
          <StatusIcon className={statusMeta.icon === Loader2 ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          {statusMeta.label}
        </span>
      </div>

      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Phone number</dt>
          <dd className="text-sm font-medium text-[#162334]">{phoneNumber || 'Not synced yet'}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">WABA</dt>
          <dd className="text-sm font-medium text-[#162334]">{normalizeText(connection.wabaId || connection.waba_id) || 'Not synced yet'}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Business name</dt>
          <dd className="text-sm font-medium text-[#162334]">{businessName || 'Not synced yet'}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Verification</dt>
          <dd className="text-sm font-medium text-[#162334]">{verificationStatus || 'Not synced yet'}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Connected at</dt>
          <dd className="text-sm font-medium text-[#162334]">{connectedAt}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Last updated</dt>
          <dd className="text-sm font-medium text-[#162334]">{updatedAt}</dd>
        </div>
      </dl>

      {lastError ? (
        <p className="mt-4 rounded-[12px] border border-[#f6d4d4] bg-[#fff5f5] px-4 py-3 text-sm leading-6 text-[#b42318]">
          {lastError}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onReconnect} disabled={reconnecting}>
          {reconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Reconnect
        </Button>
        <Button variant="ghost" onClick={onDisconnect} disabled={disconnecting}>
          <X className="h-4 w-4" />
          Disconnect
        </Button>
      </div>
    </article>
  )
}

export default function SettingsWhatsAppPage() {
  const { organisation, onboarding } = useOrganisation()
  const { role, currentWorkspace, currentMembership, organisationMembershipRole, workspaceType } = useWorkspace()
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const membershipRole = normalizeOrganisationMembershipRole(organisationMembershipRole || currentMembership?.role || 'viewer', {
    appRole: role,
    workspaceType: resolvedWorkspaceType,
  })
  const canManage = canManageOrganisationSettings({
    appRole: role,
    membershipRole,
    workspaceType: resolvedWorkspaceType,
  })
  const organisationId = normalizeText(currentWorkspace?.id || organisation?.id)
  const organisationName = normalizeText(currentWorkspace?.name || organisation?.displayName || organisation?.name || 'Organisation')
  const branchRows = useMemo(
    () => (Array.isArray(onboarding?.branchStructure?.branches) ? onboarding.branchStructure.branches : []),
    [onboarding?.branchStructure?.branches],
  )
  const branches = useMemo(
    () => branchRows
      .map((branch) => ({
        ...branch,
        id: getBranchId(branch),
        label: getBranchLabel(branch),
      }))
      .filter((branch) => branch.id || branch.label),
    [branchRows],
  )
  const branchNameMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.label])), [branches])
  const currentBranchId = normalizeText(
    currentMembership?.branchId ||
      currentMembership?.branch_id ||
      currentMembership?.primaryBranchId ||
      currentMembership?.primary_branch_id,
  )
  const canManageAllScopes = ['owner', 'super_admin', 'principal', 'admin', 'developer'].includes(membershipRole)
  const scopeOptions = useMemo(() => {
    const options = []
    if (canManageAllScopes) {
      options.push({
        value: '',
        label: organisationName ? `${organisationName} default` : 'Agency default',
      })
    }

    const visibleBranches = canManageAllScopes
      ? branches
      : branches.filter((branch) => !currentBranchId || branch.id === currentBranchId)

    visibleBranches.forEach((branch) => {
      options.push({
        value: branch.id,
        label: branch.label,
      })
    })

    if (!options.length && currentBranchId) {
      options.push({
        value: currentBranchId,
        label: branchNameMap.get(currentBranchId) || 'Your branch',
      })
    }

    return options
  }, [branchNameMap, branches, canManageAllScopes, currentBranchId, organisationName])
  const defaultScopeId = scopeOptions[0]?.value || ''
  const [selectedScopeId, setSelectedScopeId] = useState(defaultScopeId)
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [statusTone, setStatusTone] = useState('success')
  const [selectedConnectionAction, setSelectedConnectionAction] = useState('')
  const [error, setError] = useState('')
  const [sdkStatus, setSdkStatus] = useState('idle')

  useEffect(() => {
    if (!scopeOptions.length) return
    if (scopeOptions.some((option) => option.value === selectedScopeId)) return
    setSelectedScopeId(defaultScopeId)
  }, [defaultScopeId, scopeOptions, selectedScopeId])

  useEffect(() => {
    if (!organisationId) return
    let active = true

    async function loadConnections() {
      try {
        setLoading(true)
        setError('')
        const rows = await listWhatsAppConnections({ organisationId })
        if (!active) return
        setConnections(rows)
      } catch (loadError) {
        if (!active) return
        setConnections([])
        setError(loadError?.message || 'Unable to load WhatsApp connections.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadConnections()
    return () => {
      active = false
    }
  }, [organisationId])

  const visibleConnections = useMemo(() => {
    if (canManageAllScopes) return connections
    if (!currentBranchId) {
      return connections.filter((connection) => !normalizeText(connection.branchId || connection.branch_id))
    }
    return connections.filter((connection) => {
      const branchId = normalizeText(connection.branchId || connection.branch_id)
      return !branchId || branchId === currentBranchId
    })
  }, [canManageAllScopes, connections, currentBranchId])

  const connectionByScope = useMemo(() => {
    const entries = visibleConnections.map((connection) => [getConnectionScopeKey(connection), connection])
    return new Map(entries)
  }, [visibleConnections])

  const selectedConnection = connectionByScope.get(getScopeKey(selectedScopeId)) || null
  const selectedScopeLabel = getScopeLabel(selectedScopeId, branchNameMap, organisationName)

  async function refreshConnections() {
    if (!organisationId) return
    setRefreshing(true)
    try {
      setError('')
      const rows = await listWhatsAppConnections({ organisationId })
      setConnections(rows)
    } catch (loadError) {
      setError(loadError?.message || 'Unable to refresh WhatsApp connections.')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleLaunchSignup(scopeId = selectedScopeId) {
    if (!organisationId) {
      setError('Missing organisation context.')
      return
    }
    const targetScopeId = normalizeText(scopeId)
    const targetScopeLabel = getScopeLabel(targetScopeId, branchNameMap, organisationName)

    try {
      setSaving(true)
      setSdkStatus('loading')
      setError('')
      setStatusMessage('')
      const signupResult = await launchEmbeddedSignup()
      setSdkStatus('ready')
      await connectWhatsAppChannel({
        organisationId,
        branchId: targetScopeId || null,
        code: signupResult.code,
        wabaId: signupResult.wabaId,
        phoneNumberId: signupResult.phoneNumberId,
        displayPhoneNumber: signupResult.displayPhoneNumber,
        businessDisplayName: signupResult.businessDisplayName,
        metaBusinessId: signupResult.metaBusinessId,
        signupVersion: 'v4',
      })
      setStatusTone('success')
      setStatusMessage(`Connected WhatsApp for ${targetScopeLabel}.`)
      await refreshConnections()
    } catch (connectError) {
      setStatusTone('error')
      setStatusMessage(connectError?.message || 'Unable to complete the WhatsApp signup flow.')
      setError(connectError?.message || 'Unable to complete the WhatsApp signup flow.')
    } finally {
      setSdkStatus('ready')
      setSaving(false)
    }
  }

  async function handleDisconnect(connection) {
    const scopeLabel = getScopeLabel(getConnectionScopeKey(connection), branchNameMap, organisationName)
    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(`Disconnect the WhatsApp connection for ${scopeLabel}?`)
    if (!confirmed) return

    try {
      setSelectedConnectionAction(connection.id)
      setError('')
      await disconnectWhatsAppChannel({
        organisationId,
        connectionId: connection.id,
      })
      setStatusTone('success')
      setStatusMessage(`Disconnected WhatsApp for ${scopeLabel}.`)
      await refreshConnections()
    } catch (disconnectError) {
      setStatusTone('error')
      setStatusMessage(disconnectError?.message || 'Unable to disconnect the WhatsApp channel.')
      setError(disconnectError?.message || 'Unable to disconnect the WhatsApp channel.')
    } finally {
      setSelectedConnectionAction('')
    }
  }

  const selectedScopeConnectionStatus = selectedConnection ? getConnectionStatusMeta(selectedConnection.connectionStatus) : null

  if (!canManage) {
    return (
      <div className={settingsPageClass}>
        <SettingsPageHeader
          kicker="Integrations"
          title="WhatsApp"
          description="Embedded signup and webhook routing for the current workspace."
        />
        <SettingsBanner tone="warning">
          WhatsApp integration settings are restricted to workspace administrators and branch managers.
        </SettingsBanner>
      </div>
    )
  }

  if (loading && !connections.length) {
    return <SettingsLoadingState label="Loading WhatsApp integration…" />
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Integrations"
        title="WhatsApp"
        description="Connect agency and branch-level WhatsApp Business accounts with Meta embedded signup."
        actions={(
          <Button variant="secondary" onClick={() => void refreshConnections()} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Refresh
          </Button>
        )}
      />

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {statusMessage ? <SettingsBanner tone={statusTone === 'error' ? 'error' : 'success'}>{statusMessage}</SettingsBanner> : null}
      {sdkStatus === 'loading' ? (
        <SettingsBanner tone="warning">Launching Meta embedded signup. Complete the Facebook login popup to finish connecting WhatsApp.</SettingsBanner>
      ) : null}

      <SettingsSectionCard
        title="Connection scope"
        description="Choose whether you are connecting the agency default number or a branch-specific number. Branch connections override the agency default for that branch."
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className={settingsFieldClass}>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#162334]">Scope</span>
              <Field as="select" value={selectedScopeId} onChange={(event) => setSelectedScopeId(event.target.value)}>
                {scopeOptions.map((option) => (
                  <option key={`${option.value || 'agency'}:${option.label}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Field>
            </label>
          </div>

          <div className={settingsActionRowClass}>
            <Button onClick={() => void handleLaunchSignup(selectedScopeId)} disabled={saving || !scopeOptions.length}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareMore className="h-4 w-4" />}
              Launch embedded signup
            </Button>
          </div>
        </div>

        <div className="grid gap-3 rounded-[16px] border border-[#dfe7ee] bg-[#f9fbfe] p-4 md:grid-cols-3">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Selected scope</p>
            <p className="mt-1 text-sm font-semibold text-[#162334]">{selectedScopeLabel}</p>
          </div>
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Current status</p>
            <p className="mt-1 text-sm font-semibold text-[#162334]">
              {selectedScopeConnectionStatus?.label || 'Not connected'}
            </p>
          </div>
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Branch override</p>
            <p className="mt-1 text-sm font-medium text-[#51657b]">
              Branch numbers take priority over the agency default for matching messages and webhook routing.
            </p>
          </div>
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Connected channels"
        description="Review the WhatsApp numbers registered for this workspace and manage each scope individually."
      >
        {visibleConnections.length ? (
          <div className={settingsGridClass}>
            {visibleConnections.map((connection) => {
              const scopeLabel = getScopeLabel(getConnectionScopeKey(connection), branchNameMap, organisationName)
              const isDisconnecting = selectedConnectionAction === connection.id
              return (
                <ConnectionCard
                  key={connection.id}
                  connection={connection}
                  scopeLabel={scopeLabel}
                  disconnecting={isDisconnecting}
                  reconnecting={saving}
                  onReconnect={() => void handleLaunchSignup(connection.branchId || connection.branch_id || '')}
                  onDisconnect={() => void handleDisconnect(connection)}
                />
              )
            })}
          </div>
        ) : (
          <SettingsEmptyState
            title="No WhatsApp connections yet"
            description="Launch embedded signup to connect the first WhatsApp Business number for this organisation or branch."
            action={(
              <Button onClick={() => void handleLaunchSignup(selectedScopeId)} disabled={saving || !scopeOptions.length}>
                <MessageSquareMore className="h-4 w-4" />
                Launch embedded signup
              </Button>
            )}
          />
        )}
      </SettingsSectionCard>

      <SettingsSectionCard
        title="How the flow works"
        description="This keeps the existing webhook path, stores tokens securely in Vault, and respects branch overrides."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              title: 'Secure token storage',
              body: 'The exchangeable code is redeemed server-side and the resulting access token is stored in Vault instead of plain text.',
            },
            {
              icon: Smartphone,
              title: 'Meta embedded signup',
              body: 'The Facebook JavaScript SDK opens the WhatsApp signup flow and listens for the WA_EMBEDDED_SIGNUP postMessage from Facebook.',
            },
            {
              icon: CheckCircle2,
              title: 'Multi-tenant routing',
              body: 'Branch-specific connections override the agency default, and the existing webhook continues routing by phone number ID.',
            },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div key={item.title} className="rounded-[16px] border border-[#dfe7ee] bg-[#fbfdff] p-4">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef7f2] text-[#0f7f4f]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-[#162334]">{item.title}</h4>
                    <p className="text-sm leading-6 text-[#61748a]">{item.body}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Routing snapshot"
        description="The current scope connection is what the send and webhook functions will pick up."
      >
        <div className={settingsTableClass}>
          <table className="min-w-full divide-y divide-[#e6edf4]">
            <thead className="bg-[#f9fbfe]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[#6d7f95]">Scope</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[#6d7f95]">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[#6d7f95]">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[#6d7f95]">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f7] bg-white">
              {visibleConnections.map((connection) => {
                const scopeLabel = getScopeLabel(getConnectionScopeKey(connection), branchNameMap, organisationName)
                const statusMeta = getConnectionStatusMeta(connection.connectionStatus)
                return (
                  <tr key={connection.id}>
                    <td className="px-4 py-3 text-sm font-semibold text-[#162334]">{scopeLabel}</td>
                    <td className="px-4 py-3 text-sm text-[#51657b]">{statusMeta.label}</td>
                    <td className="px-4 py-3 text-sm text-[#51657b]">{normalizeText(connection.displayPhoneNumber || connection.display_phone_number) || 'Not synced yet'}</td>
                    <td className="px-4 py-3 text-sm text-[#51657b]">{formatDateTime(connection.updatedAt || connection.updated_at)}</td>
                  </tr>
                )
              })}
              {!visibleConnections.length ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-[#6b7d93]">
                    No connection snapshot available yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SettingsSectionCard>
    </div>
  )
}
