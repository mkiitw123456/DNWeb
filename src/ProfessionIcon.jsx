export default function ProfessionIcon({ profession }) {
  const name = profession?.name || "未設定職業";
  return (
    <span
      className="profession-icon"
      title={name}
      aria-label={name}
      tabIndex={0}
    >
      {profession?.icon ? (
        <img src={profession.icon} alt={name} width="36" height="36" />
      ) : (
        <span aria-hidden="true">?</span>
      )}
      <span className="profession-tooltip" role="tooltip">
        {name}
      </span>
    </span>
  );
}
