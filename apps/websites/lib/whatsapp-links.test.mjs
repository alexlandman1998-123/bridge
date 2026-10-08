import assert from 'node:assert/strict'
import test from 'node:test'
import { listingWhatsappHref, whatsappHref } from './whatsapp-links.ts'

test('Kingdom local and international agent numbers produce the same WhatsApp recipient', () => {
  for (const phone of ['0726962004', '072 696 2004', '(072) 696-2004', '+27 72 696 2004', '27726962004', '0027 72 696 2004', '+27 (0)72 696 2004']) {
    assert.equal(whatsappHref(phone), 'https://wa.me/27726962004', phone)
  }
  assert.equal(whatsappHref('+44 7911 123456'), 'https://wa.me/447911123456')
  assert.equal(whatsappHref('+27 71 102 2758'), 'https://wa.me/27711022758')
})

test('empty or malformed phone numbers do not create a broken WhatsApp button', () => {
  for (const phone of [undefined, '', ' ', 'not supplied', '072', '0000', '+27', '072696200', '072696200400', '277269620040', '0726962004 ext 2', '+27820000000/+27830000000']) {
    assert.equal(whatsappHref(phone), undefined, phone)
  }
})

test('listing actions use the assigned agent and preserve the full message', () => {
  const title = 'Home & garden | R2,000,000'
  const href = listingWhatsappHref({ title, consultant: { name: 'Kevin Croft', phone: '0726962004' } }, { whatsappNumber: '+27820000000' })
  const url = new URL(href)
  assert.equal(url.pathname, '/27726962004')
  assert.equal(url.searchParams.get('text'), `Hello Kevin Croft, I’m interested in ${title}.`)
})

test('own listings can fall back to the agency, while partner listings keep source-agent routing', () => {
  const site = { whatsappNumber: '082 000 0000' }
  assert.equal(new URL(listingWhatsappHref({ title: 'Home' }, site)).pathname, '/27820000000')
  assert.equal(new URL(listingWhatsappHref({ title: 'Home', consultant: { name: 'Agent', phone: 'invalid' } }, site)).pathname, '/27820000000')
  assert.equal(listingWhatsappHref({ title: 'Partner home', partnerListing: true }, site), undefined)
  assert.equal(listingWhatsappHref({ title: 'Partner home', partnerListing: true, consultant: { name: 'Source agent', phone: 'invalid' } }, site), undefined)
  assert.equal(new URL(listingWhatsappHref({ title: 'Partner home', partnerListing: true, consultant: { name: 'Esmerie', phone: '+27711022758' } }, site)).pathname, '/27711022758')
})
