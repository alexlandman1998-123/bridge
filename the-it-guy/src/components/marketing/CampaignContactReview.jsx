import { GENERAL_CONTACT_FIELDS, PROPERTY_CONTACT_FIELDS } from '../../services/campaignContactProvenance'
import './CampaignContactReview.css'

export default function CampaignContactReview({ builder, content, general = false, onOverride, onRefresh, nameLabel = 'Public agent name', destinationLabel = 'Public enquiry contact' }) {
  const provenance = builder.contactProvenance
  const labels = { agentName: nameLabel, agentEmail: 'Public agent email', agentPhone: 'Public agent phone', destination: destinationLabel }
  return <section className="campaign-contact-review" aria-label="Campaign contact source">
    <h3>Where these contact details come from</h3>
    {!provenance ? <><p role="status">This older draft has no contact source record. Refresh the public details, review the rebuilt wording and confirm it before preparing assets or channel drafts. Your saved draft stays available.</p>{content && <details className="campaign-contact-saved-copy"><summary>Review the saved wording before refreshing</summary><p>Refreshing rebuilds this wording from current public details. Keep a copy of any manual text you want to use again.</p>{Object.entries(content).filter(([, value]) => value?.body).map(([channel, value]) => <article key={channel}><h4>{channel === 'email' ? 'Email' : channel === 'whatsapp' ? 'WhatsApp' : 'Social'}</h4><strong>{value.title}</strong><pre>{value.body}</pre></article>)}</details>}<button type="button" className="mc-button" onClick={onRefresh}>Refresh public contacts and wording</button></> : <>
      <p>These are the public contacts loaded for this campaign. Any campaign-only change below is saved separately and needs your confirmation. Your public profile stays unchanged.</p>
      <dl>{(general ? GENERAL_CONTACT_FIELDS : PROPERTY_CONTACT_FIELDS).map((key) => <div key={key}><dt>{labels[key]}</dt><dd>{provenance.source[key] || 'Not present in the current public details'}{Object.hasOwn(provenance.overrides, key) && <small>Campaign-only: {provenance.overrides[key] || 'Cleared for this campaign'}</small>}</dd></div>)}</dl>
      {['agentName', 'destination'].map((key) => {
        const override = Object.hasOwn(provenance.overrides, key)
        return <div className="campaign-contact-override" key={key}>
          <label className="campaign-contact-toggle"><input type="checkbox" checked={override} onChange={(event) => onOverride(key, builder.source[key] || '', event.target.checked)} />Use a campaign-only {key === 'agentName' ? 'agent name' : 'enquiry contact'}</label>
          {(override || !provenance.source[key]) && <label>{labels[key]}<input maxLength={key === 'agentName' ? 120 : 240} value={builder.source[key] || ''} onChange={(event) => onOverride(key, event.target.value, true)} /></label>}
        </div>
      })}
      <p className="campaign-contact-confirmation">Confirming the campaign details also confirms these current contacts and any campaign-only overrides. Refreshing public details clears overrides and rebuilds wording.</p>
    </>}
  </section>
}
