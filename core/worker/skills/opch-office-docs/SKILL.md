---
name: opch-office-docs
description: Read and write Microsoft Office documents (.xlsx, .docx, .pptx) using the Python libraries bundled in the worker image. Use after downloading a file (e.g. via opch-slack-files) or to produce a new document for the user.
metadata: { "openclaw": { "emoji": "📊" } }
---

# Office documents

The worker image ships with `python3-openpyxl`, `python3-docx`, and `python3-pptx` (Debian system packages). Use them via `python3 -c '…'` or short scripts under `/tmp/openclaw/`. **Do not** use `pip install` — the image has no `pip3` and packages must be added in the Dockerfile.

Supported formats:

| Extension | Library            | Read | Write |
|-----------|--------------------|------|-------|
| `.xlsx`   | `openpyxl`         | ✅   | ✅    |
| `.docx`   | `docx` (`python-docx`) | ✅ | ✅    |
| `.pptx`   | `pptx` (`python-pptx`) | ✅ | ✅    |

Legacy formats (`.xls`, `.doc`, `.ppt`) and PDF are **not** supported in this image. If the user provides one, tell them and ask for an `.xlsx` / `.docx` / `.pptx` export instead.

## Excel (.xlsx)

### Read every cell into structured form

```bash
python3 - <<'PY'
import json
from openpyxl import load_workbook

wb = load_workbook("/tmp/openclaw/slack/sheet.xlsx", data_only=True)
out = {}
for ws in wb.worksheets:
    rows = []
    for row in ws.iter_rows(values_only=True):
        rows.append(list(row))
    out[ws.title] = rows
print(json.dumps(out, default=str))
PY
```

`data_only=True` returns cached formula results instead of the formula text. If you need the formulas themselves, drop the flag.

### Read just the headers and first N rows (cheap inspection)

```bash
python3 - <<'PY'
from openpyxl import load_workbook
wb = load_workbook("/tmp/openclaw/slack/sheet.xlsx", data_only=True)
ws = wb.active
print("sheet:", ws.title, "dims:", ws.dimensions)
for i, row in enumerate(ws.iter_rows(values_only=True)):
    print(row)
    if i >= 9:
        break
PY
```

### Modify a workbook (add a row, save under a new name)

```bash
python3 - <<'PY'
from openpyxl import load_workbook
wb = load_workbook("/tmp/openclaw/slack/sheet.xlsx")
ws = wb.active
ws.append(["UK Compliance", "GDPR + DPA 2018", "High", "£50–150k"])
wb.save("/tmp/openclaw/out/sheet-updated.xlsx")
PY
```

### Build a new workbook from scratch

```bash
python3 - <<'PY'
from openpyxl import Workbook
wb = Workbook()
ws = wb.active
ws.title = "UK Compliance"
ws.append(["Area", "Regulation", "Potential", "Budget"])
ws.append(["Data protection", "GDPR/DPA 2018", "High", "£50–150k"])
ws.append(["Financial conduct", "FCA SYSC", "Medium", "£25–80k"])
import os
os.makedirs("/tmp/openclaw/out", exist_ok=True)
wb.save("/tmp/openclaw/out/uk-compliance.xlsx")
PY
```

## Word (.docx)

### Read all paragraphs and tables

```bash
python3 - <<'PY'
from docx import Document
doc = Document("/tmp/openclaw/slack/brief.docx")
for p in doc.paragraphs:
    if p.text.strip():
        print("¶", p.text)
for ti, t in enumerate(doc.tables):
    print(f"-- table {ti} --")
    for row in t.rows:
        print(" | ".join(cell.text for cell in row.cells))
PY
```

### Create a new document

```bash
python3 - <<'PY'
from docx import Document
doc = Document()
doc.add_heading("UK Compliance Overview", level=1)
doc.add_paragraph("Summary of regulatory requirements and budget bands.")
table = doc.add_table(rows=1, cols=4)
hdr = table.rows[0].cells
hdr[0].text, hdr[1].text, hdr[2].text, hdr[3].text = "Area", "Regulation", "Potential", "Budget"
row = table.add_row().cells
row[0].text, row[1].text, row[2].text, row[3].text = "Data protection", "GDPR/DPA 2018", "High", "£50–150k"
import os
os.makedirs("/tmp/openclaw/out", exist_ok=True)
doc.save("/tmp/openclaw/out/uk-compliance.docx")
PY
```

## PowerPoint (.pptx)

### Read slide text

```bash
python3 - <<'PY'
from pptx import Presentation
pres = Presentation("/tmp/openclaw/slack/deck.pptx")
for i, slide in enumerate(pres.slides, 1):
    print(f"--- slide {i} ---")
    for shape in slide.shapes:
        if shape.has_text_frame:
            for para in shape.text_frame.paragraphs:
                if para.text.strip():
                    print(para.text)
PY
```

### Create a deck

```bash
python3 - <<'PY'
from pptx import Presentation
from pptx.util import Inches
pres = Presentation()

title_layout = pres.slide_layouts[0]
slide = pres.slides.add_slide(title_layout)
slide.shapes.title.text = "UK Compliance"
slide.placeholders[1].text = "Regulatory landscape & budget bands"

bullet_layout = pres.slide_layouts[1]
slide = pres.slides.add_slide(bullet_layout)
slide.shapes.title.text = "Top areas"
body = slide.placeholders[1].text_frame
body.text = "Data protection — GDPR/DPA 2018"
body.add_paragraph().text = "Financial conduct — FCA SYSC"
body.add_paragraph().text = "AML — POCA / MLR 2017"

import os
os.makedirs("/tmp/openclaw/out", exist_ok=True)
pres.save("/tmp/openclaw/out/uk-compliance.pptx")
PY
```

## Workspace conventions

- Inputs from Slack land in `/tmp/openclaw/slack/` (created by `opch-slack-files`).
- Outputs you produce go in `/tmp/openclaw/out/`.
- Re-create `/tmp/openclaw/out/` per turn (`mkdir -p`); never assume it exists.
- File names should be slugified ASCII (`tr -c 'A-Za-z0-9._-' '_'`) — Slack uploads can contain spaces and unicode.

## Returning the result to the user

After producing a file, you have two options:

1. **Upload back to Slack** — see `opch-slack-files` § *Uploading a file back to Slack*. Requires `files:write` scope.
2. **Summarise inline** — paste the headers / first rows / key bullets into the chat instead of attaching the file. Often more useful when the user just wants to see what changed.

## Rules

- **Never** invent values to fill cells. If a column expects data the user did not supply, ask.
- **Never** silently overwrite an input file. Save modifications under a new name in `/tmp/openclaw/out/`.
- **Always** prefer `data_only=True` when reading xlsx unless the user explicitly asked about formulas.
- If a library import raises `ModuleNotFoundError`, the worker image is out of date — tell the user; do not try to install at runtime.
