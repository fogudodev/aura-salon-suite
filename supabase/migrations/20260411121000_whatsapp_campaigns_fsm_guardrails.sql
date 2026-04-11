UPDATE public.whatsapp_campaigns
SET status = 'failed'
WHERE status NOT IN ('draft', 'scheduled', 'processing', 'paused', 'cancelled', 'completed', 'failed', 'sent');

UPDATE public.whatsapp_campaign_dispatch_jobs
SET status = 'failed'
WHERE status NOT IN ('pending', 'processing', 'retrying', 'completed', 'failed', 'cancelled');

UPDATE public.whatsapp_campaign_recipients
SET recipient_status = 'failed'
WHERE recipient_status NOT IN ('pending', 'queued', 'sending', 'sent', 'delivered', 'read', 'replied', 'clicked', 'booked', 'failed', 'opted_out', 'skipped');

ALTER TABLE public.whatsapp_campaigns
  DROP CONSTRAINT IF EXISTS whatsapp_campaigns_status_check;

ALTER TABLE public.whatsapp_campaigns
  ADD CONSTRAINT whatsapp_campaigns_status_check
  CHECK (status IN ('draft', 'scheduled', 'processing', 'paused', 'cancelled', 'completed', 'failed', 'sent'));

ALTER TABLE public.whatsapp_campaign_dispatch_jobs
  DROP CONSTRAINT IF EXISTS whatsapp_campaign_dispatch_jobs_status_check;

ALTER TABLE public.whatsapp_campaign_dispatch_jobs
  ADD CONSTRAINT whatsapp_campaign_dispatch_jobs_status_check
  CHECK (status IN ('pending', 'processing', 'retrying', 'completed', 'failed', 'cancelled'));

ALTER TABLE public.whatsapp_campaign_recipients
  DROP CONSTRAINT IF EXISTS whatsapp_campaign_recipients_status_check;

ALTER TABLE public.whatsapp_campaign_recipients
  ADD CONSTRAINT whatsapp_campaign_recipients_status_check
  CHECK (recipient_status IN ('pending', 'queued', 'sending', 'sent', 'delivered', 'read', 'replied', 'clicked', 'booked', 'failed', 'opted_out', 'skipped'));

CREATE OR REPLACE FUNCTION public.is_valid_campaign_status_transition(old_status text, new_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN old_status = new_status THEN true
    WHEN old_status = 'draft' AND new_status IN ('scheduled', 'processing', 'cancelled') THEN true
    WHEN old_status = 'scheduled' AND new_status IN ('draft', 'processing', 'cancelled') THEN true
    WHEN old_status = 'processing' AND new_status IN ('paused', 'completed', 'failed', 'cancelled') THEN true
    WHEN old_status = 'paused' AND new_status IN ('processing', 'cancelled', 'failed', 'completed') THEN true
    WHEN old_status = 'sent' AND new_status IN ('completed', 'failed') THEN true
    WHEN old_status IN ('completed', 'failed', 'cancelled') THEN false
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_valid_campaign_job_status_transition(old_status text, new_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN old_status = new_status THEN true
    WHEN old_status = 'pending' AND new_status IN ('processing', 'retrying', 'failed', 'cancelled') THEN true
    WHEN old_status = 'retrying' AND new_status IN ('processing', 'failed', 'cancelled') THEN true
    WHEN old_status = 'processing' AND new_status IN ('completed', 'retrying', 'failed', 'cancelled', 'pending') THEN true
    WHEN old_status IN ('completed', 'failed', 'cancelled') THEN false
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_valid_campaign_recipient_status_transition(old_status text, new_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN old_status = new_status THEN true
    WHEN old_status = 'pending' AND new_status IN ('queued', 'sending', 'failed', 'skipped') THEN true
    WHEN old_status = 'queued' AND new_status IN ('sending', 'sent', 'failed', 'skipped') THEN true
    WHEN old_status = 'sending' AND new_status IN ('queued', 'sent', 'failed') THEN true
    WHEN old_status = 'sent' AND new_status IN ('delivered', 'read', 'replied', 'clicked', 'booked', 'failed', 'opted_out') THEN true
    WHEN old_status = 'delivered' AND new_status IN ('read', 'replied', 'clicked', 'booked', 'failed', 'opted_out') THEN true
    WHEN old_status = 'read' AND new_status IN ('replied', 'clicked', 'booked', 'failed', 'opted_out') THEN true
    WHEN old_status = 'replied' AND new_status IN ('clicked', 'booked', 'failed', 'opted_out') THEN true
    WHEN old_status = 'clicked' AND new_status IN ('booked', 'failed', 'opted_out') THEN true
    WHEN old_status IN ('booked', 'failed', 'opted_out', 'skipped') THEN false
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_campaign_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT public.is_valid_campaign_status_transition(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'Invalid campaign status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_campaign_job_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT public.is_valid_campaign_job_status_transition(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'Invalid campaign job status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_campaign_recipient_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.recipient_status IS DISTINCT FROM OLD.recipient_status
     AND NOT public.is_valid_campaign_recipient_status_transition(OLD.recipient_status, NEW.recipient_status) THEN
    RAISE EXCEPTION 'Invalid campaign recipient status transition: % -> %', OLD.recipient_status, NEW.recipient_status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS whatsapp_campaigns_enforce_status_transition ON public.whatsapp_campaigns;
CREATE TRIGGER whatsapp_campaigns_enforce_status_transition
BEFORE UPDATE ON public.whatsapp_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.enforce_campaign_status_transition();

DROP TRIGGER IF EXISTS whatsapp_campaign_jobs_enforce_status_transition ON public.whatsapp_campaign_dispatch_jobs;
CREATE TRIGGER whatsapp_campaign_jobs_enforce_status_transition
BEFORE UPDATE ON public.whatsapp_campaign_dispatch_jobs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_campaign_job_status_transition();

DROP TRIGGER IF EXISTS whatsapp_campaign_recipients_enforce_status_transition ON public.whatsapp_campaign_recipients;
CREATE TRIGGER whatsapp_campaign_recipients_enforce_status_transition
BEFORE UPDATE ON public.whatsapp_campaign_recipients
FOR EACH ROW
EXECUTE FUNCTION public.enforce_campaign_recipient_status_transition();
