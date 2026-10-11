import { Link, useLocation, useParams } from 'react-router-dom';
import { useLegalWorkspace } from './LegalWorkspaceContext';
import LegalMatterRegister from './LegalMatterRegister';
import LegalMatterCreate from './LegalMatterCreate';
import LegalFirmOverview from './LegalFirmOverview';
import LegalFirmMatterRegister from './LegalFirmMatterRegister';
import { firmOverviewAllowed } from './legalFirmOverviewModel';
import LegalMatterDetail from './LegalMatterDetail';
export default function LegalWorkspacePage() {
  const legal=useLegalWorkspace(), location=useLocation(), {matterId}=useParams();
  if(!legal?.ready)return <p role="status" className="p-6 text-sm text-slate-500">Loading workspace…</p>;
  if(!legal.available)return <div className="p-6"><h1 className="text-xl font-semibold">Legal workspace unavailable</h1><Link className="mt-4 inline-block underline" to="/attorney/dashboard">Return to Conveyancing</Link><button className="ml-4 underline" onClick={legal.reload}>Reload access</button></div>;
  const management=firmOverviewAllowed(import.meta.env,legal);
  if(location.pathname==='/legal/overview'&&!management)return <div className="p-6"><h1 className="text-xl font-semibold">Firm overview unavailable</h1><Link className="underline" to="/legal/matters">My Matters</Link></div>;
  return <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
    {location.pathname==='/legal/overview'?<LegalFirmOverview key={`${legal.firmId}:${legal.accessVersion}`}/>:matterId?<LegalMatterDetail key={`${legal.firmId}:${matterId}`} matterId={matterId}/>:location.pathname==='/legal/new'?<LegalMatterCreate key={`${legal.firmId}:${legal.activeDiscipline}`}/>:management?<LegalFirmMatterRegister key={`${legal.firmId}:${legal.accessVersion}`}/>:<LegalMatterRegister key={`${legal.firmId}:${legal.activeDiscipline}:${legal.accessVersion}`}/>}
  </main>;
}
