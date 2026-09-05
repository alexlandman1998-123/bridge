import { ArrowRight, Menu, X } from "lucide-react";
import { useState } from "react";
import PublicDevelopmentVisualExplorer from "../components/developments/PublicDevelopmentVisualExplorer.jsx";
const money = (value) =>
  Number(value)
    ? `R${(Number(value) / 1000000).toFixed(Number(value) % 1000000 ? 2 : 0)}m`
    : "Price on request";

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
}) {
  const [menu, setMenu] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const description =
    marketing.listingOverview?.shortDescription ||
    "Contemporary coastal living in the heart of Sea Point.";
  return (
    <main className="min-h-screen bg-[#f5f2eb] pb-20 text-[#14352c]">
      <section
        id="overview"
        className="relative min-h-[82svh] overflow-hidden bg-[#063a31] text-white"
      >
        <img
          src={hero}
          alt=""
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/10 to-[#061d18]/90" />
        <header className="absolute inset-x-0 top-0 z-10 flex h-18 items-center justify-between px-5">
          <span className="text-[11px] font-semibold tracking-[.15em]">
            <i className="mr-1 font-serif text-2xl text-[#d0ab55]">R</i>
            {agency.toUpperCase()}
          </span>
          <button
            onClick={() => setMenu(true)}
            aria-label="Open navigation"
            className="grid h-11 w-11 place-items-center rounded-full border border-white/40"
          >
            <Menu />
          </button>
        </header>
        <div className="relative flex min-h-[82svh] items-end px-5 pb-12">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#d7b867]">
              Now selling · {data.suburb || "Sea Point"}
            </p>
            <h1 className="mt-4 max-w-[340px] font-serif text-[3.45rem] leading-[.87] tracking-[-.055em]">
              {data.name}
            </h1>
            <p className="mt-5 max-w-[330px] leading-6 text-white/90">
              {description}
            </p>
            <div className="mt-6 flex gap-5 border-l border-white/45 pl-4 text-sm">
              <span>
                From<b className="block text-xl">{money(fromPrice)}</b>
              </span>
              <span>
                <b className="block text-xl">{available.length}</b>Available
              </span>
            </div>
            <a
              href="#availability"
              className="mt-7 inline-flex h-13 items-center gap-2 bg-[#d0ab55] px-5 font-semibold text-[#123b31]"
            >
              View residences <ArrowRight size={17} />
            </a>
          </div>
        </div>
      </section>
      {menu ? (
        <div className="fixed inset-0 z-[70] bg-[#073e32] px-6 pt-[max(28px,env(safe-area-inset-top))] text-white">
          <button
            onClick={() => setMenu(false)}
            className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-full border border-white/30"
          >
            <X />
          </button>
          <nav className="mt-20 grid gap-5 font-serif text-4xl">
            {[
              ["Overview", "#overview"],
              ["Availability", "#availability"],
              ["Residences", "#residences"],
              ["Gallery", "#gallery"],
              ["Enquire", "#enquire"],
            ].map(([label, href]) => (
              <a key={label} href={href} onClick={() => setMenu(false)}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      ) : null}
      <PublicDevelopmentVisualExplorer
        inventory={inventory}
        media={media}
        enquiry={enquiry}
        freshness={freshness}
        mobile
      />
      <section id="residences" className="px-5 py-14">
        <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#a98034]">
          Residences
        </p>
        <h2 className="mt-4 font-serif text-4xl leading-none">
          Find your space.
        </h2>
        <div className="mt-7 flex snap-x gap-4 overflow-x-auto pb-3">
          {inventory.slice(0, 6).map((unit, index) => (
            <a
              key={unit.id}
              href="#availability"
              className="w-[78vw] shrink-0 snap-start overflow-hidden rounded-lg border bg-[#fffdf9]"
            >
              <img
                src={images[index % images.length] || hero}
                alt=""
                loading="lazy"
                className="h-44 w-full object-cover"
              />
              <div className="p-4">
                <div className="flex justify-between">
                  <b className="text-xl">{unit.unitNumber}</b>
                  <b>{money(unit.price)}</b>
                </div>
                <p className="mt-2 text-sm text-[#607269]">
                  {unit.unitType || "Residence"}
                  {unit.sizeSqm ? ` · ${unit.sizeSqm} m²` : ""}
                </p>
              </div>
            </a>
          ))}
        </div>
      </section>
      <section id="gallery" className="py-8">
        <div className="px-5">
          <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#a98034]">
            Gallery
          </p>
          <h2 className="mt-4 font-serif text-4xl leading-none">
            A glimpse of life here.
          </h2>
        </div>
        <div className="mt-7 flex snap-x gap-4 overflow-x-auto px-5 pb-3">
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              onClick={() => setLightbox(index)}
              className="w-[82vw] shrink-0 snap-start text-left"
            >
              <img
                src={image}
                alt={`Development gallery ${index + 1}`}
                loading="lazy"
                className="h-64 w-full rounded-lg object-cover"
              />
              <small className="mt-2 block">
                {String(index + 1).padStart(2, "0")} /{" "}
                {String(images.length).padStart(2, "0")}
              </small>
            </button>
          ))}
        </div>
      </section>
      <section id="enquire" className="bg-[#073e32] px-5 py-14 text-[#f7f0e3]">
        <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#d5b365]">
          Make it home
        </p>
        <h2 className="mt-4 font-serif text-4xl leading-none">
          Let’s talk about your future home.
        </h2>
        <a
          href={enquiry}
          className="mt-7 flex h-14 items-center justify-center gap-2 bg-[#d0ab55] font-semibold text-[#14352c]"
        >
          Enquire now <ArrowRight size={17} />
        </a>
      </section>
      {lightbox !== null ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/95 p-5">
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-full border border-white/30 text-white"
          >
            <X />
          </button>
          <img
            src={images[lightbox]}
            alt="Development gallery"
            className="max-h-[82svh] w-full object-contain"
          />
        </div>
      ) : null}
      <a
        href={enquiry}
        className="fixed inset-x-0 bottom-0 z-30 flex min-h-16 items-center justify-between bg-[#fffdf9] px-5 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-5px_20px_rgba(9,38,30,.13)]"
      >
        <span className="text-sm text-[#64766d]">
          From <b className="ml-1 text-lg text-[#123b31]">{money(fromPrice)}</b>
        </span>
        <span className="rounded-md bg-[#073e32] px-6 py-3 text-sm font-semibold text-white">
          Enquire
        </span>
      </a>
    </main>
  );
}
