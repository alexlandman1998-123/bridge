import { ArrowLeft, Check, CheckCheck, Grid3X3, Loader2, Mail, Mic, MicOff, MoreHorizontal, Paperclip, Phone, PhoneOff, Send, Smile, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Modal from '../ui/Modal'
import './development-lead-contact-demo.css'

const EXAMPLE = {
  name: 'Sarah Williams', initials: 'SW', phone: '+27 82 555 0147', email: 'sarah.williams@example.com',
  development: 'Harbour Heights', property: 'Two-bedroom apartment · Unit A204',
}
const MESSAGE = 'Hi Sarah, thank you for your interest in Harbour Heights. We have a beautiful two-bedroom apartment available. Would Saturday at 10:00 suit you for a viewing?'
const EMAIL = 'Hi Sarah,\n\nThank you for your interest in Harbour Heights.\n\nWe have a two-bedroom apartment available in Unit A204, and I would love to show you around. Would Saturday at 10:00 suit you for a viewing?\n\nI can also send you the floor plan and pricing before we meet.\n\nKind regards,\nAlex\nRevo Property'
const duration = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

function ContactDialog({ onClose }) {
  const navigationRef = useRef(null)
  const chatRef = useRef(null)
  const [channel, setChannel] = useState('choose')
  const [whatsappDraft, setWhatsappDraft] = useState(MESSAGE)
  const [messages, setMessages] = useState([])
  const [whatsappStatus, setWhatsappStatus] = useState('idle')
  const [emailDraft, setEmailDraft] = useState(EMAIL)
  const [subject, setSubject] = useState('Your Harbour Heights viewing')
  const [emailStatus, setEmailStatus] = useState('draft')
  const [attachment, setAttachment] = useState(false)
  const [callState, setCallState] = useState('dialling')
  const [seconds, setSeconds] = useState(0)
  const [muted, setMuted] = useState(false)
  const [speaker, setSpeaker] = useState(false)
  const [keypad, setKeypad] = useState(false)
  const [digits, setDigits] = useState('')

  useEffect(() => { navigationRef.current?.focus() }, [channel])
  useEffect(() => {
    if (channel === 'whatsapp' && chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [channel, messages])

  useEffect(() => {
    if (channel !== 'whatsapp' || whatsappStatus !== 'sent') return
    const timer = setTimeout(() => {
      setWhatsappStatus('read')
      setMessages((previous) => [...previous, { direction: 'in', text: 'Saturday at 10:00 works perfectly. Please send me the location. Thank you!' }])
    }, 1800)
    return () => clearTimeout(timer)
  }, [channel, whatsappStatus])

  useEffect(() => {
    if (channel !== 'email' || emailStatus !== 'sending') return
    const timer = setTimeout(() => setEmailStatus('sent'), 900)
    return () => clearTimeout(timer)
  }, [channel, emailStatus])

  useEffect(() => {
    if (channel !== 'phone' || callState === 'ended' || callState === 'connected') return
    const timer = setTimeout(() => setCallState(callState === 'dialling' ? 'ringing' : 'connected'), callState === 'dialling' ? 700 : 1800)
    return () => clearTimeout(timer)
  }, [channel, callState])

  useEffect(() => {
    if (channel !== 'phone' || callState !== 'connected') return
    const timer = setInterval(() => setSeconds((previous) => previous + 1), 1000)
    return () => clearInterval(timer)
  }, [channel, callState])

  const startCall = () => { setCallState('dialling'); setSeconds(0); setMuted(false); setSpeaker(false); setKeypad(false); setDigits(''); setChannel('phone') }
  const sendWhatsapp = (event) => {
    event.preventDefault()
    if (!whatsappDraft.trim() || whatsappStatus === 'sent') return
    setMessages((previous) => [...previous, { direction: 'out', text: whatsappDraft.trim() }])
    event.currentTarget.querySelector('textarea')?.focus()
    setWhatsappDraft('')
    setWhatsappStatus('sent')
  }
  const sendEmail = (event) => { event.preventDefault(); if (subject.trim() && emailDraft.trim()) { navigationRef.current?.focus(); setEmailStatus('sending') } }

  return <Modal open onClose={onClose} title={channel === 'choose' ? 'Contact lead' : channel === 'whatsapp' ? 'WhatsApp' : channel === 'email' ? 'Email' : 'Phone call'} className={`development-contact-dialog development-contact-dialog--${channel}`}>
    <div className="development-contact-topline">
      {channel !== 'choose' ? <button ref={navigationRef} type="button" onClick={() => setChannel('choose')}><ArrowLeft size={14} aria-hidden="true" />Contact options</button> : <span>Choose how to get in touch</span>}
      <span className="development-contact-demo-badge">Demo</span>
    </div>
    {channel === 'choose' ? <>
      <div className="development-contact-lead"><span className="development-contact-avatar">{EXAMPLE.initials}</span><div><strong>{EXAMPLE.name}</strong><span>{EXAMPLE.phone} · {EXAMPLE.email}</span></div></div>
      <div className="development-contact-property"><img src="/brand/harbour-heights-apartment-14.png" alt="Harbour Heights example apartment" /><div><strong>{EXAMPLE.development}</strong><span>{EXAMPLE.property}</span><small>Enquired about a viewing</small></div></div>
      <div className="development-contact-channels" role="group" aria-label="Contact channels">
        <button ref={navigationRef} type="button" onClick={() => setChannel('whatsapp')}><span className="development-contact-channel-icon is-whatsapp"><img src="/lead-sources/whatsapp.svg" alt="" /></span><strong>WhatsApp</strong><span>Start a conversation</span></button>
        <button type="button" onClick={() => setChannel('email')}><span className="development-contact-channel-icon is-email"><Mail size={25} aria-hidden="true" /></span><strong>Email</strong><span>Send a personal message</span></button>
        <button type="button" onClick={startCall}><span className="development-contact-channel-icon is-phone"><Phone size={24} aria-hidden="true" /></span><strong>Phone</strong><span>Call the buyer</span></button>
      </div>
    </> : null}
    {channel === 'whatsapp' ? <div className="development-contact-whatsapp">
      <header><span className="development-contact-avatar">{EXAMPLE.initials}</span><div><strong>{EXAMPLE.name}</strong><span>{whatsappStatus === 'sent' ? 'typing…' : 'online'}</span></div><span className="development-contact-chat-brand"><img src="/lead-sources/whatsapp.svg" alt="WhatsApp" /></span><MoreHorizontal size={20} aria-hidden="true" /></header>
      <div ref={chatRef} className="development-contact-chat" role="log" aria-label="Demo WhatsApp conversation" aria-live="polite">
        <span className="development-contact-chat-day">Today</span>
        <div className="development-contact-bubble is-incoming">Hi, I saw the two-bedroom apartment at Harbour Heights. Is it still available, and could I arrange a viewing?<small>10:42</small></div>
        {messages.map((message, index) => <div key={index} className={`development-contact-bubble ${message.direction === 'out' ? 'is-outgoing' : 'is-incoming'}`}>{message.text}<small>Just now {message.direction === 'out' ? <CheckCheck size={14} className={whatsappStatus === 'read' ? 'is-read' : ''} aria-label={whatsappStatus === 'read' ? 'Read in demo' : 'Delivered in demo'} /> : null}</small></div>)}
        {whatsappStatus === 'sent' ? <div className="development-contact-typing" aria-label="Sarah is typing"><i /><i /><i /></div> : null}
      </div>
      <form className="development-contact-chat-composer" onSubmit={sendWhatsapp}><Smile size={21} aria-hidden="true" /><textarea aria-label="WhatsApp message" value={whatsappDraft} placeholder="Type a message" onChange={(event) => setWhatsappDraft(event.target.value)} rows={3} /><button type="submit" disabled={!whatsappDraft.trim() || whatsappStatus === 'sent'} aria-label="Send WhatsApp demo message"><Send size={18} aria-hidden="true" /></button></form>
    </div> : null}
    {channel === 'email' ? <div className="development-contact-email">
      <div className="development-contact-email-heading"><span><Mail size={18} aria-hidden="true" />New message</span><small>Revo Property</small></div>
      {emailStatus === 'sent' ? <div className="development-contact-email-success" role="status"><span><Check size={27} aria-hidden="true" /></span><h4>Email sent in demo</h4><p>Your message to {EXAMPLE.name} is shown as delivered.</p><small>{EXAMPLE.email}</small><button type="button" onClick={() => setEmailStatus('draft')}>Write another message</button></div> : <form onSubmit={sendEmail}>
        <div className="development-contact-email-address"><span>From</span><strong>Alex · Revo Property</strong><small>alex@example.com</small></div>
        <div className="development-contact-email-address"><span>To</span><span className="development-contact-email-recipient">{EXAMPLE.name} <small>&lt;{EXAMPLE.email}&gt;</small></span></div>
        <label className="development-contact-email-subject"><span>Subject</span><input value={subject} onChange={(event) => setSubject(event.target.value)} disabled={emailStatus === 'sending'} /></label>
        <textarea aria-label="Email message" rows={10} value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} disabled={emailStatus === 'sending'} />
        {attachment ? <div className="development-contact-email-attachment"><Paperclip size={13} aria-hidden="true" />Harbour Heights brochure.pdf <small>Sample attachment</small><button type="button" onClick={() => setAttachment(false)} aria-label="Remove sample attachment">×</button></div> : null}
        <div className="development-contact-email-toolbar"><button className="development-contact-send-email" type="submit" disabled={emailStatus === 'sending' || !subject.trim() || !emailDraft.trim()}>{emailStatus === 'sending' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}{emailStatus === 'sending' ? 'Sending…' : 'Send email'}</button><button type="button" onClick={() => setAttachment(!attachment)} disabled={emailStatus === 'sending'} aria-label="Add sample brochure"><Paperclip size={18} aria-hidden="true" /></button><span>Draft · Demo</span></div>
      </form>}
    </div> : null}
    {channel === 'phone' ? <div className="development-contact-caller">
      <div className="development-contact-call-brand"><span><Phone size={14} aria-hidden="true" />Revo dialler</span><span><i />Demo line</span></div>
      <div className={`development-contact-call-avatar ${callState === 'ringing' || callState === 'dialling' ? 'is-ringing' : ''}`}>{EXAMPLE.initials}</div>
      <h4>{EXAMPLE.name}</h4><p>{EXAMPLE.phone}</p><span className="development-contact-call-status" role="status">{callState === 'dialling' ? 'Dialling…' : callState === 'ringing' ? 'Ringing…' : callState === 'ended' ? 'Call ended' : 'Connected'}</span>
      <strong className="development-contact-call-duration" aria-label="Call duration">{callState === 'connected' || callState === 'ended' ? duration(seconds) : 'Outbound call'}</strong>
      <div className="development-contact-call-context">{EXAMPLE.development} · Unit A204</div>
      {callState !== 'ended' ? <>
        <div className="development-contact-call-controls">
          <button type="button" aria-label="Mute" aria-pressed={muted} onClick={() => setMuted(!muted)}><span>{muted ? <MicOff size={21} /> : <Mic size={21} />}</span>{muted ? 'Muted' : 'Mute'}</button>
          <button type="button" aria-label="Keypad" aria-pressed={keypad} onClick={() => setKeypad(!keypad)}><span><Grid3X3 size={21} /></span>Keypad</button>
          <button type="button" aria-label="Speaker" aria-pressed={speaker} onClick={() => setSpeaker(!speaker)}><span><Volume2 size={21} /></span>Speaker</button>
        </div>
        {keypad ? <div className="development-contact-keypad"><output aria-label="Dialled digits">{digits || ' '}</output><div>{['1','2','3','4','5','6','7','8','9','*','0','#'].map((digit) => <button key={digit} type="button" aria-label={`Dial ${digit}`} onClick={() => setDigits((previous) => previous + digit)}>{digit}</button>)}</div></div> : null}
        <button type="button" className="development-contact-end-call" onClick={() => { navigationRef.current?.focus(); setCallState('ended'); setKeypad(false) }}><PhoneOff size={21} aria-hidden="true" />End call</button>
      </> : <button type="button" className="development-contact-call-again" onClick={startCall}><Phone size={17} aria-hidden="true" />Call again</button>}
    </div> : null}
    <p className="development-contact-demo-note">Sample buyer · No messages or calls are sent</p>
  </Modal>
}

export default function DevelopmentLeadContactDemo() {
  const [open, setOpen] = useState(false)
  return <div className="development-contact-action" onClick={(event) => event.stopPropagation()}>
    <button type="button" onClick={() => setOpen(true)}><Phone size={13} aria-hidden="true" />Contact</button>
    {open ? <ContactDialog onClose={() => setOpen(false)} /> : null}
  </div>
}
