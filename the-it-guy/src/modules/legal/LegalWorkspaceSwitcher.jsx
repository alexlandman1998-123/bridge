import { useLocation } from 'react-router-dom';
import { useLegalWorkspace } from './LegalWorkspaceContext';
import { DISCIPLINE_LABELS } from './legalWorkspaceModel';
export default function LegalWorkspaceSwitcher() {
  const legal=useLegalWorkspace(), location=useLocation();
  if(!legal?.available)return null;
  return <label className="mt-3 block px-2"><span className="sr-only">Legal workspace</span>
    <select className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700" aria-label="Legal workspace"
      value={location.pathname.startsWith('/legal')?legal.activeDiscipline:'conveyancing'} onChange={e=>legal.choose(e.target.value)}>
      <option value="conveyancing">Conveyancing</option>
      {legal.disciplines.map(d=><option key={d} value={d}>{DISCIPLINE_LABELS[d]}</option>)}
    </select></label>;
}
