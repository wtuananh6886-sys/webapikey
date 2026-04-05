export type DashboardPagePathKey =
  | "dashboard"
  | "licenses"
  | "servers"
  | "tweaks"
  | "users"
  | "admins"
  | "logs"
  | "settings"
  | "default";

/** Khóa i18n `page.<key>.*` theo pathname. */
export function dashboardPagePathKey(pathname: string): DashboardPagePathKey {
  const p = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  const map: Record<string, DashboardPagePathKey> = {
    "/dashboard": "dashboard",
    "/dashboard/licenses": "licenses",
    "/dashboard/servers": "servers",
    "/dashboard/tweaks": "tweaks",
    "/dashboard/users": "users",
    "/dashboard/admins": "admins",
    "/dashboard/logs": "logs",
    "/dashboard/settings": "settings",
  };
  return map[p] ?? "default";
}

/** Tiêu đề tĩnh (fallback khi chưa có I18n). */
export function dashboardPageTitle(pathname: string): { eyebrow: string; title: string } {
  const key = dashboardPagePathKey(pathname);
  const map: Record<DashboardPagePathKey, { eyebrow: string; title: string }> = {
    dashboard: { eyebrow: "Tổng quan", title: "Control center" },
    licenses: { eyebrow: "Bảo mật", title: "License & API key" },
    servers: { eyebrow: "Hạ tầng", title: "Máy chủ" },
    tweaks: { eyebrow: "Nội dung", title: "Tweaks & gói" },
    users: { eyebrow: "Tài khoản", title: "Người dùng đăng ký" },
    admins: { eyebrow: "Chính sách", title: "Policies & admin" },
    logs: { eyebrow: "Audit", title: "Nhật ký hoạt động" },
    settings: { eyebrow: "Hệ thống", title: "Cài đặt" },
    default: { eyebrow: "Dashboard", title: "Nexora-API" },
  };
  return map[key];
}
