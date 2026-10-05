import { Link, useNavigate, useParams } from 'react-router-dom'
import BondApplicationBuyerNotices from '../components/bond/BondApplicationBuyerNotices'
import ConnectedBuyerBondApplication from '../modules/bond/application/workspace/ConnectedBuyerBondApplication.jsx'

export default function BondApplicationPortal() {
  const { token = '', accessToken = '' } = useParams()
  const navigate = useNavigate()
  const buyerPath = `/client/${encodeURIComponent(token)}/buying/bond-application`
  const back = () => token ? navigate(buyerPath) : window.scrollTo({ top: 0, behavior: 'smooth' })
  return <main data-bond-application-portal="phase1-shell" className="min-h-screen bg-[#f4f6fa] px-4 py-6 sm:px-6">
    <div className="mx-auto max-w-5xl space-y-5">
      {token ? <Link to={buyerPath} className="inline-flex min-h-11 items-center text-sm font-semibold text-[#123f3a]">Back to buyer portal</Link> : null}
      <BondApplicationBuyerNotices token={token} accessToken={accessToken} />
      <ConnectedBuyerBondApplication key={accessToken || token} token={token} accessToken={accessToken} onBackToPortal={back} onSaveAndExit={back} onLegacyHandoff={back} />
    </div>
  </main>
}
