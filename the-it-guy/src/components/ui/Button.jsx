import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marketing-accent/30 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.985]',
  {
    variants: {
      variant: {
        primary:
          'bg-marketing-contrast text-white shadow-marketing-button hover:-translate-y-0.5 hover:shadow-marketing-buttonHover',
        secondary:
          'border border-marketing-borderStrong bg-white/80 text-marketing-ink shadow-marketing-soft hover:-translate-y-0.5 hover:border-marketing-accent/35 hover:bg-white',
        ghost: 'text-marketing-muted hover:bg-black/[0.04] hover:text-marketing-ink',
        accent:
          'border border-marketing-accent/20 bg-marketing-accentSoft text-marketing-accent shadow-marketing-soft hover:-translate-y-0.5 hover:border-marketing-accent/30',
      },
      size: {
        sm: 'h-10 px-4',
        md: 'h-11 px-5',
        lg: 'h-12 px-6',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : 'button'

  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { Button, buttonVariants }
export default Button
