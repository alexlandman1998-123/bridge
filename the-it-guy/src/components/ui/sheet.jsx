import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close
const SheetPortal = DialogPrimitive.Portal

function SheetOverlay({ className, ...props }) {
  return <DialogPrimitive.Overlay className={cn('fixed inset-0 z-50 bg-black/30 backdrop-blur-sm', className)} {...props} />
}

const sheetVariants = cva(
  'fixed z-50 flex flex-col gap-6 bg-marketing-panelElevated p-6 shadow-marketing-float backdrop-blur-2xl',
  {
    variants: {
      side: {
        top: 'inset-x-3 top-3 rounded-[28px] border border-marketing-border',
        bottom: 'inset-x-3 bottom-3 rounded-[28px] border border-marketing-border',
        left: 'inset-y-3 left-3 w-[min(90vw,420px)] rounded-[28px] border border-marketing-border',
        right: 'inset-y-3 right-3 w-[min(90vw,420px)] rounded-[28px] border border-marketing-border',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  },
)

function SheetContent({ side = 'right', className, children, ...props }) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content className={cn(sheetVariants({ side }), className)} {...props}>
        {children}
        <SheetClose className="absolute right-4 top-4 rounded-full border border-marketing-borderStrong bg-white/90 p-2 text-marketing-muted transition hover:text-marketing-ink">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </SheetClose>
      </DialogPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }) {
  return <div className={cn('space-y-2', className)} {...props} />
}

function SheetTitle({ className, ...props }) {
  return <DialogPrimitive.Title className={cn('text-xl font-semibold text-marketing-ink', className)} {...props} />
}

function SheetDescription({ className, ...props }) {
  return <DialogPrimitive.Description className={cn('text-sm leading-7 text-marketing-muted', className)} {...props} />
}

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose }
