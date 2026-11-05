# 20 — Implementação dos registros locais — 04/11/2026

## Estado da entrega

Implementação para revisão e validação com dados fictícios. O app é offline, sem backend, acesso bancário ou execução de pagamentos externos. Demonstração e perfil protegido têm armazenamentos separados. A entrega não é um APK homologado nem autorização para inserir dados reais.

As três novas documentações foram consideradas junto às regras vigentes; os arquivos originais foram preservados. O [relatório 19](19-revisao-consistencia.md) documenta a primeira etapa e suas pendências históricas. Este documento descreve a implementação posterior.

## Decisões confirmadas pelo usuário

- Pagamentos, faturas, parcelas e reembolsos são **registros manuais**. Registrar cancelamento no app não cancela contrato externo.
- O usuário calcula o **custo tido na produção** e informa diretamente valor, projeto, descrição e data. Vínculo com venda é opcional. Não há média/FIFO nem custo automático a partir do material consumido.
- Dias 29–31 inexistentes usam o **último dia do mês**; os meses seguintes retomam o dia solicitado. Fins de semana/feriados não deslocam registros automaticamente.

## Módulos e comportamento

| Área | Implementação e invariantes |
|---|---|
| Início e lista | Mês atual + próximo; filtro inicial no atual; negativos; retroatividade e transporte de pendências. Histórico com saldo somente desde abertura conhecida. Data do fato, vencimento, previsão e liquidação separados; horas opcionais preservadas. |
| Contas e disponível | Caixa digital/físico, elegibilidade, transferências internas sem inflar receita/despesa, reservas sem dinheiro novo e aviso de insuficiência. Margem, fuso e horizonte até próxima receita ou 30/90 dias configuráveis. |
| Operações e parcelas | Rateio inteiro determinístico; pagamentos parciais/antecipados/atrasados e correção com motivo. Vencimento original preservado; previsão-base não é substituída pelo realizado. |
| Cartão e faturas | Compra gera obrigação, liquidação afeta conta uma vez. Crédito no cartão não é renda bancária e só pode liquidar a partir de seu recebimento. A fatura é agrupada pelo mês do vencimento informado; não há inferência de ciclos bancários/feriados. |
| Reembolso e cancelamento | Crédito vinculado ao original; limites incluem pedidos pendentes ativos. Receber é ação explícita; retirar pedido pendente conserva compra/pagamento. Dispensa exige confirmação; quatro parcelas pagas continuam quando oito são dispensadas. |
| Aquisições | Desejos sem data/preço não entram no caixa. Edição, simulação isolada no mês escolhido e conversão vinculada uma vez em operação. |
| Recorrências | Calendário mensal, intervalo de dias, data final inclusiva, quantidade e indefinido. Exceções individuais, mudança de valor/título a partir de posição e cancelamento com alcance/prévia. Execução efetiva ancora próxima manutenção; condições são anotações acompanhadas manualmente, sem monitoramento automático nem pagamento fictício. |
| Categorias, projetos e orçamento | Categoria independente de projeto, orçamento mensal por categoria, base preservada e desvio frente ao fato econômico. Etiquetas não duplicam caixa. |
| Estoque e produção | Compras vinculadas, consumo/perda com quantidade exata e validação histórica de disponibilidade. Seis casas decimais na unidade do item; sem conversão automática. Resultado do projeto separa vendas, devoluções efetivas e custos informados. Consumo/custo informado não repetem saída de caixa da compra. |
| Investimentos e ferramentas | Aportes/resgates, quantidades, avaliação e custo baixado informados; valorização não vira recebimento. Custo por uso de ferramenta com residual/despesas atribuídas, indefinido com zero usos. Patrimônio financeiro explicita que não inclui estoque/ferramentas sem avaliação. |
| Histórico | Revisões antes/depois, motivo, instante UTC, requisição idempotente e recusa de reutilização conflitante. Edição de série conserva pagamentos históricos. |
| CSV | Importação com prévia, moeda/referências/datas validadas e IDs fortes; não mescla vendas por data/valor. Fórmulas são texto. Relatório é legível, exige confirmação e não substitui backup. Fluxos compostos exportados não são reimportados como movimentos simples. |

## Persistência e segurança implementadas para validação

`FinanceStore` aplica e valida comandos imutáveis, grava a transação e só então publica o estado. `BookRepository` mantém tabelas locais com payload validado, FKs, constraints monetárias, auditoria/requisições e revisão otimista. A migração inicial v1 é atômica e repetível; schema futuro é recusado. Não há migração automática da planilha real ou de outro aplicativo.

O abridor nativo exige `PRAGMA cipher_version` antes de chave, schema e dados; não existe fallback para SQLite comum. Cada sessão abre uma conexão nova. O único valor interpolado no PRAGMA de chave é a representação hexadecimal estritamente validada de 32 bytes aleatórios; valores do usuário usam parâmetros. Erros desse caminho não expõem argumentos SQL.

A chave aleatória do banco é envelopada por senha; a biometria protege material de chave pelo SecureStore com autenticação do SO. Bloquear fecha a conexão e descarta a sessão; proteção de captura é requerida antes de exibir o conteúdo. Arrays temporários são limpos quando possível, sem alegar apagamento garantido de strings/heap JavaScript. Nova abertura após criação interrompida conserva material protegido e não inventa os saldos cuja transação falhou.

