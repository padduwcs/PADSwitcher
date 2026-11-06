'use strict';
// Drag or Alt+arrow a card to change its position. The card moves through the real
// list while dragging, so its neighbours show the result before the drop.
window.padReorder = (() => {
  const THRESHOLD=6,EDGE=48,SCROLL=12;
  let drag=null;
  const keys=list=>[...list.children].map(el=>el.dataset.reorderId);
  function scrollParent(el){for(let node=el;node;node=node.parentElement){if(node.scrollHeight>node.clientHeight&&/(auto|scroll)/.test(getComputedStyle(node).overflowY))return node;}return document.scrollingElement;}
  function place(y){
    const {list,card}=drag;
    for(const sibling of list.children){
      if(sibling===card)continue;
      const box=sibling.getBoundingClientRect(),middle=box.top+box.height/2;
      if(y<middle){if(card.nextElementSibling!==sibling)list.insertBefore(card,sibling);return;}
    }
    if(list.lastElementChild!==card)list.append(card);
  }
  function finish(commit){
    const {list,card,before,onChange,onEnd,pointerId,move,end,key}=drag;
    drag=null;
    window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);window.removeEventListener('keydown',key,true);
    list.classList.remove('reordering');card.classList.remove('dragging');card.style.transform='';
    if(card.hasPointerCapture?.(pointerId))card.releasePointerCapture(pointerId);
    const after=keys(list);
    if(!commit||after.join()===before.join()){
      const position=new Map(before.map((id,index)=>[id,index]));
      [...list.children].sort((a,b)=>position.get(a.dataset.reorderId)-position.get(b.dataset.reorderId)).forEach(el=>list.append(el));
      onEnd?.();return;
    }
    onChange(after);onEnd?.();
  }
  function attach(list,{enabled=()=>true,onChange,onEnd}){
    if(list.dataset.reorderReady)return;
    list.dataset.reorderReady='1';
    list.addEventListener('pointerdown',event=>{
      const card=event.target.closest('[data-reorder-id]');
      if(!card||event.button!==0||drag||!enabled())return;
      const startX=event.clientX,startY=event.clientY,pointerId=event.pointerId;let started=false;
      const begin=()=>{
        started=true;drag.before=keys(list);drag.offset=startY-card.getBoundingClientRect().top;
        list.classList.add('reordering');card.classList.add('dragging');card.setPointerCapture?.(pointerId);
      };
      const move=moved=>{
        if(moved.pointerId!==pointerId)return;
        if(!started){if(Math.hypot(moved.clientX-startX,moved.clientY-startY)<THRESHOLD)return;begin();}
        place(moved.clientY);
        card.style.transform='';const home=card.getBoundingClientRect();
        card.style.transform=`translateY(${moved.clientY-drag.offset-home.top}px)`;
        const scroller=scrollParent(list),view=scroller===document.scrollingElement?{top:0,bottom:window.innerHeight}:scroller.getBoundingClientRect();
        if(moved.clientY<view.top+EDGE)scroller.scrollTop-=SCROLL;else if(moved.clientY>view.bottom-EDGE)scroller.scrollTop+=SCROLL;
      };
      const end=ended=>{
        if(ended.pointerId!==pointerId)return;
        if(!started){window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);window.removeEventListener('keydown',key,true);drag=null;onEnd?.();return;}
        // The click that ends a drag must not also select the card.
        window.addEventListener('click',swallow,{capture:true,once:true});setTimeout(()=>window.removeEventListener('click',swallow,true));
        finish(ended.type==='pointerup');
      };
      const key=pressed=>{if(pressed.key==='Escape'&&started){pressed.preventDefault();pressed.stopPropagation();finish(false);}};
      drag={list,card,onChange,onEnd,pointerId,move,end,key,before:[],offset:0};
      window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);window.addEventListener('keydown',key,true);
    });
    list.addEventListener('keydown',event=>{
      if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key)||!enabled())return;
      const card=event.target.closest('[data-reorder-id]');if(!card)return;
      const neighbour=event.key==='ArrowUp'?card.previousElementSibling:card.nextElementSibling;
      event.preventDefault();if(!neighbour)return;
      const order=keys(list),from=order.indexOf(card.dataset.reorderId),to=order.indexOf(neighbour.dataset.reorderId);
      [order[from],order[to]]=[order[to],order[from]];onChange(order,card.dataset.reorderId);
    });
  }
  const swallow=event=>{event.preventDefault();event.stopPropagation();};
  return {attach,get dragging(){return !!drag;}};
})();
