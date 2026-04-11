# Mapa Completo do Projeto

Baseado no código revisado em `2026-04-10`.

## 1. Visão geral

O projeto é uma plataforma SaaS para salões, estúdios de beleza e profissionais autônomos, com quatro camadas principais:

- app autenticado para profissionais e recepção
- experiência pública de agendamento e cursos
- backoffice admin/suporte
- backend Supabase com tabelas, RPCs, automações e Edge Functions

Arquivos centrais da arquitetura:

- rotas do app: `src/App.tsx`
- navegação profissional: `src/components/layout/Sidebar.tsx`
- navegação admin: `src/components/layout/AdminLayout.tsx`
- feature gating: `src/lib/feature-gates.ts`
- gating por profissional: `src/hooks/useMyFeatureGate.tsx`
- taxonomia interna de funcionalidades: `src/lib/guide-data.ts`

## 2. Áreas do produto

### 2.1 Marketing e aquisição

Rotas públicas:

- `/landing` -> landing page
- `/pricing` -> página de preços
- `/features` -> vitrine de funcionalidades
- `/features/:slug` -> detalhe de funcionalidade
- `/support` -> suporte comercial/institucional
- `/politica-de-privacidade`
- `/termos-de-uso`

Funções associadas:

- apresentação comercial do produto
- detalhamento de recursos por feature
- exposição do funil de aquisição
- CTA para assinatura e uso da plataforma

### 2.2 App autenticado do profissional

Rotas protegidas principais:

- `/` -> dashboard
- `/bookings` -> agenda e agendamentos
- `/services` -> catálogo de serviços
- `/clients` -> CRM de clientes
- `/automations` -> automações WhatsApp
- `/finance` -> visão financeira
- `/settings` -> configurações
- `/reports` -> relatórios
- `/public-page` -> configuração da página pública
- `/team` -> equipe
- `/products` -> produtos e estoque
- `/coupons` -> cupons
- `/reviews` -> avaliações
- `/commission-report` -> comissões
- `/team-performance` -> desempenho da equipe
- `/campaigns` -> campanhas
- `/payment-chat` -> chat de pagamento
- `/support-chat` -> chat de suporte
- `/ai-assistant` -> assistente IA
- `/cash-register` -> caixa
- `/waitlist` -> lista de espera
- `/service-packages` -> pacotes de serviços
- `/instructions` -> central de ajuda
- `/upsell` -> dashboard de upsell
- `/upsell/config` -> configuração de upsell
- `/instagram-automation` -> automação de Instagram DM
- `/rewards` -> fidelidade
- `/reactivation` -> reativação inteligente

### 2.3 Módulo de cursos

Rotas protegidas:

- `/courses` -> dashboard do módulo
- `/courses/list` -> cursos
- `/courses/classes` -> turmas
- `/courses/students` -> alunos
- `/courses/certificates` -> certificados
- `/courses/finance` -> financeiro de cursos
- `/courses/waitlist` -> lista de espera de cursos

Experiência pública ligada ao módulo:

- `/cursos/:slug` -> catálogo/inscrição pública
- `/area-do-aluno` -> área do aluno

### 2.4 Área admin e suporte interno

Rotas admin:

- `/admin`
- `/admin/users`
- `/admin/plans`
- `/admin/subscribers`
- `/admin/integrations`
- `/admin/features`
- `/admin/bookings`
- `/admin/whatsapp`
- `/admin/whatsapp-logs`
- `/admin/plan-limits`
- `/admin/professional-limits`
- `/admin/message-usage`
- `/admin/logs`
- `/admin/support-chat`
- `/admin/payment-chat`
- `/admin/platform-reviews`
- `/admin/feature-flags`

## 3. Mapa funcional por domínio

Esta seção descreve as funcionalidades de produto identificadas no frontend, hooks, tabelas e Edge Functions.

### 3.1 Dashboard e visão geral

Arquivos centrais:

- `src/pages/Index.tsx`
- `src/components/dashboard/*`
- `src/hooks/useDashboardStats.tsx`

Capacidades:

- resumo de faturamento
- agenda do dia
- visão de jornada do cliente
- gráficos de receita e despesas
- visão mobile do dia
- atalhos para operação

### 3.2 Agenda e agendamentos

Arquivos centrais:

- `src/pages/Bookings.tsx`
- `src/hooks/useBookings.tsx`
- `src/hooks/useBlockedTimes.tsx`
- `src/hooks/useBookingNotifications.tsx`
- `src/hooks/useWorkingHours.tsx`

