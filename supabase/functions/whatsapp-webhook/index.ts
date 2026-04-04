import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  insertWhatsAppEventLog,
  markInboundMessageReceived,
  normalizeConversationClientId,
  normalizePhoneDigits,
  sendWhatsAppMessage,
  type WhatsappProvider,
} from "../_shared/whatsapp.ts";
import { generateAIResponse } from "../_shared/ai-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type ParsedInboundEvent =
  | {
      kind: "ignore";
      provider: WhatsappProvider | null;
      reason: string;
      details?: Record<string, JsonValue>;
    }
  | {
      kind: "connection";
      provider: "evolution";
      instanceName: string;
      status: string;
      details?: Record<string, JsonValue>;
    }
  | {
      kind: "message";
      provider: WhatsappProvider;
      instanceName: string | null;
      metaPhoneId: string | null;
      messageId: string;
      clientIdentifier: string;
      normalizedPhone: string;
      text: string | null;
      contentType: "text" | "audio" | "media";
      audioKey?: Record<string, unknown> | null;
      audioMimeType?: string | null;
      audioMediaId?: string | null;
      details?: Record<string, JsonValue>;
    };

type ConversationRow = {
  id: string;
  professional_id: string;
  client_phone: string;
  messages: Array<{ role: string; content: string }>;
  context: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
}

function getEvolutionConfig() {
  const url = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/$/, "");
  const key = Deno.env.get("EVOLUTION_API_KEY") || "";

  if (!url || !key) return null;

  return {
    url,
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

function getWebhookVerifyToken() {
  return (
    Deno.env.get("WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN") ||
    Deno.env.get("META_WHATSAPP_WEBHOOK_VERIFY_TOKEN") ||
    ""
  ).trim();
}

function stripBase64Prefix(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^data:.*?;base64,(.+)$/);
  return match?.[1] || trimmed;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function resolveAudioFormat(mimeType?: string | null) {
  const mime = (mimeType || "").toLowerCase();
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("mp4")) return "mp4";
  return "ogg";
}

async function getGeminiApiKey() {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  return key;
}

async function transcribeAudioBase64(base64Audio: string, mimeType?: string | null) {
  const cleanedBase64 = stripBase64Prefix(base64Audio);
  if (!cleanedBase64) return null;

  const apiKey = await getGeminiApiKey();
  const transcriptionRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Transcreva o audio a seguir para texto em portugues brasileiro. Retorne apenas a transcricao. Se nao entender, retorne [audio_nao_reconhecido].",
            },
            {
              type: "input_audio",
              input_audio: {
                data: cleanedBase64,
                format: resolveAudioFormat(mimeType),
              },
            },
          ],
        },
      ],
    }),
  });

  if (!transcriptionRes.ok) {
    const errorText = await transcriptionRes.text();
    throw new Error(`TRANSCRIPTION_FAILED:${transcriptionRes.status}:${errorText}`);
  }

  const transcriptionData = await transcriptionRes.json();
  const transcription = transcriptionData.choices?.[0]?.message?.content?.trim();
  if (!transcription || transcription.toLowerCase().includes("[audio_nao_reconhecido]")) {
    return null;
  }

  return transcription;
}

async function fetchEvolutionAudioBase64(instanceName: string, audioKey: Record<string, unknown>) {
  const evolution = getEvolutionConfig();
  if (!evolution) throw new Error("EVOLUTION_API_NOT_CONFIGURED");

  const mediaRes = await fetch(`${evolution.url}/chat/getBase64FromMediaMessage/${instanceName}`, {
    method: "POST",
    headers: evolution.headers,
    body: JSON.stringify({
      message: {
        key: audioKey,
      },
    }),
  });

  if (!mediaRes.ok) {
    const errorText = await mediaRes.text();
    throw new Error(`EVOLUTION_AUDIO_FETCH_FAILED:${mediaRes.status}:${errorText}`);
  }

  const mediaData = await mediaRes.json();
  const base64 =
    mediaData?.base64 ||
    mediaData?.data?.base64 ||
    mediaData?.message?.base64 ||
    mediaData?.base_64 ||
    "";

  if (!base64) throw new Error("EVOLUTION_AUDIO_BASE64_EMPTY");

  return {
    base64,
    mimeType:
      mediaData?.mimetype ||
      mediaData?.data?.mimetype ||
      mediaData?.message?.mimetype ||
      null,
  };
}

async function fetchOfficialAudioBase64(mediaId: string) {
  const token = getOfficialToken();
  if (!token) throw new Error("OFFICIAL_TOKEN_NOT_CONFIGURED");

  const metadataRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!metadataRes.ok) {
    const errorText = await metadataRes.text();
    throw new Error(`OFFICIAL_AUDIO_METADATA_FAILED:${metadataRes.status}:${errorText}`);
  }

  const metadata = await metadataRes.json();
  const downloadUrl = metadata?.url;
  if (!downloadUrl) throw new Error("OFFICIAL_AUDIO_DOWNLOAD_URL_EMPTY");

  const downloadRes = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!downloadRes.ok) {
    const errorText = await downloadRes.text();
    throw new Error(`OFFICIAL_AUDIO_DOWNLOAD_FAILED:${downloadRes.status}:${errorText}`);
  }

  return {
    base64: arrayBufferToBase64(await downloadRes.arrayBuffer()),
    mimeType: metadata?.mime_type || downloadRes.headers.get("content-type"),
  };
}

