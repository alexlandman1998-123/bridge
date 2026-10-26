import { expect, it } from 'vitest'
import {
  GENERAL_CAMPAIGNS,
  GENERAL_SOURCE_KEYS,
  checkedGeneralPack,
  cleanGeneralBuilder,
  generalCampaignCopy,
  generalCampaignGaps,
  generalCampaignPayload,
  generalDefaults,
} from '../generalCampaignModel'
const agentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const source = Object.fromEntries(
  GENERAL_SOURCE_KEYS.map((key) => [
    key,
    {
      agencyName: 'Oak & Stone',
      agentName: 'Sarah',
      agentTitle: 'Property consultant',
      agentBio: 'Local property help',
      destination: 'sarah@example.test',
      serviceAreas: 'Gardens',
      language: 'en-ZA',
      setupLanguage: 'en-ZA',
      tone: 'Professional and clear',
      primaryColor: '#274c69',
      photoUrl: 'https://example.test/portrait.jpg',
    }[key] || '',
  ]),
)
const material = {
  offer: 'Property valuation by appointment',
  checklist:
    'Choose preferred areas\nList your must-haves\nPrepare questions\nSpeak to your agent\nAgree next steps',
  brief: 'Looking for a three-bedroom home in Gardens',
  briefExpires: '2099-10-30',
  bio: 'Local property help',
  quote: 'Clear communication throughout',
  attribution: 'A local client',
  context: 'Help with a property sale',
  summary:
    'The report describes activity during this period.\nAsk about the underlying sample.',
  period: 'September 2026',
  reportSource: 'Local report, issue 10',
  reportDate: '2026-09-30',
}
const builder = (template) =>
  cleanGeneralBuilder({
    version: 1,
    template,
    agentId,
    source,
    details: { area: 'Gardens', ...material },
    reviewed: true,
    permission: true,
  })
