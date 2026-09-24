import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";

type RecordValue = Record<string, unknown>;

export type SellerSignedPdfInput = {
  documentKey: string;
  signingPack: RecordValue;
  signingPackDigest: string;
  signedName: string;
  signature: string;
  signedAt: string;
  branding?: RecordValue;
  logo?: { bytes: Uint8Array; mediaType: string } | null;
};

export type SellerSignedPdfArtifact = {
  bytes: Uint8Array;
  fileName: string;
  mediaType: "application/pdf";
  title: string;
};

type PdfRow = { label: string; value: string };

const text = (value: unknown) => String(value ?? "").trim();
const object = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : {};

function safeDate(value: unknown) {
  const date = new Date(text(value));
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : new Intl.DateTimeFormat("en-ZA", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Africa/Johannesburg",
    }).format(date);
}

function hexColour(value: unknown, fallback: [number, number, number]) {
  const match = text(value).match(/^#?([0-9a-f]{6})$/i);
  if (!match) return rgb(...fallback);
  const number = Number.parseInt(match[1], 16);
  return rgb(
    ((number >> 16) & 255) / 255,
    ((number >> 8) & 255) / 255,
    (number & 255) / 255,
  );
}

function humanize(value: unknown) {
  const normalized = text(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return normalized
    ? normalized[0].toUpperCase() + normalized.slice(1)
    : "Detail";
}

function mandateLabel(value: unknown) {
  const key = text(value).toLowerCase();
  return key === "dual"
    ? "Dual mandate"
    : key === "tri"
    ? "Tri mandate"
    : key === "open"
    ? "Open mandate"
    : "Sole mandate";
}

function websiteLabel(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return `${url.hostname.replace(/^www\./i, "")}${path}`;
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }
}

export function sellerDocumentDeclaration(
  documentKey: string,
  agencyName: string,
  signerIdentity = "",
) {
  if (documentKey === "mandate") {
    const identity = text(signerIdentity);
    const opening = identity ? `I/We, ${identity}, confirm` : "I/We confirm";
    return `${opening} that the information recorded in this mandate is true and correct, and that I/we appoint ${agencyName} to market the property on the mandate terms set out below. I/We understand that this signed document records the authority and commercial terms agreed with the agency.`;
  }
  if (documentKey === "fica") {
    return `I/We declare that the information supplied in this FICA declaration is true and accurate. I/We authorise ${agencyName} to verify this information and the supporting documents for customer due diligence and compliance with applicable law.`;
  }
  return "";
}

function sellerIdentityLabel(pack: RecordValue) {
  const seller = object(pack.seller);
  const name = text(
    seller.name ||
      [seller.firstName, seller.surname || seller.lastName].filter(Boolean)
        .join(" "),
  );
  const idOrRegistration = text(
    seller.idNumber || seller.companyRegistrationNumber ||
      seller.trustRegistrationNumber || seller.registrationNumber,
  );
  return [name, idOrRegistration].filter(Boolean).join(" | ");
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const result = text(value);
    if (result) return result;
  }
  return "";
}

function sellerCountryOfResidence(pack: RecordValue, seller: RecordValue) {
  const fica = object(pack.fica);
  const onboarding = object(pack.sellerOnboarding);
  const formData = object(onboarding.formData);
  const canonicalSeller = object(object(onboarding.canonicalFacts).seller);
  return firstText(
    seller.countryOfResidence,
    seller.country_of_residence,
    seller.residencyCountry,
    seller.residency_country,
    fica.countryOfResidence,
    fica.country_of_residence,
    fica.residencyCountry,
    fica.residency_country,
    formData.countryOfResidence,
    formData.country_of_residence,
    canonicalSeller.countryOfResidence,
    canonicalSeller.country_of_residence,
    object(canonicalSeller.foreign).country,
  );
}

