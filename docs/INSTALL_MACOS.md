# Установка на macOS

Проверенная первая цель: Apple Silicon, macOS текущего владельца. Пакет не подписан Apple Developer ID и пока не называется production-релизом.

1. Проверьте файл `Manyasha-0.2.0-macos.zip.sha256`.
2. Распакуйте архив.
3. Из распакованной папки выполните `sh scripts/install-macos.sh`.
4. Установщик проверит Node.js 22+, `uv` и Git, затем получит Hermes ровно на commit из `upstream.lock.json`.
5. Запустите разговорный интерфейс: `~/Library/Application Support/Manyasha/app/bin/manyasha gui`.

Для модели организаторов укажите `MANYASHA_NAVY_CONFIG_FILE` на локальный JSON провайдера или `MANYASHA_NAVY_ENV_SOURCE` на локальный `.env`. Ключ читается во время запуска и не копируется в профиль или пакет.

Для бесплатной недели войдите на страницу Маняши, нажмите «Подключить этот Mac» и один раз выполните показанную команду `manyasha managed`. Токен относится только к вашему аккаунту и конкретному устройству; не публикуйте его и не отправляйте другим людям.

Пример безопасной тестовой рабочей папки:

```bash
export MANYASHA_WORKSPACE="$PWD/manyasha-workspace"
export MANYASHA_NAVY_CONFIG_FILE="/absolute/path/to/provider-config.json"
"$HOME/Library/Application Support/Manyasha/app/bin/manyasha-hermes" chat
```

GUI того же Hermes-профиля:

```bash
"$HOME/Library/Application Support/Manyasha/app/bin/manyasha-hermes" dashboard
```

Ограничение записи Hermes относится к выбранной рабочей папке. Это ещё не полная OS-песочница чтения. Не подключайте личные каталоги целиком и не включайте терминальные инструменты до отдельной проверки.
