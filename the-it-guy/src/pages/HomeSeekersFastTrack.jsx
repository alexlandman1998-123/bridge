import { ArrowRight } from "lucide-react";
import "./HomeSeekersFastTrack.css";

const steps = [
  [
    "01",
    "Price it right.",
    "Comparable sales and local buyer behaviour set a price that can move.",
  ],
  [
    "02",
    "Launch with intent.",
    "The right presentation, exposure and contact plan are mapped before day one.",
  ],
  [
    "03",
    "See the momentum.",
    "Written feedback every week means you always know what is happening.",
  ],
  [
    "04",
    "Hold us to day 45.",
    "If the qualifying guarantee is not met, our commission comes down.",
  ],
];

export default function HomeSeekersFastTrack({ compact = false, onValuation }) {
  const visibleSteps = compact ? steps.slice(0, 3) : steps;
  return (
    <section
      className={`hs-fast-track${compact ? " hs-fast-track--compact" : ""}`}
      aria-labelledby="fast-track-title"
    >
      <header className="hs-fast-track__intro">
        <p>
          ❯ 45-DAY <strong>FAST TRACK</strong>
        </p>
        <h2 id="fast-track-title">
          {compact ? (
            "An honest price. A serious plan. 45-day accountability."
          ) : (
            <>
              Sold faster than your hubby can
              <br />
              <em>fix the porch light.</em>
            </>
          )}
        </h2>
        {!compact && (
          <small>
            Exclusive mandate and recommended-price conditions apply.{" "}
            <a href="#guarantee">Read the guarantee terms.</a>
          </small>
        )}
      </header>
      <div className="hs-fast-track__steps">
        {visibleSteps.map(([number, title, copy], index) => (
          <article key={number}>
            <span>{number}</span>
            <div>
              <h3>{title}</h3>
              <p>{copy}</p>
            </div>
            {index < visibleSteps.length - 1 && (
              <i className="hs-fast-track__chevron" aria-hidden="true" />
            )}
          </article>
        ))}
      </div>
      <footer className="hs-fast-track__footer">
        <div>
          <b>{compact ? "THE 45-DAY GUARANTEE" : "YOUR NEXT MOVE"}</b>
          <span>
            {compact
              ? "See how the guarantee works, step by step."
              : "A clear valuation is where the fast track starts."}
          </span>
        </div>
        {compact ? (
          <a href="/demo/homeseekers/selling">
            See how we sell <ArrowRight size={16} />
          </a>
        ) : (
          <button type="button" onClick={onValuation}>
            Book a free valuation <ArrowRight size={16} />
          </button>
        )}
      </footer>
    </section>
  );
}
