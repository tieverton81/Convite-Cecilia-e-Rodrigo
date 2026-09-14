const SPREADSHEET_ID = "104nN6o5rE7loagA_VFKa8yM9zPUAEU_Td_JLoZlGGcc";
const SHEET_NAME = "Confirmações";

function doPost(event) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAME);
      sheet.appendRow([
        "Recebido em",
        "Nome",
        "Presença",
        "Acompanhantes",
        "Restrições alimentares",
        "Mensagem",
      ]);
      sheet.setFrozenRows(1);
    }

    const values = event && event.parameter ? event.parameter : {};
    sheet.appendRow([
      new Date(),
      clean(values.nome),
      clean(values.presenca),
      clean(values.acompanhantes),
      clean(values.restricoes),
      clean(values.mensagem),
    ]);

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(event) {
  const parameters = event && event.parameter ? event.parameter : {};

  if (parameters.action === "giftListPreview") {
    let payload;
    try {
      payload = getGiftListPreview(parameters.url);
    } catch (error) {
      payload = { ok: false, error: String(error.message || error) };
    }
    return jsonOrJsonpResponse(payload, parameters.callback);
  }

  if (parameters.action === "giftPreview") {
    let payload;
    try {
      payload = getGiftPreview(parameters.url);
    } catch (error) {
      payload = { ok: false, error: String(error.message || error) };
    }
    return jsonOrJsonpResponse(payload, parameters.callback);
  }

  return jsonOrJsonpResponse(
    { ok: true, service: "RSVP e presentes — Rodrigo e Cecília" },
    parameters.callback,
  );
}

function getGiftPreview(value) {
  const affiliateUrl = String(value || "").trim();
  if (!isAffiliateLink(affiliateUrl)) {
    throw new Error("Informe um link de afiliado válido do Mercado Livre.");
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = `gift-${digest(affiliateUrl)}`;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const page = fetchMercadoLivrePage(affiliateUrl);
  const html = page.html;
  const title = cleanProductTitle(
    extractMeta(html, "og:title") || extractMeta(html, "twitter:title") || extractHtmlTitle(html),
  );
  const imageUrl = normalizeImageUrl(
    decodeHtml(
      extractMeta(html, "og:image") || extractMeta(html, "twitter:image") || extractJsonLdImage(html),
    ),
  );

  if (!title || !imageUrl) {
    throw new Error("Não encontrei nome e foto nesse produto. Preencha os campos manualmente.");
  }

  const payload = {
    ok: true,
    title: title.slice(0, 160),
    imageUrl: imageUrl.slice(0, 2048),
  };
  cache.put(cacheKey, JSON.stringify(payload), 21600);
  return payload;
}

function fetchMercadoLivrePage(initialUrl) {
  let currentUrl = String(initialUrl || "").trim();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (!isAllowedMercadoLivreUrl(currentUrl)) {
      throw new Error("O redirecionamento saiu dos domínios oficiais do Mercado Livre.");
    }

    const response = UrlFetchApp.fetch(currentUrl, {
      followRedirects: false,
      muteHttpExceptions: true,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      },
    });

    const status = response.getResponseCode();
    if (status >= 300 && status < 400) {
      const headers = response.getAllHeaders();
      const location = headers.Location || headers.location;
      if (!location) throw new Error("O Mercado Livre não informou o destino deste link.");
      currentUrl = resolveUrl(currentUrl, Array.isArray(location) ? location[0] : location);
      continue;
    }

    if (status < 200 || status >= 400) {
      throw new Error("O Mercado Livre não permitiu consultar esta página agora.");
    }

    return {
      url: currentUrl,
      html: response.getContentText(),
    };
  }

  throw new Error("O link realizou redirecionamentos demais.");
}

