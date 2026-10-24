# 05 — Interfaces, UI e telas

## Filosofia de UX

**Olhar, entender, registrar.** Pouquíssimas ações para o dia a dia; aprofundamento sob demanda. Valores importantes jamais sem indicação de origem, período, moeda e se são reais ou estimados. Data/valor sensíveis fáceis de corrigir. Definir área de toque confortável, acessibilidade e contraste.

## Navegação principal

Barra inferior com quatro destinos: **Início**, **Planejamento**, **Movimentações** e **Patrimônio**; “+ Registrar” como ação primária persistente. Relatórios e Configurações acessíveis pela tela inicial/menu secundário, sem aumentar a navegação principal.

## Mapa de telas

| ID | Tela | Objetivo | Elementos | Ações |
|---|---|---|---|---|
| T-00 | Primeiro uso | Criar cofre, nome, senha, segredo de recuperação; ativar biometria | checklist e confirmação da capacidade de restore | criar, testar segredo |
| T-01 | Desbloqueio | Usuário + senha ou biometria | estado bloqueado, falhas sem vazar motivo | desbloquear |
| T-02 | Início | Quanto posso gastar agora? | gasto seguro, horizonte, saldo da conta de uso, reservas fora do gasto, próximos eventos, mini relatórios | registrar, ver cálculo |
| T-03 | Registro universal | Criar/editar operação | descrição, valor, datas, pagamento, tipo; quantidade, unidade, rendimento, conta e projeto em detalhes | salvar, duplicar, anular |
| T-04 | Linha do tempo | Saldo passado/presente/futuro | mês atual **e próximo em sequência** por padrão; abertura + entradas − saídas = fechamento transmitido; mínimo diário, negativos, confiança | abrir mês/dia, cenário |
| T-05 | Contas e reservas | Onde está o dinheiro? | contas reais, envelopes virtuais, liquidez, movimentações | transferir, alocar, liberar |
| T-06 | Orçamento | Planejado x realizado | categorias, desvio e comparação histórica | revisar previsão |
| T-07 | Cartões/parcelas | Faturas e obrigações | limites, parcelas, vencimentos, pagamentos | registrar parcial, antecipar |
| T-08 | Projetos e itens | Custos e retorno por setor | produto, quantidade, preço/kg, consumo, perdas, custo por uso | compra/consumo |
| T-09 | Investimentos/patrimônio | Evolução e fontes de retorno | aportes, preço médio, dividendos, valor de mercado, dívidas | lançamento de evento |
| T-10 | Relatórios | Mini análises | comparativo mensal, saldo mínimo, evolução do patrimônio, top desvios | filtro e detalhe |
| T-11 | Agenda/pendências | Revisar lançamentos não confirmados | recorrências, atrasos e estimativas vencidas | confirmar, editar, adiar |
| T-12 | Segurança/backup | Preferências e recuperação | senha, biometria, bloqueio, exportar, importar, testar backup | proteger/restaurar |

## Wireframe 1 — Início

```text
┌────────────────────────────────────┐
│ Meu Financeiro            [alertas] │
│                                    │
│ VOCÊ PODE GASTAR                  │
│ R$ 1.240,00                        │
│ até o próximo salário  [ver cálculo]│
│                                    │
│ Banco de uso diário      R$ 3.500  │
│ Obrigações + margem     -R$ 2.260  │
│ Reservas protegidas      não usadas│
│                                    │
│ [Mês: -R$ 36 vs plano] [Ativos ↑] │
│                                    │
│ Próximos eventos                   │
│ 05/11 salário  +R$ 4.000 (prev.)   │
│ 08/11 fatura     R$ 780 (devido)   │
│                                    │
│        [+ Registrar]               │
│ Início | Futuro | Registros | Bens │
└────────────────────────────────────┘
```

**Cálculo explicável:** tocar em “ver cálculo” abre contas elegíveis, envelopes excluídos, datas, despesas confirmadas, custos estimados, menor saldo do intervalo, cenário conservador/esperado. Não usar vermelho/verde como único sinal.

## Wireframe 2 — Registro universal

```text
┌────────────────────────────────────┐
│ ← Novo registro           [modelo]  │
│ [Despesa] [Receita] [Transferir]    │
│ Descrição:  Carne                  │
│ Total:      R$ 58,00               │
│ Data compra:       Hoje            │
│ [Pago agora ✓]  Data pgto: Hoje    │
│                                    │
│ [▸ Mais detalhes]                  │
│   2 kg  x R$ 29/kg                 │
│   Conta: banco principal           │
│   Projeto: Alimentação             │
│   [Parcelas] [Recorrência]         │
│                                    │
│ [Salvar]          [Salvar + novo]  │
└────────────────────────────────────┘
```

**Padrões:** data de operação = hoje; pagamento = hoje se status “pago agora”; quantidade = 1; conta e categoria sugeridas por modelo/histórico; último preço apenas sugestão visível. Editar um registro usa a **mesma tela**, carregando seus dados — não sobrescrever valores ao abrir. Mudança de data não deve substituir uma data de pagamento que o usuário editou manualmente. Campos personalizados vêm de tipos permitidos e não executam scripts.

**Natureza da informação:** controle “Expectativa / Compromisso confirmado / Realizado” + situação “Pendente / Parcial / Pago”; separar mesmo que a UI compacta mostre apenas os controles relevantes ao tipo.

