
-- Add new columns to upsell_rules for WhatsApp automation
ALTER TABLE public.upsell_rules
  ADD COLUMN IF NOT EXISTS discount_percentage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS message_template text DEFAULT 'Oi {nome}, vi que você agendou {servico} 💁‍♀️ Que tal potencializar o resultado com {upsell}? Hoje com {desconto}% OFF 😍 Quer adicionar no seu horário?',
  ADD COLUMN IF NOT EXISTS send_timing text DEFAULT 'immediate';

-- Create upsell_recipients table
CREATE TABLE IF NOT EXISTS public.upsell_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  upsell_rule_id uuid REFERENCES public.upsell_rules(id) ON DELETE SET NULL,
  client_phone text,
  message_payload text,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  delivered_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_upsell_recipients_professional ON public.upsell_recipients(professional_id);
CREATE INDEX IF NOT EXISTS idx_upsell_recipients_status ON public.upsell_recipients(status);
CREATE INDEX IF NOT EXISTS idx_upsell_recipients_booking ON public.upsell_recipients(booking_id);
CREATE INDEX IF NOT EXISTS idx_upsell_recipients_client ON public.upsell_recipients(client_id);

-- Enable RLS
ALTER TABLE public.upsell_recipients ENABLE ROW LEVEL SECURITY;

-- RLS policies for upsell_recipients
CREATE POLICY "Professionals can view their own upsell recipients"
  ON public.upsell_recipients FOR SELECT
  TO authenticated
  USING (professional_id = public.get_my_professional_id());

CREATE POLICY "Professionals can insert their own upsell recipients"
  ON public.upsell_recipients FOR INSERT
  TO authenticated
  WITH CHECK (professional_id = public.get_my_professional_id());

CREATE POLICY "Professionals can update their own upsell recipients"
  ON public.upsell_recipients FOR UPDATE
  TO authenticated
  USING (professional_id = public.get_my_professional_id());

-- Admin access
CREATE POLICY "Admins can manage all upsell recipients"
  ON public.upsell_recipients FOR ALL
  TO authenticated
  USING (public.is_admin());

-- Add event_type and value columns to upsell_events if missing
ALTER TABLE public.upsell_events
  ADD COLUMN IF NOT EXISTS event_type text DEFAULT 'suggested',
  ADD COLUMN IF NOT EXISTS value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.upsell_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
