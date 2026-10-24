# 16 — Planilha de referência, dados de exemplo e validação de cálculos

> **Atenção:** dados de outubro e agosto fornecidos pelo usuário ilustram cenários; **não** são necessariamente cadastro completo, nem devem ser inseridos no protótipo como dados pessoais reais. Algumas fórmulas originais da planilha não foram disponibilizadas; não presumir suas definições.

## Mapear visão, não replicar abas

| Aba original | Conceito do aplicativo | Evitar |
|---|---|---|
| RESUMO | fechamento mensal + previsão do mês seguinte | usar saldo de conta como sinônimo de disponível seguro |
| REGISTROS | lista de fatos/obrigações/liquidações | misturar datas de compra e pagamento |
| CARTÃO | compras, parcelas, faturas, pagamento e adiantamento | contar fatura como nova despesa econômica |
| GASTOS MENORES | categorias/filtros de movimentos | duplicar movimento que já esteja na lista geral |
| RENDIMENTOS IMPRESSORA | projeto produtivo e apuração de margem | tratar consumo de estoque como novo pagamento |

## Fórmulas de referência verificadas

- **Outubro/2026 (exemplo informado):** saldo anterior −R$19,88 + receitas R$2.420,00 − despesas R$2.091,21 = **saldo final R$308,91**.
- **Novembro previsto:** saldo anterior R$308,91 + R$2.410,00 − R$1.942,12 = **R$776,79**.
- **Alimentação:** previsto R$600,00; realizado R$636,00 ⇒ desvio **+R$36,00**, **+6%**; se sobrariam R$200,00, sobram R$164,00 (outras premissas iguais).
- **Impressora / ZOKI:** venda R$120,00 − produção R$84,87 = **lucro bruto R$35,13**.
- **Impressora / 40 espátulas:** venda R$140,00 − produção R$90,32 = **lucro bruto R$49,68**.
- **Impressora (amostra):** faturamento R$260,00; custos produtivos R$175,19; lucro bruto R$84,81; margem bruta ≈ **32,62%** (não inclui outros custos não informados).
- **Produto:** 3 kg por R$105,00 ⇒ custo unitário R$35/kg; consumo 200 g = R$7 de custo consumido (sem novo movimento de caixa).
- **Ação:** R$105 por cota com provento estimado R$1/cota **por evento explicitado**; renda prevista depende de quantidade, calendário, taxas e hipótese, não é dinheiro realizado nem garantido.

## Regras de interpretação

1. «LETREIRO» e «ZOKI» de mesmo dia/valor são **vendas distintas**; nunca fundir automaticamente.
2. Gastos menores podem ser operações adicionais ou cópias exibidas em outra aba: **não somar automaticamente** antes de confirmar identidade/vínculos ao importar.
3. `correção` no histórico é um **ajuste a investigar**: pode ser conciliação, não receita regular.
4. `1/10`, `2/11`, `3/4` em descrição **não** bastam para construir contrato ou número total de parcelas confiável: perguntar/confirmar antes de migrar.
5. `RECEITA ANUAL = 28.920` na amostra só será reproduzida como cálculo definido quando sua fórmula real for conhecida; não supor multiplicação por 12, porque há rendas esporádicas.
6. Filamento pago num período e consumido no projeto em outro gera **custo de produção**, não outra saída bancária.
7. Rendas extraordinárias (auxílio, venda, trabalho avulso, reembolso, ajuste) têm classificações distintas; **reembolso** não eleva a renda econômica bruta por padrão.

## Casos exemplares para testes de regressão

```text
CASO OCT-01: opening=-1988; inflow=242000; outflow=209121; closing=30891 (centavos)
CASO NOV-01: opening=30891; inflow=241000; outflow=194212; closing=77679 (centavos)
CASO FOOD-01: planned=60000; actual=63600; delta=3600; pct=0.06
CASO PRINT-01: sale=12000; productiveCost=8487; grossMargin=3513
CASO PRINT-02: sale=14000; productiveCost=9032; grossMargin=4968
CASO REFUND-01: settledPurchase=-16900 on Aug20; receivedRefund=+16900 on Aug25; net=0
```

**Observação:** validar sempre as fixtures por cálculo independente. Os exemplos canônicos também estão em `docs/18-cenarios-de-aceite.json`.
