// Server-only credential primitives. Username lookup is domain-separated from legacy password lookup.
const encoder = new TextEncoder();
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;
export const PASSWORD_ITERATIONS = 600000;
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
const fromHex = value => Uint8Array.from(value.match(/../g), pair => parseInt(pair, 16));

export function validPassword(password) {
  return typeof password === "string" &&
    password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH &&
    /^[A-Za-z0-9]+$/.test(password) && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}
function requirePassword(password) {
  if (!validPassword(password)) throw new Error("INVALID_PASSWORD");
}
async function hmac(secret, purpose, password) {
  // Each purpose has an independently domain-separated MAC. The key is a
  // 32-byte random server secret, never a public token or a stored password.
  if (typeof secret !== "string" || !/^[0-9a-f]{64}$/i.test(secret)) throw new Error("ACCOUNT_KEY_UNAVAILABLE");
  const key = await crypto.subtle.importKey("raw", fromHex(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key,
    encoder.encode("beagu-lv3-v1:" + purpose + ":" + password)));
}
export async function passwordLookup(password, secret) {
  requirePassword(password);
  return hex(await hmac(secret, "lookup", password));
}
async function deriveVerifier(password, secret, salt) {
  requirePassword(password);
  if (typeof salt !== "string" || !/^[0-9a-f]{64}$/.test(salt)) throw new Error("INVALID_SALT");
  const input = await hmac(secret, "verifier", password);
  const key = await crypto.subtle.importKey("raw", input, "PBKDF2", false, ["deriveBits"]);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({
    name: "PBKDF2", hash: "SHA-256", salt: fromHex(salt), iterations: PASSWORD_ITERATIONS
  }, key, 256)));
}
export async function createCredential(password, confirmation, secret) {
  requirePassword(password);
  if (password !== confirmation) throw new Error("PASSWORD_MISMATCH");
  const salt = hex(crypto.getRandomValues(new Uint8Array(32)));
  const lookup = await passwordLookup(password, secret);
  const verifier = await deriveVerifier(password, secret, salt);
  return { version: 1, lookup, salt, verifier };
}
export async function verifyCredential(password, secret, record) {
  if (!validPassword(password) || !record || record.version !== 1 ||
      typeof record.verifier !== "string" || !/^[0-9a-f]{64}$/.test(record.verifier) ||
      typeof record.salt !== "string" || !/^[0-9a-f]{64}$/.test(record.salt)) return false;
  const actual = fromHex(await deriveVerifier(password, secret, record.salt));
  const expected = fromHex(record.verifier);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

export function normalizeUsername(username) {
  if (typeof username !== "string" || !/^[A-Za-z0-9_]{4,20}$/.test(username)) return null;
  return username.toLowerCase();
}
export async function usernameLookup(username, secret) {
  const normalized = normalizeUsername(username);
  if (!normalized) throw new Error("INVALID_USERNAME");
  return hex(await hmac(secret, "username-lookup", normalized));
}
export async function createUsernameCredential(username, password, confirmation, secret) {
  requirePassword(password);
  if (password !== confirmation) throw new Error("PASSWORD_MISMATCH");
  const lookup = await usernameLookup(username, secret);
  const salt = hex(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = await deriveVerifier(password, secret, salt);
  return {version: 1, lookup, salt, verifier};
}
