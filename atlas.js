window.setupSeoulAtlas=function(road,car,onOpen,onClose,getNetwork,respawn){
 const dialog=document.getElementById('atlas'),canvas=document.getElementById('atlasCanvas'),ctx=canvas.getContext('2d'),button=document.getElementById('atlasButton');
 const label=document.getElementById('atlasPosition'),region=document.getElementById('atlasRegion'),scaleLabel=document.getElementById('atlasScale');
 const colors=['#3a4d57','#59717c','#a7b5b6','#dfb46d','#e9d7a9'];
 const ask=document.getElementById('atlasConfirm'),hint=document.getElementById('atlasHint');
 let metres=5000,center=null,drag=null,prior=null,network=road.network?road:null,pending=null;
 const layer=e=>(e.flags&32)?4:(e.flags&15)<=1?3:(e.flags&15)<=3?2:(e.flags&15)<=5?1:0;
 const atlasPaths=new Map();
 function draw(){
   if(!dialog.open)return;
   const r=canvas.getBoundingClientRect(),w=r.width,h=r.height;if(!w||!h)return;
   const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
   const k=w/metres,c=center||car,px=c.x,pz=c.z;
   ctx.fillStyle='#18292d';ctx.fillRect(0,0,w,h);
   ctx.translate(w/2-px*k,h/2-pz*k);ctx.scale(k,k);ctx.lineJoin='round';ctx.lineCap='round';
   if(road.waterPath){ctx.fillStyle='#274b62';ctx.fill(road.waterPath,'evenodd');}
   const layers=[new Path2D(),new Path2D(),new Path2D(),new Path2D(),new Path2D()];
   if(network){
     const span=network.cellSize,overview=metres>20000,wide=metres>8000;
     for(let i=Math.floor((px-w/2/k)/span)-1;i<=Math.floor((px+w/2/k)/span)+1;i++)for(let j=Math.floor((pz-h/2/k)/span)-1;j<=Math.floor((pz+h/2/k)/span)+1;j++){
       const key=i+','+j,edges=network.grid.get(key);if(!edges)continue;
       if(!atlasPaths.has(key)){const paths=Array.from({length:5},()=>new Path2D());for(const e of edges){const n=layer(e);paths[n].moveTo(e.ax,e.az);paths[n].lineTo(e.bx,e.bz);}atlasPaths.set(key,paths);}
       const paths=atlasPaths.get(key);for(let n=overview?2:wide?1:0;n<5;n++)layers[n].addPath(paths[n]);
     }
   }else{
     for(const route of Object.values(road.allRoutes)){const path=layers[route.points===road.points?3:2];route.points.forEach((p,i)=>i?path.lineTo(p.x,p.z):path.moveTo(p.x,p.z));}
     for(const bridge of road.crossings)bridge.trace.forEach((p,i)=>i?layers[4].lineTo(p.x,p.z):layers[4].moveTo(p.x,p.z));
   }
   layers.forEach((path,i)=>{ctx.lineWidth=[.75,1.05,1.3,2.0,2.25][i]/k;ctx.strokeStyle=colors[i];ctx.stroke(path);});
   ctx.setTransform(dpr,0,0,dpr,0,0);
   if(pending){ctx.strokeStyle='#8ef6f0';ctx.lineWidth=3;ctx.beginPath();ctx.arc(w/2+(pending.x-px)*k,h/2+(pending.z-pz)*k,8,0,2*Math.PI);ctx.stroke();}
   const occupied=[];ctx.font='600 12px "Malgun Gothic", sans-serif';ctx.lineWidth=3;ctx.textAlign='center';
   for(const [name,line] of Object.entries(HAN_BRIDGES)){const q=road.project(...line[Math.floor(line.length/2)]),x=w/2+(q.x-px)*k,y=h/2+(q.z-pz)*k;
     if(x<27||x>w-27||y<20||y>h-8||occupied.some(a=>Math.abs(a[0]-x)<70&&Math.abs(a[1]-y)<20))continue;
     occupied.push([x,y]);ctx.strokeStyle='#22373f';ctx.strokeText(name,x,y);ctx.fillStyle='#e9ddc5';ctx.fillText(name,x,y);
   }
   const mx=w/2+(car.x-px)*k,my=h/2+(car.z-pz)*k;
   ctx.save();ctx.translate(mx,my);ctx.fillStyle='#42d7e330';ctx.beginPath();ctx.arc(0,0,17,0,2*Math.PI);ctx.fill();
   ctx.rotate(Math.atan2(Math.sin(car.yaw),-Math.cos(car.yaw)));ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(8,9);ctx.lineTo(0,5);ctx.lineTo(-8,9);ctx.closePath();ctx.strokeStyle='#092529';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle='#8ef6f0';ctx.fill();ctx.restore();
   const e=road.current;region.textContent=e?(road.labels[e.bn]||e.bridgeLabel||road.labels[e.n]||(e.flags&64?'연결로':'이름 없는 도로')):road.routeName;
   label.textContent=(37.53-car.z/110990).toFixed(5)+'° N  ·  '+(127+car.x/88320).toFixed(5)+'° E';
   const length=10**Math.floor(Math.log10(100/k));const bar=[1,2,5,10].map(v=>v*length).filter(v=>v*k<=110).at(-1)||length;
   scaleLabel.style.width=(bar*k)+'px';scaleLabel.textContent=bar>=1000?(bar/1000)+' km':bar+' m';
 }
 function zoom(f){metres=Math.max(280,Math.min(76000,metres*f));draw();}
 async function toggle(){if(dialog.open){dialog.close();return;}prior=document.activeElement;center=null;metres=5000;onOpen();dialog.showModal();button.setAttribute('aria-expanded','true');draw();
   hint.textContent='도로를 클릭해 리스폰';
   if(!network){hint.textContent='서울 도로를 불러오는 중…';try{network=await getNetwork();hint.textContent='도로를 클릭해 리스폰';draw();}catch{hint.textContent='도로를 불러오지 못했습니다. 지도를 다시 열어 주세요.';}}
 }
 button.onclick=toggle;document.getElementById('atlasClose').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{pending=drag=null;if(ask.open)ask.close();button.setAttribute('aria-expanded','false');onClose();if(prior?.isConnected)prior.focus({preventScroll:true});});
 document.getElementById('atlasPlus').onclick=()=>zoom(.5);document.getElementById('atlasMinus').onclick=()=>zoom(2);
 document.getElementById('atlasHere').onclick=()=>{center=null;metres=1800;draw();};
 document.getElementById('atlasAll').onclick=()=>{const b=network?.bounds||[-26000,-14000,17500,9000],ratio=canvas.clientWidth/canvas.clientHeight;
   center={x:(b[0]+b[2])/2,z:(b[1]+b[3])/2};metres=Math.max(b[2]-b[0],(b[3]-b[1])*ratio)*1.09;draw();};
 canvas.onwheel=e=>{e.preventDefault();zoom(e.deltaY>0?1.32:.76);};
 function pick(clientX,clientY){
   if(!network)return;
   const rect=canvas.getBoundingClientRect(),f=metres/rect.width,c=center||car;
   const x=c.x+(clientX-rect.left-rect.width/2)*f,z=c.z+(clientY-rect.top-rect.height/2)*f;
   const radius=Math.min(110,Math.max(3.5,7*f)),minLayer=metres>20000?2:metres>8000?1:0;
   const choices=[];
   for(const e of network.edgesIn(x-radius,z-radius,x+radius,z+radius)){
     if(layer(e)<minLayer)continue;
     const q=network.projectEdge(e,x,z);if(q.d2<=radius*radius)choices.push(q);
   }
   choices.sort((a,b)=>a.d2-b.d2||layer(b.e)-layer(a.e)||b.e.layer-a.e.layer||a.e.i-b.e.i);
   const q=choices[0];if(!q){hint.textContent='도로 선을 클릭해 주세요.';return;}
   pending=network.respawnPlace(q.e,q.s);
   if(!pending){hint.textContent='이 지점에는 차량을 놓을 공간이 없습니다. 같은 도로의 다른 지점을 클릭해 주세요.';return;}
   if(!road.network){
     const same=road.nearest(pending.x,pending.z);
     const alignment=Math.sin(same.yaw)*q.e.tx+Math.cos(same.yaw)*q.e.tz;
     if(same.distance<4.5&&((q.e.flags&16)?alignment:Math.abs(alignment))>.88&&!(q.e.flags&32))pending.tourStation=same.s;
   }
   const name=network.labels[q.e.bn]||q.e.bridgeLabel||network.labels[q.e.n]||'이름 없는 도로';
   document.getElementById('respawnRoad').textContent=name+(!road.network&&pending.tourStation==null?' · 서울 자유주행':'');
   draw();ask.showModal();document.getElementById('respawnNo').focus();
 }
 canvas.onpointerdown=e=>{if(e.button!==0||!e.isPrimary)return;canvas.setPointerCapture(e.pointerId);
   drag={id:e.pointerId,x:e.clientX,y:e.clientY,cx:(center||car).x,cz:(center||car).z,moved:false};};
 canvas.onpointermove=e=>{if(drag?.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
   if(Math.hypot(dx,dy)>5)drag.moved=true;if(!drag.moved)return;const f=metres/canvas.clientWidth;
   center={x:drag.cx-dx*f,z:drag.cz-dy*f};draw();};
 canvas.onpointerup=e=>{if(drag?.id!==e.pointerId)return;const click=!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<=5;drag=null;if(click)pick(e.clientX,e.clientY);};
 canvas.onpointercancel=()=>drag=null;
 ask.addEventListener('close',()=>{pending=null;draw();});
 document.getElementById('respawnNo').onclick=()=>ask.close();
 document.getElementById('respawnYes').onclick=()=>{if(!pending)return;const target=pending;pending=null;ask.close();dialog.close();respawn(target);};
 canvas.onlostpointercapture=()=>drag=null;new ResizeObserver(draw).observe(canvas);
 window.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;
   if(ask.open){e.stopImmediatePropagation();if(e.code==='Escape'||e.code==='KeyM'){e.preventDefault();ask.close();}return;}
   if(e.code==='KeyM'&&!e.target.matches('input,textarea')){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)toggle();}
   else if(dialog.open){e.stopImmediatePropagation();if(e.code==='Escape'){e.preventDefault();dialog.close();}}
 },true);
 return {draw};
};