Backup lógico completo usa o provedor nativo OpenSSL de `react-native-quick-crypto`, AES-256-GCM e scrypt. O perfil de protótipo é N=131072/r=8/p=1, limite de memória 256 MiB; precisa de medição em aparelho e revisão. Formato, finalidade, versão e perfil são autenticados/validados; arquivos e payloads têm limite. A senha de recuperação é independente da chave do aparelho. Importação valida antes de confirmar substituição transacional. Seletores podem bloquear a sessão; o host exige novamente a senha antes de mostrar/restaurar o conteúdo selecionado. Compartilhamento usa arquivos temporários e tentativa de remoção ao terminar.

O navegador oferece apenas demonstração. SQLCipher/biometria/backup nativo exigem build próprio; Expo Go não é prova de segurança. A aplicação mantém aviso de validação e dados fictícios.

## Arquivos principais para revisão

- `mobile/AppEntry.tsx`: escolha de modo, sessão, bloqueio e recuperação; `mobile/App.tsx` e `src/ui/FinanceWorkspace.tsx`: integração das telas/formulários.
- `mobile/src/domain/book*.ts`, `exact.ts`, `recurrences.ts`, `movements.ts` e `projections.ts`: comandos, invariantes e cálculos.
- `mobile/src/application/financeStore.ts` e `movementCsv.ts`: coordenação e intercâmbio.
- `mobile/src/persistence/bookRepository.ts`: schema, transações, conflitos e gate SQLCipher.
- `mobile/src/security/envelope.ts` e `src/platform/vault.native.ts`, `nativeCrypto.ts`, `nativeProof.native.ts`: envelope, proteção de chave e prova em aparelho.
- `mobile/tests/`: regras, SQLite, backup, importação e interface; `.maestro/`: jornadas físicas preparadas.
- `mobile/app.json`, `package.json`/lockfile: módulos/plugins nativos e ferramentas para revisão humana. AGENTS.md, CI, scripts de instalação e políticas de segurança não foram alterados.

## Evidências executadas

| Verificação | Resultado e limite |
|---|---|
| `npm test` | 133 testes: 97 Node e 36 interface. Positivos, negativos, bordas e regressões; sem testes ignorados. |
| SQLite sintético | Arquivo real fecha/reabre; FKs/centavos inteiros; falha SQL no meio causa rollback; conflito de revisão não publica dados; migração interrompida pode ser repetida. SQLite comum é laboratório de schema, não armazenamento do app. |
| Backup em Node | Senha independente, round-trip, vínculos/histórico; senha errada, adulteração, truncamento, formato/KDF/finalidade inválidos recusados. Não testa a biblioteca nativa. |
| `npm run typecheck` e `npm run lint` | Passaram sem desativar validações. |
| `npm run bundle:android` e `bundle:web` | Exportações Metro concluídas. São bundles JavaScript/Hermes, não APK nem teste de execução nativa. |
| Prebuild Android sem instalação | Concluído; `android/gradle.properties` contém `expo.sqlite.useSQLCipher=true` e nova arquitetura habilitada. Arquivos gerados são ignorados pelo Git. |
| `npm audit` | 33 avisos: 1 baixo e 32 moderados; zero altos/críticos. Ainda exige tratamento/revisão antes de distribuição. |

Foram aplicadas correções de dependências compatíveis com `npm audit fix --ignore-scripts`, sem `--force` e sem executar scripts de instalação. Avisos remanescentes incluem cadeias de `glob`, `minimatch` e `deepmerge`, principalmente ferramentas Expo/Metro/Jest/ESLint. As sugestões automáticas incluem downgrades incompatíveis de framework; não foram aplicadas silenciosamente. O prebuild também avisa React Native 0.88.0 versus patch recomendado 0.88.1 e ausência de `expo-system-ui` para estilo do sistema; compatibilidade final depende do build nativo.

## Verificações ainda obrigatórias

Neste ambiente há Android Studio e seu JBR, mas não Android SDK configurado, dispositivo/emulador ou Maestro. **Não foi compilado APK nem executada a POC em aparelho.** Isso impede comprovar o SQLCipher do binário, OpenSSL/JSI, biometria/Keystore e o ciclo real de bloqueio/arquivos.

O botão de prova nativa usa bancos sintéticos isolados e segredos gerados em execução; verifica runtime SQLCipher, recusa sem chave/com chave diferente, reabertura, backup para outra chave e rejeição de adulteração. O fluxo Maestro correspondente está preparado, sem senha fixa. Ainda executar manualmente biometria cancelada/alterada, bloqueio e captura/seletor de apps, interrupção durante gravação/restauração, compartilhamento cancelado, recuperação após reinstalação e backup em **outro aparelho**. A restauração em segundo banco na mesma prova não substitui esse último caso.

Antes de dados reais ou distribuição: revisar segurança, dependências/plugins, migração inicial, pagamentos e cancelamentos em lote com uma pessoa, conforme AGENTS.md e docs/17; medir tempo/memória do KDF em aparelho e resolver os problemas que essa validação revelar. Não há certificação independente ou revisão humana concluída nesta entrega.

## Referências de API usadas

- [Expo SQLite e SQLCipher](https://docs.expo.dev/versions/latest/sdk/sqlite/#sqlcipher): configuração nativa e limitações de plataforma.
- [SQLCipher API](https://www.zetetic.net/sqlcipher/sqlcipher-api/): chave e verificação do runtime.
- [Expo SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/): proteção/autenticação do material e invalidação biométrica.
- [Quick Crypto](https://github.com/margelo/react-native-quick-crypto) e [introdução oficial](https://crypto.margelo.com/docs/introduction/quick-start): provedor nativo; APIs conferidas também no pacote instalado.
