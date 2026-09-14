(() => {
  "use strict";

  const config = window.INVITE_CONFIG || {};
  const adminEmail = String(config.adminEmail || "ceciliaalves.rodrigocosta@gmail.com").toLowerCase();
  const authView = document.querySelector("#auth-view");
  const unauthorizedView = document.querySelector("#unauthorized-view");
  const dashboard = document.querySelector("#admin-dashboard");
  const authFeedback = document.querySelector("#auth-feedback");
  const connectionStatus = document.querySelector("#connection-status");
  const toast = document.querySelector("#admin-toast");

  let auth = null;
  let db = null;
  let currentUser = null;
  let listenersStarted = false;
  let unsubscribers = [];
  let gifts = [];
  let reservations = [];
  let pixContributions = [];
  let listImportItems = [];
  let pixSettingsLoaded = false;
  let toastTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function showOnly(view) {
    authView.hidden = view !== authView;
    unauthorizedView.hidden = view !== unauthorizedView;
    dashboard.hidden = view !== dashboard;
  }

  function setConnection(message, online = false) {
    connectionStatus.textContent = message;
    connectionStatus.classList.toggle("is-online", online);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => (toast.hidden = true), 2600);
  }

  function setFeedback(element, message, type = "") {
    element.textContent = message;
    element.classList.remove("is-success", "is-error");
    if (type) element.classList.add(`is-${type}`);
  }

  function isSafeUrl(value, allowedHosts) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:") return false;
      return allowedHosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
    } catch (_error) {
      return false;
    }
  }

  function isAffiliateUrl(value) {
    return isSafeUrl(value, ["mercadolivre.com", "mercadolivre.com.br", "meli.la"]);
  }

  function isAffiliateListUrl(value) {
    return isAffiliateUrl(value);
  }

  function isImageUrl(value) {
    return isSafeUrl(value, [
      "mlstatic.com",
      "mercadolivre.com",
      "mercadolivre.com.br",
      "firebasestorage.googleapis.com",
      "storage.googleapis.com",
    ]);
  }

  function formatMoney(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "Sem valor informado";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number);
  }

  function formatDate(timestamp) {
    const date = timestamp?.toDate ? timestamp.toDate() : timestamp ? new Date(timestamp) : null;
    if (!date || Number.isNaN(date.valueOf())) return "Agora";
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  }

  function activateTab(tabName) {
    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tab === tabName);
    });
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      const active = panel.dataset.panel === tabName;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function initializeNavigation() {
    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => activateTab(button.dataset.tab));
    });
    document.querySelectorAll("[data-go-tab]").forEach((button) => {
      button.addEventListener("click", () => activateTab(button.dataset.goTab));
    });
  }

  function updateImagePreview() {
    const imageUrl = byId("gift-image-url").value.trim();
    const container = byId("gift-image-preview");
    const image = container.querySelector("img");
    const valid = isImageUrl(imageUrl);
    container.classList.toggle("is-placeholder", !valid);
    image.src = valid ? imageUrl : "assets/monogram-cr.png";
  }

  function resetGiftForm() {
    byId("gift-form").reset();
    byId("gift-id").value = "";
    byId("gift-quantity").value = "1";
    byId("gift-order").value = String(gifts.length);
    byId("gift-active").checked = true;
    byId("gift-in-person").checked = true;
    byId("gift-pix").checked = true;
    byId("gift-form-title").textContent = "Novo presente";
    byId("cancel-gift-edit").hidden = true;
    setFeedback(byId("gift-form-feedback"), "");
    setFeedback(byId("import-feedback"), "Cole o link gerado no Portal de Afiliados.");
    updateImagePreview();
  }

  function editGift(gift) {
    activateTab("gifts");
    byId("gift-id").value = gift.id;
    byId("affiliate-url").value = gift.affiliateUrl || "";
    byId("gift-title").value = gift.title || "";
    byId("gift-image-url").value = gift.imageUrl || "";
    byId("gift-description").value = gift.description || "";
    byId("gift-category").value = gift.category || "";
    byId("gift-price").value = Number(gift.suggestedPrice) > 0 ? gift.suggestedPrice : "";
    byId("gift-quantity").value = Math.max(1, Number(gift.quantity) || 1);
    byId("gift-order").value = Number(gift.order) || 0;
    byId("gift-active").checked = gift.active !== false;
    byId("gift-in-person").checked = gift.allowInPerson !== false;
    byId("gift-pix").checked = gift.allowPix !== false;
    byId("gift-form-title").textContent = "Editar presente";
    byId("cancel-gift-edit").hidden = false;
    setFeedback(byId("gift-form-feedback"), "");
    updateImagePreview();
    byId("gift-editor").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function jsonp(endpoint, params, timeout = 18000) {
    return new Promise((resolve, reject) => {
      const callbackName = `__giftPreview_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      const timer = window.setTimeout(() => cleanup(new Error("A importação demorou mais que o esperado.")), timeout);

      function cleanup(error, payload) {
        window.clearTimeout(timer);
        script.remove();
        delete window[callbackName];
        if (error) reject(error);
        else resolve(payload);
      }

      window[callbackName] = (payload) => cleanup(null, payload);
      script.onerror = () => cleanup(new Error("Não foi possível acessar o importador."));

      const query = new URLSearchParams({ ...params, callback: callbackName });
      script.src = `${endpoint}${endpoint.includes("?") ? "&" : "?"}${query}`;
      document.head.append(script);
    });
  }

  async function importGiftMetadata() {
    const affiliateUrl = byId("affiliate-url").value.trim();
    const button = byId("import-gift");
    const feedback = byId("import-feedback");
    const endpoint = String(config.giftPreviewEndpoint || config.rsvpEndpoint || "").trim();

    if (!isAffiliateUrl(affiliateUrl)) {
      setFeedback(feedback, "Informe um link válido do Mercado Livre.", "error");
      return;
    }
    if (!endpoint) {
      setFeedback(feedback, "O importador ainda não foi configurado.", "error");
      return;
    }

    button.disabled = true;
    button.textContent = "Importando…";
    setFeedback(feedback, "Consultando o produto…");

    try {
      const result = await jsonp(endpoint, { action: "giftPreview", url: affiliateUrl });
      if (!result?.ok) throw new Error(result?.error || "Produto não encontrado.");
      if (result.title) byId("gift-title").value = result.title.slice(0, 160);
      if (result.imageUrl) byId("gift-image-url").value = result.imageUrl.slice(0, 2048);
      updateImagePreview();
      setFeedback(feedback, "Nome e foto importados. Revise antes de salvar.", "success");
    } catch (error) {
      setFeedback(
        feedback,
        `${error.message || "Não foi possível importar."} Você ainda pode preencher nome e foto manualmente.`,
        "error",
      );
    } finally {
      button.disabled = false;
      button.textContent = "Importar nome e foto";
    }
  }

  function importedItemKey(item) {
    return String(
      item.sourceProductId ||
        item.sourceProductUrl ||
        `${item.sourceListUrl || ""}|${item.title || ""}|${item.imageUrl || ""}`,
    )
      .trim()
      .toLowerCase();
  }

  function isImportedItemDuplicate(item) {
    const key = importedItemKey(item);
    return gifts.some((gift) => {
      if (item.sourceProductId && gift.sourceProductId === item.sourceProductId) return true;
      if (item.sourceProductUrl && gift.sourceProductUrl === item.sourceProductUrl) return true;
      return importedItemKey(gift) === key;
    });
  }

  function updateImportSelectionCount() {
    const selected = byId("list-import-items").querySelectorAll('input[type="checkbox"]:checked').length;
    const available = byId("list-import-items").querySelectorAll('input[type="checkbox"]:not(:disabled)').length;
    byId("save-imported-gifts").textContent =
      selected > 0 ? `Adicionar ${selected} ${selected === 1 ? "presente" : "presentes"}` : "Selecione ao menos um presente";
    byId("save-imported-gifts").disabled = selected === 0 || available === 0;
  }

  function renderListImportPreview() {
    const preview = byId("list-import-preview");
    const container = byId("list-import-items");
    container.replaceChildren();

    listImportItems.forEach((item, index) => {
      const duplicate = isImportedItemDuplicate(item);
      const row = makeElement("label", `list-import-item${duplicate ? " is-duplicate" : ""}`);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !duplicate;
      checkbox.disabled = duplicate;
      checkbox.dataset.importIndex = String(index);
      checkbox.addEventListener("change", updateImportSelectionCount);

      const image = document.createElement("img");
      image.src = isImageUrl(item.imageUrl) ? item.imageUrl : "assets/monogram-cr.png";
      image.alt = "";
      image.loading = "lazy";

      const copy = makeElement("span", "list-import-item-copy");
      copy.append(makeElement("b", "", item.title || "Produto sem nome"));
      copy.append(
        makeElement(
          "span",
          "",
          duplicate ? "Já está cadastrado" : item.sourceProductId || "Importado da lista de afiliados",
        ),
      );

      const price = makeElement(
        "span",
        "list-import-item-price",
        formatMoney(item.suggestedPrice) === "Sem valor informado" ? "" : formatMoney(item.suggestedPrice),
      );
      row.append(checkbox, image, copy, price);
      container.append(row);
    });

    const count = listImportItems.length;
    byId("list-import-count").textContent = `${count} ${count === 1 ? "produto encontrado" : "produtos encontrados"}`;
    preview.hidden = count === 0;
    updateImportSelectionCount();
  }

  async function importGiftList() {
    const listUrl = byId("affiliate-list-url").value.trim();
    const endpoint = String(config.giftPreviewEndpoint || config.rsvpEndpoint || "").trim();
    const button = byId("import-gift-list");
    const feedback = byId("list-import-feedback");

    if (!isAffiliateListUrl(listUrl)) {
      setFeedback(feedback, "Informe um link público oficial da lista do Mercado Livre.", "error");
      return;
    }
    if (!endpoint) {
      setFeedback(feedback, "O importador ainda não foi configurado.", "error");
      return;
    }

    button.disabled = true;
    button.textContent = "Lendo a lista…";
    byId("list-import-preview").hidden = true;
    setFeedback(feedback, "Consultando os produtos no Mercado Livre…");

    try {
      const result = await jsonp(endpoint, { action: "giftListPreview", url: listUrl }, 60000);
      if (!result?.ok) throw new Error(result?.error || "Não foi possível ler a lista.");
      const sourceListUrl = isAffiliateListUrl(result.sourceUrl) ? result.sourceUrl : listUrl;
      listImportItems = (Array.isArray(result.items) ? result.items : [])
        .slice(0, 180)
        .map((item) => ({
          title: String(item.title || "").trim().slice(0, 160),
          imageUrl: isImageUrl(item.imageUrl) ? item.imageUrl : "",
          suggestedPrice: Math.max(0, Number(item.suggestedPrice) || 0),
          affiliateUrl: isAffiliateListUrl(item.affiliateUrl) ? item.affiliateUrl : sourceListUrl,
          sourceListUrl,
          sourceProductUrl: isAffiliateUrl(item.sourceProductUrl) ? item.sourceProductUrl : "",
          sourceProductId: String(item.sourceProductId || "").trim().slice(0, 80),
        }))
        .filter((item) => item.title);

      if (!listImportItems.length) throw new Error("A lista não retornou produtos públicos.");
      renderListImportPreview();
      setFeedback(feedback, "Lista carregada. Revise os produtos e confirme a seleção.", "success");
    } catch (error) {
      listImportItems = [];
      setFeedback(
        feedback,
        `${error.message || "Não foi possível ler a lista."} Verifique se ela está marcada como pública e tente novamente.`,
        "error",
      );
    } finally {
      button.disabled = false;
      button.textContent = "Ler lista completa";
    }
  }

  function setAllImportedItems(checked) {
    byId("list-import-items").querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach((checkbox) => {
      checkbox.checked = checked;
    });
    updateImportSelectionCount();
  }

  async function saveImportedGifts() {
    if (!db || !currentUser) return;
    const button = byId("save-imported-gifts");
    const feedback = byId("list-import-feedback");
    const selected = [...byId("list-import-items").querySelectorAll('input[type="checkbox"]:checked')]
      .map((checkbox) => listImportItems[Number(checkbox.dataset.importIndex)])
      .filter(Boolean)
      .filter((item) => !isImportedItemDuplicate(item));

    if (!selected.length) {
      setFeedback(feedback, "Selecione ao menos um produto que ainda não esteja cadastrado.", "error");
      return;
    }

    button.disabled = true;
    button.textContent = "Adicionando…";
    const firstOrder = gifts.reduce((largest, gift) => Math.max(largest, Number(gift.order) || 0), -1) + 1;

    try {
      const batch = db.batch();
      selected.forEach((item, index) => {
        const giftRef = db.collection("gifts").doc();
        batch.set(giftRef, {
          affiliateUrl: item.affiliateUrl,
          title: item.title,
          imageUrl: item.imageUrl,
          description: "",
          category: "Lista de casamento",
          suggestedPrice: item.suggestedPrice,
          quantity: 1,
          claimedCount: 0,
          order: firstOrder + index,
          active: true,
          allowInPerson: true,
          allowPix: true,
          importedFromList: true,
          sourceListUrl: item.sourceListUrl,
          sourceProductUrl: item.sourceProductUrl,
          sourceProductId: item.sourceProductId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
      setFeedback(
        feedback,
        `${selected.length} ${selected.length === 1 ? "presente adicionado" : "presentes adicionados"} com sucesso.`,
        "success",
      );
      showToast("Importação concluída.");
      listImportItems = [];
      byId("list-import-preview").hidden = true;
    } catch (_error) {
      setFeedback(feedback, "Não foi possível adicionar os presentes. Verifique o Firestore e tente novamente.", "error");
      updateImportSelectionCount();
    } finally {
      button.disabled = false;
      if (listImportItems.length) updateImportSelectionCount();
    }
  }

  async function saveGift(event) {
    event.preventDefault();
    if (!db || !currentUser) return;

    const form = byId("gift-form");
    const submit = form.querySelector('button[type="submit"]');
    const feedback = byId("gift-form-feedback");
    const id = byId("gift-id").value;
    const affiliateUrl = byId("affiliate-url").value.trim();
    const imageUrl = byId("gift-image-url").value.trim();
    const title = byId("gift-title").value.trim();

    if (!isAffiliateUrl(affiliateUrl)) {
      setFeedback(feedback, "Informe um link de afiliado válido do Mercado Livre.", "error");
      return;
    }
    if (!title || !isImageUrl(imageUrl)) {
      setFeedback(feedback, "Revise o nome e o endereço da foto.", "error");
      return;
    }

    const existing = gifts.find((gift) => gift.id === id);
    const data = {
      affiliateUrl,
      title: title.slice(0, 160),
      imageUrl,
      description: byId("gift-description").value.trim().slice(0, 500),
      category: byId("gift-category").value.trim().slice(0, 80),
      suggestedPrice: Math.max(0, Number(byId("gift-price").value) || 0),
      quantity: Math.min(99, Math.max(1, Math.round(Number(byId("gift-quantity").value) || 1))),
      claimedCount: Math.max(0, Number(existing?.claimedCount) || 0),
      order: Math.min(9999, Math.max(0, Math.round(Number(byId("gift-order").value) || 0))),
      active: byId("gift-active").checked,
      allowInPerson: byId("gift-in-person").checked,
      allowPix: byId("gift-pix").checked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    submit.disabled = true;
    submit.textContent = "Salvando…";
    setFeedback(feedback, "");
    try {
      if (id) {
        await db.collection("gifts").doc(id).set(data, { merge: true });
      } else {
        await db.collection("gifts").add({
          ...data,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      }
      setFeedback(feedback, "Presente salvo com sucesso.", "success");
      showToast("Presente salvo.");
      window.setTimeout(resetGiftForm, 600);
    } catch (_error) {
      setFeedback(feedback, "Não foi possível salvar. Verifique as permissões do Firestore.", "error");
    } finally {
      submit.disabled = false;
      submit.textContent = "Salvar presente";
    }
  }

  async function toggleGiftVisibility(gift) {
    try {
      await db.collection("gifts").doc(gift.id).update({
        active: gift.active === false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      showToast(gift.active === false ? "Presente publicado." : "Presente ocultado.");
    } catch (_error) {
      showToast("Não foi possível alterar o presente.");
    }
  }

  function renderGiftList() {
    const list = byId("admin-gift-list");
    const empty = byId("admin-gift-empty");
    const sorted = [...gifts].sort((left, right) => (Number(left.order) || 0) - (Number(right.order) || 0));
    list.replaceChildren();
    empty.hidden = sorted.length > 0;
    byId("gift-list-count").textContent = `${sorted.length} ${sorted.length === 1 ? "item" : "itens"}`;

    sorted.forEach((gift) => {
      const item = makeElement("article", "admin-gift-item");
      const image = document.createElement("img");
      image.src = isImageUrl(gift.imageUrl) ? gift.imageUrl : "assets/monogram-cr.png";
      image.alt = "";
      image.loading = "lazy";
      const copy = makeElement("div");
      copy.append(makeElement("h3", "", gift.title || "Presente"));
      const meta = makeElement("div", "admin-gift-meta");
      meta.append(
        makeElement("span", "", gift.category || "Sem categoria"),
        makeElement("span", "", formatMoney(gift.suggestedPrice)),
        makeElement("span", "", `${Number(gift.claimedCount) || 0}/${Number(gift.quantity) || 1} confirmados`),
      );
      const chip = makeElement(
        "span",
        `status-chip${gift.active === false ? " is-hidden" : ""}`,
        gift.active === false ? "Oculto" : "Publicado",
      );
      meta.append(chip);
      copy.append(meta);

      const actions = makeElement("div", "admin-item-actions");
      const editButton = makeElement("button", "mini-button", "Editar");
      editButton.type = "button";
      editButton.addEventListener("click", () => editGift(gift));
      const visibilityButton = makeElement(
        "button",
        `mini-button${gift.active === false ? "" : " is-danger"}`,
        gift.active === false ? "Publicar" : "Ocultar",
      );
      visibilityButton.type = "button";
      visibilityButton.addEventListener("click", () => toggleGiftVisibility(gift));
      actions.append(editButton, visibilityButton);
      item.append(image, copy, actions);
      list.append(item);
    });
  }

  function fillPixForm(pix = {}) {
    byId("pix-enabled").checked = Boolean(pix.enabled);
    byId("pix-key-type").value = pix.keyType || "aleatoria";
    byId("pix-key").value = pix.key || "";
    byId("pix-recipient").value = pix.recipientName || "";
    byId("pix-city").value = pix.city || "";
    byId("pix-bank").value = pix.bankName || "";
    byId("pix-copy-paste").value = pix.copyPaste || "";
  }

  async function savePixSettings(event) {
    event.preventDefault();
    if (!db || !currentUser) return;

    const enabled = byId("pix-enabled").checked;
    const key = byId("pix-key").value.trim();
    const recipientName = byId("pix-recipient").value.trim();
    const feedback = byId("pix-form-feedback");
    const submit = byId("pix-settings-form").querySelector('button[type="submit"]');

    if (enabled && (!key || !recipientName)) {
      setFeedback(feedback, "Informe a chave Pix e o nome do titular.", "error");
      return;
    }

    const pix = {
      enabled,
      keyType: byId("pix-key-type").value,
      key: key.slice(0, 160),
      recipientName: recipientName.slice(0, 120),
      city: byId("pix-city").value.trim().slice(0, 80),
      bankName: byId("pix-bank").value.trim().slice(0, 100),
      copyPaste: byId("pix-copy-paste").value.trim().slice(0, 1000),
    };

    submit.disabled = true;
    submit.textContent = "Salvando…";
    try {
      await db.collection("settings").doc("public").set(
        {
          pix,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      setFeedback(feedback, "Configuração Pix salva.", "success");
      showToast("Configuração Pix atualizada.");
    } catch (_error) {
      setFeedback(feedback, "Não foi possível salvar. Verifique as permissões do Firestore.", "error");
    } finally {
      submit.disabled = false;
      submit.textContent = "Salvar configuração Pix";
    }
  }

  function statusLabel(status) {
    return {
      pending: "Aguardando",
      confirmed: "Confirmado",
      cancelled: "Recusado",
    }[status] || status;
  }

  async function confirmRecord(collectionName, record) {
    try {
      await db.runTransaction(async (transaction) => {
        const recordRef = db.collection(collectionName).doc(record.id);
        const recordSnapshot = await transaction.get(recordRef);
        if (!recordSnapshot.exists || recordSnapshot.data().status !== "pending") return;

        if (record.giftId) {
          const giftRef = db.collection("gifts").doc(record.giftId);
          const giftSnapshot = await transaction.get(giftRef);
          if (giftSnapshot.exists) {
            const gift = giftSnapshot.data();
            const quantity = Math.max(1, Number(gift.quantity) || 1);
            const claimedCount = Math.max(0, Number(gift.claimedCount) || 0);
            if (claimedCount >= quantity) throw new Error("Este presente já atingiu a quantidade cadastrada.");
            transaction.update(giftRef, {
              claimedCount: claimedCount + 1,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
          }
        }

        transaction.update(recordRef, {
          status: "confirmed",
          reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
          reviewedBy: currentUser.email,
        });
      });
      showToast("Confirmação registrada.");
    } catch (error) {
      showToast(error.message || "Não foi possível confirmar.");
    }
  }

  async function cancelRecord(collectionName, record) {
    try {
      await db.collection(collectionName).doc(record.id).update({
        status: "cancelled",
        reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
        reviewedBy: currentUser.email,
      });
      showToast("Registro marcado como recusado.");
    } catch (_error) {
      showToast("Não foi possível alterar o registro.");
    }
  }

  async function reopenRecord(collectionName, record) {
    try {
      await db.runTransaction(async (transaction) => {
        const recordRef = db.collection(collectionName).doc(record.id);
        const recordSnapshot = await transaction.get(recordRef);
        if (!recordSnapshot.exists || recordSnapshot.data().status === "pending") return;

        if (recordSnapshot.data().status === "confirmed" && record.giftId) {
          const giftRef = db.collection("gifts").doc(record.giftId);
          const giftSnapshot = await transaction.get(giftRef);
          if (giftSnapshot.exists) {
            const claimedCount = Math.max(0, Number(giftSnapshot.data().claimedCount) || 0);
            transaction.update(giftRef, {
              claimedCount: Math.max(0, claimedCount - 1),
              updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
          }
        }

        transaction.update(recordRef, {
          status: "pending",
          reviewedAt: firebase.firestore.FieldValue.delete(),
          reviewedBy: firebase.firestore.FieldValue.delete(),
        });
      });
      showToast("Registro reaberto para conferência.");
    } catch (_error) {
      showToast("Não foi possível reabrir o registro.");
    }
  }

  function createConfirmationItem(record, collectionName, isPix) {
    const item = makeElement("article", "confirmation-item");
    const top = makeElement("div", "confirmation-topline");
    top.append(makeElement("h3", "", record.giftTitle || (isPix ? "Presente livre" : "Presente")));
    top.append(
      makeElement(
        "span",
        `status-chip is-${record.status || "pending"}`,
        statusLabel(record.status || "pending"),
      ),
    );
    item.append(top, makeElement("p", "guest-name", record.guestName || "Convidado"));

    if (isPix) item.append(makeElement("p", "confirmation-detail", `Valor informado: ${formatMoney(record.amount)}`));
    else {
      const method = record.method === "mercado_livre" ? "Compra no Mercado Livre" : "Compra pessoal";
      item.append(makeElement("p", "confirmation-detail", method));
      if (record.contact) item.append(makeElement("p", "confirmation-detail", record.contact));
    }
    if (record.message) item.append(makeElement("p", "confirmation-detail", `“${record.message}”`));
    item.append(makeElement("p", "confirmation-date", formatDate(record.createdAt)));

    const actions = makeElement("div", "confirmation-actions");
    if ((record.status || "pending") === "pending") {
      const confirmButton = makeElement("button", "mini-button is-confirm", "Confirmar");
      confirmButton.type = "button";
      confirmButton.addEventListener("click", () => confirmRecord(collectionName, record));
      const cancelButton = makeElement("button", "mini-button is-danger", "Recusar");
      cancelButton.type = "button";
      cancelButton.addEventListener("click", () => cancelRecord(collectionName, record));
      actions.append(confirmButton, cancelButton);
    } else {
      const reopenButton = makeElement("button", "mini-button", "Reabrir");
      reopenButton.type = "button";
      reopenButton.addEventListener("click", () => reopenRecord(collectionName, record));
      actions.append(reopenButton);
    }
    item.append(actions);
    return item;
  }

  function renderConfirmations() {
    const reservationList = byId("reservation-list");
    reservationList.replaceChildren();
    reservations.forEach((record) => reservationList.append(createConfirmationItem(record, "reservations", false)));
    byId("reservation-empty").hidden = reservations.length > 0;

    const pixList = byId("pix-confirmation-list");
    pixList.replaceChildren();
    pixContributions.forEach((record) => pixList.append(createConfirmationItem(record, "pixContributions", true)));
    byId("pix-confirmation-empty").hidden = pixContributions.length > 0;
    updateStats();
  }

  function updateStats() {
    const pending =
      reservations.filter((item) => item.status === "pending").length +
      pixContributions.filter((item) => item.status === "pending").length;
    byId("stat-gifts").textContent = gifts.filter((gift) => gift.active !== false).length;
    byId("stat-pending").textContent = pending;
    byId("stat-pix").textContent = pixContributions.filter((item) => item.status === "confirmed").length;
    byId("pending-nav-count").textContent = pending;
    byId("pending-nav-count").hidden = pending === 0;
  }

  function startDataListeners() {
    if (listenersStarted) return;
    listenersStarted = true;
    setConnection("Sincronizando…");

    unsubscribers.push(db.collection("gifts").onSnapshot(
      (snapshot) => {
        gifts = snapshot.docs.map((documentSnapshot) => ({ id: documentSnapshot.id, ...documentSnapshot.data() }));
        renderGiftList();
        updateStats();
        setConnection("Dados sincronizados", true);
      },
      () => setConnection("Ative o Firestore"),
    ));

    unsubscribers.push(db.collection("settings")
      .doc("public")
      .onSnapshot(
        (snapshot) => {
          if (!pixSettingsLoaded) {
            fillPixForm(snapshot.exists ? snapshot.data().pix || {} : {});
            pixSettingsLoaded = true;
          }
        },
        () => setConnection("Ative o Firestore"),
      ));

    unsubscribers.push(db.collection("reservations")
      .orderBy("createdAt", "desc")
      .onSnapshot(
        (snapshot) => {
          reservations = snapshot.docs.map((documentSnapshot) => ({ id: documentSnapshot.id, ...documentSnapshot.data() }));
          renderConfirmations();
        },
        () => setConnection("Revise as regras do Firestore"),
      ));

    unsubscribers.push(db.collection("pixContributions")
      .orderBy("createdAt", "desc")
      .onSnapshot(
        (snapshot) => {
          pixContributions = snapshot.docs.map((documentSnapshot) => ({ id: documentSnapshot.id, ...documentSnapshot.data() }));
          renderConfirmations();
        },
        () => setConnection("Revise as regras do Firestore"),
      ));
  }

  function stopDataListeners() {
    unsubscribers.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (_error) {
        // A tela de login pode continuar mesmo que um listener já tenha terminado.
      }
    });
    unsubscribers = [];
    listenersStarted = false;
    pixSettingsLoaded = false;
  }

  async function signIn() {
    if (!auth) return;
    authFeedback.textContent = "Abrindo acesso Google…";
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await auth.signInWithPopup(provider);
    } catch (error) {
      if (["auth/popup-blocked", "auth/cancelled-popup-request"].includes(error.code)) {
        await auth.signInWithRedirect(provider);
        return;
      }
      authFeedback.textContent = error.code === "auth/popup-closed-by-user" ? "Login cancelado." : "Não foi possível entrar com Google.";
    }
  }

  async function switchAccount() {
    await auth?.signOut();
    showOnly(authView);
    signIn();
  }

  function initializeForms() {
    byId("gift-form").addEventListener("submit", saveGift);
    byId("pix-settings-form").addEventListener("submit", savePixSettings);
    byId("import-gift").addEventListener("click", importGiftMetadata);
    byId("import-gift-list").addEventListener("click", importGiftList);
    byId("select-all-imports").addEventListener("click", () => setAllImportedItems(true));
    byId("clear-all-imports").addEventListener("click", () => setAllImportedItems(false));
    byId("save-imported-gifts").addEventListener("click", saveImportedGifts);
    byId("gift-image-url").addEventListener("input", updateImagePreview);
    byId("new-gift").addEventListener("click", () => {
      resetGiftForm();
      byId("gift-editor").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    byId("cancel-gift-edit").addEventListener("click", resetGiftForm);
    resetGiftForm();
  }

  function initializeFirebase() {
    try {
      if (!window.firebase || !firebase.apps?.length) throw new Error("Firebase não inicializado");
      auth = firebase.auth();
      db = firebase.firestore();
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
      auth.onAuthStateChanged((user) => {
        currentUser = user;
        if (!user) {
          stopDataListeners();
          showOnly(authView);
          return;
        }
        if (String(user.email || "").toLowerCase() !== adminEmail || user.emailVerified === false) {
          stopDataListeners();
          byId("unauthorized-email").textContent = user.email || "Conta sem e-mail verificado";
          showOnly(unauthorizedView);
          return;
        }
        byId("admin-user-email").textContent = user.email;
        showOnly(dashboard);
        startDataListeners();
      });
    } catch (_error) {
      showOnly(authView);
      authFeedback.textContent = "O Firebase ainda não foi ativado para o painel.";
      byId("google-sign-in").disabled = true;
    }
  }

  byId("google-sign-in").addEventListener("click", signIn);
  byId("switch-account").addEventListener("click", switchAccount);
  byId("sign-out").addEventListener("click", () => auth?.signOut());
  initializeNavigation();
  initializeForms();
  initializeFirebase();
})();
