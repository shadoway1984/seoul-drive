/* WGS84 tangent-plane metres around central Seoul. X east, Z south. */
window.createHanWorld=function(id){
 const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
 const project=(lon,lat)=>({x:(lon-127)*88320,z:(37.53-lat)*110990});
 function trace(data){
   const surveyed=data.points.map(p=>project(...p)),raw=[],points=[],nodes=[];
   for(const p of surveyed){const last=raw.at(-1);if(!last||Math.hypot(p.x-last.x,p.z-last.z)>2.25)raw.push(p);}

   // Round the junction between adjacent survey chords over at most four metres.
   function add(p){const last=points.at(-1);if(!last||Math.hypot(last.x-p.x,last.z-p.z)>.03)points.push(p);}
   for(let i=0;i<raw.length;i++){
     const b=raw[i],a=raw[i-1],c=raw[i+1];
     if(!a||!c){add(b);continue;}
     const u=Math.hypot(a.x-b.x,a.z-b.z),v=Math.hypot(c.x-b.x,c.z-b.z);
     const r=Math.min(4,u*.18,v*.18),p={x:b.x+(a.x-b.x)*r/u,z:b.z+(a.z-b.z)*r/u},q={x:b.x+(c.x-b.x)*r/v,z:b.z+(c.z-b.z)*r/v};
     add(p);add({x:(p.x+2*b.x+q.x)*.25,z:(p.z+2*b.z+q.z)*.25});add(q);
   }
   let length=0;const segments=[];
   for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);segments.push({x:a.x,z:a.z,s:length,len,tx:dx/len,tz:dz/len,yaw:Math.atan2(dx,dz)});length+=len;}
   function index(s){let lo=0,hi=segments.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(segments[m].s>s)hi=m-1;else lo=m;}return lo;}
   function point(s,l=0){const k=segments[index(s)],d=clamp(s-k.s,0,k.len);return {x:k.x+k.tx*d+k.tz*l,z:k.z+k.tz*d-k.tx*l,y:4.15,yaw:k.yaw};}
   function nearest(x,z,hint){let lo=0,hi=segments.length-1;if(Number.isFinite(hint)){lo=index(hint-70);hi=index(hint+70);}
     let best=Infinity,ans;
     for(let i=lo;i<=hi;i++){const k=segments[i],dx=x-k.x,dz=z-k.z,u=clamp(dx*k.tx+dz*k.tz,0,k.len),px=k.x+u*k.tx,pz=k.z+u*k.tz,dd=(x-px)**2+(z-pz)**2;
       if(dd<best){best=dd;ans={index:i,x:px,z:pz,s:k.s+u,yaw:k.yaw,lateral:dx*k.tz-dz*k.tx,distance:Math.sqrt(dd)};}}
     return ans;
   }
   for(const [i,name,link] of data.nodes){const p=surveyed[i];nodes.push({name,s:nearest(p.x,p.z).s,link});}
   return {points,length,nodes,segments,point,nearest};
 }
 const cache=window.hanRouteCache||=Object.fromEntries(Object.entries(HAN_ROUTES).map(([k,v])=>[k,trace(v)]));
 const data=HAN_ROUTES[id],line=cache[id],other=cache[id[0]==="n"?"sW":"nE"],reverse=cache[id[0]+(id[1]==="E"?"W":"E")];
 const widthCache=new Map(),oppCache=new Map();
 function across(s){let k=Math.round(s/100);if(!widthCache.has(k)){const p=line.point(k*100);widthCache.set(k,clamp(other.nearest(p.x,p.z).distance-70,280,1800));}return widthCache.get(k);}
 function opposite(s){let k=Math.round(s/120);if(!oppCache.has(k)){const p=line.point(k*120);oppCache.set(k,reverse.nearest(p.x,p.z).s);}let p=line.point(s),a=reverse.nearest(p.x,p.z,oppCache.get(k)-(s-k*120));if(a.distance>80)a=reverse.nearest(p.x,p.z);return a;}
 const crossings=[];
 for(const [name,coords] of Object.entries(HAN_BRIDGES)){
    let geo=coords.map(c=>project(...c)),start=geo[0],end=geo.at(-1),a=line.nearest(start.x,start.z),b=line.nearest(end.x,end.z);
    if(a.distance>b.distance){geo.reverse();[start,end]=[end,start];[a,b]=[b,a];}
    const normal={x:end.x-start.x,z:end.z-start.z},width=Math.hypot(normal.x,normal.z);normal.x/=width;normal.z/=width;
    if(a.distance>2600||a.s<1&&a.distance>260||a.s>line.length-1&&a.distance>260)continue;
    let hit=null;
    for(let j=1;j<geo.length&&!hit;j++){const p=geo[j-1],q=geo[j],ux=q.x-p.x,uz=q.z-p.z;
      for(const k of line.segments){const den=k.tx*uz-k.tz*ux;if(Math.abs(den)<.00001)continue;const vx=p.x-k.x,vz=p.z-k.z;let s=(vx*uz-vz*ux)/den,t=(vx*k.tz-vz*k.tx)/den;if(s>=0&&s<=k.len&&t>=0&&t<=1){hit={s:k.s+s,x:k.x+s*k.tx,z:k.z+s*k.tz};break;}}}
    const anchor=hit||start;
    crossings.push({name,s:hit?hit.s:a.s,anchor,dir:normal,width:Math.hypot(end.x-anchor.x,end.z-anchor.z),overRoad:!!hit||a.distance<38,trace:geo});
 }
 crossings.sort((a,b)=>a.s-b.s);
 const world={...line,id,routeName:data.name,ref:data.ref,riverSide:data.riverSide,east:data.east,project,waterY:-3.5,crossings,opposite,riverWidthAt:across,
   lanesAt(){return 4;},height(){return 4.15;},heading(s){return line.point(s).yaw;},otherBank:other,allRoutes:cache};
 world.stops=[{s:8,name:"본선 시작점"}];for(const b of crossings)if(b.s>700&&b.s<world.length-600&&b.overRoad)world.stops.push({s:Math.max(8,b.s-230),name:b.name+" 진입 전"});
 // Road-deck joints and small paving variation are modelled surface profiles.
 world.surfaceHeight=(s,l)=>{
   const over=Math.abs(l)-world.lanesAt(s)*1.75-.78;
   if(over>0&&l<0){
     if(world.riverSide<0){
       const bank=world.waterY+.88,deck=world.height(s);
       if(over<=2)return deck-.12-.05*over;
       if(over<=11)return deck-.22+(bank-deck+.22)*(over-2)/9;
       return over<=16?bank:Math.max(world.waterY,bank-(over-16)*.27);
     }
     return world.height(s)-.08-Math.min(82,over)*1.22/82;
   }
   const phase=(s+.075*l)/96;
   const joint=(phase-Math.round(phase))*96;
   return world.height(s)+.0023*Math.sin(s*.83+l*.35)+.0013*Math.sin(s*2.18-l*.73)
     -.010*Math.exp(-joint*joint/.023);
 };
 world.tourPanel=(s,side)=>Math.floor(Math.max(0,s)/6)+'/'+side;
 const panelCache=new Map();
 world.tourBorders=station=>{
   const section=Math.floor(station/6);
   if(panelCache.has(section))return panelCache.get(section);
   const lines=[];
   for(let i=Math.max(0,section-2);i<=section+2&&i*6<world.length;i++){
     const s=i*6,t=Math.min(world.length,s+6);
     for(const side of [-1,1]){
       const offset=k=>side*(world.lanesAt(k)*1.75+(side>0?.19:.53));
       const a=world.point(s,offset(s)),b=world.point(t,offset(t));
       const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.001)continue;
       lines.push({a:[a.x,a.y,a.z],b:[b.x,b.y,b.z],nx:side*dz/len,nz:-side*dx/len,
         material:'parapet',key:world.tourPanel(s,side),tile:Math.floor(s/288)});
     }
   }
   panelCache.set(section,lines);return lines;
 };
 return world;
};
