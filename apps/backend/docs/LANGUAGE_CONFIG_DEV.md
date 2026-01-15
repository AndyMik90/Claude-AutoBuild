# Language Configuration - Developer Guide

## Architecture

The language configuration system is implemented in `apps/backend/core/language_config.py` and provides centralized control over the language used for LLM-generated content.

## Key Components

### 1. `get_output_language() -> str`

Determines the current output language with the following priority:

1. `AUTO_CLAUDE_LANGUAGE` environment variable
2. `.auto-claude/config.json` in project directory
3. `~/.auto-claude/config.json` in user home directory
4. Default: `"en"`

### 2. `get_language_instruction() -> str`

Generates a markdown-formatted instruction block for the LLM. This instruction:
- Clearly states the target language
- Lists what should be translated (descriptions, rationale, etc.)
- Lists what should NOT be translated (IDs, file paths, code)
- Is formatted with markdown for emphasis

### 3. `should_inject_language_instruction() -> bool`

Checks if language instruction should be added to prompts. Returns `False` only if explicitly disabled via `AUTO_CLAUDE_DISABLE_LANGUAGE_INSTRUCTION=true`.

## Integration Points

The language instruction is automatically injected at the beginning of prompts in:

### 1. Roadmap Agents (`runners/roadmap/executor.py`)

```python
from core.language_config import get_language_instruction, should_inject_language_instruction

# In AgentExecutor.run_agent()
prompt = prompt_path.read_text()

if should_inject_language_instruction():
    language_instruction = get_language_instruction()
    prompt = language_instruction + prompt
```

### 2. Spec Agents (`prompts_pkg/prompts.py`)

```python
from core.language_config import get_language_instruction, should_inject_language_instruction

def _load_prompt_file(filename: str) -> str:
    prompt = prompt_file.read_text()
    
    if should_inject_language_instruction():
        prompt = get_language_instruction() + prompt
    
    return prompt
```

### 3. Subtask Prompts (`prompts_pkg/prompt_generator.py`)

```python
from core.language_config import get_language_instruction, should_inject_language_instruction

def generate_subtask_prompt(...) -> str:
    sections = []
    
    if should_inject_language_instruction():
        sections.append(get_language_instruction())
    
    # ... rest of prompt generation
```

## Adding a New Language

To add support for a new language:

1. Edit `apps/backend/core/language_config.py`
2. Add a new entry to the `instructions` dictionary in `get_language_instruction()`
3. Follow the format of existing instructions:
   - Start and end with `---`
   - Use bold markdown for emphasis
   - Clearly state what should and shouldn't be translated
   - Include examples if helpful

Example:

```python
instructions = {
    "ru": "...",
    "en": "...",
    "it": """---

**IMPORTANTE: LINGUA DI GENERAZIONE DEI CONTENUTI**

TUTTA LA GENERAZIONE DI CONTENUTI DEVE ESSERE IN ITALIANO.

Questo include:
- Tutte le descrizioni di attività, funzionalità e idee
- Nomi di fasi, sottoattività, milestone
- Giustificazione, criteri di accettazione, user stories
- Descrizioni di problemi, vulnerabilità, ottimizzazioni
- Tutti i campi di testo nei file JSON
- Commenti e spiegazioni

Eccezioni (gli identificatori tecnici rimangono in inglese):
- Identificatori tecnici (id, phase-1, feature-001)
- Nomi di file e percorsi
- Comandi e codice
- Chiavi di struttura JSON

---

""",
}
```

## Testing

Run the language configuration tests:

```bash
cd apps/backend
python -m pytest tests/test_language_config.py -v
```

Or manually test:

```bash
export AUTO_CLAUDE_LANGUAGE=ru
python3 -c "
import sys
sys.path.insert(0, 'apps/backend')
from core.language_config import get_output_language, get_language_instruction
print('Language:', get_output_language())
print('Instruction preview:', get_language_instruction()[:200])
"
```

## Configuration Files

### Project-level: `.auto-claude/config.json`

```json
{
  "output_language": "ru"
}
```

### User-level: `~/.auto-claude/config.json`

```json
{
  "output_language": "ru"
}
```

## Environment Variables

- `AUTO_CLAUDE_LANGUAGE` - Set output language (e.g., `ru`, `en`, `es`)
- `AUTO_CLAUDE_DISABLE_LANGUAGE_INSTRUCTION` - Disable injection (set to `true`, `1`, or `yes`)

## Design Principles

1. **DRY**: Language configuration in one place, applied everywhere
2. **Non-invasive**: No changes to existing prompt markdown files
3. **Flexible**: Multiple configuration methods (env, project config, global config)
4. **Explicit**: Clear instructions to LLM about what to translate
5. **Overridable**: Can be disabled if needed

## Backward Compatibility

The system is fully backward compatible:
- If no language is configured, defaults to English
- If injection is disabled, prompts work as before
- Existing prompt files don't need modification

## Future Enhancements

Potential improvements:
- Per-agent language override
- Language detection from project files
- Translation of existing generated content
- Language-specific prompt variations
