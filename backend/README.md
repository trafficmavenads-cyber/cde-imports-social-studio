## Assistente de conteúdo — legendas, hashtags e insights

O painel possui gerador **local e gratuito** de 2 versões de legenda para cada rede selecionada, sugestões de hashtags e ideias de pauta. Não é um modelo generativo: funciona com regras e texto do produto. As versões escolhidas por rede são salvas individualmente nas campanhas do navegador; se o usuário alterar o título, diferenciais, objetivo, tom ou redes depois de gerar, deverá gerar novamente. O botão de usar no texto principal só altera o editor principal, não a seleção individual de cada rede.

O painel **Insights de performance** calcula taxas e rankings apenas quando há registros manuais de visualizações, curtidas, comentários e compartilhamentos em publicações. Não consulta APIs sociais nem garante resultados. A taxa é (curtidas + comentários + compartilhamentos) / visualizações; pode exceder 100% em casos de múltiplas interações.

### IA generativa com Google Gemini — opção gratuita

O backend Render Free está preparado para usar o **Google Gemini 3.5 Flash-Lite** como IA padrão, disponível no nível gratuito do Gemini API dentro das cotas estabelecidas pelo Google. O projeto não muda automaticamente para um provedor pago se a cota gratuita acabar.

1. Crie sua própria chave Gemini na página **Google AI Studio → API keys**: https://aistudio.google.com/
2. Confirme que seu projeto possui acesso ao **Free Tier** antes de utilizar. Não ative faturamento pago se não quiser incorrer em custos.
3. No Render do serviço `cde-imports-social-demo`, entre em **Environment** e configure, **sem mostrar a chave na conversa ou no GitHub**:
   - `GEMINI_API_KEY`: sua chave privada do Google AI Studio
   - `ADMIN_PASSWORD`: senha administrativa exclusiva de **pelo menos 16 caracteres** (se já existe, preserve-a)
   - `GEMINI_MODEL`: opcional; padrão `gemini-3.5-flash-lite`
   - `AI_PROVIDER`: opcional; deixe vazio ou `gemini` para não usar fornecedor pago
