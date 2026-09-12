import { useSearchParams } from "react-router-dom";
import {
  CreateEmailCampaign,
  EmailAudienceImportStudio,
  EmailAutomationStudio,
  EmailCampaignPlanning,
  EmailCampaignDetail,
  EmailCampaignOverview,
} from "../components/marketing/EmailCampaigns";
import { LaunchesOverview } from "../components/marketing/LaunchesAuctions";
import MarketingDashboard from "../components/marketing/MarketingDashboard";
import WebsiteWorkspace from "../components/marketing/WebsiteWorkspace";
import {
  ShowDayDetail,
  ShowDaysOverview,
} from "../components/marketing/ShowDays";
import {
  CreateWhatsAppCampaign,
  WhatsAppCampaignOverview,
} from "../components/marketing/WhatsAppCampaigns";
import "./MarketingComingSoonPage.css";
import "./WhatsAppCampaigns.css";
import "./EmailCampaigns.css";
import "./ShowDays.css";
import "./LaunchesAuctions.css";
import "./MarketingDashboard.css";

export default function MarketingComingSoonPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const section = searchParams.get("section");
  const campaignView = searchParams.get("view");

  if (section === "launches") return <LaunchesOverview />;

  if (section === "show-days") {
    const openOverview = () => setSearchParams({ section: "show-days" });
    const openShowDay = (showDayId) =>
      setSearchParams({ section: "show-days", view: "detail", id: showDayId });
    return campaignView === "detail" ? (
      <ShowDayDetail onBack={openOverview} showDayId={searchParams.get("id")} />
    ) : (
      <ShowDaysOverview onOpenShowDay={openShowDay} />
    );
  }

  if (section === "email") {
    const openOverview = () => setSearchParams({ section: "email" });
    const openCreateCampaign = (starter = null) =>
      setSearchParams(
        starter?.campaignId
          ? { section: "email", view: "create", id: starter.campaignId }
          : starter
            ? {
                section: "email",
                view: "create",
                starter: JSON.stringify(starter),
              }
            : { section: "email", view: "create" },
      );
    const openCampaign = (id) =>
      setSearchParams({ section: "email", view: "detail", id });
    const openAutomations = () =>
      setSearchParams({ section: "email", view: "automation" });
    const openImport = () =>
      setSearchParams({ section: "email", view: "import" });
    const openPlanning = () =>
      setSearchParams({ section: "email", view: "planning" });
    let initialDraft = null;
    try {
      initialDraft = searchParams.get("starter")
        ? JSON.parse(searchParams.get("starter"))
        : null;
    } catch {
      initialDraft = null;
    }
    return campaignView === "planning" ? (
      <EmailCampaignPlanning onBack={openOverview} />
    ) : campaignView === "import" ? (
      <EmailAudienceImportStudio onBack={openOverview} />
    ) : campaignView === "automation" ? (
      <EmailAutomationStudio onBack={openOverview} />
    ) : campaignView === "create" ? (
      <CreateEmailCampaign
        onBack={openOverview}
        campaignId={searchParams.get("id")}
        initialDraft={initialDraft}
      />
    ) : campaignView === "detail" ? (
      <EmailCampaignDetail
        campaignId={searchParams.get("id")}
        onBack={openOverview}
        onEdit={openCreateCampaign}
      />
    ) : (
      <EmailCampaignOverview
        onCreateCampaign={openCreateCampaign}
        onOpenCampaign={openCampaign}
        onOpenAutomations={openAutomations}
        onOpenImport={openImport}
        onOpenPlanning={openPlanning}
      />
    );
  }

  if (section === "whatsapp") {
    const openOverview = () => setSearchParams({ section: "whatsapp" });
    const openCreateCampaign = () =>
      setSearchParams({ section: "whatsapp", view: "create" });
    return campaignView === "create" ? (
      <CreateWhatsAppCampaign onBack={openOverview} />
    ) : (
      <WhatsAppCampaignOverview onCreateCampaign={openCreateCampaign} />
    );
  }

  if (section === "website")
    return <WebsiteWorkspace onBack={() => setSearchParams({})} />;

  const openMarketingSection = (nextSection) =>
    setSearchParams({ section: nextSection });
  return <MarketingDashboard onNavigate={openMarketingSection} />;
}
