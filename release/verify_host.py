import base64
import json
import os
from pathlib import Path
import sys
import time
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

preview=sys.argv[1]=="preview"
host=os.environ["PREVIEW_URL"].rstrip("/") if preview else "https://baeguindex.com"
parsed=urlparse(host)
if parsed.scheme!="https" or parsed.path or (preview and parsed.hostname in {"www.baeguindex.com","baeguindex.com"}):
    raise SystemExit("잘못된 환경 주소")

def fetch(path,headers):
    url=host+"/"+path
    # Never forward preview credentials to a redirected origin.
    from urllib.request import HTTPRedirectHandler, build_opener
    class SameOrigin(HTTPRedirectHandler):
        def redirect_request(self,req,fp,code,msg,h,newurl):
            if urlparse(newurl).netloc!=parsed.netloc: raise ValueError("cross-origin redirect")
            return super().redirect_request(req,fp,code,msg,h,newurl)
    return build_opener(SameOrigin).open(Request(url,headers=headers),timeout=15)

headers={"Cache-Control":"no-cache"}
sha=Path("dist/release.json").read_text()
if preview:
    try:
        with fetch("index.html",{}): raise SystemExit("테스트 웹이 인증 없이 열립니다.")
    except HTTPError as error:
        if error.code!=401: raise
    headers["Authorization"]="Basic "+base64.b64encode(("owner:"+os.environ["PREVIEW_PASSWORD"]).encode()).decode()
for attempt in range(15):
    try:
        with fetch("release.json?verify="+json.loads(sha)["sha"],headers) as response:
            if response.read().decode()==sha: break
    except (HTTPError,URLError): pass
    time.sleep(4)
else: raise SystemExit("게시된 커밋 확인 실패")
for path in ["index.html","admin.html","search.html","postit.html","statistics.html","teacher-run.html","teacher-volleyball.html","js/release-runtime.js"]:
    with fetch(path+"?verify="+json.loads(sha)["sha"],headers) as response:
        if preview and ("noindex" not in response.headers.get("X-Robots-Tag","") or "snvzwrexuqavnfvzgxqj" in response.headers.get("Content-Security-Policy","")):
            raise SystemExit("테스트 응답 격리 헤더 오류")
        if response.read()!=(Path("dist")/path).read_bytes(): raise SystemExit(path+" 배포 내용 불일치")
