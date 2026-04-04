CREATE OR REPLACE FUNCTION public.get_public_payment_config(
  p_professional_id uuid
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'pix_key', pc.pix_key,
    'pix_beneficiary_name', pc.pix_beneficiary_name,
    'signal_enabled',
      CASE
        WHEN pc.signal_enabled
         AND EXISTS (
           SELECT 1
           FROM public.subscriptions s
           WHERE s.professional_id = p_professional_id
             AND s.status = 'active'
             AND s.plan_id IN ('enterprise', 'pro')
         )
        THEN true
        ELSE false
      END,
    'signal_type', pc.signal_type,
    'signal_value', pc.signal_value,
    'accept_pix', pc.accept_pix
  )
  FROM public.payment_config pc
  WHERE pc.professional_id = p_professional_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_payment_config(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_payment_config(uuid) TO authenticated;
