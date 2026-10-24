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
  function numberSvg(value,starting,x,y,large=32,small=12){
    const numbers=parts(value,starting);
    return '<text class="marker-number" aria-label="'+esc(value)+'" x="'+x+'" y="'+y+'" text-anchor="middle" fill="#fff" font-weight="950" font-family="Arial, Helvetica, sans-serif">'+numbers.map(p=>'<tspan class="'+(p.minor?'keeper-number-minor':'keeper-number-major')+'" font-size="'+(p.minor?small:large)+'">'+esc(p.text)+'</tspan>').join('<tspan font-size="'+small+'"> / </tspan>')+'</text>';
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
  const api={parts,numberHtml,numberSvg,displayName,shortName,nameHtml,nameLines};root.SKORLineupMarker=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