Capacidades:

- agenda por dia, semana e mês
- criação, edição, cancelamento e conclusão de agendamentos
- bloqueio manual de horários
- cálculo de disponibilidade
- seleção de serviços e composição de duração/preço
- uso de equipe/funcionário em salões
- integração com Google Calendar
- atualização de status operacional
- disparo de automações pós-status

Backend associado:

- `public.get_available_slots`
- `public.get_available_slots_v2`
- `public.create_public_booking`
- `public.create_public_booking_v2`
- `public.auto_mark_no_show`

### 3.3 Clientes

Arquivos centrais:

- `src/pages/Clients.tsx`
- `src/hooks/useClients.tsx`

Capacidades:

- cadastro manual de clientes
- edição e exclusão
- histórico associado a agendamentos
- base para campanhas, reativação, reviews e fidelidade

### 3.4 Serviços

Arquivos centrais:

- `src/pages/Services.tsx`
- `src/hooks/useServices.tsx`
- `src/lib/service-icons.ts`

Capacidades:

- catálogo de serviços
- preço, duração, descrição e categoria
- ordenação e ativação
- ícones por serviço
- favoritos na página pública
- atribuição de serviços a funcionários

Tabelas associadas:

- `services`
- `employee_services`
- `booking_services`
- `client_service_favorites`

### 3.5 Equipe e operação de salão

Arquivos centrais:

- `src/pages/Team.tsx`
- `src/hooks/useSalonEmployees.tsx`
- `src/hooks/useEmployeeServices.tsx`
- `src/hooks/useEmployeeWorkingHours.tsx`
- `src/hooks/useReceptionEmployee.tsx`
- `src/components/team/EmployeeWorkingHours.tsx`

Capacidades:

- cadastro de profissionais da equipe
- horários individuais
- serviços por profissional
- contas de recepção com login
- papéis internos de operação
- desempenho individual
- comissões

RPCs e funções associadas:

- `public.get_reception_salon_id`
- Edge Function `create-reception-user`
- Edge Function `sync-employee-billing`

### 3.6 Financeiro

Arquivos centrais:

- `src/pages/Finance.tsx`
- `src/hooks/useExpenses.tsx`
- `src/hooks/usePayments.tsx`
- `src/hooks/useCommissions.tsx`

Capacidades:

- receitas por agendamento
- despesas
- lucro operacional
- pagamentos
- configuração de sinal
- comissões da equipe
- sincronismo com finalização de agendamentos

Tabelas principais:

- `payments`
- `expenses`
- `commissions`
- `payment_config`

Automatismos:

- `public.auto_create_commission_on_completed`
- `public.auto_cash_entry_on_booking_completed`

### 3.7 Caixa

Arquivos centrais:

- `src/pages/CashRegister.tsx`
- `src/hooks/useCashRegister.tsx`
- `src/components/cash-register/CashRegisterReport.tsx`

Capacidades:

- abertura e fechamento de caixa
- entradas e saídas manuais
- conferência por período
- consolidação operacional para recepção/salão

Tabelas principais:

- `cash_registers`
- `cash_transactions`

### 3.8 Página pública e agendamento online

Arquivos centrais:

- `src/pages/PublicPage.tsx`
- `src/pages/PublicBooking.tsx`
- `src/components/public-booking/*`
- `src/lib/public-page-theme.ts`

Capacidades:

- página pública com identidade visual do profissional
- slug público do negócio
- serviços, equipe, horários e preferências públicas
- agendamento público com múltiplos serviços
- cobrança de sinal
- confirmação posterior de reserva
- favoritos de serviços por cliente
- busca pública de cliente por telefone
- coleta de avaliação do profissional
- coleta de avaliação da plataforma

RPCs públicas:

- `public.get_public_payment_config`
- `public.get_public_client_by_phone`
- `public.get_public_client_service_favorites`
- `public.toggle_public_service_favorite`
- `public.mark_public_signal_payment_sent`
- `public.confirm_public_signal_booking`
- `public.get_public_review_context`
- `public.submit_public_professional_review`
- `public.submit_public_platform_review`

### 3.9 WhatsApp

Arquivos centrais:

