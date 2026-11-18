# LabProof Lite for beginners

LabProof Lite is a small laboratory module inside the Serverless Notes frontend. A student records **one Ohm's law verification experiment**, the app calculates the resistance and draws the V–I graph, the experiment is **saved, reopened, edited and deleted through the existing five `/notes` endpoints**, and a print-friendly laboratory report can be saved as a PDF.

**No backend, infrastructure or AWS change was needed.** An experiment is an ordinary note whose `content` holds a small JSON document. Everything the thesis says about the API, security, isolation and DynamoDB therefore also applies to experiments.

> Verification level (honest): the LabProof screens were tested with unit/component tests and with Playwright against the **Local Demo** (real Lambda handler code on an in-memory DynamoDB emulator, simulated identities). The feature has **not** been exercised against the deployed AWS stack yet. See "How to try it" for the one manual AWS check worth doing.

---

## 1. The user journey and where each step lives

| # | Step | Screen (route) | Code |
|---|---|---|---|
| 1 | Sign in (Cognito in AWS mode, simulated identity in Local Demo) | `/auth` | unchanged: `src/services/auth/*` |
| 2 | Create an experiment | `/lab` → **New experiment** → `/lab/new` | `src/pages/lab/LabHomePage.tsx`, `ExperimentEditorPage.tsx` |
| 3 | Title, course, date | editor, section 1 | `ExperimentEditorPage.tsx`, rules in `lab/experimentFormat.ts → validateDetails` |
| 4 | Enter/edit readings V (V) and I (mA) | editor, section 3 | `src/lab/ReadingsTable.tsx` |
| 5 | Automatic R = V / (I_mA / 1000) | live column in the table + section 4 | `src/lab/ohmsLaw.ts` |
| 6 | V–I graph | editor section 4, report section 5 | `src/lab/VIChart.tsx`, `src/lab/chartScale.ts` |
| 7 | Observations and conclusion | editor section 5 | `ExperimentEditorPage.tsx` |
| 8 | Save full data | **Save experiment** → `POST /notes` | `lab/experimentFormat.ts → toNoteInput` |
| 9 | Reopen | `/lab/{noteId}` → `GET /notes/{id}` | `lab/useExperimentNote.ts`, `experimentFormat.ts → fromNote` |
| 10 | Edit and save | **Save changes** → `PUT /notes/{id}` with `version` | `ExperimentEditorPage.tsx` |
| 11 | Delete | **Delete** → confirm → `DELETE /notes/{id}` | `ExperimentEditorPage.tsx` |
| 12 | Printable report → PDF | `/lab/{noteId}/report` → **Print / Save as PDF** | `src/pages/lab/LabReportPage.tsx`, print CSS |

### Files added or changed (study them in this order)

1. `frontend/src/lab/ohmsLaw.ts`: the physics. Pure functions, no React. **Start here.**
2. `frontend/src/lab/experimentFormat.ts`: how an experiment becomes a note and back.
3. `frontend/src/pages/lab/ExperimentEditorPage.tsx`: the form, save, edit, delete, conflict handling.
4. `frontend/src/pages/lab/LabReportPage.tsx`: the report and printing.
5. `frontend/src/lab/VIChart.tsx` (+ `chartScale.ts`): the SVG graph.
6. Smaller pieces: `ReadingsTable.tsx`, `ResultSummary.tsx`, `useExperimentNote.ts`, `LabHero.tsx`, `pages/lab/LabHomePage.tsx`.
7. Small edits to existing files: `routes.tsx` (4 routes), `layouts/AppLayout.tsx` (nav item + `print:hidden`), `DashboardPage.tsx` (banner), `NotesPage.tsx` / `components/notes/noteHelpers.ts` (experiments open in the lab), `NoteEditorPage.tsx` (hint when an experiment is opened as a plain note), `styles/index.css` (colour palette + print rules), `buttonStyles.ts` (`inverse` button), `ToastProvider.tsx` (toasts hidden in print).
8. Tests: `src/lab/ohmsLaw.test.ts`, `src/lab/experimentFormat.test.ts`, `src/pages/lab/lab.test.tsx`, `tests/e2e/lab.spec.ts`, extra pages in `tests/e2e/accessibility.spec.ts`.

