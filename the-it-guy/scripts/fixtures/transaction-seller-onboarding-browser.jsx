import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter,Routes,Route} from 'react-router-dom'
import TransactionSellerOnboardingPanel from '../../src/components/transaction/TransactionSellerOnboardingPanel.jsx'
import TransactionSellerOnboarding from '../../src/pages/TransactionSellerOnboarding.jsx'
import {prepareTransactionSellerLink} from '../../src/services/transactionSellerOnboardingService.js'
function AgentPreview(){
 const [link,setLink]=useState('')
 return <main className="mx-auto max-w-5xl space-y-5 p-5 sm:p-8">
  <header className="rounded-2xl bg-[#123d30] p-6 text-white"><p className="text-xs uppercase tracking-widest text-emerald-100">Synthetic seller preview · Local database · No emails sent</p><h1 className="mt-2 text-2xl font-semibold text-white">Deal setup</h1><p className="mt-1 text-sm text-emerald-100">Backfilled transaction without a listing</p></header>
  <nav aria-label="Deal setup party" className="grid grid-cols-3 gap-2 rounded-xl bg-white p-2"><span className="px-4 py-2 text-center text-sm text-slate-500">Overview</span><span className="px-4 py-2 text-center text-sm text-slate-500">Buyer</span><span className="rounded-lg bg-[#286548] px-4 py-2 text-center text-sm font-semibold text-white">Seller</span></nav>
  <div className="rounded-2xl border border-slate-200 bg-white p-5"><TransactionSellerOnboardingPanel transactionId="00000000-0000-4000-8000-000000000801" canEdit onSendLink={async({context,mutationId})=>{const result=await prepareTransactionSellerLink({transactionId:'00000000-0000-4000-8000-000000000801',context,mutationId});setLink(result.link)}}/></div>
  {link?<a href={link} className="block rounded-xl bg-white p-4 font-semibold text-emerald-800">Open seller form (test invitation; no email)</a>:null}
 </main>
}
createRoot(document.getElementById('root')).render(<BrowserRouter><Routes><Route path="/seller/transaction/:token" element={<TransactionSellerOnboarding/>}/><Route path="*" element={<AgentPreview/>}/></Routes></BrowserRouter>)
