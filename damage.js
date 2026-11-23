/* Deform a private copy of each affected mesh in vehicle space. The reference mesh
   stays intact when traffic changes detail level or the driver restarts. */
window.HanDamageView = function(T,root) {
  let owner, revision=-1, parts;
  const p=new T.Vector3(), sourcePoint=new T.Vector3();
  const inverse=new T.Matrix4();
  function collect() {
    root.updateWorldMatrix(true,true);
    inverse.copy(root.matrixWorld).invert();
    parts=[];
    root.traverse(mesh=>{
      if(!mesh.isMesh&&!mesh.isSprite)return;
      const matrix=inverse.clone().multiply(mesh.matrixWorld);
      const part={mesh,matrix,back:matrix.clone().invert(),geometry:mesh.geometry,material:mesh.material};
      if(mesh.isSprite)part.home=mesh.position.clone();
      else{
        mesh.geometry.computeBoundingBox();
        part.bounds=mesh.geometry.boundingBox.clone().applyMatrix4(matrix);
      }
      parts.push(part);
    });
  }
  function bend(point,zones) {
    const {x,y,z}=point;
    let dx=0,dy=0,dz=0,peak=0;
    for(const h of zones){
      const rx=x-h.x,rz=z-h.z;
      const along=rx*h.nx+rz*h.nz,across=rx*h.nz-rz*h.nx;
      const radius=.43+h.depth*1.22;
      const q=(across/(radius+.17))**2+(along/(radius*1.25))**2+((y-.55)/(radius+.20))**2;
      if(q>=1)continue;
      const f=(1-q)**2, d=h.depth*f;
      const fold=Math.sin(across*20+along*12)*Math.sin(along*10+y*7);
      dx+=d*h.nx;dz+=d*h.nz;
      dy+=d*(.17+.16*fold)*Math.min(1,Math.max(0,(y-.13)*3.3));
      peak=Math.max(peak,d);
    }
    const limit=Math.min(1,.85/(Math.hypot(dx,dz)||1));
    point.set(x+dx*limit,y+Math.min(.32,dy),z+dz*limit);
    return peak;
  }
  function restore(part) {
    const m=part.mesh;
    if(part.home)m.position.copy(part.home);
    if(part.modified){m.geometry=part.geometry;part.modified.dispose();part.modified=null;}
    if(part.failed){m.material=part.material;part.failed.dispose();part.failed=null;}
  }
  return function apply(state){
    if(owner===state&&revision===state.revision)return;
    if(!parts&&!state.revision){owner=state;revision=0;return;}
    if(!parts)collect();
    if(owner!==state)for(const part of parts)restore(part);
    owner=state;revision=state.revision;
    const zones=Object.values(state.zones);
    if(!zones.length)return;
    for(const part of parts){
      const m=part.mesh;
      if(part.home){
        p.setFromMatrixPosition(part.matrix);const original=p.clone();
        const severity=bend(p,zones);
        m.position.copy(part.home).add(p.sub(original));
        // The taillight bloom is a sprite parented directly to the body.
        if(severity>.22&&!part.failed){
          part.failed=part.material.clone();part.failed.opacity=0;m.material=part.failed;
        }
        continue;
      }
      const local=zones.filter(h=>{
        const r=(.65+h.depth*1.45)*1.5,box=part.bounds;
        return h.x+r>=box.min.x&&h.x-r<=box.max.x&&h.z+r>=box.min.z&&h.z-r<=box.max.z;
      });
      if(!local.length){restore(part);continue;}
      const attr=part.geometry.attributes.position;
      let maxDent=0;
      for(let i=0;i<attr.count;i++){
        sourcePoint.fromBufferAttribute(attr,i);p.copy(sourcePoint).applyMatrix4(part.matrix);
        const depth=bend(p,local);
        if(depth>0&&!part.modified){part.modified=part.geometry.clone();m.geometry=part.modified;}
        if(!part.modified)continue;
        const pos=part.modified.attributes.position;
        if(depth>0)p.applyMatrix4(part.back);else p.copy(sourcePoint);
        pos.setXYZ(i,p.x,p.y,p.z);maxDent=Math.max(maxDent,depth);
      }
      if(part.modified){
        part.modified.attributes.position.needsUpdate=true;
        part.modified.computeVertexNormals();part.modified.computeBoundingSphere();
      }
      if(maxDent>.22&&part.material.emissive?.getHex()&&!part.failed){
        part.failed=part.material.clone();part.failed.emissiveIntensity=.025;
        part.failed.color.multiplyScalar(.27);m.material=part.failed;
      }
    }
  };
};