---

## 2. The calculations (`src/lab/ohmsLaw.ts`)

Ohm's law: **V = I · R**. Apply several voltages to one resistor, measure the current each time; if the law holds, V/I is constant and the points lie on a straight line through the origin.

| Quantity | Formula | Function |
|---|---|---|
| Resistance of one reading | Rᵢ = Vᵢ / (Iᵢ[mA] / 1000) | `evaluateExperiment` (row by row) |
| Mean | R̄ = (1/n) · Σ Rᵢ | `computeResult → meanOhms` |
| Best-fit slope (least squares through the origin) | R_fit = Σ(Vᵢ · Iᵢ) / Σ(Iᵢ²), I in amperes | `computeResult → fittedOhms` |
| Deviation from the nominal value | δ = (R_fit − R_nom) / R_nom · 100 % | `computeResult → deviationPercent` |
| Verdict | PASS if \|δ\| ≤ tolerance, otherwise CHECK | `computeResult → withinTolerance` |

**What PASS means, and what it does not.** PASS says only that the fitted resistance R_fit agrees with the printed value within the stated tolerance. It does not prove Ohm's law in general. Linearity is judged separately from the graph: the points should lie close to a straight line through the origin. A non-linear component could still give a PASS for a narrow range of readings, and a perfectly linear resistor gives CHECK if its colour code was read wrongly.

**Why divide by 1000?** A bench multimeter shows small currents in milliamperes. Ohm's law needs SI units: 4.6 mA = 0.0046 A, so R = 1.0 V / 0.0046 A ≈ 217 Ω.

**Circuit and safety (shown in the editor under "How the experiment works").** Supply, ammeter and resistor in series; the voltmeter in parallel directly across the resistor, so it measures the voltage on the resistor only. Start at 0 V with a low current limit and the ammeter on its highest range. Keep the power P = V·I = V²/R well below the resistor's rating: a 0.25 W, 220 Ω resistor allows at most √(0.25 · 220) ≈ 7.4 V or √(0.25 / 220) ≈ 34 mA. The built-in example stays under 5 V / 23 mA (≈ 0.11 W). A hot resistor changes its value.

**Why a best-fit slope as well as the mean?** The mean treats every reading equally. At low currents a ±0.1 mA meter error is a large relative error, so one bad low-current reading can pull the mean. The least-squares line V = R·I through (0, 0) weights readings by I², so the larger (relatively more accurate) readings count more. Minimising Σ(Vᵢ − R·Iᵢ)² and setting the derivative to zero gives exactly R = Σ(VᵢIᵢ)/Σ(Iᵢ²). The verdict uses R_fit. Both values are shown so the student can compare them.

**Least squares is not immune to outliers.** Using all readings averages out small random errors, but one wrong reading still pulls the fit, because the error is squared. A wrong reading at a *high* current pulls hardest, because those readings carry the most weight. That is why the app shows the mean next to the fit and draws every point on the graph: a large gap between R̄ and R_fit, or a point far from the line, means "re-measure that reading", not "trust the fit".

**Validation** (`evaluateExperiment`):
- nominal resistance: required, a number > 0;
- each reading: voltage > 0 and current > 0. **A current of 0 is rejected because R = V/0 is undefined.** Text such as `abc`, `1e3` or `2 V` is rejected (`parseDecimal` accepts only plain numbers, with a decimal point or a decimal comma, because Czech keyboards type `1,5`);
- completely empty rows are ignored (spare rows are allowed);
- at least **3** readings (one point cannot show a straight line) and at most **10**.

Errors are shown only after the first **Save** attempt, so the form does not shout at the student while they type. The R = V/I column and the result update live.

---

## 3. How an experiment is stored (`src/lab/experimentFormat.ts`)

A note has only `title` and `content` that the client may set. So:

