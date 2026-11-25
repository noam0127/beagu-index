#!/usr/bin/env python3
"""Offline SQL emitter. Never connects to any database. Default is read/write rehearsal followed by ROLLBACK on an isolated DB only."""
import argparse, hashlib, json, pathlib, re
ROOT=pathlib.Path(__file__).resolve().parents[2]
BODY=ROOT/'supabase/sql/v11118_schoolinfo_patch_body.sql'
AUDIT_SHA={
'qualification':'d0a7c76f6950230a65bd559e737afbd84bc2bece6c6d992906de848312f89de4',
'position':'7c3044ce36dcef3c8d6ec4dda10f8f46fbc7dce3a65856c7054d03f84b79c71b',
'basic':'ea0db252cbf19f0575d4ca038ecab6e4a49f39460cfba1d0694a3c55efe425e9',
'students':'7ffac567448e34a8d02e8c3a9cf50cba2dca1e04cc8caef7cdcfa92a538adbd7'}
HELD=['S000003503','S030002096','S110000638']
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def integer(x,limit=10000):
 if type(x) is not int or not 0<=x<=limit: raise ValueError('invalid integer')
 return x
def checked(row):
 code=row['disclosure_code']; name=row['school_name']; c=row['elementary_certified_counts']
 if not re.fullmatch(r'S[0-9]{9}',code) or not isinstance(name,str) or not name or len(name)>150 or any(ord(x)<32 for x in name): raise ValueError('identity')
 if row['source_year']!=2026 or row['student_reference_year']!=2026 or c['source_year']!=2026 or c['basis']!='REPORTED_1_2_ASSOCIATE': raise ValueError('source year or basis')
 expected={'source_year','basis'}|{g+'_'+k for g in ('first','second','associate') for k in ('male','female','total')}
 if set(c)!=expected: raise ValueError('unexpected qualification fields')
 t,m,f=(integer(row['expected_full_staff_'+k]) for k in ('total','male','female'))
 if m+f!=t: raise ValueError('staff sums')
 for g in ('first','second','associate'):
  a,b,n=(integer(c[g+'_'+k]) for k in ('male','female','total'))
  if a+b!=n: raise ValueError('category sums')
 cm=sum(c[g+'_male'] for g in ('first','second','associate')); cf=sum(c[g+'_female'] for g in ('first','second','associate'))
 if not 0<cm+cf<=t or cm>m or cf>f: raise ValueError('denominator')
 return [code,name,integer(row['student_count'],100000),c,t,m,f]
def quote(s): return "'"+s.replace("'","''")+"'"
def emit(rows,source_digest,expected_ready=6277,held=HELD,apply=False):
 if len(rows)!=expected_ready+len(held) or len({r[0] for r in rows})!=len(rows): raise ValueError('row count or duplicate code')
 if not re.fullmatch('[0-9a-f]{64}',source_digest): raise ValueError('digest')
 if sorted(held)!=list(held) or any(not re.fullmatch(r'S[0-9]{9}',v) for v in held): raise ValueError('held list')
 if not set(held).issubset({r[0] for r in rows}): raise ValueError('missing expected holds')
 values=',\n'.join('('+','.join([quote(r[0]),quote(r[1]),str(r[2]),quote(json.dumps(r[3],ensure_ascii=False,separators=(',',':')))+'::jsonb',str(r[4]),str(r[5]),str(r[6]),quote(source_digest)])+')' for r in rows)
 return ("\\set ON_ERROR_STOP on\nBEGIN;\nSET LOCAL standard_conforming_strings=on;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='120s';\n"
 "CREATE TEMP TABLE schoolinfo_input(disclosure_code text PRIMARY KEY,school_name text,student_count int,qualified jsonb,staff_total int,staff_male int,staff_female int,source_digest text) ON COMMIT DROP;\n"
 "CREATE TEMP TABLE schoolinfo_control(expected_ready int,expected_held text[]) ON COMMIT DROP;\n"
 "INSERT INTO schoolinfo_control VALUES("+str(expected_ready)+",ARRAY["+','.join(quote(v) for v in held)+"]::text[]);\n"
 "INSERT INTO schoolinfo_input VALUES\n"+values+";\n"+BODY.read_text(encoding='utf-8')+"\n"+("COMMIT;\n" if apply else "ROLLBACK;\n"))
def main():
 p=argparse.ArgumentParser();p.add_argument('--patches',type=pathlib.Path,required=True);p.add_argument('--qualification',type=pathlib.Path,required=True);p.add_argument('--position',type=pathlib.Path,required=True);p.add_argument('--basic',type=pathlib.Path,required=True);p.add_argument('--students',type=pathlib.Path,required=True);p.add_argument('--approved-patch-sha256',required=True);p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--emit-apply',action='store_true');a=p.parse_args()
 for k,h in AUDIT_SHA.items():
  if digest(getattr(a,k))!=h: raise SystemExit('source digest mismatch: '+k)
 h=digest(a.patches)
 if h!=a.approved_patch_sha256: raise SystemExit('patch digest mismatch')
 # Explicit reviewed hash locks the approved transformed file; four source hashes
 # independently lock the original inputs. This is not an automatic source parser.
 rows=[checked(json.loads(l)) for l in a.patches.read_text(encoding='utf-8-sig').splitlines() if l.strip()]
 with a.output.open('x',encoding='utf-8') as f: f.write(emit(rows,h,apply=a.emit_apply))
 print(json.dumps({'rows':len(rows),'expected_ready':6277,'held':HELD,'sha256':h,'mode':'APPLY_FILE_ONLY' if a.emit_apply else 'ROLLBACK_FILE_ONLY','connected_to_db':False}))
if __name__=='__main__': main()
