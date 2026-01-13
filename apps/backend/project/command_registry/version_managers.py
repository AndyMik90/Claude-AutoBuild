"""
Version Manager Commands Module
===============================

Commands for runtime version management tools.
"""


# =============================================================================
# VERSION MANAGER COMMANDS
# =============================================================================

VERSION_MANAGER_COMMANDS: dict[str, set[str]] = {
    "asdf": {"asdf"},
    "mise": {"mise"},
    "nvm": {"nvm"},
    "fnm": {"fnm"},
    "n": {"n"},
    "pyenv": {"pyenv"},
    "rbenv": {"rbenv"},
    "rvm": {"rvm"},
    "goenv": {"goenv"},
    "rustup": {"rustup"},
    "sdkman": {"sdk"},
    "jabba": {"jabba"},
    # Dart/Flutter version managers
    "fvm": {"fvm", "flutter"},
}


__all__ = ["VERSION_MANAGER_COMMANDS"]
