/* Post-match drafts retain official event IDs; only reviewed differences are saved. */
(function(global){
  'use strict';
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
    const managed=snapshot.events.filter(e=>kinds.includes(e.event_type)&&['first','second'].includes(e.half)&&(e.event_type==='opponent_goal'||people.has(e.roster_player_key)));
    const rows=managed.map(e=>{const r=row(e);if(r.assist_key&&!people.has(r.assist_key)){r.assist_key=null;r.assist_status='legacy';}return r;}),ids=new Set(rows.map(e=>e.id));
    if(ids.size!==rows.length)throw Error('Duplicate official event IDs.');
    return {snapshot,people,base:new Map(rows.map(e=>[e.id,{...e}])),rows,kept:snapshot.events.filter(e=>!ids.has(e.id)),
      selected:{first:new Set(),second:new Set()},markFinal:true,cache:null};
  }
  function setCount(draft,half,key,type,count,id=makeId){
    const max=type==='skor_yellow_card'?2:type==='skor_red_card'?1:30,priorCount=draft.rows.filter(e=>e.half===half&&e.player_key===(type==='opponent_goal'?null:key)&&e.event_type===type).length;
    if(!['first','second'].includes(half)||!kinds.includes(type)||!Number.isInteger(count)||count<0||count>max&&count>=priorCount||type!=='opponent_goal'&&!draft.people.has(key))throw Error('Check player, half and event count.');
    key=type==='opponent_goal'?null:key;
    const list=draft.rows.filter(e=>e.half===half&&e.player_key===key&&e.event_type===type);
    if(count<list.length){
      const remove=[...list].reverse().sort((a,b)=>Number(draft.base.has(a.id))-Number(draft.base.has(b.id))).slice(0,list.length-count);
      const ids=new Set(remove.map(e=>e.id));draft.rows=draft.rows.filter(e=>!ids.has(e.id));
    }else for(let i=list.length;i<count;i++)draft.rows.push({id:id(),half,event_type:type,player_key:key,assist_key:null,assist_status:type==='skor_goal'?'unknown':null});
    if(key)draft.selected[half].add(key);
  }
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
        phase='saved';busy=false;message='Saved. Both halves are in the official event log.';emit();
        try{await onSaved(matchId,r.data);}catch(e){if(epoch===generation){message='Events were saved. Refresh Game Day to reload the results.';emit();}}
        return true;
      }catch(e){if(epoch===generation){phase=['40001','40P01'].includes(e.code)?'conflict':'error';message=phase==='conflict'?'Match changed. Reload and review before saving.':e.message||'Save failed. Retry unchanged to avoid duplicates.';if(e.code==='42501')draft=null;emit();}return false;
      }finally{if(epoch===generation){busy=false;emit();}}
    }
    return {state,open,save,clear,contextChanged};
  }
  function mount({client,getContext,onSaved=()=>{},doc=global.document,win=global}){
    const dialog=doc.getElementById('postMatchDialog'),root=doc.getElementById('postMatchBody'),button=doc.getElementById('openPostMatch');
    let current=null;const expanded=new Set(['first']),assistExpanded=new Set();
    const label=p=>`${p.number==null?'Jersey TBD':'#'+p.number} ${p.name}${p.is_temp?' · TEMP':''}`;
    function stepper(half,key,type,count,max){return `<div class="pm-stepper"><button type="button" data-pm="count" data-half="${half}" data-player="${esc(key||'')}" data-type="${type}" data-value="${count-1}" aria-label="Remove one ${type.replaceAll('_',' ')}" ${count<=0?'disabled':''}>−</button><output>${count}</output><button type="button" data-pm="count" data-half="${half}" data-player="${esc(key||'')}" data-type="${type}" data-value="${count+1}" aria-label="Add one ${type.replaceAll('_',' ')}" ${count>=max?'disabled':''}>+</button></div>`;}
    function playerCard(d,half,key){
      const p=d.people.get(key),events=d.rows.filter(e=>e.half===half&&e.player_key===key),goals=events.filter(e=>e.event_type==='skor_goal'),assists=d.rows.filter(e=>e.half===half&&e.assist_key===key).length;
      const options=goal=>`<option value="unknown" ${goal.assist_status==='unknown'?'selected':''}>Unknown / not recorded</option><option value="none" ${goal.assist_status==='none'?'selected':''}>No assist</option>${goal.assist_status==='legacy'?'<option value="legacy" selected>Recorded manual assist (kept)</option>':''}`+[...d.people.values()].filter(p=>p.player_key!==key).map(p=>`<option value="${esc(p.player_key)}" ${goal.assist_key===p.player_key?'selected':''}>${esc(label(p))}</option>`).join('');
      return `<article class="pm-player"><h4>${esc(label(p))}</h4><small>${goals.length} goals · ${assists} assists</small><div class="pm-row"><strong>Goals</strong>${stepper(half,key,'skor_goal',goals.length,30)}</div>${goals.length?`<details class="pm-assists" data-pm-assists="${half}:${esc(key)}" ${assistExpanded.has(half+':'+key)?'open':''}><summary>Assists for these goals</summary>${goals.map((g,i)=>`<label class="pm-assist-row">Goal ${i+1}<select data-pm-assist="${g.id}">${options(g)}</select></label>`).join('')}</details>`:''}<div class="pm-row"><span><i class="pm-yellow" aria-hidden="true"></i> Yellow cards</span>${stepper(half,key,'skor_yellow_card',events.filter(e=>e.event_type==='skor_yellow_card').length,2)}</div><div class="pm-row"><span><i class="pm-red" aria-hidden="true"></i> Red cards</span>${stepper(half,key,'skor_red_card',events.filter(e=>e.event_type==='skor_red_card').length,1)}</div></article>`;
    }
    function halfSection(d,half){
      const t=totals(d,half),ownSkor=d.kept.filter(e=>e.half===half&&e.event_type==='opponent_own_goal').length,ownOpponent=d.kept.filter(e=>e.half===half&&e.event_type==='skor_own_goal').length,halfScore=d.snapshot.match.home_team==='SKOR FC'?`${t.skor}–${t.opponent}`:`${t.opponent}–${t.skor}`,keys=new Set([...d.selected[half],...d.rows.filter(e=>e.half===half).flatMap(e=>[e.player_key,e.assist_key]).filter(k=>d.people.has(k))]);
      return `<details class="pm-half" data-pm-half="${half}" ${expanded.has(half)?'open':''}><summary><span>${half==='first'?'1st':'2nd'} Half<small>${t.goals} goals · ${t.assists} assists · ${t.yellow} yellow · ${t.red} red</small></span><b class="pm-score">${halfScore}</b></summary><div class="pm-half-body">${[...keys].map(key=>playerCard(d,half,key)).join('')}<label class="pm-add">Add player<select data-pm-add="${half}"><option value="">Choose roster or guest / TEMP…</option>${[...d.people.values()].filter(p=>!keys.has(p.player_key)).map(p=>`<option value="${esc(p.player_key)}">${esc(label(p))}</option>`).join('')}</select></label>${ownSkor||ownOpponent?`<p>Own goals already kept: SKOR +${ownSkor} · Opponent +${ownOpponent}. Add only other opponent goals below.</p>`:''}<div class="pm-row pm-opponent"><strong>Opponent goals</strong>${stepper(half,null,'opponent_goal',d.rows.filter(e=>e.half===half&&e.event_type==='opponent_goal').length,30)}</div></div></details>`;
    }
    function render(state){
      current=state;if(state.phase==='idle'){if(dialog.open)dialog.close();return;}
      if(!dialog.open)dialog.showModal();
      if(!state.draft){root.innerHTML=`<p role="status">${esc(state.message||'Loading official events…')}</p><button type="button" data-pm="reload">Reload</button>`;return;}
      const d=state.draft,t=totals(d),c=changes(d),m=d.snapshot.match,overLimit=c.upserts.length+c.deleted.length>200,disabled=state.busy||['conflict','saved'].includes(state.phase);
      const home=m.home_team==='SKOR FC'?t.skor:t.opponent,away=m.home_team==='SKOR FC'?t.opponent:t.skor;
      root.innerHTML=`<p class="pm-match">${esc(m.home_team)} vs ${esc(m.away_team)}</p><p>Enter both halves. No clock needed.</p><div class="pm-notice">Existing events are included below. New entries have no recorded minute.</div>${d.kept.length?`<details class="pm-kept"><summary>${d.kept.length} other existing events kept</summary><p>Manual player entries, own goals, fouls and opponent cards remain in the log and score. Use their individual Edit action to correct them.</p>${d.kept.map(e=>`<p>${esc(e.half==='second'?'2nd Half':'1st Half')} · ${esc(e.event_type.replaceAll('_',' '))} · ${esc(e.player_name||'Opponent')}</p>`).join('')}</details>`:''}<fieldset class="pm-fields" ${disabled?'disabled':''}>${halfSection(d,'first')}${halfSection(d,'second')}<label class="pm-final"><input type="checkbox" data-pm-final ${d.markFinal?'checked':''}> Mark match Final when saving</label><small>Completed-match player stats update when the match is Final. This does not change attendance.</small></fieldset><div class="pm-review"><h3>Ready to save</h3><strong>Final score ${home}–${away}</strong><p>${t.goals} goals · ${t.assists} assists · ${t.yellow} yellow · ${t.red} red${t.unknown?' · '+t.unknown+' unknown assists':''}</p><p class="pm-changes">Add ${c.added} · Correct ${c.updated} · Remove ${c.deleted.length}</p>${overLimit?'<p class="pm-error">Save at most 200 changes at once. Reduce this draft before saving.</p>':''}${[...d.people.keys()].some(key=>d.rows.filter(e=>e.player_key===key&&e.event_type==='skor_yellow_card').length>=2)?'<p>Two yellows recorded for a player. Check whether a red should also be entered.</p>':''}<button class="btn btn-primary" type="button" data-pm="save" ${disabled||overLimit||!c.upserts.length&&!c.deleted.length&&(!d.markFinal||m.status==='final')?'disabled':''}>${state.busy?'Saving…':state.phase==='saved'?'Saved':'Save all events'}</button><small>Saves both halves together.</small></div><p role="status" class="pm-status ${['error','conflict'].includes(state.phase)?'pm-error':''}">${esc(state.message)}</p>${state.phase==='conflict'?'<button type="button" data-pm="reload">Reload latest events</button><p>Reloading replaces this draft. Review the new totals.</p>':''}`;
    }
    const controller=createController({client,getContext,onState:render,onSaved});
    function remember(){root.querySelectorAll('[data-pm-half]').forEach(e=>e.open?expanded.add(e.dataset.pmHalf):expanded.delete(e.dataset.pmHalf));root.querySelectorAll('[data-pm-assists]').forEach(e=>e.open?assistExpanded.add(e.dataset.pmAssists):assistExpanded.delete(e.dataset.pmAssists));}
    button?.addEventListener('click',()=>{expanded.clear();expanded.add('first');assistExpanded.clear();void controller.open();});
    dialog.addEventListener('click',e=>{const b=e.target.closest('button[data-pm]');if(!b||b.disabled)return;const action=b.dataset.pm;
      if(action==='close'){if(!current?.busy)controller.clear();return;}if(action==='reload'){void controller.open();return;}if(action==='save'){void controller.save();return;}
      if(action==='count'&&current?.draft&&!current.busy){try{remember();setCount(current.draft,b.dataset.half,b.dataset.player||null,b.dataset.type,Number(b.dataset.value));if(b.dataset.type==='skor_goal')assistExpanded.add(b.dataset.half+':'+b.dataset.player);render({...current,message:''});const next=[...root.querySelectorAll('[data-pm=count]')].find(x=>x.dataset.half===b.dataset.half&&x.dataset.player===b.dataset.player&&x.dataset.type===b.dataset.type&&Number(x.dataset.value)===Number(b.dataset.value)+1);next?.focus();}catch(error){const out=root.querySelector('.pm-status');if(out)out.textContent=error.message;}}
    });
    dialog.addEventListener('change',e=>{if(!current?.draft||current.busy)return;remember();const d=current.draft;try{
      if(e.target.hasAttribute('data-pm-add')){if(d.people.has(e.target.value))d.selected[e.target.dataset.pmAdd].add(e.target.value);}
      else if(e.target.hasAttribute('data-pm-assist'))setAssist(d,e.target.dataset.pmAssist,e.target.value);
      else if(e.target.hasAttribute('data-pm-final'))d.markFinal=e.target.checked;
      else return;render({...current,message:''});
    }catch(error){root.querySelector('.pm-status').textContent=error.message;}});
    dialog.addEventListener('cancel',e=>{e.preventDefault();if(!current?.busy)controller.clear();});dialog.addEventListener('close',()=>{if(controller.state().phase!=='idle')controller.clear();});
    return {...controller,contextChanged:()=>{controller.contextChanged();if(button)button.disabled=!getContext().canUse||!getContext().matchId;}};
  }
  global.SKORPostMatch={createDraft,setCount,setAssist,changes,totals,submission,createController,mount};
})(typeof window==='object'?window:globalThis);
