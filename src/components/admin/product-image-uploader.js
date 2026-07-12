"use client";

import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import { useEffect, useMemo, useRef, useState } from "react";

const outputAspectRatio = 4 / 3;
const maxProductImages = 12;
const outputWidth = 1200;
const outputHeight = Math.round(outputWidth / outputAspectRatio);

function createDraft(file) {
  return {
    file,
    id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
    objectUrl: URL.createObjectURL(file),
    positionX: 50,
    positionY: 50,
    zoom: 1
  };
}

function createExistingItem(url, index) {
  return {
    id: `existing-${index}-${url}`,
    kind: "existing",
    previewUrl: url,
    url
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Nao foi possivel carregar a imagem."));
    image.src = src;
  });
}

async function cropDraftToFile(draft, index) {
  const image = await loadImage(draft.objectUrl);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas do navegador indisponivel para recortar a imagem.");
  }

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(outputWidth / sourceWidth, outputHeight / sourceHeight) * draft.zoom;
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX =
    drawWidth > outputWidth
      ? -((drawWidth - outputWidth) * draft.positionX) / 100
      : ((outputWidth - drawWidth) * draft.positionX) / 100;
  const offsetY =
    drawHeight > outputHeight
      ? -((drawHeight - outputHeight) * draft.positionY) / 100
      : ((outputHeight - drawHeight) * draft.positionY) / 100;

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
    throw new Error("Nao foi possivel gerar a imagem recortada.");
  }

  return new File([blob], `produto-card-${String(index + 1).padStart(2, "0")}.webp`, {
    type: "image/webp"
  });
}

