import { ArrowUpRight, X } from 'lucide-react'
import './HomeSeekersValuationModal.css'

export default function HomeSeekersValuationModal({ onClose }) {
  return <div className="hs-valuation-modal" role="presentation" onMouseDown={onClose}>
    <section className="hs-valuation-modal__panel" role="dialog" aria-modal="true" aria-labelledby="valuation-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="hs-valuation-modal__intro"><p>❯ FREE <strong>VALUATION</strong></p><h2 id="valuation-title">Start with a clearer picture.</h2><p>Tell us a little about the property. We will use it only to arrange your valuation.</p><small>HOME SEEKERS<br />MOVE FORWARD, FASTER.</small></div>
      <form action="mailto:info@homeseeker.co.za" method="post" encType="text/plain"><button className="hs-valuation-modal__close" type="button" aria-label="Close valuation form" onClick={onClose}><X size={20} /></button><p>BOOK YOUR FREE VALUATION</p><label>Your name<input name="name" required placeholder="Your name" autoFocus /></label><label>Mobile number<input name="phone" type="tel" required placeholder="Your mobile number" /></label><label>Email address<input name="email" type="email" required placeholder="you@example.com" /></label><label>Property address<textarea name="propertyAddress" required rows="2" placeholder="Street address and suburb" /></label><button className="hs-valuation-modal__submit" type="submit">Request a valuation <ArrowUpRight size={18} /></button></form>
    </section>
  </div>
}
