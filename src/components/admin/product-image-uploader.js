"use client";

import globalStyles from "@/app/storefront.module.css";
import { getCoverCropRect } from "@/src/admin/product-image-crop.js";
import { cx } from "@/src/lib/classnames";
import { useEffect, useMemo, useRef, useState } from "react";

const outputAspectRatio = 4 / 3;
const maxProductImages = 12;
const maxVariations = 24;
const outputWidth = 1200;
const outputHeight = Math.round(outputWidth / outputAspectRatio);

function createId(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${suffix}`;
}

function normalizeVariation(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function createDraft(file, cardId) {
  return {
    cardId,
    file,
    id: createId(file.name),
    objectUrl: URL.createObjectURL(file),
    positionX: 50,
    positionY: 50,
    zoom: 1
  };
}

function createExistingImage(url, cardIndex, imageIndex) {
  return {
    id: `existing-${cardIndex}-${imageIndex}-${url}`,
    kind: "existing",
    previewUrl: url,
    url
  };
}

function createInitialCards({
  existingImageUrls = [],
  initialCards,
  variationImages = [],
  variationStock = [],
  variations = []
}) {
  const sourceVariations =
    Array.isArray(initialCards) && initialCards.length > 0
      ? initialCards.map((card) => String(card?.variation ?? ""))
      : variations.length > 0
        ? variations
        : ["Padrão"];
  const stockByVariation = new Map(
    variationStock.map((entry) => [normalizeVariation(entry?.variation), entry?.quantity])
  );
  const imagesByVariation = new Map(
    variationImages.map((group) => [
      normalizeVariation(group?.variation),
      Array.isArray(group?.imageUrls) ? group.imageUrls : []
    ])
  );
  const assignedUrls = new Set();
  const cards = sourceVariations.slice(0, maxVariations).map((variation, cardIndex) => {
    const initialCard = Array.isArray(initialCards) ? initialCards[cardIndex] : null;
    const explicitImages = initialCard
      ? (initialCard.imageUrls ?? [])
      : imagesByVariation.get(normalizeVariation(variation));
    const fallbackImages =
      explicitImages == null && existingImageUrls[cardIndex] ? [existingImageUrls[cardIndex]] : [];
    const imageUrls = (explicitImages ?? fallbackImages).filter(
      (url) => typeof url === "string" && url.trim()
    );

    for (const url of imageUrls) {
      assignedUrls.add(url);
    }

    const savedQuantity = initialCard
      ? initialCard.quantity
      : stockByVariation.get(normalizeVariation(variation));

    return {
      id: `initial-card-${cardIndex}`,
      images: imageUrls.map((url, imageIndex) => createExistingImage(url, cardIndex, imageIndex)),
      quantity:
        Number.isSafeInteger(savedQuantity) && savedQuantity >= 0
          ? String(savedQuantity)
          : String(savedQuantity ?? ""),
      variation: String(variation ?? "")
    };
  });

  const unlinkedImages = existingImageUrls.filter((url) => !assignedUrls.has(url));

  if (cards.length > 0 && unlinkedImages.length > 0) {
    cards[0].images.push(
      ...unlinkedImages.map((url, imageIndex) =>
        createExistingImage(url, 0, cards[0].images.length + imageIndex)
      )
    );
  }

  return cards;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
    image.src = src;
  });
}

async function cropDraftToFile(draft, index) {
  const image = await loadImage(draft.objectUrl);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas do navegador indisponível para recortar a imagem.");
  }

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const { drawHeight, drawWidth, offsetX, offsetY } = getCoverCropRect({
    outputHeight,
    outputWidth,
    positionX: draft.positionX,
    positionY: draft.positionY,
    sourceHeight,
    sourceWidth,
    zoom: draft.zoom
  });

  canvas.width = outputWidth;
  canvas.height = outputHeight;
  context.fillStyle = "#050505";
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    0,
    0,
    sourceWidth,
    sourceHeight,
    offsetX,
    offsetY,
    drawWidth,
    drawHeight
  );

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));

  if (!blob) {
    throw new Error("Não foi possível gerar a imagem recortada.");
  }

  return new File([blob], `produto-card-${String(index + 1).padStart(2, "0")}.webp`, {
    type: "image/webp"
  });
}

export function ProductImageUploader({
  existingImageUrls = [],
  initialCards,
  variationImages = [],
  variationStock = [],
  variations = []
}) {
  const fileInputRef = useRef(null);
  const croppedInputRef = useRef(null);
  const objectUrlsRef = useRef(new Set());
  const cardListRef = useRef(null);
  const draggingCardIdRef = useRef(null);
  const uploadCardIdRef = useRef(null);
  const initialKey = useMemo(
    () =>
      JSON.stringify({
        existingImageUrls,
        initialCards,
        variationImages,
        variationStock,
        variations
      }),
    [existingImageUrls, initialCards, variationImages, variationStock, variations]
  );
  const [cards, setCards] = useState(() =>
    createInitialCards({
      existingImageUrls,
      initialCards,
      variationImages,
      variationStock,
      variations
    })
  );
  const [draftQueue, setDraftQueue] = useState([]);
  const [activeDraft, setActiveDraft] = useState(null);
  const [draggingCardId, setDraggingCardId] = useState(null);
  const [feedback, setFeedback] = useState("");

  const serializedCards = useMemo(() => {
    let uploadIndex = 0;

    return JSON.stringify(
      cards.map((card) => ({
        imageTokens: card.images.map((image) =>
          image.kind === "new" ? `new:${uploadIndex++}` : image.url
        ),
        quantity: card.quantity,
        variation: card.variation
      }))
    );
  }, [cards]);

  function revokeObjectUrl(url) {
    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(url);
  }

  useEffect(() => {
    draggingCardIdRef.current = null;
    setDraggingCardId(null);
    setCards((current) => {
      for (const card of current) {
        for (const image of card.images) {
          if (image.kind === "new") revokeObjectUrl(image.previewUrl);
        }
      }

      return createInitialCards({
        existingImageUrls,
        initialCards,
        variationImages,
        variationStock,
        variations
      });
    });
    setDraftQueue((drafts) => {
      for (const draft of drafts) revokeObjectUrl(draft.objectUrl);
      return [];
    });
    setActiveDraft((draft) => {
      if (draft) revokeObjectUrl(draft.objectUrl);
      return null;
    });
    setFeedback("");
  }, [initialKey]);

  useEffect(() => {
    if (activeDraft || draftQueue.length === 0) return;
    const [nextDraft, ...rest] = draftQueue;
    setActiveDraft(nextDraft);
    setDraftQueue(rest);
  }, [activeDraft, draftQueue]);

  useEffect(() => {
    if (!croppedInputRef.current || typeof DataTransfer === "undefined") return;
    const transfer = new DataTransfer();

    for (const card of cards) {
      for (const image of card.images) {
        if (image.kind === "new") transfer.items.add(image.file);
      }
    }

    croppedInputRef.current.files = transfer.files;
  }, [cards]);

  useEffect(
    () => () => {
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    },
    []
  );

  function addVariation() {
    if (cards.length >= maxVariations) {
      setFeedback(`O produto pode ter no máximo ${maxVariations} variações.`);
      return;
    }

    setCards((current) => [
      ...current,
      { id: createId("card"), images: [], quantity: "", variation: "" }
    ]);
  }

  function updateCard(cardId, field, value) {
    setCards((current) =>
      current.map((card) => (card.id === cardId ? { ...card, [field]: value } : card))
    );
  }

  function removeCard(card) {
    if (cards.length === 1) return;

    for (const image of card.images) {
      if (image.kind === "new") revokeObjectUrl(image.previewUrl);
    }

    setCards((current) => current.filter((candidate) => candidate.id !== card.id));
  }

  function moveCard(index, direction) {
    setCards((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function startCardDrag(event, card) {
    if (event.button !== 0) return;
    draggingCardIdRef.current = card.id;
    setDraggingCardId(card.id);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Navegadores antigos ainda podem usar os controles Subir/Descer.
    }
  }

  function handleCardDragMove(event) {
    if (!draggingCardIdRef.current || !cardListRef.current) return;
    const cardElements = Array.from(cardListRef.current.children);
    let nearestIndex = -1;
    let nearestDistance = Infinity;

    cardElements.forEach((element, index) => {
      const rect = element.getBoundingClientRect();
      const distance = Math.hypot(
        event.clientX - (rect.left + rect.width / 2),
        event.clientY - (rect.top + rect.height / 2)
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    setCards((current) => {
      const fromIndex = current.findIndex((card) => card.id === draggingCardIdRef.current);
      if (fromIndex < 0 || nearestIndex < 0 || fromIndex === nearestIndex) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(nearestIndex, 0, moved);
      return next;
    });
  }

  function endCardDrag(event) {
    if (!draggingCardIdRef.current) return;
    draggingCardIdRef.current = null;
    setDraggingCardId(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // O ponteiro pode já ter sido liberado.
    }
  }

  function openPicker(cardId) {
    uploadCardIdRef.current = cardId;
    fileInputRef.current?.click();
  }

  function handleFilesChange(event) {
    const selectedFiles = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith("image/")
    );
    const imageCount = cards.reduce((total, card) => total + card.images.length, 0);
    const pendingCount = draftQueue.length + (activeDraft ? 1 : 0);
    const availableSlots = Math.max(0, maxProductImages - imageCount - pendingCount);
    const files = selectedFiles.slice(0, availableSlots);

    if (!uploadCardIdRef.current || selectedFiles.length === 0) {
      setFeedback("Selecione imagens JPG, PNG, WEBP ou GIF.");
      return;
    }

    if (availableSlots === 0) {
      setFeedback(`O produto pode ter no máximo ${maxProductImages} imagens.`);
      event.target.value = "";
      return;
    }

    setFeedback(
      selectedFiles.length > files.length
        ? `Foram adicionadas ${files.length} imagens. O limite é ${maxProductImages}.`
        : ""
    );
    const drafts = files.map((file) => createDraft(file, uploadCardIdRef.current));
    for (const draft of drafts) objectUrlsRef.current.add(draft.objectUrl);
    setDraftQueue((queue) => [...queue, ...drafts]);
    event.target.value = "";
  }

  function updateActiveDraft(field, value) {
    setActiveDraft((draft) => (draft ? { ...draft, [field]: Number(value) } : draft));
  }

  function closeActiveDraft() {
    if (activeDraft) revokeObjectUrl(activeDraft.objectUrl);
    setActiveDraft(null);
  }

  async function addCroppedImage() {
    if (!activeDraft) return;

    try {
      setFeedback("Gerando enquadramento da imagem...");
      const newImageCount = cards
        .flatMap((card) => card.images)
        .filter((image) => image.kind === "new").length;
      const file = await cropDraftToFile(activeDraft, newImageCount);
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      setCards((current) =>
        current.map((card) =>
          card.id === activeDraft.cardId
            ? {
                ...card,
                images: [
                  ...card.images,
                  {
                    file,
                    id: createId(`new-${file.name}`),
                    kind: "new",
                    previewUrl
                  }
                ]
              }
            : card
        )
      );
      closeActiveDraft();
      setFeedback("");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível recortar a imagem.");
    }
  }

  function removeImage(cardId, image) {
    if (image.kind === "new") revokeObjectUrl(image.previewUrl);
    setCards((current) =>
      current.map((card) =>
        card.id === cardId
          ? {
              ...card,
              images: card.images.filter((candidate) => candidate.id !== image.id)
            }
          : card
      )
    );
  }

  function moveImage(cardId, imageIndex, direction) {
    setCards((current) =>
      current.map((card) => {
        if (card.id !== cardId) return card;
        const target = imageIndex + direction;
        if (target < 0 || target >= card.images.length) return card;
        const images = [...card.images];
        [images[imageIndex], images[target]] = [images[target], images[imageIndex]];
        return { ...card, images };
      })
    );
  }

  const activeCard = activeDraft ? cards.find((card) => card.id === activeDraft.cardId) : null;

  return (
    <div className={cx(globalStyles, "admin-marketplace-uploader span-all")}>
      <input name="variationCards" readOnly type="hidden" value={serializedCards} />
      <input
        accept="image/jpeg,image/png,image/webp,image/gif"
        aria-hidden="true"
        className={cx(globalStyles, "visually-hidden-field")}
        hidden
        multiple
        onChange={handleFilesChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />
      <input
        accept="image/webp"
        aria-hidden="true"
        className={cx(globalStyles, "visually-hidden-field")}
        hidden
        multiple
        name="imageFiles"
        ref={croppedInputRef}
        tabIndex={-1}
        type="file"
      />

      <div className={cx(globalStyles, "admin-variation-cards-heading")}>
        <div>
          <span>Variações, estoque e fotos</span>
          <strong>Organize tudo no mesmo card.</strong>
          <small>
            Ao mover uma variação, o estoque e todas as fotos vinculadas acompanham a nova posição.
          </small>
        </div>
        <button
          className={cx(globalStyles, "button button-secondary")}
          onClick={addVariation}
          type="button"
        >
          Adicionar variação
        </button>
      </div>

      {activeDraft ? (
        <div className={cx(globalStyles, "admin-image-cropper")}>
          <div>
            <p className={cx(globalStyles, "form-helper-text")}>
              Enquadrando foto de <strong>{activeCard?.variation || "nova variação"}</strong>
            </p>
            <div
              aria-label="Área de enquadramento 4:3"
              className={cx(globalStyles, "admin-image-crop-stage")}
            >
              <img
                alt=""
                src={activeDraft.objectUrl}
                style={{
                  objectPosition: `${activeDraft.positionX}% ${activeDraft.positionY}%`,
                  transform: `scale(${activeDraft.zoom})`
                }}
              />
            </div>
          </div>
          <div className={cx(globalStyles, "admin-image-crop-controls")}>
            <label>
              Zoom
              <input
                max="2.4"
                min="1"
                onChange={(event) => updateActiveDraft("zoom", event.target.value)}
                step="0.05"
                type="range"
                value={activeDraft.zoom}
              />
            </label>
            <label>
              Horizontal
              <input
                max="100"
                min="0"
                onChange={(event) => updateActiveDraft("positionX", event.target.value)}
                type="range"
                value={activeDraft.positionX}
              />
            </label>
            <label>
              Vertical
              <input
                max="100"
                min="0"
                onChange={(event) => updateActiveDraft("positionY", event.target.value)}
                type="range"
                value={activeDraft.positionY}
              />
            </label>
            <div className={cx(globalStyles, "admin-image-crop-actions")}>
              <button
                className={cx(globalStyles, "button button-primary")}
                onClick={addCroppedImage}
                type="button"
              >
                Adicionar ao card
              </button>
              <button
                className={cx(globalStyles, "button button-secondary")}
                onClick={closeActiveDraft}
                type="button"
              >
                Pular imagem
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={cx(globalStyles, "admin-variation-card-list")} ref={cardListRef}>
        {cards.map((card, cardIndex) => (
          <section
            className={cx(
              globalStyles,
              `admin-variation-card ${draggingCardId === card.id ? "is-dragging" : ""}`
            )}
            key={card.id}
          >
            <header className={cx(globalStyles, "admin-variation-card-header")}>
              <button
                aria-label={`Arrastar variação ${cardIndex + 1} para reordenar`}
                className={cx(globalStyles, "admin-variation-card-handle")}
                onPointerCancel={endCardDrag}
                onPointerDown={(event) => startCardDrag(event, card)}
                onPointerMove={handleCardDragMove}
                onPointerUp={endCardDrag}
                type="button"
              >
                Arrastar variação {cardIndex + 1}
              </button>
              <div className={cx(globalStyles, "admin-variation-card-order")}>
                <button
                  aria-label={`Mover variação ${cardIndex + 1} para trás`}
                  disabled={cardIndex === 0}
                  onClick={() => moveCard(cardIndex, -1)}
                  type="button"
                >
                  Subir
                </button>
                <button
                  aria-label={`Mover variação ${cardIndex + 1} para frente`}
                  disabled={cardIndex === cards.length - 1}
                  onClick={() => moveCard(cardIndex, 1)}
                  type="button"
                >
                  Descer
                </button>
                <button
                  aria-label={`Remover variação ${cardIndex + 1}`}
                  disabled={cards.length === 1}
                  onClick={() => removeCard(card)}
                  type="button"
                >
                  Remover
                </button>
              </div>
            </header>

            <div className={cx(globalStyles, "admin-variation-card-fields")}>
              <label>
                <span>Nome da variação</span>
                <input
                  aria-label={`Nome da variação ${cardIndex + 1}`}
                  autoComplete="off"
                  onChange={(event) => updateCard(card.id, "variation", event.target.value)}
                  placeholder="Ex.: Preto"
                  required
                  value={card.variation}
                />
              </label>
              <label>
                <span>Estoque disponível</span>
                <input
                  aria-label={`Estoque da variação ${cardIndex + 1}`}
                  inputMode="numeric"
                  min="0"
                  onChange={(event) => updateCard(card.id, "quantity", event.target.value)}
                  placeholder="Sob consulta"
                  step="1"
                  type="number"
                  value={card.quantity}
                />
              </label>
              <button
                className={cx(
                  globalStyles,
                  "button button-secondary admin-variation-card-add-images"
                )}
                onClick={() => openPicker(card.id)}
                type="button"
              >
                Adicionar fotos
              </button>
            </div>

            {card.images.length > 0 ? (
              <div
                aria-label={`Fotos da variação ${cardIndex + 1}`}
                className={cx(globalStyles, "admin-variation-card-images")}
              >
                {card.images.map((image, imageIndex) => (
                  <figure className={cx(globalStyles, "admin-variation-card-image")} key={image.id}>
                    <div className={cx(globalStyles, "admin-upload-preview-media")}>
                      <span className={cx(globalStyles, "admin-upload-preview-index")}>
                        {imageIndex + 1}
                      </span>
                      <img alt="" draggable={false} src={image.previewUrl} />
                    </div>
                    <figcaption>
                      <span className={cx(globalStyles, "admin-upload-preview-tag")}>
                        {imageIndex === 0 ? "Capa da variação" : "Foto adicional"}
                      </span>
                      <div className={cx(globalStyles, "admin-variation-card-image-actions")}>
                        <button
                          aria-label={`Mover foto ${imageIndex + 1} da variação ${cardIndex + 1} para trás`}
                          disabled={imageIndex === 0}
                          onClick={() => moveImage(card.id, imageIndex, -1)}
                          type="button"
                        >
                          Anterior
                        </button>
                        <button
                          aria-label={`Mover foto ${imageIndex + 1} da variação ${cardIndex + 1} para frente`}
                          disabled={imageIndex === card.images.length - 1}
                          onClick={() => moveImage(card.id, imageIndex, 1)}
                          type="button"
                        >
                          Próxima
                        </button>
                        <button
                          aria-label={`Remover foto ${imageIndex + 1} da variação ${cardIndex + 1}`}
                          onClick={() => removeImage(card.id, image)}
                          type="button"
                        >
                          Remover
                        </button>
                      </div>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className={cx(globalStyles, "admin-variation-card-empty")}>
                Nenhuma foto vinculada. Use “Adicionar fotos” para definir a capa desta variação.
              </p>
            )}
          </section>
        ))}
      </div>

      {feedback ? <p className={cx(globalStyles, "form-helper-text")}>{feedback}</p> : null}
    </div>
  );
}
