import { assertEquals } from "jsr:@std/assert";
import { assessControlledTestRecipient } from "./controlledTestRecipient.ts";

Deno.test("suppresses reserved example domains before provider delivery", () => {
  for (const email of [
    "buyer@example.com",
    "seller@example.test",
    "agent@sub.example.org",
    "pilot@anything.test",
    "noreply@controlled.invalid",
  ]) {
    const result = assessControlledTestRecipient({ email });
    assertEquals(result.suppressed, true, email);
    assertEquals(result.reason, "controlled_test_recipient");
  }
});

Deno.test("does not suppress ordinary recipient domains", () => {
  const result = assessControlledTestRecipient({
    email: "client@real-domain.co.za",
    recipientName: "Client Recipient",
  });
  assertEquals(result.suppressed, false);
  assertEquals(result.reason, "");
});

Deno.test("suppresses explicit test metadata", () => {
  const result = assessControlledTestRecipient({
    email: "client@real-domain.co.za",
    metadata: { testDataProtection: { isTestData: true } },
  });
  assertEquals(result.suppressed, true);
  assertEquals(result.reason, "controlled_test_recipient");
});
