import SectionHeader from './SectionHeader'

function DataTable({ title = '', copy = '', actions = null, className = '', children }) {
  return (
    <section className={`rounded-[22px] border border-borderDefault bg-surface p-7 shadow-panel ${className}`.trim()}>
      {title || copy || actions ? <SectionHeader title={title} copy={copy} actions={actions} className="mb-6" /> : null}
      <div className="ui-table-shell">
        <div className="table-wrap">{children}</div>
      </div>
    </section>
  )
}

export function DataTableInner({ className = '', children }) {
  return <table className={`ui-data-table text-left ${className}`.trim()}>{children}</table>
}

export default DataTable
