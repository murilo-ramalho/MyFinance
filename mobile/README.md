# myFinance Mobile — build de teste

Este projeto Expo serve para avaliar as telas Início, Movimentações e Visões no navegador e no Android, sempre com dados totalmente fictícios.

## Limites desta versão

- Não há banco, autenticação, sincronização ou backup.
- Os registros adicionados ficam somente na memória do processo e somem ao fechar/recarregar o app.
- Os valores exibidos são fixtures de demonstração; não inserir dados reais.
- Os resumos separam valores realizados, compromissos e previsões para mostrar o que já afeta o caixa e o que continua projetado.
- O cálculo usa centavos inteiros, moeda BRL explícita e mantém a data do fato separada da data de caixa.
- O saldo de fechamento inclui valores pagos e valores previstos/compromissados, identificados na interface.
- Há criação e edição de lançamentos em memória. Movimentações permitem navegar por meses, filtrar situação/tipo, buscar descrição e alternar a ordem cronológica.
- A aba Visões agrupa os mesmos lançamentos por cartão/projeto e exibe caixa digital/físico separado. É possível criar projetos com nome e descrição, classificar entradas/saídas existentes ou novas e consultar o fluxo acumulado por projeto com realizado, compromisso e previsão separados; essa etiqueta não cria outro fluxo de caixa. O resumo mostra fluxo de caixa, não custo produtivo ou margem. A compra de cartão de demonstração mostra evento e data de caixa prevista distintos.
- Em despesas, meio digital sem cartão é identificado como débito; cartão selecionado é crédito; dinheiro físico permanece separado.
- Investimento e reserva aparecem separados para explicar a classificação: investimento é patrimônio ilustrativo fora do caixa, e a reserva já está incluída no dinheiro digital.
- Início mostra uma estimativa demonstrativa de gasto seguro, com cenários conservador/esperado, reserva e margem fictícias; ela não usa contas reais cadastradas.
- O resumo de saldo começa no mês atual e projeta meses seguintes; a amostra não tem abertura histórica, então meses anteriores mostram a lista sem inventar saldo ou propagação retroativa.
- Contas editáveis, gestão de reservas, transferências, orçamento, faturas/parcelas/pagamentos de cartão, recorrências, estornos, custos/margens de projetos, estoque, movimentações de investimento, persistência, autenticação e backup ainda não foram implementados.
- A interface e o domínio estão em TypeScript estrito; os testes de domínio e interface também são TypeScript.

## Executar

Requer Node.js 22.13 ou mais recente (compatibilidade do Expo SDK 58).

```powershell
npm ci --ignore-scripts
npm run start
```

Com o Expo Go instalado em um Android, abra o QR exibido pelo Expo. Também é possível usar um build Android próprio quando JDK e Android SDK estiverem configurados.

## Prévia no navegador

```powershell
npm run web
```

O Expo abre uma prévia web da mesma interface para avaliar layout e fluxos com dados fictícios. O navegador serve para prototipação; a validação Android final ainda exige build e testes em dispositivo/emulador.

## Verificações locais

```powershell
npm test
npm run typecheck
npm run bundle:android
npm run bundle:web
```

`npm test` executa testes de regressão de domínio com o `node:test` e testes de interação da interface com Jest/React Native Testing Library. Os fluxos ponta a ponta Android ficam em `.maestro/` e podem ser executados com `npm run test:e2e` em uma máquina com Maestro, Android SDK e emulador/aparelho configurados, com o app de teste instalado. O fluxo `card-project-money-views.yaml` cobre as três novas visões; este ambiente não tem essas ferramentas Android, então os fluxos Maestro ainda não foram executados aqui.

Os testes atuais cobrem dinheiro e datas, datas do fato versus caixa, saldos negativos e mínimos diários sem ordem intradiária inventada, estimativa de gasto seguro em centavos, separação de totais mensais por estado e tipo de dinheiro, etiquetas de cartão/projeto sem fluxo duplicado, criação de projetos e classificação de entradas/saídas, resumo acumulado por projeto com estados separados, movimentos iguais no mesmo dia, projeção de meses futuros, navegação/filtros/busca/ordenação, criação/edição no formulário e validações. Eles não cobrem armazenamento, autenticação, backup ou qualquer operação financeira ainda não implementada. Antes de persistir dados, concluir a POC de segurança descrita em [docs/09-roadmap.md](../docs/09-roadmap.md).

## Auditoria de dependências

Na verificação atual, `npm audit` não reporta vulnerabilidades na árvore instalada. Reexecutar após atualizar o lockfile e antes de qualquer distribuição; esse resultado não substitui a POC de segurança nem autoriza o uso de dados reais.
