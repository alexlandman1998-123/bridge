import { cn } from '../../lib/utils'

export default function BondPageShell({ children, className = '' }) {
  return (
    <section className={cn('mx-auto w-full max-w-[1600px] space-y-[clamp(1.25rem,1.8vw,2rem)] px-[clamp(1rem,2vw,3rem)]', className)}>
      {children}
    </section>
  )
}
