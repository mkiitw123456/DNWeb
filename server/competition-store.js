import { readState } from "./store.js";
import { activityTransaction } from "./activity-store.js";
import { fail } from "./domain.js";
import { queueDelivery } from "./scheduling.js";
import { claimDeliveries } from "./deliveries.js";
import { roomCreateId } from "./room-create.js";
import { competitionAction } from "./competitions.js";

export async function competitionRequest(token, type, p) {
  const { user, users } = await readState((s) => {
    const actor = s.users.find(
      (u) => u.id === token.id && u.active && u.version === token.version,
    );
    if (!actor) fail("登入已過期，請重新登入", 401);
    return {
      user: actor,
      users: s.users.map(({ id, nickname, username, discordId }) => ({
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
  if (id != null && (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)))
    fail("比賽編號無效");
  let notices = [];
  const settle = type === "competition.settle";
  const response = await activityTransaction(
    async (db) => {
      const [index, room] = await Promise.all([
        db.get("competitionIndex"),
        id ? db.get("competition_" + id) : null,
      ]);
      let rooms = index?.rooms || [];
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
        if (create || type === "competition.join" || settle) {
          const card = result.rooms[0];
          rooms = room
            ? rooms.map((r) => (r.id === id ? card : r))
            : [card, ...rooms];
          // Keep active rooms listed; old settled detail documents remain intact.
          let settledCount = 0;
          rooms = rooms.filter((r) => r.total == null || ++settledCount <= 40);
          db.set("competitionIndex", { rooms });
        }
      }
      notices = state.deliveries;
      return { rooms, room: result.room };
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
  return settle
    ? { view: response.result, jobs: response.jobs }
    : { view: response, jobs: [] };
}
