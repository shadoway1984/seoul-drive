/* Quarter-metre footprint coordinates use the same tangent plane as the surveyed carriageways. */
window.readSeoulBlock=async encoded=>{
 const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
 return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json();
};
window.buildMappedDistricts=function(T,world,root,Batch,panes,solid,landmarks){
 const source=world.network?{...window.SEOUL_CITY_BLOCKS,...window.SEOUL_BLOCKS}:window.SEOUL_BLOCKS, loaded=new Map(),pending=new Set();
 let target=new Set(),queue=[],previous=-Infinity,closed=false;
 const color=h=>new T.Color(h);
 const road=color(0x454b4f),edge=color(0x858077),roof=color(0x59616a);
 const cladding={brick:5,bricks:5,glass:2,glass_panels:2,metal:6,concrete:0,plaster:0,stone:3};
 function recordedColor(name){
   if(!name)return;
   const value=name.trim().toLowerCase().replaceAll(' ','');
   if(/^#(?:[\da-f]{3}|[\da-f]{6})$/.test(value)||Object.hasOwn(T.Color.NAMES,value))return color(value);
 }
 function fill(batch,loops,y,tint){
   const pts=loops.map(r=>r.map(([x,z])=>new T.Vector2(x,z))), flat=loops.flat();
   for(const tri of T.ShapeUtils.triangulateShape(pts[0],pts.slice(1))){
     const points=tri.map(i=>[flat[i][0],y,flat[i][1]]);
     batch.tri(solid,...points,tint,[0,0],[0,0],[0,0]);
   }
 }
 function unpack(r){const out=[];for(let i=0;i<r.length;i+=2)out.push([r[i]/4,r[i+1]/4]);return out;}
 function inside(x,z,ring){
   let yes=false;
   for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];
     if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}
   return yes;
 }
 world.streetMap=new Map();
 function make(id,raw,clearance){
   const roads2d=new Path2D();for(const [,x,z,u,v] of raw.r){roads2d.moveTo(x/4,z/4);roads2d.lineTo(u/4,v/4);}world.streetMap.set(id,roads2d);
   const batch=new Batch();
   const parcel=window.SEOUL_PARCELS?.[id];
   const groundColors=[null,color(0xa39f94),color(0x777a78),color(0x748158)];
   for(const [type,ring] of parcel?.land||[])fill(batch,[unpack(ring)],.11+type*.005,groundColors[type]);
   const shops=(parcel?.places||[]).map(([x,z,name])=>({x:x/4,z:z/4,name}));
   const signs=[],curbStone=color(0xb0aba1);
   const [cellX,cellZ]=id.split(',').map(Number);
   const roadEdges=world.network?world.nearby((cellX+.5)*650,(cellZ+.5)*650,510):[];
   const localRoads=new Map();
   for(const e of roadEdges){
     if(e.flags&224||(e.flags&15)<2)continue;
     for(let i=Math.floor((Math.min(e.ax,e.bx)-28)/40);i<=Math.floor((Math.max(e.ax,e.bx)+28)/40);i++)
     for(let j=Math.floor((Math.min(e.az,e.bz)-28)/40);j<=Math.floor((Math.max(e.az,e.bz)+28)/40);j++){
       const k=i+','+j;if(!localRoads.has(k))localRoads.set(k,[]);localRoads.get(k).push(e);
     }
   }
   for(const [w,ax,az,bx,bz] of world.network?[]:raw.r){
     const x=ax/4,z=az/4,xx=bx/4,zz=bz/4,len=Math.hypot(xx-x,zz-z);if(len<.1)continue;
     const nx=(zz-z)/len,nz=(x-xx)/len;
     const strip=(l,r,h,m)=>batch.quad(solid,[x+nx*l,h,z+nz*l],[xx+nx*l,h,zz+nz*l],[xx+nx*r,h,zz+nz*r],[x+nx*r,h,z+nz*r],m);
     strip(-w/20-.82,w/20+.82,.22,edge);strip(-w/20,w/20,.25,road);
     if(w>99)strip(-.09,.09,.27,edge);
   }
   for(const [rowIndex,row] of raw.b.entries()){
    const [height,min,style,original]=row;
    for(const encoded of clearance?.[rowIndex]??[original]){
     const loops=encoded.map(unpack),[x,z]=loops[0][0],h=height/10,bottom=.2+min/10,top=.2+h;
     if(top<=bottom||landmarks.some(l=>Math.abs(x-l.x)<160&&Math.abs(z-l.z)<160&&inside(l.x,l.z,loops[0])))continue;
     const seed=Math.abs(Math.round(x*11+z*3));
     const first=(encoded===original?loops[0]:unpack(original[0])).reduce((a,b)=>a[0]<b[0]||a[0]===b[0]&&a[1]<b[1]?a:b);
     const known=window.SEOUL_FACADES?.[[first[0]*4,first[1]*4].join(',')]||[];
     const kind=cladding[known[1]]??(style===2?(h>22?2:3):h>28?(style===1?1:[1,3,2,0][seed%4]):[5,0,6,3,5,0][seed%6]);
     const mat=panes[kind],pigment=recordedColor(known[0]);
     const roofColor=recordedColor(known[2])||[roof,color(0x637466),color(0x777976),color(0x686868)][seed%4];
     const xs=loops[0].map(p=>p[0]),zs=loops[0].map(p=>p[1]);
     const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
     const tenants=min===0?shops.filter(s=>!s.used&&s.x>=minX&&s.x<=maxX&&s.z>=minZ&&s.z<=maxZ&&inside(s.x,s.z,loops[0])&&!loops.slice(1).some(r=>inside(s.x,s.z,r))):[];
     const fronts=[];
     for(const ring of loops){
       for(let j=0;j<ring.length;j++){
         const [ax,az]=ring[j],[bx,bz]=ring[(j+1)%ring.length],length=Math.hypot(bx-ax,bz-az);
         if(length<.01)continue;
         const tone=.67+.19*(.55*(bz-az)-.83*(bx-ax))/length+.11*(seed%11)/10;
         const tint=pigment?pigment.clone().lerp(color(0xffffff),.32).multiplyScalar(tone):new T.Color(tone,tone*.98,tone*.95);
         const mx=(ax+bx)*.5,mz=(az+bz)*.5;
         let street=null,dist=28*28;
         if(min===0&&length>3.5&&ring===loops[0])for(const e of localRoads.get(Math.floor(mx/40)+','+Math.floor(mz/40))||[]){
           const q=world.projectEdge(e,mx,mz),parallel=Math.abs(e.tx*(bx-ax)+e.tz*(bz-az))/length;
           if(q.d2>.2&&q.d2<dist&&parallel>.70&&world.at(e,q.s).y<2.1&&!inside((mx+q.x)/2,(mz+q.z)/2,ring)){dist=q.d2;street=q;}
         }
         const shopfront=min===0&&(style===2||street&&(tenants.length||style!==1&&h<22));
         const storey=shopfront?Math.min(top,bottom+3.6):bottom;
         const span=Math.max(1,Math.round(length/(kind===1?4.05:3.35)))/16;
         if(storey>bottom)batch.quad(panes[7],[ax,bottom,az],[bx,bottom,bz],[bx,storey,bz],[ax,storey,az],tint,span,1/16);
         if(top>storey)batch.quad(mat,[ax,storey,az],[bx,storey,bz],[bx,top,bz],[ax,top,az],tint,span,Math.max(1,Math.round((top-storey)/3.2))/16,0,(seed%16)/16);
         batch.quad(solid,[ax,top,az],[bx,top,bz],[bx,top+.22,bz],[ax,top+.22,az],roofColor);
         if(street){
           const dx=(bx-ax)/length,dz=(bz-az)/length;
           const side=Math.sign((street.x-mx)*dz-(street.z-mz)*dx),nx=side*dz,nz=-side*dx;
           // Paved frontage meets the curb without crossing the carriageway.
           const setback=Math.min(12,Math.max(0,Math.sqrt(dist)-street.e.half));
           batch.quad(solid,[ax,.15,az],[bx,.15,bz],[bx+nx*setback,.15,bz+nz*setback],[ax+nx*setback,.15,az+nz*setback],curbStone);
           if(shopfront&&length>4){
             const extent=Math.min(length*.44,6),y=bottom+2.94;
             const edge=(u,d,h)=>[mx+u*dx+nx*d,h,mz+u*dz+nz*d];
             batch.quad(solid,edge(-extent,.08,y+.15),edge(extent,.08,y+.15),edge(extent,.60,y),edge(-extent,.60,y),roofColor);
             fronts.push({dist,edge,extent,y,mx,mz});
           }
         }
       }
     }
     fill(batch,loops,top,roofColor);
     for(const shop of tenants){
       if(!fronts.length||signs.length>=144)break;
       const cost=f=>(f.mx-shop.x)**2+(f.mz-shop.z)**2+.22*f.dist;
       fronts.sort((a,b)=>cost(a)-cost(b));
       const front=fronts.shift();shop.used=true;signs.push({name:shop.name,...front});
     }
   }
   }
   let signMaterial;
   if(signs.length){
     const canvas=document.createElement('canvas');canvas.width=512;canvas.height=Math.ceil(signs.length/2)*48;
     const ctx=canvas.getContext('2d');ctx.font='600 26px "Malgun Gothic",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
     const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;
     signMaterial=new T.MeshBasicMaterial({map:tex,side:T.DoubleSide});
     signs.forEach(({name,edge,extent,y},n)=>{
       const col=n%2,row=Math.floor(n/2),cy=row*48;
       ctx.fillStyle=['#383e3b','#e6dfd1','#454e53'][n%3];ctx.fillRect(col*256,cy,256,48);
       ctx.fillStyle=n%3===1?'#282e30':'#f1ece0';ctx.fillText(name,col*256+128,cy+25,237);
       const w=Math.min(extent,Math.max(1.6,name.length*.32));
       let a=edge(-w,.18,y+.18),b=edge(w,.18,y+.18);
       const out=edge(0,1,y),center=edge(0,0,y);
       if(-(b[2]-a[2])*(out[0]-center[0])+(b[0]-a[0])*(out[2]-center[2])<0)[a,b]=[b,a];
       batch.quad(signMaterial,a,b,[b[0],b[1]+.62,b[2]],[a[0],a[1]+.62,a[2]],color(0xffffff),.5,48/canvas.height,1-(cy+48)/canvas.height,col*.5);
     });
   }
   const group=batch.finish("Seoul map "+id);group.userData.signMaterial=signMaterial;
   group.children.forEach(mesh=>{mesh.castShadow=panes.includes(mesh.material);});return group;
 }
 const terrain=new Batch(),water=window.HAN_WATER.polygons;
 const outer=[[-40000,-35000],[-40000,35000],[40000,35000],[40000,-35000]];
 const rings=water.map(poly=>poly.map(r=>r.slice(0,-1).map(([lon,lat])=>{const p=world.project(lon,lat);return [p.x,p.z];})));
 world.waterPath=new Path2D();
 for(const polygon of rings)for(const ring of polygon){ring.forEach(([x,z],i)=>i?world.waterPath.lineTo(x,z):world.waterPath.moveTo(x,z));world.waterPath.closePath();}
 const ground=color(0x909188);
 fill(terrain,[outer,...rings.map(p=>p[0])],.10,ground);
 for(const poly of rings)for(const island of poly.slice(1))fill(terrain,[island],.10,ground);
 for(const polygon of rings)for(const ring of polygon){
   for(let i=0;i<ring.length;i++){const [x,z]=ring[i],[u,v]=ring[(i+1)%ring.length];
     terrain.quad(solid,[x,.1,z],[u,.1,v],[u,-3.7,v],[x,-3.7,z],color(0x5c6559));
   }
 }
 const land=terrain.finish('Seoul land and river islands'),soil=solid.clone();
 soil.onBeforeCompile=shader=>{
   shader.uniforms.daylight=HanDaylight;
   shader.vertexShader="varying vec2 field;\n"+shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nfield=position.xz;");
   shader.fragmentShader="varying vec2 field;uniform float daylight;\n"+shader.fragmentShader.replace("#include <color_fragment>",`#include <color_fragment>
     float lawn=.5+.5*sin(field.x*.24+field.y*.029);
     float variation=.93+.08*sin(field.x*.053+sin(field.y*.031))+.055*lawn;
     diffuseColor.rgb*=variation*mix(vec3(.27,.32,.40),vec3(1.11,1.08,1.01),daylight);`);
 };
 land.traverse(p=>{if(p.isMesh)p.material=soil;});
 function remove(g){g.removeFromParent();g.traverse(o=>o.geometry?.dispose());const m=g.userData.signMaterial;if(m){m.map.dispose();m.dispose();}}
 let previousPoint=null;
 function update(s){
   const location=world.point(s,0);if(!previousPoint||Math.hypot(location.x-previousPoint.x,location.z-previousPoint.z)>130){
     previousPoint=location;
     previous=s;const p=world.point(s,0);
     queue=Object.keys(source).map(id=>{const [x,z]=id.split(',').map(Number);return {id,d:Math.hypot((x+.5)*650-p.x,(z+.5)*650-p.z)};}).filter(c=>c.d<2580).sort((a,b)=>a.d-b.d).map(c=>c.id);
     target=new Set(queue);for(const [id,g] of loaded)if(!target.has(id)){remove(g);loaded.delete(id);world.streetMap.delete(id);}
   }
   while(pending.size<2&&queue.length){
     const id=queue.shift();if(loaded.has(id)||pending.has(id))continue;
     const clip=HAN_BUILDING_CLEARANCE[world.network?'network':world.id]?.[id];
     pending.add(id);Promise.all([readSeoulBlock(source[id]),clip?readSeoulBlock(clip):null]).then(([raw,clearance])=>{if(!closed&&target.has(id))loaded.set(id,make(id,raw,clearance));}).catch(e=>console.error('Map block '+id,e)).finally(()=>pending.delete(id));
   }
 }
 return {update,dispose(){closed=true;soil.dispose();for(const g of loaded.values())remove(g);loaded.clear();}};
};
