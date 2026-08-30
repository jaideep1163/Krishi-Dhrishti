"""
db.py
-----
SQLite-backed storage for rice-disease prediction history.

Every time predict.py classifies an image, it can log the result here:
    image path, predicted disease, confidence, full probability breakdown,
    and a timestamp. You can later review predictions, correct any that
    were wrong (useful for building a labeled set for retraining), and
    export everything to CSV.

This module is imported by predict.py and used directly via the CLI
commands below.

CLI usage:
    python db.py list                          # show recent predictions
    python db.py list --limit 50
    python db.py list --disease Brown_Spot      # filter by predicted class
    python db.py list --low_confidence 70       # show predictions under 70%
    python db.py correct --id 12 --label Brown_Spot   # fix a wrong prediction
    python db.py export --out predictions.csv   # export everything to CSV
    python db.py stats                          # counts per disease
"""

import argparse
import csv
import json
import sqlite3
from datetime import datetime, timezone

DB_PATH = "predictions.db"


def get_connection(db_path=DB_PATH):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path=DB_PATH):
    conn = get_connection(db_path)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            image_path TEXT NOT NULL,
            predicted_label TEXT NOT NULL,
            confidence REAL NOT NULL,
            all_probabilities TEXT NOT NULL,   -- JSON: {"Brown_Spot": 0.81, ...}
            corrected_label TEXT,              -- filled in later if the prediction was wrong
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def log_prediction(image_path, predicted_label, confidence, all_probabilities, db_path=DB_PATH):
    """Insert one prediction record. Returns the new row's id."""
    init_db(db_path)
    conn = get_connection(db_path)
    cur = conn.execute(
        """
        INSERT INTO predictions (image_path, predicted_label, confidence, all_probabilities, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            image_path,
            predicted_label,
            confidence,
            json.dumps(all_probabilities),
            datetime.now(timezone.utc).isoformat(timespec="seconds"),
        ),
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def list_predictions(limit=20, disease=None, low_confidence=None, db_path=DB_PATH):
    init_db(db_path)
    conn = get_connection(db_path)
    query = "SELECT * FROM predictions WHERE 1=1"
    params = []
    if disease:
        query += " AND predicted_label = ?"
        params.append(disease)
    if low_confidence is not None:
        query += " AND confidence < ?"
        params.append(low_confidence / 100.0)
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return rows


def correct_prediction(row_id, correct_label, db_path=DB_PATH):
    init_db(db_path)
    conn = get_connection(db_path)
    conn.execute(
        "UPDATE predictions SET corrected_label = ? WHERE id = ?",
        (correct_label, row_id),
    )
    conn.commit()
    changed = conn.total_changes
    conn.close()
    return changed > 0


def export_csv(out_path, db_path=DB_PATH):
    init_db(db_path)
    conn = get_connection(db_path)
    rows = conn.execute("SELECT * FROM predictions ORDER BY created_at").fetchall()
    conn.close()

    with open(out_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "id", "image_path", "predicted_label", "confidence",
            "corrected_label", "created_at", "all_probabilities"
        ])
        for r in rows:
            writer.writerow([
                r["id"], r["image_path"], r["predicted_label"],
                f'{r["confidence"] * 100:.2f}%', r["corrected_label"] or "",
                r["created_at"], r["all_probabilities"],
            ])
    return len(rows)


def stats(db_path=DB_PATH):
    init_db(db_path)
    conn = get_connection(db_path)
    rows = conn.execute(
        """
        SELECT predicted_label, COUNT(*) as n, AVG(confidence) as avg_conf
        FROM predictions
        GROUP BY predicted_label
        ORDER BY n DESC
        """
    ).fetchall()
    total = conn.execute("SELECT COUNT(*) as n FROM predictions").fetchone()["n"]
    corrected = conn.execute(
        "SELECT COUNT(*) as n FROM predictions WHERE corrected_label IS NOT NULL"
    ).fetchone()["n"]
    conn.close()
    return rows, total, corrected


def _print_rows(rows):
    if not rows:
        print("No predictions found.")
        return
    for r in rows:
        corrected = f"  [corrected -> {r['corrected_label']}]" if r["corrected_label"] else ""
        print(
            f"#{r['id']:<5} {r['created_at']}  "
            f"{r['predicted_label']:<25s} {r['confidence']*100:6.2f}%  "
            f"{r['image_path']}{corrected}"
        )


def main():
    parser = argparse.ArgumentParser(description="Manage the rice-disease prediction database")
    sub = parser.add_subparsers(dest="command", required=True)

    p_list = sub.add_parser("list", help="List recent predictions")
    p_list.add_argument("--limit", type=int, default=20)
    p_list.add_argument("--disease", help="Filter by predicted disease name")
    p_list.add_argument("--low_confidence", type=float,
                         help="Only show predictions below this confidence %% (e.g. 70)")

    p_correct = sub.add_parser("correct", help="Correct a wrong prediction")
    p_correct.add_argument("--id", type=int, required=True, help="Prediction row id")
    p_correct.add_argument("--label", required=True, help="Correct disease label")

    p_export = sub.add_parser("export", help="Export all predictions to CSV")
    p_export.add_argument("--out", default="predictions.csv")

    sub.add_parser("stats", help="Show counts per predicted disease")

    args = parser.parse_args()

    if args.command == "list":
        rows = list_predictions(args.limit, args.disease, args.low_confidence)
        _print_rows(rows)

    elif args.command == "correct":
        ok = correct_prediction(args.id, args.label)
        if ok:
            print(f"Updated prediction #{args.id} -> corrected label: {args.label}")
        else:
            print(f"No prediction found with id {args.id}")

    elif args.command == "export":
        n = export_csv(args.out)
        print(f"Exported {n} predictions to {args.out}")

    elif args.command == "stats":
        rows, total, corrected = stats()
        print(f"Total predictions: {total}  |  Manually corrected: {corrected}\n")
        for r in rows:
            print(f"  {r['predicted_label']:<25s} count={r['n']:<5d} avg_confidence={r['avg_conf']*100:.2f}%")


if __name__ == "__main__":
    main()
