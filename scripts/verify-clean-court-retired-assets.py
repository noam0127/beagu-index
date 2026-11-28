"""Verify the two retired assets against the preserved baseline. No network or DB."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
baseline = "11eeec1770b924c768a6f5176a9254e7ce2e8415"
retired = {
    "js/beagu-edited-workbook-v1.js": "BeaguEditedWorkbook",
    "js/class-diary-audio-v1.js": "BeaguClassDiaryAudio",
}
def git(*args):
    return subprocess.run(["git", *args], cwd=root, check=True, text=True, capture_output=True).stdout
for path, symbol in retired.items():
    assert not (root/path).exists(), "Retired file unexpectedly present: " + path
    original = git("show", baseline + ":" + path)
    assert symbol in original, "Unexpected old module"
    patterns = [path, Path(path).name, Path(path).stem, symbol]
    args = ["git","grep","-I","-l","-F"]
    for pattern in patterns:
        args += ["-e",pattern]
    result = subprocess.run(args+[baseline,"--","."],cwd=root,text=True,capture_output=True)
    assert result.returncode in (0,1), result.stderr
    refs = [line for line in result.stdout.splitlines() if line != baseline+":"+path]
    assert not refs, "Baseline references still exist: " + repr(refs)
    result = subprocess.run(args+["--",".",":(exclude)scripts/verify-clean-court-retired-assets.py"],cwd=root,text=True,capture_output=True)
    assert result.returncode in (0,1), result.stderr
    current_refs = result.stdout.splitlines()
    workflow = ".github/workflows/clean-court-asset-audit.yml"
    if workflow in current_refs:
        # A paths filter detects accidental reintroduction; it does not load an asset.
        matches = [line for line in (root/workflow).read_text(encoding="utf-8").splitlines()
                   if any(pattern in line for pattern in patterns)]
        assert matches and all(line.strip() == "- '" + path + "'" for line in matches), repr(matches)
        current_refs.remove(workflow)
    assert not current_refs, "Current references still exist: " + repr(current_refs)
    print("PASS no tracked text references to retired asset or exported symbol:",path)
for path in ["admin.html","teacher-class-diary-play.html","js/beagu-edited-sheet-v1.js","js/beagu-2026-edited-admin-v1.js","js/class-diary-sound-v1.js","js/class-diary-semester-v1.js"]:
    git("diff","--exit-code",baseline,"--",path)
    assert (root/path).is_file(), "Active replacement missing"
assert "js/beagu-edited-sheet-v1.js" in (root/"admin.html").read_text(encoding="utf-8")
assert "js/class-diary-sound-v1.js" in (root/"teacher-class-diary-play.html").read_text(encoding="utf-8")
print("PASS active administrator import and class diary audio modules unchanged")
