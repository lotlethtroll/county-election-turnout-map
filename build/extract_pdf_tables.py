"""C-19: extract Colorado certified presidential and active-turnout tables.

CSV cells come from pdfplumber's ruled-table extraction. Every numeric cell is
checked against the same row extracted with the separate text-layout algorithm,
including county identity. Statewide control rows are read directly, never
manufactured by summing counties. Source PDFs are read-only.
"""
import argparse
import csv
import json
import re
from pathlib import Path

import pdfplumber


def clean(value):
    return re.sub(r"\s+", " ", value or "").strip()


def checked_table(pdf, page_number, index=0):
    page = pdf.pages[page_number - 1]
    tables = page.extract_tables()
    if len(tables) <= index:
        raise ValueError(f"PDF page {page_number}: expected table {index + 1}")
    rows = [[clean(c) for c in row] for row in tables[index]]
    lines = page.extract_text().splitlines()
    checked = 0
    for row in rows:
        if row[0] == "County":
            continue
        prefix = re.escape(row[0]) + r"\s+"
        expected = row[1:]
        matches = [re.sub(r"\s+", " ", line).strip() for line in lines
                   if re.match(r"^" + prefix, line)]
        # A page may have multiple Total rows; require an exact numeric match.
        if not any(re.sub(r"^" + prefix, "", line).split() == expected for line in matches):
            raise ValueError(f"PDF page {page_number}, {row[0]}: table/text mismatch: {expected}; text {matches}")
        if any(not re.fullmatch(r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+%)?", c) for c in expected):
            raise ValueError(f"PDF page {page_number}, {row[0]}: malformed number {expected}")
        checked += len(expected)
    return rows, checked


def extract(source, output):
    output.mkdir(parents=True, exist_ok=True)
    table_specs = [("president-main", 106), ("president-other", 107),
                   ("president-other-total", 108), ("president-writeins", 109),
                   ("president-writeins-total", 110), ("active-turnout", 181)]
    audit = []
    with pdfplumber.open(source) as pdf:
        if len(pdf.pages) != 182:
            raise ValueError("This adapter expects the archived 182-page 2024 biennial abstract")
        if "Presidential Electors" not in pdf.pages[105].extract_text():
            raise ValueError("Expected general-election presidential heading on physical page 106")
        if "active voters" not in pdf.pages[180].extract_text():
            raise ValueError("Expected active-voter turnout table on physical page 181")
        for name, page in table_specs:
            rows, cells = checked_table(pdf, page)
            with (output / f"{name}.csv").open("w", newline="", encoding="utf-8") as stream:
                csv.writer(stream).writerows(rows)
            audit.append({"table": name, "physicalPage": page, "rows": len(rows),
                          "numericCellsCheckedAgainstText": cells})
    (output / "audit.json").write_text(json.dumps(audit, indent=2), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    extract(args.source, args.output)
