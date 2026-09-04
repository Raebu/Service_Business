export function internalRequestAuthorised(request:Request):boolean{
  const configured=process.env.CRON_SECRET;
  if(!configured)return false;
  const auth=request.headers.get('authorization');
  return auth===`Bearer ${configured}`;
}
