import { fail } from "./domain.js";
import { audit, raidView, schedulingAction } from "./scheduling.js";
import { claimDeliveries } from "./deliveries.js";
import { periods } from "../shared/scheduling.js";

const actorProjection = `(select jsonb_build_object('id',u->'id','active',u->'active','admin',u->'admin',
  'version',u->'version','username',u->'username') from jsonb_array_elements(body->'users') u
  where u->>'id'=$1 limit 1)`;

function actor(row, token) {
  if (!row) fail("公會資料尚未就緒", 503);
  if (!row.actor?.active || row.actor.version !== token.version) fail("登入已過期，請重新登入", 401);
  return row.actor;
}

export async function linkedGuildUsers(client, token) {
  const {rows:[row]} = await client.query(`select ${actorProjection} as actor,
    (select jsonb_agg(jsonb_build_object('id',u->'id','discordId',u->'discordId','active',true))
     from jsonb_array_elements(body->'users') u where u->'active'='true'::jsonb and u->>'discordId'<>'') as users
    from documents where path='dnweb/state'`, [token.id]);
  actor(row, token);
  return row.users || [];
}

export async function saveRaidSeat(client, token, p, now = Date.now()) {
  const {rows:[row]} = await client.query(`select ${actorProjection} as actor, r.raid, r.pos-1 as idx,
    ch.person, (select jsonb_build_object('id',u->'id','active',u->'active','username',u->'username')
      from jsonb_array_elements(body->'users') u where u->>'id'=ch.person->>'ownerId' limit 1) as owner,
    (select d from jsonb_array_elements(body->'dungeons') d where d->>'id'=r.raid->>'dungeonId' limit 1) as dungeon,
    (select jsonb_agg(jsonb_build_object('id',q->'id','startsAt',q->'startsAt','dungeonId',q->'dungeonId',
       'dungeonName',q->'dungeonName','slots',jsonb_build_array(jsonb_build_object('characterId',$3::text))))
      from jsonb_array_elements(body->'raids') q where q->>'id'<>$2 and q->>'settledAt' is null
      and q->>'dungeonId'=r.raid->>'dungeonId' and q->'slots' @> jsonb_build_array(jsonb_build_object('characterId',$3::text))) as reservations,
    (select jsonb_agg(e - 'message') from jsonb_array_elements(body->'deliveries') e
      where e->>'raidId'=$2 and e->>'status' in ('pending','sending')) as notices,
    body->'discordWebhooks'->>'log' as log, body->'discordWebhooks'->>'important' as important
    from documents left join lateral (select raid,pos from jsonb_array_elements(body->'raids')
      with ordinality as a(raid,pos) where raid->>'id'=$2 limit 1) r on true
    left join lateral (select jsonb_build_object('id',c->'id','ownerId',c->'ownerId','name',c->'name',
      'professionId',c->'professionId','gear',c->'gear','week',c->'week','runs',c->'runs') as person from jsonb_array_elements(body->'characters') c
      where c->>'id'=$3 limit 1) ch on true where path='dnweb/state' for update of documents`, [token.id,p.id,p.characterId]);
  const user = actor(row,token);
  if (row.person && row.person.week !== periods(now).week) {
    row.person.week = periods(now).week;
    row.person.runs = {};
  }
  const raid = row.raid;
  const state = {raids: raid ? [raid,...(row.reservations || [])] : [], users:row.owner ? [row.owner] : [],
    dungeons:row.dungeon ? [row.dungeon] : [], characters:row.person ? [row.person] : [],
    deliveries:row.notices || [], discordWebhooks:{log:row.log,important:row.important}};
  schedulingAction(state,user,"raid.seat",p,now);
  state.deliveries = [];
  audit(state,user,"raid.seat",p,now);
  const jobs = claimDeliveries(state,state.deliveries.map(e=>e.id));
  const meta = {revision:raid.revision,updatedAt:raid.updatedAt,notification:raid.notification};
  await client.query(`update documents set body=jsonb_set(
    jsonb_set(body,array['raids',$1::text], jsonb_set(body #> array['raids',$1::text],array['slots',$2::text],$3::jsonb) || $4::jsonb),
    '{deliveries}',(select jsonb_agg(e order by i) from (
      select e,i,count(*) over () as n from jsonb_array_elements(coalesce(body->'deliveries','[]'::jsonb) || $5::jsonb)
      with ordinality as outbox(e,i)) events where i>n-30 or
      (e->>'status' in ('pending','sending') and (e->>'createdAt')::bigint>$6)))
    where path='dnweb/state'`, [String(row.idx),String(p.index),JSON.stringify(raid.slots[p.index]),JSON.stringify(meta),
    JSON.stringify(state.deliveries),now-86400000]);
  return {user,jobs,state:{seatPatch:{id:raid.id,index:p.index,slot:raidView(state,raid).slots[p.index],...meta}}};
}

// The shell already has the rest of the website. Project only the active panel on subsequent reads.
export async function guildPanel(client, token, page) {
  if (!["characters","raids"].includes(page)) fail("未知分頁");
  const fields = page === "characters" ? `
    body->'quantityTypes' as quantities,
    (select jsonb_agg(c - 'hp' - 'attack' - 'fatigue' - 'day') from jsonb_array_elements(body->'characters') c
       where c->>'ownerId'=$1) as characters` : `
    body->'raids' as raids, case when a.actor->'admin'='true'::jsonb then body->'raidTemplates' end as templates,
    (select jsonb_agg(jsonb_build_object('id',u->'id','active',u->'active','username',u->'username',
        'nickname',u->'nickname','discordId',case when a.actor->'admin'='true'::jsonb then u->'discordId' end))
      from jsonb_array_elements(body->'users') u where a.actor->'admin'='true'::jsonb or exists (
        select 1 from jsonb_array_elements(body->'raids') r where r->'slots' @> jsonb_build_array(jsonb_build_object('ownerId',u->'id')))) as users,
    (select jsonb_agg(jsonb_build_object('id',c->'id','ownerId',c->'ownerId','name',c->'name','gear',c->'gear',
        'professionId',c->'professionId','runs',c->'runs','week',c->'week'))
       from jsonb_array_elements(body->'characters') c where a.actor->'admin'='true'::jsonb or exists (
         select 1 from jsonb_array_elements(body->'raids') r where r->'slots' @> jsonb_build_array(jsonb_build_object('characterId',c->'id')))) as characters`;
  const {rows:[row]} = await client.query(`select a.actor, body->'professions' as professions,body->'dungeons' as dungeons,
    ${fields} from documents cross join lateral (select ${actorProjection} as actor) a where path='dnweb/state'`, [token.id]);
  const user = actor(row,token);
  const week = periods().week;
  const characters = (row.characters || []).map(c => c.week === week ? c : {...c,week,runs:{}});
  const panel = {professions:row.professions || [],dungeons:row.dungeons || []};
  if (page === "characters") Object.assign(panel,{characters,quantityTypes:row.quantities || []});
  else {
    const users = row.users || [];
    const active = new Set(users.filter(u=>u.active).map(u=>u.id));
    Object.assign(panel,{raids:(row.raids || []).map(r=>raidView({characters,users},r)),
      roster:user.admin ? characters.filter(c=>active.has(c.ownerId)) : [],
      raidUsers:user.admin ? users.filter(u=>active.has(u.id)) : [], raidTemplates:row.templates || []});
  }
  return {memberId:user.id,admin:!!user.admin,panel};
}
