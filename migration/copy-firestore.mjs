import "dotenv/config";
import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { cert } from "firebase-admin/app";
import pg from "pg";

const source = "dnweb-6792a";
const target = "vnqbitelgrkojmiqdpak";
const root = `projects/${source}/databases/(default)/documents`;
const rest = "https://firestore.googleapis.com/v1/";
const snapshot = randomUUID();
const readTime = process.env.DDSTAR_SNAPSHOT_TIME || new Date(Math.floor(Date.now() / 1000) * 1000 - 2000).toISOString();
const hashes = new Map();

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function hash(path, updated, fields) {
  return createHash("sha256").update(JSON.stringify([path, updated, canonical(fields)])).digest("hex");
}
async function migrate() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    (process.env.GOOGLE_APPLICATION_CREDENTIALS && await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
  if (!raw) throw Error("Missing Firestore source credentials");
  const key = JSON.parse(raw);
  if (key.project_id !== source) throw Error("Incorrect Firestore source project");
  const credential = cert(key);
  const url = new URL(process.env.DDSTAR_IMPORT_DATABASE_URL);
  const direct = url.hostname === `db.${target}.supabase.co`;
  const pool = url.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(url.username) === `postgres.${target}`;
  if (!(direct || pool) || url.pathname !== "/postgres" || !["postgres:", "postgresql:"].includes(url.protocol))
    throw Error("Incorrect Supabase destination");
  const client = new pg.Client({ host: url.hostname, port: Number(url.port || 5432),
    database: "postgres", user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 15000 });
  const encoded = path => path.split("/").map(encodeURIComponent).join("/");
  async function request(path, options = {}) {
    const token = await credential.getAccessToken();
    const res = await fetch(rest + path, { ...options, headers: {
      Authorization: "Bearer " + token.access_token, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw Error("Firestore read failed (HTTP " + res.status + ")");
    return res.json();
  }
  async function visit(parent) {
    let token;
    do {
      const list = await request(encoded(parent) + ":listCollectionIds", { method: "POST",
        body: JSON.stringify({ readTime, pageSize: 300, pageToken: token }) });
      for (const id of list.collectionIds || []) await copyCollection(parent, id);
      token = list.nextPageToken;
    } while (token);
  }
  async function copyCollection(parent, id) {
    let token;
    do {
      const params = new URLSearchParams({ readTime, showMissing: "true", pageSize: "100" });
      if (token) params.set("pageToken", token);
      const page = await request(encoded(parent + "/" + id) + "?" + params);
      const docs = page.documents || [];
      const batch=[];
      for (const doc of docs) {
        if (!doc.name.startsWith(root + "/")) throw Error("Foreign document in response");
        if (!doc.updateTime) continue; // Missing parents can still have child collections.
        const path = doc.name.slice(root.length + 1), fields = doc.fields || {};
        batch.push({path,updated:doc.updateTime,fields});
        hashes.set(path, hash(path,doc.updateTime,fields));
      }
      if(batch.length) await client.query("insert into ddstar_import.documents select $1,d.path,d.updated,d.fields from jsonb_to_recordset($2::jsonb) as d(path text,updated text,fields jsonb)",[snapshot,JSON.stringify(batch)]);
      for(let offset=0;offset<docs.length;offset+=10){
        const part=docs.slice(offset,offset+10);
        const lists=await Promise.all(part.map(doc=>request(encoded(doc.name)+":listCollectionIds",{method:"POST",body:JSON.stringify({readTime,pageSize:300})})));
        for(const [i,list] of lists.entries()){
          if(list.nextPageToken)await visit(part[i].name);
          else for(const child of list.collectionIds||[])await copyCollection(part[i].name,child);
        }
      }
      token = page.nextPageToken;
    } while (token);
  }
  await client.connect();
  try {
    await client.query("begin");
    await client.query("insert into ddstar_import.snapshots(id,source_project,source_database,read_time) values ($1,$2,'(default)',$3)", [snapshot,source,readTime]);
    await visit(root);
    if (!hashes.has("dnweb/state")) throw Error("Required guild state missing");
    let cursor = "";
    while (true) {
      const {rows} = await client.query("select document_path, source_update_time, typed_fields from ddstar_import.documents where snapshot_id=$1 and document_path > $2 order by document_path limit 100", [snapshot,cursor]);
      if (!rows.length) break;
      for (const row of rows) {
        cursor = row.document_path;
        if (hashes.get(cursor) !== hash(cursor,row.source_update_time,row.typed_fields)) throw Error("Snapshot verification failed");
        hashes.delete(cursor);
      }
    }
    if (hashes.size) throw Error("Incomplete snapshot");
    await client.query("update ddstar_import.snapshots set verified_at=now() where id=$1",[snapshot]);
    await client.query("commit");
    console.log("Verified DDStar staging snapshot",snapshot,readTime);
  } catch (error) { await client.query("rollback"); throw error; }
  finally { await client.end(); }
}
migrate().catch(error => { console.error("Import stopped:", error.code || error.name,
  /^(Missing Firestore|Incorrect |Firestore read failed|Required guild|Snapshot verification|Incomplete snapshot)/.test(error.message) ? error.message : "Check credentials, TLS and database connectivity."); process.exitCode=1; });
