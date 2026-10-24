/* Read-only, explicitly shared event animation. Never loads captain Strategy tables. */
(function(global){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let animation=null,serial=0;
  const num=(v,f=50)=>Number.isFinite(Number(v))?Math.max(0,Math.min(100,Number(v))):f;
  function svg(frame,title=''){
    const player=(p,opponent)=>{const x=40+num(p.x)*5.6,y=50+num(p.y)*4.5,spare=!opponent&&p.keeperNumber!=null&&String(p.keeperNumber)!==String(p.number),starting=String(p.keeperLabel).includes('starting');
      const number=opponent?esc(p.label):spare?`<tspan font-size="${starting?10:15}">${esc(p.number)}</tspan><tspan font-size="10"> / </tspan><tspan font-size="${starting?15:10}">${esc(p.keeperNumber)}</tspan>`:esc(p.number);
      return `<g transform="translate(${x} ${y})"><circle r="${spare?21:15}" fill="${opponent?'#ebedf1':'#7b1738'}" stroke="white" stroke-width="2"/><text y="5" text-anchor="middle" fill="${opponent?'#17191c':'white'}" font-family="Arial" font-size="13" font-weight="bold">${number}</text>${!opponent?`<text y="34" text-anchor="middle" fill="white" font-family="Arial" font-size="11">${esc(p.name)}</text>${p.keeperLabel?`<text y="46" text-anchor="middle" fill="white" font-family="Arial" font-size="8">(${esc(p.keeperLabel)})</text>`:''}`:''}</g>`;};
    const drawings=(frame.drawings||[]).map(d=>{
      const x=40+num(d.x)*5.6,y=50+num(d.y)*4.5,x1=40+num(d.x1)*5.6,y1=50+num(d.y1)*4.5,x2=40+num(d.x2)*5.6,y2=50+num(d.y2)*4.5;
      if(d.type==='text')return `<text x="${x}" y="${y}" fill="#fff9a6" font-family="Arial" font-size="13">${esc(d.text)}</text>`;
      if(d.type==='box')return `<rect x="${Math.min(x1,x2)}" y="${Math.min(y1,y2)}" width="${Math.abs(x2-x1)}" height="${Math.abs(y2-y1)}" fill="#ffe66c22" stroke="#ffe66c" stroke-width="2"/>`;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffe66c" stroke-width="3" ${d.type==='arrow'?'marker-end="url(#duesArrow)"':''}/>`;
    }).join('');
    return `<svg class="dues-animation" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 544" role="img" aria-label="${esc(title)}"><defs><marker id="duesArrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="#ffe66c"/></marker></defs><rect width="640" height="544" fill="#15201a"/><text x="20" y="25" fill="white" font-family="Arial" font-size="16">${esc(title)}</text><rect x="40" y="50" width="560" height="450" fill="#428653" stroke="white" stroke-width="2"/><path d="M40 275H600M245 50V125H395V50M245 500V425H395V500" fill="none" stroke="white" stroke-width="2"/><circle cx="320" cy="275" r="55" fill="none" stroke="white" stroke-width="2"/>${(frame.home||[]).map(p=>player(p,false)).join('')}${(frame.opponents||[]).map(p=>player(p,true)).join('')}${drawings}<circle cx="${40+num(frame.ball?.x)*5.6}" cy="${50+num(frame.ball?.y)*4.5}" r="7" fill="white" stroke="#17191c" stroke-width="2"/></svg>`;
  }
  function interpolate(a,b,t){const mix=(x,y)=>num(x)+(num(y)-num(x))*t;const list=(aa=[],bb=[])=>aa.map(p=>{const q=bb.find(q=>q.id===p.id)||p;return {...p,x:mix(p.x,q.x),y:mix(p.y,q.y)};});return {...(t<.5?a:b),home:list(a.home,b.home),opponents:list(a.opponents,b.opponents),ball:{x:mix(a.ball?.x,b.ball?.x),y:mix(a.ball?.y,b.ball?.y)}};}
  function stop(){serial++;if(animation!==null)global.cancelAnimationFrame(animation);animation=null;}
  function open(strategy,dialog){
    stop();dialog.dataset.eventStrategy=strategy.id;const body=dialog.querySelector('[data-dues-dialog-body]');body.innerHTML=`<h3>${esc(strategy.title)}</h3><label>Scene Bundle<select data-event-bundle>${strategy.scenes.map((s,i)=>`<option value="${i}">${esc(s.name)}</option>`).join('')}</select></label><div data-event-frame></div><p class="dues-animation-label" data-event-label></p><div class="dues-animation-controls"><button type="button" data-event-play>Play</button><button type="button" data-event-prev>Previous step</button><button type="button" data-event-next>Next step</button><button type="button" data-event-gif>Download bundle GIF</button></div><p data-event-status role="status"></p>`;
    const picker=body.querySelector('[data-event-bundle]'),host=body.querySelector('[data-event-frame]'),label=body.querySelector('[data-event-label]'),status=body.querySelector('[data-event-status]');let step=0;
    const scene=()=>strategy.scenes[Number(picker.value)||0],frames=()=>scene()?.subScenes||[];
    function show(index=step){step=Math.max(0,Math.min(index,frames().length-1));const frame=frames()[step];host.innerHTML=frame?svg(frame,scene().name):'<p>No animation steps.</p>';label.textContent=frame?`${step+1} / ${frames().length} · ${frame.name}`:'';}
    picker.onchange=()=>{stop();step=0;show();};body.querySelector('[data-event-prev]').onclick=()=>{stop();show(step-1);};body.querySelector('[data-event-next]').onclick=()=>{stop();show(step+1);};
    body.querySelector('[data-event-play]').onclick=()=>{stop();const token=serial,start=global.performance.now(),ff=frames();if(!ff.length)return;const tick=now=>{if(token!==serial||!dialog.open)return;const elapsed=(now-start)%((ff.length-1)*1500+1000),index=Math.min(ff.length-1,Math.floor(elapsed/1500)),within=elapsed-index*1500;host.innerHTML=svg(index<ff.length-1&&within>1000?interpolate(ff[index],ff[index+1],(within-1000)/500):ff[index],scene().name);label.textContent=`${index+1} / ${ff.length} · ${ff[index].name}`;animation=global.requestAnimationFrame(tick);};animation=global.requestAnimationFrame(tick);};
    body.querySelector('[data-event-gif]').onclick=async e=>{
      stop();const token=serial,button=e.target,ff=frames(),title=scene().name;button.disabled=true;status.textContent='Building GIF on this device…';
      try{const {GIFEncoder,quantize,applyPalette}=await import('./vendor/gifenc/index.js');const gif=GIFEncoder();
        const write=async(frame,delay)=>{if(token!==serial||!dialog.open)throw Error('Export stopped.');const blob=new Blob([svg(frame,title)],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),img=new Image();try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});const canvas=global.document.createElement('canvas');canvas.width=640;canvas.height=544;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,640,544);const rgba=ctx.getImageData(0,0,640,544).data,palette=quantize(rgba,128,{format:'rgb444'});gif.writeFrame(applyPalette(rgba,palette,'rgb444'),640,544,{palette,delay,repeat:0});}finally{URL.revokeObjectURL(url);}};
        for(let i=0;i<ff.length;i++){await write(ff[i],1000);if(i<ff.length-1)for(let k=1;k<=5;k++)await write(interpolate(ff[i],ff[i+1],k/5),100);}
        if(token!==serial||!dialog.open)throw Error('Export stopped.');gif.finish();const link=global.document.createElement('a'),url=URL.createObjectURL(new Blob([gif.bytes()],{type:'image/gif'}));link.href=url;link.download=(title.replace(/[^a-z0-9]+/gi,'-')||'strategy')+'.gif';link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);status.textContent='GIF ready.';
      }catch(err){status.textContent=err.message||'Could not export GIF.';}finally{button.disabled=false;}
    };
    dialog.addEventListener('close',stop,{once:true});dialog.addEventListener('cancel',stop,{once:true});show();if(!dialog.open)dialog.showModal();
  }
  global.SKOREventAnimation={open,stop,svg,interpolate};
})(typeof window==='object'?window:globalThis);
