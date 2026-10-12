export type InternalWorker={path:string;run:(request:Request)=>Promise<Response>};
export type WorkerResult={path:string;ok:boolean;status:number;detail?:string};

/** Run authorised handlers directly, without requiring public access to a protected Vercel deployment. */
export async function runInternalWorkers(source:Request,workers:readonly InternalWorker[],secret:string):Promise<WorkerResult[]>{
  return Promise.all(workers.map(async ({path,run})=>{
    try{
      const request=new Request(new URL(path,source.url),{
        method:'POST',
        headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'}
      });
      const response=await run(request);
      // 207 is Multi-Status, used by nested workers for partial failures. It is NOT
      // a successful processing cycle, despite Response.ok being true.
      const ok=response.ok&&response.status!==207;
      return {path,ok,status:response.status,detail:ok?undefined:'Worker did not complete successfully'};
    }catch{
      // Don't expose sensitive exception messages from payment or customer operations.
      return {path,ok:false,status:0,detail:'Worker execution failed'};
    }
  }));
}
