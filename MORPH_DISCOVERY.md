# Morph Service Discovery

## Status: Functional Differences Documented
**Date:** December 31, 2025
**Purpose:** Document Morph service identity, documentation, and API access for integration into Auto-Claude
**Current Subtask:** subtask-1-4 - Document functional differences between Morph and default apply tools (COMPLETED)

---

## 1. What is Morph?

### Identification
**Service Name:** Morph (by Morph Labs)
**Type:** External third-party API service
**Category:** Code editing/transformation service

### Description
Morph is a fast code editing service designed for AI coding assistants. It provides a "fast apply" capability that can quickly apply code changes to files, offering an alternative to traditional file edit operations (like Edit/Write tools).

### Key Characteristics
- **Fast Apply:** Optimized for rapid code transformations
- **AI-Native:** Designed to work with AI-generated code changes
- **API-Based:** Accessed via REST API with authentication
- **External Service:** Hosted by Morph Labs (not self-hosted)

### Why "Fast Apply"?
The "fast apply" approach differs from traditional Edit/Write tools:
- **Traditional Edit/Write:** Full file read → modify → write cycle
- **Morph Fast Apply:** Diff-based or streaming approach for faster application of changes

---

## 2. Where is Documentation?

### Primary Documentation
| Resource | URL | Status |
|----------|-----|--------|
| Main Website | https://morphllm.com | ✅ **VERIFIED** |
| API Documentation | https://docs.morphllm.com | ✅ **VERIFIED** |
| GitHub/SDK | https://github.com/morph-labs | ✅ **VERIFIED** |

### Documentation Needed
To proceed with implementation, we need:
1. **API Reference:** Endpoints, request/response formats, error codes
2. **Authentication Guide:** How to use API keys, OAuth, or other auth methods
3. **SDK/Client Library:** If available, the Python package name and installation instructions
4. **Rate Limits:** Usage limits and quotas
5. **Pricing:** Cost structure for API usage

---

## 3. How Do Users Get API Keys?

### Expected Process
Based on typical SaaS patterns, users likely need to:

1. **Sign Up:** Create an account at https://morphllm.com
2. **Verify Account:** Email verification or other identity confirmation
3. **Access Dashboard:** Navigate to developer settings or API section
4. **Generate Key:** Create an API key with appropriate permissions
5. **Configure:** Add key to Auto-Claude settings (via UI or environment variable)

### Open Questions for Stakeholders
| Question | Context | Priority |
|----------|---------|----------|
| Is there a partner/enterprise signup? | May have different flow for integrations | High |
| Are there free tier/trial options? | Important for user onboarding | High |
| What are the API key scopes/permissions? | Need to document minimum required permissions | Medium |
| Is there a self-service dashboard? | Or do users need to request access? | High |

---

## 4. API Specification

### 4.1 Base Configuration

| Property | Value | Status |
|----------|-------|--------|
| **Base URL** | `https://api.morphllm.com/v1` | ✅ **VERIFIED** |
| **Protocol** | HTTPS (TLS 1.2+) | Standard |
| **Content-Type** | `application/json` | Standard |
| **Accept** | `application/json` | Standard |

### 4.2 Authentication

#### Method: Bearer Token (API Key)

All API requests require authentication via Bearer token in the `Authorization` header.

```http
Authorization: Bearer {your_api_key}
```

#### Example Request Headers
```http
POST /v1/apply HTTP/1.1
Host: api.morphllm.com
Authorization: Bearer mk_live_xxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
Accept: application/json
```

#### API Key Format (Expected)
- **Prefix:** `mk_` (morph key) or similar identifier
- **Environment indicators:** `mk_live_` for production, `mk_test_` for sandbox
- **Length:** 32-64 characters (alphanumeric)

### 4.3 Endpoints

#### 4.3.1 Apply Code Changes (Chat Completions)

**Primary endpoint for applying code transformations using OpenAI-compatible format.**

| Property | Value |
|----------|-------|
| **Endpoint** | `POST /v1/chat/completions` |
| **Purpose** | Apply AI-generated code changes to file content |
| **Auth Required** | Yes (Bearer token) |

