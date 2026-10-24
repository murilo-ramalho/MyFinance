# 08 — Estratégia de testes e aceite

## Pirâmide pragmática

- **Domínio unitário (maioria):** funções puras de dinheiro, data, saldo, parcelas, envelopes, orçamentos, recorrências e projeção; fixtures sintéticas.
- **Integração SQLite:** constraints, migrations, transações compostas, performance e queries parametrizadas; SQLCipher em build nativo de teste.
- **Fluxos ponta a ponta (poucos e críticos):** desbloqueio, registrar/editar, visualizar projeções, backup, restaurar, autenticação após background.
- **Fuzz/property-based (foco):** entradas CSV, combinações de períodos, valores monetários, sequências de operações e alterações retroativas.
- **Revisão humana e segurança:** ameaça mapeada, dependências, chaves, permissões e fluxo de recuperação.

## Cenários de aceite de negócio (Given/When/Then)

| ID | Dado / quando | Então |
|---|---|---|
| CT-001 | Banco R$ 1.000; transferência R$ 300 para carteira | Banco 700, carteira +300, consolidado não muda |
| CT-002 | Banco R$ 1.000; alocar R$ 300 em emergência | Banco permanece 1.000; livre cai 300 |
| CT-003 | Compra à vista R$ 105 de 3 kg | Caixa −105, estoque +3 kg, métrica R$ 35/kg |
| CT-004 | Consumir 200 g comprados acima | Estoque −200g, custo atribuído R$ 7, sem nova saída de caixa |
| CT-005 | Plano alimentação 600; realizado 636 | Desvio +36 ou +6%; impacto futuro correto |
| CT-006 | Setembro fecha 1.500; lançar hoje despesa paga R$ 250 em setembro | Setembro 1.250; meses seguintes −250, sem alterar agosto |
| CT-007 | Editar despesa histórica 100→130 | Todos períodos afetados −30, auditoria aponta antes/depois |
| CT-008 | Mudar apenas categoria de gasto | Saldo igual; orçamento/relatórios alterados |
| CT-009 | Saldo inicial 1.000; mês resultado −1.300 | Fechamento −300 e próxima abertura −300 |
| CT-010 | Mês termina +500 mas dia 12 saldo −300 | Mostrar menor saldo −300, dia e alerta |
| CT-011 | Compra cartão 1.200/12; depois pagar fatura 100 | Compra 1.200 no consumo; caixa sai 100 só no pagamento; não 1.300 |
| CT-012 | Compra 100/3 | Parcelas rateadas somam exatos 10000 centavos |
| CT-013 | Recorrência semestral prevista 15/07 executada 02/08 | Próxima execução prevista 02/02 seguinte |
| CT-014 | Ocorrência planejada atrasada sem execução | Continua pendente, não cria próxima execução fictícia |
| CT-015 | Previsão R$ 600 reconciliada com despesa R$ 636 | Não conta R$ 1.236; mantém desvio R$ 36 |
| CT-016 | Receber salário previsto | Confirma caixa uma vez; previsões futuras atualizadas |
| CT-017 | Excluir/estornar pagamento parcialmente quitado | Obrigações e saldos coerentes, preservando histórico |
| CT-018 | Saldo em fundo ilíquido R$ 10.000 | “Disponível seguro” não soma automaticamente 10.000 |
| CT-019 | Aplicar cenário conservador sem receita incerta | Disponibilidade diminui ou permanece, sem falsa certeza |
| CT-020 | Abrir mesmo registro para edição | Campos persistidos aparecem, não sobrescritos por defaults “hoje” |
| CT-021 | Alterar data da compra após editar manualmente pagamento | Data de pagamento editada permanece |
| CT-022 | Senha errada ou biometria cancelada | Banco permanece inacessível |
| CT-023 | Build sem SQLCipher | Bloqueia uso de DB, não cria plaintext silencioso |
| CT-024 | Exportar, reinstalar em outro dispositivo, importar | Dados e saldos reconstituídos após senha backup |
| CT-025 | Backup truncado ou senha de backup errada | Banco atual intacto |
| CT-026 | Import CSV malicioso/repetido | Prévia e validação; não executa código nem duplica silenciosamente |
| CT-027 | Edição composta falha na metade | Transação rollback, estado anterior íntegro |
| CT-028 | Alterar regra de recorrência futura | Histórico original permanece, futuro regenerado por regra nova |
| CT-029 | Investimento c/ dividendos previstos | Não registra como recebido antes do evento confirmado |
| CT-030 | Medidas inválidas, quantidade zero em custo por uso | Erro validado, não NaN, divisão por zero ou valores falsos |

## Testes de propriedades importantes

