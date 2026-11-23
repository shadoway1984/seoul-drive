/* A conservative swept volume against the same triangles that drivers see.
   All coordinates are metres, including the three metres above each lane. */
window.HanRoadClearance=(()=>{
  function overlaps(face,x,z,r,bottom,top){
    const [a,b,c]=face;
    if(Math.max(a[1],b[1],c[1])+3<bottom||Math.min(a[1],b[1],c[1])>top+.08)return false;
    let pos=false,neg=false;
    for(let i=0;i<3;i++){
      const p=face[i],q=face[(i+1)%3],dx=q[0]-p[0],dz=q[2]-p[2],u=x-p[0],v=z-p[2];
      const t=Math.max(0,Math.min(1,(u*dx+v*dz)/(dx*dx+dz*dz||1)));
      if((u-t*dx)**2+(v-t*dz)**2<=r*r)return true;
      const cross=dx*v-dz*u;pos||=cross>0;neg||=cross<0;
    }
    const area=(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);
    return Math.abs(area)>1e-8&&!(pos&&neg);
  }
  function blocked(world,x,z,r,bottom,top,ignore){
    for(const e of world.edgesIn(x-r,z-r,x+r,z+r)){
      if(e===ignore)continue;
      const g=world.roadShape(e);
      if(g.faces.some(f=>overlaps(f,x,z,r,bottom,top))||g.junction.some(f=>overlaps(f,x,z,r,bottom,top)))return true;
    }return false;
  }
  function piers(world,e,phase){
    const shape=world.roadShape(e),l=Math.min(2.4,e.half*.45),out=[];
    for(let s=24-phase;s<e.len;s+=46){
      for(const offset of [0,-5,5,-10,10,-16,16]){
        const start=s+offset,end=Math.min(start+2,e.len);
        if(start<0||end-start<.35||out.length&&start<=out.at(-1)[1]+5)continue;
        const p=shape.point((start+end)/2,0),corners=[];
        for(const u of [start,end])for(const side of [-l,l])corners.push(shape.point(u,side));
        const radius=Math.max(...corners.map(q=>Math.hypot(q[0]-p[0],q[2]-p[2])))+.25;
        const low=Math.min(...corners.map(q=>q[1]))-11,high=Math.max(...corners.map(q=>q[1]))-.8;
        if(!blocked(world,p[0],p[2],radius,low,high)){out.push([start,end]);break;}
      }
    }return out;
  }
  const bands=new Map();
  function treeMetrics(x,z,label){
    const species=/은행/.test(label)?0:/벚/.test(label)?1:/양버즘|플라타너스/.test(label)?2:3;
    const seed=((Math.imul(Math.round(x*4),73856093)^Math.imul(Math.round(z*4),19349663))>>>0)/4294967296;
    const h=(species===2?8:species===1?5.3:6.5)*(.84+seed*.37),w=h*(species===0?.53:species===1?.94:.78);
    return {species,seed,h,w};
  }
  function treeVolumes(x,z,label){
    const {species,h,w}=treeMetrics(x,z,label),key=species===0?'ginkgo':'broadleaf';
    if(!bands.has(key)){
      const mesh=HAN_GUARDRAIL[key],slices=[];
      for(const face of mesh.i){
        const v=face.map(i=>mesh.p[i]),lo=Math.min(...v.map(p=>p[2])),hi=Math.max(...v.map(p=>p[2]));
        const slice=Math.floor((lo+1)*8),band=slices[slice]??={lo,hi,r:0};
        band.lo=Math.min(lo,band.lo);band.hi=Math.max(hi,band.hi);band.r=Math.max(band.r,...v.map(p=>Math.hypot(p[0],p[1])));
      }
      bands.set(key,slices.filter(Boolean));
    }
    return [[.41,0,h*.68],[w*.24+.27,h*.34-.12,h*.68+.12],...bands.get(key).map(b=>[w*b.r*1.07+.18,h*(.68+.70*b.lo),h*(.68+.70*b.hi)])];
  }
  return {overlaps,blocked,piers,treeMetrics,treeVolumes};
})();
