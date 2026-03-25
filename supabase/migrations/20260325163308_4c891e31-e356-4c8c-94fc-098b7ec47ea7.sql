
-- =============================================
-- Intelligent Reactivation Engine - Database Schema
-- =============================================

-- 1. Add reactivation columns to clients table
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS last_completed_appointment_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS avg_return_interval_days INTEGER,
  ADD COLUMN IF NOT EXISTS average_ticket NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactivation_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactivation_status TEXT DEFAULT 'active';

-- 2. Reactivation Campaigns
CREATE TABLE public.reactivation_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID NOT NULL,
  name TEXT NOT NULL,
  segment_filter JSONB DEFAULT '{}'::jsonb,
  message_template TEXT NOT NULL,
  send_mode TEXT NOT NULL DEFAULT 'immediate',
  send_limit_per_day INTEGER DEFAULT 50,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'draft',
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  converted_count INTEGER DEFAULT 0,
  revenue_generated NUMERIC DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.reactivation_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage all reactivation campaigns"
  ON public.reactivation_campaigns FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Professionals manage own reactivation campaigns"
  ON public.reactivation_campaigns FOR ALL TO authenticated
  USING (professional_id = get_my_professional_id())
  WITH CHECK (professional_id = get_my_professional_id());

-- 3. Reactivation Campaign Recipients
CREATE TABLE public.reactivation_campaign_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.reactivation_campaigns(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  client_name TEXT,
  client_phone TEXT,
  message_payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  converted_at TIMESTAMP WITH TIME ZONE,
  conversion_booking_id UUID,
  conversion_value NUMERIC DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.reactivation_campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage all reactivation recipients"
  ON public.reactivation_campaign_recipients FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Professionals manage own reactivation recipients"
  ON public.reactivation_campaign_recipients FOR ALL TO authenticated
  USING (campaign_id IN (
    SELECT id FROM public.reactivation_campaigns
    WHERE professional_id = get_my_professional_id()
  ))
  WITH CHECK (campaign_id IN (
    SELECT id FROM public.reactivation_campaigns
    WHERE professional_id = get_my_professional_id()
  ));

-- 4. Reactivation Events (conversion tracking)
CREATE TABLE public.reactivation_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  campaign_id UUID REFERENCES public.reactivation_campaigns(id) ON DELETE SET NULL,
  recipient_id UUID REFERENCES public.reactivation_campaign_recipients(id) ON DELETE SET NULL,
  professional_id UUID NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'message_sent',
  value NUMERIC DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.reactivation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage all reactivation events"
  ON public.reactivation_events FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Professionals manage own reactivation events"
  ON public.reactivation_events FOR ALL TO authenticated
  USING (professional_id = get_my_professional_id())
  WITH CHECK (professional_id = get_my_professional_id());

-- 5. Trigger for updated_at on reactivation_campaigns
CREATE TRIGGER update_reactivation_campaigns_updated_at
  BEFORE UPDATE ON public.reactivation_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Index for performance
CREATE INDEX idx_reactivation_recipients_campaign ON public.reactivation_campaign_recipients(campaign_id);
CREATE INDEX idx_reactivation_recipients_client ON public.reactivation_campaign_recipients(client_id);
CREATE INDEX idx_reactivation_recipients_status ON public.reactivation_campaign_recipients(status);
CREATE INDEX idx_reactivation_events_client ON public.reactivation_events(client_id);
CREATE INDEX idx_reactivation_events_campaign ON public.reactivation_events(campaign_id);
CREATE INDEX idx_clients_reactivation_score ON public.clients(reactivation_score);
CREATE INDEX idx_clients_reactivation_status ON public.clients(reactivation_status);
CREATE INDEX idx_clients_last_completed ON public.clients(last_completed_appointment_at);
