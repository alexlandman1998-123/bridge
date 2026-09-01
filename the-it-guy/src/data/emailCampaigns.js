export const emailCampaignStats = [
  { id: 'campaigns', label: 'Campaigns', value: '14', detail: 'This month' },
  { id: 'recipients', label: 'Recipients', value: '3,514', detail: 'This month' },
  { id: 'opened', label: 'Opened', value: '2,768', detail: '38.6% open rate' },
  { id: 'clicked', label: 'Clicked', value: '612', detail: '8.7% click rate' },
]

export const emailCampaigns = [
  {
    id: 'constantia-park-listing',
    name: 'New Listing: 3 Bedroom Home in Constantia Park',
    audience: 'Buyers in Pretoria East, Price R2m–R4m',
    sentAt: '28 Apr 2026, 10:30',
    recipients: '184',
    opened: '72',
    openRate: '39%',
    clicked: '18',
    clickRate: '10%',
    replies: '7',
    status: 'Sent',
    thumbnail: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=420&q=82',
    thumbnailAlt: 'Modern family home exterior',
  },
  {
    id: 'april-market-update',
    name: 'April Market Update',
    audience: 'Past Buyers & Sellers',
    sentAt: '20 Apr 2026, 09:00',
    recipients: '423',
    opened: '186',
    openRate: '44%',
    clicked: '34',
    clickRate: '8%',
    replies: '12',
    status: 'Sent',
    thumbnailType: 'market-update',
  },
]

export const emailCampaignDraft = {
  id: 'homes-under-2m',
  name: 'Property Alert: New Homes Under R2m',
  updatedAt: 'Draft updated 30 Apr 2026, 11:09',
  status: 'Draft',
}

export const emailCampaignTabs = ['All Campaigns', 'Scheduled', 'Sent', 'Drafts', 'Automations']

export const emailCampaignSteps = [
  { id: 1, label: 'Campaign', detail: 'Campaign details' },
  { id: 2, label: 'Audience', detail: 'Who to send to' },
  { id: 3, label: 'Content', detail: 'Create your email' },
  { id: 4, label: 'Review', detail: 'Review and send' },
]

export const emailCampaignForm = {
  defaultName: 'New Listing: 3 Bedroom Home in Constantia Park',
  senderName: 'Home Seekers',
  senderEmail: 'hello@homeseekers.co.za',
  replyToEmail: 'alex@homeseekers.co.za',
  campaignTypes: [
    { id: 'marketing', title: 'Marketing / Promotional', detail: 'Listings, property alerts, market updates and newsletters' },
    { id: 'transactional', title: 'Transactional', detail: 'Transaction updates, client notifications and operational communication' },
  ],
}

export const emailCampaignInfo = {
  title: 'About email campaigns',
  heading: 'Build relationships beyond the inbox',
  description: 'Create engaging emails to reach your audience, share updates, promote listings and drive enquiries.',
  checklist: ['Beautiful email templates', 'Personalise with variables', 'Track opens, clicks & replies', 'Connects with your CRM'],
}

export const emailCampaignNextSteps = [
  { id: 'audience', title: 'Select your audience', detail: 'Choose who will receive this campaign' },
  { id: 'content', title: 'Create your email', detail: 'Design your email template and content' },
  { id: 'review', title: 'Review and send', detail: 'Review the campaign before sending' },
]
