ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS origin_channel text,
  ADD COLUMN IF NOT EXISTS marketing_consent_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_opt_out_at timestamptz;

CREATE TABLE IF NOT EXISTS public.client_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, name)
);

ALTER TABLE public.client_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals manage own client tags" ON public.client_tags;
CREATE POLICY "Professionals manage own client tags"
ON public.client_tags
FOR ALL TO authenticated
USING (professional_id = public.get_my_professional_id())
WITH CHECK (professional_id = public.get_my_professional_id());

DROP POLICY IF EXISTS "Admin can manage all client tags" ON public.client_tags;
CREATE POLICY "Admin can manage all client tags"
ON public.client_tags
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.client_tag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.client_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, tag_id)
);

ALTER TABLE public.client_tag_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals manage own client tag assignments" ON public.client_tag_assignments;
CREATE POLICY "Professionals manage own client tag assignments"
ON public.client_tag_assignments
FOR ALL TO authenticated
USING (professional_id = public.get_my_professional_id())
WITH CHECK (professional_id = public.get_my_professional_id());

DROP POLICY IF EXISTS "Admin can manage all client tag assignments" ON public.client_tag_assignments;
CREATE POLICY "Admin can manage all client tag assignments"
ON public.client_tag_assignments
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.client_marketing_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  whatsapp_marketing_consent boolean NOT NULL DEFAULT true,
  consent_source text,
  consented_at timestamptz,
  opted_out_at timestamptz,
  max_campaigns_per_30_days integer NOT NULL DEFAULT 6,
  quiet_hours_start time,
  quiet_hours_end time,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_marketing_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals manage own client marketing preferences" ON public.client_marketing_preferences;
CREATE POLICY "Professionals manage own client marketing preferences"
ON public.client_marketing_preferences
FOR ALL TO authenticated
USING (professional_id = public.get_my_professional_id())
WITH CHECK (professional_id = public.get_my_professional_id());

DROP POLICY IF EXISTS "Admin can manage all client marketing preferences" ON public.client_marketing_preferences;
CREATE POLICY "Admin can manage all client marketing preferences"
ON public.client_marketing_preferences
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid REFERENCES public.professionals(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL,
  objective text NOT NULL,
  body text NOT NULL,
  variables_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  tone text NOT NULL DEFAULT 'human',
  is_ai_generated boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  is_system_template boolean NOT NULL DEFAULT false,
  preview_example_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_campaign_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals view own or system campaign templates" ON public.whatsapp_campaign_templates;
CREATE POLICY "Professionals view own or system campaign templates"
ON public.whatsapp_campaign_templates
FOR SELECT TO authenticated
USING (
  professional_id = public.get_my_professional_id()
  OR professional_id IS NULL
);

DROP POLICY IF EXISTS "Professionals manage own campaign templates" ON public.whatsapp_campaign_templates;
CREATE POLICY "Professionals manage own campaign templates"
ON public.whatsapp_campaign_templates
FOR ALL TO authenticated
USING (professional_id = public.get_my_professional_id())
WITH CHECK (professional_id = public.get_my_professional_id());

DROP POLICY IF EXISTS "Admin can manage all campaign templates" ON public.whatsapp_campaign_templates;
CREATE POLICY "Admin can manage all campaign templates"
ON public.whatsapp_campaign_templates
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.whatsapp_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  source_opportunity_id uuid,
  name text NOT NULL,
  type text NOT NULL,
  objective text NOT NULL,
  audience_type text NOT NULL,
  audience_filter_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience_estimate_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  message_mode text NOT NULL DEFAULT 'freeform',
  template_id uuid REFERENCES public.whatsapp_campaign_templates(id) ON DELETE SET NULL,
  template_name text,
  message_body text NOT NULL DEFAULT '',
  cta_type text NOT NULL DEFAULT 'none',
  cta_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  send_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_level text NOT NULL DEFAULT 'healthy',
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals manage own whatsapp campaigns" ON public.whatsapp_campaigns;
CREATE POLICY "Professionals manage own whatsapp campaigns"
ON public.whatsapp_campaigns
FOR ALL TO authenticated
USING (professional_id = public.get_my_professional_id())
WITH CHECK (professional_id = public.get_my_professional_id());

DROP POLICY IF EXISTS "Admin can manage all whatsapp campaigns" ON public.whatsapp_campaigns;
CREATE POLICY "Admin can manage all whatsapp campaigns"
ON public.whatsapp_campaigns
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  phone text NOT NULL,
  personalization_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  recipient_status text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  failure_reason text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz,
  clicked_at timestamptz,
  booked_at timestamptz,
  revenue_generated numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, phone)
);

