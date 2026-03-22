import {
  App,
  Editor,
  MarkdownFileInfo,
  MarkdownRenderChild,
  MarkdownView,
  MarkdownPostProcessorContext,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  normalizePath,
  requestUrl as obsidianRequestUrl,
} from "obsidian";

type SecureWebdavSettings = {
  webdavUrl: string;
  username: string;
  password: string;
  remoteFolder: string;
  vaultSyncRemoteFolder: string;
  namingStrategy: "timestamp" | "hash";
  deleteLocalAfterUpload: boolean;
  language: "auto" | "zh" | "en";
  noteStorageMode: "full-local" | "lazy-notes";
  noteEvictAfterDays: number;
  autoSyncIntervalMinutes: number;
  maxRetryAttempts: number;
  retryDelaySeconds: number;
  deleteRemoteWhenUnreferenced: boolean;
  compressImages: boolean;
  compressThresholdKb: number;
  maxImageDimension: number;
  jpegQuality: number;
};

type UploadTask = {
  id: string;
  notePath: string;
  placeholder: string;
  mimeType: string;
  fileName: string;
  dataBase64: string;
  attempts: number;
  createdAt: number;
  lastError?: string;
};

type SyncIndexEntry = {
  signature: string;
  remotePath: string;
};

type RemoteInventory = {
  files: Set<string>;
  directories: Set<string>;
};

const DEFAULT_SETTINGS: SecureWebdavSettings = {
  webdavUrl: "",
  username: "",
  password: "",
  remoteFolder: "/remote-images/",
  vaultSyncRemoteFolder: "/vault-sync/",
  namingStrategy: "hash",
  deleteLocalAfterUpload: true,
  language: "auto",
  noteStorageMode: "full-local",
  noteEvictAfterDays: 30,
  autoSyncIntervalMinutes: 0,
  maxRetryAttempts: 5,
  retryDelaySeconds: 5,
  deleteRemoteWhenUnreferenced: true,
  compressImages: true,
  compressThresholdKb: 300,
  maxImageDimension: 2200,
  jpegQuality: 82,
};

const SECURE_PROTOCOL = "webdav-secure:";
const SECURE_CODE_BLOCK = "secure-webdav";
const SECURE_NOTE_STUB = "secure-webdav-note-stub";

export default class SecureWebdavImagesPlugin extends Plugin {
  settings: SecureWebdavSettings = DEFAULT_SETTINGS;
  queue: UploadTask[] = [];
  private blobUrls = new Set<string>();
  private processingTaskIds = new Set<string>();
  private retryTimeouts = new Map<string, number>();
  private noteRemoteRefs = new Map<string, Set<string>>();
  private remoteCleanupInFlight = new Set<string>();
  private noteAccessTimestamps = new Map<string, number>();
  private syncIndex = new Map<string, SyncIndexEntry>();
  private lastVaultSyncAt = 0;
  private lastVaultSyncStatus = "";
  private syncInProgress = false;