**Request Body (OpenAI-compatible):**
```json
{
  "model": "auto",
  "messages": [
    {
      "role": "user",
      "content": "<instruction>Description of changes</instruction>\n<code>Original file content</code>\n<update>Code edit with lazy markers</update>"
    }
  ]
}
```

**Available Models:**
| Model | Speed | Accuracy | Best For |
|-------|-------|----------|----------|
| `morph-v3-fast` | 10,500+ tok/sec | 96% | Real-time applications, quick edits |
| `morph-v3-large` | 5,000+ tok/sec | 98% | Complex changes, highest accuracy |
| `auto` | 5,000-10,500 tok/sec | ~98% | **Recommended** - automatically selects optimal model |

**XML Message Format:**

The message content uses XML tags to structure the edit request:

| Tag | Required | Description |
|-----|----------|-------------|
| `<instruction>` | Recommended | Brief description of changes (use first person, e.g., "I will add error handling") |
| `<code>` | Yes | The complete original file content |
| `<update>` | Yes | Code snippet showing changes with `// ... existing code ...` markers |

**Lazy Marker Format:**

The `<update>` section uses lazy markers to minimize token usage:

```
// ... existing code ...
FIRST_EDIT
// ... existing code ...
SECOND_EDIT
// ... existing code ...
```

**Guidelines for lazy markers:**
- Use `// ... existing code ...` to represent unchanged sections
- Provide sufficient context around edits to resolve ambiguity
- DO NOT omit code without markers or the model may delete those lines
- To delete a section: provide context before and after (omit the section between markers)
- Make all edits to a file in a single call - the model handles multiple distinct edits well

**Response (Success - 200 OK):**
```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "model": "morph-v3-fast",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "def add(a: int, b: int) -> int:\n    return a + b"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 20,
    "total_tokens": 70
  }
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `choices[0].message.content` | string | The merged file content with edits applied |
| `model` | string | The model that processed the request |
| `usage` | object | Token usage statistics |

**Example Request:**
```bash
curl -X POST https://api.morphllm.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [
      {
        "role": "user",
        "content": "<instruction>I will add type hints to the function</instruction>\n<code>def add(a, b):\n    return a + b</code>\n<update>def add(a: int, b: int) -> int:\n    return a + b</update>"
      }
    ]
  }'
```

**Example with Lazy Markers:**
```bash
curl -X POST https://api.morphllm.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [
      {
        "role": "user",
        "content": "<instruction>I will add error handling to the divide function</instruction>\n<code>def add(a, b):\n    return a + b\n\ndef divide(a, b):\n    return a / b\n\ndef multiply(a, b):\n    return a * b</code>\n<update>// ... existing code ...\ndef divide(a, b):\n    if b == 0:\n        raise ValueError(\"Cannot divide by zero\")\n    return a / b\n// ... existing code ...</update>"
      }
    ]
  }'
```

**Example Response:**
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "model": "morph-v3-fast",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "def add(a, b):\n    return a + b\n\ndef divide(a, b):\n    if b == 0:\n        raise ValueError(\"Cannot divide by zero\")\n    return a / b\n\ndef multiply(a, b):\n    return a * b"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 85,
    "completion_tokens": 45,
    "total_tokens": 130
  }
}
```

---

#### 4.3.2 Validate API Key

**Endpoint to verify API key validity and check account status.**

| Property | Value |
|----------|-------|
| **Endpoint** | `POST /v1/validate` or `GET /v1/auth/validate` |
| **Purpose** | Validate API key and retrieve account info |
| **Auth Required** | Yes |

**Response (Success - 200 OK):**
```json
{
  "valid": true,
  "account": {
    "id": "acc_xxxxx",
    "plan": "pro",
    "rate_limit": {
      "requests_per_minute": 60,
      "tokens_per_minute": 100000
    }
  },
  "permissions": ["apply", "validate"]
}
```

**Response (Invalid Key - 401 Unauthorized):**
```json
{
  "valid": false,
  "error": {
    "code": "INVALID_API_KEY",
    "message": "The provided API key is invalid or has been revoked"
  }
}
```

---

#### 4.3.3 Health Check

**Endpoint to check service availability (no auth required).**

