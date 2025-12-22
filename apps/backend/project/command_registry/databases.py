"""
Database Commands Module
========================

Commands for database clients, management tools, and ORMs.
"""


# =============================================================================
# DATABASE COMMANDS
# =============================================================================

DATABASE_COMMANDS: dict[str, set[str]] = {
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


__all__ = ["DATABASE_COMMANDS"]
