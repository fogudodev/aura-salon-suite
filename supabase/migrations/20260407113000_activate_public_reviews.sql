CREATE INDEX IF NOT EXISTS idx_reviews_booking_id
ON public.reviews (booking_id);

CREATE INDEX IF NOT EXISTS idx_platform_reviews_booking_id
ON public.platform_reviews (booking_id);

CREATE OR REPLACE FUNCTION public.get_public_review_context(
  p_slug text,
  p_booking_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context record;
BEGIN
  IF trim(coalesce(p_slug, '')) = '' OR p_booking_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'invalid_review_context');
  END IF;

  SELECT
    b.id AS booking_id,
    b.professional_id,
    b.client_name,
    b.client_phone,
    b.employee_id,
    b.status AS booking_status,
    COALESCE(s.name, 'Servico') AS service_name,
    e.name AS employee_name,
    COALESCE(p.business_name, p.name, 'Profissional') AS professional_name
  INTO v_context
  FROM public.professionals p
  JOIN public.bookings b
    ON b.professional_id = p.id
  LEFT JOIN public.services s
    ON s.id = b.service_id
  LEFT JOIN public.salon_employees e
    ON e.id = b.employee_id
  WHERE p.slug = trim(p_slug)
    AND b.id = p_booking_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'review_context_not_found');
  END IF;

  RETURN json_build_object(
    'success', true,
    'booking_id', v_context.booking_id,
    'professional_id', v_context.professional_id,
    'professional_name', v_context.professional_name,
    'client_name', v_context.client_name,
    'client_phone', v_context.client_phone,
    'employee_id', v_context.employee_id,
    'employee_name', v_context.employee_name,
    'service_name', v_context.service_name,
    'booking_status', v_context.booking_status,
    'professional_review_submitted',
      EXISTS (
        SELECT 1
        FROM public.reviews r
        WHERE r.booking_id = v_context.booking_id
      ),
    'platform_review_submitted',
      EXISTS (
        SELECT 1
        FROM public.platform_reviews pr
        WHERE pr.booking_id = v_context.booking_id
      )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_review_context(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_review_context(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_public_professional_review(
  p_slug text,
  p_booking_id uuid,
  p_rating integer,
  p_comment text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
  v_review_id uuid;
  v_comment text := NULLIF(trim(coalesce(p_comment, '')), '');
BEGIN
  IF trim(coalesce(p_slug, '')) = '' OR p_booking_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'invalid_review_request');
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RETURN json_build_object('success', false, 'error', 'invalid_rating');
  END IF;

  SELECT
    b.id AS booking_id,
    b.professional_id,
    b.client_name,
    b.client_phone,
    b.employee_id,
    b.status AS booking_status
  INTO v_booking
  FROM public.professionals p
  JOIN public.bookings b
    ON b.professional_id = p.id
  WHERE p.slug = trim(p_slug)
    AND b.id = p_booking_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'booking_not_found');
  END IF;

  IF v_booking.booking_status <> 'completed' THEN
    RETURN json_build_object('success', false, 'error', 'review_not_available_yet');
  END IF;

  SELECT r.id
  INTO v_review_id
  FROM public.reviews r
  WHERE r.booking_id = v_booking.booking_id
  LIMIT 1;

  IF v_review_id IS NOT NULL THEN
    RETURN json_build_object('success', true, 'already_submitted', true, 'review_id', v_review_id);
  END IF;

  INSERT INTO public.reviews (
    professional_id,
    booking_id,
    employee_id,
    client_name,
    client_phone,
    rating,
    comment,
    is_public
  ) VALUES (
    v_booking.professional_id,
    v_booking.booking_id,
    v_booking.employee_id,
    v_booking.client_name,
    v_booking.client_phone,
    p_rating,
    v_comment,
    true
  )
  RETURNING id INTO v_review_id;

  RETURN json_build_object('success', true, 'already_submitted', false, 'review_id', v_review_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_public_professional_review(text, uuid, integer, text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_public_professional_review(text, uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_public_platform_review(
  p_slug text,
  p_booking_id uuid,
  p_rating integer,
  p_comment text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
  v_review_id uuid;
  v_comment text := NULLIF(trim(coalesce(p_comment, '')), '');
BEGIN
  IF trim(coalesce(p_slug, '')) = '' OR p_booking_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'invalid_platform_review_request');
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RETURN json_build_object('success', false, 'error', 'invalid_rating');
  END IF;

  SELECT
    b.id AS booking_id,
    b.professional_id,
    b.client_name,
    b.client_phone,
    b.status AS booking_status
  INTO v_booking
  FROM public.professionals p
  JOIN public.bookings b
    ON b.professional_id = p.id
  WHERE p.slug = trim(p_slug)
    AND b.id = p_booking_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'booking_not_found');
  END IF;

  IF v_booking.booking_status NOT IN ('confirmed', 'completed') THEN
    RETURN json_build_object('success', false, 'error', 'platform_review_not_available_yet');
  END IF;

  SELECT pr.id
  INTO v_review_id
  FROM public.platform_reviews pr
  WHERE pr.booking_id = v_booking.booking_id
  LIMIT 1;

  IF v_review_id IS NOT NULL THEN
    RETURN json_build_object('success', true, 'already_submitted', true, 'review_id', v_review_id);
  END IF;

  INSERT INTO public.platform_reviews (
    professional_id,
    booking_id,
    client_name,
    client_phone,
    rating,
    comment
  ) VALUES (
    v_booking.professional_id,
    v_booking.booking_id,
    v_booking.client_name,
    v_booking.client_phone,
    p_rating,
    v_comment
  )
  RETURNING id INTO v_review_id;

  RETURN json_build_object('success', true, 'already_submitted', false, 'review_id', v_review_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_public_platform_review(text, uuid, integer, text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_public_platform_review(text, uuid, integer, text) TO authenticated;
