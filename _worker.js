function esc(v=''){return String(v).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));}
function money(v){const n=Number(v||0);return Number.isFinite(n)?n.toFixed(2):'0.00';}
function proofAttachment(dataUrl){
  if(!dataUrl||typeof dataUrl!=='string'||!dataUrl.startsWith('data:image/'))return null;
  const m=dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s);if(!m)return null;
  const ext=m[1]==='image/png'?'png':m[1]==='image/webp'?'webp':'jpg';
  return{filename:`job-completion-proof.${ext}`,content:m[2]};
}

const AUTH_SESSION_TTL=60*60*24*30;
function b64url(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function bytesFromB64url(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const x=atob(s);return Uint8Array.from(x,c=>c.charCodeAt(0))}
function normEmail(v=''){return String(v).trim().toLowerCase()}
function businessCodeFor(a){const id=String(a?.businessId||a?.id||'').replace(/[^a-z0-9]/gi,'').toUpperCase();return id?'TURF-'+id.slice(0,8):''}
function mowBusinessCodeFor(a){const id=String(a?.businessId||a?.id||'').replace(/[^a-z0-9]/gi,'').toUpperCase();return id?'MOW-'+id.slice(0,8):''}
function greenBusinessCodeFor(a){const id=String(a?.businessId||a?.id||'').replace(/[^a-z0-9]/gi,'').toUpperCase();return id?'GREEN-'+id.slice(0,8):''}
function cleanProfile(a){return{id:a.id,email:a.email,companyName:a.companyName,ownerName:a.ownerName,phone:a.phone||'',serviceArea:a.serviceArea||'',createdAt:a.createdAt||'',role:a.role||'owner',businessId:a.businessId||a.id,businessCode:businessCodeFor(a)}}
async function hashPassword(password,saltB64){const salt=saltB64?bytesFromB64url(saltB64):crypto.getRandomValues(new Uint8Array(16));const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:30000},material,256);return{salt:b64url(salt),hash:b64url(bits)}}
function token(){return b64url(crypto.getRandomValues(new Uint8Array(32)))}
async function readJson(request){try{return await request.json()}catch(e){return{}}}
function kvMissing(){return Response.json({error:'TurfOS D1 is not configured yet. Bind your Cloudflare D1 database to this project as DB.'},{status:503})}

