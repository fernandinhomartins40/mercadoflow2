#!/usr/bin/env bash
# Backup diário do banco do MercadoFlow (agendado em /etc/cron.d/mercadoflow-backup).
#
# Antes só havia pg_dump no deploy: semana sem deploy deixava até 7 dias sem
# cópia, além do backup semanal da Hostinger. Este guarda 14 dias em pasta
# própria (backups/daily), fora da rotação do deploy (backups/backup_*.dump).
set -euo pipefail

APP_DIR="${APP_DIR:-/root/mercadoflow-web}"
DEST="${APP_DIR}/backups/daily"
KEEP_DAYS="${BACKUP_DAILY_KEEP_DAYS:-14}"
CONTAINER="mercadoflow-postgres"
DEPLOY_LOCK="${DEPLOY_LOCK:-/var/lock/mercadoflow-deploy.lock}"

log() { echo "$(date '+%F %T') backup-daily: $*"; }

# Não disputa o banco com um deploy em andamento (o deploy também faz dump).
exec 9>"$DEPLOY_LOCK"
if ! flock -n 9; then
  log "deploy em andamento; backup pulado neste ciclo"
  exit 0
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  log "contêiner $CONTAINER fora do ar; backup pulado"
  exit 1
fi

mkdir -p "$DEST"
chmod 700 "$DEST"
file="${DEST}/daily_$(date +%Y%m%d_%H%M%S).dump"
tmp="${file}.partial"

# Baixa prioridade de CPU e disco: a VPS é compartilhada com outras aplicações.
if nice -n 15 ionice -c3 docker exec "$CONTAINER" sh -c \
    'pg_dump -Fc -Z zstd:6 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$tmp"; then
  # Confere que o arquivo é um dump legível antes de considerá-lo válido.
  if docker exec -i "$CONTAINER" pg_restore -l < "$tmp" > /dev/null; then
    mv "$tmp" "$file"
    chmod 600 "$file"
    log "ok: $(basename "$file") ($(du -h "$file" | cut -f1))"
  else
    rm -f "$tmp"
    log "ERRO: dump gerado não passou no pg_restore -l"
    exit 1
  fi
else
  rm -f "$tmp"
  log "ERRO: pg_dump falhou"
  exit 1
fi

find "$DEST" -maxdepth 1 -name 'daily_*.dump' -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/removido: /'
