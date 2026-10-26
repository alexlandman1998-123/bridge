import {
  cleanPropertyBuilder,
  PROPERTY_CAMPAIGNS,
  propertyItems,
} from './listingCampaignContract'
import {
  projectPropertySource,
  propertyCampaignGaps,
} from './listingCampaignModel'
import { validateChannelContent } from './marketingCampaignTemplates'
import { assertCampaignContacts } from './campaignContactProvenance'

export function checkedPropertyPack(campaign, currents, event) {
  const builder = cleanPropertyBuilder(campaign.listing_builder)
  const gaps = propertyCampaignGaps(builder)
  if (gaps.length) throw new Error(gaps.join(' '))
  const members = propertyItems(builder).map((item, index) => {
    const current = currents[index]
    const fresh = projectPropertySource(
      builder.template,
      current,
      builder.settings,
    )
    assertCampaignContacts(item, fresh)
    if (
      current.agentId !== item.agentId ||
      ['title', 'price', 'location', 'facts', 'description', 'agencyName'].some(
        (key) => (item.source[key] || '') !== (fresh[key] || ''),
      )
    )
      throw new Error(
        'A selected listing or its public contact changed. Edit, refresh and save the campaign before continuing.',
      )
    const cover = current.images?.find(
      (image) => image.id === item.source.imageId,
    )
    return {
      source: item.source,
      images: cover
        ? [cover, ...current.images.filter((image) => image.id !== cover.id)]
        : [],
      logoUrl: current.logoUrl || '',
    }
  })
  if (
    builder.settings.eventId &&
    (!event ||
      ['date', 'startTime', 'endTime'].some(
        (key) => event[key] !== builder.settings[key],
      ) ||
      event.listingId !== builder.listingId)
  )
    throw new Error(
      'The saved show day changed or is no longer public. Refresh the campaign event details.',
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
      'Complete the channel wording before preparing this campaign.',
    )
  const config = PROPERTY_CAMPAIGNS[builder.template],
    source = members[0].source,
    af = source.language === 'af-ZA'
  const action = af ? config.afAction : config.action
  const label = content.social.title.split(':')[0]
  const announcement =
    builder.template === 'show-day'
      ? `${builder.settings.date} · ${builder.settings.startTime}–${builder.settings.endTime} SAST`
      : builder.template === 'property-spotlight'
        ? builder.settings.feature
        : builder.template === 'just-sold'
          ? af
            ? 'Dink jy daaraan om in die omgewing te verkoop?'
            : 'Thinking of selling nearby?'
          : ''
  const base = {
    campaign,
    builder,
    source,
    content,
    members,
    images: members[0].images,
    logoUrl: members[0].logoUrl,
    action,
    label,
    announcement,
    allowNoPhoto:
      builder.template === 'coming-soon' && !builder.settings.revealPhotos,
  }
  base.designs = propertyPackDesigns(base)
  return base
}
function propertyPackDesigns(pack) {
  const { builder, members } = pack,
    config = PROPERTY_CAMPAIGNS[builder.template]
  const square = (id, label, kind, photo = 0, member = 0) => ({
    id,
    label,
    kind,
    photo,
    member,
    width: 1080,
    height: 1080,
  })
  const story = (id, label, kind, photo = 0, member = 0) => ({
    ...square(id, label, kind, photo, member),
    height: 1920,
  })
  if (builder.template === 'property-collection')
    return members.flatMap((_, index) => [
      square(
        `collection-${index + 1}`,
        `Property ${index + 1} carousel slide`,
        'intro',
        0,
        index,
      ),
      story(
        `property-story-${index + 1}`,
        `Property ${index + 1} story`,
        'intro',
        0,
        index,
      ),
    ])
  const designs = [square('hero-post', `${config.title} post`, 'intro')]
  const kinds = ['intro', 'facts', 'description', 'action', 'location']
  for (let index = 0; index < config.carousel; index++)
    designs.push(
      square(
        `carousel-${index + 1}`,
        `Carousel ${index + 1} of ${config.carousel}`,
        kinds[index],
        index,
      ),
    )
  for (let index = 0; index < config.stories; index++)
    designs.push(
      story(
        `story-${index + 1}`,
        `Story ${index + 1} of ${config.stories}`,
        index ? 'action' : 'intro',
        index,
      ),
    )
  if (builder.template === 'just-sold')
    designs.push(square('neighbourhood-flyer', 'Neighbourhood flyer', 'intro'))
  return designs
}
export function propertyPackText(pack) {
  const result = {},
    { builder, source } = pack,
    af = source.language === 'af-ZA'
  if (builder.template === 'show-day')
    result['attendee-follow-up.txt'] =
      `${af ? 'Dankie vir jou belangstelling in' : 'Thank you for your interest in'} ${source.title}.\n${pack.action}: ${source.destination}`
  if (builder.template === 'property-spotlight')
    result['video-storyboard.txt'] = [
      source.title,
      builder.settings.feature || source.facts,
      source.location,
      `${pack.action}: ${source.destination}`,
    ]
      .map(
        (line, index) =>
          `${index + 1}. Photo ${(index % Math.max(1, pack.images.length)) + 1}: ${line}`,
      )
      .join('\n')
  if (builder.template === 'coming-soon') {
    result['interest-acknowledgement.txt'] =
      `${af ? 'Dankie vir jou belangstelling.' : 'Thank you for your interest.'}\n${pack.action}: ${source.destination}`
    result['launch-follow-up.txt'] =
      `${af ? 'Volg gerus op oor' : 'Get in touch for an update on'} ${source.title}.\n${source.destination}`
  }
  return result
}
