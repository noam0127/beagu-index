#!/usr/bin/env python3
"""Live signed GitHub PR identity -> isolated staging Edge worker -> atomic SQL.

No release-controller or Github Pages writes. Static Git SHA files are already
published to an isolated QA branch and are only independently verified.
All simulated database release pointers/jobs are removed in finally.
"""
import json
import os
import urllib.error
import urllib.request

BASE = "https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-stage38-signed-worker-once"
REPO = "noam0127/beagu-index"
A = "037a14afa252c52eaa130d7cbe2e08e649adf5bd"
B = "5512e798633eeb8163e8eab20c9ab9678b66f0cd"
AUD = "beagu-stage38-signed-worker-qa"
checks = []


def http(url, data=None, headers=None):
    request = urllib.request.Request(
        url, data=data, method="POST" if data is not None else "GET",
        headers=headers or {},
    )
    try:
        with urllib.request.urlopen(request, timeout=28) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read(8192)


def signed_token():
    url = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL")
    bearer = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    if not url or not bearer:
        raise AssertionError("GitHub OIDC token capability missing")
    separator = "&" if "?" in url else "?"
    status, raw = http(
        url + separator + "audience=" + AUD,
        headers={"Authorization": "Bearer " + bearer},
    )
    assert status == 200, "Signed GitHub OIDC request rejected"
    result = json.loads(raw)
    token = result.get("value")
    assert isinstance(token, str) and len(token) > 100, "Unsigned empty token"
    return token


def call(action, token=None, **kwargs):
    body = json.dumps({"action": action, **kwargs}, separators=(",", ":")).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    status, raw = http(BASE, data=body, headers=headers)
    try:
        return status, json.loads(raw)
    except Exception:
        raise AssertionError("Non-JSON staging worker response, status " + str(status))


def verify_static(sha, expected):
    assert sha in (A, B)
    url = "https://raw.githubusercontent.com/" + REPO + "/" + sha + "/stage38-lifecycle-check.html"
    status, contents = http(url)
    assert status == 200 and len(contents) < 5000, "Sandbox static file unavailable"
    assert ('id="stage38-lifecycle-version">SANDBOX-' + expected).encode() in contents
    assert b"connect-src &#39;none&#39;" in contents
    checks.append("immutable_file_" + expected + "_verified")


def assert_case(status, obj, expected_status, expected_code=None):
    assert status == expected_status, "Incorrect signed worker HTTP status: " + str(status)
    if expected_code:
        assert obj.get("error") == expected_code, "Wrong signed worker error"
    return obj


def run():
    status, obj = call("status")
    assert_case(status, obj, 401, "signed_github_identity_required")
    status, obj = call("status", "invalid.stage38.signature")
    assert_case(status, obj, 403, "invalid_github_oidc")
    checks.append("anonymous_and_forged_oidc_denied")

    token = signed_token()
    stage_prepared = False
    try:
        status, first = call("status", token)
        assert_case(status, first, 200)
        assert first["jobs"] == 0 and first["history"] == 0
        assert first["production_sha"] is None and first["staging_sha"] is None
        checks.append("empty_baseline")

        verify_static(A, "A")
        verify_static(B, "B")
        status, first = call("prepare", token)
        assert_case(status, first, 200)
        stage_prepared = True
        assert first.get("ok") is True and first.get("from_sha") == A
        assert first.get("to_sha") == B
        first_id = first["queued_job"]
        checks.append("staging_release_queued_by_signed_worker")

        status, job = call("worker_next", token)
        assert_case(status, job, 200)
        assert job.get("has_job") is True and job.get("job_id") == first_id
        assert job["action"] == "stage_apply" and job["to_sha"] == B
        status, running = call("worker_next", token)
        assert_case(status, running, 200)
        assert running.get("already_running") is True and running.get("has_job") is False
        checks.append("one_worker_claim_no_double_claim")

        status, committed = call("worker_complete", token, job_id=first_id)
        assert_case(status, committed, 200)
        assert committed.get("finalized") is True and committed.get("to_sha") == B
        status, repetition = call("worker_complete", token, job_id=first_id)
        assert_case(status, repetition, 409, "sandbox_job_not_running")
        status, after_update = call("status", token)
        assert_case(status, after_update, 200)
        assert after_update["staging_sha"] == B
        assert after_update["production_sha"] is None
        assert after_update["jobs"] == 1 and after_update["history"] == 1
        checks.append("signed_atomic_stage_publish_recorded_once")

        status, second = call("prepare_rollback", token)
        assert_case(status, second, 200)
        assert second["from_sha"] == B and second["to_sha"] == A
        second_id = second["queued_job"]
        status, rollback_job = call("worker_next", token)
        assert_case(status, rollback_job, 200)
        assert rollback_job["has_job"] is True and rollback_job["action"] == "stage_rollback"
        assert rollback_job["job_id"] == second_id
        status, reverted = call("worker_complete", token, job_id=second_id)
        assert_case(status, reverted, 200)
        assert reverted.get("finalized") is True and reverted["to_sha"] == A
        status, after_rollback = call("status", token)
        assert_case(status, after_rollback, 200)
        assert after_rollback["staging_sha"] == A
        assert after_rollback["production_sha"] is None
        assert after_rollback["jobs"] == 2 and after_rollback["history"] == 2
        assert after_rollback["queued"] == 0 and after_rollback["running"] == 0
        checks.append("signed_atomic_stage_rollback_and_history")

        status, forbidden = call("prod_apply", token)
        assert_case(status, forbidden, 403, "only_sandbox_actions_allowed")
        status, forbidden_worker = call("worker_fail", token)
        assert_case(status, forbidden_worker, 403, "only_sandbox_actions_allowed")
        checks.append("production_and_unexpected_worker_actions_denied")
    finally:
        status, deleted = call("cleanup", token)
        assert_case(status, deleted, 200)
        assert deleted["ok"] is True and deleted["cleanup"] is True
        status, final = call("status", token)
        assert_case(status, final, 200)
        assert final["staging_sha"] is None and final["production_sha"] is None
        assert final["jobs"] == 0 and final["history"] == 0
        checks.append("stage_state_jobs_history_all_cleaned")
    return checks


if __name__ == "__main__":
    try:
        passed = run()
        for item in passed:
            print("PASS: " + item)
        print("PASS: signed GitHub worker claim->atomic commit->rollback integrated on isolated staging")
        print("LIMITATION: simulated release acknowledgement; no live release-worker site deployment performed")
    except Exception as exc:
        # Never print OIDC bearer, credentials, or request headers.
        print("FAIL: " + type(exc).__name__ + ": " + str(exc)[:150])
        raise SystemExit(1)
