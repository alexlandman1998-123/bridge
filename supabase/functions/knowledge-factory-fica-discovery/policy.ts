export const UAT_GRAPHQL_ENDPOINT =
  "https://propinfoapi.co.za/live/uat/graphql/";

export type DiscoveryAction = { action: "probe" } | { action: "roots" } | {
  action: "type";
  typeName: string;
};

export function parseDiscoveryAction(value: unknown): DiscoveryAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.action === "probe" && Object.keys(body).length === 1) {
    return { action: "probe" };
  }
  if (body.action === "roots" && Object.keys(body).length === 1) {
    return { action: "roots" };
  }
  if (
    body.action === "type" && Object.keys(body).length === 2 &&
    typeof body.typeName === "string" &&
    /^[A-Za-z_][A-Za-z_0-9]{0,79}$/.test(body.typeName)
  ) {
    return { action: "type", typeName: body.typeName };
  }
  return null;
}

export async function matchesOperatorKey(
  provided: string,
  expected: string,
): Promise<boolean> {
  if (!provided || !expected) return false;
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

/** Only use after the Edge Function gateway has verified the JWT signature. */
export function hasServiceRoleClaim(bearer: string): boolean {
  const parts = bearer.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as Record<string, unknown>;
    return payload.iss === "supabase" && payload.role === "service_role" &&
      typeof payload.exp === "number" && payload.exp > Date.now() / 1_000;
  } catch {
    return false;
  }
}
