window.makeNetworkTraffic=function(world,sceneCars,detailed,lodDamage){
 let seed=4913;const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 function pose(c){const e=c.edge,sign=c.sign,lane=world.driveOffset(e,c.s);
   const q=world.at(e,c.s,sign*lane);Object.assign(c,{x:q.x,z:q.z,yaw:q.yaw+(sign<0?Math.PI:0),y:q.y+.02});}
 function spawn(c,car,i){const opts=world.nearby(car.x,car.z,410).filter(e=>(e.flags&15)<6&&e.len>8);
   if(!opts.length){c.edge=null;c.group.visible=false;return;}
   const seedEdge=i<5?world.current:opts[Math.floor(rng()*opts.length)];c.edge=seedEdge;c.sign=(c.edge.flags&16)||rng()>.28?1:-1;
   c.s=i<5?Math.min(seedEdge.len,car.s):seedEdge.len*rng();
   c.damage=HanCollision.newDamage();c.dynamic=false;c.u=9+rng()*9;c.v=c.omega=0;
   advance(c,25+i*24);pose(c);
   if(Math.hypot(c.x-car.x,c.z-car.z)<10){c.edge=null;c.group.visible=false;}
 }
 function advance(c,distance){
   for(let i=0;i<160&&distance>.00001;i++){
     const e=c.edge,end=c.sign>0?e.b:e.a,remaining=c.sign>0?e.len-c.s:c.s;
     if(distance<=remaining){c.s+=c.sign*distance;return;}
     distance-=remaining;const next=world.adjacent(e,end).map(v=>{const sign=v.a===end?1:-1;return {e:v,sign,score:(v.tx*e.tx+v.tz*e.tz)*sign*c.sign+rng()*.16};}).sort((a,b)=>b.score-a.score)[0];
     if(!next){c.s=c.sign>0?e.len:0;c.u=0;return;}
     c.edge=next.e;c.sign=next.sign;c.s=c.sign>0?0:c.edge.len;
   }
 }
 function step(dt,car){
   for(const [i,c] of sceneCars.entries()){
     if(!c.edge||Math.hypot(c.x-car.x,c.z-car.z)>590){spawn(c,car,i);continue;}
     if(c.dynamic){
       c.x+=(Math.sin(c.yaw)*c.u+Math.cos(c.yaw)*c.v)*dt;c.z+=(Math.cos(c.yaw)*c.u-Math.sin(c.yaw)*c.v)*dt;c.yaw+=c.omega*dt;
       HanCollision.networkRails(c,world,c.y);
       const q=world.projectEdge(c.edge,c.x,c.z);c.s=q.s;c.y=world.at(c.edge,c.s).y+.02;
       c.u*=Math.exp(-1.0*dt);c.v*=Math.exp(-2*dt);c.omega*=Math.exp(-2*dt);
     }else{advance(c,c.u*dt);pose(c);}
     if(Math.abs(c.y-world.height(car.s))<2&&HanCollision.pair(car,c)){c.dynamic=true;HanCollision.rail(car,world);}
   }
 }
 function render(car){const near=[];for(const c of sceneCars){c.group.visible=!!c.edge;if(!c.edge)continue;c.group.position.set(c.x,c.y,c.z);c.group.rotation.y=c.yaw;
   const d=Math.hypot(c.x-car.x,c.z-car.z);if(d<110)near.push({c,d});}
   near.sort((a,b)=>a.d-b.d);detailed.forEach((g,i)=>{const c=near[i]?.c;g.visible=!!c;if(!c)return;c.group.visible=false;g.position.copy(c.group.position);g.rotation.y=c.yaw;lodDamage[i](c.damage);});
   for(const c of sceneCars)if(c.group.visible)c.drawDamage(c.damage);
 }
 return {cars:sceneCars,step,render,reset(s){const car={...world.point(s),s};sceneCars.forEach((c,i)=>spawn(c,car,i));render(car);}};
};
