function SharedTransactionShell({
  printTitle = 'Transaction Report',
  printSubtitle = '',
  printGeneratedAt = '',
  headline = null,
  toolbar = null,
  errorMessage = '',
  children,
}) {
  return (
    <section className="min-w-0 space-y-4">
      <section className="hidden print:block">
        <h2>{printTitle}</h2>
        {printSubtitle ? <p>{printSubtitle}</p> : null}
        {printGeneratedAt ? <span>Generated {printGeneratedAt}</span> : null}
      </section>

      {headline}
      {errorMessage ? (
        <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">
          {errorMessage}
        </p>
      ) : null}
      {toolbar}

      <section className="min-w-0">{children}</section>
    </section>
  )
}

export default SharedTransactionShell
