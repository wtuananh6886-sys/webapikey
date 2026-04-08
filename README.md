# Nexora-API — Admin / License console

Premium dark admin dashboard for:

- License keys and activation
- Server monitoring
- Tweaks/packages management
- Admin users and roles
- Activity logs
- System settings

Includes license verification API that can be linked to ImGui/Theos clients.

## Stack

- Next.js (App Router), TypeScript
- TailwindCSS
- React Hook Form + Zod
- TanStack Table
- Recharts
- Supabase-ready structure (mock mode included)

## Run local

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Core routes

- `/login`
- `/dashboard` — Overview
- `/dashboard/licenses` — Keys (owner / admin / support)
- `/dashboard/servers`, `/dashboard/tweaks` — support+ and above
- `/dashboard/users` — registered accounts (owner / admin)
- `/dashboard/admins` — Policies (owner / admin)
- `/dashboard/logs` — all signed-in roles (viewer = logs + overview only)
- `/dashboard/settings` — owner / admin

Route access is enforced in **proxy** (`proxy.ts`, Next.js 16) by role; API `/api/licenses` requires a session and scopes rows by `owner_email` for non-admin users.

## License verification API for ImGui

`POST /api/licenses/verify`

Branding man hinh nhap key (title/subtitle theo package): `POST /api/licenses/activation-ui` + cau hinh tren `Dashboard -> Licenses`. Client zip: **`/api.zip`** = `public/api.zip` tao boi `prebuild` / `npm run zip:api` tu `integration-client` + `docs`.

Payload:

```json
{
  "licenseKey": "AOVP-XXXX-XXXX-XXXX",
  "deviceId": "ios-device-hash",
  "packageId": "vn.aovpro.aimassist",
  "appVersion": "2.3.0"
}
```

See:

- `docs/imgui-integration.md`
- `docs/imgui-license-gate-example.cpp`

## Supabase setup

1. Create (or reuse) Supabase project.
2. Run SQL in `supabase/schema.sql` and `supabase/migrations/002_license_key_hash_and_audit_logs.sql`.
3. Fill `.env.local` from Supabase project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Add owner policy row in `account_policies` after schema import (replace your email):
   ```sql
   insert into account_policies (
     email, role, assigned_plan, monthly_package_token_limit, monthly_key_limit,
     package_tokens_used_this_month, keys_used_this_month, usage_month, updated_at
   ) values (
     'your-email@example.com', 'owner', 'premium', 99999, 999999, 0, 0, to_char(now(), 'YYYY-MM'), now()
   )
   on conflict (email) do update set
     role = excluded.role,
     assigned_plan = excluded.assigned_plan,
     monthly_package_token_limit = excluded.monthly_package_token_limit,
     monthly_key_limit = excluded.monthly_key_limit,
     updated_at = now();
   ```
5. Restart app.

## Deploy to Vercel

1. Push repo to GitHub.
2. Import project in Vercel.
3. Add environment variables from `.env.example` in all environments (`Production`, `Preview`, `Development`).
4. Redeploy after updating env vars.

### Current MCP bootstrap (created automatically)

- Project name: `nexora-api-prod`
- Project ref: `cvjvreasqbnhcnwstwyq`
- Region: `ap-southeast-1`
- URL: `https://cvjvreasqbnhcnwstwyq.supabase.co`

Note: `SUPABASE_SERVICE_ROLE_KEY` is intentionally not stored in this repository; copy it from Supabase Dashboard -> Project Settings -> API -> service_role.

## Integrate with your Theos workspace

You mentioned this path:

`\\wsl.localhost\Ubuntu-20.04\home\tuananh\aovpro`

Recommended:

- Keep this web project running on domain/subdomain (e.g. `admin.aovpro.com`).
- In your Theos ImGui client inside that WSL project, call `POST https://admin.aovpro.com/api/licenses/verify`.
- Block feature UI until `ok: true`.
