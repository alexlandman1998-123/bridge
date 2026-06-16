import { isDemoLikeEnvironment } from '../config/productionValidation'
import { getUnsafeEnvironmentFlags } from '../lib/envValidation'
import { MOCK_DATA_ENABLED } from '../lib/mockData'

const COUNT_FORMATTER = new Intl.NumberFormat('en-ZA')
const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat('en-ZA', {
  numeric: 'auto',
})

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function truthyFlag(value) {
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalizeLower(value))
}

function humanizeToken(value = '') {
  return normalizeText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function toPercentWhole(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.round(numeric * 100)
}

function formatRelativeActivityTime(value, now = new Date()) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const diffMs = parsed.getTime() - now.getTime()
  const diffMinutes = Math.round(diffMs / (60 * 1000))
  const absMinutes = Math.abs(diffMinutes)
  if (absMinutes < 1) return 'Just now'
  if (absMinutes < 60) return RELATIVE_TIME_FORMATTER.format(diffMinutes, 'minute')
  const diffHours = Math.round(diffMs / (60 * 60 * 1000))
  const absHours = Math.abs(diffHours)
  if (absHours < 24) return RELATIVE_TIME_FORMATTER.format(diffHours, 'hour')
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000))
  return RELATIVE_TIME_FORMATTER.format(diffDays, 'day')
}

function createSparkline(values = []) {
  return values.map((value) => Number(value || 0)).filter((value) => Number.isFinite(value))
}

function toneFromActivity(item = {}) {
  const severity = normalizeLower(item.severity)
  const type = normalizeLower(item.type)
  if (severity === 'critical' || severity === 'danger') return 'red'
  if (severity === 'warning' || type.includes('invite')) return 'orange'
  if (type.includes('upload') || type.includes('document') || type.includes('signed')) return 'purple'
  if (type.includes('registration') || type.includes('joined') || type.includes('complete')) return 'green'
  return 'blue'
}

function cloneSnapshot(snapshot) {
  return {
    ...snapshot,
    platformHealth: { ...snapshot.platformHealth, sparkline: [...(snapshot.platformHealth?.sparkline || [])] },
    revenueMtd: { ...snapshot.revenueMtd, sparkline: [...(snapshot.revenueMtd?.sparkline || [])] },
    atAGlance: (snapshot.atAGlance || []).map((item) => ({ ...item })),
    liveActivity: (snapshot.liveActivity || []).map((item) => ({ ...item })),
  }
}

/**
 * @typedef {Object} MissionControlSnapshot
 * @property {{
 *   score: number | null,
 *   status: string,
 *   sparkline: number[],
 *   activeTransactions: number | null,
 *   activeTransactionsChangePct30d: number | null,
 *   registrations30d: number | null,
 *   registrations30dChangePct: number | null,
 *   attentionItems: number | null,
 *   criticalAttentionItems: number | null,
 * }} platformHealth
 * @property {{
 *   amount: number | null,
 *   forecast: number | null,
 *   changePct30d: number | null,
 *   sparkline: number[],
 * }} revenueMtd
 * @property {Array<{
 *   key: string,
 *   label: string,
 *   value: number | null,
 *   changePct30d: number | null,
 *   icon: string,
 *   tone: 'blue' | 'green' | 'purple' | 'orange' | 'red',
 * }>} atAGlance
 * @property {Array<{
 *   id: string,
 *   type: string,
 *   title: string,
 *   primaryText: string,
 *   secondaryText?: string,
 *   timestampLabel: string,
 *   tone: string,
 * }>} liveActivity
 * @property {number} alertsCount
 */

const unsafeFlags = getUnsafeEnvironmentFlags()
const importMetaEnv = import.meta.env || {}

export const MISSION_CONTROL_MOCKS_ENABLED = Boolean(
  unsafeFlags.enableMissionControlMocks ||
    MOCK_DATA_ENABLED ||
    (isDemoLikeEnvironment() &&
      (truthyFlag(importMetaEnv.VITE_ENABLE_MISSION_CONTROL_MOCKS) ||
        truthyFlag(importMetaEnv.VITE_ENABLE_MOCK_DATA) ||
        truthyFlag(importMetaEnv.VITE_ENABLE_DEMO_MODE))),
)

export const MISSION_CONTROL_MOCK_SNAPSHOT = Object.freeze({
  platformHealth: {
    score: 87,
    status: 'Healthy',
    sparkline: [58, 61, 56, 57, 60, 64, 63, 67, 69, 73, 72, 78],
    activeTransactions: 156,
    activeTransactionsChangePct30d: 18,
    registrations30d: 28,
    registrations30dChangePct: 27,
    attentionItems: 12,
    criticalAttentionItems: 3,
  },
  revenueMtd: {
    amount: 1240000,
    forecast: 1580000,
    changePct30d: 32,
    sparkline: [22, 24, 25, 28, 31, 35, 37, 39, 41, 45, 47, 49],
  },
  atAGlance: [
    { key: 'agencies', label: 'Agencies', value: 74, changePct30d: 12, icon: 'building', tone: 'purple' },
    { key: 'users', label: 'Users', value: 312, changePct30d: 18, icon: 'users', tone: 'blue' },
    { key: 'new_orgs', label: 'New Orgs', value: 16, changePct30d: 33, icon: 'bank', tone: 'green' },
    { key: 'web_leads', label: 'Web Leads', value: 89, changePct30d: 21, icon: 'trend', tone: 'orange' },
  ],
  liveActivity: [
    {
      id: 'registration-completed',
      type: 'registration_completed',
      title: 'Registration completed',
      primaryText: '17 Eagle Street, Benoni',
      secondaryText: 'Harcourts East Rand',
      timestampLabel: '2m ago',
      tone: 'green',
    },
    {
      id: 'otp-signed',
      type: 'otp_signed',
      title: 'OTP signed',
      primaryText: '42 Oak Avenue, Randburg',
      secondaryText: 'Fine & Country Northcliff',
      timestampLabel: '6m ago',
      tone: 'blue',
    },
    {
      id: 'document-uploaded',
      type: 'document_uploaded',
      title: 'Document uploaded',
      primaryText: 'Sale Agreement - 12 Main Road',
      secondaryText: 'Legacy Living Properties',
      timestampLabel: '11m ago',
      tone: 'purple',
    },
    {
      id: 'attorney-invited',
      type: 'attorney_invited',
      title: 'Attorney invited',
      primaryText: 'Jane Smith',
      secondaryText: 'Smith Attorneys',
      timestampLabel: '18m ago',
      tone: 'orange',
    },
    {
      id: 'agency-joined',
      type: 'agency_joined',
      title: 'New agency joined',
      primaryText: 'Sunset Properties',
      secondaryText: '',
      timestampLabel: '23m ago',
      tone: 'green',
    },
  ],
  alertsCount: 12,
})

