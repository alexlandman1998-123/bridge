import { motion, useReducedMotion } from 'motion/react'
import { cn } from '../../lib/utils'

export function useBridgeMotion() {
  const prefersReducedMotion = useReducedMotion()

  return {
    prefersReducedMotion,
    section: prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, amount: 0.18 },
          transition: { duration: 0.46, ease: [0.22, 1, 0.36, 1] },
        },
    item: prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, amount: 0.14 },
          transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
        },
    hoverLift: prefersReducedMotion
      ? {}
      : {
          whileHover: { y: -4 },
          transition: { duration: 0.18, ease: 'easeOut' },
        },
    press: prefersReducedMotion ? {} : { whileTap: { scale: 0.985 } },
  }
}

export function MotionSection({ className, children, ...props }) {
  const motionConfig = useBridgeMotion()

  return (
    <motion.section className={cn(className)} {...motionConfig.section} {...props}>
      {children}
    </motion.section>
  )
}

export function MotionCard({ className, children, ...props }) {
  const motionConfig = useBridgeMotion()

  return (
    <motion.div className={cn(className)} {...motionConfig.item} {...motionConfig.hoverLift} {...props}>
      {children}
    </motion.div>
  )
}
