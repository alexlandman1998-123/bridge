export const launchStats = [
  { id: 'upcoming', label: 'Upcoming Launches', value: '3', detail: 'Next 60 days' },
  { id: 'invited', label: 'Invited', value: '462', detail: 'Across active launches' },
  { id: 'registrations', label: 'Registrations', value: '187', detail: '40.5% response rate' },
  { id: 'leads', label: 'Qualified Leads', value: '41', detail: 'This quarter' },
]

export const launches = [
  {
    id: 'rosebank-heights',
    title: 'Rosebank Heights — Phase Two Launch',
    development: 'Rosebank Heights',
    location: 'Rosebank, Johannesburg',
    date: '16 May 2026',
    time: '10:00 – 15:00',
    invited: '220',
    registrations: '94',
    attending: '61',
    leads: '18',
    readiness: 'Ready',
    status: 'Upcoming',
    image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=520&q=84',
  },
  {
    id: 'the-reserve',
    title: 'The Reserve — Private Preview Evening',
    development: 'The Reserve',
    location: 'Waterfall, Midrand',
    date: '28 May 2026',
    time: '17:30 – 20:30',
    invited: '142',
    registrations: '58',
    attending: '37',
    leads: '13',
    readiness: 'In progress',
    status: 'Planning',
    image: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=520&q=84',
  },
  {
    id: 'parkside',
    title: 'Parkside Residences — Investor Launch',
    development: 'Parkside Residences',
    location: 'Menlyn, Pretoria',
    date: '18 Apr 2026',
    time: '11:00 – 14:00',
    invited: '100',
    registrations: '35',
    attending: '29',
    leads: '10',
    readiness: 'Complete',
    status: 'Completed',
    image: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=520&q=84',
  },
]

export const launchTabs = ['All Launches', 'Upcoming', 'Planning', 'Completed']

export const auctionStats = [
  { id: 'active', label: 'Active Auctions', value: '4', detail: 'Across 3 branches' },
  { id: 'bidders', label: 'Registered Bidders', value: '96', detail: 'This month' },
  { id: 'lots', label: 'Upcoming Lots', value: '12', detail: 'Next 30 days' },
  { id: 'clearance', label: 'Clearance Rate', value: '78%', detail: 'Last 90 days' },
]

export const auctions = [
  {
    id: 'waterkloof-ridge',
    title: 'Contemporary Residence in Waterkloof Ridge',
    address: '41 Orion Avenue, Waterkloof Ridge, Pretoria',
    date: '23 May 2026',
    time: '11:00',
    guidePrice: 'R4,800,000',
    bidders: '24',
    viewings: '38',
    documents: 'Verified',
    status: 'Bidding open',
    image: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=520&q=84',
  },
  {
    id: 'menlyn-commercial',
    title: 'Prime Commercial Office — Menlyn',
    address: '180 Amarand Avenue, Menlyn, Pretoria',
    date: '30 May 2026',
    time: '12:30',
    guidePrice: 'R8,250,000',
    bidders: '17',
    viewings: '26',
    documents: 'Verified',
    status: 'Upcoming',
    image: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=520&q=84',
  },
  {
    id: 'silver-lakes-estate',
    title: 'Family Home in Silver Lakes Golf Estate',
    address: '16 Pebble Beach Drive, Silver Lakes, Pretoria',
    date: '7 Jun 2026',
    time: '10:00',
    guidePrice: 'R3,950,000',
    bidders: '8',
    viewings: '14',
    documents: 'In review',
    status: 'Preparing',
    image: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=520&q=84',
  },
]

export const auctionTabs = ['All Auctions', 'Bidding Open', 'Upcoming', 'Preparing', 'Completed']