ALTER TABLE public.whatsapp_campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals manage own whatsapp campaign recipients" ON public.whatsapp_campaign_recipients;
CREATE POLICY "Professionals manage own whatsapp campaign recipients"
ON public.whatsapp_campaign_recipients
FOR ALL TO authenticated
USING (
  campaign_id IN (
    SELECT id FROM public.whatsapp_campaigns
    WHERE professional_id = public.get_my_professional_id()
  )
)
WITH CHECK (
  campaign_id IN (
    SELECT id FROM public.whatsapp_campaigns
    WHERE professional_id = public.get_my_professional_id()
  )
);

DROP POLICY IF EXISTS "Admin can manage all whatsapp campaign recipients" ON public.whatsapp_campaign_recipients;
CREATE POLICY "Admin can manage all whatsapp campaign recipients"
ON public.whatsapp_campaign_recipients
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_type text NOT NULL,
  rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  template_id uuid REFERENCES public.whatsapp_campaign_templates(id) ON DELETE SET NULL,
  message_body text NOT NULL DEFAULT '',
  cooldown_days integer NOT NULL DEFAULT 7,
  is_active boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_campaign_automations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals manage own whatsapp campaign automations" ON public.whatsapp_campaign_automations;
CREATE POLICY "Professionals manage own whatsapp campaign automations"
ON public.whatsapp_campaign_automations
FOR ALL TO authenticated
USING (professional_id = public.get_my_professional_id())
WITH CHECK (professional_id = public.get_my_professional_id());

DROP POLICY IF EXISTS "Admin can manage all whatsapp campaign automations" ON public.whatsapp_campaign_automations;
CREATE POLICY "Admin can manage all whatsapp campaign automations"
ON public.whatsapp_campaign_automations
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.whatsapp_campaign_recipients(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  provider_message_id text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_campaign_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals view own whatsapp campaign events" ON public.whatsapp_campaign_events;
CREATE POLICY "Professionals view own whatsapp campaign events"
ON public.whatsapp_campaign_events
FOR SELECT TO authenticated
USING (
  campaign_id IN (
    SELECT id FROM public.whatsapp_campaigns
    WHERE professional_id = public.get_my_professional_id()
  )
);

DROP POLICY IF EXISTS "Admin can manage all whatsapp campaign events" ON public.whatsapp_campaign_events;
CREATE POLICY "Admin can manage all whatsapp campaign events"
ON public.whatsapp_campaign_events
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_metrics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  date date NOT NULL,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  reply_count integer NOT NULL DEFAULT 0,
  click_count integer NOT NULL DEFAULT 0,
  booking_count integer NOT NULL DEFAULT 0,
  opt_out_count integer NOT NULL DEFAULT 0,
  revenue_generated numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, campaign_id, date)
);

ALTER TABLE public.whatsapp_campaign_metrics_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals view own whatsapp campaign metrics daily" ON public.whatsapp_campaign_metrics_daily;
CREATE POLICY "Professionals view own whatsapp campaign metrics daily"
ON public.whatsapp_campaign_metrics_daily
FOR SELECT TO authenticated
USING (professional_id = public.get_my_professional_id());

DROP POLICY IF EXISTS "Admin can manage all whatsapp campaign metrics daily" ON public.whatsapp_campaign_metrics_daily;
CREATE POLICY "Admin can manage all whatsapp campaign metrics daily"
ON public.whatsapp_campaign_metrics_daily
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  phone text NOT NULL,
  reason text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_campaign_suppressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals manage own whatsapp campaign suppressions" ON public.whatsapp_campaign_suppressions;
CREATE POLICY "Professionals manage own whatsapp campaign suppressions"
ON public.whatsapp_campaign_suppressions
FOR ALL TO authenticated
USING (professional_id = public.get_my_professional_id())
WITH CHECK (professional_id = public.get_my_professional_id());

