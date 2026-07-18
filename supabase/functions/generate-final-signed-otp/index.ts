import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

type JsonRecord = Record<string, unknown>;
const FINALISER_CONTRACT = "h4-v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "x-legal-finalizer-contract": FINALISER_CONTRACT } });
}

function logEvent(level: "info" | "error", message: string, details: JsonRecord = {}) {
  const payload = JSON.stringify({ level, message, function: "generate-final-signed-otp", ...details });
  if (level === "error") console.error(payload);
  else console.log(payload);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function authorizeFinalisation(req: Request, serviceClient: any, serviceKey: string, packet: JsonRecord) {
  const bearer = text(req.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  if (bearer === serviceKey) return { service: true, userId: null };
  if (!bearer) return null;
  const userResult = await serviceClient.auth.getUser(bearer);
  const userId = text(userResult.data?.user?.id);
  if (userResult.error || !userId) return null;
  const membership = await serviceClient.from("organisation_users").select("role, workspace_role, organisation_role, app_role, status, membership_status").eq("organisation_id", text(packet.organisation_id)).eq("user_id", userId).limit(1).maybeSingle();
  if (membership.error || !membership.data || !["active", "accepted"].includes(text(membership.data.status || membership.data.membership_status).toLowerCase())) return null;
  const roles = [membership.data.role, membership.data.workspace_role, membership.data.organisation_role, membership.data.app_role].map((value) => text(value).toLowerCase());
  const admin = roles.some((role) => ["principal", "owner", "admin", "super_admin", "branch_manager", "manager", "agency_admin", "agent_admin"].includes(role));
  if (!admin && text(packet.assigned_agent_id) !== userId && text(packet.created_by) !== userId) return null;
  return { service: false, userId };
}

async function dispatchFinalDelivery({ url, serviceKey, packetId, packetVersionId }: { url: string; serviceKey: string; packetId: string; packetVersionId: string }) {
  try {
    const result = await fetch(`${url.replace(/\/$/, "")}/functions/v1/dispatch-final-signed-document`, { method: "POST", headers: { "Content-Type": "application/json", "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` }, body: JSON.stringify({ packetId, packetVersionId }) });
    return await result.json().catch(() => ({ success: false, errorCode: `HTTP_${result.status}` }));
  } catch (error) { return { success: false, errorCode: "FINAL_DELIVERY_REQUEST_FAILED", error: String(error) }; }
}

function safe(value: unknown) {
  return text(value).replace(/\u00a0/g, " ").replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

function value(placeholders: JsonRecord, key: string) {
  return safe(placeholders[key] ?? placeholders[key.replace(/\./g, "_")]) || "Not provided";
}

function wrap(content: string, maxChars = 84) {
  const words = safe(content).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > maxChars) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function buckets(...items: (string | undefined)[]) {
  return [...new Set(items.flatMap((item) => String(item || "").split(",")).map(text).filter(Boolean))];
}

function pdfEscape(value: unknown) {
  return safe(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

type PdfImage = {
  name: string;
  role: string;
  label: string;
  width: number;
  height: number;
  data: Uint8Array;
  filter: "FlateDecode" | "DCTDecode";
  colorSpace: "DeviceRGB" | "DeviceGray";
  bitsPerComponent: number;
  hash: string;
  path: string;
  bucket: string;
};

function ascii(value: string) {
  return new TextEncoder().encode(value);
}

function concatBytes(...chunks: Uint8Array[]) {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function readUint32(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
}

function paeth(left: number, up: number, upperLeft: number) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

async function deflate(bytes: Uint8Array) {
  const copied = Uint8Array.from(bytes);
  const stream = new Blob([copied.buffer]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array) {
  const copied = Uint8Array.from(bytes);
  const stream = new Blob([copied.buffer]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decodePng(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) throw new Error("Signature asset is not a PNG.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  const idat: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = readUint32(data, 0);
      height = readUint32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += length + 12;
  }
  if (!width || !height || bitDepth !== 8 || interlace !== 0 || ![0, 2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG signature format (${width}x${height}, depth ${bitDepth}, color ${colorType}, interlace ${interlace}).`);
  }
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : 4;
  const rowLength = width * channels;
  const inflated = await inflate(concatBytes(...idat));
  if (inflated.length < (rowLength + 1) * height) throw new Error("PNG signature data is truncated.");
  const unfiltered = new Uint8Array(rowLength * height);
  let sourceOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[sourceOffset++];
    for (let column = 0; column < rowLength; column += 1) {
      const raw = inflated[sourceOffset++];
      const outputOffset = row * rowLength + column;
      const left = column >= channels ? unfiltered[outputOffset - channels] : 0;
      const up = row > 0 ? unfiltered[outputOffset - rowLength] : 0;
      const upperLeft = row > 0 && column >= channels ? unfiltered[outputOffset - rowLength - channels] : 0;
      if (filter === 0) unfiltered[outputOffset] = raw;
      else if (filter === 1) unfiltered[outputOffset] = (raw + left) & 255;
      else if (filter === 2) unfiltered[outputOffset] = (raw + up) & 255;
      else if (filter === 3) unfiltered[outputOffset] = (raw + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) unfiltered[outputOffset] = (raw + paeth(left, up, upperLeft)) & 255;
      else throw new Error(`Unsupported PNG filter ${filter}.`);
    }
  }
  const rgb = new Uint8Array(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (colorType === 0) {
      const gray = unfiltered[pixel];
      rgb.set([gray, gray, gray], pixel * 3);
    } else if (colorType === 2) {
      rgb.set(unfiltered.subarray(pixel * 3, pixel * 3 + 3), pixel * 3);
    } else {
      const input = pixel * 4;
      const alpha = unfiltered[input + 3] / 255;
      rgb[pixel * 3] = Math.round(unfiltered[input] * alpha + 255 * (1 - alpha));
      rgb[pixel * 3 + 1] = Math.round(unfiltered[input + 1] * alpha + 255 * (1 - alpha));
      rgb[pixel * 3 + 2] = Math.round(unfiltered[input + 2] * alpha + 255 * (1 - alpha));
    }
  }
  return { width, height, data: await deflate(rgb), filter: "FlateDecode" as const, colorSpace: "DeviceRGB" as const, bitsPerComponent: 8 };
}

function decodeJpeg(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Signature asset is not a JPEG.");
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const components = bytes[offset + 7];
      return { width, height, data: bytes, filter: "DCTDecode" as const, colorSpace: components === 1 ? "DeviceGray" as const : "DeviceRGB" as const, bitsPerComponent: 8 };
    }
    if (length < 2) break;
    offset += length;
  }
  throw new Error("JPEG signature dimensions could not be read.");
}

async function imageFingerprint(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer));
  return Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loadSignatureImages({ supabase, packetId, fields, signers }: { supabase: any; packetId: string; fields: JsonRecord[]; signers: JsonRecord[] }) {
  const bucketCandidates = buckets(Deno.env.get("SIGNATURES_BUCKET"), Deno.env.get("SUPABASE_SIGNATURES_BUCKET"), Deno.env.get("SUPABASE_DOCUMENTS_BUCKET"), Deno.env.get("SUPABASE_DOCUMENT_BUCKET"), Deno.env.get("DOCUMENTS_BUCKET"), "document-signatures", "documents");
  const images: PdfImage[] = [];
  const uniqueFields = fields.filter((field, index, rows) => rows.findIndex((candidate) => text(candidate.signer_role) === text(field.signer_role)) === index);
  for (const [index, field] of uniqueFields.entries()) {
    const path = text(field.signature_asset_path);
    let assetBytes: Uint8Array | null = null;
    let assetBucket = "";
    for (const bucket of bucketCandidates) {
      const download = await supabase.storage.from(bucket).download(path);
      if (!download.error && download.data) {
        assetBytes = new Uint8Array(await download.data.arrayBuffer());
        assetBucket = bucket;
        break;
      }
    }
    if (!assetBytes || !assetBucket) throw new Error(`Unable to download required signature asset for ${text(field.signer_role) || "signer"}.`);
    const decoded = assetBytes[0] === 0x89 ? await decodePng(assetBytes) : decodeJpeg(assetBytes);
    const signer = signers.find((candidate) => text(candidate.signer_role) === text(field.signer_role));
    images.push({
      ...decoded,
      name: `Im${index + 1}`,
      role: text(field.signer_role),
      label: safe(signer?.signer_name) || safe(field.signer_role).replace(/_/g, " "),
      hash: await imageFingerprint(assetBytes),
      path,
      bucket: assetBucket,
    });
  }
  if (images.length !== uniqueFields.length || images.length === 0) throw new Error("Every required signer must have an embeddable signature image.");
  return images;
}

function buildPdf(placeholders: JsonRecord, packetId: string, signers: JsonRecord[], signatureImages: PdfImage[]) {
  const groups = [
    ["Offer to Purchase", [["Property", "property_address"], ["Agency", "organisation_name"], ["Agent", "agent_full_name"], ["Purchaser", "buyer_full_name"], ["Purchaser ID / registration", "buyer_id_number"], ["Purchaser email", "buyer_email"], ["Seller", "seller_full_name"], ["Seller ID / registration", "seller_id_number"], ["Seller email", "seller_email"]], ["This Offer to Purchase becomes a deed of sale when accepted by the Seller in writing. The schedules, terms, special conditions and annexures form one agreement."]],
    ["Property and Purchase Price", [["Address", "property_address"], ["Suburb", "property_suburb"], ["City", "property_city"], ["Property type", "property_type"], ["Unit / section", "property_unit_number"], ["Scheme / complex", "property_complex_name"], ["Purchase price", "purchase_price"], ["Deposit", "deposit_amount"]], ["The Purchase Price is payable in accordance with the accepted offer, guarantees, bond approval, cash undertakings and conveyancer requirements."]],
    ["Finance, Occupation and Transfer", [["Finance type", "finance_type"], ["Bond amount", "bond_amount"], ["Cash contribution", "cash_amount"], ["Occupation date", "occupation_date"], ["Expected transfer date", "transfer_date"]], [value(placeholders, "suspensive_conditions"), "Risk, benefits and obligations transfer according to the final agreement terms and applicable conveyancing requirements."]],
    ["Authority and Commission", [["Seller representative", "seller_representative_name"], ["Representative capacity", "seller_representative_capacity"], ["Resolution date", "seller_resolution_date"], ["Authority basis", "seller_authority_basis"], ["Commission percentage", "gross_commission_percentage"], ["Gross commission", "gross_commission_amount"], ["Agency commission", "agency_commission_amount"], ["Agent commission", "agent_commission_amount"]], ["Each party warrants that they have the necessary capacity and authority to sign this agreement. Commission is earned and payable according to the accepted offer and applicable agency agreement."]],
    ["Special and General Terms", [["Special conditions", "special_conditions"], ["Annexures", "annexures_list"]], ["The Property is sold with fixtures and fittings of a permanent nature unless expressly excluded.", "No amendment or cancellation is valid unless reduced to writing and signed or accepted by the parties as required.", "The parties consent to processing of personal information required for conveyancing, finance, verification and transaction administration."]],
    ["Signatures", [["Purchaser", "buyer_full_name"], ["Seller", "seller_full_name"], ["Agency", "organisation_name"], ["Agent", "agent_full_name"]], ["The parties confirm that they have read, understood and accepted this agreement and its annexures."]],
  ] as Array<[string, Array<[string, string]>, string[]]>;

  const pages = groups.map(([title, fields, terms], index) => {
    const lines: Array<{ text: string; size: number; bold?: boolean }> = [
      { text: "OFFER TO PURCHASE | FINAL SIGNED COPY", size: 8, bold: true },
      { text: title.toUpperCase(), size: index === 0 ? 22 : 18, bold: true },
      { text: "", size: 10 },
    ];
    for (const [label, key] of fields) {
      const wrapped = wrap(`${label}: ${value(placeholders, key)}`).slice(0, 3);
      wrapped.forEach((line) => lines.push({ text: line, size: 10 }));
    }
    for (const term of terms) {
      lines.push({ text: "", size: 9 });
      wrap(term).forEach((line) => lines.push({ text: line, size: 9 }));
    }
    if (index === 5) {
      lines.push({ text: "", size: 10 });
      lines.push({ text: "DIGITAL SIGNATURE EVIDENCE", size: 13, bold: true });
      signers.forEach((signer) => {
        lines.push({
          text: `${safe(signer.signer_role).replace(/_/g, " ").toUpperCase()}: ${safe(signer.signer_name)} | ${safe(signer.signer_email)} | Signed ${safe(signer.signed_at)}`,
          size: 9,
        });
      });
      lines.push({ text: "Stored signature assets and field-level completion records are linked to this packet version in the audit trail.", size: 9 });
    }
    lines.push({ text: "", size: 8 });
    lines.push({ text: `Packet ${packetId} | Page ${index + 1} of 6`, size: 8 });
    return lines;
  });

  const objects: Array<string | Uint8Array> = [];
  const pageCount = pages.length;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, index) => `${4 + index} 0 R`).join(" ")}] /Count ${pageCount} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const firstImageObject = 4 + pageCount * 2;
  for (let index = 0; index < pageCount; index += 1) {
    const pageObject = 4 + index;
    const contentObject = 4 + pageCount + index;
    const xObjects = index === 5 && signatureImages.length
      ? ` /XObject << ${signatureImages.map((image, imageIndex) => `/${image.name} ${firstImageObject + imageIndex} 0 R`).join(" ")} >>`
      : "";
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >>${xObjects} >> /Contents ${contentObject} 0 R >>`;
    let y = 750;
    const pageCommands = pages[index].map((line) => {
      const safeLine = pdfEscape(line.text);
      const leading = line.size >= 18 ? 34 : line.size >= 12 ? 24 : 16;
      const command = `BT /F1 ${line.size} Tf 54 ${y} Td (${safeLine}) Tj ET`;
      y -= leading;
      return command;
    });
    if (index === 5) {
      pageCommands.push("BT /F1 11 Tf 54 275 Td (VISIBLE SIGNATURE MARKS) Tj ET");
      signatureImages.slice(0, 3).forEach((image, imageIndex) => {
        const x = 54 + imageIndex * 174;
        const boxWidth = 150;
        const boxHeight = 54;
        const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
        const width = Math.max(1, image.width * scale);
        const height = Math.max(1, image.height * scale);
        pageCommands.push(`BT /F1 8 Tf ${x} 253 Td (${pdfEscape(`${safe(image.role).replace(/_/g, " ").toUpperCase()}: ${image.label}`)}) Tj ET`);
        pageCommands.push(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x} 190 cm /${image.name} Do Q`);
        pageCommands.push(`BT /F1 6 Tf ${x} 178 Td (SHA-256 ${image.hash.slice(0, 16)}) Tj ET`);
      });
    }
    const commands = pageCommands.join("\n");
    objects[contentObject] = `<< /Length ${ascii(commands).length} >>\nstream\n${commands}\nendstream`;
  }
  signatureImages.forEach((image, index) => {
    const dictionary = `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /${image.colorSpace} /BitsPerComponent ${image.bitsPerComponent} /Filter /${image.filter} /Length ${image.data.length} >>\nstream\n`;
    objects[firstImageObject + index] = concatBytes(ascii(dictionary), image.data, ascii("\nendstream"));
  });
  const chunks: Uint8Array[] = [ascii("%PDF-1.4\n")];
  let pdfLength = chunks[0].length;
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = pdfLength;
    const objectBytes = typeof objects[index] === "string" ? ascii(objects[index] as string) : objects[index] as Uint8Array;
    const chunk = concatBytes(ascii(`${index} 0 obj\n`), objectBytes, ascii("\nendobj\n"));
    chunks.push(chunk);
    pdfLength += chunk.length;
  }
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${pdfLength}\n%%EOF`;
  chunks.push(ascii(xref));
  return concatBytes(...chunks);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return response(405, { success: false, error: "Method not allowed." });
  const startedAt = Date.now();
  const requestId = text(req.headers.get("x-request-id") || req.headers.get("sb-request-id")) || crypto.randomUUID();
  let observedPacketId = "";
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !serviceKey) return response(500, { success: false, error: "Missing Supabase configuration." });
    const payload = await req.json() as JsonRecord;
    const packetId = text(payload.packetId || payload.packet_id);
    observedPacketId = packetId;
    const requestedVersionId = text(payload.packetVersionId || payload.packet_version_id);
    let finalisedBy = text(payload.finalisedBy || payload.finalised_by) || null;
    if (!packetId) return response(400, { success: false, error: "packetId is required.", errorCode: "MISSING_PACKET_ID" });
    if (!requestedVersionId) return response(400, { success: false, error: "packetVersionId is required for exact-version finalisation.", errorCode: "FINAL_VERSION_ID_REQUIRED" });
    logEvent("info", "otp_finalisation_started", { requestId, packetId });
    const supabase = createClient(url, serviceKey);
    const packetResult = await supabase.from("document_packets").select("id, organisation_id, packet_type, transaction_id, assigned_agent_id, created_by, status, current_version_number, source_context_json").eq("id", packetId).maybeSingle();
    if (packetResult.error) throw packetResult.error;
    const packet = packetResult.data as JsonRecord | null;
    if (!packet || text(packet.packet_type).toLowerCase() !== "otp") return response(400, { success: false, error: "OTP packet not found.", errorCode: "OTP_PACKET_NOT_FOUND" });
    const authority = await authorizeFinalisation(req, supabase, serviceKey, packet);
    if (!authority) return response(403, { success: false, error: "You are not allowed to finalise this OTP.", errorCode: "FINALISATION_FORBIDDEN" });
    if (!authority.service) finalisedBy = authority.userId;
    const versionQuery = supabase.from("document_packet_versions").select("id, packet_id, organisation_id, version_number, render_status, validation_summary_json, final_signed_file_path, final_signed_file_bucket, final_signed_file_name, finalised_at, placeholders_resolved_json").eq("packet_id", packetId).eq("id", requestedVersionId).limit(1);
    const versionResult = await versionQuery.maybeSingle();
    if (versionResult.error) throw versionResult.error;
    const version = versionResult.data as JsonRecord | null;
    if (!version) return response(400, { success: false, error: "Generated OTP version not found.", errorCode: "NO_GENERATED_VERSION" });
    const finalVersionBindingValid = text(version.organisation_id) === text(packet.organisation_id) && Number(version.version_number) === Number(packet.current_version_number) && text(version.render_status).toLowerCase() === "generated" && ["sent", "partially_signed", "completed"].includes(text(packet.status).toLowerCase());
    if (!finalVersionBindingValid) return response(409, { success: false, error: "Finalisation is not bound to the exact current generated OTP version.", errorCode: "FINAL_VERSION_BINDING_INVALID" });
    if (text(version.final_signed_file_path)) {
      const existingEvidenceResult = await supabase.from("legal_final_artifact_evidence").select("bucket, path, file_name, media_type, sha256, byte_length, generated_at").eq("packet_version_id", requestedVersionId).maybeSingle();
      if (existingEvidenceResult.error) throw existingEvidenceResult.error;
      const existingEvidence = existingEvidenceResult.data as JsonRecord | null;
      if (!existingEvidence || text(existingEvidence.path) !== text(version.final_signed_file_path)) return response(409, { success: false, error: "Existing final OTP has no matching F2 evidence.", errorCode: "FINAL_ARTIFACT_EVIDENCE_MISSING" });
      const existingDownload = await supabase.storage.from(text(existingEvidence.bucket)).download(text(existingEvidence.path));
      if (existingDownload.error || !existingDownload.data) return response(409, { success: false, error: "Existing final OTP cannot be read.", errorCode: "FINAL_ARTIFACT_UNREADABLE" });
      const existingBytes = new Uint8Array(await existingDownload.data.arrayBuffer());
      if (await imageFingerprint(existingBytes) !== text(existingEvidence.sha256) || existingBytes.length !== Number(existingEvidence.byte_length)) return response(409, { success: false, error: "Existing final OTP bytes do not match F2 evidence.", errorCode: "FINAL_ARTIFACT_INTEGRITY_MISMATCH" });
      const finalDelivery = await dispatchFinalDelivery({ url, serviceKey, packetId, packetVersionId: requestedVersionId });
      return response(200, { success: true, packetId, packetVersionId: version.id, finalArtifact: { bucket: version.final_signed_file_bucket, path: version.final_signed_file_path, fileName: version.final_signed_file_name, finalisedAt: version.finalised_at, sha256: existingEvidence.sha256, byteLength: existingEvidence.byte_length }, finalDelivery, version, note: "Final signed OTP already exists and passed F2 integrity verification." });
    }

    const signersResult = await supabase.from("document_packet_signers").select("id, signer_role, signer_name, signer_email, status, signed_at").eq("packet_id", packetId).eq("packet_version_id", version.id);
    const fieldsResult = await supabase.from("document_signing_fields").select("id, signer_role, signer_email, field_type, required, status, signature_asset_path").eq("packet_id", packetId).eq("packet_version_id", version.id).eq("required", true);
    if (signersResult.error) throw signersResult.error;
    if (fieldsResult.error) throw fieldsResult.error;
    const signers = (signersResult.data || []) as JsonRecord[];
    const fields = (fieldsResult.data || []) as JsonRecord[];
    if (!signers.length || signers.some((row) => text(row.status).toLowerCase() !== "signed")) return response(400, { success: false, error: "Required OTP signers are incomplete.", errorCode: "SIGNERS_INCOMPLETE" });
    if (!fields.length || fields.some((row) => text(row.status).toLowerCase() !== "completed" || (["signature", "initial"].includes(text(row.field_type).toLowerCase()) && !text(row.signature_asset_path)))) return response(400, { success: false, error: "Required OTP signing fields are incomplete.", errorCode: "FIELDS_INCOMPLETE" });
    const misScopedAssets = fields.filter((field) => {
      if (!["signature", "initial"].includes(text(field.field_type).toLowerCase())) return false;
      const fieldRole = text(field.signer_role).toLowerCase();
      const fieldEmail = text(field.signer_email).toLowerCase();
      const matchingSigner = signers.find((signer) => text(signer.signer_role).toLowerCase() === fieldRole && (!fieldEmail || text(signer.signer_email).toLowerCase() === fieldEmail));
      return !matchingSigner || !text(field.signature_asset_path).startsWith(`document-signatures/${packetId}/${text(matchingSigner.id)}/`);
    });
    if (misScopedAssets.length) return response(403, { success: false, error: "A required OTP signing asset is outside its signer-owned storage namespace.", errorCode: "SIGNATURE_ASSET_SCOPE_INVALID" });
    const signatureFields = fields.filter((row) => text(row.field_type).toLowerCase() === "signature");
    if (!signatureFields.length) return response(400, { success: false, error: "Required OTP signature fields are missing.", errorCode: "FIELDS_INCOMPLETE" });

    let signatureImages: PdfImage[];
    try {
      signatureImages = await loadSignatureImages({ supabase, packetId, fields: signatureFields, signers });
    } catch (assetError) {
      logEvent("error", "otp_signature_embedding_failed", { requestId, packetId, error: String(assetError), durationMs: Date.now() - startedAt });
      return response(422, {
        success: false,
        error: "Every required signature asset must be readable and embeddable before finalisation.",
        errorCode: "SIGNATURE_ASSET_EMBED_FAILED",
        details: String(assetError),
      });
    }
    const finalBytes = buildPdf((version.placeholders_resolved_json || {}) as JsonRecord, packetId, signers, signatureImages);
    const finalisedAt = new Date().toISOString();
    const finalArtifactSha256 = await imageFingerprint(finalBytes);
    const signerEvidenceSha256 = await imageFingerprint(new TextEncoder().encode(JSON.stringify(signers.map((signer) => ({ id: text(signer.id), role: text(signer.signer_role).toLowerCase(), email: text(signer.signer_email).toLowerCase(), status: text(signer.status).toLowerCase(), signedAt: text(signer.signed_at) })).sort((a, b) => a.id.localeCompare(b.id)))));
    const fieldEvidenceSha256 = await imageFingerprint(new TextEncoder().encode(JSON.stringify(fields.map((field) => ({ id: text(field.id), role: text(field.signer_role).toLowerCase(), email: text(field.signer_email).toLowerCase(), type: text(field.field_type).toLowerCase(), status: text(field.status).toLowerCase(), assetPath: text(field.signature_asset_path) })).sort((a, b) => a.id.localeCompare(b.id)))));
    const fileName = `otp-v${Number(version.version_number) || 1}-final-signed.pdf`;
    const path = `signed-documents/${packetId}/${version.id}/${Date.now()}-${fileName}`;
    const outputBuckets = buckets(Deno.env.get("SIGNED_DOCUMENTS_BUCKET"), Deno.env.get("SUPABASE_SIGNED_DOCUMENTS_BUCKET"), Deno.env.get("SUPABASE_DOCUMENTS_BUCKET"), "documents");
    let uploadedBucket = "";
    for (const bucket of outputBuckets) {
      const upload = await supabase.storage.from(bucket).upload(path, finalBytes, { contentType: "application/pdf", upsert: true });
      if (!upload.error) { uploadedBucket = bucket; break; }
    }
    if (!uploadedBucket) return response(500, { success: false, error: "Unable to store final signed OTP.", errorCode: "FINAL_SIGNED_UPLOAD_FAILED" });
    const update = await supabase.rpc("bridge_record_final_artifact_f2", { p_organisation_id: text(packet.organisation_id), p_packet_id: packetId, p_packet_version_id: text(version.id), p_bucket: uploadedBucket, p_path: path, p_file_name: fileName, p_sha256: finalArtifactSha256, p_byte_length: finalBytes.length, p_signer_evidence_sha256: signerEvidenceSha256, p_field_evidence_sha256: fieldEvidenceSha256, p_generated_at: finalisedAt, p_event_type: "final_signed_otp_generated", p_event_payload: { generatedFilePath: path, generatedFileBucket: uploadedBucket, signerCount: signers.length, fieldCount: fields.length, embeddedSignatureCount: signatureImages.length, signatureEvidenceMode: "visual_and_audit", signatureAssetFingerprints: signatureImages.map((image) => ({ role: image.role, sha256: image.hash, path: image.path, bucket: image.bucket })), finalArtifactSha256, finalArtifactByteLength: finalBytes.length, signerEvidenceSha256, fieldEvidenceSha256, generatedAt: finalisedAt }, p_finalised_by: finalisedBy, p_final_signed_document_id: null });
    if (update.error) throw update.error;
    const signedUrl = await supabase.storage.from(uploadedBucket).createSignedUrl(path, 3600);
    const finalDelivery = await dispatchFinalDelivery({ url, serviceKey, packetId, packetVersionId: text(version.id) });
    logEvent("info", "otp_finalisation_completed", { requestId, packetId, packetVersionId: version.id, durationMs: Date.now() - startedAt, embeddedSignatureCount: signatureImages.length, signatureEvidenceMode: "visual_and_audit", outputBytes: finalBytes.length });
    return response(200, { success: true, packetId, packetVersionId: version.id, finalArtifact: { bucket: uploadedBucket, path, url: signedUrl.data?.signedUrl || null, fileName, finalisedAt, finalisedBy, embeddedSignatureCount: signatureImages.length, signatureEvidenceMode: "visual_and_audit", sha256: finalArtifactSha256, byteLength: finalBytes.length }, finalDelivery, version: update.data, sourceFormat: "otp_structured_pdf_with_visual_signatures" });
  } catch (error) {
    logEvent("error", "otp_finalisation_failed", { requestId, packetId: observedPacketId || null, error: String(error), durationMs: Date.now() - startedAt });
    return response(500, { success: false, error: String(error), errorCode: "FINAL_SIGNED_OTP_GENERATION_FAILED" });
  }
});
