import { ageInYears } from "./readingStages";

// Who a prompt card is for (VSB-117), stored in Prompt.childStage:
//   "All stages"  Both: expecting families and born children of any age
//   "Expecting"   only while the baby is on the way
//   "Born"        any age, once the child is born
//   "Newborn"     born, under 1
//   "Toddler"     born, 1 to 3
// The recorder, the try-it screen and the question of the week all use this,
// so they can't disagree about which cards a family sees.

export const BOTH = "All stages";

export function cardStagesFor(child: { stage: string; birthDate: Date | string | null }, now = new Date()) {
  if (child.stage === "expecting") return [BOTH, "Expecting"];
  const age = ageInYears(child.birthDate, now);
  if (age !== null && age < 1) return [BOTH, "Born", "Newborn"];
  if (age !== null && age < 4) return [BOTH, "Born", "Toddler"];
  return [BOTH, "Born"];
}

export const cardFitsChild = (cardStage: string, child: { stage: string; birthDate: Date | string | null }) =>
  cardStagesFor(child).includes(cardStage);
