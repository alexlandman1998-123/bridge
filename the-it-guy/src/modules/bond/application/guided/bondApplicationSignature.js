export function isBondApplicationSignature(value = '') {
  return /^data:image\/png;base64,[a-z0-9+/=]+$/i.test(String(value || '').trim())
}
