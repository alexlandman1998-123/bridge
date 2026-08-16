import { buildDeveloperLeadTransactionHandoff } from '../core/developerLeads/developerLeadTransactionHandoff.js'
import {
  createTransactionFromWizard,
  getOrCreateTransactionOnboarding,
  recordBuyerOnboardingSent,
} from '../lib/api.js'
import { parseEdgeFunctionError } from '../lib/edgeFunctions.js'
import { invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

export const DEVELOPER_LEAD_PHASE18_CONTRACT = 'developer-leads-phase18-convert-and-send-v1'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeUuid(value = '') {
  const text = normalizeText(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null
}

function requireDeveloperOrgId(developerOrgId = '') {
  const normalized = normalizeUuid(developerOrgId)
  if (!normalized) throw new Error('A valid developer workspace id is required.')
  return normalized
}

function requireDeveloperLeadId(developerLeadId = '') {
  const normalized = normalizeUuid(developerLeadId)
  if (!normalized) throw new Error('A valid developer lead id is required.')
  return normalized
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required to convert developer leads.')
  }
  return supabase
}

function buildOnboardingUrl(token = '') {
  const normalized = normalizeText(token)
  if (!normalized) return ''
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://app.arch9.co.za'
  return `${origin}/client/onboarding/${normalized}`
}

function isRecoverableLeadActivityError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeLower(`${error?.message || ''} ${error?.details || ''}`)
  return (
    code === '42P01' ||
    code === '42703' ||
    code === '42501' ||
    message.includes('developer_lead_activity') ||
    message.includes('row-level security') ||
    message.includes('permission denied')
  )
}

async function markLeadBuyerOnboardingSent(client, {
  developerOrgId,
  developerLeadId,
  transactionId,
  sourceAgencyOrgId = '',
  sendBuyerOnboarding = true,
  manualBuyerOnboardingDelivery = false,
} = {}) {
  const now = new Date().toISOString()
  const buyerOnboardingDelivered = sendBuyerOnboarding || manualBuyerOnboardingDelivery
  const { data, error } = await client
    .from('developer_leads')
    .update({
      converted_transaction_id: transactionId,
      lead_status: buyerOnboardingDelivered ? 'onboarding_sent' : 'qualified',
      updated_at: now,
    })
    .eq('developer_org_id', developerOrgId)
    .eq('developer_lead_id', developerLeadId)
    .select('developer_lead_id, converted_transaction_id, lead_status, reservation_state, converted_at')
    .single()

  if (error) throw error

  const activityInsert = await client
    .from('developer_lead_activity')
    .insert({
      developer_lead_id: developerLeadId,
      developer_org_id: developerOrgId,
      source_agency_org_id: normalizeUuid(sourceAgencyOrgId),
      actor_user_id: null,
      activity_type: buyerOnboardingDelivered ? 'buyer_onboarding_sent' : 'system',
      activity_note: sendBuyerOnboarding
        ? 'Buyer onboarding was sent from the developer lead workspace.'
        : manualBuyerOnboardingDelivery
          ? 'Buyer onboarding link was copied from the developer lead workspace.'
          : 'Developer lead onboarding context was prepared.',
      visibility_scope: sourceAgencyOrgId ? 'shared' : 'developer',
      metadata: {
        contract: DEVELOPER_LEAD_PHASE18_CONTRACT,
        transactionId,
        sendBuyerOnboarding,
        manualBuyerOnboardingDelivery,
      },
    })

  if (activityInsert.error && !isRecoverableLeadActivityError(activityInsert.error)) {
    throw activityInsert.error
  }

  return data
}

async function ensureOnboardingLink({ transactionId, purchaserType, fallbackToken = '' } = {}) {
  if (fallbackToken) {
    return {
      token: fallbackToken,
      url: buildOnboardingUrl(fallbackToken),
    }
  }

  const onboarding = await getOrCreateTransactionOnboarding({
    transactionId,
    purchaserType,
  })

  return {
    ...onboarding,
    url: onboarding?.url || buildOnboardingUrl(onboarding?.token),
  }
}

