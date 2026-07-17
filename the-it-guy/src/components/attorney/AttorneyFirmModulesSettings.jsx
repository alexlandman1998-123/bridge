import { Activity, AlertTriangle, CheckCircle2, History, Landmark, LoaderCircle, Scale, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAttorneyModules } from '../../context/AttorneyModulesContext.jsx'
import { FEATURE_FLAGS } from '../../lib/featureFlags.js'
import {
  getAttorneyFirmModuleHistory,
  getAttorneyFirmModuleLifecycleAssurance,
  getAttorneyFirmModuleOverview,
  getAttorneyFirmModulesLaunchMetrics,
  setAttorneyFirmModuleStatus,
} from '../../services/attorneyFirmModulesService.js'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'

const MODULE_ICONS = Object.freeze({
  transfer: Scale,
  bond: Landmark,
  cancellation: ShieldAlert,
})

const STATUS_PRESENTATION = Object.freeze({
  active: {
    label: 'Active',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  winding_down: {
    label: 'Winding down',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  inactive: {
    label: 'Inactive',
    className: 'border-slate-200 bg-slate-100 text-slate-600',
  },
})

function formatTransitionDate(value) {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function ModuleLifecycleHistory({ history }) {
  return (
    <div className="grid gap-3" aria-label="Service module change history">
      {history.length ? history.map((event) => {
        const status = STATUS_PRESENTATION[event.newStatus] || STATUS_PRESENTATION.inactive
        const isBaseline = event.changeSource === 'baseline'
        return (
          <article key={event.id || `${event.moduleKey}-${event.changedAt}`} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-slate-900">{event.definition?.label || event.moduleKey}</p>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold ${status.className}`}>
                  {status.label}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {isBaseline
                  ? 'Lifecycle baseline recorded.'
                  : `Changed from ${STATUS_PRESENTATION[event.previousStatus]?.label || 'unconfigured'} by ${event.changedByName}.`}
              </p>
            </div>
            <div className="shrink-0 text-left text-xs text-slate-500 sm:text-right">
              <p>{formatTransitionDate(event.changedAt)}</p>
              <p className="mt-1">{event.openMatterCount} open at transition</p>
            </div>
          </article>
        )
      }) : (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No service status changes have been recorded yet.
        </p>
      )}
    </div>
  )
}

function getTransition(module = {}) {
  if (module.status === 'inactive') {
    return {
      targetStatus: 'active',
      title: `Activate ${module.definition?.label || 'service'}?`,
      description: 'This service will become operational and the firm will be able to accept new matters in this workflow.',
      confirmLabel: 'Activate service',
      variant: 'default',
    }
  }

  if (module.status === 'winding_down' && module.openMatterCount === 0) {
    return {
      targetStatus: 'inactive',
      title: `Finish deactivating ${module.definition?.label || 'service'}?`,
      description: 'There are no open matters in this workflow. The service can now be removed from the firm’s operational catalogue.',
      confirmLabel: 'Deactivate service',
      variant: 'destructive',
    }
  }

  if (module.status === 'winding_down') {
    return {
      targetStatus: 'active',
      title: `Reactivate ${module.definition?.label || 'service'}?`,
      description: 'The firm will resume accepting new matters in this workflow.',
      confirmLabel: 'Resume service',
      variant: 'default',
    }
  }

  const hasOpenMatters = module.openMatterCount > 0
  return {
    targetStatus: hasOpenMatters ? 'winding_down' : 'inactive',
    title: `${hasOpenMatters ? 'Wind down' : 'Deactivate'} ${module.definition?.label || 'service'}?`,
    description: hasOpenMatters
      ? `This service has ${module.openMatterCount} open matter${module.openMatterCount === 1 ? '' : 's'}. New work will stop immediately, while existing matters remain operational until completed.`
      : 'The firm will stop accepting new work in this workflow. Historical matters and configuration will be retained.',
    confirmLabel: hasOpenMatters ? 'Start wind-down' : 'Deactivate service',
    variant: 'destructive',
  }
}

function ModuleCard({ module, canManage, saving, onRequestTransition }) {
  const Icon = MODULE_ICONS[module.moduleKey] || Scale
  const status = STATUS_PRESENTATION[module.status] || STATUS_PRESENTATION.inactive
  const transition = getTransition(module)
  const isWindingDown = module.status === 'winding_down'

  return (
    <article className="grid min-w-0 gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#e9f2ef] text-[#155f4b]">
          <Icon size={21} aria-hidden="true" />
        </span>
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}>
          {status.label}
        </span>
      </div>

      <div className="min-w-0">
        <h3 className="text-base font-semibold text-slate-950">{module.definition?.label || module.moduleKey}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">{module.definition?.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
        <div>
          <p className="text-xs font-medium text-slate-500">Open matters</p>
          <p className="mt-1 text-lg font-semibold text-slate-950">{module.openMatterCount}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">New instructions</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">{module.status === 'active' ? 'Accepted' : 'Stopped'}</p>
        </div>
      </div>

      {isWindingDown ? (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            {module.openMatterCount > 0
              ? 'Existing matters remain available. Full deactivation unlocks once the open count reaches zero.'
              : 'All open work is complete. This service is ready for full deactivation.'}
          </p>
        </div>
      ) : null}

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={module.status === 'active' || transition.targetStatus === 'inactive' ? 'ui-button ui-button-secondary' : 'ui-button ui-button-primary'}
            disabled={saving}
            onClick={() => onRequestTransition(module, transition)}
          >
            {saving ? <LoaderCircle size={16} className="animate-spin" /> : null}
            {saving ? 'Updating…' : transition.confirmLabel}
          </button>
          {isWindingDown && module.openMatterCount === 0 ? (
            <button
              type="button"
              className="ui-button ui-button-ghost"
              disabled={saving}
              onClick={() => onRequestTransition(module, getTransition({ ...module, status: 'inactive' }))}
            >
              Resume service
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function AttorneyFirmModulesSettings({ firmId }) {
  const attorneyModules = useAttorneyModules()
  const [overview, setOverview] = useState([])
  const [history, setHistory] = useState([])
  const [lifecycle, setLifecycle] = useState([])
  const [launchMetrics, setLaunchMetrics] = useState(null)
  const [launchMetricsError, setLaunchMetricsError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [savingKey, setSavingKey] = useState('')
  const [pending, setPending] = useState(null)

  const loadOverview = useCallback(async () => {
    if (!firmId) return []
    setLoading(true)
    setError('')
    setLaunchMetricsError('')
    try {
      const [modules, historyRows, lifecycleRows, metrics] = await Promise.all([
        getAttorneyFirmModuleOverview(firmId),
        FEATURE_FLAGS.enableAttorneyModuleLifecycleAssurance
          ? getAttorneyFirmModuleHistory(firmId, { limit: 12 })
          : Promise.resolve([]),
        FEATURE_FLAGS.enableAttorneyModuleLifecycleAssurance
          ? getAttorneyFirmModuleLifecycleAssurance(firmId)
          : Promise.resolve([]),
        FEATURE_FLAGS.enableAttorneyModuleLaunchTelemetry
          ? getAttorneyFirmModulesLaunchMetrics(firmId).catch((metricsError) => {
            setLaunchMetricsError(metricsError?.message || 'Launch telemetry is unavailable.')
            return null
          })
          : Promise.resolve(null),
      ])
      setOverview(modules)
      setHistory(historyRows)
      setLifecycle(lifecycleRows)
      setLaunchMetrics(metrics)
      return modules
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load service configuration.')
      return []
    } finally {
      setLoading(false)
    }
  }, [firmId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOverview()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadOverview])

  const canManage = Boolean(attorneyModules.canManageFirmModules)
  const operationalCount = useMemo(
    () => overview.filter((module) => module.status !== 'inactive').length,
    [overview],
  )
  const readyToDeactivate = useMemo(
    () => lifecycle.filter((module) => module.readyToDeactivate),
    [lifecycle],
  )

  async function handleConfirmTransition() {
    const module = pending?.module
    const transition = pending?.transition
    if (!module || !transition || !canManage) return

    setSavingKey(module.moduleKey)
    setError('')
    setSuccess('')
    try {
      await setAttorneyFirmModuleStatus(firmId, module.moduleKey, transition.targetStatus)
      await Promise.all([
        attorneyModules.refreshModules(),
        loadOverview(),
      ])
      setSuccess(`${module.definition?.label || 'Service'} updated successfully.`)
      setPending(null)
    } catch (updateError) {
      setError(updateError?.message || 'Unable to update this service.')
    } finally {
      setSavingKey('')
    }
  }

  return (
    <section className="panel card-tier-standard grid gap-5" aria-labelledby="attorney-services-heading">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-[#16634f]" aria-hidden="true" />
            <h2 id="attorney-services-heading" className="m-0 text-xl font-semibold text-slate-950">Services &amp; Workflows</h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Choose which conveyancing services the firm operates. This is separate from departments and individual permissions.
          </p>
        </div>
        {!loading ? (
          <span className="inline-flex shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
            {operationalCount} operational
          </span>
        ) : null}
      </div>

      {!canManage && !loading ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          You can view the firm’s service configuration, but only a firm administrator can change it.
        </p>
      ) : null}

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}

      {FEATURE_FLAGS.enableAttorneyModuleLifecycleAssurance && readyToDeactivate.length ? (
        <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Wind-down complete</p>
            <p className="mt-1 leading-5">
              {readyToDeactivate.map((module) => module.definition?.label || module.moduleKey).join(', ')} {readyToDeactivate.length === 1 ? 'has' : 'have'} no open matters and can now be deactivated.
            </p>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-600">
          <LoaderCircle size={18} className="mr-2 animate-spin" /> Loading firm services…
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {overview.map((module) => (
            <ModuleCard
              key={module.moduleKey}
              module={module}
              canManage={canManage}
              saving={savingKey === module.moduleKey}
              onRequestTransition={(selectedModule, transition) => setPending({ module: selectedModule, transition })}
            />
          ))}
        </div>
      )}

      {FEATURE_FLAGS.enableAttorneyModuleLifecycleAssurance && !loading ? (
        <div className="grid gap-3 border-t border-slate-200 pt-5">
          <div className="flex items-center gap-2">
            <History size={17} className="text-[#16634f]" aria-hidden="true" />
            <h3 className="m-0 text-base font-semibold text-slate-950">Recent service changes</h3>
          </div>
          <p className="-mt-2 text-sm text-slate-600">
            An immutable record of service activation, wind-down, and deactivation decisions.
          </p>
          <ModuleLifecycleHistory history={history} />
        </div>
      ) : null}

      {FEATURE_FLAGS.enableAttorneyModuleLaunchTelemetry && !loading ? (
        <div className="grid gap-3 border-t border-slate-200 pt-5" data-testid="attorney-module-launch-telemetry">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Activity size={17} className="text-[#16634f]" aria-hidden="true" />
                <h3 className="m-0 text-base font-semibold text-slate-950">Phase 8 launch telemetry</h3>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Aggregate lifecycle activity only. No firm IDs, matter IDs, client details, or user identities are exposed.
              </p>
            </div>
            {launchMetrics ? (
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                launchMetrics.status === 'HEALTHY'
                  ? STATUS_PRESENTATION.active.className
                  : launchMetrics.status === 'ATTENTION'
                    ? STATUS_PRESENTATION.winding_down.className
                    : 'border-red-200 bg-red-50 text-red-700'
              }`}>
                {launchMetrics.status === 'HEALTHY' ? 'Healthy' : launchMetrics.status === 'ATTENTION' ? 'Attention' : 'Blocked'} · {launchMetrics.windowHours}h
              </span>
            ) : null}
          </div>

          {launchMetricsError ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{launchMetricsError}</p>
          ) : null}

          {launchMetrics ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Transitions', launchMetrics.activity.transitions],
                  ['Wind-downs', launchMetrics.activity.windDownsStarted],
                  ['Deactivations', launchMetrics.activity.deactivations],
                  ['Reactivations', launchMetrics.activity.reactivations],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
              <p className={`rounded-xl p-3 text-sm ${
                launchMetrics.readiness.releaseReady
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-red-50 text-red-700'
              }`}>
                {launchMetrics.readiness.releaseReady
                  ? `Release gate passed with ${launchMetrics.readiness.moduleCount}/${launchMetrics.readiness.expectedModuleCount} canonical modules and all enforcement controls installed.`
                  : `Release gate blocked: ${launchMetrics.readiness.issueCodes.join(', ') || 'module integrity checks failed'}.`}
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.transition?.title || 'Update service?'}
        description={pending?.transition?.description || ''}
        confirmLabel={pending?.transition?.confirmLabel || 'Confirm'}
        variant={pending?.transition?.variant || 'default'}
        confirming={Boolean(savingKey)}
        onConfirm={() => void handleConfirmTransition()}
        onCancel={() => setPending(null)}
      />
    </section>
  )
}

export default AttorneyFirmModulesSettings
