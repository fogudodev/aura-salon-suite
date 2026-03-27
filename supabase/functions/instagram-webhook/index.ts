import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // GET = Meta webhook verification
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const VERIFY_TOKEN = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // POST = incoming events from Meta
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("Instagram webhook received:", JSON.stringify(body));

      if (body.object !== "instagram") {
        return new Response("Not instagram", { status: 200 });
      }

      for (const entry of body.entry || []) {
        const igUserId = entry.id;

        // Find the salon that owns this Instagram account
        const { data: account } = await supabaseAdmin
          .from("instagram_accounts")
          .select("*")
          .eq("instagram_user_id", igUserId)
          .eq("is_active", true)
          .single();

        if (!account) {
          console.log("No account found for IG user:", igUserId);
          continue;
        }

        // Process messaging events
        for (const messagingEvent of entry.messaging || []) {
          const senderId = messagingEvent.sender?.id;
          const messageText = messagingEvent.message?.text;

          if (!messageText || senderId === igUserId) continue;

          // Save incoming message
          await supabaseAdmin.from("instagram_messages").insert({
            professional_id: account.professional_id,
            instagram_user_id: igUserId,
            sender_id: senderId,
            message_text: messageText,
            message_type: "dm",
            direction: "incoming",
          });

          // Auto-reply if enabled
          if (account.auto_reply_enabled) {
            await handleAutoReply(supabaseAdmin, account, senderId, messageText);
          }
        }

        // Process comment events (changes field)
        for (const change of entry.changes || []) {
          if (change.field === "comments") {
            const comment = change.value;
            const commentText = comment?.text || "";
            const commenterId = comment?.from?.id;

            if (!commenterId || commenterId === igUserId) continue;

            // Save comment as message
            await supabaseAdmin.from("instagram_messages").insert({
              professional_id: account.professional_id,
              instagram_user_id: igUserId,
              sender_id: commenterId,
              sender_username: comment?.from?.username,
              message_text: commentText,
              message_type: "comment",
              direction: "incoming",
            });

            // Check keywords for auto DM
            if (account.auto_comment_reply_enabled) {
              await handleCommentKeyword(supabaseAdmin, account, commenterId, commentText);
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Webhook error:", error);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 200, // Always return 200 to Meta to avoid retries
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});

async function handleAutoReply(
  supabase: any,
  account: any,
  senderId: string,
  messageText: string
) {
  try {
    // Get professional's services for context
    const { data: services } = await supabase
      .from("services")
      .select("name, price, duration_minutes")
      .eq("professional_id", account.professional_id)
      .eq("active", true)
      .limit(10);

    const { data: professional } = await supabase
      .from("professionals")
      .select("name, business_name, slug, phone")
      .eq("id", account.professional_id)
      .single();

    const serviceList = (services || [])
      .map((s: any, i: number) => `${i + 1}. ${s.name} - R$${s.price} (${s.duration_minutes}min)`)
      .join("\n");

    const bookingLink = professional?.slug
      ? `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions/${professional.slug}`
      : null;

    const salonName = professional?.business_name || professional?.name || "nosso salão";

    // Call AI for response
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not set");
      return;
    }

    const systemPrompt = `Você é a assistente virtual do ${salonName} no Instagram. Responda de forma simpática, profissional e breve (máx 200 palavras).

Serviços disponíveis:
${serviceList || "Consulte nosso catálogo"}

${bookingLink ? `Link de agendamento: ${bookingLink}` : ""}
${professional?.phone ? `WhatsApp: wa.me/55${professional.phone.replace(/\D/g, "")}` : ""}

Regras:
- Responda perguntas sobre serviços e preços
- Sempre ofereça o link de agendamento quando possível
- Se o cliente quiser atendimento humano, ofereça o WhatsApp
- Use emojis moderadamente
- Seja acolhedor(a) e profissional`;

    const aiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: messageText },
        ],
      }),
    });

    if (!aiResponse.ok) {
      console.error("AI error:", aiResponse.status);
      return;
    }

    const aiData = await aiResponse.json();
    const replyText = aiData.choices?.[0]?.message?.content;

    if (!replyText) return;

    // Send reply via Instagram API
    const sendResponse = await fetch(
      `https://graph.instagram.com/v21.0/${account.instagram_user_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: senderId },
          message: { text: replyText },
        }),
      }
    );

    if (sendResponse.ok) {
      // Save outgoing message
      await supabase.from("instagram_messages").insert({
        professional_id: account.professional_id,
        instagram_user_id: account.instagram_user_id,
        sender_id: account.instagram_user_id,
        message_text: replyText,
        message_type: "dm",
        direction: "outgoing",
      });
    } else {
      const errText = await sendResponse.text();
      console.error("Instagram send error:", errText);
    }
  } catch (err) {
    console.error("Auto reply error:", err);
  }
}

async function handleCommentKeyword(
  supabase: any,
  account: any,
  commenterId: string,
  commentText: string
) {
  try {
    const { data: keywords } = await supabase
      .from("instagram_keywords")
      .select("*")
      .eq("professional_id", account.professional_id)
      .eq("is_active", true);

    if (!keywords?.length) return;

    const lowerComment = commentText.toLowerCase();
    const matchedKeyword = keywords.find((kw: any) =>
      lowerComment.includes(kw.keyword.toLowerCase())
    );

    if (!matchedKeyword) return;

    // Increment trigger count
    await supabase
      .from("instagram_keywords")
      .update({ trigger_count: matchedKeyword.trigger_count + 1 })
      .eq("id", matchedKeyword.id);

    const { data: professional } = await supabase
      .from("professionals")
      .select("name, business_name, slug")
      .eq("id", account.professional_id)
      .single();

    const salonName = professional?.business_name || professional?.name || "nosso salão";
    const bookingLink = professional?.slug
      ? `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions/${professional.slug}`
      : "";

    let replyText = matchedKeyword.custom_response;
    if (!replyText || matchedKeyword.response_type === "booking_link") {
      replyText = `Oi! 👋 Vi que você comentou no nosso post.\n\n` +
        `Que bom que se interessou pelo ${salonName}! ✨\n\n` +
        (bookingLink
          ? `Agende seu horário aqui: ${bookingLink}\n\n`
          : `Entre em contato para agendar!\n\n`) +
        `Estamos te esperando! 💇‍♀️`;
    }

    // Send DM to commenter
    const sendResponse = await fetch(
      `https://graph.instagram.com/v21.0/${account.instagram_user_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: commenterId },
          message: { text: replyText },
        }),
      }
    );

    if (sendResponse.ok) {
      await supabase.from("instagram_messages").insert({
        professional_id: account.professional_id,
        instagram_user_id: account.instagram_user_id,
        sender_id: account.instagram_user_id,
        message_text: replyText,
        message_type: "dm_from_comment",
        direction: "outgoing",
      });
    } else {
      const errText = await sendResponse.text();
      console.error("Instagram comment DM error:", errText);
    }
  } catch (err) {
    console.error("Comment keyword error:", err);
  }
}
