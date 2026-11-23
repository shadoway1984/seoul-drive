/* OSM topology drives both the road surface and vehicle contacts. Coordinates are
   east/south metres. Edges that cross without a shared OSM node stay disconnected. */
window.makeSeoulNetwork=function(data,base){
 const {labels,roads,turns}=data, coords=Int32Array.from(data.coords), count=coords.length/2;
 // The dataset misspells the Cheonggyecheon crossing at Jangchungdan-ro.
 const ogansu=labels.indexOf('오간수교');
 const crossingLabel=ogansu<0?labels.push('오간수교')-1:ogansu;
 const grid=new Map(),adj=new Array(count),segments=[],cellSize=260;
 const key=(x,z)=>Math.floor(x/cellSize)+','+Math.floor(z/cellSize);
 const x=n=>coords[n*2]/4,z=n=>coords[n*2+1]/4;
 const levels=new Float32Array(count),rules=new Map(),queue=[];
 const bounds=[Infinity,Infinity,-Infinity,-Infinity];
 for(const [from,via,to,rule] of turns){const k=from+':'+via;if(!rules.has(k))rules.set(k,[]);rules.get(k).push([to,rule]);}
 for(const w of roads){
   const [id,n,flags,lanes,width,layer,bn,known,refs]=w;
   for(let i=1;i<refs.length;i++){
     const a=refs[i-1],b=refs[i],ax=x(a),az=z(a),bx=x(b),bz=z(b),len=Math.hypot(bx-ax,bz-az);
     if(len<.1)continue;
     const e={i:segments.length,a,b,ax,az,bx,bz,len,tx:(bx-ax)/len,tz:(bz-az)/len,id,n,flags,lanes,half:width/20,layer,bn,known};
     if((flags&32)&&labels[bn]==='오산수교'&&Math.hypot(ax-848,az+4435)<130)e.bn=crossingLabel;
     segments.push(e);(adj[a]??=[]).push(e);(adj[b]??=[]).push(e);
     const k=key((ax+bx)/2,(az+bz)/2);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(e);
     bounds[0]=Math.min(bounds[0],ax,bx);bounds[1]=Math.min(bounds[1],az,bz);bounds[2]=Math.max(bounds[2],ax,bx);bounds[3]=Math.max(bounds[3],az,bz);
   }
 }
 // OSM layer orders intersecting features (including streams). It does not
 // measure a road's height above the neighboring sidewalks. Require a lower
 // carriageway, a named viaduct, or a long river span to elevate a deck.
 const crossingsGrid=new Map(),visited=new Set();
 for(const e of segments){
   if(e.flags&128)continue;
   for(let i=Math.floor(Math.min(e.ax,e.bx)/120);i<=Math.floor(Math.max(e.ax,e.bx)/120);i++)
     for(let j=Math.floor(Math.min(e.az,e.bz)/120);j<=Math.floor(Math.max(e.az,e.bz)/120);j++){
       const k=i+','+j;if(!crossingsGrid.has(k))crossingsGrid.set(k,[]);crossingsGrid.get(k).push(e);
     }
 }
 function overRoad(e){
   for(let i=Math.floor(Math.min(e.ax,e.bx)/120);i<=Math.floor(Math.max(e.ax,e.bx)/120);i++)
    for(let j=Math.floor(Math.min(e.az,e.bz)/120);j<=Math.floor(Math.max(e.az,e.bz)/120);j++)
     for(const o of crossingsGrid.get(i+','+j)||[]){
       if(o.layer>=e.layer||o.a===e.a||o.a===e.b||o.b===e.a||o.b===e.b)continue;
       const det=e.tx*o.tz-e.tz*o.tx;if(Math.abs(det)<.01)continue;
       const dx=o.ax-e.ax,dz=o.az-e.az,t=(dx*o.tz-dz*o.tx)/det,u=(dx*e.tz-dz*e.tx)/det;
       if(t>=0&&t<=e.len&&u>=0&&u<=o.len)return true;
     }
   return false;
 }
 const hanSpans=Object.values(HAN_BRIDGES).map(line=>{
   const a=base.project(...line[0]),b=base.project(...line.at(-1)),dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
   return {a,tx:dx/len,tz:dz/len,len};
 });
 function hanSpan(e){
   const x=(e.ax+e.bx)/2,z=(e.az+e.bz)/2;
   return hanSpans.some(h=>{
     const dx=x-h.a.x,dz=z-h.a.z,s=dx*h.tx+dz*h.tz;
     return s>=0&&s<=h.len&&Math.abs(dx*h.tz-dz*h.tx)<55&&Math.abs(e.tx*h.tx+e.tz*h.tz)>.78;
   });
 }
 for(const edge of segments){
   if(visited.has(edge)||edge.flags&128||(!(edge.flags&32)&&edge.layer<=0))continue;
   const run=[edge];visited.add(edge);let length=0,elevated=false;
   for(let i=0;i<run.length;i++){
     const e=run[i];length+=e.len;
     elevated||=overRoad(e)||/고가|입체교차/.test(labels[e.bn]||labels[e.n]);
     for(const n of [e.a,e.b])for(const o of adj[n])if(!visited.has(o)&&o.layer===edge.layer&&!!(o.flags&32)===!!(edge.flags&32)&&!(o.flags&128)&&(o.id===edge.id||edge.n&&o.n===edge.n)){
       visited.add(o);run.push(o);
     }
   }
   if(!elevated&&(!(edge.flags&32)||length<240||!run.some(hanSpan)))continue;
   const h=Math.max(1,edge.layer)*6.4;
   for(const e of run)for(const n of [e.a,e.b])if(levels[n]<h){levels[n]=h;queue.push(n);}
 }
 crossingsGrid.clear();visited.clear();
 for(let i=0;i<queue.length;i++){const n=queue[i];for(const e of adj[n]){const v=e.a===n?e.b:e.a,h=levels[n]-.055*e.len;if(h>levels[v]+.015){levels[v]=h;queue.push(v);}}}
 function at(e,s,l=0){const k=Math.max(0,Math.min(e.len,s));return {x:e.ax+k*e.tx+l*e.tz,z:e.az+k*e.tz-l*e.tx,y:.43+levels[e.a]+(levels[e.b]-levels[e.a])*k/e.len,yaw:Math.atan2(e.tx,e.tz)};}
 function project(e,px,pz){const dx=px-e.ax,dz=pz-e.az,raw=dx*e.tx+dz*e.tz,s=Math.max(0,Math.min(e.len,raw));
   const rx=e.ax+s*e.tx,rz=e.az+s*e.tz;return {e,s,raw,x:rx,z:rz,lateral:dx*e.tz-dz*e.tx,d2:(rx-px)**2+(rz-pz)**2,yaw:Math.atan2(e.tx,e.tz)};}
 function nearby(px,pz,r){const found=[];for(let i=Math.floor((px-r)/cellSize);i<=Math.floor((px+r)/cellSize);i++)for(let j=Math.floor((pz-r)/cellSize);j<=Math.floor((pz+r)/cellSize);j++)found.push(...(grid.get(i+','+j)||[]));return found;}
 function canTurn(from,to,node){
   if(from===to)return true;
   if((to.flags&16)&&to.a!==node)return false;
   const rs=rules.get(from.id+':'+node);
   if(!rs)return true;
   if(rs.some(([id,t])=>id===to.id&&t.startsWith('no_')&&(t!=='no_u_turn'||from.id!==to.id||from.a===to.a||from.b===to.b)))return false;
   return !rs.some(([,t])=>t.startsWith('only_'))||rs.some(([id,t])=>id===to.id&&t.startsWith('only_'));
 }
 function adjacent(e,n){return adj[n].filter(v=>v!==e&&canTurn(e,v,n));}
 const world={...base,network:true,signs:new Map(data.signs||[]),grid,segments,labels,adj,at,projectEdge:project,nearby,adjacent,levels,bounds,cellSize,routeName:'서울 자유주행',ref:'서울',stops:[],crossings:[],current:null};
 // Index named bridge entries and resolve Han bridge names by transverse direction
 // and proximity to the mapped midspan when the road's name differs from its bridge.
 const candidates=new Map();
 const bridgeEdges=segments.filter(e=>e.flags&32);
 for(const [name,line] of Object.entries(HAN_BRIDGES)){
   const a=base.project(...line[0]),b=base.project(...line.at(-1)),dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);
   const mid={x:(a.x+b.x)/2,z:(a.z+b.z)/2};let best=null,score=Infinity;
   for(const e of nearby(mid.x,mid.z,490)){if(!(e.flags&32)||Math.abs((e.tx*dx+e.tz*dz)/d)<.8)continue;
     const value=project(e,mid.x,mid.z).d2;if(value<score){best=e;score=value;}}
   if(best&&score<230**2){
     candidates.set(name,best);
     for(const e of bridgeEdges){const along=((e.ax-a.x)*dx+(e.az-a.z)*dz)/d,away=Math.abs((e.ax-a.x)*dz-(e.az-a.z)*dx)/d;
       if(along>0&&along<d&&away<40&&Math.abs((e.tx*dx+e.tz*dz)/d)>.75)e.bridgeLabel=name;}
   }
 }
 for(const e of bridgeEdges){const nm=labels[e.bn]||labels[e.n];if((e.flags&256)&&!['고덕토평대교','강동대교','방화대교','행주대교'].includes(nm))continue;if(nm&&/교($|\s*\()|교량|고가차도/.test(nm)&&!candidates.has(nm))candidates.set(nm,e);}
 function approach(edge){let e=edge,s=e.len*.5,remaining=100,used=new Set([e]),walked=0;for(let k=0;k<240;k++){
   if((e.flags&32)&&walked<2400)remaining=s+110;walked+=s;
   if(s>=remaining)return {e,s:s-remaining};remaining-=s;
   const options=adj[e.a].filter(o=>!used.has(o)&&o.b===e.a&&canTurn(o,e,e.a));
   options.sort((a,b)=>(b.tx*e.tx+b.tz*e.tz)-(a.tx*e.tx+a.tz*e.tz));
   if(options.length&&options[0].tx*edge.tx+options[0].tz*edge.tz<.22)return {e,s:Math.min(e.len*.3,10)};
   if(!options.length)return {e,s:Math.min(e.len*.4,4)};e=options[0];used.add(e);s=e.len;
 }return {e,s:e.len*.5};}
 const originEdges=[];
 function stop(label,e,s){world.stops.push({s:originEdges.length,name:label});originEdges.push({e,s});}
 for(const id of ['sW','sE','nW','nE']){
   const line=base.allRoutes[id],bp=base.crossings.find(v=>v.name==='반포대교'),p=bp?bp.anchor:base.point(1000),near=line.nearest(p.x,p.z),pose=line.point(Math.max(0,near.s-750));
   let best=null,score=Infinity;for(const e of nearby(pose.x,pose.z,450)){
     if((e.flags&15)>2||e.flags&64)continue;
     const h=e.tx*Math.sin(pose.yaw)+e.tz*Math.cos(pose.yaw);if(h<.6)continue;
     const q=project(e,pose.x,pose.z),cost=q.d2+200*(1-h)+(labels[e.n]===(id[0]==="s"?"올림픽대로":"강변북로")?0:6500);if(cost<score){best=q;score=cost;}}
   if(best)stop(({sW:'올림픽대로 · 여의도 방면',sE:'올림픽대로 · 잠실 방면',nW:'강변북로 · 가양 방면',nE:'강변북로 · 구리 방면'})[id],best.e,best.s);
 }
 for(const [name,e] of [...candidates].sort(([a],[b])=>a.localeCompare(b,'ko'))){const p=approach(e);stop(name+' 인근',p.e,p.s);}
 // These carriageways are tagged with the road name 양재대로 on the mapped bridge.
 const amsa=bridgeEdges.filter(e=>e.id===1491785187||e.id===557212759);
 if(amsa.length){
   const name='구리암사대교',mid=base.project(127.1321,37.5692);
   for(const e of amsa)e.bridgeLabel=name;
   const deck=amsa.reduce((a,b)=>project(a,mid.x,mid.z).d2<project(b,mid.x,mid.z).d2?a:b);
   candidates.set(name,deck);const p=approach(deck);stop(name+' 인근',p.e,p.s);
 }
 for(const [name,way,lon,lat] of [['가로수길',529594105,127.022918,37.520775],['세종대로',218926711,126.973699,37.558291],['테헤란로',921219576,127.052426,37.505432],['여의대로',623345111,126.925057,37.525864]]){
   const anchor=base.project(lon,lat);
   const p=segments.filter(e=>e.id===way&&labels[e.n]===name).map(e=>project(e,anchor.x,anchor.z)).sort((a,b)=>a.d2-b.d2)[0];
   if(p)stop(name+' · 시내 출발',p.e,p.s);
 }
 const dong=base.project(127.00933,37.57072);
 const south=nearby(dong.x,dong.z,65).filter(e=>e.tz>.65&&['율곡로','장충단로'].includes(labels[e.n]))
   .map(e=>project(e,dong.x,dong.z)).sort((a,b)=>a.d2-b.d2)[0];
 if(south)stop('동대문사거리 · 장충 방향',south.e,south.s);
 let fork=null;
 let contactEdge=null;
 Object.defineProperty(world,'current',{get:()=>contactEdge,set:e=>{fork=null;contactEdge=e;}});
 world.spawn=i=>{fork=null;const o=originEdges[i]||originEdges[0];world.current=o.e;return o.s;};
 world.spawn(0);
 world.point=(s,l)=>at(world.current,s,l);world.height=s=>at(world.current,s).y;
 world.heading=()=>Math.atan2(world.current.tx,world.current.tz);
 world.joinWidth=(e,n)=>adj[n].length===2?(adj[n][0].half+adj[n][1].half)*.5:e.half;
 world.widthAt=(e,s)=>{
   const taper=Math.min(e.len*.5,14),t=Math.max(0,Math.min(e.len,s));
   if(t<taper)return e.half+(world.joinWidth(e,e.a)-e.half)*(1-t/taper);
   return e.half+(world.joinWidth(e,e.b)-e.half)*Math.max(0,1-(e.len-t)/taper);
 };
 world.lanesAt=s=>world.widthAt(world.current,s)/1.75;
 world.driveOffset=(e,s)=>{
   const width=world.widthAt(e,s),lanes=Math.max(1,e.lanes);
   const laneWidth=2*width/lanes;
   const lane=e.flags&16?(lanes%2?0:laneWidth*.5):Math.min(width*.5,laneWidth*.5);
   return -Math.min(lane,Math.max(0,width-1.35));
 };
 world.respawnPlace=(e,station)=>{
   if(!e||!Number.isFinite(station))return null;
   const margin=Math.min(e.len/2,2.7);
   for(const shift of [0,3,-3,7,-7,12,-12]){
     const s=Math.max(margin,Math.min(e.len-margin,station+shift)),preferred=world.driveOffset(e,s);
     for(const lane of [preferred,preferred*.55,0]){
       const p=at(e,s,lane);let collision=false;
       for(const o of world.edgesIn(p.x-3,p.z-3,p.x+3,p.z+3)){
         for(const r of world.roadBorders(o)){
           if(p.y<Math.min(r.a[1],r.b[1])-1.7||p.y>Math.max(r.a[1],r.b[1])+1.7)continue;
           const local=q=>[(q[0]-p.x)*e.tx+(q[2]-p.z)*e.tz,(q[0]-p.x)*e.tz-(q[2]-p.z)*e.tx];
           const a=local(r.a),b=local(r.b);let first=0,last=1;
           for(const [i,h] of [[0,2.46],[1,1.03]]){
             const delta=b[i]-a[i];
             if(Math.abs(delta)<1e-8){if(Math.abs(a[i])>h){last=-1;break;}}
             else{const t=(-h-a[i])/delta,v=(h-a[i])/delta;first=Math.max(first,Math.min(t,v));last=Math.min(last,Math.max(t,v));}
           }
           if(last>=first){collision=true;break;}
         }
         if(collision)break;
       }
       if(!collision)return {e,s,lane,x:p.x,z:p.z};
     }
   }
   return null;
 };
 world.surfaceHeight=(s,l=0)=>{
   const e=world.current,k=Math.max(0,Math.min(s,e.len));
   let height=at(e,k).y;
   if(k!==s){
     const n=s<0?e.a:e.b,px=e.ax+e.tx*s+e.tz*l,pz=e.az+e.tz*s-e.tx*l;
     let best=Infinity;
     for(const other of adj[n]){
       if(other===e)continue;const q=project(other,px,pz);
       if(q.raw<0||q.raw>other.len||Math.abs(q.lateral)>other.half||q.d2>=best)continue;
       best=q.d2;height=at(other,q.s).y;
     }
   }
   if(s===k && Math.abs(l)>world.widthAt(e,k)-.4 && !(e.flags&32)){
     for(const border of world.roadBorders(e)){
       if(!border.step||border.sign!==Math.sign(l)||k<border.s||k>border.t)continue;
       const beyond=Math.abs(l)-world.widthAt(e,k);
       if(beyond>=0 && beyond<border.sidewalk)height+=border.step;
     }
   }
   return height-.004*Math.exp(-Math.pow(((k%48)-24)/.16,2));
 };
 world.nearest=(px,pz)=>project(world.current,px,pz);
 world.locate=(body)=>{
   const old=world.current,oldPose=project(old,body.x,body.z),oldHeight=at(old,oldPose.s).y;let best=oldPose,score=best.d2;
   const travel=(Math.sin(body.yaw)*old.tx+Math.cos(body.yaw)*old.tz)*(body.u<-.25?-1:1);
   let junction=null;
   // Long tapering ramps can share asphalt for several segments before their
   // centerlines separate. Keep only legal exits descended from the same node.
   if(fork&&Math.hypot(body.x-fork.x,body.z-fork.z)<125){
     for(const [edge,sign] of fork.options){
       const q=project(edge,body.x,body.z),align=sign*(Math.sin(body.yaw)*edge.tx+Math.cos(body.yaw)*edge.tz);
       const cost=q.d2+1.4+(1-align)*5;
       if(align>.45&&cost<score&&Math.abs(at(edge,q.s).y-oldHeight)<2.6){
         best=q;score=cost;
       }
     }
   }else fork=null;
   // Only connected approaches are eligible. A turn can begin inside a wide junction.
   for(const n of [old.a,old.b]){
     if(oldPose.raw>=0&&oldPose.raw<=old.len&&((n===old.a&&travel>.80)||(n===old.b&&travel<-.80)))continue;
     if(Math.hypot(body.x-x(n),body.z-z(n))>Math.max(22,old.half+9))continue;
     for(const e of adjacent(old,n)){
       const q=project(e,body.x,body.z);
       const align=(Math.sin(body.yaw)*e.tx+Math.cos(body.yaw)*e.tz)*(n===e.a?1:-1);
       if(align<-.22&&Math.abs(body.u)>1)continue;
       const onward=n===e.a?q.raw:e.len-q.raw;if(onward<-.4)continue;
       const value=q.d2+.12+(1-align)*2.3;
       if(value<score){best=q;score=value;junction=n;}
     }
   }
   if(junction!==null&&adj[junction].length>2){
     const exits=adjacent(old,junction),options=[],seen=new Set([old]);
     const work=exits.map(e=>[e,junction,0]);
     for(let i=0;i<work.length&&i<130;i++){
       const [e,via,d]=work[i];if(seen.has(e)||d>125)continue;seen.add(e);
       const sign=e.a===via?1:-1;options.push([e,sign]);
       const end=sign>0?e.b:e.a;
       if(adj[end].length<=3)for(const t of adjacent(e,end))work.push([t,end,d+e.len]);
     }
     if(exits.length>1)fork={x:x(junction),z:z(junction),options};
   }
   contactEdge=best.e;return best;
 };
 // A connected way can meet the current way around a corner. Its presence alone
 // does not make the infinite extension of the old centreline drivable.
 world.endAllowance=(edge,node,px,pz)=>{
   let radius=0;
   for(const other of adjacent(edge,node)){
     const q=project(other,px,pz);
     if(q.raw>=-.05&&q.raw<=other.len+.05&&Math.abs(q.lateral)<=other.half)return Infinity;
     radius=Math.max(radius,Math.min(edge.half,other.half));
   }
   return Math.sqrt(Math.max(0,radius*radius-project(edge,px,pz).lateral**2));
 };
 Object.assign(world,makeSeoulRoadGeometry(world));
 world.floorBelow=(x,z,ceiling)=>{
   const water=!!world.isWater?.(x,z);
   let floor={y:water?world.waterY:.10,water};
   for(const e of world.edgesIn(x-1,z-1,x+1,z+1)){
     const q=project(e,x,z);
     if(q.raw<0||q.raw>e.len||Math.abs(q.lateral)>world.widthAt(e,q.s)+.12)continue;
     const y=at(e,q.s).y;
     if(y<=ceiling && y>floor.y)floor={...q,y,water:false};
   }
   return floor;
 };
 world.bridgeEntries=candidates;return world;
};


