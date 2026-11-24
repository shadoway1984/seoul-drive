/* Absolute WGS84 references for the Han River night drive. Landmark geometry,
   the urban infill and slopes are original illustrative reconstructions.
   Individual map-derived coordinates are attributed alongside their records. */
window.buildRiverCity = function buildRiverCity(T, scene, world) {
  'use strict';
  const root = new T.Group();
  root.name = 'Seoul districts at night';
  scene.add(root);
  const textures = [];
  const materials = new Set();
  const landmarks = [];
  function material(options) {
    const m = new T.MeshBasicMaterial(options);
    materials.add(m);
    return m;
  }
  const rgb = hex => new T.Color(hex);
  const light = rgb(0xffffff), roof = rgb(0x202933), trim = rgb(0x17222c);
  const solid = material({vertexColors:true, side:T.DoubleSide});
  const panes = [];
  function rng(key) {
    let seed = key >>> 0;
    return () => { seed = (Math.imul(1664525,seed) + 1013904223) >>> 0; return seed/4294967296; };
  }
  // One high-resolution, per-room texture for each facade family. Mipmapped
  // room-width windows keep distant buildings legible instead of shimmering.
  function facade(kind) {
    const rand=rng(3891+kind*227), offices=kind>=2, gold=kind===4;
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=2048;
    const c=canvas.getContext('2d');
    c.scale(2,2);
    const cols=16, size=64;
    const warm=['#bf8f61','#e8c294','#ebc69c','#d4aa80','#a78363','#f3d7af','#968b7d'];
    const cool=['#91aeb7','#bed2ce','#bacaaf','#adc7d1','#e5e0cb','#a3b6bc'];
    const painted=gold?'#302b29':offices?'#182330':'#202730';
    c.fillStyle=painted;c.fillRect(0,0,1024,1024);
    for(let y=0;y<cols;y++) {
      const floorLit=rand(),sy=y*size;
      for(let x=0;x<cols;x++) {
        const sx=x*size;const occupied=rand()<(offices?.19+.40*floorLit:.36+.11*floorLit);
        c.fillStyle=offices?(gold?'#393027':'#202c39'):(kind?'#29313b':'#252e39');
        c.fillRect(sx+1,sy+1,62,61);
        const x0=sx+(offices?4:9), y0=sy+(offices?5:10);
        const w=offices?56:(kind===1?49:44),h=offices?44:(kind===1?37:32);
        const rooms=offices?3:2;
        for(let r=0;r<rooms;r++){
          const warmChoice=gold||rand()<(offices?.48:.69);
          const palette=warmChoice?warm:cool;
          const on=occupied && (r===0 || rand()>.24);
          const xx=x0+r*w/rooms,ww=w/rooms-2;
          const grad=c.createLinearGradient(0,y0,0,y0+h);
          grad.addColorStop(0,on?palette[Math.floor(rand()*palette.length)]:(gold?'#4c3d31':'#283643'));
          grad.addColorStop(1,on?(warmChoice?'#796249':'#647d83'):'#151e27');
          c.fillStyle=grad;c.fillRect(xx,y0,ww,h);
          if(on) {
            c.fillStyle='rgba(255,240,217,.24)';c.fillRect(xx+.5,y0+.5,ww-1,.75);
            if(rand()<.35){c.fillStyle='rgba(31,33,39,.6)';c.fillRect(xx,y0,ww,(.18+rand()*.5)*h);}
            if(rand()<.5){c.fillStyle='rgba(70,60,53,.52)';c.fillRect(xx+ww*.7,y0+h*.48,ww*.26,h*.52);}
            if(rand()<.21){c.fillStyle='rgba(253,236,194,.5)';c.fillRect(xx+1,y0+1,ww-2,2);}
          }
        }
        c.fillStyle=offices?'#151c27':'#141c25';c.fillRect(sx,sy+size-4,size,3);
        if(kind===1){
          c.fillStyle='#3f464e';c.fillRect(sx+5,sy+44,55,2);
          for(let rail=0;rail<7;rail++)c.fillRect(sx+5+rail*8,sy+44,1,9);
        }
        if(offices && y%4===0){c.fillStyle=gold?'#664f3b':'#414e5c';c.fillRect(sx,sy+58,size,2);}
      }
    }
    const tex=new T.CanvasTexture(canvas);
    tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;
    textures.push(tex);
    const mat=material({map:tex,vertexColors:true,side:T.DoubleSide});
    const day=document.createElement('canvas');day.width=day.height=2048;
    const d=day.getContext('2d'),brick=kind===5,apartment=kind===1,glass=kind===2||kind===4,shop=kind===7;
    d.scale(2,2);
    const rect=(x,y,w,h,fill)=>{d.fillStyle=fill;d.fillRect(x,y,w,h);};
    const wall=['#d4cabe','#d9d5c9','#426272','#c1b6a4','#b39f7f','#ad7362','#949998','#3b4347'][kind];
    rect(0,0,1024,1024,wall);
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){
      const a=x*64,b=y*64;
      if(apartment&&x%5===4){
        rect(a,b,64,64,'#aba99d');rect(a+17,b+14,20,26,'#606c6c');
        rect(a+18,b+15,16,20,'#859494');rect(a+3,b,5,64,'#cbc7b9');continue;
      }
      const wx=a+(shop?2:glass?2:apartment?4:10),wy=b+(shop?10:glass?2:apartment?8:10);
      const w=shop?59:glass?60:apartment?55:44,h=shop?53:glass?55:apartment?40:34;
      rect(wx-2,wy-2,w+4,h+5,'#676c69');rect(wx,wy,w,h,'#2e414a');
      const cols=apartment?4:shop?3:2;
      for(let m=0;m<cols;m++){
        const left=wx+2+m*w/cols,ww=w/cols-3,shade=rand(),grad=d.createLinearGradient(0,wy,0,wy+h);
        grad.addColorStop(0,glass?'#90abb7':shop?'#8a9da1':'#86999d');
        grad.addColorStop(.55,glass?'#658390':'#647779');grad.addColorStop(1,shade>.52?'#4e626a':'#3f5158');
        rect(left,wy+1,ww,h-2,grad);
        rect(left,wy+.5,ww,.65,'rgba(230,243,241,.65)');
        rect(left+ww-.65,wy+1,.65,h-2,'rgba(15,28,35,.52)');
        if(rand()<(glass?.18:.48))rect(left,wy+1,ww,(h-3)*(.18+.62*rand()),'rgba(213,207,187,.72)');
        if(glass){rect(left+.5,wy+h*.55,ww-1,.55,'rgba(178,211,218,.34)');}
        if(shop)rect(left+ww*.2,wy+h*.67,ww*.62,h*.33,'#424c49');
      }
      if(apartment){
        rect(a+2,b+46,60,9,'#b1b9b4');rect(a+2,b+48,60,2,'#637076');rect(a,b+57,64,5,'#a19d92');
        if(rand()<.35){rect(a+45,b+51,13,8,'#d9d6c8');rect(a+47,b+53,7,4,'#929593');}
      }else if(glass){rect(a,b+56,64,6,'#506773');rect(a,b+63,64,1,'#a5b3b5');}
      else if(shop){rect(a,b,64,8,'#766e63');}
      else{rect(wx-3,wy+h+1,w+6,3,'#c9c4b6');if(!brick)rect(a,b+62,64,2,'rgba(55,53,50,.22)');}
      if(brick){
        d.save();
        d.beginPath();d.rect(a,b,64,64);d.rect(wx-3,wy-3,w+6,h+7);d.clip('evenodd');
        for(let row=0;row<22;row++)for(let col=-1;col<10;col++){
          const px=a+col*7+(row%2)*3.5,py=b+row*3;
          rect(px,py,6.5,2.55,'rgba(65,40,29,'+(.07+.25*rand())+')');
          rect(px+.25,py+.12,6,.3,'rgba(226,170,139,.17)');
        }
        d.restore();
      }
    }
    const dayTex=new T.CanvasTexture(day);
    dayTex.wrapS=dayTex.wrapT=T.RepeatWrapping;dayTex.colorSpace=T.SRGBColorSpace;dayTex.anisotropy=8;textures.push(dayTex);
    mat.onBeforeCompile=shader=>{
      shader.uniforms.sunlight=HanDaylight;shader.uniforms.dayFacade={value:dayTex};
      shader.fragmentShader="uniform float sunlight;uniform sampler2D dayFacade;\n"+shader.fragmentShader.replace("#include <map_fragment>",
        "#include <map_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,texture2D(dayFacade,vMapUv).rgb,sunlight);");
    };

    mat.customProgramCacheKey=()=>"seoul-facade-"+kind;return mat;
  }
  for(let i=0;i<8;i++)panes.push(facade(i));
  class Batch {
    constructor(){this.parts=new Map();}
    tri(mat,a,b,c,t,tA,tB,tC){
      let buf=this.parts.get(mat);
      if(!buf){buf={p:[],uv:[],c:[]};this.parts.set(mat,buf);}
      buf.p.push(...a,...b,...c);buf.uv.push(...tA,...tB,...tC);
      for(let i=0;i<3;i++)buf.c.push(t.r,t.g,t.b);
    }
    quad(mat,a,b,c,d,t,u=1,v=1,v0=0,u0=0){
      this.tri(mat,a,b,c,t,[u0,v0],[u0+u,v0],[u0+u,v0+v]);
      this.tri(mat,a,c,d,t,[u0,v0],[u0+u,v0+v],[u0,v0+v]);
    }
    finish(name){
      const group=new T.Group();group.name=name;
      for(const [mat,b] of this.parts){
        const g=new T.BufferGeometry();
        g.setAttribute('position',new T.Float32BufferAttribute(b.p,3));
        g.setAttribute('uv',new T.Float32BufferAttribute(b.uv,2));
        g.setAttribute('color',new T.Float32BufferAttribute(b.c,3));
        g.computeBoundingSphere();
        group.add(new T.Mesh(g,mat));
      }
      root.add(group);return group;
    }
  }
  function outline(x,z,y,w,d,rot,cut=0){
    const a=w/2,b=d/2,c=Math.cos(rot),s=Math.sin(rot);
    const plan=cut?[[-a,-b+cut],[-a,b-cut],[-a+cut,b],[a-cut,b],[a,b-cut],[a,-b+cut],[a-cut,-b],[-a+cut,-b]]:
      [[-a,-b],[-a,b],[a,b],[a,-b]];
    return plan.map(([u,v])=>[x+c*u+s*v,y,z-s*u+c*v]);
  }
  function sides(batch,bottom,top,mat,shade,panel=47,floors=48,offset=0) {
    for(let j=0;j<bottom.length;j++) {
      const k=(j+1)%bottom.length,a=bottom[j],b=bottom[k];
      const width=Math.max(.0625,Math.round(Math.hypot(b[0]-a[0],b[2]-a[2])/panel*16)/16);
      batch.quad(mat,a,b,top[k],top[j],shade,width,(top[j][1]-a[1])/floors,a[1]/floors+offset*.7,offset+j*.13);
    }
  }
  function cap(batch,r,c) {
    for(let i=1;i<r.length-1;i++)batch.tri(solid,r[0],r[i],r[i+1],c,[0,0],[1,0],[1,1]);
  }
  function block(batch,x,z,y,w,d,h,angle,mat,shade,offset=0){
    const bottom=outline(x,z,y,w,d,angle),top=outline(x,z,y+h,w,d,angle);
    sides(batch,bottom,top,mat,shade,mat===panes[0]||mat===panes[1]?57:43,mat===panes[0]||mat===panes[1]?48:59,offset);
    cap(batch,top,mat===solid?shade:roof);
  }
  function loft(batch,x,z,h,angle,rows,mat,shade){
    let prev;
    for(const [s,w,d,corner,dx=0] of rows) {
      const cur=outline(x+dx,z,3+s*h,w,d,angle,corner);
      if(prev)sides(batch,prev,cur,mat,shade,40,54);
      prev=cur;
    }
    cap(batch,prev,trim);
  }
  function drum(batch,x,z,bottom,top,rb,rt,mat,c,n=14){
    const p=[],q=[];
    // Decreasing angle creates the same exterior-facing winding as outline().
    for(let i=0;i<n;i++){
      const a=-i*2*Math.PI/n;
      p.push([x+rb*Math.cos(a),bottom,z+rb*Math.sin(a)]);
      q.push([x+rt*Math.cos(a),top,z+rt*Math.sin(a)]);
    }
    sides(batch,p,q,mat,c,38,55);cap(batch,q,c);
  }
  function hill(batch,x,z,height,rx,rz,seed){
    const points=[],n=48,rings=7;
    for(let j=0;j<=rings;j++){
      const level=j/rings,ring=[];
      for(let i=0;i<n;i++){
        const a=i*2*Math.PI/n;
        const contour=1+.1*Math.sin(3*a+seed)+.06*Math.cos(7*a)+.02*Math.sin(15*a+seed);
        const fall=Math.pow(1-level,1.06);
        const y=height*fall+(height*.13*Math.sin(5*a+level*4+seed)+height*.044*Math.sin(12*a+level*7))*Math.sin(Math.PI*level);
        ring.push([x+Math.cos(a)*rx*level*contour,y-1,z+Math.sin(a)*rz*level*contour]);
      }
      points.push(ring);
    }
    for(let j=0;j<rings;j++)for(let i=0;i<n;i++){
      const k=(i+1)%n;
      const c=rgb(0x172532).multiplyScalar(.72+.15*Math.cos(i*2*Math.PI/n)+.18*Math.sin(j+i*.2+seed));
      batch.quad(solid,points[j][i],points[j][k],points[j+1][k],points[j+1][i],c);
    }
  }
  const records=[
    ['63 Building',126.94000,37.51972,249.6,'gold','https://en.wikipedia.org/wiki/63_Building'],
    ['Parc 1 Tower 1',126.92719,37.52668,322,'parc','https://mapcarta.com/W874639189'],
    ['Parc 1 Tower 2',126.92782,37.52707,256,'parc','https://mapcarta.com/W874639190'],
    ['One IFC',126.92608,37.52598,185,'ifc','https://mapcarta.com/W621752526'],
    ['Three IFC',126.925807,37.524976,284,'ifc','https://airportguide.com/airport/info/AG9252'],
    ['N Seoul Tower',126.988276,37.551216,236.7,'mast','https://en.wikipedia.org/wiki/Namsan_Seoul_Tower'],
    ['Lotte World Tower',127.10278,37.51250,555,'spire','https://en.wikipedia.org/wiki/Lotte_World_Tower'],
    ['Trade Tower',127.061,37.5103,228,'trade','https://en.wikipedia.org/wiki/World_Trade_Center_Seoul'],
    ['Raemian Caelitus',126.9798861,37.5171806,201,'trio','https://en.wikipedia.org/wiki/Raemian_Caelitus'],
    ['One Bailey complex',126.99813,37.5068,99,'estate','https://mapcarta.com/W412953594']
  ];
  const hillRecords=[
    [126.988276,37.551216,245,1120,1070,'https://en.wikipedia.org/wiki/Namsan_Seoul_Tower'],
    [127.10250,37.56611,287,940,1320,'https://en.wikipedia.org/wiki/Achasan'],
    [127.09611,37.57128,348,820,1380,'https://en.wikipedia.org/wiki/Yongmabong'],
    [126.96361,37.44556,632,2800,3000,'https://en.wikipedia.org/wiki/Gwanaksan'],
    [126.9579,37.5846,338,1120,1230,'https://topolu.com/inwangsan']
  ];
  const blueLed=rgb(0x92bccc),goldLed=rgb(0xe6ad62),redLed=rgb(0xbd4e42),whiteLed=rgb(0xccd6d6);
  const special=new Batch();
  for(const [id,lon,lat,h,style,source] of records){
    if(style==="trio"||style==="estate")continue;
    const {x,z}=world.project(lon,lat);
    // Where a stylized tower would cover a street, use the surveyed and
    // clearance-checked building outline for that block.
    if(world.network&&style!=='mast'){
      const radius=style==='spire'?42:style==='trade'?38:40;
      const nearby=world.edgesIn(x-radius,z-radius,x+radius,z+radius);
      if([...nearby].some(e=>world.projectEdge(e,x,z).d2<(radius+Math.max(e.half,world.joinWidth(e,e.a),world.joinWidth(e,e.b))*2)**2))continue;
    }
    landmarks.push({x,z,s:world.nearest(x,z).s,id,source,r:style==='estate'?230:style==='trio'?132:style==='mast'?610:58});
    if(style==='gold'){
      loft(special,x,z,h,-.52,[[0,58,36,4],[.18,55,34,4],[.44,46,31,4,-1],[.76,36,28,4,-3],[.96,25,24,3,-4],[1,20,22,3,-4]],panes[4],light);
      block(special,x-4,z,h+3,18,18,2,-.52,solid,goldLed);
      block(special,x-4,z,h+5,1.4,1.4,16,0,solid,trim);
    }else if(style==='parc'){
      const w=h>280?52:45,d=h>280?46:39,a=-.53;
      loft(special,x,z,h,a,[[0,w,d,3],[.94,w,d,3],[1,w*.94,d*.94,3]],panes[2],light);
      for(const [xx,,zz] of outline(x,z,3,w,d,a))block(special,xx,zz,3,2.2,2.2,h+4,a,solid,redLed);
      for(const f of [.08,.33,.61,.84,.975])sides(special,outline(x,z,3+h*f,w+1,d+1,a,3),outline(x,z,5+h*f,w+1,d+1,a,3),solid,redLed);
    }else if(style==='ifc'){
      const a=-.5;
      loft(special,x,z,h,a,[[0,47,45,5],[.78,47,45,5],[.92,42,34,5,2],[1,23,19,3,6]],panes[3],light);
      block(special,x+6,z,h+3,15,13,1.6,a,solid,blueLed);
    }else if(style==='spire'){
      const a=.3,levels=[[0,82],[.18,78],[.48,62],[.72,48],[.89,31],[.965,16],[1,6]];
      for(let i=0;i<levels.length-1;i++){
        const [p,w]=levels[i],[q,v]=levels[i+1];
        drum(special,x,z,3+h*p,3+h*q,w/2,v/2,panes[3],light,18);
      }
      for(let i=1;i<levels.length-1;i++){
        const [p,w]=levels[i];const band=p>.87?whiteLed:rgb(0x648694);
        drum(special,x,z,3+h*p,3+h*p+1,w/2+.15,w/2+.15,solid,band,18);
      }
      for(const side of [-1,1])block(special,x+side*2.5,z,h-8,1.7,1.7,12,a,solid,whiteLed);
    }else if(style==='mast'){
      const base=244;
      drum(special,x,z,base,base+126,7.7,4.4,solid,rgb(0x69848e));
      drum(special,x,z,base+126,base+134,5,17,solid,trim);
      drum(special,x,z,base+134,base+147,17,17,panes[2],light);
      drum(special,x,z,base+147,base+150,17.5,17.5,solid,blueLed);
      drum(special,x,z,base+150,base+157,14,7,solid,trim);
      for(let i=0;i<5;i++)drum(special,x,z,base+157+i*15.5,base+172.5+i*15.5,3.1-i*.43,2.9-i*.43,solid,i%2?redLed:whiteLed,9);
    }else if(style==='trade'){
      for(let i=0;i<9;i++){
        const w=46-i*2.5;
        block(special,x+i*1.2,z,3+i*h/9,w,42,h/9+.15,.3,panes[2],light);
      }
    }else if(style==='trio'){
      for(const [dx,dz,ht] of [[0,0,201],[46,26,166],[-43,-14,150]]) {
        loft(special,x+dx,z+dz,ht,.48,[[0,33,28,4],[.84,33,28,4],[.99,29,23,4],[1,27,21,4]],panes[1],light);
        block(special,x+dx,z+dz,ht+3,22,18,1.2,.48,solid,blueLed);
      }
    }else if(style==='estate'){
      for(let j=0;j<4;j++)for(let k=0;k<3;k++){
        const xx=x+(j-1.5)*73+(k-1)*16,zz=z+(k-1)*73-(j-1.5)*13;
        block(special,xx,zz,3,27,34,h-(j+k)%3*7,-.32,panes[(j+k)%2],light);
      }
    }
  }
  for(let i=0;i<hillRecords.length;i++){
    const [lon,lat,h,w,d]=hillRecords[i],pos=world.project(lon,lat);
    hill(special,pos.x,pos.z,h,w,d,8.4+i);
  }
  special.finish('Georeferenced city landmarks and summits');
  const mapped=buildMappedDistricts(T,world,root,Batch,panes,solid,landmarks);
  return {update:mapped.update,dispose(){mapped.dispose();root.removeFromParent();root.traverse(o=>o.geometry?.dispose());for(const m of materials)m.dispose();for(const t of textures)t.dispose();}};
};
