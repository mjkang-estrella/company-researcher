Overview
A tool that helps job seekers prepare for cold outreach or company treks by generating tailored research briefs. The user provides one or more company names and a shared resume, the tool pulls live data from the web, and it produces a structured output for the selected company covering the company's overview, current direction and needs, suggested questions to ask, and a personalized appeal angle based on the user's background. The brief is delivered as a web page the user reads on screen, and the workspace can store multiple saved companies plus a shared resume input for reuse across researches.

Problem
Job seekers approaching a company cold — whether for outreach or a company trek — often lack the time or framework to research effectively and connect that research back to their own profile. Generic research doesn't help them stand out; they need both current company intelligence and a personalized angle derived from their own experience.

Users
People actively job seeking who are preparing for cold outreach to a company or attending a company trek.
Goals
Accept one or more company names and a shared user resume as input.
Allow users to save and revisit multiple companies inside the same workspace.
Pull live data from the web (news, job postings, press releases) to source current company information.
Generate a company overview (what the company does, size, industry, etc.).
Summarize the company's current direction and inferred needs (strategic priorities, growth areas, pain points).
Produce a set of suggested questions the user could ask the company, consisting of a mix of:
Research-backed general questions grounded in the company's current context.
Personalized questions that weave in the user's specific background and accomplishments, allowing the user to showcase expertise while gathering information.
Generate a personalized appeal angle by thoroughly extracting the user's titles, skills, projects, accomplishments, quantified results, domain expertise, and career trajectory, then producing concrete talk tracks and talking points — not just a list of overlaps — that the user can directly use in conversation.
Deliver the complete brief as a web page the user reads on screen.
When live data is sparse, generate a partial brief with whatever data is available, clearly marking sections where data was limited and flagging confidence level so the user knows what to trust.
Non-Goals
Iterative or interactive refinement of a generated brief — the tool produces one complete brief per company run.
Downloading or exporting the brief (e.g., PDF, plain text) — on-screen reading only.
Further non-goals to be defined through clarification.
Constraints
The tool supports a saved multi-company workspace, but each company brief is still one-shot: a single generation per company run, with no follow-up iteration or regeneration of that brief.
Output is delivered as a web page; no download or export functionality is required.
Company information must be sourced via live web data (news, job postings, press releases) rather than relying solely on LLM training knowledge.
Resume processing must be thorough: titles, skills, projects, accomplishments, quantified results, domain expertise, and career trajectory must all be extracted and used in tailoring. The resume input is shared across companies in the workspace unless the product later adds per-company overrides.
The suggested questions section must include both research-backed general questions and personalized questions that weave in the user's specific background and accomplishments.
When live web data is insufficient, the tool must still generate a partial brief using whatever data is available. Sections with sparse data must be clearly marked and accompanied by a confidence-level flag so the user understands what to trust.
The tool must not silently fall back to LLM training knowledge without surfacing that limitation to the user.
Success Criteria
The user feels noticeably more prepared and confident going into their cold outreach or company trek compared to researching on their own.
The output is perceived as meaningfully tailored to the user's background — not generic research they could have found themselves.
The personalized appeal angle produces concrete talk tracks and talking points the user can directly use in conversation — not merely a list of resume-to-company overlaps.
The appeal section draws multiple specific connections between the user's background and the company's current priorities, open roles, and strategic direction, giving the user a clear and actionable sense of how to position themselves.
The suggested questions section includes both grounded general questions and personalized questions that help the user showcase their expertise in context.
When data is sparse, the user can clearly identify which sections are well-supported and which are limited, so they can calibrate their reliance on the brief accordingly.
Open Questions
Should the tool support a job posting URL as an additional (optional) input to further tailor the output?
Are there privacy considerations around storing or processing uploaded resumes?
Are there rate limits, cost constraints, or preferred sources for the live web data retrieval?
Decisions
Input is defined as: a saved company workspace plus a shared user resume. The workspace may contain multiple companies, and the user views one company's brief at a time.
Company information is sourced by pulling live data from the web (news, job postings, press releases) for the most current information.
Output covers four areas: company overview, current direction & needs, suggested questions, and a tailored personal appeal angle.
The suggested questions section contains a mix of research-backed general questions and personalized questions that weave in the user's specific background and accomplishments.
Resume tailoring is thorough: the tool extracts titles, skills, projects, accomplishments, quantified results, domain expertise, and career trajectory, and produces concrete talk tracks and talking points — not just a list of overlaps — that weave multiple specific connections between the user's background and the company's current priorities, open roles, and strategic direction.
The tool may store multiple companies and a shared resume for reuse, but each company brief is still one-shot: the user receives a single complete brief for that company run and works with that output directly.
The brief is delivered as a web page the user reads on screen; no download or export is needed.
A high-quality brief is one the user can directly use in conversation — the appeal section must produce actionable talk tracks, not a summary of similarities.
When live data is sparse or unavailable for a company, the tool generates a partial brief with whatever live data exists, clearly marks affected sections, and flags confidence level — it does not silently fall back to training knowledge or refuse to generate.
