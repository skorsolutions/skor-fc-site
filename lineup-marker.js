(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function parts(value,starting=false){
    const values=String(value??'').split(/\s*\/\s*/);
    return values.map((text,i)=>({text,minor:values.length===2&&(starting?i===0:i===1)}));
  }
  function numberHtml(value,starting=false){
    const numbers=parts(value,starting);
    if(numbers.length!==2)return esc(value);
    return '<span class="keeper-number-pair" aria-label="'+esc(value)+'">'+numbers.map(p=>'<span class="'+(p.minor?'keeper-number-minor':'keeper-number-major')+'">'+esc(p.text)+'</span>').join('<span class="keeper-number-slash">/</span>')+'</span>';
  }
  function numberSvg(value,starting,x,y,large=32,small=12,separator=small){
    const numbers=parts(value,starting);
    return '<text class="marker-number" aria-label="'+esc(value)+'" x="'+x+'" y="'+y+'" text-anchor="middle" fill="#fff" font-weight="950" font-family="Arial, Helvetica, sans-serif">'+numbers.map(p=>'<tspan class="'+(p.minor?'keeper-number-minor':'keeper-number-major')+'" font-size="'+(p.minor?small:large)+'">'+esc(p.text)+'</tspan>').join('<tspan font-size="'+separator+'"> / </tspan>')+'</text>';
  }
  function displayName(name,temp){
    const text=String(name??'').trim();
    return temp?text.replace(/\s*(?:[-–—·]\s*TEMP|\(\s*TEMP\s*\))\s*$/i,'').trim()||text:text;
  }
  function shortName(name,temp){return displayName(name,temp).split(/\s+/)[0]||'Player';}
  function nameHtml(name,temp,showTag=true){return '<span class="marker-name-text">'+esc(shortName(name,temp))+'</span>'+(temp&&showTag?'<small class="marker-temp">TEMP</small>':'');}
  function nameLines(name,temp,max=14){
    const words=shortName(name,temp).split(/\s+/),lines=[];let line='';
    words.forEach(word=>{
      while(word.length>max){if(line){lines.push(line);line='';}lines.push(word.slice(0,max));word=word.slice(max);}
      if(line&&(line+' '+word).length>max){lines.push(line);line='';}
      line+=(line?' ':'')+word;
    });
    if(line)lines.push(line);return lines.length?lines:[''];
  }
  function builderPositions(shape){
    const result=shape.map(([role,x,y])=>[role,x,y]);
    const rows=[];
    [...result].sort((a,b)=>a[2]-b[2]).forEach(point=>{
      let row=rows[rows.length-1];
      if(!row||point[2]-row[0][2]>10){row=[];rows.push(row);}
      row.push(point);
    });
    rows.forEach(row=>{
      if(row.length<3)return;
      row.sort((a,b)=>a[1]-b[1]);
      const gap=Math.min(...row.slice(1).map((p,i)=>p[1]-row[i][1]));
      if(gap>=24)return;
      row.forEach((p,i)=>{p[1]=10+i*80/(row.length-1);});
    });
    // Display-only row bands; saved slots and exported formation coordinates stay canonical.
    rows.forEach((row,i)=>row.forEach(p=>{p[2]=rows.length===1?50:10+i*78/(rows.length-1);}));
    return result;
  }
  function builderScale(markers,width,height,gap=4){
    if(!(width>0&&height>0))return 1;
    let scale=Math.min(1,width/480);
    markers.forEach(p=>{
      const halfW=p.width/2+gap,halfH=p.height/2+gap;
      scale=Math.min(scale,p.x*width/100/halfW,(100-p.x)*width/100/halfW,p.y*height/100/halfH,(100-p.y)*height/100/halfH);
    });
    markers.forEach((a,i)=>markers.slice(i+1).forEach(b=>{
      const clearX=Math.abs(a.x-b.x)*width/100/((a.width+b.width)/2+gap);
      const clearY=Math.abs(a.y-b.y)*height/100/((a.height+b.height)/2+gap);
      scale=Math.min(scale,Math.max(clearX,clearY));
    }));
    return Math.max(0,scale);
  }
  const api={parts,numberHtml,numberSvg,displayName,shortName,nameHtml,nameLines,builderPositions,builderScale};root.SKORLineupMarker=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
