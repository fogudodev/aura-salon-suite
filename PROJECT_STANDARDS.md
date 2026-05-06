# AURA SALON SUITE - Documentação Oficial

> **Nota**: Este documento consolida todas as diretrizes, regras de negócio e procedimentos do projeto. Todo desenvolvimento deve seguir este padrão.

---

## 1. Visão Geral do Projeto

### Descrição
Plataforma SaaS multi-tenant para gerenciamento de salões de beleza e profissionais autônomos, com agendamento público via URL personalizada, automação de WhatsApp, programa de fidelidade e módulo educacional.

### Tecnologias

| Camada | Tecnologia |
|--------|------------|
| **Frontend** | React 18 + TypeScript + Vite |
| **UI** | Radix UI + TailwindCSS + shadcn/ui |
| **Estado/Dados** | TanStack React Query + React Hook Form |
| **Backend** | Supabase (PostgreSQL + Edge Functions Deno) |
| **Mensagens** | Evolution API (WhatsApp) |
| **Pagamentos** | Stripe |
| **Calendar** | Google Calendar API |

---

## 2. Infraestrutura

```
┌─────────────────────────────────────────────────────────────┐
│                    VPS HOSTINGER (Backend)                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              SUPABASE (Self-Hosted)                  │   │
│  │  • PostgreSQL (banco de dados)                      │   │
│  │  • Edge Functions (Deno)                            │   │
│  │  • Storage                                         │   │
│  │  • Auth                                           │   │
│  │  • API: https://api.gende.io                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ API calls
                            │
┌─────────────────────────────────────────────────────────────┐
│           HOSPEDAGEM COMPARTILHADA HOSTINGER                │
│  • Frontend estático (build npm)                           │
│  • Domínio: https://gende.io                               │
│  • Deploy: npm run build → FileZilla → /public_html        │
└─────────────────────────────────────────────────────────────┘
```

### URLs de Produção
| Ambiente | URL |
|----------|-----|
| **Frontend** | https://gende.io |
| **API Backend** | https://api.gende.io |
| **Project ID** | xvuhgwpndytlobujtekg |

---

## 3. Estrutura do Projeto

```
aura-salon-suite/
├── src/                          # Frontend React
│   ├── pages/                    # 75+ páginas (rotas)
│   ├── hooks/                    # 40+ hooks React Query
│   ├── components/               # Componentes reutilizáveis
│   ├── lib/                     # Utilitários e configurações
│   ├── integrations/supabase/   # Cliente e tipos do Supabase
│   └── test/                    # Testes (Vitest)
│
├── supabase/                     # Backend
│   ├── migrations/               # 50+ migrações SQL
│   ├── functions/                # 22 Edge Functions (Deno)
│   ├── config.toml              # Configuração das funções
│   └── dump.sql                # Dump completo do banco
│
├── package.json                 # Dependências frontend
└── .env                        # Variáveis de ambiente
```

---

## 4. Arquitetura de Dados

### Tabelas Principais (70+ tabelas)

**Núcleo Multi-tenant:**
- `professionals` - Conta de cada salão/professional (slug único público)
- `user_roles` - Papéis (admin, professional, user, support, receptionist)
- `subscriptions` - Planos e limites por profissional

**Agendamento:**
- `bookings` - Agendamentos
- `services` - Serviços oferecidos
- `clients` - Clientes
- `salon_employees` - Funcionários
- `working_hours` / `blocked_times` - Horários de trabalho
- `employee_working_hours` - Horários por funcionário

**Automação & Marketing:**
- `whatsapp_instances` - Instâncias WhatsApp
- `whatsapp_automations` - Automações (triggers)
- `whatsapp_logs` - Logs de mensagens
- `campaigns` / `campaign_contacts` - Campanhas em massa
- `waitlist` - Lista de espera

**Financeiro:**
- `payments` - Pagamentos
- `cash_registers` / `cash_transactions` - Caixa
- `commissions` - Comissões de funcionários
- `expenses` - Despesas

**Fidelidade & Rewards:**
- `loyalty_config` - Config do programa
- `loyalty_levels` - Níveis (bronze, prata, ouro)
- `client_loyalty` - Pontuação por cliente
- `cashback_rules` / `cashback_transactions` - Cashback
- `client_referrals` - Indicações

**Educacional (Courses):**
- `courses` - Cursos
- `course_classes` - Turmas
- `course_enrollments` - Matrículas
- `course_attendance` - Presença
- `course_certificates` - Certificados

---

## 5. Regras de Negócio

### 5.1 Geração Automática de Slug

- **Trigger**: `before_insert_set_slug` (BEFORE INSERT on `professionals`)
- **Fonte**: `business_name`, fallback para `name`
- **Normalização**:
  - Minúsculas
  - Sem acentos (via `unaccent`)
  - Espaços → `-`
  - Limite de 50 caracteres
