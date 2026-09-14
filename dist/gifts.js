(() => {
  "use strict";

  const giftGrid = document.querySelector("#gift-grid");
  const giftLoading = document.querySelector("#gift-loading");
  const giftEmpty = document.querySelector("#gift-empty");
  const pixGiftCard = document.querySelector("#pix-gift-card");
  const affiliateDisclosure = document.querySelector("#affiliate-disclosure");
  const openGeneralPixButton = document.querySelector("#open-general-pix");

  const reservationDialog = document.querySelector("#reservation-dialog");
  const reservationForm = document.querySelector("#reservation-form");
  const reservationIntro = document.querySelector("#reservation-intro");
  const reservationFeedback = document.querySelector("#reservation-feedback");

  const pixDialog = document.querySelector("#pix-dialog");
  const pixForm = document.querySelector("#pix-confirmation-form");
  const pixDescription = document.querySelector("#pix-gift-description");
  const publicPixKey = document.querySelector("#public-pix-key");
  const publicPixOwner = document.querySelector("#public-pix-owner");
  const copyPixKeyButton = document.querySelector("#copy-pix-key");
  const copyPixCodeButton = document.querySelector("#copy-pix-code");
  const pixFeedback = document.querySelector("#pix-feedback");

  let db = null;
  let gifts = [];
  let pixSettings = null;

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function isSafeHttpUrl(value, allowedHosts) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:") return false;
      return allowedHosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
    } catch (_error) {
      return false;
    }
  }

  function isAffiliateUrl(value) {
    return isSafeHttpUrl(value, ["mercadolivre.com", "mercadolivre.com.br", "meli.la"]);
  }

  function isImageUrl(value) {
    return isSafeHttpUrl(value, [
      "mlstatic.com",
      "mercadolivre.com",
      "mercadolivre.com.br",
      "firebasestorage.googleapis.com",
      "storage.googleapis.com",
    ]);
  }

  function formatMoney(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number);
  }

  function getSavedGuestName() {
    try {
      const response = JSON.parse(window.localStorage.getItem("convite-cecilia-rodrigo-rsvp") || "null");
      return String(response?.nome || "").slice(0, 120);
    } catch (_error) {
      return "";
    }
  }

  function showDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function makeButton(label, className, onClick) {
    const button = makeElement("button", className, label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  function openReservation(gift, method) {
    const title = String(gift.title || "Presente");
    document.querySelector("#reservation-gift-id").value = gift.id;
    document.querySelector("#reservation-gift-title").value = title;
    document.querySelector("#reservation-method").value = method;
    document.querySelector("#reservation-name").value ||= getSavedGuestName();
    reservationFeedback.textContent = "";
    reservationFeedback.className = "dialog-feedback";
    reservationIntro.textContent =
      method === "mercado_livre"
        ? `Conte-nos que você comprou “${title}” pelo Mercado Livre.`
        : `Reserve “${title}” para comprar e entregar pessoalmente.`;
    showDialog(reservationDialog);
  }

  function openPix(gift = null) {
    if (!pixSettings?.enabled || !pixSettings.key) return;

    const giftTitle = gift ? String(gift.title || "Presente") : "Presente livre";
    document.querySelector("#pix-gift-id").value = gift?.id || "";
    document.querySelector("#pix-gift-title").value = giftTitle;
    document.querySelector("#pix-guest-name").value ||= getSavedGuestName();
    document.querySelector("#pix-amount").value =
      gift && Number(gift.suggestedPrice) > 0 ? Number(gift.suggestedPrice).toFixed(2) : "";
    pixDescription.textContent = gift
      ? `Você escolheu “${giftTitle}”. Envie o valor desejado e depois avise os noivos.`
      : "Escolha o valor, envie diretamente aos noivos e depois registre o presente.";
    publicPixKey.textContent = pixSettings.key;

    const ownerBits = [pixSettings.recipientName, pixSettings.bankName, pixSettings.city].filter(Boolean);
    publicPixOwner.textContent = ownerBits.join(" · ");
    copyPixCodeButton.hidden = !pixSettings.copyPaste;
    pixFeedback.textContent = "";
    pixFeedback.className = "dialog-feedback";
    showDialog(pixDialog);
  }

  function createGiftCard(gift) {
    const card = makeElement("article", "gift-card reveal is-revealed");
    const quantity = Math.max(1, Number(gift.quantity) || 1);
    const claimed = Math.max(0, Number(gift.claimedCount) || 0);
    const remaining = Math.max(0, quantity - claimed);
    const unavailable = remaining === 0;

    const media = makeElement("div", "gift-card-media");
    if (isImageUrl(gift.imageUrl)) {
      const image = document.createElement("img");
      image.src = gift.imageUrl;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener("error", () => media.classList.add("has-image-error"), { once: true });
      media.append(image);
    }
    const fallback = document.createElement("img");
    fallback.className = "gift-image-fallback";
    fallback.src = "assets/monogram-cr.png";
    fallback.alt = "";
    media.append(fallback);

    if (unavailable) media.append(makeElement("span", "gift-status-badge", "Já presenteado"));
    else if (quantity > 1) media.append(makeElement("span", "gift-status-badge is-available", `${remaining} disponíveis`));

    const body = makeElement("div", "gift-card-body");
    if (gift.category) body.append(makeElement("p", "gift-card-kicker", gift.category));
    body.append(makeElement("h3", "", gift.title || "Presente"));
    if (gift.description) body.append(makeElement("p", "gift-card-description", gift.description));
    const price = formatMoney(gift.suggestedPrice);
    if (price) body.append(makeElement("p", "gift-card-price", `Valor de referência: ${price}`));

    const actions = makeElement("div", "gift-card-actions");
    if (!unavailable && isAffiliateUrl(gift.affiliateUrl)) {
      const buyLabel = gift.importedFromList ? "Ver na lista do Mercado Livre" : "Comprar no Mercado Livre";
      const buyLink = makeElement("a", "gold-button gift-buy-link", buyLabel);
      buyLink.href = gift.affiliateUrl;
      buyLink.target = "_blank";
      buyLink.rel = "noopener noreferrer sponsored";
      actions.append(buyLink);
      actions.append(
        makeButton("Já comprou? Avise os noivos", "text-button gift-text-action", () =>
          openReservation(gift, "mercado_livre"),
        ),
      );
    }

    if (!unavailable && gift.allowInPerson !== false) {
      actions.append(
        makeButton("Vou comprar pessoalmente", "outline-button gift-secondary-action", () =>
          openReservation(gift, "pessoalmente"),
        ),
      );
    }

    if (!unavailable && gift.allowPix !== false && pixSettings?.enabled && pixSettings.key) {
      actions.append(makeButton("Dar este presente por Pix", "text-button gift-text-action", () => openPix(gift)));
    }

    if (unavailable) body.append(makeElement("p", "gift-unavailable-copy", "Este presente já foi escolhido com carinho."));
    else body.append(actions);

    card.append(media, body);
    return card;
  }

  function renderGifts() {
    if (!giftGrid) return;
    giftGrid.replaceChildren();

    const sorted = [...gifts].sort((left, right) => {
      const orderDifference = (Number(left.order) || 0) - (Number(right.order) || 0);
      return orderDifference || String(left.title || "").localeCompare(String(right.title || ""), "pt-BR");
    });
    sorted.forEach((gift) => giftGrid.append(createGiftCard(gift)));

    giftLoading.hidden = true;
    giftEmpty.hidden = sorted.length > 0;
    pixGiftCard.hidden = !(pixSettings?.enabled && pixSettings.key);
    affiliateDisclosure.hidden = !sorted.some((gift) => isAffiliateUrl(gift.affiliateUrl));
  }

  async function submitReservation(event) {
    event.preventDefault();
    if (!db) return;

    const submit = reservationForm.querySelector('button[type="submit"]');
    const guestName = document.querySelector("#reservation-name").value.trim();
    if (!guestName) return;

    submit.disabled = true;
    submit.textContent = "Enviando…";
    reservationFeedback.textContent = "";

    try {
      await db.collection("reservations").add({
        giftId: document.querySelector("#reservation-gift-id").value,
        giftTitle: document.querySelector("#reservation-gift-title").value.slice(0, 160),
        method: document.querySelector("#reservation-method").value,
        guestName: guestName.slice(0, 120),
        contact: document.querySelector("#reservation-contact").value.trim().slice(0, 160),
        message: document.querySelector("#reservation-message").value.trim().slice(0, 500),
        status: "pending",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      reservationFeedback.textContent = "Aviso enviado! Os noivos farão a confirmação.";
      reservationFeedback.className = "dialog-feedback is-success";
      window.setTimeout(() => closeDialog(reservationDialog), 1800);
    } catch (_error) {
      reservationFeedback.textContent = "Não foi possível enviar agora. Tente novamente.";
      reservationFeedback.className = "dialog-feedback is-error";
    } finally {
      submit.disabled = false;
      submit.textContent = "Enviar aviso";
    }
  }

  async function submitPixConfirmation(event) {
    event.preventDefault();
    if (!db) return;

    const submit = pixForm.querySelector('button[type="submit"]');
    const guestName = document.querySelector("#pix-guest-name").value.trim();
    const amount = Number(document.querySelector("#pix-amount").value);
    if (!guestName || !Number.isFinite(amount) || amount <= 0) return;

    submit.disabled = true;
    submit.textContent = "Enviando…";
    pixFeedback.textContent = "";

    try {
      await db.collection("pixContributions").add({
        giftId: document.querySelector("#pix-gift-id").value,
        giftTitle: document.querySelector("#pix-gift-title").value.slice(0, 160),
        guestName: guestName.slice(0, 120),
        amount: Math.round(amount * 100) / 100,
        message: document.querySelector("#pix-message").value.trim().slice(0, 500),
        status: "pending",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      pixFeedback.textContent = "Aviso recebido! Os noivos vão conferir o Pix.";
      pixFeedback.className = "dialog-feedback is-success";
      window.setTimeout(() => closeDialog(pixDialog), 1800);
    } catch (_error) {
      pixFeedback.textContent = "Não foi possível registrar agora. Tente novamente.";
      pixFeedback.className = "dialog-feedback is-error";
    } finally {
      submit.disabled = false;
      submit.textContent = "Já enviei o Pix";
    }
  }

  async function copyText(value, button) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      const original = button.textContent;
      button.textContent = "Copiado!";
      window.setTimeout(() => (button.textContent = original), 1500);
    } catch (_error) {
      window.prompt("Copie o conteúdo abaixo:", value);
    }
  }

  function initializeDialogs() {
    document.querySelectorAll("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => closeDialog(button.closest("dialog")));
    });
    [reservationDialog, pixDialog].forEach((dialog) => {
      dialog?.addEventListener("click", (event) => {
        if (event.target === dialog) closeDialog(dialog);
      });
    });
    reservationForm?.addEventListener("submit", submitReservation);
    pixForm?.addEventListener("submit", submitPixConfirmation);
    openGeneralPixButton?.addEventListener("click", () => openPix());
    copyPixKeyButton?.addEventListener("click", () => copyText(pixSettings?.key, copyPixKeyButton));
    copyPixCodeButton?.addEventListener("click", () => copyText(pixSettings?.copyPaste, copyPixCodeButton));
  }

  function initializeFirestore() {
    try {
      if (!window.firebase || !firebase.apps?.length) throw new Error("Firebase não inicializado");
      db = firebase.firestore();

      db.collection("gifts")
        .where("active", "==", true)
        .onSnapshot(
          (snapshot) => {
            gifts = snapshot.docs.map((documentSnapshot) => ({ id: documentSnapshot.id, ...documentSnapshot.data() }));
            renderGifts();
          },
          () => renderGifts(),
        );

      db.collection("settings")
        .doc("public")
        .onSnapshot(
          (snapshot) => {
            pixSettings = snapshot.exists ? snapshot.data().pix || null : null;
            renderGifts();
          },
          () => renderGifts(),
        );
    } catch (_error) {
      giftLoading.hidden = true;
      giftEmpty.hidden = false;
      pixGiftCard.hidden = true;
    }
  }

  initializeDialogs();
  initializeFirestore();
})();