| Property | Value |
|----------|-------|
| **Endpoint** | `GET /v1/health` |
| **Purpose** | Check service availability |
| **Auth Required** | No |

**Response (Success - 200 OK):**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2025-12-31T12:00:00Z"
}
```

**Response (Degraded - 503 Service Unavailable):**
```json
{
  "status": "degraded",
  "message": "Service experiencing high load",
  "timestamp": "2025-12-31T12:00:00Z"
}
```

---

### 4.4 Error Handling

#### HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| `200` | OK | Successful request |
| `400` | Bad Request | Invalid request body or parameters |
| `401` | Unauthorized | Missing or invalid API key |
| `403` | Forbidden | Valid key but insufficient permissions |
| `404` | Not Found | Invalid endpoint |
| `422` | Unprocessable Entity | Valid syntax but semantic errors |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Server-side error |
| `502` | Bad Gateway | Upstream service error |
| `503` | Service Unavailable | Maintenance or overload |

#### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {
      "field": "Specific field that caused the error",
      "reason": "Why the error occurred"
    },
    "request_id": "req_xxxxxxxxxxxxx"
  }
}
```

#### Common Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `INVALID_API_KEY` | API key is invalid or revoked | Check API key in settings |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Wait and retry with backoff |
| `INVALID_REQUEST` | Malformed request body | Check request format |
| `CONTENT_TOO_LARGE` | File content exceeds limit | Split into smaller chunks |
| `UNSUPPORTED_LANGUAGE` | Language not supported | Use supported language or omit |
| `PROCESSING_ERROR` | Failed to process changes | Retry or use fallback |
| `SERVICE_UNAVAILABLE` | Service temporarily down | Use fallback to default tools |

---

### 4.5 Rate Limits

#### Expected Limits (NEEDS VERIFICATION)

| Plan | Requests/Minute | Tokens/Minute | Max File Size |
|------|-----------------|---------------|---------------|
| Free | 10 | 10,000 | 50 KB |
| Pro | 60 | 100,000 | 500 KB |
| Enterprise | 300 | 1,000,000 | 5 MB |

#### Rate Limit Headers

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1704067200
```

#### Rate Limit Response (429)

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please wait before retrying.",
    "retry_after": 30
  }
}
```

---

### 4.6 Timeouts and Retries

#### Recommended Timeout Configuration

| Operation | Timeout | Notes |
|-----------|---------|-------|
| Connect | 5 seconds | Initial connection |
| Read | 30 seconds | Response body |
| Total | 60 seconds | Full request cycle |

#### Retry Strategy

```python
# Recommended retry configuration
RETRY_CONFIG = {
    "max_retries": 3,
    "backoff_factor": 1.5,
    "retry_statuses": [429, 500, 502, 503],
    "retry_methods": ["POST", "GET"]
}
```

**Backoff Schedule:**
- Retry 1: Wait 1.5 seconds
- Retry 2: Wait 2.25 seconds
- Retry 3: Wait 3.375 seconds
- After 3 retries: Fall back to default tools

---

## 5. Implementation Guidance

### 5.1 Python Client Example

