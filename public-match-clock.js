(function(root){
  "use strict";

  const CURRENT_PHASES=new Set(["first_half","halftime","second_half"]);

  function safeSeconds(value){
    return Math.max(0,Math.floor(Number(value)||0));
  }

  function officialSeconds(clock,now=Date.now()){
    if(!clock)return 0;
    const anchor=safeSeconds(clock.clock_elapsed_seconds);
    if(!clock.clock_running||!clock.clock_started_at)return anchor;
    const startedAt=new Date(clock.clock_started_at).getTime();
    if(!Number.isFinite(startedAt))return anchor;
    return anchor+Math.max(0,Math.floor((now-startedAt)/1000));
  }

  function format(seconds){
    const total=safeSeconds(seconds);
    const minutes=Math.floor(total/60);
    const remainder=total%60;
    return `${String(minutes).padStart(2,"0")}:${String(remainder).padStart(2,"0")}`;
  }

  function phaseLabel(clock){
    const phase=clock?.clock_phase||"not_started";
    if(phase==="first_half")return clock.clock_running?"1st Half":"1st Half · Paused";
    if(phase==="halftime")return "Halftime";
    if(phase==="second_half")return clock.clock_running?"2nd Half":"2nd Half · Paused";
    if(phase==="full_time")return "Full Time";
    return "Not Started";
  }

  function isCurrent(clock){
    return !!clock&&CURRENT_PHASES.has(clock.clock_phase);
  }

  function toMap(rows){
    return new Map((Array.isArray(rows)?rows:[]).filter(row=>row?.match_id).map(row=>[String(row.match_id),row]));
  }

  function render(rootNode=document,clockMap=new Map(),now=Date.now()){
    rootNode.querySelectorAll("[data-official-clock]").forEach(element=>{
      const clock=clockMap.get(String(element.dataset.clockMatch||""));
      const visible=isCurrent(clock);
      element.hidden=!visible;
      element.classList.toggle("is-running",!!clock?.clock_running);
      element.classList.toggle("is-paused",visible&&!clock?.clock_running&&clock?.clock_phase!=="halftime");
      element.classList.toggle("is-halftime",clock?.clock_phase==="halftime");
      if(!visible)return;
      const time=format(officialSeconds(clock,now));
      const phase=phaseLabel(clock);
      const timeNode=element.querySelector("[data-clock-time]");
      const phaseNode=element.querySelector("[data-clock-phase]");
      if(timeNode)timeNode.textContent=time;
      if(phaseNode)phaseNode.textContent=phase;
      element.setAttribute("aria-label",`Official match clock ${time}, ${phase}`);
    });
  }

  root.SKORPublicMatchClock={format,isCurrent,officialSeconds,phaseLabel,render,toMap};
})(typeof window!=="undefined"?window:globalThis);
