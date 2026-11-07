// M2.3 Dayframe API: all resource authorization is derived from verified Neon JWT sub.
// Ownership is enforced again by composite database foreign keys. Never trust client owner IDs.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import pg from 'pg';

const ORIGIN='https://azmath25.github.io';
const HEADERS={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',vary:'Origin'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json=(body,status,headers)=>Response.json(body,{status,headers:{...headers,'content-type':'application/json; charset=utf-8'}});
const fail=(code,msg)=>Object.assign(new Error(msg),{status:code});
export const BOOTSTRAP_SQL="INSERT INTO dayframe.workspaces(owner_user_id,name,kind) VALUES($1,'General','general') ON CONFLICT (owner_user_id) WHERE kind = 'general' DO NOTHING";
const WORKSPACE_FIELDS='id::text AS id,name,kind,subtitle,color,cover,revision,created_at AS "createdAt",archived_at AS "archivedAt"';
export const LIST_SQL="SELECT "+WORKSPACE_FIELDS+" FROM dayframe.workspaces WHERE owner_user_id=$1 AND deleted_at IS NULL AND archived_at IS NULL ORDER BY CASE WHEN kind='general' THEN 0 ELSE 1 END,created_at,id";
export const ARCHIVED_SQL="SELECT "+WORKSPACE_FIELDS+" FROM dayframe.workspaces WHERE owner_user_id=$1 AND kind='custom' AND deleted_at IS NULL AND archived_at IS NOT NULL ORDER BY archived_at DESC,id DESC";
const TASK_FIELDS=[
  'id::text AS id','workspace_id::text AS workspace','parent_id::text AS parent',
  'title','notes','status','priority','estimate_minutes AS estimate',
  'long_term AS long','deadline::text AS deadline',
  "to_char(deadline_time,'HH24:MI') AS \"deadlineTime\"",
  'reminder::text AS reminder',
  "to_char(reminder_time,'HH24:MI') AS \"reminderTime\"",
  'revision','pinned','tags','archived_at AS "archivedAt"','completed_at AS "completedAt"','cancelled_at AS "cancelledAt"',
  'created_at AS "createdAt"','updated_at AS "updatedAt"'
].join(',');
const TASK_LIST="SELECT "+TASK_FIELDS+" FROM dayframe.tasks WHERE owner_user_id=$1 AND deleted_at IS NULL AND archived_at IS NULL AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=workspace_id AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL) ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3";
const TASK_ARCHIVED="SELECT "+TASK_FIELDS+" FROM dayframe.tasks WHERE owner_user_id=$1 AND deleted_at IS NULL AND archived_at IS NOT NULL AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=workspace_id AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL) ORDER BY archived_at DESC,id DESC LIMIT $2 OFFSET $3";
const TASK_TRASH="SELECT "+TASK_FIELDS+" FROM dayframe.tasks WHERE owner_user_id=$1 AND deleted_at IS NOT NULL AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=workspace_id AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL) ORDER BY deleted_at DESC,id DESC LIMIT $2 OFFSET $3";
const TASK_BY_ID="SELECT "+TASK_FIELDS+" FROM dayframe.tasks WHERE owner_user_id=$1 AND id=$2 AND deleted_at IS NULL AND archived_at IS NULL AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=workspace_id AND w.owner_user_id=$1 AND w.archived_at IS NULL AND w.deleted_at IS NULL)";
const TASK_INSERT="INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,title,notes,status,priority,estimate_minutes,long_term,deadline,deadline_time,reminder,reminder_time,parent_id,pinned,tags) "+
"SELECT $2,$1,w.id,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16 FROM dayframe.workspaces w WHERE w.id=$3 AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL "+
"AND ($14::uuid IS NULL OR EXISTS(SELECT 1 FROM dayframe.tasks parent WHERE parent.id=$14 AND parent.workspace_id=w.id AND parent.owner_user_id=$1 AND parent.deleted_at IS NULL AND parent.archived_at IS NULL)) "+
"ON CONFLICT(id) DO NOTHING RETURNING "+TASK_FIELDS;
const TASK_UPDATE="UPDATE dayframe.tasks t SET title=$4,notes=$5,status=$6,priority=$7,estimate_minutes=$8,long_term=$9,deadline=$10,deadline_time=$11,reminder=$12,reminder_time=$13,parent_id=$14,pinned=$15,tags=$16,revision=t.revision+1,updated_at=now() "+
"WHERE t.owner_user_id=$1 AND t.id=$2 AND t.workspace_id=$3 AND t.revision=$17 AND t.deleted_at IS NULL AND t.archived_at IS NULL "+
"AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=t.workspace_id AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL) "+
"AND ($14::uuid IS NULL OR EXISTS(SELECT 1 FROM dayframe.tasks parent WHERE parent.id=$14 AND parent.workspace_id=$3 AND parent.owner_user_id=$1 AND parent.deleted_at IS NULL AND parent.archived_at IS NULL)) RETURNING "+TASK_FIELDS;
const TASK_HISTORY="SELECT e.event_id::text AS id,e.event_type AS type,e.before_state AS before,e.after_state AS after,e.created_at AS \"createdAt\" FROM dayframe.task_events e "+
"WHERE e.owner_user_id=$1 AND e.task_id=$2 AND EXISTS(SELECT 1 FROM dayframe.tasks t WHERE t.id=e.task_id AND t.owner_user_id=$1) ORDER BY e.event_id DESC LIMIT $3";

let jwks,pool;
async function verifyNeonToken(token) {
  if(!process.env.NEON_AUTH_BASE_URL||!process.env.NEON_AUTH_JWKS_URL) throw Error('Missing auth configuration');
  jwks??=createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
  const {payload}=await jwtVerify(token,jwks,{issuer:new URL(process.env.NEON_AUTH_BASE_URL).origin,algorithms:['EdDSA']});
  if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>256) throw Error('Invalid subject');
  return payload.sub;
}
async function runSql(sql,args){
  if(!process.env.DATABASE_URL) throw Error('Missing database configuration');
  if(!pool){pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:4});pool.on('error',()=>console.error('Dayframe database pool disconnected'));}
  return pool.query(sql,args);
}
async function readBody(req){
  if(!String(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json')) throw fail(415,'Expected JSON');
  if(Number(req.headers.get('content-length')||0)>25000) throw fail(413,'Request too large');
  const text=await req.text();
  if(text.length>25000) throw fail(413,'Request too large');
  let data;try{data=JSON.parse(text)}catch{throw fail(400,'Invalid JSON');}
  if(!data||Array.isArray(data)||typeof data!=='object') throw fail(400,'Invalid JSON object');
  return data;
}
function str(value,max,label,{required=false}={}){
  if(typeof value!=='string') throw fail(400,'Invalid '+label);
  const s=value.trim();
  if(s.length>max||(required&&!s)) throw fail(400,'Invalid '+label);
  return s;
}
function date(value,label){
  if(value===null||value===undefined||value==='')return null;
  if(typeof value!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) throw fail(400,'Invalid '+label);
  const d=new Date(value+'T00:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value) throw fail(400,'Invalid '+label);
  return value;
}
function clock(value,day,label){
  if(value===null||value===undefined||value==='')return null;
  if(!day||typeof value!=='string'||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)) throw fail(400,'Invalid '+label);
  return value;
}
function uuid(s,label){if(typeof s!=='string'||!UUID.test(s)) throw fail(400,'Invalid '+label);return s;}
function taskBody(body){
  const title=str(body.title,160,'task title',{required:true});
  const workspace=uuid(body.workspace,'workspace');
  const notes=str(body.notes??'',10000,'notes');
  const status=body.status??'open',priority=body.priority??'medium';
  if(!['open','done','cancelled'].includes(status)||!['low','medium','high'].includes(priority))throw fail(400,'Invalid task status or priority');
  const estimate=Number(body.estimate??30);
  if(!Number.isSafeInteger(estimate)||estimate<1||estimate>100000)throw fail(400,'Invalid estimate');
  if(typeof body.long!=='boolean'&&body.long!==undefined)throw fail(400,'Invalid long-term flag');
  const hard=date(body.deadline,'deadline'),rem=date(body.reminder,'reminder');
  const parent=body.parent==null?null:uuid(body.parent,'parent task');
  const pinned=body.pinned??false;
  if(typeof pinned!=='boolean')throw fail(400,'Invalid pin');
  const tags=body.tags??[];
  if(!Array.isArray(tags)||tags.length>8||tags.some(tag=>typeof tag!=='string'||tag.length<1||tag.length>30||!/^[\p{L}\p{N} _-]+$/u.test(tag)))throw fail(400,'Invalid tags');
  if(new Set(tags.map(tag=>tag.toLocaleLowerCase())).size!==tags.length)throw fail(400,'Duplicate tags');
  return [workspace,title,notes,status,priority,estimate,Boolean(body.long),hard,clock(body.deadlineTime,hard,'deadline time'),rem,clock(body.reminderTime,rem,'reminder time'),parent,pinned,tags];
}
function workspaceBody(body){
  const name=str(body.name,120,'workspace name',{required:true});
  const subtitle=str(body.subtitle??'',180,'workspace description');
  const color=body.color??'#85a99d',cover=body.cover??'general';
  if(typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))throw fail(400,'Invalid workspace color');
  if(typeof cover!=='string'||!['general','research','dev','custom'].includes(cover))throw fail(400,'Invalid workspace cover');
  return [name,subtitle,color,cover];
}
function revision(body){const rev=Number(body.revision);if(!Number.isSafeInteger(rev)||rev<1)throw fail(400,'Invalid revision');return rev;}
function matchesTask(existing,args){
  const [workspace,title,notes,status,priority,estimate,long,deadline,deadlineTime,reminder,reminderTime,parent,pinned,tags]=args;
  const nullable=value=>value===''||value==null?null:value;
  return existing.workspace===workspace&&existing.title===title&&existing.notes===notes&&
    existing.status===status&&existing.priority===priority&&Number(existing.estimate)===estimate&&
    existing.long===long&&nullable(existing.deadline)===deadline&&
    nullable(existing.deadlineTime)===deadlineTime&&nullable(existing.reminder)===reminder&&
    nullable(existing.reminderTime)===reminderTime&&nullable(existing.parent)===parent&&
    Boolean(existing.pinned)===pinned&&JSON.stringify(existing.tags||[])===JSON.stringify(tags);
}
function authHeaders(request){
  const trusted=request.headers.get('origin')===ORIGIN;
  return {...HEADERS,...(trusted?{'access-control-allow-origin':ORIGIN}:{})};
}
export function createHandler({verifyToken=verifyNeonToken,query=runSql}={}){
return {async fetch(req){
  const path=new URL(req.url).pathname.replace(/\/+$/,'')||'/';
  const hdr=authHeaders(req);
  if(req.method==='OPTIONS'){
    if(!path.startsWith('/v1/')&&!['/','/health'].includes(path))return json({error:'Not found'},404,hdr);
    if(req.headers.get('origin')!==ORIGIN)return json({error:'Origin not allowed'},403,hdr);
    return new Response(null,{status:204,headers:{...hdr,'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type','access-control-max-age':'600'}});
  }
  if(path==='/'||path==='/health')return req.method==='GET'?json({service:'dayframe',status:'ok',stage:'persistent-workspaces-tasks'},200,hdr):json({error:'Method not allowed'},405,{...hdr,allow:'GET,OPTIONS'});
  if(!path.startsWith('/v1/'))return json({error:'Not found'},404,hdr);
  const match=/^Bearer ([A-Za-z0-9_.\-]+)$/i.exec(req.headers.get('authorization')||'');
  if(!match||match[1].length>8192)return json({error:'Unauthorized'},401,hdr);
  let uid;try{uid=await verifyToken(match[1]);if(typeof uid!=='string'||!uid||uid.length>256)throw Error('Subject');}catch{return json({error:'Unauthorized'},401,hdr);}
  try{
    if(path==='/v1/me'&&req.method!=='GET')return json({error:'Method not allowed'},405,{...hdr,allow:'GET,OPTIONS'});
    if((path==='/v1/me'||path==='/v1/workspaces')&&req.method==='GET'){
      await query(BOOTSTRAP_SQL,[uid]);
      const {rows}=await query(LIST_SQL,[uid]);
      if(!rows?.some(x=>x.kind==='general'))throw fail(503,'Workspace unavailable');
      if(path==='/v1/me')return json({user:{id:uid},generalWorkspace:rows.find(x=>x.kind==='general')},200,hdr);
      return json({workspaces:rows},200,hdr);
    }
    if(path==='/v1/workspaces/archived'&&req.method==='GET'){
      const {rows}=await query(ARCHIVED_SQL,[uid]);
      return json({workspaces:rows},200,hdr);
    }
    if(path==='/v1/workspaces'&&req.method==='POST'){
      const [name,subtitle,color,cover]=workspaceBody(await readBody(req));
      const {rows}=await query("INSERT INTO dayframe.workspaces(owner_user_id,kind,name,subtitle,color,cover) VALUES($1,'custom',$2,$3,$4,$5) RETURNING "+WORKSPACE_FIELDS,[uid,name,subtitle,color,cover]);
      return json({workspace:rows[0]},201,hdr);
    }
    const wa=/^\/v1\/workspaces\/([a-f0-9-]{36})\/(archive|restore)$/i.exec(path);
    if(wa&&req.method==='POST'){
      const id=uuid(wa[1],'workspace'),rev=revision(await readBody(req));
      const archive=wa[2]==='archive';
      const sql=archive
        ? "UPDATE dayframe.workspaces SET archived_at=now(),revision=revision+1,updated_at=now() WHERE id=$2 AND owner_user_id=$1 AND kind='custom' AND deleted_at IS NULL AND archived_at IS NULL AND revision=$3 RETURNING "+WORKSPACE_FIELDS
        : "UPDATE dayframe.workspaces SET archived_at=NULL,revision=revision+1,updated_at=now() WHERE id=$2 AND owner_user_id=$1 AND kind='custom' AND deleted_at IS NULL AND archived_at IS NOT NULL AND revision=$3 RETURNING "+WORKSPACE_FIELDS;
      const {rows}=await query(sql,[uid,id,rev]);
      if(!rows.length)throw fail(409,'Workspace changed, unavailable or protected');
      return json({workspace:rows[0]},200,hdr);
    }
    const wm=/^\/v1\/workspaces\/([a-f0-9-]{36})$/i.exec(path);
    if(wm&&req.method==='PATCH'){
      const id=uuid(wm[1],'workspace'),body=await readBody(req);
      const [name,subtitle,color,cover]=workspaceBody(body),rev=revision(body);
      const {rows}=await query("UPDATE dayframe.workspaces SET name=$3,subtitle=$4,color=$5,cover=$6,revision=revision+1,updated_at=now() WHERE id=$2 AND owner_user_id=$1 AND kind='custom' AND deleted_at IS NULL AND archived_at IS NULL AND revision=$7 RETURNING "+WORKSPACE_FIELDS,[uid,id,name,subtitle,color,cover,rev]);
      if(!rows.length)throw fail(409,'Workspace changed or unavailable');
      return json({workspace:rows[0]},200,hdr);
    }
    if(path==='/v1/tasks'&&req.method==='GET'){
      const params=new URL(req.url).searchParams;
      const offset=Number(params.get('offset')??0),limit=Number(params.get('limit')??100);
      if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||!Number.isSafeInteger(limit)||limit<1||limit>200)throw fail(400,'Invalid pagination');
      const {rows}=await query(TASK_LIST,[uid,limit+1,offset]);
      return json({tasks:rows.slice(0,limit),nextOffset:rows.length>limit?offset+limit:null},200,hdr);
    }
    if(path==='/v1/tasks/archived'&&req.method==='GET'){
      const params=new URL(req.url).searchParams;
      const offset=Number(params.get('offset')??0),limit=Number(params.get('limit')??100);
      if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||!Number.isSafeInteger(limit)||limit<1||limit>200)throw fail(400,'Invalid pagination');
      const {rows}=await query(TASK_ARCHIVED,[uid,limit+1,offset]);
      return json({tasks:rows.slice(0,limit),nextOffset:rows.length>limit?offset+limit:null},200,hdr);
    }
    if(path==='/v1/tasks/trash'&&req.method==='GET'){
      const params=new URL(req.url).searchParams;
      const offset=Number(params.get('offset')??0),limit=Number(params.get('limit')??100);
      if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||!Number.isSafeInteger(limit)||limit<1||limit>200)throw fail(400,'Invalid pagination');
      const {rows}=await query(TASK_TRASH,[uid,limit+1,offset]);
      return json({tasks:rows.slice(0,limit),nextOffset:rows.length>limit?offset+limit:null},200,hdr);
    }
    if(path==='/v1/tasks'&&req.method==='POST'){
      const body=await readBody(req);
      const id=uuid(body.id,'task id'),args=taskBody(body);
      const {rows}=await query(TASK_INSERT,[uid,id,...args]);
      if(rows.length)return json({task:rows[0]},201,hdr);
      const existing=await query(TASK_BY_ID,[uid,id]);
      if(existing.rows.length&&matchesTask(existing.rows[0],args))return json({task:existing.rows[0]},200,hdr);
      throw fail(409,'Task id already exists or workspace unavailable');
    }
    const taskAction=/^\/v1\/tasks\/([a-f0-9-]{36})\/(archive|unarchive|move|events|permanent)$/i.exec(path);
    if(taskAction){
      const id=uuid(taskAction[1],'task id'),action=taskAction[2];
      if(action==='events'&&req.method==='GET'){
        const limit=Number(new URL(req.url).searchParams.get('limit')??50);
        if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw fail(400,'Invalid event limit');
        const {rows}=await query(TASK_HISTORY,[uid,id,limit]);
        return json({events:rows},200,hdr);
      }
      if(action==='archive'&&req.method==='POST'){
        const rev=revision(await readBody(req));
        const {rows}=await query("UPDATE dayframe.tasks t SET archived_at=now(),revision=revision+1,updated_at=now() WHERE t.id=$2 AND t.owner_user_id=$1 AND t.revision=$3 AND t.deleted_at IS NULL AND t.archived_at IS NULL AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=t.workspace_id AND w.owner_user_id=$1 AND w.archived_at IS NULL AND w.deleted_at IS NULL) RETURNING "+TASK_FIELDS,[uid,id,rev]);
        if(!rows.length)throw fail(409,'Task changed or unavailable');
        return json({task:rows[0]},200,hdr);
      }
      if(action==='unarchive'&&req.method==='POST'){
        const rev=revision(await readBody(req));
        const {rows}=await query("UPDATE dayframe.tasks t SET archived_at=NULL,revision=revision+1,updated_at=now() WHERE t.id=$2 AND t.owner_user_id=$1 AND t.revision=$3 AND t.deleted_at IS NULL AND t.archived_at IS NOT NULL AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=t.workspace_id AND w.owner_user_id=$1 AND w.archived_at IS NULL AND w.deleted_at IS NULL) RETURNING "+TASK_FIELDS,[uid,id,rev]);
        if(!rows.length)throw fail(409,'Task changed or unavailable');
        return json({task:rows[0]},200,hdr);
      }
      if(action==='move'&&req.method==='POST'){
        const body=await readBody(req),rev=revision(body);
        const target=uuid(body.workspace,'destination workspace'),parent=body.parent==null?null:uuid(body.parent,'new parent');
        await query("SELECT dayframe.move_task_subtree($1,$2,$3,$4,$5)",[uid,id,target,parent,rev]);
        const {rows}=await query("SELECT "+TASK_FIELDS+" FROM dayframe.tasks WHERE owner_user_id=$1 AND id=$2",[uid,id]);
        if(!rows.length)throw fail(409,'Task changed or unavailable');
        return json({task:rows[0]},200,hdr);
      }
      if(action==='permanent'&&req.method==='DELETE'){
        const body=await readBody(req),rev=revision(body);
        if(body.confirm!=='DELETE')throw fail(400,'Type DELETE to confirm permanent removal');
        const {rows}=await query("DELETE FROM dayframe.tasks t WHERE t.owner_user_id=$1 AND t.id=$2 AND t.revision=$3 AND t.deleted_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dayframe.tasks child WHERE child.parent_id=t.id AND child.owner_user_id=$1) RETURNING t.id",[uid,id,rev]);
        if(!rows.length)throw fail(409,'Task not in Trash, changed or has subtasks');
        return json({permanentlyDeleted:true},200,hdr);
      }
      return json({error:'Method not allowed'},405,hdr);
    }
    const tm=/^\/v1\/tasks\/([a-f0-9-]{36})$/i.exec(path);
    if(tm&&req.method==='PATCH'){
      const id=uuid(tm[1],'task id'),body=await readBody(req),args=taskBody(body),rev=revision(body);
      if(body.status==='done'&&!body.allowOpenChildren){
        const {rows:children}=await query("WITH RECURSIVE descendants AS (SELECT id,parent_id,ARRAY[id] AS path FROM dayframe.tasks WHERE parent_id=$2 AND owner_user_id=$1 AND deleted_at IS NULL AND archived_at IS NULL UNION ALL SELECT t.id,t.parent_id,d.path||t.id FROM dayframe.tasks t JOIN descendants d ON t.parent_id=d.id WHERE t.owner_user_id=$1 AND t.deleted_at IS NULL AND t.archived_at IS NULL AND NOT t.id=ANY(d.path)) SELECT 1 FROM descendants d JOIN dayframe.tasks t ON t.id=d.id WHERE t.status='open' LIMIT 1",[uid,id]);
        if(children.length)throw fail(409,'Finish or explicitly keep open subtasks before completing this task');
      }
      if(body.allowOpenChildren!==undefined&&typeof body.allowOpenChildren!=='boolean')throw fail(400,'Invalid subtask completion option');
      const {rows}=await query(TASK_UPDATE,[uid,id,...args,rev]);
      if(!rows.length)throw fail(409,'Task changed or workspace unavailable');
      return json({task:rows[0]},200,hdr);
    }
    if(tm&&req.method==='DELETE'){
      const id=uuid(tm[1],'task id');
      const {rows}=await query("UPDATE dayframe.tasks SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE id=$2 AND owner_user_id=$1 AND deleted_at IS NULL AND archived_at IS NULL AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=workspace_id AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL) RETURNING id",[uid,id]);
      if(!rows.length)throw fail(404,'Task not found');
      return json({deleted:true},200,hdr);
    }
    const restore=/^\/v1\/tasks\/([a-f0-9-]{36})\/restore$/i.exec(path);
    if(restore&&req.method==='POST'){
      const id=uuid(restore[1],'task id');
      const {rows}=await query("UPDATE dayframe.tasks SET deleted_at=NULL,revision=revision+1,updated_at=now() WHERE id=$2 AND owner_user_id=$1 AND deleted_at IS NOT NULL AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=workspace_id AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL) RETURNING "+TASK_FIELDS,[uid,id]);
      if(!rows.length)throw fail(404,'Task not found');
      return json({task:rows[0]},200,hdr);
    }
    if(['GET','POST','PATCH','DELETE'].includes(req.method))return json({error:'Not found'},404,hdr);
    return json({error:'Method not allowed'},405,hdr);
  }catch(error){
    if(error?.status)return json({error:error.message},error.status,hdr);
    if(['40001','23503','23505'].includes(error?.code))return json({error:'Workspace, parent task, or revision conflict'},409,hdr);
    if(['23514','22001','22007','22008'].includes(error?.code))return json({error:'Invalid task or workspace fields'},400,hdr);
    // Never leak SQL, credentials, user identity or data through errors/logs.
    console.error('Dayframe data request failed',error instanceof Error?error.name:'UnknownError');
    return json({error:'Data service unavailable'},503,hdr);
  }
}};
}
export default createHandler();
