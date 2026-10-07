// Creates Jira tickets from action items (VSB-96) with an Atlassian API token:
// JIRA_SITE (e.g. discologyinc.atlassian.net), JIRA_EMAIL, JIRA_API_TOKEN, and
// JIRA_PROJECT (default VSB).

const config = () => {
  const { JIRA_SITE, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT } = process.env;
  if (!JIRA_SITE || !JIRA_EMAIL || !JIRA_API_TOKEN) return null;
  return { site: JIRA_SITE.replace(/^https?:\/\//, "").replace(/\/$/, ""), email: JIRA_EMAIL, token: JIRA_API_TOKEN, project: JIRA_PROJECT || "VSB" };
};

export const jiraConfigured = () => config() !== null;

// Jira descriptions are Atlassian Document Format: one paragraph per line, with
// web addresses as links.
function adf(lines: string[]) {
  return {
    type: "doc",
    version: 1,
    content: lines
      .filter((line) => line.trim())
      .map((line) => ({
        type: "paragraph",
        content: line.split(/(https?:\/\/\S+)/).filter(Boolean).map((part) =>
          /^https?:\/\//.test(part) ? { type: "text", text: part, marks: [{ type: "link", attrs: { href: part } }] } : { type: "text", text: part }
        ),
      })),
  };
}

export async function createJiraIssue(input: { summary: string; lines: string[]; type: "Story" | "Task" }) {
  const c = config();
  if (!c) throw new Error("Jira isn't connected: set JIRA_SITE, JIRA_EMAIL and JIRA_API_TOKEN on the server.");
  const response = await fetch(`https://${c.site}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.email}:${c.token}`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      fields: { project: { key: c.project }, summary: input.summary.slice(0, 250), issuetype: { name: input.type }, description: adf(input.lines) },
    }),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data?.key) {
    const why = data?.errorMessages?.join(" ") || Object.values(data?.errors ?? {}).join(" ") || `Jira answered ${response.status}`;
    throw new Error(`Jira didn't create the ticket: ${why}`);
  }
  return { key: String(data.key), url: `https://${c.site}/browse/${data.key}` };
}
