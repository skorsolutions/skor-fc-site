/* Guest portal deliberately mounts no full-team equipment, chats or regular-team APIs. */
(function(global){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function mount({client,onAccessChanged=()=>{},doc=global.document,win=global}){
    const root=doc.getElementById('guestPortalContent'),dialog=doc.getElementById('guestPortalDialog'),dues=global.SKORTeamDues.mount({rootId:'guestDues',client,mode:'player'});let snapshot=null,lastOwner=null;
    const requests=global.SKORTeamDues.createRequestIds();
    function clear(){dialog.close();global.SKOREventAnimation.stop();dues.clear();controller.clear();snapshot=null;root.innerHTML='';requests.clear();}
    function render(state){
      if(state.actor!==lastOwner){lastOwner=state.actor;dialog.close();requests.clear();}
      snapshot=state.snapshot;
      if(!snapshot){root.innerHTML=state.actor?`<p role="status">${esc(state.message||'Loading guest portal…')}</p>`:'';dialog.close();if(state.code==='42501'){setTimeout(()=>{clear();onAccessChanged();},0);}return;}
      const open=new Set([...root.querySelectorAll('details[open]')].map(d=>d.dataset.key));
      root.innerHTML=`<section class="card"><div class="eyebrow">Guest / event player</div><h1>${esc(snapshot.profile.name)}</h1><p>${esc(snapshot.profile.position)} · Jerseys assigned per game</p><a class="btn secondary" href="index.html">Homepage</a></section><section class="card"><div class="sectionhead"><h2>My Match Record</h2><button type="button" data-guest-refresh>Refresh</button></div>${global.SKORGuestProfiles.recordMarkup(snapshot.record)}<p role="status">${state.phase==='stale'?'Refresh failed. Showing the last record.':'Updated '+new Date(snapshot.as_of).toLocaleTimeString()}</p></section>
      <details class="card portal-disclosure" data-key="upcoming"><summary><h2>My Next Matches</h2></summary><div class="portal-disclosure-body">${snapshot.matches.filter(m=>Date.parse(m.kickoff)>=Date.now()).map(matchCard).join('')||'<p>No upcoming assigned matches.</p>'}</div></details>
      <details class="card portal-disclosure" data-key="history"><summary><h2>My Match History & Feedback</h2></summary><div class="portal-disclosure-body">${snapshot.matches.filter(m=>Date.parse(m.kickoff)<Date.now()).map(matchCard).join('')||'<p>No past assigned matches.</p>'}</div></details>`;
      root.querySelectorAll('details').forEach(d=>d.open=open.has(d.dataset.key));
    }
    const controller=global.SKORGuestProfiles.createController({client,mode:'player',onState:render,visible:()=>!doc.hidden});
    function matchCard(m){return `<article class="dues-player-card"><h3>${esc(m.label)}</h3><p>${esc(new Date(m.kickoff).toLocaleString())} · ${esc(m.location||'Location TBD')}</p><p>${m.number==null?'Jersey TBD':'#'+m.number} · Attendance: ${esc(m.attendance||'Unmarked')}</p><button type="button" data-guest-match="${m.id}">Open lineup, RSVP & feedback</button></article>`;}
    function openMatch(id){const m=snapshot.matches.find(m=>m.id===id);if(!m)return;dialog.querySelector('[data-dues-dialog-body]').innerHTML=`<h3>${esc(m.label)}</h3><p>${m.number==null?'Jersey TBD':'Match jersey #'+m.number}</p>${m.lineup?`<h4>Final / Production lineup</h4><div class="dues-lineup">${global.SKORTeamDues.lineupMarkup(m.lineup,snapshot.roster||[])}</div>`:'<p>Final lineup not published yet.</p>'}${m.strategies.map(t=>`<button type="button" data-guest-strategy="${t.id}">View strategy · ${esc(t.title)}</button>`).join('')}
      <details open><summary>My RSVP</summary><form id="guestRsvp" data-match="${m.id}"><label>Availability<select name="status"><option value="going" ${m.rsvp?.status==='going'?'selected':''}>Going</option><option value="out" ${m.rsvp?.status==='out'?'selected':''}>Can’t make it</option></select></label><label>Note<textarea name="note" maxlength="500">${esc(m.rsvp?.note||'')}</textarea></label><button>Save RSVP</button></form></details>
      <details><summary>My feedback & captain replies</summary>${m.comments.map(c=>`<article class="dues-receipt"><p>${esc(c.comment)}</p><small>${esc(c.visibility==='captains'?'Private to captains':'Team feedback')} · ${esc(new Date(c.created_at).toLocaleString())}</small>${c.replies.map(r=>`<p><strong>${esc(r.name)}</strong>: ${esc(r.message)}</p>`).join('')}</article>`).join('')}<form id="guestFeedback" data-match="${m.id}"><label>Send to<select name="visibility"><option value="captains">Captains privately</option><option value="team">Team</option></select></label><label>Feedback<textarea name="comment" required maxlength="1500"></textarea></label><button>Send feedback</button></form></details><p data-guest-status role="status"></p>`;if(!dialog.open)dialog.showModal();}
    root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-guest-refresh')){controller.refresh();dues.refresh();}if(b.dataset.guestMatch)openMatch(b.dataset.guestMatch);});
    dialog.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-guest-close')){dialog.close();global.SKOREventAnimation.stop();}if(b.dataset.guestStrategy){const t=snapshot?.matches.flatMap(m=>m.strategies).find(t=>t.id===b.dataset.guestStrategy);if(t)global.SKOREventAnimation.open(t,dialog);}});
    dialog.addEventListener('submit',async e=>{const form=e.target;if(!['guestRsvp','guestFeedback'].includes(form.id))return;e.preventDefault();const button=form.querySelector('button'),actor=controller.state().actor;if(button.disabled)return;button.disabled=true;
      try{const data=new FormData(form),payload={match_id:form.dataset.match};let action;if(form.id==='guestRsvp'){action='rsvp';Object.assign(payload,{status:String(data.get('status')),note:String(data.get('note'))});}else{action='comment';Object.assign(payload,{visibility:String(data.get('visibility')),comment:String(data.get('comment')).trim()});}
        const request=requests.payload(form.id,payload);await controller.write('self',action,request);if(controller.state().actor!==actor)return;requests.confirm(form.id);openMatch(payload.match_id);dialog.querySelector('[data-guest-status]').textContent='Saved.';
      }catch(error){const out=dialog.querySelector('[data-guest-status]');if(out)out.textContent=error.message||'Could not save.';}finally{if(button.isConnected)button.disabled=false;}
    });
    doc.addEventListener('visibilitychange',()=>{if(doc.hidden)global.SKOREventAnimation.stop();controller.resume();});win.addEventListener('focus',()=>controller.resume());win.addEventListener('pagehide',()=>controller.pause());
    return {clear,start:async id=>{await Promise.all([controller.start(id),dues.start(id)]);},refresh:()=>Promise.all([controller.refresh(),dues.refresh()])};
  }
  global.SKORGuestPortal={mount};
})(window);