// --- D1-backed key/value compatibility layer ---
// Phase 1 moves all TurfOS application reads/writes off Workers KV immediately while
// preserving the current data model. A later migration can normalize these JSON values
// into dedicated relational tables without breaking current customers.
let __d1Ready=false;
async function ensureD1(env){
  if(!env.DB)throw new Error('Missing Cloudflare D1 binding DB');
  if(__d1Ready)return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS turfos_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at INTEGER,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_turfos_store_expires ON turfos_store(expires_at)').run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS turfos_migrations (
    name TEXT PRIMARY KEY,
    completed_at TEXT,
    detail TEXT
  )`).run();
  __d1Ready=true;
}
function d1Now(){return Math.floor(Date.now()/1000)}
async function makeD1Store(env){
  await ensureD1(env);
  return {
    async get(key){
      const row=await env.DB.prepare('SELECT value, expires_at FROM turfos_store WHERE key=?').bind(String(key)).first();
      if(!row)return null;
      if(row.expires_at&&Number(row.expires_at)<=d1Now()){
        await env.DB.prepare('DELETE FROM turfos_store WHERE key=?').bind(String(key)).run();
        return null;
      }
      return row.value;
    },
    async put(key,value,options={}){
      const ttl=Number(options?.expirationTtl||0),expires=ttl>0?d1Now()+ttl:null;
      await env.DB.prepare(`INSERT INTO turfos_store(key,value,expires_at,updated_at)
        VALUES(?,?,?,datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at,updated_at=datetime('now')`)
        .bind(String(key),String(value),expires).run();
    },
    async delete(key){await env.DB.prepare('DELETE FROM turfos_store WHERE key=?').bind(String(key)).run()},
    async list(options={}){
      const prefix=String(options?.prefix||''),limit=Math.min(1000,Math.max(1,Number(options?.limit||1000))),offset=Math.max(0,Number(options?.cursor||0)||0);
      let q,args;
      if(prefix){q='SELECT key FROM turfos_store WHERE key>=? AND key<? AND (expires_at IS NULL OR expires_at>?) ORDER BY key LIMIT ? OFFSET ?';args=[prefix,prefix+'\uffff',d1Now(),limit+1,offset]}
      else{q='SELECT key FROM turfos_store WHERE (expires_at IS NULL OR expires_at>?) ORDER BY key LIMIT ? OFFSET ?';args=[d1Now(),limit+1,offset]}
      const res=await env.DB.prepare(q).bind(...args).all();const rows=res.results||[],more=rows.length>limit,shown=rows.slice(0,limit);
      return{keys:shown.map(r=>({name:r.key})),list_complete:!more,cursor:more?String(offset+limit):''};
    }
  };
}
function appEnvWithD1(env,store){return new Proxy(env,{get(target,prop){if(prop==='TURFOS_ACCOUNTS')return store;return target[prop]}})}
async function d1Count(env){await ensureD1(env);const r=await env.DB.prepare('SELECT COUNT(*) AS n FROM turfos_store').first();return Number(r?.n||0)}
async function legacyOwnerFromRequest(request,env){
  if(!env.TURFOS_ACCOUNTS)return null;
  const h=request.headers.get('Authorization')||'',t=h.startsWith('Bearer ')?h.slice(7):'';if(!t)return null;
  const email=await env.TURFOS_ACCOUNTS.get('sess:'+t);if(!email)return null;
  const raw=await env.TURFOS_ACCOUNTS.get('acct:'+email);if(!raw)return null;
  try{const a=JSON.parse(raw);return(a.role||'owner')==='owner'?a:null}catch(e){return null}
}
async function canRunMigration(request,env){
  const configured=String(env.D1_MIGRATION_SECRET||'');
  const supplied=request.headers.get('X-Migration-Secret')||'';
  if(configured&&supplied&&supplied===configured)return true;
  return !!(await legacyOwnerFromRequest(request,env));
}
async function migrateLegacyKvToD1(request,env){
  if(!env.DB)return kvMissing();
  if(!env.TURFOS_ACCOUNTS)return Response.json({error:'Legacy TURFOS_ACCOUNTS KV binding is not connected. Keep it connected until migration finishes.'},{status:409});
  if(!(await canRunMigration(request,env)))return Response.json({error:'Migration authorization failed. Sign in as the existing business owner first, or set D1_MIGRATION_SECRET in Cloudflare and enter it on the migration page.'},{status:403});
  await ensureD1(env);
  let cursor='',listed=0,copied=0,skipped=0,pages=0;
  try{
    do{
      const opts={limit:500};if(cursor)opts.cursor=cursor;const page=await env.TURFOS_ACCOUNTS.list(opts);pages++;const keys=page.keys||[];listed+=keys.length;
      const names=keys.map(k=>k.name);
      const existing=new Set();
      for(let i=0;i<names.length;i+=80){const part=names.slice(i,i+80);if(!part.length)continue;const qs=part.map(()=>'?').join(',');const r=await env.DB.prepare(`SELECT key FROM turfos_store WHERE key IN (${qs})`).bind(...part).all();for(const x of (r.results||[]))existing.add(x.key)}
      const statements=[];
      for(const k of keys){if(existing.has(k.name)){skipped++;continue}const v=await env.TURFOS_ACCOUNTS.get(k.name);if(v==null)continue;const exp=/^(sess:|custsess:)/.test(k.name)?d1Now()+AUTH_SESSION_TTL:null;statements.push(env.DB.prepare(`INSERT INTO turfos_store(key,value,expires_at,updated_at) VALUES(?,?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at,updated_at=datetime('now')`).bind(k.name,v,exp));copied++;if(statements.length>=75){await env.DB.batch(statements.splice(0,statements.length))}}
      if(statements.length)await env.DB.batch(statements);
      cursor=page.list_complete?'':page.cursor;
    }while(cursor);
    await env.DB.prepare(`INSERT INTO turfos_migrations(name,completed_at,detail) VALUES('kv-to-d1',datetime('now'),?) ON CONFLICT(name) DO UPDATE SET completed_at=datetime('now'),detail=excluded.detail`).bind(JSON.stringify({listed,copied,skipped,pages})).run();
    return Response.json({ok:true,listed,copied,skipped,pages,d1Records:await d1Count(env),message:'Migration complete. TurfOS application traffic now uses D1. Keep the KV binding for a short backup period, but normal app reads/writes no longer use it.'},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return Response.json({error:'Migration stopped before completion: '+(e?.message||String(e)),listed,copied,skipped,pages,partial:true,message:'The migration is resumable. Re-run it after the KV limit resets or after upgrading Workers.'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
async function sessionAccount(request,env){if(!env.TURFOS_ACCOUNTS)return null;const h=request.headers.get('Authorization')||'';const t=h.startsWith('Bearer ')?h.slice(7):'';if(!t)return null;const email=await env.TURFOS_ACCOUNTS.get('sess:'+t);if(!email)return null;const raw=await env.TURFOS_ACCOUNTS.get('acct:'+email);if(!raw)return null;try{return{token:t,account:JSON.parse(raw)}}catch(e){return null}}
async function authRoute(request,env,url){if(!env.TURFOS_ACCOUNTS)return kvMissing();
  if(url.pathname==='/api/auth/signup'&&request.method==='POST'){const d=await readJson(request),email=normEmail(d.email),companyName=String(d.companyName||'').trim(),ownerName=String(d.ownerName||'').trim(),password=String(d.password||'');if(!companyName||!ownerName||!email||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return Response.json({error:'Company name, owner name and a valid email are required.'},{status:400});if(password.length<8)return Response.json({error:'Password must be at least 8 characters.'},{status:400});if(await env.TURFOS_ACCOUNTS.get('acct:'+email))return Response.json({error:'An account already exists for this email.'},{status:409});const ph=await hashPassword(password),id=crypto.randomUUID(),a={id,email,companyName,ownerName,phone:String(d.phone||'').trim(),serviceArea:String(d.serviceArea||'').trim(),salt:ph.salt,passwordHash:ph.hash,createdAt:new Date().toISOString(),role:'owner',businessId:id};await env.TURFOS_ACCOUNTS.put('acct:'+email,JSON.stringify(a));const wsKey='workspace:'+id;if(!await env.TURFOS_ACCOUNTS.get(wsKey)){await env.TURFOS_ACCOUNTS.put(wsKey,JSON.stringify({bp:[],bsel:0,csel:0,mode:'biz',set:{businessName:companyName,businessEmail:email,autoPrice:true,autoInvoice:true,price:55,mowers:[]},cloudUpdatedAt:new Date().toISOString()}))}const t=token();await env.TURFOS_ACCOUNTS.put('sess:'+t,email,{expirationTtl:AUTH_SESSION_TTL});return Response.json({ok:true,token:t,account:cleanProfile(a)})}
  if(url.pathname==='/api/auth/login'&&request.method==='POST'){const d=await readJson(request),email=normEmail(d.email),raw=await env.TURFOS_ACCOUNTS.get('acct:'+email);if(!raw)return Response.json({error:'Email or password is incorrect.'},{status:401});const a=JSON.parse(raw),ph=await hashPassword(String(d.password||''),a.salt);if(ph.hash!==a.passwordHash)return Response.json({error:'Email or password is incorrect.'},{status:401});const t=token();await env.TURFOS_ACCOUNTS.put('sess:'+t,email,{expirationTtl:AUTH_SESSION_TTL});return Response.json({ok:true,token:t,account:cleanProfile(a)})}
  if(url.pathname==='/api/auth/me'&&request.method==='GET'){const x=await sessionAccount(request,env);if(!x)return Response.json({error:'Your session expired. Please sign in again.'},{status:401});return Response.json({ok:true,account:cleanProfile(x.account)})}
  if(url.pathname==='/api/auth/logout'&&request.method==='POST'){const x=await sessionAccount(request,env);if(x)await env.TURFOS_ACCOUNTS.delete('sess:'+x.token);return Response.json({ok:true})}
  if(url.pathname==='/api/auth/profile'&&request.method==='PATCH'){const x=await sessionAccount(request,env);if(!x)return Response.json({error:'Please sign in again.'},{status:401});const d=await readJson(request),a=x.account;a.companyName=String(d.companyName||a.companyName).trim();a.ownerName=String(d.ownerName||a.ownerName).trim();a.phone=String(d.phone??a.phone??'').trim();a.serviceArea=String(d.serviceArea??a.serviceArea??'').trim();if(!a.companyName||!a.ownerName)return Response.json({error:'Company and owner name are required.'},{status:400});await env.TURFOS_ACCOUNTS.put('acct:'+a.email,JSON.stringify(a));return Response.json({ok:true,account:cleanProfile(a)})}
  if(url.pathname==='/api/auth/crew'){
    const x=await sessionAccount(request,env);if(!x)return Response.json({error:'Please sign in again.'},{status:401});
    const me=x.account,role=me.role||'owner',bid=me.businessId||me.id;if(role==='crew')return Response.json({error:'Only the business owner can manage crew accounts.'},{status:403});
    const listKey='crewlist:'+bid;
    if(request.method==='GET'){let emails=[];try{emails=JSON.parse(await env.TURFOS_ACCOUNTS.get(listKey)||'[]')}catch(e){}const crew=[];for(const email of emails){const raw=await env.TURFOS_ACCOUNTS.get('acct:'+email);if(raw)try{crew.push(cleanProfile(JSON.parse(raw)))}catch(e){}}return Response.json({ok:true,crew})}
    if(request.method==='POST'){const d=await readJson(request),email=normEmail(d.email),ownerName=String(d.ownerName||'').trim(),password=String(d.password||'');if(!ownerName||!email||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return Response.json({error:'Crew name and a valid email are required.'},{status:400});if(password.length<8)return Response.json({error:'Crew password must be at least 8 characters.'},{status:400});if(await env.TURFOS_ACCOUNTS.get('acct:'+email))return Response.json({error:'An account already exists for this email.'},{status:409});const ph=await hashPassword(password),a={id:crypto.randomUUID(),email,companyName:me.companyName,ownerName,phone:String(d.phone||'').trim(),serviceArea:me.serviceArea||'',salt:ph.salt,passwordHash:ph.hash,createdAt:new Date().toISOString(),role:'crew',businessId:bid};await env.TURFOS_ACCOUNTS.put('acct:'+email,JSON.stringify(a));let emails=[];try{emails=JSON.parse(await env.TURFOS_ACCOUNTS.get(listKey)||'[]')}catch(e){}if(!emails.includes(email))emails.push(email);await env.TURFOS_ACCOUNTS.put(listKey,JSON.stringify(emails));return Response.json({ok:true,account:cleanProfile(a)})}
    if(request.method==='DELETE'){const id=url.searchParams.get('id')||'';let emails=[];try{emails=JSON.parse(await env.TURFOS_ACCOUNTS.get(listKey)||'[]')}catch(e){}let target='';for(const email of emails){const raw=await env.TURFOS_ACCOUNTS.get('acct:'+email);if(raw)try{if(JSON.parse(raw).id===id){target=email;break}}catch(e){}}if(!target)return Response.json({error:'Crew account not found.'},{status:404});await env.TURFOS_ACCOUNTS.delete('acct:'+target);emails=emails.filter(e=>e!==target);await env.TURFOS_ACCOUNTS.put(listKey,JSON.stringify(emails));return Response.json({ok:true})}
    return new Response('Method not allowed',{status:405});
  }
  return Response.json({error:'Account route not found.'},{status:404})
}

async function findBusinessByCode(env,code){
  const want=String(code||'').trim().toUpperCase();if(!want)return null;
  let cursor='';do{const opts={prefix:'acct:',limit:1000};if(cursor)opts.cursor=cursor;const page=await env.TURFOS_ACCOUNTS.list(opts);for(const k of page.keys){const raw=await env.TURFOS_ACCOUNTS.get(k.name);if(!raw)continue;try{const a=JSON.parse(raw);if((a.role||'owner')==='owner'&&(businessCodeFor(a)===want||mowBusinessCodeFor(a)===want||greenBusinessCodeFor(a)===want))return a}catch(e){}}cursor=page.list_complete?'':page.cursor}while(cursor);return null
}
function customerAccountKey(bid,email){return'custacct:'+bid+':'+normEmail(email)}
function customerRecordKey(bid,pid){return'customer:'+bid+':'+String(pid)}
function businessCustomerIndexKey(bid){return'bizcustomers:'+bid}
function normAddress(v=''){return String(v).toLowerCase().replace(/[^a-z0-9]/g,'')}
function phoneDigits(v=''){return String(v).replace(/\D/g,'')}
async function customerSession(request,env){if(!env.TURFOS_ACCOUNTS)return null;const h=request.headers.get('Authorization')||'',t=h.startsWith('Bearer ')?h.slice(7):'';if(!t)return null;const raw=await env.TURFOS_ACCOUNTS.get('custsess:'+t);if(!raw)return null;try{return{token:t,...JSON.parse(raw)}}catch(e){return null}}
function publicCustomer(ws,p,bid){return{business:{id:bid,name:ws?.set?.businessName||'Your Lawn Company',email:ws?.set?.businessEmail||'',paymentLink:ws?.set?.paymentLink||''},customer:{property:{id:p.id,name:p.name||'',email:p.email||'',phone:p.phone||'',street:p.street||p.addr||'',addr:p.addr||p.street||'',sqft:+p.sqft||0,billingAddress:p.billingAddress||p.street||'',billingCity:p.billingCity||'',billingState:p.billingState||'',billingZip:p.billingZip||'',invoicePreference:p.invoicePreference||'Email',serviceNotes:p.serviceNotes||'',customerPortalId:p.customerPortalId||'',customPrice:p.customPrice||null,serviceDay:p.serviceDay??null,visits:Array.isArray(p.visits)?p.visits.slice(0,24):[],inv:Array.isArray(p.inv)?p.inv.slice(0,100):[],msgs:Array.isArray(p.msgs)?p.msgs.slice(-100):[]}}}}
async function persistCustomerRecord(env,bid,p){
  if(!p||!p.id)return;
  const record={businessId:bid,propertyId:String(p.id),customerPortalId:p.customerPortalId||'',name:p.name||'',email:normEmail(p.email||''),phone:p.phone||'',serviceAddress:p.street||p.addr||'',billingAddress:p.billingAddress||p.street||p.addr||'',billingCity:p.billingCity||'',billingState:p.billingState||'',billingZip:p.billingZip||'',invoicePreference:p.invoicePreference||'Email',serviceNotes:p.serviceNotes||'',sqft:+p.sqft||0,customPrice:p.customPrice??null,serviceDay:p.serviceDay??null,visits:Array.isArray(p.visits)?p.visits.slice(0,24):[],inv:Array.isArray(p.inv)?p.inv.slice(0,100):[],msgs:Array.isArray(p.msgs)?p.msgs.slice(-100):[],createdAt:p.customerCreatedAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  await env.TURFOS_ACCOUNTS.put(customerRecordKey(bid,p.id),JSON.stringify(record));
  let ids=[];try{ids=JSON.parse(await env.TURFOS_ACCOUNTS.get(businessCustomerIndexKey(bid))||'[]')}catch(e){}
  if(!ids.includes(String(p.id)))ids.push(String(p.id));
  await env.TURFOS_ACCOUNTS.put(businessCustomerIndexKey(bid),JSON.stringify(ids));
}
function propertyFromCustomerRecord(r){return{id:String(r.propertyId),name:r.name||'Customer',street:r.serviceAddress||'',addr:r.serviceAddress||'',email:r.email||'',phone:r.phone||'',billingAddress:r.billingAddress||r.serviceAddress||'',billingCity:r.billingCity||'',billingState:r.billingState||'',billingZip:r.billingZip||'',invoicePreference:r.invoicePreference||'Email',serviceNotes:r.serviceNotes||'',customerPortalId:r.customerPortalId||'',sqft:+r.sqft||0,customPrice:r.customPrice??null,serviceDay:r.serviceDay??null,visits:Array.isArray(r.visits)?r.visits:[],inv:Array.isArray(r.inv)?r.inv:[],msgs:Array.isArray(r.msgs)?r.msgs:[],zones:[],obstacles:[],probs:[],autoInvoice:true,useParcelMow:true,autoLines:true,customerCreatedAt:r.createdAt||new Date().toISOString()}}
async function hydrateBusinessCustomers(env,bid,ws){
  ws=ws&&typeof ws==='object'?ws:{};ws.bp=Array.isArray(ws.bp)?ws.bp:[];let ids=[];try{ids=JSON.parse(await env.TURFOS_ACCOUNTS.get(businessCustomerIndexKey(bid))||'[]')}catch(e){}
  let changed=false;
  for(const id of ids){const raw=await env.TURFOS_ACCOUNTS.get(customerRecordKey(bid,id));if(!raw)continue;let r;try{r=JSON.parse(raw)}catch(e){continue}
    let p=ws.bp.find(q=>String(q.id)===String(r.propertyId));if(!p&&r.email)p=ws.bp.find(q=>normEmail(q.email)===normEmail(r.email));if(!p&&r.serviceAddress)p=ws.bp.find(q=>normAddress(q.street||q.addr)===normAddress(r.serviceAddress));
    if(!p){ws.bp.push(propertyFromCustomerRecord(r));changed=true;continue}
    const fields={name:r.name||p.name,email:r.email||p.email,phone:r.phone||p.phone,street:r.serviceAddress||p.street,addr:r.serviceAddress||p.addr,billingAddress:r.billingAddress||p.billingAddress,billingCity:r.billingCity||p.billingCity,billingState:r.billingState||p.billingState,billingZip:r.billingZip||p.billingZip,invoicePreference:r.invoicePreference||p.invoicePreference,serviceNotes:r.serviceNotes??p.serviceNotes,customerPortalId:r.customerPortalId||p.customerPortalId};
    for(const [k,v] of Object.entries(fields)){if(v!==undefined&&p[k]!==v){p[k]=v;changed=true}}
    if((!Array.isArray(p.visits)||!p.visits.length)&&Array.isArray(r.visits)&&r.visits.length){p.visits=r.visits;changed=true}
    if((!Array.isArray(p.inv)||!p.inv.length)&&Array.isArray(r.inv)&&r.inv.length){p.inv=r.inv;changed=true}
    if((!Array.isArray(p.msgs)||!p.msgs.length)&&Array.isArray(r.msgs)&&r.msgs.length){p.msgs=r.msgs;changed=true}
  }
  return{ws,changed}
}
async function getCustomerProperty(env,bid,pid,ws){
  ws.bp=Array.isArray(ws.bp)?ws.bp:[];let p=ws.bp.find(q=>String(q.id)===String(pid));if(p)return p;
  const raw=await env.TURFOS_ACCOUNTS.get(customerRecordKey(bid,pid));if(!raw)return null;try{p=propertyFromCustomerRecord(JSON.parse(raw));ws.bp.push(p);await env.TURFOS_ACCOUNTS.put('workspace:'+bid,JSON.stringify(ws));return p}catch(e){return null}
}
async function customerRoute(request,env,url){
  if(!env.TURFOS_ACCOUNTS)return kvMissing();
  if(url.pathname==='/api/customer/signup'&&request.method==='POST'){
    const d=await readJson(request),businessCode=String(d.businessCode||'').trim().toUpperCase(),name=String(d.name||'').trim(),email=normEmail(d.email),phone=String(d.phone||'').trim(),address=String(d.address||'').trim(),billingAddress=String(d.billingAddress||'').trim(),serviceNotes=String(d.serviceNotes||'').trim(),password=String(d.password||'');
    if(!businessCode||!name||!email||!address||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return Response.json({error:'Company code, name, valid email, and service address are required.'},{status:400});
    if(password.length<8)return Response.json({error:'Password must be at least 8 characters.'},{status:400});
    const owner=await findBusinessByCode(env,businessCode);if(!owner)return Response.json({error:'Company code was not found. Ask your lawn company for the code shown in TurfOS Settings.'},{status:404});
    const bid=owner.businessId||owner.id,acctKey=customerAccountKey(bid,email);if(await env.TURFOS_ACCOUNTS.get(acctKey))return Response.json({error:'A customer account already exists for this email. Use Log in instead.'},{status:409});
    const wsKey='workspace:'+bid,raw=await env.TURFOS_ACCOUNTS.get(wsKey);if(!raw)return Response.json({error:'This business has not finished setting up its TurfOS workspace yet. Ask the company to sign in once, then try again.'},{status:409});
    let ws=JSON.parse(raw);({ws}=await hydrateBusinessCustomers(env,bid,ws));ws.bp=Array.isArray(ws.bp)?ws.bp:[];
    const ad=normAddress(address),phn=phoneDigits(phone);let p=ws.bp.find(q=>normEmail(q.email)===email)||ws.bp.find(q=>ad&&normAddress(q.street||q.addr)===ad)||ws.bp.find(q=>phn&&phn.length>=7&&phoneDigits(q.phone)===phn);
    if(!p){p={id:Date.now().toString()+Math.random().toString(36).slice(2,6),name,street:address,addr:address,email,phone,billingAddress:billingAddress||address,billingCity:'',billingState:'',billingZip:'',invoicePreference:'Email',serviceNotes,customerPortalId:'CUST-'+Math.random().toString(36).slice(2,8).toUpperCase(),sqft:0,visits:[],inv:[],msgs:[],zones:[],obstacles:[],probs:[],autoInvoice:true,useParcelMow:true,autoLines:true,customerCreatedAt:new Date().toISOString()};ws.bp.push(p)}else{p.name=name||p.name;p.email=email;p.phone=phone||p.phone;p.street=address||p.street;p.addr=address||p.addr;p.billingAddress=billingAddress||p.billingAddress||address;p.serviceNotes=serviceNotes||p.serviceNotes;p.customerPortalId=p.customerPortalId||('CUST-'+Math.random().toString(36).slice(2,8).toUpperCase())}
    const ph=await hashPassword(password),ca={id:crypto.randomUUID(),businessId:bid,propertyId:String(p.id),email,salt:ph.salt,passwordHash:ph.hash,createdAt:new Date().toISOString()};
    await env.TURFOS_ACCOUNTS.put(acctKey,JSON.stringify(ca));await env.TURFOS_ACCOUNTS.put(wsKey,JSON.stringify(ws));await persistCustomerRecord(env,bid,p);await env.TURFOS_ACCOUNTS.put('custidx:'+String(p.customerPortalId).toUpperCase(),JSON.stringify({businessId:bid,propertyId:String(p.id),email}));
    const t=token(),sess={businessId:bid,propertyId:String(p.id),email};await env.TURFOS_ACCOUNTS.put('custsess:'+t,JSON.stringify(sess),{expirationTtl:AUTH_SESSION_TTL});return Response.json({ok:true,token:t,...publicCustomer(ws,p,bid)})
  }
  if(url.pathname==='/api/customer/login'&&request.method==='POST'){
    const d=await readJson(request),businessCode=String(d.businessCode||'').trim().toUpperCase(),email=normEmail(d.email),password=String(d.password||'');if(!businessCode||!email||!password)return Response.json({error:'Company code, email, and password are required.'},{status:400});
    const owner=await findBusinessByCode(env,businessCode);if(!owner)return Response.json({error:'Company code is incorrect.'},{status:401});const bid=owner.businessId||owner.id,rawAcct=await env.TURFOS_ACCOUNTS.get(customerAccountKey(bid,email));if(!rawAcct)return Response.json({error:'Email or password is incorrect, or this customer has not signed up yet.'},{status:401});
    const ca=JSON.parse(rawAcct),ph=await hashPassword(password,ca.salt);if(ph.hash!==ca.passwordHash)return Response.json({error:'Email or password is incorrect.'},{status:401});
    const key='workspace:'+bid,raw=await env.TURFOS_ACCOUNTS.get(key);if(!raw)return Response.json({error:'Customer workspace is unavailable.'},{status:404});let ws=JSON.parse(raw);({ws}=await hydrateBusinessCustomers(env,bid,ws));const p=await getCustomerProperty(env,bid,ca.propertyId,ws);if(!p)return Response.json({error:'Customer property was not found.'},{status:404});const t=token(),sess={businessId:bid,propertyId:String(p.id),email};await env.TURFOS_ACCOUNTS.put('custsess:'+t,JSON.stringify(sess),{expirationTtl:AUTH_SESSION_TTL});return Response.json({ok:true,token:t,...publicCustomer(ws,p,bid)})
  }
  const sess=await customerSession(request,env);if(!sess)return Response.json({error:'Your customer session expired. Please log in again.'},{status:401});const key='workspace:'+sess.businessId,raw=await env.TURFOS_ACCOUNTS.get(key);if(!raw)return Response.json({error:'Customer workspace is unavailable.'},{status:404});let ws=JSON.parse(raw);({ws}=await hydrateBusinessCustomers(env,sess.businessId,ws));const p=await getCustomerProperty(env,sess.businessId,sess.propertyId,ws);if(!p)return Response.json({error:'Customer property was not found.'},{status:404});
  if(url.pathname==='/api/customer/me'&&request.method==='GET')return Response.json({ok:true,...publicCustomer(ws,p,sess.businessId)},{headers:{'Cache-Control':'no-store'}});
  if(url.pathname==='/api/customer/logout'&&request.method==='POST'){await env.TURFOS_ACCOUNTS.delete('custsess:'+sess.token);return Response.json({ok:true})}
  if(url.pathname==='/api/customer/profile'&&request.method==='PATCH'){
    const d=await readJson(request),oldEmail=normEmail(sess.email||p.email),newEmail=normEmail(d.email||p.email);if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail))return Response.json({error:'Enter a valid email address.'},{status:400});
    p.name=String(d.name||p.name).trim();p.email=newEmail;p.phone=String(d.phone??p.phone??'').trim();p.billingAddress=String(d.billingAddress||p.billingAddress||p.street||'').trim();p.serviceNotes=String(d.serviceNotes??p.serviceNotes??'').trim();
    if(newEmail!==oldEmail){const oldKey=customerAccountKey(sess.businessId,oldEmail),acctRaw=await env.TURFOS_ACCOUNTS.get(oldKey);if(acctRaw){const ca=JSON.parse(acctRaw);ca.email=newEmail;await env.TURFOS_ACCOUNTS.put(customerAccountKey(sess.businessId,newEmail),JSON.stringify(ca));await env.TURFOS_ACCOUNTS.delete(oldKey)}sess.email=newEmail;await env.TURFOS_ACCOUNTS.put('custsess:'+sess.token,JSON.stringify({businessId:sess.businessId,propertyId:sess.propertyId,email:newEmail}),{expirationTtl:AUTH_SESSION_TTL})}
    await env.TURFOS_ACCOUNTS.put(key,JSON.stringify(ws));await persistCustomerRecord(env,sess.businessId,p);await env.TURFOS_ACCOUNTS.put('custidx:'+String(p.customerPortalId||'').toUpperCase(),JSON.stringify({businessId:sess.businessId,propertyId:String(p.id),email:p.email}));return Response.json({ok:true,...publicCustomer(ws,p,sess.businessId)})
  }
  if(url.pathname==='/api/customer/message'&&request.method==='POST'){const d=await readJson(request),text=String(d.text||'').trim();if(!text)return Response.json({error:'Message cannot be empty.'},{status:400});p.msgs=Array.isArray(p.msgs)?p.msgs:[];p.msgs.push({from:'cust',t:text,date:new Date().toLocaleDateString('en-CA')});await env.TURFOS_ACCOUNTS.put(key,JSON.stringify(ws));await persistCustomerRecord(env,sess.businessId,p);return Response.json({ok:true,...publicCustomer(ws,p,sess.businessId)})}
  return Response.json({error:'Customer route not found.'},{status:404})
}

async function workspaceRoute(request,env){
  if(!env.TURFOS_ACCOUNTS)return kvMissing();const x=await sessionAccount(request,env);if(!x)return Response.json({error:'Please sign in again.'},{status:401});const a=x.account,bid=a.businessId||a.id,key='workspace:'+bid;
  if(request.method==='GET'){const raw=await env.TURFOS_ACCOUNTS.get(key);if(!raw)return Response.json({ok:true,workspace:null});try{let ws=JSON.parse(raw);const h=await hydrateBusinessCustomers(env,bid,ws);ws=h.ws;if(h.changed){ws.cloudUpdatedAt=new Date().toISOString();await env.TURFOS_ACCOUNTS.put(key,JSON.stringify(ws))}return Response.json({ok:true,workspace:ws},{headers:{'Cache-Control':'no-store'}})}catch(e){return Response.json({error:'Cloud workspace is unreadable.'},{status:500})}}
  if(request.method==='PUT'){const d=await readJson(request),ws=d.workspace;if(!ws||typeof ws!=='object'||!Array.isArray(ws.bp))return Response.json({error:'Invalid workspace data.'},{status:400});let final=ws;if((a.role||'owner')==='crew'){const old=await env.TURFOS_ACCOUNTS.get(key);if(old)try{const existing=JSON.parse(old);final={...ws,set:existing.set||ws.set}}catch(e){}}const h=await hydrateBusinessCustomers(env,bid,final);final=h.ws;final.cloudUpdatedAt=new Date().toISOString();const raw=JSON.stringify(final),bytes=new TextEncoder().encode(raw).byteLength;if(bytes>20*1024*1024)return Response.json({error:'Workspace is too large for cloud sync. Export old completion photos or move media to object storage.'},{status:413});await env.TURFOS_ACCOUNTS.put(key,raw);for(const p of (final.bp||[])){if(p?.email&&p?.customerPortalId){await env.TURFOS_ACCOUNTS.put('custidx:'+String(p.customerPortalId).toUpperCase(),JSON.stringify({businessId:bid,propertyId:String(p.id),email:normEmail(p.email)}));await persistCustomerRecord(env,bid,p)}}return Response.json({ok:true,updatedAt:final.cloudUpdatedAt,workspace:final})}
  return new Response('Method not allowed',{status:405,headers:{Allow:'GET, PUT'}})
}

async function sendInvoice(request,env){
  try{
    if(!env.RESEND_API_KEY)return Response.json({error:'Email is not configured yet: add RESEND_API_KEY in Cloudflare Settings > Variables and Secrets.'},{status:503});
    const body=await request.json(),customer=body.customer||{},invoice=body.invoice||{},business=body.business||{};
    if(!customer.email||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email))return Response.json({error:'Valid customer email required.'},{status:400});
    const from=env.INVOICE_FROM_EMAIL||'TurfOS <onboarding@resend.dev>';
    const replyTo=(business.email&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(business.email))?business.email:'turfos.business@gmail.com';
    const payment=body.paymentLink?`<p style="margin:24px 0"><a href="${esc(body.paymentLink)}" style="background:#67B83F;color:white;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">Pay invoice</a></p>`:'';
    const proof=proofAttachment(body.proofPhotoDataUrl);
    const html=`<!doctype html><html><body style="margin:0;background:#F5F7F2;font-family:Arial,sans-serif;color:#17221B"><div style="max-width:620px;margin:32px auto;background:#fff;border:1px solid #DDE4DB;border-radius:14px;overflow:hidden"><div style="background:#17221B;color:#fff;padding:24px"><div style="font-size:13px;opacity:.8;text-transform:uppercase;letter-spacing:.08em">TurfOS invoice</div><h1 style="margin:6px 0 0;font-size:26px">${esc(business.name||'TurfOS Lawn Care')}</h1></div><div style="padding:26px"><p>Hi ${esc(customer.name||'there')},</p><p>Your lawn service has been completed. Here is your invoice.</p><table style="width:100%;border-collapse:collapse;margin:18px 0"><tr><td style="padding:10px 0;color:#718078">Invoice</td><td style="padding:10px 0;text-align:right;font-weight:700">${esc(invoice.id||'')}</td></tr><tr><td style="padding:10px 0;color:#718078">Service date</td><td style="padding:10px 0;text-align:right">${esc(invoice.date||'')}</td></tr><tr><td style="padding:10px 0;color:#718078">Property</td><td style="padding:10px 0;text-align:right">${esc(customer.address||'')}</td></tr><tr><td style="padding:10px 0;color:#718078">Service</td><td style="padding:10px 0;text-align:right">${esc(invoice.description||'Lawn mowing service')}</td></tr><tr style="border-top:2px solid #DDE4DB"><td style="padding:14px 0;font-weight:700">Amount due</td><td style="padding:14px 0;text-align:right;font-size:22px;font-weight:800">$${money(invoice.amount)}</td></tr></table>${payment}${proof?'<p style="color:#718078;font-size:13px">A job-completion photo is attached as proof of completed service.</p>':''}${body.mowerSetting?`<p style="color:#718078;font-size:13px">Recorded mower deck setting: ${esc(body.mowerSetting)}</p>`:''}<p style="margin-top:28px;color:#718078;font-size:13px">Questions? Reply to this email to contact ${esc(replyTo)}.</p></div></div></body></html>`;
    const req={from,to:[customer.email],subject:`Invoice ${invoice.id||''} from ${business.name||'TurfOS Lawn Care'}`,html,reply_to:[replyTo]};
    if(proof)req.attachments=[proof];
    const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`turfos-${invoice.id||Date.now()}`},body:JSON.stringify(req)});
    const data=await res.json().catch(()=>({}));
    if(!res.ok){let msg=data.message||data.name||'Email provider rejected the invoice.';if(res.status===403&&/domain|verify|testing/i.test(JSON.stringify(data)))msg+=' Verify a sending domain in Resend and set INVOICE_FROM_EMAIL in Cloudflare.';return Response.json({error:msg,details:data},{status:res.status});}
    return Response.json({ok:true,id:data.id||''});
  }catch(e){return Response.json({error:e?.message||'Could not send invoice email.'},{status:500});}
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);

    // One-time legacy migration endpoint. This is the only route that talks to Workers KV.
    if(url.pathname==='/api/d1/migrate'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{Allow:'POST'}});
      return migrateLegacyKvToD1(request,env);
    }

    if(url.pathname==='/api/auth-health'){
      let d1='missing',records=0,migration=null;
      if(env.DB){
        try{await ensureD1(env);records=await d1Count(env);d1='ready';const m=await env.DB.prepare("SELECT completed_at,detail FROM turfos_migrations WHERE name='kv-to-d1'").first();if(m)migration={completedAt:m.completed_at,detail:m.detail?JSON.parse(m.detail):null}}catch(e){d1='error: '+(e?.message||String(e))}
      }
      return Response.json({worker:true,primaryStorage:'D1',d1,records,legacyKvConnected:!!env.TURFOS_ACCOUNTS,migration},{headers:{'Cache-Control':'no-store'}});
    }

    // All TurfOS application account/customer/workspace traffic uses D1.
    const needsData=url.pathname==='/api/public/business'||url.pathname.startsWith('/api/auth/')||url.pathname.startsWith('/api/customer/')||url.pathname==='/api/workspace';
    let appEnv=env;
    if(needsData){
      if(!env.DB)return kvMissing();
      try{const store=await makeD1Store(env);appEnv=appEnvWithD1(env,store)}catch(e){return Response.json({error:'D1 database error: '+(e?.message||String(e))},{status:503,headers:{'Cache-Control':'no-store'}})}
    }

    if(url.pathname==='/api/public/business'&&request.method==='GET'){
      try{const a=await findBusinessByCode(appEnv,url.searchParams.get('code')||'');if(!a)return Response.json({error:'Business not found.'},{status:404,headers:{'Cache-Control':'no-store'}});return Response.json({ok:true,business:{companyName:a.companyName||'Lawn Company',serviceArea:a.serviceArea||'',businessCode:businessCodeFor(a)}},{headers:{'Cache-Control':'no-store'}})}catch(e){return Response.json({error:'Could not load business.'},{status:500})}
    }
    if(url.pathname.startsWith('/api/auth/')){
      try{return await authRoute(request,appEnv,url)}
      catch(e){return Response.json({error:'Business account server error: '+(e?.message||String(e)),code:e?.name||'Error'},{status:500,headers:{'Cache-Control':'no-store'}})}
    }
    if(url.pathname.startsWith('/api/customer/')){
      try{return await customerRoute(request,appEnv,url)}
      catch(e){return Response.json({error:'Customer account server error: '+(e?.message||String(e)),code:e?.name||'Error'},{status:500,headers:{'Cache-Control':'no-store'}})}
    }
    if(url.pathname==='/api/workspace'){try{return await workspaceRoute(request,appEnv)}catch(e){return Response.json({error:'Workspace server error: '+(e?.message||String(e))},{status:500})}}
    if(url.pathname==='/api/email-health'){
      return Response.json({worker:true,apiKey:!!env.RESEND_API_KEY,fromEmail:!!env.INVOICE_FROM_EMAIL,replyTo:'turfos.business@gmail.com'},{headers:{'Cache-Control':'no-store'}});
    }
    if(url.pathname==='/api/send-invoice'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{Allow:'POST'}});
      return sendInvoice(request,env);
    }
    return env.ASSETS.fetch(request);
  }
};