```
note.title   = the experiment title
note.content = JSON, for example:
{
  "format": "labproof/ohms-law",
  "formatVersion": 1,
  "course": "Electrical Measurements",
  "date": "2026-11-17",
  "nominalOhms": 220,
  "tolerancePercent": 5,
  "readings": [
    { "voltageV": 1, "currentMa": 4.6 },
    { "voltageV": 2, "currentMa": 9.1 },
    { "voltageV": 3, "currentMa": 13.5 }
  ],
  "observations": "Meter on the 20 mA range.",
  "conclusion": "Ohm's law holds; the resistor is within tolerance."
}
```

Design decisions you should be able to defend:

- **Only inputs are stored, never results.** Mean, best fit and deviation are recomputed every time the experiment is opened. Stored data can never disagree with the formulas, and a formula fix automatically applies to old experiments.
- **`format` + `formatVersion`** say what the JSON is. `fromNote()` returns `null` (so the note is "just a note") for plain text, other JSON, broken JSON, a future `formatVersion: 2`, or impossible values such as a zero current. **Old notes stay compatible**: they are never parsed as experiments and keep opening in the normal note editor.
- **Numbers are stored as numbers** (`1`, `4.6`), not as typed text. A consequence: `1.0` comes back as `1` (see limitations).
- **Size**: notes are limited to 20 000 characters (server rule, mirrored in `validateNote`). Observations and conclusion are capped at 4 000 characters each, the course at 100, and at most 10 readings, so even worst-case JSON escaping fits. The editor still checks the final JSON with `validateNote` before sending, and a unit test checks the worst case.
- **The client never sends `userId`, `noteId`, timestamps or `version` in the body**; the server sets them (security rule 2). On update, the `version` is sent only as the optimistic-lock precondition, exactly as the note editor does.

Where an experiment shows up:
- `/lab` lists every loaded note for which `fromNote()` succeeds, with its PASS/CHECK badge;
- in **Notes** and on the dashboard, experiments link to `/lab/{id}` and show a readable summary instead of JSON (`noteHelpers.ts → noteLink / noteExcerpt`);
- opened through `/notes/{id}` directly, the note editor shows a hint linking back to the lab, because hand-editing the JSON could make it unreadable.

---

## 4. Save → API Gateway → Lambda → DynamoDB

What happens when the student presses **Save experiment** on a new experiment:

```
Browser (ExperimentEditorPage)
  validateDetails + evaluateExperiment          ← nothing is sent if anything is invalid
  toNoteInput(exp) → { title, content: JSON }
  notesApi.create(...)  →  POST /notes  (Authorization: Bearer <Cognito access token>)
        │
API Gateway (REST API)
  Cognito authorizer: token signature, expiry, issuer, scope notes/write   → 401 if not
        │
Lambda  serverless-notes-dev-create-note  (handlers/create_note.py)
  http.api_handler: caller id = requestContext.authorizer.claims.sub
  validation/notes.py: unknown fields rejected; title 1–200, content ≤ 20 000 chars
  services/notes_service.py: new noteId (UUID), createdAt/updatedAt, version 1, userId = sub
        │
DynamoDB table serverless-notes-dev-notes
  PutItem with ConditionExpression attribute_not_exists(noteId)
        │
201 { "data": { noteId, userId, title, content, createdAt, updatedAt, version } }
  → the app shows "Experiment created" and navigates to /lab/{noteId}
```

- **Reopen** (`/lab/{id}`): `GET /notes/{id}` → get-note Lambda → `GetItem` → the service compares the owner. Another user's experiment gives **403**, a missing one **404**. The page then calls `fromNote()` and fills the form.
- **Edit**: `PUT /notes/{id}` with `{ title, content, version }` → update-note Lambda → `UpdateItem` with `ConditionExpression attribute_exists(noteId) AND userId = :owner AND version = :expectedVersion`, and `ADD version 1`. If someone changed the experiment in another tab, the version no longer matches → **409 VERSION_CONFLICT**. The page says so, does not overwrite anything, and offers to load the latest version.
- **Delete**: `DELETE /notes/{id}` → delete-note Lambda → `DeleteItem` with an ownership condition → **200**.
- **List** (`/lab`): uses the notes already loaded by `NotesProvider` (`GET /notes` → `Query` on the `byUser` index, never a `Scan`). The lab only *filters* them.

