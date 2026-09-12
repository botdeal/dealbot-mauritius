import {adapt} from './adapters.mjs';
const respond=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function boundedJSON(req) {
  if(!req.body) return {};
  const reader=req.body.getReader();const chunks=[];let size=0;
  try {while(true) {const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;if(size>2097152)throw Error('Body too large');chunks.push(value);}
  } finally {await reader.cancel();}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)||'{}');
}
export async function handle(req,db) {
  if(req.method!=='POST')return respond({ok:false,error:'method_not_allowed'},405);
  let input;
  try {input=await boundedJSON(req);if(!input || Array.isArray(input)||typeof input!=='object')throw Error();}
  catch {return respond({ok:false,error:'invalid_or_oversized_json'},400);}
  const action=input.action || (Object.keys(input).length===0?'health':null);
  if(action==='health') {
    try {
      const {data,error}=await db.rpc('sync_health');if(error)throw error;
      return respond({ok:true,service:'dealbot-sync',mode:'autopilot',schema_version:1,database:data,
        capabilities:['bounded_batch','atomic_import','automatic_score_v1','durable_retry','source_lock','snapshot_reconciliation'],source_connection:false});
    }catch{return respond({ok:false,error:'database_unavailable'},503);}
  }
  if(action==='status'||action==='retry') {
    if(!Number.isSafeInteger(input.id)||input.id<1)return respond({ok:false,error:'invalid_run_id'},400);
    try {
      const {data,error}=await db.rpc(action==='retry'?'sync_retry':'sync_status',{run_id:input.id});
      return error?respond({ok:false,error:'run_request_failed'},error.code==='22023'?400:503):respond({ok:!!data,run:data},data?200:404);
    }catch{return respond({ok:false,error:'run_request_unavailable'},503);}
  }
  if(action!=='submit')return respond({ok:false,error:'unsupported_action'},400);
  let batch;
  try {batch=adapt(input.adapter||'canonical-v1',input.batch);}catch{return respond({ok:false,error:'invalid_adapter_or_batch'},400);}
  let submitted;
  try {submitted=await db.rpc('sync_enqueue',{batch});}catch{return respond({ok:false,error:'enqueue_unavailable',retry_with_same_key:true},503);}
  if(submitted.error)return respond({ok:false,error:'batch_not_accepted',code:submitted.error.code},['22023','23505'].includes(submitted.error.code)?400:503);
  const id=submitted.data.id;
  try {
    const {data,error}=await db.rpc('sync_process',{run_id:id});
    if(error)return respond({ok:true,accepted:true,id,state:'queued',check_status:true},202);
    return respond({ok:data.state==='succeeded',accepted:true,...data},data.state==='succeeded'?200:data.state==='failed'?422:202);
  } catch {return respond({ok:true,accepted:true,id,state:'queued',check_status:true},202);}
}
