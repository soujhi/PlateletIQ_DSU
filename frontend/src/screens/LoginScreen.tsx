import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL } from "../api/client";

/**
 * Stage one of sign-in: establish who you are.
 *
 * No facility is chosen here — that is the next screen — so nothing on this
 * page assumes a hospital.
 */
export default function LoginScreen() {
  const {
    authConfig,
    configError,
    authError,
    signInWithGoogleCredential,
    signInWithGoogleRedirect,
    signInForDevelopment,
  } = useAuth();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devEmail, setDevEmail] = useState("");
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [googleButtonRendered, setGoogleButtonRendered] = useState(false);

  const clientId = authConfig?.google_client_id ?? null;

  // Render Google's own button when the server has a client id configured.
  // Google Identity Services must be told the client id the backend will
  // validate against, so it comes from /auth/config rather than a build flag.
  useEffect(() => {
    if (!clientId || !googleButtonRef.current) return;

    let cancelled = false;

    function initialise() {
      const google = (window as unknown as { google?: any }).google;
      if (cancelled || !google?.accounts?.id || !googleButtonRef.current) return;

      google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential?: string }) => {
          if (!response.credential) return;
          setBusy(true);
          setError(null);
          try {
            await signInWithGoogleCredential(response.credential);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Google sign-in failed.");
          } finally {
            setBusy(false);
          }
        },
      });

      googleButtonRef.current.innerHTML = "";
      google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        width: 320,
        shape: "pill",
        text: "signin_with",
      });
      setGoogleButtonRendered(true);
    }

    const existing = document.getElementById("google-gsi-script") as HTMLScriptElement | null;
    if (existing) {
      initialise();
    } else {
      const script = document.createElement("script");
      script.id = "google-gsi-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initialise;
      document.body.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, [clientId, signInWithGoogleCredential]);

  async function handleRedirect() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogleRedirect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Google sign-in.");
      setBusy(false);
    }
  }

  async function handleDevSignIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInForDevelopment(devEmail.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  const serverUnreachable = authConfig === null;
  const message = error ?? authError;

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12" style={{ background: "#0B0B10" }}>
      <div className="w-full max-w-[880px] grid md:grid-cols-[1.1fr_1fr] rounded-[20px] overflow-hidden shadow-2xl">
        {/* Left: what this is */}
        <div className="hidden md:flex flex-col justify-between p-10" style={{ background: "#14141C" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[8px] flex items-center justify-center" style={{ background: "#C41230" }}>
              <span className="text-white text-[14px] font-bold">P</span>
            </div>
            <span className="text-[17px] font-semibold text-white">PlateletIQ</span>
          </div>

          <div>
            <h2 className="text-[26px] font-semibold text-white leading-tight tracking-tight">
              Platelets expire in five days.
            </h2>
            <p className="text-[14px] mt-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
              One hospital discards units the same week another turns a patient away. PlateletIQ
              connects registered blood centres so a surplus can reach a shortage before the shelf
              life runs out — with custody verified at both ends.
            </p>
          </div>

          <ul className="space-y-2.5">
            {[
              "Forecast demand before the shortage arrives",
              "Move units between facilities with verified handover",
              "Track the shipment on a live map, end to end",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <span className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#C41230" }} />
                <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.5)" }}>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right: sign in */}
        <div className="bg-white p-10 flex flex-col justify-center">
          <div className="md:hidden flex items-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-[8px] flex items-center justify-center" style={{ background: "#C41230" }}>
              <span className="text-white text-[14px] font-bold">P</span>
            </div>
            <span className="text-[17px] font-semibold text-[#1D1D1F]">PlateletIQ</span>
          </div>

          <h1 className="text-[26px] font-semibold text-[#1D1D1F] tracking-tight">Sign in</h1>
          <p className="text-[14px] text-[#6E6E73] mt-1.5 mb-7">
            You will choose your facility next.
          </p>

          {message && (
            <div className="mb-5 rounded-[10px] px-4 py-3" style={{ background: "#FFF2F2", border: "1px solid #F5C6C6" }}>
              <p className="text-[13px] text-[#B3261E] leading-relaxed">{message}</p>
            </div>
          )}

          {serverUnreachable && (
            <div className="mb-5 rounded-[10px] px-4 py-3" style={{ background: "#FFF8E6", border: "1px solid #F0DCA8" }}>
              <p className="text-[13px] text-[#8A6100] leading-relaxed">
                Waiting for the API at <code className="font-mono text-[12px]">{API_BASE_URL}</code>…
              </p>
              {configError && (
                <p className="text-[12px] text-[#8A6100] mt-1.5 leading-relaxed opacity-80">{configError}</p>
              )}
              <p className="text-[12px] text-[#8A6100] mt-2 leading-relaxed opacity-80">
                Start the backend and this page will connect on its own — no reload needed. If the
                address above is wrong, set <code className="font-mono text-[11px]">VITE_API_BASE_URL</code>{" "}
                in <code className="font-mono text-[11px]">frontend/.env.local</code>.
              </p>
            </div>
          )}

          {clientId && (
            <div className="flex flex-col items-center">
              <div ref={googleButtonRef} className="min-h-[44px]" />
              {!googleButtonRendered && (
                <button
                  type="button"
                  onClick={handleRedirect}
                  disabled={busy}
                  className="w-full py-3 border border-[#E5E5E7] text-[#1D1D1F] text-[14px] font-medium rounded-full hover:bg-[#F5F5F7] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Continue with Google
                </button>
              )}
            </div>
          )}

          {authConfig && !authConfig.google_enabled && (
            <div className="rounded-[10px] px-4 py-3 mb-5" style={{ background: "#F5F5F7", border: "1px solid #E5E5E7" }}>
              <p className="text-[13px] text-[#6E6E73] leading-relaxed">
                Google sign-in is not configured on this server. Set <code className="font-mono text-[12px]">GOOGLE_CLIENT_ID</code>
                {" "}and <code className="font-mono text-[12px]">GOOGLE_CLIENT_SECRET</code> in the backend environment.
              </p>
            </div>
          )}

          {authConfig?.dev_signin_enabled && (
            <>
              {clientId && (
                <div className="flex items-center gap-4 my-6">
                  <div className="flex-1 h-px bg-[#E5E5E7]" />
                  <span className="text-[12px] text-[#AEAEB2]">or</span>
                  <div className="flex-1 h-px bg-[#E5E5E7]" />
                </div>
              )}

              <form onSubmit={handleDevSignIn} className="space-y-3">
                <label className="block text-[12px] font-semibold text-[#1D1D1F] uppercase tracking-wider">
                  Local sign-in
                </label>
                <input
                  type="email"
                  required
                  value={devEmail}
                  onChange={(event) => setDevEmail(event.target.value)}
                  placeholder="officer@hospital.example"
                  className="w-full bg-[#F5F5F7] border border-[#E5E5E7] text-[#1D1D1F] text-[14px] rounded-[10px] px-3.5 py-3 focus:outline-none focus:border-[#0071E3]"
                />
                <button
                  type="submit"
                  disabled={busy || !devEmail.trim()}
                  className="w-full py-3 text-white text-[15px] font-medium rounded-full transition-colors disabled:opacity-50 cursor-pointer"
                  style={{ background: "#1D1D1F" }}
                >
                  {busy ? "Signing in…" : "Continue"}
                </button>
                <p className="text-[11px] text-[#AEAEB2] leading-relaxed">
                  Enabled because the server has <code className="font-mono">ALLOW_DEV_SIGNIN=1</code>. Use two
                  different addresses on two machines to run both sides of a transfer.
                </p>
              </form>
            </>
          )}

          <p className="text-[11px] text-[#AEAEB2] mt-8 text-center leading-relaxed">
            Facility data sourced from the eRaktKosh national blood bank registry.
          </p>
        </div>
      </div>
    </div>
  );
}
