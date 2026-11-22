// Security critical: persist a moderation intent BEFORE calling the external
// Supabase Auth Admin API. Auth and Postgres audit inserts are not one DB
// transaction; a pre-action intent gives investigators durable evidence when
// the Auth call succeeds but the later completion record fails.
export async function applyModerationWithAudit(recordPhase, performAction) {
  if(typeof recordPhase!=="function"||typeof performAction!=="function")
    throw new TypeError("INVALID_AUDIT_WORKFLOW");
  await recordPhase("intent"); // fail closed: never change a user without evidence
  try {
    await performAction();
  } catch(error) {
    // Preserve the original Auth error if the secondary error-audit also fails.
    try { await recordPhase("error"); } catch {}
    throw error;
  }
  await recordPhase("success"); // if this fails, intent is still durable
}
