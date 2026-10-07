// The Terms and Privacy Policy (VSB-44) and the texting consent shown wherever a
// phone number is entered (VSB-91). Raising TERMS_VERSION marks the current text
// as new; each person's accepted version is stored when they verify their number.

export const TERMS_VERSION = "2026-10-06";
export const TERMS_EFFECTIVE = "October 6, 2026";

export const LEGAL = {
  company: "Discology Inc",
  product: "Vambie Storybook",
  // Filled in before the pages go live.
  contactEmail: "[support email]",
  governingState: "[state]",
};

// What a person agrees to by entering their number: the same words carriers
// review for the texting campaign (VSB-8).
export const SMS_CONSENT =
  "By entering your number, you agree to get texts from Vambie Storybook: sign-in codes, the reminders you choose, and family updates. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.";

// Where the consent was given, stored with it.
export type ConsentSource = "sign-in" | "text-when-ready";
