# Leaf Scanner — Rice Disease Web App

A small browser app: drag in (or tap to choose) a photo of a rice leaf, and
it returns the predicted disease with a confidence breakdown — built on top
of the model you trained with `train.py` from the classifier project.

## Setup

1. Copy your trained model files into this folder:
   - `rice_model.keras`
   - `class_names.json`

   (These are produced by `train.py` in the classifier project — copy them
   here, or set environment variables to point elsewhere:
   `RICE_MODEL_PATH` and `RICE_CLASS_NAMES_PATH`.)

2. Install dependencies:
   ```bash
   pip install -r requirements.txt --break-system-packages
   ```

3. Run the app:
   ```bash
   python app.py
   ```

4. Open **http://127.0.0.1:5000** in your browser.

## How it works

- Drop or select a leaf photo in the scan frame.
- The photo is sent to the `/predict` endpoint, run through your model, and
  the result — disease name, confidence %, and the full probability
  breakdown across all classes — is shown instantly.
- If `db.py` is present in this folder (copy it over from the classifier
  project), every prediction is automatically logged to `predictions.db` —
  no extra flag needed here, since the app always tries to log if the module
  is available. Manage that history the same way as before:
  ```bash
  python db.py list
  python db.py stats
  python db.py export --out predictions.csv
  ```

## Notes

- Uploaded images are saved into `uploads/` (created automatically) so they
  can be reviewed later or reused for retraining. Feel free to periodically
  clear this folder if disk space matters.
- Max upload size is 8 MB — adjust `MAX_CONTENT_LENGTH` in `app.py` if you
  need larger images.
- This runs Flask's built-in development server, which is fine for local/
  personal use or a demo. For real deployment (e.g. sharing with others on
  a network), run it behind a production server like `gunicorn`:
  ```bash
  pip install gunicorn --break-system-packages
  gunicorn -w 2 -b 0.0.0.0:5000 app:app
  ```

## Files

| File | Purpose |
|---|---|
| `app.py` | Flask backend — serves the page and runs predictions |
| `templates/index.html` | The upload page |
| `static/style.css` | Visual design |
| `static/script.js` | Drag-and-drop upload, preview, and result rendering |
| `db.py` | (optional, copy from classifier project) prediction history |
