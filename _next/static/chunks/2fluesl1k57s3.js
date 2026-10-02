(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,76093,e=>{"use strict";var t=e.i(47167),n=e.i(14582),a=e.i(46780);let s=function(){let e=t.default.env.QR_SIGNING_KEY;if(e)return(0,a.fromHex)(e);if("false"===t.default.env.DEMO_MODE)throw Error("QR_SIGNING_KEY must be set in production");return(0,n.sha256)(new TextEncoder().encode("nightpass-development-signing-key"))}(),r={qrSigningKey:s,qrPublicKeyHex:(0,a.toHex)((0,a.publicKeyFor)(s)),demoMode:"false"!==t.default.env.DEMO_MODE,databaseUrl:t.default.env.DATABASE_URL};var i=e.i(80505),l=e.i(21795),o=e.i(6342);let d=new TextEncoder;function c(e,t,n){let s=`NR1.${(0,a.toBase64Url)(d.encode(`${e}
${t}`))}`;return`${s}.${(0,a.toBase64Url)(o.ed25519.sign(d.encode(s),n))}`}var u=e.i(84496),m=e.i(93219);async function h(e,t,n,a){await e.query("insert into audit_log (actor, action, detail) values ($1, $2, $3)",[t.id,n,a])}async function f(e,t,n,a){let s=await e.query(`update scans set resolved_at = now(), resolved_by = $2, resolution_note = $3
      where id = $1 and resolved_at is null and result in ('${m.FLAG_RESULTS.join("','")}')
      returning id`,[n,t.id,a.trim()||"Reviewed"]);return s.length&&await h(e,t,"resolve_flag",`scan ${n}: ${a}`),s.length>0}async function _(e,t,n,a){let s=/^(\d{1,2}):(\d{2})$/.exec(a),r=await (0,l.getRollCall)(e,n);if(!s||!r)return null;let[i,o]=[Number(s[1]),Number(s[2])];if(i>23||o>59)return null;let d=Date.parse(r.startsAt),c=+(i<(0,u.campusHour)(d)&&i<12),m=(0,u.campusTime)(d,i,o,c);return await e.query("update roll_calls set curfew_at = $2 where id = $1",[n,new Date(m)]),await h(e,t,"set_curfew",`roll call ${n} set to ${a}`),(0,l.getRollCall)(e,n)}async function p(e,t){let n=Date.now(),a=await (0,l.getOrCreateActiveRollCall)(e,n);await e.query("update roll_calls set ends_at = $2 where id = $1",[a.id,new Date(n)]);let s=(0,l.defaultRollCallWindow)(n),r=await (0,l.insertRollCall)(e,{...s,startsAt:n},t.id);return await h(e,t,"start_roll_call",r.name),r}async function w(e,t,n){let a=(0,i.parseCsv)(n),s={added:0,updated:0,errors:[]};if(0===a.length)return{...s,errors:["The file is empty"]};let r=a[0].map(e=>e.trim().toLowerCase()),l=e=>r.indexOf(e),o=["id","name","email","hostel","room"].filter(e=>-1===l(e));if(o.length)return{...s,errors:[`Missing column(s): ${o.join(", ")}`]};for(let[t,n]of a.slice(1).entries()){let a=t+2,r=e=>-1===l(e)?"":(n[l(e)]??"").trim(),i=r("id").toUpperCase(),o=!["false","no","0","inactive"].includes(r("active").toLowerCase());if(!/^[A-Z0-9]{4,20}$/.test(i)){s.errors.push(`Line ${a}: invalid ID "${r("id")}"`);continue}if(!r("name")||!r("email").includes("@")||!r("hostel")||!r("room")){s.errors.push(`Line ${a}: name, email, hostel and room are required`);continue}try{let[t]=await e.query(`insert into students (id, name, email, hostel, room, active) values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update set name = excluded.name, email = excluded.email,
           hostel = excluded.hostel, room = excluded.room, active = excluded.active
         returning (xmax = 0) as inserted`,[i,r("name"),r("email").toLowerCase(),r("hostel"),r("room"),o]);t.inserted?s.added++:s.updated++}catch(e){s.errors.push(`Line ${a}: ${e.message}`)}}return await h(e,t,"import_roster",`${s.added} added, ${s.updated} updated, ${s.errors.length} errors`),s}async function y(e){return(await e.query("select distinct hostel, room from students where active order by hostel, room")).map(e=>({...e,code:c(e.hostel,e.room,r.qrSigningKey)}))}let g=`
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
  method           text not null check (method in ('qr', 'manual', 'self', 'round')),
  result           text not null check (result in ('valid', 'late', 'manual', 'duplicate', 'expired', 'invalid', 'unknown', 'absent')),
  reason           text not null,
  scanned_at       timestamptz not null,        -- when the guard scanned (device time)
  received_at      timestamptz not null default now(),
  offline          boolean not null default false,
  resolved_at      timestamptz,
  resolved_by      text,
  resolution_note  text,
  device_id        text                         -- phone used for a room check-in
);

-- Upgrades for databases created before room check-ins and rounds existed.
alter table scans add column if not exists device_id text;
alter table scans drop constraint if exists scans_method_check;
alter table scans add constraint scans_method_check check (method in ('qr', 'manual', 'self', 'round'));
alter table scans drop constraint if exists scans_result_check;
alter table scans add constraint scans_result_check
  check (result in ('valid', 'late', 'manual', 'duplicate', 'expired', 'invalid', 'unknown', 'absent'));

-- The one phone each student may check in from. Registered on first use; the hostel office can reset it.
create table if not exists student_devices (
  student_id     text primary key references students(id) on delete cascade,
  device_id      text not null,
  registered_at  timestamptz not null default now()
);

-- What the warden found at the door during rounds: one row per student per night.
create table if not exists room_visits (
  roll_call_id  integer not null references roll_calls(id) on delete cascade,
  student_id    text not null references students(id) on delete cascade,
  outcome       text not null check (outcome in ('present', 'absent')),
  visited_by    text not null,
  visited_at    timestamptz not null,
  primary key (roll_call_id, student_id)
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
`;var $=e.i(74098);async function v(e,t={}){await e.exec(g);let[{count:n}]=await e.query("select count(*)::int as count from students");0===n&&await (0,$.seedDemoData)(e,Date.now(),t)}function k(e){return"object"==typeof e&&null!==e&&"23505"===e.code}let b=(0,a.fromHex)(r.qrPublicKeyHex),x=`('${m.PRESENT_RESULTS.join("','")}')`;function S(e){return Math.max(Date.parse(e.startsAt),Date.parse(e.curfewAt)-54e5)}async function q(e,t,n,s=Date.now()){let[r]=await e.query("select id, hostel, room from students where id = $1 and active",[t]);if(!r)return{ok:!1,result:"unknown",message:"Your account is not on the active student list."};let i=await (0,l.getOrCreateActiveRollCall)(e,s),c=S(i);if(s<c)return{ok:!1,result:"closed",message:`Room check-in opens at ${(0,u.formatClock)(c)}.`};let m=async()=>(await e.query(`select 1 from scans where roll_call_id = $1 and student_id = $2 and result in ${x} limit 1`,[i.id,t])).length>0;if(await m())return{ok:!0,result:"already",message:"You're already checked in for tonight."};let h=(a,r)=>e.query(`insert into scans (client_id, roll_call_id, student_id, claimed_id, scanned_by, method, result, reason, scanned_at, device_id)
       values ($1, $2, $3, $3, 'student', 'self', $4, $5, $6, $7)`,[crypto.randomUUID(),i.id,t,a,r,new Date(s),n.deviceId.slice(0,64)]),f=async(e,t)=>(await h("invalid",e),{ok:!1,result:"invalid",message:t}),[_]=await e.query("select device_id from student_devices where student_id = $1",[t]);if(_&&_.device_id!==n.deviceId)return f("Room check-in tried from a phone that isn't registered to this student","This isn't the phone registered to your account. Ask the hostel office to register your new phone.");if(!n.onCampus)return f("Room check-in tried from outside the hostel network","Connect to the hostel Wi-Fi to check in from your room.");let p=function(e,t){let n=e.trim().split(".");if(3!==n.length||"NR1"!==n[0])return null;try{let e=(0,a.fromBase64Url)(n[2]);if(64!==e.length||!o.ed25519.verify(e,d.encode(`${n[0]}.${n[1]}`),t))return null;let[s,r,...i]=new TextDecoder().decode((0,a.fromBase64Url)(n[1])).split("\n");if(!s||!r||i.length)return null;return{hostel:s,room:r}}catch{return null}}(n.tag,b);if(!p)return f("Room check-in with something that isn't a NightPass room tag","That isn't a NightPass room tag. Scan the tag inside your room.");if(p.hostel!==r.hostel||p.room!==r.room)return f(`Scanned the tag for room ${p.room}, but is assigned to room ${r.room}`,`That tag is for room ${p.room}. Scan the tag in your own room (${r.room}).`);_||await e.query("insert into student_devices (student_id, device_id, registered_at) values ($1, $2, $3) on conflict (student_id) do nothing",[t,n.deviceId.slice(0,64),new Date(s)]);let w=Date.parse(i.curfewAt),y=s>w;try{await h(y?"late":"valid",y?`Room check-in ${Math.ceil((s-w)/6e4)} min after curfew`:`Checked in from room ${r.room}`)}catch(e){if(k(e))return{ok:!0,result:"already",message:"You're already checked in for tonight."};throw e}return{ok:!0,result:y?"late":"valid",message:y?"Checked in, but after curfew. The warden will see it as late.":"You're checked in for tonight."}}let D=`('${m.PRESENT_RESULTS.join("','")}')`,I=new Intl.Collator("en",{numeric:!0});async function A(e,t,n=Date.now()){let a=t?await (0,l.getRollCall)(e,t):await (0,l.getOrCreateActiveRollCall)(e,n);if(!a)return null;let s=new Date(Date.parse(a.startsAt)),r=await e.query(`select st.id, st.name, st.hostel, st.room,
            p.method as presence_method, p.scanned_at as presence_at,
            (select count(*)::int from scans r
              where r.roll_call_id = $1 and r.student_id = st.id and r.result in ('invalid', 'expired')) as rejected,
            d.registered_at as device_at,
            (select count(*)::int from roll_calls rc
              where rc.id <> $1 and rc.starts_at < $2 and rc.starts_at > $2::timestamptz - interval '7 days'
                and not exists (select 1 from scans s
                                 where s.roll_call_id = rc.id and s.student_id = st.id and s.result in ${D})) as missed,
            v.outcome, v.visited_at, vs.name as visited_by
       from students st
       left join scans p on p.roll_call_id = $1 and p.student_id = st.id and p.result in ${D}
       left join student_devices d on d.student_id = st.id
       left join room_visits v on v.roll_call_id = $1 and v.student_id = st.id
       left join staff vs on vs.id = v.visited_by
      where st.active`,[a.id,s]),i=[];for(let e of r){let t={id:e.id,name:e.name,hostel:e.hostel,room:e.room},n=e.outcome?{outcome:e.outcome,at:new Date(e.visited_at).toISOString(),by:e.visited_by}:null,r=e.presence_at?new Date(e.presence_at).toISOString():null;if(!e.presence_method){let a=n?.outcome==="absent"?"Not in the room when visited":e.rejected>0?"No check-in, and a rejected attempt tonight":"No check-in tonight";i.push({student:t,kind:"missing",reasons:[a],checkedInAt:null,visit:n});continue}if("self"!==e.presence_method){n&&i.push({student:t,kind:"missing",reasons:["Had no check-in until the visit"],checkedInAt:r,visit:n});continue}let l=[];e.rejected>0&&l.push("Had a rejected attempt tonight"),e.device_at&&new Date(e.device_at)>=s&&l.push("New phone registered tonight"),e.missed>=2&&l.push(`Missed ${e.missed} of the last 6 nights`),0===l.length&&function(e,t){let n=0x811c9dc5;for(let a of`${e}:${t}`)n=Math.imul(n^a.charCodeAt(0),0x1000193)>>>0;return n%100<6}(e.id,a.id)&&l.push("Random spot check"),(l.length>0||n)&&i.push({student:t,kind:"spot",reasons:l.length?l:["Spot check"],checkedInAt:r,visit:n})}i.sort((e,t)=>I.compare(e.student.hostel,t.student.hostel)||I.compare(e.student.room,t.student.room));let o=r.filter(e=>e.presence_method).length,d=i.filter(e=>"missing"===e.kind&&!(e.visit&&e.checkedInAt)).length,c=i.filter(e=>"spot"===e.kind).length;return{rollCall:a,curfewPassed:n>Date.parse(a.curfewAt),items:i,summary:{students:r.length,checkedIn:o,toVisit:i.length,visited:i.filter(e=>e.visit).length,missing:d,spotChecks:c,noVisitNeeded:r.length-i.length}}}async function C(e,t,n,a,s=Date.now()){let r=await (0,l.getOrCreateActiveRollCall)(e,s),[i]=await e.query("select id from students where id = $1 and active",[n]);if(!i)return!1;let o=new Date(s);await e.query(`insert into room_visits (roll_call_id, student_id, outcome, visited_by, visited_at) values ($1, $2, $3, $4, $5)
     on conflict (roll_call_id, student_id) do update set outcome = excluded.outcome, visited_by = excluded.visited_by, visited_at = excluded.visited_at`,[r.id,n,a,t.id,o]);let[d]=await e.query(`select id, method, scanned_at from scans where roll_call_id = $1 and student_id = $2 and result in ${D} limit 1`,[r.id,n]);if("present"===a)return await e.query(`update scans set resolved_at = $3, resolved_by = $4, resolution_note = 'Later seen in the room'
        where roll_call_id = $1 and student_id = $2 and result = 'absent' and resolved_at is null`,[r.id,n,o,t.id]),d||await e.query(`insert into scans (client_id, roll_call_id, student_id, claimed_id, scanned_by, method, result, reason, scanned_at)
         values ($1, $2, $3, $3, $4, 'round', 'valid', 'Seen in the room during rounds', $5)
         on conflict do nothing`,[crypto.randomUUID(),r.id,n,t.id,o]),!0;if(d?.method==="self")await e.query(`update scans set result = 'absent', scanned_by = $2,
              reason = $3, resolved_at = null, resolved_by = null, resolution_note = null
        where id = $1`,[d.id,t.id,`Checked in from the room at ${(0,u.formatClock)(d.scanned_at)}, but was not there during rounds at ${(0,u.formatClock)(s)}`]);else if(!d){let[a]=await e.query("select 1 from scans where roll_call_id = $1 and student_id = $2 and result = 'absent' and resolved_at is null limit 1",[r.id,n]);a||await e.query(`insert into scans (client_id, roll_call_id, student_id, claimed_id, scanned_by, method, result, reason, scanned_at)
         values ($1, $2, $3, $3, $4, 'round', 'absent', $5, $6)`,[crypto.randomUUID(),r.id,n,t.id,`Not in the room during rounds at ${(0,u.formatClock)(s)}`,o])}return!0}let R=`('${m.PRESENT_RESULTS.join("','")}')`,N=`('${m.FLAG_RESULTS.join("','")}')`,T=new Map,E=e=>e?new Date(e).toISOString():null,O="coalesce(c.name, case s.method when 'self' then 'Room check-in' when 'round' then 'Warden''s rounds' end)";async function j(e,t){let n=Date.now(),[s]=await e.query("select id, name, email, hostel, room from students where id = $1 and active",[t]);if(!s)return null;let i=await (0,l.getOrCreateActiveRollCall)(e,n),[o]=await e.query(`select s.result, s.scanned_at, c.name as checkpoint, s.method
       from scans s left join checkpoints c on c.id = s.checkpoint_id
      where s.roll_call_id = $1 and s.student_id = $2 and s.result in ${R}
      limit 1`,[i.id,t]),d=await e.query(`select rc.name, rc.starts_at, s.result, s.scanned_at
       from roll_calls rc
       left join scans s on s.roll_call_id = rc.id and s.student_id = $1 and s.result in ${R}
      where rc.id <> $2 and rc.starts_at < $3
      order by rc.starts_at desc limit 6`,[t,i.id,new Date(n)]),c=(0,a.periodAt)(n)-1,u=Array.from({length:1200/a.PERIOD_SECONDS},(e,n)=>{var s;let i,l;return{period:c+n,code:(s=c+n,i=`${t}.${s}`,(l=T.get(i))||(l=(0,a.signPass)(t,s,r.qrSigningKey),T.size>2e4&&T.clear(),T.set(i,l)),l)}});return{student:s,rollCall:i,status:o?{result:o.result,at:E(o.scanned_at),checkpoint:o.checkpoint,method:o.method}:null,roomCheckIn:{opensAt:new Date(S(i)).toISOString(),open:n>=S(i)},codes:u,periodSeconds:a.PERIOD_SECONDS,serverNow:n,history:d.map(e=>({name:e.name,startsAt:E(e.starts_at),result:e.result,at:E(e.scanned_at)}))}}async function P(e){let t=Date.now(),n=await (0,l.getOrCreateActiveRollCall)(e,t),[a,s,i,[{count:o}]]=await Promise.all([e.query("select id, name from checkpoints order by hostel nulls last, name"),e.query("select id, name, hostel, room from students where active order by name"),e.query(`select s.student_id, s.scanned_at, ${O} as checkpoint
         from scans s left join checkpoints c on c.id = s.checkpoint_id
        where s.roll_call_id = $1 and s.result in ${R}`,[n.id]),e.query(`select count(*)::int as count from scans where roll_call_id = $1 and result in ${N} and resolved_at is null`,[n.id])]);return{rollCall:n,checkpoints:a,roster:s,present:i.map(e=>({studentId:e.student_id,at:E(e.scanned_at),checkpoint:e.checkpoint??"another gate"})),publicKeyHex:r.qrPublicKeyHex,serverNow:t,flagsOpen:o}}let U=`
  select s.id, s.scanned_at, s.received_at, s.result, s.reason, s.method, s.offline, s.student_id, s.claimed_id,
         st.name as student_name, st.hostel, st.room, ${O} as checkpoint, sf.name as scanned_by,
         rc.name as roll_call, s.resolved_at, rs.name as resolved_by, s.resolution_note
    from scans s
    join roll_calls rc on rc.id = s.roll_call_id
    left join students st on st.id = s.student_id
    left join checkpoints c on c.id = s.checkpoint_id
    left join staff sf on sf.id = s.scanned_by
    left join staff rs on rs.id = s.resolved_by`;function M(e){return{id:e.id,scannedAt:E(e.scanned_at),receivedAt:E(e.received_at),result:e.result,reason:e.reason,method:e.method,offline:e.offline,studentId:e.student_id,claimedId:e.claimed_id,studentName:e.student_name,hostel:e.hostel,room:e.room,checkpoint:e.checkpoint,scannedBy:e.scanned_by,rollCall:e.roll_call,resolvedAt:E(e.resolved_at),resolvedBy:e.resolved_by,resolutionNote:e.resolution_note}}async function L(e,t){let n=Date.now(),a=t?await (0,l.getRollCall)(e,t):await (0,l.getOrCreateActiveRollCall)(e,n);if(!a)return null;let[s,r,i,o,d,c,u,h,f,_]=await Promise.all([(0,l.listRollCalls)(e),e.query(`select st.hostel, count(*)::int as expected, count(p.student_id)::int as present
         from students st
         left join scans p on p.student_id = st.id and p.roll_call_id = $1 and p.result in ${R}
        where st.active
        group by st.hostel order by st.hostel`,[a.id]),e.query(`select result, count(*)::int as total, count(*) filter (where resolved_at is null)::int as open
         from scans where roll_call_id = $1 group by result`,[a.id]),e.query(`select scanned_at from scans where roll_call_id = $1 and result in ${R} order by scanned_at`,[a.id]),e.query(`select rc.id, rc.name, rc.starts_at,
              count(s.id) filter (where s.result in ${R})::int as present,
              count(s.id) filter (where s.result = 'late')::int as late
         from roll_calls rc left join scans s on s.roll_call_id = rc.id
        where rc.starts_at <= $1
        group by rc.id order by rc.starts_at desc limit 7`,[new Date(Date.parse(a.startsAt))]),e.query(`${U} where s.roll_call_id = $1 order by s.scanned_at desc limit 40`,[a.id]),e.query(`${U} where s.roll_call_id = $1 and s.result in ${N} and s.resolved_at is null
       order by s.scanned_at desc limit 100`,[a.id]),e.query(`select st.id, st.name, st.email, st.hostel, st.room,
              a.result as attempt_result, a.scanned_at as attempt_at, a.reason as attempt_reason
         from students st
         left join lateral (
           select result, scanned_at, reason from scans
            where roll_call_id = $1 and student_id = st.id order by scanned_at desc limit 1
         ) a on true
        where st.active and not exists (
          select 1 from scans p where p.roll_call_id = $1 and p.student_id = st.id and p.result in ${R}
        )
        order by (a.result is null), st.hostel, st.name`,[a.id]),e.query(`select method, count(*)::int as count from scans where roll_call_id = $1 and result in ${R} group by method`,[a.id]),A(e,a.id,n)]),p=e=>i.find(t=>t.result===e),w=r.reduce((e,t)=>e+t.expected,0),y=r.reduce((e,t)=>e+t.present,0);return{rollCall:a,rollCalls:s,isLive:Date.parse(a.startsAt)<=n&&Date.parse(a.endsAt)>n,stats:{expected:w,present:y,missing:w-y,late:p("late")?.total??0,manual:p("manual")?.total??0,flagsOpen:i.filter(e=>m.FLAG_RESULTS.includes(e.result)).reduce((e,t)=>e+t.open,0),rejected:i.filter(e=>!m.PRESENT_RESULTS.includes(e.result)).reduce((e,t)=>e+t.total,0)},verifiedBy:{self:f.find(e=>"self"===e.method)?.count??0,qr:f.find(e=>"qr"===e.method)?.count??0,round:f.find(e=>"round"===e.method)?.count??0,manual:f.find(e=>"manual"===e.method)?.count??0},rounds:_,byHostel:r,arrivals:function(e){if(0===e.length)return[];let t=9e5*Math.floor(e[0]/9e5),n=9e5*Math.floor(e[e.length-1]/9e5),a=new Map;for(let e=t;e<=n;e+=9e5)a.set(e,0);for(let t of e){let e=9e5*Math.floor(t/9e5);a.set(e,(a.get(e)??0)+1)}return[...a].map(([e,t])=>({at:new Date(e).toISOString(),count:t}))}(o.map(e=>new Date(e.scanned_at).getTime())),trend:d.reverse().map(e=>({id:e.id,name:e.name,startsAt:E(e.starts_at),present:e.present,late:e.late})),feed:c.map(M),flags:u.map(M),missing:h.map(e=>({id:e.id,name:e.name,email:e.email,hostel:e.hostel,room:e.room,lastAttempt:e.attempt_result?{result:e.attempt_result,at:E(e.attempt_at),reason:e.attempt_reason??""}:null}))}}function K(e){let t=Number(e.get("rollCallId"));return{q:e.get("q")??void 0,result:e.get("result")??void 0,hostel:e.get("hostel")??void 0,rollCallId:Number.isInteger(t)&&t>0?t:void 0,from:e.get("from")??void 0,to:e.get("to")??void 0}}async function H(e,t){let n=[],a=[],s=(e,t)=>{a.push(t),n.push(e(`$${a.length}`))};return t.q?.trim()&&s(e=>`(st.name ilike ${e} or s.student_id ilike ${e} or s.claimed_id ilike ${e} or st.room ilike ${e})`,`%${t.q.trim()}%`),"present"===t.result?n.push(`s.result in ${R}`):"flagged"===t.result?n.push(`s.result in ${N}`):"open"===t.result?n.push(`s.result in ${N} and s.resolved_at is null`):t.result&&s(e=>`s.result = ${e}`,t.result),t.hostel&&s(e=>`st.hostel = ${e}`,t.hostel),t.rollCallId&&s(e=>`s.roll_call_id = ${e}`,t.rollCallId),t.from&&!Number.isNaN(Date.parse(t.from))&&s(e=>`s.scanned_at >= ${e}`,new Date(t.from)),t.to&&!Number.isNaN(Date.parse(t.to))&&s(e=>`s.scanned_at < ${e}`,new Date(t.to)),a.push(Math.min(t.limit??300,1e4)),(await e.query(`${U} ${n.length?`where ${n.join(" and ")}`:""}
     order by s.scanned_at desc limit $${a.length}`,a)).map(M)}let z=(0,a.fromHex)(r.qrPublicKeyHex),B=`('${m.PRESENT_RESULTS.join("','")}')`;async function F(e,t){let[n]=await e.query("select id, name, hostel, room from students where id = $1 and active",[t]);return n}async function G(e,t,n){let[a]=await e.query(`select s.scanned_at, coalesce(c.name, case s.method when 'self' then 'room check-in' when 'round' then 'warden''s rounds' end) as checkpoint
       from scans s left join checkpoints c on c.id = s.checkpoint_id
      where s.roll_call_id = $1 and s.student_id = $2 and s.result in ${B}
      limit 1`,[t,n]);return a?{atMs:new Date(a.scanned_at).getTime(),checkpoint:a.checkpoint??"another gate"}:void 0}async function Y(e,t){let[n]=await e.query(`select s.result, s.reason, s.claimed_id, s.scanned_at, st.id, st.name, st.hostel, st.room
       from scans s left join students st on st.id = s.student_id
      where s.client_id = $1`,[t]);return n?{clientId:t,result:n.result,reason:n.reason,claimedId:n.claimed_id,student:n.id?{id:n.id,name:n.name,hostel:n.hostel,room:n.room}:null,scannedAt:new Date(n.scanned_at).toISOString()}:null}async function W(e,t,n,s,r){let i="qr"===t.method?(0,a.parsePass)(t.raw??"")?.studentId:t.studentId,l=i?await F(e,i):void 0,o=i?await G(e,n,i):void 0,d={nowMs:r,publicKey:z,curfewAtMs:s,findStudent:e=>e===i?l:void 0,findPresence:e=>e===i?o:void 0};return"qr"===t.method?(0,m.verifyPass)(t.raw??"",d):(0,m.verifyManual)(t.studentId??"",t.note??"",d)}async function J(e,t,n){let a=Date.now(),s=await (0,l.getOrCreateActiveRollCall)(e,a),r=Date.parse(s.curfewAt),i=new Set((await e.query("select id from checkpoints")).map(e=>e.id)),o=[];for(let l of n){let n=await Y(e,l.clientId);if(n){o.push(n);continue}let d=Math.min(Math.max(l.scannedAt,a-864e5),a),c=i.has(l.checkpointId)?l.checkpointId:null;for(let n=0;n<2;n++){let a=await W(e,l,s.id,r,d);try{await e.query(`insert into scans (client_id, roll_call_id, student_id, claimed_id, checkpoint_id, scanned_by,
                              method, result, reason, scanned_at, offline)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,[l.clientId,s.id,a.student?.id??null,a.claimedId,c,t.id,l.method,a.result,a.reason,new Date(d),l.offline]),o.push({clientId:l.clientId,result:a.result,reason:a.reason,claimedId:a.claimedId,student:a.student,scannedAt:new Date(d).toISOString()});break}catch(a){if(!k(a)||1===n)throw a;let t=await Y(e,l.clientId);if(t){o.push(t);break}}}}return o}let Q={curfewInMinutes:25,registerDemoPhones:!0},V=Function("url","return import(url)");async function Z(){let{PGlite:e}=await V("https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.8/dist/index.js");return e.create()}async function X(){let e=await Z(),t={query:async(t,n=[])=>(await e.query(t,n)).rows,async exec(t){await e.exec(t)}};return await v(t,Q),{handle:(e,n,a,s)=>en(t,e,n,a,s).catch(e=>ee(500,{error:e.message})),passCode:(e,t=0)=>(0,a.signPass)(e,(0,a.periodAt)(Date.now())-t,r.qrSigningKey),roomTag:async e=>{let[n]=await t.query("select hostel, room from students where id = $1",[e]);return c(n.hostel,n.room,r.qrSigningKey)},reset:()=>(0,$.resetDemoData)(t,Q)}}function ee(e,t){return{status:e,contentType:"application/json",body:JSON.stringify(t)}}function et(e,t){return t.includes(e.role)}async function en(e,t,n,a,s){let r=new URL(a,"https://demo.local"),l=r.pathname.replace(/\/+$/,""),o=s?JSON.parse(s):{},d=ee(403,{error:"Not allowed for your role"});if("/api/auth/logout"===l||"/api/auth/login"===l)return ee(200,{redirect:"/"});if("/api/student/pass"===l&&"GET"===n){if(!et(t,["student"]))return d;let n=await j(e,t.id);return n?ee(200,n):ee(404,{error:"Your pass is not active"})}if("/api/student/checkin"===l&&"POST"===n)return et(t,["student"])?ee(200,await q(e,t.id,{tag:String(o.tag??""),deviceId:String(o.deviceId??""),onCampus:!o.simulateOffCampus})):d;if("/api/guard/rounds"===l){if(!et(t,["guard","admin"]))return d;if("POST"===n){let n="absent"===o.outcome?"absent":"present";if(!await C(e,t,String(o.studentId??""),n))return ee(404,{error:"Student not found"})}return ee(200,await A(e))}if("/api/guard/bootstrap"===l&&"GET"===n)return et(t,["guard","admin"])?ee(200,await P(e)):d;if("/api/scans"===l&&"POST"===n){if(!et(t,["guard","admin"]))return d;let n=function(e){let t=e?.scans;if(!Array.isArray(t)||0===t.length||t.length>500)return null;let n=[];for(let e of t){if("string"!=typeof e.clientId||e.clientId.length>64||"qr"!==e.method&&"manual"!==e.method||"string"!=typeof e.checkpointId||"number"!=typeof e.scannedAt)return null;n.push({clientId:e.clientId,method:e.method,raw:"string"==typeof e.raw?e.raw.slice(0,512):void 0,studentId:"string"==typeof e.studentId?e.studentId.slice(0,32):void 0,note:"string"==typeof e.note?e.note.slice(0,200):void 0,checkpointId:e.checkpointId,scannedAt:e.scannedAt,offline:!!e.offline})}return n}(o);return n?ee(200,{results:await J(e,t,n)}):ee(400,{error:"Malformed scan batch"})}if(!l.startsWith("/api/admin/"))return ee(404,{error:"Not found"});if(!et(t,["admin"]))return d;let c=Number(r.searchParams.get("rollCallId")),h=Number.isInteger(c)&&c>0?c:void 0;if("/api/admin/overview"===l){let t=await L(e,h);return t?ee(200,t):ee(404,{error:"Roll call not found"})}if("/api/admin/records"===l)return ee(200,{records:await H(e,K(r.searchParams))});if("/api/admin/export"===l){let t;if("missing"===r.searchParams.get("kind")){let n=await L(e,h);t=(0,i.toCsv)(["Student ID","Name","Hostel","Room","Email","Last attempt","Attempt time","Attempt detail"],(n?.missing??[]).map(e=>[e.id,e.name,e.hostel,e.room,e.email,e.lastAttempt?m.RESULT_META[e.lastAttempt.result].label:"",e.lastAttempt?(0,u.formatClock)(e.lastAttempt.at):"",e.lastAttempt?.reason??""]))}else{let n=await H(e,{...K(r.searchParams),limit:1e4});t=(0,i.toCsv)(["Date","Time","Roll call","Student ID","Name","Hostel","Room","Checkpoint","Method","Result","Detail","Scanned by","Recorded offline","Resolved by","Resolution note"],n.map(e=>[(0,u.formatDate)(e.scannedAt),(0,u.formatClock)(e.scannedAt,!0),e.rollCall,e.studentId??e.claimedId??"",e.studentName??"",e.hostel??"",e.room??"",e.checkpoint??"",e.method,m.RESULT_META[e.result].label,e.reason,e.scannedBy??"",e.offline?"yes":"no",e.resolvedBy??"",e.resolutionNote??""]))}return{status:200,contentType:"text/csv; charset=utf-8",body:`\uFEFF${t}`}}let g=/^\/api\/admin\/flags\/(\d+)$/.exec(l);if(g&&"POST"===n)return await f(e,t,Number(g[1]),String(o.note??"").slice(0,500))?ee(200,{ok:!0}):ee(409,{error:"Already resolved or not a flag"});if("/api/admin/rollcall"===l&&"POST"===n){if("new"===o.action)return ee(200,{rollCall:await p(e,t)});if("curfew"===o.action){let n=await _(e,t,Number(o.rollCallId),String(o.time));return n?ee(200,{rollCall:n}):ee(400,{error:"Invalid time"})}return ee(400,{error:"Unknown action"})}return"/api/admin/roster"===l?"POST"===n?ee(200,await w(e,t,String(o.csv??""))):ee(200,{students:await e.query("select id, name, email, hostel, room, active from students order by hostel, name")}):"/api/admin/roomtags"===l?ee(200,{tags:await y(e)}):"/api/admin/reset"===l&&"POST"===n?(await (0,$.resetDemoData)(e,Q),ee(200,{ok:!0})):ee(404,{error:"Not found"})}e.s(["createBackend",0,X],76093)}]);