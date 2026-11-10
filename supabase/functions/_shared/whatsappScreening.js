// Fixed, versioned questions shared by the preview and the server worker.
// Applicant messages are answers, never instructions that can change the flow.
export const SCREENING_VERSION = 1
const clean = value => String(value ?? '').trim()
const yesNo = ['Yes', 'No / discuss with agent']
const money = value => `R ${Number(value).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}`
const choice = (key, label, options = yesNo, extra = {}) => ({ key, label, type: 'choice', options, ...extra })
const field = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra })
const finance = ['Home loan / bond', 'Cash plus home loan']

export function validateScreeningContext(kind, input = {}) {
  if (!['buyer', 'tenant'].includes(kind)) throw new Error('Choose buyer or tenant screening.')
  const context = {}
  for (const key of ['propertyLabel', 'location', 'agencyName', 'conditions', 'petPolicy', 'privacyContact', 'retention']) {
    const value = clean(input[key])
    if (!value || value.length > 1800 || /\[[^\]]+\]/.test(value)) throw new Error(`Complete the verified ${key} before enabling screening.`)
    context[key] = value
  }
  const price = Number(input.price)
  if (!Number.isFinite(price) || price <= 0) throw new Error('Add the saved property price or monthly rent.')
  context.price = price
  let privacy
  try { privacy = new URL(input.privacyUrl) } catch { throw new Error('Add the agency HTTPS privacy notice.') }
  if (privacy.protocol !== 'https:' || privacy.username || privacy.password) throw new Error('Add the agency HTTPS privacy notice.')
  context.privacyUrl = privacy.href
  if (kind === 'tenant') {
    for (const key of ['leaseTerm', 'availableFrom', 'depositDue', 'fees']) {
      if (!clean(input[key]) || clean(input[key]).length > 1800 || /\[[^\]]+\]/.test(input[key])) throw new Error(`Complete the verified ${key}.`)
      context[key] = clean(input[key])
    }
    context.deposit = Number(input.deposit)
    if (!Number.isFinite(context.deposit) || context.deposit < 0) throw new Error('Confirm the actual rental deposit, including zero where applicable.')
  } else {
    for (const key of ['rates', 'levy']) {
      if (input[key] === '' || input[key] === undefined || input[key] === null || !Number.isFinite(Number(input[key])) || Number(input[key]) < 0) throw new Error(`Confirm ${key}, including zero where not applicable.`)
      context[key] = Number(input[key])
    }
  }
  for (const question of screeningQuestions(kind, context)) {
    if (screeningQuestionText(question, { kind, context_snapshot: context, answers: {} }).length > 3500) throw new Error(`Shorten the ${question.key} wording so the question fits in a WhatsApp message. Keep the full details in the privacy notice.`)
  }
  return context
}

