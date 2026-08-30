"""
app.py
------
A small Flask web app: upload a rice leaf photo in the browser, get back
the predicted disease with confidence scores and localized text.
"""

import io
import cv2
import numpy as np
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

TREATMENT_DB = {
    'Bacterial leaf blight': {
        'en': {'name': 'Bacterial Leaf Blight', 'severity': 'Critical', 'tips': ['Drain the field immediately.', 'Apply copper-based bactericides.']},
        'hi': {'name': 'जीवाणु झुलसा (Bacterial Blight)', 'severity': 'गंभीर', 'tips': ['खेत से तुरंत पानी निकालें।', 'कॉपर-आधारित कीटनाशक का प्रयोग करें।']},
        'kn': {'name': 'ಬ್ಯಾಕ್ಟೀರಿಯಾ ಎಲೆ ರೋಗ', 'severity': 'ತೀವ್ರ', 'tips': ['ತಕ್ಷಣ ಗದ್ದೆಯಿಂದ ನೀರು ತೆಗೆಯಿರಿ.', 'ತಾಮ್ರ ಆಧಾರಿತ ಔಷಧಿ ಬಳಸಿ.']}
    },
    'Brown spot': {
        'en': {'name': 'Brown Spot', 'severity': 'Moderate', 'tips': ['Apply balanced nutrients.', 'Use Mancozeb if severe.']},
        'hi': {'name': 'भूरा धब्बा (Brown Spot)', 'severity': 'मध्यम', 'tips': ['संतुलित पोषक तत्वों का प्रयोग करें।', 'गंभीर होने पर मैन्कोज़ेब का उपयोग करें।']},
        'kn': {'name': 'ಕಂದು ಚುಕ್ಕೆ ರೋಗ', 'severity': 'ಸಾಧಾರಣ', 'tips': ['ಸಮತೋಲಿತ ಪೋಷಕಾಂಶಗಳನ್ನು ಬಳಸಿ.', 'ತೀವ್ರವಾಗಿದ್ದರೆ ಮ್ಯಾಂಕೋಜೆಬ್ ಬಳಸಿ.']}
    },
    'Healthy': {
        'en': {'name': 'Healthy Leaf', 'severity': 'None', 'tips': ['Maintain current watering schedule.', 'Keep up regular field scouting.']},
        'hi': {'name': 'स्वस्थ पत्ता', 'severity': 'कोई नहीं', 'tips': ['वर्तमान सिंचाई बनाए रखें।', 'नियमित खेत की जाँच करते रहें।']},
        'kn': {'name': 'ಆರೋಗ್ಯಕರ ಎಲೆ', 'severity': 'ಇಲ್ಲ', 'tips': ['ಪ್ರಸ್ತುತ ನೀರಾವರಿ ನಿರ್ವಹಿಸಿ.', 'ನಿಯಮಿತ ಗದ್ದೆ ತಪಾಸಣೆ ಮುಂದುವರಿಸಿ.']}
    },
    'Leaf Blast': {
        'en': {'name': 'Leaf Blast', 'severity': 'High', 'tips': ['Apply tricyclazole fungicides.', 'Manage nitrogen carefully.']},
        'hi': {'name': 'लीफ ब्लास्ट (झोंका रोग)', 'severity': 'उच्च', 'tips': ['ट्राइसाइक्लाजोल कवकनाशी का प्रयोग करें।', 'नाइट्रोजन का ध्यान रखें।']},
        'kn': {'name': 'ಎಲೆ ಬೆಂಕಿ ರೋಗ', 'severity': 'ಹೆಚ್ಚು', 'tips': ['ಟ್ರೈಸೈಕ್ಲಜೋಲ್ ಶಿಲೀಂಧ್ರನಾಶಕ ಬಳಸಿ.', 'ಸಾರಜನಕವನ್ನು ಎಚ್ಚರಿಕೆಯಿಂದ ನಿರ್ವಹಿಸಿ.']}
    },
    'Tungro': {
        'en': {'name': 'Tungro', 'severity': 'Severe', 'tips': ['Uproot infected plants.', 'Control green leafhoppers.']},
        'hi': {'name': 'टुंग्रो रोग', 'severity': 'बहुत गंभीर', 'tips': ['संक्रमित पौधों को उखाड़ दें।', 'हरे फुदके (लीफहॉपर) को नियंत्रित करें।']},
        'kn': {'name': 'ತುಂಗ್ರೋ ರೋಗ', 'severity': 'ಅತಿ ತೀವ್ರ', 'tips': ['ಸೋಂಕಿತ ಸಸ್ಯಗಳನ್ನು ಕೀಳರಿ.', 'ಹಸಿರು ಜಿಗಿಹುಳುಗಳನ್ನು ನಿಯಂತ್ರಿಸಿ.']}
    }
}

def is_foliage_present(image_bytes):
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return False
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    lower_green = np.array([25, 35, 35])
    upper_green = np.array([85, 255, 255])
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

    if not is_foliage_present(img_bytes):
        return jsonify({
            'is_leaf': False,
            'message': 'No leaf detected in frame. Please center a plant leaf and try again.'
        }), 200

    # 2. Model prediction step (mocked)
    top_disease = 'Bacterial leaf blight'
    localizations = TREATMENT_DB.get(top_disease, TREATMENT_DB['Healthy'])
    
    return jsonify({
        'is_leaf': True,
        'is_confident': True,
        'top_confidence': 98.7,
        'raw_label': top_disease,
        'locales': localizations,
        'breakdown': [
            {'label': 'Bacterial leaf blight', 'confidence': 98.7},
            {'label': 'Brown spot', 'confidence': 1.0}
        ]
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)