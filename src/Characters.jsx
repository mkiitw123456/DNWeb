import { useState } from "react";
import { UserRound, Check, CalendarDays, Trash2 } from "lucide-react";
import {
  Heading,
  Button,
  Field,
  NumberField,
  Modal,
  FormActions,
  Empty,
} from "./ui.jsx";
import Groups from "./Groups.jsx";
import ProfessionIcon from "./ProfessionIcon.jsx";
import CharacterCard from "./CharacterCard.jsx";
export default function Characters({ data, mutate, busy, ask }) {
  const [editing, setEditing] = useState(null),
    [owners, setOwners] = useState(null);
  const [groupFilter, setGroupFilter] = useState("");
  const chosenGroup = data.groups.find((g) => g.id === groupFilter);
  const members = data.users.filter(
    (u) =>
      (!chosenGroup || chosenGroup.memberIds.includes(u.id)) &&
      (u.active || data.characters.some((c) => c.ownerId === u.id)),
  );
  const groups = members
    .filter((u) => owners === null || owners.includes(u.id))
    .map((u) => ({
      ...u,
      characters: data.characters.filter((c) => c.ownerId === u.id),
    }));
  const add = (ownerId = data.me.id) =>
    setEditing({
      name: "",
      hp: 0,
      attack: 0,
      ownerId,
      professionId: "",
    });
  const toggle = (id) =>
    setOwners((current) =>
      current === null
        ? [id]
        : current.includes(id)
          ? current.filter((x) => x !== id)
          : [...current, id],
    );
  return (
    <div className="characters-page">
      <Heading
        title="角色資訊"
        description="依成員查看角色戰力與副本進度"
        onAdd={() => add()}
        addLabel="新增角色"
      />
      <Groups data={data} mutate={mutate} busy={busy} ask={ask} />
      <div className="compact-reset">
        <span>
          <CalendarDays size={14} />
          每週六 09:00 副本重置
        </span>
        <small>台灣時間</small>
      </div>
      <Field label="角色群組篩選">
        <select
          value={chosenGroup?.id || ""}
          onChange={(e) => {
            setGroupFilter(e.target.value);
            setOwners(null);
          }}
        >
          <option value="">所有可見成員</option>
          {data.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="member-filters" role="group" aria-label="顯示成員">
        <button
          className={owners === null ? "selected" : ""}
          aria-pressed={owners === null}
          onClick={() => setOwners(null)}
        >
          所有成員
        </button>
        <button onClick={() => setOwners([data.me.id])}>只看自己</button>
        <button onClick={() => setOwners([])}>全不選</button>
        <span className="filter-divider" />
        {members.map((u) => (
          <button
            key={u.id}
            aria-pressed={owners === null || owners.includes(u.id)}
            className={
              owners === null || owners.includes(u.id) ? "selected" : ""
            }
            onClick={() => toggle(u.id)}
          >
            {(owners === null || owners.includes(u.id)) && <Check size={13} />}{" "}
            {u.username}
          </button>
        ))}
      </div>
      <div className="roster-summary">
        {groups.length} 位成員 ·{" "}
        {groups.reduce((n, u) => n + u.characters.length, 0)} 個角色{" "}
        <span>可複選成員</span>
      </div>
      {groups.length ? (
        <div className="member-columns">
          {groups.map((u) => (
            <section
              className="member-column"
              key={u.id}
              aria-label={u.username + " 的角色"}
            >
              <header className="member-column-header">
                <span className="member-icon">
                  <UserRound size={16} />
                </span>
                <h2>{u.username}</h2>
                <small>{u.characters.length} 角</small>
              </header>
              <div className="member-character-list">
                {u.characters.map((c) => (
                  <CharacterCard
                    key={c.id}
                    character={c}
                    professions={data.professions || []}
                    dungeons={data.dungeons}
                    quantityTypes={data.quantityTypes}
                    canEdit={data.me.admin || c.ownerId === data.me.id}
                    busy={busy}
                    mutate={mutate}
                    onEdit={() => setEditing({ ...c })}
                  />
                ))}
                {!u.characters.length && (
                  <div className="member-empty">
                    <p>尚未建立角色</p>
                    {(data.me.admin || u.id === data.me.id) && (
                      <Button onClick={() => add(u.id)}>新增角色</Button>
                    )}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Empty
          title="尚未選擇成員"
          description="點選上方成員名稱，即可查看角色資訊。"
        />
      )}
      {editing && (
        <Modal
          title={editing.id ? "編輯角色" : "新增角色"}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate("character.save", editing)) setEditing(null);
            }}
          >
            <Field
              label="角色名稱"
              required
              maxLength={80}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <Field label="職業">
              <select
                value={editing.professionId || ""}
                onChange={(e) =>
                  setEditing({ ...editing, professionId: e.target.value })
                }
              >
                <option value="">未設定職業</option>
                {(data.professions || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <div
              className="profession-picker"
              role="group"
              aria-label="職業圖示選擇"
            >
              {data.professions.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  aria-label={p.name}
                  aria-pressed={editing.professionId === p.id}
                  onClick={() => setEditing({ ...editing, professionId: p.id })}
                >
                  <ProfessionIcon profession={p} />
                </button>
              ))}
            </div>
            {!data.professions?.length && (
              <p className="hint">
                請管理員先到「管理後台 → 職業清單」建立職業。
              </p>
            )}
            {data.me.admin && (
              <Field label="所屬成員">
                <select
                  value={editing.ownerId}
                  onChange={(e) =>
                    setEditing({ ...editing, ownerId: e.target.value })
                  }
                >
                  {data.users
                    .filter((u) => u.active || u.id === editing.ownerId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.username}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <div className="form-grid">
              {[
                ["hp", "血量"],
                ["attack", "攻擊力"],
              ].map(([key, label]) => (
                <NumberField
                  key={key}
                  label={label}
                  max={1e12}
                  value={editing[key]}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      [key]:
                        e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                />
              ))}
            </div>
            {editing.id && (
              <Button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (
                    (await ask("確定刪除此角色？")) &&
                    (await mutate(
                      "character.delete",
                      { id: editing.id },
                      "角色已刪除",
                    ))
                  )
                    setEditing(null);
                }}
              >
                <Trash2 size={16} />
                刪除角色
              </Button>
            )}
            <FormActions busy={busy} onClose={() => setEditing(null)} />
          </form>
        </Modal>
      )}
    </div>
  );
}
