import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EVOLUTION_URL = () => Deno.env.get("EVOLUTION_API_URL") || "";
const getEvolutionHeaders = () => ({
  "Content-Type": "application/json",
  apikey: Deno.env.get("EVOLUTION_API_KEY") || "",
});

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) return digits;
  if (digits.length >= 10 && digits.length <= 11) return "55" + digits;
  return digits;
}

async function sendWhatsAppMessage(instanceName: string, phone: string, message: string) {
  const res = await fetch(`${EVOLUTION_URL()}/message/sendText/${instanceName}`, {
    method: "POST",
    headers: getEvolutionHeaders(),
    body: JSON.stringify({ number: phone, text: message }),
  });
  return res;
}

async function getGeminiApiKey(): string {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  return key;
}

async function downloadAndTranscribeAudio(
  mediaUrl: string,
  instanceName: string
): Promise<string> {
  try {
    const audioRes = await fetch(mediaUrl, {
      headers: getEvolutionHeaders(),
    });
    if (!audioRes.ok) {
      console.error("Failed to download audio:", audioRes.status);
      return "[Áudio não reconhecido]";
    }

    const audioBuffer = await audioRes.arrayBuffer();
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));

    const GEMINI_API_KEY = await getGeminiApiKey();

    const transcriptionRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
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
                text: "Transcreva o áudio a seguir para texto em português brasileiro. Retorne APENAS a transcrição, sem comentários adicionais. Se não conseguir entender, retorne '[Áudio não reconhecido]'.",
              },
              {
                type: "input_audio",
                input_audio: {
                  data: base64Audio,
                  format: "ogg",
                },
              },
            ],
          },
        ],
      }),
    });

    if (!transcriptionRes.ok) {
      console.error("Transcription failed:", transcriptionRes.status);
      return "[Áudio não reconhecido]";
    }

    const transcriptionData = await transcriptionRes.json();
    const transcription = transcriptionData.choices?.[0]?.message?.content?.trim();
    return transcription || "[Áudio não reconhecido]";
  } catch (error) {
    console.error("Audio transcription error:", error);
    return "[Áudio não reconhecido]";
  }
}

