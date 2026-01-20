import logoSvg from "../../assets/logo.svg";
import "./AppLogo.css";

export function AppLogo() {
  return (
    <div className="app-logo">
      <div className="app-logo__image-wrapper">
        <img src={logoSvg} alt="Insight Reader" className="app-logo__image" />
      </div>
      <div className="app-logo__label">
        Insight<br />Reader
      </div>
    </div>
  );
}
