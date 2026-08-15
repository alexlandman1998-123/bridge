import { inferLeadCategoryFromRecord } from '../lib/leadCategory.js'
import {
  BUYER_PROCESS_STAGE_KEYS,
  getBuyerProcessStage,
  normalizeBuyerProcessStageKey,
} from './buyerProcessDefinitionService.js'

export const BUYER_PROCESS_MIGRATION_VERSION = 'buyer_process_phase6_otp_deprecation_v1'
export const BUYER_OTP_DEPRECATION_NOTICE = 'OTP generation is deprecated for buyer leads. Capture buyer onboarding first, then upload the signed OTP and move the buyer through Offer.'

const DEPRECATED_BUYER_OTP_STAGE_KEYS = new Set([
  'ready_to_generate_otp',
  'otp_ready',
  'ready_for_otp_generation',
  'otp_generated',
  'generated_otp',
  'buyer_signed',
  'purchaser_signed',
  'agent_signed',
  'principal_signed',
  'sent_to_seller',
  'seller_signed',
  'signed_by_all_parties',
  'deal_created',
  'finance',
  'transfer',
  'registered',
])

const DEPRECATED_BUYER_OTP_ACTION_TOKENS = [
  'generate_otp',
  'generate_and_send_otp',
  'send_otp',
  'prepare_otp',
  'otp_quick_start',
]

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeToken(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\+/g, ' and ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function resolveCanonicalStage(value = '') {
  const stageKey = normalizeBuyerProcessStageKey(value, '')
  if (!stageKey) return null
  const stage = getBuyerProcessStage(stageKey)
  return {
    key: stageKey,
    label: stage?.label || getBuyerProcessStage(BUYER_PROCESS_STAGE_KEYS.captured).label,
  }
}

export function isDeprecatedBuyerOtpStage(value = '') {
  return DEPRECATED_BUYER_OTP_STAGE_KEYS.has(normalizeToken(value))
}

export function isDeprecatedBuyerOtpAction(value = '') {
  const token = normalizeToken(value)
  return DEPRECATED_BUYER_OTP_ACTION_TOKENS.some((deprecatedToken) => token.includes(deprecatedToken))
}

export function resolveBuyerProcessStageMigration(lead = {}) {
  if (inferLeadCategoryFromRecord(lead, 'other') !== 'buyer') {
    return {
      migrated: false,
      reason: 'not_buyer',
      stageKey: '',
      stageLabel: normalizeText(lead?.stage || lead?.status),
      deprecatedOtpStage: false,
    }
  }

  const rawStage = normalizeText(lead?.stage || lead?.status)
  const rawStatus = normalizeText(lead?.status)
  const canonicalStage = resolveCanonicalStage(rawStage)
  if (!canonicalStage) {
    return {
      migrated: false,
      reason: 'unknown_stage',
      stageKey: '',
      stageLabel: rawStage,
      deprecatedOtpStage: false,
    }
  }

  const canonicalStatus = resolveCanonicalStage(rawStatus)
  const stageChanged = rawStage !== canonicalStage.label
  const statusChanged = Boolean(canonicalStatus && rawStatus !== canonicalStatus.label)
  const deprecatedOtpStage = isDeprecatedBuyerOtpStage(rawStage) || isDeprecatedBuyerOtpStage(rawStatus)

  return {
    migrated: stageChanged || statusChanged || deprecatedOtpStage,
    reason: stageChanged || statusChanged
      ? 'canonical_stage_alias'
      : deprecatedOtpStage
        ? 'deprecated_otp_stage'
        : 'already_canonical',
    stageKey: canonicalStage.key,
    stageLabel: canonicalStage.label,
    statusLabel: canonicalStatus?.label || rawStatus || canonicalStage.label,
    previousStage: stageChanged ? rawStage : normalizeText(lead?.legacyBuyerProcessStage || lead?.legacy_buyer_process_stage),
    previousStatus: statusChanged ? rawStatus : normalizeText(lead?.legacyBuyerProcessStatus || lead?.legacy_buyer_process_status),
    deprecatedOtpStage,
  }
}

export function migrateBuyerProcessLeadRecord(lead = {}) {
  const migration = resolveBuyerProcessStageMigration(lead)
  if (migration.reason === 'not_buyer' || migration.reason === 'unknown_stage') return { ...lead }

  return {
    ...lead,
    stage: migration.stageLabel,
    status: migration.statusLabel,
    buyerProcessStageKey: migration.stageKey,
    buyerProcessMigrationVersion: migration.migrated
      ? BUYER_PROCESS_MIGRATION_VERSION
      : normalizeText(lead?.buyerProcessMigrationVersion || lead?.buyer_process_migration_version),
    buyerProcessOtpDeprecated: Boolean(migration.deprecatedOtpStage || lead?.buyerProcessOtpDeprecated || lead?.buyer_process_otp_deprecated),
    legacyBuyerProcessStage: migration.previousStage,
    legacyBuyerProcessStatus: migration.previousStatus,
  }
}
