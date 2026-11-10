# CDE Imports — Social Studio + Extensão + Conector (projeto para GitHub)

**Situação da entrega:** repositório **preparado** para publicação. **Não foi enviado para uma conta GitHub nem colocado no ar automaticamente.**

Este pacote contém três componentes distintos:

| Pasta | Função | Onde roda | Estado |
|---|---|---|---|
| `site/` | Painel web com criação de arte, PNG, legenda, calendário e métricas manuais | GitHub Pages | Estático, testado localmente sem servidor |
| `extension/` | Código de extensão CDE Imports v0.7 de desenvolvimento | Chrome | Experimental; backup da extensão anterior antes de trocar |
| `backend/` | Protótipo de servidor Node para OAuth, fila e APIs oficiais | Servidor Node persistente com HTTPS | **Experimental, não validado em contas reais** |

## Publicação do painel no GitHub Pages

1. Crie na sua conta GitHub um repositório, por exemplo, `cde-imports-social-studio`. Pode ser público se pretende usar Pages gratuito. **Nunca** envie `.env`, tokens, cookies, senhas, backups pessoais nem bancos de dados para GitHub.
2. Baixe e **extraia o ZIP inteiro** deste projeto no Windows. Não envie o ZIP como um único arquivo ao repositório: o Pages precisa dos arquivos extraídos.
3. No computador, instale o Git, se necessário. Abra PowerShell na pasta extraída e execute:

   ```powershell
   .\PUBLICAR-NO-GITHUB.ps1 -RepoUrl "https://github.com/SEU-USUARIO/cde-imports-social-studio.git"
   ```

   Substitua o usuário e nome do repositório pelos seus. Conclua a autenticação do Git no navegador quando solicitado.
4. Em **GitHub > repositório > Settings > Pages > Build and deployment > Source**, escolha **GitHub Actions**. O fluxo `.github/workflows/deploy-pages.yml` publica somente `site/` a cada push para `main`.
5. Acompanhe a aba **Actions**. Quando aparecer o deployment concluído, em **Settings > Pages**, use o link **Visit site**. A URL geralmente terá o formato `https://SEU-USUARIO.github.io/cde-imports-social-studio/`.

Se a primeira execução da Action falhar porque Pages ainda não estava ativado, configure Pages e execute a Action novamente em **Actions > Publicar painel... > Run workflow**.

**Nota:** se o PowerShell bloquear a execução do script, use temporariamente `powershell -ExecutionPolicy Bypass -File .\PUBLICAR-NO-GITHUB.ps1 -RepoUrl "..."`, depois de inspecionar o script. Alternativamente use os comandos `git` de forma manual. A instalação do Git precisa ser concluída no seu computador.

## O que o painel web realmente faz

- Aplica identidade CDE Imports: logotipo, `cdeimports.site`, faixas azul/vermelha/amarela e marca d'água.
- Edita artes **de imagens**, com upload JPG/PNG/WebP ou tentativa de URL direta HTTPS (alguns sites bloqueiam uso externo).
- Gera PNG (1080×1080, 1080×1920, 1000×1500), copia legenda e usa compartilhamento nativo quando o navegador permite.
- Guarda **localmente no navegador** a fila, calendário, nomes, legendas, links e números de insights preenchidos manualmente.
- Exporta um backup JSON de campanhas (não inclui arquivo original da imagem).

**Não faz:** login social, publicação em lote, postagem automática agendada, upload de vídeos para redes ou coleta automática de métricas. Os destinos selecionados no painel são um **plano editorial**; o site não finge publicação. O GitHub Pages não executa `backend/server.js` nem permite guardar OAuth secrets com segurança no frontend.

## Servidor necessário para publicar nas redes com as contas conectadas

`backend/server.js` é um **protótipo de integração** que exige:

- Hospedagem Node.js **contínua** (não um GitHub Pages), HTTPS e armazenamento **persistente** em `backend/data/` (vault criptografado, fila e mídias).
- Credenciais dos aplicativos desenvolvedores do Instagram/Meta, TikTok, Pinterest e Google/YouTube, mais aprovações e permissões oficiais. Nem todas as ações desejadas são aceitas por todas as plataformas.
- Revisão de segurança antes de produção: autenticação por usuário, armazenamento de tokens, proteção de upload, quotas/retries, geração de vídeo final compatível e isolamento de dados.
- Para usar a extensão com um servidor externo, a extensão prevê uma URL de servidor HTTPS e chave de API, **mas essa chave simples não é mecanismo apropriado para um SaaS público multiusuário**.
- Grupos e Status do WhatsApp permanecem em modo assistido, pois não foi configurada uma API oficial de publicação automatizada para esses destinos.

**Não publique segredos em repositórios públicos.** Configure segredos diretamente no painel do provedor de hospedagem, nunca no GitHub Pages, em `site/app.js` ou na conversa.

## Testes feitos

- `node --check` do JavaScript do site, extensão e servidor.
- Teste de navegador em memória: carregamento do painel, criação de campanha para dois destinos, download PNG e backup JSON, sem erros de JS.
- **Não testado:** implantação na conta GitHub do usuário, OAuth real de plataformas, postagem real, vídeo em produção e deploy do servidor em uma nuvem.

## Evolução sugerida

1. Publicar painel estático no GitHub Pages.
2. Hospedar backend em serviço apropriado com armazenamento persistente e HTTPS.
3. Configurar OAuth por rede, permissões de publicação e validação de contas.
4. Implementar login de usuários e agendamento real seguro, testar uma rede por vez e só então habilitar “Publicar em todas”.
5. Ativar sincronização oficial dos insights suportados por cada rede.

Documentação: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [Instagram Platform](https://developers.facebook.com/docs/instagram-platform/), [TikTok Content Posting](https://developers.tiktok.com/doc/content-posting-api-get-started/), [Pinterest Developers](https://developers.pinterest.com/docs/), [YouTube Data API](https://developers.google.com/youtube/v3/).
