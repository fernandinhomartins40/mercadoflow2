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
# Role com que a APLICACAO conecta: sem superuser e sem bypassrls, para que o
# row-level security valha de fato. O Flyway e os jobs seguem com POSTGRES_USER.
APP_DB_ROLE="${APP_DB_ROLE:-mercadoflow_app}"
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-superadmin@mercadoflow.com}"
SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-}"
SUPER_ADMIN_NAME="${SUPER_ADMIN_NAME:-Super Administrador}"
CATALOG_HARVESTER_INTERVAL_MINUTES="${CATALOG_HARVESTER_INTERVAL_MINUTES:-360}"
BARCODE_ENRICH_INTERVAL_MINUTES="${BARCODE_ENRICH_INTERVAL_MINUTES:-720}"
STATE_PRICE_SYNC_INTERVAL_MINUTES="${STATE_PRICE_SYNC_INTERVAL_MINUTES:-360}"
STATE_PRICE_SYNC_MAX_PAGES="${STATE_PRICE_SYNC_MAX_PAGES:-4}"
STATE_PRICE_SYNC_PAUSE_SECONDS="${STATE_PRICE_SYNC_PAUSE_SECONDS:-0.5}"
CATALOG_IMAGE_REPAIR_ENABLED="${CATALOG_IMAGE_REPAIR_ENABLED:-true}"
CATALOG_IMAGE_REPAIR_INITIAL_DELAY_MS="${CATALOG_IMAGE_REPAIR_INITIAL_DELAY_MS:-60000}"
CATALOG_IMAGE_REPAIR_FIXED_DELAY_MS="${CATALOG_IMAGE_REPAIR_FIXED_DELAY_MS:-21600000}"
CATALOG_IMAGE_REPAIR_BATCH_SIZE="${CATALOG_IMAGE_REPAIR_BATCH_SIZE:-300}"
CATALOG_IMAGE_REPAIR_MAX_ITEMS_PER_RUN="${CATALOG_IMAGE_REPAIR_MAX_ITEMS_PER_RUN:-250000}"
CATALOG_IMAGE_REPAIR_PROVIDER="${CATALOG_IMAGE_REPAIR_PROVIDER:-}"
# Stripe: vem dos GitHub Secrets. Quando ausentes, sao reaproveitados do .env ja
# gravado no servidor (ver resolve_stripe_config), para que um deploy sem os
# secrets configurados nao desligue a cobranca que ja estava funcionando.
STRIPE_ENABLED="${STRIPE_ENABLED:-}"
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-}"
STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-}"
STRIPE_PRICE_ESSENCIAL="${STRIPE_PRICE_ESSENCIAL:-}"
STRIPE_PRICE_PROFISSIONAL="${STRIPE_PRICE_PROFISSIONAL:-}"
# Chave mestra que cifra as chaves de IA que os CLIENTES cadastram (BYOK).
#
# NAO PODE MUDAR entre deploys: as chaves ja cadastradas foram cifradas com ela
# e ficariam indecifraveis. Por isso e gerada UMA vez no servidor e preservada
# do .env em diante (ver resolve_ai_config), nunca regerada a cada deploy.
AI_ENCRYPTION_KEY="${AI_ENCRYPTION_KEY:-}"
DOCKER_CLEANUP_ENABLED="${DOCKER_CLEANUP_ENABLED:-true}"
DOCKER_CLEANUP_PROJECT_CONTAINERS="${DOCKER_CLEANUP_PROJECT_CONTAINERS:-true}"
DOCKER_CLEANUP_DANGLING_IMAGES="${DOCKER_CLEANUP_DANGLING_IMAGES:-true}"
DOCKER_CLEANUP_BUILD_CACHE="${DOCKER_CLEANUP_BUILD_CACHE:-true}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

