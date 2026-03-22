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
      this.syncIndex = new Map(
        Object.entries(candidate.syncIndex ?? {})
      );
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
      const localRemotePaths = /* @__PURE__ */ new Set();
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
              remotePath
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
        this.buildExpectedRemoteDirectories(localRemotePaths, this.settings.vaultSyncRemoteFolder)
      );
      const imageCleanup = await this.reconcileRemoteImages();
      const evictedNotes = await this.evictStaleSyncedNotes(false);
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.t(
        `\u5DF2\u5BF9\u8D26\u540C\u6B65 ${uploaded} \u4E2A\u6587\u4EF6\uFF0C\u8DF3\u8FC7 ${skipped} \u4E2A\u672A\u53D8\u5316\u6587\u4EF6\uFF0C\u5220\u9664\u8FDC\u7AEF\u591A\u4F59\u5185\u5BB9 ${deletedRemoteFiles} \u4E2A\u3001\u76EE\u5F55 ${deletedRemoteDirectories} \u4E2A\uFF0C\u6E05\u7406\u5197\u4F59\u56FE\u7247 ${imageCleanup.deletedFiles} \u5F20\u3001\u76EE\u5F55 ${imageCleanup.deletedDirectories} \u4E2A${evictedNotes > 0 ? `\uFF0C\u56DE\u6536\u672C\u5730\u65E7\u7B14\u8BB0 ${evictedNotes} \u7BC7` : ""}${missingRemoteBackedNotes > 0 ? `\uFF0C\u5E76\u53D1\u73B0 ${missingRemoteBackedNotes} \u7BC7\u6309\u9700\u7B14\u8BB0\u7F3A\u5C11\u8FDC\u7AEF\u6B63\u6587` : ""}\u3002`,
        `Reconciled sync uploaded ${uploaded} file(s), skipped ${skipped} unchanged file(s), deleted ${deletedRemoteFiles} extra remote content file(s), removed ${deletedRemoteDirectories} remote director${deletedRemoteDirectories === 1 ? "y" : "ies"}, cleaned ${imageCleanup.deletedFiles} orphaned remote image(s) plus ${imageCleanup.deletedDirectories} director${imageCleanup.deletedDirectories === 1 ? "y" : "ies"}${evictedNotes > 0 ? `, and evicted ${evictedNotes} stale local note(s)` : ""}${missingRemoteBackedNotes > 0 ? `, while detecting ${missingRemoteBackedNotes} lazy note(s) missing their remote content` : ""}.`
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
      const response = await this.requestUrl({
        url: this.buildUploadUrl(stub.remotePath),
        method: "GET",
        headers: {
          Authorization: this.buildAuthHeader()
        }
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`GET failed with status ${response.status}`);
      }
      const hydrated = this.decodeUtf8(response.arrayBuffer);
      await this.app.vault.modify(file, hydrated);
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
    for (const remotePath of [...remoteInventory.files].sort((a, b) => b.localeCompare(a))) {
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
        await this.app.vault.modify(file, this.buildNoteStub(file));
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
    const files = /* @__PURE__ */ new Set();
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
        files.add(entry.remotePath);
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
  parsePropfindDirectoryListing(xmlText, requestedPath) {
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
      if (normalizedPath === requestedPath || normalizedPath === requestedPath.replace(/\/+$/, "")) {
        continue;
      }
      entries.set(normalizedPath, {
        remotePath: normalizedPath,
        isCollection
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiXHVGRUZGaW1wb3J0IHtcclxuICBBcHAsXG4gIEVkaXRvcixcbiAgTWFya2Rvd25GaWxlSW5mbyxcbiAgTWFya2Rvd25SZW5kZXJDaGlsZCxcbiAgTWFya2Rvd25WaWV3LFxyXG4gIE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQsXHJcbiAgTW9kYWwsXHJcbiAgTm90aWNlLFxyXG4gIFBsdWdpbixcclxuICBQbHVnaW5TZXR0aW5nVGFiLFxyXG4gIFNldHRpbmcsXHJcbiAgVEFic3RyYWN0RmlsZSxcclxuICBURmlsZSxcbiAgbm9ybWFsaXplUGF0aCxcbiAgcmVxdWVzdFVybCBhcyBvYnNpZGlhblJlcXVlc3RVcmwsXG59IGZyb20gXCJvYnNpZGlhblwiO1xuXHJcbnR5cGUgU2VjdXJlV2ViZGF2U2V0dGluZ3MgPSB7XG4gIHdlYmRhdlVybDogc3RyaW5nO1xuICB1c2VybmFtZTogc3RyaW5nO1xuICBwYXNzd29yZDogc3RyaW5nO1xuICByZW1vdGVGb2xkZXI6IHN0cmluZztcbiAgdmF1bHRTeW5jUmVtb3RlRm9sZGVyOiBzdHJpbmc7XG4gIG5hbWluZ1N0cmF0ZWd5OiBcInRpbWVzdGFtcFwiIHwgXCJoYXNoXCI7XG4gIGRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQ6IGJvb2xlYW47XG4gIGxhbmd1YWdlOiBcImF1dG9cIiB8IFwiemhcIiB8IFwiZW5cIjtcbiAgbm90ZVN0b3JhZ2VNb2RlOiBcImZ1bGwtbG9jYWxcIiB8IFwibGF6eS1ub3Rlc1wiO1xuICBub3RlRXZpY3RBZnRlckRheXM6IG51bWJlcjtcbiAgYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXM6IG51bWJlcjtcbiAgbWF4UmV0cnlBdHRlbXB0czogbnVtYmVyO1xuICByZXRyeURlbGF5U2Vjb25kczogbnVtYmVyO1xuICBkZWxldGVSZW1vdGVXaGVuVW5yZWZlcmVuY2VkOiBib29sZWFuO1xuICBjb21wcmVzc0ltYWdlczogYm9vbGVhbjtcbiAgY29tcHJlc3NUaHJlc2hvbGRLYjogbnVtYmVyO1xuICBtYXhJbWFnZURpbWVuc2lvbjogbnVtYmVyO1xuICBqcGVnUXVhbGl0eTogbnVtYmVyO1xufTtcblxyXG50eXBlIFVwbG9hZFRhc2sgPSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5vdGVQYXRoOiBzdHJpbmc7XG4gIHBsYWNlaG9sZGVyOiBzdHJpbmc7XG4gIG1pbWVUeXBlOiBzdHJpbmc7XHJcbiAgZmlsZU5hbWU6IHN0cmluZztcclxuICBkYXRhQmFzZTY0OiBzdHJpbmc7XHJcbiAgYXR0ZW1wdHM6IG51bWJlcjtcclxuICBjcmVhdGVkQXQ6IG51bWJlcjtcclxuICBsYXN0RXJyb3I/OiBzdHJpbmc7XG59O1xuXG50eXBlIFN5bmNJbmRleEVudHJ5ID0ge1xuICBzaWduYXR1cmU6IHN0cmluZztcbiAgcmVtb3RlUGF0aDogc3RyaW5nO1xufTtcblxudHlwZSBSZW1vdGVJbnZlbnRvcnkgPSB7XG4gIGZpbGVzOiBTZXQ8c3RyaW5nPjtcbiAgZGlyZWN0b3JpZXM6IFNldDxzdHJpbmc+O1xufTtcblxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogU2VjdXJlV2ViZGF2U2V0dGluZ3MgPSB7XG4gIHdlYmRhdlVybDogXCJcIixcbiAgdXNlcm5hbWU6IFwiXCIsXG4gIHBhc3N3b3JkOiBcIlwiLFxuICByZW1vdGVGb2xkZXI6IFwiL3JlbW90ZS1pbWFnZXMvXCIsXG4gIHZhdWx0U3luY1JlbW90ZUZvbGRlcjogXCIvdmF1bHQtc3luYy9cIixcbiAgbmFtaW5nU3RyYXRlZ3k6IFwiaGFzaFwiLFxuICBkZWxldGVMb2NhbEFmdGVyVXBsb2FkOiB0cnVlLFxuICBsYW5ndWFnZTogXCJhdXRvXCIsXG4gIG5vdGVTdG9yYWdlTW9kZTogXCJmdWxsLWxvY2FsXCIsXG4gIG5vdGVFdmljdEFmdGVyRGF5czogMzAsXG4gIGF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzOiAwLFxuICBtYXhSZXRyeUF0dGVtcHRzOiA1LFxuICByZXRyeURlbGF5U2Vjb25kczogNSxcbiAgZGVsZXRlUmVtb3RlV2hlblVucmVmZXJlbmNlZDogdHJ1ZSxcbiAgY29tcHJlc3NJbWFnZXM6IHRydWUsXG4gIGNvbXByZXNzVGhyZXNob2xkS2I6IDMwMCxcbiAgbWF4SW1hZ2VEaW1lbnNpb246IDIyMDAsXG4gIGpwZWdRdWFsaXR5OiA4Mixcbn07XG5cclxuY29uc3QgU0VDVVJFX1BST1RPQ09MID0gXCJ3ZWJkYXYtc2VjdXJlOlwiO1xuY29uc3QgU0VDVVJFX0NPREVfQkxPQ0sgPSBcInNlY3VyZS13ZWJkYXZcIjtcbmNvbnN0IFNFQ1VSRV9OT1RFX1NUVUIgPSBcInNlY3VyZS13ZWJkYXYtbm90ZS1zdHViXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFNlY3VyZVdlYmRhdkltYWdlc1BsdWdpbiBleHRlbmRzIFBsdWdpbiB7XG4gIHNldHRpbmdzOiBTZWN1cmVXZWJkYXZTZXR0aW5ncyA9IERFRkFVTFRfU0VUVElOR1M7XG4gIHF1ZXVlOiBVcGxvYWRUYXNrW10gPSBbXTtcbiAgcHJpdmF0ZSBibG9iVXJscyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIHByb2Nlc3NpbmdUYXNrSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgcmV0cnlUaW1lb3V0cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG4gIHByaXZhdGUgbm90ZVJlbW90ZVJlZnMgPSBuZXcgTWFwPHN0cmluZywgU2V0PHN0cmluZz4+KCk7XG4gIHByaXZhdGUgcmVtb3RlQ2xlYW51cEluRmxpZ2h0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgbm90ZUFjY2Vzc1RpbWVzdGFtcHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICBwcml2YXRlIHN5bmNJbmRleCA9IG5ldyBNYXA8c3RyaW5nLCBTeW5jSW5kZXhFbnRyeT4oKTtcbiAgcHJpdmF0ZSBsYXN0VmF1bHRTeW5jQXQgPSAwO1xuICBwcml2YXRlIGxhc3RWYXVsdFN5bmNTdGF0dXMgPSBcIlwiO1xuICBwcml2YXRlIHN5bmNJblByb2dyZXNzID0gZmFsc2U7XG5cclxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgYXdhaXQgdGhpcy5sb2FkUGx1Z2luU3RhdGUoKTtcblxuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgU2VjdXJlV2ViZGF2U2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInVwbG9hZC1jdXJyZW50LW5vdGUtbG9jYWwtaW1hZ2VzXCIsXG4gICAgICBuYW1lOiBcIlVwbG9hZCBsb2NhbCBpbWFnZXMgaW4gY3VycmVudCBub3RlIHRvIFdlYkRBVlwiLFxuICAgICAgY2hlY2tDYWxsYmFjazogKGNoZWNraW5nKSA9PiB7XHJcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XHJcbiAgICAgICAgaWYgKCFmaWxlKSB7XHJcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoIWNoZWNraW5nKSB7XHJcbiAgICAgICAgICB2b2lkIHRoaXMudXBsb2FkSW1hZ2VzSW5Ob3RlKGZpbGUpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwidGVzdC13ZWJkYXYtY29ubmVjdGlvblwiLFxuICAgICAgbmFtZTogXCJUZXN0IFdlYkRBViBjb25uZWN0aW9uXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4ge1xuICAgICAgICB2b2lkIHRoaXMucnVuQ29ubmVjdGlvblRlc3QodHJ1ZSk7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInN5bmMtY29uZmlndXJlZC12YXVsdC1jb250ZW50LXRvLXdlYmRhdlwiLFxuICAgICAgbmFtZTogXCJTeW5jIHZhdWx0IGNvbnRlbnQgdG8gV2ViREFWXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4ge1xuICAgICAgICB2b2lkIHRoaXMucnVuTWFudWFsU3luYygpO1xuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHJpYmJvbiA9IHRoaXMuYWRkUmliYm9uSWNvbihcInJlZnJlc2gtY3dcIiwgdGhpcy50KFwiXHU3QUNCXHU1MzczXHU1NDBDXHU2QjY1XHU1MjMwIFdlYkRBVlwiLCBcIlN5bmMgdG8gV2ViREFWIG5vd1wiKSwgKCkgPT4ge1xuICAgICAgdm9pZCB0aGlzLnJ1bk1hbnVhbFN5bmMoKTtcbiAgICB9KTtcbiAgICByaWJib24uYWRkQ2xhc3MoXCJzZWN1cmUtd2ViZGF2LXN5bmMtcmliYm9uXCIpO1xuXHJcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Qb3N0UHJvY2Vzc29yKChlbCwgY3R4KSA9PiB7XG4gICAgICB2b2lkIHRoaXMucHJvY2Vzc1NlY3VyZUltYWdlcyhlbCwgY3R4KTtcbiAgICB9KTtcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoU0VDVVJFX0NPREVfQkxPQ0ssIChzb3VyY2UsIGVsLCBjdHgpID0+IHtcbiAgICAgIHZvaWQgdGhpcy5wcm9jZXNzU2VjdXJlQ29kZUJsb2NrKHNvdXJjZSwgZWwsIGN0eCk7XG4gICAgfSk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJmaWxlLW9wZW5cIiwgKGZpbGUpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmhhbmRsZUZpbGVPcGVuKGZpbGUpO1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImVkaXRvci1wYXN0ZVwiLCAoZXZ0LCBlZGl0b3IsIGluZm8pID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmhhbmRsZUVkaXRvclBhc3RlKGV2dCwgZWRpdG9yLCBpbmZvKTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJlZGl0b3ItZHJvcFwiLCAoZXZ0LCBlZGl0b3IsIGluZm8pID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmhhbmRsZUVkaXRvckRyb3AoZXZ0LCBlZGl0b3IsIGluZm8pO1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIGF3YWl0IHRoaXMucmVidWlsZFJlZmVyZW5jZUluZGV4KCk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwibW9kaWZ5XCIsIChmaWxlKSA9PiB2b2lkIHRoaXMuaGFuZGxlVmF1bHRNb2RpZnkoZmlsZSkpKTtcbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oXCJkZWxldGVcIiwgKGZpbGUpID0+IHZvaWQgdGhpcy5oYW5kbGVWYXVsdERlbGV0ZShmaWxlKSkpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcInJlbmFtZVwiLCAoZmlsZSwgb2xkUGF0aCkgPT4gdm9pZCB0aGlzLmhhbmRsZVZhdWx0UmVuYW1lKGZpbGUsIG9sZFBhdGgpKSk7XG5cbiAgICB0aGlzLnNldHVwQXV0b1N5bmMoKTtcblxuICAgIHZvaWQgdGhpcy5wcm9jZXNzUGVuZGluZ1Rhc2tzKCk7XG5cclxuICAgIHRoaXMucmVnaXN0ZXIoKCkgPT4ge1xyXG4gICAgICBmb3IgKGNvbnN0IGJsb2JVcmwgb2YgdGhpcy5ibG9iVXJscykge1xyXG4gICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwoYmxvYlVybCk7XHJcbiAgICAgIH1cclxuICAgICAgdGhpcy5ibG9iVXJscy5jbGVhcigpO1xyXG4gICAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnJldHJ5VGltZW91dHMudmFsdWVzKCkpIHtcclxuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XHJcbiAgICAgIH1cclxuICAgICAgdGhpcy5yZXRyeVRpbWVvdXRzLmNsZWFyKCk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIG9udW5sb2FkKCkge1xyXG4gICAgZm9yIChjb25zdCBibG9iVXJsIG9mIHRoaXMuYmxvYlVybHMpIHtcclxuICAgICAgVVJMLnJldm9rZU9iamVjdFVSTChibG9iVXJsKTtcclxuICAgIH1cclxuICAgIHRoaXMuYmxvYlVybHMuY2xlYXIoKTtcclxuICAgIGZvciAoY29uc3QgdGltZW91dElkIG9mIHRoaXMucmV0cnlUaW1lb3V0cy52YWx1ZXMoKSkge1xyXG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XHJcbiAgICB9XHJcbiAgICB0aGlzLnJldHJ5VGltZW91dHMuY2xlYXIoKTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGxvYWRQbHVnaW5TdGF0ZSgpIHtcbiAgICBjb25zdCBsb2FkZWQgPSBhd2FpdCB0aGlzLmxvYWREYXRhKCk7XG4gICAgaWYgKCFsb2FkZWQgfHwgdHlwZW9mIGxvYWRlZCAhPT0gXCJvYmplY3RcIikge1xuICAgICAgdGhpcy5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUyB9O1xuICAgICAgdGhpcy5xdWV1ZSA9IFtdO1xuICAgICAgdGhpcy5ub3RlQWNjZXNzVGltZXN0YW1wcyA9IG5ldyBNYXAoKTtcbiAgICAgIHRoaXMuc3luY0luZGV4ID0gbmV3IE1hcCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGNhbmRpZGF0ZSA9IGxvYWRlZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICBpZiAoXCJzZXR0aW5nc1wiIGluIGNhbmRpZGF0ZSB8fCBcInF1ZXVlXCIgaW4gY2FuZGlkYXRlKSB7XG4gICAgICB0aGlzLnNldHRpbmdzID0geyAuLi5ERUZBVUxUX1NFVFRJTkdTLCAuLi4oKGNhbmRpZGF0ZS5zZXR0aW5ncyBhcyBQYXJ0aWFsPFNlY3VyZVdlYmRhdlNldHRpbmdzPikgPz8ge30pIH07XG4gICAgICB0aGlzLnF1ZXVlID0gQXJyYXkuaXNBcnJheShjYW5kaWRhdGUucXVldWUpID8gKGNhbmRpZGF0ZS5xdWV1ZSBhcyBVcGxvYWRUYXNrW10pIDogW107XG4gICAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzID0gbmV3IE1hcChcbiAgICAgICAgT2JqZWN0LmVudHJpZXMoKGNhbmRpZGF0ZS5ub3RlQWNjZXNzVGltZXN0YW1wcyBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHwgdW5kZWZpbmVkKSA/PyB7fSksXG4gICAgICApO1xuICAgICAgdGhpcy5zeW5jSW5kZXggPSBuZXcgTWFwKFxuICAgICAgICBPYmplY3QuZW50cmllcygoY2FuZGlkYXRlLnN5bmNJbmRleCBhcyBSZWNvcmQ8c3RyaW5nLCBTeW5jSW5kZXhFbnRyeT4gfCB1bmRlZmluZWQpID8/IHt9KSxcbiAgICAgICk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9XG4gICAgICAgIHR5cGVvZiBjYW5kaWRhdGUubGFzdFZhdWx0U3luY0F0ID09PSBcIm51bWJlclwiID8gY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNBdCA6IDA7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPVxuICAgICAgICB0eXBlb2YgY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNTdGF0dXMgPT09IFwic3RyaW5nXCIgPyBjYW5kaWRhdGUubGFzdFZhdWx0U3luY1N0YXR1cyA6IFwiXCI7XG4gICAgICB0aGlzLm5vcm1hbGl6ZUVmZmVjdGl2ZVNldHRpbmdzKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUywgLi4uKGNhbmRpZGF0ZSBhcyBQYXJ0aWFsPFNlY3VyZVdlYmRhdlNldHRpbmdzPikgfTtcbiAgICB0aGlzLnF1ZXVlID0gW107XG4gICAgdGhpcy5ub3RlQWNjZXNzVGltZXN0YW1wcyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLnN5bmNJbmRleCA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IDA7XG4gICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gXCJcIjtcbiAgICB0aGlzLm5vcm1hbGl6ZUVmZmVjdGl2ZVNldHRpbmdzKCk7XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUVmZmVjdGl2ZVNldHRpbmdzKCkge1xuICAgIC8vIEtlZXAgdGhlIHB1YmxpYyBzZXR0aW5ncyBzdXJmYWNlIGludGVudGlvbmFsbHkgc21hbGwgYW5kIGRldGVybWluaXN0aWMuXG4gICAgdGhpcy5zZXR0aW5ncy5kZWxldGVMb2NhbEFmdGVyVXBsb2FkID0gdHJ1ZTtcbiAgICB0aGlzLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzID0gTWF0aC5tYXgoMCwgTWF0aC5mbG9vcih0aGlzLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzIHx8IDApKTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0dXBBdXRvU3luYygpIHtcbiAgICBjb25zdCBtaW51dGVzID0gdGhpcy5zZXR0aW5ncy5hdXRvU3luY0ludGVydmFsTWludXRlcztcbiAgICBpZiAobWludXRlcyA8PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaW50ZXJ2YWxNcyA9IG1pbnV0ZXMgKiA2MCAqIDEwMDA7XG4gICAgdGhpcy5yZWdpc3RlckludGVydmFsKFxuICAgICAgd2luZG93LnNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLnByb2Nlc3NQZW5kaW5nVGFza3MoKTtcbiAgICAgICAgdm9pZCB0aGlzLnN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50KGZhbHNlKTtcbiAgICAgIH0sIGludGVydmFsTXMpLFxuICAgICk7XG4gIH1cblxuICBhc3luYyBzYXZlUGx1Z2luU3RhdGUoKSB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh7XG4gICAgICBzZXR0aW5nczogdGhpcy5zZXR0aW5ncyxcbiAgICAgIHF1ZXVlOiB0aGlzLnF1ZXVlLFxuICAgICAgbm90ZUFjY2Vzc1RpbWVzdGFtcHM6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzLmVudHJpZXMoKSksXG4gICAgICBzeW5jSW5kZXg6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLnN5bmNJbmRleC5lbnRyaWVzKCkpLFxuICAgICAgbGFzdFZhdWx0U3luY0F0OiB0aGlzLmxhc3RWYXVsdFN5bmNBdCxcbiAgICAgIGxhc3RWYXVsdFN5bmNTdGF0dXM6IHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyxcbiAgICB9KTtcbiAgfVxuXHJcbiAgYXN5bmMgc2F2ZVNldHRpbmdzKCkge1xyXG4gICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcclxuICB9XHJcblxyXG4gIHQoemg6IHN0cmluZywgZW46IHN0cmluZykge1xyXG4gICAgcmV0dXJuIHRoaXMuZ2V0TGFuZ3VhZ2UoKSA9PT0gXCJ6aFwiID8gemggOiBlbjtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZ2V0TGFuZ3VhZ2UoKSB7XG4gICAgaWYgKHRoaXMuc2V0dGluZ3MubGFuZ3VhZ2UgPT09IFwiYXV0b1wiKSB7XG4gICAgICBjb25zdCBsb2NhbGUgPSB0eXBlb2YgbmF2aWdhdG9yICE9PSBcInVuZGVmaW5lZFwiID8gbmF2aWdhdG9yLmxhbmd1YWdlLnRvTG93ZXJDYXNlKCkgOiBcImVuXCI7XG4gICAgICByZXR1cm4gbG9jYWxlLnN0YXJ0c1dpdGgoXCJ6aFwiKSA/IFwiemhcIiA6IFwiZW5cIjtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zZXR0aW5ncy5sYW5ndWFnZTtcbiAgfVxuXG4gIGZvcm1hdExhc3RTeW5jTGFiZWwoKSB7XG4gICAgaWYgKCF0aGlzLmxhc3RWYXVsdFN5bmNBdCkge1xuICAgICAgcmV0dXJuIHRoaXMudChcIlx1NEUwQVx1NkIyMVx1NTQwQ1x1NkI2NVx1RkYxQVx1NUMxQVx1NjcyQVx1NjI2N1x1ODg0Q1wiLCBcIkxhc3Qgc3luYzogbm90IHJ1biB5ZXRcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMudChcbiAgICAgIGBcdTRFMEFcdTZCMjFcdTU0MENcdTZCNjVcdUZGMUEke25ldyBEYXRlKHRoaXMubGFzdFZhdWx0U3luY0F0KS50b0xvY2FsZVN0cmluZygpfWAsXG4gICAgICBgTGFzdCBzeW5jOiAke25ldyBEYXRlKHRoaXMubGFzdFZhdWx0U3luY0F0KS50b0xvY2FsZVN0cmluZygpfWAsXG4gICAgKTtcbiAgfVxuXG4gIGZvcm1hdFN5bmNTdGF0dXNMYWJlbCgpIHtcbiAgICByZXR1cm4gdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzXG4gICAgICA/IHRoaXMudChgXHU2NzAwXHU4RkQxXHU3MkI2XHU2MDAxXHVGRjFBJHt0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXN9YCwgYFJlY2VudCBzdGF0dXM6ICR7dGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzfWApXG4gICAgICA6IHRoaXMudChcIlx1NjcwMFx1OEZEMVx1NzJCNlx1NjAwMVx1RkYxQVx1NjY4Mlx1NjVFMFwiLCBcIlJlY2VudCBzdGF0dXM6IG5vbmVcIik7XG4gIH1cblxuICBhc3luYyBydW5NYW51YWxTeW5jKCkge1xuICAgIGF3YWl0IHRoaXMucHJvY2Vzc1BlbmRpbmdUYXNrcygpO1xuICAgIGF3YWl0IHRoaXMuc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQodHJ1ZSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlYnVpbGRSZWZlcmVuY2VJbmRleCgpIHtcbiAgICBjb25zdCBuZXh0ID0gbmV3IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PigpO1xuICAgIGZvciAoY29uc3QgZmlsZSBvZiB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkpIHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgbmV4dC5zZXQoZmlsZS5wYXRoLCB0aGlzLmV4dHJhY3RSZW1vdGVQYXRoc0Zyb21UZXh0KGNvbnRlbnQpKTtcbiAgICB9XG4gICAgdGhpcy5ub3RlUmVtb3RlUmVmcyA9IG5leHQ7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZVZhdWx0TW9kaWZ5KGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHx8IGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBjb25zdCBuZXh0UmVmcyA9IHRoaXMuZXh0cmFjdFJlbW90ZVBhdGhzRnJvbVRleHQoY29udGVudCk7XG4gICAgY29uc3QgcHJldmlvdXNSZWZzID0gdGhpcy5ub3RlUmVtb3RlUmVmcy5nZXQoZmlsZS5wYXRoKSA/PyBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICB0aGlzLm5vdGVSZW1vdGVSZWZzLnNldChmaWxlLnBhdGgsIG5leHRSZWZzKTtcblxuICAgIGNvbnN0IHJlbW92ZWQgPSBbLi4ucHJldmlvdXNSZWZzXS5maWx0ZXIoKHZhbHVlKSA9PiAhbmV4dFJlZnMuaGFzKHZhbHVlKSk7XG4gICAgZm9yIChjb25zdCByZW1vdGVQYXRoIG9mIHJlbW92ZWQpIHtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlSWZVbnJlZmVyZW5jZWQocmVtb3RlUGF0aCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVWYXVsdERlbGV0ZShmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKGZpbGUucGF0aCkpIHtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlU3luY2VkRW50cnkoZmlsZS5wYXRoKTtcbiAgICB9XG5cbiAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgY29uc3QgcHJldmlvdXNSZWZzID0gdGhpcy5ub3RlUmVtb3RlUmVmcy5nZXQoZmlsZS5wYXRoKSA/PyBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICAgIHRoaXMubm90ZVJlbW90ZVJlZnMuZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICBmb3IgKGNvbnN0IHJlbW90ZVBhdGggb2YgcHJldmlvdXNSZWZzKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlSWZVbnJlZmVyZW5jZWQocmVtb3RlUGF0aCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVWYXVsdFJlbmFtZShmaWxlOiBUQWJzdHJhY3RGaWxlLCBvbGRQYXRoOiBzdHJpbmcpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnNob3VsZFNraXBDb250ZW50U3luY1BhdGgob2xkUGF0aCkpIHtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlU3luY2VkRW50cnkob2xkUGF0aCk7XG4gICAgfVxuXG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIGNvbnN0IHJlZnMgPSB0aGlzLm5vdGVSZW1vdGVSZWZzLmdldChvbGRQYXRoKTtcbiAgICAgIGlmICghcmVmcykge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHRoaXMubm90ZVJlbW90ZVJlZnMuZGVsZXRlKG9sZFBhdGgpO1xuICAgICAgdGhpcy5ub3RlUmVtb3RlUmVmcy5zZXQoZmlsZS5wYXRoLCByZWZzKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RSZW1vdGVQYXRoc0Zyb21UZXh0KGNvbnRlbnQ6IHN0cmluZykge1xuICAgIGNvbnN0IHJlZnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBjb25zdCBzcGFuUmVnZXggPSAvZGF0YS1zZWN1cmUtd2ViZGF2PVwiKFteXCJdKylcIi9nO1xuICAgIGNvbnN0IHByb3RvY29sUmVnZXggPSAvd2ViZGF2LXNlY3VyZTpcXC9cXC8oW15cXHMpXCJdKykvZztcbiAgICBjb25zdCBjb2RlQmxvY2tSZWdleCA9IC9gYGBzZWN1cmUtd2ViZGF2XFxzKyhbXFxzXFxTXSo/KWBgYC9nO1xuICAgIGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblxuICAgIHdoaWxlICgobWF0Y2ggPSBzcGFuUmVnZXguZXhlYyhjb250ZW50KSkgIT09IG51bGwpIHtcbiAgICAgIHJlZnMuYWRkKHRoaXMudW5lc2NhcGVIdG1sKG1hdGNoWzFdKSk7XG4gICAgfVxuXG4gICAgd2hpbGUgKChtYXRjaCA9IHByb3RvY29sUmVnZXguZXhlYyhjb250ZW50KSkgIT09IG51bGwpIHtcbiAgICAgIHJlZnMuYWRkKHRoaXMudW5lc2NhcGVIdG1sKG1hdGNoWzFdKSk7XG4gICAgfVxuXG4gICAgd2hpbGUgKChtYXRjaCA9IGNvZGVCbG9ja1JlZ2V4LmV4ZWMoY29udGVudCkpICE9PSBudWxsKSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSB0aGlzLnBhcnNlU2VjdXJlSW1hZ2VCbG9jayhtYXRjaFsxXSk7XG4gICAgICBpZiAocGFyc2VkPy5wYXRoKSB7XG4gICAgICAgIHJlZnMuYWRkKHBhcnNlZC5wYXRoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVmcztcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZGVsZXRlUmVtb3RlSWZVbnJlZmVyZW5jZWQocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLmRlbGV0ZVJlbW90ZVdoZW5VbnJlZmVyZW5jZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5yZW1vdGVDbGVhbnVwSW5GbGlnaHQuaGFzKHJlbW90ZVBhdGgpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgc3RpbGxSZWZlcmVuY2VkID0gWy4uLnRoaXMubm90ZVJlbW90ZVJlZnMudmFsdWVzKCldLnNvbWUoKHJlZnMpID0+IHJlZnMuaGFzKHJlbW90ZVBhdGgpKTtcbiAgICBpZiAoc3RpbGxSZWZlcmVuY2VkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5yZW1vdGVDbGVhbnVwSW5GbGlnaHQuYWRkKHJlbW90ZVBhdGgpO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSA0MDQgJiYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYERFTEVURSBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZGVsZXRlIHVucmVmZXJlbmNlZCByZW1vdGUgaW1hZ2VcIiwgcmVtb3RlUGF0aCwgZXJyb3IpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLnJlbW90ZUNsZWFudXBJbkZsaWdodC5kZWxldGUocmVtb3RlUGF0aCk7XG4gICAgfVxuICB9XG5cclxuICBwcml2YXRlIGFzeW5jIGJ1aWxkVXBsb2FkUmVwbGFjZW1lbnRzKGNvbnRlbnQ6IHN0cmluZywgbm90ZUZpbGU6IFRGaWxlLCB1cGxvYWRDYWNoZT86IE1hcDxzdHJpbmcsIHN0cmluZz4pIHtcbiAgICBjb25zdCBzZWVuID0gbmV3IE1hcDxzdHJpbmcsIFVwbG9hZFJld3JpdGU+KCk7XG4gICAgY29uc3Qgd2lraU1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvIVxcW1xcWyhbXlxcXV0rKVxcXVxcXS9nKV07XG4gICAgY29uc3QgbWFya2Rvd25NYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtbXlxcXV0qXVxcKChbXildKylcXCkvZyldO1xuICAgIGNvbnN0IGh0bWxJbWFnZU1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvPGltZ1xcYltePl0qc3JjPVtcIiddKFteXCInXSspW1wiJ11bXj5dKj4vZ2kpXTtcblxyXG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiB3aWtpTWF0Y2hlcykge1xyXG4gICAgICBjb25zdCByYXdMaW5rID0gbWF0Y2hbMV0uc3BsaXQoXCJ8XCIpWzBdLnRyaW0oKTtcclxuICAgICAgY29uc3QgZmlsZSA9IHRoaXMucmVzb2x2ZUxpbmtlZEZpbGUocmF3TGluaywgbm90ZUZpbGUucGF0aCk7XHJcbiAgICAgIGlmICghZmlsZSB8fCAhdGhpcy5pc0ltYWdlRmlsZShmaWxlKSkge1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XG5cbiAgICAgIGlmICghc2Vlbi5oYXMobWF0Y2hbMF0pKSB7XG4gICAgICAgIGNvbnN0IHJlbW90ZVVybCA9IGF3YWl0IHRoaXMudXBsb2FkVmF1bHRGaWxlKGZpbGUsIHVwbG9hZENhY2hlKTtcbiAgICAgICAgc2Vlbi5zZXQobWF0Y2hbMF0sIHtcbiAgICAgICAgICBvcmlnaW5hbDogbWF0Y2hbMF0sXG4gICAgICAgICAgcmV3cml0dGVuOiB0aGlzLmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsLCBmaWxlLmJhc2VuYW1lKSxcbiAgICAgICAgICBzb3VyY2VGaWxlOiBmaWxlLFxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWFya2Rvd25NYXRjaGVzKSB7XG4gICAgICBjb25zdCByYXdMaW5rID0gZGVjb2RlVVJJQ29tcG9uZW50KG1hdGNoWzFdLnRyaW0oKS5yZXBsYWNlKC9ePHw+JC9nLCBcIlwiKSk7XG4gICAgICBpZiAoL14od2ViZGF2LXNlY3VyZTp8ZGF0YTopL2kudGVzdChyYXdMaW5rKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuaXNIdHRwVXJsKHJhd0xpbmspKSB7XG4gICAgICAgIGlmICghc2Vlbi5oYXMobWF0Y2hbMF0pKSB7XG4gICAgICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRSZW1vdGVJbWFnZVVybChyYXdMaW5rLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgICAgY29uc3QgYWx0VGV4dCA9IHRoaXMuZXh0cmFjdE1hcmtkb3duQWx0VGV4dChtYXRjaFswXSkgfHwgdGhpcy5nZXREaXNwbGF5TmFtZUZyb21VcmwocmF3TGluayk7XG4gICAgICAgICAgc2Vlbi5zZXQobWF0Y2hbMF0sIHtcbiAgICAgICAgICAgIG9yaWdpbmFsOiBtYXRjaFswXSxcbiAgICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgYWx0VGV4dCksXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGVGaWxlLnBhdGgpO1xuICAgICAgaWYgKCFmaWxlIHx8ICF0aGlzLmlzSW1hZ2VGaWxlKGZpbGUpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFZhdWx0RmlsZShmaWxlLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgICAgb3JpZ2luYWw6IG1hdGNoWzBdLFxuICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgZmlsZS5iYXNlbmFtZSksXG4gICAgICAgICAgc291cmNlRmlsZTogZmlsZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiBodG1sSW1hZ2VNYXRjaGVzKSB7XG4gICAgICBjb25zdCByYXdMaW5rID0gdGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0udHJpbSgpKTtcbiAgICAgIGlmICghdGhpcy5pc0h0dHBVcmwocmF3TGluaykgfHwgc2Vlbi5oYXMobWF0Y2hbMF0pKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFJlbW90ZUltYWdlVXJsKHJhd0xpbmssIHVwbG9hZENhY2hlKTtcbiAgICAgIGNvbnN0IGFsdFRleHQgPSB0aGlzLmV4dHJhY3RIdG1sSW1hZ2VBbHRUZXh0KG1hdGNoWzBdKSB8fCB0aGlzLmdldERpc3BsYXlOYW1lRnJvbVVybChyYXdMaW5rKTtcbiAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgIG9yaWdpbmFsOiBtYXRjaFswXSxcbiAgICAgICAgcmV3cml0dGVuOiB0aGlzLmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsLCBhbHRUZXh0KSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBbLi4uc2Vlbi52YWx1ZXMoKV07XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RNYXJrZG93bkFsdFRleHQobWFya2Rvd25JbWFnZTogc3RyaW5nKSB7XG4gICAgY29uc3QgbWF0Y2ggPSBtYXJrZG93bkltYWdlLm1hdGNoKC9eIVxcWyhbXlxcXV0qKVxcXS8pO1xuICAgIHJldHVybiBtYXRjaD8uWzFdPy50cmltKCkgPz8gXCJcIjtcbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdEh0bWxJbWFnZUFsdFRleHQoaHRtbEltYWdlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtYXRjaCA9IGh0bWxJbWFnZS5tYXRjaCgvXFxiYWx0PVtcIiddKFteXCInXSopW1wiJ10vaSk7XG4gICAgcmV0dXJuIG1hdGNoID8gdGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0udHJpbSgpKSA6IFwiXCI7XG4gIH1cblxuICBwcml2YXRlIGlzSHR0cFVybCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIC9eaHR0cHM/OlxcL1xcLy9pLnRlc3QodmFsdWUpO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXREaXNwbGF5TmFtZUZyb21VcmwocmF3VXJsOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXJsID0gbmV3IFVSTChyYXdVcmwpO1xuICAgICAgY29uc3QgZmlsZU5hbWUgPSB0aGlzLnNhbml0aXplRmlsZU5hbWUodXJsLnBhdGhuYW1lLnNwbGl0KFwiL1wiKS5wb3AoKSB8fCBcIlwiKTtcbiAgICAgIGlmIChmaWxlTmFtZSkge1xuICAgICAgICByZXR1cm4gZmlsZU5hbWUucmVwbGFjZSgvXFwuW14uXSskLywgXCJcIik7XG4gICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBGYWxsIHRocm91Z2ggdG8gdGhlIGdlbmVyaWMgbGFiZWwgYmVsb3cuXG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMudChcIlx1N0Y1MVx1OTg3NVx1NTZGRVx1NzI0N1wiLCBcIldlYiBpbWFnZVwiKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVzb2x2ZUxpbmtlZEZpbGUobGluazogc3RyaW5nLCBzb3VyY2VQYXRoOiBzdHJpbmcpOiBURmlsZSB8IG51bGwge1xuICAgIGNvbnN0IGNsZWFuZWQgPSBsaW5rLnJlcGxhY2UoLyMuKi8sIFwiXCIpLnRyaW0oKTtcbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpcnN0TGlua3BhdGhEZXN0KGNsZWFuZWQsIHNvdXJjZVBhdGgpO1xuICAgIHJldHVybiB0YXJnZXQgaW5zdGFuY2VvZiBURmlsZSA/IHRhcmdldCA6IG51bGw7XG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBpc0ltYWdlRmlsZShmaWxlOiBURmlsZSkge1xuICAgIHJldHVybiAvXihwbmd8anBlP2d8Z2lmfHdlYnB8Ym1wfHN2ZykkL2kudGVzdChmaWxlLmV4dGVuc2lvbik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwbG9hZFZhdWx0RmlsZShmaWxlOiBURmlsZSwgdXBsb2FkQ2FjaGU/OiBNYXA8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgaWYgKHVwbG9hZENhY2hlPy5oYXMoZmlsZS5wYXRoKSkge1xuICAgICAgcmV0dXJuIHVwbG9hZENhY2hlLmdldChmaWxlLnBhdGgpITtcbiAgICB9XG5cbiAgICB0aGlzLmVuc3VyZUNvbmZpZ3VyZWQoKTtcbiAgICBjb25zdCBiaW5hcnkgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgIGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdGhpcy5wcmVwYXJlVXBsb2FkUGF5bG9hZChiaW5hcnksIHRoaXMuZ2V0TWltZVR5cGUoZmlsZS5leHRlbnNpb24pLCBmaWxlLm5hbWUpO1xuICAgIGNvbnN0IHJlbW90ZU5hbWUgPSBhd2FpdCB0aGlzLmJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5KHByZXBhcmVkLmZpbGVOYW1lLCBwcmVwYXJlZC5iaW5hcnkpO1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkUmVtb3RlUGF0aChyZW1vdGVOYW1lKTtcbiAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBwcmVwYXJlZC5iaW5hcnksIHByZXBhcmVkLm1pbWVUeXBlKTtcbiAgICBjb25zdCByZW1vdGVVcmwgPSBgJHtTRUNVUkVfUFJPVE9DT0x9Ly8ke3JlbW90ZVBhdGh9YDtcbiAgICB1cGxvYWRDYWNoZT8uc2V0KGZpbGUucGF0aCwgcmVtb3RlVXJsKTtcbiAgICByZXR1cm4gcmVtb3RlVXJsO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRSZW1vdGVJbWFnZVVybChpbWFnZVVybDogc3RyaW5nLCB1cGxvYWRDYWNoZT86IE1hcDxzdHJpbmcsIHN0cmluZz4pIHtcbiAgICBjb25zdCBjYWNoZUtleSA9IGByZW1vdGU6JHtpbWFnZVVybH1gO1xuICAgIGlmICh1cGxvYWRDYWNoZT8uaGFzKGNhY2hlS2V5KSkge1xuICAgICAgcmV0dXJuIHVwbG9hZENhY2hlLmdldChjYWNoZUtleSkhO1xuICAgIH1cblxuICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogaW1hZ2VVcmwsXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBmb2xsb3dSZWRpcmVjdHM6IHRydWUsXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgUmVtb3RlIGltYWdlIGRvd25sb2FkIGZhaWxlZCB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50VHlwZSA9IHJlc3BvbnNlLmhlYWRlcnNbXCJjb250ZW50LXR5cGVcIl0gPz8gXCJcIjtcbiAgICBpZiAoIXRoaXMuaXNJbWFnZUNvbnRlbnRUeXBlKGNvbnRlbnRUeXBlKSAmJiAhdGhpcy5sb29rc0xpa2VJbWFnZVVybChpbWFnZVVybCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJcdThGRENcdTdBMEJcdTk0RkVcdTYzQTVcdTRFMERcdTY2MkZcdTUzRUZcdThCQzZcdTUyMkJcdTc2ODRcdTU2RkVcdTcyNDdcdThENDRcdTZFOTBcdTMwMDJcIiwgXCJUaGUgcmVtb3RlIFVSTCBkb2VzIG5vdCBsb29rIGxpa2UgYW4gaW1hZ2UgcmVzb3VyY2UuXCIpKTtcbiAgICB9XG5cbiAgICBjb25zdCBmaWxlTmFtZSA9IHRoaXMuYnVpbGRSZW1vdGVTb3VyY2VGaWxlTmFtZShpbWFnZVVybCwgY29udGVudFR5cGUpO1xuICAgIGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdGhpcy5wcmVwYXJlVXBsb2FkUGF5bG9hZChcbiAgICAgIHJlc3BvbnNlLmFycmF5QnVmZmVyLFxuICAgICAgdGhpcy5ub3JtYWxpemVJbWFnZU1pbWVUeXBlKGNvbnRlbnRUeXBlLCBmaWxlTmFtZSksXG4gICAgICBmaWxlTmFtZSxcbiAgICApO1xuICAgIGNvbnN0IHJlbW90ZU5hbWUgPSBhd2FpdCB0aGlzLmJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5KHByZXBhcmVkLmZpbGVOYW1lLCBwcmVwYXJlZC5iaW5hcnkpO1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkUmVtb3RlUGF0aChyZW1vdGVOYW1lKTtcbiAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBwcmVwYXJlZC5iaW5hcnksIHByZXBhcmVkLm1pbWVUeXBlKTtcbiAgICBjb25zdCByZW1vdGVVcmwgPSBgJHtTRUNVUkVfUFJPVE9DT0x9Ly8ke3JlbW90ZVBhdGh9YDtcbiAgICB1cGxvYWRDYWNoZT8uc2V0KGNhY2hlS2V5LCByZW1vdGVVcmwpO1xuICAgIHJldHVybiByZW1vdGVVcmw7XG4gIH1cblxuICBwcml2YXRlIGlzSW1hZ2VDb250ZW50VHlwZShjb250ZW50VHlwZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIC9eaW1hZ2VcXC8vaS50ZXN0KGNvbnRlbnRUeXBlLnRyaW0oKSk7XG4gIH1cblxuICBwcml2YXRlIGxvb2tzTGlrZUltYWdlVXJsKHJhd1VybDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmF3VXJsKTtcbiAgICAgIHJldHVybiAvXFwuKHBuZ3xqcGU/Z3xnaWZ8d2VicHxibXB8c3ZnKSQvaS50ZXN0KHVybC5wYXRobmFtZSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBidWlsZFJlbW90ZVNvdXJjZUZpbGVOYW1lKHJhd1VybDogc3RyaW5nLCBjb250ZW50VHlwZTogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmF3VXJsKTtcbiAgICAgIGNvbnN0IGNhbmRpZGF0ZSA9IHRoaXMuc2FuaXRpemVGaWxlTmFtZSh1cmwucGF0aG5hbWUuc3BsaXQoXCIvXCIpLnBvcCgpIHx8IFwiXCIpO1xuICAgICAgaWYgKGNhbmRpZGF0ZSAmJiAvXFwuW2EtejAtOV0rJC9pLnRlc3QoY2FuZGlkYXRlKSkge1xuICAgICAgICByZXR1cm4gY2FuZGlkYXRlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBleHRlbnNpb24gPSB0aGlzLmdldEV4dGVuc2lvbkZyb21NaW1lVHlwZShjb250ZW50VHlwZSkgfHwgXCJwbmdcIjtcbiAgICAgIHJldHVybiBjYW5kaWRhdGUgPyBgJHtjYW5kaWRhdGV9LiR7ZXh0ZW5zaW9ufWAgOiBgcmVtb3RlLWltYWdlLiR7ZXh0ZW5zaW9ufWA7XG4gICAgfSBjYXRjaCB7XG4gICAgICBjb25zdCBleHRlbnNpb24gPSB0aGlzLmdldEV4dGVuc2lvbkZyb21NaW1lVHlwZShjb250ZW50VHlwZSkgfHwgXCJwbmdcIjtcbiAgICAgIHJldHVybiBgcmVtb3RlLWltYWdlLiR7ZXh0ZW5zaW9ufWA7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBzYW5pdGl6ZUZpbGVOYW1lKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gZmlsZU5hbWUucmVwbGFjZSgvW1xcXFwvOio/XCI8PnxdKy9nLCBcIi1cIikudHJpbSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRFeHRlbnNpb25Gcm9tTWltZVR5cGUoY29udGVudFR5cGU6IHN0cmluZykge1xuICAgIGNvbnN0IG1pbWVUeXBlID0gY29udGVudFR5cGUuc3BsaXQoXCI7XCIpWzBdLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIHN3aXRjaCAobWltZVR5cGUpIHtcbiAgICAgIGNhc2UgXCJpbWFnZS9qcGVnXCI6XG4gICAgICAgIHJldHVybiBcImpwZ1wiO1xuICAgICAgY2FzZSBcImltYWdlL3BuZ1wiOlxuICAgICAgICByZXR1cm4gXCJwbmdcIjtcbiAgICAgIGNhc2UgXCJpbWFnZS9naWZcIjpcbiAgICAgICAgcmV0dXJuIFwiZ2lmXCI7XG4gICAgICBjYXNlIFwiaW1hZ2Uvd2VicFwiOlxuICAgICAgICByZXR1cm4gXCJ3ZWJwXCI7XG4gICAgICBjYXNlIFwiaW1hZ2UvYm1wXCI6XG4gICAgICAgIHJldHVybiBcImJtcFwiO1xuICAgICAgY2FzZSBcImltYWdlL3N2Zyt4bWxcIjpcbiAgICAgICAgcmV0dXJuIFwic3ZnXCI7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUltYWdlTWltZVR5cGUoY29udGVudFR5cGU6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IG1pbWVUeXBlID0gY29udGVudFR5cGUuc3BsaXQoXCI7XCIpWzBdLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmIChtaW1lVHlwZSAmJiBtaW1lVHlwZSAhPT0gXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIikge1xuICAgICAgcmV0dXJuIG1pbWVUeXBlO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmdldE1pbWVUeXBlRnJvbUZpbGVOYW1lKGZpbGVOYW1lKTtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRCaW5hcnkocmVtb3RlUGF0aDogc3RyaW5nLCBiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nKSB7XG4gICAgYXdhaXQgdGhpcy5lbnN1cmVSZW1vdGVEaXJlY3RvcmllcyhyZW1vdGVQYXRoKTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiUFVUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIFwiQ29udGVudC1UeXBlXCI6IG1pbWVUeXBlLFxyXG4gICAgICB9LFxyXG4gICAgICBib2R5OiBiaW5hcnksXHJcbiAgICB9KTtcclxuXHJcbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVXBsb2FkIGZhaWxlZCB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUVkaXRvclBhc3RlKGV2dDogQ2xpcGJvYXJkRXZlbnQsIGVkaXRvcjogRWRpdG9yLCBpbmZvOiBNYXJrZG93blZpZXcgfCBNYXJrZG93bkZpbGVJbmZvKSB7XG4gICAgaWYgKGV2dC5kZWZhdWx0UHJldmVudGVkIHx8ICFpbmZvLmZpbGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbWFnZUZpbGUgPSB0aGlzLmV4dHJhY3RJbWFnZUZpbGVGcm9tQ2xpcGJvYXJkKGV2dCk7XG4gICAgaWYgKGltYWdlRmlsZSkge1xuICAgICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCBmaWxlTmFtZSA9IGltYWdlRmlsZS5uYW1lIHx8IHRoaXMuYnVpbGRDbGlwYm9hcmRGaWxlTmFtZShpbWFnZUZpbGUudHlwZSk7XG4gICAgICBhd2FpdCB0aGlzLmVucXVldWVFZGl0b3JJbWFnZVVwbG9hZChpbmZvLmZpbGUsIGVkaXRvciwgaW1hZ2VGaWxlLCBmaWxlTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaHRtbCA9IGV2dC5jbGlwYm9hcmREYXRhPy5nZXREYXRhKFwidGV4dC9odG1sXCIpPy50cmltKCkgPz8gXCJcIjtcbiAgICBpZiAoIWh0bWwgfHwgIXRoaXMuaHRtbENvbnRhaW5zUmVtb3RlSW1hZ2VzKGh0bWwpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgYXdhaXQgdGhpcy5oYW5kbGVIdG1sUGFzdGVXaXRoUmVtb3RlSW1hZ2VzKGluZm8uZmlsZSwgZWRpdG9yLCBodG1sKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlRWRpdG9yRHJvcChldnQ6IERyYWdFdmVudCwgZWRpdG9yOiBFZGl0b3IsIGluZm86IE1hcmtkb3duVmlldyB8IE1hcmtkb3duRmlsZUluZm8pIHtcbiAgICBpZiAoZXZ0LmRlZmF1bHRQcmV2ZW50ZWQgfHwgIWluZm8uZmlsZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGltYWdlRmlsZSA9IHRoaXMuZXh0cmFjdEltYWdlRmlsZUZyb21Ecm9wKGV2dCk7XG4gICAgaWYgKCFpbWFnZUZpbGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICBjb25zdCBmaWxlTmFtZSA9IGltYWdlRmlsZS5uYW1lIHx8IHRoaXMuYnVpbGRDbGlwYm9hcmRGaWxlTmFtZShpbWFnZUZpbGUudHlwZSk7XG4gICAgYXdhaXQgdGhpcy5lbnF1ZXVlRWRpdG9ySW1hZ2VVcGxvYWQoaW5mby5maWxlLCBlZGl0b3IsIGltYWdlRmlsZSwgZmlsZU5hbWUpO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRyYWN0SW1hZ2VGaWxlRnJvbUNsaXBib2FyZChldnQ6IENsaXBib2FyZEV2ZW50KSB7XG4gICAgY29uc3QgZGlyZWN0ID0gQXJyYXkuZnJvbShldnQuY2xpcGJvYXJkRGF0YT8uZmlsZXMgPz8gW10pLmZpbmQoKGZpbGUpID0+IGZpbGUudHlwZS5zdGFydHNXaXRoKFwiaW1hZ2UvXCIpKTtcbiAgICBpZiAoZGlyZWN0KSB7XG4gICAgICByZXR1cm4gZGlyZWN0O1xuICAgIH1cblxuICAgIGNvbnN0IGl0ZW0gPSBBcnJheS5mcm9tKGV2dC5jbGlwYm9hcmREYXRhPy5pdGVtcyA/PyBbXSkuZmluZCgoZW50cnkpID0+IGVudHJ5LnR5cGUuc3RhcnRzV2l0aChcImltYWdlL1wiKSk7XG4gICAgcmV0dXJuIGl0ZW0/LmdldEFzRmlsZSgpID8/IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGh0bWxDb250YWluc1JlbW90ZUltYWdlcyhodG1sOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gLzxpbWdcXGJbXj5dKnNyYz1bXCInXWh0dHBzPzpcXC9cXC9bXlwiJ10rW1wiJ11bXj5dKj4vaS50ZXN0KGh0bWwpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVIdG1sUGFzdGVXaXRoUmVtb3RlSW1hZ2VzKG5vdGVGaWxlOiBURmlsZSwgZWRpdG9yOiBFZGl0b3IsIGh0bWw6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZW5kZXJlZCA9IGF3YWl0IHRoaXMuY29udmVydEh0bWxDbGlwYm9hcmRUb1NlY3VyZU1hcmtkb3duKGh0bWwsIG5vdGVGaWxlKTtcbiAgICAgIGlmICghcmVuZGVyZWQudHJpbSgpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgZWRpdG9yLnJlcGxhY2VTZWxlY3Rpb24ocmVuZGVyZWQpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdTVERjJcdTVDMDZcdTdGNTFcdTk4NzVcdTU2RkVcdTY1ODdcdTdDOThcdThEMzRcdTVFNzZcdTYyOTNcdTUzRDZcdThGRENcdTdBMEJcdTU2RkVcdTcyNDdcdTMwMDJcIiwgXCJQYXN0ZWQgd2ViIGNvbnRlbnQgYW5kIGNhcHR1cmVkIHJlbW90ZSBpbWFnZXMuXCIpKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBwYXN0ZSBIVE1MIGNvbnRlbnQgd2l0aCByZW1vdGUgaW1hZ2VzXCIsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgIHRoaXMuZGVzY3JpYmVFcnJvcihcbiAgICAgICAgICB0aGlzLnQoXCJcdTU5MDRcdTc0MDZcdTdGNTFcdTk4NzVcdTU2RkVcdTY1ODdcdTdDOThcdThEMzRcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gcHJvY2VzcyBwYXN0ZWQgd2ViIGNvbnRlbnRcIiksXG4gICAgICAgICAgZXJyb3IsXG4gICAgICAgICksXG4gICAgICAgIDgwMDAsXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY29udmVydEh0bWxDbGlwYm9hcmRUb1NlY3VyZU1hcmtkb3duKGh0bWw6IHN0cmluZywgbm90ZUZpbGU6IFRGaWxlKSB7XG4gICAgY29uc3QgcGFyc2VyID0gbmV3IERPTVBhcnNlcigpO1xuICAgIGNvbnN0IGRvY3VtZW50ID0gcGFyc2VyLnBhcnNlRnJvbVN0cmluZyhodG1sLCBcInRleHQvaHRtbFwiKTtcbiAgICBjb25zdCB1cGxvYWRDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgY29uc3QgcmVuZGVyZWRCbG9ja3M6IHN0cmluZ1tdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IG5vZGUgb2YgQXJyYXkuZnJvbShkb2N1bWVudC5ib2R5LmNoaWxkTm9kZXMpKSB7XG4gICAgICBjb25zdCBibG9jayA9IGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbE5vZGUobm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCAwKTtcbiAgICAgIGlmIChibG9jay50cmltKCkpIHtcbiAgICAgICAgcmVuZGVyZWRCbG9ja3MucHVzaChibG9jay50cmltKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZW5kZXJlZEJsb2Nrcy5qb2luKFwiXFxuXFxuXCIpICsgXCJcXG5cIjtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVuZGVyUGFzdGVkSHRtbE5vZGUoXG4gICAgbm9kZTogTm9kZSxcbiAgICBub3RlRmlsZTogVEZpbGUsXG4gICAgdXBsb2FkQ2FjaGU6IE1hcDxzdHJpbmcsIHN0cmluZz4sXG4gICAgbGlzdERlcHRoOiBudW1iZXIsXG4gICk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKSB7XG4gICAgICByZXR1cm4gdGhpcy5ub3JtYWxpemVDbGlwYm9hcmRUZXh0KG5vZGUudGV4dENvbnRlbnQgPz8gXCJcIik7XG4gICAgfVxuXG4gICAgaWYgKCEobm9kZSBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSkge1xuICAgICAgcmV0dXJuIFwiXCI7XG4gICAgfVxuXG4gICAgY29uc3QgdGFnID0gbm9kZS50YWdOYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKHRhZyA9PT0gXCJpbWdcIikge1xuICAgICAgY29uc3Qgc3JjID0gdGhpcy51bmVzY2FwZUh0bWwobm9kZS5nZXRBdHRyaWJ1dGUoXCJzcmNcIik/LnRyaW0oKSA/PyBcIlwiKTtcbiAgICAgIGlmICghdGhpcy5pc0h0dHBVcmwoc3JjKSkge1xuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgYWx0ID0gKG5vZGUuZ2V0QXR0cmlidXRlKFwiYWx0XCIpID8/IFwiXCIpLnRyaW0oKSB8fCB0aGlzLmdldERpc3BsYXlOYW1lRnJvbVVybChzcmMpO1xuICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRSZW1vdGVJbWFnZVVybChzcmMsIHVwbG9hZENhY2hlKTtcbiAgICAgIHJldHVybiB0aGlzLmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsLCBhbHQpO1xuICAgIH1cblxuICAgIGlmICh0YWcgPT09IFwiYnJcIikge1xuICAgICAgcmV0dXJuIFwiXFxuXCI7XG4gICAgfVxuXG4gICAgaWYgKHRhZyA9PT0gXCJ1bFwiIHx8IHRhZyA9PT0gXCJvbFwiKSB7XG4gICAgICBjb25zdCBpdGVtczogc3RyaW5nW10gPSBbXTtcbiAgICAgIGxldCBpbmRleCA9IDE7XG4gICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIEFycmF5LmZyb20obm9kZS5jaGlsZHJlbikpIHtcbiAgICAgICAgaWYgKGNoaWxkLnRhZ05hbWUudG9Mb3dlckNhc2UoKSAhPT0gXCJsaVwiKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZW5kZXJlZCA9IChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxOb2RlKGNoaWxkLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCArIDEpKS50cmltKCk7XG4gICAgICAgIGlmICghcmVuZGVyZWQpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHByZWZpeCA9IHRhZyA9PT0gXCJvbFwiID8gYCR7aW5kZXh9LiBgIDogXCItIFwiO1xuICAgICAgICBpdGVtcy5wdXNoKGAke1wiICBcIi5yZXBlYXQoTWF0aC5tYXgoMCwgbGlzdERlcHRoKSl9JHtwcmVmaXh9JHtyZW5kZXJlZH1gKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGl0ZW1zLmpvaW4oXCJcXG5cIik7XG4gICAgfVxuXG4gICAgaWYgKHRhZyA9PT0gXCJsaVwiKSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKTtcbiAgICAgIHJldHVybiBwYXJ0cy5qb2luKFwiXCIpLnRyaW0oKTtcbiAgICB9XG5cbiAgICBpZiAoL15oWzEtNl0kLy50ZXN0KHRhZykpIHtcbiAgICAgIGNvbnN0IGxldmVsID0gTnVtYmVyLnBhcnNlSW50KHRhZ1sxXSwgMTApO1xuICAgICAgY29uc3QgdGV4dCA9IChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIikudHJpbSgpO1xuICAgICAgcmV0dXJuIHRleHQgPyBgJHtcIiNcIi5yZXBlYXQobGV2ZWwpfSAke3RleHR9YCA6IFwiXCI7XG4gICAgfVxuXG4gICAgaWYgKHRhZyA9PT0gXCJhXCIpIHtcbiAgICAgIGNvbnN0IGhyZWYgPSBub2RlLmdldEF0dHJpYnV0ZShcImhyZWZcIik/LnRyaW0oKSA/PyBcIlwiO1xuICAgICAgY29uc3QgdGV4dCA9IChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIikudHJpbSgpO1xuICAgICAgaWYgKGhyZWYgJiYgL15odHRwcz86XFwvXFwvL2kudGVzdChocmVmKSAmJiB0ZXh0KSB7XG4gICAgICAgIHJldHVybiBgWyR7dGV4dH1dKCR7aHJlZn0pYDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0ZXh0O1xuICAgIH1cblxuICAgIGNvbnN0IGlubGluZVRhZ3MgPSBuZXcgU2V0KFtcInN0cm9uZ1wiLCBcImJcIiwgXCJlbVwiLCBcImlcIiwgXCJzcGFuXCIsIFwiY29kZVwiLCBcInNtYWxsXCIsIFwic3VwXCIsIFwic3ViXCJdKTtcbiAgICBpZiAoaW5saW5lVGFncy5oYXModGFnKSkge1xuICAgICAgcmV0dXJuIChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIik7XG4gICAgfVxuXG4gICAgY29uc3QgYmxvY2tUYWdzID0gbmV3IFNldChbXG4gICAgICBcInBcIixcbiAgICAgIFwiZGl2XCIsXG4gICAgICBcImFydGljbGVcIixcbiAgICAgIFwic2VjdGlvblwiLFxuICAgICAgXCJmaWd1cmVcIixcbiAgICAgIFwiZmlnY2FwdGlvblwiLFxuICAgICAgXCJibG9ja3F1b3RlXCIsXG4gICAgICBcInByZVwiLFxuICAgICAgXCJ0YWJsZVwiLFxuICAgICAgXCJ0aGVhZFwiLFxuICAgICAgXCJ0Ym9keVwiLFxuICAgICAgXCJ0clwiLFxuICAgICAgXCJ0ZFwiLFxuICAgICAgXCJ0aFwiLFxuICAgIF0pO1xuICAgIGlmIChibG9ja1RhZ3MuaGFzKHRhZykpIHtcbiAgICAgIGNvbnN0IHRleHQgPSAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpLnRyaW0oKTtcbiAgICAgIHJldHVybiB0ZXh0O1xuICAgIH1cblxuICAgIHJldHVybiAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4oXG4gICAgZWxlbWVudDogSFRNTEVsZW1lbnQsXG4gICAgbm90ZUZpbGU6IFRGaWxlLFxuICAgIHVwbG9hZENhY2hlOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuICAgIGxpc3REZXB0aDogbnVtYmVyLFxuICApIHtcbiAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIEFycmF5LmZyb20oZWxlbWVudC5jaGlsZE5vZGVzKSkge1xuICAgICAgY29uc3QgcmVuZGVyZWQgPSBhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxOb2RlKGNoaWxkLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCk7XG4gICAgICBpZiAoIXJlbmRlcmVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAocGFydHMubGVuZ3RoID4gMCAmJiAhcmVuZGVyZWQuc3RhcnRzV2l0aChcIlxcblwiKSAmJiAhcGFydHNbcGFydHMubGVuZ3RoIC0gMV0uZW5kc1dpdGgoXCJcXG5cIikpIHtcbiAgICAgICAgY29uc3QgcHJldmlvdXMgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXTtcbiAgICAgICAgY29uc3QgbmVlZHNTcGFjZSA9IC9cXFMkLy50ZXN0KHByZXZpb3VzKSAmJiAvXlxcUy8udGVzdChyZW5kZXJlZCk7XG4gICAgICAgIGlmIChuZWVkc1NwYWNlKSB7XG4gICAgICAgICAgcGFydHMucHVzaChcIiBcIik7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcGFydHMucHVzaChyZW5kZXJlZCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhcnRzO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVDbGlwYm9hcmRUZXh0KHZhbHVlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdmFsdWUucmVwbGFjZSgvXFxzKy9nLCBcIiBcIik7XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RJbWFnZUZpbGVGcm9tRHJvcChldnQ6IERyYWdFdmVudCkge1xuICAgIHJldHVybiBBcnJheS5mcm9tKGV2dC5kYXRhVHJhbnNmZXI/LmZpbGVzID8/IFtdKS5maW5kKChmaWxlKSA9PiBmaWxlLnR5cGUuc3RhcnRzV2l0aChcImltYWdlL1wiKSkgPz8gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZW5xdWV1ZUVkaXRvckltYWdlVXBsb2FkKG5vdGVGaWxlOiBURmlsZSwgZWRpdG9yOiBFZGl0b3IsIGltYWdlRmlsZTogRmlsZSwgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBhcnJheUJ1ZmZlciA9IGF3YWl0IGltYWdlRmlsZS5hcnJheUJ1ZmZlcigpO1xuICAgICAgY29uc3QgdGFzayA9IHRoaXMuY3JlYXRlVXBsb2FkVGFzayhcbiAgICAgICAgbm90ZUZpbGUucGF0aCxcbiAgICAgICAgYXJyYXlCdWZmZXIsXG4gICAgICAgIGltYWdlRmlsZS50eXBlIHx8IHRoaXMuZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUoZmlsZU5hbWUpLFxuICAgICAgICBmaWxlTmFtZSxcbiAgICAgICk7XG4gICAgICB0aGlzLmluc2VydFBsYWNlaG9sZGVyKGVkaXRvciwgdGFzay5wbGFjZWhvbGRlcik7XG4gICAgICB0aGlzLnF1ZXVlLnB1c2godGFzayk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgdm9pZCB0aGlzLnByb2Nlc3NQZW5kaW5nVGFza3MoKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1REYyXHU1MkEwXHU1MTY1XHU1NkZFXHU3MjQ3XHU4MUVBXHU1MkE4XHU0RTBBXHU0RjIwXHU5NjFGXHU1MjE3XHUzMDAyXCIsIFwiSW1hZ2UgYWRkZWQgdG8gdGhlIGF1dG8tdXBsb2FkIHF1ZXVlLlwiKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcXVldWUgc2VjdXJlIGltYWdlIHVwbG9hZFwiLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTUyQTBcdTUxNjVcdTU2RkVcdTcyNDdcdTgxRUFcdTUyQThcdTRFMEFcdTRGMjBcdTk2MUZcdTUyMTdcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gcXVldWUgaW1hZ2UgZm9yIGF1dG8tdXBsb2FkXCIpLCBlcnJvciksIDgwMDApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlVXBsb2FkVGFzayhub3RlUGF0aDogc3RyaW5nLCBiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKTogVXBsb2FkVGFzayB7XG4gICAgY29uc3QgaWQgPSBgc2VjdXJlLXdlYmRhdi10YXNrLSR7RGF0ZS5ub3coKX0tJHtNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLCA4KX1gO1xuICAgIHJldHVybiB7XG4gICAgICBpZCxcbiAgICAgIG5vdGVQYXRoLFxuICAgICAgcGxhY2Vob2xkZXI6IHRoaXMuYnVpbGRQZW5kaW5nUGxhY2Vob2xkZXIoaWQsIGZpbGVOYW1lKSxcbiAgICAgIG1pbWVUeXBlLFxuICAgICAgZmlsZU5hbWUsXG4gICAgICBkYXRhQmFzZTY0OiB0aGlzLmFycmF5QnVmZmVyVG9CYXNlNjQoYmluYXJ5KSxcbiAgICAgIGF0dGVtcHRzOiAwLFxuICAgICAgY3JlYXRlZEF0OiBEYXRlLm5vdygpLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkUGVuZGluZ1BsYWNlaG9sZGVyKHRhc2tJZDogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3Qgc2FmZU5hbWUgPSB0aGlzLmVzY2FwZUh0bWwoZmlsZU5hbWUpO1xuICAgIHJldHVybiBgPHNwYW4gY2xhc3M9XCJzZWN1cmUtd2ViZGF2LXBlbmRpbmdcIiBkYXRhLXNlY3VyZS13ZWJkYXYtdGFzaz1cIiR7dGFza0lkfVwiIGFyaWEtbGFiZWw9XCIke3NhZmVOYW1lfVwiPiR7dGhpcy5lc2NhcGVIdG1sKHRoaXMudChgXHUzMDEwXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU0RTJEXHVGRjVDJHtmaWxlTmFtZX1cdTMwMTFgLCBgW1VwbG9hZGluZyBpbWFnZSB8ICR7ZmlsZU5hbWV9XWApKX08L3NwYW4+YDtcbiAgfVxuXG4gIHByaXZhdGUgaW5zZXJ0UGxhY2Vob2xkZXIoZWRpdG9yOiBFZGl0b3IsIHBsYWNlaG9sZGVyOiBzdHJpbmcpIHtcbiAgICBlZGl0b3IucmVwbGFjZVNlbGVjdGlvbihgJHtwbGFjZWhvbGRlcn1cXG5gKTtcbiAgfVxuXG4gIGFzeW5jIHN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50KHNob3dOb3RpY2UgPSB0cnVlKSB7XG4gICAgaWYgKHRoaXMuc3luY0luUHJvZ3Jlc3MpIHtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1NDBDXHU2QjY1XHU2QjYzXHU1NzI4XHU4RkRCXHU4ODRDXHU0RTJEXHUzMDAyXCIsIFwiQSBzeW5jIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MuXCIpLCA0MDAwKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnN5bmNJblByb2dyZXNzID0gdHJ1ZTtcbiAgICB0cnkge1xuICAgICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG4gICAgICBjb25zdCBmaWxlcyA9IHRoaXMuY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCk7XG4gICAgICBhd2FpdCB0aGlzLnJlYnVpbGRSZWZlcmVuY2VJbmRleCgpO1xuXG4gICAgICBjb25zdCByZW1vdGVJbnZlbnRvcnkgPSBhd2FpdCB0aGlzLmxpc3RSZW1vdGVUcmVlKHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKTtcbiAgICAgIGNvbnN0IHJlbW90ZUZpbGVzID0gcmVtb3RlSW52ZW50b3J5LmZpbGVzO1xuICAgICAgY29uc3QgY3VycmVudFBhdGhzID0gbmV3IFNldChmaWxlcy5tYXAoKGZpbGUpID0+IGZpbGUucGF0aCkpO1xuICAgICAgZm9yIChjb25zdCBwYXRoIG9mIFsuLi50aGlzLnN5bmNJbmRleC5rZXlzKCldKSB7XG4gICAgICAgIGlmICghY3VycmVudFBhdGhzLmhhcyhwYXRoKSkge1xuICAgICAgICAgIGNvbnN0IHJlbW92ZWQgPSB0aGlzLnN5bmNJbmRleC5nZXQocGF0aCk7XG4gICAgICAgICAgaWYgKHJlbW92ZWQpIHtcbiAgICAgICAgICAgIGlmIChyZW1vdGVGaWxlcy5oYXMocmVtb3ZlZC5yZW1vdGVQYXRoKSkge1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW92ZWQucmVtb3RlUGF0aCk7XG4gICAgICAgICAgICAgIHJlbW90ZUZpbGVzLmRlbGV0ZShyZW1vdmVkLnJlbW90ZVBhdGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUocGF0aCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbGV0IHVwbG9hZGVkID0gMDtcbiAgICAgIGxldCBza2lwcGVkID0gMDtcbiAgICAgIGxldCBtaXNzaW5nUmVtb3RlQmFja2VkTm90ZXMgPSAwO1xuICAgICAgY29uc3QgbG9jYWxSZW1vdGVQYXRocyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aChmaWxlLnBhdGgpO1xuICAgICAgICBsb2NhbFJlbW90ZVBhdGhzLmFkZChyZW1vdGVQYXRoKTtcblxuICAgICAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICAgIGNvbnN0IHN0dWIgPSB0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCk7XG4gICAgICAgICAgaWYgKHN0dWIpIHtcbiAgICAgICAgICAgIGlmICghcmVtb3RlRmlsZXMuaGFzKHN0dWIucmVtb3RlUGF0aCkpIHtcbiAgICAgICAgICAgICAgbWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzICs9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICAgIHNpZ25hdHVyZTogdGhpcy5idWlsZFN5bmNTaWduYXR1cmUoZmlsZSksXG4gICAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNraXBwZWQgKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNpZ25hdHVyZSA9IHRoaXMuYnVpbGRTeW5jU2lnbmF0dXJlKGZpbGUpO1xuICAgICAgICBjb25zdCBwcmV2aW91cyA9IHRoaXMuc3luY0luZGV4LmdldChmaWxlLnBhdGgpO1xuICAgICAgICBjb25zdCBleGlzdHNSZW1vdGVseSA9IHJlbW90ZUZpbGVzLmhhcyhyZW1vdGVQYXRoKTtcbiAgICAgICAgaWYgKHByZXZpb3VzICYmIHByZXZpb3VzLnNpZ25hdHVyZSA9PT0gc2lnbmF0dXJlICYmIHByZXZpb3VzLnJlbW90ZVBhdGggPT09IHJlbW90ZVBhdGggJiYgZXhpc3RzUmVtb3RlbHkpIHtcbiAgICAgICAgICBza2lwcGVkICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBiaW5hcnkgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgICAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBiaW5hcnksIHRoaXMuZ2V0TWltZVR5cGUoZmlsZS5leHRlbnNpb24pKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwgeyBzaWduYXR1cmUsIHJlbW90ZVBhdGggfSk7XG4gICAgICAgIHJlbW90ZUZpbGVzLmFkZChyZW1vdGVQYXRoKTtcbiAgICAgICAgdXBsb2FkZWQgKz0gMTtcbiAgICAgIH1cblxuICAgICAgbGV0IGRlbGV0ZWRSZW1vdGVGaWxlcyA9IDA7XG4gICAgICBmb3IgKGNvbnN0IHJlbW90ZVBhdGggb2YgWy4uLnJlbW90ZUZpbGVzXS5zb3J0KChhLCBiKSA9PiBiLmxvY2FsZUNvbXBhcmUoYSkpKSB7XG4gICAgICAgIGlmIChsb2NhbFJlbW90ZVBhdGhzLmhhcyhyZW1vdGVQYXRoKSkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGVQYXRoKTtcbiAgICAgICAgcmVtb3RlRmlsZXMuZGVsZXRlKHJlbW90ZVBhdGgpO1xuICAgICAgICBkZWxldGVkUmVtb3RlRmlsZXMgKz0gMTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzID0gYXdhaXQgdGhpcy5kZWxldGVFeHRyYVJlbW90ZURpcmVjdG9yaWVzKFxuICAgICAgICByZW1vdGVJbnZlbnRvcnkuZGlyZWN0b3JpZXMsXG4gICAgICAgIHRoaXMuYnVpbGRFeHBlY3RlZFJlbW90ZURpcmVjdG9yaWVzKGxvY2FsUmVtb3RlUGF0aHMsIHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKSxcbiAgICAgICk7XG4gICAgICBjb25zdCBpbWFnZUNsZWFudXAgPSBhd2FpdCB0aGlzLnJlY29uY2lsZVJlbW90ZUltYWdlcygpO1xuICAgICAgY29uc3QgZXZpY3RlZE5vdGVzID0gYXdhaXQgdGhpcy5ldmljdFN0YWxlU3luY2VkTm90ZXMoZmFsc2UpO1xuXG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLnQoXG4gICAgICAgIGBcdTVERjJcdTVCRjlcdThEMjZcdTU0MENcdTZCNjUgJHt1cGxvYWRlZH0gXHU0RTJBXHU2NTg3XHU0RUY2XHVGRjBDXHU4REYzXHU4RkM3ICR7c2tpcHBlZH0gXHU0RTJBXHU2NzJBXHU1M0Q4XHU1MzE2XHU2NTg3XHU0RUY2XHVGRjBDXHU1MjIwXHU5NjY0XHU4RkRDXHU3QUVGXHU1OTFBXHU0RjU5XHU1MTg1XHU1QkI5ICR7ZGVsZXRlZFJlbW90ZUZpbGVzfSBcdTRFMkFcdTMwMDFcdTc2RUVcdTVGNTUgJHtkZWxldGVkUmVtb3RlRGlyZWN0b3JpZXN9IFx1NEUyQVx1RkYwQ1x1NkUwNVx1NzQwNlx1NTE5N1x1NEY1OVx1NTZGRVx1NzI0NyAke2ltYWdlQ2xlYW51cC5kZWxldGVkRmlsZXN9IFx1NUYyMFx1MzAwMVx1NzZFRVx1NUY1NSAke2ltYWdlQ2xlYW51cC5kZWxldGVkRGlyZWN0b3JpZXN9IFx1NEUyQSR7ZXZpY3RlZE5vdGVzID4gMCA/IGBcdUZGMENcdTU2REVcdTY1MzZcdTY3MkNcdTU3MzBcdTY1RTdcdTdCMTRcdThCQjAgJHtldmljdGVkTm90ZXN9IFx1N0JDN2AgOiBcIlwifSR7bWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzID4gMCA/IGBcdUZGMENcdTVFNzZcdTUzRDFcdTczQjAgJHttaXNzaW5nUmVtb3RlQmFja2VkTm90ZXN9IFx1N0JDN1x1NjMwOVx1OTcwMFx1N0IxNFx1OEJCMFx1N0YzQVx1NUMxMVx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N2AgOiBcIlwifVx1MzAwMmAsXG4gICAgICAgIGBSZWNvbmNpbGVkIHN5bmMgdXBsb2FkZWQgJHt1cGxvYWRlZH0gZmlsZShzKSwgc2tpcHBlZCAke3NraXBwZWR9IHVuY2hhbmdlZCBmaWxlKHMpLCBkZWxldGVkICR7ZGVsZXRlZFJlbW90ZUZpbGVzfSBleHRyYSByZW1vdGUgY29udGVudCBmaWxlKHMpLCByZW1vdmVkICR7ZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzfSByZW1vdGUgZGlyZWN0b3Ike2RlbGV0ZWRSZW1vdGVEaXJlY3RvcmllcyA9PT0gMSA/IFwieVwiIDogXCJpZXNcIn0sIGNsZWFuZWQgJHtpbWFnZUNsZWFudXAuZGVsZXRlZEZpbGVzfSBvcnBoYW5lZCByZW1vdGUgaW1hZ2UocykgcGx1cyAke2ltYWdlQ2xlYW51cC5kZWxldGVkRGlyZWN0b3JpZXN9IGRpcmVjdG9yJHtpbWFnZUNsZWFudXAuZGVsZXRlZERpcmVjdG9yaWVzID09PSAxID8gXCJ5XCIgOiBcImllc1wifSR7ZXZpY3RlZE5vdGVzID4gMCA/IGAsIGFuZCBldmljdGVkICR7ZXZpY3RlZE5vdGVzfSBzdGFsZSBsb2NhbCBub3RlKHMpYCA6IFwiXCJ9JHttaXNzaW5nUmVtb3RlQmFja2VkTm90ZXMgPiAwID8gYCwgd2hpbGUgZGV0ZWN0aW5nICR7bWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzfSBsYXp5IG5vdGUocykgbWlzc2luZyB0aGVpciByZW1vdGUgY29udGVudGAgOiBcIlwifS5gLFxuICAgICAgKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cywgODAwMCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJWYXVsdCBjb250ZW50IHN5bmMgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gRGF0ZS5ub3coKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9IHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTUxODVcdTVCQjlcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIiwgXCJDb250ZW50IHN5bmMgZmFpbGVkXCIpLCBlcnJvcik7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsIDgwMDApO1xuICAgICAgfVxuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLnN5bmNJblByb2dyZXNzID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICAgIG1ldGhvZDogXCJERUxFVEVcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gNDA0ICYmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBERUxFVEUgZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGRlbGV0ZSByZW1vdGUgc3luY2VkIGNvbnRlbnRcIiwgcmVtb3RlUGF0aCwgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVSZW1vdGVTeW5jZWRFbnRyeSh2YXVsdFBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5zeW5jSW5kZXguZ2V0KHZhdWx0UGF0aCk7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IGV4aXN0aW5nPy5yZW1vdGVQYXRoID8/IHRoaXMuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKHZhdWx0UGF0aCk7XG4gICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGVQYXRoKTtcbiAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUodmF1bHRQYXRoKTtcbiAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVGaWxlT3BlbihmaWxlOiBURmlsZSB8IG51bGwpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHx8IGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzLnNldChmaWxlLnBhdGgsIERhdGUubm93KCkpO1xuICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG5cbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBjb25zdCBzdHViID0gdGhpcy5wYXJzZU5vdGVTdHViKGNvbnRlbnQpO1xuICAgIGlmICghc3R1Yikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChzdHViLnJlbW90ZVBhdGgpLFxuICAgICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEdFVCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGh5ZHJhdGVkID0gdGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKTtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCBoeWRyYXRlZCk7XG4gICAgICBuZXcgTm90aWNlKHRoaXMudChgXHU1REYyXHU0RUNFXHU4RkRDXHU3QUVGXHU2MDYyXHU1OTBEXHU3QjE0XHU4QkIwXHVGRjFBJHtmaWxlLmJhc2VuYW1lfWAsIGBSZXN0b3JlZCBub3RlIGZyb20gcmVtb3RlOiAke2ZpbGUuYmFzZW5hbWV9YCksIDYwMDApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGh5ZHJhdGUgbm90ZSBmcm9tIHJlbW90ZVwiLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdThGRENcdTdBRUZcdTYwNjJcdTU5MERcdTdCMTRcdThCQjBcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gcmVzdG9yZSBub3RlIGZyb20gcmVtb3RlXCIpLCBlcnJvciksIDgwMDApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IG5vcm1hbGl6ZVBhdGgocGF0aCk7XG4gICAgaWYgKG5vcm1hbGl6ZWRQYXRoID09PSBcIi5vYnNpZGlhblwiIHx8IG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIub2JzaWRpYW4vXCIpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICBub3JtYWxpemVkUGF0aCA9PT0gXCIub2JzaWRpYW4vcGx1Z2lucy9zZWN1cmUtd2ViZGF2LWltYWdlc1wiIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwiLm9ic2lkaWFuL3BsdWdpbnMvc2VjdXJlLXdlYmRhdi1pbWFnZXMvXCIpXG4gICAgKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gL1xcLihwbmd8anBlP2d8Z2lmfHdlYnB8Ym1wfHN2ZykkL2kudGVzdChub3JtYWxpemVkUGF0aCk7XG4gIH1cblxuICBwcml2YXRlIGNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpIHtcbiAgICByZXR1cm4gdGhpcy5hcHAudmF1bHRcbiAgICAgIC5nZXRGaWxlcygpXG4gICAgICAuZmlsdGVyKChmaWxlKSA9PiAhdGhpcy5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKGZpbGUucGF0aCkpXG4gICAgICAuc29ydCgoYSwgYikgPT4gYS5wYXRoLmxvY2FsZUNvbXBhcmUoYi5wYXRoKSk7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkU3luY1NpZ25hdHVyZShmaWxlOiBURmlsZSkge1xuICAgIHJldHVybiBgJHtmaWxlLnN0YXQubXRpbWV9OiR7ZmlsZS5zdGF0LnNpemV9YDtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGAke3RoaXMubm9ybWFsaXplRm9sZGVyKHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKX0ke3ZhdWx0UGF0aH1gO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWNvbmNpbGVSZW1vdGVJbWFnZXMoKSB7XG4gICAgY29uc3QgcmVtb3RlSW52ZW50b3J5ID0gYXdhaXQgdGhpcy5saXN0UmVtb3RlVHJlZSh0aGlzLnNldHRpbmdzLnJlbW90ZUZvbGRlcik7XG4gICAgY29uc3QgZXhwZWN0ZWRGaWxlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IGltYWdlUm9vdCA9IHRoaXMubm9ybWFsaXplRm9sZGVyKHRoaXMuc2V0dGluZ3MucmVtb3RlRm9sZGVyKTtcblxuICAgIGZvciAoY29uc3QgcmVmcyBvZiB0aGlzLm5vdGVSZW1vdGVSZWZzLnZhbHVlcygpKSB7XG4gICAgICBmb3IgKGNvbnN0IHJlbW90ZVBhdGggb2YgcmVmcykge1xuICAgICAgICBpZiAocmVtb3RlUGF0aC5zdGFydHNXaXRoKGltYWdlUm9vdCkpIHtcbiAgICAgICAgICBleHBlY3RlZEZpbGVzLmFkZChyZW1vdGVQYXRoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGxldCBkZWxldGVkRmlsZXMgPSAwO1xuICAgIGZvciAoY29uc3QgcmVtb3RlUGF0aCBvZiBbLi4ucmVtb3RlSW52ZW50b3J5LmZpbGVzXS5zb3J0KChhLCBiKSA9PiBiLmxvY2FsZUNvbXBhcmUoYSkpKSB7XG4gICAgICBpZiAoZXhwZWN0ZWRGaWxlcy5oYXMocmVtb3RlUGF0aCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlQ29udGVudEZpbGUocmVtb3RlUGF0aCk7XG4gICAgICBkZWxldGVkRmlsZXMgKz0gMTtcbiAgICB9XG5cbiAgICBjb25zdCBkZWxldGVkRGlyZWN0b3JpZXMgPSBhd2FpdCB0aGlzLmRlbGV0ZUV4dHJhUmVtb3RlRGlyZWN0b3JpZXMoXG4gICAgICByZW1vdGVJbnZlbnRvcnkuZGlyZWN0b3JpZXMsXG4gICAgICB0aGlzLmJ1aWxkRXhwZWN0ZWRSZW1vdGVEaXJlY3RvcmllcyhleHBlY3RlZEZpbGVzLCB0aGlzLnNldHRpbmdzLnJlbW90ZUZvbGRlciksXG4gICAgKTtcblxuICAgIHJldHVybiB7IGRlbGV0ZWRGaWxlcywgZGVsZXRlZERpcmVjdG9yaWVzIH07XG4gIH1cblxuICBwcml2YXRlIHBhcnNlTm90ZVN0dWIoY29udGVudDogc3RyaW5nKSB7XG4gICAgY29uc3QgbWF0Y2ggPSBjb250ZW50Lm1hdGNoKFxuICAgICAgL148IS0tXFxzKnNlY3VyZS13ZWJkYXYtbm90ZS1zdHViXFxzKlxccj9cXG5yZW1vdGU6XFxzKiguKz8pXFxyP1xcbnBsYWNlaG9sZGVyOlxccyooLio/KVxccj9cXG4tLT4vcyxcbiAgICApO1xuICAgIGlmICghbWF0Y2gpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICByZW1vdGVQYXRoOiBtYXRjaFsxXS50cmltKCksXG4gICAgICBwbGFjZWhvbGRlcjogbWF0Y2hbMl0udHJpbSgpLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkTm90ZVN0dWIoZmlsZTogVEZpbGUpIHtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgoZmlsZS5wYXRoKTtcbiAgICByZXR1cm4gW1xuICAgICAgYDwhLS0gJHtTRUNVUkVfTk9URV9TVFVCfWAsXG4gICAgICBgcmVtb3RlOiAke3JlbW90ZVBhdGh9YCxcbiAgICAgIGBwbGFjZWhvbGRlcjogJHtmaWxlLmJhc2VuYW1lfWAsXG4gICAgICBcIi0tPlwiLFxuICAgICAgXCJcIixcbiAgICAgIHRoaXMudChcbiAgICAgICAgYFx1OEZEOVx1NjYyRlx1NEUwMFx1N0JDN1x1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFx1NzY4NFx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1NjU4N1x1NEVGNlx1MzAwMlx1NjI1M1x1NUYwMFx1OEZEOVx1N0JDN1x1N0IxNFx1OEJCMFx1NjVGNlx1RkYwQ1x1NjNEMlx1NEVGNlx1NEYxQVx1NEVDRVx1OEZEQ1x1N0FFRlx1NTQwQ1x1NkI2NVx1NzZFRVx1NUY1NVx1NjA2Mlx1NTkwRFx1NUI4Q1x1NjU3NFx1NTE4NVx1NUJCOVx1MzAwMmAsXG4gICAgICAgIGBUaGlzIGlzIGEgbG9jYWwgcGxhY2Vob2xkZXIgZm9yIGFuIG9uLWRlbWFuZCBub3RlLiBPcGVuaW5nIHRoZSBub3RlIHJlc3RvcmVzIHRoZSBmdWxsIGNvbnRlbnQgZnJvbSB0aGUgcmVtb3RlIHN5bmMgZm9sZGVyLmAsXG4gICAgICApLFxuICAgIF0uam9pbihcIlxcblwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZXZpY3RTdGFsZVN5bmNlZE5vdGVzKHNob3dOb3RpY2U6IGJvb2xlYW4pIHtcbiAgICB0cnkge1xuICAgICAgaWYgKHRoaXMuc2V0dGluZ3Mubm90ZVN0b3JhZ2VNb2RlICE9PSBcImxhenktbm90ZXNcIikge1xuICAgICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1RjUzXHU1MjREXHU2NzJBXHU1NDJGXHU3NTI4XHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXHU2QTIxXHU1RjBGXHUzMDAyXCIsIFwiTGF6eSBub3RlIG1vZGUgaXMgbm90IGVuYWJsZWQuXCIpLCA2MDAwKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZmlsZXMgPSB0aGlzLmNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpLmZpbHRlcigoZmlsZSkgPT4gZmlsZS5leHRlbnNpb24gPT09IFwibWRcIik7XG4gICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgICAgY29uc3QgdGhyZXNob2xkID0gTWF0aC5tYXgoMSwgdGhpcy5zZXR0aW5ncy5ub3RlRXZpY3RBZnRlckRheXMpICogMjQgKiA2MCAqIDYwICogMTAwMDtcbiAgICAgIGxldCBldmljdGVkID0gMDtcblxuICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICAgIGNvbnN0IGFjdGl2ZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgICAgIGlmIChhY3RpdmU/LnBhdGggPT09IGZpbGUucGF0aCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbGFzdEFjY2VzcyA9IHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMuZ2V0KGZpbGUucGF0aCkgPz8gMDtcbiAgICAgICAgaWYgKGxhc3RBY2Nlc3MgIT09IDAgJiYgbm93IC0gbGFzdEFjY2VzcyA8IHRocmVzaG9sZCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICAgIGlmICh0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCkpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGJpbmFyeSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWRCaW5hcnkoZmlsZSk7XG4gICAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aChmaWxlLnBhdGgpO1xuICAgICAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBiaW5hcnksIFwidGV4dC9tYXJrZG93bjsgY2hhcnNldD11dGYtOFwiKTtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIHRoaXMuYnVpbGROb3RlU3R1YihmaWxlKSk7XG4gICAgICAgIGV2aWN0ZWQgKz0gMTtcbiAgICAgIH1cblxuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgICB0aGlzLnQoXG4gICAgICAgICAgICBgXHU1REYyXHU1NkRFXHU2NTM2ICR7ZXZpY3RlZH0gXHU3QkM3XHU5NTdGXHU2NzFGXHU2NzJBXHU4QkJGXHU5NUVFXHU3Njg0XHU2NzJDXHU1NzMwXHU3QjE0XHU4QkIwXHUzMDAyYCxcbiAgICAgICAgICAgIGBFdmljdGVkICR7ZXZpY3RlZH0gc3RhbGUgbG9jYWwgbm90ZShzKS5gLFxuICAgICAgICAgICksXG4gICAgICAgICAgODAwMCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICByZXR1cm4gZXZpY3RlZDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBldmljdCBzdGFsZSBzeW5jZWQgbm90ZXNcIiwgZXJyb3IpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU1NkRFXHU2NTM2XHU2NzJDXHU1NzMwXHU3QjE0XHU4QkIwXHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIGV2aWN0IGxvY2FsIG5vdGVzXCIpLCBlcnJvciksIDgwMDApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBlbnN1cmVSZW1vdGVEaXJlY3RvcmllcyhyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBwYXJ0cyA9IHJlbW90ZVBhdGguc3BsaXQoXCIvXCIpLmZpbHRlcigodmFsdWUpID0+IHZhbHVlLmxlbmd0aCA+IDApO1xuICAgIGlmIChwYXJ0cy5sZW5ndGggPD0gMSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBjdXJyZW50ID0gXCJcIjtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgcGFydHMubGVuZ3RoIC0gMTsgaW5kZXggKz0gMSkge1xuICAgICAgY3VycmVudCA9IGN1cnJlbnQgPyBgJHtjdXJyZW50fS8ke3BhcnRzW2luZGV4XX1gIDogcGFydHNbaW5kZXhdO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwoY3VycmVudCksXG4gICAgICAgIG1ldGhvZDogXCJNS0NPTFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAoIVsyMDAsIDIwMSwgMjA0LCAyMDcsIDMwMSwgMzAyLCAzMDcsIDMwOCwgNDA1XS5pbmNsdWRlcyhyZXNwb25zZS5zdGF0dXMpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTUtDT0wgZmFpbGVkIGZvciAke2N1cnJlbnR9IHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgbGlzdFJlbW90ZVRyZWUocm9vdEZvbGRlcjogc3RyaW5nKTogUHJvbWlzZTxSZW1vdGVJbnZlbnRvcnk+IHtcbiAgICBjb25zdCBmaWxlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IGRpcmVjdG9yaWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgcGVuZGluZyA9IFt0aGlzLm5vcm1hbGl6ZUZvbGRlcihyb290Rm9sZGVyKV07XG4gICAgY29uc3QgdmlzaXRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG4gICAgd2hpbGUgKHBlbmRpbmcubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgY3VycmVudCA9IHRoaXMubm9ybWFsaXplRm9sZGVyKHBlbmRpbmcucG9wKCkgPz8gcm9vdEZvbGRlcik7XG4gICAgICBpZiAodmlzaXRlZC5oYXMoY3VycmVudCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHZpc2l0ZWQuYWRkKGN1cnJlbnQpO1xuICAgICAgY29uc3QgZW50cmllcyA9IGF3YWl0IHRoaXMubGlzdFJlbW90ZURpcmVjdG9yeShjdXJyZW50KTtcbiAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgICAgICBpZiAoZW50cnkuaXNDb2xsZWN0aW9uKSB7XG4gICAgICAgICAgZGlyZWN0b3JpZXMuYWRkKGVudHJ5LnJlbW90ZVBhdGgpO1xuICAgICAgICAgIHBlbmRpbmcucHVzaChlbnRyeS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZpbGVzLmFkZChlbnRyeS5yZW1vdGVQYXRoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4geyBmaWxlcywgZGlyZWN0b3JpZXMgfTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgbGlzdFJlbW90ZURpcmVjdG9yeShyZW1vdGVEaXJlY3Rvcnk6IHN0cmluZykge1xuICAgIGNvbnN0IHJlcXVlc3RlZFBhdGggPSB0aGlzLm5vcm1hbGl6ZUZvbGRlcihyZW1vdGVEaXJlY3RvcnkpO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZXF1ZXN0ZWRQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJQUk9QRklORFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICBEZXB0aDogXCIxXCIsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gNDA0KSB7XG4gICAgICByZXR1cm4gW10gYXMgQXJyYXk8eyByZW1vdGVQYXRoOiBzdHJpbmc7IGlzQ29sbGVjdGlvbjogYm9vbGVhbiB9PjtcbiAgICB9XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgUFJPUEZJTkQgZmFpbGVkIGZvciAke3JlcXVlc3RlZFBhdGh9IHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIH1cblxuICAgIGNvbnN0IHhtbFRleHQgPSB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpO1xuICAgIHJldHVybiB0aGlzLnBhcnNlUHJvcGZpbmREaXJlY3RvcnlMaXN0aW5nKHhtbFRleHQsIHJlcXVlc3RlZFBhdGgpO1xuICB9XG5cbiAgcHJpdmF0ZSBwYXJzZVByb3BmaW5kRGlyZWN0b3J5TGlzdGluZyh4bWxUZXh0OiBzdHJpbmcsIHJlcXVlc3RlZFBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHBhcnNlciA9IG5ldyBET01QYXJzZXIoKTtcbiAgICBjb25zdCBkb2N1bWVudCA9IHBhcnNlci5wYXJzZUZyb21TdHJpbmcoeG1sVGV4dCwgXCJhcHBsaWNhdGlvbi94bWxcIik7XG4gICAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwicGFyc2VyZXJyb3JcIikubGVuZ3RoID4gMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1NjVFMFx1NkNENVx1ODlFM1x1Njc5MCBXZWJEQVYgXHU3NkVFXHU1RjU1XHU2RTA1XHU1MzU1XHUzMDAyXCIsIFwiRmFpbGVkIHRvIHBhcnNlIHRoZSBXZWJEQVYgZGlyZWN0b3J5IGxpc3RpbmcuXCIpKTtcbiAgICB9XG5cbiAgICBjb25zdCBlbnRyaWVzID0gbmV3IE1hcDxzdHJpbmcsIHsgcmVtb3RlUGF0aDogc3RyaW5nOyBpc0NvbGxlY3Rpb246IGJvb2xlYW4gfT4oKTtcbiAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgQXJyYXkuZnJvbShkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcIipcIikpKSB7XG4gICAgICBpZiAoZWxlbWVudC5sb2NhbE5hbWUgIT09IFwicmVzcG9uc2VcIikge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaHJlZiA9IHRoaXMuZ2V0WG1sTG9jYWxOYW1lVGV4dChlbGVtZW50LCBcImhyZWZcIik7XG4gICAgICBpZiAoIWhyZWYpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmhyZWZUb1JlbW90ZVBhdGgoaHJlZik7XG4gICAgICBpZiAoIXJlbW90ZVBhdGgpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGlzQ29sbGVjdGlvbiA9IHRoaXMueG1sVHJlZUhhc0xvY2FsTmFtZShlbGVtZW50LCBcImNvbGxlY3Rpb25cIik7XG4gICAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IGlzQ29sbGVjdGlvbiA/IHRoaXMubm9ybWFsaXplRm9sZGVyKHJlbW90ZVBhdGgpIDogcmVtb3RlUGF0aC5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpO1xuICAgICAgaWYgKFxuICAgICAgICBub3JtYWxpemVkUGF0aCA9PT0gcmVxdWVzdGVkUGF0aCB8fFxuICAgICAgICBub3JtYWxpemVkUGF0aCA9PT0gcmVxdWVzdGVkUGF0aC5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpXG4gICAgICApIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGVudHJpZXMuc2V0KG5vcm1hbGl6ZWRQYXRoLCB7XG4gICAgICAgIHJlbW90ZVBhdGg6IG5vcm1hbGl6ZWRQYXRoLFxuICAgICAgICBpc0NvbGxlY3Rpb24sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gWy4uLmVudHJpZXMudmFsdWVzKCldO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRYbWxMb2NhbE5hbWVUZXh0KHBhcmVudDogRWxlbWVudCwgbG9jYWxOYW1lOiBzdHJpbmcpIHtcbiAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgQXJyYXkuZnJvbShwYXJlbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCIqXCIpKSkge1xuICAgICAgaWYgKGVsZW1lbnQubG9jYWxOYW1lID09PSBsb2NhbE5hbWUpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQudGV4dENvbnRlbnQ/LnRyaW0oKSA/PyBcIlwiO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBcIlwiO1xuICB9XG5cbiAgcHJpdmF0ZSB4bWxUcmVlSGFzTG9jYWxOYW1lKHBhcmVudDogRWxlbWVudCwgbG9jYWxOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShwYXJlbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCIqXCIpKS5zb21lKChlbGVtZW50KSA9PiBlbGVtZW50LmxvY2FsTmFtZSA9PT0gbG9jYWxOYW1lKTtcbiAgfVxuXG4gIHByaXZhdGUgaHJlZlRvUmVtb3RlUGF0aChocmVmOiBzdHJpbmcpIHtcbiAgICBjb25zdCBiYXNlVXJsID0gYCR7dGhpcy5zZXR0aW5ncy53ZWJkYXZVcmwucmVwbGFjZSgvXFwvKyQvLCBcIlwiKX0vYDtcbiAgICBjb25zdCByZXNvbHZlZCA9IG5ldyBVUkwoaHJlZiwgYmFzZVVybCk7XG4gICAgY29uc3QgYmFzZVBhdGggPSBuZXcgVVJMKGJhc2VVcmwpLnBhdGhuYW1lLnJlcGxhY2UoL1xcLyskLywgXCIvXCIpO1xuICAgIGNvbnN0IGRlY29kZWRQYXRoID0gdGhpcy5kZWNvZGVQYXRobmFtZShyZXNvbHZlZC5wYXRobmFtZSk7XG4gICAgaWYgKCFkZWNvZGVkUGF0aC5zdGFydHNXaXRoKGJhc2VQYXRoKSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlY29kZWRQYXRoLnNsaWNlKGJhc2VQYXRoLmxlbmd0aCkucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgZGVjb2RlUGF0aG5hbWUocGF0aG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBwYXRobmFtZVxuICAgICAgLnNwbGl0KFwiL1wiKVxuICAgICAgLm1hcCgoc2VnbWVudCkgPT4ge1xuICAgICAgICBpZiAoIXNlZ21lbnQpIHtcbiAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudChzZWdtZW50KTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgcmV0dXJuIHNlZ21lbnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuam9pbihcIi9cIik7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkRXhwZWN0ZWRSZW1vdGVEaXJlY3RvcmllcyhyZW1vdGVGaWxlUGF0aHM6IFNldDxzdHJpbmc+LCByb290Rm9sZGVyOiBzdHJpbmcpIHtcbiAgICBjb25zdCBleHBlY3RlZCA9IG5ldyBTZXQ8c3RyaW5nPihbdGhpcy5ub3JtYWxpemVGb2xkZXIocm9vdEZvbGRlcildKTtcbiAgICBmb3IgKGNvbnN0IHJlbW90ZVBhdGggb2YgcmVtb3RlRmlsZVBhdGhzKSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IHJlbW90ZVBhdGguc3BsaXQoXCIvXCIpLmZpbHRlcigodmFsdWUpID0+IHZhbHVlLmxlbmd0aCA+IDApO1xuICAgICAgbGV0IGN1cnJlbnQgPSBcIlwiO1xuICAgICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHBhcnRzLmxlbmd0aCAtIDE7IGluZGV4ICs9IDEpIHtcbiAgICAgICAgY3VycmVudCA9IGN1cnJlbnQgPyBgJHtjdXJyZW50fS8ke3BhcnRzW2luZGV4XX1gIDogcGFydHNbaW5kZXhdO1xuICAgICAgICBleHBlY3RlZC5hZGQodGhpcy5ub3JtYWxpemVGb2xkZXIoY3VycmVudCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBleHBlY3RlZDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZGVsZXRlRXh0cmFSZW1vdGVEaXJlY3RvcmllcyhyZW1vdGVEaXJlY3RvcmllczogU2V0PHN0cmluZz4sIGV4cGVjdGVkRGlyZWN0b3JpZXM6IFNldDxzdHJpbmc+KSB7XG4gICAgbGV0IGRlbGV0ZWQgPSAwO1xuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBbLi4ucmVtb3RlRGlyZWN0b3JpZXNdXG4gICAgICAuZmlsdGVyKChyZW1vdGVQYXRoKSA9PiAhZXhwZWN0ZWREaXJlY3Rvcmllcy5oYXMocmVtb3RlUGF0aCkpXG4gICAgICAuc29ydCgoYSwgYikgPT4gYi5sZW5ndGggLSBhLmxlbmd0aCB8fCBiLmxvY2FsZUNvbXBhcmUoYSkpO1xuXG4gICAgZm9yIChjb25zdCByZW1vdGVQYXRoIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgICBtZXRob2Q6IFwiREVMRVRFXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChbMjAwLCAyMDIsIDIwNCwgNDA0XS5pbmNsdWRlcyhyZXNwb25zZS5zdGF0dXMpKSB7XG4gICAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgIT09IDQwNCkge1xuICAgICAgICAgIGRlbGV0ZWQgKz0gMTtcbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKFs0MDUsIDQwOV0uaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBERUxFVEUgZGlyZWN0b3J5IGZhaWxlZCBmb3IgJHtyZW1vdGVQYXRofSB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGVsZXRlZDtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzUGVuZGluZ1Rhc2tzKCkge1xyXG4gICAgaWYgKHRoaXMucXVldWUubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBmb3IgKGNvbnN0IHRhc2sgb2YgWy4uLnRoaXMucXVldWVdKSB7XHJcbiAgICAgIGlmICh0aGlzLnByb2Nlc3NpbmdUYXNrSWRzLmhhcyh0YXNrLmlkKSkge1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICB2b2lkIHRoaXMucHJvY2Vzc1Rhc2sodGFzayk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIHVwbG9hZEltYWdlc0luTm90ZShub3RlRmlsZTogVEZpbGUpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKG5vdGVGaWxlKTtcclxuICAgICAgY29uc3QgcmVwbGFjZW1lbnRzID0gYXdhaXQgdGhpcy5idWlsZFVwbG9hZFJlcGxhY2VtZW50cyhjb250ZW50LCBub3RlRmlsZSk7XHJcblxyXG4gICAgICBpZiAocmVwbGFjZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1RjUzXHU1MjREXHU3QjE0XHU4QkIwXHU0RTJEXHU2Q0ExXHU2NzA5XHU2MjdFXHU1MjMwXHU2NzJDXHU1NzMwXHU1NkZFXHU3MjQ3XHUzMDAyXCIsIFwiTm8gbG9jYWwgaW1hZ2VzIGZvdW5kIGluIHRoZSBjdXJyZW50IG5vdGUuXCIpKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGxldCB1cGRhdGVkID0gY29udGVudDtcclxuICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcclxuICAgICAgICB1cGRhdGVkID0gdXBkYXRlZC5zcGxpdChyZXBsYWNlbWVudC5vcmlnaW5hbCkuam9pbihyZXBsYWNlbWVudC5yZXdyaXR0ZW4pO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAodXBkYXRlZCA9PT0gY29udGVudCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU2Q0ExXHU2NzA5XHU5NzAwXHU4OTgxXHU2NTM5XHU1MTk5XHU3Njg0XHU1NkZFXHU3MjQ3XHU5NEZFXHU2M0E1XHUzMDAyXCIsIFwiTm8gaW1hZ2VzIHdlcmUgcmV3cml0dGVuLlwiKSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkobm90ZUZpbGUsIHVwZGF0ZWQpO1xuXG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5kZWxldGVMb2NhbEFmdGVyVXBsb2FkKSB7XG4gICAgICAgIGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgcmVwbGFjZW1lbnRzKSB7XG4gICAgICAgICAgaWYgKHJlcGxhY2VtZW50LnNvdXJjZUZpbGUpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMudHJhc2hJZkV4aXN0cyhyZXBsYWNlbWVudC5zb3VyY2VGaWxlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxyXG4gICAgICBuZXcgTm90aWNlKHRoaXMudChgXHU1REYyXHU0RTBBXHU0RjIwICR7cmVwbGFjZW1lbnRzLmxlbmd0aH0gXHU1RjIwXHU1NkZFXHU3MjQ3XHU1MjMwIFdlYkRBVlx1MzAwMmAsIGBVcGxvYWRlZCAke3JlcGxhY2VtZW50cy5sZW5ndGh9IGltYWdlKHMpIHRvIFdlYkRBVi5gKSk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiU2VjdXJlIFdlYkRBViB1cGxvYWQgZmFpbGVkXCIsIGVycm9yKTtcclxuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU0RTBBXHU0RjIwXHU1OTMxXHU4RDI1XCIsIFwiVXBsb2FkIGZhaWxlZFwiKSwgZXJyb3IpLCA4MDAwKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgcHJvY2Vzc1Rhc2sodGFzazogVXBsb2FkVGFzaykge1xuICAgIHRoaXMucHJvY2Vzc2luZ1Rhc2tJZHMuYWRkKHRhc2suaWQpO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBiaW5hcnkgPSB0aGlzLmJhc2U2NFRvQXJyYXlCdWZmZXIodGFzay5kYXRhQmFzZTY0KTtcbiAgICAgIGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdGhpcy5wcmVwYXJlVXBsb2FkUGF5bG9hZChcbiAgICAgICAgYmluYXJ5LFxuICAgICAgICB0YXNrLm1pbWVUeXBlIHx8IHRoaXMuZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUodGFzay5maWxlTmFtZSksXG4gICAgICAgIHRhc2suZmlsZU5hbWUsXG4gICAgICApO1xuICAgICAgY29uc3QgcmVtb3RlTmFtZSA9IGF3YWl0IHRoaXMuYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnkocHJlcGFyZWQuZmlsZU5hbWUsIHByZXBhcmVkLmJpbmFyeSk7XG4gICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5idWlsZFJlbW90ZVBhdGgocmVtb3RlTmFtZSk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIlBVVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBwcmVwYXJlZC5taW1lVHlwZSxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogcHJlcGFyZWQuYmluYXJ5LFxuICAgICAgfSk7XG5cclxuICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVcGxvYWQgZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCByZXBsYWNlZCA9IGF3YWl0IHRoaXMucmVwbGFjZVBsYWNlaG9sZGVyKFxyXG4gICAgICAgIHRhc2subm90ZVBhdGgsXG4gICAgICAgIHRhc2suaWQsXG4gICAgICAgIHRhc2sucGxhY2Vob2xkZXIsXG4gICAgICAgIHRoaXMuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChgJHtTRUNVUkVfUFJPVE9DT0x9Ly8ke3JlbW90ZVBhdGh9YCwgcHJlcGFyZWQuZmlsZU5hbWUpLFxuICAgICAgKTtcbiAgICAgIGlmICghcmVwbGFjZWQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiXHU0RTBBXHU0RjIwXHU2MjEwXHU1MjlGXHVGRjBDXHU0RjQ2XHU2Q0ExXHU2NzA5XHU1NzI4XHU3QjE0XHU4QkIwXHU0RTJEXHU2MjdFXHU1MjMwXHU1M0VGXHU2NkZGXHU2MzYyXHU3Njg0XHU1MzYwXHU0RjREXHU3QjI2XHUzMDAyXCIsIFwiVXBsb2FkIHN1Y2NlZWRlZCwgYnV0IG5vIG1hdGNoaW5nIHBsYWNlaG9sZGVyIHdhcyBmb3VuZCBpbiB0aGUgbm90ZS5cIikpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICB0aGlzLnF1ZXVlID0gdGhpcy5xdWV1ZS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uaWQgIT09IHRhc2suaWQpO1xyXG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xyXG4gICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NjIxMFx1NTI5Rlx1MzAwMlwiLCBcIkltYWdlIHVwbG9hZGVkIHN1Y2Nlc3NmdWxseS5cIikpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihcIlNlY3VyZSBXZWJEQVYgcXVldWVkIHVwbG9hZCBmYWlsZWRcIiwgZXJyb3IpO1xyXG4gICAgICB0YXNrLmF0dGVtcHRzICs9IDE7XHJcbiAgICAgIHRhc2subGFzdEVycm9yID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xyXG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xyXG4gICAgICBpZiAodGFzay5hdHRlbXB0cyA+PSB0aGlzLnNldHRpbmdzLm1heFJldHJ5QXR0ZW1wdHMpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLnJlcGxhY2VQbGFjZWhvbGRlcih0YXNrLm5vdGVQYXRoLCB0YXNrLmlkLCB0YXNrLnBsYWNlaG9sZGVyLCB0aGlzLmJ1aWxkRmFpbGVkUGxhY2Vob2xkZXIodGFzay5maWxlTmFtZSwgdGFzay5sYXN0RXJyb3IpKTtcclxuICAgICAgICB0aGlzLnF1ZXVlID0gdGhpcy5xdWV1ZS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uaWQgIT09IHRhc2suaWQpO1xyXG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XHJcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU2NzAwXHU3RUM4XHU1OTMxXHU4RDI1XCIsIFwiSW1hZ2UgdXBsb2FkIGZhaWxlZCBwZXJtYW5lbnRseVwiKSwgZXJyb3IpLCA4MDAwKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLnNjaGVkdWxlUmV0cnkodGFzayk7XHJcbiAgICAgIH1cclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIHRoaXMucHJvY2Vzc2luZ1Rhc2tJZHMuZGVsZXRlKHRhc2suaWQpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBzY2hlZHVsZVJldHJ5KHRhc2s6IFVwbG9hZFRhc2spIHtcclxuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5yZXRyeVRpbWVvdXRzLmdldCh0YXNrLmlkKTtcclxuICAgIGlmIChleGlzdGluZykge1xyXG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KGV4aXN0aW5nKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBkZWxheSA9IE1hdGgubWF4KDEsIHRoaXMuc2V0dGluZ3MucmV0cnlEZWxheVNlY29uZHMpICogMTAwMCAqIHRhc2suYXR0ZW1wdHM7XHJcbiAgICBjb25zdCB0aW1lb3V0SWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgIHRoaXMucmV0cnlUaW1lb3V0cy5kZWxldGUodGFzay5pZCk7XHJcbiAgICAgIHZvaWQgdGhpcy5wcm9jZXNzVGFzayh0YXNrKTtcclxuICAgIH0sIGRlbGF5KTtcclxuICAgIHRoaXMucmV0cnlUaW1lb3V0cy5zZXQodGFzay5pZCwgdGltZW91dElkKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgcmVwbGFjZVBsYWNlaG9sZGVyKG5vdGVQYXRoOiBzdHJpbmcsIHRhc2tJZDogc3RyaW5nLCBwbGFjZWhvbGRlcjogc3RyaW5nLCByZXBsYWNlbWVudDogc3RyaW5nKSB7XHJcbiAgICBjb25zdCByZXBsYWNlZEluRWRpdG9yID0gdGhpcy5yZXBsYWNlUGxhY2Vob2xkZXJJbk9wZW5FZGl0b3JzKG5vdGVQYXRoLCB0YXNrSWQsIHBsYWNlaG9sZGVyLCByZXBsYWNlbWVudCk7XHJcbiAgICBpZiAocmVwbGFjZWRJbkVkaXRvcikge1xyXG4gICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKG5vdGVQYXRoKTtcclxuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xyXG4gICAgaWYgKGNvbnRlbnQuaW5jbHVkZXMocGxhY2Vob2xkZXIpKSB7XHJcbiAgICAgIGNvbnN0IHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGxhY2Vob2xkZXIsIHJlcGxhY2VtZW50KTtcclxuICAgICAgaWYgKHVwZGF0ZWQgIT09IGNvbnRlbnQpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdXBkYXRlZCk7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBwYXR0ZXJuID0gbmV3IFJlZ0V4cChgPHNwYW5bXj5dKmRhdGEtc2VjdXJlLXdlYmRhdi10YXNrPVwiJHt0aGlzLmVzY2FwZVJlZ0V4cCh0YXNrSWQpfVwiW14+XSo+Lio/PFxcL3NwYW4+YCwgXCJzXCIpO1xyXG4gICAgaWYgKHBhdHRlcm4udGVzdChjb250ZW50KSkge1xyXG4gICAgICBjb25zdCB1cGRhdGVkID0gY29udGVudC5yZXBsYWNlKHBhdHRlcm4sIHJlcGxhY2VtZW50KTtcclxuICAgICAgaWYgKHVwZGF0ZWQgIT09IGNvbnRlbnQpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdXBkYXRlZCk7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGJ1aWxkRmFpbGVkUGxhY2Vob2xkZXIoZmlsZU5hbWU6IHN0cmluZywgbWVzc2FnZT86IHN0cmluZykge1xuICAgIGNvbnN0IHNhZmVOYW1lID0gdGhpcy5lc2NhcGVIdG1sKGZpbGVOYW1lKTtcbiAgICBjb25zdCBzYWZlTWVzc2FnZSA9IHRoaXMuZXNjYXBlSHRtbChtZXNzYWdlID8/IHRoaXMudChcIlx1NjcyQVx1NzdFNVx1OTUxOVx1OEJFRlwiLCBcIlVua25vd24gZXJyb3JcIikpO1xuICAgIHJldHVybiBgPHNwYW4gY2xhc3M9XCJzZWN1cmUtd2ViZGF2LWZhaWxlZFwiIGFyaWEtbGFiZWw9XCIke3NhZmVOYW1lfVwiPiR7dGhpcy5lc2NhcGVIdG1sKHRoaXMuZm9ybWF0RmFpbGVkTGFiZWwoZmlsZU5hbWUpKX06ICR7c2FmZU1lc3NhZ2V9PC9zcGFuPmA7XG4gIH1cblxuICBwcml2YXRlIGVzY2FwZUh0bWwodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiB2YWx1ZVxuICAgICAgLnJlcGxhY2UoLyYvZywgXCImYW1wO1wiKVxuICAgICAgLnJlcGxhY2UoL1wiL2csIFwiJnF1b3Q7XCIpXG4gICAgICAucmVwbGFjZSgvPC9nLCBcIiZsdDtcIilcbiAgICAgIC5yZXBsYWNlKC8+L2csIFwiJmd0O1wiKTtcbiAgfVxuXG4gIHByaXZhdGUgdW5lc2NhcGVIdG1sKHZhbHVlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdmFsdWVcbiAgICAgIC5yZXBsYWNlKC8mcXVvdDsvZywgXCJcXFwiXCIpXG4gICAgICAucmVwbGFjZSgvJmd0Oy9nLCBcIj5cIilcbiAgICAgIC5yZXBsYWNlKC8mbHQ7L2csIFwiPFwiKVxuICAgICAgLnJlcGxhY2UoLyZhbXA7L2csIFwiJlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmwocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBGZXRjaCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtyZXNwb25zZS5hcnJheUJ1ZmZlcl0sIHtcbiAgICAgIHR5cGU6IHJlc3BvbnNlLmhlYWRlcnNbXCJjb250ZW50LXR5cGVcIl0gPz8gXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIixcbiAgICB9KTtcbiAgICBjb25zdCBibG9iVXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICB0aGlzLmJsb2JVcmxzLmFkZChibG9iVXJsKTtcbiAgICByZXR1cm4gYmxvYlVybDtcbiAgfVxuXG4gIHByaXZhdGUgYXJyYXlCdWZmZXJUb0Jhc2U2NChidWZmZXI6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShidWZmZXIpO1xuICAgIGNvbnN0IGNodW5rU2l6ZSA9IDB4ODAwMDtcbiAgICBsZXQgYmluYXJ5ID0gXCJcIjtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYnl0ZXMubGVuZ3RoOyBpbmRleCArPSBjaHVua1NpemUpIHtcbiAgICAgIGNvbnN0IGNodW5rID0gYnl0ZXMuc3ViYXJyYXkoaW5kZXgsIGluZGV4ICsgY2h1bmtTaXplKTtcbiAgICAgIGJpbmFyeSArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKC4uLmNodW5rKTtcbiAgICB9XG4gICAgcmV0dXJuIGJ0b2EoYmluYXJ5KTtcbiAgfVxuXG4gIHByaXZhdGUgYmFzZTY0VG9BcnJheUJ1ZmZlcihiYXNlNjQ6IHN0cmluZykge1xuICAgIGNvbnN0IGJpbmFyeSA9IGF0b2IoYmFzZTY0KTtcbiAgICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KGJpbmFyeS5sZW5ndGgpO1xuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBiaW5hcnkubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgICBieXRlc1tpbmRleF0gPSBiaW5hcnkuY2hhckNvZGVBdChpbmRleCk7XG4gICAgfVxuICAgIHJldHVybiBieXRlcy5idWZmZXIuc2xpY2UoYnl0ZXMuYnl0ZU9mZnNldCwgYnl0ZXMuYnl0ZU9mZnNldCArIGJ5dGVzLmJ5dGVMZW5ndGgpIGFzIEFycmF5QnVmZmVyO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZENsaXBib2FyZEZpbGVOYW1lKG1pbWVUeXBlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBleHRlbnNpb24gPSBtaW1lVHlwZS5zcGxpdChcIi9cIilbMV0/LnJlcGxhY2UoXCJqcGVnXCIsIFwianBnXCIpIHx8IFwicG5nXCI7XG4gICAgcmV0dXJuIGBwYXN0ZWQtaW1hZ2UtJHtEYXRlLm5vdygpfS4ke2V4dGVuc2lvbn1gO1xuICB9XG5cclxuICBwcml2YXRlIGVzY2FwZVJlZ0V4cCh2YWx1ZTogc3RyaW5nKSB7XHJcbiAgICByZXR1cm4gdmFsdWUucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csIFwiXFxcXCQmXCIpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSByZXBsYWNlUGxhY2Vob2xkZXJJbk9wZW5FZGl0b3JzKG5vdGVQYXRoOiBzdHJpbmcsIHRhc2tJZDogc3RyaW5nLCBwbGFjZWhvbGRlcjogc3RyaW5nLCByZXBsYWNlbWVudDogc3RyaW5nKSB7XHJcbiAgICBsZXQgcmVwbGFjZWQgPSBmYWxzZTtcclxuICAgIGNvbnN0IGxlYXZlcyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoXCJtYXJrZG93blwiKTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IGxlYWYgb2YgbGVhdmVzKSB7XHJcbiAgICAgIGNvbnN0IHZpZXcgPSBsZWFmLnZpZXc7XHJcbiAgICAgIGlmICghKHZpZXcgaW5zdGFuY2VvZiBNYXJrZG93blZpZXcpKSB7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmICghdmlldy5maWxlIHx8IHZpZXcuZmlsZS5wYXRoICE9PSBub3RlUGF0aCkge1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBlZGl0b3IgPSB2aWV3LmVkaXRvcjtcclxuICAgICAgY29uc3QgY29udGVudCA9IGVkaXRvci5nZXRWYWx1ZSgpO1xyXG4gICAgICBsZXQgdXBkYXRlZCA9IGNvbnRlbnQ7XHJcblxyXG4gICAgICBpZiAoY29udGVudC5pbmNsdWRlcyhwbGFjZWhvbGRlcikpIHtcclxuICAgICAgICB1cGRhdGVkID0gY29udGVudC5yZXBsYWNlKHBsYWNlaG9sZGVyLCByZXBsYWNlbWVudCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY29uc3QgcGF0dGVybiA9IG5ldyBSZWdFeHAoXHJcbiAgICAgICAgICBgPHNwYW5bXj5dKmRhdGEtc2VjdXJlLXdlYmRhdi10YXNrPVwiJHt0aGlzLmVzY2FwZVJlZ0V4cCh0YXNrSWQpfVwiW14+XSo+Lio/PFxcXFwvc3Bhbj5gLFxyXG4gICAgICAgICAgXCJzXCIsXHJcbiAgICAgICAgKTtcclxuICAgICAgICB1cGRhdGVkID0gY29udGVudC5yZXBsYWNlKHBhdHRlcm4sIHJlcGxhY2VtZW50KTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHVwZGF0ZWQgIT09IGNvbnRlbnQpIHtcclxuICAgICAgICBlZGl0b3Iuc2V0VmFsdWUodXBkYXRlZCk7XHJcbiAgICAgICAgcmVwbGFjZWQgPSB0cnVlO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHJlcGxhY2VkO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzU2VjdXJlSW1hZ2VzKGVsOiBIVE1MRWxlbWVudCwgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0KSB7XG4gICAgY29uc3Qgc2VjdXJlTm9kZXMgPSBBcnJheS5mcm9tKGVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFwiW2RhdGEtc2VjdXJlLXdlYmRhdl1cIikpO1xuICAgIGF3YWl0IFByb21pc2UuYWxsKFxyXG4gICAgICBzZWN1cmVOb2Rlcy5tYXAoYXN5bmMgKG5vZGUpID0+IHtcclxuICAgICAgICBpZiAobm9kZSBpbnN0YW5jZW9mIEhUTUxJbWFnZUVsZW1lbnQpIHtcclxuICAgICAgICAgIGF3YWl0IHRoaXMuc3dhcEltYWdlU291cmNlKG5vZGUpO1xyXG4gICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IG5vZGUuZ2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2XCIpO1xyXG4gICAgICAgIGlmICghcmVtb3RlUGF0aCkge1xyXG4gICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaW1nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImltZ1wiKTtcclxuICAgICAgICBpbWcuYWx0ID0gbm9kZS5nZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIpID8/IG5vZGUuZ2V0QXR0cmlidXRlKFwiYWx0XCIpID8/IFwiU2VjdXJlIFdlYkRBViBpbWFnZVwiO1xyXG4gICAgICAgIGltZy5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIiwgcmVtb3RlUGF0aCk7XHJcbiAgICAgICAgaW1nLmNsYXNzTGlzdC5hZGQoXCJzZWN1cmUtd2ViZGF2LWltYWdlXCIsIFwiaXMtbG9hZGluZ1wiKTtcclxuICAgICAgICBub2RlLnJlcGxhY2VXaXRoKGltZyk7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5zd2FwSW1hZ2VTb3VyY2UoaW1nKTtcclxuICAgICAgfSksXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IHNlY3VyZUxpbmtzID0gQXJyYXkuZnJvbShlbC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxJbWFnZUVsZW1lbnQ+KGBpbWdbc3JjXj1cIiR7U0VDVVJFX1BST1RPQ09MfS8vXCJdYCkpO1xyXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoc2VjdXJlTGlua3MubWFwKGFzeW5jIChpbWcpID0+IHRoaXMuc3dhcEltYWdlU291cmNlKGltZykpKTtcclxuXG4gICAgY3R4LmFkZENoaWxkKG5ldyBTZWN1cmVXZWJkYXZSZW5kZXJDaGlsZChlbCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzU2VjdXJlQ29kZUJsb2NrKHNvdXJjZTogc3RyaW5nLCBlbDogSFRNTEVsZW1lbnQsIGN0eDogTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dCkge1xuICAgIGNvbnN0IHBhcnNlZCA9IHRoaXMucGFyc2VTZWN1cmVJbWFnZUJsb2NrKHNvdXJjZSk7XG4gICAgaWYgKCFwYXJzZWQ/LnBhdGgpIHtcbiAgICAgIGVsLmNyZWF0ZUVsKFwiZGl2XCIsIHtcbiAgICAgICAgdGV4dDogdGhpcy50KFwiXHU1Qjg5XHU1MTY4XHU1NkZFXHU3MjQ3XHU0RUUzXHU3ODAxXHU1NzU3XHU2ODNDXHU1RjBGXHU2NUUwXHU2NTQ4XHUzMDAyXCIsIFwiSW52YWxpZCBzZWN1cmUgaW1hZ2UgY29kZSBibG9jayBmb3JtYXQuXCIpLFxuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaW1nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImltZ1wiKTtcbiAgICBpbWcuYWx0ID0gcGFyc2VkLmFsdCB8fCBwYXJzZWQucGF0aDtcbiAgICBpbWcuc2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2XCIsIHBhcnNlZC5wYXRoKTtcbiAgICBpbWcuY2xhc3NMaXN0LmFkZChcInNlY3VyZS13ZWJkYXYtaW1hZ2VcIiwgXCJpcy1sb2FkaW5nXCIpO1xuICAgIGVsLmVtcHR5KCk7XG4gICAgZWwuYXBwZW5kQ2hpbGQoaW1nKTtcbiAgICBhd2FpdCB0aGlzLnN3YXBJbWFnZVNvdXJjZShpbWcpO1xuICAgIGN0eC5hZGRDaGlsZChuZXcgU2VjdXJlV2ViZGF2UmVuZGVyQ2hpbGQoZWwpKTtcbiAgfVxuXG4gIHByaXZhdGUgcGFyc2VTZWN1cmVJbWFnZUJsb2NrKHNvdXJjZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0OiB7IHBhdGg6IHN0cmluZzsgYWx0OiBzdHJpbmcgfSA9IHsgcGF0aDogXCJcIiwgYWx0OiBcIlwiIH07XG4gICAgZm9yIChjb25zdCByYXdMaW5lIG9mIHNvdXJjZS5zcGxpdCgvXFxyP1xcbi8pKSB7XG4gICAgICBjb25zdCBsaW5lID0gcmF3TGluZS50cmltKCk7XG4gICAgICBpZiAoIWxpbmUpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHNlcGFyYXRvckluZGV4ID0gbGluZS5pbmRleE9mKFwiOlwiKTtcbiAgICAgIGlmIChzZXBhcmF0b3JJbmRleCA9PT0gLTEpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGtleSA9IGxpbmUuc2xpY2UoMCwgc2VwYXJhdG9ySW5kZXgpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgY29uc3QgdmFsdWUgPSBsaW5lLnNsaWNlKHNlcGFyYXRvckluZGV4ICsgMSkudHJpbSgpO1xuICAgICAgaWYgKGtleSA9PT0gXCJwYXRoXCIpIHtcbiAgICAgICAgcmVzdWx0LnBhdGggPSB2YWx1ZTtcbiAgICAgIH0gZWxzZSBpZiAoa2V5ID09PSBcImFsdFwiKSB7XG4gICAgICAgIHJlc3VsdC5hbHQgPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0LnBhdGggPyByZXN1bHQgOiBudWxsO1xuICB9XG5cclxuICBwcml2YXRlIGFzeW5jIHN3YXBJbWFnZVNvdXJjZShpbWc6IEhUTUxJbWFnZUVsZW1lbnQpIHtcclxuICAgIGNvbnN0IHJlbW90ZVBhdGggPVxyXG4gICAgICBpbWcuZ2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2XCIpID8/IHRoaXMuZXh0cmFjdFJlbW90ZVBhdGgoaW1nLmdldEF0dHJpYnV0ZShcInNyY1wiKSA/PyBcIlwiKTtcclxuICAgIGlmICghcmVtb3RlUGF0aCkge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgaW1nLmNsYXNzTGlzdC5hZGQoXCJzZWN1cmUtd2ViZGF2LWltYWdlXCIsIFwiaXMtbG9hZGluZ1wiKTtcclxuICAgIGNvbnN0IG9yaWdpbmFsQWx0ID0gaW1nLmFsdDtcclxuICAgIGltZy5hbHQgPSBvcmlnaW5hbEFsdCB8fCB0aGlzLnQoXCJcdTUyQTBcdThGN0RcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTRFMkQuLi5cIiwgXCJMb2FkaW5nIHNlY3VyZSBpbWFnZS4uLlwiKTtcclxuXHJcbiAgICB0cnkge1xuICAgICAgY29uc3QgYmxvYlVybCA9IGF3YWl0IHRoaXMuZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmwocmVtb3RlUGF0aCk7XG4gICAgICBpbWcuc3JjID0gYmxvYlVybDtcbiAgICAgIGltZy5hbHQgPSBvcmlnaW5hbEFsdDtcbiAgICAgIGltZy5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgICAgaW1nLnN0eWxlLm1heFdpZHRoID0gXCIxMDAlXCI7XHJcbiAgICAgIGltZy5jbGFzc0xpc3QucmVtb3ZlKFwiaXMtbG9hZGluZ1wiLCBcImlzLWVycm9yXCIpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihcIlNlY3VyZSBXZWJEQVYgaW1hZ2UgbG9hZCBmYWlsZWRcIiwgZXJyb3IpO1xyXG4gICAgICBpbWcucmVwbGFjZVdpdGgodGhpcy5idWlsZEVycm9yRWxlbWVudChyZW1vdGVQYXRoLCBlcnJvcikpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBleHRyYWN0UmVtb3RlUGF0aChzcmM6IHN0cmluZykge1xyXG4gICAgY29uc3QgcHJlZml4ID0gYCR7U0VDVVJFX1BST1RPQ09MfS8vYDtcclxuICAgIGlmICghc3JjLnN0YXJ0c1dpdGgocHJlZml4KSkge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gc3JjLnNsaWNlKHByZWZpeC5sZW5ndGgpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBidWlsZFJlbW90ZVBhdGgoZmlsZU5hbWU6IHN0cmluZykge1xyXG4gICAgcmV0dXJuIGAke3RoaXMubm9ybWFsaXplRm9sZGVyKHRoaXMuc2V0dGluZ3MucmVtb3RlRm9sZGVyKX0ke2ZpbGVOYW1lfWA7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIGJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5KGZpbGVOYW1lOiBzdHJpbmcsIGJpbmFyeTogQXJyYXlCdWZmZXIpIHtcbiAgICBjb25zdCBleHRlbnNpb24gPSB0aGlzLmdldEV4dGVuc2lvbkZyb21GaWxlTmFtZShmaWxlTmFtZSk7XG4gICAgaWYgKHRoaXMuc2V0dGluZ3MubmFtaW5nU3RyYXRlZ3kgPT09IFwiaGFzaFwiKSB7XG4gICAgICBjb25zdCBoYXNoID0gKGF3YWl0IHRoaXMuY29tcHV0ZVNoYTI1NkhleChiaW5hcnkpKS5zbGljZSgwLCAxNik7XG4gICAgICByZXR1cm4gYCR7aGFzaH0uJHtleHRlbnNpb259YDtcbiAgICB9XG5cclxuICAgIHJldHVybiBgJHtEYXRlLm5vdygpfS0ke2ZpbGVOYW1lfWA7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGg6IHN0cmluZykge1xyXG4gICAgY29uc3QgYmFzZSA9IHRoaXMuc2V0dGluZ3Mud2ViZGF2VXJsLnJlcGxhY2UoL1xcLyskLywgXCJcIik7XHJcbiAgICByZXR1cm4gYCR7YmFzZX0vJHtyZW1vdGVQYXRoLnNwbGl0KFwiL1wiKS5tYXAoZW5jb2RlVVJJQ29tcG9uZW50KS5qb2luKFwiL1wiKX1gO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBub3JtYWxpemVGb2xkZXIoaW5wdXQ6IHN0cmluZykge1xyXG4gICAgcmV0dXJuIGlucHV0LnJlcGxhY2UoL15cXC8rLywgXCJcIikucmVwbGFjZSgvXFwvKyQvLCBcIlwiKSArIFwiL1wiO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBidWlsZEF1dGhIZWFkZXIoKSB7XG4gICAgY29uc3QgdG9rZW4gPSB0aGlzLmFycmF5QnVmZmVyVG9CYXNlNjQodGhpcy5lbmNvZGVVdGY4KGAke3RoaXMuc2V0dGluZ3MudXNlcm5hbWV9OiR7dGhpcy5zZXR0aW5ncy5wYXNzd29yZH1gKSk7XG4gICAgcmV0dXJuIGBCYXNpYyAke3Rva2VufWA7XG4gIH1cblxyXG4gIHByaXZhdGUgZW5zdXJlQ29uZmlndXJlZCgpIHtcclxuICAgIGlmICghdGhpcy5zZXR0aW5ncy53ZWJkYXZVcmwgfHwgIXRoaXMuc2V0dGluZ3MudXNlcm5hbWUgfHwgIXRoaXMuc2V0dGluZ3MucGFzc3dvcmQpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIldlYkRBViBcdTkxNERcdTdGNkVcdTRFMERcdTVCOENcdTY1NzRcdTMwMDJcIiwgXCJXZWJEQVYgc2V0dGluZ3MgYXJlIGluY29tcGxldGUuXCIpKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgZ2V0TWltZVR5cGUoZXh0ZW5zaW9uOiBzdHJpbmcpIHtcclxuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBleHRlbnNpb24udG9Mb3dlckNhc2UoKTtcclxuICAgIGlmIChub3JtYWxpemVkID09PSBcImpwZ1wiIHx8IG5vcm1hbGl6ZWQgPT09IFwianBlZ1wiKSByZXR1cm4gXCJpbWFnZS9qcGVnXCI7XHJcbiAgICBpZiAobm9ybWFsaXplZCA9PT0gXCJwbmdcIikgcmV0dXJuIFwiaW1hZ2UvcG5nXCI7XHJcbiAgICBpZiAobm9ybWFsaXplZCA9PT0gXCJnaWZcIikgcmV0dXJuIFwiaW1hZ2UvZ2lmXCI7XHJcbiAgICBpZiAobm9ybWFsaXplZCA9PT0gXCJ3ZWJwXCIpIHJldHVybiBcImltYWdlL3dlYnBcIjtcclxuICAgIGlmIChub3JtYWxpemVkID09PSBcInN2Z1wiKSByZXR1cm4gXCJpbWFnZS9zdmcreG1sXCI7XHJcbiAgICBpZiAobm9ybWFsaXplZCA9PT0gXCJibXBcIikgcmV0dXJuIFwiaW1hZ2UvYm1wXCI7XHJcbiAgICByZXR1cm4gXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIjtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmdldE1pbWVUeXBlKHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbUZpbGVOYW1lKGZpbGVOYW1lKSk7XG4gIH1cblxuICBwcml2YXRlIGdldEV4dGVuc2lvbkZyb21GaWxlTmFtZShmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcGllY2VzID0gZmlsZU5hbWUuc3BsaXQoXCIuXCIpO1xuICAgIHJldHVybiBwaWVjZXMubGVuZ3RoID4gMSA/IHBpZWNlc1twaWVjZXMubGVuZ3RoIC0gMV0udG9Mb3dlckNhc2UoKSA6IFwicG5nXCI7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHByZXBhcmVVcGxvYWRQYXlsb2FkKGJpbmFyeTogQXJyYXlCdWZmZXIsIG1pbWVUeXBlOiBzdHJpbmcsIGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBpZiAoIXRoaXMuc2V0dGluZ3MuY29tcHJlc3NJbWFnZXMpIHtcbiAgICAgIHJldHVybiB7IGJpbmFyeSwgbWltZVR5cGUsIGZpbGVOYW1lIH07XG4gICAgfVxuXG4gICAgY29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLmNvbXByZXNzSW1hZ2VJZk5lZWRlZChiaW5hcnksIG1pbWVUeXBlLCBmaWxlTmFtZSk7XG4gICAgcmV0dXJuIHByZXBhcmVkID8/IHsgYmluYXJ5LCBtaW1lVHlwZSwgZmlsZU5hbWUgfTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY29tcHJlc3NJbWFnZUlmTmVlZGVkKGJpbmFyeTogQXJyYXlCdWZmZXIsIG1pbWVUeXBlOiBzdHJpbmcsIGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBpZiAoIS9eaW1hZ2VcXC8ocG5nfGpwZWd8anBnfHdlYnApJC9pLnRlc3QobWltZVR5cGUpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCB0aHJlc2hvbGRCeXRlcyA9IHRoaXMuc2V0dGluZ3MuY29tcHJlc3NUaHJlc2hvbGRLYiAqIDEwMjQ7XG4gICAgY29uc3Qgc291cmNlQmxvYiA9IG5ldyBCbG9iKFtiaW5hcnldLCB7IHR5cGU6IG1pbWVUeXBlIH0pO1xuICAgIGNvbnN0IGltYWdlID0gYXdhaXQgdGhpcy5sb2FkSW1hZ2VFbGVtZW50KHNvdXJjZUJsb2IpO1xuICAgIGNvbnN0IGxhcmdlc3RTaWRlID0gTWF0aC5tYXgoaW1hZ2UubmF0dXJhbFdpZHRoLCBpbWFnZS5uYXR1cmFsSGVpZ2h0KTtcbiAgICBjb25zdCBuZWVkc1Jlc2l6ZSA9IGxhcmdlc3RTaWRlID4gdGhpcy5zZXR0aW5ncy5tYXhJbWFnZURpbWVuc2lvbjtcbiAgICBjb25zdCBuZWVkc0NvbXByZXNzID0gc291cmNlQmxvYi5zaXplID4gdGhyZXNob2xkQnl0ZXMgfHwgbmVlZHNSZXNpemU7XG4gICAgaWYgKCFuZWVkc0NvbXByZXNzKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBzY2FsZSA9IG5lZWRzUmVzaXplID8gdGhpcy5zZXR0aW5ncy5tYXhJbWFnZURpbWVuc2lvbiAvIGxhcmdlc3RTaWRlIDogMTtcbiAgICBjb25zdCB0YXJnZXRXaWR0aCA9IE1hdGgubWF4KDEsIE1hdGgucm91bmQoaW1hZ2UubmF0dXJhbFdpZHRoICogc2NhbGUpKTtcbiAgICBjb25zdCB0YXJnZXRIZWlnaHQgPSBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKGltYWdlLm5hdHVyYWxIZWlnaHQgKiBzY2FsZSkpO1xuICAgIGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJjYW52YXNcIik7XG4gICAgY2FudmFzLndpZHRoID0gdGFyZ2V0V2lkdGg7XG4gICAgY2FudmFzLmhlaWdodCA9IHRhcmdldEhlaWdodDtcbiAgICBjb25zdCBjb250ZXh0ID0gY2FudmFzLmdldENvbnRleHQoXCIyZFwiKTtcbiAgICBpZiAoIWNvbnRleHQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnRleHQuZHJhd0ltYWdlKGltYWdlLCAwLCAwLCB0YXJnZXRXaWR0aCwgdGFyZ2V0SGVpZ2h0KTtcblxuICAgIGNvbnN0IG91dHB1dE1pbWUgPSBtaW1lVHlwZS50b0xvd2VyQ2FzZSgpID09PSBcImltYWdlL2pwZ1wiID8gXCJpbWFnZS9qcGVnXCIgOiBtaW1lVHlwZTtcbiAgICBjb25zdCBxdWFsaXR5ID0gTWF0aC5tYXgoMC40LCBNYXRoLm1pbigwLjk4LCB0aGlzLnNldHRpbmdzLmpwZWdRdWFsaXR5IC8gMTAwKSk7XG4gICAgY29uc3QgY29tcHJlc3NlZEJsb2IgPSBhd2FpdCBuZXcgUHJvbWlzZTxCbG9iIHwgbnVsbD4oKHJlc29sdmUpID0+IHtcbiAgICAgIGNhbnZhcy50b0Jsb2IocmVzb2x2ZSwgb3V0cHV0TWltZSwgcXVhbGl0eSk7XG4gICAgfSk7XG5cbiAgICBpZiAoIWNvbXByZXNzZWRCbG9iKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoIW5lZWRzUmVzaXplICYmIGNvbXByZXNzZWRCbG9iLnNpemUgPj0gc291cmNlQmxvYi5zaXplKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBuZXh0QmluYXJ5ID0gYXdhaXQgY29tcHJlc3NlZEJsb2IuYXJyYXlCdWZmZXIoKTtcbiAgICBjb25zdCBuZXh0RXh0ZW5zaW9uID0gdGhpcy5leHRlbnNpb25Gcm9tTWltZVR5cGUob3V0cHV0TWltZSkgPz8gdGhpcy5nZXRFeHRlbnNpb25Gcm9tRmlsZU5hbWUoZmlsZU5hbWUpO1xuICAgIGNvbnN0IG5leHRGaWxlTmFtZSA9IGZpbGVOYW1lLnJlcGxhY2UoL1xcLlteLl0rJC8sIFwiXCIpICsgYC4ke25leHRFeHRlbnNpb259YDtcbiAgICByZXR1cm4ge1xuICAgICAgYmluYXJ5OiBuZXh0QmluYXJ5LFxuICAgICAgbWltZVR5cGU6IG91dHB1dE1pbWUsXG4gICAgICBmaWxlTmFtZTogbmV4dEZpbGVOYW1lLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGxvYWRJbWFnZUVsZW1lbnQoYmxvYjogQmxvYikge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZTxIVE1MSW1hZ2VFbGVtZW50PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICAgICAgY29uc3QgaW1hZ2UgPSBuZXcgSW1hZ2UoKTtcbiAgICAgIGltYWdlLm9ubG9hZCA9ICgpID0+IHtcbiAgICAgICAgVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpO1xuICAgICAgICByZXNvbHZlKGltYWdlKTtcbiAgICAgIH07XG4gICAgICBpbWFnZS5vbmVycm9yID0gKGVycm9yKSA9PiB7XG4gICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwodXJsKTtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH07XG4gICAgICBpbWFnZS5zcmMgPSB1cmw7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGV4dGVuc2lvbkZyb21NaW1lVHlwZShtaW1lVHlwZTogc3RyaW5nKSB7XG4gICAgaWYgKG1pbWVUeXBlID09PSBcImltYWdlL2pwZWdcIikgcmV0dXJuIFwianBnXCI7XG4gICAgaWYgKG1pbWVUeXBlID09PSBcImltYWdlL3BuZ1wiKSByZXR1cm4gXCJwbmdcIjtcbiAgICBpZiAobWltZVR5cGUgPT09IFwiaW1hZ2Uvd2VicFwiKSByZXR1cm4gXCJ3ZWJwXCI7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxyXG4gIHByaXZhdGUgYXN5bmMgdHJhc2hJZkV4aXN0cyhmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC50cmFzaChmaWxlLCB0cnVlKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUud2FybihcIkZhaWxlZCB0byB0cmFzaCBsb2NhbCBpbWFnZSBhZnRlciB1cGxvYWRcIiwgZXJyb3IpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBidWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybDogc3RyaW5nLCBhbHQ6IHN0cmluZykge1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmV4dHJhY3RSZW1vdGVQYXRoKHJlbW90ZVVybCk7XG4gICAgaWYgKCFyZW1vdGVQYXRoKSB7XG4gICAgICByZXR1cm4gYCFbXSgke3JlbW90ZVVybH0pYDtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5idWlsZFNlY3VyZUltYWdlQ29kZUJsb2NrKHJlbW90ZVBhdGgsIGFsdCk7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkU2VjdXJlSW1hZ2VDb2RlQmxvY2socmVtb3RlUGF0aDogc3RyaW5nLCBhbHQ6IHN0cmluZykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRBbHQgPSAoYWx0IHx8IHJlbW90ZVBhdGgpLnJlcGxhY2UoL1xccj9cXG4vZywgXCIgXCIpLnRyaW0oKTtcbiAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IHJlbW90ZVBhdGgucmVwbGFjZSgvXFxyP1xcbi9nLCBcIlwiKS50cmltKCk7XG4gICAgcmV0dXJuIFtcbiAgICAgIGBcXGBcXGBcXGAke1NFQ1VSRV9DT0RFX0JMT0NLfWAsXG4gICAgICBgcGF0aDogJHtub3JtYWxpemVkUGF0aH1gLFxuICAgICAgYGFsdDogJHtub3JtYWxpemVkQWx0fWAsXG4gICAgICBcImBgYFwiLFxuICAgIF0uam9pbihcIlxcblwiKTtcbiAgfVxuXG4gIHByaXZhdGUgZm9ybWF0RW1iZWRMYWJlbChmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMudChgXHUzMDEwXHU1Qjg5XHU1MTY4XHU4RkRDXHU3QTBCXHU1NkZFXHU3MjQ3XHVGRjVDJHtmaWxlTmFtZX1cdTMwMTFgLCBgW1NlY3VyZSByZW1vdGUgaW1hZ2UgfCAke2ZpbGVOYW1lfV1gKTtcbiAgfVxuXG4gIHByaXZhdGUgZm9ybWF0RmFpbGVkTGFiZWwoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLnQoYFx1MzAxMFx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NTkzMVx1OEQyNVx1RkY1QyR7ZmlsZU5hbWV9XHUzMDExYCwgYFtJbWFnZSB1cGxvYWQgZmFpbGVkIHwgJHtmaWxlTmFtZX1dYCk7XG4gIH1cblxuICBhc3luYyBtaWdyYXRlQWxsTGVnYWN5U2VjdXJlSW1hZ2VzKCkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB1cGxvYWRDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgICBjb25zdCBjYW5kaWRhdGVMb2NhbEltYWdlcyA9IG5ldyBNYXA8c3RyaW5nLCBURmlsZT4oKTtcbiAgICAgIGxldCBjaGFuZ2VkRmlsZXMgPSAwO1xuICAgICAgZm9yIChjb25zdCBmaWxlIG9mIHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKSkge1xuICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgICAgY29uc3QgcmVwbGFjZW1lbnRzID0gYXdhaXQgdGhpcy5idWlsZFVwbG9hZFJlcGxhY2VtZW50cyhjb250ZW50LCBmaWxlLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgcmVwbGFjZW1lbnRzKSB7XG4gICAgICAgICAgaWYgKHJlcGxhY2VtZW50LnNvdXJjZUZpbGUpIHtcbiAgICAgICAgICAgIGNhbmRpZGF0ZUxvY2FsSW1hZ2VzLnNldChyZXBsYWNlbWVudC5zb3VyY2VGaWxlLnBhdGgsIHJlcGxhY2VtZW50LnNvdXJjZUZpbGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGxldCB1cGRhdGVkID0gY29udGVudDtcbiAgICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcbiAgICAgICAgICB1cGRhdGVkID0gdXBkYXRlZC5zcGxpdChyZXBsYWNlbWVudC5vcmlnaW5hbCkuam9pbihyZXBsYWNlbWVudC5yZXdyaXR0ZW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlZCA9IHVwZGF0ZWRcbiAgICAgICAgICAucmVwbGFjZShcbiAgICAgICAgICAgIC88c3BhbiBjbGFzcz1cInNlY3VyZS13ZWJkYXYtZW1iZWRcIiBkYXRhLXNlY3VyZS13ZWJkYXY9XCIoW15cIl0rKVwiIGFyaWEtbGFiZWw9XCIoW15cIl0qKVwiPi4qPzxcXC9zcGFuPi9nLFxuICAgICAgICAgICAgKF9tYXRjaCwgcmVtb3RlUGF0aDogc3RyaW5nLCBhbHQ6IHN0cmluZykgPT5cbiAgICAgICAgICAgICAgdGhpcy5idWlsZFNlY3VyZUltYWdlQ29kZUJsb2NrKFxuICAgICAgICAgICAgICAgIHRoaXMudW5lc2NhcGVIdG1sKHJlbW90ZVBhdGgpLFxuICAgICAgICAgICAgICAgIHRoaXMudW5lc2NhcGVIdG1sKGFsdCkgfHwgdGhpcy51bmVzY2FwZUh0bWwocmVtb3RlUGF0aCksXG4gICAgICAgICAgICAgICksXG4gICAgICAgICAgKVxuICAgICAgICAgIC5yZXBsYWNlKFxuICAgICAgICAgICAgLyFcXFtbXlxcXV0qXVxcKHdlYmRhdi1zZWN1cmU6XFwvXFwvKFteKV0rKVxcKS9nLFxuICAgICAgICAgICAgKF9tYXRjaCwgcmVtb3RlUGF0aDogc3RyaW5nKSA9PlxuICAgICAgICAgICAgICB0aGlzLmJ1aWxkU2VjdXJlSW1hZ2VDb2RlQmxvY2sodGhpcy51bmVzY2FwZUh0bWwocmVtb3RlUGF0aCksIHRoaXMudW5lc2NhcGVIdG1sKHJlbW90ZVBhdGgpKSxcbiAgICAgICAgICApO1xuXG4gICAgICAgIGlmICh1cGRhdGVkID09PSBjb250ZW50KSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdXBkYXRlZCk7XG4gICAgICAgIGNoYW5nZWRGaWxlcyArPSAxO1xuICAgICAgfVxuXG4gICAgICBpZiAoY2hhbmdlZEZpbGVzID09PSAwKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgXCJcdTY1NzRcdTVFOTNcdTkxQ0NcdTZDQTFcdTY3MDlcdTUzRDFcdTczQjBcdTUzRUZcdThGQzFcdTc5RkJcdTc2ODRcdTY1RTdcdTcyNDhcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTY4MDdcdTdCN0VcdTMwMDJcIixcbiAgICAgICAgICAgIFwiTm8gbGVnYWN5IHNlY3VyZSBpbWFnZSB0YWdzIHdlcmUgZm91bmQgaW4gdGhlIHZhdWx0LlwiLFxuICAgICAgICAgICksXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZGVsZXRlTG9jYWxBZnRlclVwbG9hZCkge1xuICAgICAgICBhd2FpdCB0aGlzLnRyYXNoTWlncmF0ZWRJbWFnZXNJZlNhZmUoY2FuZGlkYXRlTG9jYWxJbWFnZXMpO1xuICAgICAgfVxuXG4gICAgICBuZXcgTm90aWNlKFxuICAgICAgICB0aGlzLnQoXG4gICAgICAgICAgYFx1NURGMlx1OEZDMVx1NzlGQiAke2NoYW5nZWRGaWxlc30gXHU3QkM3XHU3QjE0XHU4QkIwXHU1MjMwXHU2NUIwXHU3Njg0XHU1Qjg5XHU1MTY4XHU1NkZFXHU3MjQ3XHU0RUUzXHU3ODAxXHU1NzU3XHU2ODNDXHU1RjBGXHUzMDAyYCxcbiAgICAgICAgICBgTWlncmF0ZWQgJHtjaGFuZ2VkRmlsZXN9IG5vdGUocykgdG8gdGhlIG5ldyBzZWN1cmUgaW1hZ2UgY29kZS1ibG9jayBmb3JtYXQuYCxcbiAgICAgICAgKSxcbiAgICAgICAgODAwMCxcbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbWlncmF0ZSBzZWN1cmUgaW1hZ2VzIHRvIGNvZGUgYmxvY2tzXCIsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1OEZDMVx1NzlGQlx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NjgzQ1x1NUYwRlx1NTkzMVx1OEQyNVwiLCBcIkZhaWxlZCB0byBtaWdyYXRlIHNlY3VyZSBpbWFnZSBmb3JtYXRcIiksIGVycm9yKSwgODAwMCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB0cmFzaE1pZ3JhdGVkSW1hZ2VzSWZTYWZlKGNhbmRpZGF0ZUxvY2FsSW1hZ2VzOiBNYXA8c3RyaW5nLCBURmlsZT4pIHtcbiAgICBpZiAoY2FuZGlkYXRlTG9jYWxJbWFnZXMuc2l6ZSA9PT0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHJlbWFpbmluZ1JlZnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBmb3IgKGNvbnN0IG5vdGUgb2YgdGhpcy5hcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpKSB7XG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChub3RlKTtcbiAgICAgIGNvbnN0IHdpa2lNYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtcXFsoW15cXF1dKylcXF1cXF0vZyldO1xuICAgICAgY29uc3QgbWFya2Rvd25NYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtbXlxcXV0qXVxcKChbXildKylcXCkvZyldO1xuXG4gICAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIHdpa2lNYXRjaGVzKSB7XG4gICAgICAgIGNvbnN0IHJhd0xpbmsgPSBtYXRjaFsxXS5zcGxpdChcInxcIilbMF0udHJpbSgpO1xuICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGUucGF0aCk7XG4gICAgICAgIGlmICh0YXJnZXQgJiYgdGhpcy5pc0ltYWdlRmlsZSh0YXJnZXQpKSB7XG4gICAgICAgICAgcmVtYWluaW5nUmVmcy5hZGQodGFyZ2V0LnBhdGgpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWFya2Rvd25NYXRjaGVzKSB7XG4gICAgICAgIGNvbnN0IHJhd0xpbmsgPSBkZWNvZGVVUklDb21wb25lbnQobWF0Y2hbMV0udHJpbSgpLnJlcGxhY2UoL148fD4kL2csIFwiXCIpKTtcbiAgICAgICAgaWYgKC9eKGh0dHBzPzp8d2ViZGF2LXNlY3VyZTp8ZGF0YTopL2kudGVzdChyYXdMaW5rKSkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5yZXNvbHZlTGlua2VkRmlsZShyYXdMaW5rLCBub3RlLnBhdGgpO1xuICAgICAgICBpZiAodGFyZ2V0ICYmIHRoaXMuaXNJbWFnZUZpbGUodGFyZ2V0KSkge1xuICAgICAgICAgIHJlbWFpbmluZ1JlZnMuYWRkKHRhcmdldC5wYXRoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgW3BhdGgsIGZpbGVdIG9mIGNhbmRpZGF0ZUxvY2FsSW1hZ2VzLmVudHJpZXMoKSkge1xuICAgICAgaWYgKHJlbWFpbmluZ1JlZnMuaGFzKHBhdGgpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLnRyYXNoSWZFeGlzdHMoZmlsZSk7XG4gICAgfVxuICB9XG5cclxuICBwcml2YXRlIGJ1aWxkRXJyb3JFbGVtZW50KHJlbW90ZVBhdGg6IHN0cmluZywgZXJyb3I6IHVua25vd24pIHtcclxuICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGVsLmNsYXNzTmFtZSA9IFwic2VjdXJlLXdlYmRhdi1pbWFnZSBpcy1lcnJvclwiO1xyXG4gICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcclxuICAgIGVsLnRleHRDb250ZW50ID0gdGhpcy50KFxyXG4gICAgICBgXHU1Qjg5XHU1MTY4XHU1NkZFXHU3MjQ3XHU1MkEwXHU4RjdEXHU1OTMxXHU4RDI1XHVGRjFBJHtyZW1vdGVQYXRofVx1RkYwOCR7bWVzc2FnZX1cdUZGMDlgLFxyXG4gICAgICBgU2VjdXJlIGltYWdlIGZhaWxlZDogJHtyZW1vdGVQYXRofSAoJHttZXNzYWdlfSlgLFxyXG4gICAgKTtcclxuICAgIHJldHVybiBlbDtcclxuICB9XHJcblxyXG4gIGFzeW5jIHJ1bkNvbm5lY3Rpb25UZXN0KHNob3dNb2RhbCA9IGZhbHNlKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICB0aGlzLmVuc3VyZUNvbmZpZ3VyZWQoKTtcclxuXHJcbiAgICAgIGNvbnN0IHByb2JlTmFtZSA9IGAuc2VjdXJlLXdlYmRhdi1wcm9iZS0ke0RhdGUubm93KCl9LnR4dGA7XHJcbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkUmVtb3RlUGF0aChwcm9iZU5hbWUpO1xyXG4gICAgICBjb25zdCB1cGxvYWRVcmwgPSB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpO1xyXG4gICAgICBjb25zdCBwcm9iZUFycmF5QnVmZmVyID0gdGhpcy5lbmNvZGVVdGY4KGBzZWN1cmUtd2ViZGF2IHByb2JlICR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpfWApO1xuXHJcbiAgICAgIGNvbnN0IHB1dFJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcclxuICAgICAgICB1cmw6IHVwbG9hZFVybCxcclxuICAgICAgICBtZXRob2Q6IFwiUFVUXCIsXHJcbiAgICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcclxuICAgICAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwidGV4dC9wbGFpbjsgY2hhcnNldD11dGYtOFwiLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgYm9keTogcHJvYmVBcnJheUJ1ZmZlcixcclxuICAgICAgfSk7XHJcbiAgICAgIGlmIChwdXRSZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcHV0UmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgUFVUIGZhaWxlZCB3aXRoIHN0YXR1cyAke3B1dFJlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZ2V0UmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xyXG4gICAgICAgIHVybDogdXBsb2FkVXJsLFxyXG4gICAgICAgIG1ldGhvZDogXCJHRVRcIixcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0pO1xyXG4gICAgICBpZiAoZ2V0UmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IGdldFJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEdFVCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtnZXRSZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGRlbGV0ZVJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcclxuICAgICAgICB1cmw6IHVwbG9hZFVybCxcclxuICAgICAgICBtZXRob2Q6IFwiREVMRVRFXCIsXHJcbiAgICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcclxuICAgICAgICB9LFxyXG4gICAgICB9KTtcclxuICAgICAgaWYgKGRlbGV0ZVJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCBkZWxldGVSZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBERUxFVEUgZmFpbGVkIHdpdGggc3RhdHVzICR7ZGVsZXRlUmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBtZXNzYWdlID0gdGhpcy50KFxyXG4gICAgICAgIGBXZWJEQVYgXHU2RDRCXHU4QkQ1XHU5MDFBXHU4RkM3XHUzMDAyUFVUICR7cHV0UmVzcG9uc2Uuc3RhdHVzfVx1RkYwQ0dFVCAke2dldFJlc3BvbnNlLnN0YXR1c31cdUZGMENERUxFVEUgJHtkZWxldGVSZXNwb25zZS5zdGF0dXN9XHUzMDAyYCxcclxuICAgICAgICBgV2ViREFWIHRlc3QgcGFzc2VkLiBQVVQgJHtwdXRSZXNwb25zZS5zdGF0dXN9LCBHRVQgJHtnZXRSZXNwb25zZS5zdGF0dXN9LCBERUxFVEUgJHtkZWxldGVSZXNwb25zZS5zdGF0dXN9LmAsXHJcbiAgICAgICk7XHJcbiAgICAgIG5ldyBOb3RpY2UobWVzc2FnZSwgNjAwMCk7XHJcbiAgICAgIGlmIChzaG93TW9kYWwpIHtcclxuICAgICAgICBuZXcgUmVzdWx0TW9kYWwodGhpcy5hcHAsIHRoaXMudChcIldlYkRBViBcdThGREVcdTYzQTVcIiwgXCJXZWJEQVYgQ29ubmVjdGlvblwiKSwgbWVzc2FnZSkub3BlbigpO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihcIlNlY3VyZSBXZWJEQVYgdGVzdCBmYWlsZWRcIiwgZXJyb3IpO1xyXG4gICAgICBjb25zdCBtZXNzYWdlID0gdGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIldlYkRBViBcdTZENEJcdThCRDVcdTU5MzFcdThEMjVcIiwgXCJXZWJEQVYgdGVzdCBmYWlsZWRcIiksIGVycm9yKTtcclxuICAgICAgbmV3IE5vdGljZShtZXNzYWdlLCA4MDAwKTtcclxuICAgICAgaWYgKHNob3dNb2RhbCkge1xyXG4gICAgICAgIG5ldyBSZXN1bHRNb2RhbCh0aGlzLmFwcCwgdGhpcy50KFwiV2ViREFWIFx1OEZERVx1NjNBNVwiLCBcIldlYkRBViBDb25uZWN0aW9uXCIpLCBtZXNzYWdlKS5vcGVuKCk7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBkZXNjcmliZUVycm9yKHByZWZpeDogc3RyaW5nLCBlcnJvcjogdW5rbm93bikge1xyXG4gICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcclxuICAgIHJldHVybiBgJHtwcmVmaXh9OiAke21lc3NhZ2V9YDtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgcmVxdWVzdFVybChvcHRpb25zOiB7XG4gICAgdXJsOiBzdHJpbmc7XG4gICAgbWV0aG9kOiBzdHJpbmc7XG4gICAgaGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gICAgYm9keT86IEFycmF5QnVmZmVyO1xuICAgIGZvbGxvd1JlZGlyZWN0cz86IGJvb2xlYW47XG4gICAgcmVkaXJlY3RDb3VudD86IG51bWJlcjtcbiAgfSk6IFByb21pc2U8eyBzdGF0dXM6IG51bWJlcjsgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPjsgYXJyYXlCdWZmZXI6IEFycmF5QnVmZmVyIH0+IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG9ic2lkaWFuUmVxdWVzdFVybCh7XG4gICAgICB1cmw6IG9wdGlvbnMudXJsLFxuICAgICAgbWV0aG9kOiBvcHRpb25zLm1ldGhvZCxcbiAgICAgIGhlYWRlcnM6IG9wdGlvbnMuaGVhZGVycyxcbiAgICAgIGJvZHk6IG9wdGlvbnMuYm9keSxcbiAgICAgIHRocm93OiBmYWxzZSxcbiAgICB9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6IHJlc3BvbnNlLnN0YXR1cyxcbiAgICAgIGhlYWRlcnM6IHJlc3BvbnNlLmhlYWRlcnMsXG4gICAgICBhcnJheUJ1ZmZlcjogcmVzcG9uc2UuYXJyYXlCdWZmZXIsXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgZW5jb2RlVXRmOCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgY29uc3QgYnl0ZXMgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUodmFsdWUpO1xuICAgIHJldHVybiBieXRlcy5idWZmZXIuc2xpY2UoYnl0ZXMuYnl0ZU9mZnNldCwgYnl0ZXMuYnl0ZU9mZnNldCArIGJ5dGVzLmJ5dGVMZW5ndGgpIGFzIEFycmF5QnVmZmVyO1xuICB9XG5cbiAgcHJpdmF0ZSBkZWNvZGVVdGY4KGJ1ZmZlcjogQXJyYXlCdWZmZXIpIHtcbiAgICByZXR1cm4gbmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGJ1ZmZlcik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNvbXB1dGVTaGEyNTZIZXgoYnVmZmVyOiBBcnJheUJ1ZmZlcikge1xuICAgIGNvbnN0IGRpZ2VzdCA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZGlnZXN0KFwiU0hBLTI1NlwiLCBidWZmZXIpO1xuICAgIHJldHVybiBBcnJheS5mcm9tKG5ldyBVaW50OEFycmF5KGRpZ2VzdCkpXG4gICAgICAubWFwKCh2YWx1ZSkgPT4gdmFsdWUudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsIFwiMFwiKSlcbiAgICAgIC5qb2luKFwiXCIpO1xuICB9XG59XG5cclxuY2xhc3MgU2VjdXJlV2ViZGF2UmVuZGVyQ2hpbGQgZXh0ZW5kcyBNYXJrZG93blJlbmRlckNoaWxkIHtcbiAgb251bmxvYWQoKTogdm9pZCB7fVxufVxuXG50eXBlIFVwbG9hZFJld3JpdGUgPSB7XG4gIG9yaWdpbmFsOiBzdHJpbmc7XG4gIHJld3JpdHRlbjogc3RyaW5nO1xuICBzb3VyY2VGaWxlPzogVEZpbGU7XG59O1xuXHJcbmNsYXNzIFNlY3VyZVdlYmRhdlNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcclxuICBwbHVnaW46IFNlY3VyZVdlYmRhdkltYWdlc1BsdWdpbjtcclxuXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogU2VjdXJlV2ViZGF2SW1hZ2VzUGx1Z2luKSB7XHJcbiAgICBzdXBlcihhcHAsIHBsdWdpbik7XHJcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcclxuICB9XHJcblxyXG4gIGRpc3BsYXkoKTogdm9pZCB7XHJcbiAgICBjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xyXG4gICAgY29udGFpbmVyRWwuZW1wdHkoKTtcclxuXHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJTZWN1cmUgV2ViREFWIEltYWdlc1wiIH0pO1xuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwicFwiLCB7XG4gICAgICB0ZXh0OiB0aGlzLnBsdWdpbi50KFxuICAgICAgICBcIlx1OEZEOVx1NEUyQVx1NjNEMlx1NEVGNlx1NTNFQVx1NjI4QVx1NTZGRVx1NzI0N1x1NTI2NVx1NzlCQlx1NTIzMFx1NTM1NVx1NzJFQ1x1NzY4NFx1OEZEQ1x1N0FFRlx1NzZFRVx1NUY1NVx1RkYwQ1x1NUU3Nlx1NEZERFx1NUI1OFx1NEUzQSBzZWN1cmUtd2ViZGF2IFx1ODFFQVx1NUI5QVx1NEU0OVx1NEVFM1x1NzgwMVx1NTc1N1x1RkYxQlx1NTE3Nlx1NEVENlx1N0IxNFx1OEJCMFx1NTQ4Q1x1OTY0NFx1NEVGNlx1NjMwOVx1NTM5Rlx1OERFRlx1NUY4NFx1NTM5Rlx1NjgzN1x1NTQwQ1x1NkI2NVx1MzAwMlwiLFxuICAgICAgICBcIlRoaXMgcGx1Z2luIHNlcGFyYXRlcyBvbmx5IGltYWdlcyBpbnRvIGEgZGVkaWNhdGVkIHJlbW90ZSBmb2xkZXIgYW5kIHN0b3JlcyB0aGVtIGFzIHNlY3VyZS13ZWJkYXYgY3VzdG9tIGNvZGUgYmxvY2tzLiBOb3RlcyBhbmQgb3RoZXIgYXR0YWNobWVudHMgYXJlIHN5bmNlZCBhcy1pcyB3aXRoIHRoZWlyIG9yaWdpbmFsIHBhdGhzLlwiLFxuICAgICAgKSxcbiAgICB9KTtcblxyXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMucGx1Z2luLnQoXCJcdTc1NENcdTk3NjJcdThCRURcdThBMDBcIiwgXCJJbnRlcmZhY2UgbGFuZ3VhZ2VcIikgfSk7XG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4QkVEXHU4QTAwXCIsIFwiTGFuZ3VhZ2VcIikpXG4gICAgICAuc2V0RGVzYyh0aGlzLnBsdWdpbi50KFwiXHU4QkJFXHU3RjZFXHU5ODc1XHU2NTJGXHU2MzAxXHU4MUVBXHU1MkE4XHUzMDAxXHU0RTJEXHU2NTg3XHUzMDAxXHU4MkYxXHU2NTg3XHU1MjA3XHU2MzYyXHUzMDAyXCIsIFwiU3dpdGNoIHRoZSBzZXR0aW5ncyBVSSBiZXR3ZWVuIGF1dG8sIENoaW5lc2UsIGFuZCBFbmdsaXNoLlwiKSlcclxuICAgICAgLmFkZERyb3Bkb3duKChkcm9wZG93bikgPT5cclxuICAgICAgICBkcm9wZG93blxyXG4gICAgICAgICAgLmFkZE9wdGlvbihcImF1dG9cIiwgdGhpcy5wbHVnaW4udChcIlx1ODFFQVx1NTJBOFwiLCBcIkF1dG9cIikpXG4gICAgICAgICAgLmFkZE9wdGlvbihcInpoXCIsIFwiXHU0RTJEXHU2NTg3XCIpXG4gICAgICAgICAgLmFkZE9wdGlvbihcImVuXCIsIFwiRW5nbGlzaFwiKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5sYW5ndWFnZSlcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmxhbmd1YWdlID0gdmFsdWUgYXMgXCJhdXRvXCIgfCBcInpoXCIgfCBcImVuXCI7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgIH0pLFxuICAgICAgKTtcclxuXHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy5wbHVnaW4udChcIlx1OEZERVx1NjNBNVx1OEJCRVx1N0Y2RVwiLCBcIkNvbm5lY3Rpb25cIikgfSk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiV2ViREFWIFx1NTdGQVx1Nzg0MFx1NTczMFx1NTc0MFwiLCBcIldlYkRBViBiYXNlIFVSTFwiKSlcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdTY3MERcdTUyQTFcdTU2NjhcdTU3RkFcdTc4NDBcdTU3MzBcdTU3NDBcdUZGMENcdTRGOEJcdTU5ODJcdUZGMUFodHRwOi8veW91ci13ZWJkYXYtaG9zdDpwb3J0XCIsIFwiQmFzZSBzZXJ2ZXIgVVJMLiBFeGFtcGxlOiBodHRwOi8veW91ci13ZWJkYXYtaG9zdDpwb3J0XCIpKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJodHRwOi8veW91ci13ZWJkYXYtaG9zdDpwb3J0XCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLndlYmRhdlVybClcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy53ZWJkYXZVcmwgPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KSxcbiAgICAgICk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdThEMjZcdTUzRjdcIiwgXCJVc2VybmFtZVwiKSlcclxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XHJcbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VybmFtZSkub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VybmFtZSA9IHZhbHVlLnRyaW0oKTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgIH0pLFxyXG4gICAgICApO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU1QkM2XHU3ODAxXCIsIFwiUGFzc3dvcmRcIikpXHJcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdTlFRDhcdThCQTRcdTk2OTBcdTg1Q0ZcdUZGMENcdTUzRUZcdTcwQjlcdTUxRkJcdTUzRjNcdTRGQTdcdTYzMDlcdTk0QUVcdTY2M0VcdTc5M0FcdTYyMTZcdTk2OTBcdTg1Q0ZcdTMwMDJcIiwgXCJIaWRkZW4gYnkgZGVmYXVsdC4gVXNlIHRoZSBidXR0b24gb24gdGhlIHJpZ2h0IHRvIHNob3cgb3IgaGlkZSBpdC5cIikpXHJcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PiB7XHJcbiAgICAgICAgdGV4dC5pbnB1dEVsLnR5cGUgPSBcInBhc3N3b3JkXCI7XHJcbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXNzd29yZCkub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXNzd29yZCA9IHZhbHVlO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5hZGRFeHRyYUJ1dHRvbigoYnV0dG9uKSA9PiB7XHJcbiAgICAgICAgbGV0IHZpc2libGUgPSBmYWxzZTtcclxuICAgICAgICBidXR0b24uc2V0SWNvbihcImV5ZVwiKTtcclxuICAgICAgICBidXR0b24uc2V0VG9vbHRpcCh0aGlzLnBsdWdpbi50KFwiXHU2NjNFXHU3OTNBXHU1QkM2XHU3ODAxXCIsIFwiU2hvdyBwYXNzd29yZFwiKSk7XHJcbiAgICAgICAgYnV0dG9uLm9uQ2xpY2soKCkgPT4ge1xyXG4gICAgICAgICAgY29uc3QgaW5wdXQgPSBidXR0b24uZXh0cmFTZXR0aW5nc0VsLnBhcmVudEVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3IoXCJpbnB1dFwiKTtcclxuICAgICAgICAgIGlmICghKGlucHV0IGluc3RhbmNlb2YgSFRNTElucHV0RWxlbWVudCkpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIHZpc2libGUgPSAhdmlzaWJsZTtcclxuICAgICAgICAgIGlucHV0LnR5cGUgPSB2aXNpYmxlID8gXCJ0ZXh0XCIgOiBcInBhc3N3b3JkXCI7XHJcbiAgICAgICAgICBidXR0b24uc2V0SWNvbih2aXNpYmxlID8gXCJleWUtb2ZmXCIgOiBcImV5ZVwiKTtcclxuICAgICAgICAgIGJ1dHRvbi5zZXRUb29sdGlwKHRoaXMucGx1Z2luLnQodmlzaWJsZSA/IFwiXHU5NjkwXHU4NUNGXHU1QkM2XHU3ODAxXCIgOiBcIlx1NjYzRVx1NzkzQVx1NUJDNlx1NzgwMVwiLCB2aXNpYmxlID8gXCJIaWRlIHBhc3N3b3JkXCIgOiBcIlNob3cgcGFzc3dvcmRcIikpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTU2RkVcdTcyNDdcdThGRENcdTdBMEJcdTc2RUVcdTVGNTVcIiwgXCJJbWFnZSByZW1vdGUgZm9sZGVyXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTRFMTNcdTk1RThcdTc1MjhcdTRFOEVcdTVCNThcdTY1M0VcdThGRENcdTdBMEJcdTU2RkVcdTcyNDdcdTc2ODQgV2ViREFWIFx1NzZFRVx1NUY1NVx1RkYwQ1x1NEY4Qlx1NTk4Mlx1RkYxQS9yZW1vdGUtaW1hZ2VzL1x1MzAwMlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NjIxMFx1NTI5Rlx1NTQwRVx1NEYxQVx1N0FDQlx1NTM3M1x1NTIyMFx1OTY2NFx1NjcyQ1x1NTczMFx1NTZGRVx1NzI0N1x1NjU4N1x1NEVGNlx1MzAwMlwiLFxuICAgICAgICAgIFwiRGVkaWNhdGVkIFdlYkRBViBmb2xkZXIgZm9yIHJlbW90ZSBpbWFnZXMsIGZvciBleGFtcGxlOiAvcmVtb3RlLWltYWdlcy8uIExvY2FsIGltYWdlIGZpbGVzIGFyZSBkZWxldGVkIGltbWVkaWF0ZWx5IGFmdGVyIHVwbG9hZCBzdWNjZWVkcy5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnJlbW90ZUZvbGRlcikub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmVtb3RlRm9sZGVyID0gbm9ybWFsaXplUGF0aCh2YWx1ZS50cmltKCkgfHwgXCIvcmVtb3RlLWltYWdlcy9cIik7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pLFxuICAgICAgKTtcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTZENEJcdThCRDVcdThGREVcdTYzQTVcIiwgXCJUZXN0IGNvbm5lY3Rpb25cIikpXHJcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdTRGN0ZcdTc1MjhcdTRFMzRcdTY1RjZcdTYzQTJcdTk0ODhcdTY1ODdcdTRFRjZcdTlBOENcdThCQzEgUFVUXHUzMDAxR0VUXHUzMDAxREVMRVRFIFx1NjYyRlx1NTQyNlx1NkI2M1x1NUUzOFx1MzAwMlwiLCBcIlZlcmlmeSBQVVQsIEdFVCwgYW5kIERFTEVURSB1c2luZyBhIHRlbXBvcmFyeSBwcm9iZSBmaWxlLlwiKSlcclxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxyXG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KHRoaXMucGx1Z2luLnQoXCJcdTVGMDBcdTU5Q0JcdTZENEJcdThCRDVcIiwgXCJSdW4gdGVzdFwiKSkub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XHJcbiAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5ydW5Db25uZWN0aW9uVGVzdCh0cnVlKTtcclxuICAgICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZChmYWxzZSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSksXHJcbiAgICAgICk7XHJcblxyXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMucGx1Z2luLnQoXCJcdTU0MENcdTZCNjVcdThCQkVcdTdGNkVcIiwgXCJTeW5jXCIpIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4RkRDXHU3QTBCXHU3QjE0XHU4QkIwXHU3NkVFXHU1RjU1XCIsIFwiUmVtb3RlIG5vdGVzIGZvbGRlclwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU3NTI4XHU0RThFXHU1QjU4XHU2NTNFXHU3QjE0XHU4QkIwXHU1NDhDXHU1MTc2XHU0RUQ2XHU5NzVFXHU1NkZFXHU3MjQ3XHU5NjQ0XHU0RUY2XHU1MzlGXHU2ODM3XHU1NDBDXHU2QjY1XHU1MjZGXHU2NzJDXHU3Njg0XHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHVGRjBDXHU0RjhCXHU1OTgyXHVGRjFBL3ZhdWx0LXN5bmMvXHUzMDAyXHU2M0QyXHU0RUY2XHU0RjFBXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU2NTc0XHU0RTJBIHZhdWx0XHVGRjBDXHU1RTc2XHU4REYzXHU4RkM3IC5vYnNpZGlhblx1MzAwMVx1NjNEMlx1NEVGNlx1NzZFRVx1NUY1NVx1NTQ4Q1x1NTZGRVx1NzI0N1x1NjU4N1x1NEVGNlx1MzAwMlwiLFxuICAgICAgICAgIFwiUmVtb3RlIGZvbGRlciB1c2VkIGZvciBub3RlcyBhbmQgb3RoZXIgbm9uLWltYWdlIGF0dGFjaG1lbnRzIHN5bmNlZCBhcy1pcywgZm9yIGV4YW1wbGU6IC92YXVsdC1zeW5jLy4gVGhlIHBsdWdpbiBzeW5jcyB0aGUgd2hvbGUgdmF1bHQgYW5kIGF1dG9tYXRpY2FsbHkgc2tpcHMgLm9ic2lkaWFuLCB0aGUgcGx1Z2luIGRpcmVjdG9yeSwgYW5kIGltYWdlIGZpbGVzLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIgPSBub3JtYWxpemVQYXRoKHZhbHVlLnRyaW0oKSB8fCBcIi92YXVsdC1zeW5jL1wiKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU5ODkxXHU3Mzg3XCIsIFwiQXV0byBzeW5jIGZyZXF1ZW5jeVwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU0RUU1XHU1MjA2XHU5NDlGXHU0RTNBXHU1MzU1XHU0RjREXHU4QkJFXHU3RjZFXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU2NUY2XHU5NUY0XHUzMDAyXHU1ODZCIDAgXHU4ODY4XHU3OTNBXHU1MTczXHU5NUVEXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHUzMDAyXHU4RkQ5XHU5MUNDXHU3Njg0XHU1NDBDXHU2QjY1XHU2NjJGXHUyMDFDXHU1QkY5XHU4RDI2XHU1NDBDXHU2QjY1XHUyMDFEXHVGRjFBXHU0RjFBXHU2OEMwXHU2N0U1XHU2NzJDXHU1NzMwXHU0RTBFXHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHU1REVFXHU1RjAyXHVGRjBDXHU4ODY1XHU0RjIwXHU2NUIwXHU1ODlFXHU1NDhDXHU1M0Q4XHU2NkY0XHU2NTg3XHU0RUY2XHVGRjBDXHU1RTc2XHU1MjIwXHU5NjY0XHU4RkRDXHU3QUVGXHU1OTFBXHU0RjU5XHU1MTg1XHU1QkI5XHUzMDAyXCIsXG4gICAgICAgICAgXCJTZXQgdGhlIGF1dG9tYXRpYyBzeW5jIGludGVydmFsIGluIG1pbnV0ZXMuIFVzZSAwIHRvIHR1cm4gaXQgb2ZmLiBUaGlzIGlzIGEgcmVjb25jaWxpYXRpb24gc3luYzogaXQgY2hlY2tzIGxvY2FsIGFuZCByZW1vdGUgZGlmZmVyZW5jZXMsIHVwbG9hZHMgbmV3IG9yIGNoYW5nZWQgZmlsZXMsIGFuZCByZW1vdmVzIGV4dHJhIHJlbW90ZSBjb250ZW50LlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCIwXCIpXG4gICAgICAgICAgLnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvU3luY0ludGVydmFsTWludXRlcykpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gTnVtYmVyLnBhcnNlSW50KHZhbHVlLCAxMCk7XG4gICAgICAgICAgICBpZiAoIU51bWJlci5pc05hTihwYXJzZWQpKSB7XG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzID0gTWF0aC5tYXgoMCwgcGFyc2VkKTtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU3QjE0XHU4QkIwXHU2NzJDXHU1NzMwXHU0RkREXHU3NTU5XHU2QTIxXHU1RjBGXCIsIFwiTm90ZSBsb2NhbCByZXRlbnRpb24gbW9kZVwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU1QjhDXHU2NTc0XHU2NzJDXHU1NzMwXHVGRjFBXHU3QjE0XHU4QkIwXHU1OUNCXHU3RUM4XHU0RkREXHU3NTU5XHU1NzI4XHU2NzJDXHU1NzMwXHUzMDAyXHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXHVGRjFBXHU5NTdGXHU2NzFGXHU2NzJBXHU4QkJGXHU5NUVFXHU3Njg0IE1hcmtkb3duIFx1N0IxNFx1OEJCMFx1NEYxQVx1ODhBQlx1NjZGRlx1NjM2Mlx1NEUzQVx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1NjU4N1x1NEVGNlx1RkYwQ1x1NjI1M1x1NUYwMFx1NjVGNlx1NTE4RFx1NEVDRVx1OEZEQ1x1N0FFRlx1NjA2Mlx1NTkwRFx1MzAwMlwiLFxuICAgICAgICAgIFwiRnVsbCBsb2NhbDogbm90ZXMgYWx3YXlzIHN0YXkgbG9jYWwuIExhenkgbm90ZXM6IHN0YWxlIE1hcmtkb3duIG5vdGVzIGFyZSByZXBsYWNlZCB3aXRoIGxvY2FsIHBsYWNlaG9sZGVyIGZpbGVzIGFuZCByZXN0b3JlZCBmcm9tIHJlbW90ZSB3aGVuIG9wZW5lZC5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGREcm9wZG93bigoZHJvcGRvd24pID0+XG4gICAgICAgIGRyb3Bkb3duXG4gICAgICAgICAgLmFkZE9wdGlvbihcImZ1bGwtbG9jYWxcIiwgdGhpcy5wbHVnaW4udChcIlx1NUI4Q1x1NjU3NFx1NjcyQ1x1NTczMFwiLCBcIkZ1bGwgbG9jYWxcIikpXG4gICAgICAgICAgLmFkZE9wdGlvbihcImxhenktbm90ZXNcIiwgdGhpcy5wbHVnaW4udChcIlx1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFwiLCBcIkxhenkgbm90ZXNcIikpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVTdG9yYWdlTW9kZSlcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlU3RvcmFnZU1vZGUgPSB2YWx1ZSBhcyBcImZ1bGwtbG9jYWxcIiB8IFwibGF6eS1ub3Rlc1wiO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU3QjE0XHU4QkIwXHU2NzJDXHU1NzMwXHU1NkRFXHU2NTM2XHU1OTI5XHU2NTcwXCIsIFwiTm90ZSBldmljdGlvbiBkYXlzXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTRFQzVcdTU3MjhcdTIwMUNcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTdCMTRcdThCQjBcdTIwMURcdTZBMjFcdTVGMEZcdTRFMEJcdTc1MUZcdTY1NDhcdTMwMDJcdThEODVcdThGQzdcdThGRDlcdTRFMkFcdTU5MjlcdTY1NzBcdTY3MkFcdTYyNTNcdTVGMDBcdTc2ODQgTWFya2Rvd24gXHU3QjE0XHU4QkIwXHVGRjBDXHU0RjFBXHU1NzI4XHU1NDBDXHU2QjY1XHU1NDBFXHU4OEFCXHU2NkZGXHU2MzYyXHU0RTNBXHU2NzJDXHU1NzMwXHU1MzYwXHU0RjREXHU2NTg3XHU0RUY2XHUzMDAyXCIsXG4gICAgICAgICAgXCJVc2VkIG9ubHkgaW4gbGF6eSBub3RlIG1vZGUuIE1hcmtkb3duIG5vdGVzIG5vdCBvcGVuZWQgd2l0aGluIHRoaXMgbnVtYmVyIG9mIGRheXMgYXJlIHJlcGxhY2VkIHdpdGggbG9jYWwgcGxhY2Vob2xkZXIgZmlsZXMgYWZ0ZXIgc3luYy5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiMzBcIilcbiAgICAgICAgICAuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVFdmljdEFmdGVyRGF5cykpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gTnVtYmVyLnBhcnNlSW50KHZhbHVlLCAxMCk7XG4gICAgICAgICAgICBpZiAoIU51bWJlci5pc05hTihwYXJzZWQpKSB7XG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVFdmljdEFmdGVyRGF5cyA9IE1hdGgubWF4KDEsIHBhcnNlZCk7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NTQwQ1x1NkI2NVx1NzJCNlx1NjAwMVwiLCBcIlN5bmMgc3RhdHVzXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgYCR7dGhpcy5wbHVnaW4uZm9ybWF0TGFzdFN5bmNMYWJlbCgpfVxcbiR7dGhpcy5wbHVnaW4uZm9ybWF0U3luY1N0YXR1c0xhYmVsKCl9XFxuJHt0aGlzLnBsdWdpbi50KFwiXHU4QkY0XHU2NjBFXHVGRjFBXHU3QUNCXHU1MzczXHU1NDBDXHU2QjY1XHU0RjFBXHU2MjY3XHU4ODRDXHU2NzJDXHU1NzMwXHU0RTBFXHU4RkRDXHU3QUVGXHU3Njg0XHU1QkY5XHU4RDI2XHVGRjBDXHU1NDBDXHU2QjY1XHU3QjE0XHU4QkIwXHU0RTBFXHU5NzVFXHU1NkZFXHU3MjQ3XHU5NjQ0XHU0RUY2XHVGRjBDXHU1RTc2XHU2RTA1XHU3NDA2XHU4RkRDXHU3QUVGXHU1MTk3XHU0RjU5XHU2NTg3XHU0RUY2XHUzMDAyXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU0RUNEXHU3NTMxXHU3MkVDXHU3QUNCXHU5NjFGXHU1MjE3XHU1OTA0XHU3NDA2XHUzMDAyXCIsIFwiTm90ZTogU3luYyBub3cgcmVjb25jaWxlcyBsb2NhbCBhbmQgcmVtb3RlIGNvbnRlbnQsIHN5bmNzIG5vdGVzIGFuZCBub24taW1hZ2UgYXR0YWNobWVudHMsIGFuZCBjbGVhbnMgZXh0cmEgcmVtb3RlIGZpbGVzLiBJbWFnZSB1cGxvYWRzIGNvbnRpbnVlIHRvIGJlIGhhbmRsZWQgYnkgdGhlIHNlcGFyYXRlIHF1ZXVlLlwiKX1gLFxuICAgICAgICAgIGAke3RoaXMucGx1Z2luLmZvcm1hdExhc3RTeW5jTGFiZWwoKX1cXG4ke3RoaXMucGx1Z2luLmZvcm1hdFN5bmNTdGF0dXNMYWJlbCgpfVxcbiR7dGhpcy5wbHVnaW4udChcIlx1OEJGNFx1NjYwRVx1RkYxQVx1N0FDQlx1NTM3M1x1NTQwQ1x1NkI2NVx1NEYxQVx1NjI2N1x1ODg0Q1x1NjcyQ1x1NTczMFx1NEUwRVx1OEZEQ1x1N0FFRlx1NzY4NFx1NUJGOVx1OEQyNlx1RkYwQ1x1NTQwQ1x1NkI2NVx1N0IxNFx1OEJCMFx1NEUwRVx1OTc1RVx1NTZGRVx1NzI0N1x1OTY0NFx1NEVGNlx1RkYwQ1x1NUU3Nlx1NkUwNVx1NzQwNlx1OEZEQ1x1N0FFRlx1NTE5N1x1NEY1OVx1NjU4N1x1NEVGNlx1MzAwMlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NEVDRFx1NzUzMVx1NzJFQ1x1N0FDQlx1OTYxRlx1NTIxN1x1NTkwNFx1NzQwNlx1MzAwMlwiLCBcIk5vdGU6IFN5bmMgbm93IHJlY29uY2lsZXMgbG9jYWwgYW5kIHJlbW90ZSBjb250ZW50LCBzeW5jcyBub3RlcyBhbmQgbm9uLWltYWdlIGF0dGFjaG1lbnRzLCBhbmQgY2xlYW5zIGV4dHJhIHJlbW90ZSBmaWxlcy4gSW1hZ2UgdXBsb2FkcyBjb250aW51ZSB0byBiZSBoYW5kbGVkIGJ5IHRoZSBzZXBhcmF0ZSBxdWV1ZS5cIil9YCxcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodGhpcy5wbHVnaW4udChcIlx1N0FDQlx1NTM3M1x1NTQwQ1x1NkI2NVwiLCBcIlN5bmMgbm93XCIpKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50KHRydWUpO1xuICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZChmYWxzZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy5wbHVnaW4udChcIlx1NEUwMFx1NkIyMVx1NjAyN1x1NURFNVx1NTE3N1wiLCBcIk9uZS10aW1lIHRvb2xzXCIpIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4RkMxXHU3OUZCXHU2NTc0XHU1RTkzXHU1MzlGXHU3NTFGXHU1NkZFXHU3MjQ3XHU1RjE1XHU3NTI4XCIsIFwiTWlncmF0ZSBuYXRpdmUgaW1hZ2UgZW1iZWRzIGluIHZhdWx0XCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTYyNkJcdTYzQ0ZcdTY1NzRcdTVFOTNcdTYyNDBcdTY3MDkgTWFya2Rvd24gXHU3QjE0XHU4QkIwXHVGRjBDXHU2MjhBIE9ic2lkaWFuIFx1NTM5Rlx1NzUxRlx1NjcyQ1x1NTczMFx1NTZGRVx1NzI0N1x1NUYxNVx1NzUyOFx1RkYwOFx1NTk4MiAhW10oKSBcdTU0OEMgIVtbLi4uXV1cdUZGMDlcdTRFMEFcdTRGMjBcdTUyMzBcdThGRENcdTdBRUZcdTU2RkVcdTcyNDdcdTc2RUVcdTVGNTVcdUZGMENcdTVFNzZcdTY1MzlcdTUxOTlcdTRFM0Egc2VjdXJlLXdlYmRhdiBcdTRFRTNcdTc4MDFcdTU3NTdcdTMwMDJcdTY1RTdcdTcyNDggc3BhbiBcdTU0OENcdTY1RTlcdTY3MUYgd2ViZGF2LXNlY3VyZSBcdTk0RkVcdTYzQTVcdTRFNUZcdTRGMUFcdTRFMDBcdTVFNzZcdTY1MzZcdTY1NUJcdTUyMzBcdTY1QjBcdTY4M0NcdTVGMEZcdTMwMDJcIixcbiAgICAgICAgICBcIlNjYW4gYWxsIE1hcmtkb3duIG5vdGVzIGluIHRoZSB2YXVsdCwgdXBsb2FkIG5hdGl2ZSBsb2NhbCBpbWFnZSBlbWJlZHMgKHN1Y2ggYXMgIVtdKCkgYW5kICFbWy4uLl1dKSB0byB0aGUgcmVtb3RlIGltYWdlIGZvbGRlciwgYW5kIHJld3JpdGUgdGhlbSBhcyBzZWN1cmUtd2ViZGF2IGNvZGUgYmxvY2tzLiBMZWdhY3kgc3BhbiB0YWdzIGFuZCBlYXJseSB3ZWJkYXYtc2VjdXJlIGxpbmtzIGFyZSBhbHNvIG5vcm1hbGl6ZWQgdG8gdGhlIG5ldyBmb3JtYXQuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KHRoaXMucGx1Z2luLnQoXCJcdTVGMDBcdTU5Q0JcdThGQzFcdTc5RkJcIiwgXCJSdW4gbWlncmF0aW9uXCIpKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLm1pZ3JhdGVBbGxMZWdhY3lTZWN1cmVJbWFnZXMoKTtcbiAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKGZhbHNlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgfVxufVxuXHJcbmNsYXNzIFJlc3VsdE1vZGFsIGV4dGVuZHMgTW9kYWwge1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgdGl0bGVUZXh0OiBzdHJpbmc7XHJcbiAgcHJpdmF0ZSByZWFkb25seSBib2R5VGV4dDogc3RyaW5nO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgdGl0bGVUZXh0OiBzdHJpbmcsIGJvZHlUZXh0OiBzdHJpbmcpIHtcclxuICAgIHN1cGVyKGFwcCk7XHJcbiAgICB0aGlzLnRpdGxlVGV4dCA9IHRpdGxlVGV4dDtcclxuICAgIHRoaXMuYm9keVRleHQgPSBib2R5VGV4dDtcclxuICB9XHJcblxyXG4gIG9uT3BlbigpOiB2b2lkIHtcclxuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgY29udGVudEVsLmVtcHR5KCk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMudGl0bGVUZXh0IH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IHRoaXMuYm9keVRleHQgfSk7XHJcbiAgfVxyXG5cclxuICBvbkNsb3NlKCk6IHZvaWQge1xyXG4gICAgdGhpcy5jb250ZW50RWwuZW1wdHkoKTtcclxuICB9XHJcbn1cclxuXHJcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFDLHNCQWdCTTtBQTZDUCxJQUFNLG1CQUF5QztBQUFBLEVBQzdDLFdBQVc7QUFBQSxFQUNYLFVBQVU7QUFBQSxFQUNWLFVBQVU7QUFBQSxFQUNWLGNBQWM7QUFBQSxFQUNkLHVCQUF1QjtBQUFBLEVBQ3ZCLGdCQUFnQjtBQUFBLEVBQ2hCLHdCQUF3QjtBQUFBLEVBQ3hCLFVBQVU7QUFBQSxFQUNWLGlCQUFpQjtBQUFBLEVBQ2pCLG9CQUFvQjtBQUFBLEVBQ3BCLHlCQUF5QjtBQUFBLEVBQ3pCLGtCQUFrQjtBQUFBLEVBQ2xCLG1CQUFtQjtBQUFBLEVBQ25CLDhCQUE4QjtBQUFBLEVBQzlCLGdCQUFnQjtBQUFBLEVBQ2hCLHFCQUFxQjtBQUFBLEVBQ3JCLG1CQUFtQjtBQUFBLEVBQ25CLGFBQWE7QUFDZjtBQUVBLElBQU0sa0JBQWtCO0FBQ3hCLElBQU0sb0JBQW9CO0FBQzFCLElBQU0sbUJBQW1CO0FBRXpCLElBQXFC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
