#!/usr/bin/env bash
# Instala o llm-proxy-api como serviço de boot (macOS launchd ou Linux systemd --user).
# Roda a partir da raiz do projeto: bash infra/service/install.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE_PATH="$(command -v node)"
MAIN="$APP_DIR/apps/api/dist/main.js"

if [ ! -f "$MAIN" ]; then
  echo "Build não encontrado ($MAIN). Rode 'pnpm build' antes." >&2
  exit 1
fi

fill() { sed -e "s#{{APP_DIR}}#$APP_DIR#g" -e "s#{{NODE_PATH}}#$NODE_PATH#g" "$1"; }

case "$(uname -s)" in
  Darwin)
    DEST="$HOME/Library/LaunchAgents/com.llmproxy.plist"
    fill "$APP_DIR/infra/service/com.llmproxy.plist" > "$DEST"
    launchctl unload "$DEST" 2>/dev/null || true
    launchctl load "$DEST"
    echo "✓ LaunchAgent instalado e carregado ($DEST)."
    ;;
  Linux)
    mkdir -p "$HOME/.config/systemd/user"
    DEST="$HOME/.config/systemd/user/llm-proxy-api.service"
    fill "$APP_DIR/infra/service/llm-proxy-api.service" > "$DEST"
    systemctl --user daemon-reload
    systemctl --user enable --now llm-proxy-api
    echo "✓ systemd user service instalado e ativo."
    echo "  (opcional) 'loginctl enable-linger $USER' para subir sem sessão aberta."
    ;;
  *)
    echo "SO não suportado por este script. No Windows use infra/service/install-windows.ps1." >&2
    exit 1
    ;;
esac
