window.drawHanMap=function(canvas,world,car){
 const g=canvas.getContext("2d"),w=canvas.width,h=canvas.height,scale=w/850,cx=w*.5,cy=h*.62;
 const sn=Math.sin(car.yaw),cs=Math.cos(car.yaw);
 function screen(x,z){const dx=x-car.x,dz=z-car.z;return [cx-(dx*cs-dz*sn)*scale,cy-(dx*sn+dz*cs)*scale];}
 function path(points,stroke,width,fill){if(points.length<2)return;g.beginPath();points.forEach((p,i)=>{const a=screen(p.x,p.z);i?g.lineTo(...a):g.moveTo(...a);});if(fill){g.closePath();g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=width;g.stroke();}}
 g.clearRect(0,0,w,h);g.fillStyle="#1c282c";g.fillRect(0,0,w,h);g.save();
 if(world.waterPath){
   g.save();g.transform(-cs*scale,-sn*scale,sn*scale,-cs*scale,cx+scale*(cs*car.x-sn*car.z),cy+scale*(sn*car.x+cs*car.z));
   g.fillStyle="#233f54";g.fill(world.waterPath,"evenodd");
   g.strokeStyle="#43545a";g.lineWidth=3.7;const gx=Math.floor(car.x/650),gz=Math.floor(car.z/650);
   for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const line=world.streetMap?.get((gx+i)+","+(gz+j));if(line)g.stroke(line);}
   g.restore();
 }
 else{const p=[],q=[];for(let s=Math.max(0,car.s-1200);s<=Math.min(world.length,car.s+1200);s+=35){p.push(world.point(s,world.riverSide*36));q.push(world.point(s,world.riverSide*world.riverWidthAt(s)));}path(p.concat(q.reverse()),null,0,"#233f54");}
 if(world.network){for(const e of world.nearby(car.x,car.z,600)){if(Math.abs(e.ax-car.x)+Math.abs(e.az-car.z)>950)continue;path([{x:e.ax,z:e.az},{x:e.bx,z:e.bz}],e.flags&32?"#dfc59a":e===world.current?"#efb666":"#839599",Math.max(1,e.half*2*scale));}
 } const tracks=world.network?[]:Object.values(world.allRoutes);for(const line of tracks){let segment=[];for(let i=0;i<line.points.length;i++){const p=line.points[i];if(Math.abs(p.x-car.x)+Math.abs(p.z-car.z)>2000){if(segment.length)path(segment,"#72828a",4);segment=[];}else segment.push(p);}path(segment,"#89949a",4);}
 for(const bridge of world.crossings)if(Math.abs(bridge.s-car.s)<1900)path(bridge.trace,"#858a8d",4);
 const route=[];if(!world.network)for(let s=Math.max(0,car.s-650);s<=Math.min(world.length,car.s+1250);s+=12)route.push(world.point(s));path(route,"#e6bd81",5);
 g.translate(cx,cy);g.shadowColor="#64ced9";g.shadowBlur=8;g.beginPath();g.moveTo(0,-12);g.lineTo(8,9);g.lineTo(0,5);g.lineTo(-8,9);g.closePath();g.fillStyle="#e5ffff";g.fill();g.restore();
};