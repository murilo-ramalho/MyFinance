# 03 — Modelo conceitual de dados

A proposta abaixo define **entidades e relacionamentos**, não o SQL definitivo. Migrações concretas só devem ser criadas após os testes do primeiro caso de uso; preservar campos e invariantes relevantes.

## Entidades principais

| Entidade | Campos-chave (resumo) | Observação |
|---|---|---|
| `local_profile` | id, username, created_at | Um perfil local na v1; credencial **não** em texto puro |
| `account` | id, type, name, currency, opening_balance_minor, opening_on, liquidity | Banco, físico, corretora, cartão-passivo; diferenças de semântica |
| `envelope` | id, name, protection_policy, target_minor | Reserva lógica, não saldo financeiro novo |
| `envelope_allocation` | id, envelope_id, account_id, amount_minor, occurred_on | Vincula dinheiro de conta a finalidade; não altera caixa |
| `record` | id, kind, title, occurred_on, source, status, created_at, updated_at | Fato/compromisso/intenção de negócio, sem misturar liquidação |
| `record_revision` | id, record_id, changed_at, change_kind, before_json, after_json | Auditoria local de correção/anulação; dados seguem criptografados |
| `record_line` | id, record_id, item_id?, quantity_decimal, unit, unit_price_minor, total_minor | Itens com soma fechando o total |
| `obligation` | id, record_id, creditor_type, amount_minor, due_on, status | Parcelas, fatura, contas a pagar/receber |
| `settlement` | id, obligation_id?, record_id?, account_id, amount_minor, settled_on | Pagamento/recebimento efetivo; parcial/estorno explícito |
| `transfer` | id, from_account_id, to_account_id, amount_minor, occurred_on | Operação atômica com duas pernas |
| `category` | id, name, parent_id? | Categorias hierárquicas opcionais |
| `project` | id, name, status, target | Setores/objetivos separados de conta |
| `record_allocation` | id, record_id, category_id?, project_id?, amount_minor | Soma deve fechar o valor alocável |
| `budget` | id, category_id?, project_id?, month, planned_minor, revision | Planejado não altera caixa |
| `recurrence_rule` | id, kind, anchor, cadence, params_json, policy, effective_from, version | Calendário, intervalo, pós-execução, por uso |
| `recurrence_execution` | id, rule_id, expected_on, occurred_on?, status, generated_record_id? | Mantém previsto, executado e atraso separados |
| `forecast_baseline` | id, recorded_at, horizon, assumptions_json, digest | Snapshot da previsão original/revisada, sem duplicar lançamentos |
| `forecast_link` | id, forecast_key, record_id?, obligation_id?, rule_id? | Conciliação 1:1 ou explicitamente mapeada |
| `inventory_item` | id, name, base_unit, sku? | Produtos/itens reutilizáveis |
| `stock_movement` | id, item_id, quantity_decimal, unit, type, occurred_on, record_line_id? | Entrada, uso, perda, ajuste; não gera pagamento sozinho |
| `asset` | id, name, asset_type, quotation_currency | Ação/ferramenta/outros bens com métricas diferentes |
| `asset_event` | id, asset_id, kind, quantity_decimal?, money_minor?, occurred_on | Aporte, compra, venda, dividendo, reavaliação |
| `custom_field_definition` | id, template_id, type, constraints_json, order, visible | Só metadados permitidos; nunca executa código do usuário |
| `record_template` | id, name, kind, defaults_json, order | Padrões editáveis; valores derivados continuam validados |
| `backup_manifest` | id, format_version, schema_version, created_at, checksum | Parte do envelope **criptografado** e/ou cabeçalho mínimo autenticado |

## Regras de armazenamento

- Usar UUID/ULID para IDs estáveis; FKs habilitadas; índices em `(account_id, settled_on)`, `(occurred_on)`, `(due_on)`, `(month)`, `(rule_id, expected_on)` e chaves únicas de deduplicação quando fizer sentido.
- Quantias `INTEGER` em centavos (`amount_minor`); sinal e `kind` coerentes. Quantidades físicas com decimal canônico textual ou representação inteira escalada, nunca JS `number` binário como fonte da verdade.
- Formato de datas civis ISO; `created_at/updated_at/changed_at` timestamps UTC. Guardar timezone da regra de agenda.
- Integridade: `CHECK`, `UNIQUE`, `FOREIGN KEY` e validação de domínio; `PRAGMA foreign_keys = ON` a cada conexão relevante.
- Evitar guardar saldo final como fonte da verdade. Materializar snapshots/cache de projeção com versão da origem e invalidação explicitamente testada.
- O campo `source` distingue `manual`, `rule`, `import` e outros, sem fazer da origem uma fonte de autoridade especial.
- Valores sensíveis de campos personalizados continuam no DB criptografado. Definições de campos não podem conter SQL/JS arbitrário.

