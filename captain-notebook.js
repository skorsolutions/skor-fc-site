/* SKOR FC Captain Notebook v52.0
   Kept in a separate file so the existing lineup, Game Day, and portal engines remain isolated. */
(function(){
  "use strict";

  const NOTE_TABLE="captain_notebook_entries";
  const DEBRIEF_TABLE="captain_match_debriefs";
  const ASSESSMENT_TABLE="captain_player_assessments";
  const PLAYER_TAGS=[
    ["strong_game","Strong Game"],
    ["improving","Improving"],
    ["steady","Steady"],
    ["struggled","Struggled"],
    ["wrong_position","Wrong Position"],
    ["needs_practice","Needs Practice"],
    ["fitness_concern","Fitness Concern"]
  ];
  const state={
    initialized:false,
    loading:false,
    ready:false,
    user:null,
    matches:[],
    players:[],
    notes:[],
    debriefs:[],
    assessments:[],
    attendance:new Set(),
    playerDrafts:new Map(),
    currentDebrief:null,
    readOnly:false
  };

  const el=id=>document.getElementById(id);
  const sb=()=>window.SKORSupabase;
  const esc=value=>String(value??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  const text=value=>String(value??"").trim();
  const displayName=player=>text(player?.preferred_name)||text(player?.full_name).split(/\s+/)[0]||"Player";
  const isMissingTable=error=>/does not exist|schema cache|could not find the table|42P01|PGRST205/i.test(String(error?.message||error?.code||""));
  const isoDate=value=>{
    if(!value)return "—";
    const d=new Date(value);
    return Number.isNaN(d.valueOf())?"—":d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
  };
  const matchLabel=match=>{
    if(!match)return "Match";
    const opponent=match.home_team==="SKOR FC"?match.away_team:match.home_team;
    return `${isoDate(match.kickoff)} · ${opponent||"Opponent TBD"}`;
  };
  const matchById=id=>state.matches.find(item=>String(item.id)===String(id));
  const playerById=id=>state.players.find(item=>String(item.id)===String(id));
  const captainName=()=>text(el("userName")?.textContent)||state.user?.email||"SKOR Captain";

  function setStatus(id,message,ok=true){
    const node=el(id);if(!node)return;
    node.textContent=message||"";
    node.className="form-status "+(message?(ok?"ok":"err"):"");
  }

  function setSetupPending(error){
    state.ready=false;
    const notice=el("notebookSetupNotice");
    if(notice)notice.hidden=false;
    ["notebookSaveEntryBtn","notebookSaveDraftBtn","notebookCompleteDebriefBtn"].forEach(id=>{const node=el(id);if(node)node.disabled=true;});
    el("notebookEntryCount").textContent="Setup";
    el("notebookDebriefCount").textContent="Setup";
    el("notebookPlayerCount").textContent="Setup";
    el("notebookLatestDate").textContent="Pending";
    if(error&&!isMissingTable(error))console.error("Captain Notebook setup error:",error);
  }

  function setReady(){
    state.ready=true;
    const notice=el("notebookSetupNotice");
    if(notice)notice.hidden=true;
    ["notebookSaveEntryBtn","notebookSaveDraftBtn","notebookCompleteDebriefBtn"].forEach(id=>{const node=el(id);if(node)node.disabled=false;});
  }

  function populateReferenceSelects(){
    const currentNoteMatch=el("notebookMatch")?.value||"";
    const currentDebriefMatch=el("notebookDebriefMatch")?.value||"";
    const matchOptions=state.matches.map(match=>`<option value="${esc(match.id)}">${esc(matchLabel(match))}</option>`).join("");
    const debriefCutoff=Date.now()-(2*60*60*1000);
    const debriefOptions=state.matches
      .filter(match=>match.status==="final"||new Date(match.kickoff).valueOf()<=debriefCutoff)
      .map(match=>`<option value="${esc(match.id)}">${esc(matchLabel(match))}</option>`).join("");
    const playerOptions=state.players.map(player=>`<option value="${esc(player.id)}">#${esc(player.jersey_number)} ${esc(displayName(player))}</option>`).join("");
    if(el("notebookMatch")){
      el("notebookMatch").innerHTML='<option value="">No specific match</option>'+matchOptions;
      if([...el("notebookMatch").options].some(option=>option.value===currentNoteMatch))el("notebookMatch").value=currentNoteMatch;
    }
    if(el("notebookDebriefMatch")){
      el("notebookDebriefMatch").innerHTML='<option value="">Select a completed or past match…</option>'+debriefOptions;
      if([...el("notebookDebriefMatch").options].some(option=>option.value===currentDebriefMatch))el("notebookDebriefMatch").value=currentDebriefMatch;
    }
    if(el("notebookPlayer"))el("notebookPlayer").innerHTML='<option value="">No specific player</option>'+playerOptions;
  }

  function updateDashboardPrompt(){
    const panel=el("notebookDashboardPrompt");if(!panel||!state.user)return;
    const cutoff=Date.now()-(2*60*60*1000);
    const pastMatches=state.matches.filter(match=>match.status==="final"||new Date(match.kickoff).valueOf()<=cutoff);
    const target=pastMatches.find(match=>!state.debriefs.some(row=>row.match_id===match.id&&row.captain_id===state.user.id&&row.status==="completed"));
    if(!target){panel.hidden=true;return;}
    const draft=state.debriefs.find(row=>row.match_id===target.id&&row.captain_id===state.user.id&&row.status==="draft");
    panel.hidden=false;
    panel.dataset.matchId=target.id;
    el("notebookDashboardPromptTitle").textContent=draft?`Continue review: ${matchLabel(target)}`:`Review ${matchLabel(target)}`;
    el("notebookDashboardPromptMeta").textContent=draft?"Your private draft is waiting. Finish it when the match is still fresh.":"Capture who performed well, tactical patterns, issues, position ideas, and the next practice focus.";
    el("notebookDashboardPromptBtn").textContent=draft?"Continue Debrief":"Start Debrief";
  }

  function updateMetrics(){
    const completed=state.debriefs.filter(item=>item.status==="completed");
    const observed=new Set(state.assessments.filter(item=>(item.tags||[]).length||text(item.observation)).map(item=>item.player_id));
    el("notebookEntryCount").textContent=String(state.notes.length);
    el("notebookDebriefCount").textContent=String(completed.length);
    el("notebookPlayerCount").textContent=String(observed.size);
    el("notebookLatestDate").textContent=state.notes.length?isoDate(state.notes[0].created_at):"No notes yet";
  }

  function noteContext(note){
    const parts=[];
    const match=matchById(note.match_id),player=playerById(note.player_id);
    if(match)parts.push(matchLabel(match));
    if(player)parts.push(`#${player.jersey_number} ${displayName(player)}`);
    parts.push(note.created_by_name||"Captain");
    parts.push(isoDate(note.created_at));
    return parts.join(" · ");
  }

  function renderNotes(){
    const host=el("notebookFeed");if(!host)return;
    const filter=el("notebookFeedFilter")?.value||"all";
    const uid=state.user?.id;
    const rows=state.notes.filter(note=>{
      if(filter==="all")return true;
      if(filter==="mine")return note.created_by===uid;
      return note.entry_type===filter;
    });
    if(!rows.length){host.innerHTML='<div class="notebook-empty">No notebook entries match this filter.</div>';return;}
    host.innerHTML=rows.map(note=>{
      const mine=note.created_by===uid;
      return `<article class="notebook-note ${note.visibility==="private"?"private":""}">
        <div class="notebook-note-head">
          <div class="notebook-note-title">
            <strong>${esc(note.title)}</strong>
            <div class="notebook-note-meta">
              <span class="notebook-note-tag">${esc(String(note.entry_type||"general").replace(/_/g," "))}</span>
              <span class="notebook-note-tag">${esc(String(note.category||"observation").replace(/_/g," "))}</span>
              <span class="notebook-note-tag ${note.visibility==="private"?"private":""}">${note.visibility==="private"?"Only Me":"Captains"}</span>
            </div>
          </div>
          ${mine?`<button class="notebook-note-delete" type="button" data-notebook-delete="${esc(note.id)}" title="Delete this note">Delete</button>`:""}
        </div>
        <div class="notebook-note-body">${esc(note.body)}</div>
        <div class="notebook-note-context">${esc(noteContext(note))}</div>
      </article>`;
    }).join("");
    host.querySelectorAll("[data-notebook-delete]").forEach(button=>button.addEventListener("click",()=>deleteNote(button.dataset.notebookDelete)));
  }

  function debriefSummary(row){
    return text(row.practice_focus)||text(row.position_changes)||text(row.tactical_observations)||text(row.team_performance)||"No summary added.";
  }

  function renderHistory(){
    const host=el("notebookDebriefHistory");if(!host)return;
    if(!state.debriefs.length){host.innerHTML='<div class="notebook-empty">No post-game debriefs have been started yet.</div>';return;}
    host.innerHTML=state.debriefs.map(row=>{
      const match=matchById(row.match_id);
      const mine=row.captain_id===state.user?.id;
      return `<article class="notebook-history-item">
        <div>
          <strong>${esc(matchLabel(match))}</strong>
          <div class="notebook-history-meta">${esc(row.captain_name||"Captain")} · ${row.status==="completed"?"Completed":"Private draft"} · Updated ${esc(isoDate(row.updated_at))}</div>
          <div class="notebook-history-summary">${esc(debriefSummary(row))}</div>
        </div>
        <button class="btn btn-light notebook-history-open" type="button" data-debrief-open="${esc(row.id)}">${mine?"Open Review":"View Review"}</button>
      </article>`;
    }).join("");
    host.querySelectorAll("[data-debrief-open]").forEach(button=>button.addEventListener("click",()=>openDebriefById(button.dataset.debriefOpen)));
  }

  async function refreshData({quiet=false}={}){
    if(state.loading)return;
    state.loading=true;
    if(!quiet)setStatus("notebookEntryStatus","Loading notebook…",true);
    try{
      const client=sb();
      const userResult=await client.auth.getUser();
      if(userResult.error||!userResult.data?.user)throw new Error(userResult.error?.message||"Captain session not found.");
      state.user=userResult.data.user;
      const [matchesResult,playersResult,notesResult,debriefsResult,assessmentsResult]=await Promise.all([
        client.from("matches").select("id,kickoff,home_team,away_team,status,published").order("kickoff",{ascending:false}).limit(40),
        client.from("team_roster").select("id,full_name,preferred_name,jersey_number,position,active").eq("active",true).order("jersey_number",{ascending:true}),
        client.from(NOTE_TABLE).select("id,entry_type,category,title,body,match_id,player_id,visibility,created_by,created_by_name,created_at,updated_at").order("created_at",{ascending:false}).limit(100),
        client.from(DEBRIEF_TABLE).select("id,match_id,captain_id,captain_name,status,team_performance,standouts,tactical_observations,issues,position_changes,practice_focus,additional_notes,completed_at,created_at,updated_at").order("updated_at",{ascending:false}).limit(80),
        client.from(ASSESSMENT_TABLE).select("id,debrief_id,match_id,player_id,tags,observation,created_at,updated_at").limit(500)
      ]);
      const setupError=[notesResult,debriefsResult,assessmentsResult].find(result=>result.error)?.error;
      if(setupError){setSetupPending(setupError);return;}
      if(matchesResult.error)throw matchesResult.error;
      if(playersResult.error)throw playersResult.error;
      state.matches=matchesResult.data||[];
      state.players=playersResult.data||[];
      state.notes=notesResult.data||[];
      state.debriefs=debriefsResult.data||[];
      state.assessments=assessmentsResult.data||[];
      populateReferenceSelects();
      updateMetrics();
      renderNotes();
      renderHistory();
      updateDashboardPrompt();
      setReady();
      if(!quiet)setStatus("notebookEntryStatus","Notebook refreshed.",true);
    }catch(error){
      console.error("Could not load Captain Notebook:",error);
      setStatus("notebookEntryStatus","Could not load notebook: "+(error.message||error),false);
    }finally{state.loading=false;}
  }

  async function saveNote(event){
    event.preventDefault();
    if(!state.ready)return setStatus("notebookEntryStatus","Notebook database setup is still pending.",false);
    if(!window.SKORPortalCanWrite?.())return window.SKORViewerBlocked?.("save captain notes");
    const title=text(el("notebookTitle")?.value),body=text(el("notebookBody")?.value);
    if(!title||!body)return setStatus("notebookEntryStatus","Add a title and captain note.",false);
    const button=el("notebookSaveEntryBtn");button.disabled=true;button.textContent="Saving…";
    try{
      const payload={
        entry_type:el("notebookEntryType").value,
        category:el("notebookCategory").value,
        title,body,
        match_id:el("notebookMatch").value||null,
        player_id:el("notebookPlayer").value||null,
        visibility:el("notebookVisibility").value,
        created_by:state.user.id,
        created_by_name:captainName()
      };
      const result=await sb().from(NOTE_TABLE).insert(payload);
      if(result.error)throw result.error;
      el("notebookEntryForm").reset();
      setStatus("notebookEntryStatus",payload.visibility==="private"?"Private note saved.":"Note saved for the captains.",true);
      await refreshData({quiet:true});
    }catch(error){setStatus("notebookEntryStatus","Could not save note: "+(error.message||error),false);}
    finally{button.disabled=false;button.textContent="Save Note";}
  }

  async function deleteNote(id){
    const note=state.notes.find(item=>item.id===id);if(!note)return;
    if(!confirm(`Delete “${note.title}”? This cannot be undone.`))return;
    const result=await sb().from(NOTE_TABLE).delete().eq("id",id).eq("created_by",state.user.id);
    if(result.error)return setStatus("notebookEntryStatus","Could not delete note: "+result.error.message,false);
    setStatus("notebookEntryStatus","Note deleted.",true);
    await refreshData({quiet:true});
  }

  function collectDebriefPayload(status){
    return {
      match_id:el("notebookDebriefMatch").value,
      captain_id:state.user.id,
      captain_name:captainName(),
      status,
      team_performance:text(el("debriefTeamPerformance").value)||null,
      standouts:text(el("debriefStandouts").value)||null,
      tactical_observations:text(el("debriefObservations").value)||null,
      issues:text(el("debriefIssues").value)||null,
      position_changes:text(el("debriefPositionChanges").value)||null,
      practice_focus:text(el("debriefPracticeFocus").value)||null,
      additional_notes:text(el("debriefAdditionalNotes").value)||null,
      completed_at:status==="completed"?new Date().toISOString():null,
      updated_at:new Date().toISOString()
    };
  }

  function debriefHasContent(payload){
    return ["team_performance","standouts","tactical_observations","issues","position_changes","practice_focus","additional_notes"].some(key=>text(payload[key]))||
      [...state.playerDrafts.values()].some(item=>item.tags.size||text(item.observation));
  }

  async function saveDebrief(requestedStatus){
    if(!state.ready)return setStatus("notebookDebriefStatus","Notebook database setup is still pending.",false);
    if(state.readOnly)return;
    const matchId=el("notebookDebriefMatch").value;
    if(!matchId)return setStatus("notebookDebriefStatus","Choose a match first.",false);
    const status=state.currentDebrief?.status==="completed"?"completed":requestedStatus;
    const payload=collectDebriefPayload(status);
    if(status==="completed"&&!debriefHasContent(payload))return setStatus("notebookDebriefStatus","Add at least one team or player observation before completing the debrief.",false);
    const draftButton=el("notebookSaveDraftBtn"),completeButton=el("notebookCompleteDebriefBtn");
    draftButton.disabled=true;completeButton.disabled=true;
    const activeButton=requestedStatus==="completed"?completeButton:draftButton,oldText=activeButton.textContent;
    activeButton.textContent="Saving…";
    try{
      const result=await sb().from(DEBRIEF_TABLE).upsert(payload,{onConflict:"match_id,captain_id"}).select().single();
      if(result.error)throw result.error;
      const debrief=result.data;
      const assessmentRows=state.players.map(player=>{
        const item=state.playerDrafts.get(String(player.id))||{tags:new Set(),observation:""};
        return {
          debrief_id:debrief.id,
          match_id:matchId,
          player_id:player.id,
          tags:[...item.tags],
          observation:text(item.observation)||null,
          updated_at:new Date().toISOString()
        };
      });
      if(assessmentRows.length){
        const assessmentResult=await sb().from(ASSESSMENT_TABLE).upsert(assessmentRows,{onConflict:"debrief_id,player_id"});
        if(assessmentResult.error)throw assessmentResult.error;
      }
      state.currentDebrief=debrief;
      setStatus("notebookDebriefStatus",status==="completed"?"Debrief completed and shared with the captains.":"Private draft saved.",true);
      await refreshData({quiet:true});
      await openDebriefById(debrief.id,{scroll:false});
    }catch(error){setStatus("notebookDebriefStatus","Could not save debrief: "+(error.message||error),false);}
    finally{
      draftButton.disabled=false;completeButton.disabled=false;
      activeButton.textContent=oldText;
    }
  }

  function readPlayerDraftInputs(){
    el("notebookPlayerGrid")?.querySelectorAll("[data-player-note]").forEach(input=>{
      const id=String(input.dataset.playerNote);
      const item=state.playerDrafts.get(id)||{tags:new Set(),observation:""};
      item.observation=input.value;
      state.playerDrafts.set(id,item);
    });
  }

  function renderPlayerCards(){
    readPlayerDraftInputs();
    const host=el("notebookPlayerGrid");if(!host)return;
    const query=text(el("notebookPlayerSearch")?.value).toLowerCase();
    const rows=[...state.players].sort((a,b)=>{
      const ap=state.attendance.has(String(a.id))?0:1,bp=state.attendance.has(String(b.id))?0:1;
      return ap-bp||Number(a.jersey_number)-Number(b.jersey_number);
    }).filter(player=>!query||`${displayName(player)} ${player.full_name||""} ${player.jersey_number}`.toLowerCase().includes(query));
    if(!rows.length){host.innerHTML='<div class="notebook-empty">No players match this search.</div>';return;}
    host.innerHTML=rows.map(player=>{
      const id=String(player.id),item=state.playerDrafts.get(id)||{tags:new Set(),observation:""};
      const present=state.attendance.has(id);
      return `<article class="notebook-player-card ${present?"present":""}">
        <div class="notebook-player-card-head">
          <div class="notebook-player-identity"><span class="notebook-player-number">#${esc(player.jersey_number)}</span><div><strong>${esc(displayName(player))}</strong><small>${esc(player.position||"Player")}</small></div></div>
          ${present?'<span class="notebook-present-badge">Present</span>':""}
        </div>
        <div class="notebook-player-tags">${PLAYER_TAGS.map(([value,label])=>`<button class="notebook-player-tag ${item.tags.has(value)?"active":""}" type="button" data-player-tag="${esc(value)}" data-player-id="${esc(id)}" ${state.readOnly?"disabled":""}>${esc(label)}</button>`).join("")}</div>
        <textarea class="notebook-player-note" data-player-note="${esc(id)}" maxlength="2000" placeholder="Specific observation (optional)" ${state.readOnly?"readonly":""}>${esc(item.observation)}</textarea>
      </article>`;
    }).join("");
    host.querySelectorAll("[data-player-tag]").forEach(button=>button.addEventListener("click",()=>{
      if(state.readOnly)return;
      readPlayerDraftInputs();
      const id=String(button.dataset.playerId),item=state.playerDrafts.get(id)||{tags:new Set(),observation:""};
      item.tags.has(button.dataset.playerTag)?item.tags.delete(button.dataset.playerTag):item.tags.add(button.dataset.playerTag);
      state.playerDrafts.set(id,item);
      button.classList.toggle("active",item.tags.has(button.dataset.playerTag));
    }));
    host.querySelectorAll("[data-player-note]").forEach(input=>input.addEventListener("input",()=>{
      const id=String(input.dataset.playerNote),item=state.playerDrafts.get(id)||{tags:new Set(),observation:""};
      item.observation=input.value;state.playerDrafts.set(id,item);
    }));
  }

  function setDebriefReadOnly(readOnly){
    state.readOnly=readOnly;
    ["debriefTeamPerformance","debriefStandouts","debriefObservations","debriefIssues","debriefPositionChanges","debriefPracticeFocus","debriefAdditionalNotes"].forEach(id=>{const node=el(id);if(node)node.readOnly=readOnly;});
    el("notebookSaveDraftBtn").hidden=readOnly||state.currentDebrief?.status==="completed";
    el("notebookCompleteDebriefBtn").hidden=readOnly;
    if(!readOnly)el("notebookCompleteDebriefBtn").textContent=state.currentDebrief?.status==="completed"?"Update Completed Debrief":"Complete & Share with Captains";
  }

  function fillDebrief(row){
    el("notebookDebriefId").value=row?.id||"";
    el("debriefTeamPerformance").value=row?.team_performance||"";
    el("debriefStandouts").value=row?.standouts||"";
    el("debriefObservations").value=row?.tactical_observations||"";
    el("debriefIssues").value=row?.issues||"";
    el("debriefPositionChanges").value=row?.position_changes||"";
    el("debriefPracticeFocus").value=row?.practice_focus||"";
    el("debriefAdditionalNotes").value=row?.additional_notes||"";
    const banner=el("notebookDraftBanner");
    if(row?.status==="completed"){
      banner.textContent=`Completed by ${row.captain_name||"Captain"}`;banner.classList.add("complete");
    }else{
      banner.textContent=row?"Private draft":"New private draft";banner.classList.remove("complete");
    }
  }

  async function loadDebrief(matchId,{debriefId=null,scroll=true}={}){
    if(!matchId)return;
    setStatus("notebookDebriefStatus","Loading review…",true);
    el("notebookDebriefEmpty").hidden=true;
    el("notebookDebriefForm").hidden=false;
    state.attendance=new Set();state.playerDrafts=new Map();state.currentDebrief=null;state.readOnly=false;
    try{
      let row=null;
      if(debriefId){
        const result=await sb().from(DEBRIEF_TABLE).select("*").eq("id",debriefId).maybeSingle();
        if(result.error)throw result.error;row=result.data||null;
      }else{
        const result=await sb().from(DEBRIEF_TABLE).select("*").eq("match_id",matchId).eq("captain_id",state.user.id).maybeSingle();
        if(result.error)throw result.error;row=result.data||null;
      }
      state.currentDebrief=row;
      const [attendanceResult,assessmentResult]=await Promise.all([
        sb().from("player_match_attendance").select("player_id,status").eq("match_id",matchId).eq("status","present"),
        row?sb().from(ASSESSMENT_TABLE).select("player_id,tags,observation").eq("debrief_id",row.id):Promise.resolve({data:[],error:null})
      ]);
      if(attendanceResult.error)console.warn("Could not prefill Notebook attendance:",attendanceResult.error);
      else state.attendance=new Set((attendanceResult.data||[]).map(item=>String(item.player_id)));
      if(assessmentResult.error)throw assessmentResult.error;
      (assessmentResult.data||[]).forEach(item=>state.playerDrafts.set(String(item.player_id),{tags:new Set(item.tags||[]),observation:item.observation||""}));
      fillDebrief(row);
      setDebriefReadOnly(!!row&&row.captain_id!==state.user.id);
      renderPlayerCards();
      setStatus("notebookDebriefStatus",state.readOnly?"Viewing another captain’s completed review.":row?.status==="completed"?"Completed review loaded. You can update your observations.":row?"Private draft loaded.":"New private draft ready.",true);
      if(scroll)el("notebookDebriefPanel")?.scrollIntoView({behavior:"smooth",block:"start"});
    }catch(error){
      setStatus("notebookDebriefStatus","Could not load debrief: "+(error.message||error),false);
    }
  }

  async function openDebriefById(id,{scroll=true}={}){
    const row=state.debriefs.find(item=>item.id===id);
    if(!row)return;
    el("notebookDebriefMatch").value=row.match_id;
    await loadDebrief(row.match_id,{debriefId:id,scroll});
  }

  function bindEvents(){
    el("notebookEntryForm")?.addEventListener("submit",saveNote);
    el("notebookFeedFilter")?.addEventListener("change",renderNotes);
    el("notebookRefreshBtn")?.addEventListener("click",()=>refreshData());
    el("notebookJumpDebriefBtn")?.addEventListener("click",()=>el("notebookDebriefPanel")?.scrollIntoView({behavior:"smooth",block:"start"}));
    el("notebookDashboardPromptBtn")?.addEventListener("click",()=>{
      const matchId=el("notebookDashboardPrompt")?.dataset.matchId;
      if(!matchId)return;
      window.openView?.("notebook");
      el("notebookDebriefMatch").value=matchId;
      loadDebrief(matchId);
    });
    el("notebookDebriefMatch")?.addEventListener("change",event=>{
      const matchId=event.target.value;
      if(!matchId){el("notebookDebriefForm").hidden=true;el("notebookDebriefEmpty").hidden=false;return;}
      loadDebrief(matchId);
    });
    el("notebookPlayerSearch")?.addEventListener("input",renderPlayerCards);
    el("notebookSaveDraftBtn")?.addEventListener("click",()=>saveDebrief("draft"));
    el("notebookCompleteDebriefBtn")?.addEventListener("click",()=>saveDebrief("completed"));
  }

  async function init(){
    if(state.initialized)return;
    state.initialized=true;
    bindEvents();
    await refreshData({quiet:true});
  }

  async function activate(){
    if(!window.SKORPortalCanWrite?.())return;
    if(!state.initialized)await init();
    else if(!state.loading)await refreshData({quiet:true});
  }

  window.SKORNotebook={init,activate,refresh:refreshData};
  window.addEventListener("skor:portal-ready",()=>{if(window.SKORPortalCanWrite?.())init();});
  window.setTimeout(()=>{
    const app=el("adminApp");
    if(app?.style.display==="grid"&&window.SKORPortalCanWrite?.())init();
  },0);
})();
