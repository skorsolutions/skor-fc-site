(function(root){
  "use strict";
  const PREFERENCE_KEY="skor_fc_ribbon_order_v1";
  function normalizeOrder(value,defaults){
    const allowed=new Set(defaults),seen=new Set(),result=[];
    for(const id of [...(Array.isArray(value)?value:[]),...defaults]){
      if(typeof id==="string"&&allowed.has(id)&&!seen.has(id)){seen.add(id);result.push(id);}
    }
    return result;
  }
  function moveItem(order,id,target){
    const result=order.slice(),from=result.indexOf(id);
    if(from<0||!Number.isInteger(target)||target<0||target>=result.length)return result;
    result.splice(from,1);result.splice(target,0,id);return result;
  }
  function preferenceStore(client,defaults){
    async function getOwner(id){
      const {data,error}=await client.auth.getUser();
      if(error)throw error;
      if(!id||data?.user?.id!==id)throw new Error("Your login changed. Reopen the ribbon editor.");
      return data.user;
    }
    return {
      async load(id){const user=await getOwner(id);return normalizeOrder(user.user_metadata?.[PREFERENCE_KEY],defaults);},
      async save(id,order){
        await getOwner(id);
        const normalized=normalizeOrder(order,defaults);
        // Personal presentation preference only; never used for captain authorization.
        const {data,error}=await client.auth.updateUser({data:{[PREFERENCE_KEY]:normalized}});
        if(error)throw error;
        if(data?.user?.id!==id)throw new Error("Your login changed. Reopen the ribbon editor.");
        const saved=normalizeOrder(data.user.user_metadata?.[PREFERENCE_KEY],defaults);
        if(JSON.stringify(saved)!==JSON.stringify(normalized))throw new Error("The ribbon order was not saved. Try again.");
        return saved;
      }
    };
  }
  function createController(win){
    const doc=win.document,nav=doc.querySelector(".nav");
    const trigger=doc.getElementById("ribbonOrderToggle"),dialog=doc.getElementById("ribbonOrderDialog"),list=doc.getElementById("ribbonOrderList");
    const save=doc.getElementById("ribbonOrderSave"),cancel=doc.getElementById("ribbonOrderCancel"),reset=doc.getElementById("ribbonOrderReset"),status=doc.getElementById("ribbonOrderStatus");
    if(!nav||!trigger||!dialog||!list||!save||!cancel||!reset||!status)return null;
    const buttons=new Map([...nav.querySelectorAll("button[data-view]")].map(button=>[button.dataset.view,button]));
    const defaults=[...buttons.keys()];
    let owner="",saved=defaults.slice(),draft=saved.slice(),editing=false,busy=false,generation=0,dragId=null,focusedBeforeOpen=null;
    const canEdit=()=>!!owner&&!!win.SKORPortalCanWrite?.();
    function applyOrder(order){
      order.forEach(id=>{const button=buttons.get(id);if(button)nav.appendChild(button);});
      // Keep the current tab visible without scrolling the working page.
      const active=[...buttons.values()].find(button=>button.classList.contains("active"));
      if(!active?.getBoundingClientRect)return;
      const item=active.getBoundingClientRect(),bounds=nav.getBoundingClientRect();
      if(nav.scrollWidth>nav.clientWidth){
        if(item.left<bounds.left)nav.scrollLeft+=item.left-bounds.left;
        else if(item.right>bounds.right)nav.scrollLeft+=item.right-bounds.right;
      }else if(nav.scrollHeight>nav.clientHeight){
        if(item.top<bounds.top)nav.scrollTop+=item.top-bounds.top;
        else if(item.bottom>bounds.bottom)nav.scrollTop+=item.bottom-bounds.bottom;
      }
    }
    function setBusy(value){
      busy=value;save.disabled=value;cancel.disabled=value;reset.disabled=value;
      list.querySelectorAll("button").forEach(button=>{button.disabled=value||button.dataset.boundary==="true";});
      dialog.setAttribute("aria-busy",String(value));
      save.textContent=value?"Saving…":"🔒 Lock & save";
    }
    function updateTrigger(){
      trigger.hidden=!canEdit();
      trigger.textContent=editing?"🔓 Ribbon unlocked":"🔒 Ribbon locked";
      trigger.setAttribute("aria-expanded",String(editing));
    }
    function render(focusId=null,direction=null){
      list.replaceChildren();
      draft.forEach((id,index)=>{
        const original=buttons.get(id);
        if(win.getComputedStyle(original).display==="none")return;
        const label=original.querySelector("span")?.textContent.trim()||id;
        const row=doc.createElement("li");row.className="ribbon-order-row";row.dataset.view=id;
        const grip=doc.createElement("span");grip.className="ribbon-order-grip";grip.textContent="⠿";grip.setAttribute("aria-hidden","true");
        grip.draggable=win.matchMedia("(hover:hover) and (pointer:fine)").matches&&!busy;
        grip.addEventListener("dragstart",event=>{
          if(!editing||busy||!canEdit()){event.preventDefault();return;}
          dragId=id;event.dataTransfer.setData("text/plain",id);event.dataTransfer.effectAllowed="move";
        });
        grip.addEventListener("dragend",()=>{dragId=null;});
        row.addEventListener("dragover",event=>{if(editing&&!busy&&dragId&&canEdit()){event.preventDefault();event.dataTransfer.dropEffect="move";}});
        row.addEventListener("drop",event=>{
          if(!editing||busy||!dragId||!canEdit())return;
          event.preventDefault();draft=moveItem(draft,dragId,index);dragId=null;applyOrder(draft);render();status.textContent="Order changed. Lock & save when ready.";
        });
        const name=doc.createElement("span");name.className="ribbon-order-label";name.textContent=label;
        row.append(grip,name);
        for(const [action,offset,symbol] of [["up",-1,"↑"],["down",1,"↓"]]){
          const button=doc.createElement("button");button.type="button";button.className="ribbon-order-move";button.textContent=symbol;
          button.dataset.direction=action;button.dataset.boundary=String(index+offset<0||index+offset>=draft.length);
          button.disabled=busy||button.dataset.boundary==="true";button.setAttribute("aria-label","Move "+label+" "+action);
          button.addEventListener("click",()=>{
            if(!editing||busy||!canEdit())return;
            draft=moveItem(draft,id,index+offset);applyOrder(draft);render(id,action);status.textContent=label+" moved "+action+". Lock & save when ready.";
          });
          row.append(button);
        }
        list.append(row);
      });
      if(focusId){
        const row=[...list.children].find(item=>item.dataset.view===focusId);
        const button=[...row?.querySelectorAll("button")||[]].find(item=>item.dataset.direction===direction&&!item.disabled)||[...row?.querySelectorAll("button")||[]].find(item=>!item.disabled);
        button?.focus({preventScroll:true});
        row?.scrollIntoView?.({block:"nearest",inline:"nearest"});
      }
    }
    function finish(){
      editing=false;dragId=null;updateTrigger();
      if(dialog.open)dialog.close();
      focusedBeforeOpen?.focus({preventScroll:true});focusedBeforeOpen=null;
    }
    function discard(){if(busy)return;draft=saved.slice();applyOrder(saved);finish();}
    function open(){
      if(!canEdit()||trigger.disabled||editing||busy)return;
      focusedBeforeOpen=doc.activeElement;draft=saved.slice();status.textContent="";render();
      try{dialog.showModal();editing=true;updateTrigger();}
      catch{status.textContent="The ribbon editor could not open. Reload and try again.";}
    }
    async function commit(){
      if(!editing||busy||!canEdit())return;
      const request=generation,id=owner;setBusy(true);status.textContent="Saving your ribbon order…";
      try{
        const result=await preferenceStore(win.SKORSupabase,defaults).save(id,draft);
        if(request!==generation)return;
        saved=result;draft=result.slice();applyOrder(saved);setBusy(false);finish();
        trigger.title="Your ribbon order is saved to your captain account.";
      }catch{
        if(request!==generation)return;
        setBusy(false);status.textContent="Could not save your order. Try Lock & save again, or Cancel to restore it.";
      }
    }
    function clear(){
      generation++;owner="";setBusy(false);saved=defaults.slice();draft=saved.slice();applyOrder(saved);finish();trigger.disabled=false;
    }
    async function init(user){
      if(!win.SKORPortalCanWrite?.()||!user?.id){clear();return;}
      if(owner===user.id)return; // Auth refreshes must not discard an open editor.
      clear();owner=user.id;
      saved=normalizeOrder(user.user_metadata?.[PREFERENCE_KEY],defaults);draft=saved.slice();applyOrder(saved);updateTrigger();trigger.disabled=true;
      const request=generation;
      try{
        const order=await preferenceStore(win.SKORSupabase,defaults).load(owner);
        if(request!==generation)return;
        saved=order;draft=order.slice();applyOrder(saved);
      }catch{if(request===generation)trigger.title="Open the editor to retry saving your personal order.";}
      if(request===generation)trigger.disabled=false;
    }
    trigger.addEventListener("click",open);save.addEventListener("click",commit);cancel.addEventListener("click",discard);
    reset.addEventListener("click",()=>{if(!editing||busy||!canEdit())return;draft=defaults.slice();applyOrder(draft);render();status.textContent="Default order restored. Lock & save to keep it.";});
    dialog.addEventListener("cancel",event=>{event.preventDefault();discard();});
    dialog.addEventListener("close",()=>{if(editing){if(busy)return;draft=saved.slice();applyOrder(saved);finish();}});
    win.addEventListener("resize",()=>{if(editing&&!busy)render();});
    updateTrigger();
    return {init,clear};
  }
  const api={PREFERENCE_KEY,normalizeOrder,moveItem,preferenceStore,createController};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.SKORRibbonOrder=createController(root);
})(typeof window!=="undefined"?window:globalThis);
