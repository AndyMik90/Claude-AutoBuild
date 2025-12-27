"""
Language Commands Module
========================

Programming language-specific commands including interpreters,
compilers, and language-specific tooling.
"""


# =============================================================================
# LANGUAGE-SPECIFIC COMMANDS
# =============================================================================

LANGUAGE_COMMANDS: dict[str, set[str]] = {
    "python": {
        "python",
        "python3",
        "pip",
        "pip3",
        "pipx",
        "ipython",
        "jupyter",
        "notebook",
        "pdb",
        "pudb",  # debuggers
    },
    "javascript": {
        "node",
        "npm",
        "npx",
    },
    "typescript": {
        "tsc",
        "ts-node",
        "tsx",
    },
    "rust": {
        "cargo",
        "rustc",
        "rustup",
        "rustfmt",
        "clippy",
        "rust-analyzer",
    },
    "go": {
        "go",
        "gofmt",
        "golint",
        "gopls",
        "go-outline",
        "gocode",
        "gotests",
    },
    "ruby": {
        "ruby",
        "gem",
        "irb",
        "erb",
    },
    "php": {
        "php",
        "composer",
    },
    "java": {
        "java",
        "javac",
        "jar",
        "mvn",
        "maven",
        "gradle",
        "gradlew",
        "ant",
    },
    "kotlin": {
        "kotlin",
        "kotlinc",
    },
    "scala": {
        "scala",
        "scalac",
        "sbt",
    },
    "csharp": {
        "dotnet",
        "nuget",
        "msbuild",
    },
    "c": {
        "gcc",
        "g++",
        "clang",
        "clang++",
        "make",
        "cmake",
        "ninja",
        "meson",
        "ld",
        "ar",
        "nm",
        "objdump",
        "strip",
    },
    "cpp": {
        "gcc",
        "g++",
        "clang",
        "clang++",
        "make",
        "cmake",
        "ninja",
        "meson",
        "ld",
        "ar",
        "nm",
        "objdump",
        "strip",
    },
    "elixir": {
        "elixir",
        "mix",
        "iex",
    },
    "haskell": {
        "ghc",
        "ghci",
        "cabal",
        "stack",
    },
    "lua": {
        "lua",
        "luac",
        "luarocks",
    },
    "perl": {
        "perl",
        "cpan",
        "cpanm",
    },
    "swift": {
        "swift",
        "swiftc",
        "xcodebuild",
    },
    "zig": {
        "zig",
    },
}


__all__ = ["LANGUAGE_COMMANDS"]
