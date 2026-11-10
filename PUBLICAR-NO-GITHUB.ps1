param(
  [Parameter(Mandatory=$true)]
  [ValidatePattern('^https://github\.com/[^/\s]+/[^/\s]+(\.git)?$')]
  [string]$RepoUrl
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git não está instalado. Instale Git para Windows e execute o script novamente.'
}
if (-not (Test-Path 'site/index.html') -or -not (Test-Path '.github/workflows/deploy-pages.yml')) {
  throw 'Execute dentro da pasta do projeto extraído, contendo site/ e .github/.'
}
if (Test-Path 'backend/.env') {
  throw 'Remova backend/.env da pasta de publicação. Mantenha senhas fora do GitHub.'
}
if (-not (Test-Path '.git')) {
  git init -b main
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar repositório Git.' }
}
# Somente arquivos do projeto: o .gitignore impede arquivos secretos comuns.
git add .github .gitignore README.md site extension backend PUBLICAR-NO-GITHUB.ps1
if ($LASTEXITCODE -ne 0) { throw 'Falha no git add.' }
$changes = git status --porcelain
if ($changes) {
  git commit -m 'CDE Imports Social Studio - GitHub Pages'
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar commit. Configure git user.name e git user.email, se solicitado.' }
}
$remote = git remote get-url origin 2>$null
if (-not $remote) { git remote add origin $RepoUrl }
elseif ($remote -ne $RepoUrl) { throw "Remote existente diferente: $remote. Confirme antes de alterar." }
git branch -M main
git push -u origin main
if ($LASTEXITCODE -ne 0) { throw 'Envio ao GitHub falhou. Confira login, permissões e se o repositório existe.' }
Write-Host 'Arquivos enviados ao GitHub. No repositório, abra Settings > Pages > Source > GitHub Actions.' -ForegroundColor Green
