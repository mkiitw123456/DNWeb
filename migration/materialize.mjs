import {client,decodeFields} from "./target.mjs";
import {isDeepStrictEqual} from "node:util";
const [schema,snapshot]=process.argv.slice(2);
if(!/^ddstar(?:_qa_[a-z0-9]+)?$/.test(schema)|| !/^[a-f0-9-]{36}$/.test(snapshot))throw Error("Expected runtime schema and verified snapshot id");
await client.connect();
try {
 await client.query("begin");
 await client.query("create schema if not exists "+schema);
 await client.query("revoke all on schema "+schema+" from public,anon,authenticated");
 await client.query("set local search_path to "+schema+",pg_catalog");
 await client.query("create table if not exists cutover(id boolean primary key check(id), active boolean not null, snapshot uuid not null)");
 await client.query("create table if not exists documents(path text primary key,parent text generated always as (regexp_replace(path,'/[^/]+$','')) stored,body jsonb not null)");
 await client.query("create index if not exists documents_parent_time on documents(parent,((body->>'createdAt')::numeric))");
 await client.query("create index if not exists documents_member on documents(parent,(body->>'memberId'))");
 await client.query("lock table cutover in access exclusive mode");
 if ((await client.query("select 1 from cutover where active")).rowCount) throw Error("Refusing to replace a live database");
 const {rows}=await client.query("select document_path,typed_fields from ddstar_import.documents join ddstar_import.snapshots on id=snapshot_id where id=$1 and verified_at is not null and source_project='dnweb-6792a'",[snapshot]);
 if(!rows.some(r=>r.document_path==="dnweb/state")) throw Error("Missing guild");
 await client.query("create temp table expected(path text primary key,body jsonb) on commit drop");
 for(let start=0;start<rows.length;start+=40){
   const batch=rows.slice(start,start+40).map(row=>{
     const body=decodeFields(row.typed_fields);
     if(row.document_path==="dnweb/state")delete body.ddstarStorageFrozen;
     return {path:row.document_path,body};
   });
   const stored=await client.query("insert into expected select * from jsonb_to_recordset($1::jsonb) as d(path text,body jsonb) returning path,body",[JSON.stringify(batch)]);
   const expected=new Map(batch.map(row=>[row.path,row.body]));
   if(stored.rows.some(row=>!isDeepStrictEqual(row.body,expected.get(row.path))))throw Error("Runtime value mismatch");
 }
 await client.query("delete from documents d where not exists(select 1 from expected e where e.path=d.path)");
 await client.query("insert into documents(path,body) select path,body from expected on conflict(path) do update set body=excluded.body where documents.body is distinct from excluded.body");
 const {rowCount}=await client.query("select 1 from expected full join documents using(path) where expected.body is distinct from documents.body limit 1");
 if(rowCount)throw Error("Runtime reconciliation failed");
 await client.query("insert into cutover values(true,$1,$2) on conflict(id) do update set snapshot=excluded.snapshot",[schema!=="ddstar",snapshot]);
 await client.query("commit");console.log("Runtime verified",schema,rows.length);
}finally{await client.end()}
