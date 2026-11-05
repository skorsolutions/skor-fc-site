(function(root){
  'use strict';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

  // Like Strategy, use Pointer Events for immediate mouse, pen and touch movement.
  // Preview in the DOM; commit through the lineup's existing placement/save path.
  function mount({pitch,getContext,getPosition,onPlace,bench,onBench}){
    let drag=null,suppressClick=false;
    const listeners=[];
    function listen(node,event,handler,options){
      if(!node?.addEventListener)return;
      node.addEventListener(event,handler,options);
      listeners.push(()=>node.removeEventListener(event,handler,options));
    }
    function valid(current){
      const context=getContext(),position=getPosition(current.pid);
      return context.canMove&&context.freeform&&context.board===current.context.board&&
        context.event===current.context.event&&context.captain===current.context.captain&&
        pitch.contains(current.marker)&&position===current.position&&
        position.x===current.start.x&&position.y===current.start.y;
    }
    function release(current){
      current.marker.classList.remove('freeform-moving');
      if(pitch.hasPointerCapture?.(current.pointerId))pitch.releasePointerCapture(current.pointerId);
    }
    function cancel(){
      if(!drag)return;
      const current=drag;drag=null;
      current.marker.style.left=current.start.x+'%';
      current.marker.style.top=current.start.y+'%';
      suppressClick=current.moved;
      release(current);
    }
    function update(event){
      if(!drag||event.pointerId!==drag.pointerId)return;
      if(!valid(drag)){cancel();return;}
      if(!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY))return;
      if(!drag.moved&&Math.hypot(event.clientX-drag.clientX,event.clientY-drag.clientY)<4)return;
      const rect=pitch.getBoundingClientRect();
      if(!(rect.width>0&&rect.height>0)){cancel();return;}
      if(!drag.moved){
        drag.moved=true;
        drag.marker.classList.add('freeform-moving');
        pitch.setPointerCapture?.(event.pointerId);
      }
      drag.point={
        x:clamp((event.clientX-rect.left)/rect.width*100+drag.offset.x,5,95),
        y:clamp((event.clientY-rect.top)/rect.height*100+drag.offset.y,8,92)
      };
      drag.marker.style.left=drag.point.x+'%';
      drag.marker.style.top=drag.point.y+'%';
      event.preventDefault();
    }
    listen(pitch,'pointerdown',event=>{
      if(drag)return;
      suppressClick=false;
      if(event.isPrimary===false||(event.button!=null&&event.button!==0))return;
      const marker=event.target.closest?.('.freeform-player');
      if(!marker||!pitch.contains(marker))return;
      const context=getContext(),pid=marker.dataset.v28Player,position=getPosition(pid);
      if(!context.canMove||!context.freeform||!position)return;
      const rect=pitch.getBoundingClientRect();
      if(!(rect.width>0&&rect.height>0))return;
      drag={marker,pid,position,context,pointerId:event.pointerId,
        start:{x:position.x,y:position.y},clientX:event.clientX,clientY:event.clientY,
        offset:{x:position.x-(event.clientX-rect.left)/rect.width*100,
          y:position.y-(event.clientY-rect.top)/rect.height*100},moved:false};
    });
    listen(pitch,'pointermove',update);
    listen(pitch,'pointerup',event=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      update(event);
      if(!drag)return;
      const current=drag;drag=null;
      suppressClick=current.moved;
      release(current);
      if(!current.moved||!valid(current))return;
      const rect=bench?.getBoundingClientRect();
      if(rect&&rect.width>0&&rect.height>0&&event.clientX>=rect.left&&event.clientX<=rect.right&&
        event.clientY>=rect.top&&event.clientY<=rect.bottom&&onBench){onBench(current.pid);return;}
      onPlace(current.pid,current.point.x,current.point.y);
    });
    listen(pitch,'pointercancel',event=>{if(drag?.pointerId===event.pointerId)cancel();});
    // Touch starts with implicit capture on the shirt. Ignore its bubbling loss
    // when capture transfers to the pitch; only losing our explicit capture cancels.
    listen(pitch,'lostpointercapture',event=>{if(event.target===pitch&&drag?.pointerId===event.pointerId)cancel();});
    listen(pitch,'click',event=>{
      // Consume the release click so dragging cannot reselect or place a player twice.
      // Keyboard activation and the next deliberate pointer gesture still work.
      if(!suppressClick||event.detail===0)return;
      suppressClick=false;event.preventDefault();event.stopImmediatePropagation();
    },true);
    listen(pitch,'dragstart',event=>{if(event.target.closest?.('.freeform-player'))event.preventDefault();});
    listen(root,'blur',cancel);
    listen(root.document,'visibilitychange',()=>{if(root.document.hidden)cancel();});
    return {cancel,destroy(){cancel();listeners.splice(0).forEach(remove=>remove());}};
  }
  const api={mount};root.SKORLineupFreeMove=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
