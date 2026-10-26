import PublicEstateFeatures from "../components/developments/PublicEstateFeatures.jsx";
import PublicEstateHero, { PublicEstateLocation } from "../components/developments/PublicEstateHero.jsx";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import PublicDevelopmentVisualExplorer from "../components/developments/PublicDevelopmentVisualExplorer.jsx";
import PublicDevelopmentGallery from "../components/developments/PublicDevelopmentGallery.jsx";
import PublicDevelopmentEnquiryDrawer from "../components/developments/PublicDevelopmentEnquiryDrawer.jsx";

const text = (value) => String(value || "").trim();
const money = (value, compact = false) => {
  const amount = Number(value);
  if (!amount) return "Price on request";
  return compact
    ? `R${(amount / 1000000).toFixed(amount % 1000000 ? 2 : 0)}m`
    : new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
        maximumFractionDigits: 0,
      }).format(amount);
};
const beds = (type) => {
  const value = text(type);
  const match = value.match(/(\d+)/);
  return match
    ? `${match[1]} Bedroom${match[1] === "1" ? "" : "s"}`
    : value || "Residence";
};
const Eyebrow = ({ children, className = "" }) => (
  <p
    className={`text-[.65rem] font-bold uppercase tracking-[.18em] text-[#a58037] ${className}`}
  >
    {children}
  </p>
);
function AgencyMark({ name, logo }) {
  return logo ? <img src={logo} alt={`${name} logo`} className="h-8 max-w-[145px] object-contain object-left" /> : <span className="font-semibold tracking-[.15em] text-white">{text(name).toUpperCase()}</span>;
}
function DevelopmentMark({ name, logo, className = "h-10 max-w-[180px]" }) {
  if (logo) return <img src={logo} alt={`${name} logo`} className={`${className} object-contain object-left`} />;
  return (
    <span className="inline-flex items-center gap-2 text-white">
      <i className="grid h-8 w-6 place-items-center border border-white/70 text-[.63rem] font-medium tracking-[-.13em]">
        {text(name).slice(0, 2).toUpperCase() || "DP"}
      </i>
      <span className="font-serif text-[.65rem] leading-[1.05] tracking-[.16em]">
        {text(name).toUpperCase() || "DEVELOPMENT"}
      </span>
    </span>
  );
}

