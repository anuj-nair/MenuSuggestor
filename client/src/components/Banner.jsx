export default function Banner({ type = 'info', children, onDismiss }) {
  if (!children) return null;
  return (
    <div className={`banner banner-${type}`}>
      <span>{children}</span>
      {onDismiss && (
        <button className="banner-dismiss" onClick={onDismiss} aria-label="Dismiss">
          &times;
        </button>
      )}
    </div>
  );
}
