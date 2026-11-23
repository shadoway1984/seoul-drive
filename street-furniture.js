/* Municipal WGS84 inventory. Horizontal positions and species come from the
   register. Dimensions, lamp arms, and tree silhouettes are illustrative. */
window.createSeoulFurniture=function(T,world){
  const data=window.SEOUL_STREET_OBJECTS;
  const bark=new T.MeshStandardMaterial({color:0x635444,roughness:1});
  const metal=new T.MeshStandardMaterial({color:0x727c80,metalness:.45,roughness:.53});
  const lens=new T.MeshStandardMaterial({color:0xe6e4ce,emissive:0xd5a669,emissiveIntensity:.18});
  const trunk=new T.CylinderGeometry(.095,.16,1,7),pole=new T.CylinderGeometry(.075,.14,1,8);
  const arm=new T.CylinderGeometry(.046,.056,1,7);
  function lampMesh(name){
    const geo=new T.BufferGeometry(),model=HAN_GUARDRAIL[name];
    geo.setAttribute('position',new T.Float32BufferAttribute(model.p.flatMap(([x,y,z])=>[-x,z,y]),3));
    geo.setIndex(model.i.flat());geo.computeVertexNormals();return geo;
  }
  const head=lampMesh('lampHousing'),diffuser=lampMesh('lampLens');
  // A leaf cluster with holes between sprays. Several angled planes per crown
  // keep the outline irregular as a driver passes or orbits the tree.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=192;
  const c=canvas.getContext('2d');let seed=241;
  const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let i=0;i<85;i++){
    const a=rand()*Math.PI*2,r=Math.sqrt(rand())*.79;
    const x=96+Math.cos(a)*r*92,y=96+Math.sin(a)*r*94;
    const value=Math.round(113+rand()*97+(96-y)*.28);
    c.fillStyle='rgb('+value+','+value+','+Math.round(value*.91)+')';
    for(let j=0;j<21;j++){
      const dx=(rand()-.5)*28,dy=(rand()-.5)*25;
      c.beginPath();c.ellipse(x+dx,y+dy,2+rand()*4,2+rand()*3,rand()*3,0,Math.PI*2);c.fill();
    }
  }
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const leaves=new T.MeshLambertMaterial({map:texture,side:T.DoubleSide,alphaTest:.37});
  function foliage(name){
    const mesh=HAN_GUARDRAIL[name],g=lampMesh(name),uv=[],normals=[];
    for(const [i,[x,y,z]] of mesh.p.entries()){
      uv.push(...[[0,0],[1,0],[1,1],[0,1]][i%4]);
      const v=new T.Vector3(-x,.26+z*.35,y).normalize();normals.push(v.x,v.y,v.z);
    }
    g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));return g;
  }
  const narrowCrown=foliage('ginkgo'),broadCrown=foliage('broadleaf');
  const up=new T.Vector3(0,1,0);
  const stem=new T.Object3D(),start=new T.Vector3(),end=new T.Vector3();
  function add(group,key){
    const rows=data.tiles[key];if(!rows)return;
    const [i,j]=key.split(',').map(Number),parts=new Map();
    function put(geo,material,tint){
      let p=parts.get(geo);if(!p){p={material,matrices:[],colors:[]};parts.set(geo,p);}
      stem.updateMatrix();p.matrices.push(stem.matrix.clone());if(tint)p.colors.push(tint);
    }
    function rod(geo,mat,ax,ay,az,bx,by,bz,r=1){
      start.set(ax,ay,az);end.set(bx,by,bz).sub(start);
      stem.position.copy(start).addScaledVector(end,.5);stem.scale.set(r,end.length(),r);
      stem.quaternion.setFromUnitVectors(up,end.normalize());put(geo,mat);
    }
    const autumn=[0xf6cd54,0xd49751,0xb7af62,0x9da14f],summer=[0x75984e,0x719550,0x658847,0x77954c];
    const month=new Date().getMonth(),palette=month===9||month===10?autumn:summer;

    for(let k=0;k<rows.length;k+=5){
      const x=i*260+rows[k]/4,z=j*260+rows[k+1]/4,code=rows[k+2],label=data.labels[Math.abs(code)-1];
      if(code>0){
        const {species,seed:v,h,w}=HanRoadClearance.treeMetrics(x,z,label);
        const base=rows[k+3]/100;rod(trunk,bark,x,base,z,x,base+h*.68,z,.8+v*.55);
        world.scenery?.post(group,x,z,.16*(.8+v*.55),base,base+h*.68,'wood');
        for(let n=0;n<3;n++){
          const a=v*6.28+n*2.094,dx=Math.cos(a)*w*.24,dz=Math.sin(a)*w*.24;
          rod(trunk,bark,x,base+h*.34,z,x+dx,base+h*.68,z+dz,.42);
        }
        const tint=new T.Color(palette[species]).multiplyScalar(.83+v*.25);
        stem.rotation.set(0,v*6.28,0);stem.scale.set(w,h*.70,w*(.89+.18*v));
        stem.position.set(x,base+h*.68,z);put(species===0?narrowCrown:broadCrown,leaves,tint);
      }else{
        const height=rows[k+3]/100,angle=rows[k+4]/1000;
        const nx=Math.sin(angle),nz=Math.cos(angle),h=/대교|고가|교량/.test(label)?9:7.7;
        rod(pole,metal,x,height,z,x,height+h,z);
        world.scenery?.post(group,x,z,.14,height,height+h,'steel');
        rod(arm,metal,x,height+h-.4,z,x+1.1*nx,height+h+.28,z+1.1*nz);
        rod(arm,metal,x+1.1*nx,height+h+.28,z+1.1*nz,x+2.3*nx,height+h+.34,z+2.3*nz);
        stem.position.set(x+2.4*nx,height+h+.32,z+2.4*nz);stem.scale.set(1,1,1);
        stem.rotation.set(0,Math.atan2(nx,nz),0);put(head,metal);put(diffuser,lens);
      }
    }
    for(const [geometry,p] of parts){
      const mesh=new T.InstancedMesh(geometry,p.material,p.matrices.length);
      p.matrices.forEach((matrix,n)=>mesh.setMatrixAt(n,matrix));
      p.colors.forEach((color,n)=>mesh.setColorAt(n,color));mesh.computeBoundingSphere();
      mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    }
  }
  return {add,has:k=>!!data.tiles[k]};
};
