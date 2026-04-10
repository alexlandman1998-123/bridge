import { Search } from 'lucide-react'

function SearchInput({ className = '', inputClassName = '', ...props }) {
  return (
    <div
      className={`flex h-[42px] w-full min-w-0 items-center gap-3 rounded-[14px] border border-borderDefault bg-surface px-4 shadow-soft ${className}`.trim()}
    >
      <Search size={18} aria-hidden="true" className="shrink-0 text-textSoft" />
      <input
        type="search"
        className={`min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm text-textStrong shadow-none outline-none placeholder:text-textSoft [-webkit-appearance:none] ${inputClassName}`.trim()}
        {...props}
      />
    </div>
  )
}

export default SearchInput
