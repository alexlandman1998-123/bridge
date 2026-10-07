// Fictional demo pricing and draft product copy. No live quote or policy data.
export const DEMO_INSURANCE_NOTICE = 'Illustrative demo quotes'

export const DEMO_INSURANCE_PROMOTION = Object.freeze({
  eyebrow: 'A little peace of mind',
  title: 'Your home. Your peace of mind.',
  description: 'Have you thought about building and household contents insurance?',
  actionLabel: 'Explore home cover',
})

export const DEMO_BOND_LIFE_INTRODUCTION = Object.freeze({
  eyebrow: 'A home worth protecting',
  title: 'A little more certainty for your bond.',
  description: 'Cover for the people you love, and the home you’re building a life in. Explore Bond Life and Bond Life Plus from Vermillion.',
})

export const DEMO_BOND_LIFE_PRODUCTS = Object.freeze([
  Object.freeze({
    id: 'bond-life', name: 'Bond Life', provider: 'Vermillion', monthlyPremium: 189,
    description: 'Help protect your family from an outstanding bond if you pass away.',
    benefits: Object.freeze(['Life cover linked to your bond', 'Protection for the home you leave behind']),
    actionLabel: 'Explore Bond Life',
    detailTitle: 'Help leave your family a home, without the bond.',
    detailDescription: 'Bond Life is life insurance designed to help settle your outstanding bond if you pass away.',
    detailBenefits: Object.freeze([
      Object.freeze({ icon: 'life', title: 'Cover for your bond', description: 'Life cover helps pay the outstanding bond so your family has one less financial worry.' }),
      Object.freeze({ icon: 'premium', title: 'A simple monthly premium', description: 'Your insurance premium pays for your cover. It is separate from your normal bond repayment.' }),
    ]),
  }),
  Object.freeze({
    id: 'bond-life-plus', name: 'Bond Life Plus', provider: 'Vermillion', monthlyPremium: 329,
    description: 'Protect your bond through life’s unexpected turns, and put a little extra towards paying it off.',
    benefits: Object.freeze(['Bond life cover', 'Retrenchment protection', 'An extra contribution towards your bond']),
    actionLabel: 'Explore Bond Life Plus',
    detailTitle: 'Protect your bond. Bring the finish line closer.',
    detailDescription: 'Life cover and retrenchment protection help support your bond through unexpected changes. An optional extra payment goes directly into your bond, helping you pay it off sooner.',
    detailBenefits: Object.freeze([
      Object.freeze({ icon: 'life', eyebrow: 'For the people you love', title: 'Bond life cover', description: 'Help settle the outstanding bond if you pass away, protecting the home you leave behind.' }),
      Object.freeze({ icon: 'retrenchment', eyebrow: 'For unexpected changes', title: 'Retrenchment protection', description: 'Support for your repayments if you’re retrenched, subject to the cover terms.' }),
      Object.freeze({ icon: 'contribution', eyebrow: 'For the road ahead', title: 'A little extra. A shorter bond.', description: 'Put an extra amount into your bond each month. A lower balance can mean less interest and an earlier finish.' }),
    ]),
  }),
])

export const DEMO_BOND_REPAYMENT = Object.freeze({
  loanAmount: 2280000, annualInterestRate: 10.4, termMonths: 360,
  initialContribution: 500, minimumContribution: 0, maximumContribution: 3000, contributionStep: 100,
  assumption: 'Illustration assumes a constant interest rate and the extra contribution paid into your bond every month. Insurance premiums are separate.',
})

export const DEMO_INSURANCE_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'building', label: 'Building', description: 'For the structure of your home, from the roof to the fixtures that stay behind.' }),
  Object.freeze({ id: 'contents', label: 'Household contents', description: 'For the things that make it yours, like your furniture, electronics and everyday belongings.' }),
  Object.freeze({ id: 'combined', label: 'Combined' }),
])

export const DEMO_HOME_COVER_INTRODUCTION = Object.freeze({
  eyebrow: 'Your home, covered',
  title: 'A new home. A little peace of mind.',
  description: 'Explore cover for your home and the things inside it.',
  notice: 'Illustrative cover options. No insurance is purchased through this demo.',
})

const insurers = [
  { id: 'santam', name: 'Santam', prices: [389, 179, 529], excess: 2500 },
  { id: 'king-price', name: 'King Price', prices: [429, 199, 579], excess: 2000 },
  { id: 'old-mutual', name: 'Old Mutual Insure', prices: [459, 219, 619], excess: 1500 },
]
const coverage = {
  building: [{ label: 'Building cover', amount: 2400000 }],
  contents: [{ label: 'Contents cover', amount: 350000 }],
  combined: [{ label: 'Building cover', amount: 2400000 }, { label: 'Contents cover', amount: 350000 }],
}
const benefits = {
  building: ['Fire and storm damage', 'Water damage', 'Home emergency assistance'],
  contents: ['Furniture and electronics', 'Theft and fire', 'Accidental damage'],
  combined: ['Your building and belongings', 'Fire, storm and theft', 'Home emergency assistance'],
}

export const DEMO_INSURANCE_QUOTES = Object.freeze(DEMO_INSURANCE_CATEGORIES.flatMap((category, index) =>
  insurers.map(insurer => Object.freeze({
    id: `${category.id}-${insurer.id}`, category: category.id, insurer: insurer.name,
    insurerId: insurer.id, logo: `/brand/insurance/${insurer.id}.${insurer.id === 'king-price' ? 'png' : 'svg'}`,
    monthlyPremium: insurer.prices[index], excess: insurer.excess,
    coverage: Object.freeze(coverage[category.id].map(item => Object.freeze({ ...item }))),
    benefits: Object.freeze([...benefits[category.id]]),
    detail: 'Sample cover and pricing for this demonstration. A personalised quote would confirm the benefits, excesses and exclusions.',
  })),
))

export const DEMO_INSURANCE_BUNDLE = Object.freeze({
  title: 'Your cover could work better together.',
  description: 'Combining home and car cover may reduce your insurance premiums. Explore a few other options while you’re here.',
  actionLabel: 'Explore selected cover',
})

export const DEMO_ADDITIONAL_COVER = Object.freeze([
  Object.freeze({ id: 'car', label: 'Car insurance', description: 'Could you save on your car premium too?' }),
  Object.freeze({ id: 'life', label: 'Life insurance', description: 'Cover for the people who depend on you.' }),
  Object.freeze({ id: 'gap', label: 'Gap cover', description: 'Explore cover for eligible medical expense shortfalls.' }),
])
