import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  insertWhatsAppEventLog,
  sendWhatsAppMessage,
} from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function replaceVars(template: string, vars: Record<string, string>) {
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
    { auth: { persistSession: false } },
  );

  try {
    const body = await req.json().catch(() => ({}));

    if (body.action === "trigger") {
      const result = await handleTrigger(supabase, body);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const results: Array<{ type: string; id: string; success: boolean; error?: string }> = [];

    const { data: instances } = await supabase
      .from("whatsapp_instances")
      .select("professional_id, instance_name, meta_phone_id, status")
      .eq("status", "connected");

    for (const instance of instances || []) {
      const professionalId = instance.professional_id;

      const { data: automations } = await supabase
        .from("whatsapp_automations")
        .select("*")
        .eq("professional_id", professionalId)
        .eq("is_active", true)
        .in("trigger_type", [
          "course_reminder_7d",
          "course_reminder_1d",
          "course_reminder_day",
          "course_send_location",
          "course_send_link",
          "course_followup",
          "course_feedback_request",
        ]);

      if (!automations || automations.length === 0) continue;

      const automationMap = new Map(automations.map((automation) => [automation.trigger_type, automation]));

      const { data: professional } = await supabase
        .from("professionals")
        .select("id, slug, business_name, name")
        .eq("id", professionalId)
        .single();

      const { data: enrollments } = await supabase
        .from("course_enrollments")
        .select("*, courses(name, slug), course_classes(name, class_date, start_time, end_time, location, online_link, modality, status)")
        .eq("professional_id", professionalId)
        .eq("enrollment_status", "confirmed");

      for (const enrollment of enrollments || []) {
        const enrollmentWithRelations = enrollment as typeof enrollment & {
          course_classes?: Record<string, unknown> | null;
          courses?: Record<string, unknown> | null;
        };
        const courseClass = enrollmentWithRelations.course_classes;
        const course = enrollmentWithRelations.courses;
        if (!courseClass || !course || !enrollment.student_phone || courseClass.status === "cancelled") continue;

        const classDate = new Date(`${courseClass.class_date}T${courseClass.start_time}`);
        const diffMs = classDate.getTime() - now.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        const bookingLink = professional?.slug ? `https://gende.io/cursos/${course.slug || professional.slug}` : "";

        const vars = {
          nome: enrollment.student_name || "Aluno",
          curso: course.name || "curso",
          turma: courseClass.name || "",
          data: new Date(courseClass.class_date).toLocaleDateString("pt-BR"),
          horario: String(courseClass.start_time || "").substring(0, 5),
          local: courseClass.location || "",
          link_aula: courseClass.online_link || "",
          link: bookingLink,
          link_avaliacao: bookingLink,
          link_certificado: "",
          descricao: "",
          valor: String(enrollment.amount_paid || 0),
        };

        const triggersToSend: string[] = [];
        if (diffDays >= 6.5 && diffDays <= 7.5 && automationMap.has("course_reminder_7d")) triggersToSend.push("course_reminder_7d");
        if (diffDays >= 0.5 && diffDays <= 1.5 && automationMap.has("course_reminder_1d")) triggersToSend.push("course_reminder_1d");
        if (diffDays >= -0.5 && diffDays <= 0.5 && diffMs > 0 && automationMap.has("course_reminder_day")) triggersToSend.push("course_reminder_day");
        if (diffDays >= 0.5 && diffDays <= 1.5 && courseClass.modality === "presencial" && courseClass.location && automationMap.has("course_send_location")) triggersToSend.push("course_send_location");
        if (diffDays >= -0.5 && diffDays <= 0.5 && diffMs > 0 && courseClass.modality === "online" && courseClass.online_link && automationMap.has("course_send_link")) triggersToSend.push("course_send_link");
        if (diffDays >= -1.5 && diffDays <= -0.5 && automationMap.has("course_followup")) triggersToSend.push("course_followup");
        if (diffDays >= -3.5 && diffDays <= -2.5 && automationMap.has("course_feedback_request")) triggersToSend.push("course_feedback_request");

        for (const triggerType of triggersToSend) {
          const automation = automationMap.get(triggerType);
          if (!automation) continue;

          const { data: existingLog } = await supabase
            .from("whatsapp_logs")
            .select("id")
            .eq("professional_id", professionalId)
            .eq("automation_id", automation.id)
            .eq("recipient_phone", enrollment.student_phone)
            .eq("booking_id", enrollment.id)
            .limit(1);

          if (existingLog && existingLog.length > 0) continue;

          const message = replaceVars(automation.message_template, vars);
          const sendResult = await sendWhatsAppMessage({
            supabase,
            professionalId,
            recipient: enrollment.student_phone,
            message,
            instance,
            automationId: automation.id,
            bookingId: enrollment.id,
            preferredProvider: "evolution",
            details: {
              source: "send_course_reminders",
              trigger_type: triggerType,
            },
          });

          await insertWhatsAppEventLog(supabase, {
            professionalId,
            automationId: automation.id,
            bookingId: enrollment.id,
            instanceName: instance.instance_name ?? null,
            provider: sendResult.provider || "evolution",
            direction: "system",
            eventType: sendResult.success ? "course_automation_sent" : "course_automation_failed",
            clientIdentifier: enrollment.student_phone,
            normalizedPhone: sendResult.normalizedRecipient || null,
            status: sendResult.success ? "sent" : "failed",
            errorMessage: sendResult.success ? null : sendResult.error || null,
            details: {
              trigger_type: triggerType,
              attempted_providers: sendResult.attemptedProviders,
              response_status: sendResult.responseStatus ?? null,
            },
          });

          results.push({
            type: triggerType,
            id: enrollment.id,
            success: sendResult.success,
            error: sendResult.success ? undefined : sendResult.error,
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-course-reminders error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function handleTrigger(
  supabase: ReturnType<typeof createClient>,
  body: {
    professionalId: string;
    triggerType: string;
    enrollmentId?: string;
    classId?: string;
    extraVars?: Record<string, string>;
    recipients?: Array<{ name: string; phone: string }>;
  },
) {
  const { professionalId, triggerType, enrollmentId, classId, extraVars, recipients } = body;

  const { data: automation } = await supabase
    .from("whatsapp_automations")
    .select("*")
    .eq("professional_id", professionalId)
    .eq("trigger_type", triggerType)
    .eq("is_active", true)
    .single();

  if (!automation) return { success: false, error: "Automação não encontrada ou inativa" };

  const { data: instance } = await supabase
    .from("whatsapp_instances")
    .select("professional_id, instance_name, meta_phone_id, status")
    .eq("professional_id", professionalId)
    .maybeSingle();

  if (!instance || instance.status !== "connected") {
    return { success: false, error: "WhatsApp não conectado" };
  }

  const { data: professional } = await supabase
    .from("professionals")
    .select("id, slug, business_name, name")
    .eq("id", professionalId)
    .single();

  let targets: Array<{ name: string; phone: string; enrollmentId?: string }> = [];

  if (recipients?.length) {
    targets = recipients;
  } else if (enrollmentId) {
    const { data: enrollment } = await supabase
      .from("course_enrollments")
      .select("*, courses(name, slug), course_classes(name, class_date, start_time, location, online_link)")
      .eq("id", enrollmentId)
      .single();

    if (enrollment?.student_phone) {
      targets = [{ name: enrollment.student_name, phone: enrollment.student_phone, enrollmentId: enrollment.id }];
    }
  } else if (classId) {
    const { data: enrollments } = await supabase
      .from("course_enrollments")
      .select("id, student_name, student_phone")
      .eq("class_id", classId)
      .eq("professional_id", professionalId)
      .eq("enrollment_status", "confirmed");

    targets = (enrollments || [])
      .filter((enrollment) => enrollment.student_phone)
      .map((enrollment) => ({
        name: enrollment.student_name,
        phone: enrollment.student_phone,
        enrollmentId: enrollment.id,
      }));
  }

  const results: Array<{ phone: string; success: boolean; error?: string }> = [];

  for (const target of targets) {
    const vars = {
      nome: target.name || "Aluno",
      link: professional?.slug ? `https://gende.io/${professional.slug}` : "",
      ...(extraVars || {}),
    };

    const message = replaceVars(automation.message_template, vars);
    const sendResult = await sendWhatsAppMessage({
      supabase,
      professionalId,
      recipient: target.phone,
      message,
      instance,
      automationId: automation.id,
      bookingId: target.enrollmentId || null,
      preferredProvider: "evolution",
      details: {
        source: "send_course_reminders_trigger",
        trigger_type: triggerType,
      },
    });

    results.push({
      phone: target.phone,
      success: sendResult.success,
      error: sendResult.success ? undefined : sendResult.error,
    });
  }

  return { success: true, sent: results.filter((result) => result.success).length, results };
}
