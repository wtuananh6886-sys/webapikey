/** Tiêu đề hiển thị trên top bar theo pathname. */
export function dashboardPageTitle(pathname: string): { eyebrow: string; title: string } {
  const p = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  const map: Record<string, { eyebrow: string; title: string }> = {
    "/dashboard": { eyebrow: "Tổng quan", title: "Control center" },
    "/dashboard/licenses": { eyebrow: "Bảo mật", title: "License & API key" },
    "/dashboard/servers": { eyebrow: "Hạ tầng", title: "Máy chủ" },
    "/dashboard/tweaks": { eyebrow: "Nội dung", title: "Tweaks & gói" },
    "/dashboard/users": { eyebrow: "Tài khoản", title: "Người dùng đăng ký" },
    "/dashboard/admins": { eyebrow: "Chính sách", title: "Policies & admin" },
    "/dashboard/logs": { eyebrow: "Audit", title: "Nhật ký hoạt động" },
    "/dashboard/settings": { eyebrow: "Hệ thống", title: "Cài đặt" },
  };
  return map[p] ?? { eyebrow: "Dashboard", title: "Nexora-API" };
}
