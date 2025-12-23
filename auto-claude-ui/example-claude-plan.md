# User Authentication System

Implement a complete authentication system with JWT tokens and refresh tokens for the web application.

## Implementation Steps

### 1. Set up database schema
Create the following tables:
- users (id, email, password_hash, created_at, updated_at)
- refresh_tokens (id, user_id, token, expires_at, created_at)

Use TypeORM migrations for version control. Add indexes on email (unique) and token fields for performance.

### 2. Create authentication service
Implement the core authentication logic:
- Password hashing with bcrypt (10 rounds)
- JWT token generation (15min expiry for access, 7 days for refresh)
- Token validation middleware
- Refresh token rotation strategy

Include proper error handling for invalid credentials, expired tokens, and database errors.

### 3. Build API endpoints
Implement REST endpoints:
- POST /api/auth/register - User registration with email validation
- POST /api/auth/login - Login with email/password
- POST /api/auth/refresh - Refresh access token using refresh token
- POST /api/auth/logout - Invalidate refresh token

Add rate limiting (5 attempts per minute) and request validation using class-validator.

### 4. Add frontend components
Create React components for authentication:
- LoginForm with email/password fields
- RegisterForm with validation
- Protected route wrapper component
- Auth context provider for global state

Use React Hook Form for form handling and Zod for schema validation.

## Acceptance Criteria
- Users can register with email and password
- Users can login and receive JWT tokens
- Protected routes redirect unauthenticated users
- Tokens expire and refresh correctly
- All endpoints have proper error handling
- Passwords are never stored in plain text

## Dependencies
- Backend authentication must be complete before frontend integration
- Database migrations must run before service layer

## Implementation Notes
Store JWT secret in environment variables, never commit to version control.
Consider implementing 2FA in a future iteration.
