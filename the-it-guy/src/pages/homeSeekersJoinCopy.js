import { recruitmentPricing, recruitmentExample } from './homeSeekersRecruitment'
export const nav = [['Selling', 'selling'], ['Buying', 'buying'], ['Renting', 'renting'], ['About', 'about'], ['Join us', 'join']]
const { ffcRunnerFee, ffcPpraFee, ffcTransferFee } = recruitmentPricing
export const example = recruitmentExample()
export const annualCommission = example.commission
export const annualFee = example.cost
export const traditionalCost = example.traditionalCost
export const balloonCost = example.balloonCost
export const money = (amount) => `R${Math.round(amount).toLocaleString('en-ZA')}`
export const ffcTransferCopy = `${money(ffcRunnerFee)} for the runner handling the transfer, plus ${money(ffcPpraFee)} payable directly to the PPRA (${money(ffcTransferFee)} in total).`
export const rentalFileFee = 1000
export const rentalManagementFeeRate = 0.035
export const rentalAgentCharges = [
  ['File administration and contract fee, per new lease / rental file', `${money(rentalFileFee)} once off`],
  ['Home Seekers’ management fee', '3.5% of rent collected'],
]
export const rentalClientRecommendations = [
  ['Recommended administration and contract fee, per lease', money(1800)],
  ['Recommended in and out inspections, per tenancy', money(700)],
]
export const rentalExampleRent = 12000
export const rentalExampleManagementRate = 0.1
export const rentalExampleCommission = rentalExampleRent * rentalExampleManagementRate
export const rentalExampleFee = rentalExampleRent * rentalManagementFeeRate
export const rentalExampleAgentIncome = rentalExampleCommission - rentalExampleFee
export const paymentDetails = {
  deals: {
    suits: 'Solo agents who prefer to settle their subscription from registered deals instead of paying in advance each month.',
    steps: ['R10,000 is added to your subscription balance each month, including quiet months.', 'When a deal registers, a maximum of 50% of that deal goes towards the outstanding subscription balance.', 'Any remaining balance carries forward. The annual subscription commitment is R120,000.'],
    example: 'Three months without a registration builds a R30,000 subscription balance. On a R40,000 commission cheque, at most R20,000 goes towards that balance. The remaining R10,000 carries forward.',
  },
  monthly: {
    suits: 'Agents who want a predictable monthly payment and to settle their subscription separately from their sales.',
    steps: ['Your R9,000 monthly subscription is collected by debit order on the 1st of every month, in advance.', 'Your subscription is paid separately from your registered deals. There is no brokerage commission split.', 'Twelve monthly payments total R108,000 for the year. Each registered sale adds the same R1,500 fee.'],
  },
  upfront: {
    suits: 'Agents who prefer to settle their subscription with one annual payment.',
    steps: ['Pay R100,000 upfront for your subscription, covering the year until the same date next year.', 'Save R8,000 compared with twelve Prepaid payments of R9,000.', 'The R1,500 fee still applies to each registered sale.'],
  },
}
export const comparisons = [
  { title: 'The traditional split', copy: '70% to you. 30% to the brokerage. The better you do, the more it takes.', cost: traditionalCost },
  { title: 'The balloon model', copy: 'R8,500 a month, plus 10% of gross commission worked on a 6% rate.', cost: balloonCost },
  { title: 'The cap chase', copy: 'R950 a month, 29% to a R150,000 annual cap, plus a continuing 4% royalty.', cost: example.capCost },
  { title: 'Home Seekers', copy: 'Option 2: R9,000 a month and R1,500 per registered sale. All fees exclude VAT.', cost: annualFee, featured: true },
]
export const included = [
  { title: 'The business behind you', items: ['Property24 and Private Property on our national account', 'Our website plus twelve other listing platforms', 'Your choice of LOOM or CMA Info, with unlimited property reports', 'Virtual Agent: up to 100 contact numbers a day', 'CRM with buyer and seller portals, lead routing and your agent profile', 'Online signatures for mandates, offers and FICA', 'Our audited trust account and Fidelity Fund Certificate', 'FICA and PPRA compliance', 'Deal administration from offer to transfer', 'Commission paid out when funds reflect'] },
  { title: 'The brand in front of you', items: ['Print-ready For Sale board artwork with your face and number', 'Listing presentations and seller proposal material', 'Our in-house design studio', 'Social templates and campaign artwork', 'Live and recorded sales training from practising agents', 'Bond origination: earn on the bonds you refer', 'The 45-Day Guarantee'] },
]
export const faqs = [
  ['How do the three options differ?', 'The support is the same. Option 1, Post Paid: R10,000 a month settled from registered deals, for solo agents. Option 2, Prepaid: R9,000 collected by debit order on the 1st of every month, in advance. Option 3, Upfront: R100,000 for your subscription for the year. Every option adds R1,500 per registered sale. All fees exclude VAT. You can change your payment option at renewal.'],
  ['Do you take a share of my commission?', 'There is no brokerage split, cap or royalty. You keep 100% of your commission, less the agreed subscription and R1,500 fee per registered sale.'],
  ['Who carries the 45-day guarantee reduction?', 'If a qualifying property is not sold within 45 days, the agreed commission is reduced by 50%. The reduction comes off your commission as the agent. The guarantee requires an exclusive mandate, a listing price within 2.5% of our recommendation, reasonable access for viewings and good-faith consideration of market-value offers.'],
  ['What happens if I choose to pay from my deals?', 'The R10,000 monthly fee accrues as a balance. When a deal registers, a maximum of 50% of that deal goes towards the balance, so you retain at least half of each cheque. The balance continues to accrue during quiet months. This option is for solo agents only.'],
  ['Do I need an office?', 'No. There is no desk requirement, office hours, floor duty or compulsory Monday meeting.'],
  ['Can I join from anywhere in South Africa?', 'Yes. Agents can join from anywhere in South Africa. There is no office or desk requirement.'],
  ['What happens to my current listings?', 'Mandates stay with your current agency until they expire. We’ll help you plan the move so nothing falls over.'],
  ['Am I an employee?', 'No. You’re an independent practitioner running your own business and keeping your own book.'],
  ['Can I bring my team?', 'Yes. The leader pays R9,000 a month or R100,000 upfront for their own seat only. Additional team members must pay monthly and cannot be paid upfront. Seats 2 to 5 cost R7,000 each per month. From seat 6 onwards, the cost is R6,000 each per month. One account, one invoice. All fees exclude VAT; registered-sale fees still apply.'],
  ['What production level is this for?', 'Five registered sales in the last twelve months, or R6 million of property sold. Compare the fees against your own production: a fixed fee can cost more than a split at lower sales levels.'],
  ['Are there any other joining costs?', `There is no joining fee, desk fee, franchise royalty, marketing levy or exit fee. Your Fidelity Fund Certificate transfer costs ${ffcTransferCopy}`],
]


