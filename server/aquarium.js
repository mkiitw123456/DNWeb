import { activityTransaction } from "./activity-store.js";
import { fail } from "./domain.js";

const capacity = 24;
export const aquariumKey = (day) => `aquarium_${day}`;

export function aquariumView(day, tank, today) {
  const totalCheckIns = tank?.totalCheckIns ?? 0;
  return {
    month: day.slice(0, 7),
    day,
    fishCount: Math.min(totalCheckIns, capacity),
    capacity,
    totalCheckIns,
    checkedInToday: today?.aquariumCheckedIn === true,
  };
}

export function checkInAquarium(user, day, dayKey, now) {
  if (!user.active) fail("請重新登入", 401);
  return activityTransaction(
    async (db) => {
      const tankKey = aquariumKey(day);
      const [tank, today] = await Promise.all([
        db.get(tankKey),
        db.get(dayKey),
      ]);
      if (today?.aquariumCheckedIn) return aquariumView(day, tank, today);
      const expiresAt = now + 35 * 86400000;
      const nextTank = {
        totalCheckIns: (tank?.totalCheckIns ?? 0) + 1,
        expiresAt,
      };
      const nextDay = {
        counts: {},
        ...today,
        memberId: user.id,
        aquariumCheckedIn: true,
        expiresAt,
      };
      db.set(tankKey, nextTank);
      db.set(dayKey, nextDay);
      return aquariumView(day, nextTank, nextDay);
    },
    { authenticatedUser: user },
  );
}
