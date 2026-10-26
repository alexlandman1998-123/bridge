// Derived only from activity already visible in the campaign workspace.
const channelDefinitions = {
  email: {
    name: 'Email',
    metric: 'clicked',
    metricLabel: 'Click rate',
    actionLabel: 'clicks',
  },
  whatsapp: {
    name: 'WhatsApp',
    metric: 'read',
    metricLabel: 'Read rate',
    actionLabel: 'reads',
  },
}
const count = (value) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  Number.isInteger(value)
    ? value
    : null
const resultUrl = (id, tab = 'results') =>
  `/marketing?section=campaigns&view=detail&id=${encodeURIComponent(id)}&tab=${tab}`

export function buildCampaignAnalytics(workspace) {
  const campaigns = workspace.campaigns || []
  const ids = new Set(campaigns.map((item) => item.id))
  const links = (workspace.activities || []).filter(
    (item) =>
      ids.has(item.campaign_id) &&
      Object.hasOwn(channelDefinitions, item.channel),
  )
  const channels = Object.entries(channelDefinitions).map(
    ([key, definition]) => {
      const source = workspace.channels?.[key] || {}
      const activitiesById = new Map(
        (source.data || []).map((item) => [item.id, item]),
      )
      const entries = links
        .filter((item) => item.channel === key)
        .map((link) => ({
          link,
          activity: activitiesById.get(link[`${key}_campaign_id`]),
        }))
      const entriesByCampaign = new Map()
      for (const entry of entries) {
        const group = entriesByCampaign.get(entry.link.campaign_id) || []
        group.push(entry)
        entriesByCampaign.set(entry.link.campaign_id, group)
      }
      const unavailable = !!source.error || !!source.metricsError
      function totals(rows) {
        if (!rows.length || unavailable)
          return {
            delivered: null,
            engaged: null,
            rate: null,
            incomplete: rows.length > 0,
          }
        let delivered = 0,
          engaged = 0
        for (const { activity } of rows) {
          const d = count(activity?.delivered),
            e = count(activity?.[definition.metric])
          if (d === null || e === null || e > d)
            return {
              delivered: null,
              engaged: null,
              rate: null,
              incomplete: true,
            }
          delivered += d
          engaged += e
        }
        return {
          delivered,
          engaged,
          rate: delivered > 0 ? (engaged / delivered) * 100 : null,
          incomplete: false,
        }
      }
      const aggregate = totals(entries)
      const rankings = campaigns
        .map((campaign) => {
          const campaignEntries = entriesByCampaign.get(campaign.id) || []
          return {
            id: campaign.id,
            name: campaign.name,
            ...totals(campaignEntries),
            activityCount: campaignEntries.length,
            url: resultUrl(campaign.id),
          }
        })
        .filter((row) => row.rate !== null && !row.incomplete)
        .sort(
          (a, b) =>
            b.rate - a.rate ||
            b.delivered - a.delivered ||
            a.name.localeCompare(b.name),
        )
      const failed = entries.find(
        ({ activity }) =>
          activity &&
          [
            'failed',
            'partially_failed',
            'partial',
            'needs_attention',
            'uncertain',
          ].includes(activity.display_status || activity.status),
      )
      const missing = entries.find(({ activity }) => {
        const delivered = count(activity?.delivered)
        const engaged = count(activity?.[definition.metric])
        return delivered === null || engaged === null || engaged > delivered
      })
      return {
        key,
        ...definition,
        ...aggregate,
        linkedCount: entries.length,
        unavailable,
        rankings,
        failedCampaign: failed?.link.campaign_id,
        firstCampaign: entries[0]?.link.campaign_id,
        coverageCampaign: (unavailable ? entries[0] : missing)?.link
          .campaign_id,
      }
    },
  )
  const hasActivity = links.length > 0
  const linkedChannels = channels.filter((channel) => channel.linkedCount)
  const delivered =
    hasActivity && linkedChannels.every((channel) => channel.delivered !== null)
      ? linkedChannels.reduce((sum, channel) => sum + channel.delivered, 0)
      : null
  let recommendation
  const coverage = channels.find(
    (channel) =>
      channel.linkedCount && (channel.unavailable || channel.incomplete),
  )
  const failure = channels.find((channel) => channel.failedCampaign)
  // Rank within a channel. Email clicks are never treated as comparable to WhatsApp reads.
  const established = channels.flatMap((channel) =>
    channel.rankings
      .filter((item) => item.delivered >= 20 && item.engaged > 0)
      .slice(0, 1)
      .map((item) => ({ channel, item })),
  )[0]
  const smallSample = channels.find((channel) => channel.rankings.length)
  const unengaged = channels.flatMap((channel) =>
    channel.rankings
      .filter((item) => item.delivered >= 20 && item.engaged === 0)
      .slice(0, 1)
      .map((item) => ({ channel, item })),
  )[0]
  if (!campaigns.length)
    recommendation = {
      title: 'Give your next campaign a head start.',
      body: 'Choose a playbook, define your objective and bring the right channels together.',
      reason:
        'There are no campaign plans to analyse yet. Start with a template; recommendations will use recorded activity as you link your sends.',
      action: 'Explore campaign templates',
      url: '/marketing?section=campaigns&view=templates',
      signal: 'Getting started',
    }
  else if (coverage)
    recommendation = {
      title: 'Get a complete picture first.',
      body: 'Some linked activity has unavailable or incomplete results. Review it before comparing campaign performance.',
      reason: `${coverage.name} results are missing, unavailable under your permissions, or inconsistent. Missing results are excluded from rankings and are never counted as zero.`,
      action: 'Review linked activity',
      url: resultUrl(
        coverage.coverageCampaign || coverage.firstCampaign,
        'activity',
      ),
      signal: 'Results coverage',
    }
  else if (failure)
    recommendation = {
      title: 'Give delivery a closer look.',
      body: `A linked ${failure.name} send reports a delivery issue. Review its status before planning another send.`,
      reason:
        'The linked channel reports a failed, partially failed or uncertain delivery status. This recommendation uses that recorded status, not a prediction.',
      action: 'Review delivery',
      url: resultUrl(failure.failedCampaign, 'activity'),
      signal: 'Delivery review',
    }
  else if (!hasActivity)
    recommendation = {
      title: 'Connect the plan to the work.',
      body: 'Link an existing email or WhatsApp send to a campaign to start seeing its results here.',
      reason: `${campaigns.length} campaign ${campaigns.length === 1 ? 'plan is' : 'plans are'} available, but none has linked email or WhatsApp activity. Planning a channel alone does not produce analytics.`,
      action: 'Link campaign activity',
      url: resultUrl(campaigns[0].id, 'activity'),
      signal: 'Next step',
    }
  else if (established)
    recommendation = {
      title: `Take a closer look at “${established.item.name}”.`,
      body: `It leads your eligible ${established.channel.name} campaigns by ${established.channel.metricLabel.toLowerCase()}. Review its approach before adapting your next campaign.`,
      reason: `${established.item.engaged} ${established.channel.actionLabel} from ${established.item.delivered} delivered messages. This rule considers campaigns with at least 20 deliveries and one engagement; it is not a prediction or a statistical significance claim. Email is evaluated separately from WhatsApp.`,
      action: 'Explore campaign results',
      url: established.item.url,
      signal: 'Recorded engagement',
    }
  else if (unengaged)
    recommendation = {
      title: 'Review the journey after delivery.',
      body:
        unengaged.channel.key === 'email'
          ? 'Delivered emails have no recorded clicks. Review the relevance, links and call to action before repeating this approach.'
          : 'Delivered messages have no recorded reads. Review the audience and available read receipts before drawing conclusions.',
      reason: `${unengaged.item.delivered} delivered messages and no recorded ${unengaged.channel.actionLabel} for “${unengaged.item.name}”. This is a prompt to review the results, not evidence that recipients were uninterested.`,
      action: 'Review engagement',
      url: unengaged.item.url,
      signal: 'Engagement review',
    }
  else if (smallSample)
    recommendation = {
      title: 'A promising start. Keep learning.',
      body: 'Results are coming in. Review audience size and engagement before choosing an approach to repeat.',
      reason:
        'No campaign meets this recommendation’s rule of at least 20 deliveries and one engagement yet. Rate rankings are shown with their delivery counts so small samples stay visible.',
      action: 'Review early results',
      url: smallSample.rankings[0].url,
      signal: 'Early results',
    }
  else
    recommendation = {
      title: 'Your next insight starts with delivery.',
      body: 'Review your linked sends. Performance comparisons appear once delivered messages have recorded results.',
      reason:
        'Linked activity is available, but there are no delivered messages with a calculable engagement rate yet. No rates or outcomes are estimated.',
      action: 'Review channel activity',
      url: resultUrl(links[0].campaign_id, 'activity'),
      signal: 'Awaiting results',
    }
  return { channels, delivered, linkedCount: links.length, recommendation }
}
