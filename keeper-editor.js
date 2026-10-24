(function(root){
  'use strict';
  const K=root.SKORKeeperPlan;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let current=null;
  function canEdit(){if(root.SKORPortalCanWrite?.())return true;root.SKORViewerBlocked?.('edit keeper assignments');return false;}
  function changed(message){current.onChange(message);}
  function render(context){
    current=context;
    const {state,players,id,primaryNumber,name}=context,box=document.getElementById('keeperPlanRows');
    if(!box)return;
    const plan=K.normalize(state.keeperPlan);
    const numberInput=document.getElementById('keeperSpareNumbers');
    numberInput.value=plan.spareNumbers.join(', ');
    numberInput.onchange=()=>{
      if(!canEdit()){render(current);return;}
      const values=numberInput.value.split(',').map(v=>v.trim()).filter(Boolean);
      if(values.some(v=>K.jersey(v)===null)){numberInput.setCustomValidity('Use numbers from 1 to 99, separated by commas.');numberInput.reportValidity();return;}
      numberInput.setCustomValidity('');state.keeperPlan.spareNumbers=[...new Set(values.map(K.jersey))];
      changed('Spare jersey choices updated. Save the variation to share them.');
    };
    const numbers=[...new Set([...plan.spareNumbers,...Object.values(plan.assignments).map(a=>a.jerseyNumber)].filter(n=>n!==null))];
    document.getElementById('keeperJerseyOptions').innerHTML=numbers.map(n=>'<option value="'+n+'"></option>').join('');
    const displayPlayers=players.filter(p=>K.details(state,id(p),primaryNumber(p)).role);
    const add=document.getElementById('keeperAddPlayer');
    add.innerHTML='<option value="">Choose a match-squad player…</option>'+players.filter(p=>!K.details(state,id(p),primaryNumber(p)).role).map(p=>'<option value="'+esc(id(p))+'">#'+esc(primaryNumber(p))+' '+esc(name(p))+'</option>').join('');
    add.onchange=()=>{
      if(!canEdit()){render(current);return;}
      if(!add.value)return;
      const error=K.setRole(state,add.value,'backup');
      if(error){context.onError(error);render(current);return;}
      changed('Keeper cover added. Choose the role and jersey, then save the variation.');
    };
    box.innerHTML=displayPlayers.length?displayPlayers.map((p,index)=>{
      const pid=id(p),a=plan.assignments[pid],d=K.details(state,pid,primaryNumber(p)),suffix=p.temp?' · TEMP':'';
      return '<div class="keeper-plan-row"><div class="keeper-plan-person">#'+esc(primaryNumber(p))+' '+esc(name(p))+suffix+'</div>'+
        '<div><label for="keeper-role-'+index+'">Keeper role</label><select id="keeper-role-'+index+'" data-keeper-role="'+esc(pid)+'"><option value="">Outfield / no keeper role</option>'+Object.entries(K.ROLES).map(([role,label])=>'<option value="'+role+'"'+(d.role===role?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select></div>'+
        '<div><label for="keeper-number-'+index+'">Keeper jersey</label><input id="keeper-number-'+index+'" data-keeper-number="'+esc(pid)+'" type="text" inputmode="numeric" list="keeperJerseyOptions" maxlength="2" value="'+esc(a?.jerseyNumber??'')+'" placeholder="'+(d.role==='starting'?'Own #':String(plan.spareNumbers[0]||30))+'"'+(!d.role?' disabled':'')+'></div>'+
        (d.label?'<div class="keeper-plan-preview">#'+esc(d.number)+' — '+esc(name(p))+suffix+' ('+esc(d.label)+')</div>':'')+'</div>';
    }).join(''):'<p>'+ (players.length?'Choose a player above to designate the starting keeper.':'Add players to the field or Substitutes to assign keepers.')+'</p>';
    document.getElementById('keeperPlanStatus').textContent=K.validate(state).join(' ');
    box.querySelectorAll('[data-keeper-role]').forEach(input=>input.addEventListener('change',()=>{
      if(!canEdit()){render(current);return;}
      const error=K.setRole(state,input.dataset.keeperRole,input.value);
      if(error){context.onError(error);render(current);return;}
      changed('Keeper assignment updated. Save the variation to share it.');
    }));
    box.querySelectorAll('[data-keeper-number]').forEach(input=>{
      input.addEventListener('input',()=>input.setCustomValidity(''));
      input.addEventListener('change',()=>{
        if(!canEdit()){render(current);return;}
        const pid=input.dataset.keeperNumber,n=K.jersey(input.value);
        if(input.value.trim()&&n===null){input.setCustomValidity('Enter a jersey number from 1 to 99.');input.reportValidity();return;}
        input.setCustomValidity('');
        const p=players.find(p=>id(p)===pid),role=K.details(state,pid,primaryNumber(p)).role;
        state.keeperPlan.assignments[pid]={role,jerseyNumber:n};
        if(n!==null&&!state.keeperPlan.spareNumbers.includes(n))state.keeperPlan.spareNumbers.push(n);
        changed('Keeper jersey updated. Save the variation to share it.');
      });
    });
  }
  root.SKORKeeperEditor={render};
})(window);
