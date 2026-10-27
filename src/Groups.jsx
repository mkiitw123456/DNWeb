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

export default function Groups({ data, mutate, busy, ask }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const group = data.groups.find((g) => g.memberIds.includes(data.me.id));
  const owner = group?.ownerId === data.me.id;
  return (
    <section className="group-panel" aria-label="我的群組">
      <h2>{group ? group.name : "我的群組"}</h2>
      <p className="muted">
        {data.me.admin
          ? "管理員可以查看所有成員的角色資訊。"
          : group
            ? "角色資訊僅顯示自己與同組成員。"
            : "尚未加入群組，目前只顯示自己的角色。可建立群組或等待邀請。"}
      </p>
      {!group ? (
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
          />
          <Button primary disabled={busy}>
            建立群組
          </Button>
        </form>
      ) : (
        <>
          <div className="group-members">
            {group.memberIds.map((uid) => (
              <div className="group-row" key={uid}>
                <span>
                  {data.users.find((u) => u.id === uid)?.username ||
                    "已離開成員"}
                  {uid === group.ownerId ? " · 建立者" : ""}
                </span>
                {owner && uid !== data.me.id && (
                  <Button
                    disabled={busy}
                    onClick={async () => {
                      if (await ask("確定將此成員移出群組？"))
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
                placeholder="輸入對方登入帳號"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={30}
                required
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
                    ? "你是建立者，離開後將解散群組，移除所有成員與尚未接受的邀請。確定繼續？"
                    : "確定離開群組？離開後將只能看到自己的角色。",
                )
              )
                mutate("group.leave", {}, owner ? "群組已解散" : "已離開群組");
            }}
          >
            {owner ? "離開並解散群組" : "離開群組"}
          </Button>
        </>
      )}
      {data.me.admin && (
        <details>
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
              {data.invitations.some((i) => i.groupId === g.id) && (
                <small>
                  {" "}
                  · 待接受邀請：
                  {data.invitations
                    .filter((i) => i.groupId === g.id)
                    .map((i) => i.toName)
                    .join("、")}
                </small>
              )}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
