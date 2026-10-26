import { useParams } from 'react-router-dom'
import TransactionSellerCapturePanel from '../components/transaction/TransactionSellerCapturePanel.jsx'
import { loadTransactionSellerOnboarding, saveTransactionSellerOnboarding } from '../services/transactionSellerOnboardingService.js'

export default function TransactionSellerOnboarding() {
  const {token}=useParams()
  return <main className="min-h-screen bg-surfaceAlt px-4 py-8 sm:py-12"><div className="mx-auto max-w-5xl space-y-6">
    <header><p className="text-sm font-semibold text-emerald-800">Arch9 · Seller details</p><h1 className="mt-2 text-2xl font-semibold text-textStrong">Complete your seller information</h1><p className="mt-2 text-sm text-textMuted">Save what you have now. You can return to this link to finish later.</p></header>
    <div className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface sm:p-6"><TransactionSellerCapturePanel key={token} portalToken={token} canEdit loadCapture={loadTransactionSellerOnboarding} saveCapture={saveTransactionSellerOnboarding} /></div>
  </div></main>
}
