# DOMAIN OPERATIONS MAP

Mapa operacional por domínio do Aura Salon Suite / Gende.

Objetivo:

- acelerar análise de impacto
- facilitar manutenção por área funcional
- servir como referência rápida para mudanças futuras

## 1. Auth

### Objetivo

Garantir identidade, sessão, papéis e entrada correta nas áreas do sistema.

### Arquivos principais

- `src/hooks/useAuth.tsx`
- `src/components/auth/ProtectedRoute.tsx`
- `src/components/auth/AdminRoute.tsx`
- `src/pages/Auth.tsx`
- `src/integrations/supabase/client.ts`
- `supabase/migrations/20260314172052_80401e35-4ca6-4771-8edf-1582a58a698a.sql`
- `supabase/functions/admin-create-professional/index.ts`
- `supabase/functions/admin-impersonate/index.ts`
- `supabase/functions/create-reception-user/index.ts`

### Fluxo principal

1. Usuário autentica via Supabase Auth.
2. `handle_new_user` cria ou não um `professional`, dependendo do tipo de usuário.
3. `user_roles` define o papel efetivo.
4. Frontend resolve sessão em `useAuth`.
5. Guards de rota aplicam:
   - autenticação
   - perfil profissional
   - recepção
   - admin/support
   - bloqueio por plano

### Regras importantes

- `support` e `reception` não devem gerar tenant `professionals`.
- `professional` nasce com assinatura inicial.
- `admin` e `support` têm fluxos diferentes de navegação e permissão.
- impersonation é sensível e depende de validação explícita.

### Fontes de verdade

- Supabase Auth
- `user_roles`
- `professionals`
- RPCs `has_role`, `is_admin`, `is_support`

### Riscos

- acoplamento entre claims, RLS e guards de frontend
- funções admin com alto privilégio
- navegação errada quando há divergência entre role e perfil associado

## 2. Booking

### Objetivo

Gerenciar agenda pública e interna, disponibilidade, criação de clientes e reservas.

### Arquivos principais

- `src/pages/PublicBooking.tsx`
- `src/hooks/useBookings.tsx`
- `src/hooks/useServices.tsx`
- `src/hooks/useWorkingHours.tsx`
- `src/hooks/useBlockedTimes.tsx`
- `src/hooks/useSalonEmployees.tsx`
- `src/hooks/useEmployeeWorkingHours.tsx`
- `src/hooks/useEmployeeServices.tsx`
- `supabase/migrations/20260227033824_581a2da1-a17f-4a61-a82d-6d5e95da14ac.sql`
- `supabase/functions/google-calendar-sync/index.ts`
- `supabase/functions/waitlist-process/index.ts`

### Fluxo público

1. Usuário entra em `/:slug`.
2. Sistema resolve o profissional e carrega branding, serviços, equipe e pagamento.
3. A jornada pública atual é organizada em 5 etapas:
   - dia
   - profissional
   - serviços
   - horário
   - confirmação
4. Slots vêm da RPC `get_available_slots_v2`.
5. Reserva é criada pela RPC `create_public_booking_v2`.
6. Pós-processos:
   - atribuição de funcionário
   - sinal PIX
   - upsell
   - review
   - automação WhatsApp

### Fluxo interno

1. Profissional ou recepção usa `/bookings`.
2. Hooks carregam agenda diária, semanal e mensal.
3. Criação/edição/cancelamento atualizam React Query.
4. Cancelamento pode disparar waitlist.
5. Criação/cancelamento pode sincronizar Google Calendar.

### Regras importantes

- disponibilidade depende de:
  - serviço
  - expediente
  - bloqueios
  - bookings existentes
  - timezone São Paulo
- status do booking influencia:
  - comissão
  - lembretes
  - waitlist
  - calendário

### Fontes de verdade

- `bookings`
- `services`
- `clients`
- `working_hours`
- `blocked_times`
- `salon_employees`
- RPCs de disponibilidade e criação pública

### Riscos

- lógica concentrada em `PublicBooking.tsx`
- timezone crítico
- sobreposição entre lógica do frontend e RPCs
- mutações encadeadas após criação do booking

