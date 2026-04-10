import { Search } from 'lucide-react'

function SearchInput({ className = '', inputClassName = '', ...props }) {
  return (
    <div className={`ui-search-input ${className}`.trim()}>
      <Search size={18} aria-hidden="true" className="shrink-0 text-textSoft" />
      <input
        type="search"
        className={`ui-search-input-field appearance-none text-body [-webkit-appearance:none] ${inputClassName}`.trim()}
        {...props}
      />
    </div>
  )
}

export default SearchInput
