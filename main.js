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
  shouldSkipDirectorySyncPath(dirPath) {
    const p = (0, import_obsidian3.normalizePath)(dirPath);
    return p.startsWith(".obsidian") || p.startsWith(".trash") || p.startsWith(".git") || p.startsWith("node_modules") || p.startsWith("_plugin_packages") || p.startsWith(".tmp-");
  }
  collectLocalSyncedDirectories() {
    const dirs = /* @__PURE__ */ new Set();
    for (const f of this.deps.app.vault.getAllFolders()) {
      if (f instanceof import_obsidian3.TFolder && !f.isRoot() && !this.shouldSkipDirectorySyncPath(f.path)) {
        dirs.add((0, import_obsidian3.normalizePath)(f.path));
      }
    }
    return dirs;
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
    this.syncedDirectories = /* @__PURE__ */ new Set();
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
      this.syncedDirectories = /* @__PURE__ */ new Set();
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
      this.syncedDirectories = new Set(
        Array.isArray(candidate.syncedDirectories) ? candidate.syncedDirectories : []
      );
      this.normalizeEffectiveSettings();
      return;
    }
    this.settings = { ...DEFAULT_SETTINGS, ...candidate };
    this.queue = [];
    this.noteAccessTimestamps = /* @__PURE__ */ new Map();
    this.syncIndex = /* @__PURE__ */ new Map();
    this.syncedDirectories = /* @__PURE__ */ new Set();
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
      syncedDirectories: [...this.syncedDirectories],
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
        createdRemoteDirectories: 0,
        deletedLocalDirectories: 0,
        createdLocalDirectories: 0,
        evictedNotes: 0
      };
      await this.reconcileOrphanedSyncEntries(remoteFiles, deletionTombstones, counts);
      await this.reconcileRemoteOnlyFiles(remoteFiles, deletionTombstones, counts);
      await this.reconcileLocalFiles(remoteFiles, deletionTombstones, counts);
      const dirStats = await this.reconcileDirectories(remoteInventory.directories);
      counts.deletedRemoteDirectories = dirStats.deletedRemote;
      counts.createdRemoteDirectories = dirStats.createdRemote;
      counts.deletedLocalDirectories = dirStats.deletedLocal;
      counts.createdLocalDirectories = dirStats.createdLocal;
      await this.reconcileRemoteImages();
      counts.evictedNotes = await this.evictStaleSyncedNotes(false);
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.t(
        `\u5DF2\u53CC\u5411\u540C\u6B65\uFF1A\u4E0A\u4F20 ${counts.uploaded} \u4E2A\u6587\u4EF6\uFF0C\u4ECE\u8FDC\u7AEF\u62C9\u53D6 ${counts.restoredFromRemote + counts.downloadedOrUpdated} \u4E2A\u6587\u4EF6\uFF0C\u8DF3\u8FC7 ${counts.skipped} \u4E2A\u672A\u53D8\u5316\u6587\u4EF6\uFF0C\u5220\u9664\u8FDC\u7AEF\u5185\u5BB9 ${counts.deletedRemoteFiles} \u4E2A\u3001\u672C\u5730\u5185\u5BB9 ${counts.deletedLocalFiles} \u4E2A${counts.deletedLocalStubs > 0 ? `\uFF08\u5176\u4E2D\u5931\u6548\u5360\u4F4D\u7B14\u8BB0 ${counts.deletedLocalStubs} \u7BC7\uFF09` : ""}\uFF0C${counts.deletedRemoteDirectories > 0 || counts.createdRemoteDirectories > 0 ? `\u5220\u9664\u8FDC\u7AEF\u76EE\u5F55 ${counts.deletedRemoteDirectories} \u4E2A\u3001\u521B\u5EFA\u8FDC\u7AEF\u76EE\u5F55 ${counts.createdRemoteDirectories} \u4E2A\u3001` : ""}${counts.deletedLocalDirectories > 0 || counts.createdLocalDirectories > 0 ? `\u5220\u9664\u672C\u5730\u76EE\u5F55 ${counts.deletedLocalDirectories} \u4E2A\u3001\u521B\u5EFA\u672C\u5730\u76EE\u5F55 ${counts.createdLocalDirectories} \u4E2A\u3001` : ""}${counts.evictedNotes > 0 ? `\u56DE\u6536\u672C\u5730\u65E7\u7B14\u8BB0 ${counts.evictedNotes} \u7BC7\u3001` : ""}${counts.missingRemoteBackedNotes > 0 ? `\u53D1\u73B0 ${counts.missingRemoteBackedNotes} \u7BC7\u6309\u9700\u7B14\u8BB0\u7F3A\u5C11\u8FDC\u7AEF\u6B63\u6587\u3001` : ""}${counts.purgedMissingLazyNotes > 0 ? `\u786E\u8BA4\u6E05\u7406\u5931\u6548\u5360\u4F4D\u7B14\u8BB0 ${counts.purgedMissingLazyNotes} \u7BC7\u3001` : ""}\u3002`.replace(/、。/, "\u3002"),
        `Bidirectional sync uploaded ${counts.uploaded} file(s), pulled ${counts.restoredFromRemote + counts.downloadedOrUpdated} file(s) from remote, skipped ${counts.skipped} unchanged file(s), deleted ${counts.deletedRemoteFiles} remote content file(s) and ${counts.deletedLocalFiles} local file(s)${counts.deletedLocalStubs > 0 ? ` (including ${counts.deletedLocalStubs} stale stub note(s))` : ""}${counts.deletedRemoteDirectories > 0 ? `, deleted ${counts.deletedRemoteDirectories} remote director${counts.deletedRemoteDirectories === 1 ? "y" : "ies"}` : ""}${counts.createdRemoteDirectories > 0 ? `, created ${counts.createdRemoteDirectories} remote director${counts.createdRemoteDirectories === 1 ? "y" : "ies"}` : ""}${counts.deletedLocalDirectories > 0 ? `, deleted ${counts.deletedLocalDirectories} local empty director${counts.deletedLocalDirectories === 1 ? "y" : "ies"}` : ""}${counts.createdLocalDirectories > 0 ? `, created ${counts.createdLocalDirectories} local director${counts.createdLocalDirectories === 1 ? "y" : "ies"}` : ""}${counts.evictedNotes > 0 ? `, and evicted ${counts.evictedNotes} stale local note(s)` : ""}${counts.missingRemoteBackedNotes > 0 ? `, while detecting ${counts.missingRemoteBackedNotes} lazy note(s) missing their remote content` : ""}${counts.purgedMissingLazyNotes > 0 ? `, and purged ${counts.purgedMissingLazyNotes} confirmed broken lazy placeholder(s)` : ""}.`
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
  async reconcileDirectories(remoteDirectories) {
    const stats = { createdLocal: 0, createdRemote: 0, deletedLocal: 0, deletedRemote: 0 };
    const remoteLocalPaths = /* @__PURE__ */ new Set();
    for (const remoteDir of remoteDirectories) {
      const localPath = this.syncSupport.remotePathToVaultPath(remoteDir);
      if (localPath !== null && localPath.length > 0 && !this.syncSupport.shouldSkipDirectorySyncPath(localPath)) {
        remoteLocalPaths.add((0, import_obsidian4.normalizePath)(localPath));
      }
    }
    const localDirPaths = this.syncSupport.collectLocalSyncedDirectories();
    const knownDirPaths = this.syncedDirectories;
    const newSyncedDirs = /* @__PURE__ */ new Set();
    const localOnly = [...localDirPaths].filter((p) => !remoteLocalPaths.has(p));
    const remoteOnly = [...remoteLocalPaths].filter((p) => !localDirPaths.has(p));
    for (const dirPath of [...localOnly].sort((a, b) => b.length - a.length)) {
      if (knownDirPaths.has(dirPath)) {
        const folder = this.app.vault.getAbstractFileByPath(dirPath);
        if (folder instanceof import_obsidian4.TFolder && folder.children.length === 0) {
          try {
            await this.app.vault.delete(folder, true);
            stats.deletedLocal += 1;
          } catch {
          }
        } else {
          newSyncedDirs.add(dirPath);
        }
      } else {
        const remoteDir = normalizeFolder(this.settings.vaultSyncRemoteFolder) + dirPath;
        try {
          await this.ensureRemoteDirectories(remoteDir);
          stats.createdRemote += 1;
        } catch {
        }
        newSyncedDirs.add(dirPath);
      }
    }
    for (const dirPath of localDirPaths) {
      if (remoteLocalPaths.has(dirPath)) {
        newSyncedDirs.add(dirPath);
      }
    }
    for (const dirPath of [...remoteOnly].sort((a, b) => b.length - a.length)) {
      if (knownDirPaths.has(dirPath)) {
        const remoteDir = normalizeFolder(this.settings.vaultSyncRemoteFolder) + dirPath;
        const response = await this.requestUrl({
          url: this.buildUploadUrl(remoteDir),
          method: "DELETE",
          headers: { Authorization: this.buildAuthHeader() }
        });
        if ([200, 202, 204].includes(response.status)) {
          stats.deletedRemote += 1;
        } else if (![404, 405, 409].includes(response.status)) {
          newSyncedDirs.add(dirPath);
        }
      } else {
        const existing = this.app.vault.getAbstractFileByPath(dirPath);
        if (!existing) {
          await this.app.vault.createFolder(dirPath);
        }
        stats.createdLocal += 1;
        newSyncedDirs.add(dirPath);
      }
    }
    this.syncedDirectories = newSyncedDirs;
    return stats;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyIsICJzZWN1cmUtd2ViZGF2LWltYWdlLXN1cHBvcnQudHMiLCAic2VjdXJlLXdlYmRhdi11cGxvYWQtcXVldWUudHMiLCAic2VjdXJlLXdlYmRhdi1zeW5jLXN1cHBvcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIlx1RkVGRmltcG9ydCB7XG4gIEFwcCxcbiAgRWRpdG9yLFxuICBNYXJrZG93bkZpbGVJbmZvLFxuICBNYXJrZG93blZpZXcsXG4gIE1vZGFsLFxuICBOb3RpY2UsXG4gIFBsdWdpbixcbiAgUGx1Z2luU2V0dGluZ1RhYixcbiAgU2V0dGluZyxcbiAgVEFic3RyYWN0RmlsZSxcbiAgVEZpbGUsXG4gIFRGb2xkZXIsXG4gIG5vcm1hbGl6ZVBhdGgsXG4gIHJlcXVlc3RVcmwgYXMgb2JzaWRpYW5SZXF1ZXN0VXJsLFxufSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7IFNFQ1VSRV9DT0RFX0JMT0NLLCBTRUNVUkVfUFJPVE9DT0wsIFNlY3VyZVdlYmRhdkltYWdlU3VwcG9ydCB9IGZyb20gXCIuL3NlY3VyZS13ZWJkYXYtaW1hZ2Utc3VwcG9ydFwiO1xuaW1wb3J0IHsgU2VjdXJlV2ViZGF2VXBsb2FkUXVldWVTdXBwb3J0LCB0eXBlIFVwbG9hZFRhc2sgfSBmcm9tIFwiLi9zZWN1cmUtd2ViZGF2LXVwbG9hZC1xdWV1ZVwiO1xuaW1wb3J0IHtcbiAgU2VjdXJlV2ViZGF2U3luY1N1cHBvcnQsXG4gIHR5cGUgRGVsZXRpb25Ub21ic3RvbmUsXG4gIG5vcm1hbGl6ZUZvbGRlcixcbn0gZnJvbSBcIi4vc2VjdXJlLXdlYmRhdi1zeW5jLXN1cHBvcnRcIjtcblxudHlwZSBTZWN1cmVXZWJkYXZTZXR0aW5ncyA9IHtcbiAgd2ViZGF2VXJsOiBzdHJpbmc7XG4gIHVzZXJuYW1lOiBzdHJpbmc7XG4gIHBhc3N3b3JkOiBzdHJpbmc7XG4gIHJlbW90ZUZvbGRlcjogc3RyaW5nO1xuICB2YXVsdFN5bmNSZW1vdGVGb2xkZXI6IHN0cmluZztcbiAgbmFtaW5nU3RyYXRlZ3k6IFwidGltZXN0YW1wXCIgfCBcImhhc2hcIjtcbiAgZGVsZXRlTG9jYWxBZnRlclVwbG9hZDogYm9vbGVhbjtcbiAgbGFuZ3VhZ2U6IFwiYXV0b1wiIHwgXCJ6aFwiIHwgXCJlblwiO1xuICBub3RlU3RvcmFnZU1vZGU6IFwiZnVsbC1sb2NhbFwiIHwgXCJsYXp5LW5vdGVzXCI7XG4gIG5vdGVFdmljdEFmdGVyRGF5czogbnVtYmVyO1xuICBhdXRvU3luY0ludGVydmFsTWludXRlczogbnVtYmVyO1xuICBtYXhSZXRyeUF0dGVtcHRzOiBudW1iZXI7XG4gIHJldHJ5RGVsYXlTZWNvbmRzOiBudW1iZXI7XG4gIGRlbGV0ZVJlbW90ZVdoZW5VbnJlZmVyZW5jZWQ6IGJvb2xlYW47XG4gIGNvbXByZXNzSW1hZ2VzOiBib29sZWFuO1xuICBjb21wcmVzc1RocmVzaG9sZEtiOiBudW1iZXI7XG4gIG1heEltYWdlRGltZW5zaW9uOiBudW1iZXI7XG4gIGpwZWdRdWFsaXR5OiBudW1iZXI7XG59O1xuXG50eXBlIFN5bmNJbmRleEVudHJ5ID0ge1xuICBsb2NhbFNpZ25hdHVyZTogc3RyaW5nO1xuICByZW1vdGVTaWduYXR1cmU6IHN0cmluZztcbiAgcmVtb3RlUGF0aDogc3RyaW5nO1xufTtcblxudHlwZSBSZW1vdGVGaWxlU3RhdGUgPSB7XG4gIHJlbW90ZVBhdGg6IHN0cmluZztcbiAgbGFzdE1vZGlmaWVkOiBudW1iZXI7XG4gIHNpemU6IG51bWJlcjtcbiAgc2lnbmF0dXJlOiBzdHJpbmc7XG59O1xuXG50eXBlIE1pc3NpbmdMYXp5UmVtb3RlUmVjb3JkID0ge1xuICBmaXJzdERldGVjdGVkQXQ6IG51bWJlcjtcbiAgbGFzdERldGVjdGVkQXQ6IG51bWJlcjtcbiAgbWlzc0NvdW50OiBudW1iZXI7XG59O1xuXG50eXBlIFJlbW90ZUludmVudG9yeSA9IHtcbiAgZmlsZXM6IE1hcDxzdHJpbmcsIFJlbW90ZUZpbGVTdGF0ZT47XG4gIGRpcmVjdG9yaWVzOiBTZXQ8c3RyaW5nPjtcbn07XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFNlY3VyZVdlYmRhdlNldHRpbmdzID0ge1xuICB3ZWJkYXZVcmw6IFwiXCIsXG4gIHVzZXJuYW1lOiBcIlwiLFxuICBwYXNzd29yZDogXCJcIixcbiAgcmVtb3RlRm9sZGVyOiBcIi9yZW1vdGUtaW1hZ2VzL1wiLFxuICB2YXVsdFN5bmNSZW1vdGVGb2xkZXI6IFwiL3ZhdWx0LXN5bmMvXCIsXG4gIG5hbWluZ1N0cmF0ZWd5OiBcImhhc2hcIixcbiAgZGVsZXRlTG9jYWxBZnRlclVwbG9hZDogdHJ1ZSxcbiAgbGFuZ3VhZ2U6IFwiYXV0b1wiLFxuICBub3RlU3RvcmFnZU1vZGU6IFwiZnVsbC1sb2NhbFwiLFxuICBub3RlRXZpY3RBZnRlckRheXM6IDMwLFxuICBhdXRvU3luY0ludGVydmFsTWludXRlczogMCxcbiAgbWF4UmV0cnlBdHRlbXB0czogNSxcbiAgcmV0cnlEZWxheVNlY29uZHM6IDUsXG4gIGRlbGV0ZVJlbW90ZVdoZW5VbnJlZmVyZW5jZWQ6IHRydWUsXG4gIGNvbXByZXNzSW1hZ2VzOiB0cnVlLFxuICBjb21wcmVzc1RocmVzaG9sZEtiOiAzMDAsXG4gIG1heEltYWdlRGltZW5zaW9uOiAyMjAwLFxuICBqcGVnUXVhbGl0eTogODIsXG59O1xuXG5jb25zdCBNSU1FX01BUDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAganBnOiBcImltYWdlL2pwZWdcIixcbiAganBlZzogXCJpbWFnZS9qcGVnXCIsXG4gIHBuZzogXCJpbWFnZS9wbmdcIixcbiAgZ2lmOiBcImltYWdlL2dpZlwiLFxuICB3ZWJwOiBcImltYWdlL3dlYnBcIixcbiAgc3ZnOiBcImltYWdlL3N2Zyt4bWxcIixcbiAgYm1wOiBcImltYWdlL2JtcFwiLFxuICBcImltYWdlL2pwZWdcIjogXCJqcGdcIixcbiAgXCJpbWFnZS9wbmdcIjogXCJwbmdcIixcbiAgXCJpbWFnZS9naWZcIjogXCJnaWZcIixcbiAgXCJpbWFnZS93ZWJwXCI6IFwid2VicFwiLFxuICBcImltYWdlL2JtcFwiOiBcImJtcFwiLFxuICBcImltYWdlL3N2Zyt4bWxcIjogXCJzdmdcIixcbn07XG5cbmNvbnN0IFNFQ1VSRV9OT1RFX1NUVUIgPSBcInNlY3VyZS13ZWJkYXYtbm90ZS1zdHViXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFNlY3VyZVdlYmRhdkltYWdlc1BsdWdpbiBleHRlbmRzIFBsdWdpbiB7XG4gIHNldHRpbmdzOiBTZWN1cmVXZWJkYXZTZXR0aW5ncyA9IERFRkFVTFRfU0VUVElOR1M7XG4gIHF1ZXVlOiBVcGxvYWRUYXNrW10gPSBbXTtcbiAgcHJpdmF0ZSBibG9iVXJsczogc3RyaW5nW10gPSBbXTtcbiAgcHJpdmF0ZSByZWFkb25seSBtYXhCbG9iVXJscyA9IDEwMDtcbiAgcHJpdmF0ZSBub3RlUmVtb3RlUmVmcyA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8c3RyaW5nPj4oKTtcbiAgcHJpdmF0ZSByZW1vdGVDbGVhbnVwSW5GbGlnaHQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBub3RlQWNjZXNzVGltZXN0YW1wcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG4gIHByaXZhdGUgc3luY0luZGV4ID0gbmV3IE1hcDxzdHJpbmcsIFN5bmNJbmRleEVudHJ5PigpO1xuICBwcml2YXRlIHN5bmNlZERpcmVjdG9yaWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgbWlzc2luZ0xhenlSZW1vdGVOb3RlcyA9IG5ldyBNYXA8c3RyaW5nLCBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZD4oKTtcbiAgcHJpdmF0ZSBwZW5kaW5nVmF1bHRNdXRhdGlvblByb21pc2VzID0gbmV3IFNldDxQcm9taXNlPHZvaWQ+PigpO1xuICBwcml2YXRlIHByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG4gIHByaXZhdGUgcHJpb3JpdHlOb3RlU3luY3NJbkZsaWdodCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIGxhc3RWYXVsdFN5bmNBdCA9IDA7XG4gIHByaXZhdGUgbGFzdFZhdWx0U3luY1N0YXR1cyA9IFwiXCI7XG4gIHByaXZhdGUgc3luY0luUHJvZ3Jlc3MgPSBmYWxzZTtcbiAgcHJpdmF0ZSBhdXRvU3luY1RpY2tJblByb2dyZXNzID0gZmFsc2U7XG4gIC8vIEltYWdlIHBhcnNpbmcgYW5kIHJlbmRlcmluZyBsaXZlIGluIGEgZGVkaWNhdGVkIGhlbHBlciBzbyBzeW5jIGNoYW5nZXNcbiAgLy8gZG8gbm90IGFjY2lkZW50YWxseSBicmVhayBkaXNwbGF5IGJlaGF2aW91ciBhZ2Fpbi5cbiAgcHJpdmF0ZSBpbWFnZVN1cHBvcnQhOiBTZWN1cmVXZWJkYXZJbWFnZVN1cHBvcnQ7XG4gIC8vIFVwbG9hZCBxdWV1ZSBzdGF0ZSBpcyBpc29sYXRlZCBzbyByZXRyaWVzIGFuZCBwbGFjZWhvbGRlciByZXBsYWNlbWVudCBkb1xuICAvLyBub3Qga2VlcCBzcHJhd2xpbmcgYWNyb3NzIHRoZSBtYWluIHBsdWdpbiBjbGFzcy5cbiAgcHJpdmF0ZSB1cGxvYWRRdWV1ZSE6IFNlY3VyZVdlYmRhdlVwbG9hZFF1ZXVlU3VwcG9ydDtcbiAgLy8gU3luYyBtZXRhZGF0YSBoZWxwZXJzIGFyZSBpc29sYXRlZCBzbyByZWNvbmNpbGlhdGlvbiBydWxlcyBzdGF5IGV4cGxpY2l0LlxuICBwcml2YXRlIHN5bmNTdXBwb3J0ITogU2VjdXJlV2ViZGF2U3luY1N1cHBvcnQ7XG5cbiAgcHJpdmF0ZSByZWFkb25seSBkZWxldGlvbkZvbGRlclN1ZmZpeCA9IFwiLl9fc2VjdXJlLXdlYmRhdi1kZWxldGlvbnNfXy9cIjtcbiAgcHJpdmF0ZSByZWFkb25seSBtaXNzaW5nTGF6eVJlbW90ZUNvbmZpcm1hdGlvbnMgPSAyO1xuXG4gIHByaXZhdGUgaW5pdGlhbGl6ZVN1cHBvcnRNb2R1bGVzKCkge1xuICAgIC8vIEtlZXAgcnVudGltZS1vbmx5IGludGVncmF0aW9uIGhlcmU6IHRoZSBpbWFnZSBtb2R1bGUgb3ducyBwYXJzaW5nIGFuZFxuICAgIC8vIHJlbmRlcmluZywgd2hpbGUgdGhlIHBsdWdpbiBzdGlsbCBvd25zIFdlYkRBViBhY2Nlc3MgYW5kIGxpZmVjeWNsZS5cbiAgICB0aGlzLmltYWdlU3VwcG9ydCA9IG5ldyBTZWN1cmVXZWJkYXZJbWFnZVN1cHBvcnQoe1xuICAgICAgdDogdGhpcy50LmJpbmQodGhpcyksXG4gICAgICBmZXRjaFNlY3VyZUltYWdlQmxvYlVybDogdGhpcy5mZXRjaFNlY3VyZUltYWdlQmxvYlVybC5iaW5kKHRoaXMpLFxuICAgIH0pO1xuICAgIHRoaXMudXBsb2FkUXVldWUgPSBuZXcgU2VjdXJlV2ViZGF2VXBsb2FkUXVldWVTdXBwb3J0KHtcbiAgICAgIGFwcDogdGhpcy5hcHAsXG4gICAgICB0OiB0aGlzLnQuYmluZCh0aGlzKSxcbiAgICAgIHNldHRpbmdzOiAoKSA9PiB0aGlzLnNldHRpbmdzLFxuICAgICAgZ2V0UXVldWU6ICgpID0+IHRoaXMucXVldWUsXG4gICAgICBzZXRRdWV1ZTogKHF1ZXVlKSA9PiB7XG4gICAgICAgIHRoaXMucXVldWUgPSBxdWV1ZTtcbiAgICAgIH0sXG4gICAgICBzYXZlUGx1Z2luU3RhdGU6IHRoaXMuc2F2ZVBsdWdpblN0YXRlLmJpbmQodGhpcyksXG4gICAgICBzY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmM6IHRoaXMuc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jLmJpbmQodGhpcyksXG4gICAgICByZXF1ZXN0VXJsOiB0aGlzLnJlcXVlc3RVcmwuYmluZCh0aGlzKSxcbiAgICAgIGJ1aWxkVXBsb2FkVXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsLmJpbmQodGhpcyksXG4gICAgICBidWlsZEF1dGhIZWFkZXI6IHRoaXMuYnVpbGRBdXRoSGVhZGVyLmJpbmQodGhpcyksXG4gICAgICBwcmVwYXJlVXBsb2FkUGF5bG9hZDogdGhpcy5wcmVwYXJlVXBsb2FkUGF5bG9hZC5iaW5kKHRoaXMpLFxuICAgICAgYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnk6IHRoaXMuYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnkuYmluZCh0aGlzKSxcbiAgICAgIGJ1aWxkUmVtb3RlUGF0aDogdGhpcy5idWlsZFJlbW90ZVBhdGguYmluZCh0aGlzKSxcbiAgICAgIGJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXA6IHRoaXMuaW1hZ2VTdXBwb3J0LmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAuYmluZCh0aGlzLmltYWdlU3VwcG9ydCksXG4gICAgICBnZXRNaW1lVHlwZUZyb21GaWxlTmFtZTogdGhpcy5nZXRNaW1lVHlwZUZyb21GaWxlTmFtZS5iaW5kKHRoaXMpLFxuICAgICAgYXJyYXlCdWZmZXJUb0Jhc2U2NDogdGhpcy5hcnJheUJ1ZmZlclRvQmFzZTY0LmJpbmQodGhpcyksXG4gICAgICBiYXNlNjRUb0FycmF5QnVmZmVyOiB0aGlzLmJhc2U2NFRvQXJyYXlCdWZmZXIuYmluZCh0aGlzKSxcbiAgICAgIGVzY2FwZUh0bWw6IHRoaXMuZXNjYXBlSHRtbC5iaW5kKHRoaXMpLFxuICAgICAgZXNjYXBlUmVnRXhwOiB0aGlzLmVzY2FwZVJlZ0V4cC5iaW5kKHRoaXMpLFxuICAgICAgZGVzY3JpYmVFcnJvcjogdGhpcy5kZXNjcmliZUVycm9yLmJpbmQodGhpcyksXG4gICAgfSk7XG4gICAgdGhpcy5zeW5jU3VwcG9ydCA9IG5ldyBTZWN1cmVXZWJkYXZTeW5jU3VwcG9ydCh7XG4gICAgICBhcHA6IHRoaXMuYXBwLFxuICAgICAgZ2V0VmF1bHRTeW5jUmVtb3RlRm9sZGVyOiAoKSA9PiB0aGlzLnNldHRpbmdzLnZhdWx0U3luY1JlbW90ZUZvbGRlcixcbiAgICAgIGRlbGV0aW9uRm9sZGVyU3VmZml4OiB0aGlzLmRlbGV0aW9uRm9sZGVyU3VmZml4LFxuICAgICAgZW5jb2RlQmFzZTY0VXJsOiAodmFsdWUpID0+XG4gICAgICAgIHRoaXMuYXJyYXlCdWZmZXJUb0Jhc2U2NCh0aGlzLmVuY29kZVV0ZjgodmFsdWUpKS5yZXBsYWNlKC9cXCsvZywgXCItXCIpLnJlcGxhY2UoL1xcLy9nLCBcIl9cIikucmVwbGFjZSgvPSskL2csIFwiXCIpLFxuICAgICAgZGVjb2RlQmFzZTY0VXJsOiAodmFsdWUpID0+IHtcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IHZhbHVlLnJlcGxhY2UoLy0vZywgXCIrXCIpLnJlcGxhY2UoL18vZywgXCIvXCIpO1xuICAgICAgICBjb25zdCBwYWRkZWQgPSBub3JtYWxpemVkICsgXCI9XCIucmVwZWF0KCg0IC0gKG5vcm1hbGl6ZWQubGVuZ3RoICUgNCB8fCA0KSkgJSA0KTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGVjb2RlVXRmOCh0aGlzLmJhc2U2NFRvQXJyYXlCdWZmZXIocGFkZGVkKSk7XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgb25sb2FkKCkge1xuICAgIGF3YWl0IHRoaXMubG9hZFBsdWdpblN0YXRlKCk7XG4gICAgdGhpcy5pbml0aWFsaXplU3VwcG9ydE1vZHVsZXMoKTtcblxuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgU2VjdXJlV2ViZGF2U2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInVwbG9hZC1jdXJyZW50LW5vdGUtbG9jYWwtaW1hZ2VzXCIsXG4gICAgICBuYW1lOiBcIlVwbG9hZCBsb2NhbCBpbWFnZXMgaW4gY3VycmVudCBub3RlIHRvIFdlYkRBVlwiLFxuICAgICAgY2hlY2tDYWxsYmFjazogKGNoZWNraW5nKSA9PiB7XG4gICAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xuICAgICAgICBpZiAoIWZpbGUpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWNoZWNraW5nKSB7XG4gICAgICAgICAgdm9pZCB0aGlzLnVwbG9hZEltYWdlc0luTm90ZShmaWxlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJ0ZXN0LXdlYmRhdi1jb25uZWN0aW9uXCIsXG4gICAgICBuYW1lOiBcIlRlc3QgV2ViREFWIGNvbm5lY3Rpb25cIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5ydW5Db25uZWN0aW9uVGVzdCh0cnVlKTtcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwic3luYy1jb25maWd1cmVkLXZhdWx0LWNvbnRlbnQtdG8td2ViZGF2XCIsXG4gICAgICBuYW1lOiBcIlN5bmMgdmF1bHQgY29udGVudCB0byBXZWJEQVZcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5ydW5NYW51YWxTeW5jKCk7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmliYm9uID0gdGhpcy5hZGRSaWJib25JY29uKFwicmVmcmVzaC1jd1wiLCB0aGlzLnQoXCJcdTdBQ0JcdTUzNzNcdTU0MENcdTZCNjVcdTUyMzAgV2ViREFWXCIsIFwiU3luYyB0byBXZWJEQVYgbm93XCIpLCAoKSA9PiB7XG4gICAgICB2b2lkIHRoaXMucnVuTWFudWFsU3luYygpO1xuICAgIH0pO1xuICAgIHJpYmJvbi5hZGRDbGFzcyhcInNlY3VyZS13ZWJkYXYtc3luYy1yaWJib25cIik7XG5cbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Qb3N0UHJvY2Vzc29yKChlbCwgY3R4KSA9PiB7XG4gICAgICB2b2lkIHRoaXMuaW1hZ2VTdXBwb3J0LnByb2Nlc3NTZWN1cmVJbWFnZXMoZWwsIGN0eCk7XG4gICAgfSk7XG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFNFQ1VSRV9DT0RFX0JMT0NLLCAoc291cmNlLCBlbCwgY3R4KSA9PiB7XG4gICAgICB2b2lkIHRoaXMuaW1hZ2VTdXBwb3J0LnByb2Nlc3NTZWN1cmVDb2RlQmxvY2soc291cmNlLCBlbCwgY3R4KTtcbiAgICB9KTtcblxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImZpbGUtb3BlblwiLCAoZmlsZSkgPT4ge1xuICAgICAgICB2b2lkIHRoaXMuaGFuZGxlRmlsZU9wZW4oZmlsZSk7XG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFwiZWRpdG9yLXBhc3RlXCIsIChldnQsIGVkaXRvciwgaW5mbykgPT4ge1xuICAgICAgICB2b2lkIHRoaXMuaGFuZGxlRWRpdG9yUGFzdGUoZXZ0LCBlZGl0b3IsIGluZm8pO1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImVkaXRvci1kcm9wXCIsIChldnQsIGVkaXRvciwgaW5mbykgPT4ge1xuICAgICAgICB2b2lkIHRoaXMuaGFuZGxlRWRpdG9yRHJvcChldnQsIGVkaXRvciwgaW5mbyk7XG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgYXdhaXQgdGhpcy5yZWJ1aWxkUmVmZXJlbmNlSW5kZXgoKTtcbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oXCJtb2RpZnlcIiwgKGZpbGUpID0+IHRoaXMudHJhY2tWYXVsdE11dGF0aW9uKCgpID0+IHRoaXMuaGFuZGxlVmF1bHRNb2RpZnkoZmlsZSkpKSk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwiZGVsZXRlXCIsIChmaWxlKSA9PiB0aGlzLnRyYWNrVmF1bHRNdXRhdGlvbigoKSA9PiB0aGlzLmhhbmRsZVZhdWx0RGVsZXRlKGZpbGUpKSkpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLnZhdWx0Lm9uKFwicmVuYW1lXCIsIChmaWxlLCBvbGRQYXRoKSA9PiB0aGlzLnRyYWNrVmF1bHRNdXRhdGlvbigoKSA9PiB0aGlzLmhhbmRsZVZhdWx0UmVuYW1lKGZpbGUsIG9sZFBhdGgpKSksXG4gICAgKTtcblxuICAgIHRoaXMuc2V0dXBBdXRvU3luYygpO1xuXG4gICAgdm9pZCB0aGlzLnVwbG9hZFF1ZXVlLnByb2Nlc3NQZW5kaW5nVGFza3MoKTtcblxuICAgIHRoaXMucmVnaXN0ZXIoKCkgPT4ge1xuICAgICAgZm9yIChjb25zdCBibG9iVXJsIG9mIHRoaXMuYmxvYlVybHMpIHtcbiAgICAgICAgVVJMLnJldm9rZU9iamVjdFVSTChibG9iVXJsKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuYmxvYlVybHMuY2xlYXIoKTtcbiAgICAgIGZvciAoY29uc3QgdGltZW91dElkIG9mIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLnZhbHVlcygpKSB7XG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICAgIH1cbiAgICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLmNsZWFyKCk7XG4gICAgICB0aGlzLnVwbG9hZFF1ZXVlLmRpc3Bvc2UoKTtcbiAgICB9KTtcbiAgfVxuXG4gIG9udW5sb2FkKCkge1xuICAgIGZvciAoY29uc3QgYmxvYlVybCBvZiB0aGlzLmJsb2JVcmxzKSB7XG4gICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKGJsb2JVcmwpO1xuICAgIH1cbiAgICB0aGlzLmJsb2JVcmxzLmNsZWFyKCk7XG4gICAgdGhpcy51cGxvYWRRdWV1ZT8uZGlzcG9zZSgpO1xuICAgIGZvciAoY29uc3QgdGltZW91dElkIG9mIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLnZhbHVlcygpKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgfVxuICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLmNsZWFyKCk7XG4gIH1cblxuICBhc3luYyBsb2FkUGx1Z2luU3RhdGUoKSB7XG4gICAgY29uc3QgbG9hZGVkID0gYXdhaXQgdGhpcy5sb2FkRGF0YSgpO1xuICAgIGlmICghbG9hZGVkIHx8IHR5cGVvZiBsb2FkZWQgIT09IFwib2JqZWN0XCIpIHtcbiAgICAgIHRoaXMuc2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MgfTtcbiAgICAgIHRoaXMucXVldWUgPSBbXTtcbiAgICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMgPSBuZXcgTWFwKCk7XG4gICAgICB0aGlzLnN5bmNJbmRleCA9IG5ldyBNYXAoKTtcbiAgICAgIHRoaXMuc3luY2VkRGlyZWN0b3JpZXMgPSBuZXcgU2V0KCk7XG4gICAgICB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgPSBuZXcgTWFwKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY2FuZGlkYXRlID0gbG9hZGVkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIGlmIChcInNldHRpbmdzXCIgaW4gY2FuZGlkYXRlIHx8IFwicXVldWVcIiBpbiBjYW5kaWRhdGUpIHtcbiAgICAgIHRoaXMuc2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MsIC4uLigoY2FuZGlkYXRlLnNldHRpbmdzIGFzIFBhcnRpYWw8U2VjdXJlV2ViZGF2U2V0dGluZ3M+KSA/PyB7fSkgfTtcbiAgICAgIHRoaXMucXVldWUgPSBBcnJheS5pc0FycmF5KGNhbmRpZGF0ZS5xdWV1ZSkgPyAoY2FuZGlkYXRlLnF1ZXVlIGFzIFVwbG9hZFRhc2tbXSkgOiBbXTtcbiAgICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMgPSBuZXcgTWFwKFxuICAgICAgICBPYmplY3QuZW50cmllcygoY2FuZGlkYXRlLm5vdGVBY2Nlc3NUaW1lc3RhbXBzIGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfCB1bmRlZmluZWQpID8/IHt9KSxcbiAgICAgICk7XG4gICAgICB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgPSBuZXcgTWFwKFxuICAgICAgICBPYmplY3QuZW50cmllcygoY2FuZGlkYXRlLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgYXMgUmVjb3JkPHN0cmluZywgTWlzc2luZ0xhenlSZW1vdGVSZWNvcmQ+IHwgdW5kZWZpbmVkKSA/PyB7fSlcbiAgICAgICAgICAuZmlsdGVyKChbLCB2YWx1ZV0pID0+IHtcbiAgICAgICAgICAgIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlY29yZCA9IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdHlwZW9mIHJlY29yZC5maXJzdERldGVjdGVkQXQgPT09IFwibnVtYmVyXCIgJiZcbiAgICAgICAgICAgICAgdHlwZW9mIHJlY29yZC5sYXN0RGV0ZWN0ZWRBdCA9PT0gXCJudW1iZXJcIiAmJlxuICAgICAgICAgICAgICB0eXBlb2YgcmVjb3JkLm1pc3NDb3VudCA9PT0gXCJudW1iZXJcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoKFtwYXRoLCB2YWx1ZV0pID0+IFtwYXRoLCB2YWx1ZSBhcyBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZF0pLFxuICAgICAgKTtcbiAgICAgIHRoaXMuc3luY0luZGV4ID0gbmV3IE1hcCgpO1xuICAgICAgZm9yIChjb25zdCBbcGF0aCwgcmF3RW50cnldIG9mIE9iamVjdC5lbnRyaWVzKChjYW5kaWRhdGUuc3luY0luZGV4IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKSA/PyB7fSkpIHtcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IHRoaXMubm9ybWFsaXplU3luY0luZGV4RW50cnkocGF0aCwgcmF3RW50cnkpO1xuICAgICAgICBpZiAobm9ybWFsaXplZCkge1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChwYXRoLCBub3JtYWxpemVkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPVxuICAgICAgICB0eXBlb2YgY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNBdCA9PT0gXCJudW1iZXJcIiA/IGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jQXQgOiAwO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID1cbiAgICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jU3RhdHVzID09PSBcInN0cmluZ1wiID8gY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNTdGF0dXMgOiBcIlwiO1xuICAgICAgdGhpcy5zeW5jZWREaXJlY3RvcmllcyA9IG5ldyBTZXQoXG4gICAgICAgIEFycmF5LmlzQXJyYXkoY2FuZGlkYXRlLnN5bmNlZERpcmVjdG9yaWVzKSA/IGNhbmRpZGF0ZS5zeW5jZWREaXJlY3RvcmllcyBhcyBzdHJpbmdbXSA6IFtdLFxuICAgICAgKTtcbiAgICAgIHRoaXMubm9ybWFsaXplRWZmZWN0aXZlU2V0dGluZ3MoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnNldHRpbmdzID0geyAuLi5ERUZBVUxUX1NFVFRJTkdTLCAuLi4oY2FuZGlkYXRlIGFzIFBhcnRpYWw8U2VjdXJlV2ViZGF2U2V0dGluZ3M+KSB9O1xuICAgIHRoaXMucXVldWUgPSBbXTtcbiAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuc3luY0luZGV4ID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuc3luY2VkRGlyZWN0b3JpZXMgPSBuZXcgU2V0KCk7XG4gICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gMDtcbiAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSBcIlwiO1xuICAgIHRoaXMubm9ybWFsaXplRWZmZWN0aXZlU2V0dGluZ3MoKTtcbiAgfVxuXG4gIHByaXZhdGUgbm9ybWFsaXplRWZmZWN0aXZlU2V0dGluZ3MoKSB7XG4gICAgLy8gS2VlcCB0aGUgcHVibGljIHNldHRpbmdzIHN1cmZhY2UgaW50ZW50aW9uYWxseSBzbWFsbCBhbmQgZGV0ZXJtaW5pc3RpYy5cbiAgICB0aGlzLnNldHRpbmdzLmRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQgPSB0cnVlO1xuICAgIHRoaXMuc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXMgPSBNYXRoLm1heCgwLCBNYXRoLmZsb29yKHRoaXMuc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXMgfHwgMCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVGb2xkZXIoaW5wdXQ6IHN0cmluZykge1xuICAgIHJldHVybiBub3JtYWxpemVGb2xkZXIoaW5wdXQpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cEF1dG9TeW5jKCkge1xuICAgIGNvbnN0IG1pbnV0ZXMgPSB0aGlzLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzO1xuICAgIGlmIChtaW51dGVzIDw9IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbnRlcnZhbE1zID0gbWludXRlcyAqIDYwICogMTAwMDtcbiAgICB0aGlzLnJlZ2lzdGVySW50ZXJ2YWwoXG4gICAgICB3aW5kb3cuc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICB2b2lkIHRoaXMucnVuQXV0b1N5bmNUaWNrKCk7XG4gICAgICB9LCBpbnRlcnZhbE1zKSxcbiAgICApO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBydW5BdXRvU3luY1RpY2soKSB7XG4gICAgaWYgKHRoaXMuYXV0b1N5bmNUaWNrSW5Qcm9ncmVzcykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuYXV0b1N5bmNUaWNrSW5Qcm9ncmVzcyA9IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQoZmFsc2UpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLmF1dG9TeW5jVGlja0luUHJvZ3Jlc3MgPSBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBzYXZlUGx1Z2luU3RhdGUoKSB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh7XG4gICAgICBzZXR0aW5nczogdGhpcy5zZXR0aW5ncyxcbiAgICAgIHF1ZXVlOiB0aGlzLnF1ZXVlLFxuICAgICAgbm90ZUFjY2Vzc1RpbWVzdGFtcHM6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzLmVudHJpZXMoKSksXG4gICAgICBtaXNzaW5nTGF6eVJlbW90ZU5vdGVzOiBPYmplY3QuZnJvbUVudHJpZXModGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzLmVudHJpZXMoKSksXG4gICAgICBzeW5jSW5kZXg6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLnN5bmNJbmRleC5lbnRyaWVzKCkpLFxuICAgICAgc3luY2VkRGlyZWN0b3JpZXM6IFsuLi50aGlzLnN5bmNlZERpcmVjdG9yaWVzXSxcbiAgICAgIGxhc3RWYXVsdFN5bmNBdDogdGhpcy5sYXN0VmF1bHRTeW5jQXQsXG4gICAgICBsYXN0VmF1bHRTeW5jU3RhdHVzOiB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsXG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzYXZlU2V0dGluZ3MoKSB7XG4gICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgfVxuXG4gIHByaXZhdGUgbm9ybWFsaXplU3luY0luZGV4RW50cnkodmF1bHRQYXRoOiBzdHJpbmcsIHJhd0VudHJ5OiB1bmtub3duKTogU3luY0luZGV4RW50cnkgfCBudWxsIHtcbiAgICBpZiAoIXJhd0VudHJ5IHx8IHR5cGVvZiByYXdFbnRyeSAhPT0gXCJvYmplY3RcIikge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgY2FuZGlkYXRlID0gcmF3RW50cnkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9XG4gICAgICB0eXBlb2YgY2FuZGlkYXRlLnJlbW90ZVBhdGggPT09IFwic3RyaW5nXCIgJiYgY2FuZGlkYXRlLnJlbW90ZVBhdGgubGVuZ3RoID4gMFxuICAgICAgICA/IGNhbmRpZGF0ZS5yZW1vdGVQYXRoXG4gICAgICAgIDogdGhpcy5zeW5jU3VwcG9ydC5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgodmF1bHRQYXRoKTtcbiAgICBjb25zdCBsb2NhbFNpZ25hdHVyZSA9XG4gICAgICB0eXBlb2YgY2FuZGlkYXRlLmxvY2FsU2lnbmF0dXJlID09PSBcInN0cmluZ1wiXG4gICAgICAgID8gY2FuZGlkYXRlLmxvY2FsU2lnbmF0dXJlXG4gICAgICAgIDogdHlwZW9mIGNhbmRpZGF0ZS5zaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgICA/IGNhbmRpZGF0ZS5zaWduYXR1cmVcbiAgICAgICAgICA6IFwiXCI7XG4gICAgY29uc3QgcmVtb3RlU2lnbmF0dXJlID1cbiAgICAgIHR5cGVvZiBjYW5kaWRhdGUucmVtb3RlU2lnbmF0dXJlID09PSBcInN0cmluZ1wiXG4gICAgICAgID8gY2FuZGlkYXRlLnJlbW90ZVNpZ25hdHVyZVxuICAgICAgICA6IHR5cGVvZiBjYW5kaWRhdGUuc2lnbmF0dXJlID09PSBcInN0cmluZ1wiXG4gICAgICAgICAgPyBjYW5kaWRhdGUuc2lnbmF0dXJlXG4gICAgICAgICAgOiBcIlwiO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgcmVtb3RlUGF0aCxcbiAgICB9O1xuICB9XG5cbiAgdCh6aDogc3RyaW5nLCBlbjogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0TGFuZ3VhZ2UoKSA9PT0gXCJ6aFwiID8gemggOiBlbjtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0TGFuZ3VhZ2UoKSB7XG4gICAgaWYgKHRoaXMuc2V0dGluZ3MubGFuZ3VhZ2UgPT09IFwiYXV0b1wiKSB7XG4gICAgICBjb25zdCBsb2NhbGUgPSB0eXBlb2YgbmF2aWdhdG9yICE9PSBcInVuZGVmaW5lZFwiID8gbmF2aWdhdG9yLmxhbmd1YWdlLnRvTG93ZXJDYXNlKCkgOiBcImVuXCI7XG4gICAgICByZXR1cm4gbG9jYWxlLnN0YXJ0c1dpdGgoXCJ6aFwiKSA/IFwiemhcIiA6IFwiZW5cIjtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zZXR0aW5ncy5sYW5ndWFnZTtcbiAgfVxuXG4gIGZvcm1hdExhc3RTeW5jTGFiZWwoKSB7XG4gICAgaWYgKCF0aGlzLmxhc3RWYXVsdFN5bmNBdCkge1xuICAgICAgcmV0dXJuIHRoaXMudChcIlx1NEUwQVx1NkIyMVx1NTQwQ1x1NkI2NVx1RkYxQVx1NUMxQVx1NjcyQVx1NjI2N1x1ODg0Q1wiLCBcIkxhc3Qgc3luYzogbm90IHJ1biB5ZXRcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMudChcbiAgICAgIGBcdTRFMEFcdTZCMjFcdTU0MENcdTZCNjVcdUZGMUEke25ldyBEYXRlKHRoaXMubGFzdFZhdWx0U3luY0F0KS50b0xvY2FsZVN0cmluZygpfWAsXG4gICAgICBgTGFzdCBzeW5jOiAke25ldyBEYXRlKHRoaXMubGFzdFZhdWx0U3luY0F0KS50b0xvY2FsZVN0cmluZygpfWAsXG4gICAgKTtcbiAgfVxuXG4gIGZvcm1hdFN5bmNTdGF0dXNMYWJlbCgpIHtcbiAgICByZXR1cm4gdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzXG4gICAgICA/IHRoaXMudChgXHU2NzAwXHU4RkQxXHU3MkI2XHU2MDAxXHVGRjFBJHt0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXN9YCwgYFJlY2VudCBzdGF0dXM6ICR7dGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzfWApXG4gICAgICA6IHRoaXMudChcIlx1NjcwMFx1OEZEMVx1NzJCNlx1NjAwMVx1RkYxQVx1NjY4Mlx1NjVFMFwiLCBcIlJlY2VudCBzdGF0dXM6IG5vbmVcIik7XG4gIH1cblxuICBhc3luYyBydW5NYW51YWxTeW5jKCkge1xuICAgIGF3YWl0IHRoaXMuc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQodHJ1ZSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlYnVpbGRSZWZlcmVuY2VJbmRleCgpIHtcbiAgICBjb25zdCBuZXh0ID0gbmV3IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PigpO1xuICAgIGZvciAoY29uc3QgZmlsZSBvZiB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkpIHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgbmV4dC5zZXQoZmlsZS5wYXRoLCB0aGlzLmV4dHJhY3RSZW1vdGVQYXRoc0Zyb21UZXh0KGNvbnRlbnQpKTtcbiAgICB9XG4gICAgdGhpcy5ub3RlUmVtb3RlUmVmcyA9IG5leHQ7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZVZhdWx0TW9kaWZ5KGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHx8IGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBjb25zdCBuZXh0UmVmcyA9IHRoaXMuZXh0cmFjdFJlbW90ZVBhdGhzRnJvbVRleHQoY29udGVudCk7XG4gICAgY29uc3QgcHJldmlvdXNSZWZzID0gdGhpcy5ub3RlUmVtb3RlUmVmcy5nZXQoZmlsZS5wYXRoKSA/PyBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICB0aGlzLm5vdGVSZW1vdGVSZWZzLnNldChmaWxlLnBhdGgsIG5leHRSZWZzKTtcblxuICAgIGNvbnN0IGFkZGVkID0gWy4uLm5leHRSZWZzXS5maWx0ZXIoKHZhbHVlKSA9PiAhcHJldmlvdXNSZWZzLmhhcyh2YWx1ZSkpO1xuICAgIGNvbnN0IHJlbW92ZWQgPSBbLi4ucHJldmlvdXNSZWZzXS5maWx0ZXIoKHZhbHVlKSA9PiAhbmV4dFJlZnMuaGFzKHZhbHVlKSk7XG4gICAgaWYgKGFkZGVkLmxlbmd0aCA+IDApIHtcbiAgICAgIHRoaXMuc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jKGZpbGUucGF0aCwgXCJpbWFnZS1hZGRcIik7XG4gICAgfVxuICAgIGlmIChyZW1vdmVkLmxlbmd0aCA+IDApIHtcbiAgICAgIHRoaXMuc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jKGZpbGUucGF0aCwgXCJpbWFnZS1yZW1vdmVcIik7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVWYXVsdERlbGV0ZShmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKGZpbGUucGF0aCkpIHtcbiAgICAgIGF3YWl0IHRoaXMud3JpdGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgsIHRoaXMuc3luY0luZGV4LmdldChmaWxlLnBhdGgpPy5yZW1vdGVTaWduYXR1cmUpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgIH1cblxuICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICB0aGlzLm5vdGVSZW1vdGVSZWZzLmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlVmF1bHRSZW5hbWUoZmlsZTogVEFic3RyYWN0RmlsZSwgb2xkUGF0aDogc3RyaW5nKSB7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKG9sZFBhdGgpKSB7XG4gICAgICBhd2FpdCB0aGlzLndyaXRlRGVsZXRpb25Ub21ic3RvbmUob2xkUGF0aCwgdGhpcy5zeW5jSW5kZXguZ2V0KG9sZFBhdGgpPy5yZW1vdGVTaWduYXR1cmUpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKG9sZFBhdGgpO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICB9XG5cbiAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgY29uc3QgcmVmcyA9IHRoaXMubm90ZVJlbW90ZVJlZnMuZ2V0KG9sZFBhdGgpO1xuICAgICAgaWYgKHJlZnMpIHtcbiAgICAgICAgdGhpcy5ub3RlUmVtb3RlUmVmcy5kZWxldGUob2xkUGF0aCk7XG4gICAgICAgIHRoaXMubm90ZVJlbW90ZVJlZnMuc2V0KGZpbGUucGF0aCwgcmVmcyk7XG4gICAgICB9XG5cbiAgICAgIGlmICghdGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKGZpbGUucGF0aCkpIHtcbiAgICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMoZmlsZS5wYXRoLCBcImltYWdlLWFkZFwiKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RSZW1vdGVQYXRoc0Zyb21UZXh0KGNvbnRlbnQ6IHN0cmluZykge1xuICAgIGNvbnN0IHJlZnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBjb25zdCBzcGFuUmVnZXggPSAvZGF0YS1zZWN1cmUtd2ViZGF2PVwiKFteXCJdKylcIi9nO1xuICAgIGNvbnN0IHByb3RvY29sUmVnZXggPSAvd2ViZGF2LXNlY3VyZTpcXC9cXC8oW15cXHMpXCJdKykvZztcbiAgICBjb25zdCBjb2RlQmxvY2tSZWdleCA9IC9gYGBzZWN1cmUtd2ViZGF2XFxzKyhbXFxzXFxTXSo/KWBgYC9nO1xuICAgIGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblxuICAgIHdoaWxlICgobWF0Y2ggPSBzcGFuUmVnZXguZXhlYyhjb250ZW50KSkgIT09IG51bGwpIHtcbiAgICAgIHJlZnMuYWRkKHRoaXMudW5lc2NhcGVIdG1sKG1hdGNoWzFdKSk7XG4gICAgfVxuXG4gICAgd2hpbGUgKChtYXRjaCA9IHByb3RvY29sUmVnZXguZXhlYyhjb250ZW50KSkgIT09IG51bGwpIHtcbiAgICAgIHJlZnMuYWRkKHRoaXMudW5lc2NhcGVIdG1sKG1hdGNoWzFdKSk7XG4gICAgfVxuXG4gICAgd2hpbGUgKChtYXRjaCA9IGNvZGVCbG9ja1JlZ2V4LmV4ZWMoY29udGVudCkpICE9PSBudWxsKSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSB0aGlzLmltYWdlU3VwcG9ydC5wYXJzZVNlY3VyZUltYWdlQmxvY2sobWF0Y2hbMV0pO1xuICAgICAgaWYgKHBhcnNlZD8ucGF0aCkge1xuICAgICAgICByZWZzLmFkZChwYXJzZWQucGF0aCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZnM7XG4gIH1cblxuICBwcml2YXRlIHNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyhub3RlUGF0aDogc3RyaW5nLCByZWFzb246IFwiaW1hZ2UtYWRkXCIgfCBcImltYWdlLXJlbW92ZVwiKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy5nZXQobm90ZVBhdGgpO1xuICAgIGlmIChleGlzdGluZykge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dChleGlzdGluZyk7XG4gICAgfVxuXG4gICAgY29uc3QgZGVsYXlNcyA9IHJlYXNvbiA9PT0gXCJpbWFnZS1hZGRcIiA/IDEyMDAgOiA2MDA7XG4gICAgY29uc3QgdGltZW91dElkID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgdGhpcy5wcmlvcml0eU5vdGVTeW5jVGltZW91dHMuZGVsZXRlKG5vdGVQYXRoKTtcbiAgICAgIHZvaWQgdGhpcy5mbHVzaFByaW9yaXR5Tm90ZVN5bmMobm90ZVBhdGgsIHJlYXNvbik7XG4gICAgfSwgZGVsYXlNcyk7XG4gICAgdGhpcy5wcmlvcml0eU5vdGVTeW5jVGltZW91dHMuc2V0KG5vdGVQYXRoLCB0aW1lb3V0SWQpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBmbHVzaFByaW9yaXR5Tm90ZVN5bmMobm90ZVBhdGg6IHN0cmluZywgcmVhc29uOiBcImltYWdlLWFkZFwiIHwgXCJpbWFnZS1yZW1vdmVcIikge1xuICAgIGlmICh0aGlzLnByaW9yaXR5Tm90ZVN5bmNzSW5GbGlnaHQuaGFzKG5vdGVQYXRoKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIHRoaXMudXBsb2FkUXVldWUuaGFzUGVuZGluZ1dvcmtGb3JOb3RlKG5vdGVQYXRoKSB8fFxuICAgICAgdGhpcy5wZW5kaW5nVmF1bHRNdXRhdGlvblByb21pc2VzLnNpemUgPiAwIHx8XG4gICAgICB0aGlzLnN5bmNJblByb2dyZXNzIHx8XG4gICAgICB0aGlzLmF1dG9TeW5jVGlja0luUHJvZ3Jlc3NcbiAgICApIHtcbiAgICAgIHRoaXMuc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jKG5vdGVQYXRoLCByZWFzb24pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChub3RlUGF0aCk7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB8fCBmaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiIHx8IHRoaXMuc3luY1N1cHBvcnQuc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChmaWxlLnBhdGgpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5wcmlvcml0eU5vdGVTeW5jc0luRmxpZ2h0LmFkZChub3RlUGF0aCk7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xuXG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5yZWFkTWFya2Rvd25Db250ZW50UHJlZmVyRWRpdG9yKGZpbGUpO1xuICAgICAgaWYgKHRoaXMucGFyc2VOb3RlU3R1Yihjb250ZW50KSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aChmaWxlLnBhdGgpO1xuICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCwgY29udGVudCk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgIGxvY2FsU2lnbmF0dXJlOiBhd2FpdCB0aGlzLmJ1aWxkQ3VycmVudExvY2FsU2lnbmF0dXJlKGZpbGUsIGNvbnRlbnQpLFxuICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIH0pO1xuICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy50KFxuICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCJcbiAgICAgICAgICA/IGBcdTVERjJcdTRGMThcdTUxNDhcdTU0MENcdTZCNjVcdTU2RkVcdTcyNDdcdTY1QjBcdTU4OUVcdTU0MEVcdTc2ODRcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YFxuICAgICAgICAgIDogYFx1NURGMlx1NEYxOFx1NTE0OFx1NTQwQ1x1NkI2NVx1NTZGRVx1NzI0N1x1NTIyMFx1OTY2NFx1NTQwRVx1NzY4NFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCJcbiAgICAgICAgICA/IGBQcmlvcml0aXplZCBub3RlIHN5bmMgZmluaXNoZWQgYWZ0ZXIgaW1hZ2UgYWRkOiAke2ZpbGUuYmFzZW5hbWV9YFxuICAgICAgICAgIDogYFByaW9yaXRpemVkIG5vdGUgc3luYyBmaW5pc2hlZCBhZnRlciBpbWFnZSByZW1vdmFsOiAke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiUHJpb3JpdHkgbm90ZSBzeW5jIGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLmRlc2NyaWJlRXJyb3IoXG4gICAgICAgIHRoaXMudChcbiAgICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCIgPyBcIlx1NTZGRVx1NzI0N1x1NjVCMFx1NTg5RVx1NTQwRVx1NzY4NFx1N0IxNFx1OEJCMFx1NEYxOFx1NTE0OFx1NTQwQ1x1NkI2NVx1NTkzMVx1OEQyNVwiIDogXCJcdTU2RkVcdTcyNDdcdTUyMjBcdTk2NjRcdTU0MEVcdTc2ODRcdTdCMTRcdThCQjBcdTRGMThcdTUxNDhcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIixcbiAgICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCIgPyBcIlByaW9yaXR5IG5vdGUgc3luYyBhZnRlciBpbWFnZSBhZGQgZmFpbGVkXCIgOiBcIlByaW9yaXR5IG5vdGUgc3luYyBhZnRlciBpbWFnZSByZW1vdmFsIGZhaWxlZFwiLFxuICAgICAgICApLFxuICAgICAgICBlcnJvcixcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZVBhdGgsIHJlYXNvbik7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY3NJbkZsaWdodC5kZWxldGUobm90ZVBhdGgpO1xuICAgIH1cbiAgfVxuXG5cbiAgcHJpdmF0ZSBhc3luYyBidWlsZFVwbG9hZFJlcGxhY2VtZW50cyhjb250ZW50OiBzdHJpbmcsIG5vdGVGaWxlOiBURmlsZSwgdXBsb2FkQ2FjaGU/OiBNYXA8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgY29uc3Qgc2VlbiA9IG5ldyBNYXA8c3RyaW5nLCBVcGxvYWRSZXdyaXRlPigpO1xuICAgIGNvbnN0IHdpa2lNYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtcXFsoW15cXF1dKylcXF1cXF0vZyldO1xuICAgIGNvbnN0IG1hcmtkb3duTWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKC8hXFxbW15cXF1dKl1cXCgoW14pXSspXFwpL2cpXTtcbiAgICBjb25zdCBodG1sSW1hZ2VNYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLzxpbWdcXGJbXj5dKnNyYz1bXCInXShbXlwiJ10rKVtcIiddW14+XSo+L2dpKV07XG5cbiAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIHdpa2lNYXRjaGVzKSB7XG4gICAgICBjb25zdCByYXdMaW5rID0gbWF0Y2hbMV0uc3BsaXQoXCJ8XCIpWzBdLnRyaW0oKTtcbiAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGVGaWxlLnBhdGgpO1xuICAgICAgaWYgKCFmaWxlIHx8ICF0aGlzLmlzSW1hZ2VGaWxlKGZpbGUpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFZhdWx0RmlsZShmaWxlLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgICAgb3JpZ2luYWw6IG1hdGNoWzBdLFxuICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGZpbGUuYmFzZW5hbWUpLFxuICAgICAgICAgIHNvdXJjZUZpbGU6IGZpbGUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWFya2Rvd25NYXRjaGVzKSB7XG4gICAgICBjb25zdCByYXdMaW5rID0gZGVjb2RlVVJJQ29tcG9uZW50KG1hdGNoWzFdLnRyaW0oKS5yZXBsYWNlKC9ePHw+JC9nLCBcIlwiKSk7XG4gICAgICBpZiAoL14od2ViZGF2LXNlY3VyZTp8ZGF0YTopL2kudGVzdChyYXdMaW5rKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuaXNIdHRwVXJsKHJhd0xpbmspKSB7XG4gICAgICAgIGlmICghc2Vlbi5oYXMobWF0Y2hbMF0pKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlbW90ZVVybCA9IGF3YWl0IHRoaXMudXBsb2FkUmVtb3RlSW1hZ2VVcmwocmF3TGluaywgdXBsb2FkQ2FjaGUpO1xuICAgICAgICAgICAgY29uc3QgYWx0VGV4dCA9IHRoaXMuZXh0cmFjdE1hcmtkb3duQWx0VGV4dChtYXRjaFswXSkgfHwgdGhpcy5nZXREaXNwbGF5TmFtZUZyb21VcmwocmF3TGluayk7XG4gICAgICAgICAgICBzZWVuLnNldChtYXRjaFswXSwge1xuICAgICAgICAgICAgICBvcmlnaW5hbDogbWF0Y2hbMF0sXG4gICAgICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGFsdFRleHQpLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFtzZWN1cmUtd2ViZGF2LWltYWdlc10gXHU4REYzXHU4RkM3XHU1OTMxXHU4RDI1XHU3Njg0XHU4RkRDXHU3QTBCXHU1NkZFXHU3MjQ3ICR7cmF3TGlua31gLCBlPy5tZXNzYWdlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGVGaWxlLnBhdGgpO1xuICAgICAgaWYgKCFmaWxlIHx8ICF0aGlzLmlzSW1hZ2VGaWxlKGZpbGUpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFZhdWx0RmlsZShmaWxlLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgICAgb3JpZ2luYWw6IG1hdGNoWzBdLFxuICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGZpbGUuYmFzZW5hbWUpLFxuICAgICAgICAgIHNvdXJjZUZpbGU6IGZpbGUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgaHRtbEltYWdlTWF0Y2hlcykge1xuICAgICAgY29uc3QgcmF3TGluayA9IHRoaXMudW5lc2NhcGVIdG1sKG1hdGNoWzFdLnRyaW0oKSk7XG4gICAgICBpZiAoIXRoaXMuaXNIdHRwVXJsKHJhd0xpbmspIHx8IHNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRSZW1vdGVJbWFnZVVybChyYXdMaW5rLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIGNvbnN0IGFsdFRleHQgPSB0aGlzLmV4dHJhY3RIdG1sSW1hZ2VBbHRUZXh0KG1hdGNoWzBdKSB8fCB0aGlzLmdldERpc3BsYXlOYW1lRnJvbVVybChyYXdMaW5rKTtcbiAgICAgICAgc2Vlbi5zZXQobWF0Y2hbMF0sIHtcbiAgICAgICAgICBvcmlnaW5hbDogbWF0Y2hbMF0sXG4gICAgICAgICAgcmV3cml0dGVuOiB0aGlzLmltYWdlU3VwcG9ydC5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgYWx0VGV4dCksXG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgW3NlY3VyZS13ZWJkYXYtaW1hZ2VzXSBcdThERjNcdThGQzdcdTU5MzFcdThEMjVcdTc2ODRcdThGRENcdTdBMEJcdTU2RkVcdTcyNDcgJHtyYXdMaW5rfWAsIGU/Lm1lc3NhZ2UpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBbLi4uc2Vlbi52YWx1ZXMoKV07XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RNYXJrZG93bkFsdFRleHQobWFya2Rvd25JbWFnZTogc3RyaW5nKSB7XG4gICAgY29uc3QgbWF0Y2ggPSBtYXJrZG93bkltYWdlLm1hdGNoKC9eIVxcWyhbXlxcXV0qKVxcXS8pO1xuICAgIHJldHVybiBtYXRjaD8uWzFdPy50cmltKCkgPz8gXCJcIjtcbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdEh0bWxJbWFnZUFsdFRleHQoaHRtbEltYWdlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtYXRjaCA9IGh0bWxJbWFnZS5tYXRjaCgvXFxiYWx0PVtcIiddKFteXCInXSopW1wiJ10vaSk7XG4gICAgcmV0dXJuIG1hdGNoID8gdGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0udHJpbSgpKSA6IFwiXCI7XG4gIH1cblxuICBwcml2YXRlIGlzSHR0cFVybCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIC9eaHR0cHM/OlxcL1xcLy9pLnRlc3QodmFsdWUpO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXREaXNwbGF5TmFtZUZyb21VcmwocmF3VXJsOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXJsID0gbmV3IFVSTChyYXdVcmwpO1xuICAgICAgY29uc3QgZmlsZU5hbWUgPSB0aGlzLnNhbml0aXplRmlsZU5hbWUodXJsLnBhdGhuYW1lLnNwbGl0KFwiL1wiKS5wb3AoKSB8fCBcIlwiKTtcbiAgICAgIGlmIChmaWxlTmFtZSkge1xuICAgICAgICByZXR1cm4gZmlsZU5hbWUucmVwbGFjZSgvXFwuW14uXSskLywgXCJcIik7XG4gICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBGYWxsIHRocm91Z2ggdG8gdGhlIGdlbmVyaWMgbGFiZWwgYmVsb3cuXG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMudChcIlx1N0Y1MVx1OTg3NVx1NTZGRVx1NzI0N1wiLCBcIldlYiBpbWFnZVwiKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVzb2x2ZUxpbmtlZEZpbGUobGluazogc3RyaW5nLCBzb3VyY2VQYXRoOiBzdHJpbmcpOiBURmlsZSB8IG51bGwge1xuICAgIGNvbnN0IGNsZWFuZWQgPSBsaW5rLnJlcGxhY2UoLyMuKi8sIFwiXCIpLnRyaW0oKTtcbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpcnN0TGlua3BhdGhEZXN0KGNsZWFuZWQsIHNvdXJjZVBhdGgpO1xuICAgIHJldHVybiB0YXJnZXQgaW5zdGFuY2VvZiBURmlsZSA/IHRhcmdldCA6IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGlzSW1hZ2VGaWxlKGZpbGU6IFRGaWxlKSB7XG4gICAgcmV0dXJuIC9eKHBuZ3xqcGU/Z3xnaWZ8d2VicHxibXB8c3ZnKSQvaS50ZXN0KGZpbGUuZXh0ZW5zaW9uKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkVmF1bHRGaWxlKGZpbGU6IFRGaWxlLCB1cGxvYWRDYWNoZT86IE1hcDxzdHJpbmcsIHN0cmluZz4pIHtcbiAgICBpZiAodXBsb2FkQ2FjaGU/LmhhcyhmaWxlLnBhdGgpKSB7XG4gICAgICByZXR1cm4gdXBsb2FkQ2FjaGUuZ2V0KGZpbGUucGF0aCkhO1xuICAgIH1cblxuICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xuICAgIGNvbnN0IGJpbmFyeSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWRCaW5hcnkoZmlsZSk7XG4gICAgY29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLnByZXBhcmVVcGxvYWRQYXlsb2FkKGJpbmFyeSwgdGhpcy5nZXRNaW1lVHlwZShmaWxlLmV4dGVuc2lvbiksIGZpbGUubmFtZSk7XG4gICAgY29uc3QgcmVtb3RlTmFtZSA9IGF3YWl0IHRoaXMuYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnkocHJlcGFyZWQuZmlsZU5hbWUsIHByZXBhcmVkLmJpbmFyeSk7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRSZW1vdGVQYXRoKHJlbW90ZU5hbWUpO1xuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KHJlbW90ZVBhdGgsIHByZXBhcmVkLmJpbmFyeSwgcHJlcGFyZWQubWltZVR5cGUpO1xuICAgIGNvbnN0IHJlbW90ZVVybCA9IGAke1NFQ1VSRV9QUk9UT0NPTH0vLyR7cmVtb3RlUGF0aH1gO1xuICAgIHVwbG9hZENhY2hlPy5zZXQoZmlsZS5wYXRoLCByZW1vdGVVcmwpO1xuICAgIHJldHVybiByZW1vdGVVcmw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwbG9hZFJlbW90ZUltYWdlVXJsKGltYWdlVXJsOiBzdHJpbmcsIHVwbG9hZENhY2hlPzogTWFwPHN0cmluZywgc3RyaW5nPikge1xuICAgIGNvbnN0IGNhY2hlS2V5ID0gYHJlbW90ZToke2ltYWdlVXJsfWA7XG4gICAgaWYgKHVwbG9hZENhY2hlPy5oYXMoY2FjaGVLZXkpKSB7XG4gICAgICByZXR1cm4gdXBsb2FkQ2FjaGUuZ2V0KGNhY2hlS2V5KSE7XG4gICAgfVxuXG4gICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiBpbWFnZVVybCxcbiAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgIGZvbGxvd1JlZGlyZWN0czogdHJ1ZSxcbiAgICB9KTtcblxuICAgIHRoaXMuYXNzZXJ0UmVzcG9uc2VTdWNjZXNzKHJlc3BvbnNlLCBcIlJlbW90ZSBpbWFnZSBkb3dubG9hZFwiKTtcblxuICAgIGNvbnN0IGNvbnRlbnRUeXBlID0gcmVzcG9uc2UuaGVhZGVyc1tcImNvbnRlbnQtdHlwZVwiXSA/PyBcIlwiO1xuICAgIGlmICghdGhpcy5pc0ltYWdlQ29udGVudFR5cGUoY29udGVudFR5cGUpICYmICF0aGlzLmxvb2tzTGlrZUltYWdlVXJsKGltYWdlVXJsKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1OEZEQ1x1N0EwQlx1OTRGRVx1NjNBNVx1NEUwRFx1NjYyRlx1NTNFRlx1OEJDNlx1NTIyQlx1NzY4NFx1NTZGRVx1NzI0N1x1OEQ0NFx1NkU5MFx1MzAwMlwiLCBcIlRoZSByZW1vdGUgVVJMIGRvZXMgbm90IGxvb2sgbGlrZSBhbiBpbWFnZSByZXNvdXJjZS5cIikpO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbGVOYW1lID0gdGhpcy5idWlsZFJlbW90ZVNvdXJjZUZpbGVOYW1lKGltYWdlVXJsLCBjb250ZW50VHlwZSk7XG4gICAgY29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLnByZXBhcmVVcGxvYWRQYXlsb2FkKFxuICAgICAgcmVzcG9uc2UuYXJyYXlCdWZmZXIsXG4gICAgICB0aGlzLm5vcm1hbGl6ZUltYWdlTWltZVR5cGUoY29udGVudFR5cGUsIGZpbGVOYW1lKSxcbiAgICAgIGZpbGVOYW1lLFxuICAgICk7XG4gICAgY29uc3QgcmVtb3RlTmFtZSA9IGF3YWl0IHRoaXMuYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnkocHJlcGFyZWQuZmlsZU5hbWUsIHByZXBhcmVkLmJpbmFyeSk7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRSZW1vdGVQYXRoKHJlbW90ZU5hbWUpO1xuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KHJlbW90ZVBhdGgsIHByZXBhcmVkLmJpbmFyeSwgcHJlcGFyZWQubWltZVR5cGUpO1xuICAgIGNvbnN0IHJlbW90ZVVybCA9IGAke1NFQ1VSRV9QUk9UT0NPTH0vLyR7cmVtb3RlUGF0aH1gO1xuICAgIHVwbG9hZENhY2hlPy5zZXQoY2FjaGVLZXksIHJlbW90ZVVybCk7XG4gICAgcmV0dXJuIHJlbW90ZVVybDtcbiAgfVxuXG4gIHByaXZhdGUgaXNJbWFnZUNvbnRlbnRUeXBlKGNvbnRlbnRUeXBlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gL15pbWFnZVxcLy9pLnRlc3QoY29udGVudFR5cGUudHJpbSgpKTtcbiAgfVxuXG4gIHByaXZhdGUgbG9va3NMaWtlSW1hZ2VVcmwocmF3VXJsOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXJsID0gbmV3IFVSTChyYXdVcmwpO1xuICAgICAgcmV0dXJuIC9cXC4ocG5nfGpwZT9nfGdpZnx3ZWJwfGJtcHxzdmcpJC9pLnRlc3QodXJsLnBhdGhuYW1lKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkUmVtb3RlU291cmNlRmlsZU5hbWUocmF3VXJsOiBzdHJpbmcsIGNvbnRlbnRUeXBlOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXJsID0gbmV3IFVSTChyYXdVcmwpO1xuICAgICAgY29uc3QgY2FuZGlkYXRlID0gdGhpcy5zYW5pdGl6ZUZpbGVOYW1lKHVybC5wYXRobmFtZS5zcGxpdChcIi9cIikucG9wKCkgfHwgXCJcIik7XG4gICAgICBpZiAoY2FuZGlkYXRlICYmIC9cXC5bYS16MC05XSskL2kudGVzdChjYW5kaWRhdGUpKSB7XG4gICAgICAgIHJldHVybiBjYW5kaWRhdGU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbU1pbWVUeXBlKGNvbnRlbnRUeXBlKSB8fCBcInBuZ1wiO1xuICAgICAgcmV0dXJuIGNhbmRpZGF0ZSA/IGAke2NhbmRpZGF0ZX0uJHtleHRlbnNpb259YCA6IGByZW1vdGUtaW1hZ2UuJHtleHRlbnNpb259YDtcbiAgICB9IGNhdGNoIHtcbiAgICAgIGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbU1pbWVUeXBlKGNvbnRlbnRUeXBlKSB8fCBcInBuZ1wiO1xuICAgICAgcmV0dXJuIGByZW1vdGUtaW1hZ2UuJHtleHRlbnNpb259YDtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHNhbml0aXplRmlsZU5hbWUoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBmaWxlTmFtZS5yZXBsYWNlKC9bXFxcXC86Kj9cIjw+fF0rL2csIFwiLVwiKS50cmltKCk7XG4gIH1cblxuICBwcml2YXRlIGdldEV4dGVuc2lvbkZyb21NaW1lVHlwZShjb250ZW50VHlwZTogc3RyaW5nKSB7XG4gICAgY29uc3QgbWltZVR5cGUgPSBjb250ZW50VHlwZS5zcGxpdChcIjtcIilbMF0udHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgcmV0dXJuIE1JTUVfTUFQW21pbWVUeXBlXSA/PyBcIlwiO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVJbWFnZU1pbWVUeXBlKGNvbnRlbnRUeXBlOiBzdHJpbmcsIGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtaW1lVHlwZSA9IGNvbnRlbnRUeXBlLnNwbGl0KFwiO1wiKVswXS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAobWltZVR5cGUgJiYgbWltZVR5cGUgIT09IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCIpIHtcbiAgICAgIHJldHVybiBtaW1lVHlwZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5nZXRNaW1lVHlwZUZyb21GaWxlTmFtZShmaWxlTmFtZSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwbG9hZEJpbmFyeShyZW1vdGVQYXRoOiBzdHJpbmcsIGJpbmFyeTogQXJyYXlCdWZmZXIsIG1pbWVUeXBlOiBzdHJpbmcpIHtcbiAgICBhd2FpdCB0aGlzLmVuc3VyZVJlbW90ZURpcmVjdG9yaWVzKHJlbW90ZVBhdGgpO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJQVVRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgXCJDb250ZW50LVR5cGVcIjogbWltZVR5cGUsXG4gICAgICB9LFxuICAgICAgYm9keTogYmluYXJ5LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2UsIFwiVXBsb2FkXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVFZGl0b3JQYXN0ZShldnQ6IENsaXBib2FyZEV2ZW50LCBlZGl0b3I6IEVkaXRvciwgaW5mbzogTWFya2Rvd25WaWV3IHwgTWFya2Rvd25GaWxlSW5mbykge1xuICAgIGlmIChldnQuZGVmYXVsdFByZXZlbnRlZCB8fCAhaW5mby5maWxlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaW1hZ2VGaWxlID0gdGhpcy5leHRyYWN0SW1hZ2VGaWxlRnJvbUNsaXBib2FyZChldnQpO1xuICAgIGlmIChpbWFnZUZpbGUpIHtcbiAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgY29uc3QgZmlsZU5hbWUgPSBpbWFnZUZpbGUubmFtZSB8fCB0aGlzLmJ1aWxkQ2xpcGJvYXJkRmlsZU5hbWUoaW1hZ2VGaWxlLnR5cGUpO1xuICAgICAgYXdhaXQgdGhpcy51cGxvYWRRdWV1ZS5lbnF1ZXVlRWRpdG9ySW1hZ2VVcGxvYWQoaW5mby5maWxlLCBlZGl0b3IsIGltYWdlRmlsZSwgZmlsZU5hbWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGh0bWwgPSBldnQuY2xpcGJvYXJkRGF0YT8uZ2V0RGF0YShcInRleHQvaHRtbFwiKT8udHJpbSgpID8/IFwiXCI7XG4gICAgaWYgKCFodG1sIHx8ICF0aGlzLmh0bWxDb250YWluc1JlbW90ZUltYWdlcyhodG1sKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGF3YWl0IHRoaXMuaGFuZGxlSHRtbFBhc3RlV2l0aFJlbW90ZUltYWdlcyhpbmZvLmZpbGUsIGVkaXRvciwgaHRtbCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUVkaXRvckRyb3AoZXZ0OiBEcmFnRXZlbnQsIGVkaXRvcjogRWRpdG9yLCBpbmZvOiBNYXJrZG93blZpZXcgfCBNYXJrZG93bkZpbGVJbmZvKSB7XG4gICAgaWYgKGV2dC5kZWZhdWx0UHJldmVudGVkIHx8ICFpbmZvLmZpbGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbWFnZUZpbGUgPSB0aGlzLmV4dHJhY3RJbWFnZUZpbGVGcm9tRHJvcChldnQpO1xuICAgIGlmICghaW1hZ2VGaWxlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3QgZmlsZU5hbWUgPSBpbWFnZUZpbGUubmFtZSB8fCB0aGlzLmJ1aWxkQ2xpcGJvYXJkRmlsZU5hbWUoaW1hZ2VGaWxlLnR5cGUpO1xuICAgIGF3YWl0IHRoaXMudXBsb2FkUXVldWUuZW5xdWV1ZUVkaXRvckltYWdlVXBsb2FkKGluZm8uZmlsZSwgZWRpdG9yLCBpbWFnZUZpbGUsIGZpbGVOYW1lKTtcbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdEltYWdlRmlsZUZyb21DbGlwYm9hcmQoZXZ0OiBDbGlwYm9hcmRFdmVudCkge1xuICAgIGNvbnN0IGRpcmVjdCA9IEFycmF5LmZyb20oZXZ0LmNsaXBib2FyZERhdGE/LmZpbGVzID8/IFtdKS5maW5kKChmaWxlKSA9PiBmaWxlLnR5cGUuc3RhcnRzV2l0aChcImltYWdlL1wiKSk7XG4gICAgaWYgKGRpcmVjdCkge1xuICAgICAgcmV0dXJuIGRpcmVjdDtcbiAgICB9XG5cbiAgICBjb25zdCBpdGVtID0gQXJyYXkuZnJvbShldnQuY2xpcGJvYXJkRGF0YT8uaXRlbXMgPz8gW10pLmZpbmQoKGVudHJ5KSA9PiBlbnRyeS50eXBlLnN0YXJ0c1dpdGgoXCJpbWFnZS9cIikpO1xuICAgIHJldHVybiBpdGVtPy5nZXRBc0ZpbGUoKSA/PyBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBodG1sQ29udGFpbnNSZW1vdGVJbWFnZXMoaHRtbDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIC88aW1nXFxiW14+XSpzcmM9W1wiJ11odHRwcz86XFwvXFwvW15cIiddK1tcIiddW14+XSo+L2kudGVzdChodG1sKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlSHRtbFBhc3RlV2l0aFJlbW90ZUltYWdlcyhub3RlRmlsZTogVEZpbGUsIGVkaXRvcjogRWRpdG9yLCBodG1sOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVuZGVyZWQgPSBhd2FpdCB0aGlzLmNvbnZlcnRIdG1sQ2xpcGJvYXJkVG9TZWN1cmVNYXJrZG93bihodG1sLCBub3RlRmlsZSk7XG4gICAgICBpZiAoIXJlbmRlcmVkLnRyaW0oKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGVkaXRvci5yZXBsYWNlU2VsZWN0aW9uKHJlbmRlcmVkKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1REYyXHU1QzA2XHU3RjUxXHU5ODc1XHU1NkZFXHU2NTg3XHU3Qzk4XHU4RDM0XHU1RTc2XHU2MjkzXHU1M0Q2XHU4RkRDXHU3QTBCXHU1NkZFXHU3MjQ3XHUzMDAyXCIsIFwiUGFzdGVkIHdlYiBjb250ZW50IGFuZCBjYXB0dXJlZCByZW1vdGUgaW1hZ2VzLlwiKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcGFzdGUgSFRNTCBjb250ZW50IHdpdGggcmVtb3RlIGltYWdlc1wiLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKFxuICAgICAgICB0aGlzLmRlc2NyaWJlRXJyb3IoXG4gICAgICAgICAgdGhpcy50KFwiXHU1OTA0XHU3NDA2XHU3RjUxXHU5ODc1XHU1NkZFXHU2NTg3XHU3Qzk4XHU4RDM0XHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIHByb2Nlc3MgcGFzdGVkIHdlYiBjb250ZW50XCIpLFxuICAgICAgICAgIGVycm9yLFxuICAgICAgICApLFxuICAgICAgICA4MDAwLFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNvbnZlcnRIdG1sQ2xpcGJvYXJkVG9TZWN1cmVNYXJrZG93bihodG1sOiBzdHJpbmcsIG5vdGVGaWxlOiBURmlsZSkge1xuICAgIGNvbnN0IHBhcnNlciA9IG5ldyBET01QYXJzZXIoKTtcbiAgICBjb25zdCBkb2N1bWVudCA9IHBhcnNlci5wYXJzZUZyb21TdHJpbmcoaHRtbCwgXCJ0ZXh0L2h0bWxcIik7XG4gICAgY29uc3QgdXBsb2FkQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgIGNvbnN0IHJlbmRlcmVkQmxvY2tzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBub2RlIG9mIEFycmF5LmZyb20oZG9jdW1lbnQuYm9keS5jaGlsZE5vZGVzKSkge1xuICAgICAgY29uc3QgYmxvY2sgPSBhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxOb2RlKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgMCk7XG4gICAgICBpZiAoYmxvY2sudHJpbSgpKSB7XG4gICAgICAgIHJlbmRlcmVkQmxvY2tzLnB1c2goYmxvY2sudHJpbSgpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVuZGVyZWRCbG9ja3Muam9pbihcIlxcblxcblwiKSArIFwiXFxuXCI7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlbmRlclBhc3RlZEh0bWxOb2RlKFxuICAgIG5vZGU6IE5vZGUsXG4gICAgbm90ZUZpbGU6IFRGaWxlLFxuICAgIHVwbG9hZENhY2hlOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuICAgIGxpc3REZXB0aDogbnVtYmVyLFxuICApOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSkge1xuICAgICAgcmV0dXJuIHRoaXMubm9ybWFsaXplQ2xpcGJvYXJkVGV4dChub2RlLnRleHRDb250ZW50ID8/IFwiXCIpO1xuICAgIH1cblxuICAgIGlmICghKG5vZGUgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkpIHtcbiAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cblxuICAgIGNvbnN0IHRhZyA9IG5vZGUudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmICh0YWcgPT09IFwiaW1nXCIpIHtcbiAgICAgIGNvbnN0IHNyYyA9IHRoaXMudW5lc2NhcGVIdG1sKG5vZGUuZ2V0QXR0cmlidXRlKFwic3JjXCIpPy50cmltKCkgPz8gXCJcIik7XG4gICAgICBpZiAoIXRoaXMuaXNIdHRwVXJsKHNyYykpIHtcbiAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFsdCA9IChub2RlLmdldEF0dHJpYnV0ZShcImFsdFwiKSA/PyBcIlwiKS50cmltKCkgfHwgdGhpcy5nZXREaXNwbGF5TmFtZUZyb21Vcmwoc3JjKTtcbiAgICAgIGNvbnN0IHJlbW90ZVVybCA9IGF3YWl0IHRoaXMudXBsb2FkUmVtb3RlSW1hZ2VVcmwoc3JjLCB1cGxvYWRDYWNoZSk7XG4gICAgICByZXR1cm4gdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGFsdCk7XG4gICAgfVxuXG4gICAgaWYgKHRhZyA9PT0gXCJiclwiKSB7XG4gICAgICByZXR1cm4gXCJcXG5cIjtcbiAgICB9XG5cbiAgICBpZiAodGFnID09PSBcInVsXCIgfHwgdGFnID09PSBcIm9sXCIpIHtcbiAgICAgIGNvbnN0IGl0ZW1zOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgbGV0IGluZGV4ID0gMTtcbiAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgQXJyYXkuZnJvbShub2RlLmNoaWxkcmVuKSkge1xuICAgICAgICBpZiAoY2hpbGQudGFnTmFtZS50b0xvd2VyQ2FzZSgpICE9PSBcImxpXCIpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJlbmRlcmVkID0gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbE5vZGUoY2hpbGQsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoICsgMSkpLnRyaW0oKTtcbiAgICAgICAgaWYgKCFyZW5kZXJlZCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcHJlZml4ID0gdGFnID09PSBcIm9sXCIgPyBgJHtpbmRleH0uIGAgOiBcIi0gXCI7XG4gICAgICAgIGl0ZW1zLnB1c2goYCR7XCIgIFwiLnJlcGVhdChNYXRoLm1heCgwLCBsaXN0RGVwdGgpKX0ke3ByZWZpeH0ke3JlbmRlcmVkfWApO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gaXRlbXMuam9pbihcIlxcblwiKTtcbiAgICB9XG5cbiAgICBpZiAodGFnID09PSBcImxpXCIpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpO1xuICAgICAgcmV0dXJuIHBhcnRzLmpvaW4oXCJcIikudHJpbSgpO1xuICAgIH1cblxuICAgIGlmICgvXmhbMS02XSQvLnRlc3QodGFnKSkge1xuICAgICAgY29uc3QgbGV2ZWwgPSBOdW1iZXIucGFyc2VJbnQodGFnWzFdLCAxMCk7XG4gICAgICBjb25zdCB0ZXh0ID0gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKSkuam9pbihcIlwiKS50cmltKCk7XG4gICAgICByZXR1cm4gdGV4dCA/IGAke1wiI1wiLnJlcGVhdChsZXZlbCl9ICR7dGV4dH1gIDogXCJcIjtcbiAgICB9XG5cbiAgICBpZiAodGFnID09PSBcImFcIikge1xuICAgICAgY29uc3QgaHJlZiA9IG5vZGUuZ2V0QXR0cmlidXRlKFwiaHJlZlwiKT8udHJpbSgpID8/IFwiXCI7XG4gICAgICBjb25zdCB0ZXh0ID0gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKSkuam9pbihcIlwiKS50cmltKCk7XG4gICAgICBpZiAoaHJlZiAmJiAvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KGhyZWYpICYmIHRleHQpIHtcbiAgICAgICAgcmV0dXJuIGBbJHt0ZXh0fV0oJHtocmVmfSlgO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRleHQ7XG4gICAgfVxuXG4gICAgY29uc3QgaW5saW5lVGFncyA9IG5ldyBTZXQoW1wic3Ryb25nXCIsIFwiYlwiLCBcImVtXCIsIFwiaVwiLCBcInNwYW5cIiwgXCJjb2RlXCIsIFwic21hbGxcIiwgXCJzdXBcIiwgXCJzdWJcIl0pO1xuICAgIGlmIChpbmxpbmVUYWdzLmhhcyh0YWcpKSB7XG4gICAgICByZXR1cm4gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKSkuam9pbihcIlwiKTtcbiAgICB9XG5cbiAgICBjb25zdCBibG9ja1RhZ3MgPSBuZXcgU2V0KFtcbiAgICAgIFwicFwiLFxuICAgICAgXCJkaXZcIixcbiAgICAgIFwiYXJ0aWNsZVwiLFxuICAgICAgXCJzZWN0aW9uXCIsXG4gICAgICBcImZpZ3VyZVwiLFxuICAgICAgXCJmaWdjYXB0aW9uXCIsXG4gICAgICBcImJsb2NrcXVvdGVcIixcbiAgICAgIFwicHJlXCIsXG4gICAgICBcInRhYmxlXCIsXG4gICAgICBcInRoZWFkXCIsXG4gICAgICBcInRib2R5XCIsXG4gICAgICBcInRyXCIsXG4gICAgICBcInRkXCIsXG4gICAgICBcInRoXCIsXG4gICAgXSk7XG4gICAgaWYgKGJsb2NrVGFncy5oYXModGFnKSkge1xuICAgICAgY29uc3QgdGV4dCA9IChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIikudHJpbSgpO1xuICAgICAgcmV0dXJuIHRleHQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihcbiAgICBlbGVtZW50OiBIVE1MRWxlbWVudCxcbiAgICBub3RlRmlsZTogVEZpbGUsXG4gICAgdXBsb2FkQ2FjaGU6IE1hcDxzdHJpbmcsIHN0cmluZz4sXG4gICAgbGlzdERlcHRoOiBudW1iZXIsXG4gICkge1xuICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgQXJyYXkuZnJvbShlbGVtZW50LmNoaWxkTm9kZXMpKSB7XG4gICAgICBjb25zdCByZW5kZXJlZCA9IGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbE5vZGUoY2hpbGQsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKTtcbiAgICAgIGlmICghcmVuZGVyZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAwICYmICFyZW5kZXJlZC5zdGFydHNXaXRoKFwiXFxuXCIpICYmICFwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXS5lbmRzV2l0aChcIlxcblwiKSkge1xuICAgICAgICBjb25zdCBwcmV2aW91cyA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdO1xuICAgICAgICBjb25zdCBuZWVkc1NwYWNlID0gL1xcUyQvLnRlc3QocHJldmlvdXMpICYmIC9eXFxTLy50ZXN0KHJlbmRlcmVkKTtcbiAgICAgICAgaWYgKG5lZWRzU3BhY2UpIHtcbiAgICAgICAgICBwYXJ0cy5wdXNoKFwiIFwiKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBwYXJ0cy5wdXNoKHJlbmRlcmVkKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcGFydHM7XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUNsaXBib2FyZFRleHQodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9cXHMrL2csIFwiIFwiKTtcbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdEltYWdlRmlsZUZyb21Ecm9wKGV2dDogRHJhZ0V2ZW50KSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20oZXZ0LmRhdGFUcmFuc2Zlcj8uZmlsZXMgPz8gW10pLmZpbmQoKGZpbGUpID0+IGZpbGUudHlwZS5zdGFydHNXaXRoKFwiaW1hZ2UvXCIpKSA/PyBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBlbnF1ZXVlRWRpdG9ySW1hZ2VVcGxvYWQobm90ZUZpbGU6IFRGaWxlLCBlZGl0b3I6IEVkaXRvciwgaW1hZ2VGaWxlOiBGaWxlLCBmaWxlTmFtZTogc3RyaW5nKSB7XG5cbiAgICBhd2FpdCB0aGlzLnVwbG9hZFF1ZXVlLmVucXVldWVFZGl0b3JJbWFnZVVwbG9hZChub3RlRmlsZSwgZWRpdG9yLCBpbWFnZUZpbGUsIGZpbGVOYW1lKTtcbiAgfVxuXG4gIGFzeW5jIHN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50KHNob3dOb3RpY2UgPSB0cnVlKSB7XG4gICAgaWYgKHRoaXMuc3luY0luUHJvZ3Jlc3MpIHtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1NDBDXHU2QjY1XHU2QjYzXHU1NzI4XHU4RkRCXHU4ODRDXHU0RTJEXHUzMDAyXCIsIFwiQSBzeW5jIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MuXCIpLCA0MDAwKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnN5bmNJblByb2dyZXNzID0gdHJ1ZTtcbiAgICB0cnkge1xuICAgICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG4gICAgICBhd2FpdCB0aGlzLndhaXRGb3JQZW5kaW5nVmF1bHRNdXRhdGlvbnMoKTtcbiAgICAgIGNvbnN0IHVwbG9hZHNSZWFkeSA9IGF3YWl0IHRoaXMucHJlcGFyZVBlbmRpbmdVcGxvYWRzRm9yU3luYyhzaG93Tm90aWNlKTtcbiAgICAgIGlmICghdXBsb2Fkc1JlYWR5KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHRoaXMucmVidWlsZFJlZmVyZW5jZUluZGV4KCk7XG5cbiAgICAgIGNvbnN0IHJlbW90ZUludmVudG9yeSA9IGF3YWl0IHRoaXMubGlzdFJlbW90ZVRyZWUodGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpO1xuICAgICAgY29uc3QgZGVsZXRpb25Ub21ic3RvbmVzID0gYXdhaXQgdGhpcy5yZWFkRGVsZXRpb25Ub21ic3RvbmVzKCk7XG4gICAgICBjb25zdCByZW1vdGVGaWxlcyA9IHJlbW90ZUludmVudG9yeS5maWxlcztcbiAgICAgIGNvbnN0IGNvdW50cyA9IHtcbiAgICAgICAgdXBsb2FkZWQ6IDAsIHJlc3RvcmVkRnJvbVJlbW90ZTogMCwgZG93bmxvYWRlZE9yVXBkYXRlZDogMCwgc2tpcHBlZDogMCxcbiAgICAgICAgZGVsZXRlZFJlbW90ZUZpbGVzOiAwLCBkZWxldGVkTG9jYWxGaWxlczogMCwgZGVsZXRlZExvY2FsU3R1YnM6IDAsXG4gICAgICAgIG1pc3NpbmdSZW1vdGVCYWNrZWROb3RlczogMCwgcHVyZ2VkTWlzc2luZ0xhenlOb3RlczogMCxcbiAgICAgICAgZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzOiAwLCBjcmVhdGVkUmVtb3RlRGlyZWN0b3JpZXM6IDAsXG4gICAgICAgIGRlbGV0ZWRMb2NhbERpcmVjdG9yaWVzOiAwLCBjcmVhdGVkTG9jYWxEaXJlY3RvcmllczogMCxcbiAgICAgICAgZXZpY3RlZE5vdGVzOiAwLFxuICAgICAgfTtcblxuICAgICAgYXdhaXQgdGhpcy5yZWNvbmNpbGVPcnBoYW5lZFN5bmNFbnRyaWVzKHJlbW90ZUZpbGVzLCBkZWxldGlvblRvbWJzdG9uZXMsIGNvdW50cyk7XG4gICAgICBhd2FpdCB0aGlzLnJlY29uY2lsZVJlbW90ZU9ubHlGaWxlcyhyZW1vdGVGaWxlcywgZGVsZXRpb25Ub21ic3RvbmVzLCBjb3VudHMpO1xuICAgICAgYXdhaXQgdGhpcy5yZWNvbmNpbGVMb2NhbEZpbGVzKHJlbW90ZUZpbGVzLCBkZWxldGlvblRvbWJzdG9uZXMsIGNvdW50cyk7XG5cbiAgICAgIGNvbnN0IGRpclN0YXRzID0gYXdhaXQgdGhpcy5yZWNvbmNpbGVEaXJlY3RvcmllcyhyZW1vdGVJbnZlbnRvcnkuZGlyZWN0b3JpZXMpO1xuICAgICAgY291bnRzLmRlbGV0ZWRSZW1vdGVEaXJlY3RvcmllcyA9IGRpclN0YXRzLmRlbGV0ZWRSZW1vdGU7XG4gICAgICBjb3VudHMuY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzID0gZGlyU3RhdHMuY3JlYXRlZFJlbW90ZTtcbiAgICAgIGNvdW50cy5kZWxldGVkTG9jYWxEaXJlY3RvcmllcyA9IGRpclN0YXRzLmRlbGV0ZWRMb2NhbDtcbiAgICAgIGNvdW50cy5jcmVhdGVkTG9jYWxEaXJlY3RvcmllcyA9IGRpclN0YXRzLmNyZWF0ZWRMb2NhbDtcbiAgICAgIGF3YWl0IHRoaXMucmVjb25jaWxlUmVtb3RlSW1hZ2VzKCk7XG4gICAgICBjb3VudHMuZXZpY3RlZE5vdGVzID0gYXdhaXQgdGhpcy5ldmljdFN0YWxlU3luY2VkTm90ZXMoZmFsc2UpO1xuXG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLnQoXG4gICAgICAgIGBcdTVERjJcdTUzQ0NcdTU0MTFcdTU0MENcdTZCNjVcdUZGMUFcdTRFMEFcdTRGMjAgJHtjb3VudHMudXBsb2FkZWR9IFx1NEUyQVx1NjU4N1x1NEVGNlx1RkYwQ1x1NEVDRVx1OEZEQ1x1N0FFRlx1NjJDOVx1NTNENiAke2NvdW50cy5yZXN0b3JlZEZyb21SZW1vdGUgKyBjb3VudHMuZG93bmxvYWRlZE9yVXBkYXRlZH0gXHU0RTJBXHU2NTg3XHU0RUY2XHVGRjBDXHU4REYzXHU4RkM3ICR7Y291bnRzLnNraXBwZWR9IFx1NEUyQVx1NjcyQVx1NTNEOFx1NTMxNlx1NjU4N1x1NEVGNlx1RkYwQ1x1NTIyMFx1OTY2NFx1OEZEQ1x1N0FFRlx1NTE4NVx1NUJCOSAke2NvdW50cy5kZWxldGVkUmVtb3RlRmlsZXN9IFx1NEUyQVx1MzAwMVx1NjcyQ1x1NTczMFx1NTE4NVx1NUJCOSAke2NvdW50cy5kZWxldGVkTG9jYWxGaWxlc30gXHU0RTJBJHtjb3VudHMuZGVsZXRlZExvY2FsU3R1YnMgPiAwID8gYFx1RkYwOFx1NTE3Nlx1NEUyRFx1NTkzMVx1NjU0OFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMCAke2NvdW50cy5kZWxldGVkTG9jYWxTdHVic30gXHU3QkM3XHVGRjA5YCA6IFwiXCJ9XHVGRjBDJHtjb3VudHMuZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzID4gMCB8fCBjb3VudHMuY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzID4gMCA/IGBcdTUyMjBcdTk2NjRcdThGRENcdTdBRUZcdTc2RUVcdTVGNTUgJHtjb3VudHMuZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzfSBcdTRFMkFcdTMwMDFcdTUyMUJcdTVFRkFcdThGRENcdTdBRUZcdTc2RUVcdTVGNTUgJHtjb3VudHMuY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzfSBcdTRFMkFcdTMwMDFgIDogXCJcIn0ke2NvdW50cy5kZWxldGVkTG9jYWxEaXJlY3RvcmllcyA+IDAgfHwgY291bnRzLmNyZWF0ZWRMb2NhbERpcmVjdG9yaWVzID4gMCA/IGBcdTUyMjBcdTk2NjRcdTY3MkNcdTU3MzBcdTc2RUVcdTVGNTUgJHtjb3VudHMuZGVsZXRlZExvY2FsRGlyZWN0b3JpZXN9IFx1NEUyQVx1MzAwMVx1NTIxQlx1NUVGQVx1NjcyQ1x1NTczMFx1NzZFRVx1NUY1NSAke2NvdW50cy5jcmVhdGVkTG9jYWxEaXJlY3Rvcmllc30gXHU0RTJBXHUzMDAxYCA6IFwiXCJ9JHtjb3VudHMuZXZpY3RlZE5vdGVzID4gMCA/IGBcdTU2REVcdTY1MzZcdTY3MkNcdTU3MzBcdTY1RTdcdTdCMTRcdThCQjAgJHtjb3VudHMuZXZpY3RlZE5vdGVzfSBcdTdCQzdcdTMwMDFgIDogXCJcIn0ke2NvdW50cy5taXNzaW5nUmVtb3RlQmFja2VkTm90ZXMgPiAwID8gYFx1NTNEMVx1NzNCMCAke2NvdW50cy5taXNzaW5nUmVtb3RlQmFja2VkTm90ZXN9IFx1N0JDN1x1NjMwOVx1OTcwMFx1N0IxNFx1OEJCMFx1N0YzQVx1NUMxMVx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1MzAwMWAgOiBcIlwifSR7Y291bnRzLnB1cmdlZE1pc3NpbmdMYXp5Tm90ZXMgPiAwID8gYFx1Nzg2RVx1OEJBNFx1NkUwNVx1NzQwNlx1NTkzMVx1NjU0OFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMCAke2NvdW50cy5wdXJnZWRNaXNzaW5nTGF6eU5vdGVzfSBcdTdCQzdcdTMwMDFgIDogXCJcIn1cdTMwMDJgLnJlcGxhY2UoL1x1MzAwMVx1MzAwMi8sIFwiXHUzMDAyXCIpLFxuICAgICAgICBgQmlkaXJlY3Rpb25hbCBzeW5jIHVwbG9hZGVkICR7Y291bnRzLnVwbG9hZGVkfSBmaWxlKHMpLCBwdWxsZWQgJHtjb3VudHMucmVzdG9yZWRGcm9tUmVtb3RlICsgY291bnRzLmRvd25sb2FkZWRPclVwZGF0ZWR9IGZpbGUocykgZnJvbSByZW1vdGUsIHNraXBwZWQgJHtjb3VudHMuc2tpcHBlZH0gdW5jaGFuZ2VkIGZpbGUocyksIGRlbGV0ZWQgJHtjb3VudHMuZGVsZXRlZFJlbW90ZUZpbGVzfSByZW1vdGUgY29udGVudCBmaWxlKHMpIGFuZCAke2NvdW50cy5kZWxldGVkTG9jYWxGaWxlc30gbG9jYWwgZmlsZShzKSR7Y291bnRzLmRlbGV0ZWRMb2NhbFN0dWJzID4gMCA/IGAgKGluY2x1ZGluZyAke2NvdW50cy5kZWxldGVkTG9jYWxTdHVic30gc3RhbGUgc3R1YiBub3RlKHMpKWAgOiBcIlwifSR7Y291bnRzLmRlbGV0ZWRSZW1vdGVEaXJlY3RvcmllcyA+IDAgPyBgLCBkZWxldGVkICR7Y291bnRzLmRlbGV0ZWRSZW1vdGVEaXJlY3Rvcmllc30gcmVtb3RlIGRpcmVjdG9yJHtjb3VudHMuZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzID09PSAxID8gXCJ5XCIgOiBcImllc1wifWAgOiBcIlwifSR7Y291bnRzLmNyZWF0ZWRSZW1vdGVEaXJlY3RvcmllcyA+IDAgPyBgLCBjcmVhdGVkICR7Y291bnRzLmNyZWF0ZWRSZW1vdGVEaXJlY3Rvcmllc30gcmVtb3RlIGRpcmVjdG9yJHtjb3VudHMuY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzID09PSAxID8gXCJ5XCIgOiBcImllc1wifWAgOiBcIlwifSR7Y291bnRzLmRlbGV0ZWRMb2NhbERpcmVjdG9yaWVzID4gMCA/IGAsIGRlbGV0ZWQgJHtjb3VudHMuZGVsZXRlZExvY2FsRGlyZWN0b3JpZXN9IGxvY2FsIGVtcHR5IGRpcmVjdG9yJHtjb3VudHMuZGVsZXRlZExvY2FsRGlyZWN0b3JpZXMgPT09IDEgPyBcInlcIiA6IFwiaWVzXCJ9YCA6IFwiXCJ9JHtjb3VudHMuY3JlYXRlZExvY2FsRGlyZWN0b3JpZXMgPiAwID8gYCwgY3JlYXRlZCAke2NvdW50cy5jcmVhdGVkTG9jYWxEaXJlY3Rvcmllc30gbG9jYWwgZGlyZWN0b3Ike2NvdW50cy5jcmVhdGVkTG9jYWxEaXJlY3RvcmllcyA9PT0gMSA/IFwieVwiIDogXCJpZXNcIn1gIDogXCJcIn0ke2NvdW50cy5ldmljdGVkTm90ZXMgPiAwID8gYCwgYW5kIGV2aWN0ZWQgJHtjb3VudHMuZXZpY3RlZE5vdGVzfSBzdGFsZSBsb2NhbCBub3RlKHMpYCA6IFwiXCJ9JHtjb3VudHMubWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzID4gMCA/IGAsIHdoaWxlIGRldGVjdGluZyAke2NvdW50cy5taXNzaW5nUmVtb3RlQmFja2VkTm90ZXN9IGxhenkgbm90ZShzKSBtaXNzaW5nIHRoZWlyIHJlbW90ZSBjb250ZW50YCA6IFwiXCJ9JHtjb3VudHMucHVyZ2VkTWlzc2luZ0xhenlOb3RlcyA+IDAgPyBgLCBhbmQgcHVyZ2VkICR7Y291bnRzLnB1cmdlZE1pc3NpbmdMYXp5Tm90ZXN9IGNvbmZpcm1lZCBicm9rZW4gbGF6eSBwbGFjZWhvbGRlcihzKWAgOiBcIlwifS5gLFxuICAgICAgKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cywgODAwMCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJWYXVsdCBjb250ZW50IHN5bmMgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gRGF0ZS5ub3coKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9IHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTUxODVcdTVCQjlcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIiwgXCJDb250ZW50IHN5bmMgZmFpbGVkXCIpLCBlcnJvcik7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsIDgwMDApO1xuICAgICAgfVxuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLnN5bmNJblByb2dyZXNzID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWNvbmNpbGVPcnBoYW5lZFN5bmNFbnRyaWVzKFxuICAgIHJlbW90ZUZpbGVzOiBNYXA8c3RyaW5nLCBSZW1vdGVGaWxlU3RhdGU+LFxuICAgIGRlbGV0aW9uVG9tYnN0b25lczogTWFwPHN0cmluZywgRGVsZXRpb25Ub21ic3RvbmU+LFxuICAgIGNvdW50czogeyB1cGxvYWRlZDogbnVtYmVyOyByZXN0b3JlZEZyb21SZW1vdGU6IG51bWJlcjsgZG93bmxvYWRlZE9yVXBkYXRlZDogbnVtYmVyOyBza2lwcGVkOiBudW1iZXI7IGRlbGV0ZWRSZW1vdGVGaWxlczogbnVtYmVyOyBkZWxldGVkTG9jYWxGaWxlczogbnVtYmVyOyBkZWxldGVkTG9jYWxTdHViczogbnVtYmVyOyBtaXNzaW5nUmVtb3RlQmFja2VkTm90ZXM6IG51bWJlcjsgcHVyZ2VkTWlzc2luZ0xhenlOb3RlczogbnVtYmVyIH0sXG4gICkge1xuICAgIGNvbnN0IGZpbGVzID0gdGhpcy5zeW5jU3VwcG9ydC5jb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKTtcbiAgICBjb25zdCBjdXJyZW50UGF0aHMgPSBuZXcgU2V0KGZpbGVzLm1hcCgoZmlsZSkgPT4gZmlsZS5wYXRoKSk7XG4gICAgZm9yIChjb25zdCBwYXRoIG9mIFsuLi50aGlzLnN5bmNJbmRleC5rZXlzKCldKSB7XG4gICAgICBpZiAoY3VycmVudFBhdGhzLmhhcyhwYXRoKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcHJldmlvdXMgPSB0aGlzLnN5bmNJbmRleC5nZXQocGF0aCk7XG4gICAgICBpZiAoIXByZXZpb3VzKSB7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShwYXRoKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlbW90ZSA9IHJlbW90ZUZpbGVzLmdldChwcmV2aW91cy5yZW1vdGVQYXRoKTtcbiAgICAgIGlmICghcmVtb3RlKSB7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShwYXRoKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRvbWJzdG9uZSA9IGRlbGV0aW9uVG9tYnN0b25lcy5nZXQocGF0aCk7XG4gICAgICBpZiAodG9tYnN0b25lICYmIHRoaXMuc3luY1N1cHBvcnQuaXNUb21ic3RvbmVBdXRob3JpdGF0aXZlKHRvbWJzdG9uZSwgcmVtb3RlKSkge1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgcmVtb3RlRmlsZXMuZGVsZXRlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKHBhdGgpO1xuICAgICAgICBjb3VudHMuZGVsZXRlZFJlbW90ZUZpbGVzICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUocGF0aCk7XG4gICAgICAgIGRlbGV0aW9uVG9tYnN0b25lcy5kZWxldGUocGF0aCk7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMuZG93bmxvYWRSZW1vdGVGaWxlVG9WYXVsdChwYXRoLCByZW1vdGUpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KHBhdGgsIHtcbiAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlUGF0aDogcmVtb3RlLnJlbW90ZVBhdGgsXG4gICAgICB9KTtcbiAgICAgIGNvdW50cy5yZXN0b3JlZEZyb21SZW1vdGUgKz0gMTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlY29uY2lsZVJlbW90ZU9ubHlGaWxlcyhcbiAgICByZW1vdGVGaWxlczogTWFwPHN0cmluZywgUmVtb3RlRmlsZVN0YXRlPixcbiAgICBkZWxldGlvblRvbWJzdG9uZXM6IE1hcDxzdHJpbmcsIERlbGV0aW9uVG9tYnN0b25lPixcbiAgICBjb3VudHM6IHsgdXBsb2FkZWQ6IG51bWJlcjsgcmVzdG9yZWRGcm9tUmVtb3RlOiBudW1iZXI7IGRvd25sb2FkZWRPclVwZGF0ZWQ6IG51bWJlcjsgc2tpcHBlZDogbnVtYmVyOyBkZWxldGVkUmVtb3RlRmlsZXM6IG51bWJlcjsgZGVsZXRlZExvY2FsRmlsZXM6IG51bWJlcjsgZGVsZXRlZExvY2FsU3R1YnM6IG51bWJlcjsgbWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzOiBudW1iZXI7IHB1cmdlZE1pc3NpbmdMYXp5Tm90ZXM6IG51bWJlciB9LFxuICApIHtcbiAgICBjb25zdCBmaWxlcyA9IHRoaXMuc3luY1N1cHBvcnQuY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCk7XG4gICAgY29uc3QgY3VycmVudFBhdGhzID0gbmV3IFNldChmaWxlcy5tYXAoKGZpbGUpID0+IGZpbGUucGF0aCkpO1xuICAgIGZvciAoY29uc3QgcmVtb3RlIG9mIFsuLi5yZW1vdGVGaWxlcy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5yZW1vdGVQYXRoLmxvY2FsZUNvbXBhcmUoYi5yZW1vdGVQYXRoKSkpIHtcbiAgICAgIGNvbnN0IHZhdWx0UGF0aCA9IHRoaXMuc3luY1N1cHBvcnQucmVtb3RlUGF0aFRvVmF1bHRQYXRoKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgIGlmICghdmF1bHRQYXRoIHx8IGN1cnJlbnRQYXRocy5oYXModmF1bHRQYXRoKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldCh2YXVsdFBhdGgpO1xuICAgICAgaWYgKHRvbWJzdG9uZSkge1xuICAgICAgICBpZiAodGhpcy5zeW5jU3VwcG9ydC5pc1RvbWJzdG9uZUF1dGhvcml0YXRpdmUodG9tYnN0b25lLCByZW1vdGUpKSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgICAgcmVtb3RlRmlsZXMuZGVsZXRlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICBjb3VudHMuZGVsZXRlZFJlbW90ZUZpbGVzICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKHZhdWx0UGF0aCk7XG4gICAgICAgIGRlbGV0aW9uVG9tYnN0b25lcy5kZWxldGUodmF1bHRQYXRoKTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KHZhdWx0UGF0aCwgcmVtb3RlKTtcbiAgICAgIHRoaXMuc3luY0luZGV4LnNldCh2YXVsdFBhdGgsIHtcbiAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlUGF0aDogcmVtb3RlLnJlbW90ZVBhdGgsXG4gICAgICB9KTtcbiAgICAgIGNvdW50cy5yZXN0b3JlZEZyb21SZW1vdGUgKz0gMTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlY29uY2lsZUxvY2FsRmlsZXMoXG4gICAgcmVtb3RlRmlsZXM6IE1hcDxzdHJpbmcsIFJlbW90ZUZpbGVTdGF0ZT4sXG4gICAgZGVsZXRpb25Ub21ic3RvbmVzOiBNYXA8c3RyaW5nLCBEZWxldGlvblRvbWJzdG9uZT4sXG4gICAgY291bnRzOiB7IHVwbG9hZGVkOiBudW1iZXI7IHJlc3RvcmVkRnJvbVJlbW90ZTogbnVtYmVyOyBkb3dubG9hZGVkT3JVcGRhdGVkOiBudW1iZXI7IHNraXBwZWQ6IG51bWJlcjsgZGVsZXRlZFJlbW90ZUZpbGVzOiBudW1iZXI7IGRlbGV0ZWRMb2NhbEZpbGVzOiBudW1iZXI7IGRlbGV0ZWRMb2NhbFN0dWJzOiBudW1iZXI7IG1pc3NpbmdSZW1vdGVCYWNrZWROb3RlczogbnVtYmVyOyBwdXJnZWRNaXNzaW5nTGF6eU5vdGVzOiBudW1iZXIgfSxcbiAgKTogUHJvbWlzZTxTZXQ8c3RyaW5nPj4ge1xuICAgIGNvbnN0IGZpbGVzID0gdGhpcy5zeW5jU3VwcG9ydC5jb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKTtcbiAgICBjb25zdCBsb2NhbFJlbW90ZVBhdGhzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbiAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aChmaWxlLnBhdGgpO1xuICAgICAgbG9jYWxSZW1vdGVQYXRocy5hZGQocmVtb3RlUGF0aCk7XG4gICAgICBjb25zdCByZW1vdGUgPSByZW1vdGVGaWxlcy5nZXQocmVtb3RlUGF0aCk7XG4gICAgICBjb25zdCByZW1vdGVTaWduYXR1cmUgPSByZW1vdGU/LnNpZ25hdHVyZSA/PyBcIlwiO1xuICAgICAgY29uc3QgcHJldmlvdXMgPSB0aGlzLnN5bmNJbmRleC5nZXQoZmlsZS5wYXRoKTtcbiAgICAgIGNvbnN0IG1hcmtkb3duQ29udGVudCA9IGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIgPyBhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSkgOiBudWxsO1xuICAgICAgY29uc3QgbG9jYWxTaWduYXR1cmUgPSBhd2FpdCB0aGlzLmJ1aWxkQ3VycmVudExvY2FsU2lnbmF0dXJlKGZpbGUsIG1hcmtkb3duQ29udGVudCA/PyB1bmRlZmluZWQpO1xuXG4gICAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgICBjb25zdCBzdHViID0gdGhpcy5wYXJzZU5vdGVTdHViKG1hcmtkb3duQ29udGVudCA/PyBcIlwiKTtcbiAgICAgICAgaWYgKHN0dWIpIHtcbiAgICAgICAgICBjb25zdCBzdHViUmVtb3RlID0gcmVtb3RlRmlsZXMuZ2V0KHN0dWIucmVtb3RlUGF0aCk7XG4gICAgICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldChmaWxlLnBhdGgpO1xuICAgICAgICAgIGNvbnN0IHJlc29sdXRpb24gPSBhd2FpdCB0aGlzLnJlc29sdmVMYXp5Tm90ZVN0dWIoZmlsZSwgc3R1Yiwgc3R1YlJlbW90ZSwgdG9tYnN0b25lKTtcbiAgICAgICAgICBpZiAocmVzb2x1dGlvbi5hY3Rpb24gPT09IFwiZGVsZXRlZFwiKSB7XG4gICAgICAgICAgICBjb3VudHMuZGVsZXRlZExvY2FsRmlsZXMgKz0gMTtcbiAgICAgICAgICAgIGNvdW50cy5kZWxldGVkTG9jYWxTdHVicyArPSAxO1xuICAgICAgICAgICAgaWYgKHJlc29sdXRpb24ucHVyZ2VkTWlzc2luZykge1xuICAgICAgICAgICAgICBjb3VudHMucHVyZ2VkTWlzc2luZ0xhenlOb3RlcyArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChyZXNvbHV0aW9uLmFjdGlvbiA9PT0gXCJtaXNzaW5nXCIpIHtcbiAgICAgICAgICAgIGNvdW50cy5taXNzaW5nUmVtb3RlQmFja2VkTm90ZXMgKz0gMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHN0dWJSZW1vdGU/LnNpZ25hdHVyZSA/PyBwcmV2aW91cz8ucmVtb3RlU2lnbmF0dXJlID8/IFwiXCIsXG4gICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGNvdW50cy5za2lwcGVkICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldChmaWxlLnBhdGgpO1xuICAgICAgY29uc3QgdW5jaGFuZ2VkU2luY2VMYXN0U3luYyA9IHByZXZpb3VzID8gcHJldmlvdXMubG9jYWxTaWduYXR1cmUgPT09IGxvY2FsU2lnbmF0dXJlIDogZmFsc2U7XG4gICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB1bmNoYW5nZWRTaW5jZUxhc3RTeW5jICYmXG4gICAgICAgICAgdGhpcy5zeW5jU3VwcG9ydC5zaG91bGREZWxldGVMb2NhbEZyb21Ub21ic3RvbmUoZmlsZSwgdG9tYnN0b25lKSAmJlxuICAgICAgICAgIHRoaXMuc3luY1N1cHBvcnQuaXNUb21ic3RvbmVBdXRob3JpdGF0aXZlKHRvbWJzdG9uZSwgcmVtb3RlKVxuICAgICAgICApIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLnJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGUpO1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgICAgIGNvdW50cy5kZWxldGVkTG9jYWxGaWxlcyArPSAxO1xuICAgICAgICAgIGlmIChyZW1vdGUpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlQ29udGVudEZpbGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICAgICAgcmVtb3RlRmlsZXMuZGVsZXRlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICAgIGNvdW50cy5kZWxldGVkUmVtb3RlRmlsZXMgKz0gMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCk7XG4gICAgICAgIGRlbGV0aW9uVG9tYnN0b25lcy5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCwgbWFya2Rvd25Db250ZW50ID8/IHVuZGVmaW5lZCk7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICB9KTtcbiAgICAgICAgcmVtb3RlRmlsZXMuc2V0KHJlbW90ZVBhdGgsIHVwbG9hZGVkUmVtb3RlKTtcbiAgICAgICAgY291bnRzLnVwbG9hZGVkICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXByZXZpb3VzKSB7XG4gICAgICAgIGlmIChsb2NhbFNpZ25hdHVyZSA9PT0gcmVtb3RlU2lnbmF0dXJlKSB7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwgeyBsb2NhbFNpZ25hdHVyZSwgcmVtb3RlU2lnbmF0dXJlLCByZW1vdGVQYXRoIH0pO1xuICAgICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgICBjb3VudHMuc2tpcHBlZCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuc3luY1N1cHBvcnQuc2hvdWxkRG93bmxvYWRSZW1vdGVWZXJzaW9uKGZpbGUuc3RhdC5tdGltZSwgcmVtb3RlLmxhc3RNb2RpZmllZCkpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgICAgICAgIGNvbnN0IHJlZnJlc2hlZCA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUocmVmcmVzaGVkKSA6IHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgY291bnRzLmRvd25sb2FkZWRPclVwZGF0ZWQgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHVwbG9hZGVkUmVtb3RlID0gYXdhaXQgdGhpcy51cGxvYWRDb250ZW50RmlsZVRvUmVtb3RlKGZpbGUsIHJlbW90ZVBhdGgsIG1hcmtkb3duQ29udGVudCA/PyB1bmRlZmluZWQpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiB1cGxvYWRlZFJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlbW90ZUZpbGVzLnNldChyZW1vdGVQYXRoLCB1cGxvYWRlZFJlbW90ZSk7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgY291bnRzLnVwbG9hZGVkICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBsb2NhbENoYW5nZWQgPSBwcmV2aW91cy5sb2NhbFNpZ25hdHVyZSAhPT0gbG9jYWxTaWduYXR1cmUgfHwgcHJldmlvdXMucmVtb3RlUGF0aCAhPT0gcmVtb3RlUGF0aDtcbiAgICAgIGNvbnN0IHJlbW90ZUNoYW5nZWQgPSBwcmV2aW91cy5yZW1vdGVTaWduYXR1cmUgIT09IHJlbW90ZVNpZ25hdHVyZSB8fCBwcmV2aW91cy5yZW1vdGVQYXRoICE9PSByZW1vdGVQYXRoO1xuICAgICAgaWYgKCFsb2NhbENoYW5nZWQgJiYgIXJlbW90ZUNoYW5nZWQpIHtcbiAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghbG9jYWxDaGFuZ2VkICYmIHJlbW90ZUNoYW5nZWQpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KGZpbGUucGF0aCwgcmVtb3RlLCBmaWxlKTtcbiAgICAgICAgY29uc3QgcmVmcmVzaGVkID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZWZyZXNoZWQgPyBhd2FpdCB0aGlzLmJ1aWxkQ3VycmVudExvY2FsU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICBjb3VudHMuZG93bmxvYWRlZE9yVXBkYXRlZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGxvY2FsQ2hhbmdlZCAmJiAhcmVtb3RlQ2hhbmdlZCkge1xuICAgICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoLCBtYXJrZG93bkNvbnRlbnQgPz8gdW5kZWZpbmVkKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICByZW1vdGVGaWxlcy5zZXQocmVtb3RlUGF0aCwgdXBsb2FkZWRSZW1vdGUpO1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCk7XG4gICAgICAgIGNvdW50cy51cGxvYWRlZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuc3luY1N1cHBvcnQuc2hvdWxkRG93bmxvYWRSZW1vdGVWZXJzaW9uKGZpbGUuc3RhdC5tdGltZSwgcmVtb3RlLmxhc3RNb2RpZmllZCkpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KGZpbGUucGF0aCwgcmVtb3RlLCBmaWxlKTtcbiAgICAgICAgY29uc3QgcmVmcmVzaGVkID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZWZyZXNoZWQgPyBhd2FpdCB0aGlzLmJ1aWxkQ3VycmVudExvY2FsU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICBjb3VudHMuZG93bmxvYWRlZE9yVXBkYXRlZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCwgbWFya2Rvd25Db250ZW50ID8/IHVuZGVmaW5lZCk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIH0pO1xuICAgICAgcmVtb3RlRmlsZXMuc2V0KHJlbW90ZVBhdGgsIHVwbG9hZGVkUmVtb3RlKTtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgIGNvdW50cy51cGxvYWRlZCArPSAxO1xuICAgIH1cblxuICAgIHJldHVybiBsb2NhbFJlbW90ZVBhdGhzO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICAgIG1ldGhvZDogXCJERUxFVEVcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gNDA0ICYmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBERUxFVEUgZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGRlbGV0ZSByZW1vdGUgc3luY2VkIGNvbnRlbnRcIiwgcmVtb3RlUGF0aCwgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB3cml0ZURlbGV0aW9uVG9tYnN0b25lKHZhdWx0UGF0aDogc3RyaW5nLCByZW1vdGVTaWduYXR1cmU/OiBzdHJpbmcpIHtcbiAgICBjb25zdCBwYXlsb2FkOiBEZWxldGlvblRvbWJzdG9uZSA9IHtcbiAgICAgIHBhdGg6IHZhdWx0UGF0aCxcbiAgICAgIGRlbGV0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICAgIHJlbW90ZVNpZ25hdHVyZSxcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KFxuICAgICAgdGhpcy5zeW5jU3VwcG9ydC5idWlsZERlbGV0aW9uUmVtb3RlUGF0aCh2YXVsdFBhdGgpLFxuICAgICAgdGhpcy5lbmNvZGVVdGY4KEpTT04uc3RyaW5naWZ5KHBheWxvYWQpKSxcbiAgICAgIFwiYXBwbGljYXRpb24vanNvbjsgY2hhcnNldD11dGYtOFwiLFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlQ29udGVudEZpbGUodGhpcy5zeW5jU3VwcG9ydC5idWlsZERlbGV0aW9uUmVtb3RlUGF0aCh2YXVsdFBhdGgpKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIFRvbWJzdG9uZSBjbGVhbnVwIHNob3VsZCBub3QgYnJlYWsgdGhlIG1haW4gc3luYyBmbG93LlxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVhZERlbGV0aW9uVG9tYnN0b25lKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHRoaXMuc3luY1N1cHBvcnQuYnVpbGREZWxldGlvblJlbW90ZVBhdGgodmF1bHRQYXRoKSksXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gNDA0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgdGhpcy5hc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2UsIFwiR0VUIHRvbWJzdG9uZVwiKTtcblxuICAgIHJldHVybiB0aGlzLnN5bmNTdXBwb3J0LnBhcnNlRGVsZXRpb25Ub21ic3RvbmVQYXlsb2FkKHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlcikpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWFkRGVsZXRpb25Ub21ic3RvbmVzKCkge1xuICAgIGNvbnN0IHRvbWJzdG9uZXMgPSBuZXcgTWFwPHN0cmluZywgRGVsZXRpb25Ub21ic3RvbmU+KCk7XG4gICAgY29uc3QgaW52ZW50b3J5ID0gYXdhaXQgdGhpcy5saXN0UmVtb3RlVHJlZSh0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkRGVsZXRpb25Gb2xkZXIoKSk7XG4gICAgZm9yIChjb25zdCByZW1vdGUgb2YgaW52ZW50b3J5LmZpbGVzLnZhbHVlcygpKSB7XG4gICAgICBjb25zdCB2YXVsdFBhdGggPSB0aGlzLnN5bmNTdXBwb3J0LnJlbW90ZURlbGV0aW9uUGF0aFRvVmF1bHRQYXRoKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgIGlmICghdmF1bHRQYXRoKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGUucmVtb3RlUGF0aCksXG4gICAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9tYnN0b25lID0gdGhpcy5zeW5jU3VwcG9ydC5wYXJzZURlbGV0aW9uVG9tYnN0b25lUGF5bG9hZCh0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpKTtcbiAgICAgIGlmICh0b21ic3RvbmUpIHtcbiAgICAgICAgdG9tYnN0b25lcy5zZXQodmF1bHRQYXRoLCB0b21ic3RvbmUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0b21ic3RvbmVzO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRWYXVsdEZpbGVCeVBhdGgocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKTtcbiAgICByZXR1cm4gZmlsZSBpbnN0YW5jZW9mIFRGaWxlID8gZmlsZSA6IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGU6IFRGaWxlKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmRlbGV0ZShmaWxlLCB0cnVlKTtcbiAgICB9IGNhdGNoIChkZWxldGVFcnJvcikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQudHJhc2goZmlsZSwgdHJ1ZSk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgdGhyb3cgZGVsZXRlRXJyb3I7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBlbnN1cmVMb2NhbFBhcmVudEZvbGRlcnMocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVBhdGgocGF0aCk7XG4gICAgY29uc3Qgc2VnbWVudHMgPSBub3JtYWxpemVkLnNwbGl0KFwiL1wiKS5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPiAwKTtcbiAgICBpZiAoc2VnbWVudHMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgY3VycmVudCA9IFwiXCI7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHNlZ21lbnRzLmxlbmd0aCAtIDE7IGluZGV4ICs9IDEpIHtcbiAgICAgIGN1cnJlbnQgPSBjdXJyZW50ID8gYCR7Y3VycmVudH0vJHtzZWdtZW50c1tpbmRleF19YCA6IHNlZ21lbnRzW2luZGV4XTtcbiAgICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGN1cnJlbnQpO1xuICAgICAgaWYgKCFleGlzdGluZykge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVGb2xkZXIoY3VycmVudCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KHZhdWx0UGF0aDogc3RyaW5nLCByZW1vdGU6IFJlbW90ZUZpbGVTdGF0ZSwgZXhpc3RpbmdGaWxlPzogVEZpbGUpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlLnJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICB0aGlzLmFzc2VydFJlc3BvbnNlU3VjY2VzcyhyZXNwb25zZSwgXCJHRVRcIik7XG5cbiAgICBhd2FpdCB0aGlzLmVuc3VyZUxvY2FsUGFyZW50Rm9sZGVycyh2YXVsdFBhdGgpO1xuICAgIGNvbnN0IGN1cnJlbnQgPSBleGlzdGluZ0ZpbGUgPz8gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgodmF1bHRQYXRoKTtcbiAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgbXRpbWU6IHJlbW90ZS5sYXN0TW9kaWZpZWQgPiAwID8gcmVtb3RlLmxhc3RNb2RpZmllZCA6IERhdGUubm93KCksXG4gICAgfTtcbiAgICBpZiAoIWN1cnJlbnQpIHtcbiAgICAgIGlmICh2YXVsdFBhdGgudG9Mb3dlckNhc2UoKS5lbmRzV2l0aChcIi5tZFwiKSkge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGUodmF1bHRQYXRoLCB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpLCBvcHRpb25zKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZUJpbmFyeSh2YXVsdFBhdGgsIHJlc3BvbnNlLmFycmF5QnVmZmVyLCBvcHRpb25zKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoY3VycmVudC5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGN1cnJlbnQsIHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlciksIG9wdGlvbnMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnlCaW5hcnkoY3VycmVudCwgcmVzcG9uc2UuYXJyYXlCdWZmZXIsIG9wdGlvbnMpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdmVyaWZ5UmVtb3RlQmluYXJ5Um91bmRUcmlwKHJlbW90ZVBhdGg6IHN0cmluZywgZXhwZWN0ZWQ6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmFycmF5QnVmZmVyc0VxdWFsKGV4cGVjdGVkLCByZXNwb25zZS5hcnJheUJ1ZmZlcik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHN0YXRSZW1vdGVGaWxlKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJQUk9QRklORFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICBEZXB0aDogXCIwXCIsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gNDA0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgdGhpcy5hc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2UsIGBQUk9QRklORCBmb3IgJHtyZW1vdGVQYXRofWApO1xuXG4gICAgY29uc3QgeG1sVGV4dCA9IHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlcik7XG4gICAgY29uc3QgZW50cmllcyA9IHRoaXMucGFyc2VQcm9wZmluZERpcmVjdG9yeUxpc3RpbmcoeG1sVGV4dCwgcmVtb3RlUGF0aCwgdHJ1ZSk7XG4gICAgcmV0dXJuIGVudHJpZXMuZmluZCgoZW50cnkpID0+ICFlbnRyeS5pc0NvbGxlY3Rpb24pPy5maWxlID8/IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZTogVEZpbGUsIHJlbW90ZVBhdGg6IHN0cmluZywgbWFya2Rvd25Db250ZW50Pzogc3RyaW5nKSB7XG4gICAgbGV0IGJpbmFyeTogQXJyYXlCdWZmZXI7XG5cbiAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgY29uc3QgY29udGVudCA9IG1hcmtkb3duQ29udGVudCA/PyAoYXdhaXQgdGhpcy5yZWFkTWFya2Rvd25Db250ZW50UHJlZmVyRWRpdG9yKGZpbGUpKTtcbiAgICAgIGlmICh0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgIHRoaXMudChcbiAgICAgICAgICAgIFwiXHU2MkQyXHU3RUREXHU2MjhBXHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU1MzYwXHU0RjREXHU3QjE0XHU4QkIwXHU0RTBBXHU0RjIwXHU0RTNBXHU4RkRDXHU3QUVGXHU2QjYzXHU2NTg3XHUzMDAyXCIsXG4gICAgICAgICAgICBcIlJlZnVzaW5nIHRvIHVwbG9hZCBhIGxhenktbm90ZSBwbGFjZWhvbGRlciBhcyByZW1vdGUgbm90ZSBjb250ZW50LlwiLFxuICAgICAgICAgICksXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGJpbmFyeSA9IHRoaXMuZW5jb2RlVXRmOChjb250ZW50KTtcbiAgICB9IGVsc2Uge1xuICAgICAgYmluYXJ5ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZEJpbmFyeShmaWxlKTtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBiaW5hcnksIHRoaXMuZ2V0TWltZVR5cGUoZmlsZS5leHRlbnNpb24pKTtcbiAgICBjb25zdCByZW1vdGUgPSBhd2FpdCB0aGlzLnN0YXRSZW1vdGVGaWxlKHJlbW90ZVBhdGgpO1xuICAgIGlmIChyZW1vdGUpIHtcbiAgICAgIHJldHVybiByZW1vdGU7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJlbW90ZVBhdGgsXG4gICAgICBsYXN0TW9kaWZpZWQ6IGZpbGUuc3RhdC5tdGltZSxcbiAgICAgIHNpemU6IGZpbGUuc3RhdC5zaXplLFxuICAgICAgc2lnbmF0dXJlOiB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkU3luY1NpZ25hdHVyZShmaWxlKSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVSZW1vdGVTeW5jZWRFbnRyeSh2YXVsdFBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5zeW5jSW5kZXguZ2V0KHZhdWx0UGF0aCk7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IGV4aXN0aW5nPy5yZW1vdGVQYXRoID8/IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKHZhdWx0UGF0aCk7XG4gICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGVQYXRoKTtcbiAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUodmF1bHRQYXRoKTtcbiAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVGaWxlT3BlbihmaWxlOiBURmlsZSB8IG51bGwpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHx8IGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzLnNldChmaWxlLnBhdGgsIERhdGUubm93KCkpO1xuICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG5cbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBjb25zdCBzdHViID0gdGhpcy5wYXJzZU5vdGVTdHViKGNvbnRlbnQpO1xuICAgIGlmICghc3R1Yikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZW1vdGUgPSBhd2FpdCB0aGlzLnN0YXRSZW1vdGVGaWxlKHN0dWIucmVtb3RlUGF0aCk7XG4gICAgICBjb25zdCB0b21ic3RvbmUgPSAhcmVtb3RlID8gYXdhaXQgdGhpcy5yZWFkRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKSA6IHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IHJlc29sdXRpb24gPSBhd2FpdCB0aGlzLnJlc29sdmVMYXp5Tm90ZVN0dWIoZmlsZSwgc3R1YiwgcmVtb3RlLCB0b21ic3RvbmUpO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcblxuICAgICAgaWYgKHJlc29sdXRpb24uYWN0aW9uID09PSBcImRlbGV0ZWRcIikge1xuICAgICAgICBuZXcgTm90aWNlKFxuICAgICAgICAgIHRoaXMudChcbiAgICAgICAgICAgIHJlc29sdXRpb24ucHVyZ2VkTWlzc2luZ1xuICAgICAgICAgICAgICA/IGBcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdThGREVcdTdFRURcdTdGM0FcdTU5MzFcdUZGMENcdTVERjJcdTc5RkJcdTk2NjRcdTY3MkNcdTU3MzBcdTU5MzFcdTY1NDhcdTUzNjBcdTRGNERcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YFxuICAgICAgICAgICAgICA6IGBcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTRFMERcdTVCNThcdTU3MjhcdUZGMENcdTVERjJcdTc5RkJcdTk2NjRcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICAgICAgIHJlc29sdXRpb24ucHVyZ2VkTWlzc2luZ1xuICAgICAgICAgICAgICA/IGBSZW1vdGUgbm90ZSB3YXMgbWlzc2luZyByZXBlYXRlZGx5LCByZW1vdmVkIGxvY2FsIGJyb2tlbiBwbGFjZWhvbGRlcjogJHtmaWxlLmJhc2VuYW1lfWBcbiAgICAgICAgICAgICAgOiBgUmVtb3RlIG5vdGUgbWlzc2luZywgcmVtb3ZlZCBsb2NhbCBwbGFjZWhvbGRlcjogJHtmaWxlLmJhc2VuYW1lfWAsXG4gICAgICAgICAgKSxcbiAgICAgICAgICByZXNvbHV0aW9uLnB1cmdlZE1pc3NpbmcgPyA4MDAwIDogNjAwMCxcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVzb2x1dGlvbi5hY3Rpb24gPT09IFwibWlzc2luZ1wiKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU4RkRDXHU3QUVGXHU2QjYzXHU2NTg3XHU0RTBEXHU1QjU4XHU1NzI4XHVGRjBDXHU1RjUzXHU1MjREXHU1MTQ4XHU0RkREXHU3NTU5XHU2NzJDXHU1NzMwXHU1MzYwXHU0RjREXHU3QjE0XHU4QkIwXHU0RUU1XHU5NjMyXHU0RTM0XHU2NUY2XHU1RjAyXHU1RTM4XHVGRjFCXHU4MkU1XHU1MThEXHU2QjIxXHU3ODZFXHU4QkE0XHU3RjNBXHU1OTMxXHVGRjBDXHU1QzA2XHU4MUVBXHU1MkE4XHU2RTA1XHU3NDA2XHU4QkU1XHU1MzYwXHU0RjREXHUzMDAyXCIsIFwiUmVtb3RlIG5vdGUgaXMgbWlzc2luZy4gVGhlIGxvY2FsIHBsYWNlaG9sZGVyIHdhcyBrZXB0IGZvciBub3cgaW4gY2FzZSB0aGlzIGlzIHRyYW5zaWVudDsgaXQgd2lsbCBiZSBjbGVhbmVkIGF1dG9tYXRpY2FsbHkgaWYgdGhlIHJlbW90ZSBpcyBzdGlsbCBtaXNzaW5nIG9uIHRoZSBuZXh0IGNvbmZpcm1hdGlvbi5cIiksIDgwMDApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIG5ldyBOb3RpY2UodGhpcy50KGBcdTVERjJcdTRFQ0VcdThGRENcdTdBRUZcdTYwNjJcdTU5MERcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YCwgYFJlc3RvcmVkIG5vdGUgZnJvbSByZW1vdGU6ICR7ZmlsZS5iYXNlbmFtZX1gKSwgNjAwMCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gaHlkcmF0ZSBub3RlIGZyb20gcmVtb3RlXCIsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1OEZEQ1x1N0FFRlx1NjA2Mlx1NTkwRFx1N0IxNFx1OEJCMFx1NTkzMVx1OEQyNVwiLCBcIkZhaWxlZCB0byByZXN0b3JlIG5vdGUgZnJvbSByZW1vdGVcIiksIGVycm9yKSwgODAwMCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBnZXRPcGVuTWFya2Rvd25Db250ZW50KG5vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBsZWF2ZXMgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFwibWFya2Rvd25cIik7XG4gICAgZm9yIChjb25zdCBsZWFmIG9mIGxlYXZlcykge1xuICAgICAgY29uc3QgdmlldyA9IGxlYWYudmlldztcbiAgICAgIGlmICghKHZpZXcgaW5zdGFuY2VvZiBNYXJrZG93blZpZXcpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXZpZXcuZmlsZSB8fCB2aWV3LmZpbGUucGF0aCAhPT0gbm90ZVBhdGgpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB2aWV3LmVkaXRvci5nZXRWYWx1ZSgpO1xuICAgIH1cblxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWFkTWFya2Rvd25Db250ZW50UHJlZmVyRWRpdG9yKGZpbGU6IFRGaWxlKSB7XG4gICAgY29uc3QgbGl2ZUNvbnRlbnQgPSB0aGlzLmdldE9wZW5NYXJrZG93bkNvbnRlbnQoZmlsZS5wYXRoKTtcbiAgICBpZiAobGl2ZUNvbnRlbnQgIT09IG51bGwpIHtcbiAgICAgIHJldHVybiBsaXZlQ29udGVudDtcbiAgICB9XG5cbiAgICByZXR1cm4gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUoZmlsZTogVEZpbGUsIG1hcmtkb3duQ29udGVudD86IHN0cmluZykge1xuICAgIGlmIChmaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiKSB7XG4gICAgICByZXR1cm4gdGhpcy5zeW5jU3VwcG9ydC5idWlsZFN5bmNTaWduYXR1cmUoZmlsZSk7XG4gICAgfVxuXG4gICAgY29uc3QgY29udGVudCA9IG1hcmtkb3duQ29udGVudCA/PyAoYXdhaXQgdGhpcy5yZWFkTWFya2Rvd25Db250ZW50UHJlZmVyRWRpdG9yKGZpbGUpKTtcbiAgICBjb25zdCBkaWdlc3QgPSAoYXdhaXQgdGhpcy5jb21wdXRlU2hhMjU2SGV4KHRoaXMuZW5jb2RlVXRmOChjb250ZW50KSkpLnNsaWNlKDAsIDE2KTtcbiAgICByZXR1cm4gYG1kOiR7Y29udGVudC5sZW5ndGh9OiR7ZGlnZXN0fWA7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlY29uY2lsZVJlbW90ZUltYWdlcygpIHtcbiAgICByZXR1cm4geyBkZWxldGVkRmlsZXM6IDAsIGRlbGV0ZWREaXJlY3RvcmllczogMCB9O1xuICB9XG5cbiAgcHJpdmF0ZSBtYXJrTWlzc2luZ0xhenlSZW1vdGUocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCBwcmV2aW91cyA9IHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3Rlcy5nZXQocGF0aCk7XG4gICAgY29uc3QgbmV4dDogTWlzc2luZ0xhenlSZW1vdGVSZWNvcmQgPSBwcmV2aW91c1xuICAgICAgPyB7XG4gICAgICAgICAgZmlyc3REZXRlY3RlZEF0OiBwcmV2aW91cy5maXJzdERldGVjdGVkQXQsXG4gICAgICAgICAgbGFzdERldGVjdGVkQXQ6IG5vdyxcbiAgICAgICAgICBtaXNzQ291bnQ6IHByZXZpb3VzLm1pc3NDb3VudCArIDEsXG4gICAgICAgIH1cbiAgICAgIDoge1xuICAgICAgICAgIGZpcnN0RGV0ZWN0ZWRBdDogbm93LFxuICAgICAgICAgIGxhc3REZXRlY3RlZEF0OiBub3csXG4gICAgICAgICAgbWlzc0NvdW50OiAxLFxuICAgICAgICB9O1xuICAgIHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3Rlcy5zZXQocGF0aCwgbmV4dCk7XG4gICAgcmV0dXJuIG5leHQ7XG4gIH1cblxuICBwcml2YXRlIGNsZWFyTWlzc2luZ0xhenlSZW1vdGUocGF0aDogc3RyaW5nKSB7XG4gICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzLmRlbGV0ZShwYXRoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTaGFyZWQgbG9naWMgZm9yIHJlc29sdmluZyBhIGxhenktbm90ZSBzdHViIGluIGJvdGggaGFuZGxlRmlsZU9wZW4gYW5kXG4gICAqIHN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50LiAgQ2FsbGVycyBwcm92aWRlIHRoZSBhbHJlYWR5LWxvb2tlZC11cCByZW1vdGVcbiAgICogc3RhdGUgKG9yIG51bGwpIGFuZCBhbiBvcHRpb25hbCB0b21ic3RvbmUuXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIHJlc29sdmVMYXp5Tm90ZVN0dWIoXG4gICAgZmlsZTogVEZpbGUsXG4gICAgc3R1YjogeyByZW1vdGVQYXRoOiBzdHJpbmcgfSxcbiAgICByZW1vdGU6IFJlbW90ZUZpbGVTdGF0ZSB8IG51bGwgfCB1bmRlZmluZWQsXG4gICAgdG9tYnN0b25lOiBEZWxldGlvblRvbWJzdG9uZSB8IHVuZGVmaW5lZCxcbiAgKTogUHJvbWlzZTx7IGFjdGlvbjogXCJkZWxldGVkXCIgfCBcInJlc3RvcmVkXCIgfCBcIm1pc3NpbmdcIjsgcHVyZ2VkTWlzc2luZz86IGJvb2xlYW4gfT4ge1xuICAgIGlmICghcmVtb3RlKSB7XG4gICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucmVtb3ZlTG9jYWxWYXVsdEZpbGUoZmlsZSk7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgICB0aGlzLmNsZWFyTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICAgICAgcmV0dXJuIHsgYWN0aW9uOiBcImRlbGV0ZWRcIiwgZGVsZXRlZFN0dWI6IHRydWUgfTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbWlzc2luZ1JlY29yZCA9IHRoaXMubWFya01pc3NpbmdMYXp5UmVtb3RlKGZpbGUucGF0aCk7XG4gICAgICBpZiAobWlzc2luZ1JlY29yZC5taXNzQ291bnQgPj0gdGhpcy5taXNzaW5nTGF6eVJlbW90ZUNvbmZpcm1hdGlvbnMpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5yZW1vdmVMb2NhbFZhdWx0RmlsZShmaWxlKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICAgIHRoaXMuY2xlYXJNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgICByZXR1cm4geyBhY3Rpb246IFwiZGVsZXRlZFwiLCBkZWxldGVkU3R1YjogdHJ1ZSwgcHVyZ2VkTWlzc2luZzogdHJ1ZSB9O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4geyBhY3Rpb246IFwibWlzc2luZ1wiIH07XG4gICAgfVxuXG4gICAgdGhpcy5jbGVhck1pc3NpbmdMYXp5UmVtb3RlKGZpbGUucGF0aCk7XG4gICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KGZpbGUucGF0aCwgcmVtb3RlLCBmaWxlKTtcbiAgICBjb25zdCByZWZyZXNoZWQgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChmaWxlLnBhdGgpO1xuICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgIGxvY2FsU2lnbmF0dXJlOiByZWZyZXNoZWQgPyB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkU3luY1NpZ25hdHVyZShyZWZyZXNoZWQpIDogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgIHJlbW90ZVNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgIHJlbW90ZVBhdGg6IHN0dWIucmVtb3RlUGF0aCxcbiAgICB9KTtcbiAgICByZXR1cm4geyBhY3Rpb246IFwicmVzdG9yZWRcIiB9O1xuICB9XG5cbiAgcHJpdmF0ZSBwYXJzZU5vdGVTdHViKGNvbnRlbnQ6IHN0cmluZykge1xuICAgIGNvbnN0IG1hdGNoID0gY29udGVudC5tYXRjaChcbiAgICAgIC9ePCEtLVxccypzZWN1cmUtd2ViZGF2LW5vdGUtc3R1YlxccypcXHI/XFxucmVtb3RlOlxccyooLis/KVxccj9cXG5wbGFjZWhvbGRlcjpcXHMqKC4qPylcXHI/XFxuLS0+L3MsXG4gICAgKTtcbiAgICBpZiAoIW1hdGNoKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgcmVtb3RlUGF0aDogbWF0Y2hbMV0udHJpbSgpLFxuICAgICAgcGxhY2Vob2xkZXI6IG1hdGNoWzJdLnRyaW0oKSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZE5vdGVTdHViKGZpbGU6IFRGaWxlKSB7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgcmV0dXJuIFtcbiAgICAgIGA8IS0tICR7U0VDVVJFX05PVEVfU1RVQn1gLFxuICAgICAgYHJlbW90ZTogJHtyZW1vdGVQYXRofWAsXG4gICAgICBgcGxhY2Vob2xkZXI6ICR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgXCItLT5cIixcbiAgICAgIFwiXCIsXG4gICAgICB0aGlzLnQoXG4gICAgICAgIGBcdThGRDlcdTY2MkZcdTRFMDBcdTdCQzdcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTdCMTRcdThCQjBcdTc2ODRcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTY1ODdcdTRFRjZcdTMwMDJcdTYyNTNcdTVGMDBcdThGRDlcdTdCQzdcdTdCMTRcdThCQjBcdTY1RjZcdUZGMENcdTYzRDJcdTRFRjZcdTRGMUFcdTRFQ0VcdThGRENcdTdBRUZcdTU0MENcdTZCNjVcdTc2RUVcdTVGNTVcdTYwNjJcdTU5MERcdTVCOENcdTY1NzRcdTUxODVcdTVCQjlcdTMwMDJgLFxuICAgICAgICBgVGhpcyBpcyBhIGxvY2FsIHBsYWNlaG9sZGVyIGZvciBhbiBvbi1kZW1hbmQgbm90ZS4gT3BlbmluZyB0aGUgbm90ZSByZXN0b3JlcyB0aGUgZnVsbCBjb250ZW50IGZyb20gdGhlIHJlbW90ZSBzeW5jIGZvbGRlci5gLFxuICAgICAgKSxcbiAgICBdLmpvaW4oXCJcXG5cIik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGV2aWN0U3RhbGVTeW5jZWROb3RlcyhzaG93Tm90aWNlOiBib29sZWFuKSB7XG4gICAgdHJ5IHtcbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLm5vdGVTdG9yYWdlTW9kZSAhPT0gXCJsYXp5LW5vdGVzXCIpIHtcbiAgICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NUY1M1x1NTI0RFx1NjcyQVx1NTQyRlx1NzUyOFx1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFx1NkEyMVx1NUYwRlx1MzAwMlwiLCBcIkxhenkgbm90ZSBtb2RlIGlzIG5vdCBlbmFibGVkLlwiKSwgNjAwMCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGZpbGVzID0gdGhpcy5zeW5jU3VwcG9ydC5jb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKS5maWx0ZXIoKGZpbGUpID0+IGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpO1xuICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICAgIGNvbnN0IHRocmVzaG9sZCA9IE1hdGgubWF4KDEsIHRoaXMuc2V0dGluZ3Mubm90ZUV2aWN0QWZ0ZXJEYXlzKSAqIDI0ICogNjAgKiA2MCAqIDEwMDA7XG4gICAgICBsZXQgZXZpY3RlZCA9IDA7XG5cbiAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuICAgICAgICBjb25zdCBhY3RpdmUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xuICAgICAgICBpZiAoYWN0aXZlPy5wYXRoID09PSBmaWxlLnBhdGgpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGxhc3RBY2Nlc3MgPSB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzLmdldChmaWxlLnBhdGgpID8/IDA7XG4gICAgICAgIGlmIChsYXN0QWNjZXNzICE9PSAwICYmIG5vdyAtIGxhc3RBY2Nlc3MgPCB0aHJlc2hvbGQpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICBpZiAodGhpcy5wYXJzZU5vdGVTdHViKGNvbnRlbnQpKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBiaW5hcnkgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5zeW5jU3VwcG9ydC5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgYXdhaXQgdGhpcy51cGxvYWRCaW5hcnkocmVtb3RlUGF0aCwgYmluYXJ5LCBcInRleHQvbWFya2Rvd247IGNoYXJzZXQ9dXRmLThcIik7XG4gICAgICAgIGNvbnN0IHZlcmlmaWVkID0gYXdhaXQgdGhpcy52ZXJpZnlSZW1vdGVCaW5hcnlSb3VuZFRyaXAocmVtb3RlUGF0aCwgYmluYXJ5KTtcbiAgICAgICAgaWYgKCF2ZXJpZmllZCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTY4MjFcdTlBOENcdTU5MzFcdThEMjVcdUZGMENcdTVERjJcdTUzRDZcdTZEODhcdTU2REVcdTY1MzZcdTY3MkNcdTU3MzBcdTdCMTRcdThCQjBcdTMwMDJcIiwgXCJSZW1vdGUgbm90ZSB2ZXJpZmljYXRpb24gZmFpbGVkLCBsb2NhbCBub3RlIGV2aWN0aW9uIHdhcyBjYW5jZWxsZWQuXCIpKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZW1vdGUgPSBhd2FpdCB0aGlzLnN0YXRSZW1vdGVGaWxlKHJlbW90ZVBhdGgpO1xuICAgICAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTUxNDNcdTY1NzBcdTYzNkVcdTdGM0FcdTU5MzFcdUZGMENcdTVERjJcdTUzRDZcdTZEODhcdTU2REVcdTY1MzZcdTY3MkNcdTU3MzBcdTdCMTRcdThCQjBcdTMwMDJcIiwgXCJSZW1vdGUgbm90ZSBtZXRhZGF0YSBpcyBtaXNzaW5nLCBsb2NhbCBub3RlIGV2aWN0aW9uIHdhcyBjYW5jZWxsZWQuXCIpKTtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdGhpcy5idWlsZE5vdGVTdHViKGZpbGUpKTtcbiAgICAgICAgY29uc3QgcmVmcmVzaGVkID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZWZyZXNoZWQgPyB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkU3luY1NpZ25hdHVyZShyZWZyZXNoZWQpIDogdGhpcy5zeW5jU3VwcG9ydC5idWlsZFN5bmNTaWduYXR1cmUoZmlsZSksXG4gICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiByZW1vdGU/LnNpZ25hdHVyZSA/PyBgJHtmaWxlLnN0YXQubXRpbWV9OiR7YmluYXJ5LmJ5dGVMZW5ndGh9YCxcbiAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICB9KTtcbiAgICAgICAgZXZpY3RlZCArPSAxO1xuICAgICAgfVxuXG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKFxuICAgICAgICAgIHRoaXMudChcbiAgICAgICAgICAgIGBcdTVERjJcdTU2REVcdTY1MzYgJHtldmljdGVkfSBcdTdCQzdcdTk1N0ZcdTY3MUZcdTY3MkFcdThCQkZcdTk1RUVcdTc2ODRcdTY3MkNcdTU3MzBcdTdCMTRcdThCQjBcdTMwMDJgLFxuICAgICAgICAgICAgYEV2aWN0ZWQgJHtldmljdGVkfSBzdGFsZSBsb2NhbCBub3RlKHMpLmAsXG4gICAgICAgICAgKSxcbiAgICAgICAgICA4MDAwLFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIHJldHVybiBldmljdGVkO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGV2aWN0IHN0YWxlIHN5bmNlZCBub3Rlc1wiLCBlcnJvcik7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTU2REVcdTY1MzZcdTY3MkNcdTU3MzBcdTdCMTRcdThCQjBcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gZXZpY3QgbG9jYWwgbm90ZXNcIiksIGVycm9yKSwgODAwMCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gMDtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGVuc3VyZVJlbW90ZURpcmVjdG9yaWVzKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHBhcnRzID0gcmVtb3RlUGF0aC5zcGxpdChcIi9cIikuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUubGVuZ3RoID4gMCk7XG4gICAgaWYgKHBhcnRzLmxlbmd0aCA8PSAxKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGV0IGN1cnJlbnQgPSBcIlwiO1xuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBwYXJ0cy5sZW5ndGggLSAxOyBpbmRleCArPSAxKSB7XG4gICAgICBjdXJyZW50ID0gY3VycmVudCA/IGAke2N1cnJlbnR9LyR7cGFydHNbaW5kZXhdfWAgOiBwYXJ0c1tpbmRleF07XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChjdXJyZW50KSxcbiAgICAgICAgbWV0aG9kOiBcIk1LQ09MXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGlmICghWzIwMCwgMjAxLCAyMDQsIDIwNywgMzAxLCAzMDIsIDMwNywgMzA4LCA0MDVdLmluY2x1ZGVzKHJlc3BvbnNlLnN0YXR1cykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBNS0NPTCBmYWlsZWQgZm9yICR7Y3VycmVudH0gd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBsaXN0UmVtb3RlVHJlZShyb290Rm9sZGVyOiBzdHJpbmcpOiBQcm9taXNlPFJlbW90ZUludmVudG9yeT4ge1xuICAgIGNvbnN0IGZpbGVzID0gbmV3IE1hcDxzdHJpbmcsIFJlbW90ZUZpbGVTdGF0ZT4oKTtcbiAgICBjb25zdCBkaXJlY3RvcmllcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IHBlbmRpbmcgPSBbbm9ybWFsaXplRm9sZGVyKHJvb3RGb2xkZXIpXTtcbiAgICBjb25zdCB2aXNpdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbiAgICB3aGlsZSAocGVuZGluZy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBjdXJyZW50ID0gbm9ybWFsaXplRm9sZGVyKHBlbmRpbmcucG9wKCkgPz8gcm9vdEZvbGRlcik7XG4gICAgICBpZiAodmlzaXRlZC5oYXMoY3VycmVudCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHZpc2l0ZWQuYWRkKGN1cnJlbnQpO1xuICAgICAgY29uc3QgZW50cmllcyA9IGF3YWl0IHRoaXMubGlzdFJlbW90ZURpcmVjdG9yeShjdXJyZW50KTtcbiAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgICAgICBpZiAoZW50cnkuaXNDb2xsZWN0aW9uKSB7XG4gICAgICAgICAgZGlyZWN0b3JpZXMuYWRkKGVudHJ5LnJlbW90ZVBhdGgpO1xuICAgICAgICAgIHBlbmRpbmcucHVzaChlbnRyeS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlbnRyeS5maWxlKSB7XG4gICAgICAgICAgZmlsZXMuc2V0KGVudHJ5LnJlbW90ZVBhdGgsIGVudHJ5LmZpbGUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgZmlsZXMsIGRpcmVjdG9yaWVzIH07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGxpc3RSZW1vdGVEaXJlY3RvcnkocmVtb3RlRGlyZWN0b3J5OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXF1ZXN0ZWRQYXRoID0gbm9ybWFsaXplRm9sZGVyKHJlbW90ZURpcmVjdG9yeSk7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlcXVlc3RlZFBhdGgpLFxuICAgICAgbWV0aG9kOiBcIlBST1BGSU5EXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIERlcHRoOiBcIjFcIixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MDQpIHtcbiAgICAgIHJldHVybiBbXSBhcyBBcnJheTx7IHJlbW90ZVBhdGg6IHN0cmluZzsgaXNDb2xsZWN0aW9uOiBib29sZWFuOyBmaWxlPzogUmVtb3RlRmlsZVN0YXRlIH0+O1xuICAgIH1cblxuICAgIHRoaXMuYXNzZXJ0UmVzcG9uc2VTdWNjZXNzKHJlc3BvbnNlLCBgUFJPUEZJTkQgZm9yICR7cmVxdWVzdGVkUGF0aH1gKTtcblxuICAgIGNvbnN0IHhtbFRleHQgPSB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpO1xuICAgIHJldHVybiB0aGlzLnBhcnNlUHJvcGZpbmREaXJlY3RvcnlMaXN0aW5nKHhtbFRleHQsIHJlcXVlc3RlZFBhdGgpO1xuICB9XG5cbiAgcHJpdmF0ZSBwYXJzZVByb3BmaW5kRGlyZWN0b3J5TGlzdGluZyh4bWxUZXh0OiBzdHJpbmcsIHJlcXVlc3RlZFBhdGg6IHN0cmluZywgaW5jbHVkZVJlcXVlc3RlZCA9IGZhbHNlKSB7XG4gICAgY29uc3QgcGFyc2VyID0gbmV3IERPTVBhcnNlcigpO1xuICAgIGNvbnN0IGRvY3VtZW50ID0gcGFyc2VyLnBhcnNlRnJvbVN0cmluZyh4bWxUZXh0LCBcImFwcGxpY2F0aW9uL3htbFwiKTtcbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJwYXJzZXJlcnJvclwiKS5sZW5ndGggPiAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiXHU2NUUwXHU2Q0Q1XHU4OUUzXHU2NzkwIFdlYkRBViBcdTc2RUVcdTVGNTVcdTZFMDVcdTUzNTVcdTMwMDJcIiwgXCJGYWlsZWQgdG8gcGFyc2UgdGhlIFdlYkRBViBkaXJlY3RvcnkgbGlzdGluZy5cIikpO1xuICAgIH1cblxuICAgIGNvbnN0IGVudHJpZXMgPSBuZXcgTWFwPHN0cmluZywgeyByZW1vdGVQYXRoOiBzdHJpbmc7IGlzQ29sbGVjdGlvbjogYm9vbGVhbjsgZmlsZT86IFJlbW90ZUZpbGVTdGF0ZSB9PigpO1xuICAgIGZvciAoY29uc3QgZWxlbWVudCBvZiBBcnJheS5mcm9tKGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiKlwiKSkpIHtcbiAgICAgIGlmIChlbGVtZW50LmxvY2FsTmFtZSAhPT0gXCJyZXNwb25zZVwiKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBocmVmID0gdGhpcy5nZXRYbWxMb2NhbE5hbWVUZXh0KGVsZW1lbnQsIFwiaHJlZlwiKTtcbiAgICAgIGlmICghaHJlZikge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuaHJlZlRvUmVtb3RlUGF0aChocmVmKTtcbiAgICAgIGlmICghcmVtb3RlUGF0aCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaXNDb2xsZWN0aW9uID0gdGhpcy54bWxUcmVlSGFzTG9jYWxOYW1lKGVsZW1lbnQsIFwiY29sbGVjdGlvblwiKTtcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gaXNDb2xsZWN0aW9uID8gbm9ybWFsaXplRm9sZGVyKHJlbW90ZVBhdGgpIDogcmVtb3RlUGF0aC5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpO1xuICAgICAgaWYgKFxuICAgICAgICAhaW5jbHVkZVJlcXVlc3RlZCAmJlxuICAgICAgICAoXG4gICAgICAgICAgbm9ybWFsaXplZFBhdGggPT09IHJlcXVlc3RlZFBhdGggfHxcbiAgICAgICAgICBub3JtYWxpemVkUGF0aCA9PT0gcmVxdWVzdGVkUGF0aC5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpXG4gICAgICAgIClcbiAgICAgICkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc2l6ZVRleHQgPSB0aGlzLmdldFhtbExvY2FsTmFtZVRleHQoZWxlbWVudCwgXCJnZXRjb250ZW50bGVuZ3RoXCIpO1xuICAgICAgY29uc3QgcGFyc2VkU2l6ZSA9IE51bWJlci5wYXJzZUludChzaXplVGV4dCwgMTApO1xuICAgICAgY29uc3Qgc2l6ZSA9IE51bWJlci5pc0Zpbml0ZShwYXJzZWRTaXplKSA/IHBhcnNlZFNpemUgOiAwO1xuICAgICAgY29uc3QgbW9kaWZpZWRUZXh0ID0gdGhpcy5nZXRYbWxMb2NhbE5hbWVUZXh0KGVsZW1lbnQsIFwiZ2V0bGFzdG1vZGlmaWVkXCIpO1xuICAgICAgY29uc3QgcGFyc2VkTXRpbWUgPSBEYXRlLnBhcnNlKG1vZGlmaWVkVGV4dCk7XG4gICAgICBjb25zdCBsYXN0TW9kaWZpZWQgPSBOdW1iZXIuaXNGaW5pdGUocGFyc2VkTXRpbWUpID8gcGFyc2VkTXRpbWUgOiAwO1xuXG4gICAgICBlbnRyaWVzLnNldChub3JtYWxpemVkUGF0aCwge1xuICAgICAgICByZW1vdGVQYXRoOiBub3JtYWxpemVkUGF0aCxcbiAgICAgICAgaXNDb2xsZWN0aW9uLFxuICAgICAgICBmaWxlOiBpc0NvbGxlY3Rpb25cbiAgICAgICAgICA/IHVuZGVmaW5lZFxuICAgICAgICAgIDoge1xuICAgICAgICAgICAgICByZW1vdGVQYXRoOiBub3JtYWxpemVkUGF0aCxcbiAgICAgICAgICAgICAgbGFzdE1vZGlmaWVkLFxuICAgICAgICAgICAgICBzaXplLFxuICAgICAgICAgICAgICBzaWduYXR1cmU6IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRSZW1vdGVTeW5jU2lnbmF0dXJlKHtcbiAgICAgICAgICAgICAgICBsYXN0TW9kaWZpZWQsXG4gICAgICAgICAgICAgICAgc2l6ZSxcbiAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIFsuLi5lbnRyaWVzLnZhbHVlcygpXTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0WG1sTG9jYWxOYW1lVGV4dChwYXJlbnQ6IEVsZW1lbnQsIGxvY2FsTmFtZTogc3RyaW5nKSB7XG4gICAgZm9yIChjb25zdCBlbGVtZW50IG9mIEFycmF5LmZyb20ocGFyZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiKlwiKSkpIHtcbiAgICAgIGlmIChlbGVtZW50LmxvY2FsTmFtZSA9PT0gbG9jYWxOYW1lKSB7XG4gICAgICAgIHJldHVybiBlbGVtZW50LnRleHRDb250ZW50Py50cmltKCkgPz8gXCJcIjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuXG4gIHByaXZhdGUgeG1sVHJlZUhhc0xvY2FsTmFtZShwYXJlbnQ6IEVsZW1lbnQsIGxvY2FsTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20ocGFyZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiKlwiKSkuc29tZSgoZWxlbWVudCkgPT4gZWxlbWVudC5sb2NhbE5hbWUgPT09IGxvY2FsTmFtZSk7XG4gIH1cblxuICBwcml2YXRlIGhyZWZUb1JlbW90ZVBhdGgoaHJlZjogc3RyaW5nKSB7XG4gICAgY29uc3QgYmFzZVVybCA9IGAke3RoaXMuc2V0dGluZ3Mud2ViZGF2VXJsLnJlcGxhY2UoL1xcLyskLywgXCJcIil9L2A7XG4gICAgY29uc3QgcmVzb2x2ZWQgPSBuZXcgVVJMKGhyZWYsIGJhc2VVcmwpO1xuICAgIGNvbnN0IGJhc2VQYXRoID0gbmV3IFVSTChiYXNlVXJsKS5wYXRobmFtZS5yZXBsYWNlKC9cXC8rJC8sIFwiL1wiKTtcbiAgICBjb25zdCBkZWNvZGVkUGF0aCA9IHRoaXMuZGVjb2RlUGF0aG5hbWUocmVzb2x2ZWQucGF0aG5hbWUpO1xuICAgIGlmICghZGVjb2RlZFBhdGguc3RhcnRzV2l0aChiYXNlUGF0aCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiBkZWNvZGVkUGF0aC5zbGljZShiYXNlUGF0aC5sZW5ndGgpLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG4gIH1cblxuICBwcml2YXRlIGRlY29kZVBhdGhuYW1lKHBhdGhuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gcGF0aG5hbWVcbiAgICAgIC5zcGxpdChcIi9cIilcbiAgICAgIC5tYXAoKHNlZ21lbnQpID0+IHtcbiAgICAgICAgaWYgKCFzZWdtZW50KSB7XG4gICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoc2VnbWVudCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIHJldHVybiBzZWdtZW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmpvaW4oXCIvXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZEV4cGVjdGVkUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlRmlsZVBhdGhzOiBTZXQ8c3RyaW5nPiwgcm9vdEZvbGRlcjogc3RyaW5nKSB7XG4gICAgY29uc3QgZXhwZWN0ZWQgPSBuZXcgU2V0PHN0cmluZz4oW25vcm1hbGl6ZUZvbGRlcihyb290Rm9sZGVyKV0pO1xuICAgIGZvciAoY29uc3QgcmVtb3RlUGF0aCBvZiByZW1vdGVGaWxlUGF0aHMpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gcmVtb3RlUGF0aC5zcGxpdChcIi9cIikuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUubGVuZ3RoID4gMCk7XG4gICAgICBsZXQgY3VycmVudCA9IFwiXCI7XG4gICAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgcGFydHMubGVuZ3RoIC0gMTsgaW5kZXggKz0gMSkge1xuICAgICAgICBjdXJyZW50ID0gY3VycmVudCA/IGAke2N1cnJlbnR9LyR7cGFydHNbaW5kZXhdfWAgOiBwYXJ0c1tpbmRleF07XG4gICAgICAgIGV4cGVjdGVkLmFkZChub3JtYWxpemVGb2xkZXIoY3VycmVudCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBleHBlY3RlZDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVjb25jaWxlRGlyZWN0b3JpZXMocmVtb3RlRGlyZWN0b3JpZXM6IFNldDxzdHJpbmc+KSB7XG4gICAgY29uc3Qgc3RhdHMgPSB7IGNyZWF0ZWRMb2NhbDogMCwgY3JlYXRlZFJlbW90ZTogMCwgZGVsZXRlZExvY2FsOiAwLCBkZWxldGVkUmVtb3RlOiAwIH07XG5cbiAgICBjb25zdCByZW1vdGVMb2NhbFBhdGhzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgZm9yIChjb25zdCByZW1vdGVEaXIgb2YgcmVtb3RlRGlyZWN0b3JpZXMpIHtcbiAgICAgIGNvbnN0IGxvY2FsUGF0aCA9IHRoaXMuc3luY1N1cHBvcnQucmVtb3RlUGF0aFRvVmF1bHRQYXRoKHJlbW90ZURpcik7XG4gICAgICBpZiAobG9jYWxQYXRoICE9PSBudWxsICYmIGxvY2FsUGF0aC5sZW5ndGggPiAwICYmICF0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBEaXJlY3RvcnlTeW5jUGF0aChsb2NhbFBhdGgpKSB7XG4gICAgICAgIHJlbW90ZUxvY2FsUGF0aHMuYWRkKG5vcm1hbGl6ZVBhdGgobG9jYWxQYXRoKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgbG9jYWxEaXJQYXRocyA9IHRoaXMuc3luY1N1cHBvcnQuY29sbGVjdExvY2FsU3luY2VkRGlyZWN0b3JpZXMoKTtcbiAgICBjb25zdCBrbm93bkRpclBhdGhzID0gdGhpcy5zeW5jZWREaXJlY3RvcmllcztcbiAgICBjb25zdCBuZXdTeW5jZWREaXJzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbiAgICBjb25zdCBsb2NhbE9ubHkgPSBbLi4ubG9jYWxEaXJQYXRoc10uZmlsdGVyKChwKSA9PiAhcmVtb3RlTG9jYWxQYXRocy5oYXMocCkpO1xuICAgIGNvbnN0IHJlbW90ZU9ubHkgPSBbLi4ucmVtb3RlTG9jYWxQYXRoc10uZmlsdGVyKChwKSA9PiAhbG9jYWxEaXJQYXRocy5oYXMocCkpO1xuXG4gICAgLy8gUHJvY2VzcyBsb2NhbC1vbmx5IGRpcmVjdG9yaWVzIChkZWVwZXN0IGZpcnN0IGZvciBzYWZlIGRlbGV0aW9uKVxuICAgIGZvciAoY29uc3QgZGlyUGF0aCBvZiBbLi4ubG9jYWxPbmx5XS5zb3J0KChhLCBiKSA9PiBiLmxlbmd0aCAtIGEubGVuZ3RoKSkge1xuICAgICAgaWYgKGtub3duRGlyUGF0aHMuaGFzKGRpclBhdGgpKSB7XG4gICAgICAgIC8vIFdhcyBzeW5jZWQgYmVmb3JlIGJ1dCBnb25lIGZyb20gcmVtb3RlIFx1MjE5MiBhbm90aGVyIGNsaWVudCBkZWxldGVkIGl0XG4gICAgICAgIGNvbnN0IGZvbGRlciA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChkaXJQYXRoKTtcbiAgICAgICAgaWYgKGZvbGRlciBpbnN0YW5jZW9mIFRGb2xkZXIgJiYgZm9sZGVyLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5kZWxldGUoZm9sZGVyLCB0cnVlKTtcbiAgICAgICAgICAgIHN0YXRzLmRlbGV0ZWRMb2NhbCArPSAxO1xuICAgICAgICAgIH0gY2F0Y2ggeyAvKiBza2lwIGlmIGRlbGV0aW9uIGZhaWxzICovIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBOb24tZW1wdHkgbG9jYWwgZGlyOiBrZWVwIGl0LCBmaWxlcyB3aWxsIHJlLXVwbG9hZCBvbiBuZXh0IHN5bmNcbiAgICAgICAgICBuZXdTeW5jZWREaXJzLmFkZChkaXJQYXRoKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gTmV3IGxvY2FsIGRpcmVjdG9yeSBub3QgeWV0IG9uIHJlbW90ZSBcdTIxOTIgY3JlYXRlIG9uIHJlbW90ZVxuICAgICAgICBjb25zdCByZW1vdGVEaXIgPSBub3JtYWxpemVGb2xkZXIodGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpICsgZGlyUGF0aDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmVuc3VyZVJlbW90ZURpcmVjdG9yaWVzKHJlbW90ZURpcik7XG4gICAgICAgICAgc3RhdHMuY3JlYXRlZFJlbW90ZSArPSAxO1xuICAgICAgICB9IGNhdGNoIHsgLyogc2tpcCBpZiBjcmVhdGlvbiBmYWlscyAqLyB9XG4gICAgICAgIG5ld1N5bmNlZERpcnMuYWRkKGRpclBhdGgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEJvdGggc2lkZXMgZXhpc3QgXHUyMTkyIGtlZXBcbiAgICBmb3IgKGNvbnN0IGRpclBhdGggb2YgbG9jYWxEaXJQYXRocykge1xuICAgICAgaWYgKHJlbW90ZUxvY2FsUGF0aHMuaGFzKGRpclBhdGgpKSB7XG4gICAgICAgIG5ld1N5bmNlZERpcnMuYWRkKGRpclBhdGgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFByb2Nlc3MgcmVtb3RlLW9ubHkgZGlyZWN0b3JpZXMgKGRlZXBlc3QgZmlyc3QgZm9yIHNhZmUgZGVsZXRpb24pXG4gICAgZm9yIChjb25zdCBkaXJQYXRoIG9mIFsuLi5yZW1vdGVPbmx5XS5zb3J0KChhLCBiKSA9PiBiLmxlbmd0aCAtIGEubGVuZ3RoKSkge1xuICAgICAgaWYgKGtub3duRGlyUGF0aHMuaGFzKGRpclBhdGgpKSB7XG4gICAgICAgIC8vIFdhcyBzeW5jZWQgYmVmb3JlIGJ1dCBnb25lIGxvY2FsbHkgXHUyMTkyIHRoaXMgY2xpZW50IGRlbGV0ZWQgaXRcbiAgICAgICAgY29uc3QgcmVtb3RlRGlyID0gbm9ybWFsaXplRm9sZGVyKHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKSArIGRpclBhdGg7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlRGlyKSxcbiAgICAgICAgICBtZXRob2Q6IFwiREVMRVRFXCIsXG4gICAgICAgICAgaGVhZGVyczogeyBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpIH0sXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoWzIwMCwgMjAyLCAyMDRdLmluY2x1ZGVzKHJlc3BvbnNlLnN0YXR1cykpIHtcbiAgICAgICAgICBzdGF0cy5kZWxldGVkUmVtb3RlICs9IDE7XG4gICAgICAgIH0gZWxzZSBpZiAoIVs0MDQsIDQwNSwgNDA5XS5pbmNsdWRlcyhyZXNwb25zZS5zdGF0dXMpKSB7XG4gICAgICAgICAgLy8gVW5leHBlY3RlZCBlcnJvciBcdTIxOTIga2VlcCB0cmFja2luZyB0byByZXRyeSBuZXh0IHN5bmNcbiAgICAgICAgICBuZXdTeW5jZWREaXJzLmFkZChkaXJQYXRoKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gTmV3IHJlbW90ZSBkaXJlY3Rvcnkgbm90IHlldCBsb2NhbCBcdTIxOTIgY3JlYXRlIGxvY2FsbHlcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZGlyUGF0aCk7XG4gICAgICAgIGlmICghZXhpc3RpbmcpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVGb2xkZXIoZGlyUGF0aCk7XG4gICAgICAgIH1cbiAgICAgICAgc3RhdHMuY3JlYXRlZExvY2FsICs9IDE7XG4gICAgICAgIG5ld1N5bmNlZERpcnMuYWRkKGRpclBhdGgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMuc3luY2VkRGlyZWN0b3JpZXMgPSBuZXdTeW5jZWREaXJzO1xuICAgIHJldHVybiBzdGF0cztcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZGVsZXRlRXh0cmFSZW1vdGVEaXJlY3RvcmllcyhyZW1vdGVEaXJlY3RvcmllczogU2V0PHN0cmluZz4sIGV4cGVjdGVkRGlyZWN0b3JpZXM6IFNldDxzdHJpbmc+KSB7XG4gICAgbGV0IGRlbGV0ZWQgPSAwO1xuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBbLi4ucmVtb3RlRGlyZWN0b3JpZXNdXG4gICAgICAuZmlsdGVyKChyZW1vdGVQYXRoKSA9PiAhZXhwZWN0ZWREaXJlY3Rvcmllcy5oYXMocmVtb3RlUGF0aCkpXG4gICAgICAuc29ydCgoYSwgYikgPT4gYi5sZW5ndGggLSBhLmxlbmd0aCB8fCBiLmxvY2FsZUNvbXBhcmUoYSkpO1xuXG4gICAgZm9yIChjb25zdCByZW1vdGVQYXRoIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgICBtZXRob2Q6IFwiREVMRVRFXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChbMjAwLCAyMDIsIDIwNCwgNDA0XS5pbmNsdWRlcyhyZXNwb25zZS5zdGF0dXMpKSB7XG4gICAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgIT09IDQwNCkge1xuICAgICAgICAgIGRlbGV0ZWQgKz0gMTtcbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKFs0MDUsIDQwOV0uaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBERUxFVEUgZGlyZWN0b3J5IGZhaWxlZCBmb3IgJHtyZW1vdGVQYXRofSB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGVsZXRlZDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcHJvY2Vzc1BlbmRpbmdUYXNrcygpIHtcblxuICAgIGF3YWl0IHRoaXMudXBsb2FkUXVldWUucHJvY2Vzc1BlbmRpbmdUYXNrcygpO1xuICB9XG5cbiAgcHJpdmF0ZSB0cmFja1ZhdWx0TXV0YXRpb24ob3BlcmF0aW9uOiAoKSA9PiBQcm9taXNlPHZvaWQ+KSB7XG4gICAgY29uc3QgcHJvbWlzZSA9IG9wZXJhdGlvbigpXG4gICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIHZhdWx0IG11dGF0aW9uIGhhbmRsaW5nIGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICB9KVxuICAgICAgLmZpbmFsbHkoKCkgPT4ge1xuICAgICAgICB0aGlzLnBlbmRpbmdWYXVsdE11dGF0aW9uUHJvbWlzZXMuZGVsZXRlKHByb21pc2UpO1xuICAgICAgfSk7XG4gICAgdGhpcy5wZW5kaW5nVmF1bHRNdXRhdGlvblByb21pc2VzLmFkZChwcm9taXNlKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgd2FpdEZvclBlbmRpbmdWYXVsdE11dGF0aW9ucygpIHtcbiAgICB3aGlsZSAodGhpcy5wZW5kaW5nVmF1bHRNdXRhdGlvblByb21pc2VzLnNpemUgPiAwKSB7XG4gICAgICBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoWy4uLnRoaXMucGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlc10pO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcHJlcGFyZVBlbmRpbmdVcGxvYWRzRm9yU3luYyhzaG93Tm90aWNlOiBib29sZWFuKSB7XG5cbiAgICBhd2FpdCB0aGlzLnVwbG9hZFF1ZXVlLnByb2Nlc3NQZW5kaW5nVGFza3MoKTtcblxuICAgIGlmICh0aGlzLnVwbG9hZFF1ZXVlLmhhc1BlbmRpbmdXb3JrKCkpIHtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gRGF0ZS5ub3coKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9IHRoaXMudChcbiAgICAgICAgXCJcdTY4QzBcdTZENEJcdTUyMzBcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTRFQ0RcdTU3MjhcdThGREJcdTg4NENcdTYyMTZcdTdCNDlcdTVGODVcdTkxQ0RcdThCRDVcdUZGMENcdTVERjJcdTY2ODJcdTdGMTNcdTY3MkNcdTZCMjFcdTdCMTRcdThCQjBcdTU0MENcdTZCNjVcdUZGMENcdTkwN0ZcdTUxNERcdTY1RTdcdTcyNDhcdTdCMTRcdThCQjBcdTg5ODZcdTc2RDZcdTY1QjBcdTU2RkVcdTcyNDdcdTVGMTVcdTc1MjhcdTMwMDJcIixcbiAgICAgICAgXCJJbWFnZSB1cGxvYWRzIGFyZSBzdGlsbCBydW5uaW5nIG9yIHdhaXRpbmcgZm9yIHJldHJ5LCBzbyBub3RlIHN5bmMgd2FzIGRlZmVycmVkIHRvIGF2b2lkIG9sZCBub3RlIGNvbnRlbnQgb3ZlcndyaXRpbmcgbmV3IGltYWdlIHJlZmVyZW5jZXMuXCIsXG4gICAgICApO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzLCA4MDAwKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkSW1hZ2VzSW5Ob3RlKG5vdGVGaWxlOiBURmlsZSkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChub3RlRmlsZSk7XG4gICAgICBjb25zdCByZXBsYWNlbWVudHMgPSBhd2FpdCB0aGlzLmJ1aWxkVXBsb2FkUmVwbGFjZW1lbnRzKGNvbnRlbnQsIG5vdGVGaWxlKTtcblxuICAgICAgaWYgKHJlcGxhY2VtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdTVGNTNcdTUyNERcdTdCMTRcdThCQjBcdTRFMkRcdTZDQTFcdTY3MDlcdTYyN0VcdTUyMzBcdTY3MkNcdTU3MzBcdTU2RkVcdTcyNDdcdTMwMDJcIiwgXCJObyBsb2NhbCBpbWFnZXMgZm91bmQgaW4gdGhlIGN1cnJlbnQgbm90ZS5cIikpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGxldCB1cGRhdGVkID0gY29udGVudDtcbiAgICAgIGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgcmVwbGFjZW1lbnRzKSB7XG4gICAgICAgIHVwZGF0ZWQgPSB1cGRhdGVkLnNwbGl0KHJlcGxhY2VtZW50Lm9yaWdpbmFsKS5qb2luKHJlcGxhY2VtZW50LnJld3JpdHRlbik7XG4gICAgICB9XG5cbiAgICAgIGlmICh1cGRhdGVkID09PSBjb250ZW50KSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU2Q0ExXHU2NzA5XHU5NzAwXHU4OTgxXHU2NTM5XHU1MTk5XHU3Njg0XHU1NkZFXHU3MjQ3XHU5NEZFXHU2M0E1XHUzMDAyXCIsIFwiTm8gaW1hZ2VzIHdlcmUgcmV3cml0dGVuLlwiKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KG5vdGVGaWxlLCB1cGRhdGVkKTtcbiAgICAgIHRoaXMuc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jKG5vdGVGaWxlLnBhdGgsIFwiaW1hZ2UtYWRkXCIpO1xuXG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5kZWxldGVMb2NhbEFmdGVyVXBsb2FkKSB7XG4gICAgICAgIGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgcmVwbGFjZW1lbnRzKSB7XG4gICAgICAgICAgaWYgKHJlcGxhY2VtZW50LnNvdXJjZUZpbGUpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMudHJhc2hJZkV4aXN0cyhyZXBsYWNlbWVudC5zb3VyY2VGaWxlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbmV3IE5vdGljZSh0aGlzLnQoYFx1NURGMlx1NEUwQVx1NEYyMCAke3JlcGxhY2VtZW50cy5sZW5ndGh9IFx1NUYyMFx1NTZGRVx1NzI0N1x1NTIzMCBXZWJEQVZcdTMwMDJgLCBgVXBsb2FkZWQgJHtyZXBsYWNlbWVudHMubGVuZ3RofSBpbWFnZShzKSB0byBXZWJEQVYuYCkpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiU2VjdXJlIFdlYkRBViB1cGxvYWQgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1NEUwQVx1NEYyMFx1NTkzMVx1OEQyNVwiLCBcIlVwbG9hZCBmYWlsZWRcIiksIGVycm9yKSwgODAwMCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzVGFzayh0YXNrOiBVcGxvYWRUYXNrKSB7XG5cbiAgICBhd2FpdCB0aGlzLnVwbG9hZFF1ZXVlLnByb2Nlc3NUYXNrKHRhc2spO1xuICB9XG5cbiAgcHJpdmF0ZSBlc2NhcGVIdG1sKHZhbHVlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdmFsdWVcbiAgICAgIC5yZXBsYWNlKC8mL2csIFwiJmFtcDtcIilcbiAgICAgIC5yZXBsYWNlKC9cIi9nLCBcIiZxdW90O1wiKVxuICAgICAgLnJlcGxhY2UoLzwvZywgXCImbHQ7XCIpXG4gICAgICAucmVwbGFjZSgvPi9nLCBcIiZndDtcIik7XG4gIH1cblxuICBwcml2YXRlIHVuZXNjYXBlSHRtbCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHZhbHVlXG4gICAgICAucmVwbGFjZSgvJnF1b3Q7L2csIFwiXFxcIlwiKVxuICAgICAgLnJlcGxhY2UoLyZndDsvZywgXCI+XCIpXG4gICAgICAucmVwbGFjZSgvJmx0Oy9nLCBcIjxcIilcbiAgICAgIC5yZXBsYWNlKC8mYW1wOy9nLCBcIiZcIik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGZldGNoU2VjdXJlSW1hZ2VCbG9iVXJsKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmFzc2VydFJlc3BvbnNlU3VjY2VzcyhyZXNwb25zZSwgXCJGZXRjaCBzZWN1cmUgaW1hZ2VcIik7XG5cbiAgICBjb25zdCBibG9iID0gbmV3IEJsb2IoW3Jlc3BvbnNlLmFycmF5QnVmZmVyXSwge1xuICAgICAgdHlwZTogcmVzcG9uc2UuaGVhZGVyc1tcImNvbnRlbnQtdHlwZVwiXSA/PyBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiLFxuICAgIH0pO1xuICAgIGNvbnN0IGJsb2JVcmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICAgIHRoaXMuZXZpY3RCbG9iVXJsc0lmTmVlZGVkKCk7XG4gICAgdGhpcy5ibG9iVXJscy5wdXNoKGJsb2JVcmwpO1xuICAgIHJldHVybiBibG9iVXJsO1xuICB9XG5cbiAgcHJpdmF0ZSBldmljdEJsb2JVcmxzSWZOZWVkZWQoKSB7XG4gICAgd2hpbGUgKHRoaXMuYmxvYlVybHMubGVuZ3RoID49IHRoaXMubWF4QmxvYlVybHMpIHtcbiAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwodGhpcy5ibG9iVXJscy5zaGlmdCgpISk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhcnJheUJ1ZmZlclRvQmFzZTY0KGJ1ZmZlcjogQXJyYXlCdWZmZXIpIHtcbiAgICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlcik7XG4gICAgY29uc3QgY2h1bmtTaXplID0gMHg4MDAwO1xuICAgIGxldCBiaW5hcnkgPSBcIlwiO1xuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBieXRlcy5sZW5ndGg7IGluZGV4ICs9IGNodW5rU2l6ZSkge1xuICAgICAgY29uc3QgY2h1bmsgPSBieXRlcy5zdWJhcnJheShpbmRleCwgaW5kZXggKyBjaHVua1NpemUpO1xuICAgICAgYmluYXJ5ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoLi4uY2h1bmspO1xuICAgIH1cbiAgICByZXR1cm4gYnRvYShiaW5hcnkpO1xuICB9XG5cbiAgcHJpdmF0ZSBiYXNlNjRUb0FycmF5QnVmZmVyKGJhc2U2NDogc3RyaW5nKSB7XG4gICAgY29uc3QgYmluYXJ5ID0gYXRvYihiYXNlNjQpO1xuICAgIGNvbnN0IGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoYmluYXJ5Lmxlbmd0aCk7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGJpbmFyeS5sZW5ndGg7IGluZGV4ICs9IDEpIHtcbiAgICAgIGJ5dGVzW2luZGV4XSA9IGJpbmFyeS5jaGFyQ29kZUF0KGluZGV4KTtcbiAgICB9XG4gICAgcmV0dXJuIGJ5dGVzLmJ1ZmZlci5zbGljZShieXRlcy5ieXRlT2Zmc2V0LCBieXRlcy5ieXRlT2Zmc2V0ICsgYnl0ZXMuYnl0ZUxlbmd0aCkgYXMgQXJyYXlCdWZmZXI7XG4gIH1cblxuICBwcml2YXRlIGFycmF5QnVmZmVyc0VxdWFsKGxlZnQ6IEFycmF5QnVmZmVyLCByaWdodDogQXJyYXlCdWZmZXIpIHtcbiAgICBjb25zdCBhID0gbmV3IFVpbnQ4QXJyYXkobGVmdCk7XG4gICAgY29uc3QgYiA9IG5ldyBVaW50OEFycmF5KHJpZ2h0KTtcbiAgICBpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGEubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgICBpZiAoYVtpbmRleF0gIT09IGJbaW5kZXhdKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRDbGlwYm9hcmRGaWxlTmFtZShtaW1lVHlwZTogc3RyaW5nKSB7XG4gICAgY29uc3QgZXh0ZW5zaW9uID0gbWltZVR5cGUuc3BsaXQoXCIvXCIpWzFdPy5yZXBsYWNlKFwianBlZ1wiLCBcImpwZ1wiKSB8fCBcInBuZ1wiO1xuICAgIHJldHVybiBgcGFzdGVkLWltYWdlLSR7RGF0ZS5ub3coKX0uJHtleHRlbnNpb259YDtcbiAgfVxuXG4gIHByaXZhdGUgZXNjYXBlUmVnRXhwKHZhbHVlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdmFsdWUucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csIFwiXFxcXCQmXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZFJlbW90ZVBhdGgoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBgJHtub3JtYWxpemVGb2xkZXIodGhpcy5zZXR0aW5ncy5yZW1vdGVGb2xkZXIpfSR7ZmlsZU5hbWV9YDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnkoZmlsZU5hbWU6IHN0cmluZywgYmluYXJ5OiBBcnJheUJ1ZmZlcikge1xuICAgIGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbUZpbGVOYW1lKGZpbGVOYW1lKTtcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5uYW1pbmdTdHJhdGVneSA9PT0gXCJoYXNoXCIpIHtcbiAgICAgIGNvbnN0IGhhc2ggPSAoYXdhaXQgdGhpcy5jb21wdXRlU2hhMjU2SGV4KGJpbmFyeSkpLnNsaWNlKDAsIDE2KTtcbiAgICAgIHJldHVybiBgJHtoYXNofS4ke2V4dGVuc2lvbn1gO1xuICAgIH1cblxuICAgIHJldHVybiBgJHtEYXRlLm5vdygpfS0ke2ZpbGVOYW1lfWA7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IGJhc2UgPSB0aGlzLnNldHRpbmdzLndlYmRhdlVybC5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpO1xuICAgIHJldHVybiBgJHtiYXNlfS8ke3JlbW90ZVBhdGguc3BsaXQoXCIvXCIpLm1hcChlbmNvZGVVUklDb21wb25lbnQpLmpvaW4oXCIvXCIpfWA7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkQXV0aEhlYWRlcigpIHtcbiAgICBjb25zdCB0b2tlbiA9IHRoaXMuYXJyYXlCdWZmZXJUb0Jhc2U2NCh0aGlzLmVuY29kZVV0ZjgoYCR7dGhpcy5zZXR0aW5ncy51c2VybmFtZX06JHt0aGlzLnNldHRpbmdzLnBhc3N3b3JkfWApKTtcbiAgICByZXR1cm4gYEJhc2ljICR7dG9rZW59YDtcbiAgfVxuXG4gIHByaXZhdGUgZW5zdXJlQ29uZmlndXJlZCgpIHtcbiAgICBpZiAoIXRoaXMuc2V0dGluZ3Mud2ViZGF2VXJsIHx8ICF0aGlzLnNldHRpbmdzLnVzZXJuYW1lIHx8ICF0aGlzLnNldHRpbmdzLnBhc3N3b3JkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiV2ViREFWIFx1OTE0RFx1N0Y2RVx1NEUwRFx1NUI4Q1x1NjU3NFx1MzAwMlwiLCBcIldlYkRBViBzZXR0aW5ncyBhcmUgaW5jb21wbGV0ZS5cIikpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXNzZXJ0UmVzcG9uc2VTdWNjZXNzKHJlc3BvbnNlOiB7IHN0YXR1czogbnVtYmVyIH0sIGNvbnRleHQ6IHN0cmluZykge1xuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2NvbnRleHR9IGZhaWxlZCB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGdldE1pbWVUeXBlKGV4dGVuc2lvbjogc3RyaW5nKSB7XG4gICAgcmV0dXJuIE1JTUVfTUFQW2V4dGVuc2lvbi50b0xvd2VyQ2FzZSgpXSA/PyBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRNaW1lVHlwZUZyb21GaWxlTmFtZShmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0TWltZVR5cGUodGhpcy5nZXRFeHRlbnNpb25Gcm9tRmlsZU5hbWUoZmlsZU5hbWUpKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0RXh0ZW5zaW9uRnJvbUZpbGVOYW1lKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBwaWVjZXMgPSBmaWxlTmFtZS5zcGxpdChcIi5cIik7XG4gICAgcmV0dXJuIHBpZWNlcy5sZW5ndGggPiAxID8gcGllY2VzW3BpZWNlcy5sZW5ndGggLSAxXS50b0xvd2VyQ2FzZSgpIDogXCJwbmdcIjtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcHJlcGFyZVVwbG9hZFBheWxvYWQoYmluYXJ5OiBBcnJheUJ1ZmZlciwgbWltZVR5cGU6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGlmICghdGhpcy5zZXR0aW5ncy5jb21wcmVzc0ltYWdlcykge1xuICAgICAgcmV0dXJuIHsgYmluYXJ5LCBtaW1lVHlwZSwgZmlsZU5hbWUgfTtcbiAgICB9XG5cbiAgICBjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRoaXMuY29tcHJlc3NJbWFnZUlmTmVlZGVkKGJpbmFyeSwgbWltZVR5cGUsIGZpbGVOYW1lKTtcbiAgICByZXR1cm4gcHJlcGFyZWQgPz8geyBiaW5hcnksIG1pbWVUeXBlLCBmaWxlTmFtZSB9O1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjb21wcmVzc0ltYWdlSWZOZWVkZWQoYmluYXJ5OiBBcnJheUJ1ZmZlciwgbWltZVR5cGU6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGlmICghL15pbWFnZVxcLyhwbmd8anBlZ3xqcGd8d2VicCkkL2kudGVzdChtaW1lVHlwZSkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IHRocmVzaG9sZEJ5dGVzID0gdGhpcy5zZXR0aW5ncy5jb21wcmVzc1RocmVzaG9sZEtiICogMTAyNDtcbiAgICBjb25zdCBzb3VyY2VCbG9iID0gbmV3IEJsb2IoW2JpbmFyeV0sIHsgdHlwZTogbWltZVR5cGUgfSk7XG4gICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB0aGlzLmxvYWRJbWFnZUVsZW1lbnQoc291cmNlQmxvYik7XG4gICAgY29uc3QgbGFyZ2VzdFNpZGUgPSBNYXRoLm1heChpbWFnZS5uYXR1cmFsV2lkdGgsIGltYWdlLm5hdHVyYWxIZWlnaHQpO1xuICAgIGNvbnN0IG5lZWRzUmVzaXplID0gbGFyZ2VzdFNpZGUgPiB0aGlzLnNldHRpbmdzLm1heEltYWdlRGltZW5zaW9uO1xuICAgIGNvbnN0IG5lZWRzQ29tcHJlc3MgPSBzb3VyY2VCbG9iLnNpemUgPiB0aHJlc2hvbGRCeXRlcyB8fCBuZWVkc1Jlc2l6ZTtcbiAgICBpZiAoIW5lZWRzQ29tcHJlc3MpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IHNjYWxlID0gbmVlZHNSZXNpemUgPyB0aGlzLnNldHRpbmdzLm1heEltYWdlRGltZW5zaW9uIC8gbGFyZ2VzdFNpZGUgOiAxO1xuICAgIGNvbnN0IHRhcmdldFdpZHRoID0gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChpbWFnZS5uYXR1cmFsV2lkdGggKiBzY2FsZSkpO1xuICAgIGNvbnN0IHRhcmdldEhlaWdodCA9IE1hdGgubWF4KDEsIE1hdGgucm91bmQoaW1hZ2UubmF0dXJhbEhlaWdodCAqIHNjYWxlKSk7XG4gICAgY29uc3QgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImNhbnZhc1wiKTtcbiAgICBjYW52YXMud2lkdGggPSB0YXJnZXRXaWR0aDtcbiAgICBjYW52YXMuaGVpZ2h0ID0gdGFyZ2V0SGVpZ2h0O1xuICAgIGNvbnN0IGNvbnRleHQgPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpO1xuICAgIGlmICghY29udGV4dCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29udGV4dC5kcmF3SW1hZ2UoaW1hZ2UsIDAsIDAsIHRhcmdldFdpZHRoLCB0YXJnZXRIZWlnaHQpO1xuXG4gICAgY29uc3Qgb3V0cHV0TWltZSA9IG1pbWVUeXBlLnRvTG93ZXJDYXNlKCkgPT09IFwiaW1hZ2UvanBnXCIgPyBcImltYWdlL2pwZWdcIiA6IG1pbWVUeXBlO1xuICAgIGNvbnN0IHF1YWxpdHkgPSBNYXRoLm1heCgwLjQsIE1hdGgubWluKDAuOTgsIHRoaXMuc2V0dGluZ3MuanBlZ1F1YWxpdHkgLyAxMDApKTtcbiAgICBjb25zdCBjb21wcmVzc2VkQmxvYiA9IGF3YWl0IG5ldyBQcm9taXNlPEJsb2IgfCBudWxsPigocmVzb2x2ZSkgPT4ge1xuICAgICAgY2FudmFzLnRvQmxvYihyZXNvbHZlLCBvdXRwdXRNaW1lLCBxdWFsaXR5KTtcbiAgICB9KTtcblxuICAgIGlmICghY29tcHJlc3NlZEJsb2IpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmICghbmVlZHNSZXNpemUgJiYgY29tcHJlc3NlZEJsb2Iuc2l6ZSA+PSBzb3VyY2VCbG9iLnNpemUpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IG5leHRCaW5hcnkgPSBhd2FpdCBjb21wcmVzc2VkQmxvYi5hcnJheUJ1ZmZlcigpO1xuICAgIGNvbnN0IG5leHRFeHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbkZyb21NaW1lVHlwZShvdXRwdXRNaW1lKSA/PyB0aGlzLmdldEV4dGVuc2lvbkZyb21GaWxlTmFtZShmaWxlTmFtZSk7XG4gICAgY29uc3QgbmV4dEZpbGVOYW1lID0gZmlsZU5hbWUucmVwbGFjZSgvXFwuW14uXSskLywgXCJcIikgKyBgLiR7bmV4dEV4dGVuc2lvbn1gO1xuICAgIHJldHVybiB7XG4gICAgICBiaW5hcnk6IG5leHRCaW5hcnksXG4gICAgICBtaW1lVHlwZTogb3V0cHV0TWltZSxcbiAgICAgIGZpbGVOYW1lOiBuZXh0RmlsZU5hbWUsXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgbG9hZEltYWdlRWxlbWVudChibG9iOiBCbG9iKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPEhUTUxJbWFnZUVsZW1lbnQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICBjb25zdCBpbWFnZSA9IG5ldyBJbWFnZSgpO1xuICAgICAgaW1hZ2Uub25sb2FkID0gKCkgPT4ge1xuICAgICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG4gICAgICAgIHJlc29sdmUoaW1hZ2UpO1xuICAgICAgfTtcbiAgICAgIGltYWdlLm9uZXJyb3IgPSAoZXJyb3IpID0+IHtcbiAgICAgICAgVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfTtcbiAgICAgIGltYWdlLnNyYyA9IHVybDtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgZXh0ZW5zaW9uRnJvbU1pbWVUeXBlKG1pbWVUeXBlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gTUlNRV9NQVBbbWltZVR5cGVdID8/IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHRyYXNoSWZFeGlzdHMoZmlsZTogVEFic3RyYWN0RmlsZSkge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC50cmFzaChmaWxlLCB0cnVlKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKFwiRmFpbGVkIHRvIHRyYXNoIGxvY2FsIGltYWdlIGFmdGVyIHVwbG9hZFwiLCBlcnJvcik7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBmb3JtYXRFbWJlZExhYmVsKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy50KGBcdTMwMTBcdTVCODlcdTUxNjhcdThGRENcdTdBMEJcdTU2RkVcdTcyNDdcdUZGNUMke2ZpbGVOYW1lfVx1MzAxMWAsIGBbU2VjdXJlIHJlbW90ZSBpbWFnZSB8ICR7ZmlsZU5hbWV9XWApO1xuICB9XG5cbiAgcHJpdmF0ZSBmb3JtYXRGYWlsZWRMYWJlbChmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMudChgXHUzMDEwXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU1OTMxXHU4RDI1XHVGRjVDJHtmaWxlTmFtZX1cdTMwMTFgLCBgW0ltYWdlIHVwbG9hZCBmYWlsZWQgfCAke2ZpbGVOYW1lfV1gKTtcbiAgfVxuXG4gIGFzeW5jIG1pZ3JhdGVBbGxMZWdhY3lTZWN1cmVJbWFnZXMoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVwbG9hZENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgICAgIGNvbnN0IGNhbmRpZGF0ZUxvY2FsSW1hZ2VzID0gbmV3IE1hcDxzdHJpbmcsIFRGaWxlPigpO1xuICAgICAgbGV0IGNoYW5nZWRGaWxlcyA9IDA7XG4gICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgdGhpcy5hcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpKSB7XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICBjb25zdCByZXBsYWNlbWVudHMgPSBhd2FpdCB0aGlzLmJ1aWxkVXBsb2FkUmVwbGFjZW1lbnRzKGNvbnRlbnQsIGZpbGUsIHVwbG9hZENhY2hlKTtcbiAgICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcbiAgICAgICAgICBpZiAocmVwbGFjZW1lbnQuc291cmNlRmlsZSkge1xuICAgICAgICAgICAgY2FuZGlkYXRlTG9jYWxJbWFnZXMuc2V0KHJlcGxhY2VtZW50LnNvdXJjZUZpbGUucGF0aCwgcmVwbGFjZW1lbnQuc291cmNlRmlsZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHVwZGF0ZWQgPSBjb250ZW50O1xuICAgICAgICBmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIHJlcGxhY2VtZW50cykge1xuICAgICAgICAgIHVwZGF0ZWQgPSB1cGRhdGVkLnNwbGl0KHJlcGxhY2VtZW50Lm9yaWdpbmFsKS5qb2luKHJlcGxhY2VtZW50LnJld3JpdHRlbik7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVkID0gdXBkYXRlZFxuICAgICAgICAgIC5yZXBsYWNlKFxuICAgICAgICAgICAgLzxzcGFuIGNsYXNzPVwic2VjdXJlLXdlYmRhdi1lbWJlZFwiIGRhdGEtc2VjdXJlLXdlYmRhdj1cIihbXlwiXSspXCIgYXJpYS1sYWJlbD1cIihbXlwiXSopXCI+Lio/PFxcL3NwYW4+L2csXG4gICAgICAgICAgICAoX21hdGNoLCByZW1vdGVQYXRoOiBzdHJpbmcsIGFsdDogc3RyaW5nKSA9PlxuICAgICAgICAgICAgICB0aGlzLmltYWdlU3VwcG9ydC5idWlsZFNlY3VyZUltYWdlQ29kZUJsb2NrKFxuICAgICAgICAgICAgICAgIHRoaXMudW5lc2NhcGVIdG1sKHJlbW90ZVBhdGgpLFxuICAgICAgICAgICAgICAgIHRoaXMudW5lc2NhcGVIdG1sKGFsdCkgfHwgdGhpcy51bmVzY2FwZUh0bWwocmVtb3RlUGF0aCksXG4gICAgICAgICAgICAgICksXG4gICAgICAgICAgKVxuICAgICAgICAgIC5yZXBsYWNlKFxuICAgICAgICAgICAgLyFcXFtbXlxcXV0qXVxcKHdlYmRhdi1zZWN1cmU6XFwvXFwvKFteKV0rKVxcKS9nLFxuICAgICAgICAgICAgKF9tYXRjaCwgcmVtb3RlUGF0aDogc3RyaW5nKSA9PlxuICAgICAgICAgICAgICB0aGlzLmltYWdlU3VwcG9ydC5idWlsZFNlY3VyZUltYWdlQ29kZUJsb2NrKHRoaXMudW5lc2NhcGVIdG1sKHJlbW90ZVBhdGgpLCB0aGlzLnVuZXNjYXBlSHRtbChyZW1vdGVQYXRoKSksXG4gICAgICAgICAgKTtcblxuICAgICAgICBpZiAodXBkYXRlZCA9PT0gY29udGVudCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIHVwZGF0ZWQpO1xuICAgICAgICBjaGFuZ2VkRmlsZXMgKz0gMTtcbiAgICAgIH1cblxuICAgICAgaWYgKGNoYW5nZWRGaWxlcyA9PT0gMCkge1xuICAgICAgICBuZXcgTm90aWNlKFxuICAgICAgICAgIHRoaXMudChcbiAgICAgICAgICAgIFwiXHU2NTc0XHU1RTkzXHU5MUNDXHU2Q0ExXHU2NzA5XHU1M0QxXHU3M0IwXHU1M0VGXHU4RkMxXHU3OUZCXHU3Njg0XHU2NUU3XHU3MjQ4XHU1Qjg5XHU1MTY4XHU1NkZFXHU3MjQ3XHU2ODA3XHU3QjdFXHUzMDAyXCIsXG4gICAgICAgICAgICBcIk5vIGxlZ2FjeSBzZWN1cmUgaW1hZ2UgdGFncyB3ZXJlIGZvdW5kIGluIHRoZSB2YXVsdC5cIixcbiAgICAgICAgICApLFxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLmRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQpIHtcbiAgICAgICAgYXdhaXQgdGhpcy50cmFzaE1pZ3JhdGVkSW1hZ2VzSWZTYWZlKGNhbmRpZGF0ZUxvY2FsSW1hZ2VzKTtcbiAgICAgIH1cblxuICAgICAgbmV3IE5vdGljZShcbiAgICAgIHRoaXMudChcbiAgICAgICAgYFx1NURGMlx1OEZDMVx1NzlGQiAke2NoYW5nZWRGaWxlc30gXHU3QkM3XHU3QjE0XHU4QkIwXHU1MjMwXHU2NUIwXHU3Njg0XHU1Qjg5XHU1MTY4XHU1NkZFXHU3MjQ3XHU0RUUzXHU3ODAxXHU1NzU3XHU2ODNDXHU1RjBGXHUzMDAyYCxcbiAgICAgICAgYE1pZ3JhdGVkICR7Y2hhbmdlZEZpbGVzfSBub3RlKHMpIHRvIHRoZSBuZXcgc2VjdXJlIGltYWdlIGNvZGUtYmxvY2sgZm9ybWF0LmAsXG4gICAgICApLFxuICAgICAgICA4MDAwLFxuICAgICAgKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBtaWdyYXRlIHNlY3VyZSBpbWFnZXMgdG8gY29kZSBibG9ja3NcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU4RkMxXHU3OUZCXHU1Qjg5XHU1MTY4XHU1NkZFXHU3MjQ3XHU2ODNDXHU1RjBGXHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIG1pZ3JhdGUgc2VjdXJlIGltYWdlIGZvcm1hdFwiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHRyYXNoTWlncmF0ZWRJbWFnZXNJZlNhZmUoY2FuZGlkYXRlTG9jYWxJbWFnZXM6IE1hcDxzdHJpbmcsIFRGaWxlPikge1xuICAgIGlmIChjYW5kaWRhdGVMb2NhbEltYWdlcy5zaXplID09PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgcmVtYWluaW5nUmVmcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGZvciAoY29uc3Qgbm90ZSBvZiB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkpIHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKG5vdGUpO1xuICAgICAgY29uc3Qgd2lraU1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvIVxcW1xcWyhbXlxcXV0rKVxcXVxcXS9nKV07XG4gICAgICBjb25zdCBtYXJrZG93bk1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvIVxcW1teXFxdXSpdXFwoKFteKV0rKVxcKS9nKV07XG5cbiAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2Ygd2lraU1hdGNoZXMpIHtcbiAgICAgICAgY29uc3QgcmF3TGluayA9IG1hdGNoWzFdLnNwbGl0KFwifFwiKVswXS50cmltKCk7XG4gICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMucmVzb2x2ZUxpbmtlZEZpbGUocmF3TGluaywgbm90ZS5wYXRoKTtcbiAgICAgICAgaWYgKHRhcmdldCAmJiB0aGlzLmlzSW1hZ2VGaWxlKHRhcmdldCkpIHtcbiAgICAgICAgICByZW1haW5pbmdSZWZzLmFkZCh0YXJnZXQucGF0aCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXJrZG93bk1hdGNoZXMpIHtcbiAgICAgICAgY29uc3QgcmF3TGluayA9IGRlY29kZVVSSUNvbXBvbmVudChtYXRjaFsxXS50cmltKCkucmVwbGFjZSgvXjx8PiQvZywgXCJcIikpO1xuICAgICAgICBpZiAoL14oaHR0cHM/Onx3ZWJkYXYtc2VjdXJlOnxkYXRhOikvaS50ZXN0KHJhd0xpbmspKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGUucGF0aCk7XG4gICAgICAgIGlmICh0YXJnZXQgJiYgdGhpcy5pc0ltYWdlRmlsZSh0YXJnZXQpKSB7XG4gICAgICAgICAgcmVtYWluaW5nUmVmcy5hZGQodGFyZ2V0LnBhdGgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBbcGF0aCwgZmlsZV0gb2YgY2FuZGlkYXRlTG9jYWxJbWFnZXMuZW50cmllcygpKSB7XG4gICAgICBpZiAocmVtYWluaW5nUmVmcy5oYXMocGF0aCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMudHJhc2hJZkV4aXN0cyhmaWxlKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBydW5Db25uZWN0aW9uVGVzdChzaG93TW9kYWwgPSBmYWxzZSkge1xuICAgIHRyeSB7XG4gICAgICB0aGlzLmVuc3VyZUNvbmZpZ3VyZWQoKTtcblxuICAgICAgY29uc3QgcHJvYmVOYW1lID0gYC5zZWN1cmUtd2ViZGF2LXByb2JlLSR7RGF0ZS5ub3coKX0udHh0YDtcbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkUmVtb3RlUGF0aChwcm9iZU5hbWUpO1xuICAgICAgY29uc3QgdXBsb2FkVXJsID0gdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKTtcbiAgICAgIGNvbnN0IHByb2JlQXJyYXlCdWZmZXIgPSB0aGlzLmVuY29kZVV0ZjgoYHNlY3VyZS13ZWJkYXYgcHJvYmUgJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCl9YCk7XG5cbiAgICAgIGNvbnN0IHB1dFJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB1cGxvYWRVcmwsXG4gICAgICAgIG1ldGhvZDogXCJQVVRcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJ0ZXh0L3BsYWluOyBjaGFyc2V0PXV0Zi04XCIsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IHByb2JlQXJyYXlCdWZmZXIsXG4gICAgICB9KTtcbiAgICAgIGlmIChwdXRSZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcHV0UmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFBVVCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtwdXRSZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGdldFJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB1cGxvYWRVcmwsXG4gICAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICAgIGlmIChnZXRSZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgZ2V0UmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEdFVCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtnZXRSZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGRlbGV0ZVJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB1cGxvYWRVcmwsXG4gICAgICAgIG1ldGhvZDogXCJERUxFVEVcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICAgIGlmIChkZWxldGVSZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgZGVsZXRlUmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYERFTEVURSBmYWlsZWQgd2l0aCBzdGF0dXMgJHtkZWxldGVSZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSB0aGlzLnQoXG4gICAgICAgIGBXZWJEQVYgXHU2RDRCXHU4QkQ1XHU5MDFBXHU4RkM3XHUzMDAyUFVUICR7cHV0UmVzcG9uc2Uuc3RhdHVzfVx1RkYwQ0dFVCAke2dldFJlc3BvbnNlLnN0YXR1c31cdUZGMENERUxFVEUgJHtkZWxldGVSZXNwb25zZS5zdGF0dXN9XHUzMDAyYCxcbiAgICAgICAgYFdlYkRBViB0ZXN0IHBhc3NlZC4gUFVUICR7cHV0UmVzcG9uc2Uuc3RhdHVzfSwgR0VUICR7Z2V0UmVzcG9uc2Uuc3RhdHVzfSwgREVMRVRFICR7ZGVsZXRlUmVzcG9uc2Uuc3RhdHVzfS5gLFxuICAgICAgKTtcbiAgICAgIG5ldyBOb3RpY2UobWVzc2FnZSwgNjAwMCk7XG4gICAgICBpZiAoc2hvd01vZGFsKSB7XG4gICAgICAgIG5ldyBSZXN1bHRNb2RhbCh0aGlzLmFwcCwgdGhpcy50KFwiV2ViREFWIFx1OEZERVx1NjNBNVwiLCBcIldlYkRBViBDb25uZWN0aW9uXCIpLCBtZXNzYWdlKS5vcGVuKCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIlNlY3VyZSBXZWJEQVYgdGVzdCBmYWlsZWRcIiwgZXJyb3IpO1xuICAgICAgY29uc3QgbWVzc2FnZSA9IHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJXZWJEQVYgXHU2RDRCXHU4QkQ1XHU1OTMxXHU4RDI1XCIsIFwiV2ViREFWIHRlc3QgZmFpbGVkXCIpLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKG1lc3NhZ2UsIDgwMDApO1xuICAgICAgaWYgKHNob3dNb2RhbCkge1xuICAgICAgICBuZXcgUmVzdWx0TW9kYWwodGhpcy5hcHAsIHRoaXMudChcIldlYkRBViBcdThGREVcdTYzQTVcIiwgXCJXZWJEQVYgQ29ubmVjdGlvblwiKSwgbWVzc2FnZSkub3BlbigpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZGVzY3JpYmVFcnJvcihwcmVmaXg6IHN0cmluZywgZXJyb3I6IHVua25vd24pIHtcbiAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xuICAgIHJldHVybiBgJHtwcmVmaXh9OiAke21lc3NhZ2V9YDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVxdWVzdFVybChvcHRpb25zOiB7XG4gICAgdXJsOiBzdHJpbmc7XG4gICAgbWV0aG9kOiBzdHJpbmc7XG4gICAgaGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gICAgYm9keT86IEFycmF5QnVmZmVyO1xuICAgIGZvbGxvd1JlZGlyZWN0cz86IGJvb2xlYW47XG4gICAgcmVkaXJlY3RDb3VudD86IG51bWJlcjtcbiAgfSk6IFByb21pc2U8eyBzdGF0dXM6IG51bWJlcjsgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPjsgYXJyYXlCdWZmZXI6IEFycmF5QnVmZmVyIH0+IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG9ic2lkaWFuUmVxdWVzdFVybCh7XG4gICAgICB1cmw6IG9wdGlvbnMudXJsLFxuICAgICAgbWV0aG9kOiBvcHRpb25zLm1ldGhvZCxcbiAgICAgIGhlYWRlcnM6IG9wdGlvbnMuaGVhZGVycyxcbiAgICAgIGJvZHk6IG9wdGlvbnMuYm9keSxcbiAgICAgIHRocm93OiBmYWxzZSxcbiAgICB9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6IHJlc3BvbnNlLnN0YXR1cyxcbiAgICAgIGhlYWRlcnM6IHJlc3BvbnNlLmhlYWRlcnMsXG4gICAgICBhcnJheUJ1ZmZlcjogcmVzcG9uc2UuYXJyYXlCdWZmZXIsXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgZW5jb2RlVXRmOCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgY29uc3QgYnl0ZXMgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUodmFsdWUpO1xuICAgIHJldHVybiBieXRlcy5idWZmZXIuc2xpY2UoYnl0ZXMuYnl0ZU9mZnNldCwgYnl0ZXMuYnl0ZU9mZnNldCArIGJ5dGVzLmJ5dGVMZW5ndGgpIGFzIEFycmF5QnVmZmVyO1xuICB9XG5cbiAgcHJpdmF0ZSBkZWNvZGVVdGY4KGJ1ZmZlcjogQXJyYXlCdWZmZXIpIHtcbiAgICByZXR1cm4gbmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGJ1ZmZlcik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNvbXB1dGVTaGEyNTZIZXgoYnVmZmVyOiBBcnJheUJ1ZmZlcikge1xuICAgIGNvbnN0IGRpZ2VzdCA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZGlnZXN0KFwiU0hBLTI1NlwiLCBidWZmZXIpO1xuICAgIHJldHVybiBBcnJheS5mcm9tKG5ldyBVaW50OEFycmF5KGRpZ2VzdCkpXG4gICAgICAubWFwKCh2YWx1ZSkgPT4gdmFsdWUudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsIFwiMFwiKSlcbiAgICAgIC5qb2luKFwiXCIpO1xuICB9XG59XG5cbnR5cGUgVXBsb2FkUmV3cml0ZSA9IHtcbiAgb3JpZ2luYWw6IHN0cmluZztcbiAgcmV3cml0dGVuOiBzdHJpbmc7XG4gIHNvdXJjZUZpbGU/OiBURmlsZTtcbn07XG5cbmNsYXNzIFNlY3VyZVdlYmRhdlNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcbiAgcGx1Z2luOiBTZWN1cmVXZWJkYXZJbWFnZXNQbHVnaW47XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogU2VjdXJlV2ViZGF2SW1hZ2VzUGx1Z2luKSB7XG4gICAgc3VwZXIoYXBwLCBwbHVnaW4pO1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICB9XG5cbiAgZGlzcGxheSgpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xuICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XG5cbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJTZWN1cmUgV2ViREFWIEltYWdlc1wiIH0pO1xuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwicFwiLCB7XG4gICAgICB0ZXh0OiB0aGlzLnBsdWdpbi50KFxuICAgICAgICBcIlx1OEZEOVx1NEUyQVx1NjNEMlx1NEVGNlx1NTNFQVx1NjI4QVx1NTZGRVx1NzI0N1x1NTI2NVx1NzlCQlx1NTIzMFx1NTM1NVx1NzJFQ1x1NzY4NFx1OEZEQ1x1N0FFRlx1NzZFRVx1NUY1NVx1RkYwQ1x1NUU3Nlx1NEZERFx1NUI1OFx1NEUzQSBzZWN1cmUtd2ViZGF2IFx1ODFFQVx1NUI5QVx1NEU0OVx1NEVFM1x1NzgwMVx1NTc1N1x1RkYxQlx1NTE3Nlx1NEVENlx1N0IxNFx1OEJCMFx1NTQ4Q1x1OTY0NFx1NEVGNlx1NjMwOVx1NTM5Rlx1OERFRlx1NUY4NFx1NTM5Rlx1NjgzN1x1NTQwQ1x1NkI2NVx1MzAwMlwiLFxuICAgICAgICBcIlRoaXMgcGx1Z2luIHNlcGFyYXRlcyBvbmx5IGltYWdlcyBpbnRvIGEgZGVkaWNhdGVkIHJlbW90ZSBmb2xkZXIgYW5kIHN0b3JlcyB0aGVtIGFzIHNlY3VyZS13ZWJkYXYgY3VzdG9tIGNvZGUgYmxvY2tzLiBOb3RlcyBhbmQgb3RoZXIgYXR0YWNobWVudHMgYXJlIHN5bmNlZCBhcy1pcyB3aXRoIHRoZWlyIG9yaWdpbmFsIHBhdGhzLlwiLFxuICAgICAgKSxcbiAgICB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NUY1M1x1NTI0RFx1NjNEMlx1NEVGNlx1NzI0OFx1NjcyQ1wiLCBcIkN1cnJlbnQgcGx1Z2luIHZlcnNpb25cIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1NTkxQVx1N0FFRlx1NEY3Rlx1NzUyOFx1NjVGNlx1NTNFRlx1NTE0OFx1NjgzOFx1NUJGOVx1OEZEOVx1OTFDQ1x1NzY4NFx1NzI0OFx1NjcyQ1x1NTNGN1x1RkYwQ1x1OTA3Rlx1NTE0RFx1NTZFMFx1NEUzQVx1NUJBMlx1NjIzN1x1N0FFRlx1NTM0N1x1N0VBN1x1NEUwRFx1NTIzMFx1NEY0RFx1NUJGQ1x1ODFGNFx1ODg0Q1x1NEUzQVx1NEUwRFx1NEUwMFx1ODFGNFx1MzAwMlwiLFxuICAgICAgICAgIFwiQ2hlY2sgdGhpcyB2ZXJzaW9uIGZpcnN0IGFjcm9zcyBkZXZpY2VzIHRvIGF2b2lkIGluY29uc2lzdGVudCBiZWhhdmlvciBjYXVzZWQgYnkgaW5jb21wbGV0ZSB1cGdyYWRlcy5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PiB7XG4gICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4ubWFuaWZlc3QudmVyc2lvbik7XG4gICAgICAgIHRleHQuc2V0RGlzYWJsZWQodHJ1ZSk7XG4gICAgICB9KTtcblxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiB0aGlzLnBsdWdpbi50KFwiXHU3NTRDXHU5NzYyXHU4QkVEXHU4QTAwXCIsIFwiSW50ZXJmYWNlIGxhbmd1YWdlXCIpIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4QkVEXHU4QTAwXCIsIFwiTGFuZ3VhZ2VcIikpXG4gICAgICAuc2V0RGVzYyh0aGlzLnBsdWdpbi50KFwiXHU4QkJFXHU3RjZFXHU5ODc1XHU2NTJGXHU2MzAxXHU4MUVBXHU1MkE4XHUzMDAxXHU0RTJEXHU2NTg3XHUzMDAxXHU4MkYxXHU2NTg3XHU1MjA3XHU2MzYyXHUzMDAyXCIsIFwiU3dpdGNoIHRoZSBzZXR0aW5ncyBVSSBiZXR3ZWVuIGF1dG8sIENoaW5lc2UsIGFuZCBFbmdsaXNoLlwiKSlcbiAgICAgIC5hZGREcm9wZG93bigoZHJvcGRvd24pID0+XG4gICAgICAgIGRyb3Bkb3duXG4gICAgICAgICAgLmFkZE9wdGlvbihcImF1dG9cIiwgdGhpcy5wbHVnaW4udChcIlx1ODFFQVx1NTJBOFwiLCBcIkF1dG9cIikpXG4gICAgICAgICAgLmFkZE9wdGlvbihcInpoXCIsIFwiXHU0RTJEXHU2NTg3XCIpXG4gICAgICAgICAgLmFkZE9wdGlvbihcImVuXCIsIFwiRW5nbGlzaFwiKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5sYW5ndWFnZSlcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5sYW5ndWFnZSA9IHZhbHVlIGFzIFwiYXV0b1wiIHwgXCJ6aFwiIHwgXCJlblwiO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcbiAgICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy5wbHVnaW4udChcIlx1OEZERVx1NjNBNVx1OEJCRVx1N0Y2RVwiLCBcIkNvbm5lY3Rpb25cIikgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJXZWJEQVYgXHU1N0ZBXHU3ODQwXHU1NzMwXHU1NzQwXCIsIFwiV2ViREFWIGJhc2UgVVJMXCIpKVxuICAgICAgLnNldERlc2ModGhpcy5wbHVnaW4udChcIlx1NjcwRFx1NTJBMVx1NTY2OFx1NTdGQVx1Nzg0MFx1NTczMFx1NTc0MFx1RkYwQ1x1NEY4Qlx1NTk4Mlx1RkYxQWh0dHA6Ly95b3VyLXdlYmRhdi1ob3N0OnBvcnRcIiwgXCJCYXNlIHNlcnZlciBVUkwuIEV4YW1wbGU6IGh0dHA6Ly95b3VyLXdlYmRhdi1ob3N0OnBvcnRcIikpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImh0dHA6Ly95b3VyLXdlYmRhdi1ob3N0OnBvcnRcIilcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mud2ViZGF2VXJsKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLndlYmRhdlVybCA9IHZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1OEQyNlx1NTNGN1wiLCBcIlVzZXJuYW1lXCIpKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlcm5hbWUpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZXJuYW1lID0gdmFsdWUudHJpbSgpO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTVCQzZcdTc4MDFcIiwgXCJQYXNzd29yZFwiKSlcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdTlFRDhcdThCQTRcdTk2OTBcdTg1Q0ZcdUZGMENcdTUzRUZcdTcwQjlcdTUxRkJcdTUzRjNcdTRGQTdcdTYzMDlcdTk0QUVcdTY2M0VcdTc5M0FcdTYyMTZcdTk2OTBcdTg1Q0ZcdTMwMDJcIiwgXCJIaWRkZW4gYnkgZGVmYXVsdC4gVXNlIHRoZSBidXR0b24gb24gdGhlIHJpZ2h0IHRvIHNob3cgb3IgaGlkZSBpdC5cIikpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT4ge1xuICAgICAgICB0ZXh0LmlucHV0RWwudHlwZSA9IFwicGFzc3dvcmRcIjtcbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXNzd29yZCkub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucGFzc3dvcmQgPSB2YWx1ZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLmFkZEV4dHJhQnV0dG9uKChidXR0b24pID0+IHtcbiAgICAgICAgbGV0IHZpc2libGUgPSBmYWxzZTtcbiAgICAgICAgYnV0dG9uLnNldEljb24oXCJleWVcIik7XG4gICAgICAgIGJ1dHRvbi5zZXRUb29sdGlwKHRoaXMucGx1Z2luLnQoXCJcdTY2M0VcdTc5M0FcdTVCQzZcdTc4MDFcIiwgXCJTaG93IHBhc3N3b3JkXCIpKTtcbiAgICAgICAgYnV0dG9uLm9uQ2xpY2soKCkgPT4ge1xuICAgICAgICAgIGNvbnN0IGlucHV0ID0gYnV0dG9uLmV4dHJhU2V0dGluZ3NFbC5wYXJlbnRFbGVtZW50Py5xdWVyeVNlbGVjdG9yKFwiaW5wdXRcIik7XG4gICAgICAgICAgaWYgKCEoaW5wdXQgaW5zdGFuY2VvZiBIVE1MSW5wdXRFbGVtZW50KSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHZpc2libGUgPSAhdmlzaWJsZTtcbiAgICAgICAgICBpbnB1dC50eXBlID0gdmlzaWJsZSA/IFwidGV4dFwiIDogXCJwYXNzd29yZFwiO1xuICAgICAgICAgIGJ1dHRvbi5zZXRJY29uKHZpc2libGUgPyBcImV5ZS1vZmZcIiA6IFwiZXllXCIpO1xuICAgICAgICAgIGJ1dHRvbi5zZXRUb29sdGlwKHRoaXMucGx1Z2luLnQodmlzaWJsZSA/IFwiXHU5NjkwXHU4NUNGXHU1QkM2XHU3ODAxXCIgOiBcIlx1NjYzRVx1NzkzQVx1NUJDNlx1NzgwMVwiLCB2aXNpYmxlID8gXCJIaWRlIHBhc3N3b3JkXCIgOiBcIlNob3cgcGFzc3dvcmRcIikpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU1NkZFXHU3MjQ3XHU4RkRDXHU3QTBCXHU3NkVFXHU1RjU1XCIsIFwiSW1hZ2UgcmVtb3RlIGZvbGRlclwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU0RTEzXHU5NUU4XHU3NTI4XHU0RThFXHU1QjU4XHU2NTNFXHU4RkRDXHU3QTBCXHU1NkZFXHU3MjQ3XHU3Njg0IFdlYkRBViBcdTc2RUVcdTVGNTVcdUZGMENcdTRGOEJcdTU5ODJcdUZGMUEvcmVtb3RlLWltYWdlcy9cdTMwMDJcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTYyMTBcdTUyOUZcdTU0MEVcdTRGMUFcdTdBQ0JcdTUzNzNcdTUyMjBcdTk2NjRcdTY3MkNcdTU3MzBcdTU2RkVcdTcyNDdcdTY1ODdcdTRFRjZcdTMwMDJcIixcbiAgICAgICAgICBcIkRlZGljYXRlZCBXZWJEQVYgZm9sZGVyIGZvciByZW1vdGUgaW1hZ2VzLCBmb3IgZXhhbXBsZTogL3JlbW90ZS1pbWFnZXMvLiBMb2NhbCBpbWFnZSBmaWxlcyBhcmUgZGVsZXRlZCBpbW1lZGlhdGVseSBhZnRlciB1cGxvYWQgc3VjY2VlZHMuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZW1vdGVGb2xkZXIpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnJlbW90ZUZvbGRlciA9IG5vcm1hbGl6ZVBhdGgodmFsdWUudHJpbSgpIHx8IFwiL3JlbW90ZS1pbWFnZXMvXCIpO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTZENEJcdThCRDVcdThGREVcdTYzQTVcIiwgXCJUZXN0IGNvbm5lY3Rpb25cIikpXG4gICAgICAuc2V0RGVzYyh0aGlzLnBsdWdpbi50KFwiXHU0RjdGXHU3NTI4XHU0RTM0XHU2NUY2XHU2M0EyXHU5NDg4XHU2NTg3XHU0RUY2XHU5QThDXHU4QkMxIFBVVFx1MzAwMUdFVFx1MzAwMURFTEVURSBcdTY2MkZcdTU0MjZcdTZCNjNcdTVFMzhcdTMwMDJcIiwgXCJWZXJpZnkgUFVULCBHRVQsIGFuZCBERUxFVEUgdXNpbmcgYSB0ZW1wb3JhcnkgcHJvYmUgZmlsZS5cIikpXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KHRoaXMucGx1Z2luLnQoXCJcdTVGMDBcdTU5Q0JcdTZENEJcdThCRDVcIiwgXCJSdW4gdGVzdFwiKSkub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKHRydWUpO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5ydW5Db25uZWN0aW9uVGVzdCh0cnVlKTtcbiAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKGZhbHNlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiB0aGlzLnBsdWdpbi50KFwiXHU1NDBDXHU2QjY1XHU4QkJFXHU3RjZFXCIsIFwiU3luY1wiKSB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1OEZEQ1x1N0EwQlx1N0IxNFx1OEJCMFx1NzZFRVx1NUY1NVwiLCBcIlJlbW90ZSBub3RlcyBmb2xkZXJcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1NzUyOFx1NEU4RVx1NUI1OFx1NjUzRVx1N0IxNFx1OEJCMFx1NTQ4Q1x1NTE3Nlx1NEVENlx1OTc1RVx1NTZGRVx1NzI0N1x1OTY0NFx1NEVGNlx1NTM5Rlx1NjgzN1x1NTQwQ1x1NkI2NVx1NTI2Rlx1NjcyQ1x1NzY4NFx1OEZEQ1x1N0FFRlx1NzZFRVx1NUY1NVx1RkYwQ1x1NEY4Qlx1NTk4Mlx1RkYxQS92YXVsdC1zeW5jL1x1MzAwMlx1NjNEMlx1NEVGNlx1NEYxQVx1ODFFQVx1NTJBOFx1NTQwQ1x1NkI2NVx1NjU3NFx1NEUyQSB2YXVsdFx1RkYwQ1x1NUU3Nlx1OERGM1x1OEZDNyAub2JzaWRpYW5cdTMwMDFcdTYzRDJcdTRFRjZcdTc2RUVcdTVGNTVcdTU0OENcdTU2RkVcdTcyNDdcdTY1ODdcdTRFRjZcdTMwMDJcIixcbiAgICAgICAgICBcIlJlbW90ZSBmb2xkZXIgdXNlZCBmb3Igbm90ZXMgYW5kIG90aGVyIG5vbi1pbWFnZSBhdHRhY2htZW50cyBzeW5jZWQgYXMtaXMsIGZvciBleGFtcGxlOiAvdmF1bHQtc3luYy8uIFRoZSBwbHVnaW4gc3luY3MgdGhlIHdob2xlIHZhdWx0IGFuZCBhdXRvbWF0aWNhbGx5IHNraXBzIC5vYnNpZGlhbiwgdGhlIHBsdWdpbiBkaXJlY3RvcnksIGFuZCBpbWFnZSBmaWxlcy5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnZhdWx0U3luY1JlbW90ZUZvbGRlcikub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyID0gbm9ybWFsaXplUGF0aCh2YWx1ZS50cmltKCkgfHwgXCIvdmF1bHQtc3luYy9cIik7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1ODFFQVx1NTJBOFx1NTQwQ1x1NkI2NVx1OTg5MVx1NzM4N1wiLCBcIkF1dG8gc3luYyBmcmVxdWVuY3lcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1NEVFNVx1NTIwNlx1OTQ5Rlx1NEUzQVx1NTM1NVx1NEY0RFx1OEJCRVx1N0Y2RVx1ODFFQVx1NTJBOFx1NTQwQ1x1NkI2NVx1NjVGNlx1OTVGNFx1MzAwMlx1NTg2QiAwIFx1ODg2OFx1NzkzQVx1NTE3M1x1OTVFRFx1ODFFQVx1NTJBOFx1NTQwQ1x1NkI2NVx1MzAwMlx1OEZEOVx1OTFDQ1x1NzY4NFx1NTQwQ1x1NkI2NVx1NjYyRlx1MjAxQ1x1NUJGOVx1OEQyNlx1NTQwQ1x1NkI2NVx1MjAxRFx1RkYxQVx1NEYxQVx1NjhDMFx1NjdFNVx1NjcyQ1x1NTczMFx1NEUwRVx1OEZEQ1x1N0FFRlx1NzZFRVx1NUY1NVx1NURFRVx1NUYwMlx1RkYwQ1x1ODg2NVx1NEYyMFx1NjVCMFx1NTg5RVx1NTQ4Q1x1NTNEOFx1NjZGNFx1NjU4N1x1NEVGNlx1RkYwQ1x1NUU3Nlx1NTIyMFx1OTY2NFx1OEZEQ1x1N0FFRlx1NTkxQVx1NEY1OVx1NTE4NVx1NUJCOVx1MzAwMlwiLFxuICAgICAgICAgIFwiU2V0IHRoZSBhdXRvbWF0aWMgc3luYyBpbnRlcnZhbCBpbiBtaW51dGVzLiBVc2UgMCB0byB0dXJuIGl0IG9mZi4gVGhpcyBpcyBhIHJlY29uY2lsaWF0aW9uIHN5bmM6IGl0IGNoZWNrcyBsb2NhbCBhbmQgcmVtb3RlIGRpZmZlcmVuY2VzLCB1cGxvYWRzIG5ldyBvciBjaGFuZ2VkIGZpbGVzLCBhbmQgcmVtb3ZlcyBleHRyYSByZW1vdGUgY29udGVudC5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiMFwiKVxuICAgICAgICAgIC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXMpKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IE51bWJlci5wYXJzZUludCh2YWx1ZSwgMTApO1xuICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNOYU4ocGFyc2VkKSkge1xuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvU3luY0ludGVydmFsTWludXRlcyA9IE1hdGgubWF4KDAsIHBhcnNlZCk7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1N0IxNFx1OEJCMFx1NjcyQ1x1NTczMFx1NEZERFx1NzU1OVx1NkEyMVx1NUYwRlwiLCBcIk5vdGUgbG9jYWwgcmV0ZW50aW9uIG1vZGVcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1NUI4Q1x1NjU3NFx1NjcyQ1x1NTczMFx1RkYxQVx1N0IxNFx1OEJCMFx1NTlDQlx1N0VDOFx1NEZERFx1NzU1OVx1NTcyOFx1NjcyQ1x1NTczMFx1MzAwMlx1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFx1RkYxQVx1OTU3Rlx1NjcxRlx1NjcyQVx1OEJCRlx1OTVFRVx1NzY4NCBNYXJrZG93biBcdTdCMTRcdThCQjBcdTRGMUFcdTg4QUJcdTY2RkZcdTYzNjJcdTRFM0FcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTY1ODdcdTRFRjZcdUZGMENcdTYyNTNcdTVGMDBcdTY1RjZcdTUxOERcdTRFQ0VcdThGRENcdTdBRUZcdTYwNjJcdTU5MERcdTMwMDJcIixcbiAgICAgICAgICBcIkZ1bGwgbG9jYWw6IG5vdGVzIGFsd2F5cyBzdGF5IGxvY2FsLiBMYXp5IG5vdGVzOiBzdGFsZSBNYXJrZG93biBub3RlcyBhcmUgcmVwbGFjZWQgd2l0aCBsb2NhbCBwbGFjZWhvbGRlciBmaWxlcyBhbmQgcmVzdG9yZWQgZnJvbSByZW1vdGUgd2hlbiBvcGVuZWQuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkRHJvcGRvd24oKGRyb3Bkb3duKSA9PlxuICAgICAgICBkcm9wZG93blxuICAgICAgICAgIC5hZGRPcHRpb24oXCJmdWxsLWxvY2FsXCIsIHRoaXMucGx1Z2luLnQoXCJcdTVCOENcdTY1NzRcdTY3MkNcdTU3MzBcIiwgXCJGdWxsIGxvY2FsXCIpKVxuICAgICAgICAgIC5hZGRPcHRpb24oXCJsYXp5LW5vdGVzXCIsIHRoaXMucGx1Z2luLnQoXCJcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTdCMTRcdThCQjBcIiwgXCJMYXp5IG5vdGVzXCIpKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlU3RvcmFnZU1vZGUpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Mubm90ZVN0b3JhZ2VNb2RlID0gdmFsdWUgYXMgXCJmdWxsLWxvY2FsXCIgfCBcImxhenktbm90ZXNcIjtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1N0IxNFx1OEJCMFx1NjcyQ1x1NTczMFx1NTZERVx1NjUzNlx1NTkyOVx1NjU3MFwiLCBcIk5vdGUgZXZpY3Rpb24gZGF5c1wiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU0RUM1XHU1NzI4XHUyMDFDXHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXHUyMDFEXHU2QTIxXHU1RjBGXHU0RTBCXHU3NTFGXHU2NTQ4XHUzMDAyXHU4RDg1XHU4RkM3XHU4RkQ5XHU0RTJBXHU1OTI5XHU2NTcwXHU2NzJBXHU2MjUzXHU1RjAwXHU3Njg0IE1hcmtkb3duIFx1N0IxNFx1OEJCMFx1RkYwQ1x1NEYxQVx1NTcyOFx1NTQwQ1x1NkI2NVx1NTQwRVx1ODhBQlx1NjZGRlx1NjM2Mlx1NEUzQVx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1NjU4N1x1NEVGNlx1MzAwMlwiLFxuICAgICAgICAgIFwiVXNlZCBvbmx5IGluIGxhenkgbm90ZSBtb2RlLiBNYXJrZG93biBub3RlcyBub3Qgb3BlbmVkIHdpdGhpbiB0aGlzIG51bWJlciBvZiBkYXlzIGFyZSByZXBsYWNlZCB3aXRoIGxvY2FsIHBsYWNlaG9sZGVyIGZpbGVzIGFmdGVyIHN5bmMuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcIjMwXCIpXG4gICAgICAgICAgLnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlRXZpY3RBZnRlckRheXMpKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IE51bWJlci5wYXJzZUludCh2YWx1ZSwgMTApO1xuICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNOYU4ocGFyc2VkKSkge1xuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlRXZpY3RBZnRlckRheXMgPSBNYXRoLm1heCgxLCBwYXJzZWQpO1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTU0MENcdTZCNjVcdTcyQjZcdTYwMDFcIiwgXCJTeW5jIHN0YXR1c1wiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIGAke3RoaXMucGx1Z2luLmZvcm1hdExhc3RTeW5jTGFiZWwoKX1cXG4ke3RoaXMucGx1Z2luLmZvcm1hdFN5bmNTdGF0dXNMYWJlbCgpfVxcbiR7dGhpcy5wbHVnaW4udChcIlx1OEJGNFx1NjYwRVx1RkYxQVx1N0FDQlx1NTM3M1x1NTQwQ1x1NkI2NVx1NEYxQVx1NjI2N1x1ODg0Q1x1NjcyQ1x1NTczMFx1NEUwRVx1OEZEQ1x1N0FFRlx1NzY4NFx1NUJGOVx1OEQyNlx1RkYwQ1x1NTQwQ1x1NkI2NVx1N0IxNFx1OEJCMFx1NEUwRVx1OTc1RVx1NTZGRVx1NzI0N1x1OTY0NFx1NEVGNlx1RkYwQ1x1NUU3Nlx1NkUwNVx1NzQwNlx1OEZEQ1x1N0FFRlx1NTE5N1x1NEY1OVx1NjU4N1x1NEVGNlx1MzAwMlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NEVDRFx1NzUzMVx1NzJFQ1x1N0FDQlx1OTYxRlx1NTIxN1x1NTkwNFx1NzQwNlx1MzAwMlwiLCBcIk5vdGU6IFN5bmMgbm93IHJlY29uY2lsZXMgbG9jYWwgYW5kIHJlbW90ZSBjb250ZW50LCBzeW5jcyBub3RlcyBhbmQgbm9uLWltYWdlIGF0dGFjaG1lbnRzLCBhbmQgY2xlYW5zIGV4dHJhIHJlbW90ZSBmaWxlcy4gSW1hZ2UgdXBsb2FkcyBjb250aW51ZSB0byBiZSBoYW5kbGVkIGJ5IHRoZSBzZXBhcmF0ZSBxdWV1ZS5cIil9YCxcbiAgICAgICAgICBgJHt0aGlzLnBsdWdpbi5mb3JtYXRMYXN0U3luY0xhYmVsKCl9XFxuJHt0aGlzLnBsdWdpbi5mb3JtYXRTeW5jU3RhdHVzTGFiZWwoKX1cXG4ke3RoaXMucGx1Z2luLnQoXCJcdThCRjRcdTY2MEVcdUZGMUFcdTdBQ0JcdTUzNzNcdTU0MENcdTZCNjVcdTRGMUFcdTYyNjdcdTg4NENcdTY3MkNcdTU3MzBcdTRFMEVcdThGRENcdTdBRUZcdTc2ODRcdTVCRjlcdThEMjZcdUZGMENcdTU0MENcdTZCNjVcdTdCMTRcdThCQjBcdTRFMEVcdTk3NUVcdTU2RkVcdTcyNDdcdTk2NDRcdTRFRjZcdUZGMENcdTVFNzZcdTZFMDVcdTc0MDZcdThGRENcdTdBRUZcdTUxOTdcdTRGNTlcdTY1ODdcdTRFRjZcdTMwMDJcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTRFQ0RcdTc1MzFcdTcyRUNcdTdBQ0JcdTk2MUZcdTUyMTdcdTU5MDRcdTc0MDZcdTMwMDJcIiwgXCJOb3RlOiBTeW5jIG5vdyByZWNvbmNpbGVzIGxvY2FsIGFuZCByZW1vdGUgY29udGVudCwgc3luY3Mgbm90ZXMgYW5kIG5vbi1pbWFnZSBhdHRhY2htZW50cywgYW5kIGNsZWFucyBleHRyYSByZW1vdGUgZmlsZXMuIEltYWdlIHVwbG9hZHMgY29udGludWUgdG8gYmUgaGFuZGxlZCBieSB0aGUgc2VwYXJhdGUgcXVldWUuXCIpfWAsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KHRoaXMucGx1Z2luLnQoXCJcdTdBQ0JcdTUzNzNcdTU0MENcdTZCNjVcIiwgXCJTeW5jIG5vd1wiKSkub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKHRydWUpO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zeW5jQ29uZmlndXJlZFZhdWx0Q29udGVudCh0cnVlKTtcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQoZmFsc2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMucGx1Z2luLnQoXCJcdTRFMDBcdTZCMjFcdTYwMjdcdTVERTVcdTUxNzdcIiwgXCJPbmUtdGltZSB0b29sc1wiKSB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1OEZDMVx1NzlGQlx1NjU3NFx1NUU5M1x1NTM5Rlx1NzUxRlx1NTZGRVx1NzI0N1x1NUYxNVx1NzUyOFwiLCBcIk1pZ3JhdGUgbmF0aXZlIGltYWdlIGVtYmVkcyBpbiB2YXVsdFwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU2MjZCXHU2M0NGXHU2NTc0XHU1RTkzXHU2MjQwXHU2NzA5IE1hcmtkb3duIFx1N0IxNFx1OEJCMFx1RkYwQ1x1NjI4QSBPYnNpZGlhbiBcdTUzOUZcdTc1MUZcdTY3MkNcdTU3MzBcdTU2RkVcdTcyNDdcdTVGMTVcdTc1MjhcdUZGMDhcdTU5ODIgIVtdKCkgXHU1NDhDICFbWy4uLl1dXHVGRjA5XHU0RTBBXHU0RjIwXHU1MjMwXHU4RkRDXHU3QUVGXHU1NkZFXHU3MjQ3XHU3NkVFXHU1RjU1XHVGRjBDXHU1RTc2XHU2NTM5XHU1MTk5XHU0RTNBIHNlY3VyZS13ZWJkYXYgXHU0RUUzXHU3ODAxXHU1NzU3XHUzMDAyXHU2NUU3XHU3MjQ4IHNwYW4gXHU1NDhDXHU2NUU5XHU2NzFGIHdlYmRhdi1zZWN1cmUgXHU5NEZFXHU2M0E1XHU0RTVGXHU0RjFBXHU0RTAwXHU1RTc2XHU2NTM2XHU2NTVCXHU1MjMwXHU2NUIwXHU2ODNDXHU1RjBGXHUzMDAyXCIsXG4gICAgICAgICAgXCJTY2FuIGFsbCBNYXJrZG93biBub3RlcyBpbiB0aGUgdmF1bHQsIHVwbG9hZCBuYXRpdmUgbG9jYWwgaW1hZ2UgZW1iZWRzIChzdWNoIGFzICFbXSgpIGFuZCAhW1suLi5dXSkgdG8gdGhlIHJlbW90ZSBpbWFnZSBmb2xkZXIsIGFuZCByZXdyaXRlIHRoZW0gYXMgc2VjdXJlLXdlYmRhdiBjb2RlIGJsb2Nrcy4gTGVnYWN5IHNwYW4gdGFncyBhbmQgZWFybHkgd2ViZGF2LXNlY3VyZSBsaW5rcyBhcmUgYWxzbyBub3JtYWxpemVkIHRvIHRoZSBuZXcgZm9ybWF0LlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dCh0aGlzLnBsdWdpbi50KFwiXHU1RjAwXHU1OUNCXHU4RkMxXHU3OUZCXCIsIFwiUnVuIG1pZ3JhdGlvblwiKSkub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKHRydWUpO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5taWdyYXRlQWxsTGVnYWN5U2VjdXJlSW1hZ2VzKCk7XG4gICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZChmYWxzZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KSxcbiAgICAgICk7XG4gIH1cbn1cblxuY2xhc3MgUmVzdWx0TW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHByaXZhdGUgcmVhZG9ubHkgdGl0bGVUZXh0OiBzdHJpbmc7XG4gIHByaXZhdGUgcmVhZG9ubHkgYm9keVRleHQ6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgdGl0bGVUZXh0OiBzdHJpbmcsIGJvZHlUZXh0OiBzdHJpbmcpIHtcbiAgICBzdXBlcihhcHApO1xuICAgIHRoaXMudGl0bGVUZXh0ID0gdGl0bGVUZXh0O1xuICAgIHRoaXMuYm9keVRleHQgPSBib2R5VGV4dDtcbiAgfVxuXG4gIG9uT3BlbigpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb250ZW50RWwuZW1wdHkoKTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMudGl0bGVUZXh0IH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiB0aGlzLmJvZHlUZXh0IH0pO1xuICB9XG5cbiAgb25DbG9zZSgpOiB2b2lkIHtcbiAgICB0aGlzLmNvbnRlbnRFbC5lbXB0eSgpO1xuICB9XG59XG5cbiIsICJpbXBvcnQgeyBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0LCBNYXJrZG93blJlbmRlckNoaWxkIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmV4cG9ydCBjb25zdCBTRUNVUkVfUFJPVE9DT0wgPSBcIndlYmRhdi1zZWN1cmU6XCI7XG5leHBvcnQgY29uc3QgU0VDVVJFX0NPREVfQkxPQ0sgPSBcInNlY3VyZS13ZWJkYXZcIjtcblxuZXhwb3J0IHR5cGUgU2VjdXJlV2ViZGF2SW1hZ2VCbG9jayA9IHtcbiAgcGF0aDogc3RyaW5nO1xuICBhbHQ6IHN0cmluZztcbn07XG5cbnR5cGUgU2VjdXJlV2ViZGF2SW1hZ2VTdXBwb3J0RGVwcyA9IHtcbiAgdDogKHpoOiBzdHJpbmcsIGVuOiBzdHJpbmcpID0+IHN0cmluZztcbiAgZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmw6IChyZW1vdGVQYXRoOiBzdHJpbmcpID0+IFByb21pc2U8c3RyaW5nPjtcbn07XG5cbmNsYXNzIFNlY3VyZVdlYmRhdlJlbmRlckNoaWxkIGV4dGVuZHMgTWFya2Rvd25SZW5kZXJDaGlsZCB7XG4gIGNvbnN0cnVjdG9yKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIHN1cGVyKGNvbnRhaW5lckVsKTtcbiAgfVxuXG4gIG9udW5sb2FkKCk6IHZvaWQge31cbn1cblxuLy8gS2VlcCBzZWN1cmUgaW1hZ2UgcGFyc2luZyBhbmQgcmVuZGVyaW5nIGlzb2xhdGVkIHNvIHN5bmMgY2hhbmdlcyBkbyBub3Rcbi8vIGFjY2lkZW50YWxseSBicmVhayB0aGUgZGlzcGxheSBwaXBlbGluZSBhZ2Fpbi5cbmV4cG9ydCBjbGFzcyBTZWN1cmVXZWJkYXZJbWFnZVN1cHBvcnQge1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGRlcHM6IFNlY3VyZVdlYmRhdkltYWdlU3VwcG9ydERlcHMpIHt9XG5cbiAgYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmw6IHN0cmluZywgYWx0OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5leHRyYWN0UmVtb3RlUGF0aChyZW1vdGVVcmwpO1xuICAgIGlmICghcmVtb3RlUGF0aCkge1xuICAgICAgcmV0dXJuIGAhW10oJHtyZW1vdGVVcmx9KWA7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayhyZW1vdGVQYXRoLCBhbHQpO1xuICB9XG5cbiAgYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayhyZW1vdGVQYXRoOiBzdHJpbmcsIGFsdDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZEFsdCA9IChhbHQgfHwgcmVtb3RlUGF0aCkucmVwbGFjZSgvXFxyP1xcbi9nLCBcIiBcIikudHJpbSgpO1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gcmVtb3RlUGF0aC5yZXBsYWNlKC9cXHI/XFxuL2csIFwiXCIpLnRyaW0oKTtcbiAgICByZXR1cm4gW2BcXGBcXGBcXGAke1NFQ1VSRV9DT0RFX0JMT0NLfWAsIGBwYXRoOiAke25vcm1hbGl6ZWRQYXRofWAsIGBhbHQ6ICR7bm9ybWFsaXplZEFsdH1gLCBcImBgYFwiXS5qb2luKFwiXFxuXCIpO1xuICB9XG5cbiAgcGFyc2VTZWN1cmVJbWFnZUJsb2NrKHNvdXJjZTogc3RyaW5nKTogU2VjdXJlV2ViZGF2SW1hZ2VCbG9jayB8IG51bGwge1xuICAgIGNvbnN0IHJlc3VsdDogU2VjdXJlV2ViZGF2SW1hZ2VCbG9jayA9IHsgcGF0aDogXCJcIiwgYWx0OiBcIlwiIH07XG4gICAgZm9yIChjb25zdCByYXdMaW5lIG9mIHNvdXJjZS5zcGxpdCgvXFxyP1xcbi8pKSB7XG4gICAgICBjb25zdCBsaW5lID0gcmF3TGluZS50cmltKCk7XG4gICAgICBpZiAoIWxpbmUpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHNlcGFyYXRvckluZGV4ID0gbGluZS5pbmRleE9mKFwiOlwiKTtcbiAgICAgIGlmIChzZXBhcmF0b3JJbmRleCA9PT0gLTEpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGtleSA9IGxpbmUuc2xpY2UoMCwgc2VwYXJhdG9ySW5kZXgpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgY29uc3QgdmFsdWUgPSBsaW5lLnNsaWNlKHNlcGFyYXRvckluZGV4ICsgMSkudHJpbSgpO1xuICAgICAgaWYgKGtleSA9PT0gXCJwYXRoXCIpIHtcbiAgICAgICAgcmVzdWx0LnBhdGggPSB2YWx1ZTtcbiAgICAgIH0gZWxzZSBpZiAoa2V5ID09PSBcImFsdFwiKSB7XG4gICAgICAgIHJlc3VsdC5hbHQgPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0LnBhdGggPyByZXN1bHQgOiBudWxsO1xuICB9XG5cbiAgYXN5bmMgcHJvY2Vzc1NlY3VyZUltYWdlcyhlbDogSFRNTEVsZW1lbnQsIGN0eDogTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dCkge1xuICAgIGNvbnN0IHNlY3VyZUNvZGVCbG9ja3MgPSBBcnJheS5mcm9tKGVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KGBwcmUgPiBjb2RlLmxhbmd1YWdlLSR7U0VDVVJFX0NPREVfQkxPQ0t9YCkpO1xuICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgc2VjdXJlQ29kZUJsb2Nrcy5tYXAoYXN5bmMgKGNvZGVFbCkgPT4ge1xuICAgICAgICBjb25zdCBwcmUgPSBjb2RlRWwucGFyZW50RWxlbWVudDtcbiAgICAgICAgaWYgKCEocHJlIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHx8IHByZS5oYXNBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXYtcmVuZGVyZWRcIikpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwYXJzZWQgPSB0aGlzLnBhcnNlU2VjdXJlSW1hZ2VCbG9jayhjb2RlRWwudGV4dENvbnRlbnQgPz8gXCJcIik7XG4gICAgICAgIGlmICghcGFyc2VkPy5wYXRoKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgcHJlLnNldEF0dHJpYnV0ZShcImRhdGEtc2VjdXJlLXdlYmRhdi1yZW5kZXJlZFwiLCBcInRydWVcIik7XG4gICAgICAgIGF3YWl0IHRoaXMucmVuZGVyU2VjdXJlSW1hZ2VJbnRvRWxlbWVudChwcmUsIHBhcnNlZC5wYXRoLCBwYXJzZWQuYWx0IHx8IHBhcnNlZC5wYXRoKTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zdCBzZWN1cmVOb2RlcyA9IEFycmF5LmZyb20oZWwucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXCJbZGF0YS1zZWN1cmUtd2ViZGF2XVwiKSk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICBzZWN1cmVOb2Rlcy5tYXAoYXN5bmMgKG5vZGUpID0+IHtcbiAgICAgICAgaWYgKG5vZGUgaW5zdGFuY2VvZiBIVE1MSW1hZ2VFbGVtZW50KSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5zd2FwSW1hZ2VTb3VyY2Uobm9kZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IG5vZGUuZ2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2XCIpO1xuICAgICAgICBpZiAoIXJlbW90ZVBhdGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xuICAgICAgICBpbWcuYWx0ID0gbm9kZS5nZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIpID8/IG5vZGUuZ2V0QXR0cmlidXRlKFwiYWx0XCIpID8/IFwiU2VjdXJlIFdlYkRBViBpbWFnZVwiO1xuICAgICAgICBpbWcuc2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2XCIsIHJlbW90ZVBhdGgpO1xuICAgICAgICBpbWcuY2xhc3NMaXN0LmFkZChcInNlY3VyZS13ZWJkYXYtaW1hZ2VcIiwgXCJpcy1sb2FkaW5nXCIpO1xuICAgICAgICBub2RlLnJlcGxhY2VXaXRoKGltZyk7XG4gICAgICAgIGF3YWl0IHRoaXMuc3dhcEltYWdlU291cmNlKGltZyk7XG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgY29uc3Qgc2VjdXJlTGlua3MgPSBBcnJheS5mcm9tKGVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEltYWdlRWxlbWVudD4oYGltZ1tzcmNePVwiJHtTRUNVUkVfUFJPVE9DT0x9Ly9cIl1gKSk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoc2VjdXJlTGlua3MubWFwKGFzeW5jIChpbWcpID0+IHRoaXMuc3dhcEltYWdlU291cmNlKGltZykpKTtcblxuICAgIGN0eC5hZGRDaGlsZChuZXcgU2VjdXJlV2ViZGF2UmVuZGVyQ2hpbGQoZWwpKTtcbiAgfVxuXG4gIGFzeW5jIHByb2Nlc3NTZWN1cmVDb2RlQmxvY2soc291cmNlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCwgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0KSB7XG4gICAgY29uc3QgcGFyc2VkID0gdGhpcy5wYXJzZVNlY3VyZUltYWdlQmxvY2soc291cmNlKTtcbiAgICBpZiAoIXBhcnNlZD8ucGF0aCkge1xuICAgICAgZWwuY3JlYXRlRWwoXCJkaXZcIiwge1xuICAgICAgICB0ZXh0OiB0aGlzLmRlcHMudChcIlx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NEVFM1x1NzgwMVx1NTc1N1x1NjgzQ1x1NUYwRlx1NjVFMFx1NjU0OFx1MzAwMlwiLCBcIkludmFsaWQgc2VjdXJlIGltYWdlIGNvZGUgYmxvY2sgZm9ybWF0LlwiKSxcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMucmVuZGVyU2VjdXJlSW1hZ2VJbnRvRWxlbWVudChlbCwgcGFyc2VkLnBhdGgsIHBhcnNlZC5hbHQgfHwgcGFyc2VkLnBhdGgpO1xuICAgIGN0eC5hZGRDaGlsZChuZXcgU2VjdXJlV2ViZGF2UmVuZGVyQ2hpbGQoZWwpKTtcbiAgfVxuXG4gIGV4dHJhY3RSZW1vdGVQYXRoKHNyYzogc3RyaW5nKSB7XG4gICAgY29uc3QgcHJlZml4ID0gYCR7U0VDVVJFX1BST1RPQ09MfS8vYDtcbiAgICBpZiAoIXNyYy5zdGFydHNXaXRoKHByZWZpeCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiBzcmMuc2xpY2UocHJlZml4Lmxlbmd0aCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlbmRlclNlY3VyZUltYWdlSW50b0VsZW1lbnQoZWw6IEhUTUxFbGVtZW50LCByZW1vdGVQYXRoOiBzdHJpbmcsIGFsdDogc3RyaW5nKSB7XG4gICAgY29uc3QgaW1nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImltZ1wiKTtcbiAgICBpbWcuYWx0ID0gYWx0O1xuICAgIGltZy5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIiwgcmVtb3RlUGF0aCk7XG4gICAgaW1nLmNsYXNzTGlzdC5hZGQoXCJzZWN1cmUtd2ViZGF2LWltYWdlXCIsIFwiaXMtbG9hZGluZ1wiKTtcbiAgICBlbC5lbXB0eSgpO1xuICAgIGVsLmFwcGVuZENoaWxkKGltZyk7XG4gICAgYXdhaXQgdGhpcy5zd2FwSW1hZ2VTb3VyY2UoaW1nKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc3dhcEltYWdlU291cmNlKGltZzogSFRNTEltYWdlRWxlbWVudCkge1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSBpbWcuZ2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2XCIpID8/IHRoaXMuZXh0cmFjdFJlbW90ZVBhdGgoaW1nLmdldEF0dHJpYnV0ZShcInNyY1wiKSA/PyBcIlwiKTtcbiAgICBpZiAoIXJlbW90ZVBhdGgpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpbWcuY2xhc3NMaXN0LmFkZChcInNlY3VyZS13ZWJkYXYtaW1hZ2VcIiwgXCJpcy1sb2FkaW5nXCIpO1xuICAgIGNvbnN0IG9yaWdpbmFsQWx0ID0gaW1nLmFsdDtcbiAgICBpbWcuYWx0ID0gb3JpZ2luYWxBbHQgfHwgdGhpcy5kZXBzLnQoXCJcdTUyQTBcdThGN0RcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTRFMkQuLi5cIiwgXCJMb2FkaW5nIHNlY3VyZSBpbWFnZS4uLlwiKTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBibG9iVXJsID0gYXdhaXQgdGhpcy5kZXBzLmZldGNoU2VjdXJlSW1hZ2VCbG9iVXJsKHJlbW90ZVBhdGgpO1xuICAgICAgaW1nLnNyYyA9IGJsb2JVcmw7XG4gICAgICBpbWcuYWx0ID0gb3JpZ2luYWxBbHQ7XG4gICAgICBpbWcuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgIGltZy5zdHlsZS5tYXhXaWR0aCA9IFwiMTAwJVwiO1xuICAgICAgaW1nLmNsYXNzTGlzdC5yZW1vdmUoXCJpcy1sb2FkaW5nXCIsIFwiaXMtZXJyb3JcIik7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIGltYWdlIGxvYWQgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIGltZy5yZXBsYWNlV2l0aCh0aGlzLmJ1aWxkRXJyb3JFbGVtZW50KHJlbW90ZVBhdGgsIGVycm9yKSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBidWlsZEVycm9yRWxlbWVudChyZW1vdGVQYXRoOiBzdHJpbmcsIGVycm9yOiB1bmtub3duKSB7XG4gICAgY29uc3QgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGVsLmNsYXNzTmFtZSA9IFwic2VjdXJlLXdlYmRhdi1pbWFnZSBpcy1lcnJvclwiO1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG4gICAgZWwudGV4dENvbnRlbnQgPSB0aGlzLmRlcHMudChcbiAgICAgIGBcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTUyQTBcdThGN0RcdTU5MzFcdThEMjVcdUZGMUEke3JlbW90ZVBhdGh9XHVGRjA4JHttZXNzYWdlfVx1RkYwOWAsXG4gICAgICBgU2VjdXJlIGltYWdlIGZhaWxlZDogJHtyZW1vdGVQYXRofSAoJHttZXNzYWdlfSlgLFxuICAgICk7XG4gICAgcmV0dXJuIGVsO1xuICB9XG59XG4iLCAiaW1wb3J0IHsgQXBwLCBFZGl0b3IsIE1hcmtkb3duVmlldywgTm90aWNlLCBUQWJzdHJhY3RGaWxlLCBURmlsZSB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5leHBvcnQgdHlwZSBVcGxvYWRUYXNrID0ge1xuICBpZDogc3RyaW5nO1xuICBub3RlUGF0aDogc3RyaW5nO1xuICBwbGFjZWhvbGRlcjogc3RyaW5nO1xuICBtaW1lVHlwZTogc3RyaW5nO1xuICBmaWxlTmFtZTogc3RyaW5nO1xuICBkYXRhQmFzZTY0OiBzdHJpbmc7XG4gIGF0dGVtcHRzOiBudW1iZXI7XG4gIGNyZWF0ZWRBdDogbnVtYmVyO1xuICBsYXN0RXJyb3I/OiBzdHJpbmc7XG59O1xuXG50eXBlIFNlY3VyZVdlYmRhdlVwbG9hZFF1ZXVlRGVwcyA9IHtcbiAgYXBwOiBBcHA7XG4gIHQ6ICh6aDogc3RyaW5nLCBlbjogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIHNldHRpbmdzOiAoKSA9PiB7IG1heFJldHJ5QXR0ZW1wdHM6IG51bWJlcjsgcmV0cnlEZWxheVNlY29uZHM6IG51bWJlciB9O1xuICBnZXRRdWV1ZTogKCkgPT4gVXBsb2FkVGFza1tdO1xuICBzZXRRdWV1ZTogKHF1ZXVlOiBVcGxvYWRUYXNrW10pID0+IHZvaWQ7XG4gIHNhdmVQbHVnaW5TdGF0ZTogKCkgPT4gUHJvbWlzZTx2b2lkPjtcbiAgc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jOiAobm90ZVBhdGg6IHN0cmluZywgcmVhc29uOiBcImltYWdlLWFkZFwiIHwgXCJpbWFnZS1yZW1vdmVcIikgPT4gdm9pZDtcbiAgcmVxdWVzdFVybDogKG9wdGlvbnM6IHtcbiAgICB1cmw6IHN0cmluZztcbiAgICBtZXRob2Q6IHN0cmluZztcbiAgICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgICBib2R5PzogQXJyYXlCdWZmZXI7XG4gICAgZm9sbG93UmVkaXJlY3RzPzogYm9vbGVhbjtcbiAgICByZWRpcmVjdENvdW50PzogbnVtYmVyO1xuICB9KSA9PiBQcm9taXNlPHsgc3RhdHVzOiBudW1iZXI7IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47IGFycmF5QnVmZmVyOiBBcnJheUJ1ZmZlciB9PjtcbiAgYnVpbGRVcGxvYWRVcmw6IChyZW1vdGVQYXRoOiBzdHJpbmcpID0+IHN0cmluZztcbiAgYnVpbGRBdXRoSGVhZGVyOiAoKSA9PiBzdHJpbmc7XG4gIHByZXBhcmVVcGxvYWRQYXlsb2FkOiAoXG4gICAgYmluYXJ5OiBBcnJheUJ1ZmZlcixcbiAgICBtaW1lVHlwZTogc3RyaW5nLFxuICAgIGZpbGVOYW1lOiBzdHJpbmcsXG4gICkgPT4gUHJvbWlzZTx7IGJpbmFyeTogQXJyYXlCdWZmZXI7IG1pbWVUeXBlOiBzdHJpbmc7IGZpbGVOYW1lOiBzdHJpbmcgfT47XG4gIGJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5OiAoZmlsZU5hbWU6IHN0cmluZywgYmluYXJ5OiBBcnJheUJ1ZmZlcikgPT4gUHJvbWlzZTxzdHJpbmc+O1xuICBidWlsZFJlbW90ZVBhdGg6IChmaWxlTmFtZTogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIGJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXA6IChyZW1vdGVVcmw6IHN0cmluZywgYWx0OiBzdHJpbmcpID0+IHN0cmluZztcbiAgZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWU6IChmaWxlTmFtZTogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIGFycmF5QnVmZmVyVG9CYXNlNjQ6IChidWZmZXI6IEFycmF5QnVmZmVyKSA9PiBzdHJpbmc7XG4gIGJhc2U2NFRvQXJyYXlCdWZmZXI6IChiYXNlNjQ6IHN0cmluZykgPT4gQXJyYXlCdWZmZXI7XG4gIGVzY2FwZUh0bWw6ICh2YWx1ZTogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIGVzY2FwZVJlZ0V4cDogKHZhbHVlOiBzdHJpbmcpID0+IHN0cmluZztcbiAgZGVzY3JpYmVFcnJvcjogKHByZWZpeDogc3RyaW5nLCBlcnJvcjogdW5rbm93bikgPT4gc3RyaW5nO1xufTtcblxuLy8gT3ducyB0aGUgcXVldWVkIGltYWdlIHVwbG9hZCB3b3JrZmxvdyBzbyBzeW5jIGFuZCBub3RlIGxvZ2ljIGNhbiBzdGF5IHNlcGFyYXRlLlxuZXhwb3J0IGNsYXNzIFNlY3VyZVdlYmRhdlVwbG9hZFF1ZXVlU3VwcG9ydCB7XG4gIHByaXZhdGUgcHJvY2Vzc2luZ1Rhc2tJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSByZXRyeVRpbWVvdXRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgcHJpdmF0ZSBwZW5kaW5nVGFza1Byb21pc2VzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8dm9pZD4+KCk7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBkZXBzOiBTZWN1cmVXZWJkYXZVcGxvYWRRdWV1ZURlcHMpIHt9XG5cbiAgZGlzcG9zZSgpIHtcbiAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnJldHJ5VGltZW91dHMudmFsdWVzKCkpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICB9XG4gICAgdGhpcy5yZXRyeVRpbWVvdXRzLmNsZWFyKCk7XG4gIH1cblxuICBoYXNQZW5kaW5nV29yaygpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5kZXBzLmdldFF1ZXVlKCkubGVuZ3RoID4gMCB8fFxuICAgICAgdGhpcy5wcm9jZXNzaW5nVGFza0lkcy5zaXplID4gMCB8fFxuICAgICAgdGhpcy5wZW5kaW5nVGFza1Byb21pc2VzLnNpemUgPiAwXG4gICAgKTtcbiAgfVxuXG4gIGhhc1BlbmRpbmdXb3JrRm9yTm90ZShub3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcXVldWUgPSB0aGlzLmRlcHMuZ2V0UXVldWUoKTtcbiAgICBpZiAocXVldWUuc29tZSgodGFzaykgPT4gdGFzay5ub3RlUGF0aCA9PT0gbm90ZVBhdGgpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHRhc2tJZCBvZiB0aGlzLnByb2Nlc3NpbmdUYXNrSWRzKSB7XG4gICAgICBjb25zdCB0YXNrID0gcXVldWUuZmluZCgoaXRlbSkgPT4gaXRlbS5pZCA9PT0gdGFza0lkKTtcbiAgICAgIGlmICh0YXNrPy5ub3RlUGF0aCA9PT0gbm90ZVBhdGgpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBbdGFza0lkXSBvZiB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMpIHtcbiAgICAgIGNvbnN0IHRhc2sgPSBxdWV1ZS5maW5kKChpdGVtKSA9PiBpdGVtLmlkID09PSB0YXNrSWQpO1xuICAgICAgaWYgKHRhc2s/Lm5vdGVQYXRoID09PSBub3RlUGF0aCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBhc3luYyBlbnF1ZXVlRWRpdG9ySW1hZ2VVcGxvYWQobm90ZUZpbGU6IFRGaWxlLCBlZGl0b3I6IEVkaXRvciwgaW1hZ2VGaWxlOiBGaWxlLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGFycmF5QnVmZmVyID0gYXdhaXQgaW1hZ2VGaWxlLmFycmF5QnVmZmVyKCk7XG4gICAgICBjb25zdCB0YXNrID0gdGhpcy5jcmVhdGVVcGxvYWRUYXNrKFxuICAgICAgICBub3RlRmlsZS5wYXRoLFxuICAgICAgICBhcnJheUJ1ZmZlcixcbiAgICAgICAgaW1hZ2VGaWxlLnR5cGUgfHwgdGhpcy5kZXBzLmdldE1pbWVUeXBlRnJvbUZpbGVOYW1lKGZpbGVOYW1lKSxcbiAgICAgICAgZmlsZU5hbWUsXG4gICAgICApO1xuICAgICAgdGhpcy5pbnNlcnRQbGFjZWhvbGRlcihlZGl0b3IsIHRhc2sucGxhY2Vob2xkZXIpO1xuICAgICAgdGhpcy5kZXBzLnNldFF1ZXVlKFsuLi50aGlzLmRlcHMuZ2V0UXVldWUoKSwgdGFza10pO1xuICAgICAgYXdhaXQgdGhpcy5kZXBzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgdm9pZCB0aGlzLnByb2Nlc3NQZW5kaW5nVGFza3MoKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXBzLnQoXCJcdTVERjJcdTUyQTBcdTUxNjVcdTU2RkVcdTcyNDdcdTgxRUFcdTUyQThcdTRFMEFcdTRGMjBcdTk2MUZcdTUyMTdcdTMwMDJcIiwgXCJJbWFnZSBhZGRlZCB0byB0aGUgYXV0by11cGxvYWQgcXVldWUuXCIpKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBxdWV1ZSBzZWN1cmUgaW1hZ2UgdXBsb2FkXCIsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgIHRoaXMuZGVwcy5kZXNjcmliZUVycm9yKFxuICAgICAgICAgIHRoaXMuZGVwcy50KFwiXHU1MkEwXHU1MTY1XHU1NkZFXHU3MjQ3XHU4MUVBXHU1MkE4XHU0RTBBXHU0RjIwXHU5NjFGXHU1MjE3XHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIHF1ZXVlIGltYWdlIGZvciBhdXRvLXVwbG9hZFwiKSxcbiAgICAgICAgICBlcnJvcixcbiAgICAgICAgKSxcbiAgICAgICAgODAwMCxcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgY3JlYXRlVXBsb2FkVGFzayhub3RlUGF0aDogc3RyaW5nLCBiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKTogVXBsb2FkVGFzayB7XG4gICAgY29uc3QgaWQgPSBgc2VjdXJlLXdlYmRhdi10YXNrLSR7RGF0ZS5ub3coKX0tJHtNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLCA4KX1gO1xuICAgIHJldHVybiB7XG4gICAgICBpZCxcbiAgICAgIG5vdGVQYXRoLFxuICAgICAgcGxhY2Vob2xkZXI6IHRoaXMuYnVpbGRQZW5kaW5nUGxhY2Vob2xkZXIoaWQsIGZpbGVOYW1lKSxcbiAgICAgIG1pbWVUeXBlLFxuICAgICAgZmlsZU5hbWUsXG4gICAgICBkYXRhQmFzZTY0OiB0aGlzLmRlcHMuYXJyYXlCdWZmZXJUb0Jhc2U2NChiaW5hcnkpLFxuICAgICAgYXR0ZW1wdHM6IDAsXG4gICAgICBjcmVhdGVkQXQ6IERhdGUubm93KCksXG4gICAgfTtcbiAgfVxuXG4gIGJ1aWxkUGVuZGluZ1BsYWNlaG9sZGVyKHRhc2tJZDogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3Qgc2FmZU5hbWUgPSB0aGlzLmRlcHMuZXNjYXBlSHRtbChmaWxlTmFtZSk7XG4gICAgcmV0dXJuIGA8c3BhbiBjbGFzcz1cInNlY3VyZS13ZWJkYXYtcGVuZGluZ1wiIGRhdGEtc2VjdXJlLXdlYmRhdi10YXNrPVwiJHt0YXNrSWR9XCIgYXJpYS1sYWJlbD1cIiR7c2FmZU5hbWV9XCI+JHt0aGlzLmRlcHMuZXNjYXBlSHRtbCh0aGlzLmRlcHMudChgXHUzMDEwXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU0RTJEXHVGRjVDJHtmaWxlTmFtZX1cdTMwMTFgLCBgW1VwbG9hZGluZyBpbWFnZSB8ICR7ZmlsZU5hbWV9XWApKX08L3NwYW4+YDtcbiAgfVxuXG4gIGJ1aWxkRmFpbGVkUGxhY2Vob2xkZXIoZmlsZU5hbWU6IHN0cmluZywgbWVzc2FnZT86IHN0cmluZykge1xuICAgIGNvbnN0IHNhZmVOYW1lID0gdGhpcy5kZXBzLmVzY2FwZUh0bWwoZmlsZU5hbWUpO1xuICAgIGNvbnN0IHNhZmVNZXNzYWdlID0gdGhpcy5kZXBzLmVzY2FwZUh0bWwobWVzc2FnZSA/PyB0aGlzLmRlcHMudChcIlx1NjcyQVx1NzdFNVx1OTUxOVx1OEJFRlwiLCBcIlVua25vd24gZXJyb3JcIikpO1xuICAgIGNvbnN0IGxhYmVsID0gdGhpcy5kZXBzLmVzY2FwZUh0bWwodGhpcy5kZXBzLnQoYFx1MzAxMFx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NTkzMVx1OEQyNVx1RkY1QyR7ZmlsZU5hbWV9XHUzMDExYCwgYFtJbWFnZSB1cGxvYWQgZmFpbGVkIHwgJHtmaWxlTmFtZX1dYCkpO1xuICAgIHJldHVybiBgPHNwYW4gY2xhc3M9XCJzZWN1cmUtd2ViZGF2LWZhaWxlZFwiIGFyaWEtbGFiZWw9XCIke3NhZmVOYW1lfVwiPiR7bGFiZWx9OiAke3NhZmVNZXNzYWdlfTwvc3Bhbj5gO1xuICB9XG5cbiAgYXN5bmMgcHJvY2Vzc1BlbmRpbmdUYXNrcygpIHtcbiAgICBjb25zdCBydW5uaW5nOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IHRhc2sgb2YgdGhpcy5kZXBzLmdldFF1ZXVlKCkpIHtcbiAgICAgIGlmICh0aGlzLnByb2Nlc3NpbmdUYXNrSWRzLmhhcyh0YXNrLmlkKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgcnVubmluZy5wdXNoKHRoaXMuc3RhcnRQZW5kaW5nVGFzayh0YXNrKSk7XG4gICAgfVxuXG4gICAgYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHJ1bm5pbmcpO1xuICB9XG5cbiAgc3RhcnRQZW5kaW5nVGFzayh0YXNrOiBVcGxvYWRUYXNrKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMuZ2V0KHRhc2suaWQpO1xuICAgIGlmIChleGlzdGluZykge1xuICAgICAgcmV0dXJuIGV4aXN0aW5nO1xuICAgIH1cblxuICAgIGNvbnN0IHByb21pc2UgPSB0aGlzLnByb2Nlc3NUYXNrKHRhc2spLmZpbmFsbHkoKCkgPT4ge1xuICAgICAgdGhpcy5wZW5kaW5nVGFza1Byb21pc2VzLmRlbGV0ZSh0YXNrLmlkKTtcbiAgICB9KTtcbiAgICB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMuc2V0KHRhc2suaWQsIHByb21pc2UpO1xuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgcHJvY2Vzc1Rhc2sodGFzazogVXBsb2FkVGFzaykge1xuICAgIHRoaXMucHJvY2Vzc2luZ1Rhc2tJZHMuYWRkKHRhc2suaWQpO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBiaW5hcnkgPSB0aGlzLmRlcHMuYmFzZTY0VG9BcnJheUJ1ZmZlcih0YXNrLmRhdGFCYXNlNjQpO1xuICAgICAgY29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLmRlcHMucHJlcGFyZVVwbG9hZFBheWxvYWQoXG4gICAgICAgIGJpbmFyeSxcbiAgICAgICAgdGFzay5taW1lVHlwZSB8fCB0aGlzLmRlcHMuZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUodGFzay5maWxlTmFtZSksXG4gICAgICAgIHRhc2suZmlsZU5hbWUsXG4gICAgICApO1xuICAgICAgY29uc3QgcmVtb3RlTmFtZSA9IGF3YWl0IHRoaXMuZGVwcy5idWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeShwcmVwYXJlZC5maWxlTmFtZSwgcHJlcGFyZWQuYmluYXJ5KTtcbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmRlcHMuYnVpbGRSZW1vdGVQYXRoKHJlbW90ZU5hbWUpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmRlcHMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5kZXBzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgICBtZXRob2Q6IFwiUFVUXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmRlcHMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogcHJlcGFyZWQubWltZVR5cGUsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IHByZXBhcmVkLmJpbmFyeSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVcGxvYWQgZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXBsYWNlZCA9IGF3YWl0IHRoaXMucmVwbGFjZVBsYWNlaG9sZGVyKFxuICAgICAgICB0YXNrLm5vdGVQYXRoLFxuICAgICAgICB0YXNrLmlkLFxuICAgICAgICB0YXNrLnBsYWNlaG9sZGVyLFxuICAgICAgICB0aGlzLmRlcHMuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChgd2ViZGF2LXNlY3VyZTovLyR7cmVtb3RlUGF0aH1gLCBwcmVwYXJlZC5maWxlTmFtZSksXG4gICAgICApO1xuICAgICAgaWYgKCFyZXBsYWNlZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgdGhpcy5kZXBzLnQoXG4gICAgICAgICAgICBcIlx1NEUwQVx1NEYyMFx1NjIxMFx1NTI5Rlx1RkYwQ1x1NEY0Nlx1NkNBMVx1NjcwOVx1NTcyOFx1N0IxNFx1OEJCMFx1NEUyRFx1NjI3RVx1NTIzMFx1NTNFRlx1NjZGRlx1NjM2Mlx1NzY4NFx1NTM2MFx1NEY0RFx1N0IyNlx1MzAwMlwiLFxuICAgICAgICAgICAgXCJVcGxvYWQgc3VjY2VlZGVkLCBidXQgbm8gbWF0Y2hpbmcgcGxhY2Vob2xkZXIgd2FzIGZvdW5kIGluIHRoZSBub3RlLlwiLFxuICAgICAgICAgICksXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuZGVwcy5zZXRRdWV1ZSh0aGlzLmRlcHMuZ2V0UXVldWUoKS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uaWQgIT09IHRhc2suaWQpKTtcbiAgICAgIGF3YWl0IHRoaXMuZGVwcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIHRoaXMuZGVwcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmModGFzay5ub3RlUGF0aCwgXCJpbWFnZS1hZGRcIik7XG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVwcy50KFwiXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU2MjEwXHU1MjlGXHUzMDAyXCIsIFwiSW1hZ2UgdXBsb2FkZWQgc3VjY2Vzc2Z1bGx5LlwiKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIHF1ZXVlZCB1cGxvYWQgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIHRhc2suYXR0ZW1wdHMgKz0gMTtcbiAgICAgIHRhc2subGFzdEVycm9yID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xuICAgICAgYXdhaXQgdGhpcy5kZXBzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuXG4gICAgICBpZiAodGFzay5hdHRlbXB0cyA+PSB0aGlzLmRlcHMuc2V0dGluZ3MoKS5tYXhSZXRyeUF0dGVtcHRzKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucmVwbGFjZVBsYWNlaG9sZGVyKFxuICAgICAgICAgIHRhc2subm90ZVBhdGgsXG4gICAgICAgICAgdGFzay5pZCxcbiAgICAgICAgICB0YXNrLnBsYWNlaG9sZGVyLFxuICAgICAgICAgIHRoaXMuYnVpbGRGYWlsZWRQbGFjZWhvbGRlcih0YXNrLmZpbGVOYW1lLCB0YXNrLmxhc3RFcnJvciksXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGVwcy5zZXRRdWV1ZSh0aGlzLmRlcHMuZ2V0UXVldWUoKS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uaWQgIT09IHRhc2suaWQpKTtcbiAgICAgICAgYXdhaXQgdGhpcy5kZXBzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMuZGVwcy5kZXNjcmliZUVycm9yKHRoaXMuZGVwcy50KFwiXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU2NzAwXHU3RUM4XHU1OTMxXHU4RDI1XCIsIFwiSW1hZ2UgdXBsb2FkIGZhaWxlZCBwZXJtYW5lbnRseVwiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuc2NoZWR1bGVSZXRyeSh0YXNrKTtcbiAgICAgIH1cbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy5wcm9jZXNzaW5nVGFza0lkcy5kZWxldGUodGFzay5pZCk7XG4gICAgfVxuICB9XG5cbiAgc2NoZWR1bGVSZXRyeSh0YXNrOiBVcGxvYWRUYXNrKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLnJldHJ5VGltZW91dHMuZ2V0KHRhc2suaWQpO1xuICAgIGlmIChleGlzdGluZykge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dChleGlzdGluZyk7XG4gICAgfVxuXG4gICAgY29uc3QgZGVsYXkgPSBNYXRoLm1heCgxLCB0aGlzLmRlcHMuc2V0dGluZ3MoKS5yZXRyeURlbGF5U2Vjb25kcykgKiAxMDAwICogdGFzay5hdHRlbXB0cztcbiAgICBjb25zdCB0aW1lb3V0SWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLnJldHJ5VGltZW91dHMuZGVsZXRlKHRhc2suaWQpO1xuICAgICAgdm9pZCB0aGlzLnN0YXJ0UGVuZGluZ1Rhc2sodGFzayk7XG4gICAgfSwgZGVsYXkpO1xuICAgIHRoaXMucmV0cnlUaW1lb3V0cy5zZXQodGFzay5pZCwgdGltZW91dElkKTtcbiAgfVxuXG4gIHByaXZhdGUgaW5zZXJ0UGxhY2Vob2xkZXIoZWRpdG9yOiBFZGl0b3IsIHBsYWNlaG9sZGVyOiBzdHJpbmcpIHtcbiAgICBlZGl0b3IucmVwbGFjZVNlbGVjdGlvbihgJHtwbGFjZWhvbGRlcn1cXG5gKTtcbiAgfVxuXG4gIGFzeW5jIHJlcGxhY2VQbGFjZWhvbGRlcihub3RlUGF0aDogc3RyaW5nLCB0YXNrSWQ6IHN0cmluZywgcGxhY2Vob2xkZXI6IHN0cmluZywgcmVwbGFjZW1lbnQ6IHN0cmluZykge1xuICAgIGNvbnN0IHJlcGxhY2VkSW5FZGl0b3IgPSB0aGlzLnJlcGxhY2VQbGFjZWhvbGRlckluT3BlbkVkaXRvcnMobm90ZVBhdGgsIHRhc2tJZCwgcGxhY2Vob2xkZXIsIHJlcGxhY2VtZW50KTtcbiAgICBpZiAocmVwbGFjZWRJbkVkaXRvcikge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgY29uc3QgZmlsZSA9IHRoaXMuZGVwcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKG5vdGVQYXRoKTtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZGVwcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBpZiAoY29udGVudC5pbmNsdWRlcyhwbGFjZWhvbGRlcikpIHtcbiAgICAgIGNvbnN0IHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGxhY2Vob2xkZXIsIHJlcGxhY2VtZW50KTtcbiAgICAgIGlmICh1cGRhdGVkICE9PSBjb250ZW50KSB7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVwcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIHVwZGF0ZWQpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBwYXR0ZXJuID0gbmV3IFJlZ0V4cChcbiAgICAgIGA8c3BhbltePl0qZGF0YS1zZWN1cmUtd2ViZGF2LXRhc2s9XCIke3RoaXMuZGVwcy5lc2NhcGVSZWdFeHAodGFza0lkKX1cIltePl0qPi4qPzxcXFxcL3NwYW4+YCxcbiAgICAgIFwic1wiLFxuICAgICk7XG4gICAgaWYgKHBhdHRlcm4udGVzdChjb250ZW50KSkge1xuICAgICAgY29uc3QgdXBkYXRlZCA9IGNvbnRlbnQucmVwbGFjZShwYXR0ZXJuLCByZXBsYWNlbWVudCk7XG4gICAgICBpZiAodXBkYXRlZCAhPT0gY29udGVudCkge1xuICAgICAgICBhd2FpdCB0aGlzLmRlcHMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB1cGRhdGVkKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcHJpdmF0ZSByZXBsYWNlUGxhY2Vob2xkZXJJbk9wZW5FZGl0b3JzKG5vdGVQYXRoOiBzdHJpbmcsIHRhc2tJZDogc3RyaW5nLCBwbGFjZWhvbGRlcjogc3RyaW5nLCByZXBsYWNlbWVudDogc3RyaW5nKSB7XG4gICAgbGV0IHJlcGxhY2VkID0gZmFsc2U7XG4gICAgY29uc3QgbGVhdmVzID0gdGhpcy5kZXBzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFwibWFya2Rvd25cIik7XG5cbiAgICBmb3IgKGNvbnN0IGxlYWYgb2YgbGVhdmVzKSB7XG4gICAgICBjb25zdCB2aWV3ID0gbGVhZi52aWV3O1xuICAgICAgaWYgKCEodmlldyBpbnN0YW5jZW9mIE1hcmtkb3duVmlldykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghdmlldy5maWxlIHx8IHZpZXcuZmlsZS5wYXRoICE9PSBub3RlUGF0aCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZWRpdG9yID0gdmlldy5lZGl0b3I7XG4gICAgICBjb25zdCBjb250ZW50ID0gZWRpdG9yLmdldFZhbHVlKCk7XG4gICAgICBsZXQgdXBkYXRlZCA9IGNvbnRlbnQ7XG5cbiAgICAgIGlmIChjb250ZW50LmluY2x1ZGVzKHBsYWNlaG9sZGVyKSkge1xuICAgICAgICB1cGRhdGVkID0gY29udGVudC5yZXBsYWNlKHBsYWNlaG9sZGVyLCByZXBsYWNlbWVudCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBwYXR0ZXJuID0gbmV3IFJlZ0V4cChcbiAgICAgICAgICBgPHNwYW5bXj5dKmRhdGEtc2VjdXJlLXdlYmRhdi10YXNrPVwiJHt0aGlzLmRlcHMuZXNjYXBlUmVnRXhwKHRhc2tJZCl9XCJbXj5dKj4uKj88XFxcXC9zcGFuPmAsXG4gICAgICAgICAgXCJzXCIsXG4gICAgICAgICk7XG4gICAgICAgIHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGF0dGVybiwgcmVwbGFjZW1lbnQpO1xuICAgICAgfVxuXG4gICAgICBpZiAodXBkYXRlZCAhPT0gY29udGVudCkge1xuICAgICAgICBlZGl0b3Iuc2V0VmFsdWUodXBkYXRlZCk7XG4gICAgICAgIHJlcGxhY2VkID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVwbGFjZWQ7XG4gIH1cbn1cbiIsICJpbXBvcnQgeyBBcHAsIFRGaWxlLCBURm9sZGVyLCBub3JtYWxpemVQYXRoIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmV4cG9ydCB0eXBlIERlbGV0aW9uVG9tYnN0b25lID0ge1xuICBwYXRoOiBzdHJpbmc7XG4gIGRlbGV0ZWRBdDogbnVtYmVyO1xuICByZW1vdGVTaWduYXR1cmU/OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgdHlwZSBSZW1vdGVGaWxlTGlrZSA9IHtcbiAgcmVtb3RlUGF0aDogc3RyaW5nO1xuICBsYXN0TW9kaWZpZWQ6IG51bWJlcjtcbiAgc2l6ZTogbnVtYmVyO1xuICBzaWduYXR1cmU6IHN0cmluZztcbn07XG5cbnR5cGUgU2VjdXJlV2ViZGF2U3luY1N1cHBvcnREZXBzID0ge1xuICBhcHA6IEFwcDtcbiAgZ2V0VmF1bHRTeW5jUmVtb3RlRm9sZGVyOiAoKSA9PiBzdHJpbmc7XG4gIGRlbGV0aW9uRm9sZGVyU3VmZml4OiBzdHJpbmc7XG4gIGVuY29kZUJhc2U2NFVybDogKHZhbHVlOiBzdHJpbmcpID0+IHN0cmluZztcbiAgZGVjb2RlQmFzZTY0VXJsOiAodmFsdWU6IHN0cmluZykgPT4gc3RyaW5nO1xufTtcblxuLy8gS2VlcCBzeW5jIG1ldGFkYXRhIGFuZCB0b21ic3RvbmUgcnVsZXMgaXNvbGF0ZWQgc28gcXVldWUvcmVuZGVyaW5nIGNoYW5nZXNcbi8vIGRvIG5vdCBhY2NpZGVudGFsbHkgYWZmZWN0IHJlY29uY2lsaWF0aW9uIGJlaGF2aW91ci5cbmV4cG9ydCBjbGFzcyBTZWN1cmVXZWJkYXZTeW5jU3VwcG9ydCB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgZGVwczogU2VjdXJlV2ViZGF2U3luY1N1cHBvcnREZXBzKSB7fVxuXG4gIHNob3VsZFNraXBDb250ZW50U3luY1BhdGgocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZFBhdGggPSBub3JtYWxpemVQYXRoKHBhdGgpO1xuICAgIGlmIChcbiAgICAgIG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIub2JzaWRpYW4vXCIpIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwiLnRyYXNoL1wiKSB8fFxuICAgICAgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIi5naXQvXCIpIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwibm9kZV9tb2R1bGVzL1wiKSB8fFxuICAgICAgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIl9wbHVnaW5fcGFja2FnZXMvXCIpIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwiLnRtcC1cIikgfHxcbiAgICAgIG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIub2JzaWRpYW4vcGx1Z2lucy9zZWN1cmUtd2ViZGF2LWltYWdlcy9cIilcbiAgICApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiAvXFwuKHBuZ3xqcGU/Z3xnaWZ8d2VicHxibXB8c3ZnKSQvaS50ZXN0KG5vcm1hbGl6ZWRQYXRoKTtcbiAgfVxuXG4gIHNob3VsZFNraXBEaXJlY3RvcnlTeW5jUGF0aChkaXJQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBwID0gbm9ybWFsaXplUGF0aChkaXJQYXRoKTtcbiAgICByZXR1cm4gKFxuICAgICAgcC5zdGFydHNXaXRoKFwiLm9ic2lkaWFuXCIpIHx8XG4gICAgICBwLnN0YXJ0c1dpdGgoXCIudHJhc2hcIikgfHxcbiAgICAgIHAuc3RhcnRzV2l0aChcIi5naXRcIikgfHxcbiAgICAgIHAuc3RhcnRzV2l0aChcIm5vZGVfbW9kdWxlc1wiKSB8fFxuICAgICAgcC5zdGFydHNXaXRoKFwiX3BsdWdpbl9wYWNrYWdlc1wiKSB8fFxuICAgICAgcC5zdGFydHNXaXRoKFwiLnRtcC1cIilcbiAgICApO1xuICB9XG5cbiAgY29sbGVjdExvY2FsU3luY2VkRGlyZWN0b3JpZXMoKSB7XG4gICAgY29uc3QgZGlycyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGZvciAoY29uc3QgZiBvZiB0aGlzLmRlcHMuYXBwLnZhdWx0LmdldEFsbEZvbGRlcnMoKSkge1xuICAgICAgaWYgKGYgaW5zdGFuY2VvZiBURm9sZGVyICYmICFmLmlzUm9vdCgpICYmICF0aGlzLnNob3VsZFNraXBEaXJlY3RvcnlTeW5jUGF0aChmLnBhdGgpKSB7XG4gICAgICAgIGRpcnMuYWRkKG5vcm1hbGl6ZVBhdGgoZi5wYXRoKSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBkaXJzO1xuICB9XG5cbiAgY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCkge1xuICAgIHJldHVybiB0aGlzLmRlcHMuYXBwLnZhdWx0XG4gICAgICAuZ2V0RmlsZXMoKVxuICAgICAgLmZpbHRlcigoZmlsZSkgPT4gIXRoaXMuc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChmaWxlLnBhdGgpKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGEucGF0aC5sb2NhbGVDb21wYXJlKGIucGF0aCkpO1xuICB9XG5cbiAgYnVpbGRTeW5jU2lnbmF0dXJlKGZpbGU6IFRGaWxlKSB7XG4gICAgcmV0dXJuIGAke2ZpbGUuc3RhdC5tdGltZX06JHtmaWxlLnN0YXQuc2l6ZX1gO1xuICB9XG5cbiAgYnVpbGRSZW1vdGVTeW5jU2lnbmF0dXJlKHJlbW90ZTogUGljazxSZW1vdGVGaWxlTGlrZSwgXCJsYXN0TW9kaWZpZWRcIiB8IFwic2l6ZVwiPikge1xuICAgIHJldHVybiBgJHtyZW1vdGUubGFzdE1vZGlmaWVkfToke3JlbW90ZS5zaXplfWA7XG4gIH1cblxuICBidWlsZFZhdWx0U3luY1JlbW90ZVBhdGgodmF1bHRQYXRoOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5kZXBzLmdldFZhdWx0U3luY1JlbW90ZUZvbGRlcigpKX0ke3ZhdWx0UGF0aH1gO1xuICB9XG5cbiAgYnVpbGREZWxldGlvbkZvbGRlcigpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5kZXBzLmdldFZhdWx0U3luY1JlbW90ZUZvbGRlcigpKS5yZXBsYWNlKC9cXC8kLywgXCJcIil9JHt0aGlzLmRlcHMuZGVsZXRpb25Gb2xkZXJTdWZmaXh9YDtcbiAgfVxuXG4gIGJ1aWxkRGVsZXRpb25SZW1vdGVQYXRoKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGAke3RoaXMuYnVpbGREZWxldGlvbkZvbGRlcigpfSR7dGhpcy5kZXBzLmVuY29kZUJhc2U2NFVybCh2YXVsdFBhdGgpfS5qc29uYDtcbiAgfVxuXG4gIHJlbW90ZURlbGV0aW9uUGF0aFRvVmF1bHRQYXRoKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHJvb3QgPSB0aGlzLmJ1aWxkRGVsZXRpb25Gb2xkZXIoKTtcbiAgICBpZiAoIXJlbW90ZVBhdGguc3RhcnRzV2l0aChyb290KSB8fCAhcmVtb3RlUGF0aC5lbmRzV2l0aChcIi5qc29uXCIpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBlbmNvZGVkID0gcmVtb3RlUGF0aC5zbGljZShyb290Lmxlbmd0aCwgLVwiLmpzb25cIi5sZW5ndGgpO1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gdGhpcy5kZXBzLmRlY29kZUJhc2U2NFVybChlbmNvZGVkKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIHBhcnNlRGVsZXRpb25Ub21ic3RvbmVQYXlsb2FkKHJhdzogc3RyaW5nKTogRGVsZXRpb25Ub21ic3RvbmUgfCBudWxsIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpO1xuICAgICAgaWYgKCFwYXJzZWQgfHwgdHlwZW9mIHBhcnNlZC5wYXRoICE9PSBcInN0cmluZ1wiIHx8IHR5cGVvZiBwYXJzZWQuZGVsZXRlZEF0ICE9PSBcIm51bWJlclwiKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgaWYgKHBhcnNlZC5yZW1vdGVTaWduYXR1cmUgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgcGFyc2VkLnJlbW90ZVNpZ25hdHVyZSAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHBhdGg6IHBhcnNlZC5wYXRoLFxuICAgICAgICBkZWxldGVkQXQ6IHBhcnNlZC5kZWxldGVkQXQsXG4gICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcGFyc2VkLnJlbW90ZVNpZ25hdHVyZSxcbiAgICAgIH07XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cblxuICByZW1vdGVQYXRoVG9WYXVsdFBhdGgocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgcm9vdCA9IHRoaXMubm9ybWFsaXplRm9sZGVyKHRoaXMuZGVwcy5nZXRWYXVsdFN5bmNSZW1vdGVGb2xkZXIoKSk7XG4gICAgaWYgKCFyZW1vdGVQYXRoLnN0YXJ0c1dpdGgocm9vdCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiByZW1vdGVQYXRoLnNsaWNlKHJvb3QubGVuZ3RoKS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpO1xuICB9XG5cbiAgc2hvdWxkRG93bmxvYWRSZW1vdGVWZXJzaW9uKGxvY2FsTXRpbWU6IG51bWJlciwgcmVtb3RlTXRpbWU6IG51bWJlcikge1xuICAgIHJldHVybiByZW1vdGVNdGltZSA+IGxvY2FsTXRpbWUgKyAyMDAwO1xuICB9XG5cbiAgaXNUb21ic3RvbmVBdXRob3JpdGF0aXZlKFxuICAgIHRvbWJzdG9uZTogRGVsZXRpb25Ub21ic3RvbmUsXG4gICAgcmVtb3RlPzogUGljazxSZW1vdGVGaWxlTGlrZSwgXCJsYXN0TW9kaWZpZWRcIiB8IFwic2lnbmF0dXJlXCI+IHwgbnVsbCxcbiAgKSB7XG4gICAgY29uc3QgZ3JhY2VNcyA9IDUwMDA7XG4gICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmICh0b21ic3RvbmUucmVtb3RlU2lnbmF0dXJlKSB7XG4gICAgICByZXR1cm4gcmVtb3RlLnNpZ25hdHVyZSA9PT0gdG9tYnN0b25lLnJlbW90ZVNpZ25hdHVyZTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVtb3RlLmxhc3RNb2RpZmllZCA8PSB0b21ic3RvbmUuZGVsZXRlZEF0ICsgZ3JhY2VNcztcbiAgfVxuXG4gIHNob3VsZERlbGV0ZUxvY2FsRnJvbVRvbWJzdG9uZShmaWxlOiBURmlsZSwgdG9tYnN0b25lOiBEZWxldGlvblRvbWJzdG9uZSkge1xuICAgIGNvbnN0IGdyYWNlTXMgPSA1MDAwO1xuICAgIHJldHVybiBmaWxlLnN0YXQubXRpbWUgPD0gdG9tYnN0b25lLmRlbGV0ZWRBdCArIGdyYWNlTXM7XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUZvbGRlcihpbnB1dDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIG5vcm1hbGl6ZUZvbGRlcihpbnB1dCk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUZvbGRlcihpbnB1dDogc3RyaW5nKSB7XG4gIHJldHVybiBpbnB1dC5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpLnJlcGxhY2UoL1xcLyskLywgXCJcIikgKyBcIi9cIjtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFDLElBQUFBLG1CQWVNOzs7QUNmUCxzQkFBa0U7QUFFM0QsSUFBTSxrQkFBa0I7QUFDeEIsSUFBTSxvQkFBb0I7QUFZakMsSUFBTSwwQkFBTixjQUFzQyxvQ0FBb0I7QUFBQSxFQUN4RCxZQUFZLGFBQTBCO0FBQ3BDLFVBQU0sV0FBVztBQUFBLEVBQ25CO0FBQUEsRUFFQSxXQUFpQjtBQUFBLEVBQUM7QUFDcEI7QUFJTyxJQUFNLDJCQUFOLE1BQStCO0FBQUEsRUFDcEMsWUFBNkIsTUFBb0M7QUFBcEM7QUFBQSxFQUFxQztBQUFBLEVBRWxFLHVCQUF1QixXQUFtQixLQUFhO0FBQ3JELFVBQU0sYUFBYSxLQUFLLGtCQUFrQixTQUFT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QVMsZ0JBQWdCLEVBQUUsQ0FBQztBQUU3RSxRQUFJLHlCQUFRLFdBQVcsRUFDcEIsUUFBUSxLQUFLLE9BQU8sRUFBRSxnRUFBYyxzQ0FBc0MsQ0FBQyxFQUMzRTtBQUFBLE1BQ0MsS0FBSyxPQUFPO0FBQUEsUUFDVjtBQUFBLFFBQ0E7QUFBQSxNQUNGO0FBQUEsSUFDRixFQUNDO0FBQUEsTUFBVSxDQUFDLFdBQ1YsT0FBTyxjQUFjLEtBQUssT0FBTyxFQUFFLDRCQUFRLGVBQWUsQ0FBQyxFQUFFLFFBQVEsWUFBWTtBQUMvRSxlQUFPLFlBQVksSUFBSTtBQUN2QixZQUFJO0FBQ0YsZ0JBQU0sS0FBSyxPQUFPLDZCQUE2QjtBQUFBLFFBQ2pELFVBQUU7QUFDQSxpQkFBTyxZQUFZLEtBQUs7QUFBQSxRQUMxQjtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNKO0FBQ0Y7QUFFQSxJQUFNLGNBQU4sY0FBMEIsdUJBQU07QUFBQSxFQUk5QixZQUFZLEtBQVUsV0FBbUIsVUFBa0I7QUFDekQsVUFBTSxHQUFHO0FBQ1QsU0FBSyxZQUFZO0FBQ2pCLFNBQUssV0FBVztBQUFBLEVBQ2xCO0FBQUEsRUFFQSxTQUFlO0FBQ2IsVUFBTSxFQUFFLFVBQVUsSUFBSTtBQUN0QixjQUFVLE1BQU07QUFDaEIsY0FBVSxTQUFTLE1BQU0sRUFBRSxNQUFNLEtBQUssVUFBVSxDQUFDO0FBQ2pELGNBQVUsU0FBUyxLQUFLLEVBQUUsTUFBTSxLQUFLLFNBQVMsQ0FBQztBQUFBLEVBQ2pEO0FBQUEsRUFFQSxVQUFnQjtBQUNkLFNBQUssVUFBVSxNQUFNO0FBQUEsRUFDdkI7QUFDRjsiLAogICJuYW1lcyI6IFsiaW1wb3J0X29ic2lkaWFuIiwgImltcG9ydF9vYnNpZGlhbiIsICJpbXBvcnRfb2JzaWRpYW4iLCAiZG9jdW1lbnQiLCAidG9tYnN0b25lIiwgInVwbG9hZGVkUmVtb3RlIiwgIm9ic2lkaWFuUmVxdWVzdFVybCJdCn0K
