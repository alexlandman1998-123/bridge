import { NavLink } from 'react-router-dom';
import { Files, Plus, LayoutDashboard, Inbox } from 'lucide-react';
import { firmOverviewAllowed } from './legalFirmOverviewModel';
import { useLegalWorkspace } from './LegalWorkspaceContext';
export default function LegalNavigation() {
  const legal=useLegalWorkspace();
  if(!legal?.available)return null;
  const title=legal.context.capabilities.can_manage&&legal.context.grants?.length?'All Matters':'My Matters';
  const management=firmOverviewAllowed(import.meta.env,legal);
  const d=legal.activeDiscipline;
  return <nav className="ui-nav-stack mt-3 px-3" aria-label="Legal navigation">
    {management?<NavLink className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-100" to="/legal/overview"><LayoutDashboard size={18}/>Firm Overview</NavLink>:null}
    <NavLink className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-100" to="/inbox"><Inbox size={18}/>Inbox</NavLink>
    <NavLink className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-100" to={management?'/legal/matters':`/legal/matters?discipline=${d}`}><Files size={18}/>{title}</NavLink>
    {legal.context.capabilities.can_create?<NavLink className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-100" to={`/legal/new?discipline=${d}`}><Plus size={18}/>New Matter</NavLink>:null}
  </nav>;
}
