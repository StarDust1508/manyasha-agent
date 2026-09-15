# Установка на macOS

Проверенная первая цель: Apple Silicon, macOS текущего владельца. Пакет не подписан Apple Developer ID и пока не называется production-релизом.

1. Проверьте файл `Manyasha-0.1.0-macos.zip.sha256`.
2. Распакуйте архив.
3. Запустите `scripts/install-macos.sh` из распакованной папки.
4. Установщик проверит Node.js 22+, `uv` и Git, затем получит Hermes ровно на commit из `upstream.lock.json`.
5. Запустите `~/Library/Application Support/Manyasha/app/bin/manyasha`.

Для модели организаторов укажите `MANYASHA_NAVY_ENV_SOURCE` на локальный конфигурационный файл. Ключ читается во время запуска и не копируется в профиль или пакет.

Пример безопасной тестовой рабочей папки:

```bash
export MANYASHA_WORKSPACE="$PWD/manyasha-workspace"
export MANYASHA_NAVY_ENV_SOURCE="/absolute/path/to/provider-config.json"
"$HOME/Library/Application Support/Manyasha/app/bin/manyasha-hermes" chat
```

GUI того же Hermes-профиля:

```bash
"$HOME/Library/Application Support/Manyasha/app/bin/manyasha-hermes" dashboard
```

Ограничение записи Hermes относится к выбранной рабочей папке. Это ещё не полная OS-песочница чтения. Не подключайте личные каталоги целиком и не включайте терминальные инструменты до отдельной проверки.
