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
  const resultsBox = $('pdResults');
  const dateStamp = $('pdDateStamp');

  let stream = null;
  let activeBlob = null;

  if (dateStamp) {
    dateStamp.textContent = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const analyzingMessages = ['READING SYMPTOMS…', 'CHECKING LEAF SURFACE…', 'CROSS-REFERENCING PATTERNS…', 'ALMOST DONE…'];

  function showError(msg) {
    errorBox.innerHTML = `<div class="pd-error">${msg}</div>`;
  }
  function clearError() { errorBox.innerHTML = ''; }

  function setIdleUI() {
    video.classList.add('pd-hidden');
    shotImg.classList.add('pd-hidden');
    canvas.classList.add('pd-hidden');
    idleMsg.classList.remove('pd-hidden');
    controls.innerHTML = '<button class="pd-btn pd-btn-primary" id="pdMainBtn">Start camera</button>';
    document.getElementById('pdMainBtn').addEventListener('click', startCamera);
    uploadLabel.style.display = 'inline-block';
  }

  function setCameraUI() {
    idleMsg.classList.add('pd-hidden');
    shotImg.classList.add('pd-hidden');
    video.classList.remove('pd-hidden');
    controls.innerHTML = `
      <button class="pd-btn pd-btn-primary" id="pdCaptureBtn">Capture leaf</button>
      <button class="pd-btn pd-btn-ghost" id="pdStopBtn" title="Stop camera">✕</button>
    `;
    document.getElementById('pdCaptureBtn').addEventListener('click', capturePhoto);
    document.getElementById('pdStopBtn').addEventListener('click', stopCamera);
    uploadLabel.style.display = 'inline-block';
  }

  function setCapturedUI() {
    video.classList.add('pd-hidden');
    idleMsg.classList.add('pd-hidden');
    shotImg.classList.remove('pd-hidden');
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
    resultsBox.innerHTML = '';
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      video.srcObject = stream;
      setCameraUI();
    } catch (err) {
      showError("Couldn't access camera. Check permissions or upload a photo instead.");
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    setIdleUI();
  }

  function capturePhoto() {
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 800;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);
    
    canvas.toBlob((blob) => {
      activeBlob = blob;
      shotImg.src = URL.createObjectURL(blob);
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      setCapturedUI();
    }, 'image/jpeg', 0.9);
  }

  function retake() {
    activeBlob = null;
    resultsBox.innerHTML = '';
    clearError();
    startCamera();
  }

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    clearError();
    resultsBox.innerHTML = '';
    activeBlob = file;
    shotImg.src = URL.createObjectURL(file);
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    setCapturedUI();
  });
  uploadLabel.addEventListener('click', () => fileInput.click());

  async function analyzeLeaf() {
    if (!activeBlob) return;
    clearError();
    resultsBox.innerHTML = '';
    analyzingOverlay.classList.remove('pd-hidden');
    controls.querySelectorAll('button').forEach(b => b.disabled = true);

    let msgIdx = 0;
    analyzingText.textContent = analyzingMessages[0];
    const msgInterval = setInterval(() => {
      msgIdx = (msgIdx + 1) % analyzingMessages.length;
      analyzingText.textContent = analyzingMessages[msgIdx];
    }, 1400);

    const formData = new FormData();
    formData.append('image', activeBlob, 'leaf.jpg');

    try {
      const response = await fetch('/predict', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Diagnostic server error.');
      renderResult(data);
    } catch (err) {
      showError(err.message || 'Diagnosis failed — check server connection and try again.');
    } finally {
      clearInterval(msgInterval);
      analyzingOverlay.classList.add('pd-hidden');
      controls.querySelectorAll('button').forEach(b => b.disabled = false);
    }
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function renderResult(data) {
    if (data.is_leaf === false) {
      showError(data.message || 'No leaf detected in frame. Recenter the leaf and rescan.');
      return;
    }

    const uncertain = data.is_confident === false;
    const label = uncertain ? 'Inconclusive' : (data.top_label ? data.top_label.replace(/_/g, ' ') : 'Unknown');
    const healthy = !uncertain && label.toLowerCase().includes('healthy');
    
    let statusClass = 'sick';
    if (uncertain) statusClass = 'uncertain';
    else if (healthy) statusClass = 'healthy';

    let breakdownHtml = '';
    if (Array.isArray(data.breakdown) && data.breakdown.length > 0) {
      breakdownHtml = `
        <div style="font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--soil); margin-top: 14px;">Full Readout</div>
        <ul class="pd-breakdown-list">
          ${data.breakdown.map(b => `
            <li class="pd-breakdown-item">
              <span>${esc(b.label.replace(/_/g, ' '))}</span>
              <span style="font-family: var(--font-mono); color: var(--soil);">${b.confidence.toFixed(1)}%</span>
            </li>
          `).join('')}
        </ul>
      `;
    }

    const html = `
      <div class="pd-card">
        <div class="pd-card-top">
          <span>Specimen Card</span>
          <span>${esc(dateStamp ? dateStamp.textContent : '')}</span>
        </div>
        <p class="pd-plant-name">${esc(label)}</p>
        <div class="pd-status-row">
          <span class="pd-status-dot ${statusClass}"></span>
          <span class="pd-status-text ${statusClass}">${uncertain ? 'Uncertain Match' : (healthy ? 'Healthy Leaf' : 'Pathology Identified')}</span>
          <span class="pd-confidence">${data.top_confidence ? data.top_confidence.toFixed(1) : 0}% confidence</span>
        </div>
        ${data.message ? `<p style="font-size: 13.5px; line-height: 1.5; color: var(--soil); margin: 10px 0;">${esc(data.message)}</p>` : ''}
        ${breakdownHtml}
        <div class="pd-disclaimer">Visual assessment only, not a lab diagnosis. For high-value crops, confirm with a local agricultural extension office.</div>
      </div>
      <button class="pd-btn pd-btn-primary pd-scan-again" id="pdScanAgainBtn">Scan another leaf</button>
    `;

    resultsBox.innerHTML = html;
    document.getElementById('pdScanAgainBtn').addEventListener('click', () => {
      activeBlob = null;
      resultsBox.innerHTML = '';
      setIdleUI();
    });
  }

  setIdleUI();
})();