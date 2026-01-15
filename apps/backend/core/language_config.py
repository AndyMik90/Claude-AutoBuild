"""
Language Configuration for LLM Output
======================================

Centralized configuration for the language in which LLM should generate content.
This allows users to configure output language in one place instead of modifying
every prompt file.

Usage:
    from core.language_config import get_language_instruction

    prompt = load_prompt_file("planner.md")
    prompt = get_language_instruction() + prompt
"""

import os
from pathlib import Path


def get_output_language() -> str:
    """
    Get the configured output language for LLM generation.

    Priority order:
    1. AUTO_CLAUDE_LANGUAGE environment variable
    2. Language setting in .auto-claude/config.json (if exists)
    3. Default to English

    Returns:
        Language code (e.g., "ru", "en", "es", "de")
    """
    # Check environment variable first
    env_lang = os.getenv("AUTO_CLAUDE_LANGUAGE")
    if env_lang:
        return env_lang.strip().lower()

    # Check config file in user's project
    try:
        import json

        # Try to find .auto-claude/config.json in current working directory
        config_path = Path.cwd() / ".auto-claude" / "config.json"
        if config_path.exists():
            with open(config_path) as f:
                config = json.load(f)
                lang = config.get("output_language")
                if lang:
                    return lang.strip().lower()
    except Exception:
        pass

    # Default to English
    return "en"


def get_language_instruction() -> str:
    """
    Get the language instruction to prepend to prompts.

    This function generates a clear instruction for the LLM to generate
    all content in the specified language.

    Returns:
        Markdown-formatted language instruction string
    """
    lang = get_output_language()

    # Language-specific instructions
    instructions = {
        "ru": """---

**ВАЖНО: ЯЗЫК ГЕНЕРАЦИИ КОНТЕНТА**

ВСЯ ГЕНЕРАЦИЯ КОНТЕНТА ДОЛЖНА БЫТЬ НА РУССКОМ ЯЗЫКЕ.

Это включает:
- Все описания задач, фич, идей
- Названия фаз, issues, подзадач, milestone
- Rationale, acceptance criteria, user stories
- Описания проблем, уязвимостей, оптимизаций
- Все текстовые поля в JSON файлах
- Комментарии и пояснения, коммиты

Исключения (остаются на английском):
- Технические идентификаторы (id, phase-1, feature-001)
- Названия файлов и путей
- Команды и код
- Ключи в JSON структурах

---

""",
        "en": """---

**IMPORTANT: CONTENT GENERATION LANGUAGE**

ALL CONTENT GENERATION MUST BE IN ENGLISH.

This includes:
- All task, feature, and idea descriptions
- Phase names, subtask names, milestones
- Rationale, acceptance criteria, user stories
- Problem descriptions, vulnerabilities, optimizations
- All text fields in JSON files
- Comments and explanations

Exceptions (technical identifiers remain as-is):
- Technical identifiers (id, phase-1, feature-001)
- File names and paths
- Commands and code
- JSON structure keys

---

""",
        "es": """---

**IMPORTANTE: IDIOMA DE GENERACIÓN DE CONTENIDO**

TODA LA GENERACIÓN DE CONTENIDO DEBE ESTAR EN ESPAÑOL.

Esto incluye:
- Todas las descripciones de tareas, características e ideas
- Nombres de fases, subtareas, hitos
- Justificación, criterios de aceptación, historias de usuario
- Descripciones de problemas, vulnerabilidades, optimizaciones
- Todos los campos de texto en archivos JSON
- Comentarios y explicaciones

Excepciones (los identificadores técnicos permanecen en inglés):
- Identificadores técnicos (id, phase-1, feature-001)
- Nombres de archivos y rutas
- Comandos y código
- Claves de estructura JSON

---

""",
        "de": """---

**WICHTIG: SPRACHE DER INHALTSGENERIERUNG**

ALLE INHALTSGENERIERUNG MUSS AUF DEUTSCH SEIN.

Dies beinhaltet:
- Alle Aufgaben-, Feature- und Ideenbeschreibungen
- Phasennamen, Untertasknamen, Meilensteine
- Begründung, Akzeptanzkriterien, User Stories
- Problembeschreibungen, Schwachstellen, Optimierungen
- Alle Textfelder in JSON-Dateien
- Kommentare und Erklärungen

Ausnahmen (technische Bezeichner bleiben auf Englisch):
- Technische Bezeichner (id, phase-1, feature-001)
- Dateinamen und Pfade
- Befehle und Code
- JSON-Strukturschlüssel

---

""",
        "fr": """---

**IMPORTANT : LANGUE DE GÉNÉRATION DE CONTENU**

TOUTE LA GÉNÉRATION DE CONTENU DOIT ÊTRE EN FRANÇAIS.

Cela inclut :
- Toutes les descriptions de tâches, fonctionnalités et idées
- Noms de phases, sous-tâches, jalons
- Justification, critères d'acceptation, user stories
- Descriptions de problèmes, vulnérabilités, optimisations
- Tous les champs de texte dans les fichiers JSON
- Commentaires et explications

Exceptions (les identifiants techniques restent en anglais) :
- Identifiants techniques (id, phase-1, feature-001)
- Noms de fichiers et chemins
- Commandes et code
- Clés de structure JSON

---

""",
    }

    # Return instruction for the configured language, or English if not found
    return instructions.get(lang, instructions["en"])


def should_inject_language_instruction() -> bool:
    """
    Check if language instruction should be injected into prompts.

    Returns False only if explicitly disabled via environment variable.

    Returns:
        True if language instruction should be added, False otherwise
    """
    disable = os.getenv("AUTO_CLAUDE_DISABLE_LANGUAGE_INSTRUCTION", "").lower()
    return disable not in ("1", "true", "yes")
