#!/usr/bin/env python3
"""Draft cutouts from exact in-repository character pose atlases; human QA mandatory."""
from pathlib import Path
import json, hashlib
import numpy as np
import cv2
from PIL import Image, ImageDraw

SOURCE = Path('assets/class-diary/characters')
OUT = Path('class-diary-cutout-review')
CAST = {
  'hyunwoo': ('hyunwoo-poses-v2.webp', 4, 2, 'neutral smile shy explaining thinking tired listening notebook'.split()),
  'dogyeom': ('dogyeom-poses-v2.webp', 8, 1, 'greeting string-game preparing listening thinking demonstrating smiling bashful'.split()),
  'taeo': ('taeo-poses-v2.webp', 8, 1, 'greeting volleyball explaining clipboard awkward thinking listening relaxed'.split()),
}
EXPECTED_SHA = {
 'hyunwoo-poses-v2.webp':'d790a64161779917a665993fe85de25f5b985650',
 'dogyeom-poses-v2.webp':'3d6b56f272f27873648de6e18bca7b76a3b079f8',
 'taeo-poses-v2.webp':'506fe2d347ee6dde5fdc71b2421e69621609b128',
 'female-jiyoon-thigh-v4.webp':'b9d1a7f53f2d6d477a724256d59e04f130658691'
}
def git_sha(blob): return hashlib.sha1(f'blob {len(blob)}\0'.encode()+blob).hexdigest()
def make_mask(frame):
    rgb=np.array(frame.convert('RGB'))
    h,w=rgb.shape[:2]
    bgr=cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR)
    mask=np.full((h,w),cv2.GC_PR_BGD,np.uint8)
    dx=max(2,round(w*.025));dy=max(2,round(h*.015))
    mask[:dy,:]=cv2.GC_BGD;mask[-dy:,:]=cv2.GC_BGD
    mask[:,:dx]=cv2.GC_BGD;mask[:,-dx:]=cv2.GC_BGD
    cv2.ellipse(mask,(w//2,int(h*.22)),(int(w*.33),int(h*.18)),0,0,360,cv2.GC_PR_FGD,-1)
    cv2.ellipse(mask,(w//2,int(h*.63)),(int(w*.43),int(h*.43)),0,0,360,cv2.GC_PR_FGD,-1)
    cv2.ellipse(mask,(w//2,int(h*.19)),(int(w*.12),int(h*.07)),0,0,360,cv2.GC_FGD,-1)
    cv2.ellipse(mask,(w//2,int(h*.55)),(int(w*.19),int(h*.12)),0,0,360,cv2.GC_FGD,-1)
    bg=np.zeros((1,65),np.float64);fg=np.zeros((1,65),np.float64)
    cv2.grabCut(bgr,mask,None,bg,fg,5,cv2.GC_INIT_WITH_MASK)
    matte=np.uint8(np.isin(mask,[cv2.GC_FGD,cv2.GC_PR_FGD]))*255
    count,labels,stats,_=cv2.connectedComponentsWithStats(matte,8)
    if count>1:
        largest=1+np.argmax(stats[1:,cv2.CC_STAT_AREA]);major=np.uint8(labels==largest)*255
        matte=np.where((matte>0) & (cv2.dilate(major,np.ones((13,13),np.uint8))>0),255,0).astype(np.uint8)
    return cv2.GaussianBlur(matte,(3,3),.5)
def save_pose(frame,output,alpha=None):
    source=frame.convert('RGBA')
    if alpha is None: alpha=make_mask(source)
    source.putalpha(Image.fromarray(alpha) if isinstance(alpha,np.ndarray) else alpha)
    bbox=source.getbbox()
    if bbox is None: raise ValueError('empty mask '+str(output))
    source=source.crop(bbox)
    size=(1536,2048)
    scale=min(size[0]*.9/source.width,size[1]*.92/source.height)
    source=source.resize((max(1,int(source.width*scale)),max(1,int(source.height*scale))),Image.Resampling.LANCZOS)
    target=Image.new('RGBA',size)
    target.alpha_composite(source,((size[0]-source.width)//2,(size[1]-source.height)//2))
    output.parent.mkdir(parents=True,exist_ok=True)
    target.save(output,format='PNG',optimize=True)
    target.save(output.with_suffix('.webp'),format='WEBP',quality=82,method=4,exact=True)
    return target
def main():
    OUT.mkdir(exist_ok=True)
    rows=[];previews=[];hashes={}
    for name,(fname,cols,rs,poses) in CAST.items():
        original=(SOURCE/fname).read_bytes();sha=git_sha(original);hashes[fname]=sha
        if sha!=EXPECTED_SHA[fname]: raise ValueError(f'GitHub source changed: {fname}: {sha}')
        sheet=Image.open(SOURCE/fname).convert('RGBA')
        for i,pose in enumerate(poses):
            c,r=i%cols,i//cols
            frame=sheet.crop((round(c*sheet.width/cols),round(r*sheet.height/rs),round((c+1)*sheet.width/cols),round((r+1)*sheet.height/rs)))
            out=OUT/name/(pose+'.png');result=save_pose(frame,out)
            rows.append({'person':name,'pose':pose,'file':out.as_posix(),'alpha_draft':True,'source_frame':[c,r],'original_size':frame.size})
            thumb=result.copy();thumb.thumbnail((260,360))
            previews.append((name+' '+pose,thumb))
    fname='female-jiyoon-thigh-v4.webp';blob=(SOURCE/fname).read_bytes()
    sha=git_sha(blob);hashes[fname]=sha
    if sha!=EXPECTED_SHA[fname]: raise ValueError(f'GitHub source changed: {fname}: {sha}')
    original=Image.open(SOURCE/fname).convert('RGBA')
    if original.getchannel('A').getextrema()[0]==255: raise ValueError('Jiyoon lacks expected original alpha')
    out=OUT/'jiyoon'/'neutral_existing.png';result=save_pose(original,out,original.getchannel('A'))
    rows.append({'person':'jiyoon','pose':'neutral_existing','file':out.as_posix(),'alpha_draft':False,'source_frame':[0,0],'original_size':original.size})
    thumb=result.copy();thumb.thumbnail((260,360));previews.append(('jiyoon neutral_existing',thumb))
    for i in range(0,len(previews),25):
        subset=previews[i:i+25]
        board=Image.new('RGB',(260*5,410*((len(subset)+4)//5)),(242,239,235));draw=ImageDraw.Draw(board)
        for idx,(label,picture) in enumerate(subset):
            x=(idx%5)*260;y=(idx//5)*410
            checker=Image.new('RGBA',(260,365),(227,227,227,255))
            checker.alpha_composite(picture,((260-picture.width)//2,(365-picture.height)//2))
            board.paste(checker.convert('RGB'),(x,y));draw.text((x+8,y+372),label,fill=(30,30,30))
        board.save(OUT/f'contact_{1+i//25}.jpg',quality=85)
    (OUT/'manifest.json').write_text(json.dumps({'status':'draft_qa_only','must_not_deploy_without_visual_approval':True,'source_blob_sha':hashes,'files':rows},ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Generated {len(rows)} original-identity transparent draft cutouts')
if __name__=='__main__':main()
