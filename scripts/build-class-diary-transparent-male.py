#!/usr/bin/env python3
"""Transparent cut-outs from existing fictional male visual-novel portrait atlases."""
from pathlib import Path
from PIL import Image
import numpy as np
import cv2

ROOT=Path(__file__).resolve().parents[1]
DIR=ROOT/'assets/class-diary/characters'
SETS=[
 ('hyunwoo-six-expressions.webp',3,2,'hyunwoo-six-transparent-v2.webp'),
 ('male-supporting-strip.webp',3,1,'male-supporting-transparent-v2.webp'),
 ('doyun-four-expressions.webp',2,2,'doyun-four-transparent-v2.webp')
]
def isolate(rgb):
    h,w=rgb.shape[:2]
    mask=np.full((h,w),cv2.GC_PR_BGD,dtype=np.uint8)
    cv2.rectangle(mask,(int(w*.05),int(h*.34)),(w-int(w*.05)-1,h-1),cv2.GC_PR_FGD,-1)
    cv2.ellipse(mask,(w//2,int(h*.30)),(max(2,int(w*.40)),max(2,int(h*.30))),0,0,360,cv2.GC_PR_FGD,-1)
    cv2.ellipse(mask,(w//2,int(h*.27)),(max(2,int(w*.19)),max(2,int(h*.14))),0,0,360,cv2.GC_FGD,-1)
    cv2.rectangle(mask,(int(w*.29),int(h*.65)),(int(w*.71),h-1),cv2.GC_FGD,-1)
    margin=max(1,int(min(h,w)*.022))
    mask[:margin,:]=cv2.GC_BGD
    mask[:,:margin]=cv2.GC_BGD
    mask[:,-margin:]=cv2.GC_BGD
    bg=np.zeros((1,65),np.float64);fg=np.zeros((1,65),np.float64)
    cv2.grabCut(cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR),mask,None,bg,fg,4,cv2.GC_INIT_WITH_MASK)
    alpha=np.where((mask==cv2.GC_FGD)|(mask==cv2.GC_PR_FGD),255,0).astype(np.uint8)
    n,labels,stats,_=cv2.connectedComponentsWithStats(alpha,8)
    ids=[i for i in range(1,n) if stats[i,cv2.CC_STAT_AREA]>h*w*.015]
    if ids: alpha=np.uint8(np.isin(labels,ids))*255
    alpha=cv2.medianBlur(alpha,3)
    alpha=cv2.GaussianBlur(alpha,(3,3),.75)
    tail=max(3,int(h*.075))
    alpha[-tail:,:]=np.uint8(alpha[-tail:,:].astype(np.float32)*np.linspace(1,.12,tail)[:,None])
    return np.dstack([rgb,alpha])
def main():
    for source_name,cols,rows,target_name in SETS:
        src=Image.open(DIR/source_name).convert('RGB')
        w,h=src.size
        cw,ch=w//cols,h//rows
        output=np.zeros((h,w,4),dtype=np.uint8)
        for row in range(rows):
            for col in range(cols):
                box=(col*cw,row*ch,(col+1)*cw,(row+1)*ch)
                crop=np.asarray(src.crop(box))
                output[box[1]:box[3],box[0]:box[2]]=isolate(crop)
        dest=DIR/target_name
        Image.fromarray(output,'RGBA').save(dest,'WEBP',quality=64,method=4)
        check=Image.open(dest)
        alpha=np.asarray(check.getchannel('A'))
        coverage=(alpha>10).mean()
        assert check.mode=='RGBA' and (alpha==0).any() and .07<coverage<.95,(target_name,coverage)
        print(target_name,dest.stat().st_size,'bytes, coverage',round(coverage,3))
if __name__=='__main__':main()
