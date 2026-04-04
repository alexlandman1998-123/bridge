import * as NavigationMenuPrimitive from '@radix-ui/react-navigation-menu'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

const NavigationMenu = NavigationMenuPrimitive.Root
const NavigationMenuList = NavigationMenuPrimitive.List
const NavigationMenuItem = NavigationMenuPrimitive.Item
const NavigationMenuLink = NavigationMenuPrimitive.Link
const NavigationMenuTriggerStyle =
  'group inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium text-marketing-muted transition hover:bg-black/[0.035] hover:text-marketing-ink focus:outline-none'

function NavigationMenuTrigger({ className, children, ...props }) {
  return (
    <NavigationMenuPrimitive.Trigger className={cn(NavigationMenuTriggerStyle, className)} {...props}>
      {children}
      <ChevronDown className="relative top-px ml-1 h-3.5 w-3.5 transition duration-200 group-data-[state=open]:rotate-180" />
    </NavigationMenuPrimitive.Trigger>
  )
}

function NavigationMenuContent({ className, ...props }) {
  return (
    <NavigationMenuPrimitive.Content
      className={cn(
        'absolute left-0 top-0 w-[min(92vw,320px)] rounded-[24px] border border-marketing-border bg-marketing-panelElevated p-3 shadow-marketing-float backdrop-blur-2xl',
        className,
      )}
      {...props}
    />
  )
}

function NavigationMenuViewport({ className, ...props }) {
  return (
    <div className={cn('absolute left-0 top-full flex justify-center pt-3')}>
      <NavigationMenuPrimitive.Viewport
        className={cn('relative h-[var(--radix-navigation-menu-viewport-height)] w-full origin-top overflow-hidden rounded-[24px]', className)}
        {...props}
      />
    </div>
  )
}

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuViewport,
  NavigationMenuTriggerStyle,
}
