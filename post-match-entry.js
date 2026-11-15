/* Post-match drafts retain official event IDs; only reviewed differences are saved. */
(function(global){
  'use strict';
  const halves=['first','second','extra_first','extra_second'];
  const halfLabel=half=>({first:'1st Half',second:'2nd Half',extra_first:'Overtime · 1st Half',extra_second:'Overtime · 2nd Half'})[half]||half;
  const kinds=['skor_goal','skor_yellow_card','skor_red_card','opponent_goal'];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const makeId=()=>global.crypto.randomUUID();
  function row(event){
    const legacy=event.event_type==='skor_goal'&&!event.assist_roster_player_key&&!!(event.assist_player_name||event.assist_player_number);
    return {id:event.id,event_type:event.event_type,half:event.half,player_key:event.event_type==='opponent_goal'?null:event.roster_player_key,
      assist_key:event.event_type==='skor_goal'?(event.assist_roster_player_key||null):null,
      assist_status:event.event_type==='skor_goal'?(legacy?'legacy':event.assist_roster_player_key?'known':event.assist_status==='unknown'?'unknown':'none'):null};
  }
  function createDraft(snapshot){
    if(!snapshot?.match?.id||!snapshot.revision||!Array.isArray(snapshot.events)||!Array.isArray(snapshot.participants))throw Error('Post-match response is incomplete.');
    const people=new Map(snapshot.participants.map(p=>[p.player_key,p]));
    if(people.size!==snapshot.participants.length||snapshot.events.length>2000)throw Error('Post-match response is invalid.');
    const managed=snapshot.events.filter(e=>kinds.includes(e.event_type)&&halves.includes(e.half)&&(e.event_type==='opponent_goal'||people.has(e.roster_player_key)));
    const rows=managed.map(e=>{const r=row(e);if(r.assist_key&&!people.has(r.assist_key)){r.assist_key=null;r.assist_status='legacy';}return r;}),ids=new Set(rows.map(e=>e.id));
    if(ids.size!==rows.length)throw Error('Duplicate official event IDs.');
    return {snapshot,people,base:new Map(rows.map(e=>[e.id,{...e}])),rows,kept:snapshot.events.filter(e=>!ids.has(e.id)),
      goalRecycle:new Map(),selected:Object.fromEntries(halves.map(h=>[h,new Set()])),includeExtra:snapshot.events.some(e=>String(e.half||'').startsWith('extra_')),markFinal:true,cache:null};
  }
  function setCount(draft,half,key,type,count,id=makeId){
    const max=type==='skor_yellow_card'?2:type==='skor_red_card'?1:30,priorCount=draft.rows.filter(e=>e.half===half&&e.player_key===(type==='opponent_goal'?null:key)&&e.event_type===type).length;
    if(!halves.includes(half)||!kinds.includes(type)||!Number.isInteger(count)||count<0||count>max&&count>=priorCount||type!=='opponent_goal'&&!draft.people.has(key))throw Error('Check player, half and event count.');
    key=type==='opponent_goal'?null:key;
    const list=draft.rows.filter(e=>e.half===half&&e.player_key===key&&e.event_type===type);
    if(count<list.length){
      const remove=[...list].reverse().sort((a,b)=>Number(draft.base.has(a.id))-Number(draft.base.has(b.id))).slice(0,list.length-count);
      const ids=new Set(remove.map(e=>e.id));draft.rows=draft.rows.filter(e=>!ids.has(e.id));
    }else for(let i=list.length;i<count;i++)draft.rows.push({id:id(),half,event_type:type,player_key:key,assist_key:null,assist_status:type==='skor_goal'?'unknown':null});
    if(key)draft.selected[half].add(key);
  }
  function goalCounts(draft,half){
    const editable=draft.rows.filter(e=>e.half===half&&e.event_type==='skor_goal');
    const kept=draft.kept.filter(e=>e.half===half&&e.event_type==='skor_goal');
    return {editable,kept,total:editable.length+kept.length};
  }
  function setGoalCount(draft,half,count,id=makeId){
    if(!halves.includes(half)||!Number.isInteger(count))throw Error('Check the half and goal count.');
    const {editable,kept,total}=goalCounts(draft,half);
    if(count<kept.length||count>30&&count>=total)throw Error('Keep protected historical goals; add at most 30 goals per period.');
    const target=count-kept.length;
    if(target<editable.length){
      const remove=[...editable].reverse().sort((a,b)=>Number(draft.base.has(a.id))-Number(draft.base.has(b.id))).slice(0,editable.length-target);
      const ids=new Set(remove.map(e=>e.id));for(const event of remove){draft.goalRecycle.delete(event.id);draft.goalRecycle.set(event.id,{...event});}draft.rows=draft.rows.filter(e=>!ids.has(e.id));
    }else{
      const present=new Set(draft.rows.map(e=>e.id));
      const restore=[...draft.goalRecycle.values()].reverse().filter(e=>e.half===half&&!present.has(e.id)),seen=new Set(restore.map(e=>e.id));
      for(const e of draft.base.values())if(e.half===half&&e.event_type==='skor_goal'&&!present.has(e.id)&&!seen.has(e.id)){restore.push(e);seen.add(e.id);}
      for(let n=editable.length;n<target;n++){const event=restore.length?{...restore.shift()}:{id:id(),half,event_type:'skor_goal',player_key:null,assist_key:null,assist_status:'unknown'};draft.rows.push(event);draft.goalRecycle.delete(event.id);}
    }
  }
  function setScorer(draft,id,key){
    const event=draft.rows.find(e=>e.id===id&&e.event_type==='skor_goal');
    if(!event||!draft.people.has(key))throw Error('Choose a scorer from this match’s players.');
    if(event.assist_key===key)throw Error('The scorer cannot also be the assister. Change the assister first.');
    if(event.assist_status==='legacy'&&event.player_key!==key)throw Error('Review the recorded manual assist before changing this scorer.');
    event.player_key=key;
  }
  function removeGoal(draft,id){
    const event=draft.rows.find(e=>e.id===id&&e.event_type==='skor_goal');
    if(!event)throw Error('This historical goal needs its individual event-log Edit action.');
    draft.goalRecycle.delete(event.id);draft.goalRecycle.set(event.id,{...event});draft.rows=draft.rows.filter(e=>e.id!==id);
  }
  const missingScorers=draft=>draft.rows.filter(e=>e.event_type==='skor_goal'&&!draft.people.has(e.player_key));
  function setAssist(draft,id,value){
    const event=draft.rows.find(e=>e.id===id);if(!event||event.event_type!=='skor_goal')throw Error('Goal not found.');
    if(value==='legacy'&&draft.base.get(id)?.assist_status==='legacy'){Object.assign(event,{assist_key:null,assist_status:'legacy'});return;}
    if(['none','unknown'].includes(value)){Object.assign(event,{assist_key:null,assist_status:value});return;}
    if(!draft.people.has(value)||value===event.player_key)throw Error('Choose another valid player for the assist.');
    Object.assign(event,{assist_key:value,assist_status:'known'});
  }
  function changes(draft){
    const upserts=draft.rows.filter(e=>!draft.base.has(e.id)||JSON.stringify(e)!==JSON.stringify(draft.base.get(e.id)));
    const ids=new Set(draft.rows.map(e=>e.id)),deleted=[...draft.base.keys()].filter(id=>!ids.has(id));
    if(upserts.some(e=>e.assist_status==='legacy'))throw Error('Review the recorded manual assist before changing this goal.');
    return {upserts,deleted,added:upserts.filter(e=>!draft.base.has(e.id)).length,updated:upserts.filter(e=>draft.base.has(e.id)).length};
  }
  function totals(draft,half=null){
    const events=[...draft.rows,...draft.kept].filter(e=>!half||e.half===half);
    return {skor:events.filter(e=>['skor_goal','opponent_own_goal'].includes(e.event_type)).length,
      opponent:events.filter(e=>['opponent_goal','skor_own_goal'].includes(e.event_type)).length,
      goals:events.filter(e=>e.event_type==='skor_goal').length,
      assists:events.filter(e=>e.event_type==='skor_goal'&&(e.assist_key||e.assist_roster_player_key)).length,
      unknown:events.filter(e=>e.event_type==='skor_goal'&&e.assist_status==='unknown').length,
      yellow:events.filter(e=>['skor_yellow_card','opponent_yellow_card'].includes(e.event_type)).length,
      red:events.filter(e=>['skor_red_card','opponent_red_card'].includes(e.event_type)).length};
  }
  function submission(draft,id=makeId){
    if(missingScorers(draft).length)throw Error('Choose a scorer for every SKOR goal before saving.');
    const c=changes(draft);if(c.upserts.length+c.deleted.length>200)throw Error('Save at most 200 event changes at once.');const body={p_match_id:draft.snapshot.match.id,p_revision:draft.snapshot.revision,p_upserts:c.upserts,p_delete_ids:c.deleted,p_mark_final:draft.markFinal};
    const signature=JSON.stringify(body);if(draft.cache?.signature!==signature)draft.cache={signature,id:id()};
    return {...body,p_request_id:draft.cache.id};
  }
  function createController({client,getContext,onState=()=>{},onSaved=()=>{},id=makeId}){
    let generation=0,owner=null,matchId=null,draft=null,phase='idle',message='',busy=false;
    const state=()=>({owner,matchId,draft,phase,message,busy}),emit=()=>onState(state());
    function clear(){generation++;owner=null;matchId=null;draft=null;busy=false;phase='idle';message='';emit();}
    function contextChanged(){const c=getContext();if(owner&&(!c.canUse||c.userId!==owner||c.matchId!==matchId))clear();}
    async function valid(epoch){const c=getContext(),r=await client.auth.getSession();return epoch===generation&&c.canUse&&c.userId===owner&&c.matchId===matchId&&!r.error&&r.data?.session?.user?.id===owner;}
    async function open(){
      if(busy)return false;clear();const c=getContext();if(!c.canUse||!c.userId||!c.matchId){message='Choose a match with captain access.';phase='error';emit();return false;}
      owner=c.userId;matchId=c.matchId;phase='loading';const epoch=generation;emit();
      try{if(!await valid(epoch)){if(epoch===generation)clear();return false;}
        const r=await client.rpc('get_post_match_editor',{p_match_id:matchId});if(!await valid(epoch)){if(epoch===generation)clear();return false;}if(r.error)throw r.error;
        if(Date.parse(r.data?.match?.kickoff)>Date.now())throw Error('Choose a past-kickoff match for post-match entry.');draft=createDraft(r.data);phase='ready';emit();return true;
      }catch(e){if(epoch===generation){message=e.message||'Could not load post-match events.';phase='error';emit();}return false;}
    }
    async function save(){
      if(busy||!draft||!['ready','error'].includes(phase))return false;
      const epoch=generation;busy=true;message='';emit();
      try{const body=submission(draft,id);if(!await valid(epoch)){if(epoch===generation)clear();return false;}
        const r=await client.rpc('save_post_match_events',body);if(!await valid(epoch)){if(epoch===generation)clear();return false;}if(r.error)throw r.error;if(r.data?.ok!==true)throw Error('Save could not be verified. Retry unchanged to check this submission.');
        phase='saved';busy=false;message='Saved. The selected periods are in the official event log.';emit();
        try{await onSaved(matchId,r.data);}catch(e){if(epoch===generation){message='Events were saved. Refresh Game Day to reload the results.';emit();}}
        return true;
      }catch(e){if(epoch===generation){phase=['40001','40P01'].includes(e.code)?'conflict':'error';message=phase==='conflict'?'Match changed. Reload and review before saving.':e.message||'Save failed. Retry unchanged to avoid duplicates.';if(e.code==='42501')draft=null;emit();}return false;
      }finally{if(epoch===generation){busy=false;emit();}}
    }
    async function continueEditing(){
      if(busy||phase!=='saved')return false;
      const selected=Object.fromEntries(halves.map(h=>[h,[...draft.selected[h]]]));
      if(!await open())return false;
      for(const half of halves)for(const key of selected[half])if(draft.people.has(key))draft.selected[half].add(key);
      message='Saved events loaded. Add more goals or cards, then save again.';emit();return true;
    }
    return {state,open,save,continueEditing,clear,contextChanged};
  }
  function mount({client,getContext,onSaved=()=>{},shootoutEditor=null,doc=global.document,win=global}){
    const dialog=doc.getElementById('postMatchDialog'),root=doc.getElementById('postMatchBody'),button=doc.getElementById('openPostMatch');
    let current=null;const expanded=new Set(['first']),cardsExpanded=new Set();
    const label=p=>`${p.number==null?'Jersey TBD':'#'+p.number} ${p.name}${p.is_temp?' · TEMP':''}`;
    function stepper(half,key,type,count,max){return `<div class="pm-stepper"><button type="button" data-pm="count" data-half="${half}" data-player="${esc(key||'')}" data-type="${type}" data-value="${count-1}" data-pm-delta="-1" aria-label="Remove one ${type.replaceAll('_',' ')}" ${count<=0?'disabled':''}>−</button><output>${count}</output><button type="button" data-pm="count" data-half="${half}" data-player="${esc(key||'')}" data-type="${type}" data-value="${count+1}" data-pm-delta="1" aria-label="Add one ${type.replaceAll('_',' ')}" ${count>=max?'disabled':''}>+</button></div>`;}
    function goalCounter(d,half){
      const {total,kept}=goalCounts(d,half);
      return `<div class="pm-stepper"><button type="button" data-pm="goals" data-half="${half}" data-value="${total-1}" data-pm-delta="-1" aria-label="Remove one SKOR goal" ${total<=kept.length?'disabled':''}>−</button><output>${total}</output><button type="button" data-pm="goals" data-half="${half}" data-value="${total+1}" data-pm-delta="1" aria-label="Add one SKOR goal" ${total>=30?'disabled':''}>+</button></div>`;
    }
    function goalCard(d,goal,index){
      const choices=[...d.people.values()];
      const scorerOptions='<option value="">Choose scorer…</option>'+choices.map(p=>`<option value="${esc(p.player_key)}" ${goal.player_key===p.player_key?'selected':''}>${esc(label(p))}</option>`).join('');
      const assistOptions=`<option value="unknown" ${goal.assist_status==='unknown'?'selected':''}>Unknown / not recorded</option><option value="none" ${goal.assist_status==='none'?'selected':''}>No assist</option>${goal.assist_status==='legacy'?'<option value="legacy" selected>Recorded manual assist (kept)</option>':''}`+choices.filter(p=>p.player_key!==goal.player_key).map(p=>`<option value="${esc(p.player_key)}" ${goal.assist_key===p.player_key?'selected':''}>${esc(label(p))}</option>`).join('');
      const pending=!d.people.has(goal.player_key);
      return `<article class="pm-goal" data-pm-goal="${esc(goal.id)}"><div class="pm-goal-head"><h4>Goal ${index+1}</h4><button type="button" data-pm="remove-goal" data-goal="${esc(goal.id)}" aria-label="Remove goal ${index+1}">Remove</button></div><div class="pm-goal-fields"><label>Scorer<select data-pm-scorer="${esc(goal.id)}" required aria-invalid="${pending}">${scorerOptions}</select></label><label>Assister<select data-pm-assist="${esc(goal.id)}" ${pending?'disabled':''}>${assistOptions}</select></label></div>${pending?'<small class="pm-goal-pending">Choose this goal’s scorer before saving.</small>':''}</article>`;
    }
    function keptGoalCard(goal,index){
      const short=v=>String(v||'').trim().split(/\s+/)[0]||'Not recorded';
      return `<article class="pm-goal pm-goal-kept"><h4>Goal ${index+1} · Existing historical entry</h4><div class="pm-goal-fields"><label>Scorer<select disabled><option>${esc(short(goal.player_name))}</option></select></label><label>Assister<select disabled><option>${esc(goal.assist_player_name?short(goal.assist_player_name):goal.assist_status==='none'?'No assist':'Unknown / not recorded')}</option></select></label></div><small>Kept in the score. Use this event’s individual Edit action to correct its recorded identity.</small></article>`;
    }
    function cardPlayer(d,half,key){
      const p=d.people.get(key),events=d.rows.filter(e=>e.half===half&&e.player_key===key);
      return `<article class="pm-player"><h4>${esc(label(p))}</h4><div class="pm-row"><span><i class="pm-yellow" aria-hidden="true"></i> Yellow cards</span>${stepper(half,key,'skor_yellow_card',events.filter(e=>e.event_type==='skor_yellow_card').length,2)}</div><div class="pm-row"><span><i class="pm-red" aria-hidden="true"></i> Red cards</span>${stepper(half,key,'skor_red_card',events.filter(e=>e.event_type==='skor_red_card').length,1)}</div></article>`;
    }
    function halfSection(d,half){
      const t=totals(d,half),ownSkor=d.kept.filter(e=>e.half===half&&e.event_type==='opponent_own_goal').length,ownOpponent=d.kept.filter(e=>e.half===half&&e.event_type==='skor_own_goal').length,halfScore=d.snapshot.match.home_team==='SKOR FC'?`${t.skor}–${t.opponent}`:`${t.opponent}–${t.skor}`;
      const cards=d.rows.filter(e=>e.half===half&&['skor_yellow_card','skor_red_card'].includes(e.event_type)),keys=new Set([...d.selected[half],...cards.map(e=>e.player_key)].filter(k=>d.people.has(k)));
      const goals=goalCounts(d,half);
      return `<details class="pm-half" data-pm-half="${half}" ${expanded.has(half)?'open':''}><summary><span>${halfLabel(half)}<small>${t.goals} goals · ${t.assists} assists · ${t.yellow} yellow · ${t.red} red</small></span><b class="pm-score">${halfScore}</b></summary><div class="pm-half-body"><div class="pm-row pm-skor-goals"><strong>SKOR goals</strong>${goalCounter(d,half)}</div><div class="pm-row pm-opponent"><strong>Opponent goals</strong>${stepper(half,null,'opponent_goal',d.rows.filter(e=>e.half===half&&e.event_type==='opponent_goal').length,30)}</div>${ownSkor||ownOpponent?`<p>Own goals already kept: SKOR +${ownSkor} · Opponent +${ownOpponent}. The counters cover other goals.</p>`:''}${goals.editable.map((g,i)=>goalCard(d,g,i)).join('')}${goals.kept.map((g,i)=>keptGoalCard(g,goals.editable.length+i)).join('')}<details class="pm-cards" data-pm-cards="${half}" ${cardsExpanded.has(half)?'open':''}><summary>SKOR cards <small>${cards.filter(e=>e.event_type==='skor_yellow_card').length} yellow · ${cards.filter(e=>e.event_type==='skor_red_card').length} red</small></summary><label class="pm-add">Add card for<select data-pm-card-player="${half}"><option value="">Choose player for a card…</option>${[...d.people.values()].filter(p=>!keys.has(p.player_key)).map(p=>`<option value="${esc(p.player_key)}">${esc(label(p))}</option>`).join('')}</select></label>${[...keys].map(key=>cardPlayer(d,half,key)).join('')}</details></div></details>`;
    }
    function render(state){
      shootoutEditor?.detach?.();
      current=state;const close=dialog.querySelector?.('[data-pm=close]');if(close)close.disabled=state.busy||!!shootoutEditor?.isBusy?.();
      if(state.phase==='idle'){if(dialog.open)dialog.close();return;}
      if(!dialog.open)dialog.showModal();
      if(!state.draft){root.innerHTML=`<p role="status">${esc(state.message||'Loading official events…')}</p><button type="button" data-pm="reload">Reload</button>`;return;}
      const d=state.draft,t=totals(d),c=changes(d),m=d.snapshot.match,overLimit=c.upserts.length+c.deleted.length>200,incomplete=missingScorers(d).length,disabled=state.busy||!!shootoutEditor?.isBusy?.()||['conflict','saved'].includes(state.phase);
      if(!d.shootoutTouched)d.includeShootout=!!shootoutEditor?.state?.()?.shots?.length||m.status==='shootout';
      const home=m.home_team==='SKOR FC'?t.skor:t.opponent,away=m.home_team==='SKOR FC'?t.opponent:t.skor;
      root.innerHTML=`<p class="pm-match">${esc(m.home_team)} vs ${esc(m.away_team)}</p><p>Enter match goals and cards by period. No clock needed.</p><div class="pm-notice">Existing events are included below. New entries have no recorded minute.</div>${d.kept.length?`<details class="pm-kept"><summary>${d.kept.length} other existing events kept</summary><p>Manual player entries, own goals, fouls and opponent cards remain in the log and score. Use their individual Edit action to correct them.</p>${d.kept.map(e=>`<p>${esc(halfLabel(e.half))} · ${esc(e.event_type.replaceAll('_',' '))} · ${esc(e.player_name||'Opponent')}</p>`).join('')}</details>`:''}<fieldset class="pm-fields" ${disabled?'disabled':''}>${halfSection(d,'first')}${halfSection(d,'second')}<label class="pm-final"><input type="checkbox" data-pm-extra ${d.includeExtra?'checked':''}> This match had overtime</label>${d.includeExtra?halfSection(d,'extra_first')+halfSection(d,'extra_second'):''}</fieldset>${shootoutEditor?`<label class="pm-final"><input type="checkbox" data-pm-shootout ${d.includeShootout?'checked':''} ${state.busy||shootoutEditor.isBusy()?'disabled':''}> This match went to penalties</label><div data-pm-shootout-host ${d.includeShootout?'':'hidden'}></div>`:''}<fieldset class="pm-fields" ${disabled?'disabled':''}><label class="pm-final"><input type="checkbox" data-pm-final ${d.markFinal?'checked':''}> Mark match Final when saving</label><small>Completed-match player stats update when the match is Final. This does not change attendance.</small></fieldset><div class="pm-review"><h3>Ready to save</h3><strong>Final score ${home}–${away}</strong><p>${t.goals} goals · ${t.assists} assists · ${t.yellow} yellow · ${t.red} red${t.unknown?' · '+t.unknown+' unknown assists':''}</p><p class="pm-changes">Add ${c.added} · Correct ${c.updated} · Remove ${c.deleted.length}</p>${incomplete?'<p class="pm-error">Choose a scorer for each SKOR goal above.</p>':''}${overLimit?'<p class="pm-error">Save at most 200 changes at once. Reduce this draft before saving.</p>':''}${[...d.people.keys()].some(key=>d.rows.filter(e=>e.player_key===key&&e.event_type==='skor_yellow_card').length>=2)?'<p>Two yellows recorded for a player. Check whether a red should also be entered.</p>':''}<button class="btn btn-primary" type="button" data-pm="save" ${disabled||overLimit||incomplete||!c.upserts.length&&!c.deleted.length&&(!d.markFinal||m.status==='final')?'disabled':''}>${state.busy?'Saving…':state.phase==='saved'?'Saved':'Save match goals and cards'}</button><small>${d.includeShootout?'Save match goals and cards first, then save penalties in the Penalty shootout section above.':'Saves goals, assists and cards for all selected periods.'}</small></div><p role="status" class="pm-status ${['error','conflict'].includes(state.phase)?'pm-error':''}">${esc(state.message)}</p>${state.phase==='saved'?'<button class="pm-continue" type="button" data-pm="continue">Add more goals or cards</button><p>Your saved events will reload before you continue.</p>':''}${state.phase==='conflict'?'<button type="button" data-pm="reload">Reload latest events</button><p>Reloading replaces this draft. Review the new totals.</p>':''}`;
      if(shootoutEditor)shootoutEditor.attach?.(root.querySelector('[data-pm-shootout-host]'));
    }
    const controller=createController({client,getContext,onState:render,onSaved});
    function hasUnsavedGoals(){const state=controller.state();if(!state.draft||state.phase==='saved')return false;try{const c=changes(state.draft);return !!(c.upserts.length||c.deleted.length);}catch{return true;}}
    async function refreshAfterShootout(){
      const state=controller.state();if(!dialog.open||!state.draft||state.busy||hasUnsavedGoals())return;
      const show=state.draft.includeShootout,extra=state.draft.includeExtra,selected=Object.fromEntries(halves.map(h=>[h,[...state.draft.selected[h]]]));remember();
      if(await controller.open()){controller.state().draft.includeShootout=show;controller.state().draft.includeExtra=extra;controller.state().draft.shootoutTouched=true;for(const half of halves)for(const key of selected[half])if(controller.state().draft.people.has(key))controller.state().draft.selected[half].add(key);render(controller.state());}
    }
    shootoutEditor?.configurePostMatch?.({canSave:()=>!hasUnsavedGoals(),isBusy:()=>!!controller.state().busy,onState:()=>{if(controller.state().phase!=='idle')render(controller.state());},onSaved:refreshAfterShootout});
    function remember(){root.querySelectorAll('[data-pm-half]').forEach(e=>e.open?expanded.add(e.dataset.pmHalf):expanded.delete(e.dataset.pmHalf));root.querySelectorAll('[data-pm-cards]').forEach(e=>e.open?cardsExpanded.add(e.dataset.pmCards):cardsExpanded.delete(e.dataset.pmCards));}
    button?.addEventListener('click',()=>{expanded.clear();expanded.add('first');cardsExpanded.clear();void controller.open();});
    dialog.addEventListener('click',e=>{const b=e.target.closest('button[data-pm]');if(!b||b.disabled)return;const action=b.dataset.pm;
      if(shootoutEditor?.isBusy?.())return;
      if(action==='close'){if(!current?.busy)controller.clear();return;}if(action==='reload'){void controller.open();return;}if(action==='continue'){void controller.continueEditing();return;}if(action==='save'){void controller.save();return;}
      if(current?.draft&&!current.busy){try{
        remember();
        if(action==='goals')setGoalCount(current.draft,b.dataset.half,Number(b.dataset.value));
        else if(action==='remove-goal')removeGoal(current.draft,b.dataset.goal);
        else if(action==='count')setCount(current.draft,b.dataset.half,b.dataset.player||null,b.dataset.type,Number(b.dataset.value));
        else return;
        render({...current,message:''});
        const next=[...root.querySelectorAll('button[data-pm]')].find(x=>x.dataset.pm===action&&x.dataset.half===b.dataset.half&&x.dataset.player===b.dataset.player&&x.dataset.type===b.dataset.type&&x.dataset.pmDelta===b.dataset.pmDelta&&action!=='remove-goal');
        next?.focus({preventScroll:true});
      }catch(error){render({...current,message:error.message});}}

    });
    dialog.addEventListener('change',e=>{if(!current?.draft||current.busy||shootoutEditor?.isBusy?.())return;remember();const d=current.draft;try{
      if(e.target.hasAttribute('data-pm-card-player')){if(d.people.has(e.target.value)){d.selected[e.target.dataset.pmCardPlayer].add(e.target.value);cardsExpanded.add(e.target.dataset.pmCardPlayer);}}
      else if(e.target.hasAttribute('data-pm-scorer'))setScorer(d,e.target.dataset.pmScorer,e.target.value);
      else if(e.target.hasAttribute('data-pm-assist'))setAssist(d,e.target.dataset.pmAssist,e.target.value);
      else if(e.target.hasAttribute('data-pm-extra')){if(!e.target.checked&&d.rows.some(r=>r.half.startsWith('extra_')))throw Error('Keep overtime visible while it has recorded events.');d.includeExtra=e.target.checked;}
      else if(e.target.hasAttribute('data-pm-shootout')){d.includeShootout=e.target.checked;d.shootoutTouched=true;}
      else if(e.target.hasAttribute('data-pm-final'))d.markFinal=e.target.checked;
      else return;render({...current,message:''});
      if(e.target.dataset.pmScorer||e.target.dataset.pmAssist){const attr=e.target.dataset.pmScorer?'pmScorer':'pmAssist';[...root.querySelectorAll('[data-pm-scorer],[data-pm-assist]')].find(n=>n.dataset[attr]===e.target.dataset[attr])?.focus({preventScroll:true});}
    }catch(error){render({...current,message:error.message});}});
    dialog.addEventListener('cancel',e=>{e.preventDefault();if(!current?.busy&&!shootoutEditor?.isBusy?.())controller.clear();});dialog.addEventListener('close',()=>{if(!dialog.open&&controller.state().phase!=='idle')controller.clear();});
    return {...controller,refreshAfterShootout,hasUnsavedGoals,contextChanged:()=>{controller.contextChanged();if(button)button.disabled=!getContext().canUse||!getContext().matchId;}};
  }
  global.SKORPostMatch={createDraft,setCount,setGoalCount,setScorer,removeGoal,goalCounts,missingScorers,setAssist,changes,totals,submission,createController,mount};
})(typeof window==='object'?window:globalThis);