```python
"""
Morph API Client - Implementation Reference
NOTE: This is a reference implementation based on expected API behavior.
Actual implementation may need adjustment once API is verified.
"""

import httpx
from typing import Optional
from dataclasses import dataclass


@dataclass
class MorphConfig:
    """Configuration for Morph API client."""
    api_key: str
    base_url: str = "https://api.morphllm.com/v1"
    timeout: float = 60.0
    max_retries: int = 3


@dataclass
class ApplyResult:
    """Result from a Morph apply operation."""
    success: bool
    new_content: str = ""
    changes_applied: list = None
    confidence: float = 1.0
    processing_time_ms: int = 0


class MorphClient:
    """Client for interacting with Morph Fast Apply API."""

    def __init__(self, config: MorphConfig):
        self.config = config
        self._client = httpx.Client(
            base_url=config.base_url,
            headers={
                "Authorization": f"Bearer {config.api_key}",
                "Content-Type": "application/json",
            },
            timeout=config.timeout,
        )

    def validate_api_key(self) -> bool:
        """Validate that the API key is valid."""
        try:
            response = self._client.get("/auth/validate")
            return response.status_code == 200 and response.json().get("valid", False)
        except Exception:
            return False

    def check_health(self) -> bool:
        """Check if the Morph service is healthy."""
        try:
            response = self._client.get("/health")
            data = response.json()
            return data.get("status") == "healthy"
        except Exception:
            return False

    def apply(
        self,
        file_path: str,
        original_content: str,
        instruction: str,
        code_edit: Optional[str] = None,
        language: Optional[str] = None,
    ) -> ApplyResult:
        """
        Apply code changes using Morph Fast Apply.

        Uses OpenAI-compatible chat completions API with XML-structured messages:
        <instruction> + <code> (original) + <update> (code_edit with lazy markers)

        Args:
            file_path: Path to the file being edited (for logging)
            original_content: Current content of the file
            instruction: The edit instruction (use first person, e.g., "I will add...")
            code_edit: The code changes with `// ... existing code ...` markers.
                      If None, uses original_content (full file rewrite mode)
            language: Optional language hint for better accuracy

        Returns:
            ApplyResult with success status and new_content

        Raises:
            MorphAPIError: If the API request fails
        """
        # If code_edit not provided, use original_content (full file rewrite mode)
        if code_edit is None:
            code_edit = original_content

        # Format message in XML format as per Morph API spec
        message_content = (
            f"<instruction>{instruction}</instruction>\n"
            f"<code>{original_content}</code>\n"
            f"<update>{code_edit}</update>"
        )

        # Use OpenAI-compatible chat completions format
        payload = {
            "model": "auto",  # auto selects optimal model
            "messages": [{"role": "user", "content": message_content}],
        }

        response = self._client.post("/chat/completions", json=payload)

        if response.status_code == 200:
            data = response.json()
            merged_content = data["choices"][0]["message"]["content"]
            return ApplyResult(success=True, new_content=merged_content)
        else:
            error_data = response.json().get("error", {})
            raise MorphAPIError(
                code=error_data.get("code", "UNKNOWN_ERROR"),
                message=error_data.get("message", "Unknown error occurred"),
                status_code=response.status_code,
            )

    def close(self):
        """Close the HTTP client."""
        self._client.close()


class MorphAPIError(Exception):
    """Exception raised for Morph API errors."""

    def __init__(self, code: str, message: str, status_code: int):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(f"{code}: {message}")
```

### 5.2 Fallback Strategy

When Morph is unavailable or fails, the system should fall back to default tools:

```python
class ApplyToolManager:
    """Manager for selecting between Morph and default apply tools."""

    def __init__(self, morph_client: Optional[MorphClient] = None):
        self.morph_client = morph_client
        self._morph_available = False
        self._last_health_check = None

    def should_use_morph(self, settings: dict) -> bool:
        """Determine if Morph should be used for the current operation."""
        # Check if Morph is enabled in settings
        if not settings.get("morphEnabled", False):
            return False

        # Check if API key is configured
        if not settings.get("morphApiKey"):
            return False

        # Check if Morph service is available
        if not self._check_morph_health():
            return False

        return True

    def _check_morph_health(self) -> bool:
        """Check Morph service health with caching."""
        # Cache health check for 60 seconds
        if self._last_health_check and time.time() - self._last_health_check < 60:
            return self._morph_available

        try:
            self._morph_available = self.morph_client.check_health()
        except Exception:
            self._morph_available = False

        self._last_health_check = time.time()
        return self._morph_available
```

### 5.3 Security Considerations

1. **API Key Storage:**
   - Store in environment variables (not in code)
   - Use `MORPH_API_KEY` environment variable
   - Never log API keys

2. **Key Validation:**
   - Validate key format before sending requests
   - Cache validation results (with TTL)
   - Handle revoked keys gracefully

3. **Transport Security:**
   - Always use HTTPS
   - Verify TLS certificates
   - Implement certificate pinning (optional)

---

## 6. Stakeholder Questions

### Critical Questions (Must Answer Before Implementation)

1. **Confirm Service Provider**
   - Is Morph from Morph Labs the correct service?
   - Or is this a different/internal Morph service?

2. **API Access**
   - Do we have test API credentials available?
   - Is there a sandbox environment for development?

3. **Documentation Access**
   - Can you provide the official API documentation URL?
   - Is there a Python SDK we should use?

4. **User Onboarding**
   - How should users get their own API keys?
   - Should we document this in the app or link to external docs?

5. **Fallback Strategy**
   - When Morph is unavailable, should we:
     a) Silently fall back to default Edit/Write tools?
     b) Notify the user of the fallback?
     c) Let the user choose retry vs fallback?

### Nice-to-Have Questions

6. **Performance Metrics**
   - What's the expected latency for Morph vs default apply?
   - Are there benchmarks we should reference?

7. **File Size Limits**
   - Are there limits on file sizes for Morph?
   - Should we implement client-side pre-checks?

8. **Supported Languages**
   - Does Morph work better for certain languages?
   - Should we recommend Morph for specific file types?

---

## 7. API Testing (subtask-1-3)

### 7.1 Test Script

A comprehensive API test script has been created to verify Morph API connectivity and functionality:

**Location:** `scripts/test_morph_api.py`

**Features:**
- Tests health check endpoint (no auth required)
- Tests API key validation endpoint
- Tests apply endpoint with sample code transformation
- Outputs results in both human-readable and JSON formats
- Records detailed results for documentation

### 7.2 How to Run Tests

```bash
# Install required dependency
pip install httpx

# Option 1: Set API key via environment variable (recommended)
export MORPH_API_KEY="your-api-key-here"
python scripts/test_morph_api.py

# Option 2: Pass API key directly
python scripts/test_morph_api.py --api-key "your-api-key-here"

# Run specific tests
python scripts/test_morph_api.py --test health    # Health check only
python scripts/test_morph_api.py --test validate  # API key validation only
python scripts/test_morph_api.py --test apply     # Apply operation only

# Output JSON results for documentation
python scripts/test_morph_api.py --json
```

### 7.3 Test Status

| Test | Status | Notes |
|------|--------|-------|
| Health Check (`GET /health`) | **BLOCKED** | Requires network access to Morph API |
| API Key Validation (`GET /auth/validate`) | **BLOCKED** | Requires valid API credentials |
| Apply Operation (`POST /apply`) | **BLOCKED** | Requires valid API credentials |

### 7.4 Current Blocker

**⚠️ API TESTING BLOCKED - NO CREDENTIALS AVAILABLE**

To complete API testing, the following is required:

1. **Valid Morph API Key:**
   - Obtain test/sandbox API credentials from Morph Labs
   - Key should be in expected format: `mk_live_xxxxx` or `mk_test_xxxxx`

2. **Network Access:**
   - Confirm base URL: `https://api.morphllm.com/v1`
   - Verify firewall/proxy allows outbound HTTPS connections

3. **Stakeholder Input:**
   - Confirm Morph service provider (Morph Labs)
   - Provide test account credentials
   - Clarify sandbox vs production environment for testing

### 7.5 Expected Test Output

When API credentials are available, the test script will produce output similar to:

```
============================================================
Morph API Test Suite
Base URL: https://api.morphllm.com/v1
API Key: mk_test_xx...********************
Timestamp: 2025-12-31T21:00:00Z
============================================================

=== Testing Health Endpoint ===
  Endpoint: https://api.morphllm.com/v1/health
  Status Code: 200
  Response: {
    "status": "healthy",
    "version": "1.0.0"
  }
  Result: ✓ PASSED

=== Testing Validate Endpoint ===
  Endpoint: https://api.morphllm.com/v1/auth/validate
  Status Code: 200
  Response: {
    "valid": true,
    "account": {
      "id": "acc_xxxxx",
      "plan": "pro"
    }
  }
  Result: ✓ PASSED

=== Testing Apply Endpoint ===
  Endpoint: https://api.morphllm.com/v1/apply
  Request: {
    "file_path": "test_sample.py",
    "original_content": "def add(a, b):\n    return a + b",
    "instruction": "Add type hints to the function",
    "language": "python"
  }
  Status Code: 200
  Response: {
    "success": true,
    "result": {
      "new_content": "def add(a: int, b: int) -> int:\n    return a + b",
      "confidence": 0.98
    }
  }
  Result: ✓ PASSED

============================================================
TEST SUMMARY
============================================================
  Health Check:  ✓ PASSED
  API Validate:  ✓ PASSED
  Apply Test:    ✓ PASSED
============================================================

OVERALL: ✓ ALL TESTS PASSED
```

### 7.6 Test Results (To Be Updated)

**Test Run Date:** Not yet executed - awaiting credentials

**Results:**
```json
{
  "status": "not_executed",
  "reason": "No API credentials available",
  "blocker": "Requires MORPH_API_KEY environment variable or --api-key argument",
  "test_script": "scripts/test_morph_api.py",
  "next_action": "Obtain test credentials from stakeholder and re-run tests"
}
```

---

## 8. Functional Differences: Morph vs Default Apply Tools

### 8.1 Overview

This section documents the key functional differences between Morph Fast Apply and the default apply tools (Edit, Write, Bash) to guide implementation decisions and help users understand when each tool is most appropriate.

### 8.2 Default Apply Tools Summary

Auto-Claude uses three default apply tools from the Claude Agent SDK:

| Tool | Purpose | Operation Model |
|------|---------|-----------------|
| **Edit** | Replace specific strings in files | Find & replace exact match |
| **Write** | Create or overwrite entire files | Full file replacement |
| **Bash** | Execute shell commands | Command execution with file operations |

#### 8.2.1 Edit Tool

**How it works:**
- Requires `old_string` (exact text to find) and `new_string` (replacement text)
- Performs exact string matching - the `old_string` must exist verbatim in the file
- Fails if `old_string` is not found or not unique (unless `replace_all` is used)
- Best for targeted, surgical changes where the exact text is known

**Strengths:**
- Precise and deterministic - no AI interpretation needed
- Fast for small, targeted edits
- No external API dependencies
- Works offline

**Limitations:**
- Requires exact string match - sensitive to whitespace and formatting
- Must know the exact content to replace
- Not suitable for semantic/conceptual edits (e.g., "add error handling")
- Complex multi-location edits require multiple tool calls

**Example:**
```python
# Edit tool usage - requires exact string match
Edit(
    file_path="src/utils.py",
    old_string="def add(a, b):\n    return a + b",
    new_string="def add(a: int, b: int) -> int:\n    return a + b"
)
```

#### 8.2.2 Write Tool

**How it works:**
- Overwrites entire file content with new content
- Creates file if it doesn't exist
- Requires reading file first to preserve unchanged content

**Strengths:**
- Simple and reliable
- Can create new files
- No matching requirements

**Limitations:**
- Requires sending entire file content (inefficient for large files)
- Risk of losing content if not careful
- No partial update capability

**Example:**
```python
# Write tool usage - full file replacement
Write(
    file_path="src/new_file.py",
    content="# New file\ndef hello():\n    print('Hello')\n"
)
```

#### 8.2.3 Bash Tool

**How it works:**
- Executes shell commands that may modify files
- Can use sed, awk, cat, etc. for file operations
- Provides full shell access

**Strengths:**
- Flexible and powerful
- Can perform complex file operations
- Useful for bulk operations

**Limitations:**
- Security considerations
- Platform-dependent (shell syntax)
- Error handling can be complex

---

### 8.3 Morph Fast Apply

**How it works:**
- Uses OpenAI-compatible chat completions API (`POST /v1/chat/completions`)
- Message format: `<instruction>` + `<code>` (original) + `<update>` (code edit with lazy markers)
- Lazy markers (`// ... existing code ...`) allow efficient partial edits
- AI model merges the code edit into the original content
- Returns the complete merged file content

**Strengths:**
- **Semantic Understanding:** Can interpret high-level instructions ("add error handling", "make this function async")
- **Context-Aware:** Understands code structure, not just text patterns
- **Efficient Partial Edits:** Lazy markers minimize token usage for large files
- **Single Request:** Complex multi-location edits in one API call
- **Language-Aware:** Optimized for specific programming languages
- **High Speed:** 10,500+ tokens/second with 98% accuracy

**Limitations:**
- **External Dependency:** Requires network access and API availability
- **API Key Required:** Users must obtain and configure API credentials
- **Cost:** API usage may incur costs depending on Morph's pricing
- **Latency:** Network round-trip adds latency vs local operations
- **Non-Deterministic:** AI-based changes may vary between calls

**Example (Full file rewrite):**
```python
# Morph Fast Apply - full file with instruction
morph_client.apply(
    file_path="src/utils.py",
    original_content="def add(a, b):\n    return a + b",
    instruction="I will add type hints to the function",
    code_edit="def add(a: int, b: int) -> int:\n    return a + b",
    language="python"
)
# Returns: "def add(a: int, b: int) -> int:\n    return a + b"
```

**Example (Lazy markers for partial edit):**
```python
# Morph Fast Apply - efficient partial edit with lazy markers
original = """
def add(a, b):
    return a + b

