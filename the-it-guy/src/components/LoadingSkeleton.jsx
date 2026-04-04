function LoadingSkeleton({ lines = 4, className = '' }) {
  return (
    <section className={`skeleton-block ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <span key={index} className="skeleton-line" />
      ))}
    </section>
  )
}

export default LoadingSkeleton
