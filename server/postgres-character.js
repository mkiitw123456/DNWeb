import { isDeepStrictEqual } from "node:util";
import { action, fail } from "./domain.js";
import { claimDeliveries } from "./deliveries.js";
import { audit } from "./scheduling.js";

// Called inside pgTransaction. A serialization retry re-selects the current
// character and its array position before applying the user's field changes.
export async function saveCharacterFields(client, token, type, payload, now = Date.now()) {
  const { rows: [row] } = await client.query(`
    select
      (select jsonb_build_object('id', u->'id', 'active', u->'active', 'admin', u->'admin',
                'version', u->'version', 'username', u->'username')
       from jsonb_array_elements(body->'users') u where u->>'id' = $1 limit 1) as actor,
      ch.value as person, ch.pos - 1 as idx,
      (select jsonb_build_object('id',u->'id','active',u->'active') from jsonb_array_elements(body->'users') u
        where u->>'id'=coalesce($5::text,ch.value->>'ownerId') limit 1) as owner,
      (select jsonb_build_object('id',p->'id') from jsonb_array_elements(body->'professions') p
        where p->>'id'=coalesce($6::text,ch.value->>'professionId') limit 1) as profession,
      (select jsonb_agg(d) from jsonb_array_elements(body->'dungeons') d
        where d->>'id' = any($3::text[])) as dungeons,
      (select jsonb_agg(t) from jsonb_array_elements(body->'quantityTypes') t
        where t->>'id' = any($4::text[])) as quantities,
      body->'discordWebhooks'->>'log' as log_url,
      body->'discordWebhooks'->>'important' as important_url,
      body->>'professionIconsMigrated' = 'true' and body->>'iconlessProfessionsRemoved' = 'true'
        and not coalesce(ch.value ?| array['fatigue','day'],false)
        as ready
    from documents left join lateral (
      select value, pos from jsonb_array_elements(body->'characters') with ordinality as x(value,pos)
      where value->>'id' = $2 limit 1
    ) ch on true where path = 'dnweb/state' for update of documents
  `, [token.id, payload.id, Object.keys(payload.runs || {}), Object.keys(payload.quantities || {}), payload.ownerId || null, payload.professionId ?? null]);
  if (!row) fail("公會資料尚未就緒", 503);
  const user = row.actor;
  if (!user?.active || user.version !== token.version) fail("登入已過期，請重新登入", 401);
  // Legacy migrations still use the normal path. action resets the selected character's week.
  if (!row.ready) return null;
  const s = {
    users: row.owner ? [user,row.owner] : [user], characters: row.person ? [row.person] : [],
    professions: row.profession ? [row.profession] : [],
    professionIconsMigrated: true, iconlessProfessionsRemoved: true,
    dungeons: row.dungeons || [], quantityTypes: row.quantities || [],
    discordWebhooks: { log: row.log_url, important: row.important_url },
  };
  const before = { ...row.person };
  const state = action(s, user, type, payload, now);
  const fields = Object.fromEntries(Object.entries(row.person).filter(([key, value]) =>
    !isDeepStrictEqual(before[key], value)));
  audit(s, user, type, payload, now);
  const jobs = claimDeliveries(s, s.deliveries.map(e => e.id));
  // Append and prune the outbox inside Postgres, without downloading its history.
  await client.query(`
    update documents set body = jsonb_set(
      jsonb_set(body, array['characters', $1::text], (body #> array['characters', $1::text]) || $2::jsonb),
      '{deliveries}', (
        select jsonb_agg(e order by i) from (
          select e, i, count(*) over () as n
          from jsonb_array_elements(coalesce(body->'deliveries','[]'::jsonb) || $3::jsonb)
            with ordinality as entries(e,i)
        ) history where i > n - 30 or
          (e->>'status' in ('pending','sending') and (e->>'createdAt')::bigint > $4)
      )
    ) where path='dnweb/state'
  `, [String(row.idx), JSON.stringify(fields), JSON.stringify(s.deliveries), now - 86400000]);
  if (type === "character.save") {
    const {hp,attack,...characterPatch} = row.person;
    return {state:{characterPatch},jobs,user};
  }
  if (before.week !== row.person.week) Object.assign(state,{week:row.person.week,runs:row.person.runs});
  return { state, jobs, user };
}
