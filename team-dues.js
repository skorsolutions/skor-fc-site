/* Shared captain ledger / self-only player dues. All writes are validated again by PostgreSQL. */
(function(global){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=c=>c===null||c===undefined?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
  const methods=['Venmo','Zelle','Cash App','Cash','Check'];
  const uuid=()=>global.crypto.randomUUID();
  const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
  function cents(value){
    const s=String(value).trim();if(!/^\d{1,7}(\.\d{1,2})?$/.test(s))throw Error('Enter a positive dollar amount with at most two decimal places.');
    const [d,f='']=s.split('.'),n=Number(d)*100+Number(f.padEnd(2,'0'));if(n>100000000)throw Error('Maximum amount is $1,000,000.');return n;
  }
  function allocate(plan){
    if(!Array.isArray(plan.costs)||!plan.costs.length||plan.costs.length>30||!Array.isArray(plan.players)||!plan.players.length||plan.players.length>200)throw Error('Choose cost lines and participants.');
    let budget=0;for(const c of plan.costs){if(typeof c.label!=='string'||!c.label.length||c.label.length>100||!Number.isInteger(c.cents)||c.cents<0||c.cents>100000000)throw Error('Invalid cost line.');budget+=c.cents;}
    const contribution=plan.contribution_cents;if(budget>100000000||!Number.isInteger(contribution)||contribution<0||contribution>budget)throw Error('Team contribution must be within the budget.');
    const seen=new Set(),players=plan.players.map(p=>{
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.player_id)||seen.has(p.player_id.toLowerCase())||!Number.isInteger(p.discount)||p.discount<0||p.discount>100)throw Error('Use unique roster players and whole discounts from 0 to 100%.');
      seen.add(p.player_id.toLowerCase());return {...p,player_id:p.player_id.toLowerCase(),weight:100-p.discount};
    });
    const target=budget-contribution,weights=players.reduce((s,p)=>s+p.weight,0);if(!weights&&target)throw Error('At least one player must have a share above zero.');
    let assigned=0;for(const p of players){const numerator=BigInt(target)*BigInt(p.weight);p.cents=weights?Number(numerator/BigInt(weights)):0;p.remainder=weights?Number(numerator%BigInt(weights)):0;assigned+=p.cents;}
    players.sort((a,b)=>b.remainder-a.remainder||(a.player_id<b.player_id?-1:a.player_id>b.player_id?1:0));players.slice(0,target-assigned).forEach(p=>p.cents++);
    return {budget_cents:budget,contribution_cents:contribution,assigned_cents:target,players:players.sort((a,b)=>(a.player_id<b.player_id?-1:a.player_id>b.player_id?1:0)).map(({player_id,discount,cents})=>({player_id,discount,cents}))};
  }
  function createRequestIds(makeId=uuid){
    const pending=new Map();
    return {payload(key,payload){const text=JSON.stringify(payload);let entry=pending.get(key);if(!entry||entry.text!==text){entry={text,id:makeId()};pending.set(key,entry);}return {...payload,id:entry.id};},confirm:key=>pending.delete(key),peek:key=>pending.get(key)?.id,clear:()=>pending.clear()};
  }
  function normalize(s,mode){
    if(!s||!Array.isArray(s.groups)||!Number.isFinite(Date.parse(s.as_of)))throw Error('Ledger response unavailable.');
    if(mode==='captain'&&!['roster','members','payments','scenarios','matches','group_matches','strategies','shares','audit'].every(k=>Array.isArray(s[k])))throw Error('Ledger response incomplete.');
    const balances=mode==='captain'?s.members:s.groups.map(g=>g.balance);
    for(const b of balances){if(!b||!['assigned_cents','balance_cents'].every(k=>b[k]===null||Number.isSafeInteger(b[k]))||!Number.isSafeInteger(b.paid_cents)||typeof b.status!=='string'||b.paid_cents<0||(b.assigned_cents===null?b.balance_cents!==null:b.assigned_cents<0||b.assigned_cents-b.paid_cents!==b.balance_cents))throw Error('Invalid ledger totals.');}
    return s;
  }
  function createController({client,mode,onState=()=>{},visible=()=>true,schedule=setTimeout,cancel=clearTimeout}){
    let owner=null,epoch=0,snapshot=null,phase='idle',message='',busy=false,pending=null,timer=null;
    const state=()=>({owner,snapshot,phase,message,busy});const emit=()=>onState(state());
    function pause(){if(timer!==null)cancel(timer);timer=null;}
    function arm(){pause();if(owner&&!busy&&visible())timer=schedule(()=>{timer=null;void refresh();},30000);}
    function clear(){epoch++;owner=null;snapshot=null;phase='idle';message='';busy=false;pending=null;pause();emit();}
    async function same(actor){const r=await client.auth.getSession();return !r.error&&r.data?.session?.user?.id===actor;}
    function refresh(){
      if(!owner||!visible()||busy)return Promise.resolve(false);if(pending)return pending;
      const gen=epoch,actor=owner;pause();phase='loading';emit();
      pending=Promise.resolve().then(async()=>{
        try{if(!await same(actor)){if(gen===epoch)clear();return false;}if(gen!==epoch)return false;
          const r=await client.rpc(mode==='captain'?'get_captain_dues':'get_my_dues');if(gen!==epoch)return false;if(r.error)throw r.error;
          snapshot=normalize(r.data,mode);phase='ready';message='';emit();return true;
        }catch(e){if(gen===epoch){if(e.code==='42501')snapshot=null;phase=snapshot?'stale':'error';message=e.message||'Refresh failed.';emit();}return false;}
        finally{if(gen===epoch){pending=null;arm();}}
      });return pending;
    }
    async function start(id){if(owner===id)return refresh();clear();owner=id||null;return refresh();}
    async function command(action,payload){
      if(!owner||mode!=='captain'||busy)throw Error('Captain access required or another change is in progress.');
      const gen=epoch,actor=owner;busy=true;pause();emit();
      try{if(pending)await pending;if(!await same(actor)){if(gen===epoch)clear();throw Error('Account changed. Sign in again.');}if(gen!==epoch)throw Error('Account changed.');
        const r=await client.rpc('manage_team_dues',{p_action:action,p_payload:payload});if(gen!==epoch)throw Error('Account changed.');if(r.error)throw r.error;
        if(r.data?.ok!==true)throw Error('Change could not be verified.');busy=false;await refresh();return r.data;
      }catch(e){if(gen===epoch){if(e.code==='42501')snapshot=null;message=e.message||'Change failed.';phase=snapshot?'stale':'error';emit();}throw e;}
      finally{if(gen===epoch){busy=false;emit();arm();}}
    }
    return {state,start,clear,refresh,command,pause,resume:()=>visible()?refresh():(pause(),Promise.resolve(false))};
  }
  const badge=b=>`<span class="dues-status ${b.balance_cents>0?'dues-owed':b.balance_cents<0?'dues-credit':''}">${esc(b.status)}</span>`;
  function playerMarkup(s){
    return s.groups.map(g=>`<article class="dues-player-card"><div class="dues-row"><div><span class="dues-tag">${esc(g.tag)}</span><h3>${esc(g.name)}</h3></div>${badge(g.balance)}</div>
      <p class="dues-big">${g.balance.opening_paid?'Season paid':g.balance.balance_cents===null?'Dues not assigned':g.balance.balance_cents>0?money(g.balance.balance_cents)+' owed':g.balance.balance_cents<0?money(-g.balance.balance_cents)+' credit':g.kind==='season'?'Season paid':'Event paid'}</p>
      ${g.balance.opening_paid?'<p>Confirmed paid by captain. Historical amounts and payment methods were not entered.</p>':`<div class="dues-stats"><span>Assigned <b>${money(g.balance.assigned_cents)}</b></span><span>Recorded net payments <b>${money(g.balance.paid_cents)}</b></span></div>`}
      ${!g.balance.active?'<p>Past participation. Your balance and payment history are retained.</p>':''}
      ${g.description?`<p>${esc(g.description)}</p>`:''}${g.due_on?`<p>Due ${esc(g.due_on)}</p>`:''}
      <details><summary>Payment instructions & history</summary><p class="dues-instructions">${esc(g.instructions||'Ask a captain for payment instructions.')}</p><p>Pay using the instructions above. Captains record payments here after confirming receipt.</p>
      ${g.payments.map(p=>`<p>${esc(p.date)} · ${esc(p.method)} · ${p.kind==='refund'?'Refund ':''}${money(p.cents)}${p.voided?' · Voided':''}</p>`).join('')||'<p>No individual receipts recorded.</p>'}</details>
      ${(g.matches||[]).map(m=>`<details class="dues-match"><summary>${esc(m.label)} · ${esc(new Date(m.kickoff).toLocaleDateString())}</summary>
        ${m.lineup?`<h4>Final / Production lineup · ${esc(m.lineup.name)}</h4><div class="dues-lineup">${lineupMarkup(m.lineup,s.roster||[])}</div>`:'<p>Final lineup not published yet.</p>'}
        ${(m.strategies||[]).map(t=>`<button type="button" data-dues-animation="${esc(t.id)}">View strategy · ${esc(t.title)}</button>`).join('')||'<p>No player-ready strategies shared yet.</p>'}</details>`).join('')}
    </article>`).join('')||'<p>No season or event dues assigned to your roster profile yet.</p>';
  }
  function lineupMarkup(lineup,roster){
    const byKey=new Map(roster.map(p=>[String(p.key),p]));for(const p of lineup.temp_players||[])byKey.set('temp:'+p.id,{name:String(p.display_name||'TEMP').replace(/\s*[-·]\s*TEMP$/i,'').split(/\s+/)[0]+' · TEMP',number:p.jersey_number});
    const state=global.SKORKeeperPlan?.hydrate(lineup.state,roster.map(p=>({player_key:p.key,number:p.number,name:p.name,position:p.position})))||lineup.state;
    const marker=(role,id)=>{const p=byKey.get(String(id)),keeper=global.SKORKeeperPlan?.details(state,String(id),p?.number),spare=keeper?.jerseyNumber!=null&&String(keeper.jerseyNumber)!==String(p?.number)?' / '+keeper.jerseyNumber:'';
      return `<span><b>${esc(role)}</b> #${esc(p?.number??'—')}${esc(spare)} ${esc(p?.name||'Player')}${keeper?.label?' ('+esc(keeper.label)+')':''}</span>`;};
    const slots=state?.formation==='Freeform / Custom'?Object.keys(state?.freeform||{}).map(id=>['Field',id]):Object.entries(state?.slots||{});
    return slots.filter(([,id])=>id).map(([role,id])=>marker(role,id)).join('')+((state?.bench||[]).length?'<h4>Substitutes</h4>'+state.bench.map(id=>marker('Sub',id)).join(''):'')||'<span>See the captain’s final gameplan for this lineup.</span>';
  }
  function assignmentPreview(member,proposed){const old=member?.assigned_cents||0,preserved=member?.allocation_mode==='individual',next=preserved?old:(proposed??0),paid=member?.paid_cents||0;return {old,next,delta:next-old,balance:next-paid,preserved};}
  function mount({rootId,client,mode='captain',canWrite=()=>true,onBalances=()=>{},doc=global.document,win=global}){
    const root=doc.getElementById(rootId);if(!root)return null;
    let current=null,selected=null,editorGroup=null,lastOwner=null,compare=new Set(),review=null,requestCache=createRequestIds();
    const selectedGroup=()=>current?.groups.find(g=>g.id===selected);
    const name=id=>current?.roster?.find(p=>p.id===id)?.name||'Player';
    const members=()=>current.members.filter(m=>m.group_id===selected);
    const scenarios=()=>current.scenarios.filter(s=>s.group_id===selected);
    const el=id=>root.querySelector('#'+id);
    function tell(t,error=false){const e=el('duesMessage');if(e){e.textContent=t;e.classList.toggle('dues-error',error);}}
    function install(){
      root.innerHTML=`<div class="dues-row"><div><h2>${mode==='captain'?'Team payments':'My season & event dues'}</h2><p>${mode==='captain'?'Plan costs, assign dues and record payments received outside the app.':'Your balances stay linked to your roster profile.'}</p></div><button type="button" data-dues-action="refresh">Refresh</button></div><p data-dues-sync role="status"></p><p id="duesMessage" role="status"></p>
      ${mode==='captain'?`<div class="dues-row"><label>Season / event<select id="duesGroup"></select></label><button type="button" data-dues-action="new">New season / event</button></div><div id="duesReport"></div><div id="duesEditor"></div><details class="dues-box"><summary>Team payment instructions</summary><form id="duesInstructions"><label>Default instructions<textarea name="instructions" maxlength="4000" rows="5"></textarea></label><button>Save instructions</button></form></details>`:'<div id="duesPlayerCards"></div>'}
      <dialog class="dues-dialog"><div data-dues-dialog-body></div><button type="button" data-dues-action="close">Close</button></dialog>`;
    }
    function render(state){
      if(state.owner!==lastOwner){lastOwner=state.owner;selected=null;editorGroup=null;requestCache.clear();compare.clear();root.innerHTML='';if(state.owner)install();}
      if(!state.owner){root.innerHTML='';onBalances(null);return;}
      const sync=root.querySelector('[data-dues-sync]');sync.textContent=state.phase==='loading'?'Refreshing ledger…':state.phase==='error'?'Ledger unavailable. Refresh to retry.':state.phase==='stale'?'Refresh failed. Showing the last successful ledger snapshot.':state.snapshot?'Updated '+new Date(state.snapshot.as_of).toLocaleTimeString()+' · Checks every 30 seconds while visible.':'';
      sync.classList.toggle('dues-error',['error','stale'].includes(state.phase));
      if(!state.snapshot){current=null;editorGroup=null;review=null;onBalances(null);for(const id of ['duesReport','duesPlayerCards','duesEditor','duesGroup'])if(el(id))el(id).innerHTML='';const f=el('duesInstructions');if(f)f.elements.instructions.value='';root.querySelector('dialog')?.close();global.SKOREventAnimation?.stop();if(state.message)tell(state.message,true);return;}
      current=state.snapshot;onBalances(current);
      if(mode==='player'){const host=el('duesPlayerCards');const open=new Set([...host.querySelectorAll('details[open]')].map(d=>d.querySelector('summary').textContent));host.innerHTML=playerMarkup(current);host.querySelectorAll('details').forEach(d=>d.open=open.has(d.querySelector('summary').textContent));return;}
      if(!selectedGroup())selected=current.groups[0]?.id||null;
      const picker=el('duesGroup');picker.innerHTML=current.groups.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}${g.is_current?' · Current season':''}</option>`).join('');picker.value=selected||'';
      renderReport();if(editorGroup!==selected){renderEditor();editorGroup=selected;}
      if(state.message)tell(state.message,true);
    }
    const controller=createController({client,mode,onState:render,visible:()=>!doc.hidden});
    function renderReport(){
      const host=el('duesReport'),opened=new Set([...host.querySelectorAll('details[open]')].map(d=>d.querySelector('summary').textContent.replace(/ \(\d+\)$/,'')));
      const g=selectedGroup();if(!g){host.innerHTML='<p>Create a season or event to begin.</p>';return;}
      const editor=el('duesGroupForm'),editorStale=!!editor&&(Number(editor.dataset.revision)!==g.revision||current.roster.some(p=>![...editor.querySelectorAll('[name=player]')].some(input=>input.value===p.id)));
      const mm=members(),assigned=mm.reduce((s,m)=>s+(m.assigned_cents||0),0),paid=mm.reduce((s,m)=>s+m.paid_cents,0),owed=mm.reduce((s,m)=>s+Math.max(0,m.balance_cents||0),0),credit=mm.reduce((s,m)=>s+Math.max(0,-(m.balance_cents||0)),0);
      host.innerHTML=`<div class="dues-row"><h3>${esc(g.name)} <span class="dues-tag">${esc(g.tag)}</span></h3><span>Revision ${g.revision}</span></div>
      ${editorStale?'<p class="dues-notice">Participants or season details changed. Your editor draft is preserved. <button type="button" data-dues-action="reload-editor">Reload participants & calculator</button> Reloading replaces the editor draft with current records.</p>':''}${g.opening_paid?'<p class="dues-notice">Original Fall 2026 players remain confirmed paid, with historical amounts unknown. New guest or late-joiner charges are listed separately below.</p>':''}${!g.opening_paid||mm.some(m=>m.assigned_cents!==null)?`<div class="dues-stats"><span>Assigned <b>${money(assigned)}</b></span><span>Net recorded <b>${money(paid)}</b></span><span>Outstanding <b>${money(owed)}</b></span><span>Player credits <b>${money(credit)}</b></span></div>`:''}
      <div class="dues-scroll"><table><thead><tr><th>Participant</th><th>Assigned</th><th>Net paid</th><th>Balance</th><th>Status / methods</th><th>Record</th></tr></thead><tbody>${mm.map(m=>{
        const payments=current.payments.filter(p=>p.group_id===g.id&&p.player_id===m.player_id&&!p.void),byMethod=methods.map(method=>{const total=payments.filter(p=>p.method===method).reduce((s,p)=>s+(p.kind==='refund'?-p.amount_cents:p.amount_cents),0);return total?method+' '+money(total):'';}).filter(Boolean).join(' · ');
        return `<tr><td><strong>${esc(name(m.player_id))}</strong>${m.active?'':'<small>Past participant</small>'}</td><td>${money(m.assigned_cents)}</td><td>${m.opening_paid?'—':money(m.paid_cents)}</td><td>${money(m.balance_cents)}</td><td>${badge(m)}<small>${esc(byMethod)}</small>${m.assigned_cents>0?`<progress max="${m.assigned_cents}" value="${Math.max(0,Math.min(m.assigned_cents,m.paid_cents))}" aria-label="Recorded payments"></progress>`:''}</td><td>${m.opening_paid||m.assigned_cents===null?'':`<button type="button" data-dues-payment="${m.player_id}">Add payment</button>`}</td></tr>`;
      }).join('')||'<tr><td colspan="6">No participants selected.</td></tr>'}</tbody></table></div>
      <details class="dues-box"><summary>Receipts, refunds & corrections (${current.payments.filter(p=>p.group_id===g.id).length})</summary>${current.payments.filter(p=>p.group_id===g.id).map(p=>`<article class="dues-receipt"><strong>${esc(name(p.player_id))} · ${money(p.amount_cents)} ${p.kind==='refund'?'refund':''}</strong><p>${esc(p.received_on)} · ${esc(p.method)}${p.reference?' · '+esc(p.reference):''}</p><p>${esc(p.note)}</p><small>Recorded ${esc(new Date(p.created_at).toLocaleString())} · Actor ${esc(p.created_by)}</small>${p.void?`<p>Voided · ${esc(p.void.reason)}</p>`:`<button type="button" data-dues-void="${p.id}">Void with reason</button>`}</article>`).join('')||'<p>No recorded receipts.</p>'}</details>
      <details class="dues-box"><summary>Saved scenarios & comparison (${scenarios().length})</summary><p>Saving a scenario does not assign dues. Applied scenarios remain in history.</p>${scenarios().map(s=>`<div class="dues-scenario"><label><input type="checkbox" data-dues-compare="${s.id}" ${compare.has(s.id)?'checked':''}> Compare</label><strong>${esc(s.name)}</strong><span>${money(s.preview.assigned_cents)} · ${s.applied_revision?'Assigned revision '+s.applied_revision:'Draft at revision '+s.base_revision}${!s.applied_revision&&s.base_revision!==g.revision?' · Needs fresh review':''}</span><button type="button" data-dues-load="${s.id}">Load as new scenario</button>${s.applied_revision?'':`<button type="button" data-dues-finalize="${s.id}" ${s.base_revision!==g.revision?'disabled':''}>Review & assign dues</button>`}</div>`).join('')||'<p>No scenarios saved.</p>'}<div id="duesComparison"></div></details>
      <details class="dues-box"><summary>Ledger activity</summary>${current.audit.filter(a=>a.group_id===g.id).map(a=>`<p>${esc(new Date(a.created_at).toLocaleString())} · ${esc(a.action.replaceAll('_',' '))} · ${a.actor==='00000000-0000-0000-0000-000000000000'?'Approved database initialization':'Actor '+esc(a.actor)}</p>`).join('')||'<p>Opening season snapshot.</p>'}</details>`;
      host.querySelectorAll('details').forEach(d=>d.open=opened.has(d.querySelector('summary').textContent.replace(/ \(\d+\)$/,'')));
      renderComparison();
    }
    function renderComparison(){const host=el('duesComparison');if(!host)return;const list=scenarios().filter(s=>compare.has(s.id));if(!list.length){host.innerHTML='';return;}
      const ids=[...new Set(list.flatMap(s=>s.preview.players.map(p=>p.player_id)))];host.innerHTML=`<div class="dues-scroll"><table><thead><tr><th>Player</th>${list.map(s=>`<th>${esc(s.name)}<small>Budget ${money(s.preview.budget_cents)} / contribution ${money(s.preview.contribution_cents)}</small></th>`).join('')}</tr></thead><tbody>${ids.map(id=>`<tr><td>${esc(name(id))}</td>${list.map(s=>{const p=s.preview.players.find(p=>p.player_id===id);return `<td>${p?money(p.cents)+' · '+p.discount+'% off':'Not included'}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    function playerChoices(chosen=[],discounts=false,splitOnly=false){return current.roster.filter(p=>!splitOnly||!members().some(m=>m.player_id===p.id&&m.allocation_mode==='individual')).map(p=>{const selected=chosen.find(x=>(typeof x==='string'?x:x.player_id)===p.id);return `<div class="dues-choice"><label class="dues-member"><input type="checkbox" name="player" value="${p.id}" ${selected?'checked':''}><span>${p.number==null?'Jersey TBD':'#'+esc(p.number)} ${esc(p.name)}${p.is_guest?' · Guest':p.active?'':' (former)'}${p.captain?' · Captain':''}</span></label>${discounts?`<span><input type="number" name="discount-${p.id}" aria-label="${esc(p.name)} discount percent" min="0" max="100" step="1" value="${selected?.discount||0}"> % off${p.captain?` <button type="button" data-dues-discount="${p.id}" data-percent="30">30%</button> <button type="button" data-dues-discount="${p.id}" data-percent="50">50%</button>`:''}</span>`:''}</div>`;}).join('');}
    function renderEditor(plan=null){
      const g=selectedGroup();el('duesEditor').innerHTML=g?groupForm(g)+(!g.opening_paid?scenarioForm(plan):'')+shareForm(g):'';
      const f=el('duesInstructions');if(f)f.elements.instructions.value=current.instructions||'';
    }
    function groupForm(g){const chosen=members().filter(m=>m.active).map(m=>m.player_id),matchIds=current.group_matches.filter(m=>m.group_id===g.id).map(m=>m.match_id);
      return `<details class="dues-box"><summary>Participants, event details & instructions</summary><form id="duesGroupForm" data-revision="${g.revision}">
        <div class="dues-grid"><label>Name<input name="name" required maxlength="100" value="${esc(g.name)}"></label><label>Event / season tag<input name="tag" required maxlength="60" value="${esc(g.tag)}"></label><label>Due date<input type="date" name="due_on" value="${esc(g.due_on||'')}"></label>${g.kind==='season'?`<label class="dues-choice"><input type="checkbox" name="is_current" ${g.is_current?'checked':''}> Current season (Roster badge)</label>`:''}</div>
        <label>Event information<textarea name="description" maxlength="2000">${esc(g.description)}</textarea></label><label>Instructions override (blank uses team instructions)<textarea name="instructions" maxlength="4000">${esc(g.instructions||'')}</textarea></label>
        <h4>Tagged participants</h4>${g.kind==='event'?`<button type="button" data-guest-event-create="${g.id}">Create event-only guest profile</button>`:''}<div class="dues-row"><button type="button" data-dues-action="active-players">Select active roster</button><button type="button" data-dues-action="clear-players">Clear selection</button></div><p>Includes roster players whose profiles have not yet been claimed. Tags give access to ready event content, regardless of payment balance.</p><div class="dues-choices">${playerChoices(chosen)}</div>
        <h4>Linked games</h4><div class="dues-choices">${current.matches.map(m=>`<label class="dues-choice"><input type="checkbox" name="match" value="${m.id}" ${matchIds.includes(m.id)?'checked':''}>${esc(new Date(m.kickoff).toLocaleDateString())} · ${esc(m.label)}${m.published?'':' (unpublished)'}</label>`).join('')}</div>
        <label class="dues-choice"><input type="checkbox" name="retain_history"> If removing participants: removed players retain their dues, payments and history. Handle any charge adjustment or refund explicitly.</label><button>Save details & participants</button></form></details>`;
    }
    function scenarioForm(plan){
      const chosen=plan?.players||members().filter(m=>m.active&&m.allocation_mode!=='individual').map(m=>({player_id:m.player_id,discount:0}));
      return `<details class="dues-box" id="duesScenarioDisclosure" ${plan?'open':''}><summary>Run Numbers — private planning</summary><p>Discounts are redistributed across the selected players. Only Finalize & Assign Dues makes charges visible to players. Existing receipts are preserved.</p><form id="duesScenarioForm" data-revision="${selectedGroup().revision}">
        <label>Scenario name<input name="name" required maxlength="100" placeholder="Spring budget · 30% captain discount"></label><h4>Itemized costs ($)</h4><div id="duesCosts">${(plan?.costs||[{label:'League / event cost',cents:0},{label:'Equipment & other fees',cents:0}]).map(costRow).join('')}</div><button type="button" data-dues-action="add-cost">Add cost line</button>
        <label>Team contribution ($)<input name="contribution" inputmode="decimal" required value="${((plan?.contribution_cents||0)/100).toFixed(2)}"></label><h4>Participants & discounts</h4><div class="dues-row"><button type="button" data-dues-action="active-players">Select active roster</button><button type="button" data-dues-action="clear-players">Clear selection</button></div><div class="dues-choices">${playerChoices(chosen,true,true)}</div><div class="dues-row"><button type="button" data-dues-action="run">Run Numbers</button><button>Save Scenario</button></div><div id="duesPreview"></div></form></details>`;
    }
    function costRow(c){return `<div class="dues-cost"><input name="costLabel" aria-label="Cost description" required maxlength="100" value="${esc(c.label)}"><input name="costAmount" aria-label="Cost in dollars" inputmode="decimal" required value="${(c.cents/100).toFixed(2)}"><button type="button" data-dues-action="remove-cost" aria-label="Remove cost line">×</button></div>`;}
    function readPlan(){const f=el('duesScenarioForm');const costs=[...f.querySelectorAll('.dues-cost')].map(row=>({label:row.querySelector('[name=costLabel]').value.trim(),cents:cents(row.querySelector('[name=costAmount]').value)}));
      const players=[...f.querySelectorAll('[name=player]:checked')].map(e=>({player_id:e.value,discount:Number(f.elements['discount-'+e.value].value)}));return {costs,contribution_cents:cents(f.elements.contribution.value),players};}
    function previewMarkup(p){return `<div class="dues-stats"><span>Budget <b>${money(p.budget_cents)}</b></span><span>Team contribution <b>${money(p.contribution_cents)}</b></span><span>Player shares <b>${money(p.assigned_cents)}</b></span></div><p>Budget fully covered. Rounding is allocated one cent at a time by remainder and stable roster ID.</p><div class="dues-scroll"><table><thead><tr><th>Player</th><th>Discount</th><th>Proposed dues</th></tr></thead><tbody>${p.players.map(p=>`<tr><td>${esc(name(p.player_id))}</td><td>${p.discount}%</td><td>${money(p.cents)}</td></tr>`).join('')}</tbody></table></div>`;}
    async function run(){const form=el('duesScenarioForm'),group=selected,plan=readPlan(),local=allocate(plan),actor=controller.state().owner;const r=await client.rpc('preview_team_dues',{p_plan:plan});if(controller.state().owner!==actor)throw Error('Account changed.');if(group!==selected||form!==el('duesScenarioForm')||JSON.stringify(readPlan())!==JSON.stringify(plan))throw Error('Planning inputs changed. Run Numbers again.');if(r.error)throw r.error;
      if(JSON.stringify(local)!==JSON.stringify(r.data)){
        // JSONB object key order is irrelevant; compare numerical results by roster identity.
        const remote=r.data;if(remote?.budget_cents!==local.budget_cents||remote.assigned_cents!==local.assigned_cents||remote.contribution_cents!==local.contribution_cents||remote.players?.length!==local.players.length||local.players.some(p=>!remote.players.some(q=>q.player_id===p.player_id&&q.cents===p.cents&&q.discount===p.discount)))throw Error('Allocation could not be verified.');
      }
      if(el('duesPreview'))el('duesPreview').innerHTML=previewMarkup(local);return {plan,preview:local};
    }
    function shareForm(g){const matches=current.group_matches.filter(m=>m.group_id===g.id).map(m=>m.match_id),strategies=current.strategies.filter(s=>matches.includes(s.match_id)&&s.final);
      return `<details class="dues-box"><summary>Player-ready event strategies</summary><p>Final / Production lineups for linked published games appear automatically. Explicitly share reviewed strategy animations here. AI publication is separate. Only the animation, labels and player markers are shared; captain coaching notes are omitted. Edited strategies must be reviewed and shared again.</p>${strategies.map(s=>{const share=current.shares.find(x=>x.group_id===g.id&&x.strategy_id===s.id);return `<div class="dues-row"><span>${esc(s.title)} · ${share?(share.source_revision===s.updated_at?'Ready for players':'Changed — review again'):'Not shared'}</span><button type="button" data-dues-share="${s.id}">Review & ${share?'reshare':'share'}</button>${share?`<button type="button" data-dues-unshare="${s.id}">Hide from players</button>`:''}</div>`;}).join('')||'<p>No strategies based on a linked Final / Production lineup yet.</p>'}</details>`;
    }
    function dialog(html){const d=root.querySelector('dialog');delete d.dataset.eventStrategy;d.querySelector('[data-dues-dialog-body]').innerHTML=html;if(!d.open)d.showModal();return d;}
    function close(){root.querySelector('dialog')?.close();review=null;}
    function cached(key,payload){return requestCache.payload(key,payload);}
    async function write(action,payload){if(!canWrite())throw Error('Captain access required.');const result=await controller.command(action,payload);tell('Saved. Payments, Roster and Player Portal use the same ledger.');return result;}
    root.addEventListener('change',e=>{if(e.target.id==='duesGroup'){selected=e.target.value;editorGroup=null;compare.clear();render(controller.state());}if(e.target.hasAttribute('data-dues-compare')){const id=e.target.dataset.duesCompare;if(e.target.checked&&compare.size>=4){e.target.checked=false;tell('Compare up to four scenarios.',true);return;}if(e.target.checked)compare.add(id);else compare.delete(id);renderComparison();}});
    root.addEventListener('input',e=>{if(e.target.closest('#duesScenarioForm')&&el('duesPreview'))el('duesPreview').innerHTML='<p>Inputs changed. Run Numbers again to update the preview.</p>';});
    root.addEventListener('click',async e=>{
      const b=e.target.closest('button');if(!b||!root.contains(b)||b.disabled)return;const action=b.dataset.duesAction;
      try{
        if(b.dataset.guestEventCreate){win.dispatchEvent(new CustomEvent('skor:create-event-guest',{detail:{groupId:b.dataset.guestEventCreate}}));return;}
        if(action==='refresh'){await controller.refresh();return;}
        if(action==='close'){close();return;}
        if(action==='reload-editor'){renderEditor();editorGroup=selected;renderReport();return;}
        if(action==='new'){dialog(`<h3>New season / event</h3><form id="duesNew"><label>Name<input name="name" required maxlength="100" placeholder="Spring 2027"></label><label>Type<select name="kind"><option value="season">Season</option><option value="event">Special event / tournament</option></select></label><label>Tag<input name="tag" required maxlength="60" placeholder="Christmas 2026"></label><label class="dues-choice"><input type="checkbox" name="is_current"> Make this the current season</label><p>Choose participants after creation. Nothing is charged until you assign a reviewed scenario.</p><button>Create group</button></form>`);return;}
        if(['active-players','clear-players'].includes(action)){b.closest('form').querySelectorAll('[name=player]').forEach(input=>input.checked=action==='active-players'&&current.roster.find(p=>p.id===input.value)?.active===true);if(el('duesPreview'))el('duesPreview').innerHTML='<p>Participants changed. Run Numbers again.</p>';return;}
        if(action==='add-cost'){if(el('duesCosts').children.length>=30)throw Error('Maximum 30 cost lines.');el('duesCosts').insertAdjacentHTML('beforeend',costRow({label:'Other fees',cents:0}));return;}
        if(action==='remove-cost'){b.closest('.dues-cost').remove();el('duesPreview').innerHTML='';return;}
        if(action==='run'){b.disabled=true;await run();return;}
        if(b.dataset.duesDiscount){const input=b.closest('form').elements['discount-'+b.dataset.duesDiscount];input.value=b.dataset.percent;el('duesPreview').innerHTML='<p>Discount changed. Run Numbers again.</p>';return;}
        if(b.dataset.duesLoad){const s=scenarios().find(s=>s.id===b.dataset.duesLoad);el('duesScenarioDisclosure').outerHTML=scenarioForm(s.plan);el('duesScenarioForm').elements.name.value=(s.name+' copy').slice(0,100);el('duesScenarioDisclosure').scrollIntoView({block:'nearest'});return;}
        if(b.dataset.duesFinalize){const sc=scenarios().find(s=>s.id===b.dataset.duesFinalize),g=selectedGroup();if(sc.base_revision!==g.revision)throw Error('Scenario is stale. Save a new reviewed scenario.');
          review={group_id:g.id,revision:g.revision,id:sc.id,excluded_action:'retain_credit'};
          const proposed=new Map(sc.preview.players.map(p=>[p.player_id,p.cents])),ids=[...new Set([...proposed.keys(),...members().map(m=>m.player_id)])];
          dialog(`<h3>Finalize & Assign Dues</h3><p>${esc(sc.name)} · ${esc(g.name)} · Revision ${g.revision}</p>${previewMarkup(sc.preview)}<h4>Changes from current dues</h4><div class="dues-scroll"><table><thead><tr><th>Player</th><th>Old dues</th><th>New dues</th><th>Adjustment</th><th>New balance</th></tr></thead><tbody>${ids.map(id=>{const m=members().find(m=>m.player_id===id),change=assignmentPreview(m,proposed.get(id)),{old,next}=change;return `<tr><td>${esc(name(id))}${change.preserved?' · individual dues preserved':proposed.has(id)?'':' · excluded'}</td><td>${money(old)}</td><td>${money(next)}</td><td>${money(next-old)}</td><td>${money(change.balance)}</td></tr>`;}).join('')}</tbody></table></div><form id="duesAssign"><label class="dues-choice"><input type="checkbox" required> I reviewed these dues. Excluded shared-cost players have zero dues and retain receipts as credit. Individual assessments stay unchanged. No refunds are issued automatically.</label><button>Finalize & Assign Dues</button></form>`);return;}
        if(b.dataset.duesPayment){if(current.payments.some(p=>p.id===requestCache.peek('payment')))requestCache.confirm('payment');const pid=b.dataset.duesPayment;dialog(`<h3>Record external payment · ${esc(name(pid))}</h3><form id="duesPaymentForm" data-player="${pid}"><label>Entry<select name="kind"><option value="receipt">Payment received</option><option value="refund">Refund issued externally</option></select></label><div class="dues-grid"><label>Amount ($)<input name="amount" inputmode="decimal" required></label><label>Method<select name="method">${methods.map(m=>`<option>${m}</option>`).join('')}</select></label><label>Date<input type="date" name="received_on" required max="${today()}" value="${today()}"></label></div><label>Reference<input name="reference" maxlength="200"></label><label>Captain note<textarea name="note" maxlength="1000"></textarea></label><p>Record only a payment or refund you have confirmed. The app does not transfer money.</p><button>Save payment record</button></form>`);return;}
        if(b.dataset.duesVoid){dialog(`<h3>Void payment record</h3><form id="duesVoidForm" data-payment="${b.dataset.duesVoid}"><label>Correction reason<textarea name="reason" required maxlength="1000"></textarea></label><p>The original entry stays in audit history. This does not refund money.</p><button>Void record</button></form>`);return;}
        if(b.dataset.duesShare){const s=current.strategies.find(s=>s.id===b.dataset.duesShare),g=selectedGroup();review={group_id:g.id,revision:g.revision,id:s.id,source_revision:s.updated_at};dialog(`<h3>Share with tagged players</h3><p>${esc(s.title)}</p><p>Review this saved strategy in Strategy first. Its animation, labels and player markers will be shared with participants of ${esc(g.tag)}. Captain coaching notes and AI context are excluded.</p><form id="duesShareForm"><label class="dues-choice"><input type="checkbox" required> I reviewed this strategy for player sharing.</label><button>Ready for players</button></form>`);return;}
        if(b.dataset.duesUnshare){await write('unshare_strategy',{group_id:selected,revision:selectedGroup().revision,id:b.dataset.duesUnshare});editorGroup=null;render(controller.state());return;}
        if(b.dataset.duesAnimation){const strategy=current.groups.flatMap(g=>g.matches||[]).flatMap(m=>m.strategies||[]).find(t=>t.id===b.dataset.duesAnimation);if(strategy)global.SKOREventAnimation.open(strategy,root.querySelector('dialog'));}
      }catch(error){tell(error.message||'Could not complete the action.',true);const d=root.querySelector('dialog[open]');if(d){let err=d.querySelector('[data-dues-error]');if(!err){err=doc.createElement('p');err.dataset.duesError='';err.className='dues-error';d.prepend(err);}err.textContent=error.message;}}
      finally{if(b.isConnected)b.disabled=false;}
    });
    root.addEventListener('submit',async e=>{
      const f=e.target;if(!f.id.startsWith('dues'))return;e.preventDefault();const button=f.querySelector('button');if(button.disabled)return;button.disabled=true;
      try{
        const data=new FormData(f);let action,payload;
        if(f.id==='duesInstructions'){action='instructions';payload={instructions:data.get('instructions')};}
        else if(f.id==='duesNew'){action='create_group';const raw={name:data.get('name').trim(),tag:data.get('tag').trim(),kind:data.get('kind'),is_current:data.has('is_current'),players:[],matches:[]};const entry=cached('new',raw);payload={...raw,group_id:entry.id};}
        else if(f.id==='duesGroupForm'){action='save_group';payload={group_id:selected,revision:Number(f.dataset.revision),name:data.get('name').trim(),tag:data.get('tag').trim(),due_on:data.get('due_on'),description:data.get('description'),instructions:data.get('instructions'),is_current:data.has('is_current'),players:data.getAll('player'),matches:data.getAll('match'),removal_action:data.has('retain_history')?'retain_history':''};}
        else if(f.id==='duesScenarioForm'){const {plan}=await run();action='save_scenario';payload=cached('scenario',{group_id:selected,revision:Number(f.dataset.revision),name:data.get('name').trim(),plan});}
        else if(f.id==='duesAssign'){if(!review)throw Error('Review this scenario again.');action='finalize';payload=review;}
        else if(f.id==='duesPaymentForm'){action='payment';payload=cached('payment',{group_id:selected,player_id:f.dataset.player,amount_cents:cents(data.get('amount')),kind:data.get('kind'),method:data.get('method'),received_on:data.get('received_on'),reference:data.get('reference'),note:data.get('note')});}
        else if(f.id==='duesVoidForm'){action='void';payload={group_id:selected,id:f.dataset.payment,reason:data.get('reason').trim()};}
        else if(f.id==='duesShareForm'){if(!review)throw Error('Review this strategy again.');action='share_strategy';payload=review;}
        else return;
        const owner=controller.state().owner;await write(action,payload);if(controller.state().owner!==owner)return;
        if(action==='create_group'){requestCache.confirm('new');selected=payload.group_id;}
        if(action==='payment')requestCache.confirm('payment');
        if(action==='save_scenario')requestCache.confirm('scenario');
        if(['create_group','save_group','finalize','share_strategy'].includes(action)){editorGroup=null;render(controller.state());}
        if(action==='save_scenario')tell('Scenario saved privately. Review & assign it when ready.');
        if(['create_group','finalize','payment','void','share_strategy'].includes(action))close();
      }catch(error){tell(error.message||'Could not save.',true);let err=f.querySelector('[data-dues-error]');if(!err){err=doc.createElement('p');err.dataset.duesError='';err.className='dues-error';f.append(err);}err.textContent=error.message+(f.id==='duesPaymentForm'?' If the result is uncertain, refresh and check receipts before changing or reloading this entry. An unchanged retry uses the same record ID.':'');}
      finally{if(button.isConnected)button.disabled=false;}
    });
    doc.addEventListener('visibilitychange',()=>{if(doc.hidden)global.SKOREventAnimation?.stop();controller.resume();});win.addEventListener('focus',()=>controller.resume());win.addEventListener('pagehide',()=>{controller.pause();global.SKOREventAnimation?.stop();});
    const clear=()=>{global.SKOREventAnimation?.stop();root.querySelector('dialog')?.close();current=null;selected=null;editorGroup=null;review=null;controller.clear();};
    return {...controller,clear,start:id=>mode==='captain'&&!canWrite()?(clear(),Promise.resolve(false)):controller.start(id)};
  }
  global.SKORTeamDues={assignmentPreview,allocate,cents,money,normalize,createRequestIds,createController,playerMarkup,lineupMarkup,mount};
})(typeof window==='object'?window:globalThis);
