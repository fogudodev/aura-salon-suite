ALTER TABLE public.whatsapp_campaign_metrics_daily
  ADD COLUMN IF NOT EXISTS failed_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.whatsapp_logs
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.whatsapp_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campaign_recipient_id uuid REFERENCES public.whatsapp_campaign_recipients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS response_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_logs_professional_idempotency
ON public.whatsapp_logs(professional_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_professional_provider_sent_at
ON public.whatsapp_logs(professional_id, provider, sent_at DESC)
WHERE status = 'sent' AND sent_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_click_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.whatsapp_campaign_recipients(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  target_url text NOT NULL,
  expires_at timestamptz NOT NULL,
  clicked_at timestamptz,
  click_count integer NOT NULL DEFAULT 0,
  first_user_agent text,
  last_user_agent text,
  first_ip text,
  last_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_campaign_click_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals view own whatsapp campaign click links" ON public.whatsapp_campaign_click_links;
CREATE POLICY "Professionals view own whatsapp campaign click links"
ON public.whatsapp_campaign_click_links
FOR SELECT TO authenticated
USING (professional_id = public.get_my_professional_id());

DROP POLICY IF EXISTS "Admin can manage all whatsapp campaign click links" ON public.whatsapp_campaign_click_links;
CREATE POLICY "Admin can manage all whatsapp campaign click links"
ON public.whatsapp_campaign_click_links
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_click_links_campaign
ON public.whatsapp_campaign_click_links(campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_click_links_recipient
ON public.whatsapp_campaign_click_links(recipient_id, created_at DESC);

DROP TRIGGER IF EXISTS update_whatsapp_campaign_click_links_updated_at ON public.whatsapp_campaign_click_links;
CREATE TRIGGER update_whatsapp_campaign_click_links_updated_at
BEFORE UPDATE ON public.whatsapp_campaign_click_links
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_runtime_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_active boolean NOT NULL DEFAULT false,
  worker_url text NOT NULL DEFAULT '',
  worker_secret text NOT NULL DEFAULT '',
  batch_size integer NOT NULL DEFAULT 20,
  max_batches integer NOT NULL DEFAULT 4,
  tick_interval_seconds integer NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.whatsapp_campaign_runtime_config (id, is_active, worker_url, worker_secret, batch_size, max_batches, tick_interval_seconds)
VALUES (1, false, '', '', 20, 4, 60)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.whatsapp_campaign_runtime_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage campaign runtime config" ON public.whatsapp_campaign_runtime_config;
CREATE POLICY "Admin can manage campaign runtime config"
ON public.whatsapp_campaign_runtime_config
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS update_whatsapp_campaign_runtime_config_updated_at ON public.whatsapp_campaign_runtime_config;
CREATE TRIGGER update_whatsapp_campaign_runtime_config_updated_at
BEFORE UPDATE ON public.whatsapp_campaign_runtime_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.dispatch_whatsapp_campaign_worker_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.whatsapp_campaign_runtime_config;
  req_id bigint;
BEGIN
  SELECT *
  INTO cfg
  FROM public.whatsapp_campaign_runtime_config
  WHERE id = 1;

  IF cfg IS NULL OR cfg.is_active = false THEN
    RETURN jsonb_build_object('ok', true, 'dispatched', false, 'reason', 'runtime_config_inactive');
  END IF;

  IF COALESCE(trim(cfg.worker_url), '') = '' OR COALESCE(trim(cfg.worker_secret), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'dispatched', false, 'reason', 'worker_config_missing');
  END IF;

  SELECT
    extensions.net.http_post(
      url := cfg.worker_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-campaign-worker-secret', cfg.worker_secret
      ),
      body := jsonb_build_object(
        'batchSize', GREATEST(COALESCE(cfg.batch_size, 20), 1),
        'maxBatches', GREATEST(COALESCE(cfg.max_batches, 4), 1)
      )
    )
  INTO req_id;

  RETURN jsonb_build_object('ok', true, 'dispatched', true, 'request_id', req_id);
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_whatsapp_campaign_worker_tick() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_whatsapp_campaign_worker_tick() TO service_role;

DO $$
DECLARE
  job_id bigint;
BEGIN
  FOR job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'whatsapp-campaign-worker-tick'
  LOOP
    PERFORM cron.unschedule(job_id);
  END LOOP;

  PERFORM cron.schedule(
    'whatsapp-campaign-worker-tick',
    '* * * * *',
    $cron$SELECT public.dispatch_whatsapp_campaign_worker_tick();$cron$
  );
END $$;
