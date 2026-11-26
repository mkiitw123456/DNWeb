import { activityTransaction } from "./activity-store.js";
import { fail } from "./domain.js";
import { randomInt } from "node:crypto";
import { drawFishSpecies } from "../shared/fish-catalog.js";

const capacity = 24;
export const aquariumKey = (day) => `aquarium_${day}`;

export function aquariumView(day, tank, today, member) {
  const totalCheckIns = tank?.totalCheckIns ?? 0;
  return {
    month: day.slice(0, 7),
    day,
    fishCount: Math.min(totalCheckIns, capacity),
    capacity,
    totalCheckIns,
    checkedInToday: today?.aquariumCheckedIn === true,
    todayFish: today?.fishSpecies ?? null,
    species: tank?.species ?? [],
    collection: member?.fishCollection ?? {},
  };
}

export function checkInAquarium(user, day, dayKey, now, defaultMember) {
  if (!user.active) fail("請重新登入", 401);
  return activityTransaction(
    async (db) => {
      const tankKey = aquariumKey(day);
      const memberKey = `member_${user.id}`;
      const [tank, today, savedMember] = await Promise.all([
        db.get(tankKey),
        db.get(dayKey),
        db.get(memberKey),
      ]);
      const member = savedMember || defaultMember;
      if (today?.aquariumCheckedIn)
        return aquariumView(day, tank, today, member);
      const id = drawFishSpecies(randomInt);
      const total = tank?.totalCheckIns ?? 0;
      const species = Array.from(
        { length: Math.min(capacity, total + 1) },
        (_, slot) => tank?.species?.[slot] ?? null,
      );
      species[total % capacity] = id;
      const expiresAt = now + 35 * 86400000;
      const nextTank = {
        totalCheckIns: total + 1,
        species,
        expiresAt,
      };
      const nextDay = {
        counts: {},
        ...today,
        memberId: user.id,
        aquariumCheckedIn: true,
        fishSpecies: id,
        expiresAt,
      };
      db.set(tankKey, nextTank);
      db.set(dayKey, nextDay);
      const nextMember = {
        ...member,
        fishCollection: {
          ...member.fishCollection,
          [id]: (member.fishCollection?.[id] ?? 0) + 1,
        },
      };
      db.set(memberKey, nextMember);
      return aquariumView(day, nextTank, nextDay, nextMember);
    },
    { authenticatedUser: user },
  );
}