function getGiftListPreview(value) {
  const affiliateListUrl = String(value || "").trim();
  if (!isAffiliateListLink(affiliateListUrl)) {
    throw new Error("Informe um link público válido da Lista de Afiliados.");
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = `gift-list-${digest(affiliateListUrl)}`;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const page = fetchMercadoLivrePage(affiliateListUrl);
  const items = extractListProducts(page.html, page.url, affiliateListUrl);
  if (!items.length) {
    throw new Error(
      "Não encontrei produtos nessa lista. Confira se ela está pública e se contém itens.",
    );
  }

  const payload = {
    ok: true,
    sourceUrl: affiliateListUrl,
    listTitle: cleanProductTitle(
      extractMeta(page.html, "og:title") || extractHtmlTitle(page.html) || "Lista do Mercado Livre",
    ).slice(0, 160),
    count: items.length,
    items,
  };
  const serialized = JSON.stringify(payload);
  if (serialized.length < 90000) cache.put(cacheKey, serialized, 1800);
  return payload;
}

function isAffiliateListLink(url) {
  return isAllowedMercadoLivreUrl(String(url || "").trim());
}

function extractListProducts(html, pageUrl, affiliateListUrl) {
  const accumulator = { keys: [], items: {} };
  collectProductsFromJsonScripts(html, accumulator, pageUrl);
  collectProductsFromAnchors(html, accumulator, pageUrl);

  if (!accumulator.keys.length) {
    collectProductsFromRawMarkup(html, accumulator, pageUrl);
  }

  let products = accumulator.keys.map((key) => accumulator.items[key]).slice(0, 180);
  products = enrichProductsFromPublicApi(products);

  return products
    .filter((product) => product.title)
    .slice(0, 180)
    .map((product) => ({
      title: cleanCandidateTitle(product.title).slice(0, 160),
      imageUrl: normalizeProductImage(product.imageUrl).slice(0, 2048),
      suggestedPrice: normalizePrice(product.suggestedPrice),
      affiliateUrl: affiliateListUrl,
      sourceProductUrl: String(product.sourceProductUrl || "").slice(0, 2048),
      sourceProductId: String(product.sourceProductId || "").slice(0, 80),
    }));
}

function collectProductsFromJsonScripts(html, accumulator, pageUrl) {
  const scripts = String(html || "").match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];

  scripts.forEach((scriptTag) => {
    const openingTag = (scriptTag.match(/^<script\b[^>]*>/i) || [""])[0];
    const type = String(extractAttribute(openingTag, "type") || "").toLowerCase();
    const id = String(extractAttribute(openingTag, "id") || "").toLowerCase();
    const shouldParse =
      type.indexOf("json") !== -1 ||
      ["__next_data__", "__preloaded_state__", "initial-state"].indexOf(id) !== -1;
    if (!shouldParse) return;

    const content = scriptTag
      .replace(/^<script\b[^>]*>/i, "")
      .replace(/<\/script>$/i, "")
      .replace(/^\s*<!--|-->\s*$/g, "")
      .trim();
    if (!content || content.length > 5000000) return;

    try {
      collectProductsFromNode(JSON.parse(content), accumulator, pageUrl, 0);
    } catch (_error) {
      try {
        collectProductsFromNode(JSON.parse(decodeHtml(content)), accumulator, pageUrl, 0);
      } catch (_ignored) {
        // Algumas versões da página usam JavaScript em vez de JSON puro.
      }
    }
  });
}

function collectProductsFromNode(value, accumulator, pageUrl, depth) {
  if (depth > 14 || accumulator.keys.length >= 180 || value == null) return;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectProductsFromNode(entry, accumulator, pageUrl, depth + 1));
    return;
  }
  if (typeof value !== "object") return;

  addProductCandidate(accumulator, productCandidateFromObject(value, pageUrl));
  Object.keys(value).forEach((key) => {
    const child = value[key];
    if (child && (typeof child === "object" || Array.isArray(child))) {
      collectProductsFromNode(child, accumulator, pageUrl, depth + 1);
    }
  });
}

