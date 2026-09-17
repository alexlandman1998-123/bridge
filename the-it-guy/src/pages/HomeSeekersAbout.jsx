import { ArrowRight, ArrowUpRight, Compass, MapPin } from "lucide-react";
import { useState } from "react";
import HomeSeekersMobileNav from "./HomeSeekersMobileNav";
import HomeSeekersValuationModal from "./HomeSeekersValuationModal";
import HomeSeekersFooter from "./HomeSeekersFooter";
import "./HomeSeekersAboutNext.css";
import "./HomeSeekersBrand.css";

const nav = [
  ["Selling", "selling"],
  ["Buying", "buying"],
  ["Renting", "renting"],
  ["Areas", "areas"],
  ["About", "about"],
  ["Join us", "join"],
];
const standards = [
  [
    "01",
    "People before process",
    "A move is rarely just a transaction. We make room for the real context before we prescribe the next step.",
  ],
  [
    "02",
    "Local, properly",
    "The useful detail lives beyond a suburb name: the street, the timing, the buyer and the lived-in view.",
  ],
  [
    "03",
    "Momentum matters",
    "Clear advice only counts when it leads somewhere. We keep the work moving and the communication close.",
  ],
];

export default function HomeSeekersAbout() {
  const [valuationOpen, setValuationOpen] = useState(false);

  return (
    <main className="hs-about-next">
      <header className="hs-about-next__header">
        <a href="/demo/homeseekers" aria-label="Home Seekers home">
          <img
            src="/brand/homeseekers/home-seekers-horizontal-black.svg"
            alt="Home Seekers"
          />
        </a>
        <nav aria-label="Main navigation">
          {nav.map(([label, slug]) => (
            <a
              className={slug === "about" ? "is-active" : ""}
              href={`/demo/homeseekers/${slug}`}
              key={slug}
            >
              {label}
            </a>
          ))}
        </nav>
        <button type="button" onClick={() => setValuationOpen(true)}>
          Book a free valuation
        </button>
        <HomeSeekersMobileNav
          links={nav.map(([label, slug]) => [
            label,
            `/demo/homeseekers/${slug}`,
          ])}
          active="about"
          onValuation={() => setValuationOpen(true)}
        />
      </header>

      <section className="hs-about-next__hero">
        <div className="hs-about-next__hero-copy">
          <p>
            ❯ ABOUT <strong>HOME SEEKERS</strong>
          </p>
          <h1>
            Property is
            <br />
            personal.
            <br />
            <em>So are we.</em>
          </h1>
          <p>
            A Pretoria East property team built around care, clarity and the
            momentum to get a move done properly.
          </p>
          <a href="#standard">
            See the standard <ArrowRight size={18} />
          </a>
          <span>
            ESTABLISHED LOCALLY
            <br />
            MADE FOR WHAT’S NEXT
          </span>
        </div>
        <div className="hs-about-next__hero-image">
          <img
            src="https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/pages/2025/12/869_f2db92d285f848d6bef749c6ec27e2cd_t_w_639_h_728.avif"
            alt="Family at home"
          />
          <div>
            <Compass size={21} />
            <span>
              LOCAL
              <br />
              FROM THE START
            </span>
          </div>
          <p>
            <MapPin size={15} /> PRETORIA EAST / SOUTH AFRICA
          </p>
        </div>
      </section>

      <section className="hs-about-next__statement">
        <p>
          ❯ A MODERN AGENCY <strong>WITH A HUMAN CENTRE</strong>
        </p>
        <h2>
          More than a logo,
          <br />a board and
          <br />
          “just checking in.”
        </h2>
        <div>
          <p>
            Home Seekers began with a simple belief: a property decision
            deserves more than a portal listing and a hopeful price.
          </p>
          <p>
            We bring local experience, direct advice and a sharp eye for the
            details that make a move feel clear—not complicated.
          </p>
          <a href="#story">
            The Home Seekers story <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>

      <section className="hs-about-next__story" id="story">
        <div className="hs-about-next__story-image">
          <img
            src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=88"
            alt="Contemporary house in a leafy setting"
          />
          <span>HOME SEEKERS / 01</span>
        </div>
        <div className="hs-about-next__story-copy">
          <p>
            ❯ THE WAY WE <strong>WORK</strong>
          </p>
          <h2>
            Close to the work.
            <br />
            <em>Closer to people.</em>
          </h2>
          <p>
            We are a people-first real estate business, built on family values,
            innovation and performance. The aim is never to make property feel
            complicated; it is to make the right next move easier to see.
          </p>
          <dl>
            <div>
              <dt>01</dt>
              <dd>
                Listen before
                <br />
                we list.
              </dd>
            </div>
            <div>
              <dt>02</dt>
              <dd>
                Make the
                <br />
                decision clearer.
              </dd>
            </div>
            <div>
              <dt>03</dt>
              <dd>
                Keep the
                <br />
                momentum real.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="hs-about-next__standard" id="standard">
        <div className="hs-about-next__standard-intro">
          <p>
            ❯ THE HOME SEEKERS <strong>STANDARD</strong>
          </p>
          <h2>
            Care, with a<br />
            point of view.
          </h2>
          <p>
            We have a clear way of working. It keeps our advice grounded, our
            relationships personal and the outcome in focus.
          </p>
        </div>
        <div className="hs-about-next__standard-cards">
          {standards.map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
              <i>↗</i>
            </article>
          ))}
        </div>
      </section>

      <section className="hs-about-next__local">
        <div>
          <p>
            ❯ FOR THE PEOPLE <strong>WHO LIVE HERE</strong>
          </p>
          <h2>
            Local knowledge
            <br />
            gets personal.
          </h2>
          <p>
            Each neighbourhood has its own rhythm. We pair the practical detail
            with a genuine understanding of what makes an address feel like
            home.
          </p>
          <a href="/demo/homeseekers/areas">
            Explore our local atlas <ArrowRight size={18} />
          </a>
        </div>
        <aside>
          <span>
            YOUR
            <br />
            NEXT
            <br />
            MOVE
          </span>
          <p>
            FROM THE FIRST
            <br />
            CONVERSATION TO
            <br />
            THE FINAL SIGNATURE.
          </p>
        </aside>
      </section>

      <section className="hs-about-next__cta">
        <div>
          <p>
            ❯ START WITH <strong>A CONVERSATION</strong>
          </p>
          <h2>
            Let’s make
            <br />
            what’s next
            <br />
            <em>clearer.</em>
          </h2>
        </div>
        <div>
          <p>
            Whether you are selling, buying, renting or simply weighing up the
            options, our first job is to understand the move in front of you.
          </p>
          <button type="button" onClick={() => setValuationOpen(true)}>
            Book a free valuation <ArrowUpRight size={18} />
          </button>
        </div>
      </section>

      <HomeSeekersFooter />
      {valuationOpen && (
        <HomeSeekersValuationModal onClose={() => setValuationOpen(false)} />
      )}
    </main>
  );
}
