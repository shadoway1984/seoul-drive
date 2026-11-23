/* Batch the nearby OSM carriageways into tiles. Physics and rendering share their
   endpoints, widths and vertical profile. Adjacent strips use a mitered joint. */
window.drawSeoulStreets=function(T,scene,world){
 const live=new Map(),tile=world.cellSize;
 const mat=new T.MeshStandardMaterial({vertexColors:true,roughness:.92,metalness:.025,side:T.DoubleSide});
 const furniture=createSeoulFurniture(T,world);
 const colors={busBlue:0x197bb7,busGlass:0x253e50,busPavement:0x766665,asphalt:0x625f59,patch:0x605d58,white:0xe4e5dd,yellow:0xd9a83f,curb:0xa29b90,steel:0x919b9e,deck:0x626d72,pier:0x7b8284};
 for(const k in colors)colors[k]=new T.Color(colors[k]);
 let previous='';
 mat.onBeforeCompile=shader=>{
   shader.uniforms.roadWet=SeoulWeather.uniforms.wet;shader.uniforms.roadSnow=SeoulWeather.uniforms.snow;
   shader.vertexShader='varying vec3 roadWorld;attribute float pavement;varying float surfaceMask;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nroadWorld=position;surfaceMask=pavement;');
   shader.fragmentShader='varying vec3 roadWorld;varying float surfaceMask;uniform float roadWet,roadSnow;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 g=floor(roadWorld.xz*24.0);float grain=fract(sin(dot(mod(g,4096.0),vec2(12.9898,78.233)))*43758.5453);
      diffuseColor.rgb*=1.-.39*roadWet*surfaceMask;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.62,.69,.75),roadSnow*surfaceMask*(.63+.12*grain));
      float fade=1.0-smoothstep(14.0,54.0,distance(cameraPosition,roadWorld));diffuseColor.rgb*=1.0+(grain-.5)*.26*fade;`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.22,roadWet*surfaceMask);');
 };
 const signalFace=new T.Color(0x263438),signalLens=new T.Color(0x1d8e63);
 function make(edges,k){
 const pos=[],col=[],pavement=[],group=new T.Group();
 const [tileX,tileZ]=k.split(',').map(Number);
 const neighbors=world.nearby((tileX+.5)*tile,(tileZ+.5)*tile,tile);
 function tri(a,b,c,color){pos.push(...a,...b,...c);const mask=color===colors.asphalt||color===colors.patch||color===colors.busPavement?1:0;pavement.push(mask,mask,mask);for(let i=0;i<3;i++)col.push(color.r,color.g,color.b);}
 function quad(a,b,c,d,color){tri(a,b,c,color);tri(a,c,d,color);}
 for(const e of edges){
   const shape=world.roadShape(e),p=shape.point,breaks=shape.cuts.slice(1,-1),a=world.at(e,0);
   function slices(s,t,emit){for(const cut of breaks)if(cut>s&&cut<t){emit(s,cut);s=cut;}if(t>s)emit(s,t);}
   const band=(s,t,l,r,h,color)=>slices(s,t,(u,v)=>quad(p(u,l,h),p(v,l,h),p(v,r,h),p(u,r,h),color));
   const wall=(s,t,l,h,top,color)=>slices(s,t,(u,v)=>quad(p(u,l,h),p(v,l,h),p(v,l,top),p(u,l,top),color));
   const width=e.half,rank=e.flags&15,bridge=e.flags&32,freeway=rank<2;
   const margin=38;
   const close=neighbors.filter(o=>o!==e&&Math.max(o.ax,o.bx)>=Math.min(e.ax,e.bx)-margin&&Math.min(o.ax,o.bx)<=Math.max(e.ax,e.bx)+margin&&Math.max(o.az,o.bz)>=Math.min(e.az,e.bz)-margin&&Math.min(o.az,o.bz)<=Math.max(e.az,e.bz)+margin);
   function exposed(from,to,sign,offset,emit){
     let start=null;
     for(let s=from;s<to;s+=3){
       const end=Math.min(to,s+3),[px,y,pz]=p((end+s)*.5,sign*(width+offset),0);
       const covered=close.some(other=>{
         const q=world.projectEdge(other,px,pz);
         return q.raw>=0&&q.raw<=other.len&&Math.abs(q.lateral)<world.widthAt(other,q.s)+.18&&Math.abs(world.at(other,q.s).y-y)<1.4;
       });
       if(!covered&&start===null)start=s;
       if(covered&&start!==null){emit(start,s);start=null;}
     }
     if(start!==null)emit(start,to);
   }
   band(0,e.len,-width,width,0,e.id%7?colors.asphalt:colors.patch);
   // Fill the open wedge between road polygons at a shared junction.
   for(const [a,b,c] of shape.junction)tri(a,b,c,colors.asphalt);
   const phase=(Math.abs(a.x*e.tx+a.z*e.tz)%9);
   for(let lane=1;lane<e.lanes;lane++){
     const l=-width+2*width*lane/e.lanes;
     if(!(e.flags&16)&&lane===Math.floor(e.lanes/2)){band(0,e.len,l-.075,l+.075,.021,colors.yellow);continue;}
     for(let s=-phase;s<e.len;s+=9){const from=Math.max(0,s),to=Math.min(e.len,s+3.5);if(to>from)band(from,to,l-.07,l+.07,.02,colors.white);}
   }
   if(freeway||bridge||rank<4)for(const side of [-1,1]){
     const l=side*(width-.22);
     exposed(0,e.len,side,.18,(s,t)=>band(s,t,l-.075,l+.075,.021,(side===1&&(e.flags&16)&&freeway)?colors.yellow:colors.white));
   }
   SeoulTransit.addLane(e,band,colors.busBlue);
   // Profile starts at the exact face used by the contact solver. Capped
   // concrete parapets and backed steel beams follow the shared road outline.
   const borders=world.roadBorders(e);
   for(const border of borders){
     if(!bridge&&!freeway&&border.sign)continue;
     const {a,b,nx,nz}=border,length=Math.hypot(b[0]-a[0],b[2]-a[2]);
     const at=(t,d,h)=>[a[0]+(b[0]-a[0])*t+nx*d,a[1]+(b[1]-a[1])*t+h,a[2]+(b[2]-a[2])*t+nz*d];
     function prism(lo,hi,profile,tint){
       for(let i=0;i<profile.length;i++){
         const c=profile[i],d=profile[(i+1)%profile.length];
         quad(at(lo,...c),at(hi,...c),at(hi,...d),at(lo,...d),tint);
       }
       for(let i=1;i<profile.length-1;i++)for(const t of [lo,hi])tri(at(t,...profile[0]),at(t,...profile[i]),at(t,...profile[i+1]),tint);
     }
     function model(name,start,span,tint){
       const mesh=HAN_GUARDRAIL[name],vertices=mesh.p.map(([x,d,h])=>at(start+x*span,d,h));
       for(const [i,j,k] of mesh.i)tri(vertices[i],vertices[j],vertices[k],tint);
     }
     if(!bridge&&!freeway){
       prism(0,1,[[0,-.03],[0,.13],[.28,.13],[.28,-.03]],colors.curb);
     }else if(bridge){
       model('parapet',0,1,colors.curb);
     }else{
       model('beam',0,1,colors.steel);
       const count=Math.max(1,Math.ceil(length/3.8));
       for(let i=0;i<count;i++){
         if(length<.20)break;
         const mid=(i+.5)/count;
         model('post',mid,1/length,colors.deck);model('bolt',mid,1/length,colors.steel);
       }
     }
   }
   for(const [node,s0,dir] of [[e.a,0,1],[e.b,e.len,-1]]){
     const feature=world.signs.get(node);if(!feature||world.adj[node][0]!==e||e.len<3)continue;
     if(feature&2){for(let l=-width+.35;l<width-.4;l+=1.04)band(Math.min(s0,s0+dir*3),Math.max(s0,s0+dir*3),l,Math.min(l+.52,width),.033,colors.white);}
     if(feature&1){const s=Math.max(.6,Math.min(e.len-1.5,s0+dir*1.3)),l=-width-.38;
       const foot=p(s,l);if(HanRoadClearance.blocked(world,foot[0],foot[2],.3,foot[1],foot[1]+5.6))continue;
       wall(s,s+.20,l,0,5.6,colors.steel);band(s,s+.16,l,l+3.7,5.58,colors.steel);
       quad(p(s,l+2.2,5.09),p(s,l+3.7,5.09),p(s,l+3.7,5.57),p(s,l+2.2,5.57),signalFace);
       quad(p(s-.02,l+3.25,5.23),p(s-.02,l+3.52,5.23),p(s-.02,l+3.52,5.45),p(s-.02,l+3.25,5.45),signalLens);
     }
   }
   if(bridge){
     band(0,e.len,-width-.32,width+.32,-.81,colors.deck);
     for(const [s,end] of HanRoadClearance.piers(world,e,phase)){const l=Math.min(2.4,width*.45);for(const v of [-l,l])wall(s,end,v,-11,-.8,colors.pier);band(s,end,-l,l,-1.05,colors.pier);}
   }
   if(!bridge&&!(e.flags&128)){
     const urban=!freeway&&!(e.flags&64)&&rank<7;
     for(const sign of [-1,1]){
       const sidewalk=urban?(rank<4?2.15:1.35):.22;
       for(const border of borders){
       if(border.sign!==sign)continue;
       const start=border.s,end=border.t;
       wall(start,end,sign*width,-.06,urban?.13:.015,colors.curb);
       band(start,end,sign*width,sign*(width+sidewalk),urban?.13:0,colors.curb);
       // Exposed sides extend to terrain on approach embankments.
       const outer=sign*(width+sidewalk);
       slices(start,end,(u,v)=>{
         const a=p(u,outer,.1),b=p(v,outer,.1),raised=Math.max(a[1],b[1])>1.6;
         const count=raised?Math.max(1,Math.ceil((v-u)/3)):1;
         for(let j=0;j<count;j++){
           const q=p(u+(v-u)*j/count,outer,.1),r=p(u+(v-u)*(j+1)/count,outer,.1);
           if(raised&&HanRoadClearance.blocked(world,(q[0]+r[0])/2,(q[2]+r[2])/2,Math.hypot(q[0]-r[0],q[2]-r[2])/2+.12,.10,Math.max(q[1],r[1]),e))continue;
           quad(q,r,[r[0],.10,r[2]],[q[0],.10,q[2]],colors.deck);
         }
       });
       }
     }
   }
 }
 SeoulTransit.addTile(k,world,quad,colors);
 if(pos.length){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(col,3));g.setAttribute('pavement',new T.Uint8BufferAttribute(pavement,1));g.computeVertexNormals();g.computeBoundingSphere();const m=new T.Mesh(g,mat);m.receiveShadow=true;group.add(m);}
 furniture.add(group,k);
 group.name='서울 도로 '+k;scene.add(group);return group;
 }
 function update(s){const p=world.point(s);const i=Math.floor(p.x/tile),j=Math.floor(p.z/tile),current=i+','+j;if(current===previous)return;previous=current;
   const wanted=new Set();for(let x=i-3;x<=i+3;x++)for(let z=j-3;z<=j+3;z++){const k=x+','+z;if(world.grid.has(k)||furniture.has(k)||SeoulTransit.has(k))wanted.add(k);}
   for(const [k,g] of live)if(!wanted.has(k)){g.removeFromParent();g.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh)o.geometry.dispose();if(o.isInstancedMesh)o.dispose();});live.delete(k);}
   for(const k of wanted)if(!live.has(k))live.set(k,make(world.grid.get(k)||[],k));
 }
 return {update};
};
