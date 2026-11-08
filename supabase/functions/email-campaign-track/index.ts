import { withApiCredentials } from "../_shared/apiCredentials.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.9";
import { createCampaignTrackingHandler } from "./handler.ts";
Deno.serve(withApiCredentials(createCampaignTrackingHandler({ createClient, env: key => Deno.env.get(key), defer: task => { if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(task); } })));
