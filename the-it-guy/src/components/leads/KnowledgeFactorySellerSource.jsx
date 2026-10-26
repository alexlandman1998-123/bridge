const supplied = value => value === null || value === undefined || value === '' ? 'Not supplied' : String(value);

export default function KnowledgeFactorySellerSource({ source }) {
  if (!source?.reportResultId || !Array.isArray(source.owners)) return null;
  const retrieved = new Date(source.retrievedAt);
  return <section aria-label="Knowledge Factory ownership" className="rounded-2xl border border-emerald-200 bg-white p-5">
    <h3 className="text-base font-semibold text-[#102D47]">Property report ownership</h3>
    <p className="mt-1 text-sm text-slate-600">Returned by Knowledge Factory. Confirm these details with the owners; this does not establish intent or consent to sell.</p>
    <p className="mt-2 text-xs text-slate-500">Property {supplied(source.propertyId)} · {Number.isNaN(retrieved.getTime()) ? 'Retrieval date not supplied' : retrieved.toLocaleDateString('en-ZA')} · Source report {source.reportResultId}</p>
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-slate-500"><tr><th scope="col" className="pb-2 pr-4">Owner</th><th scope="col" className="pb-2 pr-4">Supplier type</th><th scope="col" className="pb-2">Share supplied</th></tr></thead>
        <tbody>{source.owners.map((owner, index) => <tr key={`${source.reportResultId}-${index}`} className="border-t border-slate-100"><td className="py-2 pr-4">{supplied(owner?.name)}</td><td className="py-2 pr-4">{supplied(owner?.type)}</td><td className="py-2">{supplied(owner?.share)}</td></tr>)}</tbody>
      </table>
    </div>
  </section>;
}
