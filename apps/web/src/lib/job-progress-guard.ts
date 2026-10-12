/** Terminal or disputed jobs require an operations-led transition before engineer progress can resume. */
export function jobAcceptsEngineerProgress(status:string):boolean{
  return status!=='completed' && status!=='cancelled' && status!=='disputed';
}
