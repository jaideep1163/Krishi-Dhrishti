(function() {
  const $ = (id) => document.getElementById(id);
  const video = $('pdVideo');
  const canvas = $('pdCanvas');
  const shotImg = $('pdShot');
  const idleMsg = $('pdIdleMsg');
  const analyzingOverlay = $('pdAnalyzing');
  const analyzingText = $('pdAnalyzingText');
  const controls = $('pdControls');
  const uploadLabel = $('pdUploadLabel');
  const fileInput = $('pdFileInput');
  const errorBox = $('pdErrorBox');
  const dateStamp = $('pdDateStamp');
  const modalOverlay = $('pdModalOverlay');
  const modalContent = $('pdModalContent');

  let stream = null;
  let activeBlob = null;
  let currentDiagnosisData = null; // Store data to allow live language swapping

  if (dateStamp) {
    dateStamp.textContent = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const analyzingMessages = ['READING SYMPTOMS…', 'CHECKING LEAF SURFACE…', 'CROSS-REFERENCING PATTERNS…', 'ALMOST DONE…'];

  function showError(msg) { errorBox.innerHTML = `<div class="pd-error">${msg}</div>`; }
  function clearError() { errorBox.innerHTML = ''; }

  function setIdleUI() {
    video.classList.add('pd-hidden'); shotImg.classList.add('pd-hidden'); canvas.classList.add('pd-hidden');
    idleMsg.classList.remove('pd-hidden');
    controls.innerHTML = '<button class="pd-btn pd-btn-primary" id="pdMainBtn">Start camera</button>';
    document.getElementById('pdMainBtn').addEventListener('click', startCamera);
    uploadLabel.style.display = 'inline-block'; activeBlob = null; 
  }

  function setCameraUI() {
    idleMsg.classList.add('pd-hidden'); shotImg.classList.add('pd-hidden'); video.classList.remove('pd-hidden');
    controls.innerHTML = `
      <button class="pd-btn pd-btn-primary" id="pdCaptureBtn">Capture leaf</button>
      <button class="pd-btn pd-btn-ghost" id="pdStopBtn" title="Stop camera">✕</button>
    `;
    document.getElementById('pdCaptureBtn').addEventListener('click', capturePhoto);
    document.getElementById('pdStopBtn').addEventListener('click', stopCamera);
    uploadLabel.style.display = 'inline-block';
  }

  function setCapturedUI() {
    video.classList.add('pd-hidden'); idleMsg.classList.add('pd-hidden'); shotImg.classList.remove('pd-hidden');
    controls.innerHTML = `
      <button class="pd-btn pd-btn-primary" id="pdAnalyzeBtn">Diagnose this leaf</button>
      <button class="pd-btn pd-btn-ghost" id="pdRetakeBtn" title="Retake">↺</button>
    `;
    document.getElementById('pdAnalyzeBtn').addEventListener('click', analyzeLeaf);
    document.getElementById('pdRetakeBtn').addEventListener('click', retake);
    uploadLabel.style.display = 'none';
  }

  async function startCamera() {
    clearError();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      video.srcObject = stream; setCameraUI();
    } catch (err) { showError("Couldn't access camera. Check permissions or upload a photo."); }
  }

  function stopCamera() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    setIdleUI();
  }

  function capturePhoto() {
    const w = video.videoWidth || 640; const h = video.videoHeight || 800;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob((blob) => {
      activeBlob = blob; shotImg.src = URL.createObjectURL(blob);
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      setCapturedUI();
    }, 'image/jpeg', 0.9);
  }

  function retake() { activeBlob = null; clearError(); startCamera(); }

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    clearError(); activeBlob = file; shotImg.src = URL.createObjectURL(file);
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    setCapturedUI();
  });
  uploadLabel.addEventListener('click', () => fileInput.click());

  async function analyzeLeaf() {
    if (!activeBlob) return;
    clearError(); analyzingOverlay.classList.remove('pd-hidden');
    controls.querySelectorAll('button').forEach(b => b.disabled = true);

    let msgIdx = 0; analyzingText.textContent = analyzingMessages[0];
    const msgInterval = setInterval(() => {
      msgIdx = (msgIdx + 1) % analyzingMessages.length; analyzingText.textContent = analyzingMessages[msgIdx];
    }, 1400);

    const formData = new FormData(); formData.append('image', activeBlob, 'leaf.jpg');

    try {
      const response = await fetch('/predict', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Diagnostic server error.');
      
      currentDiagnosisData = data;
      renderModalUI('en'); // Default to English
    } catch (err) {
      showError(err.message || 'Diagnosis failed — check server connection and try again.');
    } finally {
      clearInterval(msgInterval); analyzingOverlay.classList.add('pd-hidden');
      controls.querySelectorAll('button').forEach(b => b.disabled = false);
    }
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

  // Re-renders the modal inner HTML based on chosen language
  window.changeLanguage = function(lang) { renderModalUI(lang); }

  function renderModalUI(langCode) {
    const data = currentDiagnosisData;
    if (data.is_leaf === false) { showError(data.message); return; }

    const uncertain = data.is_confident === false;
    const isHealthy = !uncertain && data.raw_label.toLowerCase().includes('healthy');
    const statusClass = uncertain ? 'uncertain' : (isHealthy ? 'healthy' : 'sick');

    const localeData = data.locales[langCode];
    const label = uncertain ? 'Inconclusive' : localeData.name;
    const severityText = localeData.severity;

    let tipsHtml = '';
    if (localeData.tips && localeData.tips.length > 0) {
      tipsHtml = `
        <div class="pd-treatment-box">
          <div class="pd-treatment-title">Recommended Action Plan</div>
          <div class="pd-treatment-list">
            <ul>${localeData.tips.map(tip => `<li>${esc(tip)}</li>`).join('')}</ul>
          </div>
        </div>`;
    }

    const html = `
      <div class="pd-card" style="margin-top: 0; box-shadow: none;">
        <div class="pd-card-top" style="align-items: center;">
          <div>
            <select id="pdLangSelector" class="pd-lang-select" onchange="window.changeLanguage(this.value)">
              <option value="en" ${langCode === 'en' ? 'selected' : ''}>English</option>
              <option value="hi" ${langCode === 'hi' ? 'selected' : ''}>हिंदी</option>
              <option value="kn" ${langCode === 'kn' ? 'selected' : ''}>ಕನ್ನಡ</option>
            </select>
          </div>
          <button class="pd-btn-ghost" id="pdCloseModalBtn" style="width: auto; padding: 0 10px; min-height: 30px; font-size: 14px;">Close</button>
        </div>
        <p class="pd-plant-name">${esc(label)}</p>
        <div class="pd-status-row">
          <span class="pd-status-dot ${statusClass}"></span>
          <span class="pd-status-text ${statusClass}">${esc(severityText)} Severity</span>
          <span class="pd-confidence">${data.top_confidence ? data.top_confidence.toFixed(1) : 0}%</span>
        </div>
        
        ${tipsHtml}
        
        <div class="pd-controls" style="margin-top: 20px;">
          <button class="pd-btn pd-btn-primary" id="pdSpeakBtn">🔊 Listen</button>
        </div>
      </div>
    `;

    modalContent.innerHTML = html;
    modalOverlay.classList.remove('pd-hidden');

    document.getElementById('pdCloseModalBtn').addEventListener('click', () => {
      modalOverlay.classList.add('pd-hidden');
      if('speechSynthesis' in window) window.speechSynthesis.cancel();
      setIdleUI();
    });

    document.getElementById('pdSpeakBtn').addEventListener('click', () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        // Construct the localized audio string
        const textToRead = `${localeData.name}. ${localeData.tips ? localeData.tips.join(' ') : ''}`;
        const utterance = new SpeechSynthesisUtterance(textToRead);
        
        // Map UI lang codes to actual BCP 47 language tags for TTS
        const langMap = { 'en': 'en-IN', 'hi': 'hi-IN', 'kn': 'kn-IN' };
        utterance.lang = langMap[langCode];
        utterance.rate = 0.9;
        
        window.speechSynthesis.speak(utterance);
      } else {
        alert("Audio readout isn't supported on this browser.");
      }
    });
  }

  setIdleUI();
})();