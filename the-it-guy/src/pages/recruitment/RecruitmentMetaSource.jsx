export default function RecruitmentMetaSource({ lead }) {
  if (!lead.meta_leadgen_id) return null
  const source = lead.meta_source_json || {}
  const answers = Object.entries(source.normalized_fields || {}).filter(([, value]) => typeof value === 'string' && value.trim())
  return <section aria-label="Meta recruitment source" className="mt-6 rounded-2xl border border-[#dbe7f2] bg-[#fbfdff] p-5">
    <h3 className="font-semibold text-[#20364c]">Facebook Lead Ads</h3>
    <dl className="mt-3 grid gap-3 text-sm text-[#60758b] sm:grid-cols-2">
      {[["Form", source.form_name], ["Campaign", source.campaign_name], ["Ad", source.ad_name]].map(([label, value]) => value ? <div key={label}><dt className="font-semibold text-[#20364c]">{label}</dt><dd className="mt-1 break-words">{value}</dd></div> : null)}
      {source.submitted_at && <div><dt className="font-semibold text-[#20364c]">Submitted on Meta</dt><dd className="mt-1">{new Date(source.submitted_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</dd></div>}
    </dl>
    {source.ingestion_source === 'historical' && <p className="mt-3 text-xs text-[#60758b]">Historical import. The Meta submission date is retained above.</p>}
    {answers.length > 0 && <details className="mt-4 text-sm text-[#60758b]"><summary className="cursor-pointer font-semibold text-[#20364c]">Meta form answers</summary><dl className="mt-3 grid gap-3">{answers.map(([key, value]) => <div key={key}><dt className="font-semibold capitalize">{key.replaceAll('_', ' ')}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value}</dd></div>)}</dl></details>}
  </section>
}
