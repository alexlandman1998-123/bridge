import BondPageShell from '../../components/bond/BondPageShell'
import BondPageHeader from '../../components/bond/BondPageHeader'
import BondSectionCard from '../../components/bond/BondSectionCard'

export default function BondPredictiveIntelligencePage() {
  return (
    <BondPageShell>
      <BondPageHeader title="Predictive intelligence" />
      <BondSectionCard>
        <p className="text-sm leading-6 text-textMuted">Prediction data is not connected to this workspace.</p>
      </BondSectionCard>
    </BondPageShell>
  )
}
