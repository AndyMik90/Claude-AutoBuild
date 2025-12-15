"""
Command Registry for Dynamic Security Profiles
==============================================

Maps technologies to their associated commands for building
tailored security profiles.
"""

# =============================================================================
# BASE COMMANDS - Always safe regardless of project type
# =============================================================================

BASE_COMMANDS = {
    # Core shell
    "echo",
    "printf",
    "cat",
    "head",
    "tail",
    "less",
    "more",
    "ls",
    "pwd",
    "cd",
    "pushd",
    "popd",
    "cp",
    "mv",
    "mkdir",
    "rmdir",
    "touch",
    "ln",
    "find",
    "fd",
    "grep",
    "egrep",
    "fgrep",
    "rg",
    "ag",
    "sort",
    "uniq",
    "cut",
    "tr",
    "sed",
    "awk",
    "gawk",
    "wc",
    "diff",
    "cmp",
    "comm",
    "tee",
    "xargs",
    "read",
    "file",
    "stat",
    "tree",
    "du",
    "df",
    "which",
    "whereis",
    "type",
    "command",
    "date",
    "time",
    "sleep",
    "timeout",
    "watch",
    "true",
    "false",
    "test",
    "[",
    "[[",
    "env",
    "printenv",
    "export",
    "unset",
    "set",
    "source",
    ".",
    "eval",
    "exec",
    "exit",
    "return",
    "break",
    "continue",
    "sh",
    "bash",
    "zsh",
    # Archives
    "tar",
    "zip",
    "unzip",
    "gzip",
    "gunzip",
    # Network (read-only)
    "curl",
    "wget",
    "ping",
    "host",
    "dig",
    # Git (always needed)
    "git",
    "gh",
    # Process management (with validation in security.py)
    "ps",
    "pgrep",
    "lsof",
    "jobs",
    "kill",
    "pkill",
    "killall",  # Validated for safe targets only
    # File operations (with validation in security.py)
    "rm",
    "chmod",  # Validated for safe operations only
    # Text tools
    "paste",
    "join",
    "split",
    "fold",
    "fmt",
    "nl",
    "rev",
    "shuf",
    "column",
    "expand",
    "unexpand",
    "iconv",
    # Misc safe
    "clear",
    "reset",
    "man",
    "help",
    "uname",
    "whoami",
    "id",
    "basename",
    "dirname",
    "realpath",
    "readlink",
    "mktemp",
    "bc",
    "expr",
    "let",
    "seq",
    "yes",
    "jq",
    "yq",
}

# =============================================================================
# VALIDATED COMMANDS - Need extra validation even when allowed
# =============================================================================

VALIDATED_COMMANDS = {
    "rm": "validate_rm",
    "chmod": "validate_chmod",
    "pkill": "validate_pkill",
    "kill": "validate_kill",
    "killall": "validate_killall",
}

# =============================================================================
# LANGUAGE-SPECIFIC COMMANDS
# =============================================================================

