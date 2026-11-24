"""Offline OAuth / OnePick tests; no Google login, upload or operational data."""
import pathlib
import sys
import unittest
import urllib.parse
import hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_drive_enroll as e
import integrated_drive_setup as s
import integrated_drive_checkpoint as d
import integrated_vault as v
CLIENT="fixture.apps.googleusercontent.com";SECRET="fixture-secret";FOLDER="fixture_folder";OWNER="fixture_owner"
STATE="a"*43;VERIFIER="b"*64;REDIRECT="http://127.0.0.1:12345/oauth2callback"
class Fake:
    def __init__(self,answers):self.answers=list(answers);self.calls=[]
    def request(self,*args):self.calls.append(args);return self.answers.pop(0)
def response(x):return 200,{},v.canonical(x)
def token(refresh=True):
    x={"access_token":"fixture-access","token_type":"Bearer","scope":s.SCOPE,"expires_in":3600}
    if refresh:x["refresh_token"]="fixture-refresh"
    return x
def meta():return {"id":FOLDER,"mimeType":d.FOLDER,"ownedByMe":True,"shared":False,"trashed":False,"capabilities":{"canAddChildren":True}}
def perms():return {"permissions":[{"type":"user","role":"owner","id":OWNER}]}
class Enroll(unittest.TestCase):
    def test_exact_single_flow_and_callback(self):
        url=e.authorization_url(CLIENT,FOLDER,REDIRECT,STATE,VERIFIER)
        u=urllib.parse.urlsplit(url);q=urllib.parse.parse_qs(u.query)
        self.assertEqual((u.scheme,u.netloc,u.path),("https","accounts.google.com","/o/oauth2/v2/auth"))
        for k,x in {"trigger_onepick":"true","file_ids":FOLDER,"allow_folder_selection":"true","allow_multiple":"false","scope":s.SCOPE,"access_type":"offline","prompt":"consent","state":STATE,"code_challenge_method":"S256"}.items():self.assertEqual(q[k],[x])
        self.assertEqual(q["code_challenge"],[e.b64(hashlib.sha256(VERIFIER.encode()).digest())])
        self.assertNotIn(VERIFIER,url)
        params={"state":STATE,"scope":s.SCOPE,"picked_file_ids":FOLDER,"code":"fixture-code"}
        cb=lambda x:e.CALLBACK+"?"+urllib.parse.urlencode(x)
        self.assertEqual(e.parse_callback(cb(params),STATE,FOLDER),"fixture-code")
        for patch in ({"state":"wrong"},{"scope":"https://www.googleapis.com/auth/drive"},{"picked_file_ids":FOLDER+",other"},{"picked_file_ids":"another_folder"},{"error":"access_denied"},{"code":""}):
            with self.assertRaises(ValueError):e.parse_callback(cb({**params,**patch}),STATE,FOLDER)
        with self.assertRaises(ValueError):e.parse_callback(cb(params)+"&state="+STATE,STATE,FOLDER)
    def test_exchange_and_folder_owner_pins(self):
        f=Fake([response(token()),response(meta()),response(perms()),response(token(False)),response(meta()),response(perms())])
        access,refresh=e.exchange(CLIENT,SECRET,"fixture-code",REDIRECT,VERIFIER,f)
        c=e.selected_config(CLIENT,SECRET,FOLDER,access,refresh,f)
        self.assertEqual(c["owner_permission_id"],OWNER)
        self.assertEqual(c["folder_id"],FOLDER)
        self.assertEqual([x[1] for x in f.calls],["POST","GET","GET","POST","GET","GET"])
        self.assertEqual(f.answers,[])
        self.assertEqual(urllib.parse.parse_qs(f.calls[0][4].decode())["code_verifier"],[VERIFIER])
        for bad in ({**meta(),"shared":True},{**meta(),"ownedByMe":False},{**meta(),"id":"wrong_folder"}):
            f=Fake([response(bad)])
            with self.assertRaisesRegex(ValueError,"drive_folder_not_private_writable"):e.selected_config(CLIENT,SECRET,FOLDER,access,refresh,f)
            self.assertEqual(len(f.calls),1)
        f=Fake([response(meta()),response({"permissions":[*perms()["permissions"],{"type":"anyone","role":"reader"}]})])
        with self.assertRaisesRegex(ValueError,"drive_permissions_not_private"):e.selected_config(CLIENT,SECRET,FOLDER,access,refresh,f)
        f=Fake([response(token(False))])
        with self.assertRaisesRegex(ValueError,"oauth_token_missing"):e.exchange(CLIENT,SECRET,"fixture-code",REDIRECT,VERIFIER,f)
if __name__=="__main__":unittest.main()
