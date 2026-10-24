# 12 — Diagramas UML e mapa de leitura

Os arquivos na pasta `diagramas/` estão em **PlantUML (`.puml`)**, editáveis e renderizáveis em extensão PlantUML do VS Code, CLI PlantUML ou outro renderizador compatível.

| Diagrama | Arquivo | Objetivo |
|---|---|---|
| Casos de uso | `01-casos-de-uso.puml` | Atores e funcionalidades, inclusive serviços locais do aparelho |
| Componentes | `02-componentes.puml` | Arquitetura em módulos e dependências |
| Classes de domínio | `03-classes-dominio.puml` | Entidades centrais, associações e distinções de datas/estados |
| Sequência de edição | `04-sequencia-edicao-retroativa.puml` | Salvar edição e invalidar projeções sem perder auditoria |
| Sequência de autenticação | `05-sequencia-desbloqueio.puml` | Senha/biometria, chave, fail-closed, SQLCipher |
| Atividade de backup | `06-atividade-restauracao.puml` | Validar e restaurar com rollback |
| Estado de recorrência | `07-estados-recorrencia.puml` | Ocorrência futura, vencida, executada e reprogramação |
| Sequência de compra cartão | `08-sequencia-cartao.puml` | Fato econômico, obrigação, caixa e não duplicação |

Diagramas são especificações, não evidência de testes. Ajustar o código apenas após alinhar invariantes e atualizar diagramas afetados.


## Diagramas acrescentados na versão 2

- [09-casos-de-uso-v2.puml](../diagramas/09-casos-de-uso-v2.puml): listagem cronológica, estorno, ações e séries.
- [10-classes-series-e-reversoes.puml](../diagramas/10-classes-series-e-reversoes.puml): relações conceituais; não fixam estrutura SQL.
- [11-sequencia-estorno.puml](../diagramas/11-sequencia-estorno.puml): compra paga, reembolso confirmado, impacto por data.
- [12-atividade-cancelar-serie.puml](../diagramas/12-atividade-cancelar-serie.puml): escopo, confirmação, preservação de liquidações.
- [13-estados-ocorrencia.puml](../diagramas/13-estados-ocorrencia.puml): estados da previsão/ocorrência sem confundir dívida.
- [14-sequencia-pagamento-antecipado.puml](../diagramas/14-sequencia-pagamento-antecipado.puml): vencimento versus liquidação.
- [15-fluxo-telas.puml](../diagramas/15-fluxo-telas.puml): mapa de navegação.

Os diagramas v1 permanecem para dar contexto e são complementados (não substituídos) pelos v2.
