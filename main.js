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
    this.pendingTaskPromises = /* @__PURE__ */ new Map();
    this.priorityNoteSyncTimeouts = /* @__PURE__ */ new Map();
    this.priorityNoteSyncsInFlight = /* @__PURE__ */ new Set();
    this.lastVaultSyncAt = 0;
    this.lastVaultSyncStatus = "";
    this.syncInProgress = false;
    this.autoSyncTickInProgress = false;
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
      for (const timeoutId of this.priorityNoteSyncTimeouts.values()) {
        window.clearTimeout(timeoutId);
      }
      this.priorityNoteSyncTimeouts.clear();
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
    for (const timeoutId of this.priorityNoteSyncTimeouts.values()) {
      window.clearTimeout(timeoutId);
    }
    this.priorityNoteSyncTimeouts.clear();
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
        void this.runAutoSyncTick();
      }, intervalMs)
    );
  }
  async runAutoSyncTick() {
    if (this.autoSyncTickInProgress) {
      return;
    }
    this.autoSyncTickInProgress = true;
    try {
      await this.syncConfiguredVaultContent(false);
    } finally {
      this.autoSyncTickInProgress = false;
    }
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
    const added = [...nextRefs].filter((value) => !previousRefs.has(value));
    const removed = [...previousRefs].filter((value) => !nextRefs.has(value));
    if (added.length > 0) {
      this.schedulePriorityNoteSync(file.path, "image-add");
    }
    if (removed.length > 0) {
      this.schedulePriorityNoteSync(file.path, "image-remove");
    }
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
  schedulePriorityNoteSync(notePath, reason) {
    const existing = this.priorityNoteSyncTimeouts.get(notePath);
    if (existing) {
      window.clearTimeout(existing);
    }
    const delayMs = reason === "image-add" ? 1200 : 600;
    const timeoutId = window.setTimeout(() => {
      this.priorityNoteSyncTimeouts.delete(notePath);
      void this.flushPriorityNoteSync(notePath, reason);
    }, delayMs);
    this.priorityNoteSyncTimeouts.set(notePath, timeoutId);
  }
  async flushPriorityNoteSync(notePath, reason) {
    if (this.priorityNoteSyncsInFlight.has(notePath)) {
      return;
    }
    if (this.hasPendingImageWorkForNote(notePath) || this.syncInProgress || this.autoSyncTickInProgress) {
      this.schedulePriorityNoteSync(notePath, reason);
      return;
    }
    const file = this.getVaultFileByPath(notePath);
    if (!(file instanceof import_obsidian.TFile) || file.extension !== "md" || this.shouldSkipContentSyncPath(file.path)) {
      return;
    }
    this.priorityNoteSyncsInFlight.add(notePath);
    try {
      this.ensureConfigured();
      const content = await this.readMarkdownContentPreferEditor(file);
      if (this.parseNoteStub(content)) {
        return;
      }
      const remotePath = this.buildVaultSyncRemotePath(file.path);
      const uploadedRemote = await this.uploadContentFileToRemote(file, remotePath, content);
      this.syncIndex.set(file.path, {
        localSignature: await this.buildCurrentLocalSignature(file, content),
        remoteSignature: uploadedRemote.signature,
        remotePath
      });
      await this.deleteDeletionTombstone(file.path);
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.t(
        reason === "image-add" ? `\u5DF2\u4F18\u5148\u540C\u6B65\u56FE\u7247\u65B0\u589E\u540E\u7684\u7B14\u8BB0\uFF1A${file.basename}` : `\u5DF2\u4F18\u5148\u540C\u6B65\u56FE\u7247\u5220\u9664\u540E\u7684\u7B14\u8BB0\uFF1A${file.basename}`,
        reason === "image-add" ? `Prioritized note sync finished after image add: ${file.basename}` : `Prioritized note sync finished after image removal: ${file.basename}`
      );
      await this.savePluginState();
    } catch (error) {
      console.error("Priority note sync failed", error);
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.describeError(
        this.t(
          reason === "image-add" ? "\u56FE\u7247\u65B0\u589E\u540E\u7684\u7B14\u8BB0\u4F18\u5148\u540C\u6B65\u5931\u8D25" : "\u56FE\u7247\u5220\u9664\u540E\u7684\u7B14\u8BB0\u4F18\u5148\u540C\u6B65\u5931\u8D25",
          reason === "image-add" ? "Priority note sync after image add failed" : "Priority note sync after image removal failed"
        ),
        error
      );
      await this.savePluginState();
      this.schedulePriorityNoteSync(notePath, reason);
    } finally {
      this.priorityNoteSyncsInFlight.delete(notePath);
    }
  }
  hasPendingImageWorkForNote(notePath) {
    if (this.queue.some((task) => task.notePath === notePath)) {
      return true;
    }
    for (const taskId of this.processingTaskIds) {
      const task = this.queue.find((item) => item.id === taskId);
      if (task?.notePath === notePath) {
        return true;
      }
    }
    for (const [taskId] of this.pendingTaskPromises) {
      const task = this.queue.find((item) => item.id === taskId);
      if (task?.notePath === notePath) {
        return true;
      }
    }
    return false;
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
      const uploadsReady = await this.preparePendingUploadsForSync(showNotice);
      if (!uploadsReady) {
        return;
      }
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
        const previous = this.syncIndex.get(file.path);
        const markdownContent = file.extension === "md" ? await this.readMarkdownContentPreferEditor(file) : null;
        const localSignature = await this.buildCurrentLocalSignature(file, markdownContent ?? void 0);
        if (file.extension === "md") {
          const stub = this.parseNoteStub(markdownContent ?? "");
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
          const uploadedRemote2 = await this.uploadContentFileToRemote(file, remotePath, markdownContent ?? void 0);
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
              localSignature: refreshed ? await this.buildCurrentLocalSignature(refreshed) : remoteSignature,
              remoteSignature,
              remotePath
            });
            downloadedOrUpdated += 1;
            continue;
          }
          const uploadedRemote2 = await this.uploadContentFileToRemote(file, remotePath, markdownContent ?? void 0);
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
            localSignature: refreshed ? await this.buildCurrentLocalSignature(refreshed) : remoteSignature,
            remoteSignature,
            remotePath
          });
          downloadedOrUpdated += 1;
          continue;
        }
        if (localChanged && !remoteChanged) {
          const uploadedRemote2 = await this.uploadContentFileToRemote(file, remotePath, markdownContent ?? void 0);
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
            localSignature: refreshed ? await this.buildCurrentLocalSignature(refreshed) : remoteSignature,
            remoteSignature,
            remotePath
          });
          downloadedOrUpdated += 1;
          continue;
        }
        const uploadedRemote = await this.uploadContentFileToRemote(file, remotePath, markdownContent ?? void 0);
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
  async uploadContentFileToRemote(file, remotePath, markdownContent) {
    let binary;
    if (file.extension === "md") {
      const content = markdownContent ?? await this.readMarkdownContentPreferEditor(file);
      if (this.parseNoteStub(content)) {
        throw new Error(
          this.t(
            "\u62D2\u7EDD\u628A\u6309\u9700\u52A0\u8F7D\u5360\u4F4D\u7B14\u8BB0\u4E0A\u4F20\u4E3A\u8FDC\u7AEF\u6B63\u6587\u3002",
            "Refusing to upload a lazy-note placeholder as remote note content."
          )
        );
      }
      binary = this.encodeUtf8(content);
    } else {
      binary = await this.app.vault.readBinary(file);
    }
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
  getOpenMarkdownContent(notePath) {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const view = leaf.view;
      if (!(view instanceof import_obsidian.MarkdownView)) {
        continue;
      }
      if (!view.file || view.file.path !== notePath) {
        continue;
      }
      return view.editor.getValue();
    }
    return null;
  }
  async readMarkdownContentPreferEditor(file) {
    const liveContent = this.getOpenMarkdownContent(file.path);
    if (liveContent !== null) {
      return liveContent;
    }
    return await this.app.vault.read(file);
  }
  async buildCurrentLocalSignature(file, markdownContent) {
    if (file.extension !== "md") {
      return this.buildSyncSignature(file);
    }
    const content = markdownContent ?? await this.readMarkdownContentPreferEditor(file);
    const digest = (await this.computeSha256Hex(this.encodeUtf8(content))).slice(0, 16);
    return `md:${content.length}:${digest}`;
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
    const running = [];
    for (const task of [...this.queue]) {
      running.push(this.startPendingTask(task));
    }
    if (running.length > 0) {
      await Promise.allSettled(running);
    }
  }
  startPendingTask(task) {
    const existing = this.pendingTaskPromises.get(task.id);
    if (existing) {
      return existing;
    }
    const promise = this.processTask(task).finally(() => {
      this.pendingTaskPromises.delete(task.id);
    });
    this.pendingTaskPromises.set(task.id, promise);
    return promise;
  }
  async preparePendingUploadsForSync(showNotice) {
    await this.processPendingTasks();
    if (this.queue.length > 0 || this.processingTaskIds.size > 0 || this.pendingTaskPromises.size > 0) {
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.t(
        "\u68C0\u6D4B\u5230\u56FE\u7247\u4E0A\u4F20\u4ECD\u5728\u8FDB\u884C\u6216\u7B49\u5F85\u91CD\u8BD5\uFF0C\u5DF2\u6682\u7F13\u672C\u6B21\u7B14\u8BB0\u540C\u6B65\uFF0C\u907F\u514D\u65E7\u7248\u7B14\u8BB0\u8986\u76D6\u65B0\u56FE\u7247\u5F15\u7528\u3002",
        "Image uploads are still running or waiting for retry, so note sync was deferred to avoid old note content overwriting new image references."
      );
      await this.savePluginState();
      if (showNotice) {
        new import_obsidian.Notice(this.lastVaultSyncStatus, 8e3);
      }
      return false;
    }
    return true;
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
      this.schedulePriorityNoteSync(noteFile.path, "image-add");
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
      this.schedulePriorityNoteSync(task.notePath, "image-add");
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
      void this.startPendingTask(task);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiXHVGRUZGaW1wb3J0IHtcclxuICBBcHAsXG4gIEVkaXRvcixcbiAgTWFya2Rvd25GaWxlSW5mbyxcbiAgTWFya2Rvd25SZW5kZXJDaGlsZCxcbiAgTWFya2Rvd25WaWV3LFxyXG4gIE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQsXHJcbiAgTW9kYWwsXHJcbiAgTm90aWNlLFxyXG4gIFBsdWdpbixcclxuICBQbHVnaW5TZXR0aW5nVGFiLFxyXG4gIFNldHRpbmcsXHJcbiAgVEFic3RyYWN0RmlsZSxcclxuICBURmlsZSxcbiAgbm9ybWFsaXplUGF0aCxcbiAgcmVxdWVzdFVybCBhcyBvYnNpZGlhblJlcXVlc3RVcmwsXG59IGZyb20gXCJvYnNpZGlhblwiO1xuXHJcbnR5cGUgU2VjdXJlV2ViZGF2U2V0dGluZ3MgPSB7XG4gIHdlYmRhdlVybDogc3RyaW5nO1xuICB1c2VybmFtZTogc3RyaW5nO1xuICBwYXNzd29yZDogc3RyaW5nO1xuICByZW1vdGVGb2xkZXI6IHN0cmluZztcbiAgdmF1bHRTeW5jUmVtb3RlRm9sZGVyOiBzdHJpbmc7XG4gIG5hbWluZ1N0cmF0ZWd5OiBcInRpbWVzdGFtcFwiIHwgXCJoYXNoXCI7XG4gIGRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQ6IGJvb2xlYW47XG4gIGxhbmd1YWdlOiBcImF1dG9cIiB8IFwiemhcIiB8IFwiZW5cIjtcbiAgbm90ZVN0b3JhZ2VNb2RlOiBcImZ1bGwtbG9jYWxcIiB8IFwibGF6eS1ub3Rlc1wiO1xuICBub3RlRXZpY3RBZnRlckRheXM6IG51bWJlcjtcbiAgYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXM6IG51bWJlcjtcbiAgbWF4UmV0cnlBdHRlbXB0czogbnVtYmVyO1xuICByZXRyeURlbGF5U2Vjb25kczogbnVtYmVyO1xuICBkZWxldGVSZW1vdGVXaGVuVW5yZWZlcmVuY2VkOiBib29sZWFuO1xuICBjb21wcmVzc0ltYWdlczogYm9vbGVhbjtcbiAgY29tcHJlc3NUaHJlc2hvbGRLYjogbnVtYmVyO1xuICBtYXhJbWFnZURpbWVuc2lvbjogbnVtYmVyO1xuICBqcGVnUXVhbGl0eTogbnVtYmVyO1xufTtcblxyXG50eXBlIFVwbG9hZFRhc2sgPSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5vdGVQYXRoOiBzdHJpbmc7XG4gIHBsYWNlaG9sZGVyOiBzdHJpbmc7XG4gIG1pbWVUeXBlOiBzdHJpbmc7XHJcbiAgZmlsZU5hbWU6IHN0cmluZztcclxuICBkYXRhQmFzZTY0OiBzdHJpbmc7XHJcbiAgYXR0ZW1wdHM6IG51bWJlcjtcclxuICBjcmVhdGVkQXQ6IG51bWJlcjtcclxuICBsYXN0RXJyb3I/OiBzdHJpbmc7XG59O1xuXG50eXBlIFN5bmNJbmRleEVudHJ5ID0ge1xuICBsb2NhbFNpZ25hdHVyZTogc3RyaW5nO1xuICByZW1vdGVTaWduYXR1cmU6IHN0cmluZztcbiAgcmVtb3RlUGF0aDogc3RyaW5nO1xufTtcblxudHlwZSBSZW1vdGVGaWxlU3RhdGUgPSB7XG4gIHJlbW90ZVBhdGg6IHN0cmluZztcbiAgbGFzdE1vZGlmaWVkOiBudW1iZXI7XG4gIHNpemU6IG51bWJlcjtcbiAgc2lnbmF0dXJlOiBzdHJpbmc7XG59O1xuXG50eXBlIERlbGV0aW9uVG9tYnN0b25lID0ge1xuICBwYXRoOiBzdHJpbmc7XG4gIGRlbGV0ZWRBdDogbnVtYmVyO1xuICByZW1vdGVTaWduYXR1cmU/OiBzdHJpbmc7XG59O1xuXG50eXBlIE1pc3NpbmdMYXp5UmVtb3RlUmVjb3JkID0ge1xuICBmaXJzdERldGVjdGVkQXQ6IG51bWJlcjtcbiAgbGFzdERldGVjdGVkQXQ6IG51bWJlcjtcbiAgbWlzc0NvdW50OiBudW1iZXI7XG59O1xuXG50eXBlIFJlbW90ZUludmVudG9yeSA9IHtcbiAgZmlsZXM6IE1hcDxzdHJpbmcsIFJlbW90ZUZpbGVTdGF0ZT47XG4gIGRpcmVjdG9yaWVzOiBTZXQ8c3RyaW5nPjtcbn07XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFNlY3VyZVdlYmRhdlNldHRpbmdzID0ge1xuICB3ZWJkYXZVcmw6IFwiXCIsXG4gIHVzZXJuYW1lOiBcIlwiLFxuICBwYXNzd29yZDogXCJcIixcbiAgcmVtb3RlRm9sZGVyOiBcIi9yZW1vdGUtaW1hZ2VzL1wiLFxuICB2YXVsdFN5bmNSZW1vdGVGb2xkZXI6IFwiL3ZhdWx0LXN5bmMvXCIsXG4gIG5hbWluZ1N0cmF0ZWd5OiBcImhhc2hcIixcbiAgZGVsZXRlTG9jYWxBZnRlclVwbG9hZDogdHJ1ZSxcbiAgbGFuZ3VhZ2U6IFwiYXV0b1wiLFxuICBub3RlU3RvcmFnZU1vZGU6IFwiZnVsbC1sb2NhbFwiLFxuICBub3RlRXZpY3RBZnRlckRheXM6IDMwLFxuICBhdXRvU3luY0ludGVydmFsTWludXRlczogMCxcbiAgbWF4UmV0cnlBdHRlbXB0czogNSxcbiAgcmV0cnlEZWxheVNlY29uZHM6IDUsXG4gIGRlbGV0ZVJlbW90ZVdoZW5VbnJlZmVyZW5jZWQ6IHRydWUsXG4gIGNvbXByZXNzSW1hZ2VzOiB0cnVlLFxuICBjb21wcmVzc1RocmVzaG9sZEtiOiAzMDAsXG4gIG1heEltYWdlRGltZW5zaW9uOiAyMjAwLFxuICBqcGVnUXVhbGl0eTogODIsXG59O1xuXHJcbmNvbnN0IFNFQ1VSRV9QUk9UT0NPTCA9IFwid2ViZGF2LXNlY3VyZTpcIjtcbmNvbnN0IFNFQ1VSRV9DT0RFX0JMT0NLID0gXCJzZWN1cmUtd2ViZGF2XCI7XG5jb25zdCBTRUNVUkVfTk9URV9TVFVCID0gXCJzZWN1cmUtd2ViZGF2LW5vdGUtc3R1YlwiO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTZWN1cmVXZWJkYXZJbWFnZXNQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogU2VjdXJlV2ViZGF2U2V0dGluZ3MgPSBERUZBVUxUX1NFVFRJTkdTO1xuICBxdWV1ZTogVXBsb2FkVGFza1tdID0gW107XG4gIHByaXZhdGUgYmxvYlVybHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBwcm9jZXNzaW5nVGFza0lkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIHJldHJ5VGltZW91dHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICBwcml2YXRlIG5vdGVSZW1vdGVSZWZzID0gbmV3IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PigpO1xuICBwcml2YXRlIHJlbW90ZUNsZWFudXBJbkZsaWdodCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIG5vdGVBY2Nlc3NUaW1lc3RhbXBzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgcHJpdmF0ZSBzeW5jSW5kZXggPSBuZXcgTWFwPHN0cmluZywgU3luY0luZGV4RW50cnk+KCk7XG4gIHByaXZhdGUgbWlzc2luZ0xhenlSZW1vdGVOb3RlcyA9IG5ldyBNYXA8c3RyaW5nLCBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZD4oKTtcbiAgcHJpdmF0ZSBwZW5kaW5nVGFza1Byb21pc2VzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8dm9pZD4+KCk7XG4gIHByaXZhdGUgcHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgcHJpdmF0ZSBwcmlvcml0eU5vdGVTeW5jc0luRmxpZ2h0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgbGFzdFZhdWx0U3luY0F0ID0gMDtcbiAgcHJpdmF0ZSBsYXN0VmF1bHRTeW5jU3RhdHVzID0gXCJcIjtcbiAgcHJpdmF0ZSBzeW5jSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICBwcml2YXRlIGF1dG9TeW5jVGlja0luUHJvZ3Jlc3MgPSBmYWxzZTtcblxuICBwcml2YXRlIHJlYWRvbmx5IGRlbGV0aW9uRm9sZGVyU3VmZml4ID0gXCIuX19zZWN1cmUtd2ViZGF2LWRlbGV0aW9uc19fL1wiO1xuICBwcml2YXRlIHJlYWRvbmx5IG1pc3NpbmdMYXp5UmVtb3RlQ29uZmlybWF0aW9ucyA9IDI7XG5cclxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgYXdhaXQgdGhpcy5sb2FkUGx1Z2luU3RhdGUoKTtcblxuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgU2VjdXJlV2ViZGF2U2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInVwbG9hZC1jdXJyZW50LW5vdGUtbG9jYWwtaW1hZ2VzXCIsXG4gICAgICBuYW1lOiBcIlVwbG9hZCBsb2NhbCBpbWFnZXMgaW4gY3VycmVudCBub3RlIHRvIFdlYkRBVlwiLFxuICAgICAgY2hlY2tDYWxsYmFjazogKGNoZWNraW5nKSA9PiB7XHJcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XHJcbiAgICAgICAgaWYgKCFmaWxlKSB7XHJcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoIWNoZWNraW5nKSB7XHJcbiAgICAgICAgICB2b2lkIHRoaXMudXBsb2FkSW1hZ2VzSW5Ob3RlKGZpbGUpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwidGVzdC13ZWJkYXYtY29ubmVjdGlvblwiLFxuICAgICAgbmFtZTogXCJUZXN0IFdlYkRBViBjb25uZWN0aW9uXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4ge1xuICAgICAgICB2b2lkIHRoaXMucnVuQ29ubmVjdGlvblRlc3QodHJ1ZSk7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInN5bmMtY29uZmlndXJlZC12YXVsdC1jb250ZW50LXRvLXdlYmRhdlwiLFxuICAgICAgbmFtZTogXCJTeW5jIHZhdWx0IGNvbnRlbnQgdG8gV2ViREFWXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4ge1xuICAgICAgICB2b2lkIHRoaXMucnVuTWFudWFsU3luYygpO1xuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHJpYmJvbiA9IHRoaXMuYWRkUmliYm9uSWNvbihcInJlZnJlc2gtY3dcIiwgdGhpcy50KFwiXHU3QUNCXHU1MzczXHU1NDBDXHU2QjY1XHU1MjMwIFdlYkRBVlwiLCBcIlN5bmMgdG8gV2ViREFWIG5vd1wiKSwgKCkgPT4ge1xuICAgICAgdm9pZCB0aGlzLnJ1bk1hbnVhbFN5bmMoKTtcbiAgICB9KTtcbiAgICByaWJib24uYWRkQ2xhc3MoXCJzZWN1cmUtd2ViZGF2LXN5bmMtcmliYm9uXCIpO1xuXHJcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Qb3N0UHJvY2Vzc29yKChlbCwgY3R4KSA9PiB7XG4gICAgICB2b2lkIHRoaXMucHJvY2Vzc1NlY3VyZUltYWdlcyhlbCwgY3R4KTtcbiAgICB9KTtcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoU0VDVVJFX0NPREVfQkxPQ0ssIChzb3VyY2UsIGVsLCBjdHgpID0+IHtcbiAgICAgIHZvaWQgdGhpcy5wcm9jZXNzU2VjdXJlQ29kZUJsb2NrKHNvdXJjZSwgZWwsIGN0eCk7XG4gICAgfSk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJmaWxlLW9wZW5cIiwgKGZpbGUpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmhhbmRsZUZpbGVPcGVuKGZpbGUpO1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImVkaXRvci1wYXN0ZVwiLCAoZXZ0LCBlZGl0b3IsIGluZm8pID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmhhbmRsZUVkaXRvclBhc3RlKGV2dCwgZWRpdG9yLCBpbmZvKTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJlZGl0b3ItZHJvcFwiLCAoZXZ0LCBlZGl0b3IsIGluZm8pID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmhhbmRsZUVkaXRvckRyb3AoZXZ0LCBlZGl0b3IsIGluZm8pO1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIGF3YWl0IHRoaXMucmVidWlsZFJlZmVyZW5jZUluZGV4KCk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwibW9kaWZ5XCIsIChmaWxlKSA9PiB2b2lkIHRoaXMuaGFuZGxlVmF1bHRNb2RpZnkoZmlsZSkpKTtcbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oXCJkZWxldGVcIiwgKGZpbGUpID0+IHZvaWQgdGhpcy5oYW5kbGVWYXVsdERlbGV0ZShmaWxlKSkpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcInJlbmFtZVwiLCAoZmlsZSwgb2xkUGF0aCkgPT4gdm9pZCB0aGlzLmhhbmRsZVZhdWx0UmVuYW1lKGZpbGUsIG9sZFBhdGgpKSk7XG5cbiAgICB0aGlzLnNldHVwQXV0b1N5bmMoKTtcblxuICAgIHZvaWQgdGhpcy5wcm9jZXNzUGVuZGluZ1Rhc2tzKCk7XG5cclxuICAgIHRoaXMucmVnaXN0ZXIoKCkgPT4ge1xuICAgICAgZm9yIChjb25zdCBibG9iVXJsIG9mIHRoaXMuYmxvYlVybHMpIHtcbiAgICAgICAgVVJMLnJldm9rZU9iamVjdFVSTChibG9iVXJsKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuYmxvYlVybHMuY2xlYXIoKTtcbiAgICAgIGZvciAoY29uc3QgdGltZW91dElkIG9mIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLnZhbHVlcygpKSB7XG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICAgIH1cbiAgICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLmNsZWFyKCk7XG4gICAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnJldHJ5VGltZW91dHMudmFsdWVzKCkpIHtcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xuICAgICAgfVxuICAgICAgdGhpcy5yZXRyeVRpbWVvdXRzLmNsZWFyKCk7XG4gICAgfSk7XG4gIH1cclxuXHJcbiAgb251bmxvYWQoKSB7XHJcbiAgICBmb3IgKGNvbnN0IGJsb2JVcmwgb2YgdGhpcy5ibG9iVXJscykge1xyXG4gICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKGJsb2JVcmwpO1xyXG4gICAgfVxyXG4gICAgdGhpcy5ibG9iVXJscy5jbGVhcigpO1xyXG4gICAgZm9yIChjb25zdCB0aW1lb3V0SWQgb2YgdGhpcy5yZXRyeVRpbWVvdXRzLnZhbHVlcygpKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgfVxuICAgIHRoaXMucmV0cnlUaW1lb3V0cy5jbGVhcigpO1xuICAgIGZvciAoY29uc3QgdGltZW91dElkIG9mIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLnZhbHVlcygpKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgfVxuICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLmNsZWFyKCk7XG4gIH1cblxyXG4gIGFzeW5jIGxvYWRQbHVnaW5TdGF0ZSgpIHtcbiAgICBjb25zdCBsb2FkZWQgPSBhd2FpdCB0aGlzLmxvYWREYXRhKCk7XG4gICAgaWYgKCFsb2FkZWQgfHwgdHlwZW9mIGxvYWRlZCAhPT0gXCJvYmplY3RcIikge1xuICAgICAgdGhpcy5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUyB9O1xuICAgICAgdGhpcy5xdWV1ZSA9IFtdO1xuICAgICAgdGhpcy5ub3RlQWNjZXNzVGltZXN0YW1wcyA9IG5ldyBNYXAoKTtcbiAgICAgIHRoaXMuc3luY0luZGV4ID0gbmV3IE1hcCgpO1xuICAgICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzID0gbmV3IE1hcCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGNhbmRpZGF0ZSA9IGxvYWRlZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICBpZiAoXCJzZXR0aW5nc1wiIGluIGNhbmRpZGF0ZSB8fCBcInF1ZXVlXCIgaW4gY2FuZGlkYXRlKSB7XG4gICAgICB0aGlzLnNldHRpbmdzID0geyAuLi5ERUZBVUxUX1NFVFRJTkdTLCAuLi4oKGNhbmRpZGF0ZS5zZXR0aW5ncyBhcyBQYXJ0aWFsPFNlY3VyZVdlYmRhdlNldHRpbmdzPikgPz8ge30pIH07XG4gICAgICB0aGlzLnF1ZXVlID0gQXJyYXkuaXNBcnJheShjYW5kaWRhdGUucXVldWUpID8gKGNhbmRpZGF0ZS5xdWV1ZSBhcyBVcGxvYWRUYXNrW10pIDogW107XG4gICAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzID0gbmV3IE1hcChcbiAgICAgICAgT2JqZWN0LmVudHJpZXMoKGNhbmRpZGF0ZS5ub3RlQWNjZXNzVGltZXN0YW1wcyBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHwgdW5kZWZpbmVkKSA/PyB7fSksXG4gICAgICApO1xuICAgICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzID0gbmV3IE1hcChcbiAgICAgICAgT2JqZWN0LmVudHJpZXMoKGNhbmRpZGF0ZS5taXNzaW5nTGF6eVJlbW90ZU5vdGVzIGFzIFJlY29yZDxzdHJpbmcsIE1pc3NpbmdMYXp5UmVtb3RlUmVjb3JkPiB8IHVuZGVmaW5lZCkgPz8ge30pXG4gICAgICAgICAgLmZpbHRlcigoWywgdmFsdWVdKSA9PiB7XG4gICAgICAgICAgICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByZWNvcmQgPSB2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgIHR5cGVvZiByZWNvcmQuZmlyc3REZXRlY3RlZEF0ID09PSBcIm51bWJlclwiICYmXG4gICAgICAgICAgICAgIHR5cGVvZiByZWNvcmQubGFzdERldGVjdGVkQXQgPT09IFwibnVtYmVyXCIgJiZcbiAgICAgICAgICAgICAgdHlwZW9mIHJlY29yZC5taXNzQ291bnQgPT09IFwibnVtYmVyXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAubWFwKChbcGF0aCwgdmFsdWVdKSA9PiBbcGF0aCwgdmFsdWUgYXMgTWlzc2luZ0xhenlSZW1vdGVSZWNvcmRdKSxcbiAgICAgICk7XG4gICAgICB0aGlzLnN5bmNJbmRleCA9IG5ldyBNYXAoKTtcbiAgICAgIGZvciAoY29uc3QgW3BhdGgsIHJhd0VudHJ5XSBvZiBPYmplY3QuZW50cmllcygoY2FuZGlkYXRlLnN5bmNJbmRleCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCkgPz8ge30pKSB7XG4gICAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSB0aGlzLm5vcm1hbGl6ZVN5bmNJbmRleEVudHJ5KHBhdGgsIHJhd0VudHJ5KTtcbiAgICAgICAgaWYgKG5vcm1hbGl6ZWQpIHtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQocGF0aCwgbm9ybWFsaXplZCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID1cbiAgICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jQXQgPT09IFwibnVtYmVyXCIgPyBjYW5kaWRhdGUubGFzdFZhdWx0U3luY0F0IDogMDtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9XG4gICAgICAgIHR5cGVvZiBjYW5kaWRhdGUubGFzdFZhdWx0U3luY1N0YXR1cyA9PT0gXCJzdHJpbmdcIiA/IGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jU3RhdHVzIDogXCJcIjtcbiAgICAgIHRoaXMubm9ybWFsaXplRWZmZWN0aXZlU2V0dGluZ3MoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnNldHRpbmdzID0geyAuLi5ERUZBVUxUX1NFVFRJTkdTLCAuLi4oY2FuZGlkYXRlIGFzIFBhcnRpYWw8U2VjdXJlV2ViZGF2U2V0dGluZ3M+KSB9O1xuICAgIHRoaXMucXVldWUgPSBbXTtcbiAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuc3luY0luZGV4ID0gbmV3IE1hcCgpO1xuICAgIHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3RlcyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IDA7XG4gICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gXCJcIjtcbiAgICB0aGlzLm5vcm1hbGl6ZUVmZmVjdGl2ZVNldHRpbmdzKCk7XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUVmZmVjdGl2ZVNldHRpbmdzKCkge1xuICAgIC8vIEtlZXAgdGhlIHB1YmxpYyBzZXR0aW5ncyBzdXJmYWNlIGludGVudGlvbmFsbHkgc21hbGwgYW5kIGRldGVybWluaXN0aWMuXG4gICAgdGhpcy5zZXR0aW5ncy5kZWxldGVMb2NhbEFmdGVyVXBsb2FkID0gdHJ1ZTtcbiAgICB0aGlzLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzID0gTWF0aC5tYXgoMCwgTWF0aC5mbG9vcih0aGlzLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzIHx8IDApKTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0dXBBdXRvU3luYygpIHtcbiAgICBjb25zdCBtaW51dGVzID0gdGhpcy5zZXR0aW5ncy5hdXRvU3luY0ludGVydmFsTWludXRlcztcbiAgICBpZiAobWludXRlcyA8PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaW50ZXJ2YWxNcyA9IG1pbnV0ZXMgKiA2MCAqIDEwMDA7XG4gICAgdGhpcy5yZWdpc3RlckludGVydmFsKFxuICAgICAgd2luZG93LnNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLnJ1bkF1dG9TeW5jVGljaygpO1xuICAgICAgfSwgaW50ZXJ2YWxNcyksXG4gICAgKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcnVuQXV0b1N5bmNUaWNrKCkge1xuICAgIGlmICh0aGlzLmF1dG9TeW5jVGlja0luUHJvZ3Jlc3MpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLmF1dG9TeW5jVGlja0luUHJvZ3Jlc3MgPSB0cnVlO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB0aGlzLnN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50KGZhbHNlKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy5hdXRvU3luY1RpY2tJblByb2dyZXNzID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc2F2ZVBsdWdpblN0YXRlKCkge1xuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEoe1xuICAgICAgc2V0dGluZ3M6IHRoaXMuc2V0dGluZ3MsXG4gICAgICBxdWV1ZTogdGhpcy5xdWV1ZSxcbiAgICAgIG5vdGVBY2Nlc3NUaW1lc3RhbXBzOiBPYmplY3QuZnJvbUVudHJpZXModGhpcy5ub3RlQWNjZXNzVGltZXN0YW1wcy5lbnRyaWVzKCkpLFxuICAgICAgbWlzc2luZ0xhenlSZW1vdGVOb3RlczogT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3Rlcy5lbnRyaWVzKCkpLFxuICAgICAgc3luY0luZGV4OiBPYmplY3QuZnJvbUVudHJpZXModGhpcy5zeW5jSW5kZXguZW50cmllcygpKSxcbiAgICAgIGxhc3RWYXVsdFN5bmNBdDogdGhpcy5sYXN0VmF1bHRTeW5jQXQsXG4gICAgICBsYXN0VmF1bHRTeW5jU3RhdHVzOiB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsXG4gICAgfSk7XG4gIH1cblxyXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcbiAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVTeW5jSW5kZXhFbnRyeSh2YXVsdFBhdGg6IHN0cmluZywgcmF3RW50cnk6IHVua25vd24pOiBTeW5jSW5kZXhFbnRyeSB8IG51bGwge1xuICAgIGlmICghcmF3RW50cnkgfHwgdHlwZW9mIHJhd0VudHJ5ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBjYW5kaWRhdGUgPSByYXdFbnRyeSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICBjb25zdCByZW1vdGVQYXRoID1cbiAgICAgIHR5cGVvZiBjYW5kaWRhdGUucmVtb3RlUGF0aCA9PT0gXCJzdHJpbmdcIiAmJiBjYW5kaWRhdGUucmVtb3RlUGF0aC5sZW5ndGggPiAwXG4gICAgICAgID8gY2FuZGlkYXRlLnJlbW90ZVBhdGhcbiAgICAgICAgOiB0aGlzLmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aCh2YXVsdFBhdGgpO1xuICAgIGNvbnN0IGxvY2FsU2lnbmF0dXJlID1cbiAgICAgIHR5cGVvZiBjYW5kaWRhdGUubG9jYWxTaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgPyBjYW5kaWRhdGUubG9jYWxTaWduYXR1cmVcbiAgICAgICAgOiB0eXBlb2YgY2FuZGlkYXRlLnNpZ25hdHVyZSA9PT0gXCJzdHJpbmdcIlxuICAgICAgICAgID8gY2FuZGlkYXRlLnNpZ25hdHVyZVxuICAgICAgICAgIDogXCJcIjtcbiAgICBjb25zdCByZW1vdGVTaWduYXR1cmUgPVxuICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5yZW1vdGVTaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgPyBjYW5kaWRhdGUucmVtb3RlU2lnbmF0dXJlXG4gICAgICAgIDogdHlwZW9mIGNhbmRpZGF0ZS5zaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgICA/IGNhbmRpZGF0ZS5zaWduYXR1cmVcbiAgICAgICAgICA6IFwiXCI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICByZW1vdGVQYXRoLFxuICAgIH07XG4gIH1cblxyXG4gIHQoemg6IHN0cmluZywgZW46IHN0cmluZykge1xyXG4gICAgcmV0dXJuIHRoaXMuZ2V0TGFuZ3VhZ2UoKSA9PT0gXCJ6aFwiID8gemggOiBlbjtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZ2V0TGFuZ3VhZ2UoKSB7XG4gICAgaWYgKHRoaXMuc2V0dGluZ3MubGFuZ3VhZ2UgPT09IFwiYXV0b1wiKSB7XG4gICAgICBjb25zdCBsb2NhbGUgPSB0eXBlb2YgbmF2aWdhdG9yICE9PSBcInVuZGVmaW5lZFwiID8gbmF2aWdhdG9yLmxhbmd1YWdlLnRvTG93ZXJDYXNlKCkgOiBcImVuXCI7XG4gICAgICByZXR1cm4gbG9jYWxlLnN0YXJ0c1dpdGgoXCJ6aFwiKSA/IFwiemhcIiA6IFwiZW5cIjtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zZXR0aW5ncy5sYW5ndWFnZTtcbiAgfVxuXG4gIGZvcm1hdExhc3RTeW5jTGFiZWwoKSB7XG4gICAgaWYgKCF0aGlzLmxhc3RWYXVsdFN5bmNBdCkge1xuICAgICAgcmV0dXJuIHRoaXMudChcIlx1NEUwQVx1NkIyMVx1NTQwQ1x1NkI2NVx1RkYxQVx1NUMxQVx1NjcyQVx1NjI2N1x1ODg0Q1wiLCBcIkxhc3Qgc3luYzogbm90IHJ1biB5ZXRcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMudChcbiAgICAgIGBcdTRFMEFcdTZCMjFcdTU0MENcdTZCNjVcdUZGMUEke25ldyBEYXRlKHRoaXMubGFzdFZhdWx0U3luY0F0KS50b0xvY2FsZVN0cmluZygpfWAsXG4gICAgICBgTGFzdCBzeW5jOiAke25ldyBEYXRlKHRoaXMubGFzdFZhdWx0U3luY0F0KS50b0xvY2FsZVN0cmluZygpfWAsXG4gICAgKTtcbiAgfVxuXG4gIGZvcm1hdFN5bmNTdGF0dXNMYWJlbCgpIHtcbiAgICByZXR1cm4gdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzXG4gICAgICA/IHRoaXMudChgXHU2NzAwXHU4RkQxXHU3MkI2XHU2MDAxXHVGRjFBJHt0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXN9YCwgYFJlY2VudCBzdGF0dXM6ICR7dGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzfWApXG4gICAgICA6IHRoaXMudChcIlx1NjcwMFx1OEZEMVx1NzJCNlx1NjAwMVx1RkYxQVx1NjY4Mlx1NjVFMFwiLCBcIlJlY2VudCBzdGF0dXM6IG5vbmVcIik7XG4gIH1cblxuICBhc3luYyBydW5NYW51YWxTeW5jKCkge1xuICAgIGF3YWl0IHRoaXMuc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQodHJ1ZSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlYnVpbGRSZWZlcmVuY2VJbmRleCgpIHtcbiAgICBjb25zdCBuZXh0ID0gbmV3IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PigpO1xuICAgIGZvciAoY29uc3QgZmlsZSBvZiB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkpIHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgbmV4dC5zZXQoZmlsZS5wYXRoLCB0aGlzLmV4dHJhY3RSZW1vdGVQYXRoc0Zyb21UZXh0KGNvbnRlbnQpKTtcbiAgICB9XG4gICAgdGhpcy5ub3RlUmVtb3RlUmVmcyA9IG5leHQ7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZVZhdWx0TW9kaWZ5KGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHx8IGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBjb25zdCBuZXh0UmVmcyA9IHRoaXMuZXh0cmFjdFJlbW90ZVBhdGhzRnJvbVRleHQoY29udGVudCk7XG4gICAgY29uc3QgcHJldmlvdXNSZWZzID0gdGhpcy5ub3RlUmVtb3RlUmVmcy5nZXQoZmlsZS5wYXRoKSA/PyBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICB0aGlzLm5vdGVSZW1vdGVSZWZzLnNldChmaWxlLnBhdGgsIG5leHRSZWZzKTtcblxuICAgIGNvbnN0IGFkZGVkID0gWy4uLm5leHRSZWZzXS5maWx0ZXIoKHZhbHVlKSA9PiAhcHJldmlvdXNSZWZzLmhhcyh2YWx1ZSkpO1xuICAgIGNvbnN0IHJlbW92ZWQgPSBbLi4ucHJldmlvdXNSZWZzXS5maWx0ZXIoKHZhbHVlKSA9PiAhbmV4dFJlZnMuaGFzKHZhbHVlKSk7XG4gICAgaWYgKGFkZGVkLmxlbmd0aCA+IDApIHtcbiAgICAgIHRoaXMuc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jKGZpbGUucGF0aCwgXCJpbWFnZS1hZGRcIik7XG4gICAgfVxuICAgIGlmIChyZW1vdmVkLmxlbmd0aCA+IDApIHtcbiAgICAgIHRoaXMuc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jKGZpbGUucGF0aCwgXCJpbWFnZS1yZW1vdmVcIik7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVWYXVsdERlbGV0ZShmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKGZpbGUucGF0aCkpIHtcbiAgICAgIGF3YWl0IHRoaXMud3JpdGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgsIHRoaXMuc3luY0luZGV4LmdldChmaWxlLnBhdGgpPy5yZW1vdGVTaWduYXR1cmUpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgIH1cblxuICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICBjb25zdCBwcmV2aW91c1JlZnMgPSB0aGlzLm5vdGVSZW1vdGVSZWZzLmdldChmaWxlLnBhdGgpID8/IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgICAgdGhpcy5ub3RlUmVtb3RlUmVmcy5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgIHZvaWQgcHJldmlvdXNSZWZzO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlVmF1bHRSZW5hbWUoZmlsZTogVEFic3RyYWN0RmlsZSwgb2xkUGF0aDogc3RyaW5nKSB7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKG9sZFBhdGgpKSB7XG4gICAgICBhd2FpdCB0aGlzLndyaXRlRGVsZXRpb25Ub21ic3RvbmUob2xkUGF0aCwgdGhpcy5zeW5jSW5kZXguZ2V0KG9sZFBhdGgpPy5yZW1vdGVTaWduYXR1cmUpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKG9sZFBhdGgpO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICB9XG5cbiAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgY29uc3QgcmVmcyA9IHRoaXMubm90ZVJlbW90ZVJlZnMuZ2V0KG9sZFBhdGgpO1xuICAgICAgaWYgKCFyZWZzKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgdGhpcy5ub3RlUmVtb3RlUmVmcy5kZWxldGUob2xkUGF0aCk7XG4gICAgICB0aGlzLm5vdGVSZW1vdGVSZWZzLnNldChmaWxlLnBhdGgsIHJlZnMpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdFJlbW90ZVBhdGhzRnJvbVRleHQoY29udGVudDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVmcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IHNwYW5SZWdleCA9IC9kYXRhLXNlY3VyZS13ZWJkYXY9XCIoW15cIl0rKVwiL2c7XG4gICAgY29uc3QgcHJvdG9jb2xSZWdleCA9IC93ZWJkYXYtc2VjdXJlOlxcL1xcLyhbXlxccylcIl0rKS9nO1xuICAgIGNvbnN0IGNvZGVCbG9ja1JlZ2V4ID0gL2BgYHNlY3VyZS13ZWJkYXZcXHMrKFtcXHNcXFNdKj8pYGBgL2c7XG4gICAgbGV0IG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXG4gICAgd2hpbGUgKChtYXRjaCA9IHNwYW5SZWdleC5leGVjKGNvbnRlbnQpKSAhPT0gbnVsbCkge1xuICAgICAgcmVmcy5hZGQodGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0pKTtcbiAgICB9XG5cbiAgICB3aGlsZSAoKG1hdGNoID0gcHJvdG9jb2xSZWdleC5leGVjKGNvbnRlbnQpKSAhPT0gbnVsbCkge1xuICAgICAgcmVmcy5hZGQodGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0pKTtcbiAgICB9XG5cbiAgICB3aGlsZSAoKG1hdGNoID0gY29kZUJsb2NrUmVnZXguZXhlYyhjb250ZW50KSkgIT09IG51bGwpIHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IHRoaXMucGFyc2VTZWN1cmVJbWFnZUJsb2NrKG1hdGNoWzFdKTtcbiAgICAgIGlmIChwYXJzZWQ/LnBhdGgpIHtcbiAgICAgICAgcmVmcy5hZGQocGFyc2VkLnBhdGgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZWZzO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVSZW1vdGVJZlVucmVmZXJlbmNlZChyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICB2b2lkIHJlbW90ZVBhdGg7XG4gICAgLy8gRGlzYWJsZWQgaW50ZW50aW9uYWxseTogbG9jYWwtb25seSByZWZlcmVuY2UgY2hlY2tzIGFyZSBub3Qgc2FmZSBlbm91Z2hcbiAgICAvLyBmb3IgY3Jvc3MtZGV2aWNlIGRlbGV0aW9uIG9mIHNoYXJlZCByZW1vdGUgaW1hZ2VzLlxuICB9XG5cbiAgcHJpdmF0ZSBzY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZVBhdGg6IHN0cmluZywgcmVhc29uOiBcImltYWdlLWFkZFwiIHwgXCJpbWFnZS1yZW1vdmVcIikge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5wcmlvcml0eU5vdGVTeW5jVGltZW91dHMuZ2V0KG5vdGVQYXRoKTtcbiAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQoZXhpc3RpbmcpO1xuICAgIH1cblxuICAgIGNvbnN0IGRlbGF5TXMgPSByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCIgPyAxMjAwIDogNjAwO1xuICAgIGNvbnN0IHRpbWVvdXRJZCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLmRlbGV0ZShub3RlUGF0aCk7XG4gICAgICB2b2lkIHRoaXMuZmx1c2hQcmlvcml0eU5vdGVTeW5jKG5vdGVQYXRoLCByZWFzb24pO1xuICAgIH0sIGRlbGF5TXMpO1xuICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLnNldChub3RlUGF0aCwgdGltZW91dElkKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZmx1c2hQcmlvcml0eU5vdGVTeW5jKG5vdGVQYXRoOiBzdHJpbmcsIHJlYXNvbjogXCJpbWFnZS1hZGRcIiB8IFwiaW1hZ2UtcmVtb3ZlXCIpIHtcbiAgICBpZiAodGhpcy5wcmlvcml0eU5vdGVTeW5jc0luRmxpZ2h0Lmhhcyhub3RlUGF0aCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5oYXNQZW5kaW5nSW1hZ2VXb3JrRm9yTm90ZShub3RlUGF0aCkgfHwgdGhpcy5zeW5jSW5Qcm9ncmVzcyB8fCB0aGlzLmF1dG9TeW5jVGlja0luUHJvZ3Jlc3MpIHtcbiAgICAgIHRoaXMuc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jKG5vdGVQYXRoLCByZWFzb24pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChub3RlUGF0aCk7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB8fCBmaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiIHx8IHRoaXMuc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChmaWxlLnBhdGgpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5wcmlvcml0eU5vdGVTeW5jc0luRmxpZ2h0LmFkZChub3RlUGF0aCk7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xuXG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5yZWFkTWFya2Rvd25Db250ZW50UHJlZmVyRWRpdG9yKGZpbGUpO1xuICAgICAgaWYgKHRoaXMucGFyc2VOb3RlU3R1Yihjb250ZW50KSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aChmaWxlLnBhdGgpO1xuICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCwgY29udGVudCk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgIGxvY2FsU2lnbmF0dXJlOiBhd2FpdCB0aGlzLmJ1aWxkQ3VycmVudExvY2FsU2lnbmF0dXJlKGZpbGUsIGNvbnRlbnQpLFxuICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIH0pO1xuICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy50KFxuICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCJcbiAgICAgICAgICA/IGBcdTVERjJcdTRGMThcdTUxNDhcdTU0MENcdTZCNjVcdTU2RkVcdTcyNDdcdTY1QjBcdTU4OUVcdTU0MEVcdTc2ODRcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YFxuICAgICAgICAgIDogYFx1NURGMlx1NEYxOFx1NTE0OFx1NTQwQ1x1NkI2NVx1NTZGRVx1NzI0N1x1NTIyMFx1OTY2NFx1NTQwRVx1NzY4NFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCJcbiAgICAgICAgICA/IGBQcmlvcml0aXplZCBub3RlIHN5bmMgZmluaXNoZWQgYWZ0ZXIgaW1hZ2UgYWRkOiAke2ZpbGUuYmFzZW5hbWV9YFxuICAgICAgICAgIDogYFByaW9yaXRpemVkIG5vdGUgc3luYyBmaW5pc2hlZCBhZnRlciBpbWFnZSByZW1vdmFsOiAke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiUHJpb3JpdHkgbm90ZSBzeW5jIGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLmRlc2NyaWJlRXJyb3IoXG4gICAgICAgIHRoaXMudChcbiAgICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCIgPyBcIlx1NTZGRVx1NzI0N1x1NjVCMFx1NTg5RVx1NTQwRVx1NzY4NFx1N0IxNFx1OEJCMFx1NEYxOFx1NTE0OFx1NTQwQ1x1NkI2NVx1NTkzMVx1OEQyNVwiIDogXCJcdTU2RkVcdTcyNDdcdTUyMjBcdTk2NjRcdTU0MEVcdTc2ODRcdTdCMTRcdThCQjBcdTRGMThcdTUxNDhcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIixcbiAgICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCIgPyBcIlByaW9yaXR5IG5vdGUgc3luYyBhZnRlciBpbWFnZSBhZGQgZmFpbGVkXCIgOiBcIlByaW9yaXR5IG5vdGUgc3luYyBhZnRlciBpbWFnZSByZW1vdmFsIGZhaWxlZFwiLFxuICAgICAgICApLFxuICAgICAgICBlcnJvcixcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZVBhdGgsIHJlYXNvbik7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY3NJbkZsaWdodC5kZWxldGUobm90ZVBhdGgpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgaGFzUGVuZGluZ0ltYWdlV29ya0Zvck5vdGUobm90ZVBhdGg6IHN0cmluZykge1xuICAgIGlmICh0aGlzLnF1ZXVlLnNvbWUoKHRhc2spID0+IHRhc2subm90ZVBhdGggPT09IG5vdGVQYXRoKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCB0YXNrSWQgb2YgdGhpcy5wcm9jZXNzaW5nVGFza0lkcykge1xuICAgICAgY29uc3QgdGFzayA9IHRoaXMucXVldWUuZmluZCgoaXRlbSkgPT4gaXRlbS5pZCA9PT0gdGFza0lkKTtcbiAgICAgIGlmICh0YXNrPy5ub3RlUGF0aCA9PT0gbm90ZVBhdGgpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBbdGFza0lkXSBvZiB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMpIHtcbiAgICAgIGNvbnN0IHRhc2sgPSB0aGlzLnF1ZXVlLmZpbmQoKGl0ZW0pID0+IGl0ZW0uaWQgPT09IHRhc2tJZCk7XG4gICAgICBpZiAodGFzaz8ubm90ZVBhdGggPT09IG5vdGVQYXRoKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBhc3luYyBidWlsZFVwbG9hZFJlcGxhY2VtZW50cyhjb250ZW50OiBzdHJpbmcsIG5vdGVGaWxlOiBURmlsZSwgdXBsb2FkQ2FjaGU/OiBNYXA8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgY29uc3Qgc2VlbiA9IG5ldyBNYXA8c3RyaW5nLCBVcGxvYWRSZXdyaXRlPigpO1xuICAgIGNvbnN0IHdpa2lNYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtcXFsoW15cXF1dKylcXF1cXF0vZyldO1xuICAgIGNvbnN0IG1hcmtkb3duTWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKC8hXFxbW15cXF1dKl1cXCgoW14pXSspXFwpL2cpXTtcbiAgICBjb25zdCBodG1sSW1hZ2VNYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLzxpbWdcXGJbXj5dKnNyYz1bXCInXShbXlwiJ10rKVtcIiddW14+XSo+L2dpKV07XG5cclxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2Ygd2lraU1hdGNoZXMpIHtcclxuICAgICAgY29uc3QgcmF3TGluayA9IG1hdGNoWzFdLnNwbGl0KFwifFwiKVswXS50cmltKCk7XHJcbiAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGVGaWxlLnBhdGgpO1xyXG4gICAgICBpZiAoIWZpbGUgfHwgIXRoaXMuaXNJbWFnZUZpbGUoZmlsZSkpIHtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxuXG4gICAgICBpZiAoIXNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFZhdWx0RmlsZShmaWxlLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgICAgb3JpZ2luYWw6IG1hdGNoWzBdLFxuICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgZmlsZS5iYXNlbmFtZSksXG4gICAgICAgICAgc291cmNlRmlsZTogZmlsZSxcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIG1hcmtkb3duTWF0Y2hlcykge1xuICAgICAgY29uc3QgcmF3TGluayA9IGRlY29kZVVSSUNvbXBvbmVudChtYXRjaFsxXS50cmltKCkucmVwbGFjZSgvXjx8PiQvZywgXCJcIikpO1xuICAgICAgaWYgKC9eKHdlYmRhdi1zZWN1cmU6fGRhdGE6KS9pLnRlc3QocmF3TGluaykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLmlzSHR0cFVybChyYXdMaW5rKSkge1xuICAgICAgICBpZiAoIXNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICAgIGNvbnN0IHJlbW90ZVVybCA9IGF3YWl0IHRoaXMudXBsb2FkUmVtb3RlSW1hZ2VVcmwocmF3TGluaywgdXBsb2FkQ2FjaGUpO1xuICAgICAgICAgIGNvbnN0IGFsdFRleHQgPSB0aGlzLmV4dHJhY3RNYXJrZG93bkFsdFRleHQobWF0Y2hbMF0pIHx8IHRoaXMuZ2V0RGlzcGxheU5hbWVGcm9tVXJsKHJhd0xpbmspO1xuICAgICAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgICAgICBvcmlnaW5hbDogbWF0Y2hbMF0sXG4gICAgICAgICAgICByZXdyaXR0ZW46IHRoaXMuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGFsdFRleHQpLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBmaWxlID0gdGhpcy5yZXNvbHZlTGlua2VkRmlsZShyYXdMaW5rLCBub3RlRmlsZS5wYXRoKTtcbiAgICAgIGlmICghZmlsZSB8fCAhdGhpcy5pc0ltYWdlRmlsZShmaWxlKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFzZWVuLmhhcyhtYXRjaFswXSkpIHtcbiAgICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRWYXVsdEZpbGUoZmlsZSwgdXBsb2FkQ2FjaGUpO1xuICAgICAgICBzZWVuLnNldChtYXRjaFswXSwge1xuICAgICAgICAgIG9yaWdpbmFsOiBtYXRjaFswXSxcbiAgICAgICAgICByZXdyaXR0ZW46IHRoaXMuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGZpbGUuYmFzZW5hbWUpLFxuICAgICAgICAgIHNvdXJjZUZpbGU6IGZpbGUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgaHRtbEltYWdlTWF0Y2hlcykge1xuICAgICAgY29uc3QgcmF3TGluayA9IHRoaXMudW5lc2NhcGVIdG1sKG1hdGNoWzFdLnRyaW0oKSk7XG4gICAgICBpZiAoIXRoaXMuaXNIdHRwVXJsKHJhd0xpbmspIHx8IHNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRSZW1vdGVJbWFnZVVybChyYXdMaW5rLCB1cGxvYWRDYWNoZSk7XG4gICAgICBjb25zdCBhbHRUZXh0ID0gdGhpcy5leHRyYWN0SHRtbEltYWdlQWx0VGV4dChtYXRjaFswXSkgfHwgdGhpcy5nZXREaXNwbGF5TmFtZUZyb21VcmwocmF3TGluayk7XG4gICAgICBzZWVuLnNldChtYXRjaFswXSwge1xuICAgICAgICBvcmlnaW5hbDogbWF0Y2hbMF0sXG4gICAgICAgIHJld3JpdHRlbjogdGhpcy5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgYWx0VGV4dCksXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gWy4uLnNlZW4udmFsdWVzKCldO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRyYWN0TWFya2Rvd25BbHRUZXh0KG1hcmtkb3duSW1hZ2U6IHN0cmluZykge1xuICAgIGNvbnN0IG1hdGNoID0gbWFya2Rvd25JbWFnZS5tYXRjaCgvXiFcXFsoW15cXF1dKilcXF0vKTtcbiAgICByZXR1cm4gbWF0Y2g/LlsxXT8udHJpbSgpID8/IFwiXCI7XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RIdG1sSW1hZ2VBbHRUZXh0KGh0bWxJbWFnZTogc3RyaW5nKSB7XG4gICAgY29uc3QgbWF0Y2ggPSBodG1sSW1hZ2UubWF0Y2goL1xcYmFsdD1bXCInXShbXlwiJ10qKVtcIiddL2kpO1xuICAgIHJldHVybiBtYXRjaCA/IHRoaXMudW5lc2NhcGVIdG1sKG1hdGNoWzFdLnRyaW0oKSkgOiBcIlwiO1xuICB9XG5cbiAgcHJpdmF0ZSBpc0h0dHBVcmwodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiAvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KHZhbHVlKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0RGlzcGxheU5hbWVGcm9tVXJsKHJhd1VybDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmF3VXJsKTtcbiAgICAgIGNvbnN0IGZpbGVOYW1lID0gdGhpcy5zYW5pdGl6ZUZpbGVOYW1lKHVybC5wYXRobmFtZS5zcGxpdChcIi9cIikucG9wKCkgfHwgXCJcIik7XG4gICAgICBpZiAoZmlsZU5hbWUpIHtcbiAgICAgICAgcmV0dXJuIGZpbGVOYW1lLnJlcGxhY2UoL1xcLlteLl0rJC8sIFwiXCIpO1xuICAgICAgfVxuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gRmFsbCB0aHJvdWdoIHRvIHRoZSBnZW5lcmljIGxhYmVsIGJlbG93LlxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnQoXCJcdTdGNTFcdTk4NzVcdTU2RkVcdTcyNDdcIiwgXCJXZWIgaW1hZ2VcIik7XG4gIH1cblxuICBwcml2YXRlIHJlc29sdmVMaW5rZWRGaWxlKGxpbms6IHN0cmluZywgc291cmNlUGF0aDogc3RyaW5nKTogVEZpbGUgfCBudWxsIHtcbiAgICBjb25zdCBjbGVhbmVkID0gbGluay5yZXBsYWNlKC8jLiovLCBcIlwiKS50cmltKCk7XG4gICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5hcHAubWV0YWRhdGFDYWNoZS5nZXRGaXJzdExpbmtwYXRoRGVzdChjbGVhbmVkLCBzb3VyY2VQYXRoKTtcbiAgICByZXR1cm4gdGFyZ2V0IGluc3RhbmNlb2YgVEZpbGUgPyB0YXJnZXQgOiBudWxsO1xuICB9XHJcblxyXG4gIHByaXZhdGUgaXNJbWFnZUZpbGUoZmlsZTogVEZpbGUpIHtcbiAgICByZXR1cm4gL14ocG5nfGpwZT9nfGdpZnx3ZWJwfGJtcHxzdmcpJC9pLnRlc3QoZmlsZS5leHRlbnNpb24pO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRWYXVsdEZpbGUoZmlsZTogVEZpbGUsIHVwbG9hZENhY2hlPzogTWFwPHN0cmluZywgc3RyaW5nPikge1xuICAgIGlmICh1cGxvYWRDYWNoZT8uaGFzKGZpbGUucGF0aCkpIHtcbiAgICAgIHJldHVybiB1cGxvYWRDYWNoZS5nZXQoZmlsZS5wYXRoKSE7XG4gICAgfVxuXG4gICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG4gICAgY29uc3QgYmluYXJ5ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZEJpbmFyeShmaWxlKTtcbiAgICBjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRoaXMucHJlcGFyZVVwbG9hZFBheWxvYWQoYmluYXJ5LCB0aGlzLmdldE1pbWVUeXBlKGZpbGUuZXh0ZW5zaW9uKSwgZmlsZS5uYW1lKTtcbiAgICBjb25zdCByZW1vdGVOYW1lID0gYXdhaXQgdGhpcy5idWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeShwcmVwYXJlZC5maWxlTmFtZSwgcHJlcGFyZWQuYmluYXJ5KTtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5idWlsZFJlbW90ZVBhdGgocmVtb3RlTmFtZSk7XG4gICAgYXdhaXQgdGhpcy51cGxvYWRCaW5hcnkocmVtb3RlUGF0aCwgcHJlcGFyZWQuYmluYXJ5LCBwcmVwYXJlZC5taW1lVHlwZSk7XG4gICAgY29uc3QgcmVtb3RlVXJsID0gYCR7U0VDVVJFX1BST1RPQ09MfS8vJHtyZW1vdGVQYXRofWA7XG4gICAgdXBsb2FkQ2FjaGU/LnNldChmaWxlLnBhdGgsIHJlbW90ZVVybCk7XG4gICAgcmV0dXJuIHJlbW90ZVVybDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkUmVtb3RlSW1hZ2VVcmwoaW1hZ2VVcmw6IHN0cmluZywgdXBsb2FkQ2FjaGU/OiBNYXA8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgY29uc3QgY2FjaGVLZXkgPSBgcmVtb3RlOiR7aW1hZ2VVcmx9YDtcbiAgICBpZiAodXBsb2FkQ2FjaGU/LmhhcyhjYWNoZUtleSkpIHtcbiAgICAgIHJldHVybiB1cGxvYWRDYWNoZS5nZXQoY2FjaGVLZXkpITtcbiAgICB9XG5cbiAgICB0aGlzLmVuc3VyZUNvbmZpZ3VyZWQoKTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IGltYWdlVXJsLFxuICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgZm9sbG93UmVkaXJlY3RzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFJlbW90ZSBpbWFnZSBkb3dubG9hZCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgY29udGVudFR5cGUgPSByZXNwb25zZS5oZWFkZXJzW1wiY29udGVudC10eXBlXCJdID8/IFwiXCI7XG4gICAgaWYgKCF0aGlzLmlzSW1hZ2VDb250ZW50VHlwZShjb250ZW50VHlwZSkgJiYgIXRoaXMubG9va3NMaWtlSW1hZ2VVcmwoaW1hZ2VVcmwpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiXHU4RkRDXHU3QTBCXHU5NEZFXHU2M0E1XHU0RTBEXHU2NjJGXHU1M0VGXHU4QkM2XHU1MjJCXHU3Njg0XHU1NkZFXHU3MjQ3XHU4RDQ0XHU2RTkwXHUzMDAyXCIsIFwiVGhlIHJlbW90ZSBVUkwgZG9lcyBub3QgbG9vayBsaWtlIGFuIGltYWdlIHJlc291cmNlLlwiKSk7XG4gICAgfVxuXG4gICAgY29uc3QgZmlsZU5hbWUgPSB0aGlzLmJ1aWxkUmVtb3RlU291cmNlRmlsZU5hbWUoaW1hZ2VVcmwsIGNvbnRlbnRUeXBlKTtcbiAgICBjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRoaXMucHJlcGFyZVVwbG9hZFBheWxvYWQoXG4gICAgICByZXNwb25zZS5hcnJheUJ1ZmZlcixcbiAgICAgIHRoaXMubm9ybWFsaXplSW1hZ2VNaW1lVHlwZShjb250ZW50VHlwZSwgZmlsZU5hbWUpLFxuICAgICAgZmlsZU5hbWUsXG4gICAgKTtcbiAgICBjb25zdCByZW1vdGVOYW1lID0gYXdhaXQgdGhpcy5idWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeShwcmVwYXJlZC5maWxlTmFtZSwgcHJlcGFyZWQuYmluYXJ5KTtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5idWlsZFJlbW90ZVBhdGgocmVtb3RlTmFtZSk7XG4gICAgYXdhaXQgdGhpcy51cGxvYWRCaW5hcnkocmVtb3RlUGF0aCwgcHJlcGFyZWQuYmluYXJ5LCBwcmVwYXJlZC5taW1lVHlwZSk7XG4gICAgY29uc3QgcmVtb3RlVXJsID0gYCR7U0VDVVJFX1BST1RPQ09MfS8vJHtyZW1vdGVQYXRofWA7XG4gICAgdXBsb2FkQ2FjaGU/LnNldChjYWNoZUtleSwgcmVtb3RlVXJsKTtcbiAgICByZXR1cm4gcmVtb3RlVXJsO1xuICB9XG5cbiAgcHJpdmF0ZSBpc0ltYWdlQ29udGVudFR5cGUoY29udGVudFR5cGU6IHN0cmluZykge1xuICAgIHJldHVybiAvXmltYWdlXFwvL2kudGVzdChjb250ZW50VHlwZS50cmltKCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBsb29rc0xpa2VJbWFnZVVybChyYXdVcmw6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJhd1VybCk7XG4gICAgICByZXR1cm4gL1xcLihwbmd8anBlP2d8Z2lmfHdlYnB8Ym1wfHN2ZykkL2kudGVzdCh1cmwucGF0aG5hbWUpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRSZW1vdGVTb3VyY2VGaWxlTmFtZShyYXdVcmw6IHN0cmluZywgY29udGVudFR5cGU6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJhd1VybCk7XG4gICAgICBjb25zdCBjYW5kaWRhdGUgPSB0aGlzLnNhbml0aXplRmlsZU5hbWUodXJsLnBhdGhuYW1lLnNwbGl0KFwiL1wiKS5wb3AoKSB8fCBcIlwiKTtcbiAgICAgIGlmIChjYW5kaWRhdGUgJiYgL1xcLlthLXowLTldKyQvaS50ZXN0KGNhbmRpZGF0ZSkpIHtcbiAgICAgICAgcmV0dXJuIGNhbmRpZGF0ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZXh0ZW5zaW9uID0gdGhpcy5nZXRFeHRlbnNpb25Gcm9tTWltZVR5cGUoY29udGVudFR5cGUpIHx8IFwicG5nXCI7XG4gICAgICByZXR1cm4gY2FuZGlkYXRlID8gYCR7Y2FuZGlkYXRlfS4ke2V4dGVuc2lvbn1gIDogYHJlbW90ZS1pbWFnZS4ke2V4dGVuc2lvbn1gO1xuICAgIH0gY2F0Y2gge1xuICAgICAgY29uc3QgZXh0ZW5zaW9uID0gdGhpcy5nZXRFeHRlbnNpb25Gcm9tTWltZVR5cGUoY29udGVudFR5cGUpIHx8IFwicG5nXCI7XG4gICAgICByZXR1cm4gYHJlbW90ZS1pbWFnZS4ke2V4dGVuc2lvbn1gO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgc2FuaXRpemVGaWxlTmFtZShmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGZpbGVOYW1lLnJlcGxhY2UoL1tcXFxcLzoqP1wiPD58XSsvZywgXCItXCIpLnRyaW0oKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0RXh0ZW5zaW9uRnJvbU1pbWVUeXBlKGNvbnRlbnRUeXBlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtaW1lVHlwZSA9IGNvbnRlbnRUeXBlLnNwbGl0KFwiO1wiKVswXS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBzd2l0Y2ggKG1pbWVUeXBlKSB7XG4gICAgICBjYXNlIFwiaW1hZ2UvanBlZ1wiOlxuICAgICAgICByZXR1cm4gXCJqcGdcIjtcbiAgICAgIGNhc2UgXCJpbWFnZS9wbmdcIjpcbiAgICAgICAgcmV0dXJuIFwicG5nXCI7XG4gICAgICBjYXNlIFwiaW1hZ2UvZ2lmXCI6XG4gICAgICAgIHJldHVybiBcImdpZlwiO1xuICAgICAgY2FzZSBcImltYWdlL3dlYnBcIjpcbiAgICAgICAgcmV0dXJuIFwid2VicFwiO1xuICAgICAgY2FzZSBcImltYWdlL2JtcFwiOlxuICAgICAgICByZXR1cm4gXCJibXBcIjtcbiAgICAgIGNhc2UgXCJpbWFnZS9zdmcreG1sXCI6XG4gICAgICAgIHJldHVybiBcInN2Z1wiO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVJbWFnZU1pbWVUeXBlKGNvbnRlbnRUeXBlOiBzdHJpbmcsIGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtaW1lVHlwZSA9IGNvbnRlbnRUeXBlLnNwbGl0KFwiO1wiKVswXS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAobWltZVR5cGUgJiYgbWltZVR5cGUgIT09IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCIpIHtcbiAgICAgIHJldHVybiBtaW1lVHlwZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5nZXRNaW1lVHlwZUZyb21GaWxlTmFtZShmaWxlTmFtZSk7XG4gIH1cblxyXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkQmluYXJ5KHJlbW90ZVBhdGg6IHN0cmluZywgYmluYXJ5OiBBcnJheUJ1ZmZlciwgbWltZVR5cGU6IHN0cmluZykge1xuICAgIGF3YWl0IHRoaXMuZW5zdXJlUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlUGF0aCk7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIlBVVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBtaW1lVHlwZSxcclxuICAgICAgfSxcclxuICAgICAgYm9keTogYmluYXJ5LFxyXG4gICAgfSk7XHJcblxyXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFVwbG9hZCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVFZGl0b3JQYXN0ZShldnQ6IENsaXBib2FyZEV2ZW50LCBlZGl0b3I6IEVkaXRvciwgaW5mbzogTWFya2Rvd25WaWV3IHwgTWFya2Rvd25GaWxlSW5mbykge1xuICAgIGlmIChldnQuZGVmYXVsdFByZXZlbnRlZCB8fCAhaW5mby5maWxlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaW1hZ2VGaWxlID0gdGhpcy5leHRyYWN0SW1hZ2VGaWxlRnJvbUNsaXBib2FyZChldnQpO1xuICAgIGlmIChpbWFnZUZpbGUpIHtcbiAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgY29uc3QgZmlsZU5hbWUgPSBpbWFnZUZpbGUubmFtZSB8fCB0aGlzLmJ1aWxkQ2xpcGJvYXJkRmlsZU5hbWUoaW1hZ2VGaWxlLnR5cGUpO1xuICAgICAgYXdhaXQgdGhpcy5lbnF1ZXVlRWRpdG9ySW1hZ2VVcGxvYWQoaW5mby5maWxlLCBlZGl0b3IsIGltYWdlRmlsZSwgZmlsZU5hbWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGh0bWwgPSBldnQuY2xpcGJvYXJkRGF0YT8uZ2V0RGF0YShcInRleHQvaHRtbFwiKT8udHJpbSgpID8/IFwiXCI7XG4gICAgaWYgKCFodG1sIHx8ICF0aGlzLmh0bWxDb250YWluc1JlbW90ZUltYWdlcyhodG1sKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGF3YWl0IHRoaXMuaGFuZGxlSHRtbFBhc3RlV2l0aFJlbW90ZUltYWdlcyhpbmZvLmZpbGUsIGVkaXRvciwgaHRtbCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUVkaXRvckRyb3AoZXZ0OiBEcmFnRXZlbnQsIGVkaXRvcjogRWRpdG9yLCBpbmZvOiBNYXJrZG93blZpZXcgfCBNYXJrZG93bkZpbGVJbmZvKSB7XG4gICAgaWYgKGV2dC5kZWZhdWx0UHJldmVudGVkIHx8ICFpbmZvLmZpbGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbWFnZUZpbGUgPSB0aGlzLmV4dHJhY3RJbWFnZUZpbGVGcm9tRHJvcChldnQpO1xuICAgIGlmICghaW1hZ2VGaWxlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3QgZmlsZU5hbWUgPSBpbWFnZUZpbGUubmFtZSB8fCB0aGlzLmJ1aWxkQ2xpcGJvYXJkRmlsZU5hbWUoaW1hZ2VGaWxlLnR5cGUpO1xuICAgIGF3YWl0IHRoaXMuZW5xdWV1ZUVkaXRvckltYWdlVXBsb2FkKGluZm8uZmlsZSwgZWRpdG9yLCBpbWFnZUZpbGUsIGZpbGVOYW1lKTtcbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdEltYWdlRmlsZUZyb21DbGlwYm9hcmQoZXZ0OiBDbGlwYm9hcmRFdmVudCkge1xuICAgIGNvbnN0IGRpcmVjdCA9IEFycmF5LmZyb20oZXZ0LmNsaXBib2FyZERhdGE/LmZpbGVzID8/IFtdKS5maW5kKChmaWxlKSA9PiBmaWxlLnR5cGUuc3RhcnRzV2l0aChcImltYWdlL1wiKSk7XG4gICAgaWYgKGRpcmVjdCkge1xuICAgICAgcmV0dXJuIGRpcmVjdDtcbiAgICB9XG5cbiAgICBjb25zdCBpdGVtID0gQXJyYXkuZnJvbShldnQuY2xpcGJvYXJkRGF0YT8uaXRlbXMgPz8gW10pLmZpbmQoKGVudHJ5KSA9PiBlbnRyeS50eXBlLnN0YXJ0c1dpdGgoXCJpbWFnZS9cIikpO1xuICAgIHJldHVybiBpdGVtPy5nZXRBc0ZpbGUoKSA/PyBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBodG1sQ29udGFpbnNSZW1vdGVJbWFnZXMoaHRtbDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIC88aW1nXFxiW14+XSpzcmM9W1wiJ11odHRwcz86XFwvXFwvW15cIiddK1tcIiddW14+XSo+L2kudGVzdChodG1sKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlSHRtbFBhc3RlV2l0aFJlbW90ZUltYWdlcyhub3RlRmlsZTogVEZpbGUsIGVkaXRvcjogRWRpdG9yLCBodG1sOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVuZGVyZWQgPSBhd2FpdCB0aGlzLmNvbnZlcnRIdG1sQ2xpcGJvYXJkVG9TZWN1cmVNYXJrZG93bihodG1sLCBub3RlRmlsZSk7XG4gICAgICBpZiAoIXJlbmRlcmVkLnRyaW0oKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGVkaXRvci5yZXBsYWNlU2VsZWN0aW9uKHJlbmRlcmVkKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1REYyXHU1QzA2XHU3RjUxXHU5ODc1XHU1NkZFXHU2NTg3XHU3Qzk4XHU4RDM0XHU1RTc2XHU2MjkzXHU1M0Q2XHU4RkRDXHU3QTBCXHU1NkZFXHU3MjQ3XHUzMDAyXCIsIFwiUGFzdGVkIHdlYiBjb250ZW50IGFuZCBjYXB0dXJlZCByZW1vdGUgaW1hZ2VzLlwiKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcGFzdGUgSFRNTCBjb250ZW50IHdpdGggcmVtb3RlIGltYWdlc1wiLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKFxuICAgICAgICB0aGlzLmRlc2NyaWJlRXJyb3IoXG4gICAgICAgICAgdGhpcy50KFwiXHU1OTA0XHU3NDA2XHU3RjUxXHU5ODc1XHU1NkZFXHU2NTg3XHU3Qzk4XHU4RDM0XHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIHByb2Nlc3MgcGFzdGVkIHdlYiBjb250ZW50XCIpLFxuICAgICAgICAgIGVycm9yLFxuICAgICAgICApLFxuICAgICAgICA4MDAwLFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNvbnZlcnRIdG1sQ2xpcGJvYXJkVG9TZWN1cmVNYXJrZG93bihodG1sOiBzdHJpbmcsIG5vdGVGaWxlOiBURmlsZSkge1xuICAgIGNvbnN0IHBhcnNlciA9IG5ldyBET01QYXJzZXIoKTtcbiAgICBjb25zdCBkb2N1bWVudCA9IHBhcnNlci5wYXJzZUZyb21TdHJpbmcoaHRtbCwgXCJ0ZXh0L2h0bWxcIik7XG4gICAgY29uc3QgdXBsb2FkQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgIGNvbnN0IHJlbmRlcmVkQmxvY2tzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBub2RlIG9mIEFycmF5LmZyb20oZG9jdW1lbnQuYm9keS5jaGlsZE5vZGVzKSkge1xuICAgICAgY29uc3QgYmxvY2sgPSBhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxOb2RlKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgMCk7XG4gICAgICBpZiAoYmxvY2sudHJpbSgpKSB7XG4gICAgICAgIHJlbmRlcmVkQmxvY2tzLnB1c2goYmxvY2sudHJpbSgpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVuZGVyZWRCbG9ja3Muam9pbihcIlxcblxcblwiKSArIFwiXFxuXCI7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlbmRlclBhc3RlZEh0bWxOb2RlKFxuICAgIG5vZGU6IE5vZGUsXG4gICAgbm90ZUZpbGU6IFRGaWxlLFxuICAgIHVwbG9hZENhY2hlOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuICAgIGxpc3REZXB0aDogbnVtYmVyLFxuICApOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSkge1xuICAgICAgcmV0dXJuIHRoaXMubm9ybWFsaXplQ2xpcGJvYXJkVGV4dChub2RlLnRleHRDb250ZW50ID8/IFwiXCIpO1xuICAgIH1cblxuICAgIGlmICghKG5vZGUgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkpIHtcbiAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cblxuICAgIGNvbnN0IHRhZyA9IG5vZGUudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmICh0YWcgPT09IFwiaW1nXCIpIHtcbiAgICAgIGNvbnN0IHNyYyA9IHRoaXMudW5lc2NhcGVIdG1sKG5vZGUuZ2V0QXR0cmlidXRlKFwic3JjXCIpPy50cmltKCkgPz8gXCJcIik7XG4gICAgICBpZiAoIXRoaXMuaXNIdHRwVXJsKHNyYykpIHtcbiAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFsdCA9IChub2RlLmdldEF0dHJpYnV0ZShcImFsdFwiKSA/PyBcIlwiKS50cmltKCkgfHwgdGhpcy5nZXREaXNwbGF5TmFtZUZyb21Vcmwoc3JjKTtcbiAgICAgIGNvbnN0IHJlbW90ZVVybCA9IGF3YWl0IHRoaXMudXBsb2FkUmVtb3RlSW1hZ2VVcmwoc3JjLCB1cGxvYWRDYWNoZSk7XG4gICAgICByZXR1cm4gdGhpcy5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgYWx0KTtcbiAgICB9XG5cbiAgICBpZiAodGFnID09PSBcImJyXCIpIHtcbiAgICAgIHJldHVybiBcIlxcblwiO1xuICAgIH1cblxuICAgIGlmICh0YWcgPT09IFwidWxcIiB8fCB0YWcgPT09IFwib2xcIikge1xuICAgICAgY29uc3QgaXRlbXM6IHN0cmluZ1tdID0gW107XG4gICAgICBsZXQgaW5kZXggPSAxO1xuICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKG5vZGUuY2hpbGRyZW4pKSB7XG4gICAgICAgIGlmIChjaGlsZC50YWdOYW1lLnRvTG93ZXJDYXNlKCkgIT09IFwibGlcIikge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVuZGVyZWQgPSAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sTm9kZShjaGlsZCwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGggKyAxKSkudHJpbSgpO1xuICAgICAgICBpZiAoIXJlbmRlcmVkKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwcmVmaXggPSB0YWcgPT09IFwib2xcIiA/IGAke2luZGV4fS4gYCA6IFwiLSBcIjtcbiAgICAgICAgaXRlbXMucHVzaChgJHtcIiAgXCIucmVwZWF0KE1hdGgubWF4KDAsIGxpc3REZXB0aCkpfSR7cHJlZml4fSR7cmVuZGVyZWR9YCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBpdGVtcy5qb2luKFwiXFxuXCIpO1xuICAgIH1cblxuICAgIGlmICh0YWcgPT09IFwibGlcIikge1xuICAgICAgY29uc3QgcGFydHMgPSBhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCk7XG4gICAgICByZXR1cm4gcGFydHMuam9pbihcIlwiKS50cmltKCk7XG4gICAgfVxuXG4gICAgaWYgKC9eaFsxLTZdJC8udGVzdCh0YWcpKSB7XG4gICAgICBjb25zdCBsZXZlbCA9IE51bWJlci5wYXJzZUludCh0YWdbMV0sIDEwKTtcbiAgICAgIGNvbnN0IHRleHQgPSAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpLnRyaW0oKTtcbiAgICAgIHJldHVybiB0ZXh0ID8gYCR7XCIjXCIucmVwZWF0KGxldmVsKX0gJHt0ZXh0fWAgOiBcIlwiO1xuICAgIH1cblxuICAgIGlmICh0YWcgPT09IFwiYVwiKSB7XG4gICAgICBjb25zdCBocmVmID0gbm9kZS5nZXRBdHRyaWJ1dGUoXCJocmVmXCIpPy50cmltKCkgPz8gXCJcIjtcbiAgICAgIGNvbnN0IHRleHQgPSAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpLnRyaW0oKTtcbiAgICAgIGlmIChocmVmICYmIC9eaHR0cHM/OlxcL1xcLy9pLnRlc3QoaHJlZikgJiYgdGV4dCkge1xuICAgICAgICByZXR1cm4gYFske3RleHR9XSgke2hyZWZ9KWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGV4dDtcbiAgICB9XG5cbiAgICBjb25zdCBpbmxpbmVUYWdzID0gbmV3IFNldChbXCJzdHJvbmdcIiwgXCJiXCIsIFwiZW1cIiwgXCJpXCIsIFwic3BhblwiLCBcImNvZGVcIiwgXCJzbWFsbFwiLCBcInN1cFwiLCBcInN1YlwiXSk7XG4gICAgaWYgKGlubGluZVRhZ3MuaGFzKHRhZykpIHtcbiAgICAgIHJldHVybiAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IGJsb2NrVGFncyA9IG5ldyBTZXQoW1xuICAgICAgXCJwXCIsXG4gICAgICBcImRpdlwiLFxuICAgICAgXCJhcnRpY2xlXCIsXG4gICAgICBcInNlY3Rpb25cIixcbiAgICAgIFwiZmlndXJlXCIsXG4gICAgICBcImZpZ2NhcHRpb25cIixcbiAgICAgIFwiYmxvY2txdW90ZVwiLFxuICAgICAgXCJwcmVcIixcbiAgICAgIFwidGFibGVcIixcbiAgICAgIFwidGhlYWRcIixcbiAgICAgIFwidGJvZHlcIixcbiAgICAgIFwidHJcIixcbiAgICAgIFwidGRcIixcbiAgICAgIFwidGhcIixcbiAgICBdKTtcbiAgICBpZiAoYmxvY2tUYWdzLmhhcyh0YWcpKSB7XG4gICAgICBjb25zdCB0ZXh0ID0gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKSkuam9pbihcIlwiKS50cmltKCk7XG4gICAgICByZXR1cm4gdGV4dDtcbiAgICB9XG5cbiAgICByZXR1cm4gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKSkuam9pbihcIlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKFxuICAgIGVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuICAgIG5vdGVGaWxlOiBURmlsZSxcbiAgICB1cGxvYWRDYWNoZTogTWFwPHN0cmluZywgc3RyaW5nPixcbiAgICBsaXN0RGVwdGg6IG51bWJlcixcbiAgKSB7XG4gICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKGVsZW1lbnQuY2hpbGROb2RlcykpIHtcbiAgICAgIGNvbnN0IHJlbmRlcmVkID0gYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sTm9kZShjaGlsZCwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpO1xuICAgICAgaWYgKCFyZW5kZXJlZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDAgJiYgIXJlbmRlcmVkLnN0YXJ0c1dpdGgoXCJcXG5cIikgJiYgIXBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdLmVuZHNXaXRoKFwiXFxuXCIpKSB7XG4gICAgICAgIGNvbnN0IHByZXZpb3VzID0gcGFydHNbcGFydHMubGVuZ3RoIC0gMV07XG4gICAgICAgIGNvbnN0IG5lZWRzU3BhY2UgPSAvXFxTJC8udGVzdChwcmV2aW91cykgJiYgL15cXFMvLnRlc3QocmVuZGVyZWQpO1xuICAgICAgICBpZiAobmVlZHNTcGFjZSkge1xuICAgICAgICAgIHBhcnRzLnB1c2goXCIgXCIpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHBhcnRzLnB1c2gocmVuZGVyZWQpO1xuICAgIH1cblxuICAgIHJldHVybiBwYXJ0cztcbiAgfVxuXG4gIHByaXZhdGUgbm9ybWFsaXplQ2xpcGJvYXJkVGV4dCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1xccysvZywgXCIgXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRyYWN0SW1hZ2VGaWxlRnJvbURyb3AoZXZ0OiBEcmFnRXZlbnQpIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShldnQuZGF0YVRyYW5zZmVyPy5maWxlcyA/PyBbXSkuZmluZCgoZmlsZSkgPT4gZmlsZS50eXBlLnN0YXJ0c1dpdGgoXCJpbWFnZS9cIikpID8/IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGVucXVldWVFZGl0b3JJbWFnZVVwbG9hZChub3RlRmlsZTogVEZpbGUsIGVkaXRvcjogRWRpdG9yLCBpbWFnZUZpbGU6IEZpbGUsIGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgYXJyYXlCdWZmZXIgPSBhd2FpdCBpbWFnZUZpbGUuYXJyYXlCdWZmZXIoKTtcbiAgICAgIGNvbnN0IHRhc2sgPSB0aGlzLmNyZWF0ZVVwbG9hZFRhc2soXG4gICAgICAgIG5vdGVGaWxlLnBhdGgsXG4gICAgICAgIGFycmF5QnVmZmVyLFxuICAgICAgICBpbWFnZUZpbGUudHlwZSB8fCB0aGlzLmdldE1pbWVUeXBlRnJvbUZpbGVOYW1lKGZpbGVOYW1lKSxcbiAgICAgICAgZmlsZU5hbWUsXG4gICAgICApO1xuICAgICAgdGhpcy5pbnNlcnRQbGFjZWhvbGRlcihlZGl0b3IsIHRhc2sucGxhY2Vob2xkZXIpO1xuICAgICAgdGhpcy5xdWV1ZS5wdXNoKHRhc2spO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIHZvaWQgdGhpcy5wcm9jZXNzUGVuZGluZ1Rhc2tzKCk7XG4gICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NURGMlx1NTJBMFx1NTE2NVx1NTZGRVx1NzI0N1x1ODFFQVx1NTJBOFx1NEUwQVx1NEYyMFx1OTYxRlx1NTIxN1x1MzAwMlwiLCBcIkltYWdlIGFkZGVkIHRvIHRoZSBhdXRvLXVwbG9hZCBxdWV1ZS5cIikpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHF1ZXVlIHNlY3VyZSBpbWFnZSB1cGxvYWRcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU1MkEwXHU1MTY1XHU1NkZFXHU3MjQ3XHU4MUVBXHU1MkE4XHU0RTBBXHU0RjIwXHU5NjFGXHU1MjE3XHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIHF1ZXVlIGltYWdlIGZvciBhdXRvLXVwbG9hZFwiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVVwbG9hZFRhc2sobm90ZVBhdGg6IHN0cmluZywgYmluYXJ5OiBBcnJheUJ1ZmZlciwgbWltZVR5cGU6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZyk6IFVwbG9hZFRhc2sge1xuICAgIGNvbnN0IGlkID0gYHNlY3VyZS13ZWJkYXYtdGFzay0ke0RhdGUubm93KCl9LSR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMiwgOCl9YDtcbiAgICByZXR1cm4ge1xuICAgICAgaWQsXG4gICAgICBub3RlUGF0aCxcbiAgICAgIHBsYWNlaG9sZGVyOiB0aGlzLmJ1aWxkUGVuZGluZ1BsYWNlaG9sZGVyKGlkLCBmaWxlTmFtZSksXG4gICAgICBtaW1lVHlwZSxcbiAgICAgIGZpbGVOYW1lLFxuICAgICAgZGF0YUJhc2U2NDogdGhpcy5hcnJheUJ1ZmZlclRvQmFzZTY0KGJpbmFyeSksXG4gICAgICBhdHRlbXB0czogMCxcbiAgICAgIGNyZWF0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZFBlbmRpbmdQbGFjZWhvbGRlcih0YXNrSWQ6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHNhZmVOYW1lID0gdGhpcy5lc2NhcGVIdG1sKGZpbGVOYW1lKTtcbiAgICByZXR1cm4gYDxzcGFuIGNsYXNzPVwic2VjdXJlLXdlYmRhdi1wZW5kaW5nXCIgZGF0YS1zZWN1cmUtd2ViZGF2LXRhc2s9XCIke3Rhc2tJZH1cIiBhcmlhLWxhYmVsPVwiJHtzYWZlTmFtZX1cIj4ke3RoaXMuZXNjYXBlSHRtbCh0aGlzLnQoYFx1MzAxMFx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NEUyRFx1RkY1QyR7ZmlsZU5hbWV9XHUzMDExYCwgYFtVcGxvYWRpbmcgaW1hZ2UgfCAke2ZpbGVOYW1lfV1gKSl9PC9zcGFuPmA7XG4gIH1cblxuICBwcml2YXRlIGluc2VydFBsYWNlaG9sZGVyKGVkaXRvcjogRWRpdG9yLCBwbGFjZWhvbGRlcjogc3RyaW5nKSB7XG4gICAgZWRpdG9yLnJlcGxhY2VTZWxlY3Rpb24oYCR7cGxhY2Vob2xkZXJ9XFxuYCk7XG4gIH1cblxuICBhc3luYyBzeW5jQ29uZmlndXJlZFZhdWx0Q29udGVudChzaG93Tm90aWNlID0gdHJ1ZSkge1xuICAgIGlmICh0aGlzLnN5bmNJblByb2dyZXNzKSB7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NTQwQ1x1NkI2NVx1NkI2M1x1NTcyOFx1OEZEQlx1ODg0Q1x1NEUyRFx1MzAwMlwiLCBcIkEgc3luYyBpcyBhbHJlYWR5IGluIHByb2dyZXNzLlwiKSwgNDAwMCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zeW5jSW5Qcm9ncmVzcyA9IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xuICAgICAgY29uc3QgdXBsb2Fkc1JlYWR5ID0gYXdhaXQgdGhpcy5wcmVwYXJlUGVuZGluZ1VwbG9hZHNGb3JTeW5jKHNob3dOb3RpY2UpO1xuICAgICAgaWYgKCF1cGxvYWRzUmVhZHkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgYXdhaXQgdGhpcy5yZWJ1aWxkUmVmZXJlbmNlSW5kZXgoKTtcblxuICAgICAgY29uc3QgcmVtb3RlSW52ZW50b3J5ID0gYXdhaXQgdGhpcy5saXN0UmVtb3RlVHJlZSh0aGlzLnNldHRpbmdzLnZhdWx0U3luY1JlbW90ZUZvbGRlcik7XG4gICAgICBjb25zdCBkZWxldGlvblRvbWJzdG9uZXMgPSBhd2FpdCB0aGlzLnJlYWREZWxldGlvblRvbWJzdG9uZXMoKTtcbiAgICAgIGNvbnN0IHJlbW90ZUZpbGVzID0gcmVtb3RlSW52ZW50b3J5LmZpbGVzO1xuICAgICAgbGV0IHJlc3RvcmVkRnJvbVJlbW90ZSA9IDA7XG4gICAgICBsZXQgZGVsZXRlZFJlbW90ZUZpbGVzID0gMDtcbiAgICAgIGxldCBkZWxldGVkTG9jYWxGaWxlcyA9IDA7XG4gICAgICBsZXQgZGVsZXRlZExvY2FsU3R1YnMgPSAwO1xuXG4gICAgICBsZXQgZmlsZXMgPSB0aGlzLmNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpO1xuICAgICAgbGV0IGN1cnJlbnRQYXRocyA9IG5ldyBTZXQoZmlsZXMubWFwKChmaWxlKSA9PiBmaWxlLnBhdGgpKTtcbiAgICAgIGZvciAoY29uc3QgcGF0aCBvZiBbLi4udGhpcy5zeW5jSW5kZXgua2V5cygpXSkge1xuICAgICAgICBpZiAoIWN1cnJlbnRQYXRocy5oYXMocGF0aCkpIHtcbiAgICAgICAgICBjb25zdCBwcmV2aW91cyA9IHRoaXMuc3luY0luZGV4LmdldChwYXRoKTtcbiAgICAgICAgICBpZiAoIXByZXZpb3VzKSB7XG4gICAgICAgICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUocGF0aCk7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCByZW1vdGUgPSByZW1vdGVGaWxlcy5nZXQocHJldmlvdXMucmVtb3RlUGF0aCk7XG4gICAgICAgICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShwYXRoKTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHRvbWJzdG9uZSA9IGRlbGV0aW9uVG9tYnN0b25lcy5nZXQocGF0aCk7XG4gICAgICAgICAgaWYgKHRvbWJzdG9uZSAmJiB0aGlzLmlzVG9tYnN0b25lQXV0aG9yaXRhdGl2ZSh0b21ic3RvbmUsIHJlbW90ZSkpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlQ29udGVudEZpbGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICAgICAgcmVtb3RlRmlsZXMuZGVsZXRlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShwYXRoKTtcbiAgICAgICAgICAgIGRlbGV0ZWRSZW1vdGVGaWxlcyArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHRvbWJzdG9uZSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShwYXRoKTtcbiAgICAgICAgICAgIGRlbGV0aW9uVG9tYnN0b25lcy5kZWxldGUocGF0aCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHByZXZpb3VzLnJlbW90ZVNpZ25hdHVyZSAmJiBwcmV2aW91cy5yZW1vdGVTaWduYXR1cmUgIT09IHJlbW90ZS5zaWduYXR1cmUpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuZG93bmxvYWRSZW1vdGVGaWxlVG9WYXVsdChwYXRoLCByZW1vdGUpO1xuICAgICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KHBhdGgsIHtcbiAgICAgICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICAgICAgcmVtb3RlUGF0aDogcmVtb3RlLnJlbW90ZVBhdGgsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJlc3RvcmVkRnJvbVJlbW90ZSArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KHBhdGgsIHJlbW90ZSk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KHBhdGgsIHtcbiAgICAgICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlUGF0aDogcmVtb3RlLnJlbW90ZVBhdGgsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmVzdG9yZWRGcm9tUmVtb3RlICs9IDE7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbGV0IHVwbG9hZGVkID0gMDtcbiAgICAgIGxldCBza2lwcGVkID0gMDtcbiAgICAgIGxldCBtaXNzaW5nUmVtb3RlQmFja2VkTm90ZXMgPSAwO1xuICAgICAgbGV0IHB1cmdlZE1pc3NpbmdMYXp5Tm90ZXMgPSAwO1xuXG4gICAgICBmaWxlcyA9IHRoaXMuY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCk7XG4gICAgICBjdXJyZW50UGF0aHMgPSBuZXcgU2V0KGZpbGVzLm1hcCgoZmlsZSkgPT4gZmlsZS5wYXRoKSk7XG4gICAgICBmb3IgKGNvbnN0IHJlbW90ZSBvZiBbLi4ucmVtb3RlRmlsZXMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEucmVtb3RlUGF0aC5sb2NhbGVDb21wYXJlKGIucmVtb3RlUGF0aCkpKSB7XG4gICAgICAgIGNvbnN0IHZhdWx0UGF0aCA9IHRoaXMucmVtb3RlUGF0aFRvVmF1bHRQYXRoKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgaWYgKCF2YXVsdFBhdGggfHwgY3VycmVudFBhdGhzLmhhcyh2YXVsdFBhdGgpKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldCh2YXVsdFBhdGgpO1xuICAgICAgaWYgKHRvbWJzdG9uZSkge1xuICAgICAgICBpZiAodGhpcy5pc1RvbWJzdG9uZUF1dGhvcml0YXRpdmUodG9tYnN0b25lLCByZW1vdGUpKSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgICAgcmVtb3RlRmlsZXMuZGVsZXRlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICBkZWxldGVkUmVtb3RlRmlsZXMgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUodmF1bHRQYXRoKTtcbiAgICAgICAgZGVsZXRpb25Ub21ic3RvbmVzLmRlbGV0ZSh2YXVsdFBhdGgpO1xuICAgICAgfVxuXG4gICAgICAgIGF3YWl0IHRoaXMuZG93bmxvYWRSZW1vdGVGaWxlVG9WYXVsdCh2YXVsdFBhdGgsIHJlbW90ZSk7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LnNldCh2YXVsdFBhdGgsIHtcbiAgICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlUGF0aDogcmVtb3RlLnJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICByZXN0b3JlZEZyb21SZW1vdGUgKz0gMTtcbiAgICAgIH1cblxuICAgICAgZmlsZXMgPSB0aGlzLmNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpO1xuICAgICAgY3VycmVudFBhdGhzID0gbmV3IFNldChmaWxlcy5tYXAoKGZpbGUpID0+IGZpbGUucGF0aCkpO1xuICAgICAgY29uc3QgbG9jYWxSZW1vdGVQYXRocyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgICAgbGV0IGRvd25sb2FkZWRPclVwZGF0ZWQgPSAwO1xuICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aChmaWxlLnBhdGgpO1xuICAgICAgICBsb2NhbFJlbW90ZVBhdGhzLmFkZChyZW1vdGVQYXRoKTtcbiAgICAgICAgY29uc3QgcmVtb3RlID0gcmVtb3RlRmlsZXMuZ2V0KHJlbW90ZVBhdGgpO1xuICAgICAgICBjb25zdCByZW1vdGVTaWduYXR1cmUgPSByZW1vdGU/LnNpZ25hdHVyZSA/PyBcIlwiO1xuICAgICAgICBjb25zdCBwcmV2aW91cyA9IHRoaXMuc3luY0luZGV4LmdldChmaWxlLnBhdGgpO1xuICAgICAgICBjb25zdCBtYXJrZG93bkNvbnRlbnQgPSBmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiID8gYXdhaXQgdGhpcy5yZWFkTWFya2Rvd25Db250ZW50UHJlZmVyRWRpdG9yKGZpbGUpIDogbnVsbDtcbiAgICAgICAgY29uc3QgbG9jYWxTaWduYXR1cmUgPSBhd2FpdCB0aGlzLmJ1aWxkQ3VycmVudExvY2FsU2lnbmF0dXJlKGZpbGUsIG1hcmtkb3duQ29udGVudCA/PyB1bmRlZmluZWQpO1xuXG4gICAgICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICAgICAgY29uc3Qgc3R1YiA9IHRoaXMucGFyc2VOb3RlU3R1YihtYXJrZG93bkNvbnRlbnQgPz8gXCJcIik7XG4gICAgICAgICAgaWYgKHN0dWIpIHtcbiAgICAgICAgICAgIGNvbnN0IHN0dWJSZW1vdGUgPSByZW1vdGVGaWxlcy5nZXQoc3R1Yi5yZW1vdGVQYXRoKTtcbiAgICAgICAgICAgIGNvbnN0IHRvbWJzdG9uZSA9IGRlbGV0aW9uVG9tYnN0b25lcy5nZXQoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgIGlmICghc3R1YlJlbW90ZSAmJiB0b21ic3RvbmUpIHtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5yZW1vdmVMb2NhbFZhdWx0RmlsZShmaWxlKTtcbiAgICAgICAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICAgICAgICAgIHRoaXMuY2xlYXJNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgICAgICAgICBkZWxldGVkTG9jYWxGaWxlcyArPSAxO1xuICAgICAgICAgICAgICBkZWxldGVkTG9jYWxTdHVicyArPSAxO1xuICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghc3R1YlJlbW90ZSkge1xuICAgICAgICAgICAgICBjb25zdCBtaXNzaW5nUmVjb3JkID0gdGhpcy5tYXJrTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgICAgaWYgKG1pc3NpbmdSZWNvcmQubWlzc0NvdW50ID49IHRoaXMubWlzc2luZ0xhenlSZW1vdGVDb25maXJtYXRpb25zKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5yZW1vdmVMb2NhbFZhdWx0RmlsZShmaWxlKTtcbiAgICAgICAgICAgICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNsZWFyTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgICAgICBkZWxldGVkTG9jYWxGaWxlcyArPSAxO1xuICAgICAgICAgICAgICAgIGRlbGV0ZWRMb2NhbFN0dWJzICs9IDE7XG4gICAgICAgICAgICAgICAgcHVyZ2VkTWlzc2luZ0xhenlOb3RlcyArPSAxO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIG1pc3NpbmdSZW1vdGVCYWNrZWROb3RlcyArPSAxO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdGhpcy5jbGVhck1pc3NpbmdMYXp5UmVtb3RlKGZpbGUucGF0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHN0dWJSZW1vdGU/LnNpZ25hdHVyZSA/PyBwcmV2aW91cz8ucmVtb3RlU2lnbmF0dXJlID8/IFwiXCIsXG4gICAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNraXBwZWQgKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRvbWJzdG9uZSA9IGRlbGV0aW9uVG9tYnN0b25lcy5nZXQoZmlsZS5wYXRoKTtcbiAgICAgICAgY29uc3QgdW5jaGFuZ2VkU2luY2VMYXN0U3luYyA9IHByZXZpb3VzID8gcHJldmlvdXMubG9jYWxTaWduYXR1cmUgPT09IGxvY2FsU2lnbmF0dXJlIDogZmFsc2U7XG4gICAgICAgIGlmICh0b21ic3RvbmUpIHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICB1bmNoYW5nZWRTaW5jZUxhc3RTeW5jICYmXG4gICAgICAgICAgICB0aGlzLnNob3VsZERlbGV0ZUxvY2FsRnJvbVRvbWJzdG9uZShmaWxlLCB0b21ic3RvbmUpICYmXG4gICAgICAgICAgICB0aGlzLmlzVG9tYnN0b25lQXV0aG9yaXRhdGl2ZSh0b21ic3RvbmUsIHJlbW90ZSlcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucmVtb3ZlTG9jYWxWYXVsdEZpbGUoZmlsZSk7XG4gICAgICAgICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgIGRlbGV0ZWRMb2NhbEZpbGVzICs9IDE7XG4gICAgICAgICAgICBpZiAocmVtb3RlKSB7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlQ29udGVudEZpbGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICAgICAgICByZW1vdGVGaWxlcy5kZWxldGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICAgICAgICBkZWxldGVkUmVtb3RlRmlsZXMgKz0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgICBkZWxldGlvblRvbWJzdG9uZXMuZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgICAgIGNvbnN0IHVwbG9hZGVkUmVtb3RlID0gYXdhaXQgdGhpcy51cGxvYWRDb250ZW50RmlsZVRvUmVtb3RlKGZpbGUsIHJlbW90ZVBhdGgsIG1hcmtkb3duQ29udGVudCA/PyB1bmRlZmluZWQpO1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiB1cGxvYWRlZFJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJlbW90ZUZpbGVzLnNldChyZW1vdGVQYXRoLCB1cGxvYWRlZFJlbW90ZSk7XG4gICAgICAgICAgdXBsb2FkZWQgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghcHJldmlvdXMpIHtcbiAgICAgICAgICBpZiAobG9jYWxTaWduYXR1cmUgPT09IHJlbW90ZVNpZ25hdHVyZSkge1xuICAgICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCk7XG4gICAgICAgICAgICBza2lwcGVkICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAodGhpcy5zaG91bGREb3dubG9hZFJlbW90ZVZlcnNpb24oZmlsZS5zdGF0Lm10aW1lLCByZW1vdGUubGFzdE1vZGlmaWVkKSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KGZpbGUucGF0aCwgcmVtb3RlLCBmaWxlKTtcbiAgICAgICAgICAgIGNvbnN0IHJlZnJlc2hlZCA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZWZyZXNoZWQgPyBhd2FpdCB0aGlzLmJ1aWxkQ3VycmVudExvY2FsU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgZG93bmxvYWRlZE9yVXBkYXRlZCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCwgbWFya2Rvd25Db250ZW50ID8/IHVuZGVmaW5lZCk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmVtb3RlRmlsZXMuc2V0KHJlbW90ZVBhdGgsIHVwbG9hZGVkUmVtb3RlKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCk7XG4gICAgICAgICAgdXBsb2FkZWQgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGxvY2FsQ2hhbmdlZCA9IHByZXZpb3VzLmxvY2FsU2lnbmF0dXJlICE9PSBsb2NhbFNpZ25hdHVyZSB8fCBwcmV2aW91cy5yZW1vdGVQYXRoICE9PSByZW1vdGVQYXRoO1xuICAgICAgICBjb25zdCByZW1vdGVDaGFuZ2VkID0gcHJldmlvdXMucmVtb3RlU2lnbmF0dXJlICE9PSByZW1vdGVTaWduYXR1cmUgfHwgcHJldmlvdXMucmVtb3RlUGF0aCAhPT0gcmVtb3RlUGF0aDtcbiAgICAgICAgaWYgKCFsb2NhbENoYW5nZWQgJiYgIXJlbW90ZUNoYW5nZWQpIHtcbiAgICAgICAgICBza2lwcGVkICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWxvY2FsQ2hhbmdlZCAmJiByZW1vdGVDaGFuZ2VkKSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KGZpbGUucGF0aCwgcmVtb3RlLCBmaWxlKTtcbiAgICAgICAgICBjb25zdCByZWZyZXNoZWQgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChmaWxlLnBhdGgpO1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZWZyZXNoZWQgPyBhd2FpdCB0aGlzLmJ1aWxkQ3VycmVudExvY2FsU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGRvd25sb2FkZWRPclVwZGF0ZWQgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChsb2NhbENoYW5nZWQgJiYgIXJlbW90ZUNoYW5nZWQpIHtcbiAgICAgICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoLCBtYXJrZG93bkNvbnRlbnQgPz8gdW5kZWZpbmVkKTtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZW1vdGVGaWxlcy5zZXQocmVtb3RlUGF0aCwgdXBsb2FkZWRSZW1vdGUpO1xuICAgICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgICB1cGxvYWRlZCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuc2hvdWxkRG93bmxvYWRSZW1vdGVWZXJzaW9uKGZpbGUuc3RhdC5tdGltZSwgcmVtb3RlLmxhc3RNb2RpZmllZCkpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgICAgICAgIGNvbnN0IHJlZnJlc2hlZCA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUocmVmcmVzaGVkKSA6IHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgZG93bmxvYWRlZE9yVXBkYXRlZCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCwgbWFya2Rvd25Db250ZW50ID8/IHVuZGVmaW5lZCk7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICB9KTtcbiAgICAgICAgcmVtb3RlRmlsZXMuc2V0KHJlbW90ZVBhdGgsIHVwbG9hZGVkUmVtb3RlKTtcbiAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgICB1cGxvYWRlZCArPSAxO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBkZWxldGVkUmVtb3RlRGlyZWN0b3JpZXMgPSBhd2FpdCB0aGlzLmRlbGV0ZUV4dHJhUmVtb3RlRGlyZWN0b3JpZXMoXG4gICAgICAgIHJlbW90ZUludmVudG9yeS5kaXJlY3RvcmllcyxcbiAgICAgICAgdGhpcy5idWlsZEV4cGVjdGVkUmVtb3RlRGlyZWN0b3JpZXMobG9jYWxSZW1vdGVQYXRocywgdGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IGltYWdlQ2xlYW51cCA9IGF3YWl0IHRoaXMucmVjb25jaWxlUmVtb3RlSW1hZ2VzKCk7XG4gICAgICBjb25zdCBldmljdGVkTm90ZXMgPSBhd2FpdCB0aGlzLmV2aWN0U3RhbGVTeW5jZWROb3RlcyhmYWxzZSk7XG5cbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gRGF0ZS5ub3coKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9IHRoaXMudChcbiAgICAgICAgYFx1NURGMlx1NTNDQ1x1NTQxMVx1NTQwQ1x1NkI2NVx1RkYxQVx1NEUwQVx1NEYyMCAke3VwbG9hZGVkfSBcdTRFMkFcdTY1ODdcdTRFRjZcdUZGMENcdTRFQ0VcdThGRENcdTdBRUZcdTYyQzlcdTUzRDYgJHtyZXN0b3JlZEZyb21SZW1vdGUgKyBkb3dubG9hZGVkT3JVcGRhdGVkfSBcdTRFMkFcdTY1ODdcdTRFRjZcdUZGMENcdThERjNcdThGQzcgJHtza2lwcGVkfSBcdTRFMkFcdTY3MkFcdTUzRDhcdTUzMTZcdTY1ODdcdTRFRjZcdUZGMENcdTUyMjBcdTk2NjRcdThGRENcdTdBRUZcdTUxODVcdTVCQjkgJHtkZWxldGVkUmVtb3RlRmlsZXN9IFx1NEUyQVx1MzAwMVx1NjcyQ1x1NTczMFx1NTE4NVx1NUJCOSAke2RlbGV0ZWRMb2NhbEZpbGVzfSBcdTRFMkEke2RlbGV0ZWRMb2NhbFN0dWJzID4gMCA/IGBcdUZGMDhcdTUxNzZcdTRFMkRcdTU5MzFcdTY1NDhcdTUzNjBcdTRGNERcdTdCMTRcdThCQjAgJHtkZWxldGVkTG9jYWxTdHVic30gXHU3QkM3XHVGRjA5YCA6IFwiXCJ9XHVGRjBDXHU2RTA1XHU3NDA2XHU4RkRDXHU3QUVGXHU3QTdBXHU3NkVFXHU1RjU1ICR7ZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzfSBcdTRFMkFcdUZGMENcdTZFMDVcdTc0MDZcdTUxOTdcdTRGNTlcdTU2RkVcdTcyNDcgJHtpbWFnZUNsZWFudXAuZGVsZXRlZEZpbGVzfSBcdTVGMjBcdTMwMDFcdTc2RUVcdTVGNTUgJHtpbWFnZUNsZWFudXAuZGVsZXRlZERpcmVjdG9yaWVzfSBcdTRFMkEke2V2aWN0ZWROb3RlcyA+IDAgPyBgXHVGRjBDXHU1NkRFXHU2NTM2XHU2NzJDXHU1NzMwXHU2NUU3XHU3QjE0XHU4QkIwICR7ZXZpY3RlZE5vdGVzfSBcdTdCQzdgIDogXCJcIn0ke21pc3NpbmdSZW1vdGVCYWNrZWROb3RlcyA+IDAgPyBgXHVGRjBDXHU1RTc2XHU1M0QxXHU3M0IwICR7bWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzfSBcdTdCQzdcdTYzMDlcdTk3MDBcdTdCMTRcdThCQjBcdTdGM0FcdTVDMTFcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdgIDogXCJcIn0ke3B1cmdlZE1pc3NpbmdMYXp5Tm90ZXMgPiAwID8gYFx1RkYwQ1x1Nzg2RVx1OEJBNFx1NkUwNVx1NzQwNlx1NTkzMVx1NjU0OFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMCAke3B1cmdlZE1pc3NpbmdMYXp5Tm90ZXN9IFx1N0JDN2AgOiBcIlwifVx1MzAwMmAsXG4gICAgICAgIGBCaWRpcmVjdGlvbmFsIHN5bmMgdXBsb2FkZWQgJHt1cGxvYWRlZH0gZmlsZShzKSwgcHVsbGVkICR7cmVzdG9yZWRGcm9tUmVtb3RlICsgZG93bmxvYWRlZE9yVXBkYXRlZH0gZmlsZShzKSBmcm9tIHJlbW90ZSwgc2tpcHBlZCAke3NraXBwZWR9IHVuY2hhbmdlZCBmaWxlKHMpLCBkZWxldGVkICR7ZGVsZXRlZFJlbW90ZUZpbGVzfSByZW1vdGUgY29udGVudCBmaWxlKHMpIGFuZCAke2RlbGV0ZWRMb2NhbEZpbGVzfSBsb2NhbCBmaWxlKHMpJHtkZWxldGVkTG9jYWxTdHVicyA+IDAgPyBgIChpbmNsdWRpbmcgJHtkZWxldGVkTG9jYWxTdHVic30gc3RhbGUgc3R1YiBub3RlKHMpKWAgOiBcIlwifSwgcmVtb3ZlZCAke2RlbGV0ZWRSZW1vdGVEaXJlY3Rvcmllc30gcmVtb3RlIGRpcmVjdG9yJHtkZWxldGVkUmVtb3RlRGlyZWN0b3JpZXMgPT09IDEgPyBcInlcIiA6IFwiaWVzXCJ9LCBjbGVhbmVkICR7aW1hZ2VDbGVhbnVwLmRlbGV0ZWRGaWxlc30gb3JwaGFuZWQgcmVtb3RlIGltYWdlKHMpIHBsdXMgJHtpbWFnZUNsZWFudXAuZGVsZXRlZERpcmVjdG9yaWVzfSBkaXJlY3RvciR7aW1hZ2VDbGVhbnVwLmRlbGV0ZWREaXJlY3RvcmllcyA9PT0gMSA/IFwieVwiIDogXCJpZXNcIn0ke2V2aWN0ZWROb3RlcyA+IDAgPyBgLCBhbmQgZXZpY3RlZCAke2V2aWN0ZWROb3Rlc30gc3RhbGUgbG9jYWwgbm90ZShzKWAgOiBcIlwifSR7bWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzID4gMCA/IGAsIHdoaWxlIGRldGVjdGluZyAke21pc3NpbmdSZW1vdGVCYWNrZWROb3Rlc30gbGF6eSBub3RlKHMpIG1pc3NpbmcgdGhlaXIgcmVtb3RlIGNvbnRlbnRgIDogXCJcIn0ke3B1cmdlZE1pc3NpbmdMYXp5Tm90ZXMgPiAwID8gYCwgYW5kIHB1cmdlZCAke3B1cmdlZE1pc3NpbmdMYXp5Tm90ZXN9IGNvbmZpcm1lZCBicm9rZW4gbGF6eSBwbGFjZWhvbGRlcihzKWAgOiBcIlwifS5gLFxuICAgICAgKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cywgODAwMCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJWYXVsdCBjb250ZW50IHN5bmMgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gRGF0ZS5ub3coKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9IHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTUxODVcdTVCQjlcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIiwgXCJDb250ZW50IHN5bmMgZmFpbGVkXCIpLCBlcnJvcik7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsIDgwMDApO1xuICAgICAgfVxuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLnN5bmNJblByb2dyZXNzID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICAgIG1ldGhvZDogXCJERUxFVEVcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gNDA0ICYmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBERUxFVEUgZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGRlbGV0ZSByZW1vdGUgc3luY2VkIGNvbnRlbnRcIiwgcmVtb3RlUGF0aCwgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBidWlsZFJlbW90ZVN5bmNTaWduYXR1cmUocmVtb3RlOiBQaWNrPFJlbW90ZUZpbGVTdGF0ZSwgXCJsYXN0TW9kaWZpZWRcIiB8IFwic2l6ZVwiPikge1xuICAgIHJldHVybiBgJHtyZW1vdGUubGFzdE1vZGlmaWVkfToke3JlbW90ZS5zaXplfWA7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkRGVsZXRpb25Gb2xkZXIoKSB7XG4gICAgcmV0dXJuIGAke3RoaXMubm9ybWFsaXplRm9sZGVyKHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKS5yZXBsYWNlKC9cXC8kLywgXCJcIil9JHt0aGlzLmRlbGV0aW9uRm9sZGVyU3VmZml4fWA7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkRGVsZXRpb25SZW1vdGVQYXRoKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgZW5jb2RlZCA9IHRoaXMuYXJyYXlCdWZmZXJUb0Jhc2U2NCh0aGlzLmVuY29kZVV0ZjgodmF1bHRQYXRoKSlcbiAgICAgIC5yZXBsYWNlKC9cXCsvZywgXCItXCIpXG4gICAgICAucmVwbGFjZSgvXFwvL2csIFwiX1wiKVxuICAgICAgLnJlcGxhY2UoLz0rJC9nLCBcIlwiKTtcbiAgICByZXR1cm4gYCR7dGhpcy5idWlsZERlbGV0aW9uRm9sZGVyKCl9JHtlbmNvZGVkfS5qc29uYDtcbiAgfVxuXG4gIHByaXZhdGUgcGFyc2VEZWxldGlvblRvbWJzdG9uZUJhc2U2NCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IHZhbHVlLnJlcGxhY2UoLy0vZywgXCIrXCIpLnJlcGxhY2UoL18vZywgXCIvXCIpO1xuICAgIGNvbnN0IHBhZGRlZCA9IG5vcm1hbGl6ZWQgKyBcIj1cIi5yZXBlYXQoKDQgLSAobm9ybWFsaXplZC5sZW5ndGggJSA0IHx8IDQpKSAlIDQpO1xuICAgIHJldHVybiB0aGlzLmRlY29kZVV0ZjgodGhpcy5iYXNlNjRUb0FycmF5QnVmZmVyKHBhZGRlZCkpO1xuICB9XG5cbiAgcHJpdmF0ZSByZW1vdGVEZWxldGlvblBhdGhUb1ZhdWx0UGF0aChyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCByb290ID0gdGhpcy5idWlsZERlbGV0aW9uRm9sZGVyKCk7XG4gICAgaWYgKCFyZW1vdGVQYXRoLnN0YXJ0c1dpdGgocm9vdCkgfHwgIXJlbW90ZVBhdGguZW5kc1dpdGgoXCIuanNvblwiKSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgZW5jb2RlZCA9IHJlbW90ZVBhdGguc2xpY2Uocm9vdC5sZW5ndGgsIC1cIi5qc29uXCIubGVuZ3RoKTtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIHRoaXMucGFyc2VEZWxldGlvblRvbWJzdG9uZUJhc2U2NChlbmNvZGVkKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgd3JpdGVEZWxldGlvblRvbWJzdG9uZSh2YXVsdFBhdGg6IHN0cmluZywgcmVtb3RlU2lnbmF0dXJlPzogc3RyaW5nKSB7XG4gICAgY29uc3QgcGF5bG9hZDogRGVsZXRpb25Ub21ic3RvbmUgPSB7XG4gICAgICBwYXRoOiB2YXVsdFBhdGgsXG4gICAgICBkZWxldGVkQXQ6IERhdGUubm93KCksXG4gICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgfTtcbiAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShcbiAgICAgIHRoaXMuYnVpbGREZWxldGlvblJlbW90ZVBhdGgodmF1bHRQYXRoKSxcbiAgICAgIHRoaXMuZW5jb2RlVXRmOChKU09OLnN0cmluZ2lmeShwYXlsb2FkKSksXG4gICAgICBcImFwcGxpY2F0aW9uL2pzb247IGNoYXJzZXQ9dXRmLThcIixcbiAgICApO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVEZWxldGlvblRvbWJzdG9uZSh2YXVsdFBhdGg6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHRoaXMuYnVpbGREZWxldGlvblJlbW90ZVBhdGgodmF1bHRQYXRoKSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBUb21ic3RvbmUgY2xlYW51cCBzaG91bGQgbm90IGJyZWFrIHRoZSBtYWluIHN5bmMgZmxvdy5cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlYWREZWxldGlvblRvbWJzdG9uZSh2YXVsdFBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybCh0aGlzLmJ1aWxkRGVsZXRpb25SZW1vdGVQYXRoKHZhdWx0UGF0aCkpLFxuICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDQwNCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEdFVCB0b21ic3RvbmUgZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnBhcnNlRGVsZXRpb25Ub21ic3RvbmVQYXlsb2FkKHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlcikpO1xuICB9XG5cbiAgcHJpdmF0ZSBwYXJzZURlbGV0aW9uVG9tYnN0b25lUGF5bG9hZChyYXc6IHN0cmluZyk6IERlbGV0aW9uVG9tYnN0b25lIHwgbnVsbCB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyBQYXJ0aWFsPERlbGV0aW9uVG9tYnN0b25lPjtcbiAgICAgIGlmICghcGFyc2VkIHx8IHR5cGVvZiBwYXJzZWQucGF0aCAhPT0gXCJzdHJpbmdcIiB8fCB0eXBlb2YgcGFyc2VkLmRlbGV0ZWRBdCAhPT0gXCJudW1iZXJcIikge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIGlmIChwYXJzZWQucmVtb3RlU2lnbmF0dXJlICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIHBhcnNlZC5yZW1vdGVTaWduYXR1cmUgIT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICByZXR1cm4ge1xuICAgICAgICBwYXRoOiBwYXJzZWQucGF0aCxcbiAgICAgICAgZGVsZXRlZEF0OiBwYXJzZWQuZGVsZXRlZEF0LFxuICAgICAgICByZW1vdGVTaWduYXR1cmU6IHBhcnNlZC5yZW1vdGVTaWduYXR1cmUsXG4gICAgICB9O1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWFkRGVsZXRpb25Ub21ic3RvbmVzKCkge1xuICAgIGNvbnN0IHRvbWJzdG9uZXMgPSBuZXcgTWFwPHN0cmluZywgRGVsZXRpb25Ub21ic3RvbmU+KCk7XG4gICAgY29uc3QgaW52ZW50b3J5ID0gYXdhaXQgdGhpcy5saXN0UmVtb3RlVHJlZSh0aGlzLmJ1aWxkRGVsZXRpb25Gb2xkZXIoKSk7XG4gICAgZm9yIChjb25zdCByZW1vdGUgb2YgaW52ZW50b3J5LmZpbGVzLnZhbHVlcygpKSB7XG4gICAgICBjb25zdCB2YXVsdFBhdGggPSB0aGlzLnJlbW90ZURlbGV0aW9uUGF0aFRvVmF1bHRQYXRoKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgIGlmICghdmF1bHRQYXRoKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGUucmVtb3RlUGF0aCksXG4gICAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9tYnN0b25lID0gdGhpcy5wYXJzZURlbGV0aW9uVG9tYnN0b25lUGF5bG9hZCh0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpKTtcbiAgICAgIGlmICh0b21ic3RvbmUpIHtcbiAgICAgICAgdG9tYnN0b25lcy5zZXQodmF1bHRQYXRoLCB0b21ic3RvbmUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0b21ic3RvbmVzO1xuICB9XG5cbiAgcHJpdmF0ZSByZW1vdGVQYXRoVG9WYXVsdFBhdGgocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgcm9vdCA9IHRoaXMubm9ybWFsaXplRm9sZGVyKHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKTtcbiAgICBpZiAoIXJlbW90ZVBhdGguc3RhcnRzV2l0aChyb290KSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlbW90ZVBhdGguc2xpY2Uocm9vdC5sZW5ndGgpLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG4gIH1cblxuICBwcml2YXRlIHNob3VsZERvd25sb2FkUmVtb3RlVmVyc2lvbihsb2NhbE10aW1lOiBudW1iZXIsIHJlbW90ZU10aW1lOiBudW1iZXIpIHtcbiAgICByZXR1cm4gcmVtb3RlTXRpbWUgPiBsb2NhbE10aW1lICsgMjAwMDtcbiAgfVxuXG4gIHByaXZhdGUgaXNUb21ic3RvbmVBdXRob3JpdGF0aXZlKFxuICAgIHRvbWJzdG9uZTogRGVsZXRpb25Ub21ic3RvbmUsXG4gICAgcmVtb3RlPzogUGljazxSZW1vdGVGaWxlU3RhdGUsIFwibGFzdE1vZGlmaWVkXCIgfCBcInNpZ25hdHVyZVwiPiB8IG51bGwsXG4gICkge1xuICAgIGNvbnN0IGdyYWNlTXMgPSA1MDAwO1xuICAgIGlmICghcmVtb3RlKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAodG9tYnN0b25lLnJlbW90ZVNpZ25hdHVyZSkge1xuICAgICAgcmV0dXJuIHJlbW90ZS5zaWduYXR1cmUgPT09IHRvbWJzdG9uZS5yZW1vdGVTaWduYXR1cmU7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlbW90ZS5sYXN0TW9kaWZpZWQgPD0gdG9tYnN0b25lLmRlbGV0ZWRBdCArIGdyYWNlTXM7XG4gIH1cblxuICBwcml2YXRlIHNob3VsZERlbGV0ZUxvY2FsRnJvbVRvbWJzdG9uZShmaWxlOiBURmlsZSwgdG9tYnN0b25lOiBEZWxldGlvblRvbWJzdG9uZSkge1xuICAgIGNvbnN0IGdyYWNlTXMgPSA1MDAwO1xuICAgIHJldHVybiBmaWxlLnN0YXQubXRpbWUgPD0gdG9tYnN0b25lLmRlbGV0ZWRBdCArIGdyYWNlTXM7XG4gIH1cblxuICBwcml2YXRlIGdldFZhdWx0RmlsZUJ5UGF0aChwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHBhdGgpO1xuICAgIHJldHVybiBmaWxlIGluc3RhbmNlb2YgVEZpbGUgPyBmaWxlIDogbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVtb3ZlTG9jYWxWYXVsdEZpbGUoZmlsZTogVEZpbGUpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuZGVsZXRlKGZpbGUsIHRydWUpO1xuICAgIH0gY2F0Y2ggKGRlbGV0ZUVycm9yKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC50cmFzaChmaWxlLCB0cnVlKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICB0aHJvdyBkZWxldGVFcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGVuc3VyZUxvY2FsUGFyZW50Rm9sZGVycyhwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGF0aChwYXRoKTtcbiAgICBjb25zdCBzZWdtZW50cyA9IG5vcm1hbGl6ZWQuc3BsaXQoXCIvXCIpLmZpbHRlcigodmFsdWUpID0+IHZhbHVlLmxlbmd0aCA+IDApO1xuICAgIGlmIChzZWdtZW50cy5sZW5ndGggPD0gMSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBjdXJyZW50ID0gXCJcIjtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgc2VnbWVudHMubGVuZ3RoIC0gMTsgaW5kZXggKz0gMSkge1xuICAgICAgY3VycmVudCA9IGN1cnJlbnQgPyBgJHtjdXJyZW50fS8ke3NlZ21lbnRzW2luZGV4XX1gIDogc2VnbWVudHNbaW5kZXhdO1xuICAgICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoY3VycmVudCk7XG4gICAgICBpZiAoIWV4aXN0aW5nKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZUZvbGRlcihjdXJyZW50KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQodmF1bHRQYXRoOiBzdHJpbmcsIHJlbW90ZTogUmVtb3RlRmlsZVN0YXRlLCBleGlzdGluZ0ZpbGU/OiBURmlsZSkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGUucmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEdFVCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5lbnN1cmVMb2NhbFBhcmVudEZvbGRlcnModmF1bHRQYXRoKTtcbiAgICBjb25zdCBjdXJyZW50ID0gZXhpc3RpbmdGaWxlID8/IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKHZhdWx0UGF0aCk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgIG10aW1lOiByZW1vdGUubGFzdE1vZGlmaWVkID4gMCA/IHJlbW90ZS5sYXN0TW9kaWZpZWQgOiBEYXRlLm5vdygpLFxuICAgIH07XG4gICAgaWYgKCFjdXJyZW50KSB7XG4gICAgICBpZiAodmF1bHRQYXRoLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoXCIubWRcIikpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKHZhdWx0UGF0aCwgdGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKSwgb3B0aW9ucyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVCaW5hcnkodmF1bHRQYXRoLCByZXNwb25zZS5hcnJheUJ1ZmZlciwgb3B0aW9ucyk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGN1cnJlbnQuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShjdXJyZW50LCB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpLCBvcHRpb25zKTtcbiAgICB9IGVsc2Uge1xuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5QmluYXJ5KGN1cnJlbnQsIHJlc3BvbnNlLmFycmF5QnVmZmVyLCBvcHRpb25zKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHZlcmlmeVJlbW90ZUJpbmFyeVJvdW5kVHJpcChyZW1vdGVQYXRoOiBzdHJpbmcsIGV4cGVjdGVkOiBBcnJheUJ1ZmZlcikge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5hcnJheUJ1ZmZlcnNFcXVhbChleHBlY3RlZCwgcmVzcG9uc2UuYXJyYXlCdWZmZXIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzdGF0UmVtb3RlRmlsZShyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiUFJPUEZJTkRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgRGVwdGg6IFwiMFwiLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDQwNCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFBST1BGSU5EIGZhaWxlZCBmb3IgJHtyZW1vdGVQYXRofSB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG5cbiAgICBjb25zdCB4bWxUZXh0ID0gdGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKTtcbiAgICBjb25zdCBlbnRyaWVzID0gdGhpcy5wYXJzZVByb3BmaW5kRGlyZWN0b3J5TGlzdGluZyh4bWxUZXh0LCByZW1vdGVQYXRoLCB0cnVlKTtcbiAgICByZXR1cm4gZW50cmllcy5maW5kKChlbnRyeSkgPT4gIWVudHJ5LmlzQ29sbGVjdGlvbik/LmZpbGUgPz8gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlOiBURmlsZSwgcmVtb3RlUGF0aDogc3RyaW5nLCBtYXJrZG93bkNvbnRlbnQ/OiBzdHJpbmcpIHtcbiAgICBsZXQgYmluYXJ5OiBBcnJheUJ1ZmZlcjtcblxuICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICBjb25zdCBjb250ZW50ID0gbWFya2Rvd25Db250ZW50ID8/IChhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSkpO1xuICAgICAgaWYgKHRoaXMucGFyc2VOb3RlU3R1Yihjb250ZW50KSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgXCJcdTYyRDJcdTdFRERcdTYyOEFcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTUzNjBcdTRGNERcdTdCMTRcdThCQjBcdTRFMEFcdTRGMjBcdTRFM0FcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTMwMDJcIixcbiAgICAgICAgICAgIFwiUmVmdXNpbmcgdG8gdXBsb2FkIGEgbGF6eS1ub3RlIHBsYWNlaG9sZGVyIGFzIHJlbW90ZSBub3RlIGNvbnRlbnQuXCIsXG4gICAgICAgICAgKSxcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgYmluYXJ5ID0gdGhpcy5lbmNvZGVVdGY4KGNvbnRlbnQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBiaW5hcnkgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KHJlbW90ZVBhdGgsIGJpbmFyeSwgdGhpcy5nZXRNaW1lVHlwZShmaWxlLmV4dGVuc2lvbikpO1xuICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuc3RhdFJlbW90ZUZpbGUocmVtb3RlUGF0aCk7XG4gICAgaWYgKHJlbW90ZSkge1xuICAgICAgcmV0dXJuIHJlbW90ZTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIGxhc3RNb2RpZmllZDogZmlsZS5zdGF0Lm10aW1lLFxuICAgICAgc2l6ZTogZmlsZS5zdGF0LnNpemUsXG4gICAgICBzaWduYXR1cmU6IHRoaXMuYnVpbGRTeW5jU2lnbmF0dXJlKGZpbGUpLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZVJlbW90ZVN5bmNlZEVudHJ5KHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLnN5bmNJbmRleC5nZXQodmF1bHRQYXRoKTtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gZXhpc3Rpbmc/LnJlbW90ZVBhdGggPz8gdGhpcy5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgodmF1bHRQYXRoKTtcbiAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZVBhdGgpO1xuICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZSh2YXVsdFBhdGgpO1xuICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUZpbGVPcGVuKGZpbGU6IFRGaWxlIHwgbnVsbCkge1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkgfHwgZmlsZS5leHRlbnNpb24gIT09IFwibWRcIikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMuc2V0KGZpbGUucGF0aCwgRGF0ZS5ub3coKSk7XG4gICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcblxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IHN0dWIgPSB0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCk7XG4gICAgaWYgKCFzdHViKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuc3RhdFJlbW90ZUZpbGUoc3R1Yi5yZW1vdGVQYXRoKTtcbiAgICAgIGlmICghcmVtb3RlKSB7XG4gICAgICAgIGNvbnN0IHRvbWJzdG9uZSA9IGF3YWl0IHRoaXMucmVhZERlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCk7XG4gICAgICAgIGlmICh0b21ic3RvbmUpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLnJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGUpO1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgICAgIHRoaXMuY2xlYXJNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgICAgIHRoaXMudChcbiAgICAgICAgICAgICAgYFx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1NEUwRFx1NUI1OFx1NTcyOFx1RkYwQ1x1NURGMlx1NzlGQlx1OTY2NFx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgICAgICAgICBgUmVtb3RlIG5vdGUgbWlzc2luZywgcmVtb3ZlZCBsb2NhbCBwbGFjZWhvbGRlcjogJHtmaWxlLmJhc2VuYW1lfWAsXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgNjAwMCxcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IG1pc3NpbmdSZWNvcmQgPSB0aGlzLm1hcmtNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgICBpZiAobWlzc2luZ1JlY29yZC5taXNzQ291bnQgPj0gdGhpcy5taXNzaW5nTGF6eVJlbW90ZUNvbmZpcm1hdGlvbnMpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLnJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGUpO1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgICAgIHRoaXMuY2xlYXJNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgICAgIHRoaXMudChcbiAgICAgICAgICAgICAgYFx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1OEZERVx1N0VFRFx1N0YzQVx1NTkzMVx1RkYwQ1x1NURGMlx1NzlGQlx1OTY2NFx1NjcyQ1x1NTczMFx1NTkzMVx1NjU0OFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgICAgICAgICBgUmVtb3RlIG5vdGUgd2FzIG1pc3NpbmcgcmVwZWF0ZWRseSwgcmVtb3ZlZCBsb2NhbCBicm9rZW4gcGxhY2Vob2xkZXI6ICR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIDgwMDAsXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1NEUwRFx1NUI1OFx1NTcyOFx1RkYwQ1x1NUY1M1x1NTI0RFx1NTE0OFx1NEZERFx1NzU1OVx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMFx1NEVFNVx1OTYzMlx1NEUzNFx1NjVGNlx1NUYwMlx1NUUzOFx1RkYxQlx1ODJFNVx1NTE4RFx1NkIyMVx1Nzg2RVx1OEJBNFx1N0YzQVx1NTkzMVx1RkYwQ1x1NUMwNlx1ODFFQVx1NTJBOFx1NkUwNVx1NzQwNlx1OEJFNVx1NTM2MFx1NEY0RFx1MzAwMlwiLCBcIlJlbW90ZSBub3RlIGlzIG1pc3NpbmcuIFRoZSBsb2NhbCBwbGFjZWhvbGRlciB3YXMga2VwdCBmb3Igbm93IGluIGNhc2UgdGhpcyBpcyB0cmFuc2llbnQ7IGl0IHdpbGwgYmUgY2xlYW5lZCBhdXRvbWF0aWNhbGx5IGlmIHRoZSByZW1vdGUgaXMgc3RpbGwgbWlzc2luZyBvbiB0aGUgbmV4dCBjb25maXJtYXRpb24uXCIpLCA4MDAwKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmNsZWFyTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICAgIGF3YWl0IHRoaXMuZG93bmxvYWRSZW1vdGVGaWxlVG9WYXVsdChmaWxlLnBhdGgsIHJlbW90ZSwgZmlsZSk7XG4gICAgICBjb25zdCByZWZyZXNoZWQgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChmaWxlLnBhdGgpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVmcmVzaGVkID8gdGhpcy5idWlsZFN5bmNTaWduYXR1cmUocmVmcmVzaGVkKSA6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlUGF0aDogc3R1Yi5yZW1vdGVQYXRoLFxuICAgICAgfSk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLnQoYFx1NURGMlx1NEVDRVx1OEZEQ1x1N0FFRlx1NjA2Mlx1NTkwRFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gLCBgUmVzdG9yZWQgbm90ZSBmcm9tIHJlbW90ZTogJHtmaWxlLmJhc2VuYW1lfWApLCA2MDAwKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBoeWRyYXRlIG5vdGUgZnJvbSByZW1vdGVcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU4RkRDXHU3QUVGXHU2MDYyXHU1OTBEXHU3QjE0XHU4QkIwXHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIHJlc3RvcmUgbm90ZSBmcm9tIHJlbW90ZVwiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHNob3VsZFNraXBDb250ZW50U3luY1BhdGgocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZFBhdGggPSBub3JtYWxpemVQYXRoKHBhdGgpO1xuICAgIGlmIChub3JtYWxpemVkUGF0aCA9PT0gXCIub2JzaWRpYW5cIiB8fCBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwiLm9ic2lkaWFuL1wiKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgbm9ybWFsaXplZFBhdGggPT09IFwiLm9ic2lkaWFuL3BsdWdpbnMvc2VjdXJlLXdlYmRhdi1pbWFnZXNcIiB8fFxuICAgICAgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIi5vYnNpZGlhbi9wbHVnaW5zL3NlY3VyZS13ZWJkYXYtaW1hZ2VzL1wiKVxuICAgICkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIC9cXC4ocG5nfGpwZT9nfGdpZnx3ZWJwfGJtcHxzdmcpJC9pLnRlc3Qobm9ybWFsaXplZFBhdGgpO1xuICB9XG5cbiAgcHJpdmF0ZSBjb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKSB7XG4gICAgcmV0dXJuIHRoaXMuYXBwLnZhdWx0XG4gICAgICAuZ2V0RmlsZXMoKVxuICAgICAgLmZpbHRlcigoZmlsZSkgPT4gIXRoaXMuc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChmaWxlLnBhdGgpKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGEucGF0aC5sb2NhbGVDb21wYXJlKGIucGF0aCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZFN5bmNTaWduYXR1cmUoZmlsZTogVEZpbGUpIHtcbiAgICByZXR1cm4gYCR7ZmlsZS5zdGF0Lm10aW1lfToke2ZpbGUuc3RhdC5zaXplfWA7XG4gIH1cblxuICBwcml2YXRlIGdldE9wZW5NYXJrZG93bkNvbnRlbnQobm90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IGxlYXZlcyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoXCJtYXJrZG93blwiKTtcbiAgICBmb3IgKGNvbnN0IGxlYWYgb2YgbGVhdmVzKSB7XG4gICAgICBjb25zdCB2aWV3ID0gbGVhZi52aWV3O1xuICAgICAgaWYgKCEodmlldyBpbnN0YW5jZW9mIE1hcmtkb3duVmlldykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghdmlldy5maWxlIHx8IHZpZXcuZmlsZS5wYXRoICE9PSBub3RlUGF0aCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHZpZXcuZWRpdG9yLmdldFZhbHVlKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZTogVEZpbGUpIHtcbiAgICBjb25zdCBsaXZlQ29udGVudCA9IHRoaXMuZ2V0T3Blbk1hcmtkb3duQ29udGVudChmaWxlLnBhdGgpO1xuICAgIGlmIChsaXZlQ29udGVudCAhPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGxpdmVDb250ZW50O1xuICAgIH1cblxuICAgIHJldHVybiBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBidWlsZEN1cnJlbnRMb2NhbFNpZ25hdHVyZShmaWxlOiBURmlsZSwgbWFya2Rvd25Db250ZW50Pzogc3RyaW5nKSB7XG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHtcbiAgICAgIHJldHVybiB0aGlzLmJ1aWxkU3luY1NpZ25hdHVyZShmaWxlKTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50ID0gbWFya2Rvd25Db250ZW50ID8/IChhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSkpO1xuICAgIGNvbnN0IGRpZ2VzdCA9IChhd2FpdCB0aGlzLmNvbXB1dGVTaGEyNTZIZXgodGhpcy5lbmNvZGVVdGY4KGNvbnRlbnQpKSkuc2xpY2UoMCwgMTYpO1xuICAgIHJldHVybiBgbWQ6JHtjb250ZW50Lmxlbmd0aH06JHtkaWdlc3R9YDtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGAke3RoaXMubm9ybWFsaXplRm9sZGVyKHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKX0ke3ZhdWx0UGF0aH1gO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWNvbmNpbGVSZW1vdGVJbWFnZXMoKSB7XG4gICAgcmV0dXJuIHsgZGVsZXRlZEZpbGVzOiAwLCBkZWxldGVkRGlyZWN0b3JpZXM6IDAgfTtcbiAgfVxuXG4gIHByaXZhdGUgbWFya01pc3NpbmdMYXp5UmVtb3RlKHBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gICAgY29uc3QgcHJldmlvdXMgPSB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMuZ2V0KHBhdGgpO1xuICAgIGNvbnN0IG5leHQ6IE1pc3NpbmdMYXp5UmVtb3RlUmVjb3JkID0gcHJldmlvdXNcbiAgICAgID8ge1xuICAgICAgICAgIGZpcnN0RGV0ZWN0ZWRBdDogcHJldmlvdXMuZmlyc3REZXRlY3RlZEF0LFxuICAgICAgICAgIGxhc3REZXRlY3RlZEF0OiBub3csXG4gICAgICAgICAgbWlzc0NvdW50OiBwcmV2aW91cy5taXNzQ291bnQgKyAxLFxuICAgICAgICB9XG4gICAgICA6IHtcbiAgICAgICAgICBmaXJzdERldGVjdGVkQXQ6IG5vdyxcbiAgICAgICAgICBsYXN0RGV0ZWN0ZWRBdDogbm93LFxuICAgICAgICAgIG1pc3NDb3VudDogMSxcbiAgICAgICAgfTtcbiAgICB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMuc2V0KHBhdGgsIG5leHQpO1xuICAgIHJldHVybiBuZXh0O1xuICB9XG5cbiAgcHJpdmF0ZSBjbGVhck1pc3NpbmdMYXp5UmVtb3RlKHBhdGg6IHN0cmluZykge1xuICAgIHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3Rlcy5kZWxldGUocGF0aCk7XG4gIH1cblxuICBwcml2YXRlIHBhcnNlTm90ZVN0dWIoY29udGVudDogc3RyaW5nKSB7XG4gICAgY29uc3QgbWF0Y2ggPSBjb250ZW50Lm1hdGNoKFxuICAgICAgL148IS0tXFxzKnNlY3VyZS13ZWJkYXYtbm90ZS1zdHViXFxzKlxccj9cXG5yZW1vdGU6XFxzKiguKz8pXFxyP1xcbnBsYWNlaG9sZGVyOlxccyooLio/KVxccj9cXG4tLT4vcyxcbiAgICApO1xuICAgIGlmICghbWF0Y2gpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICByZW1vdGVQYXRoOiBtYXRjaFsxXS50cmltKCksXG4gICAgICBwbGFjZWhvbGRlcjogbWF0Y2hbMl0udHJpbSgpLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkTm90ZVN0dWIoZmlsZTogVEZpbGUpIHtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgoZmlsZS5wYXRoKTtcbiAgICByZXR1cm4gW1xuICAgICAgYDwhLS0gJHtTRUNVUkVfTk9URV9TVFVCfWAsXG4gICAgICBgcmVtb3RlOiAke3JlbW90ZVBhdGh9YCxcbiAgICAgIGBwbGFjZWhvbGRlcjogJHtmaWxlLmJhc2VuYW1lfWAsXG4gICAgICBcIi0tPlwiLFxuICAgICAgXCJcIixcbiAgICAgIHRoaXMudChcbiAgICAgICAgYFx1OEZEOVx1NjYyRlx1NEUwMFx1N0JDN1x1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFx1NzY4NFx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1NjU4N1x1NEVGNlx1MzAwMlx1NjI1M1x1NUYwMFx1OEZEOVx1N0JDN1x1N0IxNFx1OEJCMFx1NjVGNlx1RkYwQ1x1NjNEMlx1NEVGNlx1NEYxQVx1NEVDRVx1OEZEQ1x1N0FFRlx1NTQwQ1x1NkI2NVx1NzZFRVx1NUY1NVx1NjA2Mlx1NTkwRFx1NUI4Q1x1NjU3NFx1NTE4NVx1NUJCOVx1MzAwMmAsXG4gICAgICAgIGBUaGlzIGlzIGEgbG9jYWwgcGxhY2Vob2xkZXIgZm9yIGFuIG9uLWRlbWFuZCBub3RlLiBPcGVuaW5nIHRoZSBub3RlIHJlc3RvcmVzIHRoZSBmdWxsIGNvbnRlbnQgZnJvbSB0aGUgcmVtb3RlIHN5bmMgZm9sZGVyLmAsXG4gICAgICApLFxuICAgIF0uam9pbihcIlxcblwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZXZpY3RTdGFsZVN5bmNlZE5vdGVzKHNob3dOb3RpY2U6IGJvb2xlYW4pIHtcbiAgICB0cnkge1xuICAgICAgaWYgKHRoaXMuc2V0dGluZ3Mubm90ZVN0b3JhZ2VNb2RlICE9PSBcImxhenktbm90ZXNcIikge1xuICAgICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1RjUzXHU1MjREXHU2NzJBXHU1NDJGXHU3NTI4XHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXHU2QTIxXHU1RjBGXHUzMDAyXCIsIFwiTGF6eSBub3RlIG1vZGUgaXMgbm90IGVuYWJsZWQuXCIpLCA2MDAwKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZmlsZXMgPSB0aGlzLmNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpLmZpbHRlcigoZmlsZSkgPT4gZmlsZS5leHRlbnNpb24gPT09IFwibWRcIik7XG4gICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgICAgY29uc3QgdGhyZXNob2xkID0gTWF0aC5tYXgoMSwgdGhpcy5zZXR0aW5ncy5ub3RlRXZpY3RBZnRlckRheXMpICogMjQgKiA2MCAqIDYwICogMTAwMDtcbiAgICAgIGxldCBldmljdGVkID0gMDtcblxuICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICAgIGNvbnN0IGFjdGl2ZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgICAgIGlmIChhY3RpdmU/LnBhdGggPT09IGZpbGUucGF0aCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbGFzdEFjY2VzcyA9IHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMuZ2V0KGZpbGUucGF0aCkgPz8gMDtcbiAgICAgICAgaWYgKGxhc3RBY2Nlc3MgIT09IDAgJiYgbm93IC0gbGFzdEFjY2VzcyA8IHRocmVzaG9sZCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICAgIGlmICh0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCkpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGJpbmFyeSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWRCaW5hcnkoZmlsZSk7XG4gICAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aChmaWxlLnBhdGgpO1xuICAgICAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBiaW5hcnksIFwidGV4dC9tYXJrZG93bjsgY2hhcnNldD11dGYtOFwiKTtcbiAgICAgICAgY29uc3QgdmVyaWZpZWQgPSBhd2FpdCB0aGlzLnZlcmlmeVJlbW90ZUJpbmFyeVJvdW5kVHJpcChyZW1vdGVQYXRoLCBiaW5hcnkpO1xuICAgICAgICBpZiAoIXZlcmlmaWVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1NjgyMVx1OUE4Q1x1NTkzMVx1OEQyNVx1RkYwQ1x1NURGMlx1NTNENlx1NkQ4OFx1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1MzAwMlwiLCBcIlJlbW90ZSBub3RlIHZlcmlmaWNhdGlvbiBmYWlsZWQsIGxvY2FsIG5vdGUgZXZpY3Rpb24gd2FzIGNhbmNlbGxlZC5cIikpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuc3RhdFJlbW90ZUZpbGUocmVtb3RlUGF0aCk7XG4gICAgICAgIGlmICghcmVtb3RlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1NTE0M1x1NjU3MFx1NjM2RVx1N0YzQVx1NTkzMVx1RkYwQ1x1NURGMlx1NTNENlx1NkQ4OFx1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1MzAwMlwiLCBcIlJlbW90ZSBub3RlIG1ldGFkYXRhIGlzIG1pc3NpbmcsIGxvY2FsIG5vdGUgZXZpY3Rpb24gd2FzIGNhbmNlbGxlZC5cIikpO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB0aGlzLmJ1aWxkTm90ZVN0dWIoZmlsZSkpO1xuICAgICAgICBjb25zdCByZWZyZXNoZWQgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChmaWxlLnBhdGgpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IHRoaXMuYnVpbGRTeW5jU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiB0aGlzLmJ1aWxkU3luY1NpZ25hdHVyZShmaWxlKSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHJlbW90ZT8uc2lnbmF0dXJlID8/IGAke2ZpbGUuc3RhdC5tdGltZX06JHtiaW5hcnkuYnl0ZUxlbmd0aH1gLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICBldmljdGVkICs9IDE7XG4gICAgICB9XG5cbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgYFx1NURGMlx1NTZERVx1NjUzNiAke2V2aWN0ZWR9IFx1N0JDN1x1OTU3Rlx1NjcxRlx1NjcyQVx1OEJCRlx1OTVFRVx1NzY4NFx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1MzAwMmAsXG4gICAgICAgICAgICBgRXZpY3RlZCAke2V2aWN0ZWR9IHN0YWxlIGxvY2FsIG5vdGUocykuYCxcbiAgICAgICAgICApLFxuICAgICAgICAgIDgwMDAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgcmV0dXJuIGV2aWN0ZWQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZXZpY3Qgc3RhbGUgc3luY2VkIG5vdGVzXCIsIGVycm9yKTtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1NTkzMVx1OEQyNVwiLCBcIkZhaWxlZCB0byBldmljdCBsb2NhbCBub3Rlc1wiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZW5zdXJlUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcGFydHMgPSByZW1vdGVQYXRoLnNwbGl0KFwiL1wiKS5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPiAwKTtcbiAgICBpZiAocGFydHMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgY3VycmVudCA9IFwiXCI7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHBhcnRzLmxlbmd0aCAtIDE7IGluZGV4ICs9IDEpIHtcbiAgICAgIGN1cnJlbnQgPSBjdXJyZW50ID8gYCR7Y3VycmVudH0vJHtwYXJ0c1tpbmRleF19YCA6IHBhcnRzW2luZGV4XTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKGN1cnJlbnQpLFxuICAgICAgICBtZXRob2Q6IFwiTUtDT0xcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgaWYgKCFbMjAwLCAyMDEsIDIwNCwgMjA3LCAzMDEsIDMwMiwgMzA3LCAzMDgsIDQwNV0uaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1LQ09MIGZhaWxlZCBmb3IgJHtjdXJyZW50fSB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGxpc3RSZW1vdGVUcmVlKHJvb3RGb2xkZXI6IHN0cmluZyk6IFByb21pc2U8UmVtb3RlSW52ZW50b3J5PiB7XG4gICAgY29uc3QgZmlsZXMgPSBuZXcgTWFwPHN0cmluZywgUmVtb3RlRmlsZVN0YXRlPigpO1xuICAgIGNvbnN0IGRpcmVjdG9yaWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgcGVuZGluZyA9IFt0aGlzLm5vcm1hbGl6ZUZvbGRlcihyb290Rm9sZGVyKV07XG4gICAgY29uc3QgdmlzaXRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG4gICAgd2hpbGUgKHBlbmRpbmcubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgY3VycmVudCA9IHRoaXMubm9ybWFsaXplRm9sZGVyKHBlbmRpbmcucG9wKCkgPz8gcm9vdEZvbGRlcik7XG4gICAgICBpZiAodmlzaXRlZC5oYXMoY3VycmVudCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHZpc2l0ZWQuYWRkKGN1cnJlbnQpO1xuICAgICAgY29uc3QgZW50cmllcyA9IGF3YWl0IHRoaXMubGlzdFJlbW90ZURpcmVjdG9yeShjdXJyZW50KTtcbiAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgICAgICBpZiAoZW50cnkuaXNDb2xsZWN0aW9uKSB7XG4gICAgICAgICAgZGlyZWN0b3JpZXMuYWRkKGVudHJ5LnJlbW90ZVBhdGgpO1xuICAgICAgICAgIHBlbmRpbmcucHVzaChlbnRyeS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlbnRyeS5maWxlKSB7XG4gICAgICAgICAgZmlsZXMuc2V0KGVudHJ5LnJlbW90ZVBhdGgsIGVudHJ5LmZpbGUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgZmlsZXMsIGRpcmVjdG9yaWVzIH07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGxpc3RSZW1vdGVEaXJlY3RvcnkocmVtb3RlRGlyZWN0b3J5OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXF1ZXN0ZWRQYXRoID0gdGhpcy5ub3JtYWxpemVGb2xkZXIocmVtb3RlRGlyZWN0b3J5KTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVxdWVzdGVkUGF0aCksXG4gICAgICBtZXRob2Q6IFwiUFJPUEZJTkRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgRGVwdGg6IFwiMVwiLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDQwNCkge1xuICAgICAgcmV0dXJuIFtdIGFzIEFycmF5PHsgcmVtb3RlUGF0aDogc3RyaW5nOyBpc0NvbGxlY3Rpb246IGJvb2xlYW47IGZpbGU/OiBSZW1vdGVGaWxlU3RhdGUgfT47XG4gICAgfVxuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFBST1BGSU5EIGZhaWxlZCBmb3IgJHtyZXF1ZXN0ZWRQYXRofSB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG5cbiAgICBjb25zdCB4bWxUZXh0ID0gdGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKTtcbiAgICByZXR1cm4gdGhpcy5wYXJzZVByb3BmaW5kRGlyZWN0b3J5TGlzdGluZyh4bWxUZXh0LCByZXF1ZXN0ZWRQYXRoKTtcbiAgfVxuXG4gIHByaXZhdGUgcGFyc2VQcm9wZmluZERpcmVjdG9yeUxpc3RpbmcoeG1sVGV4dDogc3RyaW5nLCByZXF1ZXN0ZWRQYXRoOiBzdHJpbmcsIGluY2x1ZGVSZXF1ZXN0ZWQgPSBmYWxzZSkge1xuICAgIGNvbnN0IHBhcnNlciA9IG5ldyBET01QYXJzZXIoKTtcbiAgICBjb25zdCBkb2N1bWVudCA9IHBhcnNlci5wYXJzZUZyb21TdHJpbmcoeG1sVGV4dCwgXCJhcHBsaWNhdGlvbi94bWxcIik7XG4gICAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwicGFyc2VyZXJyb3JcIikubGVuZ3RoID4gMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1NjVFMFx1NkNENVx1ODlFM1x1Njc5MCBXZWJEQVYgXHU3NkVFXHU1RjU1XHU2RTA1XHU1MzU1XHUzMDAyXCIsIFwiRmFpbGVkIHRvIHBhcnNlIHRoZSBXZWJEQVYgZGlyZWN0b3J5IGxpc3RpbmcuXCIpKTtcbiAgICB9XG5cbiAgICBjb25zdCBlbnRyaWVzID0gbmV3IE1hcDxzdHJpbmcsIHsgcmVtb3RlUGF0aDogc3RyaW5nOyBpc0NvbGxlY3Rpb246IGJvb2xlYW47IGZpbGU/OiBSZW1vdGVGaWxlU3RhdGUgfT4oKTtcbiAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgQXJyYXkuZnJvbShkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcIipcIikpKSB7XG4gICAgICBpZiAoZWxlbWVudC5sb2NhbE5hbWUgIT09IFwicmVzcG9uc2VcIikge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaHJlZiA9IHRoaXMuZ2V0WG1sTG9jYWxOYW1lVGV4dChlbGVtZW50LCBcImhyZWZcIik7XG4gICAgICBpZiAoIWhyZWYpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmhyZWZUb1JlbW90ZVBhdGgoaHJlZik7XG4gICAgICBpZiAoIXJlbW90ZVBhdGgpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGlzQ29sbGVjdGlvbiA9IHRoaXMueG1sVHJlZUhhc0xvY2FsTmFtZShlbGVtZW50LCBcImNvbGxlY3Rpb25cIik7XG4gICAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IGlzQ29sbGVjdGlvbiA/IHRoaXMubm9ybWFsaXplRm9sZGVyKHJlbW90ZVBhdGgpIDogcmVtb3RlUGF0aC5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpO1xuICAgICAgaWYgKFxuICAgICAgICAhaW5jbHVkZVJlcXVlc3RlZCAmJlxuICAgICAgICAoXG4gICAgICAgICAgbm9ybWFsaXplZFBhdGggPT09IHJlcXVlc3RlZFBhdGggfHxcbiAgICAgICAgICBub3JtYWxpemVkUGF0aCA9PT0gcmVxdWVzdGVkUGF0aC5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpXG4gICAgICAgIClcbiAgICAgICkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc2l6ZVRleHQgPSB0aGlzLmdldFhtbExvY2FsTmFtZVRleHQoZWxlbWVudCwgXCJnZXRjb250ZW50bGVuZ3RoXCIpO1xuICAgICAgY29uc3QgcGFyc2VkU2l6ZSA9IE51bWJlci5wYXJzZUludChzaXplVGV4dCwgMTApO1xuICAgICAgY29uc3Qgc2l6ZSA9IE51bWJlci5pc0Zpbml0ZShwYXJzZWRTaXplKSA/IHBhcnNlZFNpemUgOiAwO1xuICAgICAgY29uc3QgbW9kaWZpZWRUZXh0ID0gdGhpcy5nZXRYbWxMb2NhbE5hbWVUZXh0KGVsZW1lbnQsIFwiZ2V0bGFzdG1vZGlmaWVkXCIpO1xuICAgICAgY29uc3QgcGFyc2VkTXRpbWUgPSBEYXRlLnBhcnNlKG1vZGlmaWVkVGV4dCk7XG4gICAgICBjb25zdCBsYXN0TW9kaWZpZWQgPSBOdW1iZXIuaXNGaW5pdGUocGFyc2VkTXRpbWUpID8gcGFyc2VkTXRpbWUgOiAwO1xuXG4gICAgICBlbnRyaWVzLnNldChub3JtYWxpemVkUGF0aCwge1xuICAgICAgICByZW1vdGVQYXRoOiBub3JtYWxpemVkUGF0aCxcbiAgICAgICAgaXNDb2xsZWN0aW9uLFxuICAgICAgICBmaWxlOiBpc0NvbGxlY3Rpb25cbiAgICAgICAgICA/IHVuZGVmaW5lZFxuICAgICAgICAgIDoge1xuICAgICAgICAgICAgICByZW1vdGVQYXRoOiBub3JtYWxpemVkUGF0aCxcbiAgICAgICAgICAgICAgbGFzdE1vZGlmaWVkLFxuICAgICAgICAgICAgICBzaXplLFxuICAgICAgICAgICAgICBzaWduYXR1cmU6IHRoaXMuYnVpbGRSZW1vdGVTeW5jU2lnbmF0dXJlKHtcbiAgICAgICAgICAgICAgICBsYXN0TW9kaWZpZWQsXG4gICAgICAgICAgICAgICAgc2l6ZSxcbiAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIFsuLi5lbnRyaWVzLnZhbHVlcygpXTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0WG1sTG9jYWxOYW1lVGV4dChwYXJlbnQ6IEVsZW1lbnQsIGxvY2FsTmFtZTogc3RyaW5nKSB7XG4gICAgZm9yIChjb25zdCBlbGVtZW50IG9mIEFycmF5LmZyb20ocGFyZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiKlwiKSkpIHtcbiAgICAgIGlmIChlbGVtZW50LmxvY2FsTmFtZSA9PT0gbG9jYWxOYW1lKSB7XG4gICAgICAgIHJldHVybiBlbGVtZW50LnRleHRDb250ZW50Py50cmltKCkgPz8gXCJcIjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuXG4gIHByaXZhdGUgeG1sVHJlZUhhc0xvY2FsTmFtZShwYXJlbnQ6IEVsZW1lbnQsIGxvY2FsTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20ocGFyZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiKlwiKSkuc29tZSgoZWxlbWVudCkgPT4gZWxlbWVudC5sb2NhbE5hbWUgPT09IGxvY2FsTmFtZSk7XG4gIH1cblxuICBwcml2YXRlIGhyZWZUb1JlbW90ZVBhdGgoaHJlZjogc3RyaW5nKSB7XG4gICAgY29uc3QgYmFzZVVybCA9IGAke3RoaXMuc2V0dGluZ3Mud2ViZGF2VXJsLnJlcGxhY2UoL1xcLyskLywgXCJcIil9L2A7XG4gICAgY29uc3QgcmVzb2x2ZWQgPSBuZXcgVVJMKGhyZWYsIGJhc2VVcmwpO1xuICAgIGNvbnN0IGJhc2VQYXRoID0gbmV3IFVSTChiYXNlVXJsKS5wYXRobmFtZS5yZXBsYWNlKC9cXC8rJC8sIFwiL1wiKTtcbiAgICBjb25zdCBkZWNvZGVkUGF0aCA9IHRoaXMuZGVjb2RlUGF0aG5hbWUocmVzb2x2ZWQucGF0aG5hbWUpO1xuICAgIGlmICghZGVjb2RlZFBhdGguc3RhcnRzV2l0aChiYXNlUGF0aCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiBkZWNvZGVkUGF0aC5zbGljZShiYXNlUGF0aC5sZW5ndGgpLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG4gIH1cblxuICBwcml2YXRlIGRlY29kZVBhdGhuYW1lKHBhdGhuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gcGF0aG5hbWVcbiAgICAgIC5zcGxpdChcIi9cIilcbiAgICAgIC5tYXAoKHNlZ21lbnQpID0+IHtcbiAgICAgICAgaWYgKCFzZWdtZW50KSB7XG4gICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoc2VnbWVudCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIHJldHVybiBzZWdtZW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmpvaW4oXCIvXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZEV4cGVjdGVkUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlRmlsZVBhdGhzOiBTZXQ8c3RyaW5nPiwgcm9vdEZvbGRlcjogc3RyaW5nKSB7XG4gICAgY29uc3QgZXhwZWN0ZWQgPSBuZXcgU2V0PHN0cmluZz4oW3RoaXMubm9ybWFsaXplRm9sZGVyKHJvb3RGb2xkZXIpXSk7XG4gICAgZm9yIChjb25zdCByZW1vdGVQYXRoIG9mIHJlbW90ZUZpbGVQYXRocykge1xuICAgICAgY29uc3QgcGFydHMgPSByZW1vdGVQYXRoLnNwbGl0KFwiL1wiKS5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPiAwKTtcbiAgICAgIGxldCBjdXJyZW50ID0gXCJcIjtcbiAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBwYXJ0cy5sZW5ndGggLSAxOyBpbmRleCArPSAxKSB7XG4gICAgICAgIGN1cnJlbnQgPSBjdXJyZW50ID8gYCR7Y3VycmVudH0vJHtwYXJ0c1tpbmRleF19YCA6IHBhcnRzW2luZGV4XTtcbiAgICAgICAgZXhwZWN0ZWQuYWRkKHRoaXMubm9ybWFsaXplRm9sZGVyKGN1cnJlbnQpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZXhwZWN0ZWQ7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZUV4dHJhUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlRGlyZWN0b3JpZXM6IFNldDxzdHJpbmc+LCBleHBlY3RlZERpcmVjdG9yaWVzOiBTZXQ8c3RyaW5nPikge1xuICAgIGxldCBkZWxldGVkID0gMDtcbiAgICBjb25zdCBjYW5kaWRhdGVzID0gWy4uLnJlbW90ZURpcmVjdG9yaWVzXVxuICAgICAgLmZpbHRlcigocmVtb3RlUGF0aCkgPT4gIWV4cGVjdGVkRGlyZWN0b3JpZXMuaGFzKHJlbW90ZVBhdGgpKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGIubGVuZ3RoIC0gYS5sZW5ndGggfHwgYi5sb2NhbGVDb21wYXJlKGEpKTtcblxuICAgIGZvciAoY29uc3QgcmVtb3RlUGF0aCBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAoWzIwMCwgMjAyLCAyMDQsIDQwNF0uaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzKSkge1xuICAgICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSA0MDQpIHtcbiAgICAgICAgICBkZWxldGVkICs9IDE7XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChbNDA1LCA0MDldLmluY2x1ZGVzKHJlc3BvbnNlLnN0YXR1cykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHRocm93IG5ldyBFcnJvcihgREVMRVRFIGRpcmVjdG9yeSBmYWlsZWQgZm9yICR7cmVtb3RlUGF0aH0gd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlbGV0ZWQ7XG4gIH1cblxyXG4gIHByaXZhdGUgYXN5bmMgcHJvY2Vzc1BlbmRpbmdUYXNrcygpIHtcbiAgICBpZiAodGhpcy5xdWV1ZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBydW5uaW5nOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IHRhc2sgb2YgWy4uLnRoaXMucXVldWVdKSB7XG4gICAgICBydW5uaW5nLnB1c2godGhpcy5zdGFydFBlbmRpbmdUYXNrKHRhc2spKTtcbiAgICB9XG5cbiAgICBpZiAocnVubmluZy5sZW5ndGggPiAwKSB7XG4gICAgICBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQocnVubmluZyk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBzdGFydFBlbmRpbmdUYXNrKHRhc2s6IFVwbG9hZFRhc2spIHtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMucGVuZGluZ1Rhc2tQcm9taXNlcy5nZXQodGFzay5pZCk7XG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICByZXR1cm4gZXhpc3Rpbmc7XG4gICAgfVxuXG4gICAgY29uc3QgcHJvbWlzZSA9IHRoaXMucHJvY2Vzc1Rhc2sodGFzaykuZmluYWxseSgoKSA9PiB7XG4gICAgICB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMuZGVsZXRlKHRhc2suaWQpO1xuICAgIH0pO1xuICAgIHRoaXMucGVuZGluZ1Rhc2tQcm9taXNlcy5zZXQodGFzay5pZCwgcHJvbWlzZSk7XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHByZXBhcmVQZW5kaW5nVXBsb2Fkc0ZvclN5bmMoc2hvd05vdGljZTogYm9vbGVhbikge1xuICAgIGF3YWl0IHRoaXMucHJvY2Vzc1BlbmRpbmdUYXNrcygpO1xuXG4gICAgaWYgKHRoaXMucXVldWUubGVuZ3RoID4gMCB8fCB0aGlzLnByb2Nlc3NpbmdUYXNrSWRzLnNpemUgPiAwIHx8IHRoaXMucGVuZGluZ1Rhc2tQcm9taXNlcy5zaXplID4gMCkge1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy50KFxuICAgICAgICBcIlx1NjhDMFx1NkQ0Qlx1NTIzMFx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NEVDRFx1NTcyOFx1OEZEQlx1ODg0Q1x1NjIxNlx1N0I0OVx1NUY4NVx1OTFDRFx1OEJENVx1RkYwQ1x1NURGMlx1NjY4Mlx1N0YxM1x1NjcyQ1x1NkIyMVx1N0IxNFx1OEJCMFx1NTQwQ1x1NkI2NVx1RkYwQ1x1OTA3Rlx1NTE0RFx1NjVFN1x1NzI0OFx1N0IxNFx1OEJCMFx1ODk4Nlx1NzZENlx1NjVCMFx1NTZGRVx1NzI0N1x1NUYxNVx1NzUyOFx1MzAwMlwiLFxuICAgICAgICBcIkltYWdlIHVwbG9hZHMgYXJlIHN0aWxsIHJ1bm5pbmcgb3Igd2FpdGluZyBmb3IgcmV0cnksIHNvIG5vdGUgc3luYyB3YXMgZGVmZXJyZWQgdG8gYXZvaWQgb2xkIG5vdGUgY29udGVudCBvdmVyd3JpdGluZyBuZXcgaW1hZ2UgcmVmZXJlbmNlcy5cIixcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsIDgwMDApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cclxuICBwcml2YXRlIGFzeW5jIHVwbG9hZEltYWdlc0luTm90ZShub3RlRmlsZTogVEZpbGUpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKG5vdGVGaWxlKTtcclxuICAgICAgY29uc3QgcmVwbGFjZW1lbnRzID0gYXdhaXQgdGhpcy5idWlsZFVwbG9hZFJlcGxhY2VtZW50cyhjb250ZW50LCBub3RlRmlsZSk7XHJcblxyXG4gICAgICBpZiAocmVwbGFjZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1RjUzXHU1MjREXHU3QjE0XHU4QkIwXHU0RTJEXHU2Q0ExXHU2NzA5XHU2MjdFXHU1MjMwXHU2NzJDXHU1NzMwXHU1NkZFXHU3MjQ3XHUzMDAyXCIsIFwiTm8gbG9jYWwgaW1hZ2VzIGZvdW5kIGluIHRoZSBjdXJyZW50IG5vdGUuXCIpKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGxldCB1cGRhdGVkID0gY29udGVudDtcclxuICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcclxuICAgICAgICB1cGRhdGVkID0gdXBkYXRlZC5zcGxpdChyZXBsYWNlbWVudC5vcmlnaW5hbCkuam9pbihyZXBsYWNlbWVudC5yZXdyaXR0ZW4pO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAodXBkYXRlZCA9PT0gY29udGVudCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU2Q0ExXHU2NzA5XHU5NzAwXHU4OTgxXHU2NTM5XHU1MTk5XHU3Njg0XHU1NkZFXHU3MjQ3XHU5NEZFXHU2M0E1XHUzMDAyXCIsIFwiTm8gaW1hZ2VzIHdlcmUgcmV3cml0dGVuLlwiKSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkobm90ZUZpbGUsIHVwZGF0ZWQpO1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZUZpbGUucGF0aCwgXCJpbWFnZS1hZGRcIik7XG5cbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLmRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQpIHtcbiAgICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcbiAgICAgICAgICBpZiAocmVwbGFjZW1lbnQuc291cmNlRmlsZSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy50cmFzaElmRXhpc3RzKHJlcGxhY2VtZW50LnNvdXJjZUZpbGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXHJcbiAgICAgIG5ldyBOb3RpY2UodGhpcy50KGBcdTVERjJcdTRFMEFcdTRGMjAgJHtyZXBsYWNlbWVudHMubGVuZ3RofSBcdTVGMjBcdTU2RkVcdTcyNDdcdTUyMzAgV2ViREFWXHUzMDAyYCwgYFVwbG9hZGVkICR7cmVwbGFjZW1lbnRzLmxlbmd0aH0gaW1hZ2UocykgdG8gV2ViREFWLmApKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIHVwbG9hZCBmYWlsZWRcIiwgZXJyb3IpO1xyXG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTRFMEFcdTRGMjBcdTU5MzFcdThEMjVcIiwgXCJVcGxvYWQgZmFpbGVkXCIpLCBlcnJvciksIDgwMDApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzVGFzayh0YXNrOiBVcGxvYWRUYXNrKSB7XG4gICAgdGhpcy5wcm9jZXNzaW5nVGFza0lkcy5hZGQodGFzay5pZCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGJpbmFyeSA9IHRoaXMuYmFzZTY0VG9BcnJheUJ1ZmZlcih0YXNrLmRhdGFCYXNlNjQpO1xuICAgICAgY29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLnByZXBhcmVVcGxvYWRQYXlsb2FkKFxuICAgICAgICBiaW5hcnksXG4gICAgICAgIHRhc2subWltZVR5cGUgfHwgdGhpcy5nZXRNaW1lVHlwZUZyb21GaWxlTmFtZSh0YXNrLmZpbGVOYW1lKSxcbiAgICAgICAgdGFzay5maWxlTmFtZSxcbiAgICAgICk7XG4gICAgICBjb25zdCByZW1vdGVOYW1lID0gYXdhaXQgdGhpcy5idWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeShwcmVwYXJlZC5maWxlTmFtZSwgcHJlcGFyZWQuYmluYXJ5KTtcbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkUmVtb3RlUGF0aChyZW1vdGVOYW1lKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgICBtZXRob2Q6IFwiUFVUXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICAgIFwiQ29udGVudC1UeXBlXCI6IHByZXBhcmVkLm1pbWVUeXBlLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBwcmVwYXJlZC5iaW5hcnksXG4gICAgICB9KTtcblxyXG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVwbG9hZCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IHJlcGxhY2VkID0gYXdhaXQgdGhpcy5yZXBsYWNlUGxhY2Vob2xkZXIoXHJcbiAgICAgICAgdGFzay5ub3RlUGF0aCxcbiAgICAgICAgdGFzay5pZCxcbiAgICAgICAgdGFzay5wbGFjZWhvbGRlcixcbiAgICAgICAgdGhpcy5idWlsZFNlY3VyZUltYWdlTWFya3VwKGAke1NFQ1VSRV9QUk9UT0NPTH0vLyR7cmVtb3RlUGF0aH1gLCBwcmVwYXJlZC5maWxlTmFtZSksXG4gICAgICApO1xuICAgICAgaWYgKCFyZXBsYWNlZCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJcdTRFMEFcdTRGMjBcdTYyMTBcdTUyOUZcdUZGMENcdTRGNDZcdTZDQTFcdTY3MDlcdTU3MjhcdTdCMTRcdThCQjBcdTRFMkRcdTYyN0VcdTUyMzBcdTUzRUZcdTY2RkZcdTYzNjJcdTc2ODRcdTUzNjBcdTRGNERcdTdCMjZcdTMwMDJcIiwgXCJVcGxvYWQgc3VjY2VlZGVkLCBidXQgbm8gbWF0Y2hpbmcgcGxhY2Vob2xkZXIgd2FzIGZvdW5kIGluIHRoZSBub3RlLlwiKSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRoaXMucXVldWUgPSB0aGlzLnF1ZXVlLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5pZCAhPT0gdGFzay5pZCk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmModGFzay5ub3RlUGF0aCwgXCJpbWFnZS1hZGRcIik7XG4gICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NjIxMFx1NTI5Rlx1MzAwMlwiLCBcIkltYWdlIHVwbG9hZGVkIHN1Y2Nlc3NmdWxseS5cIikpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIHF1ZXVlZCB1cGxvYWQgZmFpbGVkXCIsIGVycm9yKTtcclxuICAgICAgdGFzay5hdHRlbXB0cyArPSAxO1xyXG4gICAgICB0YXNrLmxhc3RFcnJvciA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcclxuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcclxuICAgICAgaWYgKHRhc2suYXR0ZW1wdHMgPj0gdGhpcy5zZXR0aW5ncy5tYXhSZXRyeUF0dGVtcHRzKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucmVwbGFjZVBsYWNlaG9sZGVyKHRhc2subm90ZVBhdGgsIHRhc2suaWQsIHRhc2sucGxhY2Vob2xkZXIsIHRoaXMuYnVpbGRGYWlsZWRQbGFjZWhvbGRlcih0YXNrLmZpbGVOYW1lLCB0YXNrLmxhc3RFcnJvcikpO1xuICAgICAgICB0aGlzLnF1ZXVlID0gdGhpcy5xdWV1ZS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uaWQgIT09IHRhc2suaWQpO1xuICAgICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTY3MDBcdTdFQzhcdTU5MzFcdThEMjVcIiwgXCJJbWFnZSB1cGxvYWQgZmFpbGVkIHBlcm1hbmVudGx5XCIpLCBlcnJvciksIDgwMDApO1xuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLnNjaGVkdWxlUmV0cnkodGFzayk7XHJcbiAgICAgIH1cclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIHRoaXMucHJvY2Vzc2luZ1Rhc2tJZHMuZGVsZXRlKHRhc2suaWQpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBzY2hlZHVsZVJldHJ5KHRhc2s6IFVwbG9hZFRhc2spIHtcclxuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5yZXRyeVRpbWVvdXRzLmdldCh0YXNrLmlkKTtcclxuICAgIGlmIChleGlzdGluZykge1xyXG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KGV4aXN0aW5nKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBkZWxheSA9IE1hdGgubWF4KDEsIHRoaXMuc2V0dGluZ3MucmV0cnlEZWxheVNlY29uZHMpICogMTAwMCAqIHRhc2suYXR0ZW1wdHM7XG4gICAgY29uc3QgdGltZW91dElkID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgdGhpcy5yZXRyeVRpbWVvdXRzLmRlbGV0ZSh0YXNrLmlkKTtcbiAgICAgIHZvaWQgdGhpcy5zdGFydFBlbmRpbmdUYXNrKHRhc2spO1xuICAgIH0sIGRlbGF5KTtcbiAgICB0aGlzLnJldHJ5VGltZW91dHMuc2V0KHRhc2suaWQsIHRpbWVvdXRJZCk7XG4gIH1cblxyXG4gIHByaXZhdGUgYXN5bmMgcmVwbGFjZVBsYWNlaG9sZGVyKG5vdGVQYXRoOiBzdHJpbmcsIHRhc2tJZDogc3RyaW5nLCBwbGFjZWhvbGRlcjogc3RyaW5nLCByZXBsYWNlbWVudDogc3RyaW5nKSB7XHJcbiAgICBjb25zdCByZXBsYWNlZEluRWRpdG9yID0gdGhpcy5yZXBsYWNlUGxhY2Vob2xkZXJJbk9wZW5FZGl0b3JzKG5vdGVQYXRoLCB0YXNrSWQsIHBsYWNlaG9sZGVyLCByZXBsYWNlbWVudCk7XHJcbiAgICBpZiAocmVwbGFjZWRJbkVkaXRvcikge1xyXG4gICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKG5vdGVQYXRoKTtcclxuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xyXG4gICAgaWYgKGNvbnRlbnQuaW5jbHVkZXMocGxhY2Vob2xkZXIpKSB7XHJcbiAgICAgIGNvbnN0IHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGxhY2Vob2xkZXIsIHJlcGxhY2VtZW50KTtcclxuICAgICAgaWYgKHVwZGF0ZWQgIT09IGNvbnRlbnQpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdXBkYXRlZCk7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBwYXR0ZXJuID0gbmV3IFJlZ0V4cChgPHNwYW5bXj5dKmRhdGEtc2VjdXJlLXdlYmRhdi10YXNrPVwiJHt0aGlzLmVzY2FwZVJlZ0V4cCh0YXNrSWQpfVwiW14+XSo+Lio/PFxcL3NwYW4+YCwgXCJzXCIpO1xyXG4gICAgaWYgKHBhdHRlcm4udGVzdChjb250ZW50KSkge1xyXG4gICAgICBjb25zdCB1cGRhdGVkID0gY29udGVudC5yZXBsYWNlKHBhdHRlcm4sIHJlcGxhY2VtZW50KTtcclxuICAgICAgaWYgKHVwZGF0ZWQgIT09IGNvbnRlbnQpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdXBkYXRlZCk7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGJ1aWxkRmFpbGVkUGxhY2Vob2xkZXIoZmlsZU5hbWU6IHN0cmluZywgbWVzc2FnZT86IHN0cmluZykge1xuICAgIGNvbnN0IHNhZmVOYW1lID0gdGhpcy5lc2NhcGVIdG1sKGZpbGVOYW1lKTtcbiAgICBjb25zdCBzYWZlTWVzc2FnZSA9IHRoaXMuZXNjYXBlSHRtbChtZXNzYWdlID8/IHRoaXMudChcIlx1NjcyQVx1NzdFNVx1OTUxOVx1OEJFRlwiLCBcIlVua25vd24gZXJyb3JcIikpO1xuICAgIHJldHVybiBgPHNwYW4gY2xhc3M9XCJzZWN1cmUtd2ViZGF2LWZhaWxlZFwiIGFyaWEtbGFiZWw9XCIke3NhZmVOYW1lfVwiPiR7dGhpcy5lc2NhcGVIdG1sKHRoaXMuZm9ybWF0RmFpbGVkTGFiZWwoZmlsZU5hbWUpKX06ICR7c2FmZU1lc3NhZ2V9PC9zcGFuPmA7XG4gIH1cblxuICBwcml2YXRlIGVzY2FwZUh0bWwodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiB2YWx1ZVxuICAgICAgLnJlcGxhY2UoLyYvZywgXCImYW1wO1wiKVxuICAgICAgLnJlcGxhY2UoL1wiL2csIFwiJnF1b3Q7XCIpXG4gICAgICAucmVwbGFjZSgvPC9nLCBcIiZsdDtcIilcbiAgICAgIC5yZXBsYWNlKC8+L2csIFwiJmd0O1wiKTtcbiAgfVxuXG4gIHByaXZhdGUgdW5lc2NhcGVIdG1sKHZhbHVlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdmFsdWVcbiAgICAgIC5yZXBsYWNlKC8mcXVvdDsvZywgXCJcXFwiXCIpXG4gICAgICAucmVwbGFjZSgvJmd0Oy9nLCBcIj5cIilcbiAgICAgIC5yZXBsYWNlKC8mbHQ7L2csIFwiPFwiKVxuICAgICAgLnJlcGxhY2UoLyZhbXA7L2csIFwiJlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmwocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBGZXRjaCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtyZXNwb25zZS5hcnJheUJ1ZmZlcl0sIHtcbiAgICAgIHR5cGU6IHJlc3BvbnNlLmhlYWRlcnNbXCJjb250ZW50LXR5cGVcIl0gPz8gXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIixcbiAgICB9KTtcbiAgICBjb25zdCBibG9iVXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICB0aGlzLmJsb2JVcmxzLmFkZChibG9iVXJsKTtcbiAgICByZXR1cm4gYmxvYlVybDtcbiAgfVxuXG4gIHByaXZhdGUgYXJyYXlCdWZmZXJUb0Jhc2U2NChidWZmZXI6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShidWZmZXIpO1xuICAgIGNvbnN0IGNodW5rU2l6ZSA9IDB4ODAwMDtcbiAgICBsZXQgYmluYXJ5ID0gXCJcIjtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYnl0ZXMubGVuZ3RoOyBpbmRleCArPSBjaHVua1NpemUpIHtcbiAgICAgIGNvbnN0IGNodW5rID0gYnl0ZXMuc3ViYXJyYXkoaW5kZXgsIGluZGV4ICsgY2h1bmtTaXplKTtcbiAgICAgIGJpbmFyeSArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKC4uLmNodW5rKTtcbiAgICB9XG4gICAgcmV0dXJuIGJ0b2EoYmluYXJ5KTtcbiAgfVxuXG4gIHByaXZhdGUgYmFzZTY0VG9BcnJheUJ1ZmZlcihiYXNlNjQ6IHN0cmluZykge1xuICAgIGNvbnN0IGJpbmFyeSA9IGF0b2IoYmFzZTY0KTtcbiAgICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KGJpbmFyeS5sZW5ndGgpO1xuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBiaW5hcnkubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgICBieXRlc1tpbmRleF0gPSBiaW5hcnkuY2hhckNvZGVBdChpbmRleCk7XG4gICAgfVxuICAgIHJldHVybiBieXRlcy5idWZmZXIuc2xpY2UoYnl0ZXMuYnl0ZU9mZnNldCwgYnl0ZXMuYnl0ZU9mZnNldCArIGJ5dGVzLmJ5dGVMZW5ndGgpIGFzIEFycmF5QnVmZmVyO1xuICB9XG5cbiAgcHJpdmF0ZSBhcnJheUJ1ZmZlcnNFcXVhbChsZWZ0OiBBcnJheUJ1ZmZlciwgcmlnaHQ6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgYSA9IG5ldyBVaW50OEFycmF5KGxlZnQpO1xuICAgIGNvbnN0IGIgPSBuZXcgVWludDhBcnJheShyaWdodCk7XG4gICAgaWYgKGEubGVuZ3RoICE9PSBiLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBhLmxlbmd0aDsgaW5kZXggKz0gMSkge1xuICAgICAgaWYgKGFbaW5kZXhdICE9PSBiW2luZGV4XSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkQ2xpcGJvYXJkRmlsZU5hbWUobWltZVR5cGU6IHN0cmluZykge1xuICAgIGNvbnN0IGV4dGVuc2lvbiA9IG1pbWVUeXBlLnNwbGl0KFwiL1wiKVsxXT8ucmVwbGFjZShcImpwZWdcIiwgXCJqcGdcIikgfHwgXCJwbmdcIjtcbiAgICByZXR1cm4gYHBhc3RlZC1pbWFnZS0ke0RhdGUubm93KCl9LiR7ZXh0ZW5zaW9ufWA7XG4gIH1cblxyXG4gIHByaXZhdGUgZXNjYXBlUmVnRXhwKHZhbHVlOiBzdHJpbmcpIHtcclxuICAgIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgXCJcXFxcJCZcIik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHJlcGxhY2VQbGFjZWhvbGRlckluT3BlbkVkaXRvcnMobm90ZVBhdGg6IHN0cmluZywgdGFza0lkOiBzdHJpbmcsIHBsYWNlaG9sZGVyOiBzdHJpbmcsIHJlcGxhY2VtZW50OiBzdHJpbmcpIHtcclxuICAgIGxldCByZXBsYWNlZCA9IGZhbHNlO1xyXG4gICAgY29uc3QgbGVhdmVzID0gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYXZlc09mVHlwZShcIm1hcmtkb3duXCIpO1xyXG5cclxuICAgIGZvciAoY29uc3QgbGVhZiBvZiBsZWF2ZXMpIHtcclxuICAgICAgY29uc3QgdmlldyA9IGxlYWYudmlldztcclxuICAgICAgaWYgKCEodmlldyBpbnN0YW5jZW9mIE1hcmtkb3duVmlldykpIHtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKCF2aWV3LmZpbGUgfHwgdmlldy5maWxlLnBhdGggIT09IG5vdGVQYXRoKSB7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGVkaXRvciA9IHZpZXcuZWRpdG9yO1xyXG4gICAgICBjb25zdCBjb250ZW50ID0gZWRpdG9yLmdldFZhbHVlKCk7XHJcbiAgICAgIGxldCB1cGRhdGVkID0gY29udGVudDtcclxuXHJcbiAgICAgIGlmIChjb250ZW50LmluY2x1ZGVzKHBsYWNlaG9sZGVyKSkge1xyXG4gICAgICAgIHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGxhY2Vob2xkZXIsIHJlcGxhY2VtZW50KTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zdCBwYXR0ZXJuID0gbmV3IFJlZ0V4cChcclxuICAgICAgICAgIGA8c3BhbltePl0qZGF0YS1zZWN1cmUtd2ViZGF2LXRhc2s9XCIke3RoaXMuZXNjYXBlUmVnRXhwKHRhc2tJZCl9XCJbXj5dKj4uKj88XFxcXC9zcGFuPmAsXHJcbiAgICAgICAgICBcInNcIixcclxuICAgICAgICApO1xyXG4gICAgICAgIHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGF0dGVybiwgcmVwbGFjZW1lbnQpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAodXBkYXRlZCAhPT0gY29udGVudCkge1xyXG4gICAgICAgIGVkaXRvci5zZXRWYWx1ZSh1cGRhdGVkKTtcclxuICAgICAgICByZXBsYWNlZCA9IHRydWU7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gcmVwbGFjZWQ7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIHByb2Nlc3NTZWN1cmVJbWFnZXMoZWw6IEhUTUxFbGVtZW50LCBjdHg6IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQpIHtcbiAgICBjb25zdCBzZWN1cmVOb2RlcyA9IEFycmF5LmZyb20oZWwucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXCJbZGF0YS1zZWN1cmUtd2ViZGF2XVwiKSk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXHJcbiAgICAgIHNlY3VyZU5vZGVzLm1hcChhc3luYyAobm9kZSkgPT4ge1xyXG4gICAgICAgIGlmIChub2RlIGluc3RhbmNlb2YgSFRNTEltYWdlRWxlbWVudCkge1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5zd2FwSW1hZ2VTb3VyY2Uobm9kZSk7XHJcbiAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCByZW1vdGVQYXRoID0gbm9kZS5nZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIik7XHJcbiAgICAgICAgaWYgKCFyZW1vdGVQYXRoKSB7XHJcbiAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xyXG4gICAgICAgIGltZy5hbHQgPSBub2RlLmdldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIikgPz8gbm9kZS5nZXRBdHRyaWJ1dGUoXCJhbHRcIikgPz8gXCJTZWN1cmUgV2ViREFWIGltYWdlXCI7XHJcbiAgICAgICAgaW1nLnNldEF0dHJpYnV0ZShcImRhdGEtc2VjdXJlLXdlYmRhdlwiLCByZW1vdGVQYXRoKTtcclxuICAgICAgICBpbWcuY2xhc3NMaXN0LmFkZChcInNlY3VyZS13ZWJkYXYtaW1hZ2VcIiwgXCJpcy1sb2FkaW5nXCIpO1xyXG4gICAgICAgIG5vZGUucmVwbGFjZVdpdGgoaW1nKTtcclxuICAgICAgICBhd2FpdCB0aGlzLnN3YXBJbWFnZVNvdXJjZShpbWcpO1xyXG4gICAgICB9KSxcclxuICAgICk7XHJcblxyXG4gICAgY29uc3Qgc2VjdXJlTGlua3MgPSBBcnJheS5mcm9tKGVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEltYWdlRWxlbWVudD4oYGltZ1tzcmNePVwiJHtTRUNVUkVfUFJPVE9DT0x9Ly9cIl1gKSk7XHJcbiAgICBhd2FpdCBQcm9taXNlLmFsbChzZWN1cmVMaW5rcy5tYXAoYXN5bmMgKGltZykgPT4gdGhpcy5zd2FwSW1hZ2VTb3VyY2UoaW1nKSkpO1xyXG5cbiAgICBjdHguYWRkQ2hpbGQobmV3IFNlY3VyZVdlYmRhdlJlbmRlckNoaWxkKGVsKSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHByb2Nlc3NTZWN1cmVDb2RlQmxvY2soc291cmNlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCwgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0KSB7XG4gICAgY29uc3QgcGFyc2VkID0gdGhpcy5wYXJzZVNlY3VyZUltYWdlQmxvY2soc291cmNlKTtcbiAgICBpZiAoIXBhcnNlZD8ucGF0aCkge1xuICAgICAgZWwuY3JlYXRlRWwoXCJkaXZcIiwge1xuICAgICAgICB0ZXh0OiB0aGlzLnQoXCJcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTRFRTNcdTc4MDFcdTU3NTdcdTY4M0NcdTVGMEZcdTY1RTBcdTY1NDhcdTMwMDJcIiwgXCJJbnZhbGlkIHNlY3VyZSBpbWFnZSBjb2RlIGJsb2NrIGZvcm1hdC5cIiksXG4gICAgICB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xuICAgIGltZy5hbHQgPSBwYXJzZWQuYWx0IHx8IHBhcnNlZC5wYXRoO1xuICAgIGltZy5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIiwgcGFyc2VkLnBhdGgpO1xuICAgIGltZy5jbGFzc0xpc3QuYWRkKFwic2VjdXJlLXdlYmRhdi1pbWFnZVwiLCBcImlzLWxvYWRpbmdcIik7XG4gICAgZWwuZW1wdHkoKTtcbiAgICBlbC5hcHBlbmRDaGlsZChpbWcpO1xuICAgIGF3YWl0IHRoaXMuc3dhcEltYWdlU291cmNlKGltZyk7XG4gICAgY3R4LmFkZENoaWxkKG5ldyBTZWN1cmVXZWJkYXZSZW5kZXJDaGlsZChlbCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBwYXJzZVNlY3VyZUltYWdlQmxvY2soc291cmNlOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQ6IHsgcGF0aDogc3RyaW5nOyBhbHQ6IHN0cmluZyB9ID0geyBwYXRoOiBcIlwiLCBhbHQ6IFwiXCIgfTtcbiAgICBmb3IgKGNvbnN0IHJhd0xpbmUgb2Ygc291cmNlLnNwbGl0KC9cXHI/XFxuLykpIHtcbiAgICAgIGNvbnN0IGxpbmUgPSByYXdMaW5lLnRyaW0oKTtcbiAgICAgIGlmICghbGluZSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc2VwYXJhdG9ySW5kZXggPSBsaW5lLmluZGV4T2YoXCI6XCIpO1xuICAgICAgaWYgKHNlcGFyYXRvckluZGV4ID09PSAtMSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qga2V5ID0gbGluZS5zbGljZSgwLCBzZXBhcmF0b3JJbmRleCkudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgICBjb25zdCB2YWx1ZSA9IGxpbmUuc2xpY2Uoc2VwYXJhdG9ySW5kZXggKyAxKS50cmltKCk7XG4gICAgICBpZiAoa2V5ID09PSBcInBhdGhcIikge1xuICAgICAgICByZXN1bHQucGF0aCA9IHZhbHVlO1xuICAgICAgfSBlbHNlIGlmIChrZXkgPT09IFwiYWx0XCIpIHtcbiAgICAgICAgcmVzdWx0LmFsdCA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQucGF0aCA/IHJlc3VsdCA6IG51bGw7XG4gIH1cblxyXG4gIHByaXZhdGUgYXN5bmMgc3dhcEltYWdlU291cmNlKGltZzogSFRNTEltYWdlRWxlbWVudCkge1xyXG4gICAgY29uc3QgcmVtb3RlUGF0aCA9XHJcbiAgICAgIGltZy5nZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIikgPz8gdGhpcy5leHRyYWN0UmVtb3RlUGF0aChpbWcuZ2V0QXR0cmlidXRlKFwic3JjXCIpID8/IFwiXCIpO1xyXG4gICAgaWYgKCFyZW1vdGVQYXRoKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpbWcuY2xhc3NMaXN0LmFkZChcInNlY3VyZS13ZWJkYXYtaW1hZ2VcIiwgXCJpcy1sb2FkaW5nXCIpO1xyXG4gICAgY29uc3Qgb3JpZ2luYWxBbHQgPSBpbWcuYWx0O1xyXG4gICAgaW1nLmFsdCA9IG9yaWdpbmFsQWx0IHx8IHRoaXMudChcIlx1NTJBMFx1OEY3RFx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NEUyRC4uLlwiLCBcIkxvYWRpbmcgc2VjdXJlIGltYWdlLi4uXCIpO1xyXG5cclxuICAgIHRyeSB7XG4gICAgICBjb25zdCBibG9iVXJsID0gYXdhaXQgdGhpcy5mZXRjaFNlY3VyZUltYWdlQmxvYlVybChyZW1vdGVQYXRoKTtcbiAgICAgIGltZy5zcmMgPSBibG9iVXJsO1xuICAgICAgaW1nLmFsdCA9IG9yaWdpbmFsQWx0O1xuICAgICAgaW1nLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgICBpbWcuc3R5bGUubWF4V2lkdGggPSBcIjEwMCVcIjtcclxuICAgICAgaW1nLmNsYXNzTGlzdC5yZW1vdmUoXCJpcy1sb2FkaW5nXCIsIFwiaXMtZXJyb3JcIik7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiU2VjdXJlIFdlYkRBViBpbWFnZSBsb2FkIGZhaWxlZFwiLCBlcnJvcik7XHJcbiAgICAgIGltZy5yZXBsYWNlV2l0aCh0aGlzLmJ1aWxkRXJyb3JFbGVtZW50KHJlbW90ZVBhdGgsIGVycm9yKSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGV4dHJhY3RSZW1vdGVQYXRoKHNyYzogc3RyaW5nKSB7XHJcbiAgICBjb25zdCBwcmVmaXggPSBgJHtTRUNVUkVfUFJPVE9DT0x9Ly9gO1xyXG4gICAgaWYgKCFzcmMuc3RhcnRzV2l0aChwcmVmaXgpKSB7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBzcmMuc2xpY2UocHJlZml4Lmxlbmd0aCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGJ1aWxkUmVtb3RlUGF0aChmaWxlTmFtZTogc3RyaW5nKSB7XHJcbiAgICByZXR1cm4gYCR7dGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5zZXR0aW5ncy5yZW1vdGVGb2xkZXIpfSR7ZmlsZU5hbWV9YDtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnkoZmlsZU5hbWU6IHN0cmluZywgYmluYXJ5OiBBcnJheUJ1ZmZlcikge1xuICAgIGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbUZpbGVOYW1lKGZpbGVOYW1lKTtcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5uYW1pbmdTdHJhdGVneSA9PT0gXCJoYXNoXCIpIHtcbiAgICAgIGNvbnN0IGhhc2ggPSAoYXdhaXQgdGhpcy5jb21wdXRlU2hhMjU2SGV4KGJpbmFyeSkpLnNsaWNlKDAsIDE2KTtcbiAgICAgIHJldHVybiBgJHtoYXNofS4ke2V4dGVuc2lvbn1gO1xuICAgIH1cblxyXG4gICAgcmV0dXJuIGAke0RhdGUubm93KCl9LSR7ZmlsZU5hbWV9YDtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aDogc3RyaW5nKSB7XHJcbiAgICBjb25zdCBiYXNlID0gdGhpcy5zZXR0aW5ncy53ZWJkYXZVcmwucmVwbGFjZSgvXFwvKyQvLCBcIlwiKTtcclxuICAgIHJldHVybiBgJHtiYXNlfS8ke3JlbW90ZVBhdGguc3BsaXQoXCIvXCIpLm1hcChlbmNvZGVVUklDb21wb25lbnQpLmpvaW4oXCIvXCIpfWA7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIG5vcm1hbGl6ZUZvbGRlcihpbnB1dDogc3RyaW5nKSB7XHJcbiAgICByZXR1cm4gaW5wdXQucmVwbGFjZSgvXlxcLysvLCBcIlwiKS5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpICsgXCIvXCI7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGJ1aWxkQXV0aEhlYWRlcigpIHtcbiAgICBjb25zdCB0b2tlbiA9IHRoaXMuYXJyYXlCdWZmZXJUb0Jhc2U2NCh0aGlzLmVuY29kZVV0ZjgoYCR7dGhpcy5zZXR0aW5ncy51c2VybmFtZX06JHt0aGlzLnNldHRpbmdzLnBhc3N3b3JkfWApKTtcbiAgICByZXR1cm4gYEJhc2ljICR7dG9rZW59YDtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBlbnN1cmVDb25maWd1cmVkKCkge1xyXG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLndlYmRhdlVybCB8fCAhdGhpcy5zZXR0aW5ncy51c2VybmFtZSB8fCAhdGhpcy5zZXR0aW5ncy5wYXNzd29yZCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiV2ViREFWIFx1OTE0RFx1N0Y2RVx1NEUwRFx1NUI4Q1x1NjU3NFx1MzAwMlwiLCBcIldlYkRBViBzZXR0aW5ncyBhcmUgaW5jb21wbGV0ZS5cIikpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBnZXRNaW1lVHlwZShleHRlbnNpb246IHN0cmluZykge1xyXG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IGV4dGVuc2lvbi50b0xvd2VyQ2FzZSgpO1xyXG4gICAgaWYgKG5vcm1hbGl6ZWQgPT09IFwianBnXCIgfHwgbm9ybWFsaXplZCA9PT0gXCJqcGVnXCIpIHJldHVybiBcImltYWdlL2pwZWdcIjtcclxuICAgIGlmIChub3JtYWxpemVkID09PSBcInBuZ1wiKSByZXR1cm4gXCJpbWFnZS9wbmdcIjtcclxuICAgIGlmIChub3JtYWxpemVkID09PSBcImdpZlwiKSByZXR1cm4gXCJpbWFnZS9naWZcIjtcclxuICAgIGlmIChub3JtYWxpemVkID09PSBcIndlYnBcIikgcmV0dXJuIFwiaW1hZ2Uvd2VicFwiO1xyXG4gICAgaWYgKG5vcm1hbGl6ZWQgPT09IFwic3ZnXCIpIHJldHVybiBcImltYWdlL3N2Zyt4bWxcIjtcclxuICAgIGlmIChub3JtYWxpemVkID09PSBcImJtcFwiKSByZXR1cm4gXCJpbWFnZS9ibXBcIjtcclxuICAgIHJldHVybiBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBnZXRNaW1lVHlwZUZyb21GaWxlTmFtZShmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0TWltZVR5cGUodGhpcy5nZXRFeHRlbnNpb25Gcm9tRmlsZU5hbWUoZmlsZU5hbWUpKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0RXh0ZW5zaW9uRnJvbUZpbGVOYW1lKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBwaWVjZXMgPSBmaWxlTmFtZS5zcGxpdChcIi5cIik7XG4gICAgcmV0dXJuIHBpZWNlcy5sZW5ndGggPiAxID8gcGllY2VzW3BpZWNlcy5sZW5ndGggLSAxXS50b0xvd2VyQ2FzZSgpIDogXCJwbmdcIjtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcHJlcGFyZVVwbG9hZFBheWxvYWQoYmluYXJ5OiBBcnJheUJ1ZmZlciwgbWltZVR5cGU6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGlmICghdGhpcy5zZXR0aW5ncy5jb21wcmVzc0ltYWdlcykge1xuICAgICAgcmV0dXJuIHsgYmluYXJ5LCBtaW1lVHlwZSwgZmlsZU5hbWUgfTtcbiAgICB9XG5cbiAgICBjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRoaXMuY29tcHJlc3NJbWFnZUlmTmVlZGVkKGJpbmFyeSwgbWltZVR5cGUsIGZpbGVOYW1lKTtcbiAgICByZXR1cm4gcHJlcGFyZWQgPz8geyBiaW5hcnksIG1pbWVUeXBlLCBmaWxlTmFtZSB9O1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjb21wcmVzc0ltYWdlSWZOZWVkZWQoYmluYXJ5OiBBcnJheUJ1ZmZlciwgbWltZVR5cGU6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGlmICghL15pbWFnZVxcLyhwbmd8anBlZ3xqcGd8d2VicCkkL2kudGVzdChtaW1lVHlwZSkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IHRocmVzaG9sZEJ5dGVzID0gdGhpcy5zZXR0aW5ncy5jb21wcmVzc1RocmVzaG9sZEtiICogMTAyNDtcbiAgICBjb25zdCBzb3VyY2VCbG9iID0gbmV3IEJsb2IoW2JpbmFyeV0sIHsgdHlwZTogbWltZVR5cGUgfSk7XG4gICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB0aGlzLmxvYWRJbWFnZUVsZW1lbnQoc291cmNlQmxvYik7XG4gICAgY29uc3QgbGFyZ2VzdFNpZGUgPSBNYXRoLm1heChpbWFnZS5uYXR1cmFsV2lkdGgsIGltYWdlLm5hdHVyYWxIZWlnaHQpO1xuICAgIGNvbnN0IG5lZWRzUmVzaXplID0gbGFyZ2VzdFNpZGUgPiB0aGlzLnNldHRpbmdzLm1heEltYWdlRGltZW5zaW9uO1xuICAgIGNvbnN0IG5lZWRzQ29tcHJlc3MgPSBzb3VyY2VCbG9iLnNpemUgPiB0aHJlc2hvbGRCeXRlcyB8fCBuZWVkc1Jlc2l6ZTtcbiAgICBpZiAoIW5lZWRzQ29tcHJlc3MpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IHNjYWxlID0gbmVlZHNSZXNpemUgPyB0aGlzLnNldHRpbmdzLm1heEltYWdlRGltZW5zaW9uIC8gbGFyZ2VzdFNpZGUgOiAxO1xuICAgIGNvbnN0IHRhcmdldFdpZHRoID0gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChpbWFnZS5uYXR1cmFsV2lkdGggKiBzY2FsZSkpO1xuICAgIGNvbnN0IHRhcmdldEhlaWdodCA9IE1hdGgubWF4KDEsIE1hdGgucm91bmQoaW1hZ2UubmF0dXJhbEhlaWdodCAqIHNjYWxlKSk7XG4gICAgY29uc3QgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImNhbnZhc1wiKTtcbiAgICBjYW52YXMud2lkdGggPSB0YXJnZXRXaWR0aDtcbiAgICBjYW52YXMuaGVpZ2h0ID0gdGFyZ2V0SGVpZ2h0O1xuICAgIGNvbnN0IGNvbnRleHQgPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpO1xuICAgIGlmICghY29udGV4dCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29udGV4dC5kcmF3SW1hZ2UoaW1hZ2UsIDAsIDAsIHRhcmdldFdpZHRoLCB0YXJnZXRIZWlnaHQpO1xuXG4gICAgY29uc3Qgb3V0cHV0TWltZSA9IG1pbWVUeXBlLnRvTG93ZXJDYXNlKCkgPT09IFwiaW1hZ2UvanBnXCIgPyBcImltYWdlL2pwZWdcIiA6IG1pbWVUeXBlO1xuICAgIGNvbnN0IHF1YWxpdHkgPSBNYXRoLm1heCgwLjQsIE1hdGgubWluKDAuOTgsIHRoaXMuc2V0dGluZ3MuanBlZ1F1YWxpdHkgLyAxMDApKTtcbiAgICBjb25zdCBjb21wcmVzc2VkQmxvYiA9IGF3YWl0IG5ldyBQcm9taXNlPEJsb2IgfCBudWxsPigocmVzb2x2ZSkgPT4ge1xuICAgICAgY2FudmFzLnRvQmxvYihyZXNvbHZlLCBvdXRwdXRNaW1lLCBxdWFsaXR5KTtcbiAgICB9KTtcblxuICAgIGlmICghY29tcHJlc3NlZEJsb2IpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmICghbmVlZHNSZXNpemUgJiYgY29tcHJlc3NlZEJsb2Iuc2l6ZSA+PSBzb3VyY2VCbG9iLnNpemUpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IG5leHRCaW5hcnkgPSBhd2FpdCBjb21wcmVzc2VkQmxvYi5hcnJheUJ1ZmZlcigpO1xuICAgIGNvbnN0IG5leHRFeHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbkZyb21NaW1lVHlwZShvdXRwdXRNaW1lKSA/PyB0aGlzLmdldEV4dGVuc2lvbkZyb21GaWxlTmFtZShmaWxlTmFtZSk7XG4gICAgY29uc3QgbmV4dEZpbGVOYW1lID0gZmlsZU5hbWUucmVwbGFjZSgvXFwuW14uXSskLywgXCJcIikgKyBgLiR7bmV4dEV4dGVuc2lvbn1gO1xuICAgIHJldHVybiB7XG4gICAgICBiaW5hcnk6IG5leHRCaW5hcnksXG4gICAgICBtaW1lVHlwZTogb3V0cHV0TWltZSxcbiAgICAgIGZpbGVOYW1lOiBuZXh0RmlsZU5hbWUsXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgbG9hZEltYWdlRWxlbWVudChibG9iOiBCbG9iKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPEhUTUxJbWFnZUVsZW1lbnQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICBjb25zdCBpbWFnZSA9IG5ldyBJbWFnZSgpO1xuICAgICAgaW1hZ2Uub25sb2FkID0gKCkgPT4ge1xuICAgICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG4gICAgICAgIHJlc29sdmUoaW1hZ2UpO1xuICAgICAgfTtcbiAgICAgIGltYWdlLm9uZXJyb3IgPSAoZXJyb3IpID0+IHtcbiAgICAgICAgVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfTtcbiAgICAgIGltYWdlLnNyYyA9IHVybDtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgZXh0ZW5zaW9uRnJvbU1pbWVUeXBlKG1pbWVUeXBlOiBzdHJpbmcpIHtcbiAgICBpZiAobWltZVR5cGUgPT09IFwiaW1hZ2UvanBlZ1wiKSByZXR1cm4gXCJqcGdcIjtcbiAgICBpZiAobWltZVR5cGUgPT09IFwiaW1hZ2UvcG5nXCIpIHJldHVybiBcInBuZ1wiO1xuICAgIGlmIChtaW1lVHlwZSA9PT0gXCJpbWFnZS93ZWJwXCIpIHJldHVybiBcIndlYnBcIjtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBhc3luYyB0cmFzaElmRXhpc3RzKGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LnRyYXNoKGZpbGUsIHRydWUpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS53YXJuKFwiRmFpbGVkIHRvIHRyYXNoIGxvY2FsIGltYWdlIGFmdGVyIHVwbG9hZFwiLCBlcnJvcik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsOiBzdHJpbmcsIGFsdDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuZXh0cmFjdFJlbW90ZVBhdGgocmVtb3RlVXJsKTtcbiAgICBpZiAoIXJlbW90ZVBhdGgpIHtcbiAgICAgIHJldHVybiBgIVtdKCR7cmVtb3RlVXJsfSlgO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmJ1aWxkU2VjdXJlSW1hZ2VDb2RlQmxvY2socmVtb3RlUGF0aCwgYWx0KTtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayhyZW1vdGVQYXRoOiBzdHJpbmcsIGFsdDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZEFsdCA9IChhbHQgfHwgcmVtb3RlUGF0aCkucmVwbGFjZSgvXFxyP1xcbi9nLCBcIiBcIikudHJpbSgpO1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gcmVtb3RlUGF0aC5yZXBsYWNlKC9cXHI/XFxuL2csIFwiXCIpLnRyaW0oKTtcbiAgICByZXR1cm4gW1xuICAgICAgYFxcYFxcYFxcYCR7U0VDVVJFX0NPREVfQkxPQ0t9YCxcbiAgICAgIGBwYXRoOiAke25vcm1hbGl6ZWRQYXRofWAsXG4gICAgICBgYWx0OiAke25vcm1hbGl6ZWRBbHR9YCxcbiAgICAgIFwiYGBgXCIsXG4gICAgXS5qb2luKFwiXFxuXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBmb3JtYXRFbWJlZExhYmVsKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy50KGBcdTMwMTBcdTVCODlcdTUxNjhcdThGRENcdTdBMEJcdTU2RkVcdTcyNDdcdUZGNUMke2ZpbGVOYW1lfVx1MzAxMWAsIGBbU2VjdXJlIHJlbW90ZSBpbWFnZSB8ICR7ZmlsZU5hbWV9XWApO1xuICB9XG5cbiAgcHJpdmF0ZSBmb3JtYXRGYWlsZWRMYWJlbChmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMudChgXHUzMDEwXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU1OTMxXHU4RDI1XHVGRjVDJHtmaWxlTmFtZX1cdTMwMTFgLCBgW0ltYWdlIHVwbG9hZCBmYWlsZWQgfCAke2ZpbGVOYW1lfV1gKTtcbiAgfVxuXG4gIGFzeW5jIG1pZ3JhdGVBbGxMZWdhY3lTZWN1cmVJbWFnZXMoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVwbG9hZENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgICAgIGNvbnN0IGNhbmRpZGF0ZUxvY2FsSW1hZ2VzID0gbmV3IE1hcDxzdHJpbmcsIFRGaWxlPigpO1xuICAgICAgbGV0IGNoYW5nZWRGaWxlcyA9IDA7XG4gICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgdGhpcy5hcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpKSB7XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICBjb25zdCByZXBsYWNlbWVudHMgPSBhd2FpdCB0aGlzLmJ1aWxkVXBsb2FkUmVwbGFjZW1lbnRzKGNvbnRlbnQsIGZpbGUsIHVwbG9hZENhY2hlKTtcbiAgICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcbiAgICAgICAgICBpZiAocmVwbGFjZW1lbnQuc291cmNlRmlsZSkge1xuICAgICAgICAgICAgY2FuZGlkYXRlTG9jYWxJbWFnZXMuc2V0KHJlcGxhY2VtZW50LnNvdXJjZUZpbGUucGF0aCwgcmVwbGFjZW1lbnQuc291cmNlRmlsZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHVwZGF0ZWQgPSBjb250ZW50O1xuICAgICAgICBmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIHJlcGxhY2VtZW50cykge1xuICAgICAgICAgIHVwZGF0ZWQgPSB1cGRhdGVkLnNwbGl0KHJlcGxhY2VtZW50Lm9yaWdpbmFsKS5qb2luKHJlcGxhY2VtZW50LnJld3JpdHRlbik7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVkID0gdXBkYXRlZFxuICAgICAgICAgIC5yZXBsYWNlKFxuICAgICAgICAgICAgLzxzcGFuIGNsYXNzPVwic2VjdXJlLXdlYmRhdi1lbWJlZFwiIGRhdGEtc2VjdXJlLXdlYmRhdj1cIihbXlwiXSspXCIgYXJpYS1sYWJlbD1cIihbXlwiXSopXCI+Lio/PFxcL3NwYW4+L2csXG4gICAgICAgICAgICAoX21hdGNoLCByZW1vdGVQYXRoOiBzdHJpbmcsIGFsdDogc3RyaW5nKSA9PlxuICAgICAgICAgICAgICB0aGlzLmJ1aWxkU2VjdXJlSW1hZ2VDb2RlQmxvY2soXG4gICAgICAgICAgICAgICAgdGhpcy51bmVzY2FwZUh0bWwocmVtb3RlUGF0aCksXG4gICAgICAgICAgICAgICAgdGhpcy51bmVzY2FwZUh0bWwoYWx0KSB8fCB0aGlzLnVuZXNjYXBlSHRtbChyZW1vdGVQYXRoKSxcbiAgICAgICAgICAgICAgKSxcbiAgICAgICAgICApXG4gICAgICAgICAgLnJlcGxhY2UoXG4gICAgICAgICAgICAvIVxcW1teXFxdXSpdXFwod2ViZGF2LXNlY3VyZTpcXC9cXC8oW14pXSspXFwpL2csXG4gICAgICAgICAgICAoX21hdGNoLCByZW1vdGVQYXRoOiBzdHJpbmcpID0+XG4gICAgICAgICAgICAgIHRoaXMuYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayh0aGlzLnVuZXNjYXBlSHRtbChyZW1vdGVQYXRoKSwgdGhpcy51bmVzY2FwZUh0bWwocmVtb3RlUGF0aCkpLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgaWYgKHVwZGF0ZWQgPT09IGNvbnRlbnQpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB1cGRhdGVkKTtcbiAgICAgICAgY2hhbmdlZEZpbGVzICs9IDE7XG4gICAgICB9XG5cbiAgICAgIGlmIChjaGFuZ2VkRmlsZXMgPT09IDApIHtcbiAgICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgICB0aGlzLnQoXG4gICAgICAgICAgICBcIlx1NjU3NFx1NUU5M1x1OTFDQ1x1NkNBMVx1NjcwOVx1NTNEMVx1NzNCMFx1NTNFRlx1OEZDMVx1NzlGQlx1NzY4NFx1NjVFN1x1NzI0OFx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NjgwN1x1N0I3RVx1MzAwMlwiLFxuICAgICAgICAgICAgXCJObyBsZWdhY3kgc2VjdXJlIGltYWdlIHRhZ3Mgd2VyZSBmb3VuZCBpbiB0aGUgdmF1bHQuXCIsXG4gICAgICAgICAgKSxcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5kZWxldGVMb2NhbEFmdGVyVXBsb2FkKSB7XG4gICAgICAgIGF3YWl0IHRoaXMudHJhc2hNaWdyYXRlZEltYWdlc0lmU2FmZShjYW5kaWRhdGVMb2NhbEltYWdlcyk7XG4gICAgICB9XG5cbiAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgIHRoaXMudChcbiAgICAgICAgICBgXHU1REYyXHU4RkMxXHU3OUZCICR7Y2hhbmdlZEZpbGVzfSBcdTdCQzdcdTdCMTRcdThCQjBcdTUyMzBcdTY1QjBcdTc2ODRcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTRFRTNcdTc4MDFcdTU3NTdcdTY4M0NcdTVGMEZcdTMwMDJgLFxuICAgICAgICAgIGBNaWdyYXRlZCAke2NoYW5nZWRGaWxlc30gbm90ZShzKSB0byB0aGUgbmV3IHNlY3VyZSBpbWFnZSBjb2RlLWJsb2NrIGZvcm1hdC5gLFxuICAgICAgICApLFxuICAgICAgICA4MDAwLFxuICAgICAgKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBtaWdyYXRlIHNlY3VyZSBpbWFnZXMgdG8gY29kZSBibG9ja3NcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU4RkMxXHU3OUZCXHU1Qjg5XHU1MTY4XHU1NkZFXHU3MjQ3XHU2ODNDXHU1RjBGXHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIG1pZ3JhdGUgc2VjdXJlIGltYWdlIGZvcm1hdFwiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHRyYXNoTWlncmF0ZWRJbWFnZXNJZlNhZmUoY2FuZGlkYXRlTG9jYWxJbWFnZXM6IE1hcDxzdHJpbmcsIFRGaWxlPikge1xuICAgIGlmIChjYW5kaWRhdGVMb2NhbEltYWdlcy5zaXplID09PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgcmVtYWluaW5nUmVmcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGZvciAoY29uc3Qgbm90ZSBvZiB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkpIHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKG5vdGUpO1xuICAgICAgY29uc3Qgd2lraU1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvIVxcW1xcWyhbXlxcXV0rKVxcXVxcXS9nKV07XG4gICAgICBjb25zdCBtYXJrZG93bk1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvIVxcW1teXFxdXSpdXFwoKFteKV0rKVxcKS9nKV07XG5cbiAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2Ygd2lraU1hdGNoZXMpIHtcbiAgICAgICAgY29uc3QgcmF3TGluayA9IG1hdGNoWzFdLnNwbGl0KFwifFwiKVswXS50cmltKCk7XG4gICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMucmVzb2x2ZUxpbmtlZEZpbGUocmF3TGluaywgbm90ZS5wYXRoKTtcbiAgICAgICAgaWYgKHRhcmdldCAmJiB0aGlzLmlzSW1hZ2VGaWxlKHRhcmdldCkpIHtcbiAgICAgICAgICByZW1haW5pbmdSZWZzLmFkZCh0YXJnZXQucGF0aCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXJrZG93bk1hdGNoZXMpIHtcbiAgICAgICAgY29uc3QgcmF3TGluayA9IGRlY29kZVVSSUNvbXBvbmVudChtYXRjaFsxXS50cmltKCkucmVwbGFjZSgvXjx8PiQvZywgXCJcIikpO1xuICAgICAgICBpZiAoL14oaHR0cHM/Onx3ZWJkYXYtc2VjdXJlOnxkYXRhOikvaS50ZXN0KHJhd0xpbmspKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGUucGF0aCk7XG4gICAgICAgIGlmICh0YXJnZXQgJiYgdGhpcy5pc0ltYWdlRmlsZSh0YXJnZXQpKSB7XG4gICAgICAgICAgcmVtYWluaW5nUmVmcy5hZGQodGFyZ2V0LnBhdGgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBbcGF0aCwgZmlsZV0gb2YgY2FuZGlkYXRlTG9jYWxJbWFnZXMuZW50cmllcygpKSB7XG4gICAgICBpZiAocmVtYWluaW5nUmVmcy5oYXMocGF0aCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMudHJhc2hJZkV4aXN0cyhmaWxlKTtcbiAgICB9XG4gIH1cblxyXG4gIHByaXZhdGUgYnVpbGRFcnJvckVsZW1lbnQocmVtb3RlUGF0aDogc3RyaW5nLCBlcnJvcjogdW5rbm93bikge1xyXG4gICAgY29uc3QgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgZWwuY2xhc3NOYW1lID0gXCJzZWN1cmUtd2ViZGF2LWltYWdlIGlzLWVycm9yXCI7XHJcbiAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xyXG4gICAgZWwudGV4dENvbnRlbnQgPSB0aGlzLnQoXHJcbiAgICAgIGBcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTUyQTBcdThGN0RcdTU5MzFcdThEMjVcdUZGMUEke3JlbW90ZVBhdGh9XHVGRjA4JHttZXNzYWdlfVx1RkYwOWAsXHJcbiAgICAgIGBTZWN1cmUgaW1hZ2UgZmFpbGVkOiAke3JlbW90ZVBhdGh9ICgke21lc3NhZ2V9KWAsXHJcbiAgICApO1xyXG4gICAgcmV0dXJuIGVsO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgcnVuQ29ubmVjdGlvblRlc3Qoc2hvd01vZGFsID0gZmFsc2UpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xyXG5cclxuICAgICAgY29uc3QgcHJvYmVOYW1lID0gYC5zZWN1cmUtd2ViZGF2LXByb2JlLSR7RGF0ZS5ub3coKX0udHh0YDtcclxuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRSZW1vdGVQYXRoKHByb2JlTmFtZSk7XHJcbiAgICAgIGNvbnN0IHVwbG9hZFVybCA9IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCk7XHJcbiAgICAgIGNvbnN0IHByb2JlQXJyYXlCdWZmZXIgPSB0aGlzLmVuY29kZVV0ZjgoYHNlY3VyZS13ZWJkYXYgcHJvYmUgJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCl9YCk7XG5cclxuICAgICAgY29uc3QgcHV0UmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xyXG4gICAgICAgIHVybDogdXBsb2FkVXJsLFxyXG4gICAgICAgIG1ldGhvZDogXCJQVVRcIixcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxyXG4gICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJ0ZXh0L3BsYWluOyBjaGFyc2V0PXV0Zi04XCIsXHJcbiAgICAgICAgfSxcclxuICAgICAgICBib2R5OiBwcm9iZUFycmF5QnVmZmVyLFxyXG4gICAgICB9KTtcclxuICAgICAgaWYgKHB1dFJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCBwdXRSZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBQVVQgZmFpbGVkIHdpdGggc3RhdHVzICR7cHV0UmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBnZXRSZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XHJcbiAgICAgICAgdXJsOiB1cGxvYWRVcmwsXHJcbiAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxyXG4gICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXHJcbiAgICAgICAgfSxcclxuICAgICAgfSk7XHJcbiAgICAgIGlmIChnZXRSZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgZ2V0UmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgR0VUIGZhaWxlZCB3aXRoIHN0YXR1cyAke2dldFJlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZGVsZXRlUmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xyXG4gICAgICAgIHVybDogdXBsb2FkVXJsLFxyXG4gICAgICAgIG1ldGhvZDogXCJERUxFVEVcIixcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0pO1xyXG4gICAgICBpZiAoZGVsZXRlUmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IGRlbGV0ZVJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYERFTEVURSBmYWlsZWQgd2l0aCBzdGF0dXMgJHtkZWxldGVSZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSB0aGlzLnQoXHJcbiAgICAgICAgYFdlYkRBViBcdTZENEJcdThCRDVcdTkwMUFcdThGQzdcdTMwMDJQVVQgJHtwdXRSZXNwb25zZS5zdGF0dXN9XHVGRjBDR0VUICR7Z2V0UmVzcG9uc2Uuc3RhdHVzfVx1RkYwQ0RFTEVURSAke2RlbGV0ZVJlc3BvbnNlLnN0YXR1c31cdTMwMDJgLFxyXG4gICAgICAgIGBXZWJEQVYgdGVzdCBwYXNzZWQuIFBVVCAke3B1dFJlc3BvbnNlLnN0YXR1c30sIEdFVCAke2dldFJlc3BvbnNlLnN0YXR1c30sIERFTEVURSAke2RlbGV0ZVJlc3BvbnNlLnN0YXR1c30uYCxcclxuICAgICAgKTtcclxuICAgICAgbmV3IE5vdGljZShtZXNzYWdlLCA2MDAwKTtcclxuICAgICAgaWYgKHNob3dNb2RhbCkge1xyXG4gICAgICAgIG5ldyBSZXN1bHRNb2RhbCh0aGlzLmFwcCwgdGhpcy50KFwiV2ViREFWIFx1OEZERVx1NjNBNVwiLCBcIldlYkRBViBDb25uZWN0aW9uXCIpLCBtZXNzYWdlKS5vcGVuKCk7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiU2VjdXJlIFdlYkRBViB0ZXN0IGZhaWxlZFwiLCBlcnJvcik7XHJcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSB0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiV2ViREFWIFx1NkQ0Qlx1OEJENVx1NTkzMVx1OEQyNVwiLCBcIldlYkRBViB0ZXN0IGZhaWxlZFwiKSwgZXJyb3IpO1xyXG4gICAgICBuZXcgTm90aWNlKG1lc3NhZ2UsIDgwMDApO1xyXG4gICAgICBpZiAoc2hvd01vZGFsKSB7XHJcbiAgICAgICAgbmV3IFJlc3VsdE1vZGFsKHRoaXMuYXBwLCB0aGlzLnQoXCJXZWJEQVYgXHU4RkRFXHU2M0E1XCIsIFwiV2ViREFWIENvbm5lY3Rpb25cIiksIG1lc3NhZ2UpLm9wZW4oKTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGRlc2NyaWJlRXJyb3IocHJlZml4OiBzdHJpbmcsIGVycm9yOiB1bmtub3duKSB7XHJcbiAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xyXG4gICAgcmV0dXJuIGAke3ByZWZpeH06ICR7bWVzc2FnZX1gO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyByZXF1ZXN0VXJsKG9wdGlvbnM6IHtcbiAgICB1cmw6IHN0cmluZztcbiAgICBtZXRob2Q6IHN0cmluZztcbiAgICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgICBib2R5PzogQXJyYXlCdWZmZXI7XG4gICAgZm9sbG93UmVkaXJlY3RzPzogYm9vbGVhbjtcbiAgICByZWRpcmVjdENvdW50PzogbnVtYmVyO1xuICB9KTogUHJvbWlzZTx7IHN0YXR1czogbnVtYmVyOyBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+OyBhcnJheUJ1ZmZlcjogQXJyYXlCdWZmZXIgfT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb2JzaWRpYW5SZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogb3B0aW9ucy51cmwsXG4gICAgICBtZXRob2Q6IG9wdGlvbnMubWV0aG9kLFxuICAgICAgaGVhZGVyczogb3B0aW9ucy5oZWFkZXJzLFxuICAgICAgYm9keTogb3B0aW9ucy5ib2R5LFxuICAgICAgdGhyb3c6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogcmVzcG9uc2Uuc3RhdHVzLFxuICAgICAgaGVhZGVyczogcmVzcG9uc2UuaGVhZGVycyxcbiAgICAgIGFycmF5QnVmZmVyOiByZXNwb25zZS5hcnJheUJ1ZmZlcixcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBlbmNvZGVVdGY4KHZhbHVlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBieXRlcyA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSh2YWx1ZSk7XG4gICAgcmV0dXJuIGJ5dGVzLmJ1ZmZlci5zbGljZShieXRlcy5ieXRlT2Zmc2V0LCBieXRlcy5ieXRlT2Zmc2V0ICsgYnl0ZXMuYnl0ZUxlbmd0aCkgYXMgQXJyYXlCdWZmZXI7XG4gIH1cblxuICBwcml2YXRlIGRlY29kZVV0ZjgoYnVmZmVyOiBBcnJheUJ1ZmZlcikge1xuICAgIHJldHVybiBuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoYnVmZmVyKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY29tcHV0ZVNoYTI1NkhleChidWZmZXI6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgZGlnZXN0ID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3QoXCJTSEEtMjU2XCIsIGJ1ZmZlcik7XG4gICAgcmV0dXJuIEFycmF5LmZyb20obmV3IFVpbnQ4QXJyYXkoZGlnZXN0KSlcbiAgICAgIC5tYXAoKHZhbHVlKSA9PiB2YWx1ZS50b1N0cmluZygxNikucGFkU3RhcnQoMiwgXCIwXCIpKVxuICAgICAgLmpvaW4oXCJcIik7XG4gIH1cbn1cblxyXG5jbGFzcyBTZWN1cmVXZWJkYXZSZW5kZXJDaGlsZCBleHRlbmRzIE1hcmtkb3duUmVuZGVyQ2hpbGQge1xuICBvbnVubG9hZCgpOiB2b2lkIHt9XG59XG5cbnR5cGUgVXBsb2FkUmV3cml0ZSA9IHtcbiAgb3JpZ2luYWw6IHN0cmluZztcbiAgcmV3cml0dGVuOiBzdHJpbmc7XG4gIHNvdXJjZUZpbGU/OiBURmlsZTtcbn07XG5cclxuY2xhc3MgU2VjdXJlV2ViZGF2U2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xyXG4gIHBsdWdpbjogU2VjdXJlV2ViZGF2SW1hZ2VzUGx1Z2luO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBTZWN1cmVXZWJkYXZJbWFnZXNQbHVnaW4pIHtcclxuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gIH1cclxuXHJcbiAgZGlzcGxheSgpOiB2b2lkIHtcclxuICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XHJcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xyXG5cclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIlNlY3VyZSBXZWJEQVYgSW1hZ2VzXCIgfSk7XG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJwXCIsIHtcbiAgICAgIHRleHQ6IHRoaXMucGx1Z2luLnQoXG4gICAgICAgIFwiXHU4RkQ5XHU0RTJBXHU2M0QyXHU0RUY2XHU1M0VBXHU2MjhBXHU1NkZFXHU3MjQ3XHU1MjY1XHU3OUJCXHU1MjMwXHU1MzU1XHU3MkVDXHU3Njg0XHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHVGRjBDXHU1RTc2XHU0RkREXHU1QjU4XHU0RTNBIHNlY3VyZS13ZWJkYXYgXHU4MUVBXHU1QjlBXHU0RTQ5XHU0RUUzXHU3ODAxXHU1NzU3XHVGRjFCXHU1MTc2XHU0RUQ2XHU3QjE0XHU4QkIwXHU1NDhDXHU5NjQ0XHU0RUY2XHU2MzA5XHU1MzlGXHU4REVGXHU1Rjg0XHU1MzlGXHU2ODM3XHU1NDBDXHU2QjY1XHUzMDAyXCIsXG4gICAgICAgIFwiVGhpcyBwbHVnaW4gc2VwYXJhdGVzIG9ubHkgaW1hZ2VzIGludG8gYSBkZWRpY2F0ZWQgcmVtb3RlIGZvbGRlciBhbmQgc3RvcmVzIHRoZW0gYXMgc2VjdXJlLXdlYmRhdiBjdXN0b20gY29kZSBibG9ja3MuIE5vdGVzIGFuZCBvdGhlciBhdHRhY2htZW50cyBhcmUgc3luY2VkIGFzLWlzIHdpdGggdGhlaXIgb3JpZ2luYWwgcGF0aHMuXCIsXG4gICAgICApLFxuICAgIH0pO1xuXHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy5wbHVnaW4udChcIlx1NzU0Q1x1OTc2Mlx1OEJFRFx1OEEwMFwiLCBcIkludGVyZmFjZSBsYW5ndWFnZVwiKSB9KTtcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdThCRURcdThBMDBcIiwgXCJMYW5ndWFnZVwiKSlcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdThCQkVcdTdGNkVcdTk4NzVcdTY1MkZcdTYzMDFcdTgxRUFcdTUyQThcdTMwMDFcdTRFMkRcdTY1ODdcdTMwMDFcdTgyRjFcdTY1ODdcdTUyMDdcdTYzNjJcdTMwMDJcIiwgXCJTd2l0Y2ggdGhlIHNldHRpbmdzIFVJIGJldHdlZW4gYXV0bywgQ2hpbmVzZSwgYW5kIEVuZ2xpc2guXCIpKVxyXG4gICAgICAuYWRkRHJvcGRvd24oKGRyb3Bkb3duKSA9PlxyXG4gICAgICAgIGRyb3Bkb3duXHJcbiAgICAgICAgICAuYWRkT3B0aW9uKFwiYXV0b1wiLCB0aGlzLnBsdWdpbi50KFwiXHU4MUVBXHU1MkE4XCIsIFwiQXV0b1wiKSlcbiAgICAgICAgICAuYWRkT3B0aW9uKFwiemhcIiwgXCJcdTRFMkRcdTY1ODdcIilcbiAgICAgICAgICAuYWRkT3B0aW9uKFwiZW5cIiwgXCJFbmdsaXNoXCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxhbmd1YWdlKVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubGFuZ3VhZ2UgPSB2YWx1ZSBhcyBcImF1dG9cIiB8IFwiemhcIiB8IFwiZW5cIjtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICAgICAgfSksXG4gICAgICApO1xyXG5cclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiB0aGlzLnBsdWdpbi50KFwiXHU4RkRFXHU2M0E1XHU4QkJFXHU3RjZFXCIsIFwiQ29ubmVjdGlvblwiKSB9KTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJXZWJEQVYgXHU1N0ZBXHU3ODQwXHU1NzMwXHU1NzQwXCIsIFwiV2ViREFWIGJhc2UgVVJMXCIpKVxuICAgICAgLnNldERlc2ModGhpcy5wbHVnaW4udChcIlx1NjcwRFx1NTJBMVx1NTY2OFx1NTdGQVx1Nzg0MFx1NTczMFx1NTc0MFx1RkYwQ1x1NEY4Qlx1NTk4Mlx1RkYxQWh0dHA6Ly95b3VyLXdlYmRhdi1ob3N0OnBvcnRcIiwgXCJCYXNlIHNlcnZlciBVUkwuIEV4YW1wbGU6IGh0dHA6Ly95b3VyLXdlYmRhdi1ob3N0OnBvcnRcIikpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImh0dHA6Ly95b3VyLXdlYmRhdi1ob3N0OnBvcnRcIilcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mud2ViZGF2VXJsKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLndlYmRhdlVybCA9IHZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pLFxuICAgICAgKTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1OEQyNlx1NTNGN1wiLCBcIlVzZXJuYW1lXCIpKVxyXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cclxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZXJuYW1lKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZXJuYW1lID0gdmFsdWUudHJpbSgpO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgfSksXHJcbiAgICAgICk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTVCQzZcdTc4MDFcIiwgXCJQYXNzd29yZFwiKSlcclxuICAgICAgLnNldERlc2ModGhpcy5wbHVnaW4udChcIlx1OUVEOFx1OEJBNFx1OTY5MFx1ODVDRlx1RkYwQ1x1NTNFRlx1NzBCOVx1NTFGQlx1NTNGM1x1NEZBN1x1NjMwOVx1OTRBRVx1NjYzRVx1NzkzQVx1NjIxNlx1OTY5MFx1ODVDRlx1MzAwMlwiLCBcIkhpZGRlbiBieSBkZWZhdWx0LiBVc2UgdGhlIGJ1dHRvbiBvbiB0aGUgcmlnaHQgdG8gc2hvdyBvciBoaWRlIGl0LlwiKSlcclxuICAgICAgLmFkZFRleHQoKHRleHQpID0+IHtcclxuICAgICAgICB0ZXh0LmlucHV0RWwudHlwZSA9IFwicGFzc3dvcmRcIjtcclxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnBhc3N3b3JkKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnBhc3N3b3JkID0gdmFsdWU7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSlcclxuICAgICAgLmFkZEV4dHJhQnV0dG9uKChidXR0b24pID0+IHtcclxuICAgICAgICBsZXQgdmlzaWJsZSA9IGZhbHNlO1xyXG4gICAgICAgIGJ1dHRvbi5zZXRJY29uKFwiZXllXCIpO1xyXG4gICAgICAgIGJ1dHRvbi5zZXRUb29sdGlwKHRoaXMucGx1Z2luLnQoXCJcdTY2M0VcdTc5M0FcdTVCQzZcdTc4MDFcIiwgXCJTaG93IHBhc3N3b3JkXCIpKTtcclxuICAgICAgICBidXR0b24ub25DbGljaygoKSA9PiB7XHJcbiAgICAgICAgICBjb25zdCBpbnB1dCA9IGJ1dHRvbi5leHRyYVNldHRpbmdzRWwucGFyZW50RWxlbWVudD8ucXVlcnlTZWxlY3RvcihcImlucHV0XCIpO1xyXG4gICAgICAgICAgaWYgKCEoaW5wdXQgaW5zdGFuY2VvZiBIVE1MSW5wdXRFbGVtZW50KSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgdmlzaWJsZSA9ICF2aXNpYmxlO1xyXG4gICAgICAgICAgaW5wdXQudHlwZSA9IHZpc2libGUgPyBcInRleHRcIiA6IFwicGFzc3dvcmRcIjtcclxuICAgICAgICAgIGJ1dHRvbi5zZXRJY29uKHZpc2libGUgPyBcImV5ZS1vZmZcIiA6IFwiZXllXCIpO1xyXG4gICAgICAgICAgYnV0dG9uLnNldFRvb2x0aXAodGhpcy5wbHVnaW4udCh2aXNpYmxlID8gXCJcdTk2OTBcdTg1Q0ZcdTVCQzZcdTc4MDFcIiA6IFwiXHU2NjNFXHU3OTNBXHU1QkM2XHU3ODAxXCIsIHZpc2libGUgPyBcIkhpZGUgcGFzc3dvcmRcIiA6IFwiU2hvdyBwYXNzd29yZFwiKSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NTZGRVx1NzI0N1x1OEZEQ1x1N0EwQlx1NzZFRVx1NUY1NVwiLCBcIkltYWdlIHJlbW90ZSBmb2xkZXJcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1NEUxM1x1OTVFOFx1NzUyOFx1NEU4RVx1NUI1OFx1NjUzRVx1OEZEQ1x1N0EwQlx1NTZGRVx1NzI0N1x1NzY4NCBXZWJEQVYgXHU3NkVFXHU1RjU1XHVGRjBDXHU0RjhCXHU1OTgyXHVGRjFBL3JlbW90ZS1pbWFnZXMvXHUzMDAyXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU2MjEwXHU1MjlGXHU1NDBFXHU0RjFBXHU3QUNCXHU1MzczXHU1MjIwXHU5NjY0XHU2NzJDXHU1NzMwXHU1NkZFXHU3MjQ3XHU2NTg3XHU0RUY2XHUzMDAyXCIsXG4gICAgICAgICAgXCJEZWRpY2F0ZWQgV2ViREFWIGZvbGRlciBmb3IgcmVtb3RlIGltYWdlcywgZm9yIGV4YW1wbGU6IC9yZW1vdGUtaW1hZ2VzLy4gTG9jYWwgaW1hZ2UgZmlsZXMgYXJlIGRlbGV0ZWQgaW1tZWRpYXRlbHkgYWZ0ZXIgdXBsb2FkIHN1Y2NlZWRzLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucmVtb3RlRm9sZGVyKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZW1vdGVGb2xkZXIgPSBub3JtYWxpemVQYXRoKHZhbHVlLnRyaW0oKSB8fCBcIi9yZW1vdGUtaW1hZ2VzL1wiKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSksXG4gICAgICApO1xuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NkQ0Qlx1OEJENVx1OEZERVx1NjNBNVwiLCBcIlRlc3QgY29ubmVjdGlvblwiKSlcclxuICAgICAgLnNldERlc2ModGhpcy5wbHVnaW4udChcIlx1NEY3Rlx1NzUyOFx1NEUzNFx1NjVGNlx1NjNBMlx1OTQ4OFx1NjU4N1x1NEVGNlx1OUE4Q1x1OEJDMSBQVVRcdTMwMDFHRVRcdTMwMDFERUxFVEUgXHU2NjJGXHU1NDI2XHU2QjYzXHU1RTM4XHUzMDAyXCIsIFwiVmVyaWZ5IFBVVCwgR0VULCBhbmQgREVMRVRFIHVzaW5nIGEgdGVtcG9yYXJ5IHByb2JlIGZpbGUuXCIpKVxyXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+XHJcbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodGhpcy5wbHVnaW4udChcIlx1NUYwMFx1NTlDQlx1NkQ0Qlx1OEJENVwiLCBcIlJ1biB0ZXN0XCIpKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZCh0cnVlKTtcclxuICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnJ1bkNvbm5lY3Rpb25UZXN0KHRydWUpO1xyXG4gICAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKGZhbHNlKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KSxcclxuICAgICAgKTtcclxuXHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy5wbHVnaW4udChcIlx1NTQwQ1x1NkI2NVx1OEJCRVx1N0Y2RVwiLCBcIlN5bmNcIikgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdThGRENcdTdBMEJcdTdCMTRcdThCQjBcdTc2RUVcdTVGNTVcIiwgXCJSZW1vdGUgbm90ZXMgZm9sZGVyXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTc1MjhcdTRFOEVcdTVCNThcdTY1M0VcdTdCMTRcdThCQjBcdTU0OENcdTUxNzZcdTRFRDZcdTk3NUVcdTU2RkVcdTcyNDdcdTk2NDRcdTRFRjZcdTUzOUZcdTY4MzdcdTU0MENcdTZCNjVcdTUyNkZcdTY3MkNcdTc2ODRcdThGRENcdTdBRUZcdTc2RUVcdTVGNTVcdUZGMENcdTRGOEJcdTU5ODJcdUZGMUEvdmF1bHQtc3luYy9cdTMwMDJcdTYzRDJcdTRFRjZcdTRGMUFcdTgxRUFcdTUyQThcdTU0MENcdTZCNjVcdTY1NzRcdTRFMkEgdmF1bHRcdUZGMENcdTVFNzZcdThERjNcdThGQzcgLm9ic2lkaWFuXHUzMDAxXHU2M0QyXHU0RUY2XHU3NkVFXHU1RjU1XHU1NDhDXHU1NkZFXHU3MjQ3XHU2NTg3XHU0RUY2XHUzMDAyXCIsXG4gICAgICAgICAgXCJSZW1vdGUgZm9sZGVyIHVzZWQgZm9yIG5vdGVzIGFuZCBvdGhlciBub24taW1hZ2UgYXR0YWNobWVudHMgc3luY2VkIGFzLWlzLCBmb3IgZXhhbXBsZTogL3ZhdWx0LXN5bmMvLiBUaGUgcGx1Z2luIHN5bmNzIHRoZSB3aG9sZSB2YXVsdCBhbmQgYXV0b21hdGljYWxseSBza2lwcyAub2JzaWRpYW4sIHRoZSBwbHVnaW4gZGlyZWN0b3J5LCBhbmQgaW1hZ2UgZmlsZXMuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnZhdWx0U3luY1JlbW90ZUZvbGRlciA9IG5vcm1hbGl6ZVBhdGgodmFsdWUudHJpbSgpIHx8IFwiL3ZhdWx0LXN5bmMvXCIpO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTgxRUFcdTUyQThcdTU0MENcdTZCNjVcdTk4OTFcdTczODdcIiwgXCJBdXRvIHN5bmMgZnJlcXVlbmN5XCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTRFRTVcdTUyMDZcdTk0OUZcdTRFM0FcdTUzNTVcdTRGNERcdThCQkVcdTdGNkVcdTgxRUFcdTUyQThcdTU0MENcdTZCNjVcdTY1RjZcdTk1RjRcdTMwMDJcdTU4NkIgMCBcdTg4NjhcdTc5M0FcdTUxNzNcdTk1RURcdTgxRUFcdTUyQThcdTU0MENcdTZCNjVcdTMwMDJcdThGRDlcdTkxQ0NcdTc2ODRcdTU0MENcdTZCNjVcdTY2MkZcdTIwMUNcdTVCRjlcdThEMjZcdTU0MENcdTZCNjVcdTIwMURcdUZGMUFcdTRGMUFcdTY4QzBcdTY3RTVcdTY3MkNcdTU3MzBcdTRFMEVcdThGRENcdTdBRUZcdTc2RUVcdTVGNTVcdTVERUVcdTVGMDJcdUZGMENcdTg4NjVcdTRGMjBcdTY1QjBcdTU4OUVcdTU0OENcdTUzRDhcdTY2RjRcdTY1ODdcdTRFRjZcdUZGMENcdTVFNzZcdTUyMjBcdTk2NjRcdThGRENcdTdBRUZcdTU5MUFcdTRGNTlcdTUxODVcdTVCQjlcdTMwMDJcIixcbiAgICAgICAgICBcIlNldCB0aGUgYXV0b21hdGljIHN5bmMgaW50ZXJ2YWwgaW4gbWludXRlcy4gVXNlIDAgdG8gdHVybiBpdCBvZmYuIFRoaXMgaXMgYSByZWNvbmNpbGlhdGlvbiBzeW5jOiBpdCBjaGVja3MgbG9jYWwgYW5kIHJlbW90ZSBkaWZmZXJlbmNlcywgdXBsb2FkcyBuZXcgb3IgY2hhbmdlZCBmaWxlcywgYW5kIHJlbW92ZXMgZXh0cmEgcmVtb3RlIGNvbnRlbnQuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcIjBcIilcbiAgICAgICAgICAuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzKSlcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXJzZWQgPSBOdW1iZXIucGFyc2VJbnQodmFsdWUsIDEwKTtcbiAgICAgICAgICAgIGlmICghTnVtYmVyLmlzTmFOKHBhcnNlZCkpIHtcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXMgPSBNYXRoLm1heCgwLCBwYXJzZWQpO1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTdCMTRcdThCQjBcdTY3MkNcdTU3MzBcdTRGRERcdTc1NTlcdTZBMjFcdTVGMEZcIiwgXCJOb3RlIGxvY2FsIHJldGVudGlvbiBtb2RlXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTVCOENcdTY1NzRcdTY3MkNcdTU3MzBcdUZGMUFcdTdCMTRcdThCQjBcdTU5Q0JcdTdFQzhcdTRGRERcdTc1NTlcdTU3MjhcdTY3MkNcdTU3MzBcdTMwMDJcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTdCMTRcdThCQjBcdUZGMUFcdTk1N0ZcdTY3MUZcdTY3MkFcdThCQkZcdTk1RUVcdTc2ODQgTWFya2Rvd24gXHU3QjE0XHU4QkIwXHU0RjFBXHU4OEFCXHU2NkZGXHU2MzYyXHU0RTNBXHU2NzJDXHU1NzMwXHU1MzYwXHU0RjREXHU2NTg3XHU0RUY2XHVGRjBDXHU2MjUzXHU1RjAwXHU2NUY2XHU1MThEXHU0RUNFXHU4RkRDXHU3QUVGXHU2MDYyXHU1OTBEXHUzMDAyXCIsXG4gICAgICAgICAgXCJGdWxsIGxvY2FsOiBub3RlcyBhbHdheXMgc3RheSBsb2NhbC4gTGF6eSBub3Rlczogc3RhbGUgTWFya2Rvd24gbm90ZXMgYXJlIHJlcGxhY2VkIHdpdGggbG9jYWwgcGxhY2Vob2xkZXIgZmlsZXMgYW5kIHJlc3RvcmVkIGZyb20gcmVtb3RlIHdoZW4gb3BlbmVkLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZERyb3Bkb3duKChkcm9wZG93bikgPT5cbiAgICAgICAgZHJvcGRvd25cbiAgICAgICAgICAuYWRkT3B0aW9uKFwiZnVsbC1sb2NhbFwiLCB0aGlzLnBsdWdpbi50KFwiXHU1QjhDXHU2NTc0XHU2NzJDXHU1NzMwXCIsIFwiRnVsbCBsb2NhbFwiKSlcbiAgICAgICAgICAuYWRkT3B0aW9uKFwibGF6eS1ub3Rlc1wiLCB0aGlzLnBsdWdpbi50KFwiXHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXCIsIFwiTGF6eSBub3Rlc1wiKSlcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mubm90ZVN0b3JhZ2VNb2RlKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVTdG9yYWdlTW9kZSA9IHZhbHVlIGFzIFwiZnVsbC1sb2NhbFwiIHwgXCJsYXp5LW5vdGVzXCI7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTdCMTRcdThCQjBcdTY3MkNcdTU3MzBcdTU2REVcdTY1MzZcdTU5MjlcdTY1NzBcIiwgXCJOb3RlIGV2aWN0aW9uIGRheXNcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1NEVDNVx1NTcyOFx1MjAxQ1x1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFx1MjAxRFx1NkEyMVx1NUYwRlx1NEUwQlx1NzUxRlx1NjU0OFx1MzAwMlx1OEQ4NVx1OEZDN1x1OEZEOVx1NEUyQVx1NTkyOVx1NjU3MFx1NjcyQVx1NjI1M1x1NUYwMFx1NzY4NCBNYXJrZG93biBcdTdCMTRcdThCQjBcdUZGMENcdTRGMUFcdTU3MjhcdTU0MENcdTZCNjVcdTU0MEVcdTg4QUJcdTY2RkZcdTYzNjJcdTRFM0FcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTY1ODdcdTRFRjZcdTMwMDJcIixcbiAgICAgICAgICBcIlVzZWQgb25seSBpbiBsYXp5IG5vdGUgbW9kZS4gTWFya2Rvd24gbm90ZXMgbm90IG9wZW5lZCB3aXRoaW4gdGhpcyBudW1iZXIgb2YgZGF5cyBhcmUgcmVwbGFjZWQgd2l0aCBsb2NhbCBwbGFjZWhvbGRlciBmaWxlcyBhZnRlciBzeW5jLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCIzMFwiKVxuICAgICAgICAgIC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4uc2V0dGluZ3Mubm90ZUV2aWN0QWZ0ZXJEYXlzKSlcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXJzZWQgPSBOdW1iZXIucGFyc2VJbnQodmFsdWUsIDEwKTtcbiAgICAgICAgICAgIGlmICghTnVtYmVyLmlzTmFOKHBhcnNlZCkpIHtcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Mubm90ZUV2aWN0QWZ0ZXJEYXlzID0gTWF0aC5tYXgoMSwgcGFyc2VkKTtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU1NDBDXHU2QjY1XHU3MkI2XHU2MDAxXCIsIFwiU3luYyBzdGF0dXNcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBgJHt0aGlzLnBsdWdpbi5mb3JtYXRMYXN0U3luY0xhYmVsKCl9XFxuJHt0aGlzLnBsdWdpbi5mb3JtYXRTeW5jU3RhdHVzTGFiZWwoKX1cXG4ke3RoaXMucGx1Z2luLnQoXCJcdThCRjRcdTY2MEVcdUZGMUFcdTdBQ0JcdTUzNzNcdTU0MENcdTZCNjVcdTRGMUFcdTYyNjdcdTg4NENcdTY3MkNcdTU3MzBcdTRFMEVcdThGRENcdTdBRUZcdTc2ODRcdTVCRjlcdThEMjZcdUZGMENcdTU0MENcdTZCNjVcdTdCMTRcdThCQjBcdTRFMEVcdTk3NUVcdTU2RkVcdTcyNDdcdTk2NDRcdTRFRjZcdUZGMENcdTVFNzZcdTZFMDVcdTc0MDZcdThGRENcdTdBRUZcdTUxOTdcdTRGNTlcdTY1ODdcdTRFRjZcdTMwMDJcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTRFQ0RcdTc1MzFcdTcyRUNcdTdBQ0JcdTk2MUZcdTUyMTdcdTU5MDRcdTc0MDZcdTMwMDJcIiwgXCJOb3RlOiBTeW5jIG5vdyByZWNvbmNpbGVzIGxvY2FsIGFuZCByZW1vdGUgY29udGVudCwgc3luY3Mgbm90ZXMgYW5kIG5vbi1pbWFnZSBhdHRhY2htZW50cywgYW5kIGNsZWFucyBleHRyYSByZW1vdGUgZmlsZXMuIEltYWdlIHVwbG9hZHMgY29udGludWUgdG8gYmUgaGFuZGxlZCBieSB0aGUgc2VwYXJhdGUgcXVldWUuXCIpfWAsXG4gICAgICAgICAgYCR7dGhpcy5wbHVnaW4uZm9ybWF0TGFzdFN5bmNMYWJlbCgpfVxcbiR7dGhpcy5wbHVnaW4uZm9ybWF0U3luY1N0YXR1c0xhYmVsKCl9XFxuJHt0aGlzLnBsdWdpbi50KFwiXHU4QkY0XHU2NjBFXHVGRjFBXHU3QUNCXHU1MzczXHU1NDBDXHU2QjY1XHU0RjFBXHU2MjY3XHU4ODRDXHU2NzJDXHU1NzMwXHU0RTBFXHU4RkRDXHU3QUVGXHU3Njg0XHU1QkY5XHU4RDI2XHVGRjBDXHU1NDBDXHU2QjY1XHU3QjE0XHU4QkIwXHU0RTBFXHU5NzVFXHU1NkZFXHU3MjQ3XHU5NjQ0XHU0RUY2XHVGRjBDXHU1RTc2XHU2RTA1XHU3NDA2XHU4RkRDXHU3QUVGXHU1MTk3XHU0RjU5XHU2NTg3XHU0RUY2XHUzMDAyXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU0RUNEXHU3NTMxXHU3MkVDXHU3QUNCXHU5NjFGXHU1MjE3XHU1OTA0XHU3NDA2XHUzMDAyXCIsIFwiTm90ZTogU3luYyBub3cgcmVjb25jaWxlcyBsb2NhbCBhbmQgcmVtb3RlIGNvbnRlbnQsIHN5bmNzIG5vdGVzIGFuZCBub24taW1hZ2UgYXR0YWNobWVudHMsIGFuZCBjbGVhbnMgZXh0cmEgcmVtb3RlIGZpbGVzLiBJbWFnZSB1cGxvYWRzIGNvbnRpbnVlIHRvIGJlIGhhbmRsZWQgYnkgdGhlIHNlcGFyYXRlIHF1ZXVlLlwiKX1gLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dCh0aGlzLnBsdWdpbi50KFwiXHU3QUNCXHU1MzczXHU1NDBDXHU2QjY1XCIsIFwiU3luYyBub3dcIikpLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZCh0cnVlKTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQodHJ1ZSk7XG4gICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcbiAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKGZhbHNlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiB0aGlzLnBsdWdpbi50KFwiXHU0RTAwXHU2QjIxXHU2MDI3XHU1REU1XHU1MTc3XCIsIFwiT25lLXRpbWUgdG9vbHNcIikgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdThGQzFcdTc5RkJcdTY1NzRcdTVFOTNcdTUzOUZcdTc1MUZcdTU2RkVcdTcyNDdcdTVGMTVcdTc1MjhcIiwgXCJNaWdyYXRlIG5hdGl2ZSBpbWFnZSBlbWJlZHMgaW4gdmF1bHRcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1NjI2Qlx1NjNDRlx1NjU3NFx1NUU5M1x1NjI0MFx1NjcwOSBNYXJrZG93biBcdTdCMTRcdThCQjBcdUZGMENcdTYyOEEgT2JzaWRpYW4gXHU1MzlGXHU3NTFGXHU2NzJDXHU1NzMwXHU1NkZFXHU3MjQ3XHU1RjE1XHU3NTI4XHVGRjA4XHU1OTgyICFbXSgpIFx1NTQ4QyAhW1suLi5dXVx1RkYwOVx1NEUwQVx1NEYyMFx1NTIzMFx1OEZEQ1x1N0FFRlx1NTZGRVx1NzI0N1x1NzZFRVx1NUY1NVx1RkYwQ1x1NUU3Nlx1NjUzOVx1NTE5OVx1NEUzQSBzZWN1cmUtd2ViZGF2IFx1NEVFM1x1NzgwMVx1NTc1N1x1MzAwMlx1NjVFN1x1NzI0OCBzcGFuIFx1NTQ4Q1x1NjVFOVx1NjcxRiB3ZWJkYXYtc2VjdXJlIFx1OTRGRVx1NjNBNVx1NEU1Rlx1NEYxQVx1NEUwMFx1NUU3Nlx1NjUzNlx1NjU1Qlx1NTIzMFx1NjVCMFx1NjgzQ1x1NUYwRlx1MzAwMlwiLFxuICAgICAgICAgIFwiU2NhbiBhbGwgTWFya2Rvd24gbm90ZXMgaW4gdGhlIHZhdWx0LCB1cGxvYWQgbmF0aXZlIGxvY2FsIGltYWdlIGVtYmVkcyAoc3VjaCBhcyAhW10oKSBhbmQgIVtbLi4uXV0pIHRvIHRoZSByZW1vdGUgaW1hZ2UgZm9sZGVyLCBhbmQgcmV3cml0ZSB0aGVtIGFzIHNlY3VyZS13ZWJkYXYgY29kZSBibG9ja3MuIExlZ2FjeSBzcGFuIHRhZ3MgYW5kIGVhcmx5IHdlYmRhdi1zZWN1cmUgbGlua3MgYXJlIGFsc28gbm9ybWFsaXplZCB0byB0aGUgbmV3IGZvcm1hdC5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodGhpcy5wbHVnaW4udChcIlx1NUYwMFx1NTlDQlx1OEZDMVx1NzlGQlwiLCBcIlJ1biBtaWdyYXRpb25cIikpLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZCh0cnVlKTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ubWlncmF0ZUFsbExlZ2FjeVNlY3VyZUltYWdlcygpO1xuICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQoZmFsc2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSksXG4gICAgICApO1xuICB9XG59XG5cclxuY2xhc3MgUmVzdWx0TW9kYWwgZXh0ZW5kcyBNb2RhbCB7XHJcbiAgcHJpdmF0ZSByZWFkb25seSB0aXRsZVRleHQ6IHN0cmluZztcclxuICBwcml2YXRlIHJlYWRvbmx5IGJvZHlUZXh0OiBzdHJpbmc7XHJcblxyXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCB0aXRsZVRleHQ6IHN0cmluZywgYm9keVRleHQ6IHN0cmluZykge1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIHRoaXMudGl0bGVUZXh0ID0gdGl0bGVUZXh0O1xyXG4gICAgdGhpcy5ib2R5VGV4dCA9IGJvZHlUZXh0O1xyXG4gIH1cclxuXHJcbiAgb25PcGVuKCk6IHZvaWQge1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb250ZW50RWwuZW1wdHkoKTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy50aXRsZVRleHQgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogdGhpcy5ib2R5VGV4dCB9KTtcclxuICB9XHJcblxyXG4gIG9uQ2xvc2UoKTogdm9pZCB7XHJcbiAgICB0aGlzLmNvbnRlbnRFbC5lbXB0eSgpO1xyXG4gIH1cclxufVxyXG5cclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUMsc0JBZ0JNO0FBaUVQLElBQU0sbUJBQXlDO0FBQUEsRUFDN0MsV0FBVztBQUFBLEVBQ1gsVUFBVTtBQUFBLEVBQ1YsVUFBVTtBQUFBLEVBQ1YsY0FBYztBQUFBLEVBQ2QsdUJBQXVCO0FBQUEsRUFDdkIsZ0JB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RUFBRSw0QkFBUSxlQUFlLENBQUMsRUFBRSxRQUFRLFlBQVk7QUFDL0UsZUFBTyxZQUFZLElBQUk7QUFDdkIsWUFBSTtBQUNGLGdCQUFNLEtBQUssT0FBTyw2QkFBNkI7QUFBQSxRQUNqRCxVQUFFO0FBQ0EsaUJBQU8sWUFBWSxLQUFLO0FBQUEsUUFDMUI7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDSjtBQUNGO0FBRUEsSUFBTSxjQUFOLGNBQTBCLHNCQUFNO0FBQUEsRUFJOUIsWUFBWSxLQUFVLFdBQW1CLFVBQWtCO0FBQ3pELFVBQU0sR0FBRztBQUNULFNBQUssWUFBWTtBQUNqQixTQUFLLFdBQVc7QUFBQSxFQUNsQjtBQUFBLEVBRUEsU0FBZTtBQUNiLFVBQU0sRUFBRSxVQUFVLElBQUk7QUFDdEIsY0FBVSxNQUFNO0FBQ2hCLGNBQVUsU0FBUyxNQUFNLEVBQUUsTUFBTSxLQUFLLFVBQVUsQ0FBQztBQUNqRCxjQUFVLFNBQVMsS0FBSyxFQUFFLE1BQU0sS0FBSyxTQUFTLENBQUM7QUFBQSxFQUNqRDtBQUFBLEVBRUEsVUFBZ0I7QUFDZCxTQUFLLFVBQVUsTUFBTTtBQUFBLEVBQ3ZCO0FBQ0Y7IiwKICAibmFtZXMiOiBbImRvY3VtZW50IiwgInRvbWJzdG9uZSIsICJ1cGxvYWRlZFJlbW90ZSIsICJvYnNpZGlhblJlcXVlc3RVcmwiXQp9Cg==
