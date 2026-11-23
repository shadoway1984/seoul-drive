import * as T from "./three.module.min.js";
const $=id=>document.getElementById(id);
const routeQuery=new URLSearchParams(location.search);
const freeDrive=routeQuery.get("tour")!=="1"&&(!routeQuery.has("at")||routeQuery.get("route")==="city");
const courseId=Object.hasOwn(HAN_ROUTES,routeQuery.get("route"))?routeQuery.get("route"):"sW";
let road=createHanWorld(courseId),car;
const endpoints={nE:["가양대교","토평IC"],nW:["토평IC","가양대교"],sW:["강일IC 동측","행주대교"],sE:["행주대교","강일IC 동측"]};
const endpoint=endpoints[courseId],km=n=>(n/1000).toFixed(1);
let departure=road.stops.find(x=>x.name.startsWith("반포대교"))?.s||8;
const requested=Number(routeQuery.get("at"));if(routeQuery.has("at")&&Number.isFinite(requested))departure=Math.min(road.length-8,Math.max(8,requested));
let roadView,cityView;
function setDeparture(s){departure=s;reset();}
function setupRoute(){
 for(const badge of document.querySelectorAll(".roadno"))badge.textContent=road.ref;
 $("roadTitle").textContent=road.routeName;$("course").value=freeDrive?"city":courseId;
 $("course").onchange=e=>{const u=new URL(location.href);u.searchParams.set("route",e.target.value);if(e.target.value==="city")u.searchParams.delete("tour");else u.searchParams.set("tour","1");u.searchParams.delete("at");location.assign(u.href);};
 for(const [i,stop] of road.stops.entries()){const op=new Option(freeDrive?stop.name:stop.name+" · "+km(stop.s)+" km",String(stop.s));$("origin").add(op);}
 if(!Array.from($("origin").options).some(o=>Math.abs(Number(o.value)-departure)<.01))$("origin").add(new Option(km(departure)+" km 지점",String(departure)));
 $("origin").value=String(departure);$("origin").onchange=e=>setDeparture(Number(e.target.value));
 $("courseChange").onclick=()=>{panel(false);reset();};
 document.title=road.routeName+" · 서울드라이브";
}
let mode="loading",cameraMode=0,quality="ultra",audioOn=true,noticeTimer,elapsed=0,totalTime=0;
let skinDamage,reportedDamage,reportedRevision=0;
function damageNotice(){
  const state=car.damage;
  if(state!==reportedDamage){reportedDamage=state;reportedRevision=0;}
  if(reportedRevision===state.revision)return;
  reportedRevision=state.revision;
  const h=state.last;
  const end=h.z>1.12?"앞":h.z< -1.12?"뒤":"";
  const side=h.x>.36?"왼쪽":h.x<-.36?"오른쪽":"";
  const part=side ? side+" "+(end?end+" 모서리":"측면") : (end?end+" 범퍼":"차체");
  note(part+(h.depth>.35?" 크게 파손":h.depth>.10?" 찌그러짐":" 가벼운 접촉"));
}
let renderer,scene,camera,vehicle,cockpit,sky,traffic,shadow;
const keys=new Set(),touch=new Set(),current=new T.Vector3(),aim=new T.Vector3(),focus=new T.Vector3();
const bars=Array.from({length:27},()=>{let el=document.createElement("i");$("rev").append(el);return el;});
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
function setMode(m){mixer?.horn(false);mixer?.quiet();exhaust.reset();mode=m;document.body.dataset.mode=m;keys.clear();touch.clear();document.querySelectorAll("#touch .active").forEach(e=>e.classList.remove("active"));}
function note(t){$("status").textContent=t;$("status").classList.add("show");clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$("status").classList.remove("show"),1500);}
function showIntro(title,button){$("introTitle").textContent=title;$("startText").textContent=button;}
function start(){if(mode==="loading"||mode==="error")return;if(mode==="finished")reset();setMode("driving");$("panel").hidden=true;$("settings").setAttribute("aria-expanded","false");if(audioOn)ensureAudio();$("start").blur();}
function pause(){if(mode!=="driving")return;setMode("paused");showIntro("일시정지","계속 주행");}
function reset(place){endOrbitDrag();$("status").classList.remove("show");if(place?.e)road.current=place.e;
 car.reset(place?place.s:freeDrive?road.spawn(departure):departure);if(place?.e){car.lateral=place.lane;const p=road.at(place.e,place.s,place.lane);car.x=p.x;car.z=p.z;}
 traffic?.reset(car.s);roadView?.update(car.s,car.lateral);cityView?.update(car.s);elapsed=0;totalTime=0;setMode("ready");$("introSpec").textContent=freeDrive?"서울 자동차 도로망　·　M 전체 지도":endpoint[0]+" → "+endpoint[1]+"　·　"+km(road.length)+" km";showIntro(road.routeName,"주행 시작");positionCar(1,true);telemetry();}
