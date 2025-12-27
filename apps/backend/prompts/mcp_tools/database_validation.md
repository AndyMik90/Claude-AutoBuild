## DATABASE VALIDATION

For applications with database dependencies, verify migrations and schema integrity.

### Validation Steps

#### Step 1: Check Migrations Exist

Verify migration files were created for any schema changes:

**Django:**
```bash
python manage.py showmigrations
```

**Rails:**
```bash
rails db:migrate:status
```

**Prisma:**
```bash
npx prisma migrate status
```

**Alembic (SQLAlchemy):**
```bash
alembic history
alembic current
```

**Drizzle:**
```bash
npx drizzle-kit status
```

#### Step 2: Verify Migrations Apply

Test that migrations can be applied to a fresh database:

**Django:**
```bash
python manage.py migrate --plan
```

**Prisma:**
```bash
npx prisma migrate deploy --preview-feature
```

**Alembic:**
```bash
alembic upgrade head
```

#### Step 3: Verify Schema Matches Models

Check that database schema matches the model definitions:

**Prisma:**
```bash
npx prisma validate
npx prisma db pull --print
```

**Django:**
```bash
python manage.py makemigrations --check --dry-run
```

#### Step 4: Check for Data Integrity

If the feature modifies existing data:
1. Verify data migrations handle edge cases
2. Check for null constraints on new fields
3. Verify foreign key relationships

### Document Findings

```
DATABASE VERIFICATION:
- Migrations exist: YES/NO
- Migrations applied: YES/NO
- Schema correct: YES/NO
- Data integrity: PASS/FAIL
- Issues: [list or "None"]
```

### Common Issues

**Missing Migration:**
If a model changed but no migration file exists:
1. Flag as CRITICAL issue
2. Require developer to generate migration

**Migration Fails:**
If migration cannot be applied:
1. Check for dependency issues
2. Verify database connection
3. Check for conflicting migrations

**Schema Drift:**
If database schema doesn't match models:
1. Generate new migration
2. Review the diff for unexpected changes
