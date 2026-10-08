import {
  buildLeadAcknowledgementEmailHtml,
  buildLeadAcknowledgementEmailText,
} from "./leadAcknowledgement.ts";
import {
  leadEnquiryKind,
  resolveLeadEnquiryKind,
} from "../services/leadAcknowledgementContext.ts";
import type { SupabaseClient } from "supabase";
function assert(value: unknown, message = "Assertion failed") {
  if (!value) throw new Error(message);
}

Deno.test("tenant acknowledgement has a rental design and a qualification CTA in both formats", () => {
  const url = "https://example.test/viewing-preferences/tenant-token";
  const html = buildLeadAcknowledgementEmailHtml({ enquiryKind: "rental", viewingAvailabilityUrl: url });
  assert(html.includes("RENTAL ENQUIRY · TENANT QUALIFICATION"));
  assert(html.includes("Complete tenant qualification"));
  assert(html.includes(url));
  assert(!html.includes("Arrange a viewing</a>"));
  assert(buildLeadAcknowledgementEmailText({ enquiryKind: "rental", viewingAvailabilityUrl: url }).includes(url));
  assert(!buildLeadAcknowledgementEmailHtml({ enquiryKind: "sale" }).includes("TENANT QUALIFICATION"));
});

Deno.test("seller intros discuss selling and valuations in HTML and text", () => {
  for (const render of [buildLeadAcknowledgementEmailHtml,buildLeadAcknowledgementEmailText]) {
    const email=render({enquiryKind:"seller",recipientName:"Taylor Seller",agentName:"Jamie Agent",agentEmail:"jamie@agency.co.za"});
    assert(/selling your property/i.test(email));
    assert(/valuation/i.test(email));
    assert(!/Arrange a viewing|Buying a home|interest in one of our properties/i.test(email));
    assert(!/[\u2013\u2014]/u.test(email));
  }
  assert(leadEnquiryKind({leadIntent:"sell"})==="seller");
  assert(leadEnquiryKind({leadCategory:"seller"})==="seller");
  assert(leadEnquiryKind({leadCategory:"seller",arch9RentalLead:true,role:"landlord"})==="landlord");
});

Deno.test("rental and landlord acknowledgement replaces all sales wording in HTML and text", () => {
  for (const enquiryKind of ["rental", "landlord", "general"] as const) {
    for (
      const render of [
        buildLeadAcknowledgementEmailHtml,
        buildLeadAcknowledgementEmailText,
      ]
    ) {
      const email = render({ enquiryKind, agentEmail: "agent@example.test" });
      assert(
        !/Buying a home|finance readiness|sell another property/i.test(email),
      );
      if (enquiryKind === "rental") {
        assert(
          email.includes("monthly rental budget") &&
            email.includes("move-in date"),
        );
      }
      if (enquiryKind === "landlord") {
        assert(email.includes("expected monthly rent"));
      }
    }
  }
  assert(
    buildLeadAcknowledgementEmailHtml({ enquiryKind: "sale" }).includes(
      "Buying a home",
    ),
  );
  assert(!buildLeadAcknowledgementEmailHtml({}).includes("Buying a home"));
});

Deno.test("persisted rental classification takes precedence over generic buyer intent", () => {
  assert(
    leadEnquiryKind({
      arch9RentalLead: true,
      role: "tenant",
      leadIntent: "buy",
    }) === "rental",
  );
  assert(
    leadEnquiryKind({
      rentalCrm: { classification: "rental", role: "landlord" },
    }) === "landlord",
  );
  assert(leadEnquiryKind({ attribution: { leadIntent: "rent" } }) === "rental");
  assert(leadEnquiryKind({ leadIntent: "buy" }, "Rental") === "rental");
  assert(leadEnquiryKind({}, "Sale") === "sale");
  assert(leadEnquiryKind({ listingType: "Rental" }) === "general");
});

function fixture(values: Record<string, unknown>, calls: string[]) {
  return {
    from(table: string) {
      calls.push(table);
      return {
        select() {
          return this;
        },
        eq(column: string, value: string) {
          calls.push(`${table}:${column}=${value}`);
          return this;
        },
        maybeSingle() {
          return Promise.resolve(values[table] || { data: null, error: null });
        },
      };
    },
  } as unknown as SupabaseClient;
}
Deno.test("query resolves rental listings for portal leads without caller intent and scopes ownership", async () => {
  const calls: string[] = [];
  const client = fixture({
    leads: { data: { raw_enquiry_payload: {}, listing_id: "listing" } },
    private_listings: {
      data: { id: "listing", listing_category: "Residential" },
    },
    listing_publication_data: { data: { listing_type: "Rental" } },
  }, calls);
  assert(await resolveLeadEnquiryKind(client, "org", "lead") === "rental");
  assert(calls.includes("leads:organisation_id=org"));
  assert(calls.includes("leads:lead_id=lead"));
  assert(calls.includes("private_listings:organisation_id=org"));
  assert(calls.includes("listing_publication_data:listing_id=listing"));
});
Deno.test("missing records and database failures return neutral copy", async () => {
  assert(await resolveLeadEnquiryKind(undefined, "org", "lead") === "general");
  for (
    const result of [{ error: { message: "permission denied" } }, {
      data: null,
    }, {
      data: {
        raw_enquiry_payload: { leadIntent: "buy" },
        listing_id: "listing",
      },
    }]
  ) {
    assert(
      await resolveLeadEnquiryKind(
        fixture({
          leads: result,
          private_listings: { error: { message: "unavailable" } },
        }, []),
        "org",
        "lead",
      ) === "general",
    );
  }
  const calls: string[] = [];
  assert(
    await resolveLeadEnquiryKind(fixture({}, calls), "", "lead") === "general",
  );
  assert(calls.length === 0);
});
