import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import AccessDenied from "../components/AccessDenied";
import { IconDatabase, IconDownload, IconFileText, IconShield, IconTrash } from "../components/icons";
import { Chev, Field, Loading, Masthead, MenuRow, Note, Select, Sheet, Switch } from "../components/ui";
import { useStorybookData } from "../hooks/useStorybookData";
import { apiSend, ApiError } from "../lib/api";

export default function SettingsPrivacy() {
  const { id } = useParams();
  const { storybook, status, reload } = useStorybookData(id);
  const [form, setForm] = useState({ defaultVisibility: "contributor_only", defaultStoryUse: true, keepRecordings: true });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (storybook) setForm({ defaultVisibility: storybook.defaultVisibility, defaultStoryUse: storybook.defaultStoryUse, keepRecordings: storybook.keepRecordings });
  }, [storybook]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const save = async () => {
    setError(null);
    try {
      await apiSend(`/api/storybooks/${id}/settings`, "PUT", form);
      setSaved(true);
      reload(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
    }
  };

  if (status === "denied") return <AccessDenied />;
  if (!storybook) return <Loading />;
  const base = `/storybooks/${storybook.id}`;
  const owner = storybook.me.role === "owner";

  return (
    <div className="page">
      <TopBar back={`${base}/settings`} wordmark />
      <Masthead title={<>Your memories.<br />Your choices.</>} style={{ paddingTop: 0, paddingRight: 140 }} />
      <Sheet peek="peek" grow>
        {owner && (
          <>
            <h2 className="h-title">Defaults for new memories</h2>
            <Field label="Original recording visibility" htmlFor="visibility">
              <Select
                id="visibility"
                value={form.defaultVisibility}
                onChange={(v) => set("defaultVisibility", v)}
                options={[
                  { value: "contributor_only", label: "Only me" },
                  { value: "household", label: "Everyone in the family" },
                ]}
              />
            </Field>
            <div className="toggle-row" style={{ marginTop: 18 }}>
              <span className="t-body" style={{ fontWeight: 500 }}>Use new memories in stories</span>
              <Switch checked={form.defaultStoryUse} onChange={(v) => set("defaultStoryUse", v)} label="Use new memories in stories" />
            </div>
            <p className="field__hint">Your recording stays private. Generated stories can be shared with your family.</p>
            <div className="toggle-row" style={{ marginTop: 16 }}>
              <span className="t-body" style={{ fontWeight: 500 }}>Keep voice recordings</span>
              <Switch checked={form.keepRecordings} onChange={(v) => set("keepRecordings", v)} label="Keep voice recordings" />
            </div>
            <p className="field__hint">When this is off, only the words are kept: each recording is deleted once it's transcribed.</p>
            <Note kind="info" style={{ marginTop: 14 }}>You can change these choices when saving each memory.</Note>
            {error && <p className="error-text">{error}</p>}
            <button className="btn btn--lime btn--caps" style={{ marginTop: 16 }} onClick={() => void save()}>
              {saved ? "Saved" : "Save defaults"} <Chev />
            </button>
            <hr className="divider" style={{ margin: "22px 0 8px" }} />
          </>
        )}
        <h2 className="h-title">Your data</h2>
        <div className="menu" style={{ marginTop: 4 }}>
          <MenuRow icon={<IconDownload size={24} />} title="Export my memories" to={`${base}/settings/export`} />
          <MenuRow icon={<IconDatabase size={24} />} title="Manage saved memories" to={`${base}/memories?tab=memories`} />
          <MenuRow icon={<IconTrash size={24} />} title="Delete account" sub="Review what will be removed before confirming." to={`${base}/settings/delete-account`} danger />
        </div>
        <h2 className="h-title" style={{ marginTop: 22 }}>The fine print</h2>
        <div className="menu" style={{ marginTop: 4 }}>
          <MenuRow icon={<IconShield size={24} />} title="Privacy Policy" to="/privacy" />
          <MenuRow icon={<IconFileText size={24} />} title="Terms of Service" to="/terms" />
        </div>
      </Sheet>
    </div>
  );
}