function documentDescriptor(documentKey: string, pack: RecordValue) {
  const mandate = object(pack.mandate);
  if (documentKey === "disclosure") {
    return {
      title: "Property condition disclosure",
      fileName: "signed-property-condition-disclosure.pdf",
    };
  }
  if (documentKey === "fica") {
    return {
      title: "Seller FICA declaration",
      fileName: "signed-fica-declaration.pdf",
    };
  }
  return {
    title: mandateLabel(mandate.mandateType),
    fileName: "signed-mandate.pdf",
  };
}

export function rowsForDocument(documentKey: string, pack: RecordValue): PdfRow[] {
  const mandate = object(pack.mandate);
  const property = object(pack.property);
  const seller = object(pack.seller);
  const common: PdfRow[] = [
    {
      label: "Property",
      value: text(mandate.propertyAddress || property.address) ||
        "Not captured",
    },
    {
      label: "Seller / entity",
      value: text(seller.name || seller.companyName || seller.trustName) ||
        "Not captured",
    },
  ];
  if (documentKey === "mandate") {
    const commencementDate = firstText(
      mandate.commencementDate,
      mandate.commencement_date,
      mandate.startDate,
      mandate.start_date,
      mandate.mandateStartDate,
      mandate.mandate_start_date,
      pack.mandateStartDate,
      pack.mandate_start_date,
      pack.listingDate,
    );
    const expiryDate = firstText(
      mandate.expiryDate,
      mandate.expiry_date,
      mandate.endDate,
      mandate.end_date,
      mandate.mandateEndDate,
      mandate.mandate_end_date,
      pack.mandateEndDate,
      pack.mandate_end_date,
      pack.expiryDate,
      object(pack.listing).expiryDate,
    );
    const commission = text(mandate.commissionBasis).toLowerCase() === "fixed"
      ? text(mandate.commissionAmount)
      : text(mandate.commissionPercentage)
      ? `${text(mandate.commissionPercentage)}%`
      : "";
    return [...common, {
      label: "Mandate type",
      value: mandateLabel(mandate.mandateType),
    }, {
      label: "Asking price",
      value: text(mandate.askingPrice) || "As agreed",
    }, {
      label: "Commission",
      value: [commission || "As agreed", text(mandate.vatHandling)].filter(
        Boolean,
      ).join(" "),
    }, {
      label: "Commencement date",
      value: commencementDate || "Not captured",
    }, {
      label: "Expiry date",
      value: expiryDate || "Not captured",
    }];
  }
  if (documentKey === "fica") {
    const legalType = text(seller.legalType).toLowerCase();
    const company = ["company", "close_corporation", "foreign_company"]
      .includes(legalType);
    const trust = ["trust", "foreign_trust"].includes(legalType);
    const entityRows = company
      ? [
        {
          label: "Company name",
          value: text(seller.companyName || seller.name),
        },
        {
          label: "Registration number",
          value: text(seller.companyRegistrationNumber),
        },
        {
          label: "Registered address",
          value: text(seller.companyRegisteredAddress),
        },
      ]
      : trust
      ? [
        { label: "Trust name", value: text(seller.trustName || seller.name) },
        {
          label: "Registration number",
          value: text(seller.trustRegistrationNumber),
        },
        {
          label: "Registered address",
          value: text(seller.trustRegisteredAddress),
        },
      ]
      : [
        { label: "First name", value: text(seller.firstName) },
        { label: "Surname", value: text(seller.surname) },
        { label: "ID / passport number", value: text(seller.idNumber) },
        { label: "Date of birth", value: text(seller.dateOfBirth) },
        { label: "Nationality", value: text(seller.nationality) },
        {
          label: "Country of residence",
          value: sellerCountryOfResidence(pack, seller),
        },
        {
          label: "Residential address",
          value: text(seller.residentialAddress),
        },
        { label: "Income tax number", value: text(seller.incomeTaxNumber) },
        { label: "Email", value: text(seller.email) },
        { label: "Phone", value: text(seller.phone) },
      ];
    return [...common, {
      label: "Legal type",
      value: humanize(legalType || "individual"),
    }, ...entityRows].map((row) => ({
      ...row,
      value: row.value || "Not captured",
    }));
  }
  const responses = object(object(pack.disclosure).responses);
  const disclosureRows = Object.entries(responses).map(
    ([question, rawAnswer]) => {
      const answer = object(rawAnswer);
      const value = [
        humanize(answer.answer || "Not answered"),
        text(answer.note),
      ].filter(Boolean).join(" - ");
      return { label: humanize(question), value };
    },
  );
  return [
    ...common,
    ...(disclosureRows.length ? disclosureRows : [{
      label: "Disclosure",
      value:
        "The seller reviewed the property-condition disclosure included in the frozen signing pack.",
    }]),
  ];
}