export function screeningQuestions(kind, context) {
  const c = context
  const common = [
    choice('property_conditions', `Property conditions: ${c.conditions}\nHave you read these conditions?`),
    choice('pet_policy', `Pet policy: ${c.petPolicy}\nHave you read and understood this policy?`, ['Yes', 'I need clarification']),
  ]
  const buyer = [
    choice('price_ok', `The asking price for ${c.propertyLabel} is ${money(c.price)}. Is this within your intended purchase budget?`),
    choice('location_ok', `The property is in ${c.location}. Are you happy with this location?`),
    field('maximum_price', 'What is your maximum intended purchase price?', 'money'),
    field('occupation_date', 'By when would you ideally like to take occupation? Reply YYYY-MM-DD.', 'date'),
    choice('funding', 'How will you fund the purchase?', ['Cash purchase', ...finance, 'Proceeds from another property sale', 'Other / discuss with agent']),
    choice('finance_position', 'What is your current finance position?', ['Cash funds available', 'Written bond prequalification available', 'Bond application in progress', 'Finance not assessed yet', 'Subject to property sale / other funds']),
    field('deposit', 'How much cash deposit do you intend to contribute?', 'money'),
    choice('funds_available', 'When will the deposit or cash funds be available?', ['Available now', 'By a specific date', 'After another property sells', 'Other / discuss with agent']),
    field('funding_date_notes', 'Please explain the expected funding date or timing.', 'text', { when: a => Boolean(a.funds_available) && a.funds_available !== 'Available now' }),
    field('bond_amount', 'What is your intended bond amount?', 'money', { when: a => finance.includes(a.funding) }),
    choice('finance_help', 'Would you like help assessing your home-loan affordability? This does not start a bond application.', ['Yes — contact me first', 'No — I have my own contact'], { when: a => finance.includes(a.funding) }),
    choice('sale_dependency', 'Is your purchase dependent on selling another property?', ['Yes', 'No']),
    choice('sale_stage', 'What stage is that sale at?', ['Not yet listed', 'On the market', 'Offer accepted, conditions outstanding', 'Unconditional, transfer pending', 'Transfer completed'], { when: a => a.sale_dependency === 'Yes' || a.funding === 'Proceeds from another property sale' }),
    choice('purchase_costs', `Rates: ${money(c.rates)} per month. Levy: ${money(c.levy)} per month. Have you also made provision for transfer costs, bond costs and transfer duty where applicable, in addition to the purchase price?`),
    choice('buyer_entity', 'In whose name do you intend to buy?', ['My own name', 'Joint buyers', 'Company / trust / other entity', 'Still deciding']),
    field('purchase_conditions', 'Any other purchase conditions or funding dates we should know about? Reply SKIP if none.', 'text', { optional: true }),
    ...common,
    choice('pet_clarification', 'Do you need clarification or approval relating to pets?', ['No / not applicable', 'Yes — please contact me']),
    field('occupants', 'Expected number of occupants? Reply SKIP if not known.', 'integer', { optional: true }),
  ]
  const tenant = [
    choice('price_ok', `The monthly rental for ${c.propertyLabel} is ${money(c.price)}. Are you happy and comfortable with this amount?`, ['Yes', 'No']),
    choice('location_ok', `The property is in ${c.location}. Are you happy with this location?`, ['Yes', 'No']),
    field('occupation_date', `Available from: ${c.availableFrom}. By when would you like to move? Reply YYYY-MM-DD.`, 'date'),
    choice('lease_term', `Offered lease term: ${c.leaseTerm}. What term would you prefer?`, ['6 months', '12 months', '24 months', 'Other / discuss with agent']),
    choice('employment', 'What is your employment or income situation?', ['Employed full-time', 'Part-time / contract', 'Self-employed / business owner', 'Retired / pension income', 'Other regular income', 'No income / supported by someone else']),
    field('income', 'What is the combined monthly take-home income available to pay this rental? Do not send bank account details or statements here.', 'money'),
    field('commitments', 'What are your combined monthly commitments, excluding this rental? Include debt repayments, maintenance and normal living expenses.', 'money'),
    choice('rent_payer', 'Who will be responsible for paying the rent?', ['I will pay', 'Joint applicants', 'Employer / company', 'Another person / sponsor']),
    choice('deposit_available', `The rental deposit is ${money(c.deposit)}, due ${c.depositDue}. Will it be available then?`, ['Yes', 'No', 'Discuss timing']),
    choice('fees_understood', `Disclosed application costs and refund terms:\n${c.fees}\nNo payment is collected in this chat. Have you read and understood these costs and when they become payable?`, ['Yes', 'I need clarification']),
    field('occupants', 'How many people will live in the property in total?', 'integer'),
    field('applicants', 'How many people will sign the lease as applicants?', 'integer'),
    ...common,
    choice('pets', 'Will any pets live with you?', ['No', 'Yes']),
    field('pet_details', 'Please give the number and type of pets, including any approval you need.', 'text', { when: a => a.pets === 'Yes' }),
    choice('screening_permission', `Do you authorise ${c.agencyName} to assess the details you provide for this rental application, verify identity, income and references, and obtain a TPN / authorised credit-bureau report for this application? Recording this answer does not run a credit check.\nPrivacy: ${c.privacyUrl}`, ['Yes, I authorise screening', 'No, please contact me'], { declineHandoff: true }),
  ]
  return [
    choice('review_permission', `${c.agencyName} will use your answers to review this property enquiry and arrange the next steps. Access is restricted to authorised staff and necessary service providers. Only necessary qualification details are shared with the seller or landlord; ID copies are not routinely shared.\nPrivacy: ${c.privacyUrl}\nContact: ${c.privacyContact}\nRetention: ${c.retention}\nMay the team review your supplied details and contact you about this enquiry?`, ['Yes', 'No, contact an agent'], { declineHandoff: true }),
    ...(kind === 'tenant' ? tenant : buyer),
    field('additional_notes', 'Is there anything else you would like the agent to know? Reply SKIP if none.', 'text', { optional: true }),
    choice('identity_route', 'An identity check is needed before a viewing can be confirmed. Do not send ID numbers or ID documents in this chat. Would you like the agent to send a secure upload link, or arrange an alternative check?', ['Request secure upload link', 'Alternative identity check']),
    field('full_name', 'Please confirm your full name.'),
    field('mobile', 'Please confirm your mobile number in international format, for example +27821234567.', 'phone'),
    field('email', 'Please confirm your email address.', 'email'),
    field('viewing_options', 'Please suggest one to three viewing options in South African time. Use YYYY-MM-DD HH:MM-HH:MM, separated by semicolons. For example: 2027-01-15 10:00-11:00. Your agent will confirm availability.', 'viewings'),
    choice('accuracy', 'Have you read the privacy information, and are the details you provided accurate to the best of your knowledge?', ['Yes', 'I need agent assistance'], { declineHandoff: true }),
  ]
}

