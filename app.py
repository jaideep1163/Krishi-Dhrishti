"""
app.py
------
A small Flask web app: upload a rice leaf photo in the browser, get back
the predicted disease with confidence scores.

Setup:
    pip install flask tensorflow pillow numpy

Before running, make sure these two files (produced by train.py) are in
this same folder:
    - rice_model.keras
    - class_names.json

Run:
    python app.py

Then open http://127.0.0.1:5000 in your browser.
"""

import json
import os
import uuid

import numpy as np
from flask import Flask, jsonify, render_template, request
from werkzeug.utils import secure_filename

# Reuse the existing SQLite logging module if it's present in this folder.
try:
    import db as prediction_db
    HAS_DB = True
except ImportError:
    HAS_DB = False

MODEL_PATH = os.environ.get("RICE_MODEL_PATH", "rice_model.keras")
CLASS_NAMES_PATH = os.environ.get("RICE_CLASS_NAMES_PATH", "class_names.json")
UPLOAD_DIR = "uploads"
IMG_SIZE = 224
ALLOWED_EXT = {"png", "jpg", "jpeg", "bmp", "webp"}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024  # 8 MB max upload

os.makedirs(UPLOAD_DIR, exist_ok=True)

_model = None
_class_names = None


def get_model():
    """Lazy-load the TensorFlow model on first request (keeps app startup fast)."""
    global _model, _class_names
    if _model is None:
        import tensorflow as tf  # imported here so the app can still boot if TF is missing

        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                f"Model file '{MODEL_PATH}' not found. Train it first with train.py, "
                f"or set RICE_MODEL_PATH to point at your .keras file."
            )
        if not os.path.exists(CLASS_NAMES_PATH):
            raise FileNotFoundError(
                f"'{CLASS_NAMES_PATH}' not found. It's created automatically by train.py."
            )
        _model = tf.keras.models.load_model(MODEL_PATH)
        with open(CLASS_NAMES_PATH) as f:
            _class_names = json.load(f)
    return _model, _class_names


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT


def run_prediction(image_path):
    import tensorflow as tf

    model, class_names = get_model()

    img = tf.keras.utils.load_img(image_path, target_size=(IMG_SIZE, IMG_SIZE))
    arr = tf.keras.utils.img_to_array(img)
    arr = np.expand_dims(arr, axis=0)

    preds = model.predict(arr, verbose=0)[0]
    order = np.argsort(preds)[::-1]

    results = [
        {"label": class_names[i], "confidence": round(float(preds[i]) * 100, 2)}
        for i in order
    ]
    return results


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/predict", methods=["POST"])
def predict():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded."}), 400

    file = request.files["image"]
    if file.filename == "":
        return jsonify({"error": "No file selected."}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "Unsupported file type. Use JPG, PNG, BMP, or WEBP."}), 400

    filename = f"{uuid.uuid4().hex}_{secure_filename(file.filename)}"
    save_path = os.path.join(UPLOAD_DIR, filename)
    file.save(save_path)

    try:
        results = run_prediction(save_path)
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        return jsonify({"error": f"Prediction failed: {e}"}), 500

    top = results[0]

    if HAS_DB:
        all_probs = {r["label"]: r["confidence"] / 100.0 for r in results}
        prediction_db.log_prediction(save_path, top["label"], top["confidence"] / 100.0, all_probs)

    return jsonify({
        "top_label": top["label"],
        "top_confidence": top["confidence"],
        "breakdown": results,
        "image_url": f"/{save_path}",
    })


@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    from flask import send_from_directory
    return send_from_directory(UPLOAD_DIR, filename)


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
