// Preserve strict TLS certificate + hostname checks when pg-connection-string
// changes sslmode=require behavior. Never log or serialize the result.
export function secureDatabaseConnectionUrl(value){
 if(typeof value!=='string'||!value)throw Error('Database connection not configured');
 const parsed=new URL(value);
 if(!['postgres:','postgresql:'].includes(parsed.protocol))throw Error('Invalid database scheme');
 const mode=parsed.searchParams.get('sslmode');
 if(mode&&['require','prefer','verify-ca'].includes(mode.toLowerCase())){
  parsed.searchParams.set('sslmode','verify-full');
 }
 return parsed.toString();
}
