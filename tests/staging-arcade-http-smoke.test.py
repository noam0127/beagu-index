#!/usr/bin/env python3
"""Real HTTP QA-only probes. Reads empty leaderboard; never posts valid score."""
from urllib import request,error
import json
URL="https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/arcade-leaderboard"
QA="http://localhost:8000"
def call(path,method="GET",origin=QA,data=None):
    headers={}
    if origin is not None:headers["Origin"]=origin
    if data is not None:headers["Content-Type"]="application/json"
    req=request.Request(URL+path,headers=headers,method=method,data=data)
    try:
        with request.urlopen(req,timeout=25) as resp:return resp.status,resp.headers,resp.read()
    except error.HTTPError as exc:return exc.code,exc.headers,exc.read()
code,headers,body=call("?game=volleyball_25")
assert code==200,(code,body[:200])
obj=json.loads(body)
assert obj.get("game")=="volleyball_25" and isinstance(obj.get("top10"),list),(code,obj)
assert isinstance(obj.get("fastestTop10"),list)
print("PASS real staging empty-game leaderboard GET")
code,headers,body=call("?game=invalid")
assert code==400,(code,body[:200])
print("PASS invalid game rejected")
code,headers,body=call("?game=volleyball_25",origin="https://baeguindex.com")
assert code==403 and not headers.get("Access-Control-Allow-Origin"),(code,headers)
print("PASS production origin denied")
code,headers,body=call("?game=volleyball_25",origin=None)
assert code==403 and not headers.get("Access-Control-Allow-Origin"),(code,headers)
print("PASS missing origin denied")
code,headers,body=call("",method="POST",data=b'{"game":"invalid","action":"start"}')
assert code==400,(code,body[:200])
print("PASS invalid start rejected without writing gameplay records")
print("LIVE PASS; valid school game start/finish and score persistence not tested")
