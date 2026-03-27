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
var import_obsidian4 = require("obsidian");

// secure-webdav-image-support.ts
var import_obsidian = require("obsidian");
var SECURE_PROTOCOL = "webdav-secure:";
var SECURE_CODE_BLOCK = "secure-webdav";
var SecureWebdavRenderChild = class extends import_obsidian.MarkdownRenderChild {
  constructor(containerEl) {
    super(containerEl);
  }
  onunload() {
  }
};
var SecureWebdavImageSupport = class {
  constructor(deps) {
    this.deps = deps;
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
    return [`\`\`\`${SECURE_CODE_BLOCK}`, `path: ${normalizedPath}`, `alt: ${normalizedAlt}`, "```"].join("\n");
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
  async processSecureImages(el, ctx) {
    const secureCodeBlocks = Array.from(el.querySelectorAll(`pre > code.language-${SECURE_CODE_BLOCK}`));
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
      })
    );
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
        text: this.deps.t("\u5B89\u5168\u56FE\u7247\u4EE3\u7801\u5757\u683C\u5F0F\u65E0\u6548\u3002", "Invalid secure image code block format.")
      });
      return;
    }
    await this.renderSecureImageIntoElement(el, parsed.path, parsed.alt || parsed.path);
    ctx.addChild(new SecureWebdavRenderChild(el));
  }
  extractRemotePath(src) {
    const prefix = `${SECURE_PROTOCOL}//`;
    if (!src.startsWith(prefix)) {
      return null;
    }
    return src.slice(prefix.length);
  }
  async renderSecureImageIntoElement(el, remotePath, alt) {
    const img = document.createElement("img");
    img.alt = alt;
    img.setAttribute("data-secure-webdav", remotePath);
    img.classList.add("secure-webdav-image", "is-loading");
    el.empty();
    el.appendChild(img);
    await this.swapImageSource(img);
  }
  async swapImageSource(img) {
    const remotePath = img.getAttribute("data-secure-webdav") ?? this.extractRemotePath(img.getAttribute("src") ?? "");
    if (!remotePath) {
      return;
    }
    img.classList.add("secure-webdav-image", "is-loading");
    const originalAlt = img.alt;
    img.alt = originalAlt || this.deps.t("\u52A0\u8F7D\u5B89\u5168\u56FE\u7247\u4E2D...", "Loading secure image...");
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
  buildErrorElement(remotePath, error) {
    const el = document.createElement("div");
    el.className = "secure-webdav-image is-error";
    const message = error instanceof Error ? error.message : String(error);
    el.textContent = this.deps.t(
      `\u5B89\u5168\u56FE\u7247\u52A0\u8F7D\u5931\u8D25\uFF1A${remotePath}\uFF08${message}\uFF09`,
      `Secure image failed: ${remotePath} (${message})`
    );
    return el;
  }
};

// secure-webdav-upload-queue.ts
var import_obsidian2 = require("obsidian");
var SecureWebdavUploadQueueSupport = class {
  constructor(deps) {
    this.deps = deps;
    this.processingTaskIds = /* @__PURE__ */ new Set();
    this.retryTimeouts = /* @__PURE__ */ new Map();
    this.pendingTaskPromises = /* @__PURE__ */ new Map();
  }
  dispose() {
    for (const timeoutId of this.retryTimeouts.values()) {
      window.clearTimeout(timeoutId);
    }
    this.retryTimeouts.clear();
  }
  hasPendingWork() {
    return this.deps.getQueue().length > 0 || this.processingTaskIds.size > 0 || this.pendingTaskPromises.size > 0;
  }
  hasPendingWorkForNote(notePath) {
    const queue = this.deps.getQueue();
    if (queue.some((task) => task.notePath === notePath)) {
      return true;
    }
    for (const taskId of this.processingTaskIds) {
      const task = queue.find((item) => item.id === taskId);
      if (task?.notePath === notePath) {
        return true;
      }
    }
    for (const [taskId] of this.pendingTaskPromises) {
      const task = queue.find((item) => item.id === taskId);
      if (task?.notePath === notePath) {
        return true;
      }
    }
    return false;
  }
  async enqueueEditorImageUpload(noteFile, editor, imageFile, fileName) {
    try {
      const arrayBuffer = await imageFile.arrayBuffer();
      const task = this.createUploadTask(
        noteFile.path,
        arrayBuffer,
        imageFile.type || this.deps.getMimeTypeFromFileName(fileName),
        fileName
      );
      this.insertPlaceholder(editor, task.placeholder);
      this.deps.setQueue([...this.deps.getQueue(), task]);
      await this.deps.savePluginState();
      void this.processPendingTasks();
      new import_obsidian2.Notice(this.deps.t("\u5DF2\u52A0\u5165\u56FE\u7247\u81EA\u52A8\u4E0A\u4F20\u961F\u5217\u3002", "Image added to the auto-upload queue."));
    } catch (error) {
      console.error("Failed to queue secure image upload", error);
      new import_obsidian2.Notice(
        this.deps.describeError(
          this.deps.t("\u52A0\u5165\u56FE\u7247\u81EA\u52A8\u4E0A\u4F20\u961F\u5217\u5931\u8D25", "Failed to queue image for auto-upload"),
          error
        ),
        8e3
      );
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
      dataBase64: this.deps.arrayBufferToBase64(binary),
      attempts: 0,
      createdAt: Date.now()
    };
  }
  buildPendingPlaceholder(taskId, fileName) {
    const safeName = this.deps.escapeHtml(fileName);
    return `<span class="secure-webdav-pending" data-secure-webdav-task="${taskId}" aria-label="${safeName}">${this.deps.escapeHtml(this.deps.t(`\u3010\u56FE\u7247\u4E0A\u4F20\u4E2D\uFF5C${fileName}\u3011`, `[Uploading image | ${fileName}]`))}</span>`;
  }
  buildFailedPlaceholder(fileName, message) {
    const safeName = this.deps.escapeHtml(fileName);
    const safeMessage = this.deps.escapeHtml(message ?? this.deps.t("\u672A\u77E5\u9519\u8BEF", "Unknown error"));
    const label = this.deps.escapeHtml(this.deps.t(`\u3010\u56FE\u7247\u4E0A\u4F20\u5931\u8D25\uFF5C${fileName}\u3011`, `[Image upload failed | ${fileName}]`));
    return `<span class="secure-webdav-failed" aria-label="${safeName}">${label}: ${safeMessage}</span>`;
  }
  async processPendingTasks() {
    const running = [];
    for (const task of this.deps.getQueue()) {
      if (this.processingTaskIds.has(task.id)) {
        continue;
      }
      running.push(this.startPendingTask(task));
    }
    await Promise.allSettled(running);
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
  async processTask(task) {
    this.processingTaskIds.add(task.id);
    try {
      const binary = this.deps.base64ToArrayBuffer(task.dataBase64);
      const prepared = await this.deps.prepareUploadPayload(
        binary,
        task.mimeType || this.deps.getMimeTypeFromFileName(task.fileName),
        task.fileName
      );
      const remoteName = await this.deps.buildRemoteFileNameFromBinary(prepared.fileName, prepared.binary);
      const remotePath = this.deps.buildRemotePath(remoteName);
      const response = await this.deps.requestUrl({
        url: this.deps.buildUploadUrl(remotePath),
        method: "PUT",
        headers: {
          Authorization: this.deps.buildAuthHeader(),
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
        this.deps.buildSecureImageMarkup(`webdav-secure://${remotePath}`, prepared.fileName)
      );
      if (!replaced) {
        throw new Error(
          this.deps.t(
            "\u4E0A\u4F20\u6210\u529F\uFF0C\u4F46\u6CA1\u6709\u5728\u7B14\u8BB0\u4E2D\u627E\u5230\u53EF\u66FF\u6362\u7684\u5360\u4F4D\u7B26\u3002",
            "Upload succeeded, but no matching placeholder was found in the note."
          )
        );
      }
      this.deps.setQueue(this.deps.getQueue().filter((item) => item.id !== task.id));
      await this.deps.savePluginState();
      this.deps.schedulePriorityNoteSync(task.notePath, "image-add");
      new import_obsidian2.Notice(this.deps.t("\u56FE\u7247\u4E0A\u4F20\u6210\u529F\u3002", "Image uploaded successfully."));
    } catch (error) {
      console.error("Secure WebDAV queued upload failed", error);
      task.attempts += 1;
      task.lastError = error instanceof Error ? error.message : String(error);
      await this.deps.savePluginState();
      if (task.attempts >= this.deps.settings().maxRetryAttempts) {
        await this.replacePlaceholder(
          task.notePath,
          task.id,
          task.placeholder,
          this.buildFailedPlaceholder(task.fileName, task.lastError)
        );
        this.deps.setQueue(this.deps.getQueue().filter((item) => item.id !== task.id));
        await this.deps.savePluginState();
        new import_obsidian2.Notice(this.deps.describeError(this.deps.t("\u56FE\u7247\u4E0A\u4F20\u6700\u7EC8\u5931\u8D25", "Image upload failed permanently"), error), 8e3);
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
    const delay = Math.max(1, this.deps.settings().retryDelaySeconds) * 1e3 * task.attempts;
    const timeoutId = window.setTimeout(() => {
      this.retryTimeouts.delete(task.id);
      void this.startPendingTask(task);
    }, delay);
    this.retryTimeouts.set(task.id, timeoutId);
  }
  insertPlaceholder(editor, placeholder) {
    editor.replaceSelection(`${placeholder}
`);
  }
  async replacePlaceholder(notePath, taskId, placeholder, replacement) {
    const replacedInEditor = this.replacePlaceholderInOpenEditors(notePath, taskId, placeholder, replacement);
    if (replacedInEditor) {
      return true;
    }
    const file = this.deps.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof import_obsidian2.TFile)) {
      return false;
    }
    const content = await this.deps.app.vault.read(file);
    if (content.includes(placeholder)) {
      const updated = content.replace(placeholder, replacement);
      if (updated !== content) {
        await this.deps.app.vault.modify(file, updated);
        return true;
      }
    }
    const pattern = new RegExp(
      `<span[^>]*data-secure-webdav-task="${this.deps.escapeRegExp(taskId)}"[^>]*>.*?<\\/span>`,
      "s"
    );
    if (pattern.test(content)) {
      const updated = content.replace(pattern, replacement);
      if (updated !== content) {
        await this.deps.app.vault.modify(file, updated);
        return true;
      }
    }
    return false;
  }
  replacePlaceholderInOpenEditors(notePath, taskId, placeholder, replacement) {
    let replaced = false;
    const leaves = this.deps.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const view = leaf.view;
      if (!(view instanceof import_obsidian2.MarkdownView)) {
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
          `<span[^>]*data-secure-webdav-task="${this.deps.escapeRegExp(taskId)}"[^>]*>.*?<\\/span>`,
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
};

// secure-webdav-sync-support.ts
var import_obsidian3 = require("obsidian");
var SecureWebdavSyncSupport = class {
  constructor(deps) {
    this.deps = deps;
  }
  shouldSkipContentSyncPath(path) {
    const normalizedPath = (0, import_obsidian3.normalizePath)(path);
    if (normalizedPath.startsWith(".obsidian/") || normalizedPath.startsWith(".trash/") || normalizedPath.startsWith(".git/") || normalizedPath.startsWith("node_modules/") || normalizedPath.startsWith("_plugin_packages/") || normalizedPath.startsWith(".tmp-") || normalizedPath.startsWith(".obsidian/plugins/secure-webdav-images/")) {
      return true;
    }
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(normalizedPath);
  }
  collectVaultContentFiles() {
    return this.deps.app.vault.getFiles().filter((file) => !this.shouldSkipContentSyncPath(file.path)).sort((a, b) => a.path.localeCompare(b.path));
  }
  buildSyncSignature(file) {
    return `${file.stat.mtime}:${file.stat.size}`;
  }
  buildRemoteSyncSignature(remote) {
    return `${remote.lastModified}:${remote.size}`;
  }
  buildVaultSyncRemotePath(vaultPath) {
    return `${this.normalizeFolder(this.deps.getVaultSyncRemoteFolder())}${vaultPath}`;
  }
  buildDeletionFolder() {
    return `${this.normalizeFolder(this.deps.getVaultSyncRemoteFolder()).replace(/\/$/, "")}${this.deps.deletionFolderSuffix}`;
  }
  buildDeletionRemotePath(vaultPath) {
    return `${this.buildDeletionFolder()}${this.deps.encodeBase64Url(vaultPath)}.json`;
  }
  remoteDeletionPathToVaultPath(remotePath) {
    const root = this.buildDeletionFolder();
    if (!remotePath.startsWith(root) || !remotePath.endsWith(".json")) {
      return null;
    }
    const encoded = remotePath.slice(root.length, -".json".length);
    try {
      return this.deps.decodeBase64Url(encoded);
    } catch {
      return null;
    }
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
  remotePathToVaultPath(remotePath) {
    const root = this.normalizeFolder(this.deps.getVaultSyncRemoteFolder());
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
  normalizeFolder(input) {
    return input.replace(/^\/+/, "").replace(/\/+$/, "") + "/";
  }
};

// main.ts
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
var SECURE_NOTE_STUB = "secure-webdav-note-stub";
var SecureWebdavImagesPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.queue = [];
    this.blobUrls = /* @__PURE__ */ new Set();
    this.noteRemoteRefs = /* @__PURE__ */ new Map();
    this.remoteCleanupInFlight = /* @__PURE__ */ new Set();
    this.noteAccessTimestamps = /* @__PURE__ */ new Map();
    this.syncIndex = /* @__PURE__ */ new Map();
    this.missingLazyRemoteNotes = /* @__PURE__ */ new Map();
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
  initializeSupportModules() {
    this.imageSupport = new SecureWebdavImageSupport({
      t: this.t.bind(this),
      fetchSecureImageBlobUrl: this.fetchSecureImageBlobUrl.bind(this)
    });
    this.uploadQueue = new SecureWebdavUploadQueueSupport({
      app: this.app,
      t: this.t.bind(this),
      settings: () => this.settings,
      getQueue: () => this.queue,
      setQueue: (queue) => {
        this.queue = queue;
      },
      savePluginState: this.savePluginState.bind(this),
      schedulePriorityNoteSync: this.schedulePriorityNoteSync.bind(this),
      requestUrl: this.requestUrl.bind(this),
      buildUploadUrl: this.buildUploadUrl.bind(this),
      buildAuthHeader: this.buildAuthHeader.bind(this),
      prepareUploadPayload: this.prepareUploadPayload.bind(this),
      buildRemoteFileNameFromBinary: this.buildRemoteFileNameFromBinary.bind(this),
      buildRemotePath: this.buildRemotePath.bind(this),
      buildSecureImageMarkup: this.imageSupport.buildSecureImageMarkup.bind(this.imageSupport),
      getMimeTypeFromFileName: this.getMimeTypeFromFileName.bind(this),
      arrayBufferToBase64: this.arrayBufferToBase64.bind(this),
      base64ToArrayBuffer: this.base64ToArrayBuffer.bind(this),
      escapeHtml: this.escapeHtml.bind(this),
      escapeRegExp: this.escapeRegExp.bind(this),
      describeError: this.describeError.bind(this)
    });
    this.syncSupport = new SecureWebdavSyncSupport({
      app: this.app,
      getVaultSyncRemoteFolder: () => this.settings.vaultSyncRemoteFolder,
      deletionFolderSuffix: this.deletionFolderSuffix,
      encodeBase64Url: (value) => this.arrayBufferToBase64(this.encodeUtf8(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""),
      decodeBase64Url: (value) => {
        const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
        return this.decodeUtf8(this.base64ToArrayBuffer(padded));
      }
    });
  }
  ensureSupportModules() {
    if (!this.imageSupport || !this.uploadQueue || !this.syncSupport) {
      this.initializeSupportModules();
    }
  }
  async onload() {
    await this.loadPluginState();
    this.initializeSupportModules();
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
      void this.imageSupport.processSecureImages(el, ctx);
    });
    this.registerMarkdownCodeBlockProcessor(SECURE_CODE_BLOCK, (source, el, ctx) => {
      void this.imageSupport.processSecureCodeBlock(source, el, ctx);
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
      this.uploadQueue.dispose();
    });
  }
  onunload() {
    for (const blobUrl of this.blobUrls) {
      URL.revokeObjectURL(blobUrl);
    }
    this.blobUrls.clear();
    this.uploadQueue?.dispose();
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
    if (!(file instanceof import_obsidian4.TFile) || file.extension !== "md") {
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
    if (!(file instanceof import_obsidian4.TFile)) {
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
    if (!(file instanceof import_obsidian4.TFile)) {
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
      const parsed = this.imageSupport.parseSecureImageBlock(match[1]);
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
    if (!(file instanceof import_obsidian4.TFile) || file.extension !== "md" || this.shouldSkipContentSyncPath(file.path)) {
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
    this.ensureSupportModules();
    return this.uploadQueue.hasPendingWorkForNote(notePath);
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
          rewritten: this.imageSupport.buildSecureImageMarkup(remoteUrl, file.basename),
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
            rewritten: this.imageSupport.buildSecureImageMarkup(remoteUrl, altText)
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
          rewritten: this.imageSupport.buildSecureImageMarkup(remoteUrl, file.basename),
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
        rewritten: this.imageSupport.buildSecureImageMarkup(remoteUrl, altText)
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
    return target instanceof import_obsidian4.TFile ? target : null;
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
      new import_obsidian4.Notice(this.t("\u5DF2\u5C06\u7F51\u9875\u56FE\u6587\u7C98\u8D34\u5E76\u6293\u53D6\u8FDC\u7A0B\u56FE\u7247\u3002", "Pasted web content and captured remote images."));
    } catch (error) {
      console.error("Failed to paste HTML content with remote images", error);
      new import_obsidian4.Notice(
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
      return this.imageSupport.buildSecureImageMarkup(remoteUrl, alt);
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
    this.ensureSupportModules();
    await this.uploadQueue.enqueueEditorImageUpload(noteFile, editor, imageFile, fileName);
  }
  createUploadTask(notePath, binary, mimeType, fileName) {
    this.ensureSupportModules();
    return this.uploadQueue.createUploadTask(notePath, binary, mimeType, fileName);
  }
  buildPendingPlaceholder(taskId, fileName) {
    this.ensureSupportModules();
    return this.uploadQueue.buildPendingPlaceholder(taskId, fileName);
  }
  async syncConfiguredVaultContent(showNotice = true) {
    if (this.syncInProgress) {
      if (showNotice) {
        new import_obsidian4.Notice(this.t("\u540C\u6B65\u6B63\u5728\u8FDB\u884C\u4E2D\u3002", "A sync is already in progress."), 4e3);
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
        new import_obsidian4.Notice(this.lastVaultSyncStatus, 8e3);
      }
    } catch (error) {
      console.error("Vault content sync failed", error);
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.describeError(this.t("\u5185\u5BB9\u540C\u6B65\u5931\u8D25", "Content sync failed"), error);
      await this.savePluginState();
      if (showNotice) {
        new import_obsidian4.Notice(this.lastVaultSyncStatus, 8e3);
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
    this.ensureSupportModules();
    return this.syncSupport.buildRemoteSyncSignature(remote);
  }
  buildDeletionFolder() {
    this.ensureSupportModules();
    return this.syncSupport.buildDeletionFolder();
  }
  buildDeletionRemotePath(vaultPath) {
    this.ensureSupportModules();
    return this.syncSupport.buildDeletionRemotePath(vaultPath);
  }
  parseDeletionTombstoneBase64(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return this.decodeUtf8(this.base64ToArrayBuffer(padded));
  }
  remoteDeletionPathToVaultPath(remotePath) {
    this.ensureSupportModules();
    return this.syncSupport.remoteDeletionPathToVaultPath(remotePath);
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
    this.ensureSupportModules();
    return this.syncSupport.parseDeletionTombstonePayload(raw);
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
    this.ensureSupportModules();
    return this.syncSupport.remotePathToVaultPath(remotePath);
  }
  shouldDownloadRemoteVersion(localMtime, remoteMtime) {
    this.ensureSupportModules();
    return this.syncSupport.shouldDownloadRemoteVersion(localMtime, remoteMtime);
  }
  isTombstoneAuthoritative(tombstone, remote) {
    this.ensureSupportModules();
    return this.syncSupport.isTombstoneAuthoritative(tombstone, remote);
  }
  shouldDeleteLocalFromTombstone(file, tombstone) {
    this.ensureSupportModules();
    return this.syncSupport.shouldDeleteLocalFromTombstone(file, tombstone);
  }
  getVaultFileByPath(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof import_obsidian4.TFile ? file : null;
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
    const normalized = (0, import_obsidian4.normalizePath)(path);
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
    if (!(file instanceof import_obsidian4.TFile) || file.extension !== "md") {
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
          new import_obsidian4.Notice(
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
          new import_obsidian4.Notice(
            this.t(
              `\u8FDC\u7AEF\u6B63\u6587\u8FDE\u7EED\u7F3A\u5931\uFF0C\u5DF2\u79FB\u9664\u672C\u5730\u5931\u6548\u5360\u4F4D\u7B14\u8BB0\uFF1A${file.basename}`,
              `Remote note was missing repeatedly, removed local broken placeholder: ${file.basename}`
            ),
            8e3
          );
          return;
        }
        await this.savePluginState();
        new import_obsidian4.Notice(this.t("\u8FDC\u7AEF\u6B63\u6587\u4E0D\u5B58\u5728\uFF0C\u5F53\u524D\u5148\u4FDD\u7559\u672C\u5730\u5360\u4F4D\u7B14\u8BB0\u4EE5\u9632\u4E34\u65F6\u5F02\u5E38\uFF1B\u82E5\u518D\u6B21\u786E\u8BA4\u7F3A\u5931\uFF0C\u5C06\u81EA\u52A8\u6E05\u7406\u8BE5\u5360\u4F4D\u3002", "Remote note is missing. The local placeholder was kept for now in case this is transient; it will be cleaned automatically if the remote is still missing on the next confirmation."), 8e3);
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
      new import_obsidian4.Notice(this.t(`\u5DF2\u4ECE\u8FDC\u7AEF\u6062\u590D\u7B14\u8BB0\uFF1A${file.basename}`, `Restored note from remote: ${file.basename}`), 6e3);
    } catch (error) {
      console.error("Failed to hydrate note from remote", error);
      new import_obsidian4.Notice(this.describeError(this.t("\u8FDC\u7AEF\u6062\u590D\u7B14\u8BB0\u5931\u8D25", "Failed to restore note from remote"), error), 8e3);
    }
  }
  shouldSkipContentSyncPath(path) {
    this.ensureSupportModules();
    return this.syncSupport.shouldSkipContentSyncPath(path);
  }
  collectVaultContentFiles() {
    this.ensureSupportModules();
    return this.syncSupport.collectVaultContentFiles();
  }
  buildSyncSignature(file) {
    this.ensureSupportModules();
    return this.syncSupport.buildSyncSignature(file);
  }
  getOpenMarkdownContent(notePath) {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const view = leaf.view;
      if (!(view instanceof import_obsidian4.MarkdownView)) {
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
    this.ensureSupportModules();
    return this.syncSupport.buildVaultSyncRemotePath(vaultPath);
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
          new import_obsidian4.Notice(this.t("\u5F53\u524D\u672A\u542F\u7528\u6309\u9700\u52A0\u8F7D\u7B14\u8BB0\u6A21\u5F0F\u3002", "Lazy note mode is not enabled."), 6e3);
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
        new import_obsidian4.Notice(
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
        new import_obsidian4.Notice(this.describeError(this.t("\u56DE\u6536\u672C\u5730\u7B14\u8BB0\u5931\u8D25", "Failed to evict local notes"), error), 8e3);
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
    this.ensureSupportModules();
    await this.uploadQueue.processPendingTasks();
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
    this.ensureSupportModules();
    return this.uploadQueue.startPendingTask(task);
  }
  async preparePendingUploadsForSync(showNotice) {
    this.ensureSupportModules();
    await this.processPendingTasks();
    if (this.uploadQueue.hasPendingWork()) {
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.t(
        "\u68C0\u6D4B\u5230\u56FE\u7247\u4E0A\u4F20\u4ECD\u5728\u8FDB\u884C\u6216\u7B49\u5F85\u91CD\u8BD5\uFF0C\u5DF2\u6682\u7F13\u672C\u6B21\u7B14\u8BB0\u540C\u6B65\uFF0C\u907F\u514D\u65E7\u7248\u7B14\u8BB0\u8986\u76D6\u65B0\u56FE\u7247\u5F15\u7528\u3002",
        "Image uploads are still running or waiting for retry, so note sync was deferred to avoid old note content overwriting new image references."
      );
      await this.savePluginState();
      if (showNotice) {
        new import_obsidian4.Notice(this.lastVaultSyncStatus, 8e3);
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
        new import_obsidian4.Notice(this.t("\u5F53\u524D\u7B14\u8BB0\u4E2D\u6CA1\u6709\u627E\u5230\u672C\u5730\u56FE\u7247\u3002", "No local images found in the current note."));
        return;
      }
      let updated = content;
      for (const replacement of replacements) {
        updated = updated.split(replacement.original).join(replacement.rewritten);
      }
      if (updated === content) {
        new import_obsidian4.Notice(this.t("\u6CA1\u6709\u9700\u8981\u6539\u5199\u7684\u56FE\u7247\u94FE\u63A5\u3002", "No images were rewritten."));
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
      new import_obsidian4.Notice(this.t(`\u5DF2\u4E0A\u4F20 ${replacements.length} \u5F20\u56FE\u7247\u5230 WebDAV\u3002`, `Uploaded ${replacements.length} image(s) to WebDAV.`));
    } catch (error) {
      console.error("Secure WebDAV upload failed", error);
      new import_obsidian4.Notice(this.describeError(this.t("\u4E0A\u4F20\u5931\u8D25", "Upload failed"), error), 8e3);
    }
  }
  async processTask(task) {
    this.ensureSupportModules();
    await this.uploadQueue.processTask(task);
  }
  buildFailedPlaceholder(fileName, message) {
    this.ensureSupportModules();
    return this.uploadQueue.buildFailedPlaceholder(fileName, message);
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
          (_match, remotePath, alt) => this.imageSupport.buildSecureImageCodeBlock(
            this.unescapeHtml(remotePath),
            this.unescapeHtml(alt) || this.unescapeHtml(remotePath)
          )
        ).replace(
          /!\[[^\]]*]\(webdav-secure:\/\/([^)]+)\)/g,
          (_match, remotePath) => this.imageSupport.buildSecureImageCodeBlock(this.unescapeHtml(remotePath), this.unescapeHtml(remotePath))
        );
        if (updated === content) {
          continue;
        }
        await this.app.vault.modify(file, updated);
        changedFiles += 1;
      }
      if (changedFiles === 0) {
        new import_obsidian4.Notice(
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
      new import_obsidian4.Notice(
        this.t(
          `\u5DF2\u8FC1\u79FB ${changedFiles} \u7BC7\u7B14\u8BB0\u5230\u65B0\u7684\u5B89\u5168\u56FE\u7247\u4EE3\u7801\u5757\u683C\u5F0F\u3002`,
          `Migrated ${changedFiles} note(s) to the new secure image code-block format.`
        ),
        8e3
      );
    } catch (error) {
      console.error("Failed to migrate secure images to code blocks", error);
      new import_obsidian4.Notice(this.describeError(this.t("\u8FC1\u79FB\u5B89\u5168\u56FE\u7247\u683C\u5F0F\u5931\u8D25", "Failed to migrate secure image format"), error), 8e3);
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
      new import_obsidian4.Notice(message, 6e3);
      if (showModal) {
        new ResultModal(this.app, this.t("WebDAV \u8FDE\u63A5", "WebDAV Connection"), message).open();
      }
      return true;
    } catch (error) {
      console.error("Secure WebDAV test failed", error);
      const message = this.describeError(this.t("WebDAV \u6D4B\u8BD5\u5931\u8D25", "WebDAV test failed"), error);
      new import_obsidian4.Notice(message, 8e3);
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
    const response = await (0, import_obsidian4.requestUrl)({
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
var SecureWebdavSettingTab = class extends import_obsidian4.PluginSettingTab {
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
    new import_obsidian4.Setting(containerEl).setName(this.plugin.t("\u5F53\u524D\u63D2\u4EF6\u7248\u672C", "Current plugin version")).setDesc(
      this.plugin.t(
        "\u591A\u7AEF\u4F7F\u7528\u65F6\u53EF\u5148\u6838\u5BF9\u8FD9\u91CC\u7684\u7248\u672C\u53F7\uFF0C\u907F\u514D\u56E0\u4E3A\u5BA2\u6237\u7AEF\u5347\u7EA7\u4E0D\u5230\u4F4D\u5BFC\u81F4\u884C\u4E3A\u4E0D\u4E00\u81F4\u3002",
        "Check this version first across devices to avoid inconsistent behavior caused by incomplete upgrades."
      )
    ).addText((text) => {
      text.setValue(this.plugin.manifest.version);
      text.setDisabled(true);
    });
    containerEl.createEl("h3", { text: this.plugin.t("\u754C\u9762\u8BED\u8A00", "Interface language") });
    new import_obsidian4.Setting(containerEl).setName(this.plugin.t("\u8BED\u8A00", "Language")).setDesc(this.plugin.t("\u8BBE\u7F6E\u9875\u652F\u6301\u81EA\u52A8\u3001\u4E2D\u6587\u3001\u82F1\u6587\u5207\u6362\u3002", "Switch the settings UI between auto, Chinese, and English.")).addDropdown(
      (dropdown) => dropdown.addOption("auto", this.plugin.t("\u81EA\u52A8", "Auto")).addOption("zh", "\u4E2D\u6587").addOption("en", "English").setValue(this.plugin.settings.language).onChange(async (value) => {
        this.plugin.settings.language = value;
        await this.plugin.saveSettings();
        this.display();
      })
    );
    containerEl.createEl("h3", { text: this.plugin.t("\u8FDE\u63A5\u8BBE\u7F6E", "Connection") });
    new import_obsidian4.Setting(containerEl).setName(this.plugin.t("WebDAV \u57FA\u7840\u5730\u5740", "WebDAV base URL")).setDesc(this.plugin.t("\u670D\u52A1\u5668\u57FA\u7840\u5730\u5740\uFF0C\u4F8B\u5982\uFF1Ahttp://your-webdav-host:port", "Base server URL. Example: http://your-webdav-host:port")).addText(
      (text) => text.setPlaceholder("http://your-webdav-host:port").setValue(this.plugin.settings.webdavUrl).onChange(async (value) => {
        this.plugin.settings.webdavUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName(this.plugin.t("\u8D26\u53F7", "Username")).addText(
      (text) => text.setValue(this.plugin.settings.username).onChange(async (value) => {
        this.plugin.settings.username = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName(this.plugin.t("\u5BC6\u7801", "Password")).setDesc(this.plugin.t("\u9ED8\u8BA4\u9690\u85CF\uFF0C\u53EF\u70B9\u51FB\u53F3\u4FA7\u6309\u94AE\u663E\u793A\u6216\u9690\u85CF\u3002", "Hidden by default. Use the button on the right to show or hide it.")).addText((text) => {
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
    new import_obsidian4.Setting(containerEl).setName(this.plugin.t("\u56FE\u7247\u8FDC\u7A0B\u76EE\u5F55", "Image remote folder")).setDesc(
      this.plugin.t(
        "\u4E13\u95E8\u7528\u4E8E\u5B58\u653E\u8FDC\u7A0B\u56FE\u7247\u7684 WebDAV \u76EE\u5F55\uFF0C\u4F8B\u5982\uFF1A/remote-images/\u3002\u56FE\u7247\u4E0A\u4F20\u6210\u529F\u540E\u4F1A\u7ACB\u5373\u5220\u9664\u672C\u5730\u56FE\u7247\u6587\u4EF6\u3002",
        "Dedicated WebDAV folder for remote images, for example: /remote-images/. Local image files are deleted immediately after upload succeeds."
      )
    ).addText(
      (text) => text.setValue(this.plugin.settings.remoteFolder).onChange(async (value) => {
        this.plugin.settings.remoteFolder = (0, import_obsidian4.normalizePath)(value.trim() || "/remote-images/");
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName(this.plugin.t("\u6D4B\u8BD5\u8FDE\u63A5", "Test connection")).setDesc(this.plugin.t("\u4F7F\u7528\u4E34\u65F6\u63A2\u9488\u6587\u4EF6\u9A8C\u8BC1 PUT\u3001GET\u3001DELETE \u662F\u5426\u6B63\u5E38\u3002", "Verify PUT, GET, and DELETE using a temporary probe file.")).addButton(
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
    new import_obsidian4.Setting(containerEl).setName(this.plugin.t("\u8FDC\u7A0B\u7B14\u8BB0\u76EE\u5F55", "Remote notes folder")).setDesc(
      this.plugin.t(
        "\u7528\u4E8E\u5B58\u653E\u7B14\u8BB0\u548C\u5176\u4ED6\u975E\u56FE\u7247\u9644\u4EF6\u539F\u6837\u540C\u6B65\u526F\u672C\u7684\u8FDC\u7AEF\u76EE\u5F55\uFF0C\u4F8B\u5982\uFF1A/vault-sync/\u3002\u63D2\u4EF6\u4F1A\u81EA\u52A8\u540C\u6B65\u6574\u4E2A vault\uFF0C\u5E76\u8DF3\u8FC7 .obsidian\u3001\u63D2\u4EF6\u76EE\u5F55\u548C\u56FE\u7247\u6587\u4EF6\u3002",
        "Remote folder used for notes and other non-image attachments synced as-is, for example: /vault-sync/. The plugin syncs the whole vault and automatically skips .obsidian, the plugin directory, and image files."
      )
    ).addText(
      (text) => text.setValue(this.plugin.settings.vaultSyncRemoteFolder).onChange(async (value) => {
        this.plugin.settings.vaultSyncRemoteFolder = (0, import_obsidian4.normalizePath)(value.trim() || "/vault-sync/");
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName(this.plugin.t("\u81EA\u52A8\u540C\u6B65\u9891\u7387", "Auto sync frequency")).setDesc(
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
    new import_obsidian4.Setting(containerEl).setName(this.plugin.t("\u7B14\u8BB0\u672C\u5730\u4FDD\u7559\u6A21\u5F0F", "Note local retention mode")).setDesc(
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
    new import_obsidian4.Setting(containerEl).setName(this.plugin.t("\u7B14\u8BB0\u672C\u5730\u56DE\u6536\u5929\u6570", "Note eviction days")).setDesc(
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
    new import_obsidian4.Setting(containerEl).setName(this.plugin.t("\u540C\u6B65\u72B6\u6001", "Sync status")).setDesc(
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
    new import_obsidian4.Setting(containerEl).setName(this.plugin.t("\u8FC1\u79FB\u6574\u5E93\u539F\u751F\u56FE\u7247\u5F15\u7528", "Migrate native image embeds in vault")).setDesc(
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
var ResultModal = class extends import_obsidian4.Modal {
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyIsICJzZWN1cmUtd2ViZGF2LWltYWdlLXN1cHBvcnQudHMiLCAic2VjdXJlLXdlYmRhdi11cGxvYWQtcXVldWUudHMiLCAic2VjdXJlLXdlYmRhdi1zeW5jLXN1cHBvcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIlx1RkVGRmltcG9ydCB7XHJcbiAgQXBwLFxuICBFZGl0b3IsXG4gIE1hcmtkb3duRmlsZUluZm8sXG4gIE1hcmtkb3duVmlldyxcclxuICBNb2RhbCxcclxuICBOb3RpY2UsXHJcbiAgUGx1Z2luLFxyXG4gIFBsdWdpblNldHRpbmdUYWIsXHJcbiAgU2V0dGluZyxcclxuICBUQWJzdHJhY3RGaWxlLFxuICBURmlsZSxcbiAgbm9ybWFsaXplUGF0aCxcbiAgcmVxdWVzdFVybCBhcyBvYnNpZGlhblJlcXVlc3RVcmwsXG59IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHsgU0VDVVJFX0NPREVfQkxPQ0ssIFNFQ1VSRV9QUk9UT0NPTCwgU2VjdXJlV2ViZGF2SW1hZ2VTdXBwb3J0IH0gZnJvbSBcIi4vc2VjdXJlLXdlYmRhdi1pbWFnZS1zdXBwb3J0XCI7XG5pbXBvcnQgeyBTZWN1cmVXZWJkYXZVcGxvYWRRdWV1ZVN1cHBvcnQsIHR5cGUgVXBsb2FkVGFzayB9IGZyb20gXCIuL3NlY3VyZS13ZWJkYXYtdXBsb2FkLXF1ZXVlXCI7XG5pbXBvcnQge1xuICBTZWN1cmVXZWJkYXZTeW5jU3VwcG9ydCxcbiAgdHlwZSBEZWxldGlvblRvbWJzdG9uZSxcbn0gZnJvbSBcIi4vc2VjdXJlLXdlYmRhdi1zeW5jLXN1cHBvcnRcIjtcblxyXG50eXBlIFNlY3VyZVdlYmRhdlNldHRpbmdzID0ge1xuICB3ZWJkYXZVcmw6IHN0cmluZztcbiAgdXNlcm5hbWU6IHN0cmluZztcbiAgcGFzc3dvcmQ6IHN0cmluZztcbiAgcmVtb3RlRm9sZGVyOiBzdHJpbmc7XG4gIHZhdWx0U3luY1JlbW90ZUZvbGRlcjogc3RyaW5nO1xuICBuYW1pbmdTdHJhdGVneTogXCJ0aW1lc3RhbXBcIiB8IFwiaGFzaFwiO1xuICBkZWxldGVMb2NhbEFmdGVyVXBsb2FkOiBib29sZWFuO1xuICBsYW5ndWFnZTogXCJhdXRvXCIgfCBcInpoXCIgfCBcImVuXCI7XG4gIG5vdGVTdG9yYWdlTW9kZTogXCJmdWxsLWxvY2FsXCIgfCBcImxhenktbm90ZXNcIjtcbiAgbm90ZUV2aWN0QWZ0ZXJEYXlzOiBudW1iZXI7XG4gIGF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzOiBudW1iZXI7XG4gIG1heFJldHJ5QXR0ZW1wdHM6IG51bWJlcjtcbiAgcmV0cnlEZWxheVNlY29uZHM6IG51bWJlcjtcbiAgZGVsZXRlUmVtb3RlV2hlblVucmVmZXJlbmNlZDogYm9vbGVhbjtcbiAgY29tcHJlc3NJbWFnZXM6IGJvb2xlYW47XG4gIGNvbXByZXNzVGhyZXNob2xkS2I6IG51bWJlcjtcbiAgbWF4SW1hZ2VEaW1lbnNpb246IG51bWJlcjtcbiAganBlZ1F1YWxpdHk6IG51bWJlcjtcbn07XG5cclxudHlwZSBTeW5jSW5kZXhFbnRyeSA9IHtcbiAgbG9jYWxTaWduYXR1cmU6IHN0cmluZztcbiAgcmVtb3RlU2lnbmF0dXJlOiBzdHJpbmc7XG4gIHJlbW90ZVBhdGg6IHN0cmluZztcbn07XG5cbnR5cGUgUmVtb3RlRmlsZVN0YXRlID0ge1xuICByZW1vdGVQYXRoOiBzdHJpbmc7XG4gIGxhc3RNb2RpZmllZDogbnVtYmVyO1xuICBzaXplOiBudW1iZXI7XG4gIHNpZ25hdHVyZTogc3RyaW5nO1xufTtcblxudHlwZSBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZCA9IHtcbiAgZmlyc3REZXRlY3RlZEF0OiBudW1iZXI7XG4gIGxhc3REZXRlY3RlZEF0OiBudW1iZXI7XG4gIG1pc3NDb3VudDogbnVtYmVyO1xufTtcblxudHlwZSBSZW1vdGVJbnZlbnRvcnkgPSB7XG4gIGZpbGVzOiBNYXA8c3RyaW5nLCBSZW1vdGVGaWxlU3RhdGU+O1xuICBkaXJlY3RvcmllczogU2V0PHN0cmluZz47XG59O1xuXG5jb25zdCBERUZBVUxUX1NFVFRJTkdTOiBTZWN1cmVXZWJkYXZTZXR0aW5ncyA9IHtcbiAgd2ViZGF2VXJsOiBcIlwiLFxuICB1c2VybmFtZTogXCJcIixcbiAgcGFzc3dvcmQ6IFwiXCIsXG4gIHJlbW90ZUZvbGRlcjogXCIvcmVtb3RlLWltYWdlcy9cIixcbiAgdmF1bHRTeW5jUmVtb3RlRm9sZGVyOiBcIi92YXVsdC1zeW5jL1wiLFxuICBuYW1pbmdTdHJhdGVneTogXCJoYXNoXCIsXG4gIGRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQ6IHRydWUsXG4gIGxhbmd1YWdlOiBcImF1dG9cIixcbiAgbm90ZVN0b3JhZ2VNb2RlOiBcImZ1bGwtbG9jYWxcIixcbiAgbm90ZUV2aWN0QWZ0ZXJEYXlzOiAzMCxcbiAgYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXM6IDAsXG4gIG1heFJldHJ5QXR0ZW1wdHM6IDUsXG4gIHJldHJ5RGVsYXlTZWNvbmRzOiA1LFxuICBkZWxldGVSZW1vdGVXaGVuVW5yZWZlcmVuY2VkOiB0cnVlLFxuICBjb21wcmVzc0ltYWdlczogdHJ1ZSxcbiAgY29tcHJlc3NUaHJlc2hvbGRLYjogMzAwLFxuICBtYXhJbWFnZURpbWVuc2lvbjogMjIwMCxcbiAganBlZ1F1YWxpdHk6IDgyLFxufTtcblxyXG5jb25zdCBTRUNVUkVfTk9URV9TVFVCID0gXCJzZWN1cmUtd2ViZGF2LW5vdGUtc3R1YlwiO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTZWN1cmVXZWJkYXZJbWFnZXNQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogU2VjdXJlV2ViZGF2U2V0dGluZ3MgPSBERUZBVUxUX1NFVFRJTkdTO1xuICBxdWV1ZTogVXBsb2FkVGFza1tdID0gW107XG4gIHByaXZhdGUgYmxvYlVybHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBub3RlUmVtb3RlUmVmcyA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8c3RyaW5nPj4oKTtcbiAgcHJpdmF0ZSByZW1vdGVDbGVhbnVwSW5GbGlnaHQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBub3RlQWNjZXNzVGltZXN0YW1wcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG4gIHByaXZhdGUgc3luY0luZGV4ID0gbmV3IE1hcDxzdHJpbmcsIFN5bmNJbmRleEVudHJ5PigpO1xuICBwcml2YXRlIG1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgPSBuZXcgTWFwPHN0cmluZywgTWlzc2luZ0xhenlSZW1vdGVSZWNvcmQ+KCk7XG4gIHByaXZhdGUgcGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlcyA9IG5ldyBTZXQ8UHJvbWlzZTx2b2lkPj4oKTtcbiAgcHJpdmF0ZSBwcmlvcml0eU5vdGVTeW5jVGltZW91dHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICBwcml2YXRlIHByaW9yaXR5Tm90ZVN5bmNzSW5GbGlnaHQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBsYXN0VmF1bHRTeW5jQXQgPSAwO1xuICBwcml2YXRlIGxhc3RWYXVsdFN5bmNTdGF0dXMgPSBcIlwiO1xuICBwcml2YXRlIHN5bmNJblByb2dyZXNzID0gZmFsc2U7XG4gIHByaXZhdGUgYXV0b1N5bmNUaWNrSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICAvLyBJbWFnZSBwYXJzaW5nIGFuZCByZW5kZXJpbmcgbGl2ZSBpbiBhIGRlZGljYXRlZCBoZWxwZXIgc28gc3luYyBjaGFuZ2VzXG4gIC8vIGRvIG5vdCBhY2NpZGVudGFsbHkgYnJlYWsgZGlzcGxheSBiZWhhdmlvdXIgYWdhaW4uXG4gIHByaXZhdGUgaW1hZ2VTdXBwb3J0ITogU2VjdXJlV2ViZGF2SW1hZ2VTdXBwb3J0O1xuICAvLyBVcGxvYWQgcXVldWUgc3RhdGUgaXMgaXNvbGF0ZWQgc28gcmV0cmllcyBhbmQgcGxhY2Vob2xkZXIgcmVwbGFjZW1lbnQgZG9cbiAgLy8gbm90IGtlZXAgc3ByYXdsaW5nIGFjcm9zcyB0aGUgbWFpbiBwbHVnaW4gY2xhc3MuXG4gIHByaXZhdGUgdXBsb2FkUXVldWUhOiBTZWN1cmVXZWJkYXZVcGxvYWRRdWV1ZVN1cHBvcnQ7XG4gIC8vIFN5bmMgbWV0YWRhdGEgaGVscGVycyBhcmUgaXNvbGF0ZWQgc28gcmVjb25jaWxpYXRpb24gcnVsZXMgc3RheSBleHBsaWNpdC5cbiAgcHJpdmF0ZSBzeW5jU3VwcG9ydCE6IFNlY3VyZVdlYmRhdlN5bmNTdXBwb3J0O1xuXG4gIHByaXZhdGUgcmVhZG9ubHkgZGVsZXRpb25Gb2xkZXJTdWZmaXggPSBcIi5fX3NlY3VyZS13ZWJkYXYtZGVsZXRpb25zX18vXCI7XG4gIHByaXZhdGUgcmVhZG9ubHkgbWlzc2luZ0xhenlSZW1vdGVDb25maXJtYXRpb25zID0gMjtcblxuICBwcml2YXRlIGluaXRpYWxpemVTdXBwb3J0TW9kdWxlcygpIHtcbiAgICAvLyBLZWVwIHJ1bnRpbWUtb25seSBpbnRlZ3JhdGlvbiBoZXJlOiB0aGUgaW1hZ2UgbW9kdWxlIG93bnMgcGFyc2luZyBhbmRcbiAgICAvLyByZW5kZXJpbmcsIHdoaWxlIHRoZSBwbHVnaW4gc3RpbGwgb3ducyBXZWJEQVYgYWNjZXNzIGFuZCBsaWZlY3ljbGUuXG4gICAgdGhpcy5pbWFnZVN1cHBvcnQgPSBuZXcgU2VjdXJlV2ViZGF2SW1hZ2VTdXBwb3J0KHtcbiAgICAgIHQ6IHRoaXMudC5iaW5kKHRoaXMpLFxuICAgICAgZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmw6IHRoaXMuZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmwuYmluZCh0aGlzKSxcbiAgICB9KTtcbiAgICB0aGlzLnVwbG9hZFF1ZXVlID0gbmV3IFNlY3VyZVdlYmRhdlVwbG9hZFF1ZXVlU3VwcG9ydCh7XG4gICAgICBhcHA6IHRoaXMuYXBwLFxuICAgICAgdDogdGhpcy50LmJpbmQodGhpcyksXG4gICAgICBzZXR0aW5nczogKCkgPT4gdGhpcy5zZXR0aW5ncyxcbiAgICAgIGdldFF1ZXVlOiAoKSA9PiB0aGlzLnF1ZXVlLFxuICAgICAgc2V0UXVldWU6IChxdWV1ZSkgPT4ge1xuICAgICAgICB0aGlzLnF1ZXVlID0gcXVldWU7XG4gICAgICB9LFxuICAgICAgc2F2ZVBsdWdpblN0YXRlOiB0aGlzLnNhdmVQbHVnaW5TdGF0ZS5iaW5kKHRoaXMpLFxuICAgICAgc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jOiB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYy5iaW5kKHRoaXMpLFxuICAgICAgcmVxdWVzdFVybDogdGhpcy5yZXF1ZXN0VXJsLmJpbmQodGhpcyksXG4gICAgICBidWlsZFVwbG9hZFVybDogdGhpcy5idWlsZFVwbG9hZFVybC5iaW5kKHRoaXMpLFxuICAgICAgYnVpbGRBdXRoSGVhZGVyOiB0aGlzLmJ1aWxkQXV0aEhlYWRlci5iaW5kKHRoaXMpLFxuICAgICAgcHJlcGFyZVVwbG9hZFBheWxvYWQ6IHRoaXMucHJlcGFyZVVwbG9hZFBheWxvYWQuYmluZCh0aGlzKSxcbiAgICAgIGJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5OiB0aGlzLmJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5LmJpbmQodGhpcyksXG4gICAgICBidWlsZFJlbW90ZVBhdGg6IHRoaXMuYnVpbGRSZW1vdGVQYXRoLmJpbmQodGhpcyksXG4gICAgICBidWlsZFNlY3VyZUltYWdlTWFya3VwOiB0aGlzLmltYWdlU3VwcG9ydC5idWlsZFNlY3VyZUltYWdlTWFya3VwLmJpbmQodGhpcy5pbWFnZVN1cHBvcnQpLFxuICAgICAgZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWU6IHRoaXMuZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUuYmluZCh0aGlzKSxcbiAgICAgIGFycmF5QnVmZmVyVG9CYXNlNjQ6IHRoaXMuYXJyYXlCdWZmZXJUb0Jhc2U2NC5iaW5kKHRoaXMpLFxuICAgICAgYmFzZTY0VG9BcnJheUJ1ZmZlcjogdGhpcy5iYXNlNjRUb0FycmF5QnVmZmVyLmJpbmQodGhpcyksXG4gICAgICBlc2NhcGVIdG1sOiB0aGlzLmVzY2FwZUh0bWwuYmluZCh0aGlzKSxcbiAgICAgIGVzY2FwZVJlZ0V4cDogdGhpcy5lc2NhcGVSZWdFeHAuYmluZCh0aGlzKSxcbiAgICAgIGRlc2NyaWJlRXJyb3I6IHRoaXMuZGVzY3JpYmVFcnJvci5iaW5kKHRoaXMpLFxuICAgIH0pO1xuICAgIHRoaXMuc3luY1N1cHBvcnQgPSBuZXcgU2VjdXJlV2ViZGF2U3luY1N1cHBvcnQoe1xuICAgICAgYXBwOiB0aGlzLmFwcCxcbiAgICAgIGdldFZhdWx0U3luY1JlbW90ZUZvbGRlcjogKCkgPT4gdGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIsXG4gICAgICBkZWxldGlvbkZvbGRlclN1ZmZpeDogdGhpcy5kZWxldGlvbkZvbGRlclN1ZmZpeCxcbiAgICAgIGVuY29kZUJhc2U2NFVybDogKHZhbHVlKSA9PlxuICAgICAgICB0aGlzLmFycmF5QnVmZmVyVG9CYXNlNjQodGhpcy5lbmNvZGVVdGY4KHZhbHVlKSkucmVwbGFjZSgvXFwrL2csIFwiLVwiKS5yZXBsYWNlKC9cXC8vZywgXCJfXCIpLnJlcGxhY2UoLz0rJC9nLCBcIlwiKSxcbiAgICAgIGRlY29kZUJhc2U2NFVybDogKHZhbHVlKSA9PiB7XG4gICAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSB2YWx1ZS5yZXBsYWNlKC8tL2csIFwiK1wiKS5yZXBsYWNlKC9fL2csIFwiL1wiKTtcbiAgICAgICAgY29uc3QgcGFkZGVkID0gbm9ybWFsaXplZCArIFwiPVwiLnJlcGVhdCgoNCAtIChub3JtYWxpemVkLmxlbmd0aCAlIDQgfHwgNCkpICUgNCk7XG4gICAgICAgIHJldHVybiB0aGlzLmRlY29kZVV0ZjgodGhpcy5iYXNlNjRUb0FycmF5QnVmZmVyKHBhZGRlZCkpO1xuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgZW5zdXJlU3VwcG9ydE1vZHVsZXMoKSB7XG4gICAgaWYgKCF0aGlzLmltYWdlU3VwcG9ydCB8fCAhdGhpcy51cGxvYWRRdWV1ZSB8fCAhdGhpcy5zeW5jU3VwcG9ydCkge1xuICAgICAgdGhpcy5pbml0aWFsaXplU3VwcG9ydE1vZHVsZXMoKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgYXdhaXQgdGhpcy5sb2FkUGx1Z2luU3RhdGUoKTtcbiAgICB0aGlzLmluaXRpYWxpemVTdXBwb3J0TW9kdWxlcygpO1xuXG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBTZWN1cmVXZWJkYXZTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwidXBsb2FkLWN1cnJlbnQtbm90ZS1sb2NhbC1pbWFnZXNcIixcbiAgICAgIG5hbWU6IFwiVXBsb2FkIGxvY2FsIGltYWdlcyBpbiBjdXJyZW50IG5vdGUgdG8gV2ViREFWXCIsXG4gICAgICBjaGVja0NhbGxiYWNrOiAoY2hlY2tpbmcpID0+IHtcclxuICAgICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcclxuICAgICAgICBpZiAoIWZpbGUpIHtcclxuICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghY2hlY2tpbmcpIHtcclxuICAgICAgICAgIHZvaWQgdGhpcy51cGxvYWRJbWFnZXNJbk5vdGUoZmlsZSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJ0ZXN0LXdlYmRhdi1jb25uZWN0aW9uXCIsXG4gICAgICBuYW1lOiBcIlRlc3QgV2ViREFWIGNvbm5lY3Rpb25cIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5ydW5Db25uZWN0aW9uVGVzdCh0cnVlKTtcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwic3luYy1jb25maWd1cmVkLXZhdWx0LWNvbnRlbnQtdG8td2ViZGF2XCIsXG4gICAgICBuYW1lOiBcIlN5bmMgdmF1bHQgY29udGVudCB0byBXZWJEQVZcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5ydW5NYW51YWxTeW5jKCk7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmliYm9uID0gdGhpcy5hZGRSaWJib25JY29uKFwicmVmcmVzaC1jd1wiLCB0aGlzLnQoXCJcdTdBQ0JcdTUzNzNcdTU0MENcdTZCNjVcdTUyMzAgV2ViREFWXCIsIFwiU3luYyB0byBXZWJEQVYgbm93XCIpLCAoKSA9PiB7XG4gICAgICB2b2lkIHRoaXMucnVuTWFudWFsU3luYygpO1xuICAgIH0pO1xuICAgIHJpYmJvbi5hZGRDbGFzcyhcInNlY3VyZS13ZWJkYXYtc3luYy1yaWJib25cIik7XG5cclxuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93blBvc3RQcm9jZXNzb3IoKGVsLCBjdHgpID0+IHtcbiAgICAgIHZvaWQgdGhpcy5pbWFnZVN1cHBvcnQucHJvY2Vzc1NlY3VyZUltYWdlcyhlbCwgY3R4KTtcbiAgICB9KTtcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoU0VDVVJFX0NPREVfQkxPQ0ssIChzb3VyY2UsIGVsLCBjdHgpID0+IHtcbiAgICAgIHZvaWQgdGhpcy5pbWFnZVN1cHBvcnQucHJvY2Vzc1NlY3VyZUNvZGVCbG9jayhzb3VyY2UsIGVsLCBjdHgpO1xuICAgIH0pO1xuXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFwiZmlsZS1vcGVuXCIsIChmaWxlKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5oYW5kbGVGaWxlT3BlbihmaWxlKTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJlZGl0b3ItcGFzdGVcIiwgKGV2dCwgZWRpdG9yLCBpbmZvKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5oYW5kbGVFZGl0b3JQYXN0ZShldnQsIGVkaXRvciwgaW5mbyk7XG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFwiZWRpdG9yLWRyb3BcIiwgKGV2dCwgZWRpdG9yLCBpbmZvKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5oYW5kbGVFZGl0b3JEcm9wKGV2dCwgZWRpdG9yLCBpbmZvKTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBhd2FpdCB0aGlzLnJlYnVpbGRSZWZlcmVuY2VJbmRleCgpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcIm1vZGlmeVwiLCAoZmlsZSkgPT4gdGhpcy50cmFja1ZhdWx0TXV0YXRpb24oKCkgPT4gdGhpcy5oYW5kbGVWYXVsdE1vZGlmeShmaWxlKSkpKTtcbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oXCJkZWxldGVcIiwgKGZpbGUpID0+IHRoaXMudHJhY2tWYXVsdE11dGF0aW9uKCgpID0+IHRoaXMuaGFuZGxlVmF1bHREZWxldGUoZmlsZSkpKSk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAudmF1bHQub24oXCJyZW5hbWVcIiwgKGZpbGUsIG9sZFBhdGgpID0+IHRoaXMudHJhY2tWYXVsdE11dGF0aW9uKCgpID0+IHRoaXMuaGFuZGxlVmF1bHRSZW5hbWUoZmlsZSwgb2xkUGF0aCkpKSxcbiAgICApO1xuXG4gICAgdGhpcy5zZXR1cEF1dG9TeW5jKCk7XG5cbiAgICB2b2lkIHRoaXMucHJvY2Vzc1BlbmRpbmdUYXNrcygpO1xuXHJcbiAgICB0aGlzLnJlZ2lzdGVyKCgpID0+IHtcbiAgICAgIGZvciAoY29uc3QgYmxvYlVybCBvZiB0aGlzLmJsb2JVcmxzKSB7XG4gICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwoYmxvYlVybCk7XG4gICAgICB9XG4gICAgICB0aGlzLmJsb2JVcmxzLmNsZWFyKCk7XG4gICAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy52YWx1ZXMoKSkge1xuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgICB9XG4gICAgICB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy5jbGVhcigpO1xuICAgICAgdGhpcy51cGxvYWRRdWV1ZS5kaXNwb3NlKCk7XG4gICAgfSk7XG4gIH1cblxyXG4gIG9udW5sb2FkKCkge1xyXG4gICAgZm9yIChjb25zdCBibG9iVXJsIG9mIHRoaXMuYmxvYlVybHMpIHtcbiAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwoYmxvYlVybCk7XG4gICAgfVxuICAgIHRoaXMuYmxvYlVybHMuY2xlYXIoKTtcbiAgICB0aGlzLnVwbG9hZFF1ZXVlPy5kaXNwb3NlKCk7XG4gICAgZm9yIChjb25zdCB0aW1lb3V0SWQgb2YgdGhpcy5wcmlvcml0eU5vdGVTeW5jVGltZW91dHMudmFsdWVzKCkpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICB9XG4gICAgdGhpcy5wcmlvcml0eU5vdGVTeW5jVGltZW91dHMuY2xlYXIoKTtcbiAgfVxuXHJcbiAgYXN5bmMgbG9hZFBsdWdpblN0YXRlKCkge1xuICAgIGNvbnN0IGxvYWRlZCA9IGF3YWl0IHRoaXMubG9hZERhdGEoKTtcbiAgICBpZiAoIWxvYWRlZCB8fCB0eXBlb2YgbG9hZGVkICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICB0aGlzLnNldHRpbmdzID0geyAuLi5ERUZBVUxUX1NFVFRJTkdTIH07XG4gICAgICB0aGlzLnF1ZXVlID0gW107XG4gICAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzID0gbmV3IE1hcCgpO1xuICAgICAgdGhpcy5zeW5jSW5kZXggPSBuZXcgTWFwKCk7XG4gICAgICB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgPSBuZXcgTWFwKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY2FuZGlkYXRlID0gbG9hZGVkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIGlmIChcInNldHRpbmdzXCIgaW4gY2FuZGlkYXRlIHx8IFwicXVldWVcIiBpbiBjYW5kaWRhdGUpIHtcbiAgICAgIHRoaXMuc2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MsIC4uLigoY2FuZGlkYXRlLnNldHRpbmdzIGFzIFBhcnRpYWw8U2VjdXJlV2ViZGF2U2V0dGluZ3M+KSA/PyB7fSkgfTtcbiAgICAgIHRoaXMucXVldWUgPSBBcnJheS5pc0FycmF5KGNhbmRpZGF0ZS5xdWV1ZSkgPyAoY2FuZGlkYXRlLnF1ZXVlIGFzIFVwbG9hZFRhc2tbXSkgOiBbXTtcbiAgICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMgPSBuZXcgTWFwKFxuICAgICAgICBPYmplY3QuZW50cmllcygoY2FuZGlkYXRlLm5vdGVBY2Nlc3NUaW1lc3RhbXBzIGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfCB1bmRlZmluZWQpID8/IHt9KSxcbiAgICAgICk7XG4gICAgICB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgPSBuZXcgTWFwKFxuICAgICAgICBPYmplY3QuZW50cmllcygoY2FuZGlkYXRlLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgYXMgUmVjb3JkPHN0cmluZywgTWlzc2luZ0xhenlSZW1vdGVSZWNvcmQ+IHwgdW5kZWZpbmVkKSA/PyB7fSlcbiAgICAgICAgICAuZmlsdGVyKChbLCB2YWx1ZV0pID0+IHtcbiAgICAgICAgICAgIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlY29yZCA9IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdHlwZW9mIHJlY29yZC5maXJzdERldGVjdGVkQXQgPT09IFwibnVtYmVyXCIgJiZcbiAgICAgICAgICAgICAgdHlwZW9mIHJlY29yZC5sYXN0RGV0ZWN0ZWRBdCA9PT0gXCJudW1iZXJcIiAmJlxuICAgICAgICAgICAgICB0eXBlb2YgcmVjb3JkLm1pc3NDb3VudCA9PT0gXCJudW1iZXJcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoKFtwYXRoLCB2YWx1ZV0pID0+IFtwYXRoLCB2YWx1ZSBhcyBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZF0pLFxuICAgICAgKTtcbiAgICAgIHRoaXMuc3luY0luZGV4ID0gbmV3IE1hcCgpO1xuICAgICAgZm9yIChjb25zdCBbcGF0aCwgcmF3RW50cnldIG9mIE9iamVjdC5lbnRyaWVzKChjYW5kaWRhdGUuc3luY0luZGV4IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKSA/PyB7fSkpIHtcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IHRoaXMubm9ybWFsaXplU3luY0luZGV4RW50cnkocGF0aCwgcmF3RW50cnkpO1xuICAgICAgICBpZiAobm9ybWFsaXplZCkge1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChwYXRoLCBub3JtYWxpemVkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPVxuICAgICAgICB0eXBlb2YgY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNBdCA9PT0gXCJudW1iZXJcIiA/IGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jQXQgOiAwO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID1cbiAgICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jU3RhdHVzID09PSBcInN0cmluZ1wiID8gY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNTdGF0dXMgOiBcIlwiO1xuICAgICAgdGhpcy5ub3JtYWxpemVFZmZlY3RpdmVTZXR0aW5ncygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuc2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MsIC4uLihjYW5kaWRhdGUgYXMgUGFydGlhbDxTZWN1cmVXZWJkYXZTZXR0aW5ncz4pIH07XG4gICAgdGhpcy5xdWV1ZSA9IFtdO1xuICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5zeW5jSW5kZXggPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gMDtcbiAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSBcIlwiO1xuICAgIHRoaXMubm9ybWFsaXplRWZmZWN0aXZlU2V0dGluZ3MoKTtcbiAgfVxuXG4gIHByaXZhdGUgbm9ybWFsaXplRWZmZWN0aXZlU2V0dGluZ3MoKSB7XG4gICAgLy8gS2VlcCB0aGUgcHVibGljIHNldHRpbmdzIHN1cmZhY2UgaW50ZW50aW9uYWxseSBzbWFsbCBhbmQgZGV0ZXJtaW5pc3RpYy5cbiAgICB0aGlzLnNldHRpbmdzLmRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQgPSB0cnVlO1xuICAgIHRoaXMuc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXMgPSBNYXRoLm1heCgwLCBNYXRoLmZsb29yKHRoaXMuc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXMgfHwgMCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cEF1dG9TeW5jKCkge1xuICAgIGNvbnN0IG1pbnV0ZXMgPSB0aGlzLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzO1xuICAgIGlmIChtaW51dGVzIDw9IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbnRlcnZhbE1zID0gbWludXRlcyAqIDYwICogMTAwMDtcbiAgICB0aGlzLnJlZ2lzdGVySW50ZXJ2YWwoXG4gICAgICB3aW5kb3cuc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICB2b2lkIHRoaXMucnVuQXV0b1N5bmNUaWNrKCk7XG4gICAgICB9LCBpbnRlcnZhbE1zKSxcbiAgICApO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBydW5BdXRvU3luY1RpY2soKSB7XG4gICAgaWYgKHRoaXMuYXV0b1N5bmNUaWNrSW5Qcm9ncmVzcykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuYXV0b1N5bmNUaWNrSW5Qcm9ncmVzcyA9IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQoZmFsc2UpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLmF1dG9TeW5jVGlja0luUHJvZ3Jlc3MgPSBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBzYXZlUGx1Z2luU3RhdGUoKSB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh7XG4gICAgICBzZXR0aW5nczogdGhpcy5zZXR0aW5ncyxcbiAgICAgIHF1ZXVlOiB0aGlzLnF1ZXVlLFxuICAgICAgbm90ZUFjY2Vzc1RpbWVzdGFtcHM6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzLmVudHJpZXMoKSksXG4gICAgICBtaXNzaW5nTGF6eVJlbW90ZU5vdGVzOiBPYmplY3QuZnJvbUVudHJpZXModGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzLmVudHJpZXMoKSksXG4gICAgICBzeW5jSW5kZXg6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLnN5bmNJbmRleC5lbnRyaWVzKCkpLFxuICAgICAgbGFzdFZhdWx0U3luY0F0OiB0aGlzLmxhc3RWYXVsdFN5bmNBdCxcbiAgICAgIGxhc3RWYXVsdFN5bmNTdGF0dXM6IHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyxcbiAgICB9KTtcbiAgfVxuXHJcbiAgYXN5bmMgc2F2ZVNldHRpbmdzKCkge1xuICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZVN5bmNJbmRleEVudHJ5KHZhdWx0UGF0aDogc3RyaW5nLCByYXdFbnRyeTogdW5rbm93bik6IFN5bmNJbmRleEVudHJ5IHwgbnVsbCB7XG4gICAgaWYgKCFyYXdFbnRyeSB8fCB0eXBlb2YgcmF3RW50cnkgIT09IFwib2JqZWN0XCIpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IGNhbmRpZGF0ZSA9IHJhd0VudHJ5IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPVxuICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5yZW1vdGVQYXRoID09PSBcInN0cmluZ1wiICYmIGNhbmRpZGF0ZS5yZW1vdGVQYXRoLmxlbmd0aCA+IDBcbiAgICAgICAgPyBjYW5kaWRhdGUucmVtb3RlUGF0aFxuICAgICAgICA6IHRoaXMuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKHZhdWx0UGF0aCk7XG4gICAgY29uc3QgbG9jYWxTaWduYXR1cmUgPVxuICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5sb2NhbFNpZ25hdHVyZSA9PT0gXCJzdHJpbmdcIlxuICAgICAgICA/IGNhbmRpZGF0ZS5sb2NhbFNpZ25hdHVyZVxuICAgICAgICA6IHR5cGVvZiBjYW5kaWRhdGUuc2lnbmF0dXJlID09PSBcInN0cmluZ1wiXG4gICAgICAgICAgPyBjYW5kaWRhdGUuc2lnbmF0dXJlXG4gICAgICAgICAgOiBcIlwiO1xuICAgIGNvbnN0IHJlbW90ZVNpZ25hdHVyZSA9XG4gICAgICB0eXBlb2YgY2FuZGlkYXRlLnJlbW90ZVNpZ25hdHVyZSA9PT0gXCJzdHJpbmdcIlxuICAgICAgICA/IGNhbmRpZGF0ZS5yZW1vdGVTaWduYXR1cmVcbiAgICAgICAgOiB0eXBlb2YgY2FuZGlkYXRlLnNpZ25hdHVyZSA9PT0gXCJzdHJpbmdcIlxuICAgICAgICAgID8gY2FuZGlkYXRlLnNpZ25hdHVyZVxuICAgICAgICAgIDogXCJcIjtcblxuICAgIHJldHVybiB7XG4gICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgIHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgIHJlbW90ZVBhdGgsXG4gICAgfTtcbiAgfVxuXHJcbiAgdCh6aDogc3RyaW5nLCBlbjogc3RyaW5nKSB7XHJcbiAgICByZXR1cm4gdGhpcy5nZXRMYW5ndWFnZSgpID09PSBcInpoXCIgPyB6aCA6IGVuO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBnZXRMYW5ndWFnZSgpIHtcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5sYW5ndWFnZSA9PT0gXCJhdXRvXCIpIHtcbiAgICAgIGNvbnN0IGxvY2FsZSA9IHR5cGVvZiBuYXZpZ2F0b3IgIT09IFwidW5kZWZpbmVkXCIgPyBuYXZpZ2F0b3IubGFuZ3VhZ2UudG9Mb3dlckNhc2UoKSA6IFwiZW5cIjtcbiAgICAgIHJldHVybiBsb2NhbGUuc3RhcnRzV2l0aChcInpoXCIpID8gXCJ6aFwiIDogXCJlblwiO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNldHRpbmdzLmxhbmd1YWdlO1xuICB9XG5cbiAgZm9ybWF0TGFzdFN5bmNMYWJlbCgpIHtcbiAgICBpZiAoIXRoaXMubGFzdFZhdWx0U3luY0F0KSB7XG4gICAgICByZXR1cm4gdGhpcy50KFwiXHU0RTBBXHU2QjIxXHU1NDBDXHU2QjY1XHVGRjFBXHU1QzFBXHU2NzJBXHU2MjY3XHU4ODRDXCIsIFwiTGFzdCBzeW5jOiBub3QgcnVuIHlldFwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy50KFxuICAgICAgYFx1NEUwQVx1NkIyMVx1NTQwQ1x1NkI2NVx1RkYxQSR7bmV3IERhdGUodGhpcy5sYXN0VmF1bHRTeW5jQXQpLnRvTG9jYWxlU3RyaW5nKCl9YCxcbiAgICAgIGBMYXN0IHN5bmM6ICR7bmV3IERhdGUodGhpcy5sYXN0VmF1bHRTeW5jQXQpLnRvTG9jYWxlU3RyaW5nKCl9YCxcbiAgICApO1xuICB9XG5cbiAgZm9ybWF0U3luY1N0YXR1c0xhYmVsKCkge1xuICAgIHJldHVybiB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXNcbiAgICAgID8gdGhpcy50KGBcdTY3MDBcdThGRDFcdTcyQjZcdTYwMDFcdUZGMUEke3RoaXMubGFzdFZhdWx0U3luY1N0YXR1c31gLCBgUmVjZW50IHN0YXR1czogJHt0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXN9YClcbiAgICAgIDogdGhpcy50KFwiXHU2NzAwXHU4RkQxXHU3MkI2XHU2MDAxXHVGRjFBXHU2NjgyXHU2NUUwXCIsIFwiUmVjZW50IHN0YXR1czogbm9uZVwiKTtcbiAgfVxuXG4gIGFzeW5jIHJ1bk1hbnVhbFN5bmMoKSB7XG4gICAgYXdhaXQgdGhpcy5zeW5jQ29uZmlndXJlZFZhdWx0Q29udGVudCh0cnVlKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVidWlsZFJlZmVyZW5jZUluZGV4KCkge1xuICAgIGNvbnN0IG5leHQgPSBuZXcgTWFwPHN0cmluZywgU2V0PHN0cmluZz4+KCk7XG4gICAgZm9yIChjb25zdCBmaWxlIG9mIHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKSkge1xuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICBuZXh0LnNldChmaWxlLnBhdGgsIHRoaXMuZXh0cmFjdFJlbW90ZVBhdGhzRnJvbVRleHQoY29udGVudCkpO1xuICAgIH1cbiAgICB0aGlzLm5vdGVSZW1vdGVSZWZzID0gbmV4dDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlVmF1bHRNb2RpZnkoZmlsZTogVEFic3RyYWN0RmlsZSkge1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkgfHwgZmlsZS5leHRlbnNpb24gIT09IFwibWRcIikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IG5leHRSZWZzID0gdGhpcy5leHRyYWN0UmVtb3RlUGF0aHNGcm9tVGV4dChjb250ZW50KTtcbiAgICBjb25zdCBwcmV2aW91c1JlZnMgPSB0aGlzLm5vdGVSZW1vdGVSZWZzLmdldChmaWxlLnBhdGgpID8/IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIHRoaXMubm90ZVJlbW90ZVJlZnMuc2V0KGZpbGUucGF0aCwgbmV4dFJlZnMpO1xuXG4gICAgY29uc3QgYWRkZWQgPSBbLi4ubmV4dFJlZnNdLmZpbHRlcigodmFsdWUpID0+ICFwcmV2aW91c1JlZnMuaGFzKHZhbHVlKSk7XG4gICAgY29uc3QgcmVtb3ZlZCA9IFsuLi5wcmV2aW91c1JlZnNdLmZpbHRlcigodmFsdWUpID0+ICFuZXh0UmVmcy5oYXModmFsdWUpKTtcbiAgICBpZiAoYWRkZWQubGVuZ3RoID4gMCkge1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMoZmlsZS5wYXRoLCBcImltYWdlLWFkZFwiKTtcbiAgICB9XG4gICAgaWYgKHJlbW92ZWQubGVuZ3RoID4gMCkge1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMoZmlsZS5wYXRoLCBcImltYWdlLXJlbW92ZVwiKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZVZhdWx0RGVsZXRlKGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnNob3VsZFNraXBDb250ZW50U3luY1BhdGgoZmlsZS5wYXRoKSkge1xuICAgICAgYXdhaXQgdGhpcy53cml0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCwgdGhpcy5zeW5jSW5kZXguZ2V0KGZpbGUucGF0aCk/LnJlbW90ZVNpZ25hdHVyZSk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgfVxuXG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIGNvbnN0IHByZXZpb3VzUmVmcyA9IHRoaXMubm90ZVJlbW90ZVJlZnMuZ2V0KGZpbGUucGF0aCkgPz8gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgICB0aGlzLm5vdGVSZW1vdGVSZWZzLmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgdm9pZCBwcmV2aW91c1JlZnM7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVWYXVsdFJlbmFtZShmaWxlOiBUQWJzdHJhY3RGaWxlLCBvbGRQYXRoOiBzdHJpbmcpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnNob3VsZFNraXBDb250ZW50U3luY1BhdGgob2xkUGF0aCkpIHtcbiAgICAgIGF3YWl0IHRoaXMud3JpdGVEZWxldGlvblRvbWJzdG9uZShvbGRQYXRoLCB0aGlzLnN5bmNJbmRleC5nZXQob2xkUGF0aCk/LnJlbW90ZVNpZ25hdHVyZSk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUob2xkUGF0aCk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgIH1cblxuICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICBjb25zdCByZWZzID0gdGhpcy5ub3RlUmVtb3RlUmVmcy5nZXQob2xkUGF0aCk7XG4gICAgICBpZiAocmVmcykge1xuICAgICAgICB0aGlzLm5vdGVSZW1vdGVSZWZzLmRlbGV0ZShvbGRQYXRoKTtcbiAgICAgICAgdGhpcy5ub3RlUmVtb3RlUmVmcy5zZXQoZmlsZS5wYXRoLCByZWZzKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCF0aGlzLnNob3VsZFNraXBDb250ZW50U3luY1BhdGgoZmlsZS5wYXRoKSkge1xuICAgICAgICB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyhmaWxlLnBhdGgsIFwiaW1hZ2UtYWRkXCIpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdFJlbW90ZVBhdGhzRnJvbVRleHQoY29udGVudDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVmcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IHNwYW5SZWdleCA9IC9kYXRhLXNlY3VyZS13ZWJkYXY9XCIoW15cIl0rKVwiL2c7XG4gICAgY29uc3QgcHJvdG9jb2xSZWdleCA9IC93ZWJkYXYtc2VjdXJlOlxcL1xcLyhbXlxccylcIl0rKS9nO1xuICAgIGNvbnN0IGNvZGVCbG9ja1JlZ2V4ID0gL2BgYHNlY3VyZS13ZWJkYXZcXHMrKFtcXHNcXFNdKj8pYGBgL2c7XG4gICAgbGV0IG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXG4gICAgd2hpbGUgKChtYXRjaCA9IHNwYW5SZWdleC5leGVjKGNvbnRlbnQpKSAhPT0gbnVsbCkge1xuICAgICAgcmVmcy5hZGQodGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0pKTtcbiAgICB9XG5cbiAgICB3aGlsZSAoKG1hdGNoID0gcHJvdG9jb2xSZWdleC5leGVjKGNvbnRlbnQpKSAhPT0gbnVsbCkge1xuICAgICAgcmVmcy5hZGQodGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0pKTtcbiAgICB9XG5cbiAgICB3aGlsZSAoKG1hdGNoID0gY29kZUJsb2NrUmVnZXguZXhlYyhjb250ZW50KSkgIT09IG51bGwpIHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IHRoaXMuaW1hZ2VTdXBwb3J0LnBhcnNlU2VjdXJlSW1hZ2VCbG9jayhtYXRjaFsxXSk7XG4gICAgICBpZiAocGFyc2VkPy5wYXRoKSB7XG4gICAgICAgIHJlZnMuYWRkKHBhcnNlZC5wYXRoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVmcztcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZGVsZXRlUmVtb3RlSWZVbnJlZmVyZW5jZWQocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgdm9pZCByZW1vdGVQYXRoO1xuICAgIC8vIERpc2FibGVkIGludGVudGlvbmFsbHk6IGxvY2FsLW9ubHkgcmVmZXJlbmNlIGNoZWNrcyBhcmUgbm90IHNhZmUgZW5vdWdoXG4gICAgLy8gZm9yIGNyb3NzLWRldmljZSBkZWxldGlvbiBvZiBzaGFyZWQgcmVtb3RlIGltYWdlcy5cbiAgfVxuXG4gIHByaXZhdGUgc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jKG5vdGVQYXRoOiBzdHJpbmcsIHJlYXNvbjogXCJpbWFnZS1hZGRcIiB8IFwiaW1hZ2UtcmVtb3ZlXCIpIHtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLmdldChub3RlUGF0aCk7XG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KGV4aXN0aW5nKTtcbiAgICB9XG5cbiAgICBjb25zdCBkZWxheU1zID0gcmVhc29uID09PSBcImltYWdlLWFkZFwiID8gMTIwMCA6IDYwMDtcbiAgICBjb25zdCB0aW1lb3V0SWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy5kZWxldGUobm90ZVBhdGgpO1xuICAgICAgdm9pZCB0aGlzLmZsdXNoUHJpb3JpdHlOb3RlU3luYyhub3RlUGF0aCwgcmVhc29uKTtcbiAgICB9LCBkZWxheU1zKTtcbiAgICB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy5zZXQobm90ZVBhdGgsIHRpbWVvdXRJZCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGZsdXNoUHJpb3JpdHlOb3RlU3luYyhub3RlUGF0aDogc3RyaW5nLCByZWFzb246IFwiaW1hZ2UtYWRkXCIgfCBcImltYWdlLXJlbW92ZVwiKSB7XG4gICAgaWYgKHRoaXMucHJpb3JpdHlOb3RlU3luY3NJbkZsaWdodC5oYXMobm90ZVBhdGgpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgdGhpcy5oYXNQZW5kaW5nSW1hZ2VXb3JrRm9yTm90ZShub3RlUGF0aCkgfHxcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlcy5zaXplID4gMCB8fFxuICAgICAgdGhpcy5zeW5jSW5Qcm9ncmVzcyB8fFxuICAgICAgdGhpcy5hdXRvU3luY1RpY2tJblByb2dyZXNzXG4gICAgKSB7XG4gICAgICB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyhub3RlUGF0aCwgcmVhc29uKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBmaWxlID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgobm90ZVBhdGgpO1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkgfHwgZmlsZS5leHRlbnNpb24gIT09IFwibWRcIiB8fCB0aGlzLnNob3VsZFNraXBDb250ZW50U3luY1BhdGgoZmlsZS5wYXRoKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY3NJbkZsaWdodC5hZGQobm90ZVBhdGgpO1xuICAgIHRyeSB7XG4gICAgICB0aGlzLmVuc3VyZUNvbmZpZ3VyZWQoKTtcblxuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMucmVhZE1hcmtkb3duQ29udGVudFByZWZlckVkaXRvcihmaWxlKTtcbiAgICAgIGlmICh0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgIGNvbnN0IHVwbG9hZGVkUmVtb3RlID0gYXdhaXQgdGhpcy51cGxvYWRDb250ZW50RmlsZVRvUmVtb3RlKGZpbGUsIHJlbW90ZVBhdGgsIGNvbnRlbnQpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICBsb2NhbFNpZ25hdHVyZTogYXdhaXQgdGhpcy5idWlsZEN1cnJlbnRMb2NhbFNpZ25hdHVyZShmaWxlLCBjb250ZW50KSxcbiAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiB1cGxvYWRlZFJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gRGF0ZS5ub3coKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9IHRoaXMudChcbiAgICAgICAgcmVhc29uID09PSBcImltYWdlLWFkZFwiXG4gICAgICAgICAgPyBgXHU1REYyXHU0RjE4XHU1MTQ4XHU1NDBDXHU2QjY1XHU1NkZFXHU3MjQ3XHU2NUIwXHU1ODlFXHU1NDBFXHU3Njg0XHU3QjE0XHU4QkIwXHVGRjFBJHtmaWxlLmJhc2VuYW1lfWBcbiAgICAgICAgICA6IGBcdTVERjJcdTRGMThcdTUxNDhcdTU0MENcdTZCNjVcdTU2RkVcdTcyNDdcdTUyMjBcdTk2NjRcdTU0MEVcdTc2ODRcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICAgcmVhc29uID09PSBcImltYWdlLWFkZFwiXG4gICAgICAgICAgPyBgUHJpb3JpdGl6ZWQgbm90ZSBzeW5jIGZpbmlzaGVkIGFmdGVyIGltYWdlIGFkZDogJHtmaWxlLmJhc2VuYW1lfWBcbiAgICAgICAgICA6IGBQcmlvcml0aXplZCBub3RlIHN5bmMgZmluaXNoZWQgYWZ0ZXIgaW1hZ2UgcmVtb3ZhbDogJHtmaWxlLmJhc2VuYW1lfWAsXG4gICAgICApO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIlByaW9yaXR5IG5vdGUgc3luYyBmYWlsZWRcIiwgZXJyb3IpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy5kZXNjcmliZUVycm9yKFxuICAgICAgICB0aGlzLnQoXG4gICAgICAgICAgcmVhc29uID09PSBcImltYWdlLWFkZFwiID8gXCJcdTU2RkVcdTcyNDdcdTY1QjBcdTU4OUVcdTU0MEVcdTc2ODRcdTdCMTRcdThCQjBcdTRGMThcdTUxNDhcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIiA6IFwiXHU1NkZFXHU3MjQ3XHU1MjIwXHU5NjY0XHU1NDBFXHU3Njg0XHU3QjE0XHU4QkIwXHU0RjE4XHU1MTQ4XHU1NDBDXHU2QjY1XHU1OTMxXHU4RDI1XCIsXG4gICAgICAgICAgcmVhc29uID09PSBcImltYWdlLWFkZFwiID8gXCJQcmlvcml0eSBub3RlIHN5bmMgYWZ0ZXIgaW1hZ2UgYWRkIGZhaWxlZFwiIDogXCJQcmlvcml0eSBub3RlIHN5bmMgYWZ0ZXIgaW1hZ2UgcmVtb3ZhbCBmYWlsZWRcIixcbiAgICAgICAgKSxcbiAgICAgICAgZXJyb3IsXG4gICAgICApO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIHRoaXMuc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jKG5vdGVQYXRoLCByZWFzb24pO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLnByaW9yaXR5Tm90ZVN5bmNzSW5GbGlnaHQuZGVsZXRlKG5vdGVQYXRoKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGhhc1BlbmRpbmdJbWFnZVdvcmtGb3JOb3RlKG5vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICB0aGlzLmVuc3VyZVN1cHBvcnRNb2R1bGVzKCk7XG4gICAgcmV0dXJuIHRoaXMudXBsb2FkUXVldWUuaGFzUGVuZGluZ1dvcmtGb3JOb3RlKG5vdGVQYXRoKTtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBhc3luYyBidWlsZFVwbG9hZFJlcGxhY2VtZW50cyhjb250ZW50OiBzdHJpbmcsIG5vdGVGaWxlOiBURmlsZSwgdXBsb2FkQ2FjaGU/OiBNYXA8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgY29uc3Qgc2VlbiA9IG5ldyBNYXA8c3RyaW5nLCBVcGxvYWRSZXdyaXRlPigpO1xuICAgIGNvbnN0IHdpa2lNYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtcXFsoW15cXF1dKylcXF1cXF0vZyldO1xuICAgIGNvbnN0IG1hcmtkb3duTWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKC8hXFxbW15cXF1dKl1cXCgoW14pXSspXFwpL2cpXTtcbiAgICBjb25zdCBodG1sSW1hZ2VNYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLzxpbWdcXGJbXj5dKnNyYz1bXCInXShbXlwiJ10rKVtcIiddW14+XSo+L2dpKV07XG5cclxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2Ygd2lraU1hdGNoZXMpIHtcclxuICAgICAgY29uc3QgcmF3TGluayA9IG1hdGNoWzFdLnNwbGl0KFwifFwiKVswXS50cmltKCk7XHJcbiAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGVGaWxlLnBhdGgpO1xyXG4gICAgICBpZiAoIWZpbGUgfHwgIXRoaXMuaXNJbWFnZUZpbGUoZmlsZSkpIHtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxuXG4gICAgICBpZiAoIXNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFZhdWx0RmlsZShmaWxlLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgICAgb3JpZ2luYWw6IG1hdGNoWzBdLFxuICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGZpbGUuYmFzZW5hbWUpLFxuICAgICAgICAgIHNvdXJjZUZpbGU6IGZpbGUsXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXJrZG93bk1hdGNoZXMpIHtcbiAgICAgIGNvbnN0IHJhd0xpbmsgPSBkZWNvZGVVUklDb21wb25lbnQobWF0Y2hbMV0udHJpbSgpLnJlcGxhY2UoL148fD4kL2csIFwiXCIpKTtcbiAgICAgIGlmICgvXih3ZWJkYXYtc2VjdXJlOnxkYXRhOikvaS50ZXN0KHJhd0xpbmspKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5pc0h0dHBVcmwocmF3TGluaykpIHtcbiAgICAgICAgaWYgKCFzZWVuLmhhcyhtYXRjaFswXSkpIHtcbiAgICAgICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFJlbW90ZUltYWdlVXJsKHJhd0xpbmssIHVwbG9hZENhY2hlKTtcbiAgICAgICAgICBjb25zdCBhbHRUZXh0ID0gdGhpcy5leHRyYWN0TWFya2Rvd25BbHRUZXh0KG1hdGNoWzBdKSB8fCB0aGlzLmdldERpc3BsYXlOYW1lRnJvbVVybChyYXdMaW5rKTtcbiAgICAgICAgICBzZWVuLnNldChtYXRjaFswXSwge1xuICAgICAgICAgICAgb3JpZ2luYWw6IG1hdGNoWzBdLFxuICAgICAgICAgICAgcmV3cml0dGVuOiB0aGlzLmltYWdlU3VwcG9ydC5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgYWx0VGV4dCksXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGVGaWxlLnBhdGgpO1xuICAgICAgaWYgKCFmaWxlIHx8ICF0aGlzLmlzSW1hZ2VGaWxlKGZpbGUpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFZhdWx0RmlsZShmaWxlLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgICAgb3JpZ2luYWw6IG1hdGNoWzBdLFxuICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGZpbGUuYmFzZW5hbWUpLFxuICAgICAgICAgIHNvdXJjZUZpbGU6IGZpbGUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgaHRtbEltYWdlTWF0Y2hlcykge1xuICAgICAgY29uc3QgcmF3TGluayA9IHRoaXMudW5lc2NhcGVIdG1sKG1hdGNoWzFdLnRyaW0oKSk7XG4gICAgICBpZiAoIXRoaXMuaXNIdHRwVXJsKHJhd0xpbmspIHx8IHNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRSZW1vdGVJbWFnZVVybChyYXdMaW5rLCB1cGxvYWRDYWNoZSk7XG4gICAgICBjb25zdCBhbHRUZXh0ID0gdGhpcy5leHRyYWN0SHRtbEltYWdlQWx0VGV4dChtYXRjaFswXSkgfHwgdGhpcy5nZXREaXNwbGF5TmFtZUZyb21VcmwocmF3TGluayk7XG4gICAgICBzZWVuLnNldChtYXRjaFswXSwge1xuICAgICAgICBvcmlnaW5hbDogbWF0Y2hbMF0sXG4gICAgICAgIHJld3JpdHRlbjogdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGFsdFRleHQpLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIFsuLi5zZWVuLnZhbHVlcygpXTtcbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdE1hcmtkb3duQWx0VGV4dChtYXJrZG93bkltYWdlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtYXRjaCA9IG1hcmtkb3duSW1hZ2UubWF0Y2goL14hXFxbKFteXFxdXSopXFxdLyk7XG4gICAgcmV0dXJuIG1hdGNoPy5bMV0/LnRyaW0oKSA/PyBcIlwiO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRyYWN0SHRtbEltYWdlQWx0VGV4dChodG1sSW1hZ2U6IHN0cmluZykge1xuICAgIGNvbnN0IG1hdGNoID0gaHRtbEltYWdlLm1hdGNoKC9cXGJhbHQ9W1wiJ10oW15cIiddKilbXCInXS9pKTtcbiAgICByZXR1cm4gbWF0Y2ggPyB0aGlzLnVuZXNjYXBlSHRtbChtYXRjaFsxXS50cmltKCkpIDogXCJcIjtcbiAgfVxuXG4gIHByaXZhdGUgaXNIdHRwVXJsKHZhbHVlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gL15odHRwcz86XFwvXFwvL2kudGVzdCh2YWx1ZSk7XG4gIH1cblxuICBwcml2YXRlIGdldERpc3BsYXlOYW1lRnJvbVVybChyYXdVcmw6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJhd1VybCk7XG4gICAgICBjb25zdCBmaWxlTmFtZSA9IHRoaXMuc2FuaXRpemVGaWxlTmFtZSh1cmwucGF0aG5hbWUuc3BsaXQoXCIvXCIpLnBvcCgpIHx8IFwiXCIpO1xuICAgICAgaWYgKGZpbGVOYW1lKSB7XG4gICAgICAgIHJldHVybiBmaWxlTmFtZS5yZXBsYWNlKC9cXC5bXi5dKyQvLCBcIlwiKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIEZhbGwgdGhyb3VnaCB0byB0aGUgZ2VuZXJpYyBsYWJlbCBiZWxvdy5cbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy50KFwiXHU3RjUxXHU5ODc1XHU1NkZFXHU3MjQ3XCIsIFwiV2ViIGltYWdlXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSByZXNvbHZlTGlua2VkRmlsZShsaW5rOiBzdHJpbmcsIHNvdXJjZVBhdGg6IHN0cmluZyk6IFRGaWxlIHwgbnVsbCB7XG4gICAgY29uc3QgY2xlYW5lZCA9IGxpbmsucmVwbGFjZSgvIy4qLywgXCJcIikudHJpbSgpO1xuICAgIGNvbnN0IHRhcmdldCA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0Rmlyc3RMaW5rcGF0aERlc3QoY2xlYW5lZCwgc291cmNlUGF0aCk7XG4gICAgcmV0dXJuIHRhcmdldCBpbnN0YW5jZW9mIFRGaWxlID8gdGFyZ2V0IDogbnVsbDtcbiAgfVxyXG5cclxuICBwcml2YXRlIGlzSW1hZ2VGaWxlKGZpbGU6IFRGaWxlKSB7XG4gICAgcmV0dXJuIC9eKHBuZ3xqcGU/Z3xnaWZ8d2VicHxibXB8c3ZnKSQvaS50ZXN0KGZpbGUuZXh0ZW5zaW9uKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkVmF1bHRGaWxlKGZpbGU6IFRGaWxlLCB1cGxvYWRDYWNoZT86IE1hcDxzdHJpbmcsIHN0cmluZz4pIHtcbiAgICBpZiAodXBsb2FkQ2FjaGU/LmhhcyhmaWxlLnBhdGgpKSB7XG4gICAgICByZXR1cm4gdXBsb2FkQ2FjaGUuZ2V0KGZpbGUucGF0aCkhO1xuICAgIH1cblxuICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xuICAgIGNvbnN0IGJpbmFyeSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWRCaW5hcnkoZmlsZSk7XG4gICAgY29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLnByZXBhcmVVcGxvYWRQYXlsb2FkKGJpbmFyeSwgdGhpcy5nZXRNaW1lVHlwZShmaWxlLmV4dGVuc2lvbiksIGZpbGUubmFtZSk7XG4gICAgY29uc3QgcmVtb3RlTmFtZSA9IGF3YWl0IHRoaXMuYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnkocHJlcGFyZWQuZmlsZU5hbWUsIHByZXBhcmVkLmJpbmFyeSk7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRSZW1vdGVQYXRoKHJlbW90ZU5hbWUpO1xuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KHJlbW90ZVBhdGgsIHByZXBhcmVkLmJpbmFyeSwgcHJlcGFyZWQubWltZVR5cGUpO1xuICAgIGNvbnN0IHJlbW90ZVVybCA9IGAke1NFQ1VSRV9QUk9UT0NPTH0vLyR7cmVtb3RlUGF0aH1gO1xuICAgIHVwbG9hZENhY2hlPy5zZXQoZmlsZS5wYXRoLCByZW1vdGVVcmwpO1xuICAgIHJldHVybiByZW1vdGVVcmw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwbG9hZFJlbW90ZUltYWdlVXJsKGltYWdlVXJsOiBzdHJpbmcsIHVwbG9hZENhY2hlPzogTWFwPHN0cmluZywgc3RyaW5nPikge1xuICAgIGNvbnN0IGNhY2hlS2V5ID0gYHJlbW90ZToke2ltYWdlVXJsfWA7XG4gICAgaWYgKHVwbG9hZENhY2hlPy5oYXMoY2FjaGVLZXkpKSB7XG4gICAgICByZXR1cm4gdXBsb2FkQ2FjaGUuZ2V0KGNhY2hlS2V5KSE7XG4gICAgfVxuXG4gICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiBpbWFnZVVybCxcbiAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgIGZvbGxvd1JlZGlyZWN0czogdHJ1ZSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBSZW1vdGUgaW1hZ2UgZG93bmxvYWQgZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnRlbnRUeXBlID0gcmVzcG9uc2UuaGVhZGVyc1tcImNvbnRlbnQtdHlwZVwiXSA/PyBcIlwiO1xuICAgIGlmICghdGhpcy5pc0ltYWdlQ29udGVudFR5cGUoY29udGVudFR5cGUpICYmICF0aGlzLmxvb2tzTGlrZUltYWdlVXJsKGltYWdlVXJsKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1OEZEQ1x1N0EwQlx1OTRGRVx1NjNBNVx1NEUwRFx1NjYyRlx1NTNFRlx1OEJDNlx1NTIyQlx1NzY4NFx1NTZGRVx1NzI0N1x1OEQ0NFx1NkU5MFx1MzAwMlwiLCBcIlRoZSByZW1vdGUgVVJMIGRvZXMgbm90IGxvb2sgbGlrZSBhbiBpbWFnZSByZXNvdXJjZS5cIikpO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbGVOYW1lID0gdGhpcy5idWlsZFJlbW90ZVNvdXJjZUZpbGVOYW1lKGltYWdlVXJsLCBjb250ZW50VHlwZSk7XG4gICAgY29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLnByZXBhcmVVcGxvYWRQYXlsb2FkKFxuICAgICAgcmVzcG9uc2UuYXJyYXlCdWZmZXIsXG4gICAgICB0aGlzLm5vcm1hbGl6ZUltYWdlTWltZVR5cGUoY29udGVudFR5cGUsIGZpbGVOYW1lKSxcbiAgICAgIGZpbGVOYW1lLFxuICAgICk7XG4gICAgY29uc3QgcmVtb3RlTmFtZSA9IGF3YWl0IHRoaXMuYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnkocHJlcGFyZWQuZmlsZU5hbWUsIHByZXBhcmVkLmJpbmFyeSk7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRSZW1vdGVQYXRoKHJlbW90ZU5hbWUpO1xuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KHJlbW90ZVBhdGgsIHByZXBhcmVkLmJpbmFyeSwgcHJlcGFyZWQubWltZVR5cGUpO1xuICAgIGNvbnN0IHJlbW90ZVVybCA9IGAke1NFQ1VSRV9QUk9UT0NPTH0vLyR7cmVtb3RlUGF0aH1gO1xuICAgIHVwbG9hZENhY2hlPy5zZXQoY2FjaGVLZXksIHJlbW90ZVVybCk7XG4gICAgcmV0dXJuIHJlbW90ZVVybDtcbiAgfVxuXG4gIHByaXZhdGUgaXNJbWFnZUNvbnRlbnRUeXBlKGNvbnRlbnRUeXBlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gL15pbWFnZVxcLy9pLnRlc3QoY29udGVudFR5cGUudHJpbSgpKTtcbiAgfVxuXG4gIHByaXZhdGUgbG9va3NMaWtlSW1hZ2VVcmwocmF3VXJsOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXJsID0gbmV3IFVSTChyYXdVcmwpO1xuICAgICAgcmV0dXJuIC9cXC4ocG5nfGpwZT9nfGdpZnx3ZWJwfGJtcHxzdmcpJC9pLnRlc3QodXJsLnBhdGhuYW1lKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkUmVtb3RlU291cmNlRmlsZU5hbWUocmF3VXJsOiBzdHJpbmcsIGNvbnRlbnRUeXBlOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXJsID0gbmV3IFVSTChyYXdVcmwpO1xuICAgICAgY29uc3QgY2FuZGlkYXRlID0gdGhpcy5zYW5pdGl6ZUZpbGVOYW1lKHVybC5wYXRobmFtZS5zcGxpdChcIi9cIikucG9wKCkgfHwgXCJcIik7XG4gICAgICBpZiAoY2FuZGlkYXRlICYmIC9cXC5bYS16MC05XSskL2kudGVzdChjYW5kaWRhdGUpKSB7XG4gICAgICAgIHJldHVybiBjYW5kaWRhdGU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbU1pbWVUeXBlKGNvbnRlbnRUeXBlKSB8fCBcInBuZ1wiO1xuICAgICAgcmV0dXJuIGNhbmRpZGF0ZSA/IGAke2NhbmRpZGF0ZX0uJHtleHRlbnNpb259YCA6IGByZW1vdGUtaW1hZ2UuJHtleHRlbnNpb259YDtcbiAgICB9IGNhdGNoIHtcbiAgICAgIGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbU1pbWVUeXBlKGNvbnRlbnRUeXBlKSB8fCBcInBuZ1wiO1xuICAgICAgcmV0dXJuIGByZW1vdGUtaW1hZ2UuJHtleHRlbnNpb259YDtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHNhbml0aXplRmlsZU5hbWUoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBmaWxlTmFtZS5yZXBsYWNlKC9bXFxcXC86Kj9cIjw+fF0rL2csIFwiLVwiKS50cmltKCk7XG4gIH1cblxuICBwcml2YXRlIGdldEV4dGVuc2lvbkZyb21NaW1lVHlwZShjb250ZW50VHlwZTogc3RyaW5nKSB7XG4gICAgY29uc3QgbWltZVR5cGUgPSBjb250ZW50VHlwZS5zcGxpdChcIjtcIilbMF0udHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgc3dpdGNoIChtaW1lVHlwZSkge1xuICAgICAgY2FzZSBcImltYWdlL2pwZWdcIjpcbiAgICAgICAgcmV0dXJuIFwianBnXCI7XG4gICAgICBjYXNlIFwiaW1hZ2UvcG5nXCI6XG4gICAgICAgIHJldHVybiBcInBuZ1wiO1xuICAgICAgY2FzZSBcImltYWdlL2dpZlwiOlxuICAgICAgICByZXR1cm4gXCJnaWZcIjtcbiAgICAgIGNhc2UgXCJpbWFnZS93ZWJwXCI6XG4gICAgICAgIHJldHVybiBcIndlYnBcIjtcbiAgICAgIGNhc2UgXCJpbWFnZS9ibXBcIjpcbiAgICAgICAgcmV0dXJuIFwiYm1wXCI7XG4gICAgICBjYXNlIFwiaW1hZ2Uvc3ZnK3htbFwiOlxuICAgICAgICByZXR1cm4gXCJzdmdcIjtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgbm9ybWFsaXplSW1hZ2VNaW1lVHlwZShjb250ZW50VHlwZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgbWltZVR5cGUgPSBjb250ZW50VHlwZS5zcGxpdChcIjtcIilbMF0udHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKG1pbWVUeXBlICYmIG1pbWVUeXBlICE9PSBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiKSB7XG4gICAgICByZXR1cm4gbWltZVR5cGU7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUoZmlsZU5hbWUpO1xuICB9XG5cclxuICBwcml2YXRlIGFzeW5jIHVwbG9hZEJpbmFyeShyZW1vdGVQYXRoOiBzdHJpbmcsIGJpbmFyeTogQXJyYXlCdWZmZXIsIG1pbWVUeXBlOiBzdHJpbmcpIHtcbiAgICBhd2FpdCB0aGlzLmVuc3VyZVJlbW90ZURpcmVjdG9yaWVzKHJlbW90ZVBhdGgpO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJQVVRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgXCJDb250ZW50LVR5cGVcIjogbWltZVR5cGUsXHJcbiAgICAgIH0sXHJcbiAgICAgIGJvZHk6IGJpbmFyeSxcclxuICAgIH0pO1xyXG5cclxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBVcGxvYWQgZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlRWRpdG9yUGFzdGUoZXZ0OiBDbGlwYm9hcmRFdmVudCwgZWRpdG9yOiBFZGl0b3IsIGluZm86IE1hcmtkb3duVmlldyB8IE1hcmtkb3duRmlsZUluZm8pIHtcbiAgICBpZiAoZXZ0LmRlZmF1bHRQcmV2ZW50ZWQgfHwgIWluZm8uZmlsZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGltYWdlRmlsZSA9IHRoaXMuZXh0cmFjdEltYWdlRmlsZUZyb21DbGlwYm9hcmQoZXZ0KTtcbiAgICBpZiAoaW1hZ2VGaWxlKSB7XG4gICAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGNvbnN0IGZpbGVOYW1lID0gaW1hZ2VGaWxlLm5hbWUgfHwgdGhpcy5idWlsZENsaXBib2FyZEZpbGVOYW1lKGltYWdlRmlsZS50eXBlKTtcbiAgICAgIGF3YWl0IHRoaXMuZW5xdWV1ZUVkaXRvckltYWdlVXBsb2FkKGluZm8uZmlsZSwgZWRpdG9yLCBpbWFnZUZpbGUsIGZpbGVOYW1lKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBodG1sID0gZXZ0LmNsaXBib2FyZERhdGE/LmdldERhdGEoXCJ0ZXh0L2h0bWxcIik/LnRyaW0oKSA/PyBcIlwiO1xuICAgIGlmICghaHRtbCB8fCAhdGhpcy5odG1sQ29udGFpbnNSZW1vdGVJbWFnZXMoaHRtbCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICBhd2FpdCB0aGlzLmhhbmRsZUh0bWxQYXN0ZVdpdGhSZW1vdGVJbWFnZXMoaW5mby5maWxlLCBlZGl0b3IsIGh0bWwpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVFZGl0b3JEcm9wKGV2dDogRHJhZ0V2ZW50LCBlZGl0b3I6IEVkaXRvciwgaW5mbzogTWFya2Rvd25WaWV3IHwgTWFya2Rvd25GaWxlSW5mbykge1xuICAgIGlmIChldnQuZGVmYXVsdFByZXZlbnRlZCB8fCAhaW5mby5maWxlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaW1hZ2VGaWxlID0gdGhpcy5leHRyYWN0SW1hZ2VGaWxlRnJvbURyb3AoZXZ0KTtcbiAgICBpZiAoIWltYWdlRmlsZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IGZpbGVOYW1lID0gaW1hZ2VGaWxlLm5hbWUgfHwgdGhpcy5idWlsZENsaXBib2FyZEZpbGVOYW1lKGltYWdlRmlsZS50eXBlKTtcbiAgICBhd2FpdCB0aGlzLmVucXVldWVFZGl0b3JJbWFnZVVwbG9hZChpbmZvLmZpbGUsIGVkaXRvciwgaW1hZ2VGaWxlLCBmaWxlTmFtZSk7XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RJbWFnZUZpbGVGcm9tQ2xpcGJvYXJkKGV2dDogQ2xpcGJvYXJkRXZlbnQpIHtcbiAgICBjb25zdCBkaXJlY3QgPSBBcnJheS5mcm9tKGV2dC5jbGlwYm9hcmREYXRhPy5maWxlcyA/PyBbXSkuZmluZCgoZmlsZSkgPT4gZmlsZS50eXBlLnN0YXJ0c1dpdGgoXCJpbWFnZS9cIikpO1xuICAgIGlmIChkaXJlY3QpIHtcbiAgICAgIHJldHVybiBkaXJlY3Q7XG4gICAgfVxuXG4gICAgY29uc3QgaXRlbSA9IEFycmF5LmZyb20oZXZ0LmNsaXBib2FyZERhdGE/Lml0ZW1zID8/IFtdKS5maW5kKChlbnRyeSkgPT4gZW50cnkudHlwZS5zdGFydHNXaXRoKFwiaW1hZ2UvXCIpKTtcbiAgICByZXR1cm4gaXRlbT8uZ2V0QXNGaWxlKCkgPz8gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgaHRtbENvbnRhaW5zUmVtb3RlSW1hZ2VzKGh0bWw6IHN0cmluZykge1xuICAgIHJldHVybiAvPGltZ1xcYltePl0qc3JjPVtcIiddaHR0cHM/OlxcL1xcL1teXCInXStbXCInXVtePl0qPi9pLnRlc3QoaHRtbCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUh0bWxQYXN0ZVdpdGhSZW1vdGVJbWFnZXMobm90ZUZpbGU6IFRGaWxlLCBlZGl0b3I6IEVkaXRvciwgaHRtbDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlbmRlcmVkID0gYXdhaXQgdGhpcy5jb252ZXJ0SHRtbENsaXBib2FyZFRvU2VjdXJlTWFya2Rvd24oaHRtbCwgbm90ZUZpbGUpO1xuICAgICAgaWYgKCFyZW5kZXJlZC50cmltKCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBlZGl0b3IucmVwbGFjZVNlbGVjdGlvbihyZW5kZXJlZCk7XG4gICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NURGMlx1NUMwNlx1N0Y1MVx1OTg3NVx1NTZGRVx1NjU4N1x1N0M5OFx1OEQzNFx1NUU3Nlx1NjI5M1x1NTNENlx1OEZEQ1x1N0EwQlx1NTZGRVx1NzI0N1x1MzAwMlwiLCBcIlBhc3RlZCB3ZWIgY29udGVudCBhbmQgY2FwdHVyZWQgcmVtb3RlIGltYWdlcy5cIikpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHBhc3RlIEhUTUwgY29udGVudCB3aXRoIHJlbW90ZSBpbWFnZXNcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgdGhpcy5kZXNjcmliZUVycm9yKFxuICAgICAgICAgIHRoaXMudChcIlx1NTkwNFx1NzQwNlx1N0Y1MVx1OTg3NVx1NTZGRVx1NjU4N1x1N0M5OFx1OEQzNFx1NTkzMVx1OEQyNVwiLCBcIkZhaWxlZCB0byBwcm9jZXNzIHBhc3RlZCB3ZWIgY29udGVudFwiKSxcbiAgICAgICAgICBlcnJvcixcbiAgICAgICAgKSxcbiAgICAgICAgODAwMCxcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjb252ZXJ0SHRtbENsaXBib2FyZFRvU2VjdXJlTWFya2Rvd24oaHRtbDogc3RyaW5nLCBub3RlRmlsZTogVEZpbGUpIHtcbiAgICBjb25zdCBwYXJzZXIgPSBuZXcgRE9NUGFyc2VyKCk7XG4gICAgY29uc3QgZG9jdW1lbnQgPSBwYXJzZXIucGFyc2VGcm9tU3RyaW5nKGh0bWwsIFwidGV4dC9odG1sXCIpO1xuICAgIGNvbnN0IHVwbG9hZENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgICBjb25zdCByZW5kZXJlZEJsb2Nrczogc3RyaW5nW10gPSBbXTtcblxuICAgIGZvciAoY29uc3Qgbm9kZSBvZiBBcnJheS5mcm9tKGRvY3VtZW50LmJvZHkuY2hpbGROb2RlcykpIHtcbiAgICAgIGNvbnN0IGJsb2NrID0gYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sTm9kZShub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIDApO1xuICAgICAgaWYgKGJsb2NrLnRyaW0oKSkge1xuICAgICAgICByZW5kZXJlZEJsb2Nrcy5wdXNoKGJsb2NrLnRyaW0oKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlbmRlcmVkQmxvY2tzLmpvaW4oXCJcXG5cXG5cIikgKyBcIlxcblwiO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZW5kZXJQYXN0ZWRIdG1sTm9kZShcbiAgICBub2RlOiBOb2RlLFxuICAgIG5vdGVGaWxlOiBURmlsZSxcbiAgICB1cGxvYWRDYWNoZTogTWFwPHN0cmluZywgc3RyaW5nPixcbiAgICBsaXN0RGVwdGg6IG51bWJlcixcbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUpIHtcbiAgICAgIHJldHVybiB0aGlzLm5vcm1hbGl6ZUNsaXBib2FyZFRleHQobm9kZS50ZXh0Q29udGVudCA/PyBcIlwiKTtcbiAgICB9XG5cbiAgICBpZiAoIShub2RlIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpKSB7XG4gICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG5cbiAgICBjb25zdCB0YWcgPSBub2RlLnRhZ05hbWUudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAodGFnID09PSBcImltZ1wiKSB7XG4gICAgICBjb25zdCBzcmMgPSB0aGlzLnVuZXNjYXBlSHRtbChub2RlLmdldEF0dHJpYnV0ZShcInNyY1wiKT8udHJpbSgpID8/IFwiXCIpO1xuICAgICAgaWYgKCF0aGlzLmlzSHR0cFVybChzcmMpKSB7XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBhbHQgPSAobm9kZS5nZXRBdHRyaWJ1dGUoXCJhbHRcIikgPz8gXCJcIikudHJpbSgpIHx8IHRoaXMuZ2V0RGlzcGxheU5hbWVGcm9tVXJsKHNyYyk7XG4gICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFJlbW90ZUltYWdlVXJsKHNyYywgdXBsb2FkQ2FjaGUpO1xuICAgICAgcmV0dXJuIHRoaXMuaW1hZ2VTdXBwb3J0LmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsLCBhbHQpO1xuICAgIH1cblxuICAgIGlmICh0YWcgPT09IFwiYnJcIikge1xuICAgICAgcmV0dXJuIFwiXFxuXCI7XG4gICAgfVxuXG4gICAgaWYgKHRhZyA9PT0gXCJ1bFwiIHx8IHRhZyA9PT0gXCJvbFwiKSB7XG4gICAgICBjb25zdCBpdGVtczogc3RyaW5nW10gPSBbXTtcbiAgICAgIGxldCBpbmRleCA9IDE7XG4gICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIEFycmF5LmZyb20obm9kZS5jaGlsZHJlbikpIHtcbiAgICAgICAgaWYgKGNoaWxkLnRhZ05hbWUudG9Mb3dlckNhc2UoKSAhPT0gXCJsaVwiKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZW5kZXJlZCA9IChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxOb2RlKGNoaWxkLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCArIDEpKS50cmltKCk7XG4gICAgICAgIGlmICghcmVuZGVyZWQpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHByZWZpeCA9IHRhZyA9PT0gXCJvbFwiID8gYCR7aW5kZXh9LiBgIDogXCItIFwiO1xuICAgICAgICBpdGVtcy5wdXNoKGAke1wiICBcIi5yZXBlYXQoTWF0aC5tYXgoMCwgbGlzdERlcHRoKSl9JHtwcmVmaXh9JHtyZW5kZXJlZH1gKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGl0ZW1zLmpvaW4oXCJcXG5cIik7XG4gICAgfVxuXG4gICAgaWYgKHRhZyA9PT0gXCJsaVwiKSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKTtcbiAgICAgIHJldHVybiBwYXJ0cy5qb2luKFwiXCIpLnRyaW0oKTtcbiAgICB9XG5cbiAgICBpZiAoL15oWzEtNl0kLy50ZXN0KHRhZykpIHtcbiAgICAgIGNvbnN0IGxldmVsID0gTnVtYmVyLnBhcnNlSW50KHRhZ1sxXSwgMTApO1xuICAgICAgY29uc3QgdGV4dCA9IChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIikudHJpbSgpO1xuICAgICAgcmV0dXJuIHRleHQgPyBgJHtcIiNcIi5yZXBlYXQobGV2ZWwpfSAke3RleHR9YCA6IFwiXCI7XG4gICAgfVxuXG4gICAgaWYgKHRhZyA9PT0gXCJhXCIpIHtcbiAgICAgIGNvbnN0IGhyZWYgPSBub2RlLmdldEF0dHJpYnV0ZShcImhyZWZcIik/LnRyaW0oKSA/PyBcIlwiO1xuICAgICAgY29uc3QgdGV4dCA9IChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIikudHJpbSgpO1xuICAgICAgaWYgKGhyZWYgJiYgL15odHRwcz86XFwvXFwvL2kudGVzdChocmVmKSAmJiB0ZXh0KSB7XG4gICAgICAgIHJldHVybiBgWyR7dGV4dH1dKCR7aHJlZn0pYDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0ZXh0O1xuICAgIH1cblxuICAgIGNvbnN0IGlubGluZVRhZ3MgPSBuZXcgU2V0KFtcInN0cm9uZ1wiLCBcImJcIiwgXCJlbVwiLCBcImlcIiwgXCJzcGFuXCIsIFwiY29kZVwiLCBcInNtYWxsXCIsIFwic3VwXCIsIFwic3ViXCJdKTtcbiAgICBpZiAoaW5saW5lVGFncy5oYXModGFnKSkge1xuICAgICAgcmV0dXJuIChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIik7XG4gICAgfVxuXG4gICAgY29uc3QgYmxvY2tUYWdzID0gbmV3IFNldChbXG4gICAgICBcInBcIixcbiAgICAgIFwiZGl2XCIsXG4gICAgICBcImFydGljbGVcIixcbiAgICAgIFwic2VjdGlvblwiLFxuICAgICAgXCJmaWd1cmVcIixcbiAgICAgIFwiZmlnY2FwdGlvblwiLFxuICAgICAgXCJibG9ja3F1b3RlXCIsXG4gICAgICBcInByZVwiLFxuICAgICAgXCJ0YWJsZVwiLFxuICAgICAgXCJ0aGVhZFwiLFxuICAgICAgXCJ0Ym9keVwiLFxuICAgICAgXCJ0clwiLFxuICAgICAgXCJ0ZFwiLFxuICAgICAgXCJ0aFwiLFxuICAgIF0pO1xuICAgIGlmIChibG9ja1RhZ3MuaGFzKHRhZykpIHtcbiAgICAgIGNvbnN0IHRleHQgPSAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpLnRyaW0oKTtcbiAgICAgIHJldHVybiB0ZXh0O1xuICAgIH1cblxuICAgIHJldHVybiAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4oXG4gICAgZWxlbWVudDogSFRNTEVsZW1lbnQsXG4gICAgbm90ZUZpbGU6IFRGaWxlLFxuICAgIHVwbG9hZENhY2hlOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuICAgIGxpc3REZXB0aDogbnVtYmVyLFxuICApIHtcbiAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIEFycmF5LmZyb20oZWxlbWVudC5jaGlsZE5vZGVzKSkge1xuICAgICAgY29uc3QgcmVuZGVyZWQgPSBhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxOb2RlKGNoaWxkLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCk7XG4gICAgICBpZiAoIXJlbmRlcmVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAocGFydHMubGVuZ3RoID4gMCAmJiAhcmVuZGVyZWQuc3RhcnRzV2l0aChcIlxcblwiKSAmJiAhcGFydHNbcGFydHMubGVuZ3RoIC0gMV0uZW5kc1dpdGgoXCJcXG5cIikpIHtcbiAgICAgICAgY29uc3QgcHJldmlvdXMgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXTtcbiAgICAgICAgY29uc3QgbmVlZHNTcGFjZSA9IC9cXFMkLy50ZXN0KHByZXZpb3VzKSAmJiAvXlxcUy8udGVzdChyZW5kZXJlZCk7XG4gICAgICAgIGlmIChuZWVkc1NwYWNlKSB7XG4gICAgICAgICAgcGFydHMucHVzaChcIiBcIik7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcGFydHMucHVzaChyZW5kZXJlZCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhcnRzO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVDbGlwYm9hcmRUZXh0KHZhbHVlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdmFsdWUucmVwbGFjZSgvXFxzKy9nLCBcIiBcIik7XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RJbWFnZUZpbGVGcm9tRHJvcChldnQ6IERyYWdFdmVudCkge1xuICAgIHJldHVybiBBcnJheS5mcm9tKGV2dC5kYXRhVHJhbnNmZXI/LmZpbGVzID8/IFtdKS5maW5kKChmaWxlKSA9PiBmaWxlLnR5cGUuc3RhcnRzV2l0aChcImltYWdlL1wiKSkgPz8gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZW5xdWV1ZUVkaXRvckltYWdlVXBsb2FkKG5vdGVGaWxlOiBURmlsZSwgZWRpdG9yOiBFZGl0b3IsIGltYWdlRmlsZTogRmlsZSwgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHRoaXMuZW5zdXJlU3VwcG9ydE1vZHVsZXMoKTtcbiAgICBhd2FpdCB0aGlzLnVwbG9hZFF1ZXVlLmVucXVldWVFZGl0b3JJbWFnZVVwbG9hZChub3RlRmlsZSwgZWRpdG9yLCBpbWFnZUZpbGUsIGZpbGVOYW1lKTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlVXBsb2FkVGFzayhub3RlUGF0aDogc3RyaW5nLCBiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKTogVXBsb2FkVGFzayB7XG4gICAgdGhpcy5lbnN1cmVTdXBwb3J0TW9kdWxlcygpO1xuICAgIHJldHVybiB0aGlzLnVwbG9hZFF1ZXVlLmNyZWF0ZVVwbG9hZFRhc2sobm90ZVBhdGgsIGJpbmFyeSwgbWltZVR5cGUsIGZpbGVOYW1lKTtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRQZW5kaW5nUGxhY2Vob2xkZXIodGFza0lkOiBzdHJpbmcsIGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICB0aGlzLmVuc3VyZVN1cHBvcnRNb2R1bGVzKCk7XG4gICAgcmV0dXJuIHRoaXMudXBsb2FkUXVldWUuYnVpbGRQZW5kaW5nUGxhY2Vob2xkZXIodGFza0lkLCBmaWxlTmFtZSk7XG4gIH1cblxuICBhc3luYyBzeW5jQ29uZmlndXJlZFZhdWx0Q29udGVudChzaG93Tm90aWNlID0gdHJ1ZSkge1xuICAgIGlmICh0aGlzLnN5bmNJblByb2dyZXNzKSB7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NTQwQ1x1NkI2NVx1NkI2M1x1NTcyOFx1OEZEQlx1ODg0Q1x1NEUyRFx1MzAwMlwiLCBcIkEgc3luYyBpcyBhbHJlYWR5IGluIHByb2dyZXNzLlwiKSwgNDAwMCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zeW5jSW5Qcm9ncmVzcyA9IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xuICAgICAgYXdhaXQgdGhpcy53YWl0Rm9yUGVuZGluZ1ZhdWx0TXV0YXRpb25zKCk7XG4gICAgICBjb25zdCB1cGxvYWRzUmVhZHkgPSBhd2FpdCB0aGlzLnByZXBhcmVQZW5kaW5nVXBsb2Fkc0ZvclN5bmMoc2hvd05vdGljZSk7XG4gICAgICBpZiAoIXVwbG9hZHNSZWFkeSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBhd2FpdCB0aGlzLnJlYnVpbGRSZWZlcmVuY2VJbmRleCgpO1xuXG4gICAgICBjb25zdCByZW1vdGVJbnZlbnRvcnkgPSBhd2FpdCB0aGlzLmxpc3RSZW1vdGVUcmVlKHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKTtcbiAgICAgIGNvbnN0IGRlbGV0aW9uVG9tYnN0b25lcyA9IGF3YWl0IHRoaXMucmVhZERlbGV0aW9uVG9tYnN0b25lcygpO1xuICAgICAgY29uc3QgcmVtb3RlRmlsZXMgPSByZW1vdGVJbnZlbnRvcnkuZmlsZXM7XG4gICAgICBsZXQgcmVzdG9yZWRGcm9tUmVtb3RlID0gMDtcbiAgICAgIGxldCBkZWxldGVkUmVtb3RlRmlsZXMgPSAwO1xuICAgICAgbGV0IGRlbGV0ZWRMb2NhbEZpbGVzID0gMDtcbiAgICAgIGxldCBkZWxldGVkTG9jYWxTdHVicyA9IDA7XG5cbiAgICAgIGxldCBmaWxlcyA9IHRoaXMuY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCk7XG4gICAgICBsZXQgY3VycmVudFBhdGhzID0gbmV3IFNldChmaWxlcy5tYXAoKGZpbGUpID0+IGZpbGUucGF0aCkpO1xuICAgICAgZm9yIChjb25zdCBwYXRoIG9mIFsuLi50aGlzLnN5bmNJbmRleC5rZXlzKCldKSB7XG4gICAgICAgIGlmICghY3VycmVudFBhdGhzLmhhcyhwYXRoKSkge1xuICAgICAgICAgIGNvbnN0IHByZXZpb3VzID0gdGhpcy5zeW5jSW5kZXguZ2V0KHBhdGgpO1xuICAgICAgICAgIGlmICghcHJldmlvdXMpIHtcbiAgICAgICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShwYXRoKTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHJlbW90ZSA9IHJlbW90ZUZpbGVzLmdldChwcmV2aW91cy5yZW1vdGVQYXRoKTtcbiAgICAgICAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKHBhdGgpO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldChwYXRoKTtcbiAgICAgICAgICBpZiAodG9tYnN0b25lICYmIHRoaXMuaXNUb21ic3RvbmVBdXRob3JpdGF0aXZlKHRvbWJzdG9uZSwgcmVtb3RlKSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgICAgICByZW1vdGVGaWxlcy5kZWxldGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKHBhdGgpO1xuICAgICAgICAgICAgZGVsZXRlZFJlbW90ZUZpbGVzICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKHBhdGgpO1xuICAgICAgICAgICAgZGVsZXRpb25Ub21ic3RvbmVzLmRlbGV0ZShwYXRoKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocHJldmlvdXMucmVtb3RlU2lnbmF0dXJlICYmIHByZXZpb3VzLnJlbW90ZVNpZ25hdHVyZSAhPT0gcmVtb3RlLnNpZ25hdHVyZSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KHBhdGgsIHJlbW90ZSk7XG4gICAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQocGF0aCwge1xuICAgICAgICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgICAgICByZW1vdGVQYXRoOiByZW1vdGUucmVtb3RlUGF0aCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmVzdG9yZWRGcm9tUmVtb3RlICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQocGF0aCwgcmVtb3RlKTtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQocGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVQYXRoOiByZW1vdGUucmVtb3RlUGF0aCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXN0b3JlZEZyb21SZW1vdGUgKz0gMTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBsZXQgdXBsb2FkZWQgPSAwO1xuICAgICAgbGV0IHNraXBwZWQgPSAwO1xuICAgICAgbGV0IG1pc3NpbmdSZW1vdGVCYWNrZWROb3RlcyA9IDA7XG4gICAgICBsZXQgcHVyZ2VkTWlzc2luZ0xhenlOb3RlcyA9IDA7XG5cbiAgICAgIGZpbGVzID0gdGhpcy5jb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKTtcbiAgICAgIGN1cnJlbnRQYXRocyA9IG5ldyBTZXQoZmlsZXMubWFwKChmaWxlKSA9PiBmaWxlLnBhdGgpKTtcbiAgICAgIGZvciAoY29uc3QgcmVtb3RlIG9mIFsuLi5yZW1vdGVGaWxlcy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5yZW1vdGVQYXRoLmxvY2FsZUNvbXBhcmUoYi5yZW1vdGVQYXRoKSkpIHtcbiAgICAgICAgY29uc3QgdmF1bHRQYXRoID0gdGhpcy5yZW1vdGVQYXRoVG9WYXVsdFBhdGgocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICBpZiAoIXZhdWx0UGF0aCB8fCBjdXJyZW50UGF0aHMuaGFzKHZhdWx0UGF0aCkpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICBjb25zdCB0b21ic3RvbmUgPSBkZWxldGlvblRvbWJzdG9uZXMuZ2V0KHZhdWx0UGF0aCk7XG4gICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgIGlmICh0aGlzLmlzVG9tYnN0b25lQXV0aG9yaXRhdGl2ZSh0b21ic3RvbmUsIHJlbW90ZSkpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICByZW1vdGVGaWxlcy5kZWxldGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICAgIGRlbGV0ZWRSZW1vdGVGaWxlcyArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZSh2YXVsdFBhdGgpO1xuICAgICAgICBkZWxldGlvblRvbWJzdG9uZXMuZGVsZXRlKHZhdWx0UGF0aCk7XG4gICAgICB9XG5cbiAgICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KHZhdWx0UGF0aCwgcmVtb3RlKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KHZhdWx0UGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVQYXRoOiByZW1vdGUucmVtb3RlUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlc3RvcmVkRnJvbVJlbW90ZSArPSAxO1xuICAgICAgfVxuXG4gICAgICBmaWxlcyA9IHRoaXMuY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCk7XG4gICAgICBjdXJyZW50UGF0aHMgPSBuZXcgU2V0KGZpbGVzLm1hcCgoZmlsZSkgPT4gZmlsZS5wYXRoKSk7XG4gICAgICBjb25zdCBsb2NhbFJlbW90ZVBhdGhzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgICBsZXQgZG93bmxvYWRlZE9yVXBkYXRlZCA9IDA7XG4gICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgIGxvY2FsUmVtb3RlUGF0aHMuYWRkKHJlbW90ZVBhdGgpO1xuICAgICAgICBjb25zdCByZW1vdGUgPSByZW1vdGVGaWxlcy5nZXQocmVtb3RlUGF0aCk7XG4gICAgICAgIGNvbnN0IHJlbW90ZVNpZ25hdHVyZSA9IHJlbW90ZT8uc2lnbmF0dXJlID8/IFwiXCI7XG4gICAgICAgIGNvbnN0IHByZXZpb3VzID0gdGhpcy5zeW5jSW5kZXguZ2V0KGZpbGUucGF0aCk7XG4gICAgICAgIGNvbnN0IG1hcmtkb3duQ29udGVudCA9IGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIgPyBhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSkgOiBudWxsO1xuICAgICAgICBjb25zdCBsb2NhbFNpZ25hdHVyZSA9IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUoZmlsZSwgbWFya2Rvd25Db250ZW50ID8/IHVuZGVmaW5lZCk7XG5cbiAgICAgICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgICAgICBjb25zdCBzdHViID0gdGhpcy5wYXJzZU5vdGVTdHViKG1hcmtkb3duQ29udGVudCA/PyBcIlwiKTtcbiAgICAgICAgICBpZiAoc3R1Yikge1xuICAgICAgICAgICAgY29uc3Qgc3R1YlJlbW90ZSA9IHJlbW90ZUZpbGVzLmdldChzdHViLnJlbW90ZVBhdGgpO1xuICAgICAgICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldChmaWxlLnBhdGgpO1xuICAgICAgICAgICAgaWYgKCFzdHViUmVtb3RlICYmIHRvbWJzdG9uZSkge1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGUpO1xuICAgICAgICAgICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgICAgdGhpcy5jbGVhck1pc3NpbmdMYXp5UmVtb3RlKGZpbGUucGF0aCk7XG4gICAgICAgICAgICAgIGRlbGV0ZWRMb2NhbEZpbGVzICs9IDE7XG4gICAgICAgICAgICAgIGRlbGV0ZWRMb2NhbFN0dWJzICs9IDE7XG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFzdHViUmVtb3RlKSB7XG4gICAgICAgICAgICAgIGNvbnN0IG1pc3NpbmdSZWNvcmQgPSB0aGlzLm1hcmtNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgICAgICAgICBpZiAobWlzc2luZ1JlY29yZC5taXNzQ291bnQgPj0gdGhpcy5taXNzaW5nTGF6eVJlbW90ZUNvbmZpcm1hdGlvbnMpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGUpO1xuICAgICAgICAgICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgICAgICAgICAgIHRoaXMuY2xlYXJNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgICAgICAgICAgIGRlbGV0ZWRMb2NhbEZpbGVzICs9IDE7XG4gICAgICAgICAgICAgICAgZGVsZXRlZExvY2FsU3R1YnMgKz0gMTtcbiAgICAgICAgICAgICAgICBwdXJnZWRNaXNzaW5nTGF6eU5vdGVzICs9IDE7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgbWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzICs9IDE7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0aGlzLmNsZWFyTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogc3R1YlJlbW90ZT8uc2lnbmF0dXJlID8/IHByZXZpb3VzPy5yZW1vdGVTaWduYXR1cmUgPz8gXCJcIixcbiAgICAgICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgc2tpcHBlZCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldChmaWxlLnBhdGgpO1xuICAgICAgICBjb25zdCB1bmNoYW5nZWRTaW5jZUxhc3RTeW5jID0gcHJldmlvdXMgPyBwcmV2aW91cy5sb2NhbFNpZ25hdHVyZSA9PT0gbG9jYWxTaWduYXR1cmUgOiBmYWxzZTtcbiAgICAgICAgaWYgKHRvbWJzdG9uZSkge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHVuY2hhbmdlZFNpbmNlTGFzdFN5bmMgJiZcbiAgICAgICAgICAgIHRoaXMuc2hvdWxkRGVsZXRlTG9jYWxGcm9tVG9tYnN0b25lKGZpbGUsIHRvbWJzdG9uZSkgJiZcbiAgICAgICAgICAgIHRoaXMuaXNUb21ic3RvbmVBdXRob3JpdGF0aXZlKHRvbWJzdG9uZSwgcmVtb3RlKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5yZW1vdmVMb2NhbFZhdWx0RmlsZShmaWxlKTtcbiAgICAgICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgICAgICAgZGVsZXRlZExvY2FsRmlsZXMgKz0gMTtcbiAgICAgICAgICAgIGlmIChyZW1vdGUpIHtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgICAgICAgIHJlbW90ZUZpbGVzLmRlbGV0ZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgICAgICAgIGRlbGV0ZWRSZW1vdGVGaWxlcyArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgICAgIGRlbGV0aW9uVG9tYnN0b25lcy5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghcmVtb3RlKSB7XG4gICAgICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCwgbWFya2Rvd25Db250ZW50ID8/IHVuZGVmaW5lZCk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmVtb3RlRmlsZXMuc2V0KHJlbW90ZVBhdGgsIHVwbG9hZGVkUmVtb3RlKTtcbiAgICAgICAgICB1cGxvYWRlZCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFwcmV2aW91cykge1xuICAgICAgICAgIGlmIChsb2NhbFNpZ25hdHVyZSA9PT0gcmVtb3RlU2lnbmF0dXJlKSB7XG4gICAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICAgICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgIHNraXBwZWQgKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICh0aGlzLnNob3VsZERvd25sb2FkUmVtb3RlVmVyc2lvbihmaWxlLnN0YXQubXRpbWUsIHJlbW90ZS5sYXN0TW9kaWZpZWQpKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgICAgICAgICAgY29uc3QgcmVmcmVzaGVkID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUocmVmcmVzaGVkKSA6IHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBkb3dubG9hZGVkT3JVcGRhdGVkICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoLCBtYXJrZG93bkNvbnRlbnQgPz8gdW5kZWZpbmVkKTtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZW1vdGVGaWxlcy5zZXQocmVtb3RlUGF0aCwgdXBsb2FkZWRSZW1vdGUpO1xuICAgICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgICB1cGxvYWRlZCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbG9jYWxDaGFuZ2VkID0gcHJldmlvdXMubG9jYWxTaWduYXR1cmUgIT09IGxvY2FsU2lnbmF0dXJlIHx8IHByZXZpb3VzLnJlbW90ZVBhdGggIT09IHJlbW90ZVBhdGg7XG4gICAgICAgIGNvbnN0IHJlbW90ZUNoYW5nZWQgPSBwcmV2aW91cy5yZW1vdGVTaWduYXR1cmUgIT09IHJlbW90ZVNpZ25hdHVyZSB8fCBwcmV2aW91cy5yZW1vdGVQYXRoICE9PSByZW1vdGVQYXRoO1xuICAgICAgICBpZiAoIWxvY2FsQ2hhbmdlZCAmJiAhcmVtb3RlQ2hhbmdlZCkge1xuICAgICAgICAgIHNraXBwZWQgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghbG9jYWxDaGFuZ2VkICYmIHJlbW90ZUNoYW5nZWQpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgICAgICAgIGNvbnN0IHJlZnJlc2hlZCA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUocmVmcmVzaGVkKSA6IHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgZG93bmxvYWRlZE9yVXBkYXRlZCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGxvY2FsQ2hhbmdlZCAmJiAhcmVtb3RlQ2hhbmdlZCkge1xuICAgICAgICAgIGNvbnN0IHVwbG9hZGVkUmVtb3RlID0gYXdhaXQgdGhpcy51cGxvYWRDb250ZW50RmlsZVRvUmVtb3RlKGZpbGUsIHJlbW90ZVBhdGgsIG1hcmtkb3duQ29udGVudCA/PyB1bmRlZmluZWQpO1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiB1cGxvYWRlZFJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJlbW90ZUZpbGVzLnNldChyZW1vdGVQYXRoLCB1cGxvYWRlZFJlbW90ZSk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgICAgIHVwbG9hZGVkICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5zaG91bGREb3dubG9hZFJlbW90ZVZlcnNpb24oZmlsZS5zdGF0Lm10aW1lLCByZW1vdGUubGFzdE1vZGlmaWVkKSkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuZG93bmxvYWRSZW1vdGVGaWxlVG9WYXVsdChmaWxlLnBhdGgsIHJlbW90ZSwgZmlsZSk7XG4gICAgICAgICAgY29uc3QgcmVmcmVzaGVkID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVmcmVzaGVkID8gYXdhaXQgdGhpcy5idWlsZEN1cnJlbnRMb2NhbFNpZ25hdHVyZShyZWZyZXNoZWQpIDogcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBkb3dubG9hZGVkT3JVcGRhdGVkICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoLCBtYXJrZG93bkNvbnRlbnQgPz8gdW5kZWZpbmVkKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICByZW1vdGVGaWxlcy5zZXQocmVtb3RlUGF0aCwgdXBsb2FkZWRSZW1vdGUpO1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCk7XG4gICAgICAgIHVwbG9hZGVkICs9IDE7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGRlbGV0ZWRSZW1vdGVEaXJlY3RvcmllcyA9IGF3YWl0IHRoaXMuZGVsZXRlRXh0cmFSZW1vdGVEaXJlY3RvcmllcyhcbiAgICAgICAgcmVtb3RlSW52ZW50b3J5LmRpcmVjdG9yaWVzLFxuICAgICAgICB0aGlzLmJ1aWxkRXhwZWN0ZWRSZW1vdGVEaXJlY3Rvcmllcyhsb2NhbFJlbW90ZVBhdGhzLCB0aGlzLnNldHRpbmdzLnZhdWx0U3luY1JlbW90ZUZvbGRlciksXG4gICAgICApO1xuICAgICAgY29uc3QgaW1hZ2VDbGVhbnVwID0gYXdhaXQgdGhpcy5yZWNvbmNpbGVSZW1vdGVJbWFnZXMoKTtcbiAgICAgIGNvbnN0IGV2aWN0ZWROb3RlcyA9IGF3YWl0IHRoaXMuZXZpY3RTdGFsZVN5bmNlZE5vdGVzKGZhbHNlKTtcblxuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy50KFxuICAgICAgICBgXHU1REYyXHU1M0NDXHU1NDExXHU1NDBDXHU2QjY1XHVGRjFBXHU0RTBBXHU0RjIwICR7dXBsb2FkZWR9IFx1NEUyQVx1NjU4N1x1NEVGNlx1RkYwQ1x1NEVDRVx1OEZEQ1x1N0FFRlx1NjJDOVx1NTNENiAke3Jlc3RvcmVkRnJvbVJlbW90ZSArIGRvd25sb2FkZWRPclVwZGF0ZWR9IFx1NEUyQVx1NjU4N1x1NEVGNlx1RkYwQ1x1OERGM1x1OEZDNyAke3NraXBwZWR9IFx1NEUyQVx1NjcyQVx1NTNEOFx1NTMxNlx1NjU4N1x1NEVGNlx1RkYwQ1x1NTIyMFx1OTY2NFx1OEZEQ1x1N0FFRlx1NTE4NVx1NUJCOSAke2RlbGV0ZWRSZW1vdGVGaWxlc30gXHU0RTJBXHUzMDAxXHU2NzJDXHU1NzMwXHU1MTg1XHU1QkI5ICR7ZGVsZXRlZExvY2FsRmlsZXN9IFx1NEUyQSR7ZGVsZXRlZExvY2FsU3R1YnMgPiAwID8gYFx1RkYwOFx1NTE3Nlx1NEUyRFx1NTkzMVx1NjU0OFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMCAke2RlbGV0ZWRMb2NhbFN0dWJzfSBcdTdCQzdcdUZGMDlgIDogXCJcIn1cdUZGMENcdTZFMDVcdTc0MDZcdThGRENcdTdBRUZcdTdBN0FcdTc2RUVcdTVGNTUgJHtkZWxldGVkUmVtb3RlRGlyZWN0b3JpZXN9IFx1NEUyQVx1RkYwQ1x1NkUwNVx1NzQwNlx1NTE5N1x1NEY1OVx1NTZGRVx1NzI0NyAke2ltYWdlQ2xlYW51cC5kZWxldGVkRmlsZXN9IFx1NUYyMFx1MzAwMVx1NzZFRVx1NUY1NSAke2ltYWdlQ2xlYW51cC5kZWxldGVkRGlyZWN0b3JpZXN9IFx1NEUyQSR7ZXZpY3RlZE5vdGVzID4gMCA/IGBcdUZGMENcdTU2REVcdTY1MzZcdTY3MkNcdTU3MzBcdTY1RTdcdTdCMTRcdThCQjAgJHtldmljdGVkTm90ZXN9IFx1N0JDN2AgOiBcIlwifSR7bWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzID4gMCA/IGBcdUZGMENcdTVFNzZcdTUzRDFcdTczQjAgJHttaXNzaW5nUmVtb3RlQmFja2VkTm90ZXN9IFx1N0JDN1x1NjMwOVx1OTcwMFx1N0IxNFx1OEJCMFx1N0YzQVx1NUMxMVx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N2AgOiBcIlwifSR7cHVyZ2VkTWlzc2luZ0xhenlOb3RlcyA+IDAgPyBgXHVGRjBDXHU3ODZFXHU4QkE0XHU2RTA1XHU3NDA2XHU1OTMxXHU2NTQ4XHU1MzYwXHU0RjREXHU3QjE0XHU4QkIwICR7cHVyZ2VkTWlzc2luZ0xhenlOb3Rlc30gXHU3QkM3YCA6IFwiXCJ9XHUzMDAyYCxcbiAgICAgICAgYEJpZGlyZWN0aW9uYWwgc3luYyB1cGxvYWRlZCAke3VwbG9hZGVkfSBmaWxlKHMpLCBwdWxsZWQgJHtyZXN0b3JlZEZyb21SZW1vdGUgKyBkb3dubG9hZGVkT3JVcGRhdGVkfSBmaWxlKHMpIGZyb20gcmVtb3RlLCBza2lwcGVkICR7c2tpcHBlZH0gdW5jaGFuZ2VkIGZpbGUocyksIGRlbGV0ZWQgJHtkZWxldGVkUmVtb3RlRmlsZXN9IHJlbW90ZSBjb250ZW50IGZpbGUocykgYW5kICR7ZGVsZXRlZExvY2FsRmlsZXN9IGxvY2FsIGZpbGUocykke2RlbGV0ZWRMb2NhbFN0dWJzID4gMCA/IGAgKGluY2x1ZGluZyAke2RlbGV0ZWRMb2NhbFN0dWJzfSBzdGFsZSBzdHViIG5vdGUocykpYCA6IFwiXCJ9LCByZW1vdmVkICR7ZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzfSByZW1vdGUgZGlyZWN0b3Ike2RlbGV0ZWRSZW1vdGVEaXJlY3RvcmllcyA9PT0gMSA/IFwieVwiIDogXCJpZXNcIn0sIGNsZWFuZWQgJHtpbWFnZUNsZWFudXAuZGVsZXRlZEZpbGVzfSBvcnBoYW5lZCByZW1vdGUgaW1hZ2UocykgcGx1cyAke2ltYWdlQ2xlYW51cC5kZWxldGVkRGlyZWN0b3JpZXN9IGRpcmVjdG9yJHtpbWFnZUNsZWFudXAuZGVsZXRlZERpcmVjdG9yaWVzID09PSAxID8gXCJ5XCIgOiBcImllc1wifSR7ZXZpY3RlZE5vdGVzID4gMCA/IGAsIGFuZCBldmljdGVkICR7ZXZpY3RlZE5vdGVzfSBzdGFsZSBsb2NhbCBub3RlKHMpYCA6IFwiXCJ9JHttaXNzaW5nUmVtb3RlQmFja2VkTm90ZXMgPiAwID8gYCwgd2hpbGUgZGV0ZWN0aW5nICR7bWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzfSBsYXp5IG5vdGUocykgbWlzc2luZyB0aGVpciByZW1vdGUgY29udGVudGAgOiBcIlwifSR7cHVyZ2VkTWlzc2luZ0xhenlOb3RlcyA+IDAgPyBgLCBhbmQgcHVyZ2VkICR7cHVyZ2VkTWlzc2luZ0xhenlOb3Rlc30gY29uZmlybWVkIGJyb2tlbiBsYXp5IHBsYWNlaG9sZGVyKHMpYCA6IFwiXCJ9LmAsXG4gICAgICApO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzLCA4MDAwKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIlZhdWx0IGNvbnRlbnQgc3luYyBmYWlsZWRcIiwgZXJyb3IpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1NTE4NVx1NUJCOVx1NTQwQ1x1NkI2NVx1NTkzMVx1OEQyNVwiLCBcIkNvbnRlbnQgc3luYyBmYWlsZWRcIiksIGVycm9yKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cywgODAwMCk7XG4gICAgICB9XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMuc3luY0luUHJvZ3Jlc3MgPSBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSA0MDQgJiYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYERFTEVURSBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZGVsZXRlIHJlbW90ZSBzeW5jZWQgY29udGVudFwiLCByZW1vdGVQYXRoLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkUmVtb3RlU3luY1NpZ25hdHVyZShyZW1vdGU6IFBpY2s8UmVtb3RlRmlsZVN0YXRlLCBcImxhc3RNb2RpZmllZFwiIHwgXCJzaXplXCI+KSB7XG4gICAgdGhpcy5lbnN1cmVTdXBwb3J0TW9kdWxlcygpO1xuICAgIHJldHVybiB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkUmVtb3RlU3luY1NpZ25hdHVyZShyZW1vdGUpO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZERlbGV0aW9uRm9sZGVyKCkge1xuICAgIHRoaXMuZW5zdXJlU3VwcG9ydE1vZHVsZXMoKTtcbiAgICByZXR1cm4gdGhpcy5zeW5jU3VwcG9ydC5idWlsZERlbGV0aW9uRm9sZGVyKCk7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkRGVsZXRpb25SZW1vdGVQYXRoKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgdGhpcy5lbnN1cmVTdXBwb3J0TW9kdWxlcygpO1xuICAgIHJldHVybiB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkRGVsZXRpb25SZW1vdGVQYXRoKHZhdWx0UGF0aCk7XG4gIH1cblxuICBwcml2YXRlIHBhcnNlRGVsZXRpb25Ub21ic3RvbmVCYXNlNjQodmFsdWU6IHN0cmluZykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSB2YWx1ZS5yZXBsYWNlKC8tL2csIFwiK1wiKS5yZXBsYWNlKC9fL2csIFwiL1wiKTtcbiAgICBjb25zdCBwYWRkZWQgPSBub3JtYWxpemVkICsgXCI9XCIucmVwZWF0KCg0IC0gKG5vcm1hbGl6ZWQubGVuZ3RoICUgNCB8fCA0KSkgJSA0KTtcbiAgICByZXR1cm4gdGhpcy5kZWNvZGVVdGY4KHRoaXMuYmFzZTY0VG9BcnJheUJ1ZmZlcihwYWRkZWQpKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVtb3RlRGVsZXRpb25QYXRoVG9WYXVsdFBhdGgocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgdGhpcy5lbnN1cmVTdXBwb3J0TW9kdWxlcygpO1xuICAgIHJldHVybiB0aGlzLnN5bmNTdXBwb3J0LnJlbW90ZURlbGV0aW9uUGF0aFRvVmF1bHRQYXRoKHJlbW90ZVBhdGgpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB3cml0ZURlbGV0aW9uVG9tYnN0b25lKHZhdWx0UGF0aDogc3RyaW5nLCByZW1vdGVTaWduYXR1cmU/OiBzdHJpbmcpIHtcbiAgICBjb25zdCBwYXlsb2FkOiBEZWxldGlvblRvbWJzdG9uZSA9IHtcbiAgICAgIHBhdGg6IHZhdWx0UGF0aCxcbiAgICAgIGRlbGV0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICAgIHJlbW90ZVNpZ25hdHVyZSxcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KFxuICAgICAgdGhpcy5idWlsZERlbGV0aW9uUmVtb3RlUGF0aCh2YXVsdFBhdGgpLFxuICAgICAgdGhpcy5lbmNvZGVVdGY4KEpTT04uc3RyaW5naWZ5KHBheWxvYWQpKSxcbiAgICAgIFwiYXBwbGljYXRpb24vanNvbjsgY2hhcnNldD11dGYtOFwiLFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlQ29udGVudEZpbGUodGhpcy5idWlsZERlbGV0aW9uUmVtb3RlUGF0aCh2YXVsdFBhdGgpKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIFRvbWJzdG9uZSBjbGVhbnVwIHNob3VsZCBub3QgYnJlYWsgdGhlIG1haW4gc3luYyBmbG93LlxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVhZERlbGV0aW9uVG9tYnN0b25lKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHRoaXMuYnVpbGREZWxldGlvblJlbW90ZVBhdGgodmF1bHRQYXRoKSksXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gNDA0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgR0VUIHRvbWJzdG9uZSBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMucGFyc2VEZWxldGlvblRvbWJzdG9uZVBheWxvYWQodGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKSk7XG4gIH1cblxuICBwcml2YXRlIHBhcnNlRGVsZXRpb25Ub21ic3RvbmVQYXlsb2FkKHJhdzogc3RyaW5nKTogRGVsZXRpb25Ub21ic3RvbmUgfCBudWxsIHtcbiAgICB0aGlzLmVuc3VyZVN1cHBvcnRNb2R1bGVzKCk7XG4gICAgcmV0dXJuIHRoaXMuc3luY1N1cHBvcnQucGFyc2VEZWxldGlvblRvbWJzdG9uZVBheWxvYWQocmF3KTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVhZERlbGV0aW9uVG9tYnN0b25lcygpIHtcbiAgICBjb25zdCB0b21ic3RvbmVzID0gbmV3IE1hcDxzdHJpbmcsIERlbGV0aW9uVG9tYnN0b25lPigpO1xuICAgIGNvbnN0IGludmVudG9yeSA9IGF3YWl0IHRoaXMubGlzdFJlbW90ZVRyZWUodGhpcy5idWlsZERlbGV0aW9uRm9sZGVyKCkpO1xuICAgIGZvciAoY29uc3QgcmVtb3RlIG9mIGludmVudG9yeS5maWxlcy52YWx1ZXMoKSkge1xuICAgICAgY29uc3QgdmF1bHRQYXRoID0gdGhpcy5yZW1vdGVEZWxldGlvblBhdGhUb1ZhdWx0UGF0aChyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICBpZiAoIXZhdWx0UGF0aCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlLnJlbW90ZVBhdGgpLFxuICAgICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRvbWJzdG9uZSA9IHRoaXMucGFyc2VEZWxldGlvblRvbWJzdG9uZVBheWxvYWQodGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKSk7XG4gICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgIHRvbWJzdG9uZXMuc2V0KHZhdWx0UGF0aCwgdG9tYnN0b25lKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdG9tYnN0b25lcztcbiAgfVxuXG4gIHByaXZhdGUgcmVtb3RlUGF0aFRvVmF1bHRQYXRoKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIHRoaXMuZW5zdXJlU3VwcG9ydE1vZHVsZXMoKTtcbiAgICByZXR1cm4gdGhpcy5zeW5jU3VwcG9ydC5yZW1vdGVQYXRoVG9WYXVsdFBhdGgocmVtb3RlUGF0aCk7XG4gIH1cblxuICBwcml2YXRlIHNob3VsZERvd25sb2FkUmVtb3RlVmVyc2lvbihsb2NhbE10aW1lOiBudW1iZXIsIHJlbW90ZU10aW1lOiBudW1iZXIpIHtcbiAgICB0aGlzLmVuc3VyZVN1cHBvcnRNb2R1bGVzKCk7XG4gICAgcmV0dXJuIHRoaXMuc3luY1N1cHBvcnQuc2hvdWxkRG93bmxvYWRSZW1vdGVWZXJzaW9uKGxvY2FsTXRpbWUsIHJlbW90ZU10aW1lKTtcbiAgfVxuXG4gIHByaXZhdGUgaXNUb21ic3RvbmVBdXRob3JpdGF0aXZlKFxuICAgIHRvbWJzdG9uZTogRGVsZXRpb25Ub21ic3RvbmUsXG4gICAgcmVtb3RlPzogUGljazxSZW1vdGVGaWxlU3RhdGUsIFwibGFzdE1vZGlmaWVkXCIgfCBcInNpZ25hdHVyZVwiPiB8IG51bGwsXG4gICkge1xuICAgIHRoaXMuZW5zdXJlU3VwcG9ydE1vZHVsZXMoKTtcbiAgICByZXR1cm4gdGhpcy5zeW5jU3VwcG9ydC5pc1RvbWJzdG9uZUF1dGhvcml0YXRpdmUodG9tYnN0b25lLCByZW1vdGUpO1xuICB9XG5cbiAgcHJpdmF0ZSBzaG91bGREZWxldGVMb2NhbEZyb21Ub21ic3RvbmUoZmlsZTogVEZpbGUsIHRvbWJzdG9uZTogRGVsZXRpb25Ub21ic3RvbmUpIHtcbiAgICB0aGlzLmVuc3VyZVN1cHBvcnRNb2R1bGVzKCk7XG4gICAgcmV0dXJuIHRoaXMuc3luY1N1cHBvcnQuc2hvdWxkRGVsZXRlTG9jYWxGcm9tVG9tYnN0b25lKGZpbGUsIHRvbWJzdG9uZSk7XG4gIH1cblxuICBwcml2YXRlIGdldFZhdWx0RmlsZUJ5UGF0aChwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHBhdGgpO1xuICAgIHJldHVybiBmaWxlIGluc3RhbmNlb2YgVEZpbGUgPyBmaWxlIDogbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVtb3ZlTG9jYWxWYXVsdEZpbGUoZmlsZTogVEZpbGUpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuZGVsZXRlKGZpbGUsIHRydWUpO1xuICAgIH0gY2F0Y2ggKGRlbGV0ZUVycm9yKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC50cmFzaChmaWxlLCB0cnVlKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICB0aHJvdyBkZWxldGVFcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGVuc3VyZUxvY2FsUGFyZW50Rm9sZGVycyhwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGF0aChwYXRoKTtcbiAgICBjb25zdCBzZWdtZW50cyA9IG5vcm1hbGl6ZWQuc3BsaXQoXCIvXCIpLmZpbHRlcigodmFsdWUpID0+IHZhbHVlLmxlbmd0aCA+IDApO1xuICAgIGlmIChzZWdtZW50cy5sZW5ndGggPD0gMSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBjdXJyZW50ID0gXCJcIjtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgc2VnbWVudHMubGVuZ3RoIC0gMTsgaW5kZXggKz0gMSkge1xuICAgICAgY3VycmVudCA9IGN1cnJlbnQgPyBgJHtjdXJyZW50fS8ke3NlZ21lbnRzW2luZGV4XX1gIDogc2VnbWVudHNbaW5kZXhdO1xuICAgICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoY3VycmVudCk7XG4gICAgICBpZiAoIWV4aXN0aW5nKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZUZvbGRlcihjdXJyZW50KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQodmF1bHRQYXRoOiBzdHJpbmcsIHJlbW90ZTogUmVtb3RlRmlsZVN0YXRlLCBleGlzdGluZ0ZpbGU/OiBURmlsZSkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGUucmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEdFVCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5lbnN1cmVMb2NhbFBhcmVudEZvbGRlcnModmF1bHRQYXRoKTtcbiAgICBjb25zdCBjdXJyZW50ID0gZXhpc3RpbmdGaWxlID8/IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKHZhdWx0UGF0aCk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgIG10aW1lOiByZW1vdGUubGFzdE1vZGlmaWVkID4gMCA/IHJlbW90ZS5sYXN0TW9kaWZpZWQgOiBEYXRlLm5vdygpLFxuICAgIH07XG4gICAgaWYgKCFjdXJyZW50KSB7XG4gICAgICBpZiAodmF1bHRQYXRoLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoXCIubWRcIikpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKHZhdWx0UGF0aCwgdGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKSwgb3B0aW9ucyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVCaW5hcnkodmF1bHRQYXRoLCByZXNwb25zZS5hcnJheUJ1ZmZlciwgb3B0aW9ucyk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGN1cnJlbnQuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShjdXJyZW50LCB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpLCBvcHRpb25zKTtcbiAgICB9IGVsc2Uge1xuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5QmluYXJ5KGN1cnJlbnQsIHJlc3BvbnNlLmFycmF5QnVmZmVyLCBvcHRpb25zKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHZlcmlmeVJlbW90ZUJpbmFyeVJvdW5kVHJpcChyZW1vdGVQYXRoOiBzdHJpbmcsIGV4cGVjdGVkOiBBcnJheUJ1ZmZlcikge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5hcnJheUJ1ZmZlcnNFcXVhbChleHBlY3RlZCwgcmVzcG9uc2UuYXJyYXlCdWZmZXIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzdGF0UmVtb3RlRmlsZShyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiUFJPUEZJTkRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgRGVwdGg6IFwiMFwiLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDQwNCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFBST1BGSU5EIGZhaWxlZCBmb3IgJHtyZW1vdGVQYXRofSB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG5cbiAgICBjb25zdCB4bWxUZXh0ID0gdGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKTtcbiAgICBjb25zdCBlbnRyaWVzID0gdGhpcy5wYXJzZVByb3BmaW5kRGlyZWN0b3J5TGlzdGluZyh4bWxUZXh0LCByZW1vdGVQYXRoLCB0cnVlKTtcbiAgICByZXR1cm4gZW50cmllcy5maW5kKChlbnRyeSkgPT4gIWVudHJ5LmlzQ29sbGVjdGlvbik/LmZpbGUgPz8gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlOiBURmlsZSwgcmVtb3RlUGF0aDogc3RyaW5nLCBtYXJrZG93bkNvbnRlbnQ/OiBzdHJpbmcpIHtcbiAgICBsZXQgYmluYXJ5OiBBcnJheUJ1ZmZlcjtcblxuICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICBjb25zdCBjb250ZW50ID0gbWFya2Rvd25Db250ZW50ID8/IChhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSkpO1xuICAgICAgaWYgKHRoaXMucGFyc2VOb3RlU3R1Yihjb250ZW50KSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgXCJcdTYyRDJcdTdFRERcdTYyOEFcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTUzNjBcdTRGNERcdTdCMTRcdThCQjBcdTRFMEFcdTRGMjBcdTRFM0FcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTMwMDJcIixcbiAgICAgICAgICAgIFwiUmVmdXNpbmcgdG8gdXBsb2FkIGEgbGF6eS1ub3RlIHBsYWNlaG9sZGVyIGFzIHJlbW90ZSBub3RlIGNvbnRlbnQuXCIsXG4gICAgICAgICAgKSxcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgYmluYXJ5ID0gdGhpcy5lbmNvZGVVdGY4KGNvbnRlbnQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBiaW5hcnkgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KHJlbW90ZVBhdGgsIGJpbmFyeSwgdGhpcy5nZXRNaW1lVHlwZShmaWxlLmV4dGVuc2lvbikpO1xuICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuc3RhdFJlbW90ZUZpbGUocmVtb3RlUGF0aCk7XG4gICAgaWYgKHJlbW90ZSkge1xuICAgICAgcmV0dXJuIHJlbW90ZTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIGxhc3RNb2RpZmllZDogZmlsZS5zdGF0Lm10aW1lLFxuICAgICAgc2l6ZTogZmlsZS5zdGF0LnNpemUsXG4gICAgICBzaWduYXR1cmU6IHRoaXMuYnVpbGRTeW5jU2lnbmF0dXJlKGZpbGUpLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZVJlbW90ZVN5bmNlZEVudHJ5KHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLnN5bmNJbmRleC5nZXQodmF1bHRQYXRoKTtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gZXhpc3Rpbmc/LnJlbW90ZVBhdGggPz8gdGhpcy5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgodmF1bHRQYXRoKTtcbiAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZVBhdGgpO1xuICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZSh2YXVsdFBhdGgpO1xuICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUZpbGVPcGVuKGZpbGU6IFRGaWxlIHwgbnVsbCkge1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkgfHwgZmlsZS5leHRlbnNpb24gIT09IFwibWRcIikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMuc2V0KGZpbGUucGF0aCwgRGF0ZS5ub3coKSk7XG4gICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcblxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IHN0dWIgPSB0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCk7XG4gICAgaWYgKCFzdHViKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuc3RhdFJlbW90ZUZpbGUoc3R1Yi5yZW1vdGVQYXRoKTtcbiAgICAgIGlmICghcmVtb3RlKSB7XG4gICAgICAgIGNvbnN0IHRvbWJzdG9uZSA9IGF3YWl0IHRoaXMucmVhZERlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCk7XG4gICAgICAgIGlmICh0b21ic3RvbmUpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLnJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGUpO1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgICAgIHRoaXMuY2xlYXJNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgICAgIHRoaXMudChcbiAgICAgICAgICAgICAgYFx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1NEUwRFx1NUI1OFx1NTcyOFx1RkYwQ1x1NURGMlx1NzlGQlx1OTY2NFx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgICAgICAgICBgUmVtb3RlIG5vdGUgbWlzc2luZywgcmVtb3ZlZCBsb2NhbCBwbGFjZWhvbGRlcjogJHtmaWxlLmJhc2VuYW1lfWAsXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgNjAwMCxcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IG1pc3NpbmdSZWNvcmQgPSB0aGlzLm1hcmtNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgICBpZiAobWlzc2luZ1JlY29yZC5taXNzQ291bnQgPj0gdGhpcy5taXNzaW5nTGF6eVJlbW90ZUNvbmZpcm1hdGlvbnMpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLnJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGUpO1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgICAgIHRoaXMuY2xlYXJNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgICAgIHRoaXMudChcbiAgICAgICAgICAgICAgYFx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1OEZERVx1N0VFRFx1N0YzQVx1NTkzMVx1RkYwQ1x1NURGMlx1NzlGQlx1OTY2NFx1NjcyQ1x1NTczMFx1NTkzMVx1NjU0OFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgICAgICAgICBgUmVtb3RlIG5vdGUgd2FzIG1pc3NpbmcgcmVwZWF0ZWRseSwgcmVtb3ZlZCBsb2NhbCBicm9rZW4gcGxhY2Vob2xkZXI6ICR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIDgwMDAsXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1NEUwRFx1NUI1OFx1NTcyOFx1RkYwQ1x1NUY1M1x1NTI0RFx1NTE0OFx1NEZERFx1NzU1OVx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMFx1NEVFNVx1OTYzMlx1NEUzNFx1NjVGNlx1NUYwMlx1NUUzOFx1RkYxQlx1ODJFNVx1NTE4RFx1NkIyMVx1Nzg2RVx1OEJBNFx1N0YzQVx1NTkzMVx1RkYwQ1x1NUMwNlx1ODFFQVx1NTJBOFx1NkUwNVx1NzQwNlx1OEJFNVx1NTM2MFx1NEY0RFx1MzAwMlwiLCBcIlJlbW90ZSBub3RlIGlzIG1pc3NpbmcuIFRoZSBsb2NhbCBwbGFjZWhvbGRlciB3YXMga2VwdCBmb3Igbm93IGluIGNhc2UgdGhpcyBpcyB0cmFuc2llbnQ7IGl0IHdpbGwgYmUgY2xlYW5lZCBhdXRvbWF0aWNhbGx5IGlmIHRoZSByZW1vdGUgaXMgc3RpbGwgbWlzc2luZyBvbiB0aGUgbmV4dCBjb25maXJtYXRpb24uXCIpLCA4MDAwKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmNsZWFyTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICAgIGF3YWl0IHRoaXMuZG93bmxvYWRSZW1vdGVGaWxlVG9WYXVsdChmaWxlLnBhdGgsIHJlbW90ZSwgZmlsZSk7XG4gICAgICBjb25zdCByZWZyZXNoZWQgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChmaWxlLnBhdGgpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVmcmVzaGVkID8gdGhpcy5idWlsZFN5bmNTaWduYXR1cmUocmVmcmVzaGVkKSA6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlUGF0aDogc3R1Yi5yZW1vdGVQYXRoLFxuICAgICAgfSk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLnQoYFx1NURGMlx1NEVDRVx1OEZEQ1x1N0FFRlx1NjA2Mlx1NTkwRFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gLCBgUmVzdG9yZWQgbm90ZSBmcm9tIHJlbW90ZTogJHtmaWxlLmJhc2VuYW1lfWApLCA2MDAwKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBoeWRyYXRlIG5vdGUgZnJvbSByZW1vdGVcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU4RkRDXHU3QUVGXHU2MDYyXHU1OTBEXHU3QjE0XHU4QkIwXHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIHJlc3RvcmUgbm90ZSBmcm9tIHJlbW90ZVwiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHNob3VsZFNraXBDb250ZW50U3luY1BhdGgocGF0aDogc3RyaW5nKSB7XG4gICAgdGhpcy5lbnN1cmVTdXBwb3J0TW9kdWxlcygpO1xuICAgIHJldHVybiB0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgocGF0aCk7XG4gIH1cblxuICBwcml2YXRlIGNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpIHtcbiAgICB0aGlzLmVuc3VyZVN1cHBvcnRNb2R1bGVzKCk7XG4gICAgcmV0dXJuIHRoaXMuc3luY1N1cHBvcnQuY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCk7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkU3luY1NpZ25hdHVyZShmaWxlOiBURmlsZSkge1xuICAgIHRoaXMuZW5zdXJlU3VwcG9ydE1vZHVsZXMoKTtcbiAgICByZXR1cm4gdGhpcy5zeW5jU3VwcG9ydC5idWlsZFN5bmNTaWduYXR1cmUoZmlsZSk7XG4gIH1cblxuICBwcml2YXRlIGdldE9wZW5NYXJrZG93bkNvbnRlbnQobm90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IGxlYXZlcyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoXCJtYXJrZG93blwiKTtcbiAgICBmb3IgKGNvbnN0IGxlYWYgb2YgbGVhdmVzKSB7XG4gICAgICBjb25zdCB2aWV3ID0gbGVhZi52aWV3O1xuICAgICAgaWYgKCEodmlldyBpbnN0YW5jZW9mIE1hcmtkb3duVmlldykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghdmlldy5maWxlIHx8IHZpZXcuZmlsZS5wYXRoICE9PSBub3RlUGF0aCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHZpZXcuZWRpdG9yLmdldFZhbHVlKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZTogVEZpbGUpIHtcbiAgICBjb25zdCBsaXZlQ29udGVudCA9IHRoaXMuZ2V0T3Blbk1hcmtkb3duQ29udGVudChmaWxlLnBhdGgpO1xuICAgIGlmIChsaXZlQ29udGVudCAhPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGxpdmVDb250ZW50O1xuICAgIH1cblxuICAgIHJldHVybiBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBidWlsZEN1cnJlbnRMb2NhbFNpZ25hdHVyZShmaWxlOiBURmlsZSwgbWFya2Rvd25Db250ZW50Pzogc3RyaW5nKSB7XG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHtcbiAgICAgIHJldHVybiB0aGlzLmJ1aWxkU3luY1NpZ25hdHVyZShmaWxlKTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50ID0gbWFya2Rvd25Db250ZW50ID8/IChhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSkpO1xuICAgIGNvbnN0IGRpZ2VzdCA9IChhd2FpdCB0aGlzLmNvbXB1dGVTaGEyNTZIZXgodGhpcy5lbmNvZGVVdGY4KGNvbnRlbnQpKSkuc2xpY2UoMCwgMTYpO1xuICAgIHJldHVybiBgbWQ6JHtjb250ZW50Lmxlbmd0aH06JHtkaWdlc3R9YDtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgdGhpcy5lbnN1cmVTdXBwb3J0TW9kdWxlcygpO1xuICAgIHJldHVybiB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aCh2YXVsdFBhdGgpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWNvbmNpbGVSZW1vdGVJbWFnZXMoKSB7XG4gICAgcmV0dXJuIHsgZGVsZXRlZEZpbGVzOiAwLCBkZWxldGVkRGlyZWN0b3JpZXM6IDAgfTtcbiAgfVxuXG4gIHByaXZhdGUgbWFya01pc3NpbmdMYXp5UmVtb3RlKHBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gICAgY29uc3QgcHJldmlvdXMgPSB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMuZ2V0KHBhdGgpO1xuICAgIGNvbnN0IG5leHQ6IE1pc3NpbmdMYXp5UmVtb3RlUmVjb3JkID0gcHJldmlvdXNcbiAgICAgID8ge1xuICAgICAgICAgIGZpcnN0RGV0ZWN0ZWRBdDogcHJldmlvdXMuZmlyc3REZXRlY3RlZEF0LFxuICAgICAgICAgIGxhc3REZXRlY3RlZEF0OiBub3csXG4gICAgICAgICAgbWlzc0NvdW50OiBwcmV2aW91cy5taXNzQ291bnQgKyAxLFxuICAgICAgICB9XG4gICAgICA6IHtcbiAgICAgICAgICBmaXJzdERldGVjdGVkQXQ6IG5vdyxcbiAgICAgICAgICBsYXN0RGV0ZWN0ZWRBdDogbm93LFxuICAgICAgICAgIG1pc3NDb3VudDogMSxcbiAgICAgICAgfTtcbiAgICB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMuc2V0KHBhdGgsIG5leHQpO1xuICAgIHJldHVybiBuZXh0O1xuICB9XG5cbiAgcHJpdmF0ZSBjbGVhck1pc3NpbmdMYXp5UmVtb3RlKHBhdGg6IHN0cmluZykge1xuICAgIHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3Rlcy5kZWxldGUocGF0aCk7XG4gIH1cblxuICBwcml2YXRlIHBhcnNlTm90ZVN0dWIoY29udGVudDogc3RyaW5nKSB7XG4gICAgY29uc3QgbWF0Y2ggPSBjb250ZW50Lm1hdGNoKFxuICAgICAgL148IS0tXFxzKnNlY3VyZS13ZWJkYXYtbm90ZS1zdHViXFxzKlxccj9cXG5yZW1vdGU6XFxzKiguKz8pXFxyP1xcbnBsYWNlaG9sZGVyOlxccyooLio/KVxccj9cXG4tLT4vcyxcbiAgICApO1xuICAgIGlmICghbWF0Y2gpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICByZW1vdGVQYXRoOiBtYXRjaFsxXS50cmltKCksXG4gICAgICBwbGFjZWhvbGRlcjogbWF0Y2hbMl0udHJpbSgpLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkTm90ZVN0dWIoZmlsZTogVEZpbGUpIHtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgoZmlsZS5wYXRoKTtcbiAgICByZXR1cm4gW1xuICAgICAgYDwhLS0gJHtTRUNVUkVfTk9URV9TVFVCfWAsXG4gICAgICBgcmVtb3RlOiAke3JlbW90ZVBhdGh9YCxcbiAgICAgIGBwbGFjZWhvbGRlcjogJHtmaWxlLmJhc2VuYW1lfWAsXG4gICAgICBcIi0tPlwiLFxuICAgICAgXCJcIixcbiAgICAgIHRoaXMudChcbiAgICAgICAgYFx1OEZEOVx1NjYyRlx1NEUwMFx1N0JDN1x1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFx1NzY4NFx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1NjU4N1x1NEVGNlx1MzAwMlx1NjI1M1x1NUYwMFx1OEZEOVx1N0JDN1x1N0IxNFx1OEJCMFx1NjVGNlx1RkYwQ1x1NjNEMlx1NEVGNlx1NEYxQVx1NEVDRVx1OEZEQ1x1N0FFRlx1NTQwQ1x1NkI2NVx1NzZFRVx1NUY1NVx1NjA2Mlx1NTkwRFx1NUI4Q1x1NjU3NFx1NTE4NVx1NUJCOVx1MzAwMmAsXG4gICAgICAgIGBUaGlzIGlzIGEgbG9jYWwgcGxhY2Vob2xkZXIgZm9yIGFuIG9uLWRlbWFuZCBub3RlLiBPcGVuaW5nIHRoZSBub3RlIHJlc3RvcmVzIHRoZSBmdWxsIGNvbnRlbnQgZnJvbSB0aGUgcmVtb3RlIHN5bmMgZm9sZGVyLmAsXG4gICAgICApLFxuICAgIF0uam9pbihcIlxcblwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZXZpY3RTdGFsZVN5bmNlZE5vdGVzKHNob3dOb3RpY2U6IGJvb2xlYW4pIHtcbiAgICB0cnkge1xuICAgICAgaWYgKHRoaXMuc2V0dGluZ3Mubm90ZVN0b3JhZ2VNb2RlICE9PSBcImxhenktbm90ZXNcIikge1xuICAgICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1RjUzXHU1MjREXHU2NzJBXHU1NDJGXHU3NTI4XHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXHU2QTIxXHU1RjBGXHUzMDAyXCIsIFwiTGF6eSBub3RlIG1vZGUgaXMgbm90IGVuYWJsZWQuXCIpLCA2MDAwKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZmlsZXMgPSB0aGlzLmNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpLmZpbHRlcigoZmlsZSkgPT4gZmlsZS5leHRlbnNpb24gPT09IFwibWRcIik7XG4gICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgICAgY29uc3QgdGhyZXNob2xkID0gTWF0aC5tYXgoMSwgdGhpcy5zZXR0aW5ncy5ub3RlRXZpY3RBZnRlckRheXMpICogMjQgKiA2MCAqIDYwICogMTAwMDtcbiAgICAgIGxldCBldmljdGVkID0gMDtcblxuICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICAgIGNvbnN0IGFjdGl2ZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgICAgIGlmIChhY3RpdmU/LnBhdGggPT09IGZpbGUucGF0aCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbGFzdEFjY2VzcyA9IHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMuZ2V0KGZpbGUucGF0aCkgPz8gMDtcbiAgICAgICAgaWYgKGxhc3RBY2Nlc3MgIT09IDAgJiYgbm93IC0gbGFzdEFjY2VzcyA8IHRocmVzaG9sZCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICAgIGlmICh0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCkpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGJpbmFyeSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWRCaW5hcnkoZmlsZSk7XG4gICAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aChmaWxlLnBhdGgpO1xuICAgICAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBiaW5hcnksIFwidGV4dC9tYXJrZG93bjsgY2hhcnNldD11dGYtOFwiKTtcbiAgICAgICAgY29uc3QgdmVyaWZpZWQgPSBhd2FpdCB0aGlzLnZlcmlmeVJlbW90ZUJpbmFyeVJvdW5kVHJpcChyZW1vdGVQYXRoLCBiaW5hcnkpO1xuICAgICAgICBpZiAoIXZlcmlmaWVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1NjgyMVx1OUE4Q1x1NTkzMVx1OEQyNVx1RkYwQ1x1NURGMlx1NTNENlx1NkQ4OFx1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1MzAwMlwiLCBcIlJlbW90ZSBub3RlIHZlcmlmaWNhdGlvbiBmYWlsZWQsIGxvY2FsIG5vdGUgZXZpY3Rpb24gd2FzIGNhbmNlbGxlZC5cIikpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuc3RhdFJlbW90ZUZpbGUocmVtb3RlUGF0aCk7XG4gICAgICAgIGlmICghcmVtb3RlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1NTE0M1x1NjU3MFx1NjM2RVx1N0YzQVx1NTkzMVx1RkYwQ1x1NURGMlx1NTNENlx1NkQ4OFx1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1MzAwMlwiLCBcIlJlbW90ZSBub3RlIG1ldGFkYXRhIGlzIG1pc3NpbmcsIGxvY2FsIG5vdGUgZXZpY3Rpb24gd2FzIGNhbmNlbGxlZC5cIikpO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB0aGlzLmJ1aWxkTm90ZVN0dWIoZmlsZSkpO1xuICAgICAgICBjb25zdCByZWZyZXNoZWQgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChmaWxlLnBhdGgpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IHRoaXMuYnVpbGRTeW5jU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiB0aGlzLmJ1aWxkU3luY1NpZ25hdHVyZShmaWxlKSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHJlbW90ZT8uc2lnbmF0dXJlID8/IGAke2ZpbGUuc3RhdC5tdGltZX06JHtiaW5hcnkuYnl0ZUxlbmd0aH1gLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICBldmljdGVkICs9IDE7XG4gICAgICB9XG5cbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgYFx1NURGMlx1NTZERVx1NjUzNiAke2V2aWN0ZWR9IFx1N0JDN1x1OTU3Rlx1NjcxRlx1NjcyQVx1OEJCRlx1OTVFRVx1NzY4NFx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1MzAwMmAsXG4gICAgICAgICAgICBgRXZpY3RlZCAke2V2aWN0ZWR9IHN0YWxlIGxvY2FsIG5vdGUocykuYCxcbiAgICAgICAgICApLFxuICAgICAgICAgIDgwMDAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgcmV0dXJuIGV2aWN0ZWQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZXZpY3Qgc3RhbGUgc3luY2VkIG5vdGVzXCIsIGVycm9yKTtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1NTkzMVx1OEQyNVwiLCBcIkZhaWxlZCB0byBldmljdCBsb2NhbCBub3Rlc1wiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZW5zdXJlUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcGFydHMgPSByZW1vdGVQYXRoLnNwbGl0KFwiL1wiKS5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPiAwKTtcbiAgICBpZiAocGFydHMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgY3VycmVudCA9IFwiXCI7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHBhcnRzLmxlbmd0aCAtIDE7IGluZGV4ICs9IDEpIHtcbiAgICAgIGN1cnJlbnQgPSBjdXJyZW50ID8gYCR7Y3VycmVudH0vJHtwYXJ0c1tpbmRleF19YCA6IHBhcnRzW2luZGV4XTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKGN1cnJlbnQpLFxuICAgICAgICBtZXRob2Q6IFwiTUtDT0xcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgaWYgKCFbMjAwLCAyMDEsIDIwNCwgMjA3LCAzMDEsIDMwMiwgMzA3LCAzMDgsIDQwNV0uaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1LQ09MIGZhaWxlZCBmb3IgJHtjdXJyZW50fSB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGxpc3RSZW1vdGVUcmVlKHJvb3RGb2xkZXI6IHN0cmluZyk6IFByb21pc2U8UmVtb3RlSW52ZW50b3J5PiB7XG4gICAgY29uc3QgZmlsZXMgPSBuZXcgTWFwPHN0cmluZywgUmVtb3RlRmlsZVN0YXRlPigpO1xuICAgIGNvbnN0IGRpcmVjdG9yaWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgcGVuZGluZyA9IFt0aGlzLm5vcm1hbGl6ZUZvbGRlcihyb290Rm9sZGVyKV07XG4gICAgY29uc3QgdmlzaXRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG4gICAgd2hpbGUgKHBlbmRpbmcubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgY3VycmVudCA9IHRoaXMubm9ybWFsaXplRm9sZGVyKHBlbmRpbmcucG9wKCkgPz8gcm9vdEZvbGRlcik7XG4gICAgICBpZiAodmlzaXRlZC5oYXMoY3VycmVudCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHZpc2l0ZWQuYWRkKGN1cnJlbnQpO1xuICAgICAgY29uc3QgZW50cmllcyA9IGF3YWl0IHRoaXMubGlzdFJlbW90ZURpcmVjdG9yeShjdXJyZW50KTtcbiAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgICAgICBpZiAoZW50cnkuaXNDb2xsZWN0aW9uKSB7XG4gICAgICAgICAgZGlyZWN0b3JpZXMuYWRkKGVudHJ5LnJlbW90ZVBhdGgpO1xuICAgICAgICAgIHBlbmRpbmcucHVzaChlbnRyeS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlbnRyeS5maWxlKSB7XG4gICAgICAgICAgZmlsZXMuc2V0KGVudHJ5LnJlbW90ZVBhdGgsIGVudHJ5LmZpbGUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgZmlsZXMsIGRpcmVjdG9yaWVzIH07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGxpc3RSZW1vdGVEaXJlY3RvcnkocmVtb3RlRGlyZWN0b3J5OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXF1ZXN0ZWRQYXRoID0gdGhpcy5ub3JtYWxpemVGb2xkZXIocmVtb3RlRGlyZWN0b3J5KTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVxdWVzdGVkUGF0aCksXG4gICAgICBtZXRob2Q6IFwiUFJPUEZJTkRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgRGVwdGg6IFwiMVwiLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDQwNCkge1xuICAgICAgcmV0dXJuIFtdIGFzIEFycmF5PHsgcmVtb3RlUGF0aDogc3RyaW5nOyBpc0NvbGxlY3Rpb246IGJvb2xlYW47IGZpbGU/OiBSZW1vdGVGaWxlU3RhdGUgfT47XG4gICAgfVxuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFBST1BGSU5EIGZhaWxlZCBmb3IgJHtyZXF1ZXN0ZWRQYXRofSB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG5cbiAgICBjb25zdCB4bWxUZXh0ID0gdGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKTtcbiAgICByZXR1cm4gdGhpcy5wYXJzZVByb3BmaW5kRGlyZWN0b3J5TGlzdGluZyh4bWxUZXh0LCByZXF1ZXN0ZWRQYXRoKTtcbiAgfVxuXG4gIHByaXZhdGUgcGFyc2VQcm9wZmluZERpcmVjdG9yeUxpc3RpbmcoeG1sVGV4dDogc3RyaW5nLCByZXF1ZXN0ZWRQYXRoOiBzdHJpbmcsIGluY2x1ZGVSZXF1ZXN0ZWQgPSBmYWxzZSkge1xuICAgIGNvbnN0IHBhcnNlciA9IG5ldyBET01QYXJzZXIoKTtcbiAgICBjb25zdCBkb2N1bWVudCA9IHBhcnNlci5wYXJzZUZyb21TdHJpbmcoeG1sVGV4dCwgXCJhcHBsaWNhdGlvbi94bWxcIik7XG4gICAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwicGFyc2VyZXJyb3JcIikubGVuZ3RoID4gMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1NjVFMFx1NkNENVx1ODlFM1x1Njc5MCBXZWJEQVYgXHU3NkVFXHU1RjU1XHU2RTA1XHU1MzU1XHUzMDAyXCIsIFwiRmFpbGVkIHRvIHBhcnNlIHRoZSBXZWJEQVYgZGlyZWN0b3J5IGxpc3RpbmcuXCIpKTtcbiAgICB9XG5cbiAgICBjb25zdCBlbnRyaWVzID0gbmV3IE1hcDxzdHJpbmcsIHsgcmVtb3RlUGF0aDogc3RyaW5nOyBpc0NvbGxlY3Rpb246IGJvb2xlYW47IGZpbGU/OiBSZW1vdGVGaWxlU3RhdGUgfT4oKTtcbiAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgQXJyYXkuZnJvbShkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcIipcIikpKSB7XG4gICAgICBpZiAoZWxlbWVudC5sb2NhbE5hbWUgIT09IFwicmVzcG9uc2VcIikge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaHJlZiA9IHRoaXMuZ2V0WG1sTG9jYWxOYW1lVGV4dChlbGVtZW50LCBcImhyZWZcIik7XG4gICAgICBpZiAoIWhyZWYpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmhyZWZUb1JlbW90ZVBhdGgoaHJlZik7XG4gICAgICBpZiAoIXJlbW90ZVBhdGgpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGlzQ29sbGVjdGlvbiA9IHRoaXMueG1sVHJlZUhhc0xvY2FsTmFtZShlbGVtZW50LCBcImNvbGxlY3Rpb25cIik7XG4gICAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IGlzQ29sbGVjdGlvbiA/IHRoaXMubm9ybWFsaXplRm9sZGVyKHJlbW90ZVBhdGgpIDogcmVtb3RlUGF0aC5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpO1xuICAgICAgaWYgKFxuICAgICAgICAhaW5jbHVkZVJlcXVlc3RlZCAmJlxuICAgICAgICAoXG4gICAgICAgICAgbm9ybWFsaXplZFBhdGggPT09IHJlcXVlc3RlZFBhdGggfHxcbiAgICAgICAgICBub3JtYWxpemVkUGF0aCA9PT0gcmVxdWVzdGVkUGF0aC5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpXG4gICAgICAgIClcbiAgICAgICkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc2l6ZVRleHQgPSB0aGlzLmdldFhtbExvY2FsTmFtZVRleHQoZWxlbWVudCwgXCJnZXRjb250ZW50bGVuZ3RoXCIpO1xuICAgICAgY29uc3QgcGFyc2VkU2l6ZSA9IE51bWJlci5wYXJzZUludChzaXplVGV4dCwgMTApO1xuICAgICAgY29uc3Qgc2l6ZSA9IE51bWJlci5pc0Zpbml0ZShwYXJzZWRTaXplKSA/IHBhcnNlZFNpemUgOiAwO1xuICAgICAgY29uc3QgbW9kaWZpZWRUZXh0ID0gdGhpcy5nZXRYbWxMb2NhbE5hbWVUZXh0KGVsZW1lbnQsIFwiZ2V0bGFzdG1vZGlmaWVkXCIpO1xuICAgICAgY29uc3QgcGFyc2VkTXRpbWUgPSBEYXRlLnBhcnNlKG1vZGlmaWVkVGV4dCk7XG4gICAgICBjb25zdCBsYXN0TW9kaWZpZWQgPSBOdW1iZXIuaXNGaW5pdGUocGFyc2VkTXRpbWUpID8gcGFyc2VkTXRpbWUgOiAwO1xuXG4gICAgICBlbnRyaWVzLnNldChub3JtYWxpemVkUGF0aCwge1xuICAgICAgICByZW1vdGVQYXRoOiBub3JtYWxpemVkUGF0aCxcbiAgICAgICAgaXNDb2xsZWN0aW9uLFxuICAgICAgICBmaWxlOiBpc0NvbGxlY3Rpb25cbiAgICAgICAgICA/IHVuZGVmaW5lZFxuICAgICAgICAgIDoge1xuICAgICAgICAgICAgICByZW1vdGVQYXRoOiBub3JtYWxpemVkUGF0aCxcbiAgICAgICAgICAgICAgbGFzdE1vZGlmaWVkLFxuICAgICAgICAgICAgICBzaXplLFxuICAgICAgICAgICAgICBzaWduYXR1cmU6IHRoaXMuYnVpbGRSZW1vdGVTeW5jU2lnbmF0dXJlKHtcbiAgICAgICAgICAgICAgICBsYXN0TW9kaWZpZWQsXG4gICAgICAgICAgICAgICAgc2l6ZSxcbiAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIFsuLi5lbnRyaWVzLnZhbHVlcygpXTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0WG1sTG9jYWxOYW1lVGV4dChwYXJlbnQ6IEVsZW1lbnQsIGxvY2FsTmFtZTogc3RyaW5nKSB7XG4gICAgZm9yIChjb25zdCBlbGVtZW50IG9mIEFycmF5LmZyb20ocGFyZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiKlwiKSkpIHtcbiAgICAgIGlmIChlbGVtZW50LmxvY2FsTmFtZSA9PT0gbG9jYWxOYW1lKSB7XG4gICAgICAgIHJldHVybiBlbGVtZW50LnRleHRDb250ZW50Py50cmltKCkgPz8gXCJcIjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuXG4gIHByaXZhdGUgeG1sVHJlZUhhc0xvY2FsTmFtZShwYXJlbnQ6IEVsZW1lbnQsIGxvY2FsTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20ocGFyZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiKlwiKSkuc29tZSgoZWxlbWVudCkgPT4gZWxlbWVudC5sb2NhbE5hbWUgPT09IGxvY2FsTmFtZSk7XG4gIH1cblxuICBwcml2YXRlIGhyZWZUb1JlbW90ZVBhdGgoaHJlZjogc3RyaW5nKSB7XG4gICAgY29uc3QgYmFzZVVybCA9IGAke3RoaXMuc2V0dGluZ3Mud2ViZGF2VXJsLnJlcGxhY2UoL1xcLyskLywgXCJcIil9L2A7XG4gICAgY29uc3QgcmVzb2x2ZWQgPSBuZXcgVVJMKGhyZWYsIGJhc2VVcmwpO1xuICAgIGNvbnN0IGJhc2VQYXRoID0gbmV3IFVSTChiYXNlVXJsKS5wYXRobmFtZS5yZXBsYWNlKC9cXC8rJC8sIFwiL1wiKTtcbiAgICBjb25zdCBkZWNvZGVkUGF0aCA9IHRoaXMuZGVjb2RlUGF0aG5hbWUocmVzb2x2ZWQucGF0aG5hbWUpO1xuICAgIGlmICghZGVjb2RlZFBhdGguc3RhcnRzV2l0aChiYXNlUGF0aCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiBkZWNvZGVkUGF0aC5zbGljZShiYXNlUGF0aC5sZW5ndGgpLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG4gIH1cblxuICBwcml2YXRlIGRlY29kZVBhdGhuYW1lKHBhdGhuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gcGF0aG5hbWVcbiAgICAgIC5zcGxpdChcIi9cIilcbiAgICAgIC5tYXAoKHNlZ21lbnQpID0+IHtcbiAgICAgICAgaWYgKCFzZWdtZW50KSB7XG4gICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoc2VnbWVudCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIHJldHVybiBzZWdtZW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmpvaW4oXCIvXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZEV4cGVjdGVkUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlRmlsZVBhdGhzOiBTZXQ8c3RyaW5nPiwgcm9vdEZvbGRlcjogc3RyaW5nKSB7XG4gICAgY29uc3QgZXhwZWN0ZWQgPSBuZXcgU2V0PHN0cmluZz4oW3RoaXMubm9ybWFsaXplRm9sZGVyKHJvb3RGb2xkZXIpXSk7XG4gICAgZm9yIChjb25zdCByZW1vdGVQYXRoIG9mIHJlbW90ZUZpbGVQYXRocykge1xuICAgICAgY29uc3QgcGFydHMgPSByZW1vdGVQYXRoLnNwbGl0KFwiL1wiKS5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPiAwKTtcbiAgICAgIGxldCBjdXJyZW50ID0gXCJcIjtcbiAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBwYXJ0cy5sZW5ndGggLSAxOyBpbmRleCArPSAxKSB7XG4gICAgICAgIGN1cnJlbnQgPSBjdXJyZW50ID8gYCR7Y3VycmVudH0vJHtwYXJ0c1tpbmRleF19YCA6IHBhcnRzW2luZGV4XTtcbiAgICAgICAgZXhwZWN0ZWQuYWRkKHRoaXMubm9ybWFsaXplRm9sZGVyKGN1cnJlbnQpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZXhwZWN0ZWQ7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZUV4dHJhUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlRGlyZWN0b3JpZXM6IFNldDxzdHJpbmc+LCBleHBlY3RlZERpcmVjdG9yaWVzOiBTZXQ8c3RyaW5nPikge1xuICAgIGxldCBkZWxldGVkID0gMDtcbiAgICBjb25zdCBjYW5kaWRhdGVzID0gWy4uLnJlbW90ZURpcmVjdG9yaWVzXVxuICAgICAgLmZpbHRlcigocmVtb3RlUGF0aCkgPT4gIWV4cGVjdGVkRGlyZWN0b3JpZXMuaGFzKHJlbW90ZVBhdGgpKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGIubGVuZ3RoIC0gYS5sZW5ndGggfHwgYi5sb2NhbGVDb21wYXJlKGEpKTtcblxuICAgIGZvciAoY29uc3QgcmVtb3RlUGF0aCBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAoWzIwMCwgMjAyLCAyMDQsIDQwNF0uaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzKSkge1xuICAgICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSA0MDQpIHtcbiAgICAgICAgICBkZWxldGVkICs9IDE7XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChbNDA1LCA0MDldLmluY2x1ZGVzKHJlc3BvbnNlLnN0YXR1cykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHRocm93IG5ldyBFcnJvcihgREVMRVRFIGRpcmVjdG9yeSBmYWlsZWQgZm9yICR7cmVtb3RlUGF0aH0gd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlbGV0ZWQ7XG4gIH1cblxyXG4gIHByaXZhdGUgYXN5bmMgcHJvY2Vzc1BlbmRpbmdUYXNrcygpIHtcbiAgICB0aGlzLmVuc3VyZVN1cHBvcnRNb2R1bGVzKCk7XG4gICAgYXdhaXQgdGhpcy51cGxvYWRRdWV1ZS5wcm9jZXNzUGVuZGluZ1Rhc2tzKCk7XG4gIH1cblxuICBwcml2YXRlIHRyYWNrVmF1bHRNdXRhdGlvbihvcGVyYXRpb246ICgpID0+IFByb21pc2U8dm9pZD4pIHtcbiAgICBjb25zdCBwcm9taXNlID0gb3BlcmF0aW9uKClcbiAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIlNlY3VyZSBXZWJEQVYgdmF1bHQgbXV0YXRpb24gaGFuZGxpbmcgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIH0pXG4gICAgICAuZmluYWxseSgoKSA9PiB7XG4gICAgICAgIHRoaXMucGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlcy5kZWxldGUocHJvbWlzZSk7XG4gICAgICB9KTtcbiAgICB0aGlzLnBlbmRpbmdWYXVsdE11dGF0aW9uUHJvbWlzZXMuYWRkKHByb21pc2UpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB3YWl0Rm9yUGVuZGluZ1ZhdWx0TXV0YXRpb25zKCkge1xuICAgIHdoaWxlICh0aGlzLnBlbmRpbmdWYXVsdE11dGF0aW9uUHJvbWlzZXMuc2l6ZSA+IDApIHtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChbLi4udGhpcy5wZW5kaW5nVmF1bHRNdXRhdGlvblByb21pc2VzXSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBzdGFydFBlbmRpbmdUYXNrKHRhc2s6IFVwbG9hZFRhc2spIHtcbiAgICB0aGlzLmVuc3VyZVN1cHBvcnRNb2R1bGVzKCk7XG4gICAgcmV0dXJuIHRoaXMudXBsb2FkUXVldWUuc3RhcnRQZW5kaW5nVGFzayh0YXNrKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcHJlcGFyZVBlbmRpbmdVcGxvYWRzRm9yU3luYyhzaG93Tm90aWNlOiBib29sZWFuKSB7XG4gICAgdGhpcy5lbnN1cmVTdXBwb3J0TW9kdWxlcygpO1xuICAgIGF3YWl0IHRoaXMucHJvY2Vzc1BlbmRpbmdUYXNrcygpO1xuXG4gICAgaWYgKHRoaXMudXBsb2FkUXVldWUuaGFzUGVuZGluZ1dvcmsoKSkge1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy50KFxuICAgICAgICBcIlx1NjhDMFx1NkQ0Qlx1NTIzMFx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NEVDRFx1NTcyOFx1OEZEQlx1ODg0Q1x1NjIxNlx1N0I0OVx1NUY4NVx1OTFDRFx1OEJENVx1RkYwQ1x1NURGMlx1NjY4Mlx1N0YxM1x1NjcyQ1x1NkIyMVx1N0IxNFx1OEJCMFx1NTQwQ1x1NkI2NVx1RkYwQ1x1OTA3Rlx1NTE0RFx1NjVFN1x1NzI0OFx1N0IxNFx1OEJCMFx1ODk4Nlx1NzZENlx1NjVCMFx1NTZGRVx1NzI0N1x1NUYxNVx1NzUyOFx1MzAwMlwiLFxuICAgICAgICBcIkltYWdlIHVwbG9hZHMgYXJlIHN0aWxsIHJ1bm5pbmcgb3Igd2FpdGluZyBmb3IgcmV0cnksIHNvIG5vdGUgc3luYyB3YXMgZGVmZXJyZWQgdG8gYXZvaWQgb2xkIG5vdGUgY29udGVudCBvdmVyd3JpdGluZyBuZXcgaW1hZ2UgcmVmZXJlbmNlcy5cIixcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsIDgwMDApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cclxuICBwcml2YXRlIGFzeW5jIHVwbG9hZEltYWdlc0luTm90ZShub3RlRmlsZTogVEZpbGUpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKG5vdGVGaWxlKTtcclxuICAgICAgY29uc3QgcmVwbGFjZW1lbnRzID0gYXdhaXQgdGhpcy5idWlsZFVwbG9hZFJlcGxhY2VtZW50cyhjb250ZW50LCBub3RlRmlsZSk7XHJcblxyXG4gICAgICBpZiAocmVwbGFjZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1RjUzXHU1MjREXHU3QjE0XHU4QkIwXHU0RTJEXHU2Q0ExXHU2NzA5XHU2MjdFXHU1MjMwXHU2NzJDXHU1NzMwXHU1NkZFXHU3MjQ3XHUzMDAyXCIsIFwiTm8gbG9jYWwgaW1hZ2VzIGZvdW5kIGluIHRoZSBjdXJyZW50IG5vdGUuXCIpKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGxldCB1cGRhdGVkID0gY29udGVudDtcclxuICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcclxuICAgICAgICB1cGRhdGVkID0gdXBkYXRlZC5zcGxpdChyZXBsYWNlbWVudC5vcmlnaW5hbCkuam9pbihyZXBsYWNlbWVudC5yZXdyaXR0ZW4pO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAodXBkYXRlZCA9PT0gY29udGVudCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU2Q0ExXHU2NzA5XHU5NzAwXHU4OTgxXHU2NTM5XHU1MTk5XHU3Njg0XHU1NkZFXHU3MjQ3XHU5NEZFXHU2M0E1XHUzMDAyXCIsIFwiTm8gaW1hZ2VzIHdlcmUgcmV3cml0dGVuLlwiKSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkobm90ZUZpbGUsIHVwZGF0ZWQpO1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZUZpbGUucGF0aCwgXCJpbWFnZS1hZGRcIik7XG5cbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLmRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQpIHtcbiAgICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcbiAgICAgICAgICBpZiAocmVwbGFjZW1lbnQuc291cmNlRmlsZSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy50cmFzaElmRXhpc3RzKHJlcGxhY2VtZW50LnNvdXJjZUZpbGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXHJcbiAgICAgIG5ldyBOb3RpY2UodGhpcy50KGBcdTVERjJcdTRFMEFcdTRGMjAgJHtyZXBsYWNlbWVudHMubGVuZ3RofSBcdTVGMjBcdTU2RkVcdTcyNDdcdTUyMzAgV2ViREFWXHUzMDAyYCwgYFVwbG9hZGVkICR7cmVwbGFjZW1lbnRzLmxlbmd0aH0gaW1hZ2UocykgdG8gV2ViREFWLmApKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIHVwbG9hZCBmYWlsZWRcIiwgZXJyb3IpO1xyXG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTRFMEFcdTRGMjBcdTU5MzFcdThEMjVcIiwgXCJVcGxvYWQgZmFpbGVkXCIpLCBlcnJvciksIDgwMDApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzVGFzayh0YXNrOiBVcGxvYWRUYXNrKSB7XG4gICAgdGhpcy5lbnN1cmVTdXBwb3J0TW9kdWxlcygpO1xuICAgIGF3YWl0IHRoaXMudXBsb2FkUXVldWUucHJvY2Vzc1Rhc2sodGFzayk7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkRmFpbGVkUGxhY2Vob2xkZXIoZmlsZU5hbWU6IHN0cmluZywgbWVzc2FnZT86IHN0cmluZykge1xuICAgIHRoaXMuZW5zdXJlU3VwcG9ydE1vZHVsZXMoKTtcbiAgICByZXR1cm4gdGhpcy51cGxvYWRRdWV1ZS5idWlsZEZhaWxlZFBsYWNlaG9sZGVyKGZpbGVOYW1lLCBtZXNzYWdlKTtcbiAgfVxuXG4gIHByaXZhdGUgZXNjYXBlSHRtbCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHZhbHVlXG4gICAgICAucmVwbGFjZSgvJi9nLCBcIiZhbXA7XCIpXG4gICAgICAucmVwbGFjZSgvXCIvZywgXCImcXVvdDtcIilcbiAgICAgIC5yZXBsYWNlKC88L2csIFwiJmx0O1wiKVxuICAgICAgLnJlcGxhY2UoLz4vZywgXCImZ3Q7XCIpO1xuICB9XG5cbiAgcHJpdmF0ZSB1bmVzY2FwZUh0bWwodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiB2YWx1ZVxuICAgICAgLnJlcGxhY2UoLyZxdW90Oy9nLCBcIlxcXCJcIilcbiAgICAgIC5yZXBsYWNlKC8mZ3Q7L2csIFwiPlwiKVxuICAgICAgLnJlcGxhY2UoLyZsdDsvZywgXCI8XCIpXG4gICAgICAucmVwbGFjZSgvJmFtcDsvZywgXCImXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBmZXRjaFNlY3VyZUltYWdlQmxvYlVybChyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEZldGNoIGZhaWxlZCB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG5cbiAgICBjb25zdCBibG9iID0gbmV3IEJsb2IoW3Jlc3BvbnNlLmFycmF5QnVmZmVyXSwge1xuICAgICAgdHlwZTogcmVzcG9uc2UuaGVhZGVyc1tcImNvbnRlbnQtdHlwZVwiXSA/PyBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiLFxuICAgIH0pO1xuICAgIGNvbnN0IGJsb2JVcmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICAgIHRoaXMuYmxvYlVybHMuYWRkKGJsb2JVcmwpO1xuICAgIHJldHVybiBibG9iVXJsO1xuICB9XG5cbiAgcHJpdmF0ZSBhcnJheUJ1ZmZlclRvQmFzZTY0KGJ1ZmZlcjogQXJyYXlCdWZmZXIpIHtcbiAgICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlcik7XG4gICAgY29uc3QgY2h1bmtTaXplID0gMHg4MDAwO1xuICAgIGxldCBiaW5hcnkgPSBcIlwiO1xuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBieXRlcy5sZW5ndGg7IGluZGV4ICs9IGNodW5rU2l6ZSkge1xuICAgICAgY29uc3QgY2h1bmsgPSBieXRlcy5zdWJhcnJheShpbmRleCwgaW5kZXggKyBjaHVua1NpemUpO1xuICAgICAgYmluYXJ5ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoLi4uY2h1bmspO1xuICAgIH1cbiAgICByZXR1cm4gYnRvYShiaW5hcnkpO1xuICB9XG5cbiAgcHJpdmF0ZSBiYXNlNjRUb0FycmF5QnVmZmVyKGJhc2U2NDogc3RyaW5nKSB7XG4gICAgY29uc3QgYmluYXJ5ID0gYXRvYihiYXNlNjQpO1xuICAgIGNvbnN0IGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoYmluYXJ5Lmxlbmd0aCk7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGJpbmFyeS5sZW5ndGg7IGluZGV4ICs9IDEpIHtcbiAgICAgIGJ5dGVzW2luZGV4XSA9IGJpbmFyeS5jaGFyQ29kZUF0KGluZGV4KTtcbiAgICB9XG4gICAgcmV0dXJuIGJ5dGVzLmJ1ZmZlci5zbGljZShieXRlcy5ieXRlT2Zmc2V0LCBieXRlcy5ieXRlT2Zmc2V0ICsgYnl0ZXMuYnl0ZUxlbmd0aCkgYXMgQXJyYXlCdWZmZXI7XG4gIH1cblxuICBwcml2YXRlIGFycmF5QnVmZmVyc0VxdWFsKGxlZnQ6IEFycmF5QnVmZmVyLCByaWdodDogQXJyYXlCdWZmZXIpIHtcbiAgICBjb25zdCBhID0gbmV3IFVpbnQ4QXJyYXkobGVmdCk7XG4gICAgY29uc3QgYiA9IG5ldyBVaW50OEFycmF5KHJpZ2h0KTtcbiAgICBpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGEubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgICBpZiAoYVtpbmRleF0gIT09IGJbaW5kZXhdKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRDbGlwYm9hcmRGaWxlTmFtZShtaW1lVHlwZTogc3RyaW5nKSB7XG4gICAgY29uc3QgZXh0ZW5zaW9uID0gbWltZVR5cGUuc3BsaXQoXCIvXCIpWzFdPy5yZXBsYWNlKFwianBlZ1wiLCBcImpwZ1wiKSB8fCBcInBuZ1wiO1xuICAgIHJldHVybiBgcGFzdGVkLWltYWdlLSR7RGF0ZS5ub3coKX0uJHtleHRlbnNpb259YDtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBlc2NhcGVSZWdFeHAodmFsdWU6IHN0cmluZykge1xyXG4gICAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCBcIlxcXFwkJlwiKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYnVpbGRSZW1vdGVQYXRoKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5zZXR0aW5ncy5yZW1vdGVGb2xkZXIpfSR7ZmlsZU5hbWV9YDtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnkoZmlsZU5hbWU6IHN0cmluZywgYmluYXJ5OiBBcnJheUJ1ZmZlcikge1xuICAgIGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbUZpbGVOYW1lKGZpbGVOYW1lKTtcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5uYW1pbmdTdHJhdGVneSA9PT0gXCJoYXNoXCIpIHtcbiAgICAgIGNvbnN0IGhhc2ggPSAoYXdhaXQgdGhpcy5jb21wdXRlU2hhMjU2SGV4KGJpbmFyeSkpLnNsaWNlKDAsIDE2KTtcbiAgICAgIHJldHVybiBgJHtoYXNofS4ke2V4dGVuc2lvbn1gO1xuICAgIH1cblxyXG4gICAgcmV0dXJuIGAke0RhdGUubm93KCl9LSR7ZmlsZU5hbWV9YDtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aDogc3RyaW5nKSB7XHJcbiAgICBjb25zdCBiYXNlID0gdGhpcy5zZXR0aW5ncy53ZWJkYXZVcmwucmVwbGFjZSgvXFwvKyQvLCBcIlwiKTtcclxuICAgIHJldHVybiBgJHtiYXNlfS8ke3JlbW90ZVBhdGguc3BsaXQoXCIvXCIpLm1hcChlbmNvZGVVUklDb21wb25lbnQpLmpvaW4oXCIvXCIpfWA7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIG5vcm1hbGl6ZUZvbGRlcihpbnB1dDogc3RyaW5nKSB7XHJcbiAgICByZXR1cm4gaW5wdXQucmVwbGFjZSgvXlxcLysvLCBcIlwiKS5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpICsgXCIvXCI7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGJ1aWxkQXV0aEhlYWRlcigpIHtcbiAgICBjb25zdCB0b2tlbiA9IHRoaXMuYXJyYXlCdWZmZXJUb0Jhc2U2NCh0aGlzLmVuY29kZVV0ZjgoYCR7dGhpcy5zZXR0aW5ncy51c2VybmFtZX06JHt0aGlzLnNldHRpbmdzLnBhc3N3b3JkfWApKTtcbiAgICByZXR1cm4gYEJhc2ljICR7dG9rZW59YDtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBlbnN1cmVDb25maWd1cmVkKCkge1xyXG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLndlYmRhdlVybCB8fCAhdGhpcy5zZXR0aW5ncy51c2VybmFtZSB8fCAhdGhpcy5zZXR0aW5ncy5wYXNzd29yZCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiV2ViREFWIFx1OTE0RFx1N0Y2RVx1NEUwRFx1NUI4Q1x1NjU3NFx1MzAwMlwiLCBcIldlYkRBViBzZXR0aW5ncyBhcmUgaW5jb21wbGV0ZS5cIikpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBnZXRNaW1lVHlwZShleHRlbnNpb246IHN0cmluZykge1xyXG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IGV4dGVuc2lvbi50b0xvd2VyQ2FzZSgpO1xyXG4gICAgaWYgKG5vcm1hbGl6ZWQgPT09IFwianBnXCIgfHwgbm9ybWFsaXplZCA9PT0gXCJqcGVnXCIpIHJldHVybiBcImltYWdlL2pwZWdcIjtcclxuICAgIGlmIChub3JtYWxpemVkID09PSBcInBuZ1wiKSByZXR1cm4gXCJpbWFnZS9wbmdcIjtcclxuICAgIGlmIChub3JtYWxpemVkID09PSBcImdpZlwiKSByZXR1cm4gXCJpbWFnZS9naWZcIjtcclxuICAgIGlmIChub3JtYWxpemVkID09PSBcIndlYnBcIikgcmV0dXJuIFwiaW1hZ2Uvd2VicFwiO1xyXG4gICAgaWYgKG5vcm1hbGl6ZWQgPT09IFwic3ZnXCIpIHJldHVybiBcImltYWdlL3N2Zyt4bWxcIjtcclxuICAgIGlmIChub3JtYWxpemVkID09PSBcImJtcFwiKSByZXR1cm4gXCJpbWFnZS9ibXBcIjtcclxuICAgIHJldHVybiBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBnZXRNaW1lVHlwZUZyb21GaWxlTmFtZShmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0TWltZVR5cGUodGhpcy5nZXRFeHRlbnNpb25Gcm9tRmlsZU5hbWUoZmlsZU5hbWUpKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0RXh0ZW5zaW9uRnJvbUZpbGVOYW1lKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBwaWVjZXMgPSBmaWxlTmFtZS5zcGxpdChcIi5cIik7XG4gICAgcmV0dXJuIHBpZWNlcy5sZW5ndGggPiAxID8gcGllY2VzW3BpZWNlcy5sZW5ndGggLSAxXS50b0xvd2VyQ2FzZSgpIDogXCJwbmdcIjtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcHJlcGFyZVVwbG9hZFBheWxvYWQoYmluYXJ5OiBBcnJheUJ1ZmZlciwgbWltZVR5cGU6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGlmICghdGhpcy5zZXR0aW5ncy5jb21wcmVzc0ltYWdlcykge1xuICAgICAgcmV0dXJuIHsgYmluYXJ5LCBtaW1lVHlwZSwgZmlsZU5hbWUgfTtcbiAgICB9XG5cbiAgICBjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRoaXMuY29tcHJlc3NJbWFnZUlmTmVlZGVkKGJpbmFyeSwgbWltZVR5cGUsIGZpbGVOYW1lKTtcbiAgICByZXR1cm4gcHJlcGFyZWQgPz8geyBiaW5hcnksIG1pbWVUeXBlLCBmaWxlTmFtZSB9O1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjb21wcmVzc0ltYWdlSWZOZWVkZWQoYmluYXJ5OiBBcnJheUJ1ZmZlciwgbWltZVR5cGU6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGlmICghL15pbWFnZVxcLyhwbmd8anBlZ3xqcGd8d2VicCkkL2kudGVzdChtaW1lVHlwZSkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IHRocmVzaG9sZEJ5dGVzID0gdGhpcy5zZXR0aW5ncy5jb21wcmVzc1RocmVzaG9sZEtiICogMTAyNDtcbiAgICBjb25zdCBzb3VyY2VCbG9iID0gbmV3IEJsb2IoW2JpbmFyeV0sIHsgdHlwZTogbWltZVR5cGUgfSk7XG4gICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB0aGlzLmxvYWRJbWFnZUVsZW1lbnQoc291cmNlQmxvYik7XG4gICAgY29uc3QgbGFyZ2VzdFNpZGUgPSBNYXRoLm1heChpbWFnZS5uYXR1cmFsV2lkdGgsIGltYWdlLm5hdHVyYWxIZWlnaHQpO1xuICAgIGNvbnN0IG5lZWRzUmVzaXplID0gbGFyZ2VzdFNpZGUgPiB0aGlzLnNldHRpbmdzLm1heEltYWdlRGltZW5zaW9uO1xuICAgIGNvbnN0IG5lZWRzQ29tcHJlc3MgPSBzb3VyY2VCbG9iLnNpemUgPiB0aHJlc2hvbGRCeXRlcyB8fCBuZWVkc1Jlc2l6ZTtcbiAgICBpZiAoIW5lZWRzQ29tcHJlc3MpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IHNjYWxlID0gbmVlZHNSZXNpemUgPyB0aGlzLnNldHRpbmdzLm1heEltYWdlRGltZW5zaW9uIC8gbGFyZ2VzdFNpZGUgOiAxO1xuICAgIGNvbnN0IHRhcmdldFdpZHRoID0gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChpbWFnZS5uYXR1cmFsV2lkdGggKiBzY2FsZSkpO1xuICAgIGNvbnN0IHRhcmdldEhlaWdodCA9IE1hdGgubWF4KDEsIE1hdGgucm91bmQoaW1hZ2UubmF0dXJhbEhlaWdodCAqIHNjYWxlKSk7XG4gICAgY29uc3QgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImNhbnZhc1wiKTtcbiAgICBjYW52YXMud2lkdGggPSB0YXJnZXRXaWR0aDtcbiAgICBjYW52YXMuaGVpZ2h0ID0gdGFyZ2V0SGVpZ2h0O1xuICAgIGNvbnN0IGNvbnRleHQgPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpO1xuICAgIGlmICghY29udGV4dCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29udGV4dC5kcmF3SW1hZ2UoaW1hZ2UsIDAsIDAsIHRhcmdldFdpZHRoLCB0YXJnZXRIZWlnaHQpO1xuXG4gICAgY29uc3Qgb3V0cHV0TWltZSA9IG1pbWVUeXBlLnRvTG93ZXJDYXNlKCkgPT09IFwiaW1hZ2UvanBnXCIgPyBcImltYWdlL2pwZWdcIiA6IG1pbWVUeXBlO1xuICAgIGNvbnN0IHF1YWxpdHkgPSBNYXRoLm1heCgwLjQsIE1hdGgubWluKDAuOTgsIHRoaXMuc2V0dGluZ3MuanBlZ1F1YWxpdHkgLyAxMDApKTtcbiAgICBjb25zdCBjb21wcmVzc2VkQmxvYiA9IGF3YWl0IG5ldyBQcm9taXNlPEJsb2IgfCBudWxsPigocmVzb2x2ZSkgPT4ge1xuICAgICAgY2FudmFzLnRvQmxvYihyZXNvbHZlLCBvdXRwdXRNaW1lLCBxdWFsaXR5KTtcbiAgICB9KTtcblxuICAgIGlmICghY29tcHJlc3NlZEJsb2IpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmICghbmVlZHNSZXNpemUgJiYgY29tcHJlc3NlZEJsb2Iuc2l6ZSA+PSBzb3VyY2VCbG9iLnNpemUpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IG5leHRCaW5hcnkgPSBhd2FpdCBjb21wcmVzc2VkQmxvYi5hcnJheUJ1ZmZlcigpO1xuICAgIGNvbnN0IG5leHRFeHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbkZyb21NaW1lVHlwZShvdXRwdXRNaW1lKSA/PyB0aGlzLmdldEV4dGVuc2lvbkZyb21GaWxlTmFtZShmaWxlTmFtZSk7XG4gICAgY29uc3QgbmV4dEZpbGVOYW1lID0gZmlsZU5hbWUucmVwbGFjZSgvXFwuW14uXSskLywgXCJcIikgKyBgLiR7bmV4dEV4dGVuc2lvbn1gO1xuICAgIHJldHVybiB7XG4gICAgICBiaW5hcnk6IG5leHRCaW5hcnksXG4gICAgICBtaW1lVHlwZTogb3V0cHV0TWltZSxcbiAgICAgIGZpbGVOYW1lOiBuZXh0RmlsZU5hbWUsXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgbG9hZEltYWdlRWxlbWVudChibG9iOiBCbG9iKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPEhUTUxJbWFnZUVsZW1lbnQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICBjb25zdCBpbWFnZSA9IG5ldyBJbWFnZSgpO1xuICAgICAgaW1hZ2Uub25sb2FkID0gKCkgPT4ge1xuICAgICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG4gICAgICAgIHJlc29sdmUoaW1hZ2UpO1xuICAgICAgfTtcbiAgICAgIGltYWdlLm9uZXJyb3IgPSAoZXJyb3IpID0+IHtcbiAgICAgICAgVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfTtcbiAgICAgIGltYWdlLnNyYyA9IHVybDtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgZXh0ZW5zaW9uRnJvbU1pbWVUeXBlKG1pbWVUeXBlOiBzdHJpbmcpIHtcbiAgICBpZiAobWltZVR5cGUgPT09IFwiaW1hZ2UvanBlZ1wiKSByZXR1cm4gXCJqcGdcIjtcbiAgICBpZiAobWltZVR5cGUgPT09IFwiaW1hZ2UvcG5nXCIpIHJldHVybiBcInBuZ1wiO1xuICAgIGlmIChtaW1lVHlwZSA9PT0gXCJpbWFnZS93ZWJwXCIpIHJldHVybiBcIndlYnBcIjtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXHJcbiAgcHJpdmF0ZSBhc3luYyB0cmFzaElmRXhpc3RzKGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQudHJhc2goZmlsZSwgdHJ1ZSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2FybihcIkZhaWxlZCB0byB0cmFzaCBsb2NhbCBpbWFnZSBhZnRlciB1cGxvYWRcIiwgZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZm9ybWF0RW1iZWRMYWJlbChmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMudChgXHUzMDEwXHU1Qjg5XHU1MTY4XHU4RkRDXHU3QTBCXHU1NkZFXHU3MjQ3XHVGRjVDJHtmaWxlTmFtZX1cdTMwMTFgLCBgW1NlY3VyZSByZW1vdGUgaW1hZ2UgfCAke2ZpbGVOYW1lfV1gKTtcbiAgfVxuXG4gIHByaXZhdGUgZm9ybWF0RmFpbGVkTGFiZWwoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLnQoYFx1MzAxMFx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NTkzMVx1OEQyNVx1RkY1QyR7ZmlsZU5hbWV9XHUzMDExYCwgYFtJbWFnZSB1cGxvYWQgZmFpbGVkIHwgJHtmaWxlTmFtZX1dYCk7XG4gIH1cblxuICBhc3luYyBtaWdyYXRlQWxsTGVnYWN5U2VjdXJlSW1hZ2VzKCkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB1cGxvYWRDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgICBjb25zdCBjYW5kaWRhdGVMb2NhbEltYWdlcyA9IG5ldyBNYXA8c3RyaW5nLCBURmlsZT4oKTtcbiAgICAgIGxldCBjaGFuZ2VkRmlsZXMgPSAwO1xuICAgICAgZm9yIChjb25zdCBmaWxlIG9mIHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKSkge1xuICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgICAgY29uc3QgcmVwbGFjZW1lbnRzID0gYXdhaXQgdGhpcy5idWlsZFVwbG9hZFJlcGxhY2VtZW50cyhjb250ZW50LCBmaWxlLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgcmVwbGFjZW1lbnRzKSB7XG4gICAgICAgICAgaWYgKHJlcGxhY2VtZW50LnNvdXJjZUZpbGUpIHtcbiAgICAgICAgICAgIGNhbmRpZGF0ZUxvY2FsSW1hZ2VzLnNldChyZXBsYWNlbWVudC5zb3VyY2VGaWxlLnBhdGgsIHJlcGxhY2VtZW50LnNvdXJjZUZpbGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGxldCB1cGRhdGVkID0gY29udGVudDtcbiAgICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcbiAgICAgICAgICB1cGRhdGVkID0gdXBkYXRlZC5zcGxpdChyZXBsYWNlbWVudC5vcmlnaW5hbCkuam9pbihyZXBsYWNlbWVudC5yZXdyaXR0ZW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlZCA9IHVwZGF0ZWRcbiAgICAgICAgICAucmVwbGFjZShcbiAgICAgICAgICAgIC88c3BhbiBjbGFzcz1cInNlY3VyZS13ZWJkYXYtZW1iZWRcIiBkYXRhLXNlY3VyZS13ZWJkYXY9XCIoW15cIl0rKVwiIGFyaWEtbGFiZWw9XCIoW15cIl0qKVwiPi4qPzxcXC9zcGFuPi9nLFxuICAgICAgICAgICAgKF9tYXRjaCwgcmVtb3RlUGF0aDogc3RyaW5nLCBhbHQ6IHN0cmluZykgPT5cbiAgICAgICAgICAgICAgdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayhcbiAgICAgICAgICAgICAgICB0aGlzLnVuZXNjYXBlSHRtbChyZW1vdGVQYXRoKSxcbiAgICAgICAgICAgICAgICB0aGlzLnVuZXNjYXBlSHRtbChhbHQpIHx8IHRoaXMudW5lc2NhcGVIdG1sKHJlbW90ZVBhdGgpLFxuICAgICAgICAgICAgICApLFxuICAgICAgICAgIClcbiAgICAgICAgICAucmVwbGFjZShcbiAgICAgICAgICAgIC8hXFxbW15cXF1dKl1cXCh3ZWJkYXYtc2VjdXJlOlxcL1xcLyhbXildKylcXCkvZyxcbiAgICAgICAgICAgIChfbWF0Y2gsIHJlbW90ZVBhdGg6IHN0cmluZykgPT5cbiAgICAgICAgICAgICAgdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayh0aGlzLnVuZXNjYXBlSHRtbChyZW1vdGVQYXRoKSwgdGhpcy51bmVzY2FwZUh0bWwocmVtb3RlUGF0aCkpLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgaWYgKHVwZGF0ZWQgPT09IGNvbnRlbnQpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB1cGRhdGVkKTtcbiAgICAgICAgY2hhbmdlZEZpbGVzICs9IDE7XG4gICAgICB9XG5cbiAgICAgIGlmIChjaGFuZ2VkRmlsZXMgPT09IDApIHtcbiAgICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgICB0aGlzLnQoXG4gICAgICAgICAgICBcIlx1NjU3NFx1NUU5M1x1OTFDQ1x1NkNBMVx1NjcwOVx1NTNEMVx1NzNCMFx1NTNFRlx1OEZDMVx1NzlGQlx1NzY4NFx1NjVFN1x1NzI0OFx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NjgwN1x1N0I3RVx1MzAwMlwiLFxuICAgICAgICAgICAgXCJObyBsZWdhY3kgc2VjdXJlIGltYWdlIHRhZ3Mgd2VyZSBmb3VuZCBpbiB0aGUgdmF1bHQuXCIsXG4gICAgICAgICAgKSxcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5kZWxldGVMb2NhbEFmdGVyVXBsb2FkKSB7XG4gICAgICAgIGF3YWl0IHRoaXMudHJhc2hNaWdyYXRlZEltYWdlc0lmU2FmZShjYW5kaWRhdGVMb2NhbEltYWdlcyk7XG4gICAgICB9XG5cbiAgICAgIG5ldyBOb3RpY2UoXG4gICAgICB0aGlzLnQoXG4gICAgICAgIGBcdTVERjJcdThGQzFcdTc5RkIgJHtjaGFuZ2VkRmlsZXN9IFx1N0JDN1x1N0IxNFx1OEJCMFx1NTIzMFx1NjVCMFx1NzY4NFx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NEVFM1x1NzgwMVx1NTc1N1x1NjgzQ1x1NUYwRlx1MzAwMmAsXG4gICAgICAgIGBNaWdyYXRlZCAke2NoYW5nZWRGaWxlc30gbm90ZShzKSB0byB0aGUgbmV3IHNlY3VyZSBpbWFnZSBjb2RlLWJsb2NrIGZvcm1hdC5gLFxuICAgICAgKSxcbiAgICAgICAgODAwMCxcbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbWlncmF0ZSBzZWN1cmUgaW1hZ2VzIHRvIGNvZGUgYmxvY2tzXCIsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1OEZDMVx1NzlGQlx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NjgzQ1x1NUYwRlx1NTkzMVx1OEQyNVwiLCBcIkZhaWxlZCB0byBtaWdyYXRlIHNlY3VyZSBpbWFnZSBmb3JtYXRcIiksIGVycm9yKSwgODAwMCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB0cmFzaE1pZ3JhdGVkSW1hZ2VzSWZTYWZlKGNhbmRpZGF0ZUxvY2FsSW1hZ2VzOiBNYXA8c3RyaW5nLCBURmlsZT4pIHtcbiAgICBpZiAoY2FuZGlkYXRlTG9jYWxJbWFnZXMuc2l6ZSA9PT0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHJlbWFpbmluZ1JlZnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBmb3IgKGNvbnN0IG5vdGUgb2YgdGhpcy5hcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpKSB7XG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChub3RlKTtcbiAgICAgIGNvbnN0IHdpa2lNYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtcXFsoW15cXF1dKylcXF1cXF0vZyldO1xuICAgICAgY29uc3QgbWFya2Rvd25NYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtbXlxcXV0qXVxcKChbXildKylcXCkvZyldO1xuXG4gICAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIHdpa2lNYXRjaGVzKSB7XG4gICAgICAgIGNvbnN0IHJhd0xpbmsgPSBtYXRjaFsxXS5zcGxpdChcInxcIilbMF0udHJpbSgpO1xuICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGUucGF0aCk7XG4gICAgICAgIGlmICh0YXJnZXQgJiYgdGhpcy5pc0ltYWdlRmlsZSh0YXJnZXQpKSB7XG4gICAgICAgICAgcmVtYWluaW5nUmVmcy5hZGQodGFyZ2V0LnBhdGgpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWFya2Rvd25NYXRjaGVzKSB7XG4gICAgICAgIGNvbnN0IHJhd0xpbmsgPSBkZWNvZGVVUklDb21wb25lbnQobWF0Y2hbMV0udHJpbSgpLnJlcGxhY2UoL148fD4kL2csIFwiXCIpKTtcbiAgICAgICAgaWYgKC9eKGh0dHBzPzp8d2ViZGF2LXNlY3VyZTp8ZGF0YTopL2kudGVzdChyYXdMaW5rKSkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5yZXNvbHZlTGlua2VkRmlsZShyYXdMaW5rLCBub3RlLnBhdGgpO1xuICAgICAgICBpZiAodGFyZ2V0ICYmIHRoaXMuaXNJbWFnZUZpbGUodGFyZ2V0KSkge1xuICAgICAgICAgIHJlbWFpbmluZ1JlZnMuYWRkKHRhcmdldC5wYXRoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgW3BhdGgsIGZpbGVdIG9mIGNhbmRpZGF0ZUxvY2FsSW1hZ2VzLmVudHJpZXMoKSkge1xuICAgICAgaWYgKHJlbWFpbmluZ1JlZnMuaGFzKHBhdGgpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLnRyYXNoSWZFeGlzdHMoZmlsZSk7XG4gICAgfVxuICB9XG5cclxuICBhc3luYyBydW5Db25uZWN0aW9uVGVzdChzaG93TW9kYWwgPSBmYWxzZSkge1xuICAgIHRyeSB7XHJcbiAgICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xyXG5cclxuICAgICAgY29uc3QgcHJvYmVOYW1lID0gYC5zZWN1cmUtd2ViZGF2LXByb2JlLSR7RGF0ZS5ub3coKX0udHh0YDtcclxuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRSZW1vdGVQYXRoKHByb2JlTmFtZSk7XHJcbiAgICAgIGNvbnN0IHVwbG9hZFVybCA9IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCk7XHJcbiAgICAgIGNvbnN0IHByb2JlQXJyYXlCdWZmZXIgPSB0aGlzLmVuY29kZVV0ZjgoYHNlY3VyZS13ZWJkYXYgcHJvYmUgJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCl9YCk7XG5cclxuICAgICAgY29uc3QgcHV0UmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xyXG4gICAgICAgIHVybDogdXBsb2FkVXJsLFxyXG4gICAgICAgIG1ldGhvZDogXCJQVVRcIixcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxyXG4gICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJ0ZXh0L3BsYWluOyBjaGFyc2V0PXV0Zi04XCIsXHJcbiAgICAgICAgfSxcclxuICAgICAgICBib2R5OiBwcm9iZUFycmF5QnVmZmVyLFxyXG4gICAgICB9KTtcclxuICAgICAgaWYgKHB1dFJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCBwdXRSZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBQVVQgZmFpbGVkIHdpdGggc3RhdHVzICR7cHV0UmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBnZXRSZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XHJcbiAgICAgICAgdXJsOiB1cGxvYWRVcmwsXHJcbiAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxyXG4gICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXHJcbiAgICAgICAgfSxcclxuICAgICAgfSk7XHJcbiAgICAgIGlmIChnZXRSZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgZ2V0UmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgR0VUIGZhaWxlZCB3aXRoIHN0YXR1cyAke2dldFJlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZGVsZXRlUmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xyXG4gICAgICAgIHVybDogdXBsb2FkVXJsLFxyXG4gICAgICAgIG1ldGhvZDogXCJERUxFVEVcIixcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0pO1xyXG4gICAgICBpZiAoZGVsZXRlUmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IGRlbGV0ZVJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYERFTEVURSBmYWlsZWQgd2l0aCBzdGF0dXMgJHtkZWxldGVSZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSB0aGlzLnQoXHJcbiAgICAgICAgYFdlYkRBViBcdTZENEJcdThCRDVcdTkwMUFcdThGQzdcdTMwMDJQVVQgJHtwdXRSZXNwb25zZS5zdGF0dXN9XHVGRjBDR0VUICR7Z2V0UmVzcG9uc2Uuc3RhdHVzfVx1RkYwQ0RFTEVURSAke2RlbGV0ZVJlc3BvbnNlLnN0YXR1c31cdTMwMDJgLFxyXG4gICAgICAgIGBXZWJEQVYgdGVzdCBwYXNzZWQuIFBVVCAke3B1dFJlc3BvbnNlLnN0YXR1c30sIEdFVCAke2dldFJlc3BvbnNlLnN0YXR1c30sIERFTEVURSAke2RlbGV0ZVJlc3BvbnNlLnN0YXR1c30uYCxcclxuICAgICAgKTtcclxuICAgICAgbmV3IE5vdGljZShtZXNzYWdlLCA2MDAwKTtcclxuICAgICAgaWYgKHNob3dNb2RhbCkge1xyXG4gICAgICAgIG5ldyBSZXN1bHRNb2RhbCh0aGlzLmFwcCwgdGhpcy50KFwiV2ViREFWIFx1OEZERVx1NjNBNVwiLCBcIldlYkRBViBDb25uZWN0aW9uXCIpLCBtZXNzYWdlKS5vcGVuKCk7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiU2VjdXJlIFdlYkRBViB0ZXN0IGZhaWxlZFwiLCBlcnJvcik7XHJcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSB0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiV2ViREFWIFx1NkQ0Qlx1OEJENVx1NTkzMVx1OEQyNVwiLCBcIldlYkRBViB0ZXN0IGZhaWxlZFwiKSwgZXJyb3IpO1xyXG4gICAgICBuZXcgTm90aWNlKG1lc3NhZ2UsIDgwMDApO1xyXG4gICAgICBpZiAoc2hvd01vZGFsKSB7XHJcbiAgICAgICAgbmV3IFJlc3VsdE1vZGFsKHRoaXMuYXBwLCB0aGlzLnQoXCJXZWJEQVYgXHU4RkRFXHU2M0E1XCIsIFwiV2ViREFWIENvbm5lY3Rpb25cIiksIG1lc3NhZ2UpLm9wZW4oKTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGRlc2NyaWJlRXJyb3IocHJlZml4OiBzdHJpbmcsIGVycm9yOiB1bmtub3duKSB7XG4gICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcbiAgICByZXR1cm4gYCR7cHJlZml4fTogJHttZXNzYWdlfWA7XG4gIH1cblxyXG4gIHByaXZhdGUgYXN5bmMgcmVxdWVzdFVybChvcHRpb25zOiB7XG4gICAgdXJsOiBzdHJpbmc7XG4gICAgbWV0aG9kOiBzdHJpbmc7XG4gICAgaGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gICAgYm9keT86IEFycmF5QnVmZmVyO1xuICAgIGZvbGxvd1JlZGlyZWN0cz86IGJvb2xlYW47XG4gICAgcmVkaXJlY3RDb3VudD86IG51bWJlcjtcbiAgfSk6IFByb21pc2U8eyBzdGF0dXM6IG51bWJlcjsgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPjsgYXJyYXlCdWZmZXI6IEFycmF5QnVmZmVyIH0+IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG9ic2lkaWFuUmVxdWVzdFVybCh7XG4gICAgICB1cmw6IG9wdGlvbnMudXJsLFxuICAgICAgbWV0aG9kOiBvcHRpb25zLm1ldGhvZCxcbiAgICAgIGhlYWRlcnM6IG9wdGlvbnMuaGVhZGVycyxcbiAgICAgIGJvZHk6IG9wdGlvbnMuYm9keSxcbiAgICAgIHRocm93OiBmYWxzZSxcbiAgICB9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6IHJlc3BvbnNlLnN0YXR1cyxcbiAgICAgIGhlYWRlcnM6IHJlc3BvbnNlLmhlYWRlcnMsXG4gICAgICBhcnJheUJ1ZmZlcjogcmVzcG9uc2UuYXJyYXlCdWZmZXIsXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgZW5jb2RlVXRmOCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgY29uc3QgYnl0ZXMgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUodmFsdWUpO1xuICAgIHJldHVybiBieXRlcy5idWZmZXIuc2xpY2UoYnl0ZXMuYnl0ZU9mZnNldCwgYnl0ZXMuYnl0ZU9mZnNldCArIGJ5dGVzLmJ5dGVMZW5ndGgpIGFzIEFycmF5QnVmZmVyO1xuICB9XG5cbiAgcHJpdmF0ZSBkZWNvZGVVdGY4KGJ1ZmZlcjogQXJyYXlCdWZmZXIpIHtcbiAgICByZXR1cm4gbmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGJ1ZmZlcik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNvbXB1dGVTaGEyNTZIZXgoYnVmZmVyOiBBcnJheUJ1ZmZlcikge1xuICAgIGNvbnN0IGRpZ2VzdCA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZGlnZXN0KFwiU0hBLTI1NlwiLCBidWZmZXIpO1xuICAgIHJldHVybiBBcnJheS5mcm9tKG5ldyBVaW50OEFycmF5KGRpZ2VzdCkpXG4gICAgICAubWFwKCh2YWx1ZSkgPT4gdmFsdWUudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsIFwiMFwiKSlcbiAgICAgIC5qb2luKFwiXCIpO1xuICB9XG59XG5cbnR5cGUgVXBsb2FkUmV3cml0ZSA9IHtcbiAgb3JpZ2luYWw6IHN0cmluZztcbiAgcmV3cml0dGVuOiBzdHJpbmc7XG4gIHNvdXJjZUZpbGU/OiBURmlsZTtcbn07XG5cclxuY2xhc3MgU2VjdXJlV2ViZGF2U2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xyXG4gIHBsdWdpbjogU2VjdXJlV2ViZGF2SW1hZ2VzUGx1Z2luO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBTZWN1cmVXZWJkYXZJbWFnZXNQbHVnaW4pIHtcclxuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gIH1cclxuXHJcbiAgZGlzcGxheSgpOiB2b2lkIHtcclxuICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XHJcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xyXG5cclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIlNlY3VyZSBXZWJEQVYgSW1hZ2VzXCIgfSk7XG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJwXCIsIHtcbiAgICAgIHRleHQ6IHRoaXMucGx1Z2luLnQoXG4gICAgICAgIFwiXHU4RkQ5XHU0RTJBXHU2M0QyXHU0RUY2XHU1M0VBXHU2MjhBXHU1NkZFXHU3MjQ3XHU1MjY1XHU3OUJCXHU1MjMwXHU1MzU1XHU3MkVDXHU3Njg0XHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHVGRjBDXHU1RTc2XHU0RkREXHU1QjU4XHU0RTNBIHNlY3VyZS13ZWJkYXYgXHU4MUVBXHU1QjlBXHU0RTQ5XHU0RUUzXHU3ODAxXHU1NzU3XHVGRjFCXHU1MTc2XHU0RUQ2XHU3QjE0XHU4QkIwXHU1NDhDXHU5NjQ0XHU0RUY2XHU2MzA5XHU1MzlGXHU4REVGXHU1Rjg0XHU1MzlGXHU2ODM3XHU1NDBDXHU2QjY1XHUzMDAyXCIsXG4gICAgICAgIFwiVGhpcyBwbHVnaW4gc2VwYXJhdGVzIG9ubHkgaW1hZ2VzIGludG8gYSBkZWRpY2F0ZWQgcmVtb3RlIGZvbGRlciBhbmQgc3RvcmVzIHRoZW0gYXMgc2VjdXJlLXdlYmRhdiBjdXN0b20gY29kZSBibG9ja3MuIE5vdGVzIGFuZCBvdGhlciBhdHRhY2htZW50cyBhcmUgc3luY2VkIGFzLWlzIHdpdGggdGhlaXIgb3JpZ2luYWwgcGF0aHMuXCIsXG4gICAgICApLFxuICAgIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU1RjUzXHU1MjREXHU2M0QyXHU0RUY2XHU3MjQ4XHU2NzJDXCIsIFwiQ3VycmVudCBwbHVnaW4gdmVyc2lvblwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU1OTFBXHU3QUVGXHU0RjdGXHU3NTI4XHU2NUY2XHU1M0VGXHU1MTQ4XHU2ODM4XHU1QkY5XHU4RkQ5XHU5MUNDXHU3Njg0XHU3MjQ4XHU2NzJDXHU1M0Y3XHVGRjBDXHU5MDdGXHU1MTREXHU1NkUwXHU0RTNBXHU1QkEyXHU2MjM3XHU3QUVGXHU1MzQ3XHU3RUE3XHU0RTBEXHU1MjMwXHU0RjREXHU1QkZDXHU4MUY0XHU4ODRDXHU0RTNBXHU0RTBEXHU0RTAwXHU4MUY0XHUzMDAyXCIsXG4gICAgICAgICAgXCJDaGVjayB0aGlzIHZlcnNpb24gZmlyc3QgYWNyb3NzIGRldmljZXMgdG8gYXZvaWQgaW5jb25zaXN0ZW50IGJlaGF2aW9yIGNhdXNlZCBieSBpbmNvbXBsZXRlIHVwZ3JhZGVzLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+IHtcbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5tYW5pZmVzdC52ZXJzaW9uKTtcbiAgICAgICAgdGV4dC5zZXREaXNhYmxlZCh0cnVlKTtcbiAgICAgIH0pO1xuXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMucGx1Z2luLnQoXCJcdTc1NENcdTk3NjJcdThCRURcdThBMDBcIiwgXCJJbnRlcmZhY2UgbGFuZ3VhZ2VcIikgfSk7XG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4QkVEXHU4QTAwXCIsIFwiTGFuZ3VhZ2VcIikpXG4gICAgICAuc2V0RGVzYyh0aGlzLnBsdWdpbi50KFwiXHU4QkJFXHU3RjZFXHU5ODc1XHU2NTJGXHU2MzAxXHU4MUVBXHU1MkE4XHUzMDAxXHU0RTJEXHU2NTg3XHUzMDAxXHU4MkYxXHU2NTg3XHU1MjA3XHU2MzYyXHUzMDAyXCIsIFwiU3dpdGNoIHRoZSBzZXR0aW5ncyBVSSBiZXR3ZWVuIGF1dG8sIENoaW5lc2UsIGFuZCBFbmdsaXNoLlwiKSlcclxuICAgICAgLmFkZERyb3Bkb3duKChkcm9wZG93bikgPT5cclxuICAgICAgICBkcm9wZG93blxyXG4gICAgICAgICAgLmFkZE9wdGlvbihcImF1dG9cIiwgdGhpcy5wbHVnaW4udChcIlx1ODFFQVx1NTJBOFwiLCBcIkF1dG9cIikpXG4gICAgICAgICAgLmFkZE9wdGlvbihcInpoXCIsIFwiXHU0RTJEXHU2NTg3XCIpXG4gICAgICAgICAgLmFkZE9wdGlvbihcImVuXCIsIFwiRW5nbGlzaFwiKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5sYW5ndWFnZSlcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmxhbmd1YWdlID0gdmFsdWUgYXMgXCJhdXRvXCIgfCBcInpoXCIgfCBcImVuXCI7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgIH0pLFxuICAgICAgKTtcclxuXHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy5wbHVnaW4udChcIlx1OEZERVx1NjNBNVx1OEJCRVx1N0Y2RVwiLCBcIkNvbm5lY3Rpb25cIikgfSk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiV2ViREFWIFx1NTdGQVx1Nzg0MFx1NTczMFx1NTc0MFwiLCBcIldlYkRBViBiYXNlIFVSTFwiKSlcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdTY3MERcdTUyQTFcdTU2NjhcdTU3RkFcdTc4NDBcdTU3MzBcdTU3NDBcdUZGMENcdTRGOEJcdTU5ODJcdUZGMUFodHRwOi8veW91ci13ZWJkYXYtaG9zdDpwb3J0XCIsIFwiQmFzZSBzZXJ2ZXIgVVJMLiBFeGFtcGxlOiBodHRwOi8veW91ci13ZWJkYXYtaG9zdDpwb3J0XCIpKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJodHRwOi8veW91ci13ZWJkYXYtaG9zdDpwb3J0XCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLndlYmRhdlVybClcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy53ZWJkYXZVcmwgPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KSxcbiAgICAgICk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdThEMjZcdTUzRjdcIiwgXCJVc2VybmFtZVwiKSlcclxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XHJcbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VybmFtZSkub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VybmFtZSA9IHZhbHVlLnRyaW0oKTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgIH0pLFxyXG4gICAgICApO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU1QkM2XHU3ODAxXCIsIFwiUGFzc3dvcmRcIikpXHJcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdTlFRDhcdThCQTRcdTk2OTBcdTg1Q0ZcdUZGMENcdTUzRUZcdTcwQjlcdTUxRkJcdTUzRjNcdTRGQTdcdTYzMDlcdTk0QUVcdTY2M0VcdTc5M0FcdTYyMTZcdTk2OTBcdTg1Q0ZcdTMwMDJcIiwgXCJIaWRkZW4gYnkgZGVmYXVsdC4gVXNlIHRoZSBidXR0b24gb24gdGhlIHJpZ2h0IHRvIHNob3cgb3IgaGlkZSBpdC5cIikpXHJcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PiB7XHJcbiAgICAgICAgdGV4dC5pbnB1dEVsLnR5cGUgPSBcInBhc3N3b3JkXCI7XHJcbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXNzd29yZCkub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXNzd29yZCA9IHZhbHVlO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5hZGRFeHRyYUJ1dHRvbigoYnV0dG9uKSA9PiB7XHJcbiAgICAgICAgbGV0IHZpc2libGUgPSBmYWxzZTtcclxuICAgICAgICBidXR0b24uc2V0SWNvbihcImV5ZVwiKTtcclxuICAgICAgICBidXR0b24uc2V0VG9vbHRpcCh0aGlzLnBsdWdpbi50KFwiXHU2NjNFXHU3OTNBXHU1QkM2XHU3ODAxXCIsIFwiU2hvdyBwYXNzd29yZFwiKSk7XHJcbiAgICAgICAgYnV0dG9uLm9uQ2xpY2soKCkgPT4ge1xyXG4gICAgICAgICAgY29uc3QgaW5wdXQgPSBidXR0b24uZXh0cmFTZXR0aW5nc0VsLnBhcmVudEVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3IoXCJpbnB1dFwiKTtcclxuICAgICAgICAgIGlmICghKGlucHV0IGluc3RhbmNlb2YgSFRNTElucHV0RWxlbWVudCkpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIHZpc2libGUgPSAhdmlzaWJsZTtcclxuICAgICAgICAgIGlucHV0LnR5cGUgPSB2aXNpYmxlID8gXCJ0ZXh0XCIgOiBcInBhc3N3b3JkXCI7XHJcbiAgICAgICAgICBidXR0b24uc2V0SWNvbih2aXNpYmxlID8gXCJleWUtb2ZmXCIgOiBcImV5ZVwiKTtcclxuICAgICAgICAgIGJ1dHRvbi5zZXRUb29sdGlwKHRoaXMucGx1Z2luLnQodmlzaWJsZSA/IFwiXHU5NjkwXHU4NUNGXHU1QkM2XHU3ODAxXCIgOiBcIlx1NjYzRVx1NzkzQVx1NUJDNlx1NzgwMVwiLCB2aXNpYmxlID8gXCJIaWRlIHBhc3N3b3JkXCIgOiBcIlNob3cgcGFzc3dvcmRcIikpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTU2RkVcdTcyNDdcdThGRENcdTdBMEJcdTc2RUVcdTVGNTVcIiwgXCJJbWFnZSByZW1vdGUgZm9sZGVyXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTRFMTNcdTk1RThcdTc1MjhcdTRFOEVcdTVCNThcdTY1M0VcdThGRENcdTdBMEJcdTU2RkVcdTcyNDdcdTc2ODQgV2ViREFWIFx1NzZFRVx1NUY1NVx1RkYwQ1x1NEY4Qlx1NTk4Mlx1RkYxQS9yZW1vdGUtaW1hZ2VzL1x1MzAwMlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NjIxMFx1NTI5Rlx1NTQwRVx1NEYxQVx1N0FDQlx1NTM3M1x1NTIyMFx1OTY2NFx1NjcyQ1x1NTczMFx1NTZGRVx1NzI0N1x1NjU4N1x1NEVGNlx1MzAwMlwiLFxuICAgICAgICAgIFwiRGVkaWNhdGVkIFdlYkRBViBmb2xkZXIgZm9yIHJlbW90ZSBpbWFnZXMsIGZvciBleGFtcGxlOiAvcmVtb3RlLWltYWdlcy8uIExvY2FsIGltYWdlIGZpbGVzIGFyZSBkZWxldGVkIGltbWVkaWF0ZWx5IGFmdGVyIHVwbG9hZCBzdWNjZWVkcy5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnJlbW90ZUZvbGRlcikub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmVtb3RlRm9sZGVyID0gbm9ybWFsaXplUGF0aCh2YWx1ZS50cmltKCkgfHwgXCIvcmVtb3RlLWltYWdlcy9cIik7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pLFxuICAgICAgKTtcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTZENEJcdThCRDVcdThGREVcdTYzQTVcIiwgXCJUZXN0IGNvbm5lY3Rpb25cIikpXHJcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdTRGN0ZcdTc1MjhcdTRFMzRcdTY1RjZcdTYzQTJcdTk0ODhcdTY1ODdcdTRFRjZcdTlBOENcdThCQzEgUFVUXHUzMDAxR0VUXHUzMDAxREVMRVRFIFx1NjYyRlx1NTQyNlx1NkI2M1x1NUUzOFx1MzAwMlwiLCBcIlZlcmlmeSBQVVQsIEdFVCwgYW5kIERFTEVURSB1c2luZyBhIHRlbXBvcmFyeSBwcm9iZSBmaWxlLlwiKSlcclxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxyXG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KHRoaXMucGx1Z2luLnQoXCJcdTVGMDBcdTU5Q0JcdTZENEJcdThCRDVcIiwgXCJSdW4gdGVzdFwiKSkub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XHJcbiAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5ydW5Db25uZWN0aW9uVGVzdCh0cnVlKTtcclxuICAgICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZChmYWxzZSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSksXHJcbiAgICAgICk7XHJcblxyXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMucGx1Z2luLnQoXCJcdTU0MENcdTZCNjVcdThCQkVcdTdGNkVcIiwgXCJTeW5jXCIpIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4RkRDXHU3QTBCXHU3QjE0XHU4QkIwXHU3NkVFXHU1RjU1XCIsIFwiUmVtb3RlIG5vdGVzIGZvbGRlclwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU3NTI4XHU0RThFXHU1QjU4XHU2NTNFXHU3QjE0XHU4QkIwXHU1NDhDXHU1MTc2XHU0RUQ2XHU5NzVFXHU1NkZFXHU3MjQ3XHU5NjQ0XHU0RUY2XHU1MzlGXHU2ODM3XHU1NDBDXHU2QjY1XHU1MjZGXHU2NzJDXHU3Njg0XHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHVGRjBDXHU0RjhCXHU1OTgyXHVGRjFBL3ZhdWx0LXN5bmMvXHUzMDAyXHU2M0QyXHU0RUY2XHU0RjFBXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU2NTc0XHU0RTJBIHZhdWx0XHVGRjBDXHU1RTc2XHU4REYzXHU4RkM3IC5vYnNpZGlhblx1MzAwMVx1NjNEMlx1NEVGNlx1NzZFRVx1NUY1NVx1NTQ4Q1x1NTZGRVx1NzI0N1x1NjU4N1x1NEVGNlx1MzAwMlwiLFxuICAgICAgICAgIFwiUmVtb3RlIGZvbGRlciB1c2VkIGZvciBub3RlcyBhbmQgb3RoZXIgbm9uLWltYWdlIGF0dGFjaG1lbnRzIHN5bmNlZCBhcy1pcywgZm9yIGV4YW1wbGU6IC92YXVsdC1zeW5jLy4gVGhlIHBsdWdpbiBzeW5jcyB0aGUgd2hvbGUgdmF1bHQgYW5kIGF1dG9tYXRpY2FsbHkgc2tpcHMgLm9ic2lkaWFuLCB0aGUgcGx1Z2luIGRpcmVjdG9yeSwgYW5kIGltYWdlIGZpbGVzLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIgPSBub3JtYWxpemVQYXRoKHZhbHVlLnRyaW0oKSB8fCBcIi92YXVsdC1zeW5jL1wiKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU5ODkxXHU3Mzg3XCIsIFwiQXV0byBzeW5jIGZyZXF1ZW5jeVwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU0RUU1XHU1MjA2XHU5NDlGXHU0RTNBXHU1MzU1XHU0RjREXHU4QkJFXHU3RjZFXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU2NUY2XHU5NUY0XHUzMDAyXHU1ODZCIDAgXHU4ODY4XHU3OTNBXHU1MTczXHU5NUVEXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHUzMDAyXHU4RkQ5XHU5MUNDXHU3Njg0XHU1NDBDXHU2QjY1XHU2NjJGXHUyMDFDXHU1QkY5XHU4RDI2XHU1NDBDXHU2QjY1XHUyMDFEXHVGRjFBXHU0RjFBXHU2OEMwXHU2N0U1XHU2NzJDXHU1NzMwXHU0RTBFXHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHU1REVFXHU1RjAyXHVGRjBDXHU4ODY1XHU0RjIwXHU2NUIwXHU1ODlFXHU1NDhDXHU1M0Q4XHU2NkY0XHU2NTg3XHU0RUY2XHVGRjBDXHU1RTc2XHU1MjIwXHU5NjY0XHU4RkRDXHU3QUVGXHU1OTFBXHU0RjU5XHU1MTg1XHU1QkI5XHUzMDAyXCIsXG4gICAgICAgICAgXCJTZXQgdGhlIGF1dG9tYXRpYyBzeW5jIGludGVydmFsIGluIG1pbnV0ZXMuIFVzZSAwIHRvIHR1cm4gaXQgb2ZmLiBUaGlzIGlzIGEgcmVjb25jaWxpYXRpb24gc3luYzogaXQgY2hlY2tzIGxvY2FsIGFuZCByZW1vdGUgZGlmZmVyZW5jZXMsIHVwbG9hZHMgbmV3IG9yIGNoYW5nZWQgZmlsZXMsIGFuZCByZW1vdmVzIGV4dHJhIHJlbW90ZSBjb250ZW50LlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCIwXCIpXG4gICAgICAgICAgLnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvU3luY0ludGVydmFsTWludXRlcykpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gTnVtYmVyLnBhcnNlSW50KHZhbHVlLCAxMCk7XG4gICAgICAgICAgICBpZiAoIU51bWJlci5pc05hTihwYXJzZWQpKSB7XG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzID0gTWF0aC5tYXgoMCwgcGFyc2VkKTtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU3QjE0XHU4QkIwXHU2NzJDXHU1NzMwXHU0RkREXHU3NTU5XHU2QTIxXHU1RjBGXCIsIFwiTm90ZSBsb2NhbCByZXRlbnRpb24gbW9kZVwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU1QjhDXHU2NTc0XHU2NzJDXHU1NzMwXHVGRjFBXHU3QjE0XHU4QkIwXHU1OUNCXHU3RUM4XHU0RkREXHU3NTU5XHU1NzI4XHU2NzJDXHU1NzMwXHUzMDAyXHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXHVGRjFBXHU5NTdGXHU2NzFGXHU2NzJBXHU4QkJGXHU5NUVFXHU3Njg0IE1hcmtkb3duIFx1N0IxNFx1OEJCMFx1NEYxQVx1ODhBQlx1NjZGRlx1NjM2Mlx1NEUzQVx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1NjU4N1x1NEVGNlx1RkYwQ1x1NjI1M1x1NUYwMFx1NjVGNlx1NTE4RFx1NEVDRVx1OEZEQ1x1N0FFRlx1NjA2Mlx1NTkwRFx1MzAwMlwiLFxuICAgICAgICAgIFwiRnVsbCBsb2NhbDogbm90ZXMgYWx3YXlzIHN0YXkgbG9jYWwuIExhenkgbm90ZXM6IHN0YWxlIE1hcmtkb3duIG5vdGVzIGFyZSByZXBsYWNlZCB3aXRoIGxvY2FsIHBsYWNlaG9sZGVyIGZpbGVzIGFuZCByZXN0b3JlZCBmcm9tIHJlbW90ZSB3aGVuIG9wZW5lZC5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGREcm9wZG93bigoZHJvcGRvd24pID0+XG4gICAgICAgIGRyb3Bkb3duXG4gICAgICAgICAgLmFkZE9wdGlvbihcImZ1bGwtbG9jYWxcIiwgdGhpcy5wbHVnaW4udChcIlx1NUI4Q1x1NjU3NFx1NjcyQ1x1NTczMFwiLCBcIkZ1bGwgbG9jYWxcIikpXG4gICAgICAgICAgLmFkZE9wdGlvbihcImxhenktbm90ZXNcIiwgdGhpcy5wbHVnaW4udChcIlx1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFwiLCBcIkxhenkgbm90ZXNcIikpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVTdG9yYWdlTW9kZSlcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlU3RvcmFnZU1vZGUgPSB2YWx1ZSBhcyBcImZ1bGwtbG9jYWxcIiB8IFwibGF6eS1ub3Rlc1wiO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU3QjE0XHU4QkIwXHU2NzJDXHU1NzMwXHU1NkRFXHU2NTM2XHU1OTI5XHU2NTcwXCIsIFwiTm90ZSBldmljdGlvbiBkYXlzXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTRFQzVcdTU3MjhcdTIwMUNcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTdCMTRcdThCQjBcdTIwMURcdTZBMjFcdTVGMEZcdTRFMEJcdTc1MUZcdTY1NDhcdTMwMDJcdThEODVcdThGQzdcdThGRDlcdTRFMkFcdTU5MjlcdTY1NzBcdTY3MkFcdTYyNTNcdTVGMDBcdTc2ODQgTWFya2Rvd24gXHU3QjE0XHU4QkIwXHVGRjBDXHU0RjFBXHU1NzI4XHU1NDBDXHU2QjY1XHU1NDBFXHU4OEFCXHU2NkZGXHU2MzYyXHU0RTNBXHU2NzJDXHU1NzMwXHU1MzYwXHU0RjREXHU2NTg3XHU0RUY2XHUzMDAyXCIsXG4gICAgICAgICAgXCJVc2VkIG9ubHkgaW4gbGF6eSBub3RlIG1vZGUuIE1hcmtkb3duIG5vdGVzIG5vdCBvcGVuZWQgd2l0aGluIHRoaXMgbnVtYmVyIG9mIGRheXMgYXJlIHJlcGxhY2VkIHdpdGggbG9jYWwgcGxhY2Vob2xkZXIgZmlsZXMgYWZ0ZXIgc3luYy5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiMzBcIilcbiAgICAgICAgICAuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVFdmljdEFmdGVyRGF5cykpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gTnVtYmVyLnBhcnNlSW50KHZhbHVlLCAxMCk7XG4gICAgICAgICAgICBpZiAoIU51bWJlci5pc05hTihwYXJzZWQpKSB7XG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVFdmljdEFmdGVyRGF5cyA9IE1hdGgubWF4KDEsIHBhcnNlZCk7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NTQwQ1x1NkI2NVx1NzJCNlx1NjAwMVwiLCBcIlN5bmMgc3RhdHVzXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgYCR7dGhpcy5wbHVnaW4uZm9ybWF0TGFzdFN5bmNMYWJlbCgpfVxcbiR7dGhpcy5wbHVnaW4uZm9ybWF0U3luY1N0YXR1c0xhYmVsKCl9XFxuJHt0aGlzLnBsdWdpbi50KFwiXHU4QkY0XHU2NjBFXHVGRjFBXHU3QUNCXHU1MzczXHU1NDBDXHU2QjY1XHU0RjFBXHU2MjY3XHU4ODRDXHU2NzJDXHU1NzMwXHU0RTBFXHU4RkRDXHU3QUVGXHU3Njg0XHU1QkY5XHU4RDI2XHVGRjBDXHU1NDBDXHU2QjY1XHU3QjE0XHU4QkIwXHU0RTBFXHU5NzVFXHU1NkZFXHU3MjQ3XHU5NjQ0XHU0RUY2XHVGRjBDXHU1RTc2XHU2RTA1XHU3NDA2XHU4RkRDXHU3QUVGXHU1MTk3XHU0RjU5XHU2NTg3XHU0RUY2XHUzMDAyXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU0RUNEXHU3NTMxXHU3MkVDXHU3QUNCXHU5NjFGXHU1MjE3XHU1OTA0XHU3NDA2XHUzMDAyXCIsIFwiTm90ZTogU3luYyBub3cgcmVjb25jaWxlcyBsb2NhbCBhbmQgcmVtb3RlIGNvbnRlbnQsIHN5bmNzIG5vdGVzIGFuZCBub24taW1hZ2UgYXR0YWNobWVudHMsIGFuZCBjbGVhbnMgZXh0cmEgcmVtb3RlIGZpbGVzLiBJbWFnZSB1cGxvYWRzIGNvbnRpbnVlIHRvIGJlIGhhbmRsZWQgYnkgdGhlIHNlcGFyYXRlIHF1ZXVlLlwiKX1gLFxuICAgICAgICAgIGAke3RoaXMucGx1Z2luLmZvcm1hdExhc3RTeW5jTGFiZWwoKX1cXG4ke3RoaXMucGx1Z2luLmZvcm1hdFN5bmNTdGF0dXNMYWJlbCgpfVxcbiR7dGhpcy5wbHVnaW4udChcIlx1OEJGNFx1NjYwRVx1RkYxQVx1N0FDQlx1NTM3M1x1NTQwQ1x1NkI2NVx1NEYxQVx1NjI2N1x1ODg0Q1x1NjcyQ1x1NTczMFx1NEUwRVx1OEZEQ1x1N0FFRlx1NzY4NFx1NUJGOVx1OEQyNlx1RkYwQ1x1NTQwQ1x1NkI2NVx1N0IxNFx1OEJCMFx1NEUwRVx1OTc1RVx1NTZGRVx1NzI0N1x1OTY0NFx1NEVGNlx1RkYwQ1x1NUU3Nlx1NkUwNVx1NzQwNlx1OEZEQ1x1N0FFRlx1NTE5N1x1NEY1OVx1NjU4N1x1NEVGNlx1MzAwMlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NEVDRFx1NzUzMVx1NzJFQ1x1N0FDQlx1OTYxRlx1NTIxN1x1NTkwNFx1NzQwNlx1MzAwMlwiLCBcIk5vdGU6IFN5bmMgbm93IHJlY29uY2lsZXMgbG9jYWwgYW5kIHJlbW90ZSBjb250ZW50LCBzeW5jcyBub3RlcyBhbmQgbm9uLWltYWdlIGF0dGFjaG1lbnRzLCBhbmQgY2xlYW5zIGV4dHJhIHJlbW90ZSBmaWxlcy4gSW1hZ2UgdXBsb2FkcyBjb250aW51ZSB0byBiZSBoYW5kbGVkIGJ5IHRoZSBzZXBhcmF0ZSBxdWV1ZS5cIil9YCxcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodGhpcy5wbHVnaW4udChcIlx1N0FDQlx1NTM3M1x1NTQwQ1x1NkI2NVwiLCBcIlN5bmMgbm93XCIpKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50KHRydWUpO1xuICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZChmYWxzZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy5wbHVnaW4udChcIlx1NEUwMFx1NkIyMVx1NjAyN1x1NURFNVx1NTE3N1wiLCBcIk9uZS10aW1lIHRvb2xzXCIpIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4RkMxXHU3OUZCXHU2NTc0XHU1RTkzXHU1MzlGXHU3NTFGXHU1NkZFXHU3MjQ3XHU1RjE1XHU3NTI4XCIsIFwiTWlncmF0ZSBuYXRpdmUgaW1hZ2UgZW1iZWRzIGluIHZhdWx0XCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTYyNkJcdTYzQ0ZcdTY1NzRcdTVFOTNcdTYyNDBcdTY3MDkgTWFya2Rvd24gXHU3QjE0XHU4QkIwXHVGRjBDXHU2MjhBIE9ic2lkaWFuIFx1NTM5Rlx1NzUxRlx1NjcyQ1x1NTczMFx1NTZGRVx1NzI0N1x1NUYxNVx1NzUyOFx1RkYwOFx1NTk4MiAhW10oKSBcdTU0OEMgIVtbLi4uXV1cdUZGMDlcdTRFMEFcdTRGMjBcdTUyMzBcdThGRENcdTdBRUZcdTU2RkVcdTcyNDdcdTc2RUVcdTVGNTVcdUZGMENcdTVFNzZcdTY1MzlcdTUxOTlcdTRFM0Egc2VjdXJlLXdlYmRhdiBcdTRFRTNcdTc4MDFcdTU3NTdcdTMwMDJcdTY1RTdcdTcyNDggc3BhbiBcdTU0OENcdTY1RTlcdTY3MUYgd2ViZGF2LXNlY3VyZSBcdTk0RkVcdTYzQTVcdTRFNUZcdTRGMUFcdTRFMDBcdTVFNzZcdTY1MzZcdTY1NUJcdTUyMzBcdTY1QjBcdTY4M0NcdTVGMEZcdTMwMDJcIixcbiAgICAgICAgICBcIlNjYW4gYWxsIE1hcmtkb3duIG5vdGVzIGluIHRoZSB2YXVsdCwgdXBsb2FkIG5hdGl2ZSBsb2NhbCBpbWFnZSBlbWJlZHMgKHN1Y2ggYXMgIVtdKCkgYW5kICFbWy4uLl1dKSB0byB0aGUgcmVtb3RlIGltYWdlIGZvbGRlciwgYW5kIHJld3JpdGUgdGhlbSBhcyBzZWN1cmUtd2ViZGF2IGNvZGUgYmxvY2tzLiBMZWdhY3kgc3BhbiB0YWdzIGFuZCBlYXJseSB3ZWJkYXYtc2VjdXJlIGxpbmtzIGFyZSBhbHNvIG5vcm1hbGl6ZWQgdG8gdGhlIG5ldyBmb3JtYXQuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KHRoaXMucGx1Z2luLnQoXCJcdTVGMDBcdTU5Q0JcdThGQzFcdTc5RkJcIiwgXCJSdW4gbWlncmF0aW9uXCIpKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLm1pZ3JhdGVBbGxMZWdhY3lTZWN1cmVJbWFnZXMoKTtcbiAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKGZhbHNlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgfVxufVxuXHJcbmNsYXNzIFJlc3VsdE1vZGFsIGV4dGVuZHMgTW9kYWwge1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgdGl0bGVUZXh0OiBzdHJpbmc7XHJcbiAgcHJpdmF0ZSByZWFkb25seSBib2R5VGV4dDogc3RyaW5nO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgdGl0bGVUZXh0OiBzdHJpbmcsIGJvZHlUZXh0OiBzdHJpbmcpIHtcclxuICAgIHN1cGVyKGFwcCk7XHJcbiAgICB0aGlzLnRpdGxlVGV4dCA9IHRpdGxlVGV4dDtcclxuICAgIHRoaXMuYm9keVRleHQgPSBib2R5VGV4dDtcclxuICB9XHJcblxyXG4gIG9uT3BlbigpOiB2b2lkIHtcclxuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgY29udGVudEVsLmVtcHR5KCk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMudGl0bGVUZXh0IH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IHRoaXMuYm9keVRleHQgfSk7XHJcbiAgfVxyXG5cclxuICBvbkNsb3NlKCk6IHZvaWQge1xyXG4gICAgdGhpcy5jb250ZW50RWwuZW1wdHkoKTtcclxuICB9XHJcbn1cclxuXHJcbiIsICJpbXBvcnQgeyBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0LCBNYXJrZG93blJlbmRlckNoaWxkIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmV4cG9ydCBjb25zdCBTRUNVUkVfUFJPVE9DT0wgPSBcIndlYmRhdi1zZWN1cmU6XCI7XG5leHBvcnQgY29uc3QgU0VDVVJFX0NPREVfQkxPQ0sgPSBcInNlY3VyZS13ZWJkYXZcIjtcblxuZXhwb3J0IHR5cGUgU2VjdXJlV2ViZGF2SW1hZ2VCbG9jayA9IHtcbiAgcGF0aDogc3RyaW5nO1xuICBhbHQ6IHN0cmluZztcbn07XG5cbnR5cGUgU2VjdXJlV2ViZGF2SW1hZ2VTdXBwb3J0RGVwcyA9IHtcbiAgdDogKHpoOiBzdHJpbmcsIGVuOiBzdHJpbmcpID0+IHN0cmluZztcbiAgZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmw6IChyZW1vdGVQYXRoOiBzdHJpbmcpID0+IFByb21pc2U8c3RyaW5nPjtcbn07XG5cbmNsYXNzIFNlY3VyZVdlYmRhdlJlbmRlckNoaWxkIGV4dGVuZHMgTWFya2Rvd25SZW5kZXJDaGlsZCB7XG4gIGNvbnN0cnVjdG9yKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIHN1cGVyKGNvbnRhaW5lckVsKTtcbiAgfVxuXG4gIG9udW5sb2FkKCk6IHZvaWQge31cbn1cblxuLy8gS2VlcCBzZWN1cmUgaW1hZ2UgcGFyc2luZyBhbmQgcmVuZGVyaW5nIGlzb2xhdGVkIHNvIHN5bmMgY2hhbmdlcyBkbyBub3Rcbi8vIGFjY2lkZW50YWxseSBicmVhayB0aGUgZGlzcGxheSBwaXBlbGluZSBhZ2Fpbi5cbmV4cG9ydCBjbGFzcyBTZWN1cmVXZWJkYXZJbWFnZVN1cHBvcnQge1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGRlcHM6IFNlY3VyZVdlYmRhdkltYWdlU3VwcG9ydERlcHMpIHt9XG5cbiAgYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmw6IHN0cmluZywgYWx0OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5leHRyYWN0UmVtb3RlUGF0aChyZW1vdGVVcmwpO1xuICAgIGlmICghcmVtb3RlUGF0aCkge1xuICAgICAgcmV0dXJuIGAhW10oJHtyZW1vdGVVcmx9KWA7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayhyZW1vdGVQYXRoLCBhbHQpO1xuICB9XG5cbiAgYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayhyZW1vdGVQYXRoOiBzdHJpbmcsIGFsdDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZEFsdCA9IChhbHQgfHwgcmVtb3RlUGF0aCkucmVwbGFjZSgvXFxyP1xcbi9nLCBcIiBcIikudHJpbSgpO1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gcmVtb3RlUGF0aC5yZXBsYWNlKC9cXHI/XFxuL2csIFwiXCIpLnRyaW0oKTtcbiAgICByZXR1cm4gW2BcXGBcXGBcXGAke1NFQ1VSRV9DT0RFX0JMT0NLfWAsIGBwYXRoOiAke25vcm1hbGl6ZWRQYXRofWAsIGBhbHQ6ICR7bm9ybWFsaXplZEFsdH1gLCBcImBgYFwiXS5qb2luKFwiXFxuXCIpO1xuICB9XG5cbiAgcGFyc2VTZWN1cmVJbWFnZUJsb2NrKHNvdXJjZTogc3RyaW5nKTogU2VjdXJlV2ViZGF2SW1hZ2VCbG9jayB8IG51bGwge1xuICAgIGNvbnN0IHJlc3VsdDogU2VjdXJlV2ViZGF2SW1hZ2VCbG9jayA9IHsgcGF0aDogXCJcIiwgYWx0OiBcIlwiIH07XG4gICAgZm9yIChjb25zdCByYXdMaW5lIG9mIHNvdXJjZS5zcGxpdCgvXFxyP1xcbi8pKSB7XG4gICAgICBjb25zdCBsaW5lID0gcmF3TGluZS50cmltKCk7XG4gICAgICBpZiAoIWxpbmUpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHNlcGFyYXRvckluZGV4ID0gbGluZS5pbmRleE9mKFwiOlwiKTtcbiAgICAgIGlmIChzZXBhcmF0b3JJbmRleCA9PT0gLTEpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGtleSA9IGxpbmUuc2xpY2UoMCwgc2VwYXJhdG9ySW5kZXgpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgY29uc3QgdmFsdWUgPSBsaW5lLnNsaWNlKHNlcGFyYXRvckluZGV4ICsgMSkudHJpbSgpO1xuICAgICAgaWYgKGtleSA9PT0gXCJwYXRoXCIpIHtcbiAgICAgICAgcmVzdWx0LnBhdGggPSB2YWx1ZTtcbiAgICAgIH0gZWxzZSBpZiAoa2V5ID09PSBcImFsdFwiKSB7XG4gICAgICAgIHJlc3VsdC5hbHQgPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0LnBhdGggPyByZXN1bHQgOiBudWxsO1xuICB9XG5cbiAgYXN5bmMgcHJvY2Vzc1NlY3VyZUltYWdlcyhlbDogSFRNTEVsZW1lbnQsIGN0eDogTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dCkge1xuICAgIGNvbnN0IHNlY3VyZUNvZGVCbG9ja3MgPSBBcnJheS5mcm9tKGVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KGBwcmUgPiBjb2RlLmxhbmd1YWdlLSR7U0VDVVJFX0NPREVfQkxPQ0t9YCkpO1xuICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgc2VjdXJlQ29kZUJsb2Nrcy5tYXAoYXN5bmMgKGNvZGVFbCkgPT4ge1xuICAgICAgICBjb25zdCBwcmUgPSBjb2RlRWwucGFyZW50RWxlbWVudDtcbiAgICAgICAgaWYgKCEocHJlIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHx8IHByZS5oYXNBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXYtcmVuZGVyZWRcIikpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwYXJzZWQgPSB0aGlzLnBhcnNlU2VjdXJlSW1hZ2VCbG9jayhjb2RlRWwudGV4dENvbnRlbnQgPz8gXCJcIik7XG4gICAgICAgIGlmICghcGFyc2VkPy5wYXRoKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgcHJlLnNldEF0dHJpYnV0ZShcImRhdGEtc2VjdXJlLXdlYmRhdi1yZW5kZXJlZFwiLCBcInRydWVcIik7XG4gICAgICAgIGF3YWl0IHRoaXMucmVuZGVyU2VjdXJlSW1hZ2VJbnRvRWxlbWVudChwcmUsIHBhcnNlZC5wYXRoLCBwYXJzZWQuYWx0IHx8IHBhcnNlZC5wYXRoKTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zdCBzZWN1cmVOb2RlcyA9IEFycmF5LmZyb20oZWwucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXCJbZGF0YS1zZWN1cmUtd2ViZGF2XVwiKSk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICBzZWN1cmVOb2Rlcy5tYXAoYXN5bmMgKG5vZGUpID0+IHtcbiAgICAgICAgaWYgKG5vZGUgaW5zdGFuY2VvZiBIVE1MSW1hZ2VFbGVtZW50KSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5zd2FwSW1hZ2VTb3VyY2Uobm9kZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IG5vZGUuZ2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2XCIpO1xuICAgICAgICBpZiAoIXJlbW90ZVBhdGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xuICAgICAgICBpbWcuYWx0ID0gbm9kZS5nZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIpID8/IG5vZGUuZ2V0QXR0cmlidXRlKFwiYWx0XCIpID8/IFwiU2VjdXJlIFdlYkRBViBpbWFnZVwiO1xuICAgICAgICBpbWcuc2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2XCIsIHJlbW90ZVBhdGgpO1xuICAgICAgICBpbWcuY2xhc3NMaXN0LmFkZChcInNlY3VyZS13ZWJkYXYtaW1hZ2VcIiwgXCJpcy1sb2FkaW5nXCIpO1xuICAgICAgICBub2RlLnJlcGxhY2VXaXRoKGltZyk7XG4gICAgICAgIGF3YWl0IHRoaXMuc3dhcEltYWdlU291cmNlKGltZyk7XG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgY29uc3Qgc2VjdXJlTGlua3MgPSBBcnJheS5mcm9tKGVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEltYWdlRWxlbWVudD4oYGltZ1tzcmNePVwiJHtTRUNVUkVfUFJPVE9DT0x9Ly9cIl1gKSk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoc2VjdXJlTGlua3MubWFwKGFzeW5jIChpbWcpID0+IHRoaXMuc3dhcEltYWdlU291cmNlKGltZykpKTtcblxuICAgIGN0eC5hZGRDaGlsZChuZXcgU2VjdXJlV2ViZGF2UmVuZGVyQ2hpbGQoZWwpKTtcbiAgfVxuXG4gIGFzeW5jIHByb2Nlc3NTZWN1cmVDb2RlQmxvY2soc291cmNlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCwgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0KSB7XG4gICAgY29uc3QgcGFyc2VkID0gdGhpcy5wYXJzZVNlY3VyZUltYWdlQmxvY2soc291cmNlKTtcbiAgICBpZiAoIXBhcnNlZD8ucGF0aCkge1xuICAgICAgZWwuY3JlYXRlRWwoXCJkaXZcIiwge1xuICAgICAgICB0ZXh0OiB0aGlzLmRlcHMudChcIlx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NEVFM1x1NzgwMVx1NTc1N1x1NjgzQ1x1NUYwRlx1NjVFMFx1NjU0OFx1MzAwMlwiLCBcIkludmFsaWQgc2VjdXJlIGltYWdlIGNvZGUgYmxvY2sgZm9ybWF0LlwiKSxcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMucmVuZGVyU2VjdXJlSW1hZ2VJbnRvRWxlbWVudChlbCwgcGFyc2VkLnBhdGgsIHBhcnNlZC5hbHQgfHwgcGFyc2VkLnBhdGgpO1xuICAgIGN0eC5hZGRDaGlsZChuZXcgU2VjdXJlV2ViZGF2UmVuZGVyQ2hpbGQoZWwpKTtcbiAgfVxuXG4gIGV4dHJhY3RSZW1vdGVQYXRoKHNyYzogc3RyaW5nKSB7XG4gICAgY29uc3QgcHJlZml4ID0gYCR7U0VDVVJFX1BST1RPQ09MfS8vYDtcbiAgICBpZiAoIXNyYy5zdGFydHNXaXRoKHByZWZpeCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiBzcmMuc2xpY2UocHJlZml4Lmxlbmd0aCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlbmRlclNlY3VyZUltYWdlSW50b0VsZW1lbnQoZWw6IEhUTUxFbGVtZW50LCByZW1vdGVQYXRoOiBzdHJpbmcsIGFsdDogc3RyaW5nKSB7XG4gICAgY29uc3QgaW1nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImltZ1wiKTtcbiAgICBpbWcuYWx0ID0gYWx0O1xuICAgIGltZy5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIiwgcmVtb3RlUGF0aCk7XG4gICAgaW1nLmNsYXNzTGlzdC5hZGQoXCJzZWN1cmUtd2ViZGF2LWltYWdlXCIsIFwiaXMtbG9hZGluZ1wiKTtcbiAgICBlbC5lbXB0eSgpO1xuICAgIGVsLmFwcGVuZENoaWxkKGltZyk7XG4gICAgYXdhaXQgdGhpcy5zd2FwSW1hZ2VTb3VyY2UoaW1nKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc3dhcEltYWdlU291cmNlKGltZzogSFRNTEltYWdlRWxlbWVudCkge1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSBpbWcuZ2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2XCIpID8/IHRoaXMuZXh0cmFjdFJlbW90ZVBhdGgoaW1nLmdldEF0dHJpYnV0ZShcInNyY1wiKSA/PyBcIlwiKTtcbiAgICBpZiAoIXJlbW90ZVBhdGgpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpbWcuY2xhc3NMaXN0LmFkZChcInNlY3VyZS13ZWJkYXYtaW1hZ2VcIiwgXCJpcy1sb2FkaW5nXCIpO1xuICAgIGNvbnN0IG9yaWdpbmFsQWx0ID0gaW1nLmFsdDtcbiAgICBpbWcuYWx0ID0gb3JpZ2luYWxBbHQgfHwgdGhpcy5kZXBzLnQoXCJcdTUyQTBcdThGN0RcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTRFMkQuLi5cIiwgXCJMb2FkaW5nIHNlY3VyZSBpbWFnZS4uLlwiKTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBibG9iVXJsID0gYXdhaXQgdGhpcy5kZXBzLmZldGNoU2VjdXJlSW1hZ2VCbG9iVXJsKHJlbW90ZVBhdGgpO1xuICAgICAgaW1nLnNyYyA9IGJsb2JVcmw7XG4gICAgICBpbWcuYWx0ID0gb3JpZ2luYWxBbHQ7XG4gICAgICBpbWcuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgIGltZy5zdHlsZS5tYXhXaWR0aCA9IFwiMTAwJVwiO1xuICAgICAgaW1nLmNsYXNzTGlzdC5yZW1vdmUoXCJpcy1sb2FkaW5nXCIsIFwiaXMtZXJyb3JcIik7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIGltYWdlIGxvYWQgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIGltZy5yZXBsYWNlV2l0aCh0aGlzLmJ1aWxkRXJyb3JFbGVtZW50KHJlbW90ZVBhdGgsIGVycm9yKSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBidWlsZEVycm9yRWxlbWVudChyZW1vdGVQYXRoOiBzdHJpbmcsIGVycm9yOiB1bmtub3duKSB7XG4gICAgY29uc3QgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGVsLmNsYXNzTmFtZSA9IFwic2VjdXJlLXdlYmRhdi1pbWFnZSBpcy1lcnJvclwiO1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG4gICAgZWwudGV4dENvbnRlbnQgPSB0aGlzLmRlcHMudChcbiAgICAgIGBcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTUyQTBcdThGN0RcdTU5MzFcdThEMjVcdUZGMUEke3JlbW90ZVBhdGh9XHVGRjA4JHttZXNzYWdlfVx1RkYwOWAsXG4gICAgICBgU2VjdXJlIGltYWdlIGZhaWxlZDogJHtyZW1vdGVQYXRofSAoJHttZXNzYWdlfSlgLFxuICAgICk7XG4gICAgcmV0dXJuIGVsO1xuICB9XG59XG4iLCAiaW1wb3J0IHsgQXBwLCBFZGl0b3IsIE1hcmtkb3duVmlldywgTm90aWNlLCBUQWJzdHJhY3RGaWxlLCBURmlsZSB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5leHBvcnQgdHlwZSBVcGxvYWRUYXNrID0ge1xuICBpZDogc3RyaW5nO1xuICBub3RlUGF0aDogc3RyaW5nO1xuICBwbGFjZWhvbGRlcjogc3RyaW5nO1xuICBtaW1lVHlwZTogc3RyaW5nO1xuICBmaWxlTmFtZTogc3RyaW5nO1xuICBkYXRhQmFzZTY0OiBzdHJpbmc7XG4gIGF0dGVtcHRzOiBudW1iZXI7XG4gIGNyZWF0ZWRBdDogbnVtYmVyO1xuICBsYXN0RXJyb3I/OiBzdHJpbmc7XG59O1xuXG50eXBlIFNlY3VyZVdlYmRhdlVwbG9hZFF1ZXVlRGVwcyA9IHtcbiAgYXBwOiBBcHA7XG4gIHQ6ICh6aDogc3RyaW5nLCBlbjogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIHNldHRpbmdzOiAoKSA9PiB7IG1heFJldHJ5QXR0ZW1wdHM6IG51bWJlcjsgcmV0cnlEZWxheVNlY29uZHM6IG51bWJlciB9O1xuICBnZXRRdWV1ZTogKCkgPT4gVXBsb2FkVGFza1tdO1xuICBzZXRRdWV1ZTogKHF1ZXVlOiBVcGxvYWRUYXNrW10pID0+IHZvaWQ7XG4gIHNhdmVQbHVnaW5TdGF0ZTogKCkgPT4gUHJvbWlzZTx2b2lkPjtcbiAgc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jOiAobm90ZVBhdGg6IHN0cmluZywgcmVhc29uOiBcImltYWdlLWFkZFwiIHwgXCJpbWFnZS1yZW1vdmVcIikgPT4gdm9pZDtcbiAgcmVxdWVzdFVybDogKG9wdGlvbnM6IHtcbiAgICB1cmw6IHN0cmluZztcbiAgICBtZXRob2Q6IHN0cmluZztcbiAgICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgICBib2R5PzogQXJyYXlCdWZmZXI7XG4gICAgZm9sbG93UmVkaXJlY3RzPzogYm9vbGVhbjtcbiAgICByZWRpcmVjdENvdW50PzogbnVtYmVyO1xuICB9KSA9PiBQcm9taXNlPHsgc3RhdHVzOiBudW1iZXI7IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47IGFycmF5QnVmZmVyOiBBcnJheUJ1ZmZlciB9PjtcbiAgYnVpbGRVcGxvYWRVcmw6IChyZW1vdGVQYXRoOiBzdHJpbmcpID0+IHN0cmluZztcbiAgYnVpbGRBdXRoSGVhZGVyOiAoKSA9PiBzdHJpbmc7XG4gIHByZXBhcmVVcGxvYWRQYXlsb2FkOiAoXG4gICAgYmluYXJ5OiBBcnJheUJ1ZmZlcixcbiAgICBtaW1lVHlwZTogc3RyaW5nLFxuICAgIGZpbGVOYW1lOiBzdHJpbmcsXG4gICkgPT4gUHJvbWlzZTx7IGJpbmFyeTogQXJyYXlCdWZmZXI7IG1pbWVUeXBlOiBzdHJpbmc7IGZpbGVOYW1lOiBzdHJpbmcgfT47XG4gIGJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5OiAoZmlsZU5hbWU6IHN0cmluZywgYmluYXJ5OiBBcnJheUJ1ZmZlcikgPT4gUHJvbWlzZTxzdHJpbmc+O1xuICBidWlsZFJlbW90ZVBhdGg6IChmaWxlTmFtZTogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIGJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXA6IChyZW1vdGVVcmw6IHN0cmluZywgYWx0OiBzdHJpbmcpID0+IHN0cmluZztcbiAgZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWU6IChmaWxlTmFtZTogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIGFycmF5QnVmZmVyVG9CYXNlNjQ6IChidWZmZXI6IEFycmF5QnVmZmVyKSA9PiBzdHJpbmc7XG4gIGJhc2U2NFRvQXJyYXlCdWZmZXI6IChiYXNlNjQ6IHN0cmluZykgPT4gQXJyYXlCdWZmZXI7XG4gIGVzY2FwZUh0bWw6ICh2YWx1ZTogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIGVzY2FwZVJlZ0V4cDogKHZhbHVlOiBzdHJpbmcpID0+IHN0cmluZztcbiAgZGVzY3JpYmVFcnJvcjogKHByZWZpeDogc3RyaW5nLCBlcnJvcjogdW5rbm93bikgPT4gc3RyaW5nO1xufTtcblxuLy8gT3ducyB0aGUgcXVldWVkIGltYWdlIHVwbG9hZCB3b3JrZmxvdyBzbyBzeW5jIGFuZCBub3RlIGxvZ2ljIGNhbiBzdGF5IHNlcGFyYXRlLlxuZXhwb3J0IGNsYXNzIFNlY3VyZVdlYmRhdlVwbG9hZFF1ZXVlU3VwcG9ydCB7XG4gIHByaXZhdGUgcHJvY2Vzc2luZ1Rhc2tJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSByZXRyeVRpbWVvdXRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgcHJpdmF0ZSBwZW5kaW5nVGFza1Byb21pc2VzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8dm9pZD4+KCk7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBkZXBzOiBTZWN1cmVXZWJkYXZVcGxvYWRRdWV1ZURlcHMpIHt9XG5cbiAgZGlzcG9zZSgpIHtcbiAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnJldHJ5VGltZW91dHMudmFsdWVzKCkpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICB9XG4gICAgdGhpcy5yZXRyeVRpbWVvdXRzLmNsZWFyKCk7XG4gIH1cblxuICBoYXNQZW5kaW5nV29yaygpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5kZXBzLmdldFF1ZXVlKCkubGVuZ3RoID4gMCB8fFxuICAgICAgdGhpcy5wcm9jZXNzaW5nVGFza0lkcy5zaXplID4gMCB8fFxuICAgICAgdGhpcy5wZW5kaW5nVGFza1Byb21pc2VzLnNpemUgPiAwXG4gICAgKTtcbiAgfVxuXG4gIGhhc1BlbmRpbmdXb3JrRm9yTm90ZShub3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcXVldWUgPSB0aGlzLmRlcHMuZ2V0UXVldWUoKTtcbiAgICBpZiAocXVldWUuc29tZSgodGFzaykgPT4gdGFzay5ub3RlUGF0aCA9PT0gbm90ZVBhdGgpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHRhc2tJZCBvZiB0aGlzLnByb2Nlc3NpbmdUYXNrSWRzKSB7XG4gICAgICBjb25zdCB0YXNrID0gcXVldWUuZmluZCgoaXRlbSkgPT4gaXRlbS5pZCA9PT0gdGFza0lkKTtcbiAgICAgIGlmICh0YXNrPy5ub3RlUGF0aCA9PT0gbm90ZVBhdGgpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBbdGFza0lkXSBvZiB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMpIHtcbiAgICAgIGNvbnN0IHRhc2sgPSBxdWV1ZS5maW5kKChpdGVtKSA9PiBpdGVtLmlkID09PSB0YXNrSWQpO1xuICAgICAgaWYgKHRhc2s/Lm5vdGVQYXRoID09PSBub3RlUGF0aCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBhc3luYyBlbnF1ZXVlRWRpdG9ySW1hZ2VVcGxvYWQobm90ZUZpbGU6IFRGaWxlLCBlZGl0b3I6IEVkaXRvciwgaW1hZ2VGaWxlOiBGaWxlLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGFycmF5QnVmZmVyID0gYXdhaXQgaW1hZ2VGaWxlLmFycmF5QnVmZmVyKCk7XG4gICAgICBjb25zdCB0YXNrID0gdGhpcy5jcmVhdGVVcGxvYWRUYXNrKFxuICAgICAgICBub3RlRmlsZS5wYXRoLFxuICAgICAgICBhcnJheUJ1ZmZlcixcbiAgICAgICAgaW1hZ2VGaWxlLnR5cGUgfHwgdGhpcy5kZXBzLmdldE1pbWVUeXBlRnJvbUZpbGVOYW1lKGZpbGVOYW1lKSxcbiAgICAgICAgZmlsZU5hbWUsXG4gICAgICApO1xuICAgICAgdGhpcy5pbnNlcnRQbGFjZWhvbGRlcihlZGl0b3IsIHRhc2sucGxhY2Vob2xkZXIpO1xuICAgICAgdGhpcy5kZXBzLnNldFF1ZXVlKFsuLi50aGlzLmRlcHMuZ2V0UXVldWUoKSwgdGFza10pO1xuICAgICAgYXdhaXQgdGhpcy5kZXBzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgdm9pZCB0aGlzLnByb2Nlc3NQZW5kaW5nVGFza3MoKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXBzLnQoXCJcdTVERjJcdTUyQTBcdTUxNjVcdTU2RkVcdTcyNDdcdTgxRUFcdTUyQThcdTRFMEFcdTRGMjBcdTk2MUZcdTUyMTdcdTMwMDJcIiwgXCJJbWFnZSBhZGRlZCB0byB0aGUgYXV0by11cGxvYWQgcXVldWUuXCIpKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBxdWV1ZSBzZWN1cmUgaW1hZ2UgdXBsb2FkXCIsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgIHRoaXMuZGVwcy5kZXNjcmliZUVycm9yKFxuICAgICAgICAgIHRoaXMuZGVwcy50KFwiXHU1MkEwXHU1MTY1XHU1NkZFXHU3MjQ3XHU4MUVBXHU1MkE4XHU0RTBBXHU0RjIwXHU5NjFGXHU1MjE3XHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIHF1ZXVlIGltYWdlIGZvciBhdXRvLXVwbG9hZFwiKSxcbiAgICAgICAgICBlcnJvcixcbiAgICAgICAgKSxcbiAgICAgICAgODAwMCxcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgY3JlYXRlVXBsb2FkVGFzayhub3RlUGF0aDogc3RyaW5nLCBiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKTogVXBsb2FkVGFzayB7XG4gICAgY29uc3QgaWQgPSBgc2VjdXJlLXdlYmRhdi10YXNrLSR7RGF0ZS5ub3coKX0tJHtNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLCA4KX1gO1xuICAgIHJldHVybiB7XG4gICAgICBpZCxcbiAgICAgIG5vdGVQYXRoLFxuICAgICAgcGxhY2Vob2xkZXI6IHRoaXMuYnVpbGRQZW5kaW5nUGxhY2Vob2xkZXIoaWQsIGZpbGVOYW1lKSxcbiAgICAgIG1pbWVUeXBlLFxuICAgICAgZmlsZU5hbWUsXG4gICAgICBkYXRhQmFzZTY0OiB0aGlzLmRlcHMuYXJyYXlCdWZmZXJUb0Jhc2U2NChiaW5hcnkpLFxuICAgICAgYXR0ZW1wdHM6IDAsXG4gICAgICBjcmVhdGVkQXQ6IERhdGUubm93KCksXG4gICAgfTtcbiAgfVxuXG4gIGJ1aWxkUGVuZGluZ1BsYWNlaG9sZGVyKHRhc2tJZDogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3Qgc2FmZU5hbWUgPSB0aGlzLmRlcHMuZXNjYXBlSHRtbChmaWxlTmFtZSk7XG4gICAgcmV0dXJuIGA8c3BhbiBjbGFzcz1cInNlY3VyZS13ZWJkYXYtcGVuZGluZ1wiIGRhdGEtc2VjdXJlLXdlYmRhdi10YXNrPVwiJHt0YXNrSWR9XCIgYXJpYS1sYWJlbD1cIiR7c2FmZU5hbWV9XCI+JHt0aGlzLmRlcHMuZXNjYXBlSHRtbCh0aGlzLmRlcHMudChgXHUzMDEwXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU0RTJEXHVGRjVDJHtmaWxlTmFtZX1cdTMwMTFgLCBgW1VwbG9hZGluZyBpbWFnZSB8ICR7ZmlsZU5hbWV9XWApKX08L3NwYW4+YDtcbiAgfVxuXG4gIGJ1aWxkRmFpbGVkUGxhY2Vob2xkZXIoZmlsZU5hbWU6IHN0cmluZywgbWVzc2FnZT86IHN0cmluZykge1xuICAgIGNvbnN0IHNhZmVOYW1lID0gdGhpcy5kZXBzLmVzY2FwZUh0bWwoZmlsZU5hbWUpO1xuICAgIGNvbnN0IHNhZmVNZXNzYWdlID0gdGhpcy5kZXBzLmVzY2FwZUh0bWwobWVzc2FnZSA/PyB0aGlzLmRlcHMudChcIlx1NjcyQVx1NzdFNVx1OTUxOVx1OEJFRlwiLCBcIlVua25vd24gZXJyb3JcIikpO1xuICAgIGNvbnN0IGxhYmVsID0gdGhpcy5kZXBzLmVzY2FwZUh0bWwodGhpcy5kZXBzLnQoYFx1MzAxMFx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NTkzMVx1OEQyNVx1RkY1QyR7ZmlsZU5hbWV9XHUzMDExYCwgYFtJbWFnZSB1cGxvYWQgZmFpbGVkIHwgJHtmaWxlTmFtZX1dYCkpO1xuICAgIHJldHVybiBgPHNwYW4gY2xhc3M9XCJzZWN1cmUtd2ViZGF2LWZhaWxlZFwiIGFyaWEtbGFiZWw9XCIke3NhZmVOYW1lfVwiPiR7bGFiZWx9OiAke3NhZmVNZXNzYWdlfTwvc3Bhbj5gO1xuICB9XG5cbiAgYXN5bmMgcHJvY2Vzc1BlbmRpbmdUYXNrcygpIHtcbiAgICBjb25zdCBydW5uaW5nOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IHRhc2sgb2YgdGhpcy5kZXBzLmdldFF1ZXVlKCkpIHtcbiAgICAgIGlmICh0aGlzLnByb2Nlc3NpbmdUYXNrSWRzLmhhcyh0YXNrLmlkKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgcnVubmluZy5wdXNoKHRoaXMuc3RhcnRQZW5kaW5nVGFzayh0YXNrKSk7XG4gICAgfVxuXG4gICAgYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHJ1bm5pbmcpO1xuICB9XG5cbiAgc3RhcnRQZW5kaW5nVGFzayh0YXNrOiBVcGxvYWRUYXNrKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMuZ2V0KHRhc2suaWQpO1xuICAgIGlmIChleGlzdGluZykge1xuICAgICAgcmV0dXJuIGV4aXN0aW5nO1xuICAgIH1cblxuICAgIGNvbnN0IHByb21pc2UgPSB0aGlzLnByb2Nlc3NUYXNrKHRhc2spLmZpbmFsbHkoKCkgPT4ge1xuICAgICAgdGhpcy5wZW5kaW5nVGFza1Byb21pc2VzLmRlbGV0ZSh0YXNrLmlkKTtcbiAgICB9KTtcbiAgICB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMuc2V0KHRhc2suaWQsIHByb21pc2UpO1xuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgcHJvY2Vzc1Rhc2sodGFzazogVXBsb2FkVGFzaykge1xuICAgIHRoaXMucHJvY2Vzc2luZ1Rhc2tJZHMuYWRkKHRhc2suaWQpO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBiaW5hcnkgPSB0aGlzLmRlcHMuYmFzZTY0VG9BcnJheUJ1ZmZlcih0YXNrLmRhdGFCYXNlNjQpO1xuICAgICAgY29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLmRlcHMucHJlcGFyZVVwbG9hZFBheWxvYWQoXG4gICAgICAgIGJpbmFyeSxcbiAgICAgICAgdGFzay5taW1lVHlwZSB8fCB0aGlzLmRlcHMuZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUodGFzay5maWxlTmFtZSksXG4gICAgICAgIHRhc2suZmlsZU5hbWUsXG4gICAgICApO1xuICAgICAgY29uc3QgcmVtb3RlTmFtZSA9IGF3YWl0IHRoaXMuZGVwcy5idWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeShwcmVwYXJlZC5maWxlTmFtZSwgcHJlcGFyZWQuYmluYXJ5KTtcbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmRlcHMuYnVpbGRSZW1vdGVQYXRoKHJlbW90ZU5hbWUpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmRlcHMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5kZXBzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgICBtZXRob2Q6IFwiUFVUXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmRlcHMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogcHJlcGFyZWQubWltZVR5cGUsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IHByZXBhcmVkLmJpbmFyeSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVcGxvYWQgZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXBsYWNlZCA9IGF3YWl0IHRoaXMucmVwbGFjZVBsYWNlaG9sZGVyKFxuICAgICAgICB0YXNrLm5vdGVQYXRoLFxuICAgICAgICB0YXNrLmlkLFxuICAgICAgICB0YXNrLnBsYWNlaG9sZGVyLFxuICAgICAgICB0aGlzLmRlcHMuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChgd2ViZGF2LXNlY3VyZTovLyR7cmVtb3RlUGF0aH1gLCBwcmVwYXJlZC5maWxlTmFtZSksXG4gICAgICApO1xuICAgICAgaWYgKCFyZXBsYWNlZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgdGhpcy5kZXBzLnQoXG4gICAgICAgICAgICBcIlx1NEUwQVx1NEYyMFx1NjIxMFx1NTI5Rlx1RkYwQ1x1NEY0Nlx1NkNBMVx1NjcwOVx1NTcyOFx1N0IxNFx1OEJCMFx1NEUyRFx1NjI3RVx1NTIzMFx1NTNFRlx1NjZGRlx1NjM2Mlx1NzY4NFx1NTM2MFx1NEY0RFx1N0IyNlx1MzAwMlwiLFxuICAgICAgICAgICAgXCJVcGxvYWQgc3VjY2VlZGVkLCBidXQgbm8gbWF0Y2hpbmcgcGxhY2Vob2xkZXIgd2FzIGZvdW5kIGluIHRoZSBub3RlLlwiLFxuICAgICAgICAgICksXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuZGVwcy5zZXRRdWV1ZSh0aGlzLmRlcHMuZ2V0UXVldWUoKS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uaWQgIT09IHRhc2suaWQpKTtcbiAgICAgIGF3YWl0IHRoaXMuZGVwcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIHRoaXMuZGVwcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmModGFzay5ub3RlUGF0aCwgXCJpbWFnZS1hZGRcIik7XG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVwcy50KFwiXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU2MjEwXHU1MjlGXHUzMDAyXCIsIFwiSW1hZ2UgdXBsb2FkZWQgc3VjY2Vzc2Z1bGx5LlwiKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIHF1ZXVlZCB1cGxvYWQgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIHRhc2suYXR0ZW1wdHMgKz0gMTtcbiAgICAgIHRhc2subGFzdEVycm9yID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xuICAgICAgYXdhaXQgdGhpcy5kZXBzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuXG4gICAgICBpZiAodGFzay5hdHRlbXB0cyA+PSB0aGlzLmRlcHMuc2V0dGluZ3MoKS5tYXhSZXRyeUF0dGVtcHRzKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucmVwbGFjZVBsYWNlaG9sZGVyKFxuICAgICAgICAgIHRhc2subm90ZVBhdGgsXG4gICAgICAgICAgdGFzay5pZCxcbiAgICAgICAgICB0YXNrLnBsYWNlaG9sZGVyLFxuICAgICAgICAgIHRoaXMuYnVpbGRGYWlsZWRQbGFjZWhvbGRlcih0YXNrLmZpbGVOYW1lLCB0YXNrLmxhc3RFcnJvciksXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGVwcy5zZXRRdWV1ZSh0aGlzLmRlcHMuZ2V0UXVldWUoKS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uaWQgIT09IHRhc2suaWQpKTtcbiAgICAgICAgYXdhaXQgdGhpcy5kZXBzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMuZGVwcy5kZXNjcmliZUVycm9yKHRoaXMuZGVwcy50KFwiXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU2NzAwXHU3RUM4XHU1OTMxXHU4RDI1XCIsIFwiSW1hZ2UgdXBsb2FkIGZhaWxlZCBwZXJtYW5lbnRseVwiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuc2NoZWR1bGVSZXRyeSh0YXNrKTtcbiAgICAgIH1cbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy5wcm9jZXNzaW5nVGFza0lkcy5kZWxldGUodGFzay5pZCk7XG4gICAgfVxuICB9XG5cbiAgc2NoZWR1bGVSZXRyeSh0YXNrOiBVcGxvYWRUYXNrKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLnJldHJ5VGltZW91dHMuZ2V0KHRhc2suaWQpO1xuICAgIGlmIChleGlzdGluZykge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dChleGlzdGluZyk7XG4gICAgfVxuXG4gICAgY29uc3QgZGVsYXkgPSBNYXRoLm1heCgxLCB0aGlzLmRlcHMuc2V0dGluZ3MoKS5yZXRyeURlbGF5U2Vjb25kcykgKiAxMDAwICogdGFzay5hdHRlbXB0cztcbiAgICBjb25zdCB0aW1lb3V0SWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLnJldHJ5VGltZW91dHMuZGVsZXRlKHRhc2suaWQpO1xuICAgICAgdm9pZCB0aGlzLnN0YXJ0UGVuZGluZ1Rhc2sodGFzayk7XG4gICAgfSwgZGVsYXkpO1xuICAgIHRoaXMucmV0cnlUaW1lb3V0cy5zZXQodGFzay5pZCwgdGltZW91dElkKTtcbiAgfVxuXG4gIHByaXZhdGUgaW5zZXJ0UGxhY2Vob2xkZXIoZWRpdG9yOiBFZGl0b3IsIHBsYWNlaG9sZGVyOiBzdHJpbmcpIHtcbiAgICBlZGl0b3IucmVwbGFjZVNlbGVjdGlvbihgJHtwbGFjZWhvbGRlcn1cXG5gKTtcbiAgfVxuXG4gIGFzeW5jIHJlcGxhY2VQbGFjZWhvbGRlcihub3RlUGF0aDogc3RyaW5nLCB0YXNrSWQ6IHN0cmluZywgcGxhY2Vob2xkZXI6IHN0cmluZywgcmVwbGFjZW1lbnQ6IHN0cmluZykge1xuICAgIGNvbnN0IHJlcGxhY2VkSW5FZGl0b3IgPSB0aGlzLnJlcGxhY2VQbGFjZWhvbGRlckluT3BlbkVkaXRvcnMobm90ZVBhdGgsIHRhc2tJZCwgcGxhY2Vob2xkZXIsIHJlcGxhY2VtZW50KTtcbiAgICBpZiAocmVwbGFjZWRJbkVkaXRvcikge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgY29uc3QgZmlsZSA9IHRoaXMuZGVwcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKG5vdGVQYXRoKTtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZGVwcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBpZiAoY29udGVudC5pbmNsdWRlcyhwbGFjZWhvbGRlcikpIHtcbiAgICAgIGNvbnN0IHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGxhY2Vob2xkZXIsIHJlcGxhY2VtZW50KTtcbiAgICAgIGlmICh1cGRhdGVkICE9PSBjb250ZW50KSB7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVwcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIHVwZGF0ZWQpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBwYXR0ZXJuID0gbmV3IFJlZ0V4cChcbiAgICAgIGA8c3BhbltePl0qZGF0YS1zZWN1cmUtd2ViZGF2LXRhc2s9XCIke3RoaXMuZGVwcy5lc2NhcGVSZWdFeHAodGFza0lkKX1cIltePl0qPi4qPzxcXFxcL3NwYW4+YCxcbiAgICAgIFwic1wiLFxuICAgICk7XG4gICAgaWYgKHBhdHRlcm4udGVzdChjb250ZW50KSkge1xuICAgICAgY29uc3QgdXBkYXRlZCA9IGNvbnRlbnQucmVwbGFjZShwYXR0ZXJuLCByZXBsYWNlbWVudCk7XG4gICAgICBpZiAodXBkYXRlZCAhPT0gY29udGVudCkge1xuICAgICAgICBhd2FpdCB0aGlzLmRlcHMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB1cGRhdGVkKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcHJpdmF0ZSByZXBsYWNlUGxhY2Vob2xkZXJJbk9wZW5FZGl0b3JzKG5vdGVQYXRoOiBzdHJpbmcsIHRhc2tJZDogc3RyaW5nLCBwbGFjZWhvbGRlcjogc3RyaW5nLCByZXBsYWNlbWVudDogc3RyaW5nKSB7XG4gICAgbGV0IHJlcGxhY2VkID0gZmFsc2U7XG4gICAgY29uc3QgbGVhdmVzID0gdGhpcy5kZXBzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFwibWFya2Rvd25cIik7XG5cbiAgICBmb3IgKGNvbnN0IGxlYWYgb2YgbGVhdmVzKSB7XG4gICAgICBjb25zdCB2aWV3ID0gbGVhZi52aWV3O1xuICAgICAgaWYgKCEodmlldyBpbnN0YW5jZW9mIE1hcmtkb3duVmlldykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghdmlldy5maWxlIHx8IHZpZXcuZmlsZS5wYXRoICE9PSBub3RlUGF0aCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZWRpdG9yID0gdmlldy5lZGl0b3I7XG4gICAgICBjb25zdCBjb250ZW50ID0gZWRpdG9yLmdldFZhbHVlKCk7XG4gICAgICBsZXQgdXBkYXRlZCA9IGNvbnRlbnQ7XG5cbiAgICAgIGlmIChjb250ZW50LmluY2x1ZGVzKHBsYWNlaG9sZGVyKSkge1xuICAgICAgICB1cGRhdGVkID0gY29udGVudC5yZXBsYWNlKHBsYWNlaG9sZGVyLCByZXBsYWNlbWVudCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBwYXR0ZXJuID0gbmV3IFJlZ0V4cChcbiAgICAgICAgICBgPHNwYW5bXj5dKmRhdGEtc2VjdXJlLXdlYmRhdi10YXNrPVwiJHt0aGlzLmRlcHMuZXNjYXBlUmVnRXhwKHRhc2tJZCl9XCJbXj5dKj4uKj88XFxcXC9zcGFuPmAsXG4gICAgICAgICAgXCJzXCIsXG4gICAgICAgICk7XG4gICAgICAgIHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGF0dGVybiwgcmVwbGFjZW1lbnQpO1xuICAgICAgfVxuXG4gICAgICBpZiAodXBkYXRlZCAhPT0gY29udGVudCkge1xuICAgICAgICBlZGl0b3Iuc2V0VmFsdWUodXBkYXRlZCk7XG4gICAgICAgIHJlcGxhY2VkID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVwbGFjZWQ7XG4gIH1cbn1cbiIsICJpbXBvcnQgeyBBcHAsIFRGaWxlLCBub3JtYWxpemVQYXRoIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmV4cG9ydCB0eXBlIERlbGV0aW9uVG9tYnN0b25lID0ge1xuICBwYXRoOiBzdHJpbmc7XG4gIGRlbGV0ZWRBdDogbnVtYmVyO1xuICByZW1vdGVTaWduYXR1cmU/OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgdHlwZSBSZW1vdGVGaWxlTGlrZSA9IHtcbiAgcmVtb3RlUGF0aDogc3RyaW5nO1xuICBsYXN0TW9kaWZpZWQ6IG51bWJlcjtcbiAgc2l6ZTogbnVtYmVyO1xuICBzaWduYXR1cmU6IHN0cmluZztcbn07XG5cbnR5cGUgU2VjdXJlV2ViZGF2U3luY1N1cHBvcnREZXBzID0ge1xuICBhcHA6IEFwcDtcbiAgZ2V0VmF1bHRTeW5jUmVtb3RlRm9sZGVyOiAoKSA9PiBzdHJpbmc7XG4gIGRlbGV0aW9uRm9sZGVyU3VmZml4OiBzdHJpbmc7XG4gIGVuY29kZUJhc2U2NFVybDogKHZhbHVlOiBzdHJpbmcpID0+IHN0cmluZztcbiAgZGVjb2RlQmFzZTY0VXJsOiAodmFsdWU6IHN0cmluZykgPT4gc3RyaW5nO1xufTtcblxuLy8gS2VlcCBzeW5jIG1ldGFkYXRhIGFuZCB0b21ic3RvbmUgcnVsZXMgaXNvbGF0ZWQgc28gcXVldWUvcmVuZGVyaW5nIGNoYW5nZXNcbi8vIGRvIG5vdCBhY2NpZGVudGFsbHkgYWZmZWN0IHJlY29uY2lsaWF0aW9uIGJlaGF2aW91ci5cbmV4cG9ydCBjbGFzcyBTZWN1cmVXZWJkYXZTeW5jU3VwcG9ydCB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgZGVwczogU2VjdXJlV2ViZGF2U3luY1N1cHBvcnREZXBzKSB7fVxuXG4gIHNob3VsZFNraXBDb250ZW50U3luY1BhdGgocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZFBhdGggPSBub3JtYWxpemVQYXRoKHBhdGgpO1xuICAgIGlmIChcbiAgICAgIG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIub2JzaWRpYW4vXCIpIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwiLnRyYXNoL1wiKSB8fFxuICAgICAgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIi5naXQvXCIpIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwibm9kZV9tb2R1bGVzL1wiKSB8fFxuICAgICAgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIl9wbHVnaW5fcGFja2FnZXMvXCIpIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwiLnRtcC1cIikgfHxcbiAgICAgIG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIub2JzaWRpYW4vcGx1Z2lucy9zZWN1cmUtd2ViZGF2LWltYWdlcy9cIilcbiAgICApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiAvXFwuKHBuZ3xqcGU/Z3xnaWZ8d2VicHxibXB8c3ZnKSQvaS50ZXN0KG5vcm1hbGl6ZWRQYXRoKTtcbiAgfVxuXG4gIGNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpIHtcbiAgICByZXR1cm4gdGhpcy5kZXBzLmFwcC52YXVsdFxuICAgICAgLmdldEZpbGVzKClcbiAgICAgIC5maWx0ZXIoKGZpbGUpID0+ICF0aGlzLnNob3VsZFNraXBDb250ZW50U3luY1BhdGgoZmlsZS5wYXRoKSlcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBhLnBhdGgubG9jYWxlQ29tcGFyZShiLnBhdGgpKTtcbiAgfVxuXG4gIGJ1aWxkU3luY1NpZ25hdHVyZShmaWxlOiBURmlsZSkge1xuICAgIHJldHVybiBgJHtmaWxlLnN0YXQubXRpbWV9OiR7ZmlsZS5zdGF0LnNpemV9YDtcbiAgfVxuXG4gIGJ1aWxkUmVtb3RlU3luY1NpZ25hdHVyZShyZW1vdGU6IFBpY2s8UmVtb3RlRmlsZUxpa2UsIFwibGFzdE1vZGlmaWVkXCIgfCBcInNpemVcIj4pIHtcbiAgICByZXR1cm4gYCR7cmVtb3RlLmxhc3RNb2RpZmllZH06JHtyZW1vdGUuc2l6ZX1gO1xuICB9XG5cbiAgYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGAke3RoaXMubm9ybWFsaXplRm9sZGVyKHRoaXMuZGVwcy5nZXRWYXVsdFN5bmNSZW1vdGVGb2xkZXIoKSl9JHt2YXVsdFBhdGh9YDtcbiAgfVxuXG4gIGJ1aWxkRGVsZXRpb25Gb2xkZXIoKSB7XG4gICAgcmV0dXJuIGAke3RoaXMubm9ybWFsaXplRm9sZGVyKHRoaXMuZGVwcy5nZXRWYXVsdFN5bmNSZW1vdGVGb2xkZXIoKSkucmVwbGFjZSgvXFwvJC8sIFwiXCIpfSR7dGhpcy5kZXBzLmRlbGV0aW9uRm9sZGVyU3VmZml4fWA7XG4gIH1cblxuICBidWlsZERlbGV0aW9uUmVtb3RlUGF0aCh2YXVsdFBhdGg6IHN0cmluZykge1xuICAgIHJldHVybiBgJHt0aGlzLmJ1aWxkRGVsZXRpb25Gb2xkZXIoKX0ke3RoaXMuZGVwcy5lbmNvZGVCYXNlNjRVcmwodmF1bHRQYXRoKX0uanNvbmA7XG4gIH1cblxuICByZW1vdGVEZWxldGlvblBhdGhUb1ZhdWx0UGF0aChyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCByb290ID0gdGhpcy5idWlsZERlbGV0aW9uRm9sZGVyKCk7XG4gICAgaWYgKCFyZW1vdGVQYXRoLnN0YXJ0c1dpdGgocm9vdCkgfHwgIXJlbW90ZVBhdGguZW5kc1dpdGgoXCIuanNvblwiKSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgZW5jb2RlZCA9IHJlbW90ZVBhdGguc2xpY2Uocm9vdC5sZW5ndGgsIC1cIi5qc29uXCIubGVuZ3RoKTtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIHRoaXMuZGVwcy5kZWNvZGVCYXNlNjRVcmwoZW5jb2RlZCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cblxuICBwYXJzZURlbGV0aW9uVG9tYnN0b25lUGF5bG9hZChyYXc6IHN0cmluZyk6IERlbGV0aW9uVG9tYnN0b25lIHwgbnVsbCB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KTtcbiAgICAgIGlmICghcGFyc2VkIHx8IHR5cGVvZiBwYXJzZWQucGF0aCAhPT0gXCJzdHJpbmdcIiB8fCB0eXBlb2YgcGFyc2VkLmRlbGV0ZWRBdCAhPT0gXCJudW1iZXJcIikge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIGlmIChwYXJzZWQucmVtb3RlU2lnbmF0dXJlICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIHBhcnNlZC5yZW1vdGVTaWduYXR1cmUgIT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICByZXR1cm4ge1xuICAgICAgICBwYXRoOiBwYXJzZWQucGF0aCxcbiAgICAgICAgZGVsZXRlZEF0OiBwYXJzZWQuZGVsZXRlZEF0LFxuICAgICAgICByZW1vdGVTaWduYXR1cmU6IHBhcnNlZC5yZW1vdGVTaWduYXR1cmUsXG4gICAgICB9O1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgcmVtb3RlUGF0aFRvVmF1bHRQYXRoKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHJvb3QgPSB0aGlzLm5vcm1hbGl6ZUZvbGRlcih0aGlzLmRlcHMuZ2V0VmF1bHRTeW5jUmVtb3RlRm9sZGVyKCkpO1xuICAgIGlmICghcmVtb3RlUGF0aC5zdGFydHNXaXRoKHJvb3QpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVtb3RlUGF0aC5zbGljZShyb290Lmxlbmd0aCkucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcbiAgfVxuXG4gIHNob3VsZERvd25sb2FkUmVtb3RlVmVyc2lvbihsb2NhbE10aW1lOiBudW1iZXIsIHJlbW90ZU10aW1lOiBudW1iZXIpIHtcbiAgICByZXR1cm4gcmVtb3RlTXRpbWUgPiBsb2NhbE10aW1lICsgMjAwMDtcbiAgfVxuXG4gIGlzVG9tYnN0b25lQXV0aG9yaXRhdGl2ZShcbiAgICB0b21ic3RvbmU6IERlbGV0aW9uVG9tYnN0b25lLFxuICAgIHJlbW90ZT86IFBpY2s8UmVtb3RlRmlsZUxpa2UsIFwibGFzdE1vZGlmaWVkXCIgfCBcInNpZ25hdHVyZVwiPiB8IG51bGwsXG4gICkge1xuICAgIGNvbnN0IGdyYWNlTXMgPSA1MDAwO1xuICAgIGlmICghcmVtb3RlKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAodG9tYnN0b25lLnJlbW90ZVNpZ25hdHVyZSkge1xuICAgICAgcmV0dXJuIHJlbW90ZS5zaWduYXR1cmUgPT09IHRvbWJzdG9uZS5yZW1vdGVTaWduYXR1cmU7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlbW90ZS5sYXN0TW9kaWZpZWQgPD0gdG9tYnN0b25lLmRlbGV0ZWRBdCArIGdyYWNlTXM7XG4gIH1cblxuICBzaG91bGREZWxldGVMb2NhbEZyb21Ub21ic3RvbmUoZmlsZTogVEZpbGUsIHRvbWJzdG9uZTogRGVsZXRpb25Ub21ic3RvbmUpIHtcbiAgICBjb25zdCBncmFjZU1zID0gNTAwMDtcbiAgICByZXR1cm4gZmlsZS5zdGF0Lm10aW1lIDw9IHRvbWJzdG9uZS5kZWxldGVkQXQgKyBncmFjZU1zO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVGb2xkZXIoaW5wdXQ6IHN0cmluZykge1xuICAgIHJldHVybiBpbnB1dC5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpLnJlcGxhY2UoL1xcLyskLywgXCJcIikgKyBcIi9cIjtcbiAgfVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUMsSUFBQUEsbUJBY007OztBQ2RQLHNCQUFrRTtBQUUzRCxJQUFNLGtCQUFrQjtBQUN4QixJQUFNLG9CQUFvQjtBQVlqQyxJQUFNLDBCQUFOLGNBQXNDLG9DQUFvQjtBQUFBLEVBQ3hELFlBQVksYUFBMEI7QUFDcEMsVUFBTSxXQUFXO0FBQUEsRUFDbkI7QUFBQSxFQUVBLFdBQWlCO0FBQUEsRUFBQztBQUNwQjtBQUlPLElBQU0sMkJBQU4sTUFBK0I7QUFBQSxFQUNwQyxZQUE2QixNQUFvQztBQUFwQztBQUFBLEVBQXFDO0FBQUEsRUFFbEUsdUJBQXVCLFdBQW1CLEtBQWE7QUFDckQsVUFBTSxhQUFhLEtBQUssa0JBQWtCLFNBQVM7QUFDbkQsUUFBSSxDQUFDLFlBQVk7QUFDZixhQUFPLE9BQU8sU0FBUztBQUFBLElBQ3pCO0FBRUEsV0FBTyxLQUFLLDBCQUEwQixZQUFZLEdBQUc7QUFBQSxFQUN2RDtBQUFBLEVBRUEsMEJBQTBCLFlBQW9CLEtBQWE7QUFDekQsVUFBTSxpQkFBaUIsT0FBTyxZQUFZLFFBQVEsVUFBVSxHQUFHLEVBQUUsS0FBSztBQUN0RSxVQUFNLGlCQUFpQixXQUFXLFFBQVEsVUFBVSxFQUFFLEVBQUUsS0FBSztBQUM3RCxXQUFPLENBQUMsU0FBUyxpQkFBaUIsSUFBSSxTQUFTLGNBQWMsSUFBSSxRQUFRLGFBQWEsSUFBSSxLQUFLLEVBQUUsS0FBSyxJQUFJO0FBQUEsRUFDNUc7QUFBQSxFQUVBLHNCQUFzQixRQUErQztBQUNuRSxVQUFNLFNBQWlDLEVBQUUsTUFBTSxJQUFJLEtBQUssR0FBRztBQUMzRCxl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V0FDVixPQUFPLGNBQWMsS0FBSyxPQUFPLEVBQUUsNEJBQVEsVUFBVSxDQUFDLEVBQUUsUUFBUSxZQUFZO0FBQzFFLGVBQU8sWUFBWSxJQUFJO0FBQ3ZCLFlBQUk7QUFDRixnQkFBTSxLQUFLLE9BQU8sMkJBQTJCLElBQUk7QUFDakQsZUFBSyxRQUFRO0FBQUEsUUFDZixVQUFFO0FBQ0EsaUJBQU8sWUFBWSxLQUFLO0FBQUEsUUFDMUI7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNIO0FBRUYsZ0JBQVksU0FBUyxNQUFNLEVBQUUsTUFBTSxLQUFLLE9BQU8sRUFBRSxrQ0FBUyxnQkFBZ0IsRUFBRSxDQUFDO0FBRTdFLFFBQUkseUJBQVEsV0FBVyxFQUNwQixRQUFRLEtBQUssT0FBTyxFQUFFLGdFQUFjLHNDQUFzQyxDQUFDLEVBQzNFO0FBQUEsTUFDQyxLQUFLLE9BQU87QUFBQSxRQUNWO0FBQUEsUUFDQTtBQUFBLE1BQ0Y7QUFBQSxJQUNGLEVBQ0M7QUFBQSxNQUFVLENBQUMsV0FDVixPQUFPLGNBQWMsS0FBSyxPQUFPLEVBQUUsNEJBQVEsZUFBZSxDQUFDLEVBQUUsUUFBUSxZQUFZO0FBQy9FLGVBQU8sWUFBWSxJQUFJO0FBQ3ZCLFlBQUk7QUFDRixnQkFBTSxLQUFLLE9BQU8sNkJBQTZCO0FBQUEsUUFDakQsVUFBRTtBQUNBLGlCQUFPLFlBQVksS0FBSztBQUFBLFFBQzFCO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDSDtBQUFBLEVBQ0o7QUFDRjtBQUVBLElBQU0sY0FBTixjQUEwQix1QkFBTTtBQUFBLEVBSTlCLFlBQVksS0FBVSxXQUFtQixVQUFrQjtBQUN6RCxVQUFNLEdBQUc7QUFDVCxTQUFLLFlBQVk7QUFDakIsU0FBSyxXQUFXO0FBQUEsRUFDbEI7QUFBQSxFQUVBLFNBQWU7QUFDYixVQUFNLEVBQUUsVUFBVSxJQUFJO0FBQ3RCLGNBQVUsTUFBTTtBQUNoQixjQUFVLFNBQVMsTUFBTSxFQUFFLE1BQU0sS0FBSyxVQUFVLENBQUM7QUFDakQsY0FBVSxTQUFTLEtBQUssRUFBRSxNQUFNLEtBQUssU0FBUyxDQUFDO0FBQUEsRUFDakQ7QUFBQSxFQUVBLFVBQWdCO0FBQ2QsU0FBSyxVQUFVLE1BQU07QUFBQSxFQUN2QjtBQUNGOyIsCiAgIm5hbWVzIjogWyJpbXBvcnRfb2JzaWRpYW4iLCAiaW1wb3J0X29ic2lkaWFuIiwgImltcG9ydF9vYnNpZGlhbiIsICJkb2N1bWVudCIsICJ0b21ic3RvbmUiLCAidXBsb2FkZWRSZW1vdGUiLCAib2JzaWRpYW5SZXF1ZXN0VXJsIl0KfQo=
