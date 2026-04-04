import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '../../lib/utils'

const Tabs = TabsPrimitive.Root

function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex h-auto rounded-full border border-marketing-borderStrong bg-white/80 p-1 shadow-marketing-soft', className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex min-h-[40px] items-center justify-center rounded-full px-4 text-sm font-semibold text-marketing-muted transition data-[state=active]:bg-marketing-contrast data-[state=active]:text-white data-[state=active]:shadow-marketing-soft',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }) {
  return <TabsPrimitive.Content className={cn('mt-6 outline-none', className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
