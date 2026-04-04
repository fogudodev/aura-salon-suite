import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { callProvider as callGemini } from "./ai-providers/gemini.ts";
import { callProvider as callGroq } from "./ai-providers/groq.ts";
import { callProvider as callOpenAI } from "./ai-providers/openai.ts";
import type { AIMessage, AIProviderCallError, AIProviderCallSuccess, AIProviderName } from "./ai-types.ts";
import { insertWhatsAppEventLog } from "./whatsapp.ts";

type RoutingTier = "cheap" | "strong" | "premium";

type AIProviderSettingsRow = {
  professional_id: string;
  primary_provider: AIProviderName | null;
  primary_model: string | null;
  fallback_provider: AIProviderName | null;
  fallback_model: string | null;
  monthly_budget_cents: number | null;
  hard_stop_on_budget: boolean | null;
};

type CircuitBreakerRow = {
  professional_id: string;
  provider: AIProviderName;
  consecutive_failures: number;
  circuit_open_until: string | null;
  last_failure_at: string | null;
  last_failure_code: string | null;
};

type AIContext = {
  useCase?: "whatsapp_reply" | "campaign" | "upsell" | "assistant" | string;
  systemPrompt?: string;
  messages?: AIMessage[];
  conversationId?: string;
  bookingId?: string;
  automationId?: string;
  instanceName?: string;
  messageId?: string;
  clientIdentifier?: string;
  normalizedPhone?: string;
  selectedService?: string | null;
  selectedDate?: string | null;
  selectedTime?: string | null;
  temperature?: number;
  maxTokens?: number;
};

type GenerateAIResponseParams = {
  professionalId: string;
  message: string;
  context?: AIContext;
};

type GenerateAIResponseResult = {
  text: string;
  provider: string;
  model: string;
  latency_ms: number;
  input_tokens?: number;
  output_tokens?: number;
  fallback_used: boolean;
};

type ProviderPlan = {
  provider: AIProviderName;
  model: string;
};

// Final guardrail when every provider path is unavailable.
const SAFE_RESPONSE = "Recebi sua mensagem 💬 Já vou te responder!";
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = Number(Deno.env.get("AI_CIRCUIT_BREAKER_FAILURE_THRESHOLD") || "3");
const CIRCUIT_BREAKER_COOLDOWN_MS = Number(Deno.env.get("AI_CIRCUIT_BREAKER_COOLDOWN_MS") || "300000");
const MAX_RETRIES_PER_PROVIDER = Number(Deno.env.get("AI_PROVIDER_MAX_RETRIES") || "2");
const BASE_RETRY_DELAY_MS = Number(Deno.env.get("AI_PROVIDER_BASE_RETRY_DELAY_MS") || "500");

const MODEL_CATALOG: Record<AIProviderName, Record<RoutingTier, string>> = {
  openai: {
    cheap: Deno.env.get("OPENAI_CHEAP_MODEL") || "gpt-5.4-mini",
    strong: Deno.env.get("OPENAI_STRONG_MODEL") || "gpt-5.4",
    premium: Deno.env.get("OPENAI_PREMIUM_MODEL") || "gpt-5.4",
  },
  groq: {
    cheap: Deno.env.get("GROQ_CHEAP_MODEL") || "llama-3.1-8b-instant",
    strong: Deno.env.get("GROQ_STRONG_MODEL") || "llama-3.3-70b-versatile",
    premium: Deno.env.get("GROQ_PREMIUM_MODEL") || "llama-3.3-70b-versatile",
  },
  gemini: {
    cheap: Deno.env.get("GEMINI_CHEAP_MODEL") || "gemini-2.0-flash",
    strong: Deno.env.get("GEMINI_STRONG_MODEL") || "gemini-2.5-flash",
    premium: Deno.env.get("GEMINI_PREMIUM_MODEL") || "gemini-2.5-flash",
  },
};

