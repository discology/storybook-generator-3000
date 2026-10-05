// Sign-in codes go through Twilio Verify, which generates, texts and checks the
// code itself (no Twilio phone number or A2P 10DLC registration needed). With no
// Twilio credentials configured, auth falls back to dev mode (code shown on screen).

const getVerifyConfig = () => {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) return null;
  return { accountSid: TWILIO_ACCOUNT_SID, authToken: TWILIO_AUTH_TOKEN, serviceSid: TWILIO_VERIFY_SERVICE_SID };
};

export const isSmsConfigured = () => getVerifyConfig() !== null;

// Twilio requires E.164 (+15551234567). Bare 10-digit numbers are assumed to be US.
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

async function verifyRequest(path: string, params: Record<string, string>) {
  const config = getVerifyConfig()!;
  const response = await fetch(`https://verify.twilio.com/v2/Services/${config.serviceSid}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export async function sendVerificationCode(phone: string): Promise<{ ok: boolean; error?: string }> {
  const result = await verifyRequest("Verifications", { To: phone, Channel: "sms" });
  if (result.ok) return { ok: true };
  console.error("Twilio Verify send failed:", result.status, result.data?.code, result.data?.message);
  return { ok: false, error: "We couldn't text that number. Check it and try again." };
}

export async function checkVerificationCode(phone: string, code: string): Promise<boolean> {
  const result = await verifyRequest("VerificationCheck", { To: phone, Code: code });
  // Twilio returns 404 once a verification has expired, been used, or hit max attempts.
  return result.ok && result.data?.status === "approved";
}