function buildSystemPrompt(
  professional: Record<string, unknown>,
  services: Array<Record<string, unknown>>,
  availableSlots: Array<Record<string, unknown>> | null,
  context: Record<string, unknown>,
  bookingLink: string,
  workingHours?: Array<Record<string, unknown>> | null,
) {
  const profName = String(professional.business_name || professional.name || "Profissional");
  const nowSP = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const todayISO = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const servicesText = services.map((service, index) =>
    `${index + 1}. ${service.name} (ID: ${service.id}) - R$ ${Number(service.price || 0).toFixed(2)} (${service.duration_minutes} min)${service.description ? ` - ${service.description}` : ""}`
  ).join("\n");

  let slotsText = "";
  if (availableSlots && availableSlots.length > 0) {
    slotsText =
      `\n\nHorários disponíveis para ${context.selected_date}:\n` +
      availableSlots
        .map((slot) => {
          const time = new Date(String(slot.start_time));
          return time.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          });
        })
        .join(", ");
  }

  const dayNames = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  let workingHoursText = "HORÁRIOS DE FUNCIONAMENTO:\n";
  if (workingHours && workingHours.length > 0) {
    for (let day = 0; day < 7; day += 1) {
      const wh = workingHours.find((item) => Number(item.day_of_week) === day);
      if (wh && wh.is_active) {
        workingHoursText += `- ${dayNames[day]}: ${String(wh.start_time).slice(0, 5)} às ${String(wh.end_time).slice(0, 5)}\n`;
      } else {
        workingHoursText += `- ${dayNames[day]}: FECHADO\n`;
      }
    }
    workingHoursText += "\n- Nunca ofereça horários fora do funcionamento.";
  } else {
    workingHoursText += "- Não configurado.";
  }

  return `Você é o assistente de agendamento do "${profName}". Fale em português brasileiro, com objetividade e clareza.

DATA E HORA ATUAL: ${nowSP} (${todayISO})
- Hoje = ${todayISO}
- Nunca invente datas.

REGRAS:
- Você apenas agenda serviços reais da lista.
- Guie o cliente pelo fluxo: serviço -> data -> horário -> confirmação com nome e telefone.
- Se o cliente já forneceu nome e telefone, não peça novamente.
- Nunca invente horários. Use apenas os horários listados.
- Se não houver horário disponível, sugira outra data.
- Use emojis de forma moderada.
- Quando o cliente confirmar tudo, responda exatamente com o JSON na última linha:
|||BOOKING|||{"service_id":"<UUID do serviço>","date":"<YYYY-MM-DD>","time":"<HH:MM>","client_name":"<nome>","client_phone":"<telefone>"}|||END|||
- O service_id deve ser um UUID da lista. Nunca use "1", "2" ou índices.

SERVIÇOS DISPONÍVEIS:
${servicesText}

${workingHoursText}

${slotsText}

CONTEXTO ATUAL:
- Serviço selecionado: ${context.selected_service ? services.find((service) => service.id === context.selected_service)?.name || "nenhum" : "nenhum"}
- Data selecionada: ${String(context.selected_date || "nenhuma")}
- Horário selecionado: ${String(context.selected_time || "nenhum")}
- Nome do cliente: ${String(context.client_name || "não informado")}
- Telefone do cliente: ${String(context.client_phone || context.normalized_phone || "não informado")}

LINK DA PÁGINA PÚBLICA: ${bookingLink}`;
}

function buildWelcomeText(
  professional: Record<string, unknown>,
  bookingLink: string,
  clientName?: string,
) {
  const profName = String(professional.business_name || professional.name || "Profissional");
  let welcomeText = String(
    professional.welcome_message ||
      `Olá${clientName ? ` ${clientName}` : ""}! 👋 Bem-vindo(a) ao *${profName}*!`,
  );

  welcomeText = welcomeText
    .replace(/\{nome\}/g, clientName || "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (bookingLink && !welcomeText.includes(bookingLink)) {
    welcomeText += `\n\n📱 Agende também pela nossa página: ${bookingLink}`;
  }

  return `${welcomeText}\n\nSe quiser continuar por aqui, é só me dizer o que deseja.`;
}

function mergeAssistantMessage(prefix: string | null, message: string) {
  if (!prefix) return message;
  if (!message) return prefix;
  return `${prefix}\n\n${message}`;
}

function extractContextHints(
  clientMessage: string,
  services: Array<Record<string, unknown>>,
  currentContext: Record<string, unknown>,
) {
  const updatedContext = { ...currentContext };
  const normalizedMessage = clientMessage.toLowerCase().trim();

  for (let index = 0; index < services.length; index += 1) {
    const service = services[index];
    const serviceName = String(service.name || "").toLowerCase();
    if (!serviceName) continue;

    if (normalizedMessage.includes(serviceName) || normalizedMessage === String(index + 1)) {
      updatedContext.selected_service = service.id;
      break;
    }
  }

  const dateMatch = clientMessage.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, "0");
    const month = dateMatch[2].padStart(2, "0");
    const currentYear = new Date().getFullYear().toString();
    const rawYear = dateMatch[3] ? (dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : currentYear;
    updatedContext.selected_date = `${rawYear}-${month}-${day}`;
  }

  const now = new Date();
  const todayInSaoPaulo = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  if (normalizedMessage.includes("hoje")) {
    updatedContext.selected_date = todayInSaoPaulo;
  } else if (normalizedMessage.includes("amanhã") || normalizedMessage.includes("amanha")) {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    updatedContext.selected_date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(tomorrow);
  } else {
    const dayNameMap: Record<string, number> = {
      domingo: 0,
      segunda: 1,
      terça: 2,
      terca: 2,
      quarta: 3,
      quinta: 4,
      sexta: 5,
      sábado: 6,
      sabado: 6,
    };

    for (const [dayName, targetDow] of Object.entries(dayNameMap)) {
      if (!normalizedMessage.includes(dayName)) continue;

      const currentDow = new Date(`${todayInSaoPaulo}T12:00:00-03:00`).getDay();
      let daysAhead = targetDow - currentDow;
      if (daysAhead <= 0) daysAhead += 7;

      const targetDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
      updatedContext.selected_date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(targetDate);
      break;
    }
  }

  const timeMatch = normalizedMessage.match(/\b(\d{1,2})[:h](\d{2})\b/);
  if (timeMatch) {
    updatedContext.selected_time = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2].padStart(2, "0")}`;
  }

  return updatedContext;
}

async function getAvailableSlotsForContext(
  supabase: SupabaseClient,
  professionalId: string,
  context: Record<string, unknown>,
) {
  if (!context.selected_service || !context.selected_date) return null;

  const { data: slotsData } = await supabase.rpc("get_available_slots", {
    p_professional_id: professionalId,
    p_service_id: context.selected_service,
    p_date: context.selected_date,
  });

  if (slotsData?.success && Array.isArray(slotsData.slots)) {
    return slotsData.slots as Array<Record<string, unknown>>;
  }

  return null;
}

async function findActiveConversation(
  supabase: SupabaseClient,
  professionalId: string,
  clientIdentifier: string,
  normalizedPhone: string,
) {
  const identifiers = Array.from(new Set([clientIdentifier, normalizedPhone].filter(Boolean)));

  for (const identifier of identifiers) {
    const { data } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("professional_id", professionalId)
      .eq("client_phone", identifier)
      .eq("status", "active")
      .maybeSingle();

    if (data) return data as ConversationRow;
  }

  return null;
}

async function findLatestConversation(
  supabase: SupabaseClient,
  professionalId: string,
  clientIdentifier: string,
  normalizedPhone: string,
) {
  const identifiers = Array.from(new Set([clientIdentifier, normalizedPhone].filter(Boolean)));
  let latestConversation: ConversationRow | null = null;

  for (const identifier of identifiers) {
    const { data } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("professional_id", professionalId)
      .eq("client_phone", identifier)
      .order("updated_at", { ascending: false })
      .limit(1);

    const candidate = (data?.[0] as ConversationRow | undefined) || null;
    if (!candidate) continue;

    if (!latestConversation || new Date(candidate.updated_at) > new Date(latestConversation.updated_at)) {
      latestConversation = candidate;
    }
  }

  return latestConversation;
}

async function prepareConversation(
  supabase: SupabaseClient,
  professionalId: string,
  clientIdentifier: string,
  normalizedPhone: string,
) {
  const activeConversation = await findActiveConversation(supabase, professionalId, clientIdentifier, normalizedPhone);
  if (activeConversation) {
    return {
      conversation: activeConversation,
      isNewConversation: false,
      isReopenedConversation: false,
    };
  }

  const latestConversation = await findLatestConversation(supabase, professionalId, clientIdentifier, normalizedPhone);

  if (latestConversation && latestConversation.status === "expired") {
    const baseMessages = Array.isArray(latestConversation.messages) ? latestConversation.messages : [];
    const existingContext = typeof latestConversation.context === "object" && latestConversation.context
      ? latestConversation.context
      : {};

    const { data: reopenedConversation, error } = await supabase
      .from("whatsapp_conversations")
      .update({
        status: "active",
        context: {
          ...existingContext,
          client_phone: clientIdentifier,
          normalized_phone: normalizedPhone,
        },
        messages: [...baseMessages, { role: "system", content: "Conversa reaberta pelo cliente." }],
      })
      .eq("id", latestConversation.id)
      .select()
      .single();

    if (error) throw error;

    return {
      conversation: reopenedConversation as ConversationRow,
      isNewConversation: false,
      isReopenedConversation: true,
    };
  }

  const latestContext = typeof latestConversation?.context === "object" && latestConversation?.context
    ? latestConversation.context
    : {};
  const preservedClientName = typeof latestContext.client_name === "string" ? latestContext.client_name : "";
  const preservedClientPhone = typeof latestContext.client_phone === "string" ? latestContext.client_phone : normalizedPhone;

  const { data: newConversation, error } = await supabase
    .from("whatsapp_conversations")
    .insert({
      professional_id: professionalId,
      client_phone: clientIdentifier,
      messages: [],
      context: {
        client_phone: preservedClientPhone || clientIdentifier,
        normalized_phone: normalizedPhone,
        client_name: preservedClientName,
        previous_conversation_id: latestConversation?.id || null,
        previous_conversation_status: latestConversation?.status || null,
      },
      status: "active",
    })
    .select()
    .single();

  if (error) throw error;

  return {
    conversation: newConversation as ConversationRow,
    isNewConversation: true,
    isReopenedConversation: false,
  };
}

async function updateConversation(
  supabase: SupabaseClient,
  conversationId: string,
  messages: Array<{ role: string; content: string }>,
  context: Record<string, unknown>,
  status = "active",
) {
  await supabase
    .from("whatsapp_conversations")
    .update({
      messages,
      context,
      status,
    })
    .eq("id", conversationId);
}

async function triggerBookingAutomation(professionalId: string, bookingId: string) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    await fetch(`${supabaseUrl}/functions/v1/whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        action: "trigger-automation",
        professionalId,
        bookingId,
        triggerType: "booking_created",
      }),
    });
  } catch (error) {
    console.error("booking automation trigger error:", error);
  }
}