## 3. WhatsApp

### Objetivo

Operar comunicação automatizada, conversa transacional e ações de retenção/campanha via Evolution API.

### Arquivos principais

- `src/hooks/useWhatsApp.tsx`
- `src/pages/Automations.tsx`
- `src/pages/Campaigns.tsx`
- `src/pages/SupportChat.tsx`
- `src/pages/PaymentChat.tsx`
- `src/pages/Waitlist.tsx`
- `supabase/functions/whatsapp/index.ts`
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/send-reminders/index.ts`
- `supabase/functions/send-campaign/index.ts`
- `supabase/functions/reactivation-engine/index.ts`
- `supabase/functions/waitlist-process/index.ts`
- `supabase/functions/send-course-reminders/index.ts`

### Fluxo de instância

1. Tenant cria instância via edge function `whatsapp`.
2. Instância é salva em `whatsapp_instances`.
3. Webhook é configurado para `whatsapp-webhook`.
4. Status e QR code são atualizados.

### Fluxo de automação

1. Evento de negócio acontece:
   - booking criado
   - lembrete
   - pós-atendimento
   - review
   - manutenção
   - reativação
   - curso
2. Function localiza:
   - profissional
   - instância conectada
   - automação ativa
   - limites do plano
3. Mensagem é enviada via Evolution.
4. Resultado é persistido em `whatsapp_logs`.

### Fluxo conversacional

1. Webhook recebe mensagens externas.
2. Função resolve a instância e o tenant.
3. Contexto da conversa é carregado de `whatsapp_conversations`.
4. IA interpreta intenção e pode:
   - continuar conversa
   - sugerir slots
   - fechar booking
   - enviar follow-up

### Regras importantes

- status da instância precisa estar consistente
- mensagens usam templates com variáveis
- limites de plano impactam reminders e campaigns
- logs são obrigatórios para rastreabilidade

### Fontes de verdade

- `whatsapp_instances`
- `whatsapp_automations`
- `whatsapp_logs`
- `whatsapp_conversations`
- `daily_message_usage`
- `plan_limits`
- `professional_limits`

### Riscos

- alta criticidade operacional
- dependência externa da Evolution API
- edge functions grandes e sensíveis
- risco de autenticação mal aplicada por `verify_jwt = false`
- parsing e encoding já apresentaram problemas nessa área

## 4. Billing

### Objetivo

Controlar assinatura, liberação de funcionalidades, limites e compra de addons.

### Arquivos principais

- `src/lib/stripe-plans.ts`
- `src/hooks/useSubscription.tsx`
- `src/hooks/useFeatureAccess.tsx`
- `src/hooks/useProfessionalLimits.tsx`
- `src/hooks/useProfessionalFeatures.tsx`
- `src/pages/Pricing.tsx`
- `src/pages/Settings.tsx`
- `supabase/functions/create-checkout/index.ts`
- `supabase/functions/customer-portal/index.ts`
- `supabase/functions/purchase-addon/index.ts`
- `supabase/functions/check-subscription/index.ts`
- migrations de `plan_limits`, `professional_limits`, `feature_flags`, `professional_feature_overrides`

### Fluxo de assinatura principal

1. Frontend escolhe `priceId`.
2. `create-checkout` cria sessão Stripe.
3. Stripe conclui checkout.
4. Backend/sincronização atualiza `subscriptions`.
5. Frontend recalcula acesso por plano.

### Fluxo de addon

1. Usuário compra pacote extra.
2. `purchase-addon` cria checkout de pagamento único.
3. Após pagamento, a mesma function verifica sessão.
4. Créditos são aplicados em `professional_limits`.
5. Compra é registrada em `addon_purchases`.

### Regras importantes

- acesso final depende de várias camadas:
  - plano
  - assinatura atual
  - limites dinâmicos
  - feature flags globais
  - override individual
- o frontend contém uma matriz estática de recursos, mas o backend contém limites dinâmicos.

### Fontes de verdade

- `subscriptions`
- `plan_limits`
- `professional_limits`
- `feature_flags`
- `professional_feature_overrides`
- configuração estática em `stripe-plans.ts`

### Riscos

- duplicidade de regra entre frontend e banco
- drift entre Stripe e tabelas locais
- necessidade de conciliar plano comercial, flags e limites operacionais

## 5. Courses

### Objetivo

Operar o subproduto de cursos: catálogo, turmas, matrículas, presença, certificados e comunicação.

### Arquivos principais

- `src/pages/CourseDashboard.tsx`
- `src/pages/Courses.tsx`
- `src/pages/CourseClasses.tsx`
- `src/pages/CourseStudents.tsx`
- `src/pages/CourseFinance.tsx`
- `src/pages/CourseCertificates.tsx`
- `src/pages/CourseWaitlist.tsx`
- `src/pages/PublicCourses.tsx`
- `src/pages/StudentArea.tsx`
- `src/hooks/useCourses.tsx`
- `src/hooks/useCourseAutomations.tsx`
- `supabase/migrations/20260315213757_c352dea7-71fc-4fcd-83f7-4afa8f05129e.sql`
- `supabase/migrations/20260315215443_87394b5a-8100-46de-b72c-5614c4021889.sql`
- `supabase/migrations/20260315215513_6ad21527-8995-45d2-a829-93e77aa3386c.sql`
- `supabase/functions/send-course-reminders/index.ts`

### Fluxo operacional

1. Profissional cria categoria, curso e turma.
2. Curso ativo gera página pública em `/cursos/:slug`.
3. Aluno pode se matricular.
4. Se turma estiver cheia, pode ir para lista de espera.
5. Operação acompanha:
   - matrícula
   - pagamento
   - presença
   - certificado
6. WhatsApp pode enviar lembretes e mensagens de ciclo de curso.

### Regras importantes

- cursos têm subdomínio funcional próprio, mas compartilham tenant e infraestrutura do SaaS principal
- automações de curso usam o mesmo backbone de WhatsApp
- há política pública para leitura e inscrição em determinadas entidades

### Fontes de verdade

- `courses`
- `course_categories`
- `course_classes`
- `course_enrollments`
- `course_attendance`
- `course_certificates`
- `course_waitlist`
- `course_materials`

### Riscos

- módulo amplo dentro do mesmo app e bundle
- dependência de RLS correta para casos públicos
- acoplamento com automações e páginas públicas

## 6. Dependências cruzadas

### Auth cruza com

- guards de rota
- admin/support tooling
- onboarding
- RLS

### Booking cruza com

- WhatsApp
- Google Calendar
- waitlist
- comissão
- PIX/sinal
- reviews
- upsell

### WhatsApp cruza com

- booking
- campanha
- reativação
- waitlist
- suporte/pagamento
- cursos

### Billing cruza com

- sidebar e navegação
- recursos liberados
- limites operacionais
- automações
- addons

### Courses cruza com

- WhatsApp
- páginas públicas
- pagamentos
- waitlist

## 7. Ordem de investigação recomendada por incidente

### Problema de login/permissão

1. `useAuth`
2. role em `user_roles`
3. perfil em `professionals`
4. RPC `is_admin` / `is_support`
5. RLS

### Problema de booking público

1. `PublicBooking.tsx`
2. `professionals.slug`
3. RPC `get_available_slots_v2`
4. RPC `create_public_booking_v2`
5. `working_hours`, `blocked_times`, `bookings`

### Problema de WhatsApp

1. `whatsapp_instances`
2. function `whatsapp`
3. function `whatsapp-webhook`
4. Evolution API / webhook
5. `whatsapp_logs`

### Problema de plano/recurso bloqueado

1. `subscriptions`
2. `stripe-plans.ts`
3. `plan_limits`
4. `feature_flags`
5. `professional_feature_overrides`

### Problema em cursos

1. tabelas `course_*`
2. `useCourses`
3. páginas `Course*`
4. automações de curso

## 8. Regra prática para mudanças

Antes de editar qualquer área:

1. localizar o domínio principal
2. verificar dependências cruzadas acima
3. validar impacto em banco, functions e frontend
4. confirmar se precisa migration
5. registrar ordem de deploy se houver impacto backend
