import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const activePath=".github/workflows/stage38-approved-vercel-preview.yml";
const templatePath="docs/releases/templates/stage38-approved-vercel-preview.yml";
const workflow=readFileSync(templatePath,"utf8");

// Review on the draft branch must pass without an executable deploy workflow.
// After a SEPARATE approved activation PR, validation must continue to pass
// only when the active workflow is byte-for-byte identical to the reviewed
// template; otherwise fail closed. This check is not owner approval.
function reviewActivatedWorkflow(candidate, approvedTemplate) {
  assert.equal(candidate, approvedTemplate,
    "Active Stage38 deployment workflow differs from reviewed template; separate security review required");
}
if (existsSync(activePath)) {
  reviewActivatedWorkflow(readFileSync(activePath,"utf8"),workflow);
}
// Exercise both code paths without creating or activating a real workflow.
assert.doesNotThrow(() => reviewActivatedWorkflow(workflow,workflow));
assert.throws(() => reviewActivatedWorkflow(
  workflow.replace("vercel deploy --yes","vercel deploy --yes --prod"),workflow),
  /differs from reviewed template/
);
const releaseSha = "5c95aadad971901a8222f83c52e93bf901a3aeb7";
const digest = "8d17ca34fe811f415cf1849c3b76723de408e43c09d11abf1b87e9a4dfc95754";

assert.match(workflow, /^on:\n  workflow_dispatch:/m);
const trigger = workflow.split("\npermissions:")[0];
assert.doesNotMatch(trigger, /^\s+(push|schedule):/m);
assert.match(trigger, /^  pull_request:\s*$/m);
assert.match(trigger, /stage38-approved-vercel-preview\.yml/);
assert.match(workflow, /validate-pr-no-deployment:\s*\n    if: github\.event_name == 'pull_request'/);
const prOnly = workflow.split("  validate-pr-no-deployment:")[1]?.split("  manual-preview:")[0];
assert.ok(prOnly, "A non-secret PR validation job is required");
assert.ok(prOnly.includes("node tests/stage38-manual-vercel-gate.mjs"));
assert.doesNotMatch(prOnly, /\bvercel deploy\b|\bsecrets\.|\benvironment:/);
const sensitive = workflow.split("  manual-preview:")[1];
assert.match(sensitive, /if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
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
assert.match(workflow, /secrets\.STAGE38_APPROVED_MANIFEST_SHA256/);
assert.match(workflow, /test -n "\$APPROVED_RC_MANIFEST_SHA256"/);
assert.match(workflow, /test "\$APPROVED_RC_MANIFEST_SHA256" = "\$TRUSTED_SHA"/);
assert.ok(
  workflow.indexOf("Confirm separate explicit owner approval") <
  workflow.indexOf("Create unaliased preview, never production"),
  "Owner approval must execute before deployment"
);
assert.ok(
  workflow.indexOf("Rebuild pinned RC and verify independent security invariants") <
  workflow.indexOf("Confirm separate explicit owner approval"),
  "RC and artifact identity must be checked before owner-release approval"
);
assert.match(workflow, /secrets\.STAGE38_VERCEL_TOKEN/);
assert.match(workflow, /vars\.STAGE38_VERCEL_CLI_VERSION/);
assert.match(workflow, /persist-credentials: false/);
assert.match(workflow, /python3 tests\/stage38-real-rc-packaging\.py/);
assert.match(workflow, /python3 scripts\/release-manager\/build-offline-rc-bundle\.py/);
assert.match(workflow, /\$VERCEL_PROJECT_ID/);
// Previous inactive YAML draft had an unterminated CLI version regex and
// two deployment steps with the same "id: deploy". Both must fail review.
const cliLine=workflow.split("\n").find(line=>line.includes("grep -Eq"));
assert.ok(cliLine, "Vercel version checking must be present");
assert.ok(cliLine.includes("printf '%s' \"$CLI_VERSION\" | grep -Eq '"));
assert.ok(cliLine.includes("^[0-9]+\\.[0-9]+\\.[0-9]+$'"), "Missing EOL anchor or closing regex quote");
assert.ok(cliLine.includes("Unpinned Vercel CLI version"), "Missing fail-closed error");
const deploymentStepIds=workflow.match(/^        id: deploy\s*$/gm)||[];
assert.equal(deploymentStepIds.length,1,"Duplicate Vercel deployment step IDs");
const deploymentCommands=workflow.match(/^          url="\$\(vercel deploy --yes\)"\s*$/gm)||[];
assert.equal(deploymentCommands.length,1,"Duplicate Vercel deployment commands");
const stepNames=[...workflow.matchAll(/^      - name: (.+)$/gm)].map(match=>match[1]);
assert.equal(stepNames.length,new Set(stepNames).size,"Duplicate workflow step names");
assert.equal((workflow.match(/^  manual-preview:\s*$/gm)||[]).length,1);
assert.equal((workflow.match(/^  validate-pr-no-deployment:\s*$/gm)||[]).length,1);
assert.match(workflow,/test -n "\$VERCEL_TOKEN" \|\|/);
assert.match(workflow,/^          printf 'url=%s\\n' "\$url" >> "\$GITHUB_OUTPUT"$/m);
assert.match(workflow,/vercel deploy --yes/);
assert.doesNotMatch(workflow,/--prod\b|vercel promote\b|vercel alias\b|vercel rollback\b/);
assert.doesNotMatch(workflow,/permissions:\s*\n\s+contents:\s*write/);
assert.match(workflow,/hostname==="baegu-index-test\.vercel\.app"/);
assert.match(workflow,/hostname==="baeguindex\.com"/);

// Only a separate owner review can activate the draft. This test does not
// dispatch, access credentials, or change existing Vercel deployments.
console.log("PASS: Stage38 template structure reviewed; approved activation can be byte-identical while altered active workflow fails closed.");
console.log("ACTIVE WORKFLOW PRESENT:", existsSync(activePath));
console.log("NOTE: current tests do not approve activation, verify GitHub required reviewers, or publish a Vercel site.");
