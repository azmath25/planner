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
const TASK_SUBTREE="WITH RECURSIVE subtree AS (SELECT root.id,ARRAY[root.id] AS path FROM dayframe.tasks root "+
"JOIN dayframe.workspaces w ON w.id=root.workspace_id AND w.owner_user_id=$1 WHERE root.owner_user_id=$1 AND root.id=$2 AND root.revision=$3 "+
"AND w.deleted_at IS NULL AND w.archived_at IS NULL AND ";
const TASK_DESCENDANTS=" UNION ALL SELECT child.id,s.path||child.id FROM dayframe.tasks child JOIN subtree s ON child.parent_id=s.id "+
"WHERE child.owner_user_id=$1 AND NOT child.id=ANY(s.path)) ";
function taskSubtreeUpdate(field,rootCondition,childCondition,queryResult){
 return TASK_SUBTREE+rootCondition+TASK_DESCENDANTS+
 ",changed AS (UPDATE dayframe.tasks t SET "+field+"= "+(field==='archived_at'?"CASE WHEN $4::boolean THEN now() ELSE NULL END":"CASE WHEN $4::boolean THEN now() ELSE NULL END")+
 ",revision=t.revision+1,updated_at=now() FROM subtree s WHERE t.id=s.id AND t.owner_user_id=$1 "+childCondition+" RETURNING t.*) "+
 (queryResult==='rows'?"SELECT "+TASK_FIELDS+" FROM changed":"SELECT id::text AS id FROM changed");
}
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
async function readBody(req,maxChars=25000){
  if(!String(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json')) throw fail(415,'Expected JSON');
  if(Number(req.headers.get('content-length')||0)>maxChars) throw fail(413,'Request too large');
  const text=await req.text();
  if(text.length>maxChars) throw fail(413,'Request too large');
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
    const mediaPath=/^\/v1\/tasks\/([a-f0-9-]{36})\/media(?:\/(cover|avatar))?$/i.exec(path);
    if(mediaPath){
      const id=uuid(mediaPath[1],'task id'),slot=mediaPath[2]||null;
      const owned=" FROM dayframe.task_media m JOIN dayframe.tasks t ON t.id=m.task_id AND t.owner_user_id=m.owner_user_id "+
        "JOIN dayframe.workspaces w ON w.id=t.workspace_id AND w.owner_user_id=$1 "+
        "WHERE m.owner_user_id=$1 AND m.task_id=$2 AND t.deleted_at IS NULL AND t.archived_at IS NULL AND w.deleted_at IS NULL AND w.archived_at IS NULL";
      if(!slot&&req.method==='GET'){
        const {rows}=await query("SELECT m.slot,m.mime,encode(m.image_bytes,'base64') AS base64,m.focal_y AS \"focalY\""+owned,[uid,id]);
        return json({images:rows.map(row=>({slot:row.slot,data:'data:'+row.mime+';base64,'+row.base64,focalY:row.focalY}))},200,hdr);
      }
      if(slot&&req.method==='PUT'){
        const body=await readBody(req,265000);
        if(typeof body.data!=='string')throw fail(400,'Invalid image data');
        const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.data);
        if(!match)throw fail(400,'Invalid supported image');
        const bytes=Buffer.from(match[2],'base64');
        if(bytes.length<16||bytes.length>180000||bytes.toString('base64')!==match[2])throw fail(413,'Image must be under 180 KB');
        const mime=match[1],focal=Number(body.focalY??50);
        if(!Number.isInteger(focal)||focal<0||focal>100)throw fail(400,'Invalid image position');
        const isPng=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
        const isJpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
        const isWebp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
        if(!({ 'image/png':isPng,'image/jpeg':isJpeg,'image/webp':isWebp})[mime])throw fail(400,'Image content does not match file type');
        const sql="INSERT INTO dayframe.task_media(task_id,owner_user_id,slot,mime,image_bytes,focal_y) "+
          "SELECT t.id,$1,$3,$4,decode($5,'base64'),$6 FROM dayframe.tasks t JOIN dayframe.workspaces w ON w.id=t.workspace_id AND w.owner_user_id=$1 "+
          "WHERE t.id=$2 AND t.owner_user_id=$1 AND t.deleted_at IS NULL AND t.archived_at IS NULL AND w.deleted_at IS NULL AND w.archived_at IS NULL "+
          "ON CONFLICT(task_id,slot) DO UPDATE SET mime=EXCLUDED.mime,image_bytes=EXCLUDED.image_bytes,focal_y=EXCLUDED.focal_y,updated_at=now() "+
          "WHERE dayframe.task_media.owner_user_id=EXCLUDED.owner_user_id RETURNING slot";
        const {rows}=await query(sql,[uid,id,slot,mime,match[2],focal]);
        if(!rows.length)throw fail(404,'Task not found or unavailable');
        return json({saved:true,slot},200,hdr);
      }
      if(slot&&req.method==='PATCH'){
        const body=await readBody(req),focal=Number(body.focalY);
        if(!Number.isInteger(focal)||focal<0||focal>100)throw fail(400,'Invalid image position');
        const {rows}=await query("UPDATE dayframe.task_media m SET focal_y=$4,updated_at=now() FROM dayframe.tasks t WHERE m.task_id=$2 AND m.owner_user_id=$1 AND m.slot=$3 AND t.id=m.task_id AND t.owner_user_id=$1 AND t.deleted_at IS NULL AND t.archived_at IS NULL RETURNING m.slot",[uid,id,slot,focal]);
        if(!rows.length)throw fail(404,'Image not found');
        return json({saved:true},200,hdr);
      }
      if(slot&&req.method==='DELETE'){
        const {rows}=await query("DELETE FROM dayframe.task_media m USING dayframe.tasks t WHERE m.task_id=$2 AND m.owner_user_id=$1 AND m.slot=$3 AND t.id=m.task_id AND t.owner_user_id=$1 RETURNING m.slot",[uid,id,slot]);
        if(!rows.length)throw fail(404,'Image not found');
        return json({removed:true},200,hdr);
      }
      return json({error:'Method not allowed'},405,hdr);
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
      if((action==='archive'||action==='unarchive')&&req.method==='POST'){
        const rev=revision(await readBody(req)),archive=action==='archive';
        const sql=taskSubtreeUpdate('archived_at',archive?'root.deleted_at IS NULL AND root.archived_at IS NULL':'root.deleted_at IS NULL AND root.archived_at IS NOT NULL',
          'AND t.deleted_at IS NULL','rows');
        const {rows}=await query(sql,[uid,id,rev,archive]);
        const root=rows.find(row=>row.id===id);
        if(!root)throw fail(409,'Task changed or unavailable');
        return json({task:root,affected:rows.length},200,hdr);
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
      const sql=TASK_SUBTREE+"root.deleted_at IS NULL AND root.archived_at IS NULL"+TASK_DESCENDANTS+
        ",changed AS (UPDATE dayframe.tasks t SET deleted_at=now(),revision=t.revision+1,updated_at=now() FROM subtree s WHERE t.id=s.id AND t.owner_user_id=$1 AND t.deleted_at IS NULL RETURNING t.id) SELECT id::text AS id FROM changed";
      const revCheck=await query("SELECT revision FROM dayframe.tasks WHERE owner_user_id=$1 AND id=$2 AND deleted_at IS NULL AND archived_at IS NULL",[uid,id]);
      if(!revCheck.rows.length)throw fail(404,'Task not found');
      const {rows}=await query(sql,[uid,id,revCheck.rows[0].revision]);
      if(!rows.length)throw fail(404,'Task not found');
      return json({deleted:true},200,hdr);
    }
    const restore=/^\/v1\/tasks\/([a-f0-9-]{36})\/restore$/i.exec(path);
    if(restore&&req.method==='POST'){
      const id=uuid(restore[1],'task id');
      const revCheck=await query("SELECT revision FROM dayframe.tasks WHERE owner_user_id=$1 AND id=$2 AND deleted_at IS NOT NULL",[uid,id]);
      if(!revCheck.rows.length)throw fail(404,'Task not found');
      const sql=taskSubtreeUpdate('deleted_at','root.deleted_at IS NOT NULL','AND t.deleted_at IS NOT NULL','rows');
      const {rows}=await query(sql,[uid,id,revCheck.rows[0].revision,false]);
      const root=rows.find(row=>row.id===id);
      if(!root)throw fail(409,'Task changed or workspace unavailable');
      return json({task:root,affected:rows.length},200,hdr);
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