async function sendUpsellSuggestions(
  supabase: SupabaseClient,
  professionalId: string,
  bookingId: string,
  sourceServiceId: string,
  clientRecipient: string,
  instance: Record<string, unknown>,
  preferredProvider: WhatsappProvider,
  conversationId: string,
) {
  try {
    const { data: upsellFlag } = await supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", "upsell_inteligente")
      .maybeSingle();

    if (!upsellFlag?.enabled) return;

    const { data: upsellOverride } = await supabase
      .from("professional_feature_overrides")
      .select("enabled")
      .eq("professional_id", professionalId)
      .eq("feature_key", "upsell_inteligente")
      .maybeSingle();

    const upsellEnabled = upsellOverride ? upsellOverride.enabled : true;
    if (!upsellEnabled) return;

    const { data: upsellRules } = await supabase
      .from("upsell_rules")
      .select("recommended_service_id, promo_message, promo_price, priority")
      .eq("professional_id", professionalId)
      .eq("source_service_id", sourceServiceId)
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .limit(2);

    if (!upsellRules || upsellRules.length === 0) return;

    const recommendedServiceIds = upsellRules.map((rule: Record<string, unknown>) => rule.recommended_service_id).filter(Boolean);
    const { data: recommendedServices } = await supabase
      .from("services")
      .select("id, name, price")
      .in("id", recommendedServiceIds);

    if (!recommendedServices || recommendedServices.length === 0) return;

    let upsellMessage = "✨ *Aproveite para complementar seu atendimento:*\n\n";

    for (const rule of upsellRules as Array<Record<string, unknown>>) {
      const service = recommendedServices.find((item: Record<string, unknown>) => item.id === rule.recommended_service_id);
      if (!service) continue;

      const promoPrice = Number(rule.promo_price || service.price || 0);
      upsellMessage += `💆 *${service.name}* — R$ ${promoPrice.toFixed(2)}`;
      if (rule.promo_message) upsellMessage += `\n${rule.promo_message}`;
      upsellMessage += "\n\n";

      await supabase.from("upsell_events").insert({
        professional_id: professionalId,
        booking_id: bookingId,
        source_service_id: sourceServiceId,
        recommended_service_id: service.id,
        client_phone: clientRecipient,
        channel: "whatsapp",
        status: "suggested",
      });
    }

    upsellMessage += "Responda com o nome do serviço se quiser adicionar. 😊";

    await sendWhatsAppMessage({
      supabase,
      professionalId,
      recipient: clientRecipient,
      message: upsellMessage,
      instance,
      conversationId,
      bookingId,
      preferredProvider,
      details: {
        source: "whatsapp_webhook_upsell",
      },
    });
  } catch (error) {
    console.error("upsell suggestion error:", error);
  }
}

