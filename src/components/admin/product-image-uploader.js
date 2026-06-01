"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const cropAspectRatio = 16 / 9;
const maxProductImages = 12;
const outputWidth = 1600;
const outputHeight = Math.round(outputWidth / cropAspectRatio);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

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
  const sourceAspectRatio = sourceWidth / sourceHeight;
  const baseCropWidth =
    sourceAspectRatio > cropAspectRatio ? sourceHeight * cropAspectRatio : sourceWidth;
  const baseCropHeight =
    sourceAspectRatio > cropAspectRatio ? sourceHeight : sourceWidth / cropAspectRatio;
  const cropWidth = baseCropWidth / draft.zoom;
  const cropHeight = baseCropHeight / draft.zoom;
  const minX = cropWidth / 2;
  const maxX = sourceWidth - cropWidth / 2;
  const minY = cropHeight / 2;
  const maxY = sourceHeight - cropHeight / 2;
  const centerX = minX + ((maxX - minX) * draft.positionX) / 100;
  const centerY = minY + ((maxY - minY) * draft.positionY) / 100;
  const sourceX = clamp(centerX - cropWidth / 2, 0, sourceWidth - cropWidth);
  const sourceY = clamp(centerY - cropHeight / 2, 0, sourceHeight - cropHeight);

  canvas.width = outputWidth;
  canvas.height = outputHeight;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    0,
    0,
    outputWidth,
    outputHeight
  );

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));

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
      setFeedback("Gerando recorte da imagem...");
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
    <div className="admin-marketplace-uploader span-all">
      <textarea
        aria-hidden="true"
        className="visually-hidden-field"
        name="imageUrls"
        readOnly
        tabIndex={-1}
        value={currentUrls.join("\n")}
      />
      <input
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="visually-hidden-field"
        multiple
        onChange={handleFilesChange}
        ref={fileInputRef}
        type="file"
      />
      <input
        accept="image/webp"
        className="visually-hidden-field"
        multiple
        name="imageFiles"
        ref={croppedInputRef}
        type="file"
      />

      <div className="admin-uploader-dropzone">
        <div>
          <span>Imagens do produto</span>
          <strong>Selecione, recorte e envie varias fotos.</strong>
          <small>O recorte usa o mesmo formato fixo dos cards da vitrine.</small>
        </div>
        <button className="button button-secondary" onClick={openPicker} type="button">
          Selecionar imagens
        </button>
      </div>

      {activeDraft ? (
        <div className="admin-image-cropper">
          <div className="admin-image-crop-stage" aria-label="Area de recorte 16:9">
            <img
              alt=""
              src={activeDraft.objectUrl}
              style={{
                objectPosition: `${activeDraft.positionX}% ${activeDraft.positionY}%`,
                transform: `scale(${activeDraft.zoom})`
              }}
            />
          </div>
          <div className="admin-image-crop-controls">
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
            <div className="admin-image-crop-actions">
              <button className="button button-primary" onClick={addCroppedImage} type="button">
                Adicionar recorte
              </button>
              <button className="button button-secondary" onClick={closeActiveDraft} type="button">
                Pular imagem
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {orderedPreviews.length > 0 ? (
        <div className="admin-upload-preview-grid" aria-label="Preview das imagens do produto">
          {orderedPreviews.map((item, index) => (
            <figure className="admin-upload-preview" key={item.id}>
              <img alt="" src={item.previewUrl} />
              <figcaption>
                <span>{index + 1}</span>
                <strong>{item.kind === "new" ? "Novo recorte" : "Atual"}</strong>
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
        <p className="form-helper-text">
          Nenhuma imagem selecionada. Produtos sem imagem usam o visual padrao TSZR15.
        </p>
      )}

      {feedback ? <p className="form-helper-text">{feedback}</p> : null}
    </div>
  );
}
