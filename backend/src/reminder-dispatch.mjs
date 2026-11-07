// Dayframe M4.3 due reminder worker. Invoked by the named Neon schedule trigger.
// Sends only empty VAPID-authenticated Web Push signals. Task text never leaves Neon
// for an untrusted push service: the SW shows a generic alert and opens the inbox.
import crypto from 'node:crypto';
import pg from 'pg';

export const VAPID_PUBLIC_KEY='BGuoNReCOFbRqVYRkKY9u-sVDCE-f6JvrbxRZnsksM3cDze3lsS8Y6tkzDs6-mLUFBQXZK2uhBUISW21wEfWZl8';
const BATCH=40;
let pool;
const b64=buf=>Buffer.from(buf).toString('base64url');
export function isApprovedPushEndpoint(value){
 try{
  if(typeof value!=='string'||value.length>1200)return false;
  const u=new URL(value),h=u.hostname.toLowerCase();
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.port &&
   (h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||
    h==='web.push.apple.com'||h.endsWith('.push.apple.com')||
    h.endsWith('.notify.windows.com'));
 }catch{return false;}
}
export function makeVapidAuthorization(endpoint,privateKey,nowSeconds=Math.floor(Date.now()/1000),publicKey=VAPID_PUBLIC_KEY){
 if(!isApprovedPushEndpoint(endpoint))throw Error('Unsupported push endpoint');
 if(typeof privateKey!=='string'||!/^[\w-]{42,44}$/.test(privateKey))throw Error('Missing VAPID private key');
 const raw=Buffer.from(publicKey,'base64url');
 if(raw.length!==65||raw[0]!==4)throw Error('Invalid VAPID public key');
 const key=crypto.createPrivateKey({key:{
  kty:'EC',crv:'P-256',x:b64(raw.subarray(1,33)),y:b64(raw.subarray(33,65)),d:privateKey
 },format:'jwk'});
 const header=b64(JSON.stringify({typ:'JWT',alg:'ES256'}));
 const payload=b64(JSON.stringify({
  aud:new URL(endpoint).origin,exp:nowSeconds+3600,sub:'https://azmath25.github.io/planner/'
 }));
 const input=header+'.'+payload;
 const signature=crypto.sign('sha256',Buffer.from(input),{key,dsaEncoding:'ieee-p1363'});
 return 'vapid t='+input+'.'+b64(signature)+', k='+publicKey;
}
function db(){
 if(!process.env.DATABASE_URL)throw Error('Database not configured');
 if(!pool){
  pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3});
  pool.on('error',()=>console.error('Reminder database pool disconnected'));
 }
 return pool;
}
const CLAIM_SQL=`
WITH selected AS (
 SELECT id FROM dayframe.notification_deliveries
 WHERE attempts<6 AND next_attempt_at<=now()
 AND (status IN ('pending','retry') OR
     (status='sending' AND claimed_at<now()-interval '3 minutes'))
 ORDER BY next_attempt_at,id
 FOR UPDATE SKIP LOCKED LIMIT $1
)
UPDATE dayframe.notification_deliveries d SET
 status='sending',attempts=d.attempts+1,claimed_at=now()
 FROM selected WHERE d.id=selected.id
 RETURNING d.id,d.owner_user_id,d.task_id,d.kind,d.source_day::text AS day,
 to_char(d.source_time,'HH24:MI') AS clock,d.send_after,d.endpoint,d.attempts`;

// Eligibility is rechecked immediately before outbound send, accounting for
// task completion, re-dating, deleted subscriptions and user acknowledgement.
const ELIGIBLE_SQL=`
 SELECT 1 FROM dayframe.notification_deliveries d
 JOIN dayframe.push_subscriptions s ON s.endpoint=d.endpoint AND s.owner_user_id=d.owner_user_id
 JOIN dayframe.tasks t ON t.id=d.task_id AND t.owner_user_id=d.owner_user_id
 JOIN dayframe.workspaces w ON w.id=t.workspace_id AND w.owner_user_id=t.owner_user_id
 JOIN dayframe.notification_preferences p ON p.owner_user_id=d.owner_user_id
 LEFT JOIN dayframe.task_alert_actions a ON a.owner_user_id=d.owner_user_id
  AND a.task_id=d.task_id AND a.kind=d.kind AND a.source_day=d.source_day AND a.source_time=d.source_time
 WHERE d.id=$1 AND d.status='sending' AND t.status='open'
  AND t.deleted_at IS NULL AND t.archived_at IS NULL
  AND w.deleted_at IS NULL AND w.archived_at IS NULL
  AND (CASE WHEN d.kind='reminder' THEN t.reminder ELSE t.deadline END)=d.source_day
  AND COALESCE((CASE WHEN d.kind='reminder' THEN t.reminder_time ELSE t.deadline_time END),'09:00'::time)=d.source_time
  AND a.acknowledged_at IS NULL
  AND COALESCE(a.snoozed_until,((d.source_day+d.source_time) AT TIME ZONE p.time_zone))=d.send_after
  AND d.send_after<=now()`;