- **Duplicatas**: `-1`, `-2`, etc.
- **Concorrência**: Advisory locks para prevenir race conditions

### 5.2 Roles e Acessos

| Role | Acesso |
|------|---------|
| **Professional** | Agenda, serviços, clientes, WhatsApp |
| **Receptionist** | Agenda e clientes (sem registro próprio em `professionals`) |
| **Support** | Suporte interno Aura |
| **Admin** | Painel master completo |

### 5.3 Automações WhatsApp

- **Triggers Padrão**: `booking_created`, `reminder_24h`, `reminder_3h`, `post_service`, `reactivation_30d`
- **Status**: Some active, others need configuration

### 5.4 Comissões

- **Trigger**: `auto_create_commission_on_completed` (AFTER UPDATE on `bookings`)
- **Condição**: status = 'completed' + employee_id presente
- **Cálculo**: `price * commission_percentage / 100`

---

## 6. Fluxos Principais

### 6.1 Signup de Novo Profissional
```
Usuário → Frontend Auth → Supabase Auth → Trigger handle_new_user() 
→ Cria professionals → Cria user_roles → Cria subscriptions (free)
→ Trigger before_insert_set_slug → Gera slug único
```

### 6.2 Criação Admin (via UI)
```
Admin UI → Edge Function admin-create-professional 
→ Supabase Auth Admin → Trigger handle_new_user()
```

### 6.3 Agendamento Público
```
URL /:slug → PublicBooking.tsx → Busca profissional por slug 
→ Renderiza página pública → Usuário seleciona serviço/horário 
→ RPC create_public_booking → Cria cliente + booking
```

---

## 7. Diretrizes de Desenvolvimento

### Regras Obrigatórias

1. **Nunca assumir Supabase Cloud** - Sistema usa Supabase self-hosted na VPS
2. **Mapear dependências antes de refatorar** - Rastrear auth, webhooks, realtime
3. **Respeitar regras de negócio existentes** - Não quebrar lógicas de agendamento
4. **Análise de impacto** - Identificar se afeta frontend, edge functions, banco, VPS ou APIs externas
5. **Consistência > Best Practices** - Preferir padrões existentes do repo
6. **Derivar de código existente** - Quando incerto, seguir padrões do projeto
7. **Sempre criar migração** - Toda mudança de DB deve ter arquivo em `supabase/migrations/`

### Checklist de Desenvolvimento

