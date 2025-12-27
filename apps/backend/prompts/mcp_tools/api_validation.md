## API VALIDATION

For applications with API endpoints, verify routes, authentication, and response formats.

### Validation Steps

#### Step 1: Verify Endpoints Exist

Check that new/modified endpoints are properly registered:

**FastAPI:**
```bash
# Start server and check /docs or /openapi.json
curl http://localhost:8000/openapi.json | jq '.paths | keys'
```

**Express/Node:**
```bash
# Use route listing if available, or check source
grep -r "router\.\(get\|post\|put\|delete\)" --include="*.js" --include="*.ts" .
```

**Django REST:**
```bash
python manage.py show_urls
```

#### Step 2: Test Endpoint Responses

For each new/modified endpoint, verify:

**Success case:**
```bash
curl -X GET http://localhost:8000/api/resource \
  -H "Content-Type: application/json" \
  | jq .
```

**With authentication (if required):**
```bash
curl -X GET http://localhost:8000/api/resource \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

**POST with body:**
```bash
curl -X POST http://localhost:8000/api/resource \
  -H "Content-Type: application/json" \
  -d '{"field": "value"}'
```

#### Step 3: Verify Error Handling

Test error cases return appropriate status codes:

**400 - Bad Request (validation error):**
```bash
curl -X POST http://localhost:8000/api/resource \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}'
# Should return 400 with error details
```

**401 - Unauthorized (missing auth):**
```bash
curl -X GET http://localhost:8000/api/protected-resource
# Should return 401
```

**404 - Not Found:**
```bash
curl -X GET http://localhost:8000/api/resource/nonexistent-id
# Should return 404
```

#### Step 4: Verify Response Format

Check that responses match expected schema:

```bash
# Verify JSON structure
curl http://localhost:8000/api/resource | jq 'keys'

# Check specific fields exist
curl http://localhost:8000/api/resource | jq '.data | has("id", "name")'
```

### Document Findings

```
API VERIFICATION:
- Endpoints registered: YES/NO
- Response formats: PASS/FAIL
- Error handling: PASS/FAIL
- Authentication: PASS/FAIL (if applicable)
- Issues: [list or "None"]

ENDPOINTS TESTED:
| Method | Path | Status | Notes |
|--------|------|--------|-------|
| GET | /api/resource | PASS | 200 OK |
| POST | /api/resource | PASS | 201 Created |
```

### Common Issues

**Missing Route Registration:**
Endpoint code exists but route not registered:
1. Check router imports
2. Verify middleware order
3. Check route prefix/base path

**Incorrect Status Codes:**
Wrong HTTP status returned:
1. 200 for created resources (should be 201)
2. 200 for errors (should be 4xx/5xx)

**Missing Validation:**
Invalid input accepted:
1. Add request body validation
2. Add parameter type checking
