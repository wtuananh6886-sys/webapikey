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
  "featureFlags": {
    "allowAimAssist": true,
    "allowSkinBypass": true
  }
}
```

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

File zip nay chua:

- Huong dan tich hop nhanh
- Mau `imgui-license-gate-example.cpp`
