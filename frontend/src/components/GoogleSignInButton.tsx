import { GoogleLogin } from "@react-oauth/google";
import { api, extractErrorMessage } from "../api/client";

interface Props {
  onSuccess: (token: string) => void;
  onError: (message: string) => void;
}

/** Renders nothing if VITE_GOOGLE_CLIENT_ID isn't set — Google sign-in is optional. */
export function GoogleSignInButton({ onSuccess, onError }: Props) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) return null;

  return (
    <div className="flex justify-center">
      <GoogleLogin
        onSuccess={async (credentialResponse) => {
          if (!credentialResponse.credential) {
            onError("Google didn't return a credential. Please try again.");
            return;
          }
          try {
            const res = await api.post("/auth/google", { idToken: credentialResponse.credential });
            localStorage.setItem("ham_token", res.data.token);
            onSuccess(res.data.token);
          } catch (err) {
            onError(extractErrorMessage(err));
          }
        }}
        onError={() => onError("Google sign-in was cancelled or failed.")}
        theme="outline"
        shape="pill"
        text="continue_with"
      />
    </div>
  );
}
