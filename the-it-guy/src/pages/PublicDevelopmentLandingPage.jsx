import { ArrowLeft, ArrowRight, ChevronRight, MapPin } from "lucide-react";
import { useRef, useState } from "react";
import PublicDevelopmentVisualExplorer from "../components/developments/PublicDevelopmentVisualExplorer.jsx";
import PublicDevelopmentEnquiryForm from "../components/developments/PublicDevelopmentEnquiryForm.jsx";

const STATUS = {
  available: ["Available", "bg-[#e7f4eb] text-[#286647]", "bg-[#38a467]"],
  reserved: ["Reserved", "bg-[#faf0df] text-[#99621b]", "bg-[#e5a13d]"],
  sold: ["Sold", "bg-[#edf0f3] text-[#607080]", "bg-[#8391a0]"],
  unreleased: ["Not released", "bg-[#edf0f3] text-[#607080]", "bg-[#8391a0]"],
};
const text = (value) => String(value || "").trim();
const keyFor = (status) => {
  const value = text(status).toLowerCase();
  if (value.includes("reserve") || value.includes("offer")) return "reserved";
  if (value.includes("sold") || value.includes("complete")) return "sold";
  if (value.includes("unreleased") || value.includes("draft"))
    return "unreleased";
  return "available";
};
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
function DevelopmentMark({ name, logo }) {
  if (logo) return <img src={logo} alt={`${name} logo`} className="h-10 max-w-[180px] object-contain object-left" />;
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
}) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [availableOnly, setAvailableOnly] = useState(false);
  const gallery = useRef(null);
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
  const live = inventory.filter(
    (unit) =>
      (typeFilter === "all" || unit.unitType === typeFilter) &&
      (!availableOnly || keyFor(unit.status) === "available"),
  );
  const location =
    overview.locationLabel ||
    data.location ||
    [data.suburb, data.city].filter(Boolean).join(", ");
  const scrollToEnquiry = (event) => {
    event?.preventDefault();
    document.getElementById("enquire")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => document.querySelector("#enquire input[name='name']")?.focus(), 550);
  };
  return (
    <main className="min-h-screen bg-[#f5f2eb] text-[#153d33]">
      <section
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
          <DevelopmentMark name={data.name} logo={developmentLogoLight} />
          <nav className="ml-auto flex gap-6 text-xs">
            {[
              ["Overview", "#overview"],
              ["Residences", "#residences"],
              ["Availability", "#availability"],
              ["Location", "#location"],
              ["Gallery", "#gallery"],
              ["Enquire", "#enquire"],
            ].map(([label, href]) => (
              <a key={label} href={href} className="hover:text-[#d5b365]">
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
              {overview.shortDescription ||
                "Discover a considered collection of new homes at this sought-after address."}
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
      </section>
      <PublicDevelopmentVisualExplorer
        inventory={inventory}
        media={media}
        enquiry={enquiry}
        freshness={freshness}
      />
      <section className="mx-auto grid max-w-[1280px] gap-10 px-5 py-20 md:grid-cols-[.85fr_1.15fr] md:px-8 md:py-28">
        <div>
          <Eyebrow>The development</Eyebrow>
          <h2 className="mt-3 font-serif text-4xl leading-[1.02] md:text-5xl">
            A considered collection of contemporary homes.
          </h2>
          <p className="mt-6 max-w-lg text-base leading-8 text-[#586c62]">
            {overview.listingDescription ||
              "A carefully composed collection of contemporary homes, designed around light, privacy and everyday ease."}
          </p>
          <a
            id="location"
            href={marketing.externalLinks?.googleMapsUrl || "#"}
            className="mt-7 inline-flex items-center gap-2 border-b border-[#b58b3c] pb-1 text-sm font-semibold"
          >
            {location} <MapPin size={15} /> View location
          </a>
        </div>
        <div className="overflow-hidden rounded-[9px] bg-[#e6e0d5]">
          {images[0] ? (
            <img
              src={images[0]}
              alt={`${data.name} lifestyle`}
              className="min-h-[310px] h-full w-full object-cover"
            />
          ) : null}
        </div>
      </section>
      <section className="border-y border-[#e1dacd] bg-[#ece7dc]">
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
      </section>
      <section
        id="residences"
        className="mx-auto max-w-[1280px] px-5 py-20 md:px-8 md:py-28"
      >
        <div className="flex items-end justify-between">
          <div>
            <Eyebrow>Residences</Eyebrow>
            <h2 className="mt-3 font-serif text-4xl md:text-5xl">
              Find your space.
            </h2>
          </div>
          <a
            href="#live-availability"
            className="hidden border border-[#cab999] px-4 py-2 text-xs font-semibold md:block"
          >
            View all availability
          </a>
        </div>
        <div className="mt-9 grid gap-5 md:grid-cols-3">
          {groups.map((items, index) => {
            const first = items[0];
            const itemPrices = items
              .map((item) => Number(item.price))
              .filter(Boolean);
            const sizes = items
              .map((item) => Number(item.sizeSqm))
              .filter(Boolean);
            return (
              <article
                key={first.unitType || index}
                className="overflow-hidden border border-[#e2dbcf] bg-[#fcfaf5]"
              >
                {galleryImages[index % Math.max(galleryImages.length, 1)] ? <img
                  src={galleryImages[index % Math.max(galleryImages.length, 1)]}
                  alt=""
                  className="h-48 w-full object-cover"
                /> : null}
                <div className="p-5">
                  <h3 className="font-serif text-2xl">
                    {beds(first.unitType)}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#65776d]">
                    From {money(Math.min(...itemPrices), true)}
                    <br />
                    {sizes.length
                      ? `${Math.min(...sizes)}–${Math.max(...sizes)} m²`
                      : "Size on request"}
                  </p>
                  <a
                    href="#live-availability"
                    className="mt-5 inline-flex items-center gap-2 text-sm font-semibold"
                  >
                    Explore <ArrowRight size={14} />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <section id="gallery" className="py-8">
        <div className="mx-auto flex max-w-[1280px] items-end justify-between px-5 md:px-8">
          <div>
            <Eyebrow>Gallery</Eyebrow>
            <h2 className="mt-3 font-serif text-4xl md:text-5xl">
              A glimpse of life at {data.name}.
            </h2>
          </div>
          <div className="hidden gap-2 md:flex">
            <button
              onClick={() =>
                gallery.current?.scrollBy({ left: -360, behavior: "smooth" })
              }
              className="border border-[#cab999] p-2.5"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              onClick={() =>
                gallery.current?.scrollBy({ left: 360, behavior: "smooth" })
              }
              className="border border-[#cab999] p-2.5"
            >
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
        <div
          ref={gallery}
          className="mt-8 flex snap-x gap-4 overflow-x-auto px-5 pb-3 md:px-8"
        >
          {galleryImages
            .concat(
              galleryImages.length < 4
                ? [hero, media.sitePlanUrl].filter((url) => url && !isDevelopmentLogo(url))
                : [],
            )
            .map((url, index) => (
              <img
                key={`${url}-${index}`}
                src={url}
                alt={`${data.name} gallery`}
                className="h-56 w-[280px] shrink-0 snap-start rounded-[8px] object-cover md:h-64 md:w-[360px]"
              />
            ))}
        </div>
      </section>
      <section
        id="live-availability"
        className="mx-auto max-w-[1280px] px-5 py-20 md:px-8 md:py-28"
      >
        <Eyebrow>Live availability</Eyebrow>
        <h2 className="mt-3 font-serif text-4xl md:text-5xl">
          Choose your residence.
        </h2>
        <div className="mt-7 flex flex-wrap gap-2">
          {["all", ...types].map((item) => (
            <button
              key={item}
              onClick={() => setTypeFilter(item)}
              className={`rounded-full px-4 py-2 text-xs font-semibold ${typeFilter === item ? "bg-[#143d33] text-white" : "bg-[#e9e4da] text-[#55685e]"}`}
            >
              {item === "all" ? "All" : beds(item)}
            </button>
          ))}
          <label className="ml-2 flex items-center gap-2 py-2 text-xs text-[#63766c]">
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(event) => setAvailableOnly(event.target.checked)}
            />{" "}
            Available only
          </label>
        </div>
        <div className="mt-7 overflow-x-auto border-y border-[#e1d9cd]">
          <div className="min-w-[700px]">
            {live.map((unit) => {
              const [label, chip] = STATUS[keyFor(unit.status)];
              return (
                <a
                  key={unit.id}
                  href="#enquire"
                  onClick={scrollToEnquiry}
                  className="grid grid-cols-[.75fr_1.2fr_.65fr_.6fr_.85fr_.75fr_18px] items-center gap-3 border-b border-[#e9e2d7] px-3 py-4 text-sm last:border-0 hover:bg-[#faf8f3]"
                >
                  <strong>{unit.unitNumber}</strong>
                  <span>{unit.unitType || "Residence"}</span>
                  <span>{unit.block || "—"}</span>
                  <span>{unit.sizeSqm ? `${unit.sizeSqm} m²` : "—"}</span>
                  <strong>{money(unit.price)}</strong>
                  <span
                    className={`w-fit rounded-full px-2 py-1 text-[.64rem] font-semibold ${chip}`}
                  >
                    {label}
                  </span>
                  <ChevronRight size={16} className="text-[#8b988f]" />
                </a>
              );
            })}
          </div>
        </div>
      </section>
      <section id="enquire" className="bg-[#063a31] text-[#f7f0e3]">
        <div className="mx-auto grid max-w-[1280px] gap-8 px-5 py-16 md:grid-cols-[1fr_.95fr] md:items-center md:px-8 md:py-20">
          <div>
            <Eyebrow className="text-[#d5b365]">
              Make {data.name} home
            </Eyebrow>
            <h2 className="mt-3 font-serif text-4xl leading-[1.02] md:text-5xl">
              Let’s talk about your future home.
            </h2>
          </div>
          <p className="text-sm leading-6 text-[#d2ded6]">
            Register your interest or speak to the {agency} sales team for more
            information about {data.name}.
          </p>
          <PublicDevelopmentEnquiryForm developmentName={data.name} agency={agency} enquiry={enquiry} />
        </div>
        <footer className="border-t border-white/15">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-5 px-5 py-6 text-xs text-white/65 md:px-8">
            <DevelopmentMark name={data.name} logo={developmentLogoDark} />
            <span>{location}</span>
            <span>Privacy · Terms · Powered by Arch9</span>
          </div>
        </footer>
      </section>
    </main>
  );
}
