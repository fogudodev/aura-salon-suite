CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_automation_run_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES public.whatsapp_campaign_automations(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.whatsapp_campaign_automation_runs(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'info',
  step text NOT NULL,
  message text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_campaign_automation_run_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals view own whatsapp campaign automation run logs" ON public.whatsapp_campaign_automation_run_logs;
CREATE POLICY "Professionals view own whatsapp campaign automation run logs"
ON public.whatsapp_campaign_automation_run_logs
FOR SELECT TO authenticated
USING (professional_id = public.get_my_professional_id());

DROP POLICY IF EXISTS "Admin can manage all whatsapp campaign automation run logs" ON public.whatsapp_campaign_automation_run_logs;
CREATE POLICY "Admin can manage all whatsapp campaign automation run logs"
ON public.whatsapp_campaign_automation_run_logs
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_automation_run_logs_professional
ON public.whatsapp_campaign_automation_run_logs(professional_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_automation_run_logs_automation
ON public.whatsapp_campaign_automation_run_logs(automation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_automation_run_logs_run
ON public.whatsapp_campaign_automation_run_logs(run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_automation_runtime_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_active boolean NOT NULL DEFAULT false,
  worker_url text NOT NULL DEFAULT '',
  worker_secret text NOT NULL DEFAULT '',
  max_automations integer NOT NULL DEFAULT 20,
  run_batch_size integer NOT NULL DEFAULT 20,
  tick_interval_minutes integer NOT NULL DEFAULT 5,
  last_dispatch_at timestamptz,
  last_dispatch_result_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.whatsapp_campaign_automation_runtime_config (
  id,
  is_active,
  worker_url,
  worker_secret,
  max_automations,
  run_batch_size,
  tick_interval_minutes
)
VALUES (1, false, '', '', 20, 20, 5)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.whatsapp_campaign_automation_runtime_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage campaign automation runtime config" ON public.whatsapp_campaign_automation_runtime_config;
CREATE POLICY "Admin can manage campaign automation runtime config"
ON public.whatsapp_campaign_automation_runtime_config
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS update_whatsapp_campaign_automation_runtime_config_updated_at ON public.whatsapp_campaign_automation_runtime_config;
CREATE TRIGGER update_whatsapp_campaign_automation_runtime_config_updated_at
BEFORE UPDATE ON public.whatsapp_campaign_automation_runtime_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.dispatch_whatsapp_campaign_automation_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.whatsapp_campaign_automation_runtime_config;
  req_id bigint;
  dispatch_result jsonb;
BEGIN
  SELECT *
  INTO cfg
  FROM public.whatsapp_campaign_automation_runtime_config
  WHERE id = 1;

  IF cfg IS NULL OR cfg.is_active = false THEN
    RETURN jsonb_build_object('ok', true, 'dispatched', false, 'reason', 'runtime_config_inactive');
  END IF;

  IF COALESCE(trim(cfg.worker_url), '') = '' OR COALESCE(trim(cfg.worker_secret), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'dispatched', false, 'reason', 'worker_config_missing');
  END IF;

  IF cfg.last_dispatch_at IS NOT NULL
     AND cfg.last_dispatch_at > now() - make_interval(mins => GREATEST(COALESCE(cfg.tick_interval_minutes, 5), 1)) THEN
    RETURN jsonb_build_object('ok', true, 'dispatched', false, 'reason', 'interval_not_reached');
  END IF;

  SELECT
    extensions.net.http_post(
      url := cfg.worker_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-campaign-automation-worker-secret', cfg.worker_secret
      ),
      body := jsonb_build_object(
        'limit', GREATEST(COALESCE(cfg.max_automations, 20), 1),
        'batchSize', GREATEST(COALESCE(cfg.run_batch_size, 20), 1)
      )
    )
  INTO req_id;

  dispatch_result := jsonb_build_object(
    'request_id', req_id,
    'dispatched_at', now(),
    'limit', GREATEST(COALESCE(cfg.max_automations, 20), 1),
    'batchSize', GREATEST(COALESCE(cfg.run_batch_size, 20), 1)
  );

  UPDATE public.whatsapp_campaign_automation_runtime_config
  SET
    last_dispatch_at = now(),
    last_dispatch_result_json = dispatch_result
  WHERE id = 1;

  RETURN jsonb_build_object('ok', true, 'dispatched', true, 'request_id', req_id);
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_whatsapp_campaign_automation_tick() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_whatsapp_campaign_automation_tick() TO service_role;

DO $$
DECLARE
  job_id bigint;
BEGIN
  FOR job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'whatsapp-campaign-automation-worker-tick'
  LOOP
    PERFORM cron.unschedule(job_id);
  END LOOP;

  PERFORM cron.schedule(
    'whatsapp-campaign-automation-worker-tick',
    '* * * * *',
    $cron$SELECT public.dispatch_whatsapp_campaign_automation_tick();$cron$
  );
END $$;
