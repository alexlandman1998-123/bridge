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
import HomeSeekersValuationModal from "./HomeSeekersValuationModal";
import HomeSeekersMobileNav from "./HomeSeekersMobileNav";
import HomeSeekersFooter from "./HomeSeekersFooter";
import "./HomeSeekersBuying.css";

const listings = [
  {
    id: "waterkloof-estate",
    place: "Waterkloof",
    address: "Waterkloof Estate, Pretoria",
    price: "R25,800,000",
    beds: 5,
    baths: 7,
    parking: 5,
    type: "House",
    feature:
      "A private estate residence, designed for family life at its best.",
    description:
      "A grand garden setting, generous entertaining spaces and a sense of privacy that is hard to find.",
    image:
      "https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/residential/2026/2/869_42e792e711594d22ad9df15a573182f4_t_w_1540_h_635.avif",
  },
  {
    id: "steyn-city",
    place: "Steyn City",
    address: "Steyn City, Midrand",
    price: "R12,995,000",
    beds: 3,
    baths: 3,
    parking: 2,
    type: "House",
    feature:
      "Architectural simplicity with a considered indoor-outdoor rhythm.",
    description:
      "Contemporary lines, quiet finishes and a lifestyle designed around light, space and ease.",
    image:
      "https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/residential/2025/8/869_97bcc14546414da09ea8ba586b858759_t_w_505_h_490.avif",
  },
  {
    id: "waterkloof-land",
    place: "Waterkloof",
    address: "Waterkloof, Pretoria",
    price: "R3,490,000",
    beds: null,
    baths: null,
    parking: null,
    type: "Land",
    feature: "A rare canvas for a home with a point of view.",
    description:
      "An opportunity to create a home with a point of view in one of Pretoria’s most established addresses.",
    image:
      "https://d21tw07c6rnmp0.cloudfront.net/media/uploads/869/residential/2025/8/869_f02bc109f42a499fb43e3e7b41af6c13_t_w_505_h_490.avif",
  },
  {
    id: "menlo-park-residence",
    place: "Menlo Park",
    address: "Menlo Park, Pretoria",
    price: "R8,950,000",
    beds: 4,
    baths: 3,
    parking: 2,
    type: "House",
    feature: "A composed home for easy everyday living.",
    description:
      "Warm contemporary finishes, a sheltered garden and generous social spaces in a quietly connected address.",
    image:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=88",
  },
  {
    id: "brooklyn-courtyard-home",
    place: "Brooklyn",
    address: "Brooklyn, Pretoria",
    price: "R6,750,000",
    beds: 3,
    baths: 2,
    parking: 2,
    type: "House",
    feature: "Light, privacy and a courtyard at its centre.",
    description:
      "A calm urban home with a considered flow from living spaces to the garden and the street beyond.",
    image:
      "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=88",
  },
  {
    id: "moreleta-park-family-home",
    place: "Moreleta Park",
    address: "Moreleta Park, Pretoria",
    price: "R4,850,000",
    beds: 4,
    baths: 3,
    parking: 2,
    type: "House",
    feature: "A practical family home with room to grow.",
    description:
      "An established garden, adaptable rooms and an easy rhythm for the everyday moments that matter.",
    image:
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=88",
  },
];
const navigation = [
  ["Selling", "selling"],
  ["Buying", "buying"],
  ["Renting", "renting"],
  ["Areas", "areas"],
  ["About", "about"],
  ["Join us", "join"],
];

function PropertyCard({ listing, featured }) {
  return (
    <article
      className={`hs-buying-card ${featured ? "hs-buying-card--feature" : ""}`}
    >
      <div className="hs-buying-card__image">
        <img src={listing.image} alt={listing.address} />
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
        <a href={`/demo/homeseekers/buying/${listing.id}`}>
          View property <ArrowUpRight size={17} />
        </a>
      </div>
    </article>
  );
}

export default function HomeSeekersBuying() {
  const [query, setQuery] = useState("");
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
    [query, type, bedrooms],
  );
  return (
    <main className="hs-buying">
      <header className="hs-buying__header">
        <a href="/demo/homeseekers" aria-label="Home Seekers home">
          <img
            src="/brand/homeseekers/home-seekers-horizontal-black.svg"
            alt="Home Seekers"
          />
        </a>
        <nav>
          {navigation.map(([label, slug]) => (
            <a
              className={slug === "buying" ? "is-active" : ""}
              href={`/demo/homeseekers/${slug}`}
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
            `/demo/homeseekers/${slug}`,
          ])}
          active="buying"
          onValuation={() => setValuationOpen(true)}
        />
      </header>

      <section className="hs-buying__hero">
        <img src={listings[0].image} alt="Featured Waterkloof home" />
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
              {visibleListings.length.toString().padStart(2, "0")} PROPERTIES IN
              PREVIEW
            </span>
            <p>
              Live inventory will populate here as the listings feed connects.
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
            <p>NO HOMES MATCH THESE FILTERS</p>
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
          <a href="mailto:info@homeseeker.co.za?subject=Property%20search%20request">
            Start a property search <ArrowRight size={18} />
          </a>
        </div>
      </section>

      <HomeSeekersFooter />
      {valuationOpen && (
        <HomeSeekersValuationModal onClose={() => setValuationOpen(false)} />
      )}
    </main>
  );
}
