/* Captain-only inbox. Server owns authorization and per-captain read receipts. */
(function(global){
  'use strict';
  const PAGE_SIZE=10,POLL_MS=30000;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function normalize(value){
    if(!value||!Array.isArray(value.items)||!Number.isInteger(value.total)||value.total<0||
      !['unread_equipment','unread_feedback'].every(k=>Number.isInteger(value[k])&&value[k]>=0)||
      !Number.isFinite(Date.parse(value.as_of)))throw Error('Notification response unavailable.');
    const keys=new Set();
    for(const row of value.items){
      const key=row.kind+':'+row.id;
      if(!['equipment','comment','reaction'].includes(row.kind)||!row.id||keys.has(key)||
        typeof row.is_read!=='boolean'||!Number.isFinite(Date.parse(row.revision))||typeof row.body!=='string')throw Error('Notification response incomplete.');
      keys.add(key);
    }
    return value;
  }
  function createController({client,onState=()=>{},onEquipmentRead=()=>{},visible=()=>true,schedule=setTimeout,cancel=clearTimeout}){
    let owner=null,epoch=0,sequence=0,pending=null,timer=null,busy=false,filter='unread',page=0,snapshot=null,phase='idle',message='';
    const state=()=>({snapshot,phase,message,busy,filter,page,owner});
    const emit=()=>onState(state());
    function pause(){if(timer!==null)cancel(timer);timer=null;}
    function arm(){pause();if(owner&&visible())timer=schedule(()=>{timer=null;void refresh();},POLL_MS);}
    function clear(){epoch++;sequence++;owner=null;pending=null;busy=false;snapshot=null;phase='idle';message='';page=0;filter='unread';pause();emit();}
    async function identity(actor){const r=await client.auth.getSession();return !r.error&&r.data?.session?.user?.id===actor;}
    function refresh(){
      if(!owner||!visible()||busy)return Promise.resolve(false);
      if(pending)return pending;
      const generation=epoch,request=++sequence,actor=owner;
      pause();phase='loading';message='';emit();
      const task=Promise.resolve().then(async()=>{
        try{
          if(!await identity(actor)){if(generation===epoch)clear();return false;}
          if(generation!==epoch||request!==sequence)return false;
          const r=await client.rpc('get_captain_notifications',{p_limit:PAGE_SIZE,p_offset:page*PAGE_SIZE,p_filter:filter});
          if(generation!==epoch||request!==sequence)return false;
          if(r.error)throw r.error;
          snapshot=normalize(r.data);phase='ready';message='';emit();
          return true;
        }catch(e){if(generation===epoch&&request===sequence){if(e.code==='42501')snapshot=null;phase=snapshot?'stale':'error';message=e.message||'Refresh failed.';emit();}return false;}
        finally{if(generation===epoch&&request===sequence){pending=null;arm();}}
      });
      pending=task;return task;
    }
    async function start(userId){if(owner===userId)return refresh();clear();if(!userId)return false;owner=userId;return refresh();}
    function view(nextFilter,nextPage=0){
      if(busy||!['unread','all'].includes(nextFilter))return Promise.resolve(false);
      sequence++;pending=null;filter=nextFilter;page=Math.max(0,nextPage);snapshot=null;return refresh();
    }
    async function mark(row){
      if(!owner||busy||row.is_read||!snapshot?.items.some(x=>x.kind===row.kind&&x.id===row.id&&x.revision===row.revision))return false;
      const generation=epoch,actor=owner;busy=true;pause();message='';emit();
      try{
        if(!await identity(actor)){if(generation===epoch)clear();return false;}
        if(generation!==epoch)return false;
        const r=await client.rpc('mark_captain_notification_read',{p_kind:row.kind,p_id:row.id,p_revision:row.revision});
        if(generation!==epoch)return false;
        if(r.error)throw r.error;
        if(r.data?.ok!==true)throw Error('Read status could not be verified.');
        if(row.kind==='equipment')onEquipmentRead(row.id);
        sequence++;pending=null;page=0;busy=false;await refresh();return true;
      }catch(e){if(generation===epoch){if(e.code==='42501')snapshot=null;phase=snapshot?'stale':'error';message=e.message||'Could not mark read.';}return false;}
      finally{if(generation===epoch){busy=false;emit();arm();}}
    }
    return {start,clear,refresh,view,mark,pause,resume:()=>visible()?refresh():(pause(),Promise.resolve(false)),state};
  }
  function render(state){
    const s=state.snapshot,disabled=state.busy?'disabled':'',loading=state.phase==='loading';
    const buttons=`<div class="cn-actions"><button type="button" data-cn-filter="unread" aria-pressed="${state.filter==='unread'}" ${disabled}>Unread</button><button type="button" data-cn-filter="all" aria-pressed="${state.filter==='all'}" ${disabled}>All updates</button><button type="button" data-cn-refresh ${loading||state.busy?'disabled':''}>${loading?'Refreshing…':'Refresh'}</button></div>`;
    const rows=s?.items.map((x,index)=>`<article class="cn-item ${x.is_read?'':'cn-unread'}"><div class="cn-row"><strong>${esc(x.title)}</strong><span class="cn-type">${x.kind==='equipment'?'Equipment':x.kind==='reaction'?'Match reaction':x.audience==='captains'?'Private feedback':'Team feedback'} · ${x.is_read?'Read':'Unread'}</span></div><div class="cn-meta">${esc(new Date(x.revision).toLocaleString())}${x.match_id?` · vs ${esc(x.opponent)} · ${esc(new Date(x.kickoff).toLocaleDateString())}`:''}</div><p>${esc(x.body)}</p><div class="cn-actions"><button type="button" data-cn-open="${index}" ${disabled}>${x.kind==='equipment'?'Open Equipment':'Open Match Feedback'}</button>${x.is_read?'':`<button type="button" data-cn-read="${index}" ${disabled}>Mark read for me</button>`}</div></article>`).join('');
    const error=['error','stale'].includes(state.phase)?`<p class="cn-error" role="alert">${s?'Showing the last update. ':''}${esc(state.message)} Use Refresh to retry.</p>`:'';
    return `<div class="cn-head"><div class="sub">Unread status is yours. Reading an update never clears it for another captain.</div>${buttons}</div><div class="cn-totals"><span>Equipment <strong>${s?s.unread_equipment:'—'}</strong></span><span>Player feedback <strong>${s?s.unread_feedback:'—'}</strong></span></div>${error}<div class="cn-list">${s?(rows||`<p class="sub">${state.filter==='unread'?'You have no unread notifications.':'No updates yet.'}</p>`):`<p class="sub">${state.phase==='error'?'Notifications unavailable.':'Loading notifications…'}</p>`}</div>${s?`<div class="cn-actions cn-paging"><button type="button" data-cn-page="${state.page-1}" ${state.page===0||state.busy?'disabled':''}>Newer</button><span>Page ${state.page+1} · ${s.total} update${s.total===1?'':'s'}</span><button type="button" data-cn-page="${state.page+1}" ${(state.page+1)*PAGE_SIZE>=s.total||state.busy?'disabled':''}>Older</button></div><p class="cn-meta">${state.phase==='stale'?'Last successful update':'Updated'} ${esc(new Date(s.as_of).toLocaleTimeString())} · Checks every 30 seconds while this portal is visible.</p>`:''}`;
  }
  function mount({rootId,client,onOpenFeedback,onOpenEquipment,onEquipmentRead,win=global,doc=global.document}){
    const root=doc.getElementById(rootId);if(!root)return null;
    const disclosure=root.closest('details'),summaryCount=disclosure?.querySelector('[data-cn-summary-count]');
    let lastState;
    const controller=createController({client,onEquipmentRead,visible:()=>doc.visibilityState!=='hidden',onState:state=>{
      lastState=state;root.hidden=!state.owner;root.innerHTML=state.owner?render(state):'';
      if(disclosure){disclosure.hidden=!state.owner;if(!state.owner)disclosure.open=false;}
      if(summaryCount){const s=state.snapshot,count=s?s.unread_equipment+s.unread_feedback:'—';summaryCount.textContent=count;summaryCount.setAttribute('aria-label',count+' unread notifications');}
      for(const b of doc.querySelectorAll('[data-captain-unread]')){
        const s=state.snapshot,value=s?(b.dataset.captainUnread==='equipment'?s.unread_equipment:s.unread_equipment+s.unread_feedback):null;
        b.textContent=value??'';b.hidden=!value;
      }
    }});
    root.addEventListener('click',async e=>{
      const b=e.target.closest('button');if(!b||!root.contains(b)||b.disabled)return;
      if(b.hasAttribute('data-cn-refresh'))return controller.refresh();
      if(b.dataset.cnFilter)return controller.view(b.dataset.cnFilter);
      if(b.hasAttribute('data-cn-page'))return controller.view(lastState.filter,Number(b.dataset.cnPage));
      const index=b.dataset.cnOpen??b.dataset.cnRead,row=lastState.snapshot?.items[Number(index)];if(!row)return;
      if(b.hasAttribute('data-cn-read'))return controller.mark(row);
      try{if(row.kind==='equipment')await onOpenEquipment(row);else await onOpenFeedback(row.match_id);}
      catch(_){const msg=doc.createElement('p');msg.className='cn-error';msg.setAttribute('role','alert');msg.textContent='Could not open this update. Refresh and try again.';root.append(msg);}
    });
    doc.addEventListener('visibilitychange',()=>controller.resume());
    win.addEventListener('focus',()=>controller.resume());
    win.addEventListener('pageshow',()=>controller.resume());
    win.addEventListener('pagehide',()=>controller.pause());
    win.addEventListener('skor:equipment-notifications',()=>controller.refresh());
    return controller;
  }
  const api={createController,normalize,render,mount,PAGE_SIZE,POLL_MS};
  if(typeof module==='object'&&module.exports)module.exports=api;
  global.SKORCaptainNotifications=api;
})(typeof window!=='undefined'?window:globalThis);
