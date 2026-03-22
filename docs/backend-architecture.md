# Backend Architecture

This project uses a backend-first fullstack setup:

- Frontend: Vite + React
- Primary data/auth: Supabase
- AI generation: Gemini API
- Operational backend: Node + Express
- Deployment target: Render web service

## Ownership

Supabase owns:

- authentication
- user profiles
- drivers
- email logs
- driver replies
- AI assistant threads and messages
- realtime subscriptions

Node backend owns:

- admin-only user provisioning through the Supabase service role
- email broadcast delivery
- attachment upload handling and temporary file cleanup
- service health/status reporting
- future long-running messaging or integration jobs

Gemini owns:

- response generation for the AI assistant
- no persistence layer by itself

## Final API Surface

The canonical backend routes are:

- `GET /api/status`
- `POST /api/email/test-connection`
- `POST /api/email/test-send`
- `POST /api/admin/create-user`
- `POST /api/broadcast`

Legacy compatibility may remain temporarily during migration, but new frontend code should target only the routes above.

## Request Contracts

### `GET /api/status`

Response:

```json
{
  "status": "online",
  "emailConfigured": true,
  "uploadsEnabled": true,
  "uptimeSeconds": 123
}
```

### `POST /api/email/test-connection`

Response:

```json
{
  "success": true,
  "emailMode": "smtp",
  "smtpHost": "smtp.gmail.com",
  "smtpPort": 587,
  "smtpFrom": "Leader A1 Fleet Monitor <your-email@gmail.com>",
  "message": "SMTP connection verified successfully."
}
```

### `POST /api/email/test-send`

Request body:

```json
{
  "to": "you@example.com"
}
```

Response:

```json
{
  "success": true,
  "message": "Test email sent to you@example.com."
}
```

### `POST /api/admin/create-user`

Request body:

```json
{
  "username": "John Doe",
  "password": "temporary-password",
  "admin_id": "supabase-user-uuid",
  "admin_email": "admin@example.com",
  "assigned_boards": ["Board A"],
  "assigned_companies": ["Acme"]
}
```

Response:

```json
{
  "success": true,
  "user": {},
  "loginEmail": "johndoe@dilshod.algo"
}
```

### `POST /api/broadcast`

Multipart form fields:

- `recipients`: JSON array of email addresses
- `subject`: string
- `message`: HTML or text body
- `attachments`: file array

Response:

```json
{
  "success": true,
  "message": "Broadcast sent successfully!"
}
```

## Environment Model

Frontend requires:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GEMINI_API_KEY`
- optional: `VITE_GOOGLE_CLIENT_ID`
- optional: `VITE_API_URL`

Backend requires:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- optional: `PSEUDO_EMAIL_DOMAIN` (default: `dilshod.algo`)
- `PORT`

## Notes

- If `VITE_API_URL` is omitted, frontend should prefer same-origin `/api/*`.
- If SMTP is missing, backend should degrade into simulation mode rather than crash.
- AI persistence must use Supabase tables `ai_threads` and `ai_messages`.
