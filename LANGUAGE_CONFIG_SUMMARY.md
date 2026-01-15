# Централизованная конфигурация языка - Сводка изменений

## Проблема

Ранее для настройки языка генерации контента требовалось вручную редактировать каждый markdown файл промпта, что нарушало принцип DRY и усложняло поддержку.

## Решение

Реализована централизованная система конфигурации языка, которая автоматически добавляет языковую инструкцию ко всем промптам.

## Архитектура

### Новые файлы

1. **`apps/backend/core/language_config.py`** - Основной модуль конфигурации
   - `get_output_language()` - определяет текущий язык
   - `get_language_instruction()` - генерирует инструкцию для LLM
   - `should_inject_language_instruction()` - проверяет, нужно ли добавлять инструкцию

2. **Документация:**
   - `apps/backend/docs/LANGUAGE_CONFIGURATION.md` - полная документация
   - `apps/backend/docs/LANGUAGE_SETUP_RU.md` - инструкция на русском
   - `apps/backend/docs/LANGUAGE_CONFIG_DEV.md` - руководство для разработчиков
   - `apps/backend/docs/QUICK_START_RU.md` - быстрый старт

3. **Примеры конфигурации:**
   - `apps/backend/.auto-claude/config.example.json`
   - `.auto-claude/config.json` (создан для проекта)

4. **Тесты:**
   - `apps/backend/tests/test_language_config.py`

### Изменённые файлы

1. **`apps/backend/runners/roadmap/executor.py`**
   - Добавлен импорт `language_config`
   - Инструкция автоматически добавляется в `AgentExecutor.run_agent()`

2. **`apps/backend/prompts_pkg/prompts.py`**
   - Добавлен импорт `language_config`
   - Инструкция добавляется в `_load_prompt_file()`

3. **`apps/backend/prompts_pkg/prompt_generator.py`**
   - Добавлен импорт `language_config`
   - Инструкция добавляется в `generate_subtask_prompt()`

4. **`README.md`**
   - Добавлена секция "Language Configuration"

5. **`CHANGELOG.md`**
   - Добавлена запись о новой функции

## Использование

### Для пользователей

```bash
# Способ 1: Переменная окружения
export AUTO_CLAUDE_LANGUAGE=ru

# Способ 2: Конфигурационный файл проекта
echo '{"output_language": "ru"}' > .auto-claude/config.json

# Способ 3: Глобальная настройка
mkdir -p ~/.auto-claude
echo '{"output_language": "ru"}' > ~/.auto-claude/config.json
```

### Для разработчиков

Инструкция автоматически добавляется ко всем промптам. Не требуется никаких изменений в коде при добавлении новых промптов.

## Поддерживаемые языки

- `ru` - Русский
- `en` - English (по умолчанию)
- `es` - Español
- `de` - Deutsch
- `fr` - Français

## Приоритет настроек

1. `AUTO_CLAUDE_LANGUAGE` (переменная окружения)
2. `.auto-claude/config.json` (в проекте)
3. `~/.auto-claude/config.json` (глобально)
4. По умолчанию: `en`

## Что переводится

✅ Переводится:
- Описания задач, фич, идей
- Названия фаз, подзадач, milestone
- Rationale, acceptance criteria, user stories
- Все текстовые поля в JSON

❌ Не переводится:
- Технические идентификаторы (id, phase-1)
- Названия файлов и путей
- Команды и код
- Ключи в JSON структурах

## Преимущества

1. **DRY**: Настройка в одном месте
2. **Простота**: Не нужно редактировать markdown файлы
3. **Гибкость**: Несколько способов конфигурации
4. **Расширяемость**: Легко добавить новый язык
5. **Обратная совместимость**: Работает с существующими промптами

## Тестирование

```bash
# Проверка текущего языка
python3 -c "import sys; sys.path.insert(0, 'apps/backend'); from core.language_config import get_output_language; print(get_output_language())"

# Запуск тестов
cd apps/backend
python -m pytest tests/test_language_config.py -v
```

## Отключение

Если нужно отключить автоматическую инструкцию:

```bash
export AUTO_CLAUDE_DISABLE_LANGUAGE_INSTRUCTION=true
```

## Примеры

### Roadmap на русском

```bash
export AUTO_CLAUDE_LANGUAGE=ru
python apps/backend/runners/roadmap_runner.py --project /path/to/project
```

### Spec на русском

```bash
export AUTO_CLAUDE_LANGUAGE=ru
python apps/backend/cli/main.py spec create "Добавить аутентификацию"
```

### Ideation на русском

```bash
export AUTO_CLAUDE_LANGUAGE=ru
python apps/backend/runners/ideation_runner.py --project /path/to/project
```

## Дальнейшие улучшения

Возможные расширения:
- Переопределение языка для конкретного агента
- Автоопределение языка из файлов проекта
- Перевод уже сгенерированного контента
- Языко-специфичные вариации промптов
