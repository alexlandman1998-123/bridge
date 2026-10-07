import { useState } from 'react'
import { DemoBondFeatureIcon, DemoBondLifeProducts, DemoBondRepaymentIllustration } from './DemoInsuranceComponents'
import { DEMO_BOND_LIFE_PRODUCTS, DEMO_BOND_REPAYMENT } from './demoInsuranceData'
import { calculateDemoBondRepayment, formatBondPeriod } from './demoBondRepayment'

const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })

export default function DemoBondLifeSection({ theme }) {
  const [selectedProductId, setSelectedProductId] = useState('')
  const [extraContribution, setExtraContribution] = useState(DEMO_BOND_REPAYMENT.initialContribution)
  const selected = DEMO_BOND_LIFE_PRODUCTS.find(product => product.id === selectedProductId)
  const repayment = selectedProductId === 'bond-life-plus' ? calculateDemoBondRepayment({ ...DEMO_BOND_REPAYMENT, extraContribution }) : null
  const estimate = repayment ? {
    repaymentPeriodLabel: formatBondPeriod(repayment.repaymentMonths),
    timeSavedLabel: formatBondPeriod(repayment.timeSavedMonths),
    interestSavedLabel: money.format(repayment.interestSaved),
    monthlyRepaymentLabel: money.format(repayment.monthlyRepayment),
    loanAmountLabel: money.format(DEMO_BOND_REPAYMENT.loanAmount),
    annualInterestRateLabel: `${DEMO_BOND_REPAYMENT.annualInterestRate}%`,
    originalTermLabel: formatBondPeriod(DEMO_BOND_REPAYMENT.termMonths),
  } : null

  return <DemoBondLifeProducts theme={theme} selectedProductId={selectedProductId} onSelectProduct={setSelectedProductId}>
    {selected ? <div className="demo-insurance-product-detail">
      <div className="demo-insurance-product-detail-heading"><p className="demo-insurance-eyebrow">{selected.name} · {selected.provider}</p><h3>{selected.detailTitle}</h3></div>
      <p className="demo-insurance-product-detail-intro">{selected.detailDescription}</p>
      <dl className="demo-insurance-detail-benefits">
        {selected.detailBenefits.map(benefit => <div key={benefit.title} className={`demo-insurance-detail-benefit-${benefit.icon}`}>
          <dt><DemoBondFeatureIcon kind={benefit.icon} />{benefit.eyebrow ? <span className="demo-insurance-detail-benefit-eyebrow">{benefit.eyebrow}</span> : null}<span>{benefit.title}</span></dt><dd>{benefit.description}</dd>
        </div>)}
      </dl>
      {estimate ? <DemoBondRepaymentIllustration theme={theme} extraContribution={extraContribution} onContributionChange={setExtraContribution} monthlyPremium={selected.monthlyPremium} estimate={estimate} /> : null}
      <p className="demo-insurance-footnote demo-insurance-product-detail-notice">Illustrative product information and pricing. No cover is purchased through this demo. Insurance premiums are separate from extra bond contributions.</p>
    </div> : null}
  </DemoBondLifeProducts>
}
