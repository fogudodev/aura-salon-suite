ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS icon_key text;

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS signal_amount numeric(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS signal_payment_expires_at timestamptz,
ADD COLUMN IF NOT EXISTS signal_whatsapp_sent_at timestamptz,
ADD COLUMN IF NOT EXISTS signal_paid_at timestamptz,
ADD COLUMN IF NOT EXISTS signal_check_reminder_sent_at timestamptz;

CREATE TABLE IF NOT EXISTS public.booking_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, service_id)
);

ALTER TABLE public.booking_services ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_services'
      AND policyname = 'Admin can manage all booking services'
  ) THEN
    CREATE POLICY "Admin can manage all booking services"
    ON public.booking_services
    FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_services'
      AND policyname = 'Professionals manage own booking services'
  ) THEN
    CREATE POLICY "Professionals manage own booking services"
    ON public.booking_services
    FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.id = booking_services.booking_id
          AND b.professional_id = public.get_my_professional_id()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.id = booking_services.booking_id
          AND b.professional_id = public.get_my_professional_id()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_services'
      AND policyname = 'Reception employees manage own salon booking services'
  ) THEN
    CREATE POLICY "Reception employees manage own salon booking services"
    ON public.booking_services
    FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.id = booking_services.booking_id
          AND b.professional_id = public.get_reception_salon_id()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.id = booking_services.booking_id
          AND b.professional_id = public.get_reception_salon_id()
      )
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_booking_services_booking_id ON public.booking_services(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_services_service_id ON public.booking_services(service_id);
CREATE INDEX IF NOT EXISTS idx_services_icon_key ON public.services(icon_key);

INSERT INTO public.booking_services (booking_id, service_id, sort_order)
SELECT b.id, b.service_id, 0
FROM public.bookings b
WHERE b.service_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.booking_services bs
    WHERE bs.booking_id = b.id
      AND bs.service_id = b.service_id
  );

CREATE TABLE IF NOT EXISTS public.client_service_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  client_name text,
  client_phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, service_id, client_phone)
);

ALTER TABLE public.client_service_favorites ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_service_favorites'
      AND policyname = 'Professionals view own service favorites'
  ) THEN
    CREATE POLICY "Professionals view own service favorites"
    ON public.client_service_favorites
    FOR SELECT
    USING (professional_id = public.get_my_professional_id());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_service_favorites'
      AND policyname = 'Professionals manage own service favorites'
  ) THEN
    CREATE POLICY "Professionals manage own service favorites"
    ON public.client_service_favorites
    FOR ALL
    USING (professional_id = public.get_my_professional_id())
    WITH CHECK (professional_id = public.get_my_professional_id());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_service_favorites_lookup
ON public.client_service_favorites(professional_id, client_phone);

