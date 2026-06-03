CREATE OR REPLACE FUNCTION public.reschedule_booking(
  p_booking_id uuid,
  p_new_start_time timestamptz
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_updated_booking public.bookings%ROWTYPE;
  v_my_professional_id uuid;
  v_reception_salon_id uuid;
  v_duration_minutes integer;
  v_new_end_time timestamptz;
  v_start_local timestamp;
  v_end_local timestamp;
  v_working record;
  v_conflict_count integer;
  v_blocked_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sessao expirada. Entre novamente.');
  END IF;

  IF p_booking_id IS NULL OR p_new_start_time IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Agendamento e novo horario sao obrigatorios.');
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Agendamento nao encontrado.');
  END IF;

  v_my_professional_id := public.get_my_professional_id();
  v_reception_salon_id := public.get_reception_salon_id();

  IF NOT COALESCE(public.is_admin(), false)
    AND NOT (v_my_professional_id IS NOT NULL AND v_booking.professional_id = v_my_professional_id)
    AND NOT (v_reception_salon_id IS NOT NULL AND v_booking.professional_id = v_reception_salon_id)
  THEN
    RETURN json_build_object('success', false, 'error', 'Voce nao tem permissao para remarcar este agendamento.');
  END IF;

  IF v_booking.status NOT IN ('pending', 'confirmed', 'no_show') THEN
    RETURN json_build_object('success', false, 'error', 'Este status nao permite remarcacao.');
  END IF;

  v_duration_minutes := COALESCE(
    NULLIF(v_booking.duration_minutes, 0),
    ROUND(EXTRACT(EPOCH FROM (v_booking.end_time - v_booking.start_time)) / 60)::integer
  );

  IF v_duration_minutes IS NULL OR v_duration_minutes <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Nao foi possivel calcular a duracao do agendamento.');
  END IF;

  v_new_end_time := p_new_start_time + make_interval(mins => v_duration_minutes);
  v_start_local := p_new_start_time AT TIME ZONE 'America/Sao_Paulo';
  v_end_local := v_new_end_time AT TIME ZONE 'America/Sao_Paulo';

  IF v_start_local::date <> v_end_local::date THEN
    RETURN json_build_object('success', false, 'error', 'O novo horario precisa terminar no mesmo dia.');
  END IF;

  SELECT *
  INTO v_working
  FROM public.working_hours
  WHERE professional_id = v_booking.professional_id
    AND day_of_week = EXTRACT(DOW FROM v_start_local)::integer
    AND is_active = true
  LIMIT 1;

  IF v_working IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Nao ha expediente configurado para esta data.');
  END IF;

  IF v_start_local::time < v_working.start_time OR v_end_local::time > v_working.end_time THEN
    RETURN json_build_object('success', false, 'error', 'O novo horario fica fora do expediente configurado.');
  END IF;

  SELECT COUNT(*)
  INTO v_blocked_count
  FROM public.blocked_times
  WHERE professional_id = v_booking.professional_id
    AND tstzrange(start_time, end_time, '[)') && tstzrange(p_new_start_time, v_new_end_time, '[)');

  IF v_blocked_count > 0 THEN
    RETURN json_build_object('success', false, 'error', 'Este horario esta bloqueado por uma ausencia.');
  END IF;

  SELECT COUNT(*)
  INTO v_conflict_count
  FROM public.bookings
  WHERE id <> v_booking.id
    AND professional_id = v_booking.professional_id
    AND status <> 'cancelled'
    AND (v_booking.employee_id IS NULL OR employee_id = v_booking.employee_id)
    AND tstzrange(start_time, end_time + interval '10 minutes', '[)') && tstzrange(p_new_start_time, v_new_end_time, '[)');

  IF v_conflict_count > 0 THEN
    RETURN json_build_object('success', false, 'error', 'Ja existe outro agendamento neste horario.');
  END IF;

  UPDATE public.bookings
  SET
    start_time = p_new_start_time,
    end_time = v_new_end_time,
    status = CASE
      WHEN status = 'no_show' THEN 'confirmed'::booking_status
      ELSE status
    END
  WHERE id = v_booking.id
  RETURNING * INTO v_updated_booking;

  RETURN json_build_object(
    'success', true,
    'booking', row_to_json(v_updated_booking)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_booking(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_booking(uuid, timestamptz) TO authenticated;
