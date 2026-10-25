# myFinance Mobile — build de teste

Este projeto Expo Android serve para avaliar o fluxo de Início e Movimentações com dados totalmente fictícios.

## Limites desta versão

- Não há banco, autenticação, sincronização ou backup.
- Os registros adicionados ficam somente na memória do processo e somem ao fechar/recarregar o app.
- Os valores exibidos são fixtures de demonstração; não inserir dados reais.
- O cálculo usa centavos inteiros, moeda BRL explícita e mantém a data do fato separada da data de caixa.
- O saldo de fechamento inclui valores pagos e valores previstos/compromissados, identificados na interface.
- Há criação e edição de lançamentos em memória. Parcelamento, contas, reservas e transferências ainda não foram implementados.
- A interface e o domínio estão em TypeScript estrito; os testes de domínio e interface também são TypeScript.

## Executar

Requer Node.js 22.13 ou mais recente (compatibilidade do Expo SDK 58).

```powershell
npm ci --ignore-scripts
npm run start
```

Com o Expo Go instalado em um Android, abra o QR exibido pelo Expo. Também é possível usar um build Android próprio quando JDK e Android SDK estiverem configurados.

## Verificações locais

```powershell
npm test
npm run typecheck
npm run bundle:android
```

`npm test` executa testes de regressão de domínio com o `node:test` e testes de interação da interface com Jest/React Native Testing Library. Os fluxos ponta a ponta Android ficam em `.maestro/` e podem ser executados com `npm run test:e2e` em uma máquina com Maestro, Android SDK e emulador/aparelho configurados, com o app de teste instalado. Este ambiente não tem essas ferramentas Android, então os fluxos Maestro ainda não foram executados aqui.

Os testes atuais cobrem dinheiro e datas, datas do fato versus caixa, saldos negativos e mínimos diários sem ordem intradiária inventada, movimentos iguais no mesmo dia, meses sequenciais, criação/edição no formulário e validações. Eles não cobrem armazenamento, autenticação, backup ou qualquer operação financeira ainda não implementada. Antes de persistir dados, concluir a POC de segurança descrita em [docs/09-roadmap.md](../docs/09-roadmap.md).

## Auditoria de dependências

Na verificação atual, `npm audit` não reporta vulnerabilidades na árvore instalada. Reexecutar após atualizar o lockfile e antes de qualquer distribuição; esse resultado não substitui a POC de segurança nem autoriza o uso de dados reais.
