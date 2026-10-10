import {
  HOME_SEEKERS_RECRUITMENT_LOGO,
  HOME_SEEKERS_RECRUITMENT_ORGANISATION_ID,
  homeSeekersRecruitmentBranding,
  HomeSeekersRecruitmentSenderUnavailable,
  resolveHomeSeekersRecruitmentSender,
} from "./homeSeekersRecruitmentBranding.ts";
import { brandColorLuminance } from "../content/bridgeEmailLayout.ts";
import {
  buildHomeSeekersRecruitmentApprovalEmail,
  buildRecruitmentApplicantEmail,
} from "../content/recruitmentApplicantEmails.ts";
import { buildRecruitmentContactNotification } from "../content/recruitmentContactNotification.ts";
import { buildHomeSeekersRecruitmentCodeEmail } from "../content/recruitmentVerificationCode.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

Deno.test("Home Seekers SVG and ambiguous inverse logos fall back to the black PNG on white", () => {
  const branding = homeSeekersRecruitmentBranding({
    organisationName: "Arch9 agency",
    logoLightUrl: "https://company.test/black.svg",
    logoDarkUrl: "https://company.test/white.png",
    logoUrl: "https://company.test/white.png",
    supportEmail: "hello@homeseekers-onboarding.test",
  });
  assert(branding.logoLightUrl === HOME_SEEKERS_RECRUITMENT_LOGO);
  assert(branding.logoUrl === HOME_SEEKERS_RECRUITMENT_LOGO);
  assert(branding.organisationName === "Home Seekers");
  assert(branding.supportEmail === "admin@homeseekers.co.za");
  assert(branding.website === "https://www.homeseekers.co.za");
  const contrast = (brandColorLuminance(branding.secondaryColor!) + 0.05) /
    (brandColorLuminance(branding.primaryColor!) + 0.05);
  assert(contrast >= 4.5, "Orange CTA must support readable dark text");
  assert(
    homeSeekersRecruitmentBranding({
      logoLightUrl: "https://company.test/black.png",
    }).logoLightUrl === "https://company.test/black.png",
  );
});

Deno.test("all six automations, verification and approval share Home Seekers identity and contrasting logo", () => {
  const lead = {
    name: "Sam Applicant",
    documents_json: [],
    document_waivers_json: {},
  };
  const branding = {
    logoLightUrl: "https://company.test/black.svg",
    logoDarkUrl: "https://company.test/white.png",
  };
  const contact = {
    firstName: "Sam",
    lastName: "Applicant",
    email: "sam@sample.co.za",
    phone: "+27821234567",
  };
  const emails = [
    ...["lead_received", "application_received", "documents_received"].map(
      (kind) =>
        buildRecruitmentContactNotification(
          "22222222-2222-4222-8222-222222222222",
          contact,
          branding,
          kind,
        ),
    ),
    ...["application_thanks", "documents_reminder", "documents_followup"].map(
      (kind) =>
        buildRecruitmentApplicantEmail(
          kind,
          lead,
          "https://app.arch9.co.za",
          branding,
        ),
    ),
    buildHomeSeekersRecruitmentCodeEmail("12345678", "Sam", branding),
    buildHomeSeekersRecruitmentApprovalEmail(lead, branding),
  ];
  for (const email of emails) {
    assert(email.subject.includes("Home Seekers"));
    assert(email.html.includes(`src="${HOME_SEEKERS_RECRUITMENT_LOGO}"`));
    assert(email.html.includes('class="arch9-header" bgcolor="#FFFFFF"'));
    assert(
      !email.html.includes("company.test/white.png") &&
        !email.html.includes("company.test/black.svg"),
    );
    assert(
      !/Powered by Arch9|through Arch9|Arch9 agency|onboarding\.test/.test(
        email.html,
      ),
    );
    assert(
      email.html.includes("admin@homeseekers.co.za") &&
        email.html.includes("Home Seekers · Recruitment"),
    );
    assert(/max-width: 480px/.test(email.html));
  }
});

function identityDatabase(address?: string, error?: unknown) {
  const filters: unknown[][] = [];
  const query = {
    select: () => query,
    eq: (...args: unknown[]) => {
      filters.push(args);
      return query;
    },
    is: (...args: unknown[]) => {
      filters.push(args);
      return query;
    },
    limit: async () => ({
      data: address ? [{ from_email: address }] : [],
      error,
    }),
  };
  return {
    filters,
    from: (table: string) => {
      assert(table === "email_sender_identities");
      return query;
    },
  };
}

Deno.test("staff and applicant sends resolve only a verified unpaused Home Seekers sender", async () => {
  const database = identityDatabase("recruitment@homeseekers.co.za");
  const from = await resolveHomeSeekersRecruitmentSender({
    branding: {},
    supabase: database,
  });
  assert(from === "Home Seekers <recruitment@homeseekers.co.za>");
  for (
    const filter of [
      ["organisation_id", HOME_SEEKERS_RECRUITMENT_ORGANISATION_ID],
      ["provider", "resend"],
      ["verification_status", "verified"],
      ["sending_paused_at", null],
    ]
  ) {
    assert(
      database.filters.some((item) =>
        JSON.stringify(item) === JSON.stringify(filter)
      ),
    );
  }
});

Deno.test("missing and wrong-domain senders fail without the approved Arch9 fallback", async () => {
  for (
    const database of [
      identityDatabase(),
      identityDatabase(undefined, { message: "unavailable" }),
      identityDatabase("notifications@arch9.co.za"),
      identityDatabase("notify@homeseekers.co.za.evil.test"),
    ]
  ) {
    let blocked = false;
    try {
      await resolveHomeSeekersRecruitmentSender({
        branding: { fromEmail: "admin@homeseekers.co.za" },
        supabase: database,
        platformSender: "",
      });
    } catch (error) {
      blocked = error instanceof HomeSeekersRecruitmentSenderUnavailable;
    }
    assert(blocked);
  }
});

Deno.test("pending Home Seekers sender uses only the configured Arch9 fallback and retains branding", async () => {
  assert(await resolveHomeSeekersRecruitmentSender({
    branding: {}, supabase: identityDatabase(), platformSender: "notifications@arch9.co.za",
  }) === "Home Seekers <notifications@arch9.co.za>");
  assert(await resolveHomeSeekersRecruitmentSender({
    branding: {}, supabase: identityDatabase("thomas@homeseekers.co.za"), platformSender: "notifications@arch9.co.za",
  }) === "Home Seekers <thomas@homeseekers.co.za>");
  for (const fallback of ["onboarding@resend.dev", "notify@arch9.co.za.evil.test", "notify@homeseekers.co.za"]) {
    let blocked = false;
    try {
      await resolveHomeSeekersRecruitmentSender({ branding: {}, supabase: identityDatabase(), platformSender: fallback });
    } catch (error) { blocked = error instanceof HomeSeekersRecruitmentSenderUnavailable; }
    assert(blocked);
  }
  let blocked = false;
  try {
    await resolveHomeSeekersRecruitmentSender({ branding: {}, supabase: identityDatabase("other@arch9.co.za"), platformSender: "notifications@arch9.co.za" });
  } catch (error) { blocked = error instanceof HomeSeekersRecruitmentSenderUnavailable; }
  assert(blocked, "An unrelated Arch9 address must not become the configured sender");
});
