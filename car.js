/* Distances in metres. The ground origin sits at the midpoint between bumpers. */
window.buildCar = function buildCar(T) {
  const group = new T.Group();
  const body = new T.Group();
  group.add(body);
  const wheels = [], frontPivots = [];
  const v = (x,y,z) => new T.Vector3(x,y,z);
  const material = (color, metalness, roughness, extra = {}) =>
    new T.MeshStandardMaterial({ color, metalness, roughness, side: T.DoubleSide, ...extra });
  const paint = new T.MeshPhysicalMaterial({
    color: 0x424c51, metalness: .72, roughness: .27, clearcoat: 1,
    clearcoatRoughness: .095, side: T.DoubleSide
  });
  const black = material(0x191f24,.32,.33), rubber = material(0x191a1a,.04,.76);
  const chrome = material(0xb7c5c9,.85,.2), spokeMetal = material(0x869299,.81,.23);
  const cast = material(0x373c40,.64,.39), caliper = material(0xb34c24,.45,.32);
  const glass = new T.MeshPhysicalMaterial({color:0x17232b,metalness:.27,roughness:.09,
    clearcoat:1,clearcoatRoughness:.055,ior:1.51,transparent:true,opacity:.88,
    depthWrite:false,side:T.DoubleSide,envMapIntensity:1.2});
  const interior = material(0x202529,.02,.85);
  const lampHousing = material(0x220f13,.45,.17);
  const red = material(0x390409,.08,.27,{emissive:0xd51a24,emissiveIntensity:1.3,toneMapped:false});
  const marker = material(0x401a03,.12,.29,{emissive:0xff6908,emissiveIntensity:1.06,toneMapped:false});
  const smoked=material(0x100c10,.38,.17), gap=material(0x0d1012,.12,.53);
  const filament=material(0x665043,.22,.42);
  const headlight = material(0xe3f7ff,.16,.17,{emissive:0xcaeaff,emissiveIntensity:1.65});
  const add = (target, geometry, mat) => {
    const m = new T.Mesh(geometry, mat);
    m.castShadow = !mat.transparent;
    m.receiveShadow = true;
    target.add(m);
    return m;
  };
  const box = (target,x,y,z,w,h,l,mat) => {
    const m=add(target,new T.BoxGeometry(w,h,l),mat);m.position.set(x,y,z);return m;
  };
  const ellipsoid = (target,x,y,z,w,h,l,mat) => {
    const m=add(target,new T.SphereGeometry(1,20,12),mat);m.position.set(x,y,z);m.scale.set(w,h,l);return m;
  };
  const tube = (target,pts,r,mat,steps=32) => {
    const path=new T.CatmullRomCurve3(pts.map(p=>v(...p)),false,'centripetal');
    return add(target,new T.TubeGeometry(path,steps,r,6,false),mat);
  };
  function grid(target,rows,cols,point,mat,reverse=false) {
    const pos=[], uv=[], ix=[];
    for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){
      pos.push(...point(i/rows,j/cols));
      uv.push(j/cols,i/rows);
      if(i<rows && j<cols){
        const a=i*(cols+1)+j,b=a+cols+1,c=b+1,d=a+1;
        ix.push(...(reverse?[a,c,b,a,d,c]:[a,b,c,a,c,d]));
      }
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();
    return add(target,g,mat);
  }
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  function interpolate(stations,z) {
    let i=0;while(i<stations.length-2 && stations[i+1][0]<z)i++;
    const a=stations[i],b=stations[i+1],pre=stations[Math.max(0,i-1)],next=stations[Math.min(stations.length-1,i+2)];
    const span=b[0]-a[0],t=clamp((z-a[0])/span,0,1),t2=t*t,t3=t2*t;
    return a.slice(1).map((start,k)=>{
      const j=k+1, m1=(b[j]-pre[j])/(b[0]-pre[0])*span, m2=(next[j]-a[j])/(next[0]-a[0])*span;
      return (2*t3-3*t2+1)*start+(t3-2*t2+t)*m1+(-2*t3+3*t2)*b[j]+(t3-t2)*m2;
    });
  }
  // Longitudinal stations specify half-width, shoulder height and deck crown.
  const form=[
    [-2.27,.932,.753,.824],[-2.20,.944,.763,.841],[-2.07,.952,.781,.855],
    [-1.67,.95,.77,.855],[-1.36,.955,.775,.875],[-.94,.929,.735,.855],
    [-.42,.908,.725,.842],[.28,.907,.725,.819],[.79,.927,.74,.806],
    [1.30,.947,.77,.764],[1.66,.933,.705,.73],[1.96,.895,.615,.654],
    [2.20,.81,.513,.575],[2.27,.71,.484,.548]
  ];
  const axles=[-1.33,1.34];
  // Rear corner plan, bumper kick and stamped registration pocket form one surface.
  function rearZ(x,y){
    const q=Math.abs(x)/.94;
    const recess=.067*Math.exp(-((y-.456)**2)/.0068)*Math.exp(-((q/.445)**4));
    const lower=.099*Math.exp(-((y-.214)**2)/.0046);
    return -2.355+.232*q**3.6 + .028*Math.exp(-((y-.755)**2)/.0035)+lower+recess;
  }
  function bodyZ(z,x,y){
    const t=clamp((-1.87-z)/.4,0,1),s=t*t*(3-2*t);
    return z+s*(rearZ(x,y)+2.27);
  }
  const archTop=z=>{
    const dz=Math.min(...axles.map(a=>Math.abs(a-z)));
    if(dz>=.40)return .205;
    const upper=.34+.372*Math.sqrt(Math.max(0,1-(dz/.40)**2));
    return .205+(upper-.205)*Math.min(1,(.40-dz)/.028);
  };
  function section(z) {
    const [w,shoulder,deck]=interpolate(form,z),arch=archTop(z);
    const waist=Math.max(shoulder,arch+.037);
    return [[.0,.17],[w*.72,.17],[w*.76,arch-.018],[w*.976,arch],
      [w*.994,arch+.018],[w*.982,arch+(waist-arch)*.43],[w,waist-.028],
      [w*.985,waist],[w*.923,waist+.029],[w*.79,deck+.008],
      [w*.63,deck+.023],[w*.48,deck+.008],[w*.25,deck+.012],[0,deck+.012]];
  }
  for(const side of [-1,1]){
    grid(body,160,13,(t,s)=>{
      const z=-2.27+t*4.54,[x,y]=section(z)[Math.round(s*13)];
      return [side*x,y,bodyZ(z,x,y)];
    },paint,side>0);
  }
  for(const end of [-1,1]){
    const z=end*2.27;
    const contour=section(z);
    grid(body,end<0?91:13,end<0?48:1,(s,t)=>{
      const seg=s*13,lo=Math.min(12,Math.floor(seg)),f=seg-lo;
      const x=T.MathUtils.lerp(contour[lo][0],contour[lo+1][0],f);
      const y=T.MathUtils.lerp(contour[lo][1],contour[lo+1][1],f);
      const px=(t*2-1)*x;
      return [px,y,bodyZ(z,px,y)];
    },paint,end>0);
  }
  const cab=[
    [-1.77,.73,.715,.862,.875],[-1.57,.77,.69,.863,.993],[-1.22,.79,.65,.872,1.20],
    [-.86,.794,.625,.877,1.345],[-.50,.795,.622,.873,1.391],[-.13,.797,.629,.872,1.389],
    [.18,.804,.641,.859,1.33],[.46,.811,.670,.845,1.205],[.75,.816,.707,.827,1.024],
    [.98,.798,.736,.808,.828]
  ];
  const cabinPoint=(z,t,side)=>{
    const [base,top,belt,roof]=interpolate(cab,z);
    return [side*(base+(top-base)*t+.014*Math.sin(t*Math.PI)),belt+(roof-belt)*t,z];
  };
  const crown=(z,s)=>{
    const [,w,,roof]=interpolate(cab,z);
    return [s*w,roof+.029*(1-s*s),z];
  };
  function canopyFace(z0,z1,baseMat) {
    grid(body,24,16,(u,s)=>{
      return crown(z0+(z1-z0)*u,s*2-1);
    },baseMat);
  }
  canopyFace(-1.77,-1.71,paint);canopyFace(-1.71,-.865,glass);
  canopyFace(-.865,.18,paint);canopyFace(.18,.98,glass);
  function windowStripe(z,width,rad,mat,lift){
    const pts=[];
    for(let k=0;k<=12;k++){
      const p=crown(z,(k/6-1)*width);p[1]+=lift;pts.push(p);
    }
    tube(body,pts,rad,mat,14);
  }
  for(const z of [-1.71,-.865,.18,.965])windowStripe(z,.99,.008,black,.002);
  for(let i=0;i<11;i++)windowStripe(-1.636+i*.062,.914,.00115,filament,.003);
  const highStop=material(0x180609,.15,.21,{emissive:0xff2630,emissiveIntensity:0,toneMapped:false});
  windowStripe(-.901,.276,.008,smoked,.002);
  windowStripe(-.901,.259,.0045,highStop,.010);
  for(const s of [-1,1]){
    const bus=[];
    for(let i=0;i<=9;i++){const p=crown(-1.655+i*.084,s*.913);p[1]+=.003;bus.push(p);}
    tube(body,bus,.0018,filament,14);
    const rearEdge=Array.from({length:16},(_,i)=>crown(-1.72+i*.057,s*.987));
    tube(body,rearEdge,.015,black,18);
    tube(body,rearEdge.map(([x,y,z])=>[x+s*.014,y+.006,z]),.012,paint,18);
  }
  // The rear quarter sail is painted, and side windows have independent brightwork.
  for(const side of [-1,1]){
    for(const [a,b,mat] of [[-1.77,-1.23,paint],[-1.23,.84,glass],[.84,.98,paint]]){
      grid(body,32,5,(u,s)=>cabinPoint(a+(b-a)*u,s,side),mat,side<0);
    }
    const edge=(z,t)=>cabinPoint(z,t,side);
    tube(body,[-1.23,-1.09,-.84,-.45,0,.4,.73,.86].map(z=>edge(z,1)),.023,paint);
    tube(body,[-1.23,-.9,-.72,-.38,0,.41,.84].map(z=>edge(z,.032)),.015,black);
    tube(body,[-1.23,-.9,-.72,-.38,0,.41,.84].map(z=>edge(z,.009)),.0065,chrome);
    tube(body,[edge(-.19,.015),edge(-.234,.5),edge(-.27,1)],.037,black,8);
    tube(body,[edge(-1.13,.015),edge(-1.086,.5),edge(-1.037,1)],.015,black,8);
    tube(body,[edge(.87,.02),edge(.60,.64),edge(.20,1)],.025,paint,16);
    const skirt=box(body,side*.898,.235,-.02,.05,.065,1.66,black);
    skirt.rotation.z=-side*.08;
    const flank=(z,y,offset=0)=>[side*(interpolate(form,z)[0]*.989+offset),y,z];
    tube(body,[flank(-1.1,.743,.006),flank(-.91,.58,.006),flank(-.76,.365,.006),flank(-.54,.294,.006),flank(-.17,.282,.006),flank(.59,.285,.006),flank(.74,.335,.006),flank(.81,.715,.006)],.004,black,38);
    tube(body,[flank(-.18,.737,.008),flank(-.19,.55,.006),flank(-.18,.398,.006),flank(-.17,.283,.006)],.0038,gap,12);
    for(const z of [-.94,.045]){
      const [x,y]=flank(z,.704,.004);
      ellipsoid(body,x,y,z,.013,.021,.076,gap);
      ellipsoid(body,x+side*.006,y+.002,z,.011,.010,.060,chrome);
    }
    tube(body,[[side*.79,.856,.66],[side*.875,.914,.62],[side*.933,.94,.591]],.022,black,10);
    ellipsoid(body,side*.968,.949,.595,.113,.055,.101,paint);
    ellipsoid(body,side*.967,.949,.544,.092,.039,.046,chrome);
    // A painted arch lip and recessed black wheel liner trace each opening.
    for(const axle of axles){
      const arc=[];
      for(let k=0;k<=24;k++){
        const theta=k/24*Math.PI,z=axle+.384*Math.cos(theta);
        arc.push([side*(interpolate(form,z)[0]*.991),.343+.37*Math.sin(theta),z]);
      }
      tube(body,arc,.013,paint,28);
      const liner=arc.map(([x,y,z])=>[x-side*.028,y-.013,z]);
      tube(body,liner,.026,black,28);
    }
    // Raised shoulders lead into the taper of the bonnet.
    tube(body,[[side*.70,.79,.9],[side*.655,.783,1.28],[side*.595,.731,1.69],[side*.545,.633,2.01]],
      .005,black,20);
  }
  ellipsoid(body,0,.831,.67,.744,.059,.305,interior);
  for(const s of [-1,1]){
    const seat=ellipsoid(body,s*.365,.90,-.29,.205,.247,.125,interior);
    seat.rotation.x=-.14;
    ellipsoid(body,s*.365,1.125,-.315,.095,.093,.066,interior);
  }
  // The continuous lens follows the stamped panel and turns up around each quarter.
  function back(x,y,offset=0){return [x,y,rearZ(x,y)-offset];}
  const samples=(n,fn)=>Array.from({length:n+1},(_,i)=>fn(i/n));
  const tailY=x=>.687+.011*(Math.abs(x)/.9)**2;
  const centerBar=samples(28,t=>{const x=(t*2-1)*.796;return back(x,tailY(x),.012);});
  grid(body,48,5,(u,v)=>{
    const x=(u*2-1)*.897,y=tailY(x)+(v-.5)*(.061+.036*Math.abs(x)**4);
    return back(x,y,.004);
  },smoked,true);
  tube(body,centerBar,.0096,red,45);
  for(const side of [-1,1]){
    const wing=arr=>arr.map(([x,y,d])=>back(side*x,y,d));
    const hooked=wing([[.76,tailY(.76),.014],[.823,.697,.016],[.851,.710,.018],
      [.869,.728,.020],[.885,.738,.021],[.903,.739,.023],[.918,.737,.025]]);
    tube(body,hooked,.0125,red,29);
    tube(body,wing([[.584,.651,.012],[.711,.654,.013],[.782,.655,.013],[.822,.663,.014],
      [.847,.679,.017],[.862,.694,.018]]),.0085,red,24);
    // Optical ribs remain visible inside the lower red lens.
    for(let i=0;i<16;i++){
      const x=.60+i*.011,y=.661+(x-.6)*.02;
      tube(body,wing([[x,y,.010],[x+.004,y+.012,.010]]),.0022,smoked,2);
    }
    tube(body,[[side*.913,.738,rearZ(.913,.738)-.025],[side*.936,.739,-2.095],
      [side*.945,.741,-2.052],[side*.946,.740,-2.002]],.010,red,12);
    // Narrow lenses and three independent projector modules.
    tube(body,[[side*.465,.535,2.258],[side*.646,.542,2.238],[side*.782,.557,2.193],[side*.849,.579,2.082]],.035,black,22);
    tube(body,[[side*.472,.554,2.282],[side*.65,.558,2.257],[side*.784,.572,2.204],[side*.853,.592,2.096]],.010,headlight,21);
    for(let j=0;j<3;j++){
      const x=.54+j*.079;
      ellipsoid(body,side*x,.535,2.276-(x-.54)*.33,.026,.012,.020,chrome);
      ellipsoid(body,side*x,.535,2.293-(x-.54)*.33,.014,.006,.009,headlight);
    }
    tube(body,[[side*.849,.568,2.112],[side*.866,.574,2.071],[side*.876,.58,2.036]],.007,marker,9);
    // Creases around the boot lid and reflectors molded into the black valance.
    tube(body,wing([[.652,.81,.004],[.701,.792,.005],[.748,.745,.006],[.769,.712,.006],
      [.769,.643,.006],[.718,.608,.005],[.583,.586,.005]]),.0035,gap,25);
    tube(body,wing([[.62,.372,.013],[.733,.377,.014],[.812,.395,.015]]),.018,black,16);
    tube(body,wing([[.635,.374,.029],[.73,.38,.031],[.802,.393,.030]]),.006,red,14);
  }
  tube(body,samples(30,t=>{
    const x=(t*2-1)*.829,y=.789+.025*(1-(x/.85)**2);
    return back(x,y,.011);
  }),.013,paint,40);
  grid(body,52,12,(u,v)=>{
    const x=(u*2-1)*.864,edge=Math.abs(x)/.864;
    const lower=.203+.048*edge**2,upper=.348+.069*edge**3,y=lower+(upper-lower)*v;
    return back(x,y,.013+.006*v);
  },black,true);
  tube(body,samples(35,t=>{
    const x=(t*2-1)*.839,y=.281+.042*(Math.abs(x)/.84)**2;
    return back(x,y,.024);
  }),.009,cast,42);
  for(const side of [-1,1]){
    for(const x of [.22,.42,.57]){
      const fin=box(body,x*side,.234,rearZ(x,.234)-.010,.014,.063,.117,black);
      fin.rotation.x=.23;
    }
    const tipX=side*.693,tipY=.271,tipZ=rearZ(tipX,tipY)-.032;
    ellipsoid(body,tipX,tipY,tipZ,.090,.032,.036,chrome);
    ellipsoid(body,tipX,tipY,tipZ-.015,.075,.022,.028,gap);
  }
  ellipsoid(body,0,.331,2.221,.733,.098,.071,black);
  for(let i=-9;i<=9;i++){
    const x=i*.063;
    box(body,x,.325,2.265+.017*(1-Math.abs(i)/9),.012,.117,.012,cast);
  }
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=154;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#cecfca';ctx.fillRect(0,0,768,154);ctx.fillStyle='#101a27';
  ctx.fillRect(3,3,762,148);ctx.fillStyle='#d7d9d3';ctx.fillRect(6,6,756,142);
  ctx.fillStyle='#203d62';ctx.fillRect(6,6,41,142);
  ctx.fillStyle='#1b2228';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='bold 107px Arial, Malgun Gothic, sans-serif';ctx.fillText('381가 0724',404,80);
  const plateTexture=new T.CanvasTexture(canvas);
  if(T.SRGBColorSpace)plateTexture.colorSpace=T.SRGBColorSpace;
  const pocketZ=rearZ(0,.466)-.012;
  const plate=add(body,new T.PlaneGeometry(.518,.113),material(0xfafff4,.05,.52,
    {map:plateTexture,emissive:0x6a706b,emissiveMap:plateTexture,emissiveIntensity:.16}));
  plate.position.set(0,.466,pocketZ-.012);plate.rotation.y=Math.PI;
  box(body,0,.466,pocketZ,.542,.133,.014,black);
  for(const side of [-1,1]){
    ellipsoid(body,side*.237,.467,pocketZ-.016,.004,.004,.003,cast);
    box(body,side*.147,.54,rearZ(side*.147,.54)-.006,.037,.007,.013,headlight);
  }
  const badgeY=.762;
  tube(body,[back(-.050,badgeY+.005,.010),back(-.018,badgeY+.005,.010),back(0,badgeY-.012,.010),
    back(.018,badgeY+.005,.010),back(.050,badgeY+.005,.010)],.0045,chrome,9);
  // Sprite-lens bloom follows the emitting elements, remains depth tested and responds to brakes.
  const bloomCanvas=document.createElement('canvas');bloomCanvas.width=bloomCanvas.height=64;
  const bloomCtx=bloomCanvas.getContext('2d'),gradient=bloomCtx.createRadialGradient(32,32,0,32,32,32);
  for(const [at,c] of [[0,'rgba(255,255,255,.68)'],[.15,'rgba(255,255,255,.39)'],
    [.43,'rgba(255,255,255,.105)'],[.76,'rgba(255,255,255,.022)'],[1,'rgba(255,255,255,0)']])gradient.addColorStop(at,c);
  bloomCtx.fillStyle=gradient;bloomCtx.fillRect(0,0,64,64);
  const bloomMap=new T.CanvasTexture(bloomCanvas);
  const bloomMaterial=new T.SpriteMaterial({map:bloomMap,color:0xff0d13,transparent:true,opacity:.27,
    blending:T.AdditiveBlending,depthWrite:false,depthTest:true,toneMapped:false});
  for(const [x,y,w,h] of [[-.81,.688,.27,.15],[-.50,.687,.53,.094],[0,.687,.63,.084],
    [.5,.687,.53,.094],[.81,.688,.27,.15]]){
    const sprite=new T.Sprite(bloomMaterial);sprite.position.set(...back(x,y,.037));
    sprite.scale.set(w,h,1);sprite.renderOrder=3;body.add(sprite);
  }
  function glowControl(mat){
    return {get emissiveIntensity(){return red.emissiveIntensity;},
      set emissiveIntensity(n){
        mat.opacity=Math.min(.62,.12+.1*n);
        highStop.emissiveIntensity=Math.max(0,n-1.35)*1.14;
      }};
  }
  const tireProfile=[[-.100,.225],[-.123,.254],[-.126,.298],[-.117,.322],[-.093,.336],[-.063,.342],
    [.063,.342],[.093,.336],[.117,.322],[.126,.298],[.123,.254],[.100,.225],[-.100,.225]];
  // Draw sipes directly in tyre-space so the pattern rotates with the wheel.
  const treadCanvas=document.createElement('canvas');treadCanvas.width=2048;treadCanvas.height=768;
  const treadCtx=treadCanvas.getContext('2d');
  treadCtx.scale(4,4);
  treadCtx.fillStyle='#a6a6a6';treadCtx.fillRect(0,0,512,192);
  treadCtx.lineJoin='round';
  const ribs=[[43,78,8],[79,96,5],[98,115,-4],[116,150,-9]];
  for(let i=0;i<=48;i++){
    const u=i*512/48;
    for(const [from,to,slant] of ribs){
      const x=u+(slant<0?3:0);
      treadCtx.strokeStyle='#454545';treadCtx.lineWidth=1.5;treadCtx.beginPath();
      treadCtx.moveTo(x,from);treadCtx.lineTo(x+slant*.35,(from+to)*.5);treadCtx.lineTo(x+slant,to);treadCtx.stroke();
      treadCtx.strokeStyle='#727272';treadCtx.lineWidth=.55;treadCtx.beginPath();
      treadCtx.moveTo(x+2.5,from+2);treadCtx.lineTo(x+slant*.69+2.5,to-3);treadCtx.stroke();
    }
  }
  for(const y of [72,84,108,119]){treadCtx.fillStyle='#515151';treadCtx.fillRect(0,y,512,2.5);}
  const treadMap=new T.CanvasTexture(treadCanvas);treadMap.wrapS=T.RepeatWrapping;treadMap.anisotropy=8;
  rubber.bumpMap=treadMap;rubber.bumpScale=.0045;
  function cylinderX(target,r,h,mat,x=0,y=0,z=0){
    const m=add(target,new T.CylinderGeometry(r,r,h,36),mat);
    m.rotation.z=Math.PI/2;m.position.set(x,y,z);return m;
  }
  function rimRing(parent,x,r,t,mat){
    const m=add(parent,new T.TorusGeometry(r,t,7,48),mat);
    m.rotation.y=Math.PI/2;m.position.x=x;return m;
  }
  function blade(wheel,side,a,fork){
    const points=[[.058,-.09,.121],[.139,-.035,.118],[.231,fork*.114-.025,.105],
      [.229,fork*.114+.055,.122],[.145,.104,.122],[.058,.137,.125]];
    const coords=points.map(([r,b,x])=>[side*x,r*Math.cos(a+b),r*Math.sin(a+b)]);
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(coords.flat(),3));
    g.setIndex([0,1,5,1,4,5,1,2,4,2,3,4]);g.computeVertexNormals();add(wheel,g,spokeMetal);
  }
  // Flatten fixed geometry by material. This keeps detailed trim inexpensive to draw.
  function batch(parent){
    const batches=new Map();
    for(const mesh of [...parent.children]){
      if(!mesh.isMesh)continue;
      mesh.updateMatrix();const original=mesh.geometry;
      const geo=original.index?original.toNonIndexed():original.clone();geo.applyMatrix4(mesh.matrix);
      let bin=batches.get(mesh.material);
      if(!bin){bin={position:[],normal:[],uv:[]};batches.set(mesh.material,bin);}
      for(const name of Object.keys(bin)){
        const attrib=geo.getAttribute(name);
        if(attrib)for(const val of attrib.array)bin[name].push(val);
        else for(let i=0;i<geo.getAttribute('position').count*(name==='uv'?2:3);i++)bin[name].push(0);
      }
      parent.remove(mesh);original.dispose();geo.dispose();
    }
    for(const [mat,bin] of batches){
      const g=new T.BufferGeometry();
      for(const [name,values] of Object.entries(bin))g.setAttribute(name,new T.Float32BufferAttribute(values,name==='uv'?2:3));
      g.computeBoundingSphere();add(parent,g,mat);
    }
  }
  for(const axle of [1.34,-1.33])for(const side of [-1,1]){
    const pivot=new T.Group();pivot.position.set(side*.809,.344,axle);group.add(pivot);
    if(axle>0)frontPivots.push(pivot);
    const wheel=new T.Group();pivot.add(wheel);wheels.push(wheel);
    const tyre=add(wheel,new T.LatheGeometry(tireProfile.map(([x,r])=>new T.Vector2(r,x)),72),rubber);
    tyre.rotation.z=-Math.PI/2;
    cylinderX(wheel,.24,.17,black);
    cylinderX(wheel,.190,.025,cast,side*.086);
    rimRing(wheel,side*.114,.236,.012,chrome);
    rimRing(wheel,side*.115,.219,.007,spokeMetal);
    rimRing(wheel,side*.124,.301,.0022,cast);
    for(let k=0;k<8;k++){
      const a=k*Math.PI/4;
      for(const fork of [-1,1]){
        blade(wheel,side,a,fork);
      }
    }
    for(let k=0;k<5;k++){
      const a=k*Math.PI*.4;
      cylinderX(wheel,.007,.006,cast,side*.134,.042*Math.cos(a),.042*Math.sin(a));
    }
    cylinderX(wheel,.052,.022,chrome,side*.118);
    cylinderX(wheel,.037,.026,black,side*.118);
    box(pivot,side*.095,.013,-.154,.036,.121,.066,caliper);
    batch(wheel);
  }
  const chassis=new T.Group();group.add(chassis);
  box(chassis,0,.211,-.05,1.22,.093,2.28,cast);
  box(chassis,0,.213,.94,.88,.13,.62,black);
  for(const z of [-1.33,1.34])box(chassis,0,.224,z,1.18,.095,.14,cast);
  for(const side of [-1,1]){
    tube(chassis,[[side*.43,.19,1.11],[side*.46,.185,.65],[side*.41,.17,-.69],[side*.50,.185,-1.25],[side*.62,.22,-1.83]],.031,chrome,24);
    box(chassis,side*.51,.21,-1.57,.22,.109,.46,cast);
  }
  batch(chassis);
  const up=new T.Vector3(0,1,0),delta=new T.Vector3();
  const rodGeo=new T.CylinderGeometry(1,1,1,8);
  function link(mat,radius){
    const mesh=add(group,rodGeo,mat);
    return (a,b)=>{delta.subVectors(b,a);mesh.position.copy(a).addScaledVector(delta,.5);
      mesh.scale.set(radius,delta.length(),radius);mesh.quaternion.setFromUnitVectors(up,delta.normalize());};
  }
  const corners=wheels.map(wheel=>{
    const pivot=wheel.parent, home=pivot.position.clone(),sign=Math.sign(home.x);
    pivot.name='hub';wheel.name='wheel';
    const top=new T.Vector3(sign*.57,.64,home.z-.045),foot=new T.Vector3(),knuckle=new T.Vector3();
    const anchors=[-.19,.19].map(d=>new T.Vector3(sign*.33,.235,home.z+d));
    const tread=wheel.children.find(mesh=>mesh.material===rubber);
    const tireData={value:new T.Vector4(1,0,.344,.344)};
    if(tread){
      tread.material=rubber.clone();
      tread.material.onBeforeCompile=shader=>{
        shader.uniforms.wheelContact=tireData;
        shader.vertexShader="uniform vec4 wheelContact;\n"+shader.vertexShader.replace("#include <begin_vertex>",
          `#include <begin_vertex>
           vec2 vertical=wheelContact.xy;
           float ring=smoothstep(.224,.339,length(position.yz));
           transformed.yz*=1.+ring*(wheelContact.w/.344-1.);
           float yTire=dot(transformed.yz,vertical);
           float deflection=max(0.,-wheelContact.z-yTire);
           transformed.yz+=vertical*deflection;
           transformed.x+=sign(position.x)*ring*deflection*.36;`);
      };
    }
    const arms=anchors.map(()=>link(cast,.022)), damper=link(chrome,.024);
    const helix=[];
    for(let k=0;k<=60;k++){const a=k*Math.PI/6;helix.push(new T.Vector3(.049*Math.cos(a),k/60,.049*Math.sin(a)));}
    const spring=add(group,new T.TubeGeometry(new T.CatmullRomCurve3(helix),72,.0075,6,false),black);
    return (w,heave=0,roll=0,pitch=0)=>{
      const suspensionY=w.height-heave-home.x*roll+home.z*pitch;
      pivot.position.set(home.x-sign*w.damage*.057,home.y+suspensionY,home.z-(home.z>0?1:-1)*w.damage*.07);
      pivot.rotation.order='YXZ';pivot.rotation.set(0,w.steer,w.camber-roll*.70);
      wheel.rotation.x=w.rotation;
      const unloaded=w.radius+.013;
      const loaded=w.grounded?Math.max(.245,.344+w.height-w.ground):unloaded;
      tireData.value.set(Math.cos(w.rotation),-Math.sin(w.rotation),loaded,unloaded);
      knuckle.copy(pivot.position);knuckle.x-=sign*.107;knuckle.y-=.078;
      arms.forEach((arm,i)=>arm(anchors[i],knuckle));
      foot.copy(knuckle);foot.y+=.055;damper(foot,top);
      delta.subVectors(top,foot);spring.position.copy(foot).addScaledVector(delta,.19);
      spring.scale.y=delta.length()*.64;spring.quaternion.setFromUnitVectors(up,delta.normalize());
    };
  });
  for(const update of corners)update({height:0,damage:0,steer:0,camber:0,rotation:0,radius:.344});
  batch(body);
  group.name='Hangang GT';
  return {group,wheels,frontPivots,updateChassis(car){corners.forEach((update,i)=>update(car.wheels[i],car.heave,car.roll,car.pitch));},brakeLights:[red,glowControl(bloomMaterial)]};
};
