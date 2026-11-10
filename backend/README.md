# CDE Imports — Conectar redes sociais (OAuth)

Esta pasta contém um **servidor real para iniciar e concluir fluxos OAuth** de Instagram, TikTok, Pinterest e YouTube. Ele **não está hospedado no GitHub Pages**. Para autorizar contas reais, publique este serviço em uma hospedagem Node.js com HTTPS, disco persistente e credenciais de aplicativos oficiais.

## O que funciona

- Login administrativo, protegido por senha de 16+ caracteres, sessões temporárias e limitação de tentativas.
- Início de OAuth, verificação de `state` antirreplay, retorno e troca de código por token no servidor.
- Consulta de identidade da conta e armazenamento local criptografado (AES-256-GCM) no diretório privado `DATA_DIR`.
- Atualização de tokens quando aplicável, consulta de contas sem expor tokens, reconexão e desconexão.
- API liberada apenas para a origem `SITE_URL`, exigindo sessão administrativa nas rotas privadas.

**Não implementa ainda:** publicação automática, transmissão de vídeos para as redes, agendamento remoto de posts, análise de desempenho em tempo real, multiusuário ou postagem automática em grupos e Status do WhatsApp. O login e a permissão de publicação são etapas separadas.

## Hospedagem sugerida

O arquivo `../render.yaml` prepara uma implantação como Web Service Node no Render, **com disco persistente (pode ter custo)**. Alternativamente use Railway, VPS ou outra hospedagem que ofereça HTTPS e volume persistente.

1. Abra o Render e conecte seu repositório GitHub **trafficmavenads-cyber/cde-imports-social-studio**.
2. Crie um serviço pelo blueprint `render.yaml` ou um Web Service Node com pasta raiz `backend`.
3. Configure o domínio HTTPS do servidor em `BACKEND_URL` **sem barra final**, por exemplo `https://cde-social-auth.onrender.com`.
4. Configure `SITE_URL=https://trafficmavenads-cyber.github.io/cde-imports-social-studio/`.
5. Gere um segredo aleatório com `openssl rand -hex 32` e salve **apenas no painel privado da hospedagem** em `TOKEN_ENCRYPTION_KEY`. Nunca troque essa chave sem plano de migração: os dados criptografados existentes ficarão ilegíveis.
6. Configure uma senha aleatória longa em `ADMIN_PASSWORD`, e um diretório de volume persistente em `DATA_DIR` (`/var/data` no blueprint).
7. Cadastre seus aplicativos oficiais, configure os Client IDs e Secrets como variáveis privadas do servidor, e registre os endereços de retorno exatamente como abaixo.
8. No site GitHub Pages, em **Conexões**, salve a URL do servidor e clique em **Verificar servidor**. Entre com a senha de administração. Os botões OAuth aparecerão habilitados apenas nas redes cujo app esteja configurado.

### Endereços de retorno OAuth (por plataforma)

Substitua `https://SEU_BACKEND` pelo domínio público HTTPS exato do seu servidor.

- Instagram (app Meta, Instagram API with Instagram Login): `https://SEU_BACKEND/api/oauth/callback/instagram`
- TikTok (Login Kit para Web, com permissões aprovadas): `https://SEU_BACKEND/api/oauth/callback/tiktok`
- Pinterest (API v5): `https://SEU_BACKEND/api/oauth/callback/pinterest`
- Google Cloud (OAuth 2.0 Web client + YouTube Data API): `https://SEU_BACKEND/api/oauth/callback/youtube`

**Instagram:** é necessária uma conta profissional Business ou Creator; certifique-se de que o app Meta tem o produto correto e permissões para Instagram Login. **TikTok:** Login Kit e Content Posting são produtos diferentes, com permissões e análise de conformidade próprias. **Google:** o aplicativo OAuth pode exigir verificação e só permitir usuários de teste até essa verificação. **Pinterest:** a aprovação e o tipo de acesso do aplicativo condicionam o uso.

### Variáveis de ambiente

Veja `.env.example`. Não comite arquivos `.env`, senhas, tokens, dados do cliente ou volumes de disco no GitHub público.

### Teste local (somente desenvolvimento)

```bash
cd backend
npm install
# configure variáveis do .env.example no ambiente; este servidor não carrega .env automaticamente
npm start
```
Acesse `http://localhost:8080/api/health`. Sem as variáveis obrigatórias, o serviço falha ao iniciar propositalmente.

### Diagnóstico e segurança

- `GET /api/health`: verifica que o servidor está rodando e indica quais apps OAuth estão configurados; **não** indica que as contas estão autorizadas.
- `POST /api/login`: envia `{"password":"..."}` e recebe uma sessão administrativa temporária.
- `GET /api/accounts`: exige `Authorization: Bearer <sessão>` e exibe apenas nome/ID público e estado da autorização.
- `POST /api/oauth/start/<rede>`: exige sessão, devolve URL oficial de consentimento.
- `DELETE /api/accounts/<rede>`: desconecta localmente; para revogação completa, use também a área de aplicativos autorizados da plataforma.

O token de sessão administrativa fica no `sessionStorage` do navegador; tokens da rede ficam **apenas no servidor**. Para produção comercial, acrescente auditoria, backup seguro do volume, observabilidade e gestão de usuários antes de distribuir acesso a terceiros.
