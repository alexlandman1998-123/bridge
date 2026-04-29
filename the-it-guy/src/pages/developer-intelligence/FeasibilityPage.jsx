import { useState } from 'react'
import { FeasibilityModal, IntelligenceShell } from './components'
import { feasibilityScenario } from './mockData'

function DeveloperIntelligenceFeasibilityPage() {
  const [modalOpen, setModalOpen] = useState(true)

  return (
    <IntelligenceShell
      sectionTitle="Feasibility Tool"
      sectionSubtitle="Run AI-backed feasibility scenarios before capital is committed."
    >
      <section className="rounded-3xl border border-[#d8e5f3] bg-white/90 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
        <h2 className="text-[1.3rem] font-semibold tracking-[-0.03em] text-[#142132]">AI Feasibility Workspace</h2>
        <p className="mt-2 max-w-3xl text-[0.95rem] leading-7 text-[#607389]">
          Use the full-screen simulation to evaluate viability, demand fit, pricing risk, and predicted absorption before launch.
        </p>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="mt-4 rounded-full border border-[#2f628d] bg-[#315f86] px-4 py-2 text-[0.84rem] font-semibold text-white shadow-[0_12px_26px_rgba(49,95,134,0.25)] transition hover:bg-[#2a5577]"
        >
          Launch Feasibility Tool
        </button>
      </section>

      <FeasibilityModal open={modalOpen} onClose={() => setModalOpen(false)} scenario={feasibilityScenario} />
    </IntelligenceShell>
  )
}

export default DeveloperIntelligenceFeasibilityPage