export function ProductImageUploader({ existingImageUrls = [] }) {
  const fileInputRef = useRef(null);
  const croppedInputRef = useRef(null);
  const objectUrlsRef = useRef(new Set());
  const gridRef = useRef(null);
  const draggingIdRef = useRef(null);
  const [items, setItems] = useState(() =>
    existingImageUrls.map((url, index) => createExistingItem(url, index))
  );
  const [draftQueue, setDraftQueue] = useState([]);
  const [activeDraft, setActiveDraft] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [feedback, setFeedback] = useState("");
  const existingImageKey = useMemo(() => existingImageUrls.join("\n"), [existingImageUrls]);

  const existingUrlsValue = useMemo(
    () =>
      items
        .filter((item) => item.kind === "existing")
        .map((item) => item.url)
        .join("\n"),
    [items]
  );
  const imageOrderValue = useMemo(() => {
    let uploadIndex = 0;

    return items
      .map((item) => (item.kind === "new" ? `new:${uploadIndex++}` : item.url))
      .join("\n");
  }, [items]);

  function revokeObjectUrl(url) {
    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(url);
  }

  useEffect(() => {
    draggingIdRef.current = null;
    setDraggingId(null);
    setItems((current) => {
      for (const item of current) {
        if (item.kind === "new") {
          revokeObjectUrl(item.previewUrl);
        }
      }

      return existingImageUrls.map((url, index) => createExistingItem(url, index));
    });
    setDraftQueue((drafts) => {
      for (const draft of drafts) {
        revokeObjectUrl(draft.objectUrl);
      }

      return [];
    });
    setActiveDraft((draft) => {
      if (draft) {
        revokeObjectUrl(draft.objectUrl);
      }

      return null;
    });
    setFeedback("");
  }, [existingImageKey]);

  useEffect(() => {
    if (activeDraft || draftQueue.length === 0) {
      return;
    }

    const [nextDraft, ...rest] = draftQueue;
    setActiveDraft(nextDraft);
    setDraftQueue(rest);
  }, [activeDraft, draftQueue]);

  useEffect(() => {
    if (!croppedInputRef.current || typeof DataTransfer === "undefined") {
      return;
    }

    const transfer = new DataTransfer();

    for (const item of items) {
      if (item.kind === "new") {
        transfer.items.add(item.file);
      }
    }

    croppedInputRef.current.files = transfer.files;
  }, [items]);

  useEffect(
    () => () => {
      for (const url of objectUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
    },
    []
  );

  function openPicker() {
    fileInputRef.current?.click();
  }

  function handleFilesChange(event) {
    const selectedFiles = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith("image/")
    );

    if (selectedFiles.length === 0) {
      setFeedback("Selecione imagens JPG, PNG, WEBP ou GIF.");
      return;
    }

    const pendingCount = draftQueue.length + (activeDraft ? 1 : 0);
    const availableSlots = Math.max(0, maxProductImages - items.length - pendingCount);
    const files = selectedFiles.slice(0, availableSlots);

    if (availableSlots === 0) {
      setFeedback(`O produto pode ter no maximo ${maxProductImages} imagens.`);
      event.target.value = "";
      return;
    }

    setFeedback(
      selectedFiles.length > files.length
        ? `Foram adicionadas ${files.length} imagens. O limite e ${maxProductImages}.`
        : ""
    );
    const drafts = files.map(createDraft);

    for (const draft of drafts) {
      objectUrlsRef.current.add(draft.objectUrl);
    }

    setDraftQueue((queue) => [...queue, ...drafts]);
    event.target.value = "";
  }

  function updateActiveDraft(field, value) {
    setActiveDraft((draft) =>
      draft
        ? {
            ...draft,
            [field]: Number(value)
          }
        : draft
    );
  }

  function closeActiveDraft() {
    if (activeDraft) {
      revokeObjectUrl(activeDraft.objectUrl);
    }

    setActiveDraft(null);
  }

  async function addCroppedImage() {
    if (!activeDraft) {
      return;
    }

    try {
      setFeedback("Gerando enquadramento da imagem...");
      const newImageCount = items.filter((item) => item.kind === "new").length;
      const file = await cropDraftToFile(activeDraft, newImageCount);
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      setItems((current) => [
        ...current,
        {
          file,
          id: `new-${file.name}-${crypto.randomUUID()}`,
          kind: "new",
          previewUrl
        }
      ]);
      closeActiveDraft();
      setFeedback("");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Nao foi possivel recortar a imagem.");
    }
  }

  function removeImage(item) {
    setItems((current) => current.filter((entry) => entry.id !== item.id));

    if (item.kind === "new") {
      revokeObjectUrl(item.previewUrl);
    }
  }

  function moveImage(index, direction) {
    setItems((current) => {
      const target = index + direction;

      if (target < 0 || target >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function startPointerDrag(event, item) {
    if (event.button !== 0) {
      return;
    }

    draggingIdRef.current = item.id;
    setDraggingId(item.id);

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // setPointerCapture pode falhar em navegadores antigos; o arraste segue via eventos globais.
    }
  }

  function handlePointerDragMove(event) {
    if (draggingIdRef.current == null || !gridRef.current) {
      return;
    }

    const tiles = Array.from(gridRef.current.children);
    const pointerX = event.clientX;
    const pointerY = event.clientY;
    let nearestIndex = -1;
    let nearestDistance = Infinity;

    tiles.forEach((tile, index) => {
      const rect = tile.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(pointerX - centerX, pointerY - centerY);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    if (nearestIndex < 0) {
      return;
    }

    setItems((current) => {
      const fromIndex = current.findIndex((entry) => entry.id === draggingIdRef.current);

      if (fromIndex < 0 || fromIndex === nearestIndex) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(nearestIndex, 0, moved);
      return next;
    });
  }

  function endPointerDrag(event) {
    if (draggingIdRef.current == null) {
      return;
    }

    draggingIdRef.current = null;
    setDraggingId(null);

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignorado: o ponteiro pode ja ter sido liberado.
    }
  }

  return (
    <div className={cx(globalStyles, "admin-marketplace-uploader span-all")}>
      <textarea
        aria-hidden="true"
        className={cx(globalStyles, "visually-hidden-field")}
        name="imageUrls"
        readOnly
        tabIndex={-1}
        value={existingUrlsValue}
      />
      <input name="imageOrder" readOnly type="hidden" value={imageOrderValue} />
      <input
        accept="image/jpeg,image/png,image/webp,image/gif"
        className={cx(globalStyles, "visually-hidden-field")}
        multiple
        onChange={handleFilesChange}
        ref={fileInputRef}
        type="file"
      />
      <input
        accept="image/webp"
        className={cx(globalStyles, "visually-hidden-field")}
        multiple
        name="imageFiles"
        ref={croppedInputRef}
        type="file"
      />

      <div className={cx(globalStyles, "admin-uploader-dropzone")}>
        <div>
          <span>Imagens do produto</span>
          <strong>Selecione, enquadre e envie varias fotos.</strong>
          <small>Arraste pela alca ⠿ (ou use as setas) para definir a ordem. A 1ª é a capa.</small>
        </div>
        <button
          className={cx(globalStyles, "button button-secondary")}
          onClick={openPicker}
          type="button"
        >
          Selecionar imagens
        </button>
      </div>

      {activeDraft ? (
        <div className={cx(globalStyles, "admin-image-cropper")}>
          <div
            className={cx(globalStyles, "admin-image-crop-stage")}
            aria-label="Area de enquadramento 4:3"
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
                Adicionar enquadramento
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

      {items.length > 0 ? (
        <div
          className={cx(globalStyles, "admin-upload-preview-grid")}
          aria-label="Preview das imagens do produto"
          ref={gridRef}
        >
          {items.map((item, index) => (
            <figure
              className={cx(
                globalStyles,
                `admin-upload-preview ${draggingId === item.id ? "is-dragging" : ""}`
              )}
              key={item.id}
            >
              <button
                aria-label={`Arrastar imagem ${index + 1} para reordenar`}
                className={cx(globalStyles, "admin-upload-preview-handle")}
                onPointerCancel={endPointerDrag}
                onPointerDown={(event) => startPointerDrag(event, item)}
                onPointerMove={handlePointerDragMove}
                onPointerUp={endPointerDrag}
                type="button"
              >
                <span aria-hidden="true">⠿</span>
                <span>{index + 1}</span>
              </button>
              <img alt="" draggable={false} src={item.previewUrl} />
              <figcaption>{item.kind === "new" ? "Novo enquadramento" : "Atual"}</figcaption>
              <div className={cx(globalStyles, "admin-upload-preview-controls")}>
                <button
                  aria-label={`Mover imagem ${index + 1} para tras`}
                  disabled={index === 0}
                  onClick={() => moveImage(index, -1)}
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={`Mover imagem ${index + 1} para frente`}
                  disabled={index === items.length - 1}
                  onClick={() => moveImage(index, 1)}
                  type="button"
                >
                  ↓
                </button>
                <button
                  aria-label={`Remover imagem ${index + 1}`}
                  className={cx(globalStyles, "admin-upload-preview-remove")}
                  onClick={() => removeImage(item)}
                  type="button"
                >
                  Remover
                </button>
              </div>
            </figure>
          ))}
        </div>
      ) : (
        <p className={cx(globalStyles, "form-helper-text")}>
          Nenhuma imagem selecionada. Produtos sem imagem usam o visual padrao TSZR15.
        </p>
      )}

      {feedback ? <p className={cx(globalStyles, "form-helper-text")}>{feedback}</p> : null}
    </div>
  );
}
