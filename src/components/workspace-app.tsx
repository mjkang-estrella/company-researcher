"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { BriefRecord, CompanyRecord, ProfileRecord, WorkspaceResponse } from "@/lib/types";

type ApiError = {
  error: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error((payload as ApiError).error || "Request failed.");
  }
  return payload as T;
}

function formatStatus(status: CompanyRecord["status"]) {
  return status.replace("-", " ");
}

function firstWords(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 179)}…` : compact;
}

export function WorkspaceApp() {
  const [snapshot, setSnapshot] = useState<WorkspaceResponse["snapshot"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingResume, startSavingResume] = useTransition();
  const [updatingBrief, startUpdatingBrief] = useTransition();
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [search, setSearch] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeNotes, setResumeNotes] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const addCompanyModalRef = useRef<HTMLDivElement>(null);
  const settingsModalRef = useRef<HTMLDivElement>(null);

  const selectedCompany = useMemo(() => {
    if (!snapshot?.selectedCompanyId) return null;
    return snapshot.companies.find((company) => company._id === snapshot.selectedCompanyId) ?? null;
  }, [snapshot?.selectedCompanyId, snapshot?.companies]);

  const selectedBrief = selectedCompany ? snapshot?.briefsByCompanyId[selectedCompany._id] : null;
  const profileSummary = profileLike(snapshot?.profile)?.derived.others.summary;
  const companyDescription = selectedBrief
    ? selectedBrief.overview
    : selectedCompany
      ? `Saved workspace entry${selectedCompany.url ? ` · ${selectedCompany.url}` : ""}`
      : "Saved company research workspace";

  async function loadWorkspace() {
    try {
      setLoading(true);
      const data = await readJson<WorkspaceResponse>(await fetch("/api/workspace", { cache: "no-store" }));
      setSnapshot(data.snapshot);
      setResumeNotes(data.snapshot.profile?.supplementalNotes ?? "");
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load workspace.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspace();
  }, []);

  const trapFocus = useCallback((modalRef: React.RefObject<HTMLDivElement | null>) => {
    const modal = modalRef.current;
    if (!modal) return;
    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  }, []);

  useEffect(() => {
    if (showAddCompany) trapFocus(addCompanyModalRef);
  }, [showAddCompany, trapFocus]);

  useEffect(() => {
    if (showSettings) trapFocus(settingsModalRef);
  }, [showSettings, trapFocus]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (showAddCompany) setShowAddCompany(false);
        else if (showSettings) setShowSettings(false);
      }
    }
    if (showAddCompany || showSettings) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [showAddCompany, showSettings]);

  function handleModalKeyDown(event: React.KeyboardEvent, modalRef: React.RefObject<HTMLDivElement | null>) {
    if (event.key !== "Tab") return;
    const modal = modalRef.current;
    if (!modal) return;
    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function handleSaveResume(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startSavingResume(async () => {
      try {
        const formData = new FormData();
        if (resumeFile) {
          formData.append("resume", resumeFile);
        }
        formData.append("notes", resumeNotes);

        await readJson(await fetch("/api/profile", { method: "POST", body: formData }));
        setResumeFile(null);
        setShowSettings(false);
        await loadWorkspace();
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Failed to save resume.");
      }
    });
  }

  async function handleAddCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await readJson(
        await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: companyName, url: companyUrl || undefined }),
        }),
      );
      setCompanyName("");
      setCompanyUrl("");
      setShowAddCompany(false);
      await loadWorkspace();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Failed to add company.");
    }
  }

  async function selectCompany(companyId: string) {
    try {
      await readJson(
        await fetch(`/api/companies/${companyId}/select`, {
          method: "PATCH",
        }),
      );
      await loadWorkspace();
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Failed to select company.");
    }
  }

  async function deleteCompany(companyId: string) {
    try {
      await readJson(
        await fetch(`/api/companies/${companyId}`, {
          method: "DELETE",
        }),
      );
      await loadWorkspace();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete company.");
    }
  }

  async function generateBrief(companyId: string) {
    startUpdatingBrief(async () => {
      try {
        await readJson(
          await fetch(`/api/companies/${companyId}/generate`, {
            method: "POST",
          }),
        );
        await loadWorkspace();
      } catch (generationError) {
        setError(generationError instanceof Error ? generationError.message : "Failed to generate brief.");
      }
    });
  }

  const filteredCompanies =
    snapshot?.companies.filter((company) =>
      `${company.name} ${company.url ?? ""}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];

  const profile = snapshot?.profile as ProfileRecord | null;
  const recentSignalCitations =
    sectionCitations("overview")
      .filter((citation) => citation.note === "news")
      .slice(0, 4);

  function sectionConfidence(key: string) {
    return selectedBrief?.sections.find((section) => section.key === key)?.confidence;
  }

  function sectionLimited(key: string) {
    return selectedBrief?.sections.find((section) => section.key === key)?.limitedData;
  }

  function sectionCitations(key: string) {
    return selectedBrief?.sections.find((section) => section.key === key)?.citations ?? [];
  }

  return (
    <>
      <div className="app-grid">
        <nav className="company-list-panel">
          <div className="company-list-header">
            <span className="label">Companies</span>
            <div className="company-list-actions">
              <button type="button" onClick={() => setShowAddCompany(true)} title="Add company">
                +
              </button>
            </div>
          </div>

          <div className="company-list-search">
            <input
              placeholder="Search..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search companies"
            />
          </div>

          <div className="company-list-items">
            {filteredCompanies.map((company) => (
              <div
                key={company._id}
                className={`company-item ${company._id === snapshot?.selectedCompanyId ? "active" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => selectCompany(company._id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void selectCompany(company._id);
                  }
                }}
              >
                <div className="company-item-info">
                  <span className="company-item-name">{company.name}</span>
                  <span className="company-item-meta">{company.url || formatStatus(company.status)}</span>
                </div>
                <button
                  className={`company-item-remove ${confirmingDeleteId === company._id ? "confirming" : ""}`}
                  type="button"
                  aria-label={confirmingDeleteId === company._id ? `Confirm remove ${company.name}` : `Remove ${company.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (confirmingDeleteId === company._id) {
                      setConfirmingDeleteId(null);
                      void deleteCompany(company._id);
                    } else {
                      setConfirmingDeleteId(company._id);
                    }
                  }}
                  onBlur={() => setConfirmingDeleteId(null)}
                >
                  ×
                </button>
              </div>
            ))}

            {!loading && filteredCompanies.length === 0 ? (
              <div className="company-list-search">
                <span className="empty-inline">No matching companies yet.</span>
              </div>
            ) : null}
          </div>

          <button className="settings-trigger" type="button" onClick={() => setShowSettings(true)}>
            <span className="settings-trigger-label">Settings</span>
            <span className="settings-trigger-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c0 .66.39 1.26 1 1.51H21a2 2 0 1 1 0 4h-.09c-.61.25-1 .85-1.51 1.49Z" />
              </svg>
            </span>
          </button>
        </nav>

        <header className="header-panel">
          <div className="header-title-area">
            <h1>{selectedCompany?.name || "Company Researcher"}</h1>
            <p className="company-description">{companyDescription}</p>
          </div>
          <div className="header-actions">
            {selectedCompany ? (
              <button
                className="pill active"
                type="button"
                disabled={updatingBrief || !profile}
                aria-busy={updatingBrief}
                onClick={() => generateBrief(selectedCompany._id)}
              >
                {updatingBrief ? "Generating…" : selectedBrief ? "Refresh Brief" : "Generate Brief"}
              </button>
            ) : null}
            <button className="icon-btn-circle" type="button" aria-label="Reload workspace" onClick={() => loadWorkspace()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
            <button className="icon-btn-circle" type="button" aria-label="Add company" onClick={() => setShowAddCompany(true)}>
              +
            </button>
          </div>
        </header>

        <aside className="sidebar-panel">
          <div className="panel-section highlighted">
            <div className="panel-header-row">
              <h2>Positioning Angle</h2>
              {selectedBrief ? <span className="pill pill-tag">{sectionConfidence("appeal")}</span> : null}
            </div>

            {!profile ? (
              <div className="empty-state-panel">
                <p className="no-mb">Upload the shared resume first to unlock the personalized appeal angle.</p>
              </div>
            ) : !selectedCompany ? (
              <div className="empty-state-panel">
                <p className="no-mb">Add a company to start creating a tailored positioning angle.</p>
              </div>
            ) : !selectedBrief ? (
              <div className="empty-state-panel">
                <p>Generate a stored brief for {selectedCompany.name}. It will stay stable until you refresh it.</p>
                <div className="inline-actions">
                  <button
                    className="pill active"
                    type="button"
                    disabled={updatingBrief}
                    onClick={() => generateBrief(selectedCompany._id)}
                  >
                    {updatingBrief ? "Generating…" : "Generate Brief"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <span className="label">Matched Attributes</span>
                <div className="pill-group" style={{ marginBottom: "2rem" }}>
                  {profile.derived.others.skills.slice(0, 3).map((skill) => (
                    <span key={skill} className="pill">
                      {skill}
                    </span>
                  ))}
                </div>

                <span className="label">Narrative Focus</span>
                {selectedBrief.appealAngle.talkTracks.slice(0, 2).map((track) => (
                  <p key={track}>{track}</p>
                ))}

                {sectionLimited("appeal") ? (
                  <div className="notice-panel">
                    <p className="no-mb">This section has limited source support. Use the citations before relying on it heavily.</p>
                  </div>
                ) : null}

                <details className="section-citations">
                  <summary>View citations</summary>
                  <ul>
                    {sectionCitations("appeal").map((citation) => (
                      <li key={`${citation.url}-${citation.title}`}>
                        <a href={citation.url} rel="noreferrer" target="_blank">
                          {citation.title}
                        </a>
                        {citation.note ? ` · ${citation.note}` : null}
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </div>

          <div className="panel-section">
            <div className="panel-header-row">
              <h2>Overview</h2>
            </div>
            <div className="data-grid">
              <div className="data-item">
                <span className="label">Profile</span>
                <span className="data-value">{profile ? "Ready" : "Missing"}</span>
              </div>
              <div className="data-item">
                <span className="label">Companies</span>
                <span className="data-value">{snapshot?.companies.length ?? 0}</span>
              </div>
              <div className="data-item">
                <span className="label">Status</span>
                <span className="data-value">{selectedCompany ? formatStatus(selectedCompany.status) : "Idle"}</span>
              </div>
              <div className="data-item">
                <span className="label">Updated</span>
                <span className="data-value">
                  {selectedCompany?.lastGeneratedAt ? new Date(selectedCompany.lastGeneratedAt).toLocaleDateString() : "—"}
                </span>
              </div>
            </div>

            {profileSummary ? (
              <>
                <span className="label" style={{ marginTop: "2rem" }}>
                  Profile Summary
                </span>
                <p className="no-mb">{firstWords(profileSummary, "")}</p>
              </>
            ) : null}
          </div>
        </aside>

        <main className="main-panel">
          {error ? (
            <div className="panel-section" style={{ borderBottom: "var(--border)" }}>
              <div className="notice-panel notice-panel-row">
                <p className="no-mb">{error}</p>
                <div className="notice-panel-actions">
                  <button type="button" className="btn-cancel" onClick={() => loadWorkspace()}>Retry</button>
                  <button type="button" className="notice-dismiss" aria-label="Dismiss error" onClick={() => setError(null)}>×</button>
                </div>
              </div>
            </div>
          ) : null}

          {!profile || !selectedCompany || !selectedBrief ? (
            <div className="panel-section" style={{ gridRow: "1 / -1" }}>
              <div className="panel-header-row">
                <h2>Research Brief</h2>
                {loading ? <span className="pill pill-tag">LOADING</span> : null}
              </div>
              <div className="empty-state-panel">
                {!profile ? (
                  <p className="no-mb">Upload the shared resume in the left rail to derive the reusable candidate profile.</p>
                ) : !selectedCompany ? (
                  <p className="no-mb">Add a company in the left rail to open a saved workspace entry.</p>
                ) : (
                  <p className="no-mb">No stored brief yet for {selectedCompany.name}. Generate it from the header to fetch live data and save a snapshot.</p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="main-panel-top">
                <div className="panel-section border-right">
                  <div className="panel-header-row">
                    <h2>Current Needs</h2>
                    <span className="pill pill-tag">ANALYSIS</span>
                  </div>
                  <p>{selectedBrief.currentDirectionAndNeeds}</p>
                  <details className="section-citations">
                    <summary>View citations</summary>
                    <ul>
                      {sectionCitations("current-direction").map((citation) => (
                        <li key={`${citation.url}-${citation.title}`}>
                          <a href={citation.url} rel="noreferrer" target="_blank">
                            {citation.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>

                <div className="panel-section">
                  <div className="panel-header-row">
                    <h2>Recent Signals</h2>
                    <span className="pill pill-tag">{sectionConfidence("overview")}</span>
                  </div>
                  {recentSignalCitations.length ? (
                    <ul className="stark-list">
                      {recentSignalCitations.map((citation) => (
                        <li key={`${citation.url}-${citation.title}`}>
                          <a href={citation.url} rel="noreferrer" target="_blank">
                            {citation.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="no-mb">No recent signals available yet.</p>
                  )}
                </div>
              </div>

              <div className="panel-section">
                <div className="panel-header-row">
                  <h2>Questions to Ask</h2>
                  <div className="pill-group">
                    <span className="pill active">General</span>
                    <span className="pill">Personalized</span>
                    <span className={`pill ${selectedBrief.sections.some((section) => section.limitedData) ? "warning" : "success"}`}>
                      {selectedBrief.sections.some((section) => section.limitedData) ? "Limited Data" : "Well Supported"}
                    </span>
                  </div>
                </div>

                <div className="questions-grid">
                  <div>
                    <h3>Research-backed</h3>
                    <ul className="stark-list">
                      {selectedBrief.suggestedQuestions.general.map((question) => (
                        <li key={question}>{question}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3>Personalized</h3>
                    <ul className="stark-list">
                      {selectedBrief.suggestedQuestions.personalized.map((question) => (
                        <li key={question}>{question}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <span className="label">Overview</span>
                <p>{selectedBrief.overview}</p>

                <span className="label">Talking Points</span>
                <ul className="stark-list">
                  {selectedBrief.appealAngle.talkingPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>

                <details className="section-citations">
                  <summary>View question citations</summary>
                  <ul>
                    {sectionCitations("questions").map((citation) => (
                      <li key={`${citation.url}-${citation.title}`}>
                        <a href={citation.url} rel="noreferrer" target="_blank">
                          {citation.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </>
          )}
        </main>
      </div>

      {showAddCompany ? (
        <div className="modal-overlay" role="presentation" onClick={() => setShowAddCompany(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-company-title"
            ref={addCompanyModalRef}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleModalKeyDown(event, addCompanyModalRef)}
          >
            <h2 id="add-company-title">Add Company</h2>
            <p className="app-hint">Use the optional URL only when the company name needs disambiguation.</p>
            <form onSubmit={handleAddCompany}>
              <label htmlFor="company-name" className="label">Company name</label>
              <input
                id="company-name"
                placeholder="e.g. Acme Corp"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                required
              />
              <label htmlFor="company-url" className="label" style={{ marginTop: "0.75rem" }}>Company URL</label>
              <input
                id="company-url"
                placeholder="Optional, for disambiguation"
                value={companyUrl}
                onChange={(event) => setCompanyUrl(event.target.value)}
              />
              <div className="modal-actions">
                <button className="btn-cancel" type="button" onClick={() => setShowAddCompany(false)}>
                  Cancel
                </button>
                <button className="btn-add" type="submit">
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showSettings ? (
        <div className="modal-overlay" role="presentation" onClick={() => setShowSettings(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            ref={settingsModalRef}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleModalKeyDown(event, settingsModalRef)}
          >
            <h2 id="settings-title">Settings</h2>
            <p className="app-hint">Shared resume settings apply across all saved companies in this workspace.</p>
            <form className="resume-panel" onSubmit={handleSaveResume}>
              <div className="resume-panel-header">
                <h3>Shared Resume</h3>
                <span className="label no-mb">All Companies</span>
              </div>

              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)}
                aria-label="Upload resume"
              />

              <p className="resume-file-meta no-mb">
                {resumeFile?.name || profile?.sourceFileName || "Upload a text-based PDF resume"}
              </p>

              <textarea
                placeholder="Optional notes to reuse across all company briefs."
                value={resumeNotes}
                onChange={(event) => setResumeNotes(event.target.value)}
                aria-label="Shared resume notes"
              />

              <p className="resume-helper no-mb">
                Raw PDFs are processed ephemerally. Only the derived profile and notes are stored.
              </p>

              <div className="modal-actions">
                <button className="btn-cancel" type="button" onClick={() => setShowSettings(false)}>
                  Cancel
                </button>
                <button className="btn-add" type="submit" disabled={savingResume}>
                  {savingResume ? "Saving…" : "Save Profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function profileLike(profile: ProfileRecord | null | undefined) {
  return profile ?? null;
}
