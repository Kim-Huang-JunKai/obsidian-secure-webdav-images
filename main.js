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
    return normalizeFolder(input);
  }
};
function normalizeFolder(input) {
  return input.replace(/^\/+/, "").replace(/\/+$/, "") + "/";
}

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
var MIME_MAP = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg"
};
var SECURE_NOTE_STUB = "secure-webdav-note-stub";
var SecureWebdavImagesPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.queue = [];
    this.blobUrls = [];
    this.maxBlobUrls = 100;
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
    void this.uploadQueue.processPendingTasks();
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
  normalizeFolder(input) {
    return normalizeFolder(input);
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
    const remotePath = typeof candidate.remotePath === "string" && candidate.remotePath.length > 0 ? candidate.remotePath : this.syncSupport.buildVaultSyncRemotePath(vaultPath);
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
    if (!this.syncSupport.shouldSkipContentSyncPath(file.path)) {
      await this.writeDeletionTombstone(file.path, this.syncIndex.get(file.path)?.remoteSignature);
      this.syncIndex.delete(file.path);
      await this.savePluginState();
    }
    if (file.extension === "md") {
      this.noteRemoteRefs.delete(file.path);
    }
  }
  async handleVaultRename(file, oldPath) {
    if (!(file instanceof import_obsidian4.TFile)) {
      return;
    }
    if (!this.syncSupport.shouldSkipContentSyncPath(oldPath)) {
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
      if (!this.syncSupport.shouldSkipContentSyncPath(file.path)) {
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
    if (this.uploadQueue.hasPendingWorkForNote(notePath) || this.pendingVaultMutationPromises.size > 0 || this.syncInProgress || this.autoSyncTickInProgress) {
      this.schedulePriorityNoteSync(notePath, reason);
      return;
    }
    const file = this.getVaultFileByPath(notePath);
    if (!(file instanceof import_obsidian4.TFile) || file.extension !== "md" || this.syncSupport.shouldSkipContentSyncPath(file.path)) {
      return;
    }
    this.priorityNoteSyncsInFlight.add(notePath);
    try {
      this.ensureConfigured();
      const content = await this.readMarkdownContentPreferEditor(file);
      if (this.parseNoteStub(content)) {
        return;
      }
      const remotePath = this.syncSupport.buildVaultSyncRemotePath(file.path);
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
          try {
            const remoteUrl = await this.uploadRemoteImageUrl(rawLink, uploadCache);
            const altText = this.extractMarkdownAltText(match[0]) || this.getDisplayNameFromUrl(rawLink);
            seen.set(match[0], {
              original: match[0],
              rewritten: this.imageSupport.buildSecureImageMarkup(remoteUrl, altText)
            });
          } catch (e) {
            console.warn(`[secure-webdav-images] \u8DF3\u8FC7\u5931\u8D25\u7684\u8FDC\u7A0B\u56FE\u7247 ${rawLink}`, e?.message);
          }
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
      try {
        const remoteUrl = await this.uploadRemoteImageUrl(rawLink, uploadCache);
        const altText = this.extractHtmlImageAltText(match[0]) || this.getDisplayNameFromUrl(rawLink);
        seen.set(match[0], {
          original: match[0],
          rewritten: this.imageSupport.buildSecureImageMarkup(remoteUrl, altText)
        });
      } catch (e) {
        console.warn(`[secure-webdav-images] \u8DF3\u8FC7\u5931\u8D25\u7684\u8FDC\u7A0B\u56FE\u7247 ${rawLink}`, e?.message);
      }
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
    this.assertResponseSuccess(response, "Remote image download");
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
    return MIME_MAP[mimeType] ?? "";
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
    this.assertResponseSuccess(response, "Upload");
  }
  async handleEditorPaste(evt, editor, info) {
    if (evt.defaultPrevented || !info.file) {
      return;
    }
    const imageFile = this.extractImageFileFromClipboard(evt);
    if (imageFile) {
      evt.preventDefault();
      const fileName = imageFile.name || this.buildClipboardFileName(imageFile.type);
      await this.uploadQueue.enqueueEditorImageUpload(info.file, editor, imageFile, fileName);
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
    await this.uploadQueue.enqueueEditorImageUpload(info.file, editor, imageFile, fileName);
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
    await this.uploadQueue.enqueueEditorImageUpload(noteFile, editor, imageFile, fileName);
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
      const counts = {
        uploaded: 0,
        restoredFromRemote: 0,
        downloadedOrUpdated: 0,
        skipped: 0,
        deletedRemoteFiles: 0,
        deletedLocalFiles: 0,
        deletedLocalStubs: 0,
        missingRemoteBackedNotes: 0,
        purgedMissingLazyNotes: 0,
        deletedRemoteDirectories: 0,
        evictedNotes: 0
      };
      await this.reconcileOrphanedSyncEntries(remoteFiles, deletionTombstones, counts);
      await this.reconcileRemoteOnlyFiles(remoteFiles, deletionTombstones, counts);
      const localRemotePaths = await this.reconcileLocalFiles(remoteFiles, deletionTombstones, counts);
      counts.deletedRemoteDirectories = await this.deleteExtraRemoteDirectories(
        remoteInventory.directories,
        this.buildExpectedRemoteDirectories(localRemotePaths, this.settings.vaultSyncRemoteFolder)
      );
      await this.reconcileRemoteImages();
      counts.evictedNotes = await this.evictStaleSyncedNotes(false);
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.t(
        `\u5DF2\u53CC\u5411\u540C\u6B65\uFF1A\u4E0A\u4F20 ${counts.uploaded} \u4E2A\u6587\u4EF6\uFF0C\u4ECE\u8FDC\u7AEF\u62C9\u53D6 ${counts.restoredFromRemote + counts.downloadedOrUpdated} \u4E2A\u6587\u4EF6\uFF0C\u8DF3\u8FC7 ${counts.skipped} \u4E2A\u672A\u53D8\u5316\u6587\u4EF6\uFF0C\u5220\u9664\u8FDC\u7AEF\u5185\u5BB9 ${counts.deletedRemoteFiles} \u4E2A\u3001\u672C\u5730\u5185\u5BB9 ${counts.deletedLocalFiles} \u4E2A${counts.deletedLocalStubs > 0 ? `\uFF08\u5176\u4E2D\u5931\u6548\u5360\u4F4D\u7B14\u8BB0 ${counts.deletedLocalStubs} \u7BC7\uFF09` : ""}\uFF0C\u6E05\u7406\u8FDC\u7AEF\u7A7A\u76EE\u5F55 ${counts.deletedRemoteDirectories} \u4E2A${counts.evictedNotes > 0 ? `\uFF0C\u56DE\u6536\u672C\u5730\u65E7\u7B14\u8BB0 ${counts.evictedNotes} \u7BC7` : ""}${counts.missingRemoteBackedNotes > 0 ? `\uFF0C\u5E76\u53D1\u73B0 ${counts.missingRemoteBackedNotes} \u7BC7\u6309\u9700\u7B14\u8BB0\u7F3A\u5C11\u8FDC\u7AEF\u6B63\u6587` : ""}${counts.purgedMissingLazyNotes > 0 ? `\uFF0C\u786E\u8BA4\u6E05\u7406\u5931\u6548\u5360\u4F4D\u7B14\u8BB0 ${counts.purgedMissingLazyNotes} \u7BC7` : ""}\u3002`,
        `Bidirectional sync uploaded ${counts.uploaded} file(s), pulled ${counts.restoredFromRemote + counts.downloadedOrUpdated} file(s) from remote, skipped ${counts.skipped} unchanged file(s), deleted ${counts.deletedRemoteFiles} remote content file(s) and ${counts.deletedLocalFiles} local file(s)${counts.deletedLocalStubs > 0 ? ` (including ${counts.deletedLocalStubs} stale stub note(s))` : ""}, removed ${counts.deletedRemoteDirectories} remote director${counts.deletedRemoteDirectories === 1 ? "y" : "ies"}${counts.evictedNotes > 0 ? `, and evicted ${counts.evictedNotes} stale local note(s)` : ""}${counts.missingRemoteBackedNotes > 0 ? `, while detecting ${counts.missingRemoteBackedNotes} lazy note(s) missing their remote content` : ""}${counts.purgedMissingLazyNotes > 0 ? `, and purged ${counts.purgedMissingLazyNotes} confirmed broken lazy placeholder(s)` : ""}.`
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
  async reconcileOrphanedSyncEntries(remoteFiles, deletionTombstones, counts) {
    const files = this.syncSupport.collectVaultContentFiles();
    const currentPaths = new Set(files.map((file) => file.path));
    for (const path of [...this.syncIndex.keys()]) {
      if (currentPaths.has(path)) {
        continue;
      }
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
      if (tombstone && this.syncSupport.isTombstoneAuthoritative(tombstone, remote)) {
        await this.deleteRemoteContentFile(remote.remotePath);
        remoteFiles.delete(remote.remotePath);
        this.syncIndex.delete(path);
        counts.deletedRemoteFiles += 1;
        continue;
      }
      if (tombstone) {
        await this.deleteDeletionTombstone(path);
        deletionTombstones.delete(path);
      }
      await this.downloadRemoteFileToVault(path, remote);
      this.syncIndex.set(path, {
        localSignature: remote.signature,
        remoteSignature: remote.signature,
        remotePath: remote.remotePath
      });
      counts.restoredFromRemote += 1;
    }
  }
  async reconcileRemoteOnlyFiles(remoteFiles, deletionTombstones, counts) {
    const files = this.syncSupport.collectVaultContentFiles();
    const currentPaths = new Set(files.map((file) => file.path));
    for (const remote of [...remoteFiles.values()].sort((a, b) => a.remotePath.localeCompare(b.remotePath))) {
      const vaultPath = this.syncSupport.remotePathToVaultPath(remote.remotePath);
      if (!vaultPath || currentPaths.has(vaultPath)) {
        continue;
      }
      const tombstone = deletionTombstones.get(vaultPath);
      if (tombstone) {
        if (this.syncSupport.isTombstoneAuthoritative(tombstone, remote)) {
          await this.deleteRemoteContentFile(remote.remotePath);
          remoteFiles.delete(remote.remotePath);
          counts.deletedRemoteFiles += 1;
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
      counts.restoredFromRemote += 1;
    }
  }
  async reconcileLocalFiles(remoteFiles, deletionTombstones, counts) {
    const files = this.syncSupport.collectVaultContentFiles();
    const localRemotePaths = /* @__PURE__ */ new Set();
    for (const file of files) {
      const remotePath = this.syncSupport.buildVaultSyncRemotePath(file.path);
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
          const resolution = await this.resolveLazyNoteStub(file, stub, stubRemote, tombstone2);
          if (resolution.action === "deleted") {
            counts.deletedLocalFiles += 1;
            counts.deletedLocalStubs += 1;
            if (resolution.purgedMissing) {
              counts.purgedMissingLazyNotes += 1;
            }
            continue;
          }
          if (resolution.action === "missing") {
            counts.missingRemoteBackedNotes += 1;
          }
          this.syncIndex.set(file.path, {
            localSignature,
            remoteSignature: stubRemote?.signature ?? previous?.remoteSignature ?? "",
            remotePath
          });
          counts.skipped += 1;
          continue;
        }
      }
      const tombstone = deletionTombstones.get(file.path);
      const unchangedSinceLastSync = previous ? previous.localSignature === localSignature : false;
      if (tombstone) {
        if (unchangedSinceLastSync && this.syncSupport.shouldDeleteLocalFromTombstone(file, tombstone) && this.syncSupport.isTombstoneAuthoritative(tombstone, remote)) {
          await this.removeLocalVaultFile(file);
          this.syncIndex.delete(file.path);
          counts.deletedLocalFiles += 1;
          if (remote) {
            await this.deleteRemoteContentFile(remote.remotePath);
            remoteFiles.delete(remote.remotePath);
            counts.deletedRemoteFiles += 1;
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
        counts.uploaded += 1;
        continue;
      }
      if (!previous) {
        if (localSignature === remoteSignature) {
          this.syncIndex.set(file.path, { localSignature, remoteSignature, remotePath });
          await this.deleteDeletionTombstone(file.path);
          counts.skipped += 1;
          continue;
        }
        if (this.syncSupport.shouldDownloadRemoteVersion(file.stat.mtime, remote.lastModified)) {
          await this.downloadRemoteFileToVault(file.path, remote, file);
          const refreshed = this.getVaultFileByPath(file.path);
          this.syncIndex.set(file.path, {
            localSignature: refreshed ? await this.buildCurrentLocalSignature(refreshed) : remoteSignature,
            remoteSignature,
            remotePath
          });
          counts.downloadedOrUpdated += 1;
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
        counts.uploaded += 1;
        continue;
      }
      const localChanged = previous.localSignature !== localSignature || previous.remotePath !== remotePath;
      const remoteChanged = previous.remoteSignature !== remoteSignature || previous.remotePath !== remotePath;
      if (!localChanged && !remoteChanged) {
        counts.skipped += 1;
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
        counts.downloadedOrUpdated += 1;
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
        counts.uploaded += 1;
        continue;
      }
      if (this.syncSupport.shouldDownloadRemoteVersion(file.stat.mtime, remote.lastModified)) {
        await this.downloadRemoteFileToVault(file.path, remote, file);
        const refreshed = this.getVaultFileByPath(file.path);
        this.syncIndex.set(file.path, {
          localSignature: refreshed ? await this.buildCurrentLocalSignature(refreshed) : remoteSignature,
          remoteSignature,
          remotePath
        });
        counts.downloadedOrUpdated += 1;
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
      counts.uploaded += 1;
    }
    return localRemotePaths;
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
  async writeDeletionTombstone(vaultPath, remoteSignature) {
    const payload = {
      path: vaultPath,
      deletedAt: Date.now(),
      remoteSignature
    };
    await this.uploadBinary(
      this.syncSupport.buildDeletionRemotePath(vaultPath),
      this.encodeUtf8(JSON.stringify(payload)),
      "application/json; charset=utf-8"
    );
  }
  async deleteDeletionTombstone(vaultPath) {
    try {
      await this.deleteRemoteContentFile(this.syncSupport.buildDeletionRemotePath(vaultPath));
    } catch {
    }
  }
  async readDeletionTombstone(vaultPath) {
    const response = await this.requestUrl({
      url: this.buildUploadUrl(this.syncSupport.buildDeletionRemotePath(vaultPath)),
      method: "GET",
      headers: {
        Authorization: this.buildAuthHeader()
      }
    });
    if (response.status === 404) {
      return null;
    }
    this.assertResponseSuccess(response, "GET tombstone");
    return this.syncSupport.parseDeletionTombstonePayload(this.decodeUtf8(response.arrayBuffer));
  }
  async readDeletionTombstones() {
    const tombstones = /* @__PURE__ */ new Map();
    const inventory = await this.listRemoteTree(this.syncSupport.buildDeletionFolder());
    for (const remote of inventory.files.values()) {
      const vaultPath = this.syncSupport.remoteDeletionPathToVaultPath(remote.remotePath);
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
      const tombstone = this.syncSupport.parseDeletionTombstonePayload(this.decodeUtf8(response.arrayBuffer));
      if (tombstone) {
        tombstones.set(vaultPath, tombstone);
      }
    }
    return tombstones;
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
    this.assertResponseSuccess(response, "GET");
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
    this.assertResponseSuccess(response, `PROPFIND for ${remotePath}`);
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
      signature: this.syncSupport.buildSyncSignature(file)
    };
  }
  async deleteRemoteSyncedEntry(vaultPath) {
    const existing = this.syncIndex.get(vaultPath);
    const remotePath = existing?.remotePath ?? this.syncSupport.buildVaultSyncRemotePath(vaultPath);
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
      const tombstone = !remote ? await this.readDeletionTombstone(file.path) : void 0;
      const resolution = await this.resolveLazyNoteStub(file, stub, remote, tombstone);
      await this.savePluginState();
      if (resolution.action === "deleted") {
        new import_obsidian4.Notice(
          this.t(
            resolution.purgedMissing ? `\u8FDC\u7AEF\u6B63\u6587\u8FDE\u7EED\u7F3A\u5931\uFF0C\u5DF2\u79FB\u9664\u672C\u5730\u5931\u6548\u5360\u4F4D\u7B14\u8BB0\uFF1A${file.basename}` : `\u8FDC\u7AEF\u6B63\u6587\u4E0D\u5B58\u5728\uFF0C\u5DF2\u79FB\u9664\u672C\u5730\u5360\u4F4D\u7B14\u8BB0\uFF1A${file.basename}`,
            resolution.purgedMissing ? `Remote note was missing repeatedly, removed local broken placeholder: ${file.basename}` : `Remote note missing, removed local placeholder: ${file.basename}`
          ),
          resolution.purgedMissing ? 8e3 : 6e3
        );
        return;
      }
      if (resolution.action === "missing") {
        new import_obsidian4.Notice(this.t("\u8FDC\u7AEF\u6B63\u6587\u4E0D\u5B58\u5728\uFF0C\u5F53\u524D\u5148\u4FDD\u7559\u672C\u5730\u5360\u4F4D\u7B14\u8BB0\u4EE5\u9632\u4E34\u65F6\u5F02\u5E38\uFF1B\u82E5\u518D\u6B21\u786E\u8BA4\u7F3A\u5931\uFF0C\u5C06\u81EA\u52A8\u6E05\u7406\u8BE5\u5360\u4F4D\u3002", "Remote note is missing. The local placeholder was kept for now in case this is transient; it will be cleaned automatically if the remote is still missing on the next confirmation."), 8e3);
        return;
      }
      new import_obsidian4.Notice(this.t(`\u5DF2\u4ECE\u8FDC\u7AEF\u6062\u590D\u7B14\u8BB0\uFF1A${file.basename}`, `Restored note from remote: ${file.basename}`), 6e3);
    } catch (error) {
      console.error("Failed to hydrate note from remote", error);
      new import_obsidian4.Notice(this.describeError(this.t("\u8FDC\u7AEF\u6062\u590D\u7B14\u8BB0\u5931\u8D25", "Failed to restore note from remote"), error), 8e3);
    }
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
      return this.syncSupport.buildSyncSignature(file);
    }
    const content = markdownContent ?? await this.readMarkdownContentPreferEditor(file);
    const digest = (await this.computeSha256Hex(this.encodeUtf8(content))).slice(0, 16);
    return `md:${content.length}:${digest}`;
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
  /**
   * Shared logic for resolving a lazy-note stub in both handleFileOpen and
   * syncConfiguredVaultContent.  Callers provide the already-looked-up remote
   * state (or null) and an optional tombstone.
   */
  async resolveLazyNoteStub(file, stub, remote, tombstone) {
    if (!remote) {
      if (tombstone) {
        await this.removeLocalVaultFile(file);
        this.syncIndex.delete(file.path);
        this.clearMissingLazyRemote(file.path);
        return { action: "deleted", deletedStub: true };
      }
      const missingRecord = this.markMissingLazyRemote(file.path);
      if (missingRecord.missCount >= this.missingLazyRemoteConfirmations) {
        await this.removeLocalVaultFile(file);
        this.syncIndex.delete(file.path);
        this.clearMissingLazyRemote(file.path);
        return { action: "deleted", deletedStub: true, purgedMissing: true };
      }
      return { action: "missing" };
    }
    this.clearMissingLazyRemote(file.path);
    await this.downloadRemoteFileToVault(file.path, remote, file);
    const refreshed = this.getVaultFileByPath(file.path);
    this.syncIndex.set(file.path, {
      localSignature: refreshed ? this.syncSupport.buildSyncSignature(refreshed) : remote.signature,
      remoteSignature: remote.signature,
      remotePath: stub.remotePath
    });
    return { action: "restored" };
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
    const remotePath = this.syncSupport.buildVaultSyncRemotePath(file.path);
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
      const files = this.syncSupport.collectVaultContentFiles().filter((file) => file.extension === "md");
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
        const remotePath = this.syncSupport.buildVaultSyncRemotePath(file.path);
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
          localSignature: refreshed ? this.syncSupport.buildSyncSignature(refreshed) : this.syncSupport.buildSyncSignature(file),
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
    const pending = [normalizeFolder(rootFolder)];
    const visited = /* @__PURE__ */ new Set();
    while (pending.length > 0) {
      const current = normalizeFolder(pending.pop() ?? rootFolder);
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
    const requestedPath = normalizeFolder(remoteDirectory);
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
    this.assertResponseSuccess(response, `PROPFIND for ${requestedPath}`);
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
      const normalizedPath = isCollection ? normalizeFolder(remotePath) : remotePath.replace(/\/+$/, "");
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
          signature: this.syncSupport.buildRemoteSyncSignature({
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
    const expected = /* @__PURE__ */ new Set([normalizeFolder(rootFolder)]);
    for (const remotePath of remoteFilePaths) {
      const parts = remotePath.split("/").filter((value) => value.length > 0);
      let current = "";
      for (let index = 0; index < parts.length - 1; index += 1) {
        current = current ? `${current}/${parts[index]}` : parts[index];
        expected.add(normalizeFolder(current));
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
  async preparePendingUploadsForSync(showNotice) {
    await this.uploadQueue.processPendingTasks();
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
    await this.uploadQueue.processTask(task);
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
    this.assertResponseSuccess(response, "Fetch secure image");
    const blob = new Blob([response.arrayBuffer], {
      type: response.headers["content-type"] ?? "application/octet-stream"
    });
    const blobUrl = URL.createObjectURL(blob);
    this.evictBlobUrlsIfNeeded();
    this.blobUrls.push(blobUrl);
    return blobUrl;
  }
  evictBlobUrlsIfNeeded() {
    while (this.blobUrls.length >= this.maxBlobUrls) {
      URL.revokeObjectURL(this.blobUrls.shift());
    }
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
    return `${normalizeFolder(this.settings.remoteFolder)}${fileName}`;
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
  buildAuthHeader() {
    const token = this.arrayBufferToBase64(this.encodeUtf8(`${this.settings.username}:${this.settings.password}`));
    return `Basic ${token}`;
  }
  ensureConfigured() {
    if (!this.settings.webdavUrl || !this.settings.username || !this.settings.password) {
      throw new Error(this.t("WebDAV \u914D\u7F6E\u4E0D\u5B8C\u6574\u3002", "WebDAV settings are incomplete."));
    }
  }
  assertResponseSuccess(response, context) {
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`${context} failed with status ${response.status}`);
    }
  }
  getMimeType(extension) {
    return MIME_MAP[extension.toLowerCase()] ?? "application/octet-stream";
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
    return MIME_MAP[mimeType] ?? null;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyIsICJzZWN1cmUtd2ViZGF2LWltYWdlLXN1cHBvcnQudHMiLCAic2VjdXJlLXdlYmRhdi11cGxvYWQtcXVldWUudHMiLCAic2VjdXJlLXdlYmRhdi1zeW5jLXN1cHBvcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIlx1RkVGRmltcG9ydCB7XG4gIEFwcCxcbiAgRWRpdG9yLFxuICBNYXJrZG93bkZpbGVJbmZvLFxuICBNYXJrZG93blZpZXcsXG4gIE1vZGFsLFxuICBOb3RpY2UsXG4gIFBsdWdpbixcbiAgUGx1Z2luU2V0dGluZ1RhYixcbiAgU2V0dGluZyxcbiAgVEFic3RyYWN0RmlsZSxcbiAgVEZpbGUsXG4gIG5vcm1hbGl6ZVBhdGgsXG4gIHJlcXVlc3RVcmwgYXMgb2JzaWRpYW5SZXF1ZXN0VXJsLFxufSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7IFNFQ1VSRV9DT0RFX0JMT0NLLCBTRUNVUkVfUFJPVE9DT0wsIFNlY3VyZVdlYmRhdkltYWdlU3VwcG9ydCB9IGZyb20gXCIuL3NlY3VyZS13ZWJkYXYtaW1hZ2Utc3VwcG9ydFwiO1xuaW1wb3J0IHsgU2VjdXJlV2ViZGF2VXBsb2FkUXVldWVTdXBwb3J0LCB0eXBlIFVwbG9hZFRhc2sgfSBmcm9tIFwiLi9zZWN1cmUtd2ViZGF2LXVwbG9hZC1xdWV1ZVwiO1xuaW1wb3J0IHtcbiAgU2VjdXJlV2ViZGF2U3luY1N1cHBvcnQsXG4gIHR5cGUgRGVsZXRpb25Ub21ic3RvbmUsXG4gIG5vcm1hbGl6ZUZvbGRlcixcbn0gZnJvbSBcIi4vc2VjdXJlLXdlYmRhdi1zeW5jLXN1cHBvcnRcIjtcblxudHlwZSBTZWN1cmVXZWJkYXZTZXR0aW5ncyA9IHtcbiAgd2ViZGF2VXJsOiBzdHJpbmc7XG4gIHVzZXJuYW1lOiBzdHJpbmc7XG4gIHBhc3N3b3JkOiBzdHJpbmc7XG4gIHJlbW90ZUZvbGRlcjogc3RyaW5nO1xuICB2YXVsdFN5bmNSZW1vdGVGb2xkZXI6IHN0cmluZztcbiAgbmFtaW5nU3RyYXRlZ3k6IFwidGltZXN0YW1wXCIgfCBcImhhc2hcIjtcbiAgZGVsZXRlTG9jYWxBZnRlclVwbG9hZDogYm9vbGVhbjtcbiAgbGFuZ3VhZ2U6IFwiYXV0b1wiIHwgXCJ6aFwiIHwgXCJlblwiO1xuICBub3RlU3RvcmFnZU1vZGU6IFwiZnVsbC1sb2NhbFwiIHwgXCJsYXp5LW5vdGVzXCI7XG4gIG5vdGVFdmljdEFmdGVyRGF5czogbnVtYmVyO1xuICBhdXRvU3luY0ludGVydmFsTWludXRlczogbnVtYmVyO1xuICBtYXhSZXRyeUF0dGVtcHRzOiBudW1iZXI7XG4gIHJldHJ5RGVsYXlTZWNvbmRzOiBudW1iZXI7XG4gIGRlbGV0ZVJlbW90ZVdoZW5VbnJlZmVyZW5jZWQ6IGJvb2xlYW47XG4gIGNvbXByZXNzSW1hZ2VzOiBib29sZWFuO1xuICBjb21wcmVzc1RocmVzaG9sZEtiOiBudW1iZXI7XG4gIG1heEltYWdlRGltZW5zaW9uOiBudW1iZXI7XG4gIGpwZWdRdWFsaXR5OiBudW1iZXI7XG59O1xuXG50eXBlIFN5bmNJbmRleEVudHJ5ID0ge1xuICBsb2NhbFNpZ25hdHVyZTogc3RyaW5nO1xuICByZW1vdGVTaWduYXR1cmU6IHN0cmluZztcbiAgcmVtb3RlUGF0aDogc3RyaW5nO1xufTtcblxudHlwZSBSZW1vdGVGaWxlU3RhdGUgPSB7XG4gIHJlbW90ZVBhdGg6IHN0cmluZztcbiAgbGFzdE1vZGlmaWVkOiBudW1iZXI7XG4gIHNpemU6IG51bWJlcjtcbiAgc2lnbmF0dXJlOiBzdHJpbmc7XG59O1xuXG50eXBlIE1pc3NpbmdMYXp5UmVtb3RlUmVjb3JkID0ge1xuICBmaXJzdERldGVjdGVkQXQ6IG51bWJlcjtcbiAgbGFzdERldGVjdGVkQXQ6IG51bWJlcjtcbiAgbWlzc0NvdW50OiBudW1iZXI7XG59O1xuXG50eXBlIFJlbW90ZUludmVudG9yeSA9IHtcbiAgZmlsZXM6IE1hcDxzdHJpbmcsIFJlbW90ZUZpbGVTdGF0ZT47XG4gIGRpcmVjdG9yaWVzOiBTZXQ8c3RyaW5nPjtcbn07XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFNlY3VyZVdlYmRhdlNldHRpbmdzID0ge1xuICB3ZWJkYXZVcmw6IFwiXCIsXG4gIHVzZXJuYW1lOiBcIlwiLFxuICBwYXNzd29yZDogXCJcIixcbiAgcmVtb3RlRm9sZGVyOiBcIi9yZW1vdGUtaW1hZ2VzL1wiLFxuICB2YXVsdFN5bmNSZW1vdGVGb2xkZXI6IFwiL3ZhdWx0LXN5bmMvXCIsXG4gIG5hbWluZ1N0cmF0ZWd5OiBcImhhc2hcIixcbiAgZGVsZXRlTG9jYWxBZnRlclVwbG9hZDogdHJ1ZSxcbiAgbGFuZ3VhZ2U6IFwiYXV0b1wiLFxuICBub3RlU3RvcmFnZU1vZGU6IFwiZnVsbC1sb2NhbFwiLFxuICBub3RlRXZpY3RBZnRlckRheXM6IDMwLFxuICBhdXRvU3luY0ludGVydmFsTWludXRlczogMCxcbiAgbWF4UmV0cnlBdHRlbXB0czogNSxcbiAgcmV0cnlEZWxheVNlY29uZHM6IDUsXG4gIGRlbGV0ZVJlbW90ZVdoZW5VbnJlZmVyZW5jZWQ6IHRydWUsXG4gIGNvbXByZXNzSW1hZ2VzOiB0cnVlLFxuICBjb21wcmVzc1RocmVzaG9sZEtiOiAzMDAsXG4gIG1heEltYWdlRGltZW5zaW9uOiAyMjAwLFxuICBqcGVnUXVhbGl0eTogODIsXG59O1xuXG5jb25zdCBNSU1FX01BUDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAganBnOiBcImltYWdlL2pwZWdcIixcbiAganBlZzogXCJpbWFnZS9qcGVnXCIsXG4gIHBuZzogXCJpbWFnZS9wbmdcIixcbiAgZ2lmOiBcImltYWdlL2dpZlwiLFxuICB3ZWJwOiBcImltYWdlL3dlYnBcIixcbiAgc3ZnOiBcImltYWdlL3N2Zyt4bWxcIixcbiAgYm1wOiBcImltYWdlL2JtcFwiLFxuICBcImltYWdlL2pwZWdcIjogXCJqcGdcIixcbiAgXCJpbWFnZS9wbmdcIjogXCJwbmdcIixcbiAgXCJpbWFnZS9naWZcIjogXCJnaWZcIixcbiAgXCJpbWFnZS93ZWJwXCI6IFwid2VicFwiLFxuICBcImltYWdlL2JtcFwiOiBcImJtcFwiLFxuICBcImltYWdlL3N2Zyt4bWxcIjogXCJzdmdcIixcbn07XG5cbmNvbnN0IFNFQ1VSRV9OT1RFX1NUVUIgPSBcInNlY3VyZS13ZWJkYXYtbm90ZS1zdHViXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFNlY3VyZVdlYmRhdkltYWdlc1BsdWdpbiBleHRlbmRzIFBsdWdpbiB7XG4gIHNldHRpbmdzOiBTZWN1cmVXZWJkYXZTZXR0aW5ncyA9IERFRkFVTFRfU0VUVElOR1M7XG4gIHF1ZXVlOiBVcGxvYWRUYXNrW10gPSBbXTtcbiAgcHJpdmF0ZSBibG9iVXJsczogc3RyaW5nW10gPSBbXTtcbiAgcHJpdmF0ZSByZWFkb25seSBtYXhCbG9iVXJscyA9IDEwMDtcbiAgcHJpdmF0ZSBub3RlUmVtb3RlUmVmcyA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8c3RyaW5nPj4oKTtcbiAgcHJpdmF0ZSByZW1vdGVDbGVhbnVwSW5GbGlnaHQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBub3RlQWNjZXNzVGltZXN0YW1wcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG4gIHByaXZhdGUgc3luY0luZGV4ID0gbmV3IE1hcDxzdHJpbmcsIFN5bmNJbmRleEVudHJ5PigpO1xuICBwcml2YXRlIG1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgPSBuZXcgTWFwPHN0cmluZywgTWlzc2luZ0xhenlSZW1vdGVSZWNvcmQ+KCk7XG4gIHByaXZhdGUgcGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlcyA9IG5ldyBTZXQ8UHJvbWlzZTx2b2lkPj4oKTtcbiAgcHJpdmF0ZSBwcmlvcml0eU5vdGVTeW5jVGltZW91dHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICBwcml2YXRlIHByaW9yaXR5Tm90ZVN5bmNzSW5GbGlnaHQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBsYXN0VmF1bHRTeW5jQXQgPSAwO1xuICBwcml2YXRlIGxhc3RWYXVsdFN5bmNTdGF0dXMgPSBcIlwiO1xuICBwcml2YXRlIHN5bmNJblByb2dyZXNzID0gZmFsc2U7XG4gIHByaXZhdGUgYXV0b1N5bmNUaWNrSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICAvLyBJbWFnZSBwYXJzaW5nIGFuZCByZW5kZXJpbmcgbGl2ZSBpbiBhIGRlZGljYXRlZCBoZWxwZXIgc28gc3luYyBjaGFuZ2VzXG4gIC8vIGRvIG5vdCBhY2NpZGVudGFsbHkgYnJlYWsgZGlzcGxheSBiZWhhdmlvdXIgYWdhaW4uXG4gIHByaXZhdGUgaW1hZ2VTdXBwb3J0ITogU2VjdXJlV2ViZGF2SW1hZ2VTdXBwb3J0O1xuICAvLyBVcGxvYWQgcXVldWUgc3RhdGUgaXMgaXNvbGF0ZWQgc28gcmV0cmllcyBhbmQgcGxhY2Vob2xkZXIgcmVwbGFjZW1lbnQgZG9cbiAgLy8gbm90IGtlZXAgc3ByYXdsaW5nIGFjcm9zcyB0aGUgbWFpbiBwbHVnaW4gY2xhc3MuXG4gIHByaXZhdGUgdXBsb2FkUXVldWUhOiBTZWN1cmVXZWJkYXZVcGxvYWRRdWV1ZVN1cHBvcnQ7XG4gIC8vIFN5bmMgbWV0YWRhdGEgaGVscGVycyBhcmUgaXNvbGF0ZWQgc28gcmVjb25jaWxpYXRpb24gcnVsZXMgc3RheSBleHBsaWNpdC5cbiAgcHJpdmF0ZSBzeW5jU3VwcG9ydCE6IFNlY3VyZVdlYmRhdlN5bmNTdXBwb3J0O1xuXG4gIHByaXZhdGUgcmVhZG9ubHkgZGVsZXRpb25Gb2xkZXJTdWZmaXggPSBcIi5fX3NlY3VyZS13ZWJkYXYtZGVsZXRpb25zX18vXCI7XG4gIHByaXZhdGUgcmVhZG9ubHkgbWlzc2luZ0xhenlSZW1vdGVDb25maXJtYXRpb25zID0gMjtcblxuICBwcml2YXRlIGluaXRpYWxpemVTdXBwb3J0TW9kdWxlcygpIHtcbiAgICAvLyBLZWVwIHJ1bnRpbWUtb25seSBpbnRlZ3JhdGlvbiBoZXJlOiB0aGUgaW1hZ2UgbW9kdWxlIG93bnMgcGFyc2luZyBhbmRcbiAgICAvLyByZW5kZXJpbmcsIHdoaWxlIHRoZSBwbHVnaW4gc3RpbGwgb3ducyBXZWJEQVYgYWNjZXNzIGFuZCBsaWZlY3ljbGUuXG4gICAgdGhpcy5pbWFnZVN1cHBvcnQgPSBuZXcgU2VjdXJlV2ViZGF2SW1hZ2VTdXBwb3J0KHtcbiAgICAgIHQ6IHRoaXMudC5iaW5kKHRoaXMpLFxuICAgICAgZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmw6IHRoaXMuZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmwuYmluZCh0aGlzKSxcbiAgICB9KTtcbiAgICB0aGlzLnVwbG9hZFF1ZXVlID0gbmV3IFNlY3VyZVdlYmRhdlVwbG9hZFF1ZXVlU3VwcG9ydCh7XG4gICAgICBhcHA6IHRoaXMuYXBwLFxuICAgICAgdDogdGhpcy50LmJpbmQodGhpcyksXG4gICAgICBzZXR0aW5nczogKCkgPT4gdGhpcy5zZXR0aW5ncyxcbiAgICAgIGdldFF1ZXVlOiAoKSA9PiB0aGlzLnF1ZXVlLFxuICAgICAgc2V0UXVldWU6IChxdWV1ZSkgPT4ge1xuICAgICAgICB0aGlzLnF1ZXVlID0gcXVldWU7XG4gICAgICB9LFxuICAgICAgc2F2ZVBsdWdpblN0YXRlOiB0aGlzLnNhdmVQbHVnaW5TdGF0ZS5iaW5kKHRoaXMpLFxuICAgICAgc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jOiB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYy5iaW5kKHRoaXMpLFxuICAgICAgcmVxdWVzdFVybDogdGhpcy5yZXF1ZXN0VXJsLmJpbmQodGhpcyksXG4gICAgICBidWlsZFVwbG9hZFVybDogdGhpcy5idWlsZFVwbG9hZFVybC5iaW5kKHRoaXMpLFxuICAgICAgYnVpbGRBdXRoSGVhZGVyOiB0aGlzLmJ1aWxkQXV0aEhlYWRlci5iaW5kKHRoaXMpLFxuICAgICAgcHJlcGFyZVVwbG9hZFBheWxvYWQ6IHRoaXMucHJlcGFyZVVwbG9hZFBheWxvYWQuYmluZCh0aGlzKSxcbiAgICAgIGJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5OiB0aGlzLmJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5LmJpbmQodGhpcyksXG4gICAgICBidWlsZFJlbW90ZVBhdGg6IHRoaXMuYnVpbGRSZW1vdGVQYXRoLmJpbmQodGhpcyksXG4gICAgICBidWlsZFNlY3VyZUltYWdlTWFya3VwOiB0aGlzLmltYWdlU3VwcG9ydC5idWlsZFNlY3VyZUltYWdlTWFya3VwLmJpbmQodGhpcy5pbWFnZVN1cHBvcnQpLFxuICAgICAgZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWU6IHRoaXMuZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUuYmluZCh0aGlzKSxcbiAgICAgIGFycmF5QnVmZmVyVG9CYXNlNjQ6IHRoaXMuYXJyYXlCdWZmZXJUb0Jhc2U2NC5iaW5kKHRoaXMpLFxuICAgICAgYmFzZTY0VG9BcnJheUJ1ZmZlcjogdGhpcy5iYXNlNjRUb0FycmF5QnVmZmVyLmJpbmQodGhpcyksXG4gICAgICBlc2NhcGVIdG1sOiB0aGlzLmVzY2FwZUh0bWwuYmluZCh0aGlzKSxcbiAgICAgIGVzY2FwZVJlZ0V4cDogdGhpcy5lc2NhcGVSZWdFeHAuYmluZCh0aGlzKSxcbiAgICAgIGRlc2NyaWJlRXJyb3I6IHRoaXMuZGVzY3JpYmVFcnJvci5iaW5kKHRoaXMpLFxuICAgIH0pO1xuICAgIHRoaXMuc3luY1N1cHBvcnQgPSBuZXcgU2VjdXJlV2ViZGF2U3luY1N1cHBvcnQoe1xuICAgICAgYXBwOiB0aGlzLmFwcCxcbiAgICAgIGdldFZhdWx0U3luY1JlbW90ZUZvbGRlcjogKCkgPT4gdGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIsXG4gICAgICBkZWxldGlvbkZvbGRlclN1ZmZpeDogdGhpcy5kZWxldGlvbkZvbGRlclN1ZmZpeCxcbiAgICAgIGVuY29kZUJhc2U2NFVybDogKHZhbHVlKSA9PlxuICAgICAgICB0aGlzLmFycmF5QnVmZmVyVG9CYXNlNjQodGhpcy5lbmNvZGVVdGY4KHZhbHVlKSkucmVwbGFjZSgvXFwrL2csIFwiLVwiKS5yZXBsYWNlKC9cXC8vZywgXCJfXCIpLnJlcGxhY2UoLz0rJC9nLCBcIlwiKSxcbiAgICAgIGRlY29kZUJhc2U2NFVybDogKHZhbHVlKSA9PiB7XG4gICAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSB2YWx1ZS5yZXBsYWNlKC8tL2csIFwiK1wiKS5yZXBsYWNlKC9fL2csIFwiL1wiKTtcbiAgICAgICAgY29uc3QgcGFkZGVkID0gbm9ybWFsaXplZCArIFwiPVwiLnJlcGVhdCgoNCAtIChub3JtYWxpemVkLmxlbmd0aCAlIDQgfHwgNCkpICUgNCk7XG4gICAgICAgIHJldHVybiB0aGlzLmRlY29kZVV0ZjgodGhpcy5iYXNlNjRUb0FycmF5QnVmZmVyKHBhZGRlZCkpO1xuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIG9ubG9hZCgpIHtcbiAgICBhd2FpdCB0aGlzLmxvYWRQbHVnaW5TdGF0ZSgpO1xuICAgIHRoaXMuaW5pdGlhbGl6ZVN1cHBvcnRNb2R1bGVzKCk7XG5cbiAgICB0aGlzLmFkZFNldHRpbmdUYWIobmV3IFNlY3VyZVdlYmRhdlNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJ1cGxvYWQtY3VycmVudC1ub3RlLWxvY2FsLWltYWdlc1wiLFxuICAgICAgbmFtZTogXCJVcGxvYWQgbG9jYWwgaW1hZ2VzIGluIGN1cnJlbnQgbm90ZSB0byBXZWJEQVZcIixcbiAgICAgIGNoZWNrQ2FsbGJhY2s6IChjaGVja2luZykgPT4ge1xuICAgICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICAgICAgaWYgKCFmaWxlKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFjaGVja2luZykge1xuICAgICAgICAgIHZvaWQgdGhpcy51cGxvYWRJbWFnZXNJbk5vdGUoZmlsZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwidGVzdC13ZWJkYXYtY29ubmVjdGlvblwiLFxuICAgICAgbmFtZTogXCJUZXN0IFdlYkRBViBjb25uZWN0aW9uXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4ge1xuICAgICAgICB2b2lkIHRoaXMucnVuQ29ubmVjdGlvblRlc3QodHJ1ZSk7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInN5bmMtY29uZmlndXJlZC12YXVsdC1jb250ZW50LXRvLXdlYmRhdlwiLFxuICAgICAgbmFtZTogXCJTeW5jIHZhdWx0IGNvbnRlbnQgdG8gV2ViREFWXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4ge1xuICAgICAgICB2b2lkIHRoaXMucnVuTWFudWFsU3luYygpO1xuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHJpYmJvbiA9IHRoaXMuYWRkUmliYm9uSWNvbihcInJlZnJlc2gtY3dcIiwgdGhpcy50KFwiXHU3QUNCXHU1MzczXHU1NDBDXHU2QjY1XHU1MjMwIFdlYkRBVlwiLCBcIlN5bmMgdG8gV2ViREFWIG5vd1wiKSwgKCkgPT4ge1xuICAgICAgdm9pZCB0aGlzLnJ1bk1hbnVhbFN5bmMoKTtcbiAgICB9KTtcbiAgICByaWJib24uYWRkQ2xhc3MoXCJzZWN1cmUtd2ViZGF2LXN5bmMtcmliYm9uXCIpO1xuXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duUG9zdFByb2Nlc3NvcigoZWwsIGN0eCkgPT4ge1xuICAgICAgdm9pZCB0aGlzLmltYWdlU3VwcG9ydC5wcm9jZXNzU2VjdXJlSW1hZ2VzKGVsLCBjdHgpO1xuICAgIH0pO1xuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihTRUNVUkVfQ09ERV9CTE9DSywgKHNvdXJjZSwgZWwsIGN0eCkgPT4ge1xuICAgICAgdm9pZCB0aGlzLmltYWdlU3VwcG9ydC5wcm9jZXNzU2VjdXJlQ29kZUJsb2NrKHNvdXJjZSwgZWwsIGN0eCk7XG4gICAgfSk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJmaWxlLW9wZW5cIiwgKGZpbGUpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmhhbmRsZUZpbGVPcGVuKGZpbGUpO1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImVkaXRvci1wYXN0ZVwiLCAoZXZ0LCBlZGl0b3IsIGluZm8pID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmhhbmRsZUVkaXRvclBhc3RlKGV2dCwgZWRpdG9yLCBpbmZvKTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJlZGl0b3ItZHJvcFwiLCAoZXZ0LCBlZGl0b3IsIGluZm8pID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmhhbmRsZUVkaXRvckRyb3AoZXZ0LCBlZGl0b3IsIGluZm8pO1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIGF3YWl0IHRoaXMucmVidWlsZFJlZmVyZW5jZUluZGV4KCk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwibW9kaWZ5XCIsIChmaWxlKSA9PiB0aGlzLnRyYWNrVmF1bHRNdXRhdGlvbigoKSA9PiB0aGlzLmhhbmRsZVZhdWx0TW9kaWZ5KGZpbGUpKSkpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcImRlbGV0ZVwiLCAoZmlsZSkgPT4gdGhpcy50cmFja1ZhdWx0TXV0YXRpb24oKCkgPT4gdGhpcy5oYW5kbGVWYXVsdERlbGV0ZShmaWxlKSkpKTtcbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC52YXVsdC5vbihcInJlbmFtZVwiLCAoZmlsZSwgb2xkUGF0aCkgPT4gdGhpcy50cmFja1ZhdWx0TXV0YXRpb24oKCkgPT4gdGhpcy5oYW5kbGVWYXVsdFJlbmFtZShmaWxlLCBvbGRQYXRoKSkpLFxuICAgICk7XG5cbiAgICB0aGlzLnNldHVwQXV0b1N5bmMoKTtcblxuICAgIHZvaWQgdGhpcy51cGxvYWRRdWV1ZS5wcm9jZXNzUGVuZGluZ1Rhc2tzKCk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyKCgpID0+IHtcbiAgICAgIGZvciAoY29uc3QgYmxvYlVybCBvZiB0aGlzLmJsb2JVcmxzKSB7XG4gICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwoYmxvYlVybCk7XG4gICAgICB9XG4gICAgICB0aGlzLmJsb2JVcmxzLmNsZWFyKCk7XG4gICAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy52YWx1ZXMoKSkge1xuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgICB9XG4gICAgICB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy5jbGVhcigpO1xuICAgICAgdGhpcy51cGxvYWRRdWV1ZS5kaXNwb3NlKCk7XG4gICAgfSk7XG4gIH1cblxuICBvbnVubG9hZCgpIHtcbiAgICBmb3IgKGNvbnN0IGJsb2JVcmwgb2YgdGhpcy5ibG9iVXJscykge1xuICAgICAgVVJMLnJldm9rZU9iamVjdFVSTChibG9iVXJsKTtcbiAgICB9XG4gICAgdGhpcy5ibG9iVXJscy5jbGVhcigpO1xuICAgIHRoaXMudXBsb2FkUXVldWU/LmRpc3Bvc2UoKTtcbiAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy52YWx1ZXMoKSkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xuICAgIH1cbiAgICB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy5jbGVhcigpO1xuICB9XG5cbiAgYXN5bmMgbG9hZFBsdWdpblN0YXRlKCkge1xuICAgIGNvbnN0IGxvYWRlZCA9IGF3YWl0IHRoaXMubG9hZERhdGEoKTtcbiAgICBpZiAoIWxvYWRlZCB8fCB0eXBlb2YgbG9hZGVkICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICB0aGlzLnNldHRpbmdzID0geyAuLi5ERUZBVUxUX1NFVFRJTkdTIH07XG4gICAgICB0aGlzLnF1ZXVlID0gW107XG4gICAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzID0gbmV3IE1hcCgpO1xuICAgICAgdGhpcy5zeW5jSW5kZXggPSBuZXcgTWFwKCk7XG4gICAgICB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgPSBuZXcgTWFwKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY2FuZGlkYXRlID0gbG9hZGVkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIGlmIChcInNldHRpbmdzXCIgaW4gY2FuZGlkYXRlIHx8IFwicXVldWVcIiBpbiBjYW5kaWRhdGUpIHtcbiAgICAgIHRoaXMuc2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MsIC4uLigoY2FuZGlkYXRlLnNldHRpbmdzIGFzIFBhcnRpYWw8U2VjdXJlV2ViZGF2U2V0dGluZ3M+KSA/PyB7fSkgfTtcbiAgICAgIHRoaXMucXVldWUgPSBBcnJheS5pc0FycmF5KGNhbmRpZGF0ZS5xdWV1ZSkgPyAoY2FuZGlkYXRlLnF1ZXVlIGFzIFVwbG9hZFRhc2tbXSkgOiBbXTtcbiAgICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMgPSBuZXcgTWFwKFxuICAgICAgICBPYmplY3QuZW50cmllcygoY2FuZGlkYXRlLm5vdGVBY2Nlc3NUaW1lc3RhbXBzIGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfCB1bmRlZmluZWQpID8/IHt9KSxcbiAgICAgICk7XG4gICAgICB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgPSBuZXcgTWFwKFxuICAgICAgICBPYmplY3QuZW50cmllcygoY2FuZGlkYXRlLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgYXMgUmVjb3JkPHN0cmluZywgTWlzc2luZ0xhenlSZW1vdGVSZWNvcmQ+IHwgdW5kZWZpbmVkKSA/PyB7fSlcbiAgICAgICAgICAuZmlsdGVyKChbLCB2YWx1ZV0pID0+IHtcbiAgICAgICAgICAgIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlY29yZCA9IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdHlwZW9mIHJlY29yZC5maXJzdERldGVjdGVkQXQgPT09IFwibnVtYmVyXCIgJiZcbiAgICAgICAgICAgICAgdHlwZW9mIHJlY29yZC5sYXN0RGV0ZWN0ZWRBdCA9PT0gXCJudW1iZXJcIiAmJlxuICAgICAgICAgICAgICB0eXBlb2YgcmVjb3JkLm1pc3NDb3VudCA9PT0gXCJudW1iZXJcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoKFtwYXRoLCB2YWx1ZV0pID0+IFtwYXRoLCB2YWx1ZSBhcyBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZF0pLFxuICAgICAgKTtcbiAgICAgIHRoaXMuc3luY0luZGV4ID0gbmV3IE1hcCgpO1xuICAgICAgZm9yIChjb25zdCBbcGF0aCwgcmF3RW50cnldIG9mIE9iamVjdC5lbnRyaWVzKChjYW5kaWRhdGUuc3luY0luZGV4IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKSA/PyB7fSkpIHtcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IHRoaXMubm9ybWFsaXplU3luY0luZGV4RW50cnkocGF0aCwgcmF3RW50cnkpO1xuICAgICAgICBpZiAobm9ybWFsaXplZCkge1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChwYXRoLCBub3JtYWxpemVkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPVxuICAgICAgICB0eXBlb2YgY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNBdCA9PT0gXCJudW1iZXJcIiA/IGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jQXQgOiAwO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID1cbiAgICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jU3RhdHVzID09PSBcInN0cmluZ1wiID8gY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNTdGF0dXMgOiBcIlwiO1xuICAgICAgdGhpcy5ub3JtYWxpemVFZmZlY3RpdmVTZXR0aW5ncygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuc2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MsIC4uLihjYW5kaWRhdGUgYXMgUGFydGlhbDxTZWN1cmVXZWJkYXZTZXR0aW5ncz4pIH07XG4gICAgdGhpcy5xdWV1ZSA9IFtdO1xuICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5zeW5jSW5kZXggPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gMDtcbiAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSBcIlwiO1xuICAgIHRoaXMubm9ybWFsaXplRWZmZWN0aXZlU2V0dGluZ3MoKTtcbiAgfVxuXG4gIHByaXZhdGUgbm9ybWFsaXplRWZmZWN0aXZlU2V0dGluZ3MoKSB7XG4gICAgLy8gS2VlcCB0aGUgcHVibGljIHNldHRpbmdzIHN1cmZhY2UgaW50ZW50aW9uYWxseSBzbWFsbCBhbmQgZGV0ZXJtaW5pc3RpYy5cbiAgICB0aGlzLnNldHRpbmdzLmRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQgPSB0cnVlO1xuICAgIHRoaXMuc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXMgPSBNYXRoLm1heCgwLCBNYXRoLmZsb29yKHRoaXMuc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXMgfHwgMCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVGb2xkZXIoaW5wdXQ6IHN0cmluZykge1xuICAgIHJldHVybiBub3JtYWxpemVGb2xkZXIoaW5wdXQpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cEF1dG9TeW5jKCkge1xuICAgIGNvbnN0IG1pbnV0ZXMgPSB0aGlzLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzO1xuICAgIGlmIChtaW51dGVzIDw9IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbnRlcnZhbE1zID0gbWludXRlcyAqIDYwICogMTAwMDtcbiAgICB0aGlzLnJlZ2lzdGVySW50ZXJ2YWwoXG4gICAgICB3aW5kb3cuc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICB2b2lkIHRoaXMucnVuQXV0b1N5bmNUaWNrKCk7XG4gICAgICB9LCBpbnRlcnZhbE1zKSxcbiAgICApO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBydW5BdXRvU3luY1RpY2soKSB7XG4gICAgaWYgKHRoaXMuYXV0b1N5bmNUaWNrSW5Qcm9ncmVzcykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuYXV0b1N5bmNUaWNrSW5Qcm9ncmVzcyA9IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQoZmFsc2UpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLmF1dG9TeW5jVGlja0luUHJvZ3Jlc3MgPSBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBzYXZlUGx1Z2luU3RhdGUoKSB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh7XG4gICAgICBzZXR0aW5nczogdGhpcy5zZXR0aW5ncyxcbiAgICAgIHF1ZXVlOiB0aGlzLnF1ZXVlLFxuICAgICAgbm90ZUFjY2Vzc1RpbWVzdGFtcHM6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzLmVudHJpZXMoKSksXG4gICAgICBtaXNzaW5nTGF6eVJlbW90ZU5vdGVzOiBPYmplY3QuZnJvbUVudHJpZXModGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzLmVudHJpZXMoKSksXG4gICAgICBzeW5jSW5kZXg6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLnN5bmNJbmRleC5lbnRyaWVzKCkpLFxuICAgICAgbGFzdFZhdWx0U3luY0F0OiB0aGlzLmxhc3RWYXVsdFN5bmNBdCxcbiAgICAgIGxhc3RWYXVsdFN5bmNTdGF0dXM6IHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyxcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcbiAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVTeW5jSW5kZXhFbnRyeSh2YXVsdFBhdGg6IHN0cmluZywgcmF3RW50cnk6IHVua25vd24pOiBTeW5jSW5kZXhFbnRyeSB8IG51bGwge1xuICAgIGlmICghcmF3RW50cnkgfHwgdHlwZW9mIHJhd0VudHJ5ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBjYW5kaWRhdGUgPSByYXdFbnRyeSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICBjb25zdCByZW1vdGVQYXRoID1cbiAgICAgIHR5cGVvZiBjYW5kaWRhdGUucmVtb3RlUGF0aCA9PT0gXCJzdHJpbmdcIiAmJiBjYW5kaWRhdGUucmVtb3RlUGF0aC5sZW5ndGggPiAwXG4gICAgICAgID8gY2FuZGlkYXRlLnJlbW90ZVBhdGhcbiAgICAgICAgOiB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aCh2YXVsdFBhdGgpO1xuICAgIGNvbnN0IGxvY2FsU2lnbmF0dXJlID1cbiAgICAgIHR5cGVvZiBjYW5kaWRhdGUubG9jYWxTaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgPyBjYW5kaWRhdGUubG9jYWxTaWduYXR1cmVcbiAgICAgICAgOiB0eXBlb2YgY2FuZGlkYXRlLnNpZ25hdHVyZSA9PT0gXCJzdHJpbmdcIlxuICAgICAgICAgID8gY2FuZGlkYXRlLnNpZ25hdHVyZVxuICAgICAgICAgIDogXCJcIjtcbiAgICBjb25zdCByZW1vdGVTaWduYXR1cmUgPVxuICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5yZW1vdGVTaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgPyBjYW5kaWRhdGUucmVtb3RlU2lnbmF0dXJlXG4gICAgICAgIDogdHlwZW9mIGNhbmRpZGF0ZS5zaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgICA/IGNhbmRpZGF0ZS5zaWduYXR1cmVcbiAgICAgICAgICA6IFwiXCI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICByZW1vdGVQYXRoLFxuICAgIH07XG4gIH1cblxuICB0KHpoOiBzdHJpbmcsIGVuOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRMYW5ndWFnZSgpID09PSBcInpoXCIgPyB6aCA6IGVuO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRMYW5ndWFnZSgpIHtcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5sYW5ndWFnZSA9PT0gXCJhdXRvXCIpIHtcbiAgICAgIGNvbnN0IGxvY2FsZSA9IHR5cGVvZiBuYXZpZ2F0b3IgIT09IFwidW5kZWZpbmVkXCIgPyBuYXZpZ2F0b3IubGFuZ3VhZ2UudG9Mb3dlckNhc2UoKSA6IFwiZW5cIjtcbiAgICAgIHJldHVybiBsb2NhbGUuc3RhcnRzV2l0aChcInpoXCIpID8gXCJ6aFwiIDogXCJlblwiO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNldHRpbmdzLmxhbmd1YWdlO1xuICB9XG5cbiAgZm9ybWF0TGFzdFN5bmNMYWJlbCgpIHtcbiAgICBpZiAoIXRoaXMubGFzdFZhdWx0U3luY0F0KSB7XG4gICAgICByZXR1cm4gdGhpcy50KFwiXHU0RTBBXHU2QjIxXHU1NDBDXHU2QjY1XHVGRjFBXHU1QzFBXHU2NzJBXHU2MjY3XHU4ODRDXCIsIFwiTGFzdCBzeW5jOiBub3QgcnVuIHlldFwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy50KFxuICAgICAgYFx1NEUwQVx1NkIyMVx1NTQwQ1x1NkI2NVx1RkYxQSR7bmV3IERhdGUodGhpcy5sYXN0VmF1bHRTeW5jQXQpLnRvTG9jYWxlU3RyaW5nKCl9YCxcbiAgICAgIGBMYXN0IHN5bmM6ICR7bmV3IERhdGUodGhpcy5sYXN0VmF1bHRTeW5jQXQpLnRvTG9jYWxlU3RyaW5nKCl9YCxcbiAgICApO1xuICB9XG5cbiAgZm9ybWF0U3luY1N0YXR1c0xhYmVsKCkge1xuICAgIHJldHVybiB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXNcbiAgICAgID8gdGhpcy50KGBcdTY3MDBcdThGRDFcdTcyQjZcdTYwMDFcdUZGMUEke3RoaXMubGFzdFZhdWx0U3luY1N0YXR1c31gLCBgUmVjZW50IHN0YXR1czogJHt0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXN9YClcbiAgICAgIDogdGhpcy50KFwiXHU2NzAwXHU4RkQxXHU3MkI2XHU2MDAxXHVGRjFBXHU2NjgyXHU2NUUwXCIsIFwiUmVjZW50IHN0YXR1czogbm9uZVwiKTtcbiAgfVxuXG4gIGFzeW5jIHJ1bk1hbnVhbFN5bmMoKSB7XG4gICAgYXdhaXQgdGhpcy5zeW5jQ29uZmlndXJlZFZhdWx0Q29udGVudCh0cnVlKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVidWlsZFJlZmVyZW5jZUluZGV4KCkge1xuICAgIGNvbnN0IG5leHQgPSBuZXcgTWFwPHN0cmluZywgU2V0PHN0cmluZz4+KCk7XG4gICAgZm9yIChjb25zdCBmaWxlIG9mIHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKSkge1xuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICBuZXh0LnNldChmaWxlLnBhdGgsIHRoaXMuZXh0cmFjdFJlbW90ZVBhdGhzRnJvbVRleHQoY29udGVudCkpO1xuICAgIH1cbiAgICB0aGlzLm5vdGVSZW1vdGVSZWZzID0gbmV4dDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlVmF1bHRNb2RpZnkoZmlsZTogVEFic3RyYWN0RmlsZSkge1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkgfHwgZmlsZS5leHRlbnNpb24gIT09IFwibWRcIikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IG5leHRSZWZzID0gdGhpcy5leHRyYWN0UmVtb3RlUGF0aHNGcm9tVGV4dChjb250ZW50KTtcbiAgICBjb25zdCBwcmV2aW91c1JlZnMgPSB0aGlzLm5vdGVSZW1vdGVSZWZzLmdldChmaWxlLnBhdGgpID8/IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIHRoaXMubm90ZVJlbW90ZVJlZnMuc2V0KGZpbGUucGF0aCwgbmV4dFJlZnMpO1xuXG4gICAgY29uc3QgYWRkZWQgPSBbLi4ubmV4dFJlZnNdLmZpbHRlcigodmFsdWUpID0+ICFwcmV2aW91c1JlZnMuaGFzKHZhbHVlKSk7XG4gICAgY29uc3QgcmVtb3ZlZCA9IFsuLi5wcmV2aW91c1JlZnNdLmZpbHRlcigodmFsdWUpID0+ICFuZXh0UmVmcy5oYXModmFsdWUpKTtcbiAgICBpZiAoYWRkZWQubGVuZ3RoID4gMCkge1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMoZmlsZS5wYXRoLCBcImltYWdlLWFkZFwiKTtcbiAgICB9XG4gICAgaWYgKHJlbW92ZWQubGVuZ3RoID4gMCkge1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMoZmlsZS5wYXRoLCBcImltYWdlLXJlbW92ZVwiKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZVZhdWx0RGVsZXRlKGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgoZmlsZS5wYXRoKSkge1xuICAgICAgYXdhaXQgdGhpcy53cml0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCwgdGhpcy5zeW5jSW5kZXguZ2V0KGZpbGUucGF0aCk/LnJlbW90ZVNpZ25hdHVyZSk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgfVxuXG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIHRoaXMubm90ZVJlbW90ZVJlZnMuZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVWYXVsdFJlbmFtZShmaWxlOiBUQWJzdHJhY3RGaWxlLCBvbGRQYXRoOiBzdHJpbmcpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgob2xkUGF0aCkpIHtcbiAgICAgIGF3YWl0IHRoaXMud3JpdGVEZWxldGlvblRvbWJzdG9uZShvbGRQYXRoLCB0aGlzLnN5bmNJbmRleC5nZXQob2xkUGF0aCk/LnJlbW90ZVNpZ25hdHVyZSk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUob2xkUGF0aCk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgIH1cblxuICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICBjb25zdCByZWZzID0gdGhpcy5ub3RlUmVtb3RlUmVmcy5nZXQob2xkUGF0aCk7XG4gICAgICBpZiAocmVmcykge1xuICAgICAgICB0aGlzLm5vdGVSZW1vdGVSZWZzLmRlbGV0ZShvbGRQYXRoKTtcbiAgICAgICAgdGhpcy5ub3RlUmVtb3RlUmVmcy5zZXQoZmlsZS5wYXRoLCByZWZzKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCF0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgoZmlsZS5wYXRoKSkge1xuICAgICAgICB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyhmaWxlLnBhdGgsIFwiaW1hZ2UtYWRkXCIpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdFJlbW90ZVBhdGhzRnJvbVRleHQoY29udGVudDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVmcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IHNwYW5SZWdleCA9IC9kYXRhLXNlY3VyZS13ZWJkYXY9XCIoW15cIl0rKVwiL2c7XG4gICAgY29uc3QgcHJvdG9jb2xSZWdleCA9IC93ZWJkYXYtc2VjdXJlOlxcL1xcLyhbXlxccylcIl0rKS9nO1xuICAgIGNvbnN0IGNvZGVCbG9ja1JlZ2V4ID0gL2BgYHNlY3VyZS13ZWJkYXZcXHMrKFtcXHNcXFNdKj8pYGBgL2c7XG4gICAgbGV0IG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXG4gICAgd2hpbGUgKChtYXRjaCA9IHNwYW5SZWdleC5leGVjKGNvbnRlbnQpKSAhPT0gbnVsbCkge1xuICAgICAgcmVmcy5hZGQodGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0pKTtcbiAgICB9XG5cbiAgICB3aGlsZSAoKG1hdGNoID0gcHJvdG9jb2xSZWdleC5leGVjKGNvbnRlbnQpKSAhPT0gbnVsbCkge1xuICAgICAgcmVmcy5hZGQodGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0pKTtcbiAgICB9XG5cbiAgICB3aGlsZSAoKG1hdGNoID0gY29kZUJsb2NrUmVnZXguZXhlYyhjb250ZW50KSkgIT09IG51bGwpIHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IHRoaXMuaW1hZ2VTdXBwb3J0LnBhcnNlU2VjdXJlSW1hZ2VCbG9jayhtYXRjaFsxXSk7XG4gICAgICBpZiAocGFyc2VkPy5wYXRoKSB7XG4gICAgICAgIHJlZnMuYWRkKHBhcnNlZC5wYXRoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVmcztcbiAgfVxuXG4gIHByaXZhdGUgc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jKG5vdGVQYXRoOiBzdHJpbmcsIHJlYXNvbjogXCJpbWFnZS1hZGRcIiB8IFwiaW1hZ2UtcmVtb3ZlXCIpIHtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLmdldChub3RlUGF0aCk7XG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KGV4aXN0aW5nKTtcbiAgICB9XG5cbiAgICBjb25zdCBkZWxheU1zID0gcmVhc29uID09PSBcImltYWdlLWFkZFwiID8gMTIwMCA6IDYwMDtcbiAgICBjb25zdCB0aW1lb3V0SWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy5kZWxldGUobm90ZVBhdGgpO1xuICAgICAgdm9pZCB0aGlzLmZsdXNoUHJpb3JpdHlOb3RlU3luYyhub3RlUGF0aCwgcmVhc29uKTtcbiAgICB9LCBkZWxheU1zKTtcbiAgICB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy5zZXQobm90ZVBhdGgsIHRpbWVvdXRJZCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGZsdXNoUHJpb3JpdHlOb3RlU3luYyhub3RlUGF0aDogc3RyaW5nLCByZWFzb246IFwiaW1hZ2UtYWRkXCIgfCBcImltYWdlLXJlbW92ZVwiKSB7XG4gICAgaWYgKHRoaXMucHJpb3JpdHlOb3RlU3luY3NJbkZsaWdodC5oYXMobm90ZVBhdGgpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgdGhpcy51cGxvYWRRdWV1ZS5oYXNQZW5kaW5nV29ya0Zvck5vdGUobm90ZVBhdGgpIHx8XG4gICAgICB0aGlzLnBlbmRpbmdWYXVsdE11dGF0aW9uUHJvbWlzZXMuc2l6ZSA+IDAgfHxcbiAgICAgIHRoaXMuc3luY0luUHJvZ3Jlc3MgfHxcbiAgICAgIHRoaXMuYXV0b1N5bmNUaWNrSW5Qcm9ncmVzc1xuICAgICkge1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZVBhdGgsIHJlYXNvbik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZmlsZSA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKG5vdGVQYXRoKTtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHx8IGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIgfHwgdGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKGZpbGUucGF0aCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnByaW9yaXR5Tm90ZVN5bmNzSW5GbGlnaHQuYWRkKG5vdGVQYXRoKTtcbiAgICB0cnkge1xuICAgICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG5cbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSk7XG4gICAgICBpZiAodGhpcy5wYXJzZU5vdGVTdHViKGNvbnRlbnQpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoLCBjb250ZW50KTtcbiAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgbG9jYWxTaWduYXR1cmU6IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUoZmlsZSwgY29udGVudCksXG4gICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgfSk7XG4gICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLnQoXG4gICAgICAgIHJlYXNvbiA9PT0gXCJpbWFnZS1hZGRcIlxuICAgICAgICAgID8gYFx1NURGMlx1NEYxOFx1NTE0OFx1NTQwQ1x1NkI2NVx1NTZGRVx1NzI0N1x1NjVCMFx1NTg5RVx1NTQwRVx1NzY4NFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gXG4gICAgICAgICAgOiBgXHU1REYyXHU0RjE4XHU1MTQ4XHU1NDBDXHU2QjY1XHU1NkZFXHU3MjQ3XHU1MjIwXHU5NjY0XHU1NDBFXHU3Njg0XHU3QjE0XHU4QkIwXHVGRjFBJHtmaWxlLmJhc2VuYW1lfWAsXG4gICAgICAgIHJlYXNvbiA9PT0gXCJpbWFnZS1hZGRcIlxuICAgICAgICAgID8gYFByaW9yaXRpemVkIG5vdGUgc3luYyBmaW5pc2hlZCBhZnRlciBpbWFnZSBhZGQ6ICR7ZmlsZS5iYXNlbmFtZX1gXG4gICAgICAgICAgOiBgUHJpb3JpdGl6ZWQgbm90ZSBzeW5jIGZpbmlzaGVkIGFmdGVyIGltYWdlIHJlbW92YWw6ICR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJQcmlvcml0eSBub3RlIHN5bmMgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gRGF0ZS5ub3coKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9IHRoaXMuZGVzY3JpYmVFcnJvcihcbiAgICAgICAgdGhpcy50KFxuICAgICAgICAgIHJlYXNvbiA9PT0gXCJpbWFnZS1hZGRcIiA/IFwiXHU1NkZFXHU3MjQ3XHU2NUIwXHU1ODlFXHU1NDBFXHU3Njg0XHU3QjE0XHU4QkIwXHU0RjE4XHU1MTQ4XHU1NDBDXHU2QjY1XHU1OTMxXHU4RDI1XCIgOiBcIlx1NTZGRVx1NzI0N1x1NTIyMFx1OTY2NFx1NTQwRVx1NzY4NFx1N0IxNFx1OEJCMFx1NEYxOFx1NTE0OFx1NTQwQ1x1NkI2NVx1NTkzMVx1OEQyNVwiLFxuICAgICAgICAgIHJlYXNvbiA9PT0gXCJpbWFnZS1hZGRcIiA/IFwiUHJpb3JpdHkgbm90ZSBzeW5jIGFmdGVyIGltYWdlIGFkZCBmYWlsZWRcIiA6IFwiUHJpb3JpdHkgbm90ZSBzeW5jIGFmdGVyIGltYWdlIHJlbW92YWwgZmFpbGVkXCIsXG4gICAgICAgICksXG4gICAgICAgIGVycm9yLFxuICAgICAgKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyhub3RlUGF0aCwgcmVhc29uKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy5wcmlvcml0eU5vdGVTeW5jc0luRmxpZ2h0LmRlbGV0ZShub3RlUGF0aCk7XG4gICAgfVxuICB9XG5cblxuICBwcml2YXRlIGFzeW5jIGJ1aWxkVXBsb2FkUmVwbGFjZW1lbnRzKGNvbnRlbnQ6IHN0cmluZywgbm90ZUZpbGU6IFRGaWxlLCB1cGxvYWRDYWNoZT86IE1hcDxzdHJpbmcsIHN0cmluZz4pIHtcbiAgICBjb25zdCBzZWVuID0gbmV3IE1hcDxzdHJpbmcsIFVwbG9hZFJld3JpdGU+KCk7XG4gICAgY29uc3Qgd2lraU1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvIVxcW1xcWyhbXlxcXV0rKVxcXVxcXS9nKV07XG4gICAgY29uc3QgbWFya2Rvd25NYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtbXlxcXV0qXVxcKChbXildKylcXCkvZyldO1xuICAgIGNvbnN0IGh0bWxJbWFnZU1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvPGltZ1xcYltePl0qc3JjPVtcIiddKFteXCInXSspW1wiJ11bXj5dKj4vZ2kpXTtcblxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2Ygd2lraU1hdGNoZXMpIHtcbiAgICAgIGNvbnN0IHJhd0xpbmsgPSBtYXRjaFsxXS5zcGxpdChcInxcIilbMF0udHJpbSgpO1xuICAgICAgY29uc3QgZmlsZSA9IHRoaXMucmVzb2x2ZUxpbmtlZEZpbGUocmF3TGluaywgbm90ZUZpbGUucGF0aCk7XG4gICAgICBpZiAoIWZpbGUgfHwgIXRoaXMuaXNJbWFnZUZpbGUoZmlsZSkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghc2Vlbi5oYXMobWF0Y2hbMF0pKSB7XG4gICAgICAgIGNvbnN0IHJlbW90ZVVybCA9IGF3YWl0IHRoaXMudXBsb2FkVmF1bHRGaWxlKGZpbGUsIHVwbG9hZENhY2hlKTtcbiAgICAgICAgc2Vlbi5zZXQobWF0Y2hbMF0sIHtcbiAgICAgICAgICBvcmlnaW5hbDogbWF0Y2hbMF0sXG4gICAgICAgICAgcmV3cml0dGVuOiB0aGlzLmltYWdlU3VwcG9ydC5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgZmlsZS5iYXNlbmFtZSksXG4gICAgICAgICAgc291cmNlRmlsZTogZmlsZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXJrZG93bk1hdGNoZXMpIHtcbiAgICAgIGNvbnN0IHJhd0xpbmsgPSBkZWNvZGVVUklDb21wb25lbnQobWF0Y2hbMV0udHJpbSgpLnJlcGxhY2UoL148fD4kL2csIFwiXCIpKTtcbiAgICAgIGlmICgvXih3ZWJkYXYtc2VjdXJlOnxkYXRhOikvaS50ZXN0KHJhd0xpbmspKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5pc0h0dHBVcmwocmF3TGluaykpIHtcbiAgICAgICAgaWYgKCFzZWVuLmhhcyhtYXRjaFswXSkpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRSZW1vdGVJbWFnZVVybChyYXdMaW5rLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgICAgICBjb25zdCBhbHRUZXh0ID0gdGhpcy5leHRyYWN0TWFya2Rvd25BbHRUZXh0KG1hdGNoWzBdKSB8fCB0aGlzLmdldERpc3BsYXlOYW1lRnJvbVVybChyYXdMaW5rKTtcbiAgICAgICAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgICAgICAgIG9yaWdpbmFsOiBtYXRjaFswXSxcbiAgICAgICAgICAgICAgcmV3cml0dGVuOiB0aGlzLmltYWdlU3VwcG9ydC5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgYWx0VGV4dCksXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgW3NlY3VyZS13ZWJkYXYtaW1hZ2VzXSBcdThERjNcdThGQzdcdTU5MzFcdThEMjVcdTc2ODRcdThGRENcdTdBMEJcdTU2RkVcdTcyNDcgJHtyYXdMaW5rfWAsIGU/Lm1lc3NhZ2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZmlsZSA9IHRoaXMucmVzb2x2ZUxpbmtlZEZpbGUocmF3TGluaywgbm90ZUZpbGUucGF0aCk7XG4gICAgICBpZiAoIWZpbGUgfHwgIXRoaXMuaXNJbWFnZUZpbGUoZmlsZSkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghc2Vlbi5oYXMobWF0Y2hbMF0pKSB7XG4gICAgICAgIGNvbnN0IHJlbW90ZVVybCA9IGF3YWl0IHRoaXMudXBsb2FkVmF1bHRGaWxlKGZpbGUsIHVwbG9hZENhY2hlKTtcbiAgICAgICAgc2Vlbi5zZXQobWF0Y2hbMF0sIHtcbiAgICAgICAgICBvcmlnaW5hbDogbWF0Y2hbMF0sXG4gICAgICAgICAgcmV3cml0dGVuOiB0aGlzLmltYWdlU3VwcG9ydC5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgZmlsZS5iYXNlbmFtZSksXG4gICAgICAgICAgc291cmNlRmlsZTogZmlsZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiBodG1sSW1hZ2VNYXRjaGVzKSB7XG4gICAgICBjb25zdCByYXdMaW5rID0gdGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0udHJpbSgpKTtcbiAgICAgIGlmICghdGhpcy5pc0h0dHBVcmwocmF3TGluaykgfHwgc2Vlbi5oYXMobWF0Y2hbMF0pKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFJlbW90ZUltYWdlVXJsKHJhd0xpbmssIHVwbG9hZENhY2hlKTtcbiAgICAgICAgY29uc3QgYWx0VGV4dCA9IHRoaXMuZXh0cmFjdEh0bWxJbWFnZUFsdFRleHQobWF0Y2hbMF0pIHx8IHRoaXMuZ2V0RGlzcGxheU5hbWVGcm9tVXJsKHJhd0xpbmspO1xuICAgICAgICBzZWVuLnNldChtYXRjaFswXSwge1xuICAgICAgICAgIG9yaWdpbmFsOiBtYXRjaFswXSxcbiAgICAgICAgICByZXdyaXR0ZW46IHRoaXMuaW1hZ2VTdXBwb3J0LmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsLCBhbHRUZXh0KSxcbiAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAgICAgY29uc29sZS53YXJuKGBbc2VjdXJlLXdlYmRhdi1pbWFnZXNdIFx1OERGM1x1OEZDN1x1NTkzMVx1OEQyNVx1NzY4NFx1OEZEQ1x1N0EwQlx1NTZGRVx1NzI0NyAke3Jhd0xpbmt9YCwgZT8ubWVzc2FnZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIFsuLi5zZWVuLnZhbHVlcygpXTtcbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdE1hcmtkb3duQWx0VGV4dChtYXJrZG93bkltYWdlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtYXRjaCA9IG1hcmtkb3duSW1hZ2UubWF0Y2goL14hXFxbKFteXFxdXSopXFxdLyk7XG4gICAgcmV0dXJuIG1hdGNoPy5bMV0/LnRyaW0oKSA/PyBcIlwiO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRyYWN0SHRtbEltYWdlQWx0VGV4dChodG1sSW1hZ2U6IHN0cmluZykge1xuICAgIGNvbnN0IG1hdGNoID0gaHRtbEltYWdlLm1hdGNoKC9cXGJhbHQ9W1wiJ10oW15cIiddKilbXCInXS9pKTtcbiAgICByZXR1cm4gbWF0Y2ggPyB0aGlzLnVuZXNjYXBlSHRtbChtYXRjaFsxXS50cmltKCkpIDogXCJcIjtcbiAgfVxuXG4gIHByaXZhdGUgaXNIdHRwVXJsKHZhbHVlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gL15odHRwcz86XFwvXFwvL2kudGVzdCh2YWx1ZSk7XG4gIH1cblxuICBwcml2YXRlIGdldERpc3BsYXlOYW1lRnJvbVVybChyYXdVcmw6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJhd1VybCk7XG4gICAgICBjb25zdCBmaWxlTmFtZSA9IHRoaXMuc2FuaXRpemVGaWxlTmFtZSh1cmwucGF0aG5hbWUuc3BsaXQoXCIvXCIpLnBvcCgpIHx8IFwiXCIpO1xuICAgICAgaWYgKGZpbGVOYW1lKSB7XG4gICAgICAgIHJldHVybiBmaWxlTmFtZS5yZXBsYWNlKC9cXC5bXi5dKyQvLCBcIlwiKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIEZhbGwgdGhyb3VnaCB0byB0aGUgZ2VuZXJpYyBsYWJlbCBiZWxvdy5cbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy50KFwiXHU3RjUxXHU5ODc1XHU1NkZFXHU3MjQ3XCIsIFwiV2ViIGltYWdlXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSByZXNvbHZlTGlua2VkRmlsZShsaW5rOiBzdHJpbmcsIHNvdXJjZVBhdGg6IHN0cmluZyk6IFRGaWxlIHwgbnVsbCB7XG4gICAgY29uc3QgY2xlYW5lZCA9IGxpbmsucmVwbGFjZSgvIy4qLywgXCJcIikudHJpbSgpO1xuICAgIGNvbnN0IHRhcmdldCA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0Rmlyc3RMaW5rcGF0aERlc3QoY2xlYW5lZCwgc291cmNlUGF0aCk7XG4gICAgcmV0dXJuIHRhcmdldCBpbnN0YW5jZW9mIFRGaWxlID8gdGFyZ2V0IDogbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgaXNJbWFnZUZpbGUoZmlsZTogVEZpbGUpIHtcbiAgICByZXR1cm4gL14ocG5nfGpwZT9nfGdpZnx3ZWJwfGJtcHxzdmcpJC9pLnRlc3QoZmlsZS5leHRlbnNpb24pO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRWYXVsdEZpbGUoZmlsZTogVEZpbGUsIHVwbG9hZENhY2hlPzogTWFwPHN0cmluZywgc3RyaW5nPikge1xuICAgIGlmICh1cGxvYWRDYWNoZT8uaGFzKGZpbGUucGF0aCkpIHtcbiAgICAgIHJldHVybiB1cGxvYWRDYWNoZS5nZXQoZmlsZS5wYXRoKSE7XG4gICAgfVxuXG4gICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG4gICAgY29uc3QgYmluYXJ5ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZEJpbmFyeShmaWxlKTtcbiAgICBjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRoaXMucHJlcGFyZVVwbG9hZFBheWxvYWQoYmluYXJ5LCB0aGlzLmdldE1pbWVUeXBlKGZpbGUuZXh0ZW5zaW9uKSwgZmlsZS5uYW1lKTtcbiAgICBjb25zdCByZW1vdGVOYW1lID0gYXdhaXQgdGhpcy5idWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeShwcmVwYXJlZC5maWxlTmFtZSwgcHJlcGFyZWQuYmluYXJ5KTtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5idWlsZFJlbW90ZVBhdGgocmVtb3RlTmFtZSk7XG4gICAgYXdhaXQgdGhpcy51cGxvYWRCaW5hcnkocmVtb3RlUGF0aCwgcHJlcGFyZWQuYmluYXJ5LCBwcmVwYXJlZC5taW1lVHlwZSk7XG4gICAgY29uc3QgcmVtb3RlVXJsID0gYCR7U0VDVVJFX1BST1RPQ09MfS8vJHtyZW1vdGVQYXRofWA7XG4gICAgdXBsb2FkQ2FjaGU/LnNldChmaWxlLnBhdGgsIHJlbW90ZVVybCk7XG4gICAgcmV0dXJuIHJlbW90ZVVybDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkUmVtb3RlSW1hZ2VVcmwoaW1hZ2VVcmw6IHN0cmluZywgdXBsb2FkQ2FjaGU/OiBNYXA8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgY29uc3QgY2FjaGVLZXkgPSBgcmVtb3RlOiR7aW1hZ2VVcmx9YDtcbiAgICBpZiAodXBsb2FkQ2FjaGU/LmhhcyhjYWNoZUtleSkpIHtcbiAgICAgIHJldHVybiB1cGxvYWRDYWNoZS5nZXQoY2FjaGVLZXkpITtcbiAgICB9XG5cbiAgICB0aGlzLmVuc3VyZUNvbmZpZ3VyZWQoKTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IGltYWdlVXJsLFxuICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgZm9sbG93UmVkaXJlY3RzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgdGhpcy5hc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2UsIFwiUmVtb3RlIGltYWdlIGRvd25sb2FkXCIpO1xuXG4gICAgY29uc3QgY29udGVudFR5cGUgPSByZXNwb25zZS5oZWFkZXJzW1wiY29udGVudC10eXBlXCJdID8/IFwiXCI7XG4gICAgaWYgKCF0aGlzLmlzSW1hZ2VDb250ZW50VHlwZShjb250ZW50VHlwZSkgJiYgIXRoaXMubG9va3NMaWtlSW1hZ2VVcmwoaW1hZ2VVcmwpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiXHU4RkRDXHU3QTBCXHU5NEZFXHU2M0E1XHU0RTBEXHU2NjJGXHU1M0VGXHU4QkM2XHU1MjJCXHU3Njg0XHU1NkZFXHU3MjQ3XHU4RDQ0XHU2RTkwXHUzMDAyXCIsIFwiVGhlIHJlbW90ZSBVUkwgZG9lcyBub3QgbG9vayBsaWtlIGFuIGltYWdlIHJlc291cmNlLlwiKSk7XG4gICAgfVxuXG4gICAgY29uc3QgZmlsZU5hbWUgPSB0aGlzLmJ1aWxkUmVtb3RlU291cmNlRmlsZU5hbWUoaW1hZ2VVcmwsIGNvbnRlbnRUeXBlKTtcbiAgICBjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRoaXMucHJlcGFyZVVwbG9hZFBheWxvYWQoXG4gICAgICByZXNwb25zZS5hcnJheUJ1ZmZlcixcbiAgICAgIHRoaXMubm9ybWFsaXplSW1hZ2VNaW1lVHlwZShjb250ZW50VHlwZSwgZmlsZU5hbWUpLFxuICAgICAgZmlsZU5hbWUsXG4gICAgKTtcbiAgICBjb25zdCByZW1vdGVOYW1lID0gYXdhaXQgdGhpcy5idWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeShwcmVwYXJlZC5maWxlTmFtZSwgcHJlcGFyZWQuYmluYXJ5KTtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5idWlsZFJlbW90ZVBhdGgocmVtb3RlTmFtZSk7XG4gICAgYXdhaXQgdGhpcy51cGxvYWRCaW5hcnkocmVtb3RlUGF0aCwgcHJlcGFyZWQuYmluYXJ5LCBwcmVwYXJlZC5taW1lVHlwZSk7XG4gICAgY29uc3QgcmVtb3RlVXJsID0gYCR7U0VDVVJFX1BST1RPQ09MfS8vJHtyZW1vdGVQYXRofWA7XG4gICAgdXBsb2FkQ2FjaGU/LnNldChjYWNoZUtleSwgcmVtb3RlVXJsKTtcbiAgICByZXR1cm4gcmVtb3RlVXJsO1xuICB9XG5cbiAgcHJpdmF0ZSBpc0ltYWdlQ29udGVudFR5cGUoY29udGVudFR5cGU6IHN0cmluZykge1xuICAgIHJldHVybiAvXmltYWdlXFwvL2kudGVzdChjb250ZW50VHlwZS50cmltKCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBsb29rc0xpa2VJbWFnZVVybChyYXdVcmw6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJhd1VybCk7XG4gICAgICByZXR1cm4gL1xcLihwbmd8anBlP2d8Z2lmfHdlYnB8Ym1wfHN2ZykkL2kudGVzdCh1cmwucGF0aG5hbWUpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRSZW1vdGVTb3VyY2VGaWxlTmFtZShyYXdVcmw6IHN0cmluZywgY29udGVudFR5cGU6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJhd1VybCk7XG4gICAgICBjb25zdCBjYW5kaWRhdGUgPSB0aGlzLnNhbml0aXplRmlsZU5hbWUodXJsLnBhdGhuYW1lLnNwbGl0KFwiL1wiKS5wb3AoKSB8fCBcIlwiKTtcbiAgICAgIGlmIChjYW5kaWRhdGUgJiYgL1xcLlthLXowLTldKyQvaS50ZXN0KGNhbmRpZGF0ZSkpIHtcbiAgICAgICAgcmV0dXJuIGNhbmRpZGF0ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZXh0ZW5zaW9uID0gdGhpcy5nZXRFeHRlbnNpb25Gcm9tTWltZVR5cGUoY29udGVudFR5cGUpIHx8IFwicG5nXCI7XG4gICAgICByZXR1cm4gY2FuZGlkYXRlID8gYCR7Y2FuZGlkYXRlfS4ke2V4dGVuc2lvbn1gIDogYHJlbW90ZS1pbWFnZS4ke2V4dGVuc2lvbn1gO1xuICAgIH0gY2F0Y2gge1xuICAgICAgY29uc3QgZXh0ZW5zaW9uID0gdGhpcy5nZXRFeHRlbnNpb25Gcm9tTWltZVR5cGUoY29udGVudFR5cGUpIHx8IFwicG5nXCI7XG4gICAgICByZXR1cm4gYHJlbW90ZS1pbWFnZS4ke2V4dGVuc2lvbn1gO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgc2FuaXRpemVGaWxlTmFtZShmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGZpbGVOYW1lLnJlcGxhY2UoL1tcXFxcLzoqP1wiPD58XSsvZywgXCItXCIpLnRyaW0oKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0RXh0ZW5zaW9uRnJvbU1pbWVUeXBlKGNvbnRlbnRUeXBlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtaW1lVHlwZSA9IGNvbnRlbnRUeXBlLnNwbGl0KFwiO1wiKVswXS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICByZXR1cm4gTUlNRV9NQVBbbWltZVR5cGVdID8/IFwiXCI7XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUltYWdlTWltZVR5cGUoY29udGVudFR5cGU6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IG1pbWVUeXBlID0gY29udGVudFR5cGUuc3BsaXQoXCI7XCIpWzBdLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmIChtaW1lVHlwZSAmJiBtaW1lVHlwZSAhPT0gXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIikge1xuICAgICAgcmV0dXJuIG1pbWVUeXBlO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmdldE1pbWVUeXBlRnJvbUZpbGVOYW1lKGZpbGVOYW1lKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkQmluYXJ5KHJlbW90ZVBhdGg6IHN0cmluZywgYmluYXJ5OiBBcnJheUJ1ZmZlciwgbWltZVR5cGU6IHN0cmluZykge1xuICAgIGF3YWl0IHRoaXMuZW5zdXJlUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlUGF0aCk7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIlBVVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBtaW1lVHlwZSxcbiAgICAgIH0sXG4gICAgICBib2R5OiBiaW5hcnksXG4gICAgfSk7XG5cbiAgICB0aGlzLmFzc2VydFJlc3BvbnNlU3VjY2VzcyhyZXNwb25zZSwgXCJVcGxvYWRcIik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUVkaXRvclBhc3RlKGV2dDogQ2xpcGJvYXJkRXZlbnQsIGVkaXRvcjogRWRpdG9yLCBpbmZvOiBNYXJrZG93blZpZXcgfCBNYXJrZG93bkZpbGVJbmZvKSB7XG4gICAgaWYgKGV2dC5kZWZhdWx0UHJldmVudGVkIHx8ICFpbmZvLmZpbGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbWFnZUZpbGUgPSB0aGlzLmV4dHJhY3RJbWFnZUZpbGVGcm9tQ2xpcGJvYXJkKGV2dCk7XG4gICAgaWYgKGltYWdlRmlsZSkge1xuICAgICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCBmaWxlTmFtZSA9IGltYWdlRmlsZS5uYW1lIHx8IHRoaXMuYnVpbGRDbGlwYm9hcmRGaWxlTmFtZShpbWFnZUZpbGUudHlwZSk7XG4gICAgICBhd2FpdCB0aGlzLnVwbG9hZFF1ZXVlLmVucXVldWVFZGl0b3JJbWFnZVVwbG9hZChpbmZvLmZpbGUsIGVkaXRvciwgaW1hZ2VGaWxlLCBmaWxlTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaHRtbCA9IGV2dC5jbGlwYm9hcmREYXRhPy5nZXREYXRhKFwidGV4dC9odG1sXCIpPy50cmltKCkgPz8gXCJcIjtcbiAgICBpZiAoIWh0bWwgfHwgIXRoaXMuaHRtbENvbnRhaW5zUmVtb3RlSW1hZ2VzKGh0bWwpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgYXdhaXQgdGhpcy5oYW5kbGVIdG1sUGFzdGVXaXRoUmVtb3RlSW1hZ2VzKGluZm8uZmlsZSwgZWRpdG9yLCBodG1sKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlRWRpdG9yRHJvcChldnQ6IERyYWdFdmVudCwgZWRpdG9yOiBFZGl0b3IsIGluZm86IE1hcmtkb3duVmlldyB8IE1hcmtkb3duRmlsZUluZm8pIHtcbiAgICBpZiAoZXZ0LmRlZmF1bHRQcmV2ZW50ZWQgfHwgIWluZm8uZmlsZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGltYWdlRmlsZSA9IHRoaXMuZXh0cmFjdEltYWdlRmlsZUZyb21Ecm9wKGV2dCk7XG4gICAgaWYgKCFpbWFnZUZpbGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICBjb25zdCBmaWxlTmFtZSA9IGltYWdlRmlsZS5uYW1lIHx8IHRoaXMuYnVpbGRDbGlwYm9hcmRGaWxlTmFtZShpbWFnZUZpbGUudHlwZSk7XG4gICAgYXdhaXQgdGhpcy51cGxvYWRRdWV1ZS5lbnF1ZXVlRWRpdG9ySW1hZ2VVcGxvYWQoaW5mby5maWxlLCBlZGl0b3IsIGltYWdlRmlsZSwgZmlsZU5hbWUpO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRyYWN0SW1hZ2VGaWxlRnJvbUNsaXBib2FyZChldnQ6IENsaXBib2FyZEV2ZW50KSB7XG4gICAgY29uc3QgZGlyZWN0ID0gQXJyYXkuZnJvbShldnQuY2xpcGJvYXJkRGF0YT8uZmlsZXMgPz8gW10pLmZpbmQoKGZpbGUpID0+IGZpbGUudHlwZS5zdGFydHNXaXRoKFwiaW1hZ2UvXCIpKTtcbiAgICBpZiAoZGlyZWN0KSB7XG4gICAgICByZXR1cm4gZGlyZWN0O1xuICAgIH1cblxuICAgIGNvbnN0IGl0ZW0gPSBBcnJheS5mcm9tKGV2dC5jbGlwYm9hcmREYXRhPy5pdGVtcyA/PyBbXSkuZmluZCgoZW50cnkpID0+IGVudHJ5LnR5cGUuc3RhcnRzV2l0aChcImltYWdlL1wiKSk7XG4gICAgcmV0dXJuIGl0ZW0/LmdldEFzRmlsZSgpID8/IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGh0bWxDb250YWluc1JlbW90ZUltYWdlcyhodG1sOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gLzxpbWdcXGJbXj5dKnNyYz1bXCInXWh0dHBzPzpcXC9cXC9bXlwiJ10rW1wiJ11bXj5dKj4vaS50ZXN0KGh0bWwpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVIdG1sUGFzdGVXaXRoUmVtb3RlSW1hZ2VzKG5vdGVGaWxlOiBURmlsZSwgZWRpdG9yOiBFZGl0b3IsIGh0bWw6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZW5kZXJlZCA9IGF3YWl0IHRoaXMuY29udmVydEh0bWxDbGlwYm9hcmRUb1NlY3VyZU1hcmtkb3duKGh0bWwsIG5vdGVGaWxlKTtcbiAgICAgIGlmICghcmVuZGVyZWQudHJpbSgpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgZWRpdG9yLnJlcGxhY2VTZWxlY3Rpb24ocmVuZGVyZWQpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdTVERjJcdTVDMDZcdTdGNTFcdTk4NzVcdTU2RkVcdTY1ODdcdTdDOThcdThEMzRcdTVFNzZcdTYyOTNcdTUzRDZcdThGRENcdTdBMEJcdTU2RkVcdTcyNDdcdTMwMDJcIiwgXCJQYXN0ZWQgd2ViIGNvbnRlbnQgYW5kIGNhcHR1cmVkIHJlbW90ZSBpbWFnZXMuXCIpKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBwYXN0ZSBIVE1MIGNvbnRlbnQgd2l0aCByZW1vdGUgaW1hZ2VzXCIsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgIHRoaXMuZGVzY3JpYmVFcnJvcihcbiAgICAgICAgICB0aGlzLnQoXCJcdTU5MDRcdTc0MDZcdTdGNTFcdTk4NzVcdTU2RkVcdTY1ODdcdTdDOThcdThEMzRcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gcHJvY2VzcyBwYXN0ZWQgd2ViIGNvbnRlbnRcIiksXG4gICAgICAgICAgZXJyb3IsXG4gICAgICAgICksXG4gICAgICAgIDgwMDAsXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY29udmVydEh0bWxDbGlwYm9hcmRUb1NlY3VyZU1hcmtkb3duKGh0bWw6IHN0cmluZywgbm90ZUZpbGU6IFRGaWxlKSB7XG4gICAgY29uc3QgcGFyc2VyID0gbmV3IERPTVBhcnNlcigpO1xuICAgIGNvbnN0IGRvY3VtZW50ID0gcGFyc2VyLnBhcnNlRnJvbVN0cmluZyhodG1sLCBcInRleHQvaHRtbFwiKTtcbiAgICBjb25zdCB1cGxvYWRDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgY29uc3QgcmVuZGVyZWRCbG9ja3M6IHN0cmluZ1tdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IG5vZGUgb2YgQXJyYXkuZnJvbShkb2N1bWVudC5ib2R5LmNoaWxkTm9kZXMpKSB7XG4gICAgICBjb25zdCBibG9jayA9IGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbE5vZGUobm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCAwKTtcbiAgICAgIGlmIChibG9jay50cmltKCkpIHtcbiAgICAgICAgcmVuZGVyZWRCbG9ja3MucHVzaChibG9jay50cmltKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZW5kZXJlZEJsb2Nrcy5qb2luKFwiXFxuXFxuXCIpICsgXCJcXG5cIjtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVuZGVyUGFzdGVkSHRtbE5vZGUoXG4gICAgbm9kZTogTm9kZSxcbiAgICBub3RlRmlsZTogVEZpbGUsXG4gICAgdXBsb2FkQ2FjaGU6IE1hcDxzdHJpbmcsIHN0cmluZz4sXG4gICAgbGlzdERlcHRoOiBudW1iZXIsXG4gICk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKSB7XG4gICAgICByZXR1cm4gdGhpcy5ub3JtYWxpemVDbGlwYm9hcmRUZXh0KG5vZGUudGV4dENvbnRlbnQgPz8gXCJcIik7XG4gICAgfVxuXG4gICAgaWYgKCEobm9kZSBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSkge1xuICAgICAgcmV0dXJuIFwiXCI7XG4gICAgfVxuXG4gICAgY29uc3QgdGFnID0gbm9kZS50YWdOYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKHRhZyA9PT0gXCJpbWdcIikge1xuICAgICAgY29uc3Qgc3JjID0gdGhpcy51bmVzY2FwZUh0bWwobm9kZS5nZXRBdHRyaWJ1dGUoXCJzcmNcIik/LnRyaW0oKSA/PyBcIlwiKTtcbiAgICAgIGlmICghdGhpcy5pc0h0dHBVcmwoc3JjKSkge1xuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgYWx0ID0gKG5vZGUuZ2V0QXR0cmlidXRlKFwiYWx0XCIpID8/IFwiXCIpLnRyaW0oKSB8fCB0aGlzLmdldERpc3BsYXlOYW1lRnJvbVVybChzcmMpO1xuICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRSZW1vdGVJbWFnZVVybChzcmMsIHVwbG9hZENhY2hlKTtcbiAgICAgIHJldHVybiB0aGlzLmltYWdlU3VwcG9ydC5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgYWx0KTtcbiAgICB9XG5cbiAgICBpZiAodGFnID09PSBcImJyXCIpIHtcbiAgICAgIHJldHVybiBcIlxcblwiO1xuICAgIH1cblxuICAgIGlmICh0YWcgPT09IFwidWxcIiB8fCB0YWcgPT09IFwib2xcIikge1xuICAgICAgY29uc3QgaXRlbXM6IHN0cmluZ1tdID0gW107XG4gICAgICBsZXQgaW5kZXggPSAxO1xuICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKG5vZGUuY2hpbGRyZW4pKSB7XG4gICAgICAgIGlmIChjaGlsZC50YWdOYW1lLnRvTG93ZXJDYXNlKCkgIT09IFwibGlcIikge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVuZGVyZWQgPSAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sTm9kZShjaGlsZCwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGggKyAxKSkudHJpbSgpO1xuICAgICAgICBpZiAoIXJlbmRlcmVkKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwcmVmaXggPSB0YWcgPT09IFwib2xcIiA/IGAke2luZGV4fS4gYCA6IFwiLSBcIjtcbiAgICAgICAgaXRlbXMucHVzaChgJHtcIiAgXCIucmVwZWF0KE1hdGgubWF4KDAsIGxpc3REZXB0aCkpfSR7cHJlZml4fSR7cmVuZGVyZWR9YCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBpdGVtcy5qb2luKFwiXFxuXCIpO1xuICAgIH1cblxuICAgIGlmICh0YWcgPT09IFwibGlcIikge1xuICAgICAgY29uc3QgcGFydHMgPSBhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCk7XG4gICAgICByZXR1cm4gcGFydHMuam9pbihcIlwiKS50cmltKCk7XG4gICAgfVxuXG4gICAgaWYgKC9eaFsxLTZdJC8udGVzdCh0YWcpKSB7XG4gICAgICBjb25zdCBsZXZlbCA9IE51bWJlci5wYXJzZUludCh0YWdbMV0sIDEwKTtcbiAgICAgIGNvbnN0IHRleHQgPSAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpLnRyaW0oKTtcbiAgICAgIHJldHVybiB0ZXh0ID8gYCR7XCIjXCIucmVwZWF0KGxldmVsKX0gJHt0ZXh0fWAgOiBcIlwiO1xuICAgIH1cblxuICAgIGlmICh0YWcgPT09IFwiYVwiKSB7XG4gICAgICBjb25zdCBocmVmID0gbm9kZS5nZXRBdHRyaWJ1dGUoXCJocmVmXCIpPy50cmltKCkgPz8gXCJcIjtcbiAgICAgIGNvbnN0IHRleHQgPSAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpLnRyaW0oKTtcbiAgICAgIGlmIChocmVmICYmIC9eaHR0cHM/OlxcL1xcLy9pLnRlc3QoaHJlZikgJiYgdGV4dCkge1xuICAgICAgICByZXR1cm4gYFske3RleHR9XSgke2hyZWZ9KWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGV4dDtcbiAgICB9XG5cbiAgICBjb25zdCBpbmxpbmVUYWdzID0gbmV3IFNldChbXCJzdHJvbmdcIiwgXCJiXCIsIFwiZW1cIiwgXCJpXCIsIFwic3BhblwiLCBcImNvZGVcIiwgXCJzbWFsbFwiLCBcInN1cFwiLCBcInN1YlwiXSk7XG4gICAgaWYgKGlubGluZVRhZ3MuaGFzKHRhZykpIHtcbiAgICAgIHJldHVybiAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IGJsb2NrVGFncyA9IG5ldyBTZXQoW1xuICAgICAgXCJwXCIsXG4gICAgICBcImRpdlwiLFxuICAgICAgXCJhcnRpY2xlXCIsXG4gICAgICBcInNlY3Rpb25cIixcbiAgICAgIFwiZmlndXJlXCIsXG4gICAgICBcImZpZ2NhcHRpb25cIixcbiAgICAgIFwiYmxvY2txdW90ZVwiLFxuICAgICAgXCJwcmVcIixcbiAgICAgIFwidGFibGVcIixcbiAgICAgIFwidGhlYWRcIixcbiAgICAgIFwidGJvZHlcIixcbiAgICAgIFwidHJcIixcbiAgICAgIFwidGRcIixcbiAgICAgIFwidGhcIixcbiAgICBdKTtcbiAgICBpZiAoYmxvY2tUYWdzLmhhcyh0YWcpKSB7XG4gICAgICBjb25zdCB0ZXh0ID0gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKSkuam9pbihcIlwiKS50cmltKCk7XG4gICAgICByZXR1cm4gdGV4dDtcbiAgICB9XG5cbiAgICByZXR1cm4gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKSkuam9pbihcIlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKFxuICAgIGVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuICAgIG5vdGVGaWxlOiBURmlsZSxcbiAgICB1cGxvYWRDYWNoZTogTWFwPHN0cmluZywgc3RyaW5nPixcbiAgICBsaXN0RGVwdGg6IG51bWJlcixcbiAgKSB7XG4gICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKGVsZW1lbnQuY2hpbGROb2RlcykpIHtcbiAgICAgIGNvbnN0IHJlbmRlcmVkID0gYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sTm9kZShjaGlsZCwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpO1xuICAgICAgaWYgKCFyZW5kZXJlZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDAgJiYgIXJlbmRlcmVkLnN0YXJ0c1dpdGgoXCJcXG5cIikgJiYgIXBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdLmVuZHNXaXRoKFwiXFxuXCIpKSB7XG4gICAgICAgIGNvbnN0IHByZXZpb3VzID0gcGFydHNbcGFydHMubGVuZ3RoIC0gMV07XG4gICAgICAgIGNvbnN0IG5lZWRzU3BhY2UgPSAvXFxTJC8udGVzdChwcmV2aW91cykgJiYgL15cXFMvLnRlc3QocmVuZGVyZWQpO1xuICAgICAgICBpZiAobmVlZHNTcGFjZSkge1xuICAgICAgICAgIHBhcnRzLnB1c2goXCIgXCIpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHBhcnRzLnB1c2gocmVuZGVyZWQpO1xuICAgIH1cblxuICAgIHJldHVybiBwYXJ0cztcbiAgfVxuXG4gIHByaXZhdGUgbm9ybWFsaXplQ2xpcGJvYXJkVGV4dCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1xccysvZywgXCIgXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRyYWN0SW1hZ2VGaWxlRnJvbURyb3AoZXZ0OiBEcmFnRXZlbnQpIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShldnQuZGF0YVRyYW5zZmVyPy5maWxlcyA/PyBbXSkuZmluZCgoZmlsZSkgPT4gZmlsZS50eXBlLnN0YXJ0c1dpdGgoXCJpbWFnZS9cIikpID8/IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGVucXVldWVFZGl0b3JJbWFnZVVwbG9hZChub3RlRmlsZTogVEZpbGUsIGVkaXRvcjogRWRpdG9yLCBpbWFnZUZpbGU6IEZpbGUsIGZpbGVOYW1lOiBzdHJpbmcpIHtcblxuICAgIGF3YWl0IHRoaXMudXBsb2FkUXVldWUuZW5xdWV1ZUVkaXRvckltYWdlVXBsb2FkKG5vdGVGaWxlLCBlZGl0b3IsIGltYWdlRmlsZSwgZmlsZU5hbWUpO1xuICB9XG5cbiAgYXN5bmMgc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQoc2hvd05vdGljZSA9IHRydWUpIHtcbiAgICBpZiAodGhpcy5zeW5jSW5Qcm9ncmVzcykge1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdTU0MENcdTZCNjVcdTZCNjNcdTU3MjhcdThGREJcdTg4NENcdTRFMkRcdTMwMDJcIiwgXCJBIHN5bmMgaXMgYWxyZWFkeSBpbiBwcm9ncmVzcy5cIiksIDQwMDApO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuc3luY0luUHJvZ3Jlc3MgPSB0cnVlO1xuICAgIHRyeSB7XG4gICAgICB0aGlzLmVuc3VyZUNvbmZpZ3VyZWQoKTtcbiAgICAgIGF3YWl0IHRoaXMud2FpdEZvclBlbmRpbmdWYXVsdE11dGF0aW9ucygpO1xuICAgICAgY29uc3QgdXBsb2Fkc1JlYWR5ID0gYXdhaXQgdGhpcy5wcmVwYXJlUGVuZGluZ1VwbG9hZHNGb3JTeW5jKHNob3dOb3RpY2UpO1xuICAgICAgaWYgKCF1cGxvYWRzUmVhZHkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgYXdhaXQgdGhpcy5yZWJ1aWxkUmVmZXJlbmNlSW5kZXgoKTtcblxuICAgICAgY29uc3QgcmVtb3RlSW52ZW50b3J5ID0gYXdhaXQgdGhpcy5saXN0UmVtb3RlVHJlZSh0aGlzLnNldHRpbmdzLnZhdWx0U3luY1JlbW90ZUZvbGRlcik7XG4gICAgICBjb25zdCBkZWxldGlvblRvbWJzdG9uZXMgPSBhd2FpdCB0aGlzLnJlYWREZWxldGlvblRvbWJzdG9uZXMoKTtcbiAgICAgIGNvbnN0IHJlbW90ZUZpbGVzID0gcmVtb3RlSW52ZW50b3J5LmZpbGVzO1xuICAgICAgY29uc3QgY291bnRzID0ge1xuICAgICAgICB1cGxvYWRlZDogMCwgcmVzdG9yZWRGcm9tUmVtb3RlOiAwLCBkb3dubG9hZGVkT3JVcGRhdGVkOiAwLCBza2lwcGVkOiAwLFxuICAgICAgICBkZWxldGVkUmVtb3RlRmlsZXM6IDAsIGRlbGV0ZWRMb2NhbEZpbGVzOiAwLCBkZWxldGVkTG9jYWxTdHViczogMCxcbiAgICAgICAgbWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzOiAwLCBwdXJnZWRNaXNzaW5nTGF6eU5vdGVzOiAwLFxuICAgICAgICBkZWxldGVkUmVtb3RlRGlyZWN0b3JpZXM6IDAsIGV2aWN0ZWROb3RlczogMCxcbiAgICAgIH07XG5cbiAgICAgIGF3YWl0IHRoaXMucmVjb25jaWxlT3JwaGFuZWRTeW5jRW50cmllcyhyZW1vdGVGaWxlcywgZGVsZXRpb25Ub21ic3RvbmVzLCBjb3VudHMpO1xuICAgICAgYXdhaXQgdGhpcy5yZWNvbmNpbGVSZW1vdGVPbmx5RmlsZXMocmVtb3RlRmlsZXMsIGRlbGV0aW9uVG9tYnN0b25lcywgY291bnRzKTtcbiAgICAgIGNvbnN0IGxvY2FsUmVtb3RlUGF0aHMgPSBhd2FpdCB0aGlzLnJlY29uY2lsZUxvY2FsRmlsZXMocmVtb3RlRmlsZXMsIGRlbGV0aW9uVG9tYnN0b25lcywgY291bnRzKTtcblxuICAgICAgY291bnRzLmRlbGV0ZWRSZW1vdGVEaXJlY3RvcmllcyA9IGF3YWl0IHRoaXMuZGVsZXRlRXh0cmFSZW1vdGVEaXJlY3RvcmllcyhcbiAgICAgICAgcmVtb3RlSW52ZW50b3J5LmRpcmVjdG9yaWVzLFxuICAgICAgICB0aGlzLmJ1aWxkRXhwZWN0ZWRSZW1vdGVEaXJlY3Rvcmllcyhsb2NhbFJlbW90ZVBhdGhzLCB0aGlzLnNldHRpbmdzLnZhdWx0U3luY1JlbW90ZUZvbGRlciksXG4gICAgICApO1xuICAgICAgYXdhaXQgdGhpcy5yZWNvbmNpbGVSZW1vdGVJbWFnZXMoKTtcbiAgICAgIGNvdW50cy5ldmljdGVkTm90ZXMgPSBhd2FpdCB0aGlzLmV2aWN0U3RhbGVTeW5jZWROb3RlcyhmYWxzZSk7XG5cbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gRGF0ZS5ub3coKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9IHRoaXMudChcbiAgICAgICAgYFx1NURGMlx1NTNDQ1x1NTQxMVx1NTQwQ1x1NkI2NVx1RkYxQVx1NEUwQVx1NEYyMCAke2NvdW50cy51cGxvYWRlZH0gXHU0RTJBXHU2NTg3XHU0RUY2XHVGRjBDXHU0RUNFXHU4RkRDXHU3QUVGXHU2MkM5XHU1M0Q2ICR7Y291bnRzLnJlc3RvcmVkRnJvbVJlbW90ZSArIGNvdW50cy5kb3dubG9hZGVkT3JVcGRhdGVkfSBcdTRFMkFcdTY1ODdcdTRFRjZcdUZGMENcdThERjNcdThGQzcgJHtjb3VudHMuc2tpcHBlZH0gXHU0RTJBXHU2NzJBXHU1M0Q4XHU1MzE2XHU2NTg3XHU0RUY2XHVGRjBDXHU1MjIwXHU5NjY0XHU4RkRDXHU3QUVGXHU1MTg1XHU1QkI5ICR7Y291bnRzLmRlbGV0ZWRSZW1vdGVGaWxlc30gXHU0RTJBXHUzMDAxXHU2NzJDXHU1NzMwXHU1MTg1XHU1QkI5ICR7Y291bnRzLmRlbGV0ZWRMb2NhbEZpbGVzfSBcdTRFMkEke2NvdW50cy5kZWxldGVkTG9jYWxTdHVicyA+IDAgPyBgXHVGRjA4XHU1MTc2XHU0RTJEXHU1OTMxXHU2NTQ4XHU1MzYwXHU0RjREXHU3QjE0XHU4QkIwICR7Y291bnRzLmRlbGV0ZWRMb2NhbFN0dWJzfSBcdTdCQzdcdUZGMDlgIDogXCJcIn1cdUZGMENcdTZFMDVcdTc0MDZcdThGRENcdTdBRUZcdTdBN0FcdTc2RUVcdTVGNTUgJHtjb3VudHMuZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzfSBcdTRFMkEke2NvdW50cy5ldmljdGVkTm90ZXMgPiAwID8gYFx1RkYwQ1x1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1NjVFN1x1N0IxNFx1OEJCMCAke2NvdW50cy5ldmljdGVkTm90ZXN9IFx1N0JDN2AgOiBcIlwifSR7Y291bnRzLm1pc3NpbmdSZW1vdGVCYWNrZWROb3RlcyA+IDAgPyBgXHVGRjBDXHU1RTc2XHU1M0QxXHU3M0IwICR7Y291bnRzLm1pc3NpbmdSZW1vdGVCYWNrZWROb3Rlc30gXHU3QkM3XHU2MzA5XHU5NzAwXHU3QjE0XHU4QkIwXHU3RjNBXHU1QzExXHU4RkRDXHU3QUVGXHU2QjYzXHU2NTg3YCA6IFwiXCJ9JHtjb3VudHMucHVyZ2VkTWlzc2luZ0xhenlOb3RlcyA+IDAgPyBgXHVGRjBDXHU3ODZFXHU4QkE0XHU2RTA1XHU3NDA2XHU1OTMxXHU2NTQ4XHU1MzYwXHU0RjREXHU3QjE0XHU4QkIwICR7Y291bnRzLnB1cmdlZE1pc3NpbmdMYXp5Tm90ZXN9IFx1N0JDN2AgOiBcIlwifVx1MzAwMmAsXG4gICAgICAgIGBCaWRpcmVjdGlvbmFsIHN5bmMgdXBsb2FkZWQgJHtjb3VudHMudXBsb2FkZWR9IGZpbGUocyksIHB1bGxlZCAke2NvdW50cy5yZXN0b3JlZEZyb21SZW1vdGUgKyBjb3VudHMuZG93bmxvYWRlZE9yVXBkYXRlZH0gZmlsZShzKSBmcm9tIHJlbW90ZSwgc2tpcHBlZCAke2NvdW50cy5za2lwcGVkfSB1bmNoYW5nZWQgZmlsZShzKSwgZGVsZXRlZCAke2NvdW50cy5kZWxldGVkUmVtb3RlRmlsZXN9IHJlbW90ZSBjb250ZW50IGZpbGUocykgYW5kICR7Y291bnRzLmRlbGV0ZWRMb2NhbEZpbGVzfSBsb2NhbCBmaWxlKHMpJHtjb3VudHMuZGVsZXRlZExvY2FsU3R1YnMgPiAwID8gYCAoaW5jbHVkaW5nICR7Y291bnRzLmRlbGV0ZWRMb2NhbFN0dWJzfSBzdGFsZSBzdHViIG5vdGUocykpYCA6IFwiXCJ9LCByZW1vdmVkICR7Y291bnRzLmRlbGV0ZWRSZW1vdGVEaXJlY3Rvcmllc30gcmVtb3RlIGRpcmVjdG9yJHtjb3VudHMuZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzID09PSAxID8gXCJ5XCIgOiBcImllc1wifSR7Y291bnRzLmV2aWN0ZWROb3RlcyA+IDAgPyBgLCBhbmQgZXZpY3RlZCAke2NvdW50cy5ldmljdGVkTm90ZXN9IHN0YWxlIGxvY2FsIG5vdGUocylgIDogXCJcIn0ke2NvdW50cy5taXNzaW5nUmVtb3RlQmFja2VkTm90ZXMgPiAwID8gYCwgd2hpbGUgZGV0ZWN0aW5nICR7Y291bnRzLm1pc3NpbmdSZW1vdGVCYWNrZWROb3Rlc30gbGF6eSBub3RlKHMpIG1pc3NpbmcgdGhlaXIgcmVtb3RlIGNvbnRlbnRgIDogXCJcIn0ke2NvdW50cy5wdXJnZWRNaXNzaW5nTGF6eU5vdGVzID4gMCA/IGAsIGFuZCBwdXJnZWQgJHtjb3VudHMucHVyZ2VkTWlzc2luZ0xhenlOb3Rlc30gY29uZmlybWVkIGJyb2tlbiBsYXp5IHBsYWNlaG9sZGVyKHMpYCA6IFwiXCJ9LmAsXG4gICAgICApO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzLCA4MDAwKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIlZhdWx0IGNvbnRlbnQgc3luYyBmYWlsZWRcIiwgZXJyb3IpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1NTE4NVx1NUJCOVx1NTQwQ1x1NkI2NVx1NTkzMVx1OEQyNVwiLCBcIkNvbnRlbnQgc3luYyBmYWlsZWRcIiksIGVycm9yKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cywgODAwMCk7XG4gICAgICB9XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMuc3luY0luUHJvZ3Jlc3MgPSBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlY29uY2lsZU9ycGhhbmVkU3luY0VudHJpZXMoXG4gICAgcmVtb3RlRmlsZXM6IE1hcDxzdHJpbmcsIFJlbW90ZUZpbGVTdGF0ZT4sXG4gICAgZGVsZXRpb25Ub21ic3RvbmVzOiBNYXA8c3RyaW5nLCBEZWxldGlvblRvbWJzdG9uZT4sXG4gICAgY291bnRzOiB7IHVwbG9hZGVkOiBudW1iZXI7IHJlc3RvcmVkRnJvbVJlbW90ZTogbnVtYmVyOyBkb3dubG9hZGVkT3JVcGRhdGVkOiBudW1iZXI7IHNraXBwZWQ6IG51bWJlcjsgZGVsZXRlZFJlbW90ZUZpbGVzOiBudW1iZXI7IGRlbGV0ZWRMb2NhbEZpbGVzOiBudW1iZXI7IGRlbGV0ZWRMb2NhbFN0dWJzOiBudW1iZXI7IG1pc3NpbmdSZW1vdGVCYWNrZWROb3RlczogbnVtYmVyOyBwdXJnZWRNaXNzaW5nTGF6eU5vdGVzOiBudW1iZXIgfSxcbiAgKSB7XG4gICAgY29uc3QgZmlsZXMgPSB0aGlzLnN5bmNTdXBwb3J0LmNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpO1xuICAgIGNvbnN0IGN1cnJlbnRQYXRocyA9IG5ldyBTZXQoZmlsZXMubWFwKChmaWxlKSA9PiBmaWxlLnBhdGgpKTtcbiAgICBmb3IgKGNvbnN0IHBhdGggb2YgWy4uLnRoaXMuc3luY0luZGV4LmtleXMoKV0pIHtcbiAgICAgIGlmIChjdXJyZW50UGF0aHMuaGFzKHBhdGgpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBwcmV2aW91cyA9IHRoaXMuc3luY0luZGV4LmdldChwYXRoKTtcbiAgICAgIGlmICghcHJldmlvdXMpIHtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKHBhdGgpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVtb3RlID0gcmVtb3RlRmlsZXMuZ2V0KHByZXZpb3VzLnJlbW90ZVBhdGgpO1xuICAgICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKHBhdGgpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldChwYXRoKTtcbiAgICAgIGlmICh0b21ic3RvbmUgJiYgdGhpcy5zeW5jU3VwcG9ydC5pc1RvbWJzdG9uZUF1dGhvcml0YXRpdmUodG9tYnN0b25lLCByZW1vdGUpKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlQ29udGVudEZpbGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICByZW1vdGVGaWxlcy5kZWxldGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUocGF0aCk7XG4gICAgICAgIGNvdW50cy5kZWxldGVkUmVtb3RlRmlsZXMgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICh0b21ic3RvbmUpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShwYXRoKTtcbiAgICAgICAgZGVsZXRpb25Ub21ic3RvbmVzLmRlbGV0ZShwYXRoKTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KHBhdGgsIHJlbW90ZSk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5zZXQocGF0aCwge1xuICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICByZW1vdGVQYXRoOiByZW1vdGUucmVtb3RlUGF0aCxcbiAgICAgIH0pO1xuICAgICAgY291bnRzLnJlc3RvcmVkRnJvbVJlbW90ZSArPSAxO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVjb25jaWxlUmVtb3RlT25seUZpbGVzKFxuICAgIHJlbW90ZUZpbGVzOiBNYXA8c3RyaW5nLCBSZW1vdGVGaWxlU3RhdGU+LFxuICAgIGRlbGV0aW9uVG9tYnN0b25lczogTWFwPHN0cmluZywgRGVsZXRpb25Ub21ic3RvbmU+LFxuICAgIGNvdW50czogeyB1cGxvYWRlZDogbnVtYmVyOyByZXN0b3JlZEZyb21SZW1vdGU6IG51bWJlcjsgZG93bmxvYWRlZE9yVXBkYXRlZDogbnVtYmVyOyBza2lwcGVkOiBudW1iZXI7IGRlbGV0ZWRSZW1vdGVGaWxlczogbnVtYmVyOyBkZWxldGVkTG9jYWxGaWxlczogbnVtYmVyOyBkZWxldGVkTG9jYWxTdHViczogbnVtYmVyOyBtaXNzaW5nUmVtb3RlQmFja2VkTm90ZXM6IG51bWJlcjsgcHVyZ2VkTWlzc2luZ0xhenlOb3RlczogbnVtYmVyIH0sXG4gICkge1xuICAgIGNvbnN0IGZpbGVzID0gdGhpcy5zeW5jU3VwcG9ydC5jb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKTtcbiAgICBjb25zdCBjdXJyZW50UGF0aHMgPSBuZXcgU2V0KGZpbGVzLm1hcCgoZmlsZSkgPT4gZmlsZS5wYXRoKSk7XG4gICAgZm9yIChjb25zdCByZW1vdGUgb2YgWy4uLnJlbW90ZUZpbGVzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLnJlbW90ZVBhdGgubG9jYWxlQ29tcGFyZShiLnJlbW90ZVBhdGgpKSkge1xuICAgICAgY29uc3QgdmF1bHRQYXRoID0gdGhpcy5zeW5jU3VwcG9ydC5yZW1vdGVQYXRoVG9WYXVsdFBhdGgocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgaWYgKCF2YXVsdFBhdGggfHwgY3VycmVudFBhdGhzLmhhcyh2YXVsdFBhdGgpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB0b21ic3RvbmUgPSBkZWxldGlvblRvbWJzdG9uZXMuZ2V0KHZhdWx0UGF0aCk7XG4gICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgIGlmICh0aGlzLnN5bmNTdXBwb3J0LmlzVG9tYnN0b25lQXV0aG9yaXRhdGl2ZSh0b21ic3RvbmUsIHJlbW90ZSkpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICByZW1vdGVGaWxlcy5kZWxldGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICAgIGNvdW50cy5kZWxldGVkUmVtb3RlRmlsZXMgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUodmF1bHRQYXRoKTtcbiAgICAgICAgZGVsZXRpb25Ub21ic3RvbmVzLmRlbGV0ZSh2YXVsdFBhdGgpO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQodmF1bHRQYXRoLCByZW1vdGUpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KHZhdWx0UGF0aCwge1xuICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICByZW1vdGVQYXRoOiByZW1vdGUucmVtb3RlUGF0aCxcbiAgICAgIH0pO1xuICAgICAgY291bnRzLnJlc3RvcmVkRnJvbVJlbW90ZSArPSAxO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVjb25jaWxlTG9jYWxGaWxlcyhcbiAgICByZW1vdGVGaWxlczogTWFwPHN0cmluZywgUmVtb3RlRmlsZVN0YXRlPixcbiAgICBkZWxldGlvblRvbWJzdG9uZXM6IE1hcDxzdHJpbmcsIERlbGV0aW9uVG9tYnN0b25lPixcbiAgICBjb3VudHM6IHsgdXBsb2FkZWQ6IG51bWJlcjsgcmVzdG9yZWRGcm9tUmVtb3RlOiBudW1iZXI7IGRvd25sb2FkZWRPclVwZGF0ZWQ6IG51bWJlcjsgc2tpcHBlZDogbnVtYmVyOyBkZWxldGVkUmVtb3RlRmlsZXM6IG51bWJlcjsgZGVsZXRlZExvY2FsRmlsZXM6IG51bWJlcjsgZGVsZXRlZExvY2FsU3R1YnM6IG51bWJlcjsgbWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzOiBudW1iZXI7IHB1cmdlZE1pc3NpbmdMYXp5Tm90ZXM6IG51bWJlciB9LFxuICApOiBQcm9taXNlPFNldDxzdHJpbmc+PiB7XG4gICAgY29uc3QgZmlsZXMgPSB0aGlzLnN5bmNTdXBwb3J0LmNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpO1xuICAgIGNvbnN0IGxvY2FsUmVtb3RlUGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgICBsb2NhbFJlbW90ZVBhdGhzLmFkZChyZW1vdGVQYXRoKTtcbiAgICAgIGNvbnN0IHJlbW90ZSA9IHJlbW90ZUZpbGVzLmdldChyZW1vdGVQYXRoKTtcbiAgICAgIGNvbnN0IHJlbW90ZVNpZ25hdHVyZSA9IHJlbW90ZT8uc2lnbmF0dXJlID8/IFwiXCI7XG4gICAgICBjb25zdCBwcmV2aW91cyA9IHRoaXMuc3luY0luZGV4LmdldChmaWxlLnBhdGgpO1xuICAgICAgY29uc3QgbWFya2Rvd25Db250ZW50ID0gZmlsZS5leHRlbnNpb24gPT09IFwibWRcIiA/IGF3YWl0IHRoaXMucmVhZE1hcmtkb3duQ29udGVudFByZWZlckVkaXRvcihmaWxlKSA6IG51bGw7XG4gICAgICBjb25zdCBsb2NhbFNpZ25hdHVyZSA9IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUoZmlsZSwgbWFya2Rvd25Db250ZW50ID8/IHVuZGVmaW5lZCk7XG5cbiAgICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICAgIGNvbnN0IHN0dWIgPSB0aGlzLnBhcnNlTm90ZVN0dWIobWFya2Rvd25Db250ZW50ID8/IFwiXCIpO1xuICAgICAgICBpZiAoc3R1Yikge1xuICAgICAgICAgIGNvbnN0IHN0dWJSZW1vdGUgPSByZW1vdGVGaWxlcy5nZXQoc3R1Yi5yZW1vdGVQYXRoKTtcbiAgICAgICAgICBjb25zdCB0b21ic3RvbmUgPSBkZWxldGlvblRvbWJzdG9uZXMuZ2V0KGZpbGUucGF0aCk7XG4gICAgICAgICAgY29uc3QgcmVzb2x1dGlvbiA9IGF3YWl0IHRoaXMucmVzb2x2ZUxhenlOb3RlU3R1YihmaWxlLCBzdHViLCBzdHViUmVtb3RlLCB0b21ic3RvbmUpO1xuICAgICAgICAgIGlmIChyZXNvbHV0aW9uLmFjdGlvbiA9PT0gXCJkZWxldGVkXCIpIHtcbiAgICAgICAgICAgIGNvdW50cy5kZWxldGVkTG9jYWxGaWxlcyArPSAxO1xuICAgICAgICAgICAgY291bnRzLmRlbGV0ZWRMb2NhbFN0dWJzICs9IDE7XG4gICAgICAgICAgICBpZiAocmVzb2x1dGlvbi5wdXJnZWRNaXNzaW5nKSB7XG4gICAgICAgICAgICAgIGNvdW50cy5wdXJnZWRNaXNzaW5nTGF6eU5vdGVzICs9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHJlc29sdXRpb24uYWN0aW9uID09PSBcIm1pc3NpbmdcIikge1xuICAgICAgICAgICAgY291bnRzLm1pc3NpbmdSZW1vdGVCYWNrZWROb3RlcyArPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogc3R1YlJlbW90ZT8uc2lnbmF0dXJlID8/IHByZXZpb3VzPy5yZW1vdGVTaWduYXR1cmUgPz8gXCJcIixcbiAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCB0b21ic3RvbmUgPSBkZWxldGlvblRvbWJzdG9uZXMuZ2V0KGZpbGUucGF0aCk7XG4gICAgICBjb25zdCB1bmNoYW5nZWRTaW5jZUxhc3RTeW5jID0gcHJldmlvdXMgPyBwcmV2aW91cy5sb2NhbFNpZ25hdHVyZSA9PT0gbG9jYWxTaWduYXR1cmUgOiBmYWxzZTtcbiAgICAgIGlmICh0b21ic3RvbmUpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHVuY2hhbmdlZFNpbmNlTGFzdFN5bmMgJiZcbiAgICAgICAgICB0aGlzLnN5bmNTdXBwb3J0LnNob3VsZERlbGV0ZUxvY2FsRnJvbVRvbWJzdG9uZShmaWxlLCB0b21ic3RvbmUpICYmXG4gICAgICAgICAgdGhpcy5zeW5jU3VwcG9ydC5pc1RvbWJzdG9uZUF1dGhvcml0YXRpdmUodG9tYnN0b25lLCByZW1vdGUpXG4gICAgICAgICkge1xuICAgICAgICAgIGF3YWl0IHRoaXMucmVtb3ZlTG9jYWxWYXVsdEZpbGUoZmlsZSk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICAgICAgY291bnRzLmRlbGV0ZWRMb2NhbEZpbGVzICs9IDE7XG4gICAgICAgICAgaWYgKHJlbW90ZSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgICAgICByZW1vdGVGaWxlcy5kZWxldGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICAgICAgY291bnRzLmRlbGV0ZWRSZW1vdGVGaWxlcyArPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgZGVsZXRpb25Ub21ic3RvbmVzLmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoLCBtYXJrZG93bkNvbnRlbnQgPz8gdW5kZWZpbmVkKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICByZW1vdGVGaWxlcy5zZXQocmVtb3RlUGF0aCwgdXBsb2FkZWRSZW1vdGUpO1xuICAgICAgICBjb3VudHMudXBsb2FkZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghcHJldmlvdXMpIHtcbiAgICAgICAgaWYgKGxvY2FsU2lnbmF0dXJlID09PSByZW1vdGVTaWduYXR1cmUpIHtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7IGxvY2FsU2lnbmF0dXJlLCByZW1vdGVTaWduYXR1cmUsIHJlbW90ZVBhdGggfSk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgICAgIGNvdW50cy5za2lwcGVkICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5zeW5jU3VwcG9ydC5zaG91bGREb3dubG9hZFJlbW90ZVZlcnNpb24oZmlsZS5zdGF0Lm10aW1lLCByZW1vdGUubGFzdE1vZGlmaWVkKSkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuZG93bmxvYWRSZW1vdGVGaWxlVG9WYXVsdChmaWxlLnBhdGgsIHJlbW90ZSwgZmlsZSk7XG4gICAgICAgICAgY29uc3QgcmVmcmVzaGVkID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVmcmVzaGVkID8gYXdhaXQgdGhpcy5idWlsZEN1cnJlbnRMb2NhbFNpZ25hdHVyZShyZWZyZXNoZWQpIDogcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBjb3VudHMuZG93bmxvYWRlZE9yVXBkYXRlZCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCwgbWFya2Rvd25Db250ZW50ID8/IHVuZGVmaW5lZCk7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICB9KTtcbiAgICAgICAgcmVtb3RlRmlsZXMuc2V0KHJlbW90ZVBhdGgsIHVwbG9hZGVkUmVtb3RlKTtcbiAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgICBjb3VudHMudXBsb2FkZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGxvY2FsQ2hhbmdlZCA9IHByZXZpb3VzLmxvY2FsU2lnbmF0dXJlICE9PSBsb2NhbFNpZ25hdHVyZSB8fCBwcmV2aW91cy5yZW1vdGVQYXRoICE9PSByZW1vdGVQYXRoO1xuICAgICAgY29uc3QgcmVtb3RlQ2hhbmdlZCA9IHByZXZpb3VzLnJlbW90ZVNpZ25hdHVyZSAhPT0gcmVtb3RlU2lnbmF0dXJlIHx8IHByZXZpb3VzLnJlbW90ZVBhdGggIT09IHJlbW90ZVBhdGg7XG4gICAgICBpZiAoIWxvY2FsQ2hhbmdlZCAmJiAhcmVtb3RlQ2hhbmdlZCkge1xuICAgICAgICBjb3VudHMuc2tpcHBlZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFsb2NhbENoYW5nZWQgJiYgcmVtb3RlQ2hhbmdlZCkge1xuICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgICAgICBjb25zdCByZWZyZXNoZWQgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChmaWxlLnBhdGgpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUocmVmcmVzaGVkKSA6IHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvdW50cy5kb3dubG9hZGVkT3JVcGRhdGVkICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAobG9jYWxDaGFuZ2VkICYmICFyZW1vdGVDaGFuZ2VkKSB7XG4gICAgICAgIGNvbnN0IHVwbG9hZGVkUmVtb3RlID0gYXdhaXQgdGhpcy51cGxvYWRDb250ZW50RmlsZVRvUmVtb3RlKGZpbGUsIHJlbW90ZVBhdGgsIG1hcmtkb3duQ29udGVudCA/PyB1bmRlZmluZWQpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiB1cGxvYWRlZFJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlbW90ZUZpbGVzLnNldChyZW1vdGVQYXRoLCB1cGxvYWRlZFJlbW90ZSk7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgY291bnRzLnVwbG9hZGVkICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5zeW5jU3VwcG9ydC5zaG91bGREb3dubG9hZFJlbW90ZVZlcnNpb24oZmlsZS5zdGF0Lm10aW1lLCByZW1vdGUubGFzdE1vZGlmaWVkKSkge1xuICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgICAgICBjb25zdCByZWZyZXNoZWQgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChmaWxlLnBhdGgpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUocmVmcmVzaGVkKSA6IHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvdW50cy5kb3dubG9hZGVkT3JVcGRhdGVkICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoLCBtYXJrZG93bkNvbnRlbnQgPz8gdW5kZWZpbmVkKTtcbiAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgfSk7XG4gICAgICByZW1vdGVGaWxlcy5zZXQocmVtb3RlUGF0aCwgdXBsb2FkZWRSZW1vdGUpO1xuICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgY291bnRzLnVwbG9hZGVkICs9IDE7XG4gICAgfVxuXG4gICAgcmV0dXJuIGxvY2FsUmVtb3RlUGF0aHM7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSA0MDQgJiYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYERFTEVURSBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZGVsZXRlIHJlbW90ZSBzeW5jZWQgY29udGVudFwiLCByZW1vdGVQYXRoLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHdyaXRlRGVsZXRpb25Ub21ic3RvbmUodmF1bHRQYXRoOiBzdHJpbmcsIHJlbW90ZVNpZ25hdHVyZT86IHN0cmluZykge1xuICAgIGNvbnN0IHBheWxvYWQ6IERlbGV0aW9uVG9tYnN0b25lID0ge1xuICAgICAgcGF0aDogdmF1bHRQYXRoLFxuICAgICAgZGVsZXRlZEF0OiBEYXRlLm5vdygpLFxuICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgIH07XG4gICAgYXdhaXQgdGhpcy51cGxvYWRCaW5hcnkoXG4gICAgICB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkRGVsZXRpb25SZW1vdGVQYXRoKHZhdWx0UGF0aCksXG4gICAgICB0aGlzLmVuY29kZVV0ZjgoSlNPTi5zdHJpbmdpZnkocGF5bG9hZCkpLFxuICAgICAgXCJhcHBsaWNhdGlvbi9qc29uOyBjaGFyc2V0PXV0Zi04XCIsXG4gICAgKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUodmF1bHRQYXRoOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZSh0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkRGVsZXRpb25SZW1vdGVQYXRoKHZhdWx0UGF0aCkpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gVG9tYnN0b25lIGNsZWFudXAgc2hvdWxkIG5vdCBicmVhayB0aGUgbWFpbiBzeW5jIGZsb3cuXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWFkRGVsZXRpb25Ub21ic3RvbmUodmF1bHRQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwodGhpcy5zeW5jU3VwcG9ydC5idWlsZERlbGV0aW9uUmVtb3RlUGF0aCh2YXVsdFBhdGgpKSxcbiAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MDQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICB0aGlzLmFzc2VydFJlc3BvbnNlU3VjY2VzcyhyZXNwb25zZSwgXCJHRVQgdG9tYnN0b25lXCIpO1xuXG4gICAgcmV0dXJuIHRoaXMuc3luY1N1cHBvcnQucGFyc2VEZWxldGlvblRvbWJzdG9uZVBheWxvYWQodGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlYWREZWxldGlvblRvbWJzdG9uZXMoKSB7XG4gICAgY29uc3QgdG9tYnN0b25lcyA9IG5ldyBNYXA8c3RyaW5nLCBEZWxldGlvblRvbWJzdG9uZT4oKTtcbiAgICBjb25zdCBpbnZlbnRvcnkgPSBhd2FpdCB0aGlzLmxpc3RSZW1vdGVUcmVlKHRoaXMuc3luY1N1cHBvcnQuYnVpbGREZWxldGlvbkZvbGRlcigpKTtcbiAgICBmb3IgKGNvbnN0IHJlbW90ZSBvZiBpbnZlbnRvcnkuZmlsZXMudmFsdWVzKCkpIHtcbiAgICAgIGNvbnN0IHZhdWx0UGF0aCA9IHRoaXMuc3luY1N1cHBvcnQucmVtb3RlRGVsZXRpb25QYXRoVG9WYXVsdFBhdGgocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgaWYgKCF2YXVsdFBhdGgpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZS5yZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB0b21ic3RvbmUgPSB0aGlzLnN5bmNTdXBwb3J0LnBhcnNlRGVsZXRpb25Ub21ic3RvbmVQYXlsb2FkKHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlcikpO1xuICAgICAgaWYgKHRvbWJzdG9uZSkge1xuICAgICAgICB0b21ic3RvbmVzLnNldCh2YXVsdFBhdGgsIHRvbWJzdG9uZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRvbWJzdG9uZXM7XG4gIH1cblxuICBwcml2YXRlIGdldFZhdWx0RmlsZUJ5UGF0aChwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHBhdGgpO1xuICAgIHJldHVybiBmaWxlIGluc3RhbmNlb2YgVEZpbGUgPyBmaWxlIDogbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVtb3ZlTG9jYWxWYXVsdEZpbGUoZmlsZTogVEZpbGUpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuZGVsZXRlKGZpbGUsIHRydWUpO1xuICAgIH0gY2F0Y2ggKGRlbGV0ZUVycm9yKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC50cmFzaChmaWxlLCB0cnVlKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICB0aHJvdyBkZWxldGVFcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGVuc3VyZUxvY2FsUGFyZW50Rm9sZGVycyhwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGF0aChwYXRoKTtcbiAgICBjb25zdCBzZWdtZW50cyA9IG5vcm1hbGl6ZWQuc3BsaXQoXCIvXCIpLmZpbHRlcigodmFsdWUpID0+IHZhbHVlLmxlbmd0aCA+IDApO1xuICAgIGlmIChzZWdtZW50cy5sZW5ndGggPD0gMSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBjdXJyZW50ID0gXCJcIjtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgc2VnbWVudHMubGVuZ3RoIC0gMTsgaW5kZXggKz0gMSkge1xuICAgICAgY3VycmVudCA9IGN1cnJlbnQgPyBgJHtjdXJyZW50fS8ke3NlZ21lbnRzW2luZGV4XX1gIDogc2VnbWVudHNbaW5kZXhdO1xuICAgICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoY3VycmVudCk7XG4gICAgICBpZiAoIWV4aXN0aW5nKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZUZvbGRlcihjdXJyZW50KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQodmF1bHRQYXRoOiBzdHJpbmcsIHJlbW90ZTogUmVtb3RlRmlsZVN0YXRlLCBleGlzdGluZ0ZpbGU/OiBURmlsZSkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGUucmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHRoaXMuYXNzZXJ0UmVzcG9uc2VTdWNjZXNzKHJlc3BvbnNlLCBcIkdFVFwiKTtcblxuICAgIGF3YWl0IHRoaXMuZW5zdXJlTG9jYWxQYXJlbnRGb2xkZXJzKHZhdWx0UGF0aCk7XG4gICAgY29uc3QgY3VycmVudCA9IGV4aXN0aW5nRmlsZSA/PyB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aCh2YXVsdFBhdGgpO1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICBtdGltZTogcmVtb3RlLmxhc3RNb2RpZmllZCA+IDAgPyByZW1vdGUubGFzdE1vZGlmaWVkIDogRGF0ZS5ub3coKSxcbiAgICB9O1xuICAgIGlmICghY3VycmVudCkge1xuICAgICAgaWYgKHZhdWx0UGF0aC50b0xvd2VyQ2FzZSgpLmVuZHNXaXRoKFwiLm1kXCIpKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZSh2YXVsdFBhdGgsIHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlciksIG9wdGlvbnMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlQmluYXJ5KHZhdWx0UGF0aCwgcmVzcG9uc2UuYXJyYXlCdWZmZXIsIG9wdGlvbnMpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChjdXJyZW50LmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoY3VycmVudCwgdGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKSwgb3B0aW9ucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeUJpbmFyeShjdXJyZW50LCByZXNwb25zZS5hcnJheUJ1ZmZlciwgb3B0aW9ucyk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB2ZXJpZnlSZW1vdGVCaW5hcnlSb3VuZFRyaXAocmVtb3RlUGF0aDogc3RyaW5nLCBleHBlY3RlZDogQXJyYXlCdWZmZXIpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuYXJyYXlCdWZmZXJzRXF1YWwoZXhwZWN0ZWQsIHJlc3BvbnNlLmFycmF5QnVmZmVyKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc3RhdFJlbW90ZUZpbGUocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIlBST1BGSU5EXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIERlcHRoOiBcIjBcIixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MDQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICB0aGlzLmFzc2VydFJlc3BvbnNlU3VjY2VzcyhyZXNwb25zZSwgYFBST1BGSU5EIGZvciAke3JlbW90ZVBhdGh9YCk7XG5cbiAgICBjb25zdCB4bWxUZXh0ID0gdGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKTtcbiAgICBjb25zdCBlbnRyaWVzID0gdGhpcy5wYXJzZVByb3BmaW5kRGlyZWN0b3J5TGlzdGluZyh4bWxUZXh0LCByZW1vdGVQYXRoLCB0cnVlKTtcbiAgICByZXR1cm4gZW50cmllcy5maW5kKChlbnRyeSkgPT4gIWVudHJ5LmlzQ29sbGVjdGlvbik/LmZpbGUgPz8gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlOiBURmlsZSwgcmVtb3RlUGF0aDogc3RyaW5nLCBtYXJrZG93bkNvbnRlbnQ/OiBzdHJpbmcpIHtcbiAgICBsZXQgYmluYXJ5OiBBcnJheUJ1ZmZlcjtcblxuICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICBjb25zdCBjb250ZW50ID0gbWFya2Rvd25Db250ZW50ID8/IChhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSkpO1xuICAgICAgaWYgKHRoaXMucGFyc2VOb3RlU3R1Yihjb250ZW50KSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgXCJcdTYyRDJcdTdFRERcdTYyOEFcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTUzNjBcdTRGNERcdTdCMTRcdThCQjBcdTRFMEFcdTRGMjBcdTRFM0FcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTMwMDJcIixcbiAgICAgICAgICAgIFwiUmVmdXNpbmcgdG8gdXBsb2FkIGEgbGF6eS1ub3RlIHBsYWNlaG9sZGVyIGFzIHJlbW90ZSBub3RlIGNvbnRlbnQuXCIsXG4gICAgICAgICAgKSxcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgYmluYXJ5ID0gdGhpcy5lbmNvZGVVdGY4KGNvbnRlbnQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBiaW5hcnkgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KHJlbW90ZVBhdGgsIGJpbmFyeSwgdGhpcy5nZXRNaW1lVHlwZShmaWxlLmV4dGVuc2lvbikpO1xuICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuc3RhdFJlbW90ZUZpbGUocmVtb3RlUGF0aCk7XG4gICAgaWYgKHJlbW90ZSkge1xuICAgICAgcmV0dXJuIHJlbW90ZTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIGxhc3RNb2RpZmllZDogZmlsZS5zdGF0Lm10aW1lLFxuICAgICAgc2l6ZTogZmlsZS5zdGF0LnNpemUsXG4gICAgICBzaWduYXR1cmU6IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRTeW5jU2lnbmF0dXJlKGZpbGUpLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZVJlbW90ZVN5bmNlZEVudHJ5KHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLnN5bmNJbmRleC5nZXQodmF1bHRQYXRoKTtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gZXhpc3Rpbmc/LnJlbW90ZVBhdGggPz8gdGhpcy5zeW5jU3VwcG9ydC5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgodmF1bHRQYXRoKTtcbiAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZVBhdGgpO1xuICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZSh2YXVsdFBhdGgpO1xuICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUZpbGVPcGVuKGZpbGU6IFRGaWxlIHwgbnVsbCkge1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkgfHwgZmlsZS5leHRlbnNpb24gIT09IFwibWRcIikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMuc2V0KGZpbGUucGF0aCwgRGF0ZS5ub3coKSk7XG4gICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcblxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IHN0dWIgPSB0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCk7XG4gICAgaWYgKCFzdHViKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuc3RhdFJlbW90ZUZpbGUoc3R1Yi5yZW1vdGVQYXRoKTtcbiAgICAgIGNvbnN0IHRvbWJzdG9uZSA9ICFyZW1vdGUgPyBhd2FpdCB0aGlzLnJlYWREZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpIDogdW5kZWZpbmVkO1xuICAgICAgY29uc3QgcmVzb2x1dGlvbiA9IGF3YWl0IHRoaXMucmVzb2x2ZUxhenlOb3RlU3R1YihmaWxlLCBzdHViLCByZW1vdGUsIHRvbWJzdG9uZSk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuXG4gICAgICBpZiAocmVzb2x1dGlvbi5hY3Rpb24gPT09IFwiZGVsZXRlZFwiKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgcmVzb2x1dGlvbi5wdXJnZWRNaXNzaW5nXG4gICAgICAgICAgICAgID8gYFx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1OEZERVx1N0VFRFx1N0YzQVx1NTkzMVx1RkYwQ1x1NURGMlx1NzlGQlx1OTY2NFx1NjcyQ1x1NTczMFx1NTkzMVx1NjU0OFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gXG4gICAgICAgICAgICAgIDogYFx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1NEUwRFx1NUI1OFx1NTcyOFx1RkYwQ1x1NURGMlx1NzlGQlx1OTY2NFx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgICAgICAgcmVzb2x1dGlvbi5wdXJnZWRNaXNzaW5nXG4gICAgICAgICAgICAgID8gYFJlbW90ZSBub3RlIHdhcyBtaXNzaW5nIHJlcGVhdGVkbHksIHJlbW92ZWQgbG9jYWwgYnJva2VuIHBsYWNlaG9sZGVyOiAke2ZpbGUuYmFzZW5hbWV9YFxuICAgICAgICAgICAgICA6IGBSZW1vdGUgbm90ZSBtaXNzaW5nLCByZW1vdmVkIGxvY2FsIHBsYWNlaG9sZGVyOiAke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICAgICApLFxuICAgICAgICAgIHJlc29sdXRpb24ucHVyZ2VkTWlzc2luZyA/IDgwMDAgOiA2MDAwLFxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXNvbHV0aW9uLmFjdGlvbiA9PT0gXCJtaXNzaW5nXCIpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTRFMERcdTVCNThcdTU3MjhcdUZGMENcdTVGNTNcdTUyNERcdTUxNDhcdTRGRERcdTc1NTlcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTdCMTRcdThCQjBcdTRFRTVcdTk2MzJcdTRFMzRcdTY1RjZcdTVGMDJcdTVFMzhcdUZGMUJcdTgyRTVcdTUxOERcdTZCMjFcdTc4NkVcdThCQTRcdTdGM0FcdTU5MzFcdUZGMENcdTVDMDZcdTgxRUFcdTUyQThcdTZFMDVcdTc0MDZcdThCRTVcdTUzNjBcdTRGNERcdTMwMDJcIiwgXCJSZW1vdGUgbm90ZSBpcyBtaXNzaW5nLiBUaGUgbG9jYWwgcGxhY2Vob2xkZXIgd2FzIGtlcHQgZm9yIG5vdyBpbiBjYXNlIHRoaXMgaXMgdHJhbnNpZW50OyBpdCB3aWxsIGJlIGNsZWFuZWQgYXV0b21hdGljYWxseSBpZiB0aGUgcmVtb3RlIGlzIHN0aWxsIG1pc3Npbmcgb24gdGhlIG5leHQgY29uZmlybWF0aW9uLlwiKSwgODAwMCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbmV3IE5vdGljZSh0aGlzLnQoYFx1NURGMlx1NEVDRVx1OEZEQ1x1N0FFRlx1NjA2Mlx1NTkwRFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gLCBgUmVzdG9yZWQgbm90ZSBmcm9tIHJlbW90ZTogJHtmaWxlLmJhc2VuYW1lfWApLCA2MDAwKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBoeWRyYXRlIG5vdGUgZnJvbSByZW1vdGVcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU4RkRDXHU3QUVGXHU2MDYyXHU1OTBEXHU3QjE0XHU4QkIwXHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIHJlc3RvcmUgbm90ZSBmcm9tIHJlbW90ZVwiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGdldE9wZW5NYXJrZG93bkNvbnRlbnQobm90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IGxlYXZlcyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoXCJtYXJrZG93blwiKTtcbiAgICBmb3IgKGNvbnN0IGxlYWYgb2YgbGVhdmVzKSB7XG4gICAgICBjb25zdCB2aWV3ID0gbGVhZi52aWV3O1xuICAgICAgaWYgKCEodmlldyBpbnN0YW5jZW9mIE1hcmtkb3duVmlldykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghdmlldy5maWxlIHx8IHZpZXcuZmlsZS5wYXRoICE9PSBub3RlUGF0aCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHZpZXcuZWRpdG9yLmdldFZhbHVlKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZTogVEZpbGUpIHtcbiAgICBjb25zdCBsaXZlQ29udGVudCA9IHRoaXMuZ2V0T3Blbk1hcmtkb3duQ29udGVudChmaWxlLnBhdGgpO1xuICAgIGlmIChsaXZlQ29udGVudCAhPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGxpdmVDb250ZW50O1xuICAgIH1cblxuICAgIHJldHVybiBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBidWlsZEN1cnJlbnRMb2NhbFNpZ25hdHVyZShmaWxlOiBURmlsZSwgbWFya2Rvd25Db250ZW50Pzogc3RyaW5nKSB7XG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHtcbiAgICAgIHJldHVybiB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkU3luY1NpZ25hdHVyZShmaWxlKTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50ID0gbWFya2Rvd25Db250ZW50ID8/IChhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSkpO1xuICAgIGNvbnN0IGRpZ2VzdCA9IChhd2FpdCB0aGlzLmNvbXB1dGVTaGEyNTZIZXgodGhpcy5lbmNvZGVVdGY4KGNvbnRlbnQpKSkuc2xpY2UoMCwgMTYpO1xuICAgIHJldHVybiBgbWQ6JHtjb250ZW50Lmxlbmd0aH06JHtkaWdlc3R9YDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVjb25jaWxlUmVtb3RlSW1hZ2VzKCkge1xuICAgIHJldHVybiB7IGRlbGV0ZWRGaWxlczogMCwgZGVsZXRlZERpcmVjdG9yaWVzOiAwIH07XG4gIH1cblxuICBwcml2YXRlIG1hcmtNaXNzaW5nTGF6eVJlbW90ZShwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgIGNvbnN0IHByZXZpb3VzID0gdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzLmdldChwYXRoKTtcbiAgICBjb25zdCBuZXh0OiBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZCA9IHByZXZpb3VzXG4gICAgICA/IHtcbiAgICAgICAgICBmaXJzdERldGVjdGVkQXQ6IHByZXZpb3VzLmZpcnN0RGV0ZWN0ZWRBdCxcbiAgICAgICAgICBsYXN0RGV0ZWN0ZWRBdDogbm93LFxuICAgICAgICAgIG1pc3NDb3VudDogcHJldmlvdXMubWlzc0NvdW50ICsgMSxcbiAgICAgICAgfVxuICAgICAgOiB7XG4gICAgICAgICAgZmlyc3REZXRlY3RlZEF0OiBub3csXG4gICAgICAgICAgbGFzdERldGVjdGVkQXQ6IG5vdyxcbiAgICAgICAgICBtaXNzQ291bnQ6IDEsXG4gICAgICAgIH07XG4gICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzLnNldChwYXRoLCBuZXh0KTtcbiAgICByZXR1cm4gbmV4dDtcbiAgfVxuXG4gIHByaXZhdGUgY2xlYXJNaXNzaW5nTGF6eVJlbW90ZShwYXRoOiBzdHJpbmcpIHtcbiAgICB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMuZGVsZXRlKHBhdGgpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNoYXJlZCBsb2dpYyBmb3IgcmVzb2x2aW5nIGEgbGF6eS1ub3RlIHN0dWIgaW4gYm90aCBoYW5kbGVGaWxlT3BlbiBhbmRcbiAgICogc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQuICBDYWxsZXJzIHByb3ZpZGUgdGhlIGFscmVhZHktbG9va2VkLXVwIHJlbW90ZVxuICAgKiBzdGF0ZSAob3IgbnVsbCkgYW5kIGFuIG9wdGlvbmFsIHRvbWJzdG9uZS5cbiAgICovXG4gIHByaXZhdGUgYXN5bmMgcmVzb2x2ZUxhenlOb3RlU3R1YihcbiAgICBmaWxlOiBURmlsZSxcbiAgICBzdHViOiB7IHJlbW90ZVBhdGg6IHN0cmluZyB9LFxuICAgIHJlbW90ZTogUmVtb3RlRmlsZVN0YXRlIHwgbnVsbCB8IHVuZGVmaW5lZCxcbiAgICB0b21ic3RvbmU6IERlbGV0aW9uVG9tYnN0b25lIHwgdW5kZWZpbmVkLFxuICApOiBQcm9taXNlPHsgYWN0aW9uOiBcImRlbGV0ZWRcIiB8IFwicmVzdG9yZWRcIiB8IFwibWlzc2luZ1wiOyBwdXJnZWRNaXNzaW5nPzogYm9vbGVhbiB9PiB7XG4gICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgIGlmICh0b21ic3RvbmUpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5yZW1vdmVMb2NhbFZhdWx0RmlsZShmaWxlKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICAgIHRoaXMuY2xlYXJNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgICByZXR1cm4geyBhY3Rpb246IFwiZGVsZXRlZFwiLCBkZWxldGVkU3R1YjogdHJ1ZSB9O1xuICAgICAgfVxuXG4gICAgICBjb25zdCBtaXNzaW5nUmVjb3JkID0gdGhpcy5tYXJrTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICAgIGlmIChtaXNzaW5nUmVjb3JkLm1pc3NDb3VudCA+PSB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlQ29uZmlybWF0aW9ucykge1xuICAgICAgICBhd2FpdCB0aGlzLnJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGUpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgICAgdGhpcy5jbGVhck1pc3NpbmdMYXp5UmVtb3RlKGZpbGUucGF0aCk7XG4gICAgICAgIHJldHVybiB7IGFjdGlvbjogXCJkZWxldGVkXCIsIGRlbGV0ZWRTdHViOiB0cnVlLCBwdXJnZWRNaXNzaW5nOiB0cnVlIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7IGFjdGlvbjogXCJtaXNzaW5nXCIgfTtcbiAgICB9XG5cbiAgICB0aGlzLmNsZWFyTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgIGNvbnN0IHJlZnJlc2hlZCA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKGZpbGUucGF0aCk7XG4gICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRTeW5jU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgcmVtb3RlU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgcmVtb3RlUGF0aDogc3R1Yi5yZW1vdGVQYXRoLFxuICAgIH0pO1xuICAgIHJldHVybiB7IGFjdGlvbjogXCJyZXN0b3JlZFwiIH07XG4gIH1cblxuICBwcml2YXRlIHBhcnNlTm90ZVN0dWIoY29udGVudDogc3RyaW5nKSB7XG4gICAgY29uc3QgbWF0Y2ggPSBjb250ZW50Lm1hdGNoKFxuICAgICAgL148IS0tXFxzKnNlY3VyZS13ZWJkYXYtbm90ZS1zdHViXFxzKlxccj9cXG5yZW1vdGU6XFxzKiguKz8pXFxyP1xcbnBsYWNlaG9sZGVyOlxccyooLio/KVxccj9cXG4tLT4vcyxcbiAgICApO1xuICAgIGlmICghbWF0Y2gpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICByZW1vdGVQYXRoOiBtYXRjaFsxXS50cmltKCksXG4gICAgICBwbGFjZWhvbGRlcjogbWF0Y2hbMl0udHJpbSgpLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkTm90ZVN0dWIoZmlsZTogVEZpbGUpIHtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5zeW5jU3VwcG9ydC5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgoZmlsZS5wYXRoKTtcbiAgICByZXR1cm4gW1xuICAgICAgYDwhLS0gJHtTRUNVUkVfTk9URV9TVFVCfWAsXG4gICAgICBgcmVtb3RlOiAke3JlbW90ZVBhdGh9YCxcbiAgICAgIGBwbGFjZWhvbGRlcjogJHtmaWxlLmJhc2VuYW1lfWAsXG4gICAgICBcIi0tPlwiLFxuICAgICAgXCJcIixcbiAgICAgIHRoaXMudChcbiAgICAgICAgYFx1OEZEOVx1NjYyRlx1NEUwMFx1N0JDN1x1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFx1NzY4NFx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1NjU4N1x1NEVGNlx1MzAwMlx1NjI1M1x1NUYwMFx1OEZEOVx1N0JDN1x1N0IxNFx1OEJCMFx1NjVGNlx1RkYwQ1x1NjNEMlx1NEVGNlx1NEYxQVx1NEVDRVx1OEZEQ1x1N0FFRlx1NTQwQ1x1NkI2NVx1NzZFRVx1NUY1NVx1NjA2Mlx1NTkwRFx1NUI4Q1x1NjU3NFx1NTE4NVx1NUJCOVx1MzAwMmAsXG4gICAgICAgIGBUaGlzIGlzIGEgbG9jYWwgcGxhY2Vob2xkZXIgZm9yIGFuIG9uLWRlbWFuZCBub3RlLiBPcGVuaW5nIHRoZSBub3RlIHJlc3RvcmVzIHRoZSBmdWxsIGNvbnRlbnQgZnJvbSB0aGUgcmVtb3RlIHN5bmMgZm9sZGVyLmAsXG4gICAgICApLFxuICAgIF0uam9pbihcIlxcblwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZXZpY3RTdGFsZVN5bmNlZE5vdGVzKHNob3dOb3RpY2U6IGJvb2xlYW4pIHtcbiAgICB0cnkge1xuICAgICAgaWYgKHRoaXMuc2V0dGluZ3Mubm90ZVN0b3JhZ2VNb2RlICE9PSBcImxhenktbm90ZXNcIikge1xuICAgICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1RjUzXHU1MjREXHU2NzJBXHU1NDJGXHU3NTI4XHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXHU2QTIxXHU1RjBGXHUzMDAyXCIsIFwiTGF6eSBub3RlIG1vZGUgaXMgbm90IGVuYWJsZWQuXCIpLCA2MDAwKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZmlsZXMgPSB0aGlzLnN5bmNTdXBwb3J0LmNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpLmZpbHRlcigoZmlsZSkgPT4gZmlsZS5leHRlbnNpb24gPT09IFwibWRcIik7XG4gICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgICAgY29uc3QgdGhyZXNob2xkID0gTWF0aC5tYXgoMSwgdGhpcy5zZXR0aW5ncy5ub3RlRXZpY3RBZnRlckRheXMpICogMjQgKiA2MCAqIDYwICogMTAwMDtcbiAgICAgIGxldCBldmljdGVkID0gMDtcblxuICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICAgIGNvbnN0IGFjdGl2ZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgICAgIGlmIChhY3RpdmU/LnBhdGggPT09IGZpbGUucGF0aCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbGFzdEFjY2VzcyA9IHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMuZ2V0KGZpbGUucGF0aCkgPz8gMDtcbiAgICAgICAgaWYgKGxhc3RBY2Nlc3MgIT09IDAgJiYgbm93IC0gbGFzdEFjY2VzcyA8IHRocmVzaG9sZCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICAgIGlmICh0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCkpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGJpbmFyeSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWRCaW5hcnkoZmlsZSk7XG4gICAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aChmaWxlLnBhdGgpO1xuICAgICAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBiaW5hcnksIFwidGV4dC9tYXJrZG93bjsgY2hhcnNldD11dGYtOFwiKTtcbiAgICAgICAgY29uc3QgdmVyaWZpZWQgPSBhd2FpdCB0aGlzLnZlcmlmeVJlbW90ZUJpbmFyeVJvdW5kVHJpcChyZW1vdGVQYXRoLCBiaW5hcnkpO1xuICAgICAgICBpZiAoIXZlcmlmaWVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1NjgyMVx1OUE4Q1x1NTkzMVx1OEQyNVx1RkYwQ1x1NURGMlx1NTNENlx1NkQ4OFx1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1MzAwMlwiLCBcIlJlbW90ZSBub3RlIHZlcmlmaWNhdGlvbiBmYWlsZWQsIGxvY2FsIG5vdGUgZXZpY3Rpb24gd2FzIGNhbmNlbGxlZC5cIikpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuc3RhdFJlbW90ZUZpbGUocmVtb3RlUGF0aCk7XG4gICAgICAgIGlmICghcmVtb3RlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1NTE0M1x1NjU3MFx1NjM2RVx1N0YzQVx1NTkzMVx1RkYwQ1x1NURGMlx1NTNENlx1NkQ4OFx1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1MzAwMlwiLCBcIlJlbW90ZSBub3RlIG1ldGFkYXRhIGlzIG1pc3NpbmcsIGxvY2FsIG5vdGUgZXZpY3Rpb24gd2FzIGNhbmNlbGxlZC5cIikpO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB0aGlzLmJ1aWxkTm90ZVN0dWIoZmlsZSkpO1xuICAgICAgICBjb25zdCByZWZyZXNoZWQgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChmaWxlLnBhdGgpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRTeW5jU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkU3luY1NpZ25hdHVyZShmaWxlKSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHJlbW90ZT8uc2lnbmF0dXJlID8/IGAke2ZpbGUuc3RhdC5tdGltZX06JHtiaW5hcnkuYnl0ZUxlbmd0aH1gLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICBldmljdGVkICs9IDE7XG4gICAgICB9XG5cbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgYFx1NURGMlx1NTZERVx1NjUzNiAke2V2aWN0ZWR9IFx1N0JDN1x1OTU3Rlx1NjcxRlx1NjcyQVx1OEJCRlx1OTVFRVx1NzY4NFx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1MzAwMmAsXG4gICAgICAgICAgICBgRXZpY3RlZCAke2V2aWN0ZWR9IHN0YWxlIGxvY2FsIG5vdGUocykuYCxcbiAgICAgICAgICApLFxuICAgICAgICAgIDgwMDAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgcmV0dXJuIGV2aWN0ZWQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZXZpY3Qgc3RhbGUgc3luY2VkIG5vdGVzXCIsIGVycm9yKTtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1NTkzMVx1OEQyNVwiLCBcIkZhaWxlZCB0byBldmljdCBsb2NhbCBub3Rlc1wiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZW5zdXJlUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcGFydHMgPSByZW1vdGVQYXRoLnNwbGl0KFwiL1wiKS5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPiAwKTtcbiAgICBpZiAocGFydHMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgY3VycmVudCA9IFwiXCI7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHBhcnRzLmxlbmd0aCAtIDE7IGluZGV4ICs9IDEpIHtcbiAgICAgIGN1cnJlbnQgPSBjdXJyZW50ID8gYCR7Y3VycmVudH0vJHtwYXJ0c1tpbmRleF19YCA6IHBhcnRzW2luZGV4XTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKGN1cnJlbnQpLFxuICAgICAgICBtZXRob2Q6IFwiTUtDT0xcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgaWYgKCFbMjAwLCAyMDEsIDIwNCwgMjA3LCAzMDEsIDMwMiwgMzA3LCAzMDgsIDQwNV0uaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1LQ09MIGZhaWxlZCBmb3IgJHtjdXJyZW50fSB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGxpc3RSZW1vdGVUcmVlKHJvb3RGb2xkZXI6IHN0cmluZyk6IFByb21pc2U8UmVtb3RlSW52ZW50b3J5PiB7XG4gICAgY29uc3QgZmlsZXMgPSBuZXcgTWFwPHN0cmluZywgUmVtb3RlRmlsZVN0YXRlPigpO1xuICAgIGNvbnN0IGRpcmVjdG9yaWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgcGVuZGluZyA9IFtub3JtYWxpemVGb2xkZXIocm9vdEZvbGRlcildO1xuICAgIGNvbnN0IHZpc2l0ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuICAgIHdoaWxlIChwZW5kaW5nLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSBub3JtYWxpemVGb2xkZXIocGVuZGluZy5wb3AoKSA/PyByb290Rm9sZGVyKTtcbiAgICAgIGlmICh2aXNpdGVkLmhhcyhjdXJyZW50KSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgdmlzaXRlZC5hZGQoY3VycmVudCk7XG4gICAgICBjb25zdCBlbnRyaWVzID0gYXdhaXQgdGhpcy5saXN0UmVtb3RlRGlyZWN0b3J5KGN1cnJlbnQpO1xuICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG4gICAgICAgIGlmIChlbnRyeS5pc0NvbGxlY3Rpb24pIHtcbiAgICAgICAgICBkaXJlY3Rvcmllcy5hZGQoZW50cnkucmVtb3RlUGF0aCk7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKGVudHJ5LnJlbW90ZVBhdGgpO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGVudHJ5LmZpbGUpIHtcbiAgICAgICAgICBmaWxlcy5zZXQoZW50cnkucmVtb3RlUGF0aCwgZW50cnkuZmlsZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4geyBmaWxlcywgZGlyZWN0b3JpZXMgfTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgbGlzdFJlbW90ZURpcmVjdG9yeShyZW1vdGVEaXJlY3Rvcnk6IHN0cmluZykge1xuICAgIGNvbnN0IHJlcXVlc3RlZFBhdGggPSBub3JtYWxpemVGb2xkZXIocmVtb3RlRGlyZWN0b3J5KTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVxdWVzdGVkUGF0aCksXG4gICAgICBtZXRob2Q6IFwiUFJPUEZJTkRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgRGVwdGg6IFwiMVwiLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDQwNCkge1xuICAgICAgcmV0dXJuIFtdIGFzIEFycmF5PHsgcmVtb3RlUGF0aDogc3RyaW5nOyBpc0NvbGxlY3Rpb246IGJvb2xlYW47IGZpbGU/OiBSZW1vdGVGaWxlU3RhdGUgfT47XG4gICAgfVxuXG4gICAgdGhpcy5hc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2UsIGBQUk9QRklORCBmb3IgJHtyZXF1ZXN0ZWRQYXRofWApO1xuXG4gICAgY29uc3QgeG1sVGV4dCA9IHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlcik7XG4gICAgcmV0dXJuIHRoaXMucGFyc2VQcm9wZmluZERpcmVjdG9yeUxpc3RpbmcoeG1sVGV4dCwgcmVxdWVzdGVkUGF0aCk7XG4gIH1cblxuICBwcml2YXRlIHBhcnNlUHJvcGZpbmREaXJlY3RvcnlMaXN0aW5nKHhtbFRleHQ6IHN0cmluZywgcmVxdWVzdGVkUGF0aDogc3RyaW5nLCBpbmNsdWRlUmVxdWVzdGVkID0gZmFsc2UpIHtcbiAgICBjb25zdCBwYXJzZXIgPSBuZXcgRE9NUGFyc2VyKCk7XG4gICAgY29uc3QgZG9jdW1lbnQgPSBwYXJzZXIucGFyc2VGcm9tU3RyaW5nKHhtbFRleHQsIFwiYXBwbGljYXRpb24veG1sXCIpO1xuICAgIGlmIChkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcInBhcnNlcmVycm9yXCIpLmxlbmd0aCA+IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJcdTY1RTBcdTZDRDVcdTg5RTNcdTY3OTAgV2ViREFWIFx1NzZFRVx1NUY1NVx1NkUwNVx1NTM1NVx1MzAwMlwiLCBcIkZhaWxlZCB0byBwYXJzZSB0aGUgV2ViREFWIGRpcmVjdG9yeSBsaXN0aW5nLlwiKSk7XG4gICAgfVxuXG4gICAgY29uc3QgZW50cmllcyA9IG5ldyBNYXA8c3RyaW5nLCB7IHJlbW90ZVBhdGg6IHN0cmluZzsgaXNDb2xsZWN0aW9uOiBib29sZWFuOyBmaWxlPzogUmVtb3RlRmlsZVN0YXRlIH0+KCk7XG4gICAgZm9yIChjb25zdCBlbGVtZW50IG9mIEFycmF5LmZyb20oZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCIqXCIpKSkge1xuICAgICAgaWYgKGVsZW1lbnQubG9jYWxOYW1lICE9PSBcInJlc3BvbnNlXCIpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGhyZWYgPSB0aGlzLmdldFhtbExvY2FsTmFtZVRleHQoZWxlbWVudCwgXCJocmVmXCIpO1xuICAgICAgaWYgKCFocmVmKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5ocmVmVG9SZW1vdGVQYXRoKGhyZWYpO1xuICAgICAgaWYgKCFyZW1vdGVQYXRoKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBpc0NvbGxlY3Rpb24gPSB0aGlzLnhtbFRyZWVIYXNMb2NhbE5hbWUoZWxlbWVudCwgXCJjb2xsZWN0aW9uXCIpO1xuICAgICAgY29uc3Qgbm9ybWFsaXplZFBhdGggPSBpc0NvbGxlY3Rpb24gPyBub3JtYWxpemVGb2xkZXIocmVtb3RlUGF0aCkgOiByZW1vdGVQYXRoLnJlcGxhY2UoL1xcLyskLywgXCJcIik7XG4gICAgICBpZiAoXG4gICAgICAgICFpbmNsdWRlUmVxdWVzdGVkICYmXG4gICAgICAgIChcbiAgICAgICAgICBub3JtYWxpemVkUGF0aCA9PT0gcmVxdWVzdGVkUGF0aCB8fFxuICAgICAgICAgIG5vcm1hbGl6ZWRQYXRoID09PSByZXF1ZXN0ZWRQYXRoLnJlcGxhY2UoL1xcLyskLywgXCJcIilcbiAgICAgICAgKVxuICAgICAgKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzaXplVGV4dCA9IHRoaXMuZ2V0WG1sTG9jYWxOYW1lVGV4dChlbGVtZW50LCBcImdldGNvbnRlbnRsZW5ndGhcIik7XG4gICAgICBjb25zdCBwYXJzZWRTaXplID0gTnVtYmVyLnBhcnNlSW50KHNpemVUZXh0LCAxMCk7XG4gICAgICBjb25zdCBzaXplID0gTnVtYmVyLmlzRmluaXRlKHBhcnNlZFNpemUpID8gcGFyc2VkU2l6ZSA6IDA7XG4gICAgICBjb25zdCBtb2RpZmllZFRleHQgPSB0aGlzLmdldFhtbExvY2FsTmFtZVRleHQoZWxlbWVudCwgXCJnZXRsYXN0bW9kaWZpZWRcIik7XG4gICAgICBjb25zdCBwYXJzZWRNdGltZSA9IERhdGUucGFyc2UobW9kaWZpZWRUZXh0KTtcbiAgICAgIGNvbnN0IGxhc3RNb2RpZmllZCA9IE51bWJlci5pc0Zpbml0ZShwYXJzZWRNdGltZSkgPyBwYXJzZWRNdGltZSA6IDA7XG5cbiAgICAgIGVudHJpZXMuc2V0KG5vcm1hbGl6ZWRQYXRoLCB7XG4gICAgICAgIHJlbW90ZVBhdGg6IG5vcm1hbGl6ZWRQYXRoLFxuICAgICAgICBpc0NvbGxlY3Rpb24sXG4gICAgICAgIGZpbGU6IGlzQ29sbGVjdGlvblxuICAgICAgICAgID8gdW5kZWZpbmVkXG4gICAgICAgICAgOiB7XG4gICAgICAgICAgICAgIHJlbW90ZVBhdGg6IG5vcm1hbGl6ZWRQYXRoLFxuICAgICAgICAgICAgICBsYXN0TW9kaWZpZWQsXG4gICAgICAgICAgICAgIHNpemUsXG4gICAgICAgICAgICAgIHNpZ25hdHVyZTogdGhpcy5zeW5jU3VwcG9ydC5idWlsZFJlbW90ZVN5bmNTaWduYXR1cmUoe1xuICAgICAgICAgICAgICAgIGxhc3RNb2RpZmllZCxcbiAgICAgICAgICAgICAgICBzaXplLFxuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gWy4uLmVudHJpZXMudmFsdWVzKCldO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRYbWxMb2NhbE5hbWVUZXh0KHBhcmVudDogRWxlbWVudCwgbG9jYWxOYW1lOiBzdHJpbmcpIHtcbiAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgQXJyYXkuZnJvbShwYXJlbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCIqXCIpKSkge1xuICAgICAgaWYgKGVsZW1lbnQubG9jYWxOYW1lID09PSBsb2NhbE5hbWUpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQudGV4dENvbnRlbnQ/LnRyaW0oKSA/PyBcIlwiO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBcIlwiO1xuICB9XG5cbiAgcHJpdmF0ZSB4bWxUcmVlSGFzTG9jYWxOYW1lKHBhcmVudDogRWxlbWVudCwgbG9jYWxOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShwYXJlbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCIqXCIpKS5zb21lKChlbGVtZW50KSA9PiBlbGVtZW50LmxvY2FsTmFtZSA9PT0gbG9jYWxOYW1lKTtcbiAgfVxuXG4gIHByaXZhdGUgaHJlZlRvUmVtb3RlUGF0aChocmVmOiBzdHJpbmcpIHtcbiAgICBjb25zdCBiYXNlVXJsID0gYCR7dGhpcy5zZXR0aW5ncy53ZWJkYXZVcmwucmVwbGFjZSgvXFwvKyQvLCBcIlwiKX0vYDtcbiAgICBjb25zdCByZXNvbHZlZCA9IG5ldyBVUkwoaHJlZiwgYmFzZVVybCk7XG4gICAgY29uc3QgYmFzZVBhdGggPSBuZXcgVVJMKGJhc2VVcmwpLnBhdGhuYW1lLnJlcGxhY2UoL1xcLyskLywgXCIvXCIpO1xuICAgIGNvbnN0IGRlY29kZWRQYXRoID0gdGhpcy5kZWNvZGVQYXRobmFtZShyZXNvbHZlZC5wYXRobmFtZSk7XG4gICAgaWYgKCFkZWNvZGVkUGF0aC5zdGFydHNXaXRoKGJhc2VQYXRoKSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlY29kZWRQYXRoLnNsaWNlKGJhc2VQYXRoLmxlbmd0aCkucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgZGVjb2RlUGF0aG5hbWUocGF0aG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBwYXRobmFtZVxuICAgICAgLnNwbGl0KFwiL1wiKVxuICAgICAgLm1hcCgoc2VnbWVudCkgPT4ge1xuICAgICAgICBpZiAoIXNlZ21lbnQpIHtcbiAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudChzZWdtZW50KTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgcmV0dXJuIHNlZ21lbnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuam9pbihcIi9cIik7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkRXhwZWN0ZWRSZW1vdGVEaXJlY3RvcmllcyhyZW1vdGVGaWxlUGF0aHM6IFNldDxzdHJpbmc+LCByb290Rm9sZGVyOiBzdHJpbmcpIHtcbiAgICBjb25zdCBleHBlY3RlZCA9IG5ldyBTZXQ8c3RyaW5nPihbbm9ybWFsaXplRm9sZGVyKHJvb3RGb2xkZXIpXSk7XG4gICAgZm9yIChjb25zdCByZW1vdGVQYXRoIG9mIHJlbW90ZUZpbGVQYXRocykge1xuICAgICAgY29uc3QgcGFydHMgPSByZW1vdGVQYXRoLnNwbGl0KFwiL1wiKS5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPiAwKTtcbiAgICAgIGxldCBjdXJyZW50ID0gXCJcIjtcbiAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBwYXJ0cy5sZW5ndGggLSAxOyBpbmRleCArPSAxKSB7XG4gICAgICAgIGN1cnJlbnQgPSBjdXJyZW50ID8gYCR7Y3VycmVudH0vJHtwYXJ0c1tpbmRleF19YCA6IHBhcnRzW2luZGV4XTtcbiAgICAgICAgZXhwZWN0ZWQuYWRkKG5vcm1hbGl6ZUZvbGRlcihjdXJyZW50KSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGV4cGVjdGVkO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVFeHRyYVJlbW90ZURpcmVjdG9yaWVzKHJlbW90ZURpcmVjdG9yaWVzOiBTZXQ8c3RyaW5nPiwgZXhwZWN0ZWREaXJlY3RvcmllczogU2V0PHN0cmluZz4pIHtcbiAgICBsZXQgZGVsZXRlZCA9IDA7XG4gICAgY29uc3QgY2FuZGlkYXRlcyA9IFsuLi5yZW1vdGVEaXJlY3Rvcmllc11cbiAgICAgIC5maWx0ZXIoKHJlbW90ZVBhdGgpID0+ICFleHBlY3RlZERpcmVjdG9yaWVzLmhhcyhyZW1vdGVQYXRoKSlcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBiLmxlbmd0aCAtIGEubGVuZ3RoIHx8IGIubG9jYWxlQ29tcGFyZShhKSk7XG5cbiAgICBmb3IgKGNvbnN0IHJlbW90ZVBhdGggb2YgY2FuZGlkYXRlcykge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICAgIG1ldGhvZDogXCJERUxFVEVcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgaWYgKFsyMDAsIDIwMiwgMjA0LCA0MDRdLmluY2x1ZGVzKHJlc3BvbnNlLnN0YXR1cykpIHtcbiAgICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gNDA0KSB7XG4gICAgICAgICAgZGVsZXRlZCArPSAxO1xuICAgICAgICB9XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoWzQwNSwgNDA5XS5pbmNsdWRlcyhyZXNwb25zZS5zdGF0dXMpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYERFTEVURSBkaXJlY3RvcnkgZmFpbGVkIGZvciAke3JlbW90ZVBhdGh9IHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIH1cblxuICAgIHJldHVybiBkZWxldGVkO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzUGVuZGluZ1Rhc2tzKCkge1xuXG4gICAgYXdhaXQgdGhpcy51cGxvYWRRdWV1ZS5wcm9jZXNzUGVuZGluZ1Rhc2tzKCk7XG4gIH1cblxuICBwcml2YXRlIHRyYWNrVmF1bHRNdXRhdGlvbihvcGVyYXRpb246ICgpID0+IFByb21pc2U8dm9pZD4pIHtcbiAgICBjb25zdCBwcm9taXNlID0gb3BlcmF0aW9uKClcbiAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIlNlY3VyZSBXZWJEQVYgdmF1bHQgbXV0YXRpb24gaGFuZGxpbmcgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIH0pXG4gICAgICAuZmluYWxseSgoKSA9PiB7XG4gICAgICAgIHRoaXMucGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlcy5kZWxldGUocHJvbWlzZSk7XG4gICAgICB9KTtcbiAgICB0aGlzLnBlbmRpbmdWYXVsdE11dGF0aW9uUHJvbWlzZXMuYWRkKHByb21pc2UpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB3YWl0Rm9yUGVuZGluZ1ZhdWx0TXV0YXRpb25zKCkge1xuICAgIHdoaWxlICh0aGlzLnBlbmRpbmdWYXVsdE11dGF0aW9uUHJvbWlzZXMuc2l6ZSA+IDApIHtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChbLi4udGhpcy5wZW5kaW5nVmF1bHRNdXRhdGlvblByb21pc2VzXSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwcmVwYXJlUGVuZGluZ1VwbG9hZHNGb3JTeW5jKHNob3dOb3RpY2U6IGJvb2xlYW4pIHtcblxuICAgIGF3YWl0IHRoaXMudXBsb2FkUXVldWUucHJvY2Vzc1BlbmRpbmdUYXNrcygpO1xuXG4gICAgaWYgKHRoaXMudXBsb2FkUXVldWUuaGFzUGVuZGluZ1dvcmsoKSkge1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy50KFxuICAgICAgICBcIlx1NjhDMFx1NkQ0Qlx1NTIzMFx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NEVDRFx1NTcyOFx1OEZEQlx1ODg0Q1x1NjIxNlx1N0I0OVx1NUY4NVx1OTFDRFx1OEJENVx1RkYwQ1x1NURGMlx1NjY4Mlx1N0YxM1x1NjcyQ1x1NkIyMVx1N0IxNFx1OEJCMFx1NTQwQ1x1NkI2NVx1RkYwQ1x1OTA3Rlx1NTE0RFx1NjVFN1x1NzI0OFx1N0IxNFx1OEJCMFx1ODk4Nlx1NzZENlx1NjVCMFx1NTZGRVx1NzI0N1x1NUYxNVx1NzUyOFx1MzAwMlwiLFxuICAgICAgICBcIkltYWdlIHVwbG9hZHMgYXJlIHN0aWxsIHJ1bm5pbmcgb3Igd2FpdGluZyBmb3IgcmV0cnksIHNvIG5vdGUgc3luYyB3YXMgZGVmZXJyZWQgdG8gYXZvaWQgb2xkIG5vdGUgY29udGVudCBvdmVyd3JpdGluZyBuZXcgaW1hZ2UgcmVmZXJlbmNlcy5cIixcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsIDgwMDApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRJbWFnZXNJbk5vdGUobm90ZUZpbGU6IFRGaWxlKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKG5vdGVGaWxlKTtcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50cyA9IGF3YWl0IHRoaXMuYnVpbGRVcGxvYWRSZXBsYWNlbWVudHMoY29udGVudCwgbm90ZUZpbGUpO1xuXG4gICAgICBpZiAocmVwbGFjZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NUY1M1x1NTI0RFx1N0IxNFx1OEJCMFx1NEUyRFx1NkNBMVx1NjcwOVx1NjI3RVx1NTIzMFx1NjcyQ1x1NTczMFx1NTZGRVx1NzI0N1x1MzAwMlwiLCBcIk5vIGxvY2FsIGltYWdlcyBmb3VuZCBpbiB0aGUgY3VycmVudCBub3RlLlwiKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbGV0IHVwZGF0ZWQgPSBjb250ZW50O1xuICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcbiAgICAgICAgdXBkYXRlZCA9IHVwZGF0ZWQuc3BsaXQocmVwbGFjZW1lbnQub3JpZ2luYWwpLmpvaW4ocmVwbGFjZW1lbnQucmV3cml0dGVuKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHVwZGF0ZWQgPT09IGNvbnRlbnQpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdTZDQTFcdTY3MDlcdTk3MDBcdTg5ODFcdTY1MzlcdTUxOTlcdTc2ODRcdTU2RkVcdTcyNDdcdTk0RkVcdTYzQTVcdTMwMDJcIiwgXCJObyBpbWFnZXMgd2VyZSByZXdyaXR0ZW4uXCIpKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkobm90ZUZpbGUsIHVwZGF0ZWQpO1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZUZpbGUucGF0aCwgXCJpbWFnZS1hZGRcIik7XG5cbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLmRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQpIHtcbiAgICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcbiAgICAgICAgICBpZiAocmVwbGFjZW1lbnQuc291cmNlRmlsZSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy50cmFzaElmRXhpc3RzKHJlcGxhY2VtZW50LnNvdXJjZUZpbGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBuZXcgTm90aWNlKHRoaXMudChgXHU1REYyXHU0RTBBXHU0RjIwICR7cmVwbGFjZW1lbnRzLmxlbmd0aH0gXHU1RjIwXHU1NkZFXHU3MjQ3XHU1MjMwIFdlYkRBVlx1MzAwMmAsIGBVcGxvYWRlZCAke3JlcGxhY2VtZW50cy5sZW5ndGh9IGltYWdlKHMpIHRvIFdlYkRBVi5gKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIHVwbG9hZCBmYWlsZWRcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU0RTBBXHU0RjIwXHU1OTMxXHU4RDI1XCIsIFwiVXBsb2FkIGZhaWxlZFwiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHByb2Nlc3NUYXNrKHRhc2s6IFVwbG9hZFRhc2spIHtcblxuICAgIGF3YWl0IHRoaXMudXBsb2FkUXVldWUucHJvY2Vzc1Rhc2sodGFzayk7XG4gIH1cblxuICBwcml2YXRlIGVzY2FwZUh0bWwodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiB2YWx1ZVxuICAgICAgLnJlcGxhY2UoLyYvZywgXCImYW1wO1wiKVxuICAgICAgLnJlcGxhY2UoL1wiL2csIFwiJnF1b3Q7XCIpXG4gICAgICAucmVwbGFjZSgvPC9nLCBcIiZsdDtcIilcbiAgICAgIC5yZXBsYWNlKC8+L2csIFwiJmd0O1wiKTtcbiAgfVxuXG4gIHByaXZhdGUgdW5lc2NhcGVIdG1sKHZhbHVlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdmFsdWVcbiAgICAgIC5yZXBsYWNlKC8mcXVvdDsvZywgXCJcXFwiXCIpXG4gICAgICAucmVwbGFjZSgvJmd0Oy9nLCBcIj5cIilcbiAgICAgIC5yZXBsYWNlKC8mbHQ7L2csIFwiPFwiKVxuICAgICAgLnJlcGxhY2UoLyZhbXA7L2csIFwiJlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmwocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMuYXNzZXJ0UmVzcG9uc2VTdWNjZXNzKHJlc3BvbnNlLCBcIkZldGNoIHNlY3VyZSBpbWFnZVwiKTtcblxuICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbcmVzcG9uc2UuYXJyYXlCdWZmZXJdLCB7XG4gICAgICB0eXBlOiByZXNwb25zZS5oZWFkZXJzW1wiY29udGVudC10eXBlXCJdID8/IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCIsXG4gICAgfSk7XG4gICAgY29uc3QgYmxvYlVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgdGhpcy5ldmljdEJsb2JVcmxzSWZOZWVkZWQoKTtcbiAgICB0aGlzLmJsb2JVcmxzLnB1c2goYmxvYlVybCk7XG4gICAgcmV0dXJuIGJsb2JVcmw7XG4gIH1cblxuICBwcml2YXRlIGV2aWN0QmxvYlVybHNJZk5lZWRlZCgpIHtcbiAgICB3aGlsZSAodGhpcy5ibG9iVXJscy5sZW5ndGggPj0gdGhpcy5tYXhCbG9iVXJscykge1xuICAgICAgVVJMLnJldm9rZU9iamVjdFVSTCh0aGlzLmJsb2JVcmxzLnNoaWZ0KCkhKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFycmF5QnVmZmVyVG9CYXNlNjQoYnVmZmVyOiBBcnJheUJ1ZmZlcikge1xuICAgIGNvbnN0IGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKTtcbiAgICBjb25zdCBjaHVua1NpemUgPSAweDgwMDA7XG4gICAgbGV0IGJpbmFyeSA9IFwiXCI7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGJ5dGVzLmxlbmd0aDsgaW5kZXggKz0gY2h1bmtTaXplKSB7XG4gICAgICBjb25zdCBjaHVuayA9IGJ5dGVzLnN1YmFycmF5KGluZGV4LCBpbmRleCArIGNodW5rU2l6ZSk7XG4gICAgICBiaW5hcnkgKz0gU3RyaW5nLmZyb21DaGFyQ29kZSguLi5jaHVuayk7XG4gICAgfVxuICAgIHJldHVybiBidG9hKGJpbmFyeSk7XG4gIH1cblxuICBwcml2YXRlIGJhc2U2NFRvQXJyYXlCdWZmZXIoYmFzZTY0OiBzdHJpbmcpIHtcbiAgICBjb25zdCBiaW5hcnkgPSBhdG9iKGJhc2U2NCk7XG4gICAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShiaW5hcnkubGVuZ3RoKTtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYmluYXJ5Lmxlbmd0aDsgaW5kZXggKz0gMSkge1xuICAgICAgYnl0ZXNbaW5kZXhdID0gYmluYXJ5LmNoYXJDb2RlQXQoaW5kZXgpO1xuICAgIH1cbiAgICByZXR1cm4gYnl0ZXMuYnVmZmVyLnNsaWNlKGJ5dGVzLmJ5dGVPZmZzZXQsIGJ5dGVzLmJ5dGVPZmZzZXQgKyBieXRlcy5ieXRlTGVuZ3RoKSBhcyBBcnJheUJ1ZmZlcjtcbiAgfVxuXG4gIHByaXZhdGUgYXJyYXlCdWZmZXJzRXF1YWwobGVmdDogQXJyYXlCdWZmZXIsIHJpZ2h0OiBBcnJheUJ1ZmZlcikge1xuICAgIGNvbnN0IGEgPSBuZXcgVWludDhBcnJheShsZWZ0KTtcbiAgICBjb25zdCBiID0gbmV3IFVpbnQ4QXJyYXkocmlnaHQpO1xuICAgIGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYS5sZW5ndGg7IGluZGV4ICs9IDEpIHtcbiAgICAgIGlmIChhW2luZGV4XSAhPT0gYltpbmRleF0pIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZENsaXBib2FyZEZpbGVOYW1lKG1pbWVUeXBlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBleHRlbnNpb24gPSBtaW1lVHlwZS5zcGxpdChcIi9cIilbMV0/LnJlcGxhY2UoXCJqcGVnXCIsIFwianBnXCIpIHx8IFwicG5nXCI7XG4gICAgcmV0dXJuIGBwYXN0ZWQtaW1hZ2UtJHtEYXRlLm5vdygpfS4ke2V4dGVuc2lvbn1gO1xuICB9XG5cbiAgcHJpdmF0ZSBlc2NhcGVSZWdFeHAodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgXCJcXFxcJCZcIik7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkUmVtb3RlUGF0aChmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGAke25vcm1hbGl6ZUZvbGRlcih0aGlzLnNldHRpbmdzLnJlbW90ZUZvbGRlcil9JHtmaWxlTmFtZX1gO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBidWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeShmaWxlTmFtZTogc3RyaW5nLCBiaW5hcnk6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgZXh0ZW5zaW9uID0gdGhpcy5nZXRFeHRlbnNpb25Gcm9tRmlsZU5hbWUoZmlsZU5hbWUpO1xuICAgIGlmICh0aGlzLnNldHRpbmdzLm5hbWluZ1N0cmF0ZWd5ID09PSBcImhhc2hcIikge1xuICAgICAgY29uc3QgaGFzaCA9IChhd2FpdCB0aGlzLmNvbXB1dGVTaGEyNTZIZXgoYmluYXJ5KSkuc2xpY2UoMCwgMTYpO1xuICAgICAgcmV0dXJuIGAke2hhc2h9LiR7ZXh0ZW5zaW9ufWA7XG4gICAgfVxuXG4gICAgcmV0dXJuIGAke0RhdGUubm93KCl9LSR7ZmlsZU5hbWV9YDtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgYmFzZSA9IHRoaXMuc2V0dGluZ3Mud2ViZGF2VXJsLnJlcGxhY2UoL1xcLyskLywgXCJcIik7XG4gICAgcmV0dXJuIGAke2Jhc2V9LyR7cmVtb3RlUGF0aC5zcGxpdChcIi9cIikubWFwKGVuY29kZVVSSUNvbXBvbmVudCkuam9pbihcIi9cIil9YDtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRBdXRoSGVhZGVyKCkge1xuICAgIGNvbnN0IHRva2VuID0gdGhpcy5hcnJheUJ1ZmZlclRvQmFzZTY0KHRoaXMuZW5jb2RlVXRmOChgJHt0aGlzLnNldHRpbmdzLnVzZXJuYW1lfToke3RoaXMuc2V0dGluZ3MucGFzc3dvcmR9YCkpO1xuICAgIHJldHVybiBgQmFzaWMgJHt0b2tlbn1gO1xuICB9XG5cbiAgcHJpdmF0ZSBlbnN1cmVDb25maWd1cmVkKCkge1xuICAgIGlmICghdGhpcy5zZXR0aW5ncy53ZWJkYXZVcmwgfHwgIXRoaXMuc2V0dGluZ3MudXNlcm5hbWUgfHwgIXRoaXMuc2V0dGluZ3MucGFzc3dvcmQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJXZWJEQVYgXHU5MTREXHU3RjZFXHU0RTBEXHU1QjhDXHU2NTc0XHUzMDAyXCIsIFwiV2ViREFWIHNldHRpbmdzIGFyZSBpbmNvbXBsZXRlLlwiKSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2U6IHsgc3RhdHVzOiBudW1iZXIgfSwgY29udGV4dDogc3RyaW5nKSB7XG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7Y29udGV4dH0gZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZ2V0TWltZVR5cGUoZXh0ZW5zaW9uOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gTUlNRV9NQVBbZXh0ZW5zaW9uLnRvTG93ZXJDYXNlKCldID8/IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCI7XG4gIH1cblxuICBwcml2YXRlIGdldE1pbWVUeXBlRnJvbUZpbGVOYW1lKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRNaW1lVHlwZSh0aGlzLmdldEV4dGVuc2lvbkZyb21GaWxlTmFtZShmaWxlTmFtZSkpO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRFeHRlbnNpb25Gcm9tRmlsZU5hbWUoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHBpZWNlcyA9IGZpbGVOYW1lLnNwbGl0KFwiLlwiKTtcbiAgICByZXR1cm4gcGllY2VzLmxlbmd0aCA+IDEgPyBwaWVjZXNbcGllY2VzLmxlbmd0aCAtIDFdLnRvTG93ZXJDYXNlKCkgOiBcInBuZ1wiO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwcmVwYXJlVXBsb2FkUGF5bG9hZChiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLmNvbXByZXNzSW1hZ2VzKSB7XG4gICAgICByZXR1cm4geyBiaW5hcnksIG1pbWVUeXBlLCBmaWxlTmFtZSB9O1xuICAgIH1cblxuICAgIGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdGhpcy5jb21wcmVzc0ltYWdlSWZOZWVkZWQoYmluYXJ5LCBtaW1lVHlwZSwgZmlsZU5hbWUpO1xuICAgIHJldHVybiBwcmVwYXJlZCA/PyB7IGJpbmFyeSwgbWltZVR5cGUsIGZpbGVOYW1lIH07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNvbXByZXNzSW1hZ2VJZk5lZWRlZChiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgaWYgKCEvXmltYWdlXFwvKHBuZ3xqcGVnfGpwZ3x3ZWJwKSQvaS50ZXN0KG1pbWVUeXBlKSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgdGhyZXNob2xkQnl0ZXMgPSB0aGlzLnNldHRpbmdzLmNvbXByZXNzVGhyZXNob2xkS2IgKiAxMDI0O1xuICAgIGNvbnN0IHNvdXJjZUJsb2IgPSBuZXcgQmxvYihbYmluYXJ5XSwgeyB0eXBlOiBtaW1lVHlwZSB9KTtcbiAgICBjb25zdCBpbWFnZSA9IGF3YWl0IHRoaXMubG9hZEltYWdlRWxlbWVudChzb3VyY2VCbG9iKTtcbiAgICBjb25zdCBsYXJnZXN0U2lkZSA9IE1hdGgubWF4KGltYWdlLm5hdHVyYWxXaWR0aCwgaW1hZ2UubmF0dXJhbEhlaWdodCk7XG4gICAgY29uc3QgbmVlZHNSZXNpemUgPSBsYXJnZXN0U2lkZSA+IHRoaXMuc2V0dGluZ3MubWF4SW1hZ2VEaW1lbnNpb247XG4gICAgY29uc3QgbmVlZHNDb21wcmVzcyA9IHNvdXJjZUJsb2Iuc2l6ZSA+IHRocmVzaG9sZEJ5dGVzIHx8IG5lZWRzUmVzaXplO1xuICAgIGlmICghbmVlZHNDb21wcmVzcykge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3Qgc2NhbGUgPSBuZWVkc1Jlc2l6ZSA/IHRoaXMuc2V0dGluZ3MubWF4SW1hZ2VEaW1lbnNpb24gLyBsYXJnZXN0U2lkZSA6IDE7XG4gICAgY29uc3QgdGFyZ2V0V2lkdGggPSBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKGltYWdlLm5hdHVyYWxXaWR0aCAqIHNjYWxlKSk7XG4gICAgY29uc3QgdGFyZ2V0SGVpZ2h0ID0gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChpbWFnZS5uYXR1cmFsSGVpZ2h0ICogc2NhbGUpKTtcbiAgICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiY2FudmFzXCIpO1xuICAgIGNhbnZhcy53aWR0aCA9IHRhcmdldFdpZHRoO1xuICAgIGNhbnZhcy5oZWlnaHQgPSB0YXJnZXRIZWlnaHQ7XG4gICAgY29uc3QgY29udGV4dCA9IGNhbnZhcy5nZXRDb250ZXh0KFwiMmRcIik7XG4gICAgaWYgKCFjb250ZXh0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb250ZXh0LmRyYXdJbWFnZShpbWFnZSwgMCwgMCwgdGFyZ2V0V2lkdGgsIHRhcmdldEhlaWdodCk7XG5cbiAgICBjb25zdCBvdXRwdXRNaW1lID0gbWltZVR5cGUudG9Mb3dlckNhc2UoKSA9PT0gXCJpbWFnZS9qcGdcIiA/IFwiaW1hZ2UvanBlZ1wiIDogbWltZVR5cGU7XG4gICAgY29uc3QgcXVhbGl0eSA9IE1hdGgubWF4KDAuNCwgTWF0aC5taW4oMC45OCwgdGhpcy5zZXR0aW5ncy5qcGVnUXVhbGl0eSAvIDEwMCkpO1xuICAgIGNvbnN0IGNvbXByZXNzZWRCbG9iID0gYXdhaXQgbmV3IFByb21pc2U8QmxvYiB8IG51bGw+KChyZXNvbHZlKSA9PiB7XG4gICAgICBjYW52YXMudG9CbG9iKHJlc29sdmUsIG91dHB1dE1pbWUsIHF1YWxpdHkpO1xuICAgIH0pO1xuXG4gICAgaWYgKCFjb21wcmVzc2VkQmxvYikge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaWYgKCFuZWVkc1Jlc2l6ZSAmJiBjb21wcmVzc2VkQmxvYi5zaXplID49IHNvdXJjZUJsb2Iuc2l6ZSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgbmV4dEJpbmFyeSA9IGF3YWl0IGNvbXByZXNzZWRCbG9iLmFycmF5QnVmZmVyKCk7XG4gICAgY29uc3QgbmV4dEV4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uRnJvbU1pbWVUeXBlKG91dHB1dE1pbWUpID8/IHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbUZpbGVOYW1lKGZpbGVOYW1lKTtcbiAgICBjb25zdCBuZXh0RmlsZU5hbWUgPSBmaWxlTmFtZS5yZXBsYWNlKC9cXC5bXi5dKyQvLCBcIlwiKSArIGAuJHtuZXh0RXh0ZW5zaW9ufWA7XG4gICAgcmV0dXJuIHtcbiAgICAgIGJpbmFyeTogbmV4dEJpbmFyeSxcbiAgICAgIG1pbWVUeXBlOiBvdXRwdXRNaW1lLFxuICAgICAgZmlsZU5hbWU6IG5leHRGaWxlTmFtZSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBsb2FkSW1hZ2VFbGVtZW50KGJsb2I6IEJsb2IpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2U8SFRNTEltYWdlRWxlbWVudD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgIGNvbnN0IGltYWdlID0gbmV3IEltYWdlKCk7XG4gICAgICBpbWFnZS5vbmxvYWQgPSAoKSA9PiB7XG4gICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwodXJsKTtcbiAgICAgICAgcmVzb2x2ZShpbWFnZSk7XG4gICAgICB9O1xuICAgICAgaW1hZ2Uub25lcnJvciA9IChlcnJvcikgPT4ge1xuICAgICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9O1xuICAgICAgaW1hZ2Uuc3JjID0gdXJsO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRlbnNpb25Gcm9tTWltZVR5cGUobWltZVR5cGU6IHN0cmluZykge1xuICAgIHJldHVybiBNSU1FX01BUFttaW1lVHlwZV0gPz8gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdHJhc2hJZkV4aXN0cyhmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LnRyYXNoKGZpbGUsIHRydWUpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oXCJGYWlsZWQgdG8gdHJhc2ggbG9jYWwgaW1hZ2UgYWZ0ZXIgdXBsb2FkXCIsIGVycm9yKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGZvcm1hdEVtYmVkTGFiZWwoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLnQoYFx1MzAxMFx1NUI4OVx1NTE2OFx1OEZEQ1x1N0EwQlx1NTZGRVx1NzI0N1x1RkY1QyR7ZmlsZU5hbWV9XHUzMDExYCwgYFtTZWN1cmUgcmVtb3RlIGltYWdlIHwgJHtmaWxlTmFtZX1dYCk7XG4gIH1cblxuICBwcml2YXRlIGZvcm1hdEZhaWxlZExhYmVsKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy50KGBcdTMwMTBcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTU5MzFcdThEMjVcdUZGNUMke2ZpbGVOYW1lfVx1MzAxMWAsIGBbSW1hZ2UgdXBsb2FkIGZhaWxlZCB8ICR7ZmlsZU5hbWV9XWApO1xuICB9XG5cbiAgYXN5bmMgbWlncmF0ZUFsbExlZ2FjeVNlY3VyZUltYWdlcygpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXBsb2FkQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgICAgY29uc3QgY2FuZGlkYXRlTG9jYWxJbWFnZXMgPSBuZXcgTWFwPHN0cmluZywgVEZpbGU+KCk7XG4gICAgICBsZXQgY2hhbmdlZEZpbGVzID0gMDtcbiAgICAgIGZvciAoY29uc3QgZmlsZSBvZiB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkpIHtcbiAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICAgIGNvbnN0IHJlcGxhY2VtZW50cyA9IGF3YWl0IHRoaXMuYnVpbGRVcGxvYWRSZXBsYWNlbWVudHMoY29udGVudCwgZmlsZSwgdXBsb2FkQ2FjaGUpO1xuICAgICAgICBmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIHJlcGxhY2VtZW50cykge1xuICAgICAgICAgIGlmIChyZXBsYWNlbWVudC5zb3VyY2VGaWxlKSB7XG4gICAgICAgICAgICBjYW5kaWRhdGVMb2NhbEltYWdlcy5zZXQocmVwbGFjZW1lbnQuc291cmNlRmlsZS5wYXRoLCByZXBsYWNlbWVudC5zb3VyY2VGaWxlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgdXBkYXRlZCA9IGNvbnRlbnQ7XG4gICAgICAgIGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgcmVwbGFjZW1lbnRzKSB7XG4gICAgICAgICAgdXBkYXRlZCA9IHVwZGF0ZWQuc3BsaXQocmVwbGFjZW1lbnQub3JpZ2luYWwpLmpvaW4ocmVwbGFjZW1lbnQucmV3cml0dGVuKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZWQgPSB1cGRhdGVkXG4gICAgICAgICAgLnJlcGxhY2UoXG4gICAgICAgICAgICAvPHNwYW4gY2xhc3M9XCJzZWN1cmUtd2ViZGF2LWVtYmVkXCIgZGF0YS1zZWN1cmUtd2ViZGF2PVwiKFteXCJdKylcIiBhcmlhLWxhYmVsPVwiKFteXCJdKilcIj4uKj88XFwvc3Bhbj4vZyxcbiAgICAgICAgICAgIChfbWF0Y2gsIHJlbW90ZVBhdGg6IHN0cmluZywgYWx0OiBzdHJpbmcpID0+XG4gICAgICAgICAgICAgIHRoaXMuaW1hZ2VTdXBwb3J0LmJ1aWxkU2VjdXJlSW1hZ2VDb2RlQmxvY2soXG4gICAgICAgICAgICAgICAgdGhpcy51bmVzY2FwZUh0bWwocmVtb3RlUGF0aCksXG4gICAgICAgICAgICAgICAgdGhpcy51bmVzY2FwZUh0bWwoYWx0KSB8fCB0aGlzLnVuZXNjYXBlSHRtbChyZW1vdGVQYXRoKSxcbiAgICAgICAgICAgICAgKSxcbiAgICAgICAgICApXG4gICAgICAgICAgLnJlcGxhY2UoXG4gICAgICAgICAgICAvIVxcW1teXFxdXSpdXFwod2ViZGF2LXNlY3VyZTpcXC9cXC8oW14pXSspXFwpL2csXG4gICAgICAgICAgICAoX21hdGNoLCByZW1vdGVQYXRoOiBzdHJpbmcpID0+XG4gICAgICAgICAgICAgIHRoaXMuaW1hZ2VTdXBwb3J0LmJ1aWxkU2VjdXJlSW1hZ2VDb2RlQmxvY2sodGhpcy51bmVzY2FwZUh0bWwocmVtb3RlUGF0aCksIHRoaXMudW5lc2NhcGVIdG1sKHJlbW90ZVBhdGgpKSxcbiAgICAgICAgICApO1xuXG4gICAgICAgIGlmICh1cGRhdGVkID09PSBjb250ZW50KSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdXBkYXRlZCk7XG4gICAgICAgIGNoYW5nZWRGaWxlcyArPSAxO1xuICAgICAgfVxuXG4gICAgICBpZiAoY2hhbmdlZEZpbGVzID09PSAwKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgXCJcdTY1NzRcdTVFOTNcdTkxQ0NcdTZDQTFcdTY3MDlcdTUzRDFcdTczQjBcdTUzRUZcdThGQzFcdTc5RkJcdTc2ODRcdTY1RTdcdTcyNDhcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTY4MDdcdTdCN0VcdTMwMDJcIixcbiAgICAgICAgICAgIFwiTm8gbGVnYWN5IHNlY3VyZSBpbWFnZSB0YWdzIHdlcmUgZm91bmQgaW4gdGhlIHZhdWx0LlwiLFxuICAgICAgICAgICksXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZGVsZXRlTG9jYWxBZnRlclVwbG9hZCkge1xuICAgICAgICBhd2FpdCB0aGlzLnRyYXNoTWlncmF0ZWRJbWFnZXNJZlNhZmUoY2FuZGlkYXRlTG9jYWxJbWFnZXMpO1xuICAgICAgfVxuXG4gICAgICBuZXcgTm90aWNlKFxuICAgICAgdGhpcy50KFxuICAgICAgICBgXHU1REYyXHU4RkMxXHU3OUZCICR7Y2hhbmdlZEZpbGVzfSBcdTdCQzdcdTdCMTRcdThCQjBcdTUyMzBcdTY1QjBcdTc2ODRcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTRFRTNcdTc4MDFcdTU3NTdcdTY4M0NcdTVGMEZcdTMwMDJgLFxuICAgICAgICBgTWlncmF0ZWQgJHtjaGFuZ2VkRmlsZXN9IG5vdGUocykgdG8gdGhlIG5ldyBzZWN1cmUgaW1hZ2UgY29kZS1ibG9jayBmb3JtYXQuYCxcbiAgICAgICksXG4gICAgICAgIDgwMDAsXG4gICAgICApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIG1pZ3JhdGUgc2VjdXJlIGltYWdlcyB0byBjb2RlIGJsb2Nrc1wiLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdThGQzFcdTc5RkJcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTY4M0NcdTVGMEZcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gbWlncmF0ZSBzZWN1cmUgaW1hZ2UgZm9ybWF0XCIpLCBlcnJvciksIDgwMDApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdHJhc2hNaWdyYXRlZEltYWdlc0lmU2FmZShjYW5kaWRhdGVMb2NhbEltYWdlczogTWFwPHN0cmluZywgVEZpbGU+KSB7XG4gICAgaWYgKGNhbmRpZGF0ZUxvY2FsSW1hZ2VzLnNpemUgPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCByZW1haW5pbmdSZWZzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgZm9yIChjb25zdCBub3RlIG9mIHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKSkge1xuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQobm90ZSk7XG4gICAgICBjb25zdCB3aWtpTWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKC8hXFxbXFxbKFteXFxdXSspXFxdXFxdL2cpXTtcbiAgICAgIGNvbnN0IG1hcmtkb3duTWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKC8hXFxbW15cXF1dKl1cXCgoW14pXSspXFwpL2cpXTtcblxuICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiB3aWtpTWF0Y2hlcykge1xuICAgICAgICBjb25zdCByYXdMaW5rID0gbWF0Y2hbMV0uc3BsaXQoXCJ8XCIpWzBdLnRyaW0oKTtcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5yZXNvbHZlTGlua2VkRmlsZShyYXdMaW5rLCBub3RlLnBhdGgpO1xuICAgICAgICBpZiAodGFyZ2V0ICYmIHRoaXMuaXNJbWFnZUZpbGUodGFyZ2V0KSkge1xuICAgICAgICAgIHJlbWFpbmluZ1JlZnMuYWRkKHRhcmdldC5wYXRoKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIG1hcmtkb3duTWF0Y2hlcykge1xuICAgICAgICBjb25zdCByYXdMaW5rID0gZGVjb2RlVVJJQ29tcG9uZW50KG1hdGNoWzFdLnRyaW0oKS5yZXBsYWNlKC9ePHw+JC9nLCBcIlwiKSk7XG4gICAgICAgIGlmICgvXihodHRwcz86fHdlYmRhdi1zZWN1cmU6fGRhdGE6KS9pLnRlc3QocmF3TGluaykpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMucmVzb2x2ZUxpbmtlZEZpbGUocmF3TGluaywgbm90ZS5wYXRoKTtcbiAgICAgICAgaWYgKHRhcmdldCAmJiB0aGlzLmlzSW1hZ2VGaWxlKHRhcmdldCkpIHtcbiAgICAgICAgICByZW1haW5pbmdSZWZzLmFkZCh0YXJnZXQucGF0aCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IFtwYXRoLCBmaWxlXSBvZiBjYW5kaWRhdGVMb2NhbEltYWdlcy5lbnRyaWVzKCkpIHtcbiAgICAgIGlmIChyZW1haW5pbmdSZWZzLmhhcyhwYXRoKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy50cmFzaElmRXhpc3RzKGZpbGUpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJ1bkNvbm5lY3Rpb25UZXN0KHNob3dNb2RhbCA9IGZhbHNlKSB7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xuXG4gICAgICBjb25zdCBwcm9iZU5hbWUgPSBgLnNlY3VyZS13ZWJkYXYtcHJvYmUtJHtEYXRlLm5vdygpfS50eHRgO1xuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRSZW1vdGVQYXRoKHByb2JlTmFtZSk7XG4gICAgICBjb25zdCB1cGxvYWRVcmwgPSB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpO1xuICAgICAgY29uc3QgcHJvYmVBcnJheUJ1ZmZlciA9IHRoaXMuZW5jb2RlVXRmOChgc2VjdXJlLXdlYmRhdiBwcm9iZSAke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKX1gKTtcblxuICAgICAgY29uc3QgcHV0UmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHVwbG9hZFVybCxcbiAgICAgICAgbWV0aG9kOiBcIlBVVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcInRleHQvcGxhaW47IGNoYXJzZXQ9dXRmLThcIixcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogcHJvYmVBcnJheUJ1ZmZlcixcbiAgICAgIH0pO1xuICAgICAgaWYgKHB1dFJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCBwdXRSZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgUFVUIGZhaWxlZCB3aXRoIHN0YXR1cyAke3B1dFJlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZ2V0UmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHVwbG9hZFVybCxcbiAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgaWYgKGdldFJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCBnZXRSZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgR0VUIGZhaWxlZCB3aXRoIHN0YXR1cyAke2dldFJlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZGVsZXRlUmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHVwbG9hZFVybCxcbiAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgaWYgKGRlbGV0ZVJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCBkZWxldGVSZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgREVMRVRFIGZhaWxlZCB3aXRoIHN0YXR1cyAke2RlbGV0ZVJlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbWVzc2FnZSA9IHRoaXMudChcbiAgICAgICAgYFdlYkRBViBcdTZENEJcdThCRDVcdTkwMUFcdThGQzdcdTMwMDJQVVQgJHtwdXRSZXNwb25zZS5zdGF0dXN9XHVGRjBDR0VUICR7Z2V0UmVzcG9uc2Uuc3RhdHVzfVx1RkYwQ0RFTEVURSAke2RlbGV0ZVJlc3BvbnNlLnN0YXR1c31cdTMwMDJgLFxuICAgICAgICBgV2ViREFWIHRlc3QgcGFzc2VkLiBQVVQgJHtwdXRSZXNwb25zZS5zdGF0dXN9LCBHRVQgJHtnZXRSZXNwb25zZS5zdGF0dXN9LCBERUxFVEUgJHtkZWxldGVSZXNwb25zZS5zdGF0dXN9LmAsXG4gICAgICApO1xuICAgICAgbmV3IE5vdGljZShtZXNzYWdlLCA2MDAwKTtcbiAgICAgIGlmIChzaG93TW9kYWwpIHtcbiAgICAgICAgbmV3IFJlc3VsdE1vZGFsKHRoaXMuYXBwLCB0aGlzLnQoXCJXZWJEQVYgXHU4RkRFXHU2M0E1XCIsIFwiV2ViREFWIENvbm5lY3Rpb25cIiksIG1lc3NhZ2UpLm9wZW4oKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiU2VjdXJlIFdlYkRBViB0ZXN0IGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICBjb25zdCBtZXNzYWdlID0gdGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIldlYkRBViBcdTZENEJcdThCRDVcdTU5MzFcdThEMjVcIiwgXCJXZWJEQVYgdGVzdCBmYWlsZWRcIiksIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UobWVzc2FnZSwgODAwMCk7XG4gICAgICBpZiAoc2hvd01vZGFsKSB7XG4gICAgICAgIG5ldyBSZXN1bHRNb2RhbCh0aGlzLmFwcCwgdGhpcy50KFwiV2ViREFWIFx1OEZERVx1NjNBNVwiLCBcIldlYkRBViBDb25uZWN0aW9uXCIpLCBtZXNzYWdlKS5vcGVuKCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBkZXNjcmliZUVycm9yKHByZWZpeDogc3RyaW5nLCBlcnJvcjogdW5rbm93bikge1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG4gICAgcmV0dXJuIGAke3ByZWZpeH06ICR7bWVzc2FnZX1gO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZXF1ZXN0VXJsKG9wdGlvbnM6IHtcbiAgICB1cmw6IHN0cmluZztcbiAgICBtZXRob2Q6IHN0cmluZztcbiAgICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgICBib2R5PzogQXJyYXlCdWZmZXI7XG4gICAgZm9sbG93UmVkaXJlY3RzPzogYm9vbGVhbjtcbiAgICByZWRpcmVjdENvdW50PzogbnVtYmVyO1xuICB9KTogUHJvbWlzZTx7IHN0YXR1czogbnVtYmVyOyBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+OyBhcnJheUJ1ZmZlcjogQXJyYXlCdWZmZXIgfT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb2JzaWRpYW5SZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogb3B0aW9ucy51cmwsXG4gICAgICBtZXRob2Q6IG9wdGlvbnMubWV0aG9kLFxuICAgICAgaGVhZGVyczogb3B0aW9ucy5oZWFkZXJzLFxuICAgICAgYm9keTogb3B0aW9ucy5ib2R5LFxuICAgICAgdGhyb3c6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogcmVzcG9uc2Uuc3RhdHVzLFxuICAgICAgaGVhZGVyczogcmVzcG9uc2UuaGVhZGVycyxcbiAgICAgIGFycmF5QnVmZmVyOiByZXNwb25zZS5hcnJheUJ1ZmZlcixcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBlbmNvZGVVdGY4KHZhbHVlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBieXRlcyA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSh2YWx1ZSk7XG4gICAgcmV0dXJuIGJ5dGVzLmJ1ZmZlci5zbGljZShieXRlcy5ieXRlT2Zmc2V0LCBieXRlcy5ieXRlT2Zmc2V0ICsgYnl0ZXMuYnl0ZUxlbmd0aCkgYXMgQXJyYXlCdWZmZXI7XG4gIH1cblxuICBwcml2YXRlIGRlY29kZVV0ZjgoYnVmZmVyOiBBcnJheUJ1ZmZlcikge1xuICAgIHJldHVybiBuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoYnVmZmVyKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY29tcHV0ZVNoYTI1NkhleChidWZmZXI6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgZGlnZXN0ID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3QoXCJTSEEtMjU2XCIsIGJ1ZmZlcik7XG4gICAgcmV0dXJuIEFycmF5LmZyb20obmV3IFVpbnQ4QXJyYXkoZGlnZXN0KSlcbiAgICAgIC5tYXAoKHZhbHVlKSA9PiB2YWx1ZS50b1N0cmluZygxNikucGFkU3RhcnQoMiwgXCIwXCIpKVxuICAgICAgLmpvaW4oXCJcIik7XG4gIH1cbn1cblxudHlwZSBVcGxvYWRSZXdyaXRlID0ge1xuICBvcmlnaW5hbDogc3RyaW5nO1xuICByZXdyaXR0ZW46IHN0cmluZztcbiAgc291cmNlRmlsZT86IFRGaWxlO1xufTtcblxuY2xhc3MgU2VjdXJlV2ViZGF2U2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuICBwbHVnaW46IFNlY3VyZVdlYmRhdkltYWdlc1BsdWdpbjtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBTZWN1cmVXZWJkYXZJbWFnZXNQbHVnaW4pIHtcbiAgICBzdXBlcihhcHAsIHBsdWdpbik7XG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gIH1cblxuICBkaXNwbGF5KCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XG4gICAgY29udGFpbmVyRWwuZW1wdHkoKTtcblxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIlNlY3VyZSBXZWJEQVYgSW1hZ2VzXCIgfSk7XG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJwXCIsIHtcbiAgICAgIHRleHQ6IHRoaXMucGx1Z2luLnQoXG4gICAgICAgIFwiXHU4RkQ5XHU0RTJBXHU2M0QyXHU0RUY2XHU1M0VBXHU2MjhBXHU1NkZFXHU3MjQ3XHU1MjY1XHU3OUJCXHU1MjMwXHU1MzU1XHU3MkVDXHU3Njg0XHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHVGRjBDXHU1RTc2XHU0RkREXHU1QjU4XHU0RTNBIHNlY3VyZS13ZWJkYXYgXHU4MUVBXHU1QjlBXHU0RTQ5XHU0RUUzXHU3ODAxXHU1NzU3XHVGRjFCXHU1MTc2XHU0RUQ2XHU3QjE0XHU4QkIwXHU1NDhDXHU5NjQ0XHU0RUY2XHU2MzA5XHU1MzlGXHU4REVGXHU1Rjg0XHU1MzlGXHU2ODM3XHU1NDBDXHU2QjY1XHUzMDAyXCIsXG4gICAgICAgIFwiVGhpcyBwbHVnaW4gc2VwYXJhdGVzIG9ubHkgaW1hZ2VzIGludG8gYSBkZWRpY2F0ZWQgcmVtb3RlIGZvbGRlciBhbmQgc3RvcmVzIHRoZW0gYXMgc2VjdXJlLXdlYmRhdiBjdXN0b20gY29kZSBibG9ja3MuIE5vdGVzIGFuZCBvdGhlciBhdHRhY2htZW50cyBhcmUgc3luY2VkIGFzLWlzIHdpdGggdGhlaXIgb3JpZ2luYWwgcGF0aHMuXCIsXG4gICAgICApLFxuICAgIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU1RjUzXHU1MjREXHU2M0QyXHU0RUY2XHU3MjQ4XHU2NzJDXCIsIFwiQ3VycmVudCBwbHVnaW4gdmVyc2lvblwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU1OTFBXHU3QUVGXHU0RjdGXHU3NTI4XHU2NUY2XHU1M0VGXHU1MTQ4XHU2ODM4XHU1QkY5XHU4RkQ5XHU5MUNDXHU3Njg0XHU3MjQ4XHU2NzJDXHU1M0Y3XHVGRjBDXHU5MDdGXHU1MTREXHU1NkUwXHU0RTNBXHU1QkEyXHU2MjM3XHU3QUVGXHU1MzQ3XHU3RUE3XHU0RTBEXHU1MjMwXHU0RjREXHU1QkZDXHU4MUY0XHU4ODRDXHU0RTNBXHU0RTBEXHU0RTAwXHU4MUY0XHUzMDAyXCIsXG4gICAgICAgICAgXCJDaGVjayB0aGlzIHZlcnNpb24gZmlyc3QgYWNyb3NzIGRldmljZXMgdG8gYXZvaWQgaW5jb25zaXN0ZW50IGJlaGF2aW9yIGNhdXNlZCBieSBpbmNvbXBsZXRlIHVwZ3JhZGVzLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+IHtcbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5tYW5pZmVzdC52ZXJzaW9uKTtcbiAgICAgICAgdGV4dC5zZXREaXNhYmxlZCh0cnVlKTtcbiAgICAgIH0pO1xuXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMucGx1Z2luLnQoXCJcdTc1NENcdTk3NjJcdThCRURcdThBMDBcIiwgXCJJbnRlcmZhY2UgbGFuZ3VhZ2VcIikgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdThCRURcdThBMDBcIiwgXCJMYW5ndWFnZVwiKSlcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdThCQkVcdTdGNkVcdTk4NzVcdTY1MkZcdTYzMDFcdTgxRUFcdTUyQThcdTMwMDFcdTRFMkRcdTY1ODdcdTMwMDFcdTgyRjFcdTY1ODdcdTUyMDdcdTYzNjJcdTMwMDJcIiwgXCJTd2l0Y2ggdGhlIHNldHRpbmdzIFVJIGJldHdlZW4gYXV0bywgQ2hpbmVzZSwgYW5kIEVuZ2xpc2guXCIpKVxuICAgICAgLmFkZERyb3Bkb3duKChkcm9wZG93bikgPT5cbiAgICAgICAgZHJvcGRvd25cbiAgICAgICAgICAuYWRkT3B0aW9uKFwiYXV0b1wiLCB0aGlzLnBsdWdpbi50KFwiXHU4MUVBXHU1MkE4XCIsIFwiQXV0b1wiKSlcbiAgICAgICAgICAuYWRkT3B0aW9uKFwiemhcIiwgXCJcdTRFMkRcdTY1ODdcIilcbiAgICAgICAgICAuYWRkT3B0aW9uKFwiZW5cIiwgXCJFbmdsaXNoXCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxhbmd1YWdlKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmxhbmd1YWdlID0gdmFsdWUgYXMgXCJhdXRvXCIgfCBcInpoXCIgfCBcImVuXCI7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiB0aGlzLnBsdWdpbi50KFwiXHU4RkRFXHU2M0E1XHU4QkJFXHU3RjZFXCIsIFwiQ29ubmVjdGlvblwiKSB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIldlYkRBViBcdTU3RkFcdTc4NDBcdTU3MzBcdTU3NDBcIiwgXCJXZWJEQVYgYmFzZSBVUkxcIikpXG4gICAgICAuc2V0RGVzYyh0aGlzLnBsdWdpbi50KFwiXHU2NzBEXHU1MkExXHU1NjY4XHU1N0ZBXHU3ODQwXHU1NzMwXHU1NzQwXHVGRjBDXHU0RjhCXHU1OTgyXHVGRjFBaHR0cDovL3lvdXItd2ViZGF2LWhvc3Q6cG9ydFwiLCBcIkJhc2Ugc2VydmVyIFVSTC4gRXhhbXBsZTogaHR0cDovL3lvdXItd2ViZGF2LWhvc3Q6cG9ydFwiKSlcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiaHR0cDovL3lvdXItd2ViZGF2LWhvc3Q6cG9ydFwiKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy53ZWJkYXZVcmwpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Mud2ViZGF2VXJsID0gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4RDI2XHU1M0Y3XCIsIFwiVXNlcm5hbWVcIikpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VybmFtZSkub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlcm5hbWUgPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NUJDNlx1NzgwMVwiLCBcIlBhc3N3b3JkXCIpKVxuICAgICAgLnNldERlc2ModGhpcy5wbHVnaW4udChcIlx1OUVEOFx1OEJBNFx1OTY5MFx1ODVDRlx1RkYwQ1x1NTNFRlx1NzBCOVx1NTFGQlx1NTNGM1x1NEZBN1x1NjMwOVx1OTRBRVx1NjYzRVx1NzkzQVx1NjIxNlx1OTY5MFx1ODVDRlx1MzAwMlwiLCBcIkhpZGRlbiBieSBkZWZhdWx0LiBVc2UgdGhlIGJ1dHRvbiBvbiB0aGUgcmlnaHQgdG8gc2hvdyBvciBoaWRlIGl0LlwiKSlcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PiB7XG4gICAgICAgIHRleHQuaW5wdXRFbC50eXBlID0gXCJwYXNzd29yZFwiO1xuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnBhc3N3b3JkKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXNzd29yZCA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAuYWRkRXh0cmFCdXR0b24oKGJ1dHRvbikgPT4ge1xuICAgICAgICBsZXQgdmlzaWJsZSA9IGZhbHNlO1xuICAgICAgICBidXR0b24uc2V0SWNvbihcImV5ZVwiKTtcbiAgICAgICAgYnV0dG9uLnNldFRvb2x0aXAodGhpcy5wbHVnaW4udChcIlx1NjYzRVx1NzkzQVx1NUJDNlx1NzgwMVwiLCBcIlNob3cgcGFzc3dvcmRcIikpO1xuICAgICAgICBidXR0b24ub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgY29uc3QgaW5wdXQgPSBidXR0b24uZXh0cmFTZXR0aW5nc0VsLnBhcmVudEVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3IoXCJpbnB1dFwiKTtcbiAgICAgICAgICBpZiAoIShpbnB1dCBpbnN0YW5jZW9mIEhUTUxJbnB1dEVsZW1lbnQpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdmlzaWJsZSA9ICF2aXNpYmxlO1xuICAgICAgICAgIGlucHV0LnR5cGUgPSB2aXNpYmxlID8gXCJ0ZXh0XCIgOiBcInBhc3N3b3JkXCI7XG4gICAgICAgICAgYnV0dG9uLnNldEljb24odmlzaWJsZSA/IFwiZXllLW9mZlwiIDogXCJleWVcIik7XG4gICAgICAgICAgYnV0dG9uLnNldFRvb2x0aXAodGhpcy5wbHVnaW4udCh2aXNpYmxlID8gXCJcdTk2OTBcdTg1Q0ZcdTVCQzZcdTc4MDFcIiA6IFwiXHU2NjNFXHU3OTNBXHU1QkM2XHU3ODAxXCIsIHZpc2libGUgPyBcIkhpZGUgcGFzc3dvcmRcIiA6IFwiU2hvdyBwYXNzd29yZFwiKSk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTU2RkVcdTcyNDdcdThGRENcdTdBMEJcdTc2RUVcdTVGNTVcIiwgXCJJbWFnZSByZW1vdGUgZm9sZGVyXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTRFMTNcdTk1RThcdTc1MjhcdTRFOEVcdTVCNThcdTY1M0VcdThGRENcdTdBMEJcdTU2RkVcdTcyNDdcdTc2ODQgV2ViREFWIFx1NzZFRVx1NUY1NVx1RkYwQ1x1NEY4Qlx1NTk4Mlx1RkYxQS9yZW1vdGUtaW1hZ2VzL1x1MzAwMlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NjIxMFx1NTI5Rlx1NTQwRVx1NEYxQVx1N0FDQlx1NTM3M1x1NTIyMFx1OTY2NFx1NjcyQ1x1NTczMFx1NTZGRVx1NzI0N1x1NjU4N1x1NEVGNlx1MzAwMlwiLFxuICAgICAgICAgIFwiRGVkaWNhdGVkIFdlYkRBViBmb2xkZXIgZm9yIHJlbW90ZSBpbWFnZXMsIGZvciBleGFtcGxlOiAvcmVtb3RlLWltYWdlcy8uIExvY2FsIGltYWdlIGZpbGVzIGFyZSBkZWxldGVkIGltbWVkaWF0ZWx5IGFmdGVyIHVwbG9hZCBzdWNjZWVkcy5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnJlbW90ZUZvbGRlcikub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmVtb3RlRm9sZGVyID0gbm9ybWFsaXplUGF0aCh2YWx1ZS50cmltKCkgfHwgXCIvcmVtb3RlLWltYWdlcy9cIik7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NkQ0Qlx1OEJENVx1OEZERVx1NjNBNVwiLCBcIlRlc3QgY29ubmVjdGlvblwiKSlcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdTRGN0ZcdTc1MjhcdTRFMzRcdTY1RjZcdTYzQTJcdTk0ODhcdTY1ODdcdTRFRjZcdTlBOENcdThCQzEgUFVUXHUzMDAxR0VUXHUzMDAxREVMRVRFIFx1NjYyRlx1NTQyNlx1NkI2M1x1NUUzOFx1MzAwMlwiLCBcIlZlcmlmeSBQVVQsIEdFVCwgYW5kIERFTEVURSB1c2luZyBhIHRlbXBvcmFyeSBwcm9iZSBmaWxlLlwiKSlcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodGhpcy5wbHVnaW4udChcIlx1NUYwMFx1NTlDQlx1NkQ0Qlx1OEJENVwiLCBcIlJ1biB0ZXN0XCIpKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnJ1bkNvbm5lY3Rpb25UZXN0KHRydWUpO1xuICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQoZmFsc2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMucGx1Z2luLnQoXCJcdTU0MENcdTZCNjVcdThCQkVcdTdGNkVcIiwgXCJTeW5jXCIpIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4RkRDXHU3QTBCXHU3QjE0XHU4QkIwXHU3NkVFXHU1RjU1XCIsIFwiUmVtb3RlIG5vdGVzIGZvbGRlclwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU3NTI4XHU0RThFXHU1QjU4XHU2NTNFXHU3QjE0XHU4QkIwXHU1NDhDXHU1MTc2XHU0RUQ2XHU5NzVFXHU1NkZFXHU3MjQ3XHU5NjQ0XHU0RUY2XHU1MzlGXHU2ODM3XHU1NDBDXHU2QjY1XHU1MjZGXHU2NzJDXHU3Njg0XHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHVGRjBDXHU0RjhCXHU1OTgyXHVGRjFBL3ZhdWx0LXN5bmMvXHUzMDAyXHU2M0QyXHU0RUY2XHU0RjFBXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU2NTc0XHU0RTJBIHZhdWx0XHVGRjBDXHU1RTc2XHU4REYzXHU4RkM3IC5vYnNpZGlhblx1MzAwMVx1NjNEMlx1NEVGNlx1NzZFRVx1NUY1NVx1NTQ4Q1x1NTZGRVx1NzI0N1x1NjU4N1x1NEVGNlx1MzAwMlwiLFxuICAgICAgICAgIFwiUmVtb3RlIGZvbGRlciB1c2VkIGZvciBub3RlcyBhbmQgb3RoZXIgbm9uLWltYWdlIGF0dGFjaG1lbnRzIHN5bmNlZCBhcy1pcywgZm9yIGV4YW1wbGU6IC92YXVsdC1zeW5jLy4gVGhlIHBsdWdpbiBzeW5jcyB0aGUgd2hvbGUgdmF1bHQgYW5kIGF1dG9tYXRpY2FsbHkgc2tpcHMgLm9ic2lkaWFuLCB0aGUgcGx1Z2luIGRpcmVjdG9yeSwgYW5kIGltYWdlIGZpbGVzLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIgPSBub3JtYWxpemVQYXRoKHZhbHVlLnRyaW0oKSB8fCBcIi92YXVsdC1zeW5jL1wiKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU5ODkxXHU3Mzg3XCIsIFwiQXV0byBzeW5jIGZyZXF1ZW5jeVwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU0RUU1XHU1MjA2XHU5NDlGXHU0RTNBXHU1MzU1XHU0RjREXHU4QkJFXHU3RjZFXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU2NUY2XHU5NUY0XHUzMDAyXHU1ODZCIDAgXHU4ODY4XHU3OTNBXHU1MTczXHU5NUVEXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHUzMDAyXHU4RkQ5XHU5MUNDXHU3Njg0XHU1NDBDXHU2QjY1XHU2NjJGXHUyMDFDXHU1QkY5XHU4RDI2XHU1NDBDXHU2QjY1XHUyMDFEXHVGRjFBXHU0RjFBXHU2OEMwXHU2N0U1XHU2NzJDXHU1NzMwXHU0RTBFXHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHU1REVFXHU1RjAyXHVGRjBDXHU4ODY1XHU0RjIwXHU2NUIwXHU1ODlFXHU1NDhDXHU1M0Q4XHU2NkY0XHU2NTg3XHU0RUY2XHVGRjBDXHU1RTc2XHU1MjIwXHU5NjY0XHU4RkRDXHU3QUVGXHU1OTFBXHU0RjU5XHU1MTg1XHU1QkI5XHUzMDAyXCIsXG4gICAgICAgICAgXCJTZXQgdGhlIGF1dG9tYXRpYyBzeW5jIGludGVydmFsIGluIG1pbnV0ZXMuIFVzZSAwIHRvIHR1cm4gaXQgb2ZmLiBUaGlzIGlzIGEgcmVjb25jaWxpYXRpb24gc3luYzogaXQgY2hlY2tzIGxvY2FsIGFuZCByZW1vdGUgZGlmZmVyZW5jZXMsIHVwbG9hZHMgbmV3IG9yIGNoYW5nZWQgZmlsZXMsIGFuZCByZW1vdmVzIGV4dHJhIHJlbW90ZSBjb250ZW50LlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCIwXCIpXG4gICAgICAgICAgLnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvU3luY0ludGVydmFsTWludXRlcykpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gTnVtYmVyLnBhcnNlSW50KHZhbHVlLCAxMCk7XG4gICAgICAgICAgICBpZiAoIU51bWJlci5pc05hTihwYXJzZWQpKSB7XG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzID0gTWF0aC5tYXgoMCwgcGFyc2VkKTtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU3QjE0XHU4QkIwXHU2NzJDXHU1NzMwXHU0RkREXHU3NTU5XHU2QTIxXHU1RjBGXCIsIFwiTm90ZSBsb2NhbCByZXRlbnRpb24gbW9kZVwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU1QjhDXHU2NTc0XHU2NzJDXHU1NzMwXHVGRjFBXHU3QjE0XHU4QkIwXHU1OUNCXHU3RUM4XHU0RkREXHU3NTU5XHU1NzI4XHU2NzJDXHU1NzMwXHUzMDAyXHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXHVGRjFBXHU5NTdGXHU2NzFGXHU2NzJBXHU4QkJGXHU5NUVFXHU3Njg0IE1hcmtkb3duIFx1N0IxNFx1OEJCMFx1NEYxQVx1ODhBQlx1NjZGRlx1NjM2Mlx1NEUzQVx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1NjU4N1x1NEVGNlx1RkYwQ1x1NjI1M1x1NUYwMFx1NjVGNlx1NTE4RFx1NEVDRVx1OEZEQ1x1N0FFRlx1NjA2Mlx1NTkwRFx1MzAwMlwiLFxuICAgICAgICAgIFwiRnVsbCBsb2NhbDogbm90ZXMgYWx3YXlzIHN0YXkgbG9jYWwuIExhenkgbm90ZXM6IHN0YWxlIE1hcmtkb3duIG5vdGVzIGFyZSByZXBsYWNlZCB3aXRoIGxvY2FsIHBsYWNlaG9sZGVyIGZpbGVzIGFuZCByZXN0b3JlZCBmcm9tIHJlbW90ZSB3aGVuIG9wZW5lZC5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGREcm9wZG93bigoZHJvcGRvd24pID0+XG4gICAgICAgIGRyb3Bkb3duXG4gICAgICAgICAgLmFkZE9wdGlvbihcImZ1bGwtbG9jYWxcIiwgdGhpcy5wbHVnaW4udChcIlx1NUI4Q1x1NjU3NFx1NjcyQ1x1NTczMFwiLCBcIkZ1bGwgbG9jYWxcIikpXG4gICAgICAgICAgLmFkZE9wdGlvbihcImxhenktbm90ZXNcIiwgdGhpcy5wbHVnaW4udChcIlx1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFwiLCBcIkxhenkgbm90ZXNcIikpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVTdG9yYWdlTW9kZSlcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlU3RvcmFnZU1vZGUgPSB2YWx1ZSBhcyBcImZ1bGwtbG9jYWxcIiB8IFwibGF6eS1ub3Rlc1wiO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU3QjE0XHU4QkIwXHU2NzJDXHU1NzMwXHU1NkRFXHU2NTM2XHU1OTI5XHU2NTcwXCIsIFwiTm90ZSBldmljdGlvbiBkYXlzXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTRFQzVcdTU3MjhcdTIwMUNcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTdCMTRcdThCQjBcdTIwMURcdTZBMjFcdTVGMEZcdTRFMEJcdTc1MUZcdTY1NDhcdTMwMDJcdThEODVcdThGQzdcdThGRDlcdTRFMkFcdTU5MjlcdTY1NzBcdTY3MkFcdTYyNTNcdTVGMDBcdTc2ODQgTWFya2Rvd24gXHU3QjE0XHU4QkIwXHVGRjBDXHU0RjFBXHU1NzI4XHU1NDBDXHU2QjY1XHU1NDBFXHU4OEFCXHU2NkZGXHU2MzYyXHU0RTNBXHU2NzJDXHU1NzMwXHU1MzYwXHU0RjREXHU2NTg3XHU0RUY2XHUzMDAyXCIsXG4gICAgICAgICAgXCJVc2VkIG9ubHkgaW4gbGF6eSBub3RlIG1vZGUuIE1hcmtkb3duIG5vdGVzIG5vdCBvcGVuZWQgd2l0aGluIHRoaXMgbnVtYmVyIG9mIGRheXMgYXJlIHJlcGxhY2VkIHdpdGggbG9jYWwgcGxhY2Vob2xkZXIgZmlsZXMgYWZ0ZXIgc3luYy5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiMzBcIilcbiAgICAgICAgICAuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVFdmljdEFmdGVyRGF5cykpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gTnVtYmVyLnBhcnNlSW50KHZhbHVlLCAxMCk7XG4gICAgICAgICAgICBpZiAoIU51bWJlci5pc05hTihwYXJzZWQpKSB7XG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVFdmljdEFmdGVyRGF5cyA9IE1hdGgubWF4KDEsIHBhcnNlZCk7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NTQwQ1x1NkI2NVx1NzJCNlx1NjAwMVwiLCBcIlN5bmMgc3RhdHVzXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgYCR7dGhpcy5wbHVnaW4uZm9ybWF0TGFzdFN5bmNMYWJlbCgpfVxcbiR7dGhpcy5wbHVnaW4uZm9ybWF0U3luY1N0YXR1c0xhYmVsKCl9XFxuJHt0aGlzLnBsdWdpbi50KFwiXHU4QkY0XHU2NjBFXHVGRjFBXHU3QUNCXHU1MzczXHU1NDBDXHU2QjY1XHU0RjFBXHU2MjY3XHU4ODRDXHU2NzJDXHU1NzMwXHU0RTBFXHU4RkRDXHU3QUVGXHU3Njg0XHU1QkY5XHU4RDI2XHVGRjBDXHU1NDBDXHU2QjY1XHU3QjE0XHU4QkIwXHU0RTBFXHU5NzVFXHU1NkZFXHU3MjQ3XHU5NjQ0XHU0RUY2XHVGRjBDXHU1RTc2XHU2RTA1XHU3NDA2XHU4RkRDXHU3QUVGXHU1MTk3XHU0RjU5XHU2NTg3XHU0RUY2XHUzMDAyXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU0RUNEXHU3NTMxXHU3MkVDXHU3QUNCXHU5NjFGXHU1MjE3XHU1OTA0XHU3NDA2XHUzMDAyXCIsIFwiTm90ZTogU3luYyBub3cgcmVjb25jaWxlcyBsb2NhbCBhbmQgcmVtb3RlIGNvbnRlbnQsIHN5bmNzIG5vdGVzIGFuZCBub24taW1hZ2UgYXR0YWNobWVudHMsIGFuZCBjbGVhbnMgZXh0cmEgcmVtb3RlIGZpbGVzLiBJbWFnZSB1cGxvYWRzIGNvbnRpbnVlIHRvIGJlIGhhbmRsZWQgYnkgdGhlIHNlcGFyYXRlIHF1ZXVlLlwiKX1gLFxuICAgICAgICAgIGAke3RoaXMucGx1Z2luLmZvcm1hdExhc3RTeW5jTGFiZWwoKX1cXG4ke3RoaXMucGx1Z2luLmZvcm1hdFN5bmNTdGF0dXNMYWJlbCgpfVxcbiR7dGhpcy5wbHVnaW4udChcIlx1OEJGNFx1NjYwRVx1RkYxQVx1N0FDQlx1NTM3M1x1NTQwQ1x1NkI2NVx1NEYxQVx1NjI2N1x1ODg0Q1x1NjcyQ1x1NTczMFx1NEUwRVx1OEZEQ1x1N0FFRlx1NzY4NFx1NUJGOVx1OEQyNlx1RkYwQ1x1NTQwQ1x1NkI2NVx1N0IxNFx1OEJCMFx1NEUwRVx1OTc1RVx1NTZGRVx1NzI0N1x1OTY0NFx1NEVGNlx1RkYwQ1x1NUU3Nlx1NkUwNVx1NzQwNlx1OEZEQ1x1N0FFRlx1NTE5N1x1NEY1OVx1NjU4N1x1NEVGNlx1MzAwMlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NEVDRFx1NzUzMVx1NzJFQ1x1N0FDQlx1OTYxRlx1NTIxN1x1NTkwNFx1NzQwNlx1MzAwMlwiLCBcIk5vdGU6IFN5bmMgbm93IHJlY29uY2lsZXMgbG9jYWwgYW5kIHJlbW90ZSBjb250ZW50LCBzeW5jcyBub3RlcyBhbmQgbm9uLWltYWdlIGF0dGFjaG1lbnRzLCBhbmQgY2xlYW5zIGV4dHJhIHJlbW90ZSBmaWxlcy4gSW1hZ2UgdXBsb2FkcyBjb250aW51ZSB0byBiZSBoYW5kbGVkIGJ5IHRoZSBzZXBhcmF0ZSBxdWV1ZS5cIil9YCxcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodGhpcy5wbHVnaW4udChcIlx1N0FDQlx1NTM3M1x1NTQwQ1x1NkI2NVwiLCBcIlN5bmMgbm93XCIpKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50KHRydWUpO1xuICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZChmYWxzZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy5wbHVnaW4udChcIlx1NEUwMFx1NkIyMVx1NjAyN1x1NURFNVx1NTE3N1wiLCBcIk9uZS10aW1lIHRvb2xzXCIpIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4RkMxXHU3OUZCXHU2NTc0XHU1RTkzXHU1MzlGXHU3NTFGXHU1NkZFXHU3MjQ3XHU1RjE1XHU3NTI4XCIsIFwiTWlncmF0ZSBuYXRpdmUgaW1hZ2UgZW1iZWRzIGluIHZhdWx0XCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTYyNkJcdTYzQ0ZcdTY1NzRcdTVFOTNcdTYyNDBcdTY3MDkgTWFya2Rvd24gXHU3QjE0XHU4QkIwXHVGRjBDXHU2MjhBIE9ic2lkaWFuIFx1NTM5Rlx1NzUxRlx1NjcyQ1x1NTczMFx1NTZGRVx1NzI0N1x1NUYxNVx1NzUyOFx1RkYwOFx1NTk4MiAhW10oKSBcdTU0OEMgIVtbLi4uXV1cdUZGMDlcdTRFMEFcdTRGMjBcdTUyMzBcdThGRENcdTdBRUZcdTU2RkVcdTcyNDdcdTc2RUVcdTVGNTVcdUZGMENcdTVFNzZcdTY1MzlcdTUxOTlcdTRFM0Egc2VjdXJlLXdlYmRhdiBcdTRFRTNcdTc4MDFcdTU3NTdcdTMwMDJcdTY1RTdcdTcyNDggc3BhbiBcdTU0OENcdTY1RTlcdTY3MUYgd2ViZGF2LXNlY3VyZSBcdTk0RkVcdTYzQTVcdTRFNUZcdTRGMUFcdTRFMDBcdTVFNzZcdTY1MzZcdTY1NUJcdTUyMzBcdTY1QjBcdTY4M0NcdTVGMEZcdTMwMDJcIixcbiAgICAgICAgICBcIlNjYW4gYWxsIE1hcmtkb3duIG5vdGVzIGluIHRoZSB2YXVsdCwgdXBsb2FkIG5hdGl2ZSBsb2NhbCBpbWFnZSBlbWJlZHMgKHN1Y2ggYXMgIVtdKCkgYW5kICFbWy4uLl1dKSB0byB0aGUgcmVtb3RlIGltYWdlIGZvbGRlciwgYW5kIHJld3JpdGUgdGhlbSBhcyBzZWN1cmUtd2ViZGF2IGNvZGUgYmxvY2tzLiBMZWdhY3kgc3BhbiB0YWdzIGFuZCBlYXJseSB3ZWJkYXYtc2VjdXJlIGxpbmtzIGFyZSBhbHNvIG5vcm1hbGl6ZWQgdG8gdGhlIG5ldyBmb3JtYXQuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KHRoaXMucGx1Z2luLnQoXCJcdTVGMDBcdTU5Q0JcdThGQzFcdTc5RkJcIiwgXCJSdW4gbWlncmF0aW9uXCIpKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLm1pZ3JhdGVBbGxMZWdhY3lTZWN1cmVJbWFnZXMoKTtcbiAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKGZhbHNlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgfVxufVxuXG5jbGFzcyBSZXN1bHRNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgcHJpdmF0ZSByZWFkb25seSB0aXRsZVRleHQ6IHN0cmluZztcbiAgcHJpdmF0ZSByZWFkb25seSBib2R5VGV4dDogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCB0aXRsZVRleHQ6IHN0cmluZywgYm9keVRleHQ6IHN0cmluZykge1xuICAgIHN1cGVyKGFwcCk7XG4gICAgdGhpcy50aXRsZVRleHQgPSB0aXRsZVRleHQ7XG4gICAgdGhpcy5ib2R5VGV4dCA9IGJvZHlUZXh0O1xuICB9XG5cbiAgb25PcGVuKCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy50aXRsZVRleHQgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IHRoaXMuYm9keVRleHQgfSk7XG4gIH1cblxuICBvbkNsb3NlKCk6IHZvaWQge1xuICAgIHRoaXMuY29udGVudEVsLmVtcHR5KCk7XG4gIH1cbn1cblxuIiwgImltcG9ydCB7IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQsIE1hcmtkb3duUmVuZGVyQ2hpbGQgfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuZXhwb3J0IGNvbnN0IFNFQ1VSRV9QUk9UT0NPTCA9IFwid2ViZGF2LXNlY3VyZTpcIjtcbmV4cG9ydCBjb25zdCBTRUNVUkVfQ09ERV9CTE9DSyA9IFwic2VjdXJlLXdlYmRhdlwiO1xuXG5leHBvcnQgdHlwZSBTZWN1cmVXZWJkYXZJbWFnZUJsb2NrID0ge1xuICBwYXRoOiBzdHJpbmc7XG4gIGFsdDogc3RyaW5nO1xufTtcblxudHlwZSBTZWN1cmVXZWJkYXZJbWFnZVN1cHBvcnREZXBzID0ge1xuICB0OiAoemg6IHN0cmluZywgZW46IHN0cmluZykgPT4gc3RyaW5nO1xuICBmZXRjaFNlY3VyZUltYWdlQmxvYlVybDogKHJlbW90ZVBhdGg6IHN0cmluZykgPT4gUHJvbWlzZTxzdHJpbmc+O1xufTtcblxuY2xhc3MgU2VjdXJlV2ViZGF2UmVuZGVyQ2hpbGQgZXh0ZW5kcyBNYXJrZG93blJlbmRlckNoaWxkIHtcbiAgY29uc3RydWN0b3IoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgc3VwZXIoY29udGFpbmVyRWwpO1xuICB9XG5cbiAgb251bmxvYWQoKTogdm9pZCB7fVxufVxuXG4vLyBLZWVwIHNlY3VyZSBpbWFnZSBwYXJzaW5nIGFuZCByZW5kZXJpbmcgaXNvbGF0ZWQgc28gc3luYyBjaGFuZ2VzIGRvIG5vdFxuLy8gYWNjaWRlbnRhbGx5IGJyZWFrIHRoZSBkaXNwbGF5IHBpcGVsaW5lIGFnYWluLlxuZXhwb3J0IGNsYXNzIFNlY3VyZVdlYmRhdkltYWdlU3VwcG9ydCB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgZGVwczogU2VjdXJlV2ViZGF2SW1hZ2VTdXBwb3J0RGVwcykge31cblxuICBidWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybDogc3RyaW5nLCBhbHQ6IHN0cmluZykge1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmV4dHJhY3RSZW1vdGVQYXRoKHJlbW90ZVVybCk7XG4gICAgaWYgKCFyZW1vdGVQYXRoKSB7XG4gICAgICByZXR1cm4gYCFbXSgke3JlbW90ZVVybH0pYDtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5idWlsZFNlY3VyZUltYWdlQ29kZUJsb2NrKHJlbW90ZVBhdGgsIGFsdCk7XG4gIH1cblxuICBidWlsZFNlY3VyZUltYWdlQ29kZUJsb2NrKHJlbW90ZVBhdGg6IHN0cmluZywgYWx0OiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkQWx0ID0gKGFsdCB8fCByZW1vdGVQYXRoKS5yZXBsYWNlKC9cXHI/XFxuL2csIFwiIFwiKS50cmltKCk7XG4gICAgY29uc3Qgbm9ybWFsaXplZFBhdGggPSByZW1vdGVQYXRoLnJlcGxhY2UoL1xccj9cXG4vZywgXCJcIikudHJpbSgpO1xuICAgIHJldHVybiBbYFxcYFxcYFxcYCR7U0VDVVJFX0NPREVfQkxPQ0t9YCwgYHBhdGg6ICR7bm9ybWFsaXplZFBhdGh9YCwgYGFsdDogJHtub3JtYWxpemVkQWx0fWAsIFwiYGBgXCJdLmpvaW4oXCJcXG5cIik7XG4gIH1cblxuICBwYXJzZVNlY3VyZUltYWdlQmxvY2soc291cmNlOiBzdHJpbmcpOiBTZWN1cmVXZWJkYXZJbWFnZUJsb2NrIHwgbnVsbCB7XG4gICAgY29uc3QgcmVzdWx0OiBTZWN1cmVXZWJkYXZJbWFnZUJsb2NrID0geyBwYXRoOiBcIlwiLCBhbHQ6IFwiXCIgfTtcbiAgICBmb3IgKGNvbnN0IHJhd0xpbmUgb2Ygc291cmNlLnNwbGl0KC9cXHI/XFxuLykpIHtcbiAgICAgIGNvbnN0IGxpbmUgPSByYXdMaW5lLnRyaW0oKTtcbiAgICAgIGlmICghbGluZSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc2VwYXJhdG9ySW5kZXggPSBsaW5lLmluZGV4T2YoXCI6XCIpO1xuICAgICAgaWYgKHNlcGFyYXRvckluZGV4ID09PSAtMSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qga2V5ID0gbGluZS5zbGljZSgwLCBzZXBhcmF0b3JJbmRleCkudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgICBjb25zdCB2YWx1ZSA9IGxpbmUuc2xpY2Uoc2VwYXJhdG9ySW5kZXggKyAxKS50cmltKCk7XG4gICAgICBpZiAoa2V5ID09PSBcInBhdGhcIikge1xuICAgICAgICByZXN1bHQucGF0aCA9IHZhbHVlO1xuICAgICAgfSBlbHNlIGlmIChrZXkgPT09IFwiYWx0XCIpIHtcbiAgICAgICAgcmVzdWx0LmFsdCA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQucGF0aCA/IHJlc3VsdCA6IG51bGw7XG4gIH1cblxuICBhc3luYyBwcm9jZXNzU2VjdXJlSW1hZ2VzKGVsOiBIVE1MRWxlbWVudCwgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0KSB7XG4gICAgY29uc3Qgc2VjdXJlQ29kZUJsb2NrcyA9IEFycmF5LmZyb20oZWwucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oYHByZSA+IGNvZGUubGFuZ3VhZ2UtJHtTRUNVUkVfQ09ERV9CTE9DS31gKSk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICBzZWN1cmVDb2RlQmxvY2tzLm1hcChhc3luYyAoY29kZUVsKSA9PiB7XG4gICAgICAgIGNvbnN0IHByZSA9IGNvZGVFbC5wYXJlbnRFbGVtZW50O1xuICAgICAgICBpZiAoIShwcmUgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkgfHwgcHJlLmhhc0F0dHJpYnV0ZShcImRhdGEtc2VjdXJlLXdlYmRhdi1yZW5kZXJlZFwiKSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IHRoaXMucGFyc2VTZWN1cmVJbWFnZUJsb2NrKGNvZGVFbC50ZXh0Q29udGVudCA/PyBcIlwiKTtcbiAgICAgICAgaWYgKCFwYXJzZWQ/LnBhdGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBwcmUuc2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2LXJlbmRlcmVkXCIsIFwidHJ1ZVwiKTtcbiAgICAgICAgYXdhaXQgdGhpcy5yZW5kZXJTZWN1cmVJbWFnZUludG9FbGVtZW50KHByZSwgcGFyc2VkLnBhdGgsIHBhcnNlZC5hbHQgfHwgcGFyc2VkLnBhdGgpO1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIGNvbnN0IHNlY3VyZU5vZGVzID0gQXJyYXkuZnJvbShlbC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcIltkYXRhLXNlY3VyZS13ZWJkYXZdXCIpKTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgIHNlY3VyZU5vZGVzLm1hcChhc3luYyAobm9kZSkgPT4ge1xuICAgICAgICBpZiAobm9kZSBpbnN0YW5jZW9mIEhUTUxJbWFnZUVsZW1lbnQpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLnN3YXBJbWFnZVNvdXJjZShub2RlKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZW1vdGVQYXRoID0gbm9kZS5nZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIik7XG4gICAgICAgIGlmICghcmVtb3RlUGF0aCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGltZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbWdcIik7XG4gICAgICAgIGltZy5hbHQgPSBub2RlLmdldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIikgPz8gbm9kZS5nZXRBdHRyaWJ1dGUoXCJhbHRcIikgPz8gXCJTZWN1cmUgV2ViREFWIGltYWdlXCI7XG4gICAgICAgIGltZy5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIiwgcmVtb3RlUGF0aCk7XG4gICAgICAgIGltZy5jbGFzc0xpc3QuYWRkKFwic2VjdXJlLXdlYmRhdi1pbWFnZVwiLCBcImlzLWxvYWRpbmdcIik7XG4gICAgICAgIG5vZGUucmVwbGFjZVdpdGgoaW1nKTtcbiAgICAgICAgYXdhaXQgdGhpcy5zd2FwSW1hZ2VTb3VyY2UoaW1nKTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zdCBzZWN1cmVMaW5rcyA9IEFycmF5LmZyb20oZWwucXVlcnlTZWxlY3RvckFsbDxIVE1MSW1hZ2VFbGVtZW50PihgaW1nW3NyY149XCIke1NFQ1VSRV9QUk9UT0NPTH0vL1wiXWApKTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChzZWN1cmVMaW5rcy5tYXAoYXN5bmMgKGltZykgPT4gdGhpcy5zd2FwSW1hZ2VTb3VyY2UoaW1nKSkpO1xuXG4gICAgY3R4LmFkZENoaWxkKG5ldyBTZWN1cmVXZWJkYXZSZW5kZXJDaGlsZChlbCkpO1xuICB9XG5cbiAgYXN5bmMgcHJvY2Vzc1NlY3VyZUNvZGVCbG9jayhzb3VyY2U6IHN0cmluZywgZWw6IEhUTUxFbGVtZW50LCBjdHg6IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQpIHtcbiAgICBjb25zdCBwYXJzZWQgPSB0aGlzLnBhcnNlU2VjdXJlSW1hZ2VCbG9jayhzb3VyY2UpO1xuICAgIGlmICghcGFyc2VkPy5wYXRoKSB7XG4gICAgICBlbC5jcmVhdGVFbChcImRpdlwiLCB7XG4gICAgICAgIHRleHQ6IHRoaXMuZGVwcy50KFwiXHU1Qjg5XHU1MTY4XHU1NkZFXHU3MjQ3XHU0RUUzXHU3ODAxXHU1NzU3XHU2ODNDXHU1RjBGXHU2NUUwXHU2NTQ4XHUzMDAyXCIsIFwiSW52YWxpZCBzZWN1cmUgaW1hZ2UgY29kZSBibG9jayBmb3JtYXQuXCIpLFxuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5yZW5kZXJTZWN1cmVJbWFnZUludG9FbGVtZW50KGVsLCBwYXJzZWQucGF0aCwgcGFyc2VkLmFsdCB8fCBwYXJzZWQucGF0aCk7XG4gICAgY3R4LmFkZENoaWxkKG5ldyBTZWN1cmVXZWJkYXZSZW5kZXJDaGlsZChlbCkpO1xuICB9XG5cbiAgZXh0cmFjdFJlbW90ZVBhdGgoc3JjOiBzdHJpbmcpIHtcbiAgICBjb25zdCBwcmVmaXggPSBgJHtTRUNVUkVfUFJPVE9DT0x9Ly9gO1xuICAgIGlmICghc3JjLnN0YXJ0c1dpdGgocHJlZml4KSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIHNyYy5zbGljZShwcmVmaXgubGVuZ3RoKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVuZGVyU2VjdXJlSW1hZ2VJbnRvRWxlbWVudChlbDogSFRNTEVsZW1lbnQsIHJlbW90ZVBhdGg6IHN0cmluZywgYWx0OiBzdHJpbmcpIHtcbiAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xuICAgIGltZy5hbHQgPSBhbHQ7XG4gICAgaW1nLnNldEF0dHJpYnV0ZShcImRhdGEtc2VjdXJlLXdlYmRhdlwiLCByZW1vdGVQYXRoKTtcbiAgICBpbWcuY2xhc3NMaXN0LmFkZChcInNlY3VyZS13ZWJkYXYtaW1hZ2VcIiwgXCJpcy1sb2FkaW5nXCIpO1xuICAgIGVsLmVtcHR5KCk7XG4gICAgZWwuYXBwZW5kQ2hpbGQoaW1nKTtcbiAgICBhd2FpdCB0aGlzLnN3YXBJbWFnZVNvdXJjZShpbWcpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzd2FwSW1hZ2VTb3VyY2UoaW1nOiBIVE1MSW1hZ2VFbGVtZW50KSB7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IGltZy5nZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIikgPz8gdGhpcy5leHRyYWN0UmVtb3RlUGF0aChpbWcuZ2V0QXR0cmlidXRlKFwic3JjXCIpID8/IFwiXCIpO1xuICAgIGlmICghcmVtb3RlUGF0aCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGltZy5jbGFzc0xpc3QuYWRkKFwic2VjdXJlLXdlYmRhdi1pbWFnZVwiLCBcImlzLWxvYWRpbmdcIik7XG4gICAgY29uc3Qgb3JpZ2luYWxBbHQgPSBpbWcuYWx0O1xuICAgIGltZy5hbHQgPSBvcmlnaW5hbEFsdCB8fCB0aGlzLmRlcHMudChcIlx1NTJBMFx1OEY3RFx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NEUyRC4uLlwiLCBcIkxvYWRpbmcgc2VjdXJlIGltYWdlLi4uXCIpO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGJsb2JVcmwgPSBhd2FpdCB0aGlzLmRlcHMuZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmwocmVtb3RlUGF0aCk7XG4gICAgICBpbWcuc3JjID0gYmxvYlVybDtcbiAgICAgIGltZy5hbHQgPSBvcmlnaW5hbEFsdDtcbiAgICAgIGltZy5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgICAgaW1nLnN0eWxlLm1heFdpZHRoID0gXCIxMDAlXCI7XG4gICAgICBpbWcuY2xhc3NMaXN0LnJlbW92ZShcImlzLWxvYWRpbmdcIiwgXCJpcy1lcnJvclwiKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIlNlY3VyZSBXZWJEQVYgaW1hZ2UgbG9hZCBmYWlsZWRcIiwgZXJyb3IpO1xuICAgICAgaW1nLnJlcGxhY2VXaXRoKHRoaXMuYnVpbGRFcnJvckVsZW1lbnQocmVtb3RlUGF0aCwgZXJyb3IpKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkRXJyb3JFbGVtZW50KHJlbW90ZVBhdGg6IHN0cmluZywgZXJyb3I6IHVua25vd24pIHtcbiAgICBjb25zdCBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgZWwuY2xhc3NOYW1lID0gXCJzZWN1cmUtd2ViZGF2LWltYWdlIGlzLWVycm9yXCI7XG4gICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcbiAgICBlbC50ZXh0Q29udGVudCA9IHRoaXMuZGVwcy50KFxuICAgICAgYFx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NTJBMFx1OEY3RFx1NTkzMVx1OEQyNVx1RkYxQSR7cmVtb3RlUGF0aH1cdUZGMDgke21lc3NhZ2V9XHVGRjA5YCxcbiAgICAgIGBTZWN1cmUgaW1hZ2UgZmFpbGVkOiAke3JlbW90ZVBhdGh9ICgke21lc3NhZ2V9KWAsXG4gICAgKTtcbiAgICByZXR1cm4gZWw7XG4gIH1cbn1cbiIsICJpbXBvcnQgeyBBcHAsIEVkaXRvciwgTWFya2Rvd25WaWV3LCBOb3RpY2UsIFRBYnN0cmFjdEZpbGUsIFRGaWxlIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmV4cG9ydCB0eXBlIFVwbG9hZFRhc2sgPSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5vdGVQYXRoOiBzdHJpbmc7XG4gIHBsYWNlaG9sZGVyOiBzdHJpbmc7XG4gIG1pbWVUeXBlOiBzdHJpbmc7XG4gIGZpbGVOYW1lOiBzdHJpbmc7XG4gIGRhdGFCYXNlNjQ6IHN0cmluZztcbiAgYXR0ZW1wdHM6IG51bWJlcjtcbiAgY3JlYXRlZEF0OiBudW1iZXI7XG4gIGxhc3RFcnJvcj86IHN0cmluZztcbn07XG5cbnR5cGUgU2VjdXJlV2ViZGF2VXBsb2FkUXVldWVEZXBzID0ge1xuICBhcHA6IEFwcDtcbiAgdDogKHpoOiBzdHJpbmcsIGVuOiBzdHJpbmcpID0+IHN0cmluZztcbiAgc2V0dGluZ3M6ICgpID0+IHsgbWF4UmV0cnlBdHRlbXB0czogbnVtYmVyOyByZXRyeURlbGF5U2Vjb25kczogbnVtYmVyIH07XG4gIGdldFF1ZXVlOiAoKSA9PiBVcGxvYWRUYXNrW107XG4gIHNldFF1ZXVlOiAocXVldWU6IFVwbG9hZFRhc2tbXSkgPT4gdm9pZDtcbiAgc2F2ZVBsdWdpblN0YXRlOiAoKSA9PiBQcm9taXNlPHZvaWQ+O1xuICBzY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmM6IChub3RlUGF0aDogc3RyaW5nLCByZWFzb246IFwiaW1hZ2UtYWRkXCIgfCBcImltYWdlLXJlbW92ZVwiKSA9PiB2b2lkO1xuICByZXF1ZXN0VXJsOiAob3B0aW9uczoge1xuICAgIHVybDogc3RyaW5nO1xuICAgIG1ldGhvZDogc3RyaW5nO1xuICAgIGhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICAgIGJvZHk/OiBBcnJheUJ1ZmZlcjtcbiAgICBmb2xsb3dSZWRpcmVjdHM/OiBib29sZWFuO1xuICAgIHJlZGlyZWN0Q291bnQ/OiBudW1iZXI7XG4gIH0pID0+IFByb21pc2U8eyBzdGF0dXM6IG51bWJlcjsgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPjsgYXJyYXlCdWZmZXI6IEFycmF5QnVmZmVyIH0+O1xuICBidWlsZFVwbG9hZFVybDogKHJlbW90ZVBhdGg6IHN0cmluZykgPT4gc3RyaW5nO1xuICBidWlsZEF1dGhIZWFkZXI6ICgpID0+IHN0cmluZztcbiAgcHJlcGFyZVVwbG9hZFBheWxvYWQ6IChcbiAgICBiaW5hcnk6IEFycmF5QnVmZmVyLFxuICAgIG1pbWVUeXBlOiBzdHJpbmcsXG4gICAgZmlsZU5hbWU6IHN0cmluZyxcbiAgKSA9PiBQcm9taXNlPHsgYmluYXJ5OiBBcnJheUJ1ZmZlcjsgbWltZVR5cGU6IHN0cmluZzsgZmlsZU5hbWU6IHN0cmluZyB9PjtcbiAgYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnk6IChmaWxlTmFtZTogc3RyaW5nLCBiaW5hcnk6IEFycmF5QnVmZmVyKSA9PiBQcm9taXNlPHN0cmluZz47XG4gIGJ1aWxkUmVtb3RlUGF0aDogKGZpbGVOYW1lOiBzdHJpbmcpID0+IHN0cmluZztcbiAgYnVpbGRTZWN1cmVJbWFnZU1hcmt1cDogKHJlbW90ZVVybDogc3RyaW5nLCBhbHQ6IHN0cmluZykgPT4gc3RyaW5nO1xuICBnZXRNaW1lVHlwZUZyb21GaWxlTmFtZTogKGZpbGVOYW1lOiBzdHJpbmcpID0+IHN0cmluZztcbiAgYXJyYXlCdWZmZXJUb0Jhc2U2NDogKGJ1ZmZlcjogQXJyYXlCdWZmZXIpID0+IHN0cmluZztcbiAgYmFzZTY0VG9BcnJheUJ1ZmZlcjogKGJhc2U2NDogc3RyaW5nKSA9PiBBcnJheUJ1ZmZlcjtcbiAgZXNjYXBlSHRtbDogKHZhbHVlOiBzdHJpbmcpID0+IHN0cmluZztcbiAgZXNjYXBlUmVnRXhwOiAodmFsdWU6IHN0cmluZykgPT4gc3RyaW5nO1xuICBkZXNjcmliZUVycm9yOiAocHJlZml4OiBzdHJpbmcsIGVycm9yOiB1bmtub3duKSA9PiBzdHJpbmc7XG59O1xuXG4vLyBPd25zIHRoZSBxdWV1ZWQgaW1hZ2UgdXBsb2FkIHdvcmtmbG93IHNvIHN5bmMgYW5kIG5vdGUgbG9naWMgY2FuIHN0YXkgc2VwYXJhdGUuXG5leHBvcnQgY2xhc3MgU2VjdXJlV2ViZGF2VXBsb2FkUXVldWVTdXBwb3J0IHtcbiAgcHJpdmF0ZSBwcm9jZXNzaW5nVGFza0lkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIHJldHJ5VGltZW91dHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICBwcml2YXRlIHBlbmRpbmdUYXNrUHJvbWlzZXMgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTx2b2lkPj4oKTtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGRlcHM6IFNlY3VyZVdlYmRhdlVwbG9hZFF1ZXVlRGVwcykge31cblxuICBkaXNwb3NlKCkge1xuICAgIGZvciAoY29uc3QgdGltZW91dElkIG9mIHRoaXMucmV0cnlUaW1lb3V0cy52YWx1ZXMoKSkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xuICAgIH1cbiAgICB0aGlzLnJldHJ5VGltZW91dHMuY2xlYXIoKTtcbiAgfVxuXG4gIGhhc1BlbmRpbmdXb3JrKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmRlcHMuZ2V0UXVldWUoKS5sZW5ndGggPiAwIHx8XG4gICAgICB0aGlzLnByb2Nlc3NpbmdUYXNrSWRzLnNpemUgPiAwIHx8XG4gICAgICB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMuc2l6ZSA+IDBcbiAgICApO1xuICB9XG5cbiAgaGFzUGVuZGluZ1dvcmtGb3JOb3RlKG5vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBxdWV1ZSA9IHRoaXMuZGVwcy5nZXRRdWV1ZSgpO1xuICAgIGlmIChxdWV1ZS5zb21lKCh0YXNrKSA9PiB0YXNrLm5vdGVQYXRoID09PSBub3RlUGF0aCkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgdGFza0lkIG9mIHRoaXMucHJvY2Vzc2luZ1Rhc2tJZHMpIHtcbiAgICAgIGNvbnN0IHRhc2sgPSBxdWV1ZS5maW5kKChpdGVtKSA9PiBpdGVtLmlkID09PSB0YXNrSWQpO1xuICAgICAgaWYgKHRhc2s/Lm5vdGVQYXRoID09PSBub3RlUGF0aCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IFt0YXNrSWRdIG9mIHRoaXMucGVuZGluZ1Rhc2tQcm9taXNlcykge1xuICAgICAgY29uc3QgdGFzayA9IHF1ZXVlLmZpbmQoKGl0ZW0pID0+IGl0ZW0uaWQgPT09IHRhc2tJZCk7XG4gICAgICBpZiAodGFzaz8ubm90ZVBhdGggPT09IG5vdGVQYXRoKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGFzeW5jIGVucXVldWVFZGl0b3JJbWFnZVVwbG9hZChub3RlRmlsZTogVEZpbGUsIGVkaXRvcjogRWRpdG9yLCBpbWFnZUZpbGU6IEZpbGUsIGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgYXJyYXlCdWZmZXIgPSBhd2FpdCBpbWFnZUZpbGUuYXJyYXlCdWZmZXIoKTtcbiAgICAgIGNvbnN0IHRhc2sgPSB0aGlzLmNyZWF0ZVVwbG9hZFRhc2soXG4gICAgICAgIG5vdGVGaWxlLnBhdGgsXG4gICAgICAgIGFycmF5QnVmZmVyLFxuICAgICAgICBpbWFnZUZpbGUudHlwZSB8fCB0aGlzLmRlcHMuZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUoZmlsZU5hbWUpLFxuICAgICAgICBmaWxlTmFtZSxcbiAgICAgICk7XG4gICAgICB0aGlzLmluc2VydFBsYWNlaG9sZGVyKGVkaXRvciwgdGFzay5wbGFjZWhvbGRlcik7XG4gICAgICB0aGlzLmRlcHMuc2V0UXVldWUoWy4uLnRoaXMuZGVwcy5nZXRRdWV1ZSgpLCB0YXNrXSk7XG4gICAgICBhd2FpdCB0aGlzLmRlcHMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICB2b2lkIHRoaXMucHJvY2Vzc1BlbmRpbmdUYXNrcygpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlcHMudChcIlx1NURGMlx1NTJBMFx1NTE2NVx1NTZGRVx1NzI0N1x1ODFFQVx1NTJBOFx1NEUwQVx1NEYyMFx1OTYxRlx1NTIxN1x1MzAwMlwiLCBcIkltYWdlIGFkZGVkIHRvIHRoZSBhdXRvLXVwbG9hZCBxdWV1ZS5cIikpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHF1ZXVlIHNlY3VyZSBpbWFnZSB1cGxvYWRcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgdGhpcy5kZXBzLmRlc2NyaWJlRXJyb3IoXG4gICAgICAgICAgdGhpcy5kZXBzLnQoXCJcdTUyQTBcdTUxNjVcdTU2RkVcdTcyNDdcdTgxRUFcdTUyQThcdTRFMEFcdTRGMjBcdTk2MUZcdTUyMTdcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gcXVldWUgaW1hZ2UgZm9yIGF1dG8tdXBsb2FkXCIpLFxuICAgICAgICAgIGVycm9yLFxuICAgICAgICApLFxuICAgICAgICA4MDAwLFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBjcmVhdGVVcGxvYWRUYXNrKG5vdGVQYXRoOiBzdHJpbmcsIGJpbmFyeTogQXJyYXlCdWZmZXIsIG1pbWVUeXBlOiBzdHJpbmcsIGZpbGVOYW1lOiBzdHJpbmcpOiBVcGxvYWRUYXNrIHtcbiAgICBjb25zdCBpZCA9IGBzZWN1cmUtd2ViZGF2LXRhc2stJHtEYXRlLm5vdygpfS0ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIsIDgpfWA7XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkLFxuICAgICAgbm90ZVBhdGgsXG4gICAgICBwbGFjZWhvbGRlcjogdGhpcy5idWlsZFBlbmRpbmdQbGFjZWhvbGRlcihpZCwgZmlsZU5hbWUpLFxuICAgICAgbWltZVR5cGUsXG4gICAgICBmaWxlTmFtZSxcbiAgICAgIGRhdGFCYXNlNjQ6IHRoaXMuZGVwcy5hcnJheUJ1ZmZlclRvQmFzZTY0KGJpbmFyeSksXG4gICAgICBhdHRlbXB0czogMCxcbiAgICAgIGNyZWF0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICB9O1xuICB9XG5cbiAgYnVpbGRQZW5kaW5nUGxhY2Vob2xkZXIodGFza0lkOiBzdHJpbmcsIGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBzYWZlTmFtZSA9IHRoaXMuZGVwcy5lc2NhcGVIdG1sKGZpbGVOYW1lKTtcbiAgICByZXR1cm4gYDxzcGFuIGNsYXNzPVwic2VjdXJlLXdlYmRhdi1wZW5kaW5nXCIgZGF0YS1zZWN1cmUtd2ViZGF2LXRhc2s9XCIke3Rhc2tJZH1cIiBhcmlhLWxhYmVsPVwiJHtzYWZlTmFtZX1cIj4ke3RoaXMuZGVwcy5lc2NhcGVIdG1sKHRoaXMuZGVwcy50KGBcdTMwMTBcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTRFMkRcdUZGNUMke2ZpbGVOYW1lfVx1MzAxMWAsIGBbVXBsb2FkaW5nIGltYWdlIHwgJHtmaWxlTmFtZX1dYCkpfTwvc3Bhbj5gO1xuICB9XG5cbiAgYnVpbGRGYWlsZWRQbGFjZWhvbGRlcihmaWxlTmFtZTogc3RyaW5nLCBtZXNzYWdlPzogc3RyaW5nKSB7XG4gICAgY29uc3Qgc2FmZU5hbWUgPSB0aGlzLmRlcHMuZXNjYXBlSHRtbChmaWxlTmFtZSk7XG4gICAgY29uc3Qgc2FmZU1lc3NhZ2UgPSB0aGlzLmRlcHMuZXNjYXBlSHRtbChtZXNzYWdlID8/IHRoaXMuZGVwcy50KFwiXHU2NzJBXHU3N0U1XHU5NTE5XHU4QkVGXCIsIFwiVW5rbm93biBlcnJvclwiKSk7XG4gICAgY29uc3QgbGFiZWwgPSB0aGlzLmRlcHMuZXNjYXBlSHRtbCh0aGlzLmRlcHMudChgXHUzMDEwXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU1OTMxXHU4RDI1XHVGRjVDJHtmaWxlTmFtZX1cdTMwMTFgLCBgW0ltYWdlIHVwbG9hZCBmYWlsZWQgfCAke2ZpbGVOYW1lfV1gKSk7XG4gICAgcmV0dXJuIGA8c3BhbiBjbGFzcz1cInNlY3VyZS13ZWJkYXYtZmFpbGVkXCIgYXJpYS1sYWJlbD1cIiR7c2FmZU5hbWV9XCI+JHtsYWJlbH06ICR7c2FmZU1lc3NhZ2V9PC9zcGFuPmA7XG4gIH1cblxuICBhc3luYyBwcm9jZXNzUGVuZGluZ1Rhc2tzKCkge1xuICAgIGNvbnN0IHJ1bm5pbmc6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuICAgIGZvciAoY29uc3QgdGFzayBvZiB0aGlzLmRlcHMuZ2V0UXVldWUoKSkge1xuICAgICAgaWYgKHRoaXMucHJvY2Vzc2luZ1Rhc2tJZHMuaGFzKHRhc2suaWQpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBydW5uaW5nLnB1c2godGhpcy5zdGFydFBlbmRpbmdUYXNrKHRhc2spKTtcbiAgICB9XG5cbiAgICBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQocnVubmluZyk7XG4gIH1cblxuICBzdGFydFBlbmRpbmdUYXNrKHRhc2s6IFVwbG9hZFRhc2spIHtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMucGVuZGluZ1Rhc2tQcm9taXNlcy5nZXQodGFzay5pZCk7XG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICByZXR1cm4gZXhpc3Rpbmc7XG4gICAgfVxuXG4gICAgY29uc3QgcHJvbWlzZSA9IHRoaXMucHJvY2Vzc1Rhc2sodGFzaykuZmluYWxseSgoKSA9PiB7XG4gICAgICB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMuZGVsZXRlKHRhc2suaWQpO1xuICAgIH0pO1xuICAgIHRoaXMucGVuZGluZ1Rhc2tQcm9taXNlcy5zZXQodGFzay5pZCwgcHJvbWlzZSk7XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICBhc3luYyBwcm9jZXNzVGFzayh0YXNrOiBVcGxvYWRUYXNrKSB7XG4gICAgdGhpcy5wcm9jZXNzaW5nVGFza0lkcy5hZGQodGFzay5pZCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGJpbmFyeSA9IHRoaXMuZGVwcy5iYXNlNjRUb0FycmF5QnVmZmVyKHRhc2suZGF0YUJhc2U2NCk7XG4gICAgICBjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRoaXMuZGVwcy5wcmVwYXJlVXBsb2FkUGF5bG9hZChcbiAgICAgICAgYmluYXJ5LFxuICAgICAgICB0YXNrLm1pbWVUeXBlIHx8IHRoaXMuZGVwcy5nZXRNaW1lVHlwZUZyb21GaWxlTmFtZSh0YXNrLmZpbGVOYW1lKSxcbiAgICAgICAgdGFzay5maWxlTmFtZSxcbiAgICAgICk7XG4gICAgICBjb25zdCByZW1vdGVOYW1lID0gYXdhaXQgdGhpcy5kZXBzLmJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5KHByZXBhcmVkLmZpbGVOYW1lLCBwcmVwYXJlZC5iaW5hcnkpO1xuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuZGVwcy5idWlsZFJlbW90ZVBhdGgocmVtb3RlTmFtZSk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZGVwcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmRlcHMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICAgIG1ldGhvZDogXCJQVVRcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuZGVwcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBwcmVwYXJlZC5taW1lVHlwZSxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogcHJlcGFyZWQuYmluYXJ5LFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVwbG9hZCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlcGxhY2VkID0gYXdhaXQgdGhpcy5yZXBsYWNlUGxhY2Vob2xkZXIoXG4gICAgICAgIHRhc2subm90ZVBhdGgsXG4gICAgICAgIHRhc2suaWQsXG4gICAgICAgIHRhc2sucGxhY2Vob2xkZXIsXG4gICAgICAgIHRoaXMuZGVwcy5idWlsZFNlY3VyZUltYWdlTWFya3VwKGB3ZWJkYXYtc2VjdXJlOi8vJHtyZW1vdGVQYXRofWAsIHByZXBhcmVkLmZpbGVOYW1lKSxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlcGxhY2VkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICB0aGlzLmRlcHMudChcbiAgICAgICAgICAgIFwiXHU0RTBBXHU0RjIwXHU2MjEwXHU1MjlGXHVGRjBDXHU0RjQ2XHU2Q0ExXHU2NzA5XHU1NzI4XHU3QjE0XHU4QkIwXHU0RTJEXHU2MjdFXHU1MjMwXHU1M0VGXHU2NkZGXHU2MzYyXHU3Njg0XHU1MzYwXHU0RjREXHU3QjI2XHUzMDAyXCIsXG4gICAgICAgICAgICBcIlVwbG9hZCBzdWNjZWVkZWQsIGJ1dCBubyBtYXRjaGluZyBwbGFjZWhvbGRlciB3YXMgZm91bmQgaW4gdGhlIG5vdGUuXCIsXG4gICAgICAgICAgKSxcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5kZXBzLnNldFF1ZXVlKHRoaXMuZGVwcy5nZXRRdWV1ZSgpLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5pZCAhPT0gdGFzay5pZCkpO1xuICAgICAgYXdhaXQgdGhpcy5kZXBzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgdGhpcy5kZXBzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyh0YXNrLm5vdGVQYXRoLCBcImltYWdlLWFkZFwiKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXBzLnQoXCJcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTYyMTBcdTUyOUZcdTMwMDJcIiwgXCJJbWFnZSB1cGxvYWRlZCBzdWNjZXNzZnVsbHkuXCIpKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIlNlY3VyZSBXZWJEQVYgcXVldWVkIHVwbG9hZCBmYWlsZWRcIiwgZXJyb3IpO1xuICAgICAgdGFzay5hdHRlbXB0cyArPSAxO1xuICAgICAgdGFzay5sYXN0RXJyb3IgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG4gICAgICBhd2FpdCB0aGlzLmRlcHMuc2F2ZVBsdWdpblN0YXRlKCk7XG5cbiAgICAgIGlmICh0YXNrLmF0dGVtcHRzID49IHRoaXMuZGVwcy5zZXR0aW5ncygpLm1heFJldHJ5QXR0ZW1wdHMpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5yZXBsYWNlUGxhY2Vob2xkZXIoXG4gICAgICAgICAgdGFzay5ub3RlUGF0aCxcbiAgICAgICAgICB0YXNrLmlkLFxuICAgICAgICAgIHRhc2sucGxhY2Vob2xkZXIsXG4gICAgICAgICAgdGhpcy5idWlsZEZhaWxlZFBsYWNlaG9sZGVyKHRhc2suZmlsZU5hbWUsIHRhc2subGFzdEVycm9yKSxcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5kZXBzLnNldFF1ZXVlKHRoaXMuZGVwcy5nZXRRdWV1ZSgpLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5pZCAhPT0gdGFzay5pZCkpO1xuICAgICAgICBhd2FpdCB0aGlzLmRlcHMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXBzLmRlc2NyaWJlRXJyb3IodGhpcy5kZXBzLnQoXCJcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTY3MDBcdTdFQzhcdTU5MzFcdThEMjVcIiwgXCJJbWFnZSB1cGxvYWQgZmFpbGVkIHBlcm1hbmVudGx5XCIpLCBlcnJvciksIDgwMDApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5zY2hlZHVsZVJldHJ5KHRhc2spO1xuICAgICAgfVxuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLnByb2Nlc3NpbmdUYXNrSWRzLmRlbGV0ZSh0YXNrLmlkKTtcbiAgICB9XG4gIH1cblxuICBzY2hlZHVsZVJldHJ5KHRhc2s6IFVwbG9hZFRhc2spIHtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMucmV0cnlUaW1lb3V0cy5nZXQodGFzay5pZCk7XG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KGV4aXN0aW5nKTtcbiAgICB9XG5cbiAgICBjb25zdCBkZWxheSA9IE1hdGgubWF4KDEsIHRoaXMuZGVwcy5zZXR0aW5ncygpLnJldHJ5RGVsYXlTZWNvbmRzKSAqIDEwMDAgKiB0YXNrLmF0dGVtcHRzO1xuICAgIGNvbnN0IHRpbWVvdXRJZCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRoaXMucmV0cnlUaW1lb3V0cy5kZWxldGUodGFzay5pZCk7XG4gICAgICB2b2lkIHRoaXMuc3RhcnRQZW5kaW5nVGFzayh0YXNrKTtcbiAgICB9LCBkZWxheSk7XG4gICAgdGhpcy5yZXRyeVRpbWVvdXRzLnNldCh0YXNrLmlkLCB0aW1lb3V0SWQpO1xuICB9XG5cbiAgcHJpdmF0ZSBpbnNlcnRQbGFjZWhvbGRlcihlZGl0b3I6IEVkaXRvciwgcGxhY2Vob2xkZXI6IHN0cmluZykge1xuICAgIGVkaXRvci5yZXBsYWNlU2VsZWN0aW9uKGAke3BsYWNlaG9sZGVyfVxcbmApO1xuICB9XG5cbiAgYXN5bmMgcmVwbGFjZVBsYWNlaG9sZGVyKG5vdGVQYXRoOiBzdHJpbmcsIHRhc2tJZDogc3RyaW5nLCBwbGFjZWhvbGRlcjogc3RyaW5nLCByZXBsYWNlbWVudDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVwbGFjZWRJbkVkaXRvciA9IHRoaXMucmVwbGFjZVBsYWNlaG9sZGVySW5PcGVuRWRpdG9ycyhub3RlUGF0aCwgdGFza0lkLCBwbGFjZWhvbGRlciwgcmVwbGFjZW1lbnQpO1xuICAgIGlmIChyZXBsYWNlZEluRWRpdG9yKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBjb25zdCBmaWxlID0gdGhpcy5kZXBzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgobm90ZVBhdGgpO1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5kZXBzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGlmIChjb250ZW50LmluY2x1ZGVzKHBsYWNlaG9sZGVyKSkge1xuICAgICAgY29uc3QgdXBkYXRlZCA9IGNvbnRlbnQucmVwbGFjZShwbGFjZWhvbGRlciwgcmVwbGFjZW1lbnQpO1xuICAgICAgaWYgKHVwZGF0ZWQgIT09IGNvbnRlbnQpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5kZXBzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdXBkYXRlZCk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHBhdHRlcm4gPSBuZXcgUmVnRXhwKFxuICAgICAgYDxzcGFuW14+XSpkYXRhLXNlY3VyZS13ZWJkYXYtdGFzaz1cIiR7dGhpcy5kZXBzLmVzY2FwZVJlZ0V4cCh0YXNrSWQpfVwiW14+XSo+Lio/PFxcXFwvc3Bhbj5gLFxuICAgICAgXCJzXCIsXG4gICAgKTtcbiAgICBpZiAocGF0dGVybi50ZXN0KGNvbnRlbnQpKSB7XG4gICAgICBjb25zdCB1cGRhdGVkID0gY29udGVudC5yZXBsYWNlKHBhdHRlcm4sIHJlcGxhY2VtZW50KTtcbiAgICAgIGlmICh1cGRhdGVkICE9PSBjb250ZW50KSB7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVwcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIHVwZGF0ZWQpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBwcml2YXRlIHJlcGxhY2VQbGFjZWhvbGRlckluT3BlbkVkaXRvcnMobm90ZVBhdGg6IHN0cmluZywgdGFza0lkOiBzdHJpbmcsIHBsYWNlaG9sZGVyOiBzdHJpbmcsIHJlcGxhY2VtZW50OiBzdHJpbmcpIHtcbiAgICBsZXQgcmVwbGFjZWQgPSBmYWxzZTtcbiAgICBjb25zdCBsZWF2ZXMgPSB0aGlzLmRlcHMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoXCJtYXJrZG93blwiKTtcblxuICAgIGZvciAoY29uc3QgbGVhZiBvZiBsZWF2ZXMpIHtcbiAgICAgIGNvbnN0IHZpZXcgPSBsZWFmLnZpZXc7XG4gICAgICBpZiAoISh2aWV3IGluc3RhbmNlb2YgTWFya2Rvd25WaWV3KSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCF2aWV3LmZpbGUgfHwgdmlldy5maWxlLnBhdGggIT09IG5vdGVQYXRoKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBlZGl0b3IgPSB2aWV3LmVkaXRvcjtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBlZGl0b3IuZ2V0VmFsdWUoKTtcbiAgICAgIGxldCB1cGRhdGVkID0gY29udGVudDtcblxuICAgICAgaWYgKGNvbnRlbnQuaW5jbHVkZXMocGxhY2Vob2xkZXIpKSB7XG4gICAgICAgIHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGxhY2Vob2xkZXIsIHJlcGxhY2VtZW50KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHBhdHRlcm4gPSBuZXcgUmVnRXhwKFxuICAgICAgICAgIGA8c3BhbltePl0qZGF0YS1zZWN1cmUtd2ViZGF2LXRhc2s9XCIke3RoaXMuZGVwcy5lc2NhcGVSZWdFeHAodGFza0lkKX1cIltePl0qPi4qPzxcXFxcL3NwYW4+YCxcbiAgICAgICAgICBcInNcIixcbiAgICAgICAgKTtcbiAgICAgICAgdXBkYXRlZCA9IGNvbnRlbnQucmVwbGFjZShwYXR0ZXJuLCByZXBsYWNlbWVudCk7XG4gICAgICB9XG5cbiAgICAgIGlmICh1cGRhdGVkICE9PSBjb250ZW50KSB7XG4gICAgICAgIGVkaXRvci5zZXRWYWx1ZSh1cGRhdGVkKTtcbiAgICAgICAgcmVwbGFjZWQgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZXBsYWNlZDtcbiAgfVxufVxuIiwgImltcG9ydCB7IEFwcCwgVEZpbGUsIG5vcm1hbGl6ZVBhdGggfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuZXhwb3J0IHR5cGUgRGVsZXRpb25Ub21ic3RvbmUgPSB7XG4gIHBhdGg6IHN0cmluZztcbiAgZGVsZXRlZEF0OiBudW1iZXI7XG4gIHJlbW90ZVNpZ25hdHVyZT86IHN0cmluZztcbn07XG5cbmV4cG9ydCB0eXBlIFJlbW90ZUZpbGVMaWtlID0ge1xuICByZW1vdGVQYXRoOiBzdHJpbmc7XG4gIGxhc3RNb2RpZmllZDogbnVtYmVyO1xuICBzaXplOiBudW1iZXI7XG4gIHNpZ25hdHVyZTogc3RyaW5nO1xufTtcblxudHlwZSBTZWN1cmVXZWJkYXZTeW5jU3VwcG9ydERlcHMgPSB7XG4gIGFwcDogQXBwO1xuICBnZXRWYXVsdFN5bmNSZW1vdGVGb2xkZXI6ICgpID0+IHN0cmluZztcbiAgZGVsZXRpb25Gb2xkZXJTdWZmaXg6IHN0cmluZztcbiAgZW5jb2RlQmFzZTY0VXJsOiAodmFsdWU6IHN0cmluZykgPT4gc3RyaW5nO1xuICBkZWNvZGVCYXNlNjRVcmw6ICh2YWx1ZTogc3RyaW5nKSA9PiBzdHJpbmc7XG59O1xuXG4vLyBLZWVwIHN5bmMgbWV0YWRhdGEgYW5kIHRvbWJzdG9uZSBydWxlcyBpc29sYXRlZCBzbyBxdWV1ZS9yZW5kZXJpbmcgY2hhbmdlc1xuLy8gZG8gbm90IGFjY2lkZW50YWxseSBhZmZlY3QgcmVjb25jaWxpYXRpb24gYmVoYXZpb3VyLlxuZXhwb3J0IGNsYXNzIFNlY3VyZVdlYmRhdlN5bmNTdXBwb3J0IHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBkZXBzOiBTZWN1cmVXZWJkYXZTeW5jU3VwcG9ydERlcHMpIHt9XG5cbiAgc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IG5vcm1hbGl6ZVBhdGgocGF0aCk7XG4gICAgaWYgKFxuICAgICAgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIi5vYnNpZGlhbi9cIikgfHxcbiAgICAgIG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIudHJhc2gvXCIpIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwiLmdpdC9cIikgfHxcbiAgICAgIG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCJub2RlX21vZHVsZXMvXCIpIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwiX3BsdWdpbl9wYWNrYWdlcy9cIikgfHxcbiAgICAgIG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIudG1wLVwiKSB8fFxuICAgICAgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIi5vYnNpZGlhbi9wbHVnaW5zL3NlY3VyZS13ZWJkYXYtaW1hZ2VzL1wiKVxuICAgICkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIC9cXC4ocG5nfGpwZT9nfGdpZnx3ZWJwfGJtcHxzdmcpJC9pLnRlc3Qobm9ybWFsaXplZFBhdGgpO1xuICB9XG5cbiAgY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCkge1xuICAgIHJldHVybiB0aGlzLmRlcHMuYXBwLnZhdWx0XG4gICAgICAuZ2V0RmlsZXMoKVxuICAgICAgLmZpbHRlcigoZmlsZSkgPT4gIXRoaXMuc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChmaWxlLnBhdGgpKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGEucGF0aC5sb2NhbGVDb21wYXJlKGIucGF0aCkpO1xuICB9XG5cbiAgYnVpbGRTeW5jU2lnbmF0dXJlKGZpbGU6IFRGaWxlKSB7XG4gICAgcmV0dXJuIGAke2ZpbGUuc3RhdC5tdGltZX06JHtmaWxlLnN0YXQuc2l6ZX1gO1xuICB9XG5cbiAgYnVpbGRSZW1vdGVTeW5jU2lnbmF0dXJlKHJlbW90ZTogUGljazxSZW1vdGVGaWxlTGlrZSwgXCJsYXN0TW9kaWZpZWRcIiB8IFwic2l6ZVwiPikge1xuICAgIHJldHVybiBgJHtyZW1vdGUubGFzdE1vZGlmaWVkfToke3JlbW90ZS5zaXplfWA7XG4gIH1cblxuICBidWlsZFZhdWx0U3luY1JlbW90ZVBhdGgodmF1bHRQYXRoOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5kZXBzLmdldFZhdWx0U3luY1JlbW90ZUZvbGRlcigpKX0ke3ZhdWx0UGF0aH1gO1xuICB9XG5cbiAgYnVpbGREZWxldGlvbkZvbGRlcigpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5kZXBzLmdldFZhdWx0U3luY1JlbW90ZUZvbGRlcigpKS5yZXBsYWNlKC9cXC8kLywgXCJcIil9JHt0aGlzLmRlcHMuZGVsZXRpb25Gb2xkZXJTdWZmaXh9YDtcbiAgfVxuXG4gIGJ1aWxkRGVsZXRpb25SZW1vdGVQYXRoKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGAke3RoaXMuYnVpbGREZWxldGlvbkZvbGRlcigpfSR7dGhpcy5kZXBzLmVuY29kZUJhc2U2NFVybCh2YXVsdFBhdGgpfS5qc29uYDtcbiAgfVxuXG4gIHJlbW90ZURlbGV0aW9uUGF0aFRvVmF1bHRQYXRoKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHJvb3QgPSB0aGlzLmJ1aWxkRGVsZXRpb25Gb2xkZXIoKTtcbiAgICBpZiAoIXJlbW90ZVBhdGguc3RhcnRzV2l0aChyb290KSB8fCAhcmVtb3RlUGF0aC5lbmRzV2l0aChcIi5qc29uXCIpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBlbmNvZGVkID0gcmVtb3RlUGF0aC5zbGljZShyb290Lmxlbmd0aCwgLVwiLmpzb25cIi5sZW5ndGgpO1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gdGhpcy5kZXBzLmRlY29kZUJhc2U2NFVybChlbmNvZGVkKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIHBhcnNlRGVsZXRpb25Ub21ic3RvbmVQYXlsb2FkKHJhdzogc3RyaW5nKTogRGVsZXRpb25Ub21ic3RvbmUgfCBudWxsIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpO1xuICAgICAgaWYgKCFwYXJzZWQgfHwgdHlwZW9mIHBhcnNlZC5wYXRoICE9PSBcInN0cmluZ1wiIHx8IHR5cGVvZiBwYXJzZWQuZGVsZXRlZEF0ICE9PSBcIm51bWJlclwiKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgaWYgKHBhcnNlZC5yZW1vdGVTaWduYXR1cmUgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgcGFyc2VkLnJlbW90ZVNpZ25hdHVyZSAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHBhdGg6IHBhcnNlZC5wYXRoLFxuICAgICAgICBkZWxldGVkQXQ6IHBhcnNlZC5kZWxldGVkQXQsXG4gICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcGFyc2VkLnJlbW90ZVNpZ25hdHVyZSxcbiAgICAgIH07XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cblxuICByZW1vdGVQYXRoVG9WYXVsdFBhdGgocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgcm9vdCA9IHRoaXMubm9ybWFsaXplRm9sZGVyKHRoaXMuZGVwcy5nZXRWYXVsdFN5bmNSZW1vdGVGb2xkZXIoKSk7XG4gICAgaWYgKCFyZW1vdGVQYXRoLnN0YXJ0c1dpdGgocm9vdCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiByZW1vdGVQYXRoLnNsaWNlKHJvb3QubGVuZ3RoKS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpO1xuICB9XG5cbiAgc2hvdWxkRG93bmxvYWRSZW1vdGVWZXJzaW9uKGxvY2FsTXRpbWU6IG51bWJlciwgcmVtb3RlTXRpbWU6IG51bWJlcikge1xuICAgIHJldHVybiByZW1vdGVNdGltZSA+IGxvY2FsTXRpbWUgKyAyMDAwO1xuICB9XG5cbiAgaXNUb21ic3RvbmVBdXRob3JpdGF0aXZlKFxuICAgIHRvbWJzdG9uZTogRGVsZXRpb25Ub21ic3RvbmUsXG4gICAgcmVtb3RlPzogUGljazxSZW1vdGVGaWxlTGlrZSwgXCJsYXN0TW9kaWZpZWRcIiB8IFwic2lnbmF0dXJlXCI+IHwgbnVsbCxcbiAgKSB7XG4gICAgY29uc3QgZ3JhY2VNcyA9IDUwMDA7XG4gICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmICh0b21ic3RvbmUucmVtb3RlU2lnbmF0dXJlKSB7XG4gICAgICByZXR1cm4gcmVtb3RlLnNpZ25hdHVyZSA9PT0gdG9tYnN0b25lLnJlbW90ZVNpZ25hdHVyZTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVtb3RlLmxhc3RNb2RpZmllZCA8PSB0b21ic3RvbmUuZGVsZXRlZEF0ICsgZ3JhY2VNcztcbiAgfVxuXG4gIHNob3VsZERlbGV0ZUxvY2FsRnJvbVRvbWJzdG9uZShmaWxlOiBURmlsZSwgdG9tYnN0b25lOiBEZWxldGlvblRvbWJzdG9uZSkge1xuICAgIGNvbnN0IGdyYWNlTXMgPSA1MDAwO1xuICAgIHJldHVybiBmaWxlLnN0YXQubXRpbWUgPD0gdG9tYnN0b25lLmRlbGV0ZWRBdCArIGdyYWNlTXM7XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUZvbGRlcihpbnB1dDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIG5vcm1hbGl6ZUZvbGRlcihpbnB1dCk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUZvbGRlcihpbnB1dDogc3RyaW5nKSB7XG4gIHJldHVybiBpbnB1dC5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpLnJlcGxhY2UoL1xcLyskLywgXCJcIikgKyBcIi9cIjtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFDLElBQUFBLG1CQWNNOzs7QUNkUCxzQkFBa0U7QUFFM0QsSUFBTSxrQkFBa0I7QUFDeEIsSUFBTSxvQkFBb0I7QUFZakMsSUFBTSwwQkFBTixjQUFzQyxvQ0FBb0I7QUFBQSxFQUN4RCxZQUFZLGFBQTBCO0FBQ3BDLFVBQU0sV0FBVztBQUFBLEVBQ25CO0FBQUEsRUFFQSxXQUFpQjtBQUFBLEVBQUM7QUFDcEI7QUFJTyxJQUFNLDJCQUFOLE1BQStCO0FBQUEsRUFDcEMsWUFBNkIsTUFBb0M7QUFBcEM7QUFBQSxFQUFxQztBQUFBLEVBRWxFLHVCQUF1QixXQUFtQixLQUFhO0FBQ3JELFVBQU0sYUFBYSxLQUFLLGtCQUFrQixTQUFTO0FBQ25ELFFBQUksQ0FBQyxZQUFZO0FBQ2YsYUFBTyxPQUFPLFNBQVM7QUFBQSxJQUN6QjtBQUVBLFdBQU8sS0FBSywwQkFBMEIsWUFBWSxHQUFHO0FBQUEsRUFDdkQ7QUFBQSxFQUVBLDBCQUEwQixZQUFvQixLQUFhO0FBQ3pELFVBQU0saUJBQWlCLE9BQU8sWUFBWSxRQUFRLFVBQVUsR0FBRyxFQUFFLEtBQUs7QUFDdEUsVUFBTSxpQkFBaUIsV0FBVyxRQUFRLFVBQVUsRUFBRSxFQUFFLEtBQUs7QUFDN0QsV0FBTyxDQUFDLFNBQVMsaUJBQWlCLElBQUksU0FB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VjtBQUFBLElBQ0YsRUFDQztBQUFBLE1BQVUsQ0FBQyxXQUNWLE9BQU8sY0FBYyxLQUFLLE9BQU8sRUFBRSw0QkFBUSxVQUFVLENBQUMsRUFBRSxRQUFRLFlBQVk7QUFDMUUsZUFBTyxZQUFZLElBQUk7QUFDdkIsWUFBSTtBQUNGLGdCQUFNLEtBQUssT0FBTywyQkFBMkIsSUFBSTtBQUNqRCxlQUFLLFFBQVE7QUFBQSxRQUNmLFVBQUU7QUFDQSxpQkFBTyxZQUFZLEtBQUs7QUFBQSxRQUMxQjtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0g7QUFFRixnQkFBWSxTQUFTLE1BQU0sRUFBRSxNQUFNLEtBQUssT0FBTyxFQUFFLGtDQUFTLGdCQUFnQixFQUFFLENBQUM7QUFFN0UsUUFBSSx5QkFBUSxXQUFXLEVBQ3BCLFFBQVEsS0FBSyxPQUFPLEVBQUUsZ0VBQWMsc0NBQXNDLENBQUMsRUFDM0U7QUFBQSxNQUNDLEtBQUssT0FBTztBQUFBLFFBQ1Y7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0YsRUFDQztBQUFBLE1BQVUsQ0FBQyxXQUNWLE9BQU8sY0FBYyxLQUFLLE9BQU8sRUFBRSw0QkFBUSxlQUFlLENBQUMsRUFBRSxRQUFRLFlBQVk7QUFDL0UsZUFBTyxZQUFZLElBQUk7QUFDdkIsWUFBSTtBQUNGLGdCQUFNLEtBQUssT0FBTyw2QkFBNkI7QUFBQSxRQUNqRCxVQUFFO0FBQ0EsaUJBQU8sWUFBWSxLQUFLO0FBQUEsUUFDMUI7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDSjtBQUNGO0FBRUEsSUFBTSxjQUFOLGNBQTBCLHVCQUFNO0FBQUEsRUFJOUIsWUFBWSxLQUFVLFdBQW1CLFVBQWtCO0FBQ3pELFVBQU0sR0FBRztBQUNULFNBQUssWUFBWTtBQUNqQixTQUFLLFdBQVc7QUFBQSxFQUNsQjtBQUFBLEVBRUEsU0FBZTtBQUNiLFVBQU0sRUFBRSxVQUFVLElBQUk7QUFDdEIsY0FBVSxNQUFNO0FBQ2hCLGNBQVUsU0FBUyxNQUFNLEVBQUUsTUFBTSxLQUFLLFVBQVUsQ0FBQztBQUNqRCxjQUFVLFNBQVMsS0FBSyxFQUFFLE1BQU0sS0FBSyxTQUFTLENBQUM7QUFBQSxFQUNqRDtBQUFBLEVBRUEsVUFBZ0I7QUFDZCxTQUFLLFVBQVUsTUFBTTtBQUFBLEVBQ3ZCO0FBQ0Y7IiwKICAibmFtZXMiOiBbImltcG9ydF9vYnNpZGlhbiIsICJpbXBvcnRfb2JzaWRpYW4iLCAiaW1wb3J0X29ic2lkaWFuIiwgImRvY3VtZW50IiwgInRvbWJzdG9uZSIsICJ1cGxvYWRlZFJlbW90ZSIsICJvYnNpZGlhblJlcXVlc3RVcmwiXQp9Cg==