async function handleFollowUp(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
) {
  const conversationId = String(body.conversationId || "");
  const professionalId = String(body.professionalId || "");

  const { data: conversation } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (!conversation) return json({ error: "Conversa não encontrada" }, 404);

  const { data: instance } = await supabase
    .from("whatsapp_instances")
    .select("professional_id, instance_name, meta_phone_id, status")
    .eq("professional_id", professionalId)
    .maybeSingle();

  if (!instance) return json({ error: "WhatsApp não conectado" }, 400);

  const { data: professional } = await supabase
    .from("professionals")
    .select("business_name, name, slug, followup_message")
    .eq("id", professionalId)
    .single();

  const businessName = String(professional?.business_name || professional?.name || "");
  const bookingLink = professional?.slug ? `https://gende.io/${professional.slug}` : "";
  const context = typeof conversation.context === "object" && conversation.context ? conversation.context : {};
  const clientName = typeof context.client_name === "string" ? context.client_name : "";

  let followUpMessage =
    String(professional?.followup_message || "") ||
    `Olá {nome}! Notamos que você não finalizou seu agendamento no *${businessName}*.\n\nAinda gostaria de agendar? Estamos à disposição! É só responder esta mensagem que continuamos de onde paramos.`;

  followUpMessage = followUpMessage
    .replace(/\{nome\}/g, clientName || "")
    .replace(/\{link\}/g, bookingLink);

  if (bookingLink && !followUpMessage.includes(bookingLink)) {
    followUpMessage += `\n\n📱 Ou agende online: ${bookingLink}`;
  }

  const sendResult = await sendWhatsAppMessage({
    supabase,
    professionalId,
    recipient: String(conversation.client_phone || ""),
    message: followUpMessage,
    instance,
    conversationId,
    preferredProvider: "evolution",
    details: {
      source: "manual_follow_up",
    },
  });

  if (sendResult.success) {
    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    await updateConversation(
      supabase,
      conversation.id,
      [...messages, { role: "assistant", content: followUpMessage }],
      typeof conversation.context === "object" && conversation.context ? conversation.context : {},
      "active",
    );
  }

  return json({ success: sendResult.success, provider: sendResult.provider, error: sendResult.error });
}

function parseEvolutionEvent(body: Record<string, unknown>): ParsedInboundEvent {
  const webhookData = (body.data as Record<string, unknown> | undefined) || body;
  const event = String(webhookData.event || body.event || "").toLowerCase();
  const instanceName = String(
    webhookData.instance ||
      body.instance ||
      ((webhookData.data as Record<string, unknown> | undefined)?.instance || "") ||
      "",
  );

  if (event.includes("connection")) {
    const payload = (webhookData.data as Record<string, unknown> | undefined) || {};
    const rawState = String(payload.state || payload.status || body.state || "").toLowerCase();
    const status = rawState === "open" ? "connected" : rawState === "connecting" ? "connecting" : "disconnected";

    if (!instanceName) {
      return { kind: "ignore", provider: "evolution", reason: "missing_instance_on_connection_event" };
    }

    return {
      kind: "connection",
      provider: "evolution",
      instanceName,
      status,
      details: {
        raw_state: rawState,
      },
    };
  }

  if (!(event.includes("messages.upsert") || event.includes("messages_upsert"))) {
    return {
      kind: "ignore",
      provider: "evolution",
      reason: "unsupported_evolution_event",
      details: {
        event,
      },
    };
  }

  const messageData = (webhookData.data as Record<string, unknown> | undefined) || webhookData;
  const messageEnvelope = (messageData.message as Record<string, unknown> | undefined) || messageData;
  const key = (messageEnvelope.key as Record<string, unknown> | undefined) || (messageData.key as Record<string, unknown> | undefined) || {};
  const remoteJid = String(key.remoteJid || "");

  if (key.fromMe) {
    return { kind: "ignore", provider: "evolution", reason: "message_from_me" };
  }

  if (remoteJid.includes("@g.us")) {
    return { kind: "ignore", provider: "evolution", reason: "group_message" };
  }

  const clientIdentifier = normalizeConversationClientId(remoteJid);
  const normalizedPhone = normalizePhoneDigits(remoteJid);
  const rawMessage = (messageEnvelope.message as Record<string, unknown> | undefined) || (messageData.message as Record<string, unknown> | undefined) || {};
  const messageId = String(key.id || `${instanceName}:${clientIdentifier}:${messageData.messageTimestamp || Date.now()}`);

  if (!clientIdentifier || !instanceName) {
    return { kind: "ignore", provider: "evolution", reason: "missing_client_or_instance" };
  }

  if (typeof rawMessage.conversation === "string" && rawMessage.conversation.trim()) {
    return {
      kind: "message",
      provider: "evolution",
      instanceName,
      metaPhoneId: null,
      messageId,
      clientIdentifier,
      normalizedPhone,
      text: rawMessage.conversation.trim(),
      contentType: "text",
    };
  }

  const extendedText = rawMessage.extendedTextMessage as Record<string, unknown> | undefined;
  if (typeof extendedText?.text === "string" && extendedText.text.trim()) {
    return {
      kind: "message",
      provider: "evolution",
      instanceName,
      metaPhoneId: null,
      messageId,
      clientIdentifier,
      normalizedPhone,
      text: extendedText.text.trim(),
      contentType: "text",
    };
  }

  if (rawMessage.audioMessage) {
    const audioMessage = rawMessage.audioMessage as Record<string, unknown>;
    return {
      kind: "message",
      provider: "evolution",
      instanceName,
      metaPhoneId: null,
      messageId,
      clientIdentifier,
      normalizedPhone,
      text: null,
      contentType: "audio",
      audioKey: key,
      audioMimeType: String(audioMessage.mimetype || audioMessage.mimeType || "") || null,
      details: {
        message_type: "audio",
      },
    };
  }

  if (rawMessage.imageMessage || rawMessage.videoMessage || rawMessage.documentMessage) {
    return {
      kind: "message",
      provider: "evolution",
      instanceName,
      metaPhoneId: null,
      messageId,
      clientIdentifier,
      normalizedPhone,
      text: null,
      contentType: "media",
      details: {
        message_type: rawMessage.imageMessage ? "image" : rawMessage.videoMessage ? "video" : "document",
      },
    };
  }

  return { kind: "ignore", provider: "evolution", reason: "unsupported_message_type" };
}