async function claim(limit=BATCH){
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const {rows}=await client.query(CLAIM_SQL,[limit]);
  await client.query('COMMIT');
  return rows;
 }catch(e){await client.query('ROLLBACK');throw e;}
 finally{client.release();}
}
export async function dispatchDue({sql,send,privateKey,vapid=makeVapidAuthorization}={}){
 const query=sql??((statement,params)=>db().query(statement,params));
 const push=send??((endpoint,authorization)=>fetch(endpoint,{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
   headers:{Authorization:authorization,TTL:'3600',Urgency:'normal'}
 }));
 if(!sql)await query('SELECT dayframe.enqueue_due_push($1)',[250]);
 const rows=sql?(await query(CLAIM_SQL,[BATCH])).rows:await claim();
 let delivered=0,expired=0,retrying=0;
 for(const row of rows){
  const {id,endpoint,attempts}=row;
  try{
   const valid=await query(ELIGIBLE_SQL,[id]);
   if(!valid.rows.length||!isApprovedPushEndpoint(endpoint)){
    await query("UPDATE dayframe.notification_deliveries SET status='expired' WHERE id=$1 AND status='sending'",[id]);expired++;continue;
   }
   const response=await push(endpoint,vapid(endpoint,privateKey??process.env.VAPID_PRIVATE_KEY));
   if(response.ok){
    await query("UPDATE dayframe.notification_deliveries SET status='delivered',sent_at=now(),last_status=$2 WHERE id=$1 AND status='sending'",[id,response.status]);delivered++;continue;
   }
   if(response.status===404||response.status===410){
    await query("DELETE FROM dayframe.push_subscriptions WHERE endpoint=$1",[endpoint]);expired++;continue;
   }
   const backoff=Math.min(3600,60*2**Math.min(attempts,6));
   await query("UPDATE dayframe.notification_deliveries SET status=CASE WHEN attempts>=6 THEN 'expired' ELSE 'retry' END,next_attempt_at=now()+($2*interval '1 second'),last_status=$3 WHERE id=$1 AND status='sending'",[id,backoff,response.status]);retrying++;
  }catch(e){
   const backoff=Math.min(3600,60*2**Math.min(attempts,6));
   await query("UPDATE dayframe.notification_deliveries SET status=CASE WHEN attempts>=6 THEN 'expired' ELSE 'retry' END,next_attempt_at=now()+($2*interval '1 second') WHERE id=$1 AND status='sending'",[id,backoff]);
   retrying++;
  }
 }
 return {claimed:rows.length,delivered,expired,retrying};
}
export default {async fetch(request){
 if(new URL(request.url).pathname!=='/dispatch'||request.method!=='POST')
  return Response.json({error:'Not found'},{status:404});
 const header=request.headers.get('x-neon-trigger-invocation-id');
 if(!header||header.length>256)return Response.json({error:'Forbidden'},{status:403});
 let data;
 try{
  const raw=await request.text();
  if(raw.length>4096)throw Error('Size');
  data=JSON.parse(raw);
 }catch{return Response.json({error:'Invalid request'},{status:400});}
 // Neon requires the authenticated proxy header to match the event's
 // invocation_id. Check both, not merely the presence of a trigger header.
 if(data?.version!==1||typeof data?.invocation_id!=='string'||
   data.invocation_id!==header||
   data?.trigger?.type!=='schedule'||data?.trigger?.name!=='dayframe-reminder-dispatch'||
   typeof data?.data?.scheduled_at!=='string')
  return Response.json({error:'Invalid schedule event'},{status:403});
 try{
  const result=await dispatchDue();
  return Response.json({ok:true,...result});
 }catch(e){console.error('Dayframe reminder dispatch failed',e instanceof Error?e.name:'Unknown');return Response.json({error:'Delivery unavailable'},{status:503});}
}};
