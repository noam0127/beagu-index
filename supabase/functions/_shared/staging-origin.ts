/**
 * Optional independently hosted staging origin for browser CORS.
 *
 * This is intentionally inert in production and on staging until an EXACT
 * verified Render origin is explicitly configured in stage project secrets:
 * BEAGU_STAGING_ALLOWED_ORIGIN=https://<assigned-host>.onrender.com
 *
 * Never use wildcard onrender origins or infer a host from a service name.
 * CORS is transport protection; existing JWT, owner allowlist and MFA checks
 * remain server-authoritative.
 */
export const STAGING_PROJECT_URL = "https://ycwuugggqbunlbwuzvbx.supabase.co";

export function exactStagingOriginAllowed(
  origin: string,
  supabaseUrl: string,
  configuredOrigin: string,
): boolean {
  if (supabaseUrl !== STAGING_PROJECT_URL || !configuredOrigin ||
      origin !== configuredOrigin) return false;
  // A 1–63-character DNS label; explicit subdomains only, no wildcard,
  // ports, URL paths, query parameters, credentials, or localhost.
  return /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.onrender\.com$/.test(
    configuredOrigin,
  );
}

/** Only existing, explicitly local developer origins survive on staging. */
export function originAllowedForProject(
  origin: string,
  existing: ReadonlySet<string>,
  supabaseUrl: string,
  configuredOrigin: string,
): boolean {
  if (supabaseUrl === STAGING_PROJECT_URL) {
    const localOrigin = /^http:\/\/(?:localhost|127\.0\.0\.1):(?:8000|8788|38738)$/.test(origin);
    return (localOrigin && existing.has(origin)) ||
      exactStagingOriginAllowed(origin, supabaseUrl, configuredOrigin);
  }
  // Production's existing allowlist remains unchanged, and an accidental
  // BEAGU_STAGING_ALLOWED_ORIGIN setting must NEVER widen production CORS.
  return existing.has(origin);
}

export function isBrowserOriginAllowed(
  origin: string,
  existing: ReadonlySet<string>,
): boolean {
  return originAllowedForProject(
    origin,
    existing,
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("BEAGU_STAGING_ALLOWED_ORIGIN") || "",
  );
}
