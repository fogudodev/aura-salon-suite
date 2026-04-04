CREATE OR REPLACE FUNCTION public.get_public_client_by_phone(
  p_professional_id uuid,
  p_client_phone text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text := public.normalize_phone_digits(p_client_phone);
  v_client record;
BEGIN
  IF v_phone = '' THEN
    RETURN json_build_object('success', true, 'found', false);
  END IF;

  SELECT
    c.name
  INTO v_client
  FROM public.clients c
  WHERE c.professional_id = p_professional_id
    AND public.normalize_phone_digits(c.phone) = v_phone
  ORDER BY c.updated_at DESC, c.created_at DESC
  LIMIT 1;

  IF v_client IS NULL THEN
    RETURN json_build_object('success', true, 'found', false);
  END IF;

  RETURN json_build_object(
    'success', true,
    'found', true,
    'client_name', v_client.name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_client_by_phone(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_client_by_phone(uuid, text) TO authenticated;
