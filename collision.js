/* Planar rigid bodies, metres and seconds. The normal points from A towards B. */
window.HanCollision = (() => {
  function basis(b) {
    const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
    return [{x:c,z:-s},{x:s,z:c}];
  }
  function corners(b, axes) {
    return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j]) => ({
      x:b.x+i*b.halfWidth*axes[0].x+j*b.halfLength*axes[1].x,
      z:b.z+i*b.halfWidth*axes[0].z+j*b.halfLength*axes[1].z
    }));
  }
  const dot = (p,n) => p.x*n.x+p.z*n.z;
  const extent = (b,axes,n) => b.halfWidth*Math.abs(dot(axes[0],n))+b.halfLength*Math.abs(dot(axes[1],n));
  function pointSpeed(b,px,pz) {
    const [left,forward]=basis(b);
    const cg=b.centerOfMassZ||0;
    return {x:forward.x*b.u+left.x*b.v+b.omega*(pz-b.z-cg*forward.z),
            z:forward.z*b.u+left.z*b.v-b.omega*(px-b.x-cg*forward.x)};
  }
  const lever = (b,px,pz,n) => (pz-b.z)*n.x-(px-b.x)*n.z-
    (b.centerOfMassZ||0)*(Math.cos(b.yaw)*n.x-Math.sin(b.yaw)*n.z);
  function invMass(b,px,pz,n) {
    return b ? 1/b.mass + lever(b,px,pz,n)**2/b.inertia : 0;
  }
  function impulse(b,px,pz,n,j) {
    const [left,forward]=basis(b);
    b.u+=j*dot(n,forward)/b.mass;
    b.v+=j*dot(n,left)/b.mass;
    b.omega+=j*lever(b,px,pz,n)/b.inertia;
    b.impact?.(j*dot(n,forward)/b.mass,j*dot(n,left)/b.mass);
  }
  function mark(b,px,pz,n,dv) {
    if(dv<.85)return;
    const axes=basis(b), relative={x:px-b.x,z:pz-b.z};
    const x=Math.max(-b.halfWidth,Math.min(b.halfWidth,dot(relative,axes[0])));
    const z=Math.max(-b.halfLength,Math.min(b.halfLength,dot(relative,axes[1])));
    const nx=dot(n,axes[0]),nz=dot(n,axes[1]);
    b.damageWheel?.(x,z,dv);
    const key=Math.abs(nz)>.67 ? (nz>0?'rear':'front')+Math.round(x/.7) : (nx>0?'right':'left')+Math.round(z/1.2);
    const depth=Math.min(.78,.017*(dv-.65)**1.32);
    const old=b.damage.zones[key], total=(old?.depth||0)+depth;
    const mix=(a,v)=>old?(old[a]*old.depth+v*depth)/total:v;
    b.damage.zones[key]={x:mix('x',x),z:mix('z',z),nx:mix('nx',nx),nz:mix('nz',nz),depth:Math.min(.78,total)};
    const zone=b.damage.zones[key];
    b.damage.last=zone;
    if(z>1.08){
      // A crushed front corner impairs steering alignment. A compacted nose reduces drive torque.
      const severe=Math.max(0,zone.depth-.18);
      const corner=x>.38?'leftFront':x<-.38?'rightFront':null;
      if(corner)b.damage[corner]=Math.max(b.damage[corner],severe);
      b.damage.nose=Math.max(b.damage.nose,severe);
    }
    b.damage.revision++;
  }
  function resolve(a,b,n,px,pz,depth,material=b?'vehicle':'concrete') {
    function relative(axis) {
      return (b?dot(pointSpeed(b,px,pz),axis):0)-dot(pointSpeed(a,px,pz),axis);
    }
    function push(axis,j) {
      impulse(a,px,pz,axis,-j);
      if(b)impulse(b,px,pz,axis,j);
    }
    const vn=relative(n);
    if(vn<0){
      const restitution=vn < -1.5 ? (b ? .08 : .045) : 0;
      const j=-(1+restitution)*vn/(invMass(a,px,pz,n)+invMass(b,px,pz,n));
      push(n,j);
      a.contactSound?.(material,j/a.mass);
      b?.contactSound?.(material,j/b.mass);
      const t={x:-n.z,z:n.x}, maxFriction=(b ? .44 : .31)*j;
      const jt=-relative(t)/(invMass(a,px,pz,t)+invMass(b,px,pz,t));
      push(t,Math.max(-maxFriction,Math.min(maxFriction,jt)));
      mark(a,px,pz,{x:-n.x,z:-n.z},j/a.mass);
      if(b)mark(b,px,pz,n,j/b.mass);
    }
    const shift=Math.max(0,depth-.0015)*.85, share=b?b.mass/(a.mass+b.mass):1;
    a.x-=n.x*shift*share; a.z-=n.z*shift*share;
    if(b){b.x+=n.x*shift*(1-share);b.z+=n.z*shift*(1-share);}
  }
  // Intersect each hull with the contact plane to locate a common contact patch.
  function span(poly,n,d,t) {
    const values=[];
    for(let i=0;i<4;i++){
      const a=poly[i],b=poly[(i+1)%4],da=dot(a,n)-d,db=dot(b,n)-d;
      if(Math.abs(da)<1e-7)values.push(dot(a,t));
      if(da*db<0)values.push(dot(a,t)+(dot(b,t)-dot(a,t))*da/(da-db));
    }
    return [Math.min(...values),Math.max(...values)];
  }
  function pair(a,b) {
    const delta={x:b.x-a.x,z:b.z-a.z};
    if(delta.x**2+delta.z**2>(Math.hypot(a.halfWidth,a.halfLength)+Math.hypot(b.halfWidth,b.halfLength))**2)return false;
    const aa=basis(a),bb=basis(b); let depth=Infinity,n;
    for(const axis of [...aa,...bb]){
      const offset=dot(delta,axis),overlap=extent(a,aa,axis)+extent(b,bb,axis)-Math.abs(offset);
      if(overlap<=0)return false;
      if(overlap<depth){depth=overlap;const sign=offset>=0?1:-1;n={x:axis.x*sign,z:axis.z*sign};}
    }
    const plane=(dot(a,n)+extent(a,aa,n)+dot(b,n)-extent(b,bb,n))*.5,t={x:-n.z,z:n.x};
    const sa=span(corners(a,aa),n,plane,t),sb=span(corners(b,bb),n,plane,t);
    let mid=(Math.max(sa[0],sb[0])+Math.min(sa[1],sb[1]))*.5;
    if(!Number.isFinite(mid))mid=(dot(a,t)+dot(b,t))*.5;
    resolve(a,b.fixed?null:b,n,n.x*plane+t.x*mid,n.z*plane+t.z*mid,depth,b.material||'vehicle');
    return true;
  }
  const localBorders=new WeakMap();
  function breakRail(body,road,key,material,n,x,z,tile){
    if(road.brokenRails?.has(key))return true;
    const speed=dot(pointSpeed(body,x,z),n);
    if(speed<=0)return false;
    const mass=1/invMass(body,x,z,n),energy=.5*mass*speed*speed;
    // Estimated energy absorption of one installed section, not a crash rating.
    const capacity=material==='steel'?48000:190000;
    if(energy<=capacity)return false;
    const loss=mass*(speed-Math.sqrt(2*(energy-capacity)/mass));
    impulse(body,x,z,n,-loss);
    mark(body,x,z,{x:-n.x,z:-n.z},loss/body.mass);
    body.contactSound?.(material,Math.max(2,loss/body.mass));
    (road.brokenRails??=new Set()).add(key);
    (road.damagedTiles??=new Set()).add(tile);road.railRevision=(road.railRevision||0)+1;
    return true;
  }
  function networkRails(b,road,height){
    let cache=localBorders.get(b);
    if(!cache||cache.road!==road||Math.hypot(cache.x-b.x,cache.z-b.z)>6){
      const lines=[];
      for(const e of road.edgesIn(b.x-12,b.z-12,b.x+12,b.z+12))
        for(const r of road.roadBorders(e)){
          if(Math.min(r.a[0],r.b[0])-12<=b.x&&Math.max(r.a[0],r.b[0])+12>=b.x&&
             Math.min(r.a[2],r.b[2])-12<=b.z&&Math.max(r.a[2],r.b[2])+12>=b.z)lines.push(r);
        }
      cache={road,x:b.x,z:b.z,lines};localBorders.set(b,cache);
      b.climbing?.clear();
    }
    const axes=basis(b),radius=Math.hypot(b.halfWidth,b.halfLength);
    for(let pass=0;pass<3;pass++){
      let changed=false;
      for(const r of cache.lines){
        if(road.brokenRails?.has(r.key))continue;
        const [x,y,z]=r.a,dx=r.b[0]-x,dz=r.b[2]-z,len=Math.hypot(dx,dz),tx=dx/len,tz=dz/len;
        const t=(b.x-x)*tx+(b.z-z)*tz,n=(b.x-x)*r.nx+(b.z-z)*r.nz;
        if(t< -radius||t>len+radius||Math.abs(n)>radius+.2||Math.abs(height-y-(r.b[1]-y)*Math.min(1,Math.max(0,t/len)))>1.7)continue;
        // Clip the car hull to the finite rail. End caps stay passable on
        // the open side of a ramp without extending a phantom wall beyond it.
        let poly=corners(b,axes).map(p=>({...p,t:(p.x-x)*tx+(p.z-z)*tz}));
        for(const [end,sign] of [[0,1],[len,-1]]){
          const out=[];
          for(let i=0;i<poly.length;i++){
            const a=poly[i],d=poly[(i+1)%poly.length],u=sign*(a.t-end),v=sign*(d.t-end);
            if(u>=0)out.push(a);
            if(u*v<0){const k=u/(u-v);out.push({x:a.x+k*(d.x-a.x),z:a.z+k*(d.z-a.z),t:end});}
          }
          poly=out;
        }
        if(!poly.length)continue;
        let depth=-Infinity,low=Infinity,contact;
        for(const p of poly){const v=(p.x-x)*r.nx+(p.z-z)*r.nz;low=Math.min(low,v);if(v>depth){depth=v;contact=p;}}
        if(depth<=.0001||low>.30)continue;
        const normal={x:r.nx,z:r.nz};
        const speed=dot(pointSpeed(b,contact.x,contact.z),normal);
        if(r.material==='curb'&&b.wheels){
          // Compare wheel-normal kinetic energy and available driven-wheel thrust
          // to the work and moment required to lift a loaded wheel onto the step.
          const radius=Math.min(...b.wheels.map(w=>w.radius)),h=r.step;
          const arm=Math.sqrt(Math.max(0,2*radius*h-h*h));
          const thrust=Math.abs(b.driveForce||0)*Math.abs(dot(normal,basis(b)[1]));
          if(h<radius&&(b.climbing?.has(r.key)||h<=.02||speed*speed>=2*9.81*h||thrust*(radius-h)>=b.mass*9.81*.30*arm)){
            if(speed>.65 && !b.climbing?.has(r.key)){
              b.contactSound?.('curb',speed*.4);
              b.climbing?.add(r.key);
            }
            continue;
          }
          if(n>0||speed<=0)continue;
        }
        if(r.material==='steel'||r.material==='parapet'){
          const e=r.edge,size=road.cellSize,tile=Math.floor((e.ax+e.bx)/(2*size))+','+Math.floor((e.az+e.bz)/(2*size));
          if(breakRail(b,road,r.key,r.material,normal,contact.x,contact.z,tile))continue;
        }
        resolve(b,null,normal,contact.x,contact.z,depth,r.material);
        const rest=depth-Math.max(0,depth-.0015)*.85;
        b.x-=r.nx*rest;b.z-=r.nz*rest;changed=true;
      }
      if(!changed)break;
    }
  }
  function rail(b,road) {
    if(b.flight)return;
    const near=road.network?road.locate(b):road.nearest(b.x,b.z,b.s);
    b.s=near.s; b.lateral=near.lateral;
    if(road.network){
      const e=near.e,n=near.raw<0?e.a:e.b,excess=near.raw<0?-near.raw:near.raw-e.len;
      if(excess>0){
        const allowed=road.endAllowance(e,n,b.x,b.z);
        if(excess>allowed){
          const dir=n===e.a?-1:1,normal={x:e.tx*dir,z:e.tz*dir};
          const overshoot=excess-allowed;
          resolve(b,null,normal,b.x+normal.x*b.halfLength,b.z+normal.z*b.halfLength,overshoot);
          b.x-=normal.x*(overshoot-Math.max(0,overshoot-.0015)*.85);
          b.z-=normal.z*(overshoot-Math.max(0,overshoot-.0015)*.85);
        }
      }
      networkRails(b,road,road.at(e,near.s).y);
      const q=road.projectEdge(e,b.x,b.z);b.s=q.s;b.lateral=q.lateral;return;
    }
    const side=Math.sign(near.lateral)||1, half=road.lanesAt(b.s)*1.75;
    const limit=half+(side>0?.19:.53);
    if(Math.abs(b.lateral)+Math.hypot(b.halfWidth,b.halfLength)<limit)return;
    const n={x:side*Math.cos(near.yaw),z:-side*Math.sin(near.yaw)};
    const poly=corners(b,basis(b)), ahead=poly.map(p=>dot(p,n)),max=Math.max(...ahead);
    const depth=max-dot(near,n)-limit;
    if(depth<=0)return;
    const hits=poly.filter((p,i)=>max-ahead[i]<.018);
    const x=hits.reduce((s,p)=>s+p.x,0)/hits.length,z=hits.reduce((s,p)=>s+p.z,0)/hits.length;
    if(road.tourPanel && Math.abs(near.lateral)>limit+b.halfWidth+1)return;
    if(road.tourPanel){
      const station=road.nearest(x,z,b.s).s;
      if(breakRail(b,road,road.tourPanel(station,side),'parapet',n,x,z,Math.floor(station/288)))return;
    }
    resolve(b,null,n,x,z,depth);
    b.lateral=(b.x-near.x)*Math.cos(near.yaw)-(b.z-near.z)*Math.sin(near.yaw);
  }
  function scenery(){
    const grid=new Map(),owners=new Map(),cell=32;
    function add(owner,o,rx,rz){
      let entries=owners.get(owner);if(!entries)owners.set(owner,entries=[]);
      for(let i=Math.floor((o.x-rx)/cell);i<=Math.floor((o.x+rx)/cell);i++)
      for(let j=Math.floor((o.z-rz)/cell);j<=Math.floor((o.z+rz)/cell);j++){
        const key=i+','+j;let bucket=grid.get(key);if(!bucket)grid.set(key,bucket=new Set());
        bucket.add(o);entries.push([key,o]);
      }
    }
    function wall(owner,ax,az,bx,bz,width,bottom,top,material='concrete'){
      const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);if(len<.001)return;
      const o={fixed:true,x:(ax+bx)/2,z:(az+bz)/2,yaw:Math.atan2(dx,dz),halfWidth:width/2,halfLength:len/2,bottom,top,material};
      add(owner,o,(Math.abs(dx)+width)/2,(Math.abs(dz)+width)/2);
    }
    function post(owner,x,z,r,bottom,top,material){add(owner,{x,z,r,bottom,top,material},r,r);}
    function remove(owner){
      for(const [key,o] of owners.get(owner)||[]){const bucket=grid.get(key);bucket.delete(o);if(!bucket.size)grid.delete(key);}
      owners.delete(owner);
    }
    function hit(car,y){
      const seen=new Set(),radius=Math.hypot(car.halfWidth,car.halfLength);
      for(let i=Math.floor((car.x-radius)/cell);i<=Math.floor((car.x+radius)/cell);i++)
      for(let j=Math.floor((car.z-radius)/cell);j<=Math.floor((car.z+radius)/cell);j++)
      for(const o of grid.get(i+','+j)||[]){
        if(seen.has(o)||y+1.415<o.bottom||y+.12>o.top)continue;seen.add(o);
        if(!o.r){pair(car,o);continue;}
        const [left,fwd]=basis(car),d={x:o.x-car.x,z:o.z-car.z};
        const lx=Math.max(-car.halfWidth,Math.min(car.halfWidth,dot(d,left)));
        const lz=Math.max(-car.halfLength,Math.min(car.halfLength,dot(d,fwd)));
        const x=car.x+lx*left.x+lz*fwd.x,z=car.z+lx*left.z+lz*fwd.z,len=Math.hypot(o.x-x,o.z-z);
        if(len>=o.r)continue;
        if(len>.00001){resolve(car,null,{x:(o.x-x)/len,z:(o.z-z)/len},x,z,o.r-len,o.material);continue;}
        const side=car.halfWidth-Math.abs(lx),end=car.halfLength-Math.abs(lz);
        const axis=side<end?left:fwd,sign=Math.sign(side<end?lx:lz)||1;
        resolve(car,null,{x:axis.x*sign,z:axis.z*sign},x,z,o.r+Math.min(side,end),o.material);
      }
    }
    return {wall,post,remove,hit};
  }
  return {pair,rail,networkRails,scenery,newDamage:()=>({zones:{},revision:0,nose:0,leftFront:0,rightFront:0})};
})();
