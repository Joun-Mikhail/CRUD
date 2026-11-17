# LabProof Lite — five practice exercises

Each exercise is small (20–60 minutes), runs without AWS, and proves that you understand one part of the feature. Do them on a scratch branch (`git switch -c practice/labproof`) so nothing reaches `main` by accident. The "Check" line tells you how to know you got it right. Hints are at the end; try without them first.

Set-up once: `make setup`. Run the unit tests with `cd frontend && npx vitest run src/lab src/pages/lab`.

---

## Exercise 1 — Calculate by hand, then let a test check you (calculations)

Take these readings for a nominal 100 Ω, ± 5 % resistor:

| V (V) | I (mA) |
|---|---|
| 1.0 | 9.8 |
| 2.0 | 20.3 |
| 4.0 | 39.6 |

1. On paper, compute R for each row, the mean R̄, the best fit R_fit = Σ(V·I)/Σ(I²) (I in amperes) and the deviation δ.
2. Decide: PASS or CHECK?
3. Add a test to `frontend/src/lab/ohmsLaw.test.ts` that calls `evaluateExperiment` with these readings and asserts your four numbers with `toBeCloseTo(value, 1)`.

**Check:** the test passes, and you can explain why R̄ and R_fit differ slightly.

## Exercise 2 — A new validation rule (validation + error messages)

Real lab supplies rarely exceed 30 V. Reject any reading above 30 V with the message `Voltage must be at most 30 V.`

1. Change `evaluateExperiment` in `frontend/src/lab/ohmsLaw.ts`.
2. Add a unit test for 30 V (accepted) and 30.1 V (rejected).
3. Start the Local Demo (`make demo-backend`, `make demo-frontend`), type 31 into a voltage field and press **Save experiment**.

**Check:** the message appears under the right row, the network tab shows **no** `POST /notes`, and all other tests still pass.

## Exercise 3 — Read the stored JSON through the API (storage format + API)

1. Create and save an experiment in the Local Demo.
2. Fetch it directly from the API, without the frontend:
   ```bash
   curl -s http://127.0.0.1:8787/notes -H "Authorization: Demo alice"
   ```
3. Find your experiment and copy its `content`. Paste it into a JSON viewer.
4. Answer in writing: which fields come from the student, which fields did the **server** add (look outside `content`), and why are the mean and best fit missing?

**Check:** you can name `noteId`, `userId`, `createdAt`, `updatedAt` and `version` as server-set, and explain "inputs stored, results recomputed" in one sentence.

## Exercise 4 — Make an old note compatible on purpose (format versioning)

1. In the Local Demo, open **Notes → New note**, give it any title, and paste this content:
   ```json
   { "format": "labproof/ohms-law", "formatVersion": 2, "course": "X" }
   ```
2. Save it. Is it listed under **LabProof**? Open `/lab/<its id>` directly. What do you see?
3. Find the line in `fromNote()` (`frontend/src/lab/experimentFormat.ts`) responsible for this behaviour.
4. Add a unit test proving that a version-2 note is treated as an ordinary note. (One already exists — find it, then write your own variant with `formatVersion: 0`.)

**Check:** you can explain why rejecting an unknown version is safer than guessing.

## Exercise 5 — Provoke and explain a version conflict (optimistic locking)

1. Open the same saved experiment in **two browser tabs**.
2. In tab A change the conclusion and press **Save changes**.
3. In tab B change a reading and press **Save changes**.
4. Note what tab B shows. Then open the browser's network tab and find the status code of the failed request.
5. In `backend/src/notes_api/repositories/notes_repository.py` find the condition that made DynamoDB refuse the write.

**Check:** you saw the "changed somewhere else" message and a **409**, and you can point to `version = :expectedVersion` in the code and explain why nothing was overwritten.

---

### Hints

1. For row 1: 1.0 / 0.0098 = 102.0 Ω. Σ(V·I) = 1·0.0098 + 2·0.0203 + 4·0.0396; Σ(I²) = 0.0098² + 0.0203² + 0.0396².
2. Add an `else if (voltage > 30)` branch next to the existing `!(voltage > 0)` check, before the current is checked.
3. On Windows PowerShell use `curl.exe` instead of `curl`. The API response is the envelope `{"data": [...], "meta": {...}}`.
4. Look for `d.formatVersion !== FORMAT_VERSION`. The existing test is the `'newer version'` row of the `it.each` table in `experimentFormat.test.ts`.
5. The frontend handles it in `ExperimentEditorPage.tsx`: search for `VERSION_CONFLICT`.