function productCandidateFromObject(value, pageUrl) {
  const rawUrl = firstText([
    value.permalink,
    value.product_url,
    value.item_url,
    value.target_url,
    value.url,
    value.href,
    value.link,
  ]);
  const sourceProductUrl = normalizeOfficialUrl(pageUrl, rawUrl);
  const sourceProductId = normalizeProductId(
    firstText([value.item_id, value.product_id, value.catalog_product_id, value.id]) ||
      extractProductId(sourceProductUrl),
  );

  if (!sourceProductId && !isMercadoLivreProductUrl(sourceProductUrl)) return null;
  return {
    title: firstText([value.title, value.name, value.item_title, value.product_title]),
    imageUrl: firstImage([value.image, value.images, value.picture, value.pictures, value.thumbnail]),
    suggestedPrice: firstPrice([value.price, value.current_price, value.sale_price, value.offers]),
    sourceProductUrl,
    sourceProductId,
  };
}

function collectProductsFromAnchors(html, accumulator, pageUrl) {
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(String(html || ""))) && accumulator.keys.length < 180) {
    const openingTag = `<a ${match[1]}>`;
    const sourceProductUrl = normalizeOfficialUrl(pageUrl, extractAttribute(openingTag, "href"));
    if (!isMercadoLivreProductUrl(sourceProductUrl)) continue;

    const imageTag = (match[2].match(/<img\b[^>]*>/i) || [""])[0];
    const title =
      extractAttribute(openingTag, "aria-label") ||
      extractAttribute(openingTag, "title") ||
      extractAttribute(imageTag, "alt") ||
      stripTags(match[2]);
    const imageUrl = firstImage([
      extractAttribute(imageTag, "data-src"),
      extractAttribute(imageTag, "data-lazy-src"),
      extractAttribute(imageTag, "src"),
    ]);

    addProductCandidate(accumulator, {
      title,
      imageUrl,
      suggestedPrice: 0,
      sourceProductUrl,
      sourceProductId: extractProductId(sourceProductUrl),
    });
  }
}

function collectProductsFromRawMarkup(html, accumulator, pageUrl) {
  const decoded = decodeHtml(String(html || ""))
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/");
  const urlPattern = /https:\/\/[^"'\s<>]+/gi;
  let urlMatch;
  while ((urlMatch = urlPattern.exec(decoded)) && accumulator.keys.length < 180) {
    const sourceProductUrl = normalizeOfficialUrl(pageUrl, urlMatch[0]);
    if (!isMercadoLivreProductUrl(sourceProductUrl)) continue;
    addProductCandidate(accumulator, {
      title: "",
      imageUrl: "",
      suggestedPrice: 0,
      sourceProductUrl,
      sourceProductId: extractProductId(sourceProductUrl),
    });
  }

  if (accumulator.keys.length) return;
  const ids = decoded.match(/\bMLB-?\d{6,}\b/gi) || [];
  ids.slice(0, 180).forEach((id) => {
    addProductCandidate(accumulator, {
      title: "",
      imageUrl: "",
      suggestedPrice: 0,
      sourceProductUrl: "",
      sourceProductId: normalizeProductId(id),
    });
  });
}

function addProductCandidate(accumulator, candidate) {
  if (!candidate) return;
  const key =
    normalizeProductId(candidate.sourceProductId) ||
    String(candidate.sourceProductUrl || "").replace(/[?#].*$/, "");
  if (!key) return;

  if (!accumulator.items[key]) {
    accumulator.keys.push(key);
    accumulator.items[key] = {
      title: "",
      imageUrl: "",
      suggestedPrice: 0,
      sourceProductUrl: "",
      sourceProductId: normalizeProductId(candidate.sourceProductId),
    };
  }

  const stored = accumulator.items[key];
  if (!stored.title && candidate.title) stored.title = cleanCandidateTitle(candidate.title);
  if (!stored.imageUrl && candidate.imageUrl) stored.imageUrl = normalizeProductImage(candidate.imageUrl);
  if (!stored.suggestedPrice && candidate.suggestedPrice) {
    stored.suggestedPrice = normalizePrice(candidate.suggestedPrice);
  }
  if (!stored.sourceProductUrl && candidate.sourceProductUrl) {
    stored.sourceProductUrl = candidate.sourceProductUrl;
  }
  if (!stored.sourceProductId && candidate.sourceProductId) {
    stored.sourceProductId = normalizeProductId(candidate.sourceProductId);
  }
}

function enrichProductsFromPublicApi(products) {
  const requestIndexes = [];
  const requests = [];
  products.forEach((product, index) => {
    if (requests.length >= 100) return;
    if (!/^MLB\d{6,}$/i.test(product.sourceProductId || "")) return;
    requestIndexes.push(index);
    requests.push({
      url: `https://api.mercadolibre.com/items/${product.sourceProductId}`,
      muteHttpExceptions: true,
      headers: { Accept: "application/json" },
    });
  });
  if (!requests.length) return products;

  try {
    const responses = UrlFetchApp.fetchAll(requests);
    responses.forEach((response, responseIndex) => {
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) return;
      let item;
      try {
        item = JSON.parse(response.getContentText());
      } catch (_error) {
        return;
      }
      const product = products[requestIndexes[responseIndex]];
      if (!product.title) product.title = cleanCandidateTitle(item.title || "");
      if (!product.imageUrl) {
        product.imageUrl = firstImage([item.pictures, item.secure_thumbnail, item.thumbnail]);
      }
      if (!product.suggestedPrice) product.suggestedPrice = normalizePrice(item.price);
      if (!product.sourceProductUrl) {
        product.sourceProductUrl = normalizeOfficialUrl("https://www.mercadolivre.com.br/", item.permalink);
      }
    });
  } catch (_error) {
    // A prévia da própria lista ainda pode ser usada se a API estiver indisponível.
  }
  return products;
}

function firstText(values) {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const nested = firstText([value.url, value.href, value.value, value.text]);
      if (nested) return nested;
    }
  }
  return "";
}

