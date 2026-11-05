# myFinance — Gestão financeira pessoal local (v2.0)

> **Documentação:** revisada em 04/11/2026. **Estado:** implementação local para validação, com demonstração em memória e modo nativo SQLCipher, autenticação e backup cifrado. Usar dados fictícios até concluir a POC em aparelho e a revisão humana de segurança, migrações e pagamentos.

**Objetivo:** saber quanto pode realmente gastar, isolando reservas e investimentos, mantendo previsão de custos/receitas, saldos diários e mensais, patrimônio e custos/rendimentos por projeto. Aplicativo mobile **offline-first**, **sem backend/API**, monólito modular em camadas sem rigidez excessiva, SQLite com SQLCipher e backup criptografado portátil.

## Decisões de produto v2

1. **Início:** por padrão apresenta mês **atual e próximo** em sequência: saldo herdado + entradas − saídas = saldo transmitido, menor saldo diário, e indicador «disponível seguro» separado.
2. **Movimentações:** lista cronológica com filtro inicial **mês atual**, incluindo realizadas, compromissos e previsões, hora opcional e identificação do estado. Toque abre detalhes e ações.
3. **Registro único:** o mesmo formulário cria/edita passado, presente ou futuro, com defaults sensatos só na criação, pagamento e data de compra independentes, campos e modelos personalizáveis.
4. **Retroatividade:** corrigir registros antigos atualiza saldos passados até hoje e projeções futuras, inclusive negativos, conservando trilha de alterações.
5. **Ações:** pagamento parcial/antecipado/atrasado, estorno/reembolso total ou parcial, reembolso a receber, adiar, dispensar obrigação e cancelar previsão. Fato original pago não desaparece.
6. **Séries de recorrência:** calendário limitado (ex.: dia 2 até jan/2027), quantidade, indefinido, intervalo desde execução/condição, ocorrência excepcional e alterações «esta», «esta e próximas», «todas pendentes» ou «regra inteira»; preservar pagamentos anteriores.
7. **Projetos e renda:** receita esporádica, impressão 3D, custo produtivo informado manualmente sem novo pagamento, quantidades de estoque, ferramentas, investimentos, rentabilidade e relatórios curtos. A planilha é amostra de regras, não layout obrigatório.
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
| 19 | [Revisão de consistência](docs/19-revisao-consistencia.md) | novas especificações, correções, cobertura e pendências |
| 20 | [Implementação dos registros locais](docs/20-implementacao-registros-locais.md) | módulos, decisões do usuário, validação e limitações nativas |

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

O [aplicativo mobile](mobile/README.md) mantém Início, Movimentações e Visões e acrescenta **Organizar**: compras, parcelas, pagamentos parciais e correções, faturas, reembolsos vinculados, contas, transferências, reservas, aquisições, recorrências e exceções, categorias, orçamentos, estoque, custos manuais de produção, investimentos, ferramentas, caixa diário e histórico. Tudo é registro manual; não há integração bancária ou transação externa.

O domínio usa centavos inteiros, quantidades exatas e comandos atômicos/idempotentes. O modo nativo usa repositório transacional com FKs, verificação SQLCipher antes de acessar dados, chave protegida por senha/biometria e backup autenticado portátil. O navegador oferece somente demonstração em memória. CSV é relatório sem cifra e não substitui o backup completo.

Testes locais cobrem regras, persistência SQLite sintética, rollback, backup e interface. A **POC nativa de segurança** e a revisão humana continuam obrigatórias antes de dados reais: build/aparelho com SQLCipher, biometria, bloqueio, interrupções e recuperação em outro dispositivo. A matriz e as evidências estão em [20 — Implementação dos registros locais](docs/20-implementacao-registros-locais.md). Não há APK validado para distribuição nesta entrega.
