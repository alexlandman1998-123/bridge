export const SYNDICATION_REVIEW_GATE_VERSION = 'arch9_syndication_review_gate_v1'

function key(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function channelKey(value = '') {
  const normalized = key(value)
  if (normalized === 'private_property' || normalized === 'privateproperty') return 'privateProperty'
  if (normalized === 'property_24') return 'property24'
  return normalized
}

export function isSyndicationReviewRolloutEnabled(review = {}, channel = '') {
  const rolloutEnabled = review?.rollout?.enabled === true && review?.rollout?.mode === 'review'
  const categoryEnabled = review?.rollout?.listingCategoryEnabled !== false
  if (!rolloutEnabled || !categoryEnabled || !channel) return rolloutEnabled && categoryEnabled
  const pilotChannels = Array.isArray(review?.rollout?.pilotChannels)
    ? review.rollout.pilotChannels.map(channelKey)
    : ['privateProperty', 'property24']
  return pilotChannels.includes(channelKey(channel))
}

export function canAcknowledgeSyndicationChannel(review = {}, channel = '') {
  const resolvedChannelKey = channelKey(channel)
  return Boolean(resolvedChannelKey && review?.channels?.[resolvedChannelKey]?.dataReady === true)
}

export function shouldRequireSyndicationReview({
  review = {},
  channel = '',
  acknowledged = false,
  draftDirty = false,
} = {}) {
  if (!channelKey(channel) || !isSyndicationReviewRolloutEnabled(review, channel)) return false
  return !acknowledged || draftDirty
}
