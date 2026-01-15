# Language Configuration

Auto-Claude поддерживает настройку языка, на котором LLM генерирует контент (описания задач, roadmap, идеи и т.д.).

## Как настроить язык

### Способ 1: Переменная окружения (рекомендуется)

Установите переменную окружения `AUTO_CLAUDE_LANGUAGE`:

```bash
export AUTO_CLAUDE_LANGUAGE=ru
```

Или добавьте в `.env` файл:

```
AUTO_CLAUDE_LANGUAGE=ru
```

### Способ 2: Конфигурационный файл

Создайте файл `.auto-claude/config.json` в корне вашего проекта:

```json
{
  "output_language": "ru"
}
```

### Способ 3: Глобальная настройка

Создайте файл `~/.auto-claude/config.json` для применения настройки ко всем проектам:

```json
{
  "output_language": "ru"
}
```

## Поддерживаемые языки

| Код | Язык |
|-----|------|
| `ru` | Русский |
| `en` | Английский (по умолчанию) |
| `es` | Испанский |
| `de` | Немецкий |
| `fr` | Французский |

## Что переводится

При установке языка, LLM будет генерировать на выбранном языке:

- ✅ Описания задач и подзадач
- ✅ Названия фаз и milestone
- ✅ Rationale, acceptance criteria, user stories
- ✅ Описания фич в roadmap
- ✅ Описания идей в ideation
- ✅ Все текстовые поля в JSON файлах

## Что НЕ переводится

Технические элементы остаются на английском:

- ❌ Идентификаторы (id, phase-1, feature-001)
- ❌ Названия файлов и путей
- ❌ Команды и код
- ❌ Ключи в JSON структурах

## Отключение инструкции о языке

Если вы хотите полностью отключить автоматическую инструкцию о языке:

```bash
export AUTO_CLAUDE_DISABLE_LANGUAGE_INSTRUCTION=true
```

## Приоритет настроек

1. `AUTO_CLAUDE_LANGUAGE` (переменная окружения)
2. `.auto-claude/config.json` (в проекте)
3. `~/.auto-claude/config.json` (глобально)
4. По умолчанию: `en` (английский)

## Примеры использования

### Русский язык для roadmap

```bash
export AUTO_CLAUDE_LANGUAGE=ru
python apps/backend/runners/roadmap_runner.py --project /path/to/project
```

### Испанский язык для ideation

```bash
export AUTO_CLAUDE_LANGUAGE=es
python apps/backend/runners/ideation_runner.py --project /path/to/project
```

### Немецкий язык для spec

```bash
export AUTO_CLAUDE_LANGUAGE=de
python apps/backend/cli/main.py spec create "Neue Funktion"
```

## Добавление нового языка

Чтобы добавить поддержку нового языка, отредактируйте `apps/backend/core/language_config.py`:

1. Добавьте код языка в словарь `instructions`
2. Создайте инструкцию на этом языке
3. Следуйте формату существующих инструкций

```python
instructions = {
    "ru": "...",
    "en": "...",
    "it": """---  # Новый язык

**IMPORTANTE: LINGUA DI GENERAZIONE DEI CONTENUTI**

TUTTA LA GENERAZIONE DI CONTENUTI DEVE ESSERE IN ITALIANO.

...

---

""",
}
```

## Архитектура

Централизованная конфигурация языка реализована в модуле `core/language_config.py`:

- `get_output_language()` - определяет текущий язык
- `get_language_instruction()` - генерирует инструкцию для LLM
- `should_inject_language_instruction()` - проверяет, нужно ли добавлять инструкцию

Инструкция автоматически добавляется ко всем промптам через:
- `runners/roadmap/executor.py` - для roadmap агентов
- `prompts_pkg/prompts.py` - для spec агентов
- `prompts_pkg/prompt_generator.py` - для subtask промптов

Это обеспечивает DRY подход - настройка в одном месте применяется везде.
