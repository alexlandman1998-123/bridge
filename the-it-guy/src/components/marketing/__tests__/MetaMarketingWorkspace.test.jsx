// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import MetaMarketingWorkspace from "../MetaMarketingWorkspace";
const mocks = vi.hoisted(() => ({ workspace: {}, load: vi.fn() }));
vi.mock("../../../hooks/useMetaWorkspace", () => ({
  useMetaWorkspace: () => mocks.workspace,
}));
vi.mock("../../../context/AuthSessionContext", () => ({
  useAuthSession: () => ({ authState: { user: { id: "me" } } }),
}));
vi.mock(
  "../../../services/marketingChannelTemplateService",
  async (original) => ({
    ...(await original()),
    loadChannelTemplates: mocks.load,
  }),
);
vi.mock("../../../pages/settings/SettingsLeadCapturePage", () => ({
  default: ({ embedded }) => (
    <p>Connection settings {embedded ? "embedded" : "standalone"}</p>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function Location() {
  return <output>{useLocation().search}</output>;
}
function mount(query = "") {
  mocks.workspace = {
    organisationId: "org",
    canManage: true,
    loading: false,
    error: "",
    pages: [
      {
        id: "page",
        page_name: "Kingdom",
        connection_status: "connected",
        canPost: true,
      },
    ],
    refresh: vi.fn(),
  };
  mocks.load.mockResolvedValue([]);
  return render(
    <MemoryRouter initialEntries={[`/settings/integrations/meta${query}`]}>
      <MetaMarketingWorkspace />
      <Location />
    </MemoryRouter>,
  );
}
it("shows connected Page counts, honest unavailable insights and the two marketing lanes", () => {
  mount();
  expect(
    screen.getByRole("heading", { name: "Facebook & Instagram" }),
  ).toBeTruthy();
  const stats = within(
    screen.getByRole("region", { name: "Meta marketing statistics" }),
  );
  expect(
    stats.getByText("Connected Pages").closest("article").textContent,
  ).toContain("1");
  expect(stats.getByText("Reach").closest("article").textContent).toContain(
    "—",
  );
  expect(stats.getByText("Ad spend").closest("article").textContent).toContain(
    "Ad reporting not connected",
  );
  expect(
    screen.getByRole("heading", { name: "Paid advertising" }),
  ).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Organic content" })).toBeTruthy();
  expect(screen.getByText("Kingdom")).toBeTruthy();
});
it("separates paid and organic starters and routes them into the existing editor", async () => {
  mount("?tab=templates&format=social");
  expect(
    await screen.findByRole("heading", { name: "Organic social templates" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Customise New listing" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Customise Seller lead ad" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Paid ad templates" }));
  expect(
    await screen.findByRole("heading", { name: "Meta ads templates" }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Customise Seller lead ad" }),
  );
  expect(screen.getByRole("status").textContent).toContain(
    "format=meta&view=channel-template-create&starter=meta-valuation",
  );
});
it("preserves connection tools and prevents unavailable data from showing as zero", async () => {
  const view = mount("?tab=connections");
  await screen.findByText("Connection settings embedded");
  mocks.workspace = {
    ...mocks.workspace,
    loading: false,
    error: "Connection unavailable",
    canManage: false,
    pages: [],
  };
  view.rerender(
    <MemoryRouter
      initialEntries={["/settings/integrations/meta?tab=connections"]}
    >
      <MetaMarketingWorkspace />
      <Location />
    </MemoryRouter>,
  );
  expect(screen.queryByText("Connection settings embedded")).toBeNull();
  expect(
    screen.getByText(
      "An agency administrator can manage Facebook Page connections and lead forms.",
    ),
  ).toBeTruthy();
  expect(
    screen.getByText("Connected Pages").closest("article").textContent,
  ).toContain("—");
  fireEvent.click(screen.getByRole("button", { name: "Retry connections" }));
  expect(mocks.workspace.refresh).toHaveBeenCalledOnce();
});
it("opens the relevant paid and organic workspaces without publishing content", async () => {
  mount();
  fireEvent.click(
    screen.getByRole("button", { name: "Organic content", exact: true }),
  );
  await screen.findByRole("heading", { name: "Organic social templates" });
  expect(
    screen
      .getByRole("link", { name: "Open Business Suite" })
      .getAttribute("href"),
  ).toBe("https://business.facebook.com/");
  fireEvent.click(
    screen.getByRole("button", { name: "Paid ads", exact: true }),
  );
  await screen.findByRole("heading", { name: "Meta ads templates" });
  expect(
    screen.getByRole("link", { name: "Open Ads Manager" }).getAttribute("href"),
  ).toBe("https://adsmanager.facebook.com/");
});
