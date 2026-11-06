// Dayframe M2.2: all user routes require a server-verified Managed Neon Auth JWT.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import pg from 'pg';

const ORIGIN = 'https://azmath25.github.io';
const COMMON = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', vary: 'Origin' };
export const BOOTSTRAP_SQL = `INSERT INTO dayframe.workspaces(owner_user_id,name,kind) VALUES($1,'General','general') ON CONFLICT (owner_user_id) WHERE kind = 'general' DO NOTHING`;
export const LIST_SQL = `SELECT id::text AS id,name,kind,created_at AS "createdAt" FROM dayframe.workspaces WHERE owner_user_id=$1 ORDER BY CASE WHEN kind='general' THEN 0 ELSE 1 END,created_at,id`;
const response = (body, status, headers) => Response.json(body, {status, headers:{...headers,'content-type':'application/json; charset=utf-8'}});
let jwks, pool;
async function verifyNeonToken(token) {
  if (!process.env.NEON_AUTH_BASE_URL || !process.env.NEON_AUTH_JWKS_URL) throw Error('Missing auth configuration');
  jwks ??= createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
  const {payload} = await jwtVerify(token,jwks,{issuer:new URL(process.env.NEON_AUTH_BASE_URL).origin,algorithms:['EdDSA']});
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length>256) throw Error('Invalid subject');
  return payload.sub;
}
async function runSql(sql, args) {
  if (!process.env.DATABASE_URL) throw Error('Missing database configuration');
  if (!pool) {
    pool = new pg.Pool({connectionString:process.env.DATABASE_URL,max:4});
    pool.on('error',()=>console.error('Dayframe database pool disconnected'));
  }
  return pool.query(sql,args);
}
export function createHandler({verifyToken=verifyNeonToken,query=runSql}={}) {
  return {async fetch(request) {
    const path = new URL(request.url).pathname.replace(/\/+$/,'')||'/';
    const trusted = request.headers.get('origin')===ORIGIN;
    const headers = {...COMMON,...(trusted?{'access-control-allow-origin':ORIGIN}:{})};
    const app = path.startsWith('/v1/');
    if(request.method==='OPTIONS') {
      if(!app && !['/','/health'].includes(path)) return response({error:'Not found'},404,headers);
      if(!trusted) return response({error:'Origin not allowed'},403,headers);
      return new Response(null,{status:204,headers:{...headers,'access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'authorization,content-type','access-control-max-age':'600'}});
    }
    if(path==='/' || path==='/health') {
      if(request.method!=='GET') return response({error:'Method not allowed'},405,{...headers,allow:'GET, OPTIONS'});
      return response({service:'dayframe',status:'ok',stage:'auth-workspaces'},200,headers);
    }
    if(!app) return response({error:'Not found'},404,headers);
    const match = /^Bearer ([A-Za-z0-9_.\-]+)$/i.exec(request.headers.get('authorization')||'');
    if(!match || match[1].length>8192) return response({error:'Unauthorized'},401,headers);
    let userId;
    try {
      userId=await verifyToken(match[1]);
      if(typeof userId!=='string' || !userId || userId.length>256) throw Error('Invalid identity');
    }catch{return response({error:'Unauthorized'},401,headers);}
    if(path!=='/v1/me' && path!=='/v1/workspaces') return response({error:'Not found'},404,headers);
    if(request.method!=='GET') return response({error:'Method not allowed'},405,{...headers,allow:'GET, OPTIONS'});
    try {
      await query(BOOTSTRAP_SQL,[userId]);
      const {rows}=await query(LIST_SQL,[userId]);
      const general=rows?.find(row=>row.kind==='general');
      if(!general) return response({error:'Workspace unavailable'},503,headers);
      return path==='/v1/me'
        ? response({user:{id:userId},generalWorkspace:general},200,headers)
        : response({workspaces:rows},200,headers);
    }catch(error){
      console.error('Workspace request failed',error instanceof Error?error.name:'UnknownError');
      return response({error:'Workspace service unavailable'},503,headers);
    }
  }};
}
export default createHandler();
