(function(root){
  'use strict';
  const key=p=>String(p.player_key||p.id||'');
  const fieldIds=state=>(state?.formation==='Freeform / Custom'?Object.keys(state.freeform||{}):Object.values(state?.slots||{}).filter(Boolean)).map(String);
  async function resolve(source,client){
    const ids=fieldIds(source.state);
    if(ids.length>11)throw Error('The selected lineup has more than eleven field players. Review the lineup first.');
    if(new Set(ids).size!==ids.length)throw Error('The selected lineup assigns the same player to more than one field position.');
    const roster=(source.roster||[]).filter(p=>!key(p).startsWith('temp:')).map(p=>({...p}));
    const known=new Set(roster.map(key)),missing=ids.filter(id=>!id.startsWith('temp:')&&!known.has(id));
    const temps=ids.filter(id=>id.startsWith('temp:'));
    if((missing.length||temps.length)&&!client)throw Error('Connect to Supabase to load the selected lineup’s saved players.');
    if(missing.length){
      const {data,error}=await client.from('team_roster').select('player_key,jersey_number,full_name,preferred_name,position,active').in('player_key',missing);
      if(error)throw Error('Could not load saved roster players: '+error.message);
      for(const r of data||[])roster.push({player_key:String(r.player_key),number:r.jersey_number,name:String(r.preferred_name||r.full_name||'Player').trim().split(/\s+/)[0],fullName:r.full_name,position:r.position,temp:false});
    }
    if(temps.length){
      if(!source.matchId)throw Error('Select the saved game lineup to load its match-specific fill-ins.');
      const {data,error}=await client.from('match_temp_players').select('id,match_id,display_name,jersey_number,active').eq('match_id',source.matchId).in('id',temps.map(id=>id.slice(5)));
      if(error)throw Error('Could not load this game’s saved fill-ins: '+error.message);
      for(const r of data||[]){
        if(String(r.match_id)!==String(source.matchId)||!temps.includes('temp:'+r.id))continue;
        roster.push({player_key:'temp:'+r.id,id:'temp:'+r.id,number:r.jersey_number,name:String(r.display_name||'Fill-in'),fullName:String(r.display_name||'Fill-in'),temp:true});
      }
    }
    const available=new Set(roster.map(key)),unavailable=ids.filter(id=>!available.has(id));
    if(unavailable.length)throw Error(unavailable.length+' saved lineup player(s) could not be loaded for this game. Refresh the lineup and try again.');
    return {...source,roster};
  }
  function keeperId(source,home){
    const ids=new Set(home.map(p=>String(p.id)));
    if(source.state?.formation!=='Freeform / Custom'&&ids.has(String(source.state?.slots?.GK)))return String(source.state.slots.GK);
    const explicit=Object.entries(source.state?.keeperPlan?.assignments||{}).filter(([,p])=>['starting','starting_temp'].includes(p.role));
    if(explicit.length)return explicit.length===1&&ids.has(explicit[0][0])?explicit[0][0]:undefined;
    const labeled=home.filter(p=>String(p.keeperLabel||'').startsWith('starting'));
    if(labeled.length)return labeled.length===1?labeled[0].id:undefined;
    const keepers=(source.roster||[]).filter(p=>ids.has(key(p))&&/\b(?:gk|goalkeeper|keeper|goalie)\b/i.test(String(p.position||'')));
    return keepers.length===1?key(keepers[0]):undefined;
  }
  const api={fieldIds,resolve,keeperId};root.SKORStrategySource=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
