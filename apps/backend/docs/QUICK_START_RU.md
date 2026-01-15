# Быстрый старт - Русский язык

## Настройка за 30 секунд

### Способ 1: Переменная окружения

```bash
export AUTO_CLAUDE_LANGUAGE=ru
```

### Способ 2: Конфигурационный файл

```bash
echo '{"output_language": "ru"}' > .auto-claude/config.json
```

## Проверка

```bash
python3 -c "import sys; sys.path.insert(0, 'apps/backend'); from core.language_config import get_output_language; print('Язык:', get_output_language())"
```

## Использование

После настройки все команды будут генерировать контент на русском:

```bash
# Roadmap на русском
python apps/backend/runners/roadmap_runner.py --project .

# Spec на русском  
python apps/backend/cli/main.py spec create "Добавить авторизацию"

# Ideation на русском
python apps/backend/runners/ideation_runner.py --project .
```

## Отключение

```bash
unset AUTO_CLAUDE_LANGUAGE
# или
export AUTO_CLAUDE_LANGUAGE=en
```

## Подробная документация

- [Полная документация](./LANGUAGE_CONFIGURATION.md)
- [Инструкция для разработчиков](./LANGUAGE_CONFIG_DEV.md)
