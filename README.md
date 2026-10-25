# myFinance — Gestão financeira pessoal local (v2.0)

> **Documentação:** 23/10/2026. **Estado:** app Android de teste em início, usando somente dados fictícios em memória. Não usar dados financeiros reais; persistência segura e POC nativa ainda não foram validadas.

**Objetivo:** saber quanto pode realmente gastar, isolando reservas e investimentos, mantendo previsão de custos/receitas, saldos diários e mensais, patrimônio e custos/rendimentos por projeto. Aplicativo mobile **offline-first**, **sem backend/API**, monólito modular em camadas sem rigidez excessiva, SQLite com SQLCipher e backup criptografado portátil.

## Decisões de produto v2

1. **Início:** por padrão apresenta mês **atual e próximo** em sequência: saldo herdado + entradas − saídas = saldo transmitido, menor saldo diário, e indicador «disponível seguro» separado.
2. **Movimentações:** lista cronológica com filtro inicial **mês atual**, incluindo realizadas, compromissos e previsões, hora opcional e identificação do estado. Toque abre detalhes e ações.
3. **Registro único:** o mesmo formulário cria/edita passado, presente ou futuro, com defaults sensatos só na criação, pagamento e data de compra independentes, campos e modelos personalizáveis.
4. **Retroatividade:** corrigir registros antigos atualiza saldos passados até hoje e projeções futuras, inclusive negativos, conservando trilha de alterações.
5. **Ações:** pagamento parcial/antecipado/atrasado, estorno/reembolso total ou parcial, reembolso a receber, adiar, dispensar obrigação e cancelar previsão. Fato original pago não desaparece.
6. **Séries de recorrência:** calendário limitado (ex.: dia 2 até jan/2027), quantidade, indefinido, intervalo desde execução/condição, ocorrência excepcional e alterações «esta», «esta e próximas», «todas pendentes» ou «regra inteira»; preservar pagamentos anteriores.
7. **Projetos e renda:** receita esporádica, impressão 3D, custo produtivo sem novo pagamento, estoque, preço/kg, ferramentas, investimentos, rentabilidade e relatórios curtos. A planilha é amostra de regras, não layout obrigatório.
8. **Segurança:** nome/senha local ou biometria ligada à chave criptográfica; SQLCipher verificado em build nativo; backup portátil cifrado; segurança de agentes auditada.

## Documentos

| ID | Arquivo | Assunto |
|---|---|---|
| 01 | [Visão e escopo](docs/01-visao-e-escopo.md) | requisitos |
| 02 | [Regras de negócio](docs/02-regras-de-negocio.md) | invariantes RN-001–RN-110 |
| 03 | [Dados](docs/03-modelo-de-dados.md) | modelo lógico |
| 04 | [Arquitetura](docs/04-arquitetura-e-tecnologias.md) | tecnologias e organização |
| 05 | [Telas e UX](docs/05-interfaces-e-ux.md) | interface simplificada |
| 06 | [Segurança](docs/06-seguranca.md) | criptografia, autenticação, ameaças |
| 07 | [Backup](docs/07-backup-e-intercambio.md) | importação/restauração |
| 08 | [Testes](docs/08-testes-e-aceite.md) | CT-001–CT-050 |
| 09 | [Roadmap](docs/09-roadmap.md) | implementação incremental |
| 10 | [ADRs](docs/10-adrs.md) | decisões e pontos abertos |
| 11 | [Referências](docs/11-referencias.md) | fontes oficiais |
| 12 | [UML](docs/12-diagramas.md) | índice dos 15 diagramas PlantUML |
| 13 | [Lista de movimentações](docs/13-movimentacoes-e-lista.md) | datas, horas, filtros, fechamento |
| 14 | [Estornos e cancelamentos](docs/14-acoes-estornos-cancelamentos.md) | ações e reversões |
| 15 | [Recorrências e séries](docs/15-recorrencias-condicionais-series.md) | regra e exceções |
| 16 | [Exemplos da planilha](docs/16-exemplos-planilha-e-calculos.md) | cálculos e interpretação |
| 17 | [Ameaças em desenvolvimento com IA](docs/17-ameacas-agentes-e-auditoria.md) | auditoria para agentes |
| 18 | [Fixtures JSON](docs/18-cenarios-de-aceite.json) | exemplos matemáticos testáveis |

Também incluídos: [AGENTS.md](AGENTS.md), [CHANGELOG.md](CHANGELOG.md), `diagramas/*.puml`, [protótipo HTML](prototipo/index.html) e `ESPECIFICACAO_COMPLETA.md`.

## Invariantes de maior risco

- Reserva não é dinheiro novo; transferência não é receita ou despesa.
- Compra no cartão, obrigação, pagamento e fatura não devem gerar despesa bancária duplicada.
- Custo de filamento **consumido** não cria outra saída de caixa se foi adquirido antes.
- Pular uma compra **voluntária** não equivale a perdoar uma parcela de financiamento.
- Cancelar contrato **no aplicativo** não cancela o contrato com uma instituição.
- Reembolso esperado não aumenta caixa até entrar efetivamente.
- Dados importados sem horário permanecem sem horário; operações semelhantes não são automaticamente duplicatas. «LETREIRO» e «ZOKI» são duas vendas distintas.

## Implementação

A pedido do usuário, iniciou-se um **shell Android de teste** em [mobile/](mobile/): telas Início e Movimentações, cálculos em centavos e lançamentos fictícios mantidos somente na memória. Ele serve para avaliar fluxo e interface; não tem banco, autenticação ou backup e não deve receber dados reais.

A **POC nativa de segurança** continua obrigatória antes de adicionar persistência ou aceitar dados reais: SQLCipher real, desbloqueio ligado à chave, senha, biometria e backup cifrado restaurável em outro aparelho. Depois do gate, seguir o roadmap de movimentos, pagamentos/recorrências, projetos e relatórios. A implementação de teste não é uma segurança auditada nem um app financeiro pronto.
