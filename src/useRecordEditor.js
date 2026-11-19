import { createContext, useContext, useEffect, useRef, useState } from "react";

export const RecordDraftContext = createContext(null);

function existingRecord(draft, id, savedCredentialInput) {
  const { createKey, createAttempt, credentialInput, ...fields } = draft;
  if (credentialInput && credentialInput === savedCredentialInput)
    fields.password = "";
  return { ...fields, id };
}

function safeDraft(record) {
  return Object.hasOwn(record, "password")
    ? { ...record, password: "" }
    : { ...record };
}

export default function useRecordEditor(type) {
  const registry = useContext(RecordDraftContext);
  const [editing, setRecord] = useState(null);
  const session = useRef(0);
  const submitting = useRef(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const keyOf = (record) => type + ":" + (record.id || record.createKey);
  function openEditor(record) {
    session.current++;
    if (record && !record.id) {
      for (const [key, ticket] of registry.records) {
        if (ticket.type === type && ticket.failed && !ticket.draft.id) {
          registry.records.delete(key);
          setRecord(ticket.draft);
          return;
        }
      }
      const stamp = crypto.randomUUID();
      setRecord({
        ...record,
        createKey: crypto.randomUUID(),
        createAttempt: stamp,
        ...(Object.hasOwn(record, "password")
          ? { credentialInput: stamp }
          : {}),
      });
      return;
    }
    if (record) {
      const key = keyOf(record);
      const ticket = registry.records.get(key);
      if (ticket?.failed) registry.records.delete(key);
      if (ticket) record = { ...record, ...ticket.draft };
    }
    setRecord(record);
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
  async function saveEditor(mutate) {
    const currentSession = session.current;
    const submitted = editing;
    if (
      !submitted ||
      !registry.isCurrent() ||
      submitting.current === currentSession
    )
      return;
    submitting.current = currentSession;
    let key = keyOf(submitted);
    const ticket = { type, draft: safeDraft(submitted) };
    registry.records.set(key, ticket);
    // The form's HTML constraints have already passed. Keep a recoverable
    // draft while leaving the rest of the page usable during the network trip.
    setRecord(null);
    let saved = false;
    try {
      const result = await mutate(type, submitted);
      if (!result || !registry.isCurrent()) return;
      if (
        result.savedCreateAttempt &&
        result.savedCreateAttempt !== submitted.createAttempt
      ) {
        // A previous create committed but lost its reply. Apply this explicit
        // submit to the returned ID even if the user has since left the page.
        const followUp = existingRecord(
          submitted,
          result.savedRecordId,
          result.savedCredentialInput,
        );
        if (registry.records.get(key) === ticket) registry.records.delete(key);
        key = keyOf(followUp);
        // A later edit of this exact record already superseded the retry.
        if (registry.records.has(key)) return;
        ticket.draft = safeDraft(followUp);
        registry.records.set(key, ticket);
        saved = !!(await mutate(type, followUp));
      } else saved = true;
    } finally {
      if (submitting.current === currentSession) submitting.current = null;
      if (registry.records.get(key) === ticket) {
        if (saved || !registry.isCurrent()) registry.records.delete(key);
        else if (mounted.current && session.current === currentSession) {
          registry.records.delete(key);
          setRecord(ticket.draft);
        } else {
          // Recover this edit on a deliberate reopen, without replacing a
          // different editor or interrupting the user's new page.
          ticket.failed = true;
        }
      }
    }
  }
  return { editing, setEditing, openEditor, saveEditor };
}
