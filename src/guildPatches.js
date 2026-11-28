export function applySeatPatch(state, patch) {
  const {id, index, slot, ...meta} = patch;
  const raids = state.raids.map(raid => {
    if (raid.id !== id || raid.revision > meta.revision) return raid;
    return {...raid, ...meta, slots:raid.slots.map((old,i) => i === index ? slot : old)};
  });
  return {...state, raids};
}

export function applyCharacterPatch(state, character) {
  const owned = character.ownerId === state.me.id;
  const existing = state.characters.some(c => c.id === character.id);
  let characters;
  if (!owned) characters = state.characters.filter(c => c.id !== character.id);
  else if (existing) characters = state.characters.map(c => c.id === character.id ? character : c);
  else characters = [...state.characters, character];

  const {id,name,ownerId,professionId,gear,week,runs} = character;
  const roster = state.roster.map(c => c.id === id ? {id,name,ownerId,professionId,gear,week,runs} : c);
  const raids = state.raids.map(raid => {
    if (!raid.slots.some(slot => slot?.characterId === id)) return raid;
    return {...raid, slots:raid.slots.map(slot => slot?.characterId === id
      ? {...slot,name,professionId,gear,unavailable:slot.ownerId !== ownerId}
      : slot)};
  });
  return {...state,characters,roster,raids};
}
