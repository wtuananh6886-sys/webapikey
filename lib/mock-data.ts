import type { AccountPolicy, ActivityLog, AdminUser, License, LicenseUsageLog, ServerNode, TweakPackage, UserPackage } from "@/types/domain";

export const licenses: License[] = [
  {
    id: "lic_01",
    name: "tuananh",
    packageName: "tuananh",
    key: "AOVP-9AF3-CX00-21HH",
    plan: "pro",
    keyMode: "static",
    status: "active",
    assignedUser: "player.one",
    deviceId: "ios-iphone15pro",
    maxDevices: 2,
    createdAt: "2026-03-01T08:00:00Z",
    expiresAt: "2026-12-31T23:59:59Z",
    lastUsedAt: "2026-03-31T09:12:00Z",
  },
  {
    id: "lic_02",
    name: "tester",
    packageName: "tester",
    key: "AOVP-TEST-TRIAL-0002",
    plan: "basic",
    keyMode: "dynamic",
    status: "expired",
    assignedUser: "tester.mock",
    deviceId: null,
    maxDevices: 1,
    createdAt: "2026-02-10T12:00:00Z",
    expiresAt: "2026-03-10T12:00:00Z",
    lastUsedAt: "2026-03-09T22:00:00Z",
  },
];

export const servers: ServerNode[] = [
  {
    id: "srv_01",
    name: "VN-HCM-Core",
    ip: "103.120.12.44",
    region: "ap-southeast-1",
    status: "online",
    ping: 26,
    lastHeartbeat: "2026-03-31T09:15:10Z",
    version: "1.8.2",
  },
  {
    id: "srv_02",
    name: "US-Backup",
    ip: "34.201.1.2",
    region: "us-east-1",
    status: "warning",
    ping: 120,
    lastHeartbeat: "2026-03-31T09:14:20Z",
    version: "1.8.1",
  },
];

export const tweaks: TweakPackage[] = [
  {
    id: "twk_01",
    name: "AOV Aim Assist",
    packageId: "vn.aovpro.aimassist",
    currentVersion: "2.3.0",
    status: "active",
    releaseChannel: "stable",
    requiredPlan: "pro",
    updatedAt: "2026-03-29T10:00:00Z",
  },
];

export const admins: AdminUser[] = [
  {
    id: "adm_01",
    username: "tuananh",
    email: "tuananh@aovpro.com",
    role: "owner",
    status: "active",
    lastLogin: "2026-03-31T09:00:00Z",
    createdAt: "2025-10-01T09:00:00Z",
  },
  {
    id: "adm_02",
    username: "support.vn",
    email: "support@aovpro.com",
    role: "support",
    status: "active",
    lastLogin: "2026-03-30T16:00:00Z",
    createdAt: "2025-12-01T09:00:00Z",
  },
];

export const adminCredentials: Array<{
  email: string;
  password: string;
  username: string;
  role: "owner" | "admin" | "support" | "viewer";
}> = [
  {
    email: "wtuananh6886@gmail.com",
    password: "Wtuananh@123",
    username: "wtuananh6886-sys",
    role: "owner",
  },
];

export const logs: ActivityLog[] = [
  {
    id: "log_01",
    actor: "tuananh",
    action: "created_license",
    targetType: "license",
    targetName: "AOVP-9AF3-CX00-21HH",
    ip: "14.177.2.9",
    severity: "info",
    timestamp: "2026-03-31T08:45:00Z",
  },
  {
    id: "log_02",
    actor: "system",
    action: "server_high_ping",
    targetType: "server",
    targetName: "US-Backup",
    ip: "127.0.0.1",
    severity: "warning",
    timestamp: "2026-03-31T08:50:00Z",
  },
];

export const licenseUsageLogs: LicenseUsageLog[] = [];

export const userPackages: UserPackage[] = [
  {
    id: "pkg_01",
    name: "tuananh",
    token: "PKG_TUANANH_7Q9K2M5X",
    ownerEmail: "owner@aovpro.com",
    status: "active",
    createdAt: "2026-03-01T08:00:00Z",
    updatedAt: "2026-03-31T08:00:00Z",
  },
  {
    id: "pkg_02",
    name: "team-alpha",
    token: "PKG_TEAMALPHA_4N8D1L2P",
    ownerEmail: "owner@aovpro.com",
    status: "active",
    createdAt: "2026-03-05T08:00:00Z",
    updatedAt: "2026-03-31T08:00:00Z",
  },
];

export const accountPolicies: AccountPolicy[] = [
  {
    email: "wtuananh6886@gmail.com",
    role: "owner",
    assignedPlan: "premium",
    monthlyPackageTokenLimit: 9999,
    monthlyKeyLimit: 99999,
    packageTokensUsedThisMonth: 0,
    keysUsedThisMonth: 0,
    expiresAt: null,
    updatedAt: new Date().toISOString(),
  },
];
