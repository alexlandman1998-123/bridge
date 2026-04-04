import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

const Accordion = AccordionPrimitive.Root

function AccordionItem({ className, ...props }) {
  return <AccordionPrimitive.Item className={cn('rounded-[22px] border border-marketing-border bg-white/76 px-5', className)} {...props} />
}

function AccordionTrigger({ className, children, ...props }) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          'flex flex-1 items-center justify-between py-4 text-left text-sm font-semibold text-marketing-ink transition hover:text-marketing-accent',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className="h-4 w-4 shrink-0 text-marketing-subtle transition duration-200 data-[state=open]:rotate-180" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({ className, ...props }) {
  return <AccordionPrimitive.Content className={cn('pb-4 text-sm leading-7 text-marketing-muted', className)} {...props} />
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
