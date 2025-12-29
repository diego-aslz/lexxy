import { DecoratorNode } from "lexical"
import { createAttachmentFigure, createElement, dispatchCustomEvent, isPreviewableImage } from "../helpers/html_helper"
import { bytesToHumanSize } from "../helpers/storage_helper"

export class ActionTextAttachmentNode extends DecoratorNode {
  static getType() {
    return "action_text_attachment"
  }

  static clone(node) {
    return new ActionTextAttachmentNode({ ...node }, node.__key)
  }

  static importJSON(serializedNode) {
    return new ActionTextAttachmentNode({ ...serializedNode })
  }

  static importDOM() {
    return {
      "action-text-attachment": (attachment) => {
        return {
          conversion: () => ({
            node: new ActionTextAttachmentNode({
              sgid: attachment.getAttribute("sgid"),
              src: attachment.getAttribute("url"),
              previewable: attachment.getAttribute("previewable"),
              altText: attachment.getAttribute("alt"),
              caption: attachment.getAttribute("caption"),
              contentType: attachment.getAttribute("content-type"),
              fileName: attachment.getAttribute("filename"),
              fileSize: attachment.getAttribute("filesize"),
              width: attachment.getAttribute("width"),
              height: attachment.getAttribute("height")
            })
          }),
          priority: 1
        }
      },
      "img": (img) => {
        return {
          conversion: () => ({
            node: new ActionTextAttachmentNode({
              src: img.getAttribute("src"),
              caption: img.getAttribute("alt") || "",
              contentType: "image/*",
              width: img.getAttribute("width"),
              height: img.getAttribute("height")
            })
          }),
          priority: 1
        }
      },
      "video": (video) => {
        const videoSource = video.getAttribute("src") || video.querySelector("source")?.src
        const fileName = videoSource?.split("/")?.pop()
        const contentType = video.querySelector("source")?.getAttribute("content-type") || "video/*"

        return {
          conversion: () => ({
            node: new ActionTextAttachmentNode({
              src: videoSource,
              fileName: fileName,
              contentType: contentType
            })
          }),
          priority: 1
        }
      }
    }
  }

  constructor({ sgid, src, previewable, altText, caption, contentType, fileName, fileSize, width, height }, key) {
    super(key)

    this.sgid = sgid
    this.src = src
    this.previewable = previewable
    this.altText = altText || ""
    this.caption = caption || ""
    this.contentType = contentType || ""
    this.fileName = fileName || ""
    this.fileSize = fileSize
    this.width = width
    this.height = height
  }

  createDOM() {
    const figure = this.createAttachmentFigure()
    
    figure.addEventListener("click", (event) => {
      this.#select(figure)
    })

    if (this.isPreviewableAttachment) {
      const img = this.#createDOMForImage()
      figure.appendChild(img)
      this.#appendResizeHandle(figure, img)
      figure.appendChild(this.#createEditableCaption())
    } else {
      figure.appendChild(this.#createDOMForFile())
      figure.appendChild(this.#createDOMForNotImage())
    }

    return figure
  }

  updateDOM() {
    return true
  }

  getTextContent() {
    return `[${ this.caption || this.fileName }]\n\n`
  }

  isInline() {
    return false
  }

  exportDOM() {
    const attachment = createElement("action-text-attachment", {
      sgid: this.sgid,
      previewable: this.previewable || null,
      url: this.src,
      alt: this.altText,
      caption: this.caption,
      "content-type": this.contentType,
      filename: this.fileName,
      filesize: this.fileSize,
      width: this.width,
      height: this.height,
      presentation: "gallery"
    })

    return { element: attachment }
  }

  exportJSON() {
    return {
      type: "action_text_attachment",
      version: 1,
      sgid: this.sgid,
      src: this.src,
      previewable: this.previewable,
      altText: this.altText,
      caption: this.caption,
      contentType: this.contentType,
      fileName: this.fileName,
      fileSize: this.fileSize,
      width: this.width,
      height: this.height
    }
  }

  decorate() {
    return null
  }

  createAttachmentFigure() {
    return createAttachmentFigure(this.contentType, this.isPreviewableAttachment, this.fileName)
  }

  get #isPreviewableImage() {
    return isPreviewableImage(this.contentType)
  }

  get isPreviewableAttachment() {
    return this.#isPreviewableImage || this.previewable
  }

  #createDOMForImage() {
    return createElement("img", { src: this.src, alt: this.altText, ...this.#imageDimensions })
  }

  get #imageDimensions() {
    const dims = {}
    if (this.width) dims.width = this.width
    if (this.height) dims.height = this.height
    return dims
  }

  #createDOMForFile() {
    const extension = this.fileName ? this.fileName.split(".").pop().toLowerCase() : "unknown"
    return createElement("span", { className: "attachment__icon", textContent: `${extension}` })
  }

  #createDOMForNotImage() {
    const figcaption = createElement("figcaption", { className: "attachment__caption" })

    const nameTag = createElement("strong", { className: "attachment__name", textContent: this.caption || this.fileName })

    figcaption.appendChild(nameTag)

    if (this.fileSize) {
      const sizeSpan = createElement("span", { className: "attachment__size", textContent: bytesToHumanSize(this.fileSize) })
      figcaption.appendChild(sizeSpan)
    }

    return figcaption
  }

