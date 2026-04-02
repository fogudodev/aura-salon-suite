-- Reinforce automatic cash entry creation when a booking is completed.
-- The rule now works for both INSERT and UPDATE paths and avoids duplicates.

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_transactions_unique_booking
ON public.cash_transactions (booking_id)
WHERE booking_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.auto_cash_entry_on_booking_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_open_register_id uuid;
  v_payment_method text;
BEGIN
  IF NEW.status <> 'completed' OR COALESCE(NEW.price, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Avoid duplicate launches for the same booking.
  IF EXISTS (
    SELECT 1
    FROM public.cash_transactions
    WHERE booking_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT id
  INTO v_open_register_id
  FROM public.cash_registers
  WHERE professional_id = NEW.professional_id
    AND status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  -- If there is no open register, do not create the entry.
  IF v_open_register_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.payment_method
  INTO v_payment_method
  FROM public.payments p
  WHERE p.booking_id = NEW.id
    AND p.status IN ('completed', 'succeeded')
  ORDER BY p.created_at DESC
  LIMIT 1;

  INSERT INTO public.cash_transactions (
    cash_register_id,
    professional_id,
    type,
    amount,
    payment_method,
    description,
    booking_id
  )
  VALUES (
    v_open_register_id,
    NEW.professional_id,
    'entry',
    NEW.price,
    COALESCE(v_payment_method, 'other'),
    'Agendamento concluido: ' || COALESCE(NEW.client_name, 'Cliente'),
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_cash_entry_on_booking_completed ON public.bookings;

CREATE TRIGGER auto_cash_entry_on_booking_completed
AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.auto_cash_entry_on_booking_completed();
