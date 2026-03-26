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
    this.pendingVaultMutationPromises = /* @__PURE__ */ new Set();
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
    this.registerEvent(this.app.vault.on("modify", (file) => this.trackVaultMutation(() => this.handleVaultModify(file))));
    this.registerEvent(this.app.vault.on("delete", (file) => this.trackVaultMutation(() => this.handleVaultDelete(file))));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => this.trackVaultMutation(() => this.handleVaultRename(file, oldPath)))
    );
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
      if (refs) {
        this.noteRemoteRefs.delete(oldPath);
        this.noteRemoteRefs.set(file.path, refs);
      }
      if (!this.shouldSkipContentSyncPath(file.path)) {
        this.schedulePriorityNoteSync(file.path, "image-add");
      }
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
    if (this.hasPendingImageWorkForNote(notePath) || this.pendingVaultMutationPromises.size > 0 || this.syncInProgress || this.autoSyncTickInProgress) {
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
      await this.waitForPendingVaultMutations();
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
  trackVaultMutation(operation) {
    const promise = operation().catch((error) => {
      console.error("Secure WebDAV vault mutation handling failed", error);
    }).finally(() => {
      this.pendingVaultMutationPromises.delete(promise);
    });
    this.pendingVaultMutationPromises.add(promise);
  }
  async waitForPendingVaultMutations() {
    while (this.pendingVaultMutationPromises.size > 0) {
      await Promise.allSettled([...this.pendingVaultMutationPromises]);
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
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("\u5F53\u524D\u63D2\u4EF6\u7248\u672C", "Current plugin version")).setDesc(
      this.plugin.t(
        "\u591A\u7AEF\u4F7F\u7528\u65F6\u53EF\u5148\u6838\u5BF9\u8FD9\u91CC\u7684\u7248\u672C\u53F7\uFF0C\u907F\u514D\u56E0\u4E3A\u5BA2\u6237\u7AEF\u5347\u7EA7\u4E0D\u5230\u4F4D\u5BFC\u81F4\u884C\u4E3A\u4E0D\u4E00\u81F4\u3002",
        "Check this version first across devices to avoid inconsistent behavior caused by incomplete upgrades."
      )
    ).addText((text) => {
      text.setValue(this.plugin.manifest.version);
      text.setDisabled(true);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiXHVGRUZGaW1wb3J0IHtcclxuICBBcHAsXG4gIEVkaXRvcixcbiAgTWFya2Rvd25GaWxlSW5mbyxcbiAgTWFya2Rvd25SZW5kZXJDaGlsZCxcbiAgTWFya2Rvd25WaWV3LFxyXG4gIE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQsXHJcbiAgTW9kYWwsXHJcbiAgTm90aWNlLFxyXG4gIFBsdWdpbixcclxuICBQbHVnaW5TZXR0aW5nVGFiLFxyXG4gIFNldHRpbmcsXHJcbiAgVEFic3RyYWN0RmlsZSxcclxuICBURmlsZSxcbiAgbm9ybWFsaXplUGF0aCxcbiAgcmVxdWVzdFVybCBhcyBvYnNpZGlhblJlcXVlc3RVcmwsXG59IGZyb20gXCJvYnNpZGlhblwiO1xuXHJcbnR5cGUgU2VjdXJlV2ViZGF2U2V0dGluZ3MgPSB7XG4gIHdlYmRhdlVybDogc3RyaW5nO1xuICB1c2VybmFtZTogc3RyaW5nO1xuICBwYXNzd29yZDogc3RyaW5nO1xuICByZW1vdGVGb2xkZXI6IHN0cmluZztcbiAgdmF1bHRTeW5jUmVtb3RlRm9sZGVyOiBzdHJpbmc7XG4gIG5hbWluZ1N0cmF0ZWd5OiBcInRpbWVzdGFtcFwiIHwgXCJoYXNoXCI7XG4gIGRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQ6IGJvb2xlYW47XG4gIGxhbmd1YWdlOiBcImF1dG9cIiB8IFwiemhcIiB8IFwiZW5cIjtcbiAgbm90ZVN0b3JhZ2VNb2RlOiBcImZ1bGwtbG9jYWxcIiB8IFwibGF6eS1ub3Rlc1wiO1xuICBub3RlRXZpY3RBZnRlckRheXM6IG51bWJlcjtcbiAgYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXM6IG51bWJlcjtcbiAgbWF4UmV0cnlBdHRlbXB0czogbnVtYmVyO1xuICByZXRyeURlbGF5U2Vjb25kczogbnVtYmVyO1xuICBkZWxldGVSZW1vdGVXaGVuVW5yZWZlcmVuY2VkOiBib29sZWFuO1xuICBjb21wcmVzc0ltYWdlczogYm9vbGVhbjtcbiAgY29tcHJlc3NUaHJlc2hvbGRLYjogbnVtYmVyO1xuICBtYXhJbWFnZURpbWVuc2lvbjogbnVtYmVyO1xuICBqcGVnUXVhbGl0eTogbnVtYmVyO1xufTtcblxyXG50eXBlIFVwbG9hZFRhc2sgPSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5vdGVQYXRoOiBzdHJpbmc7XG4gIHBsYWNlaG9sZGVyOiBzdHJpbmc7XG4gIG1pbWVUeXBlOiBzdHJpbmc7XHJcbiAgZmlsZU5hbWU6IHN0cmluZztcclxuICBkYXRhQmFzZTY0OiBzdHJpbmc7XHJcbiAgYXR0ZW1wdHM6IG51bWJlcjtcclxuICBjcmVhdGVkQXQ6IG51bWJlcjtcclxuICBsYXN0RXJyb3I/OiBzdHJpbmc7XG59O1xuXG50eXBlIFN5bmNJbmRleEVudHJ5ID0ge1xuICBsb2NhbFNpZ25hdHVyZTogc3RyaW5nO1xuICByZW1vdGVTaWduYXR1cmU6IHN0cmluZztcbiAgcmVtb3RlUGF0aDogc3RyaW5nO1xufTtcblxudHlwZSBSZW1vdGVGaWxlU3RhdGUgPSB7XG4gIHJlbW90ZVBhdGg6IHN0cmluZztcbiAgbGFzdE1vZGlmaWVkOiBudW1iZXI7XG4gIHNpemU6IG51bWJlcjtcbiAgc2lnbmF0dXJlOiBzdHJpbmc7XG59O1xuXG50eXBlIERlbGV0aW9uVG9tYnN0b25lID0ge1xuICBwYXRoOiBzdHJpbmc7XG4gIGRlbGV0ZWRBdDogbnVtYmVyO1xuICByZW1vdGVTaWduYXR1cmU/OiBzdHJpbmc7XG59O1xuXG50eXBlIE1pc3NpbmdMYXp5UmVtb3RlUmVjb3JkID0ge1xuICBmaXJzdERldGVjdGVkQXQ6IG51bWJlcjtcbiAgbGFzdERldGVjdGVkQXQ6IG51bWJlcjtcbiAgbWlzc0NvdW50OiBudW1iZXI7XG59O1xuXG50eXBlIFJlbW90ZUludmVudG9yeSA9IHtcbiAgZmlsZXM6IE1hcDxzdHJpbmcsIFJlbW90ZUZpbGVTdGF0ZT47XG4gIGRpcmVjdG9yaWVzOiBTZXQ8c3RyaW5nPjtcbn07XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFNlY3VyZVdlYmRhdlNldHRpbmdzID0ge1xuICB3ZWJkYXZVcmw6IFwiXCIsXG4gIHVzZXJuYW1lOiBcIlwiLFxuICBwYXNzd29yZDogXCJcIixcbiAgcmVtb3RlRm9sZGVyOiBcIi9yZW1vdGUtaW1hZ2VzL1wiLFxuICB2YXVsdFN5bmNSZW1vdGVGb2xkZXI6IFwiL3ZhdWx0LXN5bmMvXCIsXG4gIG5hbWluZ1N0cmF0ZWd5OiBcImhhc2hcIixcbiAgZGVsZXRlTG9jYWxBZnRlclVwbG9hZDogdHJ1ZSxcbiAgbGFuZ3VhZ2U6IFwiYXV0b1wiLFxuICBub3RlU3RvcmFnZU1vZGU6IFwiZnVsbC1sb2NhbFwiLFxuICBub3RlRXZpY3RBZnRlckRheXM6IDMwLFxuICBhdXRvU3luY0ludGVydmFsTWludXRlczogMCxcbiAgbWF4UmV0cnlBdHRlbXB0czogNSxcbiAgcmV0cnlEZWxheVNlY29uZHM6IDUsXG4gIGRlbGV0ZVJlbW90ZVdoZW5VbnJlZmVyZW5jZWQ6IHRydWUsXG4gIGNvbXByZXNzSW1hZ2VzOiB0cnVlLFxuICBjb21wcmVzc1RocmVzaG9sZEtiOiAzMDAsXG4gIG1heEltYWdlRGltZW5zaW9uOiAyMjAwLFxuICBqcGVnUXVhbGl0eTogODIsXG59O1xuXHJcbmNvbnN0IFNFQ1VSRV9QUk9UT0NPTCA9IFwid2ViZGF2LXNlY3VyZTpcIjtcbmNvbnN0IFNFQ1VSRV9DT0RFX0JMT0NLID0gXCJzZWN1cmUtd2ViZGF2XCI7XG5jb25zdCBTRUNVUkVfTk9URV9TVFVCID0gXCJzZWN1cmUtd2ViZGF2LW5vdGUtc3R1YlwiO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTZWN1cmVXZWJkYXZJbWFnZXNQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogU2VjdXJlV2ViZGF2U2V0dGluZ3MgPSBERUZBVUxUX1NFVFRJTkdTO1xuICBxdWV1ZTogVXBsb2FkVGFza1tdID0gW107XG4gIHByaXZhdGUgYmxvYlVybHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBwcm9jZXNzaW5nVGFza0lkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIHJldHJ5VGltZW91dHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICBwcml2YXRlIG5vdGVSZW1vdGVSZWZzID0gbmV3IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PigpO1xuICBwcml2YXRlIHJlbW90ZUNsZWFudXBJbkZsaWdodCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIG5vdGVBY2Nlc3NUaW1lc3RhbXBzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgcHJpdmF0ZSBzeW5jSW5kZXggPSBuZXcgTWFwPHN0cmluZywgU3luY0luZGV4RW50cnk+KCk7XG4gIHByaXZhdGUgbWlzc2luZ0xhenlSZW1vdGVOb3RlcyA9IG5ldyBNYXA8c3RyaW5nLCBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZD4oKTtcbiAgcHJpdmF0ZSBwZW5kaW5nVGFza1Byb21pc2VzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8dm9pZD4+KCk7XG4gIHByaXZhdGUgcGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlcyA9IG5ldyBTZXQ8UHJvbWlzZTx2b2lkPj4oKTtcbiAgcHJpdmF0ZSBwcmlvcml0eU5vdGVTeW5jVGltZW91dHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICBwcml2YXRlIHByaW9yaXR5Tm90ZVN5bmNzSW5GbGlnaHQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBsYXN0VmF1bHRTeW5jQXQgPSAwO1xuICBwcml2YXRlIGxhc3RWYXVsdFN5bmNTdGF0dXMgPSBcIlwiO1xuICBwcml2YXRlIHN5bmNJblByb2dyZXNzID0gZmFsc2U7XG4gIHByaXZhdGUgYXV0b1N5bmNUaWNrSW5Qcm9ncmVzcyA9IGZhbHNlO1xuXG4gIHByaXZhdGUgcmVhZG9ubHkgZGVsZXRpb25Gb2xkZXJTdWZmaXggPSBcIi5fX3NlY3VyZS13ZWJkYXYtZGVsZXRpb25zX18vXCI7XG4gIHByaXZhdGUgcmVhZG9ubHkgbWlzc2luZ0xhenlSZW1vdGVDb25maXJtYXRpb25zID0gMjtcblxyXG4gIGFzeW5jIG9ubG9hZCgpIHtcbiAgICBhd2FpdCB0aGlzLmxvYWRQbHVnaW5TdGF0ZSgpO1xuXG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBTZWN1cmVXZWJkYXZTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwidXBsb2FkLWN1cnJlbnQtbm90ZS1sb2NhbC1pbWFnZXNcIixcbiAgICAgIG5hbWU6IFwiVXBsb2FkIGxvY2FsIGltYWdlcyBpbiBjdXJyZW50IG5vdGUgdG8gV2ViREFWXCIsXG4gICAgICBjaGVja0NhbGxiYWNrOiAoY2hlY2tpbmcpID0+IHtcclxuICAgICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcclxuICAgICAgICBpZiAoIWZpbGUpIHtcclxuICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghY2hlY2tpbmcpIHtcclxuICAgICAgICAgIHZvaWQgdGhpcy51cGxvYWRJbWFnZXNJbk5vdGUoZmlsZSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJ0ZXN0LXdlYmRhdi1jb25uZWN0aW9uXCIsXG4gICAgICBuYW1lOiBcIlRlc3QgV2ViREFWIGNvbm5lY3Rpb25cIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5ydW5Db25uZWN0aW9uVGVzdCh0cnVlKTtcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwic3luYy1jb25maWd1cmVkLXZhdWx0LWNvbnRlbnQtdG8td2ViZGF2XCIsXG4gICAgICBuYW1lOiBcIlN5bmMgdmF1bHQgY29udGVudCB0byBXZWJEQVZcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5ydW5NYW51YWxTeW5jKCk7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmliYm9uID0gdGhpcy5hZGRSaWJib25JY29uKFwicmVmcmVzaC1jd1wiLCB0aGlzLnQoXCJcdTdBQ0JcdTUzNzNcdTU0MENcdTZCNjVcdTUyMzAgV2ViREFWXCIsIFwiU3luYyB0byBXZWJEQVYgbm93XCIpLCAoKSA9PiB7XG4gICAgICB2b2lkIHRoaXMucnVuTWFudWFsU3luYygpO1xuICAgIH0pO1xuICAgIHJpYmJvbi5hZGRDbGFzcyhcInNlY3VyZS13ZWJkYXYtc3luYy1yaWJib25cIik7XG5cclxuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93blBvc3RQcm9jZXNzb3IoKGVsLCBjdHgpID0+IHtcbiAgICAgIHZvaWQgdGhpcy5wcm9jZXNzU2VjdXJlSW1hZ2VzKGVsLCBjdHgpO1xuICAgIH0pO1xuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihTRUNVUkVfQ09ERV9CTE9DSywgKHNvdXJjZSwgZWwsIGN0eCkgPT4ge1xuICAgICAgdm9pZCB0aGlzLnByb2Nlc3NTZWN1cmVDb2RlQmxvY2soc291cmNlLCBlbCwgY3R4KTtcbiAgICB9KTtcblxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImZpbGUtb3BlblwiLCAoZmlsZSkgPT4ge1xuICAgICAgICB2b2lkIHRoaXMuaGFuZGxlRmlsZU9wZW4oZmlsZSk7XG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFwiZWRpdG9yLXBhc3RlXCIsIChldnQsIGVkaXRvciwgaW5mbykgPT4ge1xuICAgICAgICB2b2lkIHRoaXMuaGFuZGxlRWRpdG9yUGFzdGUoZXZ0LCBlZGl0b3IsIGluZm8pO1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImVkaXRvci1kcm9wXCIsIChldnQsIGVkaXRvciwgaW5mbykgPT4ge1xuICAgICAgICB2b2lkIHRoaXMuaGFuZGxlRWRpdG9yRHJvcChldnQsIGVkaXRvciwgaW5mbyk7XG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgYXdhaXQgdGhpcy5yZWJ1aWxkUmVmZXJlbmNlSW5kZXgoKTtcbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oXCJtb2RpZnlcIiwgKGZpbGUpID0+IHRoaXMudHJhY2tWYXVsdE11dGF0aW9uKCgpID0+IHRoaXMuaGFuZGxlVmF1bHRNb2RpZnkoZmlsZSkpKSk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwiZGVsZXRlXCIsIChmaWxlKSA9PiB0aGlzLnRyYWNrVmF1bHRNdXRhdGlvbigoKSA9PiB0aGlzLmhhbmRsZVZhdWx0RGVsZXRlKGZpbGUpKSkpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLnZhdWx0Lm9uKFwicmVuYW1lXCIsIChmaWxlLCBvbGRQYXRoKSA9PiB0aGlzLnRyYWNrVmF1bHRNdXRhdGlvbigoKSA9PiB0aGlzLmhhbmRsZVZhdWx0UmVuYW1lKGZpbGUsIG9sZFBhdGgpKSksXG4gICAgKTtcblxuICAgIHRoaXMuc2V0dXBBdXRvU3luYygpO1xuXG4gICAgdm9pZCB0aGlzLnByb2Nlc3NQZW5kaW5nVGFza3MoKTtcblxyXG4gICAgdGhpcy5yZWdpc3RlcigoKSA9PiB7XG4gICAgICBmb3IgKGNvbnN0IGJsb2JVcmwgb2YgdGhpcy5ibG9iVXJscykge1xuICAgICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKGJsb2JVcmwpO1xuICAgICAgfVxuICAgICAgdGhpcy5ibG9iVXJscy5jbGVhcigpO1xuICAgICAgZm9yIChjb25zdCB0aW1lb3V0SWQgb2YgdGhpcy5wcmlvcml0eU5vdGVTeW5jVGltZW91dHMudmFsdWVzKCkpIHtcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xuICAgICAgfVxuICAgICAgdGhpcy5wcmlvcml0eU5vdGVTeW5jVGltZW91dHMuY2xlYXIoKTtcbiAgICAgIGZvciAoY29uc3QgdGltZW91dElkIG9mIHRoaXMucmV0cnlUaW1lb3V0cy52YWx1ZXMoKSkge1xuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgICB9XG4gICAgICB0aGlzLnJldHJ5VGltZW91dHMuY2xlYXIoKTtcbiAgICB9KTtcbiAgfVxyXG5cclxuICBvbnVubG9hZCgpIHtcclxuICAgIGZvciAoY29uc3QgYmxvYlVybCBvZiB0aGlzLmJsb2JVcmxzKSB7XHJcbiAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwoYmxvYlVybCk7XHJcbiAgICB9XHJcbiAgICB0aGlzLmJsb2JVcmxzLmNsZWFyKCk7XHJcbiAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnJldHJ5VGltZW91dHMudmFsdWVzKCkpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICB9XG4gICAgdGhpcy5yZXRyeVRpbWVvdXRzLmNsZWFyKCk7XG4gICAgZm9yIChjb25zdCB0aW1lb3V0SWQgb2YgdGhpcy5wcmlvcml0eU5vdGVTeW5jVGltZW91dHMudmFsdWVzKCkpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICB9XG4gICAgdGhpcy5wcmlvcml0eU5vdGVTeW5jVGltZW91dHMuY2xlYXIoKTtcbiAgfVxuXHJcbiAgYXN5bmMgbG9hZFBsdWdpblN0YXRlKCkge1xuICAgIGNvbnN0IGxvYWRlZCA9IGF3YWl0IHRoaXMubG9hZERhdGEoKTtcbiAgICBpZiAoIWxvYWRlZCB8fCB0eXBlb2YgbG9hZGVkICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICB0aGlzLnNldHRpbmdzID0geyAuLi5ERUZBVUxUX1NFVFRJTkdTIH07XG4gICAgICB0aGlzLnF1ZXVlID0gW107XG4gICAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzID0gbmV3IE1hcCgpO1xuICAgICAgdGhpcy5zeW5jSW5kZXggPSBuZXcgTWFwKCk7XG4gICAgICB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgPSBuZXcgTWFwKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY2FuZGlkYXRlID0gbG9hZGVkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIGlmIChcInNldHRpbmdzXCIgaW4gY2FuZGlkYXRlIHx8IFwicXVldWVcIiBpbiBjYW5kaWRhdGUpIHtcbiAgICAgIHRoaXMuc2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MsIC4uLigoY2FuZGlkYXRlLnNldHRpbmdzIGFzIFBhcnRpYWw8U2VjdXJlV2ViZGF2U2V0dGluZ3M+KSA/PyB7fSkgfTtcbiAgICAgIHRoaXMucXVldWUgPSBBcnJheS5pc0FycmF5KGNhbmRpZGF0ZS5xdWV1ZSkgPyAoY2FuZGlkYXRlLnF1ZXVlIGFzIFVwbG9hZFRhc2tbXSkgOiBbXTtcbiAgICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMgPSBuZXcgTWFwKFxuICAgICAgICBPYmplY3QuZW50cmllcygoY2FuZGlkYXRlLm5vdGVBY2Nlc3NUaW1lc3RhbXBzIGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfCB1bmRlZmluZWQpID8/IHt9KSxcbiAgICAgICk7XG4gICAgICB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgPSBuZXcgTWFwKFxuICAgICAgICBPYmplY3QuZW50cmllcygoY2FuZGlkYXRlLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgYXMgUmVjb3JkPHN0cmluZywgTWlzc2luZ0xhenlSZW1vdGVSZWNvcmQ+IHwgdW5kZWZpbmVkKSA/PyB7fSlcbiAgICAgICAgICAuZmlsdGVyKChbLCB2YWx1ZV0pID0+IHtcbiAgICAgICAgICAgIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlY29yZCA9IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdHlwZW9mIHJlY29yZC5maXJzdERldGVjdGVkQXQgPT09IFwibnVtYmVyXCIgJiZcbiAgICAgICAgICAgICAgdHlwZW9mIHJlY29yZC5sYXN0RGV0ZWN0ZWRBdCA9PT0gXCJudW1iZXJcIiAmJlxuICAgICAgICAgICAgICB0eXBlb2YgcmVjb3JkLm1pc3NDb3VudCA9PT0gXCJudW1iZXJcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoKFtwYXRoLCB2YWx1ZV0pID0+IFtwYXRoLCB2YWx1ZSBhcyBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZF0pLFxuICAgICAgKTtcbiAgICAgIHRoaXMuc3luY0luZGV4ID0gbmV3IE1hcCgpO1xuICAgICAgZm9yIChjb25zdCBbcGF0aCwgcmF3RW50cnldIG9mIE9iamVjdC5lbnRyaWVzKChjYW5kaWRhdGUuc3luY0luZGV4IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKSA/PyB7fSkpIHtcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IHRoaXMubm9ybWFsaXplU3luY0luZGV4RW50cnkocGF0aCwgcmF3RW50cnkpO1xuICAgICAgICBpZiAobm9ybWFsaXplZCkge1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChwYXRoLCBub3JtYWxpemVkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPVxuICAgICAgICB0eXBlb2YgY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNBdCA9PT0gXCJudW1iZXJcIiA/IGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jQXQgOiAwO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID1cbiAgICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jU3RhdHVzID09PSBcInN0cmluZ1wiID8gY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNTdGF0dXMgOiBcIlwiO1xuICAgICAgdGhpcy5ub3JtYWxpemVFZmZlY3RpdmVTZXR0aW5ncygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuc2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MsIC4uLihjYW5kaWRhdGUgYXMgUGFydGlhbDxTZWN1cmVXZWJkYXZTZXR0aW5ncz4pIH07XG4gICAgdGhpcy5xdWV1ZSA9IFtdO1xuICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5zeW5jSW5kZXggPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gMDtcbiAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSBcIlwiO1xuICAgIHRoaXMubm9ybWFsaXplRWZmZWN0aXZlU2V0dGluZ3MoKTtcbiAgfVxuXG4gIHByaXZhdGUgbm9ybWFsaXplRWZmZWN0aXZlU2V0dGluZ3MoKSB7XG4gICAgLy8gS2VlcCB0aGUgcHVibGljIHNldHRpbmdzIHN1cmZhY2UgaW50ZW50aW9uYWxseSBzbWFsbCBhbmQgZGV0ZXJtaW5pc3RpYy5cbiAgICB0aGlzLnNldHRpbmdzLmRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQgPSB0cnVlO1xuICAgIHRoaXMuc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXMgPSBNYXRoLm1heCgwLCBNYXRoLmZsb29yKHRoaXMuc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXMgfHwgMCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cEF1dG9TeW5jKCkge1xuICAgIGNvbnN0IG1pbnV0ZXMgPSB0aGlzLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzO1xuICAgIGlmIChtaW51dGVzIDw9IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbnRlcnZhbE1zID0gbWludXRlcyAqIDYwICogMTAwMDtcbiAgICB0aGlzLnJlZ2lzdGVySW50ZXJ2YWwoXG4gICAgICB3aW5kb3cuc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICB2b2lkIHRoaXMucnVuQXV0b1N5bmNUaWNrKCk7XG4gICAgICB9LCBpbnRlcnZhbE1zKSxcbiAgICApO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBydW5BdXRvU3luY1RpY2soKSB7XG4gICAgaWYgKHRoaXMuYXV0b1N5bmNUaWNrSW5Qcm9ncmVzcykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuYXV0b1N5bmNUaWNrSW5Qcm9ncmVzcyA9IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQoZmFsc2UpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLmF1dG9TeW5jVGlja0luUHJvZ3Jlc3MgPSBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBzYXZlUGx1Z2luU3RhdGUoKSB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh7XG4gICAgICBzZXR0aW5nczogdGhpcy5zZXR0aW5ncyxcbiAgICAgIHF1ZXVlOiB0aGlzLnF1ZXVlLFxuICAgICAgbm90ZUFjY2Vzc1RpbWVzdGFtcHM6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzLmVudHJpZXMoKSksXG4gICAgICBtaXNzaW5nTGF6eVJlbW90ZU5vdGVzOiBPYmplY3QuZnJvbUVudHJpZXModGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzLmVudHJpZXMoKSksXG4gICAgICBzeW5jSW5kZXg6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLnN5bmNJbmRleC5lbnRyaWVzKCkpLFxuICAgICAgbGFzdFZhdWx0U3luY0F0OiB0aGlzLmxhc3RWYXVsdFN5bmNBdCxcbiAgICAgIGxhc3RWYXVsdFN5bmNTdGF0dXM6IHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyxcbiAgICB9KTtcbiAgfVxuXHJcbiAgYXN5bmMgc2F2ZVNldHRpbmdzKCkge1xuICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZVN5bmNJbmRleEVudHJ5KHZhdWx0UGF0aDogc3RyaW5nLCByYXdFbnRyeTogdW5rbm93bik6IFN5bmNJbmRleEVudHJ5IHwgbnVsbCB7XG4gICAgaWYgKCFyYXdFbnRyeSB8fCB0eXBlb2YgcmF3RW50cnkgIT09IFwib2JqZWN0XCIpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IGNhbmRpZGF0ZSA9IHJhd0VudHJ5IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPVxuICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5yZW1vdGVQYXRoID09PSBcInN0cmluZ1wiICYmIGNhbmRpZGF0ZS5yZW1vdGVQYXRoLmxlbmd0aCA+IDBcbiAgICAgICAgPyBjYW5kaWRhdGUucmVtb3RlUGF0aFxuICAgICAgICA6IHRoaXMuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKHZhdWx0UGF0aCk7XG4gICAgY29uc3QgbG9jYWxTaWduYXR1cmUgPVxuICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5sb2NhbFNpZ25hdHVyZSA9PT0gXCJzdHJpbmdcIlxuICAgICAgICA/IGNhbmRpZGF0ZS5sb2NhbFNpZ25hdHVyZVxuICAgICAgICA6IHR5cGVvZiBjYW5kaWRhdGUuc2lnbmF0dXJlID09PSBcInN0cmluZ1wiXG4gICAgICAgICAgPyBjYW5kaWRhdGUuc2lnbmF0dXJlXG4gICAgICAgICAgOiBcIlwiO1xuICAgIGNvbnN0IHJlbW90ZVNpZ25hdHVyZSA9XG4gICAgICB0eXBlb2YgY2FuZGlkYXRlLnJlbW90ZVNpZ25hdHVyZSA9PT0gXCJzdHJpbmdcIlxuICAgICAgICA/IGNhbmRpZGF0ZS5yZW1vdGVTaWduYXR1cmVcbiAgICAgICAgOiB0eXBlb2YgY2FuZGlkYXRlLnNpZ25hdHVyZSA9PT0gXCJzdHJpbmdcIlxuICAgICAgICAgID8gY2FuZGlkYXRlLnNpZ25hdHVyZVxuICAgICAgICAgIDogXCJcIjtcblxuICAgIHJldHVybiB7XG4gICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgIHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgIHJlbW90ZVBhdGgsXG4gICAgfTtcbiAgfVxuXHJcbiAgdCh6aDogc3RyaW5nLCBlbjogc3RyaW5nKSB7XHJcbiAgICByZXR1cm4gdGhpcy5nZXRMYW5ndWFnZSgpID09PSBcInpoXCIgPyB6aCA6IGVuO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBnZXRMYW5ndWFnZSgpIHtcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5sYW5ndWFnZSA9PT0gXCJhdXRvXCIpIHtcbiAgICAgIGNvbnN0IGxvY2FsZSA9IHR5cGVvZiBuYXZpZ2F0b3IgIT09IFwidW5kZWZpbmVkXCIgPyBuYXZpZ2F0b3IubGFuZ3VhZ2UudG9Mb3dlckNhc2UoKSA6IFwiZW5cIjtcbiAgICAgIHJldHVybiBsb2NhbGUuc3RhcnRzV2l0aChcInpoXCIpID8gXCJ6aFwiIDogXCJlblwiO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNldHRpbmdzLmxhbmd1YWdlO1xuICB9XG5cbiAgZm9ybWF0TGFzdFN5bmNMYWJlbCgpIHtcbiAgICBpZiAoIXRoaXMubGFzdFZhdWx0U3luY0F0KSB7XG4gICAgICByZXR1cm4gdGhpcy50KFwiXHU0RTBBXHU2QjIxXHU1NDBDXHU2QjY1XHVGRjFBXHU1QzFBXHU2NzJBXHU2MjY3XHU4ODRDXCIsIFwiTGFzdCBzeW5jOiBub3QgcnVuIHlldFwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy50KFxuICAgICAgYFx1NEUwQVx1NkIyMVx1NTQwQ1x1NkI2NVx1RkYxQSR7bmV3IERhdGUodGhpcy5sYXN0VmF1bHRTeW5jQXQpLnRvTG9jYWxlU3RyaW5nKCl9YCxcbiAgICAgIGBMYXN0IHN5bmM6ICR7bmV3IERhdGUodGhpcy5sYXN0VmF1bHRTeW5jQXQpLnRvTG9jYWxlU3RyaW5nKCl9YCxcbiAgICApO1xuICB9XG5cbiAgZm9ybWF0U3luY1N0YXR1c0xhYmVsKCkge1xuICAgIHJldHVybiB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXNcbiAgICAgID8gdGhpcy50KGBcdTY3MDBcdThGRDFcdTcyQjZcdTYwMDFcdUZGMUEke3RoaXMubGFzdFZhdWx0U3luY1N0YXR1c31gLCBgUmVjZW50IHN0YXR1czogJHt0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXN9YClcbiAgICAgIDogdGhpcy50KFwiXHU2NzAwXHU4RkQxXHU3MkI2XHU2MDAxXHVGRjFBXHU2NjgyXHU2NUUwXCIsIFwiUmVjZW50IHN0YXR1czogbm9uZVwiKTtcbiAgfVxuXG4gIGFzeW5jIHJ1bk1hbnVhbFN5bmMoKSB7XG4gICAgYXdhaXQgdGhpcy5zeW5jQ29uZmlndXJlZFZhdWx0Q29udGVudCh0cnVlKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVidWlsZFJlZmVyZW5jZUluZGV4KCkge1xuICAgIGNvbnN0IG5leHQgPSBuZXcgTWFwPHN0cmluZywgU2V0PHN0cmluZz4+KCk7XG4gICAgZm9yIChjb25zdCBmaWxlIG9mIHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKSkge1xuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICBuZXh0LnNldChmaWxlLnBhdGgsIHRoaXMuZXh0cmFjdFJlbW90ZVBhdGhzRnJvbVRleHQoY29udGVudCkpO1xuICAgIH1cbiAgICB0aGlzLm5vdGVSZW1vdGVSZWZzID0gbmV4dDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlVmF1bHRNb2RpZnkoZmlsZTogVEFic3RyYWN0RmlsZSkge1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkgfHwgZmlsZS5leHRlbnNpb24gIT09IFwibWRcIikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IG5leHRSZWZzID0gdGhpcy5leHRyYWN0UmVtb3RlUGF0aHNGcm9tVGV4dChjb250ZW50KTtcbiAgICBjb25zdCBwcmV2aW91c1JlZnMgPSB0aGlzLm5vdGVSZW1vdGVSZWZzLmdldChmaWxlLnBhdGgpID8/IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIHRoaXMubm90ZVJlbW90ZVJlZnMuc2V0KGZpbGUucGF0aCwgbmV4dFJlZnMpO1xuXG4gICAgY29uc3QgYWRkZWQgPSBbLi4ubmV4dFJlZnNdLmZpbHRlcigodmFsdWUpID0+ICFwcmV2aW91c1JlZnMuaGFzKHZhbHVlKSk7XG4gICAgY29uc3QgcmVtb3ZlZCA9IFsuLi5wcmV2aW91c1JlZnNdLmZpbHRlcigodmFsdWUpID0+ICFuZXh0UmVmcy5oYXModmFsdWUpKTtcbiAgICBpZiAoYWRkZWQubGVuZ3RoID4gMCkge1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMoZmlsZS5wYXRoLCBcImltYWdlLWFkZFwiKTtcbiAgICB9XG4gICAgaWYgKHJlbW92ZWQubGVuZ3RoID4gMCkge1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMoZmlsZS5wYXRoLCBcImltYWdlLXJlbW92ZVwiKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZVZhdWx0RGVsZXRlKGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnNob3VsZFNraXBDb250ZW50U3luY1BhdGgoZmlsZS5wYXRoKSkge1xuICAgICAgYXdhaXQgdGhpcy53cml0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCwgdGhpcy5zeW5jSW5kZXguZ2V0KGZpbGUucGF0aCk/LnJlbW90ZVNpZ25hdHVyZSk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgfVxuXG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIGNvbnN0IHByZXZpb3VzUmVmcyA9IHRoaXMubm90ZVJlbW90ZVJlZnMuZ2V0KGZpbGUucGF0aCkgPz8gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgICB0aGlzLm5vdGVSZW1vdGVSZWZzLmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgdm9pZCBwcmV2aW91c1JlZnM7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVWYXVsdFJlbmFtZShmaWxlOiBUQWJzdHJhY3RGaWxlLCBvbGRQYXRoOiBzdHJpbmcpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnNob3VsZFNraXBDb250ZW50U3luY1BhdGgob2xkUGF0aCkpIHtcbiAgICAgIGF3YWl0IHRoaXMud3JpdGVEZWxldGlvblRvbWJzdG9uZShvbGRQYXRoLCB0aGlzLnN5bmNJbmRleC5nZXQob2xkUGF0aCk/LnJlbW90ZVNpZ25hdHVyZSk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUob2xkUGF0aCk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgIH1cblxuICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICBjb25zdCByZWZzID0gdGhpcy5ub3RlUmVtb3RlUmVmcy5nZXQob2xkUGF0aCk7XG4gICAgICBpZiAocmVmcykge1xuICAgICAgICB0aGlzLm5vdGVSZW1vdGVSZWZzLmRlbGV0ZShvbGRQYXRoKTtcbiAgICAgICAgdGhpcy5ub3RlUmVtb3RlUmVmcy5zZXQoZmlsZS5wYXRoLCByZWZzKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCF0aGlzLnNob3VsZFNraXBDb250ZW50U3luY1BhdGgoZmlsZS5wYXRoKSkge1xuICAgICAgICB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyhmaWxlLnBhdGgsIFwiaW1hZ2UtYWRkXCIpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdFJlbW90ZVBhdGhzRnJvbVRleHQoY29udGVudDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVmcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IHNwYW5SZWdleCA9IC9kYXRhLXNlY3VyZS13ZWJkYXY9XCIoW15cIl0rKVwiL2c7XG4gICAgY29uc3QgcHJvdG9jb2xSZWdleCA9IC93ZWJkYXYtc2VjdXJlOlxcL1xcLyhbXlxccylcIl0rKS9nO1xuICAgIGNvbnN0IGNvZGVCbG9ja1JlZ2V4ID0gL2BgYHNlY3VyZS13ZWJkYXZcXHMrKFtcXHNcXFNdKj8pYGBgL2c7XG4gICAgbGV0IG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXG4gICAgd2hpbGUgKChtYXRjaCA9IHNwYW5SZWdleC5leGVjKGNvbnRlbnQpKSAhPT0gbnVsbCkge1xuICAgICAgcmVmcy5hZGQodGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0pKTtcbiAgICB9XG5cbiAgICB3aGlsZSAoKG1hdGNoID0gcHJvdG9jb2xSZWdleC5leGVjKGNvbnRlbnQpKSAhPT0gbnVsbCkge1xuICAgICAgcmVmcy5hZGQodGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0pKTtcbiAgICB9XG5cbiAgICB3aGlsZSAoKG1hdGNoID0gY29kZUJsb2NrUmVnZXguZXhlYyhjb250ZW50KSkgIT09IG51bGwpIHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IHRoaXMucGFyc2VTZWN1cmVJbWFnZUJsb2NrKG1hdGNoWzFdKTtcbiAgICAgIGlmIChwYXJzZWQ/LnBhdGgpIHtcbiAgICAgICAgcmVmcy5hZGQocGFyc2VkLnBhdGgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZWZzO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVSZW1vdGVJZlVucmVmZXJlbmNlZChyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICB2b2lkIHJlbW90ZVBhdGg7XG4gICAgLy8gRGlzYWJsZWQgaW50ZW50aW9uYWxseTogbG9jYWwtb25seSByZWZlcmVuY2UgY2hlY2tzIGFyZSBub3Qgc2FmZSBlbm91Z2hcbiAgICAvLyBmb3IgY3Jvc3MtZGV2aWNlIGRlbGV0aW9uIG9mIHNoYXJlZCByZW1vdGUgaW1hZ2VzLlxuICB9XG5cbiAgcHJpdmF0ZSBzY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZVBhdGg6IHN0cmluZywgcmVhc29uOiBcImltYWdlLWFkZFwiIHwgXCJpbWFnZS1yZW1vdmVcIikge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5wcmlvcml0eU5vdGVTeW5jVGltZW91dHMuZ2V0KG5vdGVQYXRoKTtcbiAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQoZXhpc3RpbmcpO1xuICAgIH1cblxuICAgIGNvbnN0IGRlbGF5TXMgPSByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCIgPyAxMjAwIDogNjAwO1xuICAgIGNvbnN0IHRpbWVvdXRJZCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLmRlbGV0ZShub3RlUGF0aCk7XG4gICAgICB2b2lkIHRoaXMuZmx1c2hQcmlvcml0eU5vdGVTeW5jKG5vdGVQYXRoLCByZWFzb24pO1xuICAgIH0sIGRlbGF5TXMpO1xuICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLnNldChub3RlUGF0aCwgdGltZW91dElkKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZmx1c2hQcmlvcml0eU5vdGVTeW5jKG5vdGVQYXRoOiBzdHJpbmcsIHJlYXNvbjogXCJpbWFnZS1hZGRcIiB8IFwiaW1hZ2UtcmVtb3ZlXCIpIHtcbiAgICBpZiAodGhpcy5wcmlvcml0eU5vdGVTeW5jc0luRmxpZ2h0Lmhhcyhub3RlUGF0aCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICB0aGlzLmhhc1BlbmRpbmdJbWFnZVdvcmtGb3JOb3RlKG5vdGVQYXRoKSB8fFxuICAgICAgdGhpcy5wZW5kaW5nVmF1bHRNdXRhdGlvblByb21pc2VzLnNpemUgPiAwIHx8XG4gICAgICB0aGlzLnN5bmNJblByb2dyZXNzIHx8XG4gICAgICB0aGlzLmF1dG9TeW5jVGlja0luUHJvZ3Jlc3NcbiAgICApIHtcbiAgICAgIHRoaXMuc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jKG5vdGVQYXRoLCByZWFzb24pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChub3RlUGF0aCk7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB8fCBmaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiIHx8IHRoaXMuc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChmaWxlLnBhdGgpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5wcmlvcml0eU5vdGVTeW5jc0luRmxpZ2h0LmFkZChub3RlUGF0aCk7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xuXG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5yZWFkTWFya2Rvd25Db250ZW50UHJlZmVyRWRpdG9yKGZpbGUpO1xuICAgICAgaWYgKHRoaXMucGFyc2VOb3RlU3R1Yihjb250ZW50KSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aChmaWxlLnBhdGgpO1xuICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCwgY29udGVudCk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgIGxvY2FsU2lnbmF0dXJlOiBhd2FpdCB0aGlzLmJ1aWxkQ3VycmVudExvY2FsU2lnbmF0dXJlKGZpbGUsIGNvbnRlbnQpLFxuICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIH0pO1xuICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy50KFxuICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCJcbiAgICAgICAgICA/IGBcdTVERjJcdTRGMThcdTUxNDhcdTU0MENcdTZCNjVcdTU2RkVcdTcyNDdcdTY1QjBcdTU4OUVcdTU0MEVcdTc2ODRcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YFxuICAgICAgICAgIDogYFx1NURGMlx1NEYxOFx1NTE0OFx1NTQwQ1x1NkI2NVx1NTZGRVx1NzI0N1x1NTIyMFx1OTY2NFx1NTQwRVx1NzY4NFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCJcbiAgICAgICAgICA/IGBQcmlvcml0aXplZCBub3RlIHN5bmMgZmluaXNoZWQgYWZ0ZXIgaW1hZ2UgYWRkOiAke2ZpbGUuYmFzZW5hbWV9YFxuICAgICAgICAgIDogYFByaW9yaXRpemVkIG5vdGUgc3luYyBmaW5pc2hlZCBhZnRlciBpbWFnZSByZW1vdmFsOiAke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiUHJpb3JpdHkgbm90ZSBzeW5jIGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLmRlc2NyaWJlRXJyb3IoXG4gICAgICAgIHRoaXMudChcbiAgICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCIgPyBcIlx1NTZGRVx1NzI0N1x1NjVCMFx1NTg5RVx1NTQwRVx1NzY4NFx1N0IxNFx1OEJCMFx1NEYxOFx1NTE0OFx1NTQwQ1x1NkI2NVx1NTkzMVx1OEQyNVwiIDogXCJcdTU2RkVcdTcyNDdcdTUyMjBcdTk2NjRcdTU0MEVcdTc2ODRcdTdCMTRcdThCQjBcdTRGMThcdTUxNDhcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIixcbiAgICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCIgPyBcIlByaW9yaXR5IG5vdGUgc3luYyBhZnRlciBpbWFnZSBhZGQgZmFpbGVkXCIgOiBcIlByaW9yaXR5IG5vdGUgc3luYyBhZnRlciBpbWFnZSByZW1vdmFsIGZhaWxlZFwiLFxuICAgICAgICApLFxuICAgICAgICBlcnJvcixcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZVBhdGgsIHJlYXNvbik7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY3NJbkZsaWdodC5kZWxldGUobm90ZVBhdGgpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgaGFzUGVuZGluZ0ltYWdlV29ya0Zvck5vdGUobm90ZVBhdGg6IHN0cmluZykge1xuICAgIGlmICh0aGlzLnF1ZXVlLnNvbWUoKHRhc2spID0+IHRhc2subm90ZVBhdGggPT09IG5vdGVQYXRoKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCB0YXNrSWQgb2YgdGhpcy5wcm9jZXNzaW5nVGFza0lkcykge1xuICAgICAgY29uc3QgdGFzayA9IHRoaXMucXVldWUuZmluZCgoaXRlbSkgPT4gaXRlbS5pZCA9PT0gdGFza0lkKTtcbiAgICAgIGlmICh0YXNrPy5ub3RlUGF0aCA9PT0gbm90ZVBhdGgpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBbdGFza0lkXSBvZiB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMpIHtcbiAgICAgIGNvbnN0IHRhc2sgPSB0aGlzLnF1ZXVlLmZpbmQoKGl0ZW0pID0+IGl0ZW0uaWQgPT09IHRhc2tJZCk7XG4gICAgICBpZiAodGFzaz8ubm90ZVBhdGggPT09IG5vdGVQYXRoKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBhc3luYyBidWlsZFVwbG9hZFJlcGxhY2VtZW50cyhjb250ZW50OiBzdHJpbmcsIG5vdGVGaWxlOiBURmlsZSwgdXBsb2FkQ2FjaGU/OiBNYXA8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgY29uc3Qgc2VlbiA9IG5ldyBNYXA8c3RyaW5nLCBVcGxvYWRSZXdyaXRlPigpO1xuICAgIGNvbnN0IHdpa2lNYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtcXFsoW15cXF1dKylcXF1cXF0vZyldO1xuICAgIGNvbnN0IG1hcmtkb3duTWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKC8hXFxbW15cXF1dKl1cXCgoW14pXSspXFwpL2cpXTtcbiAgICBjb25zdCBodG1sSW1hZ2VNYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLzxpbWdcXGJbXj5dKnNyYz1bXCInXShbXlwiJ10rKVtcIiddW14+XSo+L2dpKV07XG5cclxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2Ygd2lraU1hdGNoZXMpIHtcclxuICAgICAgY29uc3QgcmF3TGluayA9IG1hdGNoWzFdLnNwbGl0KFwifFwiKVswXS50cmltKCk7XHJcbiAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGVGaWxlLnBhdGgpO1xyXG4gICAgICBpZiAoIWZpbGUgfHwgIXRoaXMuaXNJbWFnZUZpbGUoZmlsZSkpIHtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxuXG4gICAgICBpZiAoIXNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFZhdWx0RmlsZShmaWxlLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgICAgb3JpZ2luYWw6IG1hdGNoWzBdLFxuICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgZmlsZS5iYXNlbmFtZSksXG4gICAgICAgICAgc291cmNlRmlsZTogZmlsZSxcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIG1hcmtkb3duTWF0Y2hlcykge1xuICAgICAgY29uc3QgcmF3TGluayA9IGRlY29kZVVSSUNvbXBvbmVudChtYXRjaFsxXS50cmltKCkucmVwbGFjZSgvXjx8PiQvZywgXCJcIikpO1xuICAgICAgaWYgKC9eKHdlYmRhdi1zZWN1cmU6fGRhdGE6KS9pLnRlc3QocmF3TGluaykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLmlzSHR0cFVybChyYXdMaW5rKSkge1xuICAgICAgICBpZiAoIXNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICAgIGNvbnN0IHJlbW90ZVVybCA9IGF3YWl0IHRoaXMudXBsb2FkUmVtb3RlSW1hZ2VVcmwocmF3TGluaywgdXBsb2FkQ2FjaGUpO1xuICAgICAgICAgIGNvbnN0IGFsdFRleHQgPSB0aGlzLmV4dHJhY3RNYXJrZG93bkFsdFRleHQobWF0Y2hbMF0pIHx8IHRoaXMuZ2V0RGlzcGxheU5hbWVGcm9tVXJsKHJhd0xpbmspO1xuICAgICAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgICAgICBvcmlnaW5hbDogbWF0Y2hbMF0sXG4gICAgICAgICAgICByZXdyaXR0ZW46IHRoaXMuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGFsdFRleHQpLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBmaWxlID0gdGhpcy5yZXNvbHZlTGlua2VkRmlsZShyYXdMaW5rLCBub3RlRmlsZS5wYXRoKTtcbiAgICAgIGlmICghZmlsZSB8fCAhdGhpcy5pc0ltYWdlRmlsZShmaWxlKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFzZWVuLmhhcyhtYXRjaFswXSkpIHtcbiAgICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRWYXVsdEZpbGUoZmlsZSwgdXBsb2FkQ2FjaGUpO1xuICAgICAgICBzZWVuLnNldChtYXRjaFswXSwge1xuICAgICAgICAgIG9yaWdpbmFsOiBtYXRjaFswXSxcbiAgICAgICAgICByZXdyaXR0ZW46IHRoaXMuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGZpbGUuYmFzZW5hbWUpLFxuICAgICAgICAgIHNvdXJjZUZpbGU6IGZpbGUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgaHRtbEltYWdlTWF0Y2hlcykge1xuICAgICAgY29uc3QgcmF3TGluayA9IHRoaXMudW5lc2NhcGVIdG1sKG1hdGNoWzFdLnRyaW0oKSk7XG4gICAgICBpZiAoIXRoaXMuaXNIdHRwVXJsKHJhd0xpbmspIHx8IHNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRSZW1vdGVJbWFnZVVybChyYXdMaW5rLCB1cGxvYWRDYWNoZSk7XG4gICAgICBjb25zdCBhbHRUZXh0ID0gdGhpcy5leHRyYWN0SHRtbEltYWdlQWx0VGV4dChtYXRjaFswXSkgfHwgdGhpcy5nZXREaXNwbGF5TmFtZUZyb21VcmwocmF3TGluayk7XG4gICAgICBzZWVuLnNldChtYXRjaFswXSwge1xuICAgICAgICBvcmlnaW5hbDogbWF0Y2hbMF0sXG4gICAgICAgIHJld3JpdHRlbjogdGhpcy5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgYWx0VGV4dCksXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gWy4uLnNlZW4udmFsdWVzKCldO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRyYWN0TWFya2Rvd25BbHRUZXh0KG1hcmtkb3duSW1hZ2U6IHN0cmluZykge1xuICAgIGNvbnN0IG1hdGNoID0gbWFya2Rvd25JbWFnZS5tYXRjaCgvXiFcXFsoW15cXF1dKilcXF0vKTtcbiAgICByZXR1cm4gbWF0Y2g/LlsxXT8udHJpbSgpID8/IFwiXCI7XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RIdG1sSW1hZ2VBbHRUZXh0KGh0bWxJbWFnZTogc3RyaW5nKSB7XG4gICAgY29uc3QgbWF0Y2ggPSBodG1sSW1hZ2UubWF0Y2goL1xcYmFsdD1bXCInXShbXlwiJ10qKVtcIiddL2kpO1xuICAgIHJldHVybiBtYXRjaCA/IHRoaXMudW5lc2NhcGVIdG1sKG1hdGNoWzFdLnRyaW0oKSkgOiBcIlwiO1xuICB9XG5cbiAgcHJpdmF0ZSBpc0h0dHBVcmwodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiAvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KHZhbHVlKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0RGlzcGxheU5hbWVGcm9tVXJsKHJhd1VybDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmF3VXJsKTtcbiAgICAgIGNvbnN0IGZpbGVOYW1lID0gdGhpcy5zYW5pdGl6ZUZpbGVOYW1lKHVybC5wYXRobmFtZS5zcGxpdChcIi9cIikucG9wKCkgfHwgXCJcIik7XG4gICAgICBpZiAoZmlsZU5hbWUpIHtcbiAgICAgICAgcmV0dXJuIGZpbGVOYW1lLnJlcGxhY2UoL1xcLlteLl0rJC8sIFwiXCIpO1xuICAgICAgfVxuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gRmFsbCB0aHJvdWdoIHRvIHRoZSBnZW5lcmljIGxhYmVsIGJlbG93LlxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnQoXCJcdTdGNTFcdTk4NzVcdTU2RkVcdTcyNDdcIiwgXCJXZWIgaW1hZ2VcIik7XG4gIH1cblxuICBwcml2YXRlIHJlc29sdmVMaW5rZWRGaWxlKGxpbms6IHN0cmluZywgc291cmNlUGF0aDogc3RyaW5nKTogVEZpbGUgfCBudWxsIHtcbiAgICBjb25zdCBjbGVhbmVkID0gbGluay5yZXBsYWNlKC8jLiovLCBcIlwiKS50cmltKCk7XG4gICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5hcHAubWV0YWRhdGFDYWNoZS5nZXRGaXJzdExpbmtwYXRoRGVzdChjbGVhbmVkLCBzb3VyY2VQYXRoKTtcbiAgICByZXR1cm4gdGFyZ2V0IGluc3RhbmNlb2YgVEZpbGUgPyB0YXJnZXQgOiBudWxsO1xuICB9XHJcblxyXG4gIHByaXZhdGUgaXNJbWFnZUZpbGUoZmlsZTogVEZpbGUpIHtcbiAgICByZXR1cm4gL14ocG5nfGpwZT9nfGdpZnx3ZWJwfGJtcHxzdmcpJC9pLnRlc3QoZmlsZS5leHRlbnNpb24pO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRWYXVsdEZpbGUoZmlsZTogVEZpbGUsIHVwbG9hZENhY2hlPzogTWFwPHN0cmluZywgc3RyaW5nPikge1xuICAgIGlmICh1cGxvYWRDYWNoZT8uaGFzKGZpbGUucGF0aCkpIHtcbiAgICAgIHJldHVybiB1cGxvYWRDYWNoZS5nZXQoZmlsZS5wYXRoKSE7XG4gICAgfVxuXG4gICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG4gICAgY29uc3QgYmluYXJ5ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZEJpbmFyeShmaWxlKTtcbiAgICBjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRoaXMucHJlcGFyZVVwbG9hZFBheWxvYWQoYmluYXJ5LCB0aGlzLmdldE1pbWVUeXBlKGZpbGUuZXh0ZW5zaW9uKSwgZmlsZS5uYW1lKTtcbiAgICBjb25zdCByZW1vdGVOYW1lID0gYXdhaXQgdGhpcy5idWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeShwcmVwYXJlZC5maWxlTmFtZSwgcHJlcGFyZWQuYmluYXJ5KTtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5idWlsZFJlbW90ZVBhdGgocmVtb3RlTmFtZSk7XG4gICAgYXdhaXQgdGhpcy51cGxvYWRCaW5hcnkocmVtb3RlUGF0aCwgcHJlcGFyZWQuYmluYXJ5LCBwcmVwYXJlZC5taW1lVHlwZSk7XG4gICAgY29uc3QgcmVtb3RlVXJsID0gYCR7U0VDVVJFX1BST1RPQ09MfS8vJHtyZW1vdGVQYXRofWA7XG4gICAgdXBsb2FkQ2FjaGU/LnNldChmaWxlLnBhdGgsIHJlbW90ZVVybCk7XG4gICAgcmV0dXJuIHJlbW90ZVVybDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkUmVtb3RlSW1hZ2VVcmwoaW1hZ2VVcmw6IHN0cmluZywgdXBsb2FkQ2FjaGU/OiBNYXA8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgY29uc3QgY2FjaGVLZXkgPSBgcmVtb3RlOiR7aW1hZ2VVcmx9YDtcbiAgICBpZiAodXBsb2FkQ2FjaGU/LmhhcyhjYWNoZUtleSkpIHtcbiAgICAgIHJldHVybiB1cGxvYWRDYWNoZS5nZXQoY2FjaGVLZXkpITtcbiAgICB9XG5cbiAgICB0aGlzLmVuc3VyZUNvbmZpZ3VyZWQoKTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IGltYWdlVXJsLFxuICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgZm9sbG93UmVkaXJlY3RzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFJlbW90ZSBpbWFnZSBkb3dubG9hZCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgY29udGVudFR5cGUgPSByZXNwb25zZS5oZWFkZXJzW1wiY29udGVudC10eXBlXCJdID8/IFwiXCI7XG4gICAgaWYgKCF0aGlzLmlzSW1hZ2VDb250ZW50VHlwZShjb250ZW50VHlwZSkgJiYgIXRoaXMubG9va3NMaWtlSW1hZ2VVcmwoaW1hZ2VVcmwpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiXHU4RkRDXHU3QTBCXHU5NEZFXHU2M0E1XHU0RTBEXHU2NjJGXHU1M0VGXHU4QkM2XHU1MjJCXHU3Njg0XHU1NkZFXHU3MjQ3XHU4RDQ0XHU2RTkwXHUzMDAyXCIsIFwiVGhlIHJlbW90ZSBVUkwgZG9lcyBub3QgbG9vayBsaWtlIGFuIGltYWdlIHJlc291cmNlLlwiKSk7XG4gICAgfVxuXG4gICAgY29uc3QgZmlsZU5hbWUgPSB0aGlzLmJ1aWxkUmVtb3RlU291cmNlRmlsZU5hbWUoaW1hZ2VVcmwsIGNvbnRlbnRUeXBlKTtcbiAgICBjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRoaXMucHJlcGFyZVVwbG9hZFBheWxvYWQoXG4gICAgICByZXNwb25zZS5hcnJheUJ1ZmZlcixcbiAgICAgIHRoaXMubm9ybWFsaXplSW1hZ2VNaW1lVHlwZShjb250ZW50VHlwZSwgZmlsZU5hbWUpLFxuICAgICAgZmlsZU5hbWUsXG4gICAgKTtcbiAgICBjb25zdCByZW1vdGVOYW1lID0gYXdhaXQgdGhpcy5idWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeShwcmVwYXJlZC5maWxlTmFtZSwgcHJlcGFyZWQuYmluYXJ5KTtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5idWlsZFJlbW90ZVBhdGgocmVtb3RlTmFtZSk7XG4gICAgYXdhaXQgdGhpcy51cGxvYWRCaW5hcnkocmVtb3RlUGF0aCwgcHJlcGFyZWQuYmluYXJ5LCBwcmVwYXJlZC5taW1lVHlwZSk7XG4gICAgY29uc3QgcmVtb3RlVXJsID0gYCR7U0VDVVJFX1BST1RPQ09MfS8vJHtyZW1vdGVQYXRofWA7XG4gICAgdXBsb2FkQ2FjaGU/LnNldChjYWNoZUtleSwgcmVtb3RlVXJsKTtcbiAgICByZXR1cm4gcmVtb3RlVXJsO1xuICB9XG5cbiAgcHJpdmF0ZSBpc0ltYWdlQ29udGVudFR5cGUoY29udGVudFR5cGU6IHN0cmluZykge1xuICAgIHJldHVybiAvXmltYWdlXFwvL2kudGVzdChjb250ZW50VHlwZS50cmltKCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBsb29rc0xpa2VJbWFnZVVybChyYXdVcmw6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJhd1VybCk7XG4gICAgICByZXR1cm4gL1xcLihwbmd8anBlP2d8Z2lmfHdlYnB8Ym1wfHN2ZykkL2kudGVzdCh1cmwucGF0aG5hbWUpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRSZW1vdGVTb3VyY2VGaWxlTmFtZShyYXdVcmw6IHN0cmluZywgY29udGVudFR5cGU6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJhd1VybCk7XG4gICAgICBjb25zdCBjYW5kaWRhdGUgPSB0aGlzLnNhbml0aXplRmlsZU5hbWUodXJsLnBhdGhuYW1lLnNwbGl0KFwiL1wiKS5wb3AoKSB8fCBcIlwiKTtcbiAgICAgIGlmIChjYW5kaWRhdGUgJiYgL1xcLlthLXowLTldKyQvaS50ZXN0KGNhbmRpZGF0ZSkpIHtcbiAgICAgICAgcmV0dXJuIGNhbmRpZGF0ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZXh0ZW5zaW9uID0gdGhpcy5nZXRFeHRlbnNpb25Gcm9tTWltZVR5cGUoY29udGVudFR5cGUpIHx8IFwicG5nXCI7XG4gICAgICByZXR1cm4gY2FuZGlkYXRlID8gYCR7Y2FuZGlkYXRlfS4ke2V4dGVuc2lvbn1gIDogYHJlbW90ZS1pbWFnZS4ke2V4dGVuc2lvbn1gO1xuICAgIH0gY2F0Y2gge1xuICAgICAgY29uc3QgZXh0ZW5zaW9uID0gdGhpcy5nZXRFeHRlbnNpb25Gcm9tTWltZVR5cGUoY29udGVudFR5cGUpIHx8IFwicG5nXCI7XG4gICAgICByZXR1cm4gYHJlbW90ZS1pbWFnZS4ke2V4dGVuc2lvbn1gO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgc2FuaXRpemVGaWxlTmFtZShmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGZpbGVOYW1lLnJlcGxhY2UoL1tcXFxcLzoqP1wiPD58XSsvZywgXCItXCIpLnRyaW0oKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0RXh0ZW5zaW9uRnJvbU1pbWVUeXBlKGNvbnRlbnRUeXBlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtaW1lVHlwZSA9IGNvbnRlbnRUeXBlLnNwbGl0KFwiO1wiKVswXS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBzd2l0Y2ggKG1pbWVUeXBlKSB7XG4gICAgICBjYXNlIFwiaW1hZ2UvanBlZ1wiOlxuICAgICAgICByZXR1cm4gXCJqcGdcIjtcbiAgICAgIGNhc2UgXCJpbWFnZS9wbmdcIjpcbiAgICAgICAgcmV0dXJuIFwicG5nXCI7XG4gICAgICBjYXNlIFwiaW1hZ2UvZ2lmXCI6XG4gICAgICAgIHJldHVybiBcImdpZlwiO1xuICAgICAgY2FzZSBcImltYWdlL3dlYnBcIjpcbiAgICAgICAgcmV0dXJuIFwid2VicFwiO1xuICAgICAgY2FzZSBcImltYWdlL2JtcFwiOlxuICAgICAgICByZXR1cm4gXCJibXBcIjtcbiAgICAgIGNhc2UgXCJpbWFnZS9zdmcreG1sXCI6XG4gICAgICAgIHJldHVybiBcInN2Z1wiO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVJbWFnZU1pbWVUeXBlKGNvbnRlbnRUeXBlOiBzdHJpbmcsIGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtaW1lVHlwZSA9IGNvbnRlbnRUeXBlLnNwbGl0KFwiO1wiKVswXS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAobWltZVR5cGUgJiYgbWltZVR5cGUgIT09IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCIpIHtcbiAgICAgIHJldHVybiBtaW1lVHlwZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5nZXRNaW1lVHlwZUZyb21GaWxlTmFtZShmaWxlTmFtZSk7XG4gIH1cblxyXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkQmluYXJ5KHJlbW90ZVBhdGg6IHN0cmluZywgYmluYXJ5OiBBcnJheUJ1ZmZlciwgbWltZVR5cGU6IHN0cmluZykge1xuICAgIGF3YWl0IHRoaXMuZW5zdXJlUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlUGF0aCk7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIlBVVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBtaW1lVHlwZSxcclxuICAgICAgfSxcclxuICAgICAgYm9keTogYmluYXJ5LFxyXG4gICAgfSk7XHJcblxyXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFVwbG9hZCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVFZGl0b3JQYXN0ZShldnQ6IENsaXBib2FyZEV2ZW50LCBlZGl0b3I6IEVkaXRvciwgaW5mbzogTWFya2Rvd25WaWV3IHwgTWFya2Rvd25GaWxlSW5mbykge1xuICAgIGlmIChldnQuZGVmYXVsdFByZXZlbnRlZCB8fCAhaW5mby5maWxlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaW1hZ2VGaWxlID0gdGhpcy5leHRyYWN0SW1hZ2VGaWxlRnJvbUNsaXBib2FyZChldnQpO1xuICAgIGlmIChpbWFnZUZpbGUpIHtcbiAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgY29uc3QgZmlsZU5hbWUgPSBpbWFnZUZpbGUubmFtZSB8fCB0aGlzLmJ1aWxkQ2xpcGJvYXJkRmlsZU5hbWUoaW1hZ2VGaWxlLnR5cGUpO1xuICAgICAgYXdhaXQgdGhpcy5lbnF1ZXVlRWRpdG9ySW1hZ2VVcGxvYWQoaW5mby5maWxlLCBlZGl0b3IsIGltYWdlRmlsZSwgZmlsZU5hbWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGh0bWwgPSBldnQuY2xpcGJvYXJkRGF0YT8uZ2V0RGF0YShcInRleHQvaHRtbFwiKT8udHJpbSgpID8/IFwiXCI7XG4gICAgaWYgKCFodG1sIHx8ICF0aGlzLmh0bWxDb250YWluc1JlbW90ZUltYWdlcyhodG1sKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGF3YWl0IHRoaXMuaGFuZGxlSHRtbFBhc3RlV2l0aFJlbW90ZUltYWdlcyhpbmZvLmZpbGUsIGVkaXRvciwgaHRtbCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUVkaXRvckRyb3AoZXZ0OiBEcmFnRXZlbnQsIGVkaXRvcjogRWRpdG9yLCBpbmZvOiBNYXJrZG93blZpZXcgfCBNYXJrZG93bkZpbGVJbmZvKSB7XG4gICAgaWYgKGV2dC5kZWZhdWx0UHJldmVudGVkIHx8ICFpbmZvLmZpbGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbWFnZUZpbGUgPSB0aGlzLmV4dHJhY3RJbWFnZUZpbGVGcm9tRHJvcChldnQpO1xuICAgIGlmICghaW1hZ2VGaWxlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3QgZmlsZU5hbWUgPSBpbWFnZUZpbGUubmFtZSB8fCB0aGlzLmJ1aWxkQ2xpcGJvYXJkRmlsZU5hbWUoaW1hZ2VGaWxlLnR5cGUpO1xuICAgIGF3YWl0IHRoaXMuZW5xdWV1ZUVkaXRvckltYWdlVXBsb2FkKGluZm8uZmlsZSwgZWRpdG9yLCBpbWFnZUZpbGUsIGZpbGVOYW1lKTtcbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdEltYWdlRmlsZUZyb21DbGlwYm9hcmQoZXZ0OiBDbGlwYm9hcmRFdmVudCkge1xuICAgIGNvbnN0IGRpcmVjdCA9IEFycmF5LmZyb20oZXZ0LmNsaXBib2FyZERhdGE/LmZpbGVzID8/IFtdKS5maW5kKChmaWxlKSA9PiBmaWxlLnR5cGUuc3RhcnRzV2l0aChcImltYWdlL1wiKSk7XG4gICAgaWYgKGRpcmVjdCkge1xuICAgICAgcmV0dXJuIGRpcmVjdDtcbiAgICB9XG5cbiAgICBjb25zdCBpdGVtID0gQXJyYXkuZnJvbShldnQuY2xpcGJvYXJkRGF0YT8uaXRlbXMgPz8gW10pLmZpbmQoKGVudHJ5KSA9PiBlbnRyeS50eXBlLnN0YXJ0c1dpdGgoXCJpbWFnZS9cIikpO1xuICAgIHJldHVybiBpdGVtPy5nZXRBc0ZpbGUoKSA/PyBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBodG1sQ29udGFpbnNSZW1vdGVJbWFnZXMoaHRtbDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIC88aW1nXFxiW14+XSpzcmM9W1wiJ11odHRwcz86XFwvXFwvW15cIiddK1tcIiddW14+XSo+L2kudGVzdChodG1sKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlSHRtbFBhc3RlV2l0aFJlbW90ZUltYWdlcyhub3RlRmlsZTogVEZpbGUsIGVkaXRvcjogRWRpdG9yLCBodG1sOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVuZGVyZWQgPSBhd2FpdCB0aGlzLmNvbnZlcnRIdG1sQ2xpcGJvYXJkVG9TZWN1cmVNYXJrZG93bihodG1sLCBub3RlRmlsZSk7XG4gICAgICBpZiAoIXJlbmRlcmVkLnRyaW0oKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGVkaXRvci5yZXBsYWNlU2VsZWN0aW9uKHJlbmRlcmVkKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1REYyXHU1QzA2XHU3RjUxXHU5ODc1XHU1NkZFXHU2NTg3XHU3Qzk4XHU4RDM0XHU1RTc2XHU2MjkzXHU1M0Q2XHU4RkRDXHU3QTBCXHU1NkZFXHU3MjQ3XHUzMDAyXCIsIFwiUGFzdGVkIHdlYiBjb250ZW50IGFuZCBjYXB0dXJlZCByZW1vdGUgaW1hZ2VzLlwiKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcGFzdGUgSFRNTCBjb250ZW50IHdpdGggcmVtb3RlIGltYWdlc1wiLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKFxuICAgICAgICB0aGlzLmRlc2NyaWJlRXJyb3IoXG4gICAgICAgICAgdGhpcy50KFwiXHU1OTA0XHU3NDA2XHU3RjUxXHU5ODc1XHU1NkZFXHU2NTg3XHU3Qzk4XHU4RDM0XHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIHByb2Nlc3MgcGFzdGVkIHdlYiBjb250ZW50XCIpLFxuICAgICAgICAgIGVycm9yLFxuICAgICAgICApLFxuICAgICAgICA4MDAwLFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNvbnZlcnRIdG1sQ2xpcGJvYXJkVG9TZWN1cmVNYXJrZG93bihodG1sOiBzdHJpbmcsIG5vdGVGaWxlOiBURmlsZSkge1xuICAgIGNvbnN0IHBhcnNlciA9IG5ldyBET01QYXJzZXIoKTtcbiAgICBjb25zdCBkb2N1bWVudCA9IHBhcnNlci5wYXJzZUZyb21TdHJpbmcoaHRtbCwgXCJ0ZXh0L2h0bWxcIik7XG4gICAgY29uc3QgdXBsb2FkQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgIGNvbnN0IHJlbmRlcmVkQmxvY2tzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBub2RlIG9mIEFycmF5LmZyb20oZG9jdW1lbnQuYm9keS5jaGlsZE5vZGVzKSkge1xuICAgICAgY29uc3QgYmxvY2sgPSBhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxOb2RlKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgMCk7XG4gICAgICBpZiAoYmxvY2sudHJpbSgpKSB7XG4gICAgICAgIHJlbmRlcmVkQmxvY2tzLnB1c2goYmxvY2sudHJpbSgpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVuZGVyZWRCbG9ja3Muam9pbihcIlxcblxcblwiKSArIFwiXFxuXCI7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlbmRlclBhc3RlZEh0bWxOb2RlKFxuICAgIG5vZGU6IE5vZGUsXG4gICAgbm90ZUZpbGU6IFRGaWxlLFxuICAgIHVwbG9hZENhY2hlOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuICAgIGxpc3REZXB0aDogbnVtYmVyLFxuICApOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSkge1xuICAgICAgcmV0dXJuIHRoaXMubm9ybWFsaXplQ2xpcGJvYXJkVGV4dChub2RlLnRleHRDb250ZW50ID8/IFwiXCIpO1xuICAgIH1cblxuICAgIGlmICghKG5vZGUgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkpIHtcbiAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cblxuICAgIGNvbnN0IHRhZyA9IG5vZGUudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmICh0YWcgPT09IFwiaW1nXCIpIHtcbiAgICAgIGNvbnN0IHNyYyA9IHRoaXMudW5lc2NhcGVIdG1sKG5vZGUuZ2V0QXR0cmlidXRlKFwic3JjXCIpPy50cmltKCkgPz8gXCJcIik7XG4gICAgICBpZiAoIXRoaXMuaXNIdHRwVXJsKHNyYykpIHtcbiAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFsdCA9IChub2RlLmdldEF0dHJpYnV0ZShcImFsdFwiKSA/PyBcIlwiKS50cmltKCkgfHwgdGhpcy5nZXREaXNwbGF5TmFtZUZyb21Vcmwoc3JjKTtcbiAgICAgIGNvbnN0IHJlbW90ZVVybCA9IGF3YWl0IHRoaXMudXBsb2FkUmVtb3RlSW1hZ2VVcmwoc3JjLCB1cGxvYWRDYWNoZSk7XG4gICAgICByZXR1cm4gdGhpcy5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgYWx0KTtcbiAgICB9XG5cbiAgICBpZiAodGFnID09PSBcImJyXCIpIHtcbiAgICAgIHJldHVybiBcIlxcblwiO1xuICAgIH1cblxuICAgIGlmICh0YWcgPT09IFwidWxcIiB8fCB0YWcgPT09IFwib2xcIikge1xuICAgICAgY29uc3QgaXRlbXM6IHN0cmluZ1tdID0gW107XG4gICAgICBsZXQgaW5kZXggPSAxO1xuICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKG5vZGUuY2hpbGRyZW4pKSB7XG4gICAgICAgIGlmIChjaGlsZC50YWdOYW1lLnRvTG93ZXJDYXNlKCkgIT09IFwibGlcIikge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVuZGVyZWQgPSAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sTm9kZShjaGlsZCwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGggKyAxKSkudHJpbSgpO1xuICAgICAgICBpZiAoIXJlbmRlcmVkKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwcmVmaXggPSB0YWcgPT09IFwib2xcIiA/IGAke2luZGV4fS4gYCA6IFwiLSBcIjtcbiAgICAgICAgaXRlbXMucHVzaChgJHtcIiAgXCIucmVwZWF0KE1hdGgubWF4KDAsIGxpc3REZXB0aCkpfSR7cHJlZml4fSR7cmVuZGVyZWR9YCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBpdGVtcy5qb2luKFwiXFxuXCIpO1xuICAgIH1cblxuICAgIGlmICh0YWcgPT09IFwibGlcIikge1xuICAgICAgY29uc3QgcGFydHMgPSBhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCk7XG4gICAgICByZXR1cm4gcGFydHMuam9pbihcIlwiKS50cmltKCk7XG4gICAgfVxuXG4gICAgaWYgKC9eaFsxLTZdJC8udGVzdCh0YWcpKSB7XG4gICAgICBjb25zdCBsZXZlbCA9IE51bWJlci5wYXJzZUludCh0YWdbMV0sIDEwKTtcbiAgICAgIGNvbnN0IHRleHQgPSAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpLnRyaW0oKTtcbiAgICAgIHJldHVybiB0ZXh0ID8gYCR7XCIjXCIucmVwZWF0KGxldmVsKX0gJHt0ZXh0fWAgOiBcIlwiO1xuICAgIH1cblxuICAgIGlmICh0YWcgPT09IFwiYVwiKSB7XG4gICAgICBjb25zdCBocmVmID0gbm9kZS5nZXRBdHRyaWJ1dGUoXCJocmVmXCIpPy50cmltKCkgPz8gXCJcIjtcbiAgICAgIGNvbnN0IHRleHQgPSAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpLnRyaW0oKTtcbiAgICAgIGlmIChocmVmICYmIC9eaHR0cHM/OlxcL1xcLy9pLnRlc3QoaHJlZikgJiYgdGV4dCkge1xuICAgICAgICByZXR1cm4gYFske3RleHR9XSgke2hyZWZ9KWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGV4dDtcbiAgICB9XG5cbiAgICBjb25zdCBpbmxpbmVUYWdzID0gbmV3IFNldChbXCJzdHJvbmdcIiwgXCJiXCIsIFwiZW1cIiwgXCJpXCIsIFwic3BhblwiLCBcImNvZGVcIiwgXCJzbWFsbFwiLCBcInN1cFwiLCBcInN1YlwiXSk7XG4gICAgaWYgKGlubGluZVRhZ3MuaGFzKHRhZykpIHtcbiAgICAgIHJldHVybiAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IGJsb2NrVGFncyA9IG5ldyBTZXQoW1xuICAgICAgXCJwXCIsXG4gICAgICBcImRpdlwiLFxuICAgICAgXCJhcnRpY2xlXCIsXG4gICAgICBcInNlY3Rpb25cIixcbiAgICAgIFwiZmlndXJlXCIsXG4gICAgICBcImZpZ2NhcHRpb25cIixcbiAgICAgIFwiYmxvY2txdW90ZVwiLFxuICAgICAgXCJwcmVcIixcbiAgICAgIFwidGFibGVcIixcbiAgICAgIFwidGhlYWRcIixcbiAgICAgIFwidGJvZHlcIixcbiAgICAgIFwidHJcIixcbiAgICAgIFwidGRcIixcbiAgICAgIFwidGhcIixcbiAgICBdKTtcbiAgICBpZiAoYmxvY2tUYWdzLmhhcyh0YWcpKSB7XG4gICAgICBjb25zdCB0ZXh0ID0gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKSkuam9pbihcIlwiKS50cmltKCk7XG4gICAgICByZXR1cm4gdGV4dDtcbiAgICB9XG5cbiAgICByZXR1cm4gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKSkuam9pbihcIlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKFxuICAgIGVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuICAgIG5vdGVGaWxlOiBURmlsZSxcbiAgICB1cGxvYWRDYWNoZTogTWFwPHN0cmluZywgc3RyaW5nPixcbiAgICBsaXN0RGVwdGg6IG51bWJlcixcbiAgKSB7XG4gICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKGVsZW1lbnQuY2hpbGROb2RlcykpIHtcbiAgICAgIGNvbnN0IHJlbmRlcmVkID0gYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sTm9kZShjaGlsZCwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpO1xuICAgICAgaWYgKCFyZW5kZXJlZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDAgJiYgIXJlbmRlcmVkLnN0YXJ0c1dpdGgoXCJcXG5cIikgJiYgIXBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdLmVuZHNXaXRoKFwiXFxuXCIpKSB7XG4gICAgICAgIGNvbnN0IHByZXZpb3VzID0gcGFydHNbcGFydHMubGVuZ3RoIC0gMV07XG4gICAgICAgIGNvbnN0IG5lZWRzU3BhY2UgPSAvXFxTJC8udGVzdChwcmV2aW91cykgJiYgL15cXFMvLnRlc3QocmVuZGVyZWQpO1xuICAgICAgICBpZiAobmVlZHNTcGFjZSkge1xuICAgICAgICAgIHBhcnRzLnB1c2goXCIgXCIpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHBhcnRzLnB1c2gocmVuZGVyZWQpO1xuICAgIH1cblxuICAgIHJldHVybiBwYXJ0cztcbiAgfVxuXG4gIHByaXZhdGUgbm9ybWFsaXplQ2xpcGJvYXJkVGV4dCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1xccysvZywgXCIgXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRyYWN0SW1hZ2VGaWxlRnJvbURyb3AoZXZ0OiBEcmFnRXZlbnQpIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShldnQuZGF0YVRyYW5zZmVyPy5maWxlcyA/PyBbXSkuZmluZCgoZmlsZSkgPT4gZmlsZS50eXBlLnN0YXJ0c1dpdGgoXCJpbWFnZS9cIikpID8/IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGVucXVldWVFZGl0b3JJbWFnZVVwbG9hZChub3RlRmlsZTogVEZpbGUsIGVkaXRvcjogRWRpdG9yLCBpbWFnZUZpbGU6IEZpbGUsIGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgYXJyYXlCdWZmZXIgPSBhd2FpdCBpbWFnZUZpbGUuYXJyYXlCdWZmZXIoKTtcbiAgICAgIGNvbnN0IHRhc2sgPSB0aGlzLmNyZWF0ZVVwbG9hZFRhc2soXG4gICAgICAgIG5vdGVGaWxlLnBhdGgsXG4gICAgICAgIGFycmF5QnVmZmVyLFxuICAgICAgICBpbWFnZUZpbGUudHlwZSB8fCB0aGlzLmdldE1pbWVUeXBlRnJvbUZpbGVOYW1lKGZpbGVOYW1lKSxcbiAgICAgICAgZmlsZU5hbWUsXG4gICAgICApO1xuICAgICAgdGhpcy5pbnNlcnRQbGFjZWhvbGRlcihlZGl0b3IsIHRhc2sucGxhY2Vob2xkZXIpO1xuICAgICAgdGhpcy5xdWV1ZS5wdXNoKHRhc2spO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIHZvaWQgdGhpcy5wcm9jZXNzUGVuZGluZ1Rhc2tzKCk7XG4gICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NURGMlx1NTJBMFx1NTE2NVx1NTZGRVx1NzI0N1x1ODFFQVx1NTJBOFx1NEUwQVx1NEYyMFx1OTYxRlx1NTIxN1x1MzAwMlwiLCBcIkltYWdlIGFkZGVkIHRvIHRoZSBhdXRvLXVwbG9hZCBxdWV1ZS5cIikpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHF1ZXVlIHNlY3VyZSBpbWFnZSB1cGxvYWRcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU1MkEwXHU1MTY1XHU1NkZFXHU3MjQ3XHU4MUVBXHU1MkE4XHU0RTBBXHU0RjIwXHU5NjFGXHU1MjE3XHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIHF1ZXVlIGltYWdlIGZvciBhdXRvLXVwbG9hZFwiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVVwbG9hZFRhc2sobm90ZVBhdGg6IHN0cmluZywgYmluYXJ5OiBBcnJheUJ1ZmZlciwgbWltZVR5cGU6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZyk6IFVwbG9hZFRhc2sge1xuICAgIGNvbnN0IGlkID0gYHNlY3VyZS13ZWJkYXYtdGFzay0ke0RhdGUubm93KCl9LSR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMiwgOCl9YDtcbiAgICByZXR1cm4ge1xuICAgICAgaWQsXG4gICAgICBub3RlUGF0aCxcbiAgICAgIHBsYWNlaG9sZGVyOiB0aGlzLmJ1aWxkUGVuZGluZ1BsYWNlaG9sZGVyKGlkLCBmaWxlTmFtZSksXG4gICAgICBtaW1lVHlwZSxcbiAgICAgIGZpbGVOYW1lLFxuICAgICAgZGF0YUJhc2U2NDogdGhpcy5hcnJheUJ1ZmZlclRvQmFzZTY0KGJpbmFyeSksXG4gICAgICBhdHRlbXB0czogMCxcbiAgICAgIGNyZWF0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZFBlbmRpbmdQbGFjZWhvbGRlcih0YXNrSWQ6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHNhZmVOYW1lID0gdGhpcy5lc2NhcGVIdG1sKGZpbGVOYW1lKTtcbiAgICByZXR1cm4gYDxzcGFuIGNsYXNzPVwic2VjdXJlLXdlYmRhdi1wZW5kaW5nXCIgZGF0YS1zZWN1cmUtd2ViZGF2LXRhc2s9XCIke3Rhc2tJZH1cIiBhcmlhLWxhYmVsPVwiJHtzYWZlTmFtZX1cIj4ke3RoaXMuZXNjYXBlSHRtbCh0aGlzLnQoYFx1MzAxMFx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NEUyRFx1RkY1QyR7ZmlsZU5hbWV9XHUzMDExYCwgYFtVcGxvYWRpbmcgaW1hZ2UgfCAke2ZpbGVOYW1lfV1gKSl9PC9zcGFuPmA7XG4gIH1cblxuICBwcml2YXRlIGluc2VydFBsYWNlaG9sZGVyKGVkaXRvcjogRWRpdG9yLCBwbGFjZWhvbGRlcjogc3RyaW5nKSB7XG4gICAgZWRpdG9yLnJlcGxhY2VTZWxlY3Rpb24oYCR7cGxhY2Vob2xkZXJ9XFxuYCk7XG4gIH1cblxuICBhc3luYyBzeW5jQ29uZmlndXJlZFZhdWx0Q29udGVudChzaG93Tm90aWNlID0gdHJ1ZSkge1xuICAgIGlmICh0aGlzLnN5bmNJblByb2dyZXNzKSB7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NTQwQ1x1NkI2NVx1NkI2M1x1NTcyOFx1OEZEQlx1ODg0Q1x1NEUyRFx1MzAwMlwiLCBcIkEgc3luYyBpcyBhbHJlYWR5IGluIHByb2dyZXNzLlwiKSwgNDAwMCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zeW5jSW5Qcm9ncmVzcyA9IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xuICAgICAgYXdhaXQgdGhpcy53YWl0Rm9yUGVuZGluZ1ZhdWx0TXV0YXRpb25zKCk7XG4gICAgICBjb25zdCB1cGxvYWRzUmVhZHkgPSBhd2FpdCB0aGlzLnByZXBhcmVQZW5kaW5nVXBsb2Fkc0ZvclN5bmMoc2hvd05vdGljZSk7XG4gICAgICBpZiAoIXVwbG9hZHNSZWFkeSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBhd2FpdCB0aGlzLnJlYnVpbGRSZWZlcmVuY2VJbmRleCgpO1xuXG4gICAgICBjb25zdCByZW1vdGVJbnZlbnRvcnkgPSBhd2FpdCB0aGlzLmxpc3RSZW1vdGVUcmVlKHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKTtcbiAgICAgIGNvbnN0IGRlbGV0aW9uVG9tYnN0b25lcyA9IGF3YWl0IHRoaXMucmVhZERlbGV0aW9uVG9tYnN0b25lcygpO1xuICAgICAgY29uc3QgcmVtb3RlRmlsZXMgPSByZW1vdGVJbnZlbnRvcnkuZmlsZXM7XG4gICAgICBsZXQgcmVzdG9yZWRGcm9tUmVtb3RlID0gMDtcbiAgICAgIGxldCBkZWxldGVkUmVtb3RlRmlsZXMgPSAwO1xuICAgICAgbGV0IGRlbGV0ZWRMb2NhbEZpbGVzID0gMDtcbiAgICAgIGxldCBkZWxldGVkTG9jYWxTdHVicyA9IDA7XG5cbiAgICAgIGxldCBmaWxlcyA9IHRoaXMuY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCk7XG4gICAgICBsZXQgY3VycmVudFBhdGhzID0gbmV3IFNldChmaWxlcy5tYXAoKGZpbGUpID0+IGZpbGUucGF0aCkpO1xuICAgICAgZm9yIChjb25zdCBwYXRoIG9mIFsuLi50aGlzLnN5bmNJbmRleC5rZXlzKCldKSB7XG4gICAgICAgIGlmICghY3VycmVudFBhdGhzLmhhcyhwYXRoKSkge1xuICAgICAgICAgIGNvbnN0IHByZXZpb3VzID0gdGhpcy5zeW5jSW5kZXguZ2V0KHBhdGgpO1xuICAgICAgICAgIGlmICghcHJldmlvdXMpIHtcbiAgICAgICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShwYXRoKTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHJlbW90ZSA9IHJlbW90ZUZpbGVzLmdldChwcmV2aW91cy5yZW1vdGVQYXRoKTtcbiAgICAgICAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKHBhdGgpO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldChwYXRoKTtcbiAgICAgICAgICBpZiAodG9tYnN0b25lICYmIHRoaXMuaXNUb21ic3RvbmVBdXRob3JpdGF0aXZlKHRvbWJzdG9uZSwgcmVtb3RlKSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgICAgICByZW1vdGVGaWxlcy5kZWxldGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKHBhdGgpO1xuICAgICAgICAgICAgZGVsZXRlZFJlbW90ZUZpbGVzICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKHBhdGgpO1xuICAgICAgICAgICAgZGVsZXRpb25Ub21ic3RvbmVzLmRlbGV0ZShwYXRoKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocHJldmlvdXMucmVtb3RlU2lnbmF0dXJlICYmIHByZXZpb3VzLnJlbW90ZVNpZ25hdHVyZSAhPT0gcmVtb3RlLnNpZ25hdHVyZSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KHBhdGgsIHJlbW90ZSk7XG4gICAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQocGF0aCwge1xuICAgICAgICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgICAgICByZW1vdGVQYXRoOiByZW1vdGUucmVtb3RlUGF0aCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmVzdG9yZWRGcm9tUmVtb3RlICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQocGF0aCwgcmVtb3RlKTtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQocGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVQYXRoOiByZW1vdGUucmVtb3RlUGF0aCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXN0b3JlZEZyb21SZW1vdGUgKz0gMTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBsZXQgdXBsb2FkZWQgPSAwO1xuICAgICAgbGV0IHNraXBwZWQgPSAwO1xuICAgICAgbGV0IG1pc3NpbmdSZW1vdGVCYWNrZWROb3RlcyA9IDA7XG4gICAgICBsZXQgcHVyZ2VkTWlzc2luZ0xhenlOb3RlcyA9IDA7XG5cbiAgICAgIGZpbGVzID0gdGhpcy5jb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKTtcbiAgICAgIGN1cnJlbnRQYXRocyA9IG5ldyBTZXQoZmlsZXMubWFwKChmaWxlKSA9PiBmaWxlLnBhdGgpKTtcbiAgICAgIGZvciAoY29uc3QgcmVtb3RlIG9mIFsuLi5yZW1vdGVGaWxlcy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5yZW1vdGVQYXRoLmxvY2FsZUNvbXBhcmUoYi5yZW1vdGVQYXRoKSkpIHtcbiAgICAgICAgY29uc3QgdmF1bHRQYXRoID0gdGhpcy5yZW1vdGVQYXRoVG9WYXVsdFBhdGgocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICBpZiAoIXZhdWx0UGF0aCB8fCBjdXJyZW50UGF0aHMuaGFzKHZhdWx0UGF0aCkpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICBjb25zdCB0b21ic3RvbmUgPSBkZWxldGlvblRvbWJzdG9uZXMuZ2V0KHZhdWx0UGF0aCk7XG4gICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgIGlmICh0aGlzLmlzVG9tYnN0b25lQXV0aG9yaXRhdGl2ZSh0b21ic3RvbmUsIHJlbW90ZSkpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICByZW1vdGVGaWxlcy5kZWxldGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICAgIGRlbGV0ZWRSZW1vdGVGaWxlcyArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZSh2YXVsdFBhdGgpO1xuICAgICAgICBkZWxldGlvblRvbWJzdG9uZXMuZGVsZXRlKHZhdWx0UGF0aCk7XG4gICAgICB9XG5cbiAgICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KHZhdWx0UGF0aCwgcmVtb3RlKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KHZhdWx0UGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVQYXRoOiByZW1vdGUucmVtb3RlUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlc3RvcmVkRnJvbVJlbW90ZSArPSAxO1xuICAgICAgfVxuXG4gICAgICBmaWxlcyA9IHRoaXMuY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCk7XG4gICAgICBjdXJyZW50UGF0aHMgPSBuZXcgU2V0KGZpbGVzLm1hcCgoZmlsZSkgPT4gZmlsZS5wYXRoKSk7XG4gICAgICBjb25zdCBsb2NhbFJlbW90ZVBhdGhzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgICBsZXQgZG93bmxvYWRlZE9yVXBkYXRlZCA9IDA7XG4gICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgIGxvY2FsUmVtb3RlUGF0aHMuYWRkKHJlbW90ZVBhdGgpO1xuICAgICAgICBjb25zdCByZW1vdGUgPSByZW1vdGVGaWxlcy5nZXQocmVtb3RlUGF0aCk7XG4gICAgICAgIGNvbnN0IHJlbW90ZVNpZ25hdHVyZSA9IHJlbW90ZT8uc2lnbmF0dXJlID8/IFwiXCI7XG4gICAgICAgIGNvbnN0IHByZXZpb3VzID0gdGhpcy5zeW5jSW5kZXguZ2V0KGZpbGUucGF0aCk7XG4gICAgICAgIGNvbnN0IG1hcmtkb3duQ29udGVudCA9IGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIgPyBhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSkgOiBudWxsO1xuICAgICAgICBjb25zdCBsb2NhbFNpZ25hdHVyZSA9IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUoZmlsZSwgbWFya2Rvd25Db250ZW50ID8/IHVuZGVmaW5lZCk7XG5cbiAgICAgICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgICAgICBjb25zdCBzdHViID0gdGhpcy5wYXJzZU5vdGVTdHViKG1hcmtkb3duQ29udGVudCA/PyBcIlwiKTtcbiAgICAgICAgICBpZiAoc3R1Yikge1xuICAgICAgICAgICAgY29uc3Qgc3R1YlJlbW90ZSA9IHJlbW90ZUZpbGVzLmdldChzdHViLnJlbW90ZVBhdGgpO1xuICAgICAgICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldChmaWxlLnBhdGgpO1xuICAgICAgICAgICAgaWYgKCFzdHViUmVtb3RlICYmIHRvbWJzdG9uZSkge1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGUpO1xuICAgICAgICAgICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgICAgdGhpcy5jbGVhck1pc3NpbmdMYXp5UmVtb3RlKGZpbGUucGF0aCk7XG4gICAgICAgICAgICAgIGRlbGV0ZWRMb2NhbEZpbGVzICs9IDE7XG4gICAgICAgICAgICAgIGRlbGV0ZWRMb2NhbFN0dWJzICs9IDE7XG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFzdHViUmVtb3RlKSB7XG4gICAgICAgICAgICAgIGNvbnN0IG1pc3NpbmdSZWNvcmQgPSB0aGlzLm1hcmtNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgICAgICAgICBpZiAobWlzc2luZ1JlY29yZC5taXNzQ291bnQgPj0gdGhpcy5taXNzaW5nTGF6eVJlbW90ZUNvbmZpcm1hdGlvbnMpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGUpO1xuICAgICAgICAgICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgICAgICAgICAgIHRoaXMuY2xlYXJNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgICAgICAgICAgIGRlbGV0ZWRMb2NhbEZpbGVzICs9IDE7XG4gICAgICAgICAgICAgICAgZGVsZXRlZExvY2FsU3R1YnMgKz0gMTtcbiAgICAgICAgICAgICAgICBwdXJnZWRNaXNzaW5nTGF6eU5vdGVzICs9IDE7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgbWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzICs9IDE7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0aGlzLmNsZWFyTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogc3R1YlJlbW90ZT8uc2lnbmF0dXJlID8/IHByZXZpb3VzPy5yZW1vdGVTaWduYXR1cmUgPz8gXCJcIixcbiAgICAgICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgc2tpcHBlZCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldChmaWxlLnBhdGgpO1xuICAgICAgICBjb25zdCB1bmNoYW5nZWRTaW5jZUxhc3RTeW5jID0gcHJldmlvdXMgPyBwcmV2aW91cy5sb2NhbFNpZ25hdHVyZSA9PT0gbG9jYWxTaWduYXR1cmUgOiBmYWxzZTtcbiAgICAgICAgaWYgKHRvbWJzdG9uZSkge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHVuY2hhbmdlZFNpbmNlTGFzdFN5bmMgJiZcbiAgICAgICAgICAgIHRoaXMuc2hvdWxkRGVsZXRlTG9jYWxGcm9tVG9tYnN0b25lKGZpbGUsIHRvbWJzdG9uZSkgJiZcbiAgICAgICAgICAgIHRoaXMuaXNUb21ic3RvbmVBdXRob3JpdGF0aXZlKHRvbWJzdG9uZSwgcmVtb3RlKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5yZW1vdmVMb2NhbFZhdWx0RmlsZShmaWxlKTtcbiAgICAgICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgICAgICAgZGVsZXRlZExvY2FsRmlsZXMgKz0gMTtcbiAgICAgICAgICAgIGlmIChyZW1vdGUpIHtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgICAgICAgIHJlbW90ZUZpbGVzLmRlbGV0ZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgICAgICAgIGRlbGV0ZWRSZW1vdGVGaWxlcyArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgICAgIGRlbGV0aW9uVG9tYnN0b25lcy5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghcmVtb3RlKSB7XG4gICAgICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCwgbWFya2Rvd25Db250ZW50ID8/IHVuZGVmaW5lZCk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmVtb3RlRmlsZXMuc2V0KHJlbW90ZVBhdGgsIHVwbG9hZGVkUmVtb3RlKTtcbiAgICAgICAgICB1cGxvYWRlZCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFwcmV2aW91cykge1xuICAgICAgICAgIGlmIChsb2NhbFNpZ25hdHVyZSA9PT0gcmVtb3RlU2lnbmF0dXJlKSB7XG4gICAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICAgICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgIHNraXBwZWQgKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICh0aGlzLnNob3VsZERvd25sb2FkUmVtb3RlVmVyc2lvbihmaWxlLnN0YXQubXRpbWUsIHJlbW90ZS5sYXN0TW9kaWZpZWQpKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgICAgICAgICAgY29uc3QgcmVmcmVzaGVkID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUocmVmcmVzaGVkKSA6IHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBkb3dubG9hZGVkT3JVcGRhdGVkICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoLCBtYXJrZG93bkNvbnRlbnQgPz8gdW5kZWZpbmVkKTtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZW1vdGVGaWxlcy5zZXQocmVtb3RlUGF0aCwgdXBsb2FkZWRSZW1vdGUpO1xuICAgICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgICB1cGxvYWRlZCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbG9jYWxDaGFuZ2VkID0gcHJldmlvdXMubG9jYWxTaWduYXR1cmUgIT09IGxvY2FsU2lnbmF0dXJlIHx8IHByZXZpb3VzLnJlbW90ZVBhdGggIT09IHJlbW90ZVBhdGg7XG4gICAgICAgIGNvbnN0IHJlbW90ZUNoYW5nZWQgPSBwcmV2aW91cy5yZW1vdGVTaWduYXR1cmUgIT09IHJlbW90ZVNpZ25hdHVyZSB8fCBwcmV2aW91cy5yZW1vdGVQYXRoICE9PSByZW1vdGVQYXRoO1xuICAgICAgICBpZiAoIWxvY2FsQ2hhbmdlZCAmJiAhcmVtb3RlQ2hhbmdlZCkge1xuICAgICAgICAgIHNraXBwZWQgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghbG9jYWxDaGFuZ2VkICYmIHJlbW90ZUNoYW5nZWQpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgICAgICAgIGNvbnN0IHJlZnJlc2hlZCA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUocmVmcmVzaGVkKSA6IHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgZG93bmxvYWRlZE9yVXBkYXRlZCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGxvY2FsQ2hhbmdlZCAmJiAhcmVtb3RlQ2hhbmdlZCkge1xuICAgICAgICAgIGNvbnN0IHVwbG9hZGVkUmVtb3RlID0gYXdhaXQgdGhpcy51cGxvYWRDb250ZW50RmlsZVRvUmVtb3RlKGZpbGUsIHJlbW90ZVBhdGgsIG1hcmtkb3duQ29udGVudCA/PyB1bmRlZmluZWQpO1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiB1cGxvYWRlZFJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJlbW90ZUZpbGVzLnNldChyZW1vdGVQYXRoLCB1cGxvYWRlZFJlbW90ZSk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgICAgIHVwbG9hZGVkICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5zaG91bGREb3dubG9hZFJlbW90ZVZlcnNpb24oZmlsZS5zdGF0Lm10aW1lLCByZW1vdGUubGFzdE1vZGlmaWVkKSkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuZG93bmxvYWRSZW1vdGVGaWxlVG9WYXVsdChmaWxlLnBhdGgsIHJlbW90ZSwgZmlsZSk7XG4gICAgICAgICAgY29uc3QgcmVmcmVzaGVkID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVmcmVzaGVkID8gYXdhaXQgdGhpcy5idWlsZEN1cnJlbnRMb2NhbFNpZ25hdHVyZShyZWZyZXNoZWQpIDogcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBkb3dubG9hZGVkT3JVcGRhdGVkICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoLCBtYXJrZG93bkNvbnRlbnQgPz8gdW5kZWZpbmVkKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICByZW1vdGVGaWxlcy5zZXQocmVtb3RlUGF0aCwgdXBsb2FkZWRSZW1vdGUpO1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCk7XG4gICAgICAgIHVwbG9hZGVkICs9IDE7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGRlbGV0ZWRSZW1vdGVEaXJlY3RvcmllcyA9IGF3YWl0IHRoaXMuZGVsZXRlRXh0cmFSZW1vdGVEaXJlY3RvcmllcyhcbiAgICAgICAgcmVtb3RlSW52ZW50b3J5LmRpcmVjdG9yaWVzLFxuICAgICAgICB0aGlzLmJ1aWxkRXhwZWN0ZWRSZW1vdGVEaXJlY3Rvcmllcyhsb2NhbFJlbW90ZVBhdGhzLCB0aGlzLnNldHRpbmdzLnZhdWx0U3luY1JlbW90ZUZvbGRlciksXG4gICAgICApO1xuICAgICAgY29uc3QgaW1hZ2VDbGVhbnVwID0gYXdhaXQgdGhpcy5yZWNvbmNpbGVSZW1vdGVJbWFnZXMoKTtcbiAgICAgIGNvbnN0IGV2aWN0ZWROb3RlcyA9IGF3YWl0IHRoaXMuZXZpY3RTdGFsZVN5bmNlZE5vdGVzKGZhbHNlKTtcblxuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy50KFxuICAgICAgICBgXHU1REYyXHU1M0NDXHU1NDExXHU1NDBDXHU2QjY1XHVGRjFBXHU0RTBBXHU0RjIwICR7dXBsb2FkZWR9IFx1NEUyQVx1NjU4N1x1NEVGNlx1RkYwQ1x1NEVDRVx1OEZEQ1x1N0FFRlx1NjJDOVx1NTNENiAke3Jlc3RvcmVkRnJvbVJlbW90ZSArIGRvd25sb2FkZWRPclVwZGF0ZWR9IFx1NEUyQVx1NjU4N1x1NEVGNlx1RkYwQ1x1OERGM1x1OEZDNyAke3NraXBwZWR9IFx1NEUyQVx1NjcyQVx1NTNEOFx1NTMxNlx1NjU4N1x1NEVGNlx1RkYwQ1x1NTIyMFx1OTY2NFx1OEZEQ1x1N0FFRlx1NTE4NVx1NUJCOSAke2RlbGV0ZWRSZW1vdGVGaWxlc30gXHU0RTJBXHUzMDAxXHU2NzJDXHU1NzMwXHU1MTg1XHU1QkI5ICR7ZGVsZXRlZExvY2FsRmlsZXN9IFx1NEUyQSR7ZGVsZXRlZExvY2FsU3R1YnMgPiAwID8gYFx1RkYwOFx1NTE3Nlx1NEUyRFx1NTkzMVx1NjU0OFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMCAke2RlbGV0ZWRMb2NhbFN0dWJzfSBcdTdCQzdcdUZGMDlgIDogXCJcIn1cdUZGMENcdTZFMDVcdTc0MDZcdThGRENcdTdBRUZcdTdBN0FcdTc2RUVcdTVGNTUgJHtkZWxldGVkUmVtb3RlRGlyZWN0b3JpZXN9IFx1NEUyQVx1RkYwQ1x1NkUwNVx1NzQwNlx1NTE5N1x1NEY1OVx1NTZGRVx1NzI0NyAke2ltYWdlQ2xlYW51cC5kZWxldGVkRmlsZXN9IFx1NUYyMFx1MzAwMVx1NzZFRVx1NUY1NSAke2ltYWdlQ2xlYW51cC5kZWxldGVkRGlyZWN0b3JpZXN9IFx1NEUyQSR7ZXZpY3RlZE5vdGVzID4gMCA/IGBcdUZGMENcdTU2REVcdTY1MzZcdTY3MkNcdTU3MzBcdTY1RTdcdTdCMTRcdThCQjAgJHtldmljdGVkTm90ZXN9IFx1N0JDN2AgOiBcIlwifSR7bWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzID4gMCA/IGBcdUZGMENcdTVFNzZcdTUzRDFcdTczQjAgJHttaXNzaW5nUmVtb3RlQmFja2VkTm90ZXN9IFx1N0JDN1x1NjMwOVx1OTcwMFx1N0IxNFx1OEJCMFx1N0YzQVx1NUMxMVx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N2AgOiBcIlwifSR7cHVyZ2VkTWlzc2luZ0xhenlOb3RlcyA+IDAgPyBgXHVGRjBDXHU3ODZFXHU4QkE0XHU2RTA1XHU3NDA2XHU1OTMxXHU2NTQ4XHU1MzYwXHU0RjREXHU3QjE0XHU4QkIwICR7cHVyZ2VkTWlzc2luZ0xhenlOb3Rlc30gXHU3QkM3YCA6IFwiXCJ9XHUzMDAyYCxcbiAgICAgICAgYEJpZGlyZWN0aW9uYWwgc3luYyB1cGxvYWRlZCAke3VwbG9hZGVkfSBmaWxlKHMpLCBwdWxsZWQgJHtyZXN0b3JlZEZyb21SZW1vdGUgKyBkb3dubG9hZGVkT3JVcGRhdGVkfSBmaWxlKHMpIGZyb20gcmVtb3RlLCBza2lwcGVkICR7c2tpcHBlZH0gdW5jaGFuZ2VkIGZpbGUocyksIGRlbGV0ZWQgJHtkZWxldGVkUmVtb3RlRmlsZXN9IHJlbW90ZSBjb250ZW50IGZpbGUocykgYW5kICR7ZGVsZXRlZExvY2FsRmlsZXN9IGxvY2FsIGZpbGUocykke2RlbGV0ZWRMb2NhbFN0dWJzID4gMCA/IGAgKGluY2x1ZGluZyAke2RlbGV0ZWRMb2NhbFN0dWJzfSBzdGFsZSBzdHViIG5vdGUocykpYCA6IFwiXCJ9LCByZW1vdmVkICR7ZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzfSByZW1vdGUgZGlyZWN0b3Ike2RlbGV0ZWRSZW1vdGVEaXJlY3RvcmllcyA9PT0gMSA/IFwieVwiIDogXCJpZXNcIn0sIGNsZWFuZWQgJHtpbWFnZUNsZWFudXAuZGVsZXRlZEZpbGVzfSBvcnBoYW5lZCByZW1vdGUgaW1hZ2UocykgcGx1cyAke2ltYWdlQ2xlYW51cC5kZWxldGVkRGlyZWN0b3JpZXN9IGRpcmVjdG9yJHtpbWFnZUNsZWFudXAuZGVsZXRlZERpcmVjdG9yaWVzID09PSAxID8gXCJ5XCIgOiBcImllc1wifSR7ZXZpY3RlZE5vdGVzID4gMCA/IGAsIGFuZCBldmljdGVkICR7ZXZpY3RlZE5vdGVzfSBzdGFsZSBsb2NhbCBub3RlKHMpYCA6IFwiXCJ9JHttaXNzaW5nUmVtb3RlQmFja2VkTm90ZXMgPiAwID8gYCwgd2hpbGUgZGV0ZWN0aW5nICR7bWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzfSBsYXp5IG5vdGUocykgbWlzc2luZyB0aGVpciByZW1vdGUgY29udGVudGAgOiBcIlwifSR7cHVyZ2VkTWlzc2luZ0xhenlOb3RlcyA+IDAgPyBgLCBhbmQgcHVyZ2VkICR7cHVyZ2VkTWlzc2luZ0xhenlOb3Rlc30gY29uZmlybWVkIGJyb2tlbiBsYXp5IHBsYWNlaG9sZGVyKHMpYCA6IFwiXCJ9LmAsXG4gICAgICApO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzLCA4MDAwKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIlZhdWx0IGNvbnRlbnQgc3luYyBmYWlsZWRcIiwgZXJyb3IpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1NTE4NVx1NUJCOVx1NTQwQ1x1NkI2NVx1NTkzMVx1OEQyNVwiLCBcIkNvbnRlbnQgc3luYyBmYWlsZWRcIiksIGVycm9yKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cywgODAwMCk7XG4gICAgICB9XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMuc3luY0luUHJvZ3Jlc3MgPSBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSA0MDQgJiYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYERFTEVURSBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZGVsZXRlIHJlbW90ZSBzeW5jZWQgY29udGVudFwiLCByZW1vdGVQYXRoLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkUmVtb3RlU3luY1NpZ25hdHVyZShyZW1vdGU6IFBpY2s8UmVtb3RlRmlsZVN0YXRlLCBcImxhc3RNb2RpZmllZFwiIHwgXCJzaXplXCI+KSB7XG4gICAgcmV0dXJuIGAke3JlbW90ZS5sYXN0TW9kaWZpZWR9OiR7cmVtb3RlLnNpemV9YDtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGREZWxldGlvbkZvbGRlcigpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpLnJlcGxhY2UoL1xcLyQvLCBcIlwiKX0ke3RoaXMuZGVsZXRpb25Gb2xkZXJTdWZmaXh9YDtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGREZWxldGlvblJlbW90ZVBhdGgodmF1bHRQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBlbmNvZGVkID0gdGhpcy5hcnJheUJ1ZmZlclRvQmFzZTY0KHRoaXMuZW5jb2RlVXRmOCh2YXVsdFBhdGgpKVxuICAgICAgLnJlcGxhY2UoL1xcKy9nLCBcIi1cIilcbiAgICAgIC5yZXBsYWNlKC9cXC8vZywgXCJfXCIpXG4gICAgICAucmVwbGFjZSgvPSskL2csIFwiXCIpO1xuICAgIHJldHVybiBgJHt0aGlzLmJ1aWxkRGVsZXRpb25Gb2xkZXIoKX0ke2VuY29kZWR9Lmpzb25gO1xuICB9XG5cbiAgcHJpdmF0ZSBwYXJzZURlbGV0aW9uVG9tYnN0b25lQmFzZTY0KHZhbHVlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gdmFsdWUucmVwbGFjZSgvLS9nLCBcIitcIikucmVwbGFjZSgvXy9nLCBcIi9cIik7XG4gICAgY29uc3QgcGFkZGVkID0gbm9ybWFsaXplZCArIFwiPVwiLnJlcGVhdCgoNCAtIChub3JtYWxpemVkLmxlbmd0aCAlIDQgfHwgNCkpICUgNCk7XG4gICAgcmV0dXJuIHRoaXMuZGVjb2RlVXRmOCh0aGlzLmJhc2U2NFRvQXJyYXlCdWZmZXIocGFkZGVkKSk7XG4gIH1cblxuICBwcml2YXRlIHJlbW90ZURlbGV0aW9uUGF0aFRvVmF1bHRQYXRoKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHJvb3QgPSB0aGlzLmJ1aWxkRGVsZXRpb25Gb2xkZXIoKTtcbiAgICBpZiAoIXJlbW90ZVBhdGguc3RhcnRzV2l0aChyb290KSB8fCAhcmVtb3RlUGF0aC5lbmRzV2l0aChcIi5qc29uXCIpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBlbmNvZGVkID0gcmVtb3RlUGF0aC5zbGljZShyb290Lmxlbmd0aCwgLVwiLmpzb25cIi5sZW5ndGgpO1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gdGhpcy5wYXJzZURlbGV0aW9uVG9tYnN0b25lQmFzZTY0KGVuY29kZWQpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB3cml0ZURlbGV0aW9uVG9tYnN0b25lKHZhdWx0UGF0aDogc3RyaW5nLCByZW1vdGVTaWduYXR1cmU/OiBzdHJpbmcpIHtcbiAgICBjb25zdCBwYXlsb2FkOiBEZWxldGlvblRvbWJzdG9uZSA9IHtcbiAgICAgIHBhdGg6IHZhdWx0UGF0aCxcbiAgICAgIGRlbGV0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICAgIHJlbW90ZVNpZ25hdHVyZSxcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KFxuICAgICAgdGhpcy5idWlsZERlbGV0aW9uUmVtb3RlUGF0aCh2YXVsdFBhdGgpLFxuICAgICAgdGhpcy5lbmNvZGVVdGY4KEpTT04uc3RyaW5naWZ5KHBheWxvYWQpKSxcbiAgICAgIFwiYXBwbGljYXRpb24vanNvbjsgY2hhcnNldD11dGYtOFwiLFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlQ29udGVudEZpbGUodGhpcy5idWlsZERlbGV0aW9uUmVtb3RlUGF0aCh2YXVsdFBhdGgpKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIFRvbWJzdG9uZSBjbGVhbnVwIHNob3VsZCBub3QgYnJlYWsgdGhlIG1haW4gc3luYyBmbG93LlxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVhZERlbGV0aW9uVG9tYnN0b25lKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHRoaXMuYnVpbGREZWxldGlvblJlbW90ZVBhdGgodmF1bHRQYXRoKSksXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gNDA0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgR0VUIHRvbWJzdG9uZSBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMucGFyc2VEZWxldGlvblRvbWJzdG9uZVBheWxvYWQodGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKSk7XG4gIH1cblxuICBwcml2YXRlIHBhcnNlRGVsZXRpb25Ub21ic3RvbmVQYXlsb2FkKHJhdzogc3RyaW5nKTogRGVsZXRpb25Ub21ic3RvbmUgfCBudWxsIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIFBhcnRpYWw8RGVsZXRpb25Ub21ic3RvbmU+O1xuICAgICAgaWYgKCFwYXJzZWQgfHwgdHlwZW9mIHBhcnNlZC5wYXRoICE9PSBcInN0cmluZ1wiIHx8IHR5cGVvZiBwYXJzZWQuZGVsZXRlZEF0ICE9PSBcIm51bWJlclwiKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgaWYgKHBhcnNlZC5yZW1vdGVTaWduYXR1cmUgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgcGFyc2VkLnJlbW90ZVNpZ25hdHVyZSAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHBhdGg6IHBhcnNlZC5wYXRoLFxuICAgICAgICBkZWxldGVkQXQ6IHBhcnNlZC5kZWxldGVkQXQsXG4gICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcGFyc2VkLnJlbW90ZVNpZ25hdHVyZSxcbiAgICAgIH07XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlYWREZWxldGlvblRvbWJzdG9uZXMoKSB7XG4gICAgY29uc3QgdG9tYnN0b25lcyA9IG5ldyBNYXA8c3RyaW5nLCBEZWxldGlvblRvbWJzdG9uZT4oKTtcbiAgICBjb25zdCBpbnZlbnRvcnkgPSBhd2FpdCB0aGlzLmxpc3RSZW1vdGVUcmVlKHRoaXMuYnVpbGREZWxldGlvbkZvbGRlcigpKTtcbiAgICBmb3IgKGNvbnN0IHJlbW90ZSBvZiBpbnZlbnRvcnkuZmlsZXMudmFsdWVzKCkpIHtcbiAgICAgIGNvbnN0IHZhdWx0UGF0aCA9IHRoaXMucmVtb3RlRGVsZXRpb25QYXRoVG9WYXVsdFBhdGgocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgaWYgKCF2YXVsdFBhdGgpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZS5yZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB0b21ic3RvbmUgPSB0aGlzLnBhcnNlRGVsZXRpb25Ub21ic3RvbmVQYXlsb2FkKHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlcikpO1xuICAgICAgaWYgKHRvbWJzdG9uZSkge1xuICAgICAgICB0b21ic3RvbmVzLnNldCh2YXVsdFBhdGgsIHRvbWJzdG9uZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRvbWJzdG9uZXM7XG4gIH1cblxuICBwcml2YXRlIHJlbW90ZVBhdGhUb1ZhdWx0UGF0aChyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCByb290ID0gdGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpO1xuICAgIGlmICghcmVtb3RlUGF0aC5zdGFydHNXaXRoKHJvb3QpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVtb3RlUGF0aC5zbGljZShyb290Lmxlbmd0aCkucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgc2hvdWxkRG93bmxvYWRSZW1vdGVWZXJzaW9uKGxvY2FsTXRpbWU6IG51bWJlciwgcmVtb3RlTXRpbWU6IG51bWJlcikge1xuICAgIHJldHVybiByZW1vdGVNdGltZSA+IGxvY2FsTXRpbWUgKyAyMDAwO1xuICB9XG5cbiAgcHJpdmF0ZSBpc1RvbWJzdG9uZUF1dGhvcml0YXRpdmUoXG4gICAgdG9tYnN0b25lOiBEZWxldGlvblRvbWJzdG9uZSxcbiAgICByZW1vdGU/OiBQaWNrPFJlbW90ZUZpbGVTdGF0ZSwgXCJsYXN0TW9kaWZpZWRcIiB8IFwic2lnbmF0dXJlXCI+IHwgbnVsbCxcbiAgKSB7XG4gICAgY29uc3QgZ3JhY2VNcyA9IDUwMDA7XG4gICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmICh0b21ic3RvbmUucmVtb3RlU2lnbmF0dXJlKSB7XG4gICAgICByZXR1cm4gcmVtb3RlLnNpZ25hdHVyZSA9PT0gdG9tYnN0b25lLnJlbW90ZVNpZ25hdHVyZTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVtb3RlLmxhc3RNb2RpZmllZCA8PSB0b21ic3RvbmUuZGVsZXRlZEF0ICsgZ3JhY2VNcztcbiAgfVxuXG4gIHByaXZhdGUgc2hvdWxkRGVsZXRlTG9jYWxGcm9tVG9tYnN0b25lKGZpbGU6IFRGaWxlLCB0b21ic3RvbmU6IERlbGV0aW9uVG9tYnN0b25lKSB7XG4gICAgY29uc3QgZ3JhY2VNcyA9IDUwMDA7XG4gICAgcmV0dXJuIGZpbGUuc3RhdC5tdGltZSA8PSB0b21ic3RvbmUuZGVsZXRlZEF0ICsgZ3JhY2VNcztcbiAgfVxuXG4gIHByaXZhdGUgZ2V0VmF1bHRGaWxlQnlQYXRoKHBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgocGF0aCk7XG4gICAgcmV0dXJuIGZpbGUgaW5zdGFuY2VvZiBURmlsZSA/IGZpbGUgOiBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZW1vdmVMb2NhbFZhdWx0RmlsZShmaWxlOiBURmlsZSkge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5kZWxldGUoZmlsZSwgdHJ1ZSk7XG4gICAgfSBjYXRjaCAoZGVsZXRlRXJyb3IpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LnRyYXNoKGZpbGUsIHRydWUpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHRocm93IGRlbGV0ZUVycm9yO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZW5zdXJlTG9jYWxQYXJlbnRGb2xkZXJzKHBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVQYXRoKHBhdGgpO1xuICAgIGNvbnN0IHNlZ21lbnRzID0gbm9ybWFsaXplZC5zcGxpdChcIi9cIikuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUubGVuZ3RoID4gMCk7XG4gICAgaWYgKHNlZ21lbnRzLmxlbmd0aCA8PSAxKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGV0IGN1cnJlbnQgPSBcIlwiO1xuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBzZWdtZW50cy5sZW5ndGggLSAxOyBpbmRleCArPSAxKSB7XG4gICAgICBjdXJyZW50ID0gY3VycmVudCA/IGAke2N1cnJlbnR9LyR7c2VnbWVudHNbaW5kZXhdfWAgOiBzZWdtZW50c1tpbmRleF07XG4gICAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChjdXJyZW50KTtcbiAgICAgIGlmICghZXhpc3RpbmcpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlRm9sZGVyKGN1cnJlbnQpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZG93bmxvYWRSZW1vdGVGaWxlVG9WYXVsdCh2YXVsdFBhdGg6IHN0cmluZywgcmVtb3RlOiBSZW1vdGVGaWxlU3RhdGUsIGV4aXN0aW5nRmlsZT86IFRGaWxlKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZS5yZW1vdGVQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgR0VUIGZhaWxlZCB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLmVuc3VyZUxvY2FsUGFyZW50Rm9sZGVycyh2YXVsdFBhdGgpO1xuICAgIGNvbnN0IGN1cnJlbnQgPSBleGlzdGluZ0ZpbGUgPz8gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgodmF1bHRQYXRoKTtcbiAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgbXRpbWU6IHJlbW90ZS5sYXN0TW9kaWZpZWQgPiAwID8gcmVtb3RlLmxhc3RNb2RpZmllZCA6IERhdGUubm93KCksXG4gICAgfTtcbiAgICBpZiAoIWN1cnJlbnQpIHtcbiAgICAgIGlmICh2YXVsdFBhdGgudG9Mb3dlckNhc2UoKS5lbmRzV2l0aChcIi5tZFwiKSkge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGUodmF1bHRQYXRoLCB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpLCBvcHRpb25zKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZUJpbmFyeSh2YXVsdFBhdGgsIHJlc3BvbnNlLmFycmF5QnVmZmVyLCBvcHRpb25zKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoY3VycmVudC5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGN1cnJlbnQsIHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlciksIG9wdGlvbnMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnlCaW5hcnkoY3VycmVudCwgcmVzcG9uc2UuYXJyYXlCdWZmZXIsIG9wdGlvbnMpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdmVyaWZ5UmVtb3RlQmluYXJ5Um91bmRUcmlwKHJlbW90ZVBhdGg6IHN0cmluZywgZXhwZWN0ZWQ6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmFycmF5QnVmZmVyc0VxdWFsKGV4cGVjdGVkLCByZXNwb25zZS5hcnJheUJ1ZmZlcik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHN0YXRSZW1vdGVGaWxlKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJQUk9QRklORFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICBEZXB0aDogXCIwXCIsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gNDA0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgUFJPUEZJTkQgZmFpbGVkIGZvciAke3JlbW90ZVBhdGh9IHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIH1cblxuICAgIGNvbnN0IHhtbFRleHQgPSB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpO1xuICAgIGNvbnN0IGVudHJpZXMgPSB0aGlzLnBhcnNlUHJvcGZpbmREaXJlY3RvcnlMaXN0aW5nKHhtbFRleHQsIHJlbW90ZVBhdGgsIHRydWUpO1xuICAgIHJldHVybiBlbnRyaWVzLmZpbmQoKGVudHJ5KSA9PiAhZW50cnkuaXNDb2xsZWN0aW9uKT8uZmlsZSA/PyBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRDb250ZW50RmlsZVRvUmVtb3RlKGZpbGU6IFRGaWxlLCByZW1vdGVQYXRoOiBzdHJpbmcsIG1hcmtkb3duQ29udGVudD86IHN0cmluZykge1xuICAgIGxldCBiaW5hcnk6IEFycmF5QnVmZmVyO1xuXG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBtYXJrZG93bkNvbnRlbnQgPz8gKGF3YWl0IHRoaXMucmVhZE1hcmtkb3duQ29udGVudFByZWZlckVkaXRvcihmaWxlKSk7XG4gICAgICBpZiAodGhpcy5wYXJzZU5vdGVTdHViKGNvbnRlbnQpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICB0aGlzLnQoXG4gICAgICAgICAgICBcIlx1NjJEMlx1N0VERFx1NjI4QVx1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMFx1NEUwQVx1NEYyMFx1NEUzQVx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1MzAwMlwiLFxuICAgICAgICAgICAgXCJSZWZ1c2luZyB0byB1cGxvYWQgYSBsYXp5LW5vdGUgcGxhY2Vob2xkZXIgYXMgcmVtb3RlIG5vdGUgY29udGVudC5cIixcbiAgICAgICAgICApLFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBiaW5hcnkgPSB0aGlzLmVuY29kZVV0ZjgoY29udGVudCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJpbmFyeSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWRCaW5hcnkoZmlsZSk7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy51cGxvYWRCaW5hcnkocmVtb3RlUGF0aCwgYmluYXJ5LCB0aGlzLmdldE1pbWVUeXBlKGZpbGUuZXh0ZW5zaW9uKSk7XG4gICAgY29uc3QgcmVtb3RlID0gYXdhaXQgdGhpcy5zdGF0UmVtb3RlRmlsZShyZW1vdGVQYXRoKTtcbiAgICBpZiAocmVtb3RlKSB7XG4gICAgICByZXR1cm4gcmVtb3RlO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICByZW1vdGVQYXRoLFxuICAgICAgbGFzdE1vZGlmaWVkOiBmaWxlLnN0YXQubXRpbWUsXG4gICAgICBzaXplOiBmaWxlLnN0YXQuc2l6ZSxcbiAgICAgIHNpZ25hdHVyZTogdGhpcy5idWlsZFN5bmNTaWduYXR1cmUoZmlsZSksXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZGVsZXRlUmVtb3RlU3luY2VkRW50cnkodmF1bHRQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuc3luY0luZGV4LmdldCh2YXVsdFBhdGgpO1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSBleGlzdGluZz8ucmVtb3RlUGF0aCA/PyB0aGlzLmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aCh2YXVsdFBhdGgpO1xuICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlQ29udGVudEZpbGUocmVtb3RlUGF0aCk7XG4gICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKHZhdWx0UGF0aCk7XG4gICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlRmlsZU9wZW4oZmlsZTogVEZpbGUgfCBudWxsKSB7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB8fCBmaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5ub3RlQWNjZXNzVGltZXN0YW1wcy5zZXQoZmlsZS5wYXRoLCBEYXRlLm5vdygpKTtcbiAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuXG4gICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgY29uc3Qgc3R1YiA9IHRoaXMucGFyc2VOb3RlU3R1Yihjb250ZW50KTtcbiAgICBpZiAoIXN0dWIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVtb3RlID0gYXdhaXQgdGhpcy5zdGF0UmVtb3RlRmlsZShzdHViLnJlbW90ZVBhdGgpO1xuICAgICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgICAgY29uc3QgdG9tYnN0b25lID0gYXdhaXQgdGhpcy5yZWFkRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgaWYgKHRvbWJzdG9uZSkge1xuICAgICAgICAgIGF3YWl0IHRoaXMucmVtb3ZlTG9jYWxWYXVsdEZpbGUoZmlsZSk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICAgICAgdGhpcy5jbGVhck1pc3NpbmdMYXp5UmVtb3RlKGZpbGUucGF0aCk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgICAgICBuZXcgTm90aWNlKFxuICAgICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgICBgXHU4RkRDXHU3QUVGXHU2QjYzXHU2NTg3XHU0RTBEXHU1QjU4XHU1NzI4XHVGRjBDXHU1REYyXHU3OUZCXHU5NjY0XHU2NzJDXHU1NzMwXHU1MzYwXHU0RjREXHU3QjE0XHU4QkIwXHVGRjFBJHtmaWxlLmJhc2VuYW1lfWAsXG4gICAgICAgICAgICAgIGBSZW1vdGUgbm90ZSBtaXNzaW5nLCByZW1vdmVkIGxvY2FsIHBsYWNlaG9sZGVyOiAke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICA2MDAwLFxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbWlzc2luZ1JlY29yZCA9IHRoaXMubWFya01pc3NpbmdMYXp5UmVtb3RlKGZpbGUucGF0aCk7XG4gICAgICAgIGlmIChtaXNzaW5nUmVjb3JkLm1pc3NDb3VudCA+PSB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlQ29uZmlybWF0aW9ucykge1xuICAgICAgICAgIGF3YWl0IHRoaXMucmVtb3ZlTG9jYWxWYXVsdEZpbGUoZmlsZSk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICAgICAgdGhpcy5jbGVhck1pc3NpbmdMYXp5UmVtb3RlKGZpbGUucGF0aCk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgICAgICBuZXcgTm90aWNlKFxuICAgICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgICBgXHU4RkRDXHU3QUVGXHU2QjYzXHU2NTg3XHU4RkRFXHU3RUVEXHU3RjNBXHU1OTMxXHVGRjBDXHU1REYyXHU3OUZCXHU5NjY0XHU2NzJDXHU1NzMwXHU1OTMxXHU2NTQ4XHU1MzYwXHU0RjREXHU3QjE0XHU4QkIwXHVGRjFBJHtmaWxlLmJhc2VuYW1lfWAsXG4gICAgICAgICAgICAgIGBSZW1vdGUgbm90ZSB3YXMgbWlzc2luZyByZXBlYXRlZGx5LCByZW1vdmVkIGxvY2FsIGJyb2tlbiBwbGFjZWhvbGRlcjogJHtmaWxlLmJhc2VuYW1lfWAsXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgODAwMCxcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU4RkRDXHU3QUVGXHU2QjYzXHU2NTg3XHU0RTBEXHU1QjU4XHU1NzI4XHVGRjBDXHU1RjUzXHU1MjREXHU1MTQ4XHU0RkREXHU3NTU5XHU2NzJDXHU1NzMwXHU1MzYwXHU0RjREXHU3QjE0XHU4QkIwXHU0RUU1XHU5NjMyXHU0RTM0XHU2NUY2XHU1RjAyXHU1RTM4XHVGRjFCXHU4MkU1XHU1MThEXHU2QjIxXHU3ODZFXHU4QkE0XHU3RjNBXHU1OTMxXHVGRjBDXHU1QzA2XHU4MUVBXHU1MkE4XHU2RTA1XHU3NDA2XHU4QkU1XHU1MzYwXHU0RjREXHUzMDAyXCIsIFwiUmVtb3RlIG5vdGUgaXMgbWlzc2luZy4gVGhlIGxvY2FsIHBsYWNlaG9sZGVyIHdhcyBrZXB0IGZvciBub3cgaW4gY2FzZSB0aGlzIGlzIHRyYW5zaWVudDsgaXQgd2lsbCBiZSBjbGVhbmVkIGF1dG9tYXRpY2FsbHkgaWYgdGhlIHJlbW90ZSBpcyBzdGlsbCBtaXNzaW5nIG9uIHRoZSBuZXh0IGNvbmZpcm1hdGlvbi5cIiksIDgwMDApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHRoaXMuY2xlYXJNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KGZpbGUucGF0aCwgcmVtb3RlLCBmaWxlKTtcbiAgICAgIGNvbnN0IHJlZnJlc2hlZCA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKGZpbGUucGF0aCk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZWZyZXNoZWQgPyB0aGlzLmJ1aWxkU3luY1NpZ25hdHVyZShyZWZyZXNoZWQpIDogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICByZW1vdGVQYXRoOiBzdHViLnJlbW90ZVBhdGgsXG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICBuZXcgTm90aWNlKHRoaXMudChgXHU1REYyXHU0RUNFXHU4RkRDXHU3QUVGXHU2MDYyXHU1OTBEXHU3QjE0XHU4QkIwXHVGRjFBJHtmaWxlLmJhc2VuYW1lfWAsIGBSZXN0b3JlZCBub3RlIGZyb20gcmVtb3RlOiAke2ZpbGUuYmFzZW5hbWV9YCksIDYwMDApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGh5ZHJhdGUgbm90ZSBmcm9tIHJlbW90ZVwiLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdThGRENcdTdBRUZcdTYwNjJcdTU5MERcdTdCMTRcdThCQjBcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gcmVzdG9yZSBub3RlIGZyb20gcmVtb3RlXCIpLCBlcnJvciksIDgwMDApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IG5vcm1hbGl6ZVBhdGgocGF0aCk7XG4gICAgaWYgKG5vcm1hbGl6ZWRQYXRoID09PSBcIi5vYnNpZGlhblwiIHx8IG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIub2JzaWRpYW4vXCIpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICBub3JtYWxpemVkUGF0aCA9PT0gXCIub2JzaWRpYW4vcGx1Z2lucy9zZWN1cmUtd2ViZGF2LWltYWdlc1wiIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwiLm9ic2lkaWFuL3BsdWdpbnMvc2VjdXJlLXdlYmRhdi1pbWFnZXMvXCIpXG4gICAgKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gL1xcLihwbmd8anBlP2d8Z2lmfHdlYnB8Ym1wfHN2ZykkL2kudGVzdChub3JtYWxpemVkUGF0aCk7XG4gIH1cblxuICBwcml2YXRlIGNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpIHtcbiAgICByZXR1cm4gdGhpcy5hcHAudmF1bHRcbiAgICAgIC5nZXRGaWxlcygpXG4gICAgICAuZmlsdGVyKChmaWxlKSA9PiAhdGhpcy5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKGZpbGUucGF0aCkpXG4gICAgICAuc29ydCgoYSwgYikgPT4gYS5wYXRoLmxvY2FsZUNvbXBhcmUoYi5wYXRoKSk7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkU3luY1NpZ25hdHVyZShmaWxlOiBURmlsZSkge1xuICAgIHJldHVybiBgJHtmaWxlLnN0YXQubXRpbWV9OiR7ZmlsZS5zdGF0LnNpemV9YDtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0T3Blbk1hcmtkb3duQ29udGVudChub3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgbGVhdmVzID0gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYXZlc09mVHlwZShcIm1hcmtkb3duXCIpO1xuICAgIGZvciAoY29uc3QgbGVhZiBvZiBsZWF2ZXMpIHtcbiAgICAgIGNvbnN0IHZpZXcgPSBsZWFmLnZpZXc7XG4gICAgICBpZiAoISh2aWV3IGluc3RhbmNlb2YgTWFya2Rvd25WaWV3KSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCF2aWV3LmZpbGUgfHwgdmlldy5maWxlLnBhdGggIT09IG5vdGVQYXRoKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdmlldy5lZGl0b3IuZ2V0VmFsdWUoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVhZE1hcmtkb3duQ29udGVudFByZWZlckVkaXRvcihmaWxlOiBURmlsZSkge1xuICAgIGNvbnN0IGxpdmVDb250ZW50ID0gdGhpcy5nZXRPcGVuTWFya2Rvd25Db250ZW50KGZpbGUucGF0aCk7XG4gICAgaWYgKGxpdmVDb250ZW50ICE9PSBudWxsKSB7XG4gICAgICByZXR1cm4gbGl2ZUNvbnRlbnQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGJ1aWxkQ3VycmVudExvY2FsU2lnbmF0dXJlKGZpbGU6IFRGaWxlLCBtYXJrZG93bkNvbnRlbnQ/OiBzdHJpbmcpIHtcbiAgICBpZiAoZmlsZS5leHRlbnNpb24gIT09IFwibWRcIikge1xuICAgICAgcmV0dXJuIHRoaXMuYnVpbGRTeW5jU2lnbmF0dXJlKGZpbGUpO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnRlbnQgPSBtYXJrZG93bkNvbnRlbnQgPz8gKGF3YWl0IHRoaXMucmVhZE1hcmtkb3duQ29udGVudFByZWZlckVkaXRvcihmaWxlKSk7XG4gICAgY29uc3QgZGlnZXN0ID0gKGF3YWl0IHRoaXMuY29tcHV0ZVNoYTI1NkhleCh0aGlzLmVuY29kZVV0ZjgoY29udGVudCkpKS5zbGljZSgwLCAxNik7XG4gICAgcmV0dXJuIGBtZDoke2NvbnRlbnQubGVuZ3RofToke2RpZ2VzdH1gO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZFZhdWx0U3luY1JlbW90ZVBhdGgodmF1bHRQYXRoOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpfSR7dmF1bHRQYXRofWA7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlY29uY2lsZVJlbW90ZUltYWdlcygpIHtcbiAgICByZXR1cm4geyBkZWxldGVkRmlsZXM6IDAsIGRlbGV0ZWREaXJlY3RvcmllczogMCB9O1xuICB9XG5cbiAgcHJpdmF0ZSBtYXJrTWlzc2luZ0xhenlSZW1vdGUocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCBwcmV2aW91cyA9IHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3Rlcy5nZXQocGF0aCk7XG4gICAgY29uc3QgbmV4dDogTWlzc2luZ0xhenlSZW1vdGVSZWNvcmQgPSBwcmV2aW91c1xuICAgICAgPyB7XG4gICAgICAgICAgZmlyc3REZXRlY3RlZEF0OiBwcmV2aW91cy5maXJzdERldGVjdGVkQXQsXG4gICAgICAgICAgbGFzdERldGVjdGVkQXQ6IG5vdyxcbiAgICAgICAgICBtaXNzQ291bnQ6IHByZXZpb3VzLm1pc3NDb3VudCArIDEsXG4gICAgICAgIH1cbiAgICAgIDoge1xuICAgICAgICAgIGZpcnN0RGV0ZWN0ZWRBdDogbm93LFxuICAgICAgICAgIGxhc3REZXRlY3RlZEF0OiBub3csXG4gICAgICAgICAgbWlzc0NvdW50OiAxLFxuICAgICAgICB9O1xuICAgIHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3Rlcy5zZXQocGF0aCwgbmV4dCk7XG4gICAgcmV0dXJuIG5leHQ7XG4gIH1cblxuICBwcml2YXRlIGNsZWFyTWlzc2luZ0xhenlSZW1vdGUocGF0aDogc3RyaW5nKSB7XG4gICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzLmRlbGV0ZShwYXRoKTtcbiAgfVxuXG4gIHByaXZhdGUgcGFyc2VOb3RlU3R1Yihjb250ZW50OiBzdHJpbmcpIHtcbiAgICBjb25zdCBtYXRjaCA9IGNvbnRlbnQubWF0Y2goXG4gICAgICAvXjwhLS1cXHMqc2VjdXJlLXdlYmRhdi1ub3RlLXN0dWJcXHMqXFxyP1xcbnJlbW90ZTpcXHMqKC4rPylcXHI/XFxucGxhY2Vob2xkZXI6XFxzKiguKj8pXFxyP1xcbi0tPi9zLFxuICAgICk7XG4gICAgaWYgKCFtYXRjaCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJlbW90ZVBhdGg6IG1hdGNoWzFdLnRyaW0oKSxcbiAgICAgIHBsYWNlaG9sZGVyOiBtYXRjaFsyXS50cmltKCksXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGROb3RlU3R1YihmaWxlOiBURmlsZSkge1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aChmaWxlLnBhdGgpO1xuICAgIHJldHVybiBbXG4gICAgICBgPCEtLSAke1NFQ1VSRV9OT1RFX1NUVUJ9YCxcbiAgICAgIGByZW1vdGU6ICR7cmVtb3RlUGF0aH1gLFxuICAgICAgYHBsYWNlaG9sZGVyOiAke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgIFwiLS0+XCIsXG4gICAgICBcIlwiLFxuICAgICAgdGhpcy50KFxuICAgICAgICBgXHU4RkQ5XHU2NjJGXHU0RTAwXHU3QkM3XHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXHU3Njg0XHU2NzJDXHU1NzMwXHU1MzYwXHU0RjREXHU2NTg3XHU0RUY2XHUzMDAyXHU2MjUzXHU1RjAwXHU4RkQ5XHU3QkM3XHU3QjE0XHU4QkIwXHU2NUY2XHVGRjBDXHU2M0QyXHU0RUY2XHU0RjFBXHU0RUNFXHU4RkRDXHU3QUVGXHU1NDBDXHU2QjY1XHU3NkVFXHU1RjU1XHU2MDYyXHU1OTBEXHU1QjhDXHU2NTc0XHU1MTg1XHU1QkI5XHUzMDAyYCxcbiAgICAgICAgYFRoaXMgaXMgYSBsb2NhbCBwbGFjZWhvbGRlciBmb3IgYW4gb24tZGVtYW5kIG5vdGUuIE9wZW5pbmcgdGhlIG5vdGUgcmVzdG9yZXMgdGhlIGZ1bGwgY29udGVudCBmcm9tIHRoZSByZW1vdGUgc3luYyBmb2xkZXIuYCxcbiAgICAgICksXG4gICAgXS5qb2luKFwiXFxuXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBldmljdFN0YWxlU3luY2VkTm90ZXMoc2hvd05vdGljZTogYm9vbGVhbikge1xuICAgIHRyeSB7XG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5ub3RlU3RvcmFnZU1vZGUgIT09IFwibGF6eS1ub3Rlc1wiKSB7XG4gICAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdTVGNTNcdTUyNERcdTY3MkFcdTU0MkZcdTc1MjhcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTdCMTRcdThCQjBcdTZBMjFcdTVGMEZcdTMwMDJcIiwgXCJMYXp5IG5vdGUgbW9kZSBpcyBub3QgZW5hYmxlZC5cIiksIDYwMDApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBmaWxlcyA9IHRoaXMuY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCkuZmlsdGVyKChmaWxlKSA9PiBmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKTtcbiAgICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gICAgICBjb25zdCB0aHJlc2hvbGQgPSBNYXRoLm1heCgxLCB0aGlzLnNldHRpbmdzLm5vdGVFdmljdEFmdGVyRGF5cykgKiAyNCAqIDYwICogNjAgKiAxMDAwO1xuICAgICAgbGV0IGV2aWN0ZWQgPSAwO1xuXG4gICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgY29uc3QgYWN0aXZlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICAgICAgaWYgKGFjdGl2ZT8ucGF0aCA9PT0gZmlsZS5wYXRoKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBsYXN0QWNjZXNzID0gdGhpcy5ub3RlQWNjZXNzVGltZXN0YW1wcy5nZXQoZmlsZS5wYXRoKSA/PyAwO1xuICAgICAgICBpZiAobGFzdEFjY2VzcyAhPT0gMCAmJiBub3cgLSBsYXN0QWNjZXNzIDwgdGhyZXNob2xkKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgICAgaWYgKHRoaXMucGFyc2VOb3RlU3R1Yihjb250ZW50KSkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYmluYXJ5ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZEJpbmFyeShmaWxlKTtcbiAgICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KHJlbW90ZVBhdGgsIGJpbmFyeSwgXCJ0ZXh0L21hcmtkb3duOyBjaGFyc2V0PXV0Zi04XCIpO1xuICAgICAgICBjb25zdCB2ZXJpZmllZCA9IGF3YWl0IHRoaXMudmVyaWZ5UmVtb3RlQmluYXJ5Um91bmRUcmlwKHJlbW90ZVBhdGgsIGJpbmFyeSk7XG4gICAgICAgIGlmICghdmVyaWZpZWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiXHU4RkRDXHU3QUVGXHU2QjYzXHU2NTg3XHU2ODIxXHU5QThDXHU1OTMxXHU4RDI1XHVGRjBDXHU1REYyXHU1M0Q2XHU2RDg4XHU1NkRFXHU2NTM2XHU2NzJDXHU1NzMwXHU3QjE0XHU4QkIwXHUzMDAyXCIsIFwiUmVtb3RlIG5vdGUgdmVyaWZpY2F0aW9uIGZhaWxlZCwgbG9jYWwgbm90ZSBldmljdGlvbiB3YXMgY2FuY2VsbGVkLlwiKSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVtb3RlID0gYXdhaXQgdGhpcy5zdGF0UmVtb3RlRmlsZShyZW1vdGVQYXRoKTtcbiAgICAgICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiXHU4RkRDXHU3QUVGXHU2QjYzXHU2NTg3XHU1MTQzXHU2NTcwXHU2MzZFXHU3RjNBXHU1OTMxXHVGRjBDXHU1REYyXHU1M0Q2XHU2RDg4XHU1NkRFXHU2NTM2XHU2NzJDXHU1NzMwXHU3QjE0XHU4QkIwXHUzMDAyXCIsIFwiUmVtb3RlIG5vdGUgbWV0YWRhdGEgaXMgbWlzc2luZywgbG9jYWwgbm90ZSBldmljdGlvbiB3YXMgY2FuY2VsbGVkLlwiKSk7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIHRoaXMuYnVpbGROb3RlU3R1YihmaWxlKSk7XG4gICAgICAgIGNvbnN0IHJlZnJlc2hlZCA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVmcmVzaGVkID8gdGhpcy5idWlsZFN5bmNTaWduYXR1cmUocmVmcmVzaGVkKSA6IHRoaXMuYnVpbGRTeW5jU2lnbmF0dXJlKGZpbGUpLFxuICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcmVtb3RlPy5zaWduYXR1cmUgPz8gYCR7ZmlsZS5zdGF0Lm10aW1lfToke2JpbmFyeS5ieXRlTGVuZ3RofWAsXG4gICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIGV2aWN0ZWQgKz0gMTtcbiAgICAgIH1cblxuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgICB0aGlzLnQoXG4gICAgICAgICAgICBgXHU1REYyXHU1NkRFXHU2NTM2ICR7ZXZpY3RlZH0gXHU3QkM3XHU5NTdGXHU2NzFGXHU2NzJBXHU4QkJGXHU5NUVFXHU3Njg0XHU2NzJDXHU1NzMwXHU3QjE0XHU4QkIwXHUzMDAyYCxcbiAgICAgICAgICAgIGBFdmljdGVkICR7ZXZpY3RlZH0gc3RhbGUgbG9jYWwgbm90ZShzKS5gLFxuICAgICAgICAgICksXG4gICAgICAgICAgODAwMCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICByZXR1cm4gZXZpY3RlZDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBldmljdCBzdGFsZSBzeW5jZWQgbm90ZXNcIiwgZXJyb3IpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU1NkRFXHU2NTM2XHU2NzJDXHU1NzMwXHU3QjE0XHU4QkIwXHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIGV2aWN0IGxvY2FsIG5vdGVzXCIpLCBlcnJvciksIDgwMDApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBlbnN1cmVSZW1vdGVEaXJlY3RvcmllcyhyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBwYXJ0cyA9IHJlbW90ZVBhdGguc3BsaXQoXCIvXCIpLmZpbHRlcigodmFsdWUpID0+IHZhbHVlLmxlbmd0aCA+IDApO1xuICAgIGlmIChwYXJ0cy5sZW5ndGggPD0gMSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBjdXJyZW50ID0gXCJcIjtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgcGFydHMubGVuZ3RoIC0gMTsgaW5kZXggKz0gMSkge1xuICAgICAgY3VycmVudCA9IGN1cnJlbnQgPyBgJHtjdXJyZW50fS8ke3BhcnRzW2luZGV4XX1gIDogcGFydHNbaW5kZXhdO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwoY3VycmVudCksXG4gICAgICAgIG1ldGhvZDogXCJNS0NPTFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAoIVsyMDAsIDIwMSwgMjA0LCAyMDcsIDMwMSwgMzAyLCAzMDcsIDMwOCwgNDA1XS5pbmNsdWRlcyhyZXNwb25zZS5zdGF0dXMpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTUtDT0wgZmFpbGVkIGZvciAke2N1cnJlbnR9IHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgbGlzdFJlbW90ZVRyZWUocm9vdEZvbGRlcjogc3RyaW5nKTogUHJvbWlzZTxSZW1vdGVJbnZlbnRvcnk+IHtcbiAgICBjb25zdCBmaWxlcyA9IG5ldyBNYXA8c3RyaW5nLCBSZW1vdGVGaWxlU3RhdGU+KCk7XG4gICAgY29uc3QgZGlyZWN0b3JpZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBjb25zdCBwZW5kaW5nID0gW3RoaXMubm9ybWFsaXplRm9sZGVyKHJvb3RGb2xkZXIpXTtcbiAgICBjb25zdCB2aXNpdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbiAgICB3aGlsZSAocGVuZGluZy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBjdXJyZW50ID0gdGhpcy5ub3JtYWxpemVGb2xkZXIocGVuZGluZy5wb3AoKSA/PyByb290Rm9sZGVyKTtcbiAgICAgIGlmICh2aXNpdGVkLmhhcyhjdXJyZW50KSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgdmlzaXRlZC5hZGQoY3VycmVudCk7XG4gICAgICBjb25zdCBlbnRyaWVzID0gYXdhaXQgdGhpcy5saXN0UmVtb3RlRGlyZWN0b3J5KGN1cnJlbnQpO1xuICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG4gICAgICAgIGlmIChlbnRyeS5pc0NvbGxlY3Rpb24pIHtcbiAgICAgICAgICBkaXJlY3Rvcmllcy5hZGQoZW50cnkucmVtb3RlUGF0aCk7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKGVudHJ5LnJlbW90ZVBhdGgpO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGVudHJ5LmZpbGUpIHtcbiAgICAgICAgICBmaWxlcy5zZXQoZW50cnkucmVtb3RlUGF0aCwgZW50cnkuZmlsZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4geyBmaWxlcywgZGlyZWN0b3JpZXMgfTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgbGlzdFJlbW90ZURpcmVjdG9yeShyZW1vdGVEaXJlY3Rvcnk6IHN0cmluZykge1xuICAgIGNvbnN0IHJlcXVlc3RlZFBhdGggPSB0aGlzLm5vcm1hbGl6ZUZvbGRlcihyZW1vdGVEaXJlY3RvcnkpO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZXF1ZXN0ZWRQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJQUk9QRklORFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICBEZXB0aDogXCIxXCIsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gNDA0KSB7XG4gICAgICByZXR1cm4gW10gYXMgQXJyYXk8eyByZW1vdGVQYXRoOiBzdHJpbmc7IGlzQ29sbGVjdGlvbjogYm9vbGVhbjsgZmlsZT86IFJlbW90ZUZpbGVTdGF0ZSB9PjtcbiAgICB9XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgUFJPUEZJTkQgZmFpbGVkIGZvciAke3JlcXVlc3RlZFBhdGh9IHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIH1cblxuICAgIGNvbnN0IHhtbFRleHQgPSB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpO1xuICAgIHJldHVybiB0aGlzLnBhcnNlUHJvcGZpbmREaXJlY3RvcnlMaXN0aW5nKHhtbFRleHQsIHJlcXVlc3RlZFBhdGgpO1xuICB9XG5cbiAgcHJpdmF0ZSBwYXJzZVByb3BmaW5kRGlyZWN0b3J5TGlzdGluZyh4bWxUZXh0OiBzdHJpbmcsIHJlcXVlc3RlZFBhdGg6IHN0cmluZywgaW5jbHVkZVJlcXVlc3RlZCA9IGZhbHNlKSB7XG4gICAgY29uc3QgcGFyc2VyID0gbmV3IERPTVBhcnNlcigpO1xuICAgIGNvbnN0IGRvY3VtZW50ID0gcGFyc2VyLnBhcnNlRnJvbVN0cmluZyh4bWxUZXh0LCBcImFwcGxpY2F0aW9uL3htbFwiKTtcbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJwYXJzZXJlcnJvclwiKS5sZW5ndGggPiAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiXHU2NUUwXHU2Q0Q1XHU4OUUzXHU2NzkwIFdlYkRBViBcdTc2RUVcdTVGNTVcdTZFMDVcdTUzNTVcdTMwMDJcIiwgXCJGYWlsZWQgdG8gcGFyc2UgdGhlIFdlYkRBViBkaXJlY3RvcnkgbGlzdGluZy5cIikpO1xuICAgIH1cblxuICAgIGNvbnN0IGVudHJpZXMgPSBuZXcgTWFwPHN0cmluZywgeyByZW1vdGVQYXRoOiBzdHJpbmc7IGlzQ29sbGVjdGlvbjogYm9vbGVhbjsgZmlsZT86IFJlbW90ZUZpbGVTdGF0ZSB9PigpO1xuICAgIGZvciAoY29uc3QgZWxlbWVudCBvZiBBcnJheS5mcm9tKGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiKlwiKSkpIHtcbiAgICAgIGlmIChlbGVtZW50LmxvY2FsTmFtZSAhPT0gXCJyZXNwb25zZVwiKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBocmVmID0gdGhpcy5nZXRYbWxMb2NhbE5hbWVUZXh0KGVsZW1lbnQsIFwiaHJlZlwiKTtcbiAgICAgIGlmICghaHJlZikge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuaHJlZlRvUmVtb3RlUGF0aChocmVmKTtcbiAgICAgIGlmICghcmVtb3RlUGF0aCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaXNDb2xsZWN0aW9uID0gdGhpcy54bWxUcmVlSGFzTG9jYWxOYW1lKGVsZW1lbnQsIFwiY29sbGVjdGlvblwiKTtcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gaXNDb2xsZWN0aW9uID8gdGhpcy5ub3JtYWxpemVGb2xkZXIocmVtb3RlUGF0aCkgOiByZW1vdGVQYXRoLnJlcGxhY2UoL1xcLyskLywgXCJcIik7XG4gICAgICBpZiAoXG4gICAgICAgICFpbmNsdWRlUmVxdWVzdGVkICYmXG4gICAgICAgIChcbiAgICAgICAgICBub3JtYWxpemVkUGF0aCA9PT0gcmVxdWVzdGVkUGF0aCB8fFxuICAgICAgICAgIG5vcm1hbGl6ZWRQYXRoID09PSByZXF1ZXN0ZWRQYXRoLnJlcGxhY2UoL1xcLyskLywgXCJcIilcbiAgICAgICAgKVxuICAgICAgKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzaXplVGV4dCA9IHRoaXMuZ2V0WG1sTG9jYWxOYW1lVGV4dChlbGVtZW50LCBcImdldGNvbnRlbnRsZW5ndGhcIik7XG4gICAgICBjb25zdCBwYXJzZWRTaXplID0gTnVtYmVyLnBhcnNlSW50KHNpemVUZXh0LCAxMCk7XG4gICAgICBjb25zdCBzaXplID0gTnVtYmVyLmlzRmluaXRlKHBhcnNlZFNpemUpID8gcGFyc2VkU2l6ZSA6IDA7XG4gICAgICBjb25zdCBtb2RpZmllZFRleHQgPSB0aGlzLmdldFhtbExvY2FsTmFtZVRleHQoZWxlbWVudCwgXCJnZXRsYXN0bW9kaWZpZWRcIik7XG4gICAgICBjb25zdCBwYXJzZWRNdGltZSA9IERhdGUucGFyc2UobW9kaWZpZWRUZXh0KTtcbiAgICAgIGNvbnN0IGxhc3RNb2RpZmllZCA9IE51bWJlci5pc0Zpbml0ZShwYXJzZWRNdGltZSkgPyBwYXJzZWRNdGltZSA6IDA7XG5cbiAgICAgIGVudHJpZXMuc2V0KG5vcm1hbGl6ZWRQYXRoLCB7XG4gICAgICAgIHJlbW90ZVBhdGg6IG5vcm1hbGl6ZWRQYXRoLFxuICAgICAgICBpc0NvbGxlY3Rpb24sXG4gICAgICAgIGZpbGU6IGlzQ29sbGVjdGlvblxuICAgICAgICAgID8gdW5kZWZpbmVkXG4gICAgICAgICAgOiB7XG4gICAgICAgICAgICAgIHJlbW90ZVBhdGg6IG5vcm1hbGl6ZWRQYXRoLFxuICAgICAgICAgICAgICBsYXN0TW9kaWZpZWQsXG4gICAgICAgICAgICAgIHNpemUsXG4gICAgICAgICAgICAgIHNpZ25hdHVyZTogdGhpcy5idWlsZFJlbW90ZVN5bmNTaWduYXR1cmUoe1xuICAgICAgICAgICAgICAgIGxhc3RNb2RpZmllZCxcbiAgICAgICAgICAgICAgICBzaXplLFxuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gWy4uLmVudHJpZXMudmFsdWVzKCldO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRYbWxMb2NhbE5hbWVUZXh0KHBhcmVudDogRWxlbWVudCwgbG9jYWxOYW1lOiBzdHJpbmcpIHtcbiAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgQXJyYXkuZnJvbShwYXJlbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCIqXCIpKSkge1xuICAgICAgaWYgKGVsZW1lbnQubG9jYWxOYW1lID09PSBsb2NhbE5hbWUpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQudGV4dENvbnRlbnQ/LnRyaW0oKSA/PyBcIlwiO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBcIlwiO1xuICB9XG5cbiAgcHJpdmF0ZSB4bWxUcmVlSGFzTG9jYWxOYW1lKHBhcmVudDogRWxlbWVudCwgbG9jYWxOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShwYXJlbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCIqXCIpKS5zb21lKChlbGVtZW50KSA9PiBlbGVtZW50LmxvY2FsTmFtZSA9PT0gbG9jYWxOYW1lKTtcbiAgfVxuXG4gIHByaXZhdGUgaHJlZlRvUmVtb3RlUGF0aChocmVmOiBzdHJpbmcpIHtcbiAgICBjb25zdCBiYXNlVXJsID0gYCR7dGhpcy5zZXR0aW5ncy53ZWJkYXZVcmwucmVwbGFjZSgvXFwvKyQvLCBcIlwiKX0vYDtcbiAgICBjb25zdCByZXNvbHZlZCA9IG5ldyBVUkwoaHJlZiwgYmFzZVVybCk7XG4gICAgY29uc3QgYmFzZVBhdGggPSBuZXcgVVJMKGJhc2VVcmwpLnBhdGhuYW1lLnJlcGxhY2UoL1xcLyskLywgXCIvXCIpO1xuICAgIGNvbnN0IGRlY29kZWRQYXRoID0gdGhpcy5kZWNvZGVQYXRobmFtZShyZXNvbHZlZC5wYXRobmFtZSk7XG4gICAgaWYgKCFkZWNvZGVkUGF0aC5zdGFydHNXaXRoKGJhc2VQYXRoKSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlY29kZWRQYXRoLnNsaWNlKGJhc2VQYXRoLmxlbmd0aCkucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgZGVjb2RlUGF0aG5hbWUocGF0aG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBwYXRobmFtZVxuICAgICAgLnNwbGl0KFwiL1wiKVxuICAgICAgLm1hcCgoc2VnbWVudCkgPT4ge1xuICAgICAgICBpZiAoIXNlZ21lbnQpIHtcbiAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudChzZWdtZW50KTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgcmV0dXJuIHNlZ21lbnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuam9pbihcIi9cIik7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkRXhwZWN0ZWRSZW1vdGVEaXJlY3RvcmllcyhyZW1vdGVGaWxlUGF0aHM6IFNldDxzdHJpbmc+LCByb290Rm9sZGVyOiBzdHJpbmcpIHtcbiAgICBjb25zdCBleHBlY3RlZCA9IG5ldyBTZXQ8c3RyaW5nPihbdGhpcy5ub3JtYWxpemVGb2xkZXIocm9vdEZvbGRlcildKTtcbiAgICBmb3IgKGNvbnN0IHJlbW90ZVBhdGggb2YgcmVtb3RlRmlsZVBhdGhzKSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IHJlbW90ZVBhdGguc3BsaXQoXCIvXCIpLmZpbHRlcigodmFsdWUpID0+IHZhbHVlLmxlbmd0aCA+IDApO1xuICAgICAgbGV0IGN1cnJlbnQgPSBcIlwiO1xuICAgICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHBhcnRzLmxlbmd0aCAtIDE7IGluZGV4ICs9IDEpIHtcbiAgICAgICAgY3VycmVudCA9IGN1cnJlbnQgPyBgJHtjdXJyZW50fS8ke3BhcnRzW2luZGV4XX1gIDogcGFydHNbaW5kZXhdO1xuICAgICAgICBleHBlY3RlZC5hZGQodGhpcy5ub3JtYWxpemVGb2xkZXIoY3VycmVudCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBleHBlY3RlZDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZGVsZXRlRXh0cmFSZW1vdGVEaXJlY3RvcmllcyhyZW1vdGVEaXJlY3RvcmllczogU2V0PHN0cmluZz4sIGV4cGVjdGVkRGlyZWN0b3JpZXM6IFNldDxzdHJpbmc+KSB7XG4gICAgbGV0IGRlbGV0ZWQgPSAwO1xuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBbLi4ucmVtb3RlRGlyZWN0b3JpZXNdXG4gICAgICAuZmlsdGVyKChyZW1vdGVQYXRoKSA9PiAhZXhwZWN0ZWREaXJlY3Rvcmllcy5oYXMocmVtb3RlUGF0aCkpXG4gICAgICAuc29ydCgoYSwgYikgPT4gYi5sZW5ndGggLSBhLmxlbmd0aCB8fCBiLmxvY2FsZUNvbXBhcmUoYSkpO1xuXG4gICAgZm9yIChjb25zdCByZW1vdGVQYXRoIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgICBtZXRob2Q6IFwiREVMRVRFXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChbMjAwLCAyMDIsIDIwNCwgNDA0XS5pbmNsdWRlcyhyZXNwb25zZS5zdGF0dXMpKSB7XG4gICAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgIT09IDQwNCkge1xuICAgICAgICAgIGRlbGV0ZWQgKz0gMTtcbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKFs0MDUsIDQwOV0uaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBERUxFVEUgZGlyZWN0b3J5IGZhaWxlZCBmb3IgJHtyZW1vdGVQYXRofSB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGVsZXRlZDtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzUGVuZGluZ1Rhc2tzKCkge1xuICAgIGlmICh0aGlzLnF1ZXVlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHJ1bm5pbmc6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuICAgIGZvciAoY29uc3QgdGFzayBvZiBbLi4udGhpcy5xdWV1ZV0pIHtcbiAgICAgIHJ1bm5pbmcucHVzaCh0aGlzLnN0YXJ0UGVuZGluZ1Rhc2sodGFzaykpO1xuICAgIH1cblxuICAgIGlmIChydW5uaW5nLmxlbmd0aCA+IDApIHtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChydW5uaW5nKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHRyYWNrVmF1bHRNdXRhdGlvbihvcGVyYXRpb246ICgpID0+IFByb21pc2U8dm9pZD4pIHtcbiAgICBjb25zdCBwcm9taXNlID0gb3BlcmF0aW9uKClcbiAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIlNlY3VyZSBXZWJEQVYgdmF1bHQgbXV0YXRpb24gaGFuZGxpbmcgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIH0pXG4gICAgICAuZmluYWxseSgoKSA9PiB7XG4gICAgICAgIHRoaXMucGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlcy5kZWxldGUocHJvbWlzZSk7XG4gICAgICB9KTtcbiAgICB0aGlzLnBlbmRpbmdWYXVsdE11dGF0aW9uUHJvbWlzZXMuYWRkKHByb21pc2UpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB3YWl0Rm9yUGVuZGluZ1ZhdWx0TXV0YXRpb25zKCkge1xuICAgIHdoaWxlICh0aGlzLnBlbmRpbmdWYXVsdE11dGF0aW9uUHJvbWlzZXMuc2l6ZSA+IDApIHtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChbLi4udGhpcy5wZW5kaW5nVmF1bHRNdXRhdGlvblByb21pc2VzXSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBzdGFydFBlbmRpbmdUYXNrKHRhc2s6IFVwbG9hZFRhc2spIHtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMucGVuZGluZ1Rhc2tQcm9taXNlcy5nZXQodGFzay5pZCk7XG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICByZXR1cm4gZXhpc3Rpbmc7XG4gICAgfVxuXG4gICAgY29uc3QgcHJvbWlzZSA9IHRoaXMucHJvY2Vzc1Rhc2sodGFzaykuZmluYWxseSgoKSA9PiB7XG4gICAgICB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMuZGVsZXRlKHRhc2suaWQpO1xuICAgIH0pO1xuICAgIHRoaXMucGVuZGluZ1Rhc2tQcm9taXNlcy5zZXQodGFzay5pZCwgcHJvbWlzZSk7XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHByZXBhcmVQZW5kaW5nVXBsb2Fkc0ZvclN5bmMoc2hvd05vdGljZTogYm9vbGVhbikge1xuICAgIGF3YWl0IHRoaXMucHJvY2Vzc1BlbmRpbmdUYXNrcygpO1xuXG4gICAgaWYgKHRoaXMucXVldWUubGVuZ3RoID4gMCB8fCB0aGlzLnByb2Nlc3NpbmdUYXNrSWRzLnNpemUgPiAwIHx8IHRoaXMucGVuZGluZ1Rhc2tQcm9taXNlcy5zaXplID4gMCkge1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy50KFxuICAgICAgICBcIlx1NjhDMFx1NkQ0Qlx1NTIzMFx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NEVDRFx1NTcyOFx1OEZEQlx1ODg0Q1x1NjIxNlx1N0I0OVx1NUY4NVx1OTFDRFx1OEJENVx1RkYwQ1x1NURGMlx1NjY4Mlx1N0YxM1x1NjcyQ1x1NkIyMVx1N0IxNFx1OEJCMFx1NTQwQ1x1NkI2NVx1RkYwQ1x1OTA3Rlx1NTE0RFx1NjVFN1x1NzI0OFx1N0IxNFx1OEJCMFx1ODk4Nlx1NzZENlx1NjVCMFx1NTZGRVx1NzI0N1x1NUYxNVx1NzUyOFx1MzAwMlwiLFxuICAgICAgICBcIkltYWdlIHVwbG9hZHMgYXJlIHN0aWxsIHJ1bm5pbmcgb3Igd2FpdGluZyBmb3IgcmV0cnksIHNvIG5vdGUgc3luYyB3YXMgZGVmZXJyZWQgdG8gYXZvaWQgb2xkIG5vdGUgY29udGVudCBvdmVyd3JpdGluZyBuZXcgaW1hZ2UgcmVmZXJlbmNlcy5cIixcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsIDgwMDApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cclxuICBwcml2YXRlIGFzeW5jIHVwbG9hZEltYWdlc0luTm90ZShub3RlRmlsZTogVEZpbGUpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKG5vdGVGaWxlKTtcclxuICAgICAgY29uc3QgcmVwbGFjZW1lbnRzID0gYXdhaXQgdGhpcy5idWlsZFVwbG9hZFJlcGxhY2VtZW50cyhjb250ZW50LCBub3RlRmlsZSk7XHJcblxyXG4gICAgICBpZiAocmVwbGFjZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1RjUzXHU1MjREXHU3QjE0XHU4QkIwXHU0RTJEXHU2Q0ExXHU2NzA5XHU2MjdFXHU1MjMwXHU2NzJDXHU1NzMwXHU1NkZFXHU3MjQ3XHUzMDAyXCIsIFwiTm8gbG9jYWwgaW1hZ2VzIGZvdW5kIGluIHRoZSBjdXJyZW50IG5vdGUuXCIpKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGxldCB1cGRhdGVkID0gY29udGVudDtcclxuICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcclxuICAgICAgICB1cGRhdGVkID0gdXBkYXRlZC5zcGxpdChyZXBsYWNlbWVudC5vcmlnaW5hbCkuam9pbihyZXBsYWNlbWVudC5yZXdyaXR0ZW4pO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAodXBkYXRlZCA9PT0gY29udGVudCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU2Q0ExXHU2NzA5XHU5NzAwXHU4OTgxXHU2NTM5XHU1MTk5XHU3Njg0XHU1NkZFXHU3MjQ3XHU5NEZFXHU2M0E1XHUzMDAyXCIsIFwiTm8gaW1hZ2VzIHdlcmUgcmV3cml0dGVuLlwiKSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkobm90ZUZpbGUsIHVwZGF0ZWQpO1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZUZpbGUucGF0aCwgXCJpbWFnZS1hZGRcIik7XG5cbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLmRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQpIHtcbiAgICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcbiAgICAgICAgICBpZiAocmVwbGFjZW1lbnQuc291cmNlRmlsZSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy50cmFzaElmRXhpc3RzKHJlcGxhY2VtZW50LnNvdXJjZUZpbGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXHJcbiAgICAgIG5ldyBOb3RpY2UodGhpcy50KGBcdTVERjJcdTRFMEFcdTRGMjAgJHtyZXBsYWNlbWVudHMubGVuZ3RofSBcdTVGMjBcdTU2RkVcdTcyNDdcdTUyMzAgV2ViREFWXHUzMDAyYCwgYFVwbG9hZGVkICR7cmVwbGFjZW1lbnRzLmxlbmd0aH0gaW1hZ2UocykgdG8gV2ViREFWLmApKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIHVwbG9hZCBmYWlsZWRcIiwgZXJyb3IpO1xyXG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTRFMEFcdTRGMjBcdTU5MzFcdThEMjVcIiwgXCJVcGxvYWQgZmFpbGVkXCIpLCBlcnJvciksIDgwMDApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzVGFzayh0YXNrOiBVcGxvYWRUYXNrKSB7XG4gICAgdGhpcy5wcm9jZXNzaW5nVGFza0lkcy5hZGQodGFzay5pZCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGJpbmFyeSA9IHRoaXMuYmFzZTY0VG9BcnJheUJ1ZmZlcih0YXNrLmRhdGFCYXNlNjQpO1xuICAgICAgY29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLnByZXBhcmVVcGxvYWRQYXlsb2FkKFxuICAgICAgICBiaW5hcnksXG4gICAgICAgIHRhc2subWltZVR5cGUgfHwgdGhpcy5nZXRNaW1lVHlwZUZyb21GaWxlTmFtZSh0YXNrLmZpbGVOYW1lKSxcbiAgICAgICAgdGFzay5maWxlTmFtZSxcbiAgICAgICk7XG4gICAgICBjb25zdCByZW1vdGVOYW1lID0gYXdhaXQgdGhpcy5idWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeShwcmVwYXJlZC5maWxlTmFtZSwgcHJlcGFyZWQuYmluYXJ5KTtcbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkUmVtb3RlUGF0aChyZW1vdGVOYW1lKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgICBtZXRob2Q6IFwiUFVUXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICAgIFwiQ29udGVudC1UeXBlXCI6IHByZXBhcmVkLm1pbWVUeXBlLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBwcmVwYXJlZC5iaW5hcnksXG4gICAgICB9KTtcblxyXG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVwbG9hZCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IHJlcGxhY2VkID0gYXdhaXQgdGhpcy5yZXBsYWNlUGxhY2Vob2xkZXIoXHJcbiAgICAgICAgdGFzay5ub3RlUGF0aCxcbiAgICAgICAgdGFzay5pZCxcbiAgICAgICAgdGFzay5wbGFjZWhvbGRlcixcbiAgICAgICAgdGhpcy5idWlsZFNlY3VyZUltYWdlTWFya3VwKGAke1NFQ1VSRV9QUk9UT0NPTH0vLyR7cmVtb3RlUGF0aH1gLCBwcmVwYXJlZC5maWxlTmFtZSksXG4gICAgICApO1xuICAgICAgaWYgKCFyZXBsYWNlZCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJcdTRFMEFcdTRGMjBcdTYyMTBcdTUyOUZcdUZGMENcdTRGNDZcdTZDQTFcdTY3MDlcdTU3MjhcdTdCMTRcdThCQjBcdTRFMkRcdTYyN0VcdTUyMzBcdTUzRUZcdTY2RkZcdTYzNjJcdTc2ODRcdTUzNjBcdTRGNERcdTdCMjZcdTMwMDJcIiwgXCJVcGxvYWQgc3VjY2VlZGVkLCBidXQgbm8gbWF0Y2hpbmcgcGxhY2Vob2xkZXIgd2FzIGZvdW5kIGluIHRoZSBub3RlLlwiKSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRoaXMucXVldWUgPSB0aGlzLnF1ZXVlLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5pZCAhPT0gdGFzay5pZCk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmModGFzay5ub3RlUGF0aCwgXCJpbWFnZS1hZGRcIik7XG4gICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NjIxMFx1NTI5Rlx1MzAwMlwiLCBcIkltYWdlIHVwbG9hZGVkIHN1Y2Nlc3NmdWxseS5cIikpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIHF1ZXVlZCB1cGxvYWQgZmFpbGVkXCIsIGVycm9yKTtcclxuICAgICAgdGFzay5hdHRlbXB0cyArPSAxO1xyXG4gICAgICB0YXNrLmxhc3RFcnJvciA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcclxuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcclxuICAgICAgaWYgKHRhc2suYXR0ZW1wdHMgPj0gdGhpcy5zZXR0aW5ncy5tYXhSZXRyeUF0dGVtcHRzKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucmVwbGFjZVBsYWNlaG9sZGVyKHRhc2subm90ZVBhdGgsIHRhc2suaWQsIHRhc2sucGxhY2Vob2xkZXIsIHRoaXMuYnVpbGRGYWlsZWRQbGFjZWhvbGRlcih0YXNrLmZpbGVOYW1lLCB0YXNrLmxhc3RFcnJvcikpO1xuICAgICAgICB0aGlzLnF1ZXVlID0gdGhpcy5xdWV1ZS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uaWQgIT09IHRhc2suaWQpO1xuICAgICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTY3MDBcdTdFQzhcdTU5MzFcdThEMjVcIiwgXCJJbWFnZSB1cGxvYWQgZmFpbGVkIHBlcm1hbmVudGx5XCIpLCBlcnJvciksIDgwMDApO1xuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLnNjaGVkdWxlUmV0cnkodGFzayk7XHJcbiAgICAgIH1cclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIHRoaXMucHJvY2Vzc2luZ1Rhc2tJZHMuZGVsZXRlKHRhc2suaWQpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBzY2hlZHVsZVJldHJ5KHRhc2s6IFVwbG9hZFRhc2spIHtcclxuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5yZXRyeVRpbWVvdXRzLmdldCh0YXNrLmlkKTtcclxuICAgIGlmIChleGlzdGluZykge1xyXG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KGV4aXN0aW5nKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBkZWxheSA9IE1hdGgubWF4KDEsIHRoaXMuc2V0dGluZ3MucmV0cnlEZWxheVNlY29uZHMpICogMTAwMCAqIHRhc2suYXR0ZW1wdHM7XG4gICAgY29uc3QgdGltZW91dElkID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgdGhpcy5yZXRyeVRpbWVvdXRzLmRlbGV0ZSh0YXNrLmlkKTtcbiAgICAgIHZvaWQgdGhpcy5zdGFydFBlbmRpbmdUYXNrKHRhc2spO1xuICAgIH0sIGRlbGF5KTtcbiAgICB0aGlzLnJldHJ5VGltZW91dHMuc2V0KHRhc2suaWQsIHRpbWVvdXRJZCk7XG4gIH1cblxyXG4gIHByaXZhdGUgYXN5bmMgcmVwbGFjZVBsYWNlaG9sZGVyKG5vdGVQYXRoOiBzdHJpbmcsIHRhc2tJZDogc3RyaW5nLCBwbGFjZWhvbGRlcjogc3RyaW5nLCByZXBsYWNlbWVudDogc3RyaW5nKSB7XHJcbiAgICBjb25zdCByZXBsYWNlZEluRWRpdG9yID0gdGhpcy5yZXBsYWNlUGxhY2Vob2xkZXJJbk9wZW5FZGl0b3JzKG5vdGVQYXRoLCB0YXNrSWQsIHBsYWNlaG9sZGVyLCByZXBsYWNlbWVudCk7XHJcbiAgICBpZiAocmVwbGFjZWRJbkVkaXRvcikge1xyXG4gICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKG5vdGVQYXRoKTtcclxuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xyXG4gICAgaWYgKGNvbnRlbnQuaW5jbHVkZXMocGxhY2Vob2xkZXIpKSB7XHJcbiAgICAgIGNvbnN0IHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGxhY2Vob2xkZXIsIHJlcGxhY2VtZW50KTtcclxuICAgICAgaWYgKHVwZGF0ZWQgIT09IGNvbnRlbnQpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdXBkYXRlZCk7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBwYXR0ZXJuID0gbmV3IFJlZ0V4cChgPHNwYW5bXj5dKmRhdGEtc2VjdXJlLXdlYmRhdi10YXNrPVwiJHt0aGlzLmVzY2FwZVJlZ0V4cCh0YXNrSWQpfVwiW14+XSo+Lio/PFxcL3NwYW4+YCwgXCJzXCIpO1xyXG4gICAgaWYgKHBhdHRlcm4udGVzdChjb250ZW50KSkge1xyXG4gICAgICBjb25zdCB1cGRhdGVkID0gY29udGVudC5yZXBsYWNlKHBhdHRlcm4sIHJlcGxhY2VtZW50KTtcclxuICAgICAgaWYgKHVwZGF0ZWQgIT09IGNvbnRlbnQpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdXBkYXRlZCk7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGJ1aWxkRmFpbGVkUGxhY2Vob2xkZXIoZmlsZU5hbWU6IHN0cmluZywgbWVzc2FnZT86IHN0cmluZykge1xuICAgIGNvbnN0IHNhZmVOYW1lID0gdGhpcy5lc2NhcGVIdG1sKGZpbGVOYW1lKTtcbiAgICBjb25zdCBzYWZlTWVzc2FnZSA9IHRoaXMuZXNjYXBlSHRtbChtZXNzYWdlID8/IHRoaXMudChcIlx1NjcyQVx1NzdFNVx1OTUxOVx1OEJFRlwiLCBcIlVua25vd24gZXJyb3JcIikpO1xuICAgIHJldHVybiBgPHNwYW4gY2xhc3M9XCJzZWN1cmUtd2ViZGF2LWZhaWxlZFwiIGFyaWEtbGFiZWw9XCIke3NhZmVOYW1lfVwiPiR7dGhpcy5lc2NhcGVIdG1sKHRoaXMuZm9ybWF0RmFpbGVkTGFiZWwoZmlsZU5hbWUpKX06ICR7c2FmZU1lc3NhZ2V9PC9zcGFuPmA7XG4gIH1cblxuICBwcml2YXRlIGVzY2FwZUh0bWwodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiB2YWx1ZVxuICAgICAgLnJlcGxhY2UoLyYvZywgXCImYW1wO1wiKVxuICAgICAgLnJlcGxhY2UoL1wiL2csIFwiJnF1b3Q7XCIpXG4gICAgICAucmVwbGFjZSgvPC9nLCBcIiZsdDtcIilcbiAgICAgIC5yZXBsYWNlKC8+L2csIFwiJmd0O1wiKTtcbiAgfVxuXG4gIHByaXZhdGUgdW5lc2NhcGVIdG1sKHZhbHVlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdmFsdWVcbiAgICAgIC5yZXBsYWNlKC8mcXVvdDsvZywgXCJcXFwiXCIpXG4gICAgICAucmVwbGFjZSgvJmd0Oy9nLCBcIj5cIilcbiAgICAgIC5yZXBsYWNlKC8mbHQ7L2csIFwiPFwiKVxuICAgICAgLnJlcGxhY2UoLyZhbXA7L2csIFwiJlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmwocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBGZXRjaCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtyZXNwb25zZS5hcnJheUJ1ZmZlcl0sIHtcbiAgICAgIHR5cGU6IHJlc3BvbnNlLmhlYWRlcnNbXCJjb250ZW50LXR5cGVcIl0gPz8gXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIixcbiAgICB9KTtcbiAgICBjb25zdCBibG9iVXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICB0aGlzLmJsb2JVcmxzLmFkZChibG9iVXJsKTtcbiAgICByZXR1cm4gYmxvYlVybDtcbiAgfVxuXG4gIHByaXZhdGUgYXJyYXlCdWZmZXJUb0Jhc2U2NChidWZmZXI6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShidWZmZXIpO1xuICAgIGNvbnN0IGNodW5rU2l6ZSA9IDB4ODAwMDtcbiAgICBsZXQgYmluYXJ5ID0gXCJcIjtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYnl0ZXMubGVuZ3RoOyBpbmRleCArPSBjaHVua1NpemUpIHtcbiAgICAgIGNvbnN0IGNodW5rID0gYnl0ZXMuc3ViYXJyYXkoaW5kZXgsIGluZGV4ICsgY2h1bmtTaXplKTtcbiAgICAgIGJpbmFyeSArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKC4uLmNodW5rKTtcbiAgICB9XG4gICAgcmV0dXJuIGJ0b2EoYmluYXJ5KTtcbiAgfVxuXG4gIHByaXZhdGUgYmFzZTY0VG9BcnJheUJ1ZmZlcihiYXNlNjQ6IHN0cmluZykge1xuICAgIGNvbnN0IGJpbmFyeSA9IGF0b2IoYmFzZTY0KTtcbiAgICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KGJpbmFyeS5sZW5ndGgpO1xuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBiaW5hcnkubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgICBieXRlc1tpbmRleF0gPSBiaW5hcnkuY2hhckNvZGVBdChpbmRleCk7XG4gICAgfVxuICAgIHJldHVybiBieXRlcy5idWZmZXIuc2xpY2UoYnl0ZXMuYnl0ZU9mZnNldCwgYnl0ZXMuYnl0ZU9mZnNldCArIGJ5dGVzLmJ5dGVMZW5ndGgpIGFzIEFycmF5QnVmZmVyO1xuICB9XG5cbiAgcHJpdmF0ZSBhcnJheUJ1ZmZlcnNFcXVhbChsZWZ0OiBBcnJheUJ1ZmZlciwgcmlnaHQ6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgYSA9IG5ldyBVaW50OEFycmF5KGxlZnQpO1xuICAgIGNvbnN0IGIgPSBuZXcgVWludDhBcnJheShyaWdodCk7XG4gICAgaWYgKGEubGVuZ3RoICE9PSBiLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBhLmxlbmd0aDsgaW5kZXggKz0gMSkge1xuICAgICAgaWYgKGFbaW5kZXhdICE9PSBiW2luZGV4XSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkQ2xpcGJvYXJkRmlsZU5hbWUobWltZVR5cGU6IHN0cmluZykge1xuICAgIGNvbnN0IGV4dGVuc2lvbiA9IG1pbWVUeXBlLnNwbGl0KFwiL1wiKVsxXT8ucmVwbGFjZShcImpwZWdcIiwgXCJqcGdcIikgfHwgXCJwbmdcIjtcbiAgICByZXR1cm4gYHBhc3RlZC1pbWFnZS0ke0RhdGUubm93KCl9LiR7ZXh0ZW5zaW9ufWA7XG4gIH1cblxyXG4gIHByaXZhdGUgZXNjYXBlUmVnRXhwKHZhbHVlOiBzdHJpbmcpIHtcclxuICAgIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgXCJcXFxcJCZcIik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHJlcGxhY2VQbGFjZWhvbGRlckluT3BlbkVkaXRvcnMobm90ZVBhdGg6IHN0cmluZywgdGFza0lkOiBzdHJpbmcsIHBsYWNlaG9sZGVyOiBzdHJpbmcsIHJlcGxhY2VtZW50OiBzdHJpbmcpIHtcclxuICAgIGxldCByZXBsYWNlZCA9IGZhbHNlO1xyXG4gICAgY29uc3QgbGVhdmVzID0gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYXZlc09mVHlwZShcIm1hcmtkb3duXCIpO1xyXG5cclxuICAgIGZvciAoY29uc3QgbGVhZiBvZiBsZWF2ZXMpIHtcclxuICAgICAgY29uc3QgdmlldyA9IGxlYWYudmlldztcclxuICAgICAgaWYgKCEodmlldyBpbnN0YW5jZW9mIE1hcmtkb3duVmlldykpIHtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKCF2aWV3LmZpbGUgfHwgdmlldy5maWxlLnBhdGggIT09IG5vdGVQYXRoKSB7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGVkaXRvciA9IHZpZXcuZWRpdG9yO1xyXG4gICAgICBjb25zdCBjb250ZW50ID0gZWRpdG9yLmdldFZhbHVlKCk7XHJcbiAgICAgIGxldCB1cGRhdGVkID0gY29udGVudDtcclxuXHJcbiAgICAgIGlmIChjb250ZW50LmluY2x1ZGVzKHBsYWNlaG9sZGVyKSkge1xyXG4gICAgICAgIHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGxhY2Vob2xkZXIsIHJlcGxhY2VtZW50KTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zdCBwYXR0ZXJuID0gbmV3IFJlZ0V4cChcclxuICAgICAgICAgIGA8c3BhbltePl0qZGF0YS1zZWN1cmUtd2ViZGF2LXRhc2s9XCIke3RoaXMuZXNjYXBlUmVnRXhwKHRhc2tJZCl9XCJbXj5dKj4uKj88XFxcXC9zcGFuPmAsXHJcbiAgICAgICAgICBcInNcIixcclxuICAgICAgICApO1xyXG4gICAgICAgIHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGF0dGVybiwgcmVwbGFjZW1lbnQpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAodXBkYXRlZCAhPT0gY29udGVudCkge1xyXG4gICAgICAgIGVkaXRvci5zZXRWYWx1ZSh1cGRhdGVkKTtcclxuICAgICAgICByZXBsYWNlZCA9IHRydWU7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gcmVwbGFjZWQ7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIHByb2Nlc3NTZWN1cmVJbWFnZXMoZWw6IEhUTUxFbGVtZW50LCBjdHg6IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQpIHtcbiAgICBjb25zdCBzZWN1cmVOb2RlcyA9IEFycmF5LmZyb20oZWwucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXCJbZGF0YS1zZWN1cmUtd2ViZGF2XVwiKSk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXHJcbiAgICAgIHNlY3VyZU5vZGVzLm1hcChhc3luYyAobm9kZSkgPT4ge1xyXG4gICAgICAgIGlmIChub2RlIGluc3RhbmNlb2YgSFRNTEltYWdlRWxlbWVudCkge1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5zd2FwSW1hZ2VTb3VyY2Uobm9kZSk7XHJcbiAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCByZW1vdGVQYXRoID0gbm9kZS5nZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIik7XHJcbiAgICAgICAgaWYgKCFyZW1vdGVQYXRoKSB7XHJcbiAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xyXG4gICAgICAgIGltZy5hbHQgPSBub2RlLmdldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIikgPz8gbm9kZS5nZXRBdHRyaWJ1dGUoXCJhbHRcIikgPz8gXCJTZWN1cmUgV2ViREFWIGltYWdlXCI7XHJcbiAgICAgICAgaW1nLnNldEF0dHJpYnV0ZShcImRhdGEtc2VjdXJlLXdlYmRhdlwiLCByZW1vdGVQYXRoKTtcclxuICAgICAgICBpbWcuY2xhc3NMaXN0LmFkZChcInNlY3VyZS13ZWJkYXYtaW1hZ2VcIiwgXCJpcy1sb2FkaW5nXCIpO1xyXG4gICAgICAgIG5vZGUucmVwbGFjZVdpdGgoaW1nKTtcclxuICAgICAgICBhd2FpdCB0aGlzLnN3YXBJbWFnZVNvdXJjZShpbWcpO1xyXG4gICAgICB9KSxcclxuICAgICk7XHJcblxyXG4gICAgY29uc3Qgc2VjdXJlTGlua3MgPSBBcnJheS5mcm9tKGVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEltYWdlRWxlbWVudD4oYGltZ1tzcmNePVwiJHtTRUNVUkVfUFJPVE9DT0x9Ly9cIl1gKSk7XHJcbiAgICBhd2FpdCBQcm9taXNlLmFsbChzZWN1cmVMaW5rcy5tYXAoYXN5bmMgKGltZykgPT4gdGhpcy5zd2FwSW1hZ2VTb3VyY2UoaW1nKSkpO1xyXG5cbiAgICBjdHguYWRkQ2hpbGQobmV3IFNlY3VyZVdlYmRhdlJlbmRlckNoaWxkKGVsKSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHByb2Nlc3NTZWN1cmVDb2RlQmxvY2soc291cmNlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCwgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0KSB7XG4gICAgY29uc3QgcGFyc2VkID0gdGhpcy5wYXJzZVNlY3VyZUltYWdlQmxvY2soc291cmNlKTtcbiAgICBpZiAoIXBhcnNlZD8ucGF0aCkge1xuICAgICAgZWwuY3JlYXRlRWwoXCJkaXZcIiwge1xuICAgICAgICB0ZXh0OiB0aGlzLnQoXCJcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTRFRTNcdTc4MDFcdTU3NTdcdTY4M0NcdTVGMEZcdTY1RTBcdTY1NDhcdTMwMDJcIiwgXCJJbnZhbGlkIHNlY3VyZSBpbWFnZSBjb2RlIGJsb2NrIGZvcm1hdC5cIiksXG4gICAgICB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xuICAgIGltZy5hbHQgPSBwYXJzZWQuYWx0IHx8IHBhcnNlZC5wYXRoO1xuICAgIGltZy5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIiwgcGFyc2VkLnBhdGgpO1xuICAgIGltZy5jbGFzc0xpc3QuYWRkKFwic2VjdXJlLXdlYmRhdi1pbWFnZVwiLCBcImlzLWxvYWRpbmdcIik7XG4gICAgZWwuZW1wdHkoKTtcbiAgICBlbC5hcHBlbmRDaGlsZChpbWcpO1xuICAgIGF3YWl0IHRoaXMuc3dhcEltYWdlU291cmNlKGltZyk7XG4gICAgY3R4LmFkZENoaWxkKG5ldyBTZWN1cmVXZWJkYXZSZW5kZXJDaGlsZChlbCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBwYXJzZVNlY3VyZUltYWdlQmxvY2soc291cmNlOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQ6IHsgcGF0aDogc3RyaW5nOyBhbHQ6IHN0cmluZyB9ID0geyBwYXRoOiBcIlwiLCBhbHQ6IFwiXCIgfTtcbiAgICBmb3IgKGNvbnN0IHJhd0xpbmUgb2Ygc291cmNlLnNwbGl0KC9cXHI/XFxuLykpIHtcbiAgICAgIGNvbnN0IGxpbmUgPSByYXdMaW5lLnRyaW0oKTtcbiAgICAgIGlmICghbGluZSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc2VwYXJhdG9ySW5kZXggPSBsaW5lLmluZGV4T2YoXCI6XCIpO1xuICAgICAgaWYgKHNlcGFyYXRvckluZGV4ID09PSAtMSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qga2V5ID0gbGluZS5zbGljZSgwLCBzZXBhcmF0b3JJbmRleCkudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgICBjb25zdCB2YWx1ZSA9IGxpbmUuc2xpY2Uoc2VwYXJhdG9ySW5kZXggKyAxKS50cmltKCk7XG4gICAgICBpZiAoa2V5ID09PSBcInBhdGhcIikge1xuICAgICAgICByZXN1bHQucGF0aCA9IHZhbHVlO1xuICAgICAgfSBlbHNlIGlmIChrZXkgPT09IFwiYWx0XCIpIHtcbiAgICAgICAgcmVzdWx0LmFsdCA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQucGF0aCA/IHJlc3VsdCA6IG51bGw7XG4gIH1cblxyXG4gIHByaXZhdGUgYXN5bmMgc3dhcEltYWdlU291cmNlKGltZzogSFRNTEltYWdlRWxlbWVudCkge1xyXG4gICAgY29uc3QgcmVtb3RlUGF0aCA9XHJcbiAgICAgIGltZy5nZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIikgPz8gdGhpcy5leHRyYWN0UmVtb3RlUGF0aChpbWcuZ2V0QXR0cmlidXRlKFwic3JjXCIpID8/IFwiXCIpO1xyXG4gICAgaWYgKCFyZW1vdGVQYXRoKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpbWcuY2xhc3NMaXN0LmFkZChcInNlY3VyZS13ZWJkYXYtaW1hZ2VcIiwgXCJpcy1sb2FkaW5nXCIpO1xyXG4gICAgY29uc3Qgb3JpZ2luYWxBbHQgPSBpbWcuYWx0O1xyXG4gICAgaW1nLmFsdCA9IG9yaWdpbmFsQWx0IHx8IHRoaXMudChcIlx1NTJBMFx1OEY3RFx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NEUyRC4uLlwiLCBcIkxvYWRpbmcgc2VjdXJlIGltYWdlLi4uXCIpO1xyXG5cclxuICAgIHRyeSB7XG4gICAgICBjb25zdCBibG9iVXJsID0gYXdhaXQgdGhpcy5mZXRjaFNlY3VyZUltYWdlQmxvYlVybChyZW1vdGVQYXRoKTtcbiAgICAgIGltZy5zcmMgPSBibG9iVXJsO1xuICAgICAgaW1nLmFsdCA9IG9yaWdpbmFsQWx0O1xuICAgICAgaW1nLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgICBpbWcuc3R5bGUubWF4V2lkdGggPSBcIjEwMCVcIjtcclxuICAgICAgaW1nLmNsYXNzTGlzdC5yZW1vdmUoXCJpcy1sb2FkaW5nXCIsIFwiaXMtZXJyb3JcIik7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiU2VjdXJlIFdlYkRBViBpbWFnZSBsb2FkIGZhaWxlZFwiLCBlcnJvcik7XHJcbiAgICAgIGltZy5yZXBsYWNlV2l0aCh0aGlzLmJ1aWxkRXJyb3JFbGVtZW50KHJlbW90ZVBhdGgsIGVycm9yKSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGV4dHJhY3RSZW1vdGVQYXRoKHNyYzogc3RyaW5nKSB7XHJcbiAgICBjb25zdCBwcmVmaXggPSBgJHtTRUNVUkVfUFJPVE9DT0x9Ly9gO1xyXG4gICAgaWYgKCFzcmMuc3RhcnRzV2l0aChwcmVmaXgpKSB7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBzcmMuc2xpY2UocHJlZml4Lmxlbmd0aCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGJ1aWxkUmVtb3RlUGF0aChmaWxlTmFtZTogc3RyaW5nKSB7XHJcbiAgICByZXR1cm4gYCR7dGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5zZXR0aW5ncy5yZW1vdGVGb2xkZXIpfSR7ZmlsZU5hbWV9YDtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnkoZmlsZU5hbWU6IHN0cmluZywgYmluYXJ5OiBBcnJheUJ1ZmZlcikge1xuICAgIGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbUZpbGVOYW1lKGZpbGVOYW1lKTtcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5uYW1pbmdTdHJhdGVneSA9PT0gXCJoYXNoXCIpIHtcbiAgICAgIGNvbnN0IGhhc2ggPSAoYXdhaXQgdGhpcy5jb21wdXRlU2hhMjU2SGV4KGJpbmFyeSkpLnNsaWNlKDAsIDE2KTtcbiAgICAgIHJldHVybiBgJHtoYXNofS4ke2V4dGVuc2lvbn1gO1xuICAgIH1cblxyXG4gICAgcmV0dXJuIGAke0RhdGUubm93KCl9LSR7ZmlsZU5hbWV9YDtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aDogc3RyaW5nKSB7XHJcbiAgICBjb25zdCBiYXNlID0gdGhpcy5zZXR0aW5ncy53ZWJkYXZVcmwucmVwbGFjZSgvXFwvKyQvLCBcIlwiKTtcclxuICAgIHJldHVybiBgJHtiYXNlfS8ke3JlbW90ZVBhdGguc3BsaXQoXCIvXCIpLm1hcChlbmNvZGVVUklDb21wb25lbnQpLmpvaW4oXCIvXCIpfWA7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIG5vcm1hbGl6ZUZvbGRlcihpbnB1dDogc3RyaW5nKSB7XHJcbiAgICByZXR1cm4gaW5wdXQucmVwbGFjZSgvXlxcLysvLCBcIlwiKS5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpICsgXCIvXCI7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGJ1aWxkQXV0aEhlYWRlcigpIHtcbiAgICBjb25zdCB0b2tlbiA9IHRoaXMuYXJyYXlCdWZmZXJUb0Jhc2U2NCh0aGlzLmVuY29kZVV0ZjgoYCR7dGhpcy5zZXR0aW5ncy51c2VybmFtZX06JHt0aGlzLnNldHRpbmdzLnBhc3N3b3JkfWApKTtcbiAgICByZXR1cm4gYEJhc2ljICR7dG9rZW59YDtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBlbnN1cmVDb25maWd1cmVkKCkge1xyXG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLndlYmRhdlVybCB8fCAhdGhpcy5zZXR0aW5ncy51c2VybmFtZSB8fCAhdGhpcy5zZXR0aW5ncy5wYXNzd29yZCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiV2ViREFWIFx1OTE0RFx1N0Y2RVx1NEUwRFx1NUI4Q1x1NjU3NFx1MzAwMlwiLCBcIldlYkRBViBzZXR0aW5ncyBhcmUgaW5jb21wbGV0ZS5cIikpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBnZXRNaW1lVHlwZShleHRlbnNpb246IHN0cmluZykge1xyXG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IGV4dGVuc2lvbi50b0xvd2VyQ2FzZSgpO1xyXG4gICAgaWYgKG5vcm1hbGl6ZWQgPT09IFwianBnXCIgfHwgbm9ybWFsaXplZCA9PT0gXCJqcGVnXCIpIHJldHVybiBcImltYWdlL2pwZWdcIjtcclxuICAgIGlmIChub3JtYWxpemVkID09PSBcInBuZ1wiKSByZXR1cm4gXCJpbWFnZS9wbmdcIjtcclxuICAgIGlmIChub3JtYWxpemVkID09PSBcImdpZlwiKSByZXR1cm4gXCJpbWFnZS9naWZcIjtcclxuICAgIGlmIChub3JtYWxpemVkID09PSBcIndlYnBcIikgcmV0dXJuIFwiaW1hZ2Uvd2VicFwiO1xyXG4gICAgaWYgKG5vcm1hbGl6ZWQgPT09IFwic3ZnXCIpIHJldHVybiBcImltYWdlL3N2Zyt4bWxcIjtcclxuICAgIGlmIChub3JtYWxpemVkID09PSBcImJtcFwiKSByZXR1cm4gXCJpbWFnZS9ibXBcIjtcclxuICAgIHJldHVybiBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBnZXRNaW1lVHlwZUZyb21GaWxlTmFtZShmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0TWltZVR5cGUodGhpcy5nZXRFeHRlbnNpb25Gcm9tRmlsZU5hbWUoZmlsZU5hbWUpKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0RXh0ZW5zaW9uRnJvbUZpbGVOYW1lKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBwaWVjZXMgPSBmaWxlTmFtZS5zcGxpdChcIi5cIik7XG4gICAgcmV0dXJuIHBpZWNlcy5sZW5ndGggPiAxID8gcGllY2VzW3BpZWNlcy5sZW5ndGggLSAxXS50b0xvd2VyQ2FzZSgpIDogXCJwbmdcIjtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcHJlcGFyZVVwbG9hZFBheWxvYWQoYmluYXJ5OiBBcnJheUJ1ZmZlciwgbWltZVR5cGU6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGlmICghdGhpcy5zZXR0aW5ncy5jb21wcmVzc0ltYWdlcykge1xuICAgICAgcmV0dXJuIHsgYmluYXJ5LCBtaW1lVHlwZSwgZmlsZU5hbWUgfTtcbiAgICB9XG5cbiAgICBjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRoaXMuY29tcHJlc3NJbWFnZUlmTmVlZGVkKGJpbmFyeSwgbWltZVR5cGUsIGZpbGVOYW1lKTtcbiAgICByZXR1cm4gcHJlcGFyZWQgPz8geyBiaW5hcnksIG1pbWVUeXBlLCBmaWxlTmFtZSB9O1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjb21wcmVzc0ltYWdlSWZOZWVkZWQoYmluYXJ5OiBBcnJheUJ1ZmZlciwgbWltZVR5cGU6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGlmICghL15pbWFnZVxcLyhwbmd8anBlZ3xqcGd8d2VicCkkL2kudGVzdChtaW1lVHlwZSkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IHRocmVzaG9sZEJ5dGVzID0gdGhpcy5zZXR0aW5ncy5jb21wcmVzc1RocmVzaG9sZEtiICogMTAyNDtcbiAgICBjb25zdCBzb3VyY2VCbG9iID0gbmV3IEJsb2IoW2JpbmFyeV0sIHsgdHlwZTogbWltZVR5cGUgfSk7XG4gICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB0aGlzLmxvYWRJbWFnZUVsZW1lbnQoc291cmNlQmxvYik7XG4gICAgY29uc3QgbGFyZ2VzdFNpZGUgPSBNYXRoLm1heChpbWFnZS5uYXR1cmFsV2lkdGgsIGltYWdlLm5hdHVyYWxIZWlnaHQpO1xuICAgIGNvbnN0IG5lZWRzUmVzaXplID0gbGFyZ2VzdFNpZGUgPiB0aGlzLnNldHRpbmdzLm1heEltYWdlRGltZW5zaW9uO1xuICAgIGNvbnN0IG5lZWRzQ29tcHJlc3MgPSBzb3VyY2VCbG9iLnNpemUgPiB0aHJlc2hvbGRCeXRlcyB8fCBuZWVkc1Jlc2l6ZTtcbiAgICBpZiAoIW5lZWRzQ29tcHJlc3MpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IHNjYWxlID0gbmVlZHNSZXNpemUgPyB0aGlzLnNldHRpbmdzLm1heEltYWdlRGltZW5zaW9uIC8gbGFyZ2VzdFNpZGUgOiAxO1xuICAgIGNvbnN0IHRhcmdldFdpZHRoID0gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChpbWFnZS5uYXR1cmFsV2lkdGggKiBzY2FsZSkpO1xuICAgIGNvbnN0IHRhcmdldEhlaWdodCA9IE1hdGgubWF4KDEsIE1hdGgucm91bmQoaW1hZ2UubmF0dXJhbEhlaWdodCAqIHNjYWxlKSk7XG4gICAgY29uc3QgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImNhbnZhc1wiKTtcbiAgICBjYW52YXMud2lkdGggPSB0YXJnZXRXaWR0aDtcbiAgICBjYW52YXMuaGVpZ2h0ID0gdGFyZ2V0SGVpZ2h0O1xuICAgIGNvbnN0IGNvbnRleHQgPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpO1xuICAgIGlmICghY29udGV4dCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29udGV4dC5kcmF3SW1hZ2UoaW1hZ2UsIDAsIDAsIHRhcmdldFdpZHRoLCB0YXJnZXRIZWlnaHQpO1xuXG4gICAgY29uc3Qgb3V0cHV0TWltZSA9IG1pbWVUeXBlLnRvTG93ZXJDYXNlKCkgPT09IFwiaW1hZ2UvanBnXCIgPyBcImltYWdlL2pwZWdcIiA6IG1pbWVUeXBlO1xuICAgIGNvbnN0IHF1YWxpdHkgPSBNYXRoLm1heCgwLjQsIE1hdGgubWluKDAuOTgsIHRoaXMuc2V0dGluZ3MuanBlZ1F1YWxpdHkgLyAxMDApKTtcbiAgICBjb25zdCBjb21wcmVzc2VkQmxvYiA9IGF3YWl0IG5ldyBQcm9taXNlPEJsb2IgfCBudWxsPigocmVzb2x2ZSkgPT4ge1xuICAgICAgY2FudmFzLnRvQmxvYihyZXNvbHZlLCBvdXRwdXRNaW1lLCBxdWFsaXR5KTtcbiAgICB9KTtcblxuICAgIGlmICghY29tcHJlc3NlZEJsb2IpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmICghbmVlZHNSZXNpemUgJiYgY29tcHJlc3NlZEJsb2Iuc2l6ZSA+PSBzb3VyY2VCbG9iLnNpemUpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IG5leHRCaW5hcnkgPSBhd2FpdCBjb21wcmVzc2VkQmxvYi5hcnJheUJ1ZmZlcigpO1xuICAgIGNvbnN0IG5leHRFeHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbkZyb21NaW1lVHlwZShvdXRwdXRNaW1lKSA/PyB0aGlzLmdldEV4dGVuc2lvbkZyb21GaWxlTmFtZShmaWxlTmFtZSk7XG4gICAgY29uc3QgbmV4dEZpbGVOYW1lID0gZmlsZU5hbWUucmVwbGFjZSgvXFwuW14uXSskLywgXCJcIikgKyBgLiR7bmV4dEV4dGVuc2lvbn1gO1xuICAgIHJldHVybiB7XG4gICAgICBiaW5hcnk6IG5leHRCaW5hcnksXG4gICAgICBtaW1lVHlwZTogb3V0cHV0TWltZSxcbiAgICAgIGZpbGVOYW1lOiBuZXh0RmlsZU5hbWUsXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgbG9hZEltYWdlRWxlbWVudChibG9iOiBCbG9iKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPEhUTUxJbWFnZUVsZW1lbnQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICBjb25zdCBpbWFnZSA9IG5ldyBJbWFnZSgpO1xuICAgICAgaW1hZ2Uub25sb2FkID0gKCkgPT4ge1xuICAgICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG4gICAgICAgIHJlc29sdmUoaW1hZ2UpO1xuICAgICAgfTtcbiAgICAgIGltYWdlLm9uZXJyb3IgPSAoZXJyb3IpID0+IHtcbiAgICAgICAgVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfTtcbiAgICAgIGltYWdlLnNyYyA9IHVybDtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgZXh0ZW5zaW9uRnJvbU1pbWVUeXBlKG1pbWVUeXBlOiBzdHJpbmcpIHtcbiAgICBpZiAobWltZVR5cGUgPT09IFwiaW1hZ2UvanBlZ1wiKSByZXR1cm4gXCJqcGdcIjtcbiAgICBpZiAobWltZVR5cGUgPT09IFwiaW1hZ2UvcG5nXCIpIHJldHVybiBcInBuZ1wiO1xuICAgIGlmIChtaW1lVHlwZSA9PT0gXCJpbWFnZS93ZWJwXCIpIHJldHVybiBcIndlYnBcIjtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBhc3luYyB0cmFzaElmRXhpc3RzKGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LnRyYXNoKGZpbGUsIHRydWUpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS53YXJuKFwiRmFpbGVkIHRvIHRyYXNoIGxvY2FsIGltYWdlIGFmdGVyIHVwbG9hZFwiLCBlcnJvcik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsOiBzdHJpbmcsIGFsdDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuZXh0cmFjdFJlbW90ZVBhdGgocmVtb3RlVXJsKTtcbiAgICBpZiAoIXJlbW90ZVBhdGgpIHtcbiAgICAgIHJldHVybiBgIVtdKCR7cmVtb3RlVXJsfSlgO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmJ1aWxkU2VjdXJlSW1hZ2VDb2RlQmxvY2socmVtb3RlUGF0aCwgYWx0KTtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayhyZW1vdGVQYXRoOiBzdHJpbmcsIGFsdDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZEFsdCA9IChhbHQgfHwgcmVtb3RlUGF0aCkucmVwbGFjZSgvXFxyP1xcbi9nLCBcIiBcIikudHJpbSgpO1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gcmVtb3RlUGF0aC5yZXBsYWNlKC9cXHI/XFxuL2csIFwiXCIpLnRyaW0oKTtcbiAgICByZXR1cm4gW1xuICAgICAgYFxcYFxcYFxcYCR7U0VDVVJFX0NPREVfQkxPQ0t9YCxcbiAgICAgIGBwYXRoOiAke25vcm1hbGl6ZWRQYXRofWAsXG4gICAgICBgYWx0OiAke25vcm1hbGl6ZWRBbHR9YCxcbiAgICAgIFwiYGBgXCIsXG4gICAgXS5qb2luKFwiXFxuXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBmb3JtYXRFbWJlZExhYmVsKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy50KGBcdTMwMTBcdTVCODlcdTUxNjhcdThGRENcdTdBMEJcdTU2RkVcdTcyNDdcdUZGNUMke2ZpbGVOYW1lfVx1MzAxMWAsIGBbU2VjdXJlIHJlbW90ZSBpbWFnZSB8ICR7ZmlsZU5hbWV9XWApO1xuICB9XG5cbiAgcHJpdmF0ZSBmb3JtYXRGYWlsZWRMYWJlbChmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMudChgXHUzMDEwXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU1OTMxXHU4RDI1XHVGRjVDJHtmaWxlTmFtZX1cdTMwMTFgLCBgW0ltYWdlIHVwbG9hZCBmYWlsZWQgfCAke2ZpbGVOYW1lfV1gKTtcbiAgfVxuXG4gIGFzeW5jIG1pZ3JhdGVBbGxMZWdhY3lTZWN1cmVJbWFnZXMoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVwbG9hZENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgICAgIGNvbnN0IGNhbmRpZGF0ZUxvY2FsSW1hZ2VzID0gbmV3IE1hcDxzdHJpbmcsIFRGaWxlPigpO1xuICAgICAgbGV0IGNoYW5nZWRGaWxlcyA9IDA7XG4gICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgdGhpcy5hcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpKSB7XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICBjb25zdCByZXBsYWNlbWVudHMgPSBhd2FpdCB0aGlzLmJ1aWxkVXBsb2FkUmVwbGFjZW1lbnRzKGNvbnRlbnQsIGZpbGUsIHVwbG9hZENhY2hlKTtcbiAgICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcbiAgICAgICAgICBpZiAocmVwbGFjZW1lbnQuc291cmNlRmlsZSkge1xuICAgICAgICAgICAgY2FuZGlkYXRlTG9jYWxJbWFnZXMuc2V0KHJlcGxhY2VtZW50LnNvdXJjZUZpbGUucGF0aCwgcmVwbGFjZW1lbnQuc291cmNlRmlsZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHVwZGF0ZWQgPSBjb250ZW50O1xuICAgICAgICBmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIHJlcGxhY2VtZW50cykge1xuICAgICAgICAgIHVwZGF0ZWQgPSB1cGRhdGVkLnNwbGl0KHJlcGxhY2VtZW50Lm9yaWdpbmFsKS5qb2luKHJlcGxhY2VtZW50LnJld3JpdHRlbik7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVkID0gdXBkYXRlZFxuICAgICAgICAgIC5yZXBsYWNlKFxuICAgICAgICAgICAgLzxzcGFuIGNsYXNzPVwic2VjdXJlLXdlYmRhdi1lbWJlZFwiIGRhdGEtc2VjdXJlLXdlYmRhdj1cIihbXlwiXSspXCIgYXJpYS1sYWJlbD1cIihbXlwiXSopXCI+Lio/PFxcL3NwYW4+L2csXG4gICAgICAgICAgICAoX21hdGNoLCByZW1vdGVQYXRoOiBzdHJpbmcsIGFsdDogc3RyaW5nKSA9PlxuICAgICAgICAgICAgICB0aGlzLmJ1aWxkU2VjdXJlSW1hZ2VDb2RlQmxvY2soXG4gICAgICAgICAgICAgICAgdGhpcy51bmVzY2FwZUh0bWwocmVtb3RlUGF0aCksXG4gICAgICAgICAgICAgICAgdGhpcy51bmVzY2FwZUh0bWwoYWx0KSB8fCB0aGlzLnVuZXNjYXBlSHRtbChyZW1vdGVQYXRoKSxcbiAgICAgICAgICAgICAgKSxcbiAgICAgICAgICApXG4gICAgICAgICAgLnJlcGxhY2UoXG4gICAgICAgICAgICAvIVxcW1teXFxdXSpdXFwod2ViZGF2LXNlY3VyZTpcXC9cXC8oW14pXSspXFwpL2csXG4gICAgICAgICAgICAoX21hdGNoLCByZW1vdGVQYXRoOiBzdHJpbmcpID0+XG4gICAgICAgICAgICAgIHRoaXMuYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayh0aGlzLnVuZXNjYXBlSHRtbChyZW1vdGVQYXRoKSwgdGhpcy51bmVzY2FwZUh0bWwocmVtb3RlUGF0aCkpLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgaWYgKHVwZGF0ZWQgPT09IGNvbnRlbnQpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB1cGRhdGVkKTtcbiAgICAgICAgY2hhbmdlZEZpbGVzICs9IDE7XG4gICAgICB9XG5cbiAgICAgIGlmIChjaGFuZ2VkRmlsZXMgPT09IDApIHtcbiAgICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgICB0aGlzLnQoXG4gICAgICAgICAgICBcIlx1NjU3NFx1NUU5M1x1OTFDQ1x1NkNBMVx1NjcwOVx1NTNEMVx1NzNCMFx1NTNFRlx1OEZDMVx1NzlGQlx1NzY4NFx1NjVFN1x1NzI0OFx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NjgwN1x1N0I3RVx1MzAwMlwiLFxuICAgICAgICAgICAgXCJObyBsZWdhY3kgc2VjdXJlIGltYWdlIHRhZ3Mgd2VyZSBmb3VuZCBpbiB0aGUgdmF1bHQuXCIsXG4gICAgICAgICAgKSxcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5kZWxldGVMb2NhbEFmdGVyVXBsb2FkKSB7XG4gICAgICAgIGF3YWl0IHRoaXMudHJhc2hNaWdyYXRlZEltYWdlc0lmU2FmZShjYW5kaWRhdGVMb2NhbEltYWdlcyk7XG4gICAgICB9XG5cbiAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgIHRoaXMudChcbiAgICAgICAgICBgXHU1REYyXHU4RkMxXHU3OUZCICR7Y2hhbmdlZEZpbGVzfSBcdTdCQzdcdTdCMTRcdThCQjBcdTUyMzBcdTY1QjBcdTc2ODRcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTRFRTNcdTc4MDFcdTU3NTdcdTY4M0NcdTVGMEZcdTMwMDJgLFxuICAgICAgICAgIGBNaWdyYXRlZCAke2NoYW5nZWRGaWxlc30gbm90ZShzKSB0byB0aGUgbmV3IHNlY3VyZSBpbWFnZSBjb2RlLWJsb2NrIGZvcm1hdC5gLFxuICAgICAgICApLFxuICAgICAgICA4MDAwLFxuICAgICAgKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBtaWdyYXRlIHNlY3VyZSBpbWFnZXMgdG8gY29kZSBibG9ja3NcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU4RkMxXHU3OUZCXHU1Qjg5XHU1MTY4XHU1NkZFXHU3MjQ3XHU2ODNDXHU1RjBGXHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIG1pZ3JhdGUgc2VjdXJlIGltYWdlIGZvcm1hdFwiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHRyYXNoTWlncmF0ZWRJbWFnZXNJZlNhZmUoY2FuZGlkYXRlTG9jYWxJbWFnZXM6IE1hcDxzdHJpbmcsIFRGaWxlPikge1xuICAgIGlmIChjYW5kaWRhdGVMb2NhbEltYWdlcy5zaXplID09PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgcmVtYWluaW5nUmVmcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGZvciAoY29uc3Qgbm90ZSBvZiB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkpIHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKG5vdGUpO1xuICAgICAgY29uc3Qgd2lraU1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvIVxcW1xcWyhbXlxcXV0rKVxcXVxcXS9nKV07XG4gICAgICBjb25zdCBtYXJrZG93bk1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvIVxcW1teXFxdXSpdXFwoKFteKV0rKVxcKS9nKV07XG5cbiAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2Ygd2lraU1hdGNoZXMpIHtcbiAgICAgICAgY29uc3QgcmF3TGluayA9IG1hdGNoWzFdLnNwbGl0KFwifFwiKVswXS50cmltKCk7XG4gICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMucmVzb2x2ZUxpbmtlZEZpbGUocmF3TGluaywgbm90ZS5wYXRoKTtcbiAgICAgICAgaWYgKHRhcmdldCAmJiB0aGlzLmlzSW1hZ2VGaWxlKHRhcmdldCkpIHtcbiAgICAgICAgICByZW1haW5pbmdSZWZzLmFkZCh0YXJnZXQucGF0aCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXJrZG93bk1hdGNoZXMpIHtcbiAgICAgICAgY29uc3QgcmF3TGluayA9IGRlY29kZVVSSUNvbXBvbmVudChtYXRjaFsxXS50cmltKCkucmVwbGFjZSgvXjx8PiQvZywgXCJcIikpO1xuICAgICAgICBpZiAoL14oaHR0cHM/Onx3ZWJkYXYtc2VjdXJlOnxkYXRhOikvaS50ZXN0KHJhd0xpbmspKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGUucGF0aCk7XG4gICAgICAgIGlmICh0YXJnZXQgJiYgdGhpcy5pc0ltYWdlRmlsZSh0YXJnZXQpKSB7XG4gICAgICAgICAgcmVtYWluaW5nUmVmcy5hZGQodGFyZ2V0LnBhdGgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBbcGF0aCwgZmlsZV0gb2YgY2FuZGlkYXRlTG9jYWxJbWFnZXMuZW50cmllcygpKSB7XG4gICAgICBpZiAocmVtYWluaW5nUmVmcy5oYXMocGF0aCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMudHJhc2hJZkV4aXN0cyhmaWxlKTtcbiAgICB9XG4gIH1cblxyXG4gIHByaXZhdGUgYnVpbGRFcnJvckVsZW1lbnQocmVtb3RlUGF0aDogc3RyaW5nLCBlcnJvcjogdW5rbm93bikge1xyXG4gICAgY29uc3QgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgZWwuY2xhc3NOYW1lID0gXCJzZWN1cmUtd2ViZGF2LWltYWdlIGlzLWVycm9yXCI7XHJcbiAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xyXG4gICAgZWwudGV4dENvbnRlbnQgPSB0aGlzLnQoXHJcbiAgICAgIGBcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTUyQTBcdThGN0RcdTU5MzFcdThEMjVcdUZGMUEke3JlbW90ZVBhdGh9XHVGRjA4JHttZXNzYWdlfVx1RkYwOWAsXHJcbiAgICAgIGBTZWN1cmUgaW1hZ2UgZmFpbGVkOiAke3JlbW90ZVBhdGh9ICgke21lc3NhZ2V9KWAsXHJcbiAgICApO1xyXG4gICAgcmV0dXJuIGVsO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgcnVuQ29ubmVjdGlvblRlc3Qoc2hvd01vZGFsID0gZmFsc2UpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xyXG5cclxuICAgICAgY29uc3QgcHJvYmVOYW1lID0gYC5zZWN1cmUtd2ViZGF2LXByb2JlLSR7RGF0ZS5ub3coKX0udHh0YDtcclxuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRSZW1vdGVQYXRoKHByb2JlTmFtZSk7XHJcbiAgICAgIGNvbnN0IHVwbG9hZFVybCA9IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCk7XHJcbiAgICAgIGNvbnN0IHByb2JlQXJyYXlCdWZmZXIgPSB0aGlzLmVuY29kZVV0ZjgoYHNlY3VyZS13ZWJkYXYgcHJvYmUgJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCl9YCk7XG5cclxuICAgICAgY29uc3QgcHV0UmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xyXG4gICAgICAgIHVybDogdXBsb2FkVXJsLFxyXG4gICAgICAgIG1ldGhvZDogXCJQVVRcIixcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxyXG4gICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJ0ZXh0L3BsYWluOyBjaGFyc2V0PXV0Zi04XCIsXHJcbiAgICAgICAgfSxcclxuICAgICAgICBib2R5OiBwcm9iZUFycmF5QnVmZmVyLFxyXG4gICAgICB9KTtcclxuICAgICAgaWYgKHB1dFJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCBwdXRSZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBQVVQgZmFpbGVkIHdpdGggc3RhdHVzICR7cHV0UmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBnZXRSZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XHJcbiAgICAgICAgdXJsOiB1cGxvYWRVcmwsXHJcbiAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxyXG4gICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXHJcbiAgICAgICAgfSxcclxuICAgICAgfSk7XHJcbiAgICAgIGlmIChnZXRSZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgZ2V0UmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgR0VUIGZhaWxlZCB3aXRoIHN0YXR1cyAke2dldFJlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZGVsZXRlUmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xyXG4gICAgICAgIHVybDogdXBsb2FkVXJsLFxyXG4gICAgICAgIG1ldGhvZDogXCJERUxFVEVcIixcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0pO1xyXG4gICAgICBpZiAoZGVsZXRlUmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IGRlbGV0ZVJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYERFTEVURSBmYWlsZWQgd2l0aCBzdGF0dXMgJHtkZWxldGVSZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSB0aGlzLnQoXHJcbiAgICAgICAgYFdlYkRBViBcdTZENEJcdThCRDVcdTkwMUFcdThGQzdcdTMwMDJQVVQgJHtwdXRSZXNwb25zZS5zdGF0dXN9XHVGRjBDR0VUICR7Z2V0UmVzcG9uc2Uuc3RhdHVzfVx1RkYwQ0RFTEVURSAke2RlbGV0ZVJlc3BvbnNlLnN0YXR1c31cdTMwMDJgLFxyXG4gICAgICAgIGBXZWJEQVYgdGVzdCBwYXNzZWQuIFBVVCAke3B1dFJlc3BvbnNlLnN0YXR1c30sIEdFVCAke2dldFJlc3BvbnNlLnN0YXR1c30sIERFTEVURSAke2RlbGV0ZVJlc3BvbnNlLnN0YXR1c30uYCxcclxuICAgICAgKTtcclxuICAgICAgbmV3IE5vdGljZShtZXNzYWdlLCA2MDAwKTtcclxuICAgICAgaWYgKHNob3dNb2RhbCkge1xyXG4gICAgICAgIG5ldyBSZXN1bHRNb2RhbCh0aGlzLmFwcCwgdGhpcy50KFwiV2ViREFWIFx1OEZERVx1NjNBNVwiLCBcIldlYkRBViBDb25uZWN0aW9uXCIpLCBtZXNzYWdlKS5vcGVuKCk7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiU2VjdXJlIFdlYkRBViB0ZXN0IGZhaWxlZFwiLCBlcnJvcik7XHJcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSB0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiV2ViREFWIFx1NkQ0Qlx1OEJENVx1NTkzMVx1OEQyNVwiLCBcIldlYkRBViB0ZXN0IGZhaWxlZFwiKSwgZXJyb3IpO1xyXG4gICAgICBuZXcgTm90aWNlKG1lc3NhZ2UsIDgwMDApO1xyXG4gICAgICBpZiAoc2hvd01vZGFsKSB7XHJcbiAgICAgICAgbmV3IFJlc3VsdE1vZGFsKHRoaXMuYXBwLCB0aGlzLnQoXCJXZWJEQVYgXHU4RkRFXHU2M0E1XCIsIFwiV2ViREFWIENvbm5lY3Rpb25cIiksIG1lc3NhZ2UpLm9wZW4oKTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGRlc2NyaWJlRXJyb3IocHJlZml4OiBzdHJpbmcsIGVycm9yOiB1bmtub3duKSB7XHJcbiAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xyXG4gICAgcmV0dXJuIGAke3ByZWZpeH06ICR7bWVzc2FnZX1gO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyByZXF1ZXN0VXJsKG9wdGlvbnM6IHtcbiAgICB1cmw6IHN0cmluZztcbiAgICBtZXRob2Q6IHN0cmluZztcbiAgICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgICBib2R5PzogQXJyYXlCdWZmZXI7XG4gICAgZm9sbG93UmVkaXJlY3RzPzogYm9vbGVhbjtcbiAgICByZWRpcmVjdENvdW50PzogbnVtYmVyO1xuICB9KTogUHJvbWlzZTx7IHN0YXR1czogbnVtYmVyOyBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+OyBhcnJheUJ1ZmZlcjogQXJyYXlCdWZmZXIgfT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb2JzaWRpYW5SZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogb3B0aW9ucy51cmwsXG4gICAgICBtZXRob2Q6IG9wdGlvbnMubWV0aG9kLFxuICAgICAgaGVhZGVyczogb3B0aW9ucy5oZWFkZXJzLFxuICAgICAgYm9keTogb3B0aW9ucy5ib2R5LFxuICAgICAgdGhyb3c6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogcmVzcG9uc2Uuc3RhdHVzLFxuICAgICAgaGVhZGVyczogcmVzcG9uc2UuaGVhZGVycyxcbiAgICAgIGFycmF5QnVmZmVyOiByZXNwb25zZS5hcnJheUJ1ZmZlcixcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBlbmNvZGVVdGY4KHZhbHVlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBieXRlcyA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSh2YWx1ZSk7XG4gICAgcmV0dXJuIGJ5dGVzLmJ1ZmZlci5zbGljZShieXRlcy5ieXRlT2Zmc2V0LCBieXRlcy5ieXRlT2Zmc2V0ICsgYnl0ZXMuYnl0ZUxlbmd0aCkgYXMgQXJyYXlCdWZmZXI7XG4gIH1cblxuICBwcml2YXRlIGRlY29kZVV0ZjgoYnVmZmVyOiBBcnJheUJ1ZmZlcikge1xuICAgIHJldHVybiBuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoYnVmZmVyKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY29tcHV0ZVNoYTI1NkhleChidWZmZXI6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgZGlnZXN0ID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3QoXCJTSEEtMjU2XCIsIGJ1ZmZlcik7XG4gICAgcmV0dXJuIEFycmF5LmZyb20obmV3IFVpbnQ4QXJyYXkoZGlnZXN0KSlcbiAgICAgIC5tYXAoKHZhbHVlKSA9PiB2YWx1ZS50b1N0cmluZygxNikucGFkU3RhcnQoMiwgXCIwXCIpKVxuICAgICAgLmpvaW4oXCJcIik7XG4gIH1cbn1cblxyXG5jbGFzcyBTZWN1cmVXZWJkYXZSZW5kZXJDaGlsZCBleHRlbmRzIE1hcmtkb3duUmVuZGVyQ2hpbGQge1xuICBvbnVubG9hZCgpOiB2b2lkIHt9XG59XG5cbnR5cGUgVXBsb2FkUmV3cml0ZSA9IHtcbiAgb3JpZ2luYWw6IHN0cmluZztcbiAgcmV3cml0dGVuOiBzdHJpbmc7XG4gIHNvdXJjZUZpbGU/OiBURmlsZTtcbn07XG5cclxuY2xhc3MgU2VjdXJlV2ViZGF2U2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xyXG4gIHBsdWdpbjogU2VjdXJlV2ViZGF2SW1hZ2VzUGx1Z2luO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBTZWN1cmVXZWJkYXZJbWFnZXNQbHVnaW4pIHtcclxuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gIH1cclxuXHJcbiAgZGlzcGxheSgpOiB2b2lkIHtcclxuICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XHJcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xyXG5cclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIlNlY3VyZSBXZWJEQVYgSW1hZ2VzXCIgfSk7XG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJwXCIsIHtcbiAgICAgIHRleHQ6IHRoaXMucGx1Z2luLnQoXG4gICAgICAgIFwiXHU4RkQ5XHU0RTJBXHU2M0QyXHU0RUY2XHU1M0VBXHU2MjhBXHU1NkZFXHU3MjQ3XHU1MjY1XHU3OUJCXHU1MjMwXHU1MzU1XHU3MkVDXHU3Njg0XHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHVGRjBDXHU1RTc2XHU0RkREXHU1QjU4XHU0RTNBIHNlY3VyZS13ZWJkYXYgXHU4MUVBXHU1QjlBXHU0RTQ5XHU0RUUzXHU3ODAxXHU1NzU3XHVGRjFCXHU1MTc2XHU0RUQ2XHU3QjE0XHU4QkIwXHU1NDhDXHU5NjQ0XHU0RUY2XHU2MzA5XHU1MzlGXHU4REVGXHU1Rjg0XHU1MzlGXHU2ODM3XHU1NDBDXHU2QjY1XHUzMDAyXCIsXG4gICAgICAgIFwiVGhpcyBwbHVnaW4gc2VwYXJhdGVzIG9ubHkgaW1hZ2VzIGludG8gYSBkZWRpY2F0ZWQgcmVtb3RlIGZvbGRlciBhbmQgc3RvcmVzIHRoZW0gYXMgc2VjdXJlLXdlYmRhdiBjdXN0b20gY29kZSBibG9ja3MuIE5vdGVzIGFuZCBvdGhlciBhdHRhY2htZW50cyBhcmUgc3luY2VkIGFzLWlzIHdpdGggdGhlaXIgb3JpZ2luYWwgcGF0aHMuXCIsXG4gICAgICApLFxuICAgIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU1RjUzXHU1MjREXHU2M0QyXHU0RUY2XHU3MjQ4XHU2NzJDXCIsIFwiQ3VycmVudCBwbHVnaW4gdmVyc2lvblwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU1OTFBXHU3QUVGXHU0RjdGXHU3NTI4XHU2NUY2XHU1M0VGXHU1MTQ4XHU2ODM4XHU1QkY5XHU4RkQ5XHU5MUNDXHU3Njg0XHU3MjQ4XHU2NzJDXHU1M0Y3XHVGRjBDXHU5MDdGXHU1MTREXHU1NkUwXHU0RTNBXHU1QkEyXHU2MjM3XHU3QUVGXHU1MzQ3XHU3RUE3XHU0RTBEXHU1MjMwXHU0RjREXHU1QkZDXHU4MUY0XHU4ODRDXHU0RTNBXHU0RTBEXHU0RTAwXHU4MUY0XHUzMDAyXCIsXG4gICAgICAgICAgXCJDaGVjayB0aGlzIHZlcnNpb24gZmlyc3QgYWNyb3NzIGRldmljZXMgdG8gYXZvaWQgaW5jb25zaXN0ZW50IGJlaGF2aW9yIGNhdXNlZCBieSBpbmNvbXBsZXRlIHVwZ3JhZGVzLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+IHtcbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5tYW5pZmVzdC52ZXJzaW9uKTtcbiAgICAgICAgdGV4dC5zZXREaXNhYmxlZCh0cnVlKTtcbiAgICAgIH0pO1xuXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMucGx1Z2luLnQoXCJcdTc1NENcdTk3NjJcdThCRURcdThBMDBcIiwgXCJJbnRlcmZhY2UgbGFuZ3VhZ2VcIikgfSk7XG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4QkVEXHU4QTAwXCIsIFwiTGFuZ3VhZ2VcIikpXG4gICAgICAuc2V0RGVzYyh0aGlzLnBsdWdpbi50KFwiXHU4QkJFXHU3RjZFXHU5ODc1XHU2NTJGXHU2MzAxXHU4MUVBXHU1MkE4XHUzMDAxXHU0RTJEXHU2NTg3XHUzMDAxXHU4MkYxXHU2NTg3XHU1MjA3XHU2MzYyXHUzMDAyXCIsIFwiU3dpdGNoIHRoZSBzZXR0aW5ncyBVSSBiZXR3ZWVuIGF1dG8sIENoaW5lc2UsIGFuZCBFbmdsaXNoLlwiKSlcclxuICAgICAgLmFkZERyb3Bkb3duKChkcm9wZG93bikgPT5cclxuICAgICAgICBkcm9wZG93blxyXG4gICAgICAgICAgLmFkZE9wdGlvbihcImF1dG9cIiwgdGhpcy5wbHVnaW4udChcIlx1ODFFQVx1NTJBOFwiLCBcIkF1dG9cIikpXG4gICAgICAgICAgLmFkZE9wdGlvbihcInpoXCIsIFwiXHU0RTJEXHU2NTg3XCIpXG4gICAgICAgICAgLmFkZE9wdGlvbihcImVuXCIsIFwiRW5nbGlzaFwiKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5sYW5ndWFnZSlcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmxhbmd1YWdlID0gdmFsdWUgYXMgXCJhdXRvXCIgfCBcInpoXCIgfCBcImVuXCI7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgIH0pLFxuICAgICAgKTtcclxuXHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy5wbHVnaW4udChcIlx1OEZERVx1NjNBNVx1OEJCRVx1N0Y2RVwiLCBcIkNvbm5lY3Rpb25cIikgfSk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiV2ViREFWIFx1NTdGQVx1Nzg0MFx1NTczMFx1NTc0MFwiLCBcIldlYkRBViBiYXNlIFVSTFwiKSlcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdTY3MERcdTUyQTFcdTU2NjhcdTU3RkFcdTc4NDBcdTU3MzBcdTU3NDBcdUZGMENcdTRGOEJcdTU5ODJcdUZGMUFodHRwOi8veW91ci13ZWJkYXYtaG9zdDpwb3J0XCIsIFwiQmFzZSBzZXJ2ZXIgVVJMLiBFeGFtcGxlOiBodHRwOi8veW91ci13ZWJkYXYtaG9zdDpwb3J0XCIpKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJodHRwOi8veW91ci13ZWJkYXYtaG9zdDpwb3J0XCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLndlYmRhdlVybClcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy53ZWJkYXZVcmwgPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KSxcbiAgICAgICk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdThEMjZcdTUzRjdcIiwgXCJVc2VybmFtZVwiKSlcclxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XHJcbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VybmFtZSkub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VybmFtZSA9IHZhbHVlLnRyaW0oKTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgIH0pLFxyXG4gICAgICApO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU1QkM2XHU3ODAxXCIsIFwiUGFzc3dvcmRcIikpXHJcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdTlFRDhcdThCQTRcdTk2OTBcdTg1Q0ZcdUZGMENcdTUzRUZcdTcwQjlcdTUxRkJcdTUzRjNcdTRGQTdcdTYzMDlcdTk0QUVcdTY2M0VcdTc5M0FcdTYyMTZcdTk2OTBcdTg1Q0ZcdTMwMDJcIiwgXCJIaWRkZW4gYnkgZGVmYXVsdC4gVXNlIHRoZSBidXR0b24gb24gdGhlIHJpZ2h0IHRvIHNob3cgb3IgaGlkZSBpdC5cIikpXHJcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PiB7XHJcbiAgICAgICAgdGV4dC5pbnB1dEVsLnR5cGUgPSBcInBhc3N3b3JkXCI7XHJcbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXNzd29yZCkub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXNzd29yZCA9IHZhbHVlO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5hZGRFeHRyYUJ1dHRvbigoYnV0dG9uKSA9PiB7XHJcbiAgICAgICAgbGV0IHZpc2libGUgPSBmYWxzZTtcclxuICAgICAgICBidXR0b24uc2V0SWNvbihcImV5ZVwiKTtcclxuICAgICAgICBidXR0b24uc2V0VG9vbHRpcCh0aGlzLnBsdWdpbi50KFwiXHU2NjNFXHU3OTNBXHU1QkM2XHU3ODAxXCIsIFwiU2hvdyBwYXNzd29yZFwiKSk7XHJcbiAgICAgICAgYnV0dG9uLm9uQ2xpY2soKCkgPT4ge1xyXG4gICAgICAgICAgY29uc3QgaW5wdXQgPSBidXR0b24uZXh0cmFTZXR0aW5nc0VsLnBhcmVudEVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3IoXCJpbnB1dFwiKTtcclxuICAgICAgICAgIGlmICghKGlucHV0IGluc3RhbmNlb2YgSFRNTElucHV0RWxlbWVudCkpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIHZpc2libGUgPSAhdmlzaWJsZTtcclxuICAgICAgICAgIGlucHV0LnR5cGUgPSB2aXNpYmxlID8gXCJ0ZXh0XCIgOiBcInBhc3N3b3JkXCI7XHJcbiAgICAgICAgICBidXR0b24uc2V0SWNvbih2aXNpYmxlID8gXCJleWUtb2ZmXCIgOiBcImV5ZVwiKTtcclxuICAgICAgICAgIGJ1dHRvbi5zZXRUb29sdGlwKHRoaXMucGx1Z2luLnQodmlzaWJsZSA/IFwiXHU5NjkwXHU4NUNGXHU1QkM2XHU3ODAxXCIgOiBcIlx1NjYzRVx1NzkzQVx1NUJDNlx1NzgwMVwiLCB2aXNpYmxlID8gXCJIaWRlIHBhc3N3b3JkXCIgOiBcIlNob3cgcGFzc3dvcmRcIikpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTU2RkVcdTcyNDdcdThGRENcdTdBMEJcdTc2RUVcdTVGNTVcIiwgXCJJbWFnZSByZW1vdGUgZm9sZGVyXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTRFMTNcdTk1RThcdTc1MjhcdTRFOEVcdTVCNThcdTY1M0VcdThGRENcdTdBMEJcdTU2RkVcdTcyNDdcdTc2ODQgV2ViREFWIFx1NzZFRVx1NUY1NVx1RkYwQ1x1NEY4Qlx1NTk4Mlx1RkYxQS9yZW1vdGUtaW1hZ2VzL1x1MzAwMlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NjIxMFx1NTI5Rlx1NTQwRVx1NEYxQVx1N0FDQlx1NTM3M1x1NTIyMFx1OTY2NFx1NjcyQ1x1NTczMFx1NTZGRVx1NzI0N1x1NjU4N1x1NEVGNlx1MzAwMlwiLFxuICAgICAgICAgIFwiRGVkaWNhdGVkIFdlYkRBViBmb2xkZXIgZm9yIHJlbW90ZSBpbWFnZXMsIGZvciBleGFtcGxlOiAvcmVtb3RlLWltYWdlcy8uIExvY2FsIGltYWdlIGZpbGVzIGFyZSBkZWxldGVkIGltbWVkaWF0ZWx5IGFmdGVyIHVwbG9hZCBzdWNjZWVkcy5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnJlbW90ZUZvbGRlcikub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmVtb3RlRm9sZGVyID0gbm9ybWFsaXplUGF0aCh2YWx1ZS50cmltKCkgfHwgXCIvcmVtb3RlLWltYWdlcy9cIik7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pLFxuICAgICAgKTtcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTZENEJcdThCRDVcdThGREVcdTYzQTVcIiwgXCJUZXN0IGNvbm5lY3Rpb25cIikpXHJcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdTRGN0ZcdTc1MjhcdTRFMzRcdTY1RjZcdTYzQTJcdTk0ODhcdTY1ODdcdTRFRjZcdTlBOENcdThCQzEgUFVUXHUzMDAxR0VUXHUzMDAxREVMRVRFIFx1NjYyRlx1NTQyNlx1NkI2M1x1NUUzOFx1MzAwMlwiLCBcIlZlcmlmeSBQVVQsIEdFVCwgYW5kIERFTEVURSB1c2luZyBhIHRlbXBvcmFyeSBwcm9iZSBmaWxlLlwiKSlcclxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxyXG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KHRoaXMucGx1Z2luLnQoXCJcdTVGMDBcdTU5Q0JcdTZENEJcdThCRDVcIiwgXCJSdW4gdGVzdFwiKSkub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XHJcbiAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5ydW5Db25uZWN0aW9uVGVzdCh0cnVlKTtcclxuICAgICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZChmYWxzZSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSksXHJcbiAgICAgICk7XHJcblxyXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMucGx1Z2luLnQoXCJcdTU0MENcdTZCNjVcdThCQkVcdTdGNkVcIiwgXCJTeW5jXCIpIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4RkRDXHU3QTBCXHU3QjE0XHU4QkIwXHU3NkVFXHU1RjU1XCIsIFwiUmVtb3RlIG5vdGVzIGZvbGRlclwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU3NTI4XHU0RThFXHU1QjU4XHU2NTNFXHU3QjE0XHU4QkIwXHU1NDhDXHU1MTc2XHU0RUQ2XHU5NzVFXHU1NkZFXHU3MjQ3XHU5NjQ0XHU0RUY2XHU1MzlGXHU2ODM3XHU1NDBDXHU2QjY1XHU1MjZGXHU2NzJDXHU3Njg0XHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHVGRjBDXHU0RjhCXHU1OTgyXHVGRjFBL3ZhdWx0LXN5bmMvXHUzMDAyXHU2M0QyXHU0RUY2XHU0RjFBXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU2NTc0XHU0RTJBIHZhdWx0XHVGRjBDXHU1RTc2XHU4REYzXHU4RkM3IC5vYnNpZGlhblx1MzAwMVx1NjNEMlx1NEVGNlx1NzZFRVx1NUY1NVx1NTQ4Q1x1NTZGRVx1NzI0N1x1NjU4N1x1NEVGNlx1MzAwMlwiLFxuICAgICAgICAgIFwiUmVtb3RlIGZvbGRlciB1c2VkIGZvciBub3RlcyBhbmQgb3RoZXIgbm9uLWltYWdlIGF0dGFjaG1lbnRzIHN5bmNlZCBhcy1pcywgZm9yIGV4YW1wbGU6IC92YXVsdC1zeW5jLy4gVGhlIHBsdWdpbiBzeW5jcyB0aGUgd2hvbGUgdmF1bHQgYW5kIGF1dG9tYXRpY2FsbHkgc2tpcHMgLm9ic2lkaWFuLCB0aGUgcGx1Z2luIGRpcmVjdG9yeSwgYW5kIGltYWdlIGZpbGVzLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIgPSBub3JtYWxpemVQYXRoKHZhbHVlLnRyaW0oKSB8fCBcIi92YXVsdC1zeW5jL1wiKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU5ODkxXHU3Mzg3XCIsIFwiQXV0byBzeW5jIGZyZXF1ZW5jeVwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU0RUU1XHU1MjA2XHU5NDlGXHU0RTNBXHU1MzU1XHU0RjREXHU4QkJFXHU3RjZFXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU2NUY2XHU5NUY0XHUzMDAyXHU1ODZCIDAgXHU4ODY4XHU3OTNBXHU1MTczXHU5NUVEXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHUzMDAyXHU4RkQ5XHU5MUNDXHU3Njg0XHU1NDBDXHU2QjY1XHU2NjJGXHUyMDFDXHU1QkY5XHU4RDI2XHU1NDBDXHU2QjY1XHUyMDFEXHVGRjFBXHU0RjFBXHU2OEMwXHU2N0U1XHU2NzJDXHU1NzMwXHU0RTBFXHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHU1REVFXHU1RjAyXHVGRjBDXHU4ODY1XHU0RjIwXHU2NUIwXHU1ODlFXHU1NDhDXHU1M0Q4XHU2NkY0XHU2NTg3XHU0RUY2XHVGRjBDXHU1RTc2XHU1MjIwXHU5NjY0XHU4RkRDXHU3QUVGXHU1OTFBXHU0RjU5XHU1MTg1XHU1QkI5XHUzMDAyXCIsXG4gICAgICAgICAgXCJTZXQgdGhlIGF1dG9tYXRpYyBzeW5jIGludGVydmFsIGluIG1pbnV0ZXMuIFVzZSAwIHRvIHR1cm4gaXQgb2ZmLiBUaGlzIGlzIGEgcmVjb25jaWxpYXRpb24gc3luYzogaXQgY2hlY2tzIGxvY2FsIGFuZCByZW1vdGUgZGlmZmVyZW5jZXMsIHVwbG9hZHMgbmV3IG9yIGNoYW5nZWQgZmlsZXMsIGFuZCByZW1vdmVzIGV4dHJhIHJlbW90ZSBjb250ZW50LlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCIwXCIpXG4gICAgICAgICAgLnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvU3luY0ludGVydmFsTWludXRlcykpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gTnVtYmVyLnBhcnNlSW50KHZhbHVlLCAxMCk7XG4gICAgICAgICAgICBpZiAoIU51bWJlci5pc05hTihwYXJzZWQpKSB7XG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzID0gTWF0aC5tYXgoMCwgcGFyc2VkKTtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU3QjE0XHU4QkIwXHU2NzJDXHU1NzMwXHU0RkREXHU3NTU5XHU2QTIxXHU1RjBGXCIsIFwiTm90ZSBsb2NhbCByZXRlbnRpb24gbW9kZVwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU1QjhDXHU2NTc0XHU2NzJDXHU1NzMwXHVGRjFBXHU3QjE0XHU4QkIwXHU1OUNCXHU3RUM4XHU0RkREXHU3NTU5XHU1NzI4XHU2NzJDXHU1NzMwXHUzMDAyXHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXHVGRjFBXHU5NTdGXHU2NzFGXHU2NzJBXHU4QkJGXHU5NUVFXHU3Njg0IE1hcmtkb3duIFx1N0IxNFx1OEJCMFx1NEYxQVx1ODhBQlx1NjZGRlx1NjM2Mlx1NEUzQVx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1NjU4N1x1NEVGNlx1RkYwQ1x1NjI1M1x1NUYwMFx1NjVGNlx1NTE4RFx1NEVDRVx1OEZEQ1x1N0FFRlx1NjA2Mlx1NTkwRFx1MzAwMlwiLFxuICAgICAgICAgIFwiRnVsbCBsb2NhbDogbm90ZXMgYWx3YXlzIHN0YXkgbG9jYWwuIExhenkgbm90ZXM6IHN0YWxlIE1hcmtkb3duIG5vdGVzIGFyZSByZXBsYWNlZCB3aXRoIGxvY2FsIHBsYWNlaG9sZGVyIGZpbGVzIGFuZCByZXN0b3JlZCBmcm9tIHJlbW90ZSB3aGVuIG9wZW5lZC5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGREcm9wZG93bigoZHJvcGRvd24pID0+XG4gICAgICAgIGRyb3Bkb3duXG4gICAgICAgICAgLmFkZE9wdGlvbihcImZ1bGwtbG9jYWxcIiwgdGhpcy5wbHVnaW4udChcIlx1NUI4Q1x1NjU3NFx1NjcyQ1x1NTczMFwiLCBcIkZ1bGwgbG9jYWxcIikpXG4gICAgICAgICAgLmFkZE9wdGlvbihcImxhenktbm90ZXNcIiwgdGhpcy5wbHVnaW4udChcIlx1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFwiLCBcIkxhenkgbm90ZXNcIikpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVTdG9yYWdlTW9kZSlcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlU3RvcmFnZU1vZGUgPSB2YWx1ZSBhcyBcImZ1bGwtbG9jYWxcIiB8IFwibGF6eS1ub3Rlc1wiO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU3QjE0XHU4QkIwXHU2NzJDXHU1NzMwXHU1NkRFXHU2NTM2XHU1OTI5XHU2NTcwXCIsIFwiTm90ZSBldmljdGlvbiBkYXlzXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTRFQzVcdTU3MjhcdTIwMUNcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTdCMTRcdThCQjBcdTIwMURcdTZBMjFcdTVGMEZcdTRFMEJcdTc1MUZcdTY1NDhcdTMwMDJcdThEODVcdThGQzdcdThGRDlcdTRFMkFcdTU5MjlcdTY1NzBcdTY3MkFcdTYyNTNcdTVGMDBcdTc2ODQgTWFya2Rvd24gXHU3QjE0XHU4QkIwXHVGRjBDXHU0RjFBXHU1NzI4XHU1NDBDXHU2QjY1XHU1NDBFXHU4OEFCXHU2NkZGXHU2MzYyXHU0RTNBXHU2NzJDXHU1NzMwXHU1MzYwXHU0RjREXHU2NTg3XHU0RUY2XHUzMDAyXCIsXG4gICAgICAgICAgXCJVc2VkIG9ubHkgaW4gbGF6eSBub3RlIG1vZGUuIE1hcmtkb3duIG5vdGVzIG5vdCBvcGVuZWQgd2l0aGluIHRoaXMgbnVtYmVyIG9mIGRheXMgYXJlIHJlcGxhY2VkIHdpdGggbG9jYWwgcGxhY2Vob2xkZXIgZmlsZXMgYWZ0ZXIgc3luYy5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiMzBcIilcbiAgICAgICAgICAuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVFdmljdEFmdGVyRGF5cykpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gTnVtYmVyLnBhcnNlSW50KHZhbHVlLCAxMCk7XG4gICAgICAgICAgICBpZiAoIU51bWJlci5pc05hTihwYXJzZWQpKSB7XG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVFdmljdEFmdGVyRGF5cyA9IE1hdGgubWF4KDEsIHBhcnNlZCk7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NTQwQ1x1NkI2NVx1NzJCNlx1NjAwMVwiLCBcIlN5bmMgc3RhdHVzXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgYCR7dGhpcy5wbHVnaW4uZm9ybWF0TGFzdFN5bmNMYWJlbCgpfVxcbiR7dGhpcy5wbHVnaW4uZm9ybWF0U3luY1N0YXR1c0xhYmVsKCl9XFxuJHt0aGlzLnBsdWdpbi50KFwiXHU4QkY0XHU2NjBFXHVGRjFBXHU3QUNCXHU1MzczXHU1NDBDXHU2QjY1XHU0RjFBXHU2MjY3XHU4ODRDXHU2NzJDXHU1NzMwXHU0RTBFXHU4RkRDXHU3QUVGXHU3Njg0XHU1QkY5XHU4RDI2XHVGRjBDXHU1NDBDXHU2QjY1XHU3QjE0XHU4QkIwXHU0RTBFXHU5NzVFXHU1NkZFXHU3MjQ3XHU5NjQ0XHU0RUY2XHVGRjBDXHU1RTc2XHU2RTA1XHU3NDA2XHU4RkRDXHU3QUVGXHU1MTk3XHU0RjU5XHU2NTg3XHU0RUY2XHUzMDAyXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU0RUNEXHU3NTMxXHU3MkVDXHU3QUNCXHU5NjFGXHU1MjE3XHU1OTA0XHU3NDA2XHUzMDAyXCIsIFwiTm90ZTogU3luYyBub3cgcmVjb25jaWxlcyBsb2NhbCBhbmQgcmVtb3RlIGNvbnRlbnQsIHN5bmNzIG5vdGVzIGFuZCBub24taW1hZ2UgYXR0YWNobWVudHMsIGFuZCBjbGVhbnMgZXh0cmEgcmVtb3RlIGZpbGVzLiBJbWFnZSB1cGxvYWRzIGNvbnRpbnVlIHRvIGJlIGhhbmRsZWQgYnkgdGhlIHNlcGFyYXRlIHF1ZXVlLlwiKX1gLFxuICAgICAgICAgIGAke3RoaXMucGx1Z2luLmZvcm1hdExhc3RTeW5jTGFiZWwoKX1cXG4ke3RoaXMucGx1Z2luLmZvcm1hdFN5bmNTdGF0dXNMYWJlbCgpfVxcbiR7dGhpcy5wbHVnaW4udChcIlx1OEJGNFx1NjYwRVx1RkYxQVx1N0FDQlx1NTM3M1x1NTQwQ1x1NkI2NVx1NEYxQVx1NjI2N1x1ODg0Q1x1NjcyQ1x1NTczMFx1NEUwRVx1OEZEQ1x1N0FFRlx1NzY4NFx1NUJGOVx1OEQyNlx1RkYwQ1x1NTQwQ1x1NkI2NVx1N0IxNFx1OEJCMFx1NEUwRVx1OTc1RVx1NTZGRVx1NzI0N1x1OTY0NFx1NEVGNlx1RkYwQ1x1NUU3Nlx1NkUwNVx1NzQwNlx1OEZEQ1x1N0FFRlx1NTE5N1x1NEY1OVx1NjU4N1x1NEVGNlx1MzAwMlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NEVDRFx1NzUzMVx1NzJFQ1x1N0FDQlx1OTYxRlx1NTIxN1x1NTkwNFx1NzQwNlx1MzAwMlwiLCBcIk5vdGU6IFN5bmMgbm93IHJlY29uY2lsZXMgbG9jYWwgYW5kIHJlbW90ZSBjb250ZW50LCBzeW5jcyBub3RlcyBhbmQgbm9uLWltYWdlIGF0dGFjaG1lbnRzLCBhbmQgY2xlYW5zIGV4dHJhIHJlbW90ZSBmaWxlcy4gSW1hZ2UgdXBsb2FkcyBjb250aW51ZSB0byBiZSBoYW5kbGVkIGJ5IHRoZSBzZXBhcmF0ZSBxdWV1ZS5cIil9YCxcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodGhpcy5wbHVnaW4udChcIlx1N0FDQlx1NTM3M1x1NTQwQ1x1NkI2NVwiLCBcIlN5bmMgbm93XCIpKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50KHRydWUpO1xuICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZChmYWxzZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy5wbHVnaW4udChcIlx1NEUwMFx1NkIyMVx1NjAyN1x1NURFNVx1NTE3N1wiLCBcIk9uZS10aW1lIHRvb2xzXCIpIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4RkMxXHU3OUZCXHU2NTc0XHU1RTkzXHU1MzlGXHU3NTFGXHU1NkZFXHU3MjQ3XHU1RjE1XHU3NTI4XCIsIFwiTWlncmF0ZSBuYXRpdmUgaW1hZ2UgZW1iZWRzIGluIHZhdWx0XCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTYyNkJcdTYzQ0ZcdTY1NzRcdTVFOTNcdTYyNDBcdTY3MDkgTWFya2Rvd24gXHU3QjE0XHU4QkIwXHVGRjBDXHU2MjhBIE9ic2lkaWFuIFx1NTM5Rlx1NzUxRlx1NjcyQ1x1NTczMFx1NTZGRVx1NzI0N1x1NUYxNVx1NzUyOFx1RkYwOFx1NTk4MiAhW10oKSBcdTU0OEMgIVtbLi4uXV1cdUZGMDlcdTRFMEFcdTRGMjBcdTUyMzBcdThGRENcdTdBRUZcdTU2RkVcdTcyNDdcdTc2RUVcdTVGNTVcdUZGMENcdTVFNzZcdTY1MzlcdTUxOTlcdTRFM0Egc2VjdXJlLXdlYmRhdiBcdTRFRTNcdTc4MDFcdTU3NTdcdTMwMDJcdTY1RTdcdTcyNDggc3BhbiBcdTU0OENcdTY1RTlcdTY3MUYgd2ViZGF2LXNlY3VyZSBcdTk0RkVcdTYzQTVcdTRFNUZcdTRGMUFcdTRFMDBcdTVFNzZcdTY1MzZcdTY1NUJcdTUyMzBcdTY1QjBcdTY4M0NcdTVGMEZcdTMwMDJcIixcbiAgICAgICAgICBcIlNjYW4gYWxsIE1hcmtkb3duIG5vdGVzIGluIHRoZSB2YXVsdCwgdXBsb2FkIG5hdGl2ZSBsb2NhbCBpbWFnZSBlbWJlZHMgKHN1Y2ggYXMgIVtdKCkgYW5kICFbWy4uLl1dKSB0byB0aGUgcmVtb3RlIGltYWdlIGZvbGRlciwgYW5kIHJld3JpdGUgdGhlbSBhcyBzZWN1cmUtd2ViZGF2IGNvZGUgYmxvY2tzLiBMZWdhY3kgc3BhbiB0YWdzIGFuZCBlYXJseSB3ZWJkYXYtc2VjdXJlIGxpbmtzIGFyZSBhbHNvIG5vcm1hbGl6ZWQgdG8gdGhlIG5ldyBmb3JtYXQuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KHRoaXMucGx1Z2luLnQoXCJcdTVGMDBcdTU5Q0JcdThGQzFcdTc5RkJcIiwgXCJSdW4gbWlncmF0aW9uXCIpKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLm1pZ3JhdGVBbGxMZWdhY3lTZWN1cmVJbWFnZXMoKTtcbiAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKGZhbHNlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgfVxufVxuXHJcbmNsYXNzIFJlc3VsdE1vZGFsIGV4dGVuZHMgTW9kYWwge1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgdGl0bGVUZXh0OiBzdHJpbmc7XHJcbiAgcHJpdmF0ZSByZWFkb25seSBib2R5VGV4dDogc3RyaW5nO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgdGl0bGVUZXh0OiBzdHJpbmcsIGJvZHlUZXh0OiBzdHJpbmcpIHtcclxuICAgIHN1cGVyKGFwcCk7XHJcbiAgICB0aGlzLnRpdGxlVGV4dCA9IHRpdGxlVGV4dDtcclxuICAgIHRoaXMuYm9keVRleHQgPSBib2R5VGV4dDtcclxuICB9XHJcblxyXG4gIG9uT3BlbigpOiB2b2lkIHtcclxuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgY29udGVudEVsLmVtcHR5KCk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMudGl0bGVUZXh0IH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IHRoaXMuYm9keVRleHQgfSk7XHJcbiAgfVxyXG5cclxuICBvbkNsb3NlKCk6IHZvaWQge1xyXG4gICAgdGhpcy5jb250ZW50RWwuZW1wdHkoKTtcclxuICB9XHJcbn1cclxuXHJcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFDLHNCQWdCTTtBQWlFUCxJQUFNLG1CQUF5QztBQUFBLEVBQzdDLFdBQVc7QUFBQSxFQUNYLFVBQVU7QUFBQSxFQUNWLFVBQVU7QUFBQSxFQUNWLGNBQWM7QUFBQSxFQUNkLHVCQUF1QjtBQUFBLEVBQ3ZCLGdCQUFnQjtBQUFBLEVBQ2hCLHdCQUF3QjtBQUFBLEVBQ3hCLFVBQVU7QUFBQSxFQUNWLGlCQUFpQjtBQUFBLEVBQ2pCLG9CQUFvQjtBQUFBLEVBQ3BCLHlCQUF5QjtBQUFBLEVBQ3pCLGtCQUFrQjtBQUFBLEVBQ2xCLG1CQUFtQjtBQUFBLEVBQ25CLDhCQUE4QjtBQUFBLEVBQzlCLGdCQUFnQjtBQUFBLEVBQ2hCLHFCQUFxQjtBQUFBLEVBQ3JCLG1CQUFtQjtBQUFBLEVBQ25CLGFBQWE7QUFDZjtBQUVBLElBQU0sa0JBQWtCO0FBQ3hCLElBQU0sb0JBQW9CO0FBQzFCLElBQU0sbUJBQW1CO0FBRXpCLElBQXFCLDJCQUFyQixjQUFzRCx1QkFBTztBQUFBLEVBQTdEO0FBQUE7QUFDRSxvQkFBaUM7QUFDakMsaUJBQXNCLENBQUM7QUFDdkIsU0FBUSxXQUFXLG9CQUFJLElBQVk7QUFDbkMsU0FBUSxvQkFBb0Isb0JBQUksSUFBWTtBQUM1QyxTQUFRLGdCQUFnQixvQkFBSSxJQUFvQjtBQUNoRCxTQUFRLGlCQUFpQixvQkFBSSxJQUF5QjtBQUN0RCxTQUFRLHdCQUF3QixvQkFBSSxJQUFZO0FBQ2hELFNBQVEsdUJBQXVCLG9CQUFJLElBQW9CO0FBQ3ZELFNBQVEsWUFBWSxvQkFBSSxJQUE0QjtBQUNwRCxTQUFRLHlCQUF5QixvQkFBSSxJQUFxQztBQUMxRSxTQUFRLHNCQUFzQixvQkFBSSxJQUEyQjtBQUM3RCxTQUFRLCtCQUErQixvQkFBSSxJQUFtQjtBQUM5RCxTQUFRLDJCQUEyQixvQkFBSSxJQUFvQjtBQUMzRCxTQUFRLDRCQUE0QixvQkFBSSxJQUFZO0FBQ3BELFNBQVEsa0JBQWtCO0FBQzFCLFNBQVEsc0JBQXNCO0FBQzlCLFNBQVEsaUJBQWlCO0FBQ3pCLFNBQVEseUJBQXlCO0FBRWpDLFNBQWlCLHVCQUF1QjtBQUN4QyxTQUFpQixpQ0FBaUM7QUFBQTtBQUFBLEVBRWxELE1BQU0sU0FBUztBQUNiLFVBQU0sS0FBSyxnQkFBZ0I7QUFFM0IsU0FBSyxjQUFjLElBQUksdUJBQXVCLEtBQUssS0FBSyxJQUFJLENBQUM7QUFFN0QsU0FBSyxXQUFXO0FBQUEsTUFDZCxJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsTUFDTixlQUFlLENBQUMsYUFBYTtBQUMzQixjQUFNLE9BQU8sS0FBSyxJQUFJLFVBQVUsY0FBYztBQUM5QyxZQUFJLENBQUMsTUFBTTtBQUNULGlCQUFPO0FBQUEsUUFDVDtBQUVBLFlBQUksQ0FBQyxVQUFVO0FBQ2IsZUFBSyxLQUFLLG1CQUFtQixJQUFJO0FBQUEsUUFDbkM7QUFFQSxlQUFPO0FBQUEsTUFDVDtBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssV0FBVztBQUFBLE1BQ2QsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLE1BQ04sVUFBVSxNQUFNO0FBQ2QsYUFBSyxLQUFLLGtCQUFrQixJQUFJO0FBQUEsTUFDbEM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLFdBQVc7QUFBQSxNQUNkLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFVBQVUsTUFBTTtBQUNkLGFBQUssS0FBSyxjQUFjO0FBQUEsTUFDMUI7QUFBQSxJQUNGLENBQUM7QUFFRCxVQUFNLFNBQVMsS0FBSyxjQUFjLGNBQWMsS0FBSyxFQUFFLHlDQUFnQixvQkFBb0IsR0FBRyxNQUFNO0FBQ2xHLFdBQUssS0FBSyxjQUFjO0FBQUEsSUFDMUIsQ0FBQztBQUNELFdBQU8sU0FBUywyQkFBMkI7QUFFM0MsU0FBSyw4QkFBOEIsQ0FBQyxJQUFJLFFBQVE7QUFDOUMsV0FBSyxLQUFLLG9CQUFvQixJQUFJLEdBQUc7QUFBQSxJQUN2QyxDQUFDO0FBQ0QsU0FBSyxtQ0FBbUMsbUJBQW1CLENBQUMsUUFBUSxJQUFJLFFBQVE7QUFDOUUsV0FBSyxLQUFLLHVCQUF1QixRQUFRLElBQUksR0FBRztBQUFBLElBQ2xELENBQUM7QUFFRCxTQUFLO0FBQUEsTUFDSCxLQUFLLElBQUksVUFBVSxHQUFHLGFBQWEsQ0FBQyxTQUFTO0FBQzNDLGFBQUssS0FBSyxlQUFlLElBQUk7QUFBQSxNQUMvQixDQUFDO0FBQUEsSUFDSDtBQUVBLFNBQUs7QUFBQSxNQUNILEtBQUssSUFBSSxVQUFVLEdBQUcsZ0JBQWdCLENBQUMsS0FBSyxRQUFRLFNBQVM7QUFDM0QsYUFBSyxLQUFLLGtCQUFrQixLQUFLLFFBQVEsSUFBSTtBQUFBLE1BQy9DLENBQUM7QUFBQSxJQUNIO0FBRUEsU0FBSztBQUFBLE1BQ0gsS0FBSyxJQUFJLFVBQVUsR0FBRyxlQUFlLENBQUMsS0FBSyxRQUFRLFNBQVM7QUFDMUQsYUFBSyxLQUFLLGlCQUFpQixLQUFLLFFBQVEsSUFBSTtBQUFBLE1BQzlDLENBQUM7QUFBQSxJQUNIO0FBRUEsVUFBTSxLQUFLLHNCQUFzQjtBQUNqQyxTQUFLLGNBQWMsS0FBSyxJQUFJLE1BQU0sR0FBRyxVQUFVLENBQUMsU0FBUyxLQUFLLG1CQUFtQixNQUFNLEtBQUssa0JBQWtCLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDckgsU0FBSyxjQUFjLEtBQUssSUFBSSxNQUFNLEdBQUcsVUFBVSxDQUFDLFNBQVMsS0FBSyxtQkFBbUIsTUFBTSxLQUFLLGtCQUFrQixJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQ3JILFNBQUs7QUFBQSxNQUNILEtBQUssSUFBSSxNQUFNLEdBQUcsVUFBVSxDQUFDLE1BQU0sWUFBWSxLQUFLLG1CQUFtQixNQUFNLEtBQUssa0JBQWtCLE1BQU0sT0FBTyxDQUFDLENBQUM7QUFBQSxJQUNySDtBQUVBLFNBQUssY0FBYztBQUVuQixTQUFLLEtBQUssb0JBQW9CO0FBRTlCLFNBQUssU0FBUyxNQUFNO0FBQ2xCLGlCQUFXLFdBQVcsS0FBSyxVQUFVO0FBQ25DLFlBQUksZ0JBQWdCLE9BQU87QUFBQSxNQUM3QjtBQUNBLFdBQUssU0FBUyxNQUFNO0FBQ3BCLGlCQUFXLGFBQWEsS0FBSyx5QkFBeUIsT0FBTyxHQUFHO0FBQzlELGVBQU8sYUFBYSxTQUFTO0FBQUEsTUFDL0I7QUFDQSxXQUFLLHlCQUF5QixNQUFNO0FBQ3BDLGlCQUFXLGFBQWEsS0FBSyxjQUFjLE9BQU8sR0FBRztBQUNuRCxlQUFPLGFBQWEsU0FBUztBQUFBLE1BQy9CO0FBQ0EsV0FBSyxjQUFjLE1BQU07QUFBQSxJQUMzQixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsV0FBVztBQUNULGVBQVcsV0FBVyxLQUFLLFVBQVU7QUFDbkMsVUFBSSxnQkFBZ0IsT0FBTztBQUFBLElBQzdCO0FBQ0EsU0FBSyxTQUFTLE1BQU07QUFDcEIsZUFBVyxhQUFhLEtBQUssY0FBYyxPQUFPLEdBQUc7QUFDbkQsYUFBTyxhQUFhLFNBQVM7QUFBQSxJQUMvQjtBQUNBLFNBQUssY0FBYyxNQUFNO0FBQ3pCLGVBQVcsYUFBYSxLQUFLLHlCQUF5QixPQUFPLEdBQUc7QUFDOUQsYUFBTyxhQUFhLFNBQVM7QUFBQSxJQUMvQjtBQUNBLFNBQUsseUJBQXlCLE1BQU07QUFBQSxFQUN0QztBQUFBLEVBRUEsTUFBTSxrQkFBa0I7QUFDdEIsVUFBTSxTQUFTLE1BQU0sS0FBSyxTQUFTO0FBQ25DLFFBQUksQ0FBQyxVQUFVLE9BQU8sV0FBVyxVQUFVO0FBQ3pDLFdBQUssV0FBVyxFQUFFLEdBQUcsaUJBQWlCO0FBQ3RDLFdBQUssUUFBUSxDQUFDO0FBQ2QsV0FBSyx1QkFBdUIsb0JBQUksSUFBSTtBQUNwQyxXQUFLLFlBQVksb0JBQUksSUFBSTtBQUN6QixXQUFLLHlCQUF5QixvQkFBSSxJQUFJO0FBQ3RDO0FBQUEsSUFDRjtBQUVBLFVBQU0sWUFBWTtBQUNsQixRQUFJLGNBQWMsYUFBYSxXQUFXLFdBQVc7QUFDbkQsV0FBSyxXQUFXLEVBQUUsR0FBRyxrQkFBa0IsR0FBSyxVQUFVLFlBQThDLENBQUMsRUFBRztBQUN4RyxXQUFLLFFBQVEsTUFBTSxRQUFRLFVBQVUsS0FBSyxJQUFLLFVBQVUsUUFBeUIsQ0FBQztBQUNuRixXQUFLLHVCQUF1QixJQUFJO0FBQUEsUUFDOUIsT0FBTyxRQUFTLFVBQVUsd0JBQStELENBQUMsQ0FBQztBQUFBLE1BQzdGO0FBQ0EsV0FBSyx5QkFBeUIsSUFBSTtBQUFBLFFBQ2hDLE9BQU8sUUFBUyxVQUFVLDBCQUFrRixDQUFDLENBQUMsRUFDM0csT0FBTyxDQUFDLENBQUMsRUFBRSxLQUFLLE1BQU07QUFDckIsY0FBSSxDQUFDLFNBQVMsT0FBTyxVQUFVLFVBQVU7QUFDdkMsbUJBQU87QUFBQSxVQUNUO0FBQ0EsZ0JBQU0sU0FBUztBQUNmLGlCQUNFLE9BQU8sT0FBTyxvQkFBb0IsWUFDbEMsT0FBTyxPQUFPLG1CQUFtQixZQUNqQyxPQUFPLE9BQU8sY0FBYztBQUFBLFFBRWhDLENBQUMsRUFDQSxJQUFJLENBQUMsQ0FBQyxNQUFNLEtBQUssTUFBTSxDQUFDLE1BQU0sS0FBZ0MsQ0FBQztBQUFBLE1BQ3BFO0FBQ0EsV0FBSyxZQUFZLG9CQUFJLElBQUk7QUFDekIsaUJBQVcsQ0FBQyxNQUFNLFFBQVEsS0FBSyxPQUFPLFFBQVMsVUFBVSxhQUFxRCxDQUFDLENBQUMsR0FBRztBQUNqSCxjQUFNLGFBQWEsS0FBSyx3QkFBd0IsTUFBTSxRQUFRO0FBQzlELFlBQUksWUFBWTtBQUNkLGVBQUssVUFBVSxJQUFJLE1BQU0sVUFBVTtBQUFBLFFBQ3JDO0FBQUEsTUFDRjtBQUNBLFdBQUssa0JBQ0gsT0FBTyxVQUFVLG9CQUFvQixXQUFXLFVBQVUsa0JBQWtCO0FBQzlFLFdBQUssc0JBQ0gsT0FBTyxVQUFVLHdCQUF3QixXQUFXLFVBQVUsc0JBQXNCO0FBQ3RGLFdBQUssMkJBQTJCO0FBQ2hDO0FBQUEsSUFDRjtBQUVBLFNBQUssV0FBVyxFQUFFLEdBQUcsa0JBQWtCLEdBQUksVUFBNEM7QUFDdkYsU0FBSyxRQUFRLENBQUM7QUFDZCxTQUFLLHVCQUF1QixvQkFBSSxJQUFJO0FBQ3BDLFNBQUssWUFBWSxvQkFBSSxJQUFJO0FBQ3pCLFNBQUsseUJBQXlCLG9CQUFJLElBQUk7QUFDdEMsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyxzQkFBc0I7QUFDM0IsU0FBSywyQkFBMkI7QUFBQSxFQUNsQztBQUFBLEVBRVEsNkJBQTZCO0FBRW5DLFNBQUssU0FBUyx5QkFBeUI7QUFDdkMsU0FBSyxTQUFTLDBCQUEwQixLQUFLLElBQUksR0FBRyxLQUFLLE1BQU0sS0FBSyxTQUFTLDJCQUEyQixDQUFDLENBQUM7QUFBQSxFQUM1RztBQUFBLEVBRVEsZ0JBQWdCO0FBQ3RCLFVBQU0sVUFBVSxLQUFLLFNBQVM7QUFDOUIsUUFBSSxXQUFXLEdBQUc7QUFDaEI7QUFBQSxJQUNGO0FBRUEsVUFBTSxhQUFhLFVBQVUsS0FBSztBQUNsQyxTQUFLO0FBQUEsTUFDSCxPQUFPLFlBQVksTUFBTTtBQUN2QixhQUFLLEtBQUssZ0JBQWdCO0FBQUEsTUFDNUIsR0FBRyxVQUFVO0FBQUEsSUFDZjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsa0JBQWtCO0FBQzlCLFFBQUksS0FBSyx3QkFBd0I7QUFDL0I7QUFBQSxJQUNGO0FBRUEsU0FBSyx5QkFBeUI7QUFDOUIsUUFBSTtBQUNGLFlBQU0sS0FBSywyQkFBMkIsS0FBSztBQUFBLElBQzdDLFVBQUU7QUFDQSxXQUFLLHlCQUF5QjtBQUFBLElBQ2hDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxrQkFBa0I7QUFDdEIsVUFBTSxLQUFLLFNBQVM7QUFBQSxNQUNsQixVQUFVLEtBQUs7QUFBQSxNQUNmLE9BQU8sS0FBSztBQUFBLE1BQ1osc0JBQXNCLE9BQU8sWUFBWSxLQUFLLHFCQUFxQixRQUFRLENBQUM7QUFBQSxNQUM1RSx3QkFBd0IsT0FBTyxZQUFZLEtBQUssdUJBQXVCLFFBQVEsQ0FBQztBQUFBLE1BQ2hGLFdBQVcsT0FBTyxZQUFZLEtBQUssVUFBVSxRQUFRLENBQUM7QUFBQSxNQUN0RCxpQkFBaUIsS0FBSztBQUFBLE1BQ3RCLHFCQUFxQixLQUFLO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLE1BQU0sZUFBZTtBQUNuQixVQUFNLEtBQUssZ0JBQWdCO0FBQUEsRUFDN0I7QUFBQSxFQUVRLHdCQUF3QixXQUFtQixVQUEwQztBQUMzRixRQUFJLENBQUMsWUFBWSxPQUFPLGFBQWEsVUFBVTtBQUM3QyxhQUFPO0FBQUEsSUFDVDtBQUVBLFVBQU0sWUFBWTtBQUNsQixVQUFNLGFBQ0osT0FBTyxVQUFVLGVBQWUsWUFBWSxVQUFVLFdBQVcsU0FBUyxJQUN0RSxVQUFVLGFBQ1YsS0FBSyx5QkFBeUIsU0FBUztBQUM3QyxVQUFNLGlCQUNKLE9BQU8sVUFBVSxtQkFBbUIsV0FDaEMsVUFBVSxpQkFDVixPQUFPLFVBQVUsY0FBYyxXQUM3QixVQUFVLFlBQ1Y7QUFDUixVQUFNLGtCQUNKLE9BQU8sVUFBVSxvQkFBb0IsV0FDakMsVUFBVSxrQkFDVixPQUFPLFVBQVUsY0FBYyxXQUM3QixVQUFVLFlBQ1Y7QUFFUixXQUFPO0FBQUEsTUFDTDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLEVBQUUsSUFBWSxJQUFZO0FBQ3hCLFdBQU8sS0FBSyxZQUFZLE1BQU0sT0FBTyxLQUFLO0FBQUEsRUFDNUM7QUFBQSxFQUVRLGNBQWM7QUFDcEIsUUFBSSxLQUFLLFNBQVMsYUFBYSxRQUFRO0FBQ3JDLFlBQU0sU0FBUyxPQUFPLGNBQWMsY0FBYyxVQUFVLFNBQVMsWUFBWSxJQUFJO0FBQ3JGLGFBQU8sT0FBTyxXQUFXLElBQUksSUFBSSxPQUFPO0FBQUEsSUFDMUM7QUFFQSxXQUFPLEtBQUssU0FBUztBQUFBLEVBQ3ZCO0FBQUEsRUFFQSxzQkFBc0I7QUFDcEIsUUFBSSxDQUFDLEtBQUssaUJBQWlCO0FBQ3pCLGFBQU8sS0FBSyxFQUFFLDBEQUFhLHdCQUF3QjtBQUFBLElBQ3JEO0FBRUEsV0FBTyxLQUFLO0FBQUEsTUFDVixpQ0FBUSxJQUFJLEtBQUssS0FBSyxlQUFlLEVBQUUsZUFBZSxDQUFDO0FBQUEsTUFDdkQsY0FBYyxJQUFJLEtBQUssS0FBSyxlQUFlLEVBQUUsZUFBZSxDQUFDO0FBQUEsSUFDL0Q7QUFBQSxFQUNGO0FBQUEsRUFFQSx3QkFBd0I7QUFDdEIsV0FBTyxLQUFLLHNCQUNSLEtBQUssRUFBRSxpQ0FBUSxLQUFLLG1CQUFtQixJQUFJLGtCQUFrQixLQUFLLG1CQUFtQixFQUFFLElBQ3ZGLEtBQUssRUFBRSw4Q0FBVyxxQkFBcUI7QUFBQSxFQUM3QztBQUFBLEVBRUEsTUFBTSxnQkFBZ0I7QUFDcEIsVUFBTSxLQUFLLDJCQUEyQixJQUFJO0FBQUEsRUFDNUM7QUFBQSxFQUVBLE1BQWMsd0JBQXdCO0FBQ3BDLFVBQU0sT0FBTyxvQkFBSSxJQUF5QjtBQUMxQyxlQUFXLFFBQVEsS0FBSyxJQUFJLE1BQU0saUJBQWlCLEdBQUc7QUFDcEQsWUFBTSxVQUFVLE1BQU0sS0FBSyxJQUFJLE1BQU0sS0FBSyxJQUFJO0FBQzlDLFdBQUssSUFBSSxLQUFLLE1BQU0sS0FBSywyQkFBMkIsT0FBTyxDQUFDO0FBQUEsSUFDOUQ7QUFDQSxTQUFLLGlCQUFpQjtBQUFBLEVBQ3hCO0FBQUEsRUFFQSxNQUFjLGtCQUFrQixNQUFxQjtBQUNuRCxRQUFJLEVBQUUsZ0JBQWdCLDBCQUFVLEtBQUssY0FBYyxNQUFNO0FBQ3ZEO0FBQUEsSUFDRjtBQUVBLFVBQU0sVUFBVSxNQUFNLEtBQUssSUFBSSxNQUFNLEtBQUssSUFBSTtBQUM5QyxVQUFNLFdBQVcsS0FBSywyQkFBMkIsT0FBTztBQUN4RCxVQUFNLGVBQWUsS0FBSyxlQUFlLElBQUksS0FBSyxJQUFJLEtBQUssb0JBQUksSUFBWTtBQUMzRSxTQUFLLGVBQWUsSUFBSSxLQUFLLE1BQU0sUUFBUTtBQUUzQyxVQUFNLFFBQVEsQ0FBQyxHQUFHLFFBQVEsRUFBRSxPQUFPLENBQUMsVUFBVSxDQUFDLGFBQWEsSUFBSSxLQUFLLENBQUM7QUFDdEUsVUFBTSxVQUFVLENBQUMsR0FBRyxZQUFZLEVBQUUsT0FBTyxDQUFDLFVBQVUsQ0FBQyxTQUFTLElBQUksS0FBSyxDQUFDO0FBQ3hFLFFBQUksTUFBTSxTQUFTLEdBQUc7QUFDcEIsV0FBSyx5QkFBeUIsS0FBSyxNQUFNLFdBQVc7QUFBQSxJQUN0RDtBQUNBLFFBQUksUUFBUSxTQUFTLEdBQUc7QUFDdEIsV0FBSyx5QkFBeUIsS0FBSyxNQUFNLGNBQWM7QUFBQSxJQUN6RDtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsa0JBQWtCLE1BQXFCO0FBQ25ELFFBQUksRUFBRSxnQkFBZ0Isd0JBQVE7QUFDNUI7QUFBQSxJQUNGO0FBRUEsUUFBSSxDQUFDLEtBQUssMEJBQTBCLEtBQUssSUFBSSxHQUFHO0FBQzlDLFlBQU0sS0FBSyx1QkFBdUIsS0FBSyxNQUFNLEtBQUssVUFBVSxJQUFJLEtBQUssSUFBSSxHQUFHLGVBQWU7QUFDM0YsV0FBSyxVQUFVLE9BQU8sS0FBSyxJQUFJO0FBQy9CLFlBQU0sS0FBSyxnQkFBZ0I7QUFBQSxJQUM3QjtBQUVBLFFBQUksS0FBSyxjQUFjLE1BQU07QUFDM0IsWUFBTSxlQUFlLEtBQUssZUFBZSxJQUFJLEtBQUssSUFBSSxLQUFLLG9CQUFJLElBQVk7QUFDM0UsV0FBSyxlQUFlLE9BQU8sS0FBSyxJQUFJO0FBQ3BDLFdBQUs7QUFBQSxJQUNQO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyxrQkFBa0IsTUFBcUIsU0FBaUI7QUFDcEUsUUFBSSxFQUFFLGdCQUFnQix3QkFBUTtBQUM1QjtBQUFBLElBQ0Y7QUFFQSxRQUFJLENBQUMsS0FBSywwQkFBMEIsT0FBTyxHQUFHO0FBQzVDLFlBQU0sS0FBSyx1QkFBdUIsU0FBUyxLQUFLLFVBQVUsSUFBSSxPQUFPLEdBQUcsZUFBZTtBQUN2RixXQUFLLFVBQVUsT0FBTyxPQUFPO0FBQzdCLFlBQU0sS0FBSyxnQkFBZ0I7QUFBQSxJQUM3QjtBQUVBLFFBQUksS0FBSyxjQUFjLE1BQU07QUFDM0IsWUFBTSxPQUFPLEtBQUssZUFBZSxJQUFJLE9BQU87QUFDNUMsVUFBSSxNQUFNO0FBQ1IsYUFBSyxlQUFlLE9BQU8sT0FBTztBQUNsQyxhQUFLLGVBQWUsSUFBSSxLQUFLLE1BQU0sSUFBSTtBQUFBLE1BQ3pDO0FBRUEsVUFBSSxDQUFDLEtBQUssMEJBQTBCLEtBQUssSUFBSSxHQUFHO0FBQzlDLGFBQUsseUJBQXlCLEtBQUssTUFBTSxXQUFXO0FBQUEsTUFDdEQ7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBRVEsMkJBQTJCLFNBQWlCO0FBQ2xELFVBQU0sT0FBTyxvQkFBSSxJQUFZO0FBQzdCLFVBQU0sWUFBWTtBQUNsQixVQUFNLGdCQUFnQjtBQUN0QixVQUFNLGlCQUFpQjtBQUN2QixRQUFJO0FBRUosWUFBUSxRQUFRLFVBQVUsS0FBSyxPQUFPLE9BQU8sTUFBTTtBQUNqRCxXQUFLLElBQUksS0FBSyxhQUFhLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFBQSxJQUN0QztBQUVBLFlBQVEsUUFBUSxjQUFjLEtBQUssT0FBTyxPQUFPLE1BQU07QUFDckQsV0FBSyxJQUFJLEtBQUssYUFBYSxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDdEM7QUFFQSxZQUFRLFFBQVEsZUFBZSxLQUFLLE9BQU8sT0FBTyxNQUFNO0FBQ3RELFlBQU0sU0FBUyxLQUFLLHNCQUFzQixNQUFNLENBQUMsQ0FBQztBQUNsRCxVQUFJLFFBQVEsTUFBTTtBQUNoQixhQUFLLElBQUksT0FBTyxJQUFJO0FBQUEsTUFDdEI7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVBLE1BQWMsMkJBQTJCLFlBQW9CO0FBQzNELFNBQUs7QUFBQSxFQUdQO0FBQUEsRUFFUSx5QkFBeUIsVUFBa0IsUUFBc0M7QUFDdkYsVUFBTSxXQUFXLEtBQUsseUJBQXlCLElBQUksUUFBUTtBQUMzRCxRQUFJLFVBQVU7QUFDWixhQUFPLGFBQWEsUUFBUTtBQUFBLElBQzlCO0FBRUEsVUFBTSxVQUFVLFdBQVcsY0FBYyxPQUFPO0FBQ2hELFVBQU0sWUFBWSxPQUFPLFdBQVcsTUFBTTtBQUN4QyxXQUFLLHlCQUF5QixPQUFPLFFBQVE7QUFDN0MsV0FBSyxLQUFLLHNCQUFzQixVQUFVLE1BQU07QUFBQSxJQUNsRCxHQUFHLE9BQU87QUFDVixTQUFLLHlCQUF5QixJQUFJLFVBQVUsU0FBUztBQUFBLEVBQ3ZEO0FBQUEsRUFFQSxNQUFjLHNCQUFzQixVQUFrQixRQUFzQztBQUMxRixRQUFJLEtBQUssMEJBQTBCLElBQUksUUFBUSxHQUFHO0FBQ2hEO0FBQUEsSUFDRjtBQUVBLFFBQ0UsS0FBSywyQkFBMkIsUUFBUSxLQUN4QyxLQUFLLDZCQUE2QixPQUFPLEtBQ3pDLEtBQUssa0JBQ0wsS0FBSyx3QkFDTDtBQUNBLFdBQUsseUJBQXlCLFVBQVUsTUFBTTtBQUM5QztBQUFBLElBQ0Y7QUFFQSxVQUFNLE9BQU8sS0FBSyxtQkFBbUIsUUFBUTtBQUM3QyxRQUFJLEVBQUUsZ0JBQWdCLDBCQUFVLEtBQUssY0FBYyxRQUFRLEtBQUssMEJBQTBCLEtBQUssSUFBSSxHQUFHO0FBQ3BHO0FBQUEsSUFDRjtBQUVBLFNBQUssMEJBQTBCLElBQUksUUFBUTtBQUMzQyxRQUFJO0FBQ0YsV0FBSyxpQkFBaUI7QUFFdEIsWUFBTSxVQUFVLE1BQU0sS0FBSyxnQ0FBZ0MsSUFBSTtBQUMvRCxVQUFJLEtBQUssY0FBYyxPQUFPLEdBQUc7QUFDL0I7QUFBQSxNQUNGO0FBRUEsWUFBTSxhQUFhLEtBQUsseUJBQXlCLEtBQUssSUFBSTtBQUMxRCxZQUFNLGlCQUFpQixNQUFNLEtBQUssMEJBQTBCLE1BQU0sWUFBWSxPQUFPO0FBQ3JGLFdBQUssVUFBVSxJQUFJLEtBQUssTUFBTTtBQUFBLFFBQzVCLGdCQUFnQixNQUFNLEtBQUssMkJBQTJCLE1BQU0sT0FBTztBQUFBLFFBQ25FLGlCQUFpQixlQUFlO0FBQUEsUUFDaEM7QUFBQSxNQUNGLENBQUM7QUFDRCxZQUFNLEtBQUssd0JBQXdCLEtBQUssSUFBSTtBQUM1QyxXQUFLLGtCQUFrQixLQUFLLElBQUk7QUFDaEMsV0FBSyxzQkFBc0IsS0FBSztBQUFBLFFBQzlCLFdBQVcsY0FDUCx1RkFBaUIsS0FBSyxRQUFRLEtBQzlCLHVGQUFpQixLQUFLLFFBQVE7QUFBQSxRQUNsQyxXQUFXLGNBQ1AsbURBQW1ELEtBQUssUUFBUSxLQUNoRSx1REFBdUQsS0FBSyxRQUFRO0FBQUEsTUFDMUU7QUFDQSxZQUFNLEtBQUssZ0JBQWdCO0FBQUEsSUFDN0IsU0FBUyxPQUFPO0FBQ2QsY0FBUSxNQUFNLDZCQUE2QixLQUFLO0FBQ2hELFdBQUssa0JBQWtCLEtBQUssSUFBSTtBQUNoQyxXQUFLLHNCQUFzQixLQUFLO0FBQUEsUUFDOUIsS0FBSztBQUFBLFVBQ0gsV0FBVyxjQUFjLHlGQUFtQjtBQUFBLFVBQzVDLFdBQVcsY0FBYyw4Q0FBOEM7QUFBQSxRQUN6RTtBQUFBLFFBQ0E7QUFBQSxNQUNGO0FBQ0EsWUFBTSxLQUFLLGdCQUFnQjtBQUMzQixXQUFLLHlCQUF5QixVQUFVLE1BQU07QUFBQSxJQUNoRCxVQUFFO0FBQ0EsV0FBSywwQkFBMEIsT0FBTyxRQUFRO0FBQUEsSUFDaEQ7QUFBQSxFQUNGO0FBQUEsRUFFUSwyQkFBMkIsVUFBa0I7QUFDbkQsUUFBSSxLQUFLLE1BQU0sS0FBSyxDQUFDLFNBQVMsS0FBSyxhQUFhLFFBQVEsR0FBRztBQUN6RCxhQUFPO0FBQUEsSUFDVDtBQUVBLGVBQVcsVUFBVSxLQUFLLG1CQUFtQjtBQUMzQyxZQUFNLE9BQU8sS0FBSyxNQUFNLEtBQUssQ0FBQyxTQUFTLEtBQUssT0FBTyxNQUFNO0FBQ3pELFVBQUksTUFBTSxhQUFhLFVBQVU7QUFDL0IsZUFBTztBQUFBLE1BQ1Q7QUFBQSxJQUNGO0FBRUEsZUFBVyxDQUFDLE1BQU0sS0FBSyxLQUFLLHFCQUFxQjtBQUMvQyxZQUFNLE9BQU8sS0FBSyxNQUFNLEtBQUssQ0FBQyxTQUFTLEtBQUssT0FBTyxNQUFNO0FBQ3pELFVBQUksTUFBTSxhQUFhLFVBQVU7QUFDL0IsZUFBTztBQUFBLE1BQ1Q7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVBLE1BQWMsd0JBQXdCLFNBQWlCLFVBQWlCLGFBQW1DO0FBQ3pHLFVBQU0sT0FBTyxvQkFBSSxJQUEyQjtBQUM1QyxVQUFNLGNBQWMsQ0FBQyxHQUFHLFFBQVEsU0FBUyxvQkFBb0IsQ0FBQztBQUM5RCxVQUFNLGtCQUFrQixDQUFDLEdBQUcsUUFBUSxTQUFTLHdCQUF3QixDQUFDO0FBQ3RFLFVBQU0sbUJBQW1CLENBQUMsR0FBRyxRQUFRLFNBQVMseUNBQXlDLENBQUM7QUFFeEYsZUFBVyxTQUFTLGFBQWE7QUFDL0IsWUFBTSxVQUFVLE1BQU0sQ0FBQyxFQUFFLE1BQU0sR0FBRyxFQUFFLENBQUMsRUFBRSxLQUFLO0FBQzVDLFlBQU0sT0FBTyxLQUFLLGtCQUFrQixTQUFTLFNBQVMsSUFBSTtBQUMxRCxVQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssWUFBWSxJQUFJLEdBQUc7QUFDcEM7QUFBQSxNQUNGO0FBRUEsVUFBSSxDQUFDLEtBQUssSUFBSSxNQUFNLENBQUMsQ0FBQyxHQUFHO0FBQ3ZCLGNBQU0sWUFBWSxNQUFNLEtBQUssZ0JBQWdCLE1BQU0sV0FBVztBQUM5RCxhQUFLLElBQUksTUFBTSxDQUFDLEdBQUc7QUFBQSxVQUNqQixVQUFVLE1BQU0sQ0FBQztBQUFBLFVBQ2pCLFdBQVcsS0FBSyx1QkFBdUIsV0FBVyxLQUFLLFFBQVE7QUFBQSxVQUMvRCxZQUFZO0FBQUEsUUFDZCxDQUFDO0FBQUEsTUFDSDtBQUFBLElBQ0Y7QUFFQSxlQUFXLFNBQVMsaUJBQWlCO0FBQ25DLFlBQU0sVUFBVSxtQkFBbUIsTUFBTSxDQUFDLEVBQUUsS0FBSyxFQUFFLFFBQVEsVUFBVSxFQUFFLENBQUM7QUFDeEUsVUFBSSwyQkFBMkIsS0FBSyxPQUFPLEdBQUc7QUFDNUM7QUFBQSxNQUNGO0FBRUEsVUFBSSxLQUFLLFVBQVUsT0FBTyxHQUFHO0FBQzNCLFlBQUksQ0FBQyxLQUFLLElBQUksTUFBTSxDQUFDLENBQUMsR0FBRztBQUN2QixnQkFBTSxZQUFZLE1BQU0sS0FBSyxxQkFBcUIsU0FBUyxXQUFXO0FBQ3RFLGdCQUFNLFVBQVUsS0FBSyx1QkFBdUIsTUFBTSxDQUFDLENBQUMsS0FBSyxLQUFLLHNCQUFzQixPQUFPO0FBQzNGLGVBQUssSUFBSSxNQUFNLENBQUMsR0FBRztBQUFBLFlBQ2pCLFVBQVUsTUFBTSxDQUFDO0FBQUEsWUFDakIsV0FBVyxLQUFLLHVCQUF1QixXQUFXLE9BQU87QUFBQSxVQUMzRCxDQUFDO0FBQUEsUUFDSDtBQUNBO0FBQUEsTUFDRjtBQUVBLFlBQU0sT0FBTyxLQUFLLGtCQUFrQixTQUFTLFNBQVMsSUFBSTtBQUMxRCxVQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssWUFBWSxJQUFJLEdBQUc7QUFDcEM7QUFBQSxNQUNGO0FBRUEsVUFBSSxDQUFDLEtBQUssSUFBSSxNQUFNLENBQUMsQ0FBQyxHQUFHO0FBQ3ZCLGNBQU0sWUFBWSxNQUFNLEtBQUssZ0JBQWdCLE1BQU0sV0FBVztBQUM5RCxhQUFLLElBQUksTUFBTSxDQUFDLEdBQUc7QUFBQSxVQUNqQixVQUFVLE1BQU0sQ0FBQztBQUFBLFVBQ2pCLFdBQVcsS0FBSyx1QkFBdUIsV0FBVyxLQUFLLFFBQVE7QUFBQSxVQUMvRCxZQUFZO0FBQUEsUUFDZCxDQUFDO0FBQUEsTUFDSDtBQUFBLElBQ0Y7QUFFQSxlQUFXLFNBQVMsa0JBQWtCO0FBQ3BDLFlBQU0sVUFBVSxLQUFLLGFBQWEsTUFBTSxDQUFDLEVBQUUsS0FBSyxDQUFDO0FBQ2pELFVBQUksQ0FBQyxLQUFLLFVBQVUsT0FBTyxLQUFLLEtBQUssSUFBSSxNQUFNLENBQUMsQ0FBQyxHQUFHO0FBQ2xEO0FBQUEsTUFDRjtBQUVBLFlBQU0sWUFBWSxNQUFNLEtBQUsscUJBQXFCLFNBQVMsV0FBVztBQUN0RSxZQUFNLFVBQVUsS0FBSyx3QkFBd0IsTUFBTSxDQUFDLENBQUMsS0FBSyxLQUFLLHNCQUFzQixPQUFPO0FBQzVGLFdBQUssSUFBSSxNQUFNLENBQUMsR0FBRztBQUFBLFFBQ2pCLFVBQVUsTUFBTSxDQUFDO0FBQUEsUUFDakIsV0FBVyxLQUFLLHVCQUF1QixXQUFXLE9BQU87QUFBQSxNQUMzRCxDQUFDO0FBQUEsSUFDSDtBQUVBLFdBQU8sQ0FBQyxHQUFHLEtBQUssT0FBTyxDQUFDO0FBQUEsRUFDMUI7QUFBQSxFQUVRLHVCQUF1QixlQUF1QjtBQUNwRCxVQUFNLFFBQVEsY0FBYyxNQUFNLGdCQUFnQjtBQUNsRCxXQUFPLFFBQVEsQ0FBQyxHQUFHLEtBQUssS0FBSztBQUFBLEVBQy9CO0FBQUEsRUFFUSx3QkFBd0IsV0FBbUI7QUFDakQsVUFBTSxRQUFRLFVBQVUsTUFBTSx5QkFBeUI7QUFDdkQsV0FBTyxRQUFRLEtBQUssYUFBYSxNQUFNLENBQUMsRUFBRSxLQUFLLENBQUMsSUFBSTtBQUFBLEVBQ3REO0FBQUEsRUFFUSxVQUFVLE9BQWU7QUFDL0IsV0FBTyxnQkFBZ0IsS0FBSyxLQUFLO0FBQUEsRUFDbkM7QUFBQSxFQUVRLHNCQUFzQixRQUFnQjtBQUM1QyxRQUFJO0FBQ0YsWUFBTSxNQUFNLElBQUksSUFBSSxNQUFNO0FBQzFCLFlBQU0sV0FBVyxLQUFLLGlCQUFpQixJQUFJLFNBQVMsTUFBTSxHQUFHLEVBQUUsSUFBSSxLQUFLLEVBQUU7QUFDMUUsVUFBSSxVQUFVO0FBQ1osZUFBTyxTQUFTLFFBQVEsWUFBWSxFQUFFO0FBQUEsTUFDeEM7QUFBQSxJQUNGLFFBQVE7QUFBQSxJQUVSO0FBRUEsV0FBTyxLQUFLLEVBQUUsNEJBQVEsV0FBVztBQUFBLEVBQ25DO0FBQUEsRUFFUSxrQkFBa0IsTUFBYyxZQUFrQztBQUN4RSxVQUFNLFVBQVUsS0FBSyxRQUFRLE9BQU8sRUFBRSxFQUFFLEtBQUs7QUFDN0MsVUFBTSxTQUFTLEtBQUssSUFBSSxjQUFjLHFCQUFxQixTQUFTLFVBQVU7QUFDOUUsV0FBTyxrQkFBa0Isd0JBQVEsU0FBUztBQUFBLEVBQzVDO0FBQUEsRUFFUSxZQUFZLE1BQWE7QUFDL0IsV0FBTyxrQ0FBa0MsS0FBSyxLQUFLLFNBQVM7QUFBQSxFQUM5RDtBQUFBLEVBRUEsTUFBYyxnQkFBZ0IsTUFBYSxhQUFtQztBQUM1RSxRQUFJLGFBQWEsSUFBSSxLQUFLLElBQUksR0FBRztBQUMvQixhQUFPLFlBQVksSUFBSSxLQUFLLElBQUk7QUFBQSxJQUNsQztBQUVBLFNBQUssaUJBQWlCO0FBQ3RCLFVBQU0sU0FBUyxNQUFNLEtBQUssSUFBSSxNQUFNLFdBQVcsSUFBSTtBQUNuRCxVQUFNLFdBQVcsTUFBTSxLQUFLLHFCQUFxQixRQUFRLEtBQUssWUFBWSxLQUFLLFNBQVMsR0FBRyxLQUFLLElBQUk7QUFDcEcsVUFBTSxhQUFhLE1BQU0sS0FBSyw4QkFBOEIsU0FBUyxVQUFVLFNBQVMsTUFBTTtBQUM5RixVQUFNLGFBQWEsS0FBSyxnQkFBZ0IsVUFBVTtBQUNsRCxVQUFNLEtBQUssYUFBYSxZQUFZLFNBQVMsUUFBUSxTQUFTLFFBQVE7QUFDdEUsVUFBTSxZQUFZLEdBQUcsZUFBZSxLQUFLLFVBQVU7QUFDbkQsaUJBQWEsSUFBSSxLQUFLLE1BQU0sU0FBUztBQUNyQyxXQUFPO0FBQUEsRUFDVDtBQUFBLEVBRUEsTUFBYyxxQkFBcUIsVUFBa0IsYUFBbUM7QUFDdEYsVUFBTSxXQUFXLFVBQVUsUUFBUTtBQUNuQyxRQUFJLGFBQWEsSUFBSSxRQUFRLEdBQUc7QUFDOUIsYUFBTyxZQUFZLElBQUksUUFBUTtBQUFBLElBQ2pDO0FBRUEsU0FBSyxpQkFBaUI7QUFDdEIsVUFBTSxXQUFXLE1BQU0sS0FBSyxXQUFXO0FBQUEsTUFDckMsS0FBSztBQUFBLE1BQ0wsUUFBUTtBQUFBLE1BQ1IsaUJBQWlCO0FBQUEsSUFDbkIsQ0FBQztBQUVELFFBQUksU0FBUyxTQUFTLE9BQU8sU0FBUyxVQUFVLEtBQUs7QUFDbkQsWUFBTSxJQUFJLE1BQU0sNENBQTRDLFNBQVMsTUFBTSxFQUFFO0FBQUEsSUFDL0U7QUFFQSxVQUFNLGNBQWMsU0FBUyxRQUFRLGNBQWMsS0FBSztBQUN4RCxRQUFJLENBQUMsS0FBSyxtQkFBbUIsV0FBVyxLQUFLLENBQUMsS0FBSyxrQkFBa0IsUUFBUSxHQUFHO0FBQzlFLFlBQU0sSUFBSSxNQUFNLEtBQUssRUFBRSw4RkFBbUIsc0RBQXNELENBQUM7QUFBQSxJQUNuRztBQUVBLFVBQU0sV0FBVyxLQUFLLDBCQUEwQixVQUFVLFdBQVc7QUFDckUsVUFBTSxXQUFXLE1BQU0sS0FBSztBQUFBLE1BQzFCLFNBQVM7QUFBQSxNQUNULEtBQUssdUJBQXVCLGFBQWEsUUFBUTtBQUFBLE1BQ2pEO0FBQUEsSUFDRjtBQUNBLFVBQU0sYUFBYSxNQUFNLEtBQUssOEJBQThCLFNBQVMsVUFBVSxTQUFTLE1BQU07QUFDOUYsVUFBTSxhQUFhLEtBQUssZ0JBQWdCLFVBQVU7QUFDbEQsVUFBTSxLQUFLLGFBQWEsWUFBWSxTQUFTLFFBQVEsU0FBUyxRQUFRO0FBQ3RFLFVBQU0sWUFBWSxHQUFHLGVBQWUsS0FBSyxVQUFVO0FBQ25ELGlCQUFhLElBQUksVUFBVSxTQUFTO0FBQ3BDLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFUSxtQkFBbUIsYUFBcUI7QUFDOUMsV0FBTyxZQUFZLEtBQUssWUFBWSxLQUFLLENBQUM7QUFBQSxFQUM1QztBQUFBLEVBRVEsa0JBQWtCLFFBQWdCO0FBQ3hDLFFBQUk7QUFDRixZQUFNLE1BQU0sSUFBSSxJQUFJLE1BQU07QUFDMUIsYUFBTyxtQ0FBbUMsS0FBSyxJQUFJLFFBQVE7QUFBQSxJQUM3RCxRQUFRO0FBQ04sYUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNGO0FBQUEsRUFFUSwwQkFBMEIsUUFBZ0IsYUFBcUI7QUFDckUsUUFBSTtBQUNGLFlBQU0sTUFBTSxJQUFJLElBQUksTUFBTTtBQUMxQixZQUFNLFlBQVksS0FBSyxpQkFBaUIsSUFBSSxTQUFTLE1BQU0sR0FBRyxFQUFFLElBQUksS0FBSyxFQUFFO0FBQzNFLFVBQUksYUFBYSxnQkFBZ0IsS0FBSyxTQUFTLEdBQUc7QUFDaEQsZUFBTztBQUFBLE1BQ1Q7QUFFQSxZQUFNLFlBQVksS0FBSyx5QkFBeUIsV0FBVyxLQUFLO0FBQ2hFLGFBQU8sWUFBWSxHQUFHLFNBQVMsSUFBSSxTQUFTLEtBQUssZ0JBQWdCLFNBQVM7QUFBQSxJQUM1RSxRQUFRO0FBQ04sWUFBTSxZQUFZLEtBQUsseUJBQXlCLFdBQVcsS0FBSztBQUNoRSxhQUFPLGdCQUFnQixTQUFTO0FBQUEsSUFDbEM7QUFBQSxFQUNGO0FBQUEsRUFFUSxpQkFBaUIsVUFBa0I7QUFDekMsV0FBTyxTQUFTLFFBQVEsa0JBQWtCLEdBQUcsRUFBRSxLQUFLO0FBQUEsRUFDdEQ7QUFBQSxFQUVRLHlCQUF5QixhQUFxQjtBQUNwRCxVQUFNLFdBQVcsWUFBWSxNQUFNLEdBQUcsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLFlBQVk7QUFDOUQsWUFBUSxVQUFVO0FBQUEsTUFDaEIsS0FBSztBQUNILGVBQU87QUFBQSxNQUNULEtBQUs7QUFDSCxlQUFPO0FBQUEsTUFDVCxLQUFLO0FBQ0gsZUFBTztBQUFBLE1BQ1QsS0FBSztBQUNILGVBQU87QUFBQSxNQUNULEtBQUs7QUFDSCxlQUFPO0FBQUEsTUFDVCxLQUFLO0FBQ0gsZUFBTztBQUFBLE1BQ1Q7QUFDRSxlQUFPO0FBQUEsSUFDWDtBQUFBLEVBQ0Y7QUFBQSxFQUVRLHVCQUF1QixhQUFxQixVQUFrQjtBQUNwRSxVQUFNLFdBQVcsWUFBWSxNQUFNLEdBQUcsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLFlBQVk7QUFDOUQsUUFBSSxZQUFZLGFBQWEsNEJBQTRCO0FBQ3ZELGFBQU87QUFBQSxJQUNUO0FBRUEsV0FBTyxLQUFLLHdCQUF3QixRQUFRO0FBQUEsRUFDOUM7QUFBQSxFQUVBLE1BQWMsYUFBYSxZQUFvQixRQUFxQixVQUFrQjtBQUNwRixVQUFNLEtBQUssd0JBQXdCLFVBQVU7QUFDN0MsVUFBTSxXQUFXLE1BQU0sS0FBSyxXQUFXO0FBQUEsTUFDckMsS0FBSyxLQUFLLGVBQWUsVUFBVTtBQUFBLE1BQ25DLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxRQUNQLGVBQWUsS0FBSyxnQkFBZ0I7QUFBQSxRQUNwQyxnQkFBZ0I7QUFBQSxNQUNsQjtBQUFBLE1BQ0EsTUFBTTtBQUFBLElBQ1IsQ0FBQztBQUVELFFBQUksU0FBUyxTQUFTLE9BQU8sU0FBUyxVQUFVLEtBQUs7QUFDbkQsWUFBTSxJQUFJLE1BQU0sNkJBQTZCLFNBQVMsTUFBTSxFQUFFO0FBQUEsSUFDaEU7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLGtCQUFrQixLQUFxQixRQUFnQixNQUF1QztBQUMxRyxRQUFJLElBQUksb0JBQW9CLENBQUMsS0FBSyxNQUFNO0FBQ3RDO0FBQUEsSUFDRjtBQUVBLFVBQU0sWUFBWSxLQUFLLDhCQUE4QixHQUFHO0FBQ3hELFFBQUksV0FBVztBQUNiLFVBQUksZUFBZTtBQUNuQixZQUFNLFdBQVcsVUFBVSxRQUFRLEtBQUssdUJBQXVCLFVBQVUsSUFBSTtBQUM3RSxZQUFNLEtBQUsseUJBQXlCLEtBQUssTUFBTSxRQUFRLFdBQVcsUUFBUTtBQUMxRTtBQUFBLElBQ0Y7QUFFQSxVQUFNLE9BQU8sSUFBSSxlQUFlLFFBQVEsV0FBVyxHQUFHLEtBQUssS0FBSztBQUNoRSxRQUFJLENBQUMsUUFBUSxDQUFDLEtBQUsseUJBQXlCLElBQUksR0FBRztBQUNqRDtBQUFBLElBQ0Y7QUFFQSxRQUFJLGVBQWU7QUFDbkIsVUFBTSxLQUFLLGdDQUFnQyxLQUFLLE1BQU0sUUFBUSxJQUFJO0FBQUEsRUFDcEU7QUFBQSxFQUVBLE1BQWMsaUJBQWlCLEtBQWdCLFFBQWdCLE1BQXVDO0FBQ3BHLFFBQUksSUFBSSxvQkFBb0IsQ0FBQyxLQUFLLE1BQU07QUFDdEM7QUFBQSxJQUNGO0FBRUEsVUFBTSxZQUFZLEtBQUsseUJBQXlCLEdBQUc7QUFDbkQsUUFBSSxDQUFDLFdBQVc7QUFDZDtBQUFBLElBQ0Y7QUFFQSxRQUFJLGVBQWU7QUFDbkIsVUFBTSxXQUFXLFVBQVUsUUFBUSxLQUFLLHVCQUF1QixVQUFVLElBQUk7QUFDN0UsVUFBTSxLQUFLLHlCQUF5QixLQUFLLE1BQU0sUUFBUSxXQUFXLFFBQVE7QUFBQSxFQUM1RTtBQUFBLEVBRVEsOEJBQThCLEtBQXFCO0FBQ3pELFVBQU0sU0FBUyxNQUFNLEtBQUssSUFBSSxlQUFlLFNBQVMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLFNBQVMsS0FBSyxLQUFLLFdBQVcsUUFBUSxDQUFDO0FBQ3ZHLFFBQUksUUFBUTtBQUNWLGFBQU87QUFBQSxJQUNUO0FBRUEsVUFBTSxPQUFPLE1BQU0sS0FBSyxJQUFJLGVBQWUsU0FBUyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsVUFBVSxNQUFNLEtBQUssV0FBVyxRQUFRLENBQUM7QUFDdkcsV0FBTyxNQUFNLFVBQVUsS0FBSztBQUFBLEVBQzlCO0FBQUEsRUFFUSx5QkFBeUIsTUFBYztBQUM3QyxXQUFPLGtEQUFrRCxLQUFLLElBQUk7QUFBQSxFQUNwRTtBQUFBLEVBRUEsTUFBYyxnQ0FBZ0MsVUFBaUIsUUFBZ0IsTUFBYztBQUMzRixRQUFJO0FBQ0YsWUFBTSxXQUFXLE1BQU0sS0FBSyxxQ0FBcUMsTUFBTSxRQUFRO0FBQy9FLFVBQUksQ0FBQyxTQUFTLEtBQUssR0FBRztBQUNwQjtBQUFBLE1BQ0Y7QUFFQSxhQUFPLGlCQUFpQixRQUFRO0FBQ2hDLFVBQUksdUJBQU8sS0FBSyxFQUFFLG9HQUFvQixnREFBZ0QsQ0FBQztBQUFBLElBQ3pGLFNBQVMsT0FBTztBQUNkLGNBQVEsTUFBTSxtREFBbUQsS0FBSztBQUN0RSxVQUFJO0FBQUEsUUFDRixLQUFLO0FBQUEsVUFDSCxLQUFLLEVBQUUsZ0VBQWMsc0NBQXNDO0FBQUEsVUFDM0Q7QUFBQSxRQUNGO0FBQUEsUUFDQTtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyxxQ0FBcUMsTUFBYyxVQUFpQjtBQUNoRixVQUFNLFNBQVMsSUFBSSxVQUFVO0FBQzdCLFVBQU1BLFlBQVcsT0FBTyxnQkFBZ0IsTUFBTSxXQUFXO0FBQ3pELFVBQU0sY0FBYyxvQkFBSSxJQUFvQjtBQUM1QyxVQUFNLGlCQUEyQixDQUFDO0FBRWxDLGVBQVcsUUFBUSxNQUFNLEtBQUtBLFVBQVMsS0FBSyxVQUFVLEdBQUc7QUFDdkQsWUFBTSxRQUFRLE1BQU0sS0FBSyxxQkFBcUIsTUFBTSxVQUFVLGFBQWEsQ0FBQztBQUM1RSxVQUFJLE1BQU0sS0FBSyxHQUFHO0FBQ2hCLHVCQUFlLEtBQUssTUFBTSxLQUFLLENBQUM7QUFBQSxNQUNsQztBQUFBLElBQ0Y7QUFFQSxXQUFPLGVBQWUsS0FBSyxNQUFNLElBQUk7QUFBQSxFQUN2QztBQUFBLEVBRUEsTUFBYyxxQkFDWixNQUNBLFVBQ0EsYUFDQSxXQUNpQjtBQUNqQixRQUFJLEtBQUssYUFBYSxLQUFLLFdBQVc7QUFDcEMsYUFBTyxLQUFLLHVCQUF1QixLQUFLLGVBQWUsRUFBRTtBQUFBLElBQzNEO0FBRUEsUUFBSSxFQUFFLGdCQUFnQixjQUFjO0FBQ2xDLGFBQU87QUFBQSxJQUNUO0FBRUEsVUFBTSxNQUFNLEtBQUssUUFBUSxZQUFZO0FBQ3JDLFFBQUksUUFBUSxPQUFPO0FBQ2pCLFlBQU0sTUFBTSxLQUFLLGFBQWEsS0FBSyxhQUFhLEtBQUssR0FBRyxLQUFLLEtBQUssRUFBRTtBQUNwRSxVQUFJLENBQUMsS0FBSyxVQUFVLEdBQUcsR0FBRztBQUN4QixlQUFPO0FBQUEsTUFDVDtBQUVBLFlBQU0sT0FBTyxLQUFLLGFBQWEsS0FBSyxLQUFLLElBQUksS0FBSyxLQUFLLEtBQUssc0JBQXNCLEdBQUc7QUFDckYsWUFBTSxZQUFZLE1BQU0sS0FBSyxxQkFBcUIsS0FBSyxXQUFXO0FBQ2xFLGFBQU8sS0FBSyx1QkFBdUIsV0FBVyxHQUFHO0FBQUEsSUFDbkQ7QUFFQSxRQUFJLFFBQVEsTUFBTTtBQUNoQixhQUFPO0FBQUEsSUFDVDtBQUVBLFFBQUksUUFBUSxRQUFRLFFBQVEsTUFBTTtBQUNoQyxZQUFNLFFBQWtCLENBQUM7QUFDekIsVUFBSSxRQUFRO0FBQ1osaUJBQVcsU0FBUyxNQUFNLEtBQUssS0FBSyxRQUFRLEdBQUc7QUFDN0MsWUFBSSxNQUFNLFFBQVEsWUFBWSxNQUFNLE1BQU07QUFDeEM7QUFBQSxRQUNGO0FBRUEsY0FBTSxZQUFZLE1BQU0sS0FBSyxxQkFBcUIsT0FBTyxVQUFVLGFBQWEsWUFBWSxDQUFDLEdBQUcsS0FBSztBQUNyRyxZQUFJLENBQUMsVUFBVTtBQUNiO0FBQUEsUUFDRjtBQUVBLGNBQU0sU0FBUyxRQUFRLE9BQU8sR0FBRyxLQUFLLE9BQU87QUFDN0MsY0FBTSxLQUFLLEdBQUcsS0FBSyxPQUFPLEtBQUssSUFBSSxHQUFHLFNBQVMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxHQUFHLFFBQVEsRUFBRTtBQUN2RSxpQkFBUztBQUFBLE1BQ1g7QUFFQSxhQUFPLE1BQU0sS0FBSyxJQUFJO0FBQUEsSUFDeEI7QUFFQSxRQUFJLFFBQVEsTUFBTTtBQUNoQixZQUFNLFFBQVEsTUFBTSxLQUFLLHlCQUF5QixNQUFNLFVBQVUsYUFBYSxTQUFTO0FBQ3hGLGFBQU8sTUFBTSxLQUFLLEVBQUUsRUFBRSxLQUFLO0FBQUEsSUFDN0I7QUFFQSxRQUFJLFdBQVcsS0FBSyxHQUFHLEdBQUc7QUFDeEIsWUFBTSxRQUFRLE9BQU8sU0FBUyxJQUFJLENBQUMsR0FBRyxFQUFFO0FBQ3hDLFlBQU0sUUFBUSxNQUFNLEtBQUsseUJBQXlCLE1BQU0sVUFBVSxhQUFhLFNBQVMsR0FBRyxLQUFLLEVBQUUsRUFBRSxLQUFLO0FBQ3pHLGFBQU8sT0FBTyxHQUFHLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSSxJQUFJLEtBQUs7QUFBQSxJQUNqRDtBQUVBLFFBQUksUUFBUSxLQUFLO0FBQ2YsWUFBTSxPQUFPLEtBQUssYUFBYSxNQUFNLEdBQUcsS0FBSyxLQUFLO0FBQ2xELFlBQU0sUUFBUSxNQUFNLEtBQUsseUJBQXlCLE1BQU0sVUFBVSxhQUFhLFNBQVMsR0FBRyxLQUFLLEVBQUUsRUFBRSxLQUFLO0FBQ3pHLFVBQUksUUFBUSxnQkFBZ0IsS0FBSyxJQUFJLEtBQUssTUFBTTtBQUM5QyxlQUFPLElBQUksSUFBSSxLQUFLLElBQUk7QUFBQSxNQUMxQjtBQUNBLGFBQU87QUFBQSxJQUNUO0FBRUEsVUFBTSxhQUFhLG9CQUFJLElBQUksQ0FBQyxVQUFVLEtBQUssTUFBTSxLQUFLLFFBQVEsUUFBUSxTQUFTLE9BQU8sS0FBSyxDQUFDO0FBQzVGLFFBQUksV0FBVyxJQUFJLEdBQUcsR0FBRztBQUN2QixjQUFRLE1BQU0sS0FBSyx5QkFBeUIsTUFBTSxVQUFVLGFBQWEsU0FBUyxHQUFHLEtBQUssRUFBRTtBQUFBLElBQzlGO0FBRUEsVUFBTSxZQUFZLG9CQUFJLElBQUk7QUFBQSxNQUN4QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNGLENBQUM7QUFDRCxRQUFJLFVBQVUsSUFBSSxHQUFHLEdBQUc7QUFDdEIsWUFBTSxRQUFRLE1BQU0sS0FBSyx5QkFBeUIsTUFBTSxVQUFVLGFBQWEsU0FBUyxHQUFHLEtBQUssRUFBRSxFQUFFLEtBQUs7QUFDekcsYUFBTztBQUFBLElBQ1Q7QUFFQSxZQUFRLE1BQU0sS0FBSyx5QkFBeUIsTUFBTSxVQUFVLGFBQWEsU0FBUyxHQUFHLEtBQUssRUFBRTtBQUFBLEVBQzlGO0FBQUEsRUFFQSxNQUFjLHlCQUNaLFNBQ0EsVUFDQSxhQUNBLFdBQ0E7QUFDQSxVQUFNLFFBQWtCLENBQUM7QUFDekIsZUFBVyxTQUFTLE1BQU0sS0FBSyxRQUFRLFVBQVUsR0FBRztBQUNsRCxZQUFNLFdBQVcsTUFBTSxLQUFLLHFCQUFxQixPQUFPLFVBQVUsYUFBYSxTQUFTO0FBQ3hGLFVBQUksQ0FBQyxVQUFVO0FBQ2I7QUFBQSxNQUNGO0FBRUEsVUFBSSxNQUFNLFNBQVMsS0FBSyxDQUFDLFNBQVMsV0FBVyxJQUFJLEtBQUssQ0FBQyxNQUFNLE1BQU0sU0FBUyxDQUFDLEVBQUUsU0FBUyxJQUFJLEdBQUc7QUFDN0YsY0FBTSxXQUFXLE1BQU0sTUFBTSxTQUFTLENBQUM7QUFDdkMsY0FBTSxhQUFhLE1BQU0sS0FBSyxRQUFRLEtBQUssTUFBTSxLQUFLLFFBQVE7QUFDOUQsWUFBSSxZQUFZO0FBQ2QsZ0JBQU0sS0FBSyxHQUFHO0FBQUEsUUFDaEI7QUFBQSxNQUNGO0FBRUEsWUFBTSxLQUFLLFFBQVE7QUFBQSxJQUNyQjtBQUVBLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFUSx1QkFBdUIsT0FBZTtBQUM1QyxXQUFPLE1BQU0sUUFBUSxRQUFRLEdBQUc7QUFBQSxFQUNsQztBQUFBLEVBRVEseUJBQXlCLEtBQWdCO0FBQy9DLFdBQU8sTUFBTSxLQUFLLElBQUksY0FBYyxTQUFTLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxTQUFTLEtBQUssS0FBSyxXQUFXLFFBQVEsQ0FBQyxLQUFLO0FBQUEsRUFDckc7QUFBQSxFQUVBLE1BQWMseUJBQXlCLFVBQWlCLFFBQWdCLFdBQWlCLFVBQWtCO0FBQ3pHLFFBQUk7QUFDRixZQUFNLGNBQWMsTUFBTSxVQUFVLFlBQVk7QUFDaEQsWUFBTSxPQUFPLEtBQUs7QUFBQSxRQUNoQixTQUFTO0FBQUEsUUFDVDtBQUFBLFFBQ0EsVUFBVSxRQUFRLEtBQUssd0JBQXdCLFFBQVE7QUFBQSxRQUN2RDtBQUFBLE1BQ0Y7QUFDQSxXQUFLLGtCQUFrQixRQUFRLEtBQUssV0FBVztBQUMvQyxXQUFLLE1BQU0sS0FBSyxJQUFJO0FBQ3BCLFlBQU0sS0FBSyxnQkFBZ0I7QUFDM0IsV0FBSyxLQUFLLG9CQUFvQjtBQUM5QixVQUFJLHVCQUFPLEtBQUssRUFBRSw0RUFBZ0IsdUNBQXVDLENBQUM7QUFBQSxJQUM1RSxTQUFTLE9BQU87QUFDZCxjQUFRLE1BQU0sdUNBQXVDLEtBQUs7QUFDMUQsVUFBSSx1QkFBTyxLQUFLLGNBQWMsS0FBSyxFQUFFLDRFQUFnQix1Q0FBdUMsR0FBRyxLQUFLLEdBQUcsR0FBSTtBQUFBLElBQzdHO0FBQUEsRUFDRjtBQUFBLEVBRVEsaUJBQWlCLFVBQWtCLFFBQXFCLFVBQWtCLFVBQThCO0FBQzlHLFVBQU0sS0FBSyxzQkFBc0IsS0FBSyxJQUFJLENBQUMsSUFBSSxLQUFLLE9BQU8sRUFBRSxTQUFTLEVBQUUsRUFBRSxNQUFNLEdBQUcsQ0FBQyxDQUFDO0FBQ3JGLFdBQU87QUFBQSxNQUNMO0FBQUEsTUFDQTtBQUFBLE1BQ0EsYUFBYSxLQUFLLHdCQUF3QixJQUFJLFFBQVE7QUFBQSxNQUN0RDtBQUFBLE1BQ0E7QUFBQSxNQUNBLFlBQVksS0FBSyxvQkFBb0IsTUFBTTtBQUFBLE1BQzNDLFVBQVU7QUFBQSxNQUNWLFdBQVcsS0FBSyxJQUFJO0FBQUEsSUFDdEI7QUFBQSxFQUNGO0FBQUEsRUFFUSx3QkFBd0IsUUFBZ0IsVUFBa0I7QUFDaEUsVUFBTSxXQUFXLEtBQUssV0FBVyxRQUFRO0FBQ3pDLFdBQU8sZ0VBQWdFLE1BQU0saUJBQWlCLFFBQVEsS0FBSyxLQUFLLFdBQVcsS0FBSyxFQUFFLDZDQUFVLFFBQVEsVUFBSyxzQkFBc0IsUUFBUSxHQUFHLENBQUMsQ0FBQztBQUFBLEVBQzlMO0FBQUEsRUFFUSxrQkFBa0IsUUFBZ0IsYUFBcUI7QUFDN0QsV0FBTyxpQkFBaUIsR0FBRyxXQUFXO0FBQUEsQ0FBSTtBQUFBLEVBQzVDO0FBQUEsRUFFQSxNQUFNLDJCQUEyQixhQUFhLE1BQU07QUFDbEQsUUFBSSxLQUFLLGdCQUFnQjtBQUN2QixVQUFJLFlBQVk7QUFDZCxZQUFJLHVCQUFPLEtBQUssRUFBRSxvREFBWSxnQ0FBZ0MsR0FBRyxHQUFJO0FBQUEsTUFDdkU7QUFDQTtBQUFBLElBQ0Y7QUFFQSxTQUFLLGlCQUFpQjtBQUN0QixRQUFJO0FBQ0YsV0FBSyxpQkFBaUI7QUFDdEIsWUFBTSxLQUFLLDZCQUE2QjtBQUN4QyxZQUFNLGVBQWUsTUFBTSxLQUFLLDZCQUE2QixVQUFVO0FBQ3ZFLFVBQUksQ0FBQyxjQUFjO0FBQ2pCO0FBQUEsTUFDRjtBQUNBLFlBQU0sS0FBSyxzQkFBc0I7QUFFakMsWUFBTSxrQkFBa0IsTUFBTSxLQUFLLGVBQWUsS0FBSyxTQUFTLHFCQUFxQjtBQUNyRixZQUFNLHFCQUFxQixNQUFNLEtBQUssdUJBQXVCO0FBQzdELFlBQU0sY0FBYyxnQkFBZ0I7QUFDcEMsVUFBSSxxQkFBcUI7QUFDekIsVUFBSSxxQkFBcUI7QUFDekIsVUFBSSxvQkFBb0I7QUFDeEIsVUFBSSxvQkFBb0I7QUFFeEIsVUFBSSxRQUFRLEtBQUsseUJBQXlCO0FBQzFDLFVBQUksZUFBZSxJQUFJLElBQUksTUFBTSxJQUFJLENBQUMsU0FBUyxLQUFLLElBQUksQ0FBQztBQUN6RCxpQkFBVyxRQUFRLENBQUMsR0FBRyxLQUFLLFVBQVUsS0FBSyxDQUFDLEdBQUc7QUFDN0MsWUFBSSxDQUFDLGFBQWEsSUFBSSxJQUFJLEdBQUc7QUFDM0IsZ0JBQU0sV0FBVyxLQUFLLFVBQVUsSUFBSSxJQUFJO0FBQ3hDLGNBQUksQ0FBQyxVQUFVO0FBQ2IsaUJBQUssVUFBVSxPQUFPLElBQUk7QUFDMUI7QUFBQSxVQUNGO0FBRUEsZ0JBQU0sU0FBUyxZQUFZLElBQUksU0FBUyxVQUFVO0FBQ2xELGNBQUksQ0FBQyxRQUFRO0FBQ1gsaUJBQUssVUFBVSxPQUFPLElBQUk7QUFDMUI7QUFBQSxVQUNGO0FBRUEsZ0JBQU0sWUFBWSxtQkFBbUIsSUFBSSxJQUFJO0FBQzdDLGNBQUksYUFBYSxLQUFLLHlCQUF5QixXQUFXLE1BQU0sR0FBRztBQUNqRSxrQkFBTSxLQUFLLHdCQUF3QixPQUFPLFVBQVU7QUFDcEQsd0JBQVksT0FBTyxPQUFPLFVBQVU7QUFDcEMsaUJBQUssVUFBVSxPQUFPLElBQUk7QUFDMUIsa0NBQXNCO0FBQ3RCO0FBQUEsVUFDRjtBQUVBLGNBQUksV0FBVztBQUNiLGtCQUFNLEtBQUssd0JBQXdCLElBQUk7QUFDdkMsK0JBQW1CLE9BQU8sSUFBSTtBQUFBLFVBQ2hDO0FBRUEsY0FBSSxTQUFTLG1CQUFtQixTQUFTLG9CQUFvQixPQUFPLFdBQVc7QUFDN0Usa0JBQU0sS0FBSywwQkFBMEIsTUFBTSxNQUFNO0FBQ2pELGlCQUFLLFVBQVUsSUFBSSxNQUFNO0FBQUEsY0FDdkIsZ0JBQWdCLE9BQU87QUFBQSxjQUN2QixpQkFBaUIsT0FBTztBQUFBLGNBQ3hCLFlBQVksT0FBTztBQUFBLFlBQ3JCLENBQUM7QUFDRCxrQ0FBc0I7QUFDdEI7QUFBQSxVQUNGO0FBRUEsZ0JBQU0sS0FBSywwQkFBMEIsTUFBTSxNQUFNO0FBQ2pELGVBQUssVUFBVSxJQUFJLE1BQU07QUFBQSxZQUN2QixnQkFBZ0IsT0FBTztBQUFBLFlBQ3ZCLGlCQUFpQixPQUFPO0FBQUEsWUFDeEIsWUFBWSxPQUFPO0FBQUEsVUFDckIsQ0FBQztBQUNELGdDQUFzQjtBQUFBLFFBQ3hCO0FBQUEsTUFDRjtBQUVBLFVBQUksV0FBVztBQUNmLFVBQUksVUFBVTtBQUNkLFVBQUksMkJBQTJCO0FBQy9CLFVBQUkseUJBQXlCO0FBRTdCLGNBQVEsS0FBSyx5QkFBeUI7QUFDdEMscUJBQWUsSUFBSSxJQUFJLE1BQU0sSUFBSSxDQUFDLFNBQVMsS0FBSyxJQUFJLENBQUM7QUFDckQsaUJBQVcsVUFBVSxDQUFDLEdBQUcsWUFBWSxPQUFPLENBQUMsRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsV0FBVyxjQUFjLEVBQUUsVUFBVSxDQUFDLEdBQUc7QUFDdkcsY0FBTSxZQUFZLEtBQUssc0JBQXNCLE9BQU8sVUFBVTtBQUM5RCxZQUFJLENBQUMsYUFBYSxhQUFhLElBQUksU0FBUyxHQUFHO0FBQzdDO0FBQUEsUUFDRjtBQUVGLGNBQU0sWUFBWSxtQkFBbUIsSUFBSSxTQUFTO0FBQ2xELFlBQUksV0FBVztBQUNiLGNBQUksS0FBSyx5QkFBeUIsV0FBVyxNQUFNLEdBQUc7QUFDcEQsa0JBQU0sS0FBSyx3QkFBd0IsT0FBTyxVQUFVO0FBQ3BELHdCQUFZLE9BQU8sT0FBTyxVQUFVO0FBQ3BDLGtDQUFzQjtBQUN0QjtBQUFBLFVBQ0Y7QUFFQSxnQkFBTSxLQUFLLHdCQUF3QixTQUFTO0FBQzVDLDZCQUFtQixPQUFPLFNBQVM7QUFBQSxRQUNyQztBQUVFLGNBQU0sS0FBSywwQkFBMEIsV0FBVyxNQUFNO0FBQ3RELGFBQUssVUFBVSxJQUFJLFdBQVc7QUFBQSxVQUM1QixnQkFBZ0IsT0FBTztBQUFBLFVBQ3ZCLGlCQUFpQixPQUFPO0FBQUEsVUFDeEIsWUFBWSxPQUFPO0FBQUEsUUFDckIsQ0FBQztBQUNELDhCQUFzQjtBQUFBLE1BQ3hCO0FBRUEsY0FBUSxLQUFLLHlCQUF5QjtBQUN0QyxxQkFBZSxJQUFJLElBQUksTUFBTSxJQUFJLENBQUMsU0FBUyxLQUFLLElBQUksQ0FBQztBQUNyRCxZQUFNLG1CQUFtQixvQkFBSSxJQUFZO0FBQ3pDLFVBQUksc0JBQXNCO0FBQzFCLGlCQUFXLFFBQVEsT0FBTztBQUN4QixjQUFNLGFBQWEsS0FBSyx5QkFBeUIsS0FBSyxJQUFJO0FBQzFELHlCQUFpQixJQUFJLFVBQVU7QUFDL0IsY0FBTSxTQUFTLFlBQVksSUFBSSxVQUFVO0FBQ3pDLGNBQU0sa0JBQWtCLFFBQVEsYUFBYTtBQUM3QyxjQUFNLFdBQVcsS0FBSyxVQUFVLElBQUksS0FBSyxJQUFJO0FBQzdDLGNBQU0sa0JBQWtCLEtBQUssY0FBYyxPQUFPLE1BQU0sS0FBSyxnQ0FBZ0MsSUFBSSxJQUFJO0FBQ3JHLGNBQU0saUJBQWlCLE1BQU0sS0FBSywyQkFBMkIsTUFBTSxtQkFBbUIsTUFBUztBQUUvRixZQUFJLEtBQUssY0FBYyxNQUFNO0FBQzNCLGdCQUFNLE9BQU8sS0FBSyxjQUFjLG1CQUFtQixFQUFFO0FBQ3JELGNBQUksTUFBTTtBQUNSLGtCQUFNLGFBQWEsWUFBWSxJQUFJLEtBQUssVUFBVTtBQUNsRCxrQkFBTUMsYUFBWSxtQkFBbUIsSUFBSSxLQUFLLElBQUk7QUFDbEQsZ0JBQUksQ0FBQyxjQUFjQSxZQUFXO0FBQzVCLG9CQUFNLEtBQUsscUJBQXFCLElBQUk7QUFDcEMsbUJBQUssVUFBVSxPQUFPLEtBQUssSUFBSTtBQUMvQixtQkFBSyx1QkFBdUIsS0FBSyxJQUFJO0FBQ3JDLG1DQUFxQjtBQUNyQixtQ0FBcUI7QUFDckI7QUFBQSxZQUNGO0FBQ0EsZ0JBQUksQ0FBQyxZQUFZO0FBQ2Ysb0JBQU0sZ0JBQWdCLEtBQUssc0JBQXNCLEtBQUssSUFBSTtBQUMxRCxrQkFBSSxjQUFjLGFBQWEsS0FBSyxnQ0FBZ0M7QUFDbEUsc0JBQU0sS0FBSyxxQkFBcUIsSUFBSTtBQUNwQyxxQkFBSyxVQUFVLE9BQU8sS0FBSyxJQUFJO0FBQy9CLHFCQUFLLHVCQUF1QixLQUFLLElBQUk7QUFDckMscUNBQXFCO0FBQ3JCLHFDQUFxQjtBQUNyQiwwQ0FBMEI7QUFDMUI7QUFBQSxjQUNGO0FBQ0EsMENBQTRCO0FBQUEsWUFDOUIsT0FBTztBQUNMLG1CQUFLLHVCQUF1QixLQUFLLElBQUk7QUFBQSxZQUN2QztBQUNBLGlCQUFLLFVBQVUsSUFBSSxLQUFLLE1BQU07QUFBQSxjQUM1QjtBQUFBLGNBQ0EsaUJBQWlCLFlBQVksYUFBYSxVQUFVLG1CQUFtQjtBQUFBLGNBQ3ZFO0FBQUEsWUFDRixDQUFDO0FBQ0QsdUJBQVc7QUFDWDtBQUFBLFVBQ0Y7QUFBQSxRQUNGO0FBRUEsY0FBTSxZQUFZLG1CQUFtQixJQUFJLEtBQUssSUFBSTtBQUNsRCxjQUFNLHlCQUF5QixXQUFXLFNBQVMsbUJBQW1CLGlCQUFpQjtBQUN2RixZQUFJLFdBQVc7QUFDYixjQUNFLDBCQUNBLEtBQUssK0JBQStCLE1BQU0sU0FBUyxLQUNuRCxLQUFLLHlCQUF5QixXQUFXLE1BQU0sR0FDL0M7QUFDQSxrQkFBTSxLQUFLLHFCQUFxQixJQUFJO0FBQ3BDLGlCQUFLLFVBQVUsT0FBTyxLQUFLLElBQUk7QUFDL0IsaUNBQXFCO0FBQ3JCLGdCQUFJLFFBQVE7QUFDVixvQkFBTSxLQUFLLHdCQUF3QixPQUFPLFVBQVU7QUFDcEQsMEJBQVksT0FBTyxPQUFPLFVBQVU7QUFDcEMsb0NBQXNCO0FBQUEsWUFDeEI7QUFDQTtBQUFBLFVBQ0Y7QUFFQSxnQkFBTSxLQUFLLHdCQUF3QixLQUFLLElBQUk7QUFDNUMsNkJBQW1CLE9BQU8sS0FBSyxJQUFJO0FBQUEsUUFDckM7QUFFQSxZQUFJLENBQUMsUUFBUTtBQUNYLGdCQUFNQyxrQkFBaUIsTUFBTSxLQUFLLDBCQUEwQixNQUFNLFlBQVksbUJBQW1CLE1BQVM7QUFDMUcsZUFBSyxVQUFVLElBQUksS0FBSyxNQUFNO0FBQUEsWUFDNUI7QUFBQSxZQUNBLGlCQUFpQkEsZ0JBQWU7QUFBQSxZQUNoQztBQUFBLFVBQ0YsQ0FBQztBQUNELHNCQUFZLElBQUksWUFBWUEsZUFBYztBQUMxQyxzQkFBWTtBQUNaO0FBQUEsUUFDRjtBQUVBLFlBQUksQ0FBQyxVQUFVO0FBQ2IsY0FBSSxtQkFBbUIsaUJBQWlCO0FBQ3RDLGlCQUFLLFVBQVUsSUFBSSxLQUFLLE1BQU07QUFBQSxjQUM1QjtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRixDQUFDO0FBQ0Qsa0JBQU0sS0FBSyx3QkFBd0IsS0FBSyxJQUFJO0FBQzVDLHVCQUFXO0FBQ1g7QUFBQSxVQUNGO0FBRUEsY0FBSSxLQUFLLDRCQUE0QixLQUFLLEtBQUssT0FBTyxPQUFPLFlBQVksR0FBRztBQUMxRSxrQkFBTSxLQUFLLDBCQUEwQixLQUFLLE1BQU0sUUFBUSxJQUFJO0FBQzVELGtCQUFNLFlBQVksS0FBSyxtQkFBbUIsS0FBSyxJQUFJO0FBQ25ELGlCQUFLLFVBQVUsSUFBSSxLQUFLLE1BQU07QUFBQSxjQUM1QixnQkFBZ0IsWUFBWSxNQUFNLEtBQUssMkJBQTJCLFNBQVMsSUFBSTtBQUFBLGNBQy9FO0FBQUEsY0FDQTtBQUFBLFlBQ0YsQ0FBQztBQUNELG1DQUF1QjtBQUN2QjtBQUFBLFVBQ0Y7QUFFQSxnQkFBTUEsa0JBQWlCLE1BQU0sS0FBSywwQkFBMEIsTUFBTSxZQUFZLG1CQUFtQixNQUFTO0FBQzFHLGVBQUssVUFBVSxJQUFJLEtBQUssTUFBTTtBQUFBLFlBQzVCO0FBQUEsWUFDQSxpQkFBaUJBLGdCQUFlO0FBQUEsWUFDaEM7QUFBQSxVQUNGLENBQUM7QUFDRCxzQkFBWSxJQUFJLFlBQVlBLGVBQWM7QUFDMUMsZ0JBQU0sS0FBSyx3QkFBd0IsS0FBSyxJQUFJO0FBQzVDLHNCQUFZO0FBQ1o7QUFBQSxRQUNGO0FBRUEsY0FBTSxlQUFlLFNBQVMsbUJBQW1CLGtCQUFrQixTQUFTLGVBQWU7QUFDM0YsY0FBTSxnQkFBZ0IsU0FBUyxvQkFBb0IsbUJBQW1CLFNBQVMsZUFBZTtBQUM5RixZQUFJLENBQUMsZ0JBQWdCLENBQUMsZUFBZTtBQUNuQyxxQkFBVztBQUNYO0FBQUEsUUFDRjtBQUVBLFlBQUksQ0FBQyxnQkFBZ0IsZUFBZTtBQUNsQyxnQkFBTSxLQUFLLDBCQUEwQixLQUFLLE1BQU0sUUFBUSxJQUFJO0FBQzVELGdCQUFNLFlBQVksS0FBSyxtQkFBbUIsS0FBSyxJQUFJO0FBQ25ELGVBQUssVUFBVSxJQUFJLEtBQUssTUFBTTtBQUFBLFlBQzVCLGdCQUFnQixZQUFZLE1BQU0sS0FBSywyQkFBMkIsU0FBUyxJQUFJO0FBQUEsWUFDL0U7QUFBQSxZQUNBO0FBQUEsVUFDRixDQUFDO0FBQ0QsaUNBQXVCO0FBQ3ZCO0FBQUEsUUFDRjtBQUVBLFlBQUksZ0JBQWdCLENBQUMsZUFBZTtBQUNsQyxnQkFBTUEsa0JBQWlCLE1BQU0sS0FBSywwQkFBMEIsTUFBTSxZQUFZLG1CQUFtQixNQUFTO0FBQzFHLGVBQUssVUFBVSxJQUFJLEtBQUssTUFBTTtBQUFBLFlBQzVCO0FBQUEsWUFDQSxpQkFBaUJBLGdCQUFlO0FBQUEsWUFDaEM7QUFBQSxVQUNGLENBQUM7QUFDRCxzQkFBWSxJQUFJLFlBQVlBLGVBQWM7QUFDMUMsZ0JBQU0sS0FBSyx3QkFBd0IsS0FBSyxJQUFJO0FBQzVDLHNCQUFZO0FBQ1o7QUFBQSxRQUNGO0FBRUEsWUFBSSxLQUFLLDRCQUE0QixLQUFLLEtBQUssT0FBTyxPQUFPLFlBQVksR0FBRztBQUMxRSxnQkFBTSxLQUFLLDBCQUEwQixLQUFLLE1BQU0sUUFBUSxJQUFJO0FBQzVELGdCQUFNLFlBQVksS0FBSyxtQkFBbUIsS0FBSyxJQUFJO0FBQ25ELGVBQUssVUFBVSxJQUFJLEtBQUssTUFBTTtBQUFBLFlBQzVCLGdCQUFnQixZQUFZLE1BQU0sS0FBSywyQkFBMkIsU0FBUyxJQUFJO0FBQUEsWUFDL0U7QUFBQSxZQUNBO0FBQUEsVUFDRixDQUFDO0FBQ0QsaUNBQXVCO0FBQ3ZCO0FBQUEsUUFDRjtBQUVBLGNBQU0saUJBQWlCLE1BQU0sS0FBSywwQkFBMEIsTUFBTSxZQUFZLG1CQUFtQixNQUFTO0FBQzFHLGFBQUssVUFBVSxJQUFJLEtBQUssTUFBTTtBQUFBLFVBQzVCO0FBQUEsVUFDQSxpQkFBaUIsZUFBZTtBQUFBLFVBQ2hDO0FBQUEsUUFDRixDQUFDO0FBQ0Qsb0JBQVksSUFBSSxZQUFZLGNBQWM7QUFDMUMsY0FBTSxLQUFLLHdCQUF3QixLQUFLLElBQUk7QUFDNUMsb0JBQVk7QUFBQSxNQUNkO0FBRUEsWUFBTSwyQkFBMkIsTUFBTSxLQUFLO0FBQUEsUUFDMUMsZ0JBQWdCO0FBQUEsUUFDaEIsS0FBSywrQkFBK0Isa0JBQWtCLEtBQUssU0FBUyxxQkFBcUI7QUFBQSxNQUMzRjtBQUNBLFlBQU0sZUFBZSxNQUFNLEtBQUssc0JBQXNCO0FBQ3RELFlBQU0sZUFBZSxNQUFNLEtBQUssc0JBQXNCLEtBQUs7QUFFM0QsV0FBSyxrQkFBa0IsS0FBSyxJQUFJO0FBQ2hDLFdBQUssc0JBQXNCLEtBQUs7QUFBQSxRQUM5QixvREFBWSxRQUFRLDJEQUFjLHFCQUFxQixtQkFBbUIseUNBQVcsT0FBTyxtRkFBa0Isa0JBQWtCLHlDQUFXLGlCQUFpQixVQUFLLG9CQUFvQixJQUFJLDBEQUFhLGlCQUFpQixrQkFBUSxFQUFFLG9EQUFZLHdCQUF3QixxREFBYSxhQUFhLFlBQVksNkJBQVMsYUFBYSxrQkFBa0IsVUFBSyxlQUFlLElBQUksb0RBQVksWUFBWSxZQUFPLEVBQUUsR0FBRywyQkFBMkIsSUFBSSw0QkFBUSx3QkFBd0Isd0VBQWlCLEVBQUUsR0FBRyx5QkFBeUIsSUFBSSxzRUFBZSxzQkFBc0IsWUFBTyxFQUFFO0FBQUEsUUFDL2lCLCtCQUErQixRQUFRLG9CQUFvQixxQkFBcUIsbUJBQW1CLGlDQUFpQyxPQUFPLCtCQUErQixrQkFBa0IsK0JBQStCLGlCQUFpQixpQkFBaUIsb0JBQW9CLElBQUksZUFBZSxpQkFBaUIseUJBQXlCLEVBQUUsYUFBYSx3QkFBd0IsbUJBQW1CLDZCQUE2QixJQUFJLE1BQU0sS0FBSyxhQUFhLGFBQWEsWUFBWSxrQ0FBa0MsYUFBYSxrQkFBa0IsWUFBWSxhQUFhLHVCQUF1QixJQUFJLE1BQU0sS0FBSyxHQUFHLGVBQWUsSUFBSSxpQkFBaUIsWUFBWSx5QkFBeUIsRUFBRSxHQUFHLDJCQUEyQixJQUFJLHFCQUFxQix3QkFBd0IsK0NBQStDLEVBQUUsR0FBRyx5QkFBeUIsSUFBSSxnQkFBZ0Isc0JBQXNCLDBDQUEwQyxFQUFFO0FBQUEsTUFDNTVCO0FBQ0EsWUFBTSxLQUFLLGdCQUFnQjtBQUMzQixVQUFJLFlBQVk7QUFDZCxZQUFJLHVCQUFPLEtBQUsscUJBQXFCLEdBQUk7QUFBQSxNQUMzQztBQUFBLElBQ0YsU0FBUyxPQUFPO0FBQ2QsY0FBUSxNQUFNLDZCQUE2QixLQUFLO0FBQ2hELFdBQUssa0JBQWtCLEtBQUssSUFBSTtBQUNoQyxXQUFLLHNCQUFzQixLQUFLLGNBQWMsS0FBSyxFQUFFLHdDQUFVLHFCQUFxQixHQUFHLEtBQUs7QUFDNUYsWUFBTSxLQUFLLGdCQUFnQjtBQUMzQixVQUFJLFlBQVk7QUFDZCxZQUFJLHVCQUFPLEtBQUsscUJBQXFCLEdBQUk7QUFBQSxNQUMzQztBQUFBLElBQ0YsVUFBRTtBQUNBLFdBQUssaUJBQWlCO0FBQUEsSUFDeEI7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLHdCQUF3QixZQUFvQjtBQUN4RCxRQUFJO0FBQ0YsWUFBTSxXQUFXLE1BQU0sS0FBSyxXQUFXO0FBQUEsUUFDckMsS0FBSyxLQUFLLGVBQWUsVUFBVTtBQUFBLFFBQ25DLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxVQUNQLGVBQWUsS0FBSyxnQkFBZ0I7QUFBQSxRQUN0QztBQUFBLE1BQ0YsQ0FBQztBQUVELFVBQUksU0FBUyxXQUFXLFFBQVEsU0FBUyxTQUFTLE9BQU8sU0FBUyxVQUFVLE1BQU07QUFDaEYsY0FBTSxJQUFJLE1BQU0sNkJBQTZCLFNBQVMsTUFBTSxFQUFFO0FBQUEsTUFDaEU7QUFBQSxJQUNGLFNBQVMsT0FBTztBQUNkLGNBQVEsTUFBTSwwQ0FBMEMsWUFBWSxLQUFLO0FBQ3pFLFlBQU07QUFBQSxJQUNSO0FBQUEsRUFDRjtBQUFBLEVBRVEseUJBQXlCLFFBQXdEO0FBQ3ZGLFdBQU8sR0FBRyxPQUFPLFlBQVksSUFBSSxPQUFPLElBQUk7QUFBQSxFQUM5QztBQUFBLEVBRVEsc0JBQXNCO0FBQzVCLFdBQU8sR0FBRyxLQUFLLGdCQUFnQixLQUFLLFNBQVMscUJBQXFCLEVBQUUsUUFBUSxPQUFPLEVBQUUsQ0FBQyxHQUFHLEtBQUssb0JBQW9CO0FBQUEsRUFDcEg7QUFBQSxFQUVRLHdCQUF3QixXQUFtQjtBQUNqRCxVQUFNLFVBQVUsS0FBSyxvQkFBb0IsS0FBSyxXQUFXLFNBQVMsQ0FBQyxFQUNoRSxRQUFRLE9BQU8sR0FBRyxFQUNsQixRQUFRLE9BQU8sR0FBRyxFQUNsQixRQUFRLFFBQVEsRUFBRTtBQUNyQixXQUFPLEdBQUcsS0FBSyxvQkFBb0IsQ0FBQyxHQUFHLE9BQU87QUFBQSxFQUNoRDtBQUFBLEVBRVEsNkJBQTZCLE9BQWU7QUFDbEQsVUFBTSxhQUFhLE1BQU0sUUFBUSxNQUFNLEdBQUcsRUFBRSxRQUFRLE1BQU0sR0FBRztBQUM3RCxVQUFNLFNBQVMsYUFBYSxJQUFJLFFBQVEsS0FBSyxXQUFXLFNBQVMsS0FBSyxNQUFNLENBQUM7QUFDN0UsV0FBTyxLQUFLLFdBQVcsS0FBSyxvQkFBb0IsTUFBTSxDQUFDO0FBQUEsRUFDekQ7QUFBQSxFQUVRLDhCQUE4QixZQUFvQjtBQUN4RCxVQUFNLE9BQU8sS0FBSyxvQkFBb0I7QUFDdEMsUUFBSSxDQUFDLFdBQVcsV0FBVyxJQUFJLEtBQUssQ0FBQyxXQUFXLFNBQVMsT0FBTyxHQUFHO0FBQ2pFLGFBQU87QUFBQSxJQUNUO0FBRUEsVUFBTSxVQUFVLFdBQVcsTUFBTSxLQUFLLFFBQVEsQ0FBQyxRQUFRLE1BQU07QUFDN0QsUUFBSTtBQUNGLGFBQU8sS0FBSyw2QkFBNkIsT0FBTztBQUFBLElBQ2xELFFBQVE7QUFDTixhQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsdUJBQXVCLFdBQW1CLGlCQUEwQjtBQUNoRixVQUFNLFVBQTZCO0FBQUEsTUFDakMsTUFBTTtBQUFBLE1BQ04sV0FBVyxLQUFLLElBQUk7QUFBQSxNQUNwQjtBQUFBLElBQ0Y7QUFDQSxVQUFNLEtBQUs7QUFBQSxNQUNULEtBQUssd0JBQXdCLFNBQVM7QUFBQSxNQUN0QyxLQUFLLFdBQVcsS0FBSyxVQUFVLE9BQU8sQ0FBQztBQUFBLE1BQ3ZDO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsd0JBQXdCLFdBQW1CO0FBQ3ZELFFBQUk7QUFDRixZQUFNLEtBQUssd0JBQXdCLEtBQUssd0JBQXdCLFNBQVMsQ0FBQztBQUFBLElBQzVFLFFBQVE7QUFBQSxJQUVSO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyxzQkFBc0IsV0FBbUI7QUFDckQsVUFBTSxXQUFXLE1BQU0sS0FBSyxXQUFXO0FBQUEsTUFDckMsS0FBSyxLQUFLLGVBQWUsS0FBSyx3QkFBd0IsU0FBUyxDQUFDO0FBQUEsTUFDaEUsUUFBUTtBQUFBLE1BQ1IsU0FBUztBQUFBLFFBQ1AsZUFBZSxLQUFLLGdCQUFnQjtBQUFBLE1BQ3RDO0FBQUEsSUFDRixDQUFDO0FBRUQsUUFBSSxTQUFTLFdBQVcsS0FBSztBQUMzQixhQUFPO0FBQUEsSUFDVDtBQUVBLFFBQUksU0FBUyxTQUFTLE9BQU8sU0FBUyxVQUFVLEtBQUs7QUFDbkQsWUFBTSxJQUFJLE1BQU0sb0NBQW9DLFNBQVMsTUFBTSxFQUFFO0FBQUEsSUFDdkU7QUFFQSxXQUFPLEtBQUssOEJBQThCLEtBQUssV0FBVyxTQUFTLFdBQVcsQ0FBQztBQUFBLEVBQ2pGO0FBQUEsRUFFUSw4QkFBOEIsS0FBdUM7QUFDM0UsUUFBSTtBQUNGLFlBQU0sU0FBUyxLQUFLLE1BQU0sR0FBRztBQUM3QixVQUFJLENBQUMsVUFBVSxPQUFPLE9BQU8sU0FBUyxZQUFZLE9BQU8sT0FBTyxjQUFjLFVBQVU7QUFDdEYsZUFBTztBQUFBLE1BQ1Q7QUFDQSxVQUFJLE9BQU8sb0JBQW9CLFVBQWEsT0FBTyxPQUFPLG9CQUFvQixVQUFVO0FBQ3RGLGVBQU87QUFBQSxNQUNUO0FBQ0EsYUFBTztBQUFBLFFBQ0wsTUFBTSxPQUFPO0FBQUEsUUFDYixXQUFXLE9BQU87QUFBQSxRQUNsQixpQkFBaUIsT0FBTztBQUFBLE1BQzFCO0FBQUEsSUFDRixRQUFRO0FBQ04sYUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLHlCQUF5QjtBQUNyQyxVQUFNLGFBQWEsb0JBQUksSUFBK0I7QUFDdEQsVUFBTSxZQUFZLE1BQU0sS0FBSyxlQUFlLEtBQUssb0JBQW9CLENBQUM7QUFDdEUsZUFBVyxVQUFVLFVBQVUsTUFBTSxPQUFPLEdBQUc7QUFDN0MsWUFBTSxZQUFZLEtBQUssOEJBQThCLE9BQU8sVUFBVTtBQUN0RSxVQUFJLENBQUMsV0FBVztBQUNkO0FBQUEsTUFDRjtBQUVBLFlBQU0sV0FBVyxNQUFNLEtBQUssV0FBVztBQUFBLFFBQ3JDLEtBQUssS0FBSyxlQUFlLE9BQU8sVUFBVTtBQUFBLFFBQzFDLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxVQUNQLGVBQWUsS0FBSyxnQkFBZ0I7QUFBQSxRQUN0QztBQUFBLE1BQ0YsQ0FBQztBQUNELFVBQUksU0FBUyxTQUFTLE9BQU8sU0FBUyxVQUFVLEtBQUs7QUFDbkQ7QUFBQSxNQUNGO0FBRUEsWUFBTSxZQUFZLEtBQUssOEJBQThCLEtBQUssV0FBVyxTQUFTLFdBQVcsQ0FBQztBQUMxRixVQUFJLFdBQVc7QUFDYixtQkFBVyxJQUFJLFdBQVcsU0FBUztBQUFBLE1BQ3JDO0FBQUEsSUFDRjtBQUVBLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFUSxzQkFBc0IsWUFBb0I7QUFDaEQsVUFBTSxPQUFPLEtBQUssZ0JBQWdCLEtBQUssU0FBUyxxQkFBcUI7QUFDckUsUUFBSSxDQUFDLFdBQVcsV0FBVyxJQUFJLEdBQUc7QUFDaEMsYUFBTztBQUFBLElBQ1Q7QUFFQSxXQUFPLFdBQVcsTUFBTSxLQUFLLE1BQU0sRUFBRSxRQUFRLFFBQVEsRUFBRTtBQUFBLEVBQ3pEO0FBQUEsRUFFUSw0QkFBNEIsWUFBb0IsYUFBcUI7QUFDM0UsV0FBTyxjQUFjLGFBQWE7QUFBQSxFQUNwQztBQUFBLEVBRVEseUJBQ04sV0FDQSxRQUNBO0FBQ0EsVUFBTSxVQUFVO0FBQ2hCLFFBQUksQ0FBQyxRQUFRO0FBQ1gsYUFBTztBQUFBLElBQ1Q7QUFFQSxRQUFJLFVBQVUsaUJBQWlCO0FBQzdCLGFBQU8sT0FBTyxjQUFjLFVBQVU7QUFBQSxJQUN4QztBQUVBLFdBQU8sT0FBTyxnQkFBZ0IsVUFBVSxZQUFZO0FBQUEsRUFDdEQ7QUFBQSxFQUVRLCtCQUErQixNQUFhLFdBQThCO0FBQ2hGLFVBQU0sVUFBVTtBQUNoQixXQUFPLEtBQUssS0FBSyxTQUFTLFVBQVUsWUFBWTtBQUFBLEVBQ2xEO0FBQUEsRUFFUSxtQkFBbUIsTUFBYztBQUN2QyxVQUFNLE9BQU8sS0FBSyxJQUFJLE1BQU0sc0JBQXNCLElBQUk7QUFDdEQsV0FBTyxnQkFBZ0Isd0JBQVEsT0FBTztBQUFBLEVBQ3hDO0FBQUEsRUFFQSxNQUFjLHFCQUFxQixNQUFhO0FBQzlDLFFBQUk7QUFDRixZQUFNLEtBQUssSUFBSSxNQUFNLE9BQU8sTUFBTSxJQUFJO0FBQUEsSUFDeEMsU0FBUyxhQUFhO0FBQ3BCLFVBQUk7QUFDRixjQUFNLEtBQUssSUFBSSxNQUFNLE1BQU0sTUFBTSxJQUFJO0FBQUEsTUFDdkMsUUFBUTtBQUNOLGNBQU07QUFBQSxNQUNSO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMseUJBQXlCLE1BQWM7QUFDbkQsVUFBTSxpQkFBYSwrQkFBYyxJQUFJO0FBQ3JDLFVBQU0sV0FBVyxXQUFXLE1BQU0sR0FBRyxFQUFFLE9BQU8sQ0FBQyxVQUFVLE1BQU0sU0FBUyxDQUFDO0FBQ3pFLFFBQUksU0FBUyxVQUFVLEdBQUc7QUFDeEI7QUFBQSxJQUNGO0FBRUEsUUFBSSxVQUFVO0FBQ2QsYUFBUyxRQUFRLEdBQUcsUUFBUSxTQUFTLFNBQVMsR0FBRyxTQUFTLEdBQUc7QUFDM0QsZ0JBQVUsVUFBVSxHQUFHLE9BQU8sSUFBSSxTQUFTLEtBQUssQ0FBQyxLQUFLLFNBQVMsS0FBSztBQUNwRSxZQUFNLFdBQVcsS0FBSyxJQUFJLE1BQU0sc0JBQXNCLE9BQU87QUFDN0QsVUFBSSxDQUFDLFVBQVU7QUFDYixjQUFNLEtBQUssSUFBSSxNQUFNLGFBQWEsT0FBTztBQUFBLE1BQzNDO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsMEJBQTBCLFdBQW1CLFFBQXlCLGNBQXNCO0FBQ3hHLFVBQU0sV0FBVyxNQUFNLEtBQUssV0FBVztBQUFBLE1BQ3JDLEtBQUssS0FBSyxlQUFlLE9BQU8sVUFBVTtBQUFBLE1BQzFDLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxRQUNQLGVBQWUsS0FBSyxnQkFBZ0I7QUFBQSxNQUN0QztBQUFBLElBQ0YsQ0FBQztBQUVELFFBQUksU0FBUyxTQUFTLE9BQU8sU0FBUyxVQUFVLEtBQUs7QUFDbkQsWUFBTSxJQUFJLE1BQU0sMEJBQTBCLFNBQVMsTUFBTSxFQUFFO0FBQUEsSUFDN0Q7QUFFQSxVQUFNLEtBQUsseUJBQXlCLFNBQVM7QUFDN0MsVUFBTSxVQUFVLGdCQUFnQixLQUFLLG1CQUFtQixTQUFTO0FBQ2pFLFVBQU0sVUFBVTtBQUFBLE1BQ2QsT0FBTyxPQUFPLGVBQWUsSUFBSSxPQUFPLGVBQWUsS0FBSyxJQUFJO0FBQUEsSUFDbEU7QUFDQSxRQUFJLENBQUMsU0FBUztBQUNaLFVBQUksVUFBVSxZQUFZLEVBQUUsU0FBUyxLQUFLLEdBQUc7QUFDM0MsY0FBTSxLQUFLLElBQUksTUFBTSxPQUFPLFdBQVcsS0FBSyxXQUFXLFNBQVMsV0FBVyxHQUFHLE9BQU87QUFBQSxNQUN2RixPQUFPO0FBQ0wsY0FBTSxLQUFLLElBQUksTUFBTSxhQUFhLFdBQVcsU0FBUyxhQUFhLE9BQU87QUFBQSxNQUM1RTtBQUNBO0FBQUEsSUFDRjtBQUVBLFFBQUksUUFBUSxjQUFjLE1BQU07QUFDOUIsWUFBTSxLQUFLLElBQUksTUFBTSxPQUFPLFNBQVMsS0FBSyxXQUFXLFNBQVMsV0FBVyxHQUFHLE9BQU87QUFBQSxJQUNyRixPQUFPO0FBQ0wsWUFBTSxLQUFLLElBQUksTUFBTSxhQUFhLFNBQVMsU0FBUyxhQUFhLE9BQU87QUFBQSxJQUMxRTtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsNEJBQTRCLFlBQW9CLFVBQXVCO0FBQ25GLFVBQU0sV0FBVyxNQUFNLEtBQUssV0FBVztBQUFBLE1BQ3JDLEtBQUssS0FBSyxlQUFlLFVBQVU7QUFBQSxNQUNuQyxRQUFRO0FBQUEsTUFDUixTQUFTO0FBQUEsUUFDUCxlQUFlLEtBQUssZ0JBQWdCO0FBQUEsTUFDdEM7QUFBQSxJQUNGLENBQUM7QUFFRCxRQUFJLFNBQVMsU0FBUyxPQUFPLFNBQVMsVUFBVSxLQUFLO0FBQ25ELGFBQU87QUFBQSxJQUNUO0FBRUEsV0FBTyxLQUFLLGtCQUFrQixVQUFVLFNBQVMsV0FBVztBQUFBLEVBQzlEO0FBQUEsRUFFQSxNQUFjLGVBQWUsWUFBb0I7QUFDL0MsVUFBTSxXQUFXLE1BQU0sS0FBSyxXQUFXO0FBQUEsTUFDckMsS0FBSyxLQUFLLGVBQWUsVUFBVTtBQUFBLE1BQ25DLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxRQUNQLGVBQWUsS0FBSyxnQkFBZ0I7QUFBQSxRQUNwQyxPQUFPO0FBQUEsTUFDVDtBQUFBLElBQ0YsQ0FBQztBQUVELFFBQUksU0FBUyxXQUFXLEtBQUs7QUFDM0IsYUFBTztBQUFBLElBQ1Q7QUFFQSxRQUFJLFNBQVMsU0FBUyxPQUFPLFNBQVMsVUFBVSxLQUFLO0FBQ25ELFlBQU0sSUFBSSxNQUFNLHVCQUF1QixVQUFVLGdCQUFnQixTQUFTLE1BQU0sRUFBRTtBQUFBLElBQ3BGO0FBRUEsVUFBTSxVQUFVLEtBQUssV0FBVyxTQUFTLFdBQVc7QUFDcEQsVUFBTSxVQUFVLEtBQUssOEJBQThCLFNBQVMsWUFBWSxJQUFJO0FBQzVFLFdBQU8sUUFBUSxLQUFLLENBQUMsVUFBVSxDQUFDLE1BQU0sWUFBWSxHQUFHLFFBQVE7QUFBQSxFQUMvRDtBQUFBLEVBRUEsTUFBYywwQkFBMEIsTUFBYSxZQUFvQixpQkFBMEI7QUFDakcsUUFBSTtBQUVKLFFBQUksS0FBSyxjQUFjLE1BQU07QUFDM0IsWUFBTSxVQUFVLG1CQUFvQixNQUFNLEtBQUssZ0NBQWdDLElBQUk7QUFDbkYsVUFBSSxLQUFLLGNBQWMsT0FBTyxHQUFHO0FBQy9CLGNBQU0sSUFBSTtBQUFBLFVBQ1IsS0FBSztBQUFBLFlBQ0g7QUFBQSxZQUNBO0FBQUEsVUFDRjtBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBRUEsZUFBUyxLQUFLLFdBQVcsT0FBTztBQUFBLElBQ2xDLE9BQU87QUFDTCxlQUFTLE1BQU0sS0FBSyxJQUFJLE1BQU0sV0FBVyxJQUFJO0FBQUEsSUFDL0M7QUFFQSxVQUFNLEtBQUssYUFBYSxZQUFZLFFBQVEsS0FBSyxZQUFZLEtBQUssU0FBUyxDQUFDO0FBQzVFLFVBQU0sU0FBUyxNQUFNLEtBQUssZUFBZSxVQUFVO0FBQ25ELFFBQUksUUFBUTtBQUNWLGFBQU87QUFBQSxJQUNUO0FBRUEsV0FBTztBQUFBLE1BQ0w7QUFBQSxNQUNBLGNBQWMsS0FBSyxLQUFLO0FBQUEsTUFDeEIsTUFBTSxLQUFLLEtBQUs7QUFBQSxNQUNoQixXQUFXLEtBQUssbUJBQW1CLElBQUk7QUFBQSxJQUN6QztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsd0JBQXdCLFdBQW1CO0FBQ3ZELFVBQU0sV0FBVyxLQUFLLFVBQVUsSUFBSSxTQUFTO0FBQzdDLFVBQU0sYUFBYSxVQUFVLGNBQWMsS0FBSyx5QkFBeUIsU0FBUztBQUNsRixVQUFNLEtBQUssd0JBQXdCLFVBQVU7QUFDN0MsU0FBSyxVQUFVLE9BQU8sU0FBUztBQUMvQixVQUFNLEtBQUssZ0JBQWdCO0FBQUEsRUFDN0I7QUFBQSxFQUVBLE1BQWMsZUFBZSxNQUFvQjtBQUMvQyxRQUFJLEVBQUUsZ0JBQWdCLDBCQUFVLEtBQUssY0FBYyxNQUFNO0FBQ3ZEO0FBQUEsSUFDRjtBQUVBLFNBQUsscUJBQXFCLElBQUksS0FBSyxNQUFNLEtBQUssSUFBSSxDQUFDO0FBQ25ELFVBQU0sS0FBSyxnQkFBZ0I7QUFFM0IsVUFBTSxVQUFVLE1BQU0sS0FBSyxJQUFJLE1BQU0sS0FBSyxJQUFJO0FBQzlDLFVBQU0sT0FBTyxLQUFLLGNBQWMsT0FBTztBQUN2QyxRQUFJLENBQUMsTUFBTTtBQUNUO0FBQUEsSUFDRjtBQUVBLFFBQUk7QUFDRixZQUFNLFNBQVMsTUFBTSxLQUFLLGVBQWUsS0FBSyxVQUFVO0FBQ3hELFVBQUksQ0FBQyxRQUFRO0FBQ1gsY0FBTSxZQUFZLE1BQU0sS0FBSyxzQkFBc0IsS0FBSyxJQUFJO0FBQzVELFlBQUksV0FBVztBQUNiLGdCQUFNLEtBQUsscUJBQXFCLElBQUk7QUFDcEMsZUFBSyxVQUFVLE9BQU8sS0FBSyxJQUFJO0FBQy9CLGVBQUssdUJBQXVCLEtBQUssSUFBSTtBQUNyQyxnQkFBTSxLQUFLLGdCQUFnQjtBQUMzQixjQUFJO0FBQUEsWUFDRixLQUFLO0FBQUEsY0FDSCwrR0FBcUIsS0FBSyxRQUFRO0FBQUEsY0FDbEMsbURBQW1ELEtBQUssUUFBUTtBQUFBLFlBQ2xFO0FBQUEsWUFDQTtBQUFBLFVBQ0Y7QUFDQTtBQUFBLFFBQ0Y7QUFFQSxjQUFNLGdCQUFnQixLQUFLLHNCQUFzQixLQUFLLElBQUk7QUFDMUQsWUFBSSxjQUFjLGFBQWEsS0FBSyxnQ0FBZ0M7QUFDbEUsZ0JBQU0sS0FBSyxxQkFBcUIsSUFBSTtBQUNwQyxlQUFLLFVBQVUsT0FBTyxLQUFLLElBQUk7QUFDL0IsZUFBSyx1QkFBdUIsS0FBSyxJQUFJO0FBQ3JDLGdCQUFNLEtBQUssZ0JBQWdCO0FBQzNCLGNBQUk7QUFBQSxZQUNGLEtBQUs7QUFBQSxjQUNILGlJQUF3QixLQUFLLFFBQVE7QUFBQSxjQUNyQyx5RUFBeUUsS0FBSyxRQUFRO0FBQUEsWUFDeEY7QUFBQSxZQUNBO0FBQUEsVUFDRjtBQUNBO0FBQUEsUUFDRjtBQUVBLGNBQU0sS0FBSyxnQkFBZ0I7QUFDM0IsWUFBSSx1QkFBTyxLQUFLLEVBQUUsc1FBQStDLHFMQUFxTCxHQUFHLEdBQUk7QUFDN1A7QUFBQSxNQUNGO0FBRUEsV0FBSyx1QkFBdUIsS0FBSyxJQUFJO0FBQ3JDLFlBQU0sS0FBSywwQkFBMEIsS0FBSyxNQUFNLFFBQVEsSUFBSTtBQUM1RCxZQUFNLFlBQVksS0FBSyxtQkFBbUIsS0FBSyxJQUFJO0FBQ25ELFdBQUssVUFBVSxJQUFJLEtBQUssTUFBTTtBQUFBLFFBQzVCLGdCQUFnQixZQUFZLEtBQUssbUJBQW1CLFNBQVMsSUFBSSxPQUFPO0FBQUEsUUFDeEUsaUJBQWlCLE9BQU87QUFBQSxRQUN4QixZQUFZLEtBQUs7QUFBQSxNQUNuQixDQUFDO0FBQ0QsWUFBTSxLQUFLLGdCQUFnQjtBQUMzQixVQUFJLHVCQUFPLEtBQUssRUFBRSx5REFBWSxLQUFLLFFBQVEsSUFBSSw4QkFBOEIsS0FBSyxRQUFRLEVBQUUsR0FBRyxHQUFJO0FBQUEsSUFDckcsU0FBUyxPQUFPO0FBQ2QsY0FBUSxNQUFNLHNDQUFzQyxLQUFLO0FBQ3pELFVBQUksdUJBQU8sS0FBSyxjQUFjLEtBQUssRUFBRSxvREFBWSxvQ0FBb0MsR0FBRyxLQUFLLEdBQUcsR0FBSTtBQUFBLElBQ3RHO0FBQUEsRUFDRjtBQUFBLEVBRVEsMEJBQTBCLE1BQWM7QUFDOUMsVUFBTSxxQkFBaUIsK0JBQWMsSUFBSTtBQUN6QyxRQUFJLG1CQUFtQixlQUFlLGVBQWUsV0FBVyxZQUFZLEdBQUc7QUFDN0UsYUFBTztBQUFBLElBQ1Q7QUFFQSxRQUNFLG1CQUFtQiw0Q0FDbkIsZUFBZSxXQUFXLHlDQUF5QyxHQUNuRTtBQUNBLGFBQU87QUFBQSxJQUNUO0FBRUEsV0FBTyxtQ0FBbUMsS0FBSyxjQUFjO0FBQUEsRUFDL0Q7QUFBQSxFQUVRLDJCQUEyQjtBQUNqQyxXQUFPLEtBQUssSUFBSSxNQUNiLFNBQVMsRUFDVCxPQUFPLENBQUMsU0FBUyxDQUFDLEtBQUssMEJBQTBCLEtBQUssSUFBSSxDQUFDLEVBQzNELEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxLQUFLLGNBQWMsRUFBRSxJQUFJLENBQUM7QUFBQSxFQUNoRDtBQUFBLEVBRVEsbUJBQW1CLE1BQWE7QUFDdEMsV0FBTyxHQUFHLEtBQUssS0FBSyxLQUFLLElBQUksS0FBSyxLQUFLLElBQUk7QUFBQSxFQUM3QztBQUFBLEVBRVEsdUJBQXVCLFVBQWtCO0FBQy9DLFVBQU0sU0FBUyxLQUFLLElBQUksVUFBVSxnQkFBZ0IsVUFBVTtBQUM1RCxlQUFXLFFBQVEsUUFBUTtBQUN6QixZQUFNLE9BQU8sS0FBSztBQUNsQixVQUFJLEVBQUUsZ0JBQWdCLCtCQUFlO0FBQ25DO0FBQUEsTUFDRjtBQUVBLFVBQUksQ0FBQyxLQUFLLFFBQVEsS0FBSyxLQUFLLFNBQVMsVUFBVTtBQUM3QztBQUFBLE1BQ0Y7QUFFQSxhQUFPLEtBQUssT0FBTyxTQUFTO0FBQUEsSUFDOUI7QUFFQSxXQUFPO0FBQUEsRUFDVDtBQUFBLEVBRUEsTUFBYyxnQ0FBZ0MsTUFBYTtBQUN6RCxVQUFNLGNBQWMsS0FBSyx1QkFBdUIsS0FBSyxJQUFJO0FBQ3pELFFBQUksZ0JBQWdCLE1BQU07QUFDeEIsYUFBTztBQUFBLElBQ1Q7QUFFQSxXQUFPLE1BQU0sS0FBSyxJQUFJLE1BQU0sS0FBSyxJQUFJO0FBQUEsRUFDdkM7QUFBQSxFQUVBLE1BQWMsMkJBQTJCLE1BQWEsaUJBQTBCO0FBQzlFLFFBQUksS0FBSyxjQUFjLE1BQU07QUFDM0IsYUFBTyxLQUFLLG1CQUFtQixJQUFJO0FBQUEsSUFDckM7QUFFQSxVQUFNLFVBQVUsbUJBQW9CLE1BQU0sS0FBSyxnQ0FBZ0MsSUFBSTtBQUNuRixVQUFNLFVBQVUsTUFBTSxLQUFLLGlCQUFpQixLQUFLLFdBQVcsT0FBTyxDQUFDLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDbEYsV0FBTyxNQUFNLFFBQVEsTUFBTSxJQUFJLE1BQU07QUFBQSxFQUN2QztBQUFBLEVBRVEseUJBQXlCLFdBQW1CO0FBQ2xELFdBQU8sR0FBRyxLQUFLLGdCQUFnQixLQUFLLFNBQVMscUJBQXFCLENBQUMsR0FBRyxTQUFTO0FBQUEsRUFDakY7QUFBQSxFQUVBLE1BQWMsd0JBQXdCO0FBQ3BDLFdBQU8sRUFBRSxjQUFjLEdBQUcsb0JBQW9CLEVBQUU7QUFBQSxFQUNsRDtBQUFBLEVBRVEsc0JBQXNCLE1BQWM7QUFDMUMsVUFBTSxNQUFNLEtBQUssSUFBSTtBQUNyQixVQUFNLFdBQVcsS0FBSyx1QkFBdUIsSUFBSSxJQUFJO0FBQ3JELFVBQU0sT0FBZ0MsV0FDbEM7QUFBQSxNQUNFLGlCQUFpQixTQUFTO0FBQUEsTUFDMUIsZ0JBQWdCO0FBQUEsTUFDaEIsV0FBVyxTQUFTLFlBQVk7QUFBQSxJQUNsQyxJQUNBO0FBQUEsTUFDRSxpQkFBaUI7QUFBQSxNQUNqQixnQkFBZ0I7QUFBQSxNQUNoQixXQUFXO0FBQUEsSUFDYjtBQUNKLFNBQUssdUJBQXVCLElBQUksTUFBTSxJQUFJO0FBQzFDLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFUSx1QkFBdUIsTUFBYztBQUMzQyxTQUFLLHVCQUF1QixPQUFPLElBQUk7QUFBQSxFQUN6QztBQUFBLEVBRVEsY0FBYyxTQUFpQjtBQUNyQyxVQUFNLFFBQVEsUUFBUTtBQUFBLE1BQ3BCO0FBQUEsSUFDRjtBQUNBLFFBQUksQ0FBQyxPQUFPO0FBQ1YsYUFBTztBQUFBLElBQ1Q7QUFFQSxXQUFPO0FBQUEsTUFDTCxZQUFZLE1BQU0sQ0FBQyxFQUFFLEtBQUs7QUFBQSxNQUMxQixhQUFhLE1BQU0sQ0FBQyxFQUFFLEtBQUs7QUFBQSxJQUM3QjtBQUFBLEVBQ0Y7QUFBQSxFQUVRLGNBQWMsTUFBYTtBQUNqQyxVQUFNLGFBQWEsS0FBSyx5QkFBeUIsS0FBSyxJQUFJO0FBQzFELFdBQU87QUFBQSxNQUNMLFFBQVEsZ0JBQWdCO0FBQUEsTUFDeEIsV0FBVyxVQUFVO0FBQUEsTUFDckIsZ0JBQWdCLEtBQUssUUFBUTtBQUFBLE1BQzdCO0FBQUEsTUFDQTtBQUFBLE1BQ0EsS0FBSztBQUFBLFFBQ0g7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0YsRUFBRSxLQUFLLElBQUk7QUFBQSxFQUNiO0FBQUEsRUFFQSxNQUFjLHNCQUFzQixZQUFxQjtBQUN2RCxRQUFJO0FBQ0YsVUFBSSxLQUFLLFNBQVMsb0JBQW9CLGNBQWM7QUFDbEQsWUFBSSxZQUFZO0FBQ2QsY0FBSSx1QkFBTyxLQUFLLEVBQUUsd0ZBQWtCLGdDQUFnQyxHQUFHLEdBQUk7QUFBQSxRQUM3RTtBQUNBLGVBQU87QUFBQSxNQUNUO0FBRUEsWUFBTSxRQUFRLEtBQUsseUJBQXlCLEVBQUUsT0FBTyxDQUFDLFNBQVMsS0FBSyxjQUFjLElBQUk7QUFDdEYsWUFBTSxNQUFNLEtBQUssSUFBSTtBQUNyQixZQUFNLFlBQVksS0FBSyxJQUFJLEdBQUcsS0FBSyxTQUFTLGtCQUFrQixJQUFJLEtBQUssS0FBSyxLQUFLO0FBQ2pGLFVBQUksVUFBVTtBQUVkLGlCQUFXLFFBQVEsT0FBTztBQUN4QixjQUFNLFNBQVMsS0FBSyxJQUFJLFVBQVUsY0FBYztBQUNoRCxZQUFJLFFBQVEsU0FBUyxLQUFLLE1BQU07QUFDOUI7QUFBQSxRQUNGO0FBRUEsY0FBTSxhQUFhLEtBQUsscUJBQXFCLElBQUksS0FBSyxJQUFJLEtBQUs7QUFDL0QsWUFBSSxlQUFlLEtBQUssTUFBTSxhQUFhLFdBQVc7QUFDcEQ7QUFBQSxRQUNGO0FBRUEsY0FBTSxVQUFVLE1BQU0sS0FBSyxJQUFJLE1BQU0sS0FBSyxJQUFJO0FBQzlDLFlBQUksS0FBSyxjQUFjLE9BQU8sR0FBRztBQUMvQjtBQUFBLFFBQ0Y7QUFFQSxjQUFNLFNBQVMsTUFBTSxLQUFLLElBQUksTUFBTSxXQUFXLElBQUk7QUFDbkQsY0FBTSxhQUFhLEtBQUsseUJBQXlCLEtBQUssSUFBSTtBQUMxRCxjQUFNLEtBQUssYUFBYSxZQUFZLFFBQVEsOEJBQThCO0FBQzFFLGNBQU0sV0FBVyxNQUFNLEtBQUssNEJBQTRCLFlBQVksTUFBTTtBQUMxRSxZQUFJLENBQUMsVUFBVTtBQUNiLGdCQUFNLElBQUksTUFBTSxLQUFLLEVBQUUsc0hBQXVCLHFFQUFxRSxDQUFDO0FBQUEsUUFDdEg7QUFDQSxjQUFNLFNBQVMsTUFBTSxLQUFLLGVBQWUsVUFBVTtBQUNuRCxZQUFJLENBQUMsUUFBUTtBQUNYLGdCQUFNLElBQUksTUFBTSxLQUFLLEVBQUUsNEhBQXdCLHFFQUFxRSxDQUFDO0FBQUEsUUFDdkg7QUFDQSxjQUFNLEtBQUssSUFBSSxNQUFNLE9BQU8sTUFBTSxLQUFLLGNBQWMsSUFBSSxDQUFDO0FBQzFELGNBQU0sWUFBWSxLQUFLLG1CQUFtQixLQUFLLElBQUk7QUFDbkQsYUFBSyxVQUFVLElBQUksS0FBSyxNQUFNO0FBQUEsVUFDNUIsZ0JBQWdCLFlBQVksS0FBSyxtQkFBbUIsU0FBUyxJQUFJLEtBQUssbUJBQW1CLElBQUk7QUFBQSxVQUM3RixpQkFBaUIsUUFBUSxhQUFhLEdBQUcsS0FBSyxLQUFLLEtBQUssSUFBSSxPQUFPLFVBQVU7QUFBQSxVQUM3RTtBQUFBLFFBQ0YsQ0FBQztBQUNELG1CQUFXO0FBQUEsTUFDYjtBQUVBLFVBQUksWUFBWTtBQUNkLFlBQUk7QUFBQSxVQUNGLEtBQUs7QUFBQSxZQUNILHNCQUFPLE9BQU87QUFBQSxZQUNkLFdBQVcsT0FBTztBQUFBLFVBQ3BCO0FBQUEsVUFDQTtBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQ0EsWUFBTSxLQUFLLGdCQUFnQjtBQUMzQixhQUFPO0FBQUEsSUFDVCxTQUFTLE9BQU87QUFDZCxjQUFRLE1BQU0sc0NBQXNDLEtBQUs7QUFDekQsVUFBSSxZQUFZO0FBQ2QsWUFBSSx1QkFBTyxLQUFLLGNBQWMsS0FBSyxFQUFFLG9EQUFZLDZCQUE2QixHQUFHLEtBQUssR0FBRyxHQUFJO0FBQUEsTUFDL0Y7QUFDQSxhQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsd0JBQXdCLFlBQW9CO0FBQ3hELFVBQU0sUUFBUSxXQUFXLE1BQU0sR0FBRyxFQUFFLE9BQU8sQ0FBQyxVQUFVLE1BQU0sU0FBUyxDQUFDO0FBQ3RFLFFBQUksTUFBTSxVQUFVLEdBQUc7QUFDckI7QUFBQSxJQUNGO0FBRUEsUUFBSSxVQUFVO0FBQ2QsYUFBUyxRQUFRLEdBQUcsUUFBUSxNQUFNLFNBQVMsR0FBRyxTQUFTLEdBQUc7QUFDeEQsZ0JBQVUsVUFBVSxHQUFHLE9BQU8sSUFBSSxNQUFNLEtBQUssQ0FBQyxLQUFLLE1BQU0sS0FBSztBQUM5RCxZQUFNLFdBQVcsTUFBTSxLQUFLLFdBQVc7QUFBQSxRQUNyQyxLQUFLLEtBQUssZUFBZSxPQUFPO0FBQUEsUUFDaEMsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLFVBQ1AsZUFBZSxLQUFLLGdCQUFnQjtBQUFBLFFBQ3RDO0FBQUEsTUFDRixDQUFDO0FBRUQsVUFBSSxDQUFDLENBQUMsS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLEdBQUcsRUFBRSxTQUFTLFNBQVMsTUFBTSxHQUFHO0FBQzVFLGNBQU0sSUFBSSxNQUFNLG9CQUFvQixPQUFPLGdCQUFnQixTQUFTLE1BQU0sRUFBRTtBQUFBLE1BQzlFO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsZUFBZSxZQUE4QztBQUN6RSxVQUFNLFFBQVEsb0JBQUksSUFBNkI7QUFDL0MsVUFBTSxjQUFjLG9CQUFJLElBQVk7QUFDcEMsVUFBTSxVQUFVLENBQUMsS0FBSyxnQkFBZ0IsVUFBVSxDQUFDO0FBQ2pELFVBQU0sVUFBVSxvQkFBSSxJQUFZO0FBRWhDLFdBQU8sUUFBUSxTQUFTLEdBQUc7QUFDekIsWUFBTSxVQUFVLEtBQUssZ0JBQWdCLFFBQVEsSUFBSSxLQUFLLFVBQVU7QUFDaEUsVUFBSSxRQUFRLElBQUksT0FBTyxHQUFHO0FBQ3hCO0FBQUEsTUFDRjtBQUVBLGNBQVEsSUFBSSxPQUFPO0FBQ25CLFlBQU0sVUFBVSxNQUFNLEtBQUssb0JBQW9CLE9BQU87QUFDdEQsaUJBQVcsU0FBUyxTQUFTO0FBQzNCLFlBQUksTUFBTSxjQUFjO0FBQ3RCLHNCQUFZLElBQUksTUFBTSxVQUFVO0FBQ2hDLGtCQUFRLEtBQUssTUFBTSxVQUFVO0FBQzdCO0FBQUEsUUFDRjtBQUVBLFlBQUksTUFBTSxNQUFNO0FBQ2QsZ0JBQU0sSUFBSSxNQUFNLFlBQVksTUFBTSxJQUFJO0FBQUEsUUFDeEM7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUVBLFdBQU8sRUFBRSxPQUFPLFlBQVk7QUFBQSxFQUM5QjtBQUFBLEVBRUEsTUFBYyxvQkFBb0IsaUJBQXlCO0FBQ3pELFVBQU0sZ0JBQWdCLEtBQUssZ0JBQWdCLGVBQWU7QUFDMUQsVUFBTSxXQUFXLE1BQU0sS0FBSyxXQUFXO0FBQUEsTUFDckMsS0FBSyxLQUFLLGVBQWUsYUFBYTtBQUFBLE1BQ3RDLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxRQUNQLGVBQWUsS0FBSyxnQkFBZ0I7QUFBQSxRQUNwQyxPQUFPO0FBQUEsTUFDVDtBQUFBLElBQ0YsQ0FBQztBQUVELFFBQUksU0FBUyxXQUFXLEtBQUs7QUFDM0IsYUFBTyxDQUFDO0FBQUEsSUFDVjtBQUVBLFFBQUksU0FBUyxTQUFTLE9BQU8sU0FBUyxVQUFVLEtBQUs7QUFDbkQsWUFBTSxJQUFJLE1BQU0sdUJBQXVCLGFBQWEsZ0JBQWdCLFNBQVMsTUFBTSxFQUFFO0FBQUEsSUFDdkY7QUFFQSxVQUFNLFVBQVUsS0FBSyxXQUFXLFNBQVMsV0FBVztBQUNwRCxXQUFPLEtBQUssOEJBQThCLFNBQVMsYUFBYTtBQUFBLEVBQ2xFO0FBQUEsRUFFUSw4QkFBOEIsU0FBaUIsZUFBdUIsbUJBQW1CLE9BQU87QUFDdEcsVUFBTSxTQUFTLElBQUksVUFBVTtBQUM3QixVQUFNRixZQUFXLE9BQU8sZ0JBQWdCLFNBQVMsaUJBQWlCO0FBQ2xFLFFBQUlBLFVBQVMscUJBQXFCLGFBQWEsRUFBRSxTQUFTLEdBQUc7QUFDM0QsWUFBTSxJQUFJLE1BQU0sS0FBSyxFQUFFLGtFQUFxQiwrQ0FBK0MsQ0FBQztBQUFBLElBQzlGO0FBRUEsVUFBTSxVQUFVLG9CQUFJLElBQW1GO0FBQ3ZHLGVBQVcsV0FBVyxNQUFNLEtBQUtBLFVBQVMscUJBQXFCLEdBQUcsQ0FBQyxHQUFHO0FBQ3BFLFVBQUksUUFBUSxjQUFjLFlBQVk7QUFDcEM7QUFBQSxNQUNGO0FBRUEsWUFBTSxPQUFPLEtBQUssb0JBQW9CLFNBQVMsTUFBTTtBQUNyRCxVQUFJLENBQUMsTUFBTTtBQUNUO0FBQUEsTUFDRjtBQUVBLFlBQU0sYUFBYSxLQUFLLGlCQUFpQixJQUFJO0FBQzdDLFVBQUksQ0FBQyxZQUFZO0FBQ2Y7QUFBQSxNQUNGO0FBRUEsWUFBTSxlQUFlLEtBQUssb0JBQW9CLFNBQVMsWUFBWTtBQUNuRSxZQUFNLGlCQUFpQixlQUFlLEtBQUssZ0JBQWdCLFVBQVUsSUFBSSxXQUFXLFFBQVEsUUFBUSxFQUFFO0FBQ3RHLFVBQ0UsQ0FBQyxxQkFFQyxtQkFBbUIsaUJBQ25CLG1CQUFtQixjQUFjLFFBQVEsUUFBUSxFQUFFLElBRXJEO0FBQ0E7QUFBQSxNQUNGO0FBRUEsWUFBTSxXQUFXLEtBQUssb0JBQW9CLFNBQVMsa0JBQWtCO0FBQ3JFLFlBQU0sYUFBYSxPQUFPLFNBQVMsVUFBVSxFQUFFO0FBQy9DLFlBQU0sT0FBTyxPQUFPLFNBQVMsVUFBVSxJQUFJLGFBQWE7QUFDeEQsWUFBTSxlQUFlLEtBQUssb0JBQW9CLFNBQVMsaUJBQWlCO0FBQ3hFLFlBQU0sY0FBYyxLQUFLLE1BQU0sWUFBWTtBQUMzQyxZQUFNLGVBQWUsT0FBTyxTQUFTLFdBQVcsSUFBSSxjQUFjO0FBRWxFLGNBQVEsSUFBSSxnQkFBZ0I7QUFBQSxRQUMxQixZQUFZO0FBQUEsUUFDWjtBQUFBLFFBQ0EsTUFBTSxlQUNGLFNBQ0E7QUFBQSxVQUNFLFlBQVk7QUFBQSxVQUNaO0FBQUEsVUFDQTtBQUFBLFVBQ0EsV0FBVyxLQUFLLHlCQUF5QjtBQUFBLFlBQ3ZDO0FBQUEsWUFDQTtBQUFBLFVBQ0YsQ0FBQztBQUFBLFFBQ0g7QUFBQSxNQUNOLENBQUM7QUFBQSxJQUNIO0FBRUEsV0FBTyxDQUFDLEdBQUcsUUFBUSxPQUFPLENBQUM7QUFBQSxFQUM3QjtBQUFBLEVBRVEsb0JBQW9CLFFBQWlCLFdBQW1CO0FBQzlELGVBQVcsV0FBVyxNQUFNLEtBQUssT0FBTyxxQkFBcUIsR0FBRyxDQUFDLEdBQUc7QUFDbEUsVUFBSSxRQUFRLGNBQWMsV0FBVztBQUNuQyxlQUFPLFFBQVEsYUFBYSxLQUFLLEtBQUs7QUFBQSxNQUN4QztBQUFBLElBQ0Y7QUFFQSxXQUFPO0FBQUEsRUFDVDtBQUFBLEVBRVEsb0JBQW9CLFFBQWlCLFdBQW1CO0FBQzlELFdBQU8sTUFBTSxLQUFLLE9BQU8scUJBQXFCLEdBQUcsQ0FBQyxFQUFFLEtBQUssQ0FBQyxZQUFZLFFBQVEsY0FBYyxTQUFTO0FBQUEsRUFDdkc7QUFBQSxFQUVRLGlCQUFpQixNQUFjO0FBQ3JDLFVBQU0sVUFBVSxHQUFHLEtBQUssU0FBUyxVQUFVLFFBQVEsUUFBUSxFQUFFLENBQUM7QUFDOUQsVUFBTSxXQUFXLElBQUksSUFBSSxNQUFNLE9BQU87QUFDdEMsVUFBTSxXQUFXLElBQUksSUFBSSxPQUFPLEVBQUUsU0FBUyxRQUFRLFFBQVEsR0FBRztBQUM5RCxVQUFNLGNBQWMsS0FBSyxlQUFlLFNBQVMsUUFBUTtBQUN6RCxRQUFJLENBQUMsWUFBWSxXQUFXLFFBQVEsR0FBRztBQUNyQyxhQUFPO0FBQUEsSUFDVDtBQUVBLFdBQU8sWUFBWSxNQUFNLFNBQVMsTUFBTSxFQUFFLFFBQVEsUUFBUSxFQUFFO0FBQUEsRUFDOUQ7QUFBQSxFQUVRLGVBQWUsVUFBa0I7QUFDdkMsV0FBTyxTQUNKLE1BQU0sR0FBRyxFQUNULElBQUksQ0FBQyxZQUFZO0FBQ2hCLFVBQUksQ0FBQyxTQUFTO0FBQ1osZUFBTztBQUFBLE1BQ1Q7QUFFQSxVQUFJO0FBQ0YsZUFBTyxtQkFBbUIsT0FBTztBQUFBLE1BQ25DLFFBQVE7QUFDTixlQUFPO0FBQUEsTUFDVDtBQUFBLElBQ0YsQ0FBQyxFQUNBLEtBQUssR0FBRztBQUFBLEVBQ2I7QUFBQSxFQUVRLCtCQUErQixpQkFBOEIsWUFBb0I7QUFDdkYsVUFBTSxXQUFXLG9CQUFJLElBQVksQ0FBQyxLQUFLLGdCQUFnQixVQUFVLENBQUMsQ0FBQztBQUNuRSxlQUFXLGNBQWMsaUJBQWlCO0FBQ3hDLFlBQU0sUUFBUSxXQUFXLE1BQU0sR0FBRyxFQUFFLE9BQU8sQ0FBQyxVQUFVLE1BQU0sU0FBUyxDQUFDO0FBQ3RFLFVBQUksVUFBVTtBQUNkLGVBQVMsUUFBUSxHQUFHLFFBQVEsTUFBTSxTQUFTLEdBQUcsU0FBUyxHQUFHO0FBQ3hELGtCQUFVLFVBQVUsR0FBRyxPQUFPLElBQUksTUFBTSxLQUFLLENBQUMsS0FBSyxNQUFNLEtBQUs7QUFDOUQsaUJBQVMsSUFBSSxLQUFLLGdCQUFnQixPQUFPLENBQUM7QUFBQSxNQUM1QztBQUFBLElBQ0Y7QUFFQSxXQUFPO0FBQUEsRUFDVDtBQUFBLEVBRUEsTUFBYyw2QkFBNkIsbUJBQWdDLHFCQUFrQztBQUMzRyxRQUFJLFVBQVU7QUFDZCxVQUFNLGFBQWEsQ0FBQyxHQUFHLGlCQUFpQixFQUNyQyxPQUFPLENBQUMsZUFBZSxDQUFDLG9CQUFvQixJQUFJLFVBQVUsQ0FBQyxFQUMzRCxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxjQUFjLENBQUMsQ0FBQztBQUUzRCxlQUFXLGNBQWMsWUFBWTtBQUNuQyxZQUFNLFdBQVcsTUFBTSxLQUFLLFdBQVc7QUFBQSxRQUNyQyxLQUFLLEtBQUssZUFBZSxVQUFVO0FBQUEsUUFDbkMsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLFVBQ1AsZUFBZSxLQUFLLGdCQUFnQjtBQUFBLFFBQ3RDO0FBQUEsTUFDRixDQUFDO0FBRUQsVUFBSSxDQUFDLEtBQUssS0FBSyxLQUFLLEdBQUcsRUFBRSxTQUFTLFNBQVMsTUFBTSxHQUFHO0FBQ2xELFlBQUksU0FBUyxXQUFXLEtBQUs7QUFDM0IscUJBQVc7QUFBQSxRQUNiO0FBQ0E7QUFBQSxNQUNGO0FBRUEsVUFBSSxDQUFDLEtBQUssR0FBRyxFQUFFLFNBQVMsU0FBUyxNQUFNLEdBQUc7QUFDeEM7QUFBQSxNQUNGO0FBRUEsWUFBTSxJQUFJLE1BQU0sK0JBQStCLFVBQVUsZ0JBQWdCLFNBQVMsTUFBTSxFQUFFO0FBQUEsSUFDNUY7QUFFQSxXQUFPO0FBQUEsRUFDVDtBQUFBLEVBRUEsTUFBYyxzQkFBc0I7QUFDbEMsUUFBSSxLQUFLLE1BQU0sV0FBVyxHQUFHO0FBQzNCO0FBQUEsSUFDRjtBQUVBLFVBQU0sVUFBMkIsQ0FBQztBQUNsQyxlQUFXLFFBQVEsQ0FBQyxHQUFHLEtBQUssS0FBSyxHQUFHO0FBQ2xDLGNBQVEsS0FBSyxLQUFLLGlCQUFpQixJQUFJLENBQUM7QUFBQSxJQUMxQztBQUVBLFFBQUksUUFBUSxTQUFTLEdBQUc7QUFDdEIsWUFBTSxRQUFRLFdBQVcsT0FBTztBQUFBLElBQ2xDO0FBQUEsRUFDRjtBQUFBLEVBRVEsbUJBQW1CLFdBQWdDO0FBQ3pELFVBQU0sVUFBVSxVQUFVLEVBQ3ZCLE1BQU0sQ0FBQyxVQUFVO0FBQ2hCLGNBQVEsTUFBTSxnREFBZ0QsS0FBSztBQUFBLElBQ3JFLENBQUMsRUFDQSxRQUFRLE1BQU07QUFDYixXQUFLLDZCQUE2QixPQUFPLE9BQU87QUFBQSxJQUNsRCxDQUFDO0FBQ0gsU0FBSyw2QkFBNkIsSUFBSSxPQUFPO0FBQUEsRUFDL0M7QUFBQSxFQUVBLE1BQWMsK0JBQStCO0FBQzNDLFdBQU8sS0FBSyw2QkFBNkIsT0FBTyxHQUFHO0FBQ2pELFlBQU0sUUFBUSxXQUFXLENBQUMsR0FBRyxLQUFLLDRCQUE0QixDQUFDO0FBQUEsSUFDakU7QUFBQSxFQUNGO0FBQUEsRUFFUSxpQkFBaUIsTUFBa0I7QUFDekMsVUFBTSxXQUFXLEtBQUssb0JBQW9CLElBQUksS0FBSyxFQUFFO0FBQ3JELFFBQUksVUFBVTtBQUNaLGFBQU87QUFBQSxJQUNUO0FBRUEsVUFBTSxVQUFVLEtBQUssWUFBWSxJQUFJLEVBQUUsUUFBUSxNQUFNO0FBQ25ELFdBQUssb0JBQW9CLE9BQU8sS0FBSyxFQUFFO0FBQUEsSUFDekMsQ0FBQztBQUNELFNBQUssb0JBQW9CLElBQUksS0FBSyxJQUFJLE9BQU87QUFDN0MsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVBLE1BQWMsNkJBQTZCLFlBQXFCO0FBQzlELFVBQU0sS0FBSyxvQkFBb0I7QUFFL0IsUUFBSSxLQUFLLE1BQU0sU0FBUyxLQUFLLEtBQUssa0JBQWtCLE9BQU8sS0FBSyxLQUFLLG9CQUFvQixPQUFPLEdBQUc7QUFDakcsV0FBSyxrQkFBa0IsS0FBSyxJQUFJO0FBQ2hDLFdBQUssc0JBQXNCLEtBQUs7QUFBQSxRQUM5QjtBQUFBLFFBQ0E7QUFBQSxNQUNGO0FBQ0EsWUFBTSxLQUFLLGdCQUFnQjtBQUMzQixVQUFJLFlBQVk7QUFDZCxZQUFJLHVCQUFPLEtBQUsscUJBQXFCLEdBQUk7QUFBQSxNQUMzQztBQUNBLGFBQU87QUFBQSxJQUNUO0FBRUEsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVBLE1BQWMsbUJBQW1CLFVBQWlCO0FBQ2hELFFBQUk7QUFDRixZQUFNLFVBQVUsTUFBTSxLQUFLLElBQUksTUFBTSxLQUFLLFFBQVE7QUFDbEQsWUFBTSxlQUFlLE1BQU0sS0FBSyx3QkFBd0IsU0FBUyxRQUFRO0FBRXpFLFVBQUksYUFBYSxXQUFXLEdBQUc7QUFDN0IsWUFBSSx1QkFBTyxLQUFLLEVBQUUsd0ZBQWtCLDRDQUE0QyxDQUFDO0FBQ2pGO0FBQUEsTUFDRjtBQUVBLFVBQUksVUFBVTtBQUNkLGlCQUFXLGVBQWUsY0FBYztBQUN0QyxrQkFBVSxRQUFRLE1BQU0sWUFBWSxRQUFRLEVBQUUsS0FBSyxZQUFZLFNBQVM7QUFBQSxNQUMxRTtBQUVBLFVBQUksWUFBWSxTQUFTO0FBQ3ZCLFlBQUksdUJBQU8sS0FBSyxFQUFFLDRFQUFnQiwyQkFBMkIsQ0FBQztBQUM5RDtBQUFBLE1BQ0Y7QUFFQSxZQUFNLEtBQUssSUFBSSxNQUFNLE9BQU8sVUFBVSxPQUFPO0FBQzdDLFdBQUsseUJBQXlCLFNBQVMsTUFBTSxXQUFXO0FBRXhELFVBQUksS0FBSyxTQUFTLHdCQUF3QjtBQUN4QyxtQkFBVyxlQUFlLGNBQWM7QUFDdEMsY0FBSSxZQUFZLFlBQVk7QUFDMUIsa0JBQU0sS0FBSyxjQUFjLFlBQVksVUFBVTtBQUFBLFVBQ2pEO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFFQSxVQUFJLHVCQUFPLEtBQUssRUFBRSxzQkFBTyxhQUFhLE1BQU0sMENBQWlCLFlBQVksYUFBYSxNQUFNLHNCQUFzQixDQUFDO0FBQUEsSUFDckgsU0FBUyxPQUFPO0FBQ2QsY0FBUSxNQUFNLCtCQUErQixLQUFLO0FBQ2xELFVBQUksdUJBQU8sS0FBSyxjQUFjLEtBQUssRUFBRSw0QkFBUSxlQUFlLEdBQUcsS0FBSyxHQUFHLEdBQUk7QUFBQSxJQUM3RTtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsWUFBWSxNQUFrQjtBQUMxQyxTQUFLLGtCQUFrQixJQUFJLEtBQUssRUFBRTtBQUNsQyxRQUFJO0FBQ0YsWUFBTSxTQUFTLEtBQUssb0JBQW9CLEtBQUssVUFBVTtBQUN2RCxZQUFNLFdBQVcsTUFBTSxLQUFLO0FBQUEsUUFDMUI7QUFBQSxRQUNBLEtBQUssWUFBWSxLQUFLLHdCQUF3QixLQUFLLFFBQVE7QUFBQSxRQUMzRCxLQUFLO0FBQUEsTUFDUDtBQUNBLFlBQU0sYUFBYSxNQUFNLEtBQUssOEJBQThCLFNBQVMsVUFBVSxTQUFTLE1BQU07QUFDOUYsWUFBTSxhQUFhLEtBQUssZ0JBQWdCLFVBQVU7QUFDbEQsWUFBTSxXQUFXLE1BQU0sS0FBSyxXQUFXO0FBQUEsUUFDckMsS0FBSyxLQUFLLGVBQWUsVUFBVTtBQUFBLFFBQ25DLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxVQUNQLGVBQWUsS0FBSyxnQkFBZ0I7QUFBQSxVQUNwQyxnQkFBZ0IsU0FBUztBQUFBLFFBQzNCO0FBQUEsUUFDQSxNQUFNLFNBQVM7QUFBQSxNQUNqQixDQUFDO0FBRUQsVUFBSSxTQUFTLFNBQVMsT0FBTyxTQUFTLFVBQVUsS0FBSztBQUNuRCxjQUFNLElBQUksTUFBTSw2QkFBNkIsU0FBUyxNQUFNLEVBQUU7QUFBQSxNQUNoRTtBQUVBLFlBQU0sV0FBVyxNQUFNLEtBQUs7QUFBQSxRQUMxQixLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsUUFDTCxLQUFLLHVCQUF1QixHQUFHLGVBQWUsS0FBSyxVQUFVLElBQUksU0FBUyxRQUFRO0FBQUEsTUFDcEY7QUFDQSxVQUFJLENBQUMsVUFBVTtBQUNiLGNBQU0sSUFBSSxNQUFNLEtBQUssRUFBRSx3SUFBMEIsc0VBQXNFLENBQUM7QUFBQSxNQUMxSDtBQUVBLFdBQUssUUFBUSxLQUFLLE1BQU0sT0FBTyxDQUFDLFNBQVMsS0FBSyxPQUFPLEtBQUssRUFBRTtBQUM1RCxZQUFNLEtBQUssZ0JBQWdCO0FBQzNCLFdBQUsseUJBQXlCLEtBQUssVUFBVSxXQUFXO0FBQ3hELFVBQUksdUJBQU8sS0FBSyxFQUFFLDhDQUFXLDhCQUE4QixDQUFDO0FBQUEsSUFDOUQsU0FBUyxPQUFPO0FBQ2QsY0FBUSxNQUFNLHNDQUFzQyxLQUFLO0FBQ3pELFdBQUssWUFBWTtBQUNqQixXQUFLLFlBQVksaUJBQWlCLFFBQVEsTUFBTSxVQUFVLE9BQU8sS0FBSztBQUN0RSxZQUFNLEtBQUssZ0JBQWdCO0FBQzNCLFVBQUksS0FBSyxZQUFZLEtBQUssU0FBUyxrQkFBa0I7QUFDbkQsY0FBTSxLQUFLLG1CQUFtQixLQUFLLFVBQVUsS0FBSyxJQUFJLEtBQUssYUFBYSxLQUFLLHVCQUF1QixLQUFLLFVBQVUsS0FBSyxTQUFTLENBQUM7QUFDbEksYUFBSyxRQUFRLEtBQUssTUFBTSxPQUFPLENBQUMsU0FBUyxLQUFLLE9BQU8sS0FBSyxFQUFFO0FBQzVELGNBQU0sS0FBSyxnQkFBZ0I7QUFDM0IsWUFBSSx1QkFBTyxLQUFLLGNBQWMsS0FBSyxFQUFFLG9EQUFZLGlDQUFpQyxHQUFHLEtBQUssR0FBRyxHQUFJO0FBQUEsTUFDbkcsT0FBTztBQUNMLGFBQUssY0FBYyxJQUFJO0FBQUEsTUFDekI7QUFBQSxJQUNGLFVBQUU7QUFDQSxXQUFLLGtCQUFrQixPQUFPLEtBQUssRUFBRTtBQUFBLElBQ3ZDO0FBQUEsRUFDRjtBQUFBLEVBRVEsY0FBYyxNQUFrQjtBQUN0QyxVQUFNLFdBQVcsS0FBSyxjQUFjLElBQUksS0FBSyxFQUFFO0FBQy9DLFFBQUksVUFBVTtBQUNaLGFBQU8sYUFBYSxRQUFRO0FBQUEsSUFDOUI7QUFFQSxVQUFNLFFBQVEsS0FBSyxJQUFJLEdBQUcsS0FBSyxTQUFTLGlCQUFpQixJQUFJLE1BQU8sS0FBSztBQUN6RSxVQUFNLFlBQVksT0FBTyxXQUFXLE1BQU07QUFDeEMsV0FBSyxjQUFjLE9BQU8sS0FBSyxFQUFFO0FBQ2pDLFdBQUssS0FBSyxpQkFBaUIsSUFBSTtBQUFBLElBQ2pDLEdBQUcsS0FBSztBQUNSLFNBQUssY0FBYyxJQUFJLEtBQUssSUFBSSxTQUFTO0FBQUEsRUFDM0M7QUFBQSxFQUVBLE1BQWMsbUJBQW1CLFVBQWtCLFFBQWdCLGFBQXFCLGFBQXFCO0FBQzNHLFVBQU0sbUJBQW1CLEtBQUssZ0NBQWdDLFVBQVUsUUFBUSxhQUFhLFdBQVc7QUFDeEcsUUFBSSxrQkFBa0I7QUFDcEIsYUFBTztBQUFBLElBQ1Q7QUFFQSxVQUFNLE9BQU8sS0FBSyxJQUFJLE1BQU0sc0JBQXNCLFFBQVE7QUFDMUQsUUFBSSxFQUFFLGdCQUFnQix3QkFBUTtBQUM1QixhQUFPO0FBQUEsSUFDVDtBQUVBLFVBQU0sVUFBVSxNQUFNLEtBQUssSUFBSSxNQUFNLEtBQUssSUFBSTtBQUM5QyxRQUFJLFFBQVEsU0FBUyxXQUFXLEdBQUc7QUFDakMsWUFBTSxVQUFVLFFBQVEsUUFBUSxhQUFhLFdBQVc7QUFDeEQsVUFBSSxZQUFZLFNBQVM7QUFDdkIsY0FBTSxLQUFLLElBQUksTUFBTSxPQUFPLE1BQU0sT0FBTztBQUN6QyxlQUFPO0FBQUEsTUFDVDtBQUFBLElBQ0Y7QUFFQSxVQUFNLFVBQVUsSUFBSSxPQUFPLHNDQUFzQyxLQUFLLGFBQWEsTUFBTSxDQUFDLHFCQUFzQixHQUFHO0FBQ25ILFFBQUksUUFBUSxLQUFLLE9BQU8sR0FBRztBQUN6QixZQUFNLFVBQVUsUUFBUSxRQUFRLFNBQVMsV0FBVztBQUNwRCxVQUFJLFlBQVksU0FBUztBQUN2QixjQUFNLEtBQUssSUFBSSxNQUFNLE9BQU8sTUFBTSxPQUFPO0FBQ3pDLGVBQU87QUFBQSxNQUNUO0FBQUEsSUFDRjtBQUVBLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFUSx1QkFBdUIsVUFBa0IsU0FBa0I7QUFDakUsVUFBTSxXQUFXLEtBQUssV0FBVyxRQUFRO0FBQ3pDLFVBQU0sY0FBYyxLQUFLLFdBQVcsV0FBVyxLQUFLLEVBQUUsNEJBQVEsZUFBZSxDQUFDO0FBQzlFLFdBQU8sa0RBQWtELFFBQVEsS0FBSyxLQUFLLFdBQVcsS0FBSyxrQkFBa0IsUUFBUSxDQUFDLENBQUMsS0FBSyxXQUFXO0FBQUEsRUFDekk7QUFBQSxFQUVRLFdBQVcsT0FBZTtBQUNoQyxXQUFPLE1BQ0osUUFBUSxNQUFNLE9BQU8sRUFDckIsUUFBUSxNQUFNLFFBQVEsRUFDdEIsUUFBUSxNQUFNLE1BQU0sRUFDcEIsUUFBUSxNQUFNLE1BQU07QUFBQSxFQUN6QjtBQUFBLEVBRVEsYUFBYSxPQUFlO0FBQ2xDLFdBQU8sTUFDSixRQUFRLFdBQVcsR0FBSSxFQUN2QixRQUFRLFNBQVMsR0FBRyxFQUNwQixRQUFRLFNBQVMsR0FBRyxFQUNwQixRQUFRLFVBQVUsR0FBRztBQUFBLEVBQzFCO0FBQUEsRUFFQSxNQUFjLHdCQUF3QixZQUFvQjtBQUN4RCxVQUFNLFdBQVcsTUFBTSxLQUFLLFdBQVc7QUFBQSxNQUNyQyxLQUFLLEtBQUssZUFBZSxVQUFVO0FBQUEsTUFDbkMsUUFBUTtBQUFBLE1BQ1IsU0FBUztBQUFBLFFBQ1AsZUFBZSxLQUFLLGdCQUFnQjtBQUFBLE1BQ3RDO0FBQUEsSUFDRixDQUFDO0FBRUQsUUFBSSxTQUFTLFNBQVMsT0FBTyxTQUFTLFVBQVUsS0FBSztBQUNuRCxZQUFNLElBQUksTUFBTSw0QkFBNEIsU0FBUyxNQUFNLEVBQUU7QUFBQSxJQUMvRDtBQUVBLFVBQU0sT0FBTyxJQUFJLEtBQUssQ0FBQyxTQUFTLFdBQVcsR0FBRztBQUFBLE1BQzVDLE1BQU0sU0FBUyxRQUFRLGNBQWMsS0FBSztBQUFBLElBQzVDLENBQUM7QUFDRCxVQUFNLFVBQVUsSUFBSSxnQkFBZ0IsSUFBSTtBQUN4QyxTQUFLLFNBQVMsSUFBSSxPQUFPO0FBQ3pCLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFUSxvQkFBb0IsUUFBcUI7QUFDL0MsVUFBTSxRQUFRLElBQUksV0FBVyxNQUFNO0FBQ25DLFVBQU0sWUFBWTtBQUNsQixRQUFJLFNBQVM7QUFDYixhQUFTLFFBQVEsR0FBRyxRQUFRLE1BQU0sUUFBUSxTQUFTLFdBQVc7QUFDNUQsWUFBTSxRQUFRLE1BQU0sU0FBUyxPQUFPLFFBQVEsU0FBUztBQUNyRCxnQkFBVSxPQUFPLGFBQWEsR0FBRyxLQUFLO0FBQUEsSUFDeEM7QUFDQSxXQUFPLEtBQUssTUFBTTtBQUFBLEVBQ3BCO0FBQUEsRUFFUSxvQkFBb0IsUUFBZ0I7QUFDMUMsVUFBTSxTQUFTLEtBQUssTUFBTTtBQUMxQixVQUFNLFFBQVEsSUFBSSxXQUFXLE9BQU8sTUFBTTtBQUMxQyxhQUFTLFFBQVEsR0FBRyxRQUFRLE9BQU8sUUFBUSxTQUFTLEdBQUc7QUFDckQsWUFBTSxLQUFLLElBQUksT0FBTyxXQUFXLEtBQUs7QUFBQSxJQUN4QztBQUNBLFdBQU8sTUFBTSxPQUFPLE1BQU0sTUFBTSxZQUFZLE1BQU0sYUFBYSxNQUFNLFVBQVU7QUFBQSxFQUNqRjtBQUFBLEVBRVEsa0JBQWtCLE1BQW1CLE9BQW9CO0FBQy9ELFVBQU0sSUFBSSxJQUFJLFdBQVcsSUFBSTtBQUM3QixVQUFNLElBQUksSUFBSSxXQUFXLEtBQUs7QUFDOUIsUUFBSSxFQUFFLFdBQVcsRUFBRSxRQUFRO0FBQ3pCLGFBQU87QUFBQSxJQUNUO0FBRUEsYUFBUyxRQUFRLEdBQUcsUUFBUSxFQUFFLFFBQVEsU0FBUyxHQUFHO0FBQ2hELFVBQUksRUFBRSxLQUFLLE1BQU0sRUFBRSxLQUFLLEdBQUc7QUFDekIsZUFBTztBQUFBLE1BQ1Q7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVRLHVCQUF1QixVQUFrQjtBQUMvQyxVQUFNLFlBQVksU0FBUyxNQUFNLEdBQUcsRUFBRSxDQUFDLEdBQUcsUUFBUSxRQUFRLEtBQUssS0FBSztBQUNwRSxXQUFPLGdCQUFnQixLQUFLLElBQUksQ0FBQyxJQUFJLFNBQVM7QUFBQSxFQUNoRDtBQUFBLEVBRVEsYUFBYSxPQUFlO0FBQ2xDLFdBQU8sTUFBTSxRQUFRLHVCQUF1QixNQUFNO0FBQUEsRUFDcEQ7QUFBQSxFQUVRLGdDQUFnQyxVQUFrQixRQUFnQixhQUFxQixhQUFxQjtBQUNsSCxRQUFJLFdBQVc7QUFDZixVQUFNLFNBQVMsS0FBSyxJQUFJLFVBQVUsZ0JBQWdCLFVBQVU7QUFFNUQsZUFBVyxRQUFRLFFBQVE7QUFDekIsWUFBTSxPQUFPLEtBQUs7QUFDbEIsVUFBSSxFQUFFLGdCQUFnQiwrQkFBZTtBQUNuQztBQUFBLE1BQ0Y7QUFFQSxVQUFJLENBQUMsS0FBSyxRQUFRLEtBQUssS0FBSyxTQUFTLFVBQVU7QUFDN0M7QUFBQSxNQUNGO0FBRUEsWUFBTSxTQUFTLEtBQUs7QUFDcEIsWUFBTSxVQUFVLE9BQU8sU0FBUztBQUNoQyxVQUFJLFVBQVU7QUFFZCxVQUFJLFFBQVEsU0FBUyxXQUFXLEdBQUc7QUFDakMsa0JBQVUsUUFBUSxRQUFRLGFBQWEsV0FBVztBQUFBLE1BQ3BELE9BQU87QUFDTCxjQUFNLFVBQVUsSUFBSTtBQUFBLFVBQ2xCLHNDQUFzQyxLQUFLLGFBQWEsTUFBTSxDQUFDO0FBQUEsVUFDL0Q7QUFBQSxRQUNGO0FBQ0Esa0JBQVUsUUFBUSxRQUFRLFNBQVMsV0FBVztBQUFBLE1BQ2hEO0FBRUEsVUFBSSxZQUFZLFNBQVM7QUFDdkIsZUFBTyxTQUFTLE9BQU87QUFDdkIsbUJBQVc7QUFBQSxNQUNiO0FBQUEsSUFDRjtBQUVBLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFQSxNQUFjLG9CQUFvQixJQUFpQixLQUFtQztBQUNwRixVQUFNLGNBQWMsTUFBTSxLQUFLLEdBQUcsaUJBQThCLHNCQUFzQixDQUFDO0FBQ3ZGLFVBQU0sUUFBUTtBQUFBLE1BQ1osWUFBWSxJQUFJLE9BQU8sU0FBUztBQUM5QixZQUFJLGdCQUFnQixrQkFBa0I7QUFDcEMsZ0JBQU0sS0FBSyxnQkFBZ0IsSUFBSTtBQUMvQjtBQUFBLFFBQ0Y7QUFFQSxjQUFNLGFBQWEsS0FBSyxhQUFhLG9CQUFvQjtBQUN6RCxZQUFJLENBQUMsWUFBWTtBQUNmO0FBQUEsUUFDRjtBQUVBLGNBQU0sTUFBTSxTQUFTLGNBQWMsS0FBSztBQUN4QyxZQUFJLE1BQU0sS0FBSyxhQUFhLFlBQVksS0FBSyxLQUFLLGFBQWEsS0FBSyxLQUFLO0FBQ3pFLFlBQUksYUFBYSxzQkFBc0IsVUFBVTtBQUNqRCxZQUFJLFVBQVUsSUFBSSx1QkFBdUIsWUFBWTtBQUNyRCxhQUFLLFlBQVksR0FBRztBQUNwQixjQUFNLEtBQUssZ0JBQWdCLEdBQUc7QUFBQSxNQUNoQyxDQUFDO0FBQUEsSUFDSDtBQUVBLFVBQU0sY0FBYyxNQUFNLEtBQUssR0FBRyxpQkFBbUMsYUFBYSxlQUFlLE1BQU0sQ0FBQztBQUN4RyxVQUFNLFFBQVEsSUFBSSxZQUFZLElBQUksT0FBTyxRQUFRLEtBQUssZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDO0FBRTNFLFFBQUksU0FBUyxJQUFJLHdCQUF3QixFQUFFLENBQUM7QUFBQSxFQUM5QztBQUFBLEVBRUEsTUFBYyx1QkFBdUIsUUFBZ0IsSUFBaUIsS0FBbUM7QUFDdkcsVUFBTSxTQUFTLEtBQUssc0JBQXNCLE1BQU07QUFDaEQsUUFBSSxDQUFDLFFBQVEsTUFBTTtBQUNqQixTQUFHLFNBQVMsT0FBTztBQUFBLFFBQ2pCLE1BQU0sS0FBSyxFQUFFLDRFQUFnQix5Q0FBeUM7QUFBQSxNQUN4RSxDQUFDO0FBQ0Q7QUFBQSxJQUNGO0FBRUEsVUFBTSxNQUFNLFNBQVMsY0FBYyxLQUFLO0FBQ3hDLFFBQUksTUFBTSxPQUFPLE9BQU8sT0FBTztBQUMvQixRQUFJLGFBQWEsc0JBQXNCLE9BQU8sSUFBSTtBQUNsRCxRQUFJLFVBQVUsSUFBSSx1QkFBdUIsWUFBWTtBQUNyRCxPQUFHLE1BQU07QUFDVCxPQUFHLFlBQVksR0FBRztBQUNsQixVQUFNLEtBQUssZ0JBQWdCLEdBQUc7QUFDOUIsUUFBSSxTQUFTLElBQUksd0JBQXdCLEVBQUUsQ0FBQztBQUFBLEVBQzlDO0FBQUEsRUFFUSxzQkFBc0IsUUFBZ0I7QUFDNUMsVUFBTSxTQUF3QyxFQUFFLE1BQU0sSUFBSSxLQUFLLEdBQUc7QUFDbEUsZUFBVyxXQUFXLE9BQU8sTUFBTSxPQUFPLEdBQUc7QUFDM0MsWUFBTSxPQUFPLFFBQVEsS0FBSztBQUMxQixVQUFJLENBQUMsTUFBTTtBQUNUO0FBQUEsTUFDRjtBQUVBLFlBQU0saUJBQWlCLEtBQUssUUFBUSxHQUFHO0FBQ3ZDLFVBQUksbUJBQW1CLElBQUk7QUFDekI7QUFBQSxNQUNGO0FBRUEsWUFBTSxNQUFNLEtBQUssTUFBTSxHQUFHLGNBQWMsRUFBRSxLQUFLLEVBQUUsWUFBWTtBQUM3RCxZQUFNLFFBQVEsS0FBSyxNQUFNLGlCQUFpQixDQUFDLEVBQUUsS0FBSztBQUNsRCxVQUFJLFFBQVEsUUFBUTtBQUNsQixlQUFPLE9BQU87QUFBQSxNQUNoQixXQUFXLFFBQVEsT0FBTztBQUN4QixlQUFPLE1BQU07QUFBQSxNQUNmO0FBQUEsSUFDRjtBQUVBLFdBQU8sT0FBTyxPQUFPLFNBQVM7QUFBQSxFQUNoQztBQUFBLEVBRUEsTUFBYyxnQkFBZ0IsS0FBdUI7QUFDbkQsVUFBTSxhQUNKLElBQUksYUFBYSxvQkFBb0IsS0FBSyxLQUFLLGtCQUFrQixJQUFJLGFBQWEsS0FBSyxLQUFLLEVBQUU7QUFDaEcsUUFBSSxDQUFDLFlBQVk7QUFDZjtBQUFBLElBQ0Y7QUFFQSxRQUFJLFVBQVUsSUFBSSx1QkFBdUIsWUFBWTtBQUNyRCxVQUFNLGNBQWMsSUFBSTtBQUN4QixRQUFJLE1BQU0sZUFBZSxLQUFLLEVBQUUsaURBQWMseUJBQXlCO0FBRXZFLFFBQUk7QUFDRixZQUFNLFVBQVUsTUFBTSxLQUFLLHdCQUF3QixVQUFVO0FBQzdELFVBQUksTUFBTTtBQUNWLFVBQUksTUFBTTtBQUNWLFVBQUksTUFBTSxVQUFVO0FBQ3BCLFVBQUksTUFBTSxXQUFXO0FBQ3JCLFVBQUksVUFBVSxPQUFPLGNBQWMsVUFBVTtBQUFBLElBQy9DLFNBQVMsT0FBTztBQUNkLGNBQVEsTUFBTSxtQ0FBbUMsS0FBSztBQUN0RCxVQUFJLFlBQVksS0FBSyxrQkFBa0IsWUFBWSxLQUFLLENBQUM7QUFBQSxJQUMzRDtBQUFBLEVBQ0Y7QUFBQSxFQUVRLGtCQUFrQixLQUFhO0FBQ3JDLFVBQU0sU0FBUyxHQUFHLGVBQWU7QUFDakMsUUFBSSxDQUFDLElBQUksV0FBVyxNQUFNLEdBQUc7QUFDM0IsYUFBTztBQUFBLElBQ1Q7QUFFQSxXQUFPLElBQUksTUFBTSxPQUFPLE1BQU07QUFBQSxFQUNoQztBQUFBLEVBRVEsZ0JBQWdCLFVBQWtCO0FBQ3hDLFdBQU8sR0FBRyxLQUFLLGdCQUFnQixLQUFLLFNBQVMsWUFBWSxDQUFDLEdBQUcsUUFBUTtBQUFBLEVBQ3ZFO0FBQUEsRUFFQSxNQUFjLDhCQUE4QixVQUFrQixRQUFxQjtBQUNqRixVQUFNLFlBQVksS0FBSyx5QkFBeUIsUUFBUTtBQUN4RCxRQUFJLEtBQUssU0FBUyxtQkFBbUIsUUFBUTtBQUMzQyxZQUFNLFFBQVEsTUFBTSxLQUFLLGlCQUFpQixNQUFNLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDOUQsYUFBTyxHQUFHLElBQUksSUFBSSxTQUFTO0FBQUEsSUFDN0I7QUFFQSxXQUFPLEdBQUcsS0FBSyxJQUFJLENBQUMsSUFBSSxRQUFRO0FBQUEsRUFDbEM7QUFBQSxFQUVRLGVBQWUsWUFBb0I7QUFDekMsVUFBTSxPQUFPLEtBQUssU0FBUyxVQUFVLFFBQVEsUUFBUSxFQUFFO0FBQ3ZELFdBQU8sR0FBRyxJQUFJLElBQUksV0FBVyxNQUFNLEdBQUcsRUFBRSxJQUFJLGtCQUFrQixFQUFFLEtBQUssR0FBRyxDQUFDO0FBQUEsRUFDM0U7QUFBQSxFQUVRLGdCQUFnQixPQUFlO0FBQ3JDLFdBQU8sTUFBTSxRQUFRLFFBQVEsRUFBRSxFQUFFLFFBQVEsUUFBUSxFQUFFLElBQUk7QUFBQSxFQUN6RDtBQUFBLEVBRVEsa0JBQWtCO0FBQ3hCLFVBQU0sUUFBUSxLQUFLLG9CQUFvQixLQUFLLFdBQVcsR0FBRyxLQUFLLFNBQVMsUUFBUSxJQUFJLEtBQUssU0FBUyxRQUFRLEVBQUUsQ0FBQztBQUM3RyxXQUFPLFNBQVMsS0FBSztBQUFBLEVBQ3ZCO0FBQUEsRUFFUSxtQkFBbUI7QUFDekIsUUFBSSxDQUFDLEtBQUssU0FBUyxhQUFhLENBQUMsS0FBSyxTQUFTLFlBQVksQ0FBQyxLQUFLLFNBQVMsVUFBVTtBQUNsRixZQUFNLElBQUksTUFBTSxLQUFLLEVBQUUsK0NBQWlCLGlDQUFpQyxDQUFDO0FBQUEsSUFDNUU7QUFBQSxFQUNGO0FBQUEsRUFFUSxZQUFZLFdBQW1CO0FBQ3JDLFVBQU0sYUFBYSxVQUFVLFlBQVk7QUFDekMsUUFBSSxlQUFlLFNBQVMsZUFBZSxPQUFRLFFBQU87QUFDMUQsUUFBSSxlQUFlLE1BQU8sUUFBTztBQUNqQyxRQUFJLGVBQWUsTUFBTyxRQUFPO0FBQ2pDLFFBQUksZUFBZSxPQUFRLFFBQU87QUFDbEMsUUFBSSxlQUFlLE1BQU8sUUFBTztBQUNqQyxRQUFJLGVBQWUsTUFBTyxRQUFPO0FBQ2pDLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFUSx3QkFBd0IsVUFBa0I7QUFDaEQsV0FBTyxLQUFLLFlBQVksS0FBSyx5QkFBeUIsUUFBUSxDQUFDO0FBQUEsRUFDakU7QUFBQSxFQUVRLHlCQUF5QixVQUFrQjtBQUNqRCxVQUFNLFNBQVMsU0FBUyxNQUFNLEdBQUc7QUFDakMsV0FBTyxPQUFPLFNBQVMsSUFBSSxPQUFPLE9BQU8sU0FBUyxDQUFDLEVBQUUsWUFBWSxJQUFJO0FBQUEsRUFDdkU7QUFBQSxFQUVBLE1BQWMscUJBQXFCLFFBQXFCLFVBQWtCLFVBQWtCO0FBQzFGLFFBQUksQ0FBQyxLQUFLLFNBQVMsZ0JBQWdCO0FBQ2pDLGFBQU8sRUFBRSxRQUFRLFVBQVUsU0FBUztBQUFBLElBQ3RDO0FBRUEsVUFBTSxXQUFXLE1BQU0sS0FBSyxzQkFBc0IsUUFBUSxVQUFVLFFBQVE7QUFDNUUsV0FBTyxZQUFZLEVBQUUsUUFBUSxVQUFVLFNBQVM7QUFBQSxFQUNsRDtBQUFBLEVBRUEsTUFBYyxzQkFBc0IsUUFBcUIsVUFBa0IsVUFBa0I7QUFDM0YsUUFBSSxDQUFDLGdDQUFnQyxLQUFLLFFBQVEsR0FBRztBQUNuRCxhQUFPO0FBQUEsSUFDVDtBQUVBLFVBQU0saUJBQWlCLEtBQUssU0FBUyxzQkFBc0I7QUFDM0QsVUFBTSxhQUFhLElBQUksS0FBSyxDQUFDLE1BQU0sR0FBRyxFQUFFLE1BQU0sU0FBUyxDQUFDO0FBQ3hELFVBQU0sUUFBUSxNQUFNLEtBQUssaUJBQWlCLFVBQVU7QUFDcEQsVUFBTSxjQUFjLEtBQUssSUFBSSxNQUFNLGNBQWMsTUFBTSxhQUFhO0FBQ3BFLFVBQU0sY0FBYyxjQUFjLEtBQUssU0FBUztBQUNoRCxVQUFNLGdCQUFnQixXQUFXLE9BQU8sa0JBQWtCO0FBQzFELFFBQUksQ0FBQyxlQUFlO0FBQ2xCLGFBQU87QUFBQSxJQUNUO0FBRUEsVUFBTSxRQUFRLGNBQWMsS0FBSyxTQUFTLG9CQUFvQixjQUFjO0FBQzVFLFVBQU0sY0FBYyxLQUFLLElBQUksR0FBRyxLQUFLLE1BQU0sTUFBTSxlQUFlLEtBQUssQ0FBQztBQUN0RSxVQUFNLGVBQWUsS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLE1BQU0sZ0JBQWdCLEtBQUssQ0FBQztBQUN4RSxVQUFNLFNBQVMsU0FBUyxjQUFjLFFBQVE7QUFDOUMsV0FBTyxRQUFRO0FBQ2YsV0FBTyxTQUFTO0FBQ2hCLFVBQU0sVUFBVSxPQUFPLFdBQVcsSUFBSTtBQUN0QyxRQUFJLENBQUMsU0FBUztBQUNaLGFBQU87QUFBQSxJQUNUO0FBRUEsWUFBUSxVQUFVLE9BQU8sR0FBRyxHQUFHLGFBQWEsWUFBWTtBQUV4RCxVQUFNLGFBQWEsU0FBUyxZQUFZLE1BQU0sY0FBYyxlQUFlO0FBQzNFLFVBQU0sVUFBVSxLQUFLLElBQUksS0FBSyxLQUFLLElBQUksTUFBTSxLQUFLLFNBQVMsY0FBYyxHQUFHLENBQUM7QUFDN0UsVUFBTSxpQkFBaUIsTUFBTSxJQUFJLFFBQXFCLENBQUMsWUFBWTtBQUNqRSxhQUFPLE9BQU8sU0FBUyxZQUFZLE9BQU87QUFBQSxJQUM1QyxDQUFDO0FBRUQsUUFBSSxDQUFDLGdCQUFnQjtBQUNuQixhQUFPO0FBQUEsSUFDVDtBQUVBLFFBQUksQ0FBQyxlQUFlLGVBQWUsUUFBUSxXQUFXLE1BQU07QUFDMUQsYUFBTztBQUFBLElBQ1Q7QUFFQSxVQUFNLGFBQWEsTUFBTSxlQUFlLFlBQVk7QUFDcEQsVUFBTSxnQkFBZ0IsS0FBSyxzQkFBc0IsVUFBVSxLQUFLLEtBQUsseUJBQXlCLFFBQVE7QUFDdEcsVUFBTSxlQUFlLFNBQVMsUUFBUSxZQUFZLEVBQUUsSUFBSSxJQUFJLGFBQWE7QUFDekUsV0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLE1BQ1IsVUFBVTtBQUFBLE1BQ1YsVUFBVTtBQUFBLElBQ1o7QUFBQSxFQUNGO0FBQUEsRUFFUSxpQkFBaUIsTUFBWTtBQUNuQyxXQUFPLElBQUksUUFBMEIsQ0FBQyxTQUFTLFdBQVc7QUFDeEQsWUFBTSxNQUFNLElBQUksZ0JBQWdCLElBQUk7QUFDcEMsWUFBTSxRQUFRLElBQUksTUFBTTtBQUN4QixZQUFNLFNBQVMsTUFBTTtBQUNuQixZQUFJLGdCQUFnQixHQUFHO0FBQ3ZCLGdCQUFRLEtBQUs7QUFBQSxNQUNmO0FBQ0EsWUFBTSxVQUFVLENBQUMsVUFBVTtBQUN6QixZQUFJLGdCQUFnQixHQUFHO0FBQ3ZCLGVBQU8sS0FBSztBQUFBLE1BQ2Q7QUFDQSxZQUFNLE1BQU07QUFBQSxJQUNkLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxzQkFBc0IsVUFBa0I7QUFDOUMsUUFBSSxhQUFhLGFBQWMsUUFBTztBQUN0QyxRQUFJLGFBQWEsWUFBYSxRQUFPO0FBQ3JDLFFBQUksYUFBYSxhQUFjLFFBQU87QUFDdEMsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVBLE1BQWMsY0FBYyxNQUFxQjtBQUMvQyxRQUFJO0FBQ0YsWUFBTSxLQUFLLElBQUksTUFBTSxNQUFNLE1BQU0sSUFBSTtBQUFBLElBQ3ZDLFNBQVMsT0FBTztBQUNkLGNBQVEsS0FBSyw0Q0FBNEMsS0FBSztBQUFBLElBQ2hFO0FBQUEsRUFDRjtBQUFBLEVBRVEsdUJBQXVCLFdBQW1CLEtBQWE7QUFDN0QsVUFBTSxhQUFhLEtBQUssa0JBQWtCLFNBQVM7QUFDbkQsUUFBSSxDQUFDLFlBQVk7QUFDZixhQUFPLE9BQU8sU0FBUztBQUFBLElBQ3pCO0FBRUEsV0FBTyxLQUFLLDBCQUEwQixZQUFZLEdBQUc7QUFBQSxFQUN2RDtBQUFBLEVBRVEsMEJBQTBCLFlBQW9CLEtBQWE7QUFDakUsVUFBTSxpQkFBaUIsT0FBTyxZQUFZLFFBQVEsVUFBVSxHQUFHLEVBQUUsS0FBSztBQUN0RSxVQUFNLGlCQUFpQixXQUFXLFFBQVEsVUFBVSxFQUFFLEVBQUUsS0FBSztBQUM3RCxXQUFPO0FBQUEsTUFDTCxTQUFTLGlCQUFpQjtBQUFBLE1BQzFCLFNBQVMsY0FBYztBQUFBLE1BQ3ZCLFFBQVEsYUFBYTtBQUFBLE1BQ3JCO0FBQUEsSUFDRixFQUFFLEtBQUssSUFBSTtBQUFBLEVBQ2I7QUFBQSxFQUVRLGlCQUFpQixVQUFrQjtBQUN6QyxXQUFPLEtBQUssRUFBRSxtREFBVyxRQUFRLFVBQUssMEJBQTBCLFFBQVEsR0FBRztBQUFBLEVBQzdFO0FBQUEsRUFFUSxrQkFBa0IsVUFBa0I7QUFDMUMsV0FBTyxLQUFLLEVBQUUsbURBQVcsUUFBUSxVQUFLLDBCQUEwQixRQUFRLEdBQUc7QUFBQSxFQUM3RTtBQUFBLEVBRUEsTUFBTSwrQkFBK0I7QUFDbkMsUUFBSTtBQUNGLFlBQU0sY0FBYyxvQkFBSSxJQUFvQjtBQUM1QyxZQUFNLHVCQUF1QixvQkFBSSxJQUFtQjtBQUNwRCxVQUFJLGVBQWU7QUFDbkIsaUJBQVcsUUFBUSxLQUFLLElBQUksTUFBTSxpQkFBaUIsR0FBRztBQUNwRCxjQUFNLFVBQVUsTUFBTSxLQUFLLElBQUksTUFBTSxLQUFLLElBQUk7QUFDOUMsY0FBTSxlQUFlLE1BQU0sS0FBSyx3QkFBd0IsU0FBUyxNQUFNLFdBQVc7QUFDbEYsbUJBQVcsZUFBZSxjQUFjO0FBQ3RDLGNBQUksWUFBWSxZQUFZO0FBQzFCLGlDQUFxQixJQUFJLFlBQVksV0FBVyxNQUFNLFlBQVksVUFBVTtBQUFBLFVBQzlFO0FBQUEsUUFDRjtBQUVBLFlBQUksVUFBVTtBQUNkLG1CQUFXLGVBQWUsY0FBYztBQUN0QyxvQkFBVSxRQUFRLE1BQU0sWUFBWSxRQUFRLEVBQUUsS0FBSyxZQUFZLFNBQVM7QUFBQSxRQUMxRTtBQUVBLGtCQUFVLFFBQ1A7QUFBQSxVQUNDO0FBQUEsVUFDQSxDQUFDLFFBQVEsWUFBb0IsUUFDM0IsS0FBSztBQUFBLFlBQ0gsS0FBSyxhQUFhLFVBQVU7QUFBQSxZQUM1QixLQUFLLGFBQWEsR0FBRyxLQUFLLEtBQUssYUFBYSxVQUFVO0FBQUEsVUFDeEQ7QUFBQSxRQUNKLEVBQ0M7QUFBQSxVQUNDO0FBQUEsVUFDQSxDQUFDLFFBQVEsZUFDUCxLQUFLLDBCQUEwQixLQUFLLGFBQWEsVUFBVSxHQUFHLEtBQUssYUFBYSxVQUFVLENBQUM7QUFBQSxRQUMvRjtBQUVGLFlBQUksWUFBWSxTQUFTO0FBQ3ZCO0FBQUEsUUFDRjtBQUVBLGNBQU0sS0FBSyxJQUFJLE1BQU0sT0FBTyxNQUFNLE9BQU87QUFDekMsd0JBQWdCO0FBQUEsTUFDbEI7QUFFQSxVQUFJLGlCQUFpQixHQUFHO0FBQ3RCLFlBQUk7QUFBQSxVQUNGLEtBQUs7QUFBQSxZQUNIO0FBQUEsWUFDQTtBQUFBLFVBQ0Y7QUFBQSxRQUNGO0FBQ0E7QUFBQSxNQUNGO0FBRUEsVUFBSSxLQUFLLFNBQVMsd0JBQXdCO0FBQ3hDLGNBQU0sS0FBSywwQkFBMEIsb0JBQW9CO0FBQUEsTUFDM0Q7QUFFQSxVQUFJO0FBQUEsUUFDRixLQUFLO0FBQUEsVUFDSCxzQkFBTyxZQUFZO0FBQUEsVUFDbkIsWUFBWSxZQUFZO0FBQUEsUUFDMUI7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0YsU0FBUyxPQUFPO0FBQ2QsY0FBUSxNQUFNLGtEQUFrRCxLQUFLO0FBQ3JFLFVBQUksdUJBQU8sS0FBSyxjQUFjLEtBQUssRUFBRSxnRUFBYyx1Q0FBdUMsR0FBRyxLQUFLLEdBQUcsR0FBSTtBQUFBLElBQzNHO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYywwQkFBMEIsc0JBQTBDO0FBQ2hGLFFBQUkscUJBQXFCLFNBQVMsR0FBRztBQUNuQztBQUFBLElBQ0Y7QUFFQSxVQUFNLGdCQUFnQixvQkFBSSxJQUFZO0FBQ3RDLGVBQVcsUUFBUSxLQUFLLElBQUksTUFBTSxpQkFBaUIsR0FBRztBQUNwRCxZQUFNLFVBQVUsTUFBTSxLQUFLLElBQUksTUFBTSxLQUFLLElBQUk7QUFDOUMsWUFBTSxjQUFjLENBQUMsR0FBRyxRQUFRLFNBQVMsb0JBQW9CLENBQUM7QUFDOUQsWUFBTSxrQkFBa0IsQ0FBQyxHQUFHLFFBQVEsU0FBUyx3QkFBd0IsQ0FBQztBQUV0RSxpQkFBVyxTQUFTLGFBQWE7QUFDL0IsY0FBTSxVQUFVLE1BQU0sQ0FBQyxFQUFFLE1BQU0sR0FBRyxFQUFFLENBQUMsRUFBRSxLQUFLO0FBQzVDLGNBQU0sU0FBUyxLQUFLLGtCQUFrQixTQUFTLEtBQUssSUFBSTtBQUN4RCxZQUFJLFVBQVUsS0FBSyxZQUFZLE1BQU0sR0FBRztBQUN0Qyx3QkFBYyxJQUFJLE9BQU8sSUFBSTtBQUFBLFFBQy9CO0FBQUEsTUFDRjtBQUVBLGlCQUFXLFNBQVMsaUJBQWlCO0FBQ25DLGNBQU0sVUFBVSxtQkFBbUIsTUFBTSxDQUFDLEVBQUUsS0FBSyxFQUFFLFFBQVEsVUFBVSxFQUFFLENBQUM7QUFDeEUsWUFBSSxtQ0FBbUMsS0FBSyxPQUFPLEdBQUc7QUFDcEQ7QUFBQSxRQUNGO0FBRUEsY0FBTSxTQUFTLEtBQUssa0JBQWtCLFNBQVMsS0FBSyxJQUFJO0FBQ3hELFlBQUksVUFBVSxLQUFLLFlBQVksTUFBTSxHQUFHO0FBQ3RDLHdCQUFjLElBQUksT0FBTyxJQUFJO0FBQUEsUUFDL0I7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUVBLGVBQVcsQ0FBQyxNQUFNLElBQUksS0FBSyxxQkFBcUIsUUFBUSxHQUFHO0FBQ3pELFVBQUksY0FBYyxJQUFJLElBQUksR0FBRztBQUMzQjtBQUFBLE1BQ0Y7QUFFQSxZQUFNLEtBQUssY0FBYyxJQUFJO0FBQUEsSUFDL0I7QUFBQSxFQUNGO0FBQUEsRUFFUSxrQkFBa0IsWUFBb0IsT0FBZ0I7QUFDNUQsVUFBTSxLQUFLLFNBQVMsY0FBYyxLQUFLO0FBQ3ZDLE9BQUcsWUFBWTtBQUNmLFVBQU0sVUFBVSxpQkFBaUIsUUFBUSxNQUFNLFVBQVUsT0FBTyxLQUFLO0FBQ3JFLE9BQUcsY0FBYyxLQUFLO0FBQUEsTUFDcEIseURBQVksVUFBVSxTQUFJLE9BQU87QUFBQSxNQUNqQyx3QkFBd0IsVUFBVSxLQUFLLE9BQU87QUFBQSxJQUNoRDtBQUNBLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFQSxNQUFNLGtCQUFrQixZQUFZLE9BQU87QUFDekMsUUFBSTtBQUNGLFdBQUssaUJBQWlCO0FBRXRCLFlBQU0sWUFBWSx3QkFBd0IsS0FBSyxJQUFJLENBQUM7QUFDcEQsWUFBTSxhQUFhLEtBQUssZ0JBQWdCLFNBQVM7QUFDakQsWUFBTSxZQUFZLEtBQUssZUFBZSxVQUFVO0FBQ2hELFlBQU0sbUJBQW1CLEtBQUssV0FBVyx3QkFBdUIsb0JBQUksS0FBSyxHQUFFLFlBQVksQ0FBQyxFQUFFO0FBRTFGLFlBQU0sY0FBYyxNQUFNLEtBQUssV0FBVztBQUFBLFFBQ3hDLEtBQUs7QUFBQSxRQUNMLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxVQUNQLGVBQWUsS0FBSyxnQkFBZ0I7QUFBQSxVQUNwQyxnQkFBZ0I7QUFBQSxRQUNsQjtBQUFBLFFBQ0EsTUFBTTtBQUFBLE1BQ1IsQ0FBQztBQUNELFVBQUksWUFBWSxTQUFTLE9BQU8sWUFBWSxVQUFVLEtBQUs7QUFDekQsY0FBTSxJQUFJLE1BQU0sMEJBQTBCLFlBQVksTUFBTSxFQUFFO0FBQUEsTUFDaEU7QUFFQSxZQUFNLGNBQWMsTUFBTSxLQUFLLFdBQVc7QUFBQSxRQUN4QyxLQUFLO0FBQUEsUUFDTCxRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsVUFDUCxlQUFlLEtBQUssZ0JBQWdCO0FBQUEsUUFDdEM7QUFBQSxNQUNGLENBQUM7QUFDRCxVQUFJLFlBQVksU0FBUyxPQUFPLFlBQVksVUFBVSxLQUFLO0FBQ3pELGNBQU0sSUFBSSxNQUFNLDBCQUEwQixZQUFZLE1BQU0sRUFBRTtBQUFBLE1BQ2hFO0FBRUEsWUFBTSxpQkFBaUIsTUFBTSxLQUFLLFdBQVc7QUFBQSxRQUMzQyxLQUFLO0FBQUEsUUFDTCxRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsVUFDUCxlQUFlLEtBQUssZ0JBQWdCO0FBQUEsUUFDdEM7QUFBQSxNQUNGLENBQUM7QUFDRCxVQUFJLGVBQWUsU0FBUyxPQUFPLGVBQWUsVUFBVSxLQUFLO0FBQy9ELGNBQU0sSUFBSSxNQUFNLDZCQUE2QixlQUFlLE1BQU0sRUFBRTtBQUFBLE1BQ3RFO0FBRUEsWUFBTSxVQUFVLEtBQUs7QUFBQSxRQUNuQiw0Q0FBbUIsWUFBWSxNQUFNLGFBQVEsWUFBWSxNQUFNLGdCQUFXLGVBQWUsTUFBTTtBQUFBLFFBQy9GLDJCQUEyQixZQUFZLE1BQU0sU0FBUyxZQUFZLE1BQU0sWUFBWSxlQUFlLE1BQU07QUFBQSxNQUMzRztBQUNBLFVBQUksdUJBQU8sU0FBUyxHQUFJO0FBQ3hCLFVBQUksV0FBVztBQUNiLFlBQUksWUFBWSxLQUFLLEtBQUssS0FBSyxFQUFFLHVCQUFhLG1CQUFtQixHQUFHLE9BQU8sRUFBRSxLQUFLO0FBQUEsTUFDcEY7QUFDQSxhQUFPO0FBQUEsSUFDVCxTQUFTLE9BQU87QUFDZCxjQUFRLE1BQU0sNkJBQTZCLEtBQUs7QUFDaEQsWUFBTSxVQUFVLEtBQUssY0FBYyxLQUFLLEVBQUUsbUNBQWUsb0JBQW9CLEdBQUcsS0FBSztBQUNyRixVQUFJLHVCQUFPLFNBQVMsR0FBSTtBQUN4QixVQUFJLFdBQVc7QUFDYixZQUFJLFlBQVksS0FBSyxLQUFLLEtBQUssRUFBRSx1QkFBYSxtQkFBbUIsR0FBRyxPQUFPLEVBQUUsS0FBSztBQUFBLE1BQ3BGO0FBQ0EsYUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNGO0FBQUEsRUFFUSxjQUFjLFFBQWdCLE9BQWdCO0FBQ3BELFVBQU0sVUFBVSxpQkFBaUIsUUFBUSxNQUFNLFVBQVUsT0FBTyxLQUFLO0FBQ3JFLFdBQU8sR0FBRyxNQUFNLEtBQUssT0FBTztBQUFBLEVBQzlCO0FBQUEsRUFFQSxNQUFjLFdBQVcsU0FPa0U7QUFDekYsVUFBTSxXQUFXLFVBQU0sZ0JBQUFHLFlBQW1CO0FBQUEsTUFDeEMsS0FBSyxRQUFRO0FBQUEsTUFDYixRQUFRLFFBQVE7QUFBQSxNQUNoQixTQUFTLFFBQVE7QUFBQSxNQUNqQixNQUFNLFFBQVE7QUFBQSxNQUNkLE9BQU87QUFBQSxJQUNULENBQUM7QUFFRCxXQUFPO0FBQUEsTUFDTCxRQUFRLFNBQVM7QUFBQSxNQUNqQixTQUFTLFNBQVM7QUFBQSxNQUNsQixhQUFhLFNBQVM7QUFBQSxJQUN4QjtBQUFBLEVBQ0Y7QUFBQSxFQUVRLFdBQVcsT0FBZTtBQUNoQyxVQUFNLFFBQVEsSUFBSSxZQUFZLEVBQUUsT0FBTyxLQUFLO0FBQzVDLFdBQU8sTUFBTSxPQUFPLE1BQU0sTUFBTSxZQUFZLE1BQU0sYUFBYSxNQUFNLFVBQVU7QUFBQSxFQUNqRjtBQUFBLEVBRVEsV0FBVyxRQUFxQjtBQUN0QyxXQUFPLElBQUksWUFBWSxFQUFFLE9BQU8sTUFBTTtBQUFBLEVBQ3hDO0FBQUEsRUFFQSxNQUFjLGlCQUFpQixRQUFxQjtBQUNsRCxVQUFNLFNBQVMsTUFBTSxPQUFPLE9BQU8sT0FBTyxXQUFXLE1BQU07QUFDM0QsV0FBTyxNQUFNLEtBQUssSUFBSSxXQUFXLE1BQU0sQ0FBQyxFQUNyQyxJQUFJLENBQUMsVUFBVSxNQUFNLFNBQVMsRUFBRSxFQUFFLFNBQVMsR0FBRyxHQUFHLENBQUMsRUFDbEQsS0FBSyxFQUFFO0FBQUEsRUFDWjtBQUNGO0FBRUEsSUFBTSwwQkFBTixjQUFzQyxvQ0FBb0I7QUFBQSxFQUN4RCxXQUFpQjtBQUFBLEVBQUM7QUFDcEI7QUFRQSxJQUFNLHlCQUFOLGNBQXFDLGlDQUFpQjtBQUFBLEVBR3BELFlBQVksS0FBVSxRQUFrQztBQUN0RCxVQUFNLEtBQUssTUFBTTtBQUNqQixTQUFLLFNBQVM7QUFBQSxFQUNoQjtBQUFBLEVBRUEsVUFBZ0I7QUFDZCxVQUFNLEVBQUUsWUFBWSxJQUFJO0FBQ3hCLGdCQUFZLE1BQU07QUFFbEIsZ0JBQVksU0FBUyxNQUFNLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUMzRCxnQkFBWSxTQUFTLEtBQUs7QUFBQSxNQUN4QixNQUFNLEtBQUssT0FBTztBQUFBLFFBQ2hCO0FBQUEsUUFDQTtBQUFBLE1BQ0Y7QUFBQSxJQUNGLENBQUM7QUFFRCxRQUFJLHdCQUFRLFdBQVcsRUFDcEIsUUFBUSxLQUFLLE9BQU8sRUFBRSx3Q0FBVSx3QkFBd0IsQ0FBQyxFQUN6RDtBQUFBLE1BQ0MsS0FBSyxPQUFPO0FBQUEsUUFDVjtBQUFBLFFBQ0E7QUFBQSxNQUNGO0FBQUEsSUFDRixFQUNDLFFBQVEsQ0FBQyxTQUFTO0FBQ2pCLFdBQUssU0FBUyxLQUFLLE9BQU8sU0FBUyxPQUFPO0FBQzFDLFdBQUssWUFBWSxJQUFJO0FBQUEsSUFDdkIsQ0FBQztBQUVILGdCQUFZLFNBQVMsTUFBTSxFQUFFLE1BQU0sS0FBSyxPQUFPLEVBQUUsNEJBQVEsb0JBQW9CLEVBQUUsQ0FBQztBQUVoRixRQUFJLHdCQUFRLFdBQVcsRUFDcEIsUUFBUSxLQUFLLE9BQU8sRUFBRSxnQkFBTSxVQUFVLENBQUMsRUFDdkMsUUFBUSxLQUFLLE9BQU8sRUFBRSxvR0FBb0IsNERBQTRELENBQUMsRUFDdkc7QUFBQSxNQUFZLENBQUMsYUFDWixTQUNHLFVBQVUsUUFBUSxLQUFLLE9BQU8sRUFBRSxnQkFBTSxNQUFNLENBQUMsRUFDN0MsVUFBVSxNQUFNLGNBQUksRUFDcEIsVUFBVSxNQUFNLFNBQVMsRUFDekIsU0FBUyxLQUFLLE9BQU8sU0FBUyxRQUFRLEVBQ3RDLFNBQVMsT0FBTyxVQUFVO0FBQ3pCLGFBQUssT0FBTyxTQUFTLFdBQVc7QUFDaEMsY0FBTSxLQUFLLE9BQU8sYUFBYTtBQUMvQixhQUFLLFFBQVE7QUFBQSxNQUNmLENBQUM7QUFBQSxJQUNMO0FBRUYsZ0JBQVksU0FBUyxNQUFNLEVBQUUsTUFBTSxLQUFLLE9BQU8sRUFBRSw0QkFBUSxZQUFZLEVBQUUsQ0FBQztBQUV4RSxRQUFJLHdCQUFRLFdBQVcsRUFDcEIsUUFBUSxLQUFLLE9BQU8sRUFBRSxtQ0FBZSxpQkFBaUIsQ0FBQyxFQUN2RCxRQUFRLEtBQUssT0FBTyxFQUFFLGtHQUEyQyx3REFBd0QsQ0FBQyxFQUMxSDtBQUFBLE1BQVEsQ0FBQyxTQUNSLEtBQ0csZUFBZSw4QkFBOEIsRUFDN0MsU0FBUyxLQUFLLE9BQU8sU0FBUyxTQUFTLEVBQ3ZDLFNBQVMsT0FBTyxVQUFVO0FBQ3pCLGFBQUssT0FBTyxTQUFTLFlBQVksTUFBTSxLQUFLO0FBQzVDLGNBQU0sS0FBSyxPQUFPLGFBQWE7QUFBQSxNQUNqQyxDQUFDO0FBQUEsSUFDTDtBQUVGLFFBQUksd0JBQVEsV0FBVyxFQUNwQixRQUFRLEtBQUssT0FBTyxFQUFFLGdCQUFNLFVBQVUsQ0FBQyxFQUN2QztBQUFBLE1BQVEsQ0FBQyxTQUNSLEtBQUssU0FBUyxLQUFLLE9BQU8sU0FBUyxRQUFRLEVBQUUsU0FBUyxPQUFPLFVBQVU7QUFDckUsYUFBSyxPQUFPLFNBQVMsV0FBVyxNQUFNLEtBQUs7QUFDM0MsY0FBTSxLQUFLLE9BQU8sYUFBYTtBQUFBLE1BQ2pDLENBQUM7QUFBQSxJQUNIO0FBRUYsUUFBSSx3QkFBUSxXQUFXLEVBQ3BCLFFBQVEsS0FBSyxPQUFPLEVBQUUsZ0JBQU0sVUFBVSxDQUFDLEVBQ3ZDLFFBQVEsS0FBSyxPQUFPLEVBQUUsZ0hBQXNCLG9FQUFvRSxDQUFDLEVBQ2pILFFBQVEsQ0FBQyxTQUFTO0FBQ2pCLFdBQUssUUFBUSxPQUFPO0FBQ3BCLFdBQUssU0FBUyxLQUFLLE9BQU8sU0FBUyxRQUFRLEVBQUUsU0FBUyxPQUFPLFVBQVU7QUFDckUsYUFBSyxPQUFPLFNBQVMsV0FBVztBQUNoQyxjQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsTUFDakMsQ0FBQztBQUFBLElBQ0gsQ0FBQyxFQUNBLGVBQWUsQ0FBQyxXQUFXO0FBQzFCLFVBQUksVUFBVTtBQUNkLGFBQU8sUUFBUSxLQUFLO0FBQ3BCLGFBQU8sV0FBVyxLQUFLLE9BQU8sRUFBRSw0QkFBUSxlQUFlLENBQUM7QUFDeEQsYUFBTyxRQUFRLE1BQU07QUFDbkIsY0FBTSxRQUFRLE9BQU8sZ0JBQWdCLGVBQWUsY0FBYyxPQUFPO0FBQ3pFLFlBQUksRUFBRSxpQkFBaUIsbUJBQW1CO0FBQ3hDO0FBQUEsUUFDRjtBQUVBLGtCQUFVLENBQUM7QUFDWCxjQUFNLE9BQU8sVUFBVSxTQUFTO0FBQ2hDLGVBQU8sUUFBUSxVQUFVLFlBQVksS0FBSztBQUMxQyxlQUFPLFdBQVcsS0FBSyxPQUFPLEVBQUUsVUFBVSw2QkFBUyw0QkFBUSxVQUFVLGtCQUFrQixlQUFlLENBQUM7QUFBQSxNQUN6RyxDQUFDO0FBQUEsSUFDSCxDQUFDO0FBRUgsUUFBSSx3QkFBUSxXQUFXLEVBQ3BCLFFBQVEsS0FBSyxPQUFPLEVBQUUsd0NBQVUscUJBQXFCLENBQUMsRUFDdEQ7QUFBQSxNQUNDLEtBQUssT0FBTztBQUFBLFFBQ1Y7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0YsRUFDQztBQUFBLE1BQVEsQ0FBQyxTQUNSLEtBQUssU0FBUyxLQUFLLE9BQU8sU0FBUyxZQUFZLEVBQUUsU0FBUyxPQUFPLFVBQVU7QUFDekUsYUFBSyxPQUFPLFNBQVMsbUJBQWUsK0JBQWMsTUFBTSxLQUFLLEtBQUssaUJBQWlCO0FBQ25GLGNBQU0sS0FBSyxPQUFPLGFBQWE7QUFBQSxNQUNqQyxDQUFDO0FBQUEsSUFDSDtBQUVGLFFBQUksd0JBQVEsV0FBVyxFQUNwQixRQUFRLEtBQUssT0FBTyxFQUFFLDRCQUFRLGlCQUFpQixDQUFDLEVBQ2hELFFBQVEsS0FBSyxPQUFPLEVBQUUsd0hBQW1DLDJEQUEyRCxDQUFDLEVBQ3JIO0FBQUEsTUFBVSxDQUFDLFdBQ1YsT0FBTyxjQUFjLEtBQUssT0FBTyxFQUFFLDRCQUFRLFVBQVUsQ0FBQyxFQUFFLFFBQVEsWUFBWTtBQUMxRSxlQUFPLFlBQVksSUFBSTtBQUN2QixZQUFJO0FBQ0YsZ0JBQU0sS0FBSyxPQUFPLGtCQUFrQixJQUFJO0FBQUEsUUFDMUMsVUFBRTtBQUNBLGlCQUFPLFlBQVksS0FBSztBQUFBLFFBQzFCO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDSDtBQUVGLGdCQUFZLFNBQVMsTUFBTSxFQUFFLE1BQU0sS0FBSyxPQUFPLEVBQUUsNEJBQVEsTUFBTSxFQUFFLENBQUM7QUFFbEUsUUFBSSx3QkFBUSxXQUFXLEVBQ3BCLFFBQVEsS0FBSyxPQUFPLEVBQUUsd0NBQVUscUJBQXFCLENBQUMsRUFDdEQ7QUFBQSxNQUNDLEtBQUssT0FBTztBQUFBLFFBQ1Y7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0YsRUFDQztBQUFBLE1BQVEsQ0FBQyxTQUNSLEtBQUssU0FBUyxLQUFLLE9BQU8sU0FBUyxxQkFBcUIsRUFBRSxTQUFTLE9BQU8sVUFBVTtBQUNsRixhQUFLLE9BQU8sU0FBUyw0QkFBd0IsK0JBQWMsTUFBTSxLQUFLLEtBQUssY0FBYztBQUN6RixjQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsTUFDakMsQ0FBQztBQUFBLElBQ0g7QUFFRixRQUFJLHdCQUFRLFdBQVcsRUFDcEIsUUFBUSxLQUFLLE9BQU8sRUFBRSx3Q0FBVSxxQkFBcUIsQ0FBQyxFQUN0RDtBQUFBLE1BQ0MsS0FBSyxPQUFPO0FBQUEsUUFDVjtBQUFBLFFBQ0E7QUFBQSxNQUNGO0FBQUEsSUFDRixFQUNDO0FBQUEsTUFBUSxDQUFDLFNBQ1IsS0FDRyxlQUFlLEdBQUcsRUFDbEIsU0FBUyxPQUFPLEtBQUssT0FBTyxTQUFTLHVCQUF1QixDQUFDLEVBQzdELFNBQVMsT0FBTyxVQUFVO0FBQ3pCLGNBQU0sU0FBUyxPQUFPLFNBQVMsT0FBTyxFQUFFO0FBQ3hDLFlBQUksQ0FBQyxPQUFPLE1BQU0sTUFBTSxHQUFHO0FBQ3pCLGVBQUssT0FBTyxTQUFTLDBCQUEwQixLQUFLLElBQUksR0FBRyxNQUFNO0FBQ2pFLGdCQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsUUFDakM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNMO0FBRUYsUUFBSSx3QkFBUSxXQUFXLEVBQ3BCLFFBQVEsS0FBSyxPQUFPLEVBQUUsb0RBQVksMkJBQTJCLENBQUMsRUFDOUQ7QUFBQSxNQUNDLEtBQUssT0FBTztBQUFBLFFBQ1Y7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0YsRUFDQztBQUFBLE1BQVksQ0FBQyxhQUNaLFNBQ0csVUFBVSxjQUFjLEtBQUssT0FBTyxFQUFFLDRCQUFRLFlBQVksQ0FBQyxFQUMzRCxVQUFVLGNBQWMsS0FBSyxPQUFPLEVBQUUsd0NBQVUsWUFBWSxDQUFDLEVBQzdELFNBQVMsS0FBSyxPQUFPLFNBQVMsZUFBZSxFQUM3QyxTQUFTLE9BQU8sVUFBVTtBQUN6QixhQUFLLE9BQU8sU0FBUyxrQkFBa0I7QUFDdkMsY0FBTSxLQUFLLE9BQU8sYUFBYTtBQUFBLE1BQ2pDLENBQUM7QUFBQSxJQUNMO0FBRUYsUUFBSSx3QkFBUSxXQUFXLEVBQ3BCLFFBQVEsS0FBSyxPQUFPLEVBQUUsb0RBQVksb0JBQW9CLENBQUMsRUFDdkQ7QUFBQSxNQUNDLEtBQUssT0FBTztBQUFBLFFBQ1Y7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0YsRUFDQztBQUFBLE1BQVEsQ0FBQyxTQUNSLEtBQ0csZUFBZSxJQUFJLEVBQ25CLFNBQVMsT0FBTyxLQUFLLE9BQU8sU0FBUyxrQkFBa0IsQ0FBQyxFQUN4RCxTQUFTLE9BQU8sVUFBVTtBQUN6QixjQUFNLFNBQVMsT0FBTyxTQUFTLE9BQU8sRUFBRTtBQUN4QyxZQUFJLENBQUMsT0FBTyxNQUFNLE1BQU0sR0FBRztBQUN6QixlQUFLLE9BQU8sU0FBUyxxQkFBcUIsS0FBSyxJQUFJLEdBQUcsTUFBTTtBQUM1RCxnQkFBTSxLQUFLLE9BQU8sYUFBYTtBQUFBLFFBQ2pDO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDTDtBQUVGLFFBQUksd0JBQVEsV0FBVyxFQUNwQixRQUFRLEtBQUssT0FBTyxFQUFFLDRCQUFRLGFBQWEsQ0FBQyxFQUM1QztBQUFBLE1BQ0MsS0FBSyxPQUFPO0FBQUEsUUFDVixHQUFHLEtBQUssT0FBTyxvQkFBb0IsQ0FBQztBQUFBLEVBQUssS0FBSyxPQUFPLHNCQUFzQixDQUFDO0FBQUEsRUFBSyxLQUFLLE9BQU8sRUFBRSxrVUFBeUQsdUxBQXVMLENBQUM7QUFBQSxRQUNoVixHQUFHLEtBQUssT0FBTyxvQkFBb0IsQ0FBQztBQUFBLEVBQUssS0FBSyxPQUFPLHNCQUFzQixDQUFDO0FBQUEsRUFBSyxLQUFLLE9BQU8sRUFBRSxrVUFBeUQsdUxBQXVMLENBQUM7QUFBQSxNQUNsVjtBQUFBLElBQ0YsRUFDQztBQUFBLE1BQVUsQ0FBQyxXQUNWLE9BQU8sY0FBYyxLQUFLLE9BQU8sRUFBRSw0QkFBUSxVQUFVLENBQUMsRUFBRSxRQUFRLFlBQVk7QUFDMUUsZUFBTyxZQUFZLElBQUk7QUFDdkIsWUFBSTtBQUNGLGdCQUFNLEtBQUssT0FBTywyQkFBMkIsSUFBSTtBQUNqRCxlQUFLLFFBQVE7QUFBQSxRQUNmLFVBQUU7QUFDQSxpQkFBTyxZQUFZLEtBQUs7QUFBQSxRQUMxQjtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0g7QUFFRixnQkFBWSxTQUFTLE1BQU0sRUFBRSxNQUFNLEtBQUssT0FBTyxFQUFFLGtDQUFTLGdCQUFnQixFQUFFLENBQUM7QUFFN0UsUUFBSSx3QkFBUSxXQUFXLEVBQ3BCLFFBQVEsS0FBSyxPQUFPLEVBQUUsZ0VBQWMsc0NBQXNDLENBQUMsRUFDM0U7QUFBQSxNQUNDLEtBQUssT0FBTztBQUFBLFFBQ1Y7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0YsRUFDQztBQUFBLE1BQVUsQ0FBQyxXQUNWLE9BQU8sY0FBYyxLQUFLLE9BQU8sRUFBRSw0QkFBUSxlQUFlLENBQUMsRUFBRSxRQUFRLFlBQVk7QUFDL0UsZUFBTyxZQUFZLElBQUk7QUFDdkIsWUFBSTtBQUNGLGdCQUFNLEtBQUssT0FBTyw2QkFBNkI7QUFBQSxRQUNqRCxVQUFFO0FBQ0EsaUJBQU8sWUFBWSxLQUFLO0FBQUEsUUFDMUI7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDSjtBQUNGO0FBRUEsSUFBTSxjQUFOLGNBQTBCLHNCQUFNO0FBQUEsRUFJOUIsWUFBWSxLQUFVLFdBQW1CLFVBQWtCO0FBQ3pELFVBQU0sR0FBRztBQUNULFNBQUssWUFBWTtBQUNqQixTQUFLLFdBQVc7QUFBQSxFQUNsQjtBQUFBLEVBRUEsU0FBZTtBQUNiLFVBQU0sRUFBRSxVQUFVLElBQUk7QUFDdEIsY0FBVSxNQUFNO0FBQ2hCLGNBQVUsU0FBUyxNQUFNLEVBQUUsTUFBTSxLQUFLLFVBQVUsQ0FBQztBQUNqRCxjQUFVLFNBQVMsS0FBSyxFQUFFLE1BQU0sS0FBSyxTQUFTLENBQUM7QUFBQSxFQUNqRDtBQUFBLEVBRUEsVUFBZ0I7QUFDZCxTQUFLLFVBQVUsTUFBTTtBQUFBLEVBQ3ZCO0FBQ0Y7IiwKICAibmFtZXMiOiBbImRvY3VtZW50IiwgInRvbWJzdG9uZSIsICJ1cGxvYWRlZFJlbW90ZSIsICJvYnNpZGlhblJlcXVlc3RVcmwiXQp9Cg==
