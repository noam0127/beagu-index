import test from "node:test";
import assert from "node:assert/strict";
import {RELEASE_CI_POLICY, verifyProductionReadiness} from "../supabase/functions/beagu-release-manager-v1/release-ci-proof.mjs";

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const STAGED_AT = "2026-11-22T22:00:00.000Z";
const NOW = Date.parse("2026-11-23T00:00:00.000Z");
const REPO = "noam0127/beagu-index";

function evidence(overrides = {}) {
  const requests = [];
  const githubGet = async (path) => {
    requests.push(path);
    if (overrides.throwOn && path.includes(overrides.throwOn)) throw Error("GitHub unavailable");
    const spec = RELEASE_CI_POLICY.find((s) => path.includes(s.file));
    if (spec) {
      const i = RELEASE_CI_POLICY.indexOf(spec);
      const run = {
        id: 1001 + i,
        run_attempt: 1,
        path: ".github/workflows/" + spec.file,
        event: "workflow_dispatch",
        head_sha: SHA,
        head_branch: "main",
        repository: {full_name: REPO},
        head_repository: {full_name: REPO},
        created_at: "2026-11-22T22:30:00.000Z",
        updated_at: "2026-11-22T22:35:00.000Z",
        status: "completed",
        conclusion: "success"
      };
      Object.assign(run, overrides.run?.(run, spec, i) || {});
      const list = overrides.runs?.(run, spec, i) ?? [run];
      return {total_count: list.length, workflow_runs: list};
    }
    const match = path.match(/^\/actions\/runs\/(\d+)\/jobs/);
    if (match) {
      const id = Number(match[1]);
      const i = id - 1001;
      const spec = RELEASE_CI_POLICY[i] || RELEASE_CI_POLICY[0];
      const job = {
        id: 2001 + i, run_id: id, run_attempt: 1, name: spec.job,
        status: "completed", conclusion: "success",
        steps: [
          {name: "Checkout", status: "completed", conclusion: "success"},
          {name: "Acceptance verification", status: "completed", conclusion: "success"}
        ]
      };
      Object.assign(job, overrides.job?.(job, spec, i) || {});
      const list = overrides.jobs?.(job, spec, i) ?? [job];
      return {total_count: list.length, jobs: list};
    }
    throw Error("Unexpected GitHub endpoint " + path);
  };
  return {requests, githubGet};
}
const verify = (get, extra = {}) => verifyProductionReadiness({
  githubGet: get, sha: SHA, stagingDeployedAt: STAGED_AT, now: NOW, ...extra
});

test("exact same SHA, main branch and three successful post-staging workflows are required", async () => {
  const mock = evidence();
  const result = await verify(mock.githubGet);
  assert.equal(result.ok, true);
  assert.deepEqual(result.verified_run_ids, [1001, 1002, 1003]);
  assert.equal(mock.requests.length, 6);
  for (const spec of RELEASE_CI_POLICY)
    assert.ok(mock.requests.some((url) => url.includes(spec.file)), spec.file);
});

test("browser-controlled success or run IDs are not accepted as attestation", async () => {
  const mock = evidence({runs: () => []});
  const result = await verify(mock.githubGet, {confirmed_tested: true, verified_run_ids: [1001]});
  assert.deepEqual(result, {ok: false, code: "ci_attestation_missing"});
});

test("an unrelated SHA or branch is not accepted", async () => {
  for (const mutation of [{head_sha: OTHER_SHA}, {head_branch: "feature"}]) {
    const mock = evidence({run: () => mutation});
    const result = await verify(mock.githubGet);
    assert.equal(result.ok, false);
    assert.equal(result.code, "ci_attestation_missing");
  }
});

test("wrong workflow event, repository or path never counts", async () => {
  for (const mutation of [
    {event: "push"}, {repository: {full_name: "attacker/other"}},
    {head_repository: {full_name: "attacker/other"}},
    {path: ".github/workflows/other.yml"}
  ]) {
    const result = await verify(evidence({run: () => mutation}).githubGet);
    assert.equal(result.code, "ci_attestation_missing");
  }
});

test("the newest failed run blocks release despite an older success", async () => {
  const mock = evidence({
    runs: (run) => [
      {...run, id: run.id + 10, created_at: "2026-11-22T22:40:00.000Z",
       updated_at: "2026-11-22T22:45:00.000Z", conclusion: "failure"},
      run
    ]
  });
  const result = await verify(mock.githubGet);
  assert.deepEqual(result, {ok: false, code: "ci_attestation_not_successful"});
});

test("a queued or cancelled workflow cannot approve production", async () => {
  for (const change of [
    {status: "queued", conclusion: null},
    {status: "completed", conclusion: "cancelled"}
  ]) {
    const result = await verify(evidence({run: () => change}).githubGet);
    assert.equal(result.code, "ci_attestation_not_successful");
  }
});

test("missing or future staging evidence prevents release", async () => {
  for (const stagingDeployedAt of [
    undefined, "bad-date", "2026-11-30T00:00:00Z",
    "2026-11-01T00:00:00Z"
  ]) {
    const result = await verify(evidence().githubGet, {stagingDeployedAt});
    assert.equal(result.code, "ci_stage_evidence_missing_or_expired");
  }
});

test("a run before staging or older than the policy window is denied", async () => {
  const before = evidence({run: () => ({
    created_at: "2026-11-22T20:00:00Z",
    updated_at: "2026-11-22T20:05:00Z"
  })});
  assert.equal((await verify(before.githubGet)).code, "ci_attestation_stale");
  const past = evidence();
  const result = await verify(past.githubGet, {
    now: Date.parse("2026-12-01T00:00:00Z"),
    stagingDeployedAt: "2026-11-30T22:00:00Z"
  });
  assert.equal(result.code, "ci_attestation_stale");
});

test("missing, failing, or incomplete job and test-step evidence denies release", async () => {
  const variants = [
    {jobs: () => [], code: "ci_jobs_incomplete"},
    {job: () => ({conclusion: "failure"}), code: "ci_jobs_not_successful"},
    {job: () => ({name: "wrong-job"}), code: "ci_required_job_missing"},
    {job: () => ({steps: [{name: "Checkout", status: "completed", conclusion: "success"}]}),
     code: "ci_test_steps_incomplete"}
  ];
  for (const v of variants) {
    const result = await verify(evidence(v).githubGet);
    assert.equal(result.code, v.code);
  }
});

test("GitHub fetch errors fail closed", async () => {
  for (const throwOn of ["/actions/workflows/", "/jobs"]) {
    const result = await verify(evidence({throwOn}).githubGet);
    assert.equal(result.code, "ci_github_unavailable");
  }
});

test("a reused run ID cannot prove three independent workflows", async () => {
  const result = await verify(evidence({run: () => ({id: 1001})}).githubGet);
  assert.equal(result.code, "ci_duplicate_workflow_proof");
});

test("invalid sha and missing GitHub accessor are denied before network calls", async () => {
  const mock = evidence();
  assert.equal((await verify(mock.githubGet, {sha: "not-a-sha"})).code, "ci_inputs_invalid");
  assert.equal((await verify(null)).code, "ci_inputs_invalid");
  assert.deepEqual(mock.requests, []);
});
