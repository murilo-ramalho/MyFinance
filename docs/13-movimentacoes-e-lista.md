# 13 — Movimentações, datas e lista cronológica (v2)

## Decisão de produto

O registro é **simples**; as visualizações são derivadas dos mesmos dados. A planilha real orienta campos e visões, mas não será replicada como cinco fontes de lançamentos. A lista de movimentações é uma tela de primeira classe, acessível diretamente na barra principal. Cartão, projeto e tipo de dinheiro são recortes do mesmo movimento. A tela inicial apresenta por padrão o **mês civil atual seguido do próximo**, em sequência; navegação permite meses passados e futuros.

## Tela «Movimentações» — contrato de UX

- **Filtro inicial:** mês atual no fuso de planejamento do perfil, **todas as situações** (realizadas, pendentes confirmadas e previstas). A preferência de outras filtragens pode ser guardada explicitamente, sem remover o botão **Restaurar padrão**.
- **Ordenação inicial:** cronologia do acontecimento exibido, por data/hora efetiva quando existente; em compromisso futuro sem pagamento, por vencimento; em expectativa, por data estimada. Permitir alternar **mais recente primeiro** e **mais antigo primeiro**.
- **Hora opcional:** exibir `23/10 14:35` quando conhecida; exibir só `23/10` quando desconhecida. Em importação de planilha sem horário, **nunca fabricar `00:00` como fato observado**.
- **Linhas:** título, sinal/valor, natureza (`expectativa`, `contratado`, `realizado`), situação (`pendente`, `parcial`, `liquidado`, `cancelado` etc.), conta, cartão ou projeto quando pertinente, vínculo com parcela/série/estorno. Distinguir **movimento de caixa** de **fato econômico**.
- **Filtros avançados:** mês/intervalo, tipo de movimento, situação, conta, cartão, categoria, projeto, fonte e classe de eventos. Busca por título e descrição. Atalho «Novo registro» persistente.
- **Detalhes:** tocar numa linha abre a operação com histórico e **ações válidas para seu estado**. Selecionar «Editar» abre **exatamente o mesmo formulário** usado para criar, preenchido com o conteúdo persistido; padrões de «hoje» não se sobrepõem aos valores existentes.
- **Séries:** ocorrências virtuais futuras aparecem na lista com identificação de projeção, sem exigir criar milhares de registros materiais. Eventos de reversão têm vínculo explícito com o original; filtros de «líquido» e «eventos brutos» evitam esconder a história.

## Tempos distintos

| Campo lógico | Significado | Exemplo |
|---|---|---|
| `occurred_on` | data do evento econômico / compra | 10/10 |
| `occurred_time_local?` | hora do evento, se conhecida | 14:35, ou `NULL` |
| `due_on` | vencimento original | 10/11 |
| `planned_settlement_on` | nova previsão de liquidação (pode mudar) | 10/12 |
| `settled_on` por liquidação | pagamento/recebimento efetivo | 28/10 |
| `settled_time_local?` | hora do pagamento, se conhecida | 09:12 ou `NULL` |
| `recorded_at` | quando foi incluído no app (UTC) | 23/10 17:35Z |
| `updated_at` e revisões | quando/corretamente o registro foi alterado | auditoria |

As datas civis permanecem independentes do timezone de auditoria; o fuso configurado interpreta «hoje» e a virada do mês. A importação preserva a precisão originalmente conhecida (só data ou data e hora). Ordenação estável para horários ausentes usa prioridade definida e ID, **sem fingir a hora da transação**.

## Três projeções por competência distinta

- **Caixa:** utiliza liquidações reais; no futuro, utiliza compromissos não pagos e estimativas não duplicadas, por suas datas previstas de pagamento. Antecipações e atrasos mudam a curva de caixa na data correta.
- **Resultado/competência:** data econômica de compra, venda, consumo, prestação de serviço e perdas; usa custos de produção sem criar nova saída bancária.
- **Patrimônio:** ativos e passivos, transferências, valorização e obrigações; não equivale a disponível diário.

## Visão mensal padrão

- Abertura herdada do mês anterior; entradas/saídas de caixa do mês; **resultado do mês**; **fechamento transmitido** ao próximo; menor saldo diário e primeira insuficiência; total em contas selecionadas e livre para gastar **separadamente**. Para movimentos sem hora, agregar cada data civil antes de calcular o mínimo; não inferir uma sequência dentro do dia por ID ou ordem de lista.
- O cartão do mês atual combina pagamentos já liquidados e previsões futuras remanescentes, **com separação visual**. O próximo mês é projetado.
- Não truncar valores negativos; mudanças retroativas propagam ao período e às projeções seguintes. Preservar baseline para mostrar «planejado quando foi criado» × «revisado hoje» × «realizado».

## Cenário de aceite

Em 23/10/2026, ao abrir Movimentações pela primeira vez, o filtro é **outubro/2026**, todas as situações. Uma compra importada de 08/08/2026 sem hora aparece em agosto sem hora inventada. Uma despesa de novembro ainda não confirmada aparece como **prevista**, e não como gasto bancário já pago. Uma parcela vencida em 10/11 mas paga em 28/10 afeta caixa em outubro e mantém o vencimento original em seus detalhes.

## Cobertura atual — 04/11/2026

Movimentações permite navegar por mês, buscar, filtrar situação/tipo e alternar ordem cronológica. Início conserva mês atual + próximo. Meses passados com abertura conhecida mostram somente caixa efetivo; anteriores à base mostram a lista sem saldo inventado. Correções retroativas propagam pelos períodos seguintes. Vencimento original e data do fato ficam preservados quando a liquidação aparece pela data efetiva.

O mesmo formulário cria/edita lançamentos simples, sem sobrescrever campos carregados com defaults. Operações compostas abrem os detalhes de parcelas, pagamentos, reagendamento, correções e reembolsos vinculados. Essas ações registram o que o usuário informa, sem executar transações externas.

Visões reúne cartão, projeto e tipos de dinheiro. Projeto organiza o mesmo fluxo, sem duplicá-lo. Organizar acrescenta faturas, contas/reservas, aquisições, séries, categorias/orçamentos, estoque, custos/resultados, investimentos, ferramentas, caixa diário e histórico. Fluxo de caixa e resultado produtivo são indicadores separados: o custo tido é informado pelo usuário e não cria outra saída bancária.

Na demonstração, registros/histórico ficam na memória. No modo nativo de validação, `FinanceStore` grava pelo repositório SQLCipher em transação antes de publicar o estado. Navegador não oferece persistência financeira. A POC física e a revisão humana continuam pendentes; usar dados fictícios. Ver [20 — Implementação dos registros locais](20-implementacao-registros-locais.md).

## Tela inicial simplificada

O Início apresenta primeiro o resumo do mês atual e, em seguida, o próximo mês. O resumo atual mostra saldo herdado, receita e despesa, cada uma dividida em realizadas, compromissos e previsões, e o fechamento; o fechamento atual já representa a abertura do mês seguinte. O menor saldo diário permanece disponível na tela Movimentações. A faixa anual identifica explicitamente a projeção e mantém o disponível seguro como indicador separado.
