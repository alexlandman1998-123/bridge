'use client'

import { useState } from 'react'

export function ListingDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false)
  return <div className={`listing-description-card${expanded ? ' is-expanded' : ''}`}>
    <p className="listing-description">{description}</p>
    <button aria-expanded={expanded} className="listing-description-toggle" onClick={() => setExpanded((current) => !current)} type="button">{expanded ? 'See less' : 'See more'}</button>
  </div>
}
