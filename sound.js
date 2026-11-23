/* Player engine uses CC0 Elantra recordings. Traffic, exhaust pops and impacts are synthesized. */
window.createAvanteExhaust=function(){
 let loadTime,armed,lastGear,lastRpm,clock,lockout,next,pops,power,glow;
 function reset(){
   loadTime=0;armed=false;lastGear=0;lastRpm=0;clock=0;lockout=0;next=0;pops=0;power=0;glow=0;
 }
 reset();
 function step(car,gas,dt,active){
   if(!active||!car.forward){reset();return {pulse:0,glow:0};}
   const elapsed=Math.max(0,Math.min(.15,dt));
   clock+=elapsed;glow=Math.max(0,glow-elapsed*19);
   const moving=Math.abs(car.u)>4,rpm=car.rpm;
   if(gas>.48&&moving&&rpm>2900){
     loadTime+=elapsed;if(loadTime>.14)armed=true;
   }else if(gas<.18||!moving||rpm<2300){loadTime=0;}
   let pulse=0;
   const shift=lastGear>0&&car.gear>lastGear&&moving&&gas>.55&&Math.max(lastRpm,rpm)>4500;
   if(shift&&clock>=lockout){
     pulse=.88+Math.min(.12,Math.max(0,lastRpm-4500)/14000);
     pops=0;armed=false;loadTime=0;lockout=clock+.26;
   }else if(gas<.18&&armed){
     armed=false;
     if(moving&&rpm>3000&&clock>=lockout){
       pops=rpm>4700?3:2;power=Math.min(.83,.45+(rpm-3000)/7500);
       next=clock+.022;lockout=clock+.52;
     }
   }
   if(gas>.35||rpm<2100||!moving)pops=0;
   if(pops&&clock>=next){
     pulse=power;pops--;power*=.66;
     next=clock+(pops===1?.122:.077);
   }
   if(pulse>.69)glow=Math.max(glow,(pulse-.65)*2.7);
   lastGear=car.gear;lastRpm=rpm;return {pulse,glow};
 }
 return {step,reset};
};
window.createSeoulSound=function(ctx){
 const master=ctx.createGain(),limiter=ctx.createDynamicsCompressor();
 master.gain.value=0;limiter.threshold.value=-12;limiter.ratio.value=4;master.connect(limiter);limiter.connect(ctx.destination);
 let seed=91357;const noise=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2147483648)-1;
 const size=ctx.sampleRate*2,air=ctx.createBuffer(1,size,ctx.sampleRate),samples=air.getChannelData(0);
 for(let i=0;i<size;i++)samples[i]=noise();
 // 1200 rpm = ten complete four-stroke cycles per second. Bake multiple
 // cycles with small cylinder variations so idle does not sound like a buzzer.
 const rpmRef=1200,profiles=[
   {cyl:4,low:94,high:224,decay:69,gains:[1,.86,.94,.79]},
   {cyl:6,low:122,high:295,decay:92,gains:[1,.93,.84,.96,.89,.93]},
   {cyl:4,low:74,high:335,decay:86,gains:[1,.81,.90,.76]}];
 function exhaust(cfg,index){
   const buffer=ctx.createBuffer(1,size,ctx.sampleRate),a=buffer.getChannelData(0),pulses=20*cfg.cyl;
   for(let n=0;n<pulses;n++){
     const onset=Math.round((n+.06+.024*noise())*size/pulses);
     const amp=cfg.gains[n%cfg.cyl]*(1+.075*noise()),pitch=1+.028*noise();
     let smoothNoise=0;
     for(let j=0;j<ctx.sampleRate*.082;j++){
       const t=j/ctx.sampleRate,envelope=(1-Math.exp(-t*1400))*Math.exp(-t*cfg.decay);
       smoothNoise=.79*smoothNoise+.21*noise();
       const body=Math.sin(6.283*cfg.low*pitch*t+.9*(1-Math.exp(-t*120)));
       const edge=.36*Math.sin(6.283*cfg.high*t)*Math.exp(-t*110);
       a[(onset+j)%size]+=amp*envelope*(body+edge+smoothNoise*(index===2?1.65:.60));
     }
   }
   let peak=.01;for(const v of a)peak=Math.max(peak,Math.abs(v));for(let i=0;i<size;i++)a[i]*=.87/peak;
   return buffer;
 }
 const combustion=profiles.map(exhaust);
 function filter(type,f,q){const n=ctx.createBiquadFilter();n.type=type;n.frequency.value=f;n.Q.value=q;return n;}
 function gain(){const g=ctx.createGain();g.gain.value=0;return g;}
 const set=(param,v,t,rate)=>param.setTargetAtTime(v,t,rate);
 const exhaustBus=ctx.createGain(),exhaustCabin=filter('lowpass',6300,.65);
 exhaustBus.connect(exhaustCabin);exhaustCabin.connect(master);
 function avante(){
   // Recorded exhaust harmonics are spaced about 36.7 Hz and 82 Hz.
   // Two firings per revolution; no tachometer track is available.
   const banks=window.ELANTRA_RECORDINGS.map((clip,i)=>({clip,rpm:i===0?1100:2460}));
   const body=filter('highpass',32,.65),valve=filter('lowpass',400,.6);
   const level=gain();body.connect(valve);valve.connect(level);level.connect(exhaustBus);
   const inlet=filter('bandpass',680,.75),inletLevel=gain();
   inlet.connect(inletLevel);inletLevel.connect(master);
   const induction=ctx.createBufferSource(),boostBand=filter('bandpass',1800,.65),boost=gain();
   induction.buffer=air;induction.loop=true;induction.connect(boostBand);boostBand.connect(boost);boost.connect(master);induction.start();
   for(const bank of banks){
     const bytes=atob(bank.clip.pcm),buffer=ctx.createBuffer(1,bytes.length/2,bank.clip.rate);
     const wave=buffer.getChannelData(0);
     for(let i=0;i<wave.length;i++){
       const v=bytes.charCodeAt(2*i)|(bytes.charCodeAt(2*i+1)<<8);
       wave[i]=(v>=32768?v-65536:v)/32768;
     }
     bank.src=ctx.createBufferSource();bank.weight=gain();
     bank.src.buffer=buffer;bank.src.loop=true;bank.src.playbackRate.value=890/bank.rpm;
     bank.src.connect(bank.weight);bank.weight.connect(body);bank.weight.connect(inlet);bank.src.start();
   }
   return (enabled,rpm,gas,cut,inside)=>{
     const t=ctx.currentTime,r=Math.min(6800,Math.max(700,rpm)),rev=r/6800;
     const load=cut?0:gas;
     // Equal-power fades avoid hard transitions when the gearbox drops RPM.
     const lower=0;
     const blend=Math.max(0,Math.min(1,Math.log(r/banks[lower].rpm)/Math.log(banks[lower+1].rpm/banks[lower].rpm)));
     banks.forEach((b,i)=>{
       const weight=i===lower?Math.cos(blend*Math.PI/2):i===lower+1?Math.sin(blend*Math.PI/2):0;
       set(b.src.playbackRate,Math.max(.33,Math.min(2.8,r/b.rpm)),t,cut?.018:.035);set(b.weight.gain,weight,t,.035);
     });
     set(exhaustCabin.frequency,inside?720:6900,t,.085);
     set(valve.frequency,1450+1600*rev+load*(750+2550*rev),t,load>.3?.055:.095);
     set(level.gain,enabled?(.16+.22*rev+.68*load)*(inside?.65:1)*(cut?.31:1):0,t,cut?.014:.045);
     set(inlet.frequency,350+460*rev+load*225,t,.075);
     set(inletLevel.gain,enabled?load*(.12+.31*rev)*(inside?1.32:.74):0,t,.065);
     set(boostBand.frequency,1080+rev*1270,t,.12);
     set(boost.gain,enabled?load*load*Math.max(0,(r-1600)/4800)*(inside?.038:.072):0,t,.12);
   };
 }
 const playerMotor=avante();
 const popBuffers=Array.from({length:4},(_,i)=>{
   const b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.165),ctx.sampleRate),a=b.getChannelData(0);
   let airLow=0;
   for(let j=0;j<a.length;j++){
     const t=j/ctx.sampleRate,n=noise();airLow+=.37*(n-airLow);
     const attack=1-Math.exp(-t*3200),body=Math.sin(2*Math.PI*((119+i*7)*t+.73*(1-Math.exp(-t*70))));
     a[j]=attack*(.64*body*Math.exp(-t*(39+i))+.40*airLow*Math.exp(-t*62)+.30*(n-airLow)*Math.exp(-t*153));
   }return b;
 });
 const tails=new Set();let popIndex=0;
 const impactClips=new Map(),lastImpact=new Map();
 function impact(material,dv){
   const now=ctx.currentTime,last=lastImpact.get(material);
   if(!running||dv<.22||(last&&now-last.time<.13&&dv<last.dv*1.6))return;
   lastImpact.set(material,{time:now,dv});
   const timbres={vehicle:[85,420,.22],steel:[174,910,.34],parapet:[75,310,.14],
     curb:[108,205,.075],wood:[126,535,.13],concrete:[69,370,.16],water:[42,680,.43]};
   const [bass,ring,decay]=timbres[material]||timbres.concrete;
   if(!impactClips.has(material)){
     const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*decay*2.5),ctx.sampleRate),data=buffer.getChannelData(0);
     let low=0;
     for(let i=0;i<data.length;i++){
       const t=i/ctx.sampleRate,grain=noise();low+=.13*(grain-low);
       const hit=Math.exp(-t*7/decay),tail=Math.exp(-t*3/decay);
       const crunch=material==='water'?low*2:grain*.34+low*.5;
       data[i]=(1-Math.exp(-t*2400))*(hit*(.59*Math.sin(2*Math.PI*bass*t)+crunch)+tail*(material==='water'?low:.26*Math.sin(2*Math.PI*ring*t)));
     }impactClips.set(material,buffer);
   }
   const src=ctx.createBufferSource(),gain=ctx.createGain();src.buffer=impactClips.get(material);
   src.playbackRate.value=1.08-Math.min(.21,dv*.009);gain.gain.value=Math.min(1.65,.12+.35*Math.sqrt(dv));
   src.connect(gain);gain.connect(master);tails.add(src);
   src.onended=()=>{tails.delete(src);src.disconnect();gain.disconnect();};src.start();
 }
 function pop(strength){
   const s=ctx.createBufferSource(),level=ctx.createGain();s.buffer=popBuffers[popIndex++%popBuffers.length];
   s.playbackRate.value=.91+.12*strength+.035*noise();level.gain.value=.72*strength;
   s.connect(level);level.connect(exhaustBus);tails.add(s);
   s.onended=()=>{s.disconnect();level.disconnect();tails.delete(s);};s.start();
 }
 function voice(i){
   const pan=ctx.createStereoPanner(),ex=gain(),intake=gain(),rolling=gain(),ev=gain();
   const muffler=filter('lowpass',650,.63),inlet=filter('bandpass',550,.75),rubber=filter('bandpass',370,.55);
   const airSrc=ctx.createBufferSource(),electric=ctx.createOscillator();
   ex.connect(muffler);muffler.connect(pan);intake.connect(pan);rolling.connect(pan);electric.connect(ev);ev.connect(pan);pan.connect(master);
   airSrc.buffer=air;airSrc.loop=true;airSrc.connect(inlet);inlet.connect(intake);airSrc.connect(rubber);rubber.connect(rolling);
   airSrc.start(0,(i*.219)%2);electric.start();
   let src=null,chosen=-1;
   return (kind,rpm,speed,load,vol,balance,doppler)=>{
     const t=ctx.currentTime;
     if(chosen!==kind){
       if(src){src.stop(t);src.disconnect();src=null;}
       if(kind<3){src=ctx.createBufferSource();src.buffer=combustion[kind];src.loop=true;src.connect(ex);src.start(t,(i*.171)%2);}
       chosen=kind;
     }
     if(src)set(src.playbackRate,Math.max(600,Math.min(7300,rpm))/rpmRef*doppler,t,.055);
     set(ex.gain,src?vol*(.28+.72*load):0,t,.085);
     set(muffler.frequency,260+Math.min(1,rpm/6000)*640+load*(kind===1?1250:790),t,.1);
     set(inlet.frequency,230+Math.min(1,rpm/6000)*780,t,.12);
     set(intake.gain,src?vol*load*load*.37:0,t,.11);
     set(electric.frequency,(68+speed*9.2)*doppler,t,.09);set(ev.gain,kind===3?vol*.105*Math.min(1,speed/5)*(.4+.6*load):0,t,.1);
     set(rubber.frequency,275+speed*10,t,.18);set(rolling.gain,vol*.30*Math.min(1,speed/29),t,.15);
     set(pan.pan,balance,t,.08);
   };
 }
 const own=voice(0),traffic=new Map();
 let running=false;
 function quiet(){
   if(!running)return;
   const t=ctx.currentTime,p=master.gain;
   if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(t);
   else{const level=p.value;p.cancelScheduledValues(t);p.setValueAtTime(level,t);}
   p.linearRampToValueAtTime(0,t+.025);running=false;
   for(const s of tails)s.stop();tails.clear();
 }
 function update(car,cars,kind,gas,enabled,pulse=0,inside=false){
   const t=ctx.currentTime;
   if(!enabled){quiet();return;}
   if(!running){master.gain.cancelScheduledValues(t);set(master.gain,.70,t,.045);running=true;}
   playerMotor(kind===0,car.rpm,gas,car.shiftTime>0,inside);
   own(kind===0?4:kind,car.rpm,Math.abs(car.u),car.shiftTime>0?gas*.10:gas,.35,0,1);
   if(kind===0&&pulse>0)pop(pulse);
   const s=Math.sin(car.yaw),c=Math.cos(car.yaw);
   for(const a of cars){
     const dx=a.x-car.x,dz=a.z-car.z,dist=Math.max(1,Math.hypot(dx,dz));
     const audible=dist<80&&(car.road.network?!!a.edge:a.s>0&&a.s<car.road.length);
     if(!audible&&!traffic.has(a))continue;
     if(!traffic.has(a))traffic.set(a,voice(a.audioIndex+1));
     const speed=Math.abs(a.u),gear=[3.4,2.16,1.48,1.05,.84][Math.min(4,Math.floor(speed/8))];
     const closing=((s*car.u+c*car.v-Math.sin(a.yaw)*a.u)*dx+(c*car.u-s*car.v-Math.cos(a.yaw)*a.u)*dz)/dist;
     traffic.get(a)(a.audioIndex%4,Math.max(810,speed*90*gear),speed,.24,audible?.095/(1+(dist/8)**1.7):0,Math.max(-1,Math.min(1,(-c*dx+s*dz)/dist)),Math.max(.86,Math.min(1.18,343/(343-closing))));
   }
 }
 const hornGain=ctx.createGain(),hornTone=filter('lowpass',1850,.65);
 hornGain.gain.value=0;hornTone.connect(hornGain);hornGain.connect(limiter);
 let hornVoices=[];
 function horn(down){
   const t=ctx.currentTime;
   if(down===Boolean(hornVoices.length))return;
   if(hornGain.gain.cancelAndHoldAtTime)hornGain.gain.cancelAndHoldAtTime(t);
   else{const level=hornGain.gain.value;hornGain.gain.cancelScheduledValues(t);hornGain.gain.setValueAtTime(level,t);}
   if(down){
     for(const hz of [405,485]){
       const osc=ctx.createOscillator();osc.type='sawtooth';osc.frequency.setValueAtTime(hz*.97,t);osc.frequency.linearRampToValueAtTime(hz,t+.045);
       osc.connect(hornTone);osc.start(t);hornVoices.push(osc);
     }
     hornGain.gain.linearRampToValueAtTime(.115,t+.024);
   }else{
     hornGain.gain.linearRampToValueAtTime(0,t+.035);
     for(const osc of hornVoices){osc.stop(t+.038);osc.onended=()=>osc.disconnect();}hornVoices=[];
   }
 }
 return {update,horn,quiet,impact};
};
