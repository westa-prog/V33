# Publish Readiness Checklist

Use this as the only release gate before publishing the app.

## 1. Environment and Platform

- Render service boots successfully
- `GET /api/status` returns `status: online`
- `GET /api/status` returns `releaseReady: true`
- Render frontend env is set:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_API_URL`
  - `VITE_GOOGLE_CLIENT_ID` if Gmail OAuth is required
- Render backend env is set:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `APP_URL`
  - SMTP and/or Resend credentials

## 2. Supabase

- All required migrations are applied
- Core tables exist and are queryable:
  - `profiles`
  - `companies`
  - `drivers_new`
  - `email_logs`
  - `driver_replies`
  - `employee_assignments`
- Realtime replication is enabled for app-subscribed tables
- RLS allows intended admin and employee visibility

## 3. Build and Runtime Verification

- Root `npx tsc -p tsconfig.json --noEmit`
- Root `npm run build:client`
- Backend `npm --prefix backend run build`
- Backend logs contain no missing-config warnings for publish-critical env

## 4. Core Smoke Tests

- Admin can sign in and stay signed in after refresh
- Employee can sign in and only sees assigned board/company scope
- Create company
- Edit company
- Delete empty company
- Create driver inside selected company
- Update driver duty status, connection, board, and follow-up
- Updated driver remains visible unless excluded by an intentional filter
- Realtime create/update/delete appears in a second session

## 5. Messaging

- Manual follow-up email send works
- Profile form 3-day and 5-day reminder confirmation flow works
- Broadcast send works without attachments
- Broadcast send works with attachments
- SMTP/Gmail/Resend failure states are visible and do not corrupt driver UI state

## 6. Release Notes

- Known non-blocking issues are documented separately
- No blocker remains in auth, company/driver CRUD, realtime, or email flows
