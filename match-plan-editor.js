(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function mount({client,canWrite,navigate}){
    const ids=['lineupAiPlan','strategyAiPlan'],hosts=ids.map(id=>root.document.getElementById(id)).filter(Boolean);
    let owner='',generation=0,busy=false,result=null,context=null,undo=null;
    const mid=host=>host.id==='strategyAiPlan'?root.SKORStrategy?.getMatchId():root.SKORLineup?.getEventKey();
    const signature=host=>JSON.stringify({match:mid(host),state:host.id==='strategyAiPlan'?root.SKORStrategy?.getDraft()?.source?.state:root.SKORLineup?.getState()});
    const message=(host,text,error=false)=>{const node=host.querySelector('[data-plan-status]');if(node){node.textContent=text;node.className='opp-status'+(error?' error':'');}};
    function render(){for(const host of hosts){host.innerHTML='<h3>AI lineup and Strategy recommendations</h3><p>Uses this game’s eligible players, availability, approved team context and opponent scouting. Review every suggestion. Apply creates a local draft; saved lineups, Final and AI publication stay unchanged.</p><button type="button" data-generate-plan'+(!owner||busy?' disabled':'')+'>'+(busy?'Generating match plan…':'Recommend lineup and Strategy')+'</button><p data-plan-status class="opp-status" role="status" aria-live="polite"></p><div data-plan-review></div>';
      if(result&&context?.host===host){const p=result.plan,people=new Map(result.candidates.map(x=>[x.player_key,x]));host.querySelector('[data-plan-review]').innerHTML='<div class="match-plan-review"><h4>'+esc(p.formation)+'</h4><p>'+esc(p.explanation)+'</p><p class="plan-warnings">'+p.warnings.map(esc).join('\n')+'</p><table><tbody>'+p.assignments.map(a=>'<tr><td>'+esc(a.role)+'</td><td>'+esc(people.get(a.player_key)?.name)+'</td><td>'+esc(a.reason)+'<small> · '+a.sources.map(esc).join(', ')+'</small></td></tr>').join('')+'</tbody></table><h4>Defending</h4><p>'+esc(p.defense)+'</p><h4>Attacking</h4><p>'+esc(p.attack)+'</p><h4>Set pieces</h4><p>'+esc(p.set_pieces)+'</p><label><input type="checkbox" data-plan-labels> Include matching dangerous-player labels in Strategy</label><div class="scouting-actions"><button type="button" data-apply-lineup>Apply lineup as local draft</button><button type="button" data-apply-strategy>Create Strategy from this proposal</button>'+(undo?'<button type="button" data-undo-plan>Undo lineup apply</button>':'')+'</div></div>';}
    }}
    async function generate(host){
      if(busy||!owner||!canWrite()||root.SKORStrategy?.isEditing?.())return message(host,'Finish editing the Strategy step first.',true);
      const matchId=mid(host);if(!/^[0-9a-f-]{36}$/i.test(matchId||''))return message(host,'Choose a scheduled game first.',true);
      const actor=owner,version=++generation,sig=signature(host);busy=true;result=null;undo=null;render();message(host,'Generating a proposal for review…');
      try{const {data,error}=await client.functions.invoke('generate-pregame-talk',{body:{mode:'match_plan',match_id:matchId}});if(error)throw error;
        if(owner!==actor||generation!==version||!canWrite())return;
        if(signature(host)!==sig)throw Error('The selected game or lineup changed. Generate again for the current context.');
        if(!data?.plan||!data?.candidates)throw Error(data?.error||'No match plan was returned.');
        data.plan=root.SKORMatchPlan.validate(data.plan,data.candidates);result=data;context={host,matchId,sig,actor};busy=false;render();message(host,data.scouting_summary||'AI proposal ready. Review before applying.');
      }catch(e){if(owner===actor&&generation===version){busy=false;render();message(host,e.message||'Could not generate the match plan.',true);}}
    }
    async function apply(host,kind){
      if(!result||busy||!canWrite()||owner!==context?.actor||host!==context.host)return;
      if(root.SKORStrategy?.isEditing?.())return message(host,'Finish editing the current Strategy step first.',true);
      if(signature(host)!==context.sig)return message(host,'The selected game or draft changed. Generate a new proposal before applying.',true);
      const chosen=result,review=context,actor=owner,version=generation,labels=!!host.querySelector('[data-plan-labels]')?.checked;
      busy=true;render();
      try{
        const {data:eligible,error}=await client.rpc('get_match_plan_candidates',{p_match_id:review.matchId});if(error)throw error;
        if(owner!==actor||generation!==version||!canWrite()||result!==chosen||context!==review)return;
        if(root.SKORStrategy?.isEditing?.())throw Error('Finish editing the current Strategy step first.');
        if(signature(host)!==review.sig)throw Error('The game or draft changed while availability was checked. Generate again.');
        const keys=new Set((eligible||[]).map(p=>p.player_key));
        if(chosen.plan.assignments.some(a=>!keys.has(a.player_key)))throw Error('Player availability changed. Generate and review a new proposal.');
        if(kind==='lineup'){
          if(String(root.SKORLineup.getEventKey())!==context.matchId)throw Error('Select this proposal’s game in Lineups before applying.');
          const before=root.SKORLineup.getState();root.SKORLineup.applyRecommendation(root.SKORMatchPlan.state(result.plan,before),context.matchId);undo={matchId:context.matchId,state:before,applied:JSON.stringify(root.SKORLineup.getState())};context.sig=signature(host);busy=false;render();message(host,'Local lineup draft applied. Save a variation or publish Final only after reviewing it.');
        }else{
          await root.SKORStrategy.applyMatchPlan(result,{labels});
          if(owner!==actor||generation!==version)return;busy=false;navigate('strategy');render();message(host,'Strategy draft created from the proposal. Edit step to adjust it; Save Strategy to share.');
        }
      }catch(e){if(owner===actor&&generation===version){busy=false;render();message(host,e.message||'Could not apply the proposal.',true);}}
    }
    for(const host of hosts)host.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
      if(b.matches('[data-generate-plan]'))void generate(host);
      if(b.matches('[data-apply-lineup]'))void apply(host,'lineup');if(b.matches('[data-apply-strategy]'))void apply(host,'strategy');
      if(b.matches('[data-undo-plan]')&&undo&&canWrite()){
        if(String(root.SKORLineup.getEventKey())!==undo.matchId||JSON.stringify(root.SKORLineup.getState())!==undo.applied)return message(host,'The lineup changed after applying. Undo is unavailable; your newer edits were preserved.',true);
        root.SKORLineup.applyRecommendation(undo.state,undo.matchId);undo=null;context.sig=signature(host);render();message(host,'Previous local lineup restored.');
      }
    });
    return {start(id){generation++;owner=id;busy=false;result=null;context=null;undo=null;render();},clear(){generation++;owner='';busy=false;result=null;context=null;undo=null;for(const host of hosts)host.innerHTML='';}};
  }
  root.SKORMatchPlanEditor={mount};
})(typeof window!=='undefined'?window:globalThis);