const MODEL_PRICING_PER_MILLION_CENTS: Record<string, { input: number; output: number }> = {
  "gpt-5.4-mini": { input: 25, output: 200 },
  "gpt-5.4": { input: 125, output: 1000 },
  "llama-3.1-8b-instant": { input: 5, output: 8 },
  "llama-3.3-70b-versatile": { input: 59, output: 79 },
  "gemini-2.0-flash": { input: 10, output: 40 },
  "gemini-2.5-flash": { input: 30, output: 120 },
};

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstDayOfMonthIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function getDefaultSettings(professionalId: string): AIProviderSettingsRow {
  return {
    professional_id: professionalId,
    primary_provider: "gemini",
    primary_model: MODEL_CATALOG.gemini.strong,
    fallback_provider: "groq",
    fallback_model: MODEL_CATALOG.groq.cheap,
    monthly_budget_cents: 0,
    hard_stop_on_budget: false,
  };
}

async function readProviderSettings(supabase: SupabaseClient, professionalId: string) {
  const { data, error } = await supabase
    .from("ai_provider_settings" as never)
    .select("professional_id, primary_provider, primary_model, fallback_provider, fallback_model, monthly_budget_cents, hard_stop_on_budget")
    .eq("professional_id", professionalId)
    .maybeSingle();

  if (error) {
    console.error("ai_provider_settings read error:", error);
    return getDefaultSettings(professionalId);
  }

  return (data as AIProviderSettingsRow | null) || getDefaultSettings(professionalId);
}

async function readMonthlySpendCents(supabase: SupabaseClient, professionalId: string) {
  const { data, error } = await supabase
    .from("whatsapp_event_logs" as never)
    .select("estimated_cost")
    .eq("professional_id", professionalId)
    .eq("event_type", "ai_request_succeeded")
    .gte("created_at", firstDayOfMonthIso());

  if (error) {
    console.error("monthly ai spend read error:", error);
    return 0;
  }

  return ((data || []) as Array<{ estimated_cost?: number | string | null }>)
    .reduce((total, row) => total + (Number(row.estimated_cost || 0) || 0), 0);
}

function hasKeyForProvider(provider: AIProviderName) {
  if (provider === "openai") return !!(Deno.env.get("OPENAI_API_KEY") || "").trim();
  if (provider === "groq") return !!(Deno.env.get("GROQ_API_KEY") || "").trim();
  return !!(Deno.env.get("GEMINI_API_KEY") || "").trim();
}

// Keep routing deterministic and cheap before escalating to stronger models.
function classifyMessageTier(params: GenerateAIResponseParams): RoutingTier {
  const message = params.message.toLowerCase();
  const context = params.context || {};
  const useCase = (context.useCase || "").toLowerCase();

  if (useCase === "upsell" || useCase === "campaign") return "premium";
  if (useCase === "assistant") return "strong";

  const strongIntentKeywords = ["agendar", "agenda", "horário", "horario", "preço", "preco", "valor", "cancelar", "reagendar", "curso", "pacote", "comprar", "desconto", "promo", "link"];

  if (strongIntentKeywords.some((keyword) => message.includes(keyword))) return "strong";
  if (context.selectedService || context.selectedDate || context.selectedTime) return "strong";
  if (message.length > 120) return "strong";
  return "cheap";
}

function buildMessages(params: GenerateAIResponseParams) {
  const context = params.context || {};
  const providedMessages = Array.isArray(context.messages) ? context.messages.filter((message) => message?.content) : [];
  const messages = providedMessages.length > 0
    ? providedMessages
    : [{ role: "user", content: params.message } satisfies AIMessage];

  if (!context.systemPrompt) return messages;
  if (messages[0]?.role === "system") return [{ role: "system", content: context.systemPrompt }, ...messages.slice(1)];
  return [{ role: "system", content: context.systemPrompt }, ...messages];
}

// Primary + fallback provider order per professional, filtered by available credentials.
function buildProviderPlan(settings: AIProviderSettingsRow, tier: RoutingTier): ProviderPlan[] {
  const primaryProvider = settings.primary_provider || "gemini";
  const fallbackProvider = settings.fallback_provider || (primaryProvider === "gemini" ? "groq" : "gemini");

  const primaryModel = tier === "cheap"
    ? MODEL_CATALOG[primaryProvider].cheap
    : (settings.primary_model || MODEL_CATALOG[primaryProvider][tier]);

  const fallbackModel = tier === "cheap"
    ? MODEL_CATALOG[fallbackProvider].cheap
    : (settings.fallback_model || MODEL_CATALOG[fallbackProvider][tier === "premium" ? "premium" : "strong"]);

  return [
    { provider: primaryProvider, model: primaryModel },
    { provider: fallbackProvider, model: fallbackModel },
  ].filter((plan, index, list) =>
    !!plan.model &&
    hasKeyForProvider(plan.provider) &&
    list.findIndex((candidate) => candidate.provider === plan.provider && candidate.model === plan.model) === index
  );
}

