import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-secondary font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 active:scale-[0.985]',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-textInverse shadow-surface hover:-translate-y-0.5 hover:bg-primaryHover',
        secondary: 'border border-borderDefault bg-surface text-textStrong shadow-surface hover:-translate-y-0.5 hover:border-borderStrong hover:bg-mutedBg',
        ghost: 'text-textMuted hover:bg-mutedBg hover:text-textStrong',
        accent: 'border border-primary bg-primarySoft text-primary shadow-surface hover:-translate-y-0.5 hover:bg-surface',
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

function Button({ className, variant, size, asChild = false, type, ...props }) {
  const Comp = asChild ? Slot : 'button'
  const buttonProps = asChild ? props : { type: type || 'button', ...props }

  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...buttonProps} />
}

export { Button, buttonVariants }
export default Button
