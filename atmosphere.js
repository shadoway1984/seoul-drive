/* Night lighting, low-beam optics, and projected local reflections. World units are metres. */
window.buildAtmosphere = function buildAtmosphere(T, scene, renderer, world) {
  const waterY = Number.isFinite(world?.waterY) ? world.waterY : -3.5;
  const root = new T.Group();
  root.name = "Han River at night";
  scene.add(root);
  const oldFog = scene.fog, oldEnv = scene.environment, oldEnvIntensity = scene.environmentIntensity;
  const haze = new T.FogExp2(0x17212c, .00024);
  scene.fog = haze;
  const moon = new T.Vector3(.58, .38, -.72).normalize();
  let solar=seoulSunAt(new Date()),lastClock=-1;
  const sunDirection=new T.Vector3(solar.x,solar.y,solar.z);
  const skyMat = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false,
    uniforms: { daylight:HanDaylight,overcast:SeoulWeather.uniforms.cloud,sunDir:{value:sunDirection}, moon: {value: moon}, environmentPass: {value: 0} },
    vertexShader: `varying vec3 direction;
      void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 direction; uniform vec3 moon,sunDir; uniform float daylight,overcast; uniform float environmentPass;
      float h(vec2 p){return fract(sin(dot(p,vec2(17.17,78.53)))*43758.545);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f*=f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
      void main(){vec3 d=normalize(direction);float y=max(d.y,0.);
        float elevation=1.-exp(-6.*y);
        float az=atan(d.x,d.z);
        vec3 horizon=mix(vec3(.020,.026,.040),vec3(.037,.029,.026),.5+.5*cos(az*2.-.4));
        vec3 c=mix(horizon,vec3(.0023,.0047,.0117),elevation);
        vec2 ground=d.xz/max(.11,y+.045);float clouds=noise(ground*vec2(.9,1.7))*.58+noise(ground*3.)*.29+noise(ground*7.)*.13;
        c*=.90+.21*clouds;
        float md=max(dot(d,moon),0.);c+=vec3(.028,.041,.068)*pow(md,36.);
        c+=vec3(.49,.55,.68)*smoothstep(.999970,.999992,md);
        vec2 star=vec2(az*80.,y*135.);vec2 pr=fract(star)-.5;
        c+=vec3(.25,.31,.4)*smoothstep(.9981,.9999,h(floor(star)))*exp(-dot(pr,pr)*80.)*smoothstep(.09,.32,y);
        float solarDot=max(dot(d,sunDir),0.);
        vec3 daySky=mix(vec3(.69,.79,.90),vec3(.09,.34,.72),pow(y,.48));
        float sunset=1.-smoothstep(.015,.23,sunDir.y);
        daySky=mix(daySky,vec3(1.12,.47,.20),sunset*pow(1.-y,4.)*(.3+.7*solarDot));
        daySky=mix(daySky,vec3(.93,.94,.96),smoothstep(.52,.70,clouds)*smoothstep(.01,.18,y)*.68);
        daySky+=vec3(2.5,1.85,1.15)*pow(solarDot,320.)+vec3(9.,6.,3.)*smoothstep(.99995,.99999,solarDot);
        c=mix(c,daySky,daylight);
        vec3 cloudTone=mix(vec3(.022,.031,.048),vec3(.39,.45,.51),daylight)*(.78+.37*clouds);
        c=mix(c,cloudTone,smoothstep(.22,.98,overcast));
        if(environmentPass>.5){
          float angle=az/6.2831853+.5;float sector=floor(angle*89.);
          float top=.032+.14*h(vec2(sector,6.));float tower=step(-.02,d.y)*step(d.y,top);
          c=mix(c,c*.19,tower);
          vec2 w=vec2(angle*590.,d.y*185.);vec2 f=fract(w);
          float panes=step(.26,f.x)*step(f.x,.84)*step(.32,f.y)*step(f.y,.80);
          c+=mix(vec3(.35,.51,.73),vec3(1.,.63,.30),h(floor(w)+24.))*panes*step(.71,h(floor(w)))*tower;
          c+=vec3(1.9,.92,.27)*pow(max(cos(az*18.+.5),0.),85.)*exp(-100.*abs(d.y-.115));
          c+=vec3(.34,.42,.55)*exp(-80.*abs(d.y-.39))*pow(max(cos(az-.7),0.),16.);
        }
        c=mix(vec3(.006,.007,.009),c,smoothstep(-.10,.005,d.y));
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const skyGeo = new T.SphereGeometry(1,40,22);
  const sky = new T.Mesh(skyGeo, skyMat);
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  root.add(sky);
  // Bake the distant light strips once. They give clearcoat and window glass a readable silhouette.
  const envScene = new T.Scene(), dome = new T.Mesh(skyGeo, skyMat);
  dome.scale.setScalar(450);
  envScene.add(dome); skyMat.uniforms.environmentPass.value = 1;
  const pmrem = new T.PMREMGenerator(renderer);
  let env = pmrem.fromScene(envScene, .0, .1, 800);
  skyMat.uniforms.environmentPass.value = 0;
  scene.environment = env.texture; scene.environmentIntensity = .88;

  const skyLight = new T.HemisphereLight(0xa9c6e8, 0x766963, .30);
  const rim = new T.DirectionalLight(0xb5d2ff, .23);
  // One small shadow map follows the car. Street light and headlight positions never allocate individual shadow maps.
  rim.castShadow = true; rim.shadow.mapSize.set(1024,1024);
  Object.assign(rim.shadow.camera, {left:-21,right:21,top:23,bottom:-23,near:1,far:95});
  rim.shadow.camera.updateProjectionMatrix(); rim.shadow.normalBias=.018;rim.shadow.bias=-.00025;
  root.add(skyLight,rim,rim.target);
  const streetLights = Array.from({length:3},(_,index)=>{
    const l=new T.PointLight(index===2?0xffe3ac:0xffce85, index===2?88:128,42,2);
    root.add(l);return l;
  });
  // Asymmetric cutoff follows the projected image plane of each headlamp.
  const canvas=document.createElement("canvas");canvas.width=192;canvas.height=128;
  const cg=canvas.getContext("2d"),img=cg.createImageData(canvas.width,canvas.height);
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
    const u=(x+.5)/canvas.width,v=(y+.5)/canvas.height;
    const cutoff=.458-.035*Math.max(0,u-.48)*2;
    const edge=Math.max(0,Math.min(1,(v-cutoff)*45));
    const fall=Math.exp(-2.9*(2*u-1)**2-15*(v-.56)**2);
    const a=Math.round(255*fall*(.025+.975*edge));
    const j=(y*canvas.width+x)*4;img.data[j]=img.data[j+1]=img.data[j+2]=a;img.data[j+3]=255;
  }
  cg.putImageData(img,0,0);
  const beamTex=new T.CanvasTexture(canvas);beamTex.colorSpace=T.NoColorSpace;
  const headlights=[-1,1].map(()=>{
    const l=new T.SpotLight(0xe5f0ff,3200,100,.44,.26,2);l.map=beamTex;
    root.add(l,l.target);return l;
  });

  const mirror=new T.PerspectiveCamera(), reflectedMatrix=new T.Matrix4(), target=new T.WebGLRenderTarget(768,384,{
    type:T.HalfFloatType, minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true,
  });
  const uniforms={daylight:HanDaylight,reflection:{value:target.texture}, refMatrix:{value:reflectedMatrix},time:{value:0},moon:{value:moon}};
  const waterMat=new T.ShaderMaterial({side:T.DoubleSide,uniforms,
    vertexShader:`uniform mat4 refMatrix;varying vec4 rc;varying vec3 wp;
      void main(){wp=(modelMatrix*vec4(position,1.)).xyz;rc=refMatrix*vec4(wp,1.);gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`,
    fragmentShader:`uniform sampler2D reflection;uniform float daylight;uniform float time;uniform vec3 moon;varying vec4 rc;varying vec3 wp;
      vec3 refl(vec2 p){return texture2D(reflection,clamp(p,.002,.998)).rgb;}
      void main(){vec2 p=wp.xz;vec3 eye=normalize(cameraPosition-wp);float dist=distance(cameraPosition,wp);
        float medium=1./(1.+dist*.0024),fine=1./(1.+dist*.009);float t=time;
        vec2 n=vec2(sin(dot(p,vec2(.19,.34))+t*.91)+.61*sin(dot(p,vec2(-.37,.14))-.67*t),
                    sin(dot(p,vec2(.22,-.27))-.79*t)+.58*sin(dot(p,vec2(.37,.21))+.66*t));
        n+=fine*.48*vec2(sin(dot(p,vec2(.81,1.26))-t*1.9),sin(dot(p,vec2(-1.06,1.14))+t*1.74));
        vec2 uv=rc.xy/max(rc.w,.001)*.5+.5;
        uv+=n*vec2(.0017,.0061)*(.34+medium);
        float stretch=.0028+.0055*medium+.0013*abs(n.y);
        vec3 sampleC=.45*refl(uv)+.18*refl(uv+vec2(.0007,stretch))+.17*refl(uv-vec2(.0007,stretch))+
          .10*refl(uv+vec2(0,2.4*stretch))+.10*refl(uv-vec2(0,2.4*stretch));
        float valid=smoothstep(0.,.08,min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y)))*step(.01,rc.w);
        vec3 base=mix(vec3(.0035,.008,.016),vec3(.047,.17,.21),daylight);
        float fres=.22+.66*pow(1.-max(eye.y,0.),2.3);
        vec3 col=mix(base,sampleC+vec3(.0015,.002,.004),valid*fres)*(.97+.03*n.y);
        vec3 norm=normalize(vec3(n.x*.024,1.,n.y*.026));
        col+=vec3(.034,.047,.068)*pow(max(dot(norm,normalize(moon+eye)),0.),180.);
        col=mix(col,mix(vec3(.012,.017,.026),vec3(.36,.47,.54),daylight),1.-exp(-dist*.00032));
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  function ribbon(){
    const vertices=[],indices=[];const end=world.length,side=world.riverSide;
    const steps=Math.max(2,Math.ceil(end/55));
    for(let k=0;k<=steps;k++){
      const s=end*k/steps,w=Math.max(110,Math.min(2100,world.riverWidthAt(s)));
      const near=side===1?46:24;
      for(const offset of [near,Math.max(near+80,w-32)]){
        const p=world.point(s,side*offset);vertices.push(p.x,waterY,p.z);
      }
      if(k<steps){const n=2*k;indices.push(n,n+1,n+2,n+2,n+1,n+3);}
    }
    const g=new T.BufferGeometry();g.setAttribute("position",new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeBoundingSphere();return g;
  }
  function waterGeometry(){
    const dataset=window.HAN_WATER;
    if(!dataset) return ribbon();
    const polygons=dataset.polygons ?? (dataset.type==="MultiPolygon"?dataset.coordinates:dataset.type==="Polygon"?[dataset.coordinates]:[]);
    const vertices=[], indices=[];
    for(const polygon of polygons){
      const loops=polygon.map(r=>{let loop=r.map(([lon,lat])=>{const p=world.project(lon,lat);return new T.Vector2(p.x,p.z);});
        if(loop.length>1 && loop[0].distanceToSquared(loop.at(-1))<.00001)loop.pop();return loop;}).filter(loop=>loop.length>=3);
      if(!loops.length)continue;
      const triangles=T.ShapeUtils.triangulateShape(loops[0],loops.slice(1)),base=vertices.length/3;
      for(const ring of loops)for(const v of ring)vertices.push(v.x,waterY,v.y);
      for(const [a,b,c] of triangles)indices.push(base+a,base+b,base+c);
    }
    if(!indices.length)return ribbon();
    const g=new T.BufferGeometry();g.setAttribute("position",new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeBoundingSphere();return g;
  }
  const water=new T.Mesh(waterGeometry(),waterMat);water.name="Han River water";root.add(water);
  const dir=new T.Vector3(),up=new T.Vector3(),look=new T.Vector3(),normal=new T.Vector3(0,1,0),plane=new T.Plane(),clip=new T.Vector4(),q=new T.Vector4();
  const waterPoint=new T.Vector3(0,waterY,0);let frame=0,lastLampIndex=null;
  let lastX=Infinity,lastZ=Infinity;
  function moveLamps(s,car){
    if(world.network){
      if(Math.hypot(car.x-lastX,car.z-lastZ)<3)return;
      lastX=car.x;lastZ=car.z;
      const y=world.height(s);
      const nearest=(world.streetLampHeads||[]).map(p=>({p,d:(p.x-car.x)**2+(p.z-car.z)**2+(p.y-y-8)**2})).filter(v=>v.d<42**2).sort((a,b)=>a.d-b.d);
      streetLights.forEach((light,i)=>{const head=nearest[i]?.p;light.visible=!!head;
        if(head)light.position.set(head.x,head.y-.18,head.z);});
      return;
    }
    const lampIndex=Math.floor(s/48);if(lampIndex===lastLampIndex)return;
    lastLampIndex=lampIndex;
    for(let i=0;i<3;i++){
      const station=i===2?Math.round((s-48)/96)*96+48:48*(lampIndex+i);
      const sample=Math.max(0,Math.min(world.length,station));
      const half=world.lanesAt(sample)*3.55*.5;
      const p=world.point(sample,i===2?-half+2.20:half-2.48);
      streetLights[i].position.set(p.x,p.y+(i===2?8.67:10),p.z);
      streetLights[i].visible=station>=0 && station<=world.length;
    }
  }
  function update(cam,car,time,high,cockpit){
    const s=car.s, base=world.point(s,0), dx=Math.sin(car.yaw),dz=Math.cos(car.yaw);
    moveLamps(s,car);
    for(let i=0;i<2;i++){
      const side=i===0?-1:1, l=headlights[i],offset=.74*side;
      l.position.set(car.x+2.00*dx+dz*offset,base.y+.66,car.z+2.00*dz-dx*offset);
      l.target.position.set(car.x+43*dx+dz*(offset+side*.62),base.y-.31,car.z+43*dz-dx*(offset+side*.62));
      l.target.updateMatrixWorld();
    }
    rim.target.position.set(car.x,base.y,car.z);
    const now=new Date(),minute=Math.floor(now.getTime()/60000);
    if(minute!==lastClock){
      const old=solar;solar=seoulSunAt(now);lastClock=minute;HanDaylight.value=solar.light;sunDirection.set(solar.x,solar.y,solar.z);
      if(Math.abs(env.texture.userData.bakedLight-solar.light)>.16||!Number.isFinite(env.texture.userData.bakedLight)&&Math.abs(old.light-solar.light)>.1){
        skyMat.uniforms.environmentPass.value=1;const next=pmrem.fromScene(envScene,0,.1,800);skyMat.uniforms.environmentPass.value=0;env.dispose();env=next;scene.environment=env.texture;
      }
      env.texture.userData.bakedLight??=solar.light;
      const day=solar.light;
      haze.color.setHex(0x17212c).lerp(new T.Color(0xbbcbd7),day);haze.density=.00024-day*.00010;
      skyLight.intensity=.30+day*1.62;rim.intensity=.23+day*2.35;
      rim.color.setHex(0xb5d2ff).lerp(new T.Color(solar.alt<8?0xffb477:0xfff2d9),day);
      streetLights.forEach((l,i)=>l.intensity=(i===2?88:128)*(1-day));headlights.forEach(l=>l.intensity=3200*(1-day));
      const txt="서울 "+solar.time+" · "+solar.phase;document.getElementById("seoulClock").textContent=txt;
      document.getElementById("sessionLight").textContent=solar.phase==="낮"?"SEOUL · DAY DRIVE":solar.phase==="밤"?"SEOUL · NIGHT DRIVE":"SEOUL · TWILIGHT DRIVE";
    }
    const day=solar.light;
    const weather=SeoulWeather.uniforms;
    haze.density=.00024-day*.00010+weather.wet.value*.0024+weather.snow.value*.0031+(world.weatherFog?.0025:0);
    rim.intensity=(.23+day*2.35)*(1-weather.cloud.value*.80);
    rim.position.set(car.x+29*(1-day)+solar.x*48*day,base.y+25*(1-day)+Math.max(.12,solar.y)*48*day,car.z-22*(1-day)+solar.z*48*day);
    sky.position.copy(cam.position);sky.scale.setScalar(cam.far*.83);
    uniforms.time.value=time;
    if(frame++%(high?4:8)!==0 || cam.position.y<=waterY+.05)return;
    cam.getWorldDirection(dir);up.set(0,1,0).applyQuaternion(cam.quaternion);
    dir.y*=-1;up.y*=-1;mirror.copy(cam,false);mirror.position.copy(cam.position);mirror.position.y=waterY*2-cam.position.y;
    mirror.up.copy(up);mirror.lookAt(look.copy(mirror.position).add(dir));mirror.updateMatrixWorld();
    reflectedMatrix.multiplyMatrices(mirror.projectionMatrix,mirror.matrixWorldInverse);
    // Oblique clipping prevents the underside of the shore from obscuring the opposing skyline.
    plane.setFromNormalAndCoplanarPoint(normal,waterPoint).applyMatrix4(mirror.matrixWorldInverse);
    clip.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
    const m=mirror.projectionMatrix.elements;
    q.set((Math.sign(clip.x)+m[8])/m[0],(Math.sign(clip.y)+m[9])/m[5],-1,(1+m[10])/m[14]);
    const denom=clip.dot(q);
    if(Math.abs(denom)>.0001){clip.multiplyScalar(2/denom);m[2]=clip.x;m[6]=clip.y;m[10]=clip.z+.9995;m[14]=clip.w;}
    water.visible=false;const was=cockpit?.visible,previousTarget=renderer.getRenderTarget(), shadows=renderer.shadowMap.autoUpdate;
    if(cockpit)cockpit.visible=false;
    renderer.shadowMap.autoUpdate=false;
    try{renderer.setRenderTarget(target);renderer.render(scene,mirror);}
    finally{renderer.setRenderTarget(previousTarget);renderer.shadowMap.autoUpdate=shadows;if(cockpit)cockpit.visible=was;water.visible=true;}
  }
  function dispose(){
    root.removeFromParent();
    if(scene.environment===env.texture){scene.environment=oldEnv;scene.environmentIntensity=oldEnvIntensity;}
    if(scene.fog===haze)scene.fog=oldFog;
    pmrem.dispose();rim.shadow.map?.dispose();target.dispose();env.dispose();skyGeo.dispose();skyMat.dispose();water.geometry.dispose();waterMat.dispose();beamTex.dispose();
  }
  return {update,dispose};
};
