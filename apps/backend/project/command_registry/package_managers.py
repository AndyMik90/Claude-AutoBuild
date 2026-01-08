"""
Package Manager Commands Module
================================

Commands for various package managers across different ecosystems.
"""


# =============================================================================
# PACKAGE MANAGER COMMANDS
# =============================================================================

PACKAGE_MANAGER_COMMANDS: dict[str, set[str]] = {
    "npm": {"npm", "npx"},
    "yarn": {"yarn"},
    "pnpm": {"pnpm", "pnpx"},
    "bun": {"bun", "bunx"},
    "deno": {"deno"},
    "pip": {"pip", "pip3"},
    "poetry": {"poetry"},
    "uv": {"uv", "uvx"},
    "pdm": {"pdm"},
    "hatch": {"hatch"},
    "pipenv": {"pipenv"},
    "conda": {"conda", "mamba"},
    "cargo": {"cargo"},
    "go_mod": {"go"},
    "gem": {"gem", "bundle", "bundler"},
    "composer": {"composer"},
    "maven": {"mvn", "maven"},
    "gradle": {"gradle", "gradlew"},
    "nuget": {"nuget", "dotnet"},
    "brew": {"brew"},
    "apt": {"apt", "apt-get", "dpkg"},
    "nix": {"nix", "nix-shell", "nix-build", "nix-env"},
    # Dart/Flutter package managers
    "pub": {"pub", "dart"},
    "melos": {"melos", "dart", "flutter"},
}


__all__ = ["PACKAGE_MANAGER_COMMANDS"]
