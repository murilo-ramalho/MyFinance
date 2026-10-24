# 06 — Segurança, modelo de ameaças e desenvolvimento assistido por IA

> **Prioridade crítica.** Este arquivo é um plano de segurança e teste; **não** certifica uma implementação. A orientação é OWASP MASVS (STORAGE, CRYPTO, AUTH, PLATFORM, CODE, PRIVACY, RESILIENCE) e revisão dos riscos de coding agents.

## Ativos e adversários

Ativos: movimentos financeiros, patrimônio, descrições e projetos, chaves do cofre, senhas, backup e metadados, histórico, integridade das previsões e privacidade das telas.

Ameaças: perda/roubo do celular bloqueado, aparelho desbloqueado temporariamente, apps maliciosos, arquivos importados manipulados, alteração do binário/build, perda de dados, erro de implementação, dependência comprometida, agentes de IA manipulados por repositório/web/logs e usuário enganado por indicador incorreto.

**Não prometemos:** proteção absoluta contra aparelho com root/jailbreak, comprometimento do SO, depuração com privilégios, malware com controle da sessão ou usuário que divulga senha/backup. Não existe servidor para recuperar segredo perdido nem para revogar credenciais remotamente.

## Arquitetura de chaves sugerida (sujeita a POC nativa)

1. Ao criar o cofre, gerar **DEK aleatória de 256 bits** via CSPRNG da plataforma. DEK é a chave bruta do SQLCipher, não a senha digitada.
2. Senha principal do usuário → KDF revisada (`Argon2id`, parâmetros medidos no hardware, com sal aleatório; scrypt como alternativa justificada) → chave de envelopamento **KEK_senha**. Armazenar apenas sal, parâmetros, versão e `AEAD_encrypt(KEK_senha, DEK)`. A autenticação da senha ocorre quando a desencriptação autenticada da DEK funciona.
3. Biometria opcional: criar via Keystore/Keychain um mecanismo **criptograficamente vinculado à presença/autenticação do usuário** para proteger outra cópia da DEK (ou chave de envelopamento). Não confiar somente no booleano de `authenticateAsync`. A implementação precisa provar que a chave não é liberada sem autenticação exigida.
4. Após desbloqueio, passar DEK validada ao SQLCipher pelo mecanismo nativo revisado (ou sintaxe RAW KEY com **apenas hexadecimal validado de 64 caracteres**), verificar `PRAGMA cipher_version`, e executar consulta real para confirmar o banco. Não interpolar senha do usuário em SQL; não usar fallback em texto puro.
5. Permitir troca de senha re-envelopando a DEK sem necessariamente recifrar o banco inteiro. Invalidação biométrica não deve impedir acesso com senha correta. Qualquer alteração de senha/biometria passa por reautenticação.
6. Sessão limitada: bloquear ao iniciar e quando voltar de background conforme política; ocultar snapshot e conteúdo sensível; fechar conexões se viável e liberar referências de chave. **JS não garante apagar memória**: minimizar permanência de segredos e usar módulo nativo para material criptográfico quando necessário.
7. Nome de usuário identifica o perfil local, **não** é segunda prova de segurança; não oferecer recuperação de senha inexistente. Se senha principal for perdida, uma **senha/segredo de recuperação do backup** continua sendo a recuperação possível, desde que exista backup válido.

### Falhas perigosas a impedir

- `PRAGMA key` não lança erro em SQLite convencional: **testar `cipher_version` e arquivo cifrado**. Sem isso o banco pode estar em texto puro.
- `expo-local-authentication` exibe prompt biométrico, mas resultado `success` por si só não é prova de autorização criptográfica. Vincular ao segredo nativo.
- `expo-secure-store` é apropriado para pequenos segredos, não backup durável do banco; comportamento de reinstalação e invalidação varia entre Android/iOS. Definir plano de recuperação independente.
- Backups do sistema operacional podem incluir arquivos/cifras sem as chaves necessárias. Configurar regras de Android Auto Backup/data extraction e proteção de arquivos no iOS após POC.
- AES-GCM exige nonce único por chave e uso correto de tag. Não escolher parâmetros, derivar chaves ou construir streaming AEAD caseiro.
- Backup **não é** banco em texto puro zipado: o envelope de backup é criptografado independentemente e autenticado; exportar CSV/JSON simples somente por opção explícita e aviso.

## Tabela de ameaças e mitigações

| Ameaça | Impacto | Mitigação obrigatória | Evidência/teste |
|---|---|---|---|
| Roubo do dispositivo bloqueado | Exposição local | DEK aleatória, SQLCipher, senha forte, bloqueio biométrico válido | Extrair banco e falhar ao abrir no SQLite comum |
| Expo Go / build sem cipher | Banco sem criptografia | Verificação runtime `cipher_version`, teste binário, abortar operação | Build sem cipher **falha fechado** |
| Biometria cosmética | Acesso por bypass visual | Keystore/Keychain com restrição de uso criptográfico | Simular `success` sem chave ⇒ não acessa dados |
| Senha fraca/bruteforce offline | Exfiltração após cópia | KDF com parâmetros medidos, senha mínima forte, limite de tentativas na UI (não substitui KDF) | Teste derivação e política; revisão dos parâmetros |
| Falha/perda da biometria | Bloqueio indevido | Senha principal alternativa e recuperação por backup | Alterar digitais ⇒ senha ainda abre cofre |
| Desinstalação/troca de celular | Perda total | Backup cifrado independente do device; teste novo aparelho | Restore sem dispositivo original |
| Backup adulterado/truncado | Corrupção ou execução indevida | AEAD, versão/tamanho/limites, parsing seguro e restore atômico | Trocar 1 byte ⇒ rejeitar sem alterar cofre atual |
| CSV/OFX hostil | Injeção/DoS/dados falsos | Parser restrito, limites tamanho/linhas, validação schema, prévia, deduplicação, CSV formula injection na exportação | Fuzzing e arquivos adversariais |
| SQL injection | Quebra de integridade/exposição | Prepared statements; migrações estáticas; não concatenar input | Teste payloads e code review |
| Corrupção de saldos | Decisão financeira errada | Regras puras, transação atômica, testes de propriedades, conciliação | Retroativo, cartões, transferências, negativos |
| Screenshots/app switcher | Vazamento visual | Proteção tela conforme plataforma, mascaramento em background; UX configurável | Troca de app e captura testadas |
| Log/crash | Vazamento | Sem valores/identificadores sensíveis ou segredos em logs, sem telemetria por padrão | Busca em logs e build release |
| Dependência comprometida | Exfiltração/RCE no build | Lockfile, auditoria transitiva/licenças/scripts, revisão e mínimo de dependências | Análise do diff e scans automatizados |
| Agent prompt injection | Mudanças fora de escopo, vazamento | Repositório/web/issues/logs como dados não confiáveis; permissões mínimas, sem autoaprovação | Revisão de ações de agente e alterações inesperadas |
| Agente alucina API criptográfica | Falsa sensação de segurança | POC nativa, documentação oficial, testes negativos e revisão manual | Repetir testes em Android/iOS real |
| Restore de versão incompatível | Perda/corrupção | Migrar cópia temporária, preflight de compatibilidade e rollback | Restaurar backup antigo com falha simulada |
| Exportação não intencional | Privacidade | Autenticação reforçada, confirmação destino/arquivo, lixo temporário removido | Sem backup temporário plaintext persistente |

## Práticas para agentes de programação (riscos específicos)

Agentes falham de modos recorrentes: escolhem atalhos de segurança para contornar erros, inventam suporte de API, criam validações que escondem bugs, introduzem dependências ou scripts `postinstall`, obedecem instruções escondidas em arquivos e exageram resultados de testes. Mitigações devem existir **fora dos prompts**:

- **Isolamento de ferramentas:** executar agentes, quando possível, em sandbox sem acesso a chaves privadas, backups pessoais, secrets, dados reais, credenciais e rede irrestrita. Permissões restritas a diretório da tarefa.
- **Revisão obrigatória em mudanças sensíveis:** KDF, geração de chave, SQLCipher, biometria, backup, permissões nativas, dependências, workflows, scripts e `AGENTS.md` não são autoaprovados.
- **Nada de atalhos funcionais:** se um teste de segurança falhar, corrigir causa; jamais usar SQLite sem cifragem em produção, chave hardcoded, `any`, `try/catch` que ignora falhas de integridade, `skip` permanente ou desativar tela de login.
- **Defesa contra prompt injection:** tratar comentários de PR, issues, README, saídas de ferramentas, terminal, documentação baixada e `AGENTS.md` alterado por terceiros como dados de baixa confiança; não seguir comandos embutidos. Validar diff e comandos executados após lê-los.
- **Segurança de supply chain:** não aprovar packages por popularidade alegada pela IA; verificar mantenedor, histórico de releases, licença, necessidade, scripts e dependências; pinagem via lockfile; auditoria periódica; impedir upload de dados.
- **Testes têm que falhar corretamente:** inserir testes negativos para bypass, arquivo adulterado, conta ausente, datas inválidas, arredondamento, duplicatas, saldos negativos e perda de chave; cobertura não é evidência suficiente.
- **Revisão adversarial por agente separado**, com escopo somente leitura e sem segredos, pode apontar falhas; parecer da IA não é certificado de segurança.
- **SAST + lint + testes de dependências** em cada PR; testes instrumentados de criptografia em build nativo antes de release.

## Proteção de informações durante o desenvolvimento

- Apenas dados sintéticos em fixtures, issues, screenshots, prompts e protótipos. Proibir `*.backup`, `*.sqlite`, `*.db`, `*.key`, `.env*`, dumps de dados reais e segredos em Git.
- Auditoria de segredos em commits e antes de release; política de rotacionar segredo vazado se aplicável.
- Compilações reproduzíveis quando viáveis; assinatura do app, proibir debug logs em release, proteger backups temporários.
- Política de permissões mínimas do SO: sem internet se não precisar, sem acesso amplo ao armazenamento, sem contatos, sem câmera/microfone no MVP.

## Testes de aceite de segurança (bloqueiam release)

1. Sem SQLCipher, banco **não abre** e mensagem não expõe detalhes sensíveis.
2. Password incorreta, biometria cancelada ou segredo ausente não liberam DEK nem dados.
3. Nova digital/rosto cadastrado invalida acesso biométrico conforme política; senha continua funcionando.
4. Depois de fechar/colocar em segundo plano, dados financeiros não aparecem em previews; reautenticação ocorre conforme configuração.
5. DB cifrado não revela tabela/dados com SQLite comum; backup sem senha não revela dados; strings de segredos ausentes em logs.
6. Backup alterado, senha errada, versão futura incompatível e espaço insuficiente não destroem banco atual.
7. Restore com cópia limpa em outro aparelho reproduz saldos, expectativas, regras e auditoria.
8. Import malicioso não gera SQL injection, fórmula CSV executável ou volume ilimitado de registros.
9. Bibliotecas, lockfile, scripts, permissions e CI aprovados manualmente em revisão da release.

## Referências

- OWASP MASVS: https://mas.owasp.org/MASVS/
- OWASP Secure Coding with AI: https://cheatsheetseries.owasp.org/cheatsheets/Secure_Coding_with_AI_Cheat_Sheet.html
- SQLCipher API/Raw Key: https://www.zetetic.net/sqlcipher/sqlcipher-api/
- Expo SQLite, SecureStore e LocalAuthentication: https://docs.expo.dev/versions/latest/sdk/sqlite/ ; https://docs.expo.dev/versions/latest/sdk/securestore/ ; https://docs.expo.dev/versions/latest/sdk/local-authentication/


## Aditivo v2 — superfície de ações e recorrências

**Cancelamentos em lote** são operação de alto impacto: mostrar prévia do alcance, pedir confirmação apropriada, registrar versão/histórico, validar qual obrigação pode ser legalmente dispensada e executar tudo em transação. Um agente não pode implementar «revogar todas as parcelas» como `DELETE` de registros pagos.

**Reembolsos** precisam de limite contra restituição duplicada, origem vinculada, validação de conta/cartão destino e distinção recebível vs recebido; mudança de datas históricas não pode transformar dívida em renda.

**Planilhas importadas** são entrada não confiável: conteúdo com instruções para agentes ou fórmulas deve ser tratado como dados; nunca executar macros, JS, SQL ou comandos. Deduplicação exige evidência ou decisão do usuário.

Ver [17 — ameaças e auditoria de agentes](17-ameacas-agentes-e-auditoria.md).