function firstImage(values) {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value) continue;
    if (typeof value === "string") {
      const imageUrl = normalizeProductImage(value);
      if (imageUrl) return imageUrl;
      continue;
    }
    if (Array.isArray(value)) {
      const nestedArrayImage = firstImage(value);
      if (nestedArrayImage) return nestedArrayImage;
      continue;
    }
    if (typeof value === "object") {
      const nestedImage = firstImage([
        value.secure_url,
        value.url,
        value.src,
        value.secure_thumbnail,
        value.thumbnail,
      ]);
      if (nestedImage) return nestedImage;
    }
  }
  return "";
}

function firstPrice(values) {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (typeof value === "number" && isFinite(value) && value > 0) return value;
    if (typeof value === "string" && /^\d+(?:[.,]\d+)?$/.test(value.trim())) {
      const parsed = Number(value.replace(",", "."));
      if (isFinite(parsed) && parsed > 0) return parsed;
    }
    if (value && typeof value === "object") {
      const nested = firstPrice([value.value, value.amount, value.price, value.lowPrice]);
      if (nested) return nested;
    }
  }
  return 0;
}

function normalizePrice(value) {
  const number = Number(value);
  if (!isFinite(number) || number <= 0 || number > 1000000) return 0;
  return Math.round(number * 100) / 100;
}

function normalizeProductId(value) {
  const match = String(value || "")
    .toUpperCase()
    .match(/\b(MLBU?)-?(\d{6,})\b/);
  return match ? match[1] + match[2] : "";
}

function extractProductId(value) {
  return normalizeProductId(String(value || "").replace(/[_/]/g, "-"));
}

function normalizeOfficialUrl(baseUrl, value) {
  let url = decodeHtml(String(value || ""))
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/")
    .trim();
  if (!url || /^javascript:/i.test(url)) return "";
  if (url.indexOf("//") === 0) url = "https:" + url;
  else if (!/^https:\/\//i.test(url)) {
    try {
      url = resolveUrl(baseUrl, url);
    } catch (_error) {
      return "";
    }
  }
  return isAllowedMercadoLivreUrl(url) ? url : "";
}

