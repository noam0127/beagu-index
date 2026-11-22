import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/stage38-approved-vercel-preview.yml", "utf8");
const releaseSha = "5c95aadad971901a8222f83c52e93bf901a3aeb7";
const digest = "d757a24a1b2541bb52f8eaeb5b1af71706d8e7d1f4bcfee02512e9aa68ea7f70";

assert.match(workflow, /^on:\n  workflow_dispatch:/m);
const trigger = workflow.split("\npermissions:")[0];
assert.doesNotMatch(trigger, /(?m)^\s+(push|pull_request|schedule):/);
assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
assert.match(workflow, /name: beagu-stage38-vercel-preview-approved/);
assert.ok(workflow.includes("REQUIRED OWNER REVIEWERS"));
assert.ok(workflow.includes("prj_AfPd5IvdT6DlIJkTuSfGxu2PaVVA"));
assert.ok(workflow.includes("team_bSH5LPm82iDkTvE4ly21mrDg"));
assert.ok(workflow.includes(releaseSha));
assert.ok(workflow.includes(digest));
assert.ok(workflow.includes('test "$INPUT_SHA" = "$TRUSTED_SHA"'));
assert.ok(workflow.includes('test "$(sha256sum _preview_standalone_site/stage38-release-manifest.json | cut'));
assert.match(workflow, /environment:\s*\n\s+name: beagu-stage38-vercel-preview-approved/);
assert.match(workflow, /secrets\.STAGE38_VERCEL_TOKEN/);
assert.match(workflow, /vars\.STAGE38_VERCEL_CLI_VERSION/);
assert.match(workflow, /persist-credentials: false/);
assert.match(workflow, /python3 tests\/stage38-real-rc-packaging\.py/);
assert.match(workflow, /python3 scripts\/release-manager\/build-offline-rc-bundle\.py/);
assert.match(workflow, /\$VERCEL_PROJECT_ID/);
assert.match(workflow, /vercel deploy --yes/);
assert.doesNotMatch(workflow, /--prod\b|vercel promote\b|vercel alias\b|vercel rollback\b/);
assert.doesNotMatch(workflow, /permissions:\s*\n\s+contents:\s*write/);
assert.match(workflow, /hostname==="baegu-index-test\.vercel\.app"/);
assert.match(workflow, /hostname==="baeguindex\.com"/);

// Workflow can only be reviewed in PR until merged to protected main.
// No GitHub Actions dispatch or Vercel invocation is made by this test.
console.log("PASS: manual Stage38 Vercel workflow is fixed-target, sha-pinned, reviewer-environment gated, and not a production release.");
console.log("NOTE: repository owner must configure required reviewers and isolated Vercel token/version before dispatch; this static test cannot verify GitHub environment policy.");
