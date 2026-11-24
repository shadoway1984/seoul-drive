/* Fit the Blender body to the existing four-corner suspension and damage rig.
   The other traffic cars keep their own cloned sedan geometry. */
window.fitAvanteN=function fitAvanteN(T,vehicle){
  const palette={paint:0xa6cedf,rim:0xc1c9cf,graphite:0x33383b,black:0x15191c,rubber:0x212426,
    mesh:0x40464a,glass:0x273842,lamp:0x32121b,tail:0xed1730,brake:0xe62639,drl:0xeefaff,
    trim:0xed342d,steel:0xaaa8a4,pipe:0x24272a,plate:0xdadcd7,hot:0x090a0b};
  const materials={};
  for(const [name,color] of Object.entries(palette)){
    const polished=['paint','glass','rim','steel','lamp','tail','brake'].includes(name);
    const metalness=['rim','steel'].includes(name)?.8:name==='paint'?.43:polished?.28:.16;
    const m=polished?new T.MeshPhysicalMaterial({clearcoat:1,clearcoatRoughness:.11}):new T.MeshStandardMaterial();
    m.name=name;m.color.setHex(color);m.metalness=metalness;m.roughness=polished?.26:.52;
    m.side=T.DoubleSide;
    if(name==='paint'){
      m.metalness=.35;m.roughness=.27;m.clearcoatRoughness=.075;
      m.ior=1.52;
    }
    if(name==='glass'){
      m.color.setHex(0x344b58);m.metalness=.12;m.roughness=.085;
      m.ior=1.52;m.clearcoatRoughness=.05;m.transparent=true;m.opacity=.76;
      m.depthWrite=false;m.side=T.FrontSide;
    }
    if(name==='graphite'){m.metalness=.46;m.roughness=.30;}
    if(['brake','tail','drl','hot'].includes(name)){
      m.emissive.setHex(({brake:0xde1525,tail:0xc5131e,drl:0xd8f0ff,hot:0xff7629})[name]);
      m.emissiveIntensity=name==='hot'?0:name==='brake'?.45:name==='drl'?1.25:.88;
      m.toneMapped=false;
    }
    materials[name]=m;
  }
  function bytes(value,type){return new type(Uint8Array.from(atob(value),c=>c.charCodeAt(0)).buffer);}
  const body=vehicle.group.children[0];body.clear();body.name='Avante N CN7 facelift';
  for(const wheel of vehicle.wheels){
    const tyre=wheel.children.find(mesh=>mesh.material?.bumpMap);
    for(const mesh of [...wheel.children])if(mesh!==tyre)wheel.remove(mesh);
    const caliper=wheel.parent.children.find(mesh=>mesh.isMesh);
    if(caliper){caliper.material=materials.trim;caliper.scale.set(1,1.06,1.17);}
  }
  for(const [key,[p,n,ix]] of Object.entries(AVANTE_N_MESH)){
    const [part,finish]=key.split(':'),geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(Float32Array.from(bytes(p,Int16Array),v=>v*.001),3));
    // Damage recomputes area-weighted normals. Millimetre-scale triangles need
    // float accumulators even though the immutable packet uses signed bytes.
    geo.setAttribute('normal',new T.Float32BufferAttribute(Float32Array.from(bytes(n,Int8Array),v=>v/127),3));
    geo.setIndex(new T.BufferAttribute(bytes(ix,Uint16Array),1));geo.computeBoundingSphere();
    const mesh=new T.Mesh(geo,materials[finish]);mesh.name=key;mesh.castShadow=mesh.receiveShadow=true;
    if(part==='body'){body.add(mesh);continue;}
    vehicle.wheels.forEach(wheel=>{const copy=mesh.clone();copy.scale.x=Math.sign(wheel.parent.position.x);wheel.add(copy);});
  }
  // Original Korean plate artwork, not a photograph of a road vehicle.
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=224;const g=canvas.getContext('2d');g.scale(2,2);
  g.fillStyle='#dfe3da';g.fillRect(0,0,512,112);g.fillStyle='#24466e';g.fillRect(4,4,24,104);
  g.strokeStyle='#91978e';g.lineWidth=1;g.strokeRect(.5,.5,511,111);
  g.fillStyle='#939c99';for(const x of [17,494]){g.beginPath();g.arc(x,10,2.7,0,2*Math.PI);g.fill();}
  g.textAlign='center';g.textBaseline='middle';g.font='bold 77px "Malgun Gothic",sans-serif';g.fillStyle='#182127';g.fillText('381가 0724',268,58);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;
  const plate=new T.MeshStandardMaterial({map:texture,roughness:.46,metalness:.08});
  const litPlate=plate.clone();litPlate.emissiveMap=texture;
  litPlate.emissive.setHex(0xbecde3);litPlate.emissiveIntensity=.16;
  for(const [end,y,z] of [[1,.423,2.365],[-1,.492,-2.366]]){
    const mesh=new T.Mesh(new T.PlaneGeometry(.515,.109),end<0?litPlate:plate);mesh.position.set(0,y,z);mesh.rotation.y=end<0?Math.PI:0;body.add(mesh);
  }
  const suspension=vehicle.updateChassis;
  vehicle.updateChassis=car=>{
    suspension(car);
    vehicle.wheels.forEach((wheel,i)=>{
      const p=wheel.parent.position;
      p.x-=Math.sign(p.x)*(.809-(i<2?.792:.7895));
      p.z+=i<2?.095:.045;
    });
  };
  vehicle.group.name='현대 아반떼 N';vehicle.brakeLights=[materials.brake];
  vehicle.setExhaustPulse=intensity=>{materials.hot.emissiveIntensity=2.25*Math.max(0,Math.min(1,intensity));};
  return vehicle;
};
