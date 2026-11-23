/* Mapped bus platforms, dedicated carriageways and explicit lane lists. */
window.SeoulTransit=(()=>{
  const {stops,tracks,lanes}=SEOUL_BUS;
  function* stopsNear(x1,z1,x2,z2){
    for(let i=Math.floor(x1/260);i<=Math.floor(x2/260);i++)for(let j=Math.floor(z1/260);j<=Math.floor(z2/260);j++){
      for(const [x,z,name] of stops[i+','+j]||[])if(x>=x1&&x<=x2&&z>=z1&&z<=z2)yield {x,z,name};
    }
  }
  function addLane(e,band,blue){
    for(const [i,total] of lanes[e.id]||[]){
      // Positive lateral coordinates are on the driver's left.
      const left=e.half*(1-2*i/total),right=e.half*(1-2*(i+1)/total);
      for(const offset of [right+.13,left-.13])band(0,e.len,offset-.07,offset+.07,.038,blue);
    }
  }
  function addTile(k,world,quad,c){
    const [ix,iz]=k.split(',').map(Number);
    const nearbyTracks=[];
    for(let i=ix-1;i<=ix+1;i++)for(let j=iz-1;j<=iz+1;j++)nearbyTracks.push(...(tracks[i+','+j]||[]));
    function onBusRoad(x,z,r){
      return nearbyTracks.some(([ax,az,bx,bz,width])=>{
        const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
        return Math.hypot(x-ax-dx*t,z-az-dz*t)<width/2+r;
      });
    }
    for(const [ax,az,bx,bz,width] of tracks[k]||[]){
      const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz),nx=dz/len,nz=-dx/len;
      function strip(l,r,y,mat){quad([ax+nx*l,y,az+nz*l],[bx+nx*l,y,bz+nz*l],[bx+nx*r,y,bz+nz*r],[ax+nx*r,y,az+nz*r],mat);}
      const half=width/2;
      strip(-half,half,.443,c.busPavement);
      for(const l of [-half+.15,half-.15])strip(l-.07,l+.07,.469,c.busBlue);
    }
    for(const [x,z,,hasShelter] of stops[k]||[]){
      let nearest=null;
      for(const e of world.edgesIn(x-23,z-23,x+23,z+23)){
        if(e.flags&128)continue;
        const q=world.projectEdge(e,x,z);
        const dist=Math.sqrt(q.d2);
        if(dist<23&&(!nearest||dist<nearest.dist))nearest={e,q,dist};
      }
      if(!nearest)continue;
      const {e,q}=nearest;
      const surface=world.at(e,q.s).y;
      if(surface>2)continue;
      const base=.48,coords=world.roadShape(e).point;
      const clear=(px,pz,r)=>!onBusRoad(px,pz,r)&&!HanRoadClearance.blocked(world,px,pz,r,base,base+3);
      let sx=x,sz=z;
      if(!clear(sx,sz,.49)){
        const p=coords(q.s,Math.sign(q.lateral||1)*(e.half+.86));
        if(Math.hypot(p[0]-x,p[2]-z)>5||!clear(p[0],p[2],.49))continue;
        sx=p[0];sz=p[2];
      }
      function box(x0,x1,z0,z1,y0,y1,material){
        const p=(a,b,h)=>[sx+a*e.tz+b*e.tx,base+h,sz-a*e.tx+b*e.tz];
        const a=p(x0,z0,y0),b=p(x1,z0,y0),d=p(x0,z1,y0),f=p(x1,z1,y0);
        const A=p(x0,z0,y1),B=p(x1,z0,y1),D=p(x0,z1,y1),F=p(x1,z1,y1);
        quad(a,b,B,A,material);quad(b,f,F,B,material);quad(f,d,D,F,material);quad(d,a,A,D,material);quad(A,B,F,D,material);
      }
      box(-.055,.055,-.055,.055,0,2.65,c.steel);
      box(-.12,.12,-.37,.37,1.93,2.62,c.busBlue);
      for(const sign of [-1,1]){
        const face=sign*.124,back=sign*.134;
        box(face,back,-.23,.23,2.11,2.39,c.white);
        box(face,sign*.136,-.19,.19,2.21,2.34,c.busGlass);
      }
      if(hasShelter&&clear(sx,sz,2.35)){
        box(-.66,.66,-1.95,1.95,2.73,2.86,c.curb);
        for(const end of [-1.70,1.70])box(.47,.55,end-.04,end+.04,0,2.73,c.steel);
        box(.06,.44,-1.28,1.28,.46,.55,c.busBlue);
      }
    }
  }
  return {stopsNear,addLane,addTile,has:k=>Boolean(stops[k]||tracks[k])};
})();
