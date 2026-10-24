# 01 — Visão, requisitos e escopo

## Problema
Aplicativos convencionais mostram saldo e despesas passadas, mas podem ocultar compromissos futuros, saldos negativos intermediários, ativos ilíquidos, dinheiro reservado e divergências de expectativa. Lançamentos complexos também desestimulam o registro.

## Objetivo
Responder em até poucos segundos: **“Quanto posso gastar agora, sem mexer nas reservas e sem comprometer pagamentos futuros?”**, oferecendo transparência sobre cálculo e incerteza. É um indicador informativo, não uma garantia financeira.

## Público e plataformas
Usuário único, finanças pessoais; Android como alvo inicial sugerido, iOS na evolução, desde que a segurança nativa seja validada em ambas as plataformas. Idioma pt-BR, moeda padrão BRL; modelagem permite moeda explícita e evita somar moedas distintas sem conversão.

## Requisitos funcionais

| ID | Capacidade | Prioridade |
|---|---|---|
| RF-01 | Login por nome e senha locais; desbloqueio biométrico opcional | MVP |
| RF-02 | Contas reais, dinheiro físico, corretoras e reservas lógicas | MVP |
| RF-03 | Registrar, consultar, editar, anular, categorizar movimentos | MVP |
| RF-04 | Operação com data de fato, vencimento e pagamento separados | MVP |
| RF-05 | Planejado, confirmado, pago e recebimento distinguíveis | MVP |
| RF-06 | Lançamentos passados e futuros; recálculo e auditoria | MVP |
| RF-07 | Receitas e despesas recorrentes por calendário | MVP |
| RF-08 | Ciclos relativos à última execução, inclusive atrasos | MVP |
| RF-09 | Faturas, parcelas, compromissos e transferências | MVP |
| RF-10 | Saldos diários, fechamento mensal e passagem ao mês seguinte | MVP |
| RF-11 | Indicador de gasto seguro e menor saldo projetado no horizonte | MVP |
| RF-12 | Orçamentos com planejado × realizado e desvio | MVP |
| RF-13 | Mini relatórios de gastos, saldo, previsões e patrimônio | MVP |
| RF-14 | Banco criptografado, backup exportável e restauração verificável | MVP |
| RF-15 | Modelos de formulário e preenchimento inteligente local | MVP |
| RF-16 | Projetos/setores e rateio dos lançamentos | P2 |
| RF-17 | Compras com itens, medidas, preços unitários, perdas e estoque | P2 |
| RF-18 | Ativos, quantidade, dividendos, retornos e patrimônio | P2 |
| RF-19 | Importar CSV/OFX com detecção de duplicatas | P2 |
| RF-20 | Favoritos, widgets, lembretes e notificações configuráveis | P2 |
| RF-21 | Importação assistida por foto, voz ou IA, sempre com confirmação | Futuro |

## Requisitos não funcionais

- RNF-01 **Offline por padrão:** nenhuma conexão de rede é necessária para login, registro, projeções, relatórios ou restauração local.
- RNF-02 **Privacidade:** dados permanecem no dispositivo, exceto exportações iniciadas pelo usuário.
- RNF-03 **Integridade:** uma operação composta ou termina integralmente ou não altera o estado.
- RNF-04 **Auditabilidade:** diferenciar “quando ocorreu”, “quando foi informado”, “quando foi corrigido” e “qual era a previsão original”.
- RNF-05 **Usabilidade:** formulário padrão curto; os detalhes dependem do tipo e preferências; nunca esconder efeito financeiro importante.
- RNF-06 **Recuperabilidade:** recuperação em novo aparelho com arquivo e segredo de recuperação, sem depender do aparelho original.
- RNF-07 **Segurança por falha:** sem SQLCipher funcional, sem chave válida ou com backup inválido, o app nega acesso à operação sensível.
- RNF-08 **Determinismo:** mesmo estado + mesmas regras + mesmo horizonte de tempo ⇒ mesma projeção.
- RNF-09 **Acessibilidade:** contraste, leitores de tela, fontes escaláveis, identificação textual dos alertas e números com formato local.
- RNF-10 **Manutenibilidade:** módulos coesos, contratos quando houver necessidade, migrações e testes no mesmo incremento.

## Histórias principais

- HU-01: Como usuário, quero abrir o app e ver gasto seguro até o próximo salário, sem usar minha reserva.
- HU-02: Quero planejar R$ 600 em alimentação e depois registrar R$ 636, enxergando +R$ 36 de desvio e o efeito futuro.
- HU-03: Quero criar manutenção “a cada seis meses desde a última execução”; atraso desloca a próxima data.
- HU-04: Quero adicionar hoje uma compra paga três meses atrás, corrigindo automaticamente saldos históricos e futuros.
- HU-05: Quero visualizar mês anterior + resultado do mês = saldo que passa ao próximo, inclusive se negativo.
- HU-06: Quero separar reserva, dinheiro físico, banco e investimentos sem duplicar patrimônio.
- HU-07: Quero editar pelo mesmo formulário, com datas preenchidas inicialmente com hoje, e campos extras por modelo.
- HU-08: Quero restaurar tudo em outro celular por backup criptografado e senha independente do aparelho.

## Fora de escopo v1

Sem PSD2/Open Finance, movimentação bancária real, execução de ordens, conta compartilhada, sincronização em nuvem automática, multi-moeda com câmbio histórico, OCR/IA obrigatória, serviços remotos ou tentativa de prever retornos futuros como garantidos.

## Glossário resumido

**Fato econômico:** transação incorrida; **fluxo de caixa:** entrada/saída efetiva de recursos; **compromisso:** obrigação contratual; **previsão:** ocorrência hipotética gerada de regra ou intenção; **realização:** evento efetivamente ocorrido; **reserva:** destinação lógica de saldo; **projeção:** cálculo derivado; **snapshot de previsão:** registro do que se acreditava em uma data; **divergência:** realizado menos previsto.


## Aditivo v2 — decisões ratificadas em 23/10/2026

- O formulário único cria **e edita** lançamentos passados, presentes, futuros, reais, previstos e contratados; datas da operação, vencimento e liquidação são independentes; «hoje» só é valor padrão para novos registros.
- A tela **Movimentações** tem filtro inicial de **mês atual**, todas as situações e sequência de data/hora quando conhecida. Detalhes abrem ações contextuais (estornar, receber, cancelar, adiar, duplicar, editar, histórico).
- A tela **Início** apresenta por padrão os cartões de **mês atual + mês seguinte em sequência**, além do disponível seguro e alertas. Histórico mensal com passagem de saldo e mínimo diário.
- Ações sobre série de recorrências permitem «somente esta», «esta e próximas», «todas pendentes» e «regra inteira». Nunca tratam previsão, dívida e pagamento como o mesmo estado.
- Receitas esporádicas, venda produtiva, reembolso e ajuste de conciliação têm classificações distintas. A planilha é amostra de regras, não modelo obrigatório de telas.
- Ver detalhamento obrigatório em [Movimentações](13-movimentacoes-e-lista.md), [Ações](14-acoes-estornos-cancelamentos.md), [Séries](15-recorrencias-condicionais-series.md), [Exemplos](16-exemplos-planilha-e-calculos.md) e [Segurança de agentes](17-ameacas-agentes-e-auditoria.md).
