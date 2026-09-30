import { verifySellerParticipantInviteSetup } from "./sellerOnboarding.ts";

const token = "a".repeat(64);
const listingId = "11111111-1111-4111-8111-111111111111";
const inviteLink = `https://app.arch9.co.za/seller/collaboration/invite/${token}`;

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
}

async function tokenHash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function participantClient(row: Record<string, unknown>, expectedHash: string) {
  return {
    from(table: string) {
      assertEquals(table, "private_listing_seller_participants");
      const filters: Record<string, unknown> = {};
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) {
          filters[key] = value;
          return query;
        },
        async maybeSingle() {
          return {
            data: filters.private_listing_id === listingId &&
                filters.invitation_token_hash === expectedHash
              ? row
              : null,
            error: null,
          };
        },
      };
      return query;
    },
  };
}

Deno.test("named seller participant with a matching live token can receive an invitation", async () => {
  const result = await verifySellerParticipantInviteSetup(
    participantClient({
      display_name: "Anton Groenewald",
      email: "anton@example.com",
      status: "invited",
      invitation_expires_at: new Date(Date.now() + 60_000).toISOString(),
    }, await tokenHash(token)) as never,
    listingId,
    "anton@example.com",
    inviteLink,
  );
  assertEquals(result.ok, true);
});

Deno.test("seller participant invitation rejects another recipient and an expired token", async () => {
  const hash = await tokenHash(token);
  const validRow = {
    display_name: "Anton Groenewald",
    email: "anton@example.com",
    status: "invited",
    invitation_expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  const wrongRecipient = await verifySellerParticipantInviteSetup(
    participantClient(validRow, hash) as never,
    listingId,
    "other@example.com",
    inviteLink,
  );
  assertEquals(wrongRecipient.code, "seller_participant_invite_invalid");

  const expired = await verifySellerParticipantInviteSetup(
    participantClient({
      ...validRow,
      invitation_expires_at: new Date(Date.now() - 60_000).toISOString(),
    }, hash) as never,
    listingId,
    "anton@example.com",
    inviteLink,
  );
  assertEquals(expired.code, "seller_participant_invite_invalid");
});

Deno.test("seller participant invitation rejects a token from another row", async () => {
  const result = await verifySellerParticipantInviteSetup(
    participantClient({
      display_name: "Anton Groenewald",
      email: "anton@example.com",
      status: "invited",
      invitation_expires_at: new Date(Date.now() + 60_000).toISOString(),
    }, await tokenHash("b".repeat(64))) as never,
    listingId,
    "anton@example.com",
    inviteLink,
  );
  assertEquals(result.code, "seller_participant_invite_invalid");
});
