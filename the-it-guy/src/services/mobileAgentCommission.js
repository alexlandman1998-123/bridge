import { getScopedDashboardTransactions, isDashboardTransactionActive, getDashboardTransactionStatusText } from '../lib/dashboardTransactionIntegrity.js'

const text = value => String(value ?? '').trim()
const key = value => text(value).toLowerCase()
const monthFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit' })
const month = value => monthFormatter.format(new Date(value))
const money = value => !text(value) || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value)

export function buildMobileAgentCommission({ rows = [], commissions = [], signedSteps = [], profile = {}, organisationId = '', now = new Date(), commissionsAvailable = true, signaturesAvailable = true } = {}) {
  const saved = new Map(commissions.map(row => [text(row.transaction_id), row]))
  const signed = new Map()
  const currentMonth = month(now)
  const nowTime = new Date(now).getTime()
  for (const step of signedSteps) {
    if (step.workflow_key !== 'sales_otp' || step.step_key !== 'signed_otp_received' || step.status !== 'completed') continue
    const time = Date.parse(step.completed_at || '')
    if (!Number.isFinite(time) || time > nowTime) continue
    const id = text(step.transaction_id)
    if (!signed.has(id) || time < signed.get(id)) signed.set(id, time)
  }
  let signedThisMonth = 0
  let pipeline = 0
  let signedComplete = signaturesAvailable && commissionsAvailable
  let pipelineComplete = commissionsAvailable
  for (const row of getScopedDashboardTransactions(rows, { organisationId, activeOnly: false })) {
    const tx = row.transaction || row
    const snapshot = saved.get(text(tx.id)) || {}
    const currentId = text(tx.assigned_agent_id || tx.assigned_user_id)
    const currentEmail = key(tx.assigned_agent_email)
    const assignedId = currentId || (!currentEmail ? text(snapshot.assigned_agent_id) : '')
    const assignedEmail = currentEmail || key(snapshot.assigned_agent_email)
    const mine = assignedId ? assignedId === text(profile.id || profile.userId) : assignedEmail ? assignedEmail === key(profile.email) : null
    if (mine === false) continue
    const status = getDashboardTransactionStatusText(row)
    if (tx.cancelled_at || tx.deleted_at || tx.archived_at || /cancel|lost|deleted|archived/.test(status) || /cancel/.test(key(snapshot.status))) continue
    const active = isDashboardTransactionActive(row, { organisationId }) && key(snapshot.status) !== 'paid'
    const signedAt = signed.get(text(tx.id))
    const inMonth = signedAt !== undefined && month(signedAt) === currentMonth
    // A missing receipt date cannot establish whether an older signed deal
    // belongs to this month. Never substitute creation/update timestamps.
    if (signedAt === undefined && /signed|otp_uploaded|finance|transfer|lodg|registered|completed/.test(`${key(tx.onboarding_status)} ${status}`)) signedComplete = false
    const snapshotMine = snapshot.assigned_agent_id ? text(snapshot.assigned_agent_id) === text(profile.id || profile.userId)
      : snapshot.assigned_agent_email ? key(snapshot.assigned_agent_email) === key(profile.email) : true
    const amount = money((snapshotMine ? snapshot.agent_commission_amount : null) ?? tx.agent_commission_amount)
    if (active) {
      if (mine === null || amount === null) pipelineComplete = false
      else pipeline += amount
    }
    if (inMonth) {
      if (mine === null || amount === null) signedComplete = false
      else signedThisMonth += amount
    }
  }
  return { signedThisMonth: signedComplete ? Math.round(signedThisMonth * 100) / 100 : null, pipeline: pipelineComplete ? Math.round(pipeline * 100) / 100 : null }
}

export async function readMobileAgentCommission({ client, rows = [], profile = {}, organisationId = '', now = new Date() } = {}) {
  const scoped = getScopedDashboardTransactions(rows, { organisationId, activeOnly: false })
  if (!organisationId || !text(profile.id || profile.userId)) return { signedThisMonth: null, pipeline: null }
  const ids = scoped.map(row => text((row.transaction || row).id))
  const commissions = [], signedSteps = []
  let commissionsAvailable = true, signaturesAvailable = true
  // Small batches keep each read below the API row limit, even for a large book.
  for (let start = 0; start < ids.length; start += 200) {
    const batch = ids.slice(start, start + 200)
    const results = await Promise.allSettled([
      Promise.resolve().then(() => client.from('transaction_commissions').select('transaction_id,assigned_agent_id,assigned_agent_email,agent_commission_amount,status').eq('organisation_id', organisationId).in('transaction_id', batch)),
      Promise.resolve().then(() => client.from('transaction_workflow_steps').select('transaction_id,workflow_key,step_key,status,completed_at').in('transaction_id', batch).eq('workflow_key', 'sales_otp').eq('step_key', 'signed_otp_received')),
    ])
    const [commissionRead, signatureRead] = results
    if (commissionRead.status === 'fulfilled' && !commissionRead.value.error) commissions.push(...(commissionRead.value.data || []))
    else commissionsAvailable = false
    if (signatureRead.status === 'fulfilled' && !signatureRead.value.error) signedSteps.push(...(signatureRead.value.data || []))
    else signaturesAvailable = false
  }
  return buildMobileAgentCommission({ rows: scoped, commissions, signedSteps, profile, organisationId, now, commissionsAvailable, signaturesAvailable })
}
