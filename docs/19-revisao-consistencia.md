# 19 — Revisão de consistência e cobertura — 04/11/2026

> Registro da primeira etapa, quando o app ainda usava somente memória. A implementação posterior, os testes atuais e os impedimentos nativos estão em [20 — Implementação dos registros locais](20-implementacao-registros-locais.md). As pendências abaixo descrevem aquela etapa e não o estado atual.

## Documentos analisados

As adições `AGENTS_Financas.md`, `Financas_Pessoais_Documentacao_Completa.md` e `Financas_Pessoais_Especificacoes_Completas.txt` reforçam o modelo local e acrescentam explicitamente o plano de aquisições sem data. Itens marcados como proposta ou decisão aberta não viraram requisitos aprovados. As diretrizes vigentes continuam em `AGENTS.md`; os arquivos adicionados foram preservados.

## Defeitos corrigidos no shell

| Evidência / regra | Comportamento corrigido | Cobertura |
|---|---|---|
| RN-040, RN-044, CT-006/007 | Novo lançamento anterior à abertura ajusta o caixa atual e os fechamentos futuros. Edição de registro que já integrava a abertura aplica apenas a diferença. Mudar data ou meio de pagamento não duplica o efeito. | `projections.test.ts`, testes de interface |
| RN-002/003 | Pagamento com data efetiva futura é recusado pelo formulário e pela aplicação. Fixtures futuras começam pendentes. A passagem dos dias não confirma pagamentos. | `movementStore.test.ts`, `projections.test.ts`, interface |
| RN-042/045/074 | Projeção e gasto seguro consideram pendências vencidas na data de referência, sem modificar a data original. Confirmar previsão substitui o movimento e conserva a revisão anterior. | domínio, armazenamento e interface |
| RN-049 | Primeira data abaixo da reserva + margem é calculada separadamente da data do menor saldo. | `projections.test.ts` |
| RN-017/070 | Domínio rejeita moeda, direção, estado, mês e datas inválidos; expectativa de caixa exige data. Desejo de compra sem data não pode entrar disfarçado de movimento. | `movements.test.ts` |
| RN-007 | Datas de anos 0001–0099 preservam quatro dígitos na leitura e no formulário. | `dates.test.ts` |
| RN-001, CT-020 | Datas desconhecidas de evento permanecem vazias ao editar; mudar o estado de pagamento preserva a data conhecida do fato econômico. | interface |
| RN-037/071, invariantes transacionais | Armazenamento usado pelo app preserva antes/depois e instante UTC; requisição repetida é idempotente, reuso conflitante é recusado. Validação falha antes de mudar registros, auditoria ou requisições. Leituras não expõem referências mutáveis. | `movementStore.test.ts` |

A abertura demonstrativa é uma **base do livro**, não um saldo bancário conciliado. Correções de registros anteriores aplicam o delta em relação aos registros que compunham essa base. Isso permite corrigir os períodos posteriores sem afirmar um saldo histórico anterior desconhecido. Os saldos digital e físico têm o mesmo tratamento. A base inicial não é recriada quando o app atravessa um mês durante a sessão.

O domínio agora orquestra a sequência de projeções mensais; a interface consome seus resultados. Valores negativos permanecem negativos. As fixtures de outubro/novembro de `18-cenarios-de-aceite.json` são lidas pelos testes, e verificações com vários valores e ordem invertida comprovam propagação exata das correções.

## Persistência: limite concreto

`MemoryMovementStore` é o armazenamento **em memória** utilizado pelo shell. Os testes verificam gravação/leitura, isolamento de cópias, revisões, idempotência, identidade e rejeição atômica de comandos inválidos. Esse armazenamento não sobrevive ao encerramento do processo. Não há banco, migração, arquivo de dados, autenticação ou backup implementado.

Não se deve chamar esses testes de integração SQLite/SQLCipher. Persistência durável continua dependente da POC nativa exigida em `06-seguranca.md`, `09-roadmap.md` e `17-ameacas-agentes-e-auditoria.md`, incluindo acesso negado sem chave e restauração em outro aparelho. Não foi acrescentada dependência nativa, SQLite sem cifra, gravação web ou mecanismo de segurança alternativo. Mudanças futuras em segurança, migrações e pagamentos exigem revisão humana.

## Lacunas funcionais e decisões pendentes

- Plano de aquisições sem data: falta entidade, lista e conversão explícita em compra. Não atribuir data automática ou afetar caixa enquanto for intenção.
- Pagamentos parciais, vencimento original/revisado, obrigações de cartão, faturas e parcelas: o shell ainda usa movimento simples; não representa esses contratos completos.
- Estornos vinculados, crédito de cartão e recebíveis de reembolso: não implementados. Não representar devolução apagando a compra.
- Séries, exceções e cancelamentos: não implementados; os cenários de três ocorrências e quatro pagas/oito canceladas continuam pendentes.
- Contas/reservas editáveis, transferências, categorias independentes de projeto, orçamentos, estoque, custo de produção e investimentos: pendentes. Fluxo de projeto continua sendo fluxo de caixa, sem alegação de lucro.
- Fórmula definitiva de gasto seguro, custeio de estoque, políticas de calendário e desenho criptográfico continuam sujeitos às decisões abertas dos novos documentos.

## Verificação e limites

Executar em `mobile/`: `npm test`, `npm run typecheck`, `npm run bundle:android` e `npm run bundle:web`. O projeto não possui script/configuração de lint. Exportar bundle Android não produz APK nem comprova SQLCipher ou execução em aparelho. Os fluxos Maestro e os testes de segurança precisam de ambiente Android nativo; não há `adb`, `maestro` ou `java` disponível nesta sessão.

Resultados desta revisão: 48 testes de unidade/regras/armazenamento em memória e 24 testes de interface aprovados; typecheck e exportações Android (bytecode Hermes) e web aprovados; diff sem erros de whitespace. O compilador Hermes precisou executar fora do sandbox após `spawn EPERM`; a exportação web também concluiu fora do sandbox. Permanece o aviso existente de depreciação de `SafeAreaView`; nenhuma dependência foi alterada para suprimi-lo.
