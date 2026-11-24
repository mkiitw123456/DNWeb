import { usePostgres } from "./postgres.js";
import { createHash } from "node:crypto";
import { firestore, readState } from "./store.js";
import { activityTransaction } from "./activity-store.js";
import { fail } from "./domain.js";
import { queueDelivery } from "./scheduling.js";
import { claimDeliveries } from "./deliveries.js";
import { roomCreateId } from "./room-create.js";
import { competitionAction, competitionRoomView } from "./competitions.js";

function sessionUser(users, token) {
  const actor = users.find(u => u.id === token.id && u.active && u.version === token.version);
  if (!actor) fail("登入已過期，請重新登入", 401);
  return actor;
}

function validateRoomId(id) {
  if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) fail("比賽編號無效");
}

const recentRooms = new Map();
function readRoom(db, id) {
  const now = Date.now();
  const cached = recentRooms.get(id);
  if (cached && now < cached.until) return cached.pending;
  for (const [key, entry] of recentRooms) {
    if (entry.until <= now) recentRooms.delete(key);
  }
  if (recentRooms.size >= 128) recentRooms.delete(recentRooms.keys().next().value);
  const pending = db.doc("guild_activity/competition_" + id).get().then(snap => snap.data());
  const entry = { pending, until: now + 4000 };
  recentRooms.set(id, entry);
  console.info("db_usage competition_room cache_fill docs=1");
  pending.catch(() => { if (recentRooms.get(id) === entry) recentRooms.delete(id); });
  return pending;
}

async function roomUpdate(token, { id, revision }) {
  validateRoomId(id);
  let users, room;
  if (!usePostgres() && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const db = await firestore();
    const [guild, match] = await Promise.all([db.doc("dnweb/state").get(), readRoom(db, id)]);
    users = guild.get("users") ?? [];
    room = match;
  } else {
    users = await readState(s => s.users);
    room = await activityTransaction(db => db.get("competition_" + id));
  }
  sessionUser(users, token);
  if (!room) return { room: null };
  const view = competitionRoomView({ users }, room);
  // Include resolved nicknames: a profile edit need not bump the room version.
  const current = createHash("sha256").update(JSON.stringify(view)).digest("base64url");
  return current === revision ? { unchanged: true } : { room: view, revision: current };
}

export async function competitionRequest(token, type, p) {
  if (type === "competition.room") return { view: await roomUpdate(token, p), jobs: [] };
  const { user, users } = await readState((s) => {
    const actor = sessionUser(s.users, token);
    return {
      user: actor,
      users: s.users.map(({ id, nickname, username, discordId, active }) => ({
        active,
        id,
        nickname,
        username,
        discordId,
      })),
    };
  });
  const create = type === "competition.create";
  if (create && !p.submissionId) fail("請重新開啟建立表單");
  const id = create ? roomCreateId(type, user.id, p.submissionId) : p.id;
  if (id != null) validateRoomId(id);
  let notices = [];
  const settle = type === "competition.settle";
  const response = await activityTransaction(
    async (db) => {
      const [index, room] = await Promise.all([
        db.get("competitionIndex"),
        id ? db.get("competition_" + id) : null,
      ]);
      let rooms = index?.rooms || [];
      let archivePages = index?.archivePages || 0;
      if (type === "competition.history") {
        if (!Number.isSafeInteger(p.page) || p.page < 1 || p.page > archivePages) fail("歷史頁碼無效");
        return await db.get("competitionHistory_" + p.page);
      }
      const state = { users, competitions: room ? [room] : [], deliveries: [] };
      const oldVersion = room?.version;
      const result = competitionAction(state, user, type, { ...p, id });
      if (
        type !== "competition.state" &&
        result.room &&
        result.room.version !== oldVersion
      ) {
        const updated = state.competitions[0];
        db.set("competition_" + id, updated);
        if (create || type === "competition.join" || type === "competition.removePlayer" || settle) {
          const card = result.rooms[0];
          rooms = room
            ? rooms.map((r) => (r.id === id ? card : r))
            : [card, ...rooms];
          if (settle) {
            rooms = [card, ...rooms.filter(r => r.id !== id)];
            const settled = rooms.filter(r => r.total != null);
            if (settled.length > 40) {
              const archived = settled.slice(-20);
              const ids = new Set(archived.map(r => r.id));
              db.set("competitionHistory_" + (++archivePages), {rooms: archived});
              rooms = rooms.filter(r => !ids.has(r.id));
            }
          }
          db.set("competitionIndex", { rooms, archivePages });
        }
      }
      notices = state.deliveries;
      return { rooms, archivePages, room: result.room };
    },
    {
      authenticatedUser: user,
      ...(settle
        ? {
            queueAudit: (guild) => {
              guild.deliveries ||= [];
              const ids = notices.map((e) =>
                queueDelivery(
                  guild,
                  "casino",
                  e.message,
                  { competitionId: id },
                  e.createdAt,
                ),
              );
              return claimDeliveries(guild, ids);
            },
          }
        : {}),
    },
  );
  if (id && type !== "competition.state") recentRooms.delete(id);
  return settle
    ? { view: response.result, jobs: response.jobs }
    : { view: response, jobs: [] };
}