const plan = (b) => ({
  id: 'plan',
  name: 'Campaign',
  status: 'draft',
  revision: 1,
  campaign_builder: b,
  channel_content: generalCampaignCopy(b),
})
it('supports eight families with complete copy and the promised distinct pack sizes', () => {
  expect(Object.keys(GENERAL_CAMPAIGNS)).toHaveLength(11)
  for (const [family, count] of Object.entries({
    sellers: 7,
    'thinking-of-selling': 7,
    'buyer-demand': 3,
    buyers: 7,
    'first-time-buyer': 7,
    'meet-your-agent': 7,
    'client-success': 6,
    'market-update': 8,
  })) {
    const b = builder(family),
      pack = checkedGeneralPack(plan(b), { agentId, source })
    expect(generalCampaignGaps(b)).toEqual([])
    expect(pack.designs).toHaveLength(count)
    expect(generalCampaignPayload(b, pack.content).goal).toBe(
      ['sellers', 'thinking-of-selling', 'buyer-demand'].includes(family)
        ? 'seller_leads'
        : ['buyers', 'first-time-buyer'].includes(family)
          ? 'buyer_leads'
          : 'custom',
    )
    expect(pack.content.whatsapp.body.length).toBeLessThan(1024)
    expect(pack.images.length).toBe(family === 'meet-your-agent' ? 1 : 0)
  }
})
it('projects only relevant public fields, never arbitrary profile or client data', () => {
  const b = cleanGeneralBuilder({
    ...builder('buyers'),
    rawPrivateClient: { email: 'secret@example.test' },
    source: { ...source, passport: 'private' },
    details: {
      area: 'Gardens',
      quote: 'Private quote',
      buyerEmail: 'secret@example.test',
    },
  })
  expect(JSON.stringify(b)).not.toMatch(
    /secret|passport|rawPrivateClient|Private quote/,
  )
  expect(b.details).toEqual({ area: 'Gardens' })
  expect(() => cleanGeneralBuilder({ ...b, agentId: 'wrong' })).toThrow()
  expect(() =>
    cleanGeneralBuilder({
      ...b,
      source: { ...source, photoUrl: 'javascript:alert(1)' },
    }),
  ).toThrow(/HTTPS/)
})
it('reuses confirmed areas, biography and offers without inventing a complimentary service', () => {
  const agency = {
      serviceAreas: ['Gardens'],
      offers: ['Selling consultation'],
    },
    agent = { name: 'Sarah', bio: 'My public biography' }
  expect(generalDefaults('sellers', agency, agent).offer).toBe('')
  expect(generalDefaults('meet-your-agent', agency, agent).bio).toBe(agent.bio)
  expect(generalDefaults('buyers', agency, agent).area).toBe('Gardens')
  expect(
    generalDefaults('first-time-buyer', agency, agent).checklist.split('\n'),
  ).toHaveLength(5)
})
it('requires current permission and refuses expired or impossible buyer searches', () => {
  const b = builder('buyer-demand')
  expect(generalCampaignGaps({ ...b, permission: false }).join(' ')).toMatch(
    /permission/,
  )
  for (const briefExpires of ['2020-01-01', '2099-02-30', ''])
    expect(
      generalCampaignGaps({
        ...b,
        details: { ...b.details, briefExpires },
      }).join(' '),
    ).toMatch(/expiry date/)
  expect(() =>
    checkedGeneralPack(
      plan({ ...b, details: { ...b.details, briefExpires: '2020-01-01' } }),
      { agentId, source },
    ),
  ).toThrow(/expiry/)
})
it('requires exact testimonial permission and a dated sourced market report', () => {
  expect(
    generalCampaignGaps({ ...builder('client-success'), permission: false })
      .length,
  ).toBeGreaterThan(0)
  const b = builder('market-update')
  for (const details of [
    { ...b.details, reportSource: '' },
    { ...b.details, reportDate: '2099-01-01' },
    { ...b.details, period: '' },
  ])
    expect(generalCampaignGaps({ ...b, details }).length).toBeGreaterThan(0)
  const pack = checkedGeneralPack(plan(b), { agentId, source })
  expect(
    pack.designs.every(
      (d) =>
        d.note.includes(material.reportSource) &&
        d.note.includes(material.reportDate),
    ),
  ).toBe(true)
  expect(pack.textFiles['email-copy.txt']).toContain(material.reportSource)
})
it('blocks changed agency and agent facts without rewriting saved channel wording', () => {
  const b = builder('buyers'),
    campaign = plan(b)
  campaign.channel_content.social.body = 'My saved edits'
  for (const key of [
    'agencyName',
    'agentName',
    'destination',
    'serviceAreas',
    'language',
  ])
    expect(() =>
      checkedGeneralPack(campaign, {
        agentId,
        source: { ...source, [key]: key === 'language' ? 'af-ZA' : 'Changed' },
      }),
    ).toThrow(/changed/)
  expect(() =>
    checkedGeneralPack(campaign, {
      agentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      source,
    }),
  ).toThrow(/changed/)
  const pack = checkedGeneralPack(campaign, {
    agentId,
    source: { ...source, destination: '' },
  })
  expect(pack.content.social.body).toBe('My saved edits')
  expect(pack.textFiles['social-caption.txt']).toBe('My saved edits')
})
it('uses a refreshed portrait URL for the same image and rejects portrait removal', () => {
  const b = builder('meet-your-agent'),
    campaign = plan(b)
  expect(
    checkedGeneralPack(campaign, {
      agentId,
      source: { ...source, photoUrl: source.photoUrl + '?token=fresh' },
    }).images[0].url,
  ).toContain('token=fresh')
  expect(() =>
    checkedGeneralPack(campaign, {
      agentId,
      source: { ...source, photoUrl: '' },
    }),
  ).toThrow(/changed/)
  expect(
    generalCampaignGaps({ ...b, source: { ...source, photoUrl: '' } }).join(
      ' ',
    ),
  ).toContain('portrait')
})
it('provides real checklist text and delivery copy without a fictional hosted download link', () => {
  const b = builder('first-time-buyer'),
    pack = checkedGeneralPack(plan(b), { agentId, source })
  expect(pack.textFiles['checklist.txt']).toContain('List your must-haves')
  expect(pack.textFiles['checklist-delivery.txt']).toContain(
    pack.textFiles['checklist.txt'],
  )
  expect(pack.textFiles['READ-ME.txt']).toContain('text files')
  expect(pack.textFiles['checklist-delivery.txt']).not.toMatch(/https:/)
})
it('generates Afrikaans introductions and actions while preserving reviewed supplied material', () => {
  const b = { ...builder('buyers'), source: { ...source, language: 'af-ZA' } }
  expect(generalCampaignCopy(b).social.body).toContain('Kom ons vind')
  expect(generalCampaignCopy(b).social.body).toContain(
    'Deel jou eiendomswenslys',
  )
})
it('opens every family before required campaign-specific material has been entered', () => {
  for (const template of Object.keys(GENERAL_CAMPAIGNS)) {
    const initial = {
      version: 1,
      template,
      agentId,
      source,
      details: generalDefaults(template, { serviceAreas: ['Gardens'] }, {}),
      reviewed: false,
      permission: false,
    }
    expect(() => generalCampaignCopy(initial)).not.toThrow()
    expect(generalCampaignGaps(initial).length).toBeGreaterThan(0)
  }
})
it('attributes testimonial artwork and shows buyer search expiry on every design', () => {
  const story = checkedGeneralPack(plan(builder('client-success')), {
    agentId,
    source,
  })
  expect(story.designs.find((d) => d.id === 'hero-post').note).toContain(
    material.attribution,
  )
  expect(story.designs.find((d) => d.id === 'story-1').note).toContain(
    material.attribution,
  )
  const long = builder('client-success')
  long.details.quote = 'Reviewed client wording. '.repeat(70)
  expect(
    checkedGeneralPack(plan(long), { agentId, source }).designs.find(
      (d) => d.id === 'hero-post',
    ).note,
  ).toContain(material.attribution)
  const demand = checkedGeneralPack(plan(builder('buyer-demand')), {
    agentId,
    source,
  })
  expect(
    demand.designs.every((d) => d.note.includes(material.briefExpires)),
  ).toBe(true)
})
it('requires usable public contacts and detects a changed underlying setup language', () => {
  const b = builder('buyers')
  expect(
    generalCampaignGaps({
      ...b,
      source: { ...source, destination: 'not a contact' },
    }).join(' '),
  ).toContain('valid public enquiry')
  expect(() =>
    checkedGeneralPack(plan(b), {
      agentId,
      source: { ...source, language: 'zu-ZA', setupLanguage: 'zu-ZA' },
    }),
  ).toThrow(/changed/)
  const overridden = {
    ...b,
    source: { ...source, language: 'en-ZA', setupLanguage: 'zu-ZA' },
  }
  expect(
    checkedGeneralPack(plan(overridden), {
      agentId,
      source: { ...source, language: 'zu-ZA', setupLanguage: 'zu-ZA' },
    }).source.language,
  ).toBe('en-ZA')
})

