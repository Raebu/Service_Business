export type InternalWorker={path:string;run:(request:Request)=>Promise<Response>};
export type WorkerResult={path:string;ok:boolean;status:number;detail?:string};

/** Invoke internal handlers in-process, avoiding deployment-auth and self-fetch loops. */
export async function runInternalWorkers(source:Request,workers:readonly InternalWorker[],secret:string):Promise<WorkerResult[]>{
  return Promise.all(workers.map(async ({path,run})=>{
    try{
      const request=new Request(new URL(path,source.url),{
        method:'POST',
        headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'}
      });
      const response=await run(request);
      const body=response.ok?'':await response.text();
      return {path,ok:response.ok,status:response.status,detail:response.ok?undefined:body.slice(0,300)};
    }catch(error){
      return {path,ok:false,status:0,detail:error instanceof Error?error.message:'Worker request failed'};
    }
  }));
}
