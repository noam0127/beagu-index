#!/usr/bin/env python3
"""Draft cutouts from exact in-repository character pose atlases; human QA mandatory."""
from pathlib import Path
import json, hashlib, shutil
import numpy as np
import cv2
from rembg import remove, new_session
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
_SESSION = None
def make_mask(frame):
    """Use a human/object segmentation model instead of destructive GrabCut scribble masks."""
    global _SESSION
    if _SESSION is None:
        _SESSION = new_session("isnet-general-use")
    result = remove(frame.convert('RGB'), session=_SESSION, only_mask=True)
    mask = np.asarray(result.convert('L'), dtype=np.uint8)
    # Keep segmentation uncertainty as soft alpha: hands and hair should not be eroded.
    return cv2.GaussianBlur(mask,(3,3),.4)
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
        (OUT/'source_atlases').mkdir(exist_ok=True)
        shutil.copy2(SOURCE/fname,OUT/'source_atlases'/fname)
        sheet=Image.open(SOURCE/fname).convert('RGBA')
        for i,pose in enumerate(poses):
            c,r=i%cols,i//cols
            frame=sheet.crop((round(c*sheet.width/cols),round(r*sheet.height/rs),round((c+1)*sheet.width/cols),round((r+1)*sheet.height/rs)))
            out=OUT/name/(pose+'.png');result=save_pose(frame,out)
            rows.append({'person':name,'pose':pose,'file':out.as_posix(),'alpha_draft':True,'segmentation_model':'isnet-general-use','source_frame':[c,r],'original_size':frame.size,'is_upscaled_not_native_hd':True})
            thumb=result.copy();thumb.thumbnail((260,360))
            previews.append((name+' '+pose,thumb))
    fname='female-jiyoon-thigh-v4.webp';blob=(SOURCE/fname).read_bytes()
    sha=git_sha(blob);hashes[fname]=sha
    if sha!=EXPECTED_SHA[fname]: raise ValueError(f'GitHub source changed: {fname}: {sha}')
    shutil.copy2(SOURCE/fname,OUT/'source_atlases'/fname)
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
    (OUT/'manifest.json').write_text(json.dumps({'status':'draft_qa_only_model_based_v2','must_not_deploy_without_visual_approval':True,'source_blob_sha':hashes,'files':rows},ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Generated {len(rows)} original-identity transparent draft cutouts')
if __name__=='__main__':main()
