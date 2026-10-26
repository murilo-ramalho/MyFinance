# 02 — Regras de negócio e invariantes

> Números monetários em unidade mínima inteira (centavos para BRL), moeda explícita; medidas e quantidades em decimais exatos com unidade. Os exemplos são hipotéticos.

## 2.1 Datas, estados e ciclo de vida

- **RN-001:** `occurred_on` = data do fato econômico (compra/venda/receita/serviço); `due_on` = vencimento/recebimento esperado; `settled_on` = data efetiva do pagamento ou recebimento; `recorded_at` e `updated_at` são timestamps de auditoria. Não substituí-los uns pelos outros.
- **RN-002:** Valores planejados, compromissos confirmados, fatos realizados e liquidações são distintos. Uma previsão nunca vira pagamento automaticamente apenas porque a data chegou.
- **RN-003:** Registrar no passado, presente ou futuro é válido se o significado e status forem consistentes. Fato futuro contratado pode ter parcelas futuras, mas pagamento futuro permanece pendente até confirmação.
- **RN-004:** Registros podem ter múltiplas liquidações parciais. `pago` significa soma liquidada >= total exigível, considerando ajustes e estornos.
- **RN-005:** Alteração de descrição não altera dinheiro. Alteração de valor, data, conta, vínculo ou estado recalcula somente projeções e visões dependentes, sem ocultar alterações históricas.
- **RN-006:** Cancelar/anular preserva trilha auditável. Não apagar silenciosamente registros utilizados por relatórios; registros duplicados importados têm ação de deduplicação auditada.
- **RN-007:** O fuso de referência do planejamento é configurável e persistido; datas civis são `YYYY-MM-DD` e timestamps de auditoria em UTC. Mudança de fuso não reescreve fatos.

## 2.2 Contas, reservas e patrimônio

- **RN-010:** Contas reais representam saldo físico/jurídico; reservas/envelopes representam destinação lógica **sobre saldos**. Contar reserva como nova conta sem contrapartida duplica patrimônio e é proibido.
- **RN-011:** Transferir R$ 300 banco→carteira: banco −300, carteira +300, consolidado 0. Alocar R$ 300 no envelope emergência: saldo bancário real não muda, livre para gastar diminui 300.
- **RN-012:** Movimentos entre contas internas não são receitas nem despesas. Tarifas de transferência, quando existirem, são despesas separadas.
- **RN-013:** Dinheiro em corretora e investimentos não vira automaticamente “livre”: considerar disponibilidade de resgate, impostos/taxas estimados apenas se modelados e prazo de liquidação.
- **RN-014:** Patrimônio líquido = ativos avaliados − passivos; investimentos devem ter custo de aquisição e valor de mercado separados; valorização não é salário nem dinheiro recebido.
- **RN-015:** Saldo negativo é permitido e exibido; não presumir crédito aprovado. Se `saldo bancário real` negativo for informado, conciliar com o extrato e possíveis juros.
- **RN-016:** Proteger uma reserva exige política explícita de movimentação: normal, aviso, ou confirmação reforçada para retirar. Essas proteções são regras de produto, não autorização bancária.
- **RN-017:** Contas de moedas diferentes não são somadas sem taxa, data e origem de câmbio explícitas; MVP BRL.

## 2.3 Compras, despesas, cartão e parcelamento

- **RN-020:** Compra cria fato econômico na data da compra; pagamento afeta caixa na data efetiva. Comprar no cartão não debita simultaneamente o banco e a fatura.
- **RN-021:** Cartão representa passivo. A compra aumenta obrigação; pagamento da fatura reduz banco e passivo. Não contabilizar fatura novamente como despesa de consumo.
- **RN-022:** Parcelamento: número de parcelas positivo, soma de valores de parcelas = total incluindo juros/taxas definidos; rateio de centavos determinístico; vencimentos conforme regra contratada.
- **RN-023:** Pagamento antecipado, parcial, atraso, juros, estorno e renegociação são eventos explícitos, não sobrescrita de históricos.
- **RN-024:** Lançamento de compra com itens pode ter quantidade, unidade, valor unitário, descontos e taxa. Soma de itens + ajustes = total da compra; diferença de arredondamento deve ser distribuída e testada.
- **RN-025:** Distinguir o “custo da compra” do “fluxo de caixa” por data para evitar dupla subtração do saldo.
- **RN-026:** Despesa digital sem cartão é débito e afeta caixa na data de liquidação efetiva/prevista. Cartão selecionado é crédito: a compra cria obrigação, sem baixar a conta bancária na data da compra. Dinheiro físico é meio separado.

## 2.4 Previsões, recorrências e revisões

