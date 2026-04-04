import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export type WhatsappProvider = "evolution" | "official";

type InstanceLike = {
  professional_id?: string | null;
  instance_name?: string | null;
  meta_phone_id?: string | null;
  status?: string | null;
};

type EventLogInput = {
  professionalId?: string | null;
  conversationId?: string | null;
  automationId?: string | null;
  bookingId?: string | null;
  instanceName?: string | null;
  provider?: string | null;
  model?: string | null;
  direction?: string;
  eventType: string;
  messageId?: string | null;
  clientIdentifier?: string | null;
  normalizedPhone?: string | null;
  status?: string;
  latencyMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCost?: number | null;
  fallbackUsed?: boolean | null;
  errorCode?: string | null;
  details?: Record<string, unknown>;
  errorMessage?: string | null;
};

export type SendWhatsAppMessageInput = {
  supabase: SupabaseClient;
  professionalId: string;
  recipient: string;
  message: string;
  instance?: InstanceLike | null;
  automationId?: string | null;
  bookingId?: string | null;
  conversationId?: string | null;
  preferredProvider?: WhatsappProvider;
  details?: Record<string, unknown>;
};

export type SendWhatsAppMessageResult = {
  success: boolean;
  provider: WhatsappProvider | null;
  attemptedProviders: WhatsappProvider[];
  normalizedRecipient: string;
  evolutionRecipient: string;
  responseStatus?: number;
  responseBody?: unknown;
  error?: string;
};

const META_GRAPH_API_VERSION = Deno.env.get("META_GRAPH_API_VERSION") || "v21.0";

function getEvolutionConfig() {
  const url = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/$/, "");
  const key = Deno.env.get("EVOLUTION_API_KEY") || "";

  if (!url || !key) return null;

  return {
    url,
    key,
    headers: {
      "Content-Type": "application/json",
      apikey: key,
    },
  };
}

function getOfficialToken() {
  return (
    Deno.env.get("WHATSAPP_CLOUD_API_TOKEN") ||
    Deno.env.get("META_WHATSAPP_TOKEN") ||
    Deno.env.get("WHATSAPP_OFFICIAL_TOKEN") ||
    ""
  ).trim();
}

function isPhoneLike(value: string) {
  return /^\d{12,15}$/.test(value);
}

export function normalizePhoneDigits(phone: string | null | undefined): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}

export function normalizeConversationClientId(remoteId: string | null | undefined): string {
  const value = (remoteId || "").trim();
  if (!value) return "";
  if (value.includes("@g.us")) return "";
  if (value.includes("@lid")) return value.toLowerCase();
  if (value.includes("@s.whatsapp.net") || value.includes("@c.us")) {
    return normalizePhoneDigits(value);
  }
  return normalizePhoneDigits(value) || value.toLowerCase();
}

export function normalizeEvolutionRecipient(recipient: string | null | undefined): string {
  const value = (recipient || "").trim();
  if (!value) return "";
  if (value.includes("@lid")) return value.toLowerCase();
  if (value.includes("@s.whatsapp.net") || value.includes("@c.us")) return value.toLowerCase();
  return normalizePhoneDigits(value);
}

async function readResponseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function insertWhatsAppEventLog(
  supabase: SupabaseClient,
  input: EventLogInput,
) {
  try {
    const { error } = await supabase.from("whatsapp_event_logs" as never).insert({
      professional_id: input.professionalId ?? null,
      conversation_id: input.conversationId ?? null,
      automation_id: input.automationId ?? null,
      booking_id: input.bookingId ?? null,
      instance_name: input.instanceName ?? null,
      provider: input.provider ?? "unknown",
      model: input.model ?? null,
      direction: input.direction ?? "system",
      event_type: input.eventType,
      message_id: input.messageId ?? null,
      client_identifier: input.clientIdentifier ?? null,
      normalized_phone: input.normalizedPhone ?? null,
      status: input.status ?? "info",
      latency_ms: input.latencyMs ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      estimated_cost: input.estimatedCost ?? null,
      fallback_used: input.fallbackUsed ?? null,
      error_code: input.errorCode ?? null,
      details: input.details ?? {},
      error_message: input.errorMessage ?? null,
    } as never);

    if (error) {
      console.error("whatsapp_event_logs insert error:", error);
    }
  } catch (error) {
    console.error("whatsapp_event_logs unexpected error:", error);
  }
}

