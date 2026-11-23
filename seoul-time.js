/* NOAA General Solar Position Calculations. UTC instant, Seoul 37.53 N / 127.00 E. */
window.seoulSunAt=function(date){
 const r=Math.PI/180,year=date.getUTCFullYear(),days=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000;
 const utc=date.getUTCHours()+date.getUTCMinutes()/60+date.getUTCSeconds()/3600;
 const day=Math.floor((date-Date.UTC(year,0,1))/86400000)+1;
 const y=2*Math.PI/days*(day-1+(utc-12)/24);
 const eq=229.18*(.000075+.001868*Math.cos(y)-.032077*Math.sin(y)-.014615*Math.cos(2*y)-.040849*Math.sin(2*y));
 const dec=.006918-.399912*Math.cos(y)+.070257*Math.sin(y)-.006758*Math.cos(2*y)+.000907*Math.sin(2*y)-.002697*Math.cos(3*y)+.00148*Math.sin(3*y);
 const hour=((utc*60+eq+127*4)/4-180)*r,lat=37.53*r;
 const x=-Math.cos(dec)*Math.sin(hour),up=Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(hour);
 const z=Math.sin(lat)*Math.cos(dec)*Math.cos(hour)-Math.cos(lat)*Math.sin(dec),alt=Math.asin(up)/r;
 const k=Math.max(0,Math.min(1,(alt+6)/13)),light=k*k*(3-2*k);
 const phase=alt< -6?"밤":alt>3?"낮":Math.sin(hour)<0?"새벽":"해질녘";
 return {x,y:up,z,alt,light,phase,time:String((date.getUTCHours()+9)%24).padStart(2,"0")+":"+String(date.getUTCMinutes()).padStart(2,"0")};
};
window.HanDaylight={value:seoulSunAt(new Date()).light};