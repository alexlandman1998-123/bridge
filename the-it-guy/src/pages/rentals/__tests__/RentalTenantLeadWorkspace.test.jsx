// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RentalTenantLeadWorkspace from "../RentalTenantLeadWorkspace";
import {
  advanceRentalLead,
  assignRentalLead,
  updateRentalLeadQualification,
} from "../../../services/rentals/rentalLeadService";
import { listOrganisationUsersForWorkspace } from "../../../lib/settingsApi";
import { listRentalLeadMatches, recordRentalLeadListingShortlist } from "../../../services/rentals/rentalLeadMatchingService";
import { logRentalLeadCommunication } from "../../../services/rentals/rentalLeadCommunicationService";
import {
  createRentalViewing,
  listRentalViewings,
  recordRentalViewingOutcome,
} from "../../../services/rentals/rentalViewingService";
vi.mock("../../../services/rentals/rentalLeadService", () => ({
  advanceRentalLead: vi.fn().mockResolvedValue({}),
  assignRentalLead: vi.fn(),
  updateRentalLeadQualification: vi.fn(),
}));
vi.mock("../../../services/rentals/rentalLeadMatchingService", () => ({
  listRentalLeadMatches: vi.fn(),
  recordRentalLeadListingShortlist: vi.fn(),
}));
vi.mock("../../../services/rentals/rentalLeadCommunicationService", () => ({
  listRentalLeadCommunications: vi.fn().mockResolvedValue([]),
  logRentalLeadCommunication: vi.fn(),
}));
vi.mock("../../../services/rentals/rentalViewingService", () => ({
  createRentalViewing: vi.fn(),
  listRentalViewings: vi.fn(),
  recordRentalViewingOutcome: vi.fn(),
}));
vi.mock("../../../services/rentals/rentalApplicationRepository.js", () => ({
  getRentalApplicationTenancyConversion: vi.fn().mockResolvedValue(null),
  getRentalApplicationReview: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../../lib/settingsApi", () => ({
  listOrganisationUsersForWorkspace: vi.fn().mockResolvedValue([]),
}));
const lead = {
  id: "lead",
  role: "tenant",
  name: "Alex Tenant",
  email: "alex@example.com",
  phone: "0825550101",
  stage: "qualified",
  stageLabel: "Qualified",
  assignedAgentId: "agent",
  assignedAgentName: "Agent Name",
  monthlyBudget: 11000,
  desiredArea: "Newlands",
  bedrooms: 2,
  relationships: { listingId: "original" },
  qualification: {
    monthlyBudget: 11000,
    desiredArea: "Newlands",
    occupationDate: "2026-11-01",
    employmentStatus: "Employed",
    depositAvailable: "No",
    screeningConsent: "Yes",
    propertyNeed: "Apartment",
    occupants: 2,
    pets: "No pets",
    additionalNotes: "Call first",
  },
};
const scope = {
  organisationId: "org",
  assignedAgentId: "agent",
  branchId: "",
  scopeLevel: "agent",
};
const options = { assignedAgentId: "agent", scopeLevel: "agent" };
it("keeps unsaved profile answers out of the overview and preserves the draft", async () => {
  show();
  fireEvent.click(
    screen.getByRole("button", { name: "Tenant profile", exact: true }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Rental requirements", exact: true }));
  fireEvent.change(
    screen.getByRole("textbox", {
      name: "What type of property and features do you need?",
    }),
    { target: { value: "Unsaved townhouse request" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Overview", exact: true }),
  );
  expect(screen.queryByText("Unsaved townhouse request")).toBeNull();
  expect(screen.getByText("Apartment", { exact: true })).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Tenant profile", exact: true }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Rental requirements", exact: true }));
  expect(
    screen.getByRole("textbox", {
      name: "What type of property and features do you need?",
    }).value,
  ).toBe("Unsaved townhouse request");
  expect(updateRentalLeadQualification).not.toHaveBeenCalled();
});
function show(overrides = {}) {
  const onReload = vi.fn().mockResolvedValue();
  render(
    <MemoryRouter>
      <RentalTenantLeadWorkspace
        lead={lead}
        applications={[]}
        vacancies={[]}
        leadActivities={[]}
        scope={scope}
        options={options}
        actor={{ id: "agent", name: "Agent Name" }}
        onReload={onReload}
        applicationContent={<div>Application form</div>}
        documentsContent={<div>FICA checklist</div>}
        {...overrides}
      />
    </MemoryRouter>,
  );
  return onReload;
}
it('shows submitted tenant qualification and preferred times on the rental overview', () => {
  show({ lead: { ...lead, qualification: { ...lead.qualification, monthlyBudget: 12500, source: 'tenant_qualification_link', submittedAt: '2026-10-07T12:00:00Z', additionalNotes: '' },
    viewingRequest: { status: 'requested', timezone: 'Africa/Johannesburg', availabilitySlots: [{ date: '2026-10-15', startTime: '10:00', endTime: '11:00', label: 'Thu, 15 Oct 2026, 10:00-11:00' }] } } })
  expect(screen.getByText('Preferred times submitted by the tenant')).toBeTruthy()
  expect(screen.getByText('Thu, 15 Oct 2026, 10:00-11:00')).toBeTruthy()
  expect(screen.getByText('No additional notes provided')).toBeTruthy()
  expect(createRentalViewing).not.toHaveBeenCalled()
})
beforeEach(() => {
  vi.clearAllMocks();
  listRentalLeadMatches.mockResolvedValue({
    lead,
    matches: [
      {
        listing: {
          id: "match",
          listingTitle: "Budget apartment",
          monthlyRent: 10000,
          bedrooms: 2,
        },
        locationMatch: true,
        bedroomMatch: true,
      },
      {
        listing: {
          id: "original",
          listingTitle: "Original enquired home",
          monthlyRent: 12000,
        },
      },
    ],
  });
  recordRentalLeadListingShortlist.mockResolvedValue({ activityId: "shortlist" });
  listRentalViewings.mockResolvedValue([]);
  updateRentalLeadQualification.mockResolvedValue(true);
  createRentalViewing.mockResolvedValue({ id: "viewing" });
  recordRentalViewingOutcome.mockResolvedValue({});
  logRentalLeadCommunication.mockResolvedValue({});
});
afterEach(cleanup);
it("shows the requested workspace tabs, journey and overview cards, keeping the actual enquiry", async () => {
  show();
  await screen.findByText("Original enquired home");
  expect(
    screen
      .getByRole("progressbar", { name: "Tenant readiness" })
      .getAttribute("aria-valuenow"),
  ).toBe("100");
  expect(screen.getByText("Tenant journey")).toBeTruthy();
  for (const name of [
    "Overview",
    "Matches",
    "Tenant profile",
    "Application",
    "Documents",
    "Appointments",
    "Activity",
  ])
    expect(screen.getByRole("button", { name, exact: true })).toBeTruthy();
  expect(screen.getByText("Tenant qualification")).toBeTruthy();
  expect(screen.getByText("Lead assigned to")).toBeTruthy();
  expect(screen.getByText("Activity logger")).toBeTruthy();
  expect(screen.getByText("Viewing planner")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Matches", exact: true }));
  await screen.findByText("Budget apartment");
  expect(screen.getByText("Original enquired home")).toBeTruthy();
  expect(screen.getByRole('heading', { name: /^Properties from R 10[\s,]000 to R 12[\s,]000 per month$/ })).toBeTruthy();
  expect(screen.queryByRole('list', { name: 'Tenant journey stages' })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Application", exact: true }),
  );
  expect(screen.getByText("Application form")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Documents", exact: true }),
  );
  expect(screen.getByText("FICA checklist")).toBeTruthy();
});
it("saves every tenant answer and retains edited values when a save fails", async () => {
  show();
  fireEvent.click(
    screen.getByRole("button", { name: "Tenant profile", exact: true }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Rental requirements", exact: true }));
  fireEvent.change(
    screen.getByLabelText("What is your maximum monthly rent?"),
    { target: { value: "10500" } },
  );
  fireEvent.change(
    screen.getByLabelText("What did the tenant say on the call?"),
    { target: { value: "Tenant would like a ground-floor unit" } },
  );
  updateRentalLeadQualification.mockRejectedValueOnce(
    new Error("Save timeout"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save qualification" }));
  await screen.findByText("Save timeout");
  expect(
    screen.getByLabelText("What is your maximum monthly rent?").value,
  ).toBe("10500");
  fireEvent.click(screen.getByRole("button", { name: "Save qualification" }));
  await waitFor(() =>
    expect(updateRentalLeadQualification).toHaveBeenCalledTimes(2),
  );
  expect(updateRentalLeadQualification.mock.calls[1][1]).toMatchObject({
    ...lead.qualification,
    monthlyBudget: "10500",
    additionalNotes: "Tenant would like a ground-floor unit",
    bedrooms: 2,
  });
});
it("logs activity with the correct tenant and books a viewing before verifying the stage transition", async () => {
  const onReload = show();
  await screen.findByText("Original enquired home");
  fireEvent.change(screen.getByLabelText("Activity summary"), {
    target: { value: "Discussed budget and moving date" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Log activity" }));
  await waitFor(() =>
    expect(logRentalLeadCommunication).toHaveBeenCalledWith(
      lead,
      expect.objectContaining({
        summary: "Discussed budget and moving date",
        communicationType: "call",
      }),
      expect.objectContaining({ organisationId: "org" }),
    ),
  );
  await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText("Rental property"), {
    target: { value: "match" },
  });
  fireEvent.change(screen.getByLabelText("Viewing time"), {
    target: { value: "2026-11-01T14:30" },
  });
  fireEvent.change(
    screen.getByLabelText("Viewing note / access requirements"),
    { target: { value: "Meet at the gate" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Book viewing" }));
  await waitFor(() =>
    expect(createRentalViewing).toHaveBeenCalledWith(
      expect.objectContaining({
        listingId: "match",
        tenantLeadId: "lead",
        tenantName: "Alex Tenant",
        startsAt: "2026-11-01T14:30",
        note: "Meet at the gate",
      }),
      { assignedAgentId: "agent" },
    ),
  );
  expect(advanceRentalLead).toHaveBeenCalledWith(
    lead,
    expect.objectContaining({
      toStage: "viewing_scheduled",
      evidence: { scheduledFor: "2026-11-01T14:30" },
    }),
  );
});
it("does not advance when the viewing save fails, and preserves the booking draft", async () => {
  show();
  await screen.findByText("Original enquired home");
  createRentalViewing.mockRejectedValueOnce(new Error("Viewing save failed"));
  fireEvent.change(screen.getByLabelText("Rental property"), {
    target: { value: "match" },
  });
  fireEvent.change(screen.getByLabelText("Viewing time"), {
    target: { value: "2026-11-01T14:30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Book viewing" }));
  await screen.findByText("Viewing save failed");
  expect(advanceRentalLead).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Viewing time").value).toBe("2026-11-01T14:30");
});
it("filters appointments to this tenant and verifies attended outcomes before advancing", async () => {
  listRentalViewings.mockResolvedValue([
    {
      id: "own",
      tenantLeadId: "lead",
      listingId: "match",
      listingTitle: "Own viewing",
      startsAt: "2026-11-01T14:30",
    },
    {
      id: "other",
      tenantLeadId: "other-lead",
      listingTitle: "Other tenant viewing",
    },
  ]);
  show({ lead: { ...lead, stage: "viewing_scheduled" } });
  fireEvent.click(
    screen.getByRole("button", { name: "Appointments", exact: true }),
  );
  await screen.findByText("Own viewing");
  expect(screen.queryByText("Other tenant viewing")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Attended", exact: true }),
  );
  await waitFor(() =>
    expect(recordRentalViewingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ id: "own" }),
      "attended",
      "",
      { assignedAgentId: "agent" },
    ),
  );
  expect(advanceRentalLead).toHaveBeenCalledWith(
    expect.objectContaining({ stage: "viewing_scheduled" }),
    expect.objectContaining({
      toStage: "viewing_completed",
      evidence: { viewingOutcome: "attended" },
    }),
  );
});


it("lists active agents in the manager's branch and saves the selected assignment", async () => {
  listOrganisationUsersForWorkspace.mockResolvedValue([
    { userId: "agent", fullName: "Agent Name", email: "agent@example.test", organisationId: "org", branchId: "branch-1", status: "active" },
    { userId: "agent-2", fullName: "Beth Agent", email: "beth@example.test", organisationId: "org", branchId: "branch-1", status: "accepted" },
    { userId: "other", fullName: "Other Branch", organisationId: "org", branchId: "branch-2", status: "active" },
    { userId: "inactive", fullName: "Inactive Agent", organisationId: "org", branchId: "branch-1", status: "inactive" },
    { userId: "foreign", fullName: "Other Organisation", organisationId: "other-org", branchId: "branch-1", status: "active" },
  ]);
  assignRentalLead.mockResolvedValue(true);
  const onReload = show({ scope: { ...scope, scopeLevel: "branch", branchId: "branch-1" }, options: { ...options, scopeLevel: "branch", branchId: "branch-1" } });
  const selector = screen.getByRole("combobox", { name: "Assign tenant lead" });
  await waitFor(() => expect(selector.disabled).toBe(false));
  expect(screen.getByRole("option", { name: "Beth Agent" })).toBeTruthy();
  for (const name of ["Other Branch", "Inactive Agent", "Other Organisation"]) expect(screen.queryByRole("option", { name })).toBeNull();
  expect(selector.value).toBe("agent");
  expect(screen.getByRole("button", { name: "Save assignment" }).disabled).toBe(true);
  fireEvent.change(selector, { target: { value: "agent-2" } });
  fireEvent.click(screen.getByRole("button", { name: "Save assignment" }));
  await waitFor(() => expect(assignRentalLead).toHaveBeenCalledWith("lead", "agent-2", expect.objectContaining({ organisationId: "org", scope: expect.objectContaining({ scopeLevel: "branch", branchId: "branch-1" }) })));
  await waitFor(() => expect(onReload).toHaveBeenCalled());
  expect(await screen.findByText("Lead assignment saved.")).toBeTruthy();
});

it("shows the current assigned agent in a read-only selector for agent-scoped users", () => {
  show();
  const selector = screen.getByRole("combobox", { name: "Assign tenant lead" });
  expect(selector.disabled).toBe(true);
  expect(selector.value).toBe("agent");
  expect(screen.queryByRole("button", { name: "Save assignment" })).toBeNull();
  expect(assignRentalLead).not.toHaveBeenCalled();
});

it("opens matches, records the shortlist and hands the chosen listing to the viewing planner", async () => {
  const onReload = show();
  await screen.findByText("Original enquired home");
  expect(listRentalLeadMatches).toHaveBeenCalledWith("org", "lead", expect.objectContaining({ organisationId: "org", assignedAgentId: "agent", scopeLevel: "agent" }));
  fireEvent.click(screen.getByRole("button", { name: "Matches", exact: true }));
  const card = within(screen.getByText('Budget apartment').closest('article'));
  expect(card.getByRole("link", { name: "Open listing" }).getAttribute("href")).toBe("/agent/rentals/listings/match");
  fireEvent.click(card.getByRole("button", { name: "Shortlist", exact: true }));
  await waitFor(() => expect(recordRentalLeadListingShortlist).toHaveBeenCalledWith(lead, expect.objectContaining({ listing: expect.objectContaining({ id: "match" }) }), expect.objectContaining({ organisationId: "org", scope: expect.objectContaining({ assignedAgentId: "agent" }) })));
  await waitFor(() => expect(onReload).toHaveBeenCalled());
  fireEvent.click(card.getByRole("button", { name: "Plan viewing", exact: true }));
  expect(screen.getByRole("combobox", { name: "Rental property" }).value).toBe("match");
});
it("shows failed matching as a retryable error instead of claiming there are no matches", async () => {
  listRentalLeadMatches.mockRejectedValueOnce(new Error("Listings unavailable"));
  show();
  await screen.findByText(/Rental matches: Listings unavailable/);
  fireEvent.click(screen.getByRole("button", { name: "Matches", exact: true }));
  expect(screen.getByText("Rental matches could not load. Refresh matches to retry.")).toBeTruthy();
  expect(screen.queryByText("No rental listings match this budget in the current workspace.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Refresh matches" }));
  await screen.findByText("Budget apartment");
});

it("refreshes matches when saved tenant requirements change", async () => {
  const stable = { applications: [], vacancies: [], leadActivities: [], scope, options, actor: { id: 'agent' }, onReload: vi.fn() };
  const { rerender } = render(<MemoryRouter><RentalTenantLeadWorkspace {...stable} lead={lead} /></MemoryRouter>);
  await screen.findByText("Original enquired home");
  const calls = listRentalLeadMatches.mock.calls.length;
  listRentalLeadMatches.mockResolvedValue({ lead: { ...lead, monthlyBudget: 9000 }, matches: [] });
  rerender(<MemoryRouter><RentalTenantLeadWorkspace {...stable} lead={{ ...lead, monthlyBudget: 9000, desiredArea: 'Brooklyn', bedrooms: 3 }} /></MemoryRouter>);
  await waitFor(() => expect(listRentalLeadMatches.mock.calls.length).toBeGreaterThan(calls));
  fireEvent.click(screen.getByRole('button', { name: 'Matches', exact: true }));
  await screen.findByText('No rental listings match this budget in the current workspace.');
});
