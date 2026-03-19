#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OS_ID=""
OS_VERSION_CODENAME=""

log() {
  printf '\n==> %s\n' "$1"
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "请使用 root 用户执行，或先运行 sudo -i 再执行本脚本。" >&2
    exit 1
  fi
}

load_os_release() {
  if [[ ! -f /etc/os-release ]]; then
    echo "未找到 /etc/os-release，暂不支持该系统。" >&2
    exit 1
  fi

  # shellcheck disable=SC1091
  source /etc/os-release
  OS_ID="${ID:-}"
  OS_VERSION_CODENAME="${VERSION_CODENAME:-}"

  if [[ "${OS_ID}" != "ubuntu" && "${OS_ID}" != "debian" ]]; then
    echo "当前仅支持 Ubuntu / Debian，检测到系统: ${OS_ID}" >&2
    exit 1
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "检测到 Docker 与 Docker Compose 已安装，跳过安装步骤"
    return
  fi

  log "安装 Docker 与 Docker Compose"
  apt update
  apt install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings

  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL "https://download.docker.com/linux/${OS_ID}/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${OS_ID} ${OS_VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list

  apt update
  apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl restart docker
}

open_firewall() {
  if command -v ufw >/dev/null 2>&1; then
    log "配置 ufw 防火墙规则"
    ufw allow OpenSSH >/dev/null 2>&1 || true
    ufw allow 8000/tcp >/dev/null 2>&1 || true
    ufw --force enable >/dev/null 2>&1 || true
  else
    log "未检测到 ufw，跳过防火墙配置；如有云安全组，请手动放通 TCP 8000"
  fi
}

start_service() {
  log "构建并启动应用容器"
  cd "${PROJECT_DIR}"
  docker compose up -d --build
}

show_result() {
  local public_ip
  public_ip="$(curl -fsSL https://api.ipify.org || true)"

  log "部署完成，当前服务状态"
  cd "${PROJECT_DIR}"
  docker compose ps

  cat <<EOF

可用访问地址：
- 本机健康检查: http://127.0.0.1:8000/api/health
- 本机 GeoJSON 接口: http://127.0.0.1:8000/api/conduits
EOF

  if [[ -n "${public_ip}" ]]; then
    cat <<EOF
- 浏览器页面: http://${public_ip}:8000
- Swagger 文档: http://${public_ip}:8000/docs
EOF
  else
    cat <<EOF
- 浏览器页面: http://<你的VPS公网IP>:8000
- Swagger 文档: http://<你的VPS公网IP>:8000/docs
EOF
  fi

  cat <<'EOF'

常用命令：
- 查看日志: docker compose logs -f conduit-map
- 重启服务: docker compose restart conduit-map
- 停止服务: docker compose down
EOF
}

main() {
  require_root
  load_os_release
  install_docker
  open_firewall
  start_service
  show_result
}

main "$@"