function wrapText(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
) {
  const paragraphs = String(value || "").split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        line = word;
        continue;
      }
      let fragment = "";
      for (const character of word) {
        if (
          font.widthOfTextAtSize(fragment + character, size) > maxWidth &&
          fragment
        ) {
          lines.push(fragment);
          fragment = character;
        } else fragment += character;
      }
      line = fragment;
    }
    if (line) lines.push(line);
  }
  return lines;
}

async function embedOptionalImage(
  pdf: PDFDocument,
  input?: { bytes: Uint8Array; mediaType: string } | null,
) {
  if (!input?.bytes?.length) return null;
  try {
    if (/png/i.test(input.mediaType)) return await pdf.embedPng(input.bytes);
    if (/jpe?g/i.test(input.mediaType)) return await pdf.embedJpg(input.bytes);
  } catch {
    return null;
  }
  return null;
}

async function embedSignature(pdf: PDFDocument, signature: string) {
  const match = text(signature).match(/^data:image\/(png|jpeg);base64,(.+)$/i);
  if (!match) return null;
  try {
    const binary = atob(match[2]);
    const bytes = Uint8Array.from(
      binary,
      (character) => character.charCodeAt(0),
    );
    return match[1].toLowerCase() === "png"
      ? await pdf.embedPng(bytes)
      : await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

export async function renderSellerSignedPdf(
  input: SellerSignedPdfInput,
): Promise<SellerSignedPdfArtifact> {
  const documentKey = text(input.documentKey).toLowerCase();
  if (!["disclosure", "fica", "mandate"].includes(documentKey)) {
    throw new Error("Unsupported seller signing document type.");
  }
  const pack = object(input.signingPack);
  const branding = { ...object(pack.branding), ...object(input.branding) };
  const descriptor = documentDescriptor(documentKey, pack);
  const agencyName = text(branding.organisationName || branding.agencyName) ||
    "Arch9";
  const agencyWebsite = websiteLabel(
    branding.website || branding.websiteUrl || branding.companyWebsite ||
      object(branding.source).website,
  );
  const primary = hexColour(branding.primaryColour || branding.primaryColor, [
    0.09,
    0.25,
    0.37,
  ]);
  const accent = hexColour(branding.accentColour || branding.accentColor, [
    0.16,
    0.61,
    0.40,
  ]);
  const ink = rgb(0.09, 0.14, 0.20);
  const muted = rgb(0.36, 0.45, 0.55);
  const pale = rgb(0.96, 0.98, 0.99);
  const border = rgb(0.84, 0.89, 0.93);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedOptionalImage(pdf, input.logo);
  const signatureImage = await embedSignature(pdf, input.signature);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 52;
  const contentWidth = pageWidth - margin * 2;
  const pages: PDFPage[] = [];
  let page = null as unknown as PDFPage;
  let y = 0;

  const addPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    pages.push(page);
    if (logo) {
      const fitted = logo.scaleToFit(142, 44);
      page.drawImage(logo, {
        x: margin,
        y: pageHeight - 68,
        width: fitted.width,
        height: fitted.height,
      });
    } else {
      page.drawText(agencyName, {
        x: margin,
        y: pageHeight - 52,
        font: bold,
        size: 17,
        color: primary,
        maxWidth: 260,
      });
    }
    if (agencyWebsite) {
      const websiteWidth = regular.widthOfTextAtSize(agencyWebsite, 9);
      page.drawText(agencyWebsite, {
        x: Math.max(margin + 220, pageWidth - margin - websiteWidth),
        y: pageHeight - 50,
        font: regular,
        size: 9,
        color: muted,
        maxWidth: 210,
      });
    }
    page.drawLine({
      start: { x: margin, y: pageHeight - 82 },
      end: { x: pageWidth - margin, y: pageHeight - 82 },
      thickness: 1.2,
      color: accent,
    });
    y = pageHeight - 112;
  };
  const ensure = (height: number) => {
    if (y - height < 72) addPage();
  };
  const drawLines = (
    lines: string[],
    options: {
      x?: number;
      size?: number;
      font?: PDFFont;
      color?: ReturnType<typeof rgb>;
      maxWidth?: number;
      lineHeight?: number;
    } = {},
  ) => {
    const x = options.x ?? margin;
    const size = options.size ?? 10;
    const selectedFont = options.font ?? regular;
    const color = options.color ?? ink;
    const lineHeight = options.lineHeight ?? size * 1.35;
    const maxWidth = options.maxWidth ?? contentWidth;
    for (const sourceLine of lines) {
      const wrapped = wrapText(sourceLine, selectedFont, size, maxWidth);
      for (const line of wrapped) {
        ensure(lineHeight);
        page.drawText(line, {
          x,
          y,
          font: selectedFont,
          size,
          color,
          maxWidth,
        });
        y -= lineHeight;
      }
    }
  };

  addPage();
  drawLines([descriptor.title], {
    font: bold,
    size: 22,
    color: primary,
    lineHeight: 28,
  });
  y -= 4;
  drawLines([`Signed ${safeDate(input.signedAt)}`], {
    size: 9,
    color: muted,
    lineHeight: 14,
  });
  y -= 10;

  const declaration = sellerDocumentDeclaration(
    documentKey,
    agencyName,
    documentKey === "mandate" ? sellerIdentityLabel(pack) : "",
  );
  if (declaration) {
    const declarationLines = wrapText(
      declaration,
      regular,
      9.2,
      contentWidth - 28,
    );
    if (documentKey === "mandate") {
      ensure(declarationLines.length * 12 + 34);
      page.drawText("Mandate authority", {
        x: margin,
        y,
        font: bold,
        size: 10.5,
        color: primary,
      });
      y -= 16;
      for (const line of declarationLines) {
        page.drawText(line, {
          x: margin,
          y,
          font: regular,
          size: 9.2,
          color: ink,
          maxWidth: contentWidth,
        });
        y -= 12;
      }
      y -= 8;
    } else {
      const declarationHeight = declarationLines.length * 12 + 34;
      ensure(declarationHeight + 18);
      page.drawRectangle({
        x: margin,
        y: y - declarationHeight,
        width: contentWidth,
        height: declarationHeight,
        color: rgb(1, 1, 1),
        borderColor: border,
        borderWidth: 0.8,
      });
      page.drawRectangle({
        x: margin,
        y: y - declarationHeight,
        width: 3,
        height: declarationHeight,
        color: accent,
      });
      page.drawText("Declaration", {
        x: margin + 14,
        y: y - 17,
        font: bold,
        size: 9.5,
        color: primary,
      });
      let declarationY = y - 33;
      for (const line of declarationLines) {
        page.drawText(line, {
          x: margin + 14,
          y: declarationY,
          font: regular,
          size: 9.2,
          color: ink,
          maxWidth: contentWidth - 28,
        });
        declarationY -= 12;
      }
      y -= declarationHeight + 18;
    }
  }

  page.drawText("Document details", {
    x: margin,
    y,
    font: bold,
    size: 11,
    color: primary,
  });
  y -= 15;

  for (const [rowIndex, row] of rowsForDocument(documentKey, pack).entries()) {
    const valueLines = wrapText(
      row.value || "Not captured",
      regular,
      8.8,
      contentWidth - 158,
    );
    const height = Math.max(24, valueLines.length * 10.5 + 12);
    ensure(height);
    page.drawRectangle({
      x: margin,
      y: y - height,
      width: contentWidth,
      height,
      color: rowIndex % 2 === 0 ? pale : rgb(1, 1, 1),
      borderColor: border,
      borderWidth: 0.55,
    });
    page.drawLine({
      start: { x: margin + 142, y: y - height },
      end: { x: margin + 142, y },
      thickness: 0.55,
      color: border,
    });
    page.drawText(row.label, {
      x: margin + 9,
      y: y - 15,
      font: bold,
      size: 8.2,
      color: muted,
      maxWidth: 124,
    });
    let valueY = y - 15;
    for (const line of valueLines) {
      page.drawText(line, {
        x: margin + 151,
        y: valueY,
        font: regular,
        size: 8.8,
        color: ink,
        maxWidth: contentWidth - 160,
      });
      valueY -= 10.5;
    }
    y -= height;
  }

  y -= 16;
  ensure(146);
  page.drawText("Electronic signature", {
    x: margin,
    y,
    font: bold,
    size: 14,
    color: primary,
  });
  y -= 24;
  page.drawRectangle({
    x: margin,
    y: y - 72,
    width: contentWidth,
    height: 80,
    color: rgb(1, 1, 1),
    borderColor: border,
    borderWidth: 0.8,
  });
  if (signatureImage) {
    const fitted = signatureImage.scaleToFit(210, 46);
    page.drawImage(signatureImage, {
      x: margin + 16,
      y: y - 51,
      width: fitted.width,
      height: fitted.height,
    });
  } else {
    drawLines([text(input.signature) || "Signature recorded electronically"], {
      x: margin + 16,
      size: 12,
      font: regular,
      maxWidth: contentWidth - 32,
    });
  }
  page.drawText(`Signed by: ${text(input.signedName) || "Recorded signer"}`, {
    x: margin + 16,
    y: y - 64,
    font: bold,
    size: 9,
    color: ink,
    maxWidth: contentWidth - 32,
  });
  y -= 92;
  drawLines([
    "Electronically signed from the frozen seller signing pack. The server-rendered PDF stored with the listing is the authoritative signed copy.",
  ], { size: 8.5, color: muted, lineHeight: 12 });

  const digest = text(input.signingPackDigest);
  const brandingDigest = text(branding.digest);
  pages.forEach((currentPage, index) => {
    currentPage.drawLine({
      start: { x: margin, y: 48 },
      end: { x: pageWidth - margin, y: 48 },
      thickness: 0.6,
      color: border,
    });
    currentPage.drawText(
      `${agencyName} | Pack ${
        digest ? digest.slice(0, 16) : "unavailable"
      } | Brand ${
        brandingDigest ? brandingDigest.slice(0, 16) : "unavailable"
      }`,
      {
        x: margin,
        y: 31,
        font: regular,
        size: 7.5,
        color: muted,
        maxWidth: 370,
      },
    );
    currentPage.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: pageWidth - margin - 70,
      y: 31,
      font: regular,
      size: 7.5,
      color: muted,
    });
  });

  pdf.setTitle(descriptor.title);
  pdf.setAuthor(agencyName);
  pdf.setSubject("Server-rendered signed seller document");
  pdf.setKeywords([
    "Arch9",
    "seller",
    "signed",
    documentKey,
    text(branding.contract),
    brandingDigest,
  ].filter(Boolean));
  const metadataDate = new Date(input.signedAt);
  if (!Number.isNaN(metadataDate.getTime())) {
    pdf.setCreationDate(metadataDate);
    pdf.setModificationDate(metadataDate);
  }
  const bytes = await pdf.save({ useObjectStreams: true });
  return {
    bytes,
    fileName: descriptor.fileName,
    mediaType: "application/pdf",
    title: descriptor.title,
  };
}