  #select(figure) {
    dispatchCustomEvent(figure, "lexxy:internal:select-node", { key: this.getKey() })
  }

  #createEditableCaption() {
    const caption = createElement("figcaption", { className: "attachment__caption" })
    const input = createElement("textarea", {
      value: this.caption,
      placeholder: this.fileName,
      rows: "1"
    })

    input.addEventListener("focusin", () => input.placeholder = "Add caption...")
    input.addEventListener("blur", this.#handleCaptionInputBlurred.bind(this))
    input.addEventListener("keydown", this.#handleCaptionInputKeydown.bind(this))

    caption.appendChild(input)

    return caption
  }

  #appendResizeHandle(figure, img) {
    // Add a simple bottom-right resize handle for image attachments
    const handle = createElement("span", {
      className: "attachment__resize-handle",
      title: "Resize image"
    })

    // Ensure the figure is positioned for the absolute handle
    const figureStyle = getComputedStyle(figure)
    if (figureStyle.position === "static") {
      figure.style.position = "relative"
    }

    const onMouseDown = (downEvent) => {
      downEvent.preventDefault()
      downEvent.stopPropagation()

      const startX = downEvent.clientX
      const startWidth = img.getBoundingClientRect().width
      const naturalWidth = img.naturalWidth || startWidth

      const onMouseMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX
        let newWidth = Math.round(startWidth + dx)
        newWidth = Math.max(32, Math.min(newWidth, naturalWidth))

        // Live preview during drag
        img.style.width = `${newWidth}px`
      }

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove)
        document.removeEventListener("mouseup", onMouseUp)

        // Persist width on node (clear height to preserve aspect ratio)
        const finalWidthPx = parseInt(img.style.width || img.getBoundingClientRect().width, 10)
        dispatchCustomEvent(img, "lexxy:internal:invalidate-node", { key: this.getKey(), values: { width: finalWidthPx, height: null } })
      }

      document.addEventListener("mousemove", onMouseMove)
      document.addEventListener("mouseup", onMouseUp)
    }

    handle.addEventListener("mousedown", onMouseDown)
    figure.appendChild(handle)
  }

  #handleCaptionInputBlurred(event) {
    const input = event.target

    input.placeholder = this.fileName
    this.#updateCaptionValueFromInput(input)
  }

  #updateCaptionValueFromInput(input) {
    dispatchCustomEvent(input, "lexxy:internal:invalidate-node", { key: this.getKey(), values: { caption: input.value } })
  }

  #handleCaptionInputKeydown(event) {
    if (event.key === "Enter") {
      this.#updateCaptionValueFromInput(event.target)
      dispatchCustomEvent(event.target, "lexxy:internal:move-to-next-line")
      event.preventDefault()
    }
    event.stopPropagation()
  }
}
