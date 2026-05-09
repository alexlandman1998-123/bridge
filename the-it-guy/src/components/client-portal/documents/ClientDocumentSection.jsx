import ClientDocumentCard from './ClientDocumentCard'

function ClientDocumentSection({
  title = '',
  subtitle = '',
  items = [],
  emptyState = '',
  uploadingDocumentKey = '',
  openingDocumentPath = '',
  onUpload = null,
  onOpenDocument = null,
}) {
  return (
    <article className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">{title}</h4>
          {subtitle ? <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{subtitle}</p> : null}
        </div>
        <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
          {items.length} item{items.length === 1 ? '' : 's'}
        </span>
      </div>
      {items.length ? (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <ClientDocumentCard
              key={item.id}
              item={item}
              uploadingDocumentKey={uploadingDocumentKey}
              openingDocumentPath={openingDocumentPath}
              onUpload={onUpload}
              onOpenDocument={onOpenDocument}
            />
          ))}
        </div>
      ) : (
        <article className="mt-4 rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-4 text-sm text-[#6b7d93]">
          {emptyState}
        </article>
      )}
    </article>
  )
}

export default ClientDocumentSection

