# 04 — Arquitetura e tecnologias

## Diretriz

**Monólito modular local**: executa completamente no processo do aplicativo, sem servidor, API ou banco remoto. Separar responsabilidades conforme a complexidade real. Não impor camadas vazias, repositórios genéricos ou padrões acadêmicos obrigatórios.

## Stack proposta (revisar versões no início da implementação)

| Papel | Escolha inicial | Justificativa / ressalvas |
|---|---|---|
| Mobile | React Native + Expo + TypeScript | UI nativa, ecossistema amplo, TypeScript; build nativo obrigatório para SQLCipher |
| Navegação | Expo Router ou React Navigation (escolher um) | Navegação previsível; bloquear rotas e snapshots sensíveis |
| Persistência | `expo-sqlite` com SQLCipher | Banco relacional local; verificar `cipher_version` em runtime e cifragem real em teste |
| Consultas | SQL parametrizado, com módulo de persistência pequeno; Drizzle opcional | Adotar ORM só se reduzir complexidade; migrações auditadas |
| Biometria | `expo-local-authentication` + armazenamento/cripto nativo | Prompt biométrico não substitui chave atrelada à autenticação; revisar integração real |
| Segredos | Keystore/Keychain via API nativa verificada (`expo-secure-store` ou bridge revisada) | Segredos pequenos; não usar como única recuperação do banco |
| Arquivos | `expo-file-system`, `expo-document-picker`, `expo-sharing` | Exportação/importação via seletor do SO, sem servidor |
| Criptografia backup | Implementação **nativa e auditada** AES-256-GCM (ou equivalente AEAD) + KDF Argon2id/scrypt auditada | Disponibilidade e compatibilidade exigem POC; não improvisar em JavaScript |
| Testes | Vitest/Jest para domínio + testes instrumentados Android/iOS | Algoritmos, armazenamento e biometria devem ser validados em dispositivo |
| Qualidade | TypeScript `strict`, ESLint, formatador, dependabot/audit/lockfile | Prevenção de regressões e supply chain |

> **Não** fixar versões de memória: selecionar versões compatíveis na data da implementação, documentar `package-lock`/`pnpm-lock` e auditar especialmente dependências criptográficas e scripts de build.

## Camadas lógicas (não obrigatoriamente pastas)

1. **UI:** telas, widgets, formulário por modelo, acessibilidade e validação de UX.
2. **Aplicação:** casos de uso (`CreateRecord`, `EditRecord`, `ConfirmForecast`, `RecalculateBalances`, `ExportBackup`, `UnlockVault`) orquestram invariantes e transações.
3. **Domínio:** dinheiro, contas, recorrências, crédito, orçamentos, projeções, regras puras/testáveis; não importa `expo-*`.
4. **Infraestrutura:** SQLite, SQLCipher, Keychain/Keystore, backups, arquivos, notificações.

Regras: UI→aplicação, aplicação→domínio; infraestrutura implementa portas que precisam dela. Comunicação entre módulos por funções/casos de uso bem definidos; não instituir barramento de eventos geral sem necessidade. Serviços de cálculo puros e composicionais.

## Estrutura sugerida

```text
src/
  app/                  # rotas, sessão, composição
  features/
    access/             # desbloqueio, preferências de sessão
    accounts/           # contas, reservas, liquidez
    records/            # criar/editar, obrigações, liquidações
    planning/           # orçamento, recorrências e eventos
    projections/        # saldos diários e mensais, gasto seguro
    cards/              # cartão e parcelas
    projects/           # projetos e rateios
    inventory/          # compras, itens, estoque e perdas
    investments/        # ativos, proventos, patrimônio
    reports/            # mini relatórios
  core/
    money/              # dinheiro inteiro, decimal e arredondamento
    dates/              # data civil, periodicidade, timezone
    rules/              # invariantes compartilhadas reais
  infra/
    database/           # conexões, chaves, migrações, DAOs
    crypto/             # key wrapping, KDF, AEAD
    backup/             # exportação, validação, restauração
    platform/           # biometria, proteção tela, arquivos
  tests/
```

Pasta de camada é criada somente quando a responsabilidade existir. Não duplicar entidades por camadas sem necessidade.

## Módulos e dependências importantes

- `records` fornece fatos, obrigações e liquidações; `accounts` fornece contas e alocações, com transações orquestradas por caso de uso.
- `projections` consulta fatos e regras; **não grava fatos históricos** nem altera estado ao prever.
- `reports` lê resultados de projeções e fatos; **não refaz suas fórmulas próprias**.
- `inventory` e `investments` vinculam eventos físicos/patrimoniais ao registro financeiro sem gerar segunda saída de caixa.
- `backup` opera sobre snapshot consistente de persistência e segredos independentes do aparelho; nunca sobre um arquivo SQLite copiado enquanto está sendo modificado sem protocolo válido.

## Segurança como dependência arquitetural

Inicialização sugerida: mostrar tela bloqueada → obter chave via senha/biometria → confirmar SQLCipher → abrir DB com chave → verificar integridade mínima/migração → montar módulos e dashboard. Falha em qualquer etapa mantém UI bloqueada. Ao bloquear: invalidar sessão, ocultar conteúdo do seletor de apps, fechar banco quando viável e liberar referências à chave (zeroização plena não é garantível em JS).

## Cache de projeções

Fonte de verdade são operações persistidas. Projeções diárias podem ser cacheadas por conta, intervalo, versão e cenário; em edição retroativa invalidar a partir da primeira data efetiva alterada. Projeções devem ser **idempotentes** e testáveis sem banco, passando lista ordenada de eventos e políticas.

## Observabilidade sem vazamento

Logs técnicos com códigos, duração agregada e estado, **sem** valores pessoais, descrições financeiras, paths privados, chaves, senhas, SQL com parâmetros sensíveis ou backups. Nenhuma telemetria remota por padrão. Debug só com fixtures sintéticas.

## POC obrigatória antes de desenvolver módulos de negócio

Em Android real e, antes de suporte iOS, iPhone real: build com SQLCipher; `PRAGMA cipher_version` não vazio; banco inacessível por SQLite comum; desbloqueio por senha; biometria realmente vinculada ao acesso à chave; recuperar backup cifrado após reinstalar; arquivo adulterado recusado; troca de biometria/chave; app em background sem vazamento visual. Se falhar, rever biblioteca/bridge antes de implementar o MVP financeiro.


## Aditivo v2 — orquestração sem acoplamento

- `RecordCommandService` (nome ilustrativo) coordena a persistência e emite invalidações após commit; módulo de projeção lê fatos e regras, **não grava saldos como verdade**.
- `RecurrenceEngine` puro expande janelas sob demanda e aplica exceções por chave estável; `ObligationService` conhece estados de dívida; `SettlementService` conhece pagamentos e reembolsos. Não juntar esses três conceitos numa função de «cancelar tudo».
- Um `FinanceImpact` (resultado derivado, não entidade obrigatória) pode centralizar a relação entre ações e datas/contas a recalcular, evitando acoplamento direto entre UI, estoque, parcelas e relatório.
- Ação em lote de séries e estorno deve ser atômica e idempotente; caches só se invalidam após commit.
- Instalação **sem backend, API e sincronização remota**. Backup exportável criptografado pode ser copiado manualmente para nuvem externa. Integrações de nuvem não são necessárias no MVP.
- Versão atual de Expo/React Native e compatibilidade com SQLCipher, biometria e distribuição devem ser confirmadas no início da execução; não congelar número de versão sem prova de build nativo.