## Estratégia de lançamento e dupla contagem

Evitar duas tabelas independentes de “gasto” e “pagamento” que produzam a mesma saída. Recomenda-se um **registro de negócio** ligado a **obrigações** e **liquidações**, e, quando necessário, a **itens/estoque/ativos**.

**Compra no cartão:** `record(compra)` + obrigação (na fatura/parcelas) + liquidação futura (banco→passivo do cartão). Relatório de consumo atribui gasto à compra; relatório de caixa usa liquidações; passivo reflete obrigações abertas. Não debitam o banco na compra.

**Compra à vista:** `record(compra)` + `settlement` na mesma data; a alteração do caixa ocorre uma única vez.

**Transferência:** preferir objeto `transfer` com pares de movimento associados atomicamente; não classificar as duas pernas como receitas e despesas.

**Reserva:** `envelope_allocation` afeta indicador livre, mas não muda saldo real da conta.

**Orçamento:** `budget` só informa expectativa; projeção de consumo variável deve ter política explícita para não duplicar compromissos detalhados já existentes.

## Recalcular projeções

`affected_from = min(old_effective_date, new_effective_date)` para mudanças com efeito monetário; para registros com várias liquidações ou dependências, considerar **todas** as datas afetadas. Invalidar caches daquele ponto em diante para contas/horizontes e contextos impactados. Refazer a projeção determinística a partir da fonte da verdade e do snapshot de abertura.

Mudança de categoria pode invalidar só orçamentos/relatórios; mudança de regra de recorrência invalida as ocorrências derivadas daquela regra. Execução tardia deve recalcular o ciclo seguinte sem fabricar execuções retroativas.

## Conciliação com bancos

Guardar `balance_observation(account_id, observed_on, observed_minor, source)` como observação externa para alertar divergência. **Nunca** substituir silenciosamente um saldo derivado por um número digitado: a diferença exige ajuste explícito ou identificação dos lançamentos faltantes.

## Migrações

`schema_version` com migrações ordenadas, testadas em cópias; `BEGIN/COMMIT/ROLLBACK`; backup antes de migração arriscada, validação de integridade após; nenhuma migração destrutiva automática sem caminho de recuperação. Testar upgrade de múltiplas versões e restauração antiga.


## Extensões v2 — rastreabilidade de séries e eventos

| Entidade / campo | Papel | Restrição |
|---|---|---|
| `record.occurred_time_local?` | hora civil de compra/venda se observada | `NULL` se desconhecida; jamais imputar meia-noite |
| `settlement.settled_time_local?` | hora civil da liquidação, se observada | não equivale a `recorded_at` |
| `obligation.planned_settlement_on?` | previsão atual de pagamento | independente de `due_on` original |
| `contract` | financiamento, assinatura/obrigação externa | cancelamento local não cancela terceiros |
| `recurrence_rule_version` | histórico de políticas com vigência | estável após efetivada |
| `recurrence_exception` | substituição/ignorar/cancelar ocorrência específica | única por `(rule_id, occurrence_key, action_version)` ou política equivalente |
| `occurrence_key` | identidade lógica independente de data adiada | determinística e estável por série/posição |
| `reversal_event` | estorno, devolução, crédito, perdão | ID do original, valor, status, conta/obrigação e causa |
| `record_event_link` | relações entre compra, parcela, estorno e projeto | evita associação apenas por título/valor |
| `import_origin` | arquivo, linha, digest/ID de origem | suspeita de duplicação exige revisão |

**Não adicionar automaticamente todas as tabelas acima:** o desenho é conceitual. Implementar somente o necessário para os casos de uso previstos; contratos e invariantes, não o número de entidades, definem a qualidade. Usar transação única para aplicar uma ação em lote e seus vínculos financeiros.

**Estados ortogonais:** `nature` (estimativa/contrato/fato), `obligation_status` (não devido/aberto/parcial/liquidado/dispensado), `refund_status` (solicitado/a receber/parcial/recebido/cancelado) e `series_status` (ativa/encerrada/cancelada). Não criar um enum gigante que combine tudo em estados contraditórios.

Ver [14 — Ações](14-acoes-estornos-cancelamentos.md) e [15 — Séries](15-recorrencias-condicionais-series.md).
