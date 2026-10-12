/** Independence is required even when an engineer also holds manage_team. */
export function mayIndependentlyVerifyCompetency(engineerUserId:string|null,reviewerUserId:string):boolean{
  return Boolean(reviewerUserId) && engineerUserId!==reviewerUserId;
}
