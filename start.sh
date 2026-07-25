#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "========================================="
echo "  Lumiere — Запуск серверов"
echo "========================================="
echo ""
echo "  Frontend: http://192.168.1.37:5173"
echo "  Backend:  http://localhost:3000"
echo "  PostgreSQL: localhost:5433"
echo ""
echo "  Для остановки: Ctrl+C"
echo "========================================="
echo ""

cd /home/mimo/lumiere/back
echo "[1/2] Запуск бэкенда..."
node --import tsx src/index.ts &
BE_PID=$!

cd /home/mimo/lumiere/front
echo "[2/2] Запуск фронтенда..."
node node_modules/.bin/vite --host 0.0.0.0 &
FE_PID=$!

echo ""
echo "Backend PID: $BE_PID"
echo "Frontend PID: $FE_PID"
echo ""

wait
