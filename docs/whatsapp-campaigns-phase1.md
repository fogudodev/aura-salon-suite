# WhatsApp Campaigns Phase 1

## Escopo entregue
- novo domínio de campanhas inteligente separado do legado `campaigns`
- modelagem inicial de campanhas, recipients, templates, automations, events, daily metrics, suppressions, jobs e attributions
- Radar de Faturamento da Lis com oportunidades estruturadas, notificações internas via WhatsApp e tracking de interação
- Edge Function `whatsapp-campaigns` para bootstrap, CRUD de drafts, preview de audiência/mensagem, templates e ações da Lis
- frontend premium em `/campaigns` com:
  - dashboard e KPIs
  - Radar da Lis
  - biblioteca de mensagens
  - criador de campanha em etapas
  - listagem de drafts/campanhas

## Fluxo da Lis na Fase 1
1. `generate-opportunities` executa a heurística de oportunidades.
2. As oportunidades são salvas em `lis_campaign_opportunities`.
3. O sistema aplica dedupe por `dedupe_key`.
4. O sistema tenta notificar a profissional pelo WhatsApp conectado.
5. A profissional interage pelo app:
   - ver detalhes
   - ignorar
   - lembrar depois
   - gerar rascunho
6. Ao gerar rascunho, nasce uma `whatsapp_campaigns` com vínculo de origem.

## O que fica para a Fase 2
- execução real por fila/lotes
- materialização de `whatsapp_campaign_recipients` no start
- retries, rate limiting e backoff
- ingestão de `delivered/read/reply/click`
- detalhamento de recipients/events por campanha
- envio agendado/pausado/cancelado

## Extensibilidade
- o provider fica desacoplado em torno de `_shared/whatsapp.ts`
- a engine de oportunidade é heurística, mas pronta para IA generativa na camada de copy
- `source_opportunity_id` e `converted_campaign_id` já deixam a trilha completa para atribuição futura