export function getMissionControlMockSnapshot() {
  return cloneSnapshot(MISSION_CONTROL_MOCK_SNAPSHOT)
}

export function normalizeMissionControlSnapshot(liveSnapshot = null) {
  if (!liveSnapshot || typeof liveSnapshot !== 'object') return null

  const activeTransactions = toFiniteNumber(liveSnapshot?.summary?.activeTransactions)
  const registrations30d =
    toFiniteNumber(liveSnapshot?.executive?.registrationTrend?.registeredThisMonth) ??
    toFiniteNumber(liveSnapshot?.summary?.registeredToday)
  const attentionItems = toFiniteNumber(liveSnapshot?.attention?.total)
  const criticalAttentionItems = toFiniteNumber(liveSnapshot?.attention?.critical)
  const agencies = toFiniteNumber(liveSnapshot?.growth?.activeAgencies)
  const users = toFiniteNumber(liveSnapshot?.growth?.activeAgents)
  const newOrgs = toFiniteNumber(liveSnapshot?.growth?.newAgencySignups)
  const webLeads = toFiniteNumber(liveSnapshot?.growth?.websiteEnquiries)

  return {
    platformHealth: {
      score: toFiniteNumber(liveSnapshot?.executive?.platformHealthScore),
      status: humanizeToken(liveSnapshot?.executive?.healthStatus) || 'Live data',
      sparkline: createSparkline([]),
      activeTransactions,
      activeTransactionsChangePct30d: null,
      registrations30d,
      registrations30dChangePct: toPercentWhole(liveSnapshot?.executive?.registrationTrend?.percentageChange),
      attentionItems,
      criticalAttentionItems,
    },
    revenueMtd: {
      amount: toFiniteNumber(liveSnapshot?.executive?.revenue?.actualThisMonth),
      forecast: toFiniteNumber(liveSnapshot?.executive?.revenue?.forecastThisMonth),
      changePct30d: null,
      sparkline: createSparkline([]),
    },
    atAGlance: [
      { key: 'agencies', label: 'Agencies', value: agencies, changePct30d: toPercentWhole(liveSnapshot?.executive?.growthTrend?.percentageChange), icon: 'building', tone: 'purple' },
      { key: 'users', label: 'Users', value: users, changePct30d: null, icon: 'users', tone: 'blue' },
      { key: 'new_orgs', label: 'New Orgs', value: newOrgs, changePct30d: toPercentWhole(liveSnapshot?.executive?.growthTrend?.percentageChange), icon: 'bank', tone: 'green' },
      { key: 'web_leads', label: 'Web Leads', value: webLeads, changePct30d: null, icon: 'trend', tone: 'orange' },
    ],
    liveActivity: (liveSnapshot?.recentActivity || []).slice(0, 8).map((item, index) => ({
      id: normalizeText(item.id) || `activity-${index + 1}`,
      type: normalizeText(item.type) || 'activity',
      title: normalizeText(item.label) || humanizeToken(item.type || 'Activity'),
      primaryText: normalizeText(item.description) || humanizeToken(item.entityType || item.entityId || 'Platform update'),
      secondaryText: [normalizeText(item.organisationName), normalizeText(item.actorName)].filter(Boolean).join(' — '),
      timestampLabel: formatRelativeActivityTime(item.time),
      tone: toneFromActivity(item),
    })),
    alertsCount: Number(attentionItems || criticalAttentionItems || 0),
  }
}

export function hasMissionControlSnapshotData(snapshot = null) {
  if (!snapshot) return false
  return Boolean(
    snapshot.platformHealth?.score !== null ||
      snapshot.platformHealth?.activeTransactions !== null ||
      snapshot.platformHealth?.registrations30d !== null ||
      snapshot.revenueMtd?.amount !== null ||
      snapshot.revenueMtd?.forecast !== null ||
      snapshot.atAGlance?.some((item) => item.value !== null) ||
      snapshot.liveActivity?.length,
  )
}

export function shouldUseMissionControlMockSnapshot({ liveSnapshot = null, error = null } = {}) {
  if (!MISSION_CONTROL_MOCKS_ENABLED) return false
  if (error) return true
  const normalized = normalizeMissionControlSnapshot(liveSnapshot)
  return !hasMissionControlSnapshotData(normalized)
}

export function formatMissionControlCount(value) {
  const numeric = Number(value || 0)
  return COUNT_FORMATTER.format(Number.isFinite(numeric) ? numeric : 0)
}
