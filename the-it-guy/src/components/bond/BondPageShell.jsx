import { cn } from '../../lib/utils'

export default function BondPageShell({ children, className = '' }) {
  return (
    <section className={cn('min-w-0 w-full space-y-6', className)}>
      {children}
    </section>
  )
}
