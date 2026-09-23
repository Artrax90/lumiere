#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "========================================="
echo "  Lumiere Media Server — Запуск"
echo "========================================="

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js не найден. Установите Node.js 20+."
  exit 1
fi

# Ensure .env exists
if [ ! -f "$DIR/back/.env" ] && [ -f "$DIR/.env" ]; then
  cp "$DIR/.env" "$DIR/back/.env"
fi

echo "[1/2] Проверка сборки бэкенда..."
cd "$DIR/back"
npm run build

echo "[2/2] Запуск сервера Lumiere..."
echo "  Backend & Web: http://localhost:3500"
echo "  Smart TV:      http://localhost:3500/tv/"
echo ""
exec node dist/index.js
