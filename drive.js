/* Body coordinates: x left, z forward. SI units; rotations positive about local axes. */
window.DriveModel = (() => {
  const gravity=9.81, wheelMass=42, tireRate=202000, wheelInertia=1.42;
  // Hyundai Korea Avante N DCT catalog. Axle loading and CG height are
  // simulation parameters; Hyundai does not specify them in the catalog.
  const spec=Object.freeze({mass:1520,length:4.710,width:1.825,height:1.415,wheelbase:2.720,
    trackFront:1.584,trackRear:1.579,displacement:1998,powerPS:280,peakTorque:392.27,frontFraction:.63});
  const wheelbase=spec.wheelbase,rearArm=wheelbase*spec.frontFraction,frontArm=wheelbase-rearArm,tireRadius=.32705;
  const cgHeight=.52, rollInertia=745, pitchInertia=2470;
  // The DCT uses two final drives. Store the overall ratio for each gear.
  const ratios=[0,3.714*3.8,2.261*3.8,2.174*2.714,1.621*2.714,.927*3.8,.767*3.8,.878*2.714,.698*2.714];
  const reverseRatio=3.697*3.8;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const approach=(a,b,rate,dt)=>a+(b-a)*(1-Math.exp(-rate*dt));
  function makeWheel(front,side,mass) {
    const sprungLoad=mass*gravity*(front?rearArm:frontArm)/(2*wheelbase)-wheelMass*gravity;
    return {front,side,x:side*(front?spec.trackFront:spec.trackRear)/2,z:front?frontArm:-rearArm,
      sprungLoad,load:sprungLoad+wheelMass*gravity,ground:0,height:0,verticalSpeed:0,
      compression:0,springForce:sprungLoad,skidForce:0,spin:0,rotation:0,steer:0,camber:0,
      damage:0,pressure:1,radius:tireRadius,grounded:true,slipRatio:0,slipAngle:0,fx:0,fy:0};
  }
  return class DriveModel {
    static spec=spec;
    constructor(road){
      this.road=road;this.mass=spec.mass;this.inertia=2670;this.halfLength=spec.length/2;this.halfWidth=spec.width/2;
      // The Blender shell is centred between bumpers, with its front axle at +1.435 m.
      this.centerOfMassZ=1.435-frontArm;this.reset();
    }
    reset(station=8){
      this.damage=HanCollision.newDamage();this.s=station;this.lateral=this.road.network?this.road.driveOffset(this.road.current,station):-1.775;
      const start=this.road.point(station,this.lateral);
      this.x=start.x;this.z=start.z;this.yaw=start.yaw;
      this.u=this.v=this.omega=this.steer=this.roll=this.pitch=0;
      this.heave=this.heaveRate=this.rollRate=this.pitchRate=0;
      this.forward=true;this.gear=1;this.rpm=900;this.shiftTime=this.distance=0;
      this.loadShift=this.lateralG=this.slip=this.braking=this.tireSqueal=0;
      this.flight=null;this.stranded=false;this.landingTime=0;this.pendingContact=null;this.climbing=new Set();this.driveForce=0;
      this.wheels=[true,false].flatMap(front=>[-1,1].map(side=>makeWheel(front,side,this.mass)));
    }
    changeDirection(){if(Math.abs(this.u)>=.65)return false;this.forward=!this.forward;this.gear=1;return true;}
    contactSound(material,dv){
      if(dv>.22&&(!this.pendingContact||dv>this.pendingContact.dv))this.pendingContact={material,dv};
    }
    stepFlight(dt){
      const f=this.flight,road=this.road;
      this.x+=f.vx*dt;this.z+=f.vz*dt;this.yaw+=this.omega*dt;
      const previous=f.y;f.y+=f.vy*dt-.5*gravity*dt*dt;f.vy-=gravity*dt;
      const floor=road.floorBelow(this.x,this.z,previous+.01);
      if(f.y>floor.y)return;
      this.contactSound(floor.water?'water':'concrete',Math.abs(f.vy));
      this.damageWheel(0,1.34,Math.abs(f.vy));this.impact(f.vy*.35,0);
      if(floor.e){
        road.current=floor.e;this.s=floor.s;this.lateral=floor.lateral;this.flight=null;
        this.heave=0;this.heaveRate=Math.max(-4,f.vy*.32);
        this.u=f.vx*Math.sin(this.yaw)+f.vz*Math.cos(this.yaw);
        this.v=f.vx*Math.cos(this.yaw)-f.vz*Math.sin(this.yaw);
      }else{
        f.y=floor.y;f.vy=0;this.u=this.v=this.omega=0;this.stranded=true;
      }
    }
    impact(du,dv){
      this.pitchRate=clamp(this.pitchRate-du*this.mass*.15/pitchInertia,-2,2);
      this.rollRate=clamp(this.rollRate+dv*this.mass*.15/rollInertia,-2,2);
    }
    damageWheel(x,z,dv){
      for(const w of this.wheels){
        const proximity=Math.max(0,1-Math.hypot((x-w.x)/.98,(z-w.z-this.centerOfMassZ)/1.65));
        const bend=Math.max(0,dv-2.8)*proximity*.092;
        w.damage=clamp(w.damage+bend,0,1);
        w.pressure=1-.70*clamp((w.damage-.32)/.68,0,1);
        w.radius=tireRadius-(1-w.pressure)*.075;
      }
    }
    driveTorque(input,dt){
      const axleRPM=(Math.abs(this.wheels[0].spin)+Math.abs(this.wheels[1].spin))*.5*60/(2*Math.PI);
      let gearRatio=this.forward?ratios[this.gear]:reverseRatio;
      const roadRPM=Math.abs(this.u)/tireRadius*60/(2*Math.PI);
      const coupled=roadRPM*gearRatio;
      this.shiftTime=Math.max(0,this.shiftTime-dt);
      if(this.forward&&this.shiftTime===0){
        const upshift=2500+input.gas*3650, downshift=1150+input.gas*850;
        if(coupled>upshift&&this.gear<ratios.length-1){this.gear++;this.shiftTime=.16;}
        else if(coupled<downshift&&this.gear>1&&roadRPM*ratios[this.gear-1]<5500){this.gear--;this.shiftTime=.16;}
      }
      gearRatio=this.forward?ratios[this.gear]:reverseRatio;
      this.rpm=approach(this.rpm,clamp(Math.max(890+input.gas*690,axleRPM*gearRatio),870,6650),11,dt);
      const boost=clamp((this.rpm-900)/1200,0,1);
      const torque=Math.min(215+(spec.peakTorque-215)*boost,spec.powerPS*735.5/(this.rpm*Math.PI/30))*clamp(1-(this.rpm-6000)/4000,.8,1);
      const limiter=(this.forward?clamp((68-Math.abs(this.u))/2,0,1):clamp((12-Math.abs(this.u))/2,0,1))*clamp((7000-axleRPM*gearRatio)/450,0,1);
      const requested=input.gas*torque*gearRatio*.90*(1-this.damage.nose*.8)*(this.shiftTime>0?.16:1)*limiter;
      const available=this.wheels.slice(0,2).reduce((sum,w)=>sum+w.load*w.radius*(1-.43*w.damage),0);
      return (this.forward?1:-1)*Math.min(requested,available*1.02);
    }
    suspension(dt){
      const heading=this.road.heading?.(this.s)??this.road.point(this.s,0).yaw;
      const a=this.yaw-heading,c=Math.cos(a),s=Math.sin(a),base=this.road.height(this.s);
      for(const w of this.wheels){
        const axle=w.z+this.centerOfMassZ;
        const station=this.s+axle*c-w.x*s, lateral=this.lateral+w.x*c+axle*s;
        const ground=(this.road.surfaceHeight?.(station,lateral)??this.road.height(station))-base;
        const groundRate=clamp((ground-w.ground)/dt,-5,5);w.ground=ground;
        const bodyHeight=this.heave+w.x*this.roll-w.z*this.pitch;
        const bodyRate=this.heaveRate+w.x*this.rollRate-w.z*this.pitchRate;
        const comp=w.height-bodyHeight,compRate=w.verticalSpeed-bodyRate;
        const rate=w.front?33500:29800;
        const preload=w.sprungLoad-rate*w.damage*.039;
        const stop=210000*Math.max(0,comp-.087)-140000*Math.max(0,-comp-.115);
        w.compression=comp;
        w.springForce=preload+rate*comp+(compRate>0?2050:3150)*(1-.48*w.damage)*compRate+stop;
        const clearance=.16+bodyHeight-ground;
        w.skidForce=clearance<0?Math.max(0,-clearance*215000+(groundRate-bodyRate)*4400):0;
        const tireK=tireRate*(.58+.42*w.pressure);
        w.load=Math.max(0,w.sprungLoad+wheelMass*gravity+tireK*(ground-w.height+w.radius-tireRadius)+720*(groundRate-w.verticalSpeed));
        w.grounded=w.load>5;
      }
      for(let i=0;i<4;i+=2){
        const right=this.wheels[i],left=this.wheels[i+1];
        const bar=(right.compression-left.compression)*(i===0?6800:4400);
        right.springForce+=bar;left.springForce-=bar;
      }
      let support=0,rollMoment=0,pitchMoment=0;
      const sprungCG=2*wheelMass*(rearArm-frontArm)/(this.mass-4*wheelMass);
      for(const w of this.wheels){
        const force=w.springForce;
        w.verticalSpeed+=(w.load-force-wheelMass*gravity)*dt/wheelMass;
        w.height+=w.verticalSpeed*dt;
        const supported=force+w.skidForce;
        support+=supported;rollMoment+=supported*w.x;pitchMoment-=supported*(w.z-sprungCG);
      }
      const sprung=this.mass-4*wheelMass;
      this.heaveRate+=(support/sprung-gravity)*dt;
      this.heave+=this.heaveRate*dt;
      this.rollRate+=(rollMoment+this.lateralG*gravity*cgHeight*this.mass)/rollInertia*dt;
      this.pitchRate+=(pitchMoment-this.loadShift*cgHeight*this.mass)/pitchInertia*dt;
      this.roll+=this.rollRate*dt;this.pitch+=this.pitchRate*dt;
    }
    tires(input,torque,dt){
      let forward=0,left=0,yawMoment=0,slip=0,squeal=0;
      for(const w of this.wheels){
        const turn=Math.tan(this.steer);
        const ackermann=w.front?Math.atan2(wheelbase*turn,wheelbase-w.x*turn):0;
        w.steer=ackermann+w.side*w.damage*.078;
        w.camber=w.side*(.012+w.damage*.19+w.compression*.24);
        const c=Math.cos(w.steer),s=Math.sin(w.steer);
        const axial=this.u-this.omega*w.x,side=this.v+this.omega*w.z;
        const l=axial*c+side*s,t=side*c-axial*s;
        const maxForce=w.load*1.04*(this.road.weatherGrip??1)*(1-.43*w.damage)*clamp(1.05-.065*w.load/4000,.85,1.07);
        const brakeTorque=input.brake*(w.front?.64:.36)*this.mass*10.6*w.radius*.5;
        const rollTorque=w.grounded ? w.load*w.radius*(.009+.035*w.damage) : 0;
        const free=w.spin+(w.front?torque*.5:0)*dt/wheelInertia;
        const drag=(brakeTorque+rollTorque)*dt/wheelInertia;
        const predicted=Math.sign(free)*Math.max(0,Math.abs(free)-drag);
        // Implicit longitudinal slip handles the stiff tire at walking speed.
        const stiffness=86000/Math.max(2.5,Math.abs(l));
        const tireSpeed=predicted*w.radius-l;
        const long=stiffness*tireSpeed/(1+stiffness*w.radius*w.radius*dt/wheelInertia);
        w.slipAngle=Math.atan2(t,Math.max(1.7,Math.abs(l)));
        const lat=-(w.front?43200:45500)*w.slipAngle;
        const magnitude=Math.hypot(long,lat), scale=magnitude?Math.min(1,maxForce/magnitude):0;
        const fx=long*scale, fy=lat*scale;
        w.spin=predicted-fx*w.radius*dt/wheelInertia;
        w.rotation=(w.rotation+w.spin*dt)%(2*Math.PI);
        w.slipRatio=(w.spin*w.radius-l)/Math.max(2.5,Math.abs(l));
        w.fx=fx;w.fy=fy;
        const scrape=.38*w.skidForce/Math.max(.5,Math.hypot(axial,side));
        const f=fx*c-fy*s-scrape*axial,g=fx*s+fy*c-scrape*side;
        forward+=f;left+=g;yawMoment+=w.z*g-w.x*f;
        if(w.grounded){
          slip=Math.max(slip,Math.abs(w.slipAngle)-.055,Math.abs(w.slipRatio)-.11);
          // Contact-patch speed suppresses parking scrub but allows wheelspin at launch.
          const sliding=Math.hypot(t,w.spin*w.radius-l);
          const excess=Math.max((Math.abs(w.slipAngle)-.065)/.22,(Math.abs(w.slipRatio)-.09)/.42);
          const contact=clamp(w.load/(this.mass*gravity*.18),0,1);
          squeal=Math.max(squeal,clamp(excess,0,1)*clamp((sliding-.75)/3.2,0,1)*contact);
        }
      }
      this.slip=clamp(slip,0,.38);
      this.tireSqueal=squeal;
      return {forward,left,yawMoment};
    }
    step(input,dt){
      if(this.stranded)return;
      if(this.flight){this.stepFlight(dt);return;}
      const speed=Math.abs(this.u);
      this.steer=approach(this.steer,input.steer*.56/(1+.00165*speed*speed),input.analog?11:5.2,dt);
      const torque=this.driveTorque(input,dt);
      this.driveForce=torque/tireRadius;
      for(let i=0;i<2;i++)this.suspension(dt/2);
      const f=this.tires(input,torque,dt);
      const grade=this.road.height(this.s+.5)-this.road.height(this.s-.5);
      const ax=(f.forward-.405*this.u*speed)/this.mass-gravity*grade,ay=f.left/this.mass;
      this.loadShift=approach(this.loadShift,ax,24,dt);this.lateralG=approach(this.lateralG,ay/gravity,24,dt);
      const u=this.u,v=this.v;
      this.u+=(ax+this.omega*v)*dt;this.v+=(ay-this.omega*u)*dt;
      this.omega+=f.yawMoment/this.inertia*dt;
      if(!input.gas&&Math.abs(this.u)<.045&&Math.abs(this.v)<.04&&Math.abs(this.omega)<.035){
        this.u=this.v=this.omega=0;for(const w of this.wheels)if(w.grounded)w.spin=0;
      }
      this.yaw+=this.omega*dt;
      const shellSideSpeed=this.v-this.omega*this.centerOfMassZ;
      const dx=(Math.sin(this.yaw)*this.u+Math.cos(this.yaw)*shellSideSpeed)*dt;
      const dz=(Math.cos(this.yaw)*this.u-Math.sin(this.yaw)*shellSideSpeed)*dt;
      this.x+=dx;this.z+=dz;HanCollision.rail(this,this.road);
      this.road.scenery?.hit(this,this.road.height(this.s)+this.heave);
      const road=this.road,e=road.current;
      if(road.floorBelow && (e.flags&32) && Math.abs(this.lateral)>road.widthAt(e,this.s)+.42){
        const y=road.height(this.s),support=road.floorBelow(this.x,this.z,y+.15);
        if(support.y<y-.38){
          this.flight={y:y+this.heave,vy:this.heaveRate+this.u*grade,vx:dx/dt,vz:dz/dt};
          this.heave=0;for(const w of this.wheels){w.grounded=false;w.load=0;}
        }
      }
      if(!this.road.network&&(this.s<=.01||this.s>=this.road.length-.01)){
        const edge=this.road.point(this.s,this.lateral);this.x=edge.x;this.z=edge.z;this.u=this.v=0;
      }
      this.distance+=Math.hypot(dx,dz);this.braking=input.brake;
    }
  };
})();
