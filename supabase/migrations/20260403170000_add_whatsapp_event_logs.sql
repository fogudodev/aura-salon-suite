CREATE TABLE IF NOT EXISTS public.whatsapp_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid REFERENCES public.professionals(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL,
  automation_id uuid REFERENCES public.whatsapp_automations(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  instance_name text,
  provider text NOT NULL DEFAULT 'unknown',
  direction text NOT NULL DEFAULT 'system',
  event_type text NOT NULL,
  message_id text,
  client_identifier text,
  normalized_phone text,
  status text NOT NULL DEFAULT 'info',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_event_logs_professional_created_at
  ON public.whatsapp_event_logs (professional_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_event_logs_conversation_created_at
  ON public.whatsapp_event_logs (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_event_logs_event_type_created_at
  ON public.whatsapp_event_logs (event_type, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_event_logs_unique_inbound_message
  ON public.whatsapp_event_logs (professional_id, provider, message_id, event_type, direction)
  WHERE message_id IS NOT NULL
    AND direction = 'inbound'
    AND event_type = 'inbound_received';

ALTER TABLE public.whatsapp_event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professionals view own whatsapp event logs"
ON public.whatsapp_event_logs
FOR SELECT
USING (professional_id = get_my_professional_id());

CREATE POLICY "Admin can manage whatsapp event logs"
ON public.whatsapp_event_logs
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());
