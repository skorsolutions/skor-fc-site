(function(root){
  "use strict";

  const CARD_CAPACITY=26;
  const EXCEL_TEMPLATE="assets/SKOR-Ref-Game-Card-Template.xlsx";
  const EXCEL_NS="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const ATLANTA_TZ="America/New_York";

  function text(value){return String(value??"").trim();}
  function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[ch]);}
  function playerId(player){return String(player?.player_key||player?.id||"");}
  function fullPlayerName(player){return text(player?.fullName||player?.full_name||player?.display_name||player?.name||"Player");}
  function validJersey(value){const number=Number(value);return Number.isInteger(number)&&number>0?number:null;}

  function zonedParts(value){
    const date=value?new Date(value):null;
    if(!date||Number.isNaN(date.getTime()))return {dateInput:"",dateLabel:"",timeInput:"",timeLabel:""};
    const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
      timeZone:ATLANTA_TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
    }).formatToParts(date).filter(part=>part.type!=="literal").map(part=>[part.type,part.value]));
    const dateInput=`${parts.year}-${parts.month}-${parts.day}`;
    const timeInput=`${parts.hour}:${parts.minute}`;
    return {dateInput,dateLabel:formatDateLabel(dateInput),timeInput,timeLabel:formatTimeLabel(timeInput)};
  }

  function formatDateLabel(value){
    const match=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match?`${match[2]}/${match[3]}/${match[1]}`:text(value);
  }

  function formatTimeLabel(value){
    const match=String(value||"").match(/^(\d{1,2}):(\d{2})$/);
    if(!match)return text(value);
    const hour=Number(match[1]);
    if(!Number.isInteger(hour)||hour<0||hour>23)return text(value);
    return `${hour%12||12}:${match[2]} ${hour>=12?"PM":"AM"}`;
  }

  function opponentFor(match){
    const home=text(match?.home_team),away=text(match?.away_team);
    if(home.toLowerCase()==="skor fc")return away;
    if(away.toLowerCase()==="skor fc")return home;
    return away||home;
  }

  function selectedSquadIds(state){
    const formation=text(state?.formation);
    const starters=formation==="Freeform / Custom"
      ? Object.keys(state?.freeform||{})
      : Object.values(state?.slots||{});
    return [...new Set([...starters,...(Array.isArray(state?.bench)?state.bench:[])].filter(Boolean).map(String))];
  }

  function buildCardData({state={},roster=[],match=null,edits={}}={}){
    const byId=new Map((roster||[]).map(player=>[playerId(player),player]));
    const squadIds=selectedSquadIds(state);
    const missingPlayerIds=squadIds.filter(id=>!byId.has(id));
    const players=squadIds.map(id=>byId.get(id)).filter(Boolean).map(player=>({
      id:playerId(player),
      name:fullPlayerName(player),
      number:validJersey(player?.number??player?.jersey_number),
      temp:player?.temp===true
    })).sort((a,b)=>{
      if(a.temp!==b.temp)return a.temp?1:-1;
      if(a.number!==null&&b.number!==null&&a.number!==b.number)return a.number-b.number;
      if((a.number!==null)!==(b.number!==null))return a.number!==null?-1:1;
      return a.name.localeCompare(b.name);
    });
    const kickoff=zonedParts(match?.kickoff);
    const dateInput=text(edits.dateInput)||kickoff.dateInput;
    const timeInput=text(edits.timeInput)||kickoff.timeInput;
    return {
      teamName:"SKOR FC",
      teamColors:text(edits.teamColors)||"White / Black / Maroon",
      coach:text(edits.coach)||"Edward Levin",
      opponent:text(edits.opponent)||opponentFor(match),
      league:"Over 30 / Over 25",
      leagueSecondary:"Over 50",
      field:text(edits.field)||text(match?.location),
      dateInput,
      dateLabel:formatDateLabel(dateInput),
      timeInput,
      timeLabel:formatTimeLabel(timeInput),
      players,
      missingPlayerIds,
      matchId:text(match?.id),
      eventLabel:text(edits.eventLabel),
      capacity:CARD_CAPACITY,
      blankRows:Math.max(0,CARD_CAPACITY-players.length)
    };
  }

  function validateCardData(data){
    const errors=[];
    const warnings=[];
    if(!data?.matchId)errors.push("Select a scheduled game. Tinker boards cannot create an official referee card.");
    if(!text(data?.opponent))errors.push("The selected game does not have an opponent.");
    if(!text(data?.dateInput))errors.push("The selected game does not have a valid date.");
    if(!data?.players?.length)errors.push("Add at least one starter or substitute to the current lineup.");
    if((data?.players?.length||0)>CARD_CAPACITY)errors.push(`The official card has ${CARD_CAPACITY} player rows. Remove ${data.players.length-CARD_CAPACITY} player${data.players.length-CARD_CAPACITY===1?"":"s"}.`);
    if(data?.missingPlayerIds?.length)errors.push(`${data.missingPlayerIds.length} selected lineup player${data.missingPlayerIds.length===1?" is":"s are"} no longer available in the current roster.`);
    const noNumber=(data?.players||[]).filter(player=>player.number===null);
    if(noNumber.length)errors.push(`Assign a jersey number to: ${noNumber.map(player=>player.name).join(", ")}.`);
    const numbers=new Map();
    (data?.players||[]).forEach(player=>{
      if(player.number===null)return;
      if(!numbers.has(player.number))numbers.set(player.number,[]);
      numbers.get(player.number).push(player.name);
    });
    [...numbers.entries()].filter(([,names])=>names.length>1).forEach(([number,names])=>errors.push(`Jersey #${number} is assigned to ${names.join(" and ")}.`));
    if(!text(data?.field))warnings.push("Field is blank. You can enter it here or write it on the printed card.");
    if(!text(data?.timeInput))warnings.push("Scheduled starting time is blank.");
    return {errors,warnings,valid:errors.length===0};
  }

  function rosterRows(data){
    return Array.from({length:CARD_CAPACITY},(_,index)=>{
      const player=data.players[index];
      return `<tr><td class="ref-card-player-cell"><div class="ref-card-player-content"><span class="ref-card-sequence">${index+1}</span><span class="ref-card-player-name">${player?escapeHtml(player.name):""}</span></div></td><td class="ref-card-jersey">${player?.number??""}</td><td></td><td></td><td></td><td></td></tr>`;
    }).join("");
  }

  function buildCardMarkup(data){
    return `<div class="ref-card-page">
      <div class="ref-card-title">Roswell Recreation &amp; Parks - Game Card</div>
      <div class="ref-card-upper">
        <div class="ref-card-team-details">
          <div class="ref-card-field-row"><span class="ref-card-field-label">Team Name</span><span class="ref-card-field-value">${escapeHtml(data.teamName)}</span></div>
          <div class="ref-card-field-row"><span class="ref-card-field-label">Team Colors</span><span class="ref-card-field-value">${escapeHtml(data.teamColors)}</span></div>
          <div class="ref-card-field-row"><span class="ref-card-field-label">Coach</span><span class="ref-card-field-value">${escapeHtml(data.coach)}</span></div>
          <div class="ref-card-field-row"><span class="ref-card-field-label">Opponent</span><span class="ref-card-field-value">${escapeHtml(data.opponent)}</span></div>
          <div class="ref-card-field-row"><span class="ref-card-field-label">League</span><span class="ref-card-field-value ref-card-league-values"><span>${escapeHtml(data.league)}</span><span>${escapeHtml(data.leagueSecondary)}</span></span></div>
        </div>
        <div class="ref-card-report-head">
          <div class="ref-card-report-title">Referee Report</div>
          <div class="ref-card-report-line two-values"><span class="ref-card-report-label">Field</span><span class="ref-card-report-value">${escapeHtml(data.field)}</span><span class="ref-card-report-label">Date</span><span class="ref-card-report-value">${escapeHtml(data.dateLabel)}</span></div>
          <div class="ref-card-report-line"><span class="ref-card-report-label">Scheduled Starting Time</span><span class="ref-card-report-value">${escapeHtml(data.timeLabel)}</span></div>
          <div class="ref-card-report-line"><span class="ref-card-report-label">Time Game Started</span><span class="ref-card-report-value"></span></div>
          <div class="ref-card-report-line"><span class="ref-card-report-label">Team Kicking Off</span><span class="ref-card-report-value"></span></div>
          <div class="ref-card-weather"><span class="ref-card-report-label">Weather/Field</span><span>G</span><span>F</span><span>P</span><span>U</span></div>
        </div>
      </div>
      <div class="ref-card-lower">
        <div class="ref-card-roster-wrap">
          <table class="ref-card-roster">
            <colgroup><col style="width:52%"><col style="width:14%"><col style="width:9%"><col style="width:9%"><col style="width:8%"><col style="width:8%"></colgroup>
            <thead><tr><th rowspan="2">Players</th><th rowspan="2">Jersey #</th><th colspan="2">Goals</th><th colspan="2">Cards</th></tr><tr><th>1st half</th><th>2nd half</th><th class="ref-card-yellow">YC</th><th class="ref-card-red">RC</th></tr></thead>
            <tbody>${rosterRows(data)}</tbody>
          </table>
        </div>
        <div class="ref-card-official">
          <div class="ref-card-sports-title">Sportsmanship</div>
          <div class="ref-card-sports-help">Score each category 1-5 with 5 being the highest</div>
          <div class="ref-card-score-line"><span class="ref-card-score-label">Team Name</span><span class="ref-card-score-value"></span></div>
          <div class="ref-card-score-line"><span class="ref-card-score-label">Players</span><span class="ref-card-score-value"></span></div>
          <div class="ref-card-score-line"><span class="ref-card-score-label">Coaches</span><span class="ref-card-score-value"></span></div>
          <div class="ref-card-score-line"><span class="ref-card-score-label">Spectators</span><span class="ref-card-score-value"></span></div>
          <div class="ref-card-report-section-label">Opponent</div>
          <div class="ref-card-score-line"><span class="ref-card-score-label">Players</span><span class="ref-card-score-value"></span></div>
          <div class="ref-card-score-line"><span class="ref-card-score-label">Coaches</span><span class="ref-card-score-value"></span></div>
          <div class="ref-card-report-section-label">Remarks:</div>
          <div class="ref-card-remarks"></div>
          <div class="ref-card-signatures">
            <div class="ref-card-signature-line"><span class="ref-card-signature-label">Winning Team</span><span class="ref-card-signature-value"></span></div>
            <div class="ref-card-final-score"><span class="ref-card-signature-label">Final Score</span><span class="ref-card-signature-value"></span><span class="ref-card-score-to">to</span><span class="ref-card-signature-value"></span></div>
            <div class="ref-card-signature-line"><span class="ref-card-signature-label">Referee Name</span><span class="ref-card-signature-value"></span></div>
            <div class="ref-card-signature-line"><span class="ref-card-signature-label">Linesman 1</span><span class="ref-card-signature-value"></span></div>
            <div class="ref-card-signature-line"><span class="ref-card-signature-label">Linesman 2</span><span class="ref-card-signature-value"></span></div>
          </div>
        </div>
      </div>
    </div>`;
  }

  function safeFilePart(value){return text(value).replace(/[^a-z0-9 _-]/gi,"").replace(/\s+/g,"_").replace(/^_+|_+$/g,"")||"Opponent";}
  function fileBase(data){return `SKOR_FC_vs_${safeFilePart(data.opponent)}_${data.dateInput||"Game"}_Ref_Game_Card`;}

  function xmlElements(parent,localName){return Array.from(parent.getElementsByTagNameNS(EXCEL_NS,localName));}
  function xmlElement(doc,localName){return doc.createElementNS(EXCEL_NS,`x:${localName}`);}
  function findCell(doc,address){return xmlElements(doc,"c").find(cell=>cell.getAttribute("r")===address)||null;}
  function findRow(doc,rowNumber){return xmlElements(doc,"row").find(row=>Number(row.getAttribute("r"))===Number(rowNumber))||null;}
  function findColumn(doc,columnNumber){return xmlElements(doc,"col").find(column=>Number(column.getAttribute("min"))<=columnNumber&&Number(column.getAttribute("max"))>=columnNumber)||null;}
  function setColumnWidth(doc,columnNumber,width){
    const column=findColumn(doc,columnNumber);
    if(!column)throw new Error(`Excel template column ${columnNumber} is missing.`);
    column.setAttribute("width",String(width));column.setAttribute("customWidth","1");
  }
  function applyExcelRosterLayout(doc){
    setColumnWidth(doc,1,12.5);setColumnWidth(doc,2,32.08203125);setColumnWidth(doc,3,8.5);
    [3,4,5,6,7].forEach(row=>{const label=findCell(doc,`A${row}`);if(label)label.setAttribute("s","32");});
    for(let rowNumber=11;rowNumber<=36;rowNumber++){
      const row=findRow(doc,rowNumber);if(!row)throw new Error(`Excel template row ${rowNumber} is missing.`);
      row.setAttribute("ht","18.5");row.setAttribute("customHeight","1");
      const sequence=findCell(doc,`A${rowNumber}`);
      if(sequence)sequence.setAttribute("s",sequence.getAttribute("s")==="31"?"47":"52");
    }
  }
  function cellAddressParts(address){
    const match=String(address||"").match(/^([A-Z]+)(\d+)$/);
    if(!match)throw new Error(`Invalid Excel cell address ${address}.`);
    return {column:match[1],row:Number(match[2])};
  }
  function columnNumber(label){return [...label].reduce((total,char)=>(total*26)+char.charCodeAt(0)-64,0);}
  function ensureCell(doc,address){
    const existing=findCell(doc,address);if(existing)return existing;
    const target=cellAddressParts(address),row=xmlElements(doc,"row").find(node=>Number(node.getAttribute("r"))===target.row);
    if(!row)throw new Error(`Excel template row ${target.row} is missing.`);
    const sameColumn=xmlElements(doc,"c").map(cell=>({cell,parts:cellAddressParts(cell.getAttribute("r"))}))
      .filter(item=>item.parts.column===target.column&&item.cell.hasAttribute("s"))
      .sort((a,b)=>Math.abs(a.parts.row-target.row)-Math.abs(b.parts.row-target.row));
    const cell=xmlElement(doc,"c");cell.setAttribute("r",address);
    if(sameColumn[0])cell.setAttribute("s",sameColumn[0].cell.getAttribute("s"));
    const targetColumn=columnNumber(target.column);
    const nextCell=Array.from(row.children).find(child=>child.localName==="c"&&columnNumber(cellAddressParts(child.getAttribute("r")).column)>targetColumn);
    row.insertBefore(cell,nextCell||null);
    return cell;
  }
  function clearCellValue(cell){
    Array.from(cell.children).filter(child=>["v","is","f"].includes(child.localName)).forEach(child=>child.remove());
    cell.removeAttribute("t");
  }
  function setCellText(doc,address,value){
    const clean=String(value??"");
    let cell=findCell(doc,address);if(!cell&&!clean)return;
    cell=cell||ensureCell(doc,address);clearCellValue(cell);
    if(!clean)return;
    cell.setAttribute("t","inlineStr");
    const inline=xmlElement(doc,"is"),node=xmlElement(doc,"t");
    node.setAttributeNS("http://www.w3.org/XML/1998/namespace","xml:space","preserve");
    node.textContent=clean;inline.appendChild(node);cell.appendChild(inline);
  }
  function setCellNumber(doc,address,value){
    const blank=value===null||value===undefined||value==="";
    let cell=findCell(doc,address);if(!cell&&blank)return;
    cell=cell||ensureCell(doc,address);clearCellValue(cell);
    if(blank)return;
    const node=xmlElement(doc,"v");node.textContent=String(value);cell.appendChild(node);
  }

  function applyPrintSettings(sheetDoc){
    const rootNode=sheetDoc.documentElement;
    let sheetPr=xmlElements(sheetDoc,"sheetPr")[0];
    if(!sheetPr){sheetPr=xmlElement(sheetDoc,"sheetPr");rootNode.insertBefore(sheetPr,rootNode.firstElementChild);}
    let setupPr=xmlElements(sheetPr,"pageSetUpPr")[0];
    if(!setupPr){setupPr=xmlElement(sheetDoc,"pageSetUpPr");sheetPr.appendChild(setupPr);}
    setupPr.setAttribute("fitToPage","1");
    setupPr.setAttribute("autoPageBreaks","0");
    ["printOptions","pageMargins","pageSetup"].forEach(name=>xmlElements(sheetDoc,name).forEach(node=>node.remove()));
    const tableParts=xmlElements(sheetDoc,"tableParts")[0]||null;
    const printOptions=xmlElement(sheetDoc,"printOptions");printOptions.setAttribute("horizontalCentered","1");
    const margins=xmlElement(sheetDoc,"pageMargins");
    Object.entries({left:"0.18",right:"0.18",top:"0.18",bottom:"0.18",header:"0",footer:"0"}).forEach(([key,value])=>margins.setAttribute(key,value));
    const setup=xmlElement(sheetDoc,"pageSetup");
    Object.entries({paperSize:"1",orientation:"landscape",fitToWidth:"1",fitToHeight:"1",pageOrder:"overThenDown",usePrinterDefaults:"0"}).forEach(([key,value])=>setup.setAttribute(key,value));
    rootNode.insertBefore(printOptions,tableParts);
    rootNode.insertBefore(margins,tableParts);
    rootNode.insertBefore(setup,tableParts);
  }

  function applyWorkbookPrintArea(workbookDoc){
    const rootNode=workbookDoc.documentElement;
    const sheets=xmlElements(workbookDoc,"sheets")[0];
    xmlElements(workbookDoc,"sheet").forEach(sheet=>{
      if(sheet.getAttribute("name")==="Roster sheet")sheet.setAttribute("state","hidden");
    });
    let definedNames=xmlElements(workbookDoc,"definedNames")[0];
    if(!definedNames){definedNames=xmlElement(workbookDoc,"definedNames");rootNode.insertBefore(definedNames,sheets?.nextSibling||null);}
    xmlElements(definedNames,"definedName").filter(node=>node.getAttribute("name")==="_xlnm.Print_Area").forEach(node=>node.remove());
    const printArea=xmlElement(workbookDoc,"definedName");
    printArea.setAttribute("name","_xlnm.Print_Area");printArea.setAttribute("localSheetId","0");printArea.setAttribute("hidden","1");
    printArea.textContent="'Template'!$A$1:$L$36";definedNames.appendChild(printArea);
  }

  async function buildExcelBlob(data,{fetchImpl=root.fetch,JSZipImpl=root.JSZip}={}){
    if(!JSZipImpl)throw new Error("Excel export library did not load. Refresh the page and try again.");
    const response=await fetchImpl(EXCEL_TEMPLATE,{cache:"no-store"});
    if(!response.ok)throw new Error("Could not load the referee-card Excel template.");
    const zip=await JSZipImpl.loadAsync(await response.arrayBuffer());
    const parser=new DOMParser(),serializer=new XMLSerializer();
    const sheetFile=zip.file("xl/worksheets/sheet1.xml"),workbookFile=zip.file("xl/workbook.xml");
    if(!sheetFile||!workbookFile)throw new Error("The referee-card Excel template is incomplete.");
    const sheetDoc=parser.parseFromString(await sheetFile.async("string"),"application/xml");
    const workbookDoc=parser.parseFromString(await workbookFile.async("string"),"application/xml");
    if(sheetDoc.querySelector("parsererror")||workbookDoc.querySelector("parsererror"))throw new Error("The referee-card Excel template could not be read.");
    applyExcelRosterLayout(sheetDoc);
    setCellText(sheetDoc,"B3",data.teamName);setCellText(sheetDoc,"B4",data.teamColors);setCellText(sheetDoc,"B5",data.coach);setCellText(sheetDoc,"B6",data.opponent);
    setCellText(sheetDoc,"I3",data.field);setCellText(sheetDoc,"L3",data.dateLabel);setCellText(sheetDoc,"J4",data.timeLabel);setCellText(sheetDoc,"J5","");setCellText(sheetDoc,"J6","");
    for(let index=0;index<CARD_CAPACITY;index++){
      const row=11+index,player=data.players[index];
      setCellNumber(sheetDoc,`A${row}`,index+1);setCellText(sheetDoc,`B${row}`,player?.name||"");setCellNumber(sheetDoc,`C${row}`,player?.number??"");
      ["D","E","F","G"].forEach(column=>setCellText(sheetDoc,`${column}${row}`,""));
    }
    applyPrintSettings(sheetDoc);applyWorkbookPrintArea(workbookDoc);
    zip.file("xl/worksheets/sheet1.xml",serializer.serializeToString(sheetDoc));
    zip.file("xl/workbook.xml",serializer.serializeToString(workbookDoc));
    return zip.generateAsync({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",compression:"DEFLATE"});
  }

  const api={CARD_CAPACITY,buildCardData,validateCardData,buildCardMarkup,fileBase,selectedSquadIds,formatDateLabel,formatTimeLabel,opponentFor,buildExcelBlob};
  if(typeof module!=="undefined"&&module.exports)api.__test={setCellText,setCellNumber,findCell,applyExcelRosterLayout,applyPrintSettings};
  root.SKORRefGameCard=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof document==="undefined")return;

  const dialog=document.getElementById("refGameCardDialog"),openBtn=document.getElementById("openRefGameCardBtn");
  if(!dialog||!openBtn)return;
  const preview=document.getElementById("refGameCardPreview"),previewShell=document.getElementById("refGameCardPreviewShell");
  const status=document.getElementById("refGameCardStatus"),summary=document.getElementById("refGameCardSummary");
  const excelBtn=document.getElementById("downloadRefGameCardExcel"),printBtn=document.getElementById("printRefGameCard");
  const fieldIds=["Opponent","Date","Field","Time","Coach","Colors"];
  const inputs=Object.fromEntries(fieldIds.map(name=>[name,document.getElementById(`refCard${name}`)]));
  let currentData=null;

  function currentEdits(){return {opponent:inputs.Opponent.value,dateInput:inputs.Date.value,field:inputs.Field.value,timeInput:inputs.Time.value,coach:inputs.Coach.value,teamColors:inputs.Colors.value,eventLabel:window.SKORLineup?.getEventLabel?.()||""};}
  function sourceData(edits={}){return buildCardData({state:window.SKORLineup?.getState?.()||{},roster:window.SKORLineup?.getRoster?.()||[],match:window.SKORLineup?.getSelectedMatch?.()||null,edits});}

  function fitPreview(){
    if(!preview||!previewShell)return;
    const available=Math.max(260,previewShell.clientWidth-20),scale=Math.min(1,available/1008);
    preview.style.transform=`scale(${scale})`;previewShell.style.height=`${Math.ceil(768*scale)+20}px`;
  }

  function render(){
    currentData=sourceData(currentEdits());
    const check=validateCardData(currentData);
    preview.innerHTML=buildCardMarkup(currentData);
    const tempCount=currentData.players.filter(player=>player.temp).length;
    summary.innerHTML=`<span class="ref-card-summary-pill">${currentData.players.length} player${currentData.players.length===1?"":"s"}</span><span class="ref-card-summary-pill">${tempCount} TEMP</span><span class="ref-card-summary-pill">${currentData.blankRows} blank row${currentData.blankRows===1?"":"s"} for handwriting</span><span class="ref-card-summary-pill">Current lineup board</span>`;
    const messages=check.errors.length?check.errors:check.warnings;
    status.className=`ref-game-card-status visible ${check.errors.length?"error":check.warnings.length?"warning":"ok"}`;
    status.innerHTML=messages.length?messages.map(message=>`<div>${escapeHtml(message)}</div>`).join(""):"Ready to print or download as Excel.";
    excelBtn.disabled=!check.valid;printBtn.disabled=!check.valid;
    requestAnimationFrame(fitPreview);
  }

  function openDialog(){
    const initial=sourceData({eventLabel:window.SKORLineup?.getEventLabel?.()||""});
    inputs.Opponent.value=initial.opponent;inputs.Date.value=initial.dateInput;inputs.Field.value=initial.field;inputs.Time.value=initial.timeInput;inputs.Coach.value=initial.coach;inputs.Colors.value=initial.teamColors;
    render();dialog.showModal();requestAnimationFrame(fitPreview);
  }

  function closeDialog(){dialog.close();}
  document.getElementById("closeRefGameCard")?.addEventListener("click",closeDialog);
  document.getElementById("cancelRefGameCard")?.addEventListener("click",closeDialog);
  openBtn.addEventListener("click",openDialog);
  Object.values(inputs).forEach(input=>input?.addEventListener("input",render));
  window.addEventListener("resize",()=>{if(dialog.open)fitPreview();});

  printBtn.addEventListener("click",()=>{
    render();const check=validateCardData(currentData);if(!check.valid)return;
    const popup=window.open("","_blank");
    if(!popup){status.className="ref-game-card-status visible error";status.textContent="The print window was blocked. Allow pop-ups for this site and try again.";return;}
    const cssUrl=new URL("ref-game-card.css?v=56.3",window.location.href).href;
    popup.document.open();popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(fileBase(currentData))}</title><link rel="stylesheet" href="${escapeHtml(cssUrl)}"></head><body class="ref-card-print-body">${buildCardMarkup(currentData)}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\/script></body></html>`);popup.document.close();
  });

  excelBtn.addEventListener("click",async()=>{
    render();const check=validateCardData(currentData);if(!check.valid)return;
    const original=excelBtn.textContent;excelBtn.disabled=true;excelBtn.textContent="Building Excel…";
    try{
      const blob=await buildExcelBlob(currentData),url=URL.createObjectURL(blob),anchor=document.createElement("a");
      anchor.href=url;anchor.download=`${fileBase(currentData)}.xlsx`;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
      status.className="ref-game-card-status visible ok";status.textContent="Excel game card downloaded with the official one-page landscape print area.";
    }catch(error){status.className="ref-game-card-status visible error";status.textContent=`Could not build the Excel game card: ${error?.message||error}`;}
    finally{excelBtn.disabled=false;excelBtn.textContent=original;}
  });
})(typeof window!=="undefined"?window:globalThis);