  async onload() {
    await this.loadPluginState();

    this.addSettingTab(new SecureWebdavSettingTab(this.app, this));

    this.addCommand({
      id: "upload-current-note-local-images",
      name: "Upload local images in current note to WebDAV",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          return false;
        }

        if (!checking) {
          void this.uploadImagesInNote(file);
        }

        return true;
      },
    });

    this.addCommand({
      id: "test-webdav-connection",
      name: "Test WebDAV connection",
      callback: () => {
        void this.runConnectionTest(true);
      },
    });

    this.addCommand({
      id: "sync-configured-vault-content-to-webdav",
      name: "Sync vault content to WebDAV",
      callback: () => {
        void this.runManualSync();
      },
    });

    const ribbon = this.addRibbonIcon("refresh-cw", this.t("立即同步到 WebDAV", "Sync to WebDAV now"), () => {
      void this.runManualSync();
    });
    ribbon.addClass("secure-webdav-sync-ribbon");

    this.registerMarkdownPostProcessor((el, ctx) => {
      void this.processSecureImages(el, ctx);
    });
    this.registerMarkdownCodeBlockProcessor(SECURE_CODE_BLOCK, (source, el, ctx) => {
      void this.processSecureCodeBlock(source, el, ctx);
    });

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        void this.handleFileOpen(file);
      }),
    );

    this.registerEvent(
      this.app.workspace.on("editor-paste", (evt, editor, info) => {
        void this.handleEditorPaste(evt, editor, info);
      }),
    );

    this.registerEvent(
      this.app.workspace.on("editor-drop", (evt, editor, info) => {
        void this.handleEditorDrop(evt, editor, info);
      }),
    );

    await this.rebuildReferenceIndex();
    this.registerEvent(this.app.vault.on("modify", (file) => void this.handleVaultModify(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => void this.handleVaultDelete(file)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => void this.handleVaultRename(file, oldPath)));

    this.setupAutoSync();

    void this.processPendingTasks();

    this.register(() => {
      for (const blobUrl of this.blobUrls) {
        URL.revokeObjectURL(blobUrl);
      }
      this.blobUrls.clear();
      for (const timeoutId of this.retryTimeouts.values()) {
        window.clearTimeout(timeoutId);
      }
      this.retryTimeouts.clear();
    });
  }

  onunload() {
    for (const blobUrl of this.blobUrls) {
      URL.revokeObjectURL(blobUrl);
    }
    this.blobUrls.clear();
    for (const timeoutId of this.retryTimeouts.values()) {
      window.clearTimeout(timeoutId);
    }
    this.retryTimeouts.clear();
  }

  async loadPluginState() {
    const loaded = await this.loadData();
    if (!loaded || typeof loaded !== "object") {
      this.settings = { ...DEFAULT_SETTINGS };
      this.queue = [];
      this.noteAccessTimestamps = new Map();
      this.syncIndex = new Map();
      return;
    }

    const candidate = loaded as Record<string, unknown>;
    if ("settings" in candidate || "queue" in candidate) {
      this.settings = { ...DEFAULT_SETTINGS, ...((candidate.settings as Partial<SecureWebdavSettings>) ?? {}) };
      this.queue = Array.isArray(candidate.queue) ? (candidate.queue as UploadTask[]) : [];
      this.noteAccessTimestamps = new Map(
        Object.entries((candidate.noteAccessTimestamps as Record<string, number> | undefined) ?? {}),
      );
      this.syncIndex = new Map(
        Object.entries((candidate.syncIndex as Record<string, SyncIndexEntry> | undefined) ?? {}),
      );
      this.lastVaultSyncAt =
        typeof candidate.lastVaultSyncAt === "number" ? candidate.lastVaultSyncAt : 0;
      this.lastVaultSyncStatus =
        typeof candidate.lastVaultSyncStatus === "string" ? candidate.lastVaultSyncStatus : "";
      this.normalizeEffectiveSettings();
      return;
    }

    this.settings = { ...DEFAULT_SETTINGS, ...(candidate as Partial<SecureWebdavSettings>) };
    this.queue = [];
    this.noteAccessTimestamps = new Map();
    this.syncIndex = new Map();
    this.lastVaultSyncAt = 0;
    this.lastVaultSyncStatus = "";
    this.normalizeEffectiveSettings();
  }

  private normalizeEffectiveSettings() {
    // Keep the public settings surface intentionally small and deterministic.
    this.settings.deleteLocalAfterUpload = true;
    this.settings.autoSyncIntervalMinutes = Math.max(0, Math.floor(this.settings.autoSyncIntervalMinutes || 0));
  }

  private setupAutoSync() {
    const minutes = this.settings.autoSyncIntervalMinutes;
    if (minutes <= 0) {
      return;
    }

    const intervalMs = minutes * 60 * 1000;
    this.registerInterval(
      window.setInterval(() => {
        void this.processPendingTasks();
        void this.syncConfiguredVaultContent(false);
      }, intervalMs),
    );
  }

  async savePluginState() {
    await this.saveData({
      settings: this.settings,
      queue: this.queue,
      noteAccessTimestamps: Object.fromEntries(this.noteAccessTimestamps.entries()),
      syncIndex: Object.fromEntries(this.syncIndex.entries()),
      lastVaultSyncAt: this.lastVaultSyncAt,
      lastVaultSyncStatus: this.lastVaultSyncStatus,
    });
  }

  async saveSettings() {
    await this.savePluginState();
  }

  t(zh: string, en: string) {
    return this.getLanguage() === "zh" ? zh : en;
  }

  private getLanguage() {
    if (this.settings.language === "auto") {
      const locale = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "en";
      return locale.startsWith("zh") ? "zh" : "en";
    }

    return this.settings.language;
  }

  formatLastSyncLabel() {
    if (!this.lastVaultSyncAt) {
      return this.t("上次同步：尚未执行", "Last sync: not run yet");
    }

    return this.t(
      `上次同步：${new Date(this.lastVaultSyncAt).toLocaleString()}`,
      `Last sync: ${new Date(this.lastVaultSyncAt).toLocaleString()}`,
    );
  }

  formatSyncStatusLabel() {
    return this.lastVaultSyncStatus
      ? this.t(`最近状态：${this.lastVaultSyncStatus}`, `Recent status: ${this.lastVaultSyncStatus}`)
      : this.t("最近状态：暂无", "Recent status: none");
  }

  async runManualSync() {
    await this.processPendingTasks();
    await this.syncConfiguredVaultContent(true);
  }

  private async rebuildReferenceIndex() {
    const next = new Map<string, Set<string>>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.read(file);
      next.set(file.path, this.extractRemotePathsFromText(content));
    }
    this.noteRemoteRefs = next;
  }

  private async handleVaultModify(file: TAbstractFile) {
    if (!(file instanceof TFile) || file.extension !== "md") {
      return;
    }

    const content = await this.app.vault.read(file);
    const nextRefs = this.extractRemotePathsFromText(content);
    const previousRefs = this.noteRemoteRefs.get(file.path) ?? new Set<string>();
    this.noteRemoteRefs.set(file.path, nextRefs);

    const removed = [...previousRefs].filter((value) => !nextRefs.has(value));
    for (const remotePath of removed) {
      await this.deleteRemoteIfUnreferenced(remotePath);
    }
  }

  private async handleVaultDelete(file: TAbstractFile) {
    if (!(file instanceof TFile)) {
      return;
    }

    if (!this.shouldSkipContentSyncPath(file.path)) {
      await this.deleteRemoteSyncedEntry(file.path);
    }

    if (file.extension === "md") {
      const previousRefs = this.noteRemoteRefs.get(file.path) ?? new Set<string>();
      this.noteRemoteRefs.delete(file.path);
      for (const remotePath of previousRefs) {
        await this.deleteRemoteIfUnreferenced(remotePath);
      }
    }
  }

  private async handleVaultRename(file: TAbstractFile, oldPath: string) {
    if (!(file instanceof TFile)) {
      return;
    }

    if (!this.shouldSkipContentSyncPath(oldPath)) {
      await this.deleteRemoteSyncedEntry(oldPath);
    }

    if (file.extension === "md") {
      const refs = this.noteRemoteRefs.get(oldPath);
      if (!refs) {
        return;
      }

      this.noteRemoteRefs.delete(oldPath);
      this.noteRemoteRefs.set(file.path, refs);
    }
  }

  private extractRemotePathsFromText(content: string) {
    const refs = new Set<string>();
    const spanRegex = /data-secure-webdav="([^"]+)"/g;
    const protocolRegex = /webdav-secure:\/\/([^\s)"]+)/g;
    const codeBlockRegex = /```secure-webdav\s+([\s\S]*?)```/g;
    let match: RegExpExecArray | null;

    while ((match = spanRegex.exec(content)) !== null) {
      refs.add(this.unescapeHtml(match[1]));
    }

    while ((match = protocolRegex.exec(content)) !== null) {
      refs.add(this.unescapeHtml(match[1]));
    }

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const parsed = this.parseSecureImageBlock(match[1]);
      if (parsed?.path) {
        refs.add(parsed.path);
      }
    }

    return refs;
  }

  private async deleteRemoteIfUnreferenced(remotePath: string) {
    if (!this.settings.deleteRemoteWhenUnreferenced) {
      return;
    }

    if (this.remoteCleanupInFlight.has(remotePath)) {
      return;
    }

    const stillReferenced = [...this.noteRemoteRefs.values()].some((refs) => refs.has(remotePath));
    if (stillReferenced) {
      return;
    }

    this.remoteCleanupInFlight.add(remotePath);
    try {
      const response = await this.requestUrl({
        url: this.buildUploadUrl(remotePath),
        method: "DELETE",
        headers: {
          Authorization: this.buildAuthHeader(),
        },
      });

      if (response.status !== 404 && (response.status < 200 || response.status >= 300)) {
        throw new Error(`DELETE failed with status ${response.status}`);
      }
    } catch (error) {
      console.error("Failed to delete unreferenced remote image", remotePath, error);
    } finally {
      this.remoteCleanupInFlight.delete(remotePath);
    }
  }

  private async buildUploadReplacements(content: string, noteFile: TFile, uploadCache?: Map<string, string>) {
    const seen = new Map<string, UploadRewrite>();
    const wikiMatches = [...content.matchAll(/!\[\[([^\]]+)\]\]/g)];
    const markdownMatches = [...content.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)];
    const htmlImageMatches = [...content.matchAll(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi)];

    for (const match of wikiMatches) {
      const rawLink = match[1].split("|")[0].trim();
      const file = this.resolveLinkedFile(rawLink, noteFile.path);
      if (!file || !this.isImageFile(file)) {
        continue;
      }

      if (!seen.has(match[0])) {
        const remoteUrl = await this.uploadVaultFile(file, uploadCache);
        seen.set(match[0], {
          original: match[0],
          rewritten: this.buildSecureImageMarkup(remoteUrl, file.basename),
          sourceFile: file,
        });
      }
    }

    for (const match of markdownMatches) {
      const rawLink = decodeURIComponent(match[1].trim().replace(/^<|>$/g, ""));
      if (/^(webdav-secure:|data:)/i.test(rawLink)) {
        continue;
      }

      if (this.isHttpUrl(rawLink)) {
        if (!seen.has(match[0])) {
          const remoteUrl = await this.uploadRemoteImageUrl(rawLink, uploadCache);
          const altText = this.extractMarkdownAltText(match[0]) || this.getDisplayNameFromUrl(rawLink);
          seen.set(match[0], {
            original: match[0],
            rewritten: this.buildSecureImageMarkup(remoteUrl, altText),
          });
        }
        continue;
      }

      const file = this.resolveLinkedFile(rawLink, noteFile.path);
      if (!file || !this.isImageFile(file)) {
        continue;
      }

      if (!seen.has(match[0])) {
        const remoteUrl = await this.uploadVaultFile(file, uploadCache);
        seen.set(match[0], {
          original: match[0],
          rewritten: this.buildSecureImageMarkup(remoteUrl, file.basename),
          sourceFile: file,
        });
      }
    }

    for (const match of htmlImageMatches) {
      const rawLink = this.unescapeHtml(match[1].trim());
      if (!this.isHttpUrl(rawLink) || seen.has(match[0])) {
        continue;
      }

      const remoteUrl = await this.uploadRemoteImageUrl(rawLink, uploadCache);
      const altText = this.extractHtmlImageAltText(match[0]) || this.getDisplayNameFromUrl(rawLink);
      seen.set(match[0], {
        original: match[0],
        rewritten: this.buildSecureImageMarkup(remoteUrl, altText),
      });
    }

    return [...seen.values()];
  }

  private extractMarkdownAltText(markdownImage: string) {
    const match = markdownImage.match(/^!\[([^\]]*)\]/);
    return match?.[1]?.trim() ?? "";
  }

  private extractHtmlImageAltText(htmlImage: string) {
    const match = htmlImage.match(/\balt=["']([^"']*)["']/i);
    return match ? this.unescapeHtml(match[1].trim()) : "";
  }

  private isHttpUrl(value: string) {
    return /^https?:\/\//i.test(value);
  }

  private getDisplayNameFromUrl(rawUrl: string) {
    try {
      const url = new URL(rawUrl);
      const fileName = this.sanitizeFileName(url.pathname.split("/").pop() || "");
      if (fileName) {
        return fileName.replace(/\.[^.]+$/, "");
      }
    } catch {
      // Fall through to the generic label below.
    }

    return this.t("网页图片", "Web image");
  }

  private resolveLinkedFile(link: string, sourcePath: string): TFile | null {
    const cleaned = link.replace(/#.*/, "").trim();
    const target = this.app.metadataCache.getFirstLinkpathDest(cleaned, sourcePath);
    return target instanceof TFile ? target : null;
  }

  private isImageFile(file: TFile) {
    return /^(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.extension);
  }

  private async uploadVaultFile(file: TFile, uploadCache?: Map<string, string>) {
    if (uploadCache?.has(file.path)) {
      return uploadCache.get(file.path)!;
    }

    this.ensureConfigured();
    const binary = await this.app.vault.readBinary(file);
    const prepared = await this.prepareUploadPayload(binary, this.getMimeType(file.extension), file.name);
    const remoteName = await this.buildRemoteFileNameFromBinary(prepared.fileName, prepared.binary);
    const remotePath = this.buildRemotePath(remoteName);
    await this.uploadBinary(remotePath, prepared.binary, prepared.mimeType);
    const remoteUrl = `${SECURE_PROTOCOL}//${remotePath}`;
    uploadCache?.set(file.path, remoteUrl);
    return remoteUrl;
  }

  private async uploadRemoteImageUrl(imageUrl: string, uploadCache?: Map<string, string>) {
    const cacheKey = `remote:${imageUrl}`;
    if (uploadCache?.has(cacheKey)) {
      return uploadCache.get(cacheKey)!;
    }

    this.ensureConfigured();
    const response = await this.requestUrl({
      url: imageUrl,
      method: "GET",
      followRedirects: true,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Remote image download failed with status ${response.status}`);
    }

    const contentType = response.headers["content-type"] ?? "";
    if (!this.isImageContentType(contentType) && !this.looksLikeImageUrl(imageUrl)) {
      throw new Error(this.t("远程链接不是可识别的图片资源。", "The remote URL does not look like an image resource."));
    }

    const fileName = this.buildRemoteSourceFileName(imageUrl, contentType);
    const prepared = await this.prepareUploadPayload(
      response.arrayBuffer,
      this.normalizeImageMimeType(contentType, fileName),
      fileName,
    );
    const remoteName = await this.buildRemoteFileNameFromBinary(prepared.fileName, prepared.binary);
    const remotePath = this.buildRemotePath(remoteName);
    await this.uploadBinary(remotePath, prepared.binary, prepared.mimeType);
    const remoteUrl = `${SECURE_PROTOCOL}//${remotePath}`;
    uploadCache?.set(cacheKey, remoteUrl);
    return remoteUrl;
  }

  private isImageContentType(contentType: string) {
    return /^image\//i.test(contentType.trim());
  }

  private looksLikeImageUrl(rawUrl: string) {
    try {
      const url = new URL(rawUrl);
      return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  private buildRemoteSourceFileName(rawUrl: string, contentType: string) {
    try {
      const url = new URL(rawUrl);
      const candidate = this.sanitizeFileName(url.pathname.split("/").pop() || "");
      if (candidate && /\.[a-z0-9]+$/i.test(candidate)) {
        return candidate;
      }

      const extension = this.getExtensionFromMimeType(contentType) || "png";
      return candidate ? `${candidate}.${extension}` : `remote-image.${extension}`;
    } catch {
      const extension = this.getExtensionFromMimeType(contentType) || "png";
      return `remote-image.${extension}`;
    }
  }

  private sanitizeFileName(fileName: string) {
    return fileName.replace(/[\\/:*?"<>|]+/g, "-").trim();
  }

  private getExtensionFromMimeType(contentType: string) {
    const mimeType = contentType.split(";")[0].trim().toLowerCase();
    switch (mimeType) {
      case "image/jpeg":
        return "jpg";
      case "image/png":
        return "png";
      case "image/gif":
        return "gif";
      case "image/webp":
        return "webp";
      case "image/bmp":
        return "bmp";
      case "image/svg+xml":
        return "svg";
      default:
        return "";
    }
  }

  private normalizeImageMimeType(contentType: string, fileName: string) {
    const mimeType = contentType.split(";")[0].trim().toLowerCase();
    if (mimeType && mimeType !== "application/octet-stream") {
      return mimeType;
    }

    return this.getMimeTypeFromFileName(fileName);
  }

  private async uploadBinary(remotePath: string, binary: ArrayBuffer, mimeType: string) {
    await this.ensureRemoteDirectories(remotePath);
    const response = await this.requestUrl({
      url: this.buildUploadUrl(remotePath),
      method: "PUT",
      headers: {
        Authorization: this.buildAuthHeader(),
        "Content-Type": mimeType,
      },
      body: binary,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Upload failed with status ${response.status}`);
    }
  }

  private async handleEditorPaste(evt: ClipboardEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) {
    if (evt.defaultPrevented || !info.file) {
      return;
    }

    const imageFile = this.extractImageFileFromClipboard(evt);
    if (imageFile) {
      evt.preventDefault();
      const fileName = imageFile.name || this.buildClipboardFileName(imageFile.type);
      await this.enqueueEditorImageUpload(info.file, editor, imageFile, fileName);
      return;
    }

    const html = evt.clipboardData?.getData("text/html")?.trim() ?? "";
    if (!html || !this.htmlContainsRemoteImages(html)) {
      return;
    }

    evt.preventDefault();
    await this.handleHtmlPasteWithRemoteImages(info.file, editor, html);
  }

  private async handleEditorDrop(evt: DragEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) {
    if (evt.defaultPrevented || !info.file) {
      return;
    }

    const imageFile = this.extractImageFileFromDrop(evt);
    if (!imageFile) {
      return;
    }

    evt.preventDefault();
    const fileName = imageFile.name || this.buildClipboardFileName(imageFile.type);
    await this.enqueueEditorImageUpload(info.file, editor, imageFile, fileName);
  }

  private extractImageFileFromClipboard(evt: ClipboardEvent) {
    const direct = Array.from(evt.clipboardData?.files ?? []).find((file) => file.type.startsWith("image/"));
    if (direct) {
      return direct;
    }

    const item = Array.from(evt.clipboardData?.items ?? []).find((entry) => entry.type.startsWith("image/"));
    return item?.getAsFile() ?? null;
  }

  private htmlContainsRemoteImages(html: string) {
    return /<img\b[^>]*src=["']https?:\/\/[^"']+["'][^>]*>/i.test(html);
  }

  private async handleHtmlPasteWithRemoteImages(noteFile: TFile, editor: Editor, html: string) {
    try {
      const rendered = await this.convertHtmlClipboardToSecureMarkdown(html, noteFile);
      if (!rendered.trim()) {
        return;
      }

      editor.replaceSelection(rendered);
      new Notice(this.t("已将网页图文粘贴并抓取远程图片。", "Pasted web content and captured remote images."));
    } catch (error) {
      console.error("Failed to paste HTML content with remote images", error);
      new Notice(
        this.describeError(
          this.t("处理网页图文粘贴失败", "Failed to process pasted web content"),
          error,
        ),
        8000,
      );
    }
  }

  private async convertHtmlClipboardToSecureMarkdown(html: string, noteFile: TFile) {
    const parser = new DOMParser();
    const document = parser.parseFromString(html, "text/html");
    const uploadCache = new Map<string, string>();
    const renderedBlocks: string[] = [];

    for (const node of Array.from(document.body.childNodes)) {
      const block = await this.renderPastedHtmlNode(node, noteFile, uploadCache, 0);
      if (block.trim()) {
        renderedBlocks.push(block.trim());
      }
    }

    return renderedBlocks.join("\n\n") + "\n";
  }

  private async renderPastedHtmlNode(
    node: Node,
    noteFile: TFile,
    uploadCache: Map<string, string>,
    listDepth: number,
  ): Promise<string> {
    if (node.nodeType === Node.TEXT_NODE) {
      return this.normalizeClipboardText(node.textContent ?? "");
    }

    if (!(node instanceof HTMLElement)) {
      return "";
    }

    const tag = node.tagName.toLowerCase();
    if (tag === "img") {
      const src = this.unescapeHtml(node.getAttribute("src")?.trim() ?? "");
      if (!this.isHttpUrl(src)) {
        return "";
      }

      const alt = (node.getAttribute("alt") ?? "").trim() || this.getDisplayNameFromUrl(src);
      const remoteUrl = await this.uploadRemoteImageUrl(src, uploadCache);
      return this.buildSecureImageMarkup(remoteUrl, alt);
    }

    if (tag === "br") {
      return "\n";
    }

    if (tag === "ul" || tag === "ol") {
      const items: string[] = [];
      let index = 1;
      for (const child of Array.from(node.children)) {
        if (child.tagName.toLowerCase() !== "li") {
          continue;
        }

        const rendered = (await this.renderPastedHtmlNode(child, noteFile, uploadCache, listDepth + 1)).trim();
        if (!rendered) {
          continue;
        }

        const prefix = tag === "ol" ? `${index}. ` : "- ";
        items.push(`${"  ".repeat(Math.max(0, listDepth))}${prefix}${rendered}`);
        index += 1;
      }

      return items.join("\n");
    }

    if (tag === "li") {
      const parts = await this.renderPastedHtmlChildren(node, noteFile, uploadCache, listDepth);
      return parts.join("").trim();
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = Number.parseInt(tag[1], 10);
      const text = (await this.renderPastedHtmlChildren(node, noteFile, uploadCache, listDepth)).join("").trim();
      return text ? `${"#".repeat(level)} ${text}` : "";
    }

    if (tag === "a") {
      const href = node.getAttribute("href")?.trim() ?? "";
      const text = (await this.renderPastedHtmlChildren(node, noteFile, uploadCache, listDepth)).join("").trim();
      if (href && /^https?:\/\//i.test(href) && text) {
        return `[${text}](${href})`;
      }
      return text;
    }

    const inlineTags = new Set(["strong", "b", "em", "i", "span", "code", "small", "sup", "sub"]);
    if (inlineTags.has(tag)) {
      return (await this.renderPastedHtmlChildren(node, noteFile, uploadCache, listDepth)).join("");
    }

    const blockTags = new Set([
      "p",
      "div",
      "article",
      "section",
      "figure",
      "figcaption",
      "blockquote",
      "pre",
      "table",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
    ]);
    if (blockTags.has(tag)) {
      const text = (await this.renderPastedHtmlChildren(node, noteFile, uploadCache, listDepth)).join("").trim();
      return text;
    }

    return (await this.renderPastedHtmlChildren(node, noteFile, uploadCache, listDepth)).join("");
  }

  private async renderPastedHtmlChildren(
    element: HTMLElement,
    noteFile: TFile,
    uploadCache: Map<string, string>,
    listDepth: number,
  ) {
    const parts: string[] = [];
    for (const child of Array.from(element.childNodes)) {
      const rendered = await this.renderPastedHtmlNode(child, noteFile, uploadCache, listDepth);
      if (!rendered) {
        continue;
      }

      if (parts.length > 0 && !rendered.startsWith("\n") && !parts[parts.length - 1].endsWith("\n")) {
        const previous = parts[parts.length - 1];
        const needsSpace = /\S$/.test(previous) && /^\S/.test(rendered);
        if (needsSpace) {
          parts.push(" ");
        }
      }

      parts.push(rendered);
    }

    return parts;
  }

  private normalizeClipboardText(value: string) {
    return value.replace(/\s+/g, " ");
  }

  private extractImageFileFromDrop(evt: DragEvent) {
    return Array.from(evt.dataTransfer?.files ?? []).find((file) => file.type.startsWith("image/")) ?? null;
  }

  private async enqueueEditorImageUpload(noteFile: TFile, editor: Editor, imageFile: File, fileName: string) {
    try {
      const arrayBuffer = await imageFile.arrayBuffer();
      const task = this.createUploadTask(
        noteFile.path,
        arrayBuffer,
        imageFile.type || this.getMimeTypeFromFileName(fileName),
        fileName,
      );
      this.insertPlaceholder(editor, task.placeholder);
      this.queue.push(task);
      await this.savePluginState();
      void this.processPendingTasks();
      new Notice(this.t("已加入图片自动上传队列。", "Image added to the auto-upload queue."));
    } catch (error) {
      console.error("Failed to queue secure image upload", error);
      new Notice(this.describeError(this.t("加入图片自动上传队列失败", "Failed to queue image for auto-upload"), error), 8000);
    }
  }

  private createUploadTask(notePath: string, binary: ArrayBuffer, mimeType: string, fileName: string): UploadTask {
    const id = `secure-webdav-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      id,
      notePath,
      placeholder: this.buildPendingPlaceholder(id, fileName),
      mimeType,
      fileName,
      dataBase64: this.arrayBufferToBase64(binary),
      attempts: 0,
      createdAt: Date.now(),
    };
  }

  private buildPendingPlaceholder(taskId: string, fileName: string) {
    const safeName = this.escapeHtml(fileName);
    return `<span class="secure-webdav-pending" data-secure-webdav-task="${taskId}" aria-label="${safeName}">${this.escapeHtml(this.t(`【图片上传中｜${fileName}】`, `[Uploading image | ${fileName}]`))}</span>`;
  }

  private insertPlaceholder(editor: Editor, placeholder: string) {
    editor.replaceSelection(`${placeholder}\n`);
  }

  async syncConfiguredVaultContent(showNotice = true) {
    if (this.syncInProgress) {
      if (showNotice) {
        new Notice(this.t("同步正在进行中。", "A sync is already in progress."), 4000);
      }
      return;
    }

    this.syncInProgress = true;
    try {
      this.ensureConfigured();
      const files = this.collectVaultContentFiles();
      await this.rebuildReferenceIndex();

      const remoteInventory = await this.listRemoteTree(this.settings.vaultSyncRemoteFolder);
      const remoteFiles = remoteInventory.files;
      const currentPaths = new Set(files.map((file) => file.path));
      for (const path of [...this.syncIndex.keys()]) {
        if (!currentPaths.has(path)) {
          const removed = this.syncIndex.get(path);
          if (removed) {
            if (remoteFiles.has(removed.remotePath)) {
              await this.deleteRemoteContentFile(removed.remotePath);
              remoteFiles.delete(removed.remotePath);
            }
          }
          this.syncIndex.delete(path);
        }
      }

      let uploaded = 0;
      let skipped = 0;
      let missingRemoteBackedNotes = 0;
      const localRemotePaths = new Set<string>();
      for (const file of files) {
        const remotePath = this.buildVaultSyncRemotePath(file.path);
        localRemotePaths.add(remotePath);

        if (file.extension === "md") {
          const content = await this.app.vault.read(file);
          const stub = this.parseNoteStub(content);
          if (stub) {
            if (!remoteFiles.has(stub.remotePath)) {
              missingRemoteBackedNotes += 1;
            }
            this.syncIndex.set(file.path, {
              signature: this.buildSyncSignature(file),
              remotePath,
            });
            skipped += 1;
            continue;
          }
        }

        const signature = this.buildSyncSignature(file);
        const previous = this.syncIndex.get(file.path);
        const existsRemotely = remoteFiles.has(remotePath);
        if (previous && previous.signature === signature && previous.remotePath === remotePath && existsRemotely) {
          skipped += 1;
          continue;
        }

        const binary = await this.app.vault.readBinary(file);
        await this.uploadBinary(remotePath, binary, this.getMimeType(file.extension));
        this.syncIndex.set(file.path, { signature, remotePath });
        remoteFiles.add(remotePath);
        uploaded += 1;
      }

      let deletedRemoteFiles = 0;
      for (const remotePath of [...remoteFiles].sort((a, b) => b.localeCompare(a))) {
        if (localRemotePaths.has(remotePath)) {
          continue;
        }

        await this.deleteRemoteContentFile(remotePath);
        remoteFiles.delete(remotePath);
        deletedRemoteFiles += 1;
      }

      const deletedRemoteDirectories = await this.deleteExtraRemoteDirectories(
        remoteInventory.directories,
        this.buildExpectedRemoteDirectories(localRemotePaths, this.settings.vaultSyncRemoteFolder),
      );
      const imageCleanup = await this.reconcileRemoteImages();
      const evictedNotes = await this.evictStaleSyncedNotes(false);

      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.t(
        `已对账同步 ${uploaded} 个文件，跳过 ${skipped} 个未变化文件，删除远端多余内容 ${deletedRemoteFiles} 个、目录 ${deletedRemoteDirectories} 个，清理冗余图片 ${imageCleanup.deletedFiles} 张、目录 ${imageCleanup.deletedDirectories} 个${evictedNotes > 0 ? `，回收本地旧笔记 ${evictedNotes} 篇` : ""}${missingRemoteBackedNotes > 0 ? `，并发现 ${missingRemoteBackedNotes} 篇按需笔记缺少远端正文` : ""}。`,
        `Reconciled sync uploaded ${uploaded} file(s), skipped ${skipped} unchanged file(s), deleted ${deletedRemoteFiles} extra remote content file(s), removed ${deletedRemoteDirectories} remote director${deletedRemoteDirectories === 1 ? "y" : "ies"}, cleaned ${imageCleanup.deletedFiles} orphaned remote image(s) plus ${imageCleanup.deletedDirectories} director${imageCleanup.deletedDirectories === 1 ? "y" : "ies"}${evictedNotes > 0 ? `, and evicted ${evictedNotes} stale local note(s)` : ""}${missingRemoteBackedNotes > 0 ? `, while detecting ${missingRemoteBackedNotes} lazy note(s) missing their remote content` : ""}.`,
      );
      await this.savePluginState();
      if (showNotice) {
        new Notice(this.lastVaultSyncStatus, 8000);
      }
    } catch (error) {
      console.error("Vault content sync failed", error);
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.describeError(this.t("内容同步失败", "Content sync failed"), error);
      await this.savePluginState();
      if (showNotice) {
        new Notice(this.lastVaultSyncStatus, 8000);
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  private async deleteRemoteContentFile(remotePath: string) {
    try {
      const response = await this.requestUrl({
        url: this.buildUploadUrl(remotePath),
        method: "DELETE",
        headers: {
          Authorization: this.buildAuthHeader(),
        },
      });

      if (response.status !== 404 && (response.status < 200 || response.status >= 300)) {
        throw new Error(`DELETE failed with status ${response.status}`);
      }
    } catch (error) {
      console.error("Failed to delete remote synced content", remotePath, error);
      throw error;
    }
  }

  private async deleteRemoteSyncedEntry(vaultPath: string) {
    const existing = this.syncIndex.get(vaultPath);
    const remotePath = existing?.remotePath ?? this.buildVaultSyncRemotePath(vaultPath);
    await this.deleteRemoteContentFile(remotePath);
    this.syncIndex.delete(vaultPath);
    await this.savePluginState();
  }

  private async handleFileOpen(file: TFile | null) {
    if (!(file instanceof TFile) || file.extension !== "md") {
      return;
    }

    this.noteAccessTimestamps.set(file.path, Date.now());
    await this.savePluginState();

    const content = await this.app.vault.read(file);
    const stub = this.parseNoteStub(content);
    if (!stub) {
      return;
    }

    try {
      const response = await this.requestUrl({
        url: this.buildUploadUrl(stub.remotePath),
        method: "GET",
        headers: {
          Authorization: this.buildAuthHeader(),
        },
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`GET failed with status ${response.status}`);
      }

      const hydrated = this.decodeUtf8(response.arrayBuffer);
      await this.app.vault.modify(file, hydrated);
      new Notice(this.t(`已从远端恢复笔记：${file.basename}`, `Restored note from remote: ${file.basename}`), 6000);
    } catch (error) {
      console.error("Failed to hydrate note from remote", error);
      new Notice(this.describeError(this.t("远端恢复笔记失败", "Failed to restore note from remote"), error), 8000);
    }
  }

  private shouldSkipContentSyncPath(path: string) {
    const normalizedPath = normalizePath(path);
    if (normalizedPath === ".obsidian" || normalizedPath.startsWith(".obsidian/")) {
      return true;
    }

    if (
      normalizedPath === ".obsidian/plugins/secure-webdav-images" ||
      normalizedPath.startsWith(".obsidian/plugins/secure-webdav-images/")
    ) {
      return true;
    }

    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(normalizedPath);
  }

  private collectVaultContentFiles() {
    return this.app.vault
      .getFiles()
      .filter((file) => !this.shouldSkipContentSyncPath(file.path))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  private buildSyncSignature(file: TFile) {
    return `${file.stat.mtime}:${file.stat.size}`;
  }

  private buildVaultSyncRemotePath(vaultPath: string) {
    return `${this.normalizeFolder(this.settings.vaultSyncRemoteFolder)}${vaultPath}`;
  }

  private async reconcileRemoteImages() {
    const remoteInventory = await this.listRemoteTree(this.settings.remoteFolder);
    const expectedFiles = new Set<string>();
    const imageRoot = this.normalizeFolder(this.settings.remoteFolder);

    for (const refs of this.noteRemoteRefs.values()) {
      for (const remotePath of refs) {
        if (remotePath.startsWith(imageRoot)) {
          expectedFiles.add(remotePath);
        }
      }
    }

    let deletedFiles = 0;
    for (const remotePath of [...remoteInventory.files].sort((a, b) => b.localeCompare(a))) {
      if (expectedFiles.has(remotePath)) {
        continue;
      }

      await this.deleteRemoteContentFile(remotePath);
      deletedFiles += 1;
    }

    const deletedDirectories = await this.deleteExtraRemoteDirectories(
      remoteInventory.directories,
      this.buildExpectedRemoteDirectories(expectedFiles, this.settings.remoteFolder),
    );

    return { deletedFiles, deletedDirectories };
  }

  private parseNoteStub(content: string) {
    const match = content.match(
      /^<!--\s*secure-webdav-note-stub\s*\r?\nremote:\s*(.+?)\r?\nplaceholder:\s*(.*?)\r?\n-->/s,
    );
    if (!match) {
      return null;
    }

    return {
      remotePath: match[1].trim(),
      placeholder: match[2].trim(),
    };
  }

  private buildNoteStub(file: TFile) {
    const remotePath = this.buildVaultSyncRemotePath(file.path);
    return [
      `<!-- ${SECURE_NOTE_STUB}`,
      `remote: ${remotePath}`,
      `placeholder: ${file.basename}`,
      "-->",
      "",
      this.t(
        `这是一篇按需加载笔记的本地占位文件。打开这篇笔记时，插件会从远端同步目录恢复完整内容。`,
        `This is a local placeholder for an on-demand note. Opening the note restores the full content from the remote sync folder.`,
      ),
    ].join("\n");
  }

  private async evictStaleSyncedNotes(showNotice: boolean) {
    try {
      if (this.settings.noteStorageMode !== "lazy-notes") {
        if (showNotice) {
          new Notice(this.t("当前未启用按需加载笔记模式。", "Lazy note mode is not enabled."), 6000);
        }
        return 0;
      }

      const files = this.collectVaultContentFiles().filter((file) => file.extension === "md");
      const now = Date.now();
      const threshold = Math.max(1, this.settings.noteEvictAfterDays) * 24 * 60 * 60 * 1000;
      let evicted = 0;

      for (const file of files) {
        const active = this.app.workspace.getActiveFile();
        if (active?.path === file.path) {
          continue;
        }

        const lastAccess = this.noteAccessTimestamps.get(file.path) ?? 0;
        if (lastAccess !== 0 && now - lastAccess < threshold) {
          continue;
        }

        const content = await this.app.vault.read(file);
        if (this.parseNoteStub(content)) {
          continue;
        }

        const binary = await this.app.vault.readBinary(file);
        const remotePath = this.buildVaultSyncRemotePath(file.path);
        await this.uploadBinary(remotePath, binary, "text/markdown; charset=utf-8");
        await this.app.vault.modify(file, this.buildNoteStub(file));
        evicted += 1;
      }

      if (showNotice) {
        new Notice(
          this.t(
            `已回收 ${evicted} 篇长期未访问的本地笔记。`,
            `Evicted ${evicted} stale local note(s).`,
          ),
          8000,
        );
      }
      await this.savePluginState();
      return evicted;
    } catch (error) {
      console.error("Failed to evict stale synced notes", error);
      if (showNotice) {
        new Notice(this.describeError(this.t("回收本地笔记失败", "Failed to evict local notes"), error), 8000);
      }
      return 0;
    }
  }

  private async ensureRemoteDirectories(remotePath: string) {
    const parts = remotePath.split("/").filter((value) => value.length > 0);
    if (parts.length <= 1) {
      return;
    }

    let current = "";
    for (let index = 0; index < parts.length - 1; index += 1) {
      current = current ? `${current}/${parts[index]}` : parts[index];
      const response = await this.requestUrl({
        url: this.buildUploadUrl(current),
        method: "MKCOL",
        headers: {
          Authorization: this.buildAuthHeader(),
        },
      });

      if (![200, 201, 204, 207, 301, 302, 307, 308, 405].includes(response.status)) {
        throw new Error(`MKCOL failed for ${current} with status ${response.status}`);
      }
    }
  }

  private async listRemoteTree(rootFolder: string): Promise<RemoteInventory> {
    const files = new Set<string>();
    const directories = new Set<string>();
    const pending = [this.normalizeFolder(rootFolder)];
    const visited = new Set<string>();

    while (pending.length > 0) {
      const current = this.normalizeFolder(pending.pop() ?? rootFolder);
      if (visited.has(current)) {
        continue;
      }

      visited.add(current);
      const entries = await this.listRemoteDirectory(current);
      for (const entry of entries) {
        if (entry.isCollection) {
          directories.add(entry.remotePath);
          pending.push(entry.remotePath);
          continue;
        }

        files.add(entry.remotePath);
      }
    }

    return { files, directories };
  }

  private async listRemoteDirectory(remoteDirectory: string) {
    const requestedPath = this.normalizeFolder(remoteDirectory);
    const response = await this.requestUrl({
      url: this.buildUploadUrl(requestedPath),
      method: "PROPFIND",
      headers: {
        Authorization: this.buildAuthHeader(),
        Depth: "1",
      },
    });

    if (response.status === 404) {
      return [] as Array<{ remotePath: string; isCollection: boolean }>;
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`PROPFIND failed for ${requestedPath} with status ${response.status}`);
    }

    const xmlText = this.decodeUtf8(response.arrayBuffer);
    return this.parsePropfindDirectoryListing(xmlText, requestedPath);
  }

  private parsePropfindDirectoryListing(xmlText: string, requestedPath: string) {
    const parser = new DOMParser();
    const document = parser.parseFromString(xmlText, "application/xml");
    if (document.getElementsByTagName("parsererror").length > 0) {
      throw new Error(this.t("无法解析 WebDAV 目录清单。", "Failed to parse the WebDAV directory listing."));
    }

    const entries = new Map<string, { remotePath: string; isCollection: boolean }>();
    for (const element of Array.from(document.getElementsByTagName("*"))) {
      if (element.localName !== "response") {
        continue;
      }

      const href = this.getXmlLocalNameText(element, "href");
      if (!href) {
        continue;
      }

      const remotePath = this.hrefToRemotePath(href);
      if (!remotePath) {
        continue;
      }

      const isCollection = this.xmlTreeHasLocalName(element, "collection");
      const normalizedPath = isCollection ? this.normalizeFolder(remotePath) : remotePath.replace(/\/+$/, "");
      if (
        normalizedPath === requestedPath ||
        normalizedPath === requestedPath.replace(/\/+$/, "")
      ) {
        continue;
      }

      entries.set(normalizedPath, {
        remotePath: normalizedPath,
        isCollection,
      });
    }

    return [...entries.values()];
  }

  private getXmlLocalNameText(parent: Element, localName: string) {
    for (const element of Array.from(parent.getElementsByTagName("*"))) {
      if (element.localName === localName) {
        return element.textContent?.trim() ?? "";
      }
    }

    return "";
  }

  private xmlTreeHasLocalName(parent: Element, localName: string) {
    return Array.from(parent.getElementsByTagName("*")).some((element) => element.localName === localName);
  }

  private hrefToRemotePath(href: string) {
    const baseUrl = `${this.settings.webdavUrl.replace(/\/+$/, "")}/`;
    const resolved = new URL(href, baseUrl);
    const basePath = new URL(baseUrl).pathname.replace(/\/+$/, "/");
    const decodedPath = this.decodePathname(resolved.pathname);
    if (!decodedPath.startsWith(basePath)) {
      return null;
    }

    return decodedPath.slice(basePath.length).replace(/^\/+/, "");
  }

  private decodePathname(pathname: string) {
    return pathname
      .split("/")
      .map((segment) => {
        if (!segment) {
          return "";
        }

        try {
          return decodeURIComponent(segment);
        } catch {
          return segment;
        }
      })
      .join("/");
  }

  private buildExpectedRemoteDirectories(remoteFilePaths: Set<string>, rootFolder: string) {
    const expected = new Set<string>([this.normalizeFolder(rootFolder)]);
    for (const remotePath of remoteFilePaths) {
      const parts = remotePath.split("/").filter((value) => value.length > 0);
      let current = "";
      for (let index = 0; index < parts.length - 1; index += 1) {
        current = current ? `${current}/${parts[index]}` : parts[index];
        expected.add(this.normalizeFolder(current));
      }
    }

    return expected;
  }

  private async deleteExtraRemoteDirectories(remoteDirectories: Set<string>, expectedDirectories: Set<string>) {
    let deleted = 0;
    const candidates = [...remoteDirectories]
      .filter((remotePath) => !expectedDirectories.has(remotePath))
      .sort((a, b) => b.length - a.length || b.localeCompare(a));

    for (const remotePath of candidates) {
      const response = await this.requestUrl({
        url: this.buildUploadUrl(remotePath),
        method: "DELETE",
        headers: {
          Authorization: this.buildAuthHeader(),
        },
      });

      if ([200, 202, 204, 404].includes(response.status)) {
        if (response.status !== 404) {
          deleted += 1;
        }
        continue;
      }

      if ([405, 409].includes(response.status)) {
        continue;
      }

      throw new Error(`DELETE directory failed for ${remotePath} with status ${response.status}`);
    }

    return deleted;
  }

  private async processPendingTasks() {
    if (this.queue.length === 0) {
      return;
    }

    for (const task of [...this.queue]) {
      if (this.processingTaskIds.has(task.id)) {
        continue;
      }

      void this.processTask(task);
    }
  }

  private async uploadImagesInNote(noteFile: TFile) {
    try {
      const content = await this.app.vault.read(noteFile);
      const replacements = await this.buildUploadReplacements(content, noteFile);

      if (replacements.length === 0) {
        new Notice(this.t("当前笔记中没有找到本地图片。", "No local images found in the current note."));
        return;
      }

      let updated = content;
      for (const replacement of replacements) {
        updated = updated.split(replacement.original).join(replacement.rewritten);
      }

      if (updated === content) {
        new Notice(this.t("没有需要改写的图片链接。", "No images were rewritten."));
        return;
      }

      await this.app.vault.modify(noteFile, updated);

      if (this.settings.deleteLocalAfterUpload) {
        for (const replacement of replacements) {
          if (replacement.sourceFile) {
            await this.trashIfExists(replacement.sourceFile);
          }
        }
      }

      new Notice(this.t(`已上传 ${replacements.length} 张图片到 WebDAV。`, `Uploaded ${replacements.length} image(s) to WebDAV.`));
    } catch (error) {
      console.error("Secure WebDAV upload failed", error);
      new Notice(this.describeError(this.t("上传失败", "Upload failed"), error), 8000);
    }
  }

  private async processTask(task: UploadTask) {
    this.processingTaskIds.add(task.id);
    try {
      const binary = this.base64ToArrayBuffer(task.dataBase64);
      const prepared = await this.prepareUploadPayload(
        binary,
        task.mimeType || this.getMimeTypeFromFileName(task.fileName),
        task.fileName,
      );
      const remoteName = await this.buildRemoteFileNameFromBinary(prepared.fileName, prepared.binary);
      const remotePath = this.buildRemotePath(remoteName);
      const response = await this.requestUrl({
        url: this.buildUploadUrl(remotePath),
        method: "PUT",
        headers: {
          Authorization: this.buildAuthHeader(),
          "Content-Type": prepared.mimeType,
        },
        body: prepared.binary,
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      const replaced = await this.replacePlaceholder(
        task.notePath,
        task.id,
        task.placeholder,
        this.buildSecureImageMarkup(`${SECURE_PROTOCOL}//${remotePath}`, prepared.fileName),
      );
      if (!replaced) {
        throw new Error(this.t("上传成功，但没有在笔记中找到可替换的占位符。", "Upload succeeded, but no matching placeholder was found in the note."));
      }

      this.queue = this.queue.filter((item) => item.id !== task.id);
      await this.savePluginState();
      new Notice(this.t("图片上传成功。", "Image uploaded successfully."));
    } catch (error) {
      console.error("Secure WebDAV queued upload failed", error);
      task.attempts += 1;
      task.lastError = error instanceof Error ? error.message : String(error);
      await this.savePluginState();
      if (task.attempts >= this.settings.maxRetryAttempts) {
        await this.replacePlaceholder(task.notePath, task.id, task.placeholder, this.buildFailedPlaceholder(task.fileName, task.lastError));
        this.queue = this.queue.filter((item) => item.id !== task.id);
        await this.savePluginState();
        new Notice(this.describeError(this.t("图片上传最终失败", "Image upload failed permanently"), error), 8000);
      } else {
        this.scheduleRetry(task);
      }
    } finally {
      this.processingTaskIds.delete(task.id);
    }
  }

  private scheduleRetry(task: UploadTask) {
    const existing = this.retryTimeouts.get(task.id);
    if (existing) {
      window.clearTimeout(existing);
    }

    const delay = Math.max(1, this.settings.retryDelaySeconds) * 1000 * task.attempts;
    const timeoutId = window.setTimeout(() => {
      this.retryTimeouts.delete(task.id);
      void this.processTask(task);
    }, delay);
    this.retryTimeouts.set(task.id, timeoutId);
  }

  private async replacePlaceholder(notePath: string, taskId: string, placeholder: string, replacement: string) {
    const replacedInEditor = this.replacePlaceholderInOpenEditors(notePath, taskId, placeholder, replacement);
    if (replacedInEditor) {
      return true;
    }

    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) {
      return false;
    }

    const content = await this.app.vault.read(file);
    if (content.includes(placeholder)) {
      const updated = content.replace(placeholder, replacement);
      if (updated !== content) {
        await this.app.vault.modify(file, updated);
        return true;
      }
    }

    const pattern = new RegExp(`<span[^>]*data-secure-webdav-task="${this.escapeRegExp(taskId)}"[^>]*>.*?<\/span>`, "s");
    if (pattern.test(content)) {
      const updated = content.replace(pattern, replacement);
      if (updated !== content) {
        await this.app.vault.modify(file, updated);
        return true;
      }
    }

    return false;
  }

  private buildFailedPlaceholder(fileName: string, message?: string) {
    const safeName = this.escapeHtml(fileName);
    const safeMessage = this.escapeHtml(message ?? this.t("未知错误", "Unknown error"));
    return `<span class="secure-webdav-failed" aria-label="${safeName}">${this.escapeHtml(this.formatFailedLabel(fileName))}: ${safeMessage}</span>`;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private unescapeHtml(value: string) {
    return value
      .replace(/&quot;/g, "\"")
      .replace(/&gt;/g, ">")
      .replace(/&lt;/g, "<")
      .replace(/&amp;/g, "&");
  }

  private async fetchSecureImageBlobUrl(remotePath: string) {
    const response = await this.requestUrl({
      url: this.buildUploadUrl(remotePath),
      method: "GET",
      headers: {
        Authorization: this.buildAuthHeader(),
      },
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }

    const blob = new Blob([response.arrayBuffer], {
      type: response.headers["content-type"] ?? "application/octet-stream",
    });
    const blobUrl = URL.createObjectURL(blob);
    this.blobUrls.add(blobUrl);
    return blobUrl;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  private buildClipboardFileName(mimeType: string) {
    const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
    return `pasted-image-${Date.now()}.${extension}`;
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private replacePlaceholderInOpenEditors(notePath: string, taskId: string, placeholder: string, replacement: string) {
    let replaced = false;
    const leaves = this.app.workspace.getLeavesOfType("markdown");

    for (const leaf of leaves) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) {
        continue;
      }

      if (!view.file || view.file.path !== notePath) {
        continue;
      }

      const editor = view.editor;
      const content = editor.getValue();
      let updated = content;

      if (content.includes(placeholder)) {
        updated = content.replace(placeholder, replacement);
      } else {
        const pattern = new RegExp(
          `<span[^>]*data-secure-webdav-task="${this.escapeRegExp(taskId)}"[^>]*>.*?<\\/span>`,
          "s",
        );
        updated = content.replace(pattern, replacement);
      }

      if (updated !== content) {
        editor.setValue(updated);
        replaced = true;
      }
    }

    return replaced;
  }

  private async processSecureImages(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
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

  private async processSecureCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const parsed = this.parseSecureImageBlock(source);
    if (!parsed?.path) {
      el.createEl("div", {
        text: this.t("安全图片代码块格式无效。", "Invalid secure image code block format."),
      });
      return;
    }

    const img = document.createElement("img");
    img.alt = parsed.alt || parsed.path;
    img.setAttribute("data-secure-webdav", parsed.path);
    img.classList.add("secure-webdav-image", "is-loading");
    el.empty();
    el.appendChild(img);
    await this.swapImageSource(img);
    ctx.addChild(new SecureWebdavRenderChild(el));
  }

  private parseSecureImageBlock(source: string) {
    const result: { path: string; alt: string } = { path: "", alt: "" };
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

  private async swapImageSource(img: HTMLImageElement) {
    const remotePath =
      img.getAttribute("data-secure-webdav") ?? this.extractRemotePath(img.getAttribute("src") ?? "");
    if (!remotePath) {
      return;
    }

    img.classList.add("secure-webdav-image", "is-loading");
    const originalAlt = img.alt;
    img.alt = originalAlt || this.t("加载安全图片中...", "Loading secure image...");

    try {
      const blobUrl = await this.fetchSecureImageBlobUrl(remotePath);
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

  private extractRemotePath(src: string) {
    const prefix = `${SECURE_PROTOCOL}//`;
    if (!src.startsWith(prefix)) {
      return null;
    }

    return src.slice(prefix.length);
  }

  private buildRemotePath(fileName: string) {
    return `${this.normalizeFolder(this.settings.remoteFolder)}${fileName}`;
  }

  private async buildRemoteFileNameFromBinary(fileName: string, binary: ArrayBuffer) {
    const extension = this.getExtensionFromFileName(fileName);
    if (this.settings.namingStrategy === "hash") {
      const hash = (await this.computeSha256Hex(binary)).slice(0, 16);
      return `${hash}.${extension}`;
    }

    return `${Date.now()}-${fileName}`;
  }

  private buildUploadUrl(remotePath: string) {
    const base = this.settings.webdavUrl.replace(/\/+$/, "");
    return `${base}/${remotePath.split("/").map(encodeURIComponent).join("/")}`;
  }

  private normalizeFolder(input: string) {
    return input.replace(/^\/+/, "").replace(/\/+$/, "") + "/";
  }

  private buildAuthHeader() {
    const token = this.arrayBufferToBase64(this.encodeUtf8(`${this.settings.username}:${this.settings.password}`));
    return `Basic ${token}`;
  }

  private ensureConfigured() {
    if (!this.settings.webdavUrl || !this.settings.username || !this.settings.password) {
      throw new Error(this.t("WebDAV 配置不完整。", "WebDAV settings are incomplete."));
    }
  }

  private getMimeType(extension: string) {
    const normalized = extension.toLowerCase();
    if (normalized === "jpg" || normalized === "jpeg") return "image/jpeg";
    if (normalized === "png") return "image/png";
    if (normalized === "gif") return "image/gif";
    if (normalized === "webp") return "image/webp";
    if (normalized === "svg") return "image/svg+xml";
    if (normalized === "bmp") return "image/bmp";
    return "application/octet-stream";
  }

  private getMimeTypeFromFileName(fileName: string) {
    return this.getMimeType(this.getExtensionFromFileName(fileName));
  }

  private getExtensionFromFileName(fileName: string) {
    const pieces = fileName.split(".");
    return pieces.length > 1 ? pieces[pieces.length - 1].toLowerCase() : "png";
  }

  private async prepareUploadPayload(binary: ArrayBuffer, mimeType: string, fileName: string) {
    if (!this.settings.compressImages) {
      return { binary, mimeType, fileName };
    }

    const prepared = await this.compressImageIfNeeded(binary, mimeType, fileName);
    return prepared ?? { binary, mimeType, fileName };
  }

  private async compressImageIfNeeded(binary: ArrayBuffer, mimeType: string, fileName: string) {
    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(mimeType)) {
      return null;
    }

    const thresholdBytes = this.settings.compressThresholdKb * 1024;
    const sourceBlob = new Blob([binary], { type: mimeType });
    const image = await this.loadImageElement(sourceBlob);
    const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const needsResize = largestSide > this.settings.maxImageDimension;
    const needsCompress = sourceBlob.size > thresholdBytes || needsResize;
    if (!needsCompress) {
      return null;
    }

    const scale = needsResize ? this.settings.maxImageDimension / largestSide : 1;
    const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    const outputMime = mimeType.toLowerCase() === "image/jpg" ? "image/jpeg" : mimeType;
    const quality = Math.max(0.4, Math.min(0.98, this.settings.jpegQuality / 100));
    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outputMime, quality);
    });

    if (!compressedBlob) {
      return null;
    }

    if (!needsResize && compressedBlob.size >= sourceBlob.size) {
      return null;
    }

    const nextBinary = await compressedBlob.arrayBuffer();
    const nextExtension = this.extensionFromMimeType(outputMime) ?? this.getExtensionFromFileName(fileName);
    const nextFileName = fileName.replace(/\.[^.]+$/, "") + `.${nextExtension}`;
    return {
      binary: nextBinary,
      mimeType: outputMime,
      fileName: nextFileName,
    };
  }

  private loadImageElement(blob: Blob) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = (error) => {
        URL.revokeObjectURL(url);
        reject(error);
      };
      image.src = url;
    });
  }

  private extensionFromMimeType(mimeType: string) {
    if (mimeType === "image/jpeg") return "jpg";
    if (mimeType === "image/png") return "png";
    if (mimeType === "image/webp") return "webp";
    return null;
  }

  private async trashIfExists(file: TAbstractFile) {
    try {
      await this.app.vault.trash(file, true);
    } catch (error) {
      console.warn("Failed to trash local image after upload", error);
    }
  }

  private buildSecureImageMarkup(remoteUrl: string, alt: string) {
    const remotePath = this.extractRemotePath(remoteUrl);
    if (!remotePath) {
      return `![](${remoteUrl})`;
    }

    return this.buildSecureImageCodeBlock(remotePath, alt);
  }

  private buildSecureImageCodeBlock(remotePath: string, alt: string) {
    const normalizedAlt = (alt || remotePath).replace(/\r?\n/g, " ").trim();
    const normalizedPath = remotePath.replace(/\r?\n/g, "").trim();
    return [
      `\`\`\`${SECURE_CODE_BLOCK}`,
      `path: ${normalizedPath}`,
      `alt: ${normalizedAlt}`,
      "```",
    ].join("\n");
  }

  private formatEmbedLabel(fileName: string) {
    return this.t(`【安全远程图片｜${fileName}】`, `[Secure remote image | ${fileName}]`);
  }

  private formatFailedLabel(fileName: string) {
    return this.t(`【图片上传失败｜${fileName}】`, `[Image upload failed | ${fileName}]`);
  }

  async migrateAllLegacySecureImages() {
    try {
      const uploadCache = new Map<string, string>();
      const candidateLocalImages = new Map<string, TFile>();
      let changedFiles = 0;
      for (const file of this.app.vault.getMarkdownFiles()) {
        const content = await this.app.vault.read(file);
        const replacements = await this.buildUploadReplacements(content, file, uploadCache);
        for (const replacement of replacements) {
          if (replacement.sourceFile) {
            candidateLocalImages.set(replacement.sourceFile.path, replacement.sourceFile);
          }
        }

        let updated = content;
        for (const replacement of replacements) {
          updated = updated.split(replacement.original).join(replacement.rewritten);
        }

        updated = updated
          .replace(
            /<span class="secure-webdav-embed" data-secure-webdav="([^"]+)" aria-label="([^"]*)">.*?<\/span>/g,
            (_match, remotePath: string, alt: string) =>
              this.buildSecureImageCodeBlock(
                this.unescapeHtml(remotePath),
                this.unescapeHtml(alt) || this.unescapeHtml(remotePath),
              ),
          )
          .replace(
            /!\[[^\]]*]\(webdav-secure:\/\/([^)]+)\)/g,
            (_match, remotePath: string) =>
              this.buildSecureImageCodeBlock(this.unescapeHtml(remotePath), this.unescapeHtml(remotePath)),
          );

        if (updated === content) {
          continue;
        }

        await this.app.vault.modify(file, updated);
        changedFiles += 1;
      }

      if (changedFiles === 0) {
        new Notice(
          this.t(
            "整库里没有发现可迁移的旧版安全图片标签。",
            "No legacy secure image tags were found in the vault.",
          ),
        );
        return;
      }

      if (this.settings.deleteLocalAfterUpload) {
        await this.trashMigratedImagesIfSafe(candidateLocalImages);
      }

      new Notice(
        this.t(
          `已迁移 ${changedFiles} 篇笔记到新的安全图片代码块格式。`,
          `Migrated ${changedFiles} note(s) to the new secure image code-block format.`,
        ),
        8000,
      );
    } catch (error) {
      console.error("Failed to migrate secure images to code blocks", error);
      new Notice(this.describeError(this.t("迁移安全图片格式失败", "Failed to migrate secure image format"), error), 8000);
    }
  }

  private async trashMigratedImagesIfSafe(candidateLocalImages: Map<string, TFile>) {
    if (candidateLocalImages.size === 0) {
      return;
    }

    const remainingRefs = new Set<string>();
    for (const note of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.read(note);
      const wikiMatches = [...content.matchAll(/!\[\[([^\]]+)\]\]/g)];
      const markdownMatches = [...content.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)];

      for (const match of wikiMatches) {
        const rawLink = match[1].split("|")[0].trim();
        const target = this.resolveLinkedFile(rawLink, note.path);
        if (target && this.isImageFile(target)) {
          remainingRefs.add(target.path);
        }
      }

      for (const match of markdownMatches) {
        const rawLink = decodeURIComponent(match[1].trim().replace(/^<|>$/g, ""));
        if (/^(https?:|webdav-secure:|data:)/i.test(rawLink)) {
          continue;
        }

        const target = this.resolveLinkedFile(rawLink, note.path);
        if (target && this.isImageFile(target)) {
          remainingRefs.add(target.path);
        }
      }
    }

    for (const [path, file] of candidateLocalImages.entries()) {
      if (remainingRefs.has(path)) {
        continue;
      }

      await this.trashIfExists(file);
    }
  }

  private buildErrorElement(remotePath: string, error: unknown) {
    const el = document.createElement("div");
    el.className = "secure-webdav-image is-error";
    const message = error instanceof Error ? error.message : String(error);
    el.textContent = this.t(
      `安全图片加载失败：${remotePath}（${message}）`,
      `Secure image failed: ${remotePath} (${message})`,
    );
    return el;
  }

  async runConnectionTest(showModal = false) {
    try {
      this.ensureConfigured();

      const probeName = `.secure-webdav-probe-${Date.now()}.txt`;
      const remotePath = this.buildRemotePath(probeName);
      const uploadUrl = this.buildUploadUrl(remotePath);
      const probeArrayBuffer = this.encodeUtf8(`secure-webdav probe ${new Date().toISOString()}`);

      const putResponse = await this.requestUrl({
        url: uploadUrl,
        method: "PUT",
        headers: {
          Authorization: this.buildAuthHeader(),
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: probeArrayBuffer,
      });
      if (putResponse.status < 200 || putResponse.status >= 300) {
        throw new Error(`PUT failed with status ${putResponse.status}`);
      }

      const getResponse = await this.requestUrl({
        url: uploadUrl,
        method: "GET",
        headers: {
          Authorization: this.buildAuthHeader(),
        },
      });
      if (getResponse.status < 200 || getResponse.status >= 300) {
        throw new Error(`GET failed with status ${getResponse.status}`);
      }

      const deleteResponse = await this.requestUrl({
        url: uploadUrl,
        method: "DELETE",
        headers: {
          Authorization: this.buildAuthHeader(),
        },
      });
      if (deleteResponse.status < 200 || deleteResponse.status >= 300) {
        throw new Error(`DELETE failed with status ${deleteResponse.status}`);
      }

      const message = this.t(
        `WebDAV 测试通过。PUT ${putResponse.status}，GET ${getResponse.status}，DELETE ${deleteResponse.status}。`,
        `WebDAV test passed. PUT ${putResponse.status}, GET ${getResponse.status}, DELETE ${deleteResponse.status}.`,
      );
      new Notice(message, 6000);
      if (showModal) {
        new ResultModal(this.app, this.t("WebDAV 连接", "WebDAV Connection"), message).open();
      }
      return true;
    } catch (error) {
      console.error("Secure WebDAV test failed", error);
      const message = this.describeError(this.t("WebDAV 测试失败", "WebDAV test failed"), error);
      new Notice(message, 8000);
      if (showModal) {
        new ResultModal(this.app, this.t("WebDAV 连接", "WebDAV Connection"), message).open();
      }
      return false;
    }
  }

  private describeError(prefix: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return `${prefix}: ${message}`;
  }

  private async requestUrl(options: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: ArrayBuffer;
    followRedirects?: boolean;
    redirectCount?: number;
  }): Promise<{ status: number; headers: Record<string, string>; arrayBuffer: ArrayBuffer }> {
    const response = await obsidianRequestUrl({
      url: options.url,
      method: options.method,
      headers: options.headers,
      body: options.body,
      throw: false,
    });

    return {
      status: response.status,
      headers: response.headers,
      arrayBuffer: response.arrayBuffer,
    };
  }

  private encodeUtf8(value: string) {
    const bytes = new TextEncoder().encode(value);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  private decodeUtf8(buffer: ArrayBuffer) {
    return new TextDecoder().decode(buffer);
  }

  private async computeSha256Hex(buffer: ArrayBuffer) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }
}

class SecureWebdavRenderChild extends MarkdownRenderChild {
  onunload(): void {}
}

type UploadRewrite = {
  original: string;
  rewritten: string;
  sourceFile?: TFile;
};

class SecureWebdavSettingTab extends PluginSettingTab {
  plugin: SecureWebdavImagesPlugin;

  constructor(app: App, plugin: SecureWebdavImagesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Secure WebDAV Images" });
    containerEl.createEl("p", {
      text: this.plugin.t(
        "这个插件只把图片剥离到单独的远端目录，并保存为 secure-webdav 自定义代码块；其他笔记和附件按原路径原样同步。",
        "This plugin separates only images into a dedicated remote folder and stores them as secure-webdav custom code blocks. Notes and other attachments are synced as-is with their original paths.",
      ),
    });

    containerEl.createEl("h3", { text: this.plugin.t("界面语言", "Interface language") });

    new Setting(containerEl)
      .setName(this.plugin.t("语言", "Language"))
      .setDesc(this.plugin.t("设置页支持自动、中文、英文切换。", "Switch the settings UI between auto, Chinese, and English."))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("auto", this.plugin.t("自动", "Auto"))
          .addOption("zh", "中文")
          .addOption("en", "English")
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value as "auto" | "zh" | "en";
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    containerEl.createEl("h3", { text: this.plugin.t("连接设置", "Connection") });

    new Setting(containerEl)
      .setName(this.plugin.t("WebDAV 基础地址", "WebDAV base URL"))
      .setDesc(this.plugin.t("服务器基础地址，例如：http://your-webdav-host:port", "Base server URL. Example: http://your-webdav-host:port"))
      .addText((text) =>
        text
          .setPlaceholder("http://your-webdav-host:port")
          .setValue(this.plugin.settings.webdavUrl)
          .onChange(async (value) => {
            this.plugin.settings.webdavUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(this.plugin.t("账号", "Username"))
      .addText((text) =>
        text.setValue(this.plugin.settings.username).onChange(async (value) => {
          this.plugin.settings.username = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(this.plugin.t("密码", "Password"))
      .setDesc(this.plugin.t("默认隐藏，可点击右侧按钮显示或隐藏。", "Hidden by default. Use the button on the right to show or hide it."))
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(this.plugin.settings.password).onChange(async (value) => {
          this.plugin.settings.password = value;
          await this.plugin.saveSettings();
        });
      })
      .addExtraButton((button) => {
        let visible = false;
        button.setIcon("eye");
        button.setTooltip(this.plugin.t("显示密码", "Show password"));
        button.onClick(() => {
          const input = button.extraSettingsEl.parentElement?.querySelector("input");
          if (!(input instanceof HTMLInputElement)) {
            return;
          }

          visible = !visible;
          input.type = visible ? "text" : "password";
          button.setIcon(visible ? "eye-off" : "eye");
          button.setTooltip(this.plugin.t(visible ? "隐藏密码" : "显示密码", visible ? "Hide password" : "Show password"));
        });
      });

    new Setting(containerEl)
      .setName(this.plugin.t("图片远程目录", "Image remote folder"))
      .setDesc(
        this.plugin.t(
          "专门用于存放远程图片的 WebDAV 目录，例如：/remote-images/。图片上传成功后会立即删除本地图片文件。",
          "Dedicated WebDAV folder for remote images, for example: /remote-images/. Local image files are deleted immediately after upload succeeds.",
        ),
      )
      .addText((text) =>
        text.setValue(this.plugin.settings.remoteFolder).onChange(async (value) => {
          this.plugin.settings.remoteFolder = normalizePath(value.trim() || "/remote-images/");
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(this.plugin.t("测试连接", "Test connection"))
      .setDesc(this.plugin.t("使用临时探针文件验证 PUT、GET、DELETE 是否正常。", "Verify PUT, GET, and DELETE using a temporary probe file."))
      .addButton((button) =>
        button.setButtonText(this.plugin.t("开始测试", "Run test")).onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.runConnectionTest(true);
          } finally {
            button.setDisabled(false);
          }
        }),
      );

    containerEl.createEl("h3", { text: this.plugin.t("同步设置", "Sync") });

    new Setting(containerEl)
      .setName(this.plugin.t("远程笔记目录", "Remote notes folder"))
      .setDesc(
        this.plugin.t(
          "用于存放笔记和其他非图片附件原样同步副本的远端目录，例如：/vault-sync/。插件会自动同步整个 vault，并跳过 .obsidian、插件目录和图片文件。",
          "Remote folder used for notes and other non-image attachments synced as-is, for example: /vault-sync/. The plugin syncs the whole vault and automatically skips .obsidian, the plugin directory, and image files.",
        ),
      )
      .addText((text) =>
        text.setValue(this.plugin.settings.vaultSyncRemoteFolder).onChange(async (value) => {
          this.plugin.settings.vaultSyncRemoteFolder = normalizePath(value.trim() || "/vault-sync/");
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(this.plugin.t("自动同步频率", "Auto sync frequency"))
      .setDesc(
        this.plugin.t(
          "以分钟为单位设置自动同步时间。填 0 表示关闭自动同步。这里的同步是“对账同步”：会检查本地与远端目录差异，补传新增和变更文件，并删除远端多余内容。",
          "Set the automatic sync interval in minutes. Use 0 to turn it off. This is a reconciliation sync: it checks local and remote differences, uploads new or changed files, and removes extra remote content.",
        ),
      )
      .addText((text) =>
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.settings.autoSyncIntervalMinutes))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isNaN(parsed)) {
              this.plugin.settings.autoSyncIntervalMinutes = Math.max(0, parsed);
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName(this.plugin.t("笔记本地保留模式", "Note local retention mode"))
      .setDesc(
        this.plugin.t(
          "完整本地：笔记始终保留在本地。按需加载笔记：长期未访问的 Markdown 笔记会被替换为本地占位文件，打开时再从远端恢复。",
          "Full local: notes always stay local. Lazy notes: stale Markdown notes are replaced with local placeholder files and restored from remote when opened.",
        ),
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("full-local", this.plugin.t("完整本地", "Full local"))
          .addOption("lazy-notes", this.plugin.t("按需加载笔记", "Lazy notes"))
          .setValue(this.plugin.settings.noteStorageMode)
          .onChange(async (value) => {
            this.plugin.settings.noteStorageMode = value as "full-local" | "lazy-notes";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(this.plugin.t("笔记本地回收天数", "Note eviction days"))
      .setDesc(
        this.plugin.t(
          "仅在“按需加载笔记”模式下生效。超过这个天数未打开的 Markdown 笔记，会在同步后被替换为本地占位文件。",
          "Used only in lazy note mode. Markdown notes not opened within this number of days are replaced with local placeholder files after sync.",
        ),
      )
      .addText((text) =>
        text
          .setPlaceholder("30")
          .setValue(String(this.plugin.settings.noteEvictAfterDays))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isNaN(parsed)) {
              this.plugin.settings.noteEvictAfterDays = Math.max(1, parsed);
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName(this.plugin.t("同步状态", "Sync status"))
      .setDesc(
        this.plugin.t(
          `${this.plugin.formatLastSyncLabel()}\n${this.plugin.formatSyncStatusLabel()}\n${this.plugin.t("说明：立即同步会执行本地与远端的对账，同步笔记与非图片附件，并清理远端冗余文件。图片上传仍由独立队列处理。", "Note: Sync now reconciles local and remote content, syncs notes and non-image attachments, and cleans extra remote files. Image uploads continue to be handled by the separate queue.")}`,
          `${this.plugin.formatLastSyncLabel()}\n${this.plugin.formatSyncStatusLabel()}\n${this.plugin.t("说明：立即同步会执行本地与远端的对账，同步笔记与非图片附件，并清理远端冗余文件。图片上传仍由独立队列处理。", "Note: Sync now reconciles local and remote content, syncs notes and non-image attachments, and cleans extra remote files. Image uploads continue to be handled by the separate queue.")}`,
        ),
      )
      .addButton((button) =>
        button.setButtonText(this.plugin.t("立即同步", "Sync now")).onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.syncConfiguredVaultContent(true);
            this.display();
          } finally {
            button.setDisabled(false);
          }
        }),
      );

    containerEl.createEl("h3", { text: this.plugin.t("一次性工具", "One-time tools") });

    new Setting(containerEl)
      .setName(this.plugin.t("迁移整库原生图片引用", "Migrate native image embeds in vault"))
      .setDesc(
        this.plugin.t(
          "扫描整库所有 Markdown 笔记，把 Obsidian 原生本地图片引用（如 ![]() 和 ![[...]]）上传到远端图片目录，并改写为 secure-webdav 代码块。旧版 span 和早期 webdav-secure 链接也会一并收敛到新格式。",
          "Scan all Markdown notes in the vault, upload native local image embeds (such as ![]() and ![[...]]) to the remote image folder, and rewrite them as secure-webdav code blocks. Legacy span tags and early webdav-secure links are also normalized to the new format.",
        ),
      )
      .addButton((button) =>
        button.setButtonText(this.plugin.t("开始迁移", "Run migration")).onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.migrateAllLegacySecureImages();
          } finally {
            button.setDisabled(false);
          }
        }),
      );
  }
}

class ResultModal extends Modal {
  private readonly titleText: string;
  private readonly bodyText: string;

  constructor(app: App, titleText: string, bodyText: string) {
    super(app);
    this.titleText = titleText;
    this.bodyText = bodyText;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.titleText });
    contentEl.createEl("p", { text: this.bodyText });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

