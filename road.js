/* Streamed dual carriageway, bridge structures and night lighting. Distances are metres. */
window.buildRoad = function buildRoad(T, scene, world) {
  const root = new T.Group();
  root.name = "Han River carriageway";
  scene.add(root);
  const span = 288, length = world.length, lampPitch = 48, lane = 3.5;
  const cross = (world.crossings || []).filter(v => Number.isFinite(v.s)).slice().sort((a,b)=>a.s-b.s);
  const lookup = new Map(), active = new Map(), textures = [], shared = [];
  const liveS = {value:0}, liveL = {value:0}, tau = 2*Math.PI;
  const vec = (x,y,z) => new T.Vector3(x,y,z);
  const color = n => { if(!lookup.has(n)) lookup.set(n,new T.Color(n)); return lookup.get(n); };
  const hash = n => {const v=Math.sin(n*77.365+5.326)*41326.748;return v-Math.floor(v);};
  const clamp = (v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  function texture(canvas) {
    const tex = new T.CanvasTexture(canvas);
    tex.colorSpace = T.SRGBColorSpace; tex.anisotropy=8;
    return tex;
  }
  function canvas(w,h) {const c=document.createElement("canvas");c.width=w;c.height=h;return c;}
  function fineAsphalt(){
    const c=canvas(512,512),ctx=c.getContext("2d"),pix=ctx.createImageData(512,512);
    let rng=49814413;
    function noise(){rng=(Math.imul(rng,1664525)+1013904223)>>>0; return rng/4294967296;}
    for(let y=0;y<512;y++)for(let x=0;x<512;x++){
      const aggregate=(noise()+noise()-1)*23, bit=88+aggregate+(noise()>.995?20:0);
      const i=(y*512+x)*4;pix.data[i]=bit;pix.data[i+1]=bit+1;pix.data[i+2]=bit+3;pix.data[i+3]=255;
    }
    ctx.putImageData(pix,0,0);
    const t=texture(c);t.wrapS=t.wrapT=T.RepeatWrapping;textures.push(t);return t;
  }
  const asphaltMap=fineAsphalt();
  function treeAtlas(){
    const c=canvas(768,384),ctx=c.getContext("2d");
    for(let variant=0;variant<3;variant++){
      ctx.save();ctx.translate(variant*256,0);
      ctx.lineCap="round";
      ctx.strokeStyle="#443d36";ctx.lineWidth=5;
      ctx.beginPath();ctx.moveTo(131,381);ctx.quadraticCurveTo(127,285,124,168);ctx.stroke();
      const foliage=[];
      let index=variant*900;
      const rnd=()=>hash(++index);
      function fork(x,y,angle,len,weight,depth){
        const ex=x+Math.sin(angle)*len,ey=y-Math.cos(angle)*len;
        ctx.strokeStyle=depth>2?"#3c3931":"#413e34";ctx.lineWidth=weight;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.stroke();
        if(depth<3)foliage.push([ex,ey,13+19*rnd()]);
        if(depth<=0)return;
        fork(ex,ey,angle-.30-rnd()*.51,len*(.66+rnd()*.1),weight*.63,depth-1);
        fork(ex,ey,angle+.30+rnd()*.51,len*(.66+rnd()*.1),weight*.63,depth-1);
      }
      for(let i=0;i<9;i++)fork(128,255+rnd()*39,(i%2===0?-1:1)*rnd()*1.03,49+20*rnd(),3.5,3);
      for(const [x,y,r] of foliage)for(let p=0;p<49;p++){
        const a=rnd()*tau,d=Math.sqrt(rnd()),lx=x+Math.cos(a)*d*r,ly=y+Math.sin(a)*d*r*.68;
        const lit=clamp(Math.floor(2.7+Math.cos(a+.6)*d+rnd()*2.2-1.4),0,4);
        ctx.fillStyle=["#122026","#19282a","#283631","#374234","#51513c"][lit];
        ctx.beginPath();ctx.ellipse(lx,ly,1.8+rnd()*4.2,1.2+rnd()*2.8,rnd()*3,0,tau);ctx.fill();
      }
      ctx.restore();
    }
    const tex=texture(c);textures.push(tex);return tex;
  }
  const treeMat=new T.MeshBasicMaterial({map:treeAtlas(),vertexColors:true,alphaTest:.46,side:T.DoubleSide});
  treeMat.onBeforeCompile=shader=>{shader.uniforms.daylight=HanDaylight;shader.fragmentShader="uniform float daylight;\n"+shader.fragmentShader.replace("#include <color_fragment>","#include <color_fragment>\ndiffuseColor.rgb*=mix(vec3(1.),vec3(2.8,3.1,2.25),daylight);");};
  shared.push(treeMat);
  function litSurface(kind) {
    const isRoad=kind==="asphalt",isPaint=kind==="marking";
    const mat=new T.MeshBasicMaterial({vertexColors:true,map:isRoad?asphaltMap:null, side:T.DoubleSide});
    if(isPaint){mat.polygonOffset=true;mat.polygonOffsetFactor=-2;mat.polygonOffsetUnits=-2;}
    mat.customProgramCacheKey=()=>"hangang-road-3-"+kind;
    mat.onBeforeCompile = shader => {
      shader.uniforms.daylight=HanDaylight;shader.uniforms.carS=liveS;shader.uniforms.carL=liveL;
      shader.uniforms.roadWet=SeoulWeather.uniforms.wet;shader.uniforms.roadSnow=SeoulWeather.uniforms.snow;
      shader.vertexShader="attribute vec3 roadCoord; varying vec3 vRoadCoord; varying vec3 vRoutePos;\n"+shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\n vRoadCoord=roadCoord; vRoutePos=position;");
      shader.fragmentShader="uniform float daylight;uniform float roadWet,roadSnow;uniform float carS;uniform float carL;varying vec3 vRoadCoord;varying vec3 vRoutePos;\n"+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace("#include <color_fragment>",`#include <color_fragment>
        float s=vRoadCoord.x, lat=vRoadCoord.y, halfW=vRoadCoord.z;
        float lm=mod(s+24.,48.)-24.;
        float r=exp(-.5*(lm*lm/59. + pow((lat-halfW+3.8)/7.0,2.)));
        float o=exp(-.5*(lm*lm/59. + pow((lat-halfW-3.8)/7.0,2.)));
        float lm2=mod(s,96.)-48.;
        float outer=exp(-.5*(lm2*lm2/108.+pow((lat+halfW-1.)/5.4,2.)));
        float ahead=s-carS;float spread=1.3+.102*max(0.,ahead);
        float beam= smoothstep(-3.,3.,ahead)*(1.-smoothstep(12.,91.,ahead))*
          max(exp(-.5*pow((lat-carL-.68)/spread,2.)),exp(-.5*pow((lat-carL+.68)/spread,2.)));
        vec3 illuminance=vec3(.115,.141,.216)+vec3(1.05,.51,.19)*max(r,o)+vec3(.42,.25,.15)*outer+vec3(.52,.56,.64)*beam;
        diffuseColor.rgb*=mix(illuminance,vec3(1.10,1.08,1.035),daylight);`+
        (isRoad?`
        float stripe=abs(fract((lat+halfW)/3.5)-.5);
        float joint=abs(fract((s+.075*lat)/96.+.5)-.5)*96.;
        diffuseColor.rgb*=.78+.22*smoothstep(.025,.12,joint);
        float track=exp(-pow((stripe-.24)*13.,2.));
        diffuseColor.rgb*=1.-.036*track;
        float longSheen=exp(-abs(lm)*.07)*exp(-abs(lat-halfW+3.)*.32);
        diffuseColor.rgb+=vec3(.038,.025,.012)*longSheen;
        diffuseColor.rgb*=1.-.39*roadWet;
        diffuseColor.rgb+=roadWet*vec3(.055,.06,.075)*(longSheen+beam*.28);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.59,.65,.71)*(.24+.76*daylight),roadSnow*(.8-.25*track));
        `:isPaint?`
        diffuseColor.rgb*=.78+.10*beam+.13*max(r,o);
        `:`
        float stain=sin(lat*1.31+s*1.18+sin(s*5.8)*.66);
        float seam=1.-smoothstep(.012,.044,abs(fract(s/4.)-.5));
        diffuseColor.rgb*=.75+.024*stain-.065*seam;
        `));
    };
    shared.push(mat);return mat;
  }
  const roadMat=litSurface("asphalt"),markMat=litSurface("marking"),structMat=litSurface("civil");
  const bridgeMat=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide});shared.push(bridgeMat);
  const plantingMat=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide});shared.push(plantingMat);
  const gleamMat=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,toneMapped:false});shared.push(gleamMat);
  function bucket(mat) {return {mat,xyz:[],rgb:[],uv:[],rc:[],idx:[]};}
  function vertex(b,p,tint,rc) {
    const c=typeof tint==="number"?color(tint):tint;
    const i=b.xyz.length/3; b.xyz.push(p.x,p.y,p.z);b.rgb.push(c.r,c.g,c.b);
    if(rc){b.rc.push(rc[0],rc[1],rc[2]);if(b.mat===roadMat)b.uv.push(rc[1]*.22,rc[0]*.22);}
    return i;
  }
  function quad(b,pts,tints,coords) {
    const start=b.xyz.length/3;
    for(let i=0;i<4;i++)vertex(b,pts[i],Array.isArray(tints)?tints[i]:tints,coords?coords[i]:null);
    b.idx.push(start,start+1,start+2,start,start+2,start+3);
  }
  function closeMesh(b,group,owned){
    if(!b.idx.length)return;
    const g=new T.BufferGeometry();g.setIndex(b.idx);
    g.setAttribute("position",new T.Float32BufferAttribute(b.xyz,3));
    g.setAttribute("color",new T.Float32BufferAttribute(b.rgb,3));
    if(b.rc.length)g.setAttribute("roadCoord",new T.Float32BufferAttribute(b.rc,3));
    if(b.uv.length)g.setAttribute("uv",new T.Float32BufferAttribute(b.uv,2));
    g.computeBoundingSphere();
    const m=new T.Mesh(g,b.mat);group.add(m);owned.push(g);
  }
  function girder(b,a,d,width,depth,tints,rc) {
    const along=d.clone().sub(a);if(along.lengthSq()<1e-7)return;along.normalize();
    const side=vec(0,1,0).cross(along);if(side.lengthSq()<.00001)side.set(1,0,0);
    side.normalize().multiplyScalar(width/2);
    const up=along.clone().cross(side).normalize().multiplyScalar(depth/2);
    const corners=p=>[p.clone().sub(side).sub(up),p.clone().add(side).sub(up),p.clone().add(side).add(up),p.clone().sub(side).add(up)];
    const bottom=corners(a),top=corners(d);
    const c=typeof tints==="number"?[tints,tints,tints]:tints;
    const cc=rc?[rc,rc,rc,rc]:null;
    quad(b,[bottom[3],bottom[2],bottom[1],bottom[0]],c[1],cc);
    quad(b,top,c[1],cc);
    for(let i=0;i<4;i++){const j=(i+1)%4;quad(b,[bottom[i],bottom[j],top[j],top[i]],i===2?c[0]:i===0?c[2]:c[1],cc);}
  }
  function frame(s) {
    const p=world.point(clamp(s,0,length),0);
    // Derive the left axis from the provided lateral mapping, including arbitrary projected axes.
    const left=world.point(clamp(s,0,length),1);
    const ux=left.x-p.x,uz=left.z-p.z,d=Math.hypot(ux,uz)||1;
    const half=lane*clamp(world.lanesAt?world.lanesAt(clamp(s,0,length)):4,1,6)/2;
    const f={s,x:p.x,y:p.y,z:p.z,lx:ux/d,lz:uz/d,half};
    const other=world.opposite?.(clamp(s,0,length));
    const gap=other?Math.hypot(other.x-f.x,other.z-f.z):0;
    const shift=gap>half*1.45 ? other : {x:f.x+f.lx*(2*half+1.25),z:f.z+f.lz*(2*half+1.25)};
    f.other={...f,x:shift.x,y:Number.isFinite(shift.y)?shift.y:p.y,z:shift.z};
    f.separation=Math.hypot(shift.x-f.x,shift.z-f.z);
    return f;
  }
  const pt=(f,l,h)=>vec(f.x+l*f.lx,f.y+h,f.z+l*f.lz);
  const laneFaces=new Map();
  {let a=frame(0);
    for(let s=0;s<length;s+=6){
      const b=frame(Math.min(length,s+6));
      for(const [u,v] of [[a,b],[a.other,b.other]]){
        const p=(f,k)=>[f.x+k*f.half*f.lx,f.y,f.z+k*f.half*f.lz];
        const corners=[p(u,-1),p(v,-1),p(v,1),p(u,1)],xs=corners.map(t=>t[0]),zs=corners.map(t=>t[2]);
        const faces=[[corners[0],corners[1],corners[2]],[corners[0],corners[2],corners[3]]];
        for(let i=Math.floor(Math.min(...xs)/48);i<=Math.floor(Math.max(...xs)/48);i++)for(let j=Math.floor(Math.min(...zs)/48);j<=Math.floor(Math.max(...zs)/48);j++){
          const key=i+','+j;if(!laneFaces.has(key))laneFaces.set(key,[]);laneFaces.get(key).push(...faces);
        }
      }
      a=b;
    }
  }
  function obstructs(p,r,top){
    for(let i=Math.floor((p.x-r)/48);i<=Math.floor((p.x+r)/48);i++)for(let j=Math.floor((p.z-r)/48);j<=Math.floor((p.z+r)/48);j++)
      for(const f of laneFaces.get(i+','+j)||[])if(HanRoadClearance.overlaps(f,p.x,p.z,r,p.y,top))return true;
    return false;
  }
  const rc=(f,l)=>[f.s,l,f.half];
  function strip(b,a,d,al,dl,ar,dr,ay,dy,by,ey,tint){
    quad(b,[pt(a,al,ay),pt(d,dl,dy),pt(d,dr,ey),pt(a,ar,by)],tint,[rc(a,al),rc(d,dl),rc(d,dr),rc(a,ar)]);
  }
  function flat(b,a,d,al,dl,ar,dr,h,tint){strip(b,a,d,al,dl,ar,dr,h,h,h,h,tint);}
  const jersey=[[-.41,.015],[-.41,.18],[-.18,.54],[-.16,1.02],[.16,1.02],[.18,.54],[.41,.18],[.41,.015]];
  const sideWall=[[-.25,.02],[-.23,.73],[-.14,.80],[.11,.80],[.14,.59],[.22,.21],[.22,.01]];
  function barrier(b,a,d,la,ld,profile,tint){
    for(let i=1;i<profile.length;i++){
      const [lo,low]=profile[i-1],[hi,high]=profile[i];
      strip(b,a,d,la+lo,ld+lo,la+hi,ld+hi,low,low,high,high,tint);
    }
  }
  // A single points mesh per chunk draws all luminaire bloom, with constant angular size.
  const flareMat=new T.ShaderMaterial({vertexColors:true,transparent:true,blending:T.AdditiveBlending,depthWrite:false,
    uniforms:{px:{value:520},daylight:HanDaylight},vertexShader:`attribute float radius;uniform float px;varying vec3 hue;
    void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(radius*px/max(1.,-p.z),2.,92.);hue=color;}`,
    fragmentShader:`uniform float daylight;varying vec3 hue;void main(){vec2 q=gl_PointCoord-.5;float d=length(q)*2.;if(d>1.)discard;
    float core=exp(-d*d*78.);float halo=exp(-d*4.9)*(1.-smoothstep(.78,1.,d));
    gl_FragColor=vec4(hue,(core*.88+halo*.46)*(1.-daylight));}`});
  shared.push(flareMat);
  function flare(list,p,hex,r) {const c=color(hex);list.pos.push(p.x,p.y,p.z);list.col.push(c.r,c.g,c.b);list.r.push(r);}
  function makeFlares(list,g,owned) {
    if(!list.r.length)return;
    const geom=new T.BufferGeometry();
    for(const [name,arr,n] of [["position",list.pos,3],["color",list.col,3],["radius",list.r,1]])
      geom.setAttribute(name,new T.Float32BufferAttribute(arr,n));
    geom.computeBoundingSphere();
    const pts=new T.Points(geom,flareMat);
    pts.onBeforeRender=renderer=>{const canvas=renderer.domElement;flareMat.uniforms.px.value=canvas.height*.91;};
    pts.renderOrder=2;g.add(pts);owned.push(geom);
  }
  function placeLamp(b,glow,f,lateral,directions,outer){
    const stem=outer?8.3:9.8;
    const c=[0xaab2b8,0x777f87,0x515866],u=rc(f,lateral);
    const bpt=(lat,ht)=>pt(f,lat,ht);
    if(obstructs(bpt(lateral,.15),.23,f.y+stem))return;
    girder(b,bpt(lateral,.15),bpt(lateral,.88),.32,.31,[0x9c9d99,0x75787a,0x686c70],u);
    girder(b,bpt(lateral,.6),bpt(lateral,stem),.14,.15,c,u);
    for(const direction of directions){
      const x=lateral+direction*2.93;
      girder(b,bpt(lateral,stem-.29),bpt(lateral+direction*1.24,stem+.23),.11,.11,c,u);
      girder(b,bpt(lateral+direction*1.24,stem+.23),bpt(x,stem+.27),.08,.075,c,u);
      girder(b,bpt(x-direction*.2,stem+.23),bpt(x+direction*.45,stem+.18),.29,.11,c,u);
      flare(glow,bpt(x+direction*.15,stem+.10),outer?0xffd9a3:0xffcf88,3.45);
    }
  }
  const roadLabelCache=new Map();
  function pavementLabel(group,owned,station,title){
    let mat=roadLabelCache.get(title);
    if(!mat){
      const c=canvas(384,512),ctx=c.getContext("2d");ctx.fillStyle="#e0dfd4";ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.font='bold 114px "Malgun Gothic",sans-serif';const chars=Array.from(title.replace(/대교.*$/,"대교")).slice(0,8);
      chars.forEach((char,i)=>ctx.fillText(char,192,50+(chars.length-i-.5)*399/chars.length,290));
      const map=texture(c);textures.push(map);mat=new T.MeshBasicMaterial({map,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,side:T.DoubleSide});
      shared.push(mat);roadLabelCache.set(title,mat);
    }
    const p=world.point(station,-1.75),geo=new T.PlaneGeometry(1.7,9),mesh=new T.Mesh(geo,mat);
    mesh.rotation.order="YXZ";mesh.rotation.set(-Math.PI/2,p.yaw+Math.PI,0,"YXZ");mesh.position.set(p.x,p.y+.043,p.z);group.add(mesh);owned.push(geo);
  }
  function makeSign(g,owned,struct,glow,s,next){
    if (!next)return;
    const f=frame(s),p=(l,h)=>pt(f,l,h),u=rc(f,f.half+.48),w=7.1,h=2.4,at=-.5;
    const pole=f.half+.55,c=[0x879da2,0x6c8289,0x536066];
    const anchor=p(pole,0);
    if(obstructs(anchor,.23,f.y+7.82))return;
    girder(struct,anchor,p(pole,7.82),.26,.26,c,u);
    for(const y of [6.62,7.45])girder(struct,p(pole,y),p(at-w/2-.25,y),.12,.13,c,u);
    for(let k=at-w/2;k<pole-1;k+=1.12)girder(struct,p(k,6.62),p(k+1.12,7.45),.07,.08,c,u);
    const sign=canvas(1024,340),ctx=sign.getContext("2d");
    ctx.fillStyle="#12503b";ctx.fillRect(0,0,1024,340);ctx.strokeStyle="#b9d3c4";ctx.lineWidth=4;ctx.strokeRect(9,9,1006,322);
    const title=next.name.replace(/(북단|남단)$/, "");
    ctx.font='bold 98px "Malgun Gothic",sans-serif';ctx.textBaseline="middle";ctx.textAlign="left";ctx.fillStyle="#edf1df";
    const scale=Math.min(1,578/Math.max(1,ctx.measureText(title).width));
    ctx.save();ctx.translate(218,112);ctx.scale(scale,1);ctx.fillText(title,0,0);ctx.restore();
    ctx.fillStyle="#c8d9ca";ctx.font='44px "Malgun Gothic",sans-serif';ctx.fillText(world.routeName||"한강 도로",220,246);
    ctx.fillStyle="#24609a";ctx.strokeStyle="#d8e5dd";ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(115,125,67,54,0,0,tau);ctx.fill();ctx.stroke();
    ctx.fillStyle="#eff1e4";ctx.font="bold 58px Arial";ctx.textAlign="center";ctx.fillText(world.ref||"70",115,128);
    ctx.fillStyle="#e3eddb";ctx.beginPath();ctx.moveTo(891,56);ctx.lineTo(958,134);ctx.lineTo(921,134);ctx.lineTo(921,238);ctx.lineTo(866,238);ctx.lineTo(866,134);ctx.lineTo(827,134);ctx.closePath();ctx.fill();
    ctx.font="bold 28px Arial";ctx.fillText(Math.round((next.s-s)/50)*50+" m",891,288);
    const tex=texture(sign),mat=new T.MeshBasicMaterial({map:tex,color:0xd4e1da,side:T.DoubleSide});
    const geom=new T.PlaneGeometry(w,h),mesh=new T.Mesh(geom,mat);
    const look=world.point(Math.max(0,s-1),0);
    mesh.position.copy(p(at,7.1));mesh.lookAt(look.x,mesh.position.y,look.z);
    g.add(mesh);owned.push(tex,mat,geom);
    for(const k of [-1,1])flare(glow,p(at+k*w*.40,8.3),0xd8f5eb,.31);
  }
  const riverSide=world.riverSide===1?1:-1;
  const waterHeight=Number.isFinite(world.waterY)?world.waterY:-3.5;
  function addBridge(b,e,glow,item){
    const f=frame(item.s);
    let vx=item.dir?.x??f.lx*riverSide,vz=item.dir?.z??f.lz*riverSide;
    const d=Math.hypot(vx,vz)||1;vx/=d;vz/=d;
    if(!item.dir&&(vx*f.lx+vz*f.lz)*riverSide<0){vx=-vx;vz=-vz;}
    let width=item.width||world.riverWidthAt?.(item.s)||740;
    width=clamp(width,150,1900);
    const name=item.name||"";
    const doubleDeck=/반포|청담/.test(name);
    const underTruss=/성수|청담|당산|잠실철/.test(name);
    const arch=/서강|한강대교|동작|방화|한강철/.test(name);
    const tied=/성산/.test(name);
    const cable=/올림픽대교|월드컵대교|행주/.test(name);
    const deck=f.y+(doubleDeck?10.6:8.45),widthDeck=/철교/.test(name)?6.2:11.8;
    const gap=cable?128:arch||tied?99:underTruss?84:58;
    const rgb=cable?0x929b9f:arch||tied?0xa75535:underTruss?0x617a70:0x63757c;
    const edgeColor=cable?0xb8cbb8:arch||tied?0xb36338:underTruss?0x778699:0x79868b;
    const lamps=arch||tied?0xff9b55:cable?0xadd6ef:0xffd49a;
    const anchor=item.anchor||f;
    const P=(along,y,across)=>vec(anchor.x+vx*along-vz*across,y,anchor.z+vz*along+vx*across);
    const shadow=[0x66665f,0x3c4148,0x20272e],metal=[edgeColor,rgb,0x293139];
    const lower=doubleDeck?deck-4.9:deck;
    function bar(x,y,t,xx,yy,tt,w,h,pal){girder(b,P(x,y,t),P(xx,yy,tt),w,h,pal);}
    const inland=item.overRoad===false?0:-(riverSide>0?f.half*3+28:f.half+26);
    const count=Math.ceil((width-inland)/gap);
    for(let n=0;n<count;n++){
      const start=inland+n*gap,end=Math.min(width,start+gap),mid=(start+end)/2;
      const bay=end-start;
      // Beam pairs preserve a smooth underside silhouette from the low driving camera.
      bar(start,deck,0,end,deck,0,widthDeck*2+.8,.62,shadow);
      if(doubleDeck)bar(start,lower,0,end,lower,0,widthDeck*1.63,.46,shadow);
      for(const side of [-1,1]){
        const sideZ=side*widthDeck;
        bar(start,deck-.92,sideZ,end,deck-.92,sideZ,.48,1.30,metal);
        bar(start,deck+.48,sideZ,end,deck+.48,sideZ,.37,.89,[0x626561,0x464c4c,0x30383c]);
        bar(start,deck+.99,sideZ,end,deck+.99,sideZ,.10,.10,[0x8b8c84,0x5c655e,0x394447]);
        // Full-depth steel webs with edge flanges, plate joints, and a subtle bath
        // of light rising from the pier heads. The top and soffit stay distinct.
        const zz=side*(widthDeck+.252);
        const web=(x,y)=>P(x,deck+y,zz);
        const cant=arch||tied;
        function webLight(u,v){
          const pierGlow=(Math.exp(-Math.pow(u/.18,2))+Math.exp(-Math.pow((1-u)/.18,2)))*(1-v*.62);
          const lampGlow=Math.exp(-Math.pow((u-.36)/.17,2))*v*.14;
          const base=cant?[86,66,55]:[53,60,66];
          const mix=pierGlow+lampGlow;
          const red=Math.min(213,base[0]+mix*(doubleDeck?79:55)+v*9)|0;
          const green=Math.min(200,base[1]+mix*(doubleDeck?65:44)+v*7)|0;
          const blue=Math.min(190,base[2]+mix*(doubleDeck?50:33)+v*7)|0;
          return color((red<<16)|(green<<8)|blue);
        }
        for(let panel=0;panel<8;panel++){
          const u=panel/8,v=(panel+1)/8,x=start+u*bay,xx=start+v*bay;
          quad(b,[web(x,-1.52),web(xx,-1.52),web(xx,-.37),web(x,-.37)],[webLight(u,0),webLight(v,0),webLight(v,1),webLight(u,1)]);
          if(panel%2===0)bar(x,deck-1.52,zz,x,deck-.36,zz,.095,.102,[0x8a8170,0x565958,0x3a4245]);
          bar(x,deck+.89,sideZ,xx,deck+.89,sideZ,.11,.065,[0x7f8177,0x555d5d,0x3d454a]);
          bar(x,deck+.99,sideZ,x,deck+.59,sideZ,.074,.082,[0x72766f,0x495358,0x394247]);
        }
        if(doubleDeck)bar(start,lower-.56,sideZ*.80,end,lower-.56,sideZ*.80,.40,.10,[0x77796e,0x636a69,0x3a4146]);
        if(underTruss){
          const deep=doubleDeck?4.9:4.05;
          bar(start,deck-deep,sideZ,end,deck-deep,sideZ,.30,.39,metal);
          for(let j=0;j<10;j++){
            const x=start+j*bay/10;
            bar(x,deck-deep,sideZ,x+bay/20,deck-.6,sideZ,.21,.27,metal);
            bar(x+bay/20,deck-.6,sideZ,x+bay/10,deck-deep,sideZ,.21,.27,metal);
          }
        }
        if((arch||tied) && n>=1 && (tied||/한강대교|동작|한강철/.test(name)|| n===Math.floor(count/2))){
          const rise=tied?13:(/방화|서강/.test(name)?25:16);
          const y=x=>deck+1.05+(1-((x-mid)/(bay*.5))**2)*rise;
          for(let j=0;j<16;j++){
            const x=start+j*bay/16,xx=x+bay/16;
            bar(x,y(x),sideZ,xx,y(xx),sideZ,.72,.82,metal);
            if(j%2===1){bar(x,deck+.60,sideZ,x,y(x)-.20,sideZ,.16,.16,metal);flare(glow,P(x,deck+.74,sideZ),lamps,1.25);}
            if(side<0 && j%4===2)bar(x,y(x)+.12,-widthDeck,x,y(x)+.12,widthDeck,.26,.29,metal);
          }
        }
        // Secondary lower deck of Banpo Bridge.
        if(doubleDeck&&!underTruss)bar(start,lower-.37,sideZ*.80,end,lower-.37,sideZ*.80,.32,.62,metal);
        for(let j=0;j<3;j++){
          const x=start+(j+.20)*bay/3;
          bar(x,deck+.52,sideZ,x,deck+5.84,sideZ,.100,.11,[0x92959a,0x616a72,0x3e444d]);
          bar(x,deck+5.8,sideZ,x,deck+6.02,sideZ-side*.94,.1,.09,[0x92959a,0x616a72,0x3e444d]);
          flare(glow,P(x,deck+5.98,sideZ-side*.95),lamps,2.30);
        }
      }
      for(let j=0;j<5;j++){
        const x=start+(j+.35)*bay/5;
        bar(x,deck-1.05,-widthDeck,x,deck-1.05,widthDeck,.39,.64,[0x595d59,0x3b4143,0x262e34]);
      }
      const pier=start;
      if(Math.abs(pier)>35&&!obstructs(P(pier,waterHeight-1,0),widthDeck+2.1,lower)){
        const cap=lower-(underTruss&&!doubleDeck?4.62:2.05);
        for(const side of [-1,1]){
          const c=side*widthDeck*.62;
          bar(pier,waterHeight-1,c,pier,cap-.55,c,2.35,3.7,[0x737875,0x434d51,0x323d43]);
        }
        bar(pier,cap-.52,-widthDeck,pier,cap-.52,widthDeck,3.95,1.23,shadow);
        for(const side of [-1,1]){
          const zz=side*(widthDeck-.66);
          flare(glow,P(pier,cap+.12,zz),doubleDeck?0xffdfb8:0xeed3ad,1.08);
          bar(pier-.48,cap+.14,zz,pier+.48,cap+.14,zz,.23,.14,[0xb1ad9a,0x797771,0x444b4d]);
        }
      }
      if(cable && n===Math.floor(count*.55)){
        const x=mid,top=deck+(/월드컵/.test(name)?100:69);
        for(const side of [-1,1]){
          bar(x,deck-2.0,side*(widthDeck+.38),x+(/월드컵/.test(name)?9:0),top,side*1.0,1.8,2.35,[0xb4bbb0,0x747e81,0x566070]);
          for(let j=1;j<=8;j++)for(const sig of [-1,1]){
            bar(x+(/월드컵/.test(name)?9:0),top-j*2.35,side, x+sig*(j*11+13),deck+.61,side*widthDeck,.11,.13,[0xaab5ae,0x818f8d,0x5c696f]);
          }
        }
        flare(glow,P(x,top+1,0),0xff583a,3.1);
      }
    }
  }
  function makeChunk(index) {
    const first=index*span, last=Math.min(length,(index+1)*span);
    const g=new T.Group(),owned=[],roads=bucket(roadMat),paint=bucket(markMat),walls=bucket(structMat),bridges=bucket(bridgeMat),trees=bucket(treeMat),planting=bucket(plantingMat);
    const glows={pos:[],col:[],r:[]};
    const up=riverSide;
    const P=(f,l,y)=>pt(f,l,y);
    const edge=f=>up>0?f.half+.78:-f.half-.78;
    const concrete=[0x9d9e9c,0x898c8b,0x656665];
    const metal=[0xb1bbc2,0x85949c,0x616b74];
    const shoreA=f=>Math.min(-.2,waterHeight+.88-f.y);
    // Frame cache keeps expensive geodesic lookups outside the per-lane loop.
    const frames=new Map();
    function at(s){if(!frames.has(s))frames.set(s,frame(s));return frames.get(s);}
    for(let s=first;s<last-.01;s+=6){
      const t=Math.min(last,s+6),a=at(s),d=at(t);
      const halfA=a.half,halfD=d.half;
      const medA=halfA+.60,medD=halfD+.60;
      const oa=a.other,od=d.other;
      flat(roads,a,d,-halfA-.80,-halfD-.80,halfA+.75,halfD+.75,0,0xffffff);
      flat(roads,oa,od,-halfA-.67,-halfD-.67,halfA+.88,halfD+.88,-.015,0xffffff);
      // The opposite carriageway follows its own mapped alignment through splits.
      // A low verge occupies the gap between the carriageways, clear of driving surfaces.
      if(Math.max(a.separation,d.separation)<190){
        const topA=P(a,halfA+.4,-.21),topD=P(d,halfD+.4,-.21);
        const botA=P(oa,-halfA-.32,-.21),botD=P(od,-halfD-.32,-.21);
        const wide=Math.min(a.separation,d.separation)>45;
        const inner=(u,v,t,h)=>u.clone().lerp(v,t).add(vec(0,h,0));
        const profile=wide?[0,.08,.20,.42,.65,.84,.95,1]:[0,1];
        function turf(sf,t){
          const nearLamp=Math.exp(-.5*(Math.pow(((sf+24)%48)-24,2)/42+Math.pow(t*42,2)/52));
          const k=clamp(22+nearLamp*14+4*Math.sin(sf*.105+t*9)+3*Math.sin(sf*.029-t*5),15,45)|0;
          return color(((k+3)<<16)|((k+6)<<8)|(k+1));
        }
        function hump(t){return wide?Math.sin(t*Math.PI)*.73:0;}
        for(let j=1;j<profile.length;j++){
          const x=profile[j-1],y=profile[j];
          quad(planting,[inner(topA,botA,x,hump(x)),inner(topD,botD,x,hump(x)),inner(topD,botD,y,hump(y)),inner(topA,botA,y,hump(y))],
            [turf(s,x),turf(t,x),turf(t,y),turf(s,y)]);
        }
        if(wide){
          const zIdx=Math.round(s/6);
          // Low layered planting occupies the grass between mapped road edges.
          // Keep stems several metres from the concrete and outside both carriageways.
          for(let j=0;j<3;j++){
            const fraction=.13+j*.29+hash(s+j*22)*.12;
            const origin=inner(topA,botA,fraction,hump(fraction));
            const shrub=hash(s+j*79)>.31;
            if(shrub){
              const size=1.15+hash(s+j*31)*1.5;
              roadsideTree(a,0,0,size,63+j,origin,size*1.02,-.25);
            }
            if((zIdx+j*2)%8===2 && hash(s+53)>.15){
              const size=5.8+hash(s+61+j)*2.8;
              roadsideTree(a,0,0,size,83+j,origin,size*.43);
            }
          }
        }
      }
      barrier(walls,a,d,medA,medD,jersey,0xa3a49e);
      barrier(walls,a,d,-halfA-.75,-halfD-.75,sideWall,0x92938f);
      barrier(walls,oa,od,halfA+.67,halfD+.67,sideWall,0x939790);
      if(Math.min(a.separation,d.separation)>halfA+halfD+2.4)
        barrier(walls,oa,od,-halfA-.56,-halfD-.56,jersey,0xa3a49e);
      const line=(b,ax,dx,w,col,h=.019)=>flat(b,a,d,ax-w/2,dx-w/2,ax+w/2,dx+w/2,h,col);
      line(paint,halfA+.04,halfD+.04,.14,0xe0ae53);
      const oppLine=(ax,dx,w,col)=>flat(paint,oa,od,ax-w/2,dx-w/2,ax+w/2,dx+w/2,.021,col);
      oppLine(-halfA-.04,-halfD-.04,.14,0xe0ae53);
      line(paint,-halfA-.20,-halfD-.20,.16,0xd9dfdf);
      oppLine(halfA+.18,halfD+.18,.16,0xd9dfdf);
      if(Math.round(s/6)%2===0){
        const n=Math.round(2*halfA/lane);
        for(let l=1;l<n;l++){
          line(paint,-halfA+l*lane,-halfD+l*lane,.142,0xd4d9db);
          oppLine(halfA-l*lane,halfD-l*lane,.142,0xd4d9db);
        }
      }
      // Grates and raised pavement markers follow the carriageway tangent.
      const segmentIndex=Math.round(s/6);
      if(segmentIndex%5===0){
        const finish=at(Math.min(t,s+1.15));
        flat(paint,a,finish,-halfA-.52,-finish.half-.52,-halfA-.25,-finish.half-.25,.037,0x323938);
        for(let slot=0;slot<5;slot++){
          const p=at(s+.10+slot*.19),q=at(s+.16+slot*.19);
          flat(paint,p,q,-p.half-.49,-q.half-.49,-p.half-.28,-q.half-.28,.041,0x121716);
        }
        const end=at(s+.15);
        flat(paint,a,end,halfA-.07,end.half-.07,halfA+.03,end.half+.03,.048,0xf6c86d);
      }
      if(segmentIndex%3===0 && cross.some(br=>br.overRoad&&br.s-s>252&&br.s-s<273)){
        for(let laneIndex=0;laneIndex<4;laneIndex++){
          const lat=-halfA+(laneIndex+.5)*lane;
          function mark(points){
            const frames=points.map(([u,dist])=>at(s+dist));
            quad(paint,points.map(([u],i)=>P(frames[i],lat+u,.047)),0xe7e7d8,points.map(([u],i)=>rc(frames[i],lat+u)));
          }
          mark([[-.14,0],[.14,0],[.14,3.65],[-.14,3.65]]);
          mark([[-.68,3.25],[0,5.75],[.01,5.75],[.68,3.25]]);
        }
      }
      // Stainless running rail, terminal clips and small amber/white reflectors.
      for(const side of [-1,1]){
        const sf=side<0?a:oa,ef=side<0?d:od;
        const l=side*(halfA+.76),r=side*(halfD+.76);
        girder(walls,P(sf,l,.73),P(sf,l,1.11),.074,.091,metal,rc(sf,l));
        girder(walls,P(sf,l,1.12),P(ef,r,1.12),.100,.088,metal,rc(sf,l));
        if(Math.round(s/6)%3===0){
          const rr=l<0?l+.14:l-.14;
          girder(walls,P(sf,rr,.61),P(sf,rr,.69),.07,.14,[0xf6dfbe,0xd9c7b0,0xa99a87],rc(sf,rr));
        }
      }
      const sa=up>0?oa:a,sd=up>0?od:d;
      const e1=edge(sa),e2=edge(sd),b1=shoreA(sa),b2=shoreA(sd);
      // Embankment and lower paved cycle path sit between the road and the river.
      const shore=(x1,x2,h1,i1,h2,i2,tint)=>strip(walls,sa,sd,e1+x1*up,e2+x1*up,e1+x2*up,e2+x2*up,h1,i1,h2,i2,tint);
      shore(0,2,-.12,-.12,-.22,-.22,0x6b7066);shore(2,11,-.22,-.22,b1,b2,0x455848);
      shore(11,16,b1,b2,b1,b2,0x737477);shore(16,19,b1,b2,b1-.33,b2-.33,0x555b52);shore(19,24,b1-.33,b2-.33,b1-2.5,b2-2.5,0x686c64);
      const la=up<0?oa:a,ld=up<0?od:d;
      const landLo=-up*(halfA+.88),landLd=-up*(halfD+.88);
      strip(walls,la,ld,landLo,landLd,landLo-up*82,landLd-up*82,-.08,-.08,-1.30,-1.30,0x414741);
      function roadsideTree(f,l,floor,size,salt,origin,width,trim=0){
        const a=hash(s+salt),b=hash(s+salt+456),type=Math.floor(b*3);
        const p=origin?origin.clone():P(f,l,floor-.04),h=size*(1+a*.31),w=width||h*.38;
        p.y+=trim;
        if(obstructs(p,w+.20,p.y+h))return;
        const shade=[0xcad2d6,0xe1ddd0,0xd0d6c9][Math.floor(a*3)];
        for(let j=0;j<2;j++){
          const yaw=j*Math.PI/2+b*tau,dx=Math.cos(yaw)*w,dz=Math.sin(yaw)*w;
          quad(trees,[vec(p.x-dx,p.y,p.z-dz),vec(p.x+dx,p.y,p.z+dz),
            vec(p.x+dx,p.y+h,p.z+dz),vec(p.x-dx,p.y+h,p.z-dz)],shade,null);
          trees.uv.push(type/3,0,(type+1)/3,0,(type+1)/3,1,type/3,1);
        }
      }
      if(Math.round(s/6)%3===0 && hash(s+21)>.23){
        roadsideTree(la,landLo-up*(3+11*hash(s+89)),-.32,6.6,4);
        roadsideTree(la,landLo-up*(15+18*hash(s+71)),-.60,8.3,8);
      }
      if(Math.round(s/6)%7===0 && hash(s+12)>.26)
        roadsideTree(sa,e1+up*10.4,b1+.16,5.5,21);
      if(Math.round(s/6)%8===0){
        placeLamp(walls,glows,a,medA,[-1,1],false);
      }
      if(Math.round(s/6)%16===8){
        placeLamp(walls,glows,a,-halfA-.88,[1],true);
      }
      if(Math.round(s/6)%16===0&&!obstructs(P(sa,e1+up*13,b1),.15,sa.y+b1+3.55)){
        const l=e1+up*13;
        girder(walls,P(sa,l,b1),P(sa,l,b1+3.55),.082,.088,metal,rc(sa,l));
        flare(glows,P(sa,l,b1+3.59),0x94bab9,1.25);
      }
      if(Math.round(s/6)%64===43){
        const near=at(Math.min(s+.11,t));
        flat(paint,a,near,-halfA,-near.half,halfA,near.half,.012,0x555458);
      }
    }
    for (const item of cross){
      if(item.s>=first && (item.s<last||last===length&&item.s===last))addBridge(bridges,null,glows,item);
      const pavementAt=item.s-287;
      if(item.overRoad&&pavementAt>=Math.max(6,first)&&pavementAt<last)pavementLabel(g,owned,pavementAt,item.name);
      const signAt=item.s-474;
      if(signAt>=Math.max(6,first)&&signAt<last)makeSign(g,owned,walls,glows,signAt,item);
    }
    for(const b of [roads,paint,walls,bridges,trees,planting])closeMesh(b,g,owned);
    makeFlares(glows,g,owned);
    root.add(g);return {g,owned};
  }
  function drop(key) {
    const entry=active.get(key);if(!entry)return;
    root.remove(entry.g);entry.owned.forEach(x=>x.dispose());active.delete(key);
  }
  let stopped=false;
  function update(s,lateral=0){
    if(stopped)return;
    s=clamp(Number(s)||0,0,length);liveS.value=s;liveL.value=Number(lateral)||0;
    const ix=Math.min(Math.ceil(length/span)-1,Math.floor(s/span));
    const lo=Math.max(0,ix-2),hi=Math.min(Math.ceil(length/span)-1,ix+6);
    for(const k of active.keys())if(k<lo||k>hi)drop(k);
    for(let k=lo;k<=hi;k++)if(!active.has(k))active.set(k,makeChunk(k));
  }
  function dispose(){
    if(stopped)return;stopped=true;
    for(const k of active.keys())drop(k);
    scene.remove(root);textures.forEach(t=>t.dispose());shared.forEach(m=>m.dispose());lookup.clear();
  }
  return {update,dispose,group:root};
};
