import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'

import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_PROFILE,
  buildSellerProcessProfileSettings,
  isKnownSellerProcessProfile,
  normalizeSellerProcessProfile,
  resolveSellerProcessProfile,
} from '../src/services/sellerProcessProfileService.js'

export const KINGSTON_SELLER_PROCESS_ORG_ID = 'ec19d0a6-bcba-4eef-aa72-9972de88204d'
export const KINGSTON_SELLER_PROCESS_TARGET_PROFILE = KINGSTONS_SELLER_PROCESS_PROFILE
export const KINGSTON_SELLER_PROCESS_SETTINGS_TABLE = 'organisation_settings'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function envText(...names) {
  for (const name of names) {
    const value = normalizeText(process.env[name])
    if (value) return value.replace(/\/+$/, '')
  }
  return ''
}

function argValue(argv, name, fallback = '') {
  const prefix = `${name}=`
  const inline = argv.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] || fallback : fallback
}

function pushBlocker(blockers, code, detail = '') {
  blockers.push(detail ? { code, detail } : { code })
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

export function parseKingstonSellerProcessProfileConfigurationArgs(argv = process.argv.slice(2)) {
  return {
    apply: argv.includes('--apply'),
    organisationId:
      argValue(argv, '--organisation-id') ||
      argValue(argv, '--organization-id') ||
      argValue(argv, '--org-id') ||
      KINGSTON_SELLER_PROCESS_ORG_ID,
    confirmOrgId: argValue(argv, '--confirm-org-id') || argValue(argv, '--confirm-organisation-id'),
    profile: argValue(argv, '--profile') || KINGSTON_SELLER_PROCESS_TARGET_PROFILE,
  }
}

export function buildKingstonSellerProcessProfileConfigurationPlan(options = {}) {
  const apply = options.apply === true
  const organisationId = normalizeText(options.organisationId || options.organizationId || options.orgId || KINGSTON_SELLER_PROCESS_ORG_ID)
  const confirmOrgId = normalizeText(options.confirmOrgId || options.confirmOrganisationId)
  const requestedProfile = normalizeText(options.profile || KINGSTON_SELLER_PROCESS_TARGET_PROFILE)
  const normalizedProfile = isKnownSellerProcessProfile(requestedProfile)
    ? normalizeSellerProcessProfile(requestedProfile)
    : requestedProfile
  const existingSettings = isObject(options.existingSettings) ? options.existingSettings : {}
  const blockers = []

  if (organisationId !== KINGSTON_SELLER_PROCESS_ORG_ID) {
    pushBlocker(
      blockers,
      'KINGSTON_SELLER_PROCESS_ORG_SCOPE_MISMATCH',
      `Expected ${KINGSTON_SELLER_PROCESS_ORG_ID}. Received ${organisationId || 'missing'}.`,
    )
  }

  if (normalizedProfile !== KINGSTON_SELLER_PROCESS_TARGET_PROFILE) {
    pushBlocker(
      blockers,
      'KINGSTON_SELLER_PROCESS_PROFILE_SCOPE_MISMATCH',
      `Expected ${KINGSTON_SELLER_PROCESS_TARGET_PROFILE}. Received ${requestedProfile || 'missing'}.`,
    )
  }

  if (apply && confirmOrgId !== KINGSTON_SELLER_PROCESS_ORG_ID) {
    pushBlocker(
      blockers,
      'KINGSTON_SELLER_PROCESS_CONFIRMATION_REQUIRED',
      `Apply requires --confirm-org-id=${KINGSTON_SELLER_PROCESS_ORG_ID}.`,
    )
  }

  if (confirmOrgId && confirmOrgId !== organisationId) {
    pushBlocker(
      blockers,
      'KINGSTON_SELLER_PROCESS_CONFIRMATION_MISMATCH',
      'The confirmation org id must match the target org id.',
    )
  }

  let mergedSettings = existingSettings
  try {
    mergedSettings = buildSellerProcessProfileSettings(existingSettings, {
      sellerProcessProfile: KINGSTON_SELLER_PROCESS_TARGET_PROFILE,
    })
  } catch (error) {
    pushBlocker(blockers, 'KINGSTON_SELLER_PROCESS_SETTINGS_MERGE_FAILED', error.message)
  }

  const currentProfile = resolveSellerProcessProfile({ organisationSettings: existingSettings }).profile
  const nextProfile = resolveSellerProcessProfile({ organisationSettings: mergedSettings }).profile
  const settingsChanged = stableJson(existingSettings) !== stableJson(mergedSettings)
  const canWrite = apply && blockers.length === 0

  return Object.freeze({
    phase: 'seller-process-phase8-kingston-org-configuration',
    mode: apply ? 'apply' : 'dry_run',
    apply,
    canWrite,
    target: Object.freeze({
      organisationId,
      allowedOrganisationId: KINGSTON_SELLER_PROCESS_ORG_ID,
      profile: KINGSTON_SELLER_PROCESS_TARGET_PROFILE,
      settingsTable: KINGSTON_SELLER_PROCESS_SETTINGS_TABLE,
    }),
    currentProfile: currentProfile || DEFAULT_SELLER_PROCESS_PROFILE,
    nextProfile,
    settingsChanged,
    mergedSettings,
    preservedTopLevelSettingsKeys: Object.freeze(
      Object.keys(existingSettings).filter((key) => key !== 'sellerProcess' && key !== 'seller_process').sort(),
    ),
    blockers: Object.freeze(blockers),
  })
}

export function assertKingstonSellerProcessProfileConfigurationCanApply(plan) {
  if (!plan?.apply) {
    throw new Error('Refusing to write Kingston seller process configuration without --apply.')
  }
  if (plan.blockers?.length) {
    throw new Error(`Refusing to write Kingston seller process configuration: ${plan.blockers[0].code}.`)
  }
  if (plan.canWrite !== true) {
    throw new Error('Refusing to write Kingston seller process configuration because the write guard is closed.')
  }
}

export function summarizeKingstonSellerProcessProfileConfigurationPlan(plan, extra = {}) {
  return {
    phase: plan.phase,
    mode: plan.mode,
    applied: extra.applied === true,
    canWrite: plan.canWrite,
    target: plan.target,
    currentProfile: plan.currentProfile,
    nextProfile: plan.nextProfile,
    settingsChanged: plan.settingsChanged,
    preservedTopLevelSettingsKeys: plan.preservedTopLevelSettingsKeys,
    blockers: plan.blockers,
  }
}

async function fetchExistingSettings(client, organisationId) {
  const [organisationResult, settingsResult] = await Promise.all([
    client.from('organisations').select('id, type, status').eq('id', organisationId).maybeSingle(),
    client
      .from(KINGSTON_SELLER_PROCESS_SETTINGS_TABLE)
      .select('settings_json')
      .eq('organisation_id', organisationId)
      .maybeSingle(),
  ])

  if (organisationResult.error) throw organisationResult.error
  if (settingsResult.error) throw settingsResult.error
  if (!organisationResult.data?.id) {
    throw new Error(`Kingston organisation ${organisationId} was not found.`)
  }

  return {
    organisation: organisationResult.data,
    settings: isObject(settingsResult.data?.settings_json) ? settingsResult.data.settings_json : {},
  }
}

export async function runKingstonSellerProcessProfileConfiguration(options = {}) {
  const guardPlan = buildKingstonSellerProcessProfileConfigurationPlan(options)
  if (guardPlan.blockers.length) {
    if (guardPlan.apply) assertKingstonSellerProcessProfileConfigurationCanApply(guardPlan)
    return { applied: false, plan: guardPlan }
  }

  const supabaseUrl = envText('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const serviceRoleKey = envText('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { settings } = await fetchExistingSettings(client, options.organisationId || KINGSTON_SELLER_PROCESS_ORG_ID)
  const plan = buildKingstonSellerProcessProfileConfigurationPlan({
    ...options,
    existingSettings: settings,
  })

  if (!plan.apply) {
    return { applied: false, plan }
  }

  assertKingstonSellerProcessProfileConfigurationCanApply(plan)
  const saveResult = await client
    .from(KINGSTON_SELLER_PROCESS_SETTINGS_TABLE)
    .upsert(
      {
        organisation_id: KINGSTON_SELLER_PROCESS_ORG_ID,
        settings_json: plan.mergedSettings,
      },
      { onConflict: 'organisation_id' },
    )
    .select('settings_json')
    .single()

  if (saveResult.error) throw saveResult.error
  return { applied: true, plan }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const options = parseKingstonSellerProcessProfileConfigurationArgs()
  runKingstonSellerProcessProfileConfiguration(options)
    .then((result) => {
      console.log(JSON.stringify(summarizeKingstonSellerProcessProfileConfigurationPlan(result.plan, result), null, 2))
      if (result.plan.blockers.length) process.exitCode = 1
    })
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