function setView(value){endOrbitDrag();cameraMode=Number(value);$("camera").value=String(cameraMode);positionCar(1,true);note(["후방 추적 시점","운전석 시점","보닛 시점"][cameraMode]);}
function qualityApply(){if(!renderer)return;const factor={ultra:Math.min(window.devicePixelRatio||1,2.25),high:Math.min(window.devicePixelRatio||1,1.4),balanced:.8}[quality];
 const budget={ultra:8294400,high:3686400,balanced:1600000}[quality];renderer.setPixelRatio(Math.min(factor,Math.sqrt(budget/(innerWidth*innerHeight))));renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
function panel(open){$("panel").hidden=!open;$("settings").setAttribute("aria-expanded",String(open));if(open&&mode==="driving")pause();}
$("start").onclick=start;$("hold").onclick=pause;$("settings").onclick=()=>panel($("panel").hidden);$("close").onclick=()=>panel(false);
$("quality").onchange=e=>{quality=e.target.value;qualityApply();};$("camera").onchange=e=>setView(e.target.value);$("view").onclick=()=>setView((cameraMode+1)%3);
$("restart").onclick=()=>{panel(false);reset();start();};$("full").onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{note("이 브라우저에서는 전체 화면이 제한됩니다");}};
$("mapDownload").onclick=e=>{e.preventDefault();const data={license:"ODbL-1.0",buildings:"Overture Maps 2026-08-19, OpenStreetMap contributors, Qian Shi et al. East Asian Buildings (CC BY 4.0)",roadsAndWater:"OpenStreetMap contributors",geometry:"Block values are base64 gzip JSON; b=[height dm,min height dm,facade,rings], r=[width dm,x1,z1,x2,z2]. Horizontal integer positions in quarter metres. Longitude=127+x/4/88320, latitude=37.53-z/4/110990. Water is WGS84.",blocks:SEOUL_BLOCKS,water:HAN_WATER,osmDriveGraph:SEOUL_DRIVE_GRAPH,osmBuildings:SEOUL_CITY_BLOCKS};const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download="Seoul-Drive-map.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);};
const exhaust=createAvanteExhaust();
let ctx,mixer;
function ensureAudio(){try{if(!ctx){ctx=new AudioContext();mixer=createSeoulSound(ctx);}ctx.resume().catch(()=>{});}catch{audioOn=false;}}
function toggleAudio(){audioOn=!audioOn;if(audioOn)ensureAudio();else mixer?.quiet();$("sound").setAttribute("aria-pressed",String(audioOn));$("soundIcon").setAttribute("href",audioOn?"#vol":"#silent");note(audioOn?"주행음 켜짐":"주행음 꺼짐");}
$("sound").onclick=toggleAudio;
function syncAudio(gas,dt){
 const kind=Number($("motorSound").value),driving=mode==="driving";
 const shot=exhaust.step(car,gas,dt,driving&&kind===0);
 vehicle?.setExhaustPulse?.(shot.glow);
 mixer?.update(car,traffic?.cars||[],kind,gas,audioOn&&driving,shot.pulse,cameraMode===1);
 if(car.pendingContact&&audioOn&&driving)mixer?.impact(car.pendingContact.material,car.pendingContact.dv);
 car.pendingContact=null;
}
$("gear").onclick=()=>{if(mode==="driving")direction();};
function direction(){note(car.changeDirection()?(car.forward?"전진 기어":"후진 기어"):"정차 후 전환할 수 있습니다");}
window.addEventListener("keydown",e=>{if(e.target.matches("select,input")||e.target.closest("#routeChooser")&&e.code==="Space")return;const k=e.code;
 if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space"].includes(k))e.preventDefault();
 if(!e.repeat){if(k==="Escape"){if(!$("panel").hidden)panel(false);else if(mode==="driving")pause();else if(mode==="paused")start();}
 if(k==="KeyC"&&vehicle)setView((cameraMode+1)%3);if(k==="KeyN")toggleAudio();if(k==="KeyR"&&mode==="driving")direction();
 if(k==="KeyH"&&mode==="driving"&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();ensureAudio();mixer?.horn(true);}
 if((k==="Enter"||k==="Space")&&mode!=="driving"&&$("panel").hidden&&!(e.target instanceof HTMLButtonElement))start();}
 keys.add(k);});window.addEventListener("keyup",e=>{keys.delete(e.code);if(e.code==="KeyH")mixer?.horn(false);});window.addEventListener("blur",()=>{keys.clear();touch.clear();pause();});document.addEventListener("visibilitychange",()=>{if(document.hidden)pause();});
for(const btn of document.querySelectorAll("[data-control]")){const control=btn.dataset.control;btn.onpointerdown=e=>{e.preventDefault();btn.setPointerCapture(e.pointerId);touch.add(control);btn.classList.add("active");};btn.onlostpointercapture=btn.onpointercancel=btn.onpointerup=()=>{touch.delete(control);btn.classList.remove("active");};}
let oldPadStart=false,oldPadView=false,oldPadReverse=false;
function inputs(){if($("atlas").open)return {gas:0,brake:0,steer:0,analog:false};let pad;try{pad=Array.from(navigator.getGamepads?.()||[]).find(Boolean);}catch{}
 const axis=pad?.axes[0]||0,analog=Math.abs(axis)>.11;const stick=analog?-Math.sign(axis)*(Math.abs(axis)-.11)/.89:0;
 const down=(a,b,c)=>keys.has(a)||keys.has(b)||touch.has(c)?1:0;
 const btn=i=>pad?.buttons[i]?.pressed||false;
 if(btn(9)&&!oldPadStart){if(mode==="driving")pause();else start();}if(btn(3)&&!oldPadView)setView((cameraMode+1)%3);if(btn(2)&&!oldPadReverse&&mode==="driving")direction();oldPadStart=btn(9);oldPadView=btn(3);oldPadReverse=btn(2);
 return {gas:Math.max(down("KeyW","ArrowUp","gas"),pad?.buttons[7]?.value||0),brake:Math.max(down("KeyS","ArrowDown","brake"),keys.has("Space")?1:0,pad?.buttons[6]?.value||0),steer:clamp(down("KeyA","ArrowLeft","left")-down("KeyD","ArrowRight","right")+stick,-1,1),analog};}
function groundShadow(){let c=document.createElement("canvas");c.width=c.height=128;let g=c.getContext("2d"),r=g.createRadialGradient(64,64,8,64,64,64);r.addColorStop(0,"rgba(5,9,11,.8)");r.addColorStop(.66,"rgba(7,10,12,.47)");r.addColorStop(1,"rgba(6,10,12,0)");g.fillStyle=r;g.fillRect(0,0,128,128);let mesh=new T.Mesh(new T.PlaneGeometry(2.85,5.6),new T.MeshBasicMaterial({map:new T.CanvasTexture(c),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));mesh.rotation.x=-Math.PI/2;scene.add(mesh);return mesh;}
const orbit={active:false,pointer:null,angle:0,elevation:.27,radius:6.8,x:0,y:0};
function endOrbitDrag(){
 if(!orbit.active)return;
 const id=orbit.pointer;orbit.pointer=null;
 orbit.active=false;orbit.angle=0;orbit.elevation=.27;orbit.radius=6.8;
 if(id!==null&&document.body.hasPointerCapture(id))document.body.releasePointerCapture(id);
 document.body.classList.remove("orbit-drag");
 positionCar(0,true);
}
function mouseLookTarget(el){return vehicle&&!$("atlas").open&&$("panel").hidden&&!el.closest('button,select,input,a,#panel,#routeChooser');}
document.addEventListener("contextmenu",e=>{if(orbit.pointer!==null||mouseLookTarget(e.target))e.preventDefault();});
document.addEventListener("pointerdown",e=>{
 if(e.pointerType!=="mouse"||e.button!==2||!mouseLookTarget(e.target))return;
 e.preventDefault();orbit.active=true;orbit.pointer=e.pointerId;orbit.x=e.clientX;orbit.y=e.clientY;
 document.body.setPointerCapture(e.pointerId);document.body.classList.add("orbit-drag");
});
document.addEventListener("pointermove",e=>{
 if(e.pointerId!==orbit.pointer)return;
 if(!(e.buttons&2)){endOrbitDrag();return;}
 orbit.angle=(orbit.angle-(e.clientX-orbit.x)*2*Math.PI/Math.max(280,innerWidth*.78))%(2*Math.PI);
 orbit.elevation=clamp(orbit.elevation+(e.clientY-orbit.y)*.006,-.085,1.33);
 orbit.x=e.clientX;orbit.y=e.clientY;
});
for(const evt of ["pointerup","pointercancel","lostpointercapture"])document.addEventListener(evt,e=>{if(e.pointerId===orbit.pointer)endOrbitDrag();});
window.addEventListener("blur",endOrbitDrag);
window.addEventListener("mouseup",e=>{if(e.button===2)endOrbitDrag();},true);
document.addEventListener("visibilitychange",()=>{if(document.hidden)endOrbitDrag();});
window.addEventListener("keydown",e=>{if(e.code==="KeyV"&&!e.repeat&&!e.target.matches("select,input"))setView(0);});
document.addEventListener("wheel",e=>{
 if(!orbit.active||$("atlas").open||!$("panel").hidden)return;
 e.preventDefault();orbit.radius=clamp(orbit.radius*Math.exp(Math.sign(e.deltaY)*.13),3.5,12);
},{passive:false});
function positionCar(dt,snap=false){if(!vehicle)return;skinDamage(car.damage);damageNotice();const h=car.flight?.y??road.height(car.s),s=Math.sin(car.yaw),c=Math.cos(car.yaw);
 vehicle.group.position.set(car.x,h+car.heave,car.z);vehicle.group.rotation.set(car.pitch,car.yaw,car.roll,"YXZ");vehicle.updateChassis(car);vehicle.brakeLights.forEach(m=>m.emissiveIntensity=car.braking>.1?3.9:1.1);
 shadow.visible=!car.flight;shadow.position.set(car.x,h+.035,car.z);shadow.rotation.z=car.yaw;vehicle.group.visible=cameraMode===0||orbit.active;cockpit.group.visible=cameraMode===1&&!orbit.active;
 const point=(v,lateral,vertical,long)=>v.set(car.x+c*lateral+s*long,h+vertical,car.z-s*lateral+c*long);
 if(orbit.active){
 const arm=orbit.radius*Math.cos(orbit.elevation);
 point(current,arm*Math.sin(orbit.angle),Math.max(.25,.73+car.heave+orbit.radius*Math.sin(orbit.elevation)),-arm*Math.cos(orbit.angle));
 point(aim,0,.73+car.heave,0);
 const roadYaw=road.heading(car.s);
 const lateralArm=(current.x-aim.x)*Math.cos(roadYaw)-(current.z-aim.z)*Math.sin(roadYaw);
 const side=Math.sign(lateralArm),boundary=side*(road.lanesAt(car.s)*1.75+(side>0?.60:.75));
 const crossing=(boundary-car.lateral)/lateralArm;
 if(crossing>0&&crossing<1){
   const wallTop=h+(side>0?1.02:.80)+.12;
   current.y=Math.max(current.y,aim.y+(wallTop-aim.y)/Math.max(.09,crossing));
 }
 camera.position.copy(current);focus.copy(aim);camera.up.set(0,1,0);camera.lookAt(aim);
 }else if(cameraMode===0){const parked=mode==="ready";const zoom=Math.min(Math.abs(car.u)*.021,.7),wide=innerWidth<innerHeight;
 point(current,parked?1.55:0,parked?3.0:2.65,parked?(wide?-11:-9.5):-9.1-zoom);point(aim,parked?-.9:0,parked?1.2:1.12,parked?12.8:14+zoom);
 const blend=snap?1:1-Math.exp(-dt*(parked?3.2:10));camera.position.lerp(current,blend);focus.lerp(aim,snap?1:1-Math.exp(-dt*13));camera.up.set(0,1,0);camera.lookAt(focus);
 }else{const cockpitView=cameraMode===1;point(current,cockpitView?.36:0,car.heave+(cockpitView?1.17:1.00),cockpitView?-.15:1.23);point(aim,cockpitView?.36:0,(cockpitView?1.62:1.28)-car.pitch*8,28);camera.position.copy(current);camera.up.set(-c*Math.sin(car.roll),Math.cos(car.roll),s*Math.sin(car.roll));camera.lookAt(aim);if(cockpitView)cockpit.update(car,road,snap);}
 camera.fov=orbit.active?48:cameraMode===1?60:(cameraMode===2?68:(mode==="ready"?49:55)+Math.min(5,Math.abs(car.u)*.09));camera.updateProjectionMatrix();camera.updateMatrixWorld();
}
function mapDraw(){drawHanMap($("map"),road,car);}
const updateDamageHud=createDamageDisplay($("damageHud"));
function telemetry(){updateDamageHud(car);const kmh=Math.round(Math.abs(car.u)*3.6);$("speed").textContent=String(kmh).padStart(3,"0");$("gear").textContent=car.forward?"D"+car.gear:"R";$("rpm").textContent=(car.rpm/1000).toFixed(1);$("distance").textContent=km(road.length-car.s)+" km 남음";for(let i=0;i<bars.length;i++){bars[i].className=i/27<car.rpm/6800?(i>21?"hot":"on"):"";}const next=road.crossings.find(b=>b.overRoad&&b.s>car.s+20);$("upcoming").textContent=next?next.name+"  "+((next.s-car.s)>1000?km(next.s-car.s)+" km":Math.round((next.s-car.s)/10)*10+" m"):endpoint[1];if(freeDrive){const e=road.current,n=road.labels[e.bn]||e.bridgeLabel||road.labels[e.n]||(e.flags&64?"연결로":"시내 도로");$("roadTitle").textContent=n;$("distance").textContent=km(car.distance)+" km 주행";$("upcoming").textContent=(e.flags&32?"교량　":e.flags&64?"연결로　":"")+(e.flags&16?"일방통행":"양방향");}if(mode==="driving")mapDraw();}
async function init(){try{
 renderer=new T.WebGLRenderer({antialias:true,powerPreference:"high-performance",alpha:false});renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;$("stage").append(renderer.domElement);
 scene=new T.Scene();camera=new T.PerspectiveCamera(55,1,.06,6800);scene.add(camera);qualityApply();
 if(freeDrive){const graph=await readSeoulBlock(SEOUL_DRIVE_GRAPH);road=makeSeoulNetwork(graph,road);departure=routeQuery.has("at")?Math.max(0,Math.min(road.stops.length-1,Math.trunc(requested)||0)):!routeQuery.has("route")?Math.max(0,road.stops.findIndex(v=>v.name.startsWith("가로수길"))):Math.max(0,["sW","sE","nW","nE"].indexOf(courseId));}
 road.scenery=HanCollision.scenery();car=new DriveModel(road);
 const weather=SeoulWeather.start(T,scene,road);
 let resumeMap=false,mapNetwork;
 const getNetwork=()=>mapNetwork??=(async()=>makeSeoulNetwork(await readSeoulBlock(SEOUL_DRIVE_GRAPH),road))().catch(e=>{mapNetwork=null;throw e;});
 setupSeoulAtlas(road,car,()=>{resumeMap=mode==="driving";if(resumeMap)pause();endOrbitDrag();keys.clear();touch.clear();},
   ()=>{if(resumeMap&&!document.hidden&&document.hasFocus()&&mode==="paused")start();resumeMap=false;},getNetwork,place=>{
     resumeMap=false;
     if(freeDrive||place.tourStation!=null){reset(freeDrive?place:{s:place.tourStation});start();return;}
     const url=new URL(location.href);url.searchParams.delete('tour');url.searchParams.delete('at');url.searchParams.set('route','city');
     url.searchParams.set('edge',String(place.e.i));url.searchParams.set('station',String(place.s));location.assign(url.href);
   });
 setupRoute();sky=buildAtmosphere(T,scene,renderer,road);cityView=buildRiverCity(T,scene,road);roadView=freeDrive?drawSeoulStreets(T,scene,road):buildRoad(T,scene,road);
 vehicle=buildCar(T);skinDamage=HanDamageView(T,vehicle.group.children[0]);scene.add(vehicle.group);cockpit=buildCockpit(T);camera.add(cockpit.group);shadow=groundShadow();traffic=buildTraffic(T,scene,road,vehicle);fitAvanteN(T,vehicle);
 const mapped=freeDrive&&routeQuery.has('edge')&&routeQuery.has('station')?road.respawnPlace(road.segments[Number(routeQuery.get('edge'))],Number(routeQuery.get('station'))):null;
 reset(mapped);$("start").disabled=false;if(mapped)start();telemetry();let prev=performance.now(),acc=0,ui=0,renderTime=0;
 function animate(now){const dt=clamp((now-prev)/1000,0,.07);prev=now;const input=inputs();renderTime+=dt;
 if(mode==="driving"){acc+=dt;while(acc>=1/120){car.step(input,1/120);traffic.step(1/120,car);acc-=1/120;}traffic.render(car);roadView.update(car.s,car.lateral);elapsed+=dt;totalTime+=dt;
 if(!freeDrive&&car.s>=road.length-3){setMode("finished");showIntro("코스 완주","다시 주행");$("introSpec").textContent="주행 시간 "+Math.floor(totalTime/60)+"분 "+Math.floor(totalTime%60)+"초";}}
 else acc=0;
 cityView.update(car.s);positionCar(dt);syncAudio(input.gas,dt);
 if(mode==='driving'&&car.stranded&&(car.landingTime+=dt)>.45){
   setMode('finished');showIntro(road.isWater?.(car.x,car.z)?'침수로 주행 종료':'교량 아래 착지','도로에서 다시 시작');
   $('introSpec').textContent='M 지도에서 다른 도로를 선택할 수 있습니다.';
 }
 weather.update(renderTime,car);sky.update(camera,car,renderTime,quality==="ultra",cockpit.group);renderer.render(scene,camera);
 ui+=dt;if(ui>.09){telemetry();ui=0;}requestAnimationFrame(animate);}
 requestAnimationFrame(animate);window.addEventListener("resize",qualityApply);
 renderer.domElement.addEventListener("webglcontextlost",e=>{e.preventDefault();errorState("그래픽 연결이 끊겼습니다. 페이지를 새로 열어 주세요.");});
 }catch(e){console.error(e);errorState("WebGL 2를 지원하는 브라우저에서 하드웨어 가속을 켠 뒤 다시 열어 주세요.");}}
function errorState(msg){setMode("error");showIntro("화면을 열 수 없습니다","다시 시도");$("start").disabled=false;$("start").onclick=()=>location.reload();$("introSpec").textContent=msg;}
init();
