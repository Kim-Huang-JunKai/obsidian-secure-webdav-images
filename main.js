"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => SecureWebdavImagesPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
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
  jpegQuality: 82
};
var SECURE_PROTOCOL = "webdav-secure:";
var SECURE_CODE_BLOCK = "secure-webdav";
var SECURE_NOTE_STUB = "secure-webdav-note-stub";
var SecureWebdavImagesPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.queue = [];
    this.blobUrls = /* @__PURE__ */ new Set();
    this.processingTaskIds = /* @__PURE__ */ new Set();
    this.retryTimeouts = /* @__PURE__ */ new Map();
    this.noteRemoteRefs = /* @__PURE__ */ new Map();
    this.remoteCleanupInFlight = /* @__PURE__ */ new Set();
    this.noteAccessTimestamps = /* @__PURE__ */ new Map();
    this.syncIndex = /* @__PURE__ */ new Map();
    this.missingLazyRemoteNotes = /* @__PURE__ */ new Map();
    this.lastVaultSyncAt = 0;
    this.lastVaultSyncStatus = "";
    this.syncInProgress = false;
    this.deletionFolderSuffix = ".__secure-webdav-deletions__/";
    this.missingLazyRemoteConfirmations = 2;
  }
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
      }
    });
    this.addCommand({
      id: "test-webdav-connection",
      name: "Test WebDAV connection",
      callback: () => {
        void this.runConnectionTest(true);
      }
    });
    this.addCommand({
      id: "sync-configured-vault-content-to-webdav",
      name: "Sync vault content to WebDAV",
      callback: () => {
        void this.runManualSync();
      }
    });
    const ribbon = this.addRibbonIcon("refresh-cw", this.t("\u7ACB\u5373\u540C\u6B65\u5230 WebDAV", "Sync to WebDAV now"), () => {
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
      })
    );
    this.registerEvent(
      this.app.workspace.on("editor-paste", (evt, editor, info) => {
        void this.handleEditorPaste(evt, editor, info);
      })
    );
    this.registerEvent(
      this.app.workspace.on("editor-drop", (evt, editor, info) => {
        void this.handleEditorDrop(evt, editor, info);
      })
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
      this.noteAccessTimestamps = /* @__PURE__ */ new Map();
      this.syncIndex = /* @__PURE__ */ new Map();
      this.missingLazyRemoteNotes = /* @__PURE__ */ new Map();
      return;
    }
    const candidate = loaded;
    if ("settings" in candidate || "queue" in candidate) {
      this.settings = { ...DEFAULT_SETTINGS, ...candidate.settings ?? {} };
      this.queue = Array.isArray(candidate.queue) ? candidate.queue : [];
      this.noteAccessTimestamps = new Map(
        Object.entries(candidate.noteAccessTimestamps ?? {})
      );
      this.missingLazyRemoteNotes = new Map(
        Object.entries(candidate.missingLazyRemoteNotes ?? {}).filter(([, value]) => {
          if (!value || typeof value !== "object") {
            return false;
          }
          const record = value;
          return typeof record.firstDetectedAt === "number" && typeof record.lastDetectedAt === "number" && typeof record.missCount === "number";
        }).map(([path, value]) => [path, value])
      );
      this.syncIndex = /* @__PURE__ */ new Map();
      for (const [path, rawEntry] of Object.entries(candidate.syncIndex ?? {})) {
        const normalized = this.normalizeSyncIndexEntry(path, rawEntry);
        if (normalized) {
          this.syncIndex.set(path, normalized);
        }
      }
      this.lastVaultSyncAt = typeof candidate.lastVaultSyncAt === "number" ? candidate.lastVaultSyncAt : 0;
      this.lastVaultSyncStatus = typeof candidate.lastVaultSyncStatus === "string" ? candidate.lastVaultSyncStatus : "";
      this.normalizeEffectiveSettings();
      return;
    }
    this.settings = { ...DEFAULT_SETTINGS, ...candidate };
    this.queue = [];
    this.noteAccessTimestamps = /* @__PURE__ */ new Map();
    this.syncIndex = /* @__PURE__ */ new Map();
    this.missingLazyRemoteNotes = /* @__PURE__ */ new Map();
    this.lastVaultSyncAt = 0;
    this.lastVaultSyncStatus = "";
    this.normalizeEffectiveSettings();
  }
  normalizeEffectiveSettings() {
    this.settings.deleteLocalAfterUpload = true;
    this.settings.autoSyncIntervalMinutes = Math.max(0, Math.floor(this.settings.autoSyncIntervalMinutes || 0));
  }
  setupAutoSync() {
    const minutes = this.settings.autoSyncIntervalMinutes;
    if (minutes <= 0) {
      return;
    }
    const intervalMs = minutes * 60 * 1e3;
    this.registerInterval(
      window.setInterval(() => {
        void this.processPendingTasks();
        void this.syncConfiguredVaultContent(false);
      }, intervalMs)
    );
  }
  async savePluginState() {
    await this.saveData({
      settings: this.settings,
      queue: this.queue,
      noteAccessTimestamps: Object.fromEntries(this.noteAccessTimestamps.entries()),
      missingLazyRemoteNotes: Object.fromEntries(this.missingLazyRemoteNotes.entries()),
      syncIndex: Object.fromEntries(this.syncIndex.entries()),
      lastVaultSyncAt: this.lastVaultSyncAt,
      lastVaultSyncStatus: this.lastVaultSyncStatus
    });
  }
  async saveSettings() {
    await this.savePluginState();
  }
  normalizeSyncIndexEntry(vaultPath, rawEntry) {
    if (!rawEntry || typeof rawEntry !== "object") {
      return null;
    }
    const candidate = rawEntry;
    const remotePath = typeof candidate.remotePath === "string" && candidate.remotePath.length > 0 ? candidate.remotePath : this.buildVaultSyncRemotePath(vaultPath);
    const localSignature = typeof candidate.localSignature === "string" ? candidate.localSignature : typeof candidate.signature === "string" ? candidate.signature : "";
    const remoteSignature = typeof candidate.remoteSignature === "string" ? candidate.remoteSignature : typeof candidate.signature === "string" ? candidate.signature : "";
    return {
      localSignature,
      remoteSignature,
      remotePath
    };
  }
  t(zh, en) {
    return this.getLanguage() === "zh" ? zh : en;
  }
  getLanguage() {
    if (this.settings.language === "auto") {
      const locale = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "en";
      return locale.startsWith("zh") ? "zh" : "en";
    }
    return this.settings.language;
  }
  formatLastSyncLabel() {
    if (!this.lastVaultSyncAt) {
      return this.t("\u4E0A\u6B21\u540C\u6B65\uFF1A\u5C1A\u672A\u6267\u884C", "Last sync: not run yet");
    }
    return this.t(
      `\u4E0A\u6B21\u540C\u6B65\uFF1A${new Date(this.lastVaultSyncAt).toLocaleString()}`,
      `Last sync: ${new Date(this.lastVaultSyncAt).toLocaleString()}`
    );
  }
  formatSyncStatusLabel() {
    return this.lastVaultSyncStatus ? this.t(`\u6700\u8FD1\u72B6\u6001\uFF1A${this.lastVaultSyncStatus}`, `Recent status: ${this.lastVaultSyncStatus}`) : this.t("\u6700\u8FD1\u72B6\u6001\uFF1A\u6682\u65E0", "Recent status: none");
  }
  async runManualSync() {
    await this.processPendingTasks();
    await this.syncConfiguredVaultContent(true);
  }
  async rebuildReferenceIndex() {
    const next = /* @__PURE__ */ new Map();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.read(file);
      next.set(file.path, this.extractRemotePathsFromText(content));
    }
    this.noteRemoteRefs = next;
  }
  async handleVaultModify(file) {
    if (!(file instanceof import_obsidian.TFile) || file.extension !== "md") {
      return;
    }
    const content = await this.app.vault.read(file);
    const nextRefs = this.extractRemotePathsFromText(content);
    const previousRefs = this.noteRemoteRefs.get(file.path) ?? /* @__PURE__ */ new Set();
    this.noteRemoteRefs.set(file.path, nextRefs);
    const removed = [...previousRefs].filter((value) => !nextRefs.has(value));
    void removed;
  }
  async handleVaultDelete(file) {
    if (!(file instanceof import_obsidian.TFile)) {
      return;
    }
    if (!this.shouldSkipContentSyncPath(file.path)) {
      await this.writeDeletionTombstone(file.path, this.syncIndex.get(file.path)?.remoteSignature);
      this.syncIndex.delete(file.path);
      await this.savePluginState();
    }
    if (file.extension === "md") {
      const previousRefs = this.noteRemoteRefs.get(file.path) ?? /* @__PURE__ */ new Set();
      this.noteRemoteRefs.delete(file.path);
      void previousRefs;
    }
  }
  async handleVaultRename(file, oldPath) {
    if (!(file instanceof import_obsidian.TFile)) {
      return;
    }
    if (!this.shouldSkipContentSyncPath(oldPath)) {
      await this.writeDeletionTombstone(oldPath, this.syncIndex.get(oldPath)?.remoteSignature);
      this.syncIndex.delete(oldPath);
      await this.savePluginState();
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
  extractRemotePathsFromText(content) {
    const refs = /* @__PURE__ */ new Set();
    const spanRegex = /data-secure-webdav="([^"]+)"/g;
    const protocolRegex = /webdav-secure:\/\/([^\s)"]+)/g;
    const codeBlockRegex = /```secure-webdav\s+([\s\S]*?)```/g;
    let match;
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
  async deleteRemoteIfUnreferenced(remotePath) {
    void remotePath;
  }
  async buildUploadReplacements(content, noteFile, uploadCache) {
    const seen = /* @__PURE__ */ new Map();
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
          sourceFile: file
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
            rewritten: this.buildSecureImageMarkup(remoteUrl, altText)
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
          sourceFile: file
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
        rewritten: this.buildSecureImageMarkup(remoteUrl, altText)
      });
    }
    return [...seen.values()];
  }
  extractMarkdownAltText(markdownImage) {
    const match = markdownImage.match(/^!\[([^\]]*)\]/);
    return match?.[1]?.trim() ?? "";
  }
  extractHtmlImageAltText(htmlImage) {
    const match = htmlImage.match(/\balt=["']([^"']*)["']/i);
    return match ? this.unescapeHtml(match[1].trim()) : "";
  }
  isHttpUrl(value) {
    return /^https?:\/\//i.test(value);
  }
  getDisplayNameFromUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      const fileName = this.sanitizeFileName(url.pathname.split("/").pop() || "");
      if (fileName) {
        return fileName.replace(/\.[^.]+$/, "");
      }
    } catch {
    }
    return this.t("\u7F51\u9875\u56FE\u7247", "Web image");
  }
  resolveLinkedFile(link, sourcePath) {
    const cleaned = link.replace(/#.*/, "").trim();
    const target = this.app.metadataCache.getFirstLinkpathDest(cleaned, sourcePath);
    return target instanceof import_obsidian.TFile ? target : null;
  }
  isImageFile(file) {
    return /^(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.extension);
  }
  async uploadVaultFile(file, uploadCache) {
    if (uploadCache?.has(file.path)) {
      return uploadCache.get(file.path);
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
  async uploadRemoteImageUrl(imageUrl, uploadCache) {
    const cacheKey = `remote:${imageUrl}`;
    if (uploadCache?.has(cacheKey)) {
      return uploadCache.get(cacheKey);
    }
    this.ensureConfigured();
    const response = await this.requestUrl({
      url: imageUrl,
      method: "GET",
      followRedirects: true
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Remote image download failed with status ${response.status}`);
    }
    const contentType = response.headers["content-type"] ?? "";
    if (!this.isImageContentType(contentType) && !this.looksLikeImageUrl(imageUrl)) {
      throw new Error(this.t("\u8FDC\u7A0B\u94FE\u63A5\u4E0D\u662F\u53EF\u8BC6\u522B\u7684\u56FE\u7247\u8D44\u6E90\u3002", "The remote URL does not look like an image resource."));
    }
    const fileName = this.buildRemoteSourceFileName(imageUrl, contentType);
    const prepared = await this.prepareUploadPayload(
      response.arrayBuffer,
      this.normalizeImageMimeType(contentType, fileName),
      fileName
    );
    const remoteName = await this.buildRemoteFileNameFromBinary(prepared.fileName, prepared.binary);
    const remotePath = this.buildRemotePath(remoteName);
    await this.uploadBinary(remotePath, prepared.binary, prepared.mimeType);
    const remoteUrl = `${SECURE_PROTOCOL}//${remotePath}`;
    uploadCache?.set(cacheKey, remoteUrl);
    return remoteUrl;
  }
  isImageContentType(contentType) {
    return /^image\//i.test(contentType.trim());
  }
  looksLikeImageUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url.pathname);
    } catch {
      return false;
    }
  }
  buildRemoteSourceFileName(rawUrl, contentType) {
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
  sanitizeFileName(fileName) {
    return fileName.replace(/[\\/:*?"<>|]+/g, "-").trim();
  }
  getExtensionFromMimeType(contentType) {
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
  normalizeImageMimeType(contentType, fileName) {
    const mimeType = contentType.split(";")[0].trim().toLowerCase();
    if (mimeType && mimeType !== "application/octet-stream") {
      return mimeType;
    }
    return this.getMimeTypeFromFileName(fileName);
  }
  async uploadBinary(remotePath, binary, mimeType) {
    await this.ensureRemoteDirectories(remotePath);
    const response = await this.requestUrl({
      url: this.buildUploadUrl(remotePath),
      method: "PUT",
      headers: {
        Authorization: this.buildAuthHeader(),
        "Content-Type": mimeType
      },
      body: binary
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Upload failed with status ${response.status}`);
    }
  }
  async handleEditorPaste(evt, editor, info) {
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
  async handleEditorDrop(evt, editor, info) {
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
  extractImageFileFromClipboard(evt) {
    const direct = Array.from(evt.clipboardData?.files ?? []).find((file) => file.type.startsWith("image/"));
    if (direct) {
      return direct;
    }
    const item = Array.from(evt.clipboardData?.items ?? []).find((entry) => entry.type.startsWith("image/"));
    return item?.getAsFile() ?? null;
  }
  htmlContainsRemoteImages(html) {
    return /<img\b[^>]*src=["']https?:\/\/[^"']+["'][^>]*>/i.test(html);
  }
  async handleHtmlPasteWithRemoteImages(noteFile, editor, html) {
    try {
      const rendered = await this.convertHtmlClipboardToSecureMarkdown(html, noteFile);
      if (!rendered.trim()) {
        return;
      }
      editor.replaceSelection(rendered);
      new import_obsidian.Notice(this.t("\u5DF2\u5C06\u7F51\u9875\u56FE\u6587\u7C98\u8D34\u5E76\u6293\u53D6\u8FDC\u7A0B\u56FE\u7247\u3002", "Pasted web content and captured remote images."));
    } catch (error) {
      console.error("Failed to paste HTML content with remote images", error);
      new import_obsidian.Notice(
        this.describeError(
          this.t("\u5904\u7406\u7F51\u9875\u56FE\u6587\u7C98\u8D34\u5931\u8D25", "Failed to process pasted web content"),
          error
        ),
        8e3
      );
    }
  }
  async convertHtmlClipboardToSecureMarkdown(html, noteFile) {
    const parser = new DOMParser();
    const document2 = parser.parseFromString(html, "text/html");
    const uploadCache = /* @__PURE__ */ new Map();
    const renderedBlocks = [];
    for (const node of Array.from(document2.body.childNodes)) {
      const block = await this.renderPastedHtmlNode(node, noteFile, uploadCache, 0);
      if (block.trim()) {
        renderedBlocks.push(block.trim());
      }
    }
    return renderedBlocks.join("\n\n") + "\n";
  }
  async renderPastedHtmlNode(node, noteFile, uploadCache, listDepth) {
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
      const items = [];
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
    const inlineTags = /* @__PURE__ */ new Set(["strong", "b", "em", "i", "span", "code", "small", "sup", "sub"]);
    if (inlineTags.has(tag)) {
      return (await this.renderPastedHtmlChildren(node, noteFile, uploadCache, listDepth)).join("");
    }
    const blockTags = /* @__PURE__ */ new Set([
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
      "th"
    ]);
    if (blockTags.has(tag)) {
      const text = (await this.renderPastedHtmlChildren(node, noteFile, uploadCache, listDepth)).join("").trim();
      return text;
    }
    return (await this.renderPastedHtmlChildren(node, noteFile, uploadCache, listDepth)).join("");
  }
  async renderPastedHtmlChildren(element, noteFile, uploadCache, listDepth) {
    const parts = [];
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
  normalizeClipboardText(value) {
    return value.replace(/\s+/g, " ");
  }
  extractImageFileFromDrop(evt) {
    return Array.from(evt.dataTransfer?.files ?? []).find((file) => file.type.startsWith("image/")) ?? null;
  }
  async enqueueEditorImageUpload(noteFile, editor, imageFile, fileName) {
    try {
      const arrayBuffer = await imageFile.arrayBuffer();
      const task = this.createUploadTask(
        noteFile.path,
        arrayBuffer,
        imageFile.type || this.getMimeTypeFromFileName(fileName),
        fileName
      );
      this.insertPlaceholder(editor, task.placeholder);
      this.queue.push(task);
      await this.savePluginState();
      void this.processPendingTasks();
      new import_obsidian.Notice(this.t("\u5DF2\u52A0\u5165\u56FE\u7247\u81EA\u52A8\u4E0A\u4F20\u961F\u5217\u3002", "Image added to the auto-upload queue."));
    } catch (error) {
      console.error("Failed to queue secure image upload", error);
      new import_obsidian.Notice(this.describeError(this.t("\u52A0\u5165\u56FE\u7247\u81EA\u52A8\u4E0A\u4F20\u961F\u5217\u5931\u8D25", "Failed to queue image for auto-upload"), error), 8e3);
    }
  }
  createUploadTask(notePath, binary, mimeType, fileName) {
    const id = `secure-webdav-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      id,
      notePath,
      placeholder: this.buildPendingPlaceholder(id, fileName),
      mimeType,
      fileName,
      dataBase64: this.arrayBufferToBase64(binary),
      attempts: 0,
      createdAt: Date.now()
    };
  }
  buildPendingPlaceholder(taskId, fileName) {
    const safeName = this.escapeHtml(fileName);
    return `<span class="secure-webdav-pending" data-secure-webdav-task="${taskId}" aria-label="${safeName}">${this.escapeHtml(this.t(`\u3010\u56FE\u7247\u4E0A\u4F20\u4E2D\uFF5C${fileName}\u3011`, `[Uploading image | ${fileName}]`))}</span>`;
  }
  insertPlaceholder(editor, placeholder) {
    editor.replaceSelection(`${placeholder}
`);
  }
  async syncConfiguredVaultContent(showNotice = true) {
    if (this.syncInProgress) {
      if (showNotice) {
        new import_obsidian.Notice(this.t("\u540C\u6B65\u6B63\u5728\u8FDB\u884C\u4E2D\u3002", "A sync is already in progress."), 4e3);
      }
      return;
    }
    this.syncInProgress = true;
    try {
      this.ensureConfigured();
      await this.rebuildReferenceIndex();
      const remoteInventory = await this.listRemoteTree(this.settings.vaultSyncRemoteFolder);
      const deletionTombstones = await this.readDeletionTombstones();
      const remoteFiles = remoteInventory.files;
      let restoredFromRemote = 0;
      let deletedRemoteFiles = 0;
      let deletedLocalFiles = 0;
      let deletedLocalStubs = 0;
      let files = this.collectVaultContentFiles();
      let currentPaths = new Set(files.map((file) => file.path));
      for (const path of [...this.syncIndex.keys()]) {
        if (!currentPaths.has(path)) {
          const previous = this.syncIndex.get(path);
          if (!previous) {
            this.syncIndex.delete(path);
            continue;
          }
          const remote = remoteFiles.get(previous.remotePath);
          if (!remote) {
            this.syncIndex.delete(path);
            continue;
          }
          const tombstone = deletionTombstones.get(path);
          if (tombstone && this.isTombstoneAuthoritative(tombstone, remote)) {
            await this.deleteRemoteContentFile(remote.remotePath);
            remoteFiles.delete(remote.remotePath);
            this.syncIndex.delete(path);
            deletedRemoteFiles += 1;
            continue;
          }
          if (tombstone) {
            await this.deleteDeletionTombstone(path);
            deletionTombstones.delete(path);
          }
          if (previous.remoteSignature && previous.remoteSignature !== remote.signature) {
            await this.downloadRemoteFileToVault(path, remote);
            this.syncIndex.set(path, {
              localSignature: remote.signature,
              remoteSignature: remote.signature,
              remotePath: remote.remotePath
            });
            restoredFromRemote += 1;
            continue;
          }
          await this.downloadRemoteFileToVault(path, remote);
          this.syncIndex.set(path, {
            localSignature: remote.signature,
            remoteSignature: remote.signature,
            remotePath: remote.remotePath
          });
          restoredFromRemote += 1;
        }
      }
      let uploaded = 0;
      let skipped = 0;
      let missingRemoteBackedNotes = 0;
      let purgedMissingLazyNotes = 0;
      files = this.collectVaultContentFiles();
      currentPaths = new Set(files.map((file) => file.path));
      for (const remote of [...remoteFiles.values()].sort((a, b) => a.remotePath.localeCompare(b.remotePath))) {
        const vaultPath = this.remotePathToVaultPath(remote.remotePath);
        if (!vaultPath || currentPaths.has(vaultPath)) {
          continue;
        }
        const tombstone = deletionTombstones.get(vaultPath);
        if (tombstone) {
          if (this.isTombstoneAuthoritative(tombstone, remote)) {
            await this.deleteRemoteContentFile(remote.remotePath);
            remoteFiles.delete(remote.remotePath);
            deletedRemoteFiles += 1;
            continue;
          }
          await this.deleteDeletionTombstone(vaultPath);
          deletionTombstones.delete(vaultPath);
        }
        await this.downloadRemoteFileToVault(vaultPath, remote);
        this.syncIndex.set(vaultPath, {
          localSignature: remote.signature,
          remoteSignature: remote.signature,
          remotePath: remote.remotePath
        });
        restoredFromRemote += 1;
      }
      files = this.collectVaultContentFiles();
      currentPaths = new Set(files.map((file) => file.path));
      const localRemotePaths = /* @__PURE__ */ new Set();
      let downloadedOrUpdated = 0;
      for (const file of files) {
        const remotePath = this.buildVaultSyncRemotePath(file.path);
        localRemotePaths.add(remotePath);
        const remote = remoteFiles.get(remotePath);
        const remoteSignature = remote?.signature ?? "";
        const localSignature = this.buildSyncSignature(file);
        const previous = this.syncIndex.get(file.path);
        if (file.extension === "md") {
          const content = await this.app.vault.read(file);
          const stub = this.parseNoteStub(content);
          if (stub) {
            const stubRemote = remoteFiles.get(stub.remotePath);
            const tombstone2 = deletionTombstones.get(file.path);
            if (!stubRemote && tombstone2) {
              await this.removeLocalVaultFile(file);
              this.syncIndex.delete(file.path);
              this.clearMissingLazyRemote(file.path);
              deletedLocalFiles += 1;
              deletedLocalStubs += 1;
              continue;
            }
            if (!stubRemote) {
              const missingRecord = this.markMissingLazyRemote(file.path);
              if (missingRecord.missCount >= this.missingLazyRemoteConfirmations) {
                await this.removeLocalVaultFile(file);
                this.syncIndex.delete(file.path);
                this.clearMissingLazyRemote(file.path);
                deletedLocalFiles += 1;
                deletedLocalStubs += 1;
                purgedMissingLazyNotes += 1;
                continue;
              }
              missingRemoteBackedNotes += 1;
            } else {
              this.clearMissingLazyRemote(file.path);
            }
            this.syncIndex.set(file.path, {
              localSignature,
              remoteSignature: stubRemote?.signature ?? previous?.remoteSignature ?? "",
              remotePath
            });
            skipped += 1;
            continue;
          }
        }
        const tombstone = deletionTombstones.get(file.path);
        const unchangedSinceLastSync = previous ? previous.localSignature === localSignature : false;
        if (tombstone) {
          if (unchangedSinceLastSync && this.shouldDeleteLocalFromTombstone(file, tombstone) && this.isTombstoneAuthoritative(tombstone, remote)) {
            await this.removeLocalVaultFile(file);
            this.syncIndex.delete(file.path);
            deletedLocalFiles += 1;
            if (remote) {
              await this.deleteRemoteContentFile(remote.remotePath);
              remoteFiles.delete(remote.remotePath);
              deletedRemoteFiles += 1;
            }
            continue;
          }
          await this.deleteDeletionTombstone(file.path);
          deletionTombstones.delete(file.path);
        }
        if (!remote) {
          const uploadedRemote2 = await this.uploadContentFileToRemote(file, remotePath);
          this.syncIndex.set(file.path, {
            localSignature,
            remoteSignature: uploadedRemote2.signature,
            remotePath
          });
          remoteFiles.set(remotePath, uploadedRemote2);
          uploaded += 1;
          continue;
        }
        if (!previous) {
          if (localSignature === remoteSignature) {
            this.syncIndex.set(file.path, {
              localSignature,
              remoteSignature,
              remotePath
            });
            await this.deleteDeletionTombstone(file.path);
            skipped += 1;
            continue;
          }
          if (this.shouldDownloadRemoteVersion(file.stat.mtime, remote.lastModified)) {
            await this.downloadRemoteFileToVault(file.path, remote, file);
            const refreshed = this.getVaultFileByPath(file.path);
            this.syncIndex.set(file.path, {
              localSignature: refreshed ? this.buildSyncSignature(refreshed) : remoteSignature,
              remoteSignature,
              remotePath
            });
            downloadedOrUpdated += 1;
            continue;
          }
          const uploadedRemote2 = await this.uploadContentFileToRemote(file, remotePath);
          this.syncIndex.set(file.path, {
            localSignature,
            remoteSignature: uploadedRemote2.signature,
            remotePath
          });
          remoteFiles.set(remotePath, uploadedRemote2);
          await this.deleteDeletionTombstone(file.path);
          uploaded += 1;
          continue;
        }
        const localChanged = previous.localSignature !== localSignature || previous.remotePath !== remotePath;
        const remoteChanged = previous.remoteSignature !== remoteSignature || previous.remotePath !== remotePath;
        if (!localChanged && !remoteChanged) {
          skipped += 1;
          continue;
        }
        if (!localChanged && remoteChanged) {
          await this.downloadRemoteFileToVault(file.path, remote, file);
          const refreshed = this.getVaultFileByPath(file.path);
          this.syncIndex.set(file.path, {
            localSignature: refreshed ? this.buildSyncSignature(refreshed) : remoteSignature,
            remoteSignature,
            remotePath
          });
          downloadedOrUpdated += 1;
          continue;
        }
        if (localChanged && !remoteChanged) {
          const uploadedRemote2 = await this.uploadContentFileToRemote(file, remotePath);
          this.syncIndex.set(file.path, {
            localSignature,
            remoteSignature: uploadedRemote2.signature,
            remotePath
          });
          remoteFiles.set(remotePath, uploadedRemote2);
          await this.deleteDeletionTombstone(file.path);
          uploaded += 1;
          continue;
        }
        if (this.shouldDownloadRemoteVersion(file.stat.mtime, remote.lastModified)) {
          await this.downloadRemoteFileToVault(file.path, remote, file);
          const refreshed = this.getVaultFileByPath(file.path);
          this.syncIndex.set(file.path, {
            localSignature: refreshed ? this.buildSyncSignature(refreshed) : remoteSignature,
            remoteSignature,
            remotePath
          });
          downloadedOrUpdated += 1;
          continue;
        }
        const uploadedRemote = await this.uploadContentFileToRemote(file, remotePath);
        this.syncIndex.set(file.path, {
          localSignature,
          remoteSignature: uploadedRemote.signature,
          remotePath
        });
        remoteFiles.set(remotePath, uploadedRemote);
        await this.deleteDeletionTombstone(file.path);
        uploaded += 1;
      }
      const deletedRemoteDirectories = await this.deleteExtraRemoteDirectories(
        remoteInventory.directories,
        this.buildExpectedRemoteDirectories(localRemotePaths, this.settings.vaultSyncRemoteFolder)
      );
      const imageCleanup = await this.reconcileRemoteImages();
      const evictedNotes = await this.evictStaleSyncedNotes(false);
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.t(
        `\u5DF2\u53CC\u5411\u540C\u6B65\uFF1A\u4E0A\u4F20 ${uploaded} \u4E2A\u6587\u4EF6\uFF0C\u4ECE\u8FDC\u7AEF\u62C9\u53D6 ${restoredFromRemote + downloadedOrUpdated} \u4E2A\u6587\u4EF6\uFF0C\u8DF3\u8FC7 ${skipped} \u4E2A\u672A\u53D8\u5316\u6587\u4EF6\uFF0C\u5220\u9664\u8FDC\u7AEF\u5185\u5BB9 ${deletedRemoteFiles} \u4E2A\u3001\u672C\u5730\u5185\u5BB9 ${deletedLocalFiles} \u4E2A${deletedLocalStubs > 0 ? `\uFF08\u5176\u4E2D\u5931\u6548\u5360\u4F4D\u7B14\u8BB0 ${deletedLocalStubs} \u7BC7\uFF09` : ""}\uFF0C\u6E05\u7406\u8FDC\u7AEF\u7A7A\u76EE\u5F55 ${deletedRemoteDirectories} \u4E2A\uFF0C\u6E05\u7406\u5197\u4F59\u56FE\u7247 ${imageCleanup.deletedFiles} \u5F20\u3001\u76EE\u5F55 ${imageCleanup.deletedDirectories} \u4E2A${evictedNotes > 0 ? `\uFF0C\u56DE\u6536\u672C\u5730\u65E7\u7B14\u8BB0 ${evictedNotes} \u7BC7` : ""}${missingRemoteBackedNotes > 0 ? `\uFF0C\u5E76\u53D1\u73B0 ${missingRemoteBackedNotes} \u7BC7\u6309\u9700\u7B14\u8BB0\u7F3A\u5C11\u8FDC\u7AEF\u6B63\u6587` : ""}${purgedMissingLazyNotes > 0 ? `\uFF0C\u786E\u8BA4\u6E05\u7406\u5931\u6548\u5360\u4F4D\u7B14\u8BB0 ${purgedMissingLazyNotes} \u7BC7` : ""}\u3002`,
        `Bidirectional sync uploaded ${uploaded} file(s), pulled ${restoredFromRemote + downloadedOrUpdated} file(s) from remote, skipped ${skipped} unchanged file(s), deleted ${deletedRemoteFiles} remote content file(s) and ${deletedLocalFiles} local file(s)${deletedLocalStubs > 0 ? ` (including ${deletedLocalStubs} stale stub note(s))` : ""}, removed ${deletedRemoteDirectories} remote director${deletedRemoteDirectories === 1 ? "y" : "ies"}, cleaned ${imageCleanup.deletedFiles} orphaned remote image(s) plus ${imageCleanup.deletedDirectories} director${imageCleanup.deletedDirectories === 1 ? "y" : "ies"}${evictedNotes > 0 ? `, and evicted ${evictedNotes} stale local note(s)` : ""}${missingRemoteBackedNotes > 0 ? `, while detecting ${missingRemoteBackedNotes} lazy note(s) missing their remote content` : ""}${purgedMissingLazyNotes > 0 ? `, and purged ${purgedMissingLazyNotes} confirmed broken lazy placeholder(s)` : ""}.`
      );
      await this.savePluginState();
      if (showNotice) {
        new import_obsidian.Notice(this.lastVaultSyncStatus, 8e3);
      }
    } catch (error) {
      console.error("Vault content sync failed", error);
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.describeError(this.t("\u5185\u5BB9\u540C\u6B65\u5931\u8D25", "Content sync failed"), error);
      await this.savePluginState();
      if (showNotice) {
        new import_obsidian.Notice(this.lastVaultSyncStatus, 8e3);
      }
    } finally {
      this.syncInProgress = false;
    }
  }
  async deleteRemoteContentFile(remotePath) {
    try {
      const response = await this.requestUrl({
        url: this.buildUploadUrl(remotePath),
        method: "DELETE",
        headers: {
          Authorization: this.buildAuthHeader()
        }
      });
      if (response.status !== 404 && (response.status < 200 || response.status >= 300)) {
        throw new Error(`DELETE failed with status ${response.status}`);
      }
    } catch (error) {
      console.error("Failed to delete remote synced content", remotePath, error);
      throw error;
    }
  }
  buildRemoteSyncSignature(remote) {
    return `${remote.lastModified}:${remote.size}`;
  }
  buildDeletionFolder() {
    return `${this.normalizeFolder(this.settings.vaultSyncRemoteFolder).replace(/\/$/, "")}${this.deletionFolderSuffix}`;
  }
  buildDeletionRemotePath(vaultPath) {
    const encoded = this.arrayBufferToBase64(this.encodeUtf8(vaultPath)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    return `${this.buildDeletionFolder()}${encoded}.json`;
  }
  parseDeletionTombstoneBase64(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return this.decodeUtf8(this.base64ToArrayBuffer(padded));
  }
  remoteDeletionPathToVaultPath(remotePath) {
    const root = this.buildDeletionFolder();
    if (!remotePath.startsWith(root) || !remotePath.endsWith(".json")) {
      return null;
    }
    const encoded = remotePath.slice(root.length, -".json".length);
    try {
      return this.parseDeletionTombstoneBase64(encoded);
    } catch {
      return null;
    }
  }
  async writeDeletionTombstone(vaultPath, remoteSignature) {
    const payload = {
      path: vaultPath,
      deletedAt: Date.now(),
      remoteSignature
    };
    await this.uploadBinary(
      this.buildDeletionRemotePath(vaultPath),
      this.encodeUtf8(JSON.stringify(payload)),
      "application/json; charset=utf-8"
    );
  }
  async deleteDeletionTombstone(vaultPath) {
    try {
      await this.deleteRemoteContentFile(this.buildDeletionRemotePath(vaultPath));
    } catch {
    }
  }
  async readDeletionTombstone(vaultPath) {
    const response = await this.requestUrl({
      url: this.buildUploadUrl(this.buildDeletionRemotePath(vaultPath)),
      method: "GET",
      headers: {
        Authorization: this.buildAuthHeader()
      }
    });
    if (response.status === 404) {
      return null;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`GET tombstone failed with status ${response.status}`);
    }
    return this.parseDeletionTombstonePayload(this.decodeUtf8(response.arrayBuffer));
  }
  parseDeletionTombstonePayload(raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.path !== "string" || typeof parsed.deletedAt !== "number") {
        return null;
      }
      if (parsed.remoteSignature !== void 0 && typeof parsed.remoteSignature !== "string") {
        return null;
      }
      return {
        path: parsed.path,
        deletedAt: parsed.deletedAt,
        remoteSignature: parsed.remoteSignature
      };
    } catch {
      return null;
    }
  }
  async readDeletionTombstones() {
    const tombstones = /* @__PURE__ */ new Map();
    const inventory = await this.listRemoteTree(this.buildDeletionFolder());
    for (const remote of inventory.files.values()) {
      const vaultPath = this.remoteDeletionPathToVaultPath(remote.remotePath);
      if (!vaultPath) {
        continue;
      }
      const response = await this.requestUrl({
        url: this.buildUploadUrl(remote.remotePath),
        method: "GET",
        headers: {
          Authorization: this.buildAuthHeader()
        }
      });
      if (response.status < 200 || response.status >= 300) {
        continue;
      }
      const tombstone = this.parseDeletionTombstonePayload(this.decodeUtf8(response.arrayBuffer));
      if (tombstone) {
        tombstones.set(vaultPath, tombstone);
      }
    }
    return tombstones;
  }
  remotePathToVaultPath(remotePath) {
    const root = this.normalizeFolder(this.settings.vaultSyncRemoteFolder);
    if (!remotePath.startsWith(root)) {
      return null;
    }
    return remotePath.slice(root.length).replace(/^\/+/, "");
  }
  shouldDownloadRemoteVersion(localMtime, remoteMtime) {
    return remoteMtime > localMtime + 2e3;
  }
  isTombstoneAuthoritative(tombstone, remote) {
    const graceMs = 5e3;
    if (!remote) {
      return true;
    }
    if (tombstone.remoteSignature) {
      return remote.signature === tombstone.remoteSignature;
    }
    return remote.lastModified <= tombstone.deletedAt + graceMs;
  }
  shouldDeleteLocalFromTombstone(file, tombstone) {
    const graceMs = 5e3;
    return file.stat.mtime <= tombstone.deletedAt + graceMs;
  }
  getVaultFileByPath(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof import_obsidian.TFile ? file : null;
  }
  async removeLocalVaultFile(file) {
    try {
      await this.app.vault.delete(file, true);
    } catch (deleteError) {
      try {
        await this.app.vault.trash(file, true);
      } catch {
        throw deleteError;
      }
    }
  }
  async ensureLocalParentFolders(path) {
    const normalized = (0, import_obsidian.normalizePath)(path);
    const segments = normalized.split("/").filter((value) => value.length > 0);
    if (segments.length <= 1) {
      return;
    }
    let current = "";
    for (let index = 0; index < segments.length - 1; index += 1) {
      current = current ? `${current}/${segments[index]}` : segments[index];
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (!existing) {
        await this.app.vault.createFolder(current);
      }
    }
  }
  async downloadRemoteFileToVault(vaultPath, remote, existingFile) {
    const response = await this.requestUrl({
      url: this.buildUploadUrl(remote.remotePath),
      method: "GET",
      headers: {
        Authorization: this.buildAuthHeader()
      }
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`GET failed with status ${response.status}`);
    }
    await this.ensureLocalParentFolders(vaultPath);
    const current = existingFile ?? this.getVaultFileByPath(vaultPath);
    const options = {
      mtime: remote.lastModified > 0 ? remote.lastModified : Date.now()
    };
    if (!current) {
      if (vaultPath.toLowerCase().endsWith(".md")) {
        await this.app.vault.create(vaultPath, this.decodeUtf8(response.arrayBuffer), options);
      } else {
        await this.app.vault.createBinary(vaultPath, response.arrayBuffer, options);
      }
      return;
    }
    if (current.extension === "md") {
      await this.app.vault.modify(current, this.decodeUtf8(response.arrayBuffer), options);
    } else {
      await this.app.vault.modifyBinary(current, response.arrayBuffer, options);
    }
  }
  async verifyRemoteBinaryRoundTrip(remotePath, expected) {
    const response = await this.requestUrl({
      url: this.buildUploadUrl(remotePath),
      method: "GET",
      headers: {
        Authorization: this.buildAuthHeader()
      }
    });
    if (response.status < 200 || response.status >= 300) {
      return false;
    }
    return this.arrayBuffersEqual(expected, response.arrayBuffer);
  }
  async statRemoteFile(remotePath) {
    const response = await this.requestUrl({
      url: this.buildUploadUrl(remotePath),
      method: "PROPFIND",
      headers: {
        Authorization: this.buildAuthHeader(),
        Depth: "0"
      }
    });
    if (response.status === 404) {
      return null;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`PROPFIND failed for ${remotePath} with status ${response.status}`);
    }
    const xmlText = this.decodeUtf8(response.arrayBuffer);
    const entries = this.parsePropfindDirectoryListing(xmlText, remotePath, true);
    return entries.find((entry) => !entry.isCollection)?.file ?? null;
  }
  async uploadContentFileToRemote(file, remotePath) {
    if (file.extension === "md") {
      const content = await this.app.vault.read(file);
      if (this.parseNoteStub(content)) {
        throw new Error(
          this.t(
            "\u62D2\u7EDD\u628A\u6309\u9700\u52A0\u8F7D\u5360\u4F4D\u7B14\u8BB0\u4E0A\u4F20\u4E3A\u8FDC\u7AEF\u6B63\u6587\u3002",
            "Refusing to upload a lazy-note placeholder as remote note content."
          )
        );
      }
    }
    const binary = await this.app.vault.readBinary(file);
    await this.uploadBinary(remotePath, binary, this.getMimeType(file.extension));
    const remote = await this.statRemoteFile(remotePath);
    if (remote) {
      return remote;
    }
    return {
      remotePath,
      lastModified: file.stat.mtime,
      size: file.stat.size,
      signature: this.buildSyncSignature(file)
    };
  }
  async deleteRemoteSyncedEntry(vaultPath) {
    const existing = this.syncIndex.get(vaultPath);
    const remotePath = existing?.remotePath ?? this.buildVaultSyncRemotePath(vaultPath);
    await this.deleteRemoteContentFile(remotePath);
    this.syncIndex.delete(vaultPath);
    await this.savePluginState();
  }
  async handleFileOpen(file) {
    if (!(file instanceof import_obsidian.TFile) || file.extension !== "md") {
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
      const remote = await this.statRemoteFile(stub.remotePath);
      if (!remote) {
        const tombstone = await this.readDeletionTombstone(file.path);
        if (tombstone) {
          await this.removeLocalVaultFile(file);
          this.syncIndex.delete(file.path);
          this.clearMissingLazyRemote(file.path);
          await this.savePluginState();
          new import_obsidian.Notice(
            this.t(
              `\u8FDC\u7AEF\u6B63\u6587\u4E0D\u5B58\u5728\uFF0C\u5DF2\u79FB\u9664\u672C\u5730\u5360\u4F4D\u7B14\u8BB0\uFF1A${file.basename}`,
              `Remote note missing, removed local placeholder: ${file.basename}`
            ),
            6e3
          );
          return;
        }
        const missingRecord = this.markMissingLazyRemote(file.path);
        if (missingRecord.missCount >= this.missingLazyRemoteConfirmations) {
          await this.removeLocalVaultFile(file);
          this.syncIndex.delete(file.path);
          this.clearMissingLazyRemote(file.path);
          await this.savePluginState();
          new import_obsidian.Notice(
            this.t(
              `\u8FDC\u7AEF\u6B63\u6587\u8FDE\u7EED\u7F3A\u5931\uFF0C\u5DF2\u79FB\u9664\u672C\u5730\u5931\u6548\u5360\u4F4D\u7B14\u8BB0\uFF1A${file.basename}`,
              `Remote note was missing repeatedly, removed local broken placeholder: ${file.basename}`
            ),
            8e3
          );
          return;
        }
        await this.savePluginState();
        new import_obsidian.Notice(this.t("\u8FDC\u7AEF\u6B63\u6587\u4E0D\u5B58\u5728\uFF0C\u5F53\u524D\u5148\u4FDD\u7559\u672C\u5730\u5360\u4F4D\u7B14\u8BB0\u4EE5\u9632\u4E34\u65F6\u5F02\u5E38\uFF1B\u82E5\u518D\u6B21\u786E\u8BA4\u7F3A\u5931\uFF0C\u5C06\u81EA\u52A8\u6E05\u7406\u8BE5\u5360\u4F4D\u3002", "Remote note is missing. The local placeholder was kept for now in case this is transient; it will be cleaned automatically if the remote is still missing on the next confirmation."), 8e3);
        return;
      }
      this.clearMissingLazyRemote(file.path);
      await this.downloadRemoteFileToVault(file.path, remote, file);
      const refreshed = this.getVaultFileByPath(file.path);
      this.syncIndex.set(file.path, {
        localSignature: refreshed ? this.buildSyncSignature(refreshed) : remote.signature,
        remoteSignature: remote.signature,
        remotePath: stub.remotePath
      });
      await this.savePluginState();
      new import_obsidian.Notice(this.t(`\u5DF2\u4ECE\u8FDC\u7AEF\u6062\u590D\u7B14\u8BB0\uFF1A${file.basename}`, `Restored note from remote: ${file.basename}`), 6e3);
    } catch (error) {
      console.error("Failed to hydrate note from remote", error);
      new import_obsidian.Notice(this.describeError(this.t("\u8FDC\u7AEF\u6062\u590D\u7B14\u8BB0\u5931\u8D25", "Failed to restore note from remote"), error), 8e3);
    }
  }
  shouldSkipContentSyncPath(path) {
    const normalizedPath = (0, import_obsidian.normalizePath)(path);
    if (normalizedPath === ".obsidian" || normalizedPath.startsWith(".obsidian/")) {
      return true;
    }
    if (normalizedPath === ".obsidian/plugins/secure-webdav-images" || normalizedPath.startsWith(".obsidian/plugins/secure-webdav-images/")) {
      return true;
    }
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(normalizedPath);
  }
  collectVaultContentFiles() {
    return this.app.vault.getFiles().filter((file) => !this.shouldSkipContentSyncPath(file.path)).sort((a, b) => a.path.localeCompare(b.path));
  }
  buildSyncSignature(file) {
    return `${file.stat.mtime}:${file.stat.size}`;
  }
  buildVaultSyncRemotePath(vaultPath) {
    return `${this.normalizeFolder(this.settings.vaultSyncRemoteFolder)}${vaultPath}`;
  }
  async reconcileRemoteImages() {
    return { deletedFiles: 0, deletedDirectories: 0 };
  }
  markMissingLazyRemote(path) {
    const now = Date.now();
    const previous = this.missingLazyRemoteNotes.get(path);
    const next = previous ? {
      firstDetectedAt: previous.firstDetectedAt,
      lastDetectedAt: now,
      missCount: previous.missCount + 1
    } : {
      firstDetectedAt: now,
      lastDetectedAt: now,
      missCount: 1
    };
    this.missingLazyRemoteNotes.set(path, next);
    return next;
  }
  clearMissingLazyRemote(path) {
    this.missingLazyRemoteNotes.delete(path);
  }
  parseNoteStub(content) {
    const match = content.match(
      /^<!--\s*secure-webdav-note-stub\s*\r?\nremote:\s*(.+?)\r?\nplaceholder:\s*(.*?)\r?\n-->/s
    );
    if (!match) {
      return null;
    }
    return {
      remotePath: match[1].trim(),
      placeholder: match[2].trim()
    };
  }
  buildNoteStub(file) {
    const remotePath = this.buildVaultSyncRemotePath(file.path);
    return [
      `<!-- ${SECURE_NOTE_STUB}`,
      `remote: ${remotePath}`,
      `placeholder: ${file.basename}`,
      "-->",
      "",
      this.t(
        `\u8FD9\u662F\u4E00\u7BC7\u6309\u9700\u52A0\u8F7D\u7B14\u8BB0\u7684\u672C\u5730\u5360\u4F4D\u6587\u4EF6\u3002\u6253\u5F00\u8FD9\u7BC7\u7B14\u8BB0\u65F6\uFF0C\u63D2\u4EF6\u4F1A\u4ECE\u8FDC\u7AEF\u540C\u6B65\u76EE\u5F55\u6062\u590D\u5B8C\u6574\u5185\u5BB9\u3002`,
        `This is a local placeholder for an on-demand note. Opening the note restores the full content from the remote sync folder.`
      )
    ].join("\n");
  }
  async evictStaleSyncedNotes(showNotice) {
    try {
      if (this.settings.noteStorageMode !== "lazy-notes") {
        if (showNotice) {
          new import_obsidian.Notice(this.t("\u5F53\u524D\u672A\u542F\u7528\u6309\u9700\u52A0\u8F7D\u7B14\u8BB0\u6A21\u5F0F\u3002", "Lazy note mode is not enabled."), 6e3);
        }
        return 0;
      }
      const files = this.collectVaultContentFiles().filter((file) => file.extension === "md");
      const now = Date.now();
      const threshold = Math.max(1, this.settings.noteEvictAfterDays) * 24 * 60 * 60 * 1e3;
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
        const verified = await this.verifyRemoteBinaryRoundTrip(remotePath, binary);
        if (!verified) {
          throw new Error(this.t("\u8FDC\u7AEF\u6B63\u6587\u6821\u9A8C\u5931\u8D25\uFF0C\u5DF2\u53D6\u6D88\u56DE\u6536\u672C\u5730\u7B14\u8BB0\u3002", "Remote note verification failed, local note eviction was cancelled."));
        }
        const remote = await this.statRemoteFile(remotePath);
        if (!remote) {
          throw new Error(this.t("\u8FDC\u7AEF\u6B63\u6587\u5143\u6570\u636E\u7F3A\u5931\uFF0C\u5DF2\u53D6\u6D88\u56DE\u6536\u672C\u5730\u7B14\u8BB0\u3002", "Remote note metadata is missing, local note eviction was cancelled."));
        }
        await this.app.vault.modify(file, this.buildNoteStub(file));
        const refreshed = this.getVaultFileByPath(file.path);
        this.syncIndex.set(file.path, {
          localSignature: refreshed ? this.buildSyncSignature(refreshed) : this.buildSyncSignature(file),
          remoteSignature: remote?.signature ?? `${file.stat.mtime}:${binary.byteLength}`,
          remotePath
        });
        evicted += 1;
      }
      if (showNotice) {
        new import_obsidian.Notice(
          this.t(
            `\u5DF2\u56DE\u6536 ${evicted} \u7BC7\u957F\u671F\u672A\u8BBF\u95EE\u7684\u672C\u5730\u7B14\u8BB0\u3002`,
            `Evicted ${evicted} stale local note(s).`
          ),
          8e3
        );
      }
      await this.savePluginState();
      return evicted;
    } catch (error) {
      console.error("Failed to evict stale synced notes", error);
      if (showNotice) {
        new import_obsidian.Notice(this.describeError(this.t("\u56DE\u6536\u672C\u5730\u7B14\u8BB0\u5931\u8D25", "Failed to evict local notes"), error), 8e3);
      }
      return 0;
    }
  }
  async ensureRemoteDirectories(remotePath) {
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
          Authorization: this.buildAuthHeader()
        }
      });
      if (![200, 201, 204, 207, 301, 302, 307, 308, 405].includes(response.status)) {
        throw new Error(`MKCOL failed for ${current} with status ${response.status}`);
      }
    }
  }
  async listRemoteTree(rootFolder) {
    const files = /* @__PURE__ */ new Map();
    const directories = /* @__PURE__ */ new Set();
    const pending = [this.normalizeFolder(rootFolder)];
    const visited = /* @__PURE__ */ new Set();
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
        if (entry.file) {
          files.set(entry.remotePath, entry.file);
        }
      }
    }
    return { files, directories };
  }
  async listRemoteDirectory(remoteDirectory) {
    const requestedPath = this.normalizeFolder(remoteDirectory);
    const response = await this.requestUrl({
      url: this.buildUploadUrl(requestedPath),
      method: "PROPFIND",
      headers: {
        Authorization: this.buildAuthHeader(),
        Depth: "1"
      }
    });
    if (response.status === 404) {
      return [];
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`PROPFIND failed for ${requestedPath} with status ${response.status}`);
    }
    const xmlText = this.decodeUtf8(response.arrayBuffer);
    return this.parsePropfindDirectoryListing(xmlText, requestedPath);
  }
  parsePropfindDirectoryListing(xmlText, requestedPath, includeRequested = false) {
    const parser = new DOMParser();
    const document2 = parser.parseFromString(xmlText, "application/xml");
    if (document2.getElementsByTagName("parsererror").length > 0) {
      throw new Error(this.t("\u65E0\u6CD5\u89E3\u6790 WebDAV \u76EE\u5F55\u6E05\u5355\u3002", "Failed to parse the WebDAV directory listing."));
    }
    const entries = /* @__PURE__ */ new Map();
    for (const element of Array.from(document2.getElementsByTagName("*"))) {
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
      if (!includeRequested && (normalizedPath === requestedPath || normalizedPath === requestedPath.replace(/\/+$/, ""))) {
        continue;
      }
      const sizeText = this.getXmlLocalNameText(element, "getcontentlength");
      const parsedSize = Number.parseInt(sizeText, 10);
      const size = Number.isFinite(parsedSize) ? parsedSize : 0;
      const modifiedText = this.getXmlLocalNameText(element, "getlastmodified");
      const parsedMtime = Date.parse(modifiedText);
      const lastModified = Number.isFinite(parsedMtime) ? parsedMtime : 0;
      entries.set(normalizedPath, {
        remotePath: normalizedPath,
        isCollection,
        file: isCollection ? void 0 : {
          remotePath: normalizedPath,
          lastModified,
          size,
          signature: this.buildRemoteSyncSignature({
            lastModified,
            size
          })
        }
      });
    }
    return [...entries.values()];
  }
  getXmlLocalNameText(parent, localName) {
    for (const element of Array.from(parent.getElementsByTagName("*"))) {
      if (element.localName === localName) {
        return element.textContent?.trim() ?? "";
      }
    }
    return "";
  }
  xmlTreeHasLocalName(parent, localName) {
    return Array.from(parent.getElementsByTagName("*")).some((element) => element.localName === localName);
  }
  hrefToRemotePath(href) {
    const baseUrl = `${this.settings.webdavUrl.replace(/\/+$/, "")}/`;
    const resolved = new URL(href, baseUrl);
    const basePath = new URL(baseUrl).pathname.replace(/\/+$/, "/");
    const decodedPath = this.decodePathname(resolved.pathname);
    if (!decodedPath.startsWith(basePath)) {
      return null;
    }
    return decodedPath.slice(basePath.length).replace(/^\/+/, "");
  }
  decodePathname(pathname) {
    return pathname.split("/").map((segment) => {
      if (!segment) {
        return "";
      }
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    }).join("/");
  }
  buildExpectedRemoteDirectories(remoteFilePaths, rootFolder) {
    const expected = /* @__PURE__ */ new Set([this.normalizeFolder(rootFolder)]);
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
  async deleteExtraRemoteDirectories(remoteDirectories, expectedDirectories) {
    let deleted = 0;
    const candidates = [...remoteDirectories].filter((remotePath) => !expectedDirectories.has(remotePath)).sort((a, b) => b.length - a.length || b.localeCompare(a));
    for (const remotePath of candidates) {
      const response = await this.requestUrl({
        url: this.buildUploadUrl(remotePath),
        method: "DELETE",
        headers: {
          Authorization: this.buildAuthHeader()
        }
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
  async processPendingTasks() {
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
  async uploadImagesInNote(noteFile) {
    try {
      const content = await this.app.vault.read(noteFile);
      const replacements = await this.buildUploadReplacements(content, noteFile);
      if (replacements.length === 0) {
        new import_obsidian.Notice(this.t("\u5F53\u524D\u7B14\u8BB0\u4E2D\u6CA1\u6709\u627E\u5230\u672C\u5730\u56FE\u7247\u3002", "No local images found in the current note."));
        return;
      }
      let updated = content;
      for (const replacement of replacements) {
        updated = updated.split(replacement.original).join(replacement.rewritten);
      }
      if (updated === content) {
        new import_obsidian.Notice(this.t("\u6CA1\u6709\u9700\u8981\u6539\u5199\u7684\u56FE\u7247\u94FE\u63A5\u3002", "No images were rewritten."));
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
      new import_obsidian.Notice(this.t(`\u5DF2\u4E0A\u4F20 ${replacements.length} \u5F20\u56FE\u7247\u5230 WebDAV\u3002`, `Uploaded ${replacements.length} image(s) to WebDAV.`));
    } catch (error) {
      console.error("Secure WebDAV upload failed", error);
      new import_obsidian.Notice(this.describeError(this.t("\u4E0A\u4F20\u5931\u8D25", "Upload failed"), error), 8e3);
    }
  }
  async processTask(task) {
    this.processingTaskIds.add(task.id);
    try {
      const binary = this.base64ToArrayBuffer(task.dataBase64);
      const prepared = await this.prepareUploadPayload(
        binary,
        task.mimeType || this.getMimeTypeFromFileName(task.fileName),
        task.fileName
      );
      const remoteName = await this.buildRemoteFileNameFromBinary(prepared.fileName, prepared.binary);
      const remotePath = this.buildRemotePath(remoteName);
      const response = await this.requestUrl({
        url: this.buildUploadUrl(remotePath),
        method: "PUT",
        headers: {
          Authorization: this.buildAuthHeader(),
          "Content-Type": prepared.mimeType
        },
        body: prepared.binary
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Upload failed with status ${response.status}`);
      }
      const replaced = await this.replacePlaceholder(
        task.notePath,
        task.id,
        task.placeholder,
        this.buildSecureImageMarkup(`${SECURE_PROTOCOL}//${remotePath}`, prepared.fileName)
      );
      if (!replaced) {
        throw new Error(this.t("\u4E0A\u4F20\u6210\u529F\uFF0C\u4F46\u6CA1\u6709\u5728\u7B14\u8BB0\u4E2D\u627E\u5230\u53EF\u66FF\u6362\u7684\u5360\u4F4D\u7B26\u3002", "Upload succeeded, but no matching placeholder was found in the note."));
      }
      this.queue = this.queue.filter((item) => item.id !== task.id);
      await this.savePluginState();
      new import_obsidian.Notice(this.t("\u56FE\u7247\u4E0A\u4F20\u6210\u529F\u3002", "Image uploaded successfully."));
    } catch (error) {
      console.error("Secure WebDAV queued upload failed", error);
      task.attempts += 1;
      task.lastError = error instanceof Error ? error.message : String(error);
      await this.savePluginState();
      if (task.attempts >= this.settings.maxRetryAttempts) {
        await this.replacePlaceholder(task.notePath, task.id, task.placeholder, this.buildFailedPlaceholder(task.fileName, task.lastError));
        this.queue = this.queue.filter((item) => item.id !== task.id);
        await this.savePluginState();
        new import_obsidian.Notice(this.describeError(this.t("\u56FE\u7247\u4E0A\u4F20\u6700\u7EC8\u5931\u8D25", "Image upload failed permanently"), error), 8e3);
      } else {
        this.scheduleRetry(task);
      }
    } finally {
      this.processingTaskIds.delete(task.id);
    }
  }
  scheduleRetry(task) {
    const existing = this.retryTimeouts.get(task.id);
    if (existing) {
      window.clearTimeout(existing);
    }
    const delay = Math.max(1, this.settings.retryDelaySeconds) * 1e3 * task.attempts;
    const timeoutId = window.setTimeout(() => {
      this.retryTimeouts.delete(task.id);
      void this.processTask(task);
    }, delay);
    this.retryTimeouts.set(task.id, timeoutId);
  }
  async replacePlaceholder(notePath, taskId, placeholder, replacement) {
    const replacedInEditor = this.replacePlaceholderInOpenEditors(notePath, taskId, placeholder, replacement);
    if (replacedInEditor) {
      return true;
    }
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof import_obsidian.TFile)) {
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
    const pattern = new RegExp(`<span[^>]*data-secure-webdav-task="${this.escapeRegExp(taskId)}"[^>]*>.*?</span>`, "s");
    if (pattern.test(content)) {
      const updated = content.replace(pattern, replacement);
      if (updated !== content) {
        await this.app.vault.modify(file, updated);
        return true;
      }
    }
    return false;
  }
  buildFailedPlaceholder(fileName, message) {
    const safeName = this.escapeHtml(fileName);
    const safeMessage = this.escapeHtml(message ?? this.t("\u672A\u77E5\u9519\u8BEF", "Unknown error"));
    return `<span class="secure-webdav-failed" aria-label="${safeName}">${this.escapeHtml(this.formatFailedLabel(fileName))}: ${safeMessage}</span>`;
  }
  escapeHtml(value) {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  unescapeHtml(value) {
    return value.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
  }
  async fetchSecureImageBlobUrl(remotePath) {
    const response = await this.requestUrl({
      url: this.buildUploadUrl(remotePath),
      method: "GET",
      headers: {
        Authorization: this.buildAuthHeader()
      }
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }
    const blob = new Blob([response.arrayBuffer], {
      type: response.headers["content-type"] ?? "application/octet-stream"
    });
    const blobUrl = URL.createObjectURL(blob);
    this.blobUrls.add(blobUrl);
    return blobUrl;
  }
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 32768;
    let binary = "";
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }
  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  arrayBuffersEqual(left, right) {
    const a = new Uint8Array(left);
    const b = new Uint8Array(right);
    if (a.length !== b.length) {
      return false;
    }
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) {
        return false;
      }
    }
    return true;
  }
  buildClipboardFileName(mimeType) {
    const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
    return `pasted-image-${Date.now()}.${extension}`;
  }
  escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  replacePlaceholderInOpenEditors(notePath, taskId, placeholder, replacement) {
    let replaced = false;
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const view = leaf.view;
      if (!(view instanceof import_obsidian.MarkdownView)) {
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
          "s"
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
  async processSecureImages(el, ctx) {
    const secureNodes = Array.from(el.querySelectorAll("[data-secure-webdav]"));
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
      })
    );
    const secureLinks = Array.from(el.querySelectorAll(`img[src^="${SECURE_PROTOCOL}//"]`));
    await Promise.all(secureLinks.map(async (img) => this.swapImageSource(img)));
    ctx.addChild(new SecureWebdavRenderChild(el));
  }
  async processSecureCodeBlock(source, el, ctx) {
    const parsed = this.parseSecureImageBlock(source);
    if (!parsed?.path) {
      el.createEl("div", {
        text: this.t("\u5B89\u5168\u56FE\u7247\u4EE3\u7801\u5757\u683C\u5F0F\u65E0\u6548\u3002", "Invalid secure image code block format.")
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
  parseSecureImageBlock(source) {
    const result = { path: "", alt: "" };
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
  async swapImageSource(img) {
    const remotePath = img.getAttribute("data-secure-webdav") ?? this.extractRemotePath(img.getAttribute("src") ?? "");
    if (!remotePath) {
      return;
    }
    img.classList.add("secure-webdav-image", "is-loading");
    const originalAlt = img.alt;
    img.alt = originalAlt || this.t("\u52A0\u8F7D\u5B89\u5168\u56FE\u7247\u4E2D...", "Loading secure image...");
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
  extractRemotePath(src) {
    const prefix = `${SECURE_PROTOCOL}//`;
    if (!src.startsWith(prefix)) {
      return null;
    }
    return src.slice(prefix.length);
  }
  buildRemotePath(fileName) {
    return `${this.normalizeFolder(this.settings.remoteFolder)}${fileName}`;
  }
  async buildRemoteFileNameFromBinary(fileName, binary) {
    const extension = this.getExtensionFromFileName(fileName);
    if (this.settings.namingStrategy === "hash") {
      const hash = (await this.computeSha256Hex(binary)).slice(0, 16);
      return `${hash}.${extension}`;
    }
    return `${Date.now()}-${fileName}`;
  }
  buildUploadUrl(remotePath) {
    const base = this.settings.webdavUrl.replace(/\/+$/, "");
    return `${base}/${remotePath.split("/").map(encodeURIComponent).join("/")}`;
  }
  normalizeFolder(input) {
    return input.replace(/^\/+/, "").replace(/\/+$/, "") + "/";
  }
  buildAuthHeader() {
    const token = this.arrayBufferToBase64(this.encodeUtf8(`${this.settings.username}:${this.settings.password}`));
    return `Basic ${token}`;
  }
  ensureConfigured() {
    if (!this.settings.webdavUrl || !this.settings.username || !this.settings.password) {
      throw new Error(this.t("WebDAV \u914D\u7F6E\u4E0D\u5B8C\u6574\u3002", "WebDAV settings are incomplete."));
    }
  }
  getMimeType(extension) {
    const normalized = extension.toLowerCase();
    if (normalized === "jpg" || normalized === "jpeg") return "image/jpeg";
    if (normalized === "png") return "image/png";
    if (normalized === "gif") return "image/gif";
    if (normalized === "webp") return "image/webp";
    if (normalized === "svg") return "image/svg+xml";
    if (normalized === "bmp") return "image/bmp";
    return "application/octet-stream";
  }
  getMimeTypeFromFileName(fileName) {
    return this.getMimeType(this.getExtensionFromFileName(fileName));
  }
  getExtensionFromFileName(fileName) {
    const pieces = fileName.split(".");
    return pieces.length > 1 ? pieces[pieces.length - 1].toLowerCase() : "png";
  }
  async prepareUploadPayload(binary, mimeType, fileName) {
    if (!this.settings.compressImages) {
      return { binary, mimeType, fileName };
    }
    const prepared = await this.compressImageIfNeeded(binary, mimeType, fileName);
    return prepared ?? { binary, mimeType, fileName };
  }
  async compressImageIfNeeded(binary, mimeType, fileName) {
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
    const compressedBlob = await new Promise((resolve) => {
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
      fileName: nextFileName
    };
  }
  loadImageElement(blob) {
    return new Promise((resolve, reject) => {
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
  extensionFromMimeType(mimeType) {
    if (mimeType === "image/jpeg") return "jpg";
    if (mimeType === "image/png") return "png";
    if (mimeType === "image/webp") return "webp";
    return null;
  }
  async trashIfExists(file) {
    try {
      await this.app.vault.trash(file, true);
    } catch (error) {
      console.warn("Failed to trash local image after upload", error);
    }
  }
  buildSecureImageMarkup(remoteUrl, alt) {
    const remotePath = this.extractRemotePath(remoteUrl);
    if (!remotePath) {
      return `![](${remoteUrl})`;
    }
    return this.buildSecureImageCodeBlock(remotePath, alt);
  }
  buildSecureImageCodeBlock(remotePath, alt) {
    const normalizedAlt = (alt || remotePath).replace(/\r?\n/g, " ").trim();
    const normalizedPath = remotePath.replace(/\r?\n/g, "").trim();
    return [
      `\`\`\`${SECURE_CODE_BLOCK}`,
      `path: ${normalizedPath}`,
      `alt: ${normalizedAlt}`,
      "```"
    ].join("\n");
  }
  formatEmbedLabel(fileName) {
    return this.t(`\u3010\u5B89\u5168\u8FDC\u7A0B\u56FE\u7247\uFF5C${fileName}\u3011`, `[Secure remote image | ${fileName}]`);
  }
  formatFailedLabel(fileName) {
    return this.t(`\u3010\u56FE\u7247\u4E0A\u4F20\u5931\u8D25\uFF5C${fileName}\u3011`, `[Image upload failed | ${fileName}]`);
  }
  async migrateAllLegacySecureImages() {
    try {
      const uploadCache = /* @__PURE__ */ new Map();
      const candidateLocalImages = /* @__PURE__ */ new Map();
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
        updated = updated.replace(
          /<span class="secure-webdav-embed" data-secure-webdav="([^"]+)" aria-label="([^"]*)">.*?<\/span>/g,
          (_match, remotePath, alt) => this.buildSecureImageCodeBlock(
            this.unescapeHtml(remotePath),
            this.unescapeHtml(alt) || this.unescapeHtml(remotePath)
          )
        ).replace(
          /!\[[^\]]*]\(webdav-secure:\/\/([^)]+)\)/g,
          (_match, remotePath) => this.buildSecureImageCodeBlock(this.unescapeHtml(remotePath), this.unescapeHtml(remotePath))
        );
        if (updated === content) {
          continue;
        }
        await this.app.vault.modify(file, updated);
        changedFiles += 1;
      }
      if (changedFiles === 0) {
        new import_obsidian.Notice(
          this.t(
            "\u6574\u5E93\u91CC\u6CA1\u6709\u53D1\u73B0\u53EF\u8FC1\u79FB\u7684\u65E7\u7248\u5B89\u5168\u56FE\u7247\u6807\u7B7E\u3002",
            "No legacy secure image tags were found in the vault."
          )
        );
        return;
      }
      if (this.settings.deleteLocalAfterUpload) {
        await this.trashMigratedImagesIfSafe(candidateLocalImages);
      }
      new import_obsidian.Notice(
        this.t(
          `\u5DF2\u8FC1\u79FB ${changedFiles} \u7BC7\u7B14\u8BB0\u5230\u65B0\u7684\u5B89\u5168\u56FE\u7247\u4EE3\u7801\u5757\u683C\u5F0F\u3002`,
          `Migrated ${changedFiles} note(s) to the new secure image code-block format.`
        ),
        8e3
      );
    } catch (error) {
      console.error("Failed to migrate secure images to code blocks", error);
      new import_obsidian.Notice(this.describeError(this.t("\u8FC1\u79FB\u5B89\u5168\u56FE\u7247\u683C\u5F0F\u5931\u8D25", "Failed to migrate secure image format"), error), 8e3);
    }
  }
  async trashMigratedImagesIfSafe(candidateLocalImages) {
    if (candidateLocalImages.size === 0) {
      return;
    }
    const remainingRefs = /* @__PURE__ */ new Set();
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
  buildErrorElement(remotePath, error) {
    const el = document.createElement("div");
    el.className = "secure-webdav-image is-error";
    const message = error instanceof Error ? error.message : String(error);
    el.textContent = this.t(
      `\u5B89\u5168\u56FE\u7247\u52A0\u8F7D\u5931\u8D25\uFF1A${remotePath}\uFF08${message}\uFF09`,
      `Secure image failed: ${remotePath} (${message})`
    );
    return el;
  }
  async runConnectionTest(showModal = false) {
    try {
      this.ensureConfigured();
      const probeName = `.secure-webdav-probe-${Date.now()}.txt`;
      const remotePath = this.buildRemotePath(probeName);
      const uploadUrl = this.buildUploadUrl(remotePath);
      const probeArrayBuffer = this.encodeUtf8(`secure-webdav probe ${(/* @__PURE__ */ new Date()).toISOString()}`);
      const putResponse = await this.requestUrl({
        url: uploadUrl,
        method: "PUT",
        headers: {
          Authorization: this.buildAuthHeader(),
          "Content-Type": "text/plain; charset=utf-8"
        },
        body: probeArrayBuffer
      });
      if (putResponse.status < 200 || putResponse.status >= 300) {
        throw new Error(`PUT failed with status ${putResponse.status}`);
      }
      const getResponse = await this.requestUrl({
        url: uploadUrl,
        method: "GET",
        headers: {
          Authorization: this.buildAuthHeader()
        }
      });
      if (getResponse.status < 200 || getResponse.status >= 300) {
        throw new Error(`GET failed with status ${getResponse.status}`);
      }
      const deleteResponse = await this.requestUrl({
        url: uploadUrl,
        method: "DELETE",
        headers: {
          Authorization: this.buildAuthHeader()
        }
      });
      if (deleteResponse.status < 200 || deleteResponse.status >= 300) {
        throw new Error(`DELETE failed with status ${deleteResponse.status}`);
      }
      const message = this.t(
        `WebDAV \u6D4B\u8BD5\u901A\u8FC7\u3002PUT ${putResponse.status}\uFF0CGET ${getResponse.status}\uFF0CDELETE ${deleteResponse.status}\u3002`,
        `WebDAV test passed. PUT ${putResponse.status}, GET ${getResponse.status}, DELETE ${deleteResponse.status}.`
      );
      new import_obsidian.Notice(message, 6e3);
      if (showModal) {
        new ResultModal(this.app, this.t("WebDAV \u8FDE\u63A5", "WebDAV Connection"), message).open();
      }
      return true;
    } catch (error) {
      console.error("Secure WebDAV test failed", error);
      const message = this.describeError(this.t("WebDAV \u6D4B\u8BD5\u5931\u8D25", "WebDAV test failed"), error);
      new import_obsidian.Notice(message, 8e3);
      if (showModal) {
        new ResultModal(this.app, this.t("WebDAV \u8FDE\u63A5", "WebDAV Connection"), message).open();
      }
      return false;
    }
  }
  describeError(prefix, error) {
    const message = error instanceof Error ? error.message : String(error);
    return `${prefix}: ${message}`;
  }
  async requestUrl(options) {
    const response = await (0, import_obsidian.requestUrl)({
      url: options.url,
      method: options.method,
      headers: options.headers,
      body: options.body,
      throw: false
    });
    return {
      status: response.status,
      headers: response.headers,
      arrayBuffer: response.arrayBuffer
    };
  }
  encodeUtf8(value) {
    const bytes = new TextEncoder().encode(value);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  decodeUtf8(buffer) {
    return new TextDecoder().decode(buffer);
  }
  async computeSha256Hex(buffer) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
  }
};
var SecureWebdavRenderChild = class extends import_obsidian.MarkdownRenderChild {
  onunload() {
  }
};
var SecureWebdavSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Secure WebDAV Images" });
    containerEl.createEl("p", {
      text: this.plugin.t(
        "\u8FD9\u4E2A\u63D2\u4EF6\u53EA\u628A\u56FE\u7247\u5265\u79BB\u5230\u5355\u72EC\u7684\u8FDC\u7AEF\u76EE\u5F55\uFF0C\u5E76\u4FDD\u5B58\u4E3A secure-webdav \u81EA\u5B9A\u4E49\u4EE3\u7801\u5757\uFF1B\u5176\u4ED6\u7B14\u8BB0\u548C\u9644\u4EF6\u6309\u539F\u8DEF\u5F84\u539F\u6837\u540C\u6B65\u3002",
        "This plugin separates only images into a dedicated remote folder and stores them as secure-webdav custom code blocks. Notes and other attachments are synced as-is with their original paths."
      )
    });
    containerEl.createEl("h3", { text: this.plugin.t("\u754C\u9762\u8BED\u8A00", "Interface language") });
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("\u8BED\u8A00", "Language")).setDesc(this.plugin.t("\u8BBE\u7F6E\u9875\u652F\u6301\u81EA\u52A8\u3001\u4E2D\u6587\u3001\u82F1\u6587\u5207\u6362\u3002", "Switch the settings UI between auto, Chinese, and English.")).addDropdown(
      (dropdown) => dropdown.addOption("auto", this.plugin.t("\u81EA\u52A8", "Auto")).addOption("zh", "\u4E2D\u6587").addOption("en", "English").setValue(this.plugin.settings.language).onChange(async (value) => {
        this.plugin.settings.language = value;
        await this.plugin.saveSettings();
        this.display();
      })
    );
    containerEl.createEl("h3", { text: this.plugin.t("\u8FDE\u63A5\u8BBE\u7F6E", "Connection") });
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("WebDAV \u57FA\u7840\u5730\u5740", "WebDAV base URL")).setDesc(this.plugin.t("\u670D\u52A1\u5668\u57FA\u7840\u5730\u5740\uFF0C\u4F8B\u5982\uFF1Ahttp://your-webdav-host:port", "Base server URL. Example: http://your-webdav-host:port")).addText(
      (text) => text.setPlaceholder("http://your-webdav-host:port").setValue(this.plugin.settings.webdavUrl).onChange(async (value) => {
        this.plugin.settings.webdavUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("\u8D26\u53F7", "Username")).addText(
      (text) => text.setValue(this.plugin.settings.username).onChange(async (value) => {
        this.plugin.settings.username = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("\u5BC6\u7801", "Password")).setDesc(this.plugin.t("\u9ED8\u8BA4\u9690\u85CF\uFF0C\u53EF\u70B9\u51FB\u53F3\u4FA7\u6309\u94AE\u663E\u793A\u6216\u9690\u85CF\u3002", "Hidden by default. Use the button on the right to show or hide it.")).addText((text) => {
      text.inputEl.type = "password";
      text.setValue(this.plugin.settings.password).onChange(async (value) => {
        this.plugin.settings.password = value;
        await this.plugin.saveSettings();
      });
    }).addExtraButton((button) => {
      let visible = false;
      button.setIcon("eye");
      button.setTooltip(this.plugin.t("\u663E\u793A\u5BC6\u7801", "Show password"));
      button.onClick(() => {
        const input = button.extraSettingsEl.parentElement?.querySelector("input");
        if (!(input instanceof HTMLInputElement)) {
          return;
        }
        visible = !visible;
        input.type = visible ? "text" : "password";
        button.setIcon(visible ? "eye-off" : "eye");
        button.setTooltip(this.plugin.t(visible ? "\u9690\u85CF\u5BC6\u7801" : "\u663E\u793A\u5BC6\u7801", visible ? "Hide password" : "Show password"));
      });
    });
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("\u56FE\u7247\u8FDC\u7A0B\u76EE\u5F55", "Image remote folder")).setDesc(
      this.plugin.t(
        "\u4E13\u95E8\u7528\u4E8E\u5B58\u653E\u8FDC\u7A0B\u56FE\u7247\u7684 WebDAV \u76EE\u5F55\uFF0C\u4F8B\u5982\uFF1A/remote-images/\u3002\u56FE\u7247\u4E0A\u4F20\u6210\u529F\u540E\u4F1A\u7ACB\u5373\u5220\u9664\u672C\u5730\u56FE\u7247\u6587\u4EF6\u3002",
        "Dedicated WebDAV folder for remote images, for example: /remote-images/. Local image files are deleted immediately after upload succeeds."
      )
    ).addText(
      (text) => text.setValue(this.plugin.settings.remoteFolder).onChange(async (value) => {
        this.plugin.settings.remoteFolder = (0, import_obsidian.normalizePath)(value.trim() || "/remote-images/");
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("\u6D4B\u8BD5\u8FDE\u63A5", "Test connection")).setDesc(this.plugin.t("\u4F7F\u7528\u4E34\u65F6\u63A2\u9488\u6587\u4EF6\u9A8C\u8BC1 PUT\u3001GET\u3001DELETE \u662F\u5426\u6B63\u5E38\u3002", "Verify PUT, GET, and DELETE using a temporary probe file.")).addButton(
      (button) => button.setButtonText(this.plugin.t("\u5F00\u59CB\u6D4B\u8BD5", "Run test")).onClick(async () => {
        button.setDisabled(true);
        try {
          await this.plugin.runConnectionTest(true);
        } finally {
          button.setDisabled(false);
        }
      })
    );
    containerEl.createEl("h3", { text: this.plugin.t("\u540C\u6B65\u8BBE\u7F6E", "Sync") });
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("\u8FDC\u7A0B\u7B14\u8BB0\u76EE\u5F55", "Remote notes folder")).setDesc(
      this.plugin.t(
        "\u7528\u4E8E\u5B58\u653E\u7B14\u8BB0\u548C\u5176\u4ED6\u975E\u56FE\u7247\u9644\u4EF6\u539F\u6837\u540C\u6B65\u526F\u672C\u7684\u8FDC\u7AEF\u76EE\u5F55\uFF0C\u4F8B\u5982\uFF1A/vault-sync/\u3002\u63D2\u4EF6\u4F1A\u81EA\u52A8\u540C\u6B65\u6574\u4E2A vault\uFF0C\u5E76\u8DF3\u8FC7 .obsidian\u3001\u63D2\u4EF6\u76EE\u5F55\u548C\u56FE\u7247\u6587\u4EF6\u3002",
        "Remote folder used for notes and other non-image attachments synced as-is, for example: /vault-sync/. The plugin syncs the whole vault and automatically skips .obsidian, the plugin directory, and image files."
      )
    ).addText(
      (text) => text.setValue(this.plugin.settings.vaultSyncRemoteFolder).onChange(async (value) => {
        this.plugin.settings.vaultSyncRemoteFolder = (0, import_obsidian.normalizePath)(value.trim() || "/vault-sync/");
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("\u81EA\u52A8\u540C\u6B65\u9891\u7387", "Auto sync frequency")).setDesc(
      this.plugin.t(
        "\u4EE5\u5206\u949F\u4E3A\u5355\u4F4D\u8BBE\u7F6E\u81EA\u52A8\u540C\u6B65\u65F6\u95F4\u3002\u586B 0 \u8868\u793A\u5173\u95ED\u81EA\u52A8\u540C\u6B65\u3002\u8FD9\u91CC\u7684\u540C\u6B65\u662F\u201C\u5BF9\u8D26\u540C\u6B65\u201D\uFF1A\u4F1A\u68C0\u67E5\u672C\u5730\u4E0E\u8FDC\u7AEF\u76EE\u5F55\u5DEE\u5F02\uFF0C\u8865\u4F20\u65B0\u589E\u548C\u53D8\u66F4\u6587\u4EF6\uFF0C\u5E76\u5220\u9664\u8FDC\u7AEF\u591A\u4F59\u5185\u5BB9\u3002",
        "Set the automatic sync interval in minutes. Use 0 to turn it off. This is a reconciliation sync: it checks local and remote differences, uploads new or changed files, and removes extra remote content."
      )
    ).addText(
      (text) => text.setPlaceholder("0").setValue(String(this.plugin.settings.autoSyncIntervalMinutes)).onChange(async (value) => {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isNaN(parsed)) {
          this.plugin.settings.autoSyncIntervalMinutes = Math.max(0, parsed);
          await this.plugin.saveSettings();
        }
      })
    );
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("\u7B14\u8BB0\u672C\u5730\u4FDD\u7559\u6A21\u5F0F", "Note local retention mode")).setDesc(
      this.plugin.t(
        "\u5B8C\u6574\u672C\u5730\uFF1A\u7B14\u8BB0\u59CB\u7EC8\u4FDD\u7559\u5728\u672C\u5730\u3002\u6309\u9700\u52A0\u8F7D\u7B14\u8BB0\uFF1A\u957F\u671F\u672A\u8BBF\u95EE\u7684 Markdown \u7B14\u8BB0\u4F1A\u88AB\u66FF\u6362\u4E3A\u672C\u5730\u5360\u4F4D\u6587\u4EF6\uFF0C\u6253\u5F00\u65F6\u518D\u4ECE\u8FDC\u7AEF\u6062\u590D\u3002",
        "Full local: notes always stay local. Lazy notes: stale Markdown notes are replaced with local placeholder files and restored from remote when opened."
      )
    ).addDropdown(
      (dropdown) => dropdown.addOption("full-local", this.plugin.t("\u5B8C\u6574\u672C\u5730", "Full local")).addOption("lazy-notes", this.plugin.t("\u6309\u9700\u52A0\u8F7D\u7B14\u8BB0", "Lazy notes")).setValue(this.plugin.settings.noteStorageMode).onChange(async (value) => {
        this.plugin.settings.noteStorageMode = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("\u7B14\u8BB0\u672C\u5730\u56DE\u6536\u5929\u6570", "Note eviction days")).setDesc(
      this.plugin.t(
        "\u4EC5\u5728\u201C\u6309\u9700\u52A0\u8F7D\u7B14\u8BB0\u201D\u6A21\u5F0F\u4E0B\u751F\u6548\u3002\u8D85\u8FC7\u8FD9\u4E2A\u5929\u6570\u672A\u6253\u5F00\u7684 Markdown \u7B14\u8BB0\uFF0C\u4F1A\u5728\u540C\u6B65\u540E\u88AB\u66FF\u6362\u4E3A\u672C\u5730\u5360\u4F4D\u6587\u4EF6\u3002",
        "Used only in lazy note mode. Markdown notes not opened within this number of days are replaced with local placeholder files after sync."
      )
    ).addText(
      (text) => text.setPlaceholder("30").setValue(String(this.plugin.settings.noteEvictAfterDays)).onChange(async (value) => {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isNaN(parsed)) {
          this.plugin.settings.noteEvictAfterDays = Math.max(1, parsed);
          await this.plugin.saveSettings();
        }
      })
    );
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("\u540C\u6B65\u72B6\u6001", "Sync status")).setDesc(
      this.plugin.t(
        `${this.plugin.formatLastSyncLabel()}
${this.plugin.formatSyncStatusLabel()}
${this.plugin.t("\u8BF4\u660E\uFF1A\u7ACB\u5373\u540C\u6B65\u4F1A\u6267\u884C\u672C\u5730\u4E0E\u8FDC\u7AEF\u7684\u5BF9\u8D26\uFF0C\u540C\u6B65\u7B14\u8BB0\u4E0E\u975E\u56FE\u7247\u9644\u4EF6\uFF0C\u5E76\u6E05\u7406\u8FDC\u7AEF\u5197\u4F59\u6587\u4EF6\u3002\u56FE\u7247\u4E0A\u4F20\u4ECD\u7531\u72EC\u7ACB\u961F\u5217\u5904\u7406\u3002", "Note: Sync now reconciles local and remote content, syncs notes and non-image attachments, and cleans extra remote files. Image uploads continue to be handled by the separate queue.")}`,
        `${this.plugin.formatLastSyncLabel()}
${this.plugin.formatSyncStatusLabel()}
${this.plugin.t("\u8BF4\u660E\uFF1A\u7ACB\u5373\u540C\u6B65\u4F1A\u6267\u884C\u672C\u5730\u4E0E\u8FDC\u7AEF\u7684\u5BF9\u8D26\uFF0C\u540C\u6B65\u7B14\u8BB0\u4E0E\u975E\u56FE\u7247\u9644\u4EF6\uFF0C\u5E76\u6E05\u7406\u8FDC\u7AEF\u5197\u4F59\u6587\u4EF6\u3002\u56FE\u7247\u4E0A\u4F20\u4ECD\u7531\u72EC\u7ACB\u961F\u5217\u5904\u7406\u3002", "Note: Sync now reconciles local and remote content, syncs notes and non-image attachments, and cleans extra remote files. Image uploads continue to be handled by the separate queue.")}`
      )
    ).addButton(
      (button) => button.setButtonText(this.plugin.t("\u7ACB\u5373\u540C\u6B65", "Sync now")).onClick(async () => {
        button.setDisabled(true);
        try {
          await this.plugin.syncConfiguredVaultContent(true);
          this.display();
        } finally {
          button.setDisabled(false);
        }
      })
    );
    containerEl.createEl("h3", { text: this.plugin.t("\u4E00\u6B21\u6027\u5DE5\u5177", "One-time tools") });
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("\u8FC1\u79FB\u6574\u5E93\u539F\u751F\u56FE\u7247\u5F15\u7528", "Migrate native image embeds in vault")).setDesc(
      this.plugin.t(
        "\u626B\u63CF\u6574\u5E93\u6240\u6709 Markdown \u7B14\u8BB0\uFF0C\u628A Obsidian \u539F\u751F\u672C\u5730\u56FE\u7247\u5F15\u7528\uFF08\u5982 ![]() \u548C ![[...]]\uFF09\u4E0A\u4F20\u5230\u8FDC\u7AEF\u56FE\u7247\u76EE\u5F55\uFF0C\u5E76\u6539\u5199\u4E3A secure-webdav \u4EE3\u7801\u5757\u3002\u65E7\u7248 span \u548C\u65E9\u671F webdav-secure \u94FE\u63A5\u4E5F\u4F1A\u4E00\u5E76\u6536\u655B\u5230\u65B0\u683C\u5F0F\u3002",
        "Scan all Markdown notes in the vault, upload native local image embeds (such as ![]() and ![[...]]) to the remote image folder, and rewrite them as secure-webdav code blocks. Legacy span tags and early webdav-secure links are also normalized to the new format."
      )
    ).addButton(
      (button) => button.setButtonText(this.plugin.t("\u5F00\u59CB\u8FC1\u79FB", "Run migration")).onClick(async () => {
        button.setDisabled(true);
        try {
          await this.plugin.migrateAllLegacySecureImages();
        } finally {
          button.setDisabled(false);
        }
      })
    );
  }
};
var ResultModal = class extends import_obsidian.Modal {
  constructor(app, titleText, bodyText) {
    super(app);
    this.titleText = titleText;
    this.bodyText = bodyText;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.titleText });
    contentEl.createEl("p", { text: this.bodyText });
  }
  onClose() {
    this.contentEl.empty();
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiXHVGRUZGaW1wb3J0IHtcclxuICBBcHAsXG4gIEVkaXRvcixcbiAgTWFya2Rvd25GaWxlSW5mbyxcbiAgTWFya2Rvd25SZW5kZXJDaGlsZCxcbiAgTWFya2Rvd25WaWV3LFxyXG4gIE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQsXHJcbiAgTW9kYWwsXHJcbiAgTm90aWNlLFxyXG4gIFBsdWdpbixcclxuICBQbHVnaW5TZXR0aW5nVGFiLFxyXG4gIFNldHRpbmcsXHJcbiAgVEFic3RyYWN0RmlsZSxcclxuICBURmlsZSxcbiAgbm9ybWFsaXplUGF0aCxcbiAgcmVxdWVzdFVybCBhcyBvYnNpZGlhblJlcXVlc3RVcmwsXG59IGZyb20gXCJvYnNpZGlhblwiO1xuXHJcbnR5cGUgU2VjdXJlV2ViZGF2U2V0dGluZ3MgPSB7XG4gIHdlYmRhdlVybDogc3RyaW5nO1xuICB1c2VybmFtZTogc3RyaW5nO1xuICBwYXNzd29yZDogc3RyaW5nO1xuICByZW1vdGVGb2xkZXI6IHN0cmluZztcbiAgdmF1bHRTeW5jUmVtb3RlRm9sZGVyOiBzdHJpbmc7XG4gIG5hbWluZ1N0cmF0ZWd5OiBcInRpbWVzdGFtcFwiIHwgXCJoYXNoXCI7XG4gIGRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQ6IGJvb2xlYW47XG4gIGxhbmd1YWdlOiBcImF1dG9cIiB8IFwiemhcIiB8IFwiZW5cIjtcbiAgbm90ZVN0b3JhZ2VNb2RlOiBcImZ1bGwtbG9jYWxcIiB8IFwibGF6eS1ub3Rlc1wiO1xuICBub3RlRXZpY3RBZnRlckRheXM6IG51bWJlcjtcbiAgYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXM6IG51bWJlcjtcbiAgbWF4UmV0cnlBdHRlbXB0czogbnVtYmVyO1xuICByZXRyeURlbGF5U2Vjb25kczogbnVtYmVyO1xuICBkZWxldGVSZW1vdGVXaGVuVW5yZWZlcmVuY2VkOiBib29sZWFuO1xuICBjb21wcmVzc0ltYWdlczogYm9vbGVhbjtcbiAgY29tcHJlc3NUaHJlc2hvbGRLYjogbnVtYmVyO1xuICBtYXhJbWFnZURpbWVuc2lvbjogbnVtYmVyO1xuICBqcGVnUXVhbGl0eTogbnVtYmVyO1xufTtcblxyXG50eXBlIFVwbG9hZFRhc2sgPSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5vdGVQYXRoOiBzdHJpbmc7XG4gIHBsYWNlaG9sZGVyOiBzdHJpbmc7XG4gIG1pbWVUeXBlOiBzdHJpbmc7XHJcbiAgZmlsZU5hbWU6IHN0cmluZztcclxuICBkYXRhQmFzZTY0OiBzdHJpbmc7XHJcbiAgYXR0ZW1wdHM6IG51bWJlcjtcclxuICBjcmVhdGVkQXQ6IG51bWJlcjtcclxuICBsYXN0RXJyb3I/OiBzdHJpbmc7XG59O1xuXG50eXBlIFN5bmNJbmRleEVudHJ5ID0ge1xuICBsb2NhbFNpZ25hdHVyZTogc3RyaW5nO1xuICByZW1vdGVTaWduYXR1cmU6IHN0cmluZztcbiAgcmVtb3RlUGF0aDogc3RyaW5nO1xufTtcblxudHlwZSBSZW1vdGVGaWxlU3RhdGUgPSB7XG4gIHJlbW90ZVBhdGg6IHN0cmluZztcbiAgbGFzdE1vZGlmaWVkOiBudW1iZXI7XG4gIHNpemU6IG51bWJlcjtcbiAgc2lnbmF0dXJlOiBzdHJpbmc7XG59O1xuXG50eXBlIERlbGV0aW9uVG9tYnN0b25lID0ge1xuICBwYXRoOiBzdHJpbmc7XG4gIGRlbGV0ZWRBdDogbnVtYmVyO1xuICByZW1vdGVTaWduYXR1cmU/OiBzdHJpbmc7XG59O1xuXG50eXBlIE1pc3NpbmdMYXp5UmVtb3RlUmVjb3JkID0ge1xuICBmaXJzdERldGVjdGVkQXQ6IG51bWJlcjtcbiAgbGFzdERldGVjdGVkQXQ6IG51bWJlcjtcbiAgbWlzc0NvdW50OiBudW1iZXI7XG59O1xuXG50eXBlIFJlbW90ZUludmVudG9yeSA9IHtcbiAgZmlsZXM6IE1hcDxzdHJpbmcsIFJlbW90ZUZpbGVTdGF0ZT47XG4gIGRpcmVjdG9yaWVzOiBTZXQ8c3RyaW5nPjtcbn07XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFNlY3VyZVdlYmRhdlNldHRpbmdzID0ge1xuICB3ZWJkYXZVcmw6IFwiXCIsXG4gIHVzZXJuYW1lOiBcIlwiLFxuICBwYXNzd29yZDogXCJcIixcbiAgcmVtb3RlRm9sZGVyOiBcIi9yZW1vdGUtaW1hZ2VzL1wiLFxuICB2YXVsdFN5bmNSZW1vdGVGb2xkZXI6IFwiL3ZhdWx0LXN5bmMvXCIsXG4gIG5hbWluZ1N0cmF0ZWd5OiBcImhhc2hcIixcbiAgZGVsZXRlTG9jYWxBZnRlclVwbG9hZDogdHJ1ZSxcbiAgbGFuZ3VhZ2U6IFwiYXV0b1wiLFxuICBub3RlU3RvcmFnZU1vZGU6IFwiZnVsbC1sb2NhbFwiLFxuICBub3RlRXZpY3RBZnRlckRheXM6IDMwLFxuICBhdXRvU3luY0ludGVydmFsTWludXRlczogMCxcbiAgbWF4UmV0cnlBdHRlbXB0czogNSxcbiAgcmV0cnlEZWxheVNlY29uZHM6IDUsXG4gIGRlbGV0ZVJlbW90ZVdoZW5VbnJlZmVyZW5jZWQ6IHRydWUsXG4gIGNvbXByZXNzSW1hZ2VzOiB0cnVlLFxuICBjb21wcmVzc1RocmVzaG9sZEtiOiAzMDAsXG4gIG1heEltYWdlRGltZW5zaW9uOiAyMjAwLFxuICBqcGVnUXVhbGl0eTogODIsXG59O1xuXHJcbmNvbnN0IFNFQ1VSRV9QUk9UT0NPTCA9IFwid2ViZGF2LXNlY3VyZTpcIjtcbmNvbnN0IFNFQ1VSRV9DT0RFX0JMT0NLID0gXCJzZWN1cmUtd2ViZGF2XCI7XG5jb25zdCBTRUNVUkVfTk9URV9TVFVCID0gXCJzZWN1cmUtd2ViZGF2LW5vdGUtc3R1YlwiO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTZWN1cmVXZWJkYXZJbWFnZXNQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogU2VjdXJlV2ViZGF2U2V0dGluZ3MgPSBERUZBVUxUX1NFVFRJTkdTO1xuICBxdWV1ZTogVXBsb2FkVGFza1tdID0gW107XG4gIHByaXZhdGUgYmxvYlVybHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBwcm9jZXNzaW5nVGFza0lkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIHJldHJ5VGltZW91dHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICBwcml2YXRlIG5vdGVSZW1vdGVSZWZzID0gbmV3IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PigpO1xuICBwcml2YXRlIHJlbW90ZUNsZWFudXBJbkZsaWdodCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIG5vdGVBY2Nlc3NUaW1lc3RhbXBzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgcHJpdmF0ZSBzeW5jSW5kZXggPSBuZXcgTWFwPHN0cmluZywgU3luY0luZGV4RW50cnk+KCk7XG4gIHByaXZhdGUgbWlzc2luZ0xhenlSZW1vdGVOb3RlcyA9IG5ldyBNYXA8c3RyaW5nLCBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZD4oKTtcbiAgcHJpdmF0ZSBsYXN0VmF1bHRTeW5jQXQgPSAwO1xuICBwcml2YXRlIGxhc3RWYXVsdFN5bmNTdGF0dXMgPSBcIlwiO1xuICBwcml2YXRlIHN5bmNJblByb2dyZXNzID0gZmFsc2U7XG5cbiAgcHJpdmF0ZSByZWFkb25seSBkZWxldGlvbkZvbGRlclN1ZmZpeCA9IFwiLl9fc2VjdXJlLXdlYmRhdi1kZWxldGlvbnNfXy9cIjtcbiAgcHJpdmF0ZSByZWFkb25seSBtaXNzaW5nTGF6eVJlbW90ZUNvbmZpcm1hdGlvbnMgPSAyO1xuXHJcbiAgYXN5bmMgb25sb2FkKCkge1xuICAgIGF3YWl0IHRoaXMubG9hZFBsdWdpblN0YXRlKCk7XG5cbiAgICB0aGlzLmFkZFNldHRpbmdUYWIobmV3IFNlY3VyZVdlYmRhdlNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJ1cGxvYWQtY3VycmVudC1ub3RlLWxvY2FsLWltYWdlc1wiLFxuICAgICAgbmFtZTogXCJVcGxvYWQgbG9jYWwgaW1hZ2VzIGluIGN1cnJlbnQgbm90ZSB0byBXZWJEQVZcIixcbiAgICAgIGNoZWNrQ2FsbGJhY2s6IChjaGVja2luZykgPT4ge1xyXG4gICAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xyXG4gICAgICAgIGlmICghZmlsZSkge1xyXG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCFjaGVja2luZykge1xyXG4gICAgICAgICAgdm9pZCB0aGlzLnVwbG9hZEltYWdlc0luTm90ZShmaWxlKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInRlc3Qtd2ViZGF2LWNvbm5lY3Rpb25cIixcbiAgICAgIG5hbWU6IFwiVGVzdCBXZWJEQVYgY29ubmVjdGlvblwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLnJ1bkNvbm5lY3Rpb25UZXN0KHRydWUpO1xuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJzeW5jLWNvbmZpZ3VyZWQtdmF1bHQtY29udGVudC10by13ZWJkYXZcIixcbiAgICAgIG5hbWU6IFwiU3luYyB2YXVsdCBjb250ZW50IHRvIFdlYkRBVlwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLnJ1bk1hbnVhbFN5bmMoKTtcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCByaWJib24gPSB0aGlzLmFkZFJpYmJvbkljb24oXCJyZWZyZXNoLWN3XCIsIHRoaXMudChcIlx1N0FDQlx1NTM3M1x1NTQwQ1x1NkI2NVx1NTIzMCBXZWJEQVZcIiwgXCJTeW5jIHRvIFdlYkRBViBub3dcIiksICgpID0+IHtcbiAgICAgIHZvaWQgdGhpcy5ydW5NYW51YWxTeW5jKCk7XG4gICAgfSk7XG4gICAgcmliYm9uLmFkZENsYXNzKFwic2VjdXJlLXdlYmRhdi1zeW5jLXJpYmJvblwiKTtcblxyXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duUG9zdFByb2Nlc3NvcigoZWwsIGN0eCkgPT4ge1xuICAgICAgdm9pZCB0aGlzLnByb2Nlc3NTZWN1cmVJbWFnZXMoZWwsIGN0eCk7XG4gICAgfSk7XG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFNFQ1VSRV9DT0RFX0JMT0NLLCAoc291cmNlLCBlbCwgY3R4KSA9PiB7XG4gICAgICB2b2lkIHRoaXMucHJvY2Vzc1NlY3VyZUNvZGVCbG9jayhzb3VyY2UsIGVsLCBjdHgpO1xuICAgIH0pO1xuXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFwiZmlsZS1vcGVuXCIsIChmaWxlKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5oYW5kbGVGaWxlT3BlbihmaWxlKTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJlZGl0b3ItcGFzdGVcIiwgKGV2dCwgZWRpdG9yLCBpbmZvKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5oYW5kbGVFZGl0b3JQYXN0ZShldnQsIGVkaXRvciwgaW5mbyk7XG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFwiZWRpdG9yLWRyb3BcIiwgKGV2dCwgZWRpdG9yLCBpbmZvKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5oYW5kbGVFZGl0b3JEcm9wKGV2dCwgZWRpdG9yLCBpbmZvKTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBhd2FpdCB0aGlzLnJlYnVpbGRSZWZlcmVuY2VJbmRleCgpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcIm1vZGlmeVwiLCAoZmlsZSkgPT4gdm9pZCB0aGlzLmhhbmRsZVZhdWx0TW9kaWZ5KGZpbGUpKSk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwiZGVsZXRlXCIsIChmaWxlKSA9PiB2b2lkIHRoaXMuaGFuZGxlVmF1bHREZWxldGUoZmlsZSkpKTtcbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oXCJyZW5hbWVcIiwgKGZpbGUsIG9sZFBhdGgpID0+IHZvaWQgdGhpcy5oYW5kbGVWYXVsdFJlbmFtZShmaWxlLCBvbGRQYXRoKSkpO1xuXG4gICAgdGhpcy5zZXR1cEF1dG9TeW5jKCk7XG5cbiAgICB2b2lkIHRoaXMucHJvY2Vzc1BlbmRpbmdUYXNrcygpO1xuXHJcbiAgICB0aGlzLnJlZ2lzdGVyKCgpID0+IHtcclxuICAgICAgZm9yIChjb25zdCBibG9iVXJsIG9mIHRoaXMuYmxvYlVybHMpIHtcclxuICAgICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKGJsb2JVcmwpO1xyXG4gICAgICB9XHJcbiAgICAgIHRoaXMuYmxvYlVybHMuY2xlYXIoKTtcclxuICAgICAgZm9yIChjb25zdCB0aW1lb3V0SWQgb2YgdGhpcy5yZXRyeVRpbWVvdXRzLnZhbHVlcygpKSB7XHJcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xyXG4gICAgICB9XHJcbiAgICAgIHRoaXMucmV0cnlUaW1lb3V0cy5jbGVhcigpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBvbnVubG9hZCgpIHtcclxuICAgIGZvciAoY29uc3QgYmxvYlVybCBvZiB0aGlzLmJsb2JVcmxzKSB7XHJcbiAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwoYmxvYlVybCk7XHJcbiAgICB9XHJcbiAgICB0aGlzLmJsb2JVcmxzLmNsZWFyKCk7XHJcbiAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnJldHJ5VGltZW91dHMudmFsdWVzKCkpIHtcclxuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xyXG4gICAgfVxyXG4gICAgdGhpcy5yZXRyeVRpbWVvdXRzLmNsZWFyKCk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBsb2FkUGx1Z2luU3RhdGUoKSB7XG4gICAgY29uc3QgbG9hZGVkID0gYXdhaXQgdGhpcy5sb2FkRGF0YSgpO1xuICAgIGlmICghbG9hZGVkIHx8IHR5cGVvZiBsb2FkZWQgIT09IFwib2JqZWN0XCIpIHtcbiAgICAgIHRoaXMuc2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MgfTtcbiAgICAgIHRoaXMucXVldWUgPSBbXTtcbiAgICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMgPSBuZXcgTWFwKCk7XG4gICAgICB0aGlzLnN5bmNJbmRleCA9IG5ldyBNYXAoKTtcbiAgICAgIHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3RlcyA9IG5ldyBNYXAoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBjYW5kaWRhdGUgPSBsb2FkZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgaWYgKFwic2V0dGluZ3NcIiBpbiBjYW5kaWRhdGUgfHwgXCJxdWV1ZVwiIGluIGNhbmRpZGF0ZSkge1xuICAgICAgdGhpcy5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUywgLi4uKChjYW5kaWRhdGUuc2V0dGluZ3MgYXMgUGFydGlhbDxTZWN1cmVXZWJkYXZTZXR0aW5ncz4pID8/IHt9KSB9O1xuICAgICAgdGhpcy5xdWV1ZSA9IEFycmF5LmlzQXJyYXkoY2FuZGlkYXRlLnF1ZXVlKSA/IChjYW5kaWRhdGUucXVldWUgYXMgVXBsb2FkVGFza1tdKSA6IFtdO1xuICAgICAgdGhpcy5ub3RlQWNjZXNzVGltZXN0YW1wcyA9IG5ldyBNYXAoXG4gICAgICAgIE9iamVjdC5lbnRyaWVzKChjYW5kaWRhdGUubm90ZUFjY2Vzc1RpbWVzdGFtcHMgYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPiB8IHVuZGVmaW5lZCkgPz8ge30pLFxuICAgICAgKTtcbiAgICAgIHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3RlcyA9IG5ldyBNYXAoXG4gICAgICAgIE9iamVjdC5lbnRyaWVzKChjYW5kaWRhdGUubWlzc2luZ0xhenlSZW1vdGVOb3RlcyBhcyBSZWNvcmQ8c3RyaW5nLCBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZD4gfCB1bmRlZmluZWQpID8/IHt9KVxuICAgICAgICAgIC5maWx0ZXIoKFssIHZhbHVlXSkgPT4ge1xuICAgICAgICAgICAgaWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcmVjb3JkID0gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB0eXBlb2YgcmVjb3JkLmZpcnN0RGV0ZWN0ZWRBdCA9PT0gXCJudW1iZXJcIiAmJlxuICAgICAgICAgICAgICB0eXBlb2YgcmVjb3JkLmxhc3REZXRlY3RlZEF0ID09PSBcIm51bWJlclwiICYmXG4gICAgICAgICAgICAgIHR5cGVvZiByZWNvcmQubWlzc0NvdW50ID09PSBcIm51bWJlclwiXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcCgoW3BhdGgsIHZhbHVlXSkgPT4gW3BhdGgsIHZhbHVlIGFzIE1pc3NpbmdMYXp5UmVtb3RlUmVjb3JkXSksXG4gICAgICApO1xuICAgICAgdGhpcy5zeW5jSW5kZXggPSBuZXcgTWFwKCk7XG4gICAgICBmb3IgKGNvbnN0IFtwYXRoLCByYXdFbnRyeV0gb2YgT2JqZWN0LmVudHJpZXMoKGNhbmRpZGF0ZS5zeW5jSW5kZXggYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpID8/IHt9KSkge1xuICAgICAgICBjb25zdCBub3JtYWxpemVkID0gdGhpcy5ub3JtYWxpemVTeW5jSW5kZXhFbnRyeShwYXRoLCByYXdFbnRyeSk7XG4gICAgICAgIGlmIChub3JtYWxpemVkKSB7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KHBhdGgsIG5vcm1hbGl6ZWQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9XG4gICAgICAgIHR5cGVvZiBjYW5kaWRhdGUubGFzdFZhdWx0U3luY0F0ID09PSBcIm51bWJlclwiID8gY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNBdCA6IDA7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPVxuICAgICAgICB0eXBlb2YgY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNTdGF0dXMgPT09IFwic3RyaW5nXCIgPyBjYW5kaWRhdGUubGFzdFZhdWx0U3luY1N0YXR1cyA6IFwiXCI7XG4gICAgICB0aGlzLm5vcm1hbGl6ZUVmZmVjdGl2ZVNldHRpbmdzKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUywgLi4uKGNhbmRpZGF0ZSBhcyBQYXJ0aWFsPFNlY3VyZVdlYmRhdlNldHRpbmdzPikgfTtcbiAgICB0aGlzLnF1ZXVlID0gW107XG4gICAgdGhpcy5ub3RlQWNjZXNzVGltZXN0YW1wcyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLnN5bmNJbmRleCA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSAwO1xuICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9IFwiXCI7XG4gICAgdGhpcy5ub3JtYWxpemVFZmZlY3RpdmVTZXR0aW5ncygpO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVFZmZlY3RpdmVTZXR0aW5ncygpIHtcbiAgICAvLyBLZWVwIHRoZSBwdWJsaWMgc2V0dGluZ3Mgc3VyZmFjZSBpbnRlbnRpb25hbGx5IHNtYWxsIGFuZCBkZXRlcm1pbmlzdGljLlxuICAgIHRoaXMuc2V0dGluZ3MuZGVsZXRlTG9jYWxBZnRlclVwbG9hZCA9IHRydWU7XG4gICAgdGhpcy5zZXR0aW5ncy5hdXRvU3luY0ludGVydmFsTWludXRlcyA9IE1hdGgubWF4KDAsIE1hdGguZmxvb3IodGhpcy5zZXR0aW5ncy5hdXRvU3luY0ludGVydmFsTWludXRlcyB8fCAwKSk7XG4gIH1cblxuICBwcml2YXRlIHNldHVwQXV0b1N5bmMoKSB7XG4gICAgY29uc3QgbWludXRlcyA9IHRoaXMuc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXM7XG4gICAgaWYgKG1pbnV0ZXMgPD0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGludGVydmFsTXMgPSBtaW51dGVzICogNjAgKiAxMDAwO1xuICAgIHRoaXMucmVnaXN0ZXJJbnRlcnZhbChcbiAgICAgIHdpbmRvdy5zZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5wcm9jZXNzUGVuZGluZ1Rhc2tzKCk7XG4gICAgICAgIHZvaWQgdGhpcy5zeW5jQ29uZmlndXJlZFZhdWx0Q29udGVudChmYWxzZSk7XG4gICAgICB9LCBpbnRlcnZhbE1zKSxcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgc2F2ZVBsdWdpblN0YXRlKCkge1xuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEoe1xuICAgICAgc2V0dGluZ3M6IHRoaXMuc2V0dGluZ3MsXG4gICAgICBxdWV1ZTogdGhpcy5xdWV1ZSxcbiAgICAgIG5vdGVBY2Nlc3NUaW1lc3RhbXBzOiBPYmplY3QuZnJvbUVudHJpZXModGhpcy5ub3RlQWNjZXNzVGltZXN0YW1wcy5lbnRyaWVzKCkpLFxuICAgICAgbWlzc2luZ0xhenlSZW1vdGVOb3RlczogT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3Rlcy5lbnRyaWVzKCkpLFxuICAgICAgc3luY0luZGV4OiBPYmplY3QuZnJvbUVudHJpZXModGhpcy5zeW5jSW5kZXguZW50cmllcygpKSxcbiAgICAgIGxhc3RWYXVsdFN5bmNBdDogdGhpcy5sYXN0VmF1bHRTeW5jQXQsXG4gICAgICBsYXN0VmF1bHRTeW5jU3RhdHVzOiB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsXG4gICAgfSk7XG4gIH1cblxyXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcbiAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVTeW5jSW5kZXhFbnRyeSh2YXVsdFBhdGg6IHN0cmluZywgcmF3RW50cnk6IHVua25vd24pOiBTeW5jSW5kZXhFbnRyeSB8IG51bGwge1xuICAgIGlmICghcmF3RW50cnkgfHwgdHlwZW9mIHJhd0VudHJ5ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBjYW5kaWRhdGUgPSByYXdFbnRyeSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICBjb25zdCByZW1vdGVQYXRoID1cbiAgICAgIHR5cGVvZiBjYW5kaWRhdGUucmVtb3RlUGF0aCA9PT0gXCJzdHJpbmdcIiAmJiBjYW5kaWRhdGUucmVtb3RlUGF0aC5sZW5ndGggPiAwXG4gICAgICAgID8gY2FuZGlkYXRlLnJlbW90ZVBhdGhcbiAgICAgICAgOiB0aGlzLmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aCh2YXVsdFBhdGgpO1xuICAgIGNvbnN0IGxvY2FsU2lnbmF0dXJlID1cbiAgICAgIHR5cGVvZiBjYW5kaWRhdGUubG9jYWxTaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgPyBjYW5kaWRhdGUubG9jYWxTaWduYXR1cmVcbiAgICAgICAgOiB0eXBlb2YgY2FuZGlkYXRlLnNpZ25hdHVyZSA9PT0gXCJzdHJpbmdcIlxuICAgICAgICAgID8gY2FuZGlkYXRlLnNpZ25hdHVyZVxuICAgICAgICAgIDogXCJcIjtcbiAgICBjb25zdCByZW1vdGVTaWduYXR1cmUgPVxuICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5yZW1vdGVTaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgPyBjYW5kaWRhdGUucmVtb3RlU2lnbmF0dXJlXG4gICAgICAgIDogdHlwZW9mIGNhbmRpZGF0ZS5zaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgICA/IGNhbmRpZGF0ZS5zaWduYXR1cmVcbiAgICAgICAgICA6IFwiXCI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICByZW1vdGVQYXRoLFxuICAgIH07XG4gIH1cblxyXG4gIHQoemg6IHN0cmluZywgZW46IHN0cmluZykge1xyXG4gICAgcmV0dXJuIHRoaXMuZ2V0TGFuZ3VhZ2UoKSA9PT0gXCJ6aFwiID8gemggOiBlbjtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZ2V0TGFuZ3VhZ2UoKSB7XG4gICAgaWYgKHRoaXMuc2V0dGluZ3MubGFuZ3VhZ2UgPT09IFwiYXV0b1wiKSB7XG4gICAgICBjb25zdCBsb2NhbGUgPSB0eXBlb2YgbmF2aWdhdG9yICE9PSBcInVuZGVmaW5lZFwiID8gbmF2aWdhdG9yLmxhbmd1YWdlLnRvTG93ZXJDYXNlKCkgOiBcImVuXCI7XG4gICAgICByZXR1cm4gbG9jYWxlLnN0YXJ0c1dpdGgoXCJ6aFwiKSA/IFwiemhcIiA6IFwiZW5cIjtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zZXR0aW5ncy5sYW5ndWFnZTtcbiAgfVxuXG4gIGZvcm1hdExhc3RTeW5jTGFiZWwoKSB7XG4gICAgaWYgKCF0aGlzLmxhc3RWYXVsdFN5bmNBdCkge1xuICAgICAgcmV0dXJuIHRoaXMudChcIlx1NEUwQVx1NkIyMVx1NTQwQ1x1NkI2NVx1RkYxQVx1NUMxQVx1NjcyQVx1NjI2N1x1ODg0Q1wiLCBcIkxhc3Qgc3luYzogbm90IHJ1biB5ZXRcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMudChcbiAgICAgIGBcdTRFMEFcdTZCMjFcdTU0MENcdTZCNjVcdUZGMUEke25ldyBEYXRlKHRoaXMubGFzdFZhdWx0U3luY0F0KS50b0xvY2FsZVN0cmluZygpfWAsXG4gICAgICBgTGFzdCBzeW5jOiAke25ldyBEYXRlKHRoaXMubGFzdFZhdWx0U3luY0F0KS50b0xvY2FsZVN0cmluZygpfWAsXG4gICAgKTtcbiAgfVxuXG4gIGZvcm1hdFN5bmNTdGF0dXNMYWJlbCgpIHtcbiAgICByZXR1cm4gdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzXG4gICAgICA/IHRoaXMudChgXHU2NzAwXHU4RkQxXHU3MkI2XHU2MDAxXHVGRjFBJHt0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXN9YCwgYFJlY2VudCBzdGF0dXM6ICR7dGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzfWApXG4gICAgICA6IHRoaXMudChcIlx1NjcwMFx1OEZEMVx1NzJCNlx1NjAwMVx1RkYxQVx1NjY4Mlx1NjVFMFwiLCBcIlJlY2VudCBzdGF0dXM6IG5vbmVcIik7XG4gIH1cblxuICBhc3luYyBydW5NYW51YWxTeW5jKCkge1xuICAgIGF3YWl0IHRoaXMucHJvY2Vzc1BlbmRpbmdUYXNrcygpO1xuICAgIGF3YWl0IHRoaXMuc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQodHJ1ZSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlYnVpbGRSZWZlcmVuY2VJbmRleCgpIHtcbiAgICBjb25zdCBuZXh0ID0gbmV3IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PigpO1xuICAgIGZvciAoY29uc3QgZmlsZSBvZiB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkpIHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgbmV4dC5zZXQoZmlsZS5wYXRoLCB0aGlzLmV4dHJhY3RSZW1vdGVQYXRoc0Zyb21UZXh0KGNvbnRlbnQpKTtcbiAgICB9XG4gICAgdGhpcy5ub3RlUmVtb3RlUmVmcyA9IG5leHQ7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZVZhdWx0TW9kaWZ5KGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHx8IGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBjb25zdCBuZXh0UmVmcyA9IHRoaXMuZXh0cmFjdFJlbW90ZVBhdGhzRnJvbVRleHQoY29udGVudCk7XG4gICAgY29uc3QgcHJldmlvdXNSZWZzID0gdGhpcy5ub3RlUmVtb3RlUmVmcy5nZXQoZmlsZS5wYXRoKSA/PyBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICB0aGlzLm5vdGVSZW1vdGVSZWZzLnNldChmaWxlLnBhdGgsIG5leHRSZWZzKTtcblxuICAgIGNvbnN0IHJlbW92ZWQgPSBbLi4ucHJldmlvdXNSZWZzXS5maWx0ZXIoKHZhbHVlKSA9PiAhbmV4dFJlZnMuaGFzKHZhbHVlKSk7XG4gICAgdm9pZCByZW1vdmVkO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVWYXVsdERlbGV0ZShmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKGZpbGUucGF0aCkpIHtcbiAgICAgIGF3YWl0IHRoaXMud3JpdGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgsIHRoaXMuc3luY0luZGV4LmdldChmaWxlLnBhdGgpPy5yZW1vdGVTaWduYXR1cmUpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgIH1cblxuICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICBjb25zdCBwcmV2aW91c1JlZnMgPSB0aGlzLm5vdGVSZW1vdGVSZWZzLmdldChmaWxlLnBhdGgpID8/IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgICAgdGhpcy5ub3RlUmVtb3RlUmVmcy5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgIHZvaWQgcHJldmlvdXNSZWZzO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlVmF1bHRSZW5hbWUoZmlsZTogVEFic3RyYWN0RmlsZSwgb2xkUGF0aDogc3RyaW5nKSB7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKG9sZFBhdGgpKSB7XG4gICAgICBhd2FpdCB0aGlzLndyaXRlRGVsZXRpb25Ub21ic3RvbmUob2xkUGF0aCwgdGhpcy5zeW5jSW5kZXguZ2V0KG9sZFBhdGgpPy5yZW1vdGVTaWduYXR1cmUpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKG9sZFBhdGgpO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICB9XG5cbiAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgY29uc3QgcmVmcyA9IHRoaXMubm90ZVJlbW90ZVJlZnMuZ2V0KG9sZFBhdGgpO1xuICAgICAgaWYgKCFyZWZzKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgdGhpcy5ub3RlUmVtb3RlUmVmcy5kZWxldGUob2xkUGF0aCk7XG4gICAgICB0aGlzLm5vdGVSZW1vdGVSZWZzLnNldChmaWxlLnBhdGgsIHJlZnMpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdFJlbW90ZVBhdGhzRnJvbVRleHQoY29udGVudDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVmcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IHNwYW5SZWdleCA9IC9kYXRhLXNlY3VyZS13ZWJkYXY9XCIoW15cIl0rKVwiL2c7XG4gICAgY29uc3QgcHJvdG9jb2xSZWdleCA9IC93ZWJkYXYtc2VjdXJlOlxcL1xcLyhbXlxccylcIl0rKS9nO1xuICAgIGNvbnN0IGNvZGVCbG9ja1JlZ2V4ID0gL2BgYHNlY3VyZS13ZWJkYXZcXHMrKFtcXHNcXFNdKj8pYGBgL2c7XG4gICAgbGV0IG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXG4gICAgd2hpbGUgKChtYXRjaCA9IHNwYW5SZWdleC5leGVjKGNvbnRlbnQpKSAhPT0gbnVsbCkge1xuICAgICAgcmVmcy5hZGQodGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0pKTtcbiAgICB9XG5cbiAgICB3aGlsZSAoKG1hdGNoID0gcHJvdG9jb2xSZWdleC5leGVjKGNvbnRlbnQpKSAhPT0gbnVsbCkge1xuICAgICAgcmVmcy5hZGQodGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0pKTtcbiAgICB9XG5cbiAgICB3aGlsZSAoKG1hdGNoID0gY29kZUJsb2NrUmVnZXguZXhlYyhjb250ZW50KSkgIT09IG51bGwpIHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IHRoaXMucGFyc2VTZWN1cmVJbWFnZUJsb2NrKG1hdGNoWzFdKTtcbiAgICAgIGlmIChwYXJzZWQ/LnBhdGgpIHtcbiAgICAgICAgcmVmcy5hZGQocGFyc2VkLnBhdGgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZWZzO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVSZW1vdGVJZlVucmVmZXJlbmNlZChyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICB2b2lkIHJlbW90ZVBhdGg7XG4gICAgLy8gRGlzYWJsZWQgaW50ZW50aW9uYWxseTogbG9jYWwtb25seSByZWZlcmVuY2UgY2hlY2tzIGFyZSBub3Qgc2FmZSBlbm91Z2hcbiAgICAvLyBmb3IgY3Jvc3MtZGV2aWNlIGRlbGV0aW9uIG9mIHNoYXJlZCByZW1vdGUgaW1hZ2VzLlxuICB9XG5cclxuICBwcml2YXRlIGFzeW5jIGJ1aWxkVXBsb2FkUmVwbGFjZW1lbnRzKGNvbnRlbnQ6IHN0cmluZywgbm90ZUZpbGU6IFRGaWxlLCB1cGxvYWRDYWNoZT86IE1hcDxzdHJpbmcsIHN0cmluZz4pIHtcbiAgICBjb25zdCBzZWVuID0gbmV3IE1hcDxzdHJpbmcsIFVwbG9hZFJld3JpdGU+KCk7XG4gICAgY29uc3Qgd2lraU1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvIVxcW1xcWyhbXlxcXV0rKVxcXVxcXS9nKV07XG4gICAgY29uc3QgbWFya2Rvd25NYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtbXlxcXV0qXVxcKChbXildKylcXCkvZyldO1xuICAgIGNvbnN0IGh0bWxJbWFnZU1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvPGltZ1xcYltePl0qc3JjPVtcIiddKFteXCInXSspW1wiJ11bXj5dKj4vZ2kpXTtcblxyXG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiB3aWtpTWF0Y2hlcykge1xyXG4gICAgICBjb25zdCByYXdMaW5rID0gbWF0Y2hbMV0uc3BsaXQoXCJ8XCIpWzBdLnRyaW0oKTtcclxuICAgICAgY29uc3QgZmlsZSA9IHRoaXMucmVzb2x2ZUxpbmtlZEZpbGUocmF3TGluaywgbm90ZUZpbGUucGF0aCk7XHJcbiAgICAgIGlmICghZmlsZSB8fCAhdGhpcy5pc0ltYWdlRmlsZShmaWxlKSkge1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XG5cbiAgICAgIGlmICghc2Vlbi5oYXMobWF0Y2hbMF0pKSB7XG4gICAgICAgIGNvbnN0IHJlbW90ZVVybCA9IGF3YWl0IHRoaXMudXBsb2FkVmF1bHRGaWxlKGZpbGUsIHVwbG9hZENhY2hlKTtcbiAgICAgICAgc2Vlbi5zZXQobWF0Y2hbMF0sIHtcbiAgICAgICAgICBvcmlnaW5hbDogbWF0Y2hbMF0sXG4gICAgICAgICAgcmV3cml0dGVuOiB0aGlzLmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsLCBmaWxlLmJhc2VuYW1lKSxcbiAgICAgICAgICBzb3VyY2VGaWxlOiBmaWxlLFxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWFya2Rvd25NYXRjaGVzKSB7XG4gICAgICBjb25zdCByYXdMaW5rID0gZGVjb2RlVVJJQ29tcG9uZW50KG1hdGNoWzFdLnRyaW0oKS5yZXBsYWNlKC9ePHw+JC9nLCBcIlwiKSk7XG4gICAgICBpZiAoL14od2ViZGF2LXNlY3VyZTp8ZGF0YTopL2kudGVzdChyYXdMaW5rKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuaXNIdHRwVXJsKHJhd0xpbmspKSB7XG4gICAgICAgIGlmICghc2Vlbi5oYXMobWF0Y2hbMF0pKSB7XG4gICAgICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRSZW1vdGVJbWFnZVVybChyYXdMaW5rLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgICAgY29uc3QgYWx0VGV4dCA9IHRoaXMuZXh0cmFjdE1hcmtkb3duQWx0VGV4dChtYXRjaFswXSkgfHwgdGhpcy5nZXREaXNwbGF5TmFtZUZyb21VcmwocmF3TGluayk7XG4gICAgICAgICAgc2Vlbi5zZXQobWF0Y2hbMF0sIHtcbiAgICAgICAgICAgIG9yaWdpbmFsOiBtYXRjaFswXSxcbiAgICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgYWx0VGV4dCksXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGVGaWxlLnBhdGgpO1xuICAgICAgaWYgKCFmaWxlIHx8ICF0aGlzLmlzSW1hZ2VGaWxlKGZpbGUpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFZhdWx0RmlsZShmaWxlLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgICAgb3JpZ2luYWw6IG1hdGNoWzBdLFxuICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgZmlsZS5iYXNlbmFtZSksXG4gICAgICAgICAgc291cmNlRmlsZTogZmlsZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiBodG1sSW1hZ2VNYXRjaGVzKSB7XG4gICAgICBjb25zdCByYXdMaW5rID0gdGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0udHJpbSgpKTtcbiAgICAgIGlmICghdGhpcy5pc0h0dHBVcmwocmF3TGluaykgfHwgc2Vlbi5oYXMobWF0Y2hbMF0pKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFJlbW90ZUltYWdlVXJsKHJhd0xpbmssIHVwbG9hZENhY2hlKTtcbiAgICAgIGNvbnN0IGFsdFRleHQgPSB0aGlzLmV4dHJhY3RIdG1sSW1hZ2VBbHRUZXh0KG1hdGNoWzBdKSB8fCB0aGlzLmdldERpc3BsYXlOYW1lRnJvbVVybChyYXdMaW5rKTtcbiAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgIG9yaWdpbmFsOiBtYXRjaFswXSxcbiAgICAgICAgcmV3cml0dGVuOiB0aGlzLmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsLCBhbHRUZXh0KSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBbLi4uc2Vlbi52YWx1ZXMoKV07XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RNYXJrZG93bkFsdFRleHQobWFya2Rvd25JbWFnZTogc3RyaW5nKSB7XG4gICAgY29uc3QgbWF0Y2ggPSBtYXJrZG93bkltYWdlLm1hdGNoKC9eIVxcWyhbXlxcXV0qKVxcXS8pO1xuICAgIHJldHVybiBtYXRjaD8uWzFdPy50cmltKCkgPz8gXCJcIjtcbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdEh0bWxJbWFnZUFsdFRleHQoaHRtbEltYWdlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtYXRjaCA9IGh0bWxJbWFnZS5tYXRjaCgvXFxiYWx0PVtcIiddKFteXCInXSopW1wiJ10vaSk7XG4gICAgcmV0dXJuIG1hdGNoID8gdGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0udHJpbSgpKSA6IFwiXCI7XG4gIH1cblxuICBwcml2YXRlIGlzSHR0cFVybCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIC9eaHR0cHM/OlxcL1xcLy9pLnRlc3QodmFsdWUpO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXREaXNwbGF5TmFtZUZyb21VcmwocmF3VXJsOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXJsID0gbmV3IFVSTChyYXdVcmwpO1xuICAgICAgY29uc3QgZmlsZU5hbWUgPSB0aGlzLnNhbml0aXplRmlsZU5hbWUodXJsLnBhdGhuYW1lLnNwbGl0KFwiL1wiKS5wb3AoKSB8fCBcIlwiKTtcbiAgICAgIGlmIChmaWxlTmFtZSkge1xuICAgICAgICByZXR1cm4gZmlsZU5hbWUucmVwbGFjZSgvXFwuW14uXSskLywgXCJcIik7XG4gICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBGYWxsIHRocm91Z2ggdG8gdGhlIGdlbmVyaWMgbGFiZWwgYmVsb3cuXG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMudChcIlx1N0Y1MVx1OTg3NVx1NTZGRVx1NzI0N1wiLCBcIldlYiBpbWFnZVwiKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVzb2x2ZUxpbmtlZEZpbGUobGluazogc3RyaW5nLCBzb3VyY2VQYXRoOiBzdHJpbmcpOiBURmlsZSB8IG51bGwge1xuICAgIGNvbnN0IGNsZWFuZWQgPSBsaW5rLnJlcGxhY2UoLyMuKi8sIFwiXCIpLnRyaW0oKTtcbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpcnN0TGlua3BhdGhEZXN0KGNsZWFuZWQsIHNvdXJjZVBhdGgpO1xuICAgIHJldHVybiB0YXJnZXQgaW5zdGFuY2VvZiBURmlsZSA/IHRhcmdldCA6IG51bGw7XG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBpc0ltYWdlRmlsZShmaWxlOiBURmlsZSkge1xuICAgIHJldHVybiAvXihwbmd8anBlP2d8Z2lmfHdlYnB8Ym1wfHN2ZykkL2kudGVzdChmaWxlLmV4dGVuc2lvbik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwbG9hZFZhdWx0RmlsZShmaWxlOiBURmlsZSwgdXBsb2FkQ2FjaGU/OiBNYXA8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgaWYgKHVwbG9hZENhY2hlPy5oYXMoZmlsZS5wYXRoKSkge1xuICAgICAgcmV0dXJuIHVwbG9hZENhY2hlLmdldChmaWxlLnBhdGgpITtcbiAgICB9XG5cbiAgICB0aGlzLmVuc3VyZUNvbmZpZ3VyZWQoKTtcbiAgICBjb25zdCBiaW5hcnkgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgIGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdGhpcy5wcmVwYXJlVXBsb2FkUGF5bG9hZChiaW5hcnksIHRoaXMuZ2V0TWltZVR5cGUoZmlsZS5leHRlbnNpb24pLCBmaWxlLm5hbWUpO1xuICAgIGNvbnN0IHJlbW90ZU5hbWUgPSBhd2FpdCB0aGlzLmJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5KHByZXBhcmVkLmZpbGVOYW1lLCBwcmVwYXJlZC5iaW5hcnkpO1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkUmVtb3RlUGF0aChyZW1vdGVOYW1lKTtcbiAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBwcmVwYXJlZC5iaW5hcnksIHByZXBhcmVkLm1pbWVUeXBlKTtcbiAgICBjb25zdCByZW1vdGVVcmwgPSBgJHtTRUNVUkVfUFJPVE9DT0x9Ly8ke3JlbW90ZVBhdGh9YDtcbiAgICB1cGxvYWRDYWNoZT8uc2V0KGZpbGUucGF0aCwgcmVtb3RlVXJsKTtcbiAgICByZXR1cm4gcmVtb3RlVXJsO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRSZW1vdGVJbWFnZVVybChpbWFnZVVybDogc3RyaW5nLCB1cGxvYWRDYWNoZT86IE1hcDxzdHJpbmcsIHN0cmluZz4pIHtcbiAgICBjb25zdCBjYWNoZUtleSA9IGByZW1vdGU6JHtpbWFnZVVybH1gO1xuICAgIGlmICh1cGxvYWRDYWNoZT8uaGFzKGNhY2hlS2V5KSkge1xuICAgICAgcmV0dXJuIHVwbG9hZENhY2hlLmdldChjYWNoZUtleSkhO1xuICAgIH1cblxuICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogaW1hZ2VVcmwsXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBmb2xsb3dSZWRpcmVjdHM6IHRydWUsXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgUmVtb3RlIGltYWdlIGRvd25sb2FkIGZhaWxlZCB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50VHlwZSA9IHJlc3BvbnNlLmhlYWRlcnNbXCJjb250ZW50LXR5cGVcIl0gPz8gXCJcIjtcbiAgICBpZiAoIXRoaXMuaXNJbWFnZUNvbnRlbnRUeXBlKGNvbnRlbnRUeXBlKSAmJiAhdGhpcy5sb29rc0xpa2VJbWFnZVVybChpbWFnZVVybCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJcdThGRENcdTdBMEJcdTk0RkVcdTYzQTVcdTRFMERcdTY2MkZcdTUzRUZcdThCQzZcdTUyMkJcdTc2ODRcdTU2RkVcdTcyNDdcdThENDRcdTZFOTBcdTMwMDJcIiwgXCJUaGUgcmVtb3RlIFVSTCBkb2VzIG5vdCBsb29rIGxpa2UgYW4gaW1hZ2UgcmVzb3VyY2UuXCIpKTtcbiAgICB9XG5cbiAgICBjb25zdCBmaWxlTmFtZSA9IHRoaXMuYnVpbGRSZW1vdGVTb3VyY2VGaWxlTmFtZShpbWFnZVVybCwgY29udGVudFR5cGUpO1xuICAgIGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdGhpcy5wcmVwYXJlVXBsb2FkUGF5bG9hZChcbiAgICAgIHJlc3BvbnNlLmFycmF5QnVmZmVyLFxuICAgICAgdGhpcy5ub3JtYWxpemVJbWFnZU1pbWVUeXBlKGNvbnRlbnRUeXBlLCBmaWxlTmFtZSksXG4gICAgICBmaWxlTmFtZSxcbiAgICApO1xuICAgIGNvbnN0IHJlbW90ZU5hbWUgPSBhd2FpdCB0aGlzLmJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5KHByZXBhcmVkLmZpbGVOYW1lLCBwcmVwYXJlZC5iaW5hcnkpO1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkUmVtb3RlUGF0aChyZW1vdGVOYW1lKTtcbiAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBwcmVwYXJlZC5iaW5hcnksIHByZXBhcmVkLm1pbWVUeXBlKTtcbiAgICBjb25zdCByZW1vdGVVcmwgPSBgJHtTRUNVUkVfUFJPVE9DT0x9Ly8ke3JlbW90ZVBhdGh9YDtcbiAgICB1cGxvYWRDYWNoZT8uc2V0KGNhY2hlS2V5LCByZW1vdGVVcmwpO1xuICAgIHJldHVybiByZW1vdGVVcmw7XG4gIH1cblxuICBwcml2YXRlIGlzSW1hZ2VDb250ZW50VHlwZShjb250ZW50VHlwZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIC9eaW1hZ2VcXC8vaS50ZXN0KGNvbnRlbnRUeXBlLnRyaW0oKSk7XG4gIH1cblxuICBwcml2YXRlIGxvb2tzTGlrZUltYWdlVXJsKHJhd1VybDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmF3VXJsKTtcbiAgICAgIHJldHVybiAvXFwuKHBuZ3xqcGU/Z3xnaWZ8d2VicHxibXB8c3ZnKSQvaS50ZXN0KHVybC5wYXRobmFtZSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBidWlsZFJlbW90ZVNvdXJjZUZpbGVOYW1lKHJhd1VybDogc3RyaW5nLCBjb250ZW50VHlwZTogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmF3VXJsKTtcbiAgICAgIGNvbnN0IGNhbmRpZGF0ZSA9IHRoaXMuc2FuaXRpemVGaWxlTmFtZSh1cmwucGF0aG5hbWUuc3BsaXQoXCIvXCIpLnBvcCgpIHx8IFwiXCIpO1xuICAgICAgaWYgKGNhbmRpZGF0ZSAmJiAvXFwuW2EtejAtOV0rJC9pLnRlc3QoY2FuZGlkYXRlKSkge1xuICAgICAgICByZXR1cm4gY2FuZGlkYXRlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBleHRlbnNpb24gPSB0aGlzLmdldEV4dGVuc2lvbkZyb21NaW1lVHlwZShjb250ZW50VHlwZSkgfHwgXCJwbmdcIjtcbiAgICAgIHJldHVybiBjYW5kaWRhdGUgPyBgJHtjYW5kaWRhdGV9LiR7ZXh0ZW5zaW9ufWAgOiBgcmVtb3RlLWltYWdlLiR7ZXh0ZW5zaW9ufWA7XG4gICAgfSBjYXRjaCB7XG4gICAgICBjb25zdCBleHRlbnNpb24gPSB0aGlzLmdldEV4dGVuc2lvbkZyb21NaW1lVHlwZShjb250ZW50VHlwZSkgfHwgXCJwbmdcIjtcbiAgICAgIHJldHVybiBgcmVtb3RlLWltYWdlLiR7ZXh0ZW5zaW9ufWA7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBzYW5pdGl6ZUZpbGVOYW1lKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gZmlsZU5hbWUucmVwbGFjZSgvW1xcXFwvOio/XCI8PnxdKy9nLCBcIi1cIikudHJpbSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRFeHRlbnNpb25Gcm9tTWltZVR5cGUoY29udGVudFR5cGU6IHN0cmluZykge1xuICAgIGNvbnN0IG1pbWVUeXBlID0gY29udGVudFR5cGUuc3BsaXQoXCI7XCIpWzBdLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIHN3aXRjaCAobWltZVR5cGUpIHtcbiAgICAgIGNhc2UgXCJpbWFnZS9qcGVnXCI6XG4gICAgICAgIHJldHVybiBcImpwZ1wiO1xuICAgICAgY2FzZSBcImltYWdlL3BuZ1wiOlxuICAgICAgICByZXR1cm4gXCJwbmdcIjtcbiAgICAgIGNhc2UgXCJpbWFnZS9naWZcIjpcbiAgICAgICAgcmV0dXJuIFwiZ2lmXCI7XG4gICAgICBjYXNlIFwiaW1hZ2Uvd2VicFwiOlxuICAgICAgICByZXR1cm4gXCJ3ZWJwXCI7XG4gICAgICBjYXNlIFwiaW1hZ2UvYm1wXCI6XG4gICAgICAgIHJldHVybiBcImJtcFwiO1xuICAgICAgY2FzZSBcImltYWdlL3N2Zyt4bWxcIjpcbiAgICAgICAgcmV0dXJuIFwic3ZnXCI7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUltYWdlTWltZVR5cGUoY29udGVudFR5cGU6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IG1pbWVUeXBlID0gY29udGVudFR5cGUuc3BsaXQoXCI7XCIpWzBdLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmIChtaW1lVHlwZSAmJiBtaW1lVHlwZSAhPT0gXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIikge1xuICAgICAgcmV0dXJuIG1pbWVUeXBlO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmdldE1pbWVUeXBlRnJvbUZpbGVOYW1lKGZpbGVOYW1lKTtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRCaW5hcnkocmVtb3RlUGF0aDogc3RyaW5nLCBiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nKSB7XG4gICAgYXdhaXQgdGhpcy5lbnN1cmVSZW1vdGVEaXJlY3RvcmllcyhyZW1vdGVQYXRoKTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiUFVUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIFwiQ29udGVudC1UeXBlXCI6IG1pbWVUeXBlLFxyXG4gICAgICB9LFxyXG4gICAgICBib2R5OiBiaW5hcnksXHJcbiAgICB9KTtcclxuXHJcbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVXBsb2FkIGZhaWxlZCB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUVkaXRvclBhc3RlKGV2dDogQ2xpcGJvYXJkRXZlbnQsIGVkaXRvcjogRWRpdG9yLCBpbmZvOiBNYXJrZG93blZpZXcgfCBNYXJrZG93bkZpbGVJbmZvKSB7XG4gICAgaWYgKGV2dC5kZWZhdWx0UHJldmVudGVkIHx8ICFpbmZvLmZpbGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbWFnZUZpbGUgPSB0aGlzLmV4dHJhY3RJbWFnZUZpbGVGcm9tQ2xpcGJvYXJkKGV2dCk7XG4gICAgaWYgKGltYWdlRmlsZSkge1xuICAgICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCBmaWxlTmFtZSA9IGltYWdlRmlsZS5uYW1lIHx8IHRoaXMuYnVpbGRDbGlwYm9hcmRGaWxlTmFtZShpbWFnZUZpbGUudHlwZSk7XG4gICAgICBhd2FpdCB0aGlzLmVucXVldWVFZGl0b3JJbWFnZVVwbG9hZChpbmZvLmZpbGUsIGVkaXRvciwgaW1hZ2VGaWxlLCBmaWxlTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaHRtbCA9IGV2dC5jbGlwYm9hcmREYXRhPy5nZXREYXRhKFwidGV4dC9odG1sXCIpPy50cmltKCkgPz8gXCJcIjtcbiAgICBpZiAoIWh0bWwgfHwgIXRoaXMuaHRtbENvbnRhaW5zUmVtb3RlSW1hZ2VzKGh0bWwpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgYXdhaXQgdGhpcy5oYW5kbGVIdG1sUGFzdGVXaXRoUmVtb3RlSW1hZ2VzKGluZm8uZmlsZSwgZWRpdG9yLCBodG1sKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlRWRpdG9yRHJvcChldnQ6IERyYWdFdmVudCwgZWRpdG9yOiBFZGl0b3IsIGluZm86IE1hcmtkb3duVmlldyB8IE1hcmtkb3duRmlsZUluZm8pIHtcbiAgICBpZiAoZXZ0LmRlZmF1bHRQcmV2ZW50ZWQgfHwgIWluZm8uZmlsZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGltYWdlRmlsZSA9IHRoaXMuZXh0cmFjdEltYWdlRmlsZUZyb21Ecm9wKGV2dCk7XG4gICAgaWYgKCFpbWFnZUZpbGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICBjb25zdCBmaWxlTmFtZSA9IGltYWdlRmlsZS5uYW1lIHx8IHRoaXMuYnVpbGRDbGlwYm9hcmRGaWxlTmFtZShpbWFnZUZpbGUudHlwZSk7XG4gICAgYXdhaXQgdGhpcy5lbnF1ZXVlRWRpdG9ySW1hZ2VVcGxvYWQoaW5mby5maWxlLCBlZGl0b3IsIGltYWdlRmlsZSwgZmlsZU5hbWUpO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRyYWN0SW1hZ2VGaWxlRnJvbUNsaXBib2FyZChldnQ6IENsaXBib2FyZEV2ZW50KSB7XG4gICAgY29uc3QgZGlyZWN0ID0gQXJyYXkuZnJvbShldnQuY2xpcGJvYXJkRGF0YT8uZmlsZXMgPz8gW10pLmZpbmQoKGZpbGUpID0+IGZpbGUudHlwZS5zdGFydHNXaXRoKFwiaW1hZ2UvXCIpKTtcbiAgICBpZiAoZGlyZWN0KSB7XG4gICAgICByZXR1cm4gZGlyZWN0O1xuICAgIH1cblxuICAgIGNvbnN0IGl0ZW0gPSBBcnJheS5mcm9tKGV2dC5jbGlwYm9hcmREYXRhPy5pdGVtcyA/PyBbXSkuZmluZCgoZW50cnkpID0+IGVudHJ5LnR5cGUuc3RhcnRzV2l0aChcImltYWdlL1wiKSk7XG4gICAgcmV0dXJuIGl0ZW0/LmdldEFzRmlsZSgpID8/IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGh0bWxDb250YWluc1JlbW90ZUltYWdlcyhodG1sOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gLzxpbWdcXGJbXj5dKnNyYz1bXCInXWh0dHBzPzpcXC9cXC9bXlwiJ10rW1wiJ11bXj5dKj4vaS50ZXN0KGh0bWwpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVIdG1sUGFzdGVXaXRoUmVtb3RlSW1hZ2VzKG5vdGVGaWxlOiBURmlsZSwgZWRpdG9yOiBFZGl0b3IsIGh0bWw6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZW5kZXJlZCA9IGF3YWl0IHRoaXMuY29udmVydEh0bWxDbGlwYm9hcmRUb1NlY3VyZU1hcmtkb3duKGh0bWwsIG5vdGVGaWxlKTtcbiAgICAgIGlmICghcmVuZGVyZWQudHJpbSgpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgZWRpdG9yLnJlcGxhY2VTZWxlY3Rpb24ocmVuZGVyZWQpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdTVERjJcdTVDMDZcdTdGNTFcdTk4NzVcdTU2RkVcdTY1ODdcdTdDOThcdThEMzRcdTVFNzZcdTYyOTNcdTUzRDZcdThGRENcdTdBMEJcdTU2RkVcdTcyNDdcdTMwMDJcIiwgXCJQYXN0ZWQgd2ViIGNvbnRlbnQgYW5kIGNhcHR1cmVkIHJlbW90ZSBpbWFnZXMuXCIpKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBwYXN0ZSBIVE1MIGNvbnRlbnQgd2l0aCByZW1vdGUgaW1hZ2VzXCIsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgIHRoaXMuZGVzY3JpYmVFcnJvcihcbiAgICAgICAgICB0aGlzLnQoXCJcdTU5MDRcdTc0MDZcdTdGNTFcdTk4NzVcdTU2RkVcdTY1ODdcdTdDOThcdThEMzRcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gcHJvY2VzcyBwYXN0ZWQgd2ViIGNvbnRlbnRcIiksXG4gICAgICAgICAgZXJyb3IsXG4gICAgICAgICksXG4gICAgICAgIDgwMDAsXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY29udmVydEh0bWxDbGlwYm9hcmRUb1NlY3VyZU1hcmtkb3duKGh0bWw6IHN0cmluZywgbm90ZUZpbGU6IFRGaWxlKSB7XG4gICAgY29uc3QgcGFyc2VyID0gbmV3IERPTVBhcnNlcigpO1xuICAgIGNvbnN0IGRvY3VtZW50ID0gcGFyc2VyLnBhcnNlRnJvbVN0cmluZyhodG1sLCBcInRleHQvaHRtbFwiKTtcbiAgICBjb25zdCB1cGxvYWRDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgY29uc3QgcmVuZGVyZWRCbG9ja3M6IHN0cmluZ1tdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IG5vZGUgb2YgQXJyYXkuZnJvbShkb2N1bWVudC5ib2R5LmNoaWxkTm9kZXMpKSB7XG4gICAgICBjb25zdCBibG9jayA9IGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbE5vZGUobm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCAwKTtcbiAgICAgIGlmIChibG9jay50cmltKCkpIHtcbiAgICAgICAgcmVuZGVyZWRCbG9ja3MucHVzaChibG9jay50cmltKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZW5kZXJlZEJsb2Nrcy5qb2luKFwiXFxuXFxuXCIpICsgXCJcXG5cIjtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVuZGVyUGFzdGVkSHRtbE5vZGUoXG4gICAgbm9kZTogTm9kZSxcbiAgICBub3RlRmlsZTogVEZpbGUsXG4gICAgdXBsb2FkQ2FjaGU6IE1hcDxzdHJpbmcsIHN0cmluZz4sXG4gICAgbGlzdERlcHRoOiBudW1iZXIsXG4gICk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKSB7XG4gICAgICByZXR1cm4gdGhpcy5ub3JtYWxpemVDbGlwYm9hcmRUZXh0KG5vZGUudGV4dENvbnRlbnQgPz8gXCJcIik7XG4gICAgfVxuXG4gICAgaWYgKCEobm9kZSBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSkge1xuICAgICAgcmV0dXJuIFwiXCI7XG4gICAgfVxuXG4gICAgY29uc3QgdGFnID0gbm9kZS50YWdOYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKHRhZyA9PT0gXCJpbWdcIikge1xuICAgICAgY29uc3Qgc3JjID0gdGhpcy51bmVzY2FwZUh0bWwobm9kZS5nZXRBdHRyaWJ1dGUoXCJzcmNcIik/LnRyaW0oKSA/PyBcIlwiKTtcbiAgICAgIGlmICghdGhpcy5pc0h0dHBVcmwoc3JjKSkge1xuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgYWx0ID0gKG5vZGUuZ2V0QXR0cmlidXRlKFwiYWx0XCIpID8/IFwiXCIpLnRyaW0oKSB8fCB0aGlzLmdldERpc3BsYXlOYW1lRnJvbVVybChzcmMpO1xuICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRSZW1vdGVJbWFnZVVybChzcmMsIHVwbG9hZENhY2hlKTtcbiAgICAgIHJldHVybiB0aGlzLmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsLCBhbHQpO1xuICAgIH1cblxuICAgIGlmICh0YWcgPT09IFwiYnJcIikge1xuICAgICAgcmV0dXJuIFwiXFxuXCI7XG4gICAgfVxuXG4gICAgaWYgKHRhZyA9PT0gXCJ1bFwiIHx8IHRhZyA9PT0gXCJvbFwiKSB7XG4gICAgICBjb25zdCBpdGVtczogc3RyaW5nW10gPSBbXTtcbiAgICAgIGxldCBpbmRleCA9IDE7XG4gICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIEFycmF5LmZyb20obm9kZS5jaGlsZHJlbikpIHtcbiAgICAgICAgaWYgKGNoaWxkLnRhZ05hbWUudG9Mb3dlckNhc2UoKSAhPT0gXCJsaVwiKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZW5kZXJlZCA9IChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxOb2RlKGNoaWxkLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCArIDEpKS50cmltKCk7XG4gICAgICAgIGlmICghcmVuZGVyZWQpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHByZWZpeCA9IHRhZyA9PT0gXCJvbFwiID8gYCR7aW5kZXh9LiBgIDogXCItIFwiO1xuICAgICAgICBpdGVtcy5wdXNoKGAke1wiICBcIi5yZXBlYXQoTWF0aC5tYXgoMCwgbGlzdERlcHRoKSl9JHtwcmVmaXh9JHtyZW5kZXJlZH1gKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGl0ZW1zLmpvaW4oXCJcXG5cIik7XG4gICAgfVxuXG4gICAgaWYgKHRhZyA9PT0gXCJsaVwiKSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKTtcbiAgICAgIHJldHVybiBwYXJ0cy5qb2luKFwiXCIpLnRyaW0oKTtcbiAgICB9XG5cbiAgICBpZiAoL15oWzEtNl0kLy50ZXN0KHRhZykpIHtcbiAgICAgIGNvbnN0IGxldmVsID0gTnVtYmVyLnBhcnNlSW50KHRhZ1sxXSwgMTApO1xuICAgICAgY29uc3QgdGV4dCA9IChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIikudHJpbSgpO1xuICAgICAgcmV0dXJuIHRleHQgPyBgJHtcIiNcIi5yZXBlYXQobGV2ZWwpfSAke3RleHR9YCA6IFwiXCI7XG4gICAgfVxuXG4gICAgaWYgKHRhZyA9PT0gXCJhXCIpIHtcbiAgICAgIGNvbnN0IGhyZWYgPSBub2RlLmdldEF0dHJpYnV0ZShcImhyZWZcIik/LnRyaW0oKSA/PyBcIlwiO1xuICAgICAgY29uc3QgdGV4dCA9IChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIikudHJpbSgpO1xuICAgICAgaWYgKGhyZWYgJiYgL15odHRwcz86XFwvXFwvL2kudGVzdChocmVmKSAmJiB0ZXh0KSB7XG4gICAgICAgIHJldHVybiBgWyR7dGV4dH1dKCR7aHJlZn0pYDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0ZXh0O1xuICAgIH1cblxuICAgIGNvbnN0IGlubGluZVRhZ3MgPSBuZXcgU2V0KFtcInN0cm9uZ1wiLCBcImJcIiwgXCJlbVwiLCBcImlcIiwgXCJzcGFuXCIsIFwiY29kZVwiLCBcInNtYWxsXCIsIFwic3VwXCIsIFwic3ViXCJdKTtcbiAgICBpZiAoaW5saW5lVGFncy5oYXModGFnKSkge1xuICAgICAgcmV0dXJuIChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIik7XG4gICAgfVxuXG4gICAgY29uc3QgYmxvY2tUYWdzID0gbmV3IFNldChbXG4gICAgICBcInBcIixcbiAgICAgIFwiZGl2XCIsXG4gICAgICBcImFydGljbGVcIixcbiAgICAgIFwic2VjdGlvblwiLFxuICAgICAgXCJmaWd1cmVcIixcbiAgICAgIFwiZmlnY2FwdGlvblwiLFxuICAgICAgXCJibG9ja3F1b3RlXCIsXG4gICAgICBcInByZVwiLFxuICAgICAgXCJ0YWJsZVwiLFxuICAgICAgXCJ0aGVhZFwiLFxuICAgICAgXCJ0Ym9keVwiLFxuICAgICAgXCJ0clwiLFxuICAgICAgXCJ0ZFwiLFxuICAgICAgXCJ0aFwiLFxuICAgIF0pO1xuICAgIGlmIChibG9ja1RhZ3MuaGFzKHRhZykpIHtcbiAgICAgIGNvbnN0IHRleHQgPSAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpLnRyaW0oKTtcbiAgICAgIHJldHVybiB0ZXh0O1xuICAgIH1cblxuICAgIHJldHVybiAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4oXG4gICAgZWxlbWVudDogSFRNTEVsZW1lbnQsXG4gICAgbm90ZUZpbGU6IFRGaWxlLFxuICAgIHVwbG9hZENhY2hlOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuICAgIGxpc3REZXB0aDogbnVtYmVyLFxuICApIHtcbiAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIEFycmF5LmZyb20oZWxlbWVudC5jaGlsZE5vZGVzKSkge1xuICAgICAgY29uc3QgcmVuZGVyZWQgPSBhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxOb2RlKGNoaWxkLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCk7XG4gICAgICBpZiAoIXJlbmRlcmVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAocGFydHMubGVuZ3RoID4gMCAmJiAhcmVuZGVyZWQuc3RhcnRzV2l0aChcIlxcblwiKSAmJiAhcGFydHNbcGFydHMubGVuZ3RoIC0gMV0uZW5kc1dpdGgoXCJcXG5cIikpIHtcbiAgICAgICAgY29uc3QgcHJldmlvdXMgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXTtcbiAgICAgICAgY29uc3QgbmVlZHNTcGFjZSA9IC9cXFMkLy50ZXN0KHByZXZpb3VzKSAmJiAvXlxcUy8udGVzdChyZW5kZXJlZCk7XG4gICAgICAgIGlmIChuZWVkc1NwYWNlKSB7XG4gICAgICAgICAgcGFydHMucHVzaChcIiBcIik7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcGFydHMucHVzaChyZW5kZXJlZCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhcnRzO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVDbGlwYm9hcmRUZXh0KHZhbHVlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdmFsdWUucmVwbGFjZSgvXFxzKy9nLCBcIiBcIik7XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RJbWFnZUZpbGVGcm9tRHJvcChldnQ6IERyYWdFdmVudCkge1xuICAgIHJldHVybiBBcnJheS5mcm9tKGV2dC5kYXRhVHJhbnNmZXI/LmZpbGVzID8/IFtdKS5maW5kKChmaWxlKSA9PiBmaWxlLnR5cGUuc3RhcnRzV2l0aChcImltYWdlL1wiKSkgPz8gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZW5xdWV1ZUVkaXRvckltYWdlVXBsb2FkKG5vdGVGaWxlOiBURmlsZSwgZWRpdG9yOiBFZGl0b3IsIGltYWdlRmlsZTogRmlsZSwgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBhcnJheUJ1ZmZlciA9IGF3YWl0IGltYWdlRmlsZS5hcnJheUJ1ZmZlcigpO1xuICAgICAgY29uc3QgdGFzayA9IHRoaXMuY3JlYXRlVXBsb2FkVGFzayhcbiAgICAgICAgbm90ZUZpbGUucGF0aCxcbiAgICAgICAgYXJyYXlCdWZmZXIsXG4gICAgICAgIGltYWdlRmlsZS50eXBlIHx8IHRoaXMuZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUoZmlsZU5hbWUpLFxuICAgICAgICBmaWxlTmFtZSxcbiAgICAgICk7XG4gICAgICB0aGlzLmluc2VydFBsYWNlaG9sZGVyKGVkaXRvciwgdGFzay5wbGFjZWhvbGRlcik7XG4gICAgICB0aGlzLnF1ZXVlLnB1c2godGFzayk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgdm9pZCB0aGlzLnByb2Nlc3NQZW5kaW5nVGFza3MoKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1REYyXHU1MkEwXHU1MTY1XHU1NkZFXHU3MjQ3XHU4MUVBXHU1MkE4XHU0RTBBXHU0RjIwXHU5NjFGXHU1MjE3XHUzMDAyXCIsIFwiSW1hZ2UgYWRkZWQgdG8gdGhlIGF1dG8tdXBsb2FkIHF1ZXVlLlwiKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcXVldWUgc2VjdXJlIGltYWdlIHVwbG9hZFwiLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTUyQTBcdTUxNjVcdTU2RkVcdTcyNDdcdTgxRUFcdTUyQThcdTRFMEFcdTRGMjBcdTk2MUZcdTUyMTdcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gcXVldWUgaW1hZ2UgZm9yIGF1dG8tdXBsb2FkXCIpLCBlcnJvciksIDgwMDApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlVXBsb2FkVGFzayhub3RlUGF0aDogc3RyaW5nLCBiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKTogVXBsb2FkVGFzayB7XG4gICAgY29uc3QgaWQgPSBgc2VjdXJlLXdlYmRhdi10YXNrLSR7RGF0ZS5ub3coKX0tJHtNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLCA4KX1gO1xuICAgIHJldHVybiB7XG4gICAgICBpZCxcbiAgICAgIG5vdGVQYXRoLFxuICAgICAgcGxhY2Vob2xkZXI6IHRoaXMuYnVpbGRQZW5kaW5nUGxhY2Vob2xkZXIoaWQsIGZpbGVOYW1lKSxcbiAgICAgIG1pbWVUeXBlLFxuICAgICAgZmlsZU5hbWUsXG4gICAgICBkYXRhQmFzZTY0OiB0aGlzLmFycmF5QnVmZmVyVG9CYXNlNjQoYmluYXJ5KSxcbiAgICAgIGF0dGVtcHRzOiAwLFxuICAgICAgY3JlYXRlZEF0OiBEYXRlLm5vdygpLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkUGVuZGluZ1BsYWNlaG9sZGVyKHRhc2tJZDogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3Qgc2FmZU5hbWUgPSB0aGlzLmVzY2FwZUh0bWwoZmlsZU5hbWUpO1xuICAgIHJldHVybiBgPHNwYW4gY2xhc3M9XCJzZWN1cmUtd2ViZGF2LXBlbmRpbmdcIiBkYXRhLXNlY3VyZS13ZWJkYXYtdGFzaz1cIiR7dGFza0lkfVwiIGFyaWEtbGFiZWw9XCIke3NhZmVOYW1lfVwiPiR7dGhpcy5lc2NhcGVIdG1sKHRoaXMudChgXHUzMDEwXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU0RTJEXHVGRjVDJHtmaWxlTmFtZX1cdTMwMTFgLCBgW1VwbG9hZGluZyBpbWFnZSB8ICR7ZmlsZU5hbWV9XWApKX08L3NwYW4+YDtcbiAgfVxuXG4gIHByaXZhdGUgaW5zZXJ0UGxhY2Vob2xkZXIoZWRpdG9yOiBFZGl0b3IsIHBsYWNlaG9sZGVyOiBzdHJpbmcpIHtcbiAgICBlZGl0b3IucmVwbGFjZVNlbGVjdGlvbihgJHtwbGFjZWhvbGRlcn1cXG5gKTtcbiAgfVxuXG4gIGFzeW5jIHN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50KHNob3dOb3RpY2UgPSB0cnVlKSB7XG4gICAgaWYgKHRoaXMuc3luY0luUHJvZ3Jlc3MpIHtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1NDBDXHU2QjY1XHU2QjYzXHU1NzI4XHU4RkRCXHU4ODRDXHU0RTJEXHUzMDAyXCIsIFwiQSBzeW5jIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MuXCIpLCA0MDAwKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnN5bmNJblByb2dyZXNzID0gdHJ1ZTtcbiAgICB0cnkge1xuICAgICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG4gICAgICBhd2FpdCB0aGlzLnJlYnVpbGRSZWZlcmVuY2VJbmRleCgpO1xuXG4gICAgICBjb25zdCByZW1vdGVJbnZlbnRvcnkgPSBhd2FpdCB0aGlzLmxpc3RSZW1vdGVUcmVlKHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKTtcbiAgICAgIGNvbnN0IGRlbGV0aW9uVG9tYnN0b25lcyA9IGF3YWl0IHRoaXMucmVhZERlbGV0aW9uVG9tYnN0b25lcygpO1xuICAgICAgY29uc3QgcmVtb3RlRmlsZXMgPSByZW1vdGVJbnZlbnRvcnkuZmlsZXM7XG4gICAgICBsZXQgcmVzdG9yZWRGcm9tUmVtb3RlID0gMDtcbiAgICAgIGxldCBkZWxldGVkUmVtb3RlRmlsZXMgPSAwO1xuICAgICAgbGV0IGRlbGV0ZWRMb2NhbEZpbGVzID0gMDtcbiAgICAgIGxldCBkZWxldGVkTG9jYWxTdHVicyA9IDA7XG5cbiAgICAgIGxldCBmaWxlcyA9IHRoaXMuY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCk7XG4gICAgICBsZXQgY3VycmVudFBhdGhzID0gbmV3IFNldChmaWxlcy5tYXAoKGZpbGUpID0+IGZpbGUucGF0aCkpO1xuICAgICAgZm9yIChjb25zdCBwYXRoIG9mIFsuLi50aGlzLnN5bmNJbmRleC5rZXlzKCldKSB7XG4gICAgICAgIGlmICghY3VycmVudFBhdGhzLmhhcyhwYXRoKSkge1xuICAgICAgICAgIGNvbnN0IHByZXZpb3VzID0gdGhpcy5zeW5jSW5kZXguZ2V0KHBhdGgpO1xuICAgICAgICAgIGlmICghcHJldmlvdXMpIHtcbiAgICAgICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShwYXRoKTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHJlbW90ZSA9IHJlbW90ZUZpbGVzLmdldChwcmV2aW91cy5yZW1vdGVQYXRoKTtcbiAgICAgICAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKHBhdGgpO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldChwYXRoKTtcbiAgICAgICAgICBpZiAodG9tYnN0b25lICYmIHRoaXMuaXNUb21ic3RvbmVBdXRob3JpdGF0aXZlKHRvbWJzdG9uZSwgcmVtb3RlKSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgICAgICByZW1vdGVGaWxlcy5kZWxldGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKHBhdGgpO1xuICAgICAgICAgICAgZGVsZXRlZFJlbW90ZUZpbGVzICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKHBhdGgpO1xuICAgICAgICAgICAgZGVsZXRpb25Ub21ic3RvbmVzLmRlbGV0ZShwYXRoKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocHJldmlvdXMucmVtb3RlU2lnbmF0dXJlICYmIHByZXZpb3VzLnJlbW90ZVNpZ25hdHVyZSAhPT0gcmVtb3RlLnNpZ25hdHVyZSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KHBhdGgsIHJlbW90ZSk7XG4gICAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQocGF0aCwge1xuICAgICAgICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgICAgICByZW1vdGVQYXRoOiByZW1vdGUucmVtb3RlUGF0aCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmVzdG9yZWRGcm9tUmVtb3RlICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQocGF0aCwgcmVtb3RlKTtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQocGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVQYXRoOiByZW1vdGUucmVtb3RlUGF0aCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXN0b3JlZEZyb21SZW1vdGUgKz0gMTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBsZXQgdXBsb2FkZWQgPSAwO1xuICAgICAgbGV0IHNraXBwZWQgPSAwO1xuICAgICAgbGV0IG1pc3NpbmdSZW1vdGVCYWNrZWROb3RlcyA9IDA7XG4gICAgICBsZXQgcHVyZ2VkTWlzc2luZ0xhenlOb3RlcyA9IDA7XG5cbiAgICAgIGZpbGVzID0gdGhpcy5jb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKTtcbiAgICAgIGN1cnJlbnRQYXRocyA9IG5ldyBTZXQoZmlsZXMubWFwKChmaWxlKSA9PiBmaWxlLnBhdGgpKTtcbiAgICAgIGZvciAoY29uc3QgcmVtb3RlIG9mIFsuLi5yZW1vdGVGaWxlcy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5yZW1vdGVQYXRoLmxvY2FsZUNvbXBhcmUoYi5yZW1vdGVQYXRoKSkpIHtcbiAgICAgICAgY29uc3QgdmF1bHRQYXRoID0gdGhpcy5yZW1vdGVQYXRoVG9WYXVsdFBhdGgocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICBpZiAoIXZhdWx0UGF0aCB8fCBjdXJyZW50UGF0aHMuaGFzKHZhdWx0UGF0aCkpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICBjb25zdCB0b21ic3RvbmUgPSBkZWxldGlvblRvbWJzdG9uZXMuZ2V0KHZhdWx0UGF0aCk7XG4gICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgIGlmICh0aGlzLmlzVG9tYnN0b25lQXV0aG9yaXRhdGl2ZSh0b21ic3RvbmUsIHJlbW90ZSkpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICByZW1vdGVGaWxlcy5kZWxldGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICAgIGRlbGV0ZWRSZW1vdGVGaWxlcyArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZSh2YXVsdFBhdGgpO1xuICAgICAgICBkZWxldGlvblRvbWJzdG9uZXMuZGVsZXRlKHZhdWx0UGF0aCk7XG4gICAgICB9XG5cbiAgICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KHZhdWx0UGF0aCwgcmVtb3RlKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KHZhdWx0UGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVQYXRoOiByZW1vdGUucmVtb3RlUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlc3RvcmVkRnJvbVJlbW90ZSArPSAxO1xuICAgICAgfVxuXG4gICAgICBmaWxlcyA9IHRoaXMuY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCk7XG4gICAgICBjdXJyZW50UGF0aHMgPSBuZXcgU2V0KGZpbGVzLm1hcCgoZmlsZSkgPT4gZmlsZS5wYXRoKSk7XG4gICAgICBjb25zdCBsb2NhbFJlbW90ZVBhdGhzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgICBsZXQgZG93bmxvYWRlZE9yVXBkYXRlZCA9IDA7XG4gICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgIGxvY2FsUmVtb3RlUGF0aHMuYWRkKHJlbW90ZVBhdGgpO1xuICAgICAgICBjb25zdCByZW1vdGUgPSByZW1vdGVGaWxlcy5nZXQocmVtb3RlUGF0aCk7XG4gICAgICAgIGNvbnN0IHJlbW90ZVNpZ25hdHVyZSA9IHJlbW90ZT8uc2lnbmF0dXJlID8/IFwiXCI7XG4gICAgICAgIGNvbnN0IGxvY2FsU2lnbmF0dXJlID0gdGhpcy5idWlsZFN5bmNTaWduYXR1cmUoZmlsZSk7XG4gICAgICAgIGNvbnN0IHByZXZpb3VzID0gdGhpcy5zeW5jSW5kZXguZ2V0KGZpbGUucGF0aCk7XG5cbiAgICAgICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgICAgICBjb25zdCBzdHViID0gdGhpcy5wYXJzZU5vdGVTdHViKGNvbnRlbnQpO1xuICAgICAgICAgIGlmIChzdHViKSB7XG4gICAgICAgICAgICBjb25zdCBzdHViUmVtb3RlID0gcmVtb3RlRmlsZXMuZ2V0KHN0dWIucmVtb3RlUGF0aCk7XG4gICAgICAgICAgICBjb25zdCB0b21ic3RvbmUgPSBkZWxldGlvblRvbWJzdG9uZXMuZ2V0KGZpbGUucGF0aCk7XG4gICAgICAgICAgICBpZiAoIXN0dWJSZW1vdGUgJiYgdG9tYnN0b25lKSB7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucmVtb3ZlTG9jYWxWYXVsdEZpbGUoZmlsZSk7XG4gICAgICAgICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgICAgICAgICB0aGlzLmNsZWFyTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgICAgZGVsZXRlZExvY2FsRmlsZXMgKz0gMTtcbiAgICAgICAgICAgICAgZGVsZXRlZExvY2FsU3R1YnMgKz0gMTtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXN0dWJSZW1vdGUpIHtcbiAgICAgICAgICAgICAgY29uc3QgbWlzc2luZ1JlY29yZCA9IHRoaXMubWFya01pc3NpbmdMYXp5UmVtb3RlKGZpbGUucGF0aCk7XG4gICAgICAgICAgICAgIGlmIChtaXNzaW5nUmVjb3JkLm1pc3NDb3VudCA+PSB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlQ29uZmlybWF0aW9ucykge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucmVtb3ZlTG9jYWxWYXVsdEZpbGUoZmlsZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jbGVhck1pc3NpbmdMYXp5UmVtb3RlKGZpbGUucGF0aCk7XG4gICAgICAgICAgICAgICAgZGVsZXRlZExvY2FsRmlsZXMgKz0gMTtcbiAgICAgICAgICAgICAgICBkZWxldGVkTG9jYWxTdHVicyArPSAxO1xuICAgICAgICAgICAgICAgIHB1cmdlZE1pc3NpbmdMYXp5Tm90ZXMgKz0gMTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBtaXNzaW5nUmVtb3RlQmFja2VkTm90ZXMgKz0gMTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHRoaXMuY2xlYXJNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiBzdHViUmVtb3RlPy5zaWduYXR1cmUgPz8gcHJldmlvdXM/LnJlbW90ZVNpZ25hdHVyZSA/PyBcIlwiLFxuICAgICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBza2lwcGVkICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0b21ic3RvbmUgPSBkZWxldGlvblRvbWJzdG9uZXMuZ2V0KGZpbGUucGF0aCk7XG4gICAgICAgIGNvbnN0IHVuY2hhbmdlZFNpbmNlTGFzdFN5bmMgPSBwcmV2aW91cyA/IHByZXZpb3VzLmxvY2FsU2lnbmF0dXJlID09PSBsb2NhbFNpZ25hdHVyZSA6IGZhbHNlO1xuICAgICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgdW5jaGFuZ2VkU2luY2VMYXN0U3luYyAmJlxuICAgICAgICAgICAgdGhpcy5zaG91bGREZWxldGVMb2NhbEZyb21Ub21ic3RvbmUoZmlsZSwgdG9tYnN0b25lKSAmJlxuICAgICAgICAgICAgdGhpcy5pc1RvbWJzdG9uZUF1dGhvcml0YXRpdmUodG9tYnN0b25lLCByZW1vdGUpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGUpO1xuICAgICAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICAgICAgICBkZWxldGVkTG9jYWxGaWxlcyArPSAxO1xuICAgICAgICAgICAgaWYgKHJlbW90ZSkge1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICAgICAgcmVtb3RlRmlsZXMuZGVsZXRlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICAgICAgZGVsZXRlZFJlbW90ZUZpbGVzICs9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCk7XG4gICAgICAgICAgZGVsZXRpb25Ub21ic3RvbmVzLmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoKTtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZW1vdGVGaWxlcy5zZXQocmVtb3RlUGF0aCwgdXBsb2FkZWRSZW1vdGUpO1xuICAgICAgICAgIHVwbG9hZGVkICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXByZXZpb3VzKSB7XG4gICAgICAgICAgaWYgKGxvY2FsU2lnbmF0dXJlID09PSByZW1vdGVTaWduYXR1cmUpIHtcbiAgICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgICAgICAgc2tpcHBlZCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHRoaXMuc2hvdWxkRG93bmxvYWRSZW1vdGVWZXJzaW9uKGZpbGUuc3RhdC5tdGltZSwgcmVtb3RlLmxhc3RNb2RpZmllZCkpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuZG93bmxvYWRSZW1vdGVGaWxlVG9WYXVsdChmaWxlLnBhdGgsIHJlbW90ZSwgZmlsZSk7XG4gICAgICAgICAgICBjb25zdCByZWZyZXNoZWQgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChmaWxlLnBhdGgpO1xuICAgICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVmcmVzaGVkID8gdGhpcy5idWlsZFN5bmNTaWduYXR1cmUocmVmcmVzaGVkKSA6IHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBkb3dubG9hZGVkT3JVcGRhdGVkICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoKTtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZW1vdGVGaWxlcy5zZXQocmVtb3RlUGF0aCwgdXBsb2FkZWRSZW1vdGUpO1xuICAgICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgICB1cGxvYWRlZCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbG9jYWxDaGFuZ2VkID0gcHJldmlvdXMubG9jYWxTaWduYXR1cmUgIT09IGxvY2FsU2lnbmF0dXJlIHx8IHByZXZpb3VzLnJlbW90ZVBhdGggIT09IHJlbW90ZVBhdGg7XG4gICAgICAgIGNvbnN0IHJlbW90ZUNoYW5nZWQgPSBwcmV2aW91cy5yZW1vdGVTaWduYXR1cmUgIT09IHJlbW90ZVNpZ25hdHVyZSB8fCBwcmV2aW91cy5yZW1vdGVQYXRoICE9PSByZW1vdGVQYXRoO1xuICAgICAgICBpZiAoIWxvY2FsQ2hhbmdlZCAmJiAhcmVtb3RlQ2hhbmdlZCkge1xuICAgICAgICAgIHNraXBwZWQgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghbG9jYWxDaGFuZ2VkICYmIHJlbW90ZUNoYW5nZWQpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgICAgICAgIGNvbnN0IHJlZnJlc2hlZCA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IHRoaXMuYnVpbGRTeW5jU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGRvd25sb2FkZWRPclVwZGF0ZWQgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChsb2NhbENoYW5nZWQgJiYgIXJlbW90ZUNoYW5nZWQpIHtcbiAgICAgICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoKTtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZW1vdGVGaWxlcy5zZXQocmVtb3RlUGF0aCwgdXBsb2FkZWRSZW1vdGUpO1xuICAgICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgICB1cGxvYWRlZCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuc2hvdWxkRG93bmxvYWRSZW1vdGVWZXJzaW9uKGZpbGUuc3RhdC5tdGltZSwgcmVtb3RlLmxhc3RNb2RpZmllZCkpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgICAgICAgIGNvbnN0IHJlZnJlc2hlZCA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IHRoaXMuYnVpbGRTeW5jU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGRvd25sb2FkZWRPclVwZGF0ZWQgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHVwbG9hZGVkUmVtb3RlID0gYXdhaXQgdGhpcy51cGxvYWRDb250ZW50RmlsZVRvUmVtb3RlKGZpbGUsIHJlbW90ZVBhdGgpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiB1cGxvYWRlZFJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlbW90ZUZpbGVzLnNldChyZW1vdGVQYXRoLCB1cGxvYWRlZFJlbW90ZSk7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgdXBsb2FkZWQgKz0gMTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzID0gYXdhaXQgdGhpcy5kZWxldGVFeHRyYVJlbW90ZURpcmVjdG9yaWVzKFxuICAgICAgICByZW1vdGVJbnZlbnRvcnkuZGlyZWN0b3JpZXMsXG4gICAgICAgIHRoaXMuYnVpbGRFeHBlY3RlZFJlbW90ZURpcmVjdG9yaWVzKGxvY2FsUmVtb3RlUGF0aHMsIHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKSxcbiAgICAgICk7XG4gICAgICBjb25zdCBpbWFnZUNsZWFudXAgPSBhd2FpdCB0aGlzLnJlY29uY2lsZVJlbW90ZUltYWdlcygpO1xuICAgICAgY29uc3QgZXZpY3RlZE5vdGVzID0gYXdhaXQgdGhpcy5ldmljdFN0YWxlU3luY2VkTm90ZXMoZmFsc2UpO1xuXG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLnQoXG4gICAgICAgIGBcdTVERjJcdTUzQ0NcdTU0MTFcdTU0MENcdTZCNjVcdUZGMUFcdTRFMEFcdTRGMjAgJHt1cGxvYWRlZH0gXHU0RTJBXHU2NTg3XHU0RUY2XHVGRjBDXHU0RUNFXHU4RkRDXHU3QUVGXHU2MkM5XHU1M0Q2ICR7cmVzdG9yZWRGcm9tUmVtb3RlICsgZG93bmxvYWRlZE9yVXBkYXRlZH0gXHU0RTJBXHU2NTg3XHU0RUY2XHVGRjBDXHU4REYzXHU4RkM3ICR7c2tpcHBlZH0gXHU0RTJBXHU2NzJBXHU1M0Q4XHU1MzE2XHU2NTg3XHU0RUY2XHVGRjBDXHU1MjIwXHU5NjY0XHU4RkRDXHU3QUVGXHU1MTg1XHU1QkI5ICR7ZGVsZXRlZFJlbW90ZUZpbGVzfSBcdTRFMkFcdTMwMDFcdTY3MkNcdTU3MzBcdTUxODVcdTVCQjkgJHtkZWxldGVkTG9jYWxGaWxlc30gXHU0RTJBJHtkZWxldGVkTG9jYWxTdHVicyA+IDAgPyBgXHVGRjA4XHU1MTc2XHU0RTJEXHU1OTMxXHU2NTQ4XHU1MzYwXHU0RjREXHU3QjE0XHU4QkIwICR7ZGVsZXRlZExvY2FsU3R1YnN9IFx1N0JDN1x1RkYwOWAgOiBcIlwifVx1RkYwQ1x1NkUwNVx1NzQwNlx1OEZEQ1x1N0FFRlx1N0E3QVx1NzZFRVx1NUY1NSAke2RlbGV0ZWRSZW1vdGVEaXJlY3Rvcmllc30gXHU0RTJBXHVGRjBDXHU2RTA1XHU3NDA2XHU1MTk3XHU0RjU5XHU1NkZFXHU3MjQ3ICR7aW1hZ2VDbGVhbnVwLmRlbGV0ZWRGaWxlc30gXHU1RjIwXHUzMDAxXHU3NkVFXHU1RjU1ICR7aW1hZ2VDbGVhbnVwLmRlbGV0ZWREaXJlY3Rvcmllc30gXHU0RTJBJHtldmljdGVkTm90ZXMgPiAwID8gYFx1RkYwQ1x1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1NjVFN1x1N0IxNFx1OEJCMCAke2V2aWN0ZWROb3Rlc30gXHU3QkM3YCA6IFwiXCJ9JHttaXNzaW5nUmVtb3RlQmFja2VkTm90ZXMgPiAwID8gYFx1RkYwQ1x1NUU3Nlx1NTNEMVx1NzNCMCAke21pc3NpbmdSZW1vdGVCYWNrZWROb3Rlc30gXHU3QkM3XHU2MzA5XHU5NzAwXHU3QjE0XHU4QkIwXHU3RjNBXHU1QzExXHU4RkRDXHU3QUVGXHU2QjYzXHU2NTg3YCA6IFwiXCJ9JHtwdXJnZWRNaXNzaW5nTGF6eU5vdGVzID4gMCA/IGBcdUZGMENcdTc4NkVcdThCQTRcdTZFMDVcdTc0MDZcdTU5MzFcdTY1NDhcdTUzNjBcdTRGNERcdTdCMTRcdThCQjAgJHtwdXJnZWRNaXNzaW5nTGF6eU5vdGVzfSBcdTdCQzdgIDogXCJcIn1cdTMwMDJgLFxuICAgICAgICBgQmlkaXJlY3Rpb25hbCBzeW5jIHVwbG9hZGVkICR7dXBsb2FkZWR9IGZpbGUocyksIHB1bGxlZCAke3Jlc3RvcmVkRnJvbVJlbW90ZSArIGRvd25sb2FkZWRPclVwZGF0ZWR9IGZpbGUocykgZnJvbSByZW1vdGUsIHNraXBwZWQgJHtza2lwcGVkfSB1bmNoYW5nZWQgZmlsZShzKSwgZGVsZXRlZCAke2RlbGV0ZWRSZW1vdGVGaWxlc30gcmVtb3RlIGNvbnRlbnQgZmlsZShzKSBhbmQgJHtkZWxldGVkTG9jYWxGaWxlc30gbG9jYWwgZmlsZShzKSR7ZGVsZXRlZExvY2FsU3R1YnMgPiAwID8gYCAoaW5jbHVkaW5nICR7ZGVsZXRlZExvY2FsU3R1YnN9IHN0YWxlIHN0dWIgbm90ZShzKSlgIDogXCJcIn0sIHJlbW92ZWQgJHtkZWxldGVkUmVtb3RlRGlyZWN0b3JpZXN9IHJlbW90ZSBkaXJlY3RvciR7ZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzID09PSAxID8gXCJ5XCIgOiBcImllc1wifSwgY2xlYW5lZCAke2ltYWdlQ2xlYW51cC5kZWxldGVkRmlsZXN9IG9ycGhhbmVkIHJlbW90ZSBpbWFnZShzKSBwbHVzICR7aW1hZ2VDbGVhbnVwLmRlbGV0ZWREaXJlY3Rvcmllc30gZGlyZWN0b3Ike2ltYWdlQ2xlYW51cC5kZWxldGVkRGlyZWN0b3JpZXMgPT09IDEgPyBcInlcIiA6IFwiaWVzXCJ9JHtldmljdGVkTm90ZXMgPiAwID8gYCwgYW5kIGV2aWN0ZWQgJHtldmljdGVkTm90ZXN9IHN0YWxlIGxvY2FsIG5vdGUocylgIDogXCJcIn0ke21pc3NpbmdSZW1vdGVCYWNrZWROb3RlcyA+IDAgPyBgLCB3aGlsZSBkZXRlY3RpbmcgJHttaXNzaW5nUmVtb3RlQmFja2VkTm90ZXN9IGxhenkgbm90ZShzKSBtaXNzaW5nIHRoZWlyIHJlbW90ZSBjb250ZW50YCA6IFwiXCJ9JHtwdXJnZWRNaXNzaW5nTGF6eU5vdGVzID4gMCA/IGAsIGFuZCBwdXJnZWQgJHtwdXJnZWRNaXNzaW5nTGF6eU5vdGVzfSBjb25maXJtZWQgYnJva2VuIGxhenkgcGxhY2Vob2xkZXIocylgIDogXCJcIn0uYCxcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsIDgwMDApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiVmF1bHQgY29udGVudCBzeW5jIGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU1MTg1XHU1QkI5XHU1NDBDXHU2QjY1XHU1OTMxXHU4RDI1XCIsIFwiQ29udGVudCBzeW5jIGZhaWxlZFwiKSwgZXJyb3IpO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzLCA4MDAwKTtcbiAgICAgIH1cbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy5zeW5jSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZGVsZXRlUmVtb3RlQ29udGVudEZpbGUocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgICBtZXRob2Q6IFwiREVMRVRFXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgIT09IDQwNCAmJiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgREVMRVRFIGZhaWxlZCB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBkZWxldGUgcmVtb3RlIHN5bmNlZCBjb250ZW50XCIsIHJlbW90ZVBhdGgsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRSZW1vdGVTeW5jU2lnbmF0dXJlKHJlbW90ZTogUGljazxSZW1vdGVGaWxlU3RhdGUsIFwibGFzdE1vZGlmaWVkXCIgfCBcInNpemVcIj4pIHtcbiAgICByZXR1cm4gYCR7cmVtb3RlLmxhc3RNb2RpZmllZH06JHtyZW1vdGUuc2l6ZX1gO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZERlbGV0aW9uRm9sZGVyKCkge1xuICAgIHJldHVybiBgJHt0aGlzLm5vcm1hbGl6ZUZvbGRlcih0aGlzLnNldHRpbmdzLnZhdWx0U3luY1JlbW90ZUZvbGRlcikucmVwbGFjZSgvXFwvJC8sIFwiXCIpfSR7dGhpcy5kZWxldGlvbkZvbGRlclN1ZmZpeH1gO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZERlbGV0aW9uUmVtb3RlUGF0aCh2YXVsdFBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IGVuY29kZWQgPSB0aGlzLmFycmF5QnVmZmVyVG9CYXNlNjQodGhpcy5lbmNvZGVVdGY4KHZhdWx0UGF0aCkpXG4gICAgICAucmVwbGFjZSgvXFwrL2csIFwiLVwiKVxuICAgICAgLnJlcGxhY2UoL1xcLy9nLCBcIl9cIilcbiAgICAgIC5yZXBsYWNlKC89KyQvZywgXCJcIik7XG4gICAgcmV0dXJuIGAke3RoaXMuYnVpbGREZWxldGlvbkZvbGRlcigpfSR7ZW5jb2RlZH0uanNvbmA7XG4gIH1cblxuICBwcml2YXRlIHBhcnNlRGVsZXRpb25Ub21ic3RvbmVCYXNlNjQodmFsdWU6IHN0cmluZykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSB2YWx1ZS5yZXBsYWNlKC8tL2csIFwiK1wiKS5yZXBsYWNlKC9fL2csIFwiL1wiKTtcbiAgICBjb25zdCBwYWRkZWQgPSBub3JtYWxpemVkICsgXCI9XCIucmVwZWF0KCg0IC0gKG5vcm1hbGl6ZWQubGVuZ3RoICUgNCB8fCA0KSkgJSA0KTtcbiAgICByZXR1cm4gdGhpcy5kZWNvZGVVdGY4KHRoaXMuYmFzZTY0VG9BcnJheUJ1ZmZlcihwYWRkZWQpKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVtb3RlRGVsZXRpb25QYXRoVG9WYXVsdFBhdGgocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgcm9vdCA9IHRoaXMuYnVpbGREZWxldGlvbkZvbGRlcigpO1xuICAgIGlmICghcmVtb3RlUGF0aC5zdGFydHNXaXRoKHJvb3QpIHx8ICFyZW1vdGVQYXRoLmVuZHNXaXRoKFwiLmpzb25cIikpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IGVuY29kZWQgPSByZW1vdGVQYXRoLnNsaWNlKHJvb3QubGVuZ3RoLCAtXCIuanNvblwiLmxlbmd0aCk7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiB0aGlzLnBhcnNlRGVsZXRpb25Ub21ic3RvbmVCYXNlNjQoZW5jb2RlZCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHdyaXRlRGVsZXRpb25Ub21ic3RvbmUodmF1bHRQYXRoOiBzdHJpbmcsIHJlbW90ZVNpZ25hdHVyZT86IHN0cmluZykge1xuICAgIGNvbnN0IHBheWxvYWQ6IERlbGV0aW9uVG9tYnN0b25lID0ge1xuICAgICAgcGF0aDogdmF1bHRQYXRoLFxuICAgICAgZGVsZXRlZEF0OiBEYXRlLm5vdygpLFxuICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgIH07XG4gICAgYXdhaXQgdGhpcy51cGxvYWRCaW5hcnkoXG4gICAgICB0aGlzLmJ1aWxkRGVsZXRpb25SZW1vdGVQYXRoKHZhdWx0UGF0aCksXG4gICAgICB0aGlzLmVuY29kZVV0ZjgoSlNPTi5zdHJpbmdpZnkocGF5bG9hZCkpLFxuICAgICAgXCJhcHBsaWNhdGlvbi9qc29uOyBjaGFyc2V0PXV0Zi04XCIsXG4gICAgKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUodmF1bHRQYXRoOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZSh0aGlzLmJ1aWxkRGVsZXRpb25SZW1vdGVQYXRoKHZhdWx0UGF0aCkpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gVG9tYnN0b25lIGNsZWFudXAgc2hvdWxkIG5vdCBicmVhayB0aGUgbWFpbiBzeW5jIGZsb3cuXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWFkRGVsZXRpb25Ub21ic3RvbmUodmF1bHRQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwodGhpcy5idWlsZERlbGV0aW9uUmVtb3RlUGF0aCh2YXVsdFBhdGgpKSxcbiAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MDQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBHRVQgdG9tYnN0b25lIGZhaWxlZCB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5wYXJzZURlbGV0aW9uVG9tYnN0b25lUGF5bG9hZCh0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpKTtcbiAgfVxuXG4gIHByaXZhdGUgcGFyc2VEZWxldGlvblRvbWJzdG9uZVBheWxvYWQocmF3OiBzdHJpbmcpOiBEZWxldGlvblRvbWJzdG9uZSB8IG51bGwge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdykgYXMgUGFydGlhbDxEZWxldGlvblRvbWJzdG9uZT47XG4gICAgICBpZiAoIXBhcnNlZCB8fCB0eXBlb2YgcGFyc2VkLnBhdGggIT09IFwic3RyaW5nXCIgfHwgdHlwZW9mIHBhcnNlZC5kZWxldGVkQXQgIT09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICBpZiAocGFyc2VkLnJlbW90ZVNpZ25hdHVyZSAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiBwYXJzZWQucmVtb3RlU2lnbmF0dXJlICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcGF0aDogcGFyc2VkLnBhdGgsXG4gICAgICAgIGRlbGV0ZWRBdDogcGFyc2VkLmRlbGV0ZWRBdCxcbiAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiBwYXJzZWQucmVtb3RlU2lnbmF0dXJlLFxuICAgICAgfTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVhZERlbGV0aW9uVG9tYnN0b25lcygpIHtcbiAgICBjb25zdCB0b21ic3RvbmVzID0gbmV3IE1hcDxzdHJpbmcsIERlbGV0aW9uVG9tYnN0b25lPigpO1xuICAgIGNvbnN0IGludmVudG9yeSA9IGF3YWl0IHRoaXMubGlzdFJlbW90ZVRyZWUodGhpcy5idWlsZERlbGV0aW9uRm9sZGVyKCkpO1xuICAgIGZvciAoY29uc3QgcmVtb3RlIG9mIGludmVudG9yeS5maWxlcy52YWx1ZXMoKSkge1xuICAgICAgY29uc3QgdmF1bHRQYXRoID0gdGhpcy5yZW1vdGVEZWxldGlvblBhdGhUb1ZhdWx0UGF0aChyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICBpZiAoIXZhdWx0UGF0aCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlLnJlbW90ZVBhdGgpLFxuICAgICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRvbWJzdG9uZSA9IHRoaXMucGFyc2VEZWxldGlvblRvbWJzdG9uZVBheWxvYWQodGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKSk7XG4gICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgIHRvbWJzdG9uZXMuc2V0KHZhdWx0UGF0aCwgdG9tYnN0b25lKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdG9tYnN0b25lcztcbiAgfVxuXG4gIHByaXZhdGUgcmVtb3RlUGF0aFRvVmF1bHRQYXRoKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHJvb3QgPSB0aGlzLm5vcm1hbGl6ZUZvbGRlcih0aGlzLnNldHRpbmdzLnZhdWx0U3luY1JlbW90ZUZvbGRlcik7XG4gICAgaWYgKCFyZW1vdGVQYXRoLnN0YXJ0c1dpdGgocm9vdCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiByZW1vdGVQYXRoLnNsaWNlKHJvb3QubGVuZ3RoKS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBzaG91bGREb3dubG9hZFJlbW90ZVZlcnNpb24obG9jYWxNdGltZTogbnVtYmVyLCByZW1vdGVNdGltZTogbnVtYmVyKSB7XG4gICAgcmV0dXJuIHJlbW90ZU10aW1lID4gbG9jYWxNdGltZSArIDIwMDA7XG4gIH1cblxuICBwcml2YXRlIGlzVG9tYnN0b25lQXV0aG9yaXRhdGl2ZShcbiAgICB0b21ic3RvbmU6IERlbGV0aW9uVG9tYnN0b25lLFxuICAgIHJlbW90ZT86IFBpY2s8UmVtb3RlRmlsZVN0YXRlLCBcImxhc3RNb2RpZmllZFwiIHwgXCJzaWduYXR1cmVcIj4gfCBudWxsLFxuICApIHtcbiAgICBjb25zdCBncmFjZU1zID0gNTAwMDtcbiAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHRvbWJzdG9uZS5yZW1vdGVTaWduYXR1cmUpIHtcbiAgICAgIHJldHVybiByZW1vdGUuc2lnbmF0dXJlID09PSB0b21ic3RvbmUucmVtb3RlU2lnbmF0dXJlO1xuICAgIH1cblxuICAgIHJldHVybiByZW1vdGUubGFzdE1vZGlmaWVkIDw9IHRvbWJzdG9uZS5kZWxldGVkQXQgKyBncmFjZU1zO1xuICB9XG5cbiAgcHJpdmF0ZSBzaG91bGREZWxldGVMb2NhbEZyb21Ub21ic3RvbmUoZmlsZTogVEZpbGUsIHRvbWJzdG9uZTogRGVsZXRpb25Ub21ic3RvbmUpIHtcbiAgICBjb25zdCBncmFjZU1zID0gNTAwMDtcbiAgICByZXR1cm4gZmlsZS5zdGF0Lm10aW1lIDw9IHRvbWJzdG9uZS5kZWxldGVkQXQgKyBncmFjZU1zO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRWYXVsdEZpbGVCeVBhdGgocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKTtcbiAgICByZXR1cm4gZmlsZSBpbnN0YW5jZW9mIFRGaWxlID8gZmlsZSA6IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGU6IFRGaWxlKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmRlbGV0ZShmaWxlLCB0cnVlKTtcbiAgICB9IGNhdGNoIChkZWxldGVFcnJvcikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQudHJhc2goZmlsZSwgdHJ1ZSk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgdGhyb3cgZGVsZXRlRXJyb3I7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBlbnN1cmVMb2NhbFBhcmVudEZvbGRlcnMocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVBhdGgocGF0aCk7XG4gICAgY29uc3Qgc2VnbWVudHMgPSBub3JtYWxpemVkLnNwbGl0KFwiL1wiKS5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPiAwKTtcbiAgICBpZiAoc2VnbWVudHMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgY3VycmVudCA9IFwiXCI7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHNlZ21lbnRzLmxlbmd0aCAtIDE7IGluZGV4ICs9IDEpIHtcbiAgICAgIGN1cnJlbnQgPSBjdXJyZW50ID8gYCR7Y3VycmVudH0vJHtzZWdtZW50c1tpbmRleF19YCA6IHNlZ21lbnRzW2luZGV4XTtcbiAgICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGN1cnJlbnQpO1xuICAgICAgaWYgKCFleGlzdGluZykge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVGb2xkZXIoY3VycmVudCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KHZhdWx0UGF0aDogc3RyaW5nLCByZW1vdGU6IFJlbW90ZUZpbGVTdGF0ZSwgZXhpc3RpbmdGaWxlPzogVEZpbGUpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlLnJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBHRVQgZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuZW5zdXJlTG9jYWxQYXJlbnRGb2xkZXJzKHZhdWx0UGF0aCk7XG4gICAgY29uc3QgY3VycmVudCA9IGV4aXN0aW5nRmlsZSA/PyB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aCh2YXVsdFBhdGgpO1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICBtdGltZTogcmVtb3RlLmxhc3RNb2RpZmllZCA+IDAgPyByZW1vdGUubGFzdE1vZGlmaWVkIDogRGF0ZS5ub3coKSxcbiAgICB9O1xuICAgIGlmICghY3VycmVudCkge1xuICAgICAgaWYgKHZhdWx0UGF0aC50b0xvd2VyQ2FzZSgpLmVuZHNXaXRoKFwiLm1kXCIpKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZSh2YXVsdFBhdGgsIHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlciksIG9wdGlvbnMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlQmluYXJ5KHZhdWx0UGF0aCwgcmVzcG9uc2UuYXJyYXlCdWZmZXIsIG9wdGlvbnMpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChjdXJyZW50LmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoY3VycmVudCwgdGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKSwgb3B0aW9ucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeUJpbmFyeShjdXJyZW50LCByZXNwb25zZS5hcnJheUJ1ZmZlciwgb3B0aW9ucyk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB2ZXJpZnlSZW1vdGVCaW5hcnlSb3VuZFRyaXAocmVtb3RlUGF0aDogc3RyaW5nLCBleHBlY3RlZDogQXJyYXlCdWZmZXIpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuYXJyYXlCdWZmZXJzRXF1YWwoZXhwZWN0ZWQsIHJlc3BvbnNlLmFycmF5QnVmZmVyKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc3RhdFJlbW90ZUZpbGUocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIlBST1BGSU5EXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIERlcHRoOiBcIjBcIixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MDQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBQUk9QRklORCBmYWlsZWQgZm9yICR7cmVtb3RlUGF0aH0gd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgeG1sVGV4dCA9IHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlcik7XG4gICAgY29uc3QgZW50cmllcyA9IHRoaXMucGFyc2VQcm9wZmluZERpcmVjdG9yeUxpc3RpbmcoeG1sVGV4dCwgcmVtb3RlUGF0aCwgdHJ1ZSk7XG4gICAgcmV0dXJuIGVudHJpZXMuZmluZCgoZW50cnkpID0+ICFlbnRyeS5pc0NvbGxlY3Rpb24pPy5maWxlID8/IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZTogVEZpbGUsIHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgIGlmICh0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgIHRoaXMudChcbiAgICAgICAgICAgIFwiXHU2MkQyXHU3RUREXHU2MjhBXHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU1MzYwXHU0RjREXHU3QjE0XHU4QkIwXHU0RTBBXHU0RjIwXHU0RTNBXHU4RkRDXHU3QUVGXHU2QjYzXHU2NTg3XHUzMDAyXCIsXG4gICAgICAgICAgICBcIlJlZnVzaW5nIHRvIHVwbG9hZCBhIGxhenktbm90ZSBwbGFjZWhvbGRlciBhcyByZW1vdGUgbm90ZSBjb250ZW50LlwiLFxuICAgICAgICAgICksXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgYmluYXJ5ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZEJpbmFyeShmaWxlKTtcbiAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBiaW5hcnksIHRoaXMuZ2V0TWltZVR5cGUoZmlsZS5leHRlbnNpb24pKTtcbiAgICBjb25zdCByZW1vdGUgPSBhd2FpdCB0aGlzLnN0YXRSZW1vdGVGaWxlKHJlbW90ZVBhdGgpO1xuICAgIGlmIChyZW1vdGUpIHtcbiAgICAgIHJldHVybiByZW1vdGU7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJlbW90ZVBhdGgsXG4gICAgICBsYXN0TW9kaWZpZWQ6IGZpbGUuc3RhdC5tdGltZSxcbiAgICAgIHNpemU6IGZpbGUuc3RhdC5zaXplLFxuICAgICAgc2lnbmF0dXJlOiB0aGlzLmJ1aWxkU3luY1NpZ25hdHVyZShmaWxlKSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVSZW1vdGVTeW5jZWRFbnRyeSh2YXVsdFBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5zeW5jSW5kZXguZ2V0KHZhdWx0UGF0aCk7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IGV4aXN0aW5nPy5yZW1vdGVQYXRoID8/IHRoaXMuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKHZhdWx0UGF0aCk7XG4gICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGVQYXRoKTtcbiAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUodmF1bHRQYXRoKTtcbiAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVGaWxlT3BlbihmaWxlOiBURmlsZSB8IG51bGwpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHx8IGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzLnNldChmaWxlLnBhdGgsIERhdGUubm93KCkpO1xuICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG5cbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBjb25zdCBzdHViID0gdGhpcy5wYXJzZU5vdGVTdHViKGNvbnRlbnQpO1xuICAgIGlmICghc3R1Yikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZW1vdGUgPSBhd2FpdCB0aGlzLnN0YXRSZW1vdGVGaWxlKHN0dWIucmVtb3RlUGF0aCk7XG4gICAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgICBjb25zdCB0b21ic3RvbmUgPSBhd2FpdCB0aGlzLnJlYWREZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5yZW1vdmVMb2NhbFZhdWx0RmlsZShmaWxlKTtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgICAgICB0aGlzLmNsZWFyTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgICB0aGlzLnQoXG4gICAgICAgICAgICAgIGBcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTRFMERcdTVCNThcdTU3MjhcdUZGMENcdTVERjJcdTc5RkJcdTk2NjRcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICAgICAgICAgYFJlbW90ZSBub3RlIG1pc3NpbmcsIHJlbW92ZWQgbG9jYWwgcGxhY2Vob2xkZXI6ICR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIDYwMDAsXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBtaXNzaW5nUmVjb3JkID0gdGhpcy5tYXJrTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICAgICAgaWYgKG1pc3NpbmdSZWNvcmQubWlzc0NvdW50ID49IHRoaXMubWlzc2luZ0xhenlSZW1vdGVDb25maXJtYXRpb25zKSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5yZW1vdmVMb2NhbFZhdWx0RmlsZShmaWxlKTtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgICAgICB0aGlzLmNsZWFyTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgICB0aGlzLnQoXG4gICAgICAgICAgICAgIGBcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdThGREVcdTdFRURcdTdGM0FcdTU5MzFcdUZGMENcdTVERjJcdTc5RkJcdTk2NjRcdTY3MkNcdTU3MzBcdTU5MzFcdTY1NDhcdTUzNjBcdTRGNERcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICAgICAgICAgYFJlbW90ZSBub3RlIHdhcyBtaXNzaW5nIHJlcGVhdGVkbHksIHJlbW92ZWQgbG9jYWwgYnJva2VuIHBsYWNlaG9sZGVyOiAke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICA4MDAwLFxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTRFMERcdTVCNThcdTU3MjhcdUZGMENcdTVGNTNcdTUyNERcdTUxNDhcdTRGRERcdTc1NTlcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTdCMTRcdThCQjBcdTRFRTVcdTk2MzJcdTRFMzRcdTY1RjZcdTVGMDJcdTVFMzhcdUZGMUJcdTgyRTVcdTUxOERcdTZCMjFcdTc4NkVcdThCQTRcdTdGM0FcdTU5MzFcdUZGMENcdTVDMDZcdTgxRUFcdTUyQThcdTZFMDVcdTc0MDZcdThCRTVcdTUzNjBcdTRGNERcdTMwMDJcIiwgXCJSZW1vdGUgbm90ZSBpcyBtaXNzaW5nLiBUaGUgbG9jYWwgcGxhY2Vob2xkZXIgd2FzIGtlcHQgZm9yIG5vdyBpbiBjYXNlIHRoaXMgaXMgdHJhbnNpZW50OyBpdCB3aWxsIGJlIGNsZWFuZWQgYXV0b21hdGljYWxseSBpZiB0aGUgcmVtb3RlIGlzIHN0aWxsIG1pc3Npbmcgb24gdGhlIG5leHQgY29uZmlybWF0aW9uLlwiKSwgODAwMCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgdGhpcy5jbGVhck1pc3NpbmdMYXp5UmVtb3RlKGZpbGUucGF0aCk7XG4gICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgICAgY29uc3QgcmVmcmVzaGVkID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IHRoaXMuYnVpbGRTeW5jU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICByZW1vdGVTaWduYXR1cmU6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVBhdGg6IHN0dWIucmVtb3RlUGF0aCxcbiAgICAgIH0pO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy50KGBcdTVERjJcdTRFQ0VcdThGRENcdTdBRUZcdTYwNjJcdTU5MERcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YCwgYFJlc3RvcmVkIG5vdGUgZnJvbSByZW1vdGU6ICR7ZmlsZS5iYXNlbmFtZX1gKSwgNjAwMCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gaHlkcmF0ZSBub3RlIGZyb20gcmVtb3RlXCIsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1OEZEQ1x1N0FFRlx1NjA2Mlx1NTkwRFx1N0IxNFx1OEJCMFx1NTkzMVx1OEQyNVwiLCBcIkZhaWxlZCB0byByZXN0b3JlIG5vdGUgZnJvbSByZW1vdGVcIiksIGVycm9yKSwgODAwMCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBzaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKHBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gbm9ybWFsaXplUGF0aChwYXRoKTtcbiAgICBpZiAobm9ybWFsaXplZFBhdGggPT09IFwiLm9ic2lkaWFuXCIgfHwgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIi5vYnNpZGlhbi9cIikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIG5vcm1hbGl6ZWRQYXRoID09PSBcIi5vYnNpZGlhbi9wbHVnaW5zL3NlY3VyZS13ZWJkYXYtaW1hZ2VzXCIgfHxcbiAgICAgIG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIub2JzaWRpYW4vcGx1Z2lucy9zZWN1cmUtd2ViZGF2LWltYWdlcy9cIilcbiAgICApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiAvXFwuKHBuZ3xqcGU/Z3xnaWZ8d2VicHxibXB8c3ZnKSQvaS50ZXN0KG5vcm1hbGl6ZWRQYXRoKTtcbiAgfVxuXG4gIHByaXZhdGUgY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCkge1xuICAgIHJldHVybiB0aGlzLmFwcC52YXVsdFxuICAgICAgLmdldEZpbGVzKClcbiAgICAgIC5maWx0ZXIoKGZpbGUpID0+ICF0aGlzLnNob3VsZFNraXBDb250ZW50U3luY1BhdGgoZmlsZS5wYXRoKSlcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBhLnBhdGgubG9jYWxlQ29tcGFyZShiLnBhdGgpKTtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRTeW5jU2lnbmF0dXJlKGZpbGU6IFRGaWxlKSB7XG4gICAgcmV0dXJuIGAke2ZpbGUuc3RhdC5tdGltZX06JHtmaWxlLnN0YXQuc2l6ZX1gO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZFZhdWx0U3luY1JlbW90ZVBhdGgodmF1bHRQYXRoOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpfSR7dmF1bHRQYXRofWA7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlY29uY2lsZVJlbW90ZUltYWdlcygpIHtcbiAgICByZXR1cm4geyBkZWxldGVkRmlsZXM6IDAsIGRlbGV0ZWREaXJlY3RvcmllczogMCB9O1xuICB9XG5cbiAgcHJpdmF0ZSBtYXJrTWlzc2luZ0xhenlSZW1vdGUocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCBwcmV2aW91cyA9IHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3Rlcy5nZXQocGF0aCk7XG4gICAgY29uc3QgbmV4dDogTWlzc2luZ0xhenlSZW1vdGVSZWNvcmQgPSBwcmV2aW91c1xuICAgICAgPyB7XG4gICAgICAgICAgZmlyc3REZXRlY3RlZEF0OiBwcmV2aW91cy5maXJzdERldGVjdGVkQXQsXG4gICAgICAgICAgbGFzdERldGVjdGVkQXQ6IG5vdyxcbiAgICAgICAgICBtaXNzQ291bnQ6IHByZXZpb3VzLm1pc3NDb3VudCArIDEsXG4gICAgICAgIH1cbiAgICAgIDoge1xuICAgICAgICAgIGZpcnN0RGV0ZWN0ZWRBdDogbm93LFxuICAgICAgICAgIGxhc3REZXRlY3RlZEF0OiBub3csXG4gICAgICAgICAgbWlzc0NvdW50OiAxLFxuICAgICAgICB9O1xuICAgIHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3Rlcy5zZXQocGF0aCwgbmV4dCk7XG4gICAgcmV0dXJuIG5leHQ7XG4gIH1cblxuICBwcml2YXRlIGNsZWFyTWlzc2luZ0xhenlSZW1vdGUocGF0aDogc3RyaW5nKSB7XG4gICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzLmRlbGV0ZShwYXRoKTtcbiAgfVxuXG4gIHByaXZhdGUgcGFyc2VOb3RlU3R1Yihjb250ZW50OiBzdHJpbmcpIHtcbiAgICBjb25zdCBtYXRjaCA9IGNvbnRlbnQubWF0Y2goXG4gICAgICAvXjwhLS1cXHMqc2VjdXJlLXdlYmRhdi1ub3RlLXN0dWJcXHMqXFxyP1xcbnJlbW90ZTpcXHMqKC4rPylcXHI/XFxucGxhY2Vob2xkZXI6XFxzKiguKj8pXFxyP1xcbi0tPi9zLFxuICAgICk7XG4gICAgaWYgKCFtYXRjaCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJlbW90ZVBhdGg6IG1hdGNoWzFdLnRyaW0oKSxcbiAgICAgIHBsYWNlaG9sZGVyOiBtYXRjaFsyXS50cmltKCksXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGROb3RlU3R1YihmaWxlOiBURmlsZSkge1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aChmaWxlLnBhdGgpO1xuICAgIHJldHVybiBbXG4gICAgICBgPCEtLSAke1NFQ1VSRV9OT1RFX1NUVUJ9YCxcbiAgICAgIGByZW1vdGU6ICR7cmVtb3RlUGF0aH1gLFxuICAgICAgYHBsYWNlaG9sZGVyOiAke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgIFwiLS0+XCIsXG4gICAgICBcIlwiLFxuICAgICAgdGhpcy50KFxuICAgICAgICBgXHU4RkQ5XHU2NjJGXHU0RTAwXHU3QkM3XHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXHU3Njg0XHU2NzJDXHU1NzMwXHU1MzYwXHU0RjREXHU2NTg3XHU0RUY2XHUzMDAyXHU2MjUzXHU1RjAwXHU4RkQ5XHU3QkM3XHU3QjE0XHU4QkIwXHU2NUY2XHVGRjBDXHU2M0QyXHU0RUY2XHU0RjFBXHU0RUNFXHU4RkRDXHU3QUVGXHU1NDBDXHU2QjY1XHU3NkVFXHU1RjU1XHU2MDYyXHU1OTBEXHU1QjhDXHU2NTc0XHU1MTg1XHU1QkI5XHUzMDAyYCxcbiAgICAgICAgYFRoaXMgaXMgYSBsb2NhbCBwbGFjZWhvbGRlciBmb3IgYW4gb24tZGVtYW5kIG5vdGUuIE9wZW5pbmcgdGhlIG5vdGUgcmVzdG9yZXMgdGhlIGZ1bGwgY29udGVudCBmcm9tIHRoZSByZW1vdGUgc3luYyBmb2xkZXIuYCxcbiAgICAgICksXG4gICAgXS5qb2luKFwiXFxuXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBldmljdFN0YWxlU3luY2VkTm90ZXMoc2hvd05vdGljZTogYm9vbGVhbikge1xuICAgIHRyeSB7XG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5ub3RlU3RvcmFnZU1vZGUgIT09IFwibGF6eS1ub3Rlc1wiKSB7XG4gICAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdTVGNTNcdTUyNERcdTY3MkFcdTU0MkZcdTc1MjhcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTdCMTRcdThCQjBcdTZBMjFcdTVGMEZcdTMwMDJcIiwgXCJMYXp5IG5vdGUgbW9kZSBpcyBub3QgZW5hYmxlZC5cIiksIDYwMDApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBmaWxlcyA9IHRoaXMuY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCkuZmlsdGVyKChmaWxlKSA9PiBmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKTtcbiAgICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gICAgICBjb25zdCB0aHJlc2hvbGQgPSBNYXRoLm1heCgxLCB0aGlzLnNldHRpbmdzLm5vdGVFdmljdEFmdGVyRGF5cykgKiAyNCAqIDYwICogNjAgKiAxMDAwO1xuICAgICAgbGV0IGV2aWN0ZWQgPSAwO1xuXG4gICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgY29uc3QgYWN0aXZlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICAgICAgaWYgKGFjdGl2ZT8ucGF0aCA9PT0gZmlsZS5wYXRoKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBsYXN0QWNjZXNzID0gdGhpcy5ub3RlQWNjZXNzVGltZXN0YW1wcy5nZXQoZmlsZS5wYXRoKSA/PyAwO1xuICAgICAgICBpZiAobGFzdEFjY2VzcyAhPT0gMCAmJiBub3cgLSBsYXN0QWNjZXNzIDwgdGhyZXNob2xkKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgICAgaWYgKHRoaXMucGFyc2VOb3RlU3R1Yihjb250ZW50KSkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYmluYXJ5ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZEJpbmFyeShmaWxlKTtcbiAgICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KHJlbW90ZVBhdGgsIGJpbmFyeSwgXCJ0ZXh0L21hcmtkb3duOyBjaGFyc2V0PXV0Zi04XCIpO1xuICAgICAgICBjb25zdCB2ZXJpZmllZCA9IGF3YWl0IHRoaXMudmVyaWZ5UmVtb3RlQmluYXJ5Um91bmRUcmlwKHJlbW90ZVBhdGgsIGJpbmFyeSk7XG4gICAgICAgIGlmICghdmVyaWZpZWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiXHU4RkRDXHU3QUVGXHU2QjYzXHU2NTg3XHU2ODIxXHU5QThDXHU1OTMxXHU4RDI1XHVGRjBDXHU1REYyXHU1M0Q2XHU2RDg4XHU1NkRFXHU2NTM2XHU2NzJDXHU1NzMwXHU3QjE0XHU4QkIwXHUzMDAyXCIsIFwiUmVtb3RlIG5vdGUgdmVyaWZpY2F0aW9uIGZhaWxlZCwgbG9jYWwgbm90ZSBldmljdGlvbiB3YXMgY2FuY2VsbGVkLlwiKSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVtb3RlID0gYXdhaXQgdGhpcy5zdGF0UmVtb3RlRmlsZShyZW1vdGVQYXRoKTtcbiAgICAgICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiXHU4RkRDXHU3QUVGXHU2QjYzXHU2NTg3XHU1MTQzXHU2NTcwXHU2MzZFXHU3RjNBXHU1OTMxXHVGRjBDXHU1REYyXHU1M0Q2XHU2RDg4XHU1NkRFXHU2NTM2XHU2NzJDXHU1NzMwXHU3QjE0XHU4QkIwXHUzMDAyXCIsIFwiUmVtb3RlIG5vdGUgbWV0YWRhdGEgaXMgbWlzc2luZywgbG9jYWwgbm90ZSBldmljdGlvbiB3YXMgY2FuY2VsbGVkLlwiKSk7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIHRoaXMuYnVpbGROb3RlU3R1YihmaWxlKSk7XG4gICAgICAgIGNvbnN0IHJlZnJlc2hlZCA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVmcmVzaGVkID8gdGhpcy5idWlsZFN5bmNTaWduYXR1cmUocmVmcmVzaGVkKSA6IHRoaXMuYnVpbGRTeW5jU2lnbmF0dXJlKGZpbGUpLFxuICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcmVtb3RlPy5zaWduYXR1cmUgPz8gYCR7ZmlsZS5zdGF0Lm10aW1lfToke2JpbmFyeS5ieXRlTGVuZ3RofWAsXG4gICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIGV2aWN0ZWQgKz0gMTtcbiAgICAgIH1cblxuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgICB0aGlzLnQoXG4gICAgICAgICAgICBgXHU1REYyXHU1NkRFXHU2NTM2ICR7ZXZpY3RlZH0gXHU3QkM3XHU5NTdGXHU2NzFGXHU2NzJBXHU4QkJGXHU5NUVFXHU3Njg0XHU2NzJDXHU1NzMwXHU3QjE0XHU4QkIwXHUzMDAyYCxcbiAgICAgICAgICAgIGBFdmljdGVkICR7ZXZpY3RlZH0gc3RhbGUgbG9jYWwgbm90ZShzKS5gLFxuICAgICAgICAgICksXG4gICAgICAgICAgODAwMCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICByZXR1cm4gZXZpY3RlZDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBldmljdCBzdGFsZSBzeW5jZWQgbm90ZXNcIiwgZXJyb3IpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU1NkRFXHU2NTM2XHU2NzJDXHU1NzMwXHU3QjE0XHU4QkIwXHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIGV2aWN0IGxvY2FsIG5vdGVzXCIpLCBlcnJvciksIDgwMDApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBlbnN1cmVSZW1vdGVEaXJlY3RvcmllcyhyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBwYXJ0cyA9IHJlbW90ZVBhdGguc3BsaXQoXCIvXCIpLmZpbHRlcigodmFsdWUpID0+IHZhbHVlLmxlbmd0aCA+IDApO1xuICAgIGlmIChwYXJ0cy5sZW5ndGggPD0gMSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBjdXJyZW50ID0gXCJcIjtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgcGFydHMubGVuZ3RoIC0gMTsgaW5kZXggKz0gMSkge1xuICAgICAgY3VycmVudCA9IGN1cnJlbnQgPyBgJHtjdXJyZW50fS8ke3BhcnRzW2luZGV4XX1gIDogcGFydHNbaW5kZXhdO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwoY3VycmVudCksXG4gICAgICAgIG1ldGhvZDogXCJNS0NPTFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAoIVsyMDAsIDIwMSwgMjA0LCAyMDcsIDMwMSwgMzAyLCAzMDcsIDMwOCwgNDA1XS5pbmNsdWRlcyhyZXNwb25zZS5zdGF0dXMpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTUtDT0wgZmFpbGVkIGZvciAke2N1cnJlbnR9IHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgbGlzdFJlbW90ZVRyZWUocm9vdEZvbGRlcjogc3RyaW5nKTogUHJvbWlzZTxSZW1vdGVJbnZlbnRvcnk+IHtcbiAgICBjb25zdCBmaWxlcyA9IG5ldyBNYXA8c3RyaW5nLCBSZW1vdGVGaWxlU3RhdGU+KCk7XG4gICAgY29uc3QgZGlyZWN0b3JpZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBjb25zdCBwZW5kaW5nID0gW3RoaXMubm9ybWFsaXplRm9sZGVyKHJvb3RGb2xkZXIpXTtcbiAgICBjb25zdCB2aXNpdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbiAgICB3aGlsZSAocGVuZGluZy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBjdXJyZW50ID0gdGhpcy5ub3JtYWxpemVGb2xkZXIocGVuZGluZy5wb3AoKSA/PyByb290Rm9sZGVyKTtcbiAgICAgIGlmICh2aXNpdGVkLmhhcyhjdXJyZW50KSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgdmlzaXRlZC5hZGQoY3VycmVudCk7XG4gICAgICBjb25zdCBlbnRyaWVzID0gYXdhaXQgdGhpcy5saXN0UmVtb3RlRGlyZWN0b3J5KGN1cnJlbnQpO1xuICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG4gICAgICAgIGlmIChlbnRyeS5pc0NvbGxlY3Rpb24pIHtcbiAgICAgICAgICBkaXJlY3Rvcmllcy5hZGQoZW50cnkucmVtb3RlUGF0aCk7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKGVudHJ5LnJlbW90ZVBhdGgpO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGVudHJ5LmZpbGUpIHtcbiAgICAgICAgICBmaWxlcy5zZXQoZW50cnkucmVtb3RlUGF0aCwgZW50cnkuZmlsZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4geyBmaWxlcywgZGlyZWN0b3JpZXMgfTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgbGlzdFJlbW90ZURpcmVjdG9yeShyZW1vdGVEaXJlY3Rvcnk6IHN0cmluZykge1xuICAgIGNvbnN0IHJlcXVlc3RlZFBhdGggPSB0aGlzLm5vcm1hbGl6ZUZvbGRlcihyZW1vdGVEaXJlY3RvcnkpO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZXF1ZXN0ZWRQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJQUk9QRklORFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICBEZXB0aDogXCIxXCIsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gNDA0KSB7XG4gICAgICByZXR1cm4gW10gYXMgQXJyYXk8eyByZW1vdGVQYXRoOiBzdHJpbmc7IGlzQ29sbGVjdGlvbjogYm9vbGVhbjsgZmlsZT86IFJlbW90ZUZpbGVTdGF0ZSB9PjtcbiAgICB9XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgUFJPUEZJTkQgZmFpbGVkIGZvciAke3JlcXVlc3RlZFBhdGh9IHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIH1cblxuICAgIGNvbnN0IHhtbFRleHQgPSB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpO1xuICAgIHJldHVybiB0aGlzLnBhcnNlUHJvcGZpbmREaXJlY3RvcnlMaXN0aW5nKHhtbFRleHQsIHJlcXVlc3RlZFBhdGgpO1xuICB9XG5cbiAgcHJpdmF0ZSBwYXJzZVByb3BmaW5kRGlyZWN0b3J5TGlzdGluZyh4bWxUZXh0OiBzdHJpbmcsIHJlcXVlc3RlZFBhdGg6IHN0cmluZywgaW5jbHVkZVJlcXVlc3RlZCA9IGZhbHNlKSB7XG4gICAgY29uc3QgcGFyc2VyID0gbmV3IERPTVBhcnNlcigpO1xuICAgIGNvbnN0IGRvY3VtZW50ID0gcGFyc2VyLnBhcnNlRnJvbVN0cmluZyh4bWxUZXh0LCBcImFwcGxpY2F0aW9uL3htbFwiKTtcbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJwYXJzZXJlcnJvclwiKS5sZW5ndGggPiAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiXHU2NUUwXHU2Q0Q1XHU4OUUzXHU2NzkwIFdlYkRBViBcdTc2RUVcdTVGNTVcdTZFMDVcdTUzNTVcdTMwMDJcIiwgXCJGYWlsZWQgdG8gcGFyc2UgdGhlIFdlYkRBViBkaXJlY3RvcnkgbGlzdGluZy5cIikpO1xuICAgIH1cblxuICAgIGNvbnN0IGVudHJpZXMgPSBuZXcgTWFwPHN0cmluZywgeyByZW1vdGVQYXRoOiBzdHJpbmc7IGlzQ29sbGVjdGlvbjogYm9vbGVhbjsgZmlsZT86IFJlbW90ZUZpbGVTdGF0ZSB9PigpO1xuICAgIGZvciAoY29uc3QgZWxlbWVudCBvZiBBcnJheS5mcm9tKGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiKlwiKSkpIHtcbiAgICAgIGlmIChlbGVtZW50LmxvY2FsTmFtZSAhPT0gXCJyZXNwb25zZVwiKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBocmVmID0gdGhpcy5nZXRYbWxMb2NhbE5hbWVUZXh0KGVsZW1lbnQsIFwiaHJlZlwiKTtcbiAgICAgIGlmICghaHJlZikge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuaHJlZlRvUmVtb3RlUGF0aChocmVmKTtcbiAgICAgIGlmICghcmVtb3RlUGF0aCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaXNDb2xsZWN0aW9uID0gdGhpcy54bWxUcmVlSGFzTG9jYWxOYW1lKGVsZW1lbnQsIFwiY29sbGVjdGlvblwiKTtcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gaXNDb2xsZWN0aW9uID8gdGhpcy5ub3JtYWxpemVGb2xkZXIocmVtb3RlUGF0aCkgOiByZW1vdGVQYXRoLnJlcGxhY2UoL1xcLyskLywgXCJcIik7XG4gICAgICBpZiAoXG4gICAgICAgICFpbmNsdWRlUmVxdWVzdGVkICYmXG4gICAgICAgIChcbiAgICAgICAgICBub3JtYWxpemVkUGF0aCA9PT0gcmVxdWVzdGVkUGF0aCB8fFxuICAgICAgICAgIG5vcm1hbGl6ZWRQYXRoID09PSByZXF1ZXN0ZWRQYXRoLnJlcGxhY2UoL1xcLyskLywgXCJcIilcbiAgICAgICAgKVxuICAgICAgKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzaXplVGV4dCA9IHRoaXMuZ2V0WG1sTG9jYWxOYW1lVGV4dChlbGVtZW50LCBcImdldGNvbnRlbnRsZW5ndGhcIik7XG4gICAgICBjb25zdCBwYXJzZWRTaXplID0gTnVtYmVyLnBhcnNlSW50KHNpemVUZXh0LCAxMCk7XG4gICAgICBjb25zdCBzaXplID0gTnVtYmVyLmlzRmluaXRlKHBhcnNlZFNpemUpID8gcGFyc2VkU2l6ZSA6IDA7XG4gICAgICBjb25zdCBtb2RpZmllZFRleHQgPSB0aGlzLmdldFhtbExvY2FsTmFtZVRleHQoZWxlbWVudCwgXCJnZXRsYXN0bW9kaWZpZWRcIik7XG4gICAgICBjb25zdCBwYXJzZWRNdGltZSA9IERhdGUucGFyc2UobW9kaWZpZWRUZXh0KTtcbiAgICAgIGNvbnN0IGxhc3RNb2RpZmllZCA9IE51bWJlci5pc0Zpbml0ZShwYXJzZWRNdGltZSkgPyBwYXJzZWRNdGltZSA6IDA7XG5cbiAgICAgIGVudHJpZXMuc2V0KG5vcm1hbGl6ZWRQYXRoLCB7XG4gICAgICAgIHJlbW90ZVBhdGg6IG5vcm1hbGl6ZWRQYXRoLFxuICAgICAgICBpc0NvbGxlY3Rpb24sXG4gICAgICAgIGZpbGU6IGlzQ29sbGVjdGlvblxuICAgICAgICAgID8gdW5kZWZpbmVkXG4gICAgICAgICAgOiB7XG4gICAgICAgICAgICAgIHJlbW90ZVBhdGg6IG5vcm1hbGl6ZWRQYXRoLFxuICAgICAgICAgICAgICBsYXN0TW9kaWZpZWQsXG4gICAgICAgICAgICAgIHNpemUsXG4gICAgICAgICAgICAgIHNpZ25hdHVyZTogdGhpcy5idWlsZFJlbW90ZVN5bmNTaWduYXR1cmUoe1xuICAgICAgICAgICAgICAgIGxhc3RNb2RpZmllZCxcbiAgICAgICAgICAgICAgICBzaXplLFxuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gWy4uLmVudHJpZXMudmFsdWVzKCldO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRYbWxMb2NhbE5hbWVUZXh0KHBhcmVudDogRWxlbWVudCwgbG9jYWxOYW1lOiBzdHJpbmcpIHtcbiAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgQXJyYXkuZnJvbShwYXJlbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCIqXCIpKSkge1xuICAgICAgaWYgKGVsZW1lbnQubG9jYWxOYW1lID09PSBsb2NhbE5hbWUpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQudGV4dENvbnRlbnQ/LnRyaW0oKSA/PyBcIlwiO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBcIlwiO1xuICB9XG5cbiAgcHJpdmF0ZSB4bWxUcmVlSGFzTG9jYWxOYW1lKHBhcmVudDogRWxlbWVudCwgbG9jYWxOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShwYXJlbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCIqXCIpKS5zb21lKChlbGVtZW50KSA9PiBlbGVtZW50LmxvY2FsTmFtZSA9PT0gbG9jYWxOYW1lKTtcbiAgfVxuXG4gIHByaXZhdGUgaHJlZlRvUmVtb3RlUGF0aChocmVmOiBzdHJpbmcpIHtcbiAgICBjb25zdCBiYXNlVXJsID0gYCR7dGhpcy5zZXR0aW5ncy53ZWJkYXZVcmwucmVwbGFjZSgvXFwvKyQvLCBcIlwiKX0vYDtcbiAgICBjb25zdCByZXNvbHZlZCA9IG5ldyBVUkwoaHJlZiwgYmFzZVVybCk7XG4gICAgY29uc3QgYmFzZVBhdGggPSBuZXcgVVJMKGJhc2VVcmwpLnBhdGhuYW1lLnJlcGxhY2UoL1xcLyskLywgXCIvXCIpO1xuICAgIGNvbnN0IGRlY29kZWRQYXRoID0gdGhpcy5kZWNvZGVQYXRobmFtZShyZXNvbHZlZC5wYXRobmFtZSk7XG4gICAgaWYgKCFkZWNvZGVkUGF0aC5zdGFydHNXaXRoKGJhc2VQYXRoKSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlY29kZWRQYXRoLnNsaWNlKGJhc2VQYXRoLmxlbmd0aCkucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgZGVjb2RlUGF0aG5hbWUocGF0aG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBwYXRobmFtZVxuICAgICAgLnNwbGl0KFwiL1wiKVxuICAgICAgLm1hcCgoc2VnbWVudCkgPT4ge1xuICAgICAgICBpZiAoIXNlZ21lbnQpIHtcbiAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudChzZWdtZW50KTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgcmV0dXJuIHNlZ21lbnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuam9pbihcIi9cIik7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkRXhwZWN0ZWRSZW1vdGVEaXJlY3RvcmllcyhyZW1vdGVGaWxlUGF0aHM6IFNldDxzdHJpbmc+LCByb290Rm9sZGVyOiBzdHJpbmcpIHtcbiAgICBjb25zdCBleHBlY3RlZCA9IG5ldyBTZXQ8c3RyaW5nPihbdGhpcy5ub3JtYWxpemVGb2xkZXIocm9vdEZvbGRlcildKTtcbiAgICBmb3IgKGNvbnN0IHJlbW90ZVBhdGggb2YgcmVtb3RlRmlsZVBhdGhzKSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IHJlbW90ZVBhdGguc3BsaXQoXCIvXCIpLmZpbHRlcigodmFsdWUpID0+IHZhbHVlLmxlbmd0aCA+IDApO1xuICAgICAgbGV0IGN1cnJlbnQgPSBcIlwiO1xuICAgICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHBhcnRzLmxlbmd0aCAtIDE7IGluZGV4ICs9IDEpIHtcbiAgICAgICAgY3VycmVudCA9IGN1cnJlbnQgPyBgJHtjdXJyZW50fS8ke3BhcnRzW2luZGV4XX1gIDogcGFydHNbaW5kZXhdO1xuICAgICAgICBleHBlY3RlZC5hZGQodGhpcy5ub3JtYWxpemVGb2xkZXIoY3VycmVudCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBleHBlY3RlZDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZGVsZXRlRXh0cmFSZW1vdGVEaXJlY3RvcmllcyhyZW1vdGVEaXJlY3RvcmllczogU2V0PHN0cmluZz4sIGV4cGVjdGVkRGlyZWN0b3JpZXM6IFNldDxzdHJpbmc+KSB7XG4gICAgbGV0IGRlbGV0ZWQgPSAwO1xuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBbLi4ucmVtb3RlRGlyZWN0b3JpZXNdXG4gICAgICAuZmlsdGVyKChyZW1vdGVQYXRoKSA9PiAhZXhwZWN0ZWREaXJlY3Rvcmllcy5oYXMocmVtb3RlUGF0aCkpXG4gICAgICAuc29ydCgoYSwgYikgPT4gYi5sZW5ndGggLSBhLmxlbmd0aCB8fCBiLmxvY2FsZUNvbXBhcmUoYSkpO1xuXG4gICAgZm9yIChjb25zdCByZW1vdGVQYXRoIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgICBtZXRob2Q6IFwiREVMRVRFXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChbMjAwLCAyMDIsIDIwNCwgNDA0XS5pbmNsdWRlcyhyZXNwb25zZS5zdGF0dXMpKSB7XG4gICAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgIT09IDQwNCkge1xuICAgICAgICAgIGRlbGV0ZWQgKz0gMTtcbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKFs0MDUsIDQwOV0uaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBERUxFVEUgZGlyZWN0b3J5IGZhaWxlZCBmb3IgJHtyZW1vdGVQYXRofSB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGVsZXRlZDtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzUGVuZGluZ1Rhc2tzKCkge1xyXG4gICAgaWYgKHRoaXMucXVldWUubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBmb3IgKGNvbnN0IHRhc2sgb2YgWy4uLnRoaXMucXVldWVdKSB7XHJcbiAgICAgIGlmICh0aGlzLnByb2Nlc3NpbmdUYXNrSWRzLmhhcyh0YXNrLmlkKSkge1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICB2b2lkIHRoaXMucHJvY2Vzc1Rhc2sodGFzayk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIHVwbG9hZEltYWdlc0luTm90ZShub3RlRmlsZTogVEZpbGUpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKG5vdGVGaWxlKTtcclxuICAgICAgY29uc3QgcmVwbGFjZW1lbnRzID0gYXdhaXQgdGhpcy5idWlsZFVwbG9hZFJlcGxhY2VtZW50cyhjb250ZW50LCBub3RlRmlsZSk7XHJcblxyXG4gICAgICBpZiAocmVwbGFjZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1RjUzXHU1MjREXHU3QjE0XHU4QkIwXHU0RTJEXHU2Q0ExXHU2NzA5XHU2MjdFXHU1MjMwXHU2NzJDXHU1NzMwXHU1NkZFXHU3MjQ3XHUzMDAyXCIsIFwiTm8gbG9jYWwgaW1hZ2VzIGZvdW5kIGluIHRoZSBjdXJyZW50IG5vdGUuXCIpKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGxldCB1cGRhdGVkID0gY29udGVudDtcclxuICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcclxuICAgICAgICB1cGRhdGVkID0gdXBkYXRlZC5zcGxpdChyZXBsYWNlbWVudC5vcmlnaW5hbCkuam9pbihyZXBsYWNlbWVudC5yZXdyaXR0ZW4pO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAodXBkYXRlZCA9PT0gY29udGVudCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU2Q0ExXHU2NzA5XHU5NzAwXHU4OTgxXHU2NTM5XHU1MTk5XHU3Njg0XHU1NkZFXHU3MjQ3XHU5NEZFXHU2M0E1XHUzMDAyXCIsIFwiTm8gaW1hZ2VzIHdlcmUgcmV3cml0dGVuLlwiKSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkobm90ZUZpbGUsIHVwZGF0ZWQpO1xuXG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5kZWxldGVMb2NhbEFmdGVyVXBsb2FkKSB7XG4gICAgICAgIGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgcmVwbGFjZW1lbnRzKSB7XG4gICAgICAgICAgaWYgKHJlcGxhY2VtZW50LnNvdXJjZUZpbGUpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMudHJhc2hJZkV4aXN0cyhyZXBsYWNlbWVudC5zb3VyY2VGaWxlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxyXG4gICAgICBuZXcgTm90aWNlKHRoaXMudChgXHU1REYyXHU0RTBBXHU0RjIwICR7cmVwbGFjZW1lbnRzLmxlbmd0aH0gXHU1RjIwXHU1NkZFXHU3MjQ3XHU1MjMwIFdlYkRBVlx1MzAwMmAsIGBVcGxvYWRlZCAke3JlcGxhY2VtZW50cy5sZW5ndGh9IGltYWdlKHMpIHRvIFdlYkRBVi5gKSk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiU2VjdXJlIFdlYkRBViB1cGxvYWQgZmFpbGVkXCIsIGVycm9yKTtcclxuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU0RTBBXHU0RjIwXHU1OTMxXHU4RDI1XCIsIFwiVXBsb2FkIGZhaWxlZFwiKSwgZXJyb3IpLCA4MDAwKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgcHJvY2Vzc1Rhc2sodGFzazogVXBsb2FkVGFzaykge1xuICAgIHRoaXMucHJvY2Vzc2luZ1Rhc2tJZHMuYWRkKHRhc2suaWQpO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBiaW5hcnkgPSB0aGlzLmJhc2U2NFRvQXJyYXlCdWZmZXIodGFzay5kYXRhQmFzZTY0KTtcbiAgICAgIGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdGhpcy5wcmVwYXJlVXBsb2FkUGF5bG9hZChcbiAgICAgICAgYmluYXJ5LFxuICAgICAgICB0YXNrLm1pbWVUeXBlIHx8IHRoaXMuZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUodGFzay5maWxlTmFtZSksXG4gICAgICAgIHRhc2suZmlsZU5hbWUsXG4gICAgICApO1xuICAgICAgY29uc3QgcmVtb3RlTmFtZSA9IGF3YWl0IHRoaXMuYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnkocHJlcGFyZWQuZmlsZU5hbWUsIHByZXBhcmVkLmJpbmFyeSk7XG4gICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5idWlsZFJlbW90ZVBhdGgocmVtb3RlTmFtZSk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIlBVVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBwcmVwYXJlZC5taW1lVHlwZSxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogcHJlcGFyZWQuYmluYXJ5LFxuICAgICAgfSk7XG5cclxuICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVcGxvYWQgZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCByZXBsYWNlZCA9IGF3YWl0IHRoaXMucmVwbGFjZVBsYWNlaG9sZGVyKFxyXG4gICAgICAgIHRhc2subm90ZVBhdGgsXG4gICAgICAgIHRhc2suaWQsXG4gICAgICAgIHRhc2sucGxhY2Vob2xkZXIsXG4gICAgICAgIHRoaXMuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChgJHtTRUNVUkVfUFJPVE9DT0x9Ly8ke3JlbW90ZVBhdGh9YCwgcHJlcGFyZWQuZmlsZU5hbWUpLFxuICAgICAgKTtcbiAgICAgIGlmICghcmVwbGFjZWQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiXHU0RTBBXHU0RjIwXHU2MjEwXHU1MjlGXHVGRjBDXHU0RjQ2XHU2Q0ExXHU2NzA5XHU1NzI4XHU3QjE0XHU4QkIwXHU0RTJEXHU2MjdFXHU1MjMwXHU1M0VGXHU2NkZGXHU2MzYyXHU3Njg0XHU1MzYwXHU0RjREXHU3QjI2XHUzMDAyXCIsIFwiVXBsb2FkIHN1Y2NlZWRlZCwgYnV0IG5vIG1hdGNoaW5nIHBsYWNlaG9sZGVyIHdhcyBmb3VuZCBpbiB0aGUgbm90ZS5cIikpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICB0aGlzLnF1ZXVlID0gdGhpcy5xdWV1ZS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uaWQgIT09IHRhc2suaWQpO1xyXG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xyXG4gICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NjIxMFx1NTI5Rlx1MzAwMlwiLCBcIkltYWdlIHVwbG9hZGVkIHN1Y2Nlc3NmdWxseS5cIikpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihcIlNlY3VyZSBXZWJEQVYgcXVldWVkIHVwbG9hZCBmYWlsZWRcIiwgZXJyb3IpO1xyXG4gICAgICB0YXNrLmF0dGVtcHRzICs9IDE7XHJcbiAgICAgIHRhc2subGFzdEVycm9yID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xyXG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xyXG4gICAgICBpZiAodGFzay5hdHRlbXB0cyA+PSB0aGlzLnNldHRpbmdzLm1heFJldHJ5QXR0ZW1wdHMpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLnJlcGxhY2VQbGFjZWhvbGRlcih0YXNrLm5vdGVQYXRoLCB0YXNrLmlkLCB0YXNrLnBsYWNlaG9sZGVyLCB0aGlzLmJ1aWxkRmFpbGVkUGxhY2Vob2xkZXIodGFzay5maWxlTmFtZSwgdGFzay5sYXN0RXJyb3IpKTtcclxuICAgICAgICB0aGlzLnF1ZXVlID0gdGhpcy5xdWV1ZS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uaWQgIT09IHRhc2suaWQpO1xyXG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XHJcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU2NzAwXHU3RUM4XHU1OTMxXHU4RDI1XCIsIFwiSW1hZ2UgdXBsb2FkIGZhaWxlZCBwZXJtYW5lbnRseVwiKSwgZXJyb3IpLCA4MDAwKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLnNjaGVkdWxlUmV0cnkodGFzayk7XHJcbiAgICAgIH1cclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIHRoaXMucHJvY2Vzc2luZ1Rhc2tJZHMuZGVsZXRlKHRhc2suaWQpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBzY2hlZHVsZVJldHJ5KHRhc2s6IFVwbG9hZFRhc2spIHtcclxuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5yZXRyeVRpbWVvdXRzLmdldCh0YXNrLmlkKTtcclxuICAgIGlmIChleGlzdGluZykge1xyXG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KGV4aXN0aW5nKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBkZWxheSA9IE1hdGgubWF4KDEsIHRoaXMuc2V0dGluZ3MucmV0cnlEZWxheVNlY29uZHMpICogMTAwMCAqIHRhc2suYXR0ZW1wdHM7XHJcbiAgICBjb25zdCB0aW1lb3V0SWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgIHRoaXMucmV0cnlUaW1lb3V0cy5kZWxldGUodGFzay5pZCk7XHJcbiAgICAgIHZvaWQgdGhpcy5wcm9jZXNzVGFzayh0YXNrKTtcclxuICAgIH0sIGRlbGF5KTtcclxuICAgIHRoaXMucmV0cnlUaW1lb3V0cy5zZXQodGFzay5pZCwgdGltZW91dElkKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgcmVwbGFjZVBsYWNlaG9sZGVyKG5vdGVQYXRoOiBzdHJpbmcsIHRhc2tJZDogc3RyaW5nLCBwbGFjZWhvbGRlcjogc3RyaW5nLCByZXBsYWNlbWVudDogc3RyaW5nKSB7XHJcbiAgICBjb25zdCByZXBsYWNlZEluRWRpdG9yID0gdGhpcy5yZXBsYWNlUGxhY2Vob2xkZXJJbk9wZW5FZGl0b3JzKG5vdGVQYXRoLCB0YXNrSWQsIHBsYWNlaG9sZGVyLCByZXBsYWNlbWVudCk7XHJcbiAgICBpZiAocmVwbGFjZWRJbkVkaXRvcikge1xyXG4gICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKG5vdGVQYXRoKTtcclxuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xyXG4gICAgaWYgKGNvbnRlbnQuaW5jbHVkZXMocGxhY2Vob2xkZXIpKSB7XHJcbiAgICAgIGNvbnN0IHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGxhY2Vob2xkZXIsIHJlcGxhY2VtZW50KTtcclxuICAgICAgaWYgKHVwZGF0ZWQgIT09IGNvbnRlbnQpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdXBkYXRlZCk7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBwYXR0ZXJuID0gbmV3IFJlZ0V4cChgPHNwYW5bXj5dKmRhdGEtc2VjdXJlLXdlYmRhdi10YXNrPVwiJHt0aGlzLmVzY2FwZVJlZ0V4cCh0YXNrSWQpfVwiW14+XSo+Lio/PFxcL3NwYW4+YCwgXCJzXCIpO1xyXG4gICAgaWYgKHBhdHRlcm4udGVzdChjb250ZW50KSkge1xyXG4gICAgICBjb25zdCB1cGRhdGVkID0gY29udGVudC5yZXBsYWNlKHBhdHRlcm4sIHJlcGxhY2VtZW50KTtcclxuICAgICAgaWYgKHVwZGF0ZWQgIT09IGNvbnRlbnQpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdXBkYXRlZCk7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGJ1aWxkRmFpbGVkUGxhY2Vob2xkZXIoZmlsZU5hbWU6IHN0cmluZywgbWVzc2FnZT86IHN0cmluZykge1xuICAgIGNvbnN0IHNhZmVOYW1lID0gdGhpcy5lc2NhcGVIdG1sKGZpbGVOYW1lKTtcbiAgICBjb25zdCBzYWZlTWVzc2FnZSA9IHRoaXMuZXNjYXBlSHRtbChtZXNzYWdlID8/IHRoaXMudChcIlx1NjcyQVx1NzdFNVx1OTUxOVx1OEJFRlwiLCBcIlVua25vd24gZXJyb3JcIikpO1xuICAgIHJldHVybiBgPHNwYW4gY2xhc3M9XCJzZWN1cmUtd2ViZGF2LWZhaWxlZFwiIGFyaWEtbGFiZWw9XCIke3NhZmVOYW1lfVwiPiR7dGhpcy5lc2NhcGVIdG1sKHRoaXMuZm9ybWF0RmFpbGVkTGFiZWwoZmlsZU5hbWUpKX06ICR7c2FmZU1lc3NhZ2V9PC9zcGFuPmA7XG4gIH1cblxuICBwcml2YXRlIGVzY2FwZUh0bWwodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiB2YWx1ZVxuICAgICAgLnJlcGxhY2UoLyYvZywgXCImYW1wO1wiKVxuICAgICAgLnJlcGxhY2UoL1wiL2csIFwiJnF1b3Q7XCIpXG4gICAgICAucmVwbGFjZSgvPC9nLCBcIiZsdDtcIilcbiAgICAgIC5yZXBsYWNlKC8+L2csIFwiJmd0O1wiKTtcbiAgfVxuXG4gIHByaXZhdGUgdW5lc2NhcGVIdG1sKHZhbHVlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdmFsdWVcbiAgICAgIC5yZXBsYWNlKC8mcXVvdDsvZywgXCJcXFwiXCIpXG4gICAgICAucmVwbGFjZSgvJmd0Oy9nLCBcIj5cIilcbiAgICAgIC5yZXBsYWNlKC8mbHQ7L2csIFwiPFwiKVxuICAgICAgLnJlcGxhY2UoLyZhbXA7L2csIFwiJlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmwocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBGZXRjaCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtyZXNwb25zZS5hcnJheUJ1ZmZlcl0sIHtcbiAgICAgIHR5cGU6IHJlc3BvbnNlLmhlYWRlcnNbXCJjb250ZW50LXR5cGVcIl0gPz8gXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIixcbiAgICB9KTtcbiAgICBjb25zdCBibG9iVXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICB0aGlzLmJsb2JVcmxzLmFkZChibG9iVXJsKTtcbiAgICByZXR1cm4gYmxvYlVybDtcbiAgfVxuXG4gIHByaXZhdGUgYXJyYXlCdWZmZXJUb0Jhc2U2NChidWZmZXI6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShidWZmZXIpO1xuICAgIGNvbnN0IGNodW5rU2l6ZSA9IDB4ODAwMDtcbiAgICBsZXQgYmluYXJ5ID0gXCJcIjtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYnl0ZXMubGVuZ3RoOyBpbmRleCArPSBjaHVua1NpemUpIHtcbiAgICAgIGNvbnN0IGNodW5rID0gYnl0ZXMuc3ViYXJyYXkoaW5kZXgsIGluZGV4ICsgY2h1bmtTaXplKTtcbiAgICAgIGJpbmFyeSArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKC4uLmNodW5rKTtcbiAgICB9XG4gICAgcmV0dXJuIGJ0b2EoYmluYXJ5KTtcbiAgfVxuXG4gIHByaXZhdGUgYmFzZTY0VG9BcnJheUJ1ZmZlcihiYXNlNjQ6IHN0cmluZykge1xuICAgIGNvbnN0IGJpbmFyeSA9IGF0b2IoYmFzZTY0KTtcbiAgICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KGJpbmFyeS5sZW5ndGgpO1xuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBiaW5hcnkubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgICBieXRlc1tpbmRleF0gPSBiaW5hcnkuY2hhckNvZGVBdChpbmRleCk7XG4gICAgfVxuICAgIHJldHVybiBieXRlcy5idWZmZXIuc2xpY2UoYnl0ZXMuYnl0ZU9mZnNldCwgYnl0ZXMuYnl0ZU9mZnNldCArIGJ5dGVzLmJ5dGVMZW5ndGgpIGFzIEFycmF5QnVmZmVyO1xuICB9XG5cbiAgcHJpdmF0ZSBhcnJheUJ1ZmZlcnNFcXVhbChsZWZ0OiBBcnJheUJ1ZmZlciwgcmlnaHQ6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgYSA9IG5ldyBVaW50OEFycmF5KGxlZnQpO1xuICAgIGNvbnN0IGIgPSBuZXcgVWludDhBcnJheShyaWdodCk7XG4gICAgaWYgKGEubGVuZ3RoICE9PSBiLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBhLmxlbmd0aDsgaW5kZXggKz0gMSkge1xuICAgICAgaWYgKGFbaW5kZXhdICE9PSBiW2luZGV4XSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkQ2xpcGJvYXJkRmlsZU5hbWUobWltZVR5cGU6IHN0cmluZykge1xuICAgIGNvbnN0IGV4dGVuc2lvbiA9IG1pbWVUeXBlLnNwbGl0KFwiL1wiKVsxXT8ucmVwbGFjZShcImpwZWdcIiwgXCJqcGdcIikgfHwgXCJwbmdcIjtcbiAgICByZXR1cm4gYHBhc3RlZC1pbWFnZS0ke0RhdGUubm93KCl9LiR7ZXh0ZW5zaW9ufWA7XG4gIH1cblxyXG4gIHByaXZhdGUgZXNjYXBlUmVnRXhwKHZhbHVlOiBzdHJpbmcpIHtcclxuICAgIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgXCJcXFxcJCZcIik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHJlcGxhY2VQbGFjZWhvbGRlckluT3BlbkVkaXRvcnMobm90ZVBhdGg6IHN0cmluZywgdGFza0lkOiBzdHJpbmcsIHBsYWNlaG9sZGVyOiBzdHJpbmcsIHJlcGxhY2VtZW50OiBzdHJpbmcpIHtcclxuICAgIGxldCByZXBsYWNlZCA9IGZhbHNlO1xyXG4gICAgY29uc3QgbGVhdmVzID0gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYXZlc09mVHlwZShcIm1hcmtkb3duXCIpO1xyXG5cclxuICAgIGZvciAoY29uc3QgbGVhZiBvZiBsZWF2ZXMpIHtcclxuICAgICAgY29uc3QgdmlldyA9IGxlYWYudmlldztcclxuICAgICAgaWYgKCEodmlldyBpbnN0YW5jZW9mIE1hcmtkb3duVmlldykpIHtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKCF2aWV3LmZpbGUgfHwgdmlldy5maWxlLnBhdGggIT09IG5vdGVQYXRoKSB7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGVkaXRvciA9IHZpZXcuZWRpdG9yO1xyXG4gICAgICBjb25zdCBjb250ZW50ID0gZWRpdG9yLmdldFZhbHVlKCk7XHJcbiAgICAgIGxldCB1cGRhdGVkID0gY29udGVudDtcclxuXHJcbiAgICAgIGlmIChjb250ZW50LmluY2x1ZGVzKHBsYWNlaG9sZGVyKSkge1xyXG4gICAgICAgIHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGxhY2Vob2xkZXIsIHJlcGxhY2VtZW50KTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zdCBwYXR0ZXJuID0gbmV3IFJlZ0V4cChcclxuICAgICAgICAgIGA8c3BhbltePl0qZGF0YS1zZWN1cmUtd2ViZGF2LXRhc2s9XCIke3RoaXMuZXNjYXBlUmVnRXhwKHRhc2tJZCl9XCJbXj5dKj4uKj88XFxcXC9zcGFuPmAsXHJcbiAgICAgICAgICBcInNcIixcclxuICAgICAgICApO1xyXG4gICAgICAgIHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGF0dGVybiwgcmVwbGFjZW1lbnQpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAodXBkYXRlZCAhPT0gY29udGVudCkge1xyXG4gICAgICAgIGVkaXRvci5zZXRWYWx1ZSh1cGRhdGVkKTtcclxuICAgICAgICByZXBsYWNlZCA9IHRydWU7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gcmVwbGFjZWQ7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIHByb2Nlc3NTZWN1cmVJbWFnZXMoZWw6IEhUTUxFbGVtZW50LCBjdHg6IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQpIHtcbiAgICBjb25zdCBzZWN1cmVOb2RlcyA9IEFycmF5LmZyb20oZWwucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXCJbZGF0YS1zZWN1cmUtd2ViZGF2XVwiKSk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXHJcbiAgICAgIHNlY3VyZU5vZGVzLm1hcChhc3luYyAobm9kZSkgPT4ge1xyXG4gICAgICAgIGlmIChub2RlIGluc3RhbmNlb2YgSFRNTEltYWdlRWxlbWVudCkge1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5zd2FwSW1hZ2VTb3VyY2Uobm9kZSk7XHJcbiAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCByZW1vdGVQYXRoID0gbm9kZS5nZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIik7XHJcbiAgICAgICAgaWYgKCFyZW1vdGVQYXRoKSB7XHJcbiAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xyXG4gICAgICAgIGltZy5hbHQgPSBub2RlLmdldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIikgPz8gbm9kZS5nZXRBdHRyaWJ1dGUoXCJhbHRcIikgPz8gXCJTZWN1cmUgV2ViREFWIGltYWdlXCI7XHJcbiAgICAgICAgaW1nLnNldEF0dHJpYnV0ZShcImRhdGEtc2VjdXJlLXdlYmRhdlwiLCByZW1vdGVQYXRoKTtcclxuICAgICAgICBpbWcuY2xhc3NMaXN0LmFkZChcInNlY3VyZS13ZWJkYXYtaW1hZ2VcIiwgXCJpcy1sb2FkaW5nXCIpO1xyXG4gICAgICAgIG5vZGUucmVwbGFjZVdpdGgoaW1nKTtcclxuICAgICAgICBhd2FpdCB0aGlzLnN3YXBJbWFnZVNvdXJjZShpbWcpO1xyXG4gICAgICB9KSxcclxuICAgICk7XHJcblxyXG4gICAgY29uc3Qgc2VjdXJlTGlua3MgPSBBcnJheS5mcm9tKGVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEltYWdlRWxlbWVudD4oYGltZ1tzcmNePVwiJHtTRUNVUkVfUFJPVE9DT0x9Ly9cIl1gKSk7XHJcbiAgICBhd2FpdCBQcm9taXNlLmFsbChzZWN1cmVMaW5rcy5tYXAoYXN5bmMgKGltZykgPT4gdGhpcy5zd2FwSW1hZ2VTb3VyY2UoaW1nKSkpO1xyXG5cbiAgICBjdHguYWRkQ2hpbGQobmV3IFNlY3VyZVdlYmRhdlJlbmRlckNoaWxkKGVsKSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHByb2Nlc3NTZWN1cmVDb2RlQmxvY2soc291cmNlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCwgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0KSB7XG4gICAgY29uc3QgcGFyc2VkID0gdGhpcy5wYXJzZVNlY3VyZUltYWdlQmxvY2soc291cmNlKTtcbiAgICBpZiAoIXBhcnNlZD8ucGF0aCkge1xuICAgICAgZWwuY3JlYXRlRWwoXCJkaXZcIiwge1xuICAgICAgICB0ZXh0OiB0aGlzLnQoXCJcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTRFRTNcdTc4MDFcdTU3NTdcdTY4M0NcdTVGMEZcdTY1RTBcdTY1NDhcdTMwMDJcIiwgXCJJbnZhbGlkIHNlY3VyZSBpbWFnZSBjb2RlIGJsb2NrIGZvcm1hdC5cIiksXG4gICAgICB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xuICAgIGltZy5hbHQgPSBwYXJzZWQuYWx0IHx8IHBhcnNlZC5wYXRoO1xuICAgIGltZy5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIiwgcGFyc2VkLnBhdGgpO1xuICAgIGltZy5jbGFzc0xpc3QuYWRkKFwic2VjdXJlLXdlYmRhdi1pbWFnZVwiLCBcImlzLWxvYWRpbmdcIik7XG4gICAgZWwuZW1wdHkoKTtcbiAgICBlbC5hcHBlbmRDaGlsZChpbWcpO1xuICAgIGF3YWl0IHRoaXMuc3dhcEltYWdlU291cmNlKGltZyk7XG4gICAgY3R4LmFkZENoaWxkKG5ldyBTZWN1cmVXZWJkYXZSZW5kZXJDaGlsZChlbCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBwYXJzZVNlY3VyZUltYWdlQmxvY2soc291cmNlOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQ6IHsgcGF0aDogc3RyaW5nOyBhbHQ6IHN0cmluZyB9ID0geyBwYXRoOiBcIlwiLCBhbHQ6IFwiXCIgfTtcbiAgICBmb3IgKGNvbnN0IHJhd0xpbmUgb2Ygc291cmNlLnNwbGl0KC9cXHI/XFxuLykpIHtcbiAgICAgIGNvbnN0IGxpbmUgPSByYXdMaW5lLnRyaW0oKTtcbiAgICAgIGlmICghbGluZSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc2VwYXJhdG9ySW5kZXggPSBsaW5lLmluZGV4T2YoXCI6XCIpO1xuICAgICAgaWYgKHNlcGFyYXRvckluZGV4ID09PSAtMSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qga2V5ID0gbGluZS5zbGljZSgwLCBzZXBhcmF0b3JJbmRleCkudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgICBjb25zdCB2YWx1ZSA9IGxpbmUuc2xpY2Uoc2VwYXJhdG9ySW5kZXggKyAxKS50cmltKCk7XG4gICAgICBpZiAoa2V5ID09PSBcInBhdGhcIikge1xuICAgICAgICByZXN1bHQucGF0aCA9IHZhbHVlO1xuICAgICAgfSBlbHNlIGlmIChrZXkgPT09IFwiYWx0XCIpIHtcbiAgICAgICAgcmVzdWx0LmFsdCA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQucGF0aCA/IHJlc3VsdCA6IG51bGw7XG4gIH1cblxyXG4gIHByaXZhdGUgYXN5bmMgc3dhcEltYWdlU291cmNlKGltZzogSFRNTEltYWdlRWxlbWVudCkge1xyXG4gICAgY29uc3QgcmVtb3RlUGF0aCA9XHJcbiAgICAgIGltZy5nZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIikgPz8gdGhpcy5leHRyYWN0UmVtb3RlUGF0aChpbWcuZ2V0QXR0cmlidXRlKFwic3JjXCIpID8/IFwiXCIpO1xyXG4gICAgaWYgKCFyZW1vdGVQYXRoKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpbWcuY2xhc3NMaXN0LmFkZChcInNlY3VyZS13ZWJkYXYtaW1hZ2VcIiwgXCJpcy1sb2FkaW5nXCIpO1xyXG4gICAgY29uc3Qgb3JpZ2luYWxBbHQgPSBpbWcuYWx0O1xyXG4gICAgaW1nLmFsdCA9IG9yaWdpbmFsQWx0IHx8IHRoaXMudChcIlx1NTJBMFx1OEY3RFx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NEUyRC4uLlwiLCBcIkxvYWRpbmcgc2VjdXJlIGltYWdlLi4uXCIpO1xyXG5cclxuICAgIHRyeSB7XG4gICAgICBjb25zdCBibG9iVXJsID0gYXdhaXQgdGhpcy5mZXRjaFNlY3VyZUltYWdlQmxvYlVybChyZW1vdGVQYXRoKTtcbiAgICAgIGltZy5zcmMgPSBibG9iVXJsO1xuICAgICAgaW1nLmFsdCA9IG9yaWdpbmFsQWx0O1xuICAgICAgaW1nLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgICBpbWcuc3R5bGUubWF4V2lkdGggPSBcIjEwMCVcIjtcclxuICAgICAgaW1nLmNsYXNzTGlzdC5yZW1vdmUoXCJpcy1sb2FkaW5nXCIsIFwiaXMtZXJyb3JcIik7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiU2VjdXJlIFdlYkRBViBpbWFnZSBsb2FkIGZhaWxlZFwiLCBlcnJvcik7XHJcbiAgICAgIGltZy5yZXBsYWNlV2l0aCh0aGlzLmJ1aWxkRXJyb3JFbGVtZW50KHJlbW90ZVBhdGgsIGVycm9yKSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGV4dHJhY3RSZW1vdGVQYXRoKHNyYzogc3RyaW5nKSB7XHJcbiAgICBjb25zdCBwcmVmaXggPSBgJHtTRUNVUkVfUFJPVE9DT0x9Ly9gO1xyXG4gICAgaWYgKCFzcmMuc3RhcnRzV2l0aChwcmVmaXgpKSB7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBzcmMuc2xpY2UocHJlZml4Lmxlbmd0aCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGJ1aWxkUmVtb3RlUGF0aChmaWxlTmFtZTogc3RyaW5nKSB7XHJcbiAgICByZXR1cm4gYCR7dGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5zZXR0aW5ncy5yZW1vdGVGb2xkZXIpfSR7ZmlsZU5hbWV9YDtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnkoZmlsZU5hbWU6IHN0cmluZywgYmluYXJ5OiBBcnJheUJ1ZmZlcikge1xuICAgIGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbUZpbGVOYW1lKGZpbGVOYW1lKTtcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5uYW1pbmdTdHJhdGVneSA9PT0gXCJoYXNoXCIpIHtcbiAgICAgIGNvbnN0IGhhc2ggPSAoYXdhaXQgdGhpcy5jb21wdXRlU2hhMjU2SGV4KGJpbmFyeSkpLnNsaWNlKDAsIDE2KTtcbiAgICAgIHJldHVybiBgJHtoYXNofS4ke2V4dGVuc2lvbn1gO1xuICAgIH1cblxyXG4gICAgcmV0dXJuIGAke0RhdGUubm93KCl9LSR7ZmlsZU5hbWV9YDtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aDogc3RyaW5nKSB7XHJcbiAgICBjb25zdCBiYXNlID0gdGhpcy5zZXR0aW5ncy53ZWJkYXZVcmwucmVwbGFjZSgvXFwvKyQvLCBcIlwiKTtcclxuICAgIHJldHVybiBgJHtiYXNlfS8ke3JlbW90ZVBhdGguc3BsaXQoXCIvXCIpLm1hcChlbmNvZGVVUklDb21wb25lbnQpLmpvaW4oXCIvXCIpfWA7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIG5vcm1hbGl6ZUZvbGRlcihpbnB1dDogc3RyaW5nKSB7XHJcbiAgICByZXR1cm4gaW5wdXQucmVwbGFjZSgvXlxcLysvLCBcIlwiKS5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpICsgXCIvXCI7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGJ1aWxkQXV0aEhlYWRlcigpIHtcbiAgICBjb25zdCB0b2tlbiA9IHRoaXMuYXJyYXlCdWZmZXJUb0Jhc2U2NCh0aGlzLmVuY29kZVV0ZjgoYCR7dGhpcy5zZXR0aW5ncy51c2VybmFtZX06JHt0aGlzLnNldHRpbmdzLnBhc3N3b3JkfWApKTtcbiAgICByZXR1cm4gYEJhc2ljICR7dG9rZW59YDtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBlbnN1cmVDb25maWd1cmVkKCkge1xyXG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLndlYmRhdlVybCB8fCAhdGhpcy5zZXR0aW5ncy51c2VybmFtZSB8fCAhdGhpcy5zZXR0aW5ncy5wYXNzd29yZCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiV2ViREFWIFx1OTE0RFx1N0Y2RVx1NEUwRFx1NUI4Q1x1NjU3NFx1MzAwMlwiLCBcIldlYkRBViBzZXR0aW5ncyBhcmUgaW5jb21wbGV0ZS5cIikpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBnZXRNaW1lVHlwZShleHRlbnNpb246IHN0cmluZykge1xyXG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IGV4dGVuc2lvbi50b0xvd2VyQ2FzZSgpO1xyXG4gICAgaWYgKG5vcm1hbGl6ZWQgPT09IFwianBnXCIgfHwgbm9ybWFsaXplZCA9PT0gXCJqcGVnXCIpIHJldHVybiBcImltYWdlL2pwZWdcIjtcclxuICAgIGlmIChub3JtYWxpemVkID09PSBcInBuZ1wiKSByZXR1cm4gXCJpbWFnZS9wbmdcIjtcclxuICAgIGlmIChub3JtYWxpemVkID09PSBcImdpZlwiKSByZXR1cm4gXCJpbWFnZS9naWZcIjtcclxuICAgIGlmIChub3JtYWxpemVkID09PSBcIndlYnBcIikgcmV0dXJuIFwiaW1hZ2Uvd2VicFwiO1xyXG4gICAgaWYgKG5vcm1hbGl6ZWQgPT09IFwic3ZnXCIpIHJldHVybiBcImltYWdlL3N2Zyt4bWxcIjtcclxuICAgIGlmIChub3JtYWxpemVkID09PSBcImJtcFwiKSByZXR1cm4gXCJpbWFnZS9ibXBcIjtcclxuICAgIHJldHVybiBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBnZXRNaW1lVHlwZUZyb21GaWxlTmFtZShmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0TWltZVR5cGUodGhpcy5nZXRFeHRlbnNpb25Gcm9tRmlsZU5hbWUoZmlsZU5hbWUpKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0RXh0ZW5zaW9uRnJvbUZpbGVOYW1lKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBwaWVjZXMgPSBmaWxlTmFtZS5zcGxpdChcIi5cIik7XG4gICAgcmV0dXJuIHBpZWNlcy5sZW5ndGggPiAxID8gcGllY2VzW3BpZWNlcy5sZW5ndGggLSAxXS50b0xvd2VyQ2FzZSgpIDogXCJwbmdcIjtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcHJlcGFyZVVwbG9hZFBheWxvYWQoYmluYXJ5OiBBcnJheUJ1ZmZlciwgbWltZVR5cGU6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGlmICghdGhpcy5zZXR0aW5ncy5jb21wcmVzc0ltYWdlcykge1xuICAgICAgcmV0dXJuIHsgYmluYXJ5LCBtaW1lVHlwZSwgZmlsZU5hbWUgfTtcbiAgICB9XG5cbiAgICBjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRoaXMuY29tcHJlc3NJbWFnZUlmTmVlZGVkKGJpbmFyeSwgbWltZVR5cGUsIGZpbGVOYW1lKTtcbiAgICByZXR1cm4gcHJlcGFyZWQgPz8geyBiaW5hcnksIG1pbWVUeXBlLCBmaWxlTmFtZSB9O1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjb21wcmVzc0ltYWdlSWZOZWVkZWQoYmluYXJ5OiBBcnJheUJ1ZmZlciwgbWltZVR5cGU6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGlmICghL15pbWFnZVxcLyhwbmd8anBlZ3xqcGd8d2VicCkkL2kudGVzdChtaW1lVHlwZSkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IHRocmVzaG9sZEJ5dGVzID0gdGhpcy5zZXR0aW5ncy5jb21wcmVzc1RocmVzaG9sZEtiICogMTAyNDtcbiAgICBjb25zdCBzb3VyY2VCbG9iID0gbmV3IEJsb2IoW2JpbmFyeV0sIHsgdHlwZTogbWltZVR5cGUgfSk7XG4gICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB0aGlzLmxvYWRJbWFnZUVsZW1lbnQoc291cmNlQmxvYik7XG4gICAgY29uc3QgbGFyZ2VzdFNpZGUgPSBNYXRoLm1heChpbWFnZS5uYXR1cmFsV2lkdGgsIGltYWdlLm5hdHVyYWxIZWlnaHQpO1xuICAgIGNvbnN0IG5lZWRzUmVzaXplID0gbGFyZ2VzdFNpZGUgPiB0aGlzLnNldHRpbmdzLm1heEltYWdlRGltZW5zaW9uO1xuICAgIGNvbnN0IG5lZWRzQ29tcHJlc3MgPSBzb3VyY2VCbG9iLnNpemUgPiB0aHJlc2hvbGRCeXRlcyB8fCBuZWVkc1Jlc2l6ZTtcbiAgICBpZiAoIW5lZWRzQ29tcHJlc3MpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IHNjYWxlID0gbmVlZHNSZXNpemUgPyB0aGlzLnNldHRpbmdzLm1heEltYWdlRGltZW5zaW9uIC8gbGFyZ2VzdFNpZGUgOiAxO1xuICAgIGNvbnN0IHRhcmdldFdpZHRoID0gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChpbWFnZS5uYXR1cmFsV2lkdGggKiBzY2FsZSkpO1xuICAgIGNvbnN0IHRhcmdldEhlaWdodCA9IE1hdGgubWF4KDEsIE1hdGgucm91bmQoaW1hZ2UubmF0dXJhbEhlaWdodCAqIHNjYWxlKSk7XG4gICAgY29uc3QgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImNhbnZhc1wiKTtcbiAgICBjYW52YXMud2lkdGggPSB0YXJnZXRXaWR0aDtcbiAgICBjYW52YXMuaGVpZ2h0ID0gdGFyZ2V0SGVpZ2h0O1xuICAgIGNvbnN0IGNvbnRleHQgPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpO1xuICAgIGlmICghY29udGV4dCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29udGV4dC5kcmF3SW1hZ2UoaW1hZ2UsIDAsIDAsIHRhcmdldFdpZHRoLCB0YXJnZXRIZWlnaHQpO1xuXG4gICAgY29uc3Qgb3V0cHV0TWltZSA9IG1pbWVUeXBlLnRvTG93ZXJDYXNlKCkgPT09IFwiaW1hZ2UvanBnXCIgPyBcImltYWdlL2pwZWdcIiA6IG1pbWVUeXBlO1xuICAgIGNvbnN0IHF1YWxpdHkgPSBNYXRoLm1heCgwLjQsIE1hdGgubWluKDAuOTgsIHRoaXMuc2V0dGluZ3MuanBlZ1F1YWxpdHkgLyAxMDApKTtcbiAgICBjb25zdCBjb21wcmVzc2VkQmxvYiA9IGF3YWl0IG5ldyBQcm9taXNlPEJsb2IgfCBudWxsPigocmVzb2x2ZSkgPT4ge1xuICAgICAgY2FudmFzLnRvQmxvYihyZXNvbHZlLCBvdXRwdXRNaW1lLCBxdWFsaXR5KTtcbiAgICB9KTtcblxuICAgIGlmICghY29tcHJlc3NlZEJsb2IpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmICghbmVlZHNSZXNpemUgJiYgY29tcHJlc3NlZEJsb2Iuc2l6ZSA+PSBzb3VyY2VCbG9iLnNpemUpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IG5leHRCaW5hcnkgPSBhd2FpdCBjb21wcmVzc2VkQmxvYi5hcnJheUJ1ZmZlcigpO1xuICAgIGNvbnN0IG5leHRFeHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbkZyb21NaW1lVHlwZShvdXRwdXRNaW1lKSA/PyB0aGlzLmdldEV4dGVuc2lvbkZyb21GaWxlTmFtZShmaWxlTmFtZSk7XG4gICAgY29uc3QgbmV4dEZpbGVOYW1lID0gZmlsZU5hbWUucmVwbGFjZSgvXFwuW14uXSskLywgXCJcIikgKyBgLiR7bmV4dEV4dGVuc2lvbn1gO1xuICAgIHJldHVybiB7XG4gICAgICBiaW5hcnk6IG5leHRCaW5hcnksXG4gICAgICBtaW1lVHlwZTogb3V0cHV0TWltZSxcbiAgICAgIGZpbGVOYW1lOiBuZXh0RmlsZU5hbWUsXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgbG9hZEltYWdlRWxlbWVudChibG9iOiBCbG9iKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPEhUTUxJbWFnZUVsZW1lbnQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICBjb25zdCBpbWFnZSA9IG5ldyBJbWFnZSgpO1xuICAgICAgaW1hZ2Uub25sb2FkID0gKCkgPT4ge1xuICAgICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG4gICAgICAgIHJlc29sdmUoaW1hZ2UpO1xuICAgICAgfTtcbiAgICAgIGltYWdlLm9uZXJyb3IgPSAoZXJyb3IpID0+IHtcbiAgICAgICAgVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfTtcbiAgICAgIGltYWdlLnNyYyA9IHVybDtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgZXh0ZW5zaW9uRnJvbU1pbWVUeXBlKG1pbWVUeXBlOiBzdHJpbmcpIHtcbiAgICBpZiAobWltZVR5cGUgPT09IFwiaW1hZ2UvanBlZ1wiKSByZXR1cm4gXCJqcGdcIjtcbiAgICBpZiAobWltZVR5cGUgPT09IFwiaW1hZ2UvcG5nXCIpIHJldHVybiBcInBuZ1wiO1xuICAgIGlmIChtaW1lVHlwZSA9PT0gXCJpbWFnZS93ZWJwXCIpIHJldHVybiBcIndlYnBcIjtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBhc3luYyB0cmFzaElmRXhpc3RzKGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LnRyYXNoKGZpbGUsIHRydWUpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS53YXJuKFwiRmFpbGVkIHRvIHRyYXNoIGxvY2FsIGltYWdlIGFmdGVyIHVwbG9hZFwiLCBlcnJvcik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsOiBzdHJpbmcsIGFsdDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuZXh0cmFjdFJlbW90ZVBhdGgocmVtb3RlVXJsKTtcbiAgICBpZiAoIXJlbW90ZVBhdGgpIHtcbiAgICAgIHJldHVybiBgIVtdKCR7cmVtb3RlVXJsfSlgO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmJ1aWxkU2VjdXJlSW1hZ2VDb2RlQmxvY2socmVtb3RlUGF0aCwgYWx0KTtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayhyZW1vdGVQYXRoOiBzdHJpbmcsIGFsdDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZEFsdCA9IChhbHQgfHwgcmVtb3RlUGF0aCkucmVwbGFjZSgvXFxyP1xcbi9nLCBcIiBcIikudHJpbSgpO1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gcmVtb3RlUGF0aC5yZXBsYWNlKC9cXHI/XFxuL2csIFwiXCIpLnRyaW0oKTtcbiAgICByZXR1cm4gW1xuICAgICAgYFxcYFxcYFxcYCR7U0VDVVJFX0NPREVfQkxPQ0t9YCxcbiAgICAgIGBwYXRoOiAke25vcm1hbGl6ZWRQYXRofWAsXG4gICAgICBgYWx0OiAke25vcm1hbGl6ZWRBbHR9YCxcbiAgICAgIFwiYGBgXCIsXG4gICAgXS5qb2luKFwiXFxuXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBmb3JtYXRFbWJlZExhYmVsKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy50KGBcdTMwMTBcdTVCODlcdTUxNjhcdThGRENcdTdBMEJcdTU2RkVcdTcyNDdcdUZGNUMke2ZpbGVOYW1lfVx1MzAxMWAsIGBbU2VjdXJlIHJlbW90ZSBpbWFnZSB8ICR7ZmlsZU5hbWV9XWApO1xuICB9XG5cbiAgcHJpdmF0ZSBmb3JtYXRGYWlsZWRMYWJlbChmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMudChgXHUzMDEwXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU1OTMxXHU4RDI1XHVGRjVDJHtmaWxlTmFtZX1cdTMwMTFgLCBgW0ltYWdlIHVwbG9hZCBmYWlsZWQgfCAke2ZpbGVOYW1lfV1gKTtcbiAgfVxuXG4gIGFzeW5jIG1pZ3JhdGVBbGxMZWdhY3lTZWN1cmVJbWFnZXMoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVwbG9hZENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgICAgIGNvbnN0IGNhbmRpZGF0ZUxvY2FsSW1hZ2VzID0gbmV3IE1hcDxzdHJpbmcsIFRGaWxlPigpO1xuICAgICAgbGV0IGNoYW5nZWRGaWxlcyA9IDA7XG4gICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgdGhpcy5hcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpKSB7XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICBjb25zdCByZXBsYWNlbWVudHMgPSBhd2FpdCB0aGlzLmJ1aWxkVXBsb2FkUmVwbGFjZW1lbnRzKGNvbnRlbnQsIGZpbGUsIHVwbG9hZENhY2hlKTtcbiAgICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcbiAgICAgICAgICBpZiAocmVwbGFjZW1lbnQuc291cmNlRmlsZSkge1xuICAgICAgICAgICAgY2FuZGlkYXRlTG9jYWxJbWFnZXMuc2V0KHJlcGxhY2VtZW50LnNvdXJjZUZpbGUucGF0aCwgcmVwbGFjZW1lbnQuc291cmNlRmlsZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHVwZGF0ZWQgPSBjb250ZW50O1xuICAgICAgICBmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIHJlcGxhY2VtZW50cykge1xuICAgICAgICAgIHVwZGF0ZWQgPSB1cGRhdGVkLnNwbGl0KHJlcGxhY2VtZW50Lm9yaWdpbmFsKS5qb2luKHJlcGxhY2VtZW50LnJld3JpdHRlbik7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVkID0gdXBkYXRlZFxuICAgICAgICAgIC5yZXBsYWNlKFxuICAgICAgICAgICAgLzxzcGFuIGNsYXNzPVwic2VjdXJlLXdlYmRhdi1lbWJlZFwiIGRhdGEtc2VjdXJlLXdlYmRhdj1cIihbXlwiXSspXCIgYXJpYS1sYWJlbD1cIihbXlwiXSopXCI+Lio/PFxcL3NwYW4+L2csXG4gICAgICAgICAgICAoX21hdGNoLCByZW1vdGVQYXRoOiBzdHJpbmcsIGFsdDogc3RyaW5nKSA9PlxuICAgICAgICAgICAgICB0aGlzLmJ1aWxkU2VjdXJlSW1hZ2VDb2RlQmxvY2soXG4gICAgICAgICAgICAgICAgdGhpcy51bmVzY2FwZUh0bWwocmVtb3RlUGF0aCksXG4gICAgICAgICAgICAgICAgdGhpcy51bmVzY2FwZUh0bWwoYWx0KSB8fCB0aGlzLnVuZXNjYXBlSHRtbChyZW1vdGVQYXRoKSxcbiAgICAgICAgICAgICAgKSxcbiAgICAgICAgICApXG4gICAgICAgICAgLnJlcGxhY2UoXG4gICAgICAgICAgICAvIVxcW1teXFxdXSpdXFwod2ViZGF2LXNlY3VyZTpcXC9cXC8oW14pXSspXFwpL2csXG4gICAgICAgICAgICAoX21hdGNoLCByZW1vdGVQYXRoOiBzdHJpbmcpID0+XG4gICAgICAgICAgICAgIHRoaXMuYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayh0aGlzLnVuZXNjYXBlSHRtbChyZW1vdGVQYXRoKSwgdGhpcy51bmVzY2FwZUh0bWwocmVtb3RlUGF0aCkpLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgaWYgKHVwZGF0ZWQgPT09IGNvbnRlbnQpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB1cGRhdGVkKTtcbiAgICAgICAgY2hhbmdlZEZpbGVzICs9IDE7XG4gICAgICB9XG5cbiAgICAgIGlmIChjaGFuZ2VkRmlsZXMgPT09IDApIHtcbiAgICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgICB0aGlzLnQoXG4gICAgICAgICAgICBcIlx1NjU3NFx1NUU5M1x1OTFDQ1x1NkNBMVx1NjcwOVx1NTNEMVx1NzNCMFx1NTNFRlx1OEZDMVx1NzlGQlx1NzY4NFx1NjVFN1x1NzI0OFx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NjgwN1x1N0I3RVx1MzAwMlwiLFxuICAgICAgICAgICAgXCJObyBsZWdhY3kgc2VjdXJlIGltYWdlIHRhZ3Mgd2VyZSBmb3VuZCBpbiB0aGUgdmF1bHQuXCIsXG4gICAgICAgICAgKSxcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5kZWxldGVMb2NhbEFmdGVyVXBsb2FkKSB7XG4gICAgICAgIGF3YWl0IHRoaXMudHJhc2hNaWdyYXRlZEltYWdlc0lmU2FmZShjYW5kaWRhdGVMb2NhbEltYWdlcyk7XG4gICAgICB9XG5cbiAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgIHRoaXMudChcbiAgICAgICAgICBgXHU1REYyXHU4RkMxXHU3OUZCICR7Y2hhbmdlZEZpbGVzfSBcdTdCQzdcdTdCMTRcdThCQjBcdTUyMzBcdTY1QjBcdTc2ODRcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTRFRTNcdTc4MDFcdTU3NTdcdTY4M0NcdTVGMEZcdTMwMDJgLFxuICAgICAgICAgIGBNaWdyYXRlZCAke2NoYW5nZWRGaWxlc30gbm90ZShzKSB0byB0aGUgbmV3IHNlY3VyZSBpbWFnZSBjb2RlLWJsb2NrIGZvcm1hdC5gLFxuICAgICAgICApLFxuICAgICAgICA4MDAwLFxuICAgICAgKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBtaWdyYXRlIHNlY3VyZSBpbWFnZXMgdG8gY29kZSBibG9ja3NcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU4RkMxXHU3OUZCXHU1Qjg5XHU1MTY4XHU1NkZFXHU3MjQ3XHU2ODNDXHU1RjBGXHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIG1pZ3JhdGUgc2VjdXJlIGltYWdlIGZvcm1hdFwiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHRyYXNoTWlncmF0ZWRJbWFnZXNJZlNhZmUoY2FuZGlkYXRlTG9jYWxJbWFnZXM6IE1hcDxzdHJpbmcsIFRGaWxlPikge1xuICAgIGlmIChjYW5kaWRhdGVMb2NhbEltYWdlcy5zaXplID09PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgcmVtYWluaW5nUmVmcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGZvciAoY29uc3Qgbm90ZSBvZiB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkpIHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKG5vdGUpO1xuICAgICAgY29uc3Qgd2lraU1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvIVxcW1xcWyhbXlxcXV0rKVxcXVxcXS9nKV07XG4gICAgICBjb25zdCBtYXJrZG93bk1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvIVxcW1teXFxdXSpdXFwoKFteKV0rKVxcKS9nKV07XG5cbiAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2Ygd2lraU1hdGNoZXMpIHtcbiAgICAgICAgY29uc3QgcmF3TGluayA9IG1hdGNoWzFdLnNwbGl0KFwifFwiKVswXS50cmltKCk7XG4gICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMucmVzb2x2ZUxpbmtlZEZpbGUocmF3TGluaywgbm90ZS5wYXRoKTtcbiAgICAgICAgaWYgKHRhcmdldCAmJiB0aGlzLmlzSW1hZ2VGaWxlKHRhcmdldCkpIHtcbiAgICAgICAgICByZW1haW5pbmdSZWZzLmFkZCh0YXJnZXQucGF0aCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXJrZG93bk1hdGNoZXMpIHtcbiAgICAgICAgY29uc3QgcmF3TGluayA9IGRlY29kZVVSSUNvbXBvbmVudChtYXRjaFsxXS50cmltKCkucmVwbGFjZSgvXjx8PiQvZywgXCJcIikpO1xuICAgICAgICBpZiAoL14oaHR0cHM/Onx3ZWJkYXYtc2VjdXJlOnxkYXRhOikvaS50ZXN0KHJhd0xpbmspKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGUucGF0aCk7XG4gICAgICAgIGlmICh0YXJnZXQgJiYgdGhpcy5pc0ltYWdlRmlsZSh0YXJnZXQpKSB7XG4gICAgICAgICAgcmVtYWluaW5nUmVmcy5hZGQodGFyZ2V0LnBhdGgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBbcGF0aCwgZmlsZV0gb2YgY2FuZGlkYXRlTG9jYWxJbWFnZXMuZW50cmllcygpKSB7XG4gICAgICBpZiAocmVtYWluaW5nUmVmcy5oYXMocGF0aCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMudHJhc2hJZkV4aXN0cyhmaWxlKTtcbiAgICB9XG4gIH1cblxyXG4gIHByaXZhdGUgYnVpbGRFcnJvckVsZW1lbnQocmVtb3RlUGF0aDogc3RyaW5nLCBlcnJvcjogdW5rbm93bikge1xyXG4gICAgY29uc3QgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgZWwuY2xhc3NOYW1lID0gXCJzZWN1cmUtd2ViZGF2LWltYWdlIGlzLWVycm9yXCI7XHJcbiAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xyXG4gICAgZWwudGV4dENvbnRlbnQgPSB0aGlzLnQoXHJcbiAgICAgIGBcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTUyQTBcdThGN0RcdTU5MzFcdThEMjVcdUZGMUEke3JlbW90ZVBhdGh9XHVGRjA4JHttZXNzYWdlfVx1RkYwOWAsXHJcbiAgICAgIGBTZWN1cmUgaW1hZ2UgZmFpbGVkOiAke3JlbW90ZVBhdGh9ICgke21lc3NhZ2V9KWAsXHJcbiAgICApO1xyXG4gICAgcmV0dXJuIGVsO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgcnVuQ29ubmVjdGlvblRlc3Qoc2hvd01vZGFsID0gZmFsc2UpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xyXG5cclxuICAgICAgY29uc3QgcHJvYmVOYW1lID0gYC5zZWN1cmUtd2ViZGF2LXByb2JlLSR7RGF0ZS5ub3coKX0udHh0YDtcclxuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRSZW1vdGVQYXRoKHByb2JlTmFtZSk7XHJcbiAgICAgIGNvbnN0IHVwbG9hZFVybCA9IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCk7XHJcbiAgICAgIGNvbnN0IHByb2JlQXJyYXlCdWZmZXIgPSB0aGlzLmVuY29kZVV0ZjgoYHNlY3VyZS13ZWJkYXYgcHJvYmUgJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCl9YCk7XG5cclxuICAgICAgY29uc3QgcHV0UmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xyXG4gICAgICAgIHVybDogdXBsb2FkVXJsLFxyXG4gICAgICAgIG1ldGhvZDogXCJQVVRcIixcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxyXG4gICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJ0ZXh0L3BsYWluOyBjaGFyc2V0PXV0Zi04XCIsXHJcbiAgICAgICAgfSxcclxuICAgICAgICBib2R5OiBwcm9iZUFycmF5QnVmZmVyLFxyXG4gICAgICB9KTtcclxuICAgICAgaWYgKHB1dFJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCBwdXRSZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBQVVQgZmFpbGVkIHdpdGggc3RhdHVzICR7cHV0UmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBnZXRSZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XHJcbiAgICAgICAgdXJsOiB1cGxvYWRVcmwsXHJcbiAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxyXG4gICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXHJcbiAgICAgICAgfSxcclxuICAgICAgfSk7XHJcbiAgICAgIGlmIChnZXRSZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgZ2V0UmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgR0VUIGZhaWxlZCB3aXRoIHN0YXR1cyAke2dldFJlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZGVsZXRlUmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xyXG4gICAgICAgIHVybDogdXBsb2FkVXJsLFxyXG4gICAgICAgIG1ldGhvZDogXCJERUxFVEVcIixcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0pO1xyXG4gICAgICBpZiAoZGVsZXRlUmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IGRlbGV0ZVJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYERFTEVURSBmYWlsZWQgd2l0aCBzdGF0dXMgJHtkZWxldGVSZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSB0aGlzLnQoXHJcbiAgICAgICAgYFdlYkRBViBcdTZENEJcdThCRDVcdTkwMUFcdThGQzdcdTMwMDJQVVQgJHtwdXRSZXNwb25zZS5zdGF0dXN9XHVGRjBDR0VUICR7Z2V0UmVzcG9uc2Uuc3RhdHVzfVx1RkYwQ0RFTEVURSAke2RlbGV0ZVJlc3BvbnNlLnN0YXR1c31cdTMwMDJgLFxyXG4gICAgICAgIGBXZWJEQVYgdGVzdCBwYXNzZWQuIFBVVCAke3B1dFJlc3BvbnNlLnN0YXR1c30sIEdFVCAke2dldFJlc3BvbnNlLnN0YXR1c30sIERFTEVURSAke2RlbGV0ZVJlc3BvbnNlLnN0YXR1c30uYCxcclxuICAgICAgKTtcclxuICAgICAgbmV3IE5vdGljZShtZXNzYWdlLCA2MDAwKTtcclxuICAgICAgaWYgKHNob3dNb2RhbCkge1xyXG4gICAgICAgIG5ldyBSZXN1bHRNb2RhbCh0aGlzLmFwcCwgdGhpcy50KFwiV2ViREFWIFx1OEZERVx1NjNBNVwiLCBcIldlYkRBViBDb25uZWN0aW9uXCIpLCBtZXNzYWdlKS5vcGVuKCk7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiU2VjdXJlIFdlYkRBViB0ZXN0IGZhaWxlZFwiLCBlcnJvcik7XHJcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSB0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiV2ViREFWIFx1NkQ0Qlx1OEJENVx1NTkzMVx1OEQyNVwiLCBcIldlYkRBViB0ZXN0IGZhaWxlZFwiKSwgZXJyb3IpO1xyXG4gICAgICBuZXcgTm90aWNlKG1lc3NhZ2UsIDgwMDApO1xyXG4gICAgICBpZiAoc2hvd01vZGFsKSB7XHJcbiAgICAgICAgbmV3IFJlc3VsdE1vZGFsKHRoaXMuYXBwLCB0aGlzLnQoXCJXZWJEQVYgXHU4RkRFXHU2M0E1XCIsIFwiV2ViREFWIENvbm5lY3Rpb25cIiksIG1lc3NhZ2UpLm9wZW4oKTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGRlc2NyaWJlRXJyb3IocHJlZml4OiBzdHJpbmcsIGVycm9yOiB1bmtub3duKSB7XHJcbiAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xyXG4gICAgcmV0dXJuIGAke3ByZWZpeH06ICR7bWVzc2FnZX1gO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyByZXF1ZXN0VXJsKG9wdGlvbnM6IHtcbiAgICB1cmw6IHN0cmluZztcbiAgICBtZXRob2Q6IHN0cmluZztcbiAgICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgICBib2R5PzogQXJyYXlCdWZmZXI7XG4gICAgZm9sbG93UmVkaXJlY3RzPzogYm9vbGVhbjtcbiAgICByZWRpcmVjdENvdW50PzogbnVtYmVyO1xuICB9KTogUHJvbWlzZTx7IHN0YXR1czogbnVtYmVyOyBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+OyBhcnJheUJ1ZmZlcjogQXJyYXlCdWZmZXIgfT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb2JzaWRpYW5SZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogb3B0aW9ucy51cmwsXG4gICAgICBtZXRob2Q6IG9wdGlvbnMubWV0aG9kLFxuICAgICAgaGVhZGVyczogb3B0aW9ucy5oZWFkZXJzLFxuICAgICAgYm9keTogb3B0aW9ucy5ib2R5LFxuICAgICAgdGhyb3c6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogcmVzcG9uc2Uuc3RhdHVzLFxuICAgICAgaGVhZGVyczogcmVzcG9uc2UuaGVhZGVycyxcbiAgICAgIGFycmF5QnVmZmVyOiByZXNwb25zZS5hcnJheUJ1ZmZlcixcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBlbmNvZGVVdGY4KHZhbHVlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBieXRlcyA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSh2YWx1ZSk7XG4gICAgcmV0dXJuIGJ5dGVzLmJ1ZmZlci5zbGljZShieXRlcy5ieXRlT2Zmc2V0LCBieXRlcy5ieXRlT2Zmc2V0ICsgYnl0ZXMuYnl0ZUxlbmd0aCkgYXMgQXJyYXlCdWZmZXI7XG4gIH1cblxuICBwcml2YXRlIGRlY29kZVV0ZjgoYnVmZmVyOiBBcnJheUJ1ZmZlcikge1xuICAgIHJldHVybiBuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoYnVmZmVyKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY29tcHV0ZVNoYTI1NkhleChidWZmZXI6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgZGlnZXN0ID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3QoXCJTSEEtMjU2XCIsIGJ1ZmZlcik7XG4gICAgcmV0dXJuIEFycmF5LmZyb20obmV3IFVpbnQ4QXJyYXkoZGlnZXN0KSlcbiAgICAgIC5tYXAoKHZhbHVlKSA9PiB2YWx1ZS50b1N0cmluZygxNikucGFkU3RhcnQoMiwgXCIwXCIpKVxuICAgICAgLmpvaW4oXCJcIik7XG4gIH1cbn1cblxyXG5jbGFzcyBTZWN1cmVXZWJkYXZSZW5kZXJDaGlsZCBleHRlbmRzIE1hcmtkb3duUmVuZGVyQ2hpbGQge1xuICBvbnVubG9hZCgpOiB2b2lkIHt9XG59XG5cbnR5cGUgVXBsb2FkUmV3cml0ZSA9IHtcbiAgb3JpZ2luYWw6IHN0cmluZztcbiAgcmV3cml0dGVuOiBzdHJpbmc7XG4gIHNvdXJjZUZpbGU/OiBURmlsZTtcbn07XG5cclxuY2xhc3MgU2VjdXJlV2ViZGF2U2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xyXG4gIHBsdWdpbjogU2VjdXJlV2ViZGF2SW1hZ2VzUGx1Z2luO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBTZWN1cmVXZWJkYXZJbWFnZXNQbHVnaW4pIHtcclxuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gIH1cclxuXHJcbiAgZGlzcGxheSgpOiB2b2lkIHtcclxuICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XHJcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xyXG5cclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIlNlY3VyZSBXZWJEQVYgSW1hZ2VzXCIgfSk7XG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJwXCIsIHtcbiAgICAgIHRleHQ6IHRoaXMucGx1Z2luLnQoXG4gICAgICAgIFwiXHU4RkQ5XHU0RTJBXHU2M0QyXHU0RUY2XHU1M0VBXHU2MjhBXHU1NkZFXHU3MjQ3XHU1MjY1XHU3OUJCXHU1MjMwXHU1MzU1XHU3MkVDXHU3Njg0XHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHVGRjBDXHU1RTc2XHU0RkREXHU1QjU4XHU0RTNBIHNlY3VyZS13ZWJkYXYgXHU4MUVBXHU1QjlBXHU0RTQ5XHU0RUUzXHU3ODAxXHU1NzU3XHVGRjFCXHU1MTc2XHU0RUQ2XHU3QjE0XHU4QkIwXHU1NDhDXHU5NjQ0XHU0RUY2XHU2MzA5XHU1MzlGXHU4REVGXHU1Rjg0XHU1MzlGXHU2ODM3XHU1NDBDXHU2QjY1XHUzMDAyXCIsXG4gICAgICAgIFwiVGhpcyBwbHVnaW4gc2VwYXJhdGVzIG9ubHkgaW1hZ2VzIGludG8gYSBkZWRpY2F0ZWQgcmVtb3RlIGZvbGRlciBhbmQgc3RvcmVzIHRoZW0gYXMgc2VjdXJlLXdlYmRhdiBjdXN0b20gY29kZSBibG9ja3MuIE5vdGVzIGFuZCBvdGhlciBhdHRhY2htZW50cyBhcmUgc3luY2VkIGFzLWlzIHdpdGggdGhlaXIgb3JpZ2luYWwgcGF0aHMuXCIsXG4gICAgICApLFxuICAgIH0pO1xuXHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy5wbHVnaW4udChcIlx1NzU0Q1x1OTc2Mlx1OEJFRFx1OEEwMFwiLCBcIkludGVyZmFjZSBsYW5ndWFnZVwiKSB9KTtcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdThCRURcdThBMDBcIiwgXCJMYW5ndWFnZVwiKSlcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdThCQkVcdTdGNkVcdTk4NzVcdTY1MkZcdTYzMDFcdTgxRUFcdTUyQThcdTMwMDFcdTRFMkRcdTY1ODdcdTMwMDFcdTgyRjFcdTY1ODdcdTUyMDdcdTYzNjJcdTMwMDJcIiwgXCJTd2l0Y2ggdGhlIHNldHRpbmdzIFVJIGJldHdlZW4gYXV0bywgQ2hpbmVzZSwgYW5kIEVuZ2xpc2guXCIpKVxyXG4gICAgICAuYWRkRHJvcGRvd24oKGRyb3Bkb3duKSA9PlxyXG4gICAgICAgIGRyb3Bkb3duXHJcbiAgICAgICAgICAuYWRkT3B0aW9uKFwiYXV0b1wiLCB0aGlzLnBsdWdpbi50KFwiXHU4MUVBXHU1MkE4XCIsIFwiQXV0b1wiKSlcbiAgICAgICAgICAuYWRkT3B0aW9uKFwiemhcIiwgXCJcdTRFMkRcdTY1ODdcIilcbiAgICAgICAgICAuYWRkT3B0aW9uKFwiZW5cIiwgXCJFbmdsaXNoXCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxhbmd1YWdlKVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubGFuZ3VhZ2UgPSB2YWx1ZSBhcyBcImF1dG9cIiB8IFwiemhcIiB8IFwiZW5cIjtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICAgICAgfSksXG4gICAgICApO1xyXG5cclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiB0aGlzLnBsdWdpbi50KFwiXHU4RkRFXHU2M0E1XHU4QkJFXHU3RjZFXCIsIFwiQ29ubmVjdGlvblwiKSB9KTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJXZWJEQVYgXHU1N0ZBXHU3ODQwXHU1NzMwXHU1NzQwXCIsIFwiV2ViREFWIGJhc2UgVVJMXCIpKVxuICAgICAgLnNldERlc2ModGhpcy5wbHVnaW4udChcIlx1NjcwRFx1NTJBMVx1NTY2OFx1NTdGQVx1Nzg0MFx1NTczMFx1NTc0MFx1RkYwQ1x1NEY4Qlx1NTk4Mlx1RkYxQWh0dHA6Ly95b3VyLXdlYmRhdi1ob3N0OnBvcnRcIiwgXCJCYXNlIHNlcnZlciBVUkwuIEV4YW1wbGU6IGh0dHA6Ly95b3VyLXdlYmRhdi1ob3N0OnBvcnRcIikpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImh0dHA6Ly95b3VyLXdlYmRhdi1ob3N0OnBvcnRcIilcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mud2ViZGF2VXJsKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLndlYmRhdlVybCA9IHZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pLFxuICAgICAgKTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1OEQyNlx1NTNGN1wiLCBcIlVzZXJuYW1lXCIpKVxyXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cclxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZXJuYW1lKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZXJuYW1lID0gdmFsdWUudHJpbSgpO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgfSksXHJcbiAgICAgICk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTVCQzZcdTc4MDFcIiwgXCJQYXNzd29yZFwiKSlcclxuICAgICAgLnNldERlc2ModGhpcy5wbHVnaW4udChcIlx1OUVEOFx1OEJBNFx1OTY5MFx1ODVDRlx1RkYwQ1x1NTNFRlx1NzBCOVx1NTFGQlx1NTNGM1x1NEZBN1x1NjMwOVx1OTRBRVx1NjYzRVx1NzkzQVx1NjIxNlx1OTY5MFx1ODVDRlx1MzAwMlwiLCBcIkhpZGRlbiBieSBkZWZhdWx0LiBVc2UgdGhlIGJ1dHRvbiBvbiB0aGUgcmlnaHQgdG8gc2hvdyBvciBoaWRlIGl0LlwiKSlcclxuICAgICAgLmFkZFRleHQoKHRleHQpID0+IHtcclxuICAgICAgICB0ZXh0LmlucHV0RWwudHlwZSA9IFwicGFzc3dvcmRcIjtcclxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnBhc3N3b3JkKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnBhc3N3b3JkID0gdmFsdWU7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSlcclxuICAgICAgLmFkZEV4dHJhQnV0dG9uKChidXR0b24pID0+IHtcclxuICAgICAgICBsZXQgdmlzaWJsZSA9IGZhbHNlO1xyXG4gICAgICAgIGJ1dHRvbi5zZXRJY29uKFwiZXllXCIpO1xyXG4gICAgICAgIGJ1dHRvbi5zZXRUb29sdGlwKHRoaXMucGx1Z2luLnQoXCJcdTY2M0VcdTc5M0FcdTVCQzZcdTc4MDFcIiwgXCJTaG93IHBhc3N3b3JkXCIpKTtcclxuICAgICAgICBidXR0b24ub25DbGljaygoKSA9PiB7XHJcbiAgICAgICAgICBjb25zdCBpbnB1dCA9IGJ1dHRvbi5leHRyYVNldHRpbmdzRWwucGFyZW50RWxlbWVudD8ucXVlcnlTZWxlY3RvcihcImlucHV0XCIpO1xyXG4gICAgICAgICAgaWYgKCEoaW5wdXQgaW5zdGFuY2VvZiBIVE1MSW5wdXRFbGVtZW50KSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgdmlzaWJsZSA9ICF2aXNpYmxlO1xyXG4gICAgICAgICAgaW5wdXQudHlwZSA9IHZpc2libGUgPyBcInRleHRcIiA6IFwicGFzc3dvcmRcIjtcclxuICAgICAgICAgIGJ1dHRvbi5zZXRJY29uKHZpc2libGUgPyBcImV5ZS1vZmZcIiA6IFwiZXllXCIpO1xyXG4gICAgICAgICAgYnV0dG9uLnNldFRvb2x0aXAodGhpcy5wbHVnaW4udCh2aXNpYmxlID8gXCJcdTk2OTBcdTg1Q0ZcdTVCQzZcdTc4MDFcIiA6IFwiXHU2NjNFXHU3OTNBXHU1QkM2XHU3ODAxXCIsIHZpc2libGUgPyBcIkhpZGUgcGFzc3dvcmRcIiA6IFwiU2hvdyBwYXNzd29yZFwiKSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NTZGRVx1NzI0N1x1OEZEQ1x1N0EwQlx1NzZFRVx1NUY1NVwiLCBcIkltYWdlIHJlbW90ZSBmb2xkZXJcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1NEUxM1x1OTVFOFx1NzUyOFx1NEU4RVx1NUI1OFx1NjUzRVx1OEZEQ1x1N0EwQlx1NTZGRVx1NzI0N1x1NzY4NCBXZWJEQVYgXHU3NkVFXHU1RjU1XHVGRjBDXHU0RjhCXHU1OTgyXHVGRjFBL3JlbW90ZS1pbWFnZXMvXHUzMDAyXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU2MjEwXHU1MjlGXHU1NDBFXHU0RjFBXHU3QUNCXHU1MzczXHU1MjIwXHU5NjY0XHU2NzJDXHU1NzMwXHU1NkZFXHU3MjQ3XHU2NTg3XHU0RUY2XHUzMDAyXCIsXG4gICAgICAgICAgXCJEZWRpY2F0ZWQgV2ViREFWIGZvbGRlciBmb3IgcmVtb3RlIGltYWdlcywgZm9yIGV4YW1wbGU6IC9yZW1vdGUtaW1hZ2VzLy4gTG9jYWwgaW1hZ2UgZmlsZXMgYXJlIGRlbGV0ZWQgaW1tZWRpYXRlbHkgYWZ0ZXIgdXBsb2FkIHN1Y2NlZWRzLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucmVtb3RlRm9sZGVyKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZW1vdGVGb2xkZXIgPSBub3JtYWxpemVQYXRoKHZhbHVlLnRyaW0oKSB8fCBcIi9yZW1vdGUtaW1hZ2VzL1wiKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSksXG4gICAgICApO1xuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NkQ0Qlx1OEJENVx1OEZERVx1NjNBNVwiLCBcIlRlc3QgY29ubmVjdGlvblwiKSlcclxuICAgICAgLnNldERlc2ModGhpcy5wbHVnaW4udChcIlx1NEY3Rlx1NzUyOFx1NEUzNFx1NjVGNlx1NjNBMlx1OTQ4OFx1NjU4N1x1NEVGNlx1OUE4Q1x1OEJDMSBQVVRcdTMwMDFHRVRcdTMwMDFERUxFVEUgXHU2NjJGXHU1NDI2XHU2QjYzXHU1RTM4XHUzMDAyXCIsIFwiVmVyaWZ5IFBVVCwgR0VULCBhbmQgREVMRVRFIHVzaW5nIGEgdGVtcG9yYXJ5IHByb2JlIGZpbGUuXCIpKVxyXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+XHJcbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodGhpcy5wbHVnaW4udChcIlx1NUYwMFx1NTlDQlx1NkQ0Qlx1OEJENVwiLCBcIlJ1biB0ZXN0XCIpKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZCh0cnVlKTtcclxuICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnJ1bkNvbm5lY3Rpb25UZXN0KHRydWUpO1xyXG4gICAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKGZhbHNlKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KSxcclxuICAgICAgKTtcclxuXHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy5wbHVnaW4udChcIlx1NTQwQ1x1NkI2NVx1OEJCRVx1N0Y2RVwiLCBcIlN5bmNcIikgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdThGRENcdTdBMEJcdTdCMTRcdThCQjBcdTc2RUVcdTVGNTVcIiwgXCJSZW1vdGUgbm90ZXMgZm9sZGVyXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTc1MjhcdTRFOEVcdTVCNThcdTY1M0VcdTdCMTRcdThCQjBcdTU0OENcdTUxNzZcdTRFRDZcdTk3NUVcdTU2RkVcdTcyNDdcdTk2NDRcdTRFRjZcdTUzOUZcdTY4MzdcdTU0MENcdTZCNjVcdTUyNkZcdTY3MkNcdTc2ODRcdThGRENcdTdBRUZcdTc2RUVcdTVGNTVcdUZGMENcdTRGOEJcdTU5ODJcdUZGMUEvdmF1bHQtc3luYy9cdTMwMDJcdTYzRDJcdTRFRjZcdTRGMUFcdTgxRUFcdTUyQThcdTU0MENcdTZCNjVcdTY1NzRcdTRFMkEgdmF1bHRcdUZGMENcdTVFNzZcdThERjNcdThGQzcgLm9ic2lkaWFuXHUzMDAxXHU2M0QyXHU0RUY2XHU3NkVFXHU1RjU1XHU1NDhDXHU1NkZFXHU3MjQ3XHU2NTg3XHU0RUY2XHUzMDAyXCIsXG4gICAgICAgICAgXCJSZW1vdGUgZm9sZGVyIHVzZWQgZm9yIG5vdGVzIGFuZCBvdGhlciBub24taW1hZ2UgYXR0YWNobWVudHMgc3luY2VkIGFzLWlzLCBmb3IgZXhhbXBsZTogL3ZhdWx0LXN5bmMvLiBUaGUgcGx1Z2luIHN5bmNzIHRoZSB3aG9sZSB2YXVsdCBhbmQgYXV0b21hdGljYWxseSBza2lwcyAub2JzaWRpYW4sIHRoZSBwbHVnaW4gZGlyZWN0b3J5LCBhbmQgaW1hZ2UgZmlsZXMuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnZhdWx0U3luY1JlbW90ZUZvbGRlciA9IG5vcm1hbGl6ZVBhdGgodmFsdWUudHJpbSgpIHx8IFwiL3ZhdWx0LXN5bmMvXCIpO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTgxRUFcdTUyQThcdTU0MENcdTZCNjVcdTk4OTFcdTczODdcIiwgXCJBdXRvIHN5bmMgZnJlcXVlbmN5XCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTRFRTVcdTUyMDZcdTk0OUZcdTRFM0FcdTUzNTVcdTRGNERcdThCQkVcdTdGNkVcdTgxRUFcdTUyQThcdTU0MENcdTZCNjVcdTY1RjZcdTk1RjRcdTMwMDJcdTU4NkIgMCBcdTg4NjhcdTc5M0FcdTUxNzNcdTk1RURcdTgxRUFcdTUyQThcdTU0MENcdTZCNjVcdTMwMDJcdThGRDlcdTkxQ0NcdTc2ODRcdTU0MENcdTZCNjVcdTY2MkZcdTIwMUNcdTVCRjlcdThEMjZcdTU0MENcdTZCNjVcdTIwMURcdUZGMUFcdTRGMUFcdTY4QzBcdTY3RTVcdTY3MkNcdTU3MzBcdTRFMEVcdThGRENcdTdBRUZcdTc2RUVcdTVGNTVcdTVERUVcdTVGMDJcdUZGMENcdTg4NjVcdTRGMjBcdTY1QjBcdTU4OUVcdTU0OENcdTUzRDhcdTY2RjRcdTY1ODdcdTRFRjZcdUZGMENcdTVFNzZcdTUyMjBcdTk2NjRcdThGRENcdTdBRUZcdTU5MUFcdTRGNTlcdTUxODVcdTVCQjlcdTMwMDJcIixcbiAgICAgICAgICBcIlNldCB0aGUgYXV0b21hdGljIHN5bmMgaW50ZXJ2YWwgaW4gbWludXRlcy4gVXNlIDAgdG8gdHVybiBpdCBvZmYuIFRoaXMgaXMgYSByZWNvbmNpbGlhdGlvbiBzeW5jOiBpdCBjaGVja3MgbG9jYWwgYW5kIHJlbW90ZSBkaWZmZXJlbmNlcywgdXBsb2FkcyBuZXcgb3IgY2hhbmdlZCBmaWxlcywgYW5kIHJlbW92ZXMgZXh0cmEgcmVtb3RlIGNvbnRlbnQuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcIjBcIilcbiAgICAgICAgICAuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzKSlcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXJzZWQgPSBOdW1iZXIucGFyc2VJbnQodmFsdWUsIDEwKTtcbiAgICAgICAgICAgIGlmICghTnVtYmVyLmlzTmFOKHBhcnNlZCkpIHtcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXMgPSBNYXRoLm1heCgwLCBwYXJzZWQpO1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTdCMTRcdThCQjBcdTY3MkNcdTU3MzBcdTRGRERcdTc1NTlcdTZBMjFcdTVGMEZcIiwgXCJOb3RlIGxvY2FsIHJldGVudGlvbiBtb2RlXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTVCOENcdTY1NzRcdTY3MkNcdTU3MzBcdUZGMUFcdTdCMTRcdThCQjBcdTU5Q0JcdTdFQzhcdTRGRERcdTc1NTlcdTU3MjhcdTY3MkNcdTU3MzBcdTMwMDJcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTdCMTRcdThCQjBcdUZGMUFcdTk1N0ZcdTY3MUZcdTY3MkFcdThCQkZcdTk1RUVcdTc2ODQgTWFya2Rvd24gXHU3QjE0XHU4QkIwXHU0RjFBXHU4OEFCXHU2NkZGXHU2MzYyXHU0RTNBXHU2NzJDXHU1NzMwXHU1MzYwXHU0RjREXHU2NTg3XHU0RUY2XHVGRjBDXHU2MjUzXHU1RjAwXHU2NUY2XHU1MThEXHU0RUNFXHU4RkRDXHU3QUVGXHU2MDYyXHU1OTBEXHUzMDAyXCIsXG4gICAgICAgICAgXCJGdWxsIGxvY2FsOiBub3RlcyBhbHdheXMgc3RheSBsb2NhbC4gTGF6eSBub3Rlczogc3RhbGUgTWFya2Rvd24gbm90ZXMgYXJlIHJlcGxhY2VkIHdpdGggbG9jYWwgcGxhY2Vob2xkZXIgZmlsZXMgYW5kIHJlc3RvcmVkIGZyb20gcmVtb3RlIHdoZW4gb3BlbmVkLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZERyb3Bkb3duKChkcm9wZG93bikgPT5cbiAgICAgICAgZHJvcGRvd25cbiAgICAgICAgICAuYWRkT3B0aW9uKFwiZnVsbC1sb2NhbFwiLCB0aGlzLnBsdWdpbi50KFwiXHU1QjhDXHU2NTc0XHU2NzJDXHU1NzMwXCIsIFwiRnVsbCBsb2NhbFwiKSlcbiAgICAgICAgICAuYWRkT3B0aW9uKFwibGF6eS1ub3Rlc1wiLCB0aGlzLnBsdWdpbi50KFwiXHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXCIsIFwiTGF6eSBub3Rlc1wiKSlcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mubm90ZVN0b3JhZ2VNb2RlKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVTdG9yYWdlTW9kZSA9IHZhbHVlIGFzIFwiZnVsbC1sb2NhbFwiIHwgXCJsYXp5LW5vdGVzXCI7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTdCMTRcdThCQjBcdTY3MkNcdTU3MzBcdTU2REVcdTY1MzZcdTU5MjlcdTY1NzBcIiwgXCJOb3RlIGV2aWN0aW9uIGRheXNcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1NEVDNVx1NTcyOFx1MjAxQ1x1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFx1MjAxRFx1NkEyMVx1NUYwRlx1NEUwQlx1NzUxRlx1NjU0OFx1MzAwMlx1OEQ4NVx1OEZDN1x1OEZEOVx1NEUyQVx1NTkyOVx1NjU3MFx1NjcyQVx1NjI1M1x1NUYwMFx1NzY4NCBNYXJrZG93biBcdTdCMTRcdThCQjBcdUZGMENcdTRGMUFcdTU3MjhcdTU0MENcdTZCNjVcdTU0MEVcdTg4QUJcdTY2RkZcdTYzNjJcdTRFM0FcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTY1ODdcdTRFRjZcdTMwMDJcIixcbiAgICAgICAgICBcIlVzZWQgb25seSBpbiBsYXp5IG5vdGUgbW9kZS4gTWFya2Rvd24gbm90ZXMgbm90IG9wZW5lZCB3aXRoaW4gdGhpcyBudW1iZXIgb2YgZGF5cyBhcmUgcmVwbGFjZWQgd2l0aCBsb2NhbCBwbGFjZWhvbGRlciBmaWxlcyBhZnRlciBzeW5jLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCIzMFwiKVxuICAgICAgICAgIC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4uc2V0dGluZ3Mubm90ZUV2aWN0QWZ0ZXJEYXlzKSlcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXJzZWQgPSBOdW1iZXIucGFyc2VJbnQodmFsdWUsIDEwKTtcbiAgICAgICAgICAgIGlmICghTnVtYmVyLmlzTmFOKHBhcnNlZCkpIHtcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Mubm90ZUV2aWN0QWZ0ZXJEYXlzID0gTWF0aC5tYXgoMSwgcGFyc2VkKTtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU1NDBDXHU2QjY1XHU3MkI2XHU2MDAxXCIsIFwiU3luYyBzdGF0dXNcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBgJHt0aGlzLnBsdWdpbi5mb3JtYXRMYXN0U3luY0xhYmVsKCl9XFxuJHt0aGlzLnBsdWdpbi5mb3JtYXRTeW5jU3RhdHVzTGFiZWwoKX1cXG4ke3RoaXMucGx1Z2luLnQoXCJcdThCRjRcdTY2MEVcdUZGMUFcdTdBQ0JcdTUzNzNcdTU0MENcdTZCNjVcdTRGMUFcdTYyNjdcdTg4NENcdTY3MkNcdTU3MzBcdTRFMEVcdThGRENcdTdBRUZcdTc2ODRcdTVCRjlcdThEMjZcdUZGMENcdTU0MENcdTZCNjVcdTdCMTRcdThCQjBcdTRFMEVcdTk3NUVcdTU2RkVcdTcyNDdcdTk2NDRcdTRFRjZcdUZGMENcdTVFNzZcdTZFMDVcdTc0MDZcdThGRENcdTdBRUZcdTUxOTdcdTRGNTlcdTY1ODdcdTRFRjZcdTMwMDJcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTRFQ0RcdTc1MzFcdTcyRUNcdTdBQ0JcdTk2MUZcdTUyMTdcdTU5MDRcdTc0MDZcdTMwMDJcIiwgXCJOb3RlOiBTeW5jIG5vdyByZWNvbmNpbGVzIGxvY2FsIGFuZCByZW1vdGUgY29udGVudCwgc3luY3Mgbm90ZXMgYW5kIG5vbi1pbWFnZSBhdHRhY2htZW50cywgYW5kIGNsZWFucyBleHRyYSByZW1vdGUgZmlsZXMuIEltYWdlIHVwbG9hZHMgY29udGludWUgdG8gYmUgaGFuZGxlZCBieSB0aGUgc2VwYXJhdGUgcXVldWUuXCIpfWAsXG4gICAgICAgICAgYCR7dGhpcy5wbHVnaW4uZm9ybWF0TGFzdFN5bmNMYWJlbCgpfVxcbiR7dGhpcy5wbHVnaW4uZm9ybWF0U3luY1N0YXR1c0xhYmVsKCl9XFxuJHt0aGlzLnBsdWdpbi50KFwiXHU4QkY0XHU2NjBFXHVGRjFBXHU3QUNCXHU1MzczXHU1NDBDXHU2QjY1XHU0RjFBXHU2MjY3XHU4ODRDXHU2NzJDXHU1NzMwXHU0RTBFXHU4RkRDXHU3QUVGXHU3Njg0XHU1QkY5XHU4RDI2XHVGRjBDXHU1NDBDXHU2QjY1XHU3QjE0XHU4QkIwXHU0RTBFXHU5NzVFXHU1NkZFXHU3MjQ3XHU5NjQ0XHU0RUY2XHVGRjBDXHU1RTc2XHU2RTA1XHU3NDA2XHU4RkRDXHU3QUVGXHU1MTk3XHU0RjU5XHU2NTg3XHU0RUY2XHUzMDAyXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU0RUNEXHU3NTMxXHU3MkVDXHU3QUNCXHU5NjFGXHU1MjE3XHU1OTA0XHU3NDA2XHUzMDAyXCIsIFwiTm90ZTogU3luYyBub3cgcmVjb25jaWxlcyBsb2NhbCBhbmQgcmVtb3RlIGNvbnRlbnQsIHN5bmNzIG5vdGVzIGFuZCBub24taW1hZ2UgYXR0YWNobWVudHMsIGFuZCBjbGVhbnMgZXh0cmEgcmVtb3RlIGZpbGVzLiBJbWFnZSB1cGxvYWRzIGNvbnRpbnVlIHRvIGJlIGhhbmRsZWQgYnkgdGhlIHNlcGFyYXRlIHF1ZXVlLlwiKX1gLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dCh0aGlzLnBsdWdpbi50KFwiXHU3QUNCXHU1MzczXHU1NDBDXHU2QjY1XCIsIFwiU3luYyBub3dcIikpLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZCh0cnVlKTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQodHJ1ZSk7XG4gICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcbiAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKGZhbHNlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiB0aGlzLnBsdWdpbi50KFwiXHU0RTAwXHU2QjIxXHU2MDI3XHU1REU1XHU1MTc3XCIsIFwiT25lLXRpbWUgdG9vbHNcIikgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdThGQzFcdTc5RkJcdTY1NzRcdTVFOTNcdTUzOUZcdTc1MUZcdTU2RkVcdTcyNDdcdTVGMTVcdTc1MjhcIiwgXCJNaWdyYXRlIG5hdGl2ZSBpbWFnZSBlbWJlZHMgaW4gdmF1bHRcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1NjI2Qlx1NjNDRlx1NjU3NFx1NUU5M1x1NjI0MFx1NjcwOSBNYXJrZG93biBcdTdCMTRcdThCQjBcdUZGMENcdTYyOEEgT2JzaWRpYW4gXHU1MzlGXHU3NTFGXHU2NzJDXHU1NzMwXHU1NkZFXHU3MjQ3XHU1RjE1XHU3NTI4XHVGRjA4XHU1OTgyICFbXSgpIFx1NTQ4QyAhW1suLi5dXVx1RkYwOVx1NEUwQVx1NEYyMFx1NTIzMFx1OEZEQ1x1N0FFRlx1NTZGRVx1NzI0N1x1NzZFRVx1NUY1NVx1RkYwQ1x1NUU3Nlx1NjUzOVx1NTE5OVx1NEUzQSBzZWN1cmUtd2ViZGF2IFx1NEVFM1x1NzgwMVx1NTc1N1x1MzAwMlx1NjVFN1x1NzI0OCBzcGFuIFx1NTQ4Q1x1NjVFOVx1NjcxRiB3ZWJkYXYtc2VjdXJlIFx1OTRGRVx1NjNBNVx1NEU1Rlx1NEYxQVx1NEUwMFx1NUU3Nlx1NjUzNlx1NjU1Qlx1NTIzMFx1NjVCMFx1NjgzQ1x1NUYwRlx1MzAwMlwiLFxuICAgICAgICAgIFwiU2NhbiBhbGwgTWFya2Rvd24gbm90ZXMgaW4gdGhlIHZhdWx0LCB1cGxvYWQgbmF0aXZlIGxvY2FsIGltYWdlIGVtYmVkcyAoc3VjaCBhcyAhW10oKSBhbmQgIVtbLi4uXV0pIHRvIHRoZSByZW1vdGUgaW1hZ2UgZm9sZGVyLCBhbmQgcmV3cml0ZSB0aGVtIGFzIHNlY3VyZS13ZWJkYXYgY29kZSBibG9ja3MuIExlZ2FjeSBzcGFuIHRhZ3MgYW5kIGVhcmx5IHdlYmRhdi1zZWN1cmUgbGlua3MgYXJlIGFsc28gbm9ybWFsaXplZCB0byB0aGUgbmV3IGZvcm1hdC5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodGhpcy5wbHVnaW4udChcIlx1NUYwMFx1NTlDQlx1OEZDMVx1NzlGQlwiLCBcIlJ1biBtaWdyYXRpb25cIikpLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZCh0cnVlKTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ubWlncmF0ZUFsbExlZ2FjeVNlY3VyZUltYWdlcygpO1xuICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQoZmFsc2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSksXG4gICAgICApO1xuICB9XG59XG5cclxuY2xhc3MgUmVzdWx0TW9kYWwgZXh0ZW5kcyBNb2RhbCB7XHJcbiAgcHJpdmF0ZSByZWFkb25seSB0aXRsZVRleHQ6IHN0cmluZztcclxuICBwcml2YXRlIHJlYWRvbmx5IGJvZHlUZXh0OiBzdHJpbmc7XHJcblxyXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCB0aXRsZVRleHQ6IHN0cmluZywgYm9keVRleHQ6IHN0cmluZykge1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIHRoaXMudGl0bGVUZXh0ID0gdGl0bGVUZXh0O1xyXG4gICAgdGhpcy5ib2R5VGV4dCA9IGJvZHlUZXh0O1xyXG4gIH1cclxuXHJcbiAgb25PcGVuKCk6IHZvaWQge1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb250ZW50RWwuZW1wdHkoKTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy50aXRsZVRleHQgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogdGhpcy5ib2R5VGV4dCB9KTtcclxuICB9XHJcblxyXG4gIG9uQ2xvc2UoKTogdm9pZCB7XHJcbiAgICB0aGlzLmNvbnRlbnRFbC5lbXB0eSgpO1xyXG4gIH1cclxufVxyXG5cclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUMsc0JBZ0JNO0FBaUVQLElBQU0sbUJBQXlDO0FBQUEsRUFDN0MsV0FBVztBQUFBLEVBQ1gsVUFBVTtBQUFBLEVBQ1YsVUFBVTtBQUFBLEVBQ1YsY0FBYztBQUFBLEVBQ2QsdUJBQXVCO0FBQUEsRUFDdkIsZ0JBQWdCO0FBQUEsRUFDaEIsd0JBQXdCO0FBQUEsRUFDeEIsVUFBVTtBQUFBLEVBQ1YsaUJBQWlCO0FBQUEsRUFDakIsb0JBQW9CO0FBQUEsRUFDcEIseUJBQXlCO0FBQUEsRUFDekIsa0JBQWtCO0FBQUEsRUFDbEIsbUJBQW1CO0FBQUEsRUFDbkIsOEJBQThCO0FBQUEsRUFDOUIsZ0JBQWdCO0FBQUEsRUFDaEIscUJBQXFCO0FBQUEsRUFDckIsbUJBQW1CO0FBQUEsRUFDbkIsYUFBYTtBQUNmO0FBRUEsSUFBTSxrQkFBa0I7QUFDeEIsSUFBTSxvQkFBb0I7QUFDMUIsSUFBTSxtQkFBbUI7QUFFekIsSUFBcUIsMkJBQXJCLGNBQXNELHVCQUFPO0FBQUEsRUFBN0Q7QUFBQTtBQUNFLG9CQUFpQztBQUNqQyxpQkFBc0IsQ0FBQztBQUN2QixTQUFRLFdBQVcsb0JBQUksSUFBWTtBQUNuQyxTQUFRLG9CQUFvQixvQkFBSSxJQUFZO0FBQzVDLFNBQVEsZ0JBQWdCLG9CQUFJLElBQW9CO0FBQ2hELFNBQVEsaUJBQWlCLG9CQUFJLElBQXlCO0FBQ3RELFNBQVEsd0JBQXdCLG9CQUFJLElBQVk7QUFDaEQsU0FBUSx1QkFBdUIsb0JBQUksSUFBb0I7QUFDdkQsU0FBUSxZQUFZLG9CQUFJLElB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TyxvQkFBb0IsQ0FBQztBQUFBLEVBQUssS0FBSyxPQUFPLHNCQUFzQixDQUFDO0FBQUEsRUFBSyxLQUFLLE9BQU8sRUFBRSxrVUFBeUQsdUxBQXVMLENBQUM7QUFBQSxRQUNoVixHQUFHLEtBQUssT0FBTyxvQkFBb0IsQ0FBQztBQUFBLEVBQUssS0FBSyxPQUFPLHNCQUFzQixDQUFDO0FBQUEsRUFBSyxLQUFLLE9BQU8sRUFBRSxrVUFBeUQsdUxBQXVMLENBQUM7QUFBQSxNQUNsVjtBQUFBLElBQ0YsRUFDQztBQUFBLE1BQVUsQ0FBQyxXQUNWLE9BQU8sY0FBYyxLQUFLLE9BQU8sRUFBRSw0QkFBUSxVQUFVLENBQUMsRUFBRSxRQUFRLFlBQVk7QUFDMUUsZUFBTyxZQUFZLElBQUk7QUFDdkIsWUFBSTtBQUNGLGdCQUFNLEtBQUssT0FBTywyQkFBMkIsSUFBSTtBQUNqRCxlQUFLLFFBQVE7QUFBQSxRQUNmLFVBQUU7QUFDQSxpQkFBTyxZQUFZLEtBQUs7QUFBQSxRQUMxQjtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0g7QUFFRixnQkFBWSxTQUFTLE1BQU0sRUFBRSxNQUFNLEtBQUssT0FBTyxFQUFFLGtDQUFTLGdCQUFnQixFQUFFLENBQUM7QUFFN0UsUUFBSSx3QkFBUSxXQUFXLEVBQ3BCLFFBQVEsS0FBSyxPQUFPLEVBQUUsZ0VBQWMsc0NBQXNDLENBQUMsRUFDM0U7QUFBQSxNQUNDLEtBQUssT0FBTztBQUFBLFFBQ1Y7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0YsRUFDQztBQUFBLE1BQVUsQ0FBQyxXQUNWLE9BQU8sY0FBYyxLQUFLLE9BQU8sRUFBRSw0QkFBUSxlQUFlLENBQUMsRUFBRSxRQUFRLFlBQVk7QUFDL0UsZUFBTyxZQUFZLElBQUk7QUFDdkIsWUFBSTtBQUNGLGdCQUFNLEtBQUssT0FBTyw2QkFBNkI7QUFBQSxRQUNqRCxVQUFFO0FBQ0EsaUJBQU8sWUFBWSxLQUFLO0FBQUEsUUFDMUI7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDSjtBQUNGO0FBRUEsSUFBTSxjQUFOLGNBQTBCLHNCQUFNO0FBQUEsRUFJOUIsWUFBWSxLQUFVLFdBQW1CLFVBQWtCO0FBQ3pELFVBQU0sR0FBRztBQUNULFNBQUssWUFBWTtBQUNqQixTQUFLLFdBQVc7QUFBQSxFQUNsQjtBQUFBLEVBRUEsU0FBZTtBQUNiLFVBQU0sRUFBRSxVQUFVLElBQUk7QUFDdEIsY0FBVSxNQUFNO0FBQ2hCLGNBQVUsU0FBUyxNQUFNLEVBQUUsTUFBTSxLQUFLLFVBQVUsQ0FBQztBQUNqRCxjQUFVLFNBQVMsS0FBSyxFQUFFLE1BQU0sS0FBSyxTQUFTLENBQUM7QUFBQSxFQUNqRDtBQUFBLEVBRUEsVUFBZ0I7QUFDZCxTQUFLLFVBQVUsTUFBTTtBQUFBLEVBQ3ZCO0FBQ0Y7IiwKICAibmFtZXMiOiBbImRvY3VtZW50IiwgInRvbWJzdG9uZSIsICJ1cGxvYWRlZFJlbW90ZSIsICJvYnNpZGlhblJlcXVlc3RVcmwiXQp9Cg==