function parseOfficialEvent(body: Record<string, unknown>): ParsedInboundEvent {
  const entries = Array.isArray(body.entry) ? body.entry : [];
  const changes = entries.flatMap((entry) =>
    Array.isArray((entry as Record<string, unknown>).changes)
      ? ((entry as Record<string, unknown>).changes as Array<Record<string, unknown>>)
      : []
  );
  const changeWithMessage = changes.find((change) => Array.isArray((change.value as Record<string, unknown> | undefined)?.messages));

  if (!changeWithMessage) {
    return { kind: "ignore", provider: "official", reason: "no_official_messages" };
  }

  const value = (changeWithMessage.value as Record<string, unknown> | undefined) || {};
  const metadata = (value.metadata as Record<string, unknown> | undefined) || {};
  const messages = (value.messages as Array<Record<string, unknown>> | undefined) || [];
  const message = messages[0];

  if (!message) return { kind: "ignore", provider: "official", reason: "empty_official_message" };

  const clientIdentifier = normalizeConversationClientId(String(message.from || ""));
  const normalizedPhone = normalizePhoneDigits(String(message.from || ""));
  const metaPhoneId = String(metadata.phone_number_id || "");
  const messageId = String(message.id || `${metaPhoneId}:${clientIdentifier}:${Date.now()}`);
  const messageType = String(message.type || "text");

  if (!clientIdentifier || !metaPhoneId) {
    return { kind: "ignore", provider: "official", reason: "missing_official_identifiers" };
  }

  if (messageType === "text") {
    const textBody = String(((message.text as Record<string, unknown> | undefined)?.body || "")).trim();
    if (!textBody) return { kind: "ignore", provider: "official", reason: "empty_official_text" };

    return {
      kind: "message",
      provider: "official",
      instanceName: null,
      metaPhoneId,
      messageId,
      clientIdentifier,
      normalizedPhone,
      text: textBody,
      contentType: "text",
    };
  }

  if (messageType === "audio") {
    const audioPayload = (message.audio as Record<string, unknown> | undefined) || {};
    return {
      kind: "message",
      provider: "official",
      instanceName: null,
      metaPhoneId,
      messageId,
      clientIdentifier,
      normalizedPhone,
      text: null,
      contentType: "audio",
      audioMediaId: String(audioPayload.id || "") || null,
      audioMimeType: String(audioPayload.mime_type || "") || null,
      details: {
        message_type: "audio",
      },
    };
  }

  if (["image", "video", "document", "sticker"].includes(messageType)) {
    return {
      kind: "message",
      provider: "official",
      instanceName: null,
      metaPhoneId,
      messageId,
      clientIdentifier,
      normalizedPhone,
      text: null,
      contentType: "media",
      details: {
        message_type: messageType,
      },
    };
  }

  return {
    kind: "ignore",
    provider: "official",
    reason: "unsupported_official_message_type",
    details: {
      message_type: messageType,
    },
  };
}

function parseInboundEvent(body: Record<string, unknown>): ParsedInboundEvent {
  if (body.object === "whatsapp_business_account") return parseOfficialEvent(body);
  return parseEvolutionEvent(body);
}

async function resolveInstance(
  supabase: SupabaseClient,
  event: Extract<ParsedInboundEvent, { kind: "message" }>,
) {
  if (event.provider === "official") {
    const { data } = await supabase
      .from("whatsapp_instances")
      .select("professional_id, instance_name, meta_phone_id, status")
      .eq("meta_phone_id", event.metaPhoneId)
      .maybeSingle();
    return data as Record<string, unknown> | null;
  }

  const { data } = await supabase
    .from("whatsapp_instances")
    .select("professional_id, instance_name, meta_phone_id, status")
    .eq("instance_name", event.instanceName)
    .maybeSingle();

  return data as Record<string, unknown> | null;
}

