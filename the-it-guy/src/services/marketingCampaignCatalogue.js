// The 19 launch families share personalised builders and downloadable packs.
export const CAMPAIGN_CATEGORIES = [
  { id: 'property', label: 'Promote a Property', icon: 'house' },
  { id: 'sellers', label: 'Find Sellers', icon: 'key' },
  { id: 'buyers', label: 'Find Buyers', icon: 'search' },
  { id: 'brand', label: 'Build Your Brand', icon: 'megaphone' },
  { id: 'relationships', label: 'Celebrate & Connect', icon: 'celebration' },
]

const categoryGoals = {
  property: 'promote_listing',
  sellers: 'seller_leads',
  buyers: 'buyer_leads',
  brand: 'custom',
  relationships: 'reengage',
}
const goalCategories = {
  promote_listing: 'property',
  seller_leads: 'sellers',
  buyer_leads: 'buyers',
  reengage: 'relationships',
}
const propertyPhoto = '/brand/landlord-demo/ocean-view-villa.jpg'

function defineTemplate(input) {
  const channels = input.channels || ['social', 'email', 'whatsapp']
  return {
    ...input,
    version: 1,
    name: input.name || input.title,
    goal: categoryGoals[input.category],
    mode: 'bounded',
    duration_days: input.duration_days || 14,
    angle: input.headline,
    angleLabel: input.title,
    secondaryCategories: input.secondaryCategories || [],
    channels,
    channel_content: Object.fromEntries(channels.map((channel) => [channel, {
      title: channel === 'email' ? input.emailSubject || input.headline : input.headline,
      body: channel === 'email'
        ? `Hi [first name],\n\n${input.body}\n\n[Agent name]\n[Agency name]`
        : `${input.body}\n\n[Agent name] · [Agency name]`,
      timing: channel === 'whatsapp'
        ? 'Review the message, audience permission and approved template in the WhatsApp tool before sending.'
        : channel === 'email'
          ? 'Review the content, sender and audience in the email tool before sending.'
          : 'Review all facts, permissions and links before posting manually.',
    }])),
  }
}

export const campaignShopTemplates = [
  defineTemplate({
    id: 'new-listing', title: 'Just Listed', name: 'New listing launch', category: 'property',
    description: 'Introduce your newest property and invite buyers to view it.',
    objective: 'Generate property enquiries and viewing requests for a new listing',
    audience: 'Buyers looking for a property like this listing', offer: 'Explore the property and book a viewing',
    tags: ['New listing', 'Buyers', 'Brand awareness'], secondaryCategories: ['buyers', 'brand'],
    headline: 'Just listed. Your next move?', emailSubject: 'New listing in [suburb]: [property headline]', cta: 'Book a viewing',
    setupHint: 'Start with a listing', previewImage: propertyPhoto,
    plannedAssets: ['Photo post', '5-slide carousel', '2 stories', 'WhatsApp message', 'Enquiry reply'],
    body: 'Discover [property address] in [suburb]. [Bedrooms] bedrooms · [bathrooms] bathrooms · [price].\n\n[One standout feature]. Explore the photos and book a viewing: [listing link]',
  }),
  defineTemplate({
    id: 'show-day', title: 'Show Day / Open House', category: 'property',
    description: 'Invite buyers to an upcoming property viewing.', objective: 'Generate enquiries about a property viewing event',
    audience: 'Buyers interested in this property', offer: 'Visit the property at a scheduled show day',
    tags: ['Viewing event', 'Buyers', 'Viewing bookings'], secondaryCategories: ['buyers'],
    headline: 'Come and see for yourself.', cta: 'Enquire about attending', setupHint: 'Start with a listing and event details', previewImage: propertyPhoto,
    plannedAssets: ['Event post', '4-slide carousel', 'Announcement and reminder stories', 'WhatsApp invitation', 'Attendee follow-up'],
    body: 'Visit [public property address] in [suburb] on [show day date], [start time]–[end time].\n\n[Property highlights]. Enquire about attending: [enquiry link]',
  }),
  defineTemplate({
    id: 'property-spotlight', title: 'Property Spotlight', category: 'property',
    description: 'Give a listing fresh attention with its standout features.', objective: 'Generate enquiries about a featured property',
    audience: 'Buyers looking for this type of property', offer: 'Explore the features and arrange a viewing',
    tags: ['Property features', 'Buyers', 'Brand awareness'], secondaryCategories: ['buyers', 'brand'],
    headline: 'A little more room to live.', cta: 'Arrange a viewing', setupHint: 'Start with a listing and standout feature', previewImage: '/brand/landlord-demo/maple-grove-8.jpg',
    plannedAssets: ['Hero post', '5-slide feature carousel', '2 stories', 'Short video storyboard', 'WhatsApp message'],
    body: 'Take a closer look at [property headline] in [suburb].\n\n[Confirmed standout feature]\n[Property facts] · [price]\n\nArrange a viewing: [enquiry link]',
  }),
  defineTemplate({
    id: 'price-reduced', title: 'Price Reduced', category: 'property',
    description: 'Bring a new asking price to interested buyers.', objective: 'Re-engage buyers with a confirmed updated property price',
    audience: 'Interested buyers and previous property enquirers', offer: 'View the property at its updated asking price',
    tags: ['Price change', 'Buyers', 'Re-engagement'], secondaryCategories: ['buyers'],
    headline: 'The home you love. A new price.', cta: 'Book a viewing', setupHint: 'Confirm the updated listing price', previewImage: propertyPhoto,
    plannedAssets: ['Updated-price post', '3-slide carousel', 'Story', 'WhatsApp message', 'Enquiry reply'],
    body: '[Property headline] in [suburb] now has an asking price of [confirmed updated price].\n\n[Property highlights]. Book a viewing: [listing link]',
  }),
  defineTemplate({
    id: 'coming-soon', title: 'Coming Soon', category: 'property',
    description: 'Build interest before a property launches.', objective: 'Collect buyer interest before a property becomes publicly available',
    audience: 'Buyers looking in the listing area', offer: 'Hear when the property launches',
    tags: ['Pre-launch', 'Buyers', 'Buyer registration'], secondaryCategories: ['buyers'],
    headline: 'Something special is on its way.', cta: 'Register your interest', setupHint: 'Confirm what can be revealed', previewImage: '/brand/landlord-demo/the-mews-3.jpg',
    plannedAssets: ['Teaser post', '2 stories', 'WhatsApp invitation', 'Interest acknowledgement', 'Launch follow-up'],
    body: 'Coming soon to [permitted public area]: [approved teaser details].\n\nRegister your interest to hear when it launches: [enquiry link]',
  }),
  defineTemplate({
    id: 'property-collection', title: 'Property Collection', category: 'property',
    description: 'Bring a selection of available homes together.', objective: 'Generate buyer enquiries across a curated property collection',
    audience: 'Buyers looking in the selected areas', offer: 'Explore a selection of available properties',
    tags: ['Property collection', 'Property alerts', 'Buyers'], secondaryCategories: ['buyers'],
    headline: 'Find your kind of home.', cta: 'Explore the collection', setupHint: 'Choose 3–6 listings', previewImage: '/brand/landlord-demo/maple-grove-8.jpg',
    plannedAssets: ['Multi-property carousel', 'Story per property', 'Email roundup', 'WhatsApp introduction'],
    body: 'Your next home could be in this collection.\n\n[Property 1 headline, price and link]\n[Property 2 headline, price and link]\n[Property 3 headline, price and link]\n\nTell us which property you would like to view: [enquiry link]',
  }),
  defineTemplate({
    id: 'sellers', title: 'What Is Your Home Worth?', name: 'Seller valuation campaign', category: 'sellers',
    description: 'Start your next conversation with a local homeowner.', objective: 'Generate valuation requests from local homeowners',
    audience: 'Homeowners in your service area', offer: 'A property valuation, with terms to confirm',
    tags: ['Valuation', 'Homeowners', 'Area expertise'],
    headline: 'What is your home worth?', cta: 'Request a valuation', setupHint: 'Confirm your service area and valuation offer',
    plannedAssets: ['Valuation post', '4-slide explainer', '2 stories', 'WhatsApp message', 'Enquiry acknowledgement'],
    body: 'Thinking about selling in [area]? Get a clearer picture of your property’s potential with [confirmed valuation offer and terms].\n\nRequest a valuation: [enquiry link]',
  }),
  defineTemplate({
    id: 'just-sold', title: 'Just Sold Nearby', category: 'sellers',
    description: 'Turn a local result into your next seller opportunity.', objective: 'Generate seller enquiries using a verified local property sale',
    audience: 'Homeowners near a recently sold property', offer: 'Discuss the potential of a nearby property',
    tags: ['Just sold', 'Local results', 'Social proof', 'Brand awareness'], secondaryCategories: ['brand', 'relationships'],
    headline: 'Recently sold in your neighbourhood.', cta: 'Discuss selling your property', setupHint: 'Choose a sold listing and confirm publishable details', previewImage: propertyPhoto,
    plannedAssets: ['Result post', '4-slide result carousel', 'Story', 'Digital square neighbourhood flyer', 'Enquiry reply'],
    body: 'Recently sold in [permitted public area].\n\nThinking of selling nearby? Discuss selling your property: [seller enquiry link]',
  }),
  defineTemplate({
    id: 'thinking-of-selling', title: 'Thinking of Selling?', category: 'sellers',
    description: 'Help homeowners take a practical first step.', objective: 'Generate selling consultations with local homeowners',
    audience: 'Homeowners considering a sale', offer: 'A conversation about preparing and selling a property',
    tags: ['Seller education', 'Home preparation', 'Homeowners'],
    headline: 'Thinking about a fresh start?', cta: 'Book a selling consultation', setupHint: 'Confirm your agent and service area',
    plannedAssets: ['Introductory post', '5-slide preparation checklist', 'Story', 'Email', 'Consultation follow-up'],
    body: 'Considering selling in [area]? Start with a plan for your next move.\n\n[Confirmed home preparation guidance]. Discuss the process, preparation and next steps: [consultation link]',
  }),
  defineTemplate({
    id: 'buyer-demand', title: 'Buyers Looking in Your Area', category: 'sellers',
    description: 'Connect genuine buyer requirements with local homeowners.', objective: 'Find potential sellers whose properties match confirmed buyer requirements',
    audience: 'Homeowners with properties matching an active buyer brief', offer: 'Discuss whether a property matches a current buyer search',
    tags: ['Buyer demand', 'Homeowners', 'Area expertise'],
    headline: 'Could your property be a match?', cta: 'Contact the agent', setupHint: 'Confirm a current buyer brief',
    plannedAssets: ['Requirements post', 'Story', 'WhatsApp message', 'Digital square neighbourhood flyer', 'Homeowner reply'],
    body: 'We are helping an active buyer find [confirmed property type and requirements] in [area], with a budget of [confirmed budget].\n\nCould your property be a match? Contact us: [enquiry link]',
  }),
  defineTemplate({
    id: 'buyers', title: 'Find Your Next Home', name: 'Find your next buyer', category: 'buyers',
    description: 'Turn a buyer’s wishlist into a useful conversation.', objective: 'Collect buyer requirements and generate property-search enquiries',
    audience: 'Buyers looking in your service area', offer: 'Help finding properties that match the buyer’s requirements',
    tags: ['Buyer registration', 'Property search', 'Moving home'],
    headline: 'Let’s find your place.', cta: 'Tell us what you’re looking for', setupHint: 'Confirm your service area', previewImage: '/brand/agency-intake-buy.webp',
    plannedAssets: ['Registration post', '4-slide wishlist carousel', '2 stories', 'WhatsApp message', 'Welcome reply'],
    body: 'Looking for your next home in [area]? Tell us your preferred location, budget and must-haves.\n\nWe can help you explore suitable properties. Share your wishlist: [buyer enquiry link]',
  }),
  defineTemplate({
    id: 'first-time-buyer', title: 'First-Time Buyer Starter', category: 'buyers',
    description: 'Make the first step towards ownership easier.', objective: 'Generate enquiries from first-time buyers through useful guidance',
    audience: 'People preparing to buy their first property', offer: 'A reviewed first-time buyer checklist',
    tags: ['First-time buyers', 'Education', 'Brand awareness'], secondaryCategories: ['brand'],
    headline: 'Your first home starts with a little know-how.', cta: 'Get your buyer checklist', setupHint: 'Confirm your agent and reviewed buyer checklist',
    plannedAssets: ['Introductory post', '5-slide buying guide', 'Story', 'Downloadable buyer checklist (.txt)', 'Delivery message', 'Follow-up invitation'],
    body: 'Buying your first home? Our [reviewed buyer checklist] can help you prepare for the steps ahead.\n\nGet the checklist or speak to [Agent name]: [checklist or enquiry link]',
  }),
  defineTemplate({
    id: 'meet-your-agent', title: 'Meet Your Agent', category: 'brand',
    description: 'Put a face to your local property expertise.', objective: 'Build awareness and trust in an individual agent',
    audience: 'Local buyers, sellers and homeowners', offer: 'Meet your local agent and learn how they can help',
    tags: ['Agent introduction', 'Personal brand', 'Area expertise'],
    headline: 'Good people. Local knowledge.', cta: 'Let’s talk property', setupHint: 'Start with an agent profile and portrait',
    plannedAssets: ['Portrait post', '4-slide introduction', '2 stories', 'WhatsApp introduction', 'Short biography'],
    body: 'Meet [Agent name], [confirmed professional title] at [Agency name].\n\n[Approved biography and areas served].\n\nLet’s talk about your next property move: [agent contact link]',
  }),
  defineTemplate({
    id: 'client-success', title: 'Client Success Story', category: 'brand',
    description: 'Show the care and service behind a client’s result.', objective: 'Build trust using an approved client testimonial and verified outcome',
    audience: 'Prospective buyers and sellers', offer: 'Learn how the agency helped a client',
    tags: ['Testimonial', 'Social proof', 'Buyers', 'Sellers'], secondaryCategories: ['buyers', 'sellers'],
    headline: 'A great move. In their own words.', cta: 'Discuss your next move', setupHint: 'Choose an approved testimonial and confirm permission',
    plannedAssets: ['Testimonial post', '4-slide success story', 'Story graphic', 'Email', 'Enquiry reply'],
    body: '“[Approved client testimonial]”\n— [Approved client attribution]\n\n[Verified context and outcome]. Planning your own move? Let’s talk: [enquiry link]',
  }),
  defineTemplate({
    id: 'market-update', title: 'Your Local Market Update', category: 'brand',
    description: 'Make local property activity easy to understand.', objective: 'Build local expertise through a sourced property market update',
    audience: 'Buyers, sellers and homeowners in the selected area', offer: 'An understandable summary of verified local market activity',
    tags: ['Market update', 'Area expertise', 'Education', 'Buyers', 'Sellers'], secondaryCategories: ['buyers', 'sellers'],
    headline: 'Your neighbourhood, in focus.', cta: 'Ask about your local market', setupHint: 'Choose a sourced report and reporting period',
    plannedAssets: ['Market snapshot post', '5-slide explainer', '2 stories', 'Email', 'Enquiry reply'],
    body: 'Your [area] property update for [reporting period].\n\n[Verified figures and explanation]\nSource: [report source and date].\n\nAsk what this could mean for your next move: [enquiry link]',
  }),
  defineTemplate({
    id: 'key-handover', title: 'Congratulations & Key Handover', category: 'relationships',
    description: 'Celebrate the people behind a completed move.', objective: 'Celebrate a client milestone and maintain the relationship',
    audience: 'Clients celebrating a sale or home handover', offer: 'A personal congratulations and thank-you',
    tags: ['Just sold', 'Handover', 'Client celebration', 'Buyers', 'Sellers'], secondaryCategories: ['brand'],
    headline: 'Here’s to your next chapter.', cta: 'Reply to your agent', setupHint: 'Choose a completed transaction; confirm public sharing permission',
    plannedAssets: ['Buyer and seller celebration variants', 'Branded post or approved listing photo', 'Story', 'Private congratulations', 'Thank-you message'],
    body: 'Congratulations, [approved client name]! Wishing you many happy moments in your next chapter.\n\nThank you for letting us be part of your journey. [Personal message].',
  }),
  defineTemplate({
    id: 'review-request', title: 'Share Your Experience', category: 'relationships',
    description: 'Make leaving a review personal and straightforward.', objective: 'Collect genuine reviews from clients after working together',
    audience: 'Recent clients', offer: 'An invitation to share honest feedback', channels: ['whatsapp', 'email'],
    tags: ['Reviews', 'Feedback', 'Past clients', 'Trust'], secondaryCategories: ['brand'],
    headline: 'Your story means the world to us.', cta: 'Leave a review', setupHint: 'Review your saved review link; choose recipients in channel tools',
    plannedAssets: ['Personal WhatsApp request', 'Email request', 'Gentle reminder', 'Thank-you reply', 'Optional review-link graphic'],
    body: 'Thank you for choosing us, [first name]. We would appreciate hearing about your experience.\n\nYou can leave an honest review here: [confirmed review link]. Thank you for your time.',
  }),
  defineTemplate({
    id: 'client-check-in', title: 'A Personal Check-in', category: 'relationships',
    description: 'Stay useful to past clients without inventing a milestone or market news.',
    objective: 'Invite existing clients to share changed property plans or questions',
    audience: 'Existing clients with permission to hear from the agency', offer: 'An optional conversation with their agent',
    tags: ['Client nurture', 'Past clients', 'Personal check-in'], headline: 'How are your property plans taking shape?',
    cta: 'Talk to your agent', setupHint: 'Confirm your public agent details and choose eligible contacts',
    plannedAssets: ['Personal email', 'WhatsApp message', 'Social post', 'Story', 'Enquiry reply'],
    body: 'Checking in to ask whether your property plans or questions have changed. Reply when it suits you: [agent contact].',
  }),
  defineTemplate({
    id: 'referral-request', title: 'Know Someone Making a Move?', category: 'relationships',
    description: 'Turn good relationships into personal introductions.', objective: 'Encourage introductions to potential buyers and sellers',
    audience: 'Past clients and existing contacts', offer: 'Help for someone planning a property move',
    tags: ['Referrals', 'Past clients', 'Buyers', 'Sellers'], secondaryCategories: ['buyers', 'sellers'],
    headline: 'Good things start with an introduction.', cta: 'Introduce us', setupHint: 'Confirm your agent and enquiry destination',
    plannedAssets: ['Personal WhatsApp request', 'Email', 'Social post', 'Story', 'Introduction thank-you'],
    body: 'Know someone thinking of buying or selling in [area]? We would be happy to help.\n\nPlease share our contact details or make an introduction with their permission: [agent contact link].',
  }),
]

export function campaignTemplateCategory(template) {
  return template.category || goalCategories[template.goal] || null
}

export function matchesCampaignTemplate(template, { category = 'all', search = '' } = {}) {
  if (category !== 'all' && campaignTemplateCategory(template) !== category &&
      !template.secondaryCategories?.includes(category)) return false
  const categoryLabels = CAMPAIGN_CATEGORIES
    .filter((item) => item.id === campaignTemplateCategory(template) || template.secondaryCategories?.includes(item.id))
    .map((item) => item.label)
  const text = [template.title, template.name, template.description, template.objective,
    template.audience, template.offer, template.area, template.cta, ...(template.tags || []),
    ...(template.plannedAssets || []), ...(template.channels || []), ...categoryLabels]
    .join(' ').toLowerCase()
  return search.trim().toLowerCase().split(/\s+/).every((word) => text.includes(word))
}
