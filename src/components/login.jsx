import { useState } from "react";
import { Btn } from "./ui.jsx";

export default function Login({ onLogin, error, loading }) {
  const [pin, setPin] = useState("");
  const [localError, setLocalError] = useState("");

  const handleChange = (e) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
    setPin(v);
    if (localError) setLocalError("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pin.length !== 4) {
      setLocalError("PIN must be 4 digits");
      return;
    }
    onLogin(pin);
  };

  // Derive the error directly during render instead of syncing via useEffect
  const displayError = error || localError;

  return (
    <div className="login-container">
      <div className="login-card">
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "left" }}>
          <h2>Milk Delivery Admin</h2>
          <p>Enter your 4-digit PIN to continue.</p>
          
          <div className="field">
            <label className="field-label">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={handleChange}
              className="input"
              style={{ textAlign: "center", fontSize: 24, letterSpacing: 8, fontWeight: 600 }}
              autoFocus
            />
          </div>

          <Btn type="submit" full disabled={loading} style={{ marginTop: 8 }}>
            {loading ? "Verifying…" : "Login"}
          </Btn>

          {displayError && (
            <div style={{ background: "#fef2f2", color: "#dc2626", padding: 12, borderRadius: 8, fontSize: 13, fontWeight: 500, textAlign: "center", border: "1px solid #fecaca" }}>
              {displayError}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}