import { useState } from "react";
import { Button, Field } from "./ui.jsx";

export function Invitations({ data, mutate, busy }) {
  const invitations = data.invitations.filter((i) => i.toUserId === data.me.id);
  if (!invitations.length) return null;
  return (
    <section className="group-panel" aria-label="群組邀請">
      <h2>群組邀請</h2>
      {invitations.map((i) => (
        <div className="group-row" key={i.id}>
          <p>
            <strong>{i.fromName}</strong> 邀請你加入「{i.groupName}」
          </p>
          <Button
            primary
            disabled={busy}
            onClick={() =>
              mutate("group.respond", { id: i.id, accept: true }, "已加入群組")
            }
          >
            接受
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              mutate("group.respond", { id: i.id, accept: false }, "已取消邀請")
            }
          >
            取消
          </Button>
        </div>
      ))}
    </section>
  );
}

function GroupCard({ group, data, mutate, busy, ask }) {
  const [username, setUsername] = useState("");
  const owner = group.ownerId === data.me.id;
  return (
    <section className="group-panel" aria-label={`群組 ${group.name}`}>
      <h3>{group.name}</h3>
      <div className="group-members">
        {group.memberIds.map((uid) => (
          <div className="group-row" key={uid}>
            <span>
              {data.users.find((u) => u.id === uid)?.username || "已離開成員"}
              {uid === group.ownerId ? " · 建立者" : ""}
            </span>
            {owner && uid !== data.me.id && (
              <Button
                disabled={busy}
                onClick={async () => {
                  if (
                    await ask(
                      `確定將此成員移出「${group.name}」？其他共同群組不受影響。`,
                    )
                  )
                    mutate(
                      "group.kick",
                      { groupId: group.id, userId: uid },
                      "已移出群組",
                    );
                }}
              >
                移出群組
              </Button>
            )}
          </div>
        ))}
      </div>
      {owner && (
        <form
          className="group-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await mutate(
                "group.invite",
                { groupId: group.id, username },
                "邀請已送出",
              )
            )
              setUsername("");
          }}
        >
          <Field
            label="邀請成員帳號"
            required
            maxLength={30}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="輸入對方登入帳號"
          />
          <Button primary disabled={busy}>
            送出邀請
          </Button>
        </form>
      )}
      {owner &&
        data.invitations
          .filter((i) => i.groupId === group.id)
          .map((i) => (
            <p className="muted" key={i.id}>
              等待 {i.toName} 接受邀請
            </p>
          ))}
      <Button
        disabled={busy}
        onClick={async () => {
          if (
            await ask(
              owner
                ? `離開後將解散「${group.name}」，其他群組不受影響。確定繼續？`
                : `確定離開「${group.name}」？其他共同群組不受影響。`,
            )
          )
            mutate(
              "group.leave",
              { groupId: group.id },
              owner ? "群組已解散" : "已離開群組",
            );
        }}
      >
        {owner ? "離開並解散群組" : "離開群組"}
      </Button>
    </section>
  );
}
export default function Groups({ data, mutate, busy, ask }) {
  const [name, setName] = useState("");
  const own = data.groups.filter((g) => g.memberIds.includes(data.me.id));
  return (
    <section aria-label="我的群組">
      <div className="group-panel">
        <h2>我的群組（{own.length}）</h2>
        <p className="muted">
          可建立、加入多個群組。
          {data.me.admin
            ? "管理員可查看全部角色。"
            : "可查看自己與各共同群組成員的角色。"}
        </p>
        <form
          className="group-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await mutate("group.create", { name }, "群組已建立"))
              setName("");
          }}
        >
          <Field
            label="群組名稱"
            required
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button primary disabled={busy}>
            建立群組
          </Button>
        </form>
      </div>
      {own.map((group) => (
        <GroupCard
          key={group.id}
          group={group}
          data={data}
          mutate={mutate}
          busy={busy}
          ask={ask}
        />
      ))}
      {data.me.admin && (
        <details className="group-panel">
          <summary>所有群組（{data.groups.length}）</summary>
          {data.groups.map((g) => (
            <p key={g.id}>
              {g.name} ·{" "}
              {g.memberIds
                .map(
                  (uid) =>
                    data.users.find((u) => u.id === uid)?.username ||
                    "已刪除帳號",
                )
                .join("、")}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
