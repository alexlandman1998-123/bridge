import { invokeEdgeFunction } from './supabaseClient'

export function formatSouthAfricanWhatsAppNumber(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  let digits = raw.replace(/\D+/g, '')
  if (!digits) return ''

  if (digits.startsWith('00')) {
    digits = digits.slice(2)
  }

  if (digits.startsWith('270')) {
    digits = `27${digits.slice(3)}`
  } else if (digits.startsWith('0')) {
    digits = `27${digits.slice(1)}`
  } else if (digits.startsWith('7') && digits.length === 9) {
    digits = `27${digits}`
  }

  if (!/^27\d{9}$/.test(digits)) {
    return ''
  }

  return digits
}

export async function sendWhatsAppNotification({ to, message } = {}) {
  try {
    const normalizedPhone = formatSouthAfricanWhatsAppNumber(to)
    if (!normalizedPhone) {
      const reason = !String(to || '').trim() ? 'missing_phone_number' : 'invalid_phone_number'
      console.warn('WhatsApp skipped', reason)
      return { ok: false, skipped: true, reason }
    }

    const normalizedMessage = String(message || '').trim()
    if (!normalizedMessage) {
      const reason = 'missing_message'
      console.warn('WhatsApp skipped', reason)
      return { ok: false, skipped: true, reason }
    }

    // TODO: Production WhatsApp must use approved Meta templates instead of plain text.
    const { data, error } = await invokeEdgeFunction('send-whatsapp', {
      body: {
        to: normalizedPhone,
        message: normalizedMessage,
      },
    })

    if (error) {
      console.error('WhatsApp failed', error)
      return { ok: false, skipped: false, error }
    }

    const result = {
      to: normalizedPhone,
      data,
    }
    console.log('WhatsApp notification sent', result)
    return { ok: true, skipped: false, result }
  } catch (error) {
    console.error('WhatsApp failed', error)
    return { ok: false, skipped: false, error }
  }
}

