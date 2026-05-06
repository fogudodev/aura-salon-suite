# ARCHITECTURE BRIEFING

Documento de referência rápida da arquitetura real do Aura Salon Suite / Gende.

## 1. Identidade do sistema

- Produto: SaaS multi-tenant para salões de beleza e profissionais autônomos.
- Marca visível no código atual: `Gende`.
- Stack principal:
  - Frontend: React 18 + TypeScript + Vite
  - UI: Tailwind + shadcn/ui + Radix
  - Estado remoto: TanStack React Query
  - Backend: Supabase self-hosted em VPS
  - Edge Functions: Deno
  - Mensageria: Evolution API
  - Pagamentos: Stripe
  - Calendário: Google Calendar
  - IA: Gemini / gateway configurado nas functions

## 2. Infraestrutura real

- O backend não é Supabase Cloud. O projeto roda sobre Supabase self-hosted em VPS.
- O frontend é publicado separadamente como build estático.
- Nem toda a lógica de produção está garantidamente neste repositório.
- Mudanças manuais na VPS podem existir e devem ser consideradas em qualquer investigação.

## 3. Macroarquitetura

### Frontend

- Arquivo central de rotas: `src/App.tsx`
- Bootstrap da aplicação: `src/main.tsx`
- Cliente Supabase: `src/integrations/supabase/client.ts`
- Faixa principal de abstração de dados: hooks em `src/hooks/`
- Layout operacional: `src/components/layout/`

### Banco e domínio

- O banco é o núcleo da regra de negócio.
- O schema atual é refletido em `src/integrations/supabase/types.ts`.
- Regras críticas vivem em:
  - tabelas e RLS
  - funções SQL / RPC
  - triggers de onboarding, comissões, slug e automações

### Integrações server-side

- Edge functions concentram integrações externas e automações.
- Funções principais:
  - `whatsapp`
  - `whatsapp-webhook`
  - `send-reminders`
  - `send-campaign`
  - `waitlist-process`
  - `salon-ai-assistant`
  - `create-checkout`
  - `customer-portal`
  - `purchase-addon`
  - `google-calendar-*`
  - `instagram-*`

## 4. Modelo de tenancy e identidade

- Tenant principal: `professionals`
- Cada salão/profissional possui:
  - identidade própria
  - branding
  - assinatura
  - recursos e limites
  - slug público

### Papéis

- `professional`: dono do tenant
- `admin`: backoffice master
- `support`: suporte interno
- `reception`: recepção vinculada ao salão, sem `professionals` próprio

Papéis e permissões dependem de:

- `user_roles`
- RPCs como `has_role`, `is_admin`, `is_support`
- RLS no banco
- guards no frontend

## 5. Fluxos críticos

### Onboarding

Fluxo atual:

1. Usuário cria conta via Supabase Auth.
2. Trigger `handle_new_user` cria o registro em `professionals`, exceto para suporte e recepção.
3. O papel `professional` é criado em `user_roles`.
4. É criada uma assinatura inicial.
5. O slug público é gerado por trigger no banco.

Observação:

- O onboarding evoluiu ao longo das migrations.
- O estado atual relevante é trial Enterprise de 30 dias para novos signups.

### Booking público

Fluxo:

1. Página pública aberta por `/:slug`
2. `PublicBooking.tsx` resolve o profissional
3. A experiência atual é visualmente organizada em 5 etapas:
  - dia
  - profissional
  - serviços
  - horário
  - confirmação
4. Serviços, equipe, horários, payment config e avaliações são carregados
5. Slots são consultados via RPC `get_available_slots_v2`
6. Reserva é criada via RPC `create_public_booking_v2`
7. Pós-processos opcionais:
  - definição de funcionário
  - sinal PIX
  - upsell
  - avaliação

### Operação interna

Área autenticada cobre:

- agenda
- clientes
- serviços
- equipe
- financeiro
- produtos
- cupons
- WhatsApp
- relatórios
- rewards
- reativação
- upsell
- cursos

### WhatsApp

Fluxo principal:

1. Tenant cria ou conecta instância via Evolution API
2. Instância é persistida em `whatsapp_instances`
3. Automações ficam em `whatsapp_automations`
4. Logs ficam em `whatsapp_logs`
5. Webhooks chegam em `whatsapp-webhook`
6. Mensagens automáticas podem ser disparadas por:
  - agendamento criado
  - lembretes
  - pós-atendimento
  - review
  - manutenção
  - reativação
  - curso
  - waitlist

### Billing

- Assinaturas principais via Stripe Checkout + Portal
- Add-ons compráveis separadamente
- Limites misturam:
  - configuração estática frontend
  - tabelas `plan_limits`
  - `professional_limits`
  - `addon_purchases`

## 6. Módulos de negócio

### Agenda

Tabelas principais:

- `bookings`
- `services`
- `clients`
- `working_hours`
- `blocked_times`
- `salon_employees`
- `employee_working_hours`
- `employee_services`

### Financeiro

