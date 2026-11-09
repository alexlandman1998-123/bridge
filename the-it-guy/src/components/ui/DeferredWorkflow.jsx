import { Suspense, useState } from 'react'

/** Load a workflow on first use; optionally retain its form state after closing. */
export default function DeferredWorkflow({ active = true, keepMounted = false, fallback, children }) {
  const [opened, setOpened] = useState(false)

  // Remember first use without waiting for a suspended child to finish loading.
  if (active && keepMounted && !opened) setOpened(true)

  if (!active && !(keepMounted && opened)) return null

  return <Suspense fallback={active ? fallback : null}>{children}</Suspense>
}
