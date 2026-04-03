CREATE OR REPLACE FUNCTION public.create_public_booking_v2(
  p_professional_id uuid,
  p_service_ids uuid[],
  p_start_time timestamptz,
  p_client_name text,
  p_client_phone text,
  p_employee_id uuid DEFAULT NULL,
  p_requires_signal boolean DEFAULT false,
  p_signal_amount numeric DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_duration integer;
  v_total_price numeric(10,2);
  v_service_count integer;
  v_requested_count integer;
  v_end_time timestamptz;
  v_day_of_week integer;
  v_start_time_of_day time;
  v_end_time_of_day time;
  v_working record;
  v_conflict_count integer;
  v_blocked_count integer;
  v_booking_id uuid;
  v_client_id uuid;
  v_primary_service_id uuid;
  v_client_phone text := public.normalize_phone_digits(p_client_phone);
  v_tz text := 'America/Sao_Paulo';
  v_distinct_service_ids uuid[];
BEGIN
  v_distinct_service_ids := ARRAY(
    SELECT DISTINCT service_id
    FROM unnest(coalesce(p_service_ids, ARRAY[]::uuid[])) AS service_id
    WHERE service_id IS NOT NULL
  );

  v_requested_count := coalesce(array_length(v_distinct_service_ids, 1), 0);
  IF v_requested_count = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Selecione ao menos um serviço');
  END IF;

  v_primary_service_id := v_distinct_service_ids[1];

  IF trim(coalesce(p_client_name, '')) = '' OR v_client_phone = '' THEN
    RETURN json_build_object('success', false, 'error', 'Nome e telefone são obrigatórios');
  END IF;

  SELECT COUNT(*), COALESCE(SUM(price), 0), COALESCE(SUM(duration_minutes), 0)
  INTO v_service_count, v_total_price, v_total_duration
  FROM public.services
  WHERE professional_id = p_professional_id
    AND active = true
    AND id = ANY(v_distinct_service_ids);

  IF v_service_count <> v_requested_count THEN
    RETURN json_build_object('success', false, 'error', 'Serviço inválido ou indisponível');
  END IF;

  IF p_employee_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.salon_employees e
      WHERE e.id = p_employee_id
        AND e.salon_id = p_professional_id
        AND e.is_active = true
    ) THEN
      RETURN json_build_object('success', false, 'error', 'Profissional da equipe inválido');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.employee_services es
      WHERE es.employee_id = p_employee_id
    ) AND EXISTS (
      SELECT 1
      FROM unnest(v_distinct_service_ids) AS req(service_id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.employee_services es
        WHERE es.employee_id = p_employee_id
          AND es.service_id = req.service_id
      )
    ) THEN
      RETURN json_build_object('success', false, 'error', 'Um dos serviços não é atendido por esta profissional');
    END IF;
  END IF;

  v_end_time := p_start_time + (v_total_duration || ' minutes')::interval;
  v_day_of_week := EXTRACT(DOW FROM p_start_time AT TIME ZONE v_tz);
  v_start_time_of_day := (p_start_time AT TIME ZONE v_tz)::time;
  v_end_time_of_day := (v_end_time AT TIME ZONE v_tz)::time;

  IF p_employee_id IS NOT NULL THEN
    SELECT *
    INTO v_working
    FROM public.employee_working_hours
    WHERE employee_id = p_employee_id
      AND day_of_week = v_day_of_week
      AND is_active = true
    LIMIT 1;
  END IF;

  IF v_working IS NULL THEN
    SELECT *
    INTO v_working
    FROM public.working_hours
    WHERE professional_id = p_professional_id
      AND day_of_week = v_day_of_week
      AND is_active = true;
  END IF;

  IF v_working IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Não há expediente disponível neste dia');
  END IF;

  IF v_start_time_of_day < v_working.start_time OR v_end_time_of_day > v_working.end_time THEN
    RETURN json_build_object('success', false, 'error', 'Horário fora do expediente');
  END IF;

  SELECT COUNT(*)
  INTO v_conflict_count
  FROM public.bookings b
  WHERE b.status NOT IN ('cancelled')
    AND (
      CASE
        WHEN p_employee_id IS NOT NULL THEN b.employee_id = p_employee_id
        ELSE b.professional_id = p_professional_id AND b.employee_id IS NULL
      END
    )
    AND (p_start_time, v_end_time) OVERLAPS (b.start_time, b.end_time);

  IF v_conflict_count > 0 THEN
    RETURN json_build_object('success', false, 'error', 'Horário já ocupado');
  END IF;

  SELECT COUNT(*)
  INTO v_blocked_count
  FROM public.blocked_times bt
  WHERE bt.professional_id = p_professional_id
    AND (p_start_time, v_end_time) OVERLAPS (bt.start_time, bt.end_time);

  IF v_blocked_count > 0 THEN
    RETURN json_build_object('success', false, 'error', 'Horário bloqueado pelo profissional');
  END IF;

  SELECT id
  INTO v_client_id
  FROM public.clients
  WHERE professional_id = p_professional_id
    AND public.normalize_phone_digits(phone) = v_client_phone
  LIMIT 1;

  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (professional_id, name, phone)
    VALUES (p_professional_id, trim(p_client_name), v_client_phone)
    RETURNING id INTO v_client_id;
  ELSE
    UPDATE public.clients
    SET name = trim(p_client_name),
        phone = v_client_phone,
        updated_at = now()
    WHERE id = v_client_id;
  END IF;

  INSERT INTO public.bookings (
    professional_id,
    client_id,
    service_id,
    employee_id,
    start_time,
    end_time,
    status,
    price,
    duration_minutes,
    client_name,
    client_phone,
    signal_amount,
    signal_payment_expires_at
  ) VALUES (
    p_professional_id,
    v_client_id,
    v_primary_service_id,
    p_employee_id,
    p_start_time,
    v_end_time,
    CASE WHEN p_requires_signal THEN 'pending' ELSE 'confirmed' END,
    v_total_price,
    v_total_duration,
    trim(p_client_name),
    v_client_phone,
    CASE WHEN p_requires_signal THEN COALESCE(p_signal_amount, 0) ELSE 0 END,
    CASE WHEN p_requires_signal THEN now() + interval '5 minutes' ELSE NULL END
  )
  RETURNING id INTO v_booking_id;

  INSERT INTO public.booking_services (booking_id, service_id, sort_order)
  SELECT v_booking_id, service_id, ordinality - 1
  FROM unnest(v_distinct_service_ids) WITH ORDINALITY AS s(service_id, ordinality);

  RETURN json_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'price', v_total_price,
    'duration_minutes', v_total_duration,
    'end_time', v_end_time,
    'status', CASE WHEN p_requires_signal THEN 'pending' ELSE 'confirmed' END,
    'signal_amount', CASE WHEN p_requires_signal THEN COALESCE(p_signal_amount, 0) ELSE 0 END
  );
END;
$$;
