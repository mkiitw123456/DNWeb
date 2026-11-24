import "dotenv/config";
import pg from "pg";
import {readFileSync} from "node:fs";
const url=new URL(process.env.DDSTAR_IMPORT_DATABASE_URL);
if (!(url.hostname==="db.vnqbitelgrkojmiqdpak.supabase.co" || (url.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(url.username)==="postgres.vnqbitelgrkojmiqdpak"))) throw Error("Wrong migration target");
export const client=new pg.Client({host:url.hostname,port:Number(url.port||5432),database:"postgres",user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),ssl:{ca:readFileSync(new URL("../server/supabase-ca.crt",import.meta.url)),rejectUnauthorized:true}});
export function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,decode(value)]));
}
function decode(v){
  if ("mapValue" in v) return decodeFields(v.mapValue.fields||{});
  if ("arrayValue" in v) return (v.arrayValue.values||[]).map(decode);
  if ("nullValue" in v) return null;
  if ("integerValue" in v && Number.isSafeInteger(Number(v.integerValue))) return Number(v.integerValue);
  if ("doubleValue" in v && Number.isFinite(v.doubleValue)) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  throw Error("Unsupported Firestore value type: "+Object.keys(v)[0]);
}
