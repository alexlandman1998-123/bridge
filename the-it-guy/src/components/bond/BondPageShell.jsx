import { cn } from '../../lib/utils'

export default function BondPageShell({ children, className = '' }) {
  return (
    <section className={cn('mx-auto w-full max-w-[1440px] space-y-7 sm:space-y-8', className)}>
      {children}
    </section>
  )
}