function isMercadoLivreProductUrl(url) {
  return (
    isAllowedMercadoLivreUrl(url) &&
    /(?:\/p\/MLBU?\d+|\/up\/MLBU?\d+|\/MLB-?\d{6,}|[?&](?:item_id|wid)=MLB-?\d+)/i.test(
      url,
    )
  );
}

function normalizeProductImage(value) {
  const url = normalizeImageUrl(
    decodeHtml(String(value || ""))
      .replace(/\\u002f/gi, "/")
      .replace(/\\\//g, "/"),
  );
  return /^https:\/\/(?:[A-Za-z0-9-]+\.)*(?:mlstatic\.com|mercadolivre\.com(?:\.br)?)(?:[/:?#]|$)/i.test(
    url,
  )
    ? url
    : "";
}

function cleanCandidateTitle(value) {
  return decodeHtml(stripTags(String(value || "")))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]*>/g, " ");
}

function isAffiliateLink(url) {
  return /^https:\/\/(?:www\.)?mercadolivre\.com(?:\.br)?\/sec\/[A-Za-z0-9_-]+(?:[/?#]|$)/i.test(
    url,
  );
}

function isAllowedMercadoLivreUrl(url) {
  return /^https:\/\/(?:[A-Za-z0-9-]+\.)*(?:mercadolivre\.com(?:\.br)?|mercadolibre\.com|meli\.la)(?:[/:?#]|$)/i.test(
    url,
  );
}

function resolveUrl(baseUrl, location) {
  const destination = String(location || "").trim();
  if (/^https:\/\//i.test(destination)) return destination;
  if (destination.indexOf("//") === 0) return "https:" + destination;

  const originMatch = String(baseUrl).match(/^(https:\/\/[^/]+)/i);
  if (!originMatch) throw new Error("Destino inválido retornado pelo Mercado Livre.");
  if (destination.charAt(0) === "/") return originMatch[1] + destination;

  const directory = String(baseUrl).replace(/[?#].*$/, "").replace(/\/[^/]*$/, "/");
  return directory + destination;
}

function extractMeta(html, propertyName) {
  const tags = String(html || "").match(/<meta\b[^>]*>/gi) || [];
  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index];
    const property = extractAttribute(tag, "property") || extractAttribute(tag, "name");
    if (String(property).toLowerCase() === String(propertyName).toLowerCase()) {
      return extractAttribute(tag, "content");
    }
  }
  return "";
}

function extractAttribute(tag, attributeName) {
  const escapedName = String(attributeName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const quoted = String(tag).match(
    new RegExp(`${escapedName}\\s*=\\s*([\"'])([\\s\\S]*?)\\1`, "i"),
  );
  if (quoted) return quoted[2];
  const plain = String(tag).match(new RegExp(`${escapedName}\\s*=\\s*([^\\s>]+)`, "i"));
  return plain ? plain[1] : "";
}

function extractHtmlTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1] : "";
}

function extractJsonLdImage(html) {
  const match = String(html || "").match(/"image"\s*:\s*(?:\[\s*)?"(https:[^"\\]+)"/i);
  return match ? match[1] : "";
}

function cleanProductTitle(value) {
  return decodeHtml(value)
    .replace(/\s*[|–-]\s*Mercado\s*Livre.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeImageUrl(value) {
  const url = String(value || "").trim();
  if (/^http:\/\//i.test(url)) return "https://" + url.slice(7);
  if (url.indexOf("//") === 0) return "https:" + url;
  return url;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function digest(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8,
  );
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "");
}

function clean(value) {
  const text = String(value || "").trim().slice(0, 1000);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function jsonOrJsonpResponse(payload, callback) {
  const callbackName = String(callback || "").trim();
  if (/^[A-Za-z_$][0-9A-Za-z_$]{0,119}$/.test(callbackName)) {
    return ContentService.createTextOutput(`${callbackName}(${JSON.stringify(payload)});`).setMimeType(
      ContentService.MimeType.JAVASCRIPT,
    );
  }
  return jsonResponse(payload);
}