function makeSeoulRoadGeometry(world){
 const cell=64,index=new Map(),shapes=new Map(),boundaries=new Map();
 function cache(map,key,value){
   if(map.size>=16000)map.delete(map.keys().next().value);
   map.set(key,value);return value;
 }
 const key=(i,j)=>i+','+j,adj=world.adj;
 for(const e of world.segments){
   const pad=2*Math.max(e.half,world.joinWidth(e,e.a),world.joinWidth(e,e.b))+3;
   e.box=[Math.min(e.ax,e.bx)-pad,Math.min(e.az,e.bz)-pad,Math.max(e.ax,e.bx)+pad,Math.max(e.az,e.bz)+pad];
   for(let i=Math.floor(e.box[0]/cell);i<=Math.floor(e.box[2]/cell);i++)
     for(let j=Math.floor(e.box[1]/cell);j<=Math.floor(e.box[3]/cell);j++){
       const k=key(i,j);if(!index.has(k))index.set(k,[]);index.get(k).push(e);
     }
 }
 function edgesIn(x,z,u,v){
   const found=new Set();
   for(let i=Math.floor(x/cell);i<=Math.floor(u/cell);i++)for(let j=Math.floor(z/cell);j<=Math.floor(v/cell);j++)
     for(const e of index.get(key(i,j))||[])if(e.box[0]<=u&&e.box[2]>=x&&e.box[1]<=v&&e.box[3]>=z)found.add(e);
   return found;
 }
 function needsBevel(n){
   const group=adj[n];if(group.length!==2)return group.length>2;
   const [e,o]=group,sign=(e.a===n)===(o.a===n)?-1:1,cos=sign*(e.tx*o.tx+e.tz*o.tz);
   const miterShift=world.joinWidth(e,n)*Math.sqrt(Math.max(0,(1-cos)/Math.max(.000001,1+cos)));
   return cos<-.4||miterShift>.38*Math.min(e.len,o.len);
 }
 function joint(e,n){
   const group=adj[n];if(group.length!==2||needsBevel(n))return [e.tz,-e.tx];
   const o=group[0]===e?group[1]:group[0],sign=(e.a===n)===(o.a===n)?-1:1;
   const nx=e.tz+o.tz*sign,nz=-e.tx-o.tx*sign,den=nx*e.tz-nz*e.tx;
   return den<.6?[e.tz,-e.tx]:[nx/den,nz/den];
 }
 const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
 function shape(e){
   if(shapes.has(e))return shapes.get(e);
   const ja=joint(e,e.a),jb=joint(e,e.b),cuts=[0],taper=Math.min(e.len*.5,14);
   if(world.joinWidth(e,e.a)!==e.half)cuts.push(taper);
   if(world.joinWidth(e,e.b)!==e.half&&cuts.at(-1)!==e.len-taper)cuts.push(e.len-taper);
   cuts.push(e.len);
   const sections=cuts.map(s=>{
     const center=world.at(e,s),t=s/e.len,w=world.widthAt(e,s);
     return {s,x:center.x,y:center.y,z:center.z,nx:(ja[0]+(jb[0]-ja[0])*t)*w,nz:(ja[1]+(jb[1]-ja[1])*t)*w};
   });
   function point(s,l,h=0){
     let i=1;while(i<sections.length-1&&s>sections[i].s)i++;
     const a=sections[i-1],b=sections[i],t=(s-a.s)/(b.s-a.s),f=l/e.half;
     return [a.x+(b.x-a.x)*t+(a.nx+(b.nx-a.nx)*t)*f,a.y+(b.y-a.y)*t+h,a.z+(b.z-a.z)*t+(a.nz+(b.nz-a.nz)*t)*f];
   }
   const faces=[],sides=[];
   for(let i=1;i<cuts.length;i++){
     const s=cuts[i-1],t=cuts[i],a=point(s,-e.half),b=point(t,-e.half),c=point(t,e.half),d=point(s,e.half);
     faces.push([a,b,c],[a,c,d]);
     sides.push({a,b,sign:-1,s,t},{a:d,b:c,sign:1,s,t});
   }
   const junction=[];
   for(const [n,s] of [[e.a,0],[e.b,e.len]])if(needsBevel(n)&&adj[n][0]===e){
     const c=point(s,0),ring=[];
     for(const o of adj[n])for(const side of [-1,1])ring.push([c[0]+o.tz*side*world.joinWidth(o,n),c[1],c[2]-o.tx*side*world.joinWidth(o,n)]);
     ring.sort((p,q)=>Math.atan2(p[2]-c[2],p[0]-c[0])-Math.atan2(q[2]-c[2],q[0]-c[0]));
     ring.forEach((r,i)=>{const next=ring[(i+1)%ring.length];junction.push([c,next,r]);});
   }
   return cache(shapes,e,{point,cuts,faces,sides,junction});
 }
 // Clip the roadside to each neighboring road triangle and to its elevation.
 // Barycentric coordinates and relative height are linear along the segment.
 function interval(a,b,tri){
   const [p,q,r]=tri,ux=q[0]-p[0],uz=q[2]-p[2],vx=r[0]-p[0],vz=r[2]-p[2],det=ux*vz-uz*vx;
   if(Math.abs(det)<1e-7)return;
   function sample(k){const dx=k[0]-p[0],dz=k[2]-p[2],u=(dx*vz-dz*vx)/det,v=(ux*dz-uz*dx)/det;
     const dy=k[1]-(p[1]+u*(q[1]-p[1])+v*(r[1]-p[1]));return [u,v,1-u-v,1.25-dy,1.25+dy];}
   const from=sample(a),to=sample(b);let lo=0,hi=1;
   for(let i=0;i<5;i++){const x=from[i]+1e-8,y=to[i]+1e-8;if(x<0&&y<0)return;
     if(x<0)lo=Math.max(lo,x/(x-y));else if(y<0)hi=Math.min(hi,x/(x-y));}
   if(hi>lo)return [lo,hi];
 }
 function roadBorders(e){
   if(boundaries.has(e))return boundaries.get(e);
   const road=shape(e),borders=[],others=edgesIn(...e.box),sides=road.sides.slice();
   for(const [center,a,b] of road.junction){
     const dx=b[0]-a[0],dz=b[2]-a[2];
     const outward=Math.sign((a[0]-center[0])*dz-(a[2]-center[2])*dx);
     if(outward)sides.push({a,b,sign:0,s:0,t:1,outward});
   }
   for(const [node,s] of [[e.a,0],[e.b,e.len]])if(adj[node].length===1){
     sides.push({a:road.point(s,-e.half),b:road.point(s,e.half),sign:0,s,t:s,outward:node===e.a?1:-1});
   }
   for(const side of sides){
     const {a,b,sign,s,t}=side,dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz);
     if(len<.001)continue;
     const outward=side.outward||sign*(Math.sign(dz*e.tz+dx*e.tx)||1),nx=outward*dz/len,nz=-outward*dx/len;
     const outside=p=>[p[0]+nx*.04,p[1],p[2]+nz*.04],p=outside(a),q=outside(b);
     const blocked=[];
     for(const o of others){
       if(o===e&&sign)continue;
       const g=shape(o);
       for(const faces of [g.faces,g.junction])for(const tri of faces){const cut=interval(p,q,tri);if(cut)blocked.push(cut);}
     }
     for(const tri of road.junction){const cut=interval(p,q,tri);if(cut)blocked.push(cut);}
     function keep(lo,hi){
       if((hi-lo)*len<=.008)return;
       const rank=e.flags&15,material=e.flags&32?'parapet':rank<2?'steel':'curb';
       const urban=!(e.flags&(64|128))&&rank<7;
       const step=material==='curb'?(!sign||urban?.13:(e.flags&128?0:.015)):0;
       const sidewalk=sign?(urban?(rank<4?2.15:1.35):.22):.28;
       const pieces=material==='curb'?1:Math.ceil((hi-lo)*len/3.8);
       const id=e.i+'/'+borders.length;
       for(let i=0;i<pieces;i++){
         const u=lo+(hi-lo)*i/pieces,v=lo+(hi-lo)*(i+1)/pieces;
         borders.push({a:mix(a,b,u),b:mix(a,b,v),nx,nz,sign,s:s+(t-s)*u,t:s+(t-s)*v,
           material,step,sidewalk,key:id+'/'+i,edge:e});
       }
     }
     let last=0;blocked.sort((x,y)=>x[0]-y[0]);for(const [lo,hi] of blocked){if(lo>last)keep(last,lo);last=Math.max(last,hi);}if(last<1)keep(last,1);
   }
   return cache(boundaries,e,borders);
 }
 return {roadShape:shape,roadBorders,edgesIn};
}
