import { propertyPackText } from './propertyCampaignPackModel'
import { PROPERTY_CAMPAIGNS } from './listingCampaignContract'
import { cleanListingBuilder, justListedGaps } from './justListedCampaignModel'
import { validateChannelContent } from './marketingCampaignTemplates'
import { assertCampaignContacts } from './campaignContactProvenance'
import {
  createEmailDocument,
  newBlock,
  renderEmail,
} from '../../../supabase/functions/_shared/emailDocument.js'

export const CAMPAIGN_PACK_DESIGNS = [
  {
    id: 'photo-post',
    label: 'Photo post',
    width: 1080,
    height: 1080,
    kind: 'intro',
    photo: 0,
  },
  ...['intro', 'facts', 'description', 'location', 'action'].map(
    (kind, index) => ({
      id: `carousel-${index + 1}`,
      label: `Carousel ${index + 1} of 5`,
      width: 1080,
      height: 1080,
      kind,
      photo: index,
    }),
  ),
  {
    id: 'story-1',
    label: 'Story 1 of 2',
    width: 1080,
    height: 1920,
    kind: 'intro',
    photo: 0,
  },
  {
    id: 'story-2',
    label: 'Story 2 of 2',
    width: 1080,
    height: 1920,
    kind: 'action',
    photo: 1,
  },
]
export function checkedCampaignPack(campaign, current) {
  if (!campaign || campaign.status !== 'draft')
    throw new Error('Open a saved Just Listed draft to prepare its assets.')
  const builder = cleanListingBuilder(campaign.listing_builder)
  assertCampaignContacts(builder, current.source)
  const gaps = justListedGaps(builder.source)
  if (gaps.length) throw new Error(gaps.join(' '))
  const fields = [
    'title',
    'price',
    'location',
    'facts',
    'description',
    'agencyName',
  ]
  if (
    builder.agentId !== current.agentId ||
    fields.some(
      (key) => (builder.source[key] || '') !== (current.source[key] || ''),
    )
  )
    throw new Error(
      'Listing or public contact details changed. Edit this campaign, refresh its details and save before preparing assets or channel drafts.',
    )
  const content = validateChannelContent(campaign.channel_content, [
    'social',
    'email',
    'whatsapp',
  ])
  if (
    ['social', 'email', 'whatsapp'].some(
      (key) => !content[key]?.title?.trim() || !content[key]?.body?.trim(),
    )
  )
    throw new Error(
      'Add the social, email and WhatsApp wording in Edit campaign before continuing.',
    )
  const images = current.images || []
  const cover = builder.source.imageId
    ? images.find((image) => image.id === builder.source.imageId)
    : null
  return {
    campaign,
    builder,
    source: builder.source,
    content,
    images: cover
      ? [cover, ...images.filter((image) => image.id !== cover.id)]
      : [],
    logoUrl: current.logoUrl || '',
  }
}
export function campaignPackText(pack) {
  if (pack.textFiles) return pack.textFiles
  const { source, content } = pack
  const af = source.language === 'af-ZA'
  const family =
    pack.builder?.version === 2
      ? PROPERTY_CAMPAIGNS[pack.builder.template].title
      : 'Just Listed'
  const action =
    pack.action || (af ? 'Reël ’n besigtiging' : 'Arrange a viewing')
  const reply = `${af ? 'Dankie vir jou belangstelling.' : 'Thank you for your interest.'}\n\n${action}: ${source.destination}\n${source.agentName} | ${source.agencyName}`
  return {
    'social-caption.txt': content.social.body,
    'email-copy.txt': `${content.email.title}\n\n${content.email.body}`,
    'whatsapp-message.txt': content.whatsapp.body,
    'enquiry-reply.txt':
      pack.builder?.version === 2
        ? reply
        : af
          ? `Dankie vir jou belangstelling in ${source.title}.\n\nOm ’n besigtiging te reël: ${source.destination}\n\n${source.agentName} | ${source.agencyName}`
          : `Thank you for your interest in ${source.title}.\n\nTo arrange a viewing: ${source.destination}\n\n${source.agentName} | ${source.agencyName}`,
    ...(pack.builder?.version === 2 ? propertyPackText(pack) : {}),
    'READ-ME.txt': `${family} campaign pack\n\n${pack.designs ? pack.designs.map((design) => `${design.label} (${design.width} × ${design.height})`).join('\n') : '1 photo post (1080 × 1080)\n5 carousel slides, in numbered order (1080 × 1080)\n2 stories, in numbered order (1080 × 1920)'}\n\nReview the images and wording before sharing. Artwork summarises your listing; full wording is in the text files. Photos may repeat where fewer than five are available. No messages have been sent or scheduled.\nCampaign: ${pack.campaign.name}\nRevision: ${pack.campaign.revision}`,
  }
}
export function checkedEmailCopyPack(campaign, agencyName) {
  if (!campaign?.planned_channels?.includes('email'))
    throw new Error('Add Email to the saved campaign before preparing an email draft.')
  const content = validateChannelContent(campaign.channel_content || {}, campaign.planned_channels)
  if (!content.email?.title?.trim() || !content.email?.body?.trim())
    throw new Error('Add an email subject and message in Edit campaign, then save before preparing the email draft.')
  if (!agencyName?.trim()) throw new Error('Your agency name is unavailable. Refresh before preparing the email draft.')
  return { campaign, content, source: { agencyName: agencyName.trim() }, copyOnly: true }
}


export function campaignEmailDraft(pack) {
  const document = createEmailDocument({ name: pack.source.agencyName })
  document.globalStyles.primaryColour = /^#[0-9a-f]{6}$/i.test(
    pack.source.primaryColor,
  )
    ? pack.source.primaryColor
    : '#326650'
  document.blocks = [
    { ...newBlock('header'), text: pack.source.agencyName, src: '' },
    { ...newBlock('text'), text: pack.content.email.title, style: 'heading' },
    { ...newBlock('text'), text: pack.content.email.body, align: 'left' },
    newBlock('footer'),
  ]
  // No expiring private photos or broad audience filters are carried into a send.
  document.arch9_campaign = {
    id: pack.campaign.id,
    revision: pack.campaign.revision,
    audience_pending: true,
    ...(pack.playbookStep ? { playbook_step: pack.playbookStep.id } : {}),
  }
  return {
    name: pack.campaign.name,
    subject: pack.content.email.title,
    contentJson: document,
    html: renderEmail(document, { agencyName: pack.source.agencyName }),
    audienceFilter: { contact_ids: ['00000000-0000-0000-0000-000000000000'] },
    senderIdentityId: '',
    subscriptionTypeId: '',
  }
}
export async function campaignHandoffId(
  organisationId,
  campaignId,
  revision,
  channel,
) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(
        `arch9-campaign:${organisationId}:${campaignId}:${revision}:${channel}`,
      ),
    ),
  )
  bytes[6] = (bytes[6] & 15) | 128
  bytes[8] = (bytes[8] & 63) | 128
  const hex = [...bytes.slice(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
