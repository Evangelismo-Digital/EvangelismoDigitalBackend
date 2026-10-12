# Põe o Node do .nvmrc à frente do PATH, para que os hooks rodem na MESMA versão
# que o CI (.nvmrc) e não na que estiver como padrão no shell do desenvolvedor.
#
# Por que não `nvm use`: o git executa os hooks com /bin/sh — dash no
# Debian/Ubuntu/WSL — e carregar o nvm.sh ali é lento e nem sempre funciona.
# Resolver o diretório da versão é POSIX puro e instantâneo.
#
# Degrada em silêncio de propósito: quem usa fnm, volta, asdf ou um Node do
# sistema não tem esse diretório, segue com o PATH de sempre e só recebe o aviso
# abaixo. Defina HUSKY_SKIP_NODE_PIN=1 para desligar.

if [ -z "${HUSKY_SKIP_NODE_PIN:-}" ] && [ -f .nvmrc ]; then
  _nvmrc_version="$(tr -d 'v \t\r\n' < .nvmrc)"
  _nvmrc_bin="$HOME/.nvm/versions/node/v${_nvmrc_version}/bin"

  if [ -d "$_nvmrc_bin" ]; then
    PATH="$_nvmrc_bin:$PATH"
    export PATH
  fi

  _running_version="$(node -v 2>/dev/null | tr -d 'v')"

  if [ -n "$_running_version" ] && [ "$_running_version" != "$_nvmrc_version" ]; then
    echo "AVISO: hook rodando em Node v${_running_version}, mas .nvmrc pede v${_nvmrc_version} (o CI usa .nvmrc)." >&2
  fi

  unset _nvmrc_version _nvmrc_bin _running_version
fi
