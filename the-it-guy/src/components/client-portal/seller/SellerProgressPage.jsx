import { Link } from 'react-router-dom'
import ClientTransferJourney from '../ClientTransferJourney.jsx'
import TransactionJourneyTracker from '../../transaction/TransactionJourneyTracker.jsx'
import { buildSellerListingJourneyPresentation } from '../../../core/clientPortal/sellerProgressPresentationModel.js'

export default function SellerProgressPage({ isTransaction = false, listingProgress, transactionJourney, transferJourney,
  propertyTitle, propertyImageUrl, partyName, askingPriceLabel, salePriceLabel, agentName, attorneyName, attorneyFirm,
  agentUpdate, nextAction = {}, documentsPath, marketingPath, theme }) {
  const listingJourney = buildSellerListingJourneyPresentation({ listingProgress, nextAction, agentUpdate, agentName })
  const canonicalTransaction = ['transaction-journey-snapshot', 'shared-high-level-journey'].includes(transactionJourney?.source)
  const actionPath = nextAction.href || documentsPath
  return <section aria-label="Seller progress" className="space-y-5">
    {!isTransaction ? <>
      <ClientTransferJourney compactMobile model={listingJourney} audience="seller" phase="listing" propertyTitle={propertyTitle} propertyImageUrl={propertyImageUrl}
        partyName={partyName} priceLabel={askingPriceLabel} attorneyName={agentName} brand={theme?.primary} accent={theme?.accent} heroOverlayStyle={theme?.heroOverlayStyle} />
      <section className="rounded-[20px] border border-[#dbe5ef] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#142132]">From listing to transfer</h2>
        <p className="mt-2 text-sm leading-6 text-[#52657b]">Your property is still in the listing stage. The legal transfer journey begins once your agent opens the linked transaction.</p>
        <div className="mt-4 flex flex-wrap gap-3"><Link to={marketingPath} className="inline-flex min-h-11 items-center rounded-xl border border-[#dbe5ef] px-4 text-sm font-semibold text-[#123f3a]">View listing &amp; marketing</Link>
        </div>
      </section>
    </> : transferJourney?.status === 'ready' ? <ClientTransferJourney compactMobile model={transferJourney} audience="seller" propertyTitle={propertyTitle} propertyImageUrl={propertyImageUrl}
      partyName={partyName} priceLabel={salePriceLabel} attorneyName={attorneyName} attorneyFirm={attorneyFirm} brand={theme?.primary} accent={theme?.accent} heroOverlayStyle={theme?.heroOverlayStyle} />
      : canonicalTransaction ? <TransactionJourneyTracker model={transactionJourney} title="Your sale progress" subtitle="The shared transaction milestones, updated by your agent and legal team." variant="detailed" audience="seller" theme={theme} />
        : <section role="status" className="rounded-[20px] border border-[#dbe5ef] bg-white p-6"><h1 className="text-xl font-semibold text-[#142132]">Your sale progress</h1><p className="mt-2 text-sm leading-6 text-[#52657b]">Your transaction is active. Its shared milestones are temporarily unavailable. They will appear when the portal refreshes.</p></section>}
    <div className="flex flex-wrap gap-3">
      {actionPath ? /^https?:\/\//i.test(actionPath) ? <a href={actionPath} className="inline-flex min-h-11 items-center rounded-xl bg-[#123f3a] px-4 text-sm font-semibold text-white">{nextAction.label || 'View required items'}</a>
        : <Link to={actionPath} className="inline-flex min-h-11 items-center rounded-xl bg-[#123f3a] px-4 text-sm font-semibold text-white">{nextAction.label || 'View required items'}</Link> : null}
      {actionPath !== documentsPath ? <Link to={documentsPath} className="inline-flex min-h-11 items-center rounded-xl border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#123f3a]">View documents</Link> : null}
    </div>
  </section>
}
