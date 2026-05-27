import { cn } from '../../lib/utils'

export default function BondPageShell({ children, className = '' }) {
  return <section className={cn('space-y-6', className)}>{children}</section>
}
