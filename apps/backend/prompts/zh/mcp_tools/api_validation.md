## API 验证

对于具有 API 端点的应用程序，验证路由、身份验证和响应格式。

### 验证步骤

#### 步骤 1：验证端点存在

检查新增/修改的端点是否正确注册：

**FastAPI：**
```bash
# 启动服务器并检查 /docs 或 /openapi.json
curl http://localhost:8000/openapi.json | jq '.paths | keys'
```

**Express/Node：**
```bash
# 使用路由列表（如果可用），或检查源代码
grep -r "router\.\(get\|post\|put\|delete\)" --include="*.js" --include="*.ts" .
```

**Django REST：**
```bash
python manage.py show_urls
```

#### 步骤 2：测试端点响应

对于每个新增/修改的端点，验证：

**成功场景：**
```bash
curl -X GET http://localhost:8000/api/resource \
  -H "Content-Type: application/json" \
  | jq .
```

**带身份验证（如果需要）：**
```bash
curl -X GET http://localhost:8000/api/resource \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

**带请求体的 POST：**
```bash
curl -X POST http://localhost:8000/api/resource \
  -H "Content-Type: application/json" \
  -d '{"field": "value"}'
```

#### 步骤 3：验证错误处理

测试错误场景是否返回适当的状态码：

**400 - 错误请求（验证错误）：**
```bash
curl -X POST http://localhost:8000/api/resource \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}'
# 应返回 400 及错误详情
```

**401 - 未授权（缺少身份验证）：**
```bash
curl -X GET http://localhost:8000/api/protected-resource
# 应返回 401
```

**404 - 未找到：**
```bash
curl -X GET http://localhost:8000/api/resource/nonexistent-id
# 应返回 404
```

#### 步骤 4：验证响应格式

检查响应是否符合预期的架构：

```bash
# 验证 JSON 结构
curl http://localhost:8000/api/resource | jq 'keys'

# 检查特定字段是否存在
curl http://localhost:8000/api/resource | jq '.data | has("id", "name")'
```

### 记录发现

```
API 验证：
- 端点已注册：是/否
- 响应格式：通过/失败
- 错误处理：通过/失败
- 身份验证：通过/失败（如适用）
- 问题：[列表或"无"]

已测试端点：
| 方法 | 路径 | 状态 | 备注 |
|--------|------|--------|-------|
| GET | /api/resource | 通过 | 200 OK |
| POST | /api/resource | 通过 | 201 Created |
```

### 常见问题

**缺少路由注册：**
端点代码存在但路由未注册：
1. 检查路由器导入
2. 验证中间件顺序
3. 检查路由前缀/基础路径

**状态码不正确：**
返回的 HTTP 状态码错误：
1. 创建资源返回 200（应为 201）
2. 错误返回 200（应为 4xx/5xx）

**缺少验证：**
接受了无效输入：
1. 添加请求体验证
2. 添加参数类型检查
