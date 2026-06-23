"use client";

import globalStyles from "@/src/styles/storefront-styles.js";
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
  const [currentUrls, setCurrentUrls] = useState(existingImageUrls);
  const [croppedImages, setCroppedImages] = useState([]);
  const [draftQueue, setDraftQueue] = useState([]);
  const [activeDraft, setActiveDraft] = useState(null);
  const [feedback, setFeedback] = useState("");
  const existingImageKey = useMemo(() => existingImageUrls.join("\n"), [existingImageUrls]);
  const orderedPreviews = useMemo(
    () => [
      ...croppedImages.map((item) => ({ ...item, kind: "new" })),
      ...currentUrls.map((url, index) => ({
        id: `existing-${index}-${url}`,
        kind: "existing",
        previewUrl: url,
        url
      }))
    ],
    [croppedImages, currentUrls]
  );

  function revokeObjectUrl(url) {
    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(url);
  }

  useEffect(() => {
    setCurrentUrls(existingImageUrls);
    setCroppedImages((images) => {
      for (const image of images) {
        revokeObjectUrl(image.previewUrl);
      }

      return [];
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

    for (const image of croppedImages) {
      transfer.items.add(image.file);
    }

    croppedInputRef.current.files = transfer.files;
  }, [croppedImages]);

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
    const availableSlots = Math.max(
      0,
      maxProductImages - currentUrls.length - croppedImages.length - pendingCount
    );
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
      const file = await cropDraftToFile(activeDraft, croppedImages.length);
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      setCroppedImages((items) => [
        ...items,
        {
          file,
          id: `${file.name}-${crypto.randomUUID()}`,
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
    if (item.kind === "new") {
      setCroppedImages((images) => {
        const imageToRemove = images.find((image) => image.id === item.id);

        if (imageToRemove) {
          revokeObjectUrl(imageToRemove.previewUrl);
        }

        return images.filter((image) => image.id !== item.id);
      });
      return;
    }

    setCurrentUrls((urls) => urls.filter((url) => url !== item.url));
  }

  return (
    <div className={cx(globalStyles, "admin-marketplace-uploader span-all")}>
      <textarea
        aria-hidden="true"
        className={cx(globalStyles, "visually-hidden-field")}
        name="imageUrls"
        readOnly
        tabIndex={-1}
        value={currentUrls.join("\n")}
      />
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
          <small>O enquadramento preserva a peça no mesmo formato dos cards da vitrine.</small>
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

      {orderedPreviews.length > 0 ? (
        <div
          className={cx(globalStyles, "admin-upload-preview-grid")}
          aria-label="Preview das imagens do produto"
        >
          {orderedPreviews.map((item, index) => (
            <figure className={cx(globalStyles, "admin-upload-preview")} key={item.id}>
              <img alt="" src={item.previewUrl} />
              <figcaption>
                <span>{index + 1}</span>
                <strong>{item.kind === "new" ? "Novo enquadramento" : "Atual"}</strong>
              </figcaption>
              <button
                aria-label={`Remover imagem ${index + 1}`}
                onClick={() => removeImage(item)}
                type="button"
              >
                Remover
              </button>
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