export async function markInboundMessageReceived(
  supabase: SupabaseClient,
  input: Required<Pick<EventLogInput, "eventType" | "provider" | "messageId">> & Omit<EventLogInput, "eventType" | "provider" | "messageId">,
): Promise<boolean> {
  try {
    const { error } = await supabase.from("whatsapp_event_logs" as never).insert({
      professional_id: input.professionalId ?? null,
      conversation_id: input.conversationId ?? null,
      automation_id: input.automationId ?? null,
      booking_id: input.bookingId ?? null,
      instance_name: input.instanceName ?? null,
      provider: input.provider,
      model: input.model ?? null,
      direction: input.direction ?? "inbound",
      event_type: input.eventType,
      message_id: input.messageId,
      client_identifier: input.clientIdentifier ?? null,
      normalized_phone: input.normalizedPhone ?? null,
      status: input.status ?? "received",
      latency_ms: input.latencyMs ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      estimated_cost: input.estimatedCost ?? null,
      fallback_used: input.fallbackUsed ?? null,
      error_code: input.errorCode ?? null,
      details: input.details ?? {},
      error_message: input.errorMessage ?? null,
    } as never);

    if (!error) return true;

    if ((error as { code?: string }).code === "23505") {
      return false;
    }

    console.error("markInboundMessageReceived error:", error);
    return true;
  } catch (error) {
    console.error("markInboundMessageReceived unexpected error:", error);
    return true;
  }
}

async function logOutboundResult(
  supabase: SupabaseClient,
  input: {
    professionalId: string;
    automationId?: string | null;
    bookingId?: string | null;
    provider: WhatsappProvider | null;
    recipientPhone: string;
    message: string;
    success: boolean;
    responseBody?: unknown;
    error?: string;
  },
) {
  try {
    const { error } = await supabase.from("whatsapp_logs").insert({
      professional_id: input.professionalId,
      automation_id: input.automationId ?? null,
      booking_id: input.bookingId ?? null,
      recipient_phone: input.recipientPhone,
      message_content: input.message,
      provider: input.provider ?? "unknown",
      status: input.success ? "sent" : "failed",
      sent_at: input.success ? new Date().toISOString() : null,
      error_message: input.success ? null : (input.error || JSON.stringify(input.responseBody ?? {})),
    });

    if (error) {
      console.error("whatsapp_logs insert error:", error);
    }
  } catch (error) {
    console.error("whatsapp_logs unexpected error:", error);
  }
}

async function sendViaEvolution(
  instanceName: string,
  recipient: string,
  message: string,
): Promise<{ ok: boolean; status: number; body: unknown; recipient: string }> {
  const evolution = getEvolutionConfig();
  if (!evolution) {
    return {
      ok: false,
      status: 0,
      body: { error: "EVOLUTION_NOT_CONFIGURED" },
      recipient: "",
    };
  }

  const evolutionRecipient = normalizeEvolutionRecipient(recipient);
  if (!evolutionRecipient) {
    return {
      ok: false,
      status: 0,
      body: { error: "INVALID_EVOLUTION_RECIPIENT" },
      recipient: evolutionRecipient,
    };
  }

  const res = await fetch(`${evolution.url}/message/sendText/${instanceName}`, {
    method: "POST",
    headers: evolution.headers,
    body: JSON.stringify({
      number: evolutionRecipient,
      text: message,
    }),
  });

  return {
    ok: res.ok,
    status: res.status,
    body: await readResponseBody(res),
    recipient: evolutionRecipient,
  };
}

async function sendViaOfficial(
  metaPhoneId: string,
  recipient: string,
  message: string,
): Promise<{ ok: boolean; status: number; body: unknown; recipient: string }> {
  const token = getOfficialToken();
  const normalizedRecipient = normalizePhoneDigits(recipient);

  if (!token || !metaPhoneId || !isPhoneLike(normalizedRecipient)) {
    return {
      ok: false,
      status: 0,
      body: { error: "OFFICIAL_PROVIDER_NOT_AVAILABLE" },
      recipient: normalizedRecipient,
    };
  }

  const res = await fetch(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${metaPhoneId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedRecipient,
      type: "text",
      text: { body: message },
    }),
  });

  return {
    ok: res.ok,
    status: res.status,
    body: await readResponseBody(res),
    recipient: normalizedRecipient,
  };
}

async function getInstance(
  supabase: SupabaseClient,
  professionalId: string,
  providedInstance?: InstanceLike | null,
) {
  if (providedInstance?.instance_name || providedInstance?.meta_phone_id) {
    return providedInstance;
  }

  const { data, error } = await supabase
    .from("whatsapp_instances")
    .select("professional_id, instance_name, meta_phone_id, status")
    .eq("professional_id", professionalId)
    .maybeSingle();

  if (error) {
    console.error("getInstance error:", error);
    return null;
  }

  return data as InstanceLike | null;
}

