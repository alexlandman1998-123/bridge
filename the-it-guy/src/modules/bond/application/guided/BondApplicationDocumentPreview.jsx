export default function BondApplicationDocumentPreview({ presentation, versionStatus = 'draft' }) {
  if (!presentation) return null
  return (
    <section className="space-y-3" aria-label="Application document preview">
      <div className="rounded-2xl bg-[#123d38] px-5 py-4 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#bdd8d0]">{versionStatus === 'signed' ? 'Your details in the signed version' : versionStatus === 'fixed' ? 'Fixed application version' : 'Draft / unsigned'}</p>
        <h3 className="mt-1 text-lg font-semibold">Your application document</h3>
        <p className="mt-2 text-sm text-[#d7e7e2]">{versionStatus === 'draft' ? 'Expand each section to check the answers that will appear in your PDF. Changes to your answers require you to confirm the permissions and sign again.' : 'Review your own details in this fixed application version. Changes require a new version and fresh signatures. The complete signed PDF is the signing evidence.'}</p>
      </div>
      {presentation.sections.map((section) => (
        <details key={section.key} className="rounded-2xl border border-[#dbe5ef] bg-white p-4" open={section.key === 'property_finance'}>
          <summary className="cursor-pointer text-sm font-semibold text-[#17283a]">{section.participant ? `${section.participant} · ` : ''}{section.title}</summary>
          <dl className="mt-3 divide-y divide-[#e7edf4]">
            {section.rows.map((row, index) => <div key={index} className="grid gap-1 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:gap-4"><dt className="break-words text-[#61748a]">{row.label}</dt><dd className="whitespace-pre-wrap break-words text-[#17283a]">{row.value}</dd></div>)}
          </dl>
        </details>
      ))}
      <details className="rounded-2xl border border-[#dbe5ef] bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[#17283a]">Permissions and declarations</summary>
        {presentation.declarations.map((item, index) => <article key={`${item.key}:${index}`} className="mt-4 text-sm"><h4 className="font-semibold text-[#17283a]">{item.title || item.key}</h4><p className="mt-1 whitespace-pre-wrap break-words text-[#61748a]">{item.text}</p><p className="mt-1 text-xs text-[#61748a]">{item.required ? 'Required' : 'Optional'} · {item.accepted ? 'Accepted' : 'Not accepted'}</p></article>)}
      </details>
      <details className="rounded-2xl border border-[#dbe5ef] bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[#17283a]">Supporting-document checklist</summary>
        {presentation.documentChecklist.map((item, index) => <p key={index} className="mt-3 text-sm text-[#61748a]"><span className="font-semibold text-[#17283a]">{item.title}</span> · {item.status} · {item.fileCount} of {item.minimumFileCount} files</p>)}
      </details>
    </section>
  )
}