- `payments`
- `cash_registers`
- `cash_transactions`
- `expenses`
- `commissions`

### Comunicação

- `whatsapp_instances`
- `whatsapp_automations`
- `whatsapp_logs`
- `whatsapp_conversations`
- `campaigns`
- `campaign_contacts`
- chats internos de suporte/pagamento

### Growth / retenção

- `waitlist`
- `waitlist_offers`
- `waitlist_settings`
- `professional_feature_overrides`
- `feature_flags`
- `upsell_rules`
- `upsell_events`

### Fidelidade

- `loyalty_config`
- `loyalty_levels`
- `client_loyalty`
- `cashback_rules`
- `cashback_transactions`
- `client_referrals`
- `loyalty_challenges`

### Cursos

- `courses`
- `course_categories`
- `course_classes`
- `course_enrollments`
- `course_attendance`
- `course_certificates`
- `course_waitlist`
- `course_materials`

## 7. Frontend: forma atual

### Estrutura

- `pages/`: páginas e rotas
- `hooks/`: acesso a dados + mutações + lógica de tela
- `components/`: peças reutilizáveis
- `lib/`: utilitários e configuração

### Característica importante

- A lógica de domínio não está isolada em uma camada de serviço formal.
- Muito comportamento mora em:
  - hooks React Query
  - páginas extensas
  - chamadas diretas ao Supabase

Isso acelera entrega, mas aumenta acoplamento e custo de manutenção.

### Arquivos especialmente centrais

- `src/App.tsx`
- `src/pages/PublicBooking.tsx`
- `src/pages/Settings.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/hooks/useAuth.tsx`
- `src/hooks/useBookings.tsx`
- `src/hooks/useWhatsApp.tsx`
- `src/hooks/useFeatureAccess.tsx`
- `src/hooks/useMyFeatureGate.tsx`

## 8. Backend: forma atual

### Banco

- O banco define boa parte das invariantes do sistema.
- RPCs relevantes:
  - `create_public_booking_v2`
  - `get_available_slots_v2`
  - `get_public_payment_config`
  - `get_public_client_by_phone`
  - `get_public_review_context`
  - `has_role`
  - `is_admin`
  - `is_support`
  - `get_my_professional_id`
  - `get_reception_salon_id`

### Migrations

- São obrigatórias para qualquer mudança estrutural.
- O histórico mostra evolução contínua de:
  - onboarding
  - suporte/admin
  - limits/plans
  - feature flags
  - waitlist
  - loyalty
  - cursos
  - slug system

### Edge functions

- Muitas rodam com `verify_jwt = false`.
- Isso torna obrigatória a validação manual correta dentro de cada function.
- Sempre revisar auth e autorização antes de alterar endpoints.

## 9. Feature gating

O sistema usa camadas múltiplas de liberação:

1. Plano no frontend (`stripe-plans.ts`)
2. Assinatura atual (`subscriptions`)
3. Limites dinâmicos (`plan_limits`, `professional_limits`)
4. Feature flags globais (`feature_flags`)
5. Overrides por tenant (`professional_feature_overrides`)

Conclusão:

- O gating é híbrido e distribuído.
- Mudanças de feature precisam checar frontend, banco e automações.

## 10. Decisões arquiteturais implícitas

- Banco como centro da regra de negócio
- Frontend fino em camadas, mas espesso em páginas/hooks
- Integrações externas encapsuladas em edge functions
- RLS como proteção primária de acesso a dados
- Deploy em sequência obrigatória:
  - banco
  - functions
  - frontend

## 11. Riscos permanentes

### Técnicos

- Alto acoplamento entre páginas, hooks e schema
- Lógica crítica em arquivos muito grandes
- Duplicidade de fonte de verdade para planos e features
- Dependência forte de integrações externas
- Parte da realidade operacional pode estar fora do Git

### Operacionais

- Self-hosted Supabase em VPS
- Dependência de secrets e networking
- Possibilidade de drift entre banco real e repositório
- Functions expostas sem `verify_jwt`, dependendo de validação interna

### Qualidade

- Base com débito técnico visível de tipagem e lint
- Cobertura de testes ainda pequena para o tamanho do sistema
- Presença de textos com encoding corrompido em parte da base

## 12. Regras para futuras mudanças

- Nunca assumir comportamento de Supabase Cloud.
- Antes de editar, rastrear o fluxo completo ponta a ponta.
- Toda mudança estrutural de banco exige migration.
- Toda mudança de backend deve considerar ordem de deploy.
- Toda mudança em WhatsApp, Auth, billing ou automação deve ser tratada como alteração sensível.
- Se houver divergência entre documentação e código, validar o estado atual nas migrations e nos pontos de execução reais.

## 13. Estado atual de referência

Este briefing representa a leitura consolidada do repositório em `2026-03-31`, incluindo:

- documentação interna
- frontend principal
- schema tipado
- migrations
- edge functions
- scripts operacionais relevantes

Ele deve ser atualizado sempre que houver mudança arquitetural relevante.
