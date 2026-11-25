import zipfile,sys
# Genuine OOXML workbook, standard shared strings + numeric percent + inline strings.
p=sys.argv[1]
main='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
pkg='http://schemas.openxmlformats.org/package/2006/relationships'
def inline(ref,text):
 return f'<c r="{ref}" t="inlineStr"><is><t>{text}</t></is></c>'
with zipfile.ZipFile(p,'w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>')
 z.writestr('_rels/.rels',f'<Relationships xmlns="{pkg}"><Relationship Id="rId1" Type="{rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>')
 z.writestr('xl/workbook.xml',f'<workbook xmlns="{main}" xmlns:r="{rel}"><sheets><sheet name="2026" sheetId="1" r:id="rId1"/></sheets></workbook>')
 z.writestr('xl/_rels/workbook.xml.rels',f'<Relationships xmlns="{pkg}"><Relationship Id="rId1" Type="{rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="{rel}/styles" Target="styles.xml"/></Relationships>')
 z.writestr('xl/styles.xml',f'<styleSheet xmlns="{main}"><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="10" applyNumberFormat="1"/></cellXfs></styleSheet>')
 head=''.join(inline(chr(65+i)+'1',h) for i,h in enumerate(['학교ID','백분위','Q01','Q22.1','Q31']))
 row=inline('A2','1000001')+'<c r="B2" s="1"><v>0.8234</v></c>'+inline('C2','보통이다')+inline('D2','그렇다')+inline('E2','PRIVATE')
 z.writestr('xl/worksheets/sheet1.xml',f'<worksheet xmlns="{main}"><sheetData><row r="1">{head}</row><row r="2">{row}</row></sheetData></worksheet>')
