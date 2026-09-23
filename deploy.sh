#!/usr/bin/env bash
set -e

echo "========================================="
echo "   Lumiere Media Server — Production Deploy"
echo "========================================="
echo ""

# Check Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Ошибка: Docker не установлен."
  echo "Установите Docker: curl -fsSL https://get.docker.com | sh"
  exit 1
fi

# Check Docker Compose
if ! docker compose version >/dev/null 2>&1; then
  echo "❌ Ошибка: Docker Compose plugin не установлен."
  exit 1
fi

# Ensure .env exists
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    echo "⚙️ Создание .env из .env.example..."
    cp .env.example .env
  else
    echo "❌ Ошибка: .env и .env.example не найдены."
    exit 1
  fi
fi

echo "🚀 Запуск сборки и развертывания контейнеров..."
docker compose up -d --build

echo ""
echo "⏳ Проверка статуса сервисов..."
sleep 5
docker compose ps

echo ""
echo "========================================="
echo "✅ Lumiere успешно развернут!"
echo "========================================="
echo "  🌐 Веб-интерфейс:     http://localhost:3000"
echo "  📺 Smart TV (Tizen):  http://localhost:3000/tv/"
echo "  ⚡ TorrServer:        http://localhost:8090"
echo "========================================="
echo ""
echo "Просмотр логов: docker compose logs -f"