- **RN-030:** Recorrência por calendário: “dia 5 de cada mês”, com regra explícita se cair em fim de semana/feriado e caso o dia não exista (ex.: 31/fev).
- **RN-031:** Recorrência por duração: “a cada 30 dias desde referência” não equivale a “todo dia 30”.
- **RN-032:** Recorrência por execução: próxima ocorrência = data **real da última execução + intervalo**, e não a data originalmente prevista. Ex.: prevista 15/07, realizada 02/08, próximo ciclo semestral 02/02.
- **RN-033:** Ciclo por uso (quilometragem, horas, quantidade) é opcional e deve depender de medição, não de calendário.
- **RN-034:** Ocorrências futuras geradas são projeções derivadas, com identificador determinístico de regra+ciclo para evitar duplicatas; somente fatos efetivos são persistidos como realizados.
- **RN-035:** Uma ocorrência prevista pode ficar vencida e pendente; não gerar cadeia de ciclos “executados” se o evento anterior ainda não aconteceu.
- **RN-036:** Alteração de regra atua prospectivamente por padrão. Editar histórico exige escolha explícita e manutenção de versão ou snapshot quando houver comparação.
- **RN-037:** Previsões modificadas devem preservar pelo menos a previsão-base relevante para análise planejado×realizado, sem somá-la ao registro realizado.
- **RN-038:** Tipos de expectativa: recorrência contratual, orçamento/intenção, custo estimado e cenário hipotético. A origem e confiança ficam visíveis.

## 2.5 Cálculo de saldo e previsibilidade

- **RN-040:** Para conta de caixa `c`: `saldo(c, d) = saldo_abertura(c) + soma(movimentos_liquidados_em_c_ate_d)`. Abertura deve ter data e evidência, e correções retroativas mantêm cadeia auditável.
- **RN-041:** Saldo consolidado de caixa = soma dos saldos das contas de caixa selecionadas; excluir transferências internas em agregações de **fluxos de receitas e despesas**.
- **RN-042:** Para mês `m`: `saldo_final(m)=saldo_inicial(m)+entradas_caixa(m)-saidas_caixa(m)` e `saldo_inicial(m+1)=saldo_final(m)`. Pode ser negativo.
- **RN-043:** Projetar **diariamente**, aplicando entradas e saídas previstas por data; mostrar menor saldo diário além do final mensal. Se não houver hora conhecida, agregar os fluxos da mesma data civil antes de medir o mínimo, sem inventar ordem intradiária. Um mês positivo pode ter insuficiência intermediária.
- **RN-044:** Recalcular futuro ao corrigir passado: uma despesa liquidada de R$ 250 em setembro reduz o fechamento de setembro, outubro, hoje e projeções futuras em R$ 250, salvo compensações explícitas.
- **RN-045:** Uma estimativa de despesas pendentes não pode ser somada novamente se a realização substitui exatamente a previsão. Deve haver `source_forecast_id` ou vínculo equivalente e estratégia de conciliação.
- **RN-046:** Indicador **gasto seguro** para horizonte H: considerar apenas caixa líquido elegível, menos envelopes protegidos, menos obrigações e gastos provisionados, medindo o **menor saldo projetado em cada dia** do horizonte; incluir margem configurada. Não usar resgates hipotéticos nem salários incertos como garantidos.
- **RN-047:** Indicador é `estimativa`, não ordem bancária. Mostrar horizonte (até próximo salário, 30/90 dias), premissas, incerteza e “por que esse valor?”.
- **RN-048:** Uma projeção com entradas não confirmadas deve ser identificada; oferecer visão **conservadora** (ignora receitas incertas) e **esperada** (considera cenários explicitados) sem confundir ambas.
- **RN-049:** Se projeção mínima < 0, exibir valor e primeira data de insuficiência e persistência da situação; jamais truncar para zero.
- **RN-050:** Arredondamentos monetários em operações de divisão são determinísticos, com regra documentada (por padrão, metade para o par em estatísticas; rateios preservam soma inteira). Não fazer soma usando binary float.

### Exemplo de gasto seguro (simplificado)

Saldo elegível inicial = R$ 3.500; saídas previstas/contratadas até próximo salário = R$ 2.060; colchão mínimo = R$ 200; sem entradas incertas consideradas ⇒ **R$ 1.240**. O sistema real deve simular **as datas diárias** e retornar o menor espaço disponível, e não apenas subtrair totais mensais.

## 2.6 Orçamentos, projetos, itens e retornos

- **RN-060:** Orçamento mensal (ex.: alimentação R$ 600) não é saída de caixa. Gasto efetivo de R$ 636 ⇒ `desvio = +R$36` e `desvio_% = 6%`.
- **RN-061:** Previsão original, revisão de orçamento e realizado devem estar identificados separadamente para medir qualidade da previsão e seu impacto no fluxo futuro.
- **RN-062:** Projeto/setor agrupa despesas e receitas; se um registro for distribuído entre projetos, soma dos percentuais/centavos alocados deve corresponder exatamente ao total. No shell de teste, projetos têm nome e descrição, podem ser associados a entradas ou saídas sem criar outro fluxo de caixa e exibem fluxo acumulado com realizado, compromisso e previsão separados. Esse fluxo não é margem nem custo produtivo.
- **RN-063:** Item de estoque usa unidade de medida explícita (`kg`, `g`, `un`, `L`, `mL`, etc.), fator de conversão conhecido e precisão decimal; preço/kg = custo alocado dividido por kg comprado. Descontos/taxas precisam de método de alocação.
- **RN-064:** Compra de 3 kg a R$ 105 ⇒ R$ 35/kg. Consumo de 200g ⇒ R$ 7 a custo da compra, antes de outros custos e perdas.
- **RN-065:** Perda de estoque é movimento de estoque e possível perda econômica; **não** lançar nova saída de caixa se o item já foi pago.
- **RN-066:** Investimentos guardam quantidade, ativo, custo, taxas, proventos efetivamente recebidos, proventos estimados por unidade **e periodicidade**. R$ 1 por ação só vira projeção após especificar pagamento e hipótese; nunca rendimento garantido.
- **RN-067:** Separar aporte e retirada de ganho/perda; valorização de mercado de dinheiro recebido; pagamentos de dividendos podem afetar caixa sem serem confundidos com compra/venda de ativos.
- **RN-068:** Ferramentas: custo por uso = (custo de aquisição + despesas atribuídas − valor residual realizado/estimado conforme contexto) / número de usos, declarando premissas; com 0 usos, métrica indefinida, nunca infinito/NaN na UI.

