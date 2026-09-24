import { assert, assertEquals, assertGreater } from "jsr:@std/assert@1";
import { PDFDocument } from "pdf-lib";
import {
  renderSellerSignedPdf,
  rowsForDocument,
  sellerDocumentDeclaration,
} from "./sellerSignedPdf.ts";

const pack = {
  mandate: {
    mandateType: "sole",
    propertyAddress: "10 Example Road",
    askingPrice: "R 2 500 000",
    commissionPercentage: "5",
    vatHandling: "including VAT",
    startDate: "2026-09-01",
    endDate: "2026-12-01",
  },
  seller: {
    name: "Alex Example",
    firstName: "Alex",
    surname: "Example",
    legalType: "individual",
    idNumber: "9001015009087",
    residentialAddress: "10 Example Road",
    email: "alex@example.com",
    phone: "0820000000",
  },
  disclosure: {
    responses: {
      roof_leaks: { answer: "no" },
      structural_defects: { answer: "yes", note: "Hairline crack in garage" },
    },
  },
  branding: {
    contract: "arch9-seller-signing-branding-snapshot-v1",
    digest: "b".repeat(64),
    organisationName: "Example Realty",
    website: "https://www.example-realty.co.za/",
    primaryColour: "#173f5f",
    accentColour: "#2a9b65",
  },
};

Deno.test("server renderer creates non-empty branded PDFs for the complete seller pack", async () => {
  for (const documentKey of ["fica", "disclosure", "mandate"]) {
    const artifact = await renderSellerSignedPdf({
      documentKey,
      signingPack: pack,
      signingPackDigest: "a".repeat(64),
      signedName: "Alex Example",
      signature: "Alex Example",
      signedAt: "2026-09-20T18:00:00.000Z",
    });
    assertEquals(artifact.mediaType, "application/pdf");
    assert(artifact.fileName.endsWith(".pdf"));
    assertGreater(artifact.bytes.length, 1_000);
    assertEquals(String.fromCharCode(...artifact.bytes.slice(0, 5)), "%PDF-");
    const pdf = await PDFDocument.load(artifact.bytes);
    assertGreater(pdf.getPageCount(), 0);
    assertEquals(pdf.getTitle(), artifact.title);
    assertEquals(pdf.getAuthor(), "Example Realty");
    assert(pdf.getKeywords()?.includes("b".repeat(64)));
  }
});

Deno.test("mandate and FICA use explicit seller declarations", () => {
  const mandate = sellerDocumentDeclaration(
    "mandate",
    "Example Realty",
    "Alex Example | 9001015009087",
  );
  const fica = sellerDocumentDeclaration("fica", "Example Realty");
  assert(mandate.startsWith("I/We, Alex Example | 9001015009087, confirm"));
  assert(mandate.includes("appoint Example Realty to market the property"));
  assert(fica.startsWith("I/We declare"));
  assert(fica.includes("authorise Example Realty to verify"));
});

Deno.test("mandate rows read dates from the frozen mandate or pack boundary", () => {
  const rows = rowsForDocument("mandate", {
    ...pack,
    mandate: { ...pack.mandate, startDate: undefined, endDate: undefined },
    mandateStartDate: "2026-09-02",
    mandateEndDate: "2026-12-02",
  });
  assertEquals(
    rows.find((row) => row.label === "Commencement date")?.value,
    "2026-09-02",
  );
  assertEquals(
    rows.find((row) => row.label === "Expiry date")?.value,
    "2026-12-02",
  );
});

Deno.test("FICA rows read country of residence from the frozen FICA boundary", () => {
  const rows = rowsForDocument("fica", {
    ...pack,
    seller: { ...pack.seller, countryOfResidence: undefined },
    fica: { country_of_residence: "South Africa" },
  });
  assertEquals(
    rows.find((row) => row.label === "Country of residence")?.value,
    "South Africa",
  );
});

Deno.test("the compact mandate and FICA layouts fit on one page", async () => {
  for (const documentKey of ["fica", "mandate"]) {
    const artifact = await renderSellerSignedPdf({
      documentKey,
      signingPack: pack,
      signingPackDigest: "a".repeat(64),
      signedName: "Alex Example",
      signature: "Alex Example",
      signedAt: "2026-09-20T18:00:00.000Z",
    });
    const pdf = await PDFDocument.load(artifact.bytes);
    assertEquals(pdf.getPageCount(), 1);
  }
});
