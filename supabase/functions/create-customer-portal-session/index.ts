import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import Stripe from "https://esm.sh/stripe@14.4.0?target=deno";
import {
  allowedOrigins,
  requireEnv,
  validateRedirect,
} from "../_shared/billing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = requireEnv(Deno.env.get, "SUPABASE_URL"),
      anon = requireEnv(Deno.env.get, "SUPABASE_ANON_KEY");
    const service = requireEnv(Deno.env.get, "SUPABASE_SERVICE_ROLE_KEY"),
      stripeKey = requireEnv(Deno.env.get, "STRIPE_SECRET_KEY");
    const appUrl = requireEnv(Deno.env.get, "APP_URL"),
      authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Authentication required" }, 401);
    const authClient = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: auth } = await authClient.auth.getUser();
    if (!auth.user) return json({ error: "Authentication required" }, 401);
    const body = await req.json(),
      admin = createClient(url, service);
    if (!body.account_id) return json({ error: "Missing account_id" }, 400);
    const [{ data: membership }, { data: customer }] = await Promise.all([
      admin
        .from("account_members")
        .select("role")
        .eq("account_id", body.account_id)
        .eq("user_id", auth.user.id)
        .maybeSingle(),
      admin
        .from("billing_customers")
        .select("stripe_customer_id")
        .eq("account_id", body.account_id)
        .maybeSingle(),
    ]);
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return json(
        { error: "Only account owners or admins can manage billing" },
        403,
      );
    }
    if (!customer) return json({ error: "Billing customer not found" }, 404);
    const returnUrl = validateRedirect(
      body.return_url,
      allowedOrigins(appUrl, Deno.env.get("ALLOWED_ORIGINS") ?? ""),
      `${appUrl}/billing`,
    );
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: returnUrl,
    });
    return json({ url: session.url });
  } catch (error) {
    console.error("Portal creation failed", error);
    return json({ error: "Unable to create customer portal session" }, 500);
  }
});
