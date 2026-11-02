/* Reusable guest identity, match-scoped participation and reviewed fee planning. */
(function(global){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>global.SKORTeamDues.money(v),cents=v=>global.SKORTeamDues.cents(v),uuid=()=>global.crypto.randomUUID();
  const date=v=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(v));const get=k=>p.find(x=>x.type===k).value;return get('year')+'-'+get('month')+'-'+get('day');};
  function prorate({baseline_cents,fixed_cents,total_games,included_games}){
    if(![baseline_cents,fixed_cents,total_games,included_games].every(Number.isSafeInteger)||baseline_cents<0||baseline_cents>100000000||fixed_cents<0||fixed_cents>baseline_cents||total_games<1||total_games>200||included_games<0||included_games>total_games)throw Error('Check the baseline, fixed costs and whole game counts.');
    return fixed_cents+Number((BigInt(baseline_cents-fixed_cents)*BigInt(included_games)+BigInt(Math.floor(total_games/2)))/BigInt(total_games));
  }
  const participations=s=>[...s.links,...(s.event_participants||[])];
  function feeCandidates(s,gid){
    const cfg=s.fee_settings.find(c=>c.group_id===gid);if(!cfg?.enabled)return [];
    const linked=new Set(s.ledger.group_matches.filter(m=>m.group_id===gid).map(m=>m.match_id));
    return participations(s).filter(l=>{const m=s.ledger.matches.find(m=>m.id===l.match_id),p=s.profiles.find(p=>p.player_id===l.player_id);return m&&p&&linked.has(m.id)&&m.published&&m.status==='final'&&Date.parse(m.kickoff)<=Date.now()&&l.attendance==='present'&&date(m.kickoff)>=cfg.effective_on&&(!p.joined_on||date(m.kickoff)<p.joined_on)&&!s.entries.some(e=>e.group_id===gid&&e.player_id===l.player_id&&e.match_id===l.match_id&&['guest_fee','guest_waiver'].includes(e.category));});
  }
  function guestTotals(s,gid){
    const ids=[...new Set(s.entries.filter(e=>e.group_id===gid&&e.category!=='participation').map(e=>e.player_id))];let charged=0,collected=0;
    for(const id of ids){const fees=s.entries.filter(e=>e.group_id===gid&&e.player_id===id&&e.category!=='participation').reduce((a,e)=>a+e.delta_cents,0),paid=s.ledger.members.find(m=>m.group_id===gid&&m.player_id===id)?.paid_cents||0;charged+=fees;collected+=Math.min(Math.max(0,paid),Math.max(0,fees));}
    return {charged,collected,outstanding:charged-collected,waived:s.entries.filter(e=>e.group_id===gid&&e.category==='guest_waiver').length};
  }
  function createController({client,mode='captain',onState=()=>{},visible=()=>true,schedule=setTimeout,cancel=clearTimeout}){
    let actor=null,epoch=0,snapshot=null,pending=null,timer=null,busy=false,phase='idle',message='',code=null;const state=()=>({actor,snapshot,busy,phase,message,code}),emit=()=>onState(state());
    function pause(){if(timer!==null)cancel(timer);timer=null;}
    function arm(){pause();if(actor&&!busy&&visible())timer=schedule(()=>{timer=null;void refresh();},30000);}
    function clear(){epoch++;actor=null;snapshot=null;pending=null;busy=false;phase='idle';message='';code=null;pause();emit();}
    async function identity(id){const r=await client.auth.getSession();return !r.error&&r.data?.session?.user?.id===id;}
    function refresh(){if(!actor||!visible()||busy)return Promise.resolve(false);if(pending)return pending;const generation=epoch,id=actor;phase='loading';pause();emit();
      pending=Promise.resolve().then(async()=>{try{if(!await identity(id)){if(generation===epoch)clear();return false;}if(generation!==epoch)return false;
        const r=await client.rpc(mode==='captain'?'get_guest_console':'get_my_guest_portal');if(generation!==epoch)return false;if(!await identity(id)){if(generation===epoch)clear();return false;}if(generation!==epoch)return false;if(r.error)throw r.error;
        if(!r.data||!Number.isFinite(Date.parse(r.data.as_of))||(mode==='captain'?(r.data.history_version!==1||r.data.participation_version!==1||!['profiles','links','event_participants','legacy','fee_settings','entries'].every(k=>Array.isArray(r.data[k]))):!Array.isArray(r.data.matches)))throw Error('Guest profile response incomplete.');
        snapshot=r.data;phase='ready';message='';code=null;emit();return true;
      }catch(e){if(generation===epoch){code=e.code||null;if(e.code==='42501')snapshot=null;phase=snapshot?'stale':'error';message=e.message||'Refresh failed.';emit();}return false;}finally{if(generation===epoch){pending=null;arm();}}});return pending;
    }
    async function start(id){if(actor===id)return refresh();clear();actor=id||null;return refresh();}
    async function write(resource,action,payload){if(!actor||busy||!['profile','history','dues','self'].includes(resource)||(mode==='player'?resource!=='self':resource==='self'))throw Error('Profile access required or a save is in progress.');const generation=epoch,id=actor;busy=true;pause();emit();
      try{if(pending)await pending;if(!await identity(id)){if(generation===epoch)clear();throw Error('Account changed.');}if(generation!==epoch)throw Error('Account changed.');
        const rpc=resource==='history'?'manage_guest_history':resource==='profile'?'manage_guest_profile':resource==='dues'?'manage_participant_dues':'manage_my_guest_match',r=await client.rpc(rpc,{p_action:action,p:payload});
        if(generation!==epoch)throw Error('Account changed.');if(r.error)throw r.error;if(r.data?.ok!==true)throw Error('Save could not be verified.');busy=false;await refresh();return r.data;
      }catch(e){if(generation===epoch){code=e.code||null;if(e.code==='42501')snapshot=null;phase=snapshot?'stale':'error';message=e.message||'Save failed.';emit();}throw e;}finally{if(generation===epoch){busy=false;emit();arm();}}
    }
    return {start,clear,refresh,write,pause,state,resume:()=>visible()?refresh():(pause(),Promise.resolve(false))};
  }
  function recordMarkup(record,{clarify=false}={}){const s=record?.summary;if(!s)return '<p>Match record unavailable.</p>';return `<div class="dues-stats"><span class="${clarify?'gp-attendance-stat':''}">Games attended<b>${s.present_count}${clarify?' confirmed':''}</b>${clarify?`<small>${s.unmarked_count?`${s.unmarked_count} game${s.unmarked_count===1?'':'s'} ${s.unmarked_count===1?'needs':'need'} confirmation`:(pendingAttendance(record).total?'All recorded attendance confirmed':'No completed match record yet')}</small>`:''}</span><span>Goals<b>${s.goals}</b></span><span>Assists<b>${s.assists}</b></span><span>Man of the Match<b>${s.motm}</b></span></div><p>${clarify?`${pendingAttendance(record).total} completed games on this record. `:'Completed official games. '}Attendance: ${s.present_count} Present · ${s.absent_count} Absent · ${s.excused_count} Excused · ${s.unmarked_count} Unmarked. Cards: ${s.yellow_cards} yellow / ${s.red_cards} red.</p>`;}
  const savedNameKey=value=>String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase();
  function legacyGroups(rows=[]){
    const groups=new Map(),seen=new Set();
    for(const row of rows){
      if(!row?.id||!row.match_id||seen.has(row.id))continue;seen.add(row.id);
      const key=savedNameKey(row.name)||'unnamed:'+row.id;
      if(!groups.has(key))groups.set(key,{key,name:String(row.name||'Unnamed TEMP entry').trim(),appearances:[],games:[],archived:[]});
      const g=groups.get(key);g.appearances.push(row);
      if(row.history_eligible!==true){g.archived.push(row);continue;}
      let game=g.games.find(x=>x.match_id===row.match_id);if(!game){game={match_id:row.match_id,rows:[]};g.games.push(game);}game.rows.push(row);
    }
    return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name));
  }
  function legacyDirectoryMarkup(snapshot,matchLabel,disabled=false){
    const groups=legacyGroups(snapshot.legacy),normal=groups.filter(g=>g.games.length),archives=groups.reduce((n,g)=>n+g.archived.length,0);
    const actions=g=>`<div class="dues-row gp-history-actions"><button type="button" data-gp="legacy-create" data-group="${esc(g.key)}"${disabled?' disabled':''}>Create profile &amp; link history</button><button type="button" data-gp="legacy-link" data-group="${esc(g.key)}"${disabled?' disabled':''}>Link history to profile</button></div>`;
    const card=g=>`<details class="dues-box gp-legacy-group" data-gp-key="legacy-${esc(encodeURIComponent(g.key))}"><summary><span>${esc(g.name)}</span><span class="gp-history-count">${g.games.length} saved game${g.games.length===1?'':'s'}</span></summary><p>Selected in the Final / Production field or bench, or supported by confirmed participation. Attendance is counted separately.</p>${actions(g)}${g.games.map(game=>`<article class="gp-legacy-appearance"><strong>${esc(matchLabel(game.match_id))}</strong><p>${game.rows.length>1?'Multiple active or referenced identities — review required':game.rows[0].number==null?'Jersey TBD':'Match jersey #'+esc(game.rows[0].number)}</p></article>`).join('')}${g.archived.length?`<p>${g.archived.length} unused TEMP ${g.archived.length===1?'entry':'entries'} retained in the archive below.</p>`:''}</details>`;
    return `<section class="gp-legacy-directory" aria-label="Saved TEMP history awaiting linking"><h3>Previous TEMP players <span class="gp-history-count">${normal.length} saved names</span></h3><p>Create or choose one profile per person, then review their saved games together. Drafts and unused TEMP entries do not create match history. Attendance is counted separately.</p>${normal.map(card).join('')||'<p>All current saved TEMP assignments are linked.</p>'}${archives?`<details class="dues-box" data-gp-key="legacy-archive"><summary>Not selected / unused TEMP entries (${archives})</summary><p>Created or planned only. These entries are excluded from match history and attendance counts. Duplicate records for an already listed game do not add another game.</p>${groups.filter(g=>g.archived.length).map(g=>`<details data-gp-key="archive-${esc(encodeURIComponent(g.key))}"><summary>${esc(g.name)} · ${g.archived.length} unused TEMP ${g.archived.length===1?'entry':'entries'}</summary>${g.archived.map(t=>`<article class="gp-legacy-appearance"><strong>${esc(matchLabel(t.match_id))}</strong><p>${t.number==null?'Jersey TBD':'Match jersey #'+esc(t.number)} · No match participation recorded</p></article>`).join('')}</details>`).join('')}</details>`:''}</section>`;
  }
  function legacyProfileChoices(snapshot,temp,selected=''){
    return snapshot.profiles.filter(p=>p.enabled!==false&&!snapshot.links.some(l=>l.player_id===p.player_id&&l.match_id===temp.match_id&&l.temp_id!==temp.id))
      .map(p=>`<option value="${esc(p.player_id)}"${p.player_id===selected?' selected':''}>${esc(p.full_name)}${p.is_guest?' · Guest':' · Regular roster'}</option>`).join('');
  }
  function returningChoices(s){
    if(!s)return [];
    const existing=s.profiles.filter(p=>p.is_guest&&p.enabled!==false).map(p=>({value:p.player_id,name:p.full_name,kind:'profile'}));
    const known=new Set(s.profiles.map(p=>savedNameKey(p.full_name)));
    return [...existing,...legacyGroups(s.legacy).filter(g=>!known.has(g.key)).map(g=>({value:'saved:'+encodeURIComponent(g.key),name:g.name,kind:'saved'}))];
  }
  function returningPlan(s,value,mid){
    if(!s||!s.ledger.matches.some(m=>m.id===mid))throw Error('Choose an existing game and refresh guests.');
    let group=null,p=null;
    if(value.startsWith('saved:'))group=legacyGroups(s.legacy).find(g=>g.key===decodeURIComponent(value.slice(6)));
    else p=s.profiles.find(p=>p.player_id===value&&p.is_guest&&p.enabled!==false);
    if(!group&&!p)throw Error('Choose a saved player or refresh the guest list.');
    const name=p?.full_name||group.name;
    const games=group?group.games.map(g=>{if(g.rows.length!==1)throw Error('Review duplicate saved game identities in Roster first.');const t=g.rows[0];return {temp_id:t.id,match_id:t.match_id,updated_at:t.updated_at};}):[];
    if(games.length>50)throw Error('Link this player’s older history in Roster first (maximum 50 games per review).');
    const assigned=p&&s.links.some(l=>l.player_id===p.player_id&&l.match_id===mid);
    const rows=assigned?[]:s.legacy.filter(t=>t.match_id===mid&&savedNameKey(t.name)===savedNameKey(name));
    const preferred=rows.filter(t=>t.active||t.history_eligible),candidates=preferred.length?preferred:rows;
    if(candidates.length>1)throw Error('Review duplicate TEMP entries for this game in Roster first.');
    const current=candidates[0]&&!games.some(g=>g.temp_id===candidates[0].id)?candidates[0]:null;
    const aliases=group?Object.values(group.appearances.reduce((a,t)=>{(a[t.match_id]??=[]).push(t);return a;},{})).filter(rows=>rows.length===1&&!games.some(g=>g.match_id===rows[0].match_id)).map(rows=>rows[0]):current?[current]:[];
    return {value,name,player_id:p?.player_id||null,games,current,aliases,needs_review:!!group||!!current};
  }
  function returningOptions(s,selected=''){
    const choices=returningChoices(s),option=c=>`<option value="${esc(c.value)}"${c.value===selected?' selected':''}>${esc(c.name)}</option>`;
    return '<option value="">Choose a saved player…</option>'+['profile','saved'].map(kind=>{const rows=choices.filter(c=>c.kind===kind);return rows.length?`<optgroup label="${kind==='profile'?'Reusable guest profiles':'Saved TEMP names'}">${rows.map(option).join('')}</optgroup>`:'';}).join('');
  }
  function returningReviewMarkup(plan,s,{fullNameInput=true}={}){
    if(!plan?.needs_review)return '';
    const label=mid=>{const m=s.ledger.matches.find(m=>m.id===mid);return m?(Number.isFinite(Date.parse(m.kickoff))?date(m.kickoff)+' · ':'')+(m.label||'Game'):'Saved game';};
    return `<p><strong>Reuse ${esc(plan.name)}</strong> from the saved TEMP list. No name re-entry or RSVP is needed.</p>${plan.games.length?`<details><summary>Earlier match identities to connect (${plan.games.length})</summary>${plan.games.map(g=>`<p>${esc(label(g.match_id))}</p>`).join('')}</details>`:''}${plan.aliases?.length?`<details><summary>Other saved identities to reuse (${plan.aliases.length}; no attendance inferred)</summary>${plan.aliases.map(t=>`<p>${esc(label(t.match_id))} · Identity only; game history requires participation.</p>`).join('')}</details>`:''}${fullNameInput&&plan.name.trim().split(/\s+/).length<2?`<label>Full name for referee sheet (enter once)<input name="full_name" required maxlength="80" value="${esc(plan.name)}"></label>`:''}${plan.current?`<p>Reuse the existing TEMP entry for ${esc(label(plan.current.match_id))}; no duplicate game identity will be created.</p>`:''}<label class="dues-choice"><input type="checkbox" name="identity_reviewed" required> I confirm this is the same person as the saved entries above.</label><p>Attendance and this game’s jersey are separate. Unused entries do not become played matches.</p>`;
  }
  function createReturningAssignment(controller,{canWrite=()=>true}={}){
    let identities=new Map(),requests=global.SKORTeamDues.createRequestIds(),running=false,generation=0;
    const clear=()=>{generation++;identities.clear();requests.clear();running=false;};
    function plan(value,mid){const s=controller.state().snapshot,cached=identities.get(value);try{const p=returningPlan(s,value,mid);return cached?.complete?{...p,player_id:cached.player_id}:p;}catch(e){if(!value.startsWith('saved:')||!cached)throw e;const p=returningPlan(s,cached.player_id,mid);return {...p,value,name:cached.name,needs_review:!cached.complete||p.needs_review};}}
    async function assign(input){
      const state=controller.state(),owner=state.actor,epoch=generation;if(!owner||!canWrite()||state.phase!=='ready'||running)throw Error('Refresh guests before saving, or wait for the current save.');
      const selected=String(input.selection||''),mid=String(input.match_id||'');let p=plan(selected,mid),identity=identities.get(selected);
      if(p.needs_review&&!input.reviewed)throw Error('Confirm that this is the same saved player.');
      const value=String(input.number??'').trim(),number=value===''?null:Number(value);if(number!==null&&(!Number.isInteger(number)||number<1||number>99))throw Error('Choose a match jersey number from 1 to 99, or leave it TBD.');
      const guard=()=>{if(epoch!==generation||controller.state().actor!==owner)throw Error('Account changed.');if(!canWrite())throw Error('Captain access required.');};
      const save=async(resource,action,key,payload)=>{guard();const request=requests.payload(key,payload);request.request_id=request.id;delete request.id;const result=await controller.write(resource,action,request);guard();if(controller.state().phase!=='ready')throw Error('The last step saved. Refresh guests, then retry to finish the game assignment.');requests.confirm(key);return result;};
      running=true;
      try{
        if(!p.player_id){
          if(!identity){const fullName=String(input.full_name||p.name).trim();if(fullName.split(/\s+/).length<2||fullName.length>80)throw Error('Enter the saved player’s full name once for the referee sheet.');identity={player_id:uuid(),name:fullName,complete:false,resource:p.games.length?'history':'profile',action:p.games.length?'import':'create',payload:{full_name:fullName,...(p.games.length?{create_profile:true,reviewed:true,games:p.games}:{})}};identity.payload.player_id=identity.player_id;identities.set(selected,identity);}
          if(!identity.complete){await save(identity.resource,identity.action,'identity:'+selected,identity.payload);identity.complete=true;}
          p={...p,player_id:identity.player_id};
        }else if(identity&&!identity.complete){await save(identity.resource,identity.action,'identity:'+selected,identity.payload);identity.complete=true;}
        for(const alias of p.aliases||[]){
          const snapshot=controller.state().snapshot;
          if(snapshot.links.some(l=>l.player_id===p.player_id&&l.match_id===alias.match_id&&l.temp_id===alias.id))continue;
          const fresh=snapshot.legacy.find(t=>t.id===alias.id);
          if(!fresh||fresh.updated_at!==alias.updated_at||savedNameKey(fresh.name)!==savedNameKey(alias.name))throw Error('A saved TEMP entry changed. Refresh and review it before assigning.');
          await save('profile','bind_game','bind:'+p.player_id+':'+alias.match_id,{player_id:p.player_id,match_id:alias.match_id,temp_id:alias.id,reviewed:true});
        }
        const payload={player_id:p.player_id,match_id:mid,group_id:input.group_id||null};
        if(input.inventory_id){payload.inventory_id=input.inventory_id;}
        else if(Object.hasOwn(input,'inventory_id')&&number===null){payload.inventory_id=null;}
        else {
          if(Object.hasOwn(input,'inventory_id')&&controller.state().snapshot.links.find(l=>l.player_id===p.player_id&&l.match_id===mid)?.inventory_id)
            await save('history','assign','clear-kit:'+p.player_id+':'+mid,{player_id:p.player_id,match_id:mid,inventory_id:null});
          payload.number=number===null?'':String(number);
        }
        await save('history','assign','assign:'+p.player_id+':'+mid,payload);
        return {ok:true,player_id:p.player_id};
      }finally{if(epoch===generation)running=false;}
    }
    return {assign,plan,clear};
  }
  function pendingAttendance(record){
    const s=record?.summary||{},rows=(record?.matches||[]).filter(m=>m.attendance_status==='unmarked'),count=Number(s.unmarked_count)||0;
    return {rows,count,total:Number(s.recorded_matches)||((Number(s.present_count)||0)+(Number(s.absent_count)||0)+(Number(s.excused_count)||0)+count),present:Number(s.present_count)||0,
      complete:count===rows.length&&new Set(rows.map(m=>m.match_id)).size===rows.length&&rows.every(m=>m.match_id&&Number.isFinite(Date.parse(m.kickoff))&&m.status==='final'&&Date.parse(m.kickoff)<=Date.now())};
  }
  const attendanceMatchLabel=m=>(Number.isFinite(Date.parse(m.kickoff))?date(m.kickoff):'Date unavailable')+' · '+(m.home_team==='SKOR FC'?m.away_team:m.away_team==='SKOR FC'?m.home_team:(m.home_team||'Team')+' vs '+(m.away_team||'Opponent'));
  function attendancePrompt(p,disabled=false){
    const pending=pendingAttendance(p.record);if(!p.is_guest||!pending.count)return '';
    if(!pending.complete)return '<aside class="gp-attendance-review"><p>Unmarked attendance needs review. Refresh to load the match dates.</p><button type="button" data-gp="refresh"'+(disabled?' disabled':'')+'>Refresh guest records</button></aside>';
    const off=disabled?' disabled':'',quick=pending.rows.length<=3,ids=JSON.stringify(pending.rows.map(m=>m.match_id));
    return `<aside class="gp-attendance-review" aria-label="Confirm guest attendance"><h4>Attendance needs confirmation</h4><p>${pending.total} completed games are on this record: <strong>${pending.present} confirmed attended · ${pending.count} need confirmation.</strong></p><p>Did <strong>${esc(p.full_name)}</strong> attend ${pending.count===1?'this game':'these games'}?</p><ul>${pending.rows.slice(0,3).map(m=>`<li>${esc(attendanceMatchLabel(m))}</li>`).join('')}</ul>${quick?'':`<p>Review all ${pending.count} dates before confirming.</p>`}<div class="dues-row">${quick?`<button type="button" data-gp="attendance-all" data-player="${esc(p.player_id)}" data-games="${esc(ids)}"${off}>${pending.count===1?'Yes, attended':pending.count===2?'Yes, both games':'Yes, all '+pending.count+' games'}</button>`:''}<button type="button" data-gp="attendance-review" data-player="${esc(p.player_id)}"${off}>${quick?'Review individually':'Review attendance ('+pending.count+')'}</button></div><p class="gp-attendance-note">No attendance is assumed. Leave uncertain games Unmarked.</p></aside>`;
  }
  function createAttendanceReview(controller,{canWrite=()=>true,onChange=()=>{}}={}){
    let running=false,generation=0,requests=global.SKORTeamDues.createRequestIds();
    const clear=()=>{generation++;requests.clear();running=false;};
    async function confirm(playerId,choices,{stillValid=()=>true}={}){
      const owner=controller.state().actor,epoch=generation;
      if(!owner||!canWrite()||running||controller.state().busy||controller.state().phase!=='ready')throw Error('Refresh guests before confirming attendance, or wait for the current save.');
      if(!Array.isArray(choices)||!choices.length||choices.length>50||new Set(choices.map(c=>c.match_id)).size!==choices.length||choices.some(c=>!c.match_id||!['present','absent','excused'].includes(c.status)))throw Error('Choose attendance for 1–50 distinct games, or close to leave them Unmarked.');
      const original=controller.state().snapshot?.profiles.find(p=>p.player_id===playerId);
      if(!original?.is_guest)throw Error('Review regular-player attendance in Game Day.');
      for(const choice of choices){const m=original.record?.matches?.find(m=>m.match_id===choice.match_id);if(!m||!['unmarked',choice.status].includes(m.attendance_status))throw Error('Attendance changed. Refresh and review these dates again.');}
      const guard=()=>{if(epoch!==generation||controller.state().actor!==owner)throw Error('Account changed.');if(!canWrite())throw Error('Captain access required.');if(!stillValid())throw Error('Attendance review closed or changed.');};
      const current=choice=>{const p=controller.state().snapshot?.profiles.find(p=>p.player_id===playerId),m=p?.record?.matches?.find(m=>m.match_id===choice.match_id);if(!p?.is_guest||!m||m.status!=='final'||!Number.isFinite(Date.parse(m.kickoff))||Date.parse(m.kickoff)>Date.now()||!['unmarked',choice.status].includes(m.attendance_status))throw Error('Attendance changed. Refresh and review these dates again.');return m;};
      running=true;onChange();let updated=0;
      try{
        guard();await controller.refresh();guard();if(controller.state().phase!=='ready')throw Error('Refresh failed. No further attendance will be changed.');
        choices.forEach(current);
        for(const choice of choices){
          guard();const m=current(choice),key=playerId+':'+choice.match_id+':'+choice.status;
          if(m.attendance_status===choice.status){requests.confirm(key);continue;}
          const payload=requests.payload(key,{player_id:playerId,match_id:choice.match_id,status:choice.status});payload.request_id=payload.id;delete payload.id;
          await controller.write('profile','attendance',payload);if(epoch===generation&&controller.state().actor===owner)requests.confirm(key);guard();if(controller.state().phase!=='ready')throw Error('The last choice may be saved. Refresh and review the remaining dates before retrying.');
          if(current(choice).attendance_status!==choice.status)throw Error('Attendance could not be verified. Refresh and review again.');updated++;
        }
        return {ok:true,updated};
      }finally{if(epoch===generation){running=false;onChange();}}
    }
    return {confirm,clear,isRunning:()=>running};
  }
  function mountCaptain({client,canWrite=()=>true,onChanged=()=>{},getLineupMatch=()=>null,getGameDayMatch=()=>null,doc=global.document,win=global}){
    const directory=doc.getElementById('guestDirectory'),payments=doc.getElementById('participationPayments'),lineup=doc.getElementById('guestLineupTools'),attendance=doc.getElementById('guestMatchAttendance');if(!directory)return null;
    const roots=[directory,payments,lineup,attendance].filter(Boolean),dialog=doc.getElementById('guestCaptainDialog');let s=null,group=null,filter='guest',review=null,lastMapping='',lastEngagement='',lastOwner=null,dialogGeneration=0,returningFlow=null,attendanceReviewFlow=null;
    const requestIds=global.SKORTeamDues.createRequestIds(),el=id=>dialog.querySelector('#'+id),profile=id=>s?.profiles.find(p=>p.player_id===id),name=id=>profile(id)?.full_name||s?.ledger.roster.find(p=>p.id===id)?.name||'Player';
    const groupData=()=>s?.ledger.groups.find(g=>g.id===group);
    function message(text,error=false){for(const root of roots){const out=root.querySelector('[data-gp-status]');if(out){out.textContent=text;out.classList.toggle('dues-error',error);}}}
    function open(html){dialogGeneration++;review=null;dialog.querySelector('[data-gp-dialog-body]').innerHTML=html;dialog.querySelector('[data-gp-error]').textContent='';if(!dialog.open)dialog.showModal();}
    function close(){dialogGeneration++;review=null;dialog.close();}
    function render(state){
      if(state.actor!==lastOwner){lastOwner=state.actor;s=null;group=null;filter='guest';lastMapping='';lastEngagement='';requestIds.clear();returningFlow?.clear();attendanceReviewFlow?.clear();close();dialog.querySelector('[data-gp-dialog-body]').innerHTML='';dialog.querySelector('[data-gp-error]').textContent='';}
      if(!state.actor||!state.snapshot){s=null;for(const root of roots)root.innerHTML=state.actor?`<p role="status">${esc(state.message||'Loading guest profiles…')}</p>`:'';if(state.phase==='error')close();return;}
      s=state.snapshot;if(!groupData()||groupData().kind!=='season')group=s.ledger.groups.find(g=>g.is_current)?.id||s.ledger.groups.find(g=>g.kind==='season')?.id||null;
      const openByRoot=roots.map(root=>new Set([...root.querySelectorAll('details[open]')].map(d=>d.dataset.gpKey)));
      directory.innerHTML=`<div class="dues-row"><div><h2>Guest / TEMP Player Directory</h2><p>Reusable profiles. Jersey numbers belong to each game.</p></div><button type="button" data-gp="create">Create guest profile</button></div><div class="dues-row"><label>Show<select data-gp-filter><option value="guest" ${filter==='guest'?'selected':''}>Guest / event-only players</option><option value="promoted" ${filter==='promoted'?'selected':''}>Promoted to regular roster</option><option value="all" ${filter==='all'?'selected':''}>All guest profiles</option></select></label><button type="button" data-gp="refresh">Refresh</button></div><p data-gp-status role="status"></p>
      ${s.profiles.filter(p=>filter==='all'||(filter==='guest'?p.is_guest:!p.is_guest)).map(p=>`<details class="dues-box" data-gp-key="profile-${p.player_id}"><summary>${esc(p.full_name)} · ${p.is_guest?(p.enabled?'Guest / TEMP':'Disabled'):'Regular roster'}${p.is_guest&&pendingAttendance(p.record).count?` <span class="gp-attendance-badge">${pendingAttendance(p.record).count} to confirm</span>`:''}</summary><p>${p.is_guest?'Jersey assigned per game.':`Joined regular season ${esc(p.joined_on||'')}.`} · ${p.approved_email?esc(p.approved_email):'Email not yet assigned'} · ${p.auth_user_id?'Portal claimed':'Portal not claimed'}</p>${recordMarkup(p.record,{clarify:p.is_guest})}${attendancePrompt(p,state.busy||state.phase!=='ready'||!canWrite()||attendanceReviewFlow?.isRunning())}<div class="dues-row"><button type="button" data-gp="history" data-player="${p.player_id}">Games & stats</button><button type="button" data-gp="legacy" data-player="${p.player_id}">Link previous TEMP history</button>${p.is_guest?`<button type="button" data-gp="edit" data-player="${p.player_id}">Edit profile</button><button type="button" data-gp="game" data-player="${p.player_id}">Add to game / assign jersey</button><button type="button" data-gp="event" data-player="${p.player_id}">Add to tournament</button><button type="button" data-gp="promote" data-player="${p.player_id}">Add to regular season</button>`:''}</div></details>`).join('')||'<p>No profiles in this view.</p>'}<p class="gp-directory-counts">${s.profiles.length} reusable profile${s.profiles.length===1?'':'s'} · ${legacyGroups(s.legacy).reduce((n,g)=>n+g.games.length,0)} saved game assignments awaiting linking</p>${legacyDirectoryMarkup(s,matchLabel,state.busy||state.phase!=='ready'||!canWrite())}`;
      if(payments)renderPayments();renderMatchTools();roots.forEach((root,i)=>root.querySelectorAll('details').forEach(d=>d.open=openByRoot[i].has(d.dataset.gpKey)));
      message(state.phase==='stale'?'Refresh failed. Showing the last snapshot. '+state.message:state.phase==='loading'?'Refreshing…':'Updated '+new Date(s.as_of).toLocaleTimeString(),state.phase==='stale');
      const engagement=JSON.stringify(participations(s).map(l=>[l.player_id,l.match_id,l.attendance,l.rsvp,l.rsvp_note]));if(engagement!==lastEngagement){lastEngagement=engagement;onChanged({engagementChanged:true});}
      const mapping=JSON.stringify([s.profiles.map(p=>[p.player_id,p.is_guest]),s.links.map(l=>[l.player_id,l.match_id,l.temp_id,l.active,l.temp_active,l.inventory_id,l.number])]);if(mapping!==lastMapping){lastMapping=mapping;onChanged({identityChanged:true});}
    }
    const controller=createController({client,onState:render,visible:()=>!doc.hidden&&canWrite()});
    returningFlow=createReturningAssignment(controller,{canWrite});
    attendanceReviewFlow=createAttendanceReview(controller,{canWrite,onChange:()=>render(controller.state())});
    function renderPayments(){const g=groupData(),cfg=s.fee_settings.find(f=>f.group_id===group),totals=guestTotals(s,group),pending=feeCandidates(s,group);
      payments.innerHTML=`<div class="dues-row"><div><h2>Participation & guest fees</h2><p>Reviewed individual charges. Existing players’ dues are preserved.</p></div><button type="button" data-gp="create">Create guest / event profile</button></div><label>Season<select data-gp-season>${s.ledger.groups.filter(g=>g.kind==='season').map(g=>`<option value="${g.id}" ${g.id===group?'selected':''}>${esc(g.name)}</option>`).join('')}</select></label><p data-gp-status role="status"></p>${!g?'<p>Create a season in Payments first.</p>':`<div class="dues-row"><button type="button" data-gp="calculate">Late-joiner / individual fee calculator</button><button type="button" data-gp="settings">Guest fees: ${cfg?.enabled?'Enabled':'Off'}</button><button type="button" data-gp="funding">Use guest collections in Run Numbers</button></div><div class="dues-stats"><span>Guest fees charged<b>${money(totals.charged)}</b></span><span>Collected toward guest fees<b>${money(totals.collected)}</b></span><span>Guest fees outstanding<b>${money(totals.outstanding)}</b></span><span>Waived appearances<b>${totals.waived}</b></span></div><p>Collections are allocated up to each player’s net guest fees and are already included in ledger receipts.</p>
      <details class="dues-box" data-gp-key="pending"><summary>Confirmed guest appearances awaiting review (${pending.length})</summary><p>Fees require Present attendance in a completed linked season game, on or after the fee start date. No charges are automatic.</p>${pending.map(l=>`<div class="dues-row"><span>${esc(name(l.player_id))} · ${esc(matchLabel(l.match_id))}</span><button type="button" data-gp="charge" data-player="${l.player_id}" data-match="${l.match_id}">Review fee / waiver</button></div>`).join('')||'<p>No eligible uncharged appearances.</p>'}</details>
      <details class="dues-box" data-gp-key="charges"><summary>Individual charge history</summary>${s.entries.filter(e=>e.group_id===group).map(e=>`<article class="dues-receipt"><strong>${esc(name(e.player_id))} · ${money(e.delta_cents)}</strong><p>${esc(e.category.replaceAll('_',' '))}${e.match_id?' · '+esc(matchLabel(e.match_id)):''} · ${esc(e.reason)}</p>${e.category==='guest_fee'&&!s.entries.some(x=>x.group_id===group&&x.player_id===e.player_id&&x.match_id===e.match_id&&x.category==='guest_fee_reversal')?`<button type="button" data-gp="reverse" data-entry="${e.id}" data-player="${e.player_id}">Waive / reverse charge</button>`:''}</article>`).join('')||'<p>No individual charges assigned.</p>'}</details>`}`;
    }
    function matchLabel(mid){const m=s.ledger.matches.find(m=>m.id===mid);if(!m)return 'Saved game';return (Number.isFinite(Date.parse(m.kickoff))?date(m.kickoff):'Date unavailable')+' · '+(m.label||'Game');}
    function renderMatchTools(){if(!s){for(const root of [lineup,attendance])if(root)root.innerHTML='';return;}const mid=getLineupMatch();if(lineup)lineup.innerHTML=`<h3>Reusable guest profiles</h3><p>Add a saved guest to this game. A jersey can stay TBD during planning.</p><div class="dues-row"><button type="button" data-gp="game" ${mid?'':'disabled'}>Choose guest for this game</button><button type="button" data-gp="create">Create guest profile</button></div><p data-gp-status></p>`;
      const current=getGameDayMatch(),links=participations(s).filter(l=>l.match_id===current);if(attendance)attendance.innerHTML=current?`<h3>Guest / TEMP attendance</h3><p>Confirm attendance to count appearances and calculate optional guest fees.</p><p data-gp-status></p>${links.map(l=>`<article class="dues-receipt"><strong>${l.number==null?'Jersey TBD':'#'+l.number} ${esc(name(l.player_id))}</strong><p>RSVP: ${l.rsvp==='going'?'Going':l.rsvp==='out'?"Can’t make it":'No response'}${l.rsvp_note?' · '+esc(l.rsvp_note):''} · ${esc(l.attendance||'Unmarked')}</p><div class="dues-row">${['present','absent','excused','unmarked'].map(status=>`<button type="button" data-gp="attendance" data-player="${l.player_id}" data-match="${l.match_id}" data-status="${status}" ${l.attendance===status?'disabled':''}>${status==='unmarked'?'Clear':status[0].toUpperCase()+status.slice(1)}</button>`).join('')}</div></article>`).join('')||'<p>No reusable guests linked to this game. Add a profile in Lineups or link a previous TEMP appearance.</p>'}`:'';
    }
    function selectProfiles(selected='',all=false){const list=all?s.ledger.roster:s.profiles.filter(p=>p.is_guest&&p.enabled).map(p=>({id:p.player_id,name:p.full_name}));return `<option value="">Choose player…</option>`+list.map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)}${p.is_guest?' · Guest':''}</option>`).join('');}
    function seasonOptions(selected=group){return s.ledger.groups.filter(g=>g.kind==='season').map(g=>`<option value="${g.id}" ${g.id===selected?'selected':''}>${esc(g.name)}</option>`).join('');}
    function calculator(pid='',promotion=false){const g=groupData(),last=s.ledger.scenarios.find(sc=>sc.group_id===group&&sc.applied_revision),standard=last?.preview.players.find(p=>p.discount===0)?.cents;
      const ids=new Set(s.ledger.group_matches.filter(m=>m.group_id===group).map(m=>m.match_id)),games=s.ledger.matches.filter(m=>ids.has(m.id)&&m.published);
      return `<form id="gpCalculator" data-promotion="${promotion}"><h3>${promotion?'Add to regular season':'Participation fee calculator'}</h3><label>Player<select name="player_id" required>${selectProfiles(pid,true)}</select></label><label>Season<select name="group_id" required>${seasonOptions()}</select></label><p>Link season games in Payments to suggest counts. Counts remain editable. Joining date is independent of account creation and later absences.</p><div class="dues-grid"><label>Full-season baseline ($)<input name="baseline" inputmode="decimal" required value="${standard==null?'':(standard/100).toFixed(2)}"></label><label>One-time costs included in baseline ($)<input name="fixed" inputmode="decimal" required value="0.00"></label><label>Total season games<input name="total" type="number" min="1" max="200" required value="${games.length||''}"></label><label>Games missed before joining<input name="missed" type="number" min="0" max="200" required value="0"></label><label>First eligible season date<input name="joined_on" type="date" ${promotion?'required':''}></label>${promotion?'<label>Permanent squad number (optional)<input name="number" type="number" min="1" max="99" placeholder="TBD"><small>Leave blank to join now. Assign an available match jersey in Lineups.</small></label>':''}</div><button type="button" data-gp="suggest">Suggest game counts from joining date</button><label class="dues-choice"><input type="checkbox" name="replace_guest_fees"> Replace earlier guest charges with this season assessment; preserve all receipts as credits toward it.</label><label>Reason / note<input name="reason" maxlength="1000" value="Reviewed participation fee"></label><button>Calculate & review</button></form><div id="gpCalculation"></div>`;
    }
    function openHistory(key,create=false,selected=''){
      const g=legacyGroups(s.legacy).find(g=>g.key===key);if(!g)throw Error('History changed. Refresh the directory.');
      const sources=g.appearances.map(t=>({temp_id:t.id,match_id:t.match_id,updated_at:t.updated_at}));
      const choices=s.profiles.filter(p=>p.enabled!==false).map(p=>`<option value="${esc(p.player_id)}"${p.player_id===selected?' selected':''}>${esc(p.full_name)}${p.is_guest?' · Guest':' · Regular roster'}</option>`).join('');
      const row=(t,archived=false)=>{const game=g.games.find(x=>x.match_id===t.match_id),blocked=archived,ambiguous=game?.rows.length>1;return `<label class="dues-choice gp-history-choice"><input type="checkbox" name="games" value="${esc(t.id)}"${!archived&&!ambiguous?' checked':''}${blocked?' disabled':''}><span><strong>${esc(matchLabel(t.match_id))}</strong><br>${t.number==null?'Jersey TBD':'Match jersey #'+esc(t.number)}${archived?' · No match participation':ambiguous?' · Conflicting identity — review required':''}${blocked?' · Excluded from match history':''}</span></label>`;};
      open(`<h3>${create?'Create profile & link history':'Link history to profile'}</h3><p><strong>${esc(g.name)}</strong> · ${g.games.length} saved game${g.games.length===1?'':'s'}. Attendance is recorded separately.</p><form id="gpHistory" data-group="${esc(g.key)}" data-create="${create}" data-sources="${esc(JSON.stringify(sources))}">${create?`<label>Full name<input name="full_name" required maxlength="80" value="${esc(g.name)}"></label><label>Preferred / field name<input name="preferred_name" maxlength="60"></label><label>Approved portal email (optional)<input name="email" type="email" maxlength="254"></label><label class="dues-choice"><input type="checkbox" name="different_person"> If a profile already has this name, I confirm this is a different person.</label>`:`<label>Existing profile<select name="player_id" required><option value="">Choose this person…</option>${choices}</select></label>`}<h4>Review saved games</h4>${g.games.flatMap(game=>game.rows.map(t=>row(t))).join('')}${g.archived.length?`<details><summary>Unused entries (excluded from match history) (${g.archived.length})</summary><p>These entries were not selected in the Final / Production field or bench and have no confirmed participation. Keep them for identity review; they cannot be selected as games here.</p>${g.archived.map(t=>row(t,true)).join('')}</details>`:''}<label class="dues-choice"><input type="checkbox" name="reviewed" required> I confirm all selected games belong to this person.</label><p>One save links the selected history. Existing jersey numbers, lineup identities, attendance and payments are preserved.</p><button>${create?'Create profile & link selected games':'Link selected games'}</button></form>`);
    }
    function openAttendanceReview(pid){
      const p=profile(pid),pending=pendingAttendance(p?.record);if(!p?.is_guest)throw Error('Choose a guest profile.');
      if(!pending.complete)throw Error('Refresh this guest record to load the attendance dates.');
      const rows=pending.rows.slice(0,50);
      open(`<h3>Confirm attendance · ${esc(p.full_name)}</h3><p>${pending.present} confirmed attended · ${pending.count} need confirmation. Choose only attendance you know; leave other games Unmarked.</p>${pending.count>50?'<p>Showing the first 50 dates; the remaining dates stay Unmarked for another review.</p>':''}${rows.length?`<form id="gpAttendanceReview" data-player="${esc(pid)}" data-games="${esc(JSON.stringify(rows.map(m=>m.match_id)))}">${rows.map(m=>`<article class="gp-attendance-game"><strong>${esc(attendanceMatchLabel(m))}</strong><label>Attendance<select name="attendance_${esc(m.match_id)}"><option value="unmarked" selected>Unmarked — decide later</option><option value="present">Present — attended</option><option value="absent">Absent — did not attend</option><option value="excused">Excused</option></select></label></article>`).join('')}<p>Only these choices update attendance. RSVP and jersey numbers stay unchanged.</p><button>Save confirmed choices</button></form>`:'<p>All recorded attendance is confirmed. No dates need review.</p>'}<button type="button" data-gp="attendance-refresh" data-player="${esc(pid)}">Refresh this review</button>`);
    }
    async function changed(resource,action,payload){if(!canWrite())throw Error('Captain access required.');const result=await controller.write(resource,action,payload);onChanged({identityChanged:resource==='history'||resource==='profile'&&['create','edit','bind_game','promote'].includes(action),engagementChanged:action==='attendance',feesChanged:resource==='dues'});return result;}
    async function handleClick(e){const b=e.target.closest('button[data-gp]');if(!b||b.disabled)return;const action=b.dataset.gp;try{
      if(action==='refresh')return await controller.refresh();if(action==='close')return close();if(!s)throw Error('Refresh guest profiles first.');
      const pid=b.dataset.player,p=profile(pid),mid=b.dataset.match||getLineupMatch();
      if(['legacy-create','legacy-link'].includes(action)){
        if(!canWrite())throw Error('Captain access required.');
        if(controller.state().busy||controller.state().phase!=='ready')throw Error('Refresh the directory before reviewing saved history.');
        openHistory(b.dataset.group,action==='legacy-create',pid);return;
      }
      if(action==='attendance-review'){
        if(!canWrite()||controller.state().busy||controller.state().phase!=='ready'||attendanceReviewFlow.isRunning())throw Error('Refresh guests before reviewing attendance.');
        openAttendanceReview(pid);return;
      }
      if(action==='attendance-all'){
        const owner=controller.state().actor;try{const ids=JSON.parse(b.dataset.games||'[]');await attendanceReviewFlow.confirm(pid,ids.map(match_id=>({match_id,status:'present'})));if(controller.state().actor===owner)message('Attendance confirmed for the listed games.');}catch(error){if(controller.state().actor===owner)message(error.message||'Attendance save failed.',true);}return;
      }
      if(action==='attendance-refresh'){
        const owner=controller.state().actor,generation=dialogGeneration,ok=await controller.refresh();if(controller.state().actor!==owner||generation!==dialogGeneration||!dialog.open)return;if(!ok||controller.state().phase!=='ready')throw Error('Refresh failed. No further attendance will be changed.');openAttendanceReview(pid);return;
      }
      if(action==='create'||action==='edit'){open(`<h3>${action==='create'?'Create reusable guest profile':'Edit guest profile'}</h3><form id="gpProfile" data-player="${pid||''}" data-event="${b.dataset.event||''}" data-event-revision="${s.ledger.groups.find(g=>g.id===b.dataset.event)?.revision??''}"><label>Full name<input name="full_name" required maxlength="80" value="${esc(p?.full_name||'')}"></label><label>Preferred / field name<input name="preferred_name" maxlength="60" value="${esc(p?.preferred_name||'')}"></label><label>Approved portal email (optional)<input name="email" type="email" maxlength="254" value="${esc(p?.approved_email||'')}"></label><label>Position<input name="position" maxlength="80" value="${esc(p?.position||'Player')}"></label>${p?`<label class="dues-choice"><input type="checkbox" name="enabled" ${p.enabled?'checked':''}> Guest portal enabled</label>`:''}<p>No jersey number is assigned to this profile. Add one separately for each game. Check the directory for an existing profile before creating another.</p><button>Save guest profile</button></form>`);return;}
      if(action==='history'){open(`<h3>${esc(p.full_name)} · Games & stats</h3>${recordMarkup(p.record,{clarify:p.is_guest})}${p.record.matches.map(m=>`<article class="dues-receipt"><strong>${esc(date(m.kickoff))} · ${esc(m.home_team+' vs '+m.away_team)}</strong><p>${esc(m.attendance_status)} · ${m.my_goals} goals · ${m.my_assists} assists · ${m.my_motm?'Man of the Match · ':''}${m.my_yellow_cards} yellow / ${m.my_red_cards} red</p></article>`).join('')||'<p>No completed official games recorded yet.</p>'}`);return;}
      if(action==='game'){open(`<h3>Add guest / assign match jersey</h3><form id="gpGame"><label>Guest<select name="player_id" required>${returningOptions(s,pid)}</select></label><label>Game<select name="match_id" required><option value="">Choose game…</option>${s.ledger.matches.map(m=>`<option value="${m.id}" ${m.id===mid?'selected':''}>${esc(matchLabel(m.id))}</option>`).join('')}</select></label><label>Jersey number for this game (optional)<input name="number" type="number" min="1" max="99" placeholder="TBD"></label><label>Event scope (optional)<select name="group_id"><option value="">Independent game fill-in</option>${s.ledger.groups.filter(g=>g.kind==='event').map(g=>`<option value="${g.id}">${esc(g.tag)}</option>`).join('')}</select></label><div id="gpReturningReview"></div><p>Returning players keep one profile. RSVP is not required. Choose the number worn in this game; older jerseys are never copied.</p><button>Save game assignment</button></form>`);const form=dialog.querySelector('#gpGame'),link=s.links.find(l=>l.player_id===form.elements.player_id.value&&l.match_id===form.elements.match_id.value);if(link){form.elements.number.value=link.number??'';form.elements.group_id.value=link.source_group_id||'';}return;}
      if(action==='legacy'){open(`<h3>Choose saved player history</h3><p>Review the person and games before linking.</p>${legacyGroups(s.legacy).filter(g=>g.games.length).map(g=>`<div class="dues-row"><span>${esc(g.name)} · ${g.games.length} saved games</span><button type="button" data-gp="legacy-link" data-group="${esc(g.key)}" data-player="${esc(pid)}">Review history</button></div>`).join('')||'<p>No unlinked history.</p>'}`);return;}
      if(action==='event'){open(`<h3>Add guest to tournament</h3><form id="gpEvent"><label>Guest<select name="player_id" required>${selectProfiles(pid)}</select></label><label>Event<select name="group_id" required>${s.ledger.groups.filter(g=>g.kind==='event').map(g=>`<option value="${g.id}">${esc(g.tag)}</option>`).join('')}</select></label><p>The profile counts toward event planning and can claim its portal later.</p><button>Add participant</button></form>`);return;}
      if(action==='calculate'||action==='promote'){open(calculator(pid,action==='promote'));return;}
      if(action==='settings'){const cfg=s.fee_settings.find(c=>c.group_id===group);open(`<h3>Guest fees · ${esc(groupData().name)}</h3><form id="gpFeeSettings"><label class="dues-choice"><input type="checkbox" name="enabled" ${cfg?.enabled?'checked':''}> Enable guest fee proposals</label><label>Default fee per game ($)<input name="rate" inputmode="decimal" required value="${((cfg?.rate_cents||0)/100).toFixed(2)}"></label><label>Games on or after<input name="effective_on" type="date" required value="${cfg?.effective_on||date(Date.now())}"></label><p>Enabling fees never creates charges. Review each confirmed appearance before charging or waiving it.</p><button>Save guest fee settings</button></form>`);return;}
      if(action==='charge'){const cfg=s.fee_settings.find(c=>c.group_id===group);open(`<h3>Review guest fee</h3><p>${esc(name(pid))} · ${esc(matchLabel(mid))}</p><form id="gpFee" data-player="${pid}" data-match="${mid}"><label>Fee ($)<input name="amount" inputmode="decimal" required value="${(cfg.rate_cents/100).toFixed(2)}"></label><label class="dues-choice"><input type="checkbox" name="waive"> Waive this appearance</label><label>Reason / note<input name="reason" maxlength="1000"></label><button>Assign reviewed fee / waiver</button></form>`);return;}
      if(action==='reverse'){open(`<h3>Reverse guest charge</h3><form id="gpReverse" data-entry="${b.dataset.entry}" data-player="${pid}"><label>Reason<input name="reason" required maxlength="1000"></label><p>The charge stays in history. Existing payments become credit; no money is refunded automatically.</p><button>Apply charge reversal</button></form>`);return;}
      if(action==='attendance'){await changed('profile','attendance',requestIds.payload('attendance',{player_id:pid,match_id:mid,status:b.dataset.status,request_id:uuid()}));return;}
      if(action==='suggest'){const f=dialog.querySelector('#gpCalculator'),ids=new Set(s.ledger.group_matches.filter(m=>m.group_id===f.elements.group_id.value).map(m=>m.match_id)),games=s.ledger.matches.filter(m=>ids.has(m.id)&&m.published),joined=f.elements.joined_on.value;if(!joined||!games.length)throw Error('Choose a joining date and link season games in Payments first.');f.elements.total.value=games.length;f.elements.missed.value=games.filter(m=>date(m.kickoff)<joined).length;el('gpCalculation').innerHTML='';return;}
      if(action==='funding'){const input=doc.querySelector('#duesScenarioForm [name=contribution]');if(!input)throw Error('Open a new season/event in Payments and its Run Numbers section first.');input.value=(guestTotals(s,group).collected/100).toFixed(2);doc.getElementById('duesScenarioDisclosure').open=true;input.dispatchEvent(new Event('input',{bubbles:true}));message('Guest collections copied into the planning contribution. This does not move money or change assigned dues.');return;}
    }catch(error){dialog.querySelector('[data-gp-error]').textContent=error.message||'Action failed.';message(error.message||'Action failed.',true);}}
    async function handleSubmit(e){const f=e.target;if(!f.id.startsWith('gp'))return;e.preventDefault();if(!dialog.open||!f.isConnected)return;const button=f.querySelector('button');if(button.disabled)return;const owner=controller.state().actor,generation=dialogGeneration;button.disabled=true;
      try{const data=new FormData(f),get=k=>String(data.get(k)||''),payload={};let resource='profile',action,key=f.id;
        if(f.id==='gpAttendanceReview'){
          const ids=JSON.parse(f.dataset.games||'[]'),choices=ids.map(match_id=>({match_id,status:get('attendance_'+match_id)})).filter(c=>c.status!=='unmarked');
          await attendanceReviewFlow.confirm(f.dataset.player,choices,{stillValid:()=>controller.state().actor===owner&&generation===dialogGeneration&&dialog.open&&f.isConnected});
          if(controller.state().actor===owner&&generation===dialogGeneration&&dialog.open&&f.isConnected){close();message('Attendance choices saved. Unconfirmed dates remain Unmarked.');}return;
        }
        if(f.id==='gpProfile'){if(f.dataset.event)Object.assign(payload,{group_id:f.dataset.event,revision:Number(f.dataset.eventRevision)});action=f.dataset.player?'edit':'create';Object.assign(payload,{player_id:f.dataset.player||(f.dataset.newPlayerId||(f.dataset.newPlayerId=uuid())),full_name:get('full_name').trim(),preferred_name:get('preferred_name').trim(),email:get('email').trim(),position:get('position'),enabled:!f.dataset.player||data.has('enabled')});}
        else if(f.id==='gpGame'){await returningFlow.assign({selection:get('player_id'),match_id:get('match_id'),number:get('number'),group_id:get('group_id')||null,reviewed:data.has('identity_reviewed'),full_name:get('full_name')});if(controller.state().actor===owner&&generation===dialogGeneration&&dialog.open&&f.isConnected){close();message('Saved player added with this game’s jersey. RSVP is unchanged.');}return;}
        else if(f.id==='gpHistory'){
          if(!data.has('reviewed'))throw Error('Confirm the selected games belong to this person.');
          if(controller.state().phase!=='ready')throw Error('Refresh the directory before linking history.');
          const sources=JSON.parse(f.dataset.sources),ids=data.getAll('games'),games=ids.map(id=>sources.find(t=>t.temp_id===id));
          if(!games.length||games.some(t=>!t)||new Set(games.map(t=>t.match_id)).size!==games.length)throw Error('Select one assignment per game.');
          const create=f.dataset.create==='true',pid=create?(f.dataset.newPlayerId||(f.dataset.newPlayerId=uuid())):get('player_id');
          if(!pid)throw Error('Choose an existing profile.');resource='history';action='import';key='history:'+f.dataset.group;
          Object.assign(payload,{player_id:pid,reviewed:true,games,create_profile:create});
          if(create)Object.assign(payload,{full_name:get('full_name').trim(),preferred_name:get('preferred_name').trim(),email:get('email').trim(),different_person:data.has('different_person')});
        }
        else if(f.id==='gpEvent'){const g=s.ledger.groups.find(g=>g.id===get('group_id'));if(!g)throw Error('Create an event in Payments first.');action='event_member';Object.assign(payload,{player_id:get('player_id'),group_id:g.id,revision:g.revision,active:true});}
        else if(f.id==='gpFeeSettings'){resource='dues';action='fee_settings';Object.assign(payload,{group_id:group,revision:groupData().revision,enabled:data.has('enabled'),rate_cents:cents(get('rate')),effective_on:get('effective_on')});}
        else if(f.id==='gpFee'){resource='dues';action='guest_fee';Object.assign(payload,{group_id:group,revision:groupData().revision,player_id:f.dataset.player,match_id:f.dataset.match,amount_cents:cents(get('amount')),waive:data.has('waive'),reason:get('reason')});}
        else if(f.id==='gpReverse'){resource='dues';action='reverse_guest_fee';Object.assign(payload,{group_id:group,revision:groupData().revision,player_id:f.dataset.player,fee_id:f.dataset.entry,reason:get('reason')});}
        else if(f.id==='gpCalculator'){
          const total=Number(get('total')),included=total-Number(get('missed')),plan={group_id:get('group_id'),player_id:get('player_id'),baseline_cents:cents(get('baseline')),fixed_cents:cents(get('fixed')),total_games:total,included_games:included,joined_on:get('joined_on')||null,replace_guest_fees:data.has('replace_guest_fees')},amount=prorate(plan),owner=controller.state().actor,formSnapshot=JSON.stringify([...data]);
          const r=await client.rpc('preview_participation_dues',{p:plan});if(controller.state().actor!==owner||!dialog.open||!f.isConnected||JSON.stringify([...new FormData(f)])!==formSnapshot)throw Error('Account or review changed.');if(r.error)throw r.error;if(r.data.participation_cents!==amount)throw Error('Calculation could not be verified.');
          review={q:r.data,reason:get('reason'),promotion:f.dataset.promotion==='true',number:get('number'),joined_on:get('joined_on')};
          el('gpCalculation').innerHTML=`<h4>Review individual charge</h4><p>${esc(name(plan.player_id))} · ${esc(s.ledger.groups.find(g=>g.id===plan.group_id)?.name)}</p><p>${money(plan.fixed_cents)} fixed + (${money(plan.baseline_cents-plan.fixed_cents)} × ${included} / ${total}) = <strong>${money(amount)}</strong></p><div class="dues-stats"><span>Current dues<b>${money(r.data.old_cents)}</b></span><span>Proposed total dues<b>${money(r.data.new_cents)}</b></span><span>Recorded net payments<b>${money(r.data.paid_cents)}</b></span><span>New balance<b>${money(r.data.balance_cents)}</b></span></div><p>Other players’ dues stay unchanged. Season assigned charges change by ${money(r.data.budget_delta_cents)}; this may change budget coverage.</p><form id="gpApply"><label class="dues-choice"><input type="checkbox" name="reviewed" required> I reviewed the games, charges and existing payments.</label><button>${review.promotion?'Join season & apply reviewed dues':'Apply reviewed charge'}</button></form>`;return;
        }else if(f.id==='gpApply'){if(!review)throw Error('Calculate and review again.');const {q}=review;
          if(review.promotion){action='promote';Object.assign(payload,{player_id:q.player_id,group_id:q.group_id,revision:q.revision,joined_on:review.joined_on,number:review.number,charge_plan:q.plan,expected_old_cents:q.old_cents});}
          else{resource='dues';action='participation';Object.assign(payload,{group_id:q.group_id,player_id:q.player_id,revision:q.revision,plan:q.plan,expected_old_cents:q.old_cents,reason:review.reason});}
        }else return;
        const request=requestIds.payload(key,payload);if(['profile','history'].includes(resource)){request.request_id=request.id;delete request.id;}
        await changed(resource,action,request);requestIds.confirm(key);
        if(controller.state().actor!==owner||generation!==dialogGeneration||!dialog.open||!f.isConnected)return;
        close();
        if(f.id==='gpHistory'){
          const linked=profile(payload.player_id);if(linked&&filter!=='all'){filter=linked.is_guest?'guest':'promoted';render(controller.state());}
          const card=directory.querySelector('[data-gp-key="profile-'+payload.player_id+'"]');if(card)card.open=true;
          message(controller.state().phase==='ready'?'Selected history linked. Open the profile for games & stats or to join a regular season.':'Link saved. Refresh the directory to update its history.',controller.state().phase!=='ready');
        }else message('Saved. Profile history and ledger balances are retained.');
      }catch(error){if(controller.state().actor===owner&&generation===dialogGeneration&&dialog.open&&f.isConnected)dialog.querySelector('[data-gp-error]').textContent=error.message||'Save failed.';}finally{if(button.isConnected)button.disabled=false;}}
    roots.forEach(root=>{root.addEventListener('click',handleClick);root.addEventListener('change',e=>{if(e.target.matches('[data-gp-filter]')){filter=e.target.value;render(controller.state());}if(e.target.matches('[data-gp-season]')){group=e.target.value;render(controller.state());}});});dialog.addEventListener('click',handleClick);dialog.addEventListener('submit',handleSubmit);dialog.addEventListener('input',e=>{if(e.target.closest('#gpCalculator')){review=null;if(el('gpCalculation'))el('gpCalculation').innerHTML='<p>Inputs changed. Calculate again.</p>';}});
    win.addEventListener('skor:create-event-guest',e=>{const button=doc.createElement('button');button.dataset.gp='create';button.dataset.event=e.detail.groupId;void handleClick({target:button});});
    dialog.addEventListener('change',e=>{const f=e.target.closest('#gpGame');if(!f||!['player_id','match_id'].includes(e.target.name))return;const link=s?.links.find(l=>l.player_id===f.elements.player_id.value&&l.match_id===f.elements.match_id.value);f.elements.number.value=link?.number??'';f.elements.group_id.value=link?.source_group_id||'';const target=el('gpReturningReview');try{target.innerHTML=returningReviewMarkup(returningFlow.plan(f.elements.player_id.value,f.elements.match_id.value),s);}catch(error){target.textContent=error.message;}});
    doc.addEventListener('visibilitychange',()=>controller.resume());win.addEventListener('focus',()=>controller.resume());win.addEventListener('pagehide',()=>controller.pause());
    const clear=()=>{close();s=null;controller.clear();const regular=doc.getElementById('regularRosterWorkspace');if(regular)regular.hidden=false;directory.hidden=true;doc.querySelectorAll('[data-roster-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.rosterTab==='regular')));};return {...controller,assignReturning:input=>canWrite()?returningFlow.assign(input):Promise.reject(Error('Captain access required.')),returningPlan:(value,mid)=>returningFlow.plan(value,mid),clear,start:id=>canWrite()?controller.start(id):(clear(),Promise.resolve(false)),isMatchAlias:(key,mid)=>!!s?.links.some(l=>l.match_id===mid&&s.profiles.find(p=>p.player_id===l.player_id)?.player_key===key&&l.active&&l.temp_active!==false),attendanceRows:mid=>(s?participations(s).filter(l=>l.match_id===mid).map(l=>({roster_player_id:l.player_id,player_key:l.temp_id?'temp:'+l.temp_id:profile(l.player_id)?.player_key,jersey_number:l.number,display_name:profile(l.player_id)?.preferred_name||name(l.player_id).split(/\s+/)[0],attendance_status:l.attendance,rsvp_status:l.rsvp,rsvp_note:l.rsvp_note})):[]),boundAttendance:(mid)=>s?participations(s).filter(l=>l.match_id===mid).map(l=>l.player_id):[],renderMatchTools,hasSnapshot:()=>!!s};
  }
  global.SKORGuestProfiles={pendingAttendance,attendancePrompt,createAttendanceReview,returningChoices,returningOptions,returningPlan,returningReviewMarkup,createReturningAssignment,legacyGroups,legacyDirectoryMarkup,legacyProfileChoices,participations,prorate,date,feeCandidates,guestTotals,recordMarkup,createController,mountCaptain};
})(typeof window==='object'?window:globalThis);
