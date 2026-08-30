import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import Stripe from "https://esm.sh/stripe@14.4.0?target=deno";
import {
  allowedOrigins,
  checkoutIdempotencyKey,
  CURRENT_SUBSCRIPTION_STATUSES,
  requireEnv,
  UUID_PATTERN,
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
    const supabaseUrl = requireEnv(Deno.env.get, "SUPABASE_URL");
    const anonKey = requireEnv(Deno.env.get, "SUPABASE_ANON_KEY");
    const serviceKey = requireEnv(Deno.env.get, "SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = requireEnv(Deno.env.get, "STRIPE_SECRET_KEY");
    const appUrl = requireEnv(Deno.env.get, "APP_URL");
    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Authentication required" }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: auth, error: authError } = await authClient.auth.getUser();
    if (authError || !auth.user) {
      return json({ error: "Authentication required" }, 401);
    }

    const body = await req.json();
    if (
      !body.account_id ||
      !body.plan_id ||
      typeof body.checkout_attempt_id !== "string" ||
      !UUID_PATTERN.test(body.checkout_attempt_id)
    ) {
      return json({ error: "Missing or invalid required fields" }, 400);
    }
    const origins = allowedOrigins(
      appUrl,
      Deno.env.get("ALLOWED_ORIGINS") ?? "",
    );
    const successUrl = validateRedirect(
      body.success_url,
      origins,
      `${appUrl}/billing?success=1`,
    );
    const cancelUrl = validateRedirect(
      body.cancel_url,
      origins,
      `${appUrl}/billing?canceled=1`,
    );
    const admin = createClient(supabaseUrl, serviceKey);

    const [
      { data: membership },
      { data: plan, error: planError },
      { data: current },
    ] = await Promise.all([
      admin
        .from("account_members")
        .select("role")
        .eq("account_id", body.account_id)
        .eq("user_id", auth.user.id)
        .maybeSingle(),
      admin
        .from("credit_plans")
        .select(
          "id,code,stripe_price_id,price_cents,currency,interval,is_active",
        )
        .eq("id", body.plan_id)
        .eq("is_active", true)
        .single(),
      admin
        .from("subscriptions")
        .select("id,status")
        .eq("account_id", body.account_id)
        .eq("is_current", true)
        .in("status", [...CURRENT_SUBSCRIPTION_STATUSES])
        .limit(1)
        .maybeSingle(),
    ]);
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return json(
        { error: "Only account owners or admins can manage billing" },
        403,
      );
    }
    if (planError || !plan || !plan.stripe_price_id || plan.price_cents <= 0) {
      return json({ error: "Paid plan is unavailable" }, 400);
    }
    if (current) {
      return json({ error: "Account already has a current subscription" }, 409);
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });
    const price = await stripe.prices.retrieve(plan.stripe_price_id);
    if (
      !price.active ||
      price.type !== "recurring" ||
      price.unit_amount !== plan.price_cents ||
      price.currency !== plan.currency ||
      price.recurring?.interval !== plan.interval
    ) {
      console.error("Plan/Stripe price mismatch", {
        plan: plan.code,
        price: price.id,
      });
      return json({ error: "Plan configuration mismatch" }, 409);
    }

    const { data: mapped } = await admin
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("account_id", body.account_id)
      .maybeSingle();
    let customerId = mapped?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: auth.user.email,
          metadata: { account_id: body.account_id },
        },
        { idempotencyKey: `customer:${body.account_id}` },
      );
      customerId = customer.id;
      const { error } = await admin.from("billing_customers").upsert(
        {
          account_id: body.account_id,
          stripe_customer_id: customerId,
          email: auth.user.email,
        },
        { onConflict: "account_id" },
      );
      if (error) throw error;
    }

    const metadata = { account_id: body.account_id, plan_code: plan.code };
    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        subscription_data: { metadata },
      },
      {
        idempotencyKey: checkoutIdempotencyKey(
          body.account_id,
          plan.code,
          body.checkout_attempt_id,
        ),
      },
    );
    return json({ url: session.url });
  } catch (error) {
    console.error("Checkout creation failed", error);
    return json(
      {
        error: error instanceof Error && error.message.includes("Redirect")
          ? error.message
          : "Unable to create checkout session",
      },
      error instanceof Error && error.message.includes("Redirect") ? 400 : 500,
    );
  }
});
