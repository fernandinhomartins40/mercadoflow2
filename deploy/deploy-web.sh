#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/root/mercadoflow-web}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.vps.yml}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-mercadoflow-web}"
POSTGRES_VOLUME_NAME="${MERCADOFLOW_POSTGRES_VOLUME:-${PROJECT_NAME}_mercadoflow_postgres_data}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3300/health}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-24}"
HEALTH_SLEEP_SECONDS="${HEALTH_SLEEP_SECONDS:-10}"
POSTGRES_DB="${POSTGRES_DB:-pdv2cloud}"
POSTGRES_USER="${POSTGRES_USER:-pdv2cloud}"
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-superadmin@mercadoflow.com}"
SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-SuperAdmin@2026}"
SUPER_ADMIN_NAME="${SUPER_ADMIN_NAME:-Super Administrador}"
CATALOG_HARVESTER_INTERVAL_MINUTES="${CATALOG_HARVESTER_INTERVAL_MINUTES:-360}"
BARCODE_ENRICH_INTERVAL_MINUTES="${BARCODE_ENRICH_INTERVAL_MINUTES:-720}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

compose() {
  docker compose --project-name "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "ERRO: arquivo obrigatório ausente: $path" >&2
    exit 1
  fi
}

ensure_secret_file() {
  local file_path="$1"
  local bytes="$2"
  local label="$3"
  if [[ -f "$file_path" && -s "$file_path" ]]; then
    return
  fi

  log "Gerando ${label}"
  openssl rand -hex "$bytes" > "$file_path"
  chmod 600 "$file_path"
}

write_env_file() {
  local jwt_secret
  local db_password
  jwt_secret="$(< .jwt_secret)"
  db_password="$(< .db_secret)"

  cat > .env.tmp <<EOF
NODE_ENV=production
COMPOSE_PROJECT_NAME=${PROJECT_NAME}
POSTGRES_DB=${POSTGRES_DB}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${db_password}
DATABASE_URL=jdbc:postgresql://mercadoflow-postgres:5432/${POSTGRES_DB}
DATABASE_USER=${POSTGRES_USER}
DATABASE_PASSWORD=${db_password}
JWT_SECRET=${jwt_secret}
CORS_ORIGIN=https://mercadoflow.com,https://www.mercadoflow.com
REACT_APP_API_BASE_URL=https://mercadoflow.com/api
APP_PUBLIC_BASE_URL=https://mercadoflow.com
SUPER_ADMIN_EMAIL=${SUPER_ADMIN_EMAIL}
SUPER_ADMIN_PASSWORD=${SUPER_ADMIN_PASSWORD}
SUPER_ADMIN_NAME=${SUPER_ADMIN_NAME}
CATALOG_HARVESTER_INTERVAL_MINUTES=${CATALOG_HARVESTER_INTERVAL_MINUTES}
BARCODE_ENRICH_INTERVAL_MINUTES=${BARCODE_ENRICH_INTERVAL_MINUTES}
MERCADOFLOW_POSTGRES_VOLUME=${POSTGRES_VOLUME_NAME}
BUILD_TIMESTAMP=$(date +%s)
EOF

  mv .env.tmp .env
  chmod 600 .env
}

backup_database() {
  local container_name="mercadoflow-postgres"
  if ! docker ps --format '{{.Names}}' | grep -qx "$container_name"; then
    log "PostgreSQL ainda não está rodando; backup será pulado neste ciclo"
    return
  fi

  mkdir -p "${APP_DIR}/backups"
  local backup_file="${APP_DIR}/backups/backup_$(date +%Y%m%d_%H%M%S).sql"

  log "Gerando backup lógico do PostgreSQL"
  if docker exec "$container_name" sh -lc "pg_dump -U '${POSTGRES_USER}' '${POSTGRES_DB}' > /tmp/pdv2cloud_backup.sql"; then
    docker cp "${container_name}:/tmp/pdv2cloud_backup.sql" "$backup_file"
    docker exec "$container_name" rm -f /tmp/pdv2cloud_backup.sql >/dev/null 2>&1 || true
    if [[ -s "$backup_file" ]]; then
      log "Backup salvo em $backup_file"
      ls -t "${APP_DIR}"/backups/backup_*.sql 2>/dev/null | tail -n +8 | xargs -r rm -f
      return
    fi
  fi

  rm -f "$backup_file"
  log "WARN: backup não pôde ser concluído"
}

ensure_catalog_volume() {
  if docker volume inspect "${POSTGRES_VOLUME_NAME}" >/dev/null 2>&1; then
    log "Volume do catálogo já existe: ${POSTGRES_VOLUME_NAME}"
    return
  fi

  log "Criando volume persistente do PostgreSQL: ${POSTGRES_VOLUME_NAME}"
  docker volume create "${POSTGRES_VOLUME_NAME}" >/dev/null
}

