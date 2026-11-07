# myFinance Mobile — implementação para validação

Aplicativo de registros financeiros manuais, offline e sem backend ou integração bancária. Início mostra o mês atual e o próximo; Movimentações abre no mês atual. A aba Organizar reúne as operações e cadastros descritos em [docs/20](../docs/20-implementacao-registros-locais.md).

## Registros locais

O aplicativo não inicia com movimentos, contas ou categorias de exemplo. Ao criar um perfil, informe uma conta real, o tipo e o saldo de abertura na data-base indicada. O livro começa sem movimentos e categorias; os dados sintéticos existem apenas em verificações isoladas.

Os registros ficam em um cofre local protegido em build nativo próprio com SQLCipher, senha, biometria opcional e backup cifrado. Não funciona no Expo Go nem usa SQLite sem cifra como alternativa. O aplicativo bloqueia a sessão ao sair do primeiro plano.

Na criação do perfil, é possível ativar o desbloqueio biométrico do Android. O sistema pede a confirmação; se a biometria for cancelada ou não estiver disponível, o perfil é criado e a senha local continua valendo. A chave biométrica é protegida pelo SecureStore com autenticação nativa.

O modo nativo é uma implementação para validação. **Não inserir dados reais até concluir a POC em aparelho e a revisão humana obrigatória.** Os testes Node/Jest e a exportação Metro não certificam o armazenamento nativo.

## Executar o aplicativo

Requer Node.js 22.13 ou mais recente e npm compatível com o lockfile.

```powershell
npm ci --ignore-scripts
npm run web
```

O navegador não abre nem cria perfis protegidos. Para usar os registros locais, instale o build nativo e crie ou desbloqueie o cofre.

No Android, dependências nativas exigem development build próprio. Expo Go não executa o modo protegido. Com JDK, Android SDK e aparelho/emulador configurados:

```powershell
node scripts/expo.mjs prebuild --platform android --no-install
node scripts/expo.mjs run:android
```

O prebuild gera arquivos nativos ignorados pelo Git. Revisar os plugins e a configuração gerada antes de distribuir. `expo.sqlite.useSQLCipher=true` é necessário, mas a comprovação exige executar o binário.

## Verificações

```powershell
npm test
npm run typecheck
npm run lint
npm run bundle:android
npm run bundle:web
```

São 99 testes Node de domínio/aplicação/persistência/backup/CSV e 42 testes de interface (141 no total). A suíte usa SQLite real apenas com dados sintéticos para testar schema, FKs e transações; a criptografia de testes usa o provedor Node, e a interface simula os serviços nativos. Nenhum desses testes substitui a prova do provedor nativo.

O fluxo `.maestro/native-security-proof.yaml` verifica o armazenamento com bancos sintéticos isolados em build de desenvolvimento. `npm run test:e2e` exige Maestro, SDK e APK instalado; **não executado neste ambiente**. Não executar esse fluxo em um perfil com dados que se deseja conservar.

Em build de desenvolvimento, **Verificar proteção do aparelho** testa SQLCipher, recusa sem chave/com chave errada, reabertura, restauração com outra chave e adulteração do backup. Biometria, interrupções, seletor de apps, compartilhamento e recuperação em outro aparelho exigem verificação manual adicional.

## Dados e recuperação

Dinheiro é salvo em centavos BRL e quantidades usam seis casas decimais exatas na unidade cadastrada. Datas do fato, vencimento, previsão e pagamento são distintas; horas desconhecidas ficam vazias. Meses anteriores à base não recebem abertura inventada.

O custo tido na produção é informado pelo usuário. Estoque controla quantidades; não calcula média/FIFO e não gera pagamento ao consumir material. Recorrências nos dias 29–31 usam o último dia se necessário e retomam o dia solicitado nos meses seguintes.

Backup cifrado contém livro, vínculos e histórico e exige senha de recuperação independente do dispositivo. CSV é relatório legível sem cifra: tem prévia, validação e identificação por ID, mas não transporta toda a estrutura nem restaura parcelas/transferências. Há um [modelo sintético](examples/movimentos-modelo.csv).

## Dependências e limites

### Arquivos de ambiente

O modelo versionado é `.env.example`. Os arquivos locais `.env.development` e `.env.production` ficam na pasta `mobile` e são ignorados pelo Git, assim como `.env` e variantes locais. No checkout novo, copie o modelo para o ambiente necessário. A única configuração atual é `EXPO_NO_TELEMETRY=1`; não há API/backend que exija credenciais.

Chaves SQLCipher são geradas aleatoriamente por perfil no aparelho e protegidas por senha/biometria; senhas de recuperação são fornecidas pelo usuário. Elas não pertencem aos arquivos de ambiente. Valores `EXPO_PUBLIC_*` são incorporados ao aplicativo e não servem para guardar segredos. A configuração de produção não substitui os gates de segurança e validação nativa.

Após `npm audit fix --ignore-scripts`, a árvore tem **33 avisos: 1 baixo e 32 moderados**, sem alto/crítico, principalmente cadeias de ferramentas Expo/Metro/Jest. Não foi usado `--force` nem downgrade de framework. Revisar os avisos e a compatibilidade nativa antes da distribuição; ver detalhes e pendências em [docs/20](../docs/20-implementacao-registros-locais.md).

Neste ambiente o Android SDK, dispositivo/emulador e Maestro não estão disponíveis. Android Studio/JBR existem, mas não foi gerado APK nem executada a POC física. As exportações Android/web verificam JavaScript, não compilação nativa.
