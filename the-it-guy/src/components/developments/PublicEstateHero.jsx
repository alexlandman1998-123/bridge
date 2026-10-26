import { ArrowDown, ArrowUpRight, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "./public-estate-hero.css";

const navigation = [
  ["Residences", "#availability"],
  ["Gallery", "#gallery"],
  ["Location", "#location"],
];
function requestViewing(event, onEnquire) {
  try { window.sessionStorage.setItem("arch9:development-enquiry-interest", "Viewing options"); } catch { /* The enquiry still opens when storage is unavailable. */ }
  window.dispatchEvent(new CustomEvent("arch9:development-enquiry-interest", { detail: "Viewing options" }));
  onEnquire(event);
}

export default function PublicEstateHero({ name, logo, hero, location, inventory, onEnquire }) {
  const dialogRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const bedrooms = [...new Set(inventory.map((unit) => String(unit.unitType || "").match(/(\d+)\s*bed/i)?.[1]).filter(Boolean))];
  const bedroomLabel = bedrooms.length ? bedrooms.join(" / ") : "—";
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [menuOpen]);
  const closeMenu = () => {
    dialogRef.current?.close();
    setMenuOpen(false);
  };
  const enquire = (event) => { closeMenu(); onEnquire(event); };
  return (
    <>
      <section id="overview" className="estate-hero" aria-labelledby="estate-title">
        <img className="estate-hero__image" src={hero} alt="" fetchPriority="high" />
        <div className="estate-hero__shade" />
        <header className="estate-header">
          <a className="estate-brand" href="#overview" aria-label={`${name} home`}>
            {logo ? <img src={logo} alt={`${name} logo`} /> : <span>{name}</span>}
          </a>
          <nav className="estate-nav" aria-label="Development navigation">
            {navigation.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
            <a className="estate-nav__enquire" href="#enquire" onClick={onEnquire}>Enquire <ArrowUpRight size={15} /></a>
          </nav>
          <button className="estate-menu-toggle" aria-label="Open navigation" aria-controls="estate-navigation" aria-expanded={menuOpen} onClick={() => { dialogRef.current?.showModal(); setMenuOpen(true); }}>Menu <Menu size={23} strokeWidth={1.25} /></button>
        </header>
        <div className="estate-hero__content">
          <p className="estate-eyebrow">{location}</p>
          <h1 id="estate-title">{name}</h1>
          <p className="estate-hero__description">A considered collection of contemporary homes.</p>
          <div className="estate-hero__actions">
            <a className="estate-button" href="#availability">Explore residences <ArrowUpRight size={18} strokeWidth={1.5} /></a>
            <a className="estate-text-link" href="#enquire" onClick={(event) => requestViewing(event, onEnquire)}>Arrange a viewing <ArrowUpRight size={16} strokeWidth={1.5} /></a>
          </div>
        </div>
        <a className="estate-hero__scroll" href="#availability" aria-label="Discover the residences"><ArrowDown size={17} strokeWidth={1.25} /></a>
      </section>
      <section className="estate-facts" aria-label="Residence overview">
        <div className="estate-facts__inner">
        <p className="estate-facts__intro">Your next chapter<br /><em>starts here.</em></p>
        <dl>
          <div><dt>Bedrooms</dt><dd>{bedroomLabel}</dd></div>
          <div><dt>Bathrooms</dt><dd>2</dd></div>
          <div><dt>Garage</dt><dd className="estate-facts__word">Double</dd></div>
          <div><dt>Homes</dt><dd>{inventory.length}</dd></div>
        </dl>
        </div>
      </section>
      <dialog ref={dialogRef} id="estate-navigation" className="estate-menu" aria-label="Development navigation" onClose={() => setMenuOpen(false)}>
        <div className="estate-menu__top"><span>{name}</span><button onClick={closeMenu} aria-label="Close navigation"><X size={24} strokeWidth={1.25} /></button></div>
        <nav aria-label="Mobile development navigation">
          {navigation.map(([label, href]) => <a key={href} href={href} onClick={closeMenu}>{label}<ArrowUpRight size={23} /></a>)}
          <a href="#enquire" onClick={enquire}>Enquire<ArrowUpRight size={23} /></a>
        </nav>
        <p>{location}</p>
      </dialog>
    </>
  );
}

export function PublicEstateLocation({ location, onEnquire }) {
  return (
    <section id="location" className="estate-location" aria-labelledby="estate-location-title">
      <div><p className="estate-eyebrow">The neighbourhood</p><h2 id="estate-location-title">A place to<br /><em>call home.</em></h2></div>
      <div className="estate-location__copy"><p className="estate-location__address">{location}</p><p>Discover Madison Place in Bardene, Boksburg.<br />Arrange a viewing and experience it for yourself.</p><div><a className="estate-text-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`} target="_blank" rel="noopener noreferrer">Explore the area <ArrowUpRight size={17} /></a><a className="estate-text-link" href="#enquire" onClick={(event) => requestViewing(event, onEnquire)}>Arrange a viewing <ArrowUpRight size={17} /></a></div></div>
    </section>
  );
}
