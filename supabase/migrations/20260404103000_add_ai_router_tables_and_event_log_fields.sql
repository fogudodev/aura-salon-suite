ALTER TABLE public.whatsapp_event_logs
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS latency_ms integer,
  ADD COLUMN IF NOT EXISTS input_tokens integer,
  ADD COLUMN IF NOT EXISTS output_tokens integer,
  ADD COLUMN IF NOT EXISTS estimated_cost numeric(12,4),
  ADD COLUMN IF NOT EXISTS fallback_used boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS error_code text;

CREATE TABLE IF NOT EXISTS public.ai_provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL UNIQUE REFERENCES public.professionals(id) ON DELETE CASCADE,
  primary_provider text NOT NULL DEFAULT 'gemini',
  primary_model text NOT NULL DEFAULT 'gemini-2.5-flash',
  fallback_provider text NOT NULL DEFAULT 'groq',
  fallback_model text NOT NULL DEFAULT 'llama-3.1-8b-instant',
  monthly_budget_cents integer NOT NULL DEFAULT 0,
  hard_stop_on_budget boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_provider_circuit_breakers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  provider text NOT NULL,
  consecutive_failures integer NOT NULL DEFAULT 0,
  circuit_open_until timestamptz,
  last_failure_at timestamptz,
  last_failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_settings_professional
  ON public.ai_provider_settings (professional_id);

CREATE INDEX IF NOT EXISTS idx_ai_provider_circuit_breakers_professional_provider
  ON public.ai_provider_circuit_breakers (professional_id, provider);

ALTER TABLE public.ai_provider_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_circuit_breakers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professionals manage own ai provider settings"
ON public.ai_provider_settings
FOR ALL
USING (professional_id = public.get_my_professional_id())
WITH CHECK (professional_id = public.get_my_professional_id());

CREATE POLICY "Admin manages ai provider settings"
ON public.ai_provider_settings
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Professionals view own ai provider circuit breakers"
ON public.ai_provider_circuit_breakers
FOR SELECT
USING (professional_id = public.get_my_professional_id());

CREATE POLICY "Admin manages ai provider circuit breakers"
ON public.ai_provider_circuit_breakers
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TRIGGER update_ai_provider_settings_updated_at
BEFORE UPDATE ON public.ai_provider_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_provider_circuit_breakers_updated_at
BEFORE UPDATE ON public.ai_provider_circuit_breakers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
