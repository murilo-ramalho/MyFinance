# Changelog da especificação

## Registros locais e operações — 04/11/2026

- Aba Organizar com operações/parcelas, pagamentos parciais, faturas, estornos e reembolsos vinculados, contas, reservas, transferências, aquisições, categorias e orçamentos.
- Recorrências limitadas, exceções, alcance de alterações/cancelamentos e execução efetiva; dias inexistentes usam o último dia do mês, conforme escolha do usuário.
- Estoque com quantidade exata e custos de produção informados manualmente; investimentos e ferramentas sem duplicação de caixa. Nenhuma integração bancária.
- Agregado auditável/idempotente com persistência SQLite transacional, FKs, conflito de revisão, migração inicial e rollback.
- Modo nativo de validação com SQLCipher fail-closed, proteção de chave, senha/biometria e backup autenticado portátil; demonstração em memória isolada. CSV com prévia e validação, separado do backup.
- 133 testes locais (97 domínio/aplicação/persistência/backup/CSV e 36 interface); typecheck, lint e exportações JavaScript. POC em aparelho, APK e revisão humana continuam pendentes; ver docs/20.

## Revisão do shell — 04/11/2026

- Analisadas as três novas documentações e registrada a matriz de inconsistências/cobertura em `docs/19-revisao-consistencia.md`.
- Recálculo retroativo do caixa e das projeções, base estável na virada do mês e manutenção de pendências vencidas na projeção.
- Revisões antes/depois e idempotência no armazenamento em memória utilizado pelo app, sem persistência durável.
- Validação de moeda/estado/direção/datas, bloqueio de pagamentos futuros, preservação de datas desconhecidas e primeira insuficiência distinta do menor saldo.
- Testes ampliados de unidade, regras, armazenamento em memória e interface. SQLCipher, migrações, autenticação e backup continuam sujeitos à POC nativa.

## v2.0 — 23/10/2026

- Formalizada a lista de movimentações por data/hora e filtro padrão do mês atual.
- Início mostra mês atual e próximo consecutivamente, saldos transmitidos e negativos.
- Estornos, reembolsos integrais/parciais, recebíveis pendentes, cancelamentos e ações sobre registros existentes.
- Recorrências limitadas, condicionais, pós-execução, exceções individuais, alcance das alterações e segurança de cancelamento de financiamentos.
- Pagamento antecipado/atrasado separado do vencimento e da data econômica.
- Vendas ocasionais, custos de produção e não duplicação de caixa, exemplo da planilha e fixtures de cálculos.
- Revisão de regras, testes, AGENTS.md, UML e controles de segurança para agentes.

## v1.0 — 23/10/2026

- Especificação inicial de produto, tecnologia, arquitetura, segurança, backup, UX, testes e 8 diagramas.
