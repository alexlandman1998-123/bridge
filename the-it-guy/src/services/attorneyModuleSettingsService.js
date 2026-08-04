import {
  buildAttorneyModuleSettingsPatch,
  DEFAULT_ATTORNEY_MODULE_SETTINGS,
  resolveAttorneyModuleSettings,
} from '../lib/attorneyModuleSettings'
import {
  isMissingTableError,
  isPermissionDeniedError,
  normalizeText,
  requireClient,
} from './attorneyFirmServiceShared'
import { getCurrentUserPrimaryAttorneyFirm } from './attorneyFirms'

export const ATTORNEY_MODULE_SETTINGS_UPDATED_EVENT = 'itg:attorney-module-settings-updated'

let pendingCurrentSettingsFetch = null

function safeJson(value, fallback = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...fallback }
  return value
}

async function resolveCurrentAttorneyFirm(firm = null) {
  if (firm?.id) return firm
  return getCurrentUserPrimaryAttorneyFirm()
}

async function loadCurrentAttorneyModuleSettings({ firm = null } = {}) {
  const client = requireClient()
  const currentFirm = await resolveCurrentAttorneyFirm(firm)
  const organisationId = normalizeText(currentFirm?.organisationId || currentFirm?.organisation_id)

  if (!currentFirm?.id || !organisationId) {
    return {
      firm: currentFirm || null,
      organisationId,
      modules: { ...DEFAULT_ATTORNEY_MODULE_SETTINGS },
      settingsJson: {},
      persisted: false,
    }
  }

  const query = await client
    .from('organisation_settings')
    .select('settings_json')
    .eq('organisation_id', organisationId)
    .maybeSingle()

  if (query.error) {
    if (isMissingTableError(query.error, 'organisation_settings') || isPermissionDeniedError(query.error)) {
      return {
        firm: currentFirm,
        organisationId,
        modules: { ...DEFAULT_ATTORNEY_MODULE_SETTINGS },
        settingsJson: {},
        persisted: false,
      }
    }
    throw query.error
  }

  const settingsJson = safeJson(query.data?.settings_json)
  return {
    firm: currentFirm,
    organisationId,
    modules: resolveAttorneyModuleSettings(settingsJson),
    settingsJson,
    persisted: Boolean(query.data),
  }
}

export async function fetchCurrentAttorneyModuleSettings({ firm = null } = {}) {
  if (firm?.id) return loadCurrentAttorneyModuleSettings({ firm })
  if (pendingCurrentSettingsFetch) return pendingCurrentSettingsFetch
  pendingCurrentSettingsFetch = loadCurrentAttorneyModuleSettings({ firm })
    .finally(() => {
      pendingCurrentSettingsFetch = null
    })
  return pendingCurrentSettingsFetch
}

export async function updateCurrentAttorneyModuleSettings(modules = {}, { firm = null } = {}) {
  const client = requireClient()
  const current = await fetchCurrentAttorneyModuleSettings({ firm })
  if (!current.organisationId) {
    throw new Error('Attorney firm organisation settings are not ready yet.')
  }

  const nextSettingsJson = buildAttorneyModuleSettingsPatch(current.settingsJson, modules)
  const save = await client
    .from('organisation_settings')
    .upsert(
      {
        organisation_id: current.organisationId,
        settings_json: nextSettingsJson,
      },
      { onConflict: 'organisation_id' },
    )
    .select('settings_json')
    .single()

  if (save.error) {
    if (isMissingTableError(save.error, 'organisation_settings')) {
      throw new Error('Organisation settings are not available. Apply the attorney module settings migration.')
    }
    throw save.error
  }

  const settingsJson = safeJson(save.data?.settings_json, nextSettingsJson)
  const result = {
    ...current,
    modules: resolveAttorneyModuleSettings(settingsJson),
    settingsJson,
    persisted: true,
  }
  pendingCurrentSettingsFetch = null

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ATTORNEY_MODULE_SETTINGS_UPDATED_EVENT, { detail: result }))
  }

  return result
}
