import { createElement } from "react";
import { Bike, Flag, Flame, Footprints, Smile, Target, Trees } from "lucide-react";

const features = [
  { label: "Chipping green", icon: Flag },
  { label: "Driving range area", icon: Target },
  { label: "Braai area", icon: Flame },
  { label: "Jogging trail", icon: Footprints },
  { label: "Cycling trail", icon: Bike },
  { label: "Children’s play areas", icon: Smile },
];

export default function PublicEstateFeatures() {
  return (
    <section id="features" className="estate-features" aria-labelledby="estate-features-title">
      <div className="estate-features__intro">
        <div>
          <h2 id="estate-features-title">Life beyond<br /><em>your front door.</em></h2>
          <p>Space to play. Room to unwind.<br />A little more freedom, every day.</p>
        </div>
        <div className="estate-features__parks">
          <div className="estate-features__parks-title"><Trees size={27} strokeWidth={1.2} /><h3>Two parks. So many possibilities.</h3></div>
          <p className="estate-features__total">25,000<span>m²</span></p>
          <p className="estate-features__total-label">Combined park area</p>
          <dl><div><dt>Park one</dt><dd>17,000<span>m²</span></dd></div><div><dt>Park two</dt><dd>8,000<span>m²</span></dd></div></dl>
        </div>
      </div>
      <ul className="estate-features__grid">
        {features.map(({ label, icon }) => <li key={label}>{createElement(icon, { size: 32, strokeWidth: 1.25, "aria-hidden": true })}<span>{label}</span></li>)}
      </ul>
    </section>
  );
}
