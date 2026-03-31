import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getEvolutionUrl(): string {
  const url = Deno.env.get("EVOLUTION_API_URL");
  if (!url) {
    throw new Error("EVOLUTION_API_URL not configured");
  }
  return url;
}

function getEvolutionKey(): string {
  const key = Deno.env.get("EVOLUTION_API_KEY");
  if (!key) {
    throw new Error("EVOLUTION_API_KEY not configured");
  }
  return key;
}

function replaceVars(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value || "");
  }
  return result;
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

  const EVOLUTION_URL = getEvolutionUrl();
  const EVOLUTION_KEY = getEvolutionKey();

  try {
    const body = await req.json().catch(() => ({}));
    const results: Array<{ type: string; id: string; success: boolean; error?: string }> = [];

    // If called with action: "trigger", handle a specific event-driven automation
    if (body.action === "trigger") {
      const result = await handleTrigger(supabase, EVOLUTION_URL, EVOLUTION_KEY, body);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Otherwise: scheduled cron — handle time-based reminders
    const now = new Date();

    // Get all professionals with connected WhatsApp
    const { data: instances } = await supabase
      .from("whatsapp_instances")
      .select("professional_id, instance_name, status")
      .eq("status", "connected");

    if (!instances || instances.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const inst of instances) {
      const profId = inst.professional_id;

      // Get active course automations for this professional
      const { data: automations } = await supabase
        .from("whatsapp_automations")
        .select("*")
        .eq("professional_id", profId)
        .eq("is_active", true)
        .in("trigger_type", ["course_reminder_7d", "course_reminder_1d", "course_reminder_day",
          "course_send_location", "course_send_link", "course_followup", "course_feedback_request"]);

      if (!automations || automations.length === 0) continue;

      const autoMap = new Map(automations.map(a => [a.trigger_type, a]));

      // Get professional info
      const { data: prof } = await supabase
        .from("professionals")
        .select("id, slug, business_name, name")
        .eq("id", profId)
        .single();

      if (!prof) continue;

      // Get confirmed enrollments with class/course info
      const { data: enrollments } = await supabase
        .from("course_enrollments")
        .select("*, courses(name, slug), course_classes(name, class_date, start_time, end_time, location, online_link, modality, status)")
        .eq("professional_id", profId)
        .eq("enrollment_status", "confirmed");

      if (!enrollments || enrollments.length === 0) continue;

      for (const enrollment of enrollments) {
        const cls = (enrollment as any).course_classes;
        const course = (enrollment as any).courses;
        if (!cls || !course || !enrollment.student_phone) continue;
        if (cls.status === "cancelled") continue;

        const classDate = new Date(cls.class_date + "T" + cls.start_time);
        const diffMs = classDate.getTime() - now.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        const dataFormatted = new Date(cls.class_date).toLocaleDateString("pt-BR");
        const horarioFormatted = cls.start_time?.substring(0, 5) || "";
        const bookingLink = prof.slug ? `https://gende.io/cursos/${course.slug || prof.slug}` : "";

        const vars: Record<string, string> = {
          nome: enrollment.student_name || "Aluno",
          curso: course.name || "curso",
          turma: cls.name || "",
          data: dataFormatted,
          horario: horarioFormatted,
          local: cls.location || "",
          link_aula: cls.online_link || "",
          link: bookingLink,
          link_avaliacao: bookingLink,
          link_certificado: "",
          descricao: "",
          valor: String(enrollment.amount_paid || 0),
        };

        // Determine which reminders to send based on time
        const triggersToSend: string[] = [];

        // 7 days before (6.5 to 7.5 days)
        if (diffDays >= 6.5 && diffDays <= 7.5 && autoMap.has("course_reminder_7d")) {
          triggersToSend.push("course_reminder_7d");
        }
        // 1 day before (0.5 to 1.5 days)
        if (diffDays >= 0.5 && diffDays <= 1.5 && autoMap.has("course_reminder_1d")) {
          triggersToSend.push("course_reminder_1d");
        }
        // Day of (0 to 0.5 days, only if class hasn't started yet)
        if (diffDays >= -0.5 && diffDays <= 0.5 && diffMs > 0 && autoMap.has("course_reminder_day")) {
          triggersToSend.push("course_reminder_day");
        }
        // Send location 1 day before for in-person classes
        if (diffDays >= 0.5 && diffDays <= 1.5 && cls.modality === "presencial" && cls.location && autoMap.has("course_send_location")) {
          triggersToSend.push("course_send_location");
        }
        // Send link day of for online classes
        if (diffDays >= -0.5 && diffDays <= 0.5 && diffMs > 0 && cls.modality === "online" && cls.online_link && autoMap.has("course_send_link")) {
          triggersToSend.push("course_send_link");
        }

        // Post-course follow-up: class happened 1 day ago
        if (diffDays >= -1.5 && diffDays <= -0.5 && autoMap.has("course_followup")) {
          triggersToSend.push("course_followup");
        }
        // Feedback request: class happened 3 days ago
        if (diffDays >= -3.5 && diffDays <= -2.5 && autoMap.has("course_feedback_request")) {
          triggersToSend.push("course_feedback_request");
        }

        for (const triggerType of triggersToSend) {
          const automation = autoMap.get(triggerType)!;

          // Check if already sent
          const { data: existingLog } = await supabase
            .from("whatsapp_logs")
            .select("id")
            .eq("professional_id", profId)
            .eq("automation_id", automation.id)
            .eq("recipient_phone", enrollment.student_phone)
            .eq("booking_id", enrollment.id)
            .limit(1);

          if (existingLog && existingLog.length > 0) continue;

          const finalMessage = replaceVars(automation.message_template, vars);

          const sendRes = await fetch(`${EVOLUTION_URL}/message/sendText/${inst.instance_name}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
            body: JSON.stringify({ number: enrollment.student_phone, text: finalMessage }),
          });
          const sendData = await sendRes.json();

          await supabase.from("whatsapp_logs").insert({
            professional_id: profId,
            automation_id: automation.id,
            booking_id: enrollment.id,
            recipient_phone: enrollment.student_phone,
            message_content: finalMessage,
            status: sendRes.ok ? "sent" : "failed",
            sent_at: sendRes.ok ? new Date().toISOString() : null,
            error_message: sendRes.ok ? null : JSON.stringify(sendData),
          });

          results.push({ type: triggerType, id: enrollment.id, success: sendRes.ok });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Send course reminders error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

// Handle event-driven course automations
async function handleTrigger(
  supabase: any,
  EVOLUTION_URL: string,
  EVOLUTION_KEY: string,
  body: {
    professionalId: string;
    triggerType: string;
    enrollmentId?: string;
    classId?: string;
    extraVars?: Record<string, string>;
    recipients?: Array<{ name: string; phone: string }>;
  }
) {
  const { professionalId, triggerType, enrollmentId, classId, extraVars, recipients } = body;

  // Get automation
  const { data: automation } = await supabase
    .from("whatsapp_automations")
    .select("*")
    .eq("professional_id", professionalId)
    .eq("trigger_type", triggerType)
    .eq("is_active", true)
    .single();

  if (!automation) return { success: false, error: "Automação não encontrada ou inativa" };

  // Get WhatsApp instance
  const { data: inst } = await supabase
    .from("whatsapp_instances")
    .select("instance_name, status")
    .eq("professional_id", professionalId)
    .single();

  if (!inst || inst.status !== "connected") return { success: false, error: "WhatsApp não conectado" };

  const { data: prof } = await supabase
    .from("professionals")
    .select("id, slug, business_name, name")
    .eq("id", professionalId)
    .single();

  const results: any[] = [];

  // Build recipient list
  let targetRecipients: Array<{ name: string; phone: string; enrollmentId?: string }> = [];

  if (recipients && recipients.length > 0) {
    targetRecipients = recipients;
  } else if (enrollmentId) {
    const { data: enrollment } = await supabase
      .from("course_enrollments")
      .select("*, courses(name, slug), course_classes(name, class_date, start_time, location, online_link)")
      .eq("id", enrollmentId)
      .single();

    if (enrollment && enrollment.student_phone) {
      targetRecipients = [{ name: enrollment.student_name, phone: enrollment.student_phone, enrollmentId: enrollment.id }];

      const cls = (enrollment as any).course_classes;
      const course = (enrollment as any).courses;
      if (!extraVars?.curso && course) (extraVars as any || {}).curso = course.name;
    }
  } else if (classId) {
    // Send to all confirmed enrollments of a class
    const { data: enrollments } = await supabase
      .from("course_enrollments")
      .select("id, student_name, student_phone, courses(name, slug), course_classes(name, class_date, start_time, location, online_link)")
      .eq("class_id", classId)
      .eq("professional_id", professionalId)
      .eq("enrollment_status", "confirmed");

    if (enrollments) {
      targetRecipients = enrollments
        .filter((e: any) => e.student_phone)
        .map((e: any) => ({ name: e.student_name, phone: e.student_phone, enrollmentId: e.id }));
    }
  }

  for (const recipient of targetRecipients) {
    const vars: Record<string, string> = {
      nome: recipient.name || "Aluno",
      link: prof?.slug ? `https://gende.io/${prof.slug}` : "",
      ...(extraVars || {}),
    };

    const finalMessage = replaceVars(automation.message_template, vars);

    const sendRes = await fetch(`${EVOLUTION_URL}/message/sendText/${inst.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
      body: JSON.stringify({ number: recipient.phone, text: finalMessage }),
    });
    const sendData = await sendRes.json();

    await supabase.from("whatsapp_logs").insert({
      professional_id: professionalId,
      automation_id: automation.id,
      booking_id: recipient.enrollmentId || null,
      recipient_phone: recipient.phone,
      message_content: finalMessage,
      status: sendRes.ok ? "sent" : "failed",
      sent_at: sendRes.ok ? new Date().toISOString() : null,
      error_message: sendRes.ok ? null : JSON.stringify(sendData),
    });

    results.push({ phone: recipient.phone, success: sendRes.ok });
  }

  return { success: true, sent: results.length, results };
}
