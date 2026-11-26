import assert from "node:assert/strict";
import { validPassword, passwordLookup, createCredential, verifyCredential } from "../supabase/functions/_shared/level3-credential-v1.mjs";
const secret = "ab".repeat(32); // Synthetic test key, not a live credential.
const other = "cd".repeat(32);
for (const bad of ["Abc123456", "abcdefghij", "1234567890", "Abc123456!", "Abc12345 6", "한글12345678", "Aa1".repeat(43), null]) {
  assert.equal(validPassword(bad), false);
}
for (const good of ["Abc1234567", "a1234567890123456", "A" + "1".repeat(127)]) assert.equal(validPassword(good), true);
const pw = "TestOnly2026";
await assert.rejects(createCredential(pw, pw + "x", secret), /PASSWORD_MISMATCH/);
await assert.rejects(createCredential(pw, pw, "bad"), /ACCOUNT_KEY_UNAVAILABLE/);
const a = await createCredential(pw, pw, secret);
const b = await createCredential(pw, pw, secret);
assert.deepEqual(Object.keys(a).sort(), ["lookup", "salt", "verifier", "version"]);
assert.equal(a.lookup, b.lookup);
assert.notEqual(a.salt, b.salt);
assert.notEqual(a.verifier, b.verifier);
assert.notEqual(a.lookup, await passwordLookup(pw, other));
assert.notEqual(a.lookup, await passwordLookup(pw.toLowerCase(), secret));
assert.equal(await verifyCredential(pw, secret, a), true);
assert.equal(await verifyCredential(pw.toLowerCase(), secret, a), false);
assert.equal(await verifyCredential(pw, other, a), false);
assert.equal(await verifyCredential(pw, secret, {...a, version: 2}), false);
assert.equal(await verifyCredential(pw, secret, {...a, salt: "broken"}), false);
assert.equal(await verifyCredential(pw, secret, {...a, verifier: "broken"}), false);
assert.equal(JSON.stringify(a).includes(pw), false);
console.log("Lv.3 credential tests passed");
