# 09 — Roadmap por incrementos de valor

**Não** pedir à IA o app inteiro de uma vez. Cada fase entrega código executável, testes e documentação, com dependências explícitas.

## Fase 0 — Validação técnica de segurança (bloqueador)

- POC Android nativa: Expo + SQLite SQLCipher real, desbloqueio senha e biometria vinculados à DEK; app switcher protegido.
- Provar backup cifrado portátil, restauração em instalação limpa, suporte a migrações e falha fechada.
- Verificar bibliotecas criptográficas que realmente funcionam em ambiente React Native nativo; registrar ADRs. **Sem POC de segurança aprovada, não colocar dados financeiros reais.**

### Trilha de avaliação sem persistência

É permitido desenvolver em paralelo um shell de telas e domínio mínimo com **fixtures fictícias mantidas apenas em memória**, para avaliação visual e de fluxo. Essa trilha não usa SQLite sem SQLCipher, não persiste dados e não substitui nenhum aceite da Fase 0. O app de teste deve avisar que os dados são fictícios e somem ao fechar.

## Fase 1 — Núcleo financeiro mínimo

- Modelo de contas de caixa, usuário local, operações, transferências e envelopes.
- Dinheiro inteiro, datas corretas, testes das invariantes e SQLite com transações.
- Tela de desbloqueio, início simples, editor universal e lista de registros.
- Lançamentos retroativos e rastreabilidade desde a primeira versão.

## Fase 2 — Previsibilidade

- Obrigações, vencimentos, liquidações, previsões, orçamento e recorrências (calendário e pós-execução).
- Motor puro de projeção **diária**, passagem mensal e mínimo diário com negativos.
- Cálculo de gasto seguro por horizonte e cenários conservador/esperado, explicável ao usuário.
- Mini relatórios e alertas de previsão não confirmada.

## Fase 3 — Crédito e personalização

- Cartões, faturas, parcelas e pagamentos parciais.
- Modelos de registro e campos contextuais, regras de default editáveis e favoritos.
- Revisão de pendências, fluxo “previsto→confirmado” sem dupla contagem.

## Fase 4 — Itens, projetos e patrimônio

- Projetos, categorias distribuídas, compras por item e estoque.
- Medidas exatas, preço/kg, consumo e perdas.
- Ativos, aportes, dividendos efetivos/estimados, valor patrimonial e custo por uso.

## Fase 5 — Importação e confiabilidade ampliada

- Importação CSV com conciliação e detecção de duplicata, OFX se justificado.
- Políticas de backup, teste guiado de restauração e melhorias de performance.
- Auditoria de segurança e suporte iOS mediante mesmos testes de plataforma.

## Definição de pronto por tarefa

Comportamento aderente à regra, UI útil, validação, testes executados e documentados, sem downgrade de segurança, sem lib nova injustificada, diff restrito ao escopo, suporte a retroatividade quando relevante, sem segredos em logs/fixtures.

## Primeiro pedido ideal ao Codex

> Leia `README.md`, `AGENTS.md`, `docs/04-arquitetura-e-tecnologias.md`, `docs/06-seguranca.md` e `docs/08-testes-e-aceite.md`. **Não implemente ainda os módulos financeiros.** Proponha e execute uma POC mínima Android de SQLite/SQLCipher com fail-closed (`cipher_version`), cofre com chave aleatória protegida por senha, caminho biométrico realmente vinculado a chave nativa e backup cifrado restaurável após reinstalação. Identifique bibliotecas e limitações com documentação oficial, teste em build nativo e documente bloqueios sem contorná-los. Não adicione dados reais nem serviços remotos.


## Atualização de priorização v2

- **Fase 1:** lista cronológica com filtro inicial do mês atual, cadastro/edição universal, data/hora opcional e cálculo mensal (atual+próximo); demonstrar recálculo retroativo e negativos antes de embelezar relatórios.
- **Fase 2:** motor de projeções, previsão/realizado, orçamento, despesas esporádicas e reservas; primeiro valor de «gasto seguro» explicável.
- **Fase 3A:** obrigações, pagamento parcial/antecipado/atrasado, cartão; distinguir por data de competência e caixa.
- **Fase 3B:** ações «estorno, reembolso a receber, cancelar, dispensar» com auditoria, limites e rollback; depois recorrência mensal terminada e exceções (somente esta / futuras / todas pendentes).
- **Fase 4:** regras de ciclo após execução e condicionais, estoque e custo de produção; investimentos, renda por projeto e mini relatórios.
- **Fase 5:** importação das amostras de planilha, conciliação, reconstituição via backup, testes de cenários históricos e proteção reforçada.

**Observação:** não gerar crédito ao «cancelar financiamento» sem receber dinheiro; não apagar liquidações históricas. O app gerencia informação, não executa cancelamento real de contratos.