async function readCircuitBreaker(supabase: SupabaseClient, professionalId: string, provider: AIProviderName) {
  const { data, error } = await supabase
    .from("ai_provider_circuit_breakers" as never)
    .select("professional_id, provider, consecutive_failures, circuit_open_until, last_failure_at, last_failure_code")
    .eq("professional_id", professionalId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    console.error("circuit breaker read error:", error);
    return null;
  }

  return (data as CircuitBreakerRow | null) || null;
}

async function markProviderSuccess(supabase: SupabaseClient, professionalId: string, provider: AIProviderName) {
  const { error } = await supabase
    .from("ai_provider_circuit_breakers" as never)
    .upsert({
      professional_id: professionalId,
      provider,
      consecutive_failures: 0,
      circuit_open_until: null,
      last_failure_at: null,
      last_failure_code: null,
    } as never, { onConflict: "professional_id,provider" });

  if (error) console.error("circuit breaker success upsert error:", error);
}

async function markProviderFailure(supabase: SupabaseClient, professionalId: string, provider: AIProviderName, errorCode: string) {
  const current = await readCircuitBreaker(supabase, professionalId, provider);
  const consecutiveFailures = (current?.consecutive_failures || 0) + 1;
  const shouldOpenCircuit = consecutiveFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD;

  const { error } = await supabase
    .from("ai_provider_circuit_breakers" as never)
    .upsert({
      professional_id: professionalId,
      provider,
      consecutive_failures: consecutiveFailures,
      circuit_open_until: shouldOpenCircuit ? new Date(Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS).toISOString() : null,
      last_failure_at: new Date().toISOString(),
      last_failure_code: errorCode,
    } as never, { onConflict: "professional_id,provider" });

  if (error) console.error("circuit breaker failure upsert error:", error);
}

function isCircuitOpen(state: CircuitBreakerRow | null) {
  if (!state?.circuit_open_until) return false;
  return new Date(state.circuit_open_until).getTime() > Date.now();
}

function estimateCostCents(provider: AIProviderName, model: string, inputTokens?: number, outputTokens?: number) {
  const pricing = MODEL_PRICING_PER_MILLION_CENTS[model] || MODEL_PRICING_PER_MILLION_CENTS[MODEL_CATALOG[provider].cheap];
  const inputCost = ((inputTokens || 0) / 1_000_000) * pricing.input;
  const outputCost = ((outputTokens || 0) / 1_000_000) * pricing.output;
  return Number((inputCost + outputCost).toFixed(4));
}

function isRetryableError(error: AIProviderCallError) {
  return error.retryable === true || [408, 409, 425, 429].includes(Number(error.statusCode || 0)) || Number(error.statusCode || 0) >= 500;
}

async function callProviderByName(provider: AIProviderName, input: { model: string; messages: AIMessage[]; temperature?: number; maxTokens?: number }) {
  if (provider === "openai") return await callOpenAI(input);
  if (provider === "groq") return await callGroq(input);
  return await callGemini(input);
}

function sanitizeResponseText(text: string) {
  return text.trim() || SAFE_RESPONSE;
}

