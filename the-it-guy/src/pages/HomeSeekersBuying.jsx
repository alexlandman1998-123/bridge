import { homeSeekersPath } from './homeSeekersRoutes.js'
import {
  ArrowRight,
  ArrowUpRight,
  Bath,
  BedDouble,
  Car,
  Heart,
  MapPin,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";
import "./HomeSeekersBrand.css";
import HomeSeekersValuationModal from "./HomeSeekersValuationModal";
import HomeSeekersMobileNav from "./HomeSeekersMobileNav";
import HomeSeekersFooter from "./HomeSeekersFooter";
import HomeSeekersLeadForm from './HomeSeekersLeadForm';
import { homeSeekersCard, useHomeSeekersWebsiteData } from './homeSeekersWebsiteData';
import "./HomeSeekersBuying.css";

const buyingHeroImage = 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/residential/2026/2/869_42e792e711594d22ad9df15a573182f4_t_w_1540_h_635.avif'
const navigation = [
  ["Selling", "selling"],
  ["Buying", "buying"],
  ["Renting", "renting"],
  ["About", "about"],
  ["Join us", "join"],
];

function PropertyCard({ listing, featured }) {
  return (
    <article
      className={`hs-buying-card ${featured ? "hs-buying-card--feature" : ""}`}
    >
      <div className="hs-buying-card__image">
        {listing.image ? <img src={listing.image} alt={listing.address} /> : <div className="hs-buying-card__image-placeholder" aria-hidden="true" />}
        <button type="button" aria-label={`Save ${listing.address}`}>
          <Heart size={18} />
        </button>
        <span>{listing.type === "Land" ? "LAND" : "FOR SALE"}</span>
      </div>
      <div className="hs-buying-card__body">
        <p>
          <MapPin size={14} /> {listing.address}
        </p>
        <h2>{listing.price}</h2>
        {featured && <strong>{listing.feature}</strong>}
        <p className="hs-buying-card__description">{listing.description}</p>
        <div className="hs-buying-card__meta">
          {listing.beds ? (
            <span>
              <BedDouble size={16} /> {listing.beds}
            </span>
          ) : (
            <span>Vacant land</span>
          )}
          {listing.baths && (
            <span>
              <Bath size={16} /> {listing.baths}
            </span>
          )}
          {listing.parking && (
            <span>
              <Car size={16} /> {listing.parking}
            </span>
          )}
        </div>
        <a href={homeSeekersPath(`/properties/${listing.id}`)}>
          View property <ArrowUpRight size={17} />
        </a>
      </div>
    </article>
  );
}

export default function HomeSeekersBuying() {
  const { listings: websiteListings, loading: listingsLoading, error: listingsError } = useHomeSeekersWebsiteData();
  const listings = useMemo(() => websiteListings.filter((listing) => listing.transactionType === 'sale').map(homeSeekersCard), [websiteListings]);
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q')?.trim() || "");
  const [type, setType] = useState("All homes");
  const [bedrooms, setBedrooms] = useState("Any beds");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [valuationOpen, setValuationOpen] = useState(false);
  const visibleListings = useMemo(
    () =>
      listings.filter((listing) => {
        const matchesQuery = `${listing.place} ${listing.address}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const matchesType = type === "All homes" || listing.type === type;
        const matchesBeds =
          bedrooms === "Any beds" ||
          (listing.beds && listing.beds >= Number(bedrooms[0]));
        return matchesQuery && matchesType && matchesBeds;
      }),
    [listings, query, type, bedrooms],
  );
  return (
    <main className="hs-buying">
      <header className="hs-buying__header">
        <a href={homeSeekersPath("/")} aria-label="Home Seekers home">
          <img
            src="/brand/homeseekers/home-seekers-horizontal-black.svg"
            alt="Home Seekers"
          />
        </a>
        <nav>
          {navigation.map(([label, slug]) => (
            <a
              className={slug === "buying" ? "is-active" : ""}
              href={homeSeekersPath(`/${slug}`)}
              key={slug}
            >
              {label}
            </a>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setValuationOpen(true)}
          className="hs-buying__valuation"
        >
          Book a free valuation
        </button>
        <HomeSeekersMobileNav
          links={navigation.map(([label, slug]) => [
            label,
            homeSeekersPath(`/${slug}`),
          ])}
          active="buying"
          onValuation={() => setValuationOpen(true)}
        />
      </header>

      <section className="hs-buying__hero">
        <img src={buyingHeroImage} alt="" />
        <div className="hs-buying__hero-shade" />
        <div className="hs-buying__hero-copy">
          <p>
            ❯ FIND YOUR <strong>NEXT MOVE</strong>
          </p>
          <h1>
            Find the one worth
            <br />
            cancelling plans for.
          </h1>
          <span>PRETORIA EAST &amp; BEYOND</span>
        </div>
        <form
          className="hs-buying__search"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="hs-buying__search-query">
            <Search size={20} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by suburb, address or lifestyle"
              aria-label="Search properties"
            />
          </div>
          <label>
            Property type
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option>All homes</option>
              <option>House</option>
              <option>Land</option>
            </select>
          </label>
          <label>
            Bedrooms
            <select
              value={bedrooms}
              onChange={(event) => setBedrooms(event.target.value)}
            >
              <option>Any beds</option>
              <option>3+ beds</option>
              <option>4+ beds</option>
              <option>5+ beds</option>
            </select>
          </label>
          <button type="submit">
            Explore homes <ArrowRight size={18} />
          </button>
        </form>
      </section>

      <section className="hs-buying__explorer" id="properties">
        <div className="hs-buying__explorer-head">
          <div>
            <p>
              ❯ CURRENT <strong>INVENTORY</strong>
            </p>
            <h2>
              Find the place
              <br />
              that fits next.
            </h2>
          </div>
          <div className="hs-buying__inventory-note">
            <span>
              {visibleListings.length.toString().padStart(2, "0")} HOMES ONLINE
            </span>
            <p>
              Current homes published by Home Seekers in the CRM.
            </p>
          </div>
        </div>
        <div className="hs-buying__toolbar">
          <div>
            <button
              className={filtersOpen ? "is-active" : ""}
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal size={17} /> Filters
            </button>
            <span>{type}</span>
            <span>{bedrooms}</span>
          </div>
          <span>
            Sorted by <b>Newest</b>
          </span>
        </div>
        {filtersOpen && (
          <div className="hs-buying__filters">
            <label>
              Property type
              <select
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                <option>All homes</option>
                <option>House</option>
                <option>Land</option>
              </select>
            </label>
            <label>
              Bedrooms
              <select
                value={bedrooms}
                onChange={(event) => setBedrooms(event.target.value)}
              >
                <option>Any beds</option>
                <option>3+ beds</option>
                <option>4+ beds</option>
                <option>5+ beds</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setType("All homes");
                setBedrooms("Any beds");
                setQuery("");
              }}
            >
              Clear filters
            </button>
          </div>
        )}
        <div className="hs-buying__grid">
          {visibleListings.map((listing, index) => (
            <PropertyCard
              listing={listing}
              featured={index === 0}
              key={listing.id}
            />
          ))}
        </div>
        {visibleListings.length === 0 && (
          <div className="hs-buying__empty">
            <p>{listingsLoading ? 'Loading current homes…' : listingsError || (listings.length ? 'NO HOMES MATCH THESE FILTERS' : 'No homes are published online right now.')}</p>
            <button
              type="button"
              onClick={() => {
                setType("All homes");
                setBedrooms("Any beds");
                setQuery("");
              }}
            >
              Reset search
            </button>
          </div>
        )}
      </section>

      <section className="hs-buying__match" id="enquire">
        <div>
          <p>
            ❯ NOT SEEING <strong>IT YET?</strong>
          </p>
          <h2>
            Tell us the dream list.
            <br />
            We’ll do the house-hunting.
          </h2>
        </div>
        <div>
          <p className="hs-buying__match-description">
            Some of the best homes never spend long on the market. Tell us what
            you are looking for and we will keep an eye out.
          </p>
          <HomeSeekersLeadForm leadIntent="buy" subject="Property search" buttonLabel="Start a property search" />
        </div>
      </section>

      <HomeSeekersFooter />
      {valuationOpen && (
        <HomeSeekersValuationModal onClose={() => setValuationOpen(false)} />
      )}
    </main>
  );
}