wait_for_health() {
  local attempt=1
  while (( attempt <= HEALTH_ATTEMPTS )); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      log "Health check OK em $HEALTH_URL"
      return
    fi

    log "Health check pendente (${attempt}/${HEALTH_ATTEMPTS}); aguardando ${HEALTH_SLEEP_SECONDS}s"
    if (( attempt % 4 == 0 )); then
      docker logs mercadoflow-backend --tail=40 || true
    fi
    sleep "$HEALTH_SLEEP_SECONDS"
    ((attempt++))
  done

  echo "ERRO: aplicação não ficou saudável após o deploy" >&2
  compose ps || true
  compose logs --tail=120 || true
  exit 1
}

build_agent_installer() {
  local script_path="${APP_DIR}/pdv2cloud-agent/scripts/build-installer-vps.sh"
  if [[ ! -f "$script_path" ]]; then
    log "Script de build do instalador não encontrado; mantendo artefato atual"
    return
  fi

  log "Atualizando instalador do agente desktop"
  chmod +x "$script_path"
  "$script_path"
}

ensure_host_nginx_proxy() {
  if ! command -v nginx >/dev/null 2>&1; then
    log "Nginx do host não encontrado; mantendo apenas o Nginx containerizado"
    return
  fi

  local config_path="/etc/nginx/sites-available/mercadoflow.conf"
  local cert_dir="/etc/letsencrypt/live/mercadoflow.com"
  local fullchain="${cert_dir}/fullchain.pem"
  local privkey="${cert_dir}/privkey.pem"

  if [[ -f "$fullchain" && -f "$privkey" ]]; then
    cat > "$config_path" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name mercadoflow.com www.mercadoflow.com;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name mercadoflow.com www.mercadoflow.com;

    ssl_certificate ${fullchain};
    ssl_certificate_key ${privkey};

    access_log /var/log/nginx/mercadoflow-access.log;
    error_log /var/log/nginx/mercadoflow-error.log;

    client_max_body_size 50M;
    client_body_timeout 600s;

    location / {
        proxy_pass http://127.0.0.1:3300;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    location /health {
        proxy_pass http://127.0.0.1:3300/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        access_log off;
    }
}
EOF
  else
    cat > "$config_path" <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name mercadoflow.com www.mercadoflow.com;

    access_log /var/log/nginx/mercadoflow-access.log;
    error_log /var/log/nginx/mercadoflow-error.log;

    client_max_body_size 50M;
    client_body_timeout 600s;

    location / {
        proxy_pass http://127.0.0.1:3300;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:3300/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        access_log off;
    }
}
EOF
    log "WARN: certificados SSL não encontrados; Nginx do host ficará em HTTP até o certbot ser configurado"
  fi

  ln -sfn "$config_path" /etc/nginx/sites-enabled/mercadoflow.conf
  rm -f /etc/nginx/sites-enabled/default

  log "Validando e recarregando Nginx do host"
  nginx -t
  systemctl reload nginx
}

main() {
  cd "$APP_DIR"

  log "Validando estrutura do projeto"
  require_file "backend/pom.xml"
  require_file "frontend/package.json"
  require_file "$COMPOSE_FILE"
  require_file "deploy/nginx.vps.conf"

  mkdir -p data/catalog/images
  mkdir -p data/catalog/runs

  ensure_secret_file ".jwt_secret" 64 "JWT secret"
  ensure_secret_file ".db_secret" 16 "senha do PostgreSQL"
  write_env_file

  export DOCKER_BUILDKIT=1
  export COMPOSE_DOCKER_CLI_BUILD=1

  log "Validando docker compose"
  compose config -q

  ensure_catalog_volume

  log "Preservando volumes existentes"
  docker volume ls --format '{{.Name}}' | grep "${POSTGRES_VOLUME_NAME}" || true

  backup_database

  log "Atualizando imagens base"
  docker pull postgres:16-alpine
  docker pull nginx:alpine

  build_agent_installer

  log "Construindo imagens da aplicação"
  compose build --pull mercadoflow-backend mercadoflow-frontend mercadoflow-cron

  log "Aplicando atualização sem remover volumes"
  compose up -d --force-recreate --remove-orphans \
    mercadoflow-postgres \
    mercadoflow-backend \
    mercadoflow-frontend \
    mercadoflow-cron \
    mercadoflow-nginx \
    mercadoflow-catalog-harvester \
    mercadoflow-barcode-enricher

  log "Status dos containers após atualização"
  compose ps

  ensure_host_nginx_proxy

  wait_for_health

  log "Deploy concluído com volumes preservados"
}

main "$@"
