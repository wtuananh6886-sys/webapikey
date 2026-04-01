export type LicenseStatus = "active" | "inactive" | "expired" | "banned" | "revoked";
export type ServerStatus = "online" | "offline" | "warning" | "maintenance";
export type TweakStatus = "draft" | "active" | "archived" | "disabled";
export type AdminStatus = "active" | "suspended" | "invited";
export type Severity = "info" | "warning" | "error" | "critical";
export type Role = "owner" | "admin" | "support" | "viewer";
export type LicensePlan = "basic" | "pro" | "premium";
export type LicenseKeyMode = "dynamic" | "static";
export type PackageStatus = "active" | "archived";

export interface License {
  id: string;
  name: string;
  packageName: string;
  key: string;
  plan: LicensePlan;
  keyMode: LicenseKeyMode;
  status: LicenseStatus;
  assignedUser: string | null;
  deviceId: string | null;
  maxDevices: number;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  /** Set on create server-side; omitted from API JSON when possible. Used for tenancy in mock mode. */
  ownerEmail?: string;
}

export interface ServerNode {
  id: string;
  name: string;
  ip: string;
  region: string;
  status: ServerStatus;
  ping: number;
  lastHeartbeat: string;
  version: string;
}

export interface TweakPackage {
  id: string;
  name: string;
  packageId: string;
  currentVersion: string;
  status: TweakStatus;
  releaseChannel: "stable" | "beta" | "canary";
  requiredPlan: LicensePlan;
  updatedAt: string;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: Role;
  status: AdminStatus;
  lastLogin: string | null;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  actor: string;
  action: string;
  targetType: "license" | "server" | "tweak" | "admin" | "auth" | "settings";
  targetName: string;
  ip: string;
  severity: Severity;
  timestamp: string;
}

export interface LicenseUsageLog {
  id: string;
  licenseId: string;
  action:
    | "verify_ok"
    | "verify_fail"
    | "ban"
    | "revoke"
    | "extend"
    | "delete"
    | "unban"
    | "unrevoke"
    | "activate"
    | "deactivate";
  ip: string;
  deviceId: string | null;
  reason?: string;
  createdAt: string;
}

export interface UserPackage {
  id: string;
  name: string;
  token: string;
  ownerEmail: string;
  status: PackageStatus;
  createdAt: string;
  updatedAt: string;
  /** Set when status is archived (soft delete — row kept for audit). */
  archivedAt?: string | null;
  /** Shown on client enter-key screen (optional). */
  activationUiTitle?: string | null;
  activationUiSubtitle?: string | null;
}

export interface AccountPolicy {
  email: string;
  role: Role;
  assignedPlan: LicensePlan;
  monthlyPackageTokenLimit: number;
  monthlyKeyLimit: number;
  packageTokensUsedThisMonth: number;
  keysUsedThisMonth: number;
  expiresAt: string | null;
  updatedAt: string;
}
