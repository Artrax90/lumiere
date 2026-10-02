# Critical Project Rules & Safety Directives

## ⚠️ СТРОЖАЙШИЙ ЗАПРЕТ НА УДАЛЕНИЕ ДАННЫХ С СЕРВЕРА
**КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО** удалять что-либо с сервера (`rm`, `rm -rf`, `unlink`, `docker rm`, `docker rmi`, `docker system prune`, `drop database`, `drop table`, `truncate`, удаление любых файлов, папок, баз, контейнеров или логов) **БЕЗ ПРЯМОГО ЯВНОГО РАЗРЕШЕНИЯ ПОЛЬЗОВАТЕЛЯ**!

1. Никаких деструктивных команд в терминале/SSH (`rm`, `dd`, `mkfs`, `docker volume rm` и т.д.).
2. При необходимости изменения файлов — сохранять резервные копии или редактировать точечно.

## 📱 ОБЯЗАТЕЛЬНОЕ ОБНОВЛЕНИЕ ВСЕХ ПРИЛОЖЕНИЙ (TV и 2 APK)
**ОБЯЗАТЕЛЬНО** пересобирать и обновлять все клиентские приложения каждый раз, когда это требуется (при изменениях фронтенда, плеера, логики клиента или запросе пользователя):
1. **Samsung Tizen TV (`Lumiere.wgt`)**: сборка через Tizen CLI (`tizen.bat package -t wgt -s LumiereSamsungProfile -- front/tizen`), размещение в корне, в `front/tizen/` и `back/public/tv/Lumiere.wgt`.
2. **Android Mobile APK (`Lumiere.apk` / `Lumiere-debug.apk`)**: компиляция/подпись через Gradle/uber-apk-signer, размещение в корне и `back/public/apk/`.
3. **Android TV APK (`Lumiere-tv.apk` / `Lumiere-tv-debug.apk`)**: сборка Android TV версии, размещение в корне и `back/public/apk/`.
4. **Синхронизация с сервером**: файлы приложений должны копироваться в контейнер `lumiere-app` в `/app/public/` для доступности скачивания пользователями.
