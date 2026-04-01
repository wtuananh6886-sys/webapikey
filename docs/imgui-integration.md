# ImGui/Theos License Gate Integration

Muc tieu: bat buoc nguoi dung nhap key truoc khi vao app. Key hop le thi moi cho phep mo cac tab tinh nang.

## 1) API xac thuc key phia web

Project nay da co endpoint:

- `POST /api/licenses/verify`

Payload:

```json
{
  "licenseKey": "AOVP-XXXX-XXXX-XXXX",
  "deviceId": "ios-iphone15pro",
  "packageId": "vn.aovpro.aimassist",
  "appVersion": "2.3.0"
}
```

Response thanh cong:

```json
{
  "ok": true,
  "plan": "pro",
  "expiresAt": "2026-12-31T23:59:59Z",
  "packageName": "ten-package",
  "uiTitle": "Tieu de man hinh nhap key (tuy chon)",
  "uiSubtitle": "Dong phu tuy chon hoac null",
  "featureFlags": {
    "allowAimAssist": true,
    "allowSkinBypass": true
  }
}
```

- `uiTitle` / `uiSubtitle`: lay tu cau hinh package tren Dashboard (Licenses → tiêu đề màn hình nhập key). Client UIKit (`AOVLicenseGateManager`) dung de cache hien thi.

## 1b) API lay branding truoc khi verify (tuy chon)

- `POST /api/licenses/activation-ui`

Payload:

```json
{
  "packageToken": "PKG_XXXXXXXXXXXXXXXX"
}
```

Response thanh cong:

```json
{
  "ok": true,
  "uiTitle": "Shop Key VIP",
  "uiSubtitle": "Lien he admin sau khi mua"
}
```

Token lay tu Dashboard (Copy package token). Rate limit: 60 req/phut/IP+token (xem server).

Response that bai:

```json
{
  "ok": false,
  "reason": "key_not_found"
}
```

## 2) Luong trong ImGui

1. Khi app boot, `isLicenseVerified = false`.
2. Render cua so "Enter License Key" (InputText + Button Verify).
3. Khi bam Verify, gui HTTP POST den endpoint tren.
4. Neu API `ok = true`: set `isLicenseVerified = true` va mo full menu.
5. Neu `ok = false`: hien thong bao loi va giu nguoi dung o gate screen.

Host can chinh duy nhat o client:

`https://admin.aovpro.com` (hoac domain ban deploy dashboard).

## 3) Device ID recommendation

- iOS/Jailbreak: tao 1 ID on dinh theo vendor id + machine info + hash.
- Luu local key an toan (Keychain hoac encrypted storage).
- Moi request verify gui kem `deviceId`.

## 4) Security note

- Khong hardcode secret key trong tweak.
- Khuyen nghi ky request (HMAC) o v2.
- Them rate limit + signature check o API edge.

## 5) Tai api.zip trong dashboard

Vao `Dashboard -> Licenses`, se co khu `ImGui API Client` voi nut `Tai api.zip`.

URL: `GET /api.zip` — file tinh `public/api.zip` sinh ra luc **`npm run build`** / **`npm run dev`** (hook `prebuild`), **khong** doc file tu serverless (tranh Vercel thieu thu muc `integration-client`).

File zip gom:

- `README_NOTE.md` — huong dan copy file Theos / UIKit
- `aovpro-files/*` — `AOVLicenseGateManager.mm` (UI nhap key + verify + branding), `.h`, session, Makefile mau, v.v.
- `docs/imgui-integration.md`, `docs/imgui-license-gate-example.cpp` — tai lieu + mau ImGui
