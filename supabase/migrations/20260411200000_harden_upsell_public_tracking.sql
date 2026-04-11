-- Ensure feature flag exists in every environment.
INSERT INTO public.feature_flags (key, label, description, enabled, category)
VALUES (
  'upsell_inteligente',
  'Upsell Inteligente',
  'Sugestoes automáticas de servicos complementares com IA durante o agendamento',
  false,
  'automacao'
)
ON CONFLICT (key) DO NOTHING;

-- Public writes to upsell_events must happen only through controlled backend paths.
DROP POLICY IF EXISTS "Public can insert upsell events" ON public.upsell_events;
