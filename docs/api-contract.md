# Production API Contract

This document freezes the backend contract currently used by the frontend for publish readiness.

## Authentication

- Protected endpoints require `Authorization: Bearer <supabase_access_token>`.
- Admin-only endpoints additionally require the authenticated profile role to be `admin` or the admin email override.

## Status

### `GET /api/status`

Returns safe operational readiness signals for the deployed app.

Response fields:

- `status`: `online` when the process is serving requests
- `releaseReady`: `true` only when critical server config and schema checks pass
- `checks`: readiness booleans for database, schema, email transport, uploads, and backend env
- `emailConfigured`, `emailMode`, `smtpConfigured`, `resendConfigured`
- `smtpHost`, `smtpPort`, `smtpFrom`
- `uploadsEnabled`, `uptimeSeconds`
- `warnings`: non-secret release warnings, such as fallback config usage

## Email

### `POST /api/broadcast`

- Auth required
- Accepts multipart form data with `recipients`, `subject`, `html`, and optional `attachments`
- Uses SMTP and/or Resend on the backend
- Returns explicit send errors instead of silent failure

### `POST /api/email/test-connection`

- Admin auth required
- Verifies SMTP connectivity and returns transport diagnostics

### `POST /api/email/test-send`

- Admin auth required
- Sends a test message to a single recipient

## Auth/Profile

### `POST /api/auth/ensure-profile`

- Ensures the authenticated user has a usable profile row and synced access metadata
- Used to keep Supabase auth metadata and app-level profile access aligned

## Company Management

### `POST /api/companies/create`

- Creates a company in the allowed board scope for the acting user
- Prevents invalid board assignment and reuses existing company records when appropriate

### Company update/delete endpoints

- Must enforce admin/employee scope consistently with current backend rules
- Delete is blocked when a company still has drivers assigned

## Driver Management

### `POST /api/drivers/create`

- Creates a driver with normalized board/company mapping
- Also writes an activity-style audit log entry

### `DELETE /api/drivers/:driverId`

- Admins can delete any driver
- Employees can only delete drivers they created

## Frontend Data Expectations

- Driver rows must hydrate with `companyId`, company name, and board label after create/update/realtime events
- Backend diagnostics used by dashboard/settings must remain non-secret
- Missing config should surface as warnings or failed readiness checks, not be silently masked in production
