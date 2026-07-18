export function DocumentAccessibilityNavigation({ model = null }) {
  if (model?.contract !== 'arch9-document-accessibility-v1') return null
  const skipClassName = 'rounded-[10px] bg-[#12385f] px-4 py-3 text-sm font-bold text-white shadow-lg outline-none ring-offset-2 focus:ring-2 focus:ring-[#6ca4d6]'
  return (
    <>
      <nav aria-label="Skip document navigation" className="fixed left-3 top-3 z-[120] flex -translate-y-[160%] gap-2 transition-transform focus-within:translate-y-0 motion-reduce:transition-none">
        <a href={`#${model.contentTargetId}`} className={skipClassName}>Skip to document</a>
        <a href={`#${model.actionsTargetId}`} className={skipClassName}>Skip to actions</a>
      </nav>
      <p data-testid="document-accessibility-status" className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {model.announcement}
      </p>
    </>
  )
}