## 5. Authentication

Nothing new. The lab pages live under the existing `RequireAuth` route guard. Every request goes through the same `apiClient`, which adds the in-memory Cognito access token (AWS mode) or the `Demo alice` header (Local Demo). Isolation is enforced by the backend, not the UI: Bob cannot list, open, change or delete Alice's experiments (covered by `tests/e2e/lab.spec.ts` and the existing backend isolation tests).

## 6. The graph (`src/lab/VIChart.tsx`)

- Plain **SVG**, no chart library (no new dependency) and **no inline styles**, because the production Content-Security-Policy forbids them. Colours come from Tailwind classes (`fill-accent`, `stroke-violet`), so the graph follows the light/dark theme.
- x axis: **current I (mA)**; y axis: **voltage V (V)**. With V on the y axis, the slope of the line is directly the resistance.
- Blue dots = measurements. Violet dashed line = best fit V = R_fit · I from the origin.
- Axis ends are rounded to "nice" values (1, 2, 2.5, 5 × 10ⁿ; `chartScale.ts → niceScale`) with gridlines.
- For screen readers, the `<svg>` has `role="img"` and a text label with the number of points and the slope. The same numbers are in the table and the summary.

## 7. Printing / Save as PDF (`LabReportPage.tsx`)

- `/lab/{id}/report` loads the saved note (not unsaved edits; the report link appears only when everything is saved) and renders a report: header (course, date, student, resistor), 1 Aim, 2 Method, 3 Measurements table (V, I in mA and A, R), 4 Calculations (one worked row, mean, best fit with the actual sums, deviation, PASS/CHECK), 5 Graph, 6 Observations, 7 Conclusion, and a footer with record ID and version.
- **Print / Save as PDF** calls `window.print()`. The browser opens its print dialog; choosing "Save as PDF" creates the file. No PDF library and no server.
- Print CSS: Tailwind's `print:` variant hides the sidebar, top bar, demo banner, toasts and buttons (`print:hidden`). The tables, result box and graph avoid page breaks (`break-inside-avoid`). `@page` sets A4-friendly margins. Dark-theme colours are declared for `@media screen` only, so a report printed while the dark theme is on still prints dark-on-white.
- Tip for a clean PDF: in the print dialog, turn off "Headers and footers".

## 8. Visual redesign

The palette is a **token swap** in `src/styles/index.css`: navy text (`--fg`), electric-blue accent (`--accent`), a restrained violet (`--violet`) for the best-fit line and small highlights, with matching dark-theme values. Every existing component already uses these tokens, so the whole app changed colour without touching component code. The LabProof banner (`LabHero.tsx`) uses fixed navy → blue gradient colours so its white text keeps contrast in both themes. The axe accessibility audit (WCAG 2.2 AA, both themes) passes on all pages, including the new ones.

---

## 9. Ten questions a supervisor is likely to ask

1. **Why didn't you add a new endpoint or table for experiments?**
   An experiment is a document owned by one user, which is exactly what a note is. Reusing `/notes` keeps the five tested, secured endpoints unchanged: authentication, ownership checks, validation, optimistic locking and logging all apply automatically. A new table or Lambda would add IAM, infrastructure, tests and cost for no new capability.

2. **How do you tell an experiment from an ordinary note?**
   `fromNote()` accepts a note only if its content is JSON with `format: "labproof/ohms-law"` and `formatVersion: 1`, and every value is valid (positive numbers, allowed tolerance, 1–10 readings). Anything else is an ordinary note.

3. **What if you change the format later?**
   Write `formatVersion: 2` and add a converter from version 1 in `fromNote()`. Today, version 2 data is deliberately rejected by version-1 code instead of being misread.

4. **Why are the calculated values not stored?**
   They are derived data. Storing them could make the database disagree with the formula, for example after a bug fix. Recomputing costs microseconds.

