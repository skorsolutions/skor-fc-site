/* SKOR FC Equipment + Lost & Found v58.5. Server RPCs own approval/stock rules. */
(function(){
  "use strict";
  const labels={ball_bag:"Ball bag",ball:"Ball",cone_set:"Cone set",cone:"Cone",other:"Other equipment"};
  const icons={ball_bag:"▣",ball:"⚽",cone_set:"△ △",cone:"△",other:"◈"};
  const activeLoans=new Set(["pending","approved","borrowed","return_pending"]);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const today=()=>new Date().toISOString().slice(0,10);
  const pretty=v=>String(v||"").replace(/_/g," ");
  const date=v=>v?new Date(v.length===10?v+"T12:00:00":v).toLocaleDateString():"";
  const categoryOptions=()=>Object.entries(labels).map(([v,t])=>`<option value="${v}">${t}</option>`).join("");
  let root=null,db=null,mode="captain",userId=null,epoch=0,loadSequence=0,data=null,busy=false,loading=false,tab="store",query="",category="all",archive=false;
  const selected=new Set();let photos=new Map(),dialogContext=null,authClient=null,authSubscription=null;
  const manage=()=>!!data?.can_manage&&mode==="captain"&&!!window.SKORPortalCanWrite?.();
  const canRequest=()=>!!data?.can_request;
  const item=id=>data?.items.find(i=>i.id===id);
  const report=id=>data?.reports.find(r=>r.id===id);
  const peopleOptions=(value="",unknown=false)=>`${unknown?'<option value="">Unknown / not sure</option>':'<option value="">Choose a captain or player…</option>'}`+
    ["captain","player"].map(kind=>`<optgroup label="${kind==="captain"?"Captains":"Players"}">${(data?.people||[]).filter(p=>p.kind===kind).map(p=>`<option value="${esc(p.key)}" ${p.key===value?"selected":""}>${esc(p.name)}</option>`).join("")}</optgroup>`).join("");
  const button=(action,text,id="",primary=false)=>`<button type="button" data-eq-action="${action}" data-id="${esc(id)}" ${busy||loading?'disabled':''} class="${primary?'eq-primary':''}">${esc(text)}</button>`;
  function notice(text,error=false,modal=false){
    const node=root?.querySelector(modal?".eq-dialog .eq-notice":".eq-main-notice");
    if(node){node.textContent=text||"";node.classList.toggle("eq-error",error);}
  }
  function shell(){
    root.classList.add("equipment-app");root.classList.toggle("eq-player",mode==="player");
    root.innerHTML='<div class="eq-head"><div><h2>Equipment &amp; Lost &amp; Found</h2><p class="eq-muted">Team gear, captain-approved borrowing, and a way to get lost items home.</p></div><button type="button" data-eq-action="refresh">Refresh</button></div><div class="eq-tabs" aria-label="Equipment views"></div><div class="eq-notice eq-main-notice" role="status" aria-live="polite"></div><div class="eq-content"></div><dialog class="eq-dialog" aria-labelledby="eqDialogTitle"></dialog>';
    root.addEventListener("click",onClick);root.addEventListener("change",onChange);root.addEventListener("input",onInput);root.addEventListener("submit",onSubmit);
    root.querySelector("dialog").addEventListener("cancel",e=>{if(busy)e.preventDefault();});
  }
  function clear(){
    epoch++;loadSequence++;userId=null;data=null;busy=false;loading=false;selected.clear();photos.clear();dialogContext=null;
    if(root){root.querySelector("dialog")?.close();root.querySelector(".eq-content").innerHTML="";root.querySelector(".eq-tabs").innerHTML="";notice("");}
  }
  async function mount(options){
    const nextRoot=document.getElementById(options.rootId);if(!nextRoot)return;
    if(root&&root!==nextRoot){clear();root.removeEventListener("click",onClick);root.removeEventListener("change",onChange);root.removeEventListener("input",onInput);root.removeEventListener("submit",onSubmit);}
    if(root!==nextRoot){root=nextRoot;mode=options.mode||"captain";db=options.client;shell();}
    db=options.client;
    if(authClient!==db){
      authSubscription?.unsubscribe?.();authClient=db;
      authSubscription=db.auth.onAuthStateChange?.((event,session)=>{
        if(event==="SIGNED_OUT"||(userId&&session?.user&&session.user.id!==userId))clear();
      })?.data?.subscription||null;
    }
    const started=epoch;
    try{
      const result=await db.auth.getUser();if(started!==epoch)return;
      if(result.error||!result.data?.user){clear();return;}
      if(userId&&userId!==result.data.user.id)clear();
      userId=result.data.user.id;
      if(!loading&&!busy)await refresh();
    }catch(e){if(started===epoch)notice("Could not open Equipment: "+e.message,true);}
  }
  async function refresh(){
    if(!userId||busy)return false;
    const started=epoch,sequence=++loadSequence;loading=true;draw();
    try{
      const result=await db.rpc("equipment_snapshot");
      if(started!==epoch||sequence!==loadSequence)return false;
      if(result.error)throw result.error;
      if(!result.data||!Array.isArray(result.data.items))throw new Error("Equipment could not finish loading.");
      data=result.data;
      selected.forEach(id=>{if(!item(id)||!item(id).active)selected.delete(id);});
      const paths=[...new Set([...data.items,...data.reports].map(x=>x.photo_path).filter(Boolean))];
      photos=new Map();
      if(paths.length){
        const signed=await db.storage.from("skor-equipment").createSignedUrls(paths,3600);
        if(started!==epoch||sequence!==loadSequence)return false;
        if(!signed.error)(signed.data||[]).forEach(p=>{if(p.signedUrl&&/^https?:\/\//.test(p.signedUrl))photos.set(p.path,p.signedUrl);});
      }
      notifyCaptains();
      return true;
    }catch(e){
      if(started===epoch&&sequence===loadSequence){
        data=null;selected.clear();photos.clear();
        const missing=/PGRST202|equipment_snapshot|schema cache|does not exist/i.test(e.code+" "+e.message);
        notice(missing?"Equipment is not available yet. Please check back after the team enables it.":"Could not refresh Equipment: "+e.message,true);
      }
      return false;
    }finally{if(started===epoch&&sequence===loadSequence){loading=false;draw();}}
  }
  function filteredItems(){return (data?.items||[]).filter(i=>i.active&&(category==="all"||i.category===category)&&`${i.name} ${i.description} ${i.holder_name}`.toLowerCase().includes(query.toLowerCase()));}
  function art(row){const url=photos.get(row.photo_path);return `<div class="eq-art">${url?`<img src="${esc(url)}" alt="${esc(row.name||row.title)}" loading="lazy">`:esc(icons[row.category]||"⌕")}</div>`;}
  function filters(){return `<div class="eq-filters"><label>Search equipment<input data-eq-filter="query" type="search" value="${esc(query)}" placeholder="Name or custodian"></label><label>Category<select data-eq-filter="category"><option value="all">All equipment</option>${categoryOptions()}</select></label></div>`;}
  function draw(){
    if(!root)return;
    root.querySelector('[data-eq-action="refresh"]').disabled=busy||loading;
    const tabs=[["store","Equipment Store"],["loans",manage()?"Requests & returns":"My borrowing"],...(manage()?[["inventory","Inventory"]]:[]),["lost","Lost & Found"],["notifications",`Notifications${data?` (${data.notifications.filter(n=>!n.read).length})`:""}`],...(manage()?[["history","History"]]:[])];
    if(!tabs.some(t=>t[0]===tab))tab="store";
    root.querySelector(".eq-tabs").innerHTML=tabs.map(([key,label])=>`<button type="button" data-eq-tab="${key}" aria-pressed="${tab===key}" ${busy?'disabled':''}>${esc(label)}</button>`).join("");
    const host=root.querySelector(".eq-content");if(!data){host.innerHTML=loading?'<div class="eq-empty">Loading equipment…</div>':'';return;}
    if(tab==="store")host.innerHTML=storeView();
    if(tab==="loans")host.innerHTML=loansView();
    if(tab==="inventory")host.innerHTML=inventoryView();
    if(tab==="lost")host.innerHTML=lostView();
    if(tab==="notifications")host.innerHTML=notificationsView();
    if(tab==="history")host.innerHTML=`<div class="eq-list">${data.history.map(h=>`<article class="eq-card"><strong>${esc(h.summary)}</strong><p class="eq-muted">${esc(h.actor_name)} · ${date(h.created_at)}</p></article>`).join("")||'<div class="eq-empty">No equipment history yet.</div>'}</div>`;
    const select=host.querySelector('[data-eq-filter="category"]');if(select)select.value=category;
  }
  function storeView(){
    return '<p class="eq-muted">Requests need captain approval. Approval reserves the gear; a captain confirms pickup. Bags include their listed contents. Individual contents can be requested separately.</p>'+filters()+`<div class="eq-grid">${filteredItems().map(i=>{
      const contents=data.items.filter(c=>c.parent_id===i.id);
      const open=data.loans.some(l=>l.is_mine&&l.item_id===i.id&&activeLoans.has(l.status));
      return `<article class="eq-card">${art(i)}<span class="eq-tag">${esc(labels[i.category])}</span><h3>${esc(i.name)}</h3><p>${esc(i.description)}</p><p><strong>${i.available} available</strong> / ${i.quantity} total${i.missing?` · <span class="eq-warn">${i.missing} missing</span>`:""}</p><p class="eq-muted">Stock custodian: ${esc(i.holder_name)}${i.parent_id?`<br>Part of ${esc(item(i.parent_id)?.name||"bag")}`:""}</p>${contents.length?`<p class="eq-muted">Contains ${contents.map(c=>`${c.quantity} × ${esc(c.name)}`).join(", ")}</p>`:""}<button type="button" data-eq-action="request" data-id="${i.id}" class="eq-primary" ${!canRequest()||i.available<1||open||busy||loading?'disabled':''}>${open?"Request already open":i.available?"Request to borrow":"Currently unavailable"}</button></article>`;
    }).join("")||'<div class="eq-empty">No matching equipment. A captain can add team gear in Inventory.</div>'}</div>`;
  }
  function loansView(){
    return `<div class="eq-list">${data.loans.map(l=>{
      const overdue=["borrowed","return_pending"].includes(l.status)&&l.due_date<today();
      let actions="";
      if(manage()&&l.status==="pending")actions+=button("approve","Approve & reserve",l.id,true)+button("decline","Decline",l.id);
      if(manage()&&l.status==="approved")actions+=button("pickup","Confirm physical handoff",l.id,true);
      if((l.is_mine||manage())&&l.status==="borrowed")actions+=button("report_return","Report return",l.id,true);
      if(manage()&&l.status==="return_pending")actions+=button("confirm_return","Confirm receipt & condition",l.id,true);
      if((l.is_mine||manage())&&["pending","approved"].includes(l.status))actions+=button("cancel","Cancel request",l.id);
      return `<article class="eq-card eq-loan-grid"><div><span class="eq-tag">${esc(pretty(l.status))}</span>${overdue?'<span class="eq-tag eq-warn">Overdue</span>':''}<h3>${l.quantity} × ${esc(l.item_name)}</h3><p>${esc(l.borrower_name)} · Return by ${date(l.due_date)}</p><p class="eq-muted">${esc(l.note)}</p>${l.allocations?.length>1?`<p class="eq-muted">Includes ${l.allocations.map(a=>`${a.quantity} × ${esc(a.name)}`).join(", ")}</p>`:""}${l.return_condition?`<p class="eq-muted">Return condition: ${esc(l.return_condition)}</p>`:""}</div><div class="eq-actions">${actions}</div></article>`;
    }).join("")||'<div class="eq-empty">No borrowing requests yet.</div>'}</div>`;
  }
  function inventoryView(){
    const rows=filteredItems(),visible=rows.filter(i=>!i.parent_id);
    return `<div class="eq-actions">${button("add_item","Add equipment","",true)}${button("select_all","Select all matching")}${button("clear_selection","Clear selection")}</div>${filters()}<div class="eq-bulk"><strong>${selected.size} selected${[...selected].some(id=>!visible.some(i=>i.id===id))?" (includes hidden selections)":""}</strong><label>Receiving custodian<select name="eqBulkHolder">${peopleOptions()}</select></label>${button("transfer","Confirm custody handoff","",true)}<p class="eq-muted">Select whole bags to include their contents. Detach an individual item in Edit before transferring it separately. Borrowed, reserved or missing gear cannot be transferred.</p></div><div class="eq-grid">${rows.map(i=>`<article class="eq-card"><label class="eq-select"><input type="checkbox" data-eq-select="${i.id}" ${selected.has(i.id)?"checked":""} ${i.parent_id||busy||loading?'disabled':''}>${i.parent_id?"Included with its bag":"Select for handoff"}</label><h3>${esc(i.name)}</h3><p>${esc(labels[i.category])} · ${i.quantity} total · ${i.available} available${i.missing?` · ${i.missing} missing`:""}</p><p class="eq-muted">Stock custodian: ${esc(i.holder_name)}${i.parent_id?`<br>In ${esc(item(i.parent_id)?.name||"bag")}`:""}</p>${button("edit_item","Edit equipment",i.id)}</article>`).join("")||'<div class="eq-empty">No active equipment yet.</div>'}</div><details style="margin-top:16px"><summary>Retired equipment</summary><div class="eq-list">${data.items.filter(i=>!i.active).map(i=>`<article class="eq-card"><strong>${esc(i.name)}</strong>${button("edit_item","Edit / restore",i.id)}</article>`).join("")||'<p class="eq-muted">No retired equipment.</p>'}</div></details>`;
  }
  function lostView(){
    return `<div class="eq-actions">${canRequest()?button("add_report","Report missing or found item","",true):""}${button("toggle_archive",archive?"Show open reports":"Show resolved reports")}</div><p class="eq-muted">Reports stay inside the team. A captain can announce a report to all players. Found sightings do not restore missing stock until a captain confirms recovery.</p><div class="eq-grid">${data.reports.filter(r=>(r.status==="returned")===archive).map(r=>{
      let actions="";const mine=r.is_mine||manage();
      if(r.status!=="returned"){
        if(canRequest())actions+=button("contact",r.kind==="found"?"This may be mine / contact finder":"I found it / I saw it",r.id,true);
        if(mine&&r.status!=="found")actions+=button("found","Confirm found, awaiting return",r.id);
        if(mine&&(!r.stock_missing||manage()))actions+=button("resolve",r.stock_missing?"Confirm recovered stock":"Confirm returned / resolve",r.id);
        if(manage()&&!r.announced_at)actions+=button("announce","Announce to team",r.id);
        if(manage()&&r.kind==="missing"&&!r.item_id)actions+=button("link_missing","Link missing team equipment",r.id);
      }
      const messages=data.messages.filter(m=>m.report_id===r.id);
      return `<article class="eq-card">${art(r)}<span class="eq-tag">${esc(pretty(r.status))}</span>${r.announced_at?'<span class="eq-tag">Announced to team</span>':''}<h3>${esc(r.title)}</h3><p>${esc(r.description)}</p><p class="eq-muted">${esc(r.location)} · ${date(r.seen_date)}<br>Reported by ${esc(r.reporter_name)} · Owner: ${esc(r.owner_name||"unknown")}</p>${r.item_id?`<p class="eq-muted">Team inventory: ${r.quantity} × ${esc(item(r.item_id)?.name||"equipment")}${r.stock_missing?" (unavailable until recovered)":""}</p>`:""}<div class="eq-actions">${actions}</div>${messages.length?`<div class="eq-thread"><strong>Private messages · captains can help</strong>${messages.map(m=>`<div class="eq-message">${esc(m.body)}<small>${esc(m.author_name)} → ${esc(m.recipient_name)} · ${date(m.created_at)}</small>${m.recipient_key===data.actor_key?`<button type="button" data-eq-action="reply" data-id="${r.id}" data-to="${esc(m.author_key)}">Reply to ${esc(m.author_name)}</button>`:""}</div>`).join("")}</div>`:""}</article>`;
    }).join("")||`<div class="eq-empty">No ${archive?"resolved":"open"} Lost & Found reports.</div>`}</div>`;
  }
  function notificationsView(){
    return `<p class="eq-muted">Team announcements and private Equipment / Lost & Found updates appear here. Use Refresh to check for new updates.</p><div class="eq-list">${data.notifications.map(n=>`<article class="eq-card ${n.read?'':'eq-unread'}"><p>${esc(n.body)}</p><p class="eq-muted">${date(n.created_at)} · ${n.audience==="team"?"Team announcement":n.audience==="captains"?"Captain update":"Private update"}</p><div class="eq-actions">${n.report_id?button("open_report","Open Lost & Found",n.report_id):n.loan_id?button("open_loan","Open borrowing",n.loan_id):""}${!n.read&&canRequest()?button("read_notification","Mark read",n.id):""}</div></article>`).join("")||'<div class="eq-empty">No notifications yet.</div>'}</div>`;
  }
  function modal(title,fields,context,submit="Save"){
    dialogContext={...context,request_id:crypto.randomUUID()};const d=root.querySelector("dialog");
    d.innerHTML=`<form><header><h3 id="eqDialogTitle">${esc(title)}</h3><button type="button" data-eq-action="close" aria-label="Close dialog">✕</button></header><fieldset>${fields}</fieldset><footer><div class="eq-notice" role="status" aria-live="polite"></div><div class="eq-actions"><button type="button" data-eq-action="close">Cancel</button><button class="eq-primary" type="submit">${esc(submit)}</button></div></footer></form>`;
    d.showModal();
  }
  const input=(name,label,value="",type="text",attrs="")=>`<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
  const textarea=(name,label,value="",max=1000)=>`<label>${esc(label)}<textarea name="${name}" maxlength="${max}">${esc(value)}</textarea></label>`;
  const photoInput=()=>'<label>Photo (optional, JPG / PNG / WebP, up to 5 MB)<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label>';
  function editItem(id){
    const i=item(id)||{name:"",category:"ball",quantity:1,active:true,holder_key:data.actor_key};
    const parents=data.items.filter(p=>p.active&&["ball_bag","cone_set"].includes(p.category)&&p.id!==id);
    modal(id?"Edit equipment":"Add equipment",input("name","Equipment name",i.name,"text",'required maxlength="100"')+`<div class="eq-pair"><label>Category<select name="category">${Object.entries(labels).map(([key,label])=>`<option value="${key}" ${key===i.category?"selected":""}>${label}</option>`).join("")}</select></label>${input("quantity","Quantity",i.quantity,"number",'required min="1" max="500" step="1"')}</div>`+`<label>Bag / cone set (optional)<select name="parent_id"><option value="">Standalone equipment</option>${parents.map(p=>`<option value="${p.id}" ${p.id===i.parent_id?'selected':''}>${esc(p.name)} (${esc(labels[p.category])})</option>`).join("")}</select></label><p class="eq-muted">Use one inventory entry per individual ball, or a quantity for identical balls/cones. Bag/set quantity is always 1; contents are separate linked entries.</p><label>Stock custodian<select name="holder_key" required>${peopleOptions(i.holder_key)}</select></label>`+textarea("description","Description",i.description||"")+photoInput()+`<label>Status<select name="active"><option value="true" ${i.active?'selected':''}>Active</option><option value="false" ${!i.active?'selected':''}>Retired</option></select></label>`,{action:"save_item",id:id||null,photo_path:i.photo_path||null},"Save equipment");
  }
  function addReport(){
    modal("Report missing or found item",`<label>Report type<select name="kind"><option value="missing">Missing item</option><option value="found">Found item</option></select></label>`+input("title","Item name","","text",'required maxlength="100"')+textarea("description","Description / identifying details","",1500)+input("location","Last seen / found location or event","","text",'required maxlength="160"')+input("seen_date","Date",today(),"date",`required max="${today()}"`)+`<label>Owner<select name="owner_key">${peopleOptions("",true)}</select></label><p class="eq-muted">For missing personal items, an unknown owner defaults to you. Captains can link verified missing team equipment after reviewing the report.</p>`+photoInput(),{action:"report"},"Post report");
    root.querySelector('textarea[name="description"]').required=true;
  }
  async function onClick(e){
    const target=e.target.closest("button");if(!target||!root.contains(target)||busy)return;
    if(target.dataset.eqTab){tab=target.dataset.eqTab;draw();return;}
    const action=target.dataset.eqAction,id=target.dataset.id;if(!action)return;
    if(action==="close"){root.querySelector("dialog").close();dialogContext=null;return;}
    if(action==="refresh"){notice("");await refresh();return;}
    if(!data||loading)return;
    if(["add_item","edit_item","select_all","clear_selection","transfer","approve","decline","pickup","confirm_return","link_missing","announce"].includes(action)&&!manage())return;
    if(action==="request"){
      const i=item(id);if(!canRequest()||!i||i.available<1)return;
      modal("Request to borrow "+i.name,input("quantity","Quantity",1,"number",`required min="1" max="${i.available}" step="1"`)+input("due_date","Return by",today(),"date",`required min="${today()}"`)+textarea("note","Pickup / borrowing note (optional)","",500)+'<p class="eq-muted">This sends a request to the captains. Equipment stays with its current custodian until approval and confirmed pickup.</p>',{action:"request",item_id:id},"Send for captain approval");return;
    }
    if(action==="add_item"||action==="edit_item"){editItem(id);return;}
    if(action==="select_all"){filteredItems().filter(i=>!i.parent_id&&i.available===i.quantity&&i.missing===0).forEach(i=>selected.add(i.id));draw();return;}
    if(action==="clear_selection"){selected.clear();draw();return;}
    if(action==="transfer"){
      const holder=root.querySelector('[name="eqBulkHolder"]').value,person=data.people.find(p=>p.key===holder);
      if(!selected.size||!person)return notice("Select equipment and choose its receiving custodian.",true);
      const ids=[...selected];const expanded=data.items.filter(i=>ids.includes(i.id)||ids.includes(i.parent_id));
      modal("Confirm equipment handoff",`<p>Confirm that <strong>${esc(person.name)}</strong> now physically holds:</p><ul>${expanded.map(i=>`<li>${i.quantity} × ${esc(i.name)}</li>`).join("")}</ul><p class="eq-muted">Includes selected items outside the current filter and all contents of selected bags. This records custody; team ownership stays the same.</p>`,{action:"transfer",ids,holder_key:holder},"Confirm physical handoff");return;
    }
    if(action==="add_report"){if(canRequest())addReport();return;}
    if(action==="toggle_archive"){archive=!archive;draw();return;}
    if(action==="open_report"){tab="lost";archive=report(id)?.status==="returned";draw();return;}
    if(action==="open_loan"){tab="loans";draw();return;}
    if(action==="read_notification"){await mutate(action,{id});return;}
    if(action==="contact"||action==="reply"){
      const r=report(id);if(!canRequest()||!r)return;
      const to=target.dataset.to||((r.owner_key&&r.owner_key!==data.actor_key)?r.owner_key:r.reporter_key);
      if(to===data.actor_key)return notice("You posted this report. Other players can contact you here when they find or see the item.");
      const person=data.people.find(p=>p.key===to);
      modal("Contact "+(person?.name||r.reporter_name),textarea("body","Private message",action==="contact"?(r.kind==="found"?"I think this item is mine. ":"I found / saw this item at "):"",1000)+'<p class="eq-muted">Visible to you, the recipient, and captains helping with the return.</p>',{action:"message",id,to_key:to},"Send private message");root.querySelector('textarea[name="body"]').required=true;return;
    }
    if(action==="link_missing"){
      modal("Verify missing team equipment",`<label>Inventory item<select name="item_id" required><option value="">Choose equipment…</option>${data.items.filter(i=>i.active&&i.missing<i.quantity).map(i=>`<option value="${i.id}">${esc(i.name)} (${i.quantity-i.missing} not marked missing)</option>`).join("")}</select></label>`+input("quantity","Missing quantity",1,"number",'required min="1" max="500" step="1"')+'<p class="eq-muted">The missing quantity and its bag become unavailable for borrowing until a captain verifies recovery.</p>',{action,id},"Mark stock missing");return;
    }
    const descriptions={approve:["Approve borrowing","Reserve this gear for the player? A separate physical handoff is still required.","Approve & reserve"],decline:["Decline request","Decline this borrowing request?","Decline"],pickup:["Confirm physical handoff","Confirm the borrower has physically collected all listed equipment?","Confirm handoff"],report_return:["Report returned equipment","Confirm you have handed the equipment back to its stock custodian? A captain will verify receipt.","Report return"],confirm_return:["Confirm return receipt","Confirm all equipment has been received?","Confirm receipt"],cancel:["Cancel borrowing request","Release this uncollected request or reservation?","Cancel request"],announce:["Announce to the team","Post this Lost & Found report to every player's in-app notifications? It stays inside the team.","Announce to team"],found:["Confirm item found","Record that the item was found and is awaiting return? Missing stock stays unavailable until recovery is verified.","Confirm found"],resolve:["Confirm returned / recovered","Confirm the item is back with its owner or stock custodian? Linked missing quantities become available after this verification.","Confirm returned"]};
    if(descriptions[action]){
      const [title,text,submit]=descriptions[action],loan=data.loans.find(l=>l.id===id),r=report(id);
      let details="";
      if(loan){
        const contents=loan.allocations?.length?loan.allocations:data.items.filter(i=>i.parent_id===loan.item_id).map(i=>({name:i.name,quantity:i.quantity}));
        details=`<p><strong>${loan.quantity} × ${esc(loan.item_name)}</strong><br>${esc(loan.borrower_name)} · Return by ${date(loan.due_date)}</p>${contents.length?`<ul>${contents.map(i=>`<li>${i.quantity} × ${esc(i.name)}</li>`).join("")}</ul>`:""}`;
      }else if(r)details=`<p><strong>${esc(r.title)}</strong><br>${esc(r.location)} · ${date(r.seen_date)}</p>`;
      modal(title,details+`<p>${esc(text)}</p>${action==="confirm_return"?textarea("condition","Return condition","Received in good condition",500):""}`,{action,id},submit);
    }
  }
  function onChange(e){
    if(e.target.dataset.eqSelect){if(busy||loading)return;e.target.checked?selected.add(e.target.dataset.eqSelect):selected.delete(e.target.dataset.eqSelect);draw();}
    if(e.target.dataset.eqFilter==="category"){category=e.target.value;draw();}
  }
  function onInput(e){
    if(e.target.dataset.eqFilter!=="query")return;
    const caret=e.target.selectionStart;query=e.target.value;draw();const input=root.querySelector('[data-eq-filter="query"]');input.focus();input.setSelectionRange(caret,caret);
  }
  async function onSubmit(e){
    if(!e.target.closest(".eq-dialog"))return;e.preventDefault();if(busy||!dialogContext||!e.target.reportValidity())return;
    const payload={...dialogContext};delete payload.action;
    const values=new FormData(e.target);for(const [key,value] of values){if(key!=="photo")payload[key]=value;}
    if("quantity" in payload)payload.quantity=Number(payload.quantity);
    if("active" in payload)payload.active=payload.active==="true";
    const file=values.get("photo");
    await mutate(dialogContext.action,payload,{modal:true,file:file?.size?file:null});
  }
  function setBusy(value){
    busy=value;draw();const d=root.querySelector("dialog");d.querySelectorAll("button").forEach(b=>b.disabled=value);const f=d.querySelector("fieldset");if(f)f.disabled=value;
  }
  async function mutate(action,payload,options={}){
    if(busy||!userId)return false;const started=epoch,actor=userId;let uploaded=null,acknowledged=false,acceptedPhoto=null;
    payload.request_id=payload.request_id||crypto.randomUUID();
    setBusy(true);notice("Saving…",false,options.modal);
    try{
      const identity=await db.auth.getUser();if(started!==epoch)return false;
      if(identity.error||identity.data?.user?.id!==actor){clear();throw new Error("Your account changed. Reopen Equipment before saving.");}
      if(options.file){
        const file=options.file;const ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[file.type];
        if(!ext||file.size>5242880)throw new Error("Choose a JPG, PNG or WebP photo up to 5 MB.");
        const path=actor+"/"+crypto.randomUUID()+"."+ext;
        const upload=await db.storage.from("skor-equipment").upload(path,file,{contentType:file.type,upsert:false});
        if(upload.error)throw upload.error;uploaded=path;if(started!==epoch)return false;payload.photo_path=path;
      }
      const result=await db.rpc("equipment_action",{p_action:action,p_payload:payload});
      if(started!==epoch)return false;
      if(result.error)throw result.error;
      if(result.data?.ok!==true)throw new Error("The save could not be verified. Refresh before retrying.");
      acknowledged=true;
      notifyCaptains();
      acceptedPhoto=result.data.photo_path;
      if(options.modal){root.querySelector("dialog").close();dialogContext=null;}
      if(action==="transfer")selected.clear();
      notice(result.data.summary||"Saved.");
      return true;
    }catch(e){
      if(started===epoch)notice("Could not save: "+e.message,true,options.modal);
      return false;
    }finally{
      if(uploaded&&(!acknowledged||acceptedPhoto!==uploaded)){try{await db.storage.from("skor-equipment").remove([uploaded]);}catch(_){/* RLS prevents deleting any referenced photo. */}}
      if(started===epoch){setBusy(false);if(acknowledged)await refresh();}
    }
  }
  function notifyCaptains(){
    if(mode==='captain'&&typeof window.CustomEvent==='function')window.dispatchEvent?.(new window.CustomEvent('skor:equipment-notifications'));
  }
  function applyNotificationRead(id){
    const row=data?.notifications.find(n=>n.id===id);if(!row)return;
    row.read=true;if(tab==='notifications')draw();
  }
  async function openNotification(row){
    if(!userId||busy)return false;
    if(!await refresh())return false;
    tab=row.report_id?'lost':row.loan_id?'loans':'notifications';
    if(row.report_id)archive=report(row.report_id)?.status==='returned';
    draw();root.querySelector('.eq-content')?.scrollIntoView?.({behavior:'smooth',block:'start'});return true;
  }
  window.SKOREquipment={mount,refresh,clear,applyNotificationRead,openNotification};
})();
