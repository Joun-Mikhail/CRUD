# LabProof Lite — supervisor demonstration script (≈ 8 minutes)

**Before the meeting (5 minutes):** start the Local Demo (`make demo-backend` and `make demo-frontend`), open http://localhost:5173 in Chrome, and sign out. Keep a terminal open in `frontend/`. Optional: open the browser's network tab (F12 → Network) to show the real API calls.

Say at the start: *"This is the Local Demo: the real Lambda handler code with an in-memory DynamoDB and simulated sign-in. In AWS mode the same screens use Cognito and the deployed API. The lab feature itself has been verified locally."* (Change this sentence if you have since done the manual AWS check.)

| Time | Do | Say (key point) |
|---|---|---|
| 0:00 | Sign in as **Alice**. Point at the LabProof banner on the dashboard. | "LabProof is one guided lab workflow built on the existing notes API, with no backend changes." |
| 0:45 | **New experiment.** Type a title, course; leave the date as today. | "Title, course and date are validated in the browser, and the server validates again." |
| 1:30 | Enter 100 Ω, then readings 1 V / 10.1 mA, 2 V / 19.8 mA, 3 V / 30,2 mA (comma on purpose). | "R = V / (I in mA / 1000) appears per row as I type; a decimal comma works." |
| 2:15 | Point at the results and the graph. | "Mean versus least-squares slope through the origin, the deviation from the nominal value, PASS means only that the fitted R is within ± 5 % of the printed value; linearity is read from the graph. Graph: V on the y axis, so the slope is the resistance." |
| 3:00 | **Add reading**, type `4` V and `0` mA, press **Save experiment**. Show the message under that row, then delete the row. | "Zero current is rejected because R would be V/0. Nothing was sent to the server." |
| 3:30 | Write a one-line conclusion → **Save experiment**. In the network tab show `POST /notes` → 201. | "An experiment is a note: the title is the title, the content is versioned JSON with only the inputs." |
| 4:15 | **Reload the page** (F5). | "Everything comes back from the API: `GET /notes/{id}`, and the results are recomputed." |
| 4:45 | Change one reading → **Save changes** → show `PUT` with `version`. | "Optimistic locking: a stale version gives 409 instead of overwriting." (Optional: show the two-tab conflict.) |
| 5:30 | **Lab report** → **Print / Save as PDF** → show the print preview. | "Browser print with print CSS: navigation hidden, table, calculations with the actual sums, graph, conclusion. No PDF library, no server." |
| 6:30 | Settings → switch to **Bob** → LabProof shows *No experiments yet*. Paste Alice's experiment URL. | "Isolation is enforced by the backend: 403, 'belongs to another account'." |
| 7:15 | Switch back to Alice → open the experiment → **Delete** → confirm. | "`DELETE /notes/{id}` → 200, as in the thesis." |
| 7:45 | Terminal: `npx vitest run src/lab src/pages/lab` | "Calculations, format and screens are covered by automated tests; Playwright runs the whole journey." |

**If something fails live:** say what you expected, show `evidence/tests/labproof-frontend-e2e.txt` (the recorded Playwright run), and continue. Do not improvise new features.
