import { Search } from 'lucide-react'

function SearchInput({ className = '', inputClassName = '', ...props }) {
  return (
    <div
      className={`flex h-[42px] w-full min-w-0 items-center gap-3 rounded-[14px] border border-[#dde4ee] bg-white px-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] ${className}`.trim()}
    >
      <Search size={18} aria-hidden="true" className="shrink-0 text-slate-400" />
      <input
        type="search"
        className={`min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm text-[#162334] shadow-none outline-none placeholder:text-slate-400 [-webkit-appearance:none] ${inputClassName}`.trim()}
        {...props}
      />
    </div>
  )
}

export default SearchInput
