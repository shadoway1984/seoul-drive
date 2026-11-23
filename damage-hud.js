window.createDamageDisplay=function(root){
  const zones=Array.from(root.querySelectorAll("[data-part]")), summary=root.querySelector(".damage-summary"), detail=root.querySelector(".damage-detail");
  const wheels=["fr","fl","rr","rl"];
  let lastState, revision=-1;
  return function update(car){
    if(lastState===car.damage&&revision===car.damage.revision)return;
    lastState=car.damage;revision=car.damage.revision;
    const severity={};
    for(const h of Object.values(car.damage.zones)){
      const end=h.z>0?"front":"rear", side=h.x>=0?"l":"r";
      const name=Math.abs(h.z)>1.58?(Math.abs(h.x)<.39?end:end+"-"+side):"side-"+side;
      severity[name]=Math.max(severity[name]||0,h.depth/.78);
    }
    car.wheels.forEach((w,i)=>{severity[wheels[i]]=w.damage;});
    let worst=0,part="";
    for(const el of zones){
      const val=severity[el.dataset.part]||0;
      el.dataset.level=val>=.61?"heavy":val>=.20?"medium":val>0?"light":"ok";
      if(val>worst){worst=val;part=el.dataset.name;}
    }
    const level=worst>=.61?"심각":worst>=.20?"손상":worst>0?"경미":"정상";
    summary.textContent=level;detail.textContent=part||"차체 · 타이어";
    root.dataset.level=worst>=.61?"heavy":worst>0?"alert":"ok";
    root.setAttribute("aria-label","차량 손상 상태 "+level+(part?" · "+part:""));
  };
};