// Central AI orchestration entrypoint used by Edge Functions.
export async function generateAIResponse(params: GenerateAIResponseParams): Promise<GenerateAIResponseResult> {
  const supabase = getSupabaseAdmin();
  const context = params.context || {};
  const tier = classifyMessageTier(params);
  const settings = await readProviderSettings(supabase, params.professionalId);
  const monthlySpendCents = await readMonthlySpendCents(supabase, params.professionalId);
  const budgetCents = Number(settings.monthly_budget_cents || 0) || 0;

  await insertWhatsAppEventLog(supabase, {
    professionalId: params.professionalId,
    conversationId: context.conversationId || null,
    automationId: context.automationId || null,
    bookingId: context.bookingId || null,
    instanceName: context.instanceName || null,
    direction: "system",
    eventType: "ai_request_started",
    messageId: context.messageId || null,
    clientIdentifier: context.clientIdentifier || null,
    normalizedPhone: context.normalizedPhone || null,
    status: "processing",
    details: {
      use_case: context.useCase || "default",
      routing_tier: tier,
      monthly_spend_cents: monthlySpendCents,
      monthly_budget_cents: budgetCents,
    },
  });

  if (budgetCents > 0 && monthlySpendCents >= budgetCents && settings.hard_stop_on_budget) {
    await insertWhatsAppEventLog(supabase, {
      professionalId: params.professionalId,
      conversationId: context.conversationId || null,
      automationId: context.automationId || null,
      bookingId: context.bookingId || null,
      instanceName: context.instanceName || null,
      direction: "system",
      eventType: "ai_budget_blocked",
      messageId: context.messageId || null,
      clientIdentifier: context.clientIdentifier || null,
      normalizedPhone: context.normalizedPhone || null,
      status: "blocked",
      provider: "budget_guard",
      model: "safe_response",
      estimatedCost: 0,
      fallbackUsed: false,
      errorCode: "AI_BUDGET_EXCEEDED",
      details: {
        monthly_spend_cents: monthlySpendCents,
        monthly_budget_cents: budgetCents,
      },
    });

    return {
      text: SAFE_RESPONSE,
      provider: "budget_guard",
      model: "safe_response",
      latency_ms: 0,
      fallback_used: false,
    };
  }

  const plans = buildProviderPlan(settings, budgetCents > 0 && monthlySpendCents >= budgetCents ? "cheap" : tier);
  const messages = buildMessages(params);
  let totalLatency = 0;
  const attemptedProviders: ProviderPlan[] = [];

  for (let planIndex = 0; planIndex < plans.length; planIndex += 1) {
    const plan = plans[planIndex];
    const circuit = await readCircuitBreaker(supabase, params.professionalId, plan.provider);

    if (isCircuitOpen(circuit)) {
      await insertWhatsAppEventLog(supabase, {
        professionalId: params.professionalId,
        conversationId: context.conversationId || null,
        automationId: context.automationId || null,
        bookingId: context.bookingId || null,
        instanceName: context.instanceName || null,
        provider: plan.provider,
        direction: "system",
        eventType: "ai_provider_circuit_open",
        messageId: context.messageId || null,
        clientIdentifier: context.clientIdentifier || null,
        normalizedPhone: context.normalizedPhone || null,
        status: "skipped",
        model: plan.model,
        fallbackUsed: planIndex > 0,
        errorCode: "AI_CIRCUIT_OPEN",
        details: {
          circuit_open_until: circuit?.circuit_open_until || null,
        },
      });
      continue;
    }

    attemptedProviders.push(plan);

    for (let attempt = 0; attempt <= MAX_RETRIES_PER_PROVIDER; attempt += 1) {
      const attemptNumber = attempt + 1;
      const startedAt = Date.now();

      await insertWhatsAppEventLog(supabase, {
        professionalId: params.professionalId,
        conversationId: context.conversationId || null,
        automationId: context.automationId || null,
        bookingId: context.bookingId || null,
        instanceName: context.instanceName || null,
        provider: plan.provider,
        direction: "system",
        eventType: "ai_provider_attempt",
        messageId: context.messageId || null,
        clientIdentifier: context.clientIdentifier || null,
        normalizedPhone: context.normalizedPhone || null,
        status: "attempting",
        model: plan.model,
        fallbackUsed: planIndex > 0,
        details: {
          attempt_number: attemptNumber,
          use_case: context.useCase || "default",
          routing_tier: tier,
        },
      });

      try {
        const providerResult: AIProviderCallSuccess = await callProviderByName(plan.provider, {
          model: plan.model,
          messages,
          temperature: context.temperature ?? 0.3,
          maxTokens: context.maxTokens,
        });

        totalLatency += providerResult.latencyMs;
        const estimatedCost = estimateCostCents(plan.provider, providerResult.model, providerResult.inputTokens, providerResult.outputTokens);

        await markProviderSuccess(supabase, params.professionalId, plan.provider);

        await insertWhatsAppEventLog(supabase, {
          professionalId: params.professionalId,
          conversationId: context.conversationId || null,
          automationId: context.automationId || null,
          bookingId: context.bookingId || null,
          instanceName: context.instanceName || null,
          provider: providerResult.provider,
          direction: "system",
          eventType: "ai_request_succeeded",
          messageId: context.messageId || null,
          clientIdentifier: context.clientIdentifier || null,
          normalizedPhone: context.normalizedPhone || null,
          status: "processed",
          model: providerResult.model,
          latencyMs: providerResult.latencyMs,
          inputTokens: providerResult.inputTokens,
          outputTokens: providerResult.outputTokens,
          estimatedCost,
          fallbackUsed: planIndex > 0,
          details: {
            attempt_number: attemptNumber,
            use_case: context.useCase || "default",
            routing_tier: tier,
          },
        });

        return {
          text: sanitizeResponseText(providerResult.text),
          provider: providerResult.provider,
          model: providerResult.model,
          latency_ms: totalLatency || providerResult.latencyMs,
          input_tokens: providerResult.inputTokens,
          output_tokens: providerResult.outputTokens,
          fallback_used: planIndex > 0,
        };
      } catch (rawError) {
        const error = rawError as AIProviderCallError;
        const latencyMs = Date.now() - startedAt;
        totalLatency += latencyMs;

        await markProviderFailure(supabase, params.professionalId, plan.provider, String(error.errorCode || error.statusCode || "AI_PROVIDER_ERROR"));

        await insertWhatsAppEventLog(supabase, {
          professionalId: params.professionalId,
          conversationId: context.conversationId || null,
          automationId: context.automationId || null,
          bookingId: context.bookingId || null,
          instanceName: context.instanceName || null,
          provider: plan.provider,
          direction: "system",
          eventType: "ai_provider_failed",
          messageId: context.messageId || null,
          clientIdentifier: context.clientIdentifier || null,
          normalizedPhone: context.normalizedPhone || null,
          status: "failed",
          model: plan.model,
          latencyMs,
          fallbackUsed: planIndex > 0,
          errorCode: String(error.errorCode || error.statusCode || "AI_PROVIDER_ERROR"),
          errorMessage: error.message,
          details: {
            attempt_number: attemptNumber,
            status_code: error.statusCode || null,
            response_body: error.responseBody || null,
          },
        });

        if (attempt < MAX_RETRIES_PER_PROVIDER && isRetryableError(error)) {
          const backoffMs = BASE_RETRY_DELAY_MS * 2 ** attempt;

          await insertWhatsAppEventLog(supabase, {
            professionalId: params.professionalId,
            conversationId: context.conversationId || null,
            automationId: context.automationId || null,
            bookingId: context.bookingId || null,
            instanceName: context.instanceName || null,
            provider: plan.provider,
            direction: "system",
            eventType: "ai_provider_retry_scheduled",
            messageId: context.messageId || null,
            clientIdentifier: context.clientIdentifier || null,
            normalizedPhone: context.normalizedPhone || null,
            status: "retrying",
            model: plan.model,
            fallbackUsed: planIndex > 0,
            errorCode: String(error.errorCode || error.statusCode || "AI_PROVIDER_ERROR"),
            details: {
              attempt_number: attemptNumber,
              retry_in_ms: backoffMs,
            },
          });

          await sleep(backoffMs);
          continue;
        }

        break;
      }
    }
  }

  await insertWhatsAppEventLog(supabase, {
    professionalId: params.professionalId,
    conversationId: context.conversationId || null,
    automationId: context.automationId || null,
    bookingId: context.bookingId || null,
    instanceName: context.instanceName || null,
    direction: "system",
    eventType: "ai_safe_response_returned",
    messageId: context.messageId || null,
    clientIdentifier: context.clientIdentifier || null,
    normalizedPhone: context.normalizedPhone || null,
    status: "fallback",
    provider: attemptedProviders.at(-1)?.provider || "safe_response",
    model: attemptedProviders.at(-1)?.model || "safe_response",
    latencyMs: totalLatency,
    estimatedCost: 0,
    fallbackUsed: attemptedProviders.length > 1,
    errorCode: "AI_ALL_PROVIDERS_FAILED",
    details: {
      attempted_providers: attemptedProviders.map((plan) => ({ provider: plan.provider, model: plan.model })),
    },
  });

  return {
    text: SAFE_RESPONSE,
    provider: attemptedProviders.at(-1)?.provider || "safe_response",
    model: attemptedProviders.at(-1)?.model || "safe_response",
    latency_ms: totalLatency,
    fallback_used: attemptedProviders.length > 1,
  };
}
