/* SKOR FC Captain Notebook v52.9
   Kept in a separate file so the existing lineup, Game Day, and portal engines remain isolated. */
(function(){
  "use strict";

  const NOTE_TABLE="captain_notebook_entries";
  const DEBRIEF_TABLE="captain_match_debriefs";
  const ASSESSMENT_TABLE="captain_player_assessments";
  const ALIAS_TABLE="captain_player_name_aliases";
  const ATTACHMENT_TABLE="captain_notebook_attachments";
  const STRATEGY_TABLE="match_strategies";
  const MEDIA_BUCKET="captain-notebook-media";
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
    captains:[],
    notes:[],
    attachments:[],
    attachmentUrls:new Map(),
    debriefs:[],
    assessments:[],
    strategies:[],
    attendance:new Set(),
    debriefLineup:null,
    debriefStrategy:null,
    playerDrafts:new Map(),
    currentDebrief:null,
    readOnly:false,
    pregameBrief:null,
    pregameGenerating:false,
    importMode:false,
    whatsappDrafts:[],
    whatsappImporting:false,
    aliasChecking:false,
    aliasReviewResolve:null,
    aliasMentions:[],
    checkedNameTexts:new Set()
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
  const isoDateTime=value=>{
    if(!value)return "—";
    const d=new Date(value);
    return Number.isNaN(d.valueOf())?"—":d.toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"});
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
    ["notebookSaveEntryBtn","notebookImportSelectedWhatsAppBtn","notebookSaveDraftBtn","notebookCompleteDebriefBtn","notebookGeneratePregameBtn","notebookSavePregameBtn"].forEach(id=>{const node=el(id);if(node)node.disabled=true;});
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
    ["notebookSaveEntryBtn","notebookImportSelectedWhatsAppBtn","notebookSaveDraftBtn","notebookCompleteDebriefBtn","notebookGeneratePregameBtn","notebookSavePregameBtn"].forEach(id=>{const node=el(id);if(node)node.disabled=false;});
  }

  function aliasPlayerOptions(selectedId="",mention=null){
    const candidateIds=new Set((mention?.candidate_player_ids||[]).map(String));
    const players=candidateIds.size?state.players.filter(player=>candidateIds.has(String(player.id))):state.players;
    const options=[...players]
      .sort((a,b)=>Number(a.jersey_number)-Number(b.jersey_number))
      .map(player=>`<option value="${esc(player.id)}" ${String(player.id)===String(selectedId)?"selected":""}>#${esc(player.jersey_number)} ${esc(displayName(player))}</option>`)
      .join("");
    return '<option value="">Choose a player…</option>'+options+(mention?.ambiguity?'':'<option value="__not_player__">Not a player · do not ask again</option>');
  }

  function settleAliasReview(result){
    if(state.aliasChecking&&!result)return;
    const dialog=el("notebookAliasDialog"),resolve=state.aliasReviewResolve;
    state.aliasReviewResolve=null;
    state.aliasMentions=[];
    if(dialog?.open)dialog.close();
    if(resolve)resolve(result);
  }

  function openAliasReview(mentions){
    const dialog=el("notebookAliasDialog"),list=el("notebookAliasList");
    if(!dialog||!list)return Promise.resolve(false);
    state.aliasMentions=mentions;
    list.innerHTML=mentions.map((item,index)=>`<div class="notebook-alias-row" data-alias-row="${index}">
      <div class="notebook-alias-mention"><strong>“${esc(item.mention)}”</strong><small>${esc(item.reason||"Possible player nickname or alternate name.")}</small></div>
      <select data-alias-choice="${index}" aria-label="Match ${esc(item.mention)} to a player">${aliasPlayerOptions(item.suggested_player_id,item)}</select>
    </div>`).join("");
    const hasAmbiguity=mentions.some(item=>item.ambiguity);
    if(el("notebookAliasTitle"))el("notebookAliasTitle").textContent=hasAmbiguity?"Clarify player names":"Match unfamiliar player names";
    if(el("notebookAliasIntro"))el("notebookAliasIntro").textContent=hasAmbiguity?"More than one active player uses the same first name. Choose the jersey number so the saved note and future AI suggestions refer to the right player.":"AI noticed names that do not yet match the roster or a remembered nickname. Confirm each one so future captain notes use the same player identity.";
    if(el("notebookAliasConfirmBtn"))el("notebookAliasConfirmBtn").textContent=hasAmbiguity?"Clarify & Continue":"Remember & Continue";
    setStatus("notebookAliasStatus",hasAmbiguity?"Choose the jersey number for every ambiguous name. The saved note will be clarified.":"Choose a roster player or mark the term as not a player.",true);
    return new Promise(resolve=>{
      state.aliasReviewResolve=resolve;
      dialog.showModal();
    });
  }

  async function confirmAliasReview(){
    if(state.aliasChecking||!state.aliasReviewResolve)return;
    const choices=[...el("notebookAliasList").querySelectorAll("[data-alias-choice]")];
    if(choices.some(select=>!select.value))return setStatus("notebookAliasStatus",state.aliasMentions.some(item=>item.ambiguity)?"Choose the correct jersey number for every ambiguous name.":"Match every name or choose “Not a player.”",false);
    const records=[],replacements=[];
    choices.forEach(select=>{
      const item=state.aliasMentions[Number(select.dataset.aliasChoice)]||{};
      const mention=item.mention||"";
      const notPlayer=select.value==="__not_player__";
      if(item.ambiguity){
        const player=playerById(select.value);
        if(player)replacements.push({mention,replacement:`#${player.jersey_number} ${displayName(player)}`,candidate_jerseys:(item.candidate_jersey_numbers||[]).map(String)});
        return;
      }
      records.push({
        alias:mention,
        player_id:notPlayer?null:select.value,
        resolution:notPlayer?"not_player":"player",
        confirmed_by:state.user.id,
        updated_at:new Date().toISOString()
      });
    });
    const button=el("notebookAliasConfirmBtn"),original=button.textContent;
    state.aliasChecking=true;button.disabled=true;button.textContent=records.length?"Remembering…":"Clarifying…";
    try{
      if(records.length){
        const result=await sb().from(ALIAS_TABLE).upsert(records,{onConflict:"normalized_alias"});
        if(result.error)throw result.error;
      }
      settleAliasReview({accepted:true,replacements});
    }catch(error){
      setStatus("notebookAliasStatus","Could not remember player names: "+(error.message||error),false);
    }finally{
      state.aliasChecking=false;button.disabled=false;button.textContent=original;
    }
  }

  function applyPlayerNameReplacements(value,replacements){
    let result=String(value??"");
    (replacements||[]).forEach(item=>{
      const mention=text(item.mention),replacement=text(item.replacement);if(!mention||!replacement)return;
      const escaped=mention.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
      const jerseys=(item.candidate_jerseys||[]).map(value=>String(value).replace(/\D/g,"")).filter(Boolean);
      const jerseyPattern=jerseys.length?jerseys.join("|"):"\\d+";
      const pattern=new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped})(?![\\p{L}\\p{N}_])`,"giu");
      result=result.replace(pattern,(whole,prefix,found,offset,source)=>{
        const nameStart=Number(offset)+String(prefix).length;
        const before=source.slice(Math.max(0,nameStart-10),nameStart);
        const after=source.slice(nameStart+String(found).length,nameStart+String(found).length+10);
        const alreadyNumbered=new RegExp(`(?:#\\s*)?(?:${jerseyPattern})\\s*$`,"i").test(before)||new RegExp(`^\\s*(?:#\\s*)?(?:${jerseyPattern})(?!\\d)`,"i").test(after);
        return alreadyNumbered?whole:`${prefix}${replacement}`;
      });
    });
    return result;
  }

  async function checkPlayerNames(value,statusId){
    const content=text(value);
    if(!content||state.checkedNameTexts.has(content))return {ok:true,replacements:[]};
    setStatus(statusId,"Checking player names and remembered nicknames…",true);
    try{
      const {data,error}=await sb().functions.invoke("check-player-names",{body:{text:content}});
      if(error){
        let detail=error.message||"The player name check could not be reached.";
        try{const body=await error.context?.json?.();if(body?.error)detail=body.error;}catch{}
        throw new Error(detail);
      }
      const mentions=Array.isArray(data?.mentions)?data.mentions.slice(0,8):[];
      if(!mentions.length){state.checkedNameTexts.add(content);return {ok:true,replacements:[]};}
      const review=await openAliasReview(mentions);
      if(review?.accepted)state.checkedNameTexts.add(content);
      return {ok:!!review?.accepted,replacements:review?.replacements||[]};
    }catch(error){
      console.error("Player name check failed:",error);
      setStatus(statusId,"Player name check unavailable: "+(error.message||error),false);
      return {ok:window.confirm("The player name check is unavailable. Save without checking names?"),replacements:[]};
    }
  }

  function populateReferenceSelects(){
    const currentNoteMatch=el("notebookMatch")?.value||"";
    const currentDebriefMatch=el("notebookDebriefMatch")?.value||"";
    const currentPregameMatch=el("notebookPregameMatch")?.value||"";
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
    if(el("notebookPregameMatch")){
      const upcoming=state.matches
        .filter(match=>match.status!=="final"&&new Date(match.kickoff).valueOf()>=Date.now()-(6*60*60*1000))
        .sort((a,b)=>new Date(a.kickoff)-new Date(b.kickoff));
      el("notebookPregameMatch").innerHTML='<option value="">Select an upcoming match…</option>'+upcoming.map(match=>`<option value="${esc(match.id)}">${esc(matchLabel(match))}</option>`).join("");
      if([...el("notebookPregameMatch").options].some(option=>option.value===currentPregameMatch))el("notebookPregameMatch").value=currentPregameMatch;
      else if(upcoming[0])el("notebookPregameMatch").value=upcoming[0].id;
    }
    if(el("notebookPlayer"))el("notebookPlayer").innerHTML='<option value="">No specific player</option>'+playerOptions;
    populateCaptainSelect();
  }

  function populateCaptainSelect(){
    const names=[...new Set(state.captains.map(row=>text(row.display_name)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const list=el("notebookCaptainNameOptions");
    if(list)list.innerHTML=names.map(name=>`<option value="${esc(name)}"></option>`).join("");
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
    if(note.source==="whatsapp"){
      parts.push(`From ${note.attributed_captain_name||"Captain"}`);
      parts.push(`WhatsApp ${isoDateTime(note.source_occurred_at)}`);
      parts.push(`Imported by ${note.created_by_name||"Captain"} ${isoDate(note.created_at)}`);
    }else{
      parts.push(note.created_by_name||"Captain");
      parts.push(isoDate(note.created_at));
    }
    return parts.join(" · ");
  }

  const noteAttachments=noteId=>state.attachments.filter(item=>String(item.notebook_entry_id)===String(noteId));

  function renderAttachmentImages(noteId){
    const rows=noteAttachments(noteId);
    if(!rows.length)return "";
    return `<div class="notebook-whatsapp-image-list">${rows.map(item=>{
      const url=state.attachmentUrls.get(String(item.id));
      if(!url)return `<span class="notebook-whatsapp-image"><span>Historical lineup image unavailable</span></span>`;
      return `<a class="notebook-whatsapp-image" href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="Historical lineup image"><span>${esc(item.original_file_name||"Historical lineup")}</span></a>`;
    }).join("")}</div>`;
  }

  function renderRegularNote(note,uid){
    const mine=note.created_by===uid;
    return `<article class="notebook-note ${note.visibility==="private"?"private":""}">
      <div class="notebook-note-head">
        <div class="notebook-note-title">
          <strong>${esc(note.title)}</strong>
          <div class="notebook-note-meta">
            <span class="notebook-note-tag">${esc(String(note.entry_type||"general").replace(/_/g," "))}</span>
            <span class="notebook-note-tag">${esc(String(note.category||"observation").replace(/_/g," "))}</span>
            ${note.ai_organized?'<span class="notebook-note-tag ai-organized">AI organized</span>':""}
            <span class="notebook-note-tag ${note.visibility==="private"?"private":""}">${note.visibility==="private"?"Only Me":"Captains"}</span>
          </div>
        </div>
        ${mine?`<button class="notebook-note-delete" type="button" data-notebook-delete="${esc(note.id)}" title="Delete this note">Delete</button>`:""}
      </div>
      <div class="notebook-note-body">${esc(note.body)}</div>
      <div class="notebook-note-context">${esc(noteContext(note))}</div>
    </article>`;
  }

  function renderWhatsAppGroups(rows,uid){
    const byGame=new Map();
    rows.forEach(note=>{
      const gameKey=String(note.match_id||"unassigned");
      if(!byGame.has(gameKey))byGame.set(gameKey,[]);
      byGame.get(gameKey).push(note);
    });
    const groups=[...byGame.entries()].sort(([,a],[,b])=>{
      const aTime=new Date(matchById(a[0]?.match_id)?.kickoff||a[0]?.source_occurred_at||0).valueOf();
      const bTime=new Date(matchById(b[0]?.match_id)?.kickoff||b[0]?.source_occurred_at||0).valueOf();
      return bTime-aTime;
    });
    return groups.map(([gameKey,gameRows],groupIndex)=>{
      const threads=new Map();
      gameRows.forEach(note=>{
        const threadKey=String(note.source_batch_id||`legacy:${note.id}`);
        if(!threads.has(threadKey))threads.set(threadKey,[]);
        threads.get(threadKey).push(note);
      });
      const orderedThreads=[...threads.values()].map(thread=>thread.sort((a,b)=>
        Number(a.source_sequence??0)-Number(b.source_sequence??0)||new Date(a.source_occurred_at)-new Date(b.source_occurred_at)
      )).sort((a,b)=>new Date(a[0]?.source_occurred_at)-new Date(b[0]?.source_occurred_at));
      const match=gameKey==="unassigned"?null:matchById(gameKey);
      return `<details class="notebook-whatsapp-game-group" ${groupIndex===0?"open":""}>
        <summary><div class="notebook-whatsapp-game-heading"><strong>${esc(match?matchLabel(match):"Unassigned WhatsApp messages")}</strong><span>${gameRows.length} message${gameRows.length===1?"":"s"} · ${orderedThreads.length} conversation${orderedThreads.length===1?"":"s"}</span></div></summary>
        <div class="notebook-whatsapp-threads">${orderedThreads.map(thread=>{
          const first=thread[0],last=thread[thread.length-1];
          const range=thread.length>1?`${isoDateTime(first.source_occurred_at)} – ${isoDateTime(last.source_occurred_at)}`:isoDateTime(first.source_occurred_at);
          return `<article class="notebook-whatsapp-thread">
            <div class="notebook-whatsapp-thread-head"><span>WhatsApp conversation · ${thread.length} message${thread.length===1?"":"s"}</span><span>${esc(range)}</span></div>
            <div class="notebook-whatsapp-thread-messages">${thread.map(note=>`<div class="notebook-whatsapp-message ${note.visibility==="private"?"private":""}">
              <div class="notebook-whatsapp-message-head"><span class="notebook-whatsapp-message-author">${esc(note.attributed_captain_name||"Captain")}</span><span class="notebook-whatsapp-message-date">${esc(isoDateTime(note.source_occurred_at))}</span></div>
              <div class="notebook-whatsapp-message-body">${esc(note.body)}</div>
              ${renderAttachmentImages(note.id)}
              <div class="notebook-whatsapp-message-meta"><span class="notebook-note-tag whatsapp">WhatsApp</span><span class="notebook-note-tag ${note.visibility==="private"?"private":""}">${note.visibility==="private"?"Only Me":"Captains"}</span><span class="notebook-whatsapp-message-date">Imported by ${esc(note.created_by_name||"Captain")}</span>${note.created_by===uid?`<button class="notebook-note-delete" type="button" data-notebook-delete="${esc(note.id)}">Delete</button>`:""}</div>
            </div>`).join("")}</div>
          </article>`;
        }).join("")}</div>
      </details>`;
    }).join("");
  }

  function renderNotes(){
    const host=el("notebookFeed");if(!host)return;
    const filter=el("notebookFeedFilter")?.value||"all";
    const uid=state.user?.id;
    const rows=state.notes.filter(note=>{
      if(filter==="all")return true;
      if(filter==="mine")return note.created_by===uid;
      if(filter==="whatsapp")return note.source==="whatsapp";
      return note.entry_type===filter;
    });
    if(!rows.length){host.innerHTML='<div class="notebook-empty">No notebook entries match this filter.</div>';return;}
    const regular=rows.filter(note=>note.source!=="whatsapp"),whatsapp=rows.filter(note=>note.source==="whatsapp");
    const sections=[];
    if(regular.length)sections.push(`${whatsapp.length?'<div class="notebook-notes-section-title"><span>Captain Notes</span><span>'+regular.length+'</span></div>':""}${regular.map(note=>renderRegularNote(note,uid)).join("")}`);
    if(whatsapp.length)sections.push(`<div class="notebook-notes-section-title"><span>WhatsApp Conversations</span><span>${whatsapp.length}</span></div>${renderWhatsAppGroups(whatsapp,uid)}`);
    host.innerHTML=sections.join("");
    host.querySelectorAll("[data-notebook-delete]").forEach(button=>button.addEventListener("click",()=>deleteNote(button.dataset.notebookDelete)));
  }

  function debriefSummary(row){
    return text(row.practice_focus)||text(row.strategy_execution)||text(row.lineup_execution)||text(row.position_changes)||text(row.tactical_observations)||text(row.team_performance)||"No summary added.";
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

  async function loadAttachmentUrls(){
    state.attachmentUrls=new Map();
    await Promise.all(state.attachments.map(async item=>{
      const result=await sb().storage.from(MEDIA_BUCKET).createSignedUrl(item.storage_path,3600);
      if(result.error){console.warn("Could not sign Notebook image:",result.error);return;}
      if(result.data?.signedUrl)state.attachmentUrls.set(String(item.id),result.data.signedUrl);
    }));
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
      const [matchesResult,playersResult,captainsResult,notesResult,attachmentsResult,debriefsResult,assessmentsResult,strategiesResult]=await Promise.all([
        client.from("matches").select("id,kickoff,home_team,away_team,status,published").order("kickoff",{ascending:false}).limit(40),
        client.from("team_roster").select("id,full_name,preferred_name,jersey_number,position,active").eq("active",true).order("jersey_number",{ascending:true}),
        client.rpc("get_notebook_captain_directory"),
        client.from(NOTE_TABLE).select("id,entry_type,category,title,body,match_id,player_id,visibility,created_by,created_by_name,source,attributed_captain_name,source_occurred_at,source_batch_id,source_sequence,ai_organized,created_at,updated_at").order("created_at",{ascending:false}).limit(250),
        client.from(ATTACHMENT_TABLE).select("id,notebook_entry_id,storage_path,attachment_type,original_file_name,mime_type,file_size_bytes,created_by,created_at").order("created_at",{ascending:true}).limit(500),
        client.from(DEBRIEF_TABLE).select("id,match_id,captain_id,captain_name,status,team_performance,improvements_since_last_game,lineup_execution,strategy_execution,opponent_adjustments,standouts,tactical_observations,issues,position_changes,practice_focus,additional_notes,completed_at,created_at,updated_at").order("updated_at",{ascending:false}).limit(80),
        client.from(ASSESSMENT_TABLE).select("id,debrief_id,match_id,player_id,tags,observation,created_at,updated_at").limit(500),
        client.from(STRATEGY_TABLE).select("id,match_id,lineup_name,title,status,ai_context_enabled,opponent_formation,show_lanes,lineup_snapshot,scenes,updated_at,published_at").eq("status","published").eq("ai_context_enabled",true).order("updated_at",{ascending:false}).limit(80)
      ]);
      const setupError=[captainsResult,notesResult,attachmentsResult,debriefsResult,assessmentsResult,strategiesResult].find(result=>result.error)?.error;
      if(setupError){setSetupPending(setupError);return;}
      if(matchesResult.error)throw matchesResult.error;
      if(playersResult.error)throw playersResult.error;
      state.matches=matchesResult.data||[];
      state.players=playersResult.data||[];
      state.captains=captainsResult.data||[];
      state.notes=notesResult.data||[];
      state.attachments=attachmentsResult.data||[];
      state.debriefs=debriefsResult.data||[];
      state.assessments=assessmentsResult.data||[];
      state.strategies=strategiesResult.data||[];
      await loadAttachmentUrls();
      populateReferenceSelects();
      updateMetrics();
      renderNotes();
      renderHistory();
      updateDashboardPrompt();
      await window.SKORLoadAiPlayerComments?.({force:true});
      renderSelectedPlayerInputs();
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
    let title=text(el("notebookTitle")?.value),body=text(el("notebookBody")?.value);
    if(!title||!body)return setStatus("notebookEntryStatus","Add a title and captain note.",false);
    const button=el("notebookSaveEntryBtn"),original=button.textContent;button.disabled=true;button.textContent="Checking names…";
    try{
      const nameReview=await checkPlayerNames(`${title}\n${body}`,"notebookEntryStatus");
      if(!nameReview.ok){setStatus("notebookEntryStatus","Save canceled so player names can be reviewed.",false);return;}
      title=applyPlayerNameReplacements(title,nameReview.replacements);
      body=applyPlayerNameReplacements(body,nameReview.replacements);
      el("notebookTitle").value=title;el("notebookBody").value=body;
      button.textContent="Saving…";
      const payload={
        entry_type:el("notebookEntryType").value,
        category:el("notebookCategory").value,
        title,body,
        match_id:el("notebookMatch").value||null,
        player_id:el("notebookPlayer").value||null,
        visibility:el("notebookVisibility").value,
        created_by:state.user.id,
        created_by_name:captainName(),
        source:"manual",
        attributed_captain_name:null,
        source_occurred_at:null,
        ai_organized:false
      };
      const result=await sb().from(NOTE_TABLE).insert(payload);
      if(result.error)throw result.error;
      el("notebookEntryForm").reset();
      setStatus("notebookEntryStatus",payload.visibility==="private"?"Private note saved.":"Note saved for the captains.",true);
      await refreshData({quiet:true});
    }catch(error){setStatus("notebookEntryStatus","Could not save note: "+(error.message||error),false);}
    finally{button.disabled=false;button.textContent=original;}
  }

  function setImportMode(enabled){
    state.importMode=!!enabled;
    if(el("notebookWhatsAppBatch"))el("notebookWhatsAppBatch").hidden=!state.importMode;
    if(el("notebookEntryForm"))el("notebookEntryForm").hidden=state.importMode;
    if(el("notebookImportWhatsAppBtn"))el("notebookImportWhatsAppBtn").textContent=state.importMode?"Back to Quick Note":"Import WhatsApp Thread";
    if(el("notebookComposePill"))el("notebookComposePill").textContent=state.importMode?"WhatsApp Match Inbox":"Quick Note";
    if(el("notebookComposeTitle"))el("notebookComposeTitle").textContent=state.importMode?"Import a WhatsApp conversation":"Record an observation";
    if(el("notebookComposeSub"))el("notebookComposeSub").textContent=state.importMode?"Paste a thread, review each message, then keep only the conversation that belongs in the season memory.":"Write naturally. Match, player, category, and visibility fields keep the note useful later.";
  }

  function dateTimeLocal(value){
    const date=new Date(value);if(Number.isNaN(date.valueOf()))return "";
    const pad=number=>String(number).padStart(2,"0");
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function whatsappMatchOptions(selected=""){
    return '<option value="">Choose game…</option>'+state.matches.map(match=>`<option value="${esc(match.id)}" ${String(match.id)===String(selected)?"selected":""}>${esc(matchLabel(match))}</option>`).join("");
  }

  function clearWhatsAppFiles(){
    state.whatsappDrafts.forEach(draft=>(draft.files||[]).forEach(item=>{try{URL.revokeObjectURL(item.url);}catch{}}));
  }

  function clearWhatsAppBatch(){
    clearWhatsAppFiles();
    state.whatsappDrafts=[];
    if(el("notebookWhatsAppPaste"))el("notebookWhatsAppPaste").value="";
    if(el("notebookWhatsAppReview"))el("notebookWhatsAppReview").hidden=true;
    if(el("notebookWhatsAppReviewList"))el("notebookWhatsAppReviewList").innerHTML="";
    setStatus("notebookWhatsAppParseStatus","",true);
    setStatus("notebookWhatsAppImportStatus","",true);
  }

  function updateWhatsAppReviewSummary(){
    const selected=state.whatsappDrafts.filter(item=>item.included);
    const games=new Set(selected.map(item=>item.matchId).filter(Boolean));
    const images=selected.reduce((sum,item)=>sum+(item.files?.length||0),0);
    if(el("notebookWhatsAppReviewSummary"))el("notebookWhatsAppReviewSummary").textContent=`${selected.length} of ${state.whatsappDrafts.length} messages selected · ${games.size} game${games.size===1?"":"s"}${images?` · ${images} lineup image${images===1?"":"s"}`:""}`;
  }

  function renderWhatsAppDraftFiles(draft,index){
    if(!draft.files?.length)return "";
    return `<div class="notebook-whatsapp-files">${draft.files.map((item,fileIndex)=>`<div class="notebook-whatsapp-file"><img src="${esc(item.url)}" alt="Historical lineup preview"><span>${esc(item.file.name)}</span><button type="button" data-wa-remove-file="${index}:${fileIndex}">Remove</button></div>`).join("")}</div>`;
  }

  function renderWhatsAppReview(){
    const host=el("notebookWhatsAppReviewList"),review=el("notebookWhatsAppReview");if(!host||!review)return;
    const groups=new Map();
    state.whatsappDrafts.forEach((draft,index)=>{
      const key=String(draft.matchId||"unassigned");
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push({draft,index});
    });
    host.innerHTML=[...groups.entries()].map(([matchId,rows])=>{
      const match=matchId==="unassigned"?null:matchById(matchId);
      return `<section class="notebook-whatsapp-review-group">
        <div class="notebook-whatsapp-review-group-head"><strong>${esc(match?matchLabel(match):"Game needs review")}</strong><span>${rows.length} message${rows.length===1?"":"s"}</span></div>
        <div class="notebook-whatsapp-review-messages">${rows.map(({draft,index})=>`<article class="notebook-whatsapp-review-message ${draft.included?"":"excluded"}" data-wa-row="${index}">
          <div class="notebook-whatsapp-review-message-head"><label class="notebook-whatsapp-include"><input type="checkbox" data-wa-include="${index}" ${draft.included?"checked":""}> Include this message</label><span class="notebook-whatsapp-sequence">Conversation #${draft.sequence+1}</span></div>
          <div class="notebook-whatsapp-message-fields">
            <div><label for="waAuthor${index}">Person</label><input id="waAuthor${index}" list="notebookCaptainNameOptions" maxlength="160" value="${esc(draft.author)}" data-wa-author="${index}"></div>
            <div><label for="waDate${index}">Original date and time</label><input id="waDate${index}" type="datetime-local" value="${esc(dateTimeLocal(draft.occurredAt))}" data-wa-date="${index}"></div>
            <div><label for="waMatch${index}">Related game</label><select id="waMatch${index}" data-wa-match="${index}">${whatsappMatchOptions(draft.matchId)}</select></div>
          </div>
          <div><label for="waBody${index}">Message</label><textarea id="waBody${index}" class="notebook-whatsapp-message-body" maxlength="5000" data-wa-body="${index}">${esc(draft.body)}</textarea></div>
          <div class="notebook-whatsapp-media-prompt ${draft.hasMediaMarker?"flagged":""}"><div><strong>${draft.hasMediaMarker?"WhatsApp image marker found":"Historical lineup image"}</strong><span>${draft.hasMediaMarker?"Attach the omitted lineup picture to keep it with this point in the conversation.":"If this message included an old lineup, attach it here."}</span></div><label class="notebook-whatsapp-file-label">Add Image<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple data-wa-files="${index}"></label></div>
          ${renderWhatsAppDraftFiles(draft,index)}
        </article>`).join("")}</div>
      </section>`;
    }).join("");
    review.hidden=false;
    host.querySelectorAll("[data-wa-include]").forEach(input=>input.addEventListener("change",()=>{const draft=state.whatsappDrafts[Number(input.dataset.waInclude)];if(!draft)return;draft.included=input.checked;input.closest("[data-wa-row]")?.classList.toggle("excluded",!draft.included);updateWhatsAppReviewSummary();}));
    host.querySelectorAll("[data-wa-author]").forEach(input=>input.addEventListener("input",()=>{state.whatsappDrafts[Number(input.dataset.waAuthor)].author=input.value;}));
    host.querySelectorAll("[data-wa-body]").forEach(input=>input.addEventListener("input",()=>{state.whatsappDrafts[Number(input.dataset.waBody)].body=input.value;}));
    host.querySelectorAll("[data-wa-date]").forEach(input=>input.addEventListener("change",()=>{const draft=state.whatsappDrafts[Number(input.dataset.waDate)],date=new Date(input.value);if(draft&&!Number.isNaN(date.valueOf()))draft.occurredAt=date.toISOString();}));
    host.querySelectorAll("[data-wa-match]").forEach(input=>input.addEventListener("change",()=>{state.whatsappDrafts[Number(input.dataset.waMatch)].matchId=input.value;renderWhatsAppReview();}));
    host.querySelectorAll("[data-wa-files]").forEach(input=>input.addEventListener("change",()=>addWhatsAppFiles(Number(input.dataset.waFiles),input.files)));
    host.querySelectorAll("[data-wa-remove-file]").forEach(button=>button.addEventListener("click",()=>{const [draftIndex,fileIndex]=button.dataset.waRemoveFile.split(":").map(Number),draft=state.whatsappDrafts[draftIndex],item=draft?.files?.[fileIndex];if(item){try{URL.revokeObjectURL(item.url);}catch{}draft.files.splice(fileIndex,1);renderWhatsAppReview();}}));
    updateWhatsAppReviewSummary();
  }

  function addWhatsAppFiles(index,fileList){
    const draft=state.whatsappDrafts[index];if(!draft)return;
    const allowed=new Set(["image/jpeg","image/png","image/webp","image/heic","image/heif"]),files=[...(fileList||[])];
    const invalid=files.find(file=>!allowed.has(attachmentMimeType(file))||file.size<1||file.size>8388608);
    if(invalid)return setStatus("notebookWhatsAppImportStatus",`“${invalid.name}” must be a JPG, PNG, WebP, HEIC, or HEIF image no larger than 8 MB.`,false);
    const existingCount=state.whatsappDrafts.reduce((sum,item)=>sum+(item.files?.length||0),0);
    if(existingCount+files.length>20)return setStatus("notebookWhatsAppImportStatus","Import up to 20 lineup images in one batch.",false);
    files.forEach(file=>draft.files.push({file,mimeType:attachmentMimeType(file),url:URL.createObjectURL(file)}));
    setStatus("notebookWhatsAppImportStatus","Historical lineup image added to the message. It will not upload until you import the batch.",true);
    renderWhatsAppReview();
  }

  function parseWhatsAppBatch(){
    const parser=window.SKORWhatsAppImport;
    if(!parser?.parseWhatsAppThread)return setStatus("notebookWhatsAppParseStatus","WhatsApp parser could not be loaded. Refresh and try again.",false);
    const source=el("notebookWhatsAppPaste")?.value||"";
    if(!text(source))return setStatus("notebookWhatsAppParseStatus","Paste the WhatsApp conversation first.",false);
    const parsed=parser.parseWhatsAppThread(source);
    if(!parsed.messages?.length)return setStatus("notebookWhatsAppParseStatus","No WhatsApp timestamps were found. Paste an exported thread that includes date, time, person, and message.",false);
    clearWhatsAppFiles();
    state.whatsappDrafts=parsed.messages.slice(0,200).map(item=>({
      sequence:item.sequence,
      included:true,
      author:text(item.author).slice(0,160),
      occurredAt:item.occurredAt.toISOString(),
      body:String(item.body||"").slice(0,5000),
      hasMediaMarker:!!item.hasMediaMarker,
      matchId:parser.suggestMatchId(item.occurredAt,state.matches),
      files:[]
    }));
    renderWhatsAppReview();
    const warnings=[...(parsed.warnings||[])];
    if(parsed.messages.length>200)warnings.push("Only the first 200 messages are shown per batch.");
    setStatus("notebookWhatsAppParseStatus",`${state.whatsappDrafts.length} messages found and kept in conversation order.${warnings.length?" "+warnings.join(" "):""}`,true);
  }

  async function checkWhatsAppPlayerNames(drafts){
    const chunks=[];let current="";
    drafts.forEach(draft=>{
      const value=text(draft.body);if(!value)return;
      if(current&&current.length+value.length+2>10000){chunks.push(current);current="";}
      current+=(current?"\n\n":"")+value;
    });
    if(current)chunks.push(current);
    const replacements=[];
    for(const chunk of chunks){
      const review=await checkPlayerNames(chunk,"notebookWhatsAppImportStatus");
      if(!review.ok)return false;
      replacements.push(...(review.replacements||[]));
    }
    drafts.forEach(draft=>{draft.body=applyPlayerNameReplacements(draft.body,replacements);});
    return true;
  }

  function attachmentExtension(file){
    const fromName=(file.name.split(".").pop()||"").toLowerCase().replace(/[^a-z0-9]/g,"");
    if(["jpg","jpeg","png","webp","heic","heif"].includes(fromName))return fromName;
    return ({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/heic":"heic","image/heif":"heif"})[file.type]||"jpg";
  }

  function attachmentMimeType(file){
    if(file.type==="image/jpg")return "image/jpeg";
    if(file.type)return file.type;
    const extension=(file.name.split(".").pop()||"").toLowerCase();
    return ({jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",heic:"image/heic",heif:"image/heif"})[extension]||"";
  }

  async function importWhatsAppBatch(){
    if(state.whatsappImporting)return;
    if(!state.ready)return setStatus("notebookWhatsAppImportStatus","Notebook database setup is still pending.",false);
    if(!window.SKORPortalCanWrite?.())return window.SKORViewerBlocked?.("import WhatsApp messages");
    const selected=state.whatsappDrafts.filter(item=>item.included);
    if(!selected.length)return setStatus("notebookWhatsAppImportStatus","Select at least one message to import.",false);
    const invalid=selected.find(item=>!text(item.author)||!item.matchId||Number.isNaN(new Date(item.occurredAt).valueOf())||(!text(item.body)&&!item.files.length));
    if(invalid)return setStatus("notebookWhatsAppImportStatus","Every selected message needs a person, valid date, related game, and message or lineup image.",false);
    const button=el("notebookImportSelectedWhatsAppBtn"),original=button.textContent,visibility=el("notebookWhatsAppVisibility")?.value==="private"?"private":"captains";
    state.whatsappImporting=true;button.disabled=true;button.textContent="Checking names…";
    const uploadedPaths=[];
    let batchId="";
    try{
      if(!await checkWhatsAppPlayerNames(selected)){setStatus("notebookWhatsAppImportStatus","Import canceled so player names can be reviewed.",false);return;}
      button.textContent="Importing…";
      batchId=crypto.randomUUID();
      const payloads=selected.map(item=>({
        entry_type:"match",
        category:/lineup|formation|shape|press|position|midfield|defen|attack|wing|substitut|tactic/i.test(item.body)||item.files.length?"tactical":"observation",
        title:`WhatsApp · ${text(item.author)} · ${isoDate(item.occurredAt)}`.slice(0,140),
        body:(text(item.body)||"Historical lineup image.").slice(0,5000),
        match_id:item.matchId,
        player_id:null,
        visibility,
        created_by:state.user.id,
        created_by_name:captainName(),
        source:"whatsapp",
        attributed_captain_name:text(item.author).slice(0,160),
        source_occurred_at:new Date(item.occurredAt).toISOString(),
        source_batch_id:batchId,
        source_sequence:item.sequence,
        ai_organized:false
      }));
      const noteResult=await sb().from(NOTE_TABLE).insert(payloads).select("id,source_sequence");
      if(noteResult.error)throw noteResult.error;
      const entryBySequence=new Map((noteResult.data||[]).map(row=>[Number(row.source_sequence),row.id]));
      for(const item of selected){
        const entryId=entryBySequence.get(Number(item.sequence));
        if(!entryId)throw new Error("An imported message could not be matched to its saved entry.");
        for(const media of item.files){
          const file=media.file,path=`${state.user.id}/${entryId}/${crypto.randomUUID()}.${attachmentExtension(file)}`;
          const upload=await sb().storage.from(MEDIA_BUCKET).upload(path,file,{cacheControl:"3600",contentType:media.mimeType,upsert:false});
          if(upload.error)throw upload.error;
          uploadedPaths.push(path);
          const attachment=await sb().from(ATTACHMENT_TABLE).insert({
            notebook_entry_id:entryId,
            storage_path:path,
            attachment_type:"historical_lineup",
            original_file_name:String(file.name||"historical-lineup").slice(0,255),
            mime_type:media.mimeType,
            file_size_bytes:file.size,
            created_by:state.user.id
          });
          if(attachment.error)throw attachment.error;
        }
      }
      const gameCount=new Set(selected.map(item=>item.matchId)).size,imageCount=selected.reduce((sum,item)=>sum+item.files.length,0);
      clearWhatsAppBatch();
      setImportMode(false);
      await refreshData({quiet:true});
      setStatus("notebookEntryStatus",`${selected.length} WhatsApp message${selected.length===1?"":"s"} imported in conversation order across ${gameCount} game${gameCount===1?"":"s"}${imageCount?`, with ${imageCount} historical lineup image${imageCount===1?"":"s"}`:""}.`,true);
    }catch(error){
      if(uploadedPaths.length)await sb().storage.from(MEDIA_BUCKET).remove(uploadedPaths);
      if(batchId)await sb().from(NOTE_TABLE).delete().eq("source_batch_id",batchId).eq("created_by",state.user.id);
      setStatus("notebookWhatsAppImportStatus","Could not import conversation: "+(error.message||error),false);
    }finally{state.whatsappImporting=false;button.disabled=false;button.textContent=original;}
  }

  async function deleteNote(id){
    const note=state.notes.find(item=>item.id===id);if(!note)return;
    if(!confirm(`Delete “${note.title}”? This cannot be undone.`))return;
    const mediaPaths=noteAttachments(id).map(item=>item.storage_path).filter(Boolean);
    const result=await sb().from(NOTE_TABLE).delete().eq("id",id).eq("created_by",state.user.id);
    if(result.error)return setStatus("notebookEntryStatus","Could not delete note: "+result.error.message,false);
    const storageResult=mediaPaths.length?await sb().storage.from(MEDIA_BUCKET).remove(mediaPaths):{error:null};
    setStatus("notebookEntryStatus",storageResult.error?"Note deleted, but its stored image could not be cleaned up automatically.":"Note deleted.",!storageResult.error);
    await refreshData({quiet:true});
  }

  const PREGAME_CATEGORY_LABELS={progress:"Progress to Reinforce",priority:"Match Priority",tactical:"Tactical Detail",mentality:"Mentality",set_piece:"Set Piece"};
  const PREGAME_SOURCE_LABELS={last_game:"Observed Last Game",attendance:"Game Availability",captain_priority:"Captain Priority",captain_whatsapp:"Captain WhatsApp",lineup_plan:"Saved Lineup Plan",strategy_plan:"Published Strategy",player_input:"Player Input",ai_strategy:"AI Soccer Suggestion"};

  function selectedPlayerInputs(){
    const rows=window.SKORGetAiPlayerComments?.();
    return Array.isArray(rows)?rows:[];
  }

  function renderSelectedPlayerInputs(){
    const host=el("notebookPlayerInputList"),summary=el("notebookPlayerInputSummary"),count=el("notebookAiLibraryCount");if(!host)return;
    const rows=selectedPlayerInputs();
    const label=`${rows.length} saved comment${rows.length===1?"":"s"}`;
    if(summary)summary.innerHTML=`<strong>${esc(label)}</strong><span>${rows.length?"These persistent references are automatically available to AI.":'Use <strong>Use with AI</strong> in Game Day to add persistent player context.'}</span>`;
    if(count)count.textContent=label;
    if(!rows.length){host.innerHTML='<div class="notebook-empty">No player comments saved yet. Use <strong>Use with AI</strong> in Game Day → RSVP &amp; Player Feedback.</div>';return;}
    const groups=new Map();
    rows.forEach(item=>{
      const key=String(item.match_id||"unknown");
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(item);
    });
    const grouped=[...groups.entries()].sort(([,a],[,b])=>new Date((matchById(b[0].match_id)||b[0]).kickoff||b[0].selected_at||0)-new Date((matchById(a[0].match_id)||a[0]).kickoff||a[0].selected_at||0));
    host.innerHTML=grouped.map(([matchId,items])=>{
      const relatedMatch=matchById(matchId)||items[0];
      const newest=items.map(item=>new Date(item.selected_at||item.created_at||0).valueOf()).sort((a,b)=>b-a)[0];
      return `<details class="notebook-ai-game-group">
        <summary><span class="notebook-ai-game-title"><strong>${esc(matchLabel(relatedMatch))}</strong><span>${items.length} saved player comment${items.length===1?"":"s"}${newest?` · Updated ${esc(isoDate(newest))}`:""}</span></span></summary>
        <div class="notebook-ai-game-items">${items.map(item=>`<article class="notebook-player-input-item">
          <div class="notebook-player-input-main"><strong>#${esc(item.jersey_number)} ${esc(item.player_name||"Player")}</strong><span class="notebook-player-input-visibility ${item.visibility==="captains"?"private":""}">${item.visibility==="captains"?"Private to Captains":"Team Comment"}</span><p>${esc(text(item.comment))}</p><div class="notebook-player-input-meta">Commented ${esc(isoDateTime(item.created_at))}</div></div>
          <button class="notebook-player-input-remove" type="button" data-ai-library-remove="${esc(item.comment_id)}">Remove from AI</button>
        </article>`).join("")}</div>
      </details>`;
    }).join("");
    host.querySelectorAll("[data-ai-library-remove]").forEach(button=>button.addEventListener("click",async()=>{
      const original=button.textContent;button.disabled=true;button.textContent="Removing…";
      try{await window.SKORRemoveAiPlayerComment?.(button.dataset.aiLibraryRemove);setStatus("notebookAiLibraryStatus","Player comment removed from the AI reference library.",true);}
      catch(error){button.disabled=false;button.textContent=original;setStatus("notebookAiLibraryStatus","Could not remove the player comment: "+(error.message||error),false);}
    }));
  }

  function normalizePregameBrief(raw){
    const bullets=Array.isArray(raw?.bullets)?raw.bullets.slice(0,8).map(item=>({
      category:PREGAME_CATEGORY_LABELS[item?.category]?item.category:"priority",
      source:PREGAME_SOURCE_LABELS[item?.source]?item.source:"ai_strategy",
      text:text(item?.text).slice(0,600)
    })).filter(item=>item.text):[];
    return {
      title:text(raw?.title).slice(0,140)||"SKOR FC Pregame Talk",
      opening:text(raw?.opening).slice(0,800),
      bullets,
      closing:text(raw?.closing).slice(0,500)
    };
  }

  function renderPregameBrief(raw){
    const brief=normalizePregameBrief(raw);state.pregameBrief=brief;
    el("notebookPregameEmpty").hidden=true;
    el("notebookPregameResult").hidden=false;
    el("notebookPregameTitle").value=brief.title;
    el("notebookPregameOpening").value=brief.opening;
    el("notebookPregameClosing").value=brief.closing;
    el("notebookPregameBullets").innerHTML=brief.bullets.map((item,index)=>`<div class="notebook-pregame-bullet" data-pregame-item="${index}" data-category="${esc(item.category)}" data-source="${esc(item.source)}">
      <span class="notebook-pregame-bullet-number">${index+1}</span>
      <div class="notebook-pregame-bullet-main">
        <div class="notebook-pregame-bullet-meta"><span class="notebook-pregame-bullet-tag">${esc(PREGAME_CATEGORY_LABELS[item.category])}</span><span class="notebook-pregame-bullet-source">${esc(PREGAME_SOURCE_LABELS[item.source])}</span></div>
        <textarea maxlength="600" aria-label="Pregame point ${index+1}">${esc(item.text)}</textarea>
      </div>
    </div>`).join("");
  }

  function collectPregameBrief(){
    if(!state.pregameBrief)return null;
    return normalizePregameBrief({
      title:el("notebookPregameTitle")?.value,
      opening:el("notebookPregameOpening")?.value,
      closing:el("notebookPregameClosing")?.value,
      bullets:[...el("notebookPregameBullets").querySelectorAll("[data-pregame-item]")].map(item=>({
        category:item.dataset.category,
        source:item.dataset.source,
        text:item.querySelector("textarea")?.value
      }))
    });
  }

  function pregameBriefText(brief=collectPregameBrief()){
    if(!brief)return "";
    const lines=[brief.title];
    if(brief.opening)lines.push("",brief.opening);
    if(brief.bullets.length){
      lines.push("");
      brief.bullets.forEach(item=>lines.push(`• ${item.text}`));
    }
    if(brief.closing)lines.push("",brief.closing);
    return lines.join("\n");
  }

  async function generatePregameTalk(){
    if(state.pregameGenerating)return;
    const matchId=el("notebookPregameMatch")?.value;
    if(!matchId)return setStatus("notebookPregameStatus","Choose an upcoming match first.",false);
    const button=el("notebookGeneratePregameBtn"),original=button.textContent;
    state.pregameGenerating=true;button.disabled=true;button.textContent="Generating…";
    setStatus("notebookPregameStatus","Reviewing recent captain debriefs and building the talk…",true);
    try{
      const {data,error}=await sb().functions.invoke("generate-pregame-talk",{body:{
        match_id:matchId,
        tone:el("notebookPregameTone")?.value||"balanced",
        speech_length:el("notebookPregameLength")?.value||"standard",
        formation_context:text(el("notebookPregameFormation")?.value),
        captain_focus:text(el("notebookPregameFocus")?.value)
      }});
      if(error){
        let message=error.message||"The AI generator could not be reached.";
        try{const detail=await error.context?.json?.();if(detail?.error)message=detail.error;}catch{}
        throw new Error(message);
      }
      if(!data?.brief)throw new Error(data?.error||"The AI generator returned no pregame talk.");
      renderPregameBrief(data.brief);
      const playerCount=Number(data.context?.player_comment_count||0);
      const whatsappCount=Number(data.context?.whatsapp_message_count||0);
      const lineupName=text(data.context?.lineup_name),lineupIncluded=data.context?.lineup_included===true;
      const lineupDetail=lineupIncluded?`, Production/Final lineup “${lineupName||"Saved Lineup"}” with ${Number(data.context?.lineup_starter_count||0)} starters and ${Number(data.context?.lineup_substitution_wave_count||0)} planned wave${Number(data.context?.lineup_substitution_wave_count||0)===1?"":"s"}`:"";
      const lineupWarning=lineupIncluded?"":" No Production/Final lineup was found for this game, so lineup assignments were not sent.";
      const strategyIncluded=data.context?.strategy_included===true;
      const strategyDetail=strategyIncluded?`, published strategy “${text(data.context?.strategy_title)||"Match Strategy"}” with ${Number(data.context?.strategy_scene_count||0)} tactical scene${Number(data.context?.strategy_scene_count||0)===1?"":"s"}`:"";
      const strategyWarning=strategyIncluded?"":" No strategy published for AI was found for this game.";
      setStatus("notebookPregameStatus",`Generated from ${Number(data.context?.debrief_count||0)} completed debrief${Number(data.context?.debrief_count||0)===1?"":"s"}, selected-game attendance${lineupDetail}${strategyDetail}${whatsappCount?`, ${whatsappCount} captain WhatsApp message${whatsappCount===1?"":"s"}`:""}${playerCount?`, and ${playerCount} captain-selected player comment${playerCount===1?"":"s"}`:""}. Private notes, private WhatsApp messages, drafts, unpublished strategies, and unselected player comments were not sent to AI.${lineupWarning}${strategyWarning} Review and edit before sharing.`,true);
    }catch(error){
      setStatus("notebookPregameStatus","Could not generate talk: "+(error.message||error),false);
    }finally{state.pregameGenerating=false;button.disabled=false;button.textContent=original;}
  }

  async function copyPregameTalk(){
    const value=pregameBriefText();if(!value)return;
    try{
      await navigator.clipboard.writeText(value);
      setStatus("notebookPregameStatus","Pregame talk copied.",true);
    }catch{
      const area=document.createElement("textarea");area.value=value;document.body.appendChild(area);area.select();document.execCommand("copy");area.remove();
      setStatus("notebookPregameStatus","Pregame talk copied.",true);
    }
  }

  function printPregameTalk(){
    const brief=collectPregameBrief();if(!brief)return;
    const match=matchById(el("notebookPregameMatch")?.value),popup=window.open("","_blank","width=760,height=900");
    if(!popup)return setStatus("notebookPregameStatus","Allow pop-ups to print the pregame talk.",false);
    popup.opener=null;
    popup.document.write(`<!doctype html><html><head><title>${esc(brief.title)}</title><style>body{font-family:Arial,sans-serif;max-width:720px;margin:40px auto;padding:0 24px;color:#202124}h1{color:#741a39;margin-bottom:4px}.match{color:#666;margin-bottom:24px}.opening,.closing{font-size:18px;line-height:1.5}.closing{margin-top:24px;font-weight:700}li{margin:0 0 13px;line-height:1.45}.tag{display:inline-block;margin-right:7px;color:#741a39;font-size:11px;font-weight:700;text-transform:uppercase}@media print{body{margin:0}}</style></head><body><h1>${esc(brief.title)}</h1><div class="match">${esc(matchLabel(match))}</div><p class="opening">${esc(brief.opening)}</p><ol>${brief.bullets.map(item=>`<li><span class="tag">${esc(PREGAME_CATEGORY_LABELS[item.category])}</span>${esc(item.text)}</li>`).join("")}</ol><p class="closing">${esc(brief.closing)}</p><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  }

  async function savePregameTalk(){
    const brief=collectPregameBrief(),body=pregameBriefText(brief),matchId=el("notebookPregameMatch")?.value;
    if(!brief||!body||!matchId)return setStatus("notebookPregameStatus","Generate a talk and select its match before saving.",false);
    const button=el("notebookSavePregameBtn"),original=button.textContent;button.disabled=true;button.textContent="Saving…";
    try{
      const result=await sb().from(NOTE_TABLE).insert({
        entry_type:"match",category:"tactical",title:brief.title,body:body.slice(0,5000),match_id:matchId,player_id:null,
        visibility:"captains",created_by:state.user.id,created_by_name:captainName(),source:"ai_pregame",ai_organized:true
      });
      if(result.error)throw result.error;
      setStatus("notebookPregameStatus","Pregame talk saved for all captains in the Notebook.",true);
      await refreshData({quiet:true});
    }catch(error){setStatus("notebookPregameStatus","Could not save talk: "+(error.message||error),false);}
    finally{button.disabled=false;button.textContent=original;}
  }

  function renderDebriefPlanContext(){
    const host=el("notebookPlanContext");if(!host)return;
    host.hidden=false;
    const lineup=state.debriefLineup;
    const lineupState=lineup?.state&&typeof lineup.state==="object"?lineup.state:{};
    const formation=text(lineupState.formation)||"Formation not set";
    const starterCount=formation==="Freeform / Custom"?Object.keys(lineupState.freeform||{}).length:Object.values(lineupState.slots||{}).filter(Boolean).length;
    const benchCount=Array.isArray(lineupState.bench)?lineupState.bench.length:0;
    const subs=lineupState.subs&&typeof lineupState.subs==="object"?lineupState.subs:{};
    const waveCount=[...(Array.isArray(subs.firstHalf)?subs.firstHalf:[]),...(Array.isArray(subs.secondHalf)?subs.secondHalf:[])].filter(row=>(row?.out||[]).length||(row?.in||[]).length).length;
    el("notebookPlanLineupTitle").textContent=lineup?`${lineup.name||"Final lineup"} · ${formation}`:"No Production/Final lineup";
    el("notebookPlanLineupMeta").textContent=lineup?`${starterCount} starters · ${benchCount} substitutes · ${waveCount} planned substitution wave${waveCount===1?"":"s"}`:"Save a Production/Final lineup for this game to anchor the review.";
    const strategy=state.debriefStrategy,scenes=Array.isArray(strategy?.scenes)?strategy.scenes:[];
    el("notebookPlanStrategyTitle").textContent=strategy?`${strategy.title||"Match Strategy"} · ${strategy.opponent_formation||"Opponent shape not set"}`:"No shared strategy";
    el("notebookPlanStrategyMeta").textContent=strategy?`${scenes.length} scene${scenes.length===1?"":"s"}: ${scenes.map(scene=>text(scene.name)).filter(Boolean).join(", ")||"Unnamed scenes"} · ${strategy.status==="published"&&strategy.ai_context_enabled?"Published for AI":"Captain draft only"}`:"Build and save a game-linked Strategy to review it here after the match.";
    const open=el("notebookOpenStrategyBtn");if(open)open.disabled=!strategy;
  }

  function collectDebriefPayload(status){
    return {
      match_id:el("notebookDebriefMatch").value,
      captain_id:state.user.id,
      captain_name:captainName(),
      status,
      team_performance:text(el("debriefTeamPerformance").value)||null,
      improvements_since_last_game:text(el("debriefImprovements").value)||null,
      lineup_execution:text(el("debriefLineupExecution").value)||null,
      strategy_execution:text(el("debriefStrategyExecution").value)||null,
      opponent_adjustments:text(el("debriefOpponentAdjustments").value)||null,
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
    return ["team_performance","improvements_since_last_game","lineup_execution","strategy_execution","opponent_adjustments","standouts","tactical_observations","issues","position_changes","practice_focus","additional_notes"].some(key=>text(payload[key]))||
      [...state.playerDrafts.values()].some(item=>item.tags.size||text(item.observation));
  }

  function debriefNameCheckText(payload){
    const teamFields=[
      payload.team_performance,
      payload.improvements_since_last_game,
      payload.lineup_execution,
      payload.strategy_execution,
      payload.opponent_adjustments,
      payload.standouts,
      payload.tactical_observations,
      payload.issues,
      payload.position_changes,
      payload.practice_focus,
      payload.additional_notes
    ].filter(value=>text(value));
    const playerFields=state.players.flatMap(player=>{
      const observation=text(state.playerDrafts.get(String(player.id))?.observation);
      return observation?[`#${player.jersey_number} ${displayName(player)}: ${observation}`]:[];
    });
    return [...teamFields,...playerFields].join("\n");
  }

  async function saveDebrief(requestedStatus){
    if(!state.ready)return setStatus("notebookDebriefStatus","Notebook database setup is still pending.",false);
    if(state.readOnly)return;
    const matchId=el("notebookDebriefMatch").value;
    if(!matchId)return setStatus("notebookDebriefStatus","Choose a match first.",false);
    readPlayerDraftInputs();
    const status=state.currentDebrief?.status==="completed"?"completed":requestedStatus;
    const payload=collectDebriefPayload(status);
    if(status==="completed"&&!debriefHasContent(payload))return setStatus("notebookDebriefStatus","Add at least one team or player observation before completing the debrief.",false);
    const draftButton=el("notebookSaveDraftBtn"),completeButton=el("notebookCompleteDebriefBtn");
    draftButton.disabled=true;completeButton.disabled=true;
    const activeButton=requestedStatus==="completed"?completeButton:draftButton,oldText=activeButton.textContent;
    activeButton.textContent="Checking names…";
    try{
      const nameReview=await checkPlayerNames(debriefNameCheckText(payload),"notebookDebriefStatus");
      if(!nameReview.ok){setStatus("notebookDebriefStatus","Save canceled so player names can be reviewed.",false);return;}
      const fieldIds={team_performance:"debriefTeamPerformance",improvements_since_last_game:"debriefImprovements",lineup_execution:"debriefLineupExecution",strategy_execution:"debriefStrategyExecution",opponent_adjustments:"debriefOpponentAdjustments",standouts:"debriefStandouts",tactical_observations:"debriefObservations",issues:"debriefIssues",position_changes:"debriefPositionChanges",practice_focus:"debriefPracticeFocus",additional_notes:"debriefAdditionalNotes"};
      Object.entries(fieldIds).forEach(([key,id])=>{
        payload[key]=applyPlayerNameReplacements(payload[key],nameReview.replacements)||null;
        if(el(id))el(id).value=payload[key]||"";
      });
      state.playerDrafts.forEach(item=>{item.observation=applyPlayerNameReplacements(item.observation,nameReview.replacements);});
      el("notebookPlayerGrid")?.querySelectorAll("[data-player-note]").forEach(input=>{input.value=state.playerDrafts.get(String(input.dataset.playerNote))?.observation||"";});
      activeButton.textContent="Saving…";
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
    ["debriefTeamPerformance","debriefImprovements","debriefLineupExecution","debriefStrategyExecution","debriefOpponentAdjustments","debriefStandouts","debriefObservations","debriefIssues","debriefPositionChanges","debriefPracticeFocus","debriefAdditionalNotes"].forEach(id=>{const node=el(id);if(node)node.readOnly=readOnly;});
    el("notebookSaveDraftBtn").hidden=readOnly||state.currentDebrief?.status==="completed";
    el("notebookCompleteDebriefBtn").hidden=readOnly;
    if(!readOnly)el("notebookCompleteDebriefBtn").textContent=state.currentDebrief?.status==="completed"?"Update Completed Debrief":"Complete & Share with Captains";
  }

  function fillDebrief(row){
    el("notebookDebriefId").value=row?.id||"";
    el("debriefTeamPerformance").value=row?.team_performance||"";
    el("debriefImprovements").value=row?.improvements_since_last_game||"";
    el("debriefLineupExecution").value=row?.lineup_execution||"";
    el("debriefStrategyExecution").value=row?.strategy_execution||"";
    el("debriefOpponentAdjustments").value=row?.opponent_adjustments||"";
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
    state.attendance=new Set();state.playerDrafts=new Map();state.currentDebrief=null;state.debriefLineup=null;state.debriefStrategy=state.strategies.find(item=>String(item.match_id)===String(matchId))||null;state.readOnly=false;
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
      const [attendanceResult,assessmentResult,lineupResult]=await Promise.all([
        sb().from("player_match_attendance").select("player_id,status").eq("match_id",matchId).eq("status","present"),
        row?sb().from(ASSESSMENT_TABLE).select("player_id,tags,observation").eq("debrief_id",row.id):Promise.resolve({data:[],error:null}),
        sb().rpc("get_production_lineup",{p_match_id:matchId})
      ]);
      if(attendanceResult.error)console.warn("Could not prefill Notebook attendance:",attendanceResult.error);
      else state.attendance=new Set((attendanceResult.data||[]).map(item=>String(item.player_id)));
      if(assessmentResult.error)throw assessmentResult.error;
      if(lineupResult.error)console.warn("Could not load the Final lineup for this debrief:",lineupResult.error);
      else state.debriefLineup=Array.isArray(lineupResult.data)?lineupResult.data[0]||null:lineupResult.data||null;
      (assessmentResult.data||[]).forEach(item=>state.playerDrafts.set(String(item.player_id),{tags:new Set(item.tags||[]),observation:item.observation||""}));
      fillDebrief(row);
      renderDebriefPlanContext();
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
    el("notebookImportWhatsAppBtn")?.addEventListener("click",()=>setImportMode(!state.importMode));
    el("notebookParseWhatsAppBtn")?.addEventListener("click",parseWhatsAppBatch);
    el("notebookClearWhatsAppBtn")?.addEventListener("click",clearWhatsAppBatch);
    el("notebookWhatsAppSelectAllBtn")?.addEventListener("click",()=>{state.whatsappDrafts.forEach(item=>{item.included=true;});renderWhatsAppReview();});
    el("notebookWhatsAppSelectNoneBtn")?.addEventListener("click",()=>{state.whatsappDrafts.forEach(item=>{item.included=false;});renderWhatsAppReview();});
    el("notebookImportSelectedWhatsAppBtn")?.addEventListener("click",importWhatsAppBatch);
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
    el("notebookOpenStrategyBtn")?.addEventListener("click",()=>{
      const matchId=el("notebookDebriefMatch")?.value;if(!matchId)return;
      window.openView?.("strategy");
      window.setTimeout(()=>window.SKORStrategy?.loadForMatch?.(matchId),0);
    });
    el("notebookGeneratePregameBtn")?.addEventListener("click",generatePregameTalk);
    window.addEventListener("skor:ai-player-comments-changed",renderSelectedPlayerInputs);
    el("notebookCopyPregameBtn")?.addEventListener("click",copyPregameTalk);
    el("notebookPrintPregameBtn")?.addEventListener("click",printPregameTalk);
    el("notebookSavePregameBtn")?.addEventListener("click",savePregameTalk);
    el("notebookAliasConfirmBtn")?.addEventListener("click",confirmAliasReview);
    el("notebookAliasCancelBtn")?.addEventListener("click",()=>settleAliasReview(false));
    el("notebookAliasCancelXBtn")?.addEventListener("click",()=>settleAliasReview(false));
    el("notebookAliasDialog")?.addEventListener("cancel",event=>{event.preventDefault();settleAliasReview(false);});
  }

  async function init(){
    if(state.initialized)return;
    state.initialized=true;
    const aliasDialog=el("notebookAliasDialog");
    if(aliasDialog&&aliasDialog.parentElement!==document.body)document.body.appendChild(aliasDialog);
    bindEvents();
    renderSelectedPlayerInputs();
    await refreshData({quiet:true});
  }

  async function activate(){
    if(!window.SKORPortalCanWrite?.())return;
    if(!state.initialized)await init();
    else if(!state.loading)await refreshData({quiet:true});
  }

  window.SKORNotebook={
    init,
    activate,
    refresh:refreshData,
    reviewPlayerNames:value=>checkPlayerNames(value,"notebookAliasStatus"),
    applyNameReplacements:(value,replacements)=>applyPlayerNameReplacements(value,replacements)
  };
  window.addEventListener("skor:portal-ready",()=>{if(window.SKORPortalCanWrite?.())init();});
  window.setTimeout(()=>{
    const app=el("adminApp");
    if(app?.style.display==="grid"&&window.SKORPortalCanWrite?.())init();
  },0);
})();
