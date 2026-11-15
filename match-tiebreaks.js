(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const periodLabel=p=>({first:'1st Half',second:'2nd Half',extra_first:'Overtime · 1st Half',extra_second:'Overtime · 2nd Half',extra_first_half:'Overtime · 1st Half',extra_second_half:'Overtime · 2nd Half',extra_break:'Before overtime',extra_halftime:'Overtime halftime',shootout:'Penalty shootout'})[p]||p;
  function summary(shots,initial=5,first='skor'){
    if(!Number.isInteger(initial)||initial<1||initial>20||!['skor','opponent'].includes(first)||!Array.isArray(shots)||shots.length>200)throw Error('Check shootout settings.');
    let skor=0,opponent=0,skor_taken=0,opponent_taken=0,winner=null;const ids=new Set();
    shots.forEach((s,i)=>{const team=i%2?first==='skor'?'opponent':'skor':first;
      if(winner||s.team!==team||!['scored','missed'].includes(s.outcome)||!s.id||ids.has(s.id))throw Error('Review the kick order. A decided shootout cannot have more kicks.');ids.add(s.id);
      if(team==='skor'){skor_taken++;if(s.outcome==='scored')skor++;}else{opponent_taken++;if(s.outcome==='scored')opponent++;}
      if(skor_taken<=initial&&opponent_taken<=initial){if(skor>opponent+initial-opponent_taken)winner='skor';else if(opponent>skor+initial-skor_taken)winner='opponent';}
      else if(skor_taken===opponent_taken&&skor!==opponent)winner=skor>opponent?'skor':'opponent';
    });
    return {skor,opponent,skor_taken,opponent_taken,winner,next_team:shots.length%2?first==='skor'?'opponent':'skor':first,sudden_death:skor_taken>=initial&&opponent_taken>=initial&&!winner};
  }
  function mount({client,getContext,onSaved=()=>{},doc=root.document}){
    const box=doc.getElementById('matchTiebreaks');let data=null,owner=null,match=null,epoch=0,busy=false,message='',receipt=null,dirty=false;
    const valid=e=>{const c=getContext();return e===epoch&&c.canUse&&c.userId===owner&&c.matchId===match;};
    const clear=()=>{epoch++;data=null;owner=null;match=null;receipt=null;busy=false;dirty=false;if(box)box.innerHTML='';};
    function render(){
      if(!box)return;if(!data){box.innerHTML=message?`<p role="status">${esc(message)}</p>`:'';return;}
      const wasOpen=box.querySelector('details')?.open||false;
      let s;try{s=summary(data.shots,Number(data.initial_kicks),data.first_team);}catch(e){message=e.message;s={skor:0,opponent:0};}
      box.innerHTML=`<details ${wasOpen||data.shots.length?'open':''}><summary>Overtime &amp; penalty shootout</summary><p>Two overtime halves. The referee controls the whistle. Golden goal ends the match after the first overtime goal; confirm Full Time at the whistle.</p><fieldset ${busy?'disabled':''}><div class="tb-settings"><label>Minutes per overtime half<input type="number" min="1" max="30" data-tb-setting="extra_minutes" value="${data.extra_minutes}"></label><label>Initial kicks per team<input type="number" min="1" max="20" data-tb-setting="initial_kicks" value="${data.initial_kicks}" ${data.shots.length?'disabled':''}></label><label>First team to kick<select data-tb-setting="first_team" ${data.shots.length?'disabled':''}><option value="skor" ${data.first_team==='skor'?'selected':''}>SKOR FC</option><option value="opponent" ${data.first_team==='opponent'?'selected':''}>Opponent</option></select></label></div><label><input type="checkbox" data-tb-setting="golden_goal" ${data.golden_goal?'checked':''}> Golden goal in overtime</label><button type="button" data-tb="save">Save settings / shootout</button><p>For a finished match, enter overtime goals and cards in Record after game. Keep penalty kicks below: they do not count as player goals, assists or match goals.</p><h4>Penalties: SKOR ${s.skor} – ${s.opponent} Opponent</h4>${s.sudden_death?'<strong>Sudden death — finish each pair of kicks.</strong>':''}<ol>${data.shots.map((shot,i)=>`<li>${i+1}. ${shot.team==='skor'?'SKOR FC':'Opponent'} · <select data-tb-shot="${i}" aria-label="Outcome of kick ${i+1}"><option value="scored" ${shot.outcome==='scored'?'selected':''}>Scored</option><option value="missed" ${shot.outcome==='missed'?'selected':''}>Missed / saved</option></select>${shot.team==='skor'?`<select data-tb-player="${i}" aria-label="Kicker for kick ${i+1}"><option value="">Kicker not recorded</option>${(data.participants||[]).map(p=>`<option value="${esc(p.player_key)}" ${shot.player_key===p.player_key?'selected':''}>${esc(p.name)}</option>`).join('')}</select>`:''}</li>`).join('')}</ol>${!s.winner?`<p>Next kick: <strong>${s.next_team==='skor'?'SKOR FC':'Opponent'}</strong></p><div class="tb-actions"><button type="button" data-tb="scored">+ Scored</button><button type="button" data-tb="missed">+ Missed / saved</button></div>`:`<p><strong>${s.winner==='skor'?'SKOR FC':'Opponent'} wins the shootout.</strong></p>`}<button type="button" data-tb="undo" ${!data.shots.length?'disabled':''}>Remove last kick</button><label><input type="checkbox" data-tb-setting="completed" ${data.completed?'checked':''} ${!s.winner?'disabled':''}> Confirm shootout complete and mark match Final</label><button type="button" data-tb="save">Save settings / shootout</button></fieldset><p role="status">${esc(message)}</p><button type="button" data-tb="reload" ${busy?'disabled':''}>Reload saved settings / kicks</button></details>`;
    }
    async function load(force=false){
      const before=getContext();if(!force&&data&&owner===before.userId&&match===before.matchId&&before.canUse)return;
      clear();const c=getContext();if(!box||!c.canUse||!c.userId||!c.matchId)return;
      owner=c.userId;match=c.matchId;const e=epoch;message='Loading overtime settings…';render();
      try{const r=await client.rpc('get_match_tiebreak',{p_match_id:match});if(!valid(e))return;if(r.error)throw r.error;
        if(r.data?.match_id!==match)throw Error('Overtime settings could not be verified.');data=JSON.parse(JSON.stringify(r.data));dirty=false;message='';render();
      }catch(error){if(valid(e)){message=error.message||'Could not load overtime settings.';render();}}
    }
    async function save(){
      if(!data||busy)return;const e=epoch;busy=true;message='Saving…';render();
      try{const c=getContext(),session=await client.auth.getSession();if(!valid(e)||session.data?.session?.user?.id!==c.userId)throw Error('Captain session changed. Reload.');
        summary(data.shots,Number(data.initial_kicks),data.first_team);
        const payload={extra_minutes:Number(data.extra_minutes),initial_kicks:Number(data.initial_kicks),golden_goal:data.golden_goal,first_team:data.first_team,shots:data.shots,completed:data.completed};
        const signature=JSON.stringify({revision:data.revision,payload});if(receipt?.signature!==signature)receipt={signature,id:root.crypto.randomUUID()};
        const r=await client.rpc('save_match_tiebreak',{p_match_id:match,p_request_id:receipt.id,p_revision:data.revision,p_payload:payload});
        if(!valid(e))return;if(r.error)throw r.error;if(r.data?.ok!==true)throw Error('Save was not verified. Retry unchanged.');
        data.revision=r.data.revision;receipt=null;dirty=false;message='Saved. Shootout kicks stay separate from match goals.';await onSaved(match);
      }catch(error){if(valid(e))message=error.message||'Save failed. Retry unchanged.';}
      finally{if(valid(e)){busy=false;render();}}
    }
    box?.addEventListener('click',e=>{const b=e.target.closest('[data-tb]');if(!b||b.disabled||busy)return;
      if(b.dataset.tb==='reload'){void load(true);return;}if(!data)return;
      if(b.dataset.tb==='save'){void save();return;}
      try{if(b.dataset.tb==='undo'){data.shots.pop();data.completed=false;}
        else if(['scored','missed'].includes(b.dataset.tb)){const s=summary(data.shots,Number(data.initial_kicks),data.first_team);if(s.winner)throw Error('Shootout is already decided.');data.shots.push({id:root.crypto.randomUUID(),team:s.next_team,outcome:b.dataset.tb});}
        dirty=true;message='Unsaved changes';render();
      }catch(error){message=error.message;render();}
    });
    box?.addEventListener('change',e=>{if(!data||busy)return;const t=e.target,prior=JSON.stringify(data);
      try{if(t.dataset.tbSetting){data[t.dataset.tbSetting]=t.type==='checkbox'?t.checked:['extra_minutes','initial_kicks'].includes(t.dataset.tbSetting)?Number(t.value):t.value;}
        else if(t.dataset.tbShot!==undefined)data.shots[Number(t.dataset.tbShot)].outcome=t.value;
        else if(t.dataset.tbPlayer!==undefined)data.shots[Number(t.dataset.tbPlayer)].player_key=t.value||null;
        else return;
        if(!summary(data.shots,Number(data.initial_kicks),data.first_team).winner)data.completed=false;dirty=true;message='Unsaved changes';
      }catch(error){data=JSON.parse(prior);message=error.message;}render();
    });
    return {load,clear,contextChanged(){const c=getContext();if(owner&&(!c.canUse||c.userId!==owner||c.matchId!==match))clear();},state:()=>data,isDirty:()=>dirty,save};
  }
  root.SKORTiebreaks={summary,periodLabel,mount};
})(typeof window==='object'?window:globalThis);
