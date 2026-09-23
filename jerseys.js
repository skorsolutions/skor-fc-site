/* SKOR FC Jersey Inventory v53.0 */
(function(){
  "use strict";

  let kits=[];
  let inventory=[];
  let captainNames=[];
  let initialized=false;
  let loading=false;

  const el=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
  const client=()=>window.SKORSupabase||null;
  const canWrite=()=>!!window.SKORPortalCanWrite?.();
  const activeKits=()=>kits.filter(kit=>kit.active!==false);
  const kitFor=id=>kits.find(kit=>String(kit.id)===String(id))||null;
  const itemFor=id=>inventory.find(item=>String(item.id)===String(id))||null;
  const statusLabel=status=>status==="on_hand"?"On hand":status==="unavailable"?"Unavailable":"Retired";
  const displayLabel=item=>{
    if(!item)return "Jersey unavailable";
    const kit=kitFor(item.kit_id);
    const held=item.holder_captain_name?` · held by ${item.holder_captain_name}`:"";
    return `${kit?.name||"Kit"} #${item.jersey_number} · ${item.size}${held}`;
  };

  function setStatus(message,ok=true){
    const node=el("jerseyFormStatus");
    if(!node)return;
    node.textContent=message||"";
    node.className="form-status "+(ok?"ok":"err");
  }

  function isMissingSchema(error){
    const message=String(error?.message||"").toLowerCase();
    return error?.code==="42P01"||message.includes("team_kits")||message.includes("jersey_inventory")||message.includes("schema cache");
  }

  function showSchemaNotice(show,message=""){
    const notice=el("jerseySchemaNotice");
    if(!notice)return;
    notice.classList.toggle("visible",show);
    if(message)notice.textContent=message;
  }

  function fillKitSelects(){
    [el("jerseyKit"),el("jerseyKitFilter")].forEach((select,index)=>{
      if(!select)return;
      const current=select.value;
      const first=index===1?'<option value="all">All kits</option>':'<option value="">Select kit…</option>';
      select.innerHTML=first+activeKits().map(kit=>`<option value="${esc(kit.id)}">${esc(kit.name)} · ${esc(kit.color_name)}</option>`).join("");
      if([...select.options].some(option=>option.value===current))select.value=current;
    });
  }

  function fillHolderSelect(selected=""){
    const select=el("jerseyHolder");
    if(!select)return;
    const names=[...captainNames];
    if(selected&&!names.some(name=>name.toLowerCase()===selected.toLowerCase()))names.push(selected);
    names.sort((a,b)=>a.localeCompare(b));
    select.innerHTML='<option value="">No captain assigned</option>'+names.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join("");
    select.value=selected||"";
  }

  function renderMetrics(){
    const activeInventory=inventory.filter(item=>item.status!=="retired");
    const values={
      jerseyMetricTotal:activeInventory.length,
      jerseyMetricOnHand:activeInventory.filter(item=>item.status==="on_hand"&&kitFor(item.kit_id)?.active!==false).length,
      jerseyMetricHeld:activeInventory.filter(item=>item.holder_captain_name).length,
      jerseyMetricUnavailable:activeInventory.filter(item=>item.status==="unavailable").length
    };
    Object.entries(values).forEach(([id,value])=>{if(el(id))el(id).textContent=String(value);});
  }

  function renderKits(){
    const host=el("jerseyKitList");
    if(!host)return;
    host.innerHTML=kits.length?kits.map(kit=>{
      const count=inventory.filter(item=>String(item.kit_id)===String(kit.id)&&item.status!=="retired").length;
      return `<div class="kit-card${kit.active===false?' archived':''}">
        <span class="kit-swatch" style="background:${esc(kit.color_hex)}"></span>
        <div class="kit-copy"><strong>${esc(kit.name)}</strong><small>${esc(kit.color_name)} · ${count} active jersey${count===1?"":"s"}${kit.active===false?" · Archived":""}</small></div>
        <div class="kit-actions jersey-write-only"><button class="mini-btn" type="button" data-kit-edit="${esc(kit.id)}">Edit</button><button class="mini-btn" type="button" data-kit-toggle="${esc(kit.id)}">${kit.active===false?"Restore":"Archive"}</button></div>
      </div>`;
    }).join(""):'<div class="jersey-empty">No kits configured.</div>';

    host.querySelectorAll("[data-kit-edit]").forEach(button=>button.addEventListener("click",()=>editKit(button.dataset.kitEdit)));
    host.querySelectorAll("[data-kit-toggle]").forEach(button=>button.addEventListener("click",()=>toggleKit(button.dataset.kitToggle)));
  }

  function filteredInventory(){
    const search=String(el("jerseySearch")?.value||"").trim().toLowerCase();
    const kitId=el("jerseyKitFilter")?.value||"all";
    const status=el("jerseyStatusFilter")?.value||"active";
    return inventory.filter(item=>{
      const kit=kitFor(item.kit_id);
      if(kitId!=="all"&&String(item.kit_id)!==kitId)return false;
      if(status==="active"&&item.status==="retired")return false;
      if(status!=="all"&&status!=="active"&&item.status!==status)return false;
      if(!search)return true;
      return [kit?.name,kit?.color_name,item.jersey_number,item.size,item.holder_captain_name,item.notes].some(value=>String(value||"").toLowerCase().includes(search));
    }).sort((a,b)=>{
      const kitA=kitFor(a.kit_id),kitB=kitFor(b.kit_id);
      return (Number(kitA?.sort_order)||0)-(Number(kitB?.sort_order)||0)||String(kitA?.name||"").localeCompare(String(kitB?.name||""))||Number(a.jersey_number)-Number(b.jersey_number);
    });
  }

  function renderInventory(){
    const body=el("jerseyInventoryBody");
    if(!body)return;
    const rows=filteredInventory();
    body.innerHTML=rows.length?rows.map(item=>{
      const kit=kitFor(item.kit_id);
      return `<tr>
        <td><div class="jersey-identity"><span class="jersey-number-badge">#${esc(item.jersey_number)}</span><strong>${esc(item.size)}</strong></div></td>
        <td><span class="jersey-kit-label"><i class="jersey-kit-dot" style="background:${esc(kit?.color_hex||'#dddddd')}"></i>${esc(kit?.name||"Unknown kit")}</span><br><small>${esc(kit?.color_name||"")}</small></td>
        <td><span class="jersey-state ${esc(item.status)}">${esc(statusLabel(item.status))}</span></td>
        <td>${esc(item.holder_captain_name||"—")}</td>
        <td>${esc(item.notes||"—")}</td>
        <td><div class="jersey-row-actions jersey-write-only"><button class="mini-btn" type="button" data-jersey-edit="${esc(item.id)}">Edit</button>${item.status!=="retired"?`<button class="mini-btn" type="button" data-jersey-retire="${esc(item.id)}">Retire</button>`:""}</div></td>
      </tr>`;
    }).join(""):'<tr><td colspan="6"><div class="jersey-empty">No jerseys match these filters.</div></td></tr>';
    body.querySelectorAll("[data-jersey-edit]").forEach(button=>button.addEventListener("click",()=>editJersey(button.dataset.jerseyEdit)));
    body.querySelectorAll("[data-jersey-retire]").forEach(button=>button.addEventListener("click",()=>retireJersey(button.dataset.jerseyRetire)));
  }

  function renderAll(){
    fillKitSelects();
    fillHolderSelect(el("jerseyHolder")?.value||"");
    renderMetrics();
    renderKits();
    renderInventory();
  }

  function resetKitForm(){
    if(el("kitEditId"))el("kitEditId").value="";
    if(el("kitName"))el("kitName").value="";
    if(el("kitColorName"))el("kitColorName").value="";
    if(el("kitColorHex"))el("kitColorHex").value="#741f35";
    if(el("saveKitBtn"))el("saveKitBtn").textContent="Add Kit";
    if(el("cancelKitEditBtn"))el("cancelKitEditBtn").style.display="none";
  }

  function editKit(id){
    const kit=kitFor(id);if(!kit||!canWrite())return;
    el("kitEditId").value=kit.id;el("kitName").value=kit.name;el("kitColorName").value=kit.color_name;el("kitColorHex").value=kit.color_hex;
    el("saveKitBtn").textContent="Update Kit";el("cancelKitEditBtn").style.display="inline-flex";
    el("kitName").focus();
  }

  async function toggleKit(id){
    if(!canWrite()){window.SKORViewerBlocked?.("manage kits");return;}
    const kit=kitFor(id);if(!kit)return;
    const next=kit.active===false;
    if(!next&&!confirm(`Archive ${kit.name}? Its jerseys will stop appearing for TEMP assignments, but inventory history will remain.`))return;
    const {error}=await client().from("team_kits").update({active:next}).eq("id",kit.id);
    if(error){setStatus("Could not update kit: "+error.message,false);return;}
    setStatus(`${kit.name} ${next?"restored":"archived"}.`);await load(false);
  }

  function resetJerseyForm(){
    if(el("jerseyEditId"))el("jerseyEditId").value="";
    if(el("jerseyKit"))el("jerseyKit").value=activeKits()[0]?.id||"";
    if(el("jerseyNumber"))el("jerseyNumber").value="";
    if(el("jerseySize"))el("jerseySize").value="";
    if(el("jerseyStatus"))el("jerseyStatus").value="on_hand";
    fillHolderSelect("");
    if(el("jerseyNotes"))el("jerseyNotes").value="";
    if(el("saveJerseyBtn"))el("saveJerseyBtn").textContent="Add Jersey";
    if(el("cancelJerseyEditBtn"))el("cancelJerseyEditBtn").style.display="none";
  }

  function editJersey(id){
    const item=itemFor(id);if(!item||!canWrite())return;
    el("jerseyEditId").value=item.id;el("jerseyKit").value=item.kit_id;el("jerseyNumber").value=item.jersey_number;el("jerseySize").value=item.size;el("jerseyStatus").value=item.status;fillHolderSelect(item.holder_captain_name||"");el("jerseyNotes").value=item.notes||"";
    el("saveJerseyBtn").textContent="Update Jersey";el("cancelJerseyEditBtn").style.display="inline-flex";
    el("jerseyNumber").focus();
  }

  async function retireJersey(id){
    if(!canWrite()){window.SKORViewerBlocked?.("retire jerseys");return;}
    const item=itemFor(id);if(!item)return;
    if(!confirm(`Retire ${displayLabel(item)}? It will stay in history but cannot be assigned to new TEMP players.`))return;
    const {error}=await client().from("jersey_inventory").update({status:"retired"}).eq("id",item.id);
    if(error){setStatus("Could not retire jersey: "+error.message,false);return;}
    setStatus(`${displayLabel(item)} retired.`);await load(false);
  }

  async function load(showMessage=false){
    if(loading)return;
    const sb=client();if(!sb)return;
    loading=true;
    try{
      const [kitResult,inventoryResult,captainResult]=await Promise.all([
        sb.from("team_kits").select("id,name,color_name,color_hex,active,sort_order,created_at,updated_at").order("sort_order",{ascending:true}).order("name",{ascending:true}),
        sb.from("jersey_inventory").select("id,kit_id,jersey_number,size,status,holder_captain_name,notes,created_at,updated_at").order("jersey_number",{ascending:true}),
        canWrite()?sb.rpc("get_notebook_captain_directory"):Promise.resolve({data:[],error:null})
      ]);
      if(kitResult.error||inventoryResult.error)throw kitResult.error||inventoryResult.error;
      kits=kitResult.data||[];inventory=inventoryResult.data||[];
      captainNames=(captainResult.error?[]:(captainResult.data||[]).map(row=>String(row.display_name||"").trim()).filter(Boolean));
      showSchemaNotice(false);renderAll();window.SKORLineup?.jerseysChanged?.();
      if(showMessage)setStatus(`Jersey inventory refreshed — ${inventory.filter(item=>item.status!=="retired").length} active assets.`);
    }catch(error){
      if(isMissingSchema(error))showSchemaNotice(true,"Jersey database setup is pending. The approved migration must finish before inventory can be saved.");
      else setStatus("Could not load jersey inventory: "+String(error?.message||error),false);
    }finally{loading=false;}
  }

  function availableOptions(currentId="",assignedIds=[]){
    const assigned=new Set((assignedIds||[]).filter(Boolean).map(String));
    const assignedNumbers=new Set(inventory.filter(item=>assigned.has(String(item.id))).map(item=>Number(item.jersey_number)));
    return inventory.filter(item=>{
      const current=String(item.id)===String(currentId||"");
      return (current||(item.status==="on_hand"&&kitFor(item.kit_id)?.active!==false&&!assigned.has(String(item.id))&&!assignedNumbers.has(Number(item.jersey_number))));
    }).sort((a,b)=>{
      const kitA=kitFor(a.kit_id),kitB=kitFor(b.kit_id);
      return (Number(kitA?.sort_order)||0)-(Number(kitB?.sort_order)||0)||Number(a.jersey_number)-Number(b.jersey_number);
    }).map(item=>({id:String(item.id),label:displayLabel(item),number:Number(item.jersey_number),size:item.size,kit:kitFor(item.kit_id)}));
  }

  function bind(){
    el("refreshJerseysBtn")?.addEventListener("click",()=>load(true));
    el("jerseySearch")?.addEventListener("input",renderInventory);
    el("jerseyKitFilter")?.addEventListener("change",renderInventory);
    el("jerseyStatusFilter")?.addEventListener("change",renderInventory);
    el("cancelKitEditBtn")?.addEventListener("click",resetKitForm);
    el("cancelJerseyEditBtn")?.addEventListener("click",resetJerseyForm);

    el("kitForm")?.addEventListener("submit",async event=>{
      event.preventDefault();if(!canWrite()){window.SKORViewerBlocked?.("manage kits");return;}
      const id=el("kitEditId").value.trim(),name=el("kitName").value.trim(),color_name=el("kitColorName").value.trim(),color_hex=el("kitColorHex").value.toUpperCase();
      if(!name||!color_name)return setStatus("Kit name and color name are required.",false);
      const button=el("saveKitBtn");button.disabled=true;button.textContent="Saving…";
      try{
        let result;
        if(id)result=await client().from("team_kits").update({name,color_name,color_hex}).eq("id",id);
        else result=await client().from("team_kits").insert({name,color_name,color_hex,sort_order:Math.max(0,...kits.map(kit=>Number(kit.sort_order)||0))+10});
        if(result.error)throw result.error;
        resetKitForm();setStatus(`${name} kit ${id?"updated":"added"}.`);await load(false);
      }catch(error){const message=String(error?.message||error);setStatus(message.toLowerCase().includes("duplicate")?"A kit with that name already exists.":"Could not save kit: "+message,false);}
      finally{button.disabled=false;if(!el("kitEditId").value)button.textContent="Add Kit";}
    });

    el("jerseyForm")?.addEventListener("submit",async event=>{
      event.preventDefault();if(!canWrite()){window.SKORViewerBlocked?.("manage jerseys");return;}
      const id=el("jerseyEditId").value.trim(),kit_id=el("jerseyKit").value,jersey_number=Number(el("jerseyNumber").value),size=el("jerseySize").value.trim().toUpperCase(),status=el("jerseyStatus").value,holder=el("jerseyHolder").value.trim(),notes=el("jerseyNotes").value.trim();
      if(!kit_id)return setStatus("Select a kit.",false);
      if(!Number.isInteger(jersey_number)||jersey_number<1||jersey_number>99)return setStatus("Jersey number must be 1–99.",false);
      if(!size)return setStatus("Enter the jersey size.",false);
      const payload={kit_id,jersey_number,size,status,holder_captain_name:holder||null,notes:notes||null};
      const button=el("saveJerseyBtn");button.disabled=true;button.textContent="Saving…";
      try{
        const result=id?await client().from("jersey_inventory").update(payload).eq("id",id):await client().from("jersey_inventory").insert(payload);
        if(result.error)throw result.error;
        resetJerseyForm();setStatus(`${kitFor(kit_id)?.name||"Kit"} #${jersey_number} ${id?"updated":"added to inventory"}.`);await load(false);
      }catch(error){const message=String(error?.message||error);setStatus(message.toLowerCase().includes("duplicate")?"That jersey number already exists in this kit.":"Could not save jersey: "+message,false);}
      finally{button.disabled=false;if(!el("jerseyEditId").value)button.textContent="Add Jersey";}
    });
  }

  function init(){
    if(!initialized){initialized=true;bind();resetKitForm();resetJerseyForm();}
    load(false);
  }

  window.SKORJerseys={
    init,
    activate:()=>initialized?load(false):init(),
    refresh:()=>load(false),
    availableOptions,
    labelFor:id=>displayLabel(itemFor(id)),
    getItem:id=>itemFor(id)
  };
})();
