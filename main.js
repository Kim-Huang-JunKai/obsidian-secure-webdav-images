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
    this.lastVaultSyncAt = 0;
    this.lastVaultSyncStatus = "";
    this.syncInProgress = false;
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
      return;
    }
    const candidate = loaded;
    if ("settings" in candidate || "queue" in candidate) {
      this.settings = { ...DEFAULT_SETTINGS, ...candidate.settings ?? {} };
      this.queue = Array.isArray(candidate.queue) ? candidate.queue : [];
      this.noteAccessTimestamps = new Map(
        Object.entries(candidate.noteAccessTimestamps ?? {})
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
    for (const remotePath of removed) {
      await this.deleteRemoteIfUnreferenced(remotePath);
    }
  }
  async handleVaultDelete(file) {
    if (!(file instanceof import_obsidian.TFile)) {
      return;
    }
    if (!this.shouldSkipContentSyncPath(file.path)) {
      await this.deleteRemoteSyncedEntry(file.path);
    }
    if (file.extension === "md") {
      const previousRefs = this.noteRemoteRefs.get(file.path) ?? /* @__PURE__ */ new Set();
      this.noteRemoteRefs.delete(file.path);
      for (const remotePath of previousRefs) {
        await this.deleteRemoteIfUnreferenced(remotePath);
      }
    }
  }
  async handleVaultRename(file, oldPath) {
    if (!(file instanceof import_obsidian.TFile)) {
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
          Authorization: this.buildAuthHeader()
        }
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
          await this.deleteRemoteContentFile(remote.remotePath);
          remoteFiles.delete(remote.remotePath);
          this.syncIndex.delete(path);
          deletedRemoteFiles += 1;
        }
      }
      let uploaded = 0;
      let skipped = 0;
      let missingRemoteBackedNotes = 0;
      files = this.collectVaultContentFiles();
      currentPaths = new Set(files.map((file) => file.path));
      for (const remote of [...remoteFiles.values()].sort((a, b) => a.remotePath.localeCompare(b.remotePath))) {
        const vaultPath = this.remotePathToVaultPath(remote.remotePath);
        if (!vaultPath || currentPaths.has(vaultPath)) {
          continue;
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
            if (!stubRemote) {
              await this.removeLocalVaultFile(file);
              this.syncIndex.delete(file.path);
              deletedLocalFiles += 1;
              deletedLocalStubs += 1;
              continue;
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
        if (!remote) {
          if (previous && this.shouldDeleteLocalWhenRemoteMissing(file, previous)) {
            await this.removeLocalVaultFile(file);
            this.syncIndex.delete(file.path);
            deletedLocalFiles += 1;
            continue;
          }
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
        `\u5DF2\u53CC\u5411\u540C\u6B65\uFF1A\u4E0A\u4F20 ${uploaded} \u4E2A\u6587\u4EF6\uFF0C\u4ECE\u8FDC\u7AEF\u62C9\u53D6 ${restoredFromRemote + downloadedOrUpdated} \u4E2A\u6587\u4EF6\uFF0C\u8DF3\u8FC7 ${skipped} \u4E2A\u672A\u53D8\u5316\u6587\u4EF6\uFF0C\u5220\u9664\u8FDC\u7AEF\u5185\u5BB9 ${deletedRemoteFiles} \u4E2A\u3001\u672C\u5730\u5185\u5BB9 ${deletedLocalFiles} \u4E2A${deletedLocalStubs > 0 ? `\uFF08\u5176\u4E2D\u5931\u6548\u5360\u4F4D\u7B14\u8BB0 ${deletedLocalStubs} \u7BC7\uFF09` : ""}\uFF0C\u6E05\u7406\u8FDC\u7AEF\u7A7A\u76EE\u5F55 ${deletedRemoteDirectories} \u4E2A\uFF0C\u6E05\u7406\u5197\u4F59\u56FE\u7247 ${imageCleanup.deletedFiles} \u5F20\u3001\u76EE\u5F55 ${imageCleanup.deletedDirectories} \u4E2A${evictedNotes > 0 ? `\uFF0C\u56DE\u6536\u672C\u5730\u65E7\u7B14\u8BB0 ${evictedNotes} \u7BC7` : ""}${missingRemoteBackedNotes > 0 ? `\uFF0C\u5E76\u53D1\u73B0 ${missingRemoteBackedNotes} \u7BC7\u6309\u9700\u7B14\u8BB0\u7F3A\u5C11\u8FDC\u7AEF\u6B63\u6587` : ""}\u3002`,
        `Bidirectional sync uploaded ${uploaded} file(s), pulled ${restoredFromRemote + downloadedOrUpdated} file(s) from remote, skipped ${skipped} unchanged file(s), deleted ${deletedRemoteFiles} remote content file(s) and ${deletedLocalFiles} local file(s)${deletedLocalStubs > 0 ? ` (including ${deletedLocalStubs} stale stub note(s))` : ""}, removed ${deletedRemoteDirectories} remote director${deletedRemoteDirectories === 1 ? "y" : "ies"}, cleaned ${imageCleanup.deletedFiles} orphaned remote image(s) plus ${imageCleanup.deletedDirectories} director${imageCleanup.deletedDirectories === 1 ? "y" : "ies"}${evictedNotes > 0 ? `, and evicted ${evictedNotes} stale local note(s)` : ""}${missingRemoteBackedNotes > 0 ? `, while detecting ${missingRemoteBackedNotes} lazy note(s) missing their remote content` : ""}.`
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
  parseSyncSignature(signature) {
    const [mtimeText, sizeText] = signature.split(":");
    const mtime = Number.parseInt(mtimeText ?? "", 10);
    const size = Number.parseInt(sizeText ?? "", 10);
    if (!Number.isFinite(mtime) || !Number.isFinite(size)) {
      return null;
    }
    return { mtime, size };
  }
  shouldDeleteLocalWhenRemoteMissing(file, previous) {
    if (!previous.remoteSignature) {
      return false;
    }
    const currentSignature = this.buildSyncSignature(file);
    if (previous.localSignature === currentSignature) {
      return true;
    }
    const previousLocal = this.parseSyncSignature(previous.localSignature);
    const graceMs = 5e3;
    if (previousLocal && file.stat.size === previousLocal.size) {
      const baseline = Math.max(previousLocal.mtime, this.lastVaultSyncAt || 0);
      if (file.stat.mtime <= baseline + graceMs) {
        return true;
      }
    }
    if (this.lastVaultSyncAt > 0 && file.stat.mtime <= this.lastVaultSyncAt + graceMs) {
      return true;
    }
    return false;
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
        await this.removeLocalVaultFile(file);
        this.syncIndex.delete(file.path);
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
    const remoteInventory = await this.listRemoteTree(this.settings.remoteFolder);
    const expectedFiles = /* @__PURE__ */ new Set();
    const imageRoot = this.normalizeFolder(this.settings.remoteFolder);
    for (const refs of this.noteRemoteRefs.values()) {
      for (const remotePath of refs) {
        if (remotePath.startsWith(imageRoot)) {
          expectedFiles.add(remotePath);
        }
      }
    }
    let deletedFiles = 0;
    for (const remotePath of [...remoteInventory.files.keys()].sort((a, b) => b.localeCompare(a))) {
      if (expectedFiles.has(remotePath)) {
        continue;
      }
      await this.deleteRemoteContentFile(remotePath);
      deletedFiles += 1;
    }
    const deletedDirectories = await this.deleteExtraRemoteDirectories(
      remoteInventory.directories,
      this.buildExpectedRemoteDirectories(expectedFiles, this.settings.remoteFolder)
    );
    return { deletedFiles, deletedDirectories };
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
        const remote = await this.statRemoteFile(remotePath);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiXHVGRUZGaW1wb3J0IHtcclxuICBBcHAsXG4gIEVkaXRvcixcbiAgTWFya2Rvd25GaWxlSW5mbyxcbiAgTWFya2Rvd25SZW5kZXJDaGlsZCxcbiAgTWFya2Rvd25WaWV3LFxyXG4gIE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQsXHJcbiAgTW9kYWwsXHJcbiAgTm90aWNlLFxyXG4gIFBsdWdpbixcclxuICBQbHVnaW5TZXR0aW5nVGFiLFxyXG4gIFNldHRpbmcsXHJcbiAgVEFic3RyYWN0RmlsZSxcclxuICBURmlsZSxcbiAgbm9ybWFsaXplUGF0aCxcbiAgcmVxdWVzdFVybCBhcyBvYnNpZGlhblJlcXVlc3RVcmwsXG59IGZyb20gXCJvYnNpZGlhblwiO1xuXHJcbnR5cGUgU2VjdXJlV2ViZGF2U2V0dGluZ3MgPSB7XG4gIHdlYmRhdlVybDogc3RyaW5nO1xuICB1c2VybmFtZTogc3RyaW5nO1xuICBwYXNzd29yZDogc3RyaW5nO1xuICByZW1vdGVGb2xkZXI6IHN0cmluZztcbiAgdmF1bHRTeW5jUmVtb3RlRm9sZGVyOiBzdHJpbmc7XG4gIG5hbWluZ1N0cmF0ZWd5OiBcInRpbWVzdGFtcFwiIHwgXCJoYXNoXCI7XG4gIGRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQ6IGJvb2xlYW47XG4gIGxhbmd1YWdlOiBcImF1dG9cIiB8IFwiemhcIiB8IFwiZW5cIjtcbiAgbm90ZVN0b3JhZ2VNb2RlOiBcImZ1bGwtbG9jYWxcIiB8IFwibGF6eS1ub3Rlc1wiO1xuICBub3RlRXZpY3RBZnRlckRheXM6IG51bWJlcjtcbiAgYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXM6IG51bWJlcjtcbiAgbWF4UmV0cnlBdHRlbXB0czogbnVtYmVyO1xuICByZXRyeURlbGF5U2Vjb25kczogbnVtYmVyO1xuICBkZWxldGVSZW1vdGVXaGVuVW5yZWZlcmVuY2VkOiBib29sZWFuO1xuICBjb21wcmVzc0ltYWdlczogYm9vbGVhbjtcbiAgY29tcHJlc3NUaHJlc2hvbGRLYjogbnVtYmVyO1xuICBtYXhJbWFnZURpbWVuc2lvbjogbnVtYmVyO1xuICBqcGVnUXVhbGl0eTogbnVtYmVyO1xufTtcblxyXG50eXBlIFVwbG9hZFRhc2sgPSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5vdGVQYXRoOiBzdHJpbmc7XG4gIHBsYWNlaG9sZGVyOiBzdHJpbmc7XG4gIG1pbWVUeXBlOiBzdHJpbmc7XHJcbiAgZmlsZU5hbWU6IHN0cmluZztcclxuICBkYXRhQmFzZTY0OiBzdHJpbmc7XHJcbiAgYXR0ZW1wdHM6IG51bWJlcjtcclxuICBjcmVhdGVkQXQ6IG51bWJlcjtcclxuICBsYXN0RXJyb3I/OiBzdHJpbmc7XG59O1xuXG50eXBlIFN5bmNJbmRleEVudHJ5ID0ge1xuICBsb2NhbFNpZ25hdHVyZTogc3RyaW5nO1xuICByZW1vdGVTaWduYXR1cmU6IHN0cmluZztcbiAgcmVtb3RlUGF0aDogc3RyaW5nO1xufTtcblxudHlwZSBSZW1vdGVGaWxlU3RhdGUgPSB7XG4gIHJlbW90ZVBhdGg6IHN0cmluZztcbiAgbGFzdE1vZGlmaWVkOiBudW1iZXI7XG4gIHNpemU6IG51bWJlcjtcbiAgc2lnbmF0dXJlOiBzdHJpbmc7XG59O1xuXG50eXBlIFJlbW90ZUludmVudG9yeSA9IHtcbiAgZmlsZXM6IE1hcDxzdHJpbmcsIFJlbW90ZUZpbGVTdGF0ZT47XG4gIGRpcmVjdG9yaWVzOiBTZXQ8c3RyaW5nPjtcbn07XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFNlY3VyZVdlYmRhdlNldHRpbmdzID0ge1xuICB3ZWJkYXZVcmw6IFwiXCIsXG4gIHVzZXJuYW1lOiBcIlwiLFxuICBwYXNzd29yZDogXCJcIixcbiAgcmVtb3RlRm9sZGVyOiBcIi9yZW1vdGUtaW1hZ2VzL1wiLFxuICB2YXVsdFN5bmNSZW1vdGVGb2xkZXI6IFwiL3ZhdWx0LXN5bmMvXCIsXG4gIG5hbWluZ1N0cmF0ZWd5OiBcImhhc2hcIixcbiAgZGVsZXRlTG9jYWxBZnRlclVwbG9hZDogdHJ1ZSxcbiAgbGFuZ3VhZ2U6IFwiYXV0b1wiLFxuICBub3RlU3RvcmFnZU1vZGU6IFwiZnVsbC1sb2NhbFwiLFxuICBub3RlRXZpY3RBZnRlckRheXM6IDMwLFxuICBhdXRvU3luY0ludGVydmFsTWludXRlczogMCxcbiAgbWF4UmV0cnlBdHRlbXB0czogNSxcbiAgcmV0cnlEZWxheVNlY29uZHM6IDUsXG4gIGRlbGV0ZVJlbW90ZVdoZW5VbnJlZmVyZW5jZWQ6IHRydWUsXG4gIGNvbXByZXNzSW1hZ2VzOiB0cnVlLFxuICBjb21wcmVzc1RocmVzaG9sZEtiOiAzMDAsXG4gIG1heEltYWdlRGltZW5zaW9uOiAyMjAwLFxuICBqcGVnUXVhbGl0eTogODIsXG59O1xuXHJcbmNvbnN0IFNFQ1VSRV9QUk9UT0NPTCA9IFwid2ViZGF2LXNlY3VyZTpcIjtcbmNvbnN0IFNFQ1VSRV9DT0RFX0JMT0NLID0gXCJzZWN1cmUtd2ViZGF2XCI7XG5jb25zdCBTRUNVUkVfTk9URV9TVFVCID0gXCJzZWN1cmUtd2ViZGF2LW5vdGUtc3R1YlwiO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTZWN1cmVXZWJkYXZJbWFnZXNQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogU2VjdXJlV2ViZGF2U2V0dGluZ3MgPSBERUZBVUxUX1NFVFRJTkdTO1xuICBxdWV1ZTogVXBsb2FkVGFza1tdID0gW107XG4gIHByaXZhdGUgYmxvYlVybHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBwcm9jZXNzaW5nVGFza0lkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIHJldHJ5VGltZW91dHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICBwcml2YXRlIG5vdGVSZW1vdGVSZWZzID0gbmV3IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PigpO1xuICBwcml2YXRlIHJlbW90ZUNsZWFudXBJbkZsaWdodCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIG5vdGVBY2Nlc3NUaW1lc3RhbXBzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgcHJpdmF0ZSBzeW5jSW5kZXggPSBuZXcgTWFwPHN0cmluZywgU3luY0luZGV4RW50cnk+KCk7XG4gIHByaXZhdGUgbGFzdFZhdWx0U3luY0F0ID0gMDtcbiAgcHJpdmF0ZSBsYXN0VmF1bHRTeW5jU3RhdHVzID0gXCJcIjtcbiAgcHJpdmF0ZSBzeW5jSW5Qcm9ncmVzcyA9IGZhbHNlO1xuXHJcbiAgYXN5bmMgb25sb2FkKCkge1xuICAgIGF3YWl0IHRoaXMubG9hZFBsdWdpblN0YXRlKCk7XG5cbiAgICB0aGlzLmFkZFNldHRpbmdUYWIobmV3IFNlY3VyZVdlYmRhdlNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJ1cGxvYWQtY3VycmVudC1ub3RlLWxvY2FsLWltYWdlc1wiLFxuICAgICAgbmFtZTogXCJVcGxvYWQgbG9jYWwgaW1hZ2VzIGluIGN1cnJlbnQgbm90ZSB0byBXZWJEQVZcIixcbiAgICAgIGNoZWNrQ2FsbGJhY2s6IChjaGVja2luZykgPT4ge1xyXG4gICAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xyXG4gICAgICAgIGlmICghZmlsZSkge1xyXG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCFjaGVja2luZykge1xyXG4gICAgICAgICAgdm9pZCB0aGlzLnVwbG9hZEltYWdlc0luTm90ZShmaWxlKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInRlc3Qtd2ViZGF2LWNvbm5lY3Rpb25cIixcbiAgICAgIG5hbWU6IFwiVGVzdCBXZWJEQVYgY29ubmVjdGlvblwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLnJ1bkNvbm5lY3Rpb25UZXN0KHRydWUpO1xuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJzeW5jLWNvbmZpZ3VyZWQtdmF1bHQtY29udGVudC10by13ZWJkYXZcIixcbiAgICAgIG5hbWU6IFwiU3luYyB2YXVsdCBjb250ZW50IHRvIFdlYkRBVlwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLnJ1bk1hbnVhbFN5bmMoKTtcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCByaWJib24gPSB0aGlzLmFkZFJpYmJvbkljb24oXCJyZWZyZXNoLWN3XCIsIHRoaXMudChcIlx1N0FDQlx1NTM3M1x1NTQwQ1x1NkI2NVx1NTIzMCBXZWJEQVZcIiwgXCJTeW5jIHRvIFdlYkRBViBub3dcIiksICgpID0+IHtcbiAgICAgIHZvaWQgdGhpcy5ydW5NYW51YWxTeW5jKCk7XG4gICAgfSk7XG4gICAgcmliYm9uLmFkZENsYXNzKFwic2VjdXJlLXdlYmRhdi1zeW5jLXJpYmJvblwiKTtcblxyXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duUG9zdFByb2Nlc3NvcigoZWwsIGN0eCkgPT4ge1xuICAgICAgdm9pZCB0aGlzLnByb2Nlc3NTZWN1cmVJbWFnZXMoZWwsIGN0eCk7XG4gICAgfSk7XG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFNFQ1VSRV9DT0RFX0JMT0NLLCAoc291cmNlLCBlbCwgY3R4KSA9PiB7XG4gICAgICB2b2lkIHRoaXMucHJvY2Vzc1NlY3VyZUNvZGVCbG9jayhzb3VyY2UsIGVsLCBjdHgpO1xuICAgIH0pO1xuXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFwiZmlsZS1vcGVuXCIsIChmaWxlKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5oYW5kbGVGaWxlT3BlbihmaWxlKTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJlZGl0b3ItcGFzdGVcIiwgKGV2dCwgZWRpdG9yLCBpbmZvKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5oYW5kbGVFZGl0b3JQYXN0ZShldnQsIGVkaXRvciwgaW5mbyk7XG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFwiZWRpdG9yLWRyb3BcIiwgKGV2dCwgZWRpdG9yLCBpbmZvKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5oYW5kbGVFZGl0b3JEcm9wKGV2dCwgZWRpdG9yLCBpbmZvKTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBhd2FpdCB0aGlzLnJlYnVpbGRSZWZlcmVuY2VJbmRleCgpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcIm1vZGlmeVwiLCAoZmlsZSkgPT4gdm9pZCB0aGlzLmhhbmRsZVZhdWx0TW9kaWZ5KGZpbGUpKSk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwiZGVsZXRlXCIsIChmaWxlKSA9PiB2b2lkIHRoaXMuaGFuZGxlVmF1bHREZWxldGUoZmlsZSkpKTtcbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oXCJyZW5hbWVcIiwgKGZpbGUsIG9sZFBhdGgpID0+IHZvaWQgdGhpcy5oYW5kbGVWYXVsdFJlbmFtZShmaWxlLCBvbGRQYXRoKSkpO1xuXG4gICAgdGhpcy5zZXR1cEF1dG9TeW5jKCk7XG5cbiAgICB2b2lkIHRoaXMucHJvY2Vzc1BlbmRpbmdUYXNrcygpO1xuXHJcbiAgICB0aGlzLnJlZ2lzdGVyKCgpID0+IHtcclxuICAgICAgZm9yIChjb25zdCBibG9iVXJsIG9mIHRoaXMuYmxvYlVybHMpIHtcclxuICAgICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKGJsb2JVcmwpO1xyXG4gICAgICB9XHJcbiAgICAgIHRoaXMuYmxvYlVybHMuY2xlYXIoKTtcclxuICAgICAgZm9yIChjb25zdCB0aW1lb3V0SWQgb2YgdGhpcy5yZXRyeVRpbWVvdXRzLnZhbHVlcygpKSB7XHJcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xyXG4gICAgICB9XHJcbiAgICAgIHRoaXMucmV0cnlUaW1lb3V0cy5jbGVhcigpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBvbnVubG9hZCgpIHtcclxuICAgIGZvciAoY29uc3QgYmxvYlVybCBvZiB0aGlzLmJsb2JVcmxzKSB7XHJcbiAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwoYmxvYlVybCk7XHJcbiAgICB9XHJcbiAgICB0aGlzLmJsb2JVcmxzLmNsZWFyKCk7XHJcbiAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnJldHJ5VGltZW91dHMudmFsdWVzKCkpIHtcclxuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xyXG4gICAgfVxyXG4gICAgdGhpcy5yZXRyeVRpbWVvdXRzLmNsZWFyKCk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBsb2FkUGx1Z2luU3RhdGUoKSB7XG4gICAgY29uc3QgbG9hZGVkID0gYXdhaXQgdGhpcy5sb2FkRGF0YSgpO1xuICAgIGlmICghbG9hZGVkIHx8IHR5cGVvZiBsb2FkZWQgIT09IFwib2JqZWN0XCIpIHtcbiAgICAgIHRoaXMuc2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MgfTtcbiAgICAgIHRoaXMucXVldWUgPSBbXTtcbiAgICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMgPSBuZXcgTWFwKCk7XG4gICAgICB0aGlzLnN5bmNJbmRleCA9IG5ldyBNYXAoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBjYW5kaWRhdGUgPSBsb2FkZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgaWYgKFwic2V0dGluZ3NcIiBpbiBjYW5kaWRhdGUgfHwgXCJxdWV1ZVwiIGluIGNhbmRpZGF0ZSkge1xuICAgICAgdGhpcy5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUywgLi4uKChjYW5kaWRhdGUuc2V0dGluZ3MgYXMgUGFydGlhbDxTZWN1cmVXZWJkYXZTZXR0aW5ncz4pID8/IHt9KSB9O1xuICAgICAgdGhpcy5xdWV1ZSA9IEFycmF5LmlzQXJyYXkoY2FuZGlkYXRlLnF1ZXVlKSA/IChjYW5kaWRhdGUucXVldWUgYXMgVXBsb2FkVGFza1tdKSA6IFtdO1xuICAgICAgdGhpcy5ub3RlQWNjZXNzVGltZXN0YW1wcyA9IG5ldyBNYXAoXG4gICAgICAgIE9iamVjdC5lbnRyaWVzKChjYW5kaWRhdGUubm90ZUFjY2Vzc1RpbWVzdGFtcHMgYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPiB8IHVuZGVmaW5lZCkgPz8ge30pLFxuICAgICAgKTtcbiAgICAgIHRoaXMuc3luY0luZGV4ID0gbmV3IE1hcCgpO1xuICAgICAgZm9yIChjb25zdCBbcGF0aCwgcmF3RW50cnldIG9mIE9iamVjdC5lbnRyaWVzKChjYW5kaWRhdGUuc3luY0luZGV4IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKSA/PyB7fSkpIHtcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IHRoaXMubm9ybWFsaXplU3luY0luZGV4RW50cnkocGF0aCwgcmF3RW50cnkpO1xuICAgICAgICBpZiAobm9ybWFsaXplZCkge1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChwYXRoLCBub3JtYWxpemVkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPVxuICAgICAgICB0eXBlb2YgY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNBdCA9PT0gXCJudW1iZXJcIiA/IGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jQXQgOiAwO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID1cbiAgICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jU3RhdHVzID09PSBcInN0cmluZ1wiID8gY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNTdGF0dXMgOiBcIlwiO1xuICAgICAgdGhpcy5ub3JtYWxpemVFZmZlY3RpdmVTZXR0aW5ncygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuc2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MsIC4uLihjYW5kaWRhdGUgYXMgUGFydGlhbDxTZWN1cmVXZWJkYXZTZXR0aW5ncz4pIH07XG4gICAgdGhpcy5xdWV1ZSA9IFtdO1xuICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5zeW5jSW5kZXggPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSAwO1xuICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9IFwiXCI7XG4gICAgdGhpcy5ub3JtYWxpemVFZmZlY3RpdmVTZXR0aW5ncygpO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVFZmZlY3RpdmVTZXR0aW5ncygpIHtcbiAgICAvLyBLZWVwIHRoZSBwdWJsaWMgc2V0dGluZ3Mgc3VyZmFjZSBpbnRlbnRpb25hbGx5IHNtYWxsIGFuZCBkZXRlcm1pbmlzdGljLlxuICAgIHRoaXMuc2V0dGluZ3MuZGVsZXRlTG9jYWxBZnRlclVwbG9hZCA9IHRydWU7XG4gICAgdGhpcy5zZXR0aW5ncy5hdXRvU3luY0ludGVydmFsTWludXRlcyA9IE1hdGgubWF4KDAsIE1hdGguZmxvb3IodGhpcy5zZXR0aW5ncy5hdXRvU3luY0ludGVydmFsTWludXRlcyB8fCAwKSk7XG4gIH1cblxuICBwcml2YXRlIHNldHVwQXV0b1N5bmMoKSB7XG4gICAgY29uc3QgbWludXRlcyA9IHRoaXMuc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXM7XG4gICAgaWYgKG1pbnV0ZXMgPD0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGludGVydmFsTXMgPSBtaW51dGVzICogNjAgKiAxMDAwO1xuICAgIHRoaXMucmVnaXN0ZXJJbnRlcnZhbChcbiAgICAgIHdpbmRvdy5zZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5wcm9jZXNzUGVuZGluZ1Rhc2tzKCk7XG4gICAgICAgIHZvaWQgdGhpcy5zeW5jQ29uZmlndXJlZFZhdWx0Q29udGVudChmYWxzZSk7XG4gICAgICB9LCBpbnRlcnZhbE1zKSxcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgc2F2ZVBsdWdpblN0YXRlKCkge1xuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEoe1xuICAgICAgc2V0dGluZ3M6IHRoaXMuc2V0dGluZ3MsXG4gICAgICBxdWV1ZTogdGhpcy5xdWV1ZSxcbiAgICAgIG5vdGVBY2Nlc3NUaW1lc3RhbXBzOiBPYmplY3QuZnJvbUVudHJpZXModGhpcy5ub3RlQWNjZXNzVGltZXN0YW1wcy5lbnRyaWVzKCkpLFxuICAgICAgc3luY0luZGV4OiBPYmplY3QuZnJvbUVudHJpZXModGhpcy5zeW5jSW5kZXguZW50cmllcygpKSxcbiAgICAgIGxhc3RWYXVsdFN5bmNBdDogdGhpcy5sYXN0VmF1bHRTeW5jQXQsXG4gICAgICBsYXN0VmF1bHRTeW5jU3RhdHVzOiB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsXG4gICAgfSk7XG4gIH1cblxyXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcbiAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVTeW5jSW5kZXhFbnRyeSh2YXVsdFBhdGg6IHN0cmluZywgcmF3RW50cnk6IHVua25vd24pOiBTeW5jSW5kZXhFbnRyeSB8IG51bGwge1xuICAgIGlmICghcmF3RW50cnkgfHwgdHlwZW9mIHJhd0VudHJ5ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBjYW5kaWRhdGUgPSByYXdFbnRyeSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICBjb25zdCByZW1vdGVQYXRoID1cbiAgICAgIHR5cGVvZiBjYW5kaWRhdGUucmVtb3RlUGF0aCA9PT0gXCJzdHJpbmdcIiAmJiBjYW5kaWRhdGUucmVtb3RlUGF0aC5sZW5ndGggPiAwXG4gICAgICAgID8gY2FuZGlkYXRlLnJlbW90ZVBhdGhcbiAgICAgICAgOiB0aGlzLmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aCh2YXVsdFBhdGgpO1xuICAgIGNvbnN0IGxvY2FsU2lnbmF0dXJlID1cbiAgICAgIHR5cGVvZiBjYW5kaWRhdGUubG9jYWxTaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgPyBjYW5kaWRhdGUubG9jYWxTaWduYXR1cmVcbiAgICAgICAgOiB0eXBlb2YgY2FuZGlkYXRlLnNpZ25hdHVyZSA9PT0gXCJzdHJpbmdcIlxuICAgICAgICAgID8gY2FuZGlkYXRlLnNpZ25hdHVyZVxuICAgICAgICAgIDogXCJcIjtcbiAgICBjb25zdCByZW1vdGVTaWduYXR1cmUgPVxuICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5yZW1vdGVTaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgPyBjYW5kaWRhdGUucmVtb3RlU2lnbmF0dXJlXG4gICAgICAgIDogdHlwZW9mIGNhbmRpZGF0ZS5zaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgICA/IGNhbmRpZGF0ZS5zaWduYXR1cmVcbiAgICAgICAgICA6IFwiXCI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICByZW1vdGVQYXRoLFxuICAgIH07XG4gIH1cblxyXG4gIHQoemg6IHN0cmluZywgZW46IHN0cmluZykge1xyXG4gICAgcmV0dXJuIHRoaXMuZ2V0TGFuZ3VhZ2UoKSA9PT0gXCJ6aFwiID8gemggOiBlbjtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZ2V0TGFuZ3VhZ2UoKSB7XG4gICAgaWYgKHRoaXMuc2V0dGluZ3MubGFuZ3VhZ2UgPT09IFwiYXV0b1wiKSB7XG4gICAgICBjb25zdCBsb2NhbGUgPSB0eXBlb2YgbmF2aWdhdG9yICE9PSBcInVuZGVmaW5lZFwiID8gbmF2aWdhdG9yLmxhbmd1YWdlLnRvTG93ZXJDYXNlKCkgOiBcImVuXCI7XG4gICAgICByZXR1cm4gbG9jYWxlLnN0YXJ0c1dpdGgoXCJ6aFwiKSA/IFwiemhcIiA6IFwiZW5cIjtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zZXR0aW5ncy5sYW5ndWFnZTtcbiAgfVxuXG4gIGZvcm1hdExhc3RTeW5jTGFiZWwoKSB7XG4gICAgaWYgKCF0aGlzLmxhc3RWYXVsdFN5bmNBdCkge1xuICAgICAgcmV0dXJuIHRoaXMudChcIlx1NEUwQVx1NkIyMVx1NTQwQ1x1NkI2NVx1RkYxQVx1NUMxQVx1NjcyQVx1NjI2N1x1ODg0Q1wiLCBcIkxhc3Qgc3luYzogbm90IHJ1biB5ZXRcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMudChcbiAgICAgIGBcdTRFMEFcdTZCMjFcdTU0MENcdTZCNjVcdUZGMUEke25ldyBEYXRlKHRoaXMubGFzdFZhdWx0U3luY0F0KS50b0xvY2FsZVN0cmluZygpfWAsXG4gICAgICBgTGFzdCBzeW5jOiAke25ldyBEYXRlKHRoaXMubGFzdFZhdWx0U3luY0F0KS50b0xvY2FsZVN0cmluZygpfWAsXG4gICAgKTtcbiAgfVxuXG4gIGZvcm1hdFN5bmNTdGF0dXNMYWJlbCgpIHtcbiAgICByZXR1cm4gdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzXG4gICAgICA/IHRoaXMudChgXHU2NzAwXHU4RkQxXHU3MkI2XHU2MDAxXHVGRjFBJHt0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXN9YCwgYFJlY2VudCBzdGF0dXM6ICR7dGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzfWApXG4gICAgICA6IHRoaXMudChcIlx1NjcwMFx1OEZEMVx1NzJCNlx1NjAwMVx1RkYxQVx1NjY4Mlx1NjVFMFwiLCBcIlJlY2VudCBzdGF0dXM6IG5vbmVcIik7XG4gIH1cblxuICBhc3luYyBydW5NYW51YWxTeW5jKCkge1xuICAgIGF3YWl0IHRoaXMucHJvY2Vzc1BlbmRpbmdUYXNrcygpO1xuICAgIGF3YWl0IHRoaXMuc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQodHJ1ZSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlYnVpbGRSZWZlcmVuY2VJbmRleCgpIHtcbiAgICBjb25zdCBuZXh0ID0gbmV3IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PigpO1xuICAgIGZvciAoY29uc3QgZmlsZSBvZiB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkpIHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgbmV4dC5zZXQoZmlsZS5wYXRoLCB0aGlzLmV4dHJhY3RSZW1vdGVQYXRoc0Zyb21UZXh0KGNvbnRlbnQpKTtcbiAgICB9XG4gICAgdGhpcy5ub3RlUmVtb3RlUmVmcyA9IG5leHQ7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZVZhdWx0TW9kaWZ5KGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHx8IGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBjb25zdCBuZXh0UmVmcyA9IHRoaXMuZXh0cmFjdFJlbW90ZVBhdGhzRnJvbVRleHQoY29udGVudCk7XG4gICAgY29uc3QgcHJldmlvdXNSZWZzID0gdGhpcy5ub3RlUmVtb3RlUmVmcy5nZXQoZmlsZS5wYXRoKSA/PyBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICB0aGlzLm5vdGVSZW1vdGVSZWZzLnNldChmaWxlLnBhdGgsIG5leHRSZWZzKTtcblxuICAgIGNvbnN0IHJlbW92ZWQgPSBbLi4ucHJldmlvdXNSZWZzXS5maWx0ZXIoKHZhbHVlKSA9PiAhbmV4dFJlZnMuaGFzKHZhbHVlKSk7XG4gICAgZm9yIChjb25zdCByZW1vdGVQYXRoIG9mIHJlbW92ZWQpIHtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlSWZVbnJlZmVyZW5jZWQocmVtb3RlUGF0aCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVWYXVsdERlbGV0ZShmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKGZpbGUucGF0aCkpIHtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlU3luY2VkRW50cnkoZmlsZS5wYXRoKTtcbiAgICB9XG5cbiAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgY29uc3QgcHJldmlvdXNSZWZzID0gdGhpcy5ub3RlUmVtb3RlUmVmcy5nZXQoZmlsZS5wYXRoKSA/PyBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICAgIHRoaXMubm90ZVJlbW90ZVJlZnMuZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICBmb3IgKGNvbnN0IHJlbW90ZVBhdGggb2YgcHJldmlvdXNSZWZzKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlSWZVbnJlZmVyZW5jZWQocmVtb3RlUGF0aCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVWYXVsdFJlbmFtZShmaWxlOiBUQWJzdHJhY3RGaWxlLCBvbGRQYXRoOiBzdHJpbmcpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnNob3VsZFNraXBDb250ZW50U3luY1BhdGgob2xkUGF0aCkpIHtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlU3luY2VkRW50cnkob2xkUGF0aCk7XG4gICAgfVxuXG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIGNvbnN0IHJlZnMgPSB0aGlzLm5vdGVSZW1vdGVSZWZzLmdldChvbGRQYXRoKTtcbiAgICAgIGlmICghcmVmcykge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHRoaXMubm90ZVJlbW90ZVJlZnMuZGVsZXRlKG9sZFBhdGgpO1xuICAgICAgdGhpcy5ub3RlUmVtb3RlUmVmcy5zZXQoZmlsZS5wYXRoLCByZWZzKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RSZW1vdGVQYXRoc0Zyb21UZXh0KGNvbnRlbnQ6IHN0cmluZykge1xuICAgIGNvbnN0IHJlZnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBjb25zdCBzcGFuUmVnZXggPSAvZGF0YS1zZWN1cmUtd2ViZGF2PVwiKFteXCJdKylcIi9nO1xuICAgIGNvbnN0IHByb3RvY29sUmVnZXggPSAvd2ViZGF2LXNlY3VyZTpcXC9cXC8oW15cXHMpXCJdKykvZztcbiAgICBjb25zdCBjb2RlQmxvY2tSZWdleCA9IC9gYGBzZWN1cmUtd2ViZGF2XFxzKyhbXFxzXFxTXSo/KWBgYC9nO1xuICAgIGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblxuICAgIHdoaWxlICgobWF0Y2ggPSBzcGFuUmVnZXguZXhlYyhjb250ZW50KSkgIT09IG51bGwpIHtcbiAgICAgIHJlZnMuYWRkKHRoaXMudW5lc2NhcGVIdG1sKG1hdGNoWzFdKSk7XG4gICAgfVxuXG4gICAgd2hpbGUgKChtYXRjaCA9IHByb3RvY29sUmVnZXguZXhlYyhjb250ZW50KSkgIT09IG51bGwpIHtcbiAgICAgIHJlZnMuYWRkKHRoaXMudW5lc2NhcGVIdG1sKG1hdGNoWzFdKSk7XG4gICAgfVxuXG4gICAgd2hpbGUgKChtYXRjaCA9IGNvZGVCbG9ja1JlZ2V4LmV4ZWMoY29udGVudCkpICE9PSBudWxsKSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSB0aGlzLnBhcnNlU2VjdXJlSW1hZ2VCbG9jayhtYXRjaFsxXSk7XG4gICAgICBpZiAocGFyc2VkPy5wYXRoKSB7XG4gICAgICAgIHJlZnMuYWRkKHBhcnNlZC5wYXRoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVmcztcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZGVsZXRlUmVtb3RlSWZVbnJlZmVyZW5jZWQocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLmRlbGV0ZVJlbW90ZVdoZW5VbnJlZmVyZW5jZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5yZW1vdGVDbGVhbnVwSW5GbGlnaHQuaGFzKHJlbW90ZVBhdGgpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgc3RpbGxSZWZlcmVuY2VkID0gWy4uLnRoaXMubm90ZVJlbW90ZVJlZnMudmFsdWVzKCldLnNvbWUoKHJlZnMpID0+IHJlZnMuaGFzKHJlbW90ZVBhdGgpKTtcbiAgICBpZiAoc3RpbGxSZWZlcmVuY2VkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5yZW1vdGVDbGVhbnVwSW5GbGlnaHQuYWRkKHJlbW90ZVBhdGgpO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSA0MDQgJiYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYERFTEVURSBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZGVsZXRlIHVucmVmZXJlbmNlZCByZW1vdGUgaW1hZ2VcIiwgcmVtb3RlUGF0aCwgZXJyb3IpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLnJlbW90ZUNsZWFudXBJbkZsaWdodC5kZWxldGUocmVtb3RlUGF0aCk7XG4gICAgfVxuICB9XG5cclxuICBwcml2YXRlIGFzeW5jIGJ1aWxkVXBsb2FkUmVwbGFjZW1lbnRzKGNvbnRlbnQ6IHN0cmluZywgbm90ZUZpbGU6IFRGaWxlLCB1cGxvYWRDYWNoZT86IE1hcDxzdHJpbmcsIHN0cmluZz4pIHtcbiAgICBjb25zdCBzZWVuID0gbmV3IE1hcDxzdHJpbmcsIFVwbG9hZFJld3JpdGU+KCk7XG4gICAgY29uc3Qgd2lraU1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvIVxcW1xcWyhbXlxcXV0rKVxcXVxcXS9nKV07XG4gICAgY29uc3QgbWFya2Rvd25NYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtbXlxcXV0qXVxcKChbXildKylcXCkvZyldO1xuICAgIGNvbnN0IGh0bWxJbWFnZU1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvPGltZ1xcYltePl0qc3JjPVtcIiddKFteXCInXSspW1wiJ11bXj5dKj4vZ2kpXTtcblxyXG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiB3aWtpTWF0Y2hlcykge1xyXG4gICAgICBjb25zdCByYXdMaW5rID0gbWF0Y2hbMV0uc3BsaXQoXCJ8XCIpWzBdLnRyaW0oKTtcclxuICAgICAgY29uc3QgZmlsZSA9IHRoaXMucmVzb2x2ZUxpbmtlZEZpbGUocmF3TGluaywgbm90ZUZpbGUucGF0aCk7XHJcbiAgICAgIGlmICghZmlsZSB8fCAhdGhpcy5pc0ltYWdlRmlsZShmaWxlKSkge1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XG5cbiAgICAgIGlmICghc2Vlbi5oYXMobWF0Y2hbMF0pKSB7XG4gICAgICAgIGNvbnN0IHJlbW90ZVVybCA9IGF3YWl0IHRoaXMudXBsb2FkVmF1bHRGaWxlKGZpbGUsIHVwbG9hZENhY2hlKTtcbiAgICAgICAgc2Vlbi5zZXQobWF0Y2hbMF0sIHtcbiAgICAgICAgICBvcmlnaW5hbDogbWF0Y2hbMF0sXG4gICAgICAgICAgcmV3cml0dGVuOiB0aGlzLmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsLCBmaWxlLmJhc2VuYW1lKSxcbiAgICAgICAgICBzb3VyY2VGaWxlOiBmaWxlLFxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWFya2Rvd25NYXRjaGVzKSB7XG4gICAgICBjb25zdCByYXdMaW5rID0gZGVjb2RlVVJJQ29tcG9uZW50KG1hdGNoWzFdLnRyaW0oKS5yZXBsYWNlKC9ePHw+JC9nLCBcIlwiKSk7XG4gICAgICBpZiAoL14od2ViZGF2LXNlY3VyZTp8ZGF0YTopL2kudGVzdChyYXdMaW5rKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuaXNIdHRwVXJsKHJhd0xpbmspKSB7XG4gICAgICAgIGlmICghc2Vlbi5oYXMobWF0Y2hbMF0pKSB7XG4gICAgICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRSZW1vdGVJbWFnZVVybChyYXdMaW5rLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgICAgY29uc3QgYWx0VGV4dCA9IHRoaXMuZXh0cmFjdE1hcmtkb3duQWx0VGV4dChtYXRjaFswXSkgfHwgdGhpcy5nZXREaXNwbGF5TmFtZUZyb21VcmwocmF3TGluayk7XG4gICAgICAgICAgc2Vlbi5zZXQobWF0Y2hbMF0sIHtcbiAgICAgICAgICAgIG9yaWdpbmFsOiBtYXRjaFswXSxcbiAgICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgYWx0VGV4dCksXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGVGaWxlLnBhdGgpO1xuICAgICAgaWYgKCFmaWxlIHx8ICF0aGlzLmlzSW1hZ2VGaWxlKGZpbGUpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFZhdWx0RmlsZShmaWxlLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgICAgb3JpZ2luYWw6IG1hdGNoWzBdLFxuICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgZmlsZS5iYXNlbmFtZSksXG4gICAgICAgICAgc291cmNlRmlsZTogZmlsZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiBodG1sSW1hZ2VNYXRjaGVzKSB7XG4gICAgICBjb25zdCByYXdMaW5rID0gdGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0udHJpbSgpKTtcbiAgICAgIGlmICghdGhpcy5pc0h0dHBVcmwocmF3TGluaykgfHwgc2Vlbi5oYXMobWF0Y2hbMF0pKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFJlbW90ZUltYWdlVXJsKHJhd0xpbmssIHVwbG9hZENhY2hlKTtcbiAgICAgIGNvbnN0IGFsdFRleHQgPSB0aGlzLmV4dHJhY3RIdG1sSW1hZ2VBbHRUZXh0KG1hdGNoWzBdKSB8fCB0aGlzLmdldERpc3BsYXlOYW1lRnJvbVVybChyYXdMaW5rKTtcbiAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgIG9yaWdpbmFsOiBtYXRjaFswXSxcbiAgICAgICAgcmV3cml0dGVuOiB0aGlzLmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsLCBhbHRUZXh0KSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBbLi4uc2Vlbi52YWx1ZXMoKV07XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RNYXJrZG93bkFsdFRleHQobWFya2Rvd25JbWFnZTogc3RyaW5nKSB7XG4gICAgY29uc3QgbWF0Y2ggPSBtYXJrZG93bkltYWdlLm1hdGNoKC9eIVxcWyhbXlxcXV0qKVxcXS8pO1xuICAgIHJldHVybiBtYXRjaD8uWzFdPy50cmltKCkgPz8gXCJcIjtcbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdEh0bWxJbWFnZUFsdFRleHQoaHRtbEltYWdlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtYXRjaCA9IGh0bWxJbWFnZS5tYXRjaCgvXFxiYWx0PVtcIiddKFteXCInXSopW1wiJ10vaSk7XG4gICAgcmV0dXJuIG1hdGNoID8gdGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0udHJpbSgpKSA6IFwiXCI7XG4gIH1cblxuICBwcml2YXRlIGlzSHR0cFVybCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIC9eaHR0cHM/OlxcL1xcLy9pLnRlc3QodmFsdWUpO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXREaXNwbGF5TmFtZUZyb21VcmwocmF3VXJsOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXJsID0gbmV3IFVSTChyYXdVcmwpO1xuICAgICAgY29uc3QgZmlsZU5hbWUgPSB0aGlzLnNhbml0aXplRmlsZU5hbWUodXJsLnBhdGhuYW1lLnNwbGl0KFwiL1wiKS5wb3AoKSB8fCBcIlwiKTtcbiAgICAgIGlmIChmaWxlTmFtZSkge1xuICAgICAgICByZXR1cm4gZmlsZU5hbWUucmVwbGFjZSgvXFwuW14uXSskLywgXCJcIik7XG4gICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBGYWxsIHRocm91Z2ggdG8gdGhlIGdlbmVyaWMgbGFiZWwgYmVsb3cuXG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMudChcIlx1N0Y1MVx1OTg3NVx1NTZGRVx1NzI0N1wiLCBcIldlYiBpbWFnZVwiKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVzb2x2ZUxpbmtlZEZpbGUobGluazogc3RyaW5nLCBzb3VyY2VQYXRoOiBzdHJpbmcpOiBURmlsZSB8IG51bGwge1xuICAgIGNvbnN0IGNsZWFuZWQgPSBsaW5rLnJlcGxhY2UoLyMuKi8sIFwiXCIpLnRyaW0oKTtcbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpcnN0TGlua3BhdGhEZXN0KGNsZWFuZWQsIHNvdXJjZVBhdGgpO1xuICAgIHJldHVybiB0YXJnZXQgaW5zdGFuY2VvZiBURmlsZSA/IHRhcmdldCA6IG51bGw7XG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBpc0ltYWdlRmlsZShmaWxlOiBURmlsZSkge1xuICAgIHJldHVybiAvXihwbmd8anBlP2d8Z2lmfHdlYnB8Ym1wfHN2ZykkL2kudGVzdChmaWxlLmV4dGVuc2lvbik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwbG9hZFZhdWx0RmlsZShmaWxlOiBURmlsZSwgdXBsb2FkQ2FjaGU/OiBNYXA8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgaWYgKHVwbG9hZENhY2hlPy5oYXMoZmlsZS5wYXRoKSkge1xuICAgICAgcmV0dXJuIHVwbG9hZENhY2hlLmdldChmaWxlLnBhdGgpITtcbiAgICB9XG5cbiAgICB0aGlzLmVuc3VyZUNvbmZpZ3VyZWQoKTtcbiAgICBjb25zdCBiaW5hcnkgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgIGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdGhpcy5wcmVwYXJlVXBsb2FkUGF5bG9hZChiaW5hcnksIHRoaXMuZ2V0TWltZVR5cGUoZmlsZS5leHRlbnNpb24pLCBmaWxlLm5hbWUpO1xuICAgIGNvbnN0IHJlbW90ZU5hbWUgPSBhd2FpdCB0aGlzLmJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5KHByZXBhcmVkLmZpbGVOYW1lLCBwcmVwYXJlZC5iaW5hcnkpO1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkUmVtb3RlUGF0aChyZW1vdGVOYW1lKTtcbiAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBwcmVwYXJlZC5iaW5hcnksIHByZXBhcmVkLm1pbWVUeXBlKTtcbiAgICBjb25zdCByZW1vdGVVcmwgPSBgJHtTRUNVUkVfUFJPVE9DT0x9Ly8ke3JlbW90ZVBhdGh9YDtcbiAgICB1cGxvYWRDYWNoZT8uc2V0KGZpbGUucGF0aCwgcmVtb3RlVXJsKTtcbiAgICByZXR1cm4gcmVtb3RlVXJsO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRSZW1vdGVJbWFnZVVybChpbWFnZVVybDogc3RyaW5nLCB1cGxvYWRDYWNoZT86IE1hcDxzdHJpbmcsIHN0cmluZz4pIHtcbiAgICBjb25zdCBjYWNoZUtleSA9IGByZW1vdGU6JHtpbWFnZVVybH1gO1xuICAgIGlmICh1cGxvYWRDYWNoZT8uaGFzKGNhY2hlS2V5KSkge1xuICAgICAgcmV0dXJuIHVwbG9hZENhY2hlLmdldChjYWNoZUtleSkhO1xuICAgIH1cblxuICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogaW1hZ2VVcmwsXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBmb2xsb3dSZWRpcmVjdHM6IHRydWUsXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgUmVtb3RlIGltYWdlIGRvd25sb2FkIGZhaWxlZCB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50VHlwZSA9IHJlc3BvbnNlLmhlYWRlcnNbXCJjb250ZW50LXR5cGVcIl0gPz8gXCJcIjtcbiAgICBpZiAoIXRoaXMuaXNJbWFnZUNvbnRlbnRUeXBlKGNvbnRlbnRUeXBlKSAmJiAhdGhpcy5sb29rc0xpa2VJbWFnZVVybChpbWFnZVVybCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJcdThGRENcdTdBMEJcdTk0RkVcdTYzQTVcdTRFMERcdTY2MkZcdTUzRUZcdThCQzZcdTUyMkJcdTc2ODRcdTU2RkVcdTcyNDdcdThENDRcdTZFOTBcdTMwMDJcIiwgXCJUaGUgcmVtb3RlIFVSTCBkb2VzIG5vdCBsb29rIGxpa2UgYW4gaW1hZ2UgcmVzb3VyY2UuXCIpKTtcbiAgICB9XG5cbiAgICBjb25zdCBmaWxlTmFtZSA9IHRoaXMuYnVpbGRSZW1vdGVTb3VyY2VGaWxlTmFtZShpbWFnZVVybCwgY29udGVudFR5cGUpO1xuICAgIGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdGhpcy5wcmVwYXJlVXBsb2FkUGF5bG9hZChcbiAgICAgIHJlc3BvbnNlLmFycmF5QnVmZmVyLFxuICAgICAgdGhpcy5ub3JtYWxpemVJbWFnZU1pbWVUeXBlKGNvbnRlbnRUeXBlLCBmaWxlTmFtZSksXG4gICAgICBmaWxlTmFtZSxcbiAgICApO1xuICAgIGNvbnN0IHJlbW90ZU5hbWUgPSBhd2FpdCB0aGlzLmJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5KHByZXBhcmVkLmZpbGVOYW1lLCBwcmVwYXJlZC5iaW5hcnkpO1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkUmVtb3RlUGF0aChyZW1vdGVOYW1lKTtcbiAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBwcmVwYXJlZC5iaW5hcnksIHByZXBhcmVkLm1pbWVUeXBlKTtcbiAgICBjb25zdCByZW1vdGVVcmwgPSBgJHtTRUNVUkVfUFJPVE9DT0x9Ly8ke3JlbW90ZVBhdGh9YDtcbiAgICB1cGxvYWRDYWNoZT8uc2V0KGNhY2hlS2V5LCByZW1vdGVVcmwpO1xuICAgIHJldHVybiByZW1vdGVVcmw7XG4gIH1cblxuICBwcml2YXRlIGlzSW1hZ2VDb250ZW50VHlwZShjb250ZW50VHlwZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIC9eaW1hZ2VcXC8vaS50ZXN0KGNvbnRlbnRUeXBlLnRyaW0oKSk7XG4gIH1cblxuICBwcml2YXRlIGxvb2tzTGlrZUltYWdlVXJsKHJhd1VybDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmF3VXJsKTtcbiAgICAgIHJldHVybiAvXFwuKHBuZ3xqcGU/Z3xnaWZ8d2VicHxibXB8c3ZnKSQvaS50ZXN0KHVybC5wYXRobmFtZSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBidWlsZFJlbW90ZVNvdXJjZUZpbGVOYW1lKHJhd1VybDogc3RyaW5nLCBjb250ZW50VHlwZTogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmF3VXJsKTtcbiAgICAgIGNvbnN0IGNhbmRpZGF0ZSA9IHRoaXMuc2FuaXRpemVGaWxlTmFtZSh1cmwucGF0aG5hbWUuc3BsaXQoXCIvXCIpLnBvcCgpIHx8IFwiXCIpO1xuICAgICAgaWYgKGNhbmRpZGF0ZSAmJiAvXFwuW2EtejAtOV0rJC9pLnRlc3QoY2FuZGlkYXRlKSkge1xuICAgICAgICByZXR1cm4gY2FuZGlkYXRlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBleHRlbnNpb24gPSB0aGlzLmdldEV4dGVuc2lvbkZyb21NaW1lVHlwZShjb250ZW50VHlwZSkgfHwgXCJwbmdcIjtcbiAgICAgIHJldHVybiBjYW5kaWRhdGUgPyBgJHtjYW5kaWRhdGV9LiR7ZXh0ZW5zaW9ufWAgOiBgcmVtb3RlLWltYWdlLiR7ZXh0ZW5zaW9ufWA7XG4gICAgfSBjYXRjaCB7XG4gICAgICBjb25zdCBleHRlbnNpb24gPSB0aGlzLmdldEV4dGVuc2lvbkZyb21NaW1lVHlwZShjb250ZW50VHlwZSkgfHwgXCJwbmdcIjtcbiAgICAgIHJldHVybiBgcmVtb3RlLWltYWdlLiR7ZXh0ZW5zaW9ufWA7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBzYW5pdGl6ZUZpbGVOYW1lKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gZmlsZU5hbWUucmVwbGFjZSgvW1xcXFwvOio/XCI8PnxdKy9nLCBcIi1cIikudHJpbSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRFeHRlbnNpb25Gcm9tTWltZVR5cGUoY29udGVudFR5cGU6IHN0cmluZykge1xuICAgIGNvbnN0IG1pbWVUeXBlID0gY29udGVudFR5cGUuc3BsaXQoXCI7XCIpWzBdLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIHN3aXRjaCAobWltZVR5cGUpIHtcbiAgICAgIGNhc2UgXCJpbWFnZS9qcGVnXCI6XG4gICAgICAgIHJldHVybiBcImpwZ1wiO1xuICAgICAgY2FzZSBcImltYWdlL3BuZ1wiOlxuICAgICAgICByZXR1cm4gXCJwbmdcIjtcbiAgICAgIGNhc2UgXCJpbWFnZS9naWZcIjpcbiAgICAgICAgcmV0dXJuIFwiZ2lmXCI7XG4gICAgICBjYXNlIFwiaW1hZ2Uvd2VicFwiOlxuICAgICAgICByZXR1cm4gXCJ3ZWJwXCI7XG4gICAgICBjYXNlIFwiaW1hZ2UvYm1wXCI6XG4gICAgICAgIHJldHVybiBcImJtcFwiO1xuICAgICAgY2FzZSBcImltYWdlL3N2Zyt4bWxcIjpcbiAgICAgICAgcmV0dXJuIFwic3ZnXCI7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUltYWdlTWltZVR5cGUoY29udGVudFR5cGU6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IG1pbWVUeXBlID0gY29udGVudFR5cGUuc3BsaXQoXCI7XCIpWzBdLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmIChtaW1lVHlwZSAmJiBtaW1lVHlwZSAhPT0gXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIikge1xuICAgICAgcmV0dXJuIG1pbWVUeXBlO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmdldE1pbWVUeXBlRnJvbUZpbGVOYW1lKGZpbGVOYW1lKTtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRCaW5hcnkocmVtb3RlUGF0aDogc3RyaW5nLCBiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nKSB7XG4gICAgYXdhaXQgdGhpcy5lbnN1cmVSZW1vdGVEaXJlY3RvcmllcyhyZW1vdGVQYXRoKTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiUFVUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIFwiQ29udGVudC1UeXBlXCI6IG1pbWVUeXBlLFxyXG4gICAgICB9LFxyXG4gICAgICBib2R5OiBiaW5hcnksXHJcbiAgICB9KTtcclxuXHJcbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVXBsb2FkIGZhaWxlZCB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUVkaXRvclBhc3RlKGV2dDogQ2xpcGJvYXJkRXZlbnQsIGVkaXRvcjogRWRpdG9yLCBpbmZvOiBNYXJrZG93blZpZXcgfCBNYXJrZG93bkZpbGVJbmZvKSB7XG4gICAgaWYgKGV2dC5kZWZhdWx0UHJldmVudGVkIHx8ICFpbmZvLmZpbGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbWFnZUZpbGUgPSB0aGlzLmV4dHJhY3RJbWFnZUZpbGVGcm9tQ2xpcGJvYXJkKGV2dCk7XG4gICAgaWYgKGltYWdlRmlsZSkge1xuICAgICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCBmaWxlTmFtZSA9IGltYWdlRmlsZS5uYW1lIHx8IHRoaXMuYnVpbGRDbGlwYm9hcmRGaWxlTmFtZShpbWFnZUZpbGUudHlwZSk7XG4gICAgICBhd2FpdCB0aGlzLmVucXVldWVFZGl0b3JJbWFnZVVwbG9hZChpbmZvLmZpbGUsIGVkaXRvciwgaW1hZ2VGaWxlLCBmaWxlTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaHRtbCA9IGV2dC5jbGlwYm9hcmREYXRhPy5nZXREYXRhKFwidGV4dC9odG1sXCIpPy50cmltKCkgPz8gXCJcIjtcbiAgICBpZiAoIWh0bWwgfHwgIXRoaXMuaHRtbENvbnRhaW5zUmVtb3RlSW1hZ2VzKGh0bWwpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgYXdhaXQgdGhpcy5oYW5kbGVIdG1sUGFzdGVXaXRoUmVtb3RlSW1hZ2VzKGluZm8uZmlsZSwgZWRpdG9yLCBodG1sKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlRWRpdG9yRHJvcChldnQ6IERyYWdFdmVudCwgZWRpdG9yOiBFZGl0b3IsIGluZm86IE1hcmtkb3duVmlldyB8IE1hcmtkb3duRmlsZUluZm8pIHtcbiAgICBpZiAoZXZ0LmRlZmF1bHRQcmV2ZW50ZWQgfHwgIWluZm8uZmlsZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGltYWdlRmlsZSA9IHRoaXMuZXh0cmFjdEltYWdlRmlsZUZyb21Ecm9wKGV2dCk7XG4gICAgaWYgKCFpbWFnZUZpbGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICBjb25zdCBmaWxlTmFtZSA9IGltYWdlRmlsZS5uYW1lIHx8IHRoaXMuYnVpbGRDbGlwYm9hcmRGaWxlTmFtZShpbWFnZUZpbGUudHlwZSk7XG4gICAgYXdhaXQgdGhpcy5lbnF1ZXVlRWRpdG9ySW1hZ2VVcGxvYWQoaW5mby5maWxlLCBlZGl0b3IsIGltYWdlRmlsZSwgZmlsZU5hbWUpO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRyYWN0SW1hZ2VGaWxlRnJvbUNsaXBib2FyZChldnQ6IENsaXBib2FyZEV2ZW50KSB7XG4gICAgY29uc3QgZGlyZWN0ID0gQXJyYXkuZnJvbShldnQuY2xpcGJvYXJkRGF0YT8uZmlsZXMgPz8gW10pLmZpbmQoKGZpbGUpID0+IGZpbGUudHlwZS5zdGFydHNXaXRoKFwiaW1hZ2UvXCIpKTtcbiAgICBpZiAoZGlyZWN0KSB7XG4gICAgICByZXR1cm4gZGlyZWN0O1xuICAgIH1cblxuICAgIGNvbnN0IGl0ZW0gPSBBcnJheS5mcm9tKGV2dC5jbGlwYm9hcmREYXRhPy5pdGVtcyA/PyBbXSkuZmluZCgoZW50cnkpID0+IGVudHJ5LnR5cGUuc3RhcnRzV2l0aChcImltYWdlL1wiKSk7XG4gICAgcmV0dXJuIGl0ZW0/LmdldEFzRmlsZSgpID8/IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGh0bWxDb250YWluc1JlbW90ZUltYWdlcyhodG1sOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gLzxpbWdcXGJbXj5dKnNyYz1bXCInXWh0dHBzPzpcXC9cXC9bXlwiJ10rW1wiJ11bXj5dKj4vaS50ZXN0KGh0bWwpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVIdG1sUGFzdGVXaXRoUmVtb3RlSW1hZ2VzKG5vdGVGaWxlOiBURmlsZSwgZWRpdG9yOiBFZGl0b3IsIGh0bWw6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZW5kZXJlZCA9IGF3YWl0IHRoaXMuY29udmVydEh0bWxDbGlwYm9hcmRUb1NlY3VyZU1hcmtkb3duKGh0bWwsIG5vdGVGaWxlKTtcbiAgICAgIGlmICghcmVuZGVyZWQudHJpbSgpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgZWRpdG9yLnJlcGxhY2VTZWxlY3Rpb24ocmVuZGVyZWQpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdTVERjJcdTVDMDZcdTdGNTFcdTk4NzVcdTU2RkVcdTY1ODdcdTdDOThcdThEMzRcdTVFNzZcdTYyOTNcdTUzRDZcdThGRENcdTdBMEJcdTU2RkVcdTcyNDdcdTMwMDJcIiwgXCJQYXN0ZWQgd2ViIGNvbnRlbnQgYW5kIGNhcHR1cmVkIHJlbW90ZSBpbWFnZXMuXCIpKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBwYXN0ZSBIVE1MIGNvbnRlbnQgd2l0aCByZW1vdGUgaW1hZ2VzXCIsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgIHRoaXMuZGVzY3JpYmVFcnJvcihcbiAgICAgICAgICB0aGlzLnQoXCJcdTU5MDRcdTc0MDZcdTdGNTFcdTk4NzVcdTU2RkVcdTY1ODdcdTdDOThcdThEMzRcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gcHJvY2VzcyBwYXN0ZWQgd2ViIGNvbnRlbnRcIiksXG4gICAgICAgICAgZXJyb3IsXG4gICAgICAgICksXG4gICAgICAgIDgwMDAsXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY29udmVydEh0bWxDbGlwYm9hcmRUb1NlY3VyZU1hcmtkb3duKGh0bWw6IHN0cmluZywgbm90ZUZpbGU6IFRGaWxlKSB7XG4gICAgY29uc3QgcGFyc2VyID0gbmV3IERPTVBhcnNlcigpO1xuICAgIGNvbnN0IGRvY3VtZW50ID0gcGFyc2VyLnBhcnNlRnJvbVN0cmluZyhodG1sLCBcInRleHQvaHRtbFwiKTtcbiAgICBjb25zdCB1cGxvYWRDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgY29uc3QgcmVuZGVyZWRCbG9ja3M6IHN0cmluZ1tdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IG5vZGUgb2YgQXJyYXkuZnJvbShkb2N1bWVudC5ib2R5LmNoaWxkTm9kZXMpKSB7XG4gICAgICBjb25zdCBibG9jayA9IGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbE5vZGUobm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCAwKTtcbiAgICAgIGlmIChibG9jay50cmltKCkpIHtcbiAgICAgICAgcmVuZGVyZWRCbG9ja3MucHVzaChibG9jay50cmltKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZW5kZXJlZEJsb2Nrcy5qb2luKFwiXFxuXFxuXCIpICsgXCJcXG5cIjtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVuZGVyUGFzdGVkSHRtbE5vZGUoXG4gICAgbm9kZTogTm9kZSxcbiAgICBub3RlRmlsZTogVEZpbGUsXG4gICAgdXBsb2FkQ2FjaGU6IE1hcDxzdHJpbmcsIHN0cmluZz4sXG4gICAgbGlzdERlcHRoOiBudW1iZXIsXG4gICk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKSB7XG4gICAgICByZXR1cm4gdGhpcy5ub3JtYWxpemVDbGlwYm9hcmRUZXh0KG5vZGUudGV4dENvbnRlbnQgPz8gXCJcIik7XG4gICAgfVxuXG4gICAgaWYgKCEobm9kZSBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSkge1xuICAgICAgcmV0dXJuIFwiXCI7XG4gICAgfVxuXG4gICAgY29uc3QgdGFnID0gbm9kZS50YWdOYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKHRhZyA9PT0gXCJpbWdcIikge1xuICAgICAgY29uc3Qgc3JjID0gdGhpcy51bmVzY2FwZUh0bWwobm9kZS5nZXRBdHRyaWJ1dGUoXCJzcmNcIik/LnRyaW0oKSA/PyBcIlwiKTtcbiAgICAgIGlmICghdGhpcy5pc0h0dHBVcmwoc3JjKSkge1xuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgYWx0ID0gKG5vZGUuZ2V0QXR0cmlidXRlKFwiYWx0XCIpID8/IFwiXCIpLnRyaW0oKSB8fCB0aGlzLmdldERpc3BsYXlOYW1lRnJvbVVybChzcmMpO1xuICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRSZW1vdGVJbWFnZVVybChzcmMsIHVwbG9hZENhY2hlKTtcbiAgICAgIHJldHVybiB0aGlzLmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsLCBhbHQpO1xuICAgIH1cblxuICAgIGlmICh0YWcgPT09IFwiYnJcIikge1xuICAgICAgcmV0dXJuIFwiXFxuXCI7XG4gICAgfVxuXG4gICAgaWYgKHRhZyA9PT0gXCJ1bFwiIHx8IHRhZyA9PT0gXCJvbFwiKSB7XG4gICAgICBjb25zdCBpdGVtczogc3RyaW5nW10gPSBbXTtcbiAgICAgIGxldCBpbmRleCA9IDE7XG4gICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIEFycmF5LmZyb20obm9kZS5jaGlsZHJlbikpIHtcbiAgICAgICAgaWYgKGNoaWxkLnRhZ05hbWUudG9Mb3dlckNhc2UoKSAhPT0gXCJsaVwiKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZW5kZXJlZCA9IChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxOb2RlKGNoaWxkLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCArIDEpKS50cmltKCk7XG4gICAgICAgIGlmICghcmVuZGVyZWQpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHByZWZpeCA9IHRhZyA9PT0gXCJvbFwiID8gYCR7aW5kZXh9LiBgIDogXCItIFwiO1xuICAgICAgICBpdGVtcy5wdXNoKGAke1wiICBcIi5yZXBlYXQoTWF0aC5tYXgoMCwgbGlzdERlcHRoKSl9JHtwcmVmaXh9JHtyZW5kZXJlZH1gKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGl0ZW1zLmpvaW4oXCJcXG5cIik7XG4gICAgfVxuXG4gICAgaWYgKHRhZyA9PT0gXCJsaVwiKSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKTtcbiAgICAgIHJldHVybiBwYXJ0cy5qb2luKFwiXCIpLnRyaW0oKTtcbiAgICB9XG5cbiAgICBpZiAoL15oWzEtNl0kLy50ZXN0KHRhZykpIHtcbiAgICAgIGNvbnN0IGxldmVsID0gTnVtYmVyLnBhcnNlSW50KHRhZ1sxXSwgMTApO1xuICAgICAgY29uc3QgdGV4dCA9IChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIikudHJpbSgpO1xuICAgICAgcmV0dXJuIHRleHQgPyBgJHtcIiNcIi5yZXBlYXQobGV2ZWwpfSAke3RleHR9YCA6IFwiXCI7XG4gICAgfVxuXG4gICAgaWYgKHRhZyA9PT0gXCJhXCIpIHtcbiAgICAgIGNvbnN0IGhyZWYgPSBub2RlLmdldEF0dHJpYnV0ZShcImhyZWZcIik/LnRyaW0oKSA/PyBcIlwiO1xuICAgICAgY29uc3QgdGV4dCA9IChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIikudHJpbSgpO1xuICAgICAgaWYgKGhyZWYgJiYgL15odHRwcz86XFwvXFwvL2kudGVzdChocmVmKSAmJiB0ZXh0KSB7XG4gICAgICAgIHJldHVybiBgWyR7dGV4dH1dKCR7aHJlZn0pYDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0ZXh0O1xuICAgIH1cblxuICAgIGNvbnN0IGlubGluZVRhZ3MgPSBuZXcgU2V0KFtcInN0cm9uZ1wiLCBcImJcIiwgXCJlbVwiLCBcImlcIiwgXCJzcGFuXCIsIFwiY29kZVwiLCBcInNtYWxsXCIsIFwic3VwXCIsIFwic3ViXCJdKTtcbiAgICBpZiAoaW5saW5lVGFncy5oYXModGFnKSkge1xuICAgICAgcmV0dXJuIChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIik7XG4gICAgfVxuXG4gICAgY29uc3QgYmxvY2tUYWdzID0gbmV3IFNldChbXG4gICAgICBcInBcIixcbiAgICAgIFwiZGl2XCIsXG4gICAgICBcImFydGljbGVcIixcbiAgICAgIFwic2VjdGlvblwiLFxuICAgICAgXCJmaWd1cmVcIixcbiAgICAgIFwiZmlnY2FwdGlvblwiLFxuICAgICAgXCJibG9ja3F1b3RlXCIsXG4gICAgICBcInByZVwiLFxuICAgICAgXCJ0YWJsZVwiLFxuICAgICAgXCJ0aGVhZFwiLFxuICAgICAgXCJ0Ym9keVwiLFxuICAgICAgXCJ0clwiLFxuICAgICAgXCJ0ZFwiLFxuICAgICAgXCJ0aFwiLFxuICAgIF0pO1xuICAgIGlmIChibG9ja1RhZ3MuaGFzKHRhZykpIHtcbiAgICAgIGNvbnN0IHRleHQgPSAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpLnRyaW0oKTtcbiAgICAgIHJldHVybiB0ZXh0O1xuICAgIH1cblxuICAgIHJldHVybiAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4oXG4gICAgZWxlbWVudDogSFRNTEVsZW1lbnQsXG4gICAgbm90ZUZpbGU6IFRGaWxlLFxuICAgIHVwbG9hZENhY2hlOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuICAgIGxpc3REZXB0aDogbnVtYmVyLFxuICApIHtcbiAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIEFycmF5LmZyb20oZWxlbWVudC5jaGlsZE5vZGVzKSkge1xuICAgICAgY29uc3QgcmVuZGVyZWQgPSBhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxOb2RlKGNoaWxkLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCk7XG4gICAgICBpZiAoIXJlbmRlcmVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAocGFydHMubGVuZ3RoID4gMCAmJiAhcmVuZGVyZWQuc3RhcnRzV2l0aChcIlxcblwiKSAmJiAhcGFydHNbcGFydHMubGVuZ3RoIC0gMV0uZW5kc1dpdGgoXCJcXG5cIikpIHtcbiAgICAgICAgY29uc3QgcHJldmlvdXMgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXTtcbiAgICAgICAgY29uc3QgbmVlZHNTcGFjZSA9IC9cXFMkLy50ZXN0KHByZXZpb3VzKSAmJiAvXlxcUy8udGVzdChyZW5kZXJlZCk7XG4gICAgICAgIGlmIChuZWVkc1NwYWNlKSB7XG4gICAgICAgICAgcGFydHMucHVzaChcIiBcIik7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcGFydHMucHVzaChyZW5kZXJlZCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhcnRzO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVDbGlwYm9hcmRUZXh0KHZhbHVlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdmFsdWUucmVwbGFjZSgvXFxzKy9nLCBcIiBcIik7XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RJbWFnZUZpbGVGcm9tRHJvcChldnQ6IERyYWdFdmVudCkge1xuICAgIHJldHVybiBBcnJheS5mcm9tKGV2dC5kYXRhVHJhbnNmZXI/LmZpbGVzID8/IFtdKS5maW5kKChmaWxlKSA9PiBmaWxlLnR5cGUuc3RhcnRzV2l0aChcImltYWdlL1wiKSkgPz8gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZW5xdWV1ZUVkaXRvckltYWdlVXBsb2FkKG5vdGVGaWxlOiBURmlsZSwgZWRpdG9yOiBFZGl0b3IsIGltYWdlRmlsZTogRmlsZSwgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBhcnJheUJ1ZmZlciA9IGF3YWl0IGltYWdlRmlsZS5hcnJheUJ1ZmZlcigpO1xuICAgICAgY29uc3QgdGFzayA9IHRoaXMuY3JlYXRlVXBsb2FkVGFzayhcbiAgICAgICAgbm90ZUZpbGUucGF0aCxcbiAgICAgICAgYXJyYXlCdWZmZXIsXG4gICAgICAgIGltYWdlRmlsZS50eXBlIHx8IHRoaXMuZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUoZmlsZU5hbWUpLFxuICAgICAgICBmaWxlTmFtZSxcbiAgICAgICk7XG4gICAgICB0aGlzLmluc2VydFBsYWNlaG9sZGVyKGVkaXRvciwgdGFzay5wbGFjZWhvbGRlcik7XG4gICAgICB0aGlzLnF1ZXVlLnB1c2godGFzayk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgdm9pZCB0aGlzLnByb2Nlc3NQZW5kaW5nVGFza3MoKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1REYyXHU1MkEwXHU1MTY1XHU1NkZFXHU3MjQ3XHU4MUVBXHU1MkE4XHU0RTBBXHU0RjIwXHU5NjFGXHU1MjE3XHUzMDAyXCIsIFwiSW1hZ2UgYWRkZWQgdG8gdGhlIGF1dG8tdXBsb2FkIHF1ZXVlLlwiKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcXVldWUgc2VjdXJlIGltYWdlIHVwbG9hZFwiLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTUyQTBcdTUxNjVcdTU2RkVcdTcyNDdcdTgxRUFcdTUyQThcdTRFMEFcdTRGMjBcdTk2MUZcdTUyMTdcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gcXVldWUgaW1hZ2UgZm9yIGF1dG8tdXBsb2FkXCIpLCBlcnJvciksIDgwMDApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlVXBsb2FkVGFzayhub3RlUGF0aDogc3RyaW5nLCBiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKTogVXBsb2FkVGFzayB7XG4gICAgY29uc3QgaWQgPSBgc2VjdXJlLXdlYmRhdi10YXNrLSR7RGF0ZS5ub3coKX0tJHtNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLCA4KX1gO1xuICAgIHJldHVybiB7XG4gICAgICBpZCxcbiAgICAgIG5vdGVQYXRoLFxuICAgICAgcGxhY2Vob2xkZXI6IHRoaXMuYnVpbGRQZW5kaW5nUGxhY2Vob2xkZXIoaWQsIGZpbGVOYW1lKSxcbiAgICAgIG1pbWVUeXBlLFxuICAgICAgZmlsZU5hbWUsXG4gICAgICBkYXRhQmFzZTY0OiB0aGlzLmFycmF5QnVmZmVyVG9CYXNlNjQoYmluYXJ5KSxcbiAgICAgIGF0dGVtcHRzOiAwLFxuICAgICAgY3JlYXRlZEF0OiBEYXRlLm5vdygpLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkUGVuZGluZ1BsYWNlaG9sZGVyKHRhc2tJZDogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3Qgc2FmZU5hbWUgPSB0aGlzLmVzY2FwZUh0bWwoZmlsZU5hbWUpO1xuICAgIHJldHVybiBgPHNwYW4gY2xhc3M9XCJzZWN1cmUtd2ViZGF2LXBlbmRpbmdcIiBkYXRhLXNlY3VyZS13ZWJkYXYtdGFzaz1cIiR7dGFza0lkfVwiIGFyaWEtbGFiZWw9XCIke3NhZmVOYW1lfVwiPiR7dGhpcy5lc2NhcGVIdG1sKHRoaXMudChgXHUzMDEwXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU0RTJEXHVGRjVDJHtmaWxlTmFtZX1cdTMwMTFgLCBgW1VwbG9hZGluZyBpbWFnZSB8ICR7ZmlsZU5hbWV9XWApKX08L3NwYW4+YDtcbiAgfVxuXG4gIHByaXZhdGUgaW5zZXJ0UGxhY2Vob2xkZXIoZWRpdG9yOiBFZGl0b3IsIHBsYWNlaG9sZGVyOiBzdHJpbmcpIHtcbiAgICBlZGl0b3IucmVwbGFjZVNlbGVjdGlvbihgJHtwbGFjZWhvbGRlcn1cXG5gKTtcbiAgfVxuXG4gIGFzeW5jIHN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50KHNob3dOb3RpY2UgPSB0cnVlKSB7XG4gICAgaWYgKHRoaXMuc3luY0luUHJvZ3Jlc3MpIHtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1NDBDXHU2QjY1XHU2QjYzXHU1NzI4XHU4RkRCXHU4ODRDXHU0RTJEXHUzMDAyXCIsIFwiQSBzeW5jIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MuXCIpLCA0MDAwKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnN5bmNJblByb2dyZXNzID0gdHJ1ZTtcbiAgICB0cnkge1xuICAgICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG4gICAgICBhd2FpdCB0aGlzLnJlYnVpbGRSZWZlcmVuY2VJbmRleCgpO1xuXG4gICAgICBjb25zdCByZW1vdGVJbnZlbnRvcnkgPSBhd2FpdCB0aGlzLmxpc3RSZW1vdGVUcmVlKHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKTtcbiAgICAgIGNvbnN0IHJlbW90ZUZpbGVzID0gcmVtb3RlSW52ZW50b3J5LmZpbGVzO1xuICAgICAgbGV0IHJlc3RvcmVkRnJvbVJlbW90ZSA9IDA7XG4gICAgICBsZXQgZGVsZXRlZFJlbW90ZUZpbGVzID0gMDtcbiAgICAgIGxldCBkZWxldGVkTG9jYWxGaWxlcyA9IDA7XG4gICAgICBsZXQgZGVsZXRlZExvY2FsU3R1YnMgPSAwO1xuXG4gICAgICBsZXQgZmlsZXMgPSB0aGlzLmNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpO1xuICAgICAgbGV0IGN1cnJlbnRQYXRocyA9IG5ldyBTZXQoZmlsZXMubWFwKChmaWxlKSA9PiBmaWxlLnBhdGgpKTtcbiAgICAgIGZvciAoY29uc3QgcGF0aCBvZiBbLi4udGhpcy5zeW5jSW5kZXgua2V5cygpXSkge1xuICAgICAgICBpZiAoIWN1cnJlbnRQYXRocy5oYXMocGF0aCkpIHtcbiAgICAgICAgICBjb25zdCBwcmV2aW91cyA9IHRoaXMuc3luY0luZGV4LmdldChwYXRoKTtcbiAgICAgICAgICBpZiAoIXByZXZpb3VzKSB7XG4gICAgICAgICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUocGF0aCk7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCByZW1vdGUgPSByZW1vdGVGaWxlcy5nZXQocHJldmlvdXMucmVtb3RlUGF0aCk7XG4gICAgICAgICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShwYXRoKTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChwcmV2aW91cy5yZW1vdGVTaWduYXR1cmUgJiYgcHJldmlvdXMucmVtb3RlU2lnbmF0dXJlICE9PSByZW1vdGUuc2lnbmF0dXJlKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQocGF0aCwgcmVtb3RlKTtcbiAgICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChwYXRoLCB7XG4gICAgICAgICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgICAgIHJlbW90ZVBhdGg6IHJlbW90ZS5yZW1vdGVQYXRoLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXN0b3JlZEZyb21SZW1vdGUgKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlQ29udGVudEZpbGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICAgIHJlbW90ZUZpbGVzLmRlbGV0ZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKHBhdGgpO1xuICAgICAgICAgIGRlbGV0ZWRSZW1vdGVGaWxlcyArPSAxO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGxldCB1cGxvYWRlZCA9IDA7XG4gICAgICBsZXQgc2tpcHBlZCA9IDA7XG4gICAgICBsZXQgbWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzID0gMDtcblxuICAgICAgZmlsZXMgPSB0aGlzLmNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpO1xuICAgICAgY3VycmVudFBhdGhzID0gbmV3IFNldChmaWxlcy5tYXAoKGZpbGUpID0+IGZpbGUucGF0aCkpO1xuICAgICAgZm9yIChjb25zdCByZW1vdGUgb2YgWy4uLnJlbW90ZUZpbGVzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLnJlbW90ZVBhdGgubG9jYWxlQ29tcGFyZShiLnJlbW90ZVBhdGgpKSkge1xuICAgICAgICBjb25zdCB2YXVsdFBhdGggPSB0aGlzLnJlbW90ZVBhdGhUb1ZhdWx0UGF0aChyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgIGlmICghdmF1bHRQYXRoIHx8IGN1cnJlbnRQYXRocy5oYXModmF1bHRQYXRoKSkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KHZhdWx0UGF0aCwgcmVtb3RlKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KHZhdWx0UGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVQYXRoOiByZW1vdGUucmVtb3RlUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlc3RvcmVkRnJvbVJlbW90ZSArPSAxO1xuICAgICAgfVxuXG4gICAgICBmaWxlcyA9IHRoaXMuY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCk7XG4gICAgICBjdXJyZW50UGF0aHMgPSBuZXcgU2V0KGZpbGVzLm1hcCgoZmlsZSkgPT4gZmlsZS5wYXRoKSk7XG4gICAgICBjb25zdCBsb2NhbFJlbW90ZVBhdGhzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgICBsZXQgZG93bmxvYWRlZE9yVXBkYXRlZCA9IDA7XG4gICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgIGxvY2FsUmVtb3RlUGF0aHMuYWRkKHJlbW90ZVBhdGgpO1xuICAgICAgICBjb25zdCByZW1vdGUgPSByZW1vdGVGaWxlcy5nZXQocmVtb3RlUGF0aCk7XG4gICAgICAgIGNvbnN0IHJlbW90ZVNpZ25hdHVyZSA9IHJlbW90ZT8uc2lnbmF0dXJlID8/IFwiXCI7XG4gICAgICAgIGNvbnN0IGxvY2FsU2lnbmF0dXJlID0gdGhpcy5idWlsZFN5bmNTaWduYXR1cmUoZmlsZSk7XG4gICAgICAgIGNvbnN0IHByZXZpb3VzID0gdGhpcy5zeW5jSW5kZXguZ2V0KGZpbGUucGF0aCk7XG5cbiAgICAgICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgICAgICBjb25zdCBzdHViID0gdGhpcy5wYXJzZU5vdGVTdHViKGNvbnRlbnQpO1xuICAgICAgICAgIGlmIChzdHViKSB7XG4gICAgICAgICAgICBjb25zdCBzdHViUmVtb3RlID0gcmVtb3RlRmlsZXMuZ2V0KHN0dWIucmVtb3RlUGF0aCk7XG4gICAgICAgICAgICBpZiAoIXN0dWJSZW1vdGUpIHtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5yZW1vdmVMb2NhbFZhdWx0RmlsZShmaWxlKTtcbiAgICAgICAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICAgICAgICAgIGRlbGV0ZWRMb2NhbEZpbGVzICs9IDE7XG4gICAgICAgICAgICAgIGRlbGV0ZWRMb2NhbFN0dWJzICs9IDE7XG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiBzdHViUmVtb3RlPy5zaWduYXR1cmUgPz8gcHJldmlvdXM/LnJlbW90ZVNpZ25hdHVyZSA/PyBcIlwiLFxuICAgICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBza2lwcGVkICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgICAgIGlmIChwcmV2aW91cyAmJiB0aGlzLnNob3VsZERlbGV0ZUxvY2FsV2hlblJlbW90ZU1pc3NpbmcoZmlsZSwgcHJldmlvdXMpKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGUpO1xuICAgICAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICAgICAgICBkZWxldGVkTG9jYWxGaWxlcyArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmVtb3RlRmlsZXMuc2V0KHJlbW90ZVBhdGgsIHVwbG9hZGVkUmVtb3RlKTtcbiAgICAgICAgICB1cGxvYWRlZCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFwcmV2aW91cykge1xuICAgICAgICAgIGlmIChsb2NhbFNpZ25hdHVyZSA9PT0gcmVtb3RlU2lnbmF0dXJlKSB7XG4gICAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICAgICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNraXBwZWQgKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICh0aGlzLnNob3VsZERvd25sb2FkUmVtb3RlVmVyc2lvbihmaWxlLnN0YXQubXRpbWUsIHJlbW90ZS5sYXN0TW9kaWZpZWQpKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgICAgICAgICAgY29uc3QgcmVmcmVzaGVkID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IHRoaXMuYnVpbGRTeW5jU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgZG93bmxvYWRlZE9yVXBkYXRlZCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmVtb3RlRmlsZXMuc2V0KHJlbW90ZVBhdGgsIHVwbG9hZGVkUmVtb3RlKTtcbiAgICAgICAgICB1cGxvYWRlZCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbG9jYWxDaGFuZ2VkID0gcHJldmlvdXMubG9jYWxTaWduYXR1cmUgIT09IGxvY2FsU2lnbmF0dXJlIHx8IHByZXZpb3VzLnJlbW90ZVBhdGggIT09IHJlbW90ZVBhdGg7XG4gICAgICAgIGNvbnN0IHJlbW90ZUNoYW5nZWQgPSBwcmV2aW91cy5yZW1vdGVTaWduYXR1cmUgIT09IHJlbW90ZVNpZ25hdHVyZSB8fCBwcmV2aW91cy5yZW1vdGVQYXRoICE9PSByZW1vdGVQYXRoO1xuICAgICAgICBpZiAoIWxvY2FsQ2hhbmdlZCAmJiAhcmVtb3RlQ2hhbmdlZCkge1xuICAgICAgICAgIHNraXBwZWQgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghbG9jYWxDaGFuZ2VkICYmIHJlbW90ZUNoYW5nZWQpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgICAgICAgIGNvbnN0IHJlZnJlc2hlZCA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IHRoaXMuYnVpbGRTeW5jU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGRvd25sb2FkZWRPclVwZGF0ZWQgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChsb2NhbENoYW5nZWQgJiYgIXJlbW90ZUNoYW5nZWQpIHtcbiAgICAgICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoKTtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZW1vdGVGaWxlcy5zZXQocmVtb3RlUGF0aCwgdXBsb2FkZWRSZW1vdGUpO1xuICAgICAgICAgIHVwbG9hZGVkICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5zaG91bGREb3dubG9hZFJlbW90ZVZlcnNpb24oZmlsZS5zdGF0Lm10aW1lLCByZW1vdGUubGFzdE1vZGlmaWVkKSkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuZG93bmxvYWRSZW1vdGVGaWxlVG9WYXVsdChmaWxlLnBhdGgsIHJlbW90ZSwgZmlsZSk7XG4gICAgICAgICAgY29uc3QgcmVmcmVzaGVkID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVmcmVzaGVkID8gdGhpcy5idWlsZFN5bmNTaWduYXR1cmUocmVmcmVzaGVkKSA6IHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgZG93bmxvYWRlZE9yVXBkYXRlZCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCk7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICB9KTtcbiAgICAgICAgcmVtb3RlRmlsZXMuc2V0KHJlbW90ZVBhdGgsIHVwbG9hZGVkUmVtb3RlKTtcbiAgICAgICAgdXBsb2FkZWQgKz0gMTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzID0gYXdhaXQgdGhpcy5kZWxldGVFeHRyYVJlbW90ZURpcmVjdG9yaWVzKFxuICAgICAgICByZW1vdGVJbnZlbnRvcnkuZGlyZWN0b3JpZXMsXG4gICAgICAgIHRoaXMuYnVpbGRFeHBlY3RlZFJlbW90ZURpcmVjdG9yaWVzKGxvY2FsUmVtb3RlUGF0aHMsIHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKSxcbiAgICAgICk7XG4gICAgICBjb25zdCBpbWFnZUNsZWFudXAgPSBhd2FpdCB0aGlzLnJlY29uY2lsZVJlbW90ZUltYWdlcygpO1xuICAgICAgY29uc3QgZXZpY3RlZE5vdGVzID0gYXdhaXQgdGhpcy5ldmljdFN0YWxlU3luY2VkTm90ZXMoZmFsc2UpO1xuXG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLnQoXG4gICAgICAgIGBcdTVERjJcdTUzQ0NcdTU0MTFcdTU0MENcdTZCNjVcdUZGMUFcdTRFMEFcdTRGMjAgJHt1cGxvYWRlZH0gXHU0RTJBXHU2NTg3XHU0RUY2XHVGRjBDXHU0RUNFXHU4RkRDXHU3QUVGXHU2MkM5XHU1M0Q2ICR7cmVzdG9yZWRGcm9tUmVtb3RlICsgZG93bmxvYWRlZE9yVXBkYXRlZH0gXHU0RTJBXHU2NTg3XHU0RUY2XHVGRjBDXHU4REYzXHU4RkM3ICR7c2tpcHBlZH0gXHU0RTJBXHU2NzJBXHU1M0Q4XHU1MzE2XHU2NTg3XHU0RUY2XHVGRjBDXHU1MjIwXHU5NjY0XHU4RkRDXHU3QUVGXHU1MTg1XHU1QkI5ICR7ZGVsZXRlZFJlbW90ZUZpbGVzfSBcdTRFMkFcdTMwMDFcdTY3MkNcdTU3MzBcdTUxODVcdTVCQjkgJHtkZWxldGVkTG9jYWxGaWxlc30gXHU0RTJBJHtkZWxldGVkTG9jYWxTdHVicyA+IDAgPyBgXHVGRjA4XHU1MTc2XHU0RTJEXHU1OTMxXHU2NTQ4XHU1MzYwXHU0RjREXHU3QjE0XHU4QkIwICR7ZGVsZXRlZExvY2FsU3R1YnN9IFx1N0JDN1x1RkYwOWAgOiBcIlwifVx1RkYwQ1x1NkUwNVx1NzQwNlx1OEZEQ1x1N0FFRlx1N0E3QVx1NzZFRVx1NUY1NSAke2RlbGV0ZWRSZW1vdGVEaXJlY3Rvcmllc30gXHU0RTJBXHVGRjBDXHU2RTA1XHU3NDA2XHU1MTk3XHU0RjU5XHU1NkZFXHU3MjQ3ICR7aW1hZ2VDbGVhbnVwLmRlbGV0ZWRGaWxlc30gXHU1RjIwXHUzMDAxXHU3NkVFXHU1RjU1ICR7aW1hZ2VDbGVhbnVwLmRlbGV0ZWREaXJlY3Rvcmllc30gXHU0RTJBJHtldmljdGVkTm90ZXMgPiAwID8gYFx1RkYwQ1x1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1NjVFN1x1N0IxNFx1OEJCMCAke2V2aWN0ZWROb3Rlc30gXHU3QkM3YCA6IFwiXCJ9JHttaXNzaW5nUmVtb3RlQmFja2VkTm90ZXMgPiAwID8gYFx1RkYwQ1x1NUU3Nlx1NTNEMVx1NzNCMCAke21pc3NpbmdSZW1vdGVCYWNrZWROb3Rlc30gXHU3QkM3XHU2MzA5XHU5NzAwXHU3QjE0XHU4QkIwXHU3RjNBXHU1QzExXHU4RkRDXHU3QUVGXHU2QjYzXHU2NTg3YCA6IFwiXCJ9XHUzMDAyYCxcbiAgICAgICAgYEJpZGlyZWN0aW9uYWwgc3luYyB1cGxvYWRlZCAke3VwbG9hZGVkfSBmaWxlKHMpLCBwdWxsZWQgJHtyZXN0b3JlZEZyb21SZW1vdGUgKyBkb3dubG9hZGVkT3JVcGRhdGVkfSBmaWxlKHMpIGZyb20gcmVtb3RlLCBza2lwcGVkICR7c2tpcHBlZH0gdW5jaGFuZ2VkIGZpbGUocyksIGRlbGV0ZWQgJHtkZWxldGVkUmVtb3RlRmlsZXN9IHJlbW90ZSBjb250ZW50IGZpbGUocykgYW5kICR7ZGVsZXRlZExvY2FsRmlsZXN9IGxvY2FsIGZpbGUocykke2RlbGV0ZWRMb2NhbFN0dWJzID4gMCA/IGAgKGluY2x1ZGluZyAke2RlbGV0ZWRMb2NhbFN0dWJzfSBzdGFsZSBzdHViIG5vdGUocykpYCA6IFwiXCJ9LCByZW1vdmVkICR7ZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzfSByZW1vdGUgZGlyZWN0b3Ike2RlbGV0ZWRSZW1vdGVEaXJlY3RvcmllcyA9PT0gMSA/IFwieVwiIDogXCJpZXNcIn0sIGNsZWFuZWQgJHtpbWFnZUNsZWFudXAuZGVsZXRlZEZpbGVzfSBvcnBoYW5lZCByZW1vdGUgaW1hZ2UocykgcGx1cyAke2ltYWdlQ2xlYW51cC5kZWxldGVkRGlyZWN0b3JpZXN9IGRpcmVjdG9yJHtpbWFnZUNsZWFudXAuZGVsZXRlZERpcmVjdG9yaWVzID09PSAxID8gXCJ5XCIgOiBcImllc1wifSR7ZXZpY3RlZE5vdGVzID4gMCA/IGAsIGFuZCBldmljdGVkICR7ZXZpY3RlZE5vdGVzfSBzdGFsZSBsb2NhbCBub3RlKHMpYCA6IFwiXCJ9JHttaXNzaW5nUmVtb3RlQmFja2VkTm90ZXMgPiAwID8gYCwgd2hpbGUgZGV0ZWN0aW5nICR7bWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzfSBsYXp5IG5vdGUocykgbWlzc2luZyB0aGVpciByZW1vdGUgY29udGVudGAgOiBcIlwifS5gLFxuICAgICAgKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cywgODAwMCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJWYXVsdCBjb250ZW50IHN5bmMgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gRGF0ZS5ub3coKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9IHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTUxODVcdTVCQjlcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIiwgXCJDb250ZW50IHN5bmMgZmFpbGVkXCIpLCBlcnJvcik7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsIDgwMDApO1xuICAgICAgfVxuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLnN5bmNJblByb2dyZXNzID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICAgIG1ldGhvZDogXCJERUxFVEVcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gNDA0ICYmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBERUxFVEUgZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGRlbGV0ZSByZW1vdGUgc3luY2VkIGNvbnRlbnRcIiwgcmVtb3RlUGF0aCwgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBidWlsZFJlbW90ZVN5bmNTaWduYXR1cmUocmVtb3RlOiBQaWNrPFJlbW90ZUZpbGVTdGF0ZSwgXCJsYXN0TW9kaWZpZWRcIiB8IFwic2l6ZVwiPikge1xuICAgIHJldHVybiBgJHtyZW1vdGUubGFzdE1vZGlmaWVkfToke3JlbW90ZS5zaXplfWA7XG4gIH1cblxuICBwcml2YXRlIHJlbW90ZVBhdGhUb1ZhdWx0UGF0aChyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCByb290ID0gdGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpO1xuICAgIGlmICghcmVtb3RlUGF0aC5zdGFydHNXaXRoKHJvb3QpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVtb3RlUGF0aC5zbGljZShyb290Lmxlbmd0aCkucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgc2hvdWxkRG93bmxvYWRSZW1vdGVWZXJzaW9uKGxvY2FsTXRpbWU6IG51bWJlciwgcmVtb3RlTXRpbWU6IG51bWJlcikge1xuICAgIHJldHVybiByZW1vdGVNdGltZSA+IGxvY2FsTXRpbWUgKyAyMDAwO1xuICB9XG5cbiAgcHJpdmF0ZSBwYXJzZVN5bmNTaWduYXR1cmUoc2lnbmF0dXJlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBbbXRpbWVUZXh0LCBzaXplVGV4dF0gPSBzaWduYXR1cmUuc3BsaXQoXCI6XCIpO1xuICAgIGNvbnN0IG10aW1lID0gTnVtYmVyLnBhcnNlSW50KG10aW1lVGV4dCA/PyBcIlwiLCAxMCk7XG4gICAgY29uc3Qgc2l6ZSA9IE51bWJlci5wYXJzZUludChzaXplVGV4dCA/PyBcIlwiLCAxMCk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobXRpbWUpIHx8ICFOdW1iZXIuaXNGaW5pdGUoc2l6ZSkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiB7IG10aW1lLCBzaXplIH07XG4gIH1cblxuICBwcml2YXRlIHNob3VsZERlbGV0ZUxvY2FsV2hlblJlbW90ZU1pc3NpbmcoZmlsZTogVEZpbGUsIHByZXZpb3VzOiBTeW5jSW5kZXhFbnRyeSkge1xuICAgIGlmICghcHJldmlvdXMucmVtb3RlU2lnbmF0dXJlKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgY3VycmVudFNpZ25hdHVyZSA9IHRoaXMuYnVpbGRTeW5jU2lnbmF0dXJlKGZpbGUpO1xuICAgIGlmIChwcmV2aW91cy5sb2NhbFNpZ25hdHVyZSA9PT0gY3VycmVudFNpZ25hdHVyZSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgY29uc3QgcHJldmlvdXNMb2NhbCA9IHRoaXMucGFyc2VTeW5jU2lnbmF0dXJlKHByZXZpb3VzLmxvY2FsU2lnbmF0dXJlKTtcbiAgICBjb25zdCBncmFjZU1zID0gNTAwMDtcbiAgICBpZiAocHJldmlvdXNMb2NhbCAmJiBmaWxlLnN0YXQuc2l6ZSA9PT0gcHJldmlvdXNMb2NhbC5zaXplKSB7XG4gICAgICBjb25zdCBiYXNlbGluZSA9IE1hdGgubWF4KHByZXZpb3VzTG9jYWwubXRpbWUsIHRoaXMubGFzdFZhdWx0U3luY0F0IHx8IDApO1xuICAgICAgaWYgKGZpbGUuc3RhdC5tdGltZSA8PSBiYXNlbGluZSArIGdyYWNlTXMpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRoaXMubGFzdFZhdWx0U3luY0F0ID4gMCAmJiBmaWxlLnN0YXQubXRpbWUgPD0gdGhpcy5sYXN0VmF1bHRTeW5jQXQgKyBncmFjZU1zKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBwcml2YXRlIGdldFZhdWx0RmlsZUJ5UGF0aChwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHBhdGgpO1xuICAgIHJldHVybiBmaWxlIGluc3RhbmNlb2YgVEZpbGUgPyBmaWxlIDogbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVtb3ZlTG9jYWxWYXVsdEZpbGUoZmlsZTogVEZpbGUpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuZGVsZXRlKGZpbGUsIHRydWUpO1xuICAgIH0gY2F0Y2ggKGRlbGV0ZUVycm9yKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC50cmFzaChmaWxlLCB0cnVlKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICB0aHJvdyBkZWxldGVFcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGVuc3VyZUxvY2FsUGFyZW50Rm9sZGVycyhwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGF0aChwYXRoKTtcbiAgICBjb25zdCBzZWdtZW50cyA9IG5vcm1hbGl6ZWQuc3BsaXQoXCIvXCIpLmZpbHRlcigodmFsdWUpID0+IHZhbHVlLmxlbmd0aCA+IDApO1xuICAgIGlmIChzZWdtZW50cy5sZW5ndGggPD0gMSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBjdXJyZW50ID0gXCJcIjtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgc2VnbWVudHMubGVuZ3RoIC0gMTsgaW5kZXggKz0gMSkge1xuICAgICAgY3VycmVudCA9IGN1cnJlbnQgPyBgJHtjdXJyZW50fS8ke3NlZ21lbnRzW2luZGV4XX1gIDogc2VnbWVudHNbaW5kZXhdO1xuICAgICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoY3VycmVudCk7XG4gICAgICBpZiAoIWV4aXN0aW5nKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZUZvbGRlcihjdXJyZW50KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQodmF1bHRQYXRoOiBzdHJpbmcsIHJlbW90ZTogUmVtb3RlRmlsZVN0YXRlLCBleGlzdGluZ0ZpbGU/OiBURmlsZSkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGUucmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEdFVCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5lbnN1cmVMb2NhbFBhcmVudEZvbGRlcnModmF1bHRQYXRoKTtcbiAgICBjb25zdCBjdXJyZW50ID0gZXhpc3RpbmdGaWxlID8/IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKHZhdWx0UGF0aCk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgIG10aW1lOiByZW1vdGUubGFzdE1vZGlmaWVkID4gMCA/IHJlbW90ZS5sYXN0TW9kaWZpZWQgOiBEYXRlLm5vdygpLFxuICAgIH07XG4gICAgaWYgKCFjdXJyZW50KSB7XG4gICAgICBpZiAodmF1bHRQYXRoLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoXCIubWRcIikpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKHZhdWx0UGF0aCwgdGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKSwgb3B0aW9ucyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVCaW5hcnkodmF1bHRQYXRoLCByZXNwb25zZS5hcnJheUJ1ZmZlciwgb3B0aW9ucyk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGN1cnJlbnQuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShjdXJyZW50LCB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpLCBvcHRpb25zKTtcbiAgICB9IGVsc2Uge1xuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5QmluYXJ5KGN1cnJlbnQsIHJlc3BvbnNlLmFycmF5QnVmZmVyLCBvcHRpb25zKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHN0YXRSZW1vdGVGaWxlKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJQUk9QRklORFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICBEZXB0aDogXCIwXCIsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gNDA0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgUFJPUEZJTkQgZmFpbGVkIGZvciAke3JlbW90ZVBhdGh9IHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIH1cblxuICAgIGNvbnN0IHhtbFRleHQgPSB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpO1xuICAgIGNvbnN0IGVudHJpZXMgPSB0aGlzLnBhcnNlUHJvcGZpbmREaXJlY3RvcnlMaXN0aW5nKHhtbFRleHQsIHJlbW90ZVBhdGgsIHRydWUpO1xuICAgIHJldHVybiBlbnRyaWVzLmZpbmQoKGVudHJ5KSA9PiAhZW50cnkuaXNDb2xsZWN0aW9uKT8uZmlsZSA/PyBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRDb250ZW50RmlsZVRvUmVtb3RlKGZpbGU6IFRGaWxlLCByZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBiaW5hcnkgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KHJlbW90ZVBhdGgsIGJpbmFyeSwgdGhpcy5nZXRNaW1lVHlwZShmaWxlLmV4dGVuc2lvbikpO1xuICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuc3RhdFJlbW90ZUZpbGUocmVtb3RlUGF0aCk7XG4gICAgaWYgKHJlbW90ZSkge1xuICAgICAgcmV0dXJuIHJlbW90ZTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIGxhc3RNb2RpZmllZDogZmlsZS5zdGF0Lm10aW1lLFxuICAgICAgc2l6ZTogZmlsZS5zdGF0LnNpemUsXG4gICAgICBzaWduYXR1cmU6IHRoaXMuYnVpbGRTeW5jU2lnbmF0dXJlKGZpbGUpLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZVJlbW90ZVN5bmNlZEVudHJ5KHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLnN5bmNJbmRleC5nZXQodmF1bHRQYXRoKTtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gZXhpc3Rpbmc/LnJlbW90ZVBhdGggPz8gdGhpcy5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgodmF1bHRQYXRoKTtcbiAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZVBhdGgpO1xuICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZSh2YXVsdFBhdGgpO1xuICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUZpbGVPcGVuKGZpbGU6IFRGaWxlIHwgbnVsbCkge1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkgfHwgZmlsZS5leHRlbnNpb24gIT09IFwibWRcIikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMuc2V0KGZpbGUucGF0aCwgRGF0ZS5ub3coKSk7XG4gICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcblxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IHN0dWIgPSB0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCk7XG4gICAgaWYgKCFzdHViKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuc3RhdFJlbW90ZUZpbGUoc3R1Yi5yZW1vdGVQYXRoKTtcbiAgICAgIGlmICghcmVtb3RlKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucmVtb3ZlTG9jYWxWYXVsdEZpbGUoZmlsZSk7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgICBuZXcgTm90aWNlKFxuICAgICAgICAgIHRoaXMudChcbiAgICAgICAgICAgIGBcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTRFMERcdTVCNThcdTU3MjhcdUZGMENcdTVERjJcdTc5RkJcdTk2NjRcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICAgICAgIGBSZW1vdGUgbm90ZSBtaXNzaW5nLCByZW1vdmVkIGxvY2FsIHBsYWNlaG9sZGVyOiAke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICAgICApLFxuICAgICAgICAgIDYwMDAsXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KGZpbGUucGF0aCwgcmVtb3RlLCBmaWxlKTtcbiAgICAgIGNvbnN0IHJlZnJlc2hlZCA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKGZpbGUucGF0aCk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZWZyZXNoZWQgPyB0aGlzLmJ1aWxkU3luY1NpZ25hdHVyZShyZWZyZXNoZWQpIDogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICByZW1vdGVQYXRoOiBzdHViLnJlbW90ZVBhdGgsXG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICBuZXcgTm90aWNlKHRoaXMudChgXHU1REYyXHU0RUNFXHU4RkRDXHU3QUVGXHU2MDYyXHU1OTBEXHU3QjE0XHU4QkIwXHVGRjFBJHtmaWxlLmJhc2VuYW1lfWAsIGBSZXN0b3JlZCBub3RlIGZyb20gcmVtb3RlOiAke2ZpbGUuYmFzZW5hbWV9YCksIDYwMDApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGh5ZHJhdGUgbm90ZSBmcm9tIHJlbW90ZVwiLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdThGRENcdTdBRUZcdTYwNjJcdTU5MERcdTdCMTRcdThCQjBcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gcmVzdG9yZSBub3RlIGZyb20gcmVtb3RlXCIpLCBlcnJvciksIDgwMDApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IG5vcm1hbGl6ZVBhdGgocGF0aCk7XG4gICAgaWYgKG5vcm1hbGl6ZWRQYXRoID09PSBcIi5vYnNpZGlhblwiIHx8IG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIub2JzaWRpYW4vXCIpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICBub3JtYWxpemVkUGF0aCA9PT0gXCIub2JzaWRpYW4vcGx1Z2lucy9zZWN1cmUtd2ViZGF2LWltYWdlc1wiIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwiLm9ic2lkaWFuL3BsdWdpbnMvc2VjdXJlLXdlYmRhdi1pbWFnZXMvXCIpXG4gICAgKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gL1xcLihwbmd8anBlP2d8Z2lmfHdlYnB8Ym1wfHN2ZykkL2kudGVzdChub3JtYWxpemVkUGF0aCk7XG4gIH1cblxuICBwcml2YXRlIGNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpIHtcbiAgICByZXR1cm4gdGhpcy5hcHAudmF1bHRcbiAgICAgIC5nZXRGaWxlcygpXG4gICAgICAuZmlsdGVyKChmaWxlKSA9PiAhdGhpcy5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKGZpbGUucGF0aCkpXG4gICAgICAuc29ydCgoYSwgYikgPT4gYS5wYXRoLmxvY2FsZUNvbXBhcmUoYi5wYXRoKSk7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkU3luY1NpZ25hdHVyZShmaWxlOiBURmlsZSkge1xuICAgIHJldHVybiBgJHtmaWxlLnN0YXQubXRpbWV9OiR7ZmlsZS5zdGF0LnNpemV9YDtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGAke3RoaXMubm9ybWFsaXplRm9sZGVyKHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKX0ke3ZhdWx0UGF0aH1gO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWNvbmNpbGVSZW1vdGVJbWFnZXMoKSB7XG4gICAgY29uc3QgcmVtb3RlSW52ZW50b3J5ID0gYXdhaXQgdGhpcy5saXN0UmVtb3RlVHJlZSh0aGlzLnNldHRpbmdzLnJlbW90ZUZvbGRlcik7XG4gICAgY29uc3QgZXhwZWN0ZWRGaWxlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IGltYWdlUm9vdCA9IHRoaXMubm9ybWFsaXplRm9sZGVyKHRoaXMuc2V0dGluZ3MucmVtb3RlRm9sZGVyKTtcblxuICAgIGZvciAoY29uc3QgcmVmcyBvZiB0aGlzLm5vdGVSZW1vdGVSZWZzLnZhbHVlcygpKSB7XG4gICAgICBmb3IgKGNvbnN0IHJlbW90ZVBhdGggb2YgcmVmcykge1xuICAgICAgICBpZiAocmVtb3RlUGF0aC5zdGFydHNXaXRoKGltYWdlUm9vdCkpIHtcbiAgICAgICAgICBleHBlY3RlZEZpbGVzLmFkZChyZW1vdGVQYXRoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGxldCBkZWxldGVkRmlsZXMgPSAwO1xuICAgIGZvciAoY29uc3QgcmVtb3RlUGF0aCBvZiBbLi4ucmVtb3RlSW52ZW50b3J5LmZpbGVzLmtleXMoKV0uc29ydCgoYSwgYikgPT4gYi5sb2NhbGVDb21wYXJlKGEpKSkge1xuICAgICAgaWYgKGV4cGVjdGVkRmlsZXMuaGFzKHJlbW90ZVBhdGgpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZVBhdGgpO1xuICAgICAgZGVsZXRlZEZpbGVzICs9IDE7XG4gICAgfVxuXG4gICAgY29uc3QgZGVsZXRlZERpcmVjdG9yaWVzID0gYXdhaXQgdGhpcy5kZWxldGVFeHRyYVJlbW90ZURpcmVjdG9yaWVzKFxuICAgICAgcmVtb3RlSW52ZW50b3J5LmRpcmVjdG9yaWVzLFxuICAgICAgdGhpcy5idWlsZEV4cGVjdGVkUmVtb3RlRGlyZWN0b3JpZXMoZXhwZWN0ZWRGaWxlcywgdGhpcy5zZXR0aW5ncy5yZW1vdGVGb2xkZXIpLFxuICAgICk7XG5cbiAgICByZXR1cm4geyBkZWxldGVkRmlsZXMsIGRlbGV0ZWREaXJlY3RvcmllcyB9O1xuICB9XG5cbiAgcHJpdmF0ZSBwYXJzZU5vdGVTdHViKGNvbnRlbnQ6IHN0cmluZykge1xuICAgIGNvbnN0IG1hdGNoID0gY29udGVudC5tYXRjaChcbiAgICAgIC9ePCEtLVxccypzZWN1cmUtd2ViZGF2LW5vdGUtc3R1YlxccypcXHI/XFxucmVtb3RlOlxccyooLis/KVxccj9cXG5wbGFjZWhvbGRlcjpcXHMqKC4qPylcXHI/XFxuLS0+L3MsXG4gICAgKTtcbiAgICBpZiAoIW1hdGNoKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgcmVtb3RlUGF0aDogbWF0Y2hbMV0udHJpbSgpLFxuICAgICAgcGxhY2Vob2xkZXI6IG1hdGNoWzJdLnRyaW0oKSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZE5vdGVTdHViKGZpbGU6IFRGaWxlKSB7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgcmV0dXJuIFtcbiAgICAgIGA8IS0tICR7U0VDVVJFX05PVEVfU1RVQn1gLFxuICAgICAgYHJlbW90ZTogJHtyZW1vdGVQYXRofWAsXG4gICAgICBgcGxhY2Vob2xkZXI6ICR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgXCItLT5cIixcbiAgICAgIFwiXCIsXG4gICAgICB0aGlzLnQoXG4gICAgICAgIGBcdThGRDlcdTY2MkZcdTRFMDBcdTdCQzdcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTdCMTRcdThCQjBcdTc2ODRcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTY1ODdcdTRFRjZcdTMwMDJcdTYyNTNcdTVGMDBcdThGRDlcdTdCQzdcdTdCMTRcdThCQjBcdTY1RjZcdUZGMENcdTYzRDJcdTRFRjZcdTRGMUFcdTRFQ0VcdThGRENcdTdBRUZcdTU0MENcdTZCNjVcdTc2RUVcdTVGNTVcdTYwNjJcdTU5MERcdTVCOENcdTY1NzRcdTUxODVcdTVCQjlcdTMwMDJgLFxuICAgICAgICBgVGhpcyBpcyBhIGxvY2FsIHBsYWNlaG9sZGVyIGZvciBhbiBvbi1kZW1hbmQgbm90ZS4gT3BlbmluZyB0aGUgbm90ZSByZXN0b3JlcyB0aGUgZnVsbCBjb250ZW50IGZyb20gdGhlIHJlbW90ZSBzeW5jIGZvbGRlci5gLFxuICAgICAgKSxcbiAgICBdLmpvaW4oXCJcXG5cIik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGV2aWN0U3RhbGVTeW5jZWROb3RlcyhzaG93Tm90aWNlOiBib29sZWFuKSB7XG4gICAgdHJ5IHtcbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLm5vdGVTdG9yYWdlTW9kZSAhPT0gXCJsYXp5LW5vdGVzXCIpIHtcbiAgICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NUY1M1x1NTI0RFx1NjcyQVx1NTQyRlx1NzUyOFx1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFx1NkEyMVx1NUYwRlx1MzAwMlwiLCBcIkxhenkgbm90ZSBtb2RlIGlzIG5vdCBlbmFibGVkLlwiKSwgNjAwMCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGZpbGVzID0gdGhpcy5jb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKS5maWx0ZXIoKGZpbGUpID0+IGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpO1xuICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICAgIGNvbnN0IHRocmVzaG9sZCA9IE1hdGgubWF4KDEsIHRoaXMuc2V0dGluZ3Mubm90ZUV2aWN0QWZ0ZXJEYXlzKSAqIDI0ICogNjAgKiA2MCAqIDEwMDA7XG4gICAgICBsZXQgZXZpY3RlZCA9IDA7XG5cbiAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuICAgICAgICBjb25zdCBhY3RpdmUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xuICAgICAgICBpZiAoYWN0aXZlPy5wYXRoID09PSBmaWxlLnBhdGgpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGxhc3RBY2Nlc3MgPSB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzLmdldChmaWxlLnBhdGgpID8/IDA7XG4gICAgICAgIGlmIChsYXN0QWNjZXNzICE9PSAwICYmIG5vdyAtIGxhc3RBY2Nlc3MgPCB0aHJlc2hvbGQpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICBpZiAodGhpcy5wYXJzZU5vdGVTdHViKGNvbnRlbnQpKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBiaW5hcnkgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgYXdhaXQgdGhpcy51cGxvYWRCaW5hcnkocmVtb3RlUGF0aCwgYmluYXJ5LCBcInRleHQvbWFya2Rvd247IGNoYXJzZXQ9dXRmLThcIik7XG4gICAgICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuc3RhdFJlbW90ZUZpbGUocmVtb3RlUGF0aCk7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB0aGlzLmJ1aWxkTm90ZVN0dWIoZmlsZSkpO1xuICAgICAgICBjb25zdCByZWZyZXNoZWQgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChmaWxlLnBhdGgpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IHRoaXMuYnVpbGRTeW5jU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiB0aGlzLmJ1aWxkU3luY1NpZ25hdHVyZShmaWxlKSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHJlbW90ZT8uc2lnbmF0dXJlID8/IGAke2ZpbGUuc3RhdC5tdGltZX06JHtiaW5hcnkuYnl0ZUxlbmd0aH1gLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICBldmljdGVkICs9IDE7XG4gICAgICB9XG5cbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgYFx1NURGMlx1NTZERVx1NjUzNiAke2V2aWN0ZWR9IFx1N0JDN1x1OTU3Rlx1NjcxRlx1NjcyQVx1OEJCRlx1OTVFRVx1NzY4NFx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1MzAwMmAsXG4gICAgICAgICAgICBgRXZpY3RlZCAke2V2aWN0ZWR9IHN0YWxlIGxvY2FsIG5vdGUocykuYCxcbiAgICAgICAgICApLFxuICAgICAgICAgIDgwMDAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgcmV0dXJuIGV2aWN0ZWQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZXZpY3Qgc3RhbGUgc3luY2VkIG5vdGVzXCIsIGVycm9yKTtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1NTkzMVx1OEQyNVwiLCBcIkZhaWxlZCB0byBldmljdCBsb2NhbCBub3Rlc1wiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZW5zdXJlUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcGFydHMgPSByZW1vdGVQYXRoLnNwbGl0KFwiL1wiKS5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPiAwKTtcbiAgICBpZiAocGFydHMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgY3VycmVudCA9IFwiXCI7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHBhcnRzLmxlbmd0aCAtIDE7IGluZGV4ICs9IDEpIHtcbiAgICAgIGN1cnJlbnQgPSBjdXJyZW50ID8gYCR7Y3VycmVudH0vJHtwYXJ0c1tpbmRleF19YCA6IHBhcnRzW2luZGV4XTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKGN1cnJlbnQpLFxuICAgICAgICBtZXRob2Q6IFwiTUtDT0xcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgaWYgKCFbMjAwLCAyMDEsIDIwNCwgMjA3LCAzMDEsIDMwMiwgMzA3LCAzMDgsIDQwNV0uaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1LQ09MIGZhaWxlZCBmb3IgJHtjdXJyZW50fSB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGxpc3RSZW1vdGVUcmVlKHJvb3RGb2xkZXI6IHN0cmluZyk6IFByb21pc2U8UmVtb3RlSW52ZW50b3J5PiB7XG4gICAgY29uc3QgZmlsZXMgPSBuZXcgTWFwPHN0cmluZywgUmVtb3RlRmlsZVN0YXRlPigpO1xuICAgIGNvbnN0IGRpcmVjdG9yaWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgcGVuZGluZyA9IFt0aGlzLm5vcm1hbGl6ZUZvbGRlcihyb290Rm9sZGVyKV07XG4gICAgY29uc3QgdmlzaXRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG4gICAgd2hpbGUgKHBlbmRpbmcubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgY3VycmVudCA9IHRoaXMubm9ybWFsaXplRm9sZGVyKHBlbmRpbmcucG9wKCkgPz8gcm9vdEZvbGRlcik7XG4gICAgICBpZiAodmlzaXRlZC5oYXMoY3VycmVudCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHZpc2l0ZWQuYWRkKGN1cnJlbnQpO1xuICAgICAgY29uc3QgZW50cmllcyA9IGF3YWl0IHRoaXMubGlzdFJlbW90ZURpcmVjdG9yeShjdXJyZW50KTtcbiAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgICAgICBpZiAoZW50cnkuaXNDb2xsZWN0aW9uKSB7XG4gICAgICAgICAgZGlyZWN0b3JpZXMuYWRkKGVudHJ5LnJlbW90ZVBhdGgpO1xuICAgICAgICAgIHBlbmRpbmcucHVzaChlbnRyeS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlbnRyeS5maWxlKSB7XG4gICAgICAgICAgZmlsZXMuc2V0KGVudHJ5LnJlbW90ZVBhdGgsIGVudHJ5LmZpbGUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgZmlsZXMsIGRpcmVjdG9yaWVzIH07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGxpc3RSZW1vdGVEaXJlY3RvcnkocmVtb3RlRGlyZWN0b3J5OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXF1ZXN0ZWRQYXRoID0gdGhpcy5ub3JtYWxpemVGb2xkZXIocmVtb3RlRGlyZWN0b3J5KTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVxdWVzdGVkUGF0aCksXG4gICAgICBtZXRob2Q6IFwiUFJPUEZJTkRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgRGVwdGg6IFwiMVwiLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDQwNCkge1xuICAgICAgcmV0dXJuIFtdIGFzIEFycmF5PHsgcmVtb3RlUGF0aDogc3RyaW5nOyBpc0NvbGxlY3Rpb246IGJvb2xlYW47IGZpbGU/OiBSZW1vdGVGaWxlU3RhdGUgfT47XG4gICAgfVxuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFBST1BGSU5EIGZhaWxlZCBmb3IgJHtyZXF1ZXN0ZWRQYXRofSB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG5cbiAgICBjb25zdCB4bWxUZXh0ID0gdGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKTtcbiAgICByZXR1cm4gdGhpcy5wYXJzZVByb3BmaW5kRGlyZWN0b3J5TGlzdGluZyh4bWxUZXh0LCByZXF1ZXN0ZWRQYXRoKTtcbiAgfVxuXG4gIHByaXZhdGUgcGFyc2VQcm9wZmluZERpcmVjdG9yeUxpc3RpbmcoeG1sVGV4dDogc3RyaW5nLCByZXF1ZXN0ZWRQYXRoOiBzdHJpbmcsIGluY2x1ZGVSZXF1ZXN0ZWQgPSBmYWxzZSkge1xuICAgIGNvbnN0IHBhcnNlciA9IG5ldyBET01QYXJzZXIoKTtcbiAgICBjb25zdCBkb2N1bWVudCA9IHBhcnNlci5wYXJzZUZyb21TdHJpbmcoeG1sVGV4dCwgXCJhcHBsaWNhdGlvbi94bWxcIik7XG4gICAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwicGFyc2VyZXJyb3JcIikubGVuZ3RoID4gMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1NjVFMFx1NkNENVx1ODlFM1x1Njc5MCBXZWJEQVYgXHU3NkVFXHU1RjU1XHU2RTA1XHU1MzU1XHUzMDAyXCIsIFwiRmFpbGVkIHRvIHBhcnNlIHRoZSBXZWJEQVYgZGlyZWN0b3J5IGxpc3RpbmcuXCIpKTtcbiAgICB9XG5cbiAgICBjb25zdCBlbnRyaWVzID0gbmV3IE1hcDxzdHJpbmcsIHsgcmVtb3RlUGF0aDogc3RyaW5nOyBpc0NvbGxlY3Rpb246IGJvb2xlYW47IGZpbGU/OiBSZW1vdGVGaWxlU3RhdGUgfT4oKTtcbiAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgQXJyYXkuZnJvbShkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcIipcIikpKSB7XG4gICAgICBpZiAoZWxlbWVudC5sb2NhbE5hbWUgIT09IFwicmVzcG9uc2VcIikge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaHJlZiA9IHRoaXMuZ2V0WG1sTG9jYWxOYW1lVGV4dChlbGVtZW50LCBcImhyZWZcIik7XG4gICAgICBpZiAoIWhyZWYpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmhyZWZUb1JlbW90ZVBhdGgoaHJlZik7XG4gICAgICBpZiAoIXJlbW90ZVBhdGgpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGlzQ29sbGVjdGlvbiA9IHRoaXMueG1sVHJlZUhhc0xvY2FsTmFtZShlbGVtZW50LCBcImNvbGxlY3Rpb25cIik7XG4gICAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IGlzQ29sbGVjdGlvbiA/IHRoaXMubm9ybWFsaXplRm9sZGVyKHJlbW90ZVBhdGgpIDogcmVtb3RlUGF0aC5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpO1xuICAgICAgaWYgKFxuICAgICAgICAhaW5jbHVkZVJlcXVlc3RlZCAmJlxuICAgICAgICAoXG4gICAgICAgICAgbm9ybWFsaXplZFBhdGggPT09IHJlcXVlc3RlZFBhdGggfHxcbiAgICAgICAgICBub3JtYWxpemVkUGF0aCA9PT0gcmVxdWVzdGVkUGF0aC5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpXG4gICAgICAgIClcbiAgICAgICkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc2l6ZVRleHQgPSB0aGlzLmdldFhtbExvY2FsTmFtZVRleHQoZWxlbWVudCwgXCJnZXRjb250ZW50bGVuZ3RoXCIpO1xuICAgICAgY29uc3QgcGFyc2VkU2l6ZSA9IE51bWJlci5wYXJzZUludChzaXplVGV4dCwgMTApO1xuICAgICAgY29uc3Qgc2l6ZSA9IE51bWJlci5pc0Zpbml0ZShwYXJzZWRTaXplKSA/IHBhcnNlZFNpemUgOiAwO1xuICAgICAgY29uc3QgbW9kaWZpZWRUZXh0ID0gdGhpcy5nZXRYbWxMb2NhbE5hbWVUZXh0KGVsZW1lbnQsIFwiZ2V0bGFzdG1vZGlmaWVkXCIpO1xuICAgICAgY29uc3QgcGFyc2VkTXRpbWUgPSBEYXRlLnBhcnNlKG1vZGlmaWVkVGV4dCk7XG4gICAgICBjb25zdCBsYXN0TW9kaWZpZWQgPSBOdW1iZXIuaXNGaW5pdGUocGFyc2VkTXRpbWUpID8gcGFyc2VkTXRpbWUgOiAwO1xuXG4gICAgICBlbnRyaWVzLnNldChub3JtYWxpemVkUGF0aCwge1xuICAgICAgICByZW1vdGVQYXRoOiBub3JtYWxpemVkUGF0aCxcbiAgICAgICAgaXNDb2xsZWN0aW9uLFxuICAgICAgICBmaWxlOiBpc0NvbGxlY3Rpb25cbiAgICAgICAgICA/IHVuZGVmaW5lZFxuICAgICAgICAgIDoge1xuICAgICAgICAgICAgICByZW1vdGVQYXRoOiBub3JtYWxpemVkUGF0aCxcbiAgICAgICAgICAgICAgbGFzdE1vZGlmaWVkLFxuICAgICAgICAgICAgICBzaXplLFxuICAgICAgICAgICAgICBzaWduYXR1cmU6IHRoaXMuYnVpbGRSZW1vdGVTeW5jU2lnbmF0dXJlKHtcbiAgICAgICAgICAgICAgICBsYXN0TW9kaWZpZWQsXG4gICAgICAgICAgICAgICAgc2l6ZSxcbiAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIFsuLi5lbnRyaWVzLnZhbHVlcygpXTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0WG1sTG9jYWxOYW1lVGV4dChwYXJlbnQ6IEVsZW1lbnQsIGxvY2FsTmFtZTogc3RyaW5nKSB7XG4gICAgZm9yIChjb25zdCBlbGVtZW50IG9mIEFycmF5LmZyb20ocGFyZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiKlwiKSkpIHtcbiAgICAgIGlmIChlbGVtZW50LmxvY2FsTmFtZSA9PT0gbG9jYWxOYW1lKSB7XG4gICAgICAgIHJldHVybiBlbGVtZW50LnRleHRDb250ZW50Py50cmltKCkgPz8gXCJcIjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuXG4gIHByaXZhdGUgeG1sVHJlZUhhc0xvY2FsTmFtZShwYXJlbnQ6IEVsZW1lbnQsIGxvY2FsTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20ocGFyZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiKlwiKSkuc29tZSgoZWxlbWVudCkgPT4gZWxlbWVudC5sb2NhbE5hbWUgPT09IGxvY2FsTmFtZSk7XG4gIH1cblxuICBwcml2YXRlIGhyZWZUb1JlbW90ZVBhdGgoaHJlZjogc3RyaW5nKSB7XG4gICAgY29uc3QgYmFzZVVybCA9IGAke3RoaXMuc2V0dGluZ3Mud2ViZGF2VXJsLnJlcGxhY2UoL1xcLyskLywgXCJcIil9L2A7XG4gICAgY29uc3QgcmVzb2x2ZWQgPSBuZXcgVVJMKGhyZWYsIGJhc2VVcmwpO1xuICAgIGNvbnN0IGJhc2VQYXRoID0gbmV3IFVSTChiYXNlVXJsKS5wYXRobmFtZS5yZXBsYWNlKC9cXC8rJC8sIFwiL1wiKTtcbiAgICBjb25zdCBkZWNvZGVkUGF0aCA9IHRoaXMuZGVjb2RlUGF0aG5hbWUocmVzb2x2ZWQucGF0aG5hbWUpO1xuICAgIGlmICghZGVjb2RlZFBhdGguc3RhcnRzV2l0aChiYXNlUGF0aCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiBkZWNvZGVkUGF0aC5zbGljZShiYXNlUGF0aC5sZW5ndGgpLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG4gIH1cblxuICBwcml2YXRlIGRlY29kZVBhdGhuYW1lKHBhdGhuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gcGF0aG5hbWVcbiAgICAgIC5zcGxpdChcIi9cIilcbiAgICAgIC5tYXAoKHNlZ21lbnQpID0+IHtcbiAgICAgICAgaWYgKCFzZWdtZW50KSB7XG4gICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoc2VnbWVudCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIHJldHVybiBzZWdtZW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmpvaW4oXCIvXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZEV4cGVjdGVkUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlRmlsZVBhdGhzOiBTZXQ8c3RyaW5nPiwgcm9vdEZvbGRlcjogc3RyaW5nKSB7XG4gICAgY29uc3QgZXhwZWN0ZWQgPSBuZXcgU2V0PHN0cmluZz4oW3RoaXMubm9ybWFsaXplRm9sZGVyKHJvb3RGb2xkZXIpXSk7XG4gICAgZm9yIChjb25zdCByZW1vdGVQYXRoIG9mIHJlbW90ZUZpbGVQYXRocykge1xuICAgICAgY29uc3QgcGFydHMgPSByZW1vdGVQYXRoLnNwbGl0KFwiL1wiKS5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPiAwKTtcbiAgICAgIGxldCBjdXJyZW50ID0gXCJcIjtcbiAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBwYXJ0cy5sZW5ndGggLSAxOyBpbmRleCArPSAxKSB7XG4gICAgICAgIGN1cnJlbnQgPSBjdXJyZW50ID8gYCR7Y3VycmVudH0vJHtwYXJ0c1tpbmRleF19YCA6IHBhcnRzW2luZGV4XTtcbiAgICAgICAgZXhwZWN0ZWQuYWRkKHRoaXMubm9ybWFsaXplRm9sZGVyKGN1cnJlbnQpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZXhwZWN0ZWQ7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZUV4dHJhUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlRGlyZWN0b3JpZXM6IFNldDxzdHJpbmc+LCBleHBlY3RlZERpcmVjdG9yaWVzOiBTZXQ8c3RyaW5nPikge1xuICAgIGxldCBkZWxldGVkID0gMDtcbiAgICBjb25zdCBjYW5kaWRhdGVzID0gWy4uLnJlbW90ZURpcmVjdG9yaWVzXVxuICAgICAgLmZpbHRlcigocmVtb3RlUGF0aCkgPT4gIWV4cGVjdGVkRGlyZWN0b3JpZXMuaGFzKHJlbW90ZVBhdGgpKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGIubGVuZ3RoIC0gYS5sZW5ndGggfHwgYi5sb2NhbGVDb21wYXJlKGEpKTtcblxuICAgIGZvciAoY29uc3QgcmVtb3RlUGF0aCBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAoWzIwMCwgMjAyLCAyMDQsIDQwNF0uaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzKSkge1xuICAgICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSA0MDQpIHtcbiAgICAgICAgICBkZWxldGVkICs9IDE7XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChbNDA1LCA0MDldLmluY2x1ZGVzKHJlc3BvbnNlLnN0YXR1cykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHRocm93IG5ldyBFcnJvcihgREVMRVRFIGRpcmVjdG9yeSBmYWlsZWQgZm9yICR7cmVtb3RlUGF0aH0gd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlbGV0ZWQ7XG4gIH1cblxyXG4gIHByaXZhdGUgYXN5bmMgcHJvY2Vzc1BlbmRpbmdUYXNrcygpIHtcclxuICAgIGlmICh0aGlzLnF1ZXVlLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgZm9yIChjb25zdCB0YXNrIG9mIFsuLi50aGlzLnF1ZXVlXSkge1xyXG4gICAgICBpZiAodGhpcy5wcm9jZXNzaW5nVGFza0lkcy5oYXModGFzay5pZCkpIHtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdm9pZCB0aGlzLnByb2Nlc3NUYXNrKHRhc2spO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRJbWFnZXNJbk5vdGUobm90ZUZpbGU6IFRGaWxlKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChub3RlRmlsZSk7XHJcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50cyA9IGF3YWl0IHRoaXMuYnVpbGRVcGxvYWRSZXBsYWNlbWVudHMoY29udGVudCwgbm90ZUZpbGUpO1xyXG5cclxuICAgICAgaWYgKHJlcGxhY2VtZW50cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NUY1M1x1NTI0RFx1N0IxNFx1OEJCMFx1NEUyRFx1NkNBMVx1NjcwOVx1NjI3RVx1NTIzMFx1NjcyQ1x1NTczMFx1NTZGRVx1NzI0N1x1MzAwMlwiLCBcIk5vIGxvY2FsIGltYWdlcyBmb3VuZCBpbiB0aGUgY3VycmVudCBub3RlLlwiKSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBsZXQgdXBkYXRlZCA9IGNvbnRlbnQ7XHJcbiAgICAgIGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgcmVwbGFjZW1lbnRzKSB7XHJcbiAgICAgICAgdXBkYXRlZCA9IHVwZGF0ZWQuc3BsaXQocmVwbGFjZW1lbnQub3JpZ2luYWwpLmpvaW4ocmVwbGFjZW1lbnQucmV3cml0dGVuKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHVwZGF0ZWQgPT09IGNvbnRlbnQpIHtcclxuICAgICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NkNBMVx1NjcwOVx1OTcwMFx1ODk4MVx1NjUzOVx1NTE5OVx1NzY4NFx1NTZGRVx1NzI0N1x1OTRGRVx1NjNBNVx1MzAwMlwiLCBcIk5vIGltYWdlcyB3ZXJlIHJld3JpdHRlbi5cIikpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KG5vdGVGaWxlLCB1cGRhdGVkKTtcblxuICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZGVsZXRlTG9jYWxBZnRlclVwbG9hZCkge1xuICAgICAgICBmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIHJlcGxhY2VtZW50cykge1xuICAgICAgICAgIGlmIChyZXBsYWNlbWVudC5zb3VyY2VGaWxlKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnRyYXNoSWZFeGlzdHMocmVwbGFjZW1lbnQuc291cmNlRmlsZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cclxuICAgICAgbmV3IE5vdGljZSh0aGlzLnQoYFx1NURGMlx1NEUwQVx1NEYyMCAke3JlcGxhY2VtZW50cy5sZW5ndGh9IFx1NUYyMFx1NTZGRVx1NzI0N1x1NTIzMCBXZWJEQVZcdTMwMDJgLCBgVXBsb2FkZWQgJHtyZXBsYWNlbWVudHMubGVuZ3RofSBpbWFnZShzKSB0byBXZWJEQVYuYCkpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihcIlNlY3VyZSBXZWJEQVYgdXBsb2FkIGZhaWxlZFwiLCBlcnJvcik7XHJcbiAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1NEUwQVx1NEYyMFx1NTkzMVx1OEQyNVwiLCBcIlVwbG9hZCBmYWlsZWRcIiksIGVycm9yKSwgODAwMCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIHByb2Nlc3NUYXNrKHRhc2s6IFVwbG9hZFRhc2spIHtcbiAgICB0aGlzLnByb2Nlc3NpbmdUYXNrSWRzLmFkZCh0YXNrLmlkKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgYmluYXJ5ID0gdGhpcy5iYXNlNjRUb0FycmF5QnVmZmVyKHRhc2suZGF0YUJhc2U2NCk7XG4gICAgICBjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRoaXMucHJlcGFyZVVwbG9hZFBheWxvYWQoXG4gICAgICAgIGJpbmFyeSxcbiAgICAgICAgdGFzay5taW1lVHlwZSB8fCB0aGlzLmdldE1pbWVUeXBlRnJvbUZpbGVOYW1lKHRhc2suZmlsZU5hbWUpLFxuICAgICAgICB0YXNrLmZpbGVOYW1lLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IHJlbW90ZU5hbWUgPSBhd2FpdCB0aGlzLmJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5KHByZXBhcmVkLmZpbGVOYW1lLCBwcmVwYXJlZC5iaW5hcnkpO1xuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRSZW1vdGVQYXRoKHJlbW90ZU5hbWUpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICAgIG1ldGhvZDogXCJQVVRcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogcHJlcGFyZWQubWltZVR5cGUsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IHByZXBhcmVkLmJpbmFyeSxcbiAgICAgIH0pO1xuXHJcbiAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVXBsb2FkIGZhaWxlZCB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgcmVwbGFjZWQgPSBhd2FpdCB0aGlzLnJlcGxhY2VQbGFjZWhvbGRlcihcclxuICAgICAgICB0YXNrLm5vdGVQYXRoLFxuICAgICAgICB0YXNrLmlkLFxuICAgICAgICB0YXNrLnBsYWNlaG9sZGVyLFxuICAgICAgICB0aGlzLmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAoYCR7U0VDVVJFX1BST1RPQ09MfS8vJHtyZW1vdGVQYXRofWAsIHByZXBhcmVkLmZpbGVOYW1lKSxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlcGxhY2VkKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1NEUwQVx1NEYyMFx1NjIxMFx1NTI5Rlx1RkYwQ1x1NEY0Nlx1NkNBMVx1NjcwOVx1NTcyOFx1N0IxNFx1OEJCMFx1NEUyRFx1NjI3RVx1NTIzMFx1NTNFRlx1NjZGRlx1NjM2Mlx1NzY4NFx1NTM2MFx1NEY0RFx1N0IyNlx1MzAwMlwiLCBcIlVwbG9hZCBzdWNjZWVkZWQsIGJ1dCBubyBtYXRjaGluZyBwbGFjZWhvbGRlciB3YXMgZm91bmQgaW4gdGhlIG5vdGUuXCIpKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdGhpcy5xdWV1ZSA9IHRoaXMucXVldWUuZmlsdGVyKChpdGVtKSA9PiBpdGVtLmlkICE9PSB0YXNrLmlkKTtcclxuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcclxuICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTYyMTBcdTUyOUZcdTMwMDJcIiwgXCJJbWFnZSB1cGxvYWRlZCBzdWNjZXNzZnVsbHkuXCIpKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIHF1ZXVlZCB1cGxvYWQgZmFpbGVkXCIsIGVycm9yKTtcclxuICAgICAgdGFzay5hdHRlbXB0cyArPSAxO1xyXG4gICAgICB0YXNrLmxhc3RFcnJvciA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcclxuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcclxuICAgICAgaWYgKHRhc2suYXR0ZW1wdHMgPj0gdGhpcy5zZXR0aW5ncy5tYXhSZXRyeUF0dGVtcHRzKSB7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5yZXBsYWNlUGxhY2Vob2xkZXIodGFzay5ub3RlUGF0aCwgdGFzay5pZCwgdGFzay5wbGFjZWhvbGRlciwgdGhpcy5idWlsZEZhaWxlZFBsYWNlaG9sZGVyKHRhc2suZmlsZU5hbWUsIHRhc2subGFzdEVycm9yKSk7XHJcbiAgICAgICAgdGhpcy5xdWV1ZSA9IHRoaXMucXVldWUuZmlsdGVyKChpdGVtKSA9PiBpdGVtLmlkICE9PSB0YXNrLmlkKTtcclxuICAgICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xyXG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NjcwMFx1N0VDOFx1NTkzMVx1OEQyNVwiLCBcIkltYWdlIHVwbG9hZCBmYWlsZWQgcGVybWFuZW50bHlcIiksIGVycm9yKSwgODAwMCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5zY2hlZHVsZVJldHJ5KHRhc2spO1xyXG4gICAgICB9XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICB0aGlzLnByb2Nlc3NpbmdUYXNrSWRzLmRlbGV0ZSh0YXNrLmlkKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgc2NoZWR1bGVSZXRyeSh0YXNrOiBVcGxvYWRUYXNrKSB7XHJcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMucmV0cnlUaW1lb3V0cy5nZXQodGFzay5pZCk7XHJcbiAgICBpZiAoZXhpc3RpbmcpIHtcclxuICAgICAgd2luZG93LmNsZWFyVGltZW91dChleGlzdGluZyk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZGVsYXkgPSBNYXRoLm1heCgxLCB0aGlzLnNldHRpbmdzLnJldHJ5RGVsYXlTZWNvbmRzKSAqIDEwMDAgKiB0YXNrLmF0dGVtcHRzO1xyXG4gICAgY29uc3QgdGltZW91dElkID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICB0aGlzLnJldHJ5VGltZW91dHMuZGVsZXRlKHRhc2suaWQpO1xyXG4gICAgICB2b2lkIHRoaXMucHJvY2Vzc1Rhc2sodGFzayk7XHJcbiAgICB9LCBkZWxheSk7XHJcbiAgICB0aGlzLnJldHJ5VGltZW91dHMuc2V0KHRhc2suaWQsIHRpbWVvdXRJZCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIHJlcGxhY2VQbGFjZWhvbGRlcihub3RlUGF0aDogc3RyaW5nLCB0YXNrSWQ6IHN0cmluZywgcGxhY2Vob2xkZXI6IHN0cmluZywgcmVwbGFjZW1lbnQ6IHN0cmluZykge1xyXG4gICAgY29uc3QgcmVwbGFjZWRJbkVkaXRvciA9IHRoaXMucmVwbGFjZVBsYWNlaG9sZGVySW5PcGVuRWRpdG9ycyhub3RlUGF0aCwgdGFza0lkLCBwbGFjZWhvbGRlciwgcmVwbGFjZW1lbnQpO1xyXG4gICAgaWYgKHJlcGxhY2VkSW5FZGl0b3IpIHtcclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChub3RlUGF0aCk7XHJcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcclxuICAgIGlmIChjb250ZW50LmluY2x1ZGVzKHBsYWNlaG9sZGVyKSkge1xyXG4gICAgICBjb25zdCB1cGRhdGVkID0gY29udGVudC5yZXBsYWNlKHBsYWNlaG9sZGVyLCByZXBsYWNlbWVudCk7XHJcbiAgICAgIGlmICh1cGRhdGVkICE9PSBjb250ZW50KSB7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIHVwZGF0ZWQpO1xyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgcGF0dGVybiA9IG5ldyBSZWdFeHAoYDxzcGFuW14+XSpkYXRhLXNlY3VyZS13ZWJkYXYtdGFzaz1cIiR7dGhpcy5lc2NhcGVSZWdFeHAodGFza0lkKX1cIltePl0qPi4qPzxcXC9zcGFuPmAsIFwic1wiKTtcclxuICAgIGlmIChwYXR0ZXJuLnRlc3QoY29udGVudCkpIHtcclxuICAgICAgY29uc3QgdXBkYXRlZCA9IGNvbnRlbnQucmVwbGFjZShwYXR0ZXJuLCByZXBsYWNlbWVudCk7XHJcbiAgICAgIGlmICh1cGRhdGVkICE9PSBjb250ZW50KSB7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIHVwZGF0ZWQpO1xyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBidWlsZEZhaWxlZFBsYWNlaG9sZGVyKGZpbGVOYW1lOiBzdHJpbmcsIG1lc3NhZ2U/OiBzdHJpbmcpIHtcbiAgICBjb25zdCBzYWZlTmFtZSA9IHRoaXMuZXNjYXBlSHRtbChmaWxlTmFtZSk7XG4gICAgY29uc3Qgc2FmZU1lc3NhZ2UgPSB0aGlzLmVzY2FwZUh0bWwobWVzc2FnZSA/PyB0aGlzLnQoXCJcdTY3MkFcdTc3RTVcdTk1MTlcdThCRUZcIiwgXCJVbmtub3duIGVycm9yXCIpKTtcbiAgICByZXR1cm4gYDxzcGFuIGNsYXNzPVwic2VjdXJlLXdlYmRhdi1mYWlsZWRcIiBhcmlhLWxhYmVsPVwiJHtzYWZlTmFtZX1cIj4ke3RoaXMuZXNjYXBlSHRtbCh0aGlzLmZvcm1hdEZhaWxlZExhYmVsKGZpbGVOYW1lKSl9OiAke3NhZmVNZXNzYWdlfTwvc3Bhbj5gO1xuICB9XG5cbiAgcHJpdmF0ZSBlc2NhcGVIdG1sKHZhbHVlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdmFsdWVcbiAgICAgIC5yZXBsYWNlKC8mL2csIFwiJmFtcDtcIilcbiAgICAgIC5yZXBsYWNlKC9cIi9nLCBcIiZxdW90O1wiKVxuICAgICAgLnJlcGxhY2UoLzwvZywgXCImbHQ7XCIpXG4gICAgICAucmVwbGFjZSgvPi9nLCBcIiZndDtcIik7XG4gIH1cblxuICBwcml2YXRlIHVuZXNjYXBlSHRtbCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHZhbHVlXG4gICAgICAucmVwbGFjZSgvJnF1b3Q7L2csIFwiXFxcIlwiKVxuICAgICAgLnJlcGxhY2UoLyZndDsvZywgXCI+XCIpXG4gICAgICAucmVwbGFjZSgvJmx0Oy9nLCBcIjxcIilcbiAgICAgIC5yZXBsYWNlKC8mYW1wOy9nLCBcIiZcIik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGZldGNoU2VjdXJlSW1hZ2VCbG9iVXJsKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgRmV0Y2ggZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIH1cblxuICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbcmVzcG9uc2UuYXJyYXlCdWZmZXJdLCB7XG4gICAgICB0eXBlOiByZXNwb25zZS5oZWFkZXJzW1wiY29udGVudC10eXBlXCJdID8/IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCIsXG4gICAgfSk7XG4gICAgY29uc3QgYmxvYlVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgdGhpcy5ibG9iVXJscy5hZGQoYmxvYlVybCk7XG4gICAgcmV0dXJuIGJsb2JVcmw7XG4gIH1cblxuICBwcml2YXRlIGFycmF5QnVmZmVyVG9CYXNlNjQoYnVmZmVyOiBBcnJheUJ1ZmZlcikge1xuICAgIGNvbnN0IGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKTtcbiAgICBjb25zdCBjaHVua1NpemUgPSAweDgwMDA7XG4gICAgbGV0IGJpbmFyeSA9IFwiXCI7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGJ5dGVzLmxlbmd0aDsgaW5kZXggKz0gY2h1bmtTaXplKSB7XG4gICAgICBjb25zdCBjaHVuayA9IGJ5dGVzLnN1YmFycmF5KGluZGV4LCBpbmRleCArIGNodW5rU2l6ZSk7XG4gICAgICBiaW5hcnkgKz0gU3RyaW5nLmZyb21DaGFyQ29kZSguLi5jaHVuayk7XG4gICAgfVxuICAgIHJldHVybiBidG9hKGJpbmFyeSk7XG4gIH1cblxuICBwcml2YXRlIGJhc2U2NFRvQXJyYXlCdWZmZXIoYmFzZTY0OiBzdHJpbmcpIHtcbiAgICBjb25zdCBiaW5hcnkgPSBhdG9iKGJhc2U2NCk7XG4gICAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShiaW5hcnkubGVuZ3RoKTtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYmluYXJ5Lmxlbmd0aDsgaW5kZXggKz0gMSkge1xuICAgICAgYnl0ZXNbaW5kZXhdID0gYmluYXJ5LmNoYXJDb2RlQXQoaW5kZXgpO1xuICAgIH1cbiAgICByZXR1cm4gYnl0ZXMuYnVmZmVyLnNsaWNlKGJ5dGVzLmJ5dGVPZmZzZXQsIGJ5dGVzLmJ5dGVPZmZzZXQgKyBieXRlcy5ieXRlTGVuZ3RoKSBhcyBBcnJheUJ1ZmZlcjtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRDbGlwYm9hcmRGaWxlTmFtZShtaW1lVHlwZTogc3RyaW5nKSB7XG4gICAgY29uc3QgZXh0ZW5zaW9uID0gbWltZVR5cGUuc3BsaXQoXCIvXCIpWzFdPy5yZXBsYWNlKFwianBlZ1wiLCBcImpwZ1wiKSB8fCBcInBuZ1wiO1xuICAgIHJldHVybiBgcGFzdGVkLWltYWdlLSR7RGF0ZS5ub3coKX0uJHtleHRlbnNpb259YDtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBlc2NhcGVSZWdFeHAodmFsdWU6IHN0cmluZykge1xyXG4gICAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCBcIlxcXFwkJlwiKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgcmVwbGFjZVBsYWNlaG9sZGVySW5PcGVuRWRpdG9ycyhub3RlUGF0aDogc3RyaW5nLCB0YXNrSWQ6IHN0cmluZywgcGxhY2Vob2xkZXI6IHN0cmluZywgcmVwbGFjZW1lbnQ6IHN0cmluZykge1xyXG4gICAgbGV0IHJlcGxhY2VkID0gZmFsc2U7XHJcbiAgICBjb25zdCBsZWF2ZXMgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFwibWFya2Rvd25cIik7XHJcblxyXG4gICAgZm9yIChjb25zdCBsZWFmIG9mIGxlYXZlcykge1xyXG4gICAgICBjb25zdCB2aWV3ID0gbGVhZi52aWV3O1xyXG4gICAgICBpZiAoISh2aWV3IGluc3RhbmNlb2YgTWFya2Rvd25WaWV3KSkge1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoIXZpZXcuZmlsZSB8fCB2aWV3LmZpbGUucGF0aCAhPT0gbm90ZVBhdGgpIHtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZWRpdG9yID0gdmlldy5lZGl0b3I7XHJcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBlZGl0b3IuZ2V0VmFsdWUoKTtcclxuICAgICAgbGV0IHVwZGF0ZWQgPSBjb250ZW50O1xyXG5cclxuICAgICAgaWYgKGNvbnRlbnQuaW5jbHVkZXMocGxhY2Vob2xkZXIpKSB7XHJcbiAgICAgICAgdXBkYXRlZCA9IGNvbnRlbnQucmVwbGFjZShwbGFjZWhvbGRlciwgcmVwbGFjZW1lbnQpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnN0IHBhdHRlcm4gPSBuZXcgUmVnRXhwKFxyXG4gICAgICAgICAgYDxzcGFuW14+XSpkYXRhLXNlY3VyZS13ZWJkYXYtdGFzaz1cIiR7dGhpcy5lc2NhcGVSZWdFeHAodGFza0lkKX1cIltePl0qPi4qPzxcXFxcL3NwYW4+YCxcclxuICAgICAgICAgIFwic1wiLFxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdXBkYXRlZCA9IGNvbnRlbnQucmVwbGFjZShwYXR0ZXJuLCByZXBsYWNlbWVudCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmICh1cGRhdGVkICE9PSBjb250ZW50KSB7XHJcbiAgICAgICAgZWRpdG9yLnNldFZhbHVlKHVwZGF0ZWQpO1xyXG4gICAgICAgIHJlcGxhY2VkID0gdHJ1ZTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByZXBsYWNlZDtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgcHJvY2Vzc1NlY3VyZUltYWdlcyhlbDogSFRNTEVsZW1lbnQsIGN0eDogTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dCkge1xuICAgIGNvbnN0IHNlY3VyZU5vZGVzID0gQXJyYXkuZnJvbShlbC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcIltkYXRhLXNlY3VyZS13ZWJkYXZdXCIpKTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChcclxuICAgICAgc2VjdXJlTm9kZXMubWFwKGFzeW5jIChub2RlKSA9PiB7XHJcbiAgICAgICAgaWYgKG5vZGUgaW5zdGFuY2VvZiBIVE1MSW1hZ2VFbGVtZW50KSB7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnN3YXBJbWFnZVNvdXJjZShub2RlKTtcclxuICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSBub2RlLmdldEF0dHJpYnV0ZShcImRhdGEtc2VjdXJlLXdlYmRhdlwiKTtcclxuICAgICAgICBpZiAoIXJlbW90ZVBhdGgpIHtcclxuICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGltZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbWdcIik7XHJcbiAgICAgICAgaW1nLmFsdCA9IG5vZGUuZ2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiKSA/PyBub2RlLmdldEF0dHJpYnV0ZShcImFsdFwiKSA/PyBcIlNlY3VyZSBXZWJEQVYgaW1hZ2VcIjtcclxuICAgICAgICBpbWcuc2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2XCIsIHJlbW90ZVBhdGgpO1xyXG4gICAgICAgIGltZy5jbGFzc0xpc3QuYWRkKFwic2VjdXJlLXdlYmRhdi1pbWFnZVwiLCBcImlzLWxvYWRpbmdcIik7XHJcbiAgICAgICAgbm9kZS5yZXBsYWNlV2l0aChpbWcpO1xyXG4gICAgICAgIGF3YWl0IHRoaXMuc3dhcEltYWdlU291cmNlKGltZyk7XHJcbiAgICAgIH0pLFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBzZWN1cmVMaW5rcyA9IEFycmF5LmZyb20oZWwucXVlcnlTZWxlY3RvckFsbDxIVE1MSW1hZ2VFbGVtZW50PihgaW1nW3NyY149XCIke1NFQ1VSRV9QUk9UT0NPTH0vL1wiXWApKTtcclxuICAgIGF3YWl0IFByb21pc2UuYWxsKHNlY3VyZUxpbmtzLm1hcChhc3luYyAoaW1nKSA9PiB0aGlzLnN3YXBJbWFnZVNvdXJjZShpbWcpKSk7XHJcblxuICAgIGN0eC5hZGRDaGlsZChuZXcgU2VjdXJlV2ViZGF2UmVuZGVyQ2hpbGQoZWwpKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcHJvY2Vzc1NlY3VyZUNvZGVCbG9jayhzb3VyY2U6IHN0cmluZywgZWw6IEhUTUxFbGVtZW50LCBjdHg6IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQpIHtcbiAgICBjb25zdCBwYXJzZWQgPSB0aGlzLnBhcnNlU2VjdXJlSW1hZ2VCbG9jayhzb3VyY2UpO1xuICAgIGlmICghcGFyc2VkPy5wYXRoKSB7XG4gICAgICBlbC5jcmVhdGVFbChcImRpdlwiLCB7XG4gICAgICAgIHRleHQ6IHRoaXMudChcIlx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NEVFM1x1NzgwMVx1NTc1N1x1NjgzQ1x1NUYwRlx1NjVFMFx1NjU0OFx1MzAwMlwiLCBcIkludmFsaWQgc2VjdXJlIGltYWdlIGNvZGUgYmxvY2sgZm9ybWF0LlwiKSxcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGltZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbWdcIik7XG4gICAgaW1nLmFsdCA9IHBhcnNlZC5hbHQgfHwgcGFyc2VkLnBhdGg7XG4gICAgaW1nLnNldEF0dHJpYnV0ZShcImRhdGEtc2VjdXJlLXdlYmRhdlwiLCBwYXJzZWQucGF0aCk7XG4gICAgaW1nLmNsYXNzTGlzdC5hZGQoXCJzZWN1cmUtd2ViZGF2LWltYWdlXCIsIFwiaXMtbG9hZGluZ1wiKTtcbiAgICBlbC5lbXB0eSgpO1xuICAgIGVsLmFwcGVuZENoaWxkKGltZyk7XG4gICAgYXdhaXQgdGhpcy5zd2FwSW1hZ2VTb3VyY2UoaW1nKTtcbiAgICBjdHguYWRkQ2hpbGQobmV3IFNlY3VyZVdlYmRhdlJlbmRlckNoaWxkKGVsKSk7XG4gIH1cblxuICBwcml2YXRlIHBhcnNlU2VjdXJlSW1hZ2VCbG9jayhzb3VyY2U6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdDogeyBwYXRoOiBzdHJpbmc7IGFsdDogc3RyaW5nIH0gPSB7IHBhdGg6IFwiXCIsIGFsdDogXCJcIiB9O1xuICAgIGZvciAoY29uc3QgcmF3TGluZSBvZiBzb3VyY2Uuc3BsaXQoL1xccj9cXG4vKSkge1xuICAgICAgY29uc3QgbGluZSA9IHJhd0xpbmUudHJpbSgpO1xuICAgICAgaWYgKCFsaW5lKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzZXBhcmF0b3JJbmRleCA9IGxpbmUuaW5kZXhPZihcIjpcIik7XG4gICAgICBpZiAoc2VwYXJhdG9ySW5kZXggPT09IC0xKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBrZXkgPSBsaW5lLnNsaWNlKDAsIHNlcGFyYXRvckluZGV4KS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICAgIGNvbnN0IHZhbHVlID0gbGluZS5zbGljZShzZXBhcmF0b3JJbmRleCArIDEpLnRyaW0oKTtcbiAgICAgIGlmIChrZXkgPT09IFwicGF0aFwiKSB7XG4gICAgICAgIHJlc3VsdC5wYXRoID0gdmFsdWU7XG4gICAgICB9IGVsc2UgaWYgKGtleSA9PT0gXCJhbHRcIikge1xuICAgICAgICByZXN1bHQuYWx0ID0gdmFsdWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdC5wYXRoID8gcmVzdWx0IDogbnVsbDtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBhc3luYyBzd2FwSW1hZ2VTb3VyY2UoaW1nOiBIVE1MSW1hZ2VFbGVtZW50KSB7XHJcbiAgICBjb25zdCByZW1vdGVQYXRoID1cclxuICAgICAgaW1nLmdldEF0dHJpYnV0ZShcImRhdGEtc2VjdXJlLXdlYmRhdlwiKSA/PyB0aGlzLmV4dHJhY3RSZW1vdGVQYXRoKGltZy5nZXRBdHRyaWJ1dGUoXCJzcmNcIikgPz8gXCJcIik7XHJcbiAgICBpZiAoIXJlbW90ZVBhdGgpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGltZy5jbGFzc0xpc3QuYWRkKFwic2VjdXJlLXdlYmRhdi1pbWFnZVwiLCBcImlzLWxvYWRpbmdcIik7XHJcbiAgICBjb25zdCBvcmlnaW5hbEFsdCA9IGltZy5hbHQ7XHJcbiAgICBpbWcuYWx0ID0gb3JpZ2luYWxBbHQgfHwgdGhpcy50KFwiXHU1MkEwXHU4RjdEXHU1Qjg5XHU1MTY4XHU1NkZFXHU3MjQ3XHU0RTJELi4uXCIsIFwiTG9hZGluZyBzZWN1cmUgaW1hZ2UuLi5cIik7XHJcblxyXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGJsb2JVcmwgPSBhd2FpdCB0aGlzLmZldGNoU2VjdXJlSW1hZ2VCbG9iVXJsKHJlbW90ZVBhdGgpO1xuICAgICAgaW1nLnNyYyA9IGJsb2JVcmw7XG4gICAgICBpbWcuYWx0ID0gb3JpZ2luYWxBbHQ7XG4gICAgICBpbWcuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgIGltZy5zdHlsZS5tYXhXaWR0aCA9IFwiMTAwJVwiO1xyXG4gICAgICBpbWcuY2xhc3NMaXN0LnJlbW92ZShcImlzLWxvYWRpbmdcIiwgXCJpcy1lcnJvclwiKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIGltYWdlIGxvYWQgZmFpbGVkXCIsIGVycm9yKTtcclxuICAgICAgaW1nLnJlcGxhY2VXaXRoKHRoaXMuYnVpbGRFcnJvckVsZW1lbnQocmVtb3RlUGF0aCwgZXJyb3IpKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgZXh0cmFjdFJlbW90ZVBhdGgoc3JjOiBzdHJpbmcpIHtcclxuICAgIGNvbnN0IHByZWZpeCA9IGAke1NFQ1VSRV9QUk9UT0NPTH0vL2A7XHJcbiAgICBpZiAoIXNyYy5zdGFydHNXaXRoKHByZWZpeCkpIHtcclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHNyYy5zbGljZShwcmVmaXgubGVuZ3RoKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYnVpbGRSZW1vdGVQYXRoKGZpbGVOYW1lOiBzdHJpbmcpIHtcclxuICAgIHJldHVybiBgJHt0aGlzLm5vcm1hbGl6ZUZvbGRlcih0aGlzLnNldHRpbmdzLnJlbW90ZUZvbGRlcil9JHtmaWxlTmFtZX1gO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBidWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeShmaWxlTmFtZTogc3RyaW5nLCBiaW5hcnk6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgZXh0ZW5zaW9uID0gdGhpcy5nZXRFeHRlbnNpb25Gcm9tRmlsZU5hbWUoZmlsZU5hbWUpO1xuICAgIGlmICh0aGlzLnNldHRpbmdzLm5hbWluZ1N0cmF0ZWd5ID09PSBcImhhc2hcIikge1xuICAgICAgY29uc3QgaGFzaCA9IChhd2FpdCB0aGlzLmNvbXB1dGVTaGEyNTZIZXgoYmluYXJ5KSkuc2xpY2UoMCwgMTYpO1xuICAgICAgcmV0dXJuIGAke2hhc2h9LiR7ZXh0ZW5zaW9ufWA7XG4gICAgfVxuXHJcbiAgICByZXR1cm4gYCR7RGF0ZS5ub3coKX0tJHtmaWxlTmFtZX1gO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBidWlsZFVwbG9hZFVybChyZW1vdGVQYXRoOiBzdHJpbmcpIHtcclxuICAgIGNvbnN0IGJhc2UgPSB0aGlzLnNldHRpbmdzLndlYmRhdlVybC5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpO1xyXG4gICAgcmV0dXJuIGAke2Jhc2V9LyR7cmVtb3RlUGF0aC5zcGxpdChcIi9cIikubWFwKGVuY29kZVVSSUNvbXBvbmVudCkuam9pbihcIi9cIil9YDtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgbm9ybWFsaXplRm9sZGVyKGlucHV0OiBzdHJpbmcpIHtcclxuICAgIHJldHVybiBpbnB1dC5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpLnJlcGxhY2UoL1xcLyskLywgXCJcIikgKyBcIi9cIjtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYnVpbGRBdXRoSGVhZGVyKCkge1xuICAgIGNvbnN0IHRva2VuID0gdGhpcy5hcnJheUJ1ZmZlclRvQmFzZTY0KHRoaXMuZW5jb2RlVXRmOChgJHt0aGlzLnNldHRpbmdzLnVzZXJuYW1lfToke3RoaXMuc2V0dGluZ3MucGFzc3dvcmR9YCkpO1xuICAgIHJldHVybiBgQmFzaWMgJHt0b2tlbn1gO1xuICB9XG5cclxuICBwcml2YXRlIGVuc3VyZUNvbmZpZ3VyZWQoKSB7XHJcbiAgICBpZiAoIXRoaXMuc2V0dGluZ3Mud2ViZGF2VXJsIHx8ICF0aGlzLnNldHRpbmdzLnVzZXJuYW1lIHx8ICF0aGlzLnNldHRpbmdzLnBhc3N3b3JkKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJXZWJEQVYgXHU5MTREXHU3RjZFXHU0RTBEXHU1QjhDXHU2NTc0XHUzMDAyXCIsIFwiV2ViREFWIHNldHRpbmdzIGFyZSBpbmNvbXBsZXRlLlwiKSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGdldE1pbWVUeXBlKGV4dGVuc2lvbjogc3RyaW5nKSB7XHJcbiAgICBjb25zdCBub3JtYWxpemVkID0gZXh0ZW5zaW9uLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBpZiAobm9ybWFsaXplZCA9PT0gXCJqcGdcIiB8fCBub3JtYWxpemVkID09PSBcImpwZWdcIikgcmV0dXJuIFwiaW1hZ2UvanBlZ1wiO1xyXG4gICAgaWYgKG5vcm1hbGl6ZWQgPT09IFwicG5nXCIpIHJldHVybiBcImltYWdlL3BuZ1wiO1xyXG4gICAgaWYgKG5vcm1hbGl6ZWQgPT09IFwiZ2lmXCIpIHJldHVybiBcImltYWdlL2dpZlwiO1xyXG4gICAgaWYgKG5vcm1hbGl6ZWQgPT09IFwid2VicFwiKSByZXR1cm4gXCJpbWFnZS93ZWJwXCI7XHJcbiAgICBpZiAobm9ybWFsaXplZCA9PT0gXCJzdmdcIikgcmV0dXJuIFwiaW1hZ2Uvc3ZnK3htbFwiO1xyXG4gICAgaWYgKG5vcm1hbGl6ZWQgPT09IFwiYm1wXCIpIHJldHVybiBcImltYWdlL2JtcFwiO1xyXG4gICAgcmV0dXJuIFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCI7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGdldE1pbWVUeXBlRnJvbUZpbGVOYW1lKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRNaW1lVHlwZSh0aGlzLmdldEV4dGVuc2lvbkZyb21GaWxlTmFtZShmaWxlTmFtZSkpO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRFeHRlbnNpb25Gcm9tRmlsZU5hbWUoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHBpZWNlcyA9IGZpbGVOYW1lLnNwbGl0KFwiLlwiKTtcbiAgICByZXR1cm4gcGllY2VzLmxlbmd0aCA+IDEgPyBwaWVjZXNbcGllY2VzLmxlbmd0aCAtIDFdLnRvTG93ZXJDYXNlKCkgOiBcInBuZ1wiO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwcmVwYXJlVXBsb2FkUGF5bG9hZChiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLmNvbXByZXNzSW1hZ2VzKSB7XG4gICAgICByZXR1cm4geyBiaW5hcnksIG1pbWVUeXBlLCBmaWxlTmFtZSB9O1xuICAgIH1cblxuICAgIGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdGhpcy5jb21wcmVzc0ltYWdlSWZOZWVkZWQoYmluYXJ5LCBtaW1lVHlwZSwgZmlsZU5hbWUpO1xuICAgIHJldHVybiBwcmVwYXJlZCA/PyB7IGJpbmFyeSwgbWltZVR5cGUsIGZpbGVOYW1lIH07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNvbXByZXNzSW1hZ2VJZk5lZWRlZChiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgaWYgKCEvXmltYWdlXFwvKHBuZ3xqcGVnfGpwZ3x3ZWJwKSQvaS50ZXN0KG1pbWVUeXBlKSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgdGhyZXNob2xkQnl0ZXMgPSB0aGlzLnNldHRpbmdzLmNvbXByZXNzVGhyZXNob2xkS2IgKiAxMDI0O1xuICAgIGNvbnN0IHNvdXJjZUJsb2IgPSBuZXcgQmxvYihbYmluYXJ5XSwgeyB0eXBlOiBtaW1lVHlwZSB9KTtcbiAgICBjb25zdCBpbWFnZSA9IGF3YWl0IHRoaXMubG9hZEltYWdlRWxlbWVudChzb3VyY2VCbG9iKTtcbiAgICBjb25zdCBsYXJnZXN0U2lkZSA9IE1hdGgubWF4KGltYWdlLm5hdHVyYWxXaWR0aCwgaW1hZ2UubmF0dXJhbEhlaWdodCk7XG4gICAgY29uc3QgbmVlZHNSZXNpemUgPSBsYXJnZXN0U2lkZSA+IHRoaXMuc2V0dGluZ3MubWF4SW1hZ2VEaW1lbnNpb247XG4gICAgY29uc3QgbmVlZHNDb21wcmVzcyA9IHNvdXJjZUJsb2Iuc2l6ZSA+IHRocmVzaG9sZEJ5dGVzIHx8IG5lZWRzUmVzaXplO1xuICAgIGlmICghbmVlZHNDb21wcmVzcykge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3Qgc2NhbGUgPSBuZWVkc1Jlc2l6ZSA/IHRoaXMuc2V0dGluZ3MubWF4SW1hZ2VEaW1lbnNpb24gLyBsYXJnZXN0U2lkZSA6IDE7XG4gICAgY29uc3QgdGFyZ2V0V2lkdGggPSBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKGltYWdlLm5hdHVyYWxXaWR0aCAqIHNjYWxlKSk7XG4gICAgY29uc3QgdGFyZ2V0SGVpZ2h0ID0gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChpbWFnZS5uYXR1cmFsSGVpZ2h0ICogc2NhbGUpKTtcbiAgICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiY2FudmFzXCIpO1xuICAgIGNhbnZhcy53aWR0aCA9IHRhcmdldFdpZHRoO1xuICAgIGNhbnZhcy5oZWlnaHQgPSB0YXJnZXRIZWlnaHQ7XG4gICAgY29uc3QgY29udGV4dCA9IGNhbnZhcy5nZXRDb250ZXh0KFwiMmRcIik7XG4gICAgaWYgKCFjb250ZXh0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb250ZXh0LmRyYXdJbWFnZShpbWFnZSwgMCwgMCwgdGFyZ2V0V2lkdGgsIHRhcmdldEhlaWdodCk7XG5cbiAgICBjb25zdCBvdXRwdXRNaW1lID0gbWltZVR5cGUudG9Mb3dlckNhc2UoKSA9PT0gXCJpbWFnZS9qcGdcIiA/IFwiaW1hZ2UvanBlZ1wiIDogbWltZVR5cGU7XG4gICAgY29uc3QgcXVhbGl0eSA9IE1hdGgubWF4KDAuNCwgTWF0aC5taW4oMC45OCwgdGhpcy5zZXR0aW5ncy5qcGVnUXVhbGl0eSAvIDEwMCkpO1xuICAgIGNvbnN0IGNvbXByZXNzZWRCbG9iID0gYXdhaXQgbmV3IFByb21pc2U8QmxvYiB8IG51bGw+KChyZXNvbHZlKSA9PiB7XG4gICAgICBjYW52YXMudG9CbG9iKHJlc29sdmUsIG91dHB1dE1pbWUsIHF1YWxpdHkpO1xuICAgIH0pO1xuXG4gICAgaWYgKCFjb21wcmVzc2VkQmxvYikge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaWYgKCFuZWVkc1Jlc2l6ZSAmJiBjb21wcmVzc2VkQmxvYi5zaXplID49IHNvdXJjZUJsb2Iuc2l6ZSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgbmV4dEJpbmFyeSA9IGF3YWl0IGNvbXByZXNzZWRCbG9iLmFycmF5QnVmZmVyKCk7XG4gICAgY29uc3QgbmV4dEV4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uRnJvbU1pbWVUeXBlKG91dHB1dE1pbWUpID8/IHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbUZpbGVOYW1lKGZpbGVOYW1lKTtcbiAgICBjb25zdCBuZXh0RmlsZU5hbWUgPSBmaWxlTmFtZS5yZXBsYWNlKC9cXC5bXi5dKyQvLCBcIlwiKSArIGAuJHtuZXh0RXh0ZW5zaW9ufWA7XG4gICAgcmV0dXJuIHtcbiAgICAgIGJpbmFyeTogbmV4dEJpbmFyeSxcbiAgICAgIG1pbWVUeXBlOiBvdXRwdXRNaW1lLFxuICAgICAgZmlsZU5hbWU6IG5leHRGaWxlTmFtZSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBsb2FkSW1hZ2VFbGVtZW50KGJsb2I6IEJsb2IpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2U8SFRNTEltYWdlRWxlbWVudD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgIGNvbnN0IGltYWdlID0gbmV3IEltYWdlKCk7XG4gICAgICBpbWFnZS5vbmxvYWQgPSAoKSA9PiB7XG4gICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwodXJsKTtcbiAgICAgICAgcmVzb2x2ZShpbWFnZSk7XG4gICAgICB9O1xuICAgICAgaW1hZ2Uub25lcnJvciA9IChlcnJvcikgPT4ge1xuICAgICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9O1xuICAgICAgaW1hZ2Uuc3JjID0gdXJsO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRlbnNpb25Gcm9tTWltZVR5cGUobWltZVR5cGU6IHN0cmluZykge1xuICAgIGlmIChtaW1lVHlwZSA9PT0gXCJpbWFnZS9qcGVnXCIpIHJldHVybiBcImpwZ1wiO1xuICAgIGlmIChtaW1lVHlwZSA9PT0gXCJpbWFnZS9wbmdcIikgcmV0dXJuIFwicG5nXCI7XG4gICAgaWYgKG1pbWVUeXBlID09PSBcImltYWdlL3dlYnBcIikgcmV0dXJuIFwid2VicFwiO1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cclxuICBwcml2YXRlIGFzeW5jIHRyYXNoSWZFeGlzdHMoZmlsZTogVEFic3RyYWN0RmlsZSkge1xyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQudHJhc2goZmlsZSwgdHJ1ZSk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLndhcm4oXCJGYWlsZWQgdG8gdHJhc2ggbG9jYWwgaW1hZ2UgYWZ0ZXIgdXBsb2FkXCIsIGVycm9yKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmw6IHN0cmluZywgYWx0OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5leHRyYWN0UmVtb3RlUGF0aChyZW1vdGVVcmwpO1xuICAgIGlmICghcmVtb3RlUGF0aCkge1xuICAgICAgcmV0dXJuIGAhW10oJHtyZW1vdGVVcmx9KWA7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayhyZW1vdGVQYXRoLCBhbHQpO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZFNlY3VyZUltYWdlQ29kZUJsb2NrKHJlbW90ZVBhdGg6IHN0cmluZywgYWx0OiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkQWx0ID0gKGFsdCB8fCByZW1vdGVQYXRoKS5yZXBsYWNlKC9cXHI/XFxuL2csIFwiIFwiKS50cmltKCk7XG4gICAgY29uc3Qgbm9ybWFsaXplZFBhdGggPSByZW1vdGVQYXRoLnJlcGxhY2UoL1xccj9cXG4vZywgXCJcIikudHJpbSgpO1xuICAgIHJldHVybiBbXG4gICAgICBgXFxgXFxgXFxgJHtTRUNVUkVfQ09ERV9CTE9DS31gLFxuICAgICAgYHBhdGg6ICR7bm9ybWFsaXplZFBhdGh9YCxcbiAgICAgIGBhbHQ6ICR7bm9ybWFsaXplZEFsdH1gLFxuICAgICAgXCJgYGBcIixcbiAgICBdLmpvaW4oXCJcXG5cIik7XG4gIH1cblxuICBwcml2YXRlIGZvcm1hdEVtYmVkTGFiZWwoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLnQoYFx1MzAxMFx1NUI4OVx1NTE2OFx1OEZEQ1x1N0EwQlx1NTZGRVx1NzI0N1x1RkY1QyR7ZmlsZU5hbWV9XHUzMDExYCwgYFtTZWN1cmUgcmVtb3RlIGltYWdlIHwgJHtmaWxlTmFtZX1dYCk7XG4gIH1cblxuICBwcml2YXRlIGZvcm1hdEZhaWxlZExhYmVsKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy50KGBcdTMwMTBcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTU5MzFcdThEMjVcdUZGNUMke2ZpbGVOYW1lfVx1MzAxMWAsIGBbSW1hZ2UgdXBsb2FkIGZhaWxlZCB8ICR7ZmlsZU5hbWV9XWApO1xuICB9XG5cbiAgYXN5bmMgbWlncmF0ZUFsbExlZ2FjeVNlY3VyZUltYWdlcygpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXBsb2FkQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgICAgY29uc3QgY2FuZGlkYXRlTG9jYWxJbWFnZXMgPSBuZXcgTWFwPHN0cmluZywgVEZpbGU+KCk7XG4gICAgICBsZXQgY2hhbmdlZEZpbGVzID0gMDtcbiAgICAgIGZvciAoY29uc3QgZmlsZSBvZiB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkpIHtcbiAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICAgIGNvbnN0IHJlcGxhY2VtZW50cyA9IGF3YWl0IHRoaXMuYnVpbGRVcGxvYWRSZXBsYWNlbWVudHMoY29udGVudCwgZmlsZSwgdXBsb2FkQ2FjaGUpO1xuICAgICAgICBmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIHJlcGxhY2VtZW50cykge1xuICAgICAgICAgIGlmIChyZXBsYWNlbWVudC5zb3VyY2VGaWxlKSB7XG4gICAgICAgICAgICBjYW5kaWRhdGVMb2NhbEltYWdlcy5zZXQocmVwbGFjZW1lbnQuc291cmNlRmlsZS5wYXRoLCByZXBsYWNlbWVudC5zb3VyY2VGaWxlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgdXBkYXRlZCA9IGNvbnRlbnQ7XG4gICAgICAgIGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgcmVwbGFjZW1lbnRzKSB7XG4gICAgICAgICAgdXBkYXRlZCA9IHVwZGF0ZWQuc3BsaXQocmVwbGFjZW1lbnQub3JpZ2luYWwpLmpvaW4ocmVwbGFjZW1lbnQucmV3cml0dGVuKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZWQgPSB1cGRhdGVkXG4gICAgICAgICAgLnJlcGxhY2UoXG4gICAgICAgICAgICAvPHNwYW4gY2xhc3M9XCJzZWN1cmUtd2ViZGF2LWVtYmVkXCIgZGF0YS1zZWN1cmUtd2ViZGF2PVwiKFteXCJdKylcIiBhcmlhLWxhYmVsPVwiKFteXCJdKilcIj4uKj88XFwvc3Bhbj4vZyxcbiAgICAgICAgICAgIChfbWF0Y2gsIHJlbW90ZVBhdGg6IHN0cmluZywgYWx0OiBzdHJpbmcpID0+XG4gICAgICAgICAgICAgIHRoaXMuYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayhcbiAgICAgICAgICAgICAgICB0aGlzLnVuZXNjYXBlSHRtbChyZW1vdGVQYXRoKSxcbiAgICAgICAgICAgICAgICB0aGlzLnVuZXNjYXBlSHRtbChhbHQpIHx8IHRoaXMudW5lc2NhcGVIdG1sKHJlbW90ZVBhdGgpLFxuICAgICAgICAgICAgICApLFxuICAgICAgICAgIClcbiAgICAgICAgICAucmVwbGFjZShcbiAgICAgICAgICAgIC8hXFxbW15cXF1dKl1cXCh3ZWJkYXYtc2VjdXJlOlxcL1xcLyhbXildKylcXCkvZyxcbiAgICAgICAgICAgIChfbWF0Y2gsIHJlbW90ZVBhdGg6IHN0cmluZykgPT5cbiAgICAgICAgICAgICAgdGhpcy5idWlsZFNlY3VyZUltYWdlQ29kZUJsb2NrKHRoaXMudW5lc2NhcGVIdG1sKHJlbW90ZVBhdGgpLCB0aGlzLnVuZXNjYXBlSHRtbChyZW1vdGVQYXRoKSksXG4gICAgICAgICAgKTtcblxuICAgICAgICBpZiAodXBkYXRlZCA9PT0gY29udGVudCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIHVwZGF0ZWQpO1xuICAgICAgICBjaGFuZ2VkRmlsZXMgKz0gMTtcbiAgICAgIH1cblxuICAgICAgaWYgKGNoYW5nZWRGaWxlcyA9PT0gMCkge1xuICAgICAgICBuZXcgTm90aWNlKFxuICAgICAgICAgIHRoaXMudChcbiAgICAgICAgICAgIFwiXHU2NTc0XHU1RTkzXHU5MUNDXHU2Q0ExXHU2NzA5XHU1M0QxXHU3M0IwXHU1M0VGXHU4RkMxXHU3OUZCXHU3Njg0XHU2NUU3XHU3MjQ4XHU1Qjg5XHU1MTY4XHU1NkZFXHU3MjQ3XHU2ODA3XHU3QjdFXHUzMDAyXCIsXG4gICAgICAgICAgICBcIk5vIGxlZ2FjeSBzZWN1cmUgaW1hZ2UgdGFncyB3ZXJlIGZvdW5kIGluIHRoZSB2YXVsdC5cIixcbiAgICAgICAgICApLFxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLmRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQpIHtcbiAgICAgICAgYXdhaXQgdGhpcy50cmFzaE1pZ3JhdGVkSW1hZ2VzSWZTYWZlKGNhbmRpZGF0ZUxvY2FsSW1hZ2VzKTtcbiAgICAgIH1cblxuICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgdGhpcy50KFxuICAgICAgICAgIGBcdTVERjJcdThGQzFcdTc5RkIgJHtjaGFuZ2VkRmlsZXN9IFx1N0JDN1x1N0IxNFx1OEJCMFx1NTIzMFx1NjVCMFx1NzY4NFx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NEVFM1x1NzgwMVx1NTc1N1x1NjgzQ1x1NUYwRlx1MzAwMmAsXG4gICAgICAgICAgYE1pZ3JhdGVkICR7Y2hhbmdlZEZpbGVzfSBub3RlKHMpIHRvIHRoZSBuZXcgc2VjdXJlIGltYWdlIGNvZGUtYmxvY2sgZm9ybWF0LmAsXG4gICAgICAgICksXG4gICAgICAgIDgwMDAsXG4gICAgICApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIG1pZ3JhdGUgc2VjdXJlIGltYWdlcyB0byBjb2RlIGJsb2Nrc1wiLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdThGQzFcdTc5RkJcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTY4M0NcdTVGMEZcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gbWlncmF0ZSBzZWN1cmUgaW1hZ2UgZm9ybWF0XCIpLCBlcnJvciksIDgwMDApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdHJhc2hNaWdyYXRlZEltYWdlc0lmU2FmZShjYW5kaWRhdGVMb2NhbEltYWdlczogTWFwPHN0cmluZywgVEZpbGU+KSB7XG4gICAgaWYgKGNhbmRpZGF0ZUxvY2FsSW1hZ2VzLnNpemUgPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCByZW1haW5pbmdSZWZzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgZm9yIChjb25zdCBub3RlIG9mIHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKSkge1xuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQobm90ZSk7XG4gICAgICBjb25zdCB3aWtpTWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKC8hXFxbXFxbKFteXFxdXSspXFxdXFxdL2cpXTtcbiAgICAgIGNvbnN0IG1hcmtkb3duTWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKC8hXFxbW15cXF1dKl1cXCgoW14pXSspXFwpL2cpXTtcblxuICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiB3aWtpTWF0Y2hlcykge1xuICAgICAgICBjb25zdCByYXdMaW5rID0gbWF0Y2hbMV0uc3BsaXQoXCJ8XCIpWzBdLnRyaW0oKTtcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5yZXNvbHZlTGlua2VkRmlsZShyYXdMaW5rLCBub3RlLnBhdGgpO1xuICAgICAgICBpZiAodGFyZ2V0ICYmIHRoaXMuaXNJbWFnZUZpbGUodGFyZ2V0KSkge1xuICAgICAgICAgIHJlbWFpbmluZ1JlZnMuYWRkKHRhcmdldC5wYXRoKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIG1hcmtkb3duTWF0Y2hlcykge1xuICAgICAgICBjb25zdCByYXdMaW5rID0gZGVjb2RlVVJJQ29tcG9uZW50KG1hdGNoWzFdLnRyaW0oKS5yZXBsYWNlKC9ePHw+JC9nLCBcIlwiKSk7XG4gICAgICAgIGlmICgvXihodHRwcz86fHdlYmRhdi1zZWN1cmU6fGRhdGE6KS9pLnRlc3QocmF3TGluaykpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMucmVzb2x2ZUxpbmtlZEZpbGUocmF3TGluaywgbm90ZS5wYXRoKTtcbiAgICAgICAgaWYgKHRhcmdldCAmJiB0aGlzLmlzSW1hZ2VGaWxlKHRhcmdldCkpIHtcbiAgICAgICAgICByZW1haW5pbmdSZWZzLmFkZCh0YXJnZXQucGF0aCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IFtwYXRoLCBmaWxlXSBvZiBjYW5kaWRhdGVMb2NhbEltYWdlcy5lbnRyaWVzKCkpIHtcbiAgICAgIGlmIChyZW1haW5pbmdSZWZzLmhhcyhwYXRoKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy50cmFzaElmRXhpc3RzKGZpbGUpO1xuICAgIH1cbiAgfVxuXHJcbiAgcHJpdmF0ZSBidWlsZEVycm9yRWxlbWVudChyZW1vdGVQYXRoOiBzdHJpbmcsIGVycm9yOiB1bmtub3duKSB7XHJcbiAgICBjb25zdCBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBlbC5jbGFzc05hbWUgPSBcInNlY3VyZS13ZWJkYXYtaW1hZ2UgaXMtZXJyb3JcIjtcclxuICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XHJcbiAgICBlbC50ZXh0Q29udGVudCA9IHRoaXMudChcclxuICAgICAgYFx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NTJBMFx1OEY3RFx1NTkzMVx1OEQyNVx1RkYxQSR7cmVtb3RlUGF0aH1cdUZGMDgke21lc3NhZ2V9XHVGRjA5YCxcclxuICAgICAgYFNlY3VyZSBpbWFnZSBmYWlsZWQ6ICR7cmVtb3RlUGF0aH0gKCR7bWVzc2FnZX0pYCxcclxuICAgICk7XHJcbiAgICByZXR1cm4gZWw7XHJcbiAgfVxyXG5cclxuICBhc3luYyBydW5Db25uZWN0aW9uVGVzdChzaG93TW9kYWwgPSBmYWxzZSkge1xyXG4gICAgdHJ5IHtcclxuICAgICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XHJcblxyXG4gICAgICBjb25zdCBwcm9iZU5hbWUgPSBgLnNlY3VyZS13ZWJkYXYtcHJvYmUtJHtEYXRlLm5vdygpfS50eHRgO1xyXG4gICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5idWlsZFJlbW90ZVBhdGgocHJvYmVOYW1lKTtcclxuICAgICAgY29uc3QgdXBsb2FkVXJsID0gdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKTtcclxuICAgICAgY29uc3QgcHJvYmVBcnJheUJ1ZmZlciA9IHRoaXMuZW5jb2RlVXRmOChgc2VjdXJlLXdlYmRhdiBwcm9iZSAke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKX1gKTtcblxyXG4gICAgICBjb25zdCBwdXRSZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XHJcbiAgICAgICAgdXJsOiB1cGxvYWRVcmwsXHJcbiAgICAgICAgbWV0aG9kOiBcIlBVVFwiLFxyXG4gICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXHJcbiAgICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcInRleHQvcGxhaW47IGNoYXJzZXQ9dXRmLThcIixcclxuICAgICAgICB9LFxyXG4gICAgICAgIGJvZHk6IHByb2JlQXJyYXlCdWZmZXIsXHJcbiAgICAgIH0pO1xyXG4gICAgICBpZiAocHV0UmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHB1dFJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFBVVCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtwdXRSZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGdldFJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcclxuICAgICAgICB1cmw6IHVwbG9hZFVybCxcclxuICAgICAgICBtZXRob2Q6IFwiR0VUXCIsXHJcbiAgICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcclxuICAgICAgICB9LFxyXG4gICAgICB9KTtcclxuICAgICAgaWYgKGdldFJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCBnZXRSZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBHRVQgZmFpbGVkIHdpdGggc3RhdHVzICR7Z2V0UmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBkZWxldGVSZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XHJcbiAgICAgICAgdXJsOiB1cGxvYWRVcmwsXHJcbiAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxyXG4gICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXHJcbiAgICAgICAgfSxcclxuICAgICAgfSk7XHJcbiAgICAgIGlmIChkZWxldGVSZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgZGVsZXRlUmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgREVMRVRFIGZhaWxlZCB3aXRoIHN0YXR1cyAke2RlbGV0ZVJlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgbWVzc2FnZSA9IHRoaXMudChcclxuICAgICAgICBgV2ViREFWIFx1NkQ0Qlx1OEJENVx1OTAxQVx1OEZDN1x1MzAwMlBVVCAke3B1dFJlc3BvbnNlLnN0YXR1c31cdUZGMENHRVQgJHtnZXRSZXNwb25zZS5zdGF0dXN9XHVGRjBDREVMRVRFICR7ZGVsZXRlUmVzcG9uc2Uuc3RhdHVzfVx1MzAwMmAsXHJcbiAgICAgICAgYFdlYkRBViB0ZXN0IHBhc3NlZC4gUFVUICR7cHV0UmVzcG9uc2Uuc3RhdHVzfSwgR0VUICR7Z2V0UmVzcG9uc2Uuc3RhdHVzfSwgREVMRVRFICR7ZGVsZXRlUmVzcG9uc2Uuc3RhdHVzfS5gLFxyXG4gICAgICApO1xyXG4gICAgICBuZXcgTm90aWNlKG1lc3NhZ2UsIDYwMDApO1xyXG4gICAgICBpZiAoc2hvd01vZGFsKSB7XHJcbiAgICAgICAgbmV3IFJlc3VsdE1vZGFsKHRoaXMuYXBwLCB0aGlzLnQoXCJXZWJEQVYgXHU4RkRFXHU2M0E1XCIsIFwiV2ViREFWIENvbm5lY3Rpb25cIiksIG1lc3NhZ2UpLm9wZW4oKTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIHRlc3QgZmFpbGVkXCIsIGVycm9yKTtcclxuICAgICAgY29uc3QgbWVzc2FnZSA9IHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJXZWJEQVYgXHU2RDRCXHU4QkQ1XHU1OTMxXHU4RDI1XCIsIFwiV2ViREFWIHRlc3QgZmFpbGVkXCIpLCBlcnJvcik7XHJcbiAgICAgIG5ldyBOb3RpY2UobWVzc2FnZSwgODAwMCk7XHJcbiAgICAgIGlmIChzaG93TW9kYWwpIHtcclxuICAgICAgICBuZXcgUmVzdWx0TW9kYWwodGhpcy5hcHAsIHRoaXMudChcIldlYkRBViBcdThGREVcdTYzQTVcIiwgXCJXZWJEQVYgQ29ubmVjdGlvblwiKSwgbWVzc2FnZSkub3BlbigpO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgZGVzY3JpYmVFcnJvcihwcmVmaXg6IHN0cmluZywgZXJyb3I6IHVua25vd24pIHtcclxuICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XHJcbiAgICByZXR1cm4gYCR7cHJlZml4fTogJHttZXNzYWdlfWA7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIHJlcXVlc3RVcmwob3B0aW9uczoge1xuICAgIHVybDogc3RyaW5nO1xuICAgIG1ldGhvZDogc3RyaW5nO1xuICAgIGhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICAgIGJvZHk/OiBBcnJheUJ1ZmZlcjtcbiAgICBmb2xsb3dSZWRpcmVjdHM/OiBib29sZWFuO1xuICAgIHJlZGlyZWN0Q291bnQ/OiBudW1iZXI7XG4gIH0pOiBQcm9taXNlPHsgc3RhdHVzOiBudW1iZXI7IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47IGFycmF5QnVmZmVyOiBBcnJheUJ1ZmZlciB9PiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBvYnNpZGlhblJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiBvcHRpb25zLnVybCxcbiAgICAgIG1ldGhvZDogb3B0aW9ucy5tZXRob2QsXG4gICAgICBoZWFkZXJzOiBvcHRpb25zLmhlYWRlcnMsXG4gICAgICBib2R5OiBvcHRpb25zLmJvZHksXG4gICAgICB0aHJvdzogZmFsc2UsXG4gICAgfSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiByZXNwb25zZS5zdGF0dXMsXG4gICAgICBoZWFkZXJzOiByZXNwb25zZS5oZWFkZXJzLFxuICAgICAgYXJyYXlCdWZmZXI6IHJlc3BvbnNlLmFycmF5QnVmZmVyLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGVuY29kZVV0ZjgodmFsdWU6IHN0cmluZykge1xuICAgIGNvbnN0IGJ5dGVzID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKHZhbHVlKTtcbiAgICByZXR1cm4gYnl0ZXMuYnVmZmVyLnNsaWNlKGJ5dGVzLmJ5dGVPZmZzZXQsIGJ5dGVzLmJ5dGVPZmZzZXQgKyBieXRlcy5ieXRlTGVuZ3RoKSBhcyBBcnJheUJ1ZmZlcjtcbiAgfVxuXG4gIHByaXZhdGUgZGVjb2RlVXRmOChidWZmZXI6IEFycmF5QnVmZmVyKSB7XG4gICAgcmV0dXJuIG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShidWZmZXIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjb21wdXRlU2hhMjU2SGV4KGJ1ZmZlcjogQXJyYXlCdWZmZXIpIHtcbiAgICBjb25zdCBkaWdlc3QgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRpZ2VzdChcIlNIQS0yNTZcIiwgYnVmZmVyKTtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShuZXcgVWludDhBcnJheShkaWdlc3QpKVxuICAgICAgLm1hcCgodmFsdWUpID0+IHZhbHVlLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCBcIjBcIikpXG4gICAgICAuam9pbihcIlwiKTtcbiAgfVxufVxuXHJcbmNsYXNzIFNlY3VyZVdlYmRhdlJlbmRlckNoaWxkIGV4dGVuZHMgTWFya2Rvd25SZW5kZXJDaGlsZCB7XG4gIG9udW5sb2FkKCk6IHZvaWQge31cbn1cblxudHlwZSBVcGxvYWRSZXdyaXRlID0ge1xuICBvcmlnaW5hbDogc3RyaW5nO1xuICByZXdyaXR0ZW46IHN0cmluZztcbiAgc291cmNlRmlsZT86IFRGaWxlO1xufTtcblxyXG5jbGFzcyBTZWN1cmVXZWJkYXZTZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XHJcbiAgcGx1Z2luOiBTZWN1cmVXZWJkYXZJbWFnZXNQbHVnaW47XHJcblxyXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IFNlY3VyZVdlYmRhdkltYWdlc1BsdWdpbikge1xyXG4gICAgc3VwZXIoYXBwLCBwbHVnaW4pO1xyXG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcbiAgfVxyXG5cclxuICBkaXNwbGF5KCk6IHZvaWQge1xyXG4gICAgY29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcclxuICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XHJcblxyXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiU2VjdXJlIFdlYkRBViBJbWFnZXNcIiB9KTtcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcInBcIiwge1xuICAgICAgdGV4dDogdGhpcy5wbHVnaW4udChcbiAgICAgICAgXCJcdThGRDlcdTRFMkFcdTYzRDJcdTRFRjZcdTUzRUFcdTYyOEFcdTU2RkVcdTcyNDdcdTUyNjVcdTc5QkJcdTUyMzBcdTUzNTVcdTcyRUNcdTc2ODRcdThGRENcdTdBRUZcdTc2RUVcdTVGNTVcdUZGMENcdTVFNzZcdTRGRERcdTVCNThcdTRFM0Egc2VjdXJlLXdlYmRhdiBcdTgxRUFcdTVCOUFcdTRFNDlcdTRFRTNcdTc4MDFcdTU3NTdcdUZGMUJcdTUxNzZcdTRFRDZcdTdCMTRcdThCQjBcdTU0OENcdTk2NDRcdTRFRjZcdTYzMDlcdTUzOUZcdThERUZcdTVGODRcdTUzOUZcdTY4MzdcdTU0MENcdTZCNjVcdTMwMDJcIixcbiAgICAgICAgXCJUaGlzIHBsdWdpbiBzZXBhcmF0ZXMgb25seSBpbWFnZXMgaW50byBhIGRlZGljYXRlZCByZW1vdGUgZm9sZGVyIGFuZCBzdG9yZXMgdGhlbSBhcyBzZWN1cmUtd2ViZGF2IGN1c3RvbSBjb2RlIGJsb2Nrcy4gTm90ZXMgYW5kIG90aGVyIGF0dGFjaG1lbnRzIGFyZSBzeW5jZWQgYXMtaXMgd2l0aCB0aGVpciBvcmlnaW5hbCBwYXRocy5cIixcbiAgICAgICksXG4gICAgfSk7XG5cclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiB0aGlzLnBsdWdpbi50KFwiXHU3NTRDXHU5NzYyXHU4QkVEXHU4QTAwXCIsIFwiSW50ZXJmYWNlIGxhbmd1YWdlXCIpIH0pO1xuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1OEJFRFx1OEEwMFwiLCBcIkxhbmd1YWdlXCIpKVxuICAgICAgLnNldERlc2ModGhpcy5wbHVnaW4udChcIlx1OEJCRVx1N0Y2RVx1OTg3NVx1NjUyRlx1NjMwMVx1ODFFQVx1NTJBOFx1MzAwMVx1NEUyRFx1NjU4N1x1MzAwMVx1ODJGMVx1NjU4N1x1NTIwN1x1NjM2Mlx1MzAwMlwiLCBcIlN3aXRjaCB0aGUgc2V0dGluZ3MgVUkgYmV0d2VlbiBhdXRvLCBDaGluZXNlLCBhbmQgRW5nbGlzaC5cIikpXHJcbiAgICAgIC5hZGREcm9wZG93bigoZHJvcGRvd24pID0+XHJcbiAgICAgICAgZHJvcGRvd25cclxuICAgICAgICAgIC5hZGRPcHRpb24oXCJhdXRvXCIsIHRoaXMucGx1Z2luLnQoXCJcdTgxRUFcdTUyQThcIiwgXCJBdXRvXCIpKVxuICAgICAgICAgIC5hZGRPcHRpb24oXCJ6aFwiLCBcIlx1NEUyRFx1NjU4N1wiKVxuICAgICAgICAgIC5hZGRPcHRpb24oXCJlblwiLCBcIkVuZ2xpc2hcIilcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubGFuZ3VhZ2UpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5sYW5ndWFnZSA9IHZhbHVlIGFzIFwiYXV0b1wiIHwgXCJ6aFwiIHwgXCJlblwiO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcbiAgICAgICAgICB9KSxcbiAgICAgICk7XHJcblxyXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMucGx1Z2luLnQoXCJcdThGREVcdTYzQTVcdThCQkVcdTdGNkVcIiwgXCJDb25uZWN0aW9uXCIpIH0pO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIldlYkRBViBcdTU3RkFcdTc4NDBcdTU3MzBcdTU3NDBcIiwgXCJXZWJEQVYgYmFzZSBVUkxcIikpXG4gICAgICAuc2V0RGVzYyh0aGlzLnBsdWdpbi50KFwiXHU2NzBEXHU1MkExXHU1NjY4XHU1N0ZBXHU3ODQwXHU1NzMwXHU1NzQwXHVGRjBDXHU0RjhCXHU1OTgyXHVGRjFBaHR0cDovL3lvdXItd2ViZGF2LWhvc3Q6cG9ydFwiLCBcIkJhc2Ugc2VydmVyIFVSTC4gRXhhbXBsZTogaHR0cDovL3lvdXItd2ViZGF2LWhvc3Q6cG9ydFwiKSlcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiaHR0cDovL3lvdXItd2ViZGF2LWhvc3Q6cG9ydFwiKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy53ZWJkYXZVcmwpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Mud2ViZGF2VXJsID0gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSksXG4gICAgICApO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4RDI2XHU1M0Y3XCIsIFwiVXNlcm5hbWVcIikpXHJcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxyXG4gICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlcm5hbWUpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlcm5hbWUgPSB2YWx1ZS50cmltKCk7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICB9KSxcclxuICAgICAgKTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NUJDNlx1NzgwMVwiLCBcIlBhc3N3b3JkXCIpKVxyXG4gICAgICAuc2V0RGVzYyh0aGlzLnBsdWdpbi50KFwiXHU5RUQ4XHU4QkE0XHU5NjkwXHU4NUNGXHVGRjBDXHU1M0VGXHU3MEI5XHU1MUZCXHU1M0YzXHU0RkE3XHU2MzA5XHU5NEFFXHU2NjNFXHU3OTNBXHU2MjE2XHU5NjkwXHU4NUNGXHUzMDAyXCIsIFwiSGlkZGVuIGJ5IGRlZmF1bHQuIFVzZSB0aGUgYnV0dG9uIG9uIHRoZSByaWdodCB0byBzaG93IG9yIGhpZGUgaXQuXCIpKVxyXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT4ge1xyXG4gICAgICAgIHRleHQuaW5wdXRFbC50eXBlID0gXCJwYXNzd29yZFwiO1xyXG4gICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucGFzc3dvcmQpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucGFzc3dvcmQgPSB2YWx1ZTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KVxyXG4gICAgICAuYWRkRXh0cmFCdXR0b24oKGJ1dHRvbikgPT4ge1xyXG4gICAgICAgIGxldCB2aXNpYmxlID0gZmFsc2U7XHJcbiAgICAgICAgYnV0dG9uLnNldEljb24oXCJleWVcIik7XHJcbiAgICAgICAgYnV0dG9uLnNldFRvb2x0aXAodGhpcy5wbHVnaW4udChcIlx1NjYzRVx1NzkzQVx1NUJDNlx1NzgwMVwiLCBcIlNob3cgcGFzc3dvcmRcIikpO1xyXG4gICAgICAgIGJ1dHRvbi5vbkNsaWNrKCgpID0+IHtcclxuICAgICAgICAgIGNvbnN0IGlucHV0ID0gYnV0dG9uLmV4dHJhU2V0dGluZ3NFbC5wYXJlbnRFbGVtZW50Py5xdWVyeVNlbGVjdG9yKFwiaW5wdXRcIik7XHJcbiAgICAgICAgICBpZiAoIShpbnB1dCBpbnN0YW5jZW9mIEhUTUxJbnB1dEVsZW1lbnQpKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICB2aXNpYmxlID0gIXZpc2libGU7XHJcbiAgICAgICAgICBpbnB1dC50eXBlID0gdmlzaWJsZSA/IFwidGV4dFwiIDogXCJwYXNzd29yZFwiO1xyXG4gICAgICAgICAgYnV0dG9uLnNldEljb24odmlzaWJsZSA/IFwiZXllLW9mZlwiIDogXCJleWVcIik7XHJcbiAgICAgICAgICBidXR0b24uc2V0VG9vbHRpcCh0aGlzLnBsdWdpbi50KHZpc2libGUgPyBcIlx1OTY5MFx1ODVDRlx1NUJDNlx1NzgwMVwiIDogXCJcdTY2M0VcdTc5M0FcdTVCQzZcdTc4MDFcIiwgdmlzaWJsZSA/IFwiSGlkZSBwYXNzd29yZFwiIDogXCJTaG93IHBhc3N3b3JkXCIpKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU1NkZFXHU3MjQ3XHU4RkRDXHU3QTBCXHU3NkVFXHU1RjU1XCIsIFwiSW1hZ2UgcmVtb3RlIGZvbGRlclwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU0RTEzXHU5NUU4XHU3NTI4XHU0RThFXHU1QjU4XHU2NTNFXHU4RkRDXHU3QTBCXHU1NkZFXHU3MjQ3XHU3Njg0IFdlYkRBViBcdTc2RUVcdTVGNTVcdUZGMENcdTRGOEJcdTU5ODJcdUZGMUEvcmVtb3RlLWltYWdlcy9cdTMwMDJcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTYyMTBcdTUyOUZcdTU0MEVcdTRGMUFcdTdBQ0JcdTUzNzNcdTUyMjBcdTk2NjRcdTY3MkNcdTU3MzBcdTU2RkVcdTcyNDdcdTY1ODdcdTRFRjZcdTMwMDJcIixcbiAgICAgICAgICBcIkRlZGljYXRlZCBXZWJEQVYgZm9sZGVyIGZvciByZW1vdGUgaW1hZ2VzLCBmb3IgZXhhbXBsZTogL3JlbW90ZS1pbWFnZXMvLiBMb2NhbCBpbWFnZSBmaWxlcyBhcmUgZGVsZXRlZCBpbW1lZGlhdGVseSBhZnRlciB1cGxvYWQgc3VjY2VlZHMuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZW1vdGVGb2xkZXIpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnJlbW90ZUZvbGRlciA9IG5vcm1hbGl6ZVBhdGgodmFsdWUudHJpbSgpIHx8IFwiL3JlbW90ZS1pbWFnZXMvXCIpO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KSxcbiAgICAgICk7XG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU2RDRCXHU4QkQ1XHU4RkRFXHU2M0E1XCIsIFwiVGVzdCBjb25uZWN0aW9uXCIpKVxyXG4gICAgICAuc2V0RGVzYyh0aGlzLnBsdWdpbi50KFwiXHU0RjdGXHU3NTI4XHU0RTM0XHU2NUY2XHU2M0EyXHU5NDg4XHU2NTg3XHU0RUY2XHU5QThDXHU4QkMxIFBVVFx1MzAwMUdFVFx1MzAwMURFTEVURSBcdTY2MkZcdTU0MjZcdTZCNjNcdTVFMzhcdTMwMDJcIiwgXCJWZXJpZnkgUFVULCBHRVQsIGFuZCBERUxFVEUgdXNpbmcgYSB0ZW1wb3JhcnkgcHJvYmUgZmlsZS5cIikpXHJcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cclxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dCh0aGlzLnBsdWdpbi50KFwiXHU1RjAwXHU1OUNCXHU2RDRCXHU4QkQ1XCIsIFwiUnVuIHRlc3RcIikpLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKHRydWUpO1xyXG4gICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ucnVuQ29ubmVjdGlvblRlc3QodHJ1ZSk7XHJcbiAgICAgICAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQoZmFsc2UpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pLFxyXG4gICAgICApO1xyXG5cclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiB0aGlzLnBsdWdpbi50KFwiXHU1NDBDXHU2QjY1XHU4QkJFXHU3RjZFXCIsIFwiU3luY1wiKSB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1OEZEQ1x1N0EwQlx1N0IxNFx1OEJCMFx1NzZFRVx1NUY1NVwiLCBcIlJlbW90ZSBub3RlcyBmb2xkZXJcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1NzUyOFx1NEU4RVx1NUI1OFx1NjUzRVx1N0IxNFx1OEJCMFx1NTQ4Q1x1NTE3Nlx1NEVENlx1OTc1RVx1NTZGRVx1NzI0N1x1OTY0NFx1NEVGNlx1NTM5Rlx1NjgzN1x1NTQwQ1x1NkI2NVx1NTI2Rlx1NjcyQ1x1NzY4NFx1OEZEQ1x1N0FFRlx1NzZFRVx1NUY1NVx1RkYwQ1x1NEY4Qlx1NTk4Mlx1RkYxQS92YXVsdC1zeW5jL1x1MzAwMlx1NjNEMlx1NEVGNlx1NEYxQVx1ODFFQVx1NTJBOFx1NTQwQ1x1NkI2NVx1NjU3NFx1NEUyQSB2YXVsdFx1RkYwQ1x1NUU3Nlx1OERGM1x1OEZDNyAub2JzaWRpYW5cdTMwMDFcdTYzRDJcdTRFRjZcdTc2RUVcdTVGNTVcdTU0OENcdTU2RkVcdTcyNDdcdTY1ODdcdTRFRjZcdTMwMDJcIixcbiAgICAgICAgICBcIlJlbW90ZSBmb2xkZXIgdXNlZCBmb3Igbm90ZXMgYW5kIG90aGVyIG5vbi1pbWFnZSBhdHRhY2htZW50cyBzeW5jZWQgYXMtaXMsIGZvciBleGFtcGxlOiAvdmF1bHQtc3luYy8uIFRoZSBwbHVnaW4gc3luY3MgdGhlIHdob2xlIHZhdWx0IGFuZCBhdXRvbWF0aWNhbGx5IHNraXBzIC5vYnNpZGlhbiwgdGhlIHBsdWdpbiBkaXJlY3RvcnksIGFuZCBpbWFnZSBmaWxlcy5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnZhdWx0U3luY1JlbW90ZUZvbGRlcikub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyID0gbm9ybWFsaXplUGF0aCh2YWx1ZS50cmltKCkgfHwgXCIvdmF1bHQtc3luYy9cIik7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1ODFFQVx1NTJBOFx1NTQwQ1x1NkI2NVx1OTg5MVx1NzM4N1wiLCBcIkF1dG8gc3luYyBmcmVxdWVuY3lcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1NEVFNVx1NTIwNlx1OTQ5Rlx1NEUzQVx1NTM1NVx1NEY0RFx1OEJCRVx1N0Y2RVx1ODFFQVx1NTJBOFx1NTQwQ1x1NkI2NVx1NjVGNlx1OTVGNFx1MzAwMlx1NTg2QiAwIFx1ODg2OFx1NzkzQVx1NTE3M1x1OTVFRFx1ODFFQVx1NTJBOFx1NTQwQ1x1NkI2NVx1MzAwMlx1OEZEOVx1OTFDQ1x1NzY4NFx1NTQwQ1x1NkI2NVx1NjYyRlx1MjAxQ1x1NUJGOVx1OEQyNlx1NTQwQ1x1NkI2NVx1MjAxRFx1RkYxQVx1NEYxQVx1NjhDMFx1NjdFNVx1NjcyQ1x1NTczMFx1NEUwRVx1OEZEQ1x1N0FFRlx1NzZFRVx1NUY1NVx1NURFRVx1NUYwMlx1RkYwQ1x1ODg2NVx1NEYyMFx1NjVCMFx1NTg5RVx1NTQ4Q1x1NTNEOFx1NjZGNFx1NjU4N1x1NEVGNlx1RkYwQ1x1NUU3Nlx1NTIyMFx1OTY2NFx1OEZEQ1x1N0FFRlx1NTkxQVx1NEY1OVx1NTE4NVx1NUJCOVx1MzAwMlwiLFxuICAgICAgICAgIFwiU2V0IHRoZSBhdXRvbWF0aWMgc3luYyBpbnRlcnZhbCBpbiBtaW51dGVzLiBVc2UgMCB0byB0dXJuIGl0IG9mZi4gVGhpcyBpcyBhIHJlY29uY2lsaWF0aW9uIHN5bmM6IGl0IGNoZWNrcyBsb2NhbCBhbmQgcmVtb3RlIGRpZmZlcmVuY2VzLCB1cGxvYWRzIG5ldyBvciBjaGFuZ2VkIGZpbGVzLCBhbmQgcmVtb3ZlcyBleHRyYSByZW1vdGUgY29udGVudC5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiMFwiKVxuICAgICAgICAgIC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXMpKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IE51bWJlci5wYXJzZUludCh2YWx1ZSwgMTApO1xuICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNOYU4ocGFyc2VkKSkge1xuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvU3luY0ludGVydmFsTWludXRlcyA9IE1hdGgubWF4KDAsIHBhcnNlZCk7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1N0IxNFx1OEJCMFx1NjcyQ1x1NTczMFx1NEZERFx1NzU1OVx1NkEyMVx1NUYwRlwiLCBcIk5vdGUgbG9jYWwgcmV0ZW50aW9uIG1vZGVcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1NUI4Q1x1NjU3NFx1NjcyQ1x1NTczMFx1RkYxQVx1N0IxNFx1OEJCMFx1NTlDQlx1N0VDOFx1NEZERFx1NzU1OVx1NTcyOFx1NjcyQ1x1NTczMFx1MzAwMlx1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFx1RkYxQVx1OTU3Rlx1NjcxRlx1NjcyQVx1OEJCRlx1OTVFRVx1NzY4NCBNYXJrZG93biBcdTdCMTRcdThCQjBcdTRGMUFcdTg4QUJcdTY2RkZcdTYzNjJcdTRFM0FcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTY1ODdcdTRFRjZcdUZGMENcdTYyNTNcdTVGMDBcdTY1RjZcdTUxOERcdTRFQ0VcdThGRENcdTdBRUZcdTYwNjJcdTU5MERcdTMwMDJcIixcbiAgICAgICAgICBcIkZ1bGwgbG9jYWw6IG5vdGVzIGFsd2F5cyBzdGF5IGxvY2FsLiBMYXp5IG5vdGVzOiBzdGFsZSBNYXJrZG93biBub3RlcyBhcmUgcmVwbGFjZWQgd2l0aCBsb2NhbCBwbGFjZWhvbGRlciBmaWxlcyBhbmQgcmVzdG9yZWQgZnJvbSByZW1vdGUgd2hlbiBvcGVuZWQuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkRHJvcGRvd24oKGRyb3Bkb3duKSA9PlxuICAgICAgICBkcm9wZG93blxuICAgICAgICAgIC5hZGRPcHRpb24oXCJmdWxsLWxvY2FsXCIsIHRoaXMucGx1Z2luLnQoXCJcdTVCOENcdTY1NzRcdTY3MkNcdTU3MzBcIiwgXCJGdWxsIGxvY2FsXCIpKVxuICAgICAgICAgIC5hZGRPcHRpb24oXCJsYXp5LW5vdGVzXCIsIHRoaXMucGx1Z2luLnQoXCJcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTdCMTRcdThCQjBcIiwgXCJMYXp5IG5vdGVzXCIpKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlU3RvcmFnZU1vZGUpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Mubm90ZVN0b3JhZ2VNb2RlID0gdmFsdWUgYXMgXCJmdWxsLWxvY2FsXCIgfCBcImxhenktbm90ZXNcIjtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1N0IxNFx1OEJCMFx1NjcyQ1x1NTczMFx1NTZERVx1NjUzNlx1NTkyOVx1NjU3MFwiLCBcIk5vdGUgZXZpY3Rpb24gZGF5c1wiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU0RUM1XHU1NzI4XHUyMDFDXHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXHUyMDFEXHU2QTIxXHU1RjBGXHU0RTBCXHU3NTFGXHU2NTQ4XHUzMDAyXHU4RDg1XHU4RkM3XHU4RkQ5XHU0RTJBXHU1OTI5XHU2NTcwXHU2NzJBXHU2MjUzXHU1RjAwXHU3Njg0IE1hcmtkb3duIFx1N0IxNFx1OEJCMFx1RkYwQ1x1NEYxQVx1NTcyOFx1NTQwQ1x1NkI2NVx1NTQwRVx1ODhBQlx1NjZGRlx1NjM2Mlx1NEUzQVx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1NjU4N1x1NEVGNlx1MzAwMlwiLFxuICAgICAgICAgIFwiVXNlZCBvbmx5IGluIGxhenkgbm90ZSBtb2RlLiBNYXJrZG93biBub3RlcyBub3Qgb3BlbmVkIHdpdGhpbiB0aGlzIG51bWJlciBvZiBkYXlzIGFyZSByZXBsYWNlZCB3aXRoIGxvY2FsIHBsYWNlaG9sZGVyIGZpbGVzIGFmdGVyIHN5bmMuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcIjMwXCIpXG4gICAgICAgICAgLnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlRXZpY3RBZnRlckRheXMpKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IE51bWJlci5wYXJzZUludCh2YWx1ZSwgMTApO1xuICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNOYU4ocGFyc2VkKSkge1xuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlRXZpY3RBZnRlckRheXMgPSBNYXRoLm1heCgxLCBwYXJzZWQpO1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTU0MENcdTZCNjVcdTcyQjZcdTYwMDFcIiwgXCJTeW5jIHN0YXR1c1wiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIGAke3RoaXMucGx1Z2luLmZvcm1hdExhc3RTeW5jTGFiZWwoKX1cXG4ke3RoaXMucGx1Z2luLmZvcm1hdFN5bmNTdGF0dXNMYWJlbCgpfVxcbiR7dGhpcy5wbHVnaW4udChcIlx1OEJGNFx1NjYwRVx1RkYxQVx1N0FDQlx1NTM3M1x1NTQwQ1x1NkI2NVx1NEYxQVx1NjI2N1x1ODg0Q1x1NjcyQ1x1NTczMFx1NEUwRVx1OEZEQ1x1N0FFRlx1NzY4NFx1NUJGOVx1OEQyNlx1RkYwQ1x1NTQwQ1x1NkI2NVx1N0IxNFx1OEJCMFx1NEUwRVx1OTc1RVx1NTZGRVx1NzI0N1x1OTY0NFx1NEVGNlx1RkYwQ1x1NUU3Nlx1NkUwNVx1NzQwNlx1OEZEQ1x1N0FFRlx1NTE5N1x1NEY1OVx1NjU4N1x1NEVGNlx1MzAwMlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NEVDRFx1NzUzMVx1NzJFQ1x1N0FDQlx1OTYxRlx1NTIxN1x1NTkwNFx1NzQwNlx1MzAwMlwiLCBcIk5vdGU6IFN5bmMgbm93IHJlY29uY2lsZXMgbG9jYWwgYW5kIHJlbW90ZSBjb250ZW50LCBzeW5jcyBub3RlcyBhbmQgbm9uLWltYWdlIGF0dGFjaG1lbnRzLCBhbmQgY2xlYW5zIGV4dHJhIHJlbW90ZSBmaWxlcy4gSW1hZ2UgdXBsb2FkcyBjb250aW51ZSB0byBiZSBoYW5kbGVkIGJ5IHRoZSBzZXBhcmF0ZSBxdWV1ZS5cIil9YCxcbiAgICAgICAgICBgJHt0aGlzLnBsdWdpbi5mb3JtYXRMYXN0U3luY0xhYmVsKCl9XFxuJHt0aGlzLnBsdWdpbi5mb3JtYXRTeW5jU3RhdHVzTGFiZWwoKX1cXG4ke3RoaXMucGx1Z2luLnQoXCJcdThCRjRcdTY2MEVcdUZGMUFcdTdBQ0JcdTUzNzNcdTU0MENcdTZCNjVcdTRGMUFcdTYyNjdcdTg4NENcdTY3MkNcdTU3MzBcdTRFMEVcdThGRENcdTdBRUZcdTc2ODRcdTVCRjlcdThEMjZcdUZGMENcdTU0MENcdTZCNjVcdTdCMTRcdThCQjBcdTRFMEVcdTk3NUVcdTU2RkVcdTcyNDdcdTk2NDRcdTRFRjZcdUZGMENcdTVFNzZcdTZFMDVcdTc0MDZcdThGRENcdTdBRUZcdTUxOTdcdTRGNTlcdTY1ODdcdTRFRjZcdTMwMDJcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTRFQ0RcdTc1MzFcdTcyRUNcdTdBQ0JcdTk2MUZcdTUyMTdcdTU5MDRcdTc0MDZcdTMwMDJcIiwgXCJOb3RlOiBTeW5jIG5vdyByZWNvbmNpbGVzIGxvY2FsIGFuZCByZW1vdGUgY29udGVudCwgc3luY3Mgbm90ZXMgYW5kIG5vbi1pbWFnZSBhdHRhY2htZW50cywgYW5kIGNsZWFucyBleHRyYSByZW1vdGUgZmlsZXMuIEltYWdlIHVwbG9hZHMgY29udGludWUgdG8gYmUgaGFuZGxlZCBieSB0aGUgc2VwYXJhdGUgcXVldWUuXCIpfWAsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KHRoaXMucGx1Z2luLnQoXCJcdTdBQ0JcdTUzNzNcdTU0MENcdTZCNjVcIiwgXCJTeW5jIG5vd1wiKSkub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKHRydWUpO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zeW5jQ29uZmlndXJlZFZhdWx0Q29udGVudCh0cnVlKTtcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQoZmFsc2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMucGx1Z2luLnQoXCJcdTRFMDBcdTZCMjFcdTYwMjdcdTVERTVcdTUxNzdcIiwgXCJPbmUtdGltZSB0b29sc1wiKSB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1OEZDMVx1NzlGQlx1NjU3NFx1NUU5M1x1NTM5Rlx1NzUxRlx1NTZGRVx1NzI0N1x1NUYxNVx1NzUyOFwiLCBcIk1pZ3JhdGUgbmF0aXZlIGltYWdlIGVtYmVkcyBpbiB2YXVsdFwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU2MjZCXHU2M0NGXHU2NTc0XHU1RTkzXHU2MjQwXHU2NzA5IE1hcmtkb3duIFx1N0IxNFx1OEJCMFx1RkYwQ1x1NjI4QSBPYnNpZGlhbiBcdTUzOUZcdTc1MUZcdTY3MkNcdTU3MzBcdTU2RkVcdTcyNDdcdTVGMTVcdTc1MjhcdUZGMDhcdTU5ODIgIVtdKCkgXHU1NDhDICFbWy4uLl1dXHVGRjA5XHU0RTBBXHU0RjIwXHU1MjMwXHU4RkRDXHU3QUVGXHU1NkZFXHU3MjQ3XHU3NkVFXHU1RjU1XHVGRjBDXHU1RTc2XHU2NTM5XHU1MTk5XHU0RTNBIHNlY3VyZS13ZWJkYXYgXHU0RUUzXHU3ODAxXHU1NzU3XHUzMDAyXHU2NUU3XHU3MjQ4IHNwYW4gXHU1NDhDXHU2NUU5XHU2NzFGIHdlYmRhdi1zZWN1cmUgXHU5NEZFXHU2M0E1XHU0RTVGXHU0RjFBXHU0RTAwXHU1RTc2XHU2NTM2XHU2NTVCXHU1MjMwXHU2NUIwXHU2ODNDXHU1RjBGXHUzMDAyXCIsXG4gICAgICAgICAgXCJTY2FuIGFsbCBNYXJrZG93biBub3RlcyBpbiB0aGUgdmF1bHQsIHVwbG9hZCBuYXRpdmUgbG9jYWwgaW1hZ2UgZW1iZWRzIChzdWNoIGFzICFbXSgpIGFuZCAhW1suLi5dXSkgdG8gdGhlIHJlbW90ZSBpbWFnZSBmb2xkZXIsIGFuZCByZXdyaXRlIHRoZW0gYXMgc2VjdXJlLXdlYmRhdiBjb2RlIGJsb2Nrcy4gTGVnYWN5IHNwYW4gdGFncyBhbmQgZWFybHkgd2ViZGF2LXNlY3VyZSBsaW5rcyBhcmUgYWxzbyBub3JtYWxpemVkIHRvIHRoZSBuZXcgZm9ybWF0LlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dCh0aGlzLnBsdWdpbi50KFwiXHU1RjAwXHU1OUNCXHU4RkMxXHU3OUZCXCIsIFwiUnVuIG1pZ3JhdGlvblwiKSkub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKHRydWUpO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5taWdyYXRlQWxsTGVnYWN5U2VjdXJlSW1hZ2VzKCk7XG4gICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZChmYWxzZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KSxcbiAgICAgICk7XG4gIH1cbn1cblxyXG5jbGFzcyBSZXN1bHRNb2RhbCBleHRlbmRzIE1vZGFsIHtcclxuICBwcml2YXRlIHJlYWRvbmx5IHRpdGxlVGV4dDogc3RyaW5nO1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgYm9keVRleHQ6IHN0cmluZztcclxuXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHRpdGxlVGV4dDogc3RyaW5nLCBib2R5VGV4dDogc3RyaW5nKSB7XHJcbiAgICBzdXBlcihhcHApO1xyXG4gICAgdGhpcy50aXRsZVRleHQgPSB0aXRsZVRleHQ7XHJcbiAgICB0aGlzLmJvZHlUZXh0ID0gYm9keVRleHQ7XHJcbiAgfVxyXG5cclxuICBvbk9wZW4oKTogdm9pZCB7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiB0aGlzLnRpdGxlVGV4dCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiB0aGlzLmJvZHlUZXh0IH0pO1xyXG4gIH1cclxuXHJcbiAgb25DbG9zZSgpOiB2b2lkIHtcclxuICAgIHRoaXMuY29udGVudEVsLmVtcHR5KCk7XHJcbiAgfVxyXG59XHJcblxyXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQyxzQkFnQk07QUFxRFAsSUFBTSxtQkFBeUM7QUFB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
