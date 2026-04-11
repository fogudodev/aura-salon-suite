# WhatsApp Campaigns + Lis Radar: Go Live

## 1) Setup inicial

### 1.1 Runtime config de campanhas
Tabela: `public.whatsapp_campaign_runtime_config` (registro `id=1`)

- `is_active`: ativa o tick automatico do worker
- `worker_url`: URL da edge function `whatsapp-campaign-worker`
- `worker_secret`: segredo enviado no header `x-campaign-worker-secret`
- `batch_size`: tamanho do lote por ciclo
- `max_batches`: limite de lotes por execucao
- `tick_interval_seconds`: intervalo minimo entre ticks

### 1.2 Runtime config de automacoes
Tabela: `public.whatsapp_campaign_automation_runtime_config` (registro `id=1`)

- `is_active`: ativa o tick automatico das automacoes
- `worker_url`: URL da edge function `whatsapp-campaign-automation-worker`
- `worker_secret`: segredo enviado no header `x-campaign-automation-worker-secret`
- `max_automations`: maximo de automacoes por rodada
- `run_batch_size`: batch do dispatcher de envio apos automacao
- `tick_interval_minutes`: intervalo minimo entre disparos

### 1.3 Secrets de edge functions

- `WHATSAPP_CAMPAIGN_WORKER_SECRET`
- `WHATSAPP_CAMPAIGN_AUTOMATION_WORKER_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Importante:
- nunca expor segredo no frontend
- secrets devem ficar apenas no ambiente de edge function e runtime SQL

### 1.4 Flags operacionais

- `whatsapp_campaign_runtime_config.is_active=true` para envio automatico
- `whatsapp_campaign_automation_runtime_config.is_active=true` para automacoes periodicas
- opcional para QA interno: `WHATSAPP_CAMPAIGN_E2E_SEED_ENABLED=true`

## 2) Scheduler (cron)

Jobs esperados no `pg_cron`:

- `whatsapp-campaign-worker-tick` (`* * * * *`) chama `dispatch_whatsapp_campaign_worker_tick()`
- `whatsapp-campaign-automation-worker-tick` (`* * * * *`) chama `dispatch_whatsapp_campaign_automation_tick()`

Como validar:

1. Conferir em `cron.job` se os jobs existem.
2. Conferir `last_dispatch_at` e `last_dispatch_result_json` nas tabelas runtime.
3. Conferir filas:
   - `whatsapp_campaign_dispatch_jobs`
   - `whatsapp_campaign_automation_runs`
   - `whatsapp_campaign_automation_run_logs`

Como debugar:

- verificar `status`, `attempt_count`, `last_error`, `available_at`, `locked_at` nos jobs
- verificar logs das edge functions `whatsapp-campaign-worker` e `whatsapp-campaign-automation-worker`

## 3) Webhook de eventos

Eventos esperados no dominio de campanha:

- `sent`
- `delivered`
- `read`
- `reply`
- `failed`
- `opt_out`
- `click` (via `whatsapp-campaign-click`)

Validacao:

1. evento deve entrar em `whatsapp_campaign_events`
2. recipient deve atualizar em `whatsapp_campaign_recipients`
3. agregados devem atualizar em `whatsapp_campaign_metrics_daily`

Teste rapido:

1. enviar campanha de teste
2. simular callback do provedor para `sent/delivered/read/failed`
3. validar contador e status no dashboard

## 4) Automacoes

Como ativar:

1. configurar automacao no modulo
2. marcar `is_active=true`
3. garantir runtime config de automacoes ativo

Como validar:

1. conferir nova linha em `whatsapp_campaign_automation_runs`
2. conferir passos em `whatsapp_campaign_automation_run_logs`
3. confirmar se houve criacao de campanha draft/scheduled/processing

Interpretacao de resultado:

- `completed`: automacao gerou campanha
- `skipped`: sem publico elegivel ou cooldown
- `failed`: erro de regra, dados ou execucao

## 5) Radar de Faturamento da Lis

Geracao:

- engine analisa dados e grava em `lis_campaign_opportunities`

Ciclo operacional:

`detectar -> notificar no WhatsApp da profissional -> acao (gerar/ignorar/lembrar) -> campanha`

Acao da profissional:

- `Gerar campanha`: cria draft vinculado a oportunidade
- `Ver detalhes`: registra visualizacao
- `Ignorar`: marca dismissed
- `Lembrar depois`: aplica snooze

## 6) Casos especiais

### 6.1 Estado `uncertain`

Quando envio nao consegue confirmar status com seguranca:

- job pode ficar para reconciliacao por idempotencia
- revisar `whatsapp_logs` por `idempotency_key`
- reconciliar recipient antes de novo envio manual

### 6.2 Falhas de envio

- checar `last_error` em `whatsapp_campaign_dispatch_jobs`
- checar `failure_reason` em `whatsapp_campaign_recipients`
- checar eventos `failed` em `whatsapp_campaign_events`

### 6.3 Throttling

- eventos `throttled` aparecem em `whatsapp_campaign_events`
- revisar limites por janela e lotes do worker
- ajustar `batch_size`, `max_batches` e politicas de envio

## 7) Troubleshooting

### Campanha nao enviou

- campanha em `draft/scheduled`? iniciar envio
- existem recipients? validar `whatsapp_campaign_recipients`
- existem jobs pendentes? validar `whatsapp_campaign_dispatch_jobs`
- worker ativo e autorizado?

### Webhook nao chegou

- validar URL e token no provedor
- confirmar parse do evento no webhook
- verificar logs da function de webhook

### Metricas nao atualizaram

- confirmar criacao de evento em `whatsapp_campaign_events`
- confirmar update de recipient
- confirmar upsert em `whatsapp_campaign_metrics_daily`

### Automacao nao rodou

- `is_active` da automacao ligado?
- runtime de automacao ativo?
- cooldown bloqueando?
- conferir `whatsapp_campaign_automation_run_logs`

## 8) Roteiro E2E (preparacao)

Fluxo completo de validacao:

1. criar campanha
2. gerar recipients
3. iniciar envio
4. worker processar lote
5. webhook retornar eventos
6. metricas atualizar no dashboard
7. validar funil `sent -> delivered -> read -> reply/click -> booked`

### Helper opcional de seed

Action da edge function `whatsapp-campaigns`:

- `action: "seed-e2e-scenario"`

Protecao:

- so funciona com `WHATSAPP_CAMPAIGN_E2E_SEED_ENABLED=true`

Uso:

```json
{
  "action": "seed-e2e-scenario",
  "recipientsCount": 5
}
```

Retorno:

- `campaignId`
- `recipientsCount`
- `jobsCount`

## 9) Go-live checklist

- [ ] runtime config de campanhas preenchido
- [ ] runtime config de automacoes preenchido
- [ ] `is_active=true` nas duas runtime configs
- [ ] worker de campanhas acessivel e autenticado
- [ ] worker de automacoes acessivel e autenticado
- [ ] cron ativo para campanhas
- [ ] cron ativo para automacoes
- [ ] webhook de status funcionando (`sent/delivered/read/failed/reply`)
- [ ] click tracking funcionando (`whatsapp-campaign-click`)
- [ ] campanha real de teste enviada com sucesso
- [ ] metricas atualizando no dashboard
- [ ] automacoes criando runs/logs corretamente
- [ ] oportunidades da Lis sendo geradas e acionaveis
- [ ] logs operacionais sem erro critico recorrente
