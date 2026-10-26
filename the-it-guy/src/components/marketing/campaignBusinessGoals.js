// Product-facing entry points into the existing campaign builders. These are
// reviewed starters, never saved audiences, delivery promises or inferred results.
export const BUSINESS_CAMPAIGN_GOALS = [
  {
    id: 'seller-growth', title: 'Win valuations & seller mandates', shortTitle: 'Attract sellers', icon: 'sellers',
    description: 'Give local homeowners a useful reason to speak to you.',
    outcome: 'Start a valuation or selling conversation.', action: 'Build a seller campaign',
    audience: 'Homeowners in your service area, using recorded marketing permission.',
    approaches: [
      { template: 'sellers', title: 'Invite a valuation', detail: 'Your confirmed valuation offer and enquiry route.' },
      { template: 'thinking-of-selling', title: 'Start a selling conversation', detail: 'A practical preparation guide and consultation invitation.' },
      { template: 'buyer-demand', title: 'Share a current buyer search', detail: 'A public buyer brief you have confirmed and approved.' },
    ],
  },
  {
    id: 'buyer-growth', title: 'Find buyers', shortTitle: 'Find buyers', icon: 'buyers',
    description: 'Turn a property wishlist into your next buyer relationship.',
    outcome: 'Collect buyer requirements and start relevant property searches.', action: 'Build a buyer campaign',
    audience: 'People looking for a home in your area; choose an eligible CRM audience after saving.',
    approaches: [
      { template: 'buyers', title: 'Invite buyers to share a wishlist', detail: 'A clear introduction and next step into your buyer enquiry route.' },
      { template: 'first-time-buyer', title: 'Help a first-time buyer', detail: 'A useful, reviewed checklist to begin the conversation.' },
    ],
  },
  {
    id: 'brand-expertise', title: 'Build your brand & local expertise', shortTitle: 'Build your brand', icon: 'brand',
    description: 'Help people recognise your face, your knowledge and your service.',
    outcome: 'Build familiarity and trust before the next property decision.', action: 'Build your introduction',
    audience: 'Local buyers, sellers and homeowners you are permitted to contact.',
    approaches: [
      { template: 'meet-your-agent', title: 'Introduce yourself', detail: 'Your approved biography, portrait and areas served.' },
      { template: 'market-update', title: 'Explain your local market', detail: 'A sourced update using facts and dates you confirm.' },
      { template: 'client-success', title: 'Share a client success story', detail: 'An exact approved testimonial with publication permission.' },
    ],
  },
  {
    id: 'client-nurture', title: 'Nurture past clients', shortTitle: 'Stay connected', icon: 'nurture',
    description: 'Stay useful long after the keys have changed hands.',
    outcome: 'Reopen a useful conversation with previous buyers and sellers.', action: 'Build a client check-in',
    audience: 'Previous clients with permission for the selected channel and purpose.',
    approaches: [
      { template: 'client-check-in', title: 'Send a personal check-in', detail: 'A thoughtful reason to reconnect, without inventing a milestone.' },
      { template: 'market-update', title: 'Share useful local insight', detail: 'Your reviewed market summary, source and reporting period.' },
      { template: 'key-handover', title: 'Celebrate a completed move', detail: 'A permitted completed transaction and explicit sharing permission.' },
    ],
  },
  {
    id: 'reviews-referrals', title: 'Earn reviews & referrals', shortTitle: 'Reviews & referrals', icon: 'advocacy',
    description: 'Make a good experience easy to share with the right people.',
    outcome: 'Invite honest feedback or a permission-based introduction.', action: 'Build a referral invitation',
    audience: 'Clients you have served; review individual recipients before sending.',
    approaches: [
      { template: 'referral-request', title: 'Ask for an introduction', detail: 'A gentle invitation that respects the other person’s permission.' },
      { template: 'review-request', title: 'Invite an honest review', detail: 'Your saved public review link, with email and WhatsApp wording.' },
      { template: 'client-success', title: 'Share an approved testimonial', detail: 'The exact quote, attribution and verified story you can publish.' },
    ],
  },
  {
    id: 'property-marketing', title: 'Market a property', shortTitle: 'Promote a property', icon: 'property',
    description: 'Put a property, its story and a clear next step in front of buyers.',
    outcome: 'Generate recorded enquiries and viewing conversations.', action: 'Build a property campaign',
    audience: 'Buyers with relevant recorded requirements and channel permission.',
    approaches: [
      { template: 'new-listing', title: 'Launch a new listing', detail: 'Branded artwork and channel copy from the saved listing.' },
      { template: 'price-reduced', title: 'Share a confirmed price change', detail: 'Current listing facts with an explicit price confirmation.' },
      { template: 'show-day', title: 'Invite buyers to a show day', detail: 'A public event and the saved property it belongs to.' },
      { template: 'property-collection', title: 'Curate a property collection', detail: 'Bring several permitted properties into one campaign.' },
    ],
  },
]

export const businessGoalForTemplate = (template, preferredGoalId) => BUSINESS_CAMPAIGN_GOALS.find((goal) => goal.id === preferredGoalId && goal.approaches.some((approach) => approach.template === template)) || BUSINESS_CAMPAIGN_GOALS.find((goal) => goal.approaches.some((approach) => approach.template === template))
export const businessCampaignHref = (template, preferredGoalId) => {
  const goal = businessGoalForTemplate(template, preferredGoalId)
  return `/marketing?${new URLSearchParams({ section: 'campaigns', view: 'create', template, ...(goal ? { goal: goal.id } : {}) })}`
}
