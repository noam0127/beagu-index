"use strict";
// Stage 013: deliberately bounded MIDI/MusicXML conversion. No network, no media extraction.
const fs=require("node:fs");
const PPQ=480, MAX_BYTES=1024*1024, MAX_EVENTS=10000;
class MusicInputError extends Error {constructor(message){super(message);this.name="MusicInputError"}}
function ensure(ok,msg){if(!ok)throw new MusicInputError(msg)}
function rightsGate(rights){
 ensure(rights&&typeof rights==="object","rights_required");
 ensure(typeof rights.sourceId==="string"&&/^[a-z0-9][a-z0-9_-]{3,100}$/i.test(rights.sourceId),"source_id_required");
 ensure(Array.isArray(rights.scopes)&&rights.scopes.includes("convert_to_game"),"conversion_scope_not_approved");
 if(rights.status==="demo_original"){
  ensure(rights.sourceId==="original-shining-our-school","demo_original_only_for_verified_fixture");
  ensure(rights.publicRelease===false,"demo_must_not_auto_publish");
 }else if(rights.status==="approved"){
  // Stage022: do not accept self-declared permission evidence from user files.
  // Existing records must pass the separate trusted offline intake first;
  // no external MIDI/MusicXML conversion is enabled in this stage.
  throw new MusicInputError("external_requires_stage022_trusted_registry");
 }else throw new MusicInputError("unapproved_or_withdrawn_rights");
 return {sourceId:rights.sourceId,status:rights.status,scopes:["convert_to_game"],publicRelease:false};
}
function bytes(input){
 const b=Buffer.isBuffer(input)?input:Buffer.from(input);
 ensure(b.length>0&&b.length<=MAX_BYTES,"music_file_size_limit");return b;
}
function fromTicks(notes,nativePPQ,bpm,format,timeSignature){
 ensure(Number.isInteger(nativePPQ)&&nativePPQ>=24&&nativePPQ<=9600,"unsupported_tick_division");
 ensure(bpm>30&&bpm<=240,"unsupported_tempo");
 ensure(timeSignature.numerator===4&&timeSignature.denominator===4,"time_signature_stage014_required");
 ensure(notes.length>0&&notes.length<=MAX_EVENTS,"invalid_note_count");
 const result=notes.map(n=>{
  const start=n.start*PPQ/nativePPQ,dur=n.duration*PPQ/nativePPQ;
  ensure(Number.isInteger(start)&&Number.isInteger(dur)&&start>=0&&dur>0,"non_quantized_tick");
  ensure(start%120===0&&dur%120===0,"sixteenth_grid_required");
  ensure(Number.isInteger(n.pitch)&&n.pitch>=0&&n.pitch<=127,"invalid_pitch");
  return {step:start/120,pitch:n.pitch,duration:dur/120,startTick:start,durationTicks:dur,
    startSeconds:Number((start/PPQ*60/bpm).toFixed(8)),
    durationSeconds:Number((dur/PPQ*60/bpm).toFixed(8)),
    part:"melody",velocity:Number.isInteger(n.velocity)?n.velocity:96};
 }).sort((a,b)=>a.startTick-b.startTick||a.pitch-b.pitch);
 ensure(result.at(-1).step+result.at(-1).duration<=128,"more_than_eight_demo_bars");
 return {sourceFormat:format,bpm,timeSignature,ticksPerQuarter:PPQ,notes:result};
}
function vlq(buffer,offset,limit){
 let value=0;
 for(let i=0;i<4;i++){
  ensure(offset<limit,"truncated_variable_integer");
  const v=buffer[offset++];
  value=value*128+(v&127);
  if(!(v&128))return {value,offset};
 }
 throw new MusicInputError("variable_integer_too_long");
}
function parseMidi(data,rights){
 const provenance=rightsGate(rights),b=bytes(data);
 ensure(b.length>=14&&b.toString("ascii",0,4)==="MThd","missing_midi_header");
 const hdr=b.readUInt32BE(4);ensure(hdr>=6&&hdr<=64&&8+hdr<=b.length,"invalid_midi_header_length");
 const format=b.readUInt16BE(8),trackCount=b.readUInt16BE(10),division=b.readUInt16BE(12);
 ensure(format<=1&&trackCount>0&&trackCount<=16,"unsupported_midi_layout");
 ensure((division&0x8000)===0,"smpte_timebase_not_supported");
 let cursor=8+hdr,tempo=null,sig=null,raw=[];
 for(let tr=0;tr<trackCount;tr++){
  ensure(cursor+8<=b.length&&b.toString("ascii",cursor,cursor+4)==="MTrk","missing_midi_track");
  const len=b.readUInt32BE(cursor+4),end=cursor+8+len;
  ensure(end<=b.length&&len<=MAX_BYTES,"invalid_track_length");
  let p=cursor+8,tick=0,running=0;
  while(p<end){
   const d=vlq(b,p,end);tick+=d.value;p=d.offset;
   ensure(tick<=Number.MAX_SAFE_INTEGER,"midi_tick_overflow");
   ensure(p<end,"truncated_event");
   let status=b[p];
   if(status>=0x80){p++;if(status<0xF0)running=status;}
   else{ensure(running>=0x80&&running<0xF0,"invalid_midi_running_status");status=running;}
   if(status===0xFF){
    running=0;ensure(p<end,"truncated_metadata");const kind=b[p++];
    const z=vlq(b,p,end);p=z.offset;ensure(p+z.value<=end,"truncated_meta_payload");
    if(kind===0x51){
     ensure(z.value===3,"invalid_tempo_meta");
     const micro=(b[p]<<16)|(b[p+1]<<8)|b[p+2];ensure(micro>0,"invalid_tempo_value");
     if(tempo!==null)ensure(tempo===micro,"tempo_changes_stage014_required");tempo=micro;
    }else if(kind===0x58){
     ensure(z.value>=2,"invalid_meter_meta");
     const meter={numerator:b[p],denominator:2**b[p+1]};
     if(sig!==null)ensure(sig.numerator===meter.numerator&&sig.denominator===meter.denominator,"meter_changes_stage014_required");
     sig=meter;
    }
    p+=z.value;
   }else if(status===0xF0||status===0xF7){
    running=0;const z=vlq(b,p,end);p=z.offset+z.value;ensure(p<=end,"truncated_sysex");
   }else{
    ensure(status>=0x80&&status<0xF0,"unsupported_midi_status");
    const kind=status&0xF0,ch=status&15,n=kind===0xC0||kind===0xD0?1:2;
    ensure(p+n<=end,"truncated_channel_event");
    const pitch=b[p++],vel=n===2?b[p++]:0;
    ensure(pitch<=127&&vel<=127,"invalid_midi_data_byte");
    if(kind===0x90&&vel>0)raw.push({tick,kind:"on",pitch,velocity:vel,ch});
    if(kind===0x80||(kind===0x90&&vel===0))raw.push({tick,kind:"off",pitch,ch});
    ensure(raw.length<=MAX_EVENTS*2,"too_many_midi_events");
   }
  }
  cursor=end;
 }
 ensure(cursor===b.length,"extra_bytes_after_tracks");
 ensure(tempo!==null&&sig!==null,"midi_tempo_meter_required");
 const active=new Map(),notes=[];
 raw.sort((a,b)=>a.tick-b.tick||(a.kind==="off"?-1:1));
 for(const e of raw){
  const key=e.ch+":"+e.pitch;
  if(e.kind==="on"){ensure(!active.has(key),"overlapping_same_pitch_not_supported");active.set(key,e);}
  else{
   const start=active.get(key);ensure(start,"midi_note_off_without_on");active.delete(key);
   ensure(e.tick>start.tick,"zero_length_midi_note");
   notes.push({pitch:e.pitch,start:start.tick,duration:e.tick-start.tick,velocity:start.velocity});
  }
 }
 ensure(active.size===0,"unclosed_midi_notes");
 return {...fromTicks(notes,division,60000000/tempo,"midi",sig),rights:provenance,sourceTempoMicroseconds:tempo};
}
const NATURAL={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const PITCH_NAMES=[["C",0],["C",1],["D",0],["E",-1],["E",0],["F",0],["F",1],["G",0],["A",-1],["A",0],["B",-1],["B",0]];
function xmlNodes(x){return x===undefined?[]:Array.isArray(x)?x:[x]}
function parseMusicXml(input,rights){
 const provenance=rightsGate(rights),b=bytes(input),xml=b.toString("utf8");
 ensure(!/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(xml),"unsafe_xml_dtd_or_entity");
 let XMLParser;try{({XMLParser}=require("fast-xml-parser"))}catch(_){throw new MusicInputError("fast_xml_parser_dependency_required")}
 const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false,processEntities:false,
  allowBooleanAttributes:false,removeNSPrefix:true});
 let root;
 try{root=parser.parse(xml)}catch(_){throw new MusicInputError("invalid_musicxml")}
 const score=root["score-partwise"];
 ensure(score&&typeof score==="object","score_partwise_required");
 const parts=xmlNodes(score.part);
 ensure(parts.length===1,"single_melody_part_required");
 const measures=xmlNodes(parts[0].measure);
 ensure(measures.length===8,"exact_eight_measures_required");
 let divisions=null,tempo=null,meter=null,notes=[],start=0;
 for(const [bar,m]of measures.entries()){
  ensure(!m.backup&&!m.forward,"multi_voice_or_backup_stage014_required");
  if(m.attributes){
   const attr=xmlNodes(m.attributes)[0];
   if(attr.divisions!==undefined){
    const value=Number(attr.divisions);
    ensure(Number.isInteger(value)&&value>=24&&value<=9600&&value%4===0,"invalid_xml_divisions");
    if(divisions!==null)ensure(divisions===value,"division_changes_stage014_required");
    divisions=value;
   }
   if(attr.time){
    const time=xmlNodes(attr.time)[0],sig={numerator:Number(time.beats),denominator:Number(time["beat-type"])};
    if(meter)ensure(sig.numerator===meter.numerator&&sig.denominator===meter.denominator,"meter_changes_stage014_required");
    meter=sig;
   }
  }
  for(const dir of xmlNodes(m.direction)){
   const sound=dir.sound;if(sound?.["@_tempo"]!==undefined){
    const bpm=Number(sound["@_tempo"]);ensure(Number.isFinite(bpm),"invalid_xml_tempo");
    if(tempo!==null)ensure(Math.abs(tempo-bpm)<.000001,"tempo_changes_stage014_required");tempo=bpm;
   }
  }
  if(m.sound?.["@_tempo"]!==undefined){
   const bpm=Number(m.sound["@_tempo"]);if(tempo!==null)ensure(Math.abs(tempo-bpm)<.000001,"tempo_changes_stage014_required");tempo=bpm;
  }
  ensure(divisions!==null&&meter!==null&&tempo!==null,"xml_tempo_divisions_meter_required");
  let position=0;
  for(const n of xmlNodes(m.note)){
   ensure(!Object.hasOwn(n,"chord")&&!Object.hasOwn(n,"grace")&&!Object.hasOwn(n,"tie")&&!n.notations?.tied,"chords_grace_ties_stage014_required");
   const len=Number(n.duration);
   ensure(Number.isInteger(len)&&len>0&&len<=divisions*4,"invalid_xml_note_duration");
   if(!Object.hasOwn(n,"rest")){
    ensure(n.pitch&&typeof n.pitch==="object","note_pitch_required");
    const p=n.pitch,step=String(p.step),alter=p.alter===undefined?0:Number(p.alter),oct=Number(p.octave);
    ensure(Object.hasOwn(NATURAL,step)&&Number.isInteger(alter)&&alter>=-2&&alter<=2&&Number.isInteger(oct),"invalid_xml_pitch");
    notes.push({pitch:(oct+1)*12+NATURAL[step]+alter,start:start+position,duration:len,velocity:96});
   }
   position+=len;
  }
  ensure(position===divisions*4,"incomplete_or_overfull_measure_"+bar);
  start+=position;
 }
 return {...fromTicks(notes,divisions,tempo,"musicxml",meter),rights:provenance};
}
function vlqOut(n){
 ensure(Number.isSafeInteger(n)&&n>=0&&n<=0x0FFFFFFF,"vlq_value_out_of_range");
 const out=[n&127];while(n>=128){n>>=7;out.unshift((n&127)|128)}return Buffer.from(out);
}
function makeMidiFixture(notes,bpm=108){
 const tempo=Math.round(60000000/bpm);
 const raw=[{tick:0,priority:0,data:Buffer.from([0xFF,0x51,0x03,(tempo>>16)&255,(tempo>>8)&255,tempo&255])},
 {tick:0,priority:0,data:Buffer.from([0xFF,0x58,0x04,4,2,24,8])}];
 for(const n of notes){
  const start=n.startTick??n.step*120,len=n.durationTicks??n.duration*120;
  raw.push({tick:start,priority:2,data:Buffer.from([0x90,n.pitch,96])});
  raw.push({tick:start+len,priority:1,data:Buffer.from([0x80,n.pitch,0])});
 }
 raw.push({tick:15360,priority:3,data:Buffer.from([0xFF,0x2F,0])});
 raw.sort((a,b)=>a.tick-b.tick||a.priority-b.priority);
 const data=[];let last=0;
 for(const e of raw){data.push(vlqOut(e.tick-last),e.data);last=e.tick}
 const track=Buffer.concat(data),hdr=Buffer.alloc(14),tag=Buffer.alloc(8);
 hdr.write("MThd",0,"ascii");hdr.writeUInt32BE(6,4);hdr.writeUInt16BE(0,8);hdr.writeUInt16BE(1,10);hdr.writeUInt16BE(PPQ,12);
 tag.write("MTrk",0,"ascii");tag.writeUInt32BE(track.length,4);
 return Buffer.concat([hdr,tag,track]);
}
function makeMusicXmlFixture(notes,bpm=108){
 let out=['<?xml version="1.0" encoding="utf-8"?>','<score-partwise version="4.0">',
 '<work><work-title>Original Demo School Anthem</work-title></work>',
 '<movement-title>Original Demo School Anthem</movement-title>',
 '<part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>',
 '<part id="P1">'];
 for(let bar=0;bar<8;bar++){
  out.push('<measure number="'+(bar+1)+'">');
  if(bar===0){out.push('<attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>');
   out.push('<direction><sound tempo="'+bpm+'"/></direction>');}
  let covered=0;
  for(const n of notes.filter(n=>Math.floor(n.step/16)===bar)){
   ensure(n.step===bar*16+covered,"fixture_melody_must_be_sequential");
   const [step,alter]=PITCH_NAMES[n.pitch%12],octave=Math.floor(n.pitch/12)-1;
   const alt=alter?'<alter>'+alter+'</alter>':'';
   out.push('<note><pitch><step>'+step+'</step>'+alt+'<octave>'+octave+'</octave></pitch><duration>'+(n.duration*120)+'</duration><type>'+(n.duration===8?"half":"quarter")+'</type></note>');
   covered+=n.duration;
  }
  ensure(covered===16,"fixture_bar_must_fill_four_beats_"+bar);
  out.push('</measure>');
 }
 out.push('</part>','</score-partwise>');
 return out.join("\n")+"\n";
}
function convertFile({inputPath,outputPath,format,rights}){
 rightsGate(rights);
 const buffer=fs.readFileSync(inputPath);
 const result=format==="midi"?parseMidi(buffer,rights):format==="musicxml"?parseMusicXml(buffer,rights):null;
 ensure(result,"format_must_be_midi_or_musicxml");
 ensure(outputPath&&typeof outputPath==="string","output_path_required");
 fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+"\n");
 return result;
}
module.exports={PPQ,MusicInputError,rightsGate,parseMidi,parseMusicXml,makeMidiFixture,makeMusicXmlFixture,convertFile};
if(require.main===module){
 const args=process.argv.slice(2),params={};
 for(let i=0;i<args.length;i+=2)params[args[i]]=args[i+1];
 try{
  const rights=JSON.parse(fs.readFileSync(params["--rights"],"utf8"));
  const res=convertFile({inputPath:params["--input"],outputPath:params["--output"],format:params["--format"],rights});
  console.log("Converted "+res.notes.length+" notes, "+res.sourceFormat+", rights "+res.rights.status);
 }catch(e){console.error("MUSIC_INPUT_REJECTED: "+e.message);process.exitCode=1}
}
