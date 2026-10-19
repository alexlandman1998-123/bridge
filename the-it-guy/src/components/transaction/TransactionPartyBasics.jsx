import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { PARTY_ENTITY_OPTIONS, createTransactionPartyPerson, isNaturalParty } from '../../core/transactions/transactionPartyProfile.js'

function splitName(name = '') {
  const [firstName = '', ...rest] = name.trim().split(/\s+/)
  return { name, firstName, surname: rest.join(' ') }
}

function PersonFields({ person, onChange }) {
  const [draft, setDraft] = useState(() => splitName(person.name))
  const names = draft.name === person.name ? draft : splitName(person.name)
  function changeName(key, value) {
    const next = { ...names, [key]: value }
    next.name = [next.firstName, next.surname].filter(Boolean).join(' ').trim()
    setDraft(next)
    onChange({ name: next.name })
  }
  return <div className="transaction-party-basics-fields">
    <label>Name<input value={names.firstName} autoComplete="given-name" onChange={(event) => changeName('firstName', event.target.value)} /></label>
    <label>Surname<input value={names.surname} autoComplete="family-name" onChange={(event) => changeName('surname', event.target.value)} /></label>
    <label>Email<input type="email" value={person.email} autoComplete="email" onChange={(event) => onChange({ email: event.target.value })} /></label>
    <label>Phone number<input type="tel" value={person.phone} autoComplete="tel" onChange={(event) => onChange({ phone: event.target.value })} /></label>
  </div>
}

function personRole(entityType) {
  return isNaturalParty(entityType) ? 'owner' : entityType.includes('trust') ? 'trustee' : entityType === 'deceased_estate' ? 'executor' : 'authorised_representative'
}

export default function TransactionPartyBasics({ side, value, onChange, readOnly = false }) {
  function patch(changes) {
    if (!readOnly) onChange({ ...value, ...changes })
  }
  return <fieldset disabled={readOnly} className="transaction-party-basics">
    <label className="transaction-party-entity">Entity type<select aria-label={`${side} entity type`} value={value.entityType} onChange={(event) => {
      const entityType = event.target.value
      patch({ entityType, people: value.people.map((person) => ({ ...person, role: personRole(entityType), isOwner: isNaturalParty(entityType) })) })
    }}>{PARTY_ENTITY_OPTIONS.filter((option) => side === 'Seller' || option.value !== 'deceased_estate').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    {!isNaturalParty(value.entityType) && value.entityType !== 'unknown' ? <label className="transaction-party-entity">Entity name<input aria-label={`${side} entity name`} value={value.name} onChange={(event) => patch({ name: event.target.value })} /></label> : null}
    {value.people.map((person, index) => <div key={person.id} role="group" aria-label={`${side} person ${index + 1}`} className="transaction-party-basic-person">
      {value.people.length > 1 ? <div className="transaction-party-person-heading"><span>Person {index + 1}</span>{!readOnly ? <button type="button" aria-label={`Remove ${side.toLowerCase()} person ${index + 1}`} onClick={() => {
        const remaining = value.people.filter((item) => item.id !== person.id)
        patch({ people: remaining.map((item, nextIndex) => ({ ...item, primaryContact: person.primaryContact ? nextIndex === 0 : item.primaryContact })) })
      }}><Trash2 size={15} aria-hidden="true" /></button> : null}</div> : null}
      <PersonFields person={person} onChange={(changes) => patch({ people: value.people.map((item) => item.id === person.id ? { ...item, ...changes } : item) })} />
    </div>)}
    {!readOnly ? <button type="button" className="transaction-party-add-person" onClick={() => patch({ people: [...value.people, { ...createTransactionPartyPerson(personRole(value.entityType)), primaryContact: value.people.length === 0 }] })}><Plus size={15} aria-hidden="true" />Add person</button> : null}
  </fieldset>
}
