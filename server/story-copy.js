import published from "./published-story-copy.js";

// Match shipped wording by chapter and field, independently of the order in
// which an administrator has arranged or removed choices and outcomes.
export function makeCopyUpdater(chapters) {
  const revisions = new Map();
  for (const chapter of chapters) {
    const previous = published[chapter.id];
    if (!previous) continue;
    const choices = new Map();
    const results = new Map();
    chapter.options.forEach((option, i) => {
      for (const old of previous[`choice${i}`] || []) choices.set(old, option.text);
      (option.outcomes || [option]).forEach((outcome, j) => {
        for (const old of previous[`result${i}.${j}`] || []) results.set(old, outcome.result);
      });
    });
    revisions.set(chapter.id, { chapter, previous, choices, results });
  }
  return event => {
    const revision = revisions.get(event.id);
    if (!revision) return event;
    const { chapter, previous, choices, results } = revision;
    const reviseResult = outcome => results.has(outcome.result)
      ? { ...outcome, result: results.get(outcome.result) } : outcome;
    return {
      ...event,
      story: previous.story?.includes(event.story) ? chapter.story : event.story,
      options: event.options.map(option => {
        const updated = choices.has(option.text) ? { ...option, text: choices.get(option.text) } : option;
        return option.outcomes
          ? { ...updated, outcomes: option.outcomes.map(reviseResult) }
          : reviseResult(updated);
      }),
    };
  };
}
