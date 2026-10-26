import PublicEstateFeatures from "../components/developments/PublicEstateFeatures.jsx";
import PublicEstateHero, { PublicEstateLocation } from "../components/developments/PublicEstateHero.jsx";
import { ArrowRight, Menu, X } from "lucide-react";
import { useState } from "react";
import PublicDevelopmentVisualExplorer from "../components/developments/PublicDevelopmentVisualExplorer.jsx";
import PublicDevelopmentGallery from "../components/developments/PublicDevelopmentGallery.jsx";
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
  estatePresentation = false,
  onSimulateReservation,
}) {
  const [menu, setMenu] = useState(false);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [reservationUnit, setReservationUnit] = useState(null);
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
    setReservationUnit(null);
    setEnquiryOpen(true);
  };
  const reserveUnit = (unit) => { setReservationUnit(unit); setEnquiryOpen(true); };
  return (
    <main className="min-h-screen bg-[#f5f2eb] pb-20 text-[#14352c]">
      {estatePresentation ? (
        <PublicEstateHero name={data.name} logo={developmentLogoLight} hero={hero} location={location} fromPrice={fromPrice} inventory={inventory} available={available} onEnquire={scrollToEnquiry} />
      ) : <section
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
      </section>}
      {!estatePresentation && menu ? (
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
                try { window.sessionStorage.setItem("arch9:development-enquiry-interest", "Reserve a unit"); } catch { /* Continue when storage is unavailable. */ }
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
        initialResidentialFocus={estatePresentation}
        estatePresentation={estatePresentation}
        onReserveUnit={reserveUnit}
        inventory={inventory}
        media={media}
        enquiry={enquiry}
        freshness={freshness}
        visualMapOverride={renderVisualMap}
        mobile
      />
      <PublicDevelopmentGallery showLabel={!estatePresentation} name={data.name} images={images} />
      {estatePresentation ? <PublicEstateFeatures /> : null}
      {estatePresentation ? <PublicEstateLocation location={location} onEnquire={scrollToEnquiry} /> : null}
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
      <PublicDevelopmentEnquiryDrawer
        estatePresentation={estatePresentation}
        reservationUnit={reservationUnit ? inventory.find((unit) => String(unit.id) === String(reservationUnit.id)) || reservationUnit : null}
        onSimulateReservation={onSimulateReservation}
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
