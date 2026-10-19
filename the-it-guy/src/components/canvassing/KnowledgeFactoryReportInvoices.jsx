import { useEffect, useState } from 'react';
import { reportInvoiceCsv } from '../../services/propertyIntelligence/knowledgeFactoryReportInvoiceExport';
import { supabase } from '../../lib/supabaseClient';

const money = cents => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(cents / 100);

function download(invoice) {
  const url = URL.createObjectURL(new Blob([reportInvoiceCsv(invoice)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `knowledge-factory-${invoice.invoice_month}.csv`; link.click(); URL.revokeObjectURL(url);
}
export default function KnowledgeFactoryReportInvoices({ organisationId, refreshKey }) {
  const [state, setState] = useState({ loading: true, invoices: [], error: '' });
  useEffect(() => {
    let active = true;
    setState({ loading: true, invoices: [], error: '' });
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.access_token) throw new Error('Please sign in again.');
        const response = await fetch(`/api/knowledge-factory/report-invoices?organisationId=${encodeURIComponent(organisationId)}`, { headers: { authorization: `Bearer ${data.session.access_token}` } });
        if (response.status === 403) { if (active) setState({ loading: false, invoices: [], error: '', hidden: true }); return; }
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Monthly report invoices could not be loaded.');
        if (active) setState({ loading: false, invoices: result.invoices || [], error: '' });
      } catch (error) { if (active) setState({ loading: false, invoices: [], error: error.message }); }
    })();
    return () => { active = false; };
  }, [organisationId, refreshKey]);
  if (state.hidden) return null;
  return <details className="rounded-2xl border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer font-semibold text-slate-900">Monthly property report invoices</summary>
    <p className="mt-2 text-sm text-slate-600">Completed live reports are added at the price confirmed when ordered. Test reports are excluded. The current month remains a draft.</p>
    {state.loading ? <p className="mt-3 text-sm">Loading invoices…</p> : state.error ? <p role="alert" className="mt-3 text-sm text-rose-700">{state.error}</p> : !state.invoices.length ? <p className="mt-3 text-sm text-slate-500">No property report charges yet.</p> : <ul className="mt-3 divide-y divide-slate-100">{state.invoices.map(invoice => <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
      <span>{invoice.invoice_month.slice(0,7)} · {invoice.status === 'issued' ? 'Invoice' : 'Draft invoice'} · {invoice.knowledge_factory_report_invoice_lines.length} reports · <strong>{money(invoice.totalCents)}</strong></span>
      <button type="button" onClick={() => download(invoice)} className="min-h-10 rounded-lg border border-slate-200 px-3 font-medium">Export charges</button>
    </li>)}</ul>}
  </details>;
}