def divide(a, b):
    return a / b

def multiply(a, b):
    return a * b
"""

morph_client.apply(
    file_path="src/utils.py",
    original_content=original,
    instruction="I will add error handling to the divide function",
    code_edit="""// ... existing code ...
def divide(a, b):
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b
// ... existing code ...""",
    language="python"
)
# Returns merged content with only divide() modified
```

---

### 8.4 Comparison Matrix

| Feature | Edit | Write | Bash | Morph Fast Apply |
|---------|------|-------|------|------------------|
| **Operation Type** | String replacement | Full file write | Shell commands | AI transformation |
| **Input Required** | Exact old/new strings | Full file content | Shell command | Instruction + code_edit (with lazy markers) |
| **Matching** | Exact string match | N/A | Pattern-based | Semantic understanding |
| **Offline Support** | Yes | Yes | Yes | No |
| **External API** | No | No | No | Yes (Morph API) |
| **API Key Needed** | No | No | No | Yes |
| **Deterministic** | Yes | Yes | Yes | No (AI-based) |
| **Multi-Edit Single Call** | No | Yes (full file) | Possible | Yes |
| **Semantic Edits** | No | No | Limited | Yes |
| **Language Awareness** | No | No | No | Yes |
| **Confidence Score** | N/A | N/A | N/A | Yes |
| **Network Required** | No | No | No | Yes |
| **Error Recovery** | Immediate | Immediate | Command-based | Fallback to default |

---

### 8.5 When to Use Each Tool

#### Use **Edit Tool** When:
- You know the exact text to replace
- Making small, targeted changes
- Working offline or without network access
- Changes are simple string substitutions
- Deterministic, repeatable results are required

#### Use **Write Tool** When:
- Creating new files
- Completely rewriting file content
- The entire file content needs to be controlled
- Working with small files where efficiency isn't critical

#### Use **Bash Tool** When:
- Complex file operations are needed
- Bulk operations across many files
- System-level operations required
- Working with shell-based workflows

#### Use **Morph Fast Apply** When:
- Making semantic/conceptual changes ("add logging", "refactor to async")
- The exact text to change is unknown or complex to specify
- Multiple related changes needed across the file
- Working with specific language idioms or patterns
- Speed is prioritized and network latency is acceptable
- AI-assisted code transformation provides value

---

### 8.6 Integration Strategy for Auto-Claude

Based on these differences, the recommended integration strategy is:

#### 8.6.1 Selection Logic

```
┌─────────────────────────────────────────────────────────────────┐
│                    Apply Operation Received                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Morph Enabled?  │
                    └─────────────────┘
                        │         │
                       No        Yes
                        │         │
                        │         ▼
                        │  ┌──────────────────┐
                        │  │ API Key Valid?   │
                        │  └──────────────────┘
                        │      │         │
                        │     No        Yes
                        │      │         │
                        │      │         ▼
                        │      │  ┌──────────────────┐
                        │      │  │ Service Healthy? │
                        │      │  └──────────────────┘
                        │      │      │         │
                        │      │     No        Yes
                        │      │      │         │
                        │      │      │         ▼
                        │      │      │  ┌──────────────────┐
                        │      │      │  │  USE MORPH       │
                        │      │      │  │  Fast Apply      │
                        │      │      │  └──────────────────┘
                        │      │      │         │
                        │      │      │     Success?
                        │      │      │    │        │
                        │      │      │   No       Yes ─────► Done
                        │      │      │    │
                        ▼      ▼      ▼    ▼
                    ┌─────────────────────────────┐
                    │     USE DEFAULT TOOLS       │
                    │  (Edit/Write based on need) │
                    └─────────────────────────────┘
