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

function normalizeToken(value = '') {
  return normalizeLower(value).replace(/[\s-]+/g, '_')
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

function cloneAdminMobileDashboard(snapshot) {
  return {
    ...snapshot,
    headline: { ...(snapshot.headline || {}) },
    networkHealth: { ...(snapshot.networkHealth || {}) },
    kpis: (snapshot.kpis || []).map((item) => ({ ...item })),
    attentionRequired: (snapshot.attentionRequired || []).map((item) => ({ ...item })),
    transactionDistribution: {
      ...(snapshot.transactionDistribution || {}),
      items: (snapshot.transactionDistribution?.items || []).map((item) => ({ ...item })),
    },
    averageRegistrationTime: { ...(snapshot.averageRegistrationTime || {}) },
    trends: {
      ranges: Object.fromEntries(
        Object.entries(snapshot.trends?.ranges || {}).map(([key, items]) => [
          key,
          (items || []).map((item) => ({
            ...item,
            data: (item.data || []).map((point) => ({ ...point })),
          })),
        ]),
      ),
    },
    recentActivity: (snapshot.recentActivity || []).map((item) => ({ ...item })),
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

export const ADMIN_MOBILE_DASHBOARD_MOCK = Object.freeze({
  generatedAt: new Date('2026-06-22T10:00:00.000Z').toISOString(),
  greetingName: 'Alex',
  headline: {
    value: 1247,
    label: 'Active Transactions',
    subtitle: 'Across the Arch9 ecosystem',
  },
  networkHealth: {
    score: 94,
    status: 'healthy',
    alertCount: 18,
  },
  kpis: [
    { key: 'activeTransactions', label: 'Active Transactions', value: 1247, changePct: 0.18, helper: 'Residential, bond and commercial activity', icon: 'transactions', tone: 'blue' },
    { key: 'registrationsThisMonth', label: 'Registrations This Month', value: 68, changePct: 0.12, helper: 'Registered transfers this month', icon: 'registrations', tone: 'green' },
    { key: 'revenueThisMonth', label: 'Revenue This Month', value: 1240000, valueType: 'currency', changePct: 0.09, helper: 'Recognised platform revenue', icon: 'revenue', tone: 'purple' },
    { key: 'activeOrganisations', label: 'Active Organisations', value: 142, changePct: 0.06, helper: 'Meaningful activity in the last 30 days', icon: 'organisations', tone: 'orange' },
  ],
  attentionRequired: [
    { key: 'stalledTransactions', label: 'Stalled Transactions', value: 7, helper: 'No meaningful progress for more than 7 days', severity: 'critical' },
    { key: 'inactiveOrganisations', label: 'Inactive Organisations', value: 4, helper: 'No login or platform activity for 30 days', severity: 'warning' },
    { key: 'failedInvites', label: 'Failed Invites', value: 5, helper: 'Failed, bounced, expired or stale pending invites', severity: 'warning' },
    { key: 'integrationIssues', label: 'Integration Issues', value: 2, helper: 'Unresolved failed platform integrations', severity: 'critical' },
  ],
  transactionDistribution: {
    uniqueTransactionsTotal: 1247,
    items: [
      { key: 'agents', label: 'Agents', value: 860, tone: 'blue' },
      { key: 'attorneys', label: 'Attorneys', value: 735, tone: 'green' },
      { key: 'bondOriginators', label: 'Bond Originators', value: 312, tone: 'purple' },
      { key: 'commercial', label: 'Commercial', value: 75, tone: 'orange' },
    ],
  },
  averageRegistrationTime: {
    days: 41,
    previousDays: 45,
    changePct: -0.0888,
    benchmarkDays: 45,
    helper: 'Created to registered',
  },
  trends: {
    ranges: {
      '30d': [
        { key: 'transactionVolume', label: 'Transaction Volume', tone: 'blue', data: [{ label: '25d', value: 1100 }, { label: '20d', value: 1140 }, { label: '15d', value: 1180 }, { label: '10d', value: 1210 }, { label: '5d', value: 1230 }, { label: 'Now', value: 1247 }] },
        { key: 'registrations', label: 'Registrations', tone: 'green', data: [{ label: '25d', value: 42 }, { label: '20d', value: 48 }, { label: '15d', value: 53 }, { label: '10d', value: 60 }, { label: '5d', value: 64 }, { label: 'Now', value: 68 }] },
        { key: 'revenue', label: 'Revenue', tone: 'purple', valueType: 'currency', data: [{ label: '25d', value: 830000 }, { label: '20d', value: 920000 }, { label: '15d', value: 1010000 }, { label: '10d', value: 1110000 }, { label: '5d', value: 1180000 }, { label: 'Now', value: 1240000 }] },
      ],
      '6m': [
        { key: 'transactionVolume', label: 'Transaction Volume', tone: 'blue', data: [{ label: 'W-5', value: 960 }, { label: 'W-4', value: 1010 }, { label: 'W-3', value: 1080 }, { label: 'W-2', value: 1140 }, { label: 'W-1', value: 1200 }, { label: 'Now', value: 1247 }] },
        { key: 'registrations', label: 'Registrations', tone: 'green', data: [{ label: 'W-5', value: 39 }, { label: 'W-4', value: 44 }, { label: 'W-3', value: 50 }, { label: 'W-2', value: 57 }, { label: 'W-1', value: 63 }, { label: 'Now', value: 68 }] },
        { key: 'revenue', label: 'Revenue', tone: 'purple', valueType: 'currency', data: [{ label: 'W-5', value: 760000 }, { label: 'W-4', value: 850000 }, { label: 'W-3', value: 970000 }, { label: 'W-2', value: 1080000 }, { label: 'W-1', value: 1170000 }, { label: 'Now', value: 1240000 }] },
      ],
      '12m': [
        { key: 'transactionVolume', label: 'Transaction Volume', tone: 'blue', data: [{ label: 'M-5', value: 810 }, { label: 'M-4', value: 900 }, { label: 'M-3', value: 1010 }, { label: 'M-2', value: 1115 }, { label: 'M-1', value: 1190 }, { label: 'Now', value: 1247 }] },
        { key: 'registrations', label: 'Registrations', tone: 'green', data: [{ label: 'M-5', value: 31 }, { label: 'M-4', value: 38 }, { label: 'M-3', value: 45 }, { label: 'M-2', value: 51 }, { label: 'M-1', value: 61 }, { label: 'Now', value: 68 }] },
        { key: 'revenue', label: 'Revenue', tone: 'purple', valueType: 'currency', data: [{ label: 'M-5', value: 620000 }, { label: 'M-4', value: 760000 }, { label: 'M-3', value: 890000 }, { label: 'M-2', value: 1030000 }, { label: 'M-1', value: 1160000 }, { label: 'Now', value: 1240000 }] },
      ],
    },
  },
  recentActivity: [
    { id: 'registration-completed', type: 'registration_completed', title: 'Registration completed', description: '17 Eagle Street, Benoni', organisationName: 'Harcourts East Rand', time: new Date('2026-06-22T09:58:00.000Z').toISOString(), severity: 'info' },
    { id: 'mandate-signed', type: 'mandate_signed', title: 'Mandate signed', description: 'Commercial lease mandate confirmed', organisationName: 'Greenstone Commercial Team', time: new Date('2026-06-22T09:52:00.000Z').toISOString(), severity: 'info' },
    { id: 'integration-warning', type: 'integration_failed', title: 'Integration needs attention', description: 'Document delivery retry queued', organisationName: 'Arch9 Platform', time: new Date('2026-06-22T09:41:00.000Z').toISOString(), severity: 'warning' },
  ],
})

export function getMissionControlMockSnapshot() {
  return cloneSnapshot(MISSION_CONTROL_MOCK_SNAPSHOT)
}

export function getAdminMobileDashboardMockSnapshot() {
  return cloneAdminMobileDashboard(ADMIN_MOBILE_DASHBOARD_MOCK)
}

export function getLegacyMissionControlMockSnapshot(now = new Date()) {
  const generatedAt = now instanceof Date ? now : new Date(now || Date.now())
  const activityTimes = [2, 6, 11, 18, 23].map((minutes) => new Date(generatedAt.getTime() - minutes * 60 * 1000).toISOString())

  return {
    generatedAt: generatedAt.toISOString(),
    summary: {
      activeTransactions: 156,
      scheduledRegistrationsSoon: 9,
      registeredToday: 4,
    },
    executive: {
      platformHealthScore: 87,
      healthStatus: 'healthy',
      growthTrend: {
        currentMonth: 16,
        previousMonth: 12,
        percentageChange: 0.3333,
      },
      registrationTrend: {
        registeredThisMonth: 28,
        registeredLastMonth: 22,
        percentageChange: 0.2727,
      },
      registrationForecast: {
        next7Days: 9,
        next14Days: 17,
        next30Days: 28,
      },
      revenue: {
        actualThisMonth: 1240000,
        forecastThisMonth: 1580000,
        subscriptionRevenue: 920000,
        transactionRevenue: 320000,
      },
      focusAreas: [
        {
          type: 'healthy_platform',
          title: 'Platform health is holding steady',
          description: 'Registrations, usage growth, and alerts are all within the expected founder range.',
          severity: 'info',
        },
        {
          type: 'critical_attention',
          title: '3 critical items still need intervention',
          description: 'Mission Control is surfacing a small set of founder-level items that still need attention.',
          severity: 'critical',
        },
        {
          type: 'revenue_growth',
          title: 'Revenue momentum is up 32% vs the last 30 days',
          description: 'Month-to-date revenue and forecast are trending ahead in the demo snapshot.',
          severity: 'info',
        },
      ],
    },
    growth: {
      activeAgencies: 74,
      activeAgents: 312,
      newAgencySignups: 16,
      websiteEnquiries: 89,
    },
    invites: {
      agentInvitesSent: 24,
      attorneyInvitesSent: 11,
      bondOriginatorInvitesSent: 7,
      inviteAcceptanceRate: 0.68,
    },
    attention: {
      total: 12,
      critical: 3,
      warning: 9,
      items: [
        {
          id: 'attention-1',
          severity: 'critical',
          type: 'missing_docs',
          title: '3 files are waiting on critical document completion',
          organisationName: 'Harcourts East Rand',
          entityType: 'transaction',
          description: 'Document readiness is blocking downstream registration progress.',
          lastActivityAt: activityTimes[2],
        },
        {
          id: 'attention-2',
          severity: 'warning',
          type: 'stalled_invites',
          title: 'Attorney invite acceptance has softened',
          organisationName: 'Smith Attorneys',
          entityType: 'invite',
          description: 'Several firm invites are still pending founder follow-up.',
          lastActivityAt: activityTimes[3],
        },
      ],
    },
    transactionHealth: {
      delayedRegistrations: 5,
    },
    recentActivity: [
      {
        id: 'registration-completed',
        type: 'registration_completed',
        severity: 'info',
        label: 'Registration completed',
        description: '17 Eagle Street, Benoni',
        organisationName: 'Harcourts East Rand',
        time: activityTimes[0],
      },
      {
        id: 'otp-signed',
        type: 'otp_signed',
        severity: 'info',
        label: 'OTP signed',
        description: '42 Oak Avenue, Randburg',
        organisationName: 'Fine & Country Northcliff',
        time: activityTimes[1],
      },
      {
        id: 'document-uploaded',
        type: 'document_uploaded',
        severity: 'info',
        label: 'Document uploaded',
        description: 'Sale Agreement - 12 Main Road',
        organisationName: 'Legacy Living Properties',
        time: activityTimes[2],
      },
      {
        id: 'attorney-invited',
        type: 'attorney_invited',
        severity: 'warning',
        label: 'Attorney invited',
        description: 'Jane Smith',
        organisationName: 'Smith Attorneys',
        time: activityTimes[3],
      },
      {
        id: 'agency-joined',
        type: 'agency_joined',
        severity: 'info',
        label: 'New agency joined',
        description: 'Sunset Properties',
        organisationName: '',
        time: activityTimes[4],
      },
    ],
  }
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

export function normalizeAdminMobileDashboardSnapshot(liveSnapshot = null) {
  if (!liveSnapshot || typeof liveSnapshot !== 'object') return null

  const headlineValue = toFiniteNumber(liveSnapshot?.headline?.value)
  const kpis = Array.isArray(liveSnapshot?.kpis) ? liveSnapshot.kpis : []
  const attentionRequired = Array.isArray(liveSnapshot?.attentionRequired) ? liveSnapshot.attentionRequired : []
  const distributionItems = Array.isArray(liveSnapshot?.transactionDistribution?.items) ? liveSnapshot.transactionDistribution.items : []
  const recentActivity = Array.isArray(liveSnapshot?.recentActivity) ? liveSnapshot.recentActivity : []
  const ranges = liveSnapshot?.trends?.ranges && typeof liveSnapshot.trends.ranges === 'object' ? liveSnapshot.trends.ranges : {}

  return {
    generatedAt: normalizeText(liveSnapshot.generatedAt),
    greetingName: normalizeText(liveSnapshot.greetingName) || 'Alex',
    headline: {
      value: headlineValue,
      label: normalizeText(liveSnapshot?.headline?.label) || 'Active Transactions',
      subtitle: normalizeText(liveSnapshot?.headline?.subtitle) || 'Across the Arch9 ecosystem',
    },
    networkHealth: {
      score: toFiniteNumber(liveSnapshot?.networkHealth?.score),
      status: normalizeToken(liveSnapshot?.networkHealth?.status) || 'healthy',
      alertCount: toFiniteNumber(liveSnapshot?.networkHealth?.alertCount) || 0,
    },
    kpis: kpis.map((item, index) => ({
      key: normalizeText(item?.key) || `kpi-${index + 1}`,
      label: normalizeText(item?.label) || 'Metric',
      value: toFiniteNumber(item?.value),
      valueType: normalizeText(item?.valueType),
      changePct: toFiniteNumber(item?.changePct),
      helper: normalizeText(item?.helper),
      icon: normalizeText(item?.icon),
      tone: normalizeText(item?.tone) || 'blue',
    })),
    attentionRequired: attentionRequired.map((item, index) => ({
      key: normalizeText(item?.key) || `attention-${index + 1}`,
      label: normalizeText(item?.label) || 'Attention item',
      value: toFiniteNumber(item?.value) || 0,
      helper: normalizeText(item?.helper),
      severity: normalizeToken(item?.severity) || 'healthy',
    })),
    transactionDistribution: {
      uniqueTransactionsTotal: toFiniteNumber(liveSnapshot?.transactionDistribution?.uniqueTransactionsTotal) || headlineValue || 0,
      items: distributionItems.map((item, index) => ({
        key: normalizeText(item?.key) || `distribution-${index + 1}`,
        label: normalizeText(item?.label) || 'Workspace',
        value: toFiniteNumber(item?.value) || 0,
        tone: normalizeText(item?.tone) || 'blue',
      })),
    },
    averageRegistrationTime: {
      days: toFiniteNumber(liveSnapshot?.averageRegistrationTime?.days),
      previousDays: toFiniteNumber(liveSnapshot?.averageRegistrationTime?.previousDays),
      changePct: toFiniteNumber(liveSnapshot?.averageRegistrationTime?.changePct),
      benchmarkDays: toFiniteNumber(liveSnapshot?.averageRegistrationTime?.benchmarkDays),
      helper: normalizeText(liveSnapshot?.averageRegistrationTime?.helper),
    },
    trends: {
      ranges: Object.fromEntries(
        Object.entries(ranges).map(([range, items]) => [
          range,
          (Array.isArray(items) ? items : []).map((item, index) => ({
            key: normalizeText(item?.key) || `trend-${index + 1}`,
            label: normalizeText(item?.label) || 'Trend',
            tone: normalizeText(item?.tone) || 'blue',
            valueType: normalizeText(item?.valueType),
            data: (Array.isArray(item?.data) ? item.data : []).map((point, pointIndex) => ({
              label: normalizeText(point?.label) || String(pointIndex + 1),
              value: toFiniteNumber(point?.value) || 0,
            })),
          })),
        ]),
      ),
    },
    recentActivity: recentActivity.slice(0, 8).map((item, index) => ({
      id: normalizeText(item?.id) || `activity-${index + 1}`,
      type: normalizeText(item?.type) || 'activity',
      title: normalizeText(item?.title) || humanizeToken(item?.type || 'Activity'),
      description: normalizeText(item?.description) || 'Platform update',
      organisationName: normalizeText(item?.organisationName),
      time: normalizeText(item?.time),
      timestampLabel: formatRelativeActivityTime(item?.time),
      severity: normalizeToken(item?.severity) || 'info',
      tone: toneFromActivity(item),
    })),
  }
}

export function hasAdminMobileDashboardData(snapshot = null) {
  if (!snapshot) return false
  return Boolean(
    snapshot.headline?.value !== null ||
      snapshot.networkHealth?.score !== null ||
      snapshot.kpis?.some((item) => item.value !== null) ||
      snapshot.attentionRequired?.length ||
      snapshot.transactionDistribution?.items?.some((item) => item.value > 0) ||
      snapshot.recentActivity?.length,
  )
}

export function shouldUseAdminMobileDashboardMockSnapshot({ liveSnapshot = null, error = null } = {}) {
  if (!MISSION_CONTROL_MOCKS_ENABLED) return false
  if (error) return true
  const normalized = normalizeAdminMobileDashboardSnapshot(liveSnapshot)
  return !hasAdminMobileDashboardData(normalized)
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
