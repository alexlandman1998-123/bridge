import { ArrowRight, Bath, BedDouble, Car, Check } from "lucide-react";
import { useState } from "react";
import HomeSeekersValuationModal from "./HomeSeekersValuationModal";
import HomeSeekersMobileNav from "./HomeSeekersMobileNav";
import HomeSeekersFooter from "./HomeSeekersFooter";
import HomeSeekersFastTrack from "./HomeSeekersFastTrack";
import "./HomeSeekersDemo.css";
import "./HomeSeekersEditorial.css";
import "./HomeSeekersProcess.css";
import "./HomeSeekersGuarantee.css";
import "./HomeSeekersResults.css";
import "./HomeSeekersAcademy.css";
import "./HomeSeekersFooter.css";
import "./HomeSeekersBrand.css";

const asset = "https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/";
const images = {
  hero: `${asset}pages/2026/8/869_eeb9a8cde79f42729798b3578488dc1e_t_w_1440_h_900.avif`,
  careers: `${asset}pages/2025/12/869_424ce675e29a4906a0d709d7ef138c88_t_w_639_h_728.avif`,
};
const listings = [
  {
    place: "Waterkloof",
    price: "R25,800,000",
    beds: "5",
    baths: "7",
    cars: "5",
    image: `${asset}residential/2026/2/869_42e792e711594d22ad9df15a573182f4_t_w_1540_h_635.avif`,
  },
  {
    place: "Steyn City",
    price: "R12,995,000",
    beds: "3",
    baths: "3",
    cars: "2",
    image: `${asset}residential/2025/8/869_97bcc14546414da09ea8ba586b858759_t_w_505_h_490.avif`,
  },
  {
    place: "Waterkloof",
    price: "R3,490,000",
    beds: "Land",
    baths: "",
    cars: "",
    image: `${asset}residential/2025/8/869_f02bc109f42a499fb43e3e7b41af6c13_t_w_505_h_490.avif`,
  },
];
const localAreas = [
  {
    name: "Moreleta Park",
    number: "01",
    image:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=88",
  },
  {
    name: "Garsfontein",
    number: "02",
    image:
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=88",
  },
  {
    name: "Olympus",
    number: "03",
    image:
      "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=88",
  },
  {
    name: "Faerie Glen",
    number: "04",
    image:
      "https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/residential/2025/8/869_97bcc14546414da09ea8ba586b858759_t_w_505_h_490.avif",
  },
  {
    name: "Menlyn",
    number: "05",
    image:
      "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=88",
  },
];
const nav = [
  ["Selling", "/demo/homeseekers/selling"],
  ["Buying", "/demo/homeseekers/buying"],
  ["Renting", "/demo/homeseekers/renting"],
  ["Areas", "/demo/homeseekers/areas"],
  ["About", "/demo/homeseekers/about"],
  ["Join us", "/demo/homeseekers/join"],
];

function Eyebrow({ children }) {
  return (
    <p className="hs-brief-eyebrow">
      <b>❯</b> {children}
    </p>
  );
}

function ListingCard({ listing }) {
  return (
    <article className="hs-brief-listing">
      <img src={listing.image} alt={`${listing.place} property`} />
      <div>
        <p>For sale · {listing.place}</p>
        <h3>{listing.price}</h3>
        <span>
          <BedDouble size={15} /> {listing.beds}
          {listing.baths && (
            <>
              <Bath size={15} /> {listing.baths}
            </>
          )}
          {listing.cars && (
            <>
              <Car size={15} /> {listing.cars}
            </>
          )}
        </span>
        <a href="/demo/homeseekers/buy">
          View property <ArrowRight size={15} />
        </a>
      </div>
    </article>
  );
}

