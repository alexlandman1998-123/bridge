import React from 'react'
import {createRoot} from 'react-dom/client'
import TransactionBuyerOnboardingPanel from '../../src/components/transaction/TransactionBuyerOnboardingPanel.jsx'
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
  <div className="rounded-xl bg-emerald-900 px-5 py-3 text-sm text-white">Synthetic preview · local database · no emails sent</div>
  <header><p className="text-sm text-textMuted">Transactions / 117 Ridge Road / Deal setup</p><h1 className="mt-3 text-2xl font-semibold text-textStrong">Buyer</h1></header>
  <TransactionBuyerOnboardingPanel transactionId="00000000-0000-4000-8000-000000000801" canEdit onSendLink={async()=>{}} />
</main>)
