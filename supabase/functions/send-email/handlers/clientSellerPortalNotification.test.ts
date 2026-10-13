import {
  buildClientSellerPortalActionLink,
  buildClientSellerPortalNotificationEmail,
} from "./clientSellerPortalNotification.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

function withAppUrl(run: () => void) {
  const keys = ["CLIENT_APP_URL", "PUBLIC_APP_URL", "APP_BASE_URL", "SITE_URL"];
  const previous = keys.map((key) => Deno.env.get(key));
  try {
    keys.forEach((key) => Deno.env.delete(key));
    Deno.env.set("PUBLIC_APP_URL", "https://app.example.test");
    run();
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) Deno.env.delete(key);
      else Deno.env.set(key, previous[index]!);
    });
  }
}

const request = new Request("https://functions.example.test/send-email");

Deno.test("rejection CTA uses the seller entry token instead of a staff listing route", () => {
  withAppUrl(() => {
    const link = buildClientSellerPortalActionLink(request, {
      sellerPortalToken: "current-token",
      listingId: "listing-1",
      actionLink: "https://app.example.test/private-listings/listing-1",
    }, "client_portal_document_rejected");
    assert(
      link === "https://app.example.test/client/current-token/selling",
      link,
    );
  });
});

Deno.test("a missing or inactive seller entry link never falls back to a staff-only URL", () => {
  withAppUrl(() => {
    const link = buildClientSellerPortalActionLink(request, {
      listingId: "listing-1",
      transactionId: "transaction-1",
    }, "client_portal_document_rejected");
    assert(link === "", "Missing portal token must omit the CTA");
  });
});

Deno.test("other portal event links keep their existing routing", () => {
  withAppUrl(() => {
    const link = buildClientSellerPortalActionLink(request, {
      offerId: "offer-1",
    }, "offer_viewed_by_seller");
    assert(link === "https://app.example.test/offers/offer-1", link);
  });
});

Deno.test("rejection email displays the saved reason safely in HTML and fully in plain text", () => {
  const reason = "The statement is cropped. <script>unsafe()</script>";
  const email = buildClientSellerPortalNotificationEmail({
    eventKind: "client_portal_document_rejected",
    recipientName: "Seller One",
    title: "Document rejected",
    message: "Your proof of residence was rejected.",
    actionLink: "https://app.example.test/client/current-token/selling",
    ctaLabel: "Open Seller Portal",
    documentTitle: "Proof of residence",
    documentStatus: "Rejected",
    reason,
    nextAction: "Upload a corrected copy in your seller portal.",
    branding: {
      organisationName: "Synthetic Agency",
      primaryColor: "#123abc",
      secondaryColor: "#fedcba",
    },
  });
  assert(
    email.text.includes(`Reason: ${reason}`),
    "Plain text lost the saved reason",
  );
  assert(email.html.includes("&lt;script&gt;"), "HTML must escape the reason");
  assert(
    !email.html.includes("<script>"),
    "HTML contains executable reason markup",
  );
  assert(
    email.text.includes("Open Seller Portal:"),
    "Seller portal CTA missing",
  );
});
