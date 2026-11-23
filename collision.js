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
    return {x:forward.x*b.u+left.x*b.v+b.omega*(pz-b.z),
            z:forward.z*b.u+left.z*b.v-b.omega*(px-b.x)};
  }
  const lever = (b,px,pz,n) => (pz-b.z)*n.x-(px-b.x)*n.z;
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
  function resolve(a,b,n,px,pz,depth) {
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
    resolve(a,b,n,n.x*plane+t.x*mid,n.z*plane+t.z*mid,depth);
    return true;
  }
  const localBorders=new WeakMap();
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
    }
    const axes=basis(b),radius=Math.hypot(b.halfWidth,b.halfLength);
    for(let pass=0;pass<3;pass++){
      let changed=false;
      for(const r of cache.lines){
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
        resolve(b,null,normal,contact.x,contact.z,depth);
        const rest=depth-Math.max(0,depth-.0015)*.85;
        b.x-=r.nx*rest;b.z-=r.nz*rest;changed=true;
      }
      if(!changed)break;
    }
  }
  function rail(b,road) {
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
    resolve(b,null,n,hits.reduce((s,p)=>s+p.x,0)/hits.length,hits.reduce((s,p)=>s+p.z,0)/hits.length,depth);
    b.lateral=(b.x-near.x)*Math.cos(near.yaw)-(b.z-near.z)*Math.sin(near.yaw);
  }
  return {pair,rail,networkRails,newDamage:()=>({zones:{},revision:0,nose:0,leftFront:0,rightFront:0})};
})();