LANGUAGE_COMMANDS = {
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

# =============================================================================
# PACKAGE MANAGER COMMANDS
# =============================================================================

PACKAGE_MANAGER_COMMANDS = {
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
}

# =============================================================================
# FRAMEWORK-SPECIFIC COMMANDS
# =============================================================================

FRAMEWORK_COMMANDS = {
    # Python web frameworks
    "flask": {"flask", "gunicorn", "waitress", "gevent"},
    "django": {"django-admin", "gunicorn", "daphne", "uvicorn"},
    "fastapi": {"uvicorn", "gunicorn", "hypercorn"},
    "starlette": {"uvicorn", "gunicorn"},
    "tornado": {"tornado"},
    "bottle": {"bottle"},
    "pyramid": {"pserve", "pyramid"},
    "sanic": {"sanic"},
    "aiohttp": {"aiohttp"},
    # Python data/ML
    "celery": {"celery"},
    "dramatiq": {"dramatiq"},
    "rq": {"rq", "rqworker"},
    "airflow": {"airflow"},
    "prefect": {"prefect"},
    "dagster": {"dagster", "dagit"},
    "dbt": {"dbt"},
    "streamlit": {"streamlit"},
    "gradio": {"gradio"},
    "panel": {"panel"},
    "dash": {"dash"},
    # Python testing/linting
    "pytest": {"pytest", "py.test"},
    "unittest": {"python", "python3"},
    "nose": {"nosetests"},
    "tox": {"tox"},
    "nox": {"nox"},
    "mypy": {"mypy"},
    "pyright": {"pyright"},
    "ruff": {"ruff"},
    "black": {"black"},
    "isort": {"isort"},
    "flake8": {"flake8"},
    "pylint": {"pylint"},
    "bandit": {"bandit"},
    "coverage": {"coverage"},
    "pre-commit": {"pre-commit"},
    # Python DB migrations
    "alembic": {"alembic"},
    "flask-migrate": {"flask"},
    "django-migrations": {"django-admin"},
    # Node.js frameworks
    "nextjs": {"next"},
    "nuxt": {"nuxt", "nuxi"},
    "react": {"react-scripts"},
    "vue": {"vue-cli-service", "vite"},
    "angular": {"ng"},
    "svelte": {"svelte-kit", "vite"},
    "astro": {"astro"},
    "remix": {"remix"},
    "gatsby": {"gatsby"},
    "express": {"express"},
    "nestjs": {"nest"},
    "fastify": {"fastify"},
    "koa": {"koa"},
    "hapi": {"hapi"},
    "adonis": {"adonis", "ace"},
    "strapi": {"strapi"},
    "keystone": {"keystone"},
    "payload": {"payload"},
    "directus": {"directus"},
    "medusa": {"medusa"},
    "blitz": {"blitz"},
    "redwood": {"rw", "redwood"},
    "sails": {"sails"},
    "meteor": {"meteor"},
    "electron": {"electron", "electron-builder"},
    "tauri": {"tauri"},
    "capacitor": {"cap", "capacitor"},
    "expo": {"expo", "eas"},
    "react-native": {"react-native", "npx"},
    # Node.js build tools
    "vite": {"vite"},
    "webpack": {"webpack", "webpack-cli"},
    "rollup": {"rollup"},
    "esbuild": {"esbuild"},
    "parcel": {"parcel"},
    "turbo": {"turbo"},
    "nx": {"nx"},
    "lerna": {"lerna"},
    "rush": {"rush"},
    "changesets": {"changeset"},
    # Node.js testing/linting
    "jest": {"jest"},
    "vitest": {"vitest"},
    "mocha": {"mocha"},
    "jasmine": {"jasmine"},
    "ava": {"ava"},
    "playwright": {"playwright"},
    "cypress": {"cypress"},
    "puppeteer": {"puppeteer"},
    "eslint": {"eslint"},
    "prettier": {"prettier"},
    "biome": {"biome"},
    "oxlint": {"oxlint"},
    "stylelint": {"stylelint"},
    "tslint": {"tslint"},
    "standard": {"standard"},
    "xo": {"xo"},
    # Node.js ORMs/Database tools (also in DATABASE_COMMANDS for when detected via DB)
    "prisma": {"prisma", "npx"},
    "drizzle": {"drizzle-kit", "npx"},
    "typeorm": {"typeorm", "npx"},
    "sequelize": {"sequelize", "npx"},
    "knex": {"knex", "npx"},
    # Ruby frameworks
    "rails": {"rails", "rake", "spring"},
    "sinatra": {"sinatra", "rackup"},
    "hanami": {"hanami"},
    "rspec": {"rspec"},
    "minitest": {"rake"},
    "rubocop": {"rubocop"},
    # PHP frameworks
    "laravel": {"artisan", "sail"},
    "symfony": {"symfony", "console"},
    "wordpress": {"wp"},
    "drupal": {"drush"},
    "phpunit": {"phpunit"},
    "phpstan": {"phpstan"},
    "psalm": {"psalm"},
    # Rust frameworks
    "actix": {"cargo"},
    "rocket": {"cargo"},
    "axum": {"cargo"},
    "warp": {"cargo"},
    "tokio": {"cargo"},
    # Go frameworks
    "gin": {"go"},
    "echo": {"go"},
    "fiber": {"go"},
    "chi": {"go"},
    "buffalo": {"buffalo"},
    # Elixir/Erlang
    "phoenix": {"mix", "iex"},
    "ecto": {"mix"},
}

# =============================================================================
# DATABASE COMMANDS
# =============================================================================

DATABASE_COMMANDS = {
    "postgresql": {
        "psql",
        "pg_dump",
        "pg_restore",
        "pg_dumpall",
        "createdb",
        "dropdb",
        "createuser",
        "dropuser",
        "pg_ctl",
        "postgres",
        "initdb",
        "pg_isready",
    },
    "mysql": {
        "mysql",
        "mysqldump",
        "mysqlimport",
        "mysqladmin",
        "mysqlcheck",
        "mysqlshow",
    },
    "mariadb": {
        "mysql",
        "mariadb",
        "mysqldump",
        "mariadb-dump",
    },
    "mongodb": {
        "mongosh",
        "mongo",
        "mongod",
        "mongos",
        "mongodump",
        "mongorestore",
        "mongoexport",
        "mongoimport",
    },
    "redis": {
        "redis-cli",
        "redis-server",
        "redis-benchmark",
    },
    "sqlite": {
        "sqlite3",
        "sqlite",
    },
    "cassandra": {
        "cqlsh",
        "cassandra",
        "nodetool",
    },
    "elasticsearch": {
        "elasticsearch",
        "curl",  # ES uses REST API
    },
    "neo4j": {
        "cypher-shell",
        "neo4j",
        "neo4j-admin",
    },
    "dynamodb": {
        "aws",  # DynamoDB uses AWS CLI
    },
    "cockroachdb": {
        "cockroach",
    },
    "clickhouse": {
        "clickhouse-client",
        "clickhouse-local",
    },
    "influxdb": {
        "influx",
        "influxd",
    },
    "timescaledb": {
        "psql",  # TimescaleDB uses PostgreSQL
    },
    "prisma": {
        "prisma",
        "npx",
    },
    "drizzle": {
        "drizzle-kit",
        "npx",
    },
    "typeorm": {
        "typeorm",
        "npx",
    },
    "sequelize": {
        "sequelize",
        "npx",
    },
    "knex": {
        "knex",
        "npx",
    },
    "sqlalchemy": {
        "alembic",
        "python",
        "python3",
    },
}

# =============================================================================
# INFRASTRUCTURE/DEVOPS COMMANDS
# =============================================================================

INFRASTRUCTURE_COMMANDS = {
    "docker": {
        "docker",
        "docker-compose",
        "docker-buildx",
        "dockerfile",
        "dive",  # Dockerfile analysis
    },
    "podman": {
        "podman",
        "podman-compose",
        "buildah",
    },
    "kubernetes": {
        "kubectl",
        "k9s",
        "kubectx",
        "kubens",
        "kustomize",
        "kubeseal",
        "kubeadm",
    },
    "helm": {
        "helm",
        "helmfile",
    },
    "terraform": {
        "terraform",
        "terragrunt",
        "tflint",
        "tfsec",
    },
    "pulumi": {
        "pulumi",
    },
    "ansible": {
        "ansible",
        "ansible-playbook",
        "ansible-galaxy",
        "ansible-vault",
        "ansible-lint",
    },
    "vagrant": {
        "vagrant",
    },
    "packer": {
        "packer",
    },
    "minikube": {
        "minikube",
    },
    "kind": {
        "kind",
    },
    "k3d": {
        "k3d",
    },
    "skaffold": {
        "skaffold",
    },
    "argocd": {
        "argocd",
    },
    "flux": {
        "flux",
    },
    "istio": {
        "istioctl",
    },
    "linkerd": {
        "linkerd",
    },
}

# =============================================================================
# CLOUD PROVIDER CLIs
# =============================================================================

CLOUD_COMMANDS = {
    "aws": {
        "aws",
        "sam",
        "cdk",
        "amplify",
        "eb",  # AWS CLI, SAM, CDK, Amplify, Elastic Beanstalk
    },
    "gcp": {
        "gcloud",
        "gsutil",
        "bq",
        "firebase",
    },
    "azure": {
        "az",
        "func",  # Azure CLI, Azure Functions
    },
    "vercel": {
        "vercel",
        "vc",
    },
    "netlify": {
        "netlify",
        "ntl",
    },
    "heroku": {
        "heroku",
    },
    "railway": {
        "railway",
    },
    "fly": {
        "fly",
        "flyctl",
    },
    "render": {
        "render",
    },
    "cloudflare": {
        "wrangler",
        "cloudflared",
    },
    "digitalocean": {
        "doctl",
    },
    "linode": {
        "linode-cli",
    },
    "supabase": {
        "supabase",
    },
    "planetscale": {
        "pscale",
    },
    "neon": {
        "neonctl",
    },
}

# =============================================================================
# CODE QUALITY COMMANDS
# =============================================================================

CODE_QUALITY_COMMANDS = {
    "shellcheck": {"shellcheck"},
    "hadolint": {"hadolint"},
    "actionlint": {"actionlint"},
    "yamllint": {"yamllint"},
    "jsonlint": {"jsonlint"},
    "markdownlint": {"markdownlint", "markdownlint-cli"},
    "vale": {"vale"},
    "cspell": {"cspell"},
    "codespell": {"codespell"},
    "cloc": {"cloc"},
    "scc": {"scc"},
    "tokei": {"tokei"},
    "git-secrets": {"git-secrets"},
    "gitleaks": {"gitleaks"},
    "trufflehog": {"trufflehog"},
    "detect-secrets": {"detect-secrets"},
    "semgrep": {"semgrep"},
    "snyk": {"snyk"},
    "trivy": {"trivy"},
    "grype": {"grype"},
    "syft": {"syft"},
    "dockle": {"dockle"},
}

# =============================================================================
# VERSION MANAGER COMMANDS
# =============================================================================

VERSION_MANAGER_COMMANDS = {
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
}
