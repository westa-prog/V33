# Deployment Runbook

This runbook covers local verification, Supabase setup, and Render deployment for the current backend-first architecture.

## 1) Prerequisites

- Node.js `20.x`
- A Supabase project
- A Render account
- SMTP provider credentials

## 2) Supabase Setup

Run migrations in order:

1. `supabase/migrations/0001_app_core.sql`
2. `supabase/migrations/0002_ai_assistant.sql`
3. `supabase/migrations/0003_tenant_rls_hardening.sql`
4. `supabase/migrations/0004_normalized_board_company_model.sql`

Verify tables exist:

- `profiles`
- `drivers`
- `email_logs`
- `driver_replies`
- `ai_threads`
- `ai_messages`

## 3) Local Verification

Install dependencies:

```bash
npm install
npm --prefix backend install
```

Frontend typecheck:

```bash
npx tsc -p tsconfig.json --noEmit
```

Backend build:

```bash
npm --prefix backend run build
```

Run local dev:

```bash
npm run dev
npm run dev:server
```

Quick API check:

```bash
curl http://localhost:5000/api/status
```

Troubleshooting:

- If frontend starts on `http://localhost:3000`, use that URL (not `5173`).
- If backend shows `EADDRINUSE: 5000`, another process is already using port 5000.
- To free port 5000 on Windows PowerShell:

```powershell
$pid = (Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)
if ($pid) { Stop-Process -Id $pid -Force }
```

## 4) Render Environment Variables

Set all of these in Render before first deploy:

- `NODE_VERSION=20`
- `PORT=10000`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GEMINI_API_KEY`
- `VITE_GOOGLE_CLIENT_ID` (optional, only for Gmail OAuth UI)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Important key note:

- `SUPABASE_SERVICE_ROLE_KEY` must be the project service role key (or secret server key) from Supabase Project Settings.
- Do not use a Supabase personal access token (`sbp_...`) for `SUPABASE_SERVICE_ROLE_KEY`; backend admin APIs will return `Invalid API key`.

## 5) Deploy

Render uses:

- `buildCommand: npm run render-build`
- `startCommand: npm run start`
- `healthCheckPath: /api/status`

After deploy, validate:

1. `GET /api/status` returns `status: online`.
2. Admin panel can create employee users.
3. Broadcast endpoint accepts recipients + attachments.
4. Frontend can read/write driver data via Supabase.

Quick deployed API check:

```bash
curl https://<your-render-service>.onrender.com/api/status
```

If `POST /api/broadcast` fails:

- Confirm Gmail uses an App Password (not your normal account password).
- Confirm SMTP host/port are correct (`smtp.gmail.com`, `587`).
- Check Render logs for SMTP auth or network errors.

## 5.1) Remote-Only Testing (No Localhost)

If you do not want to run local services, use this flow:

1. Push current branch to GitHub.
2. Deploy on Render using `render.yaml`.
3. Set all required Render env vars before first deploy.
4. Run Supabase migrations.
5. Test only deployed URLs:
   - `https://<your-render-service>.onrender.com/`
   - `https://<your-render-service>.onrender.com/api/status`

## 6) Smoke Tests

Recommended quick checks:

1. Login with Supabase auth.
2. Create one driver via Add Driver.
3. Send one broadcast to a test inbox.
4. Open AI Assistant and confirm message history persists after refresh.
5. Log out and log back in to confirm profile/filters remain correct.

## 8) Realtime Checklist

To get instant admin/user updates without refresh:

1. In Supabase Dashboard, open `Database -> Replication`.
2. Ensure realtime replication is enabled for:
   - `public.drivers`
   - (optional for future normalized model) `public.drivers_new`
3. Keep RLS policies enabled and valid; realtime respects RLS visibility.
4. Verify in-app behavior:
   - create/update/delete a driver in one session
   - confirm change appears in another session within seconds

Implementation note:

- Frontend uses hybrid realtime handling:
  - instant optimistic patch from realtime payload
  - then full `fetchDrivers()` reconciliation for consistency

## 7) Rollback Notes

- If deploy breaks at runtime, rollback to previous Render deploy.
- Do not change migration order; apply forward-only migrations.
- If SMTP fails, API still runs, but email operations will fail with explicit API errors.