## 2.7 Importação, edição e consistência

- **RN-070:** Importações só entram após validação de formato, valor, moeda, tipo, limites e datas; prévia de impacto e detecção de duplicatas por identificadores e evidências.
- **RN-071:** Correção financeira mantém registro de auditoria com `before/after`, timestamp e motivo opcional; nunca logar senhas, chaves, detalhes sensíveis de backup.
- **RN-072:** Reclassificar categoria/projeto altera relatórios, não altera o saldo de caixa.
- **RN-073:** Restore completo exige backup consistente e validado; sem restauração parcial silenciosa.
- **RN-074:** Confirmação de previsão não cria uma segunda despesa; concilia previsão à realização, com desvio documentado.

## Invariantes para testes

1. `Σ parcelas = total contratado` após juros e rateio.
2. `Σ transferências internas no consolidado = 0` (sem tarifa).
3. `saldo_inicial_mes_seguinte = saldo_final_mes_anterior`.
4. `saldo_conta_atual = saldo_abertura + Σ liquidações até hoje`.
5. `Σ alocação_envelopes ≤ saldo elegível alocável` por política configurada, com estado de insuficiência explícito se saldo cair depois.
6. `previsto ≠ realizado`: conciliar, não duplicar.
7. Toda operação composta é atômica; edição retroativa preserva auditabilidade.
8. Qualquer chave/valor inválido interrompe operações sensíveis; nunca retornar saldo fictício como se fosse verdadeiro.


## 2.8 Aditivo v2 — ações sobre registros e regras de série

Os identificadores **RN-080 a RN-100** estão definidos integralmente nos documentos [14](14-acoes-estornos-cancelamentos.md) e [15](15-recorrencias-condicionais-series.md). São regras **normativas** e integrantes da presente especificação, não sugestões opcionais.

- **RN-101:** A tela de registros mostra mês corrente por padrão, fatos por data/hora quando conhecida, futuras expectativas/compromissos com identificação; datas sem hora importadas continuam sem hora.
- **RN-102:** A tela Início exibe o mês atual e o próximo sequencialmente, com abertura, receitas, despesas, fechamento transmitido e menor saldo diário (quando calculável). Disponível seguro é indicador separado.
- **RN-103:** Receitas eventuais não são projetadas como recorrentes a menos que exista regra confirmada. Recebimento de reembolso não é renda econômica nova.
- **RN-104:** Orçamento e previsão são metadados de planejamento; jamais inventar pagamento real para fechar uma previsão ou cancelar diferença.
- **RN-105:** Consumo de material previamente comprado pode compor custo de produção, mas não gera nova saída de caixa. Gastos menores são visões/filtros da mesma fonte de dados.
- **RN-106:** «LETREIRO» e «ZOKI» da amostra são vendas **distintas**; deduplicação automática depende de evidência forte, não de valor/data.
- **RN-107:** No atraso, preservar vencimento original e nova data de pagamento; no adiantamento, registrar pagamento na data antecipada, atualizando caixa sem mover o fato econômico original.
- **RN-108:** Operações de cancelamento/reembolso são eventos distintos e reversíveis apenas mediante correções auditadas ou compensações; cancelamento de financiamento no app não altera contrato externo.
- **RN-109:** Escolha de alcance para ações em séries é obrigatória quando o usuário tenta alterar mais de uma ocorrência, com prévia do impacto.
- **RN-110:** Regra mensal «dia 2 de novembro/2026 até janeiro/2027, inclusivo» gera três ocorrências, e nenhuma em fevereiro. Pular só dezembro não anula novembro/janeiro.

### Invariantes v2

- `liquidação efetiva = soma de pagamentos confirmados − devoluções efetivas`, por conta e data; obrigações abertas não mudam caixa até liquidação.
- `recebível de reembolso ≠ recebimento confirmado`; um crédito na fatura não implica depósito bancário.
- `cancelar regra ≠ apagar passado`; `pular intenção ≠ perdoar dívida`; `adiar pagamento ≠ alterar vencimento original`.
- Em qualquer mês `opening(n+1) = closing(n)` mesmo se `closing(n) < 0`.
- Transações com mesmo dia/valor, mas identidades distintas, não são deduplicadas automaticamente.
