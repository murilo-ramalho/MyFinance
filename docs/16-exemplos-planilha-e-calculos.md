# 16 — Planilha de referência, dados de exemplo e validação de cálculos

> **Atenção:** `docs/Controle Financeiro.xlsx` é a planilha real fornecida para orientar o produto. Foi inspecionada estruturalmente; fórmulas e macros não foram executadas e seus lançamentos não foram copiados para o app nem para fixtures. A aba `Diferença` precisa de confirmação semântica antes de virar uma regra de cálculo.

## Mapear visão, não replicar abas

| Aba e campos observados | Conceito formalizado para o app | Confirmação / evitar |
|---|---|---|
| `RESUMO`; resumo mensal e tabela `Produto`, `Comprado`, `Preço` | início mensal; cadastro futuro de item/estoque | recalcular a partir dos registros; confirmar unidade/quantidade e não importar totais ou componentes fixos como verdade |
| `DADOS`: `DATA`, `TIPO`, `VALOR`, `DESCRIÇÃO`, `Diferença` | lista canônica de movimentos, com data do evento e valor em centavos | mapear vocabulário de `TIPO`; não tratar `Diferença` como cálculo único enquanto suas fórmulas não tiverem semântica estável |
| `CARTÃO`: `DATA`, `DATA C.`, `TIPO`, `VALOR`, `DESCRIÇÃO` | visão filtrada por cartão e obrigação, com data da compra separada da data de caixa/fatura | confirmar o significado exato de `DATA C.`; não derivar parcelas ou contabilizar compra e pagamento como duas despesas |
| `SAIDEIRA E IMPREVISTOS`: `DATA`, `TIPO`, `VALOR`, `DESCRIÇÃO`, `RENDIMENTO` | filtros/categorias e visão de entradas extraordinárias sobre os mesmos movimentos | confirmar se cada linha é independente ou uma cópia/resumo de `DADOS`; não somar duas abas cegamente |
| `IMPRESSORA3D`: `DATA`, `C. PRODUÇÃO`, `P. VENDA`, `DESCRIÇÃO` | projeto produtivo com custo e venda, separado de pagamento e recebimento | confirmar se custo é desembolso, custo de estoque consumido ou rateio; não criar saída de caixa pelo consumo de item já pago |

### Requisitos derivados para o protótipo

- Uma lista de movimentos é a fonte das visões; cartões e projetos são etiquetas/filtros e não cópias financeiras.
- Cada fluxo de caixa indica dinheiro digital ou físico. Investimentos são patrimônio separado e não entram no caixa disponível nem no gasto seguro.
- A reserva é uma destinação dentro de uma conta e não é somada ao saldo da conta novamente.
- A visão de cartão precisa exibir data da compra/evento e data de caixa prevista em campos distintos. A tela atual é demonstrativa e ainda não implementa fatura, parcelamento ou conciliação de pagamento.
- Projeto agrupa compras/vendas; custo produtivo, consumo de estoque e margem dependem do módulo de estoque e não são calculados pelo formulário genérico atual.
- A primeira tela de teste usa só fixtures inventadas. A planilha real permanece intacta e não é importada nem alterada.

### Pontos a confirmar antes de importar registros

1. O significado de `DATA C.` e o vocabulário permitido na coluna `TIPO`.
2. Se `SAIDEIRA E IMPREVISTOS` contém fatos independentes ou uma segunda apresentação de movimentos de `DADOS`.
3. O sentido da coluna `Diferença` e os componentes fixos das fórmulas do `RESUMO`.
4. Unidade e precisão de `Comprado`, e se `C. PRODUÇÃO` representa compra paga, consumo de estoque ou custo alocado.

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