export async function convertDeveloperLeadToTransactionAndSendOnboarding({
  developerOrgId = '',
  lead = {},
  sendBuyerOnboarding = true,
  manualBuyerOnboardingDelivery = false,
} = {}) {
  const orgId = requireDeveloperOrgId(developerOrgId || lead.developerOrgId)
  const leadId = requireDeveloperLeadId(lead.developerLeadId)
  const client = requireClient()
  const existingTransactionId = normalizeUuid(lead.convertedTransactionId)
  const manualDelivery = Boolean(manualBuyerOnboardingDelivery)

  if (!sendBuyerOnboarding && existingTransactionId) {
    const onboarding = await ensureOnboardingLink({
      transactionId: existingTransactionId,
      purchaserType: lead.purchaserType || 'individual',
    })
    const convertedLead = manualDelivery
      ? await markLeadBuyerOnboardingSent(client, {
        developerOrgId: orgId,
        developerLeadId: leadId,
        transactionId: existingTransactionId,
        sourceAgencyOrgId: lead.sourceAgencyOrgId,
        sendBuyerOnboarding: false,
        manualBuyerOnboardingDelivery: true,
      })
      : lead

    return {
      contract: DEVELOPER_LEAD_PHASE18_CONTRACT,
      developerLeadId: leadId,
      transactionId: existingTransactionId,
      convertedLead,
      onboarding,
      onboardingUrl: onboarding?.url || buildOnboardingUrl(onboarding?.token),
      onboardingEmail: {
        sent: false,
        skipped: true,
        reason: manualDelivery ? 'manual_delivery_existing_link' : 'send_disabled',
        recipientEmail: normalizeLower(lead.buyerEmail),
      },
      setupWarnings: [],
    }
  }

  const handoff = buildDeveloperLeadTransactionHandoff(lead, {
    allowEarlyLeadStatus: manualDelivery && !sendBuyerOnboarding,
  })

  if (!handoff.eligible) {
    const reason = handoff.blockers.map((blocker) => blocker.message).filter(Boolean).join(' ')
    throw new Error(reason || 'This developer lead is not ready to convert.')
  }

  const transaction = await createTransactionFromWizard({
    setup: handoff.handoff.setup,
    finance: handoff.handoff.finance,
    status: handoff.handoff.status,
    options: {
      ...handoff.handoff.options,
      creationOrigin: 'developer_lead_phase18',
      sourceContext: {
        ...handoff.handoff.options.sourceContext,
        organisationId: orgId,
        workspaceId: orgId,
      },
    },
  })

  const transactionId = normalizeText(transaction?.transactionId)
  if (!transactionId) {
    throw new Error('Developer lead conversion did not return a transaction id.')
  }

  const onboarding = await ensureOnboardingLink({
    transactionId,
    purchaserType: handoff.handoff.setup.purchaserType,
    fallbackToken: transaction?.onboardingToken,
  })

  const convertedLead = await markLeadBuyerOnboardingSent(client, {
    developerOrgId: orgId,
    developerLeadId: leadId,
    transactionId,
    sourceAgencyOrgId: lead.sourceAgencyOrgId,
    sendBuyerOnboarding,
    manualBuyerOnboardingDelivery: manualDelivery,
  })

  let onboardingEmail = {
    sent: false,
    skipped: true,
    reason: 'send_disabled',
    recipientEmail: '',
  }

  if (sendBuyerOnboarding) {
    const buyerEmail = normalizeLower(lead.buyerEmail)
    if (!buyerEmail) {
      onboardingEmail = {
        sent: false,
        skipped: true,
        reason: 'buyer_email_missing',
        recipientEmail: '',
      }
    } else {
      const response = await invokeEdgeFunction('send-email', {
        body: {
          type: 'client_onboarding',
          transactionId,
          resend: false,
          source: 'developer_lead_phase18',
        },
      })
      const payloadError = response?.data?.error || response?.data?.message
      if (response?.error || payloadError) {
        const message = response?.error
          ? await parseEdgeFunctionError(response.error, 'Buyer onboarding context was prepared, but the email failed to send.')
          : normalizeText(payloadError)
        onboardingEmail = {
          sent: false,
          skipped: false,
          reason: 'edge_function_failed',
          error: message,
          recipientEmail: buyerEmail,
        }
      } else {
        onboardingEmail = {
          sent: response?.data?.sent !== false,
          skipped: response?.data?.sent === false,
          reason: response?.data?.reason || '',
          recipientEmail: normalizeLower(response?.data?.recipientEmail || buyerEmail),
        }
        await recordBuyerOnboardingSent({
          transactionId,
          actorRole: 'developer',
          recipientEmail: onboardingEmail.recipientEmail,
          buyerTarget: {
            email: onboardingEmail.recipientEmail,
            metadata: {
              source: 'developer_lead_phase18',
              developerLeadId: leadId,
            },
          },
        }).catch((recordError) => {
          console.warn('[developerLeadConversionService] buyer onboarding send activity update failed', recordError)
        })
      }
    }
  }

  return {
    contract: DEVELOPER_LEAD_PHASE18_CONTRACT,
    developerLeadId: leadId,
    transactionId,
    convertedLead,
    onboarding,
    onboardingUrl: onboarding?.url || buildOnboardingUrl(onboarding?.token),
    onboardingEmail,
    setupWarnings: Array.isArray(transaction?.setupWarnings) ? transaction.setupWarnings : [],
  }
}
