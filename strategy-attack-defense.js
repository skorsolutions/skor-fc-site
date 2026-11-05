(function(root){
  'use strict';
  const PRESET='balanced-attack-defense-v1',copy=v=>JSON.parse(JSON.stringify(v));
  const bound=(v,min,max)=>Math.max(min,Math.min(max,v));
  function validate(actors,label,keeperId){
    if(!Array.isArray(actors)||!actors.length||actors.length>11)throw Error('Choose 1–11 '+label+' players on the field first.');
    if(new Set(actors.map(p=>String(p.id))).size!==actors.length||actors.some(p=>!p.id||!Number.isFinite(Number(p.x))||!Number.isFinite(Number(p.y))))throw Error('Review the '+label+' player identities and positions first.');
    if(!keeperId||!actors.some(p=>String(p.id)===String(keeperId)))throw Error(label==='SKOR'?'Choose the starting keeper in Lineups before creating the GIF.':'Choose an opponent formation with a goalkeeper before creating the GIF.');
  }
  function views(actors,keeperId,away=false){
    validate(actors,away?'opponent':'SKOR',keeperId);
    function shape(attacking){return actors.map(player=>{
      const p=copy(player);if(String(p.id)===String(keeperId))return p;
      const y=away?100-Number(p.y):Number(p.y);
      p.x=bound(50+(Number(p.x)-50)*(attacking?1.12:.72),8,92);
      const next=attacking?bound(y*.92-4,14,86):bound(66+(y-60)*.58,32,84);
      p.y=away?100-next:next;return p;
    });}
    return {defending:shape(false),attacking:shape(true)};
  }
  function isGenerated(scene){return !!scene?.subScenes?.some(step=>step.quickShape===PRESET);}
  function syncDefense(scene,changed=scene?.subScenes?.[0]){
    if(scene?.subScenes?.length!==3||scene.subScenes[0]?.quickShape!==PRESET)return scene;
    const index=scene.subScenes.indexOf(changed);if(index!==0&&index!==2)return scene;
    const target=scene.subScenes[index===0?2:0];
    for(const key of ['home','opponents','ball','drawings'])target[key]=copy(changed[key]);
    return scene;
  }
  function build({home,opponents,keeperId,opponentKeeperId,makeId}){
    const h=views(home,keeperId),a=views(opponents,opponentKeeperId,true);
    const defending={id:makeId('step'),name:'Defending',quickShape:PRESET,home:h.defending,opponents:a.attacking,ball:{x:52,y:62},drawings:[]};
    const attacking={id:makeId('step'),name:'Attacking',home:h.attacking,opponents:a.defending,ball:{x:48,y:33},drawings:[]};
    const returning={...copy(defending),id:makeId('step'),name:'Return to defending'};delete returning.quickShape;
    return {id:makeId('scene'),name:'Attack and Defense',type:'transition',category:'transition',
      points:'Suggested balanced shapes. Defending: stay compact while opponents attack. Attacking: create width as opponents recover. Adjust either team and the ball for this game.',
      sourceBundleId:null,copyAsNew:true,activeSubSceneId:defending.id,subScenes:[defending,attacking,returning]};
  }
  const api={PRESET,views,build,isGenerated,syncDefense};root.SKORAttackDefense=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
