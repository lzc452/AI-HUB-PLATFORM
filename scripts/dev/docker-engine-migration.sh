#!/usr/bin/env bash
# Docker Desktop → Rancher Desktop 迁移脚本（备份 / 恢复 / 验证）
#
# 用法:
#   ./docker-engine-migration.sh backup            # 在 Docker Desktop 上导出数据与镜像
#   ./docker-engine-migration.sh restore           # 在 Rancher Desktop 上恢复数据与镜像
#   ./docker-engine-migration.sh verify [--tests]  # 验证引擎、compose 与数据库（--tests 运行 Testcontainers 测试）
#   ./docker-engine-migration.sh help
#
# 环境变量（可选）:
#   BACKUP_DIR     备份目录，默认 $HOME/docker-migration-backup（其他设备按需覆盖）
#   PROJECT_ROOT   仓库根目录，默认脚本位置上级两级
#
# 选项:
#   --dry-run      只打印将执行的命令，不实际执行
#
# 无法脚本化的手动步骤（脚本会以提示文字输出）:
#   1. 从 https://rancherdesktop.io 下载并安装 Rancher Desktop
#   2. 首次启动向导: Container Engine 选 dockerd (moby)、Kubernetes 关闭、VM 内存按原引擎配置
#   3. Preferences → WSL → Proxy: HTTP/HTTPS 填 http://host.rancher-desktop.internal:7897
#      （需保持宿主机代理软件运行，且监听 0.0.0.0 / 开启 allow-lan）
#   4. 观察期（数天日常开发）稳定后，卸载 Docker Desktop:
#      wsl --unregister docker-desktop && wsl --unregister docker-desktop-data
#      docker context rm desktop-linux
#
# 回滚: 重启 Docker Desktop → docker context use desktop-linux → setx DOCKER_HOST ""
#       数据仍保留在 Docker Desktop 卷与备份目录中。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-${HOME}/docker-migration-backup}"

DRY_RUN=0
RUN_TESTS=0

# Git Bash (MSYS) 会把 docker run -v 中的 /backup、/data 改写为 Windows 路径
export MSYS_NO_PATHCONV=1

# 参与备份的数据卷（clamav-definitions 可重新下载，不备份；garage 两卷必须成对恢复）
DATA_VOLUMES=(postgres-data garage-metadata garage-data)
# 用于卷打包/解包的本地镜像（避免经代理拉取 alpine）
TAR_IMAGE="postgres:18.4-bookworm"

say()  { printf '%s\n' "$*"; }
warn() { printf '警告: %s\n' "$*" >&2; }
fail() { printf '错误: %s\n' "$*" >&2; exit 1; }

run() { # 执行命令；--dry-run 下仅打印
  if [ "${DRY_RUN}" -eq 1 ]; then
    printf '>>> %s\n' "$*"
  else
    "$@"
  fi
}

run_capture() { # 执行命令并将 stdout 写入 $1 指定的文件
  local out="$1"
  shift
  if [ "${DRY_RUN}" -eq 1 ]; then
    printf '>>> %s > %s\n' "$*" "${out}"
  else
    "$@" > "${out}"
  fi
}

run_silent() { # 同 run，但抑制命令输出（--dry-run 下仍打印命令）
  if [ "${DRY_RUN}" -eq 1 ]; then
    printf '>>> %s\n' "$*"
  else
    "$@" >/dev/null 2>&1
  fi
}

psql_count() { # 返回表行数（表名来自脚本常量，非用户输入）；dry-run 返回 dry-run
  local table="$1"
  if [ "${DRY_RUN}" -eq 1 ]; then
    printf '>>> compose exec -T postgres psql -U %s -d %s -tAc "SELECT count(*) FROM %s"\n' \
      "${POSTGRES_USER}" "${POSTGRES_DB}" "${table}" >&2
    printf '%s' "dry-run"
  else
    compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
      -tAc "SELECT count(*) FROM ${table}" 2>/dev/null || printf '%s' "失败"
  fi
}

compose() { # docker compose 包装（cd 进仓库根目录，使用相对 compose 文件，保证 .env 生效且路径不被 Windows 二进制误解析）
  (cd "${PROJECT_ROOT}" && docker compose -f compose.yaml -f compose.dev.yaml "$@")
}

project_name() { # 与卷命名一致的 compose 项目名（ai-hub-platform_*）
  local name
  if name="$(cd "${PROJECT_ROOT}" && docker compose -f compose.yaml config --project-name 2>/dev/null)"; then
    printf '%s' "${name}"
  else # 无 compose 插件时退回目录名小写
    printf '%s' "$(basename "${PROJECT_ROOT}" | tr '[:upper:]' '[:lower:]')"
  fi
}

db_creds() { # 从 .env 读取数据库凭据（缺失时使用 compose 默认值）
  POSTGRES_USER="ai_hub"
  POSTGRES_DB="ai_hub"
  if [ -f "${PROJECT_ROOT}/.env" ]; then
    local u d
    u="$(grep -E '^POSTGRES_USER=' "${PROJECT_ROOT}/.env" | tail -1 | cut -d= -f2-)"
    d="$(grep -E '^POSTGRES_DB=' "${PROJECT_ROOT}/.env" | tail -1 | cut -d= -f2-)"
    [ -n "${u}" ] && POSTGRES_USER="${u}"
    [ -n "${d}" ] && POSTGRES_DB="${d}"
  fi
}

require_engine() { # 检查 docker 引擎可达
  docker info >/dev/null 2>&1 || fail "docker 引擎不可达。备份需在 Docker Desktop 运行中执行，恢复/验证需在 Rancher Desktop 运行中执行。"
}

load_images_list() { # 当前引擎的全部可用镜像（排除 <none>）
  docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -Ev '^<none>|<none>:' | tr '\n' ' ' | sed 's/ $//'
}

manual_steps_before_install() {
  say ""
  say "下一步（手动）:"
  say "  1. 从 https://rancherdesktop.io 下载安装 Rancher Desktop"
  say "  2. 首次启动向导: Container Engine = dockerd (moby)、Kubernetes 关闭、VM 内存按原引擎设置"
  say "  3. Preferences → WSL → Proxy 配置代理（见脚本头部说明）"
  say "  4. 启动 Rancher Desktop 后执行: ./docker-engine-migration.sh restore"
}

manual_steps_after_restore() {
  say ""
  say "恢复完成。后续（手动）:"
  say "  1. 观察期数天日常开发（含一次 docker compose up --build 验证镜像构建）"
  say "  2. 稳定后卸载 Docker Desktop 并清理 WSL 发行版（见脚本头部说明）"
  say "  3. 回滚方式: 重启 Docker Desktop → docker context use desktop-linux → setx DOCKER_HOST \"\""
}

cmd_backup() {
  say "== 备份（Docker Desktop 运行中执行）=="
  require_engine
  local project
  project="$(project_name)"
  db_creds
  mkdir -p "${BACKUP_DIR}"
  say "项目名: ${project}  备份目录: ${BACKUP_DIR}"

  # 1. 数据库逻辑备份（postgres 需运行中；未运行则启动）
  run_silent compose up -d postgres --wait --wait-timeout 180 \
    || fail "postgres 无法启动，请检查 compose 服务与 .env"
  run_capture "${BACKUP_DIR}/ai-hub-db.sql" \
    compose exec -T postgres pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists
  say "数据库逻辑备份完成: ${BACKUP_DIR}/ai-hub-db.sql"

  # 2. 数据卷冷备份（停止 postgres 保证一致性；garage 随停随备）
  run_silent compose stop postgres garage || true
  for vol in "${DATA_VOLUMES[@]}"; do
    local name="${project}_${vol}"
    if docker volume inspect "${name}" >/dev/null 2>&1; then
      run docker run --rm -v "${name}:/data" -v "${BACKUP_DIR}:/backup" \
        "${TAR_IMAGE}" tar czf "/backup/${vol}.tar.gz" -C /data .
      say "卷 ${name} 已备份"
    else
      warn "卷 ${name} 不存在，跳过（首次部署无数据时正常）"
    fi
  done

  # 3. 镜像导出（避免迁移后经代理重拉）
  local images
  images="$(load_images_list)"
  if [ -n "${images}" ]; then
    run docker save -o "${BACKUP_DIR}/images.tar" ${images}
    say "镜像已导出: ${BACKUP_DIR}/images.tar（${images}）"
  else
    warn "没有可导出的镜像"
  fi

  say ""
  say "备份完成。备份目录: ${BACKUP_DIR}"
  say "  退出 Docker Desktop（保留安装，勿卸载），然后安装 Rancher Desktop。"
  manual_steps_before_install
}

cmd_restore() {
  say "== 恢复（Rancher Desktop 运行中执行）=="
  require_engine
  local project
  project="$(project_name)"
  db_creds
  [ -d "${BACKUP_DIR}" ] || fail "备份目录不存在: ${BACKUP_DIR}（可用 BACKUP_DIR 环境变量指定）"

  # 1. 加载镜像
  if [ -f "${BACKUP_DIR}/images.tar" ]; then
    run docker load -i "${BACKUP_DIR}/images.tar"
  else
    warn "images.tar 不存在，跳过镜像加载（将经代理重新拉取）"
  fi

  # 2. 启动基础服务创建卷（只等 postgres/garage；clamav 首次启动下载定义较慢，不阻塞等待）
  run_silent compose up -d --wait postgres garage --wait-timeout 300 \
    || fail "postgres/garage 启动失败"
  run_silent compose up -d clamav || warn "clamav 启动失败（不影响数据恢复）"

  # 3. 停止服务后解包数据卷（garage 元数据与数据一起恢复）
  run_silent compose stop postgres garage || true
  local restored=0
  for vol in "${DATA_VOLUMES[@]}"; do
    local name="${project}_${vol}"
    if [ -f "${BACKUP_DIR}/${vol}.tar.gz" ]; then
      run docker run --rm -v "${name}:/data" -v "${BACKUP_DIR}:/backup" \
        "${TAR_IMAGE}" sh -c "cd /data && tar xzf /backup/${vol}.tar.gz"
      say "卷 ${name} 已恢复"
      restored=1
    else
      warn "备份文件 ${vol}.tar.gz 不存在，跳过（可用 ai-hub-db.sql 手动恢复数据库）"
    fi
  done
  [ "${restored}" -eq 1 ] || warn "没有任何卷被恢复，请检查备份目录内容"

  # 4. 重启服务并验证
  run_silent compose up -d --wait postgres garage --wait-timeout 300 \
    || fail "恢复后 postgres/garage 启动失败"
  say "服务已恢复并健康。"

  # 5. 数据验证
  local employees outbox
  employees="$(psql_count employees)"
  outbox="$(psql_count outbox_events)"
  say "数据检查: employees=${employees}  outbox_events=${outbox}（失败则需手动恢复 ai-hub-db.sql）"
  manual_steps_after_restore
}

cmd_verify() {
  say "== 验证 =="
  require_engine
  local project
  project="$(project_name)"
  db_creds

  docker context ls
  docker info --format '引擎: {{.ServerVersion}}  CPU={{.NCPU}}  内存={{.MemTotal}}  OS={{.OperatingSystem}}' 2>/dev/null || true

  run bash -c 'cd "$1" && docker compose -f compose.yaml -f compose.test.yaml config --quiet' _ "${PROJECT_ROOT}" \
    && say "compose config 有效"

  if docker ps --format '{{.Names}}' | grep -q "${project}-postgres"; then
    local employees
    employees="$(psql_count employees)"
    say "数据库连通: employees=${employees}"
  else
    say "postgres 未运行，跳过数据库连通检查（先执行 ./docker-engine-migration.sh restore）"
  fi

  if [ -z "${DOCKER_HOST:-}" ]; then
    say ""
    say "提示: Testcontainers 集成测试需要 DOCKER_HOST，请执行:"
    say "  setx DOCKER_HOST \"npipe:////./pipe/docker_engine\"   （然后重开终端）"
  fi

  if [ "${RUN_TESTS}" -eq 1 ]; then
    say "运行 Testcontainers 数据库测试（约 1 分钟）..."
    (cd "${PROJECT_ROOT}" && corepack pnpm --filter @ai-hub/database test)
  fi
}

cmd_help() {
  sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  say ""
  say "子命令: backup | restore | verify [--tests] | help"
}

# ---- 参数解析 ----
CMD=""
for arg in "$@"; do
  case "${arg}" in
    --dry-run) DRY_RUN=1 ;;
    --tests)   RUN_TESTS=1 ;;
    backup|restore|verify|help) CMD="${arg}" ;;
    *) fail "未知参数: ${arg}（运行 ./docker-engine-migration.sh help 查看用法）" ;;
  esac
done
[ -n "${CMD}" ] || fail "缺少子命令（运行 ./docker-engine-migration.sh help 查看用法）"

case "${CMD}" in
  backup)  cmd_backup ;;
  restore) cmd_restore ;;
  verify)  cmd_verify ;;
  help)    cmd_help ;;
esac
