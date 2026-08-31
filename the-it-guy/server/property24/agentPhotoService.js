import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

export const PROPERTY24_AGENT_PHOTO_SIZE = 800
export const PROPERTY24_AGENT_PHOTO_MIN_SOURCE_SIZE = 300
export const PROPERTY24_AGENT_PHOTO_MAX_INPUT_BYTES = 10 * 1024 * 1024
export const PROPERTY24_AGENT_PHOTO_MAX_OUTPUT_BYTES = 2 * 1024 * 1024
export const PROPERTY24_AGENT_PHOTO_INPUT_FORMATS = Object.freeze(['jpeg', 'png', 'webp'])

function requirePositiveInteger(value, label) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${label} must be a positive integer.`)
  }
  return number
}

function normalizeIdentifier(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null
  }

  const text = String(value ?? '').trim()
  if (!/^\d+$/.test(text)) return null
  const number = Number(text)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

export function extractProperty24AgentId(value) {
  const direct = normalizeIdentifier(value)
  if (direct) return direct
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  for (const key of ['agentId', 'AgentId', 'agentID', 'AgentID', 'property24AgentId', 'Property24AgentId', 'id', 'Id']) {
    const identifier = normalizeIdentifier(value[key])
    if (identifier) return identifier
  }

  for (const key of ['data', 'result', 'value']) {
    if (value[key] !== value) {
      const identifier = extractProperty24AgentId(value[key])
      if (identifier) return identifier
    }
  }
  return null
}

export function unwrapProperty24AgentCollection(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []

  for (const key of ['agents', 'items', 'results', 'value', 'data']) {
    if (Array.isArray(value[key])) return value[key]
  }
  return []
}

export function findMatchingProperty24Agent(agents, candidate = {}) {
  const sourceReference = String(candidate.sourceReference || '').trim().toLowerCase()
  const emailAddress = String(candidate.emailAddress || '').trim().toLowerCase()

  return unwrapProperty24AgentCollection(agents).find((agent) => {
    const agentSourceReference = String(agent?.sourceReference || '').trim().toLowerCase()
    const agentEmailAddress = String(agent?.emailAddress || '').trim().toLowerCase()
    return Boolean(
      (sourceReference && agentSourceReference === sourceReference) ||
      (emailAddress && agentEmailAddress === emailAddress),
    )
  }) || null
}

export async function normalizeProperty24AgentPhotoBuffer(input, {
  sourceName = 'agent-photo',
  outputSize = PROPERTY24_AGENT_PHOTO_SIZE,
  minSourceSize = PROPERTY24_AGENT_PHOTO_MIN_SOURCE_SIZE,
  maxInputBytes = PROPERTY24_AGENT_PHOTO_MAX_INPUT_BYTES,
  maxOutputBytes = PROPERTY24_AGENT_PHOTO_MAX_OUTPUT_BYTES,
} = {}) {
  if (!Buffer.isBuffer(input) || input.length === 0) {
    throw new Error('The agent photo is empty or unreadable.')
  }
  if (input.length > maxInputBytes) {
    throw new Error(`The agent photo exceeds the ${maxInputBytes}-byte local input limit.`)
  }

  const normalizedOutputSize = requirePositiveInteger(outputSize, 'Photo output size')
  const normalizedMinSourceSize = requirePositiveInteger(minSourceSize, 'Photo minimum source size')
  let metadata
  try {
    metadata = await sharp(input, { animated: false, limitInputPixels: 40_000_000 }).metadata()
  } catch (error) {
    throw new Error(`The agent photo could not be decoded: ${error.message}`)
  }

  if (!PROPERTY24_AGENT_PHOTO_INPUT_FORMATS.includes(metadata.format)) {
    throw new Error(
      `Unsupported agent photo format "${metadata.format || 'unknown'}". Use JPEG, PNG, or WebP.`,
    )
  }
  if ((metadata.pages || 1) > 1) {
    throw new Error('Animated or multi-page agent photos are not supported.')
  }
  if (!metadata.width || !metadata.height) {
    throw new Error('The agent photo has no readable width or height.')
  }
  if (metadata.width < normalizedMinSourceSize || metadata.height < normalizedMinSourceSize) {
    throw new Error(
      `The agent photo must be at least ${normalizedMinSourceSize}x${normalizedMinSourceSize} pixels; received ${metadata.width}x${metadata.height}.`,
    )
  }

  const { data, info } = await sharp(input, { animated: false, limitInputPixels: 40_000_000 })
    .rotate()
    .resize(normalizedOutputSize, normalizedOutputSize, {
      fit: 'cover',
      position: 'attention',
    })
    .flatten({ background: '#ffffff' })
    .jpeg({
      quality: 85,
      progressive: true,
      mozjpeg: true,
      chromaSubsampling: '4:4:4',
    })
    .toBuffer({ resolveWithObject: true })

  if (!data.length || data.length > maxOutputBytes) {
    throw new Error(`The normalized agent photo exceeds the ${maxOutputBytes}-byte local output limit.`)
  }

  const bytes = data.toString('base64')
  return {
    payload: { bytes },
    summary: {
      sourceName,
      sourceFormat: metadata.format,
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      sourceBytes: input.length,
      outputMimeType: 'image/jpeg',
      outputWidth: info.width,
      outputHeight: info.height,
      outputBytes: data.length,
      base64Characters: bytes.length,
      sha256: crypto.createHash('sha256').update(data).digest('hex'),
    },
  }
}

export async function prepareProperty24AgentPhotoFile(filePath, options = {}) {
  const resolvedPath = path.resolve(String(filePath || '').trim())
  let stats
  try {
    stats = await fs.stat(resolvedPath)
  } catch (error) {
    throw new Error(`Agent photo not found at ${resolvedPath}: ${error.message}`)
  }
  if (!stats.isFile()) throw new Error(`Agent photo path is not a file: ${resolvedPath}`)

  const input = await fs.readFile(resolvedPath)
  const prepared = await normalizeProperty24AgentPhotoBuffer(input, {
    ...options,
    sourceName: resolvedPath,
  })
  return {
    ...prepared,
    sourcePath: resolvedPath,
  }
}
