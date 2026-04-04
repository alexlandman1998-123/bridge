import { cn } from '../../lib/utils'

function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        'rounded-[28px] border border-marketing-border bg-marketing-panel shadow-marketing-panel backdrop-blur-xl',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }) {
  return <div className={cn('space-y-3 p-6 md:p-7', className)} {...props} />
}

function CardTitle({ className, ...props }) {
  return <h3 className={cn('text-[1.12rem] font-semibold tracking-[-0.035em] text-marketing-ink', className)} {...props} />
}

function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm leading-7 text-marketing-muted', className)} {...props} />
}

function CardContent({ className, ...props }) {
  return <div className={cn('px-6 pb-6 md:px-7 md:pb-7', className)} {...props} />
}

function CardFooter({ className, ...props }) {
  return <div className={cn('flex items-center px-6 pb-6 md:px-7 md:pb-7', className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