export function nextScreeningQuestion(kind, context, answers = {}) {
  return screeningQuestions(kind, context).find(q => !Object.hasOwn(answers, q.key) && (!q.when || q.when(answers))) || null
}

export function screeningQuestionText(question, session) {
  const total = screeningQuestions(session.kind, session.context_snapshot).length
  const answered = Object.keys(session.answers || {}).length
  return `Question ${answered + 1} · up to ${total}\n\n${question.label}${question.options ? '\n\n' + question.options.map((v, i) => `${i + 1}. ${v}`).join('\n') : ''}\n\nReply AGENT for help, PAUSE to pause, or STOP to stop.`
}

export function parseScreeningAnswer(question, input) {
  const value = clean(input)
  if (!value || value.length > 2000) return { error: 'Please send an answer of 1–2,000 characters, or reply AGENT for help.' }
  if (question.optional && value.toLowerCase() === 'skip') return { value: null }
  if (question.type === 'choice') {
    const index = /^\d+$/.test(value) ? Number(value) - 1 : question.options.findIndex(option => option.toLowerCase() === value.toLowerCase())
    return index >= 0 && index < question.options.length ? { value: question.options[index] } : { error: 'Please reply with one of the numbered choices.' }
  }
  if (['money', 'integer'].includes(question.type)) {
    let normalized = value.replace(/^R\s*/i, '').trim()
    if (/\s/.test(normalized)) {
      if (!/^\d{1,3}( \d{3})+([.,]\d{1,2})?$/.test(normalized)) return { error: 'Please use an amount such as 15000.50 or 15 000,50.' }
      normalized = normalized.replace(/ /g, '')
    }
    if (normalized.includes(',')) {
      if (/^\d+,\d{1,2}$/.test(normalized)) normalized = normalized.replace(',', '.')
      else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(normalized)) normalized = normalized.replace(/,/g, '')
      else return { error: 'Please use an amount such as 15000.50 or 15 000,50.' }
    }
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return { error: 'Please reply with an amount or number, for example 15000.' }
    const amount = Number(normalized)
    if (!Number.isFinite(amount) || amount > 1e12 || (question.type === 'integer' && (!Number.isInteger(amount) || amount < 1 || amount > 100))) return { error: 'Please check that number and try again.' }
    return { value: amount }
  }
  if (question.type === 'date') {
    const date = new Date(`${value}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return { error: 'Please use YYYY-MM-DD, for example 2027-01-15.' }
  }
  if (question.type === 'phone' && !/^\+?[1-9]\d{6,14}$/.test(value.replace(/\s/g, ''))) return { error: 'Please use an international mobile number, for example +27821234567.' }
  if (question.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { error: 'Please check the email address and try again.' }
  if (question.type === 'viewings') {
    const options = value.split(/[;\n]/).map(v => v.trim()).filter(Boolean)
    if (options.length < 1 || options.length > 3) return { error: 'Please provide one to three viewing options.' }
    const parsed = []
    for (const option of options) {
      const parts = option.match(/^(\d{4}-\d{2}-\d{2})\s+([0-2]\d:[0-5]\d)\s*-\s*([0-2]\d:[0-5]\d)$/)
      if (!parts || Number(parts[2].slice(0, 2)) > 23 || Number(parts[3].slice(0, 2)) > 23 || parts[2] >= parts[3] || parseScreeningAnswer({ type: 'date' }, parts[1]).error) return { error: 'Please use YYYY-MM-DD HH:MM-HH:MM, with the end after the start. Separate up to three options with semicolons.' }
      parsed.push({ date: parts[1], from: parts[2], until: parts[3], timezone: 'Africa/Johannesburg' })
    }
    return { value: parsed }
  }
  return { value }
}

export function screeningAnswerText(value) {
  if (value === null) return 'Skipped'
  if (Array.isArray(value)) return value.map(v => `${v.date} ${v.from}–${v.until} (South African time)`).join('\n')
  return String(value)
}

export function advanceScreening(session, incoming) {
  const text = clean(incoming).toLowerCase()
  const state = { status: session.status, answers: { ...(session.answers || {}) }, current_key: session.current_key || null }
  if (['stop', 'unsubscribe', 'opt out', 'opt-out'].includes(text)) return { ...state, status: 'stopped', body: null }
  if (['agent', 'help', 'speak to an agent'].includes(text)) return { ...state, status: 'handoff', body: 'Your screening is saved. Your agent will take over from here.' }
  if (text === 'pause') return { ...state, status: 'paused', body: 'Your answers are saved. Reply RESUME to continue, AGENT for help, or STOP to stop.' }
  if (['paused', 'awaiting_start'].includes(session.status)) {
    const allowed = session.status === 'paused' ? ['resume', 'continue', 'start', 'start screening'] : ['start', 'start screening', 'yes', '1']
    if (!allowed.includes(text)) return { ...state, body: session.status === 'paused' ? 'Reply RESUME to continue, AGENT for help, or STOP to stop.' : 'Reply START to begin the screening, AGENT for help, or STOP to stop.' }
    state.status = 'active'
  } else if (session.status === 'active') {
    const question = nextScreeningQuestion(session.kind, session.context_snapshot, state.answers)
    if (!question || question.key !== session.current_key) throw new Error('Screening question state changed. Agent review required.')
    const parsed = parseScreeningAnswer(question, incoming)
    if (parsed.error) return { ...state, body: `${parsed.error}\n\n${screeningQuestionText(question, session)}` }
    state.answers[question.key] = parsed.value
    if (question.declineHandoff && parsed.value !== question.options[0]) return { ...state, status: 'handoff', current_key: null, body: 'Your preference is recorded. Your agent will contact you to discuss the next step.' }
  } else return { ...state, body: null }
  const next = nextScreeningQuestion(session.kind, session.context_snapshot, state.answers)
  if (!next) return { ...state, status: 'completed', current_key: null, body: 'Thank you. Your screening and viewing preferences have been saved for your agent to review. If you requested a secure identity-upload link, the agent will send it separately. No viewing, rental, purchase, credit check or finance approval has been confirmed.' }
  return { ...state, current_key: next.key, body: screeningQuestionText(next, { ...session, answers: state.answers }) }
}

export function screeningOpening(kind, context, name = '') {
  return `Hi${clean(name) ? ` ${clean(name)}` : ''}, thanks for your enquiry about ${context.propertyLabel} in ${context.location}. We have up to ${screeningQuestions(kind, context).length} short questions to help your agent review your ${kind === 'tenant' ? 'rental' : 'purchase'} enquiry. Reply START to begin, AGENT for assistance, or STOP to stop.`
}