const relationshipBuilder = (template, details = {}) =>
  cleanGeneralBuilder({
    version: 1,
    template,
    agentId,
    source: { ...source, reviewUrl: 'https://example.test/review' },
    details: {
      area: 'Gardens',
      reviewUrl: 'https://example.test/review',
      transactionId: '11111111-1111-4111-8111-111111111111',
      variant: 'buyer',
      ...details,
    },
    reviewed: true,
    permission: true,
  })
it('launches private review requests with saved review routing and honest feedback copy', () => {
  const b = relationshipBuilder('review-request'),
    p = generalCampaignPayload(b, generalCampaignCopy(b))
  expect(p.planned_channels).toEqual(['email', 'whatsapp'])
  expect(p.goal).toBe('reengage')
  expect(p.channel_content.social).toBeUndefined()
  const pack = checkedGeneralPack(
    { ...plan(b), channel_content: p.channel_content },
    { agentId, source: b.source },
  )
  expect(pack.source.destination).toBe('https://example.test/review')
  expect(pack.designs).toHaveLength(1)
  expect(pack.content.whatsapp.body).toContain('honest feedback')
  expect(pack.textFiles['social-caption.txt']).toBeUndefined()
  expect(pack.textFiles['gentle-reminder.txt']).toContain(
    'https://example.test/review',
  )
  expect(() =>
    checkedGeneralPack(plan(b), {
      agentId,
      source: { ...b.source, reviewUrl: 'https://example.test/new' },
    }),
  ).toThrow(/details changed/)
  expect(
    generalCampaignGaps(
      relationshipBuilder('review-request', {
        reviewUrl: 'https://user:secret@example.test',
      }),
    ).join(' '),
  ).toMatch(/valid public HTTPS/)
})
it('requires current completed handover access, approved material and an available chosen photo', () => {
  const b = relationshipBuilder('key-handover', {
      publicName: 'Alex',
      imageId: 'photo',
    }),
    current = {
      agentId,
      source: b.source,
      transaction: { id: b.details.transactionId, area: 'Gardens' },
      images: [{ id: 'photo', url: 'https://example.test/photo.jpg' }],
    }
  const pack = checkedGeneralPack(plan(b), current)
  expect(pack.designs).toHaveLength(4)
  expect(pack.designs.map((d) => d.id)).toEqual([
    'hero-post',
    'story-1',
    'buyer-celebration',
    'seller-celebration',
  ])
  expect(pack.allowNoPhoto).toBe(false)
  expect(pack.images).toEqual(current.images)
  expect(pack.textFiles['private-buyer-congratulations.txt']).toContain(
    'new home',
  )
  expect(() =>
    checkedGeneralPack(plan(b), { ...current, transaction: null }),
  ).toThrow(/completed transaction/)
  expect(() =>
    checkedGeneralPack(plan(b), {
      ...current,
      transaction: { ...current.transaction, area: 'Sea Point' },
    }),
  ).toThrow(/area changed/)
  expect(() => checkedGeneralPack(plan(b), { ...current, images: [] })).toThrow(
    /photo is no longer available/,
  )
  expect(generalCampaignGaps({ ...b, permission: false }).join(' ')).toMatch(
    /permission/,
  )
  const branded = relationshipBuilder('key-handover')
  expect(
    checkedGeneralPack(plan(branded), {
      ...current,
      source: branded.source,
      images: [],
    }).allowNoPhoto,
  ).toBe(true)
  expect(branded.details.publicName).toBe('')
})
it('referrals need only reused public area/contact and include a permission-aware introduction follow-up', () => {
  const b = relationshipBuilder('referral-request'),
    pack = checkedGeneralPack(plan(b), { agentId, source: b.source })
  expect(b.details).toEqual({ area: 'Gardens' })
  expect(generalCampaignGaps(b)).toEqual([])
  expect(pack.designs).toHaveLength(2)
  expect(pack.textFiles['introduction-thank-you.txt']).toContain(
    'person has agreed',
  )
  expect(pack.content.social.body).toContain('permission')
})
