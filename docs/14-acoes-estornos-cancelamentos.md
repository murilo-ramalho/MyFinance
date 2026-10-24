# 14 — Ações dos registros, estornos, devoluções e cancelamentos (v2)

## Princípio

**Correção de cadastro** ≠ **desfazer um fato real**. Ao corrigir erro de digitação, o registro é revisado com auditoria. Quando dinheiro saiu e depois voltou, ambos os fatos permanecem, unidos por um evento de reversão. Nenhuma ação financeira apaga histórico silenciosamente.

## Vocabulário de UI

| Ação | Uso correto | Efeito |
|---|---|---|
| **Editar** | erro de data, descrição, valor ou categoria | revisão auditada, recálculo de efeitos afetados |
| **Estornar / registrar reembolso** | dinheiro pago que foi devolvido | nova liquidação reversa vinculada, na data efetiva |
| **Aguardar reembolso** | cancelou e fornecedor ainda deve devolver | cria recebível previsto/confirmado, **não** credita banco |
| **Cancelar compra** | encerrar operação e pendências válidas | cancela obrigações futuras legalmente dispensadas; mantém pagamentos realizados |
| **Cancelar ocorrência prevista** | decidiu não realizar compra planejada | suprime só a previsão, sem receber dinheiro fictício |
| **Dispensar obrigação** | credor perdoou/cancelou cobrança concreta | evento de extinção da obrigação; prova/motivo opcional |
| **Adiar / reagendar** | data mudou, dívida continua | preserva vencimento original; altera data planejada |
| **Pagar / receber** | liquidação efetiva integral ou parcial | saída/entrada em conta, com data e valor efetivos |
| **Antecipar** | pagamento antes do previsto | liquida na data real, ajusta projeções e reduz passivo |
| **Duplicar** | registrar operação parecida | cria nova identidade, sem ligar automaticamente eventos distintos |

Termos podem variar por módulo: no cartão o «estorno» pode surgir como crédito **na fatura**, e não depósito no banco. Ações são exibidas **conforme o estado**, nunca com resultado silencioso.

## Regras específicas — IDs

- **RN-080** Ação de reversão (`reversal_event`) referencia o evento original, com tipo, valor, conta/cartão de destino, data efetiva ou prevista e motivo opcional.
- **RN-081** Estorno recebido constitui novo movimento de caixa na data recebida; não altera a data nem remove a compra original. Estorno futuro esperado não afeta caixa efetivo.
- **RN-082** Se compra foi cancelada **antes de pagamento**, cancelar apenas a obrigação válida (sem crédito fictício). Se houve pagamento, a dispensa de obrigação e a restituição são passos diferentes.
- **RN-083** Reembolso parcial respeita `0 < valor <= valor_elegivel_na_operacao - (reembolsos_efetivados + reembolsos_pendentes_confirmados)`, salvo correção auditada; operação pode ter vários reembolsos parciais.
- **RN-084** Estorno de cartão pode ser crédito na fatura ou reversão do passivo. Não incluir como receita recebida em conta bancária antes de existir liquidação bancária real.
- **RN-085** Venda cancelada que havia gerado receita paga cria **devolução ao comprador**; se apenas receberia no futuro, cancelar recebível sem saída financeira inventada.
- **RN-086** Devolução de item pode gerar movimento reverso de estoque; seu valor e condição devem ser confirmados. Estorno financeiro não gera automaticamente retorno físico de item.
- **RN-087** Operações de reversão são idempotentes por ID/identificador de solicitação; repetir clique/import não gera dois estornos. Histórico registra vínculos e diferenças.
- **RN-088** Reverter uma reversão exige evento compensatório ou correção auditada; não apagar um estorno real apenas para «fazer fechar» saldo.
- **RN-089** Recalcular apenas contas, obrigações, reservas, projetos e datas impactados, mantendo baseline comparável e consistência transacional.
- **RN-090** Duplicidade não se presume por data, valor e descrição parecidos: «LETREIRO» e «ZOKI» em 13/08 com R$ 120 são **vendas distintas**, mesmo que compartilhem valor/data.

## Cenários de exemplo

### Compra de R$ 169 — realizada e estornada depois

20/08: pagamento −R$169 no banco. 25/08: reembolso +R$169 no banco. Resultado líquido da dupla = R$0, mas cada data preserva sua variação; gastos brutos e devoluções podem ser vistos separadamente, e relatório líquido não chama reembolso de nova renda.

### Compra cancelada com reembolso pendente

20/08: pagou R$169. 22/08: compra cancelada, reembolso de R$169 devido e **a receber**. Até receber, caixa ainda −R$169; quando confirmar o crédito efetivo, caixa aumenta na data confirmada.

### Reembolso de compra parcelada no cartão

Compra gerou obrigação/fatura. Cancelar parcelas ainda exigíveis requer evento confirmado do contrato; parcelas pagas podem originar crédito no cartão ou depósito, dependendo do meio. Não creditar dinheiro no banco apenas por «cancelar a compra».

### Ajustes de saldo da planilha

A linha `correção` pode ser conciliação de saldo, não renda econômica. Na importação, manter como **ajuste a classificar** até o usuário confirmar o significado. Não esconder erros inserindo receitas artificiais.

## Controles de UX e segurança

- Confirmação de efeitos para cancelamento de série/financiamento e estorno expressivo; mostrar «o que mudará» e «o que permanecerá».
- Data do fato, data da ação e data da liquidação não são intercambiáveis.
- Não oferecer «cancelar contrato» como promessa de cancelamento junto ao fornecedor: o aplicativo **não comunica** com instituições.
- Eventos financeiros materializados e revisões ficam auditáveis mesmo quando ocultos em filtro de «ativos».
