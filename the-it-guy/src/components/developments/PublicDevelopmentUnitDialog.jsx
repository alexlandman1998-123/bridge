import { ArrowLeft, ArrowRight, BedDouble, Bath, Heart, GitCompareArrows, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { visualUnitStatus } from "../../core/developments/developmentVisualExplorer.js";
import "./public-development-unit-dialog.css";

const list = (value) => Array.isArray(value) ? value : String(value || "").split(/\r?\n|,/).map((url) => url.trim()).filter(Boolean);
const known = (value, suffix = "") => value === null || value === undefined || value === "" ? "To be confirmed" : `${value}${suffix}`;
const price = (value) => Number(value) ? new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(value) : "Price on request";
const labels = { available: "Available", reserved: "Reserved", sold: "Sold", unreleased: "Not released" };

export default function PublicDevelopmentUnitDialog({ unit, media, enquiry, shortlisted, compared, floorPlanFallback, onToggleShortlist, onToggleCompare, onClose, estatePresentation = false, onReserve }) {
  const dialog = useRef(null);
  const [index, setIndex] = useState(0);
  const [view, setView] = useState("gallery");
  const touch = useRef(null);
  const plan = unit.floorplanUrl || unit.floorPlanUrl || unit.floorplanImageUrl || floorPlanFallback?.url;
  const unitPhotos = [unit.imageUrl, unit.heroImageUrl, ...list(unit.galleryImageUrls), ...list(unit.imageUrls)].filter(Boolean);
  const photos = [...new Set(unitPhotos.length ? unitPhotos : [media.coverImageUrl, media.heroImageUrl, ...list(media.galleryImageUrls), ...list(media.imageUrls)].filter(Boolean))];
  const activeIndex = Math.min(index, Math.max(0, photos.length - 1));
  const status = visualUnitStatus(unit.status);
  const changeImage = (direction) => setIndex((current) => (current + direction + photos.length) % photos.length);
  useEffect(() => {
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    const opener = document.activeElement;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (opener?.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
    };
  }, []);
  const enquire = () => {
    try { window.sessionStorage.setItem("arch9:development-enquiry-unit", JSON.stringify({ id: unit.id, unitNumber: unit.unitNumber, price: unit.price })); } catch { /* Enquiry remains available when browser storage is blocked. */ }
    onClose();
  };
  const facts = [
    ["Residence size", known(unit.sizeSqm, " m²")],
    ["Garden size", known(unit.gardenSizeSqm ?? unit.gardenSqm, " m²")],
    ["Parking bays", known(unit.parkingCount)],
    ["Visitor parking", typeof unit.visitorParking === "boolean" ? unit.visitorParking ? "Available" : "Not available" : known(unit.visitorParkingCount ?? unit.visitorParking)],
    ...(unit.block ? [["Block", unit.block]] : []),
    ...(unit.floor ? [["Floor", unit.floor]] : []),
    ...(unit.phase ? [["Phase", unit.phase]] : []),
  ];
  return createPortal(
    <dialog ref={dialog} className={`residence-dialog${estatePresentation ? " residence-dialog--estate" : ""}`} aria-labelledby="residence-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={(event) => {
      if (view !== "gallery" || photos.length < 2 || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) return;
      event.preventDefault(); changeImage(event.key === "ArrowRight" ? 1 : -1);
    }}>
      <div className="residence-dialog__layout">
        <button className="residence-dialog__close" aria-label="Close residence details" onClick={onClose}><X size={21} /></button>
        <div className="residence-dialog__gallery">
          <div className="residence-dialog__tabs" role="group" aria-label="Residence media">
            <button aria-pressed={view === "gallery"} onClick={() => setView("gallery")}>Gallery{photos.length ? ` · ${photos.length}` : ""}</button>
            {plan ? <button aria-pressed={view === "plan"} onClick={() => setView("plan")}>Floor plan</button> : null}
          </div>
          <div className="residence-dialog__image" tabIndex={0} aria-label="Residence image viewer" onTouchStart={(event) => { touch.current = event.touches.length === 1 ? event.touches[0].clientX : null; }} onTouchEnd={(event) => {
            if (view === "gallery" && photos.length > 1 && touch.current !== null) {
              const distance = event.changedTouches[0].clientX - touch.current;
              if (Math.abs(distance) > 50) changeImage(distance < 0 ? 1 : -1);
            }
            touch.current = null;
          }} onTouchCancel={() => { touch.current = null; }}>
            {view === "plan" ? <img src={plan} alt={`Residence ${unit.unitNumber} floor plan`} /> : photos.length ? <img src={photos[activeIndex]} alt={`Residence ${unit.unitNumber}, gallery image ${activeIndex + 1}`} /> : <p>Images coming soon</p>}
          </div>
          <div className="residence-dialog__gallery-footer">
            <p>{view === "plan" ? floorPlanFallback?.source === "unit_type" ? "Representative residence-type floor plan" : "Residence floor plan" : unitPhotos.length ? "Residence gallery" : "Development gallery · representative images"}</p>
            {view === "gallery" && photos.length > 1 ? <div className="residence-dialog__arrows"><button aria-label="Previous residence image" onClick={() => changeImage(-1)}><ArrowLeft size={18} /></button><span aria-live="polite">{activeIndex + 1} / {photos.length}</span><button aria-label="Next residence image" onClick={() => changeImage(1)}><ArrowRight size={18} /></button></div> : null}
          </div>
          {view === "gallery" && photos.length > 1 ? <div className="residence-dialog__thumbnails" aria-label="Residence gallery thumbnails">{photos.map((url, photoIndex) => <button key={url} aria-label={`Show residence image ${photoIndex + 1}`} aria-pressed={activeIndex === photoIndex} onClick={() => setIndex(photoIndex)}><img src={url} alt="" loading="lazy" /></button>)}</div> : null}
        </div>
        <div className="residence-dialog__details">
          {!estatePresentation ? <><span className={`residence-dialog__status residence-dialog__status--${status}`}>{labels[status]}</span><p className="residence-dialog__eyebrow">Your next address</p></> : null}
          <h2 id="residence-dialog-title">Residence {unit.unitNumber}</h2>
          {!estatePresentation ? <p className="residence-dialog__type">{unit.unitType || "Residence"}</p> : null}
          <strong className="residence-dialog__price">{price(unit.price)}</strong>
          <div className="residence-dialog__rooms"><span><BedDouble size={19} />{known(unit.bedrooms)} bedrooms</span><span><Bath size={19} />{known(unit.bathrooms)} bathrooms</span></div>
          <h3>At a glance</h3>
          <dl className="residence-dialog__facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          {unit.description ? <p className="residence-dialog__description">{unit.description}</p> : null}
          {!estatePresentation ? <div className="residence-dialog__actions"><button onClick={onToggleShortlist} aria-pressed={shortlisted}><Heart size={17} fill={shortlisted ? "currentColor" : "none"} />{shortlisted ? "Shortlisted" : "Shortlist"}</button><button onClick={onToggleCompare} aria-pressed={compared}><GitCompareArrows size={17} />{compared ? "Comparing" : "Compare"}</button></div> : null}
          {estatePresentation ? <button type="button" className="residence-dialog__enquire residence-dialog__reserve" disabled={status !== "available" || !onReserve} onClick={() => { enquire(); onReserve(unit); }}>{status === "available" ? `Reserve unit ${unit.unitNumber}` : `Unit ${unit.unitNumber} · ${labels[status]}`}<ArrowRight size={18} /></button> : <a className="residence-dialog__enquire" href={enquiry} onClick={enquire}>Enquire about residence {unit.unitNumber}<ArrowRight size={18} /></a>}
        </div>
      </div>
    </dialog>, document.body,
  );
}