export async function sendWhatsAppMessage(
  input: SendWhatsAppMessageInput,
): Promise<SendWhatsAppMessageResult> {
  const instance = await getInstance(input.supabase, input.professionalId, input.instance);
  const normalizedRecipient = normalizePhoneDigits(input.recipient);
  const evolutionRecipient = normalizeEvolutionRecipient(input.recipient);
  const preferredProvider = input.preferredProvider ?? "evolution";

  const officialAvailable = !!(instance?.meta_phone_id && getOfficialToken());
  const evolutionAvailable = !!(instance?.instance_name && getEvolutionConfig());

  const orderedProviders = [
    preferredProvider,
    preferredProvider === "evolution" ? "official" : "evolution",
  ].filter((provider, index, list) => list.indexOf(provider) === index) as WhatsappProvider[];

  const attemptedProviders: WhatsappProvider[] = [];
  let lastError = "";
  let lastStatus = 0;
  let lastBody: unknown = null;
  let successfulProvider: WhatsappProvider | null = null;

  for (const provider of orderedProviders) {
    if (provider === "evolution" && (!evolutionAvailable || !instance?.instance_name)) continue;
    if (provider === "official" && (!officialAvailable || !instance?.meta_phone_id)) continue;

    attemptedProviders.push(provider);

    await insertWhatsAppEventLog(input.supabase, {
      professionalId: input.professionalId,
      conversationId: input.conversationId,
      automationId: input.automationId,
      bookingId: input.bookingId,
      instanceName: instance?.instance_name ?? null,
      provider,
      direction: "outbound",
      eventType: "send_attempt",
      clientIdentifier: input.recipient,
      normalizedPhone: normalizedRecipient,
      status: "attempting",
      details: {
        preferredProvider,
        messageLength: input.message.length,
        ...(input.details ?? {}),
      },
    });

    try {
      const result = provider === "evolution"
        ? await sendViaEvolution(instance!.instance_name!, input.recipient, input.message)
        : await sendViaOfficial(instance!.meta_phone_id!, input.recipient, input.message);

      lastStatus = result.status;
      lastBody = result.body;

      if (result.ok) {
        successfulProvider = provider;

        await logOutboundResult(input.supabase, {
          professionalId: input.professionalId,
          automationId: input.automationId,
          bookingId: input.bookingId,
          provider,
          recipientPhone: result.recipient || input.recipient,
          message: input.message,
          success: true,
          responseBody: result.body,
        });

        await insertWhatsAppEventLog(input.supabase, {
          professionalId: input.professionalId,
          conversationId: input.conversationId,
          automationId: input.automationId,
          bookingId: input.bookingId,
          instanceName: instance?.instance_name ?? null,
          provider,
          direction: "outbound",
          eventType: "send_success",
          clientIdentifier: input.recipient,
          normalizedPhone: result.recipient || normalizedRecipient,
          status: "sent",
          details: {
            responseStatus: result.status,
            responseBody: result.body,
            ...(input.details ?? {}),
          },
        });

        return {
          success: true,
          provider,
          attemptedProviders,
          normalizedRecipient,
          evolutionRecipient,
          responseStatus: result.status,
          responseBody: result.body,
        };
      }

      lastError = typeof result.body === "string" ? result.body : JSON.stringify(result.body ?? {});

      if (provider === "evolution" && (result.status === 404 || result.status === 410) && instance?.instance_name) {
        await input.supabase
          .from("whatsapp_instances")
          .update({ status: "disconnected" })
          .eq("instance_name", instance.instance_name);
      }

      await insertWhatsAppEventLog(input.supabase, {
        professionalId: input.professionalId,
        conversationId: input.conversationId,
        automationId: input.automationId,
        bookingId: input.bookingId,
        instanceName: instance?.instance_name ?? null,
        provider,
        direction: "outbound",
        eventType: "send_failed_attempt",
        clientIdentifier: input.recipient,
        normalizedPhone: result.recipient || normalizedRecipient,
        status: "failed",
        details: {
          responseStatus: result.status,
          responseBody: result.body,
          ...(input.details ?? {}),
        },
        errorMessage: lastError,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await insertWhatsAppEventLog(input.supabase, {
        professionalId: input.professionalId,
        conversationId: input.conversationId,
        automationId: input.automationId,
        bookingId: input.bookingId,
        instanceName: instance?.instance_name ?? null,
        provider,
        direction: "outbound",
        eventType: "send_exception",
        clientIdentifier: input.recipient,
        normalizedPhone: normalizedRecipient,
        status: "failed",
        details: input.details ?? {},
        errorMessage: lastError,
      });
    }
  }

  await logOutboundResult(input.supabase, {
    professionalId: input.professionalId,
    automationId: input.automationId,
    bookingId: input.bookingId,
    provider: successfulProvider,
    recipientPhone: normalizedRecipient || evolutionRecipient || input.recipient,
    message: input.message,
    success: false,
    responseBody: lastBody,
    error: lastError || "No provider available",
  });

  return {
    success: false,
    provider: successfulProvider,
    attemptedProviders,
    normalizedRecipient,
    evolutionRecipient,
    responseStatus: lastStatus || undefined,
    responseBody: lastBody,
    error: lastError || "No provider available",
  };
}
