window.buildTraffic=function(T,scene,road,player){
 const points=[[-2.14,.4,.73],[-2.13,.79,.8],[-1.74,.84,.87],[-1.24,.9,.87],[-.81,1.37,.68],[.40,1.42,.66],[1.08,.90,.82],[1.82,.82,.84],[2.15,.65,.8],[2.11,.38,.75]];
 function skin(){const pos=[],idx=[],mats=[];for(let k=0;k<points.length;k++){const[z,h,w]=points[k];pos.push(-w,h-.06,z,-w*.88,h,z,w*.88,h,z,w,h-.06,z);}const g=new T.BufferGeometry();for(let k=0;k<points.length-1;k++)for(let j=0;j<3;j++){const a=k*4+j;idx.push(a,a+1,a+4,a+1,a+5,a+4);mats.push(k>=3&&k<=5?1:0);}g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);for(let i=0;i<mats.length;){let j=i+1;while(j<mats.length&&mats[j]===mats[i])j++;g.addGroup(i*6,(j-i)*6,mats[i]);i=j;}g.computeVertexNormals();return g;}
 const shell=skin(),bodyGeo=new T.BoxGeometry(1.72,.43,4.12), wheelGeo=new T.CylinderGeometry(.315,.315,.17,14);wheelGeo.rotateZ(Math.PI/2);
 const materials=[0xc8cdd0,0x32485b,0x83878a,0x423c41,0xe6ded5,0x303137,0x6d3540].map(c=>new T.MeshStandardMaterial({color:c,metalness:.55,roughness:.29,side:T.DoubleSide}));
 const glass=new T.MeshStandardMaterial({color:0x25353f,metalness:.42,roughness:.18,side:T.DoubleSide}), rubber=new T.MeshStandardMaterial({color:0x191c1d,roughness:.88}),lamp=new T.MeshStandardMaterial({color:0x991e18,emissive:0xb52215,emissiveIntensity:2.4}),white=new T.MeshStandardMaterial({color:0xe2e7de,emissive:0xfff0c5,emissiveIntensity:2.7});
 const detailed=[];
 for(const color of [0x626d79,0x868782,0x263a49]){
   const g=player.group.clone(true);g.visible=false;const variants=new Map();
   g.traverse(part=>{if(!part.isMesh&&!part.isSprite)return;const material=part.material;
     if(!variants.has(material)){const copy=material.clone();if(copy.isMeshPhysicalMaterial&&copy.clearcoat>.8)copy.color.setHex(color);
       if(copy===player.brakeLights[0]||material===player.brakeLights[0])copy.emissiveIntensity=1.2;
       variants.set(material,copy);}
     part.material=variants.get(material);});
   scene.add(g);detailed.push(g);
 }
 const cars=[],lampGeo=new T.BoxGeometry(.48,.075,.04);const add=(p,g,m,x,y,z)=>{let mesh=new T.Mesh(g,m);mesh.position.set(x,y,z);p.add(mesh);return mesh;};
 for(let i=0;i<13;i++){let group=new T.Group(),mat=materials[i%materials.length];add(group,bodyGeo,mat,0,.54,0).castShadow=true;add(group,shell,[mat,glass],0,0,0).castShadow=true;for(const x of [-.84,.84])for(const z of [-1.36,1.32])add(group,wheelGeo,rubber,x,.315,z);
 for(const x of [-.58,.58]){add(group,lampGeo,lamp,x,.70,-2.09);add(group,lampGeo,white,x,.67,2.10);}scene.add(group);const ahead=i%3!==0;
 cars.push({group,initial:(i-4)*112+55,offset:[-5.325,-1.775,1.775,5.325][i%4],velocity:(ahead?1:-1)*(15+(i*3)%9),s:0});}

 const lodDamage=detailed.map(g=>HanDamageView(T,g.children[0]));
 for(const [i,c] of cars.entries()){
   c.audioIndex=i;c.mass=1430+83*(i%5);c.inertia=c.mass*1.73;c.halfWidth=.95;c.halfLength=2.32;
   c.drawDamage=HanDamageView(T,c.group);
 }
 function lanePose(c){
   if(c.velocity>0)return road.point(c.s,c.offset);
   const base=road.point(c.s),other=road.opposite(c.s), gap=Math.hypot(other.x-base.x,other.z-base.z);
   // Use the same opposite-carriageway fallback as the rendered road.
   if(gap<road.lanesAt(c.s)*1.75*1.45){
     const p=road.point(c.s,road.lanesAt(c.s)*3.5+1.25-c.offset);
     return {...p,yaw:p.yaw+Math.PI};
   }
   return {x:other.x+Math.cos(other.yaw)*c.offset,z:other.z-Math.sin(other.yaw)*c.offset,yaw:other.yaw};
 }
 function followLane(c){
   const pose=lanePose(c);
   c.x=pose.x;c.z=pose.z;c.yaw=pose.yaw;c.u=Math.abs(c.velocity);c.v=0;c.omega=0;
 }
 function spawn(c,station){
   c.s=station;c.dynamic=false;c.damage=HanCollision.newDamage();followLane(c);
 }
 function integrate(c,dt){
   const lane=road.point(c.s),angle=Math.atan2(Math.sin(c.yaw-lane.yaw),Math.cos(c.yaw-lane.yaw));
   const desired=Math.max(-.3,Math.min(.3,(c.offset-c.lateral)*.08));
   const targetYaw=Math.max(-.45,Math.min(.45,(desired-angle)*1.4));
   const s=Math.sin(c.yaw),k=Math.cos(c.yaw);
   // Integrate in world space so yaw alone cannot redirect post-impact momentum.
   c.u+=(Math.max(-3,Math.min(1.35,c.velocity*.85-c.u)))*dt;
   c.v*=Math.exp(-1.8*dt);
   const vx=s*c.u+k*c.v,vz=k*c.u-s*c.v;
   c.omega+=(targetYaw-c.omega)*(1-Math.exp(-1.8*dt));
   c.yaw+=c.omega*dt;c.x+=vx*dt;c.z+=vz*dt;
   c.u=vx*Math.sin(c.yaw)+vz*Math.cos(c.yaw);
   c.v=vx*Math.cos(c.yaw)-vz*Math.sin(c.yaw);
   HanCollision.rail(c,road);
 }
 function step(dt,car){
   for(const c of cars){
     if(c.s<car.s-550||c.s>car.s+980){spawn(c,c.s+(c.s<car.s?1450:-1450));}
     if(c.dynamic)integrate(c,dt);
     else{c.s+=c.velocity*dt;if(c.s>0&&c.s<road.length)followLane(c);}
   }
   const local=cars.filter(c=>c.velocity>0&&c.s>0&&c.s<road.length&&Math.abs(c.s-car.s)<160);
   const participants=[car,...local];
   for(let pass=0;pass<3;pass++){
     let touched=false;
     for(let i=0;i<participants.length;i++)for(let j=i+1;j<participants.length;j++){
       const a=participants[i],b=participants[j];
       if(Math.abs(a.s-b.s)>9||!HanCollision.pair(a,b))continue;
       if(a!==car)a.dynamic=true;
       b.dynamic=true;HanCollision.rail(a,road);HanCollision.rail(b,road);touched=true;
     }
     if(!touched)break;
   }
 }
 function render(car){
   const near=[];
   for(const c of cars){
     c.group.visible=c.s>0&&c.s<road.length&&Math.abs(c.s-car.s)<900;
     if(!c.group.visible)continue;
     c.group.position.set(c.x,road.height(c.s)+.02,c.z);c.group.rotation.y=c.yaw;
     const distance=Math.hypot(c.x-car.x,c.z-car.z);
     if(distance<110)near.push({c,distance});
   }
   near.sort((a,b)=>a.distance-b.distance);
   detailed.forEach((g,i)=>{
     const c=near[i]?.c;g.visible=!!c;if(!c)return;
     c.group.visible=false;g.position.copy(c.group.position);g.rotation.y=c.yaw;lodDamage[i](c.damage);
   });
   for(const c of cars)if(c.group.visible)c.drawDamage(c.damage);
 }
 function reset(station=0){
   for(const c of cars)spawn(c,station+c.initial);
   render({...road.point(station),s:station});
 }
 if(road.network)return makeNetworkTraffic(road,cars,detailed,lodDamage);
 reset();return {reset,step,render,cars};
};
