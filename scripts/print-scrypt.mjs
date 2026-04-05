/**
 * In ra password_hash đúng định dạng app (scrypt$...) để paste vào Supabase cột users.password_hash.
 *
 * PowerShell: nháy kép làm hỏng mật khẩu có @ hoặc ký tự đặc biệt — dùng:
 *   node scripts/print-scrypt.mjs 'Wtuananh@123'
 */
import { randomBytes, scryptSync } from "node:crypto";

const SCRYPT_KEYLEN = 64;
const plain = process.argv[2];
if (!plain || plain.length < 6) {
  console.error("Usage: node scripts/print-scrypt.mjs \"YourPasswordAtLeast6Chars\"");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const derived = scryptSync(plain, salt, SCRYPT_KEYLEN).toString("hex");
console.log(`scrypt$${salt}$${derived}`);
