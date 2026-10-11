#!/usr/bin/env bash
# Starts/stops a LOCAL SeaweedFS that mimics the CESMAC server: S3 API with credentials.
#   infra/seaweedfs.sh start | stop | status
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/infra/seaweedfs/data"
LOG="$ROOT/infra/seaweedfs/weed.log"
PID="$ROOT/infra/seaweedfs/weed.pid"

case "${1:-}" in
  start)
    if [[ -f "$PID" ]] && kill -0 "$(cat "$PID")" 2>/dev/null; then echo "Já está rodando (pid $(cat "$PID"))."; exit 0; fi
    mkdir -p "$DATA"
    # -ip / -ip.bind 127.0.0.1: only this machine can reach it (photos are personal data).
    # -master.garbageThreshold: SeaweedFS only frees a deleted file's bytes when the volume is
    #   compacted ("vacuum"). The default (30% garbage) could keep a deleted photo on disk
    #   indefinitely; 1% makes compaction happen, which the 72h removal (RF023) depends on.
    nohup weed server \
      -dir="$DATA" -ip=127.0.0.1 -ip.bind=127.0.0.1 \
      -master.port=9333 -volume.port=8380 -filer.port=8888 \
      -master.garbageThreshold=0.01 -volume.max=0 \
      -s3 -s3.port=8333 -s3.config="$ROOT/infra/seaweedfs/s3.json" \
      >"$LOG" 2>&1 &
    echo $! >"$PID"
    for _ in $(seq 1 30); do
      if curl -s -o /dev/null http://127.0.0.1:8333; then echo "SeaweedFS no ar: S3 em http://127.0.0.1:8333 (pid $(cat "$PID"))."; exit 0; fi
      sleep 1
    done
    echo "SeaweedFS não respondeu em 30 s. Veja $LOG"; exit 1 ;;
  stop)
    if [[ -f "$PID" ]]; then kill "$(cat "$PID")" 2>/dev/null || true; rm -f "$PID"; echo "SeaweedFS parado."; else echo "Não estava rodando."; fi ;;
  status)
    if [[ -f "$PID" ]] && kill -0 "$(cat "$PID")" 2>/dev/null; then echo "Rodando (pid $(cat "$PID"))."; else echo "Parado."; fi ;;
  *) echo "uso: $0 start|stop|status"; exit 2 ;;
esac
