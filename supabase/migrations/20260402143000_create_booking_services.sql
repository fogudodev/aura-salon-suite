CREATE TABLE IF NOT EXISTS public.booking_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(booking_id, service_id)
);

ALTER TABLE public.booking_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage all booking services"
ON public.booking_services
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "Professionals manage own booking services"
ON public.booking_services
FOR ALL
USING (
  booking_id IN (
    SELECT id FROM public.bookings
    WHERE professional_id = get_my_professional_id()
  )
)
WITH CHECK (
  booking_id IN (
    SELECT id FROM public.bookings
    WHERE professional_id = get_my_professional_id()
  )
);

CREATE POLICY "Reception employees manage own salon booking services"
ON public.booking_services
FOR ALL
USING (
  booking_id IN (
    SELECT id FROM public.bookings
    WHERE professional_id = get_reception_salon_id()
  )
)
WITH CHECK (
  booking_id IN (
    SELECT id FROM public.bookings
    WHERE professional_id = get_reception_salon_id()
  )
);

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
