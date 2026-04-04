import MetricCard from './ui/MetricCard'

function SummaryCards({ items, className = '' }) {
  return (
    <section className={`grid gap-5 md:grid-cols-2 xl:grid-cols-4 ${className}`.trim()} aria-label="Summary metrics">
      {items.map((item) => {
        return (
          <MetricCard
            key={item.label}
            className="min-h-[150px]"
            label={item.label}
            value={item.value}
            meta={item.meta || ''}
            icon={item.icon || null}
            onClick={item.onClick || null}
          />
        )
      })}
    </section>
  )
}

export default SummaryCards
