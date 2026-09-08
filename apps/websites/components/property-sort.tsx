'use client'

export function PropertySort({ query, value }: { query: Record<string, string | undefined>; value: string }) {
  return <form action="/properties" className="property-sort">
    {Object.entries(query).filter(([key, value]) => key !== 'sort' && value).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
    <label>Sort by <select name="sort" aria-label="Sort properties" defaultValue={value} onChange={event => event.currentTarget.form?.requestSubmit()}>
      <option value="recommended">Recommended</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option>
    </select></label>
    <noscript><button type="submit">Apply sort</button></noscript>
  </form>
}
