(function(root){
  "use strict";
  function cleanName(value){return String(value||"").normalize("NFKC").trim().replace(/\s+/g," ");}
  function isFullName(value){const name=cleanName(value);return name.length<=80&&name.split(" ").filter(Boolean).length>=2;}
  function namesFromRows(rows){
    const names=new Map();
    for(const row of rows||[]){
      const name=cleanName(row.display_name);
      if(isFullName(name)&&!names.has(name.toLocaleLowerCase("en")))names.set(name.toLocaleLowerCase("en"),name);
    }
    return [...names.values()].sort((a,b)=>a.localeCompare(b,"en",{sensitivity:"base"}));
  }
  async function loadNames(client){
    const rows=[],pageSize=500;
    for(let start=0;;start+=pageSize){
      // Include archived and previous-game records; jersey assignments stay match-specific.
      const {data,error}=await client.from("match_temp_players").select("id,display_name").order("id",{ascending:true}).range(start,start+pageSize-1);
      if(error)throw error;
      rows.push(...(data||[]));
      if((data||[]).length<pageSize)break;
    }
    return namesFromRows(rows);
  }
  const api={cleanName,isFullName,namesFromRows,loadNames};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.SKORTempDirectory=api;
})(typeof window!=="undefined"?window:globalThis);
