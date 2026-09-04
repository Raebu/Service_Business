export type Coordinate={latitude:number;longitude:number};
export type RouteResult={distanceMeters:number;durationSeconds:number;source:string};

export function haversineMeters(a:Coordinate,b:Coordinate){
  const rad=(value:number)=>value*Math.PI/180;
  const earth=6_371_000;
  const dLat=rad(b.latitude-a.latitude);
  const dLon=rad(b.longitude-a.longitude);
  const lat1=rad(a.latitude),lat2=rad(b.latitude);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return Math.round(2*earth*Math.asin(Math.sqrt(h)));
}

export async function routeEta(origin:Coordinate,destination:Coordinate):Promise<RouteResult|null>{
  const base=(process.env.ROUTING_BASE_URL||'').replace(/\/$/,'');
  if(!base)return null;
  const coordinates=`${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url=new URL(`${base}/route/v1/driving/${coordinates}`);
  url.searchParams.set('overview','false');
  url.searchParams.set('steps','false');
  if(process.env.ROUTING_API_KEY)url.searchParams.set(process.env.ROUTING_API_KEY_PARAM||'access_token',process.env.ROUTING_API_KEY);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),2500);
  try{
    const response=await fetch(url,{signal:controller.signal,headers:{accept:'application/json'},cache:'no-store'});
    if(!response.ok)return null;
    const data=await response.json() as {routes?:Array<{distance?:number;duration?:number}>};
    const route=data.routes?.[0];
    if(!route||!Number.isFinite(route.distance)||!Number.isFinite(route.duration))return null;
    return{distanceMeters:Math.max(0,Math.round(Number(route.distance))),durationSeconds:Math.max(0,Math.round(Number(route.duration))),source:process.env.ROUTING_SOURCE_NAME||'osrm-compatible'};
  }catch{return null}finally{clearTimeout(timeout)}
}

export function selectTravelCharge(bands:Array<{service_key:string|null;minimum_distance_meters:number;maximum_distance_meters:number|null;charge_pence:number;reject_beyond_band:boolean}>,serviceKey:string|undefined,distanceMeters:number){
  const applicable=bands
    .filter(b=>(!b.service_key||b.service_key===serviceKey)&&distanceMeters>=Number(b.minimum_distance_meters||0)&&(b.maximum_distance_meters==null||distanceMeters<Number(b.maximum_distance_meters)))
    .sort((a,b)=>Number(b.minimum_distance_meters)-Number(a.minimum_distance_meters));
  if(applicable[0])return{chargePence:Number(applicable[0].charge_pence||0),rejected:false};
  const rejecting=bands.filter(b=>(!b.service_key||b.service_key===serviceKey)&&b.reject_beyond_band&&b.maximum_distance_meters!=null).sort((a,b)=>Number(b.maximum_distance_meters)-Number(a.maximum_distance_meters))[0];
  if(rejecting&&distanceMeters>=Number(rejecting.maximum_distance_meters))return{chargePence:0,rejected:true};
  return{chargePence:0,rejected:false};
}
