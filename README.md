# WebAPIKey Admin Dashboard

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
- `/dashboard`
- `/dashboard/licenses`
- `/dashboard/servers`
- `/dashboard/tweaks`
- `/dashboard/admins`
- `/dashboard/logs`
- `/dashboard/settings`

## License verification API for ImGui

`POST /api/licenses/verify`

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

1. Create Supabase project.
2. Run SQL in `supabase/schema.sql`.
3. Fill `.env.local` keys from Supabase project settings.
4. Replace mock auth and mock data with Supabase queries.

## Deploy to Vercel

1. Push repo to GitHub.
2. Import project in Vercel.
3. Add environment variables from `.env.example`.
4. Deploy.

## Integrate with your Theos workspace

You mentioned this path:

`\\wsl.localhost\Ubuntu-20.04\home\tuananh\aovpro`

Recommended:

- Keep this web project running on domain/subdomain (e.g. `admin.aovpro.com`).
- In your Theos ImGui client inside that WSL project, call `POST https://admin.aovpro.com/api/licenses/verify`.
- Block feature UI until `ok: true`.
