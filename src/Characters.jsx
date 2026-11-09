import { useState } from "react";
import { BookOpen, CalendarDays, Trash2 } from "lucide-react";
import {
  Heading,
  Button,
  Field,
  NumberField,
  Modal,
  FormActions,
  Empty,
} from "./ui.jsx";
import ProfessionIcon from "./ProfessionIcon.jsx";
import CharacterCard from "./CharacterCard.jsx";
export default function Characters({ data, mutate, busy, ask }) {
  const [editing, setEditing] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const characters = data.characters.filter((c) => c.ownerId === data.me.id);
  const showGuide =
    guideOpen || (!characters.length && !data.me.onboardingCompleted);
  const add = () =>
    setEditing({
      name: "",
      hp: 0,
      attack: 0,
      ownerId: data.me.id,
      professionId: "",
    });
  return (
    <div className="characters-page">
      <Heading
        title="角色資訊"
        description="管理自己的角色戰力與副本進度"
        onAdd={add}
        addLabel="新增角色"
      />
      <div className="personal-toolbar">
        <div className="compact-reset">
          <span>
            <CalendarDays size={14} />
            每週六 09:00 副本重置
          </span>
          <small>台灣時間</small>
        </div>
        <Button onClick={() => setGuideOpen(true)}>
          <BookOpen size={16} />
          使用指南
        </Button>
      </div>
      {showGuide && (
        <section className="onboarding" aria-label="新手使用指南">
          <div className="onboarding-heading">
            <span className="eyebrow">開始你的冒險</span>
            <h2>從第一個角色開始</h2>
            <p>
              建立角色後，就能在這裡記錄戰力與每週副本進度。這裡只會顯示你自己的角色。
            </p>
          </div>
          <ol className="onboarding-steps">
            <li>
              <strong>建立角色</strong>
              <p>
                點「新增角色」，輸入角色名稱，選擇職業。卡片會顯示對應的職業圖示與外框顏色。
              </p>
            </li>
            <li>
              <strong>填寫角色資訊</strong>
              <p>
                輸入血量、攻擊力並儲存。之後可從角色卡片的編輯按鈕隨時調整，也能建立多個角色。
              </p>
            </li>
            <li>
              <strong>更新副本進度</strong>
              <p>
                在卡片填寫已完成場次與數量項目，離開輸入框即可儲存。副本場次會在每週六早上
                9 點自動重置。
              </p>
            </li>
          </ol>
          <div className="onboarding-actions">
            <Button primary onClick={add}>
              {characters.length ? "新增角色" : "建立第一個角色"}
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (
                  await mutate(
                    "onboarding.complete",
                    {},
                    "可隨時從使用指南重新查看",
                  )
                )
                  setGuideOpen(false);
              }}
            >
              我知道了
            </Button>
          </div>
        </section>
      )}
      <div className="roster-summary">
        我的角色 · {characters.length} 個角色
      </div>
      {characters.length ? (
        <div className="personal-character-grid">
          {characters.map((c) => (
            <CharacterCard
              key={c.id}
              character={c}
              professions={data.professions || []}
              dungeons={data.dungeons}
              quantityTypes={data.quantityTypes}
              canEdit={true}
              busy={busy}
              mutate={mutate}
              onEdit={() => setEditing({ ...c })}
            />
          ))}
        </div>
      ) : !showGuide ? (
        <Empty
          title="尚未建立角色"
          description="點選右上方「新增角色」，開始記錄你的角色資訊。"
        />
      ) : null}
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
