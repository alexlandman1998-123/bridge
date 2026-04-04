import { cn } from '../../lib/utils'

function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'flex h-11 w-full rounded-[18px] border border-marketing-borderStrong bg-white/86 px-4 py-3 text-sm text-marketing-ink outline-none transition placeholder:text-[#a0968a] focus:border-marketing-accent/45 focus:ring-4 focus:ring-marketing-accent/10',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
