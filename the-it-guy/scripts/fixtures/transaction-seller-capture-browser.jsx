import React from 'react'
import { createRoot } from 'react-dom/client'
import TransactionSellerCapturePanel from '../../src/components/transaction/TransactionSellerCapturePanel.jsx'
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-5xl p-5 sm:p-8">
  <header className="mb-5 rounded-2xl bg-[#123d30] p-6 text-white"><p className="text-xs uppercase tracking-widest text-emerald-100">Backfill transaction preview · Synthetic data</p><h1 className="mt-2 text-2xl font-semibold text-white">Deal Setup</h1><p className="mt-1 text-sm text-emerald-100">Transaction without a linked listing</p></header>
  <nav aria-label="Deal setup party" className="mb-5 grid grid-cols-3 gap-2 rounded-xl bg-white p-2"><span className="px-4 py-2 text-center text-sm text-slate-500">Overview</span><span className="px-4 py-2 text-center text-sm text-slate-500">Buyer</span><span className="rounded-lg bg-[#286548] px-4 py-2 text-center text-sm font-semibold text-white">Seller</span></nav>
  <div className="rounded-2xl border border-slate-200 bg-white p-5"><TransactionSellerCapturePanel transactionId="00000000-0000-4000-8000-000000000801" canEdit /></div>
</main>)