DROP POLICY IF EXISTS "Admin can manage all whatsapp campaign suppressions" ON public.whatsapp_campaign_suppressions;
CREATE POLICY "Admin can manage all whatsapp campaign suppressions"
ON public.whatsapp_campaign_suppressions
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_dispatch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.whatsapp_campaign_recipients(id) ON DELETE CASCADE,
  job_type text NOT NULL DEFAULT 'send_message',
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  idempotency_key text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_campaign_dispatch_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals view own whatsapp campaign jobs" ON public.whatsapp_campaign_dispatch_jobs;
CREATE POLICY "Professionals view own whatsapp campaign jobs"
ON public.whatsapp_campaign_dispatch_jobs
FOR SELECT TO authenticated
USING (professional_id = public.get_my_professional_id());

DROP POLICY IF EXISTS "Admin can manage all whatsapp campaign jobs" ON public.whatsapp_campaign_dispatch_jobs;
CREATE POLICY "Admin can manage all whatsapp campaign jobs"
ON public.whatsapp_campaign_dispatch_jobs
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.whatsapp_campaign_recipients(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  attribution_type text NOT NULL DEFAULT 'window',
  attribution_score numeric(6,2) NOT NULL DEFAULT 0,
  revenue_amount numeric(12,2) NOT NULL DEFAULT 0,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_campaign_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals view own whatsapp campaign attributions" ON public.whatsapp_campaign_attributions;
CREATE POLICY "Professionals view own whatsapp campaign attributions"
ON public.whatsapp_campaign_attributions
FOR SELECT TO authenticated
USING (professional_id = public.get_my_professional_id());

DROP POLICY IF EXISTS "Admin can manage all whatsapp campaign attributions" ON public.whatsapp_campaign_attributions;
CREATE POLICY "Admin can manage all whatsapp campaign attributions"
ON public.whatsapp_campaign_attributions
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.lis_campaign_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  dedupe_key text NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  reason text NOT NULL,
  urgency_level text NOT NULL DEFAULT 'medium',
  confidence_score numeric(5,2) NOT NULL DEFAULT 0,
  audience_count integer NOT NULL DEFAULT 0,
  estimated_conversion_rate numeric(5,2) NOT NULL DEFAULT 0,
  estimated_bookings numeric(10,2) NOT NULL DEFAULT 0,
  estimated_revenue numeric(12,2) NOT NULL DEFAULT 0,
  suggested_campaign_objective text NOT NULL,
  suggested_message text NOT NULL,
  suggested_cta text NOT NULL DEFAULT 'booking_link',
  suggested_send_time timestamptz,
  suggested_audience_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new',
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  viewed_at timestamptz,
  dismissed_at timestamptz,
  snoozed_until timestamptz,
  converted_campaign_id uuid REFERENCES public.whatsapp_campaigns(id) ON DELETE SET NULL,
  converted_to_campaign_at timestamptz,
  last_notification_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, dedupe_key)
);

ALTER TABLE public.lis_campaign_opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals manage own lis campaign opportunities" ON public.lis_campaign_opportunities;
CREATE POLICY "Professionals manage own lis campaign opportunities"
ON public.lis_campaign_opportunities
FOR ALL TO authenticated
USING (professional_id = public.get_my_professional_id())
WITH CHECK (professional_id = public.get_my_professional_id());

