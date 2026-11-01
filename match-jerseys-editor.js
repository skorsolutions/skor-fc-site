(function(root){
  'use strict';
  const generations=new WeakMap();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  function render({state,roster,id,canWrite,onChange,onError,doc=root.document}){
    const rows=doc.getElementById('matchJerseyRows');if(!rows)return;
    const generation={};generations.set(rows,generation);
    const J=root.SKORMatchJerseys,members=new Set(J.squad(state));
    const players=roster.filter(p=>members.has(id(p))&&!p.temp&&!id(p).startsWith('temp:'));
    rows.innerHTML=players.map(p=>{
      const pid=id(p),current=J.resolve(state,pid,p.number),permanent=J.number(p.number);
      const options=Array.from({length:99},(_,i)=>i+1).filter(n=>n===current||J.available(state,roster,pid,n));
      return '<label class="match-jersey-row"><span>'+esc(p.name)+'<small>Permanent: '+esc(J.label(permanent))+'</small></span><select data-match-jersey="'+esc(pid)+'" aria-label="'+esc(p.name)+' match jersey"'+(canWrite()?'':' disabled')+'><option value="">TBD — choose before referee export</option>'+options.map(n=>'<option value="'+n+'"'+(n===current?' selected':'')+'>#'+n+(n===permanent?' (permanent)':'')+'</option>').join('')+'</select></label>';
    }).join('')||'<p>Add regular players to the field or bench to assign their match jerseys.</p>';
    rows.querySelectorAll('[data-match-jersey]').forEach(select=>select.addEventListener('change',()=>{
      if(generations.get(rows)!==generation||!canWrite())return;
      const pid=select.dataset.matchJersey,n=J.number(select.value);
      if(!J.squad(state).includes(pid)||!J.available(state,roster,pid,n)){onError('That match jersey is no longer available. Choose another number.');return;}
      state.matchJerseys={...J.normalize(state.matchJerseys),[pid]:n};
      onChange('Match jersey saved to this board. Save the variation to share it.');
    }));
  }
  root.SKORMatchJerseysEditor={render};
})(typeof globalThis==='object'?globalThis:this);
