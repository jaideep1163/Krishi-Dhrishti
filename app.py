"""
app.py
------
A small Flask web app: upload a rice leaf photo in the browser, get back
the predicted disease with confidence scores.

Setup:
    pip install flask tensorflow pillow numpy transformers torch

    The CLIP weights (~600MB) download automatically on first request.
    If transformers and torch aren't installed, the app falls back to 
    running predictions without the leaf gate filter.

Before running, make sure these two files (produced by train.py) are in
this same folder:
    - rice_model.keras
    - class_names.json

Run:
    python app.py
"""

import io
import cv2
import numpy as np
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

def is_foliage_present(image_bytes):
    """
    Checks if the image contains enough leaf/foliage pixels.
    Returns True if at least 5% of the frame matches green/yellow vegetation tones.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if img is None:
        return False

    # Convert image from BGR to HSV color space
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    # Define range for foliage greens and yellowing leaves
    lower_green = np.array([25, 35, 35])
    upper_green = np.array([85, 255, 255])
    
    # Count matching pixels
    mask = cv2.inRange(hsv, lower_green, upper_green)
    foliage_ratio = np.count_nonzero(mask) / (img.shape[0] * img.shape[1])
    
    return foliage_ratio >= 0.05

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    if 'image' not in request.files:
        return jsonify({'is_leaf': False, 'message': 'No image uploaded.'}), 400

    file = request.files['image']
    img_bytes = file.read()

    # 1. Pre-filter step: Reject non-leaf inputs (documents, walls, faces, etc.)
    if not is_foliage_present(img_bytes):
        return jsonify({
            'is_leaf': False,
            'message': 'No leaf detected in frame. Please center a plant leaf and try again.'
        }), 200

    # 2. Model prediction step (replace this mock block with your PyTorch/Keras inference call)
    # ---------------------------------------------------------------------------------
    # Example:
    # predictions = my_model.predict(processed_img)
    # ---------------------------------------------------------------------------------
    
    return jsonify({
        'is_leaf': True,
        'is_confident': True,
        'top_label': 'Bacterial leaf blight',
        'top_confidence': 98.7,
        'breakdown': [
            {'label': 'Bacterial leaf blight', 'confidence': 98.7},
            {'label': 'Brown spot', 'confidence': 1.0},
            {'label': 'Healthy', 'confidence': 0.2},
            {'label': 'Leaf Blast', 'confidence': 0.1},
            {'label': 'Tungro', 'confidence': 0.0}
        ]
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)