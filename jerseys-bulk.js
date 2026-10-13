(function(root){
  "use strict";
  function captainNames(rows){return [...new Set((rows||[]).map(row=>String(row.display_name||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));}
  async function transfer(client,ids,captain){
    const selected=[...new Set((ids||[]).map(String).filter(Boolean))],holder=String(captain||"").trim();
    if(!selected.length)throw new Error("Select at least one jersey.");
    if(!holder||holder.length>160)throw new Error("Choose a captain from the dropdown.");
    const directory=await client.rpc("get_notebook_captain_directory");
    if(directory.error)throw new Error("Could not verify the captain list. Refresh inventory and try again.");
    if(!captainNames(directory.data).includes(holder))throw new Error("That captain is no longer available. Refresh inventory and choose again.");
    // One statement updates custody only, with existing captain RLS and updated-at triggers.
    const result=await client.from("jersey_inventory").update({holder_captain_name:holder}).in("id",selected).select("id,holder_captain_name");
    if(result.error)throw result.error;
    const written=new Set((result.data||[]).filter(row=>row.holder_captain_name===holder).map(row=>String(row.id)));
    const verification=await client.from("jersey_inventory").select("id,holder_captain_name").in("id",selected);
    if(verification.error)throw new Error("The transfer may have been saved, but could not be verified. Refresh inventory before trying again.");
    const confirmed=new Set((verification.data||[]).filter(row=>written.has(String(row.id))&&row.holder_captain_name===holder).map(row=>String(row.id)));
    return {holder,confirmedIds:selected.filter(id=>confirmed.has(id)),unresolvedIds:selected.filter(id=>!confirmed.has(id))};
  }
  const api={captainNames,transfer};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.SKORJerseyBulk=api;
})(typeof window!=="undefined"?window:globalThis);
