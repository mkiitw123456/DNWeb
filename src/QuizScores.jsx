import { useEffect, useState } from "react";
import { Button, Field } from "./ui.jsx";
export default function QuizScores({ request, onUnauthorized }) {
  const [members, setMembers] = useState(null),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setError("");
    setMembers(null);
    request("activity.quizScores")
      .then((r) => {
        if (live) setMembers(r.members);
      })
      .catch((e) => {
        if (live) {
          setError(e.message);
          if (e.status === 401) onUnauthorized();
        }
      });
    return () => {
      live = false;
    };
  }, [request, onUnauthorized, revision]);
  const q = query.trim().toLocaleLowerCase();
  const rows = (members || [])
    .filter((m) =>
      [m.username, m.nickname].some((s) =>
        (s || "").toLocaleLowerCase().includes(q),
      ),
    )
    .sort(
      (a, b) => b.points - a.points || a.username.localeCompare(b.username),
    );
  return (
    <section>
      <h2>成員快問快答分數</h2>
      <p className="muted">
        獨立統計快問快答的參與積分與答對加分，同時仍計入活動總積分。累積分數不隨週次或明細清理歸零。舊資料僅回補尚未清除的答題紀錄，可能不包含更早的成績。
      </p>
      <Field
        label="搜尋帳號或遊戲暱稱"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="輸入名稱的一部分"
      />
      <Button onClick={() => setRevision((r) => r + 1)}>重新整理分數</Button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!members && !error && <p role="status">正在讀取快問快答分數…</p>}
      {members && (
        <div className="activity-table-scroll">
          <table className="activity-table">
            <thead>
              <tr>
                <th>成員</th>
                <th>快問快答積分</th>
                <th>答題數</th>
                <th>答對數</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.memberId}>
                  <td>
                    {m.nickname || m.username}
                    <small>
                      {m.username}
                      {!m.active ? " · 已停用" : ""}
                    </small>
                  </td>
                  <td>{m.points}</td>
                  <td>{m.count}</td>
                  <td>{m.correct}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p>找不到符合的成員。</p>}
        </div>
      )}
    </section>
  );
}