- `src/pages/Automations.tsx`
- `src/hooks/useWhatsApp.tsx`
- `src/components/automations/ConversationsList.tsx`
- `supabase/functions/whatsapp/index.ts`
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/send-reminders/index.ts`
- `supabase/functions/conversation-timeout/index.ts`
- `supabase/functions/_shared/whatsapp.ts`

Capacidades:

- conexão de instância WhatsApp
- QR code e status da instância
- webhook inbound
- envio manual e automático de mensagens
- confirmações, lembretes, follow-up e review request
- campanhas WhatsApp
- conversas persistidas
- timeout de conversas
- atendimento automatizado com IA
- fallback de provedores para envio
- logs detalhados de eventos WhatsApp

Dados principais:

- `whatsapp_instances`
- `whatsapp_automations`
- `whatsapp_logs`
- `whatsapp_conversations`
- `whatsapp_event_logs`
- `daily_message_usage`

### 3.10 Campanhas

Arquivos centrais:

- `src/pages/Campaigns.tsx`
- `src/hooks/useCampaigns.tsx`
- `supabase/functions/send-campaign/index.ts`

Capacidades:

- criação de campanhas
- segmentação de contatos
- disparo em massa via WhatsApp
- limites diários
- compra de pacotes extras
- rastreamento de uso por campanha e contatos

Tabelas:

- `campaigns`
- `campaign_contacts`
- `daily_message_usage`
- `addon_purchases`
- `professional_limits`

### 3.11 Chats internos

Arquivos centrais:

- `src/pages/SupportChat.tsx`
- `src/pages/PaymentChat.tsx`
- `src/hooks/useUnreadMessages.tsx`
- `src/hooks/useChatNotifications.tsx`

Capacidades:

- chat suporte cliente <-> operação interna
- chat de pagamento
- mensagens em tempo real
- upload de anexos/imagens
- contadores de não lidas

Tabela:

- `chat_messages`

### 3.12 IA e recursos inteligentes

Arquivos centrais:

- `src/pages/AIAssistant.tsx`
- `supabase/functions/salon-ai-assistant/index.ts`
- `supabase/functions/_shared/ai-router.ts`
- `supabase/functions/_shared/ai-providers/*`

Capacidades:

- assistente IA para análise do negócio
- roteamento multi-provider de IA
- uso de OpenAI, Groq e Gemini na camada de providers
- IA em WhatsApp inbound
- IA aplicada a sugestões de upsell

Observação:

- Gemini ainda existe como provider do roteador de IA, mas não é mais o caminho direto de transcrição do webhook WhatsApp.

### 3.13 Avaliações

Arquivos centrais:

- `src/pages/Reviews.tsx`
- `src/hooks/useReviews.tsx`
- `src/pages/PublicBooking.tsx`
- `supabase/functions/_shared/reviews.ts`

Capacidades:

- avaliação do profissional após serviço concluído
- pedido de review por WhatsApp com estrelas e comentário
- tela pública de submissão de review
- avaliação da plataforma ao final do booking público
- gestão de reviews no painel
- visualização admin das avaliações da plataforma

Tabelas:

- `reviews`
- `platform_reviews`

### 3.14 Cupons

Arquivos centrais:

- `src/pages/Coupons.tsx`
- `src/hooks/useCoupons.tsx`

Capacidades:

- criação e manutenção de cupons
- desconto percentual ou valor fixo
- datas de validade e limites

Tabela:

- `coupons`

### 3.15 Produtos e estoque

Arquivos centrais:

- `src/pages/Products.tsx`
- `src/hooks/useProducts.tsx`

Capacidades:

- cadastro de produtos
- controle de estoque
- custo e preço de venda
- base para financeiro/operação

Tabela:

- `products`

### 3.16 Pacotes de serviços

Arquivos centrais:

- `src/pages/ServicePackages.tsx`
- `src/hooks/useServicePackages.tsx`

Capacidades:

- venda de pacotes com múltiplas sessões
- controle de sessões usadas/restantes
- vínculo de pacotes a clientes

Tabelas:

- `service_packages`
- `client_packages`

### 3.17 Lista de espera

Arquivos centrais:

- `src/pages/Waitlist.tsx`
- `src/hooks/useWaitlist.tsx`
- `src/hooks/useWaitlistOffers.tsx`
- `src/hooks/useWaitlistSettings.tsx`
- `supabase/functions/waitlist-process/index.ts`

Capacidades:

- cadastro de intenção de vaga
- priorização
- preferência de serviço/data/período
- oferta automática quando há cancelamento
- reserva temporária da vaga
- fallback para clientes elegíveis por histórico

Tabelas:

- `waitlist`
- `waitlist_offers`
- `waitlist_settings`

### 3.18 Upsell inteligente

Arquivos centrais:

- `src/pages/UpsellDashboard.tsx`
- `src/pages/UpsellConfig.tsx`
- `src/hooks/useUpsell.tsx`
- `src/components/upsell/UpsellSuggestions.tsx`
- `supabase/functions/upsell-suggest/index.ts`
- `supabase/functions/upsell-execute/index.ts`

Capacidades:

- cadastro de regras de upsell
- sugestão de serviços complementares
- disparo via WhatsApp
- acompanhamento de conversão
- métricas do módulo

Tabelas:

- `upsell_rules`
- `upsell_events`
- `upsell_recipients`

### 3.19 Reativação inteligente

Arquivos centrais:

- `src/pages/Reactivation.tsx`
- `src/hooks/useReactivation.tsx`
- `supabase/functions/reactivation-engine/index.ts`

Capacidades:

- cálculo de clientes elegíveis/inativos
- campanhas de reativação
- scoring RFM
- controle de conversão de campanhas

Tabelas:

- `reactivation_campaigns`
- `reactivation_campaign_recipients`
- `reactivation_events`

### 3.20 Instagram DM inteligente

Arquivos centrais:

- `src/pages/InstagramAutomation.tsx`
- `src/hooks/useInstagram.tsx`
- `supabase/functions/instagram-oauth/index.ts`
- `supabase/functions/instagram-webhook/index.ts`

Capacidades:

- conexão OAuth com conta Meta
- leitura de DMs
- palavras-chave
- auto reply
- auto reply em comentários
- persistência das mensagens recebidas

Tabelas:

- `instagram_accounts`
- `instagram_messages`
- `instagram_keywords`

### 3.21 Gende Rewards / fidelidade

Arquivos centrais:

- `src/pages/Rewards.tsx`
- `src/hooks/useRewards.tsx`

Capacidades:

- configuração de cashback
- níveis de fidelidade
- progresso dos clientes
- indicações
- desafios

Tabelas:

- `loyalty_config`
- `cashback_rules`
- `client_cashback`
- `cashback_transactions`
- `loyalty_levels`
- `client_loyalty`
- `client_referrals`
- `loyalty_challenges`
- `challenge_progress`

### 3.22 Cursos

Arquivos centrais:

- `src/pages/CourseDashboard.tsx`
- `src/pages/Courses.tsx`
- `src/pages/CourseClasses.tsx`
- `src/pages/CourseStudents.tsx`
- `src/pages/CourseCertificates.tsx`
- `src/pages/CourseFinance.tsx`
- `src/pages/CourseWaitlist.tsx`
- `src/pages/PublicCourses.tsx`
- `src/pages/StudentArea.tsx`
- `src/hooks/useCourses.tsx`
- `src/hooks/useCourseAutomations.tsx`
- `supabase/functions/send-course-reminders/index.ts`

Capacidades:

- catálogo de cursos
- categorias
- turmas
- matrícula pública
- lista de espera
- certificados
- materiais
- área do aluno
- lembretes e mensagens automáticas de curso

Tabelas:

- `course_categories`
- `courses`
- `course_classes`
- `course_enrollments`
- `course_attendance`
- `course_certificates`
- `course_waitlist`
- `course_materials`

RPC:

- `public.enroll_student_in_class`

## 4. Feature flags e gating

O projeto possui dois níveis de gating:

- flags globais em `feature_flags`
- overrides por profissional em `professional_feature_overrides`

Arquivos centrais:

- `src/hooks/useFeatureFlags.tsx`
- `src/hooks/useProfessionalFeatures.tsx`
- `src/hooks/useMyFeatureGate.tsx`
- `src/lib/feature-gates.ts`

Flags mapeadas no código atual:

- `dashboard`
- `bookings`
- `services`
- `clients`
- `waitlist`
- `team`
- `commission_report`
- `team_performance`
- `automations`
- `campaigns`
- `payment_chat`
- `support_chat`
- `ai_assistant`
- `finance`
- `cash_register`
- `public_page`
- `products`
- `service_packages`
- `coupons`
- `reports`
- `reviews`
- `settings`
- `upsell_inteligente`
- `instagram_dm`
- `gende_rewards`
- `courses`
- `reactivation_engine`

Flags adicionais registradas no backend/dump e que representam capacidade futura ou parcial:

- `employee_individual_hours`
- `employee_working_hours`
- `nfse_integration`
- `recurring_bookings`
- `profitability_reports`
- `export_pdf_excel`
- `mobile_dashboard`
- `payment_settings`
- `smart_followup`
- `instagram-automation`

Observação importante:

- existe referência a `google_calendar` em `src/lib/feature-gates.ts` e `src/lib/stripe-plans.ts`, mas essa chave não aparece no dump de feature flags revisado. Isso parece uma inconsistência de catálogo.

## 5. Hooks do frontend por responsabilidade

### Núcleo do negócio

- `useAuth`
- `useProfessional`
- `useSubscription`
- `useFeatureAccess`
- `useFeatureFlags`
- `useMyFeatureGate`
- `useProfessionalLimits`

### Agenda e operação

- `useBookings`
- `useBlockedTimes`
- `useWorkingHours`
- `useEmployeeServices`
- `useEmployeeWorkingHours`
- `useSalonEmployees`
- `useReceptionEmployee`
- `useBookingNotifications`

### CRM e catálogo

- `useClients`
- `useServices`
- `useProducts`
- `useCoupons`
- `useServicePackages`
- `useReviews`

### Financeiro

- `usePayments`
- `useExpenses`
- `useCommissions`
- `usePaymentConfig`
- `useCashRegister`

### Growth e automação

- `useWhatsApp`
- `useCampaigns`
- `useUpsell`
- `useWaitlist`
- `useWaitlistOffers`
- `useWaitlistSettings`
- `useReactivation`
- `useRewards`
- `useInstagram`
- `useCourseAutomations`
- `useCourses`

### Comunicação em tempo real

- `useRealtime`
- `useUnreadMessages`
- `useChatNotifications`
- `useNotificationSound`

### UI e utilitários

- `use-mobile`
- `use-toast`

## 6. Edge Functions por domínio

### 6.1 Administração, usuários e suporte interno

- `admin-create-professional` -> cria profissional ou usuário de suporte
- `admin-delete-user` -> exclusão profunda de usuário bloqueado e dados relacionados
- `admin-impersonate` -> impersonação por magic link
- `admin-remove-support-role` -> remove papel de suporte
- `create-reception-user` -> cria login de recepção vinculado a `salon_employees`
- `notify-signup` -> notifica novo cadastro para número admin via WhatsApp

### 6.2 Billing, assinatura e add-ons

- `create-checkout` -> checkout de assinatura Stripe
- `check-subscription` -> valida assinatura/plano atual
- `customer-portal` -> abre portal de cobrança Stripe
- `purchase-addon` -> checkout e crédito de add-ons
- `sync-employee-billing` -> ajusta cobrança por profissionais extras

### 6.3 Google Calendar

- `google-calendar-auth` -> URL OAuth, status e desconexão
- `google-calendar-callback` -> callback OAuth e persistência de tokens
- `google-calendar-sync` -> importar eventos, criar evento e deletar evento

### 6.4 Instagram

- `instagram-oauth` -> OAuth e conexão da conta Meta/Instagram
- `instagram-webhook` -> recebimento de mensagens/eventos do Instagram
- `instagram-callback` -> callback de frontend para finalizar a conexão

### 6.5 WhatsApp e comunicação com clientes

- `whatsapp` -> gestão de instância, QR code, status, envio de mensagem, gatilhos e notificações
- `whatsapp-webhook` -> entrada de mensagens, transcrição de áudio, IA e booking via conversa
- `send-reminders` -> lembretes, confirmações, manutenção, follow-up e review request
- `send-course-reminders` -> automações da jornada do aluno
- `send-campaign` -> criação/disparo de campanhas e leitura de limites
- `conversation-timeout` -> encerra conversas inativas

### 6.6 IA, reativação, upsell e waitlist

- `salon-ai-assistant` -> análise do negócio e respostas da IA
- `upsell-suggest` -> sugere serviços complementares
- `upsell-execute` -> executa regras, mede conversão e expõe métricas
- `reactivation-engine` -> scoring, elegíveis, métricas, execução e checagem de conversão
- `waitlist-process` -> processa cancelamentos e ofertas de lista de espera

### 6.7 Infraestrutura geral

- `main` -> função base de verificação híbrida JWT

## 7. Modelo de dados por domínio

### Identidade e perfis

- `professionals`
- `user_roles`
- `subscriptions`
- `professional_limits`
- `plan_limits`
- `professional_feature_overrides`
- `feature_flags`
- `addon_purchases`

### Agenda e operação

- `services`
- `bookings`
- `booking_services`
- `clients`
- `working_hours`
- `employee_working_hours`
- `blocked_times`
- `salon_employees`
- `employee_services`
- `client_service_favorites`

### Comunicação

- `whatsapp_instances`
- `whatsapp_automations`
- `whatsapp_logs`
- `whatsapp_conversations`
- `whatsapp_event_logs`
- `chat_messages`
- `instagram_accounts`
- `instagram_messages`
- `instagram_keywords`

### Financeiro

- `payments`
- `payment_config`
- `expenses`
- `commissions`
- `cash_registers`
- `cash_transactions`
- `daily_message_usage`

### Marketing e retenção

- `campaigns`
- `campaign_contacts`
- `reviews`
- `platform_reviews`
- `waitlist`
- `waitlist_settings`
- `waitlist_offers`
- `upsell_rules`
- `upsell_events`
- `upsell_recipients`
- `reactivation_campaigns`
- `reactivation_campaign_recipients`
- `reactivation_events`

### Fidelidade

- `loyalty_config`
- `cashback_rules`
- `client_cashback`
- `cashback_transactions`
- `loyalty_levels`
- `client_loyalty`
- `client_referrals`
- `loyalty_challenges`
- `challenge_progress`

### Cursos

- `course_categories`
- `courses`
- `course_classes`
- `course_enrollments`
- `course_attendance`
- `course_certificates`
- `course_waitlist`
- `course_materials`

### Integrações

- `google_calendar_tokens`
- `admin_auth_codes`
- `ai_provider_settings`
- `ai_provider_circuit_breakers`

## 8. RPCs e automações de banco mais relevantes

### RPCs de operação e booking

- `get_available_slots`
- `create_public_booking`
- `get_available_slots_v2`
- `create_public_booking_v2`
- `get_public_payment_config`
- `mark_public_signal_payment_sent`
- `confirm_public_signal_booking`
- `get_public_client_by_phone`
- `get_public_client_service_favorites`
- `toggle_public_service_favorite`

### RPCs de review

- `get_public_review_context`
- `submit_public_professional_review`
- `submit_public_platform_review`

### RPCs de cursos e suporte

- `enroll_student_in_class`
- `get_support_users`
- `get_reception_salon_id`

### Funções auxiliares/infra

- `normalize_phone_digits`
- `slugify`
- `generate_unique_professional_slug`
- `set_professional_slug`
- `generate_course_slug`
- `get_my_professional_id`
- `has_role`
- `is_admin`
- `is_support`
- `update_updated_at_column`

### Automações de banco

- `auto_create_commission_on_completed`
- `auto_cash_entry_on_booking_completed`
- `auto_mark_no_show`
- múltiplas versões de `handle_new_user` ao longo das migrations

## 9. Experiências públicas mapeadas

### Booking público

- descoberta por slug
- favoritos de serviços
- seleção de múltiplos serviços
- seleção de profissional
- sinal/PIX
- confirmação final
- avaliação da plataforma no fim do fluxo
- avaliação do profissional por link de review

### Cursos públicos

- catálogo de cursos por profissional
- inscrição em turma
- área do aluno com materiais e certificados

## 10. Arquivos legados ou não expostos diretamente por rota

Arquivos encontrados mas não ligados hoje à navegação principal:

- `src/pages/Admin.tsx`
- `src/pages/PaymentSettings.tsx`

Observação:

- `PaymentSettings` está substituído por redirect de rota para `/settings`.
- `Admin.tsx` parece ser uma versão anterior do painel administrativo.

## 11. Conclusão operacional

Hoje o projeto já é mais do que um sistema de agenda. O código mostra uma plataforma modular com:

- operação do salão
- CRM
- automação via WhatsApp
- IA
- público de agendamento
- billing via Stripe
- fidelização
- reativação
- upsell
- cursos
- integrações externas
- área admin e suporte interno

Se você quiser, o próximo passo útil é eu transformar este mapa em uma matriz ainda mais prática com:

- funcionalidade
- rota
- tabela
- hook
- Edge Function
- feature flag
- status atual

Isso vira praticamente um inventário de produto e engenharia.
