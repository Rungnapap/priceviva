// Usage: npm run admin:hash -- "your long admin password"
// Prints ADMIN_PASSWORD_HASH for .env.local (scrypt; the password itself is never stored).
import { randomBytes, scryptSync } from "node:crypto";
const pw = process.argv[2];
if (!pw || pw.length < 12) {
  console.error("Give a password of at least 12 characters: npm run admin:hash -- \"…\"");
  process.exit(1);
}
const N = 16384, r = 8, p = 1;
const salt = randomBytes(16);
const hash = scryptSync(pw, salt, 32, { N, r, p });
console.log(`ADMIN_PASSWORD_HASH=scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${hash.toString("base64url")}`);
console.log(`ADMIN_SESSION_SECRET=${randomBytes(32).toString("hex")}`);
