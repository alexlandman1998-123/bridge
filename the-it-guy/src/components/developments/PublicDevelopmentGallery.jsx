import { ArrowLeft, ArrowRight, Grid2X2, Maximize2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "./public-development-gallery.css";

export default function PublicDevelopmentGallery({ name, images = [], showLabel = true }) {
  const photos = [...new Set(images.filter(Boolean))];
  const [selected, setSelected] = useState(0);
  const dialog = useRef(null);
  const touch = useRef(null);
  const index = Math.min(selected, Math.max(0, photos.length - 1));
  const move = (direction) => setSelected((current) => (current + direction + photos.length) % photos.length);
  useEffect(() => {
    const viewer = dialog.current;
    if (!viewer) return;
    const unlock = () => { document.body.style.overflow = previousOverflow; };
    const previousOverflow = document.body.style.overflow;
    viewer.addEventListener("close", unlock);
    return () => { viewer.removeEventListener("close", unlock); unlock(); };
  }, [photos.length]);
  const open = (next = 0) => {
    setSelected(next);
    dialog.current.showModal();
    document.body.style.overflow = "hidden";
  };
  if (!photos.length) return null;
  return (
    <section id="gallery" className="development-gallery" aria-labelledby="development-gallery-title">
      <div className="development-gallery__inner">
        <header className="development-gallery__heading">
          <div>{showLabel ? <p className="development-gallery__eyebrow">Gallery</p> : null}<h2 id="development-gallery-title">A glimpse of life at {name}.</h2></div>
          <button className="development-gallery__all" onClick={() => open()}><Grid2X2 size={16} /> View all {photos.length} {photos.length === 1 ? "image" : "images"}</button>
        </header>
        <div className={`development-gallery__grid development-gallery__grid--${Math.min(photos.length, 3)}`}>
          {photos.slice(0, 3).map((url, photoIndex) => (
            <button key={url} className="development-gallery__tile" onClick={() => open(photoIndex)} aria-label={`Open image ${photoIndex + 1} of ${photos.length}`}>
              <img src={url} alt={`${name}, view ${photoIndex + 1}`} loading="lazy" />
              <span className="development-gallery__expand" aria-hidden="true"><Maximize2 size={18} /></span>
              {photoIndex === 2 && photos.length > 3 ? <span className="development-gallery__more">+{photos.length - 3} more images</span> : null}
            </button>
          ))}
        </div>
        <div className="development-gallery__foot"><span>{String(photos.length).padStart(2, "0")} images · {name}</span><span>Select an image to explore <ArrowRight size={14} /></span></div>
      </div>
      <dialog ref={dialog} className="development-gallery__viewer" aria-label={`${name} image gallery`} onKeyDown={(event) => {
        if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
        if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
      }}>
        <header className="development-gallery__viewer-heading"><div><span>Gallery</span><h3>{name}</h3></div><button autoFocus onClick={() => dialog.current.close()} aria-label="Close gallery"><X size={24} /></button></header>
        <div className="development-gallery__stage" onTouchStart={(event) => { touch.current = event.touches.length === 1 ? event.touches[0].clientX : null; }} onTouchEnd={(event) => {
          if (touch.current !== null && event.changedTouches.length === 1) {
            const distance = event.changedTouches[0].clientX - touch.current;
            if (Math.abs(distance) > 50) move(distance < 0 ? 1 : -1);
          }
          touch.current = null;
        }} onTouchCancel={() => { touch.current = null; }}>
          <img src={photos[index]} alt={`${name}, view ${index + 1}`} />
        </div>
        <footer className="development-gallery__viewer-controls"><button onClick={() => move(-1)} disabled={photos.length < 2} aria-label="Previous image"><ArrowLeft size={20} /></button><p aria-live="polite">{String(index + 1).padStart(2, "0")} <span>/ {String(photos.length).padStart(2, "0")}</span></p><button onClick={() => move(1)} disabled={photos.length < 2} aria-label="Next image"><ArrowRight size={20} /></button></footer>
      </dialog>
    </section>
  );
}