- [ ] Analisar impacto (frontend//backend/VPS/API)
- [ ] Verificar se precisa de migração
- [ ] Se precisa, criar migração em `supabase/migrations/`
- [ ] Implementar código (frontend/edge function)
- [ ] Testar localmente
- [ ] Documentar ordem de deploy

### Checklist de Backend

- [ ] Verificar se migração foi necessária e criada
- [ ] Garantir ordem de deploy documentada (DB → Funções → Frontend)
- [ ] Validar riscos de produção (VPS + Self-hosted Supabase)

---

## 8. Procedimentos de Deploy

### Ordem de Deploy (Importante!)

1. **Banco de Dados** - Primeiro aplicar migrações
2. **Edge Functions** - Deploy das funções que usam o novo schema
3. **Frontend** - Por último, após API estável

### Comandos

```bash
# Banco de Dados
supabase db push

# Edge Functions
supabase functions deploy [nome-da-funcao]
supabase functions deploy  # Deploy todas

# Frontend
npm run build
# Compactar pasta dist/ → FileZilla → /public_html
```

### Variáveis de Ambiente (se necessário)
```bash
supabase secrets set VAR_NAME=VALUE
```

### Rollback

| Camada | Ação |
|--------|------|
| **Banco** | Criar migração reversa ou restaurar backup |
| **Função** | Redeploy do commit anterior |
| **Frontend** | Restaurar build anterior (manter 2-3 arquivados) |

---

## 9. Edge Functions (22 funções)

| Função | Descrição |
|--------|------------|
| `whatsapp` | API WhatsApp (Evolution API) |
| `whatsapp-webhook` | Webhook de mensagens WhatsApp |
| `main` | API principal híbrida |
| `send-reminders` | Envio de lembretes automáticos |
| `send-campaign` | Envio de campanhas em massa |
| `upsell-suggest` | Sugestões de upsell |
| `upsell-execute` | Execução de upsell |
| `reactivation-engine` | Reativação de clientes inativos |
| `waitlist-process` | Processamento de lista de espera |
| `instagram-oauth` | Login Instagram |
| `instagram-webhook` | Webhook Instagram |
| `google-calendar-auth` | Autenticação Google Calendar |
| `google-calendar-callback` | Callback OAuth |
| `google-calendar-sync` | Sincronização de eventos |
| `create-checkout` | Stripe checkout |
| `customer-portal` | Portal do cliente Stripe |
| `salon-ai-assistant` | Assistente IA |
| `admin-create-professional` | Criar profissional via admin |
| `admin-impersonate` | Simular usuário (suporte) |
| `sync-employee-billing` | Sincronizar cobrança de funcionários |
| `send-course-reminders` | Lembretes de cursos |

**Configuração**: Todas com `verify_jwt = false` (verificação manual interna)

---

## 10. Frontend - Estrutura de Rotas

### Rotas Protegidas (Professional)
```
/                     → Dashboard
/bookings            → Agenda
/services            → Serviços
/clients             → Clientes
/automations         → WhatsApp
/finance             → Financeiro
/settings            → Configurações
/reports             → Relatórios
/public-page         → Página pública
/team                → Equipe
/products            → Produtos
/coupons             → Cupons
/reviews             → Avaliações
/commission-report   → Relatório comissões
/team-performance     → Performance equipe
/campaigns           → Campanhas
/payment-chat        → Chat pagamentos
/support-chat        → Chat suporte
/ai-assistant        → Assistente IA
/cash-register       → Caixa
/waitlist            → Lista de espera
/service-packages    → Pacotes de serviços
/instructions        → Instruções
/upsell              → Dashboard Upsell
/upsell/config       → Config Upsell
/rewards             → Programa fidelidade
/reactivation        → Reativação
/instagram-automation→ Instagram
/courses/*           → Módulo educacional (8 rotas)
```

### Rotas Admin Master
```
/admin                    → Dashboard
/admin/users             → Usuários
/admin/plans             → Planos
/admin/subscribers       → Assinantes
/admin/integrations      → Integrações
/admin/features          → Features
/admin/bookings          → Agendamentos
/admin/whatsapp          → WhatsApp Admin
/admin/whatsapp-logs     → Logs WhatsApp
/admin/plan-limits       → Limites por plano
/admin/professional-limits→ Limites profissional
/admin/message-usage    → Uso de mensagens
/admin/logs             → Logs do sistema
/admin/support-chat     → Chat suporte
/admin/payment-chat     → Chat pagamentos
/admin/platform-reviews → Avaliações plataforma
/admin/feature-flags    → Feature Flags
```

### Rotas Públicas
```
/auth                → Login/Cadastro
/landing             → Landing page
/:slug               → Página pública de booking
/cursos/:slug        → Cursos públicos
/area-do-aluno       → Área do aluno
/politica-de-privacidade → Política privacidade
/termos-de-uso       → Termos de uso
/guia                → Guia do sistema
/instagram-callback  → Callback Instagram
```

---

## 11. Hooks Principais (40+)

- `useAuth` - Autenticação e sessão
- `useProfessional` - Dados do profissional logado
- `useSubscription` - Plano e limites
- `useFeatureAccess` - Verificação de features por plano
- `useBookings`, `useCreateBooking`, `useUpdateBooking` - Agendamentos
- `useClients`, `useCreateClient` - Clientes
- `useServices`, `useCreateService` - Serviços
- `useWhatsApp` - Instância e automações
- `useCampaigns`, `useSendCampaign` - Campanhas
- `useUpsell` - Engine de upsell
- `useReactivation` - Reativação de clientes
- `useWaitlist` - Lista de espera
- `useRewards` - Programa fidelidade
- `useCourses` - Cursos
- `useCommissions` - Comissões
- `useCashRegister` - Caixa
- `useExpenses` - Despesas
- `usePaymentConfig` - Config de pagamentos
- `useReports` - Relatórios

---

## 12. Padrões de Código

### Frontend
- **Componentes**: shadcn/ui + TailwindCSS
- **Estado**: React Query para dados remotos, useState para locais
- **Formulários**: React Hook Form + Zod
- **Tipagem**: Types completos das tabelas do banco

### Backend (Edge Functions)
- **Linguagem**: Deno (TypeScript)
- **Formato**: `export default` com `serve()`
- **Headers CORS**: Padrão definido
- **Autenticação**: Manual via JWT (não rely no verify_jwt do config.toml)

### Banco de Dados
- **Migrations**: Arquivos SQL em `supabase/migrations/`
- **Triggers**: Funções PL/pgSQL com `SECURITY DEFINER`
- **RLS**: Row Level Security em todas as tabelas
- **updated_at**: Triggers automáticos em todas as tabelas

---

## 13. Testes

- **Framework**: Vitest
- **Localização**: `src/test/`
- **Setup**: `src/test/setup.ts`

---

## 14. Variáveis de Ambiente

```env
VITE_SUPABASE_PROJECT_ID=xvuhgwpndytlobujtekg
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
VITE_SUPABASE_URL=https://api.gende.io
```

---

## 15. Contato e Suporte

- **Domínio Produção**: https://gende.io
- **API Backend**: https://api.gende.io

---

*Última atualização: 31/03/2026*