compose() {
  docker compose --project-name "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "ERRO: arquivo obrigatÃ³rio ausente: $path" >&2
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

resolve_super_admin_password() {
  # Ordem de resolucao: variavel de ambiente -> senha ja gravada no .env do
  # servidor -> geracao automatica. Reaproveitar o .env evita exigir um secret
  # novo no CI e mantem a senha que o super admin e os coletores ja usam: o
  # seeder do backend nunca troca a senha de um usuario existente, entao gerar
  # um valor diferente a cada deploy quebraria o login dos coletores.
  if [[ -n "$SUPER_ADMIN_PASSWORD" ]]; then
    return
  fi

  if [[ -f .env ]]; then
    # Le sem executar o arquivo: o .env tem valores com espacos (ex.: o nome do
    # super admin), que quebrariam um `source`.
    local existing
    existing="$(sed -n 's/^SUPER_ADMIN_PASSWORD=//p' .env | head -n 1)"
    if [[ -n "$existing" ]]; then
      SUPER_ADMIN_PASSWORD="$existing"
      log "Reaproveitando SUPER_ADMIN_PASSWORD ja presente no .env"
      return
    fi
  fi

  SUPER_ADMIN_PASSWORD="$(openssl rand -hex 16)"
  log "SUPER_ADMIN_PASSWORD ausente; gerada uma nova senha para o primeiro seed"
}

resolve_stripe_config() {
  # Mesma logica do super admin: secret do CI tem precedencia, senao reaproveita
  # o que ja esta no .env do servidor.
  #
  # Reaproveitar importa porque este script REESCREVE o .env inteiro a cada
  # deploy: sem isso, um deploy feito sem os secrets configurados apagaria as
  # chaves e desligaria a cobranca em produção silenciosamente.
  local key
  for key in STRIPE_ENABLED STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET \
             STRIPE_PRICE_ESSENCIAL STRIPE_PRICE_PROFISSIONAL; do
    if [[ -n "${!key}" ]]; then
      continue
    fi
    if [[ -f .env ]]; then
      local existing
      existing="$(sed -n "s/^${key}=//p" .env | head -n 1)"
      if [[ -n "$existing" ]]; then
        printf -v "$key" '%s' "$existing"
      fi
    fi
  done

  # Sem chave nao ha o que habilitar: evita o backend subir com
  # STRIPE_ENABLED=true e falhar ao criar o cliente do Stripe.
  if [[ -z "$STRIPE_SECRET_KEY" ]]; then
    STRIPE_ENABLED="false"
  elif [[ -z "$STRIPE_ENABLED" ]]; then
    STRIPE_ENABLED="true"
  fi

  if [[ "$STRIPE_ENABLED" == "true" ]]; then
    log "Stripe habilitado (chave presente)"
  else
    log "Stripe desabilitado; upgrade de plano permanece manual no painel"
  fi
}

# Preserva (ou gera na primeira vez) a chave mestra de criptografia da IA.
#
# A ordem importa: secret do GitHub > o que ja esta no .env > gerar nova. Gerar
# so acontece quando nao existe nenhuma, porque sobrescrever uma chave em uso
# tornaria as credenciais dos clientes ilegiveis -- eles teriam de recadastrar
# sem entender por que.
resolve_ai_config() {
  if [[ -z "$AI_ENCRYPTION_KEY" && -f .env ]]; then
    local existing
    existing="$(sed -n 's/^AI_ENCRYPTION_KEY=//p' .env | head -n 1)"
    if [[ -n "$existing" ]]; then
      AI_ENCRYPTION_KEY="$existing"
    fi
  fi

  if [[ -z "$AI_ENCRYPTION_KEY" ]]; then
    # tr remove a quebra que o openssl acrescenta: ela entraria no .env e
    # cortaria o valor da variavel no meio.
    AI_ENCRYPTION_KEY="$(openssl rand -base64 48 | tr -d '\n')"
    log "Chave de criptografia de IA gerada (primeira vez); sera preservada nos proximos deploys"
  else
    log "Chave de criptografia de IA preservada"
  fi
}

ensure_app_role() {
  # A aplicacao conecta com uma role SEM superuser e SEM bypassrls, para que as
  # policies de row-level security sejam de fato avaliadas. Com a role dona do
  # schema o PostgreSQL ignora RLS silenciosamente, e o isolamento entre
  # mercados passa a depender so de cada consulta Java lembrar de filtrar.
  #
  # O Flyway continua com a role dona (FLYWAY_USER), porque migracao precisa de
  # DDL e de escrever em flyway_schema_history.
  ensure_secret_file ".app_role_secret" 24 "senha da role de aplicacao"
  local app_password
  app_password="$(< .app_role_secret)"

  log "Garantindo role de aplicacao ${APP_DB_ROLE} (sem bypass de RLS)"
  docker exec -i mercadoflow-postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_DB_ROLE}') THEN
    EXECUTE format('ALTER ROLE ${APP_DB_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L', '${app_password}');
  ELSE
    EXECUTE format('CREATE ROLE ${APP_DB_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L', '${app_password}');
  END IF;
END \$\$;

GRANT USAGE ON SCHEMA public TO ${APP_DB_ROLE};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_DB_ROLE};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_DB_ROLE};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_DB_ROLE};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${APP_DB_ROLE};
REVOKE ALL ON TABLE flyway_schema_history FROM ${APP_DB_ROLE};
SQL

  # Repetido a cada deploy de proposito: tabela criada por migracao nova so fica
  # acessivel se o GRANT rodar DEPOIS dela, e o ALTER DEFAULT PRIVILEGES acima
  # nao alcanca o que o Flyway acabou de criar nesta mesma execucao.
}

write_env_file() {
  local jwt_secret
  local db_password
  local app_password
  jwt_secret="$(< .jwt_secret)"
  db_password="$(< .db_secret)"
  app_password="$(< .app_role_secret)"

  cat > .env.tmp <<EOF
NODE_ENV=production
COMPOSE_PROJECT_NAME=${PROJECT_NAME}
POSTGRES_DB=${POSTGRES_DB}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${db_password}
DATABASE_URL=jdbc:postgresql://mercadoflow-postgres:5432/${POSTGRES_DB}
DATABASE_USER=${APP_DB_ROLE}
DATABASE_PASSWORD=${app_password}
FLYWAY_USER=${POSTGRES_USER}
FLYWAY_PASSWORD=${db_password}
JWT_SECRET=${jwt_secret}
CORS_ORIGIN=https://mercadoflow.com,https://www.mercadoflow.com
VITE_API_URL=https://mercadoflow.com/api
APP_PUBLIC_BASE_URL=https://mercadoflow.com
SUPER_ADMIN_EMAIL=${SUPER_ADMIN_EMAIL}
SUPER_ADMIN_PASSWORD=${SUPER_ADMIN_PASSWORD}
SUPER_ADMIN_NAME=${SUPER_ADMIN_NAME}
CATALOG_HARVESTER_INTERVAL_MINUTES=${CATALOG_HARVESTER_INTERVAL_MINUTES}
BARCODE_ENRICH_INTERVAL_MINUTES=${BARCODE_ENRICH_INTERVAL_MINUTES}
STATE_PRICE_SYNC_INTERVAL_MINUTES=${STATE_PRICE_SYNC_INTERVAL_MINUTES}
STATE_PRICE_SYNC_MAX_PAGES=${STATE_PRICE_SYNC_MAX_PAGES}
STATE_PRICE_SYNC_PAUSE_SECONDS=${STATE_PRICE_SYNC_PAUSE_SECONDS}
CATALOG_IMAGE_REPAIR_ENABLED=${CATALOG_IMAGE_REPAIR_ENABLED}
CATALOG_IMAGE_REPAIR_INITIAL_DELAY_MS=${CATALOG_IMAGE_REPAIR_INITIAL_DELAY_MS}
CATALOG_IMAGE_REPAIR_FIXED_DELAY_MS=${CATALOG_IMAGE_REPAIR_FIXED_DELAY_MS}
CATALOG_IMAGE_REPAIR_BATCH_SIZE=${CATALOG_IMAGE_REPAIR_BATCH_SIZE}
CATALOG_IMAGE_REPAIR_MAX_ITEMS_PER_RUN=${CATALOG_IMAGE_REPAIR_MAX_ITEMS_PER_RUN}
CATALOG_IMAGE_REPAIR_PROVIDER=${CATALOG_IMAGE_REPAIR_PROVIDER}
STRIPE_ENABLED=${STRIPE_ENABLED}
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
STRIPE_PRICE_ESSENCIAL=${STRIPE_PRICE_ESSENCIAL}
STRIPE_PRICE_PROFISSIONAL=${STRIPE_PRICE_PROFISSIONAL}
AI_ENCRYPTION_KEY=${AI_ENCRYPTION_KEY}
MERCADOFLOW_POSTGRES_VOLUME=${POSTGRES_VOLUME_NAME}
BUILD_TIMESTAMP=$(date +%s)
EOF

  mv .env.tmp .env
  chmod 600 .env
}

prune_backups() {
  # Mantem UM backup por dia (o mais recente daquele dia) nos ultimos 7 dias.
  #
  # A regra anterior ("os 3 mais recentes") guardava tres dumps de 338 MB do
  # MESMO dia quando havia tres deploys, ou seja, 1 GB protegendo contra nada
  # alem do ultimo deploy. Por dia, o mesmo espaco cobre uma semana.
  local f dia
  declare -A visto=()

  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    dia="$(basename "$f" | sed -n 's/^backup_\([0-9]\{8\}\)_.*/\1/p')"
    [[ -n "$dia" ]] || continue
    if [[ -n "${visto[$dia]:-}" ]]; then
      rm -f "$f"
    else
      visto[$dia]=1
    fi
  done < <(ls -t "${APP_DIR}"/backups/backup_*.dump 2>/dev/null)

  # Alem de sete dias distintos, descarta os mais antigos.
  ls -t "${APP_DIR}"/backups/backup_*.dump 2>/dev/null | tail -n +8 | xargs -r rm -f
}

backup_database() {
  local container_name="mercadoflow-postgres"
  if ! docker ps --format '{{.Names}}' | grep -qx "$container_name"; then
    log "PostgreSQL ainda não está rodando; backup será pulado neste ciclo"
    return
  fi

  mkdir -p "${APP_DIR}/backups"

  # Um dump deste banco leva ~11 min (1 GB, VPS com bastante steal time).
  # Se ja existe um backup validado de menos de BACKUP_MAX_AGE_MIN minutos,
  # reaproveita: em deploys seguidos (corrigir e reenviar) refazer o dump
  # so consome I/O e empurra o build para fora da janela do workflow.
  local max_age="${BACKUP_MAX_AGE_MIN:-45}"
  local recente
  recente="$(find "${APP_DIR}/backups" -maxdepth 1 -name "backup_*.dump" -mmin "-${max_age}" -size +1k 2>/dev/null | sort | tail -n 1)"
  if [[ -n "$recente" ]]; then
    log "Backup recente reaproveitado: $(basename "$recente") (< ${max_age} min)"
    prune_backups
    return
  fi

  local backup_file="${APP_DIR}/backups/backup_$(date +%Y%m%d_%H%M%S).dump"
  local container_dump="/tmp/pdv2cloud_backup.dump"

  log "Gerando backup comprimido do PostgreSQL"
  if docker exec "$container_name" sh -lc "pg_dump -Fc -U '${POSTGRES_USER}' -d '${POSTGRES_DB}' -f '${container_dump}'" \
    && docker exec "$container_name" sh -lc "pg_restore -l '${container_dump}' >/dev/null"; then
    docker cp "${container_name}:${container_dump}" "$backup_file"
    docker exec "$container_name" rm -f "${container_dump}" >/dev/null 2>&1 || true
    if [[ -s "$backup_file" ]]; then
      log "Backup salvo em $backup_file"
      prune_backups
      return
    fi
  fi

  docker exec "$container_name" rm -f "${container_dump}" >/dev/null 2>&1 || true
  rm -f "$backup_file"
  log "WARN: backup não pôde ser concluído"
}

ensure_catalog_volume() {
  if docker volume inspect "${POSTGRES_VOLUME_NAME}" >/dev/null 2>&1; then
    log "Volume do catÃ¡logo jÃ¡ existe: ${POSTGRES_VOLUME_NAME}"
    return
  fi

  log "Criando volume persistente do PostgreSQL: ${POSTGRES_VOLUME_NAME}"
  docker volume create "${POSTGRES_VOLUME_NAME}" >/dev/null
}

# O "compose up" pode terminar deixando servico em "Created": quando um
# depends_on/service_healthy nao e satisfeito, o compose cria o container e
# desiste de inicia-lo. Foi o que aconteceu em 14/09 — frontend, cron, nginx e
# os coletores ficaram criados e nunca iniciados, o site respondeu 502 por
# horas, e o deploy nao acusou nada: wait_for_health testa /health, que o nginx
# do host serve direto do backend, sem passar pelo container do frontend.
#
# Aqui a falha deixa de ser silenciosa. So faz sentido rodar DEPOIS do
# wait_for_health, quando o backend ja esta saudavel e os dependentes ja
# deveriam ter subido.
verificar_containers_parados() {
  local esperados=(
    mercadoflow-postgres
    mercadoflow-backend
    mercadoflow-frontend
    mercadoflow-cron
    mercadoflow-nginx
    mercadoflow-catalog-harvester
    mercadoflow-barcode-enricher
  )
  local parados=()
  local nome estado

  # Os dependentes so sobem com o backend saudavel. Numa VPS com 50-63% de
  # steal time o boot medido foi de 501 s, entao esperar ate 12 min aqui e o
  # que evita declarar falha num backend que ainda esta subindo normalmente.
  local esperas=0
  while (( esperas < 72 )); do
    [[ "$(docker inspect mercadoflow-backend --format '{{.State.Health.Status}}' 2>/dev/null)" == "healthy" ]] && break
    (( esperas % 12 == 0 )) && log "Aguardando backend ficar saudavel ($(( esperas * 10 ))s)"
    sleep 10
    ((esperas++))
  done

  for nome in "${esperados[@]}"; do
    estado="$(docker inspect "$nome" --format '{{.State.Status}}' 2>/dev/null || echo ausente)"
    if [[ "$estado" != "running" ]]; then
      parados+=("${nome} (${estado})")
      # Uma tentativa de subir: em "Created" o container esta pronto, so nao foi
      # iniciado porque o compose desistiu de esperar a dependencia.
      if [[ "$estado" == "created" || "$estado" == "exited" ]]; then
        log "Container ${nome} em '${estado}'; tentando iniciar"
        docker start "$nome" >/dev/null 2>&1 || true
      fi
    fi
  done

  if (( ${#parados[@]} == 0 )); then
    log "Todos os containers essenciais estao em execucao"
    return
  fi

  sleep 10

  local ainda=()
  for nome in "${esperados[@]}"; do
    estado="$(docker inspect "$nome" --format '{{.State.Status}}' 2>/dev/null || echo ausente)"
    [[ "$estado" != "running" ]] && ainda+=("${nome} (${estado})")
  done

  if (( ${#ainda[@]} > 0 )); then
    echo "ERRO: containers essenciais fora de execucao apos o deploy:" >&2
    printf '  - %s
' "${ainda[@]}" >&2
    compose ps || true
    exit 1
  fi

  log "Containers recuperados: ${parados[*]}"
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

  echo "ERRO: aplicaÃ§Ã£o nÃ£o ficou saudÃ¡vel apÃ³s o deploy" >&2
  compose ps || true
  compose logs --tail=120 || true
  exit 1
}

cleanup_project_containers() {
  local statuses=(created exited dead)
  local status

  for status in "${statuses[@]}"; do
    docker ps -aq \
      --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
      --filter "status=${status}" | xargs -r docker rm -f >/dev/null
  done
}

cleanup_docker_artifacts() {
  if [[ "${DOCKER_CLEANUP_ENABLED}" != "true" ]]; then
    log "Limpeza Docker desabilitada por configuraÃ§Ã£o"
    return
  fi

  log "Limpando artefatos Docker descartÃ¡veis sem tocar em volumes"

  if [[ "${DOCKER_CLEANUP_PROJECT_CONTAINERS}" == "true" ]]; then
    cleanup_project_containers || log "WARN: nÃ£o foi possÃ­vel remover containers descartÃ¡veis do projeto"
  fi

  if [[ "${DOCKER_CLEANUP_DANGLING_IMAGES}" == "true" ]]; then
    docker image prune -f >/dev/null || log "WARN: nÃ£o foi possÃ­vel limpar imagens dangling"
  fi

  if [[ "${DOCKER_CLEANUP_BUILD_CACHE}" == "true" ]]; then
    # Guarda 2 GB de cache em vez de apagar tudo com -af: sem isso o deploy
    # seguinte recompila as dependencias Maven do zero e estoura a janela do
    # workflow. Ha 63 GB livres, entao reter 2 GB e barato.
    #
    # A flag mudou de nome: --keep-storage saiu no Docker 28 e virou
    # --reserved-space. A VPS roda 28.3.3; o fallback cobre hosts antigos.
    if docker builder prune -f --reserved-space 2GB >/dev/null 2>&1; then
      :
    elif docker builder prune -f --keep-storage 2GB >/dev/null 2>&1; then
      :
    else
      log "WARN: nao foi possivel limpar cache de build Docker"
    fi
  fi
}

report_disk_usage() {
  log "Uso atual de disco"
  df -h / || true
  docker system df || true
}

build_agent_installer() {
  local script_path="${APP_DIR}/pdv2cloud-agent/scripts/build-installer-vps.sh"
  if [[ ! -f "$script_path" ]]; then
    log "Script de build do instalador nÃ£o encontrado; mantendo artefato atual"
    return
  fi

  log "Atualizando instalador do agente desktop"
  chmod +x "$script_path"
  "$script_path"
}

ensure_host_nginx_proxy() {
  if ! command -v nginx >/dev/null 2>&1; then
    log "Nginx do host nÃ£o encontrado; mantendo apenas o Nginx containerizado"
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
    log "WARN: certificados SSL nÃ£o encontrados; Nginx do host ficarÃ¡ em HTTP atÃ© o certbot ser configurado"
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
  ensure_secret_file ".app_role_secret" 24 "senha da role de aplicacao"
  resolve_super_admin_password
  resolve_stripe_config
  resolve_ai_config
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

  log "Construindo imagens da aplicaÃ§Ã£o"
  compose build --pull mercadoflow-backend mercadoflow-frontend mercadoflow-cron

  # O banco sobe sozinho primeiro: a role de aplicacao precisa existir ANTES de
  # o backend tentar conectar com ela, senao o boot falha com autenticacao
  # recusada. O compose ja tem depends_on por saude, mas quem cria a role e este
  # script, entao a ordem tem de ser explicita aqui.
  log "Subindo PostgreSQL antes da aplicacao"
  compose up -d --force-recreate mercadoflow-postgres
  local tentativa=0
  until docker exec mercadoflow-postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; do
    tentativa=$((tentativa + 1))
    if [[ $tentativa -ge 60 ]]; then
      log "ERRO: PostgreSQL nao respondeu em 120s"
      exit 1
    fi
    sleep 2
  done
  ensure_app_role

  log "Aplicando atualizaÃ§Ã£o sem remover volumes"
  compose up -d --force-recreate --remove-orphans \
    mercadoflow-postgres \
    mercadoflow-backend \
    mercadoflow-frontend \
    mercadoflow-cron \
    mercadoflow-nginx \
    mercadoflow-catalog-harvester \
    mercadoflow-barcode-enricher \
    mercadoflow-state-price-sync

  log "Status dos containers apÃ³s atualizaÃ§Ã£o"
  compose ps

  # ANTES do wait_for_health, nao depois. Quem publica a porta 3300 e o
  # container mercadoflow-nginx, e ele depende de "backend: service_healthy" +
  # "frontend: service_started". Se o compose desistir e deixa-lo em "Created",
  # nada escuta na 3300 e o wait_for_health esgota o timeout e mata o deploy —
  # sem nunca chegar na recuperacao, se ela viesse depois. A dependencia e
  # circular: o health check testa a porta que so existe se os containers
  # subiram.
  verificar_containers_parados

  ensure_host_nginx_proxy

  wait_for_health

  # Depois do boot: o Flyway acabou de rodar e pode ter criado tabelas nesta
  # execucao. O GRANT anterior nao as alcanca (ALTER DEFAULT PRIVILEGES so vale
  # para o que for criado a partir dali), entao reaplica para nao deixar a
  # aplicacao sem permissao numa tabela recem-migrada.
  log "Reaplicando permissoes da role de aplicacao pos-migracao"
  docker exec -i mercadoflow-postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 -q <<SQL
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_DB_ROLE};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_DB_ROLE};
REVOKE ALL ON TABLE flyway_schema_history FROM ${APP_DB_ROLE};
SQL

  cleanup_docker_artifacts
  report_disk_usage

  log "Deploy concluÃ­do com volumes preservados"
}

main "$@"


