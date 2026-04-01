# UI Key Integration Note (Safe Package)

Package nay chi bao gom file UI key core + file trigger an toan, KHONG dong goi file menu chinh de tranh lo code.

## A) Core files

- `aovpro-files/AOVLicenseGateManager.h`
- `aovpro-files/AOVLicenseGateManager.mm`
- `aovpro-files/AOVLicenseTimeUtils.h`
- `aovpro-files/AOVLicenseTimeUtils.mm`
- `aovpro-files/Obfuscate.h`

## B) Integration files (safe)

- `aovpro-files/TweakEntry.mm`
- `aovpro-files/Makefile`

---

## 1) Copy file vao project

Copy theo dung duong dan:

- `AOVLicenseGateManager.h` -> `UI/AOVLicenseGateManager.h`
- `AOVLicenseGateManager.mm` -> `UI/AOVLicenseGateManager.mm`
- `AOVLicenseTimeUtils.h` -> `UI/AOVLicenseTimeUtils.h`
- `AOVLicenseTimeUtils.mm` -> `UI/AOVLicenseTimeUtils.mm`
- `Obfuscate.h` -> `Core/Obfuscate.h`

Neu ban muon patch nhanh theo mau hoan chinh, copy them:

- `TweakEntry.mm` -> `UI/TweakEntry.mm`
- `Makefile` -> `Makefile` (so sanh va merge)

Trong `aovpro-files/` co the co `ImGuiDrawView.mm` lam **mau tham khao** (tuy chon copy/merge vao project cua ban).

---

## 2) Code ngoai file core can co (quan trong)

### 2.1 Trigger gate som (trong TweakEntry)

```objc
dispatch_async(dispatch_get_main_queue(), ^{
    [[AOVLicenseGateManager shared] bootWithDelay:0.08];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.25 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
        [[AOVLicenseGateManager shared] presentNow];
    });
});
```

### 2.2 Chan menu khi chua verify (trong render loop/menu)

```objc
if (![[AOVLicenseGateManager shared] isVerified]) {
    return;
}
```

Noi chen:

- Mo file goc menu cua ban (thuong la `ImGuiDrawView.mm`).
- Tim ham render menu/frame, chen doan guard tren o dau ham, truoc khi ve tab/nut.

Neu thieu doan nay, key UI hien nhung menu van co the mo.

---

## 3) Config host verify API

Trong `AOVLicenseGateManager.mm`:

```objc
NSString *host = NSSENCRYPT("https://webapikey-sable.vercel.app");
```

Doi thanh host/domain cua ban.

---

## 4) Endpoint web bat buoc

- `POST /api/licenses/verify`

Request:

```json
{
  "licenseKey":"...",
  "deviceId":"...",
  "packageId":"tuananh",
  "packageToken":"PKG_XXXXXXXXXXXXXXXX",
  "appVersion":"2.3.0"
}
```

Luu y quan trong:

- He thong key moi dang bind theo package.
- `packageId` phai trung package da chon luc tao key tren web.
- `packageToken` phai dung token cua package do (copy tu dashboard -> Package panel).
- Voi format key moi `package-30day-XXXXXX`, file `AOVLicenseGateManager.mm` da tu suy ra `packageId` tu chinh key de tranh sai tay.
- Neu key legacy/custom khong suy ra duoc package, client se gui request khong kem `packageId` (khong hardcode package sai).

Response thanh cong:

```json
{
  "ok": true,
  "plan": "pro",
  "expiresAt": "2026-12-31T23:59:59Z",
  "packageName": "ten-package",
  "uiTitle": "Tieu de UI (Dashboard)",
  "uiSubtitle": "Dong phu hoac bo qua"
}
```

### 4a) Branding man hinh nhap key (Dashboard + client)

- Tren web: `Dashboard -> Licenses` → muc **Tiêu đề màn hình nhập key** → chon package → nhap title/subtitle → **Luu** (PATCH `/api/packages`).
- Client `AOVLicenseGateManager.mm` goi `POST /api/licenses/activation-ui` voi `packageToken` khi mo UI, va doc `uiTitle`/`uiSubtitle` tu response verify de cache `NSUserDefaults`.
- Nut **Thử API (như tweak)** tren cung trang Licenses de kiem tra JSON truoc khi build tweak.

### 4b) Session JWT (tuy chon — backend)

Neu tren Vercel/server dat `LICENSE_SESSION_SECRET` (xem `.env.example` trong repo web), verify se them `sessionToken` + `sessionExpiresInSec`.

- File `AOVLicenseGateManager.mm` (ban cap nhat) se:
  - Luu `sessionToken` vao UserDefaults
  - Moi **15 phut** + khi app **active lai** goi `POST /api/licenses/session` voi header `Authorization: Bearer <sessionToken>`
  - Neu **401/403** hoac license bi khoa → xoa session, tat `isVerified`, hien lai nhap key

Neu **chua** dat `LICENSE_SESSION_SECRET` tren server: response khong co `sessionToken` — client bo qua refresh (hanh vi cu nhu cu). Ma **503** tu `/api/licenses/session` cung duoc bo qua (khong tat license).

### 4c) File aovpro-files can cap nhat khi keo tu repo web

- **Bat buoc copy lai** khi co cap nhat UI key / keyboard / branding / session: `AOVLicenseGateManager.mm` (va merge `verifyAPIHost` neu ban da doi host).
- **Khong doi** (thuong): `AOVLicenseGateManager.h`, `AOVLicenseTimeUtils.*`, `Obfuscate.h`, `Makefile`, `TweakEntry.mm` (tru khi ban tu custom them).
- **ImGuiDrawView.mm** (trong project game cua ban): van can guard `isVerified` nhu cu — file trong zip chi la mau tham khao.

### 4d) Tai api.zip

- Tren Dashboard Licenses → **Tai api.zip** (`/api.zip`). File la **`public/api.zip`** duoc tao **moi lan** `npm run build` hoac `npm run dev` (script `scripts/build-api-zip.mjs`) tu `integration-client` + `docs` — Vercel cung chay `prebuild` truoc build nen zip tren server luon moi sau moi deploy.

---

## 5) Makefile note

Dam bao Makefile co include file UI `.mm`:

```make
$(TWEAK_NAME)_FILES = ImGuiDrawView.mm $(wildcard UI/*.mm) $(wildcard UI/*.m) ...
```

---

## 6) Debug checklist

- UI key khong hien: check trigger trong `TweakEntry` co chay main thread.
- Verify xong van mo gate: check guard `isVerified` tai cho render menu.
- Sai thoi gian key: check `expiresAt` web tra dung ISO datetime.
- Build loi: check `Obfuscate.h` da copy dung vao `Core/`.
