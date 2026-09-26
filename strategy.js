/* SKOR FC Strategy Board v1 — local drafting plus captain-only game publishing. */
(function(){
  "use strict";

  const NS="http://www.w3.org/2000/svg";
  const BOARD={w:1000,h:680,pad:26};
  const STRATEGY_TABLE="match_strategies";
  const HOME_FORMATIONS={
    "4-2-3-1":[["GK",50,92],["LB",17,76],["LCB",39,79],["RCB",61,79],["RB",83,76],["LDM",38,61],["RDM",62,61],["LW",20,43],["CAM",50,46],["RW",80,43],["ST",50,24]],
    "4-3-3":[["GK",50,92],["LB",17,76],["LCB",39,79],["RCB",61,79],["RB",83,76],["LCM",29,57],["CM",50,62],["RCM",71,57],["LW",20,35],["ST",50,25],["RW",80,35]],
    "4-4-2":[["GK",50,92],["LB",17,76],["LCB",39,79],["RCB",61,79],["RB",83,76],["LM",18,54],["LCM",40,58],["RCM",60,58],["RM",82,54],["LST",39,29],["RST",61,29]],
    "4-5-1":[["GK",50,92],["LB",17,76],["LCB",39,79],["RCB",61,79],["RB",83,76],["LM",15,57],["LCM",37,60],["RCM",63,60],["RM",85,57],["CAM",50,43],["ST",50,23]],
    "3-5-2":[["GK",50,92],["LCB",25,77],["CB",50,81],["RCB",75,77],["LWB",13,55],["LCM",36,58],["CM",50,51],["RCM",64,58],["RWB",87,55],["LST",39,28],["RST",61,28]],
    "3-4-3":[["GK",50,92],["LCB",25,78],["CB",50,82],["RCB",75,78],["LM",15,57],["LCM",39,61],["RCM",61,61],["RM",85,57],["LW",20,34],["ST",50,25],["RW",80,34]],
    "5-3-2":[["GK",50,92],["LWB",11,70],["LCB",29,78],["CB",50,82],["RCB",71,78],["RWB",89,70],["LCM",30,55],["CM",50,60],["RCM",70,55],["LST",39,28],["RST",61,28]]
  };
  const TYPE_LABELS={offense:"IN POSSESSION",defense:"OUT OF POSSESSION",transition:"TRANSITION"};
  const DEFAULT_SCENES=[
    {name:"Build Up",type:"offense",points:"Create width early. The holding midfielder shows underneath while the far-side winger stays available."},
    {name:"Defensive Shape",type:"defense",points:"Stay compact between the lines. Shift together toward the ball and protect the middle first."},
    {name:"Win It & Go",type:"transition",points:"First look forward after the regain. Nearest players support the ball; the far side attacks the open lane."}
  ];

  let initialized=false;
  let activeTool="move";
  let interaction=null;
  let draft=null;
  let saveTimer=null;
  let sharedRecord=null;
  let sharedLoading=false;

  const $=id=>document.getElementById(id);
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const clone=value=>JSON.parse(JSON.stringify(value));
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
  const uid=prefix=>prefix+"_"+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  const lineApi=()=>window.SKORLineup;
  const sb=()=>window.SKORSupabase;
  const isUuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||""));
  const storageKey=()=>"skorStrategyDraftV1:"+String(lineApi()?.getCaptainKey?.()||"captain");

  function playerName(player){
    return String(player?.name||"Player").trim().split(/\s+/)[0]||"Player";
  }
  function formationPositions(name,flip=false){
    const shape=HOME_FORMATIONS[name]||HOME_FORMATIONS["4-4-2"];
    return shape.map(([role,x,y],index)=>({id:"opp_"+index,label:role,x, y:flip?100-y:y}));
  }
  function playersFromLineup(snapshot,roster){
    const byId=new Map((roster||[]).map(player=>[String(player.player_key||player.id),player]));
    const formation=snapshot?.formation||"4-2-3-1";
    const players=[];
    if(formation==="Freeform / Custom"){
      Object.entries(snapshot?.freeform||{}).forEach(([pid,pos])=>{
        const player=byId.get(String(pid));
        if(!player)return;
        players.push({id:String(pid),name:playerName(player),number:Number.isFinite(Number(player.number))?Number(player.number):"",x:clamp(Number(pos.x)||50,4,96),y:clamp(Number(pos.y)||50,5,95)});
      });
      return players;
    }
    const shape=HOME_FORMATIONS[formation]||HOME_FORMATIONS["4-2-3-1"];
    shape.forEach(([role,x,y])=>{
      const pid=String(snapshot?.slots?.[role]||"");
      const player=byId.get(pid);
      if(player)players.push({id:pid,name:playerName(player),number:Number.isFinite(Number(player.number))?Number(player.number):"",x,y});
    });
    return players;
  }
  function makeScene(seed,index,home,opponentFormation){
    return {id:uid("scene"),name:seed.name||"Scene "+(index+1),type:seed.type||"offense",points:seed.points||"",home:clone(home||[]),opponents:formationPositions(opponentFormation,true),ball:{x:50,y:index===1?55:45},drawings:[]};
  }
  function freshDraft(source){
    const home=playersFromLineup(source.state,source.roster);
    return {
      version:1,
      title:"Match Strategy",
      source:{id:source.id,label:source.label,eventLabel:source.eventLabel||"",matchId:source.matchId||null,variationId:source.variationId||null,formation:source.state?.formation||"Custom",state:clone(source.state||{}),roster:clone(source.roster||[])},
      opponentFormation:"4-4-2",
      showLanes:true,
      activeSceneId:"",
      scenes:DEFAULT_SCENES.map((seed,index)=>makeScene(seed,index,home,"4-4-2")),
      savedAt:new Date().toISOString()
    };
  }
  function normalizeDraft(value){
    if(!value||!Array.isArray(value.scenes)||!value.scenes.length)return null;
    value.title=String(value.title||"Match Strategy").slice(0,70);
    value.source=value.source&&typeof value.source==="object"?value.source:currentSource();
    if(!value.source.matchId&&value.source.id==="current"){
      const currentMatch=String(lineApi()?.getEventKey?.()||"");
      value.source.matchId=isUuid(currentMatch)?currentMatch:null;
    }
    value.source.variationId=isUuid(value.source.variationId)?String(value.source.variationId):null;
    value.opponentFormation=value.opponentFormation==="Custom / Freeform"||HOME_FORMATIONS[value.opponentFormation]?value.opponentFormation:"4-4-2";
    value.showLanes=value.showLanes!==false;
    value.scenes=value.scenes.map((scene,index)=>({
      id:String(scene.id||uid("scene")),name:String(scene.name||"Scene "+(index+1)).slice(0,50),type:TYPE_LABELS[scene.type]?scene.type:"offense",points:String(scene.points||"").slice(0,600),
      home:Array.isArray(scene.home)?scene.home:[],opponents:Array.isArray(scene.opponents)?scene.opponents:formationPositions(value.opponentFormation,true),
      ball:scene.ball&&Number.isFinite(Number(scene.ball.x))?scene.ball:{x:50,y:45},drawings:Array.isArray(scene.drawings)?scene.drawings:[]
    }));
    if(!value.scenes.some(scene=>scene.id===value.activeSceneId))value.activeSceneId=value.scenes[0].id;
    return value;
  }
  function loadLocal(){
    try{return normalizeDraft(JSON.parse(localStorage.getItem(storageKey())||"null"));}catch(error){console.warn("Could not load local strategy draft",error);return null;}
  }
  function persist(){
    if(!draft)return;
    draft.savedAt=new Date().toISOString();
    try{localStorage.setItem(storageKey(),JSON.stringify(draft));}catch(error){console.warn("Could not save local strategy draft",error);}
    const state=$("strategySaveState");
    if(state){state.textContent="Saved locally · "+new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});}
  }
  function queuePersist(){clearTimeout(saveTimer);saveTimer=setTimeout(persist,180);}
  function activeScene(){return draft?.scenes?.find(scene=>scene.id===draft.activeSceneId)||draft?.scenes?.[0]||null;}

  function currentSource(){
    const eventKey=String(lineApi()?.getEventKey?.()||"");
    return {id:"current",label:"Current working lineup",eventLabel:lineApi()?.getEventLabel?.()||"",matchId:isUuid(eventKey)?eventKey:null,variationId:null,state:lineApi()?.getState?.()||{},roster:lineApi()?.getRoster?.()||[]};
  }
  function selectedSource(){
    const value=$("strategyLineupSource")?.value||"current";
    if(value==="current")return currentSource();
    const id=value.replace(/^saved:/,"");
    const rec=(lineApi()?.listVariations?.()||[]).find(item=>String(item.id)===id);
    if(!rec)return currentSource();
    return {id:"saved:"+id,label:rec.name||"Saved lineup",eventLabel:rec.event_label||"",matchId:isUuid(rec.event_key)?String(rec.event_key):null,variationId:isUuid(rec.id)?String(rec.id):null,state:rec.state||{},roster:lineApi()?.getRoster?.()||[]};
  }
  function refreshSources(){
    const select=$("strategyLineupSource");if(!select)return;
    const current=select.value||"current";
    const records=lineApi()?.listVariations?.()||[];
    const groups=new Map();
    records.forEach(rec=>{const label=rec.event_label||"Tinker / No Game";if(!groups.has(label))groups.set(label,[]);groups.get(label).push(rec);});
    let html='<option value="current">Current working lineup · '+esc(lineApi()?.getEventLabel?.()||"board")+'</option>';
    groups.forEach((items,label)=>{
      html+='<optgroup label="'+esc(label)+'">'+items.map(rec=>'<option value="saved:'+esc(rec.id)+'">'+(rec.is_production?'Final · ':'')+esc(rec.name||"Saved lineup")+'</option>').join("")+'</optgroup>';
    });
    select.innerHTML=html;
    select.value=[...select.options].some(option=>option.value===current)?current:"current";
  }

  function setSharedStatus(message,tone=""){
    const node=$("strategySharedState");if(!node)return;
    node.textContent=message;
    node.className="strategy-shared-state"+(tone?" "+tone:"");
  }
  function updateSharedControls(){
    const linked=!!draft?.source?.matchId;
    const load=$("strategyLoadShared"),save=$("strategySaveShared"),publish=$("strategyPublishAi");
    if(load)load.hidden=!sharedRecord;
    if(save)save.disabled=!linked||sharedLoading;
    if(publish)publish.disabled=!linked||sharedLoading;
    if(sharedLoading){if(save)save.textContent="Saving…";if(publish)publish.textContent="Publishing…";}
    else{if(save)save.textContent="Save shared draft";if(publish)publish.textContent=sharedRecord?.status==="published"?"Update AI strategy":"Publish for AI";}
  }
  async function refreshSharedStatus(){
    const matchId=draft?.source?.matchId;
    sharedRecord=null;updateSharedControls();
    if(!matchId){setSharedStatus("This board is not linked to a scheduled game. Choose a game lineup and select Start from lineup before saving it for AI.");return;}
    if(!sb()){setSharedStatus("Supabase is not connected, so this remains a local draft.","error");return;}
    setSharedStatus("Checking for a shared strategy…");
    const {data,error}=await sb().from(STRATEGY_TABLE).select("id,match_id,source_lineup_variation_id,lineup_name,title,status,ai_context_enabled,opponent_formation,show_lanes,lineup_snapshot,scenes,created_by,updated_by,created_at,updated_at,published_at").eq("match_id",matchId).maybeSingle();
    if(error){setSharedStatus("Shared strategy storage is unavailable: "+error.message,"error");return;}
    sharedRecord=data||null;updateSharedControls();
    if(!sharedRecord){setSharedStatus("No shared strategy is saved for this game yet. Save a draft or publish it for AI.");return;}
    const published=sharedRecord.status==="published"&&sharedRecord.ai_context_enabled;
    setSharedStatus(published?"Published for AI · Updated "+new Date(sharedRecord.updated_at).toLocaleString():"Shared captain draft · Not available to AI yet · Updated "+new Date(sharedRecord.updated_at).toLocaleString(),published?"published":"");
  }
  function loadSharedStrategy(){
    if(!sharedRecord)return;
    const previousSource=draft?.source||{};
    const sourceVariation=(lineApi()?.listVariations?.()||[]).find(item=>String(item.id)===String(sharedRecord.source_lineup_variation_id||""));
    draft=normalizeDraft({
      version:1,
      title:sharedRecord.title,
      source:{
        id:sharedRecord.source_lineup_variation_id?"saved:"+sharedRecord.source_lineup_variation_id:"current",
        label:sharedRecord.lineup_name||"Saved game lineup",
        eventLabel:sourceVariation?.event_label||(String(previousSource.matchId)===String(sharedRecord.match_id)?previousSource.eventLabel:"")||"Scheduled game",
        matchId:sharedRecord.match_id,
        variationId:sharedRecord.source_lineup_variation_id||null,
        formation:sharedRecord.lineup_snapshot?.formation||"Custom",
        state:clone(sharedRecord.lineup_snapshot||{}),
        roster:clone(lineApi()?.getRoster?.()||previousSource.roster||[])
      },
      opponentFormation:sharedRecord.opponent_formation,
      showLanes:sharedRecord.show_lanes,
      activeSceneId:sharedRecord.scenes?.[0]?.id||"",
      scenes:clone(sharedRecord.scenes||[]),
      savedAt:sharedRecord.updated_at
    });
    renderAll();persist();updateSharedControls();
    setSharedStatus(sharedRecord.status==="published"?"Published strategy loaded. Changes remain local until you update the AI strategy.":"Shared captain draft loaded. Changes remain local until you save again.",sharedRecord.status==="published"?"published":"");
  }
  async function loadForMatch(matchId){
    init();
    if(!isUuid(matchId)||!sb())return;
    const {data,error}=await sb().from(STRATEGY_TABLE).select("id,match_id,source_lineup_variation_id,lineup_name,title,status,ai_context_enabled,opponent_formation,show_lanes,lineup_snapshot,scenes,created_by,updated_by,created_at,updated_at,published_at").eq("match_id",matchId).maybeSingle();
    if(error){setSharedStatus("Could not load this game's strategy: "+error.message,"error");return;}
    if(!data){setSharedStatus("No shared strategy has been saved for this game yet.");return;}
    sharedRecord=data;loadSharedStrategy();updateSharedControls();
  }
  function sharedPayload(status,userId){
    const published=status==="published";
    return {
      match_id:draft.source.matchId,
      source_lineup_variation_id:draft.source.variationId||null,
      lineup_name:String(draft.source.label||"Game lineup").slice(0,140),
      title:String(draft.title||"Match Strategy").trim().slice(0,70)||"Match Strategy",
      status,
      ai_context_enabled:published,
      opponent_formation:String(draft.opponentFormation||"4-4-2").slice(0,40),
      show_lanes:draft.showLanes!==false,
      lineup_snapshot:clone(draft.source.state||{}),
      scenes:clone(draft.scenes),
      updated_by:userId,
      published_at:published?new Date().toISOString():null
    };
  }
  function strategyNameCheckText(){
    return [draft?.title,...(draft?.scenes||[]).flatMap(scene=>[
      scene.name,
      scene.points,
      ...(scene.drawings||[]).filter(item=>item.type==="text").map(item=>item.text)
    ])].filter(Boolean).join("\n");
  }
  function applyStrategyNameReplacements(replacements){
    const replace=window.SKORNotebook?.applyNameReplacements;if(!replace||!replacements?.length)return;
    draft.title=replace(draft.title,replacements);
    draft.scenes.forEach(scene=>{
      scene.name=replace(scene.name,replacements);
      scene.points=replace(scene.points,replacements);
      (scene.drawings||[]).forEach(item=>{if(item.type==="text")item.text=replace(item.text,replacements);});
    });
    renderAll();persist();
  }
  async function saveSharedStrategy(status){
    if(sharedLoading)return;
    if(!draft?.source?.matchId){setSharedStatus("Choose a scheduled-game lineup and select Start from lineup first.","error");return;}
    if(!sb()){setSharedStatus("Supabase is not connected. Your local draft is still safe on this device.","error");return;}
    sharedLoading=true;updateSharedControls();
    setSharedStatus(status==="published"?"Publishing the current lineup and strategy for AI…":"Saving the shared captain draft…");
    try{
      if(status==="published"&&window.SKORNotebook?.reviewPlayerNames){
        const review=await window.SKORNotebook.reviewPlayerNames(strategyNameCheckText());
        if(!review?.ok)throw new Error("Publishing paused so player names can be clarified.");
        applyStrategyNameReplacements(review.replacements||[]);
      }
      const {data:userData,error:userError}=await sb().auth.getUser();
      if(userError||!userData?.user)throw new Error(userError?.message||"Captain login required.");
      const payload=sharedPayload(status,userData.user.id);
      let result;
      if(sharedRecord?.id)result=await sb().from(STRATEGY_TABLE).update(payload).eq("id",sharedRecord.id).select().single();
      else result=await sb().from(STRATEGY_TABLE).insert({...payload,created_by:userData.user.id}).select().single();
      if(result.error)throw result.error;
      sharedRecord=result.data;persist();
      window.dispatchEvent(new CustomEvent("skor:strategy-saved",{detail:{matchId:draft.source.matchId,status}}));
      await window.SKORNotebook?.refresh?.({quiet:true});
      setSharedStatus(status==="published"?"Published for AI. The lineup, bench, substitution plan, tactical scenes, opponent shape and coaching points are now approved AI context.":"Shared captain draft saved. It remains excluded from AI until published.",status==="published"?"published":"");
    }catch(error){setSharedStatus("Could not save the shared strategy: "+(error.message||error),"error");}
    finally{sharedLoading=false;updateSharedControls();}
  }

  function importLineup(){
    const source=selectedSource();
    const home=playersFromLineup(source.state,source.roster);
    if(!home.length&&!confirm("This lineup does not have any players on the field yet. Start a blank strategy anyway?"))return;
    draft=freshDraft(source);
    renderAll();persist();
    const state=$("strategySaveState");if(state)state.textContent="Started from "+source.label+" · saved locally";
    refreshSharedStatus();
  }
  function resetActivePlayers(){
    const scene=activeScene();if(!scene||!draft?.source)return;
    scene.home=playersFromLineup(draft.source.state,draft.source.roster);
    if(draft.opponentFormation!=="Custom / Freeform")scene.opponents=formationPositions(draft.opponentFormation,true);
    scene.ball={x:50,y:scene.type==="defense"?58:43};
    renderPitch();queuePersist();
  }

  function renderScenes(){
    const root=$("strategyScenes");if(!root||!draft)return;
    root.innerHTML=draft.scenes.map((scene,index)=>'<button class="strategy-scene-tab '+(scene.id===draft.activeSceneId?'active':'')+'" type="button" role="tab" aria-selected="'+(scene.id===draft.activeSceneId)+'" data-scene="'+esc(scene.id)+'" data-type="'+esc(scene.type)+'"><span></span>'+(index+1)+'. '+esc(scene.name)+'</button>').join("");
    root.querySelectorAll("[data-scene]").forEach(button=>button.addEventListener("click",()=>{draft.activeSceneId=button.dataset.scene;renderAll();queuePersist();}));
  }
  function renderInputs(){
    const scene=activeScene();if(!scene||!draft)return;
    $("strategyTitle").value=draft.title;
    $("strategySceneTitle").value=scene.name;
    $("strategySceneTypeSelect").value=scene.type;
    $("strategyCoachingPoints").value=scene.points;
    $("strategyOpponentFormation").value=draft.opponentFormation;
    $("strategyShowLanes").checked=draft.showLanes;
    $("strategySceneType").textContent=TYPE_LABELS[scene.type];
    $("strategySceneName").textContent=scene.name;
  }
  function setTool(tool){
    activeTool=tool;
    document.querySelectorAll("[data-strategy-tool]").forEach(button=>button.classList.toggle("active",button.dataset.strategyTool===tool));
    const pitch=$("strategyPitch");if(pitch)pitch.dataset.tool=tool;
    const messages={move:"Drag SKOR players, opponent placeholders, and the ball into position.",arrow:"Drag from a starting point to show a run, pass, or press.",line:"Drag to add a movement or shape line.",box:"Drag around an area to highlight a coaching zone.",text:"Tap the pitch to add a short coaching label."};
    if($("strategyBoardTip"))$("strategyBoardTip").textContent=messages[tool]||messages.move;
  }

  function lineMarkup(item,preview=false){
    const x1=item.x1*10,y1=item.y1*6.8,x2=item.x2*10,y2=item.y2*6.8;
    if(item.type==="box"){
      const x=Math.min(x1,x2),y=Math.min(y1,y2),w=Math.abs(x2-x1),h=Math.abs(y2-y1);
      return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="12" fill="rgba(255,196,51,.13)" stroke="#ffd65a" stroke-width="5" stroke-dasharray="12 8"'+(preview?' opacity=".7"':'')+'/>';
    }
    const marker=item.type==="arrow"?' marker-end="url(#strategyArrow)"':'';
    return '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="#ffd65a" stroke-width="7" stroke-linecap="round"'+marker+(preview?' opacity=".72"':'')+'/>';
  }
  function baseSvg(showLanes=true,exportMode=false){
    let lanes="";
    if(showLanes){
      const labels=["Wide","Half-space","Center","Half-space","Wide"];
      for(let i=0;i<5;i++)lanes+='<rect x="'+(26+i*189.6)+'" y="26" width="189.6" height="628" fill="'+(i%2?'rgba(255,255,255,.035)':'rgba(0,0,0,.035)')+'"/><text x="'+(120.8+i*189.6)+'" y="48" text-anchor="middle" fill="rgba(255,255,255,.48)" font-size="14" font-weight="800" letter-spacing="1.2">'+labels[i].toUpperCase()+'</text>';
    }
    return '<defs><marker id="strategyArrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,8 L9,4 z" fill="#ffd65a"/></marker><filter id="strategyShadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity=".3"/></filter></defs>'+
      '<rect width="1000" height="680" rx="'+(exportMode?0:10)+'" fill="#39784e"/>'+lanes+
      '<g fill="none" stroke="rgba(255,255,255,.78)" stroke-width="3"><rect x="26" y="26" width="948" height="628"/><line x1="26" y1="340" x2="974" y2="340"/><circle cx="500" cy="340" r="78"/><circle cx="500" cy="340" r="4" fill="white"/><rect x="310" y="26" width="380" height="102"/><rect x="400" y="26" width="200" height="42"/><rect x="310" y="552" width="380" height="102"/><rect x="400" y="612" width="200" height="42"/><path d="M445 128 A78 78 0 0 0 555 128"/><path d="M445 552 A78 78 0 0 1 555 552"/></g>';
  }
  function homeMarkup(player){
    const x=player.x*10,y=player.y*6.8;
    return '<g class="strategy-svg-home strategy-player-shadow" data-kind="home" data-id="'+esc(player.id)+'" transform="translate('+x+' '+y+')" filter="url(#strategyShadow)"><circle r="29" fill="#741f35" stroke="#fff" stroke-width="4"/><text y="5" text-anchor="middle" fill="#fff" font-size="19" font-weight="950">'+esc(player.number)+'</text><rect x="-39" y="32" width="78" height="24" rx="12" fill="#17181d" opacity=".94"/><text y="49" text-anchor="middle" fill="#fff" font-size="14" font-weight="850">'+esc(player.name)+'</text></g>';
  }
  function awayMarkup(player,index){
    const x=player.x*10,y=player.y*6.8;
    return '<g class="strategy-svg-away strategy-player-shadow" data-kind="opponent" data-id="'+esc(player.id)+'" transform="translate('+x+' '+y+')" filter="url(#strategyShadow)"><circle r="25" fill="#f7f5f1" stroke="#414650" stroke-width="4"/><text y="5" text-anchor="middle" fill="#343841" font-size="14" font-weight="950">'+esc(player.label||"O"+(index+1))+'</text></g>';
  }
  function ballMarkup(ball){
    return '<g class="strategy-svg-ball" data-kind="ball" data-id="ball" transform="translate('+(ball.x*10)+' '+(ball.y*6.8)+')" filter="url(#strategyShadow)"><circle r="13" fill="#fff" stroke="#17181d" stroke-width="3"/><circle r="4" fill="#17181d"/></g>';
  }
  function pitchMarkup(scene,options={}){
    if(!scene)return baseSvg(false);
    const exportMode=!!options.exportMode;
    let out=baseSvg(draft?.showLanes!==false,exportMode);
    out+='<g class="strategy-drawings">'+(scene.drawings||[]).map(item=>item.type==="text"?'<g><rect x="'+(item.x*10-6)+'" y="'+(item.y*6.8-23)+'" width="'+Math.max(72,String(item.text||"").length*14)+'" height="34" rx="8" fill="rgba(18,19,23,.82)"/><text x="'+(item.x*10+8)+'" y="'+(item.y*6.8)+'" fill="#fff" font-size="20" font-weight="850">'+esc(item.text)+'</text></g>':lineMarkup(item)).join("")+'</g>';
    if(interaction?.drawing&&!exportMode)out+=lineMarkup(interaction.drawing,true);
    out+='<g class="strategy-away-team">'+(scene.opponents||[]).map(awayMarkup).join("")+'</g>';
    out+='<g class="strategy-home-team">'+(scene.home||[]).map(homeMarkup).join("")+'</g>'+ballMarkup(scene.ball||{x:50,y:50});
    return out;
  }
  function wrapWords(value,max=78,limit=2){
    const words=String(value||"").trim().split(/\s+/).filter(Boolean),lines=[];let line="";
    words.forEach(word=>{const next=(line+" "+word).trim();if(next.length>max&&line){if(lines.length<limit)lines.push(line);line=word;}else line=next;});
    if(line&&lines.length<limit)lines.push(line);
    if(lines.length===limit&&words.join(" ").length>lines.join(" ").length)lines[limit-1]=lines[limit-1].replace(/[.…]*$/,"…");
    return lines;
  }
  function exportSvgMarkup(scene){
    const title=esc(draft?.title||"Match Strategy"),sceneName=esc(scene?.name||"Scene"),source=esc(draft?.source?.eventLabel||draft?.source?.label||"");
    const pointLines=wrapWords(scene?.points||"",88,2);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1190" viewBox="0 0 1000 850">'+
      '<rect width="1000" height="850" fill="#15161a"/><rect x="0" y="0" width="1000" height="80" fill="#17181d"/>'+
      '<text x="30" y="35" fill="#e9b8c6" font-size="14" font-weight="900" letter-spacing="1.5">'+esc(TYPE_LABELS[scene?.type]||"STRATEGY")+'</text><text x="30" y="62" fill="#fff" font-size="26" font-weight="950">'+title+' · '+sceneName+'</text>'+
      '<text x="970" y="48" text-anchor="end" fill="#d9d3d5" font-size="15" font-weight="750">'+source+'</text><g transform="translate(0 80)">'+pitchMarkup(scene,{exportMode:true})+'</g>'+
      '<rect x="0" y="760" width="1000" height="90" fill="#17181d"/><text x="30" y="786" fill="#e9b8c6" font-size="12" font-weight="900" letter-spacing="1.3">COACHING POINTS</text>'+
      pointLines.map((line,index)=>'<text x="30" y="'+(811+index*23)+'" fill="#fff" font-size="17" font-weight="700">'+esc(line)+'</text>').join("")+
      '<text x="970" y="820" text-anchor="end" fill="#e9b8c6" font-size="17" font-weight="950">SKOR FC</text></svg>';
  }
  function renderPitch(){const scene=activeScene(),pitch=$("strategyPitch");if(!scene||!pitch)return;pitch.innerHTML=pitchMarkup(scene);pitch.dataset.tool=activeTool;}
  function renderAll(){if(!draft)return;renderScenes();renderInputs();renderPitch();setTool(activeTool);}

  function pointFromEvent(event){
    const svg=$("strategyPitch"),rect=svg.getBoundingClientRect();
    return {x:clamp((event.clientX-rect.left)/rect.width*100,2.8,97.2),y:clamp((event.clientY-rect.top)/rect.height*100,3.8,96.2)};
  }
  function findPiece(scene,kind,id){
    if(kind==="ball")return scene.ball;
    const list=kind==="home"?scene.home:scene.opponents;
    return list.find(item=>String(item.id)===String(id));
  }
  function pointerDown(event){
    const scene=activeScene();if(!scene)return;
    const point=pointFromEvent(event);
    const piece=event.target.closest?.("[data-kind]");
    if(activeTool==="move"&&piece){
      interaction={kind:"drag",pieceKind:piece.dataset.kind,pieceId:piece.dataset.id};
      $("strategyPitch").setPointerCapture?.(event.pointerId);event.preventDefault();return;
    }
    if(["arrow","line","box"].includes(activeTool)&&!piece){
      interaction={kind:"draw",drawing:{type:activeTool,x1:point.x,y1:point.y,x2:point.x,y2:point.y}};
      $("strategyPitch").setPointerCapture?.(event.pointerId);event.preventDefault();return;
    }
    if(activeTool==="text"&&!piece){
      const label=prompt("Short coaching label (for example: Press together)","");
      if(label?.trim()){scene.drawings.push({type:"text",x:point.x,y:point.y,text:label.trim().slice(0,40)});renderPitch();queuePersist();}
    }
  }
  function pointerMove(event){
    if(!interaction)return;
    const scene=activeScene(),point=pointFromEvent(event);if(!scene)return;
    if(interaction.kind==="drag"){
      const piece=findPiece(scene,interaction.pieceKind,interaction.pieceId);if(!piece)return;
      if(interaction.pieceKind==="opponent"&&draft.opponentFormation!=="Custom / Freeform"){
        draft.opponentFormation="Custom / Freeform";
        $("strategyOpponentFormation").value=draft.opponentFormation;
      }
      piece.x=point.x;piece.y=point.y;renderPitch();
    }else if(interaction.kind==="draw"){
      interaction.drawing.x2=point.x;interaction.drawing.y2=point.y;renderPitch();
    }
    event.preventDefault();
  }
  function pointerUp(){
    const scene=activeScene();if(!interaction||!scene)return;
    if(interaction.kind==="draw"){
      const item=interaction.drawing;
      if(Math.hypot(item.x2-item.x1,item.y2-item.y1)>2)scene.drawings.push(item);
    }
    interaction=null;renderPitch();queuePersist();
  }
  function changeOpponentFormation(){
    if(!draft)return;
    draft.opponentFormation=$("strategyOpponentFormation").value;
    if(draft.opponentFormation!=="Custom / Freeform")draft.scenes.forEach(scene=>{scene.opponents=formationPositions(draft.opponentFormation,true);});
    renderPitch();queuePersist();
  }
  function addScene(){
    const scene=activeScene(),copy=clone(scene||makeScene({name:"New Scene",type:"offense"},0,[],draft.opponentFormation));
    copy.id=uid("scene");copy.name="Scene "+(draft.scenes.length+1);copy.drawings=[];draft.scenes.push(copy);draft.activeSceneId=copy.id;renderAll();queuePersist();
  }
  function duplicateScene(){
    const scene=activeScene();if(!scene)return;
    const copy=clone(scene);copy.id=uid("scene");copy.name=(scene.name+" Copy").slice(0,50);draft.scenes.splice(draft.scenes.indexOf(scene)+1,0,copy);draft.activeSceneId=copy.id;renderAll();queuePersist();
  }
  function deleteScene(){
    if(draft.scenes.length===1){alert("Keep at least one strategy scene.");return;}
    const scene=activeScene();if(!confirm('Delete the scene "'+scene.name+'"?'))return;
    const index=draft.scenes.indexOf(scene);draft.scenes.splice(index,1);draft.activeSceneId=draft.scenes[Math.max(0,index-1)].id;renderAll();queuePersist();
  }
  function exportPng(){
    const scene=activeScene();if(!scene)return;
    const svg=exportSvgMarkup(scene);
    const blob=new Blob([svg],{type:"image/svg+xml;charset=utf-8"});
    const url=URL.createObjectURL(blob),image=new Image();
    image.onload=()=>{
      const canvas=document.createElement("canvas");canvas.width=1400;canvas.height=1190;
      const ctx=canvas.getContext("2d");ctx.drawImage(image,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);
      canvas.toBlob(file=>{if(!file)return;const link=document.createElement("a");link.href=URL.createObjectURL(file);link.download=(draft.title+"-"+scene.name).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+".png";link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1500);},"image/png");
    };
    image.onerror=()=>{URL.revokeObjectURL(url);alert("Could not create the strategy image. Please try again.");};
    image.src=url;
  }

  function bind(){
    $("strategyImportLineup").addEventListener("click",importLineup);
    $("strategyOpponentFormation").addEventListener("change",changeOpponentFormation);
    $("strategyShowLanes").addEventListener("change",event=>{draft.showLanes=event.target.checked;renderPitch();queuePersist();});
    document.querySelectorAll("[data-strategy-tool]").forEach(button=>button.addEventListener("click",()=>setTool(button.dataset.strategyTool)));
    $("strategyPitch").addEventListener("pointerdown",pointerDown);$("strategyPitch").addEventListener("pointermove",pointerMove);$("strategyPitch").addEventListener("pointerup",pointerUp);$("strategyPitch").addEventListener("pointercancel",pointerUp);
    $("strategyUndo").addEventListener("click",()=>{const scene=activeScene();if(scene?.drawings.length){scene.drawings.pop();renderPitch();queuePersist();}});
    $("strategyClearMarks").addEventListener("click",()=>{const scene=activeScene();if(scene?.drawings.length&&confirm("Clear all coaching marks from this scene?")){scene.drawings=[];renderPitch();queuePersist();}});
    $("strategyAddScene").addEventListener("click",addScene);$("strategyDuplicateScene").addEventListener("click",duplicateScene);$("strategyDeleteScene").addEventListener("click",deleteScene);
    $("strategyTitle").addEventListener("input",event=>{draft.title=event.target.value.slice(0,70);queuePersist();});
    $("strategySceneTitle").addEventListener("input",event=>{const scene=activeScene();scene.name=event.target.value.slice(0,50)||"Untitled Scene";$("strategySceneName").textContent=scene.name;renderScenes();queuePersist();});
    $("strategySceneTypeSelect").addEventListener("change",event=>{const scene=activeScene();scene.type=event.target.value;$("strategySceneType").textContent=TYPE_LABELS[scene.type];renderScenes();queuePersist();});
    $("strategyCoachingPoints").addEventListener("input",event=>{activeScene().points=event.target.value.slice(0,600);queuePersist();});
    $("strategyResetScene").addEventListener("click",()=>{if(confirm("Reset player and opponent positions from the source lineup? Your coaching marks will stay."))resetActivePlayers();});
    $("strategyLoadShared").addEventListener("click",loadSharedStrategy);
    $("strategySaveShared").addEventListener("click",()=>saveSharedStrategy("draft"));
    $("strategyPublishAi").addEventListener("click",()=>saveSharedStrategy("published"));
    $("strategyExportPng").addEventListener("click",exportPng);
  }
  function init(){
    if(initialized){refreshSources();return;}
    if(!$("strategyPitch"))return;
    initialized=true;refreshSources();
    draft=loadLocal()||freshDraft(currentSource());
    bind();renderAll();persist();refreshSharedStatus();
  }
  function activate(){init();refreshSources();renderAll();refreshSharedStatus();}

  window.SKORStrategy={init,activate,refreshSources,refreshSharedStatus,loadForMatch,getDraft:()=>clone(draft),renderExportSvg:()=>exportSvgMarkup(activeScene())};
})();
