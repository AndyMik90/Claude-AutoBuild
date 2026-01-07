"""
Framework Commands Module
=========================

Commands for web frameworks, testing frameworks, build tools,
and other framework-specific tooling across all ecosystems.
"""


# =============================================================================
# FRAMEWORK-SPECIFIC COMMANDS
# =============================================================================

FRAMEWORK_COMMANDS: dict[str, set[str]] = {
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
    # Dart/Flutter
    "flutter": {
        "flutter",
        "dart",
        "pub",
        "fvm",  # Flutter Version Manager
    },
    "dart_frog": {"dart_frog", "dart"},  # Dart backend framework
    "serverpod": {"serverpod", "dart"},  # Dart backend framework
    "shelf": {"dart", "pub"},  # Dart HTTP server middleware
    "aqueduct": {
        "aqueduct",
        "dart",
        "pub",
    },  # Dart HTTP framework (deprecated but still used)
}


__all__ = ["FRAMEWORK_COMMANDS"]
