## 数据库验证

对于具有数据库依赖的应用程序，验证迁移和架构完整性。

### 验证步骤

#### 步骤 1：检查迁移是否存在

验证是否为任何架构更改创建了迁移文件：

**Django：**
```bash
python manage.py showmigrations
```

**Rails：**
```bash
rails db:migrate:status
```

**Prisma：**
```bash
npx prisma migrate status
```

**Alembic (SQLAlchemy)：**
```bash
alembic history
alembic current
```

**Drizzle：**
```bash
npx drizzle-kit status
```

#### 步骤 2：验证迁移可应用

测试迁移可以应用到新数据库：

**Django：**
```bash
python manage.py migrate --plan
```

**Prisma：**
```bash
npx prisma migrate deploy --preview-feature
```

**Alembic：**
```bash
alembic upgrade head
```

#### 步骤 3：验证架构与模型匹配

检查数据库架构是否与模型定义匹配：

**Prisma：**
```bash
npx prisma validate
npx prisma db pull --print
```

**Django：**
```bash
python manage.py makemigrations --check --dry-run
```

#### 步骤 4：检查数据完整性

如果功能修改了现有数据：
1. 验证数据迁移处理边界情况
2. 检查新字段的非空约束
3. 验证外键关系

### 记录发现

```
数据库验证：
- 迁移存在：是/否
- 迁移已应用：是/否
- 架构正确：是/否
- 数据完整性：通过/失败
- 问题：[列表或"无"]
```

### 常见问题

**缺少迁移：**
如果模型已更改但不存在迁移文件：
1. 标记为严重问题
2. 要求开发者生成迁移

**迁移失败：**
如果迁移无法应用：
1. 检查依赖问题
2. 验证数据库连接
3. 检查冲突的迁移

**架构漂移：**
如果数据库架构与模型不匹配：
1. 生成新迁移
2. 检查差异以确认非预期更改
