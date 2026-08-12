import { ShieldAlert } from 'lucide-react'
import {
  OFFER_WORKFLOW_RETIRED_MESSAGE,
  OFFER_WORKFLOW_RETIRED_REASON,
} from '../core/offers/offerWorkflowRetirement'

function RetiredOfferWorkflowPage() {
  return (
    <main className="min-h-screen bg-[#f6f9fc] px-5 py-10 text-[#18324b]">
      <section className="mx-auto flex max-w-2xl flex-col gap-5 rounded-[24px] border border-[#dfe9f4] bg-white p-8 shadow-[0_20px_50px_rgba(31,54,78,0.08)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff0cf] text-[#8a641d]">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#607891]">OTP intake only</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[#18324b]">
            Buyer offer links have been retired
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#607891]">{OFFER_WORKFLOW_RETIRED_MESSAGE}</p>
          <p className="mt-2 text-sm leading-6 text-[#607891]">{OFFER_WORKFLOW_RETIRED_REASON}</p>
        </div>
      </section>
    </main>
  )
}

export default RetiredOfferWorkflowPage
