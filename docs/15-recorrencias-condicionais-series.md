# 15 — Motor de recorrências, séries e exceções (v2)

## Conceitos sem ambiguidade

1. **Regra de série:** define como ocorrências planejadas surgem (calendário, contagem, janela ou condição).
2. **Ocorrência:** instância identificável, que pode ser prevista, pendente, realizada, ignorada ou cancelada.
3. **Exceção:** alteração de **uma** ocorrência (valor, item, data, cancelamento) sem alterar as demais.
4. **Versão da regra:** mudança da série com vigência definida; passado realizado é preservado.
5. **Obrigação contratada:** valor exigível independente de o usuário desejar executá-lo. «Ignorar previsão» **não** perdoa dívida.
6. **Liquidação:** pagamento ou recebimento efetivo, possivelmente parcial, diferente de ocorrência e obrigação.

## Tipos de programação

| Tipo | Exemplo | Geração |
|---|---|---|
| Mensal fixo, prazo final | todo dia 2 até 31/01/2027 | 02/11, 02/12, 02/01 (se início novembro) |
| Mensal por contagem | 6 repetições | 6 datas previstas e então encerra |
| Mensal indefinido | assinatura | janela sob demanda, sem materializar infinito |
| Intervalo decorrido | 30 dias após data âncora | difere de «dia 30 do mês» |
| Após conclusão | manutenção 6 meses após última execução | próxima data depende do realizado |
| Por medição | a cada 10.000 km | depende de contador medido e seu histórico |
| Por condição | estoque abaixo do limite | gera **sugestão** até confirmação; não gera pagamento automaticamente |

### Condições de término

`end_on` inclusivo; `max_occurrences` com semântica explícita; `until_completed` se fizer sentido; `canceled_from`; manual. Validar que a data final não antecede a inicial. Regra pode ter `item_template_id` opcional, e cada ocorrência pode trocar item, quantidade ou preço sem alterar a recorrência inteira.

### Calendário, fuso e dias inexistentes

Definir fuso local da série e comportamento explícito para dia 29–31 em mês curto (`último dia válido`, `pular mês`, `primeiro dia do mês seguinte`) e para finais de semana/feriados se desejado. A opção selecionada é persistida; não adivinhar feriados sem calendário definido. `UNTIL`, `COUNT` e `EXDATE` da RFC 5545 servem como referência, **não** para lógica de conclusão ou pagamento.

## Escolha de alcance (escopo) por ação

| Escolha no aplicativo | Significado persistido |
|---|---|
| **Somente esta ocorrência** | exceção pelo `occurrence_key` imutável; não altera as outras |
| **Esta e as próximas** | encerra/versão da regra a partir da âncora escolhida; futuras regeneradas |
| **Todas as pendentes** | cancela ou altera somente ocorrências/obrigações legalmente canceláveis e ainda não liquidadas; conserva as liquidadas |
| **Regra inteira** | para/cancela geração futura ou altera modelo geral; não reescreve fatos históricos |

Antes de aplicar, exibir contagem de atingidas e separá-las em «previstas», «contratadas pendentes», «pagas/parciais». Operação atômica, revisões auditadas e invalidadores de projeção.

## Distinções críticas — exemplos

- **Compra repetida voluntária:** planejava comprar um produto todo dia 2; decide pular dezembro. A ocorrência de dezembro é **ignorada**, sem dívida/caixa; janeiro permanece. Se novembro já foi comprado, novembro não muda.
- **Mensalidade contratada:** não pagar novembro não significa «ignorar». Fica em atraso até pagamento, dispensa confirmada ou renegociação. O vencimento original continua visível.
- **Financiamento:** cancelar **uma parcela** requer registrar dispensa/revisão contratual específica; não pagar não elimina o passivo. Cancelar o financiamento inteiro aplica o cancelamento confirmado às obrigações ainda exigíveis; eventuais multas, quitação, taxas e reembolsos são eventos próprios. Cancelar no app não cancela instituição.
- **Parcela antecipada:** vencimento novembro, pagamento outubro. Caixa cai em outubro; obrigação é liquidada; histórico guarda ambos.
- **Parcela atrasada:** vencimento novembro, paga dezembro. Novembro exibe obrigação vencida e insuficiência/compromisso; pagamento reduz caixa em dezembro.
- **Manutenção pós-execução:** prevista 15/07, executada 02/08; próximo vencimento 02/02. «Pular» ocorrência pode adiar alerta, mas **não** fingir manutenção executada.

## IDs e estado

- **RN-091** Toda série possui identidade e versão; `occurrence_key` estável derivado de `rule_id` + posição/âncora estável, não só data (que pode ser adiada).
- **RN-092** Ocorrências não liquidadas podem ser projeções derivadas; exceções e obrigações confirmadas persistem, sem explosão de registros futuros.
- **RN-093** Uma ocorrência marcada «ignorada» não gera obrigação para compra opcional; em contrato confirmado, ação «ignorar» é proibida sem evento de dispensa/renegociação válido.
- **RN-094** Pagamentos antecipados ou tardios vinculam a ocorrência/obrigação, mas afetam caixa **na data efetiva**.
- **RN-095** `change_scope` deve ser explícito para mutações de séries; por padrão, ação originada numa ocorrência afeta **somente ela**.
- **RN-096** Cancelar recorrência não apaga lançamentos realizados, revisões ou snapshots históricos. Exceções não viram novas séries automaticamente.
- **RN-097** Regras condicionais não podem criar movimentações monetárias realizadas autonomamente; emitem alertas/previsões a confirmar.
- **RN-098** Execuções pós-evento só projetam próximo ciclo após confirmação do evento âncora; alterações retroativas reavaliam ciclos dependentes e preservam histórico.
- **RN-099** Regra encerrada em janeiro não gera fevereiro; alterações posteriores na regra não recriam obrigações canceladas sem aprovação.
- **RN-100** Invariantes de parcelas (total, juros, pagamentos, obrigação remanescente) são verificadas antes/depois de ações em lote.

## Esquema lógico recomendado

`recurrence_rule(id, recurrence_kind, anchor_on, cadence, end_on?, max_occurrences?, completion_anchor?, condition_json?, item_template_id?, version)`; `recurrence_rule_version(id, rule_id, effective_from_occurrence_key, policy_snapshot)`; `recurrence_exception(id, rule_id, occurrence_key, action, overrides_json, created_at)`; `recurrence_execution(id, rule_id, occurrence_key, expected_on, actual_on?, status)`; `obligation(id, recurrence_execution_id?, due_on, planned_settlement_on?, amount_minor, contract_id?, status)`; `contract(id, kind, external_reference?, status, canceled_on?)`. Usar tipos e restrições; JSON apenas para parâmetros bem tipados e validados.

## Critérios de aceite mínimos

- De novembro/2026 até janeiro/2027, mensal dia 2 ⇒ exatamente três ocorrências.
- Pular só dezembro não suprime janeiro; cancelar a série a partir de dezembro suprime dezembro e janeiro futuros não contratados.
- Financiamento com 12 parcelas, 4 pagas, 8 em aberto: cancelar as pendentes após confirmação preserva 4 pagamentos; eventuais créditos futuros não aparecem como caixa recebido.
- Alteração de um item numa ocorrência não altera outras e não cria duplicidade na regeneração.
- Regra de manutenção pós-execução reancora pelo dia **real** da última execução.
