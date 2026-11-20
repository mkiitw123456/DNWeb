import {
  Palette,
  MessageSquare,
  BookOpen,
  UserRound,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { Heading, Field, Button } from "./ui.jsx";
import { useState } from "react";
import { MusicSettings } from "./ThemeMusic.jsx";
import SoundSettings from "./SoundSettings.jsx";
export default function SettingsPanel({
  me,
  onTheme,
  onDiscord,
  onTour,
  mutate,
  isSaving,
}) {
  const [nickname, setNickname] = useState(me.nickname || "");
  const discordSet = !!me.discordId;
  return (
    <section className="settings-panel">
      <Heading title="設定" description="調整你的使用習慣與帳號設定" />
      <form
        className="nickname-settings"
        onSubmit={(e) => {
          e.preventDefault();
          mutate("profile.nickname", { nickname }, "暱稱已儲存");
        }}
      >
        <Field
          label="顯示暱稱"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          required
          maxLength={30}
          placeholder={me.username}
        />
        <Button primary disabled={isSaving("profile.nickname", { nickname })}>
          儲存暱稱
        </Button>
        <p className="muted">登入帳號不變，公開顯示改用暱稱。</p>
      </form>
      <SoundSettings />
      <MusicSettings />
      <div className="settings-options">
        <button className="settings-option" onClick={onTheme}>
          <Palette size={23} />
          <span>
            <strong>外觀設定</strong>
            <small>背景、按鈕與漸層，儲存在這台瀏覽器</small>
          </span>
          <ChevronRight size={18} />
        </button>
        {!discordSet && (
          <button className="settings-option" onClick={onDiscord}>
            <UserRound size={23} />
            <span>
              <strong>Discord 身分</strong>
              <small>搜尋伺服器暱稱，選擇自己的帳號</small>
            </span>
            <ChevronRight size={18} />
          </button>
        )}
        <button className="settings-option" onClick={onTour}>
          <BookOpen size={23} />
          <span>
            <strong>新手導覽</strong>
            <small>重新認識每日活動、角色資訊與網站操作</small>
          </span>
          <ChevronRight size={18} />
        </button>
      </div>
      {discordSet && (
        <p className="settings-status">
          <CheckCircle2 size={17} />
          {me.discordId
            ? "Discord 身分已綁定"
            : "Discord 身分已送出，等待管理員確認"}
        </p>
      )}
      <a
        className="settings-option settings-feedback"
        href="https://discord.com/channels/1552490009414737950/1572082655762325604"
        target="_blank"
        rel="noopener noreferrer"
      >
        <MessageSquare size={23} />
        <span>
          <strong>有任何修改建議請在這留言</strong>
          <small>前往 Discord 建議留言頻道（開啟新分頁）</small>
        </span>
        <ChevronRight size={18} />
      </a>
    </section>
  );
}