- Para qualquer sequência de transferências internas, soma dos saldos consolidados não se altera (ignorando taxas).
- Para qualquer mês, abertura do mês seguinte = fechamento do anterior.
- Para qualquer alteração retroativa de valor, delta nos dias posteriores é consistente até ocorrência compensatória.
- Para qualquer parcelamento de valor positivo, soma das parcelas em centavos é igual ao valor total.
- Para qualquer reconciliação previsão→realizado, projeção resultante não soma previsto e realizado da mesma obrigação.
- Para qualquer arquivo de backup com tag adulterada, importação rejeita antes de mutar dados.
- Para qualquer lançamento válido, criar e depois estornar restabelece efeitos líquidos conforme os movimentos definidos.

## Gates de release

- Typecheck, lint, testes unitários, testes de integração, testes de migrations e backup restore passam.
- Testes nativos Android para SQLCipher, biometria, troca de credenciais, reinicialização, background e proteção visual passam.
- Testes iOS também antes de anunciar suporte à plataforma.
- Vulnerabilidades de dependências analisadas; scripts/permissions revisados; não existe envio remoto involuntário.
- Critérios de aceite e ameaça mapeada revisados pelo desenvolvedor (a IA não aprova a própria segurança).

## Regra de desenvolvimento

Escrever teste de comportamento antes ou junto da regra crítica; evitar mocks que só testam o próprio mock. Não adicionar proteções especulativas por “talvez”; reproduzir e testar cenários plausíveis, corrigindo o defeito comprovado. Não reduzir testes para facilitar geração de código por agente.


## Cenários adicionais obrigatórios da versão 2

| ID | Cenário | Resultado exigido |
|---|---|---|
| CT-031 | Abrir Início em outubro/2026 | Outubro e novembro aparecem **em sequência** sem troca de filtro |
| CT-032 | Abrir Movimentações em outubro/2026 | Outubro selecionado, todas as situações, horas somente quando disponíveis |
| CT-033 | Importar compra 08/08 sem hora | Exibe apenas a data; não fabrica `00:00` |
| CT-034 | Compra 20/08 de R$169; estorno em 25/08 | −169 no dia 20, +169 no dia 25, saldo líquido 0, ambos auditáveis |
| CT-035 | Compra cancelada com reembolso a receber | Banco não aumenta até confirmação do depósito/crédito |
| CT-036 | Compra R$169; reembolso R$60 + R$109 | total reembolsado 169; terceiro reembolso positivo bloqueado |
| CT-037 | Estorno no cartão, ainda sem crédito bancário | não cria receita bancária |
| CT-038 | Receita venda 120 e outra venda 120 mesmo dia | permanecem distintas, sem fusão automática |
| CT-039 | Série dia 2 entre nov/2026 e jan/2027 | 3 ocorrências, nenhuma em fevereiro |
| CT-040 | Ignorar somente dezembro | novembro/janeiro intactos; dezembro sem saída esperada |
| CT-041 | Financ. 12 parcelas, 4 pagas; cancelar 8 pendentes comprovadamente dispensadas | 4 pagamentos continuam; 8 deixam de ser projetados; sem reembolso inventado |
| CT-042 | Parcela vencida novembro paga outubro | caixa efetivo em outubro, vencimento novembro preservado |
| CT-043 | Parcela novembro paga dezembro | dívida vencida em novembro, caixa efetivo em dezembro |
| CT-044 | Cancelar uma dívida sem comprovada dispensa | não permite «ignorar parcela» como se extinta; oferece reagendar/pagar/registrar dispensa confirmada |
| CT-045 | Mudar valor só da ocorrência de dezembro | série inalterada nos demais meses; exceção persistente após regeneração |
| CT-046 | Aplicação em lote falha na metade | rollback integral de obrigações, eventos e exceções |
| CT-047 | Consumo de filamento antes comprado | custo projeto muda, banco não sofre segunda saída |
| CT-048 | Saldo outubro 30891 centavos e entradas novembro 241000, saídas 194212 | fechamento novembro = 77679 centavos |
| CT-049 | Planejamento de despesa 600 e confirmação de 636 | desvio +36, caixa contabilizado uma vez |
| CT-050 | Alterar data de pagamento anterior ao vencimento e depois estornar | mês e dia da saída e do crédito corretos; sem remover eventos históricos |

**Fuzzing direcionado:** geração de ações sobre séries, exceções repetidas, estornos parciais, importações com horas ausentes e troca de vencimento/pagamento. Gerador compara saldos recomputados sem cache com os derivados incrementais.

A especificação inclui fixtures sintéticas verificáveis em `docs/18-cenarios-de-aceite.json`.
