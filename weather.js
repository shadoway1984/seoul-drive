/* Open-Meteo Seoul city centre, independent of the player's device location.
   Precipitation fields are totals for current.interval seconds, not hourly rates. */
window.SeoulWeather=(()=>{
  const endpoint=new URL('https://api.open-meteo.com/v1/forecast');
  endpoint.search=new URLSearchParams({latitude:'37.5665',longitude:'126.9780',timeformat:'unixtime',
    current:'temperature_2m,rain,showers,snowfall,weather_code,cloud_cover'}).toString();
  const key='seoul-drive.weather.v1',maxAge=90*60000;
  const uniforms={wet:{value:0},snow:{value:0},cloud:{value:0}};
  function parse(raw,now=Date.now()){
    const c=raw?.current;
    if(!c||!Number.isFinite(c.time)||!Number.isFinite(c.interval)||c.interval<=0||
      !['rain','showers','snowfall','cloud_cover','weather_code','temperature_2m'].every(k=>Number.isFinite(c[k]))||
      c.rain<0||c.showers<0||c.snowfall<0||c.time*1000>now+15*60000||now-c.time*1000>maxAge)return null;
    const rate=3600/c.interval,rain=(c.rain+c.showers)*rate,snow=c.snowfall*rate;
    const wet=rain?Math.min(1,.16+.84*(1-Math.exp(-rain/7))):0;
    const cover=snow?Math.min(1,.25+.75*(1-Math.exp(-snow/1.6))):0;
    const grip=Math.max(.32,1-.30*wet-.63*cover);
    const code=c.weather_code,cloud=Math.min(1,Math.max(c.cloud_cover/100,wet,cover));
    const kind=rain&&snow?'진눈깨비':snow?'눈':rain?'비':code===45||code===48?'안개':cloud>.8?'흐림':cloud>.25?'구름 조금':'맑음';
    return {rain,snow,wet,cover,grip,cloud,kind,fog:code===45||code===48,time:c.time,temperature:c.temperature_2m};
  }
  function particles(T,scene,snow){
    const count=snow?1550:2500,verts=snow?1:2,geo=new T.BufferGeometry();
    const positions=new Float32Array(count*verts*3),ends=new Float32Array(count*verts);
    for(let i=0;i<count;i++){
      const x=Math.random()*90,y=Math.random()*38,z=Math.random()*90;
      for(let j=0;j<verts;j++){const k=i*verts+j;positions.set([x,y,z],k*3);ends[k]=j;}
    }
    geo.setAttribute('position',new T.BufferAttribute(positions,3));geo.setAttribute('tail',new T.BufferAttribute(ends,1));
    const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{clock:{value:0},amount:{value:0},floorY:{value:0},day:HanDaylight},
      vertexShader:`uniform float clock,amount,floorY;attribute float tail;varying float opacity;
        void main(){vec3 box=vec3(90.,38.,90.);vec3 move=${snow?'vec3(sin(clock*.7+position.y)*.7+clock*.68,-clock*(1.4+position.x*.012),sin(clock*.56+position.z)*.65)':'vec3(clock*1.5,-clock*(15.+amount*5.),clock*.43)'};
          vec3 base=vec3(cameraPosition.x-45.,floorY+.04,cameraPosition.z-45.);
          vec3 p=base+mod(position+move-base,box);${snow?'':'p+=vec3(-.035,.46+amount*.31,-.011)*tail;'}
          vec4 eye=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*eye;
          gl_PointSize=clamp(57./max(1.,-eye.z),1.5,5.5);
          opacity=smoothstep(1.8,4.,-eye.z)*(1.-smoothstep(28.,47.,length(p.xz-cameraPosition.xz)));}`,
      fragmentShader:`uniform float day;varying float opacity;void main(){float a=opacity;${snow?'a*=1.-smoothstep(.22,.5,length(gl_PointCoord-.5));':''}
        gl_FragColor=vec4(mix(vec3(.47,.58,.71),vec3(${snow?'.94,.96,.99':'.70,.80,.89'}),day),a*${snow?'.88':'.53'});
        #include <colorspace_fragment>
      }`});
    const mesh=snow?new T.Points(geo,mat):new T.LineSegments(geo,mat);
    mesh.name=snow?'Seoul snowfall':'Seoul rainfall';mesh.frustumCulled=false;mesh.visible=false;scene.add(mesh);
    return (t,rate,floor)=>{
      mesh.visible=rate>0;
      if(!mesh.visible)return;
      const intensity=1-Math.exp(-rate/(snow?1.8:9));
      geo.setDrawRange(0,Math.max(1,Math.round(count*(.012+.988*intensity)))*verts);
      mat.uniforms.clock.value=t;mat.uniforms.amount.value=intensity;mat.uniforms.floorY.value=floor;
    };
  }
  function start(T,scene,road){
    const rain=particles(T,scene,false),snow=particles(T,scene,true);
    let sample=null,inflight=false,next=0;
    const badge=document.getElementById('cityWeather');
    function apply(raw,source){
      sample=parse(raw);if(!sample)return false;
      const s=sample;
      uniforms.wet.value=s.wet;uniforms.snow.value=s.cover;uniforms.cloud.value=s.cloud;
      road.weatherGrip=s.grip;road.weatherFog=s.fog;
      const rate=[s.rain&&s.rain.toFixed(1)+' mm/h',s.snow&&s.snow.toFixed(1)+' cm/h'].filter(Boolean).join(' · ');
      badge.textContent=(source==='저장값'?'저장값 · ':'')+s.kind+' '+(rate||Math.round(s.temperature)+'°C');
      const stamp=new Date(s.time*1000).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false});
      badge.title='Open-Meteo · 서울시청 인근 모델값 · '+stamp+' KST · '+source;
      return true;
    }
    function offline(){
      sample=null;road.weatherGrip=1;road.weatherFog=false;
      uniforms.wet.value=uniforms.snow.value=uniforms.cloud.value=0;
      badge.textContent='날씨 미연결';badge.title='날씨 자료를 받으면 노면에 반영합니다. 현재 기본 건조 노면입니다.';
    }
    function cached(){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
    let last=cached();apply(last,'저장값');
    async function refresh(){
      if(inflight||document.hidden||Date.now()<next)return;
      inflight=true;const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),9000);
      try{
        const response=await fetch(endpoint.href,{signal:abort.signal,credentials:'omit',referrerPolicy:'no-referrer'});
        if(!response.ok)throw Error();const raw=await response.json();if(!apply(raw,'현재 날씨'))throw Error();
        last=raw;try{localStorage.setItem(key,JSON.stringify(raw));}catch{}
        next=Date.now()+15*60000;
      }catch{if(!apply(last,'저장값'))offline();next=Date.now()+3*60000;}
      finally{inflight=false;clearTimeout(timeout);}
    }
    refresh();const poll=setInterval(refresh,60000);
    document.addEventListener('visibilitychange',refresh);
    return {update(t,car){
      if(sample&&Date.now()-sample.time*1000>maxAge)offline();
      const outdoor=!(road.network&&(road.current.flags&128));
      const floor=road.height(car.s);
      rain(t,outdoor&&sample?sample.rain:0,floor);snow(t,outdoor&&sample?sample.snow:0,floor);
    },dispose(){clearInterval(poll);document.removeEventListener('visibilitychange',refresh);}};
  }
  return {parse,start,uniforms};
})();
