(() => {
  "use strict";

  const config = window.INVITE_CONFIG || {};
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const envelopeScreen = document.querySelector("#envelope-screen");
  const envelopeTrigger = document.querySelector("#envelope-trigger");
  const invitation = document.querySelector("#invitation");
  const soundToggle = document.querySelector("#sound-toggle");
  const soundLabel = soundToggle?.querySelector(".sound-label");
  const weddingAudio = document.querySelector("#wedding-audio");
  const mapsLink = document.querySelector("#maps-link");
  const venueNote = document.querySelector("#venue-pending");
  const rsvpForm = document.querySelector("#rsvp-form");
  const rsvpSuccess = document.querySelector("#rsvp-success");
  const successMessage = document.querySelector("#success-message");
  const previewNotice = document.querySelector("#preview-notice");
  const submitButton = document.querySelector("#rsvp-submit");
  const editResponse = document.querySelector("#edit-response");
  const companionsField = document.querySelector("#companions-field");
  const companionsInput = document.querySelector("#companions");
  const guestName = document.querySelector("#guest-name");

  const storageKey = "convite-cecilia-rodrigo-rsvp";
  let musicEnabled = false;

  function configureLocation() {
    if (!mapsLink || !config.mapsUrl) return;

    mapsLink.href = config.mapsUrl;
    mapsLink.target = "_blank";
    mapsLink.rel = "noopener noreferrer";
    mapsLink.classList.remove("is-disabled");
    mapsLink.removeAttribute("aria-disabled");
    mapsLink.removeAttribute("tabindex");

    if (venueNote) {
      venueNote.textContent = "Abra a rota no Google Maps.";
    }
  }

  function configureRsvpMode() {
    const hasEndpoint = Boolean(String(config.rsvpEndpoint || "").trim());
    if (previewNotice) previewNotice.hidden = hasEndpoint;
    if (submitButton) submitButton.textContent = hasEndpoint ? "Confirmar presença" : "Testar confirmação";
  }

  function revealInvitation() {
    invitation?.classList.add("is-visible");
    invitation?.setAttribute("aria-hidden", "false");
    document.body.classList.remove("is-locked");
  }

  function finishEnvelope() {
    envelopeScreen?.classList.add("is-complete");
    window.setTimeout(() => {
      if (envelopeScreen) envelopeScreen.hidden = true;
    }, reducedMotion ? 20 : 720);
  }

  function openEnvelope() {
    if (!envelopeScreen || envelopeScreen.classList.contains("is-opening")) return;

    envelopeTrigger?.setAttribute("disabled", "");
    envelopeScreen.classList.add("is-opening");
    startWeddingMusic();

    window.setTimeout(() => {
      envelopeScreen.classList.add("is-revealing");
      revealInvitation();
    }, reducedMotion ? 20 : 620);

    window.setTimeout(finishEnvelope, reducedMotion ? 50 : 1280);
  }

  function addRevealObserver() {
    const elements = document.querySelectorAll(".reveal");
    if (reducedMotion || !("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-revealed"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -5%" },
    );

    elements.forEach((element) => observer.observe(element));
  }

  function updateSoundButton() {
    if (!soundToggle || !soundLabel) return;
    soundToggle.classList.toggle("is-muted", !musicEnabled);
    soundToggle.setAttribute("aria-label", musicEnabled ? "Pausar trilha instrumental" : "Ativar trilha instrumental");
    soundLabel.textContent = musicEnabled ? "Som" : "Sem som";
  }

  function startWeddingMusic() {
    if (!config.enableMusic || !weddingAudio) return;

    weddingAudio.volume = 0.46;
    if (soundToggle) soundToggle.hidden = false;
    weddingAudio
      .play()
      .then(() => {
        musicEnabled = true;
        updateSoundButton();
      })
      .catch(() => {
        musicEnabled = false;
        updateSoundButton();
      });
  }

  async function toggleMusic() {
    if (!weddingAudio) return;

    if (weddingAudio.paused) {
      try {
        await weddingAudio.play();
        musicEnabled = true;
      } catch (_error) {
        musicEnabled = false;
      }
    } else {
      weddingAudio.pause();
      musicEnabled = false;
    }
    updateSoundButton();
  }

  function setError(field, message) {
    const error = document.querySelector(`[data-error-for="${field}"]`);
    if (error) error.textContent = message;

    const control = document.querySelector(`#${field}`);
    if (control) control.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function validateForm() {
    let valid = true;
    const attendance = rsvpForm?.querySelector('input[name="presenca"]:checked');

    setError("guest-name", "");
    setError("presenca", "");

    if (!guestName?.value.trim()) {
      setError("guest-name", "Informe seu nome completo.");
      valid = false;
    }

    if (!attendance) {
      setError("presenca", "Selecione uma opção.");
      valid = false;
    }

    return valid;
  }

  function updateCompanions() {
    const attendance = rsvpForm?.querySelector('input[name="presenca"]:checked')?.value;
    const attending = attendance !== "Não";
    if (companionsField) companionsField.hidden = !attending;
    if (companionsInput) {
      companionsInput.disabled = !attending;
      if (!attending) companionsInput.value = "";
    }
  }

  function collectFormData() {
    const data = Object.fromEntries(new FormData(rsvpForm).entries());
    return {
      nome: String(data.nome || "").trim(),
      presenca: String(data.presenca || ""),
      acompanhantes: String(data.acompanhantes || "").trim(),
      restricoes: String(data.restricoes || "").trim(),
      mensagem: String(data.mensagem || "").trim(),
      enviadoEm: new Date().toISOString(),
    };
  }

  function savePreviewResponse(data) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (_error) {
      // A confirmação de prévia continua funcionando mesmo sem armazenamento local.
    }
  }

  function showSuccess(message, heading = "Resposta preenchida") {
    const successHeading = rsvpSuccess?.querySelector("h3");
    if (successHeading) successHeading.textContent = heading;
    if (successMessage) successMessage.textContent = message;
    if (rsvpForm) rsvpForm.hidden = true;
    if (rsvpSuccess) {
      rsvpSuccess.hidden = false;
      rsvpSuccess.focus({ preventScroll: true });
    }
  }

  async function submitRsvp(event) {
    event.preventDefault();
    if (!rsvpForm || !validateForm()) return;

    const data = collectFormData();
    const endpoint = String(config.rsvpEndpoint || "").trim();
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Enviando…";
    }

    try {
      if (endpoint) {
        await fetch(endpoint, {
          method: "POST",
          mode: "no-cors",
          body: new URLSearchParams(data),
        });
        showSuccess("Recebemos sua resposta. Obrigado por confirmar!", "Presença confirmada");
      } else {
        savePreviewResponse(data);
        showSuccess("Nesta prévia, a resposta foi salva apenas neste aparelho.");
      }
    } catch (_error) {
      if (successMessage) successMessage.textContent = "Não foi possível enviar agora. Tente novamente em instantes.";
      if (previewNotice) {
        previewNotice.hidden = false;
        previewNotice.textContent = "Não foi possível enviar agora. Verifique sua conexão e tente novamente.";
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = endpoint ? "Confirmar presença" : "Testar confirmação";
      }
    }
  }

  function editRsvp() {
    if (rsvpSuccess) rsvpSuccess.hidden = true;
    if (rsvpForm) rsvpForm.hidden = false;
    guestName?.focus({ preventScroll: true });
  }

  envelopeTrigger?.addEventListener("click", openEnvelope);
  soundToggle?.addEventListener("click", toggleMusic);
  weddingAudio?.addEventListener("play", () => {
    musicEnabled = true;
    updateSoundButton();
  });
  weddingAudio?.addEventListener("pause", () => {
    musicEnabled = false;
    updateSoundButton();
  });
  rsvpForm?.addEventListener("submit", submitRsvp);
  rsvpForm?.querySelectorAll('input[name="presenca"]').forEach((radio) => {
    radio.addEventListener("change", updateCompanions);
  });
  guestName?.addEventListener("input", () => setError("guest-name", ""));
  editResponse?.addEventListener("click", editRsvp);

  configureLocation();
  configureRsvpMode();
  updateCompanions();
  addRevealObserver();
})();
