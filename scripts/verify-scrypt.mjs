/**
 * Kiểm tra mật khẩu có khớp hash scrypt$ trong DB không.
 *
 * macOS / Linux / CMD (Windows):
 *   node scripts/verify-scrypt.mjs "MatKhau" "scrypt$salt$hex"
 *
 * PowerShell — ký tự $ trong nháy kép bị hiểu là biến → hash bị hỏng. Dùng MỘT trong hai cách:
 *
 *   $env:VERIFY_SCRYPT_HASH='scrypt$355748dfb5d00e50...'   ← bắt buộc nháy đơn trên PowerShell
 *   node scripts/verify-scrypt.mjs 'MatKhau'
 *
 * Hoặc nháy đơn (PowerShell):
 *   node scripts/verify-scrypt.mjs 'Wtuananh@123' 'scrypt$355748dfb5d00e50fd6f66f06d17cd61$6bcab6e15bbc5dceb85693a1db2f490ae845a2f7858cf5437fd9f56e24dbff7f0cedcd1b18535d88cc116ff0fcd595bb076a74554a91412425563cc2b8059f0e'
 */
import { scryptSync, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

const SCRYPT_KEYLEN = 64;

function verifyPassword(plain, encoded) {
  const trimmed = String(encoded).trim();
  const parts = trimmed.split("$");
  if (parts.length < 3 || parts[0] !== "scrypt") return false;
  const salt = parts[1];
  const expectedHex = parts.slice(2).join("$");
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(plain, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

const pass = process.argv[2];
let hash = process.env.VERIFY_SCRYPT_HASH?.trim();

if (!hash && process.argv[3]?.startsWith("@")) {
  const p = process.argv[3].slice(1);
  hash = readFileSync(p, "utf8").trim();
}

if (!hash) {
  hash = process.argv[3];
}

if (!pass || !hash) {
  console.error("Thiếu hash — script cần CẢ mật khẩu VÀ chuỗi scrypt$... (copy từ Supabase cột password_hash).\n");
  if (pass && !hash) {
    console.error("Bạn chỉ gõ mật khẩu, chưa có hash. Thêm một trong hai:\n");
  }
  console.error("  [CMD / Command Prompt — $ không bị xử lý đặc biệt trong nháy kép]");
  console.error('  node scripts/verify-scrypt.mjs "Wtuananh@123" "scrypt$DÁN_NGUYÊN_HASH_TỪ_SUPABASE"');
  console.error("");
  console.error("  [PowerShell — nháy đơn cho hash, hoặc dùng biến môi trường]");
  console.error("  node scripts/verify-scrypt.mjs 'Wtuananh@123' 'scrypt$DÁN_NGUYÊN_HASH'");
  console.error("  hoặc:");
  console.error("  $env:VERIFY_SCRYPT_HASH='scrypt$DÁN_NGUYÊN_HASH'");
  console.error("  node scripts/verify-scrypt.mjs 'Wtuananh@123'");
  console.error("");
  console.error("  [Hash nằm trong file hash.txt — một dòng duy nhất]");
  console.error("  node scripts/verify-scrypt.mjs \"Wtuananh@123\" @hash.txt");
  process.exit(1);
}

if (!hash.startsWith("scrypt$")) {
  console.error(
    "Hash nhận được không bắt đầu bằng scrypt$ — thường do PowerShell đã cắt chuỗi tại ký tự $. Dùng VERIFY_SCRYPT_HASH hoặc nháy đơn."
  );
  console.error("Độ dài hash nhận được:", hash.length, "| 20 ký tự đầu:", JSON.stringify(hash.slice(0, 22)));
  process.exit(1);
}

const ok = verifyPassword(pass, hash);
console.log(ok ? "OK — mật khẩu khớp hash." : "FAIL — mật khẩu không khớp hash (sai mật khẩu hoặc hash trong DB khác chuỗi đã tạo lúc hash-password).");
if (!ok) {
  console.log("Gợi ý: npm run hash-password -- \"MatKhauMoi\" rồi paste hash mới vào Supabase users.password_hash.");
}
process.exit(ok ? 0 : 1);