4. Aguarde a implantação no Render e confira o campo `aiConfigured:true` e `aiProvider:"gemini"` em `https://cde-imports-social-demo.onrender.com/api/health`. A chave **não aparece** nessa resposta.
5. No [Social Studio](https://trafficmavenads-cyber.github.io/cde-imports-social-studio/#conexoes), clique em **Conexões**, entre com a senha administrativa; no gerador de conteúdo, clique em **Gerar com IA online**.

A rota autenticada `POST /api/ai/captions` recebe título, diferenciais, tom, objetivo e redes. O backend usa `models.generateContent` com `generationConfig.responseMimeType:application/json` e `systemInstruction` na API REST do Google. Há limite de **10 solicitações por hora por instância** em memória, além dos limites do Google. Se o Gemini retornar HTTP 429, o painel exibirá aviso de cota e o usuário poderá recorrer ao gerador local, que continua independente da API.

**Privacidade:** no nível gratuito do Gemini, dados enviados podem ser utilizados pelo Google para aprimorar os serviços, conforme as condições vigentes. **Não inclua dados pessoais, senhas, segredos ou informações sigilosas** nos pedidos do gerador. Sempre revise as legendas antes de publicar.

**OpenAI legada (somente opt-in):** o código também aceita `OPENAI_API_KEY`, mas **não a utiliza automaticamente**. Apenas quem configurar expressamente `AI_PROVIDER=openai` ativa esse fornecedor, que pode gerar cobrança. Não configure esse modo se quer custo zero.

---
## Instagram — Login direto de conta profissional (versão 0.10 de teste)

A mesma instância **Render Free** aceita testes de Login Kit do TikTok e **Instagram API with Instagram Login**, de forma independente, com tokens somente em memória. A conexão do Instagram não depende da aprovação do TikTok.

1. A conta precisa ser **profissional (Empresa ou Criador)**. A modalidade Instagram Login dispensa associar o perfil a uma Página do Facebook; não confunda com a modalidade Instagram API with Facebook Login.
2. Entre em https://developers.facebook.com/apps/ e crie/abra um aplicativo. Adicione o produto **Instagram → API setup with Instagram Login**, nas versões do painel Meta em que estiver disponível.
3. Na configuração **Business login settings → OAuth redirect URIs**, registre exatamente:
   `https://cde-imports-social-demo.onrender.com/api/oauth/callback/instagram`
4. Configure inicialmente a permissão `instagram_business_basic` (identificação do perfil). Para publicar posteriormente, solicite `instagram_business_content_publish`, sujeito aos requisitos da Meta.
5. Copie o **Instagram App ID** e o **Instagram App Secret** obtidos dentro das configurações da API do Instagram. **Eles podem ser diferentes do Meta App ID e App Secret gerais.**
6. No Render, serviço `cde-imports-social-demo`, **Environment**, cadastre `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET` e, caso ainda não exista, uma `ADMIN_PASSWORD` nova com no mínimo 16 caracteres. Não publique valores no GitHub ou no chat.
7. Depois do deploy, confira `/api/health`: `providerConfigured.instagram=true`. No [Social Studio](https://trafficmavenads-cyber.github.io/cde-imports-social-studio/#conexoes), entre com a senha administrativa, clique **Conectar Instagram** e autorize pelo login oficial da Meta.
8. Durante testes em modo desenvolvimento, a conta precisa ter o papel/permissão de teste exigido pelo app Meta. Pessoas externas precisam de aprovações e permissões aplicáveis. A integração não publica posts automaticamente.

**Limitações importantes:** tokens temporários são descartados em suspensão, restart ou deploy da instância gratuita; o ambiente não é recomendado para operações de produção e não possui cofre persistente. O primeiro login usa `instagram_business_basic`, sem permissões de publicação ou mensagens. Ao solicitar novas permissões, teste novamente a autorização e siga a revisão da Meta.

---
## Testar TikTok Login Kit no Render gratuito (versão 0.9)

O serviço `cde-imports-social-demo` usa `backend/demo-server.js`. Agora ele tem dois modos:

- **Demo padrão:** nenhum login real, nenhuma senha ou token recebido, nenhuma publicação. A API `/api/health` devolve `demoMode: true`.
- **Login temporário TikTok:** habilitado **somente** quando a hospedagem contém as três variáveis privadas `TIKTOK_CLIENT_ID` (Client Key), `TIKTOK_CLIENT_SECRET` e `ADMIN_PASSWORD` (senha **nova**, de no mínimo 16 caracteres). A API devolve `demoMode: false` e `providerConfigured.tiktok: true`.

**O Render gratuito não guarda tokens persistentemente.** As sessões e os tokens de TikTok são mantidos somente na memória do processo Node. Após suspensão por inatividade, reinício ou deploy, o administrador precisa autorizar a conta novamente. Esta estrutura é **somente para testes**, sem agendamento e sem publicação automática.

1. Em [TikTok Developers Apps](https://developers.tiktok.com/apps/), abra seu aplicativo, ative **Login Kit (Web)** e registre exatamente a Redirect URI:
   `https://cde-imports-social-demo.onrender.com/api/oauth/callback/tiktok`
2. Confirme a permissão `user.info.basic`. É a única solicitada por padrão; as permissões de publicação são gerenciadas separadamente.
3. No [Render do Social Studio](https://dashboard.render.com/web/srv-dbpkmi56e07s73d9fci0), abra **Environment** e cadastre, **somente lá**, `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET` e uma `ADMIN_PASSWORD` aleatória e diferente da senha do Render. Não poste esses valores em mensagens ou no GitHub.
4. Aguarde a implantação acionada pela atualização de variáveis. Abra `https://cde-imports-social-demo.onrender.com/api/health` e confira `"demoMode":false`.
5. No [Social Studio](https://trafficmavenads-cyber.github.io/cde-imports-social-studio/#conexoes), pressione **Verificar servidor**, entre com sua nova senha administrativa, clique em **Conectar TikTok** e autorize no TikTok.
6. Volte ao painel e veja o nome da conta conectada. Ao encerrar a sessão ou o servidor entrar em suspensão, será necessário autenticar novamente.

Não existe configuração de backend que ignore as aprovações do TikTok. Para upload de vídeo use `video.upload`; para Direct Post, `video.publish` e auditoria são etapas adicionais.

---
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
