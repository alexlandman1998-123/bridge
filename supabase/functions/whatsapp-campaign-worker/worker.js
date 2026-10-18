import { campaignResult, createCampaignDelivery } from '../_shared/whatsappCampaignDelivery.js'

export function createCampaignWorker({ db, meta, deliveryOptions = {} }) {
  const delivery = createCampaignDelivery({ db, meta })
  return async () => {
    const jobs = await campaignResult(db.rpc('whatsapp_campaign_jobs_claim', { p_limit: 3 }))
    const outcomes = await Promise.all(jobs.map(async (job) => {
      let error = null
      try {
        const row = await campaignResult(db.from('whatsapp_campaigns').select('*').eq('organisation_id', job.organisation_id).eq('id', job.campaign_id).single())
        await delivery.deliver(row, job.lease_token, deliveryOptions)
      } catch (err) { error = String(err.message || 'Delivery worker failed.').slice(0, 1000) }
      await campaignResult(db.rpc('whatsapp_campaign_job_finish', { p_id: job.campaign_id, p_org: job.organisation_id, p_token: job.lease_token, p_error: error }))
      return { campaignId: job.campaign_id, paused: Boolean(error) }
    }))
    return { processed: outcomes.length, paused: outcomes.filter((job) => job.paused).length }
  }
}
