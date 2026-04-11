CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_campaign_dispatch_jobs_idempotency
ON public.whatsapp_campaign_dispatch_jobs(idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_recipients_provider_message_id
ON public.whatsapp_campaign_recipients(provider_message_id)
WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_recipients_phone
ON public.whatsapp_campaign_recipients(phone);

CREATE OR REPLACE FUNCTION public.claim_whatsapp_campaign_dispatch_jobs(
  p_limit integer DEFAULT 20,
  p_professional_id uuid DEFAULT NULL
)
RETURNS SETOF public.whatsapp_campaign_dispatch_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.whatsapp_campaign_dispatch_jobs
    WHERE status IN ('pending', 'retrying')
      AND available_at <= now()
      AND (locked_at IS NULL OR locked_at <= now() - interval '10 minutes')
      AND (p_professional_id IS NULL OR professional_id = p_professional_id)
    ORDER BY available_at ASC, created_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 20), 1)
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.whatsapp_campaign_dispatch_jobs jobs
    SET
      status = 'processing',
      locked_at = now(),
      updated_at = now()
    WHERE jobs.id IN (SELECT id FROM candidates)
    RETURNING jobs.*
  )
  SELECT * FROM updated;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_campaign_dispatch_jobs(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_campaign_dispatch_jobs(integer, uuid) TO service_role;