async function getAIResponse(
  conversationMessages: Array<{ role: string; content: string }>,
  systemPrompt: string
): Promise<string> {
  const GEMINI_API_KEY = await getGeminiApiKey();

  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GEMINI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gemini-2.0-flash",
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationMessages,
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("AI error:", res.status, errText);
    throw new Error(`AI error: ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "Desculpe, não entendi. Pode repetir?";
}

async function handleFollowUp(supabase: any, body: any) {
  const { conversationId, professionalId } = body;

  const { data: conv } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (!conv) {
    return new Response(JSON.stringify({ error: "Conversa não encontrada" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 404,
    });
  }

  const { data: inst } = await supabase
    .from("whatsapp_instances")
    .select("instance_name, status")
    .eq("professional_id", professionalId)
    .eq("status", "connected")
    .maybeSingle();

  if (!inst) {
    return new Response(JSON.stringify({ error: "WhatsApp não conectado" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  const { data: prof } = await supabase
    .from("professionals")
    .select("business_name, name, slug, followup_message")
    .eq("id", professionalId)
    .single();

  const profName = prof?.business_name || prof?.name || "";
  const bookingLink = prof?.slug ? `https://gende.io/${prof.slug}` : "";
  const clientName = (conv.context as any)?.client_name || "";

  let followUpMsg = (prof as any)?.followup_message || `Olá {nome}! 👋 Notamos que você não finalizou seu agendamento no *${profName}*.\n\nAinda gostaria de agendar? Estamos à disposição! É só responder esta mensagem que continuamos de onde paramos. 😊`;

  followUpMsg = followUpMsg
    .replace(/\{nome\}/g, clientName || "")
    .replace(/\{link\}/g, bookingLink);

  if (bookingLink && !followUpMsg.includes(bookingLink)) {
    followUpMsg += `\n\n📱 Ou agende online: ${bookingLink}`;
  }

  const sendRes = await sendWhatsAppMessage(inst.instance_name, conv.client_phone, followUpMsg);

  if (sendRes.ok) {
    const msgs = Array.isArray(conv.messages) ? conv.messages : [];
    await supabase.from("whatsapp_conversations").update({
      status: "active",
      messages: [...msgs, { role: "assistant", content: followUpMsg }],
    }).eq("id", conversationId);

    await supabase.from("whatsapp_logs").insert({
      professional_id: professionalId,
      recipient_phone: conv.client_phone,
      message_content: followUpMsg,
      status: "sent",
      sent_at: new Date().toISOString(),
    });
  }

  return new Response(JSON.stringify({ success: sendRes.ok }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}


function buildSystemPrompt(
  professional: any,
  services: any[],
  availableSlots: any[] | null,
  context: any,
  bookingLink: string,
  workingHours?: any[] | null
): string {
  const profName = professional.business_name || professional.name || "Profissional";

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

  let servicesText = services.map((s: any, i: number) =>
    `${i + 1}. ${s.name} (ID: ${s.id}) - R$ ${Number(s.price).toFixed(2)} (${s.duration_minutes} min)${s.description ? ` - ${s.description}` : ""}`
  ).join("\n");

  let slotsText = "";
  if (availableSlots && availableSlots.length > 0) {
    slotsText = `\n\nHorários disponíveis para ${context.selected_date}:\n` +
      availableSlots.map((s: any) => {
        const time = new Date(s.start_time);
        return time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
      }).join(", ");
  }

  const dayNames = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  let workingHoursText = "HORÁRIOS DE FUNCIONAMENTO:\n";
  if (workingHours && workingHours.length > 0) {
    for (let d = 0; d < 7; d++) {
      const wh = workingHours.find((h: any) => h.day_of_week === d);
      if (wh && wh.is_active) {
        workingHoursText += `- ${dayNames[d]}: ${wh.start_time.slice(0, 5)} às ${wh.end_time.slice(0, 5)}\n`;
      } else {
        workingHoursText += `- ${dayNames[d]}: NÃO TRABALHA (fechado)\n`;
      }
    }
    workingHoursText += "\n- NUNCA ofereça horários em dias que o profissional NÃO TRABALHA.";
  } else {
    workingHoursText += "- Não configurado (usar padrão).";
  }

  return `Você é um assistente de agendamento virtual do "${profName}". Seja simpático, objetivo e profissional. Fale em português brasileiro.

DATA E HORA ATUAL: ${nowSP} (${todayISO})
- "Hoje" = ${todayISO}
- NUNCA invente ou adivinhe datas. Use APENAS a data atual acima como referência.

REGRAS IMPORTANTES:
- Você APENAS agenda serviços. Não invente serviços, preços ou horários.
- Guie o cliente pelo fluxo: escolher serviço → escolher data → escolher horário → confirmar com nome e telefone.
- Se o cliente já forneceu o nome e telefone na conversa, não peça novamente.
- Quando o cliente confirmar tudo, responda EXATAMENTE com o formato JSON abaixo na ÚLTIMA linha da sua mensagem (após a mensagem amigável):
  |||BOOKING|||{"service_id":"<UUID do serviço conforme listado acima>","date":"<YYYY-MM-DD>","time":"<HH:MM>","client_name":"<nome>","client_phone":"<telefone>"}|||END|||
- IMPORTANTE: O service_id DEVE ser o UUID completo mostrado entre parênteses (ID: ...) na lista de serviços. NUNCA use números como "1", "2", etc.
- NUNCA invente horários. Use APENAS os horários listados abaixo.
- Se não houver horários disponíveis para uma data, informe e sugira outra data.
- Se o cliente quiser cancelar ou desistir, responda normalmente e não faça agendamento.
- Quando perguntar a data, sugira dias próximos (hoje, amanhã, etc).
- Use emojis moderadamente para ser amigável.

SERVIÇOS DISPONÍVEIS:
${servicesText}

${workingHoursText}

${slotsText}

CONTEXTO ATUAL DA CONVERSA:
- Serviço selecionado: ${context.selected_service ? services.find((s: any) => s.id === context.selected_service)?.name || "nenhum" : "nenhum"}
- Data selecionada: ${context.selected_date || "nenhuma"}
- Horário selecionado: ${context.selected_time || "nenhum"}
- Nome do cliente: ${context.client_name || "não informado"}
- Telefone do cliente: ${context.client_phone || "não informado"}

LINK DA PÁGINA PÚBLICA (caso necessário): ${bookingLink}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const body = await req.json();

    if (body.action === "send-follow-up") {
      return await handleFollowUp(supabase, body);
    }

    const webhookData = body.data || body;
    const event = webhookData.event || body.event;

    if (event !== "messages.upsert") {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messageData = webhookData.data || webhookData;
    const instanceName = webhookData.instance || body.instance || messageData.instance;

    const message = messageData.message || messageData;
    const key = message.key || messageData.key;

    if (key?.fromMe) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const remoteJid = key?.remoteJid || "";
    const clientPhone = remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");

    if (remoteJid.includes("@g.us")) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!clientPhone || !instanceName) {
      console.error("Missing phone or instance:", { clientPhone, instanceName });
      return new Response(JSON.stringify({ success: false, error: "Missing data" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    let clientMessage = "";
    const msgContent = message.message || messageData.message || {};

    if (msgContent.conversation) {
      clientMessage = msgContent.conversation;
    } else if (msgContent.extendedTextMessage?.text) {
      clientMessage = msgContent.extendedTextMessage.text;
    } else if (msgContent.audioMessage) {
      try {
        const mediaRes = await fetch(`${EVOLUTION_URL()}/chat/getBase64FromMediaMessage/${instanceName}`, {
          method: "POST",
          headers: getEvolutionHeaders(),
          body: JSON.stringify({ message: { key: key } }),
        });

        if (mediaRes.ok) {
          const mediaData = await mediaRes.json();
          if (mediaData.base64) {
            clientMessage = await downloadAndTranscribeAudio("", instanceName);
          }
        }
      } catch (audioErr) {
        console.error("Audio processing error:", audioErr);
      }

      if (!clientMessage) clientMessage = "[Áudio não reconhecido]";
    } else if (msgContent.imageMessage || msgContent.videoMessage || msgContent.documentMessage) {
      clientMessage = "[Mídia recebida - por favor envie uma mensagem de texto ou áudio]";
    }

    if (!clientMessage) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("professional_id, instance_name, status")
      .eq("instance_name", instanceName)
      .single();

    if (!instance) {
      console.error("Instance not found:", instanceName);
      return new Response(JSON.stringify({ success: false, error: "Instance not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const professionalId = instance.professional_id;

    const { data: professional } = await supabase
      .from("professionals")
      .select("id, name, business_name, slug, welcome_message, feature_whatsapp")
      .eq("id", professionalId)
      .single();

    if (!professional || !professional.feature_whatsapp) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bookingLink = professional.slug ? `https://gende.io/${professional.slug}` : "";

    const { data: existingConv } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("professional_id", professionalId)
      .eq("client_phone", clientPhone)
      .eq("status", "active")
      .maybeSingle();

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

    if (!services || services.length === 0) {
      const welcomeMsg = `Olá! 👋 Bem-vindo(a) ao ${professional.business_name || professional.name}!

No momento não temos serviços disponíveis para agendamento online.

Por favor, entre em contato diretamente conosco. 😊`;
      await sendWhatsAppMessage(instanceName, clientPhone, welcomeMsg);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let conversation = existingConv;
    let conversationMessages: Array<{ role: string; content: string }> = [];
    let context: any = {};

    if (!conversation) {
      context = { client_phone: clientPhone };
      conversationMessages = [{ role: "user", content: clientMessage }];

      const profName = professional.business_name || professional.name;
      let welcomeText = professional.welcome_message || `Olá! 👋 Bem-vindo(a) ao *${profName}*! Ficamos felizes em atendê-lo(a)! 😊`;
      welcomeText = welcomeText
        .replace(/\{nome\}/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();

      if (bookingLink) {
        welcomeText += `\n\n📱 Agende também pela nossa página: ${bookingLink}`;
      }
      welcomeText += `\n\nSe quiser continuar por aqui, é só me dizer o que gostaria. 😊`;

      await sendWhatsAppMessage(instanceName, clientPhone, welcomeText);

      conversationMessages.push({ role: "assistant", content: welcomeText });

      const { data: newConv } = await supabase
        .from("whatsapp_conversations")
        .insert({
          professional_id: professionalId,
          client_phone: clientPhone,
          messages: conversationMessages,
          context,
          status: "active",
        })
        .select()
        .single();

      conversation = newConv;

    } else {
      context = conversation.context || {};
      conversationMessages = (conversation.messages as any[]) || [];
      conversationMessages.push({ role: "user", content: clientMessage });

      let availableSlots: any[] | null = null;

      if (context.selected_service && context.selected_date) {
        const { data: slotsData } = await supabase.rpc("get_available_slots", {
          p_professional_id: professionalId,
          p_service_id: context.selected_service,
          p_date: context.selected_date,
        });

        if (slotsData?.success && slotsData.slots) {
          availableSlots = slotsData.slots;
        }
      }

      const systemPrompt = buildSystemPrompt(professional, services, availableSlots, context, bookingLink, workingHours);

      const aiResponse = await getAIResponse(
        conversationMessages.map(m => ({ role: m.role, content: m.content })),
        systemPrompt
      );

      const bookingMatch = aiResponse.match(/\|\|\|BOOKING\|\|\|(.+?)\|\|\|END\|\|\|/);

      if (bookingMatch) {
        try {
          const bookingData = JSON.parse(bookingMatch[1]);

          const [hours, minutes] = bookingData.time.split(":");
          const startTime = new Date(`${bookingData.date}T${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}:00-03:00`);

          console.log("Attempting booking:", JSON.stringify({ professionalId, service_id: bookingData.service_id, start_time: startTime.toISOString(), client_name: bookingData.client_name }));
          const { data: bookingResult, error: bookingError } = await supabase.rpc("create_public_booking", {
            p_professional_id: professionalId,
            p_service_id: bookingData.service_id,
            p_start_time: startTime.toISOString(),
            p_client_name: bookingData.client_name,
            p_client_phone: normalizePhone(bookingData.client_phone || clientPhone),
          });
          if (bookingError) console.error("Booking RPC error:", bookingError);
          console.log("Booking result:", JSON.stringify(bookingResult));

          if (bookingResult?.success) {
            const friendlyMsg = aiResponse.replace(/\|\|\|BOOKING\|\|\|.+?\|\|\|END\|\|\|/, "").trim();
            const successMsg = friendlyMsg || `✅ Seu agendamento foi confirmado!

📅 Data: ${bookingData.date}
⏰ Horário: ${bookingData.time}
💰 Valor: R$ ${Number(bookingResult.price).toFixed(2)}

Agradecemos pela preferência! 😊`;

            await sendWhatsAppMessage(instanceName, clientPhone, successMsg);

            try {
              const { data: upsellRules } = await supabase
                .from("upsell_rules")
                .select("recommended_service_id, promo_message, promo_price")
                .eq("professional_id", professionalId)
                .eq("source_service_id", bookingData.service_id)
                .eq("is_active", true)
                .order("priority", { ascending: true })
                .limit(2);

              if (upsellRules && upsellRules.length > 0) {
                const { data: upsellFlag } = await supabase
                  .from("feature_flags")
                  .select("enabled")
                  .eq("key", "upsell_inteligente")
                  .maybeSingle();

                if (upsellFlag?.enabled) {
                  const { data: upsellOverride } = await supabase
                    .from("professional_feature_overrides")
                    .select("enabled")
                    .eq("professional_id", professionalId)
                    .eq("feature_key", "upsell_inteligente")
                    .maybeSingle();

                  const upsellEnabled = upsellOverride ? upsellOverride.enabled : true;

                  if (upsellEnabled) {
                    const recIds = upsellRules.map((r: any) => r.recommended_service_id);
                    const { data: recServices } = await supabase
                      .from("services")
                      .select("id, name, price")
                      .in("id", recIds);

                    if (recServices && recServices.length > 0) {
                      let upsellMsg = "✨ *Aproveite para complementar seu atendimento:*\n\n";
                      for (const rule of upsellRules as any[]) {
                        const svc = recServices.find((s: any) => s.id === rule.recommended_service_id);
                        if (svc) {
                          const price = rule.promo_price || svc.price;
                          upsellMsg += `💆 *${svc.name}* — R$ ${Number(price).toFixed(2)}`;
                          if (rule.promo_message) upsellMsg += `\n${rule.promo_message}`;
                          upsellMsg += "\n\n";

                          await supabase.from("upsell_events").insert({
                            professional_id: professionalId,
                            booking_id: bookingResult.booking_id,
                            source_service_id: bookingData.service_id,
                            recommended_service_id: svc.id,
                            client_phone: clientPhone,
                            channel: "whatsapp",
                            status: "suggested",
                          });
                        }
                      }
                      upsellMsg += "Responda com o nome do serviço se quiser adicionar! 😊";

                      await sendWhatsAppMessage(instanceName, clientPhone, upsellMsg);
                    }
                  }
                }
              }
            } catch (upsellErr) {
              console.error("Upsell suggestion error:", upsellErr);
            }

            await supabase
              .from("whatsapp_conversations")
              .update({
                status: "completed",
                messages: [...conversationMessages, { role: "assistant", content: successMsg }],
                context: { ...context, booking_id: bookingResult.booking_id },
              })
              .eq("id", conversation.id);

            await supabase.from("whatsapp_logs").insert({
              professional_id: professionalId,
              booking_id: bookingResult.booking_id,
              recipient_phone: clientPhone,
              message_content: successMsg,
              status: "sent",
              sent_at: new Date().toISOString(),
            });

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
                  bookingId: bookingResult.booking_id,
                  triggerType: "booking_created",
                }),
              });
            } catch (e) {
              console.error("Error triggering automation:", e);
            }

          } else {
            const errorMsg = `❌ Ops! Não consegui realizar o agendamento: ${bookingResult?.error || "erro desconhecido"}.

Por favor, tente outro horário ou data. 😊`;
            await sendWhatsAppMessage(instanceName, clientPhone, errorMsg);

            conversationMessages.push({ role: "assistant", content: errorMsg });
            await supabase
              .from("whatsapp_conversations")
              .update({ messages: conversationMessages, context })
              .eq("id", conversation.id);
          }
        } catch (parseErr) {
          console.error("Booking parse error:", parseErr);
          const errorMsg = "Desculpe, houve um erro ao processar seu agendamento. Pode tentar novamente? 😊";
          await sendWhatsAppMessage(instanceName, clientPhone, errorMsg);
          conversationMessages.push({ role: "assistant", content: errorMsg });
          await supabase
            .from("whatsapp_conversations")
            .update({ messages: conversationMessages })
            .eq("id", conversation.id);
        }
      } else {
        const updatedContext = { ...context };

        for (const svc of services) {
          const svcNameLower = svc.name.toLowerCase();
          const msgLower = clientMessage.toLowerCase();
          if (msgLower.includes(svcNameLower) || msgLower === String(services.indexOf(svc) + 1)) {
            updatedContext.selected_service = svc.id;
            break;
          }
        }

        const dateMatch = clientMessage.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
        if (dateMatch) {
          const day = dateMatch[1].padStart(2, "0");
          const month = dateMatch[2].padStart(2, "0");
          const year = dateMatch[3] ? (dateMatch[3].length === 2 ? "20" + dateMatch[3] : dateMatch[3]) : new Date().getFullYear().toString();
          updatedContext.selected_date = `${year}-${month}-${day}`;
        }

        const msgLower = clientMessage.toLowerCase();
        const now = new Date();
        const spDateParts = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(now);

        if (msgLower.includes("hoje")) {
          updatedContext.selected_date = spDateParts;
        } else if (msgLower.includes("amanhã") || msgLower.includes("amanha")) {
          const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          const tomorrowParts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Sao_Paulo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(tomorrow);
          updatedContext.selected_date = tomorrowParts;
        } else {
          const dayNameMap: Record<string, number> = {
            "domingo": 0, "segunda": 1, "terça": 2, "terca": 2,
            "quarta": 3, "quinta": 4, "sexta": 5, "sábado": 6, "sabado": 6,
          };
          for (const [dayName, targetDow] of Object.entries(dayNameMap)) {
            if (msgLower.includes(dayName)) {
              const currentDow = new Date(spDateParts + "T12:00:00-03:00").getDay();
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
        }

        if (updatedContext.selected_service && updatedContext.selected_date && !availableSlots) {
          const { data: slotsData } = await supabase.rpc("get_available_slots", {
            p_professional_id: professionalId,
            p_service_id: updatedContext.selected_service,
            p_date: updatedContext.selected_date,
          });

          if (slotsData?.success && slotsData.slots) {
            availableSlots = slotsData.slots;
          }

          const systemPromptWithSlots = buildSystemPrompt(professional, services, availableSlots, updatedContext, bookingLink, workingHours);
          const aiResponseWithSlots = await getAIResponse(
            conversationMessages.map(m => ({ role: m.role, content: m.content })),
            systemPromptWithSlots
          );

          const bookingMatch2 = aiResponseWithSlots.match(/\|\|\|BOOKING\|\|\|(.+?)\|\|\|END\|\|\|/);
          if (bookingMatch2) {
            const bookingData = JSON.parse(bookingMatch2[1]);
            const [h, m] = bookingData.time.split(":");
            const startTime = new Date(`${bookingData.date}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:00-03:00`);

            console.log("Attempting booking (2nd path):", JSON.stringify({ date: bookingData.date, time: bookingData.time, service_id: bookingData.service_id }));
            const { data: bookingResult, error: bookingError2 } = await supabase.rpc("create_public_booking", {
              p_professional_id: professionalId,
              p_service_id: bookingData.service_id,
              p_start_time: startTime.toISOString(),
              p_client_name: bookingData.client_name,
              p_client_phone: normalizePhone(bookingData.client_phone || clientPhone),
            });
            if (bookingError2) console.error("Booking RPC error (2nd):", bookingError2);
            console.log("Booking result (2nd):", JSON.stringify(bookingResult));

            const friendlyMsg = aiResponseWithSlots.replace(/\|\|\|BOOKING\|\|\|.+?\|\|\|END\|\|\|/, "").trim();
            if (bookingResult?.success) {
              const msg = friendlyMsg || "✅ Agendamento confirmado!";
              await sendWhatsAppMessage(instanceName, clientPhone, msg);
              await supabase.from("whatsapp_conversations").update({
                status: "completed",
                messages: [...conversationMessages, { role: "assistant", content: msg }],
                context: { ...updatedContext, booking_id: bookingResult.booking_id },
              }).eq("id", conversation.id);
              await supabase.from("whatsapp_logs").insert({
                professional_id: professionalId,
                booking_id: bookingResult.booking_id,
                recipient_phone: clientPhone,
                message_content: msg,
                status: "sent",
                sent_at: new Date().toISOString(),
              });
            } else {
              const errMsg = `❌ Não foi possível agendar: ${bookingResult?.error || "erro"}. Tente outro horário.`;
              await sendWhatsAppMessage(instanceName, clientPhone, errMsg);
              conversationMessages.push({ role: "assistant", content: errMsg });
              await supabase.from("whatsapp_conversations").update({
                messages: conversationMessages, context: updatedContext,
              }).eq("id", conversation.id);
            }
          } else {
            const cleanResponse = aiResponseWithSlots.replace(/\|\|\|BOOKING\|\|\|.+?\|\|\|END\|\|\|/g, "").trim();
            await sendWhatsAppMessage(instanceName, clientPhone, cleanResponse);
            conversationMessages.push({ role: "assistant", content: cleanResponse });
            await supabase.from("whatsapp_conversations").update({
              messages: conversationMessages, context: updatedContext,
            }).eq("id", conversation.id);
          }
        } else {
          const cleanResponse = aiResponse.replace(/\|\|\|BOOKING\|\|\|.+?\|\|\|END\|\|\|/g, "").trim();
          await sendWhatsAppMessage(instanceName, clientPhone, cleanResponse);
          conversationMessages.push({ role: "assistant", content: cleanResponse });
          await supabase.from("whatsapp_conversations").update({
            messages: conversationMessages, context: updatedContext,
          }).eq("id", conversation.id);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});