import importlib.util, pathlib, tempfile, subprocess, os, sys
p=pathlib.Path('scripts/release-manager/prepare_schoolinfo_2026_patch.py')
spec=importlib.util.spec_from_file_location('patch',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
c={'source_year':2026,'basis':'REPORTED_1_2_ASSOCIATE','first_male':2,'first_female':4,'first_total':6,'second_male':1,'second_female':1,'second_total':2,'associate_male':0,'associate_female':0,'associate_total':0}
def row(code,name):
 return {'disclosure_code':code,'school_name':name,'source_year':2026,'student_reference_year':2026,'student_count':123,'elementary_certified_counts':c,'expected_full_staff_total':10,'expected_full_staff_male':4,'expected_full_staff_female':6}
r=[m.checked(row('S000000001','정상초')),m.checked(row('S000000002','보류초'))]
try: m.checked({**row('S000000001','정상초'),'elementary_certified_counts':{**c,'first_total':99}})
except ValueError: pass
else: raise AssertionError('bad sum accepted')
assert m.emit(r,'a'*64,1,['S000000002']).endswith('ROLLBACK;\n')
try: m.emit([r[0],r[0]],'a'*64,1,['S000000002'])
except ValueError: pass
else: raise AssertionError('duplicate accepted')
if len(sys.argv)>1:
 container=sys.argv[1]
 def run(sql,ok=True):
  p=subprocess.run(['docker','exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres'],input=sql,text=True,capture_output=True)
  assert (p.returncode==0)==ok,(p.stdout,p.stderr)
  return p.stdout
 run(pathlib.Path('tests/v11118-schoolinfo-import-fixture.sql').read_text())
 dry=m.emit(r,'a'*64,1,['S000000002'])
 apply=m.emit(r,'a'*64,1,['S000000002'],True)
 run(dry)
 run("DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.beagu_2026_official_school_profiles WHERE profile ? 'student_count') THEN RAISE EXCEPTION 'rollback failed'; END IF; END $$;")
 run(apply);run(apply)
 run("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.beagu_2026_official_school_profiles WHERE profile->>'student_count'='123' AND profile->>'unrelated'='keep' AND source_sha256='old') THEN RAISE EXCEPTION 'preservation'; END IF; END $$;")
 run(m.emit(r,'b'*64,1,['S000000002'],True),False)
 run("UPDATE public.schools SET status='휴교' WHERE school_id='1234567';")
 run(apply,False)
print('PASS: offline validation, duplicates, rollback, idempotency, conflicts and status drift (DB cases only when fixture supplied)')
