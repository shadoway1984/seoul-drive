/* Dashboard and steering geometry exported from AvanteN-Cockpit.blend.
   Both displays receive the same vehicle and road used by the simulation. */
window.buildCockpit=function(T){
 const group=new T.Group(),shaft=new T.Group(),wheel=new T.Group();
 group.name='Avante N cockpit';wheel.name='Avante N steering wheel';
 shaft.position.set(-.012,-.262,-.680);shaft.rotation.x=-.22;shaft.add(wheel);group.add(shaft);
 const {colors,mesh}=AVANTE_CABIN,materials={};
 function bytes(base64){return Uint8Array.from(atob(base64),s=>s.charCodeAt(0)).buffer;}
 for(const [name,rgb] of Object.entries(colors)){
   const metal=name==='silver'||name==='trim',color=new T.Color('#'+rgb);
   materials[name]=new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:metal?.34:.19,
      roughness:metal?.44:name==='keys'?.52:.76,metalness:metal?.59:.025,side:T.DoubleSide});
 }
 for(const [key,data] of Object.entries(mesh)){
   const [part,material]=key.split(':'),g=new T.BufferGeometry();
   const positions=Float32Array.from(new Int16Array(bytes(data[0])),n=>n/10000);
   const normals=Float32Array.from(new Int8Array(bytes(data[1])),n=>n/127);
   g.setAttribute('position',new T.BufferAttribute(positions,3));g.setAttribute('normal',new T.BufferAttribute(normals,3));
   g.setIndex(new T.BufferAttribute(new Uint16Array(bytes(data[2])),1));g.computeBoundingSphere();
   const object=new T.Mesh(g,materials[material]);object.name=part+' / '+material;(part==='wheel'?wheel:group).add(object);
 }
 function display(name,parent,pixelsW,pixelsH,w,h,x,y,z,transparent=false){
   const canvas=document.createElement('canvas');canvas.width=pixelsW;canvas.height=pixelsH;
   const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
   texture.minFilter=T.LinearFilter;texture.generateMipmaps=false;
   const object=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,toneMapped:false,transparent,depthWrite:!transparent}));
   object.position.set(x,y,z);object.name=name;parent.add(object);
   return {canvas,ctx:canvas.getContext('2d'),texture};
 }
 function legend(parent,text,w,h,x,y,z,color='#e7eaf0',italic=false){
   const lcd=display(text,parent,192,64,w,h,x,y,z,true),c=lcd.ctx;
   c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.font=(italic?'italic ':'')+'bold 49px Arial';c.fillText(text,96,34,181);lcd.texture.needsUpdate=true;
 }
 legend(wheel,'NGS',.026,.009,.107,.035,.0331);
 for(const side of [-1,1]){
   legend(wheel,'N',.016,.009,side*.107,-.043,.0221,'#244451',true);
   legend(wheel,side<0?'−':'+',.013,.013,side*.127,.074,-.024,'#2b3136');
   legend(wheel,side<0?'MODE':'SET',.025,.007,side*.094,.007,.028,'#e7edf3');
 }
 legend(wheel,'N',.023,.013,0,-.139,.0178,'#f4f5f4',true);
 const cluster=display('N instrument cluster LCD',group,960,364,.347,.130,-.012,-.158,-.906);
 const nav=display('AVN navigation LCD',group,768,300,.320,.129,.358,-.158,-.906);
 const map=document.createElement('canvas');map.width=768;map.height=257;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),pi=Math.PI;
 function text(c,label,x,y,font,color,align='center'){
   c.fillStyle=color;c.font=font;c.textAlign=align;c.textBaseline='middle';c.fillText(label,x,y);
 }
 // Large focused N-mode rev counter with shift band, gear position and digital speed.
 function instruments(speed,rpm,gear){
   const c=cluster.ctx,w=cluster.canvas.width,h=cluster.canvas.height;
   const bg=c.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#11232b');bg.addColorStop(.45,'#080f14');bg.addColorStop(1,'#17262f');
   c.fillStyle=bg;c.fillRect(0,0,w,h);
   const x=493,y=177,r=144,start=.74*pi,sweep=1.52*pi,limit=clamp(rpm/8000,0,1);
   function arc(radius,t,u,color,width){
     c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.arc(x,y,radius,start+sweep*t,start+sweep*u);c.stroke();
   }
   arc(r+.5,0,1,'#485762',3);arc(r-9,0,1,'#1e2e37',8);arc(r-9,.8125,1,'#c74c45',8);
   arc(r-9,0,limit,limit>.80?'#ff7258':'#92dadf',8);
   for(let i=0;i<=40;i++){
      const a=start+sweep*i/40,major=i%5===0,co=Math.cos(a),si=Math.sin(a);
      c.strokeStyle=i>=33?'#fa7861':'#cedae0';c.lineWidth=major?3:1;
      c.beginPath();c.moveTo(x+co*(r-14),y+si*(r-14));c.lineTo(x+co*(r-(major?27:20)),y+si*(r-(major?27:20)));c.stroke();
      if(major)text(c,String(i/5),x+co*(r-41),y+si*(r-41),'600 22px Arial',c.strokeStyle);
   }
   const a=start+limit*sweep,co=Math.cos(a),si=Math.sin(a);
   c.strokeStyle='#ff8a65';c.lineWidth=4;c.beginPath();c.moveTo(x+co*74,y+si*74);c.lineTo(x+co*(r-13),y+si*(r-13));c.stroke();
   for(let i=0;i<13;i++){c.fillStyle=rpm>=2600+i*295?(i>9?'#ff7058':i>6?'#ffbd63':'#8ad5dd'):'#35444a';c.fillRect(368+i*20,10,13,5);}
   text(c,gear,x,y+4,'italic bold 64px Arial','#f3f7fa');
   text(c,Math.round(rpm/10)*10+' rpm',x,272,'600 23px Arial','#d4e2ea');
   text(c,String(speed),214,164,'600 111px Arial','#f0f6f9');text(c,'km/h',215,233,'22px Arial','#b7c9d1');
   text(c,'N',780,147,'italic 900 60px Arial','#e1e9ed');
   c.fillStyle='#e45048';c.beginPath();c.moveTo(796,160);c.lineTo(814,146);c.lineTo(810,158);c.fill();
   text(c,'N MODE',784,208,'600 20px Arial','#99c4d6');
   c.fillStyle='#526b7b';c.fillRect(56,310,848,1);
   cluster.texture.needsUpdate=true;
 }
 let lastGauge='',lastGaugeTime=-Infinity,lastNav=-Infinity,lastX=NaN,lastZ=NaN,lastYaw=NaN,lastRoad=null,lastMinute=-1;
 function update(car,road,force=false){
   wheel.rotation.z=clamp(car.steer*12.5,-2*pi,2*pi);
   const now=performance.now(),speed=Math.round(Math.abs(car.u)*3.6),rpm=Math.max(0,car.rpm),gear=car.forward?'D'+car.gear:'R';
   const sig=speed+'/'+Math.round(rpm/10)+'/'+gear;
   if(force||(lastGauge!==sig&&now-lastGaugeTime>=45)){
     instruments(speed,rpm,gear);lastGauge=sig;lastGaugeTime=now;
   }
   const minute=Math.floor(Date.now()/60000),edge=road.network?road.current:road;
   if(!force&&lastRoad===edge&&minute===lastMinute&&Math.hypot(lastX-car.x,lastZ-car.z)<.20&&Math.abs(lastYaw-car.yaw)<.002)return;
   if(!force&&lastRoad===edge&&now-lastNav<95)return;
   // The map, its car marker and projection are identical to the driving HUD.
   drawHanMap(map,road,car);
   const c=nav.ctx;c.fillStyle='#101b20';c.fillRect(0,0,768,300);c.drawImage(map,0,43);
   const name=road.network?(road.labels[edge.bn]||edge.bridgeLabel||road.labels[edge.n]||(edge.flags&64?'연결로':'시내 도로')):road.routeName;
   text(c,name,17,23,'bold 25px "Malgun Gothic", sans-serif','#e3ebef','left');
   const rot=(Math.atan2(Math.sin(car.yaw),-Math.cos(car.yaw))*180/pi+360)%360;
   const dir=['북','북동','동','남동','남','남서','서','북서'][Math.round(rot/45)%8];
   const hh=String(Math.floor(minute/60+9)%24).padStart(2,'0'),mm=String(minute%60).padStart(2,'0');
   text(c,dir+'   '+hh+':'+mm,750,23,'600 22px "Malgun Gothic", sans-serif','#c6d7df','right');
   nav.texture.needsUpdate=true;lastX=car.x;lastZ=car.z;lastYaw=car.yaw;lastRoad=edge;lastMinute=minute;lastNav=now;
 }
 return {group,update};
};
