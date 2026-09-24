import { ArrowRight, Menu, X } from "lucide-react";
import { useRef, useState } from "react";
import PublicDevelopmentVisualExplorer from "../components/developments/PublicDevelopmentVisualExplorer.jsx";
import PublicDevelopmentEnquiryDrawer from "../components/developments/PublicDevelopmentEnquiryDrawer.jsx";
const money = (value) =>
  Number(value)
    ? `R${(Number(value) / 1000000).toFixed(Number(value) % 1000000 ? 2 : 0)}m`
    : "Price on request";
const menuForeground = (colour) => {
  const value = String(colour || "").trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return "#ffffff";
  const channels = [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
  const luminance = (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) / 255;
  return luminance > 0.58 ? "#101010" : "#ffffff";
};
const gestureDistance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

export default function MobilePublicDevelopmentExperience({
  data,
  marketing,
  media,
  inventory,
  available,
  fromPrice,
  agency,
  hero,
  images,
  enquiry,
  freshness,
  renderVisualMap,
}) {
  const [menu, setMenu] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const galleryTrack = useRef(null);
  const lightboxGesture = useRef(null);
  const developmentLogoLight = String(
    media.developmentLogoLightUrl || media.developmentLogoUrl || '',
  ).trim();
  const location =
    data.location ||
    marketing.listingOverview?.locationLabel ||
    [data.suburb, data.city].filter(Boolean).join(', ');
  const description =
    String(marketing.listingOverview?.shortDescription || '').trim() ||
    `Discover ${String(data.name || 'this development').trim()}, a considered collection of new homes.`;
  const primaryColour = String(media.primaryColour || "#073e32").trim();
  const menuTextColour = menuForeground(primaryColour);
  const menuActionColour = menuTextColour === "#ffffff" ? "#ffffff" : "#101010";
  const menuActionTextColour = menuTextColour === "#ffffff" ? primaryColour : "#ffffff";
  const scrollToEnquiry = (event) => {
    event?.preventDefault();
    setEnquiryOpen(true);
  };
  const updateGalleryIndex = () => {
    const track = galleryTrack.current;
    if (!track) return;
    const card = track.querySelector("[data-gallery-card]");
    if (!card) return;
    setGalleryIndex(Math.max(0, Math.min(images.length - 1, Math.round(track.scrollLeft / (card.offsetWidth + 16)))));
  };
  const openLightbox = (index) => {
    setLightbox(index);
    setLightboxZoom(1);
  };
  const moveLightbox = (direction) => {
    setLightbox((current) => (current === null ? current : (current + direction + images.length) % images.length));
    setLightboxZoom(1);
  };
  return (
    <main className="min-h-screen bg-[#f5f2eb] pb-20 text-[#14352c]">
      <section
        id="overview"
        className="relative min-h-[100svh] overflow-hidden bg-[#063a31] text-white"
      >
        <img
          src={hero}
          alt=""
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/10 to-[#061d18]/90" />
        <header className="absolute inset-x-0 top-0 z-10 flex h-24 items-center justify-between px-6">
          {developmentLogoLight ? (
            <img
              src={developmentLogoLight}
              alt={`${data.name} logo`}
              className="h-16 max-w-[235px] object-contain object-left"
            />
          ) : (
            <span className="text-[11px] font-semibold tracking-[.15em]">
              <i className="mr-1 font-serif text-2xl text-[#d0ab55]">R</i>
              {agency.toUpperCase()}
            </span>
          )}
          <button
            onClick={() => setMenu(true)}
            aria-label="Open navigation"
            className="grid h-14 w-14 place-items-center rounded-full border border-white/60 bg-white/10 backdrop-blur-sm"
          >
            <Menu size={29} strokeWidth={1.75} />
          </button>
        </header>
        <div className="relative flex min-h-[100svh] items-end px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-32">
          <div
            className="w-full max-w-[590px]"
            style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}
          >
            <span className="mb-5 block h-[3px] w-12 bg-[#d7b867]" aria-hidden="true" />
            <p className="text-[11px] font-bold uppercase tracking-[.25em] text-white">
              Now selling · {location || "Location to be confirmed"}
            </p>
            <h1 className="mt-5 max-w-[360px] font-medium" style={{ fontSize: "clamp(3.15rem, 13.5vw, 4.6rem)", lineHeight: 0.9, letterSpacing: "-.055em" }}>
              {data.name}
            </h1>
            <p className="mt-6 max-w-[355px] text-[1.25rem] leading-[1.3] text-white/95">
              {description}
            </p>
            <div className="mt-6 grid max-w-[390px] grid-cols-[1.1fr_.9fr] rounded-2xl border border-white/45 bg-black/20 px-4 py-3.5 text-white backdrop-blur-sm">
              <span className="text-sm text-white/75">
                From<b className="mt-1 block text-[1.85rem] font-medium leading-none text-white">{money(fromPrice)}</b>
              </span>
              <span className="border-l border-white/35 pl-4 text-sm text-white/75">
                <b className="block text-[1.85rem] font-medium leading-none text-white">{available.length}</b>Available
              </span>
            </div>
            <a
              href="#availability"
              className="mt-5 flex h-16 w-full max-w-[550px] items-center justify-center gap-3 rounded-xl bg-[#d0ab55] px-6 text-xl font-semibold text-[#123b31] shadow-[0_10px_26px_rgba(0,0,0,.18)]"
            >
              View residences <ArrowRight size={25} />
            </a>
          </div>
        </div>
      </section>
      {menu ? (
        <div
          className="fixed inset-0 z-[70] px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(28px,env(safe-area-inset-top))]"
          style={{ backgroundColor: primaryColour, color: menuTextColour }}
        >
          <button
            onClick={() => setMenu(false)}
            aria-label="Close navigation"
            className="absolute right-5 top-5 grid h-12 w-12 place-items-center rounded-full border"
            style={{ borderColor: `${menuTextColour}80`, color: menuTextColour }}
          >
            <X />
          </button>
          <nav className="mt-20 grid gap-5 font-sans text-4xl font-medium tracking-[-.045em]">
            {[
              ["Overview", "#overview"],
              ["Availability", "#availability"],
              ["Gallery", "#gallery"],
              ["Enquire", "#enquire"],
            ].map(([label, href]) => (
              <a key={label} href={href} onClick={(event) => { if (label === "Enquire") { event.preventDefault(); setEnquiryOpen(true); } setMenu(false); }} style={{ color: menuTextColour }}>
                {label}
              </a>
            ))}
          </nav>
          <div className="absolute inset-x-6 bottom-[max(2rem,env(safe-area-inset-bottom))] grid gap-3">
            <a
              href="#enquire"
              onClick={(event) => {
                event.preventDefault();
                try { window.sessionStorage.setItem("arch9:development-enquiry-interest", "Reserve a unit"); } catch {}
                window.dispatchEvent(new CustomEvent("arch9:development-enquiry-interest", { detail: "Reserve a unit" }));
                setMenu(false);
                setEnquiryOpen(true);
              }}
              className="flex h-14 items-center justify-center rounded-xl text-base font-semibold"
              style={{ backgroundColor: menuActionColour, color: menuActionTextColour }}
            >
              Reserve your unit <ArrowRight className="ml-2" size={19} />
            </a>
            <a
              href="#enquire"
              onClick={(event) => { event.preventDefault(); setMenu(false); setEnquiryOpen(true); }}
              className="flex h-14 items-center justify-center rounded-xl border text-base font-semibold"
              style={{ borderColor: `${menuTextColour}80`, color: menuTextColour }}
            >
              Enquire <ArrowRight className="ml-2" size={19} />
            </a>
          </div>
        </div>
      ) : null}
      <PublicDevelopmentVisualExplorer
        inventory={inventory}
        media={media}
        enquiry={enquiry}
        freshness={freshness}
        visualMapOverride={renderVisualMap}
        mobile
      />
      <section id="gallery" className="pb-12 pt-10">
        <div className="px-5">
          <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#a98034]">
            Gallery
          </p>
          <h2 className="mt-3 font-serif text-[2.35rem] leading-[.94]">
            A glimpse of life here.
          </h2>
        </div>
        <div
          ref={galleryTrack}
          onScroll={updateGalleryIndex}
          className="mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-1"
          style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
        >
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              data-gallery-card
              onClick={() => openLightbox(index)}
              className="relative shrink-0 snap-center overflow-hidden rounded-2xl text-left"
              style={{ width: "calc(100vw - 56px)" }}
            >
              <img
                src={image}
                alt={`Development gallery ${index + 1}`}
                loading="lazy"
                className="w-full object-cover"
                style={{ height: "min(68vw, 390px)" }}
              />
              <small className="absolute bottom-3 left-3 rounded-full bg-black/45 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                {String(index + 1).padStart(2, "0")} /{" "}
                {String(images.length).padStart(2, "0")}
              </small>
            </button>
          ))}
        </div>
        {images.length > 1 ? (
          <div className="mt-5 flex items-center justify-center gap-2" aria-label={`Gallery image ${galleryIndex + 1} of ${images.length}`}>
            {images.map((_, index) => (
              <button
                key={index}
                aria-label={`Show gallery image ${index + 1}`}
                onClick={() => {
                  const card = galleryTrack.current?.querySelectorAll("[data-gallery-card]")[index];
                  card?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
                }}
                className={`h-2 rounded-full transition-all ${index === galleryIndex ? "w-5 bg-[#b3822b]" : "w-2 bg-[#d8d1c5]"}`}
              />
            ))}
          </div>
        ) : null}
        <p className="mt-5 flex items-center justify-center gap-3 font-serif text-lg italic text-[#718077] before:h-px before:w-10 before:bg-[#b7b3aa] after:h-px after:w-10 after:bg-[#b7b3aa]">Swipe to explore</p>
      </section>
      <footer id="enquire" className="bg-[#073e32] px-5 py-12 text-[#f7f0e3]">
        {developmentLogoLight ? (
          <img
            src={developmentLogoLight}
            alt={`${data.name} logo`}
            className="h-12 max-w-[220px] object-contain object-left"
          />
        ) : (
          <p className="font-serif text-xl">{data.name}</p>
        )}
        <p className="mt-5 text-sm leading-6 text-[#d2ded6]">
          {data.name} is proudly presented by {agency}.
        </p>
        {location ? <p className="mt-2 text-sm text-[#d2ded6]">{location}</p> : null}
        <p className="mt-7 border-t border-white/15 pt-5 text-xs text-white/60">
          Privacy · Terms · Powered by Arch9
        </p>
      </footer>
      {lightbox !== null ? (
        <div
          className="fixed inset-0 z-[80] grid place-items-center overflow-hidden bg-black/95 p-5"
          style={{ touchAction: "none" }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            const current = lightboxGesture.current?.points || new Map();
            current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            const [first, second] = [...current.values()];
            lightboxGesture.current = {
              points: current,
              startX: event.clientX,
              startY: event.clientY,
              startZoom: lightboxZoom,
              distance: current.size === 2 ? gestureDistance(first, second) : 0,
            };
          }}
          onPointerMove={(event) => {
            const gesture = lightboxGesture.current;
            if (!gesture?.points.has(event.pointerId)) return;
            gesture.points.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (gesture.points.size === 2) {
              const [first, second] = [...gesture.points.values()];
              const distance = gestureDistance(first, second);
              if (gesture.distance) setLightboxZoom(Math.min(3, Math.max(1, gesture.startZoom * (distance / gesture.distance))));
            }
          }}
          onPointerUp={(event) => {
            const gesture = lightboxGesture.current;
            if (gesture?.points.size === 1 && lightboxZoom === 1) {
              const movement = event.clientX - gesture.startX;
              if (Math.abs(movement) > 48) moveLightbox(movement < 0 ? 1 : -1);
            }
            gesture?.points.delete(event.pointerId);
            if (!gesture?.points.size) lightboxGesture.current = null;
          }}
          onPointerCancel={() => { lightboxGesture.current = null; }}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-full border border-white/30 text-white"
          >
            <X />
          </button>
          <img
            src={images[lightbox]}
            alt="Development gallery"
            className="max-h-[82svh] w-full select-none object-contain transition-transform duration-150"
            draggable="false"
            style={{ transform: `scale(${lightboxZoom})` }}
          />
          <span className="absolute bottom-[max(2rem,env(safe-area-inset-bottom))] rounded-full bg-white/15 px-3 py-1.5 text-xs text-white backdrop-blur-sm">{String(lightbox + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}</span>
        </div>
      ) : null}
      <PublicDevelopmentEnquiryDrawer
        open={enquiryOpen}
        onClose={() => setEnquiryOpen(false)}
        developmentName={data.name}
        agency={agency}
        enquiry={enquiry}
      />
      <a
        href="#enquire"
        onClick={scrollToEnquiry}
        className="fixed inset-x-0 bottom-0 z-30 grid min-h-20 grid-cols-[1fr_1fr_auto] items-center gap-3 bg-white/95 px-5 pt-2 shadow-[0_-5px_20px_rgba(9,38,30,.13)] backdrop-blur-md"
        style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
      >
        <span className="text-sm leading-tight text-[#64766d]">
          From <b className="block font-sans text-xl font-semibold text-[#123b31]">{money(fromPrice)}</b>
        </span>
        <span className="border-l border-[#d5d8d4] pl-3 text-sm leading-tight text-[#64766d]">
          <b className="block font-sans text-xl font-semibold text-[#123b31]">{available.length}</b>Available
        </span>
        <span className="rounded-xl border border-[#d7dfda] bg-white px-5 py-4 text-base font-semibold text-[#14352c] shadow-sm">
          Enquire <ArrowRight className="ml-2 inline" size={18} />
        </span>
      </a>
    </main>
  );
}
