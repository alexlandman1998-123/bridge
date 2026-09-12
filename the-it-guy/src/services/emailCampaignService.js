import { supabase } from "../lib/supabaseClient";

const clean = (value) => String(value || "").trim();

export async function getEmailCampaignWorkspace(organisationId) {
  if (!organisationId)
    return {
      campaigns: [],
      performance: [],
      identities: [],
      contacts: [],
      subscriptionTypes: [],
      deliverability: [],
      templates: [],
      savedAudiences: [],
      contactTags: [],
      imageAssets: [],
      usage: [],
      billingProfile: null,
      dailyPerformance: [],
      categoryPerformance: [],
    };
  const [
    campaigns,
    performance,
    identities,
    contacts,
    subscriptionTypes,
    deliverability,
    templates,
    savedAudiences,
    contactTags,
    imageAssets,
    usage,
    billingProfile,
    dailyPerformance,
    categoryPerformance,
  ] = await Promise.all([
    supabase
      .from("email_campaigns")
      .select(
        "*, email_sender_identities(display_name,from_email,reply_to_email)",
      )
      .eq("organisation_id", organisationId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("email_campaign_performance")
      .select("*")
      .eq("organisation_id", organisationId),
    supabase
      .from("email_sender_identities")
      .select("*")
      .eq("organisation_id", organisationId)
      .order("verification_status"),
    supabase
      .from("email_marketing_contacts")
      .select("*")
      .eq("organisation_id", organisationId)
      .eq("is_valid_email", true)
      .order("created_at", { ascending: false })
      .limit(250),
    supabase
      .from("email_subscription_types")
      .select("*")
      .eq("organisation_id", organisationId)
      .eq("is_active", true)
      .order("display_order"),
    supabase
      .from("email_deliverability_health")
      .select("*")
      .eq("organisation_id", organisationId),
    supabase
      .from("email_templates")
      .select("*")
      .eq("organisation_id", organisationId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("email_saved_audiences")
      .select("*, email_saved_audience_members(contact_id)")
      .eq("organisation_id", organisationId)
      .order("updated_at", { ascending: false }),
    supabase.from("email_contact_tags").select("*").eq("organisation_id", organisationId).order("name"),
    supabase.from("email_assets").select("*").eq("organisation_id", organisationId).order("created_at", { ascending: false }),
    supabase
      .from("email_usage_records")
      .select("*")
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("email_billing_profiles")
      .select("*")
      .eq("organisation_id", organisationId)
      .maybeSingle(),
    supabase
      .from("email_campaign_daily_performance")
      .select("*")
      .eq("organisation_id", organisationId)
      .order("metric_date", { ascending: false })
      .limit(30),
    supabase
      .from("email_campaign_category_performance")
      .select("*")
      .eq("organisation_id", organisationId)
      .order("recipients", { ascending: false }),
  ]);
  for (const result of [
    campaigns,
    performance,
    identities,
    contacts,
    subscriptionTypes,
    deliverability,
    templates,
    savedAudiences,
    contactTags,
    imageAssets,
    usage,
    billingProfile,
    dailyPerformance,
    categoryPerformance,
  ])
    if (result.error) throw result.error;
  return {
    campaigns: campaigns.data || [],
    performance: performance.data || [],
    identities: identities.data || [],
    contacts: contacts.data || [],
    subscriptionTypes: subscriptionTypes.data || [],
    deliverability: deliverability.data || [],
    templates: templates.data || [],
    savedAudiences: savedAudiences.data || [],
    contactTags: contactTags.data || [],
    imageAssets: imageAssets.data || [],
    usage: usage.data || [],
    billingProfile: billingProfile.data || null,
    dailyPerformance: dailyPerformance.data || [],
    categoryPerformance: categoryPerformance.data || [],
  };
}

export async function saveEmailCampaign({ campaign, organisationId, userId }) {
  const payload = {
    organisation_id: organisationId,
    name: clean(campaign.name),
    subject: clean(campaign.subject),
    preview_text: clean(campaign.previewText),
    sender_identity_id: campaign.senderIdentityId || null,
    reply_to_email: clean(campaign.replyToEmail) || null,
    subscription_type_id: campaign.subscriptionTypeId || null,
    audience_filter: campaign.audienceFilter || {},
    experiment_json: campaign.experimentJson || {},
    approval_required: Boolean(campaign.approvalRequired),
    content_json: campaign.contentJson || {},
    html: campaign.html || "",
    updated_by: userId || null,
  };
  if (!payload.name || !payload.subject)
    throw new Error("Add a campaign name and subject before saving.");
  const query = campaign.id
    ? supabase
        .from("email_campaigns")
        .update(payload)
        .eq("id", campaign.id)
        .select()
        .single()
    : supabase
        .from("email_campaigns")
        .insert({ ...payload, created_by: userId })
        .select()
        .single();
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function saveEmailAutomation({ organisationId, userId, journey }) {
  const payload = {
    organisation_id: organisationId,
    name: clean(journey.name),
    trigger_key: journey.triggerKey || "manual",
    entry_filter: journey.entryFilter || {},
    reentry_policy: journey.reentryPolicy || "once",
    status: journey.status || "draft",
    created_by: userId || null,
    updated_by: userId || null,
  };
  if (!payload.name) throw new Error("Name the journey before saving it.");
  if (!Array.isArray(journey.steps) || !journey.steps.length)
    throw new Error("Add at least one journey step.");

  const { data, error } = await supabase
    .from("email_automation_journeys")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;

  const steps = journey.steps.map((step, index) => ({
    journey_id: data.id,
    position: index + 1,
    step_type: step.type,
    delay_minutes: step.type === "delay" ? Number(step.delayMinutes) : null,
    campaign_id: step.type === "campaign" ? step.campaignId : null,
    condition_filter: step.conditionFilter || {},
  }));
  const { error: stepError } = await supabase
    .from("email_automation_steps")
    .insert(steps);
  if (stepError) throw stepError;
  return data;
}

export async function getEmailAutomationJourneys(organisationId) {
  if (!organisationId) return [];
  const [journeys, health] = await Promise.all([
    supabase
      .from("email_automation_journeys")
      .select("*, email_automation_steps(*)")
      .eq("organisation_id", organisationId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("email_automation_journey_health")
      .select("*")
      .eq("organisation_id", organisationId),
  ]);
  if (journeys.error) throw journeys.error;
  if (health.error) throw health.error;
  const healthByJourney = new Map((health.data || []).map((row) => [row.journey_id, row]));
  return (journeys.data || []).map((journey) => ({ ...journey, health: healthByJourney.get(journey.id) || null }));
}

export async function setEmailAutomationJourneyStatus({ journeyId, status }) {
  const { data, error } = await supabase.rpc(
    "email_automation_set_journey_status",
    { p_journey_id: journeyId, p_status: status },
  );
  if (error) throw error;
  return data;
}

export async function importEmailAudience({
  organisationId,
  userId,
  fileName,
  totalRows,
  rejectedRows,
  mapping,
  rows,
}) {
  if (!rows.length) throw new Error("There are no valid contacts to import.");
  if (rows.length > 500)
    throw new Error("Import 500 valid contacts or fewer at a time.");
  const { data: job, error: jobError } = await supabase
    .from("email_audience_imports")
    .insert({
      organisation_id: organisationId,
      file_name: clean(fileName) || "contacts.csv",
      total_rows: Number(totalRows) || rows.length,
      accepted_rows: 0,
      rejected_rows: Number(rejectedRows) || 0,
      mapping_json: mapping || {},
      created_by: userId || null,
    })
    .select()
    .single();
  if (jobError) throw jobError;
  const { data, error } = await supabase.rpc("email_audience_import_apply", {
    p_import_id: job.id,
    p_rows: rows,
  });
  if (error) {
    await supabase
      .from("email_audience_imports")
      .update({ status: "failed", error_summary: { message: error.message } })
      .eq("id", job.id);
    throw error;
  }
  return { ...job, accepted_rows: Number(data || 0), status: "completed" };
}

export async function getEmailCampaignApprovals(organisationId) {
  const { data, error } = await supabase
    .from("email_campaign_approvals")
    .select("*")
    .eq("organisation_id", organisationId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

export async function setEmailCampaignApproval({ campaignId, decision, comment }) {
  const { data, error } = await supabase.rpc("email_campaign_set_approval", {
    p_campaign_id: campaignId,
    p_decision: decision,
    p_comment: clean(comment),
  });
  if (error) throw error;
  return data;
}

export async function enqueueEmailAutomationEvent({ organisationId, contactId, eventKey = "manual", payload = {} }) {
  const { data, error } = await supabase.rpc("email_automation_enqueue_event", {
    p_organisation_id: organisationId,
    p_contact_id: contactId,
    p_event_key: eventKey,
    p_payload: payload,
  });
  if (error) throw error;
  return data;
}

export async function enqueueEmailAutomationManualEvent({ journeyId, contactId }) {
  const { data, error } = await supabase.rpc(
    "email_automation_enqueue_manual_event",
    { p_journey_id: journeyId, p_contact_id: contactId },
  );
  if (error) throw error;
  return data;
}

export async function scheduleEmailCampaign(campaignId, scheduledFor) {
  const { data, error } = await supabase.rpc(
    "email_campaign_prepare_dispatch",
    {
      p_campaign_id: campaignId,
      p_send_at: scheduledFor || new Date().toISOString(),
    },
  );
  if (error) throw error;
  return data;
}

export async function cancelEmailCampaign(campaignId) {
  const { error } = await supabase.rpc("email_campaign_cancel", {
    p_campaign_id: campaignId,
  });
  if (error) throw error;
}

export async function preflightEmailCampaign(campaignId) {
  const { data, error } = await supabase.rpc("email_campaign_preflight", {
    p_campaign_id: campaignId,
  });
  if (error) throw error;
  return data;
}

export async function duplicateEmailCampaign(campaignId, name) {
  const { data, error } = await supabase.rpc("email_campaign_duplicate", {
    p_campaign_id: campaignId,
    p_name: clean(name) || null,
  });
  if (error) throw error;
  return data;
}

export async function archiveEmailCampaign(campaignId) {
  const { error } = await supabase.rpc("email_campaign_archive", {
    p_campaign_id: campaignId,
  });
  if (error) throw error;
}

export async function quoteEmailCampaignUsage(campaignId, recipientCount) {
  const { data, error } = await supabase.rpc("email_campaign_quote_usage", {
    p_campaign_id: campaignId,
    p_recipient_count: Number.isFinite(Number(recipientCount))
      ? Number(recipientCount)
      : null,
  });
  if (error) throw error;
  return data;
}

export async function sendEmailCampaignTest(payload) {
  const { data, error } = await supabase.functions.invoke(
    "email-campaign-test",
    { body: payload },
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function refreshEmailSenderVerification(organisationId) {
  const { data, error } = await supabase.functions.invoke(
    "email-sender-verification",
    { body: { organisationId } },
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function saveEmailTemplate({ organisationId, userId, template }) {
  const payload = {
    organisation_id: organisationId,
    name: clean(template.name),
    category: clean(template.category) || "custom",
    html: template.html || "",
    design_json: template.designJson || {
      source: "html_upload",
      schema_version: 1,
    },
    created_by: userId || null,
  };
  if (!payload.name) throw new Error("Name this template before saving it.");
  if (!payload.html.trim())
    throw new Error("Add HTML before saving this template.");
  const query = template.id
    ? supabase
        .from("email_templates")
        .update(payload)
        .eq("id", template.id)
        .select()
        .single()
    : supabase.from('email_templates').insert(payload).select().single();
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function previewEmailAudience({
  organisationId,
  subscriptionTypeId,
  audienceFilter,
}) {
  if (!organisationId || !subscriptionTypeId) return 0;
  const { data, error } = await supabase.rpc(
    "email_campaign_preview_audience",
    {
      p_organisation_id: organisationId,
      p_subscription_type_id: subscriptionTypeId,
      p_filter: audienceFilter || {},
    },
  );
  if (error) throw error;
  return Number(data || 0);
}

export async function previewEmailAudienceDetail({
  organisationId,
  subscriptionTypeId,
  audienceFilter,
}) {
  if (!organisationId || !subscriptionTypeId) return null;
  const { data, error } = await supabase.rpc(
    "email_campaign_preview_audience_detail",
    {
      p_organisation_id: organisationId,
      p_subscription_type_id: subscriptionTypeId,
      p_filter: audienceFilter || {},
    },
  );
  if (error) throw error;
  return data || null;
}

export async function saveEmailAudience({ organisationId, userId, audience }) {
  const payload = {
    organisation_id: organisationId,
    name: clean(audience.name),
    description: clean(audience.description),
    filter_json: audience.filterJson || {},
    audience_kind: audience.audienceKind === "static" ? "static" : "dynamic",
    created_by: userId || null,
    updated_by: userId || null,
  };
  if (!payload.name) throw new Error("Name this audience before saving it.");
  const query = audience.id
    ? supabase
        .from("email_saved_audiences")
        .update(payload)
        .eq("id", audience.id)
        .select()
        .single()
    : supabase.from("email_saved_audiences").insert(payload).select().single();
  const { data, error } = await query;
  if (error) throw error;
  if (payload.audience_kind === "static") {
    const { error: memberError } = await supabase.rpc(
      "email_saved_audience_set_members",
      { p_audience_id: data.id, p_contact_ids: audience.memberIds || [] },
    );
    if (memberError) throw memberError;
  }
  return data;
}

export async function createEmailContactTag({ organisationId, userId, name }) {
  const cleanedName = clean(name);
  if (!cleanedName) throw new Error("Name the tag before saving it.");
  const slug = cleanedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const { data, error } = await supabase.from("email_contact_tags").insert({ organisation_id: organisationId, name: cleanedName, slug, created_by: userId || null }).select().single();
  if (error) throw error;
  return data;
}

export async function assignEmailContactTag({ contactIds, tagId }) {
  const { data, error } = await supabase.rpc("email_assign_contact_tag", { p_contact_ids: contactIds || [], p_tag_id: tagId });
  if (error) throw error;
  return Number(data || 0);
}

export async function uploadEmailImageAsset({ organisationId, userId, file, altText = "" }) {
  if (!file || !['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) throw new Error("Choose a JPEG, PNG, WebP or GIF image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Images must be 5 MB or smaller.");
  const extension = clean(file.name).split('.').pop().replace(/[^a-z0-9]/gi, '') || 'jpg';
  const path = `${organisationId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("email-assets").upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { data: publicUrlData } = supabase.storage.from("email-assets").getPublicUrl(path);
  const { data, error } = await supabase.from("email_assets").insert({ organisation_id: organisationId, storage_path: path, public_url: publicUrlData.publicUrl, file_name: clean(file.name), mime_type: file.type, byte_size: file.size, alt_text: clean(altText), created_by: userId || null }).select().single();
  if (error) { await supabase.storage.from("email-assets").remove([path]); throw error; }
  return data;
}

export async function getEmailCampaignAnalytics(campaignId) {
  if (!campaignId) return { recipients: [], events: [], links: [], audit: [], experiment: null };
  const [recipients, events, links, audit, experiment] = await Promise.all([
    supabase
      .from("email_campaign_recipients")
      .select(
        "id,email,recipient_snapshot,status,error_reason,sent_at,delivered_at,opened_at,clicked_at,bounced_at",
      )
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false }),
    supabase
      .from("email_events")
      .select("id,recipient_id,event_type,url,occurred_at")
      .eq("campaign_id", campaignId)
      .order("occurred_at", { ascending: false })
      .limit(500),
    supabase
      .from("email_campaign_link_performance")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("unique_clickers", { ascending: false }),
    supabase
      .from("email_campaign_audit_events")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("email_campaign_experiments")
      .select("*")
      .eq("campaign_id", campaignId)
      .maybeSingle(),
  ]);
  for (const result of [recipients, events, links, audit, experiment])
    if (result.error) throw result.error;
  return {
    recipients: recipients.data || [],
    events: events.data || [],
    links: links.data || [],
    audit: audit.data || [],
    experiment: experiment.data || null,
  };
}