**Investimento:** preço/cota, quantidade, custo total; provento previsto **por cota e por periodicidade**, data e origem da estimativa; separar realizado. **Alimento:** preço/kg, peso, rendimento aproveitável, perda; custo unitário e métrica com unidade correta.

## Wireframe 3 — Linha do tempo mensal

```text
NOVEMBRO 2026  [Previsto x atual]    │
Veio de outubro       R$ 1.700       │
Entradas             +R$ 4.000       │
Saídas               -R$ 3.600       │
─────────────────────────────────────│
Passa para dezembro   R$ 2.100       │
Menor saldo diário      R$ 210       │
─────────────────────────────────────│
DEZEMBRO 2026                      ! │
Veio de novembro      R$ 2.100       │
Resultado             -R$ 2.400      │
Passa para janeiro    -R$ 300       │
Primeira insuficiência: 12/dez       │
```

Mostrar faixa temporal passada/hoje/futura, detalhe por dia, datas de pagamentos e incerteza da previsão. Realizado e previsto não podem ser indistinguíveis no gráfico.

## Wireframe 4 — Contas e reservas

```text
Dinheiro onde está                      
Banco disponível            R$ 3.500    
Dinheiro físico              R$ 1.000   
Corretora                  R$ 10.000    

Finalidade do dinheiro                 
Reserva emergência        R$ 10.000    
Manutenção                   R$ 900    
Livre p/ gasto             (calculado) 
[Transferir] [Destinar à reserva]       
```

Explicar que “Reserva” pode estar dentro de uma conta real já contada; evitar totalizações com dupla contagem.

## Wireframe 5 — Mini relatórios

```text
Planejado vs realizado: Alimentação
R$ 600 planejados → R$ 636 realizados
+R$ 36 (+6%)                    [ver]

Patrimônio líquido:        R$ 24.500
Aportes   +R$ 500 | Retornos  +R$ 50

Projeção: 90 dias
Primeiro dia negativo: 12/dez [abrir]
```

## Fluxos de uso prioritários

**Cadastro rápido:** abrir biometria → “+” → escolher tipo (último pré-selecionado) → valor + descrição → confirmar. Campos complementares apenas se contexto exigir; não travar usuário para capturar informação opcional que ainda não sabe.

**Retroativo:** Registros → novo/editar → data passada + data paga passada → salvar → modal curto “saldos de set/out/nov alterados”; visão mensal recalculada. Audit trail acessível nos detalhes.

**Previsão futura:** Futuro → adicionar → expectativa, valor, data, conta esperada → salvar; não alterar saldo atual. Na realização, usar “Confirmar e ajustar”; previsão vinculada e diferença preservada.

**Manutenção:** criar regra “6 meses após execução”; quando executada, registrar custo e data reais; próximo vencimento calculado dessa data.

**Backup:** Configurações → Exportar → autenticação reforçada → senha de recuperação → criptografar → compartilhar arquivo; Restaurar → selecionar → validar → prévia → autenticar → restaurar atomicamente → abrir.

## Regras visuais

Valores negativos usam sinal `−`, texto explicativo e marcador, sem depender apenas da cor. Valores estimados exibem `previsto` e um horizonte. Ao editar, sinalizar alterações não salvas. Nunca lançar diálogo invasivo para cada compra corriqueira; pedir confirmação reforçada apenas para ações destrutivas, reserva protegida, restore, alteração de segurança e exportação.

## Protótipo

`prototipo/index.html` é apenas um **mock demonstrativo**, offline, com dados fictícios e navegação entre telas; não é aplicativo funcional nem implementa login, banco, criptografia ou cálculos de produção.


## Aditivo v2 — navegação e ações contextuais

**Prioridade de leitura:** a tela inicial apresenta por padrão **atual + próximo mês**, além do dinheiro livre; Movimentações inicia no **mês atual**, com eventos em lista cronológica por dia/hora conhecida, incluindo previstos, realizados e compromissos. Os detalhes abrem «Editar», «Registrar pagamento», «Adiar», «Estornar/reembolsar», «Cancelar», «Duplicar», «Ver histórico» conforme estado; não expor ação ilegal/inaplicável.

**Formulário:** único para criar e editar; data de compra e pagamento = hoje **somente na criação e no caso pago agora**; quantidade padrão 1; valor, quantidade e unidade podem calcular subtotal; campo «Repetir» expande periodicidade, término e condicional; campo «Mais» disponibiliza projeto, conta, cartão, produto, rentabilidade e personalização. Não ocultar diferença entre «previsto» e «realizado».

**Ação sobre série:** tela curta para escolher alcance «esta», «esta e próximas», «todas pendentes», «regra inteira»; prévia mostra o que será cancelado, o que permanece e se envolve obrigações reais. Ao cancelar financiamento, esclarecer que o app não age sobre credor.

**Reembolso:** total/parcial (com limite validado), «já recebido / a receber», data efetiva/prevista, cartão/conta destino, vínculo com original. Apenas o «já recebido» confirmado afeta caixa efetivo.

**Não inventar hora:** campos de hora podem ser ocultos por padrão, mas devem ser editáveis quando úteis. Se registro importado não tiver hora, mostrar só data.

Wireframes textuais detalhados e testes de UX estão em [13](13-movimentacoes-e-lista.md), [14](14-acoes-estornos-cancelamentos.md) e [15](15-recorrencias-condicionais-series.md).
