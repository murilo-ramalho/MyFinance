# 11 — Referências técnicas (consultadas em 23/10/2026)

Fontes externas de autoridade para confirmação de APIs, integrações e controles. A documentação `latest` muda; **revalidar na versão escolhida ao iniciar implementação**.

1. Expo SQLite e SQLCipher: https://docs.expo.dev/versions/latest/sdk/sqlite/ — `useSQLCipher`, `prebuild`, `PRAGMA cipher_version`, SQLite Backup API, prepared statements. Observação crítica: `PRAGMA key` é ignorado por SQLite comum, portanto verificar cipher antes de usar.
2. Expo Local Authentication: https://docs.expo.dev/versions/latest/sdk/local-authentication/ — suporte biométrico/Face ID, classe de biometria e limites de Expo Go.
3. Expo SecureStore: https://docs.expo.dev/versions/latest/sdk/securestore/ — pequenos segredos protegidos, diferenças de persistência no Android/iOS, invalidação após mudança de biometria.
4. Expo Sharing: https://docs.expo.dev/versions/latest/sdk/sharing/ — seletor de compartilhamento.
5. Expo DocumentPicker: https://docs.expo.dev/versions/latest/sdk/document-picker/ — seleção de arquivos para importação/restauração.
6. Expo ScreenCapture: https://docs.expo.dev/versions/latest/sdk/screen-capture/ — proteção de captura e prévia no app switcher; limitações específicas.
7. Zetetic SQLCipher API: https://www.zetetic.net/sqlcipher/sqlcipher-api/ — keying, raw keys e validação de acesso.
8. OWASP MASVS: https://mas.owasp.org/MASVS/ — verificação de segurança mobile (armazenamento, cripto, autenticação, plataforma, privacidade, qualidade de código).
9. OWASP Secure Coding with AI: https://cheatsheetseries.owasp.org/cheatsheets/Secure_Coding_with_AI_Cheat_Sheet.html — riscos de agentes de codificação, prompt injection via repositório, scripts e supply chain.
10. OWASP GenAI Excessive Agency: https://genai.owasp.org/llmrisk/llm062025-excessive-agency/ — minimizar ferramentas, privilégios e autonomia.
11. Android Auto Backup: https://developer.android.com/identity/data/autobackup — regras de exclusão e implicações para chaves não restauráveis.
12. Padrão iCalendar RFC 5545: https://www.rfc-editor.org/rfc/rfc5545 — recorrências baseadas em calendário; regras baseadas em última execução exigem lógica de domínio adicional.

## Observações de atualidade

Não fixar aqui uma versão de SDK ou pacote só por estar indicada na página `latest`; usar `npx expo install`, matriz de compatibilidade e `lockfile` após a decisão de versão. Alguns recursos exigem build nativo e testes em aparelhos reais. Referências de segurança orientam a implementação, mas não a garantem.


## Fontes verificadas para a versão 2 (23/10/2026)

- Expo SQLite — SQLCipher suportado em builds nativos, mas não em Expo Go; configurar `useSQLCipher` e **verificar `PRAGMA cipher_version`**: https://docs.expo.dev/versions/latest/sdk/sqlite/
- Expo SecureStore — segredos pequenos; invalidação após alteração biométrica e diferenças de reinstalação Android/iOS: https://docs.expo.dev/versions/latest/sdk/securestore/
- Expo LocalAuthentication — impressão digital/Face ID, dependência de build nativo para alguns fluxos: https://docs.expo.dev/versions/latest/sdk/local-authentication/
- OWASP MASVS — segurança do armazenamento, criptografia, autenticação, plataforma e privacidade: https://mas.owasp.org/MASVS/
- RFC 5545 — `RRULE`, `UNTIL`, `COUNT`, `EXDATE`; base para repetição de calendário, sem semântica de pagamento: https://www.rfc-editor.org/rfc/rfc5545.html

Verificar novamente versões e compatibilidade quando a implementação começar. Criptografia e biometria exigem prova de funcionamento em aparelho físico, não apenas documentação/configuração.