CREATE OR REPLACE FUNCTION public.normalize_phone_digits(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
$$;

CREATE OR REPLACE FUNCTION public.get_public_client_service_favorites(
  p_professional_id uuid,
  p_client_phone text
)
RETURNS TABLE(service_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.service_id
  FROM public.client_service_favorites f
  WHERE f.professional_id = p_professional_id
    AND f.client_phone = public.normalize_phone_digits(p_client_phone);
$$;

GRANT EXECUTE ON FUNCTION public.get_public_client_service_favorites(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_client_service_favorites(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.toggle_public_service_favorite(
  p_professional_id uuid,
  p_client_name text,
  p_client_phone text,
  p_service_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text := public.normalize_phone_digits(p_client_phone);
  v_exists boolean;
BEGIN
  IF v_phone = '' THEN
    RETURN json_build_object('success', false, 'error', 'Telefone inválido');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.services s
    WHERE s.id = p_service_id
      AND s.professional_id = p_professional_id
      AND s.active = true
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Serviço inválido');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.client_service_favorites f
    WHERE f.professional_id = p_professional_id
      AND f.service_id = p_service_id
      AND f.client_phone = v_phone
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.client_service_favorites
    WHERE professional_id = p_professional_id
      AND service_id = p_service_id
      AND client_phone = v_phone;

    RETURN json_build_object('success', true, 'favorited', false);
  END IF;

  INSERT INTO public.client_service_favorites (
    professional_id,
    service_id,
    client_name,
    client_phone
  ) VALUES (
    p_professional_id,
    p_service_id,
    nullif(trim(coalesce(p_client_name, '')), ''),
    v_phone
  );

  RETURN json_build_object('success', true, 'favorited', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_public_service_favorite(uuid, text, text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.toggle_public_service_favorite(uuid, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_available_slots_v2(
  p_professional_id uuid,
  p_service_ids uuid[],
  p_date date,
  p_employee_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_duration integer;
  v_service_count integer;
  v_requested_count integer;
  v_working record;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_day_of_week integer;
  v_conflict_count integer;
  v_blocked_count integer;
  v_slots json[];
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

  SELECT COUNT(*), COALESCE(SUM(duration_minutes), 0)
  INTO v_service_count, v_total_duration
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

  v_day_of_week := EXTRACT(DOW FROM p_date);

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
    RETURN json_build_object('success', true, 'slots', '[]'::json);
  END IF;

  v_slot_start := (p_date || ' ' || v_working.start_time)::timestamp AT TIME ZONE v_tz;
  v_slots := ARRAY[]::json[];

  WHILE (v_slot_start + (v_total_duration || ' minutes')::interval) <= ((p_date || ' ' || v_working.end_time)::timestamp AT TIME ZONE v_tz) LOOP
    v_slot_end := v_slot_start + (v_total_duration || ' minutes')::interval;

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
      AND (v_slot_start, v_slot_end) OVERLAPS (b.start_time, b.end_time);

    SELECT COUNT(*)
    INTO v_blocked_count
    FROM public.blocked_times bt
    WHERE bt.professional_id = p_professional_id
      AND (v_slot_start, v_slot_end) OVERLAPS (bt.start_time, bt.end_time);

    IF v_conflict_count = 0 AND v_blocked_count = 0 THEN
      v_slots := array_append(v_slots, json_build_object('start_time', v_slot_start, 'end_time', v_slot_end));
    END IF;

    v_slot_start := v_slot_start + interval '30 minutes';
  END LOOP;

  RETURN json_build_object('success', true, 'slots', array_to_json(v_slots));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_slots_v2(uuid, uuid[], date, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_available_slots_v2(uuid, uuid[], date, uuid) TO authenticated;

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

  IF trim(coalesce(p_client_name, '')) = '' OR v_client_phone = '' THEN
    RETURN json_build_object('success', false, 'error', 'Nome e telefone são obrigatórios');
  END IF;

  SELECT COUNT(*), COALESCE(SUM(price), 0), COALESCE(SUM(duration_minutes), 0), MIN(id)
  INTO v_service_count, v_total_price, v_total_duration, v_primary_service_id
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

GRANT EXECUTE ON FUNCTION public.create_public_booking_v2(uuid, uuid[], timestamptz, text, text, uuid, boolean, numeric) TO anon;
GRANT EXECUTE ON FUNCTION public.create_public_booking_v2(uuid, uuid[], timestamptz, text, text, uuid, boolean, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_public_signal_payment_sent(
  p_booking_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bookings
  SET signal_whatsapp_sent_at = now(),
      signal_paid_at = now(),
      updated_at = now()
  WHERE id = p_booking_id
    AND status IN ('pending', 'confirmed');

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_public_signal_payment_sent(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.mark_public_signal_payment_sent(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_public_signal_booking(
  p_booking_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
BEGIN
  SELECT id, status, signal_payment_expires_at
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id;

  IF v_booking IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Agendamento não encontrado');
  END IF;

  IF v_booking.status = 'cancelled' THEN
    RETURN json_build_object('success', false, 'error', 'Agendamento cancelado');
  END IF;

  IF v_booking.signal_payment_expires_at IS NOT NULL AND now() > (v_booking.signal_payment_expires_at + interval '2 minutes') THEN
    RETURN json_build_object('success', false, 'error', 'Prazo do sinal expirado');
  END IF;

  UPDATE public.bookings
  SET status = 'confirmed',
      updated_at = now()
  WHERE id = p_booking_id;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_public_signal_booking(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.confirm_public_signal_booking(uuid) TO authenticated;
