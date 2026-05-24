import { getUnsafeEnvironmentFlags, isUnsafeFallbackAllowed } from './envValidation'

const unsafeFlags = getUnsafeEnvironmentFlags()

export const MOCK_DATA_ENABLED = Boolean(isUnsafeFallbackAllowed() && (unsafeFlags.enableMockData || unsafeFlags.enableDemoMode))

export function sortByNewest(items = [], ...dateKeys) {
  const normalizedItems = Array.isArray(items) ? items.filter(Boolean) : []

  return [...normalizedItems].sort((left, right) => {
    const leftValue = dateKeys.map((key) => left?.[key]).find(Boolean)
    const rightValue = dateKeys.map((key) => right?.[key]).find(Boolean)
    const leftDate = new Date(leftValue || 0).getTime()
    const rightDate = new Date(rightValue || 0).getTime()
    return rightDate - leftDate
  })
}
