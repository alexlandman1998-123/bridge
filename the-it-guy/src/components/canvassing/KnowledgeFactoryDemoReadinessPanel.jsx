import { CheckCircle2, Circle, ClipboardCheck, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { getKnowledgeFactoryDemoReadiness } from "../../services/propertyIntelligence/knowledgeFactoryDemoReadinessService";

export default function KnowledgeFactoryDemoReadinessPanel({ organisationId }) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  async function load() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try { setState({ loading: false, data: await getKnowledgeFactoryDemoReadiness({ organisationId }), error: "" }); }
    catch (error) { setState({ loading: false, data: null, error: error?.message || "Demo readiness is unavailable." }); }
  }
  useEffect(() => { void load(); }, [organisationId]);
  const summary = state.data?.summary;
  return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="knowledge-factory-demo-readiness">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5"><div className="flex gap-3"><ClipboardCheck className="mt-0.5 text-[#1769dc]" size={20} /><div><h3 className="font-semibold text-slate-900">Demo readiness gate</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">A read-only release checklist for the controlled UAT demonstration. Passing it does not enable production or supplier FICA/KYC verification.</p></div></div><button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold"><RefreshCw size={15} />Refresh</button></header>
    {state.loading ? <div className="grid min-h-40 place-items-center"><LoaderCircle className="animate-spin" /></div> : state.error ? <p role="alert" className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p> : <div className="p-5"><div className={`rounded-xl border p-4 ${summary?.ready ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}><p className="font-semibold">{summary?.ready ? "Ready for the defined UAT demonstration" : "Not ready for the full UAT demonstration"}</p><p className="mt-1 text-sm">{summary?.passed || 0} of {summary?.total || 0} release checks passed. This gate is evidence only; it does not change access, price, or rollout settings.</p></div><div className="mt-4 divide-y divide-slate-100">{(state.data?.checks || []).map((check) => <div key={check.key} className="flex gap-3 py-3"><span className={check.passed ? "text-emerald-600" : "text-slate-300"}>{check.passed ? <CheckCircle2 size={18} /> : <Circle size={18} />}</span><div><p className="text-sm font-semibold text-slate-800">{check.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{check.detail}</p></div></div>)}</div><p className="mt-4 text-xs leading-5 text-slate-500">Recommended final demo: map a parcel, obtain a cost-only quote, confirm and run one approved report, review/download its saved snapshot, then complete one consent-first FICA case to internal-review status.</p></div>}
  </section>;
}
