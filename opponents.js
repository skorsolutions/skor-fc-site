(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid=()=>root.crypto.randomUUID(),copy=v=>JSON.parse(JSON.stringify(v));
  const date=v=>new Date(v).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
  function mount({rootId,client,canWrite,navigate}){
    const host=root.document.getElementById(rootId);if(!host)return null;
    let owner='',generation=0,snapshot=null,selected=null,busy=false,dirty=false,observation=null,profileId=null;
    const current=(id,version)=>owner===id&&generation===version&&canWrite();
    const status=(text,error=false)=>{const node=host.querySelector('[data-opp-status]');if(node){node.textContent=text;node.className='opp-status'+(error?' error':'');}};
    const options=(values,value)=>values.map(v=>'<option value="'+esc(v[0]??v)+'"'+((v[0]??v)===value?' selected':'')+'>'+esc(v[1]??v)+'</option>').join('');
    function fields(details={}){
      return ['style','strengths','weaknesses','set_pieces','notes'].map(k=>'<label>'+esc(({style:'Playing style',strengths:'Strengths',weaknesses:'Weaknesses',set_pieces:'Set pieces',notes:'Scouting notes'})[k])+'<textarea name="'+k+'" maxlength="2000" rows="3">'+esc(details[k]||'')+'</textarea></label>').join('');
    }
    function person(p={}){return '<div class="opp-threat" data-threat-id="'+esc(p.id||uid())+'">'+
      '<label>Shirt number<input name="number" inputmode="numeric" maxlength="2" value="'+esc(p.number||'')+'"></label><label>Name, if known<input name="name" maxlength="80" value="'+esc(p.name||'')+'"></label>'+
      '<label>Formation role<select name="position">'+options([['','Unknown'],...['GK','LB','LCB','CB','RCB','RB','LWB','RWB','LDM','RDM','LCM','CM','RCM','LM','RM','LW','RW','LAM','CAM','RAM','LST','ST','RST','LCF','RCF'].map(x=>[x,x])],p.position||'')+'</select></label>'+
      '<label>Main threat<textarea name="threat" maxlength="600" rows="2">'+esc(p.threat||'')+'</textarea></label><label>How to contain them<textarea name="containment" maxlength="600" rows="2">'+esc(p.containment||'')+'</textarea></label><button type="button" data-remove-threat>Remove player note</button></div>';}
    function players(details={}){return '<fieldset><legend>Dangerous players</legend><p>Numbers may change between games. Record dated sightings in the game observations below.</p><div data-threat-list>'+(details.dangerous_players||[]).map(person).join('')+'</div><button type="button" data-add-threat>+ Add dangerous player</button></fieldset>';}
    function collect(form){
      const result={};for(const k of ['style','strengths','weaknesses','set_pieces','notes'])result[k]=form.elements.namedItem(k)?.value||'';
      result.dangerous_players=[...form.querySelectorAll('[data-threat-id]')].map(row=>{const p={id:row.dataset.threatId};for(const k of ['name','number','position','threat','containment'])p[k]=row.querySelector('[name="'+k+'"]').value.trim();return p;});return result;
    }
    function render(){
      if(!owner||!canWrite()){host.innerHTML='<p>Captain access required.</p>';return;}
      const p=selected||snapshot?.profile,creating=!p,details=p?.details||{},games=snapshot?.matches||[];
      profileId=p?.id||profileId||uid();
      host.innerHTML='<div class="opp-toolbar"><label>Opponent<select data-opp-select><option value="">Choose opponent</option>'+options((snapshot?.opponents||[]).map(x=>[x.id,x.name]),p?.id||'')+'</select></label><button type="button" data-new-opponent>+ New opponent</button><button type="button" data-refresh-opponents>Refresh</button></div><p data-opp-status class="opp-status" role="status" aria-live="polite"></p>'+
        '<div class="opp-columns"><form data-profile-form><h3>'+esc(creating?'New opponent':p.name)+'</h3><label>Team name<input name="team_name" maxlength="100" required value="'+esc(p?.name||'')+'"></label><label class="opp-check"><input type="checkbox" name="ai_enabled"'+(p?.ai_enabled!==false?' checked':'')+'> Use this scouting in AI recommendations</label><p>Captain-only scouting. AI treats notes as observations or suggestions, never guaranteed facts.</p>'+fields(details)+players(details)+'<button type="submit">Save opponent profile</button></form>'+
        '<div><h3>Games and formation history</h3><p>Keep expected formations separate from what you actually observed.</p><details><summary>Past and upcoming meetings</summary>'+games.map(g=>'<p><button type="button" data-open-opponent-game="'+esc(g.id)+'">'+esc(date(g.kickoff)+' · '+g.home_team+' vs '+g.away_team+' · '+g.status)+'</button></p>').join('')+'</details><div class="opp-history">'+(snapshot?.observations||[]).map(o=>'<article><strong>'+esc(o.formation)+' · '+esc(o.kind)+' · '+esc(o.phase.replace('_',' '))+'</strong><p>'+esc(date(o.kickoff))+(o.valid_match===false?' · Archived: fixture opponent changed':'')+'</p><p>'+esc(o.details?.notes||o.details?.style||'')+'</p><button type="button" data-edit-observation="'+esc(o.id)+'">Review / edit game scouting</button></article>').join('')+'</div>'+
        (creating?'<p>Save the profile first. Existing SKOR fixtures are linked automatically by exact team name.</p>':'<form data-observation-form><h3>'+(observation?'Edit':'Add')+' game observation</h3><label>Game<select name="match_id" required>'+options(games.map(g=>[g.id,date(g.kickoff)+' · '+g.home_team+' vs '+g.away_team]),observation?.match_id||games.find(g=>Date.parse(g.kickoff)>Date.now())?.id||games[0]?.id)+'</select></label><label>Type<select name="kind">'+options([['expected','Expected before the game'],['observed','Observed']],observation?.kind||'expected')+'</select></label><label>Phase<select name="phase">'+options([['pregame','Pregame'],['first_half','First half'],['second_half','Second half']],observation?.phase||'pregame')+'</select></label><label>Formation<select name="formation">'+options(root.SKORScouting.FORMATIONS.map(x=>[x,x]),observation?.formation||'Unknown')+'</select></label>'+fields(observation?.details)+players(observation?.details)+'<button type="submit"'+(!games.length?' disabled':'')+'>Save game observation</button><button type="button" data-clear-observation>New observation</button></form>')+'</div></div>';
      if(observation)host.querySelector('[name="match_id"]').disabled=true;
      host.querySelectorAll('button,input,select,textarea').forEach(el=>{if(busy)el.disabled=true;});
    }
    async function refresh(id=selected?.id||null,force=false){
      if(!owner||!canWrite())return;if(dirty&&!force&&!root.confirm('Discard unsaved scouting edits and refresh?'))return;
      const actor=owner,version=++generation;busy=true;status('Loading opponent scouting…');
      try{const {data,error}=await client.rpc('get_opponents_console',{p_opponent_id:id});if(error)throw error;if(!current(actor,version))return;
        snapshot=data;selected=data.profile;profileId=selected?.id||null;observation=null;dirty=false;busy=false;render();status((snapshot.opponents||[]).length+' opponents · captain-only scouting.');
      }catch(e){if(current(actor,version)){busy=false;status(e.message||'Could not load opponents.',true);}}
    }
    async function save(form,kind){
      if(busy||!owner||!canWrite())return;
      const actor=owner,version=generation,contextProfile=profileId,revision=kind==='profile'?(selected?.revision||0):(observation?.revision||0),id=kind==='profile'?profileId:(observation?.id||form.dataset.saveId||uid());
      form.dataset.saveId=id;
      const payload=kind==='profile'?{name:form.elements.namedItem('team_name').value,ai_enabled:form.elements.namedItem('ai_enabled').checked,details:collect(form)}:
        {opponent_id:profileId,match_id:form.elements.namedItem('match_id').value,kind:form.elements.namedItem('kind').value,phase:form.elements.namedItem('phase').value,formation:form.elements.namedItem('formation').value,details:collect(form)};
      busy=true;host.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);status('Saving scouting…');
      try{const {data,error}=await client.rpc('save_opponent_scouting',{p_kind:kind,p_id:id,p_revision:revision,p_payload:payload});if(error)throw error;
        if(!current(actor,version)||contextProfile!==profileId)return;busy=false;dirty=false;await refresh(kind==='profile'?data.id:profileId,true);status('Scouting saved for captains. Existing strategy snapshots stay unchanged.');
        root.dispatchEvent(new CustomEvent('skor:opponent-scouting-saved',{detail:{opponentId:contextProfile}}));
      }catch(e){if(current(actor,version)){busy=false;host.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=false);if(observation)host.querySelector('[name="match_id"]').disabled=true;status((e.message||'Could not save scouting.')+' Retry the same save, or Refresh to review the latest record.',true);}}
    }
    host.addEventListener('submit',e=>{e.preventDefault();if(e.target.matches('[data-profile-form]'))void save(e.target,'profile');if(e.target.matches('[data-observation-form]'))void save(e.target,'observation');});
    host.addEventListener('input',e=>{if(!e.target.matches('[data-opp-select]'))dirty=true;});
    host.addEventListener('change',e=>{if(e.target.matches('[data-opp-select]')){
      const id=e.target.value;if(!id)return;if(dirty&&!root.confirm('Discard unsaved edits and open another opponent?')){e.target.value=selected?.id||'';return;}dirty=false;void refresh(id,true);
    }else dirty=true;});
    host.addEventListener('click',e=>{
      if(busy||!canWrite())return;const b=e.target.closest('button');if(!b)return;
      if(b.matches('[data-add-threat]')){const list=b.closest('fieldset').querySelector('[data-threat-list]');if(list.children.length>=20)return;list.insertAdjacentHTML('beforeend',person());dirty=true;}
      if(b.matches('[data-remove-threat]')){b.closest('[data-threat-id]').remove();dirty=true;}
      if(b.matches('[data-open-opponent-game]'))root.SKOROpenOpponentGame?.(b.dataset.openOpponentGame);
      if(b.matches('[data-refresh-opponents]'))void refresh();
      if(b.matches('[data-new-opponent]')){if(dirty&&!root.confirm('Discard unsaved edits?'))return;selected=null;snapshot={...snapshot,profile:null,matches:[],observations:[]};profileId=uid();observation=null;dirty=false;render();}
      if(b.matches('[data-edit-observation]')){if(dirty&&!root.confirm('Discard unsaved edits?'))return;observation=copy(snapshot.observations.find(o=>o.id===b.dataset.editObservation));dirty=false;render();}
      if(b.matches('[data-clear-observation]')){if(dirty&&!root.confirm('Discard unsaved edits?'))return;observation=null;dirty=false;render();}
    });
    async function getForMatch(matchId,{forAI=false}={}){
      const actor=owner,version=generation;if(!actor||!canWrite())throw Error('Captain access required.');
      const {data,error}=await client.rpc('get_opponent_scouting_for_match',{p_match_id:matchId,p_for_ai:forAI});if(error)throw error;
      if(!current(actor,version))throw Error('Captain context changed. Reopen scouting.');return data;
    }
    return {async start(id){if(owner!==id){generation++;owner=id;dirty=false;snapshot=null;selected=null;profileId=null;observation=null;host.innerHTML='';}await refresh(null,true);},activate:()=>refresh(),
      clear(){generation++;owner='';snapshot=null;selected=null;quickClear();},getForMatch,
      async openForMatch(mid){const snap=await getForMatch(mid);if(!snap.profile)throw Error('No opponent is linked to this fixture yet.');navigate('opponents');dirty=false;await refresh(snap.profile.id,true);},
      state:()=>({owner,busy,dirty,snapshot:copy(snapshot)})};
    function quickClear(){busy=false;dirty=false;observation=null;profileId=null;host.innerHTML='';}
  }
  root.SKOROpponents={mount};
})(typeof window!=='undefined'?window:globalThis);