async function transcribeInboundAudio(
  supabase: SupabaseClient,
  event: Extract<ParsedInboundEvent, { kind: "message"; contentType: "audio" }>,
  professionalId: string,
  conversationId?: string,
) {
  await insertWhatsAppEventLog(supabase, {
    professionalId,
    conversationId,
    instanceName: event.instanceName,
    provider: event.provider,
    direction: "inbound",
    eventType: "audio_transcription_started",
    messageId: event.messageId,
    clientIdentifier: event.clientIdentifier,
    normalizedPhone: event.normalizedPhone,
    status: "processing",
    details: {
      has_evolution_key: !!event.audioKey,
      has_official_media_id: !!event.audioMediaId,
    },
  });

  const audioSource = event.provider === "evolution"
    ? await fetchEvolutionAudioBase64(event.instanceName || "", event.audioKey || {})
    : await fetchOfficialAudioBase64(event.audioMediaId || "");

  const transcription = await transcribeAudioBase64(audioSource.base64, event.audioMimeType || audioSource.mimeType);

  await insertWhatsAppEventLog(supabase, {
    professionalId,
    conversationId,
    instanceName: event.instanceName,
    provider: event.provider,
    direction: "inbound",
    eventType: transcription ? "audio_transcription_succeeded" : "audio_transcription_unrecognized",
    messageId: event.messageId,
    clientIdentifier: event.clientIdentifier,
    normalizedPhone: event.normalizedPhone,
    status: transcription ? "processed" : "warning",
    details: {
      mime_type: event.audioMimeType || audioSource.mimeType || null,
      transcription_length: transcription?.length || 0,
    },
  });

  return transcription;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    const verifyToken = getWebhookVerifyToken();
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200 });
    }

    return new Response("forbidden", { status: 403 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const body = await req.json();

    if (body.action === "send-follow-up") {
      return await handleFollowUp(supabase, body);
    }

    const parsedEvent = parseInboundEvent(body);

    if (parsedEvent.kind === "ignore") {
      if (parsedEvent.provider) {
        await insertWhatsAppEventLog(supabase, {
          provider: parsedEvent.provider,
          direction: "inbound",
          eventType: "ignored_event",
          status: "ignored",
          details: {
            reason: parsedEvent.reason,
            ...(parsedEvent.details || {}),
          },
        });
      }
      return json({ success: true, ignored: parsedEvent.reason });
    }

    if (parsedEvent.kind === "connection") {
      await supabase
        .from("whatsapp_instances")
        .update({ status: parsedEvent.status })
        .eq("instance_name", parsedEvent.instanceName);

      await insertWhatsAppEventLog(supabase, {
        instanceName: parsedEvent.instanceName,
        provider: parsedEvent.provider,
        direction: "system",
        eventType: "connection_update",
        status: parsedEvent.status,
        details: parsedEvent.details || {},
      });

      return json({ success: true, connection: parsedEvent.status });
    }

    const instance = await resolveInstance(supabase, parsedEvent);
    if (!instance?.professional_id) {
      await insertWhatsAppEventLog(supabase, {
        instanceName: parsedEvent.instanceName,
        provider: parsedEvent.provider,
        direction: "inbound",
        eventType: "instance_not_found",
        messageId: parsedEvent.messageId,
        clientIdentifier: parsedEvent.clientIdentifier,
        normalizedPhone: parsedEvent.normalizedPhone,
        status: "failed",
        details: {
          meta_phone_id: parsedEvent.metaPhoneId,
        },
      });

      return json({ success: false, error: "Instance not found" }, 404);
    }

    const professionalId = String(instance.professional_id);
    const inboundAccepted = await markInboundMessageReceived(supabase, {
      professionalId,
      instanceName: String(instance.instance_name || parsedEvent.instanceName || ""),
      provider: parsedEvent.provider,
      direction: "inbound",
      eventType: "inbound_received",
      messageId: parsedEvent.messageId,
      clientIdentifier: parsedEvent.clientIdentifier,
      normalizedPhone: parsedEvent.normalizedPhone,
      status: "received",
      details: {
        content_type: parsedEvent.contentType,
        provider: parsedEvent.provider,
      },
    });

    if (!inboundAccepted) {
      return json({ success: true, duplicate: true });
    }

    const { data: professional } = await supabase
      .from("professionals")
      .select("id, name, business_name, slug, welcome_message, feature_whatsapp")
      .eq("id", professionalId)
      .single();

    if (!professional || !professional.feature_whatsapp) {
      await insertWhatsAppEventLog(supabase, {
        professionalId,
        instanceName: String(instance.instance_name || parsedEvent.instanceName || ""),
        provider: parsedEvent.provider,
        direction: "inbound",
        eventType: "feature_disabled",
        messageId: parsedEvent.messageId,
        clientIdentifier: parsedEvent.clientIdentifier,
        normalizedPhone: parsedEvent.normalizedPhone,
        status: "ignored",
      });

      return json({ success: true, ignored: "feature_disabled" });
    }

    const { data: services } = await supabase
      .from("services")
      .select("id, name, price, duration_minutes, description, category")
      .eq("professional_id", professionalId)
      .eq("active", true)
      .order("sort_order", { ascending: true });

    const { data: workingHours } = await supabase
      .from("working_hours")
      .select("day_of_week, start_time, end_time, is_active")
      .eq("professional_id", professionalId)
      .order("day_of_week", { ascending: true });

    const bookingLink = professional.slug ? `https://gende.io/${professional.slug}` : "";
    const { conversation, isNewConversation, isReopenedConversation } = await prepareConversation(
      supabase,
      professionalId,
      parsedEvent.clientIdentifier,
      parsedEvent.normalizedPhone,
    );

    await insertWhatsAppEventLog(supabase, {
      professionalId,
      conversationId: conversation.id,
      instanceName: String(instance.instance_name || parsedEvent.instanceName || ""),
      provider: parsedEvent.provider,
      direction: "system",
      eventType: isNewConversation ? "conversation_created" : isReopenedConversation ? "conversation_reopened" : "conversation_reused",
      messageId: parsedEvent.messageId,
      clientIdentifier: parsedEvent.clientIdentifier,
      normalizedPhone: parsedEvent.normalizedPhone,
      status: "active",
      details: {
        previous_status: conversation.status,
      },
    });

    let clientMessage = parsedEvent.text || "";
    let fallbackReply: string | null = null;

    if (parsedEvent.contentType === "audio") {
      try {
        const transcription = await transcribeInboundAudio(supabase, parsedEvent, professionalId, conversation.id);
        if (transcription) {
          clientMessage = transcription;
        } else {
          fallbackReply = "Não consegui entender esse áudio. Pode me enviar em texto ou um áudio mais curto?";
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await insertWhatsAppEventLog(supabase, {
          professionalId,
          conversationId: conversation.id,
          instanceName: String(instance.instance_name || parsedEvent.instanceName || ""),
          provider: parsedEvent.provider,
          direction: "inbound",
          eventType: "audio_transcription_failed",
          messageId: parsedEvent.messageId,
          clientIdentifier: parsedEvent.clientIdentifier,
          normalizedPhone: parsedEvent.normalizedPhone,
          status: "failed",
          errorMessage,
        });
        fallbackReply = "Tive um problema para transcrever o seu áudio. Pode me enviar a mensagem em texto?";
      }
    } else if (parsedEvent.contentType === "media") {
      fallbackReply = "Recebi sua mídia. Para continuar o atendimento, me envie uma mensagem de texto ou um áudio.";
    }

    const messages = Array.isArray(conversation.messages) ? [...conversation.messages] : [];
    const baseContext = typeof conversation.context === "object" && conversation.context ? { ...conversation.context } : {};
    const context = {
      ...baseContext,
      client_phone: baseContext.client_phone || parsedEvent.clientIdentifier,
      normalized_phone: parsedEvent.normalizedPhone || baseContext.normalized_phone || "",
    } as Record<string, unknown>;

    const welcomePrefix = isNewConversation
      ? buildWelcomeText(professional as Record<string, unknown>, bookingLink, typeof context.client_name === "string" ? context.client_name : undefined)
      : null;

    if (!services || services.length === 0) {
      const reply = mergeAssistantMessage(
        welcomePrefix,
        `No momento não temos serviços disponíveis para agendamento online.\n\n${bookingLink ? `Você também pode acompanhar por aqui: ${bookingLink}` : "Por favor, entre em contato diretamente conosco."}`,
      );

      await sendWhatsAppMessage({
        supabase,
        professionalId,
        recipient: parsedEvent.clientIdentifier,
        message: reply,
        instance,
        conversationId: conversation.id,
        preferredProvider: parsedEvent.provider,
        details: {
          source: "whatsapp_webhook_no_services",
        },
      });

      await updateConversation(
        supabase,
        conversation.id,
        [...messages, { role: "user", content: clientMessage || "[mensagem sem texto]" }, { role: "assistant", content: reply }],
        context,
        "active",
      );

      return json({ success: true, provider: parsedEvent.provider });
    }

    if (fallbackReply) {
      const reply = mergeAssistantMessage(welcomePrefix, fallbackReply);

      await sendWhatsAppMessage({
        supabase,
        professionalId,
        recipient: parsedEvent.clientIdentifier,
        message: reply,
        instance,
        conversationId: conversation.id,
        preferredProvider: parsedEvent.provider,
        details: {
          source: "whatsapp_webhook_fallback_reply",
          content_type: parsedEvent.contentType,
        },
      });

      await updateConversation(
        supabase,
        conversation.id,
        [...messages, { role: "user", content: clientMessage || `[${parsedEvent.contentType}]` }, { role: "assistant", content: reply }],
        context,
        "active",
      );

      return json({ success: true, provider: parsedEvent.provider });
    }

    if (!clientMessage.trim()) {
      return json({ success: true, ignored: "empty_message" });
    }

    messages.push({ role: "user", content: clientMessage });
    const updatedContext = extractContextHints(clientMessage, services as Array<Record<string, unknown>>, context);
    let availableSlots = await getAvailableSlotsForContext(supabase, professionalId, updatedContext);

    await insertWhatsAppEventLog(supabase, {
      professionalId,
      conversationId: conversation.id,
      instanceName: String(instance.instance_name || parsedEvent.instanceName || ""),
      provider: parsedEvent.provider,
      direction: "system",
      eventType: "ai_context_prepared",
      messageId: parsedEvent.messageId,
      clientIdentifier: parsedEvent.clientIdentifier,
      normalizedPhone: parsedEvent.normalizedPhone,
      status: "processing",
      details: {
        selected_service: updatedContext.selected_service ? String(updatedContext.selected_service) : null,
        selected_date: updatedContext.selected_date ? String(updatedContext.selected_date) : null,
        selected_time: updatedContext.selected_time ? String(updatedContext.selected_time) : null,
        available_slots_count: availableSlots?.length || 0,
      },
    });

    const systemPrompt = buildSystemPrompt(
      professional as Record<string, unknown>,
      services as Array<Record<string, unknown>>,
      availableSlots,
      updatedContext,
      bookingLink,
      workingHours as Array<Record<string, unknown>> | null,
    );

    let aiResponse = "";
    let aiMetadata: {
      provider: string;
      model: string;
      latency_ms: number;
      input_tokens?: number;
      output_tokens?: number;
      fallback_used: boolean;
    } | null = null;
    try {
      aiMetadata = await generateAIResponse({
        professionalId,
        message: clientMessage,
        context: {
          useCase: "whatsapp_reply",
          systemPrompt,
          messages: messages.map((message) => ({ role: message.role, content: message.content })),
          conversationId: conversation.id,
          instanceName: String(instance.instance_name || parsedEvent.instanceName || ""),
          messageId: parsedEvent.messageId,
          clientIdentifier: parsedEvent.clientIdentifier,
          normalizedPhone: parsedEvent.normalizedPhone,
          selectedService: typeof updatedContext.selected_service === "string" ? updatedContext.selected_service : null,
          selectedDate: typeof updatedContext.selected_date === "string" ? updatedContext.selected_date : null,
          selectedTime: typeof updatedContext.selected_time === "string" ? updatedContext.selected_time : null,
        },
      });
      aiResponse = aiMetadata.text;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await insertWhatsAppEventLog(supabase, {
        professionalId,
        conversationId: conversation.id,
        instanceName: String(instance.instance_name || parsedEvent.instanceName || ""),
        provider: parsedEvent.provider,
        direction: "system",
        eventType: "ai_request_failed",
        messageId: parsedEvent.messageId,
        clientIdentifier: parsedEvent.clientIdentifier,
        normalizedPhone: parsedEvent.normalizedPhone,
        status: "failed",
        errorMessage,
      });

      const fallbackAiReply = mergeAssistantMessage(
        welcomePrefix,
        "Tive um problema interno para responder agora. Pode me mandar novamente em instantes?",
      );

      await sendWhatsAppMessage({
        supabase,
        professionalId,
        recipient: parsedEvent.clientIdentifier,
        message: fallbackAiReply,
        instance,
        conversationId: conversation.id,
        preferredProvider: parsedEvent.provider,
        details: {
          source: "whatsapp_webhook_ai_failure",
        },
      });

      await updateConversation(
        supabase,
        conversation.id,
        [...messages, { role: "assistant", content: fallbackAiReply }],
        updatedContext,
        "active",
      );

      return json({ success: true, provider: parsedEvent.provider });
    }

    let bookingMatch = aiResponse.match(/\|\|\|BOOKING\|\|\|(.+?)\|\|\|END\|\|\|/);

    if (!bookingMatch && updatedContext.selected_service && updatedContext.selected_date && !availableSlots) {
      availableSlots = await getAvailableSlotsForContext(supabase, professionalId, updatedContext);
      const promptWithSlots = buildSystemPrompt(
        professional as Record<string, unknown>,
        services as Array<Record<string, unknown>>,
        availableSlots,
        updatedContext,
        bookingLink,
        workingHours as Array<Record<string, unknown>> | null,
      );
      aiMetadata = await generateAIResponse({
        professionalId,
        message: clientMessage,
        context: {
          useCase: "whatsapp_reply",
          systemPrompt: promptWithSlots,
          messages: messages.map((message) => ({ role: message.role, content: message.content })),
          conversationId: conversation.id,
          instanceName: String(instance.instance_name || parsedEvent.instanceName || ""),
          messageId: parsedEvent.messageId,
          clientIdentifier: parsedEvent.clientIdentifier,
          normalizedPhone: parsedEvent.normalizedPhone,
          selectedService: typeof updatedContext.selected_service === "string" ? updatedContext.selected_service : null,
          selectedDate: typeof updatedContext.selected_date === "string" ? updatedContext.selected_date : null,
          selectedTime: typeof updatedContext.selected_time === "string" ? updatedContext.selected_time : null,
        },
      });
      aiResponse = aiMetadata.text;
      bookingMatch = aiResponse.match(/\|\|\|BOOKING\|\|\|(.+?)\|\|\|END\|\|\|/);
    }

    await insertWhatsAppEventLog(supabase, {
      professionalId,
      conversationId: conversation.id,
      instanceName: String(instance.instance_name || parsedEvent.instanceName || ""),
      provider: aiMetadata?.provider || "unknown",
      direction: "system",
      eventType: bookingMatch ? "ai_booking_intent_detected" : "ai_response_ready",
      messageId: parsedEvent.messageId,
      clientIdentifier: parsedEvent.clientIdentifier,
      normalizedPhone: parsedEvent.normalizedPhone,
      status: "processed",
      model: aiMetadata?.model || null,
      latencyMs: aiMetadata?.latency_ms || null,
      inputTokens: aiMetadata?.input_tokens || null,
      outputTokens: aiMetadata?.output_tokens || null,
      fallbackUsed: aiMetadata?.fallback_used || false,
      details: {
        response_length: aiResponse.length,
        ai_provider: aiMetadata?.provider || null,
      },
    });

    if (!bookingMatch) {
      const cleanResponse = mergeAssistantMessage(
        welcomePrefix,
        aiResponse.replace(/\|\|\|BOOKING\|\|\|.+?\|\|\|END\|\|\|/g, "").trim(),
      );

      await sendWhatsAppMessage({
        supabase,
        professionalId,
        recipient: parsedEvent.clientIdentifier,
        message: cleanResponse,
        instance,
        conversationId: conversation.id,
        preferredProvider: parsedEvent.provider,
        details: {
          source: "whatsapp_webhook_ai_reply",
        },
      });

      await updateConversation(
        supabase,
        conversation.id,
        [...messages, { role: "assistant", content: cleanResponse }],
        updatedContext,
        "active",
      );

      return json({ success: true, provider: parsedEvent.provider });
    }

    try {
      const bookingData = JSON.parse(bookingMatch[1]);
      const [hours, minutes] = String(bookingData.time || "").split(":");
      const startTime = new Date(`${bookingData.date}T${String(hours || "00").padStart(2, "0")}:${String(minutes || "00").padStart(2, "0")}:00-03:00`);

      await insertWhatsAppEventLog(supabase, {
        professionalId,
        conversationId: conversation.id,
        instanceName: String(instance.instance_name || parsedEvent.instanceName || ""),
        provider: parsedEvent.provider,
        direction: "system",
        eventType: "booking_rpc_attempt",
        messageId: parsedEvent.messageId,
        clientIdentifier: parsedEvent.clientIdentifier,
        normalizedPhone: parsedEvent.normalizedPhone,
        status: "processing",
        details: {
          service_id: String(bookingData.service_id || ""),
          date: String(bookingData.date || ""),
          time: String(bookingData.time || ""),
        },
      });

      const { data: bookingResult, error: bookingError } = await supabase.rpc("create_public_booking", {
        p_professional_id: professionalId,
        p_service_id: bookingData.service_id,
        p_start_time: startTime.toISOString(),
        p_client_name: bookingData.client_name,
        p_client_phone: normalizePhoneDigits(bookingData.client_phone || parsedEvent.clientIdentifier),
      });

      if (bookingError) throw bookingError;

      if (!bookingResult?.success) {
        const bookingFailureMessage = `Ops, não consegui concluir o agendamento: ${bookingResult?.error || "erro desconhecido"}. Tente outro horário ou data.`;
        const reply = mergeAssistantMessage(welcomePrefix, bookingFailureMessage);

        await insertWhatsAppEventLog(supabase, {
          professionalId,
          conversationId: conversation.id,
          instanceName: String(instance.instance_name || parsedEvent.instanceName || ""),
          provider: parsedEvent.provider,
          direction: "system",
          eventType: "booking_rpc_failed",
          messageId: parsedEvent.messageId,
          clientIdentifier: parsedEvent.clientIdentifier,
          normalizedPhone: parsedEvent.normalizedPhone,
          status: "failed",
          errorMessage: String(bookingResult?.error || "booking_rpc_unsuccessful"),
        });

        await sendWhatsAppMessage({
          supabase,
          professionalId,
          recipient: parsedEvent.clientIdentifier,
          message: reply,
          instance,
          conversationId: conversation.id,
          preferredProvider: parsedEvent.provider,
          details: {
            source: "whatsapp_webhook_booking_failure",
          },
        });

        await updateConversation(
          supabase,
          conversation.id,
          [...messages, { role: "assistant", content: reply }],
          updatedContext,
          "active",
        );

        return json({ success: true, provider: parsedEvent.provider });
      }

      const friendlyMessage = aiResponse.replace(/\|\|\|BOOKING\|\|\|.+?\|\|\|END\|\|\|/, "").trim();
      const successMessage = mergeAssistantMessage(
        welcomePrefix,
        friendlyMessage || `✅ Seu agendamento foi confirmado!\n\n📅 Data: ${bookingData.date}\n⏰ Horário: ${bookingData.time}\n💰 Valor: R$ ${Number(bookingResult.price || 0).toFixed(2)}\n\nAgradecemos pela preferência!`,
      );

      await insertWhatsAppEventLog(supabase, {
        professionalId,
        conversationId: conversation.id,
        bookingId: bookingResult.booking_id,
        instanceName: String(instance.instance_name || parsedEvent.instanceName || ""),
        provider: parsedEvent.provider,
        direction: "system",
        eventType: "booking_rpc_succeeded",
        messageId: parsedEvent.messageId,
        clientIdentifier: parsedEvent.clientIdentifier,
        normalizedPhone: parsedEvent.normalizedPhone,
        status: "success",
        details: {
          booking_id: String(bookingResult.booking_id),
          price: Number(bookingResult.price || 0),
        },
      });

      await sendWhatsAppMessage({
        supabase,
        professionalId,
        recipient: parsedEvent.clientIdentifier,
        message: successMessage,
        instance,
        conversationId: conversation.id,
        bookingId: bookingResult.booking_id,
        preferredProvider: parsedEvent.provider,
        details: {
          source: "whatsapp_webhook_booking_success",
        },
      });

      const finalContext = {
        ...updatedContext,
        booking_id: bookingResult.booking_id,
        client_name: bookingData.client_name || updatedContext.client_name || null,
        client_phone: normalizePhoneDigits(bookingData.client_phone || parsedEvent.clientIdentifier),
        selected_service: bookingData.service_id || updatedContext.selected_service || null,
        selected_date: bookingData.date || updatedContext.selected_date || null,
        selected_time: bookingData.time || updatedContext.selected_time || null,
      };

      await updateConversation(
        supabase,
        conversation.id,
        [...messages, { role: "assistant", content: successMessage }],
        finalContext,
        "completed",
      );

      await triggerBookingAutomation(professionalId, bookingResult.booking_id);
      await sendUpsellSuggestions(
        supabase,
        professionalId,
        bookingResult.booking_id,
        String(bookingData.service_id || ""),
        parsedEvent.clientIdentifier,
        instance,
        parsedEvent.provider,
        conversation.id,
      );

      return json({ success: true, provider: parsedEvent.provider, bookingId: bookingResult.booking_id });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const reply = mergeAssistantMessage(
        welcomePrefix,
        "Desculpe, houve um erro ao processar seu agendamento. Pode tentar novamente?",
      );

      await insertWhatsAppEventLog(supabase, {
        professionalId,
        conversationId: conversation.id,
        instanceName: String(instance.instance_name || parsedEvent.instanceName || ""),
        provider: parsedEvent.provider,
        direction: "system",
        eventType: "booking_processing_exception",
        messageId: parsedEvent.messageId,
        clientIdentifier: parsedEvent.clientIdentifier,
        normalizedPhone: parsedEvent.normalizedPhone,
        status: "failed",
        errorMessage,
      });

      await sendWhatsAppMessage({
        supabase,
        professionalId,
        recipient: parsedEvent.clientIdentifier,
        message: reply,
        instance,
        conversationId: conversation.id,
        preferredProvider: parsedEvent.provider,
        details: {
          source: "whatsapp_webhook_booking_exception",
        },
      });

      await updateConversation(
        supabase,
        conversation.id,
        [...messages, { role: "assistant", content: reply }],
        updatedContext,
        "active",
      );

      return json({ success: true, provider: parsedEvent.provider });
    }
  } catch (error) {
    console.error("whatsapp-webhook error:", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
