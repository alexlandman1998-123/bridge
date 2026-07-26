export function activateAnchorOnSpace(event) {
  if (!event || event.defaultPrevented) return
  if (event.key !== ' ' && event.key !== 'Spacebar') return

  if (event.repeat) {
    event.preventDefault()
    return
  }

  const target = event.currentTarget
  if (!target || typeof target.click !== 'function') return

  event.preventDefault()
  target.click()
}