// Founder biographies supplied by the owner on 24 October 2026.
export const founderBio = [
  'Thomas Potgieter has worked in South African property since 2012, when he started buying, fixing and selling houses. He has been selling real estate since 2014 and has started and run a number of businesses across sales and development.',
  'In 2018 he and his wife Rode founded the agency that trades today as Home Seekers, registered with the PPRA that same year. He spent the following five years in property development before returning to sales in 2023, and in 2025 the business was rebranded as Home Seekers to take the flat fee model national.',
  'He runs Home Seekers from Pretoria with Rode Potgieter, his wife and business partner.',
]
export const founderFullBio = [
  'Thomas got into property in 2012, buying houses, fixing them and selling them. It taught him the parts of this industry that nobody puts in a brochure. What a house actually costs to make saleable, what a bad month feels like, and how much of the money ends up somewhere other than with the person who did the work.',
  'He started selling real estate in 2014 and has started and run a number of businesses since, across both sales and development.',
  'In 2018 he and his wife Rode founded the agency that trades today as Home Seekers. The brand is new. The company is not. It has been registered with the Property Practitioners Regulatory Authority since 2018 and has traded continuously ever since under its original registration.',
  'That same year Thomas moved into property development, where he spent the next five years while Rode ran the agency. He came back to sales in 2023, and what he came back to bothered him.',
  'Your accountant charges a fee. Your attorney charges a fee. Your bookkeeper charges a fee. There is exactly one supplier in an estate agent’s business that takes a percentage of everything they earn instead, and it happens to be the biggest one. He asked a lot of people to explain that and never got an answer that held up. The closest anyone got was that it has always worked that way.',
  'In 2025 the business was rebranded as Home Seekers and rebuilt around the opposite idea. Agents keep one hundred percent of their commission, less their chosen subscription and R1,500 per registered sale, excluding VAT. Everything they need to trade is included. The price list is published on this website, including the part where the model is the wrong answer for some agents, because Thomas would rather lose that agent than take a fee that doesn’t work for the person paying it.',
  'He is blunt about who Home Seekers is for and who it isn’t. Agents doing three deals a year are told so, in public and in writing.',
  'Outside the business he plays golf, and he used to race BMWs, which he has put aside while he builds this. He intends to get back to it.',
  'Thomas runs Home Seekers from Pretoria with Rode Potgieter, his wife and business partner. The aim is the largest independent agency in South Africa, built by agents who own what they build.',
]
export const rodeBio = [
  'Rode started selling real estate in 2016 and has been doing it ever since, without a break.',
  'She writes between 60 and 85 registered sales a year. She has transacted over R1 billion of property in her career.',
  'In 2026 she partnered with Mel, one of the agents in the office. The two are on track to transact well over 100 sales between them this year.',
  'In 2018 she and Thomas founded the agency that trades today as Home Seekers. While he moved into property development, she ran it.',
  'She works Pretoria East, where she is one of the busiest agents in the area.',
  'She is the reason this company has a track record rather than a business plan.',
  'Home Seekers’ systems, admin, compliance and deal flow exist because she has been running it live for years. She knows exactly where it breaks.',
  'Rode is Thomas’s wife and business partner.',
]
