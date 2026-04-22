import { normalizeText } from "./text.ts";

export function resolveAppBaseUrl(req: Request) {
  const envCandidates = [
    Deno.env.get("CLIENT_APP_URL"),
    Deno.env.get("PUBLIC_APP_URL"),
    Deno.env.get("APP_BASE_URL"),
    Deno.env.get("SITE_URL"),
  ];

  for (const candidate of envCandidates) {
    const normalized = normalizeText(candidate);
    if (normalized) {
      return normalized.replace(/\/+$/, "");
    }
  }

  const origin = normalizeText(req.headers.get("origin"));
  if (origin) {
    return origin.replace(/\/+$/, "");
  }

  const referer = normalizeText(req.headers.get("referer"));
  if (referer) {
    try {
      const parsed = new URL(referer);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      // Ignore malformed referer header.
    }
  }

  return "";
}
