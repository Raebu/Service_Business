# Operational cycle rollout

Daily intelligence now invokes its existing seven handlers directly in-process rather than making protected HTTP calls back to Vercel.

The operational cycle provides dispatch, transactional notifications, compliance monitoring, incident recovery, SLA tracking, and financial reconciliation. It is disabled until an operator deliberately enables `ENABLE_OPERATIONAL_CYCLE=true`. Automated transfers have the independent flag `ENABLE_AUTOMATED_SETTLEMENTS=true`, which must remain off until sandbox payment, reserve and dispute testing succeeds.

Vercel currently schedules the daily intelligence route, not the operational cycle. A properly secured external scheduler and incident alerts must be configured and verified before claiming continuous operation.

The cycle reports partial worker failure using HTTP 207. Do not treat deployment READY or a successful cron trigger as proof each worker succeeded.
