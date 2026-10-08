import {
  authorizationUrl,
  type Data,
  decryptCredential,
  encryptCredential,
  exchangeCode,
  hash,
  type Provider,
  type ProviderConfig,
  ProviderError,
  randomToken,
  refreshCredential,
  safeReturnUrl,
  syncProviderEvent,
  text,
} from "./calendarProviderTransport.ts";
export type RpcClient = {
  rpc: (
    name: string,
    args?: Data,
  ) => PromiseLike<{ data: Data | Data[] | boolean | null; error: unknown }>;
};
export type ProviderRuntime = {
  config: ProviderConfig;
  service: RpcClient;
  user: (token: string) => Promise<{ id: string } | null>;
  fetcher?: typeof fetch;
};
async function rpc(client: RpcClient, name: string, args: Data = {}) {
  const result = await client.rpc(name, args);
  if (result.error) throw new ProviderError("calendar_operation_failed");
  return result.data;
}
function provider(value: unknown): Provider {
  if (value !== "google" && value !== "outlook") {
    throw new ProviderError("unsupported_provider");
  }
  return value;
}
const json = (status: number, body: unknown, origin: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers":
        "authorization,x-client-info,apikey,content-type",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Vary": "Origin",
      "Cache-Control": "no-store",
    },
  });
