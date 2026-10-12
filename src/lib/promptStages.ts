// One rule for which prompt cards a family sees, shared with the server (VSB-117).
export { BOTH, cardStagesFor, cardFitsChild } from "../../server/promptStages";

// Who a card is for, from the person's relationship: Parents, Grandparents or everyone.
export const audienceFor = (relationship: string | null) =>
  relationship === "Parent" || relationship === "Guardian" ? "Parents" : relationship === "Grandparent" ? "Grandparents" : null;
