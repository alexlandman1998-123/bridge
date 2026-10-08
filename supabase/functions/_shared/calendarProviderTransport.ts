export type Provider = "google" | "outlook";
// Provider JSON has optional vendor fields; all security boundaries validate them below.
// deno-lint-ignore no-explicit-any
export type Data = Record<string, any>;
export type ProviderConfig = {
  googleClientId: string;
  googleClientSecret: string;
  microsoftClientId: string;
  microsoftClientSecret: string;
  microsoftTenant: string;
  appUrl: string;
  supabaseUrl: string;
  encryptionKey: string;
};
export const COPY_PROPERTY =
  "String {91233dd2-1f04-4ae6-b6ca-814742ea80ea} Name Arch9CalendarCopy";
const SOURCE_PROPERTY =
  "String {91233dd2-1f04-4ae6-b6ca-814742ea80ea} Name Arch9CalendarSource";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";
export const scopes = (provider: Provider) =>
  provider === "google"
    ? `openid email ${GOOGLE_SCOPE}`
    : "openid profile offline_access User.Read Calendars.ReadWrite";
export const text = (value: unknown) => String(value ?? "").trim();
export class ProviderError extends Error {
  constructor(public code: string, public retryAfter = 0) {
    super(code);
  }
}
function base64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
export function randomToken() {
  return base64(crypto.getRandomValues(new Uint8Array(48))).replace(/\+/g, "-")
    .replace(/\//g, "_").replace(/=+$/, "");
}
export async function hash(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ].map((n) => n.toString(16).padStart(2, "0")).join("");
}
function key(raw: string) {
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  } catch {
    throw new ProviderError("encryption_configuration_missing");
  }
  if (bytes.length !== 32) {
    throw new ProviderError("encryption_configuration_missing");
  }
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(bytes).buffer,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptCredential(
  credential: Data,
  connectionId: string,
  secret: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(connectionId),
    },
    await key(secret),
    new TextEncoder().encode(JSON.stringify(credential)),
  );
  return { v: 1, iv: base64(iv), ciphertext: base64(new Uint8Array(cipher)) };
}
export async function decryptCredential(
  envelope: Data,
  connectionId: string,
  secret: string,
): Promise<Data> {
  try {
    if (envelope.v !== 1) throw new Error("version");
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Uint8Array.from(atob(envelope.iv), (c) => c.charCodeAt(0)),
        additionalData: new TextEncoder().encode(connectionId),
      },
      await key(secret),
      Uint8Array.from(atob(envelope.ciphertext), (c) => c.charCodeAt(0)),
    );
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new ProviderError("credential_unavailable");
  }
}
export function safeReturnUrl(path: string, appUrl: string) {
  const origin = new URL(appUrl);
  if (origin.protocol !== "https:" || origin.username || origin.password) {
    throw new ProviderError("app_configuration_missing");
  }
  const result = new URL(path || "/pipeline/calendar", origin.origin);
  if (
    result.origin !== origin.origin || !path.startsWith("/") ||
    path.startsWith("//") || path.includes("\\")
  ) throw new ProviderError("invalid_return_path");
  result.hash = "";
  return result.href;
}
export function callbackUrl(provider: Provider, config: ProviderConfig) {
  const origin = new URL(config.supabaseUrl);
  if (origin.protocol !== "https:" || origin.username || origin.password) {
    throw new ProviderError("provider_configuration_missing");
  }
  return `${origin.origin}/functions/v1/calendar-provider-connection?provider=${provider}`;
}
export function configured(provider: Provider, config: ProviderConfig) {
  if (
    provider === "google" &&
      (!config.googleClientId || !config.googleClientSecret) ||
    provider === "outlook" &&
      (!config.microsoftClientId || !config.microsoftClientSecret ||
        !/^[a-zA-Z0-9-]+$/.test(config.microsoftTenant))
  ) throw new ProviderError("provider_configuration_missing");
}
export async function authorizationUrl(
  provider: Provider,
  state: string,
  verifier: string,
  config: ProviderConfig,
) {
  configured(provider, config);
  const challenge = base64(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  ).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const params = new URLSearchParams({
    client_id: provider === "google"
      ? config.googleClientId
      : config.microsoftClientId,
    redirect_uri: callbackUrl(provider, config),
    response_type: "code",
    scope: scopes(provider),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (provider === "google") {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  } else params.set("response_mode", "query");
  return (provider === "google"
    ? "https://accounts.google.com/o/oauth2/v2/auth"
    : `https://login.microsoftonline.com/${config.microsoftTenant}/oauth2/v2.0/authorize`) +
    `?${params}`;
}
async function request(url: string, init: RequestInit, fetcher: typeof fetch) {
  const response = await fetcher(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok && ![404, 410, 409, 412].includes(response.status)) {
    let code = "provider_unavailable";
    if ([401, 403].includes(response.status)) code = "authorization_expired";
    const raw = response.headers.get("retry-after");
    const retry = raw && /^\d+$/.test(raw) ? Math.min(3600, Number(raw)) : 0;
    throw new ProviderError(code, retry);
  }
  return response;
}
async function tokens(
  provider: Provider,
  body: URLSearchParams,
  config: ProviderConfig,
  fetcher: typeof fetch,
) {
  configured(provider, config);
  body.set(
    "client_id",
    provider === "google" ? config.googleClientId : config.microsoftClientId,
  );
  body.set(
    "client_secret",
    provider === "google"
      ? config.googleClientSecret
      : config.microsoftClientSecret,
  );
  const url = provider === "google"
    ? "https://oauth2.googleapis.com/token"
    : `https://login.microsoftonline.com/${config.microsoftTenant}/oauth2/v2.0/token`;
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const token = await response.json().catch(() => ({}));
  if (!response.ok || !text(token.access_token)) {
    throw new ProviderError("authorization_expired");
  }
  return {
    ...token,
    expiresAt: new Date(
      Date.now() + Math.max(0, Number(token.expires_in) || 0) * 1000,
    ).toISOString(),
  };
}
export async function exchangeCode(
  provider: Provider,
  code: string,
  verifier: string,
  config: ProviderConfig,
  fetcher: typeof fetch = fetch,
) {
  const token = await tokens(
    provider,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: callbackUrl(provider, config),
    }),
    config,
    fetcher,
  );
  if (
    !text(token.refresh_token) ||
    !text(token.scope).split(/\s+/).includes(
      provider === "google" ? GOOGLE_SCOPE : "Calendars.ReadWrite",
    )
  ) throw new ProviderError("calendar_permission_missing");
  const url = provider === "google"
    ? "https://openidconnect.googleapis.com/v1/userinfo"
    : "https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName";
  const response = await request(url, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  }, fetcher);
  const account = await response.json();
  const id = provider === "google" ? text(account.sub) : text(account.id);
  const label = provider === "google"
    ? text(account.email)
    : text(account.mail || account.userPrincipalName);
  if (
    !id || !label || provider === "google" && account.email_verified !== true
  ) throw new ProviderError("account_verification_failed");
  return { token, accountId: id, accountLabel: label };
}
export async function refreshCredential(
  provider: Provider,
  credential: Data,
  config: ProviderConfig,
  fetcher: typeof fetch = fetch,
): Promise<Data> {
  if (Date.parse(credential.expiresAt) > Date.now() + 60000) return credential;
  if (!text(credential.refresh_token)) {
    throw new ProviderError("authorization_expired");
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: credential.refresh_token,
  });
  if (provider === "outlook") body.set("scope", scopes(provider));
  const token = await tokens(provider, body, config, fetcher);
  return {
    ...credential,
    ...token,
    refresh_token: text(token.refresh_token) || credential.refresh_token,
  };
}
function iso(value: unknown) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    throw new ProviderError("schedule_needs_review");
  }
  const instant = new Date(raw);
  if (!Number.isFinite(instant.getTime())) {
    throw new ProviderError("schedule_needs_review");
  }
  return instant.toISOString();
}
export function eventPayload(
  provider: Provider,
  source: Data,
  copyKey: string,
  sourceHash: string,
  appUrl: string,
): Data {
  if (
    !/^[a-f0-9-]{36}$/.test(copyKey) || !source.appointmentId ||
    !source.timezone
  ) throw new ProviderError("invalid_copy_identity");
  const start = iso(source.start), end = iso(source.end);
  if (Date.parse(end) <= Date.parse(start)) {
    throw new ProviderError("schedule_needs_review");
  }
  const body =
    `Arch9 appointment (${source.status}).\nManage this appointment in Arch9: ${
      new URL("/pipeline/calendar", appUrl).href
    }\n${text(source.meetingUrl)}`.trim();
  if (provider === "google") {
    return {
      id: "arch9" + copyKey.replaceAll("-", ""),
      summary: source.title,
      description: body,
      location: source.location,
      start: source.allDay
        ? { date: source.date }
        : { dateTime: start, timeZone: source.timezone },
      end: source.allDay
        ? { date: source.endDate }
        : { dateTime: end, timeZone: source.timezone },
      attendees: [],
      reminders: { useDefault: false, overrides: [] },
      visibility: "private",
      transparency: source.busy ? "opaque" : "transparent",
      extendedProperties: {
        private: { arch9CopyKey: copyKey, arch9SourceHash: sourceHash },
      },
    };
  }
  return {
    subject: source.title,
    body: { contentType: "Text", content: body },
    location: { displayName: source.location },
    start: {
      dateTime: source.allDay
        ? `${source.date}T00:00:00`
        : start.replace(/Z$/, ""),
      timeZone: source.allDay ? source.timezone : "UTC",
    },
    end: {
      dateTime: source.allDay
        ? `${source.endDate}T00:00:00`
        : end.replace(/Z$/, ""),
      timeZone: source.allDay ? source.timezone : "UTC",
    },
    isAllDay: source.allDay,
    attendees: [],
    isReminderOn: false,
    showAs: source.busy ? "busy" : "free",
    sensitivity: "private",
    transactionId: copyKey,
    singleValueExtendedProperties: [{ id: COPY_PROPERTY, value: copyKey }, {
      id: SOURCE_PROPERTY,
      value: sourceHash,
    }],
  };
}
function utcParts(value: Data) {
  if (!value) return "";
  const raw = text(value.dateTime);
  if (value.timeZone === "UTC") {
    return iso(/(?:Z|[+-]\d{2}:\d{2})$/.test(raw) ? raw : raw + "Z");
  }
  // All-day comparisons use their civil date, irrespective of Windows/IANA aliases.
  return raw.slice(0, 10);
}
function allDayDate(value: Data, timezone: string) {
  if (value?.timeZone !== "UTC") return text(value?.dateTime).slice(0, 10);
  const instant = utcParts(value);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function normalizedEvent(
  provider: Provider,
  event: Data,
  timezone = "Africa/Johannesburg",
): Data {
  if (provider === "google") {
    return {
      title: text(event.summary),
      body: text(event.description),
      location: text(event.location),
      start: event.start?.date || iso(event.start?.dateTime),
      end: event.end?.date || iso(event.end?.dateTime),
      allDay: Boolean(event.start?.date),
      busy: event.transparency !== "transparent",
      reminders: event.reminders?.useDefault === true ||
        (event.reminders?.overrides?.length || 0) > 0,
      attendees: event.attendees?.length || 0,
      private: event.visibility === "private",
    };
  }
  return {
    title: text(event.subject),
    body: text(event.body?.content),
    location: text(event.location?.displayName),
    start: event.isAllDay
      ? allDayDate(event.start, timezone)
      : utcParts(event.start),
    end: event.isAllDay ? allDayDate(event.end, timezone) : utcParts(event.end),
    allDay: event.isAllDay === true,
    busy: event.showAs !== "free",
    reminders: event.isReminderOn === true,
    attendees: event.attendees?.length || 0,
    private: event.sensitivity === "private",
  };
}
const owns = (provider: Provider, event: Data, copyKey: string) =>
  provider === "google"
    ? event.extendedProperties?.private?.arch9CopyKey === copyKey
    : event.singleValueExtendedProperties?.some((p: Data) =>
      p.id === COPY_PROPERTY && p.value === copyKey
    );
const remoteVersion = (provider: Provider, event: Data) =>
  text(provider === "google" ? event.etag : event["@odata.etag"]);
function observed(provider: Provider, event: Data | null) {
  if (!event || event.status === "cancelled" || event.isCancelled === true) {
    return { deleted: true };
  }
  return {
    deleted: false,
    title: text(provider === "google" ? event.summary : event.subject),
    start: provider === "google"
      ? event.start?.dateTime || event.start?.date
      : event.start?.dateTime,
    end: provider === "google"
      ? event.end?.dateTime || event.end?.date
      : event.end?.dateTime,
  };
}
// Inspect only managed IDs (or our exact Outlook copy property); no personal
// mailbox inventory, webhook URL, arbitrary nextLink or browser URL is fetched.
export async function syncProviderEvent(
  provider: Provider,
  job: Data,
  token: string,
  appUrl: string,
  valid: () => Promise<boolean>,
  fetcher: typeof fetch = fetch,
): Promise<Data> {
  if (!await valid()) return { status: "superseded" };
  const timezone = text(
    job.desired_payload?.timezone || job.create_payload?.payload?.timezone,
  ) || "Africa/Johannesburg";
  let deletedSeen = false;
  const googleBase =
    "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const graphBase = "https://graph.microsoft.com/v1.0/me/events";
  const prefer =
    'IdType="ImmutableId", outlook.timezone="UTC", outlook.body-content-type="text"';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(provider === "outlook" ? { Prefer: prefer } : {}),
  };
  const googleId = "arch9" + text(job.copy_key).replaceAll("-", "");
  let eventId = text(job.external_id) || googleId;
  const expand =
    `singleValueExtendedProperties($filter=id eq '${COPY_PROPERTY}' or id eq '${SOURCE_PROPERTY}')`;
  const fetchEvent = async (id: string) => {
    const url = provider === "google"
      ? `${googleBase}/${encodeURIComponent(id)}`
      : `${graphBase}/${encodeURIComponent(id)}?${new URLSearchParams({
        "$expand": expand,
      })}`;
    const response = await request(url, { headers }, fetcher);
    if ([404, 410].includes(response.status)) {
      deletedSeen ||= response.status === 410;
      return null;
    }
    if (!response.ok) throw new ProviderError("provider_unavailable");
    return response.json();
  };
  let remote: Data | null;
  if (provider === "outlook" && !job.external_id) {
    const filter =
      `singleValueExtendedProperties/Any(ep: ep/id eq '${COPY_PROPERTY}' and ep/value eq '${job.copy_key}')`;
    const response = await request(
      `${graphBase}?${new URLSearchParams({
        "$filter": filter,
        "$expand": expand,
        "$top": "2",
      })}`,
      { headers },
      fetcher,
    );
    const found = await response.json();
    if (!response.ok || !Array.isArray(found.value)) {
      throw new ProviderError("provider_unavailable");
    }
    if (found.value.length > 1 || found["@odata.nextLink"]) {
      return {
        status: "needs_review",
        remoteHash: "duplicate",
        observed: { deleted: false, reason: "duplicate_provider_copies" },
      };
    }
    remote = found.value[0] || null;
    if (remote) eventId = text(remote.id);
  } else remote = await fetchEvent(eventId);
  if (remote?.status === "cancelled" || remote?.isCancelled === true) {
    deletedSeen = true;
    remote = null;
  }
  const remoteHash = remote
    ? await hash(JSON.stringify(normalizedEvent(provider, remote, timezone)))
    : "absent";
  const review = () => ({
    status: "needs_review",
    externalId: remote ? eventId : job.external_id || null,
    remoteHash,
    etag: remote ? remoteVersion(provider, remote) : null,
    observed: observed(provider, remote),
  });
  if (!remote && job.desired_action === "delete") {
    return { status: "removed", externalId: job.external_id || null };
  }
  if (!remote && deletedSeen) return review();
  if (remote && (remote.attendees?.length || 0) > 0) {
    return {
      ...review(),
      observed: {
        ...observed(provider, remote),
        reason: "provider_has_guests",
      },
    };
  }
  if (remote && provider === "outlook" && remote.isOnlineMeeting === true) {
    return {
      ...review(),
      observed: {
        ...observed(provider, remote),
        reason: "provider_has_online_meeting",
      },
    };
  }
  if (
    remote &&
    (provider === "google"
      ? remote.recurrence?.length || remote.recurringEventId
      : ["seriesMaster", "occurrence", "exception"].includes(remote.type))
  ) {
    return {
      ...review(),
      observed: {
        ...observed(provider, remote),
        reason: "provider_copy_is_recurring",
      },
    };
  }
  if (remote && !owns(provider, remote, job.copy_key)) return review();
  if (job.force_hash && job.force_hash !== remoteHash) return review();
  if (job.remote_hash && job.remote_hash !== remoteHash && !job.force_hash) {
    return review();
  }
  if (remote && !job.remote_hash && !job.force_hash) {
    const frozen = job.create_payload;
    if (
      !frozen ||
      JSON.stringify(normalizedEvent(provider, remote, timezone)) !==
        JSON.stringify(
          normalizedEvent(
            provider,
            eventPayload(
              provider,
              frozen.payload,
              job.copy_key,
              frozen.hash,
              appUrl,
            ),
            timezone,
          ),
        )
    ) return review();
    if (
      job.desired_action === "upsert" && frozen.hash === job.desired_hash &&
      remoteVersion(provider, remote)
    ) {
      return {
        status: "synced",
        externalId: eventId,
        remoteHash,
        etag: remoteVersion(provider, remote),
        writtenHash: frozen.hash,
      };
    }
  }
  if (job.desired_action === "delete") {
    if (remote) {
      const etag = remoteVersion(provider, remote);
      if (!etag) return review();
      if (!await valid()) return { status: "superseded" };
      const response = await request(
        provider === "google"
          ? `${googleBase}/${encodeURIComponent(eventId)}?sendUpdates=none`
          : `${graphBase}/${encodeURIComponent(eventId)}`,
        { method: "DELETE", headers: { ...headers, "If-Match": etag } },
        fetcher,
      );
      if (response.status === 412) {
        return {
          status: "needs_review",
          remoteHash: "changed-during-write",
          observed: { deleted: false, reason: "changed_during_write" },
        };
      }
      if (!response.ok && ![404, 410].includes(response.status)) {
        throw new ProviderError("provider_unavailable");
      }
    }
    return {
      status: "removed",
      externalId: remote ? eventId : job.external_id || null,
    };
  }
  if (job.desired_action !== "upsert") return { status: "superseded" };
  const source = remote
    ? job.desired_payload
    : job.create_payload?.payload || job.desired_payload;
  const writtenHash = remote
    ? job.desired_hash
    : job.create_payload?.hash || job.desired_hash;
  const payload = eventPayload(
    provider,
    source,
    job.copy_key,
    writtenHash,
    appUrl,
  );
  if (remote && job.synced_hash === job.desired_hash && !job.force_hash) {
    return {
      status: "synced",
      externalId: eventId,
      remoteHash,
      etag: remoteVersion(provider, remote),
      writtenHash: job.desired_hash,
    };
  }
  if (!await valid()) return { status: "superseded" };
  let response: Response;
  if (remote) {
    const etag = remoteVersion(provider, remote);
    if (!etag) return review();
    const patch = { ...payload };
    delete patch.id;
    delete patch.transactionId;
    response = await request(
      provider === "google"
        ? `${googleBase}/${encodeURIComponent(eventId)}?sendUpdates=none`
        : `${graphBase}/${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        headers: { ...headers, "If-Match": etag },
        body: JSON.stringify(patch),
      },
      fetcher,
    );
  } else {
    response = await request(
      provider === "google" ? `${googleBase}?sendUpdates=none` : graphBase,
      { method: "POST", headers, body: JSON.stringify(payload) },
      fetcher,
    );
  }
  if (response.status === 412) {
    return {
      status: "needs_review",
      remoteHash: "changed-during-write",
      observed: { deleted: false, reason: "changed_during_write" },
    };
  }
  if (response.status === 409) throw new ProviderError("provider_unavailable");
  if (!response.ok) throw new ProviderError("provider_unavailable");
  const saved = await response.json();
  eventId = text(saved.id);
  if (!eventId) throw new ProviderError("provider_receipt_missing");
  // Google responds with its private properties; Graph requires an expanded GET
  // to verify ownership and the actual stored body/time representation.
  const verified = provider === "google" ? saved : await fetchEvent(eventId);
  if (
    !verified || !owns(provider, verified, job.copy_key) ||
    !remoteVersion(provider, verified)
  ) throw new ProviderError("provider_receipt_missing");
  const storedHash = await hash(
    JSON.stringify(normalizedEvent(provider, verified, timezone)),
  );
  if (
    JSON.stringify(normalizedEvent(provider, verified, timezone)) !==
      JSON.stringify(normalizedEvent(provider, payload, timezone))
  ) {
    return {
      status: "needs_review",
      externalId: eventId,
      remoteHash: storedHash,
      etag: remoteVersion(provider, verified),
      observed: observed(provider, verified),
    };
  }
  return {
    status: "synced",
    externalId: eventId,
    remoteHash: storedHash,
    etag: remoteVersion(provider, verified),
    writtenHash,
  };
}
