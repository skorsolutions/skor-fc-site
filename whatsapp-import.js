/* SKOR FC WhatsApp batch parser v52.9 */
(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.SKORWhatsAppImport=api;
})(typeof window!=="undefined"?window:globalThis,function(){
  "use strict";

  const clean=value=>String(value??"")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,"")
    .replace(/[\u00a0\u202f]/g," ")
    .trim();

  const timestampPatterns=[
    /^\s*\[(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\]\s*([^:]{1,160}):\s?(.*)$/i,
    /^\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*[-–—]\s*([^:]{1,160}):\s?(.*)$/i
  ];

  function parseTimestamp(dateText,timeText){
    const dateParts=clean(dateText).split(/[\/.\-]/).map(Number);
    if(dateParts.length!==3||dateParts.some(value=>!Number.isFinite(value)))return null;
    let [first,second,year]=dateParts;
    if(year<100)year+=year<70?2000:1900;
    let month=first,day=second;
    if(first>12&&second<=12){day=first;month=second;}
    else if(second>12&&first<=12){month=first;day=second;}
    const normalizedTime=clean(timeText).toLowerCase().replace(/\./g,"");
    const marker=(normalizedTime.match(/\b(am|pm)\b/)||[])[1]||"";
    const clock=normalizedTime.replace(/\s*(am|pm)\s*$/i,"").split(":").map(Number);
    if(clock.length<2||clock.some(value=>!Number.isFinite(value)))return null;
    let [hour,minute,secondValue=0]=clock;
    if(marker){
      if(hour<1||hour>12)return null;
      if(marker==="pm"&&hour!==12)hour+=12;
      if(marker==="am"&&hour===12)hour=0;
    }
    if(month<1||month>12||day<1||day>31||hour<0||hour>23||minute<0||minute>59||secondValue<0||secondValue>59)return null;
    const value=new Date(year,month-1,day,hour,minute,secondValue,0);
    if(value.getFullYear()!==year||value.getMonth()!==month-1||value.getDate()!==day)return null;
    return value;
  }

  function matchMessageStart(line){
    const timeFirst=String(line??"").match(/^\s*\[(\d{1,2}:\d{2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?),\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\]\s*([^:]{1,160}):\s?(.*)$/i);
    if(timeFirst){
      const occurredAt=parseTimestamp(timeFirst[2],timeFirst[1]),author=clean(timeFirst[3]);
      if(occurredAt&&author)return {occurredAt,author,body:String(timeFirst[4]??"").trim(),rawTimestamp:`${timeFirst[2]}, ${clean(timeFirst[1])}`};
    }
    for(const pattern of timestampPatterns){
      const match=String(line??"").match(pattern);
      if(!match)continue;
      const occurredAt=parseTimestamp(match[1],match[2]);
      const author=clean(match[3]);
      if(!occurredAt||!author)return null;
      return {occurredAt,author,body:String(match[4]??"").trim(),rawTimestamp:`${match[1]}, ${clean(match[2])}`};
    }
    return null;
  }

  function parseWhatsAppThread(value){
    const source=String(value??"").replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n");
    const lines=source.split("\n");
    const messages=[],leading=[];
    let current=null;
    const finish=()=>{
      if(!current)return;
      current.body=current.body.replace(/\n{3,}/g,"\n\n").trim();
      current.hasMediaMarker=/(?:<attached:[^>]+>|image omitted|photo omitted|video omitted|audio omitted|document omitted)/i.test(current.body);
      current.sequence=messages.length;
      messages.push(current);
      current=null;
    };
    lines.forEach(line=>{
      const start=matchMessageStart(line);
      if(start){finish();current=start;return;}
      if(current){current.body+=(current.body?"\n":"")+String(line??"");}
      else if(clean(line))leading.push(clean(line));
    });
    finish();
    return {
      messages,
      warnings:leading.length?[`${leading.length} line${leading.length===1?" was":"s were"} ignored before the first WhatsApp timestamp.`]:[]
    };
  }

  function suggestMatchId(occurredAt,matches){
    const sourceTime=new Date(occurredAt).valueOf();
    if(!Number.isFinite(sourceTime))return "";
    const ordered=(Array.isArray(matches)?matches:[])
      .map(match=>({id:String(match?.id??""),time:new Date(match?.kickoff).valueOf()}))
      .filter(match=>match.id&&Number.isFinite(match.time))
      .sort((a,b)=>a.time-b.time);
    return ordered.find(match=>match.time>=sourceTime)?.id||"";
  }

  return {parseWhatsAppThread,suggestMatchId,parseTimestamp};
});
