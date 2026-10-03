import {
  useEffect,
  useRef,
  useContext,
  createContext,
  cloneElement,
  isValidElement,
} from "react";
import { X, Plus } from "lucide-react";
export const FormErrorContext = createContext("");
export const money = (n) => Number(n).toLocaleString("zh-TW");
export function Button({ children, primary = false, ...props }) {
  return (
    <button className={primary ? "primary" : ""} {...props}>
      {children}
    </button>
  );
}
export function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {isValidElement(children) ? (
        cloneElement(children, {
          "aria-label": children.props["aria-label"] || label,
        })
      ) : (
        <input aria-label={label} {...props} />
      )}
    </label>
  );
}
export function NumberField(props) {
  return <Field type="number" min="0" step="1" required {...props} />;
}
export function Empty({ title, description, action }) {
  return (
    <div className="empty">
      <div className="empty-mark">◇</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Modal({ title, children, onClose }) {
  const ref = useRef();
  const error = useContext(FormErrorContext);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button aria-label="關閉" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {children}
    </dialog>
  );
}
export function Heading({ title, description, onAdd, addLabel }) {
  return (
    <header className="heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {onAdd && (
        <Button primary onClick={onAdd}>
          <Plus size={18} />
          {addLabel}
        </Button>
      )}
    </header>
  );
}
export function FormActions({ busy, onClose }) {
  return (
    <div className="form-actions">
      <Button type="button" onClick={onClose}>
        取消
      </Button>
      <Button primary disabled={busy}>
        {busy ? "儲存中…" : "儲存"}
      </Button>
    </div>
  );
}
