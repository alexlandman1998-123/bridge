import { Gift, Mail } from 'lucide-react'

// Illustrative creative previews. These are not published ads or sent messages.
export default function CampaignTemplatePreview({ type }) {
  if (type === 'sellers')
    return (
      <div
        className="mc-creative-sample mc-creative-ad"
        role="img"
        aria-label="Example valuation advert with a property photograph and complimentary valuation offer"
      >
        <img
          className="mc-creative-photo"
          src="/brand/agency-intake-sell.webp"
          alt=""
          loading="lazy"
        />
        <span className="mc-creative-example">Sample advert</span>
        <div className="mc-creative-ad-copy">
          <span>YOUR NEXT MOVE STARTS HERE</span>
          <strong>
            What is your
            <br />
            home worth?
          </strong>
          <span className="mc-creative-ad-cta">
            Book a complimentary valuation ↗
          </span>
        </div>
      </div>
    )
  if (type === 'buyers')
    return (
      <div
        className="mc-creative-sample mc-creative-listing"
        role="img"
        aria-label="Example property announcement with a coastal home photograph and viewing invitation"
      >
        <div className="mc-creative-listing-photo">
          <img
            src="/brand/landlord-demo/ocean-view-villa.jpg"
            alt=""
            loading="lazy"
          />
          <span className="mc-creative-example">Sample property email</span>
        </div>
        <div className="mc-creative-listing-copy">
          <span>FIND A PLACE TO CALL HOME</span>
          <strong>Your next chapter starts here.</strong>
          <small>
            Explore the property <span aria-hidden="true">↗</span>
          </small>
        </div>
      </div>
    )
  if (type === 'relationships')
    return (
      <div
        className="mc-creative-sample mc-creative-newsletter"
        role="img"
        aria-label="Example property newsletter with a local market update and property advice"
      >
        <div className="mc-creative-mailbar">
          <Mail size={13} />
          <span>Your local property update</span>
          <small>Sample email</small>
        </div>
        <div className="mc-creative-newsletter-copy">
          <span>THE NEIGHBOURHOOD EDIT</span>
          <strong>A little local insight.</strong>
          <div className="mc-creative-story">
            <img src="/brand/agency-intake-sell.webp" alt="" loading="lazy" />
            <div>
              <b>At home in your area</b>
              <small>
                Property news. Local knowledge.
                <br />A fresh perspective.
              </small>
            </div>
          </div>
          <div className="mc-creative-newsletter-footer">
            Market updates <span>•</span> Home advice <span>•</span> Local
            stories
          </div>
        </div>
      </div>
    )
  return (
    <div
      className="mc-creative-sample mc-creative-milestone"
      role="img"
      aria-label="Example birthday WhatsApp message with a gift illustration and personal greeting"
    >
      <div className="mc-creative-chatbar">
        <img src="/lead-sources/whatsapp.svg" alt="" width="16" height="16" />
        <span>A personal touch</span>
        <small>Sample message</small>
      </div>
      <div className="mc-creative-greeting">
        <Gift size={27} strokeWidth={1.3} />
        <strong>A day worth celebrating.</strong>
        <span>
          Wishing you a wonderful birthday
          <br />
          and a year of happy moments.
        </span>
        <small>Warm wishes, your property partner</small>
      </div>
    </div>
  )
}