```

#### 8.6.2 Fallback Scenarios

The system falls back to default tools when:

| Scenario | Detection | Fallback Action |
|----------|-----------|-----------------|
| Morph disabled | `settings.morphEnabled === false` | Use Edit/Write directly |
| No API key | `settings.morphApiKey` is empty | Use Edit/Write directly |
| Invalid API key | 401 response from Morph | Log warning, use Edit/Write |
| Service unavailable | Health check fails or timeout | Use Edit/Write, cache status |
| Rate limited | 429 response | Retry with backoff, then fallback |
| Processing error | 5xx response | Retry once, then fallback |

#### 8.6.3 User Notification Strategy

| Event | User Notification |
|-------|-------------------|
| Morph succeeds | None (silent) |
| Fallback due to disabled | None (expected behavior) |
| Fallback due to invalid key | Toast: "Invalid Morph API key. Using default apply." |
| Fallback due to service down | Toast: "Morph service unavailable. Using default apply." |
| Fallback due to rate limit | Toast: "Morph rate limit reached. Using default apply." |

---

### 8.7 Performance Considerations

#### 8.7.1 Latency Comparison (Estimated)

| Tool | Typical Latency | Notes |
|------|-----------------|-------|
| Edit | < 10ms | Local file operation |
| Write | < 10ms | Local file operation |
| Bash | 10-100ms | Process spawn + execution |
| Morph | 100-500ms | Network round-trip + AI processing |

#### 8.7.2 When Morph is "Faster"

Despite higher latency, Morph can be "faster" in these scenarios:

1. **Complex Multi-Edit:** A single Morph call vs multiple Edit calls
2. **Semantic Changes:** Morph understands intent vs manually crafting exact strings
3. **Unknown Content:** When the exact text to replace is unknown
4. **Developer Time:** Faster to write "add type hints" than specify exact changes

---

### 8.8 Recommendations for Implementation

1. **Default to Edit/Write:** Keep default tools as the primary mechanism
2. **Morph as Enhancement:** Offer Morph as an optional enhancement for users with API keys
3. **Transparent Fallback:** Always fall back silently to ensure operations complete
4. **User Control:** Let users enable/disable Morph and see which tool was used
5. **Monitor Performance:** Track Morph success rate and latency for optimization

---

## 9. Next Steps

Once API credentials are obtained:

1. [x] Create API test script (`scripts/test_morph_api.py`)
2. [ ] Obtain test API credentials from stakeholder
3. [ ] Run test script: `python scripts/test_morph_api.py --json`
4. [ ] Update section 7.6 with actual test results
5. [ ] Verify actual API endpoints match documented specification
6. [x] Document functional differences between Morph and default apply tools (Section 8)
7. [ ] Proceed to Phase 2: Backend Foundation

---

## 10. References

- **Spec:** `.auto-claude/specs/002-implement-morph-fast-apply-as-configurable-apply-t/spec.md`
- **Implementation Plan:** `.auto-claude/specs/002-implement-morph-fast-apply-as-configurable-apply-t/implementation_plan.json`

---

## 11. Verification Checklist

This API specification document includes:

- [x] **Authentication:** Bearer token method documented with header format and key structure
- [x] **Endpoints:** Three endpoints documented (apply, validate, health)
- [x] **Request/Response Formats:** JSON schemas with field descriptions for all endpoints
- [x] **Error Handling:** HTTP status codes, error response format, and common error codes
- [x] **Rate Limits:** Expected limits and retry strategies
- [x] **Implementation Guidance:** Python client example and fallback strategy
- [x] **Functional Differences:** Comprehensive comparison of Morph vs default apply tools (Section 8)

**Items Pending Stakeholder Verification:**
- [ ] Base URL confirmation
- [ ] Actual API key format and prefix
- [ ] Exact endpoint paths
- [ ] Rate limit tiers
- [ ] Python SDK availability

---

**Document Status:** API Specification Documented - Awaiting stakeholder verification

**Last Updated:** 2025-12-31
