import SectionHeader from './SectionHeader'

function DataTable({ title = '', copy = '', actions = null, className = '', children }) {
  return (
    <section className={`ui-panel ui-table-card ${className}`.trim()}>
      {title || copy || actions ? <SectionHeader title={title} copy={copy} actions={actions} className="ui-table-card-head" /> : null}
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
