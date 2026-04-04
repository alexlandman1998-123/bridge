import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]',
  {
    variants: {
      variant: {
        default: 'border-marketing-borderStrong bg-white/80 text-marketing-subtle',
        accent: 'border-marketing-accent/20 bg-marketing-accentSoft text-marketing-accent',
        contrast: 'border-black/10 bg-marketing-contrast text-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