export default function PublicDevelopmentLandingPage({
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
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [reservationUnit, setReservationUnit] = useState(null);

  const overview = marketing.listingOverview || {};
  const developmentLogoLight = text(media.developmentLogoLightUrl || media.developmentLogoUrl);
  const developmentLogoDark = text(media.developmentLogoDarkUrl || developmentLogoLight);
  const isDevelopmentLogo = (url) => text(url) && [developmentLogoLight, developmentLogoDark].includes(text(url));
  const galleryImages = images.filter((url) => !isDevelopmentLogo(url));
  const agencyLogo = media.agencyLogoUrl || media.logoLightUrl || media.logoUrl || "";
  const groups = Object.values(
    inventory.reduce((result, unit) => {
      const key = unit.unitType || "Residence";
      (result[key] ||= []).push(unit);
      return result;
    }, {}),
  );
  const types = groups.map((items) => items[0].unitType || "Residence");
  const bedroomLabels = types.map(beds).filter(Boolean);
  const bedroomSummary = bedroomLabels.length === 1 ? bedroomLabels[0].replace(/ Bedroom(s)?$/i, "") : bedroomLabels.length ? bedroomLabels.join(" · ").replaceAll(" Bedroom", "") : "—";
  const location =
    data.location ||
    overview.locationLabel ||
    [data.suburb, data.city].filter(Boolean).join(", ");
  const scrollToEnquiry = (event) => {
    event?.preventDefault();
    setReservationUnit(null);
    setEnquiryOpen(true);
  };
  const reserveUnit = (unit) => { setReservationUnit(unit); setEnquiryOpen(true); };
  return (
    <main className="min-h-screen bg-[#f5f2eb] text-[#153d33]">
      {estatePresentation ? (
        <PublicEstateHero name={data.name} logo={developmentLogoLight} hero={hero} location={location} fromPrice={fromPrice} inventory={inventory} available={available} onEnquire={scrollToEnquiry} />
      ) : <section
        id="overview"
        className="relative min-h-[86vh] overflow-hidden bg-[#14352c] text-white"
      >
        <img
          src={hero}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#061c18]/82 via-[#0c2821]/34 to-transparent" />
        <header className="absolute inset-x-0 top-0 z-10 mx-auto flex max-w-[1420px] items-center px-6 py-6 md:px-10">
          <DevelopmentMark name={data.name} logo={developmentLogoLight} className="h-16 max-w-[300px]" />
          <nav className="ml-auto flex gap-6 text-xs">
            {[
              ["Overview", "#overview"],
              ["Availability", "#availability"],
              ["Location", "#location"],
              ["Gallery", "#gallery"],
              ["Enquire", "#enquire"],
            ].map(([label, href]) => (
              <a key={label} href={href} onClick={label === "Enquire" ? scrollToEnquiry : undefined} className="hover:text-[#d5b365]">
                {label}
              </a>
            ))}
          </nav>
        </header>
        <div className="relative mx-auto flex min-h-[86vh] max-w-[1420px] items-end px-6 pb-16 pt-32 md:px-10 md:pb-20">
          <div className="max-w-xl">
            <Eyebrow className="text-[#d7b867]">
              Now selling · {location || "Location to be confirmed"}
            </Eyebrow>
            <h1 className="mt-4 font-serif text-5xl leading-[.93] tracking-[-.05em] md:text-7xl">
              {data.name}
            </h1>
            <p className="mt-6 max-w-sm text-base leading-6 text-white/90">
              {String(overview.shortDescription || "").trim() ||
                `Discover ${data.name || "this development"}, a considered collection of new homes.`}
            </p>
            <div className="mt-7 flex gap-6 border-l border-white/35 pl-5 text-xs text-white/85">
              <span>
                From
                <strong className="block text-xl text-white">
                  {money(fromPrice, true)}
                </strong>
              </span>
              <span>
                <strong className="block text-xl text-white">{bedroomSummary}</strong>
                Bedrooms
              </span>
              <span>
                <strong className="block text-xl text-white">
                  {available.length}
                </strong>
                Available
              </span>
            </div>
            <div className="mt-8 flex gap-3">
              <a
                href="#residences"
                className="inline-flex items-center gap-2 bg-[#d0ab55] px-5 py-3 text-sm font-semibold text-[#14352c]"
              >
                View residences <ArrowRight size={15} />
              </a>
              <a
                href="#enquire"
                onClick={scrollToEnquiry}
                className="border border-white/70 px-5 py-3 text-sm font-semibold"
              >
                Enquire now
              </a>
            </div>
          </div>
        </div>
      </section>}
      <PublicDevelopmentVisualExplorer
        initialResidentialFocus={estatePresentation}
        estatePresentation={estatePresentation}
        onReserveUnit={reserveUnit}
        inventory={inventory}
        media={media}
        enquiry={enquiry}
        freshness={freshness}
        visualMapOverride={renderVisualMap}
      />
      {!estatePresentation ? <section className="border-y border-[#e1dacd] bg-[#ece7dc]">
        <div className="mx-auto grid max-w-[1280px] grid-cols-2 divide-x divide-y divide-[#dcd3c3] px-5 md:grid-cols-4 md:divide-y-0 md:px-8">
          {[
            [inventory.length || data.totalUnitsExpected, "Residences"],
            [available.length, "Available"],
            [bedroomSummary, "Bedrooms"],
            [money(fromPrice, true), "From"],
          ].map(([value, label]) => (
            <div key={label} className="px-5 py-7 md:px-8">
              <strong className="font-serif text-3xl">{value}</strong>
              <span className="mt-1 block text-xs uppercase tracking-[.13em] text-[#728178]">
                {label}
              </span>
            </div>
          ))}
        </div>
      </section> : null}
      <PublicDevelopmentGallery showLabel={!estatePresentation} name={data.name} images={galleryImages} />
      {estatePresentation ? <PublicEstateFeatures /> : null}
      {estatePresentation ? <PublicEstateLocation location={location} onEnquire={scrollToEnquiry} /> : null}
      <footer id="enquire" className="bg-[#063a31] text-[#f7f0e3]">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-5 py-12 md:flex-row md:items-end md:justify-between md:px-8 md:py-14">
          <div className="space-y-4">
            <DevelopmentMark name={data.name} logo={developmentLogoLight} className="h-14 max-w-[260px]" />
            <p className="max-w-md text-sm leading-6 text-[#d2ded6]">
              {data.name} is proudly presented by {agency}.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-sm text-[#d2ded6] md:text-right">
            {location ? <span>{location}</span> : null}
            <span>Privacy · Terms · Powered by Arch9</span>
          </div>
        </div>
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
    </main>
  );
}
