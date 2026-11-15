(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const periodLabel=p=>({first:'1st Half',second:'2nd Half',extra_first:'Overtime · 1st Half',extra_second:'Overtime · 2nd Half',extra_first_half:'Overtime · 1st Half',extra_second_half:'Overtime · 2nd Half',extra_break:'Before overtime',extra_halftime:'Overtime halftime',shootout:'Penalty shootout'})[p]||p;
  function summary(shots,initial=5,first='skor'){
    if(!Number.isInteger(initial)||initial<1||initial>20||!['skor','opponent'].includes(first)||!Array.isArray(shots)||shots.length>200)throw Error('Check shootout settings.');
    let skor=0,opponent=0,skor_taken=0,opponent_taken=0,winner=null;const ids=new Set();
    shots.forEach((s,i)=>{const team=i%2?first==='skor'?'opponent':'skor':first;
      if(winner||s.team!==team||!['scored','missed'].includes(s.outcome)||typeof s.id!=='string'||!s.id||s.id.length>80||ids.has(s.id))throw Error('Review the kick order. A decided shootout cannot have more kicks.');ids.add(s.id);
      if(team==='skor'){skor_taken++;if(s.outcome==='scored')skor++;}else{opponent_taken++;if(s.outcome==='scored')opponent++;}
      if(skor_taken<=initial&&opponent_taken<=initial){if(skor>opponent+initial-opponent_taken)winner='skor';else if(opponent>skor+initial-skor_taken)winner='opponent';}
      else if(skor_taken===opponent_taken&&skor!==opponent)winner=skor>opponent?'skor':'opponent';
    });
    return {skor,opponent,skor_taken,opponent_taken,winner,next_team:shots.length%2?first==='skor'?'opponent':'skor':first,sudden_death:skor_taken>=initial&&opponent_taken>=initial&&!winner};
  }
  function mount({client,getContext,onSaved=()=>{},doc=root.document}){
    const box=doc.getElementById('matchTiebreaks'),settings=doc.getElementById('matchTiebreakSettings'),parking=doc.getElementById('postMatchTiebreakParking')||box?.parentNode;
    let data=null,baseline=null,owner=null,match=null,epoch=0,busy=false,message='',receipt=null,dirty=false,bridge=null;
    const payload=()=>({extra_minutes:Number(data.extra_minutes),initial_kicks:Number(data.initial_kicks),golden_goal:data.golden_goal,first_team:data.first_team,shots:data.shots,completed:data.completed});
    const recomputeDirty=()=>{dirty=!!data&&JSON.stringify(payload())!==JSON.stringify(baseline);};
    const valid=e=>{const c=getContext();return e===epoch&&c.canUse&&c.userId===owner&&c.matchId===match;};
    const notify=()=>bridge?.onState?.();
    const penaltyDraft=()=>!!data&&!!baseline&&['initial_kicks','first_team','shots','completed'].some(k=>JSON.stringify(data[k])!==JSON.stringify(baseline[k]));
    function clear(){epoch++;data=null;baseline=null;owner=null;match=null;receipt=null;busy=false;dirty=false;if(box)box.innerHTML='';if(settings)settings.innerHTML='';}
    function render(){
      if(!box)return;
      if(!data){box.innerHTML=`<p role="status">${esc(message||'Loading penalty shootout…')}</p><button type="button" data-tb="reload">Reload penalties</button>`;if(settings)settings.innerHTML=message?`<p role="status">${esc(message)}</p>`:'';return;}
      const open=settings?.querySelector('details')?.open||false,goalBusy=!!bridge?.isBusy?.(),blocked=bridge?.canSave?.()===false;
      if(settings)settings.innerHTML=`<details ${open?'open':''}><summary>Overtime settings</summary><fieldset ${busy||goalBusy?'disabled':''}><label>Minutes per overtime half<input type="number" min="1" max="30" data-tb-setting="extra_minutes" value="${data.extra_minutes}"></label><label><input type="checkbox" data-tb-setting="golden_goal" ${data.golden_goal?'checked':''}> Golden goal in overtime</label><button type="button" data-tb="save-settings" ${blocked?'disabled':''}>Save overtime settings</button><p>Record penalty kicks in <strong>Record after game → This match went to penalties</strong>.</p></fieldset><p role="status">${esc(message)}${penaltyDraft()?' Penalty changes are waiting in Record after game.':''}</p><button type="button" data-tb="reload-settings" ${busy||goalBusy||penaltyDraft()?'disabled':''}>Reload saved settings</button></details>`;
      let s;try{s=summary(data.shots,Number(data.initial_kicks),data.first_team);}catch(error){message=error.message;s={skor:0,opponent:0};}
      box.innerHTML=`<section aria-label="Penalty shootout"><h3>Penalty shootout</h3><p>These kicks decide the shootout. They stay separate from match goals and player stats.</p><fieldset ${busy||goalBusy?'disabled':''}><div class="tb-settings"><label>Initial kicks per team<input type="number" min="1" max="20" data-tb-setting="initial_kicks" value="${data.initial_kicks}" ${data.shots.length?'disabled':''}></label><label>First team to kick<select data-tb-setting="first_team" ${data.shots.length?'disabled':''}><option value="skor" ${data.first_team==='skor'?'selected':''}>SKOR FC</option><option value="opponent" ${data.first_team==='opponent'?'selected':''}>Opponent</option></select></label></div><h4>Penalties: SKOR ${s.skor} – ${s.opponent} Opponent</h4>${s.sudden_death?'<strong>Sudden death — finish each pair of kicks.</strong>':''}<ol>${data.shots.map((shot,i)=>`<li>${i+1}. ${shot.team==='skor'?'SKOR FC':'Opponent'} · <select data-tb-shot="${i}" aria-label="Outcome of kick ${i+1}"><option value="scored" ${shot.outcome==='scored'?'selected':''}>Scored</option><option value="missed" ${shot.outcome==='missed'?'selected':''}>Missed / saved</option></select>${shot.team==='skor'?`<select data-tb-player="${i}" aria-label="Kicker for kick ${i+1}"><option value="">Kicker not recorded</option>${(data.participants||[]).map(p=>`<option value="${esc(p.player_key)}" ${shot.player_key===p.player_key?'selected':''}>${esc(p.name)}</option>`).join('')}</select>`:''}</li>`).join('')}</ol>${!s.winner?`<p>Next kick: <strong>${s.next_team==='skor'?'SKOR FC':'Opponent'}</strong></p><div class="tb-actions"><button type="button" data-tb="scored">+ Scored</button><button type="button" data-tb="missed">+ Missed / saved</button></div>`:`<p><strong>${s.winner==='skor'?'SKOR FC':'Opponent'} wins the shootout.</strong></p>`}<button type="button" data-tb="undo" ${!data.shots.length?'disabled':''}>Remove last kick</button><label><input type="checkbox" data-tb-setting="completed" ${data.completed?'checked':''} ${!s.winner?'disabled':''}> Confirm shootout complete and mark match Final</label>${blocked?'<p class="tb-save-order" role="status">Save the match goals and cards below first. Then save the penalty shootout here.</p>':''}<button type="button" data-tb="save" ${blocked?'disabled':''}>${busy?'Saving…':'Save penalty shootout'}</button></fieldset><p role="status">${esc(message)}</p><button type="button" data-tb="reload" ${busy||goalBusy?'disabled':''}>Reload saved penalties</button></section>`;
    }
    async function load(force=false){
      const before=getContext();if(!force&&data&&owner===before.userId&&match===before.matchId&&before.canUse)return;
      clear();const c=getContext();if(!box||!c.canUse||!c.userId||!c.matchId)return;
      owner=c.userId;match=c.matchId;const e=epoch;message='Loading match settings…';render();notify();
      try{const r=await client.rpc('get_match_tiebreak',{p_match_id:match});if(!valid(e))return;if(r.error)throw r.error;
        if(r.data?.match_id!==match)throw Error('Match settings could not be verified.');data=JSON.parse(JSON.stringify(r.data));baseline=JSON.parse(JSON.stringify(payload()));dirty=false;message='';render();notify();
      }catch(error){if(valid(e)){message=error.message||'Could not load match settings.';render();notify();}}
    }
    async function save(scope='shootout'){
      if(!data||busy||bridge?.isBusy?.())return false;
      if(bridge?.canSave?.()===false){message='Save match goals and cards before saving penalties.';render();return false;}
      const e=epoch;busy=true;message='Saving…';render();notify();
      try{const c=getContext(),session=await client.auth.getSession();if(!valid(e)||session.data?.session?.user?.id!==c.userId)throw Error('Captain session changed. Reload.');
        // Settings save uses the last acknowledged kicks, never a hidden penalty draft.
        const body=scope==='settings'?{...JSON.parse(JSON.stringify(baseline)),extra_minutes:Number(data.extra_minutes),golden_goal:data.golden_goal}:payload();
        summary(body.shots,Number(body.initial_kicks),body.first_team);
        const signature=JSON.stringify({revision:data.revision,payload:body});if(receipt?.signature!==signature)receipt={signature,id:root.crypto.randomUUID()};
        const r=await client.rpc('save_match_tiebreak',{p_match_id:match,p_request_id:receipt.id,p_revision:data.revision,p_payload:body});
        if(!valid(e))return false;if(r.error)throw r.error;if(r.data?.ok!==true)throw Error('Save was not verified. Retry unchanged.');
        data.revision=r.data.revision;baseline=JSON.parse(JSON.stringify(body));receipt=null;recomputeDirty();message=scope==='settings'?'Overtime settings saved.':'Penalty shootout saved.';
        try{await onSaved(match);if(valid(e))await bridge?.onSaved?.();}catch(error){if(valid(e))message='Saved. Refresh Game Day to reload the match status.';}return true;
      }catch(error){if(valid(e))message=error.message||'Save failed. Retry unchanged.';return false;}
      finally{if(valid(e)){busy=false;render();notify();}}
    }
    function click(e){const b=e.target.closest('[data-tb]');if(!b||b.disabled||busy||bridge?.isBusy?.())return;
      if(b.dataset.tb==='reload-settings'){if(penaltyDraft()){message='Your penalty draft is in Record after game. Save or reload penalties there.';render();return;}void load(true);return;}
      if(b.dataset.tb==='reload'){void load(true);return;}if(!data)return;
      if(b.dataset.tb==='save'||b.dataset.tb==='save-settings'){void save(b.dataset.tb==='save-settings'?'settings':'shootout');return;}
      try{if(b.dataset.tb==='undo'){data.shots.pop();data.completed=false;}
        else if(['scored','missed'].includes(b.dataset.tb)){const s=summary(data.shots,Number(data.initial_kicks),data.first_team);if(s.winner)throw Error('Shootout is already decided.');data.shots.push({id:root.crypto.randomUUID(),team:s.next_team,outcome:b.dataset.tb});}
        recomputeDirty();message='Unsaved changes';render();
      }catch(error){message=error.message;render();}
    }
    function change(e){if(!data||busy||bridge?.isBusy?.())return;const t=e.target,prior=JSON.stringify(data);
      try{if(t.dataset.tbSetting){data[t.dataset.tbSetting]=t.type==='checkbox'?t.checked:['extra_minutes','initial_kicks'].includes(t.dataset.tbSetting)?Number(t.value):t.value;}
        else if(t.dataset.tbShot!==undefined)data.shots[Number(t.dataset.tbShot)].outcome=t.value;
        else if(t.dataset.tbPlayer!==undefined)data.shots[Number(t.dataset.tbPlayer)].player_key=t.value||null;
        else return;
        if(!summary(data.shots,Number(data.initial_kicks),data.first_team).winner)data.completed=false;recomputeDirty();message='Unsaved changes';
      }catch(error){data=JSON.parse(prior);message=error.message;}render();
    }
    [box,settings].forEach(n=>{n?.addEventListener('click',click);n?.addEventListener('change',change);});
    return {load,clear,contextChanged(){const c=getContext();if(owner&&(!c.canUse||c.userId!==owner||c.matchId!==match))clear();},state:()=>data,isDirty:()=>dirty,isBusy:()=>busy,save,
      configurePostMatch(value){bridge=value;render();},attach(host){if(host&&box){host.appendChild(box);render();}},detach(){if(parking&&box&&box.parentNode!==parking)parking.appendChild(box);}};
  }
  root.SKORTiebreaks={summary,periodLabel,mount};
})(typeof window==='object'?window:globalThis);