5. **What is the formula for R and why is it divided by 1000?**
   R = V / I in SI units. The current is entered in mA, so I[A] = I[mA] / 1000.

6. **Why least squares through the origin? Isn't the mean enough?**
   Ohm's law predicts V = R·I with zero intercept. Minimising Σ(V − R·I)² gives R = ΣVI/ΣI². It uses all points together and reduces the weight of low-current readings, which have the largest relative error. It is not immune to outliers: one wrong high-current reading can shift it noticeably, so the mean and the graph are shown too.

7. **What happens with a zero or empty current?**
   Empty rows are ignored. A zero, negative or non-numeric current is rejected with a message on that row, because V/0 is undefined. The server never sees invalid measurements.

8. **Two browser tabs edit the same experiment — what happens?**
   The second save sends an outdated `version`. DynamoDB's condition `version = :expectedVersion` fails, the API returns 409 and the page shows a conflict message. Nothing is overwritten.

9. **Can another student see or delete my experiment?**
   No. The API takes the user ID only from the verified Cognito token (`claims.sub`). Reads compare the owner, and writes put the ownership check inside DynamoDB's condition expression. The UI shows the 403 "belongs to another account" message (tested).

10. **How is the PDF generated, and why not a PDF library?**
    The browser prints the report page (`window.print()` + print CSS) and "Save as PDF" writes the file. It adds no dependency or server cost, the PDF is exactly what the student sees, and fonts and Unicode (Ω, ±, subscripts) are handled by the browser. Trade-off: page layout varies slightly between browsers.

Bonus: **What is not verified?** The LabProof screens have not been run against the deployed AWS stack. They use only API calls that were verified there on 2026-11-17, but the end-to-end evidence for the lab is from the Local Demo.

---

## 10. Limitations (be upfront about these)

- One experiment type (Ohm's law), on purpose.
- At most 10 readings; observations/conclusion at most 4 000 characters each.
- Readings are stored as numbers, so trailing zeros are not kept (`1.00` comes back as `1`). Significant figures of the instrument are therefore not recorded.
- No measurement-uncertainty propagation; the verdict compares R_fit with the tolerance only.
- `/lab` lists experiments among the notes loaded so far (the API pages 20 notes at a time). **Load more notes** fetches more.
- The student name on the report is the signed-in display name; there is no separate field.
- PDF output depends on the browser's print engine (tested visually in Chromium).
- If someone hand-edits the JSON in the plain note editor and breaks it, the note stops being recognised as an experiment (it remains a readable note; nothing crashes).
- The app's screenshots in the thesis manuscripts show the earlier teal colour scheme.

## 11. How to try it

```bash
make demo-backend      # terminal 1 (Local Demo backend on :8787)
make demo-frontend     # terminal 2 → http://localhost:5173
```
Sign in as Alice → **LabProof** → **New experiment** → **Fill example readings**, enter a title and course → **Save experiment** → reload the page (the data comes back) → change a reading → **Save changes** → **Lab report** → **Print / Save as PDF** → back → **Delete**.

Tests: `cd frontend && npm test` (unit/component), `npx playwright test --project=chromium --trace off tests/e2e/lab.spec.ts` (browser, Local Demo).

Optional manual AWS check (only on the owner's machine, no deployment needed): `npm run dev:aws`, sign in with your real Cognito account, create, reopen and delete one experiment, and write down what you saw. Until then, describe the lab as verified locally only.

## بالعربي (مصري) — باختصار

التجربة نفسها هي note عادية: العنوان هو عنوان التجربة، والـ content فيه JSON صغير بيقول `format` و `formatVersion` وكل القراءات اللي الطالب كتبها. مفيش أي حاجة جديدة في الباك إند. الحسابات (R = V / (I/1000)، المتوسط، أفضل خط، نسبة الانحراف) بتتعمل في المتصفح كل مرة بتفتح التجربة، ومش بنخزنها عشان متتعارضش مع المعادلة. الـ PDF بيطلع من زرار الطباعة بتاع المتصفح.
