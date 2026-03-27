import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";

export const SECURE_PROTOCOL = "webdav-secure:";
export const SECURE_CODE_BLOCK = "secure-webdav";

export type SecureWebdavImageBlock = {
  path: string;
  alt: string;
};

type SecureWebdavImageSupportDeps = {
  t: (zh: string, en: string) => string;
  fetchSecureImageBlobUrl: (remotePath: string) => Promise<string>;
};

class SecureWebdavRenderChild extends MarkdownRenderChild {
  constructor(containerEl: HTMLElement) {
    super(containerEl);
  }

  onunload(): void {}
}

// Keep secure image parsing and rendering isolated so sync changes do not
// accidentally break the display pipeline again.
export class SecureWebdavImageSupport {
  constructor(private readonly deps: SecureWebdavImageSupportDeps) {}

  buildSecureImageMarkup(remoteUrl: string, alt: string) {
    const remotePath = this.extractRemotePath(remoteUrl);
    if (!remotePath) {
      return `![](${remoteUrl})`;
    }

    return this.buildSecureImageCodeBlock(remotePath, alt);
  }

  buildSecureImageCodeBlock(remotePath: string, alt: string) {
    const normalizedAlt = (alt || remotePath).replace(/\r?\n/g, " ").trim();
    const normalizedPath = remotePath.replace(/\r?\n/g, "").trim();
    return [`\`\`\`${SECURE_CODE_BLOCK}`, `path: ${normalizedPath}`, `alt: ${normalizedAlt}`, "```"].join("\n");
  }

  parseSecureImageBlock(source: string): SecureWebdavImageBlock | null {
    const result: SecureWebdavImageBlock = { path: "", alt: "" };
    for (const rawLine of source.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim().toLowerCase();
      const value = line.slice(separatorIndex + 1).trim();
      if (key === "path") {
        result.path = value;
      } else if (key === "alt") {
        result.alt = value;
      }
    }

    return result.path ? result : null;
  }

  async processSecureImages(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const secureCodeBlocks = Array.from(el.querySelectorAll<HTMLElement>(`pre > code.language-${SECURE_CODE_BLOCK}`));
    await Promise.all(
      secureCodeBlocks.map(async (codeEl) => {
        const pre = codeEl.parentElement;
        if (!(pre instanceof HTMLElement) || pre.hasAttribute("data-secure-webdav-rendered")) {
          return;
        }

        const parsed = this.parseSecureImageBlock(codeEl.textContent ?? "");
        if (!parsed?.path) {
          return;
        }

        pre.setAttribute("data-secure-webdav-rendered", "true");
        await this.renderSecureImageIntoElement(pre, parsed.path, parsed.alt || parsed.path);
      }),
    );

    const secureNodes = Array.from(el.querySelectorAll<HTMLElement>("[data-secure-webdav]"));
    await Promise.all(
      secureNodes.map(async (node) => {
        if (node instanceof HTMLImageElement) {
          await this.swapImageSource(node);
          return;
        }

        const remotePath = node.getAttribute("data-secure-webdav");
        if (!remotePath) {
          return;
        }

        const img = document.createElement("img");
        img.alt = node.getAttribute("aria-label") ?? node.getAttribute("alt") ?? "Secure WebDAV image";
        img.setAttribute("data-secure-webdav", remotePath);
        img.classList.add("secure-webdav-image", "is-loading");
        node.replaceWith(img);
        await this.swapImageSource(img);
      }),
    );

    const secureLinks = Array.from(el.querySelectorAll<HTMLImageElement>(`img[src^="${SECURE_PROTOCOL}//"]`));
    await Promise.all(secureLinks.map(async (img) => this.swapImageSource(img)));

    ctx.addChild(new SecureWebdavRenderChild(el));
  }

  async processSecureCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const parsed = this.parseSecureImageBlock(source);
    if (!parsed?.path) {
      el.createEl("div", {
        text: this.deps.t("安全图片代码块格式无效。", "Invalid secure image code block format."),
      });
      return;
    }

    await this.renderSecureImageIntoElement(el, parsed.path, parsed.alt || parsed.path);
    ctx.addChild(new SecureWebdavRenderChild(el));
  }

  extractRemotePath(src: string) {
    const prefix = `${SECURE_PROTOCOL}//`;
    if (!src.startsWith(prefix)) {
      return null;
    }

    return src.slice(prefix.length);
  }

  private async renderSecureImageIntoElement(el: HTMLElement, remotePath: string, alt: string) {
    const img = document.createElement("img");
    img.alt = alt;
    img.setAttribute("data-secure-webdav", remotePath);
    img.classList.add("secure-webdav-image", "is-loading");
    el.empty();
    el.appendChild(img);
    await this.swapImageSource(img);
  }

  private async swapImageSource(img: HTMLImageElement) {
    const remotePath = img.getAttribute("data-secure-webdav") ?? this.extractRemotePath(img.getAttribute("src") ?? "");
    if (!remotePath) {
      return;
    }

    img.classList.add("secure-webdav-image", "is-loading");
    const originalAlt = img.alt;
    img.alt = originalAlt || this.deps.t("加载安全图片中...", "Loading secure image...");

    try {
      const blobUrl = await this.deps.fetchSecureImageBlobUrl(remotePath);
      img.src = blobUrl;
      img.alt = originalAlt;
      img.style.display = "block";
      img.style.maxWidth = "100%";
      img.classList.remove("is-loading", "is-error");
    } catch (error) {
      console.error("Secure WebDAV image load failed", error);
      img.replaceWith(this.buildErrorElement(remotePath, error));
    }
  }

  private buildErrorElement(remotePath: string, error: unknown) {
    const el = document.createElement("div");
    el.className = "secure-webdav-image is-error";
    const message = error instanceof Error ? error.message : String(error);
    el.textContent = this.deps.t(
      `安全图片加载失败：${remotePath}（${message}）`,
      `Secure image failed: ${remotePath} (${message})`,
    );
    return el;
  }
}
