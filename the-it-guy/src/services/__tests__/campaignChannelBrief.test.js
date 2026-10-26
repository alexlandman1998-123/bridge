import { expect, it } from 'vitest'
import {
  campaignChannelBrief,
  campaignChannelBriefText,
  checkedChannelCopyPack,
} from '../campaignChannelBrief'
const plan = {
  name: 'Valuations',
  revision: 2,
  planned_channels: ['meta', 'social', 'whatsapp'],
  objective: 'Book 20 valuations',
  campaign_setup: { metaObjective: 'OUTCOME_LEADS', target: '20 valuations' },
  audience: 'Homeowners',
  offer: 'Complimentary valuation',
  area: 'Gardens',
  start_date: '2026-10-24',
  end_date: '2026-11-24',
  planned_budget: 0,
  budget_currency: 'ZAR',
  cover_url: 'https://example.test/cover.jpg',
  created_by: 'private-owner',
  contact_ids: ['private-contact'],
  campaign_builder: { private: 'snapshot' },
  channel_content: {
    meta: {
      title: 'What is your home worth?',
      body: 'Book your valuation.',
      timing: 'Launch day',
    },
    social: { title: 'Local homes', body: 'A local perspective.' },
    whatsapp: { body: 'Your invitation' },
  },
}
it('exports ChatGPT copy without a Meta objective or private campaign data', () => {
  const campaign = { ...plan, planned_channels: ['chatgpt'], campaign_setup: {}, channel_content: { chatgpt: { title: 'Explore this home', body: 'See the property details.' } } }
  const brief = campaignChannelBrief(campaign, 'chatgpt')
  expect(brief.channel).toBe('ChatGPT Ads')
  expect(brief.headline).toBe('Explore this home')
  expect(brief).not.toHaveProperty('metaObjective')
  expect(JSON.stringify(brief)).not.toContain('private-owner')
  expect(campaignChannelBriefText(brief)).toContain('does not create an ad')
})
it('exports the selected channel and campaign brief without internal snapshots or audiences selected for sending', () => {
  const brief = campaignChannelBrief(plan, 'meta')
  expect(brief).toMatchObject({
    headline: 'What is your home worth?',
    message: 'Book your valuation.',
    plannedBudget: 'ZAR 0',
    revision: 2,
    imageUrl: plan.cover_url,
  })
  const text = campaignChannelBriefText(brief)
  expect(text).toContain('Audience: Homeowners')
  expect(brief.metaObjective).toBe('OUTCOME_LEADS')
  expect(text).toContain('Meta objective: OUTCOME_LEADS')
  expect(text).toContain('Target: 20 valuations')
  expect(text).toContain('Campaign planned budget: ZAR 0')
  expect(text).not.toContain('private-owner')
  expect(text).not.toContain('private-contact')
  expect(text).not.toContain('snapshot')
  expect(text).not.toContain('A local perspective')
  expect(text).toContain('does not create an ad')
})
it('requires an explicit compatible objective for Meta exports and preserves the exact selection', () => {
  expect(() => campaignChannelBrief({ ...plan, campaign_setup: {} }, 'meta')).toThrow('Meta-compatible objective')
  expect(() => campaignChannelBrief({ ...plan, campaign_setup: { metaObjective: 'LEAD_GENERATION' } }, 'meta')).toThrow('Meta-compatible objective')
  expect(campaignChannelBrief({ ...plan, campaign_setup: { metaObjective: 'OUTCOME_TRAFFIC' } }, 'meta').metaObjective).toBe('OUTCOME_TRAFFIC')
  expect(campaignChannelBrief(plan, 'social').metaObjective).toBeUndefined()
})
it('keeps organic captions and plain text unchanged, with safe image references only', () => {
  const brief = campaignChannelBrief(
    {
      ...plan,
      cover_url: 'javascript:alert(1)',
      channel_content: {
        social: { body: 'Caption <script>literal text</script>' },
      },
    },
    'social',
  )
  expect(brief.imageUrl).toBe('')
  expect(brief.message).toBe('Caption <script>literal text</script>')
  expect(
    campaignChannelBrief(
      { ...plan, cover_url: 'https://user:pass@example.test/image' },
      'meta',
    ).imageUrl,
  ).toBe('')
})
it('requires planned channel wording, rejects unsupported exports and permits WhatsApp wording without an email', () => {
  expect(() =>
    campaignChannelBrief({ ...plan, planned_channels: ['social'] }, 'meta'),
  ).toThrow('Add Meta ads')
  expect(() =>
    campaignChannelBrief(
      { ...plan, channel_content: { meta: { body: ' ' } } },
      'meta',
    ),
  ).toThrow('Add a Meta ads message')
  expect(() => campaignChannelBrief(plan, 'email')).toThrow('Choose Meta ads')
  const pack = checkedChannelCopyPack(
    {
      planned_channels: ['whatsapp'],
      channel_content: { whatsapp: { body: 'Invitation' } },
    },
    'whatsapp',
  )
  expect(pack.content.whatsapp.body).toBe('Invitation')
  expect(pack.copyOnly).toBe(true)
})
