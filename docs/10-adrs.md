# 10 — Registros de decisões arquiteturais (ADRs)

| ID | Decisão | Estado | Justificativa / observações |
|---|---|---|---|
| ADR-001 | Monólito modular, somente local | Aceita | Zero backend/API; organização por responsabilidade |
| ADR-002 | React Native + Expo + TypeScript | Proposta | Validar builds nativos, criptografia e desempenho em Android real |
| ADR-003 | SQLite + SQLCipher fail-closed | Aceita como requisito | `cipher_version` + teste binário; nunca fallback plaintext |
| ADR-004 | Usuário local único na v1, com nome/senha e biometria opcional | Aceita | Nome identifica; segurança vem das chaves reais |
| ADR-005 | DEK aleatória com envelopamento por senha e meio biométrico nativo | Proposta de desenho | POC necessária; compatibilidade de bridge/Keystore e troca de aparelho |
| ADR-006 | Backup cifrado independente do dispositivo | Aceita | Recuperação em novo aparelho sem chaves originais |
| ADR-007 | Lançamentos como fonte da verdade, projeções derivadas | Aceita | Histórico corrigível e determinismo |
| ADR-008 | Dinheiro inteiro + medidas decimais exatas | Aceita | Evitar imprecisão binária e rateios incorretos |
| ADR-009 | Orçamentos e reservas não geram caixa automaticamente | Aceita | Evitar dupla contagem |
| ADR-010 | Projeção diária, visualização mensal | Aceita | Detectar saldos negativos intermediários |
| ADR-011 | Não usar IA para cálculo/autorização | Aceita | Cálculo determinístico; IA opcional apenas para sugestão |
| ADR-012 | Proteção visual da tela no background e sessão expirada | Proposta | Avaliar comportamentos Android/iOS reais e preferência do usuário |

## Pontos abertos legítimos

1. **Alvo inicial:** Android primeiro, iOS depois, ou suporte conjunto? Decisão sugerida: Android primeiro, mantendo interfaces de plataforma isoladas.
2. **KDF e biblioteca de criptografia backup:** Argon2id/scrypt com biblioteca nativa auditada; precisa de teste de compatibilidade e desempenho antes da implementação.
3. **Autenticação biométrica do SO:** qual API permite recuperar uma DEK vinculada a autenticação criptográfica com o Expo atual? Se `SecureStore` não cobrir o fluxo inteiro, criar pequena integração nativa revisada; não fingir segurança.
4. **Definição de gasto seguro:** escolher horizonte inicial (até próximo salário) e margem prudencial padrão (sugestão: configurável; **não** escolher valor silenciosamente).
5. **Fontes de preço/mercado:** no MVP, cadastro manual; atualização remota exigiria outro escopo e política de privacidade.
6. **Regra de calendário em fim de mês, fins de semana e feriados:** UI deve exigir política clara ou oferecer padrão exposto, sem supor norma bancária universal.
7. **Passivos e cartão:** escolher representação de saldo e pagamento que preserve equivalência contábil sem inflar despesas; validar com testes.
8. **Valor unitário e medida de produto:** separar quantidade comprada, consumida e rendimento líquido quando aplicável.
9. **Exportação em iOS e Android:** validar sandbox, sharing e exclusão de temporários após cancelamentos.

Não converter pontos abertos em regras implícitas apenas porque uma IA sugeriu a implementação mais fácil.


## ADRs v2 — decisões aceitas

- **ADR-012 | Lista única por data/hora:** Movimentações contém estados previstos e realizados; mês atual por padrão; campos de hora opcionais, sem inventar hora para importações.
- **ADR-013 | Dashboard temporal:** mês atual e próximo sempre apresentados sequencialmente por padrão; cálculo determinístico diário com sumário mensal.
- **ADR-014 | Ações financeiras auditáveis:** estorno/reembolso/cancelamento/adiamento são eventos próprios ou revisões com causa; pagamento real nunca some por edição de série.
- **ADR-015 | Recorrência ≠ parcelamento:** séries podem terminar em data, contar ocorrências ou depender de evento/condição; exceções individuais; obrigações confirmadas têm ciclo de vida separado.
- **ADR-016 | Cancelamento em lote seguro:** escopo explícito e prévia do impacto, sem apagar histórico realizado; app não cancela contrato externo.
- **ADR-017 | Planilha como referência:** formulas/conceitos inspiram motores e casos de teste, não o layout; valores amostrais não são dados reais importados automaticamente; LETREIRO e ZOKI são operações distintas.
- **ADR-018 | No hidden time:** hora desconhecida é `NULL`; timezone de planejamento define «hoje», não a origem do timestamp de auditoria.

**Pontos a detalhar antes de implementar:** política de dia 29–31; tratamento de férias/feriados em salários; regras de exigibilidade/renegociação de contratos concretos; estratégia de preço médio e taxas em investimentos; política de backups temporários e configuração de bloqueio automático. Esses pontos não impedem entrega de tela/lista e regra básica mensal.
