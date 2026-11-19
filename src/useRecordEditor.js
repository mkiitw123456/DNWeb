import { useRef, useState } from "react";

function existingRecord(draft, id, savedCredentialInput) {
  const { createKey, createAttempt, credentialInput, ...fields } = draft;
  if (credentialInput && credentialInput === savedCredentialInput)
    fields.password = "";
  return { ...fields, id };
}

export default function useRecordEditor() {
  const [editing, setRecord] = useState(null);
  const session = useRef(0);
  function openEditor(record) {
    session.current++;
    if (record && !record.id) {
      const stamp = crypto.randomUUID();
      setRecord({
        ...record,
        createKey: crypto.randomUUID(),
        createAttempt: stamp,
        ...(Object.hasOwn(record, "password")
          ? { credentialInput: stamp }
          : {}),
      });
    } else setRecord(record);
  }
  function setEditing(update) {
    const stamp = crypto.randomUUID();
    setRecord((previous) => {
      const next = typeof update === "function" ? update(previous) : update;
      if (!next?.createKey || next === previous) return next;
      return {
        ...next,
        createAttempt: stamp,
        ...(previous?.password !== next.password
          ? { credentialInput: stamp }
          : {}),
      };
    });
  }
  async function saveEditor(mutate, type) {
    const currentSession = session.current;
    const submitted = editing;
    const result = await mutate(type, submitted);
    if (!result || session.current !== currentSession) return;
    const id = result.savedRecordId;
    const credential = result.savedCredentialInput ?? submitted.credentialInput;
    if (
      id &&
      result.savedCreateAttempt &&
      result.savedCreateAttempt !== submitted.createAttempt
    ) {
      // A previous create succeeded without its reply. The user has since
      // changed the draft and pressed Save: apply these edits to that exact ID.
      const followUp = existingRecord(submitted, id, credential);
      setRecord((latest) => {
        if (!latest || latest.createKey !== submitted.createKey) return latest;
        return latest === submitted
          ? followUp
          : existingRecord(latest, id, credential);
      });
      const saved = await mutate(type, followUp);
      if (saved && session.current === currentSession) {
        setRecord((latest) => (latest === followUp ? null : latest));
      }
      return;
    }
    setRecord((latest) => {
      if (!latest || latest === submitted) return null;
      if (!submitted.id && id) return existingRecord(latest, id, credential);
      return latest;
    });
  }
  return { editing, setEditing, openEditor, saveEditor };
}
