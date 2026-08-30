const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const scanline = document.getElementById("scanline");

const vfEmpty = document.getElementById("vf-empty");
const vfPreview = document.getElementById("vf-preview");
const vfLoading = document.getElementById("vf-loading");
const scanAnotherBtn = document.getElementById("scanAnother");

const resultBox = document.getElementById("result");
const resultKicker = document.getElementById("result-kicker");
const resultLabel = document.getElementById("result-label");
const resultConfidence = document.getElementById("result-confidence");
const meterFill = document.getElementById("meter-fill");
const breakdownList = document.getElementById("breakdown-list");
const errorBox = document.getElementById("errorBox");

const HEALTHY_WORDS = ["healthy", "normal", "none"];

function isHealthyLabel(label) {
  const l = label.toLowerCase();
  return HEALTHY_WORDS.some((w) => l.includes(w));
}

function resetError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function showError(message) {
  errorBox.hidden = false;
  errorBox.textContent = message;
  vfLoading.hidden = true;
  scanline.classList.remove("active");
  vfEmpty.hidden = false;
}

function openFileDialog() {
  fileInput.click();
}

dropzone.addEventListener("click", openFileDialog);
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    openFileDialog();
  }
});

["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-over");
  })
);
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
  })
);
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

scanAnotherBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  resetToEmpty();
});

function resetToEmpty() {
  resetError();
  resultBox.hidden = true;
  vfPreview.hidden = true;
  vfPreview.src = "";
  vfEmpty.hidden = false;
  scanAnotherBtn.hidden = true;
  fileInput.value = "";
}

function handleFile(file) {
  resetError();
  resultBox.hidden = true;

  // Show local preview immediately
  const reader = new FileReader();
  reader.onload = (e) => {
    vfPreview.src = e.target.result;
    vfPreview.hidden = false;
    vfEmpty.hidden = true;
  };
  reader.readAsDataURL(file);

  vfLoading.hidden = false;
  scanline.classList.add("active");

  const formData = new FormData();
  formData.append("image", file);

  fetch("/predict", { method: "POST", body: formData })
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      return data;
    })
    .then(showResult)
    .catch((err) => showError(err.message))
    .finally(() => {
      vfLoading.hidden = true;
      scanline.classList.remove("active");
      scanAnotherBtn.hidden = false;
    });
}

function showResult(data) {
  const healthy = isHealthyLabel(data.top_label);

  resultKicker.textContent = healthy ? "RESULT" : "DIAGNOSIS";
  resultLabel.textContent = data.top_label.replace(/_/g, " ");
  resultLabel.classList.toggle("is-healthy", healthy);
  resultLabel.classList.toggle("is-disease", !healthy);

  resultConfidence.textContent = `${data.top_confidence.toFixed(1)}%`;
  meterFill.style.width = `${data.top_confidence}%`;
  meterFill.classList.toggle("is-healthy", healthy);

  breakdownList.innerHTML = "";
  data.breakdown.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="bd-name">${item.label.replace(/_/g, " ")}</span><span class="bd-pct">${item.confidence.toFixed(1)}%</span>`;
    breakdownList.appendChild(li);
  });

  resultBox.hidden = false;
}
