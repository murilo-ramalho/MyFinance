# 07 — Backup, restauração e importação/exportação

## Princípios

- O backup precisa continuar recuperável **sem o aparelho original**.
- Proteção de banco em repouso e proteção de exportação são **independentes**.
- O arquivo exportado contém tudo necessário para reconstrução, exceto o segredo de recuperação conhecido pelo usuário; jamais incluir DEK sem proteção.
- Formato versionado e documentado; nenhum dado real é enviado automaticamente a servidores do projeto.

## Formato proposto `.cofrebackup` (design lógico)

```text
[HEADER mínimo: magic + versão + salt KDF + parâmetros + nonce]
[PAYLOAD: AEAD_encrypt(backup_key, versão de dados + manifesto + DB consistente + anexos)]
[TAG de autenticação do AEAD]
```

Usar implementação auditada e testada de AEAD (por exemplo AES-256-GCM), chave derivada da **senha de backup independente da senha de login** com Argon2id/scrypt. Cabeçalho e metadados não secretos devem ser autenticados como AAD. Não gerar nonces repetidos sob a mesma chave; cada exportação com salt/nonce novos. Não inventar criptografia artesanal ou biblioteca customizada JS.

O “DB consistente” pode ser snapshot via SQLite Backup API ou mecanismo validado de SQLCipher, **não** simples cópia de arquivo em escrita ativa. Validar se snapshot mantém cifragem e se integração expõe dados temporários; se exportar DB plaintext intermediário, ele é risco grave e precisa ser evitado ou contido em memória/ambiente nativo protegido com remoção verificável, preferindo nunca criá-lo.

## Exportação segura

1. Reautenticação para exportar, definir/confirmar senha de recuperação e checar espaço.
2. Criar snapshot consistente e validado.
3. Empacotar dados necessários e cifrar com senha de backup independente.
4. Validar checksum/autenticação, tamanho e capacidade de leitura antes de declarar sucesso.
5. Permitir compartilhar **somente o arquivo cifrado** pelo seletor do SO; o destino (Drive, iCloud, dispositivo etc.) é escolha do usuário.
6. Remover temporários e manter informação sobre última cópia verificada.

## Restauração segura

1. Selecionar arquivo local/remoto via document picker; copiar para área temporária privada.
2. Validar assinatura do formato, limites, KDF, tag AEAD, manifesto, versões e compatibilidade; senha incorreta = falha sem alteração.
3. Descriptografar/migrar em área temporária segura, executar `integrity_check`/validações de negócio e comparar contagens/saldos conhecidos.
4. Exibir prévia: data, versão, conta(s), número de registros e aviso de substituição; **não expor informação até autenticação apropriada**.
5. Criar ponto de restauração do cofre atual (criptografado), fechar conexões, trocar arquivos/transações de modo atômico, reabrir e verificar.
6. Ao falhar, manter banco anterior intacto; limpar temporários e registrar erro técnico sem segredo.

## Importação de dados externos

Importar CSV/OFX **não é restaurar**: usa parser com limites, mapeamento de colunas, validação de moeda/valor/data/sinal, prévia, aviso de possível duplicação e confirmação antes de aplicar. Registrar lote e origem para desfazer importação de maneira auditável. OFX é evolução P2, sujeito a biblioteca confiável.

### Riscos CSV

Entrada: tamanho máximo, limite de linhas/colunas, codificação, datas, números locais, strings longas, parsing como dados não como código. Saída: neutralizar fórmulas que iniciem com `=`, `+`, `-` e `@` ao abrir em planilhas, preservando possibilidade de importar depois (definir escaping explícito no formato exportado). Sem SQL montado por concatenação.

## Política de backup

MVP: exportação manual clara, lembrete após um intervalo configurável e teste de restauração. Automação para nuvem depende de integrações/limites de background de Android/iOS e não é promessa do MVP. Manter ao menos duas cópias em locais separados, com senha de backup fora do mesmo aparelho; oferecer teste de recuperação após backup.

## Protocolo de compatibilidade

`format_version`, `db_schema_version`, versão de serialização, parâmetros KDF e conjunto de anexos. Se futuro formato for desconhecido, recusar e orientar atualização do app; nunca restaurar parcialmente sem confirmação/regras. Testes de rollback entre versões suportadas.

## Falhas tratadas

Espaço insuficiente, compartilhamento cancelado, senha incorreta, arquivo adulterado, arquivo gigantesco, exportação interrompida, app suspenso, rede indisponível, versão incompatível, migração que falha, duplicatas e dados corrompidos.


## Aditivo v2 — continuidade do modelo

Backups devem conter séries e versões, exceções, ocorrências materializadas, compras, obrigações, pagamentos, estornos, vínculos e revisões; após restauração não podem reaparecer parcelas previamente canceladas nem estornos duplicados. Recomputar projeções a partir da fonte restaurada e conferir checksums/constraints. Importações de planilha passam por etapa explícita de **classificação e conciliação**, com «LETREIRO» e «ZOKI» mantidos separados. Horário desconhecido continua `NULL`.