DROP POLICY IF EXISTS "Admin can manage all lis campaign opportunities" ON public.lis_campaign_opportunities;
CREATE POLICY "Admin can manage all lis campaign opportunities"
ON public.lis_campaign_opportunities
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.lis_campaign_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.lis_campaign_opportunities(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp_internal',
  status text NOT NULL DEFAULT 'pending',
  message_body text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text,
  provider_message_id text,
  cooldown_key text NOT NULL,
  cooldown_until timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  acted_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lis_campaign_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals view own lis campaign notifications" ON public.lis_campaign_notifications;
CREATE POLICY "Professionals view own lis campaign notifications"
ON public.lis_campaign_notifications
FOR SELECT TO authenticated
USING (professional_id = public.get_my_professional_id());

DROP POLICY IF EXISTS "Admin can manage all lis campaign notifications" ON public.lis_campaign_notifications;
CREATE POLICY "Admin can manage all lis campaign notifications"
ON public.lis_campaign_notifications
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.lis_campaign_opportunity_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.lis_campaign_opportunities(id) ON DELETE CASCADE,
  notification_id uuid REFERENCES public.lis_campaign_notifications(id) ON DELETE SET NULL,
  interaction_type text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lis_campaign_opportunity_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals view own lis opportunity interactions" ON public.lis_campaign_opportunity_interactions;
CREATE POLICY "Professionals view own lis opportunity interactions"
ON public.lis_campaign_opportunity_interactions
FOR SELECT TO authenticated
USING (professional_id = public.get_my_professional_id());

DROP POLICY IF EXISTS "Admin can manage all lis opportunity interactions" ON public.lis_campaign_opportunity_interactions;
CREATE POLICY "Admin can manage all lis opportunity interactions"
ON public.lis_campaign_opportunity_interactions
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

ALTER TABLE public.whatsapp_campaigns
  ADD CONSTRAINT whatsapp_campaigns_source_opportunity_id_fkey
  FOREIGN KEY (source_opportunity_id)
  REFERENCES public.lis_campaign_opportunities(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_tags_professional_id ON public.client_tags(professional_id);
CREATE INDEX IF NOT EXISTS idx_client_tag_assignments_client_id ON public.client_tag_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_marketing_preferences_professional_id ON public.client_marketing_preferences(professional_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_professional_status ON public.whatsapp_campaigns(professional_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_scheduled_at ON public.whatsapp_campaigns(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_recipients_campaign_status ON public.whatsapp_campaign_recipients(campaign_id, recipient_status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_recipients_client_id ON public.whatsapp_campaign_recipients(client_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_events_campaign_id ON public.whatsapp_campaign_events(campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_metrics_daily_professional_date ON public.whatsapp_campaign_metrics_daily(professional_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_suppressions_professional_phone ON public.whatsapp_campaign_suppressions(professional_id, phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_dispatch_jobs_campaign_status ON public.whatsapp_campaign_dispatch_jobs(campaign_id, status, available_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_attributions_campaign_id ON public.whatsapp_campaign_attributions(campaign_id, attributed_at DESC);
CREATE INDEX IF NOT EXISTS idx_lis_campaign_opportunities_professional_status ON public.lis_campaign_opportunities(professional_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lis_campaign_opportunities_expires_at ON public.lis_campaign_opportunities(expires_at);
CREATE INDEX IF NOT EXISTS idx_lis_campaign_notifications_opportunity ON public.lis_campaign_notifications(opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lis_campaign_notifications_cooldown ON public.lis_campaign_notifications(professional_id, cooldown_key, cooldown_until);
CREATE INDEX IF NOT EXISTS idx_lis_campaign_opportunity_interactions_opportunity ON public.lis_campaign_opportunity_interactions(opportunity_id, created_at DESC);

DROP TRIGGER IF EXISTS update_client_tags_updated_at ON public.client_tags;
CREATE TRIGGER update_client_tags_updated_at
BEFORE UPDATE ON public.client_tags
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_marketing_preferences_updated_at ON public.client_marketing_preferences;
CREATE TRIGGER update_client_marketing_preferences_updated_at
BEFORE UPDATE ON public.client_marketing_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_whatsapp_campaign_templates_updated_at ON public.whatsapp_campaign_templates;
CREATE TRIGGER update_whatsapp_campaign_templates_updated_at
BEFORE UPDATE ON public.whatsapp_campaign_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_whatsapp_campaigns_updated_at_v2 ON public.whatsapp_campaigns;
CREATE TRIGGER update_whatsapp_campaigns_updated_at_v2
BEFORE UPDATE ON public.whatsapp_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_whatsapp_campaign_recipients_updated_at ON public.whatsapp_campaign_recipients;
CREATE TRIGGER update_whatsapp_campaign_recipients_updated_at
BEFORE UPDATE ON public.whatsapp_campaign_recipients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_whatsapp_campaign_automations_updated_at ON public.whatsapp_campaign_automations;
CREATE TRIGGER update_whatsapp_campaign_automations_updated_at
BEFORE UPDATE ON public.whatsapp_campaign_automations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_whatsapp_campaign_metrics_daily_updated_at ON public.whatsapp_campaign_metrics_daily;
CREATE TRIGGER update_whatsapp_campaign_metrics_daily_updated_at
BEFORE UPDATE ON public.whatsapp_campaign_metrics_daily
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_whatsapp_campaign_dispatch_jobs_updated_at ON public.whatsapp_campaign_dispatch_jobs;
CREATE TRIGGER update_whatsapp_campaign_dispatch_jobs_updated_at
BEFORE UPDATE ON public.whatsapp_campaign_dispatch_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_lis_campaign_opportunities_updated_at ON public.lis_campaign_opportunities;
CREATE TRIGGER update_lis_campaign_opportunities_updated_at
BEFORE UPDATE ON public.lis_campaign_opportunities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_lis_campaign_notifications_updated_at ON public.lis_campaign_notifications;
CREATE TRIGGER update_lis_campaign_notifications_updated_at
BEFORE UPDATE ON public.lis_campaign_notifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.whatsapp_campaign_templates (
  id,
  professional_id,
  name,
  category,
  objective,
  body,
  variables_json,
  tone,
  is_ai_generated,
  is_active,
  is_system_template,
  preview_example_json
) VALUES
(
  'a0be2ad7-1a9d-4d6f-8c79-918732b0d301',
  NULL,
  'Reativação elegante',
  'marketing',
  'reativacao',
  'Oi, {nome}. Faz um tempinho desde a sua última visita e a Lis separou um lembrete especial: temos uma boa janela para você voltar com {servico}. Se quiser, eu já deixo seu agendamento encaminhado aqui: {link_agendamento}',
  '["nome","servico","link_agendamento"]'::jsonb,
  'premium',
  false,
  true,
  true,
  '{"nome":"Marina","servico":"escova","link_agendamento":"https://gende.io/seu-negocio"}'::jsonb
),
(
  'b0be2ad7-1a9d-4d6f-8c79-918732b0d302',
  NULL,
  'Horário vago amanhã',
  'marketing',
  'preenchimento_agenda',
  'Oi, {nome}. Acabou de abrir um horário ótimo {janela_envio} com {profissional}. Se fizer sentido para você, posso te colocar nele agora: {link_agendamento}',
  '["nome","janela_envio","profissional","link_agendamento"]'::jsonb,
  'direct',
  false,
  true,
  true,
  '{"nome":"Larissa","janela_envio":"amanhã às 15h","profissional":"Ana","link_agendamento":"https://gende.io/seu-negocio"}'::jsonb
),
(
  'c0be2ad7-1a9d-4d6f-8c79-918732b0d303',
  NULL,
  'Manutenção de serviço',
  'marketing',
  'manutencao',
  'Oi, {nome}. Pela sua rotina com {servico}, este é um ótimo momento para manutenção. Se quiser garantir um horário antes da agenda apertar, aqui está seu link: {link_agendamento}',
  '["nome","servico","link_agendamento"]'::jsonb,
  'human',
  false,
  true,
  true,
  '{"nome":"Camila","servico":"manutenção de unhas","link_agendamento":"https://gende.io/seu-negocio"}'::jsonb
),
(
  'd0be2ad7-1a9d-4d6f-8c79-918732b0d304',
  NULL,
  'Aniversário com oferta',
  'marketing',
  'aniversario',
  'Parabéns, {nome}! 🎉 Para celebrar seu mês, a gente preparou uma condição especial para você voltar com {servico}. Se quiser aproveitar, é só me chamar ou usar este link: {link_agendamento}',
  '["nome","servico","link_agendamento"]'::jsonb,
  'human',
  false,
  true,
  true,
  '{"nome":"Juliana","servico":"seu atendimento favorito","link_agendamento":"https://gende.io/seu-negocio"}'::jsonb
),
(
  'e0be2ad7-1a9d-4d6f-8c79-918732b0d305',
  NULL,
  'Upsell pós-atendimento',
  'marketing',
  'upsell',
  'Oi, {nome}. Como você gostou de {servico}, a Lis separou uma sugestão que combina muito com seu atendimento: {servico_extra}. Se quiser, já deixo o próximo horário reservado por aqui: {link_agendamento}',
  '["nome","servico","servico_extra","link_agendamento"]'::jsonb,
  'premium',
  false,
  true,
  true,
  '{"nome":"Paula","servico":"coloração","servico_extra":"hidratação premium","link_agendamento":"https://gende.io/seu-negocio"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
