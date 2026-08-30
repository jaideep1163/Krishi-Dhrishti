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
  let currentDiagnosisData = null;

  if (dateStamp) {
    dateStamp.textContent = new Date().toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  const analyzingMessages = [
    'READING SYMPTOMS…',
    'CHECKING LEAF SURFACE…',
    'CROSS-REFERENCING PATTERNS…',
    'ALMOST DONE…'
  ];

  function showError(msg) {
    errorBox.innerHTML = `<div class="pd-error">${msg}</div>`;
  }

  function clearError() {
    errorBox.innerHTML = '';
  }

  function setIdleUI() {
    video.classList.add('pd-hidden');
    shotImg.classList.add('pd-hidden');
    canvas.classList.add('pd-hidden');
    idleMsg.classList.remove('pd-hidden');

    controls.innerHTML =
      '<button class="pd-btn pd-btn-primary" id="pdMainBtn">Start camera</button>';

    document
      .getElementById('pdMainBtn')
      .addEventListener('click', startCamera);

    uploadLabel.style.display = 'inline-block';
    activeBlob = null;
  }

  function setCameraUI() {
    idleMsg.classList.add('pd-hidden');
    shotImg.classList.add('pd-hidden');
    video.classList.remove('pd-hidden');

    controls.innerHTML = `
      <button class="pd-btn pd-btn-primary" id="pdCaptureBtn">
        Capture leaf
      </button>
      <button class="pd-btn pd-btn-ghost" id="pdStopBtn" title="Stop camera">
        ✕
      </button>
    `;

    document
      .getElementById('pdCaptureBtn')
      .addEventListener('click', capturePhoto);

    document
      .getElementById('pdStopBtn')
      .addEventListener('click', stopCamera);

    uploadLabel.style.display = 'inline-block';
  }

  function setCapturedUI() {
    video.classList.add('pd-hidden');
    idleMsg.classList.add('pd-hidden');
    shotImg.classList.remove('pd-hidden');

    controls.innerHTML = `
      <button class="pd-btn pd-btn-primary" id="pdAnalyzeBtn">
        Diagnose this leaf
      </button>
      <button class="pd-btn pd-btn-ghost" id="pdRetakeBtn" title="Retake">
        ↺
      </button>
    `;

    document
      .getElementById('pdAnalyzeBtn')
      .addEventListener('click', analyzeLeaf);

    document
      .getElementById('pdRetakeBtn')
      .addEventListener('click', retake);

    uploadLabel.style.display = 'none';
  }

  async function startCamera() {
    clearError();

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: 'environment'
          }
        },
        audio: false
      });

      video.srcObject = stream;
      setCameraUI();

    } catch (err) {
      showError(
        "Couldn't access camera. Check permissions or upload a photo."
      );
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

    ctx.drawImage(
      video,
      0,
      0,
      w,
      h
    );

    canvas.toBlob(
      (blob) => {
        activeBlob = blob;
        shotImg.src = URL.createObjectURL(blob);

        if (stream) {
          stream.getTracks().forEach(t => t.stop());
          stream = null;
        }

        setCapturedUI();
      },
      'image/jpeg',
      0.9
    );
  }

  function retake() {
    activeBlob = null;
    clearError();
    startCamera();
  }

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];

    if (!file) return;

    clearError();

    activeBlob = file;
    shotImg.src = URL.createObjectURL(file);

    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }

    setCapturedUI();
  });

  uploadLabel.addEventListener('click', () => {
    fileInput.click();
  });

  async function analyzeLeaf() {
    if (!activeBlob) return;

    clearError();

    analyzingOverlay.classList.remove('pd-hidden');

    controls
      .querySelectorAll('button')
      .forEach(b => b.disabled = true);

    let msgIdx = 0;

    analyzingText.textContent = analyzingMessages[0];

    const msgInterval = setInterval(() => {
      msgIdx =
        (msgIdx + 1) % analyzingMessages.length;

      analyzingText.textContent =
        analyzingMessages[msgIdx];

    }, 1400);

    const formData = new FormData();

    formData.append(
      'image',
      activeBlob,
      'leaf.jpg'
    );

    try {
      const response = await fetch(
        '/predict',
        {
          method: 'POST',
          body: formData
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || 'Diagnostic server error.'
        );
      }

      currentDiagnosisData = data;

      renderModalUI('en');

    } catch (err) {

      showError(
        err.message ||
        'Diagnosis failed — check server connection and try again.'
      );

    } finally {

      clearInterval(msgInterval);

      analyzingOverlay.classList.add('pd-hidden');

      controls
        .querySelectorAll('button')
        .forEach(b => b.disabled = false);
    }
  }

  function esc(s) {
    const d = document.createElement('div');

    d.textContent =
      s == null ? '' : String(s);

    return d.innerHTML;
  }

  window.changeLanguage = function(lang) {
    renderModalUI(lang);
  };

  function renderModalUI(langCode) {

    const data = currentDiagnosisData;

    if (data.is_leaf === false) {
      showError(data.message);
      return;
    }

    const uncertain =
      data.is_confident === false;

    const isHealthy =
      !uncertain &&
      data.raw_label
        .toLowerCase()
        .includes('healthy');

    const statusClass =
      uncertain
        ? 'uncertain'
        : (isHealthy ? 'healthy' : 'sick');

    const localeData =
      data.locales[langCode];

    const label =
      uncertain
        ? 'Inconclusive'
        : localeData.name;

    const severityText =
      localeData.severity;

    const tips =
      localeData.tips || [];

    let tipsHtml = '';

    if (tips.length > 0) {

      tipsHtml = `
        <div class="pd-treatment-box">

          <div class="pd-treatment-title">
            Recommended Action Plan
          </div>

          <div class="pd-treatment-list">

            <ul>
              ${tips.map(tip =>
                `<li>${esc(tip)}</li>`
              ).join('')}
            </ul>

          </div>

        </div>
      `;
    }

    /*
     * Farmer references and precautions
     */
    const reportLinks = `

      <div class="pd-reference-box">

        <div class="pd-reference-title">
          Farmer References & Precautions
        </div>

        <a
          href="https://icar.gov.in/sites/default/files/Circulars/ICAR%20En-Kharif%20Agro-Advisories%20for%20Farmers%202025.pdf"
          target="_blank"
          rel="noopener"
        >
          ICAR — Kharif Agro-Advisories for Farmers
        </a>

        <a
          href="https://icar.gov.in/index.php/en/icar-iirr-hyderabad-organises-raise-project-stakeholders-workshop-on-ai-based-rice-stress-evaluation"
          target="_blank"
          rel="noopener"
        >
          ICAR-IIRR — Rice AI Stress Evaluation
        </a>

        <p class="pd-safety-note">

          Verify any crop-protection product, dose and timing
          against its current label and with a qualified local
          agriculture adviser before use.

          This image is an AI-assisted field advisory,
          not a legal prescription.

        </p>

      </div>
    `;

    /*
     * Main report
     */
    const html = `

      <div
        class="pd-card"
        id="pdReportCard"
      >

        <div
          class="pd-card-top"
          style="align-items:center;"
        >

          <div>

            <select
              id="pdLangSelector"
              class="pd-lang-select"
              onchange="window.changeLanguage(this.value)"
            >

              <option
                value="en"
                ${langCode === 'en' ? 'selected' : ''}
              >
                English
              </option>

              <option
                value="hi"
                ${langCode === 'hi' ? 'selected' : ''}
              >
                हिंदी
              </option>

              <option
                value="kn"
                ${langCode === 'kn' ? 'selected' : ''}
              >
                ಕನ್ನಡ
              </option>

            </select>

          </div>

          <button
            class="pd-btn-ghost"
            id="pdCloseModalBtn"
            style="
              width:auto;
              padding:0 10px;
              min-height:30px;
              font-size:14px;
            "
          >
            Close
          </button>

        </div>

        <div class="pd-report-brand">
          LEAF SCOUT · FIELD DIAGNOSTIC REPORT
        </div>

        <div class="pd-report-meta">

          <span>
            ${new Date().toLocaleDateString(
              undefined,
              {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
              }
            )}
          </span>

          <span>
            AI-ASSISTED
          </span>

        </div>

        <div class="pd-report-photo-wrap">

          ${
            shotImg.src
              ? `
                <img
                  src="${esc(shotImg.src)}"
                  class="pd-report-photo"
                  alt="Leaf image used for diagnosis"
                >
              `
              : ''
          }

        </div>

        <p class="pd-plant-name">
          ${esc(label)}
        </p>

        <div class="pd-status-row">

          <span
            class="pd-status-dot ${statusClass}"
          ></span>

          <span
            class="pd-status-text ${statusClass}"
          >
            ${esc(severityText)} Severity
          </span>

          <span class="pd-confidence">

            ${
              data.top_confidence
                ? data.top_confidence.toFixed(1)
                : 0
            }% confidence

          </span>

        </div>

        ${tipsHtml}

        ${reportLinks}

        <div class="pd-report-footer">

          <strong>IMPORTANT:</strong>

          Do not treat this image alone as a prescription.

          Confirm the diagnosis and treatment with a local
          agriculture officer/expert when the crop is severely
          affected or the diagnosis is uncertain.

        </div>

      </div>

      <div class="pd-share-actions">

        <button
          class="pd-btn pd-btn-primary"
          id="pdDownloadImageBtn"
        >
          ⬇ Save report image
        </button>

        <button
          class="pd-btn pd-btn-whatsapp"
          id="pdWhatsAppBtn"
        >
          ☘ Share image
        </button>

        <button
          class="pd-btn pd-btn-ghost-wide"
          id="pdSpeakBtn"
        >
          🔊 Listen
        </button>

      </div>

      <p class="pd-share-hint">

        Best for WhatsApp: save the image or use
        “Share image” on a phone/browser that supports
        file sharing.

      </p>
    `;

    modalContent.innerHTML = html;

    modalOverlay.classList.remove('pd-hidden');

    /*
     * Close report
     */
    document
      .getElementById('pdCloseModalBtn')
      .addEventListener('click', () => {

        modalOverlay.classList.add('pd-hidden');

        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }

        setIdleUI();
      });

    /*
     * Text-to-speech
     */
    document
      .getElementById('pdSpeakBtn')
      .addEventListener('click', () => {

        if ('speechSynthesis' in window) {

          window.speechSynthesis.cancel();

          const textToRead = `

            ${localeData.name}.

            ${
              localeData.tips
                ? localeData.tips.join(' ')
                : ''
            }.

            This is an AI-assisted field advisory,
            not a prescription.

          `;

          const utterance =
            new SpeechSynthesisUtterance(
              textToRead
            );

          const langMap = {
            en: 'en-IN',
            hi: 'hi-IN',
            kn: 'kn-IN'
          };

          utterance.lang =
            langMap[langCode];

          utterance.rate = 0.9;

          window.speechSynthesis.speak(
            utterance
          );

        } else {

          alert(
            "Audio readout isn't supported on this browser."
          );

        }
      });

    /*
     * Save image
     */
    document
      .getElementById('pdDownloadImageBtn')
      .addEventListener(
        'click',
        saveReportImage
      );

    /*
     * Share image
     */
    document
      .getElementById('pdWhatsAppBtn')
      .addEventListener(
        'click',
        shareReportImage
      );
  }

  /*
   * Convert the report HTML into a PNG image.
   */
  async function makeReportCanvas() {

    const report =
      document.getElementById('pdReportCard');

    if (
      !report ||
      typeof html2canvas === 'undefined'
    ) {

      throw new Error(
        'Report image generator is not available. ' +
        'Please check your internet connection and try again.'
      );
    }

    /*
     * Hide controls while taking the screenshot.
     */
    const interactive =
      report.querySelectorAll(
        'select,button'
      );

    interactive.forEach(el =>
      el.classList.add(
        'pd-capture-hide'
      )
    );

    try {

      return await html2canvas(
        report,
        {
          scale: Math.min(
            3,
            Math.max(
              2,
              window.devicePixelRatio || 2
            )
          ),

          backgroundColor: '#F1ECDE',

          useCORS: true,

          logging: false
        }
      );

    } finally {

      interactive.forEach(el =>
        el.classList.remove(
          'pd-capture-hide'
        )
      );
    }
  }

  /*
   * Convert canvas to PNG File.
   */
  async function canvasToFile(canvas) {

    return new Promise(
      (resolve, reject) => {

        canvas.toBlob(
          blob => {

            if (!blob) {

              reject(
                new Error(
                  'Could not create the report image.'
                )
              );

              return;
            }

            const file =
              new File(
                [blob],
                `leaf-scout-report-${Date.now()}.png`,
                {
                  type: 'image/png'
                }
              );

            resolve(file);

          },
          'image/png',
          1
        );
      }
    );
  }

  /*
   * Save report as PNG.
   */
  async function saveReportImage() {

    try {

      const reportCanvas =
        await makeReportCanvas();

      const file =
        await canvasToFile(
          reportCanvas
        );

      const url =
        URL.createObjectURL(file);

      const a =
        document.createElement('a');

      a.href = url;

      a.download =
        file.name;

      document.body.appendChild(a);

      a.click();

      a.remove();

      setTimeout(
        () => URL.revokeObjectURL(url),
        1000
      );

    } catch (err) {

      showError(
        err.message ||
        'Could not save the report image.'
      );
    }
  }

  /*
   * Share report image.
   *
   * On supported mobile browsers this uses the
   * native share sheet, allowing WhatsApp to be
   * selected and the PNG attached.
   *
   * On browsers that do not support file sharing,
   * the PNG is downloaded and WhatsApp Web/mobile
   * is opened with a message.
   */
  async function shareReportImage() {

    try {

      const reportCanvas =
        await makeReportCanvas();

      const file =
        await canvasToFile(
          reportCanvas
        );

      /*
       * Preferred method:
       * native sharing with image attachment.
       */
      if (
        navigator.share &&
        (
          !navigator.canShare ||
          navigator.canShare({
            files: [file]
          })
        )
      ) {

        await navigator.share({
          title:
            'Leaf Scout Field Diagnostic Report',

          text:
            'AI-assisted field advisory — ' +
            'please verify treatment with a qualified ' +
            'agriculture adviser.',

          files: [file]
        });

        return;
      }

      /*
       * Fallback for browsers that cannot share files.
       */
      const whatsappUrl =
        'https://wa.me/?text=' +
        encodeURIComponent(
          `Leaf Scout field diagnostic: ` +
          `${localeSafeLabel()}. ` +
          `Please attach the saved report image. ` +
          `Verify treatment with a qualified ` +
          `agriculture adviser.`
        );

      /*
       * Download the generated PNG.
       */
      const blobUrl =
        URL.createObjectURL(file);

      const a =
        document.createElement('a');

      a.href = blobUrl;

      a.download =
        file.name;

      document.body.appendChild(a);

      a.click();

      a.remove();

      setTimeout(
        () => URL.revokeObjectURL(blobUrl),
        1000
      );

      /*
       * Open WhatsApp after downloading.
       */
      window.open(
        whatsappUrl,
        '_blank',
        'noopener'
      );

    } catch (err) {

      /*
       * User cancelling the native share
       * dialog isn't an error.
       */
      if (
        err &&
        err.name === 'AbortError'
      ) {
        return;
      }

      showError(
        err.message ||
        'Could not share the report image.'
      );
    }
  }

  /*
   * Get a safe English diagnosis name
   * for the WhatsApp fallback message.
   */
  function localeSafeLabel() {

    if (!currentDiagnosisData) {
      return 'leaf diagnosis';
    }

    const d =
      currentDiagnosisData.locales &&
      currentDiagnosisData.locales.en;

    return d
      ? d.name
      : (
          currentDiagnosisData.raw_label ||
          'leaf diagnosis'
        );
  }

  /*
   * Start application.
   */
  setIdleUI();

})();