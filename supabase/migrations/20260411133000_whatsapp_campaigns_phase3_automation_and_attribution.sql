ALTER TABLE public.whatsapp_campaign_automations
  ADD COLUMN IF NOT EXISTS objective text NOT NULL DEFAULT 'reativacao',
  ADD COLUMN IF NOT EXISTS audience_type text NOT NULL DEFAULT 'customizado',
  ADD COLUMN IF NOT EXISTS audience_filter_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_start boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS send_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_result_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.whatsapp_campaign_attributions
  ADD COLUMN IF NOT EXISTS hours_to_booking numeric(10,2),
  ADD COLUMN IF NOT EXISTS touch_signal text NOT NULL DEFAULT 'window';

CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES public.whatsapp_campaign_automations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'started',
  campaign_id uuid REFERENCES public.whatsapp_campaigns(id) ON DELETE SET NULL,
  audience_count integer NOT NULL DEFAULT 0,
  created_campaign boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  error_message text,
  result_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_campaign_automation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals view own whatsapp campaign automation runs" ON public.whatsapp_campaign_automation_runs;
CREATE POLICY "Professionals view own whatsapp campaign automation runs"
ON public.whatsapp_campaign_automation_runs
FOR SELECT TO authenticated
USING (professional_id = public.get_my_professional_id());

DROP POLICY IF EXISTS "Admin can manage all whatsapp campaign automation runs" ON public.whatsapp_campaign_automation_runs;
CREATE POLICY "Admin can manage all whatsapp campaign automation runs"
ON public.whatsapp_campaign_automation_runs
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS update_whatsapp_campaign_automation_runs_updated_at ON public.whatsapp_campaign_automation_runs;
CREATE TRIGGER update_whatsapp_campaign_automation_runs_updated_at
BEFORE UPDATE ON public.whatsapp_campaign_automation_runs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_automations_professional_active
ON public.whatsapp_campaign_automations(professional_id, is_active, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_automation_runs_professional
ON public.whatsapp_campaign_automation_runs(professional_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_automation_runs_automation
ON public.whatsapp_campaign_automation_runs(automation_id, started_at DESC);

-- Keep only the highest-score attribution per professional+booking to support single-source revenue attribution.
WITH ranked AS (
  SELECT
    id,
    professional_id,
    booking_id,
    ROW_NUMBER() OVER (
      PARTITION BY professional_id, booking_id
      ORDER BY attribution_score DESC, attributed_at DESC, created_at DESC
    ) AS rn
  FROM public.whatsapp_campaign_attributions
  WHERE booking_id IS NOT NULL
)
DELETE FROM public.whatsapp_campaign_attributions a
USING ranked r
WHERE a.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_campaign_attributions_professional_booking_unique
ON public.whatsapp_campaign_attributions(professional_id, booking_id)
WHERE booking_id IS NOT NULL;

