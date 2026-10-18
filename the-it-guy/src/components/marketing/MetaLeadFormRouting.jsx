import { Link } from 'react-router-dom'

export default function MetaLeadFormRouting({ form, agents, onChange }) {
  const recruitment = form.leadType === 'recruitment'
  return <div className="rounded-[14px] border border-[#e3ebf3] bg-white p-4">
    <label><input type="checkbox" checked={Boolean(form.selected)} onChange={(event) => onChange({ selected: event.target.checked })} /> <span className="ml-2 font-semibold">{form.name}</span></label>
    <div className="mt-3 flex flex-wrap gap-3">
      <label className="text-sm font-medium text-[#52677e]">Lead type <select className="ml-2 rounded border p-1" value={form.leadType || 'buyer'} onChange={(event) => onChange({ leadType: event.target.value, ...(event.target.value === 'recruitment' ? { assignedAgentId: null, branchId: null } : {}) })}>
        <option value="buyer">Buyer</option><option value="seller">Seller</option><option value="recruitment">Recruitment</option>
      </select></label>
      {recruitment ? <p className="text-sm text-[#52677e]">Routes to <Link className="font-semibold underline" to="/agency/recruitment">Recruitment</Link> at Lead Received. Agency management reviews these enquiries.</p> : <label className="text-sm font-medium text-[#52677e]">Route to <select className="ml-2 rounded border p-1" value={form.assignedAgentId || ''} onChange={(event) => onChange({ assignedAgentId: event.target.value })}>
        <option value="">Agency queue</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
      </select></label>}
    </div>
  </div>
}
