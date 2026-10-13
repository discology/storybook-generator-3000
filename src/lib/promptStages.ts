import type { MascotName } from "../components/ui";

// One rule for which prompt cards a family sees, shared with the server (VSB-117).
export { BOTH, cardStagesFor, cardFitsChild } from "../../server/promptStages";

// Who a card is for, from the person's relationship: Parents, Grandparents or everyone.
export const audienceFor = (relationship: string | null) =>
  relationship === "Parent" || relationship === "Guardian" ? "Parents" : relationship === "Grandparent" ? "Grandparents" : null;

// What we ask when no card fits: the recorder's "Just talk" card, and home's
// question when the deck is empty (VSB-130).
export const JUST_TALK = "What would you like to remember?";

// The Baby Vambie pose a card shows when it has no artwork of its own. Fixed per
// card, so the deck and home's question show the same picture (VSB-129).
const CARD_ART: MascotName[] = ["star", "book", "open-book", "hug-book", "envelope-happy", "closedbook"];
export function cardPose(id: string | null): MascotName {
  if (!id) return CARD_ART[0];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CARD_ART[h % CARD_ART.length];
}
