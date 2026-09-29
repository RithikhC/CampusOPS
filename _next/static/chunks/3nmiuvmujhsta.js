(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,76093,e=>{"use strict";var t=e.i(80505),n=e.i(21795),a=e.i(84496),s=e.i(93219);async function l(e,t,n,a){await e.query("insert into audit_log (actor, action, detail) values ($1, $2, $3)",[t.id,n,a])}async function r(e,t,n,a){let r=await e.query(`update scans set resolved_at = now(), resolved_by = $2, resolution_note = $3
      where id = $1 and resolved_at is null and result in ('${s.FLAG_RESULTS.join("','")}')
      returning id`,[n,t.id,a.trim()||"Reviewed"]);return r.length&&await l(e,t,"resolve_flag",`scan ${n}: ${a}`),r.length>0}async function i(e,t,s,r){let i=/^(\d{1,2}):(\d{2})$/.exec(r),o=await (0,n.getRollCall)(e,s);if(!i||!o)return null;let[d,c]=[Number(i[1]),Number(i[2])];if(d>23||c>59)return null;let u=Date.parse(o.startsAt),m=+(d<(0,a.campusHour)(u)&&d<12),f=(0,a.campusTime)(u,d,c,m);return await e.query("update roll_calls set curfew_at = $2 where id = $1",[s,new Date(f)]),await l(e,t,"set_curfew",`roll call ${s} set to ${r}`),(0,n.getRollCall)(e,s)}async function o(e,t){let a=Date.now(),s=await (0,n.getOrCreateActiveRollCall)(e,a);await e.query("update roll_calls set ends_at = $2 where id = $1",[s.id,new Date(a)]);let r=(0,n.defaultRollCallWindow)(a),i=await (0,n.insertRollCall)(e,{...r,startsAt:a},t.id);return await l(e,t,"start_roll_call",i.name),i}async function d(e,n,a){let s=(0,t.parseCsv)(a),r={added:0,updated:0,errors:[]};if(0===s.length)return{...r,errors:["The file is empty"]};let i=s[0].map(e=>e.trim().toLowerCase()),o=e=>i.indexOf(e),d=["id","name","email","hostel","room"].filter(e=>-1===o(e));if(d.length)return{...r,errors:[`Missing column(s): ${d.join(", ")}`]};for(let[t,n]of s.slice(1).entries()){let a=t+2,s=e=>-1===o(e)?"":(n[o(e)]??"").trim(),l=s("id").toUpperCase(),i=!["false","no","0","inactive"].includes(s("active").toLowerCase());if(!/^[A-Z0-9]{4,20}$/.test(l)){r.errors.push(`Line ${a}: invalid ID "${s("id")}"`);continue}if(!s("name")||!s("email").includes("@")||!s("hostel")||!s("room")){r.errors.push(`Line ${a}: name, email, hostel and room are required`);continue}try{let[t]=await e.query(`insert into students (id, name, email, hostel, room, active) values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update set name = excluded.name, email = excluded.email,
           hostel = excluded.hostel, room = excluded.room, active = excluded.active
         returning (xmax = 0) as inserted`,[l,s("name"),s("email").toLowerCase(),s("hostel"),s("room"),i]);t.inserted?r.added++:r.updated++}catch(e){r.errors.push(`Line ${a}: ${e.message}`)}}return await l(e,n,"import_roster",`${r.added} added, ${r.updated} updated, ${r.errors.length} errors`),r}var c=e.i(47167),u=e.i(14582),m=e.i(46780);let f=function(){let e=c.default.env.QR_SIGNING_KEY;if(e)return(0,m.fromHex)(e);if("false"===c.default.env.DEMO_MODE)throw Error("QR_SIGNING_KEY must be set in production");return(0,u.sha256)(new TextEncoder().encode("nightpass-development-signing-key"))}(),p={qrSigningKey:f,qrPublicKeyHex:(0,m.toHex)((0,m.publicKeyFor)(f)),demoMode:"false"!==c.default.env.DEMO_MODE,databaseUrl:c.default.env.DATABASE_URL},_=`
create table if not exists students (
  id          text primary key,              -- university ID, e.g. 2024A7PS0112U
  name        text not null,
  email       text not null unique,
  hostel      text not null,
  room        text not null,
  active      boolean not null default true, -- inactive = graduated / withdrawn; their passes stop working
  created_at  timestamptz not null default now()
);

create table if not exists staff (
  id     text primary key,
  name   text not null,
  email  text not null unique,
  role   text not null check (role in ('guard', 'admin')),
  title  text not null default ''
);

create table if not exists checkpoints (
  id      text primary key,
  name    text not null,
  hostel  text
);

-- One row per night. Scans belong to the roll call that was active when they happened.
create table if not exists roll_calls (
  id          integer generated always as identity primary key,
  name        text not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  curfew_at   timestamptz not null,
  created_by  text,
  created_at  timestamptz not null default now()
);

-- Every scan attempt is kept, including rejected ones: that is the audit trail.
create table if not exists scans (
  id               integer generated always as identity primary key,
  client_id        text not null unique,        -- generated on the scanner; makes offline sync idempotent
  roll_call_id     integer not null references roll_calls(id) on delete cascade,
  student_id       text references students(id) on delete set null,
  claimed_id       text,                        -- ID read from the code, kept even if not on the roster
  checkpoint_id    text references checkpoints(id),
  scanned_by       text not null,
  method           text not null check (method in ('qr', 'manual')),
  result           text not null check (result in ('valid', 'late', 'manual', 'duplicate', 'expired', 'invalid', 'unknown')),
  reason           text not null,
  scanned_at       timestamptz not null,        -- when the guard scanned (device time)
  received_at      timestamptz not null default now(),
  offline          boolean not null default false,
  resolved_at      timestamptz,
  resolved_by      text,
  resolution_note  text
);

-- A student can be marked present at most once per roll call, even if two gates scan at the same instant.
create unique index if not exists scans_one_presence
  on scans (roll_call_id, student_id) where result in ('valid', 'late', 'manual');
create index if not exists scans_by_roll_call on scans (roll_call_id, scanned_at desc);
create index if not exists scans_by_student on scans (student_id, roll_call_id);

create table if not exists audit_log (
  id      integer generated always as identity primary key,
  at      timestamptz not null default now(),
  actor   text not null,
  action  text not null,
  detail  text not null default ''
);
`;var h=e.i(74098);async function w(e){await e.exec(_);let[{count:t}]=await e.query("select count(*)::int as count from students");0===t&&await (0,h.seedDemoData)(e)}let y=`('${s.PRESENT_RESULTS.join("','")}')`,g=`('${s.FLAG_RESULTS.join("','")}')`,$=new Map,v=e=>e?new Date(e).toISOString():null;async function b(e,t){let a=Date.now(),[s]=await e.query("select id, name, email, hostel, room from students where id = $1 and active",[t]);if(!s)return null;let l=await (0,n.getOrCreateActiveRollCall)(e,a),[r]=await e.query(`select s.result, s.scanned_at, c.name as checkpoint
       from scans s left join checkpoints c on c.id = s.checkpoint_id
      where s.roll_call_id = $1 and s.student_id = $2 and s.result in ${y}
      limit 1`,[l.id,t]),i=await e.query(`select rc.name, rc.starts_at, s.result, s.scanned_at
       from roll_calls rc
       left join scans s on s.roll_call_id = rc.id and s.student_id = $1 and s.result in ${y}
      where rc.id <> $2 and rc.starts_at < $3
      order by rc.starts_at desc limit 6`,[t,l.id,new Date(a)]),o=(0,m.periodAt)(a)-1,d=Array.from({length:1200/m.PERIOD_SECONDS},(e,n)=>{var a;let s,l;return{period:o+n,code:(a=o+n,s=`${t}.${a}`,(l=$.get(s))||(l=(0,m.signPass)(t,a,p.qrSigningKey),$.size>2e4&&$.clear(),$.set(s,l)),l)}});return{student:s,rollCall:l,status:r?{result:r.result,at:v(r.scanned_at),checkpoint:r.checkpoint}:null,codes:d,periodSeconds:m.PERIOD_SECONDS,serverNow:a,history:i.map(e=>({name:e.name,startsAt:v(e.starts_at),result:e.result,at:v(e.scanned_at)}))}}async function x(e){let t=Date.now(),a=await (0,n.getOrCreateActiveRollCall)(e,t),[s,l,r,[{count:i}]]=await Promise.all([e.query("select id, name from checkpoints order by hostel nulls last, name"),e.query("select id, name, hostel, room from students where active order by name"),e.query(`select s.student_id, s.scanned_at, c.name as checkpoint
         from scans s left join checkpoints c on c.id = s.checkpoint_id
        where s.roll_call_id = $1 and s.result in ${y}`,[a.id]),e.query(`select count(*)::int as count from scans where roll_call_id = $1 and result in ${g} and resolved_at is null`,[a.id])]);return{rollCall:a,checkpoints:s,roster:l,present:r.map(e=>({studentId:e.student_id,at:v(e.scanned_at),checkpoint:e.checkpoint??"another gate"})),publicKeyHex:p.qrPublicKeyHex,serverNow:t,flagsOpen:i}}let k=`
  select s.id, s.scanned_at, s.received_at, s.result, s.reason, s.method, s.offline, s.student_id, s.claimed_id,
         st.name as student_name, st.hostel, st.room, c.name as checkpoint, sf.name as scanned_by,
         rc.name as roll_call, s.resolved_at, rs.name as resolved_by, s.resolution_note
    from scans s
    join roll_calls rc on rc.id = s.roll_call_id
    left join students st on st.id = s.student_id
    left join checkpoints c on c.id = s.checkpoint_id
    left join staff sf on sf.id = s.scanned_by
    left join staff rs on rs.id = s.resolved_by`;function S(e){return{id:e.id,scannedAt:v(e.scanned_at),receivedAt:v(e.received_at),result:e.result,reason:e.reason,method:e.method,offline:e.offline,studentId:e.student_id,claimedId:e.claimed_id,studentName:e.student_name,hostel:e.hostel,room:e.room,checkpoint:e.checkpoint,scannedBy:e.scanned_by,rollCall:e.roll_call,resolvedAt:v(e.resolved_at),resolvedBy:e.resolved_by,resolutionNote:e.resolution_note}}async function I(e,t){let a=Date.now(),l=t?await (0,n.getRollCall)(e,t):await (0,n.getOrCreateActiveRollCall)(e,a);if(!l)return null;let[r,i,o,d,c,u,m,f]=await Promise.all([(0,n.listRollCalls)(e),e.query(`select st.hostel, count(*)::int as expected, count(p.student_id)::int as present
         from students st
         left join scans p on p.student_id = st.id and p.roll_call_id = $1 and p.result in ${y}
        where st.active
        group by st.hostel order by st.hostel`,[l.id]),e.query(`select result, count(*)::int as total, count(*) filter (where resolved_at is null)::int as open
         from scans where roll_call_id = $1 group by result`,[l.id]),e.query(`select scanned_at from scans where roll_call_id = $1 and result in ${y} order by scanned_at`,[l.id]),e.query(`select rc.id, rc.name, rc.starts_at,
              count(s.id) filter (where s.result in ${y})::int as present,
              count(s.id) filter (where s.result = 'late')::int as late
         from roll_calls rc left join scans s on s.roll_call_id = rc.id
        where rc.starts_at <= $1
        group by rc.id order by rc.starts_at desc limit 7`,[new Date(Date.parse(l.startsAt))]),e.query(`${k} where s.roll_call_id = $1 order by s.scanned_at desc limit 40`,[l.id]),e.query(`${k} where s.roll_call_id = $1 and s.result in ${g} and s.resolved_at is null
       order by s.scanned_at desc limit 100`,[l.id]),e.query(`select st.id, st.name, st.email, st.hostel, st.room,
              a.result as attempt_result, a.scanned_at as attempt_at, a.reason as attempt_reason
         from students st
         left join lateral (
           select result, scanned_at, reason from scans
            where roll_call_id = $1 and student_id = st.id order by scanned_at desc limit 1
         ) a on true
        where st.active and not exists (
          select 1 from scans p where p.roll_call_id = $1 and p.student_id = st.id and p.result in ${y}
        )
        order by (a.result is null), st.hostel, st.name`,[l.id])]),p=e=>o.find(t=>t.result===e),_=i.reduce((e,t)=>e+t.expected,0),h=i.reduce((e,t)=>e+t.present,0);return{rollCall:l,rollCalls:r,isLive:Date.parse(l.startsAt)<=a&&Date.parse(l.endsAt)>a,stats:{expected:_,present:h,missing:_-h,late:p("late")?.total??0,manual:p("manual")?.total??0,flagsOpen:o.filter(e=>s.FLAG_RESULTS.includes(e.result)).reduce((e,t)=>e+t.open,0),rejected:o.filter(e=>!s.PRESENT_RESULTS.includes(e.result)).reduce((e,t)=>e+t.total,0)},byHostel:i,arrivals:function(e){if(0===e.length)return[];let t=9e5*Math.floor(e[0]/9e5),n=9e5*Math.floor(e[e.length-1]/9e5),a=new Map;for(let e=t;e<=n;e+=9e5)a.set(e,0);for(let t of e){let e=9e5*Math.floor(t/9e5);a.set(e,(a.get(e)??0)+1)}return[...a].map(([e,t])=>({at:new Date(e).toISOString(),count:t}))}(d.map(e=>new Date(e.scanned_at).getTime())),trend:c.reverse().map(e=>({id:e.id,name:e.name,startsAt:v(e.starts_at),present:e.present,late:e.late})),feed:u.map(S),flags:m.map(S),missing:f.map(e=>({id:e.id,name:e.name,email:e.email,hostel:e.hostel,room:e.room,lastAttempt:e.attempt_result?{result:e.attempt_result,at:v(e.attempt_at),reason:e.attempt_reason??""}:null}))}}function A(e){let t=Number(e.get("rollCallId"));return{q:e.get("q")??void 0,result:e.get("result")??void 0,hostel:e.get("hostel")??void 0,rollCallId:Number.isInteger(t)&&t>0?t:void 0,from:e.get("from")??void 0,to:e.get("to")??void 0}}async function q(e,t){let n=[],a=[],s=(e,t)=>{a.push(t),n.push(e(`$${a.length}`))};return t.q?.trim()&&s(e=>`(st.name ilike ${e} or s.student_id ilike ${e} or s.claimed_id ilike ${e} or st.room ilike ${e})`,`%${t.q.trim()}%`),"present"===t.result?n.push(`s.result in ${y}`):"flagged"===t.result?n.push(`s.result in ${g}`):"open"===t.result?n.push(`s.result in ${g} and s.resolved_at is null`):t.result&&s(e=>`s.result = ${e}`,t.result),t.hostel&&s(e=>`st.hostel = ${e}`,t.hostel),t.rollCallId&&s(e=>`s.roll_call_id = ${e}`,t.rollCallId),t.from&&!Number.isNaN(Date.parse(t.from))&&s(e=>`s.scanned_at >= ${e}`,new Date(t.from)),t.to&&!Number.isNaN(Date.parse(t.to))&&s(e=>`s.scanned_at < ${e}`,new Date(t.to)),a.push(Math.min(t.limit??300,1e4)),(await e.query(`${k} ${n.length?`where ${n.join(" and ")}`:""}
     order by s.scanned_at desc limit $${a.length}`,a)).map(S)}let D=(0,m.fromHex)(p.qrPublicKeyHex),C=`('${s.PRESENT_RESULTS.join("','")}')`;async function R(e,t){let[n]=await e.query("select id, name, hostel, room from students where id = $1 and active",[t]);return n}async function N(e,t,n){let[a]=await e.query(`select s.scanned_at, c.name as checkpoint
       from scans s left join checkpoints c on c.id = s.checkpoint_id
      where s.roll_call_id = $1 and s.student_id = $2 and s.result in ${C}
      limit 1`,[t,n]);return a?{atMs:new Date(a.scanned_at).getTime(),checkpoint:a.checkpoint??"another gate"}:void 0}async function E(e,t){let[n]=await e.query(`select s.result, s.reason, s.claimed_id, s.scanned_at, st.id, st.name, st.hostel, st.room
       from scans s left join students st on st.id = s.student_id
      where s.client_id = $1`,[t]);return n?{clientId:t,result:n.result,reason:n.reason,claimedId:n.claimed_id,student:n.id?{id:n.id,name:n.name,hostel:n.hostel,room:n.room}:null,scannedAt:new Date(n.scanned_at).toISOString()}:null}async function T(e,t,n,a,l){let r="qr"===t.method?(0,m.parsePass)(t.raw??"")?.studentId:t.studentId,i=r?await R(e,r):void 0,o=r?await N(e,n,r):void 0,d={nowMs:l,publicKey:D,curfewAtMs:a,findStudent:e=>e===r?i:void 0,findPresence:e=>e===r?o:void 0};return"qr"===t.method?(0,s.verifyPass)(t.raw??"",d):(0,s.verifyManual)(t.studentId??"",t.note??"",d)}async function O(e,t,a){let s=Date.now(),l=await (0,n.getOrCreateActiveRollCall)(e,s),r=Date.parse(l.curfewAt),i=new Set((await e.query("select id from checkpoints")).map(e=>e.id)),o=[];for(let n of a){let a=await E(e,n.clientId);if(a){o.push(a);continue}let d=Math.min(Math.max(n.scannedAt,s-864e5),s),c=i.has(n.checkpointId)?n.checkpointId:null;for(let a=0;a<2;a++){let s=await T(e,n,l.id,r,d);try{await e.query(`insert into scans (client_id, roll_call_id, student_id, claimed_id, checkpoint_id, scanned_by,
                              method, result, reason, scanned_at, offline)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,[n.clientId,l.id,s.student?.id??null,s.claimedId,c,t.id,n.method,s.result,s.reason,new Date(d),n.offline]),o.push({clientId:n.clientId,result:s.result,reason:s.reason,claimedId:s.claimedId,student:s.student,scannedAt:new Date(d).toISOString()});break}catch(s){if("object"!=typeof s||null===s||"23505"!==s.code||1===a)throw s;let t=await E(e,n.clientId);if(t){o.push(t);break}}}}return o}let P=Function("url","return import(url)");async function j(){let{PGlite:e}=await P("https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.8/dist/index.js");return e.create()}async function L(){let e=await j(),t={query:async(t,n=[])=>(await e.query(t,n)).rows,async exec(t){await e.exec(t)}};return await w(t),{handle:(e,n,a,s)=>K(t,e,n,a,s).catch(e=>M(500,{error:e.message})),passCode:(e,t=0)=>(0,m.signPass)(e,(0,m.periodAt)(Date.now())-t,p.qrSigningKey),reset:()=>(0,h.resetDemoData)(t)}}function M(e,t){return{status:e,contentType:"application/json",body:JSON.stringify(t)}}function U(e,t){return t.includes(e.role)}async function K(e,n,l,c,u){let m=new URL(c,"https://demo.local"),f=m.pathname.replace(/\/+$/,""),p=u?JSON.parse(u):{},_=M(403,{error:"Not allowed for your role"});if("/api/auth/logout"===f||"/api/auth/login"===f)return M(200,{redirect:"/"});if("/api/student/pass"===f&&"GET"===l){if(!U(n,["student"]))return _;let t=await b(e,n.id);return t?M(200,t):M(404,{error:"Your pass is not active"})}if("/api/guard/bootstrap"===f&&"GET"===l)return U(n,["guard","admin"])?M(200,await x(e)):_;if("/api/scans"===f&&"POST"===l){if(!U(n,["guard","admin"]))return _;let t=function(e){let t=e?.scans;if(!Array.isArray(t)||0===t.length||t.length>500)return null;let n=[];for(let e of t){if("string"!=typeof e.clientId||e.clientId.length>64||"qr"!==e.method&&"manual"!==e.method||"string"!=typeof e.checkpointId||"number"!=typeof e.scannedAt)return null;n.push({clientId:e.clientId,method:e.method,raw:"string"==typeof e.raw?e.raw.slice(0,512):void 0,studentId:"string"==typeof e.studentId?e.studentId.slice(0,32):void 0,note:"string"==typeof e.note?e.note.slice(0,200):void 0,checkpointId:e.checkpointId,scannedAt:e.scannedAt,offline:!!e.offline})}return n}(p);return t?M(200,{results:await O(e,n,t)}):M(400,{error:"Malformed scan batch"})}if(!f.startsWith("/api/admin/"))return M(404,{error:"Not found"});if(!U(n,["admin"]))return _;let w=Number(m.searchParams.get("rollCallId")),y=Number.isInteger(w)&&w>0?w:void 0;if("/api/admin/overview"===f){let t=await I(e,y);return t?M(200,t):M(404,{error:"Roll call not found"})}if("/api/admin/records"===f)return M(200,{records:await q(e,A(m.searchParams))});if("/api/admin/export"===f){let n;if("missing"===m.searchParams.get("kind")){let l=await I(e,y);n=(0,t.toCsv)(["Student ID","Name","Hostel","Room","Email","Last attempt","Attempt time","Attempt detail"],(l?.missing??[]).map(e=>[e.id,e.name,e.hostel,e.room,e.email,e.lastAttempt?s.RESULT_META[e.lastAttempt.result].label:"",e.lastAttempt?(0,a.formatClock)(e.lastAttempt.at):"",e.lastAttempt?.reason??""]))}else{let l=await q(e,{...A(m.searchParams),limit:1e4});n=(0,t.toCsv)(["Date","Time","Roll call","Student ID","Name","Hostel","Room","Checkpoint","Method","Result","Detail","Scanned by","Recorded offline","Resolved by","Resolution note"],l.map(e=>[(0,a.formatDate)(e.scannedAt),(0,a.formatClock)(e.scannedAt,!0),e.rollCall,e.studentId??e.claimedId??"",e.studentName??"",e.hostel??"",e.room??"",e.checkpoint??"",e.method,s.RESULT_META[e.result].label,e.reason,e.scannedBy??"",e.offline?"yes":"no",e.resolvedBy??"",e.resolutionNote??""]))}return{status:200,contentType:"text/csv; charset=utf-8",body:`\uFEFF${n}`}}let g=/^\/api\/admin\/flags\/(\d+)$/.exec(f);if(g&&"POST"===l)return await r(e,n,Number(g[1]),String(p.note??"").slice(0,500))?M(200,{ok:!0}):M(409,{error:"Already resolved or not a flag"});if("/api/admin/rollcall"===f&&"POST"===l){if("new"===p.action)return M(200,{rollCall:await o(e,n)});if("curfew"===p.action){let t=await i(e,n,Number(p.rollCallId),String(p.time));return t?M(200,{rollCall:t}):M(400,{error:"Invalid time"})}return M(400,{error:"Unknown action"})}return"/api/admin/roster"===f?"POST"===l?M(200,await d(e,n,String(p.csv??""))):M(200,{students:await e.query("select id, name, email, hostel, room, active from students order by hostel, name")}):"/api/admin/reset"===f&&"POST"===l?(await (0,h.resetDemoData)(e),M(200,{ok:!0})):M(404,{error:"Not found"})}e.s(["createBackend",0,L],76093)}]);