export default function HomeSeekersDemo() {
  const [valuationOpen, setValuationOpen] = useState(false);
  const [contactStatus, setContactStatus] = useState("");
  const [contactSending, setContactSending] = useState(false);

  async function submitContact(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setContactSending(true);
    setContactStatus("");
    try {
      const response = await fetch("/api/home-seekers/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "general_enquiry",
          name: form.get("name"),
          email: form.get("email"),
          message: form.get("message"),
          privacyAccepted: true,
          pageUrl: window.location.href,
          idempotencyKey: crypto.randomUUID(),
          companyWebsite: form.get("website"),
        }),
      });
      if (!response.ok) throw new Error("Submission failed");
      setContactStatus("Message received. We will be in touch shortly.");
      event.currentTarget.reset();
    } catch {
      setContactStatus("We could not send that just now. Please call us on +27 12 880 3127.");
    } finally {
      setContactSending(false);
    }
  }
  return (
    <main className="hs-site hs-brief" id="top">
      <header className="hs-brief-header hs-campaign-header">
        <a href="#top" className="hs-brief-logo" aria-label="Home Seekers home">
          <img
            src="/brand/homeseekers/home-seekers-horizontal-black.svg"
            alt="Home Seekers"
          />
        </a>
        <nav aria-label="Main navigation">
          {nav.map(([label, href]) => (
            <a href={href} key={label}>
              {label}
            </a>
          ))}
        </nav>
        <a
          className="hs-campaign-header__guarantee"
          href="#guarantee"
          aria-label="Read about the 45-day guarantee"
        >
          <strong>45</strong>
          <span>DAY<br />GUARANTEE</span>
        </a>
        <button
          type="button"
          className="hs-brief-button hs-brief-header__cta"
          onClick={() => setValuationOpen(true)}
        >
          Book a free valuation
        </button>
        <HomeSeekersMobileNav
          links={nav}
          active=""
          onValuation={() => setValuationOpen(true)}
        />
      </header>

      <section className="hs-brief-hero hs-campaign-hero">
        <div className="hs-campaign-hero__visual" aria-hidden="true">
          <img src={listings[0].image} alt="" />
        </div>
        <div className="hs-brief-hero__copy">
          <Eyebrow>
            THE <strong>45-DAY GUARANTEE</strong>
          </Eyebrow>
          <h1>Sold faster than<em> your hubby can fix the porch light.</em></h1>
          <p>
            45 days, or we cut the commission. No crossed fingers. Just a
            published promise.
          </p>
          <div className="hs-brief-actions">
            <button
              type="button"
              className="hs-brief-button"
              onClick={() => setValuationOpen(true)}
            >
              Get your 45-day game plan
            </button>
            <a className="hs-brief-text-link" href="#guarantee">
              How the guarantee works <ArrowRight size={16} />
            </a>
          </div>
          <small>
            Exclusive mandate. Listed at the recommended price.{" "}
            <a href="#guarantee">Full terms published - no small print.</a>
          </small>
        </div>
        <div className="hs-campaign-hero__track" aria-label="The 45-day sales process">
          <span><b>DAY 01</b> Price it right. Launch it hard.</span>
          <span><b>DAY 14</b> Viewings, feedback, momentum.</span>
          <span><b>DAY 45</b> Sold — or the commission drops.</span>
        </div>
      </section>

      <section className="hs-brief-problem hs-editorial-problem">
        <div className="hs-editorial-problem__story">
          <Eyebrow>
            WHY WE <strong>DID THIS</strong>
          </Eyebrow>
          <h2>
            You have heard
            <br />
            the pitch before.
          </h2>
          <div className="hs-editorial-problem__copy">
            <p>
              An optimistic price to win the mandate. A listing on the portals.
              Then silence.
            </p>
            <p>
              Three months later the price comes down anyway, and by then the
              property is stale and buyers assume something is wrong with it.
            </p>
            <p>
              We built the 45-day guarantee because a deadline is the only thing
              that turns a promise into a commitment.
            </p>
          </div>
        </div>
        <aside
          className="hs-editorial-problem__proof"
          aria-label="The cost of a stale listing"
        >
          <div className="hs-editorial-problem__number">
            45<span>DAY</span>
          </div>
          <ol>
            <li>
              <span>01</span>
              <p>
                <b>The optimistic price</b>A mandate won before the market
                agrees.
              </p>
            </li>
            <li>
              <span>02</span>
              <p>
                <b>The silence</b>A listing goes live, but feedback never
                arrives.
              </p>
            </li>
            <li>
              <span>03</span>
              <p>
                <b>The stale listing</b>Time passes. Buyers start asking what is
                wrong.
              </p>
            </li>
          </ol>
        </aside>
      </section>

      <HomeSeekersFastTrack
        compact
        onValuation={() => setValuationOpen(true)}
      />

      <section className="hs-presentation-proof" aria-labelledby="proof-title">
        <div>
          <Eyebrow>
            THE <strong>RECEIPTS</strong>
          </Eyebrow>
          <h2 id="proof-title">
            Promises are cheap.<br />
            <em>Proof is not.</em>
          </h2>
        </div>
        <p>
          The 45-day guarantee is a written commitment with a price tag, not a
          slogan with a footnote.
        </p>
        <div className="hs-presentation-proof__stats" aria-label="Home Seekers performance">
          <div><strong>28</strong><span>AVERAGE DAYS<br />TO OFFER</span></div>
          <div><strong>86%</strong><span>SOLD WITHIN<br />45 DAYS</span></div>
          <div><strong>97.4%</strong><span>OF ASKING<br />ACHIEVED</span></div>
        </div>
      </section>

      <section className="hs-brief-guarantee" id="guarantee">
        <div>
          <Eyebrow>
            THE <strong>GUARANTEE</strong>
          </Eyebrow>
          <h2 style={{ color: "#fff" }}>
            No crossed fingers.
            <br />
            Just a <em>45-day</em> promise.
          </h2>
          <p>
            We have all heard the big promise and the small print. This is the
            part where we put something on the line too.
          </p>
          <a
            className="hs-brief-button hs-brief-button--light"
            href="#valuation"
          >
            See if your home qualifies
          </a>
          <div className="hs-guarantee-marker">
            <strong>45</strong>
            <span>
              DAYS
              <br />· NO CROSSED FINGERS
            </span>
          </div>
        </div>
        <div className="hs-brief-commitments">
          <article>
            <h3 style={{ color: "#fff" }}>What we put on the line.</h3>
            <p>
              <Check size={16} /> Live on the market within <em>3 working days</em> of signature
            </p>
            <p>
              <Check size={16} /> The full marketing plan, executed as agreed
            </p>
            <p>
              <Check size={16} /> Written feedback every single week
            </p>
            <p>
              <Check size={16} /> Commission reduced from <em>7.5% to 3.75% (excl. VAT)</em> if not sold by day 45
            </p>
            <small>
              Our promise has a consequence. Not just a nice headline.
            </small>
          </article>
          <article>
            <h3 style={{ color: "#fff" }}>What makes it work.</h3>
            <p>
              <Check size={16} /> An exclusive mandate for the guarantee period
            </p>
            <p>
              <Check size={16} /> Listing at the recommended price
            </p>
            <p>
              <Check size={16} /> Reasonable access for viewings
            </p>
            <p>
              <Check size={16} /> Considering market-value offers in good faith
            </p>
            <small>A fair plan needs a fair partnership.</small>
          </article>
        </div>
      </section>

      <section className="hs-brief-results">
        <div className="hs-brief-results__header">
          <Eyebrow>
            RECENTLY <strong>SOLD</strong>
          </Eyebrow>
          <h2>Sold quicker than the estate WhatsApp can start speculating.</h2>
          <p>
            The deck records sales in 12 hours, one day, two days and beyond.
            The point is not the boast - it is a system that leaves a paper trail.
          </p>
        </div>
        <article className="hs-results-ledger">
          <header>
            <span>HOME SEEKERS / RESULTS</span>
            <span>45-DAY PERFORMANCE</span>
          </header>
          <div className="hs-results-ledger__statement">
            <strong>SOLD</strong>
            <h3>
              Built for a deadline.
              <br />
              <em>Backed by the numbers.</em>
            </h3>
          </div>
          <div className="hs-results-ledger__rows">
            <div>
              <span>AVERAGE DAYS TO OFFER</span>
              <b>28 days</b>
            </div>
            <div>
              <span>ON THE MARKET</span>
              <a href="#on-market">
                Explore current homes <ArrowRight size={16} />
              </a>
            </div>
          </div>
        </article>
      </section>

      <section className="hs-brief-areas" id="areas">
        <header>
          <div>
            <Eyebrow>
              YOUR SUBURB, NOT <strong>“THE AREA”</strong>
            </Eyebrow>
            <h2>
              Because “Pretoria East”
              <br />
              is not a suburb.
            </h2>
          </div>
          <p>
            Different streets. Different school runs. Different coffee orders.
            Local knowledge should be more specific than a pin on a map.
          </p>
        </header>
        <div className="hs-brief-areas__atlas">
          {localAreas.map((area, index) => (
            <a
              href="/demo/homeseekers/areas"
              key={area.name}
              className={index === 0 ? "is-featured" : ""}
            >
              <img src={area.image} alt="" />
              <span>{area.number}</span>
              <strong>{area.name}</strong>
              <i>
                <ArrowRight size={17} />
              </i>
            </a>
          ))}
          <a className="hs-brief-areas__more" href="/demo/homeseekers/areas">
            <span>06</span>
            <strong>
              More than
              <br />a postcode.
            </strong>
            <p>Explore the local atlas</p>
            <i>
              <ArrowRight size={17} />
            </i>
          </a>
        </div>
      </section>

      <section className="hs-brief-home-values">
        <header>
          <Eyebrow>
            THE <strong>HOME</strong> STANDARD
          </Eyebrow>
          <div>
            <h2>
              How we move
              <br />
              <em>every sale forward.</em>
            </h2>
            <p>Four non-negotiables. One accountable way of working.</p>
          </div>
        </header>
        <div className="hs-brief-home-values__grid">
          {[
            [
              "H",
              "Honest, always",
              "We tell it straight, even when it is not the easiest thing to say.",
            ],
            [
              "O",
              "Own the outcome",
              "We do not pass blame or disappear when things get difficult.",
            ],
            [
              "M",
              "Make it personal",
              "Every property is a person, a family, an important next step.",
            ],
            [
              "E",
              "Expertise in action",
              "Knowledge only creates value when it is applied.",
            ],
          ].map(([letter, title, copy], index) => (
            <article key={letter}>
              <span>0{index + 1}</span>
              <strong>{letter}</strong>
              <div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
              {index < 3 && <i aria-hidden="true" />}
            </article>
          ))}
        </div>
        <footer>
          <span>H</span>
          <span>O</span>
          <span>M</span>
          <span>E</span>
          <p>Not a slogan. The standard you can hold us to.</p>
        </footer>
      </section>

      <section className="hs-brief-section hs-brief-market" id="on-market">
        <div className="hs-brief-market__heading">
          <div>
            <Eyebrow>
              ON THE <strong>MARKET</strong>
            </Eyebrow>
            <h2>
              Homes worth
              <br />
              moving for.
            </h2>
          </div>
          <a className="hs-brief-text-link" href="/demo/homeseekers/buy">
            Browse all properties <ArrowRight size={16} />
          </a>
        </div>
        <div className="hs-brief-listings">
          {listings.map((listing) => (
            <ListingCard key={listing.price} listing={listing} />
          ))}
        </div>
      </section>

      <section className="hs-brief-join" id="join-us">
        <div className="hs-academy-image">
          <img src={images.careers} alt="Home Seekers team" />
          <span className="hs-academy-image-note">Less desk. More doorstep.</span>
        </div>
        <div className="hs-academy-copy">
          <Eyebrow>
            NOT YOUR AVERAGE <strong>AGENCY</strong>
          </Eyebrow>
          <h2>
            If “just checking in” is not your career plan, <em>we should talk.</em>
          </h2>
          <p>
            Learn the craft, get proper backup and build a pipeline that is not
            made of wishful thinking. We train people who want to become the
            name their suburb recommends.
          </p>
          <a className="hs-academy-link" href="/demo/homeseekers/join">
            See what you are signing up for <ArrowRight size={18} />
          </a>
        </div>
        <div className="hs-academy-strip">
          <span>
            <b>01</b> Learn the craft
          </span>
          <span>
            <b>02</b> Get real backup
          </span>
          <span>
            <b>03</b> Earn the referral
          </span>
        </div>
      </section>

      <section className="hs-brief-closing" id="valuation">
        <div>
          <Eyebrow>
            YOUR NEXT <strong>MOVE</strong>
          </Eyebrow>
          <h2 style={{ color: "#fff" }}>
            Find out what your home is worth, and how fast it can sell.
          </h2>
        </div>
        <button
          type="button"
          className="hs-brief-button hs-brief-button--light"
          onClick={() => setValuationOpen(true)}
        >
          Book a free valuation
        </button>
      </section>

      <section className="hs-brief-contact" id="contact">
        <div>
          <Eyebrow>
            START A <strong>CONVERSATION</strong>
          </Eyebrow>
          <h2>Tell us about your move.</h2>
          <p>
            786 Witdoring Avenue, Moreleta Park, Pretoria
            <br />
            +27 12 880 3127 · info@homeseeker.co.za
          </p>
        </div>
        <form onSubmit={submitContact}>
          <input name="name" aria-label="Your name" placeholder="Your name" required />
          <input name="email" type="email" aria-label="Email address" placeholder="Email address" required />
          <textarea
            name="message"
            aria-label="Your message"
            placeholder="How can we help?"
            rows="3"
          />
          <input className="hs-brief-contact__honeypot" name="website" tabIndex="-1" autoComplete="off" aria-hidden="true" />
          <p className="hs-brief-contact__status" role="status">{contactStatus}</p>
          <button className="hs-brief-button" disabled={contactSending}>
            {contactSending ? "Sending…" : <>Send enquiry <ArrowRight size={16} /></>}
          </button>
        </form>
      </section>

      <HomeSeekersFooter />
      {valuationOpen && (
        <HomeSeekersValuationModal onClose={() => setValuationOpen(false)} />
      )}
    </main>
  );
}