function redirect(returnUrl: string, result: string, appUrl: string) {
  const url = new URL(returnUrl);
  if (url.origin !== new URL(appUrl).origin) {
    throw new ProviderError("invalid_return_path");
  }
  url.searchParams.set("calendar_provider", result);
  return new Response(null, {
    status: 303,
    headers: {
      Location: url.href,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export async function handleCalendarProviderConnection(
  request: Request,
  runtime: ProviderRuntime,
): Promise<Response> {
  const { config, service } = runtime, fetcher = runtime.fetcher || fetch;
  let origin = "";
  try {
    origin = new URL(config.appUrl).origin;
  } catch {
    return json(
      503,
      { error: "Calendar connections are not configured yet." },
      "",
    );
  }
  const reqOrigin = request.headers.get("origin");
  if (reqOrigin && reqOrigin !== origin) {
    return json(403, {
      error: "This origin cannot manage calendar connections.",
    }, origin);
  }
  if (request.method === "OPTIONS") return json(200, {}, origin);
  if (request.method === "GET") {
    let returnUrl = new URL("/pipeline/calendar", config.appUrl).href;
    try {
      const url = new URL(request.url),
        selected = provider(url.searchParams.get("provider")),
        state = text(url.searchParams.get("state"));
      if (!/^[A-Za-z0-9_-]{64}$/.test(state)) {
        throw new ProviderError("invalid_authorization_state");
      }
      const stateHash = await hash(state);
      const stored = await rpc(service, "consume_calendar_provider_oauth", {
        p_state_hash: stateHash,
        p_provider: selected,
      }) as Data;
      const destination = new URL(stored.returnUrl);
      if (destination.origin !== origin || destination.protocol !== "https:") {
        throw new ProviderError("invalid_return_path");
      }
      returnUrl = destination.href;
      if (url.searchParams.get("error") || !url.searchParams.get("code")) {
        return redirect(returnUrl, "cancelled", config.appUrl);
      }
      const account = await exchangeCode(
        selected,
        text(url.searchParams.get("code")),
        stored.verifier,
        config,
        fetcher,
      );
      if (stored.accountId && stored.accountId !== account.accountId) {
        throw new ProviderError("account_mismatch");
      }
      const credential = await encryptCredential(
        account.token,
        stored.connectionId,
        config.encryptionKey,
      );
      await rpc(service, "finish_calendar_provider_oauth", {
        p_state_hash: stateHash,
        p_account_id: account.accountId,
        p_account_label: account.accountLabel,
        p_credential: credential,
      });
      return redirect(returnUrl, "connected", config.appUrl);
    } catch {
      return redirect(returnUrl, "failed", config.appUrl);
    }
  }
  if (request.method !== "POST") {
    return json(405, { error: "POST is required." }, origin);
  }
  try {
    const bearer = text(request.headers.get("authorization")).replace(
      /^Bearer\s+/i,
      "",
    );
    if (!bearer) {
      return json(
        401,
        { error: "Sign in before managing your calendar." },
        origin,
      );
    }
    const actor = await runtime.user(bearer);
    if (!bearer || !actor) {
      return json(
        401,
        { error: "Sign in before managing your calendar." },
        origin,
      );
    }
    const body = await request.json();
    const org = text(body.organisationId), selected = provider(body.provider);
    if (body.action !== "connect" || !/^[a-f0-9-]{36}$/i.test(org)) {
      return json(
        400,
        { error: "Choose a workspace and supported calendar." },
        origin,
      );
    }
    const state = randomToken(), verifier = randomToken();
    const returnUrl = safeReturnUrl(
      text(body.returnPath) || "/pipeline/calendar",
      config.appUrl,
    );
    // Validate configuration/encryption before storing any pending connection.
    await encryptCredential({ probe: true }, org, config.encryptionKey);
    const url = await authorizationUrl(selected, state, verifier, config);
    await rpc(service, "begin_calendar_provider_oauth", {
      p_org: org,
      p_user: actor.id,
      p_provider: selected,
      p_state_hash: await hash(state),
      p_verifier: verifier,
      p_return_url: returnUrl,
    });
    return json(200, { authorizationUrl: url }, origin);
  } catch {
    return json(400, {
      error:
        "Calendar authorization could not start. Check workspace access and provider configuration.",
    }, origin);
  }
}

export async function dispatchCalendarProviderConnection(
  connection: Data,
  runtime: ProviderRuntime,
  limit = 10,
) {
  const { service, config } = runtime, fetcher = runtime.fetcher || fetch;
  const receipts: Data[] = [];
  const started = Date.now();
  let credential: Data | null = null;
  try {
    for (
      let index = 0;
      index < Math.max(1, Math.min(limit, 10)) && Date.now() - started < 60000;
      index++
    ) {
      const job = await rpc(service, "prepare_calendar_provider_event", {
        p_connection: connection.id,
        p_lease: connection.lease,
      }) as Data | null;
      if (!job) break;
      let result: Data;
      try {
        if (!credential) {
          const previous = await decryptCredential(
            connection.credential,
            connection.id,
            config.encryptionKey,
          );
          credential = await refreshCredential(
            provider(connection.provider),
            previous,
            config,
            fetcher,
          );
          if (credential !== previous) {
            const encrypted = await encryptCredential(
              credential,
              connection.id,
              config.encryptionKey,
            );
            const saved = await rpc(
              service,
              "refresh_calendar_provider_credential",
              {
                p_connection: connection.id,
                p_lease: connection.lease,
                p_previous: connection.credential,
                p_credential: encrypted,
              },
            );
            if (saved !== true) throw new ProviderError("connection_changed");
            connection = { ...connection, credential: encrypted };
          }
        }
        if (!credential) throw new ProviderError("credential_unavailable");
        const valid = async () =>
          await rpc(service, "validate_calendar_provider_event", {
            p_connection: connection.id,
            p_lease: connection.lease,
            p_appointment: job.appointment_id,
            p_job: job.job_lease,
            p_version: job.version,
          }) === true;
        result = await syncProviderEvent(
          provider(connection.provider),
          job,
          text(credential.access_token),
          config.appUrl,
          valid,
          fetcher,
        );
      } catch (error) {
        const code = error instanceof ProviderError
          ? error.code
          : "provider_unavailable";
        result = {
          status: [
              "authorization_expired",
              "credential_unavailable",
              "calendar_permission_missing",
            ].includes(code)
            ? "needs_reconnect"
            : code === "connection_changed"
            ? "superseded"
            : "failed",
          retryAfter: error instanceof ProviderError ? error.retryAfter : 0,
        };
      }
      const recorded = await rpc(service, "finish_calendar_provider_event", {
        p_connection: connection.id,
        p_lease: connection.lease,
        p_appointment: job.appointment_id,
        p_job: job.job_lease,
        p_copy_key: job.copy_key,
        p_version: job.version,
        p_result: result,
      });
      receipts.push({
        appointmentId: job.appointment_id,
        status: result.status,
        recorded: recorded === true,
      });
      if (result.status === "needs_reconnect") break;
    }
  } finally {
    await rpc(service, "release_calendar_provider_connection", {
      p_connection: connection.id,
      p_lease: connection.lease,
    });
  }
  return receipts;
}
