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
  isExcludedSyncPath(path) {
    const normalizedPath = (0, import_obsidian3.normalizePath)(path).replace(/^\/+/, "").replace(/\/+$/, "");
    if (!normalizedPath) {
      return false;
    }
    const folders = this.deps.getExcludedSyncFolders?.() ?? [];
    return folders.some((folder) => {
      const normalizedFolder = (0, import_obsidian3.normalizePath)(folder).replace(/^\/+/, "").replace(/\/+$/, "");
      return normalizedFolder.length > 0 && (normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`));
    });
  }
  shouldSkipContentSyncPath(path) {
    const normalizedPath = (0, import_obsidian3.normalizePath)(path);
    if (this.isExcludedSyncPath(normalizedPath) || normalizedPath.startsWith(".obsidian/") || normalizedPath.startsWith(".trash/") || normalizedPath.startsWith(".git/") || normalizedPath.startsWith("node_modules/") || normalizedPath.startsWith("_plugin_packages/") || normalizedPath.startsWith(".tmp-") || normalizedPath.startsWith(".obsidian/plugins/secure-webdav-images/")) {
      return true;
    }
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(normalizedPath);
  }
  shouldSkipDirectorySyncPath(dirPath) {
    const p = (0, import_obsidian3.normalizePath)(dirPath);
    return this.isExcludedSyncPath(p) || p.startsWith(".obsidian") || p.startsWith(".trash") || p.startsWith(".git") || p.startsWith("node_modules") || p.startsWith("_plugin_packages") || p.startsWith(".tmp-");
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
  excludedSyncFolders: ["kb"],
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
    this.blobUrls = /* @__PURE__ */ new Set();
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
      getExcludedSyncFolders: () => this.settings.excludedSyncFolders ?? [],
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
    try {
      this.registerMarkdownCodeBlockProcessor(SECURE_CODE_BLOCK, (source, el, ctx) => {
        void this.imageSupport.processSecureCodeBlock(source, el, ctx);
      });
    } catch {
      console.warn("[secure-webdav-images] code block processor already registered, skipping");
    }
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
    const rawExcluded = this.settings.excludedSyncFolders;
    const excluded = Array.isArray(rawExcluded) ? rawExcluded : typeof rawExcluded === "string" ? rawExcluded.split(/[,\n]/) : DEFAULT_SETTINGS.excludedSyncFolders;
    this.settings.excludedSyncFolders = [
      ...new Set(
        excluded.map((value) => (0, import_obsidian4.normalizePath)(String(value).trim()).replace(/^\/+/, "").replace(/\/+$/, "")).filter((value) => value.length > 0)
      )
    ];
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
      if (this.syncSupport.shouldSkipContentSyncPath(path)) {
        this.syncIndex.delete(path);
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
      if (this.syncSupport.shouldSkipContentSyncPath(vaultPath)) {
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
      if (!await this.app.vault.adapter.exists(current)) {
        try {
          await this.app.vault.adapter.mkdir(current);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!msg.includes("already exists")) {
            throw e;
          }
        }
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
    const options = {
      mtime: remote.lastModified > 0 ? remote.lastModified : Date.now()
    };
    const isMd = vaultPath.toLowerCase().endsWith(".md");
    const current = existingFile ?? this.getVaultFileByPath(vaultPath) ?? this.app.vault.getAbstractFileByPath(vaultPath);
    if (current && current instanceof import_obsidian4.TFile) {
      if (current.extension === "md") {
        await this.app.vault.modify(current, this.decodeUtf8(response.arrayBuffer), options);
      } else {
        await this.app.vault.modifyBinary(current, response.arrayBuffer, options);
      }
      return;
    }
    try {
      if (isMd) {
        await this.app.vault.create(vaultPath, this.decodeUtf8(response.arrayBuffer), options);
      } else {
        await this.app.vault.createBinary(vaultPath, response.arrayBuffer, options);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("already exists")) {
        const file = this.app.vault.getAbstractFileByPath(vaultPath);
        if (file && file instanceof import_obsidian4.TFile) {
          if (file.extension === "md") {
            await this.app.vault.modify(file, this.decodeUtf8(response.arrayBuffer), options);
          } else {
            await this.app.vault.modifyBinary(file, response.arrayBuffer, options);
          }
          return;
        }
      }
      throw e;
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
        if (!await this.app.vault.adapter.exists(dirPath)) {
          try {
            await this.app.vault.adapter.mkdir(dirPath);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!msg.includes("already exists")) {
              throw e;
            }
          }
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
    this.blobUrls.add(blobUrl);
    return blobUrl;
  }
  evictBlobUrlsIfNeeded() {
    while (this.blobUrls.size >= this.maxBlobUrls) {
      const oldest = this.blobUrls.values().next().value;
      this.blobUrls.delete(oldest);
      URL.revokeObjectURL(oldest);
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
    new import_obsidian4.Setting(containerEl).setName(this.plugin.t("\u4E0D\u540C\u6B65\u76EE\u5F55", "Excluded sync folders")).setDesc(
      this.plugin.t(
        "\u8FD9\u4E9B vault \u76EE\u5F55\u4E0D\u4F1A\u88AB\u5185\u5BB9\u540C\u6B65\u4E0A\u4F20\u3001\u4ECE\u8FDC\u7AEF\u6062\u590D\u6216\u8FDB\u884C\u76EE\u5F55\u5BF9\u8D26\u3002\u652F\u6301\u9017\u53F7\u6216\u6362\u884C\u5206\u9694\uFF0C\u9ED8\u8BA4\uFF1Akb\u3002",
        "These vault folders are not uploaded, restored from remote, or reconciled as directories. Separate entries with commas or new lines. Default: kb."
      )
    ).addTextArea(
      (text) => text.setPlaceholder("kb").setValue((this.plugin.settings.excludedSyncFolders ?? []).join("\n")).onChange(async (value) => {
        this.plugin.settings.excludedSyncFolders = value.split(/[,\n]/);
        this.plugin.normalizeEffectiveSettings();
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyIsICJzZWN1cmUtd2ViZGF2LWltYWdlLXN1cHBvcnQudHMiLCAic2VjdXJlLXdlYmRhdi11cGxvYWQtcXVldWUudHMiLCAic2VjdXJlLXdlYmRhdi1zeW5jLXN1cHBvcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIlx1RkVGRmltcG9ydCB7XG4gIEFwcCxcbiAgRWRpdG9yLFxuICBNYXJrZG93bkZpbGVJbmZvLFxuICBNYXJrZG93blZpZXcsXG4gIE1vZGFsLFxuICBOb3RpY2UsXG4gIFBsdWdpbixcbiAgUGx1Z2luU2V0dGluZ1RhYixcbiAgU2V0dGluZyxcbiAgVEFic3RyYWN0RmlsZSxcbiAgVEZpbGUsXG4gIFRGb2xkZXIsXG4gIG5vcm1hbGl6ZVBhdGgsXG4gIHJlcXVlc3RVcmwgYXMgb2JzaWRpYW5SZXF1ZXN0VXJsLFxufSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7IFNFQ1VSRV9DT0RFX0JMT0NLLCBTRUNVUkVfUFJPVE9DT0wsIFNlY3VyZVdlYmRhdkltYWdlU3VwcG9ydCB9IGZyb20gXCIuL3NlY3VyZS13ZWJkYXYtaW1hZ2Utc3VwcG9ydFwiO1xuaW1wb3J0IHsgU2VjdXJlV2ViZGF2VXBsb2FkUXVldWVTdXBwb3J0LCB0eXBlIFVwbG9hZFRhc2sgfSBmcm9tIFwiLi9zZWN1cmUtd2ViZGF2LXVwbG9hZC1xdWV1ZVwiO1xuaW1wb3J0IHtcbiAgU2VjdXJlV2ViZGF2U3luY1N1cHBvcnQsXG4gIHR5cGUgRGVsZXRpb25Ub21ic3RvbmUsXG4gIG5vcm1hbGl6ZUZvbGRlcixcbn0gZnJvbSBcIi4vc2VjdXJlLXdlYmRhdi1zeW5jLXN1cHBvcnRcIjtcblxudHlwZSBTZWN1cmVXZWJkYXZTZXR0aW5ncyA9IHtcbiAgd2ViZGF2VXJsOiBzdHJpbmc7XG4gIHVzZXJuYW1lOiBzdHJpbmc7XG4gIHBhc3N3b3JkOiBzdHJpbmc7XG4gIHJlbW90ZUZvbGRlcjogc3RyaW5nO1xuICB2YXVsdFN5bmNSZW1vdGVGb2xkZXI6IHN0cmluZztcbiAgZXhjbHVkZWRTeW5jRm9sZGVyczogc3RyaW5nW107XG4gIG5hbWluZ1N0cmF0ZWd5OiBcInRpbWVzdGFtcFwiIHwgXCJoYXNoXCI7XG4gIGRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQ6IGJvb2xlYW47XG4gIGxhbmd1YWdlOiBcImF1dG9cIiB8IFwiemhcIiB8IFwiZW5cIjtcbiAgbm90ZVN0b3JhZ2VNb2RlOiBcImZ1bGwtbG9jYWxcIiB8IFwibGF6eS1ub3Rlc1wiO1xuICBub3RlRXZpY3RBZnRlckRheXM6IG51bWJlcjtcbiAgYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXM6IG51bWJlcjtcbiAgbWF4UmV0cnlBdHRlbXB0czogbnVtYmVyO1xuICByZXRyeURlbGF5U2Vjb25kczogbnVtYmVyO1xuICBkZWxldGVSZW1vdGVXaGVuVW5yZWZlcmVuY2VkOiBib29sZWFuO1xuICBjb21wcmVzc0ltYWdlczogYm9vbGVhbjtcbiAgY29tcHJlc3NUaHJlc2hvbGRLYjogbnVtYmVyO1xuICBtYXhJbWFnZURpbWVuc2lvbjogbnVtYmVyO1xuICBqcGVnUXVhbGl0eTogbnVtYmVyO1xufTtcblxudHlwZSBTeW5jSW5kZXhFbnRyeSA9IHtcbiAgbG9jYWxTaWduYXR1cmU6IHN0cmluZztcbiAgcmVtb3RlU2lnbmF0dXJlOiBzdHJpbmc7XG4gIHJlbW90ZVBhdGg6IHN0cmluZztcbn07XG5cbnR5cGUgUmVtb3RlRmlsZVN0YXRlID0ge1xuICByZW1vdGVQYXRoOiBzdHJpbmc7XG4gIGxhc3RNb2RpZmllZDogbnVtYmVyO1xuICBzaXplOiBudW1iZXI7XG4gIHNpZ25hdHVyZTogc3RyaW5nO1xufTtcblxudHlwZSBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZCA9IHtcbiAgZmlyc3REZXRlY3RlZEF0OiBudW1iZXI7XG4gIGxhc3REZXRlY3RlZEF0OiBudW1iZXI7XG4gIG1pc3NDb3VudDogbnVtYmVyO1xufTtcblxudHlwZSBSZW1vdGVJbnZlbnRvcnkgPSB7XG4gIGZpbGVzOiBNYXA8c3RyaW5nLCBSZW1vdGVGaWxlU3RhdGU+O1xuICBkaXJlY3RvcmllczogU2V0PHN0cmluZz47XG59O1xuXG5jb25zdCBERUZBVUxUX1NFVFRJTkdTOiBTZWN1cmVXZWJkYXZTZXR0aW5ncyA9IHtcbiAgd2ViZGF2VXJsOiBcIlwiLFxuICB1c2VybmFtZTogXCJcIixcbiAgcGFzc3dvcmQ6IFwiXCIsXG4gIHJlbW90ZUZvbGRlcjogXCIvcmVtb3RlLWltYWdlcy9cIixcbiAgdmF1bHRTeW5jUmVtb3RlRm9sZGVyOiBcIi92YXVsdC1zeW5jL1wiLFxuICBleGNsdWRlZFN5bmNGb2xkZXJzOiBbXCJrYlwiXSxcbiAgbmFtaW5nU3RyYXRlZ3k6IFwiaGFzaFwiLFxuICBkZWxldGVMb2NhbEFmdGVyVXBsb2FkOiB0cnVlLFxuICBsYW5ndWFnZTogXCJhdXRvXCIsXG4gIG5vdGVTdG9yYWdlTW9kZTogXCJmdWxsLWxvY2FsXCIsXG4gIG5vdGVFdmljdEFmdGVyRGF5czogMzAsXG4gIGF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzOiAwLFxuICBtYXhSZXRyeUF0dGVtcHRzOiA1LFxuICByZXRyeURlbGF5U2Vjb25kczogNSxcbiAgZGVsZXRlUmVtb3RlV2hlblVucmVmZXJlbmNlZDogdHJ1ZSxcbiAgY29tcHJlc3NJbWFnZXM6IHRydWUsXG4gIGNvbXByZXNzVGhyZXNob2xkS2I6IDMwMCxcbiAgbWF4SW1hZ2VEaW1lbnNpb246IDIyMDAsXG4gIGpwZWdRdWFsaXR5OiA4Mixcbn07XG5cbmNvbnN0IE1JTUVfTUFQOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICBqcGc6IFwiaW1hZ2UvanBlZ1wiLFxuICBqcGVnOiBcImltYWdlL2pwZWdcIixcbiAgcG5nOiBcImltYWdlL3BuZ1wiLFxuICBnaWY6IFwiaW1hZ2UvZ2lmXCIsXG4gIHdlYnA6IFwiaW1hZ2Uvd2VicFwiLFxuICBzdmc6IFwiaW1hZ2Uvc3ZnK3htbFwiLFxuICBibXA6IFwiaW1hZ2UvYm1wXCIsXG4gIFwiaW1hZ2UvanBlZ1wiOiBcImpwZ1wiLFxuICBcImltYWdlL3BuZ1wiOiBcInBuZ1wiLFxuICBcImltYWdlL2dpZlwiOiBcImdpZlwiLFxuICBcImltYWdlL3dlYnBcIjogXCJ3ZWJwXCIsXG4gIFwiaW1hZ2UvYm1wXCI6IFwiYm1wXCIsXG4gIFwiaW1hZ2Uvc3ZnK3htbFwiOiBcInN2Z1wiLFxufTtcblxuY29uc3QgU0VDVVJFX05PVEVfU1RVQiA9IFwic2VjdXJlLXdlYmRhdi1ub3RlLXN0dWJcIjtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2VjdXJlV2ViZGF2SW1hZ2VzUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgc2V0dGluZ3M6IFNlY3VyZVdlYmRhdlNldHRpbmdzID0gREVGQVVMVF9TRVRUSU5HUztcbiAgcXVldWU6IFVwbG9hZFRhc2tbXSA9IFtdO1xuICBwcml2YXRlIGJsb2JVcmxzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgcmVhZG9ubHkgbWF4QmxvYlVybHMgPSAxMDA7XG4gIHByaXZhdGUgbm90ZVJlbW90ZVJlZnMgPSBuZXcgTWFwPHN0cmluZywgU2V0PHN0cmluZz4+KCk7XG4gIHByaXZhdGUgcmVtb3RlQ2xlYW51cEluRmxpZ2h0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgbm90ZUFjY2Vzc1RpbWVzdGFtcHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICBwcml2YXRlIHN5bmNJbmRleCA9IG5ldyBNYXA8c3RyaW5nLCBTeW5jSW5kZXhFbnRyeT4oKTtcbiAgcHJpdmF0ZSBzeW5jZWREaXJlY3RvcmllcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIG1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgPSBuZXcgTWFwPHN0cmluZywgTWlzc2luZ0xhenlSZW1vdGVSZWNvcmQ+KCk7XG4gIHByaXZhdGUgcGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlcyA9IG5ldyBTZXQ8UHJvbWlzZTx2b2lkPj4oKTtcbiAgcHJpdmF0ZSBwcmlvcml0eU5vdGVTeW5jVGltZW91dHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICBwcml2YXRlIHByaW9yaXR5Tm90ZVN5bmNzSW5GbGlnaHQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBsYXN0VmF1bHRTeW5jQXQgPSAwO1xuICBwcml2YXRlIGxhc3RWYXVsdFN5bmNTdGF0dXMgPSBcIlwiO1xuICBwcml2YXRlIHN5bmNJblByb2dyZXNzID0gZmFsc2U7XG4gIHByaXZhdGUgYXV0b1N5bmNUaWNrSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICAvLyBJbWFnZSBwYXJzaW5nIGFuZCByZW5kZXJpbmcgbGl2ZSBpbiBhIGRlZGljYXRlZCBoZWxwZXIgc28gc3luYyBjaGFuZ2VzXG4gIC8vIGRvIG5vdCBhY2NpZGVudGFsbHkgYnJlYWsgZGlzcGxheSBiZWhhdmlvdXIgYWdhaW4uXG4gIHByaXZhdGUgaW1hZ2VTdXBwb3J0ITogU2VjdXJlV2ViZGF2SW1hZ2VTdXBwb3J0O1xuICAvLyBVcGxvYWQgcXVldWUgc3RhdGUgaXMgaXNvbGF0ZWQgc28gcmV0cmllcyBhbmQgcGxhY2Vob2xkZXIgcmVwbGFjZW1lbnQgZG9cbiAgLy8gbm90IGtlZXAgc3ByYXdsaW5nIGFjcm9zcyB0aGUgbWFpbiBwbHVnaW4gY2xhc3MuXG4gIHByaXZhdGUgdXBsb2FkUXVldWUhOiBTZWN1cmVXZWJkYXZVcGxvYWRRdWV1ZVN1cHBvcnQ7XG4gIC8vIFN5bmMgbWV0YWRhdGEgaGVscGVycyBhcmUgaXNvbGF0ZWQgc28gcmVjb25jaWxpYXRpb24gcnVsZXMgc3RheSBleHBsaWNpdC5cbiAgcHJpdmF0ZSBzeW5jU3VwcG9ydCE6IFNlY3VyZVdlYmRhdlN5bmNTdXBwb3J0O1xuXG4gIHByaXZhdGUgcmVhZG9ubHkgZGVsZXRpb25Gb2xkZXJTdWZmaXggPSBcIi5fX3NlY3VyZS13ZWJkYXYtZGVsZXRpb25zX18vXCI7XG4gIHByaXZhdGUgcmVhZG9ubHkgbWlzc2luZ0xhenlSZW1vdGVDb25maXJtYXRpb25zID0gMjtcblxuICBwcml2YXRlIGluaXRpYWxpemVTdXBwb3J0TW9kdWxlcygpIHtcbiAgICAvLyBLZWVwIHJ1bnRpbWUtb25seSBpbnRlZ3JhdGlvbiBoZXJlOiB0aGUgaW1hZ2UgbW9kdWxlIG93bnMgcGFyc2luZyBhbmRcbiAgICAvLyByZW5kZXJpbmcsIHdoaWxlIHRoZSBwbHVnaW4gc3RpbGwgb3ducyBXZWJEQVYgYWNjZXNzIGFuZCBsaWZlY3ljbGUuXG4gICAgdGhpcy5pbWFnZVN1cHBvcnQgPSBuZXcgU2VjdXJlV2ViZGF2SW1hZ2VTdXBwb3J0KHtcbiAgICAgIHQ6IHRoaXMudC5iaW5kKHRoaXMpLFxuICAgICAgZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmw6IHRoaXMuZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmwuYmluZCh0aGlzKSxcbiAgICB9KTtcbiAgICB0aGlzLnVwbG9hZFF1ZXVlID0gbmV3IFNlY3VyZVdlYmRhdlVwbG9hZFF1ZXVlU3VwcG9ydCh7XG4gICAgICBhcHA6IHRoaXMuYXBwLFxuICAgICAgdDogdGhpcy50LmJpbmQodGhpcyksXG4gICAgICBzZXR0aW5nczogKCkgPT4gdGhpcy5zZXR0aW5ncyxcbiAgICAgIGdldFF1ZXVlOiAoKSA9PiB0aGlzLnF1ZXVlLFxuICAgICAgc2V0UXVldWU6IChxdWV1ZSkgPT4ge1xuICAgICAgICB0aGlzLnF1ZXVlID0gcXVldWU7XG4gICAgICB9LFxuICAgICAgc2F2ZVBsdWdpblN0YXRlOiB0aGlzLnNhdmVQbHVnaW5TdGF0ZS5iaW5kKHRoaXMpLFxuICAgICAgc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jOiB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYy5iaW5kKHRoaXMpLFxuICAgICAgcmVxdWVzdFVybDogdGhpcy5yZXF1ZXN0VXJsLmJpbmQodGhpcyksXG4gICAgICBidWlsZFVwbG9hZFVybDogdGhpcy5idWlsZFVwbG9hZFVybC5iaW5kKHRoaXMpLFxuICAgICAgYnVpbGRBdXRoSGVhZGVyOiB0aGlzLmJ1aWxkQXV0aEhlYWRlci5iaW5kKHRoaXMpLFxuICAgICAgcHJlcGFyZVVwbG9hZFBheWxvYWQ6IHRoaXMucHJlcGFyZVVwbG9hZFBheWxvYWQuYmluZCh0aGlzKSxcbiAgICAgIGJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5OiB0aGlzLmJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5LmJpbmQodGhpcyksXG4gICAgICBidWlsZFJlbW90ZVBhdGg6IHRoaXMuYnVpbGRSZW1vdGVQYXRoLmJpbmQodGhpcyksXG4gICAgICBidWlsZFNlY3VyZUltYWdlTWFya3VwOiB0aGlzLmltYWdlU3VwcG9ydC5idWlsZFNlY3VyZUltYWdlTWFya3VwLmJpbmQodGhpcy5pbWFnZVN1cHBvcnQpLFxuICAgICAgZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWU6IHRoaXMuZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUuYmluZCh0aGlzKSxcbiAgICAgIGFycmF5QnVmZmVyVG9CYXNlNjQ6IHRoaXMuYXJyYXlCdWZmZXJUb0Jhc2U2NC5iaW5kKHRoaXMpLFxuICAgICAgYmFzZTY0VG9BcnJheUJ1ZmZlcjogdGhpcy5iYXNlNjRUb0FycmF5QnVmZmVyLmJpbmQodGhpcyksXG4gICAgICBlc2NhcGVIdG1sOiB0aGlzLmVzY2FwZUh0bWwuYmluZCh0aGlzKSxcbiAgICAgIGVzY2FwZVJlZ0V4cDogdGhpcy5lc2NhcGVSZWdFeHAuYmluZCh0aGlzKSxcbiAgICAgIGRlc2NyaWJlRXJyb3I6IHRoaXMuZGVzY3JpYmVFcnJvci5iaW5kKHRoaXMpLFxuICAgIH0pO1xuICAgIHRoaXMuc3luY1N1cHBvcnQgPSBuZXcgU2VjdXJlV2ViZGF2U3luY1N1cHBvcnQoe1xuICAgICAgYXBwOiB0aGlzLmFwcCxcbiAgICAgIGdldFZhdWx0U3luY1JlbW90ZUZvbGRlcjogKCkgPT4gdGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIsXG4gICAgICBnZXRFeGNsdWRlZFN5bmNGb2xkZXJzOiAoKSA9PiB0aGlzLnNldHRpbmdzLmV4Y2x1ZGVkU3luY0ZvbGRlcnMgPz8gW10sXG4gICAgICBkZWxldGlvbkZvbGRlclN1ZmZpeDogdGhpcy5kZWxldGlvbkZvbGRlclN1ZmZpeCxcbiAgICAgIGVuY29kZUJhc2U2NFVybDogKHZhbHVlKSA9PlxuICAgICAgICB0aGlzLmFycmF5QnVmZmVyVG9CYXNlNjQodGhpcy5lbmNvZGVVdGY4KHZhbHVlKSkucmVwbGFjZSgvXFwrL2csIFwiLVwiKS5yZXBsYWNlKC9cXC8vZywgXCJfXCIpLnJlcGxhY2UoLz0rJC9nLCBcIlwiKSxcbiAgICAgIGRlY29kZUJhc2U2NFVybDogKHZhbHVlKSA9PiB7XG4gICAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSB2YWx1ZS5yZXBsYWNlKC8tL2csIFwiK1wiKS5yZXBsYWNlKC9fL2csIFwiL1wiKTtcbiAgICAgICAgY29uc3QgcGFkZGVkID0gbm9ybWFsaXplZCArIFwiPVwiLnJlcGVhdCgoNCAtIChub3JtYWxpemVkLmxlbmd0aCAlIDQgfHwgNCkpICUgNCk7XG4gICAgICAgIHJldHVybiB0aGlzLmRlY29kZVV0ZjgodGhpcy5iYXNlNjRUb0FycmF5QnVmZmVyKHBhZGRlZCkpO1xuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIG9ubG9hZCgpIHtcbiAgICBhd2FpdCB0aGlzLmxvYWRQbHVnaW5TdGF0ZSgpO1xuICAgIHRoaXMuaW5pdGlhbGl6ZVN1cHBvcnRNb2R1bGVzKCk7XG5cbiAgICB0aGlzLmFkZFNldHRpbmdUYWIobmV3IFNlY3VyZVdlYmRhdlNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJ1cGxvYWQtY3VycmVudC1ub3RlLWxvY2FsLWltYWdlc1wiLFxuICAgICAgbmFtZTogXCJVcGxvYWQgbG9jYWwgaW1hZ2VzIGluIGN1cnJlbnQgbm90ZSB0byBXZWJEQVZcIixcbiAgICAgIGNoZWNrQ2FsbGJhY2s6IChjaGVja2luZykgPT4ge1xuICAgICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICAgICAgaWYgKCFmaWxlKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFjaGVja2luZykge1xuICAgICAgICAgIHZvaWQgdGhpcy51cGxvYWRJbWFnZXNJbk5vdGUoZmlsZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwidGVzdC13ZWJkYXYtY29ubmVjdGlvblwiLFxuICAgICAgbmFtZTogXCJUZXN0IFdlYkRBViBjb25uZWN0aW9uXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4ge1xuICAgICAgICB2b2lkIHRoaXMucnVuQ29ubmVjdGlvblRlc3QodHJ1ZSk7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInN5bmMtY29uZmlndXJlZC12YXVsdC1jb250ZW50LXRvLXdlYmRhdlwiLFxuICAgICAgbmFtZTogXCJTeW5jIHZhdWx0IGNvbnRlbnQgdG8gV2ViREFWXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4ge1xuICAgICAgICB2b2lkIHRoaXMucnVuTWFudWFsU3luYygpO1xuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHJpYmJvbiA9IHRoaXMuYWRkUmliYm9uSWNvbihcInJlZnJlc2gtY3dcIiwgdGhpcy50KFwiXHU3QUNCXHU1MzczXHU1NDBDXHU2QjY1XHU1MjMwIFdlYkRBVlwiLCBcIlN5bmMgdG8gV2ViREFWIG5vd1wiKSwgKCkgPT4ge1xuICAgICAgdm9pZCB0aGlzLnJ1bk1hbnVhbFN5bmMoKTtcbiAgICB9KTtcbiAgICByaWJib24uYWRkQ2xhc3MoXCJzZWN1cmUtd2ViZGF2LXN5bmMtcmliYm9uXCIpO1xuXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duUG9zdFByb2Nlc3NvcigoZWwsIGN0eCkgPT4ge1xuICAgICAgdm9pZCB0aGlzLmltYWdlU3VwcG9ydC5wcm9jZXNzU2VjdXJlSW1hZ2VzKGVsLCBjdHgpO1xuICAgIH0pO1xuICAgIHRyeSB7XG4gICAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoU0VDVVJFX0NPREVfQkxPQ0ssIChzb3VyY2UsIGVsLCBjdHgpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmltYWdlU3VwcG9ydC5wcm9jZXNzU2VjdXJlQ29kZUJsb2NrKHNvdXJjZSwgZWwsIGN0eCk7XG4gICAgICB9KTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIGNvbnNvbGUud2FybihcIltzZWN1cmUtd2ViZGF2LWltYWdlc10gY29kZSBibG9jayBwcm9jZXNzb3IgYWxyZWFkeSByZWdpc3RlcmVkLCBza2lwcGluZ1wiKTtcbiAgICB9XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJmaWxlLW9wZW5cIiwgKGZpbGUpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmhhbmRsZUZpbGVPcGVuKGZpbGUpO1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImVkaXRvci1wYXN0ZVwiLCAoZXZ0LCBlZGl0b3IsIGluZm8pID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmhhbmRsZUVkaXRvclBhc3RlKGV2dCwgZWRpdG9yLCBpbmZvKTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJlZGl0b3ItZHJvcFwiLCAoZXZ0LCBlZGl0b3IsIGluZm8pID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmhhbmRsZUVkaXRvckRyb3AoZXZ0LCBlZGl0b3IsIGluZm8pO1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIGF3YWl0IHRoaXMucmVidWlsZFJlZmVyZW5jZUluZGV4KCk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwibW9kaWZ5XCIsIChmaWxlKSA9PiB0aGlzLnRyYWNrVmF1bHRNdXRhdGlvbigoKSA9PiB0aGlzLmhhbmRsZVZhdWx0TW9kaWZ5KGZpbGUpKSkpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcImRlbGV0ZVwiLCAoZmlsZSkgPT4gdGhpcy50cmFja1ZhdWx0TXV0YXRpb24oKCkgPT4gdGhpcy5oYW5kbGVWYXVsdERlbGV0ZShmaWxlKSkpKTtcbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC52YXVsdC5vbihcInJlbmFtZVwiLCAoZmlsZSwgb2xkUGF0aCkgPT4gdGhpcy50cmFja1ZhdWx0TXV0YXRpb24oKCkgPT4gdGhpcy5oYW5kbGVWYXVsdFJlbmFtZShmaWxlLCBvbGRQYXRoKSkpLFxuICAgICk7XG5cbiAgICB0aGlzLnNldHVwQXV0b1N5bmMoKTtcblxuICAgIHZvaWQgdGhpcy51cGxvYWRRdWV1ZS5wcm9jZXNzUGVuZGluZ1Rhc2tzKCk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyKCgpID0+IHtcbiAgICAgIGZvciAoY29uc3QgYmxvYlVybCBvZiB0aGlzLmJsb2JVcmxzKSB7XG4gICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwoYmxvYlVybCk7XG4gICAgICB9XG4gICAgICB0aGlzLmJsb2JVcmxzLmNsZWFyKCk7XG4gICAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy52YWx1ZXMoKSkge1xuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgICB9XG4gICAgICB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy5jbGVhcigpO1xuICAgICAgdGhpcy51cGxvYWRRdWV1ZS5kaXNwb3NlKCk7XG4gICAgfSk7XG4gIH1cblxuICBvbnVubG9hZCgpIHtcbiAgICBmb3IgKGNvbnN0IGJsb2JVcmwgb2YgdGhpcy5ibG9iVXJscykge1xuICAgICAgVVJMLnJldm9rZU9iamVjdFVSTChibG9iVXJsKTtcbiAgICB9XG4gICAgdGhpcy5ibG9iVXJscy5jbGVhcigpO1xuICAgIHRoaXMudXBsb2FkUXVldWU/LmRpc3Bvc2UoKTtcbiAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy52YWx1ZXMoKSkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xuICAgIH1cbiAgICB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy5jbGVhcigpO1xuICB9XG5cbiAgYXN5bmMgbG9hZFBsdWdpblN0YXRlKCkge1xuICAgIGNvbnN0IGxvYWRlZCA9IGF3YWl0IHRoaXMubG9hZERhdGEoKTtcbiAgICBpZiAoIWxvYWRlZCB8fCB0eXBlb2YgbG9hZGVkICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICB0aGlzLnNldHRpbmdzID0geyAuLi5ERUZBVUxUX1NFVFRJTkdTIH07XG4gICAgICB0aGlzLnF1ZXVlID0gW107XG4gICAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzID0gbmV3IE1hcCgpO1xuICAgICAgdGhpcy5zeW5jSW5kZXggPSBuZXcgTWFwKCk7XG4gICAgICB0aGlzLnN5bmNlZERpcmVjdG9yaWVzID0gbmV3IFNldCgpO1xuICAgICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzID0gbmV3IE1hcCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGNhbmRpZGF0ZSA9IGxvYWRlZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICBpZiAoXCJzZXR0aW5nc1wiIGluIGNhbmRpZGF0ZSB8fCBcInF1ZXVlXCIgaW4gY2FuZGlkYXRlKSB7XG4gICAgICB0aGlzLnNldHRpbmdzID0geyAuLi5ERUZBVUxUX1NFVFRJTkdTLCAuLi4oKGNhbmRpZGF0ZS5zZXR0aW5ncyBhcyBQYXJ0aWFsPFNlY3VyZVdlYmRhdlNldHRpbmdzPikgPz8ge30pIH07XG4gICAgICB0aGlzLnF1ZXVlID0gQXJyYXkuaXNBcnJheShjYW5kaWRhdGUucXVldWUpID8gKGNhbmRpZGF0ZS5xdWV1ZSBhcyBVcGxvYWRUYXNrW10pIDogW107XG4gICAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzID0gbmV3IE1hcChcbiAgICAgICAgT2JqZWN0LmVudHJpZXMoKGNhbmRpZGF0ZS5ub3RlQWNjZXNzVGltZXN0YW1wcyBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHwgdW5kZWZpbmVkKSA/PyB7fSksXG4gICAgICApO1xuICAgICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzID0gbmV3IE1hcChcbiAgICAgICAgT2JqZWN0LmVudHJpZXMoKGNhbmRpZGF0ZS5taXNzaW5nTGF6eVJlbW90ZU5vdGVzIGFzIFJlY29yZDxzdHJpbmcsIE1pc3NpbmdMYXp5UmVtb3RlUmVjb3JkPiB8IHVuZGVmaW5lZCkgPz8ge30pXG4gICAgICAgICAgLmZpbHRlcigoWywgdmFsdWVdKSA9PiB7XG4gICAgICAgICAgICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByZWNvcmQgPSB2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgIHR5cGVvZiByZWNvcmQuZmlyc3REZXRlY3RlZEF0ID09PSBcIm51bWJlclwiICYmXG4gICAgICAgICAgICAgIHR5cGVvZiByZWNvcmQubGFzdERldGVjdGVkQXQgPT09IFwibnVtYmVyXCIgJiZcbiAgICAgICAgICAgICAgdHlwZW9mIHJlY29yZC5taXNzQ291bnQgPT09IFwibnVtYmVyXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAubWFwKChbcGF0aCwgdmFsdWVdKSA9PiBbcGF0aCwgdmFsdWUgYXMgTWlzc2luZ0xhenlSZW1vdGVSZWNvcmRdKSxcbiAgICAgICk7XG4gICAgICB0aGlzLnN5bmNJbmRleCA9IG5ldyBNYXAoKTtcbiAgICAgIGZvciAoY29uc3QgW3BhdGgsIHJhd0VudHJ5XSBvZiBPYmplY3QuZW50cmllcygoY2FuZGlkYXRlLnN5bmNJbmRleCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCkgPz8ge30pKSB7XG4gICAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSB0aGlzLm5vcm1hbGl6ZVN5bmNJbmRleEVudHJ5KHBhdGgsIHJhd0VudHJ5KTtcbiAgICAgICAgaWYgKG5vcm1hbGl6ZWQpIHtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQocGF0aCwgbm9ybWFsaXplZCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID1cbiAgICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jQXQgPT09IFwibnVtYmVyXCIgPyBjYW5kaWRhdGUubGFzdFZhdWx0U3luY0F0IDogMDtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9XG4gICAgICAgIHR5cGVvZiBjYW5kaWRhdGUubGFzdFZhdWx0U3luY1N0YXR1cyA9PT0gXCJzdHJpbmdcIiA/IGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jU3RhdHVzIDogXCJcIjtcbiAgICAgIHRoaXMuc3luY2VkRGlyZWN0b3JpZXMgPSBuZXcgU2V0KFxuICAgICAgICBBcnJheS5pc0FycmF5KGNhbmRpZGF0ZS5zeW5jZWREaXJlY3RvcmllcykgPyBjYW5kaWRhdGUuc3luY2VkRGlyZWN0b3JpZXMgYXMgc3RyaW5nW10gOiBbXSxcbiAgICAgICk7XG4gICAgICB0aGlzLm5vcm1hbGl6ZUVmZmVjdGl2ZVNldHRpbmdzKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUywgLi4uKGNhbmRpZGF0ZSBhcyBQYXJ0aWFsPFNlY3VyZVdlYmRhdlNldHRpbmdzPikgfTtcbiAgICB0aGlzLnF1ZXVlID0gW107XG4gICAgdGhpcy5ub3RlQWNjZXNzVGltZXN0YW1wcyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLnN5bmNJbmRleCA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLnN5bmNlZERpcmVjdG9yaWVzID0gbmV3IFNldCgpO1xuICAgIHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3RlcyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IDA7XG4gICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gXCJcIjtcbiAgICB0aGlzLm5vcm1hbGl6ZUVmZmVjdGl2ZVNldHRpbmdzKCk7XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUVmZmVjdGl2ZVNldHRpbmdzKCkge1xuICAgIC8vIEtlZXAgdGhlIHB1YmxpYyBzZXR0aW5ncyBzdXJmYWNlIGludGVudGlvbmFsbHkgc21hbGwgYW5kIGRldGVybWluaXN0aWMuXG4gICAgdGhpcy5zZXR0aW5ncy5kZWxldGVMb2NhbEFmdGVyVXBsb2FkID0gdHJ1ZTtcbiAgICB0aGlzLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzID0gTWF0aC5tYXgoMCwgTWF0aC5mbG9vcih0aGlzLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzIHx8IDApKTtcbiAgICBjb25zdCByYXdFeGNsdWRlZCA9IHRoaXMuc2V0dGluZ3MuZXhjbHVkZWRTeW5jRm9sZGVycyBhcyB1bmtub3duO1xuICAgIGNvbnN0IGV4Y2x1ZGVkID0gQXJyYXkuaXNBcnJheShyYXdFeGNsdWRlZClcbiAgICAgID8gcmF3RXhjbHVkZWRcbiAgICAgIDogdHlwZW9mIHJhd0V4Y2x1ZGVkID09PSBcInN0cmluZ1wiXG4gICAgICAgID8gcmF3RXhjbHVkZWQuc3BsaXQoL1ssXFxuXS8pXG4gICAgICAgIDogREVGQVVMVF9TRVRUSU5HUy5leGNsdWRlZFN5bmNGb2xkZXJzO1xuICAgIHRoaXMuc2V0dGluZ3MuZXhjbHVkZWRTeW5jRm9sZGVycyA9IFtcbiAgICAgIC4uLm5ldyBTZXQoXG4gICAgICAgIGV4Y2x1ZGVkXG4gICAgICAgICAgLm1hcCgodmFsdWUpID0+IG5vcm1hbGl6ZVBhdGgoU3RyaW5nKHZhbHVlKS50cmltKCkpLnJlcGxhY2UoL15cXC8rLywgXCJcIikucmVwbGFjZSgvXFwvKyQvLCBcIlwiKSlcbiAgICAgICAgICAuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUubGVuZ3RoID4gMCksXG4gICAgICApLFxuICAgIF07XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUZvbGRlcihpbnB1dDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIG5vcm1hbGl6ZUZvbGRlcihpbnB1dCk7XG4gIH1cblxuICBwcml2YXRlIHNldHVwQXV0b1N5bmMoKSB7XG4gICAgY29uc3QgbWludXRlcyA9IHRoaXMuc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXM7XG4gICAgaWYgKG1pbnV0ZXMgPD0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGludGVydmFsTXMgPSBtaW51dGVzICogNjAgKiAxMDAwO1xuICAgIHRoaXMucmVnaXN0ZXJJbnRlcnZhbChcbiAgICAgIHdpbmRvdy5zZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5ydW5BdXRvU3luY1RpY2soKTtcbiAgICAgIH0sIGludGVydmFsTXMpLFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJ1bkF1dG9TeW5jVGljaygpIHtcbiAgICBpZiAodGhpcy5hdXRvU3luY1RpY2tJblByb2dyZXNzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5hdXRvU3luY1RpY2tJblByb2dyZXNzID0gdHJ1ZTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5zeW5jQ29uZmlndXJlZFZhdWx0Q29udGVudChmYWxzZSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMuYXV0b1N5bmNUaWNrSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHNhdmVQbHVnaW5TdGF0ZSgpIHtcbiAgICBhd2FpdCB0aGlzLnNhdmVEYXRhKHtcbiAgICAgIHNldHRpbmdzOiB0aGlzLnNldHRpbmdzLFxuICAgICAgcXVldWU6IHRoaXMucXVldWUsXG4gICAgICBub3RlQWNjZXNzVGltZXN0YW1wczogT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMuZW50cmllcygpKSxcbiAgICAgIG1pc3NpbmdMYXp5UmVtb3RlTm90ZXM6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMuZW50cmllcygpKSxcbiAgICAgIHN5bmNJbmRleDogT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMuc3luY0luZGV4LmVudHJpZXMoKSksXG4gICAgICBzeW5jZWREaXJlY3RvcmllczogWy4uLnRoaXMuc3luY2VkRGlyZWN0b3JpZXNdLFxuICAgICAgbGFzdFZhdWx0U3luY0F0OiB0aGlzLmxhc3RWYXVsdFN5bmNBdCxcbiAgICAgIGxhc3RWYXVsdFN5bmNTdGF0dXM6IHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyxcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcbiAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVTeW5jSW5kZXhFbnRyeSh2YXVsdFBhdGg6IHN0cmluZywgcmF3RW50cnk6IHVua25vd24pOiBTeW5jSW5kZXhFbnRyeSB8IG51bGwge1xuICAgIGlmICghcmF3RW50cnkgfHwgdHlwZW9mIHJhd0VudHJ5ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBjYW5kaWRhdGUgPSByYXdFbnRyeSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICBjb25zdCByZW1vdGVQYXRoID1cbiAgICAgIHR5cGVvZiBjYW5kaWRhdGUucmVtb3RlUGF0aCA9PT0gXCJzdHJpbmdcIiAmJiBjYW5kaWRhdGUucmVtb3RlUGF0aC5sZW5ndGggPiAwXG4gICAgICAgID8gY2FuZGlkYXRlLnJlbW90ZVBhdGhcbiAgICAgICAgOiB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aCh2YXVsdFBhdGgpO1xuICAgIGNvbnN0IGxvY2FsU2lnbmF0dXJlID1cbiAgICAgIHR5cGVvZiBjYW5kaWRhdGUubG9jYWxTaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgPyBjYW5kaWRhdGUubG9jYWxTaWduYXR1cmVcbiAgICAgICAgOiB0eXBlb2YgY2FuZGlkYXRlLnNpZ25hdHVyZSA9PT0gXCJzdHJpbmdcIlxuICAgICAgICAgID8gY2FuZGlkYXRlLnNpZ25hdHVyZVxuICAgICAgICAgIDogXCJcIjtcbiAgICBjb25zdCByZW1vdGVTaWduYXR1cmUgPVxuICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5yZW1vdGVTaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgPyBjYW5kaWRhdGUucmVtb3RlU2lnbmF0dXJlXG4gICAgICAgIDogdHlwZW9mIGNhbmRpZGF0ZS5zaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgICA/IGNhbmRpZGF0ZS5zaWduYXR1cmVcbiAgICAgICAgICA6IFwiXCI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICByZW1vdGVQYXRoLFxuICAgIH07XG4gIH1cblxuICB0KHpoOiBzdHJpbmcsIGVuOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRMYW5ndWFnZSgpID09PSBcInpoXCIgPyB6aCA6IGVuO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRMYW5ndWFnZSgpIHtcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5sYW5ndWFnZSA9PT0gXCJhdXRvXCIpIHtcbiAgICAgIGNvbnN0IGxvY2FsZSA9IHR5cGVvZiBuYXZpZ2F0b3IgIT09IFwidW5kZWZpbmVkXCIgPyBuYXZpZ2F0b3IubGFuZ3VhZ2UudG9Mb3dlckNhc2UoKSA6IFwiZW5cIjtcbiAgICAgIHJldHVybiBsb2NhbGUuc3RhcnRzV2l0aChcInpoXCIpID8gXCJ6aFwiIDogXCJlblwiO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNldHRpbmdzLmxhbmd1YWdlO1xuICB9XG5cbiAgZm9ybWF0TGFzdFN5bmNMYWJlbCgpIHtcbiAgICBpZiAoIXRoaXMubGFzdFZhdWx0U3luY0F0KSB7XG4gICAgICByZXR1cm4gdGhpcy50KFwiXHU0RTBBXHU2QjIxXHU1NDBDXHU2QjY1XHVGRjFBXHU1QzFBXHU2NzJBXHU2MjY3XHU4ODRDXCIsIFwiTGFzdCBzeW5jOiBub3QgcnVuIHlldFwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy50KFxuICAgICAgYFx1NEUwQVx1NkIyMVx1NTQwQ1x1NkI2NVx1RkYxQSR7bmV3IERhdGUodGhpcy5sYXN0VmF1bHRTeW5jQXQpLnRvTG9jYWxlU3RyaW5nKCl9YCxcbiAgICAgIGBMYXN0IHN5bmM6ICR7bmV3IERhdGUodGhpcy5sYXN0VmF1bHRTeW5jQXQpLnRvTG9jYWxlU3RyaW5nKCl9YCxcbiAgICApO1xuICB9XG5cbiAgZm9ybWF0U3luY1N0YXR1c0xhYmVsKCkge1xuICAgIHJldHVybiB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXNcbiAgICAgID8gdGhpcy50KGBcdTY3MDBcdThGRDFcdTcyQjZcdTYwMDFcdUZGMUEke3RoaXMubGFzdFZhdWx0U3luY1N0YXR1c31gLCBgUmVjZW50IHN0YXR1czogJHt0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXN9YClcbiAgICAgIDogdGhpcy50KFwiXHU2NzAwXHU4RkQxXHU3MkI2XHU2MDAxXHVGRjFBXHU2NjgyXHU2NUUwXCIsIFwiUmVjZW50IHN0YXR1czogbm9uZVwiKTtcbiAgfVxuXG4gIGFzeW5jIHJ1bk1hbnVhbFN5bmMoKSB7XG4gICAgYXdhaXQgdGhpcy5zeW5jQ29uZmlndXJlZFZhdWx0Q29udGVudCh0cnVlKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVidWlsZFJlZmVyZW5jZUluZGV4KCkge1xuICAgIGNvbnN0IG5leHQgPSBuZXcgTWFwPHN0cmluZywgU2V0PHN0cmluZz4+KCk7XG4gICAgZm9yIChjb25zdCBmaWxlIG9mIHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKSkge1xuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICBuZXh0LnNldChmaWxlLnBhdGgsIHRoaXMuZXh0cmFjdFJlbW90ZVBhdGhzRnJvbVRleHQoY29udGVudCkpO1xuICAgIH1cbiAgICB0aGlzLm5vdGVSZW1vdGVSZWZzID0gbmV4dDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlVmF1bHRNb2RpZnkoZmlsZTogVEFic3RyYWN0RmlsZSkge1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkgfHwgZmlsZS5leHRlbnNpb24gIT09IFwibWRcIikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IG5leHRSZWZzID0gdGhpcy5leHRyYWN0UmVtb3RlUGF0aHNGcm9tVGV4dChjb250ZW50KTtcbiAgICBjb25zdCBwcmV2aW91c1JlZnMgPSB0aGlzLm5vdGVSZW1vdGVSZWZzLmdldChmaWxlLnBhdGgpID8/IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIHRoaXMubm90ZVJlbW90ZVJlZnMuc2V0KGZpbGUucGF0aCwgbmV4dFJlZnMpO1xuXG4gICAgY29uc3QgYWRkZWQgPSBbLi4ubmV4dFJlZnNdLmZpbHRlcigodmFsdWUpID0+ICFwcmV2aW91c1JlZnMuaGFzKHZhbHVlKSk7XG4gICAgY29uc3QgcmVtb3ZlZCA9IFsuLi5wcmV2aW91c1JlZnNdLmZpbHRlcigodmFsdWUpID0+ICFuZXh0UmVmcy5oYXModmFsdWUpKTtcbiAgICBpZiAoYWRkZWQubGVuZ3RoID4gMCkge1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMoZmlsZS5wYXRoLCBcImltYWdlLWFkZFwiKTtcbiAgICB9XG4gICAgaWYgKHJlbW92ZWQubGVuZ3RoID4gMCkge1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMoZmlsZS5wYXRoLCBcImltYWdlLXJlbW92ZVwiKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZVZhdWx0RGVsZXRlKGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgoZmlsZS5wYXRoKSkge1xuICAgICAgYXdhaXQgdGhpcy53cml0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCwgdGhpcy5zeW5jSW5kZXguZ2V0KGZpbGUucGF0aCk/LnJlbW90ZVNpZ25hdHVyZSk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgfVxuXG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIHRoaXMubm90ZVJlbW90ZVJlZnMuZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVWYXVsdFJlbmFtZShmaWxlOiBUQWJzdHJhY3RGaWxlLCBvbGRQYXRoOiBzdHJpbmcpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgob2xkUGF0aCkpIHtcbiAgICAgIGF3YWl0IHRoaXMud3JpdGVEZWxldGlvblRvbWJzdG9uZShvbGRQYXRoLCB0aGlzLnN5bmNJbmRleC5nZXQob2xkUGF0aCk/LnJlbW90ZVNpZ25hdHVyZSk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUob2xkUGF0aCk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgIH1cblxuICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICBjb25zdCByZWZzID0gdGhpcy5ub3RlUmVtb3RlUmVmcy5nZXQob2xkUGF0aCk7XG4gICAgICBpZiAocmVmcykge1xuICAgICAgICB0aGlzLm5vdGVSZW1vdGVSZWZzLmRlbGV0ZShvbGRQYXRoKTtcbiAgICAgICAgdGhpcy5ub3RlUmVtb3RlUmVmcy5zZXQoZmlsZS5wYXRoLCByZWZzKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCF0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgoZmlsZS5wYXRoKSkge1xuICAgICAgICB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyhmaWxlLnBhdGgsIFwiaW1hZ2UtYWRkXCIpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdFJlbW90ZVBhdGhzRnJvbVRleHQoY29udGVudDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVmcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IHNwYW5SZWdleCA9IC9kYXRhLXNlY3VyZS13ZWJkYXY9XCIoW15cIl0rKVwiL2c7XG4gICAgY29uc3QgcHJvdG9jb2xSZWdleCA9IC93ZWJkYXYtc2VjdXJlOlxcL1xcLyhbXlxccylcIl0rKS9nO1xuICAgIGNvbnN0IGNvZGVCbG9ja1JlZ2V4ID0gL2BgYHNlY3VyZS13ZWJkYXZcXHMrKFtcXHNcXFNdKj8pYGBgL2c7XG4gICAgbGV0IG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXG4gICAgd2hpbGUgKChtYXRjaCA9IHNwYW5SZWdleC5leGVjKGNvbnRlbnQpKSAhPT0gbnVsbCkge1xuICAgICAgcmVmcy5hZGQodGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0pKTtcbiAgICB9XG5cbiAgICB3aGlsZSAoKG1hdGNoID0gcHJvdG9jb2xSZWdleC5leGVjKGNvbnRlbnQpKSAhPT0gbnVsbCkge1xuICAgICAgcmVmcy5hZGQodGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0pKTtcbiAgICB9XG5cbiAgICB3aGlsZSAoKG1hdGNoID0gY29kZUJsb2NrUmVnZXguZXhlYyhjb250ZW50KSkgIT09IG51bGwpIHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IHRoaXMuaW1hZ2VTdXBwb3J0LnBhcnNlU2VjdXJlSW1hZ2VCbG9jayhtYXRjaFsxXSk7XG4gICAgICBpZiAocGFyc2VkPy5wYXRoKSB7XG4gICAgICAgIHJlZnMuYWRkKHBhcnNlZC5wYXRoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVmcztcbiAgfVxuXG4gIHByaXZhdGUgc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jKG5vdGVQYXRoOiBzdHJpbmcsIHJlYXNvbjogXCJpbWFnZS1hZGRcIiB8IFwiaW1hZ2UtcmVtb3ZlXCIpIHtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLmdldChub3RlUGF0aCk7XG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KGV4aXN0aW5nKTtcbiAgICB9XG5cbiAgICBjb25zdCBkZWxheU1zID0gcmVhc29uID09PSBcImltYWdlLWFkZFwiID8gMTIwMCA6IDYwMDtcbiAgICBjb25zdCB0aW1lb3V0SWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy5kZWxldGUobm90ZVBhdGgpO1xuICAgICAgdm9pZCB0aGlzLmZsdXNoUHJpb3JpdHlOb3RlU3luYyhub3RlUGF0aCwgcmVhc29uKTtcbiAgICB9LCBkZWxheU1zKTtcbiAgICB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy5zZXQobm90ZVBhdGgsIHRpbWVvdXRJZCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGZsdXNoUHJpb3JpdHlOb3RlU3luYyhub3RlUGF0aDogc3RyaW5nLCByZWFzb246IFwiaW1hZ2UtYWRkXCIgfCBcImltYWdlLXJlbW92ZVwiKSB7XG4gICAgaWYgKHRoaXMucHJpb3JpdHlOb3RlU3luY3NJbkZsaWdodC5oYXMobm90ZVBhdGgpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgdGhpcy51cGxvYWRRdWV1ZS5oYXNQZW5kaW5nV29ya0Zvck5vdGUobm90ZVBhdGgpIHx8XG4gICAgICB0aGlzLnBlbmRpbmdWYXVsdE11dGF0aW9uUHJvbWlzZXMuc2l6ZSA+IDAgfHxcbiAgICAgIHRoaXMuc3luY0luUHJvZ3Jlc3MgfHxcbiAgICAgIHRoaXMuYXV0b1N5bmNUaWNrSW5Qcm9ncmVzc1xuICAgICkge1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZVBhdGgsIHJlYXNvbik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZmlsZSA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKG5vdGVQYXRoKTtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHx8IGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIgfHwgdGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKGZpbGUucGF0aCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnByaW9yaXR5Tm90ZVN5bmNzSW5GbGlnaHQuYWRkKG5vdGVQYXRoKTtcbiAgICB0cnkge1xuICAgICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG5cbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSk7XG4gICAgICBpZiAodGhpcy5wYXJzZU5vdGVTdHViKGNvbnRlbnQpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoLCBjb250ZW50KTtcbiAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgbG9jYWxTaWduYXR1cmU6IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUoZmlsZSwgY29udGVudCksXG4gICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgfSk7XG4gICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLnQoXG4gICAgICAgIHJlYXNvbiA9PT0gXCJpbWFnZS1hZGRcIlxuICAgICAgICAgID8gYFx1NURGMlx1NEYxOFx1NTE0OFx1NTQwQ1x1NkI2NVx1NTZGRVx1NzI0N1x1NjVCMFx1NTg5RVx1NTQwRVx1NzY4NFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gXG4gICAgICAgICAgOiBgXHU1REYyXHU0RjE4XHU1MTQ4XHU1NDBDXHU2QjY1XHU1NkZFXHU3MjQ3XHU1MjIwXHU5NjY0XHU1NDBFXHU3Njg0XHU3QjE0XHU4QkIwXHVGRjFBJHtmaWxlLmJhc2VuYW1lfWAsXG4gICAgICAgIHJlYXNvbiA9PT0gXCJpbWFnZS1hZGRcIlxuICAgICAgICAgID8gYFByaW9yaXRpemVkIG5vdGUgc3luYyBmaW5pc2hlZCBhZnRlciBpbWFnZSBhZGQ6ICR7ZmlsZS5iYXNlbmFtZX1gXG4gICAgICAgICAgOiBgUHJpb3JpdGl6ZWQgbm90ZSBzeW5jIGZpbmlzaGVkIGFmdGVyIGltYWdlIHJlbW92YWw6ICR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJQcmlvcml0eSBub3RlIHN5bmMgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gRGF0ZS5ub3coKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9IHRoaXMuZGVzY3JpYmVFcnJvcihcbiAgICAgICAgdGhpcy50KFxuICAgICAgICAgIHJlYXNvbiA9PT0gXCJpbWFnZS1hZGRcIiA/IFwiXHU1NkZFXHU3MjQ3XHU2NUIwXHU1ODlFXHU1NDBFXHU3Njg0XHU3QjE0XHU4QkIwXHU0RjE4XHU1MTQ4XHU1NDBDXHU2QjY1XHU1OTMxXHU4RDI1XCIgOiBcIlx1NTZGRVx1NzI0N1x1NTIyMFx1OTY2NFx1NTQwRVx1NzY4NFx1N0IxNFx1OEJCMFx1NEYxOFx1NTE0OFx1NTQwQ1x1NkI2NVx1NTkzMVx1OEQyNVwiLFxuICAgICAgICAgIHJlYXNvbiA9PT0gXCJpbWFnZS1hZGRcIiA/IFwiUHJpb3JpdHkgbm90ZSBzeW5jIGFmdGVyIGltYWdlIGFkZCBmYWlsZWRcIiA6IFwiUHJpb3JpdHkgbm90ZSBzeW5jIGFmdGVyIGltYWdlIHJlbW92YWwgZmFpbGVkXCIsXG4gICAgICAgICksXG4gICAgICAgIGVycm9yLFxuICAgICAgKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyhub3RlUGF0aCwgcmVhc29uKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy5wcmlvcml0eU5vdGVTeW5jc0luRmxpZ2h0LmRlbGV0ZShub3RlUGF0aCk7XG4gICAgfVxuICB9XG5cblxuICBwcml2YXRlIGFzeW5jIGJ1aWxkVXBsb2FkUmVwbGFjZW1lbnRzKGNvbnRlbnQ6IHN0cmluZywgbm90ZUZpbGU6IFRGaWxlLCB1cGxvYWRDYWNoZT86IE1hcDxzdHJpbmcsIHN0cmluZz4pIHtcbiAgICBjb25zdCBzZWVuID0gbmV3IE1hcDxzdHJpbmcsIFVwbG9hZFJld3JpdGU+KCk7XG4gICAgY29uc3Qgd2lraU1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvIVxcW1xcWyhbXlxcXV0rKVxcXVxcXS9nKV07XG4gICAgY29uc3QgbWFya2Rvd25NYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtbXlxcXV0qXVxcKChbXildKylcXCkvZyldO1xuICAgIGNvbnN0IGh0bWxJbWFnZU1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvPGltZ1xcYltePl0qc3JjPVtcIiddKFteXCInXSspW1wiJ11bXj5dKj4vZ2kpXTtcblxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2Ygd2lraU1hdGNoZXMpIHtcbiAgICAgIGNvbnN0IHJhd0xpbmsgPSBtYXRjaFsxXS5zcGxpdChcInxcIilbMF0udHJpbSgpO1xuICAgICAgY29uc3QgZmlsZSA9IHRoaXMucmVzb2x2ZUxpbmtlZEZpbGUocmF3TGluaywgbm90ZUZpbGUucGF0aCk7XG4gICAgICBpZiAoIWZpbGUgfHwgIXRoaXMuaXNJbWFnZUZpbGUoZmlsZSkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghc2Vlbi5oYXMobWF0Y2hbMF0pKSB7XG4gICAgICAgIGNvbnN0IHJlbW90ZVVybCA9IGF3YWl0IHRoaXMudXBsb2FkVmF1bHRGaWxlKGZpbGUsIHVwbG9hZENhY2hlKTtcbiAgICAgICAgc2Vlbi5zZXQobWF0Y2hbMF0sIHtcbiAgICAgICAgICBvcmlnaW5hbDogbWF0Y2hbMF0sXG4gICAgICAgICAgcmV3cml0dGVuOiB0aGlzLmltYWdlU3VwcG9ydC5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgZmlsZS5iYXNlbmFtZSksXG4gICAgICAgICAgc291cmNlRmlsZTogZmlsZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXJrZG93bk1hdGNoZXMpIHtcbiAgICAgIGNvbnN0IHJhd0xpbmsgPSBkZWNvZGVVUklDb21wb25lbnQobWF0Y2hbMV0udHJpbSgpLnJlcGxhY2UoL148fD4kL2csIFwiXCIpKTtcbiAgICAgIGlmICgvXih3ZWJkYXYtc2VjdXJlOnxkYXRhOikvaS50ZXN0KHJhd0xpbmspKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5pc0h0dHBVcmwocmF3TGluaykpIHtcbiAgICAgICAgaWYgKCFzZWVuLmhhcyhtYXRjaFswXSkpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRSZW1vdGVJbWFnZVVybChyYXdMaW5rLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgICAgICBjb25zdCBhbHRUZXh0ID0gdGhpcy5leHRyYWN0TWFya2Rvd25BbHRUZXh0KG1hdGNoWzBdKSB8fCB0aGlzLmdldERpc3BsYXlOYW1lRnJvbVVybChyYXdMaW5rKTtcbiAgICAgICAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgICAgICAgIG9yaWdpbmFsOiBtYXRjaFswXSxcbiAgICAgICAgICAgICAgcmV3cml0dGVuOiB0aGlzLmltYWdlU3VwcG9ydC5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgYWx0VGV4dCksXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgW3NlY3VyZS13ZWJkYXYtaW1hZ2VzXSBcdThERjNcdThGQzdcdTU5MzFcdThEMjVcdTc2ODRcdThGRENcdTdBMEJcdTU2RkVcdTcyNDcgJHtyYXdMaW5rfWAsIGU/Lm1lc3NhZ2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZmlsZSA9IHRoaXMucmVzb2x2ZUxpbmtlZEZpbGUocmF3TGluaywgbm90ZUZpbGUucGF0aCk7XG4gICAgICBpZiAoIWZpbGUgfHwgIXRoaXMuaXNJbWFnZUZpbGUoZmlsZSkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghc2Vlbi5oYXMobWF0Y2hbMF0pKSB7XG4gICAgICAgIGNvbnN0IHJlbW90ZVVybCA9IGF3YWl0IHRoaXMudXBsb2FkVmF1bHRGaWxlKGZpbGUsIHVwbG9hZENhY2hlKTtcbiAgICAgICAgc2Vlbi5zZXQobWF0Y2hbMF0sIHtcbiAgICAgICAgICBvcmlnaW5hbDogbWF0Y2hbMF0sXG4gICAgICAgICAgcmV3cml0dGVuOiB0aGlzLmltYWdlU3VwcG9ydC5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgZmlsZS5iYXNlbmFtZSksXG4gICAgICAgICAgc291cmNlRmlsZTogZmlsZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiBodG1sSW1hZ2VNYXRjaGVzKSB7XG4gICAgICBjb25zdCByYXdMaW5rID0gdGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0udHJpbSgpKTtcbiAgICAgIGlmICghdGhpcy5pc0h0dHBVcmwocmF3TGluaykgfHwgc2Vlbi5oYXMobWF0Y2hbMF0pKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFJlbW90ZUltYWdlVXJsKHJhd0xpbmssIHVwbG9hZENhY2hlKTtcbiAgICAgICAgY29uc3QgYWx0VGV4dCA9IHRoaXMuZXh0cmFjdEh0bWxJbWFnZUFsdFRleHQobWF0Y2hbMF0pIHx8IHRoaXMuZ2V0RGlzcGxheU5hbWVGcm9tVXJsKHJhd0xpbmspO1xuICAgICAgICBzZWVuLnNldChtYXRjaFswXSwge1xuICAgICAgICAgIG9yaWdpbmFsOiBtYXRjaFswXSxcbiAgICAgICAgICByZXdyaXR0ZW46IHRoaXMuaW1hZ2VTdXBwb3J0LmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsLCBhbHRUZXh0KSxcbiAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAgICAgY29uc29sZS53YXJuKGBbc2VjdXJlLXdlYmRhdi1pbWFnZXNdIFx1OERGM1x1OEZDN1x1NTkzMVx1OEQyNVx1NzY4NFx1OEZEQ1x1N0EwQlx1NTZGRVx1NzI0NyAke3Jhd0xpbmt9YCwgZT8ubWVzc2FnZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIFsuLi5zZWVuLnZhbHVlcygpXTtcbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdE1hcmtkb3duQWx0VGV4dChtYXJrZG93bkltYWdlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtYXRjaCA9IG1hcmtkb3duSW1hZ2UubWF0Y2goL14hXFxbKFteXFxdXSopXFxdLyk7XG4gICAgcmV0dXJuIG1hdGNoPy5bMV0/LnRyaW0oKSA/PyBcIlwiO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRyYWN0SHRtbEltYWdlQWx0VGV4dChodG1sSW1hZ2U6IHN0cmluZykge1xuICAgIGNvbnN0IG1hdGNoID0gaHRtbEltYWdlLm1hdGNoKC9cXGJhbHQ9W1wiJ10oW15cIiddKilbXCInXS9pKTtcbiAgICByZXR1cm4gbWF0Y2ggPyB0aGlzLnVuZXNjYXBlSHRtbChtYXRjaFsxXS50cmltKCkpIDogXCJcIjtcbiAgfVxuXG4gIHByaXZhdGUgaXNIdHRwVXJsKHZhbHVlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gL15odHRwcz86XFwvXFwvL2kudGVzdCh2YWx1ZSk7XG4gIH1cblxuICBwcml2YXRlIGdldERpc3BsYXlOYW1lRnJvbVVybChyYXdVcmw6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJhd1VybCk7XG4gICAgICBjb25zdCBmaWxlTmFtZSA9IHRoaXMuc2FuaXRpemVGaWxlTmFtZSh1cmwucGF0aG5hbWUuc3BsaXQoXCIvXCIpLnBvcCgpIHx8IFwiXCIpO1xuICAgICAgaWYgKGZpbGVOYW1lKSB7XG4gICAgICAgIHJldHVybiBmaWxlTmFtZS5yZXBsYWNlKC9cXC5bXi5dKyQvLCBcIlwiKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIEZhbGwgdGhyb3VnaCB0byB0aGUgZ2VuZXJpYyBsYWJlbCBiZWxvdy5cbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy50KFwiXHU3RjUxXHU5ODc1XHU1NkZFXHU3MjQ3XCIsIFwiV2ViIGltYWdlXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSByZXNvbHZlTGlua2VkRmlsZShsaW5rOiBzdHJpbmcsIHNvdXJjZVBhdGg6IHN0cmluZyk6IFRGaWxlIHwgbnVsbCB7XG4gICAgY29uc3QgY2xlYW5lZCA9IGxpbmsucmVwbGFjZSgvIy4qLywgXCJcIikudHJpbSgpO1xuICAgIGNvbnN0IHRhcmdldCA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0Rmlyc3RMaW5rcGF0aERlc3QoY2xlYW5lZCwgc291cmNlUGF0aCk7XG4gICAgcmV0dXJuIHRhcmdldCBpbnN0YW5jZW9mIFRGaWxlID8gdGFyZ2V0IDogbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgaXNJbWFnZUZpbGUoZmlsZTogVEZpbGUpIHtcbiAgICByZXR1cm4gL14ocG5nfGpwZT9nfGdpZnx3ZWJwfGJtcHxzdmcpJC9pLnRlc3QoZmlsZS5leHRlbnNpb24pO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRWYXVsdEZpbGUoZmlsZTogVEZpbGUsIHVwbG9hZENhY2hlPzogTWFwPHN0cmluZywgc3RyaW5nPikge1xuICAgIGlmICh1cGxvYWRDYWNoZT8uaGFzKGZpbGUucGF0aCkpIHtcbiAgICAgIHJldHVybiB1cGxvYWRDYWNoZS5nZXQoZmlsZS5wYXRoKSE7XG4gICAgfVxuXG4gICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG4gICAgY29uc3QgYmluYXJ5ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZEJpbmFyeShmaWxlKTtcbiAgICBjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRoaXMucHJlcGFyZVVwbG9hZFBheWxvYWQoYmluYXJ5LCB0aGlzLmdldE1pbWVUeXBlKGZpbGUuZXh0ZW5zaW9uKSwgZmlsZS5uYW1lKTtcbiAgICBjb25zdCByZW1vdGVOYW1lID0gYXdhaXQgdGhpcy5idWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeShwcmVwYXJlZC5maWxlTmFtZSwgcHJlcGFyZWQuYmluYXJ5KTtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5idWlsZFJlbW90ZVBhdGgocmVtb3RlTmFtZSk7XG4gICAgYXdhaXQgdGhpcy51cGxvYWRCaW5hcnkocmVtb3RlUGF0aCwgcHJlcGFyZWQuYmluYXJ5LCBwcmVwYXJlZC5taW1lVHlwZSk7XG4gICAgY29uc3QgcmVtb3RlVXJsID0gYCR7U0VDVVJFX1BST1RPQ09MfS8vJHtyZW1vdGVQYXRofWA7XG4gICAgdXBsb2FkQ2FjaGU/LnNldChmaWxlLnBhdGgsIHJlbW90ZVVybCk7XG4gICAgcmV0dXJuIHJlbW90ZVVybDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkUmVtb3RlSW1hZ2VVcmwoaW1hZ2VVcmw6IHN0cmluZywgdXBsb2FkQ2FjaGU/OiBNYXA8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgY29uc3QgY2FjaGVLZXkgPSBgcmVtb3RlOiR7aW1hZ2VVcmx9YDtcbiAgICBpZiAodXBsb2FkQ2FjaGU/LmhhcyhjYWNoZUtleSkpIHtcbiAgICAgIHJldHVybiB1cGxvYWRDYWNoZS5nZXQoY2FjaGVLZXkpITtcbiAgICB9XG5cbiAgICB0aGlzLmVuc3VyZUNvbmZpZ3VyZWQoKTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IGltYWdlVXJsLFxuICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgZm9sbG93UmVkaXJlY3RzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgdGhpcy5hc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2UsIFwiUmVtb3RlIGltYWdlIGRvd25sb2FkXCIpO1xuXG4gICAgY29uc3QgY29udGVudFR5cGUgPSByZXNwb25zZS5oZWFkZXJzW1wiY29udGVudC10eXBlXCJdID8/IFwiXCI7XG4gICAgaWYgKCF0aGlzLmlzSW1hZ2VDb250ZW50VHlwZShjb250ZW50VHlwZSkgJiYgIXRoaXMubG9va3NMaWtlSW1hZ2VVcmwoaW1hZ2VVcmwpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiXHU4RkRDXHU3QTBCXHU5NEZFXHU2M0E1XHU0RTBEXHU2NjJGXHU1M0VGXHU4QkM2XHU1MjJCXHU3Njg0XHU1NkZFXHU3MjQ3XHU4RDQ0XHU2RTkwXHUzMDAyXCIsIFwiVGhlIHJlbW90ZSBVUkwgZG9lcyBub3QgbG9vayBsaWtlIGFuIGltYWdlIHJlc291cmNlLlwiKSk7XG4gICAgfVxuXG4gICAgY29uc3QgZmlsZU5hbWUgPSB0aGlzLmJ1aWxkUmVtb3RlU291cmNlRmlsZU5hbWUoaW1hZ2VVcmwsIGNvbnRlbnRUeXBlKTtcbiAgICBjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRoaXMucHJlcGFyZVVwbG9hZFBheWxvYWQoXG4gICAgICByZXNwb25zZS5hcnJheUJ1ZmZlcixcbiAgICAgIHRoaXMubm9ybWFsaXplSW1hZ2VNaW1lVHlwZShjb250ZW50VHlwZSwgZmlsZU5hbWUpLFxuICAgICAgZmlsZU5hbWUsXG4gICAgKTtcbiAgICBjb25zdCByZW1vdGVOYW1lID0gYXdhaXQgdGhpcy5idWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeShwcmVwYXJlZC5maWxlTmFtZSwgcHJlcGFyZWQuYmluYXJ5KTtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5idWlsZFJlbW90ZVBhdGgocmVtb3RlTmFtZSk7XG4gICAgYXdhaXQgdGhpcy51cGxvYWRCaW5hcnkocmVtb3RlUGF0aCwgcHJlcGFyZWQuYmluYXJ5LCBwcmVwYXJlZC5taW1lVHlwZSk7XG4gICAgY29uc3QgcmVtb3RlVXJsID0gYCR7U0VDVVJFX1BST1RPQ09MfS8vJHtyZW1vdGVQYXRofWA7XG4gICAgdXBsb2FkQ2FjaGU/LnNldChjYWNoZUtleSwgcmVtb3RlVXJsKTtcbiAgICByZXR1cm4gcmVtb3RlVXJsO1xuICB9XG5cbiAgcHJpdmF0ZSBpc0ltYWdlQ29udGVudFR5cGUoY29udGVudFR5cGU6IHN0cmluZykge1xuICAgIHJldHVybiAvXmltYWdlXFwvL2kudGVzdChjb250ZW50VHlwZS50cmltKCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBsb29rc0xpa2VJbWFnZVVybChyYXdVcmw6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJhd1VybCk7XG4gICAgICByZXR1cm4gL1xcLihwbmd8anBlP2d8Z2lmfHdlYnB8Ym1wfHN2ZykkL2kudGVzdCh1cmwucGF0aG5hbWUpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRSZW1vdGVTb3VyY2VGaWxlTmFtZShyYXdVcmw6IHN0cmluZywgY29udGVudFR5cGU6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJhd1VybCk7XG4gICAgICBjb25zdCBjYW5kaWRhdGUgPSB0aGlzLnNhbml0aXplRmlsZU5hbWUodXJsLnBhdGhuYW1lLnNwbGl0KFwiL1wiKS5wb3AoKSB8fCBcIlwiKTtcbiAgICAgIGlmIChjYW5kaWRhdGUgJiYgL1xcLlthLXowLTldKyQvaS50ZXN0KGNhbmRpZGF0ZSkpIHtcbiAgICAgICAgcmV0dXJuIGNhbmRpZGF0ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZXh0ZW5zaW9uID0gdGhpcy5nZXRFeHRlbnNpb25Gcm9tTWltZVR5cGUoY29udGVudFR5cGUpIHx8IFwicG5nXCI7XG4gICAgICByZXR1cm4gY2FuZGlkYXRlID8gYCR7Y2FuZGlkYXRlfS4ke2V4dGVuc2lvbn1gIDogYHJlbW90ZS1pbWFnZS4ke2V4dGVuc2lvbn1gO1xuICAgIH0gY2F0Y2gge1xuICAgICAgY29uc3QgZXh0ZW5zaW9uID0gdGhpcy5nZXRFeHRlbnNpb25Gcm9tTWltZVR5cGUoY29udGVudFR5cGUpIHx8IFwicG5nXCI7XG4gICAgICByZXR1cm4gYHJlbW90ZS1pbWFnZS4ke2V4dGVuc2lvbn1gO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgc2FuaXRpemVGaWxlTmFtZShmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGZpbGVOYW1lLnJlcGxhY2UoL1tcXFxcLzoqP1wiPD58XSsvZywgXCItXCIpLnRyaW0oKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0RXh0ZW5zaW9uRnJvbU1pbWVUeXBlKGNvbnRlbnRUeXBlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtaW1lVHlwZSA9IGNvbnRlbnRUeXBlLnNwbGl0KFwiO1wiKVswXS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICByZXR1cm4gTUlNRV9NQVBbbWltZVR5cGVdID8/IFwiXCI7XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUltYWdlTWltZVR5cGUoY29udGVudFR5cGU6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IG1pbWVUeXBlID0gY29udGVudFR5cGUuc3BsaXQoXCI7XCIpWzBdLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmIChtaW1lVHlwZSAmJiBtaW1lVHlwZSAhPT0gXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIikge1xuICAgICAgcmV0dXJuIG1pbWVUeXBlO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmdldE1pbWVUeXBlRnJvbUZpbGVOYW1lKGZpbGVOYW1lKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkQmluYXJ5KHJlbW90ZVBhdGg6IHN0cmluZywgYmluYXJ5OiBBcnJheUJ1ZmZlciwgbWltZVR5cGU6IHN0cmluZykge1xuICAgIGF3YWl0IHRoaXMuZW5zdXJlUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlUGF0aCk7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIlBVVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBtaW1lVHlwZSxcbiAgICAgIH0sXG4gICAgICBib2R5OiBiaW5hcnksXG4gICAgfSk7XG5cbiAgICB0aGlzLmFzc2VydFJlc3BvbnNlU3VjY2VzcyhyZXNwb25zZSwgXCJVcGxvYWRcIik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUVkaXRvclBhc3RlKGV2dDogQ2xpcGJvYXJkRXZlbnQsIGVkaXRvcjogRWRpdG9yLCBpbmZvOiBNYXJrZG93blZpZXcgfCBNYXJrZG93bkZpbGVJbmZvKSB7XG4gICAgaWYgKGV2dC5kZWZhdWx0UHJldmVudGVkIHx8ICFpbmZvLmZpbGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbWFnZUZpbGUgPSB0aGlzLmV4dHJhY3RJbWFnZUZpbGVGcm9tQ2xpcGJvYXJkKGV2dCk7XG4gICAgaWYgKGltYWdlRmlsZSkge1xuICAgICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCBmaWxlTmFtZSA9IGltYWdlRmlsZS5uYW1lIHx8IHRoaXMuYnVpbGRDbGlwYm9hcmRGaWxlTmFtZShpbWFnZUZpbGUudHlwZSk7XG4gICAgICBhd2FpdCB0aGlzLnVwbG9hZFF1ZXVlLmVucXVldWVFZGl0b3JJbWFnZVVwbG9hZChpbmZvLmZpbGUsIGVkaXRvciwgaW1hZ2VGaWxlLCBmaWxlTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaHRtbCA9IGV2dC5jbGlwYm9hcmREYXRhPy5nZXREYXRhKFwidGV4dC9odG1sXCIpPy50cmltKCkgPz8gXCJcIjtcbiAgICBpZiAoIWh0bWwgfHwgIXRoaXMuaHRtbENvbnRhaW5zUmVtb3RlSW1hZ2VzKGh0bWwpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgYXdhaXQgdGhpcy5oYW5kbGVIdG1sUGFzdGVXaXRoUmVtb3RlSW1hZ2VzKGluZm8uZmlsZSwgZWRpdG9yLCBodG1sKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlRWRpdG9yRHJvcChldnQ6IERyYWdFdmVudCwgZWRpdG9yOiBFZGl0b3IsIGluZm86IE1hcmtkb3duVmlldyB8IE1hcmtkb3duRmlsZUluZm8pIHtcbiAgICBpZiAoZXZ0LmRlZmF1bHRQcmV2ZW50ZWQgfHwgIWluZm8uZmlsZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGltYWdlRmlsZSA9IHRoaXMuZXh0cmFjdEltYWdlRmlsZUZyb21Ecm9wKGV2dCk7XG4gICAgaWYgKCFpbWFnZUZpbGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICBjb25zdCBmaWxlTmFtZSA9IGltYWdlRmlsZS5uYW1lIHx8IHRoaXMuYnVpbGRDbGlwYm9hcmRGaWxlTmFtZShpbWFnZUZpbGUudHlwZSk7XG4gICAgYXdhaXQgdGhpcy51cGxvYWRRdWV1ZS5lbnF1ZXVlRWRpdG9ySW1hZ2VVcGxvYWQoaW5mby5maWxlLCBlZGl0b3IsIGltYWdlRmlsZSwgZmlsZU5hbWUpO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRyYWN0SW1hZ2VGaWxlRnJvbUNsaXBib2FyZChldnQ6IENsaXBib2FyZEV2ZW50KSB7XG4gICAgY29uc3QgZGlyZWN0ID0gQXJyYXkuZnJvbShldnQuY2xpcGJvYXJkRGF0YT8uZmlsZXMgPz8gW10pLmZpbmQoKGZpbGUpID0+IGZpbGUudHlwZS5zdGFydHNXaXRoKFwiaW1hZ2UvXCIpKTtcbiAgICBpZiAoZGlyZWN0KSB7XG4gICAgICByZXR1cm4gZGlyZWN0O1xuICAgIH1cblxuICAgIGNvbnN0IGl0ZW0gPSBBcnJheS5mcm9tKGV2dC5jbGlwYm9hcmREYXRhPy5pdGVtcyA/PyBbXSkuZmluZCgoZW50cnkpID0+IGVudHJ5LnR5cGUuc3RhcnRzV2l0aChcImltYWdlL1wiKSk7XG4gICAgcmV0dXJuIGl0ZW0/LmdldEFzRmlsZSgpID8/IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGh0bWxDb250YWluc1JlbW90ZUltYWdlcyhodG1sOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gLzxpbWdcXGJbXj5dKnNyYz1bXCInXWh0dHBzPzpcXC9cXC9bXlwiJ10rW1wiJ11bXj5dKj4vaS50ZXN0KGh0bWwpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVIdG1sUGFzdGVXaXRoUmVtb3RlSW1hZ2VzKG5vdGVGaWxlOiBURmlsZSwgZWRpdG9yOiBFZGl0b3IsIGh0bWw6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZW5kZXJlZCA9IGF3YWl0IHRoaXMuY29udmVydEh0bWxDbGlwYm9hcmRUb1NlY3VyZU1hcmtkb3duKGh0bWwsIG5vdGVGaWxlKTtcbiAgICAgIGlmICghcmVuZGVyZWQudHJpbSgpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgZWRpdG9yLnJlcGxhY2VTZWxlY3Rpb24ocmVuZGVyZWQpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdTVERjJcdTVDMDZcdTdGNTFcdTk4NzVcdTU2RkVcdTY1ODdcdTdDOThcdThEMzRcdTVFNzZcdTYyOTNcdTUzRDZcdThGRENcdTdBMEJcdTU2RkVcdTcyNDdcdTMwMDJcIiwgXCJQYXN0ZWQgd2ViIGNvbnRlbnQgYW5kIGNhcHR1cmVkIHJlbW90ZSBpbWFnZXMuXCIpKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBwYXN0ZSBIVE1MIGNvbnRlbnQgd2l0aCByZW1vdGUgaW1hZ2VzXCIsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgIHRoaXMuZGVzY3JpYmVFcnJvcihcbiAgICAgICAgICB0aGlzLnQoXCJcdTU5MDRcdTc0MDZcdTdGNTFcdTk4NzVcdTU2RkVcdTY1ODdcdTdDOThcdThEMzRcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gcHJvY2VzcyBwYXN0ZWQgd2ViIGNvbnRlbnRcIiksXG4gICAgICAgICAgZXJyb3IsXG4gICAgICAgICksXG4gICAgICAgIDgwMDAsXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY29udmVydEh0bWxDbGlwYm9hcmRUb1NlY3VyZU1hcmtkb3duKGh0bWw6IHN0cmluZywgbm90ZUZpbGU6IFRGaWxlKSB7XG4gICAgY29uc3QgcGFyc2VyID0gbmV3IERPTVBhcnNlcigpO1xuICAgIGNvbnN0IGRvY3VtZW50ID0gcGFyc2VyLnBhcnNlRnJvbVN0cmluZyhodG1sLCBcInRleHQvaHRtbFwiKTtcbiAgICBjb25zdCB1cGxvYWRDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgY29uc3QgcmVuZGVyZWRCbG9ja3M6IHN0cmluZ1tdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IG5vZGUgb2YgQXJyYXkuZnJvbShkb2N1bWVudC5ib2R5LmNoaWxkTm9kZXMpKSB7XG4gICAgICBjb25zdCBibG9jayA9IGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbE5vZGUobm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCAwKTtcbiAgICAgIGlmIChibG9jay50cmltKCkpIHtcbiAgICAgICAgcmVuZGVyZWRCbG9ja3MucHVzaChibG9jay50cmltKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZW5kZXJlZEJsb2Nrcy5qb2luKFwiXFxuXFxuXCIpICsgXCJcXG5cIjtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVuZGVyUGFzdGVkSHRtbE5vZGUoXG4gICAgbm9kZTogTm9kZSxcbiAgICBub3RlRmlsZTogVEZpbGUsXG4gICAgdXBsb2FkQ2FjaGU6IE1hcDxzdHJpbmcsIHN0cmluZz4sXG4gICAgbGlzdERlcHRoOiBudW1iZXIsXG4gICk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKSB7XG4gICAgICByZXR1cm4gdGhpcy5ub3JtYWxpemVDbGlwYm9hcmRUZXh0KG5vZGUudGV4dENvbnRlbnQgPz8gXCJcIik7XG4gICAgfVxuXG4gICAgaWYgKCEobm9kZSBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSkge1xuICAgICAgcmV0dXJuIFwiXCI7XG4gICAgfVxuXG4gICAgY29uc3QgdGFnID0gbm9kZS50YWdOYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKHRhZyA9PT0gXCJpbWdcIikge1xuICAgICAgY29uc3Qgc3JjID0gdGhpcy51bmVzY2FwZUh0bWwobm9kZS5nZXRBdHRyaWJ1dGUoXCJzcmNcIik/LnRyaW0oKSA/PyBcIlwiKTtcbiAgICAgIGlmICghdGhpcy5pc0h0dHBVcmwoc3JjKSkge1xuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgYWx0ID0gKG5vZGUuZ2V0QXR0cmlidXRlKFwiYWx0XCIpID8/IFwiXCIpLnRyaW0oKSB8fCB0aGlzLmdldERpc3BsYXlOYW1lRnJvbVVybChzcmMpO1xuICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRSZW1vdGVJbWFnZVVybChzcmMsIHVwbG9hZENhY2hlKTtcbiAgICAgIHJldHVybiB0aGlzLmltYWdlU3VwcG9ydC5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgYWx0KTtcbiAgICB9XG5cbiAgICBpZiAodGFnID09PSBcImJyXCIpIHtcbiAgICAgIHJldHVybiBcIlxcblwiO1xuICAgIH1cblxuICAgIGlmICh0YWcgPT09IFwidWxcIiB8fCB0YWcgPT09IFwib2xcIikge1xuICAgICAgY29uc3QgaXRlbXM6IHN0cmluZ1tdID0gW107XG4gICAgICBsZXQgaW5kZXggPSAxO1xuICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKG5vZGUuY2hpbGRyZW4pKSB7XG4gICAgICAgIGlmIChjaGlsZC50YWdOYW1lLnRvTG93ZXJDYXNlKCkgIT09IFwibGlcIikge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVuZGVyZWQgPSAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sTm9kZShjaGlsZCwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGggKyAxKSkudHJpbSgpO1xuICAgICAgICBpZiAoIXJlbmRlcmVkKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwcmVmaXggPSB0YWcgPT09IFwib2xcIiA/IGAke2luZGV4fS4gYCA6IFwiLSBcIjtcbiAgICAgICAgaXRlbXMucHVzaChgJHtcIiAgXCIucmVwZWF0KE1hdGgubWF4KDAsIGxpc3REZXB0aCkpfSR7cHJlZml4fSR7cmVuZGVyZWR9YCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBpdGVtcy5qb2luKFwiXFxuXCIpO1xuICAgIH1cblxuICAgIGlmICh0YWcgPT09IFwibGlcIikge1xuICAgICAgY29uc3QgcGFydHMgPSBhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCk7XG4gICAgICByZXR1cm4gcGFydHMuam9pbihcIlwiKS50cmltKCk7XG4gICAgfVxuXG4gICAgaWYgKC9eaFsxLTZdJC8udGVzdCh0YWcpKSB7XG4gICAgICBjb25zdCBsZXZlbCA9IE51bWJlci5wYXJzZUludCh0YWdbMV0sIDEwKTtcbiAgICAgIGNvbnN0IHRleHQgPSAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpLnRyaW0oKTtcbiAgICAgIHJldHVybiB0ZXh0ID8gYCR7XCIjXCIucmVwZWF0KGxldmVsKX0gJHt0ZXh0fWAgOiBcIlwiO1xuICAgIH1cblxuICAgIGlmICh0YWcgPT09IFwiYVwiKSB7XG4gICAgICBjb25zdCBocmVmID0gbm9kZS5nZXRBdHRyaWJ1dGUoXCJocmVmXCIpPy50cmltKCkgPz8gXCJcIjtcbiAgICAgIGNvbnN0IHRleHQgPSAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpLnRyaW0oKTtcbiAgICAgIGlmIChocmVmICYmIC9eaHR0cHM/OlxcL1xcLy9pLnRlc3QoaHJlZikgJiYgdGV4dCkge1xuICAgICAgICByZXR1cm4gYFske3RleHR9XSgke2hyZWZ9KWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGV4dDtcbiAgICB9XG5cbiAgICBjb25zdCBpbmxpbmVUYWdzID0gbmV3IFNldChbXCJzdHJvbmdcIiwgXCJiXCIsIFwiZW1cIiwgXCJpXCIsIFwic3BhblwiLCBcImNvZGVcIiwgXCJzbWFsbFwiLCBcInN1cFwiLCBcInN1YlwiXSk7XG4gICAgaWYgKGlubGluZVRhZ3MuaGFzKHRhZykpIHtcbiAgICAgIHJldHVybiAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IGJsb2NrVGFncyA9IG5ldyBTZXQoW1xuICAgICAgXCJwXCIsXG4gICAgICBcImRpdlwiLFxuICAgICAgXCJhcnRpY2xlXCIsXG4gICAgICBcInNlY3Rpb25cIixcbiAgICAgIFwiZmlndXJlXCIsXG4gICAgICBcImZpZ2NhcHRpb25cIixcbiAgICAgIFwiYmxvY2txdW90ZVwiLFxuICAgICAgXCJwcmVcIixcbiAgICAgIFwidGFibGVcIixcbiAgICAgIFwidGhlYWRcIixcbiAgICAgIFwidGJvZHlcIixcbiAgICAgIFwidHJcIixcbiAgICAgIFwidGRcIixcbiAgICAgIFwidGhcIixcbiAgICBdKTtcbiAgICBpZiAoYmxvY2tUYWdzLmhhcyh0YWcpKSB7XG4gICAgICBjb25zdCB0ZXh0ID0gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKSkuam9pbihcIlwiKS50cmltKCk7XG4gICAgICByZXR1cm4gdGV4dDtcbiAgICB9XG5cbiAgICByZXR1cm4gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKSkuam9pbihcIlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKFxuICAgIGVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuICAgIG5vdGVGaWxlOiBURmlsZSxcbiAgICB1cGxvYWRDYWNoZTogTWFwPHN0cmluZywgc3RyaW5nPixcbiAgICBsaXN0RGVwdGg6IG51bWJlcixcbiAgKSB7XG4gICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKGVsZW1lbnQuY2hpbGROb2RlcykpIHtcbiAgICAgIGNvbnN0IHJlbmRlcmVkID0gYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sTm9kZShjaGlsZCwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpO1xuICAgICAgaWYgKCFyZW5kZXJlZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDAgJiYgIXJlbmRlcmVkLnN0YXJ0c1dpdGgoXCJcXG5cIikgJiYgIXBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdLmVuZHNXaXRoKFwiXFxuXCIpKSB7XG4gICAgICAgIGNvbnN0IHByZXZpb3VzID0gcGFydHNbcGFydHMubGVuZ3RoIC0gMV07XG4gICAgICAgIGNvbnN0IG5lZWRzU3BhY2UgPSAvXFxTJC8udGVzdChwcmV2aW91cykgJiYgL15cXFMvLnRlc3QocmVuZGVyZWQpO1xuICAgICAgICBpZiAobmVlZHNTcGFjZSkge1xuICAgICAgICAgIHBhcnRzLnB1c2goXCIgXCIpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHBhcnRzLnB1c2gocmVuZGVyZWQpO1xuICAgIH1cblxuICAgIHJldHVybiBwYXJ0cztcbiAgfVxuXG4gIHByaXZhdGUgbm9ybWFsaXplQ2xpcGJvYXJkVGV4dCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1xccysvZywgXCIgXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRyYWN0SW1hZ2VGaWxlRnJvbURyb3AoZXZ0OiBEcmFnRXZlbnQpIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShldnQuZGF0YVRyYW5zZmVyPy5maWxlcyA/PyBbXSkuZmluZCgoZmlsZSkgPT4gZmlsZS50eXBlLnN0YXJ0c1dpdGgoXCJpbWFnZS9cIikpID8/IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGVucXVldWVFZGl0b3JJbWFnZVVwbG9hZChub3RlRmlsZTogVEZpbGUsIGVkaXRvcjogRWRpdG9yLCBpbWFnZUZpbGU6IEZpbGUsIGZpbGVOYW1lOiBzdHJpbmcpIHtcblxuICAgIGF3YWl0IHRoaXMudXBsb2FkUXVldWUuZW5xdWV1ZUVkaXRvckltYWdlVXBsb2FkKG5vdGVGaWxlLCBlZGl0b3IsIGltYWdlRmlsZSwgZmlsZU5hbWUpO1xuICB9XG5cbiAgYXN5bmMgc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQoc2hvd05vdGljZSA9IHRydWUpIHtcbiAgICBpZiAodGhpcy5zeW5jSW5Qcm9ncmVzcykge1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdTU0MENcdTZCNjVcdTZCNjNcdTU3MjhcdThGREJcdTg4NENcdTRFMkRcdTMwMDJcIiwgXCJBIHN5bmMgaXMgYWxyZWFkeSBpbiBwcm9ncmVzcy5cIiksIDQwMDApO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuc3luY0luUHJvZ3Jlc3MgPSB0cnVlO1xuICAgIHRyeSB7XG4gICAgICB0aGlzLmVuc3VyZUNvbmZpZ3VyZWQoKTtcbiAgICAgIGF3YWl0IHRoaXMud2FpdEZvclBlbmRpbmdWYXVsdE11dGF0aW9ucygpO1xuICAgICAgY29uc3QgdXBsb2Fkc1JlYWR5ID0gYXdhaXQgdGhpcy5wcmVwYXJlUGVuZGluZ1VwbG9hZHNGb3JTeW5jKHNob3dOb3RpY2UpO1xuICAgICAgaWYgKCF1cGxvYWRzUmVhZHkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgYXdhaXQgdGhpcy5yZWJ1aWxkUmVmZXJlbmNlSW5kZXgoKTtcblxuICAgICAgY29uc3QgcmVtb3RlSW52ZW50b3J5ID0gYXdhaXQgdGhpcy5saXN0UmVtb3RlVHJlZSh0aGlzLnNldHRpbmdzLnZhdWx0U3luY1JlbW90ZUZvbGRlcik7XG4gICAgICBjb25zdCBkZWxldGlvblRvbWJzdG9uZXMgPSBhd2FpdCB0aGlzLnJlYWREZWxldGlvblRvbWJzdG9uZXMoKTtcbiAgICAgIGNvbnN0IHJlbW90ZUZpbGVzID0gcmVtb3RlSW52ZW50b3J5LmZpbGVzO1xuICAgICAgY29uc3QgY291bnRzID0ge1xuICAgICAgICB1cGxvYWRlZDogMCwgcmVzdG9yZWRGcm9tUmVtb3RlOiAwLCBkb3dubG9hZGVkT3JVcGRhdGVkOiAwLCBza2lwcGVkOiAwLFxuICAgICAgICBkZWxldGVkUmVtb3RlRmlsZXM6IDAsIGRlbGV0ZWRMb2NhbEZpbGVzOiAwLCBkZWxldGVkTG9jYWxTdHViczogMCxcbiAgICAgICAgbWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzOiAwLCBwdXJnZWRNaXNzaW5nTGF6eU5vdGVzOiAwLFxuICAgICAgICBkZWxldGVkUmVtb3RlRGlyZWN0b3JpZXM6IDAsIGNyZWF0ZWRSZW1vdGVEaXJlY3RvcmllczogMCxcbiAgICAgICAgZGVsZXRlZExvY2FsRGlyZWN0b3JpZXM6IDAsIGNyZWF0ZWRMb2NhbERpcmVjdG9yaWVzOiAwLFxuICAgICAgICBldmljdGVkTm90ZXM6IDAsXG4gICAgICB9O1xuXG4gICAgICBhd2FpdCB0aGlzLnJlY29uY2lsZU9ycGhhbmVkU3luY0VudHJpZXMocmVtb3RlRmlsZXMsIGRlbGV0aW9uVG9tYnN0b25lcywgY291bnRzKTtcbiAgICAgIGF3YWl0IHRoaXMucmVjb25jaWxlUmVtb3RlT25seUZpbGVzKHJlbW90ZUZpbGVzLCBkZWxldGlvblRvbWJzdG9uZXMsIGNvdW50cyk7XG4gICAgICBhd2FpdCB0aGlzLnJlY29uY2lsZUxvY2FsRmlsZXMocmVtb3RlRmlsZXMsIGRlbGV0aW9uVG9tYnN0b25lcywgY291bnRzKTtcblxuICAgICAgY29uc3QgZGlyU3RhdHMgPSBhd2FpdCB0aGlzLnJlY29uY2lsZURpcmVjdG9yaWVzKHJlbW90ZUludmVudG9yeS5kaXJlY3Rvcmllcyk7XG4gICAgICBjb3VudHMuZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzID0gZGlyU3RhdHMuZGVsZXRlZFJlbW90ZTtcbiAgICAgIGNvdW50cy5jcmVhdGVkUmVtb3RlRGlyZWN0b3JpZXMgPSBkaXJTdGF0cy5jcmVhdGVkUmVtb3RlO1xuICAgICAgY291bnRzLmRlbGV0ZWRMb2NhbERpcmVjdG9yaWVzID0gZGlyU3RhdHMuZGVsZXRlZExvY2FsO1xuICAgICAgY291bnRzLmNyZWF0ZWRMb2NhbERpcmVjdG9yaWVzID0gZGlyU3RhdHMuY3JlYXRlZExvY2FsO1xuICAgICAgYXdhaXQgdGhpcy5yZWNvbmNpbGVSZW1vdGVJbWFnZXMoKTtcbiAgICAgIGNvdW50cy5ldmljdGVkTm90ZXMgPSBhd2FpdCB0aGlzLmV2aWN0U3RhbGVTeW5jZWROb3RlcyhmYWxzZSk7XG5cbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gRGF0ZS5ub3coKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9IHRoaXMudChcbiAgICAgICAgYFx1NURGMlx1NTNDQ1x1NTQxMVx1NTQwQ1x1NkI2NVx1RkYxQVx1NEUwQVx1NEYyMCAke2NvdW50cy51cGxvYWRlZH0gXHU0RTJBXHU2NTg3XHU0RUY2XHVGRjBDXHU0RUNFXHU4RkRDXHU3QUVGXHU2MkM5XHU1M0Q2ICR7Y291bnRzLnJlc3RvcmVkRnJvbVJlbW90ZSArIGNvdW50cy5kb3dubG9hZGVkT3JVcGRhdGVkfSBcdTRFMkFcdTY1ODdcdTRFRjZcdUZGMENcdThERjNcdThGQzcgJHtjb3VudHMuc2tpcHBlZH0gXHU0RTJBXHU2NzJBXHU1M0Q4XHU1MzE2XHU2NTg3XHU0RUY2XHVGRjBDXHU1MjIwXHU5NjY0XHU4RkRDXHU3QUVGXHU1MTg1XHU1QkI5ICR7Y291bnRzLmRlbGV0ZWRSZW1vdGVGaWxlc30gXHU0RTJBXHUzMDAxXHU2NzJDXHU1NzMwXHU1MTg1XHU1QkI5ICR7Y291bnRzLmRlbGV0ZWRMb2NhbEZpbGVzfSBcdTRFMkEke2NvdW50cy5kZWxldGVkTG9jYWxTdHVicyA+IDAgPyBgXHVGRjA4XHU1MTc2XHU0RTJEXHU1OTMxXHU2NTQ4XHU1MzYwXHU0RjREXHU3QjE0XHU4QkIwICR7Y291bnRzLmRlbGV0ZWRMb2NhbFN0dWJzfSBcdTdCQzdcdUZGMDlgIDogXCJcIn1cdUZGMEMke2NvdW50cy5kZWxldGVkUmVtb3RlRGlyZWN0b3JpZXMgPiAwIHx8IGNvdW50cy5jcmVhdGVkUmVtb3RlRGlyZWN0b3JpZXMgPiAwID8gYFx1NTIyMFx1OTY2NFx1OEZEQ1x1N0FFRlx1NzZFRVx1NUY1NSAke2NvdW50cy5kZWxldGVkUmVtb3RlRGlyZWN0b3JpZXN9IFx1NEUyQVx1MzAwMVx1NTIxQlx1NUVGQVx1OEZEQ1x1N0FFRlx1NzZFRVx1NUY1NSAke2NvdW50cy5jcmVhdGVkUmVtb3RlRGlyZWN0b3JpZXN9IFx1NEUyQVx1MzAwMWAgOiBcIlwifSR7Y291bnRzLmRlbGV0ZWRMb2NhbERpcmVjdG9yaWVzID4gMCB8fCBjb3VudHMuY3JlYXRlZExvY2FsRGlyZWN0b3JpZXMgPiAwID8gYFx1NTIyMFx1OTY2NFx1NjcyQ1x1NTczMFx1NzZFRVx1NUY1NSAke2NvdW50cy5kZWxldGVkTG9jYWxEaXJlY3Rvcmllc30gXHU0RTJBXHUzMDAxXHU1MjFCXHU1RUZBXHU2NzJDXHU1NzMwXHU3NkVFXHU1RjU1ICR7Y291bnRzLmNyZWF0ZWRMb2NhbERpcmVjdG9yaWVzfSBcdTRFMkFcdTMwMDFgIDogXCJcIn0ke2NvdW50cy5ldmljdGVkTm90ZXMgPiAwID8gYFx1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1NjVFN1x1N0IxNFx1OEJCMCAke2NvdW50cy5ldmljdGVkTm90ZXN9IFx1N0JDN1x1MzAwMWAgOiBcIlwifSR7Y291bnRzLm1pc3NpbmdSZW1vdGVCYWNrZWROb3RlcyA+IDAgPyBgXHU1M0QxXHU3M0IwICR7Y291bnRzLm1pc3NpbmdSZW1vdGVCYWNrZWROb3Rlc30gXHU3QkM3XHU2MzA5XHU5NzAwXHU3QjE0XHU4QkIwXHU3RjNBXHU1QzExXHU4RkRDXHU3QUVGXHU2QjYzXHU2NTg3XHUzMDAxYCA6IFwiXCJ9JHtjb3VudHMucHVyZ2VkTWlzc2luZ0xhenlOb3RlcyA+IDAgPyBgXHU3ODZFXHU4QkE0XHU2RTA1XHU3NDA2XHU1OTMxXHU2NTQ4XHU1MzYwXHU0RjREXHU3QjE0XHU4QkIwICR7Y291bnRzLnB1cmdlZE1pc3NpbmdMYXp5Tm90ZXN9IFx1N0JDN1x1MzAwMWAgOiBcIlwifVx1MzAwMmAucmVwbGFjZSgvXHUzMDAxXHUzMDAyLywgXCJcdTMwMDJcIiksXG4gICAgICAgIGBCaWRpcmVjdGlvbmFsIHN5bmMgdXBsb2FkZWQgJHtjb3VudHMudXBsb2FkZWR9IGZpbGUocyksIHB1bGxlZCAke2NvdW50cy5yZXN0b3JlZEZyb21SZW1vdGUgKyBjb3VudHMuZG93bmxvYWRlZE9yVXBkYXRlZH0gZmlsZShzKSBmcm9tIHJlbW90ZSwgc2tpcHBlZCAke2NvdW50cy5za2lwcGVkfSB1bmNoYW5nZWQgZmlsZShzKSwgZGVsZXRlZCAke2NvdW50cy5kZWxldGVkUmVtb3RlRmlsZXN9IHJlbW90ZSBjb250ZW50IGZpbGUocykgYW5kICR7Y291bnRzLmRlbGV0ZWRMb2NhbEZpbGVzfSBsb2NhbCBmaWxlKHMpJHtjb3VudHMuZGVsZXRlZExvY2FsU3R1YnMgPiAwID8gYCAoaW5jbHVkaW5nICR7Y291bnRzLmRlbGV0ZWRMb2NhbFN0dWJzfSBzdGFsZSBzdHViIG5vdGUocykpYCA6IFwiXCJ9JHtjb3VudHMuZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzID4gMCA/IGAsIGRlbGV0ZWQgJHtjb3VudHMuZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzfSByZW1vdGUgZGlyZWN0b3Ike2NvdW50cy5kZWxldGVkUmVtb3RlRGlyZWN0b3JpZXMgPT09IDEgPyBcInlcIiA6IFwiaWVzXCJ9YCA6IFwiXCJ9JHtjb3VudHMuY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzID4gMCA/IGAsIGNyZWF0ZWQgJHtjb3VudHMuY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzfSByZW1vdGUgZGlyZWN0b3Ike2NvdW50cy5jcmVhdGVkUmVtb3RlRGlyZWN0b3JpZXMgPT09IDEgPyBcInlcIiA6IFwiaWVzXCJ9YCA6IFwiXCJ9JHtjb3VudHMuZGVsZXRlZExvY2FsRGlyZWN0b3JpZXMgPiAwID8gYCwgZGVsZXRlZCAke2NvdW50cy5kZWxldGVkTG9jYWxEaXJlY3Rvcmllc30gbG9jYWwgZW1wdHkgZGlyZWN0b3Ike2NvdW50cy5kZWxldGVkTG9jYWxEaXJlY3RvcmllcyA9PT0gMSA/IFwieVwiIDogXCJpZXNcIn1gIDogXCJcIn0ke2NvdW50cy5jcmVhdGVkTG9jYWxEaXJlY3RvcmllcyA+IDAgPyBgLCBjcmVhdGVkICR7Y291bnRzLmNyZWF0ZWRMb2NhbERpcmVjdG9yaWVzfSBsb2NhbCBkaXJlY3RvciR7Y291bnRzLmNyZWF0ZWRMb2NhbERpcmVjdG9yaWVzID09PSAxID8gXCJ5XCIgOiBcImllc1wifWAgOiBcIlwifSR7Y291bnRzLmV2aWN0ZWROb3RlcyA+IDAgPyBgLCBhbmQgZXZpY3RlZCAke2NvdW50cy5ldmljdGVkTm90ZXN9IHN0YWxlIGxvY2FsIG5vdGUocylgIDogXCJcIn0ke2NvdW50cy5taXNzaW5nUmVtb3RlQmFja2VkTm90ZXMgPiAwID8gYCwgd2hpbGUgZGV0ZWN0aW5nICR7Y291bnRzLm1pc3NpbmdSZW1vdGVCYWNrZWROb3Rlc30gbGF6eSBub3RlKHMpIG1pc3NpbmcgdGhlaXIgcmVtb3RlIGNvbnRlbnRgIDogXCJcIn0ke2NvdW50cy5wdXJnZWRNaXNzaW5nTGF6eU5vdGVzID4gMCA/IGAsIGFuZCBwdXJnZWQgJHtjb3VudHMucHVyZ2VkTWlzc2luZ0xhenlOb3Rlc30gY29uZmlybWVkIGJyb2tlbiBsYXp5IHBsYWNlaG9sZGVyKHMpYCA6IFwiXCJ9LmAsXG4gICAgICApO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzLCA4MDAwKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIlZhdWx0IGNvbnRlbnQgc3luYyBmYWlsZWRcIiwgZXJyb3IpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1NTE4NVx1NUJCOVx1NTQwQ1x1NkI2NVx1NTkzMVx1OEQyNVwiLCBcIkNvbnRlbnQgc3luYyBmYWlsZWRcIiksIGVycm9yKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cywgODAwMCk7XG4gICAgICB9XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMuc3luY0luUHJvZ3Jlc3MgPSBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlY29uY2lsZU9ycGhhbmVkU3luY0VudHJpZXMoXG4gICAgcmVtb3RlRmlsZXM6IE1hcDxzdHJpbmcsIFJlbW90ZUZpbGVTdGF0ZT4sXG4gICAgZGVsZXRpb25Ub21ic3RvbmVzOiBNYXA8c3RyaW5nLCBEZWxldGlvblRvbWJzdG9uZT4sXG4gICAgY291bnRzOiB7IHVwbG9hZGVkOiBudW1iZXI7IHJlc3RvcmVkRnJvbVJlbW90ZTogbnVtYmVyOyBkb3dubG9hZGVkT3JVcGRhdGVkOiBudW1iZXI7IHNraXBwZWQ6IG51bWJlcjsgZGVsZXRlZFJlbW90ZUZpbGVzOiBudW1iZXI7IGRlbGV0ZWRMb2NhbEZpbGVzOiBudW1iZXI7IGRlbGV0ZWRMb2NhbFN0dWJzOiBudW1iZXI7IG1pc3NpbmdSZW1vdGVCYWNrZWROb3RlczogbnVtYmVyOyBwdXJnZWRNaXNzaW5nTGF6eU5vdGVzOiBudW1iZXIgfSxcbiAgKSB7XG4gICAgY29uc3QgZmlsZXMgPSB0aGlzLnN5bmNTdXBwb3J0LmNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpO1xuICAgIGNvbnN0IGN1cnJlbnRQYXRocyA9IG5ldyBTZXQoZmlsZXMubWFwKChmaWxlKSA9PiBmaWxlLnBhdGgpKTtcbiAgICBmb3IgKGNvbnN0IHBhdGggb2YgWy4uLnRoaXMuc3luY0luZGV4LmtleXMoKV0pIHtcbiAgICAgIGlmIChjdXJyZW50UGF0aHMuaGFzKHBhdGgpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKHBhdGgpKSB7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShwYXRoKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHByZXZpb3VzID0gdGhpcy5zeW5jSW5kZXguZ2V0KHBhdGgpO1xuICAgICAgaWYgKCFwcmV2aW91cykge1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUocGF0aCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZW1vdGUgPSByZW1vdGVGaWxlcy5nZXQocHJldmlvdXMucmVtb3RlUGF0aCk7XG4gICAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUocGF0aCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB0b21ic3RvbmUgPSBkZWxldGlvblRvbWJzdG9uZXMuZ2V0KHBhdGgpO1xuICAgICAgaWYgKHRvbWJzdG9uZSAmJiB0aGlzLnN5bmNTdXBwb3J0LmlzVG9tYnN0b25lQXV0aG9yaXRhdGl2ZSh0b21ic3RvbmUsIHJlbW90ZSkpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgIHJlbW90ZUZpbGVzLmRlbGV0ZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShwYXRoKTtcbiAgICAgICAgY291bnRzLmRlbGV0ZWRSZW1vdGVGaWxlcyArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRvbWJzdG9uZSkge1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKHBhdGgpO1xuICAgICAgICBkZWxldGlvblRvbWJzdG9uZXMuZGVsZXRlKHBhdGgpO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQocGF0aCwgcmVtb3RlKTtcbiAgICAgIHRoaXMuc3luY0luZGV4LnNldChwYXRoLCB7XG4gICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICByZW1vdGVTaWduYXR1cmU6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVBhdGg6IHJlbW90ZS5yZW1vdGVQYXRoLFxuICAgICAgfSk7XG4gICAgICBjb3VudHMucmVzdG9yZWRGcm9tUmVtb3RlICs9IDE7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWNvbmNpbGVSZW1vdGVPbmx5RmlsZXMoXG4gICAgcmVtb3RlRmlsZXM6IE1hcDxzdHJpbmcsIFJlbW90ZUZpbGVTdGF0ZT4sXG4gICAgZGVsZXRpb25Ub21ic3RvbmVzOiBNYXA8c3RyaW5nLCBEZWxldGlvblRvbWJzdG9uZT4sXG4gICAgY291bnRzOiB7IHVwbG9hZGVkOiBudW1iZXI7IHJlc3RvcmVkRnJvbVJlbW90ZTogbnVtYmVyOyBkb3dubG9hZGVkT3JVcGRhdGVkOiBudW1iZXI7IHNraXBwZWQ6IG51bWJlcjsgZGVsZXRlZFJlbW90ZUZpbGVzOiBudW1iZXI7IGRlbGV0ZWRMb2NhbEZpbGVzOiBudW1iZXI7IGRlbGV0ZWRMb2NhbFN0dWJzOiBudW1iZXI7IG1pc3NpbmdSZW1vdGVCYWNrZWROb3RlczogbnVtYmVyOyBwdXJnZWRNaXNzaW5nTGF6eU5vdGVzOiBudW1iZXIgfSxcbiAgKSB7XG4gICAgY29uc3QgZmlsZXMgPSB0aGlzLnN5bmNTdXBwb3J0LmNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpO1xuICAgIGNvbnN0IGN1cnJlbnRQYXRocyA9IG5ldyBTZXQoZmlsZXMubWFwKChmaWxlKSA9PiBmaWxlLnBhdGgpKTtcbiAgICBmb3IgKGNvbnN0IHJlbW90ZSBvZiBbLi4ucmVtb3RlRmlsZXMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEucmVtb3RlUGF0aC5sb2NhbGVDb21wYXJlKGIucmVtb3RlUGF0aCkpKSB7XG4gICAgICBjb25zdCB2YXVsdFBhdGggPSB0aGlzLnN5bmNTdXBwb3J0LnJlbW90ZVBhdGhUb1ZhdWx0UGF0aChyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICBpZiAoIXZhdWx0UGF0aCB8fCBjdXJyZW50UGF0aHMuaGFzKHZhdWx0UGF0aCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgodmF1bHRQYXRoKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldCh2YXVsdFBhdGgpO1xuICAgICAgaWYgKHRvbWJzdG9uZSkge1xuICAgICAgICBpZiAodGhpcy5zeW5jU3VwcG9ydC5pc1RvbWJzdG9uZUF1dGhvcml0YXRpdmUodG9tYnN0b25lLCByZW1vdGUpKSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgICAgcmVtb3RlRmlsZXMuZGVsZXRlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICBjb3VudHMuZGVsZXRlZFJlbW90ZUZpbGVzICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKHZhdWx0UGF0aCk7XG4gICAgICAgIGRlbGV0aW9uVG9tYnN0b25lcy5kZWxldGUodmF1bHRQYXRoKTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KHZhdWx0UGF0aCwgcmVtb3RlKTtcbiAgICAgIHRoaXMuc3luY0luZGV4LnNldCh2YXVsdFBhdGgsIHtcbiAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlUGF0aDogcmVtb3RlLnJlbW90ZVBhdGgsXG4gICAgICB9KTtcbiAgICAgIGNvdW50cy5yZXN0b3JlZEZyb21SZW1vdGUgKz0gMTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlY29uY2lsZUxvY2FsRmlsZXMoXG4gICAgcmVtb3RlRmlsZXM6IE1hcDxzdHJpbmcsIFJlbW90ZUZpbGVTdGF0ZT4sXG4gICAgZGVsZXRpb25Ub21ic3RvbmVzOiBNYXA8c3RyaW5nLCBEZWxldGlvblRvbWJzdG9uZT4sXG4gICAgY291bnRzOiB7IHVwbG9hZGVkOiBudW1iZXI7IHJlc3RvcmVkRnJvbVJlbW90ZTogbnVtYmVyOyBkb3dubG9hZGVkT3JVcGRhdGVkOiBudW1iZXI7IHNraXBwZWQ6IG51bWJlcjsgZGVsZXRlZFJlbW90ZUZpbGVzOiBudW1iZXI7IGRlbGV0ZWRMb2NhbEZpbGVzOiBudW1iZXI7IGRlbGV0ZWRMb2NhbFN0dWJzOiBudW1iZXI7IG1pc3NpbmdSZW1vdGVCYWNrZWROb3RlczogbnVtYmVyOyBwdXJnZWRNaXNzaW5nTGF6eU5vdGVzOiBudW1iZXIgfSxcbiAgKTogUHJvbWlzZTxTZXQ8c3RyaW5nPj4ge1xuICAgIGNvbnN0IGZpbGVzID0gdGhpcy5zeW5jU3VwcG9ydC5jb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKTtcbiAgICBjb25zdCBsb2NhbFJlbW90ZVBhdGhzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbiAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aChmaWxlLnBhdGgpO1xuICAgICAgbG9jYWxSZW1vdGVQYXRocy5hZGQocmVtb3RlUGF0aCk7XG4gICAgICBjb25zdCByZW1vdGUgPSByZW1vdGVGaWxlcy5nZXQocmVtb3RlUGF0aCk7XG4gICAgICBjb25zdCByZW1vdGVTaWduYXR1cmUgPSByZW1vdGU/LnNpZ25hdHVyZSA/PyBcIlwiO1xuICAgICAgY29uc3QgcHJldmlvdXMgPSB0aGlzLnN5bmNJbmRleC5nZXQoZmlsZS5wYXRoKTtcbiAgICAgIGNvbnN0IG1hcmtkb3duQ29udGVudCA9IGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIgPyBhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSkgOiBudWxsO1xuICAgICAgY29uc3QgbG9jYWxTaWduYXR1cmUgPSBhd2FpdCB0aGlzLmJ1aWxkQ3VycmVudExvY2FsU2lnbmF0dXJlKGZpbGUsIG1hcmtkb3duQ29udGVudCA/PyB1bmRlZmluZWQpO1xuXG4gICAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgICBjb25zdCBzdHViID0gdGhpcy5wYXJzZU5vdGVTdHViKG1hcmtkb3duQ29udGVudCA/PyBcIlwiKTtcbiAgICAgICAgaWYgKHN0dWIpIHtcbiAgICAgICAgICBjb25zdCBzdHViUmVtb3RlID0gcmVtb3RlRmlsZXMuZ2V0KHN0dWIucmVtb3RlUGF0aCk7XG4gICAgICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldChmaWxlLnBhdGgpO1xuICAgICAgICAgIGNvbnN0IHJlc29sdXRpb24gPSBhd2FpdCB0aGlzLnJlc29sdmVMYXp5Tm90ZVN0dWIoZmlsZSwgc3R1Yiwgc3R1YlJlbW90ZSwgdG9tYnN0b25lKTtcbiAgICAgICAgICBpZiAocmVzb2x1dGlvbi5hY3Rpb24gPT09IFwiZGVsZXRlZFwiKSB7XG4gICAgICAgICAgICBjb3VudHMuZGVsZXRlZExvY2FsRmlsZXMgKz0gMTtcbiAgICAgICAgICAgIGNvdW50cy5kZWxldGVkTG9jYWxTdHVicyArPSAxO1xuICAgICAgICAgICAgaWYgKHJlc29sdXRpb24ucHVyZ2VkTWlzc2luZykge1xuICAgICAgICAgICAgICBjb3VudHMucHVyZ2VkTWlzc2luZ0xhenlOb3RlcyArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChyZXNvbHV0aW9uLmFjdGlvbiA9PT0gXCJtaXNzaW5nXCIpIHtcbiAgICAgICAgICAgIGNvdW50cy5taXNzaW5nUmVtb3RlQmFja2VkTm90ZXMgKz0gMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHN0dWJSZW1vdGU/LnNpZ25hdHVyZSA/PyBwcmV2aW91cz8ucmVtb3RlU2lnbmF0dXJlID8/IFwiXCIsXG4gICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGNvdW50cy5za2lwcGVkICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldChmaWxlLnBhdGgpO1xuICAgICAgY29uc3QgdW5jaGFuZ2VkU2luY2VMYXN0U3luYyA9IHByZXZpb3VzID8gcHJldmlvdXMubG9jYWxTaWduYXR1cmUgPT09IGxvY2FsU2lnbmF0dXJlIDogZmFsc2U7XG4gICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB1bmNoYW5nZWRTaW5jZUxhc3RTeW5jICYmXG4gICAgICAgICAgdGhpcy5zeW5jU3VwcG9ydC5zaG91bGREZWxldGVMb2NhbEZyb21Ub21ic3RvbmUoZmlsZSwgdG9tYnN0b25lKSAmJlxuICAgICAgICAgIHRoaXMuc3luY1N1cHBvcnQuaXNUb21ic3RvbmVBdXRob3JpdGF0aXZlKHRvbWJzdG9uZSwgcmVtb3RlKVxuICAgICAgICApIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLnJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGUpO1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgICAgIGNvdW50cy5kZWxldGVkTG9jYWxGaWxlcyArPSAxO1xuICAgICAgICAgIGlmIChyZW1vdGUpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlQ29udGVudEZpbGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICAgICAgcmVtb3RlRmlsZXMuZGVsZXRlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICAgIGNvdW50cy5kZWxldGVkUmVtb3RlRmlsZXMgKz0gMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCk7XG4gICAgICAgIGRlbGV0aW9uVG9tYnN0b25lcy5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCwgbWFya2Rvd25Db250ZW50ID8/IHVuZGVmaW5lZCk7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICB9KTtcbiAgICAgICAgcmVtb3RlRmlsZXMuc2V0KHJlbW90ZVBhdGgsIHVwbG9hZGVkUmVtb3RlKTtcbiAgICAgICAgY291bnRzLnVwbG9hZGVkICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXByZXZpb3VzKSB7XG4gICAgICAgIGlmIChsb2NhbFNpZ25hdHVyZSA9PT0gcmVtb3RlU2lnbmF0dXJlKSB7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwgeyBsb2NhbFNpZ25hdHVyZSwgcmVtb3RlU2lnbmF0dXJlLCByZW1vdGVQYXRoIH0pO1xuICAgICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgICBjb3VudHMuc2tpcHBlZCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuc3luY1N1cHBvcnQuc2hvdWxkRG93bmxvYWRSZW1vdGVWZXJzaW9uKGZpbGUuc3RhdC5tdGltZSwgcmVtb3RlLmxhc3RNb2RpZmllZCkpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgICAgICAgIGNvbnN0IHJlZnJlc2hlZCA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUocmVmcmVzaGVkKSA6IHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgY291bnRzLmRvd25sb2FkZWRPclVwZGF0ZWQgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHVwbG9hZGVkUmVtb3RlID0gYXdhaXQgdGhpcy51cGxvYWRDb250ZW50RmlsZVRvUmVtb3RlKGZpbGUsIHJlbW90ZVBhdGgsIG1hcmtkb3duQ29udGVudCA/PyB1bmRlZmluZWQpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiB1cGxvYWRlZFJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlbW90ZUZpbGVzLnNldChyZW1vdGVQYXRoLCB1cGxvYWRlZFJlbW90ZSk7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgY291bnRzLnVwbG9hZGVkICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBsb2NhbENoYW5nZWQgPSBwcmV2aW91cy5sb2NhbFNpZ25hdHVyZSAhPT0gbG9jYWxTaWduYXR1cmUgfHwgcHJldmlvdXMucmVtb3RlUGF0aCAhPT0gcmVtb3RlUGF0aDtcbiAgICAgIGNvbnN0IHJlbW90ZUNoYW5nZWQgPSBwcmV2aW91cy5yZW1vdGVTaWduYXR1cmUgIT09IHJlbW90ZVNpZ25hdHVyZSB8fCBwcmV2aW91cy5yZW1vdGVQYXRoICE9PSByZW1vdGVQYXRoO1xuICAgICAgaWYgKCFsb2NhbENoYW5nZWQgJiYgIXJlbW90ZUNoYW5nZWQpIHtcbiAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghbG9jYWxDaGFuZ2VkICYmIHJlbW90ZUNoYW5nZWQpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KGZpbGUucGF0aCwgcmVtb3RlLCBmaWxlKTtcbiAgICAgICAgY29uc3QgcmVmcmVzaGVkID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZWZyZXNoZWQgPyBhd2FpdCB0aGlzLmJ1aWxkQ3VycmVudExvY2FsU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICBjb3VudHMuZG93bmxvYWRlZE9yVXBkYXRlZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGxvY2FsQ2hhbmdlZCAmJiAhcmVtb3RlQ2hhbmdlZCkge1xuICAgICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoLCBtYXJrZG93bkNvbnRlbnQgPz8gdW5kZWZpbmVkKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICByZW1vdGVGaWxlcy5zZXQocmVtb3RlUGF0aCwgdXBsb2FkZWRSZW1vdGUpO1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCk7XG4gICAgICAgIGNvdW50cy51cGxvYWRlZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuc3luY1N1cHBvcnQuc2hvdWxkRG93bmxvYWRSZW1vdGVWZXJzaW9uKGZpbGUuc3RhdC5tdGltZSwgcmVtb3RlLmxhc3RNb2RpZmllZCkpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KGZpbGUucGF0aCwgcmVtb3RlLCBmaWxlKTtcbiAgICAgICAgY29uc3QgcmVmcmVzaGVkID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZWZyZXNoZWQgPyBhd2FpdCB0aGlzLmJ1aWxkQ3VycmVudExvY2FsU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICBjb3VudHMuZG93bmxvYWRlZE9yVXBkYXRlZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCwgbWFya2Rvd25Db250ZW50ID8/IHVuZGVmaW5lZCk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIH0pO1xuICAgICAgcmVtb3RlRmlsZXMuc2V0KHJlbW90ZVBhdGgsIHVwbG9hZGVkUmVtb3RlKTtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgIGNvdW50cy51cGxvYWRlZCArPSAxO1xuICAgIH1cblxuICAgIHJldHVybiBsb2NhbFJlbW90ZVBhdGhzO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICAgIG1ldGhvZDogXCJERUxFVEVcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gNDA0ICYmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBERUxFVEUgZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGRlbGV0ZSByZW1vdGUgc3luY2VkIGNvbnRlbnRcIiwgcmVtb3RlUGF0aCwgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB3cml0ZURlbGV0aW9uVG9tYnN0b25lKHZhdWx0UGF0aDogc3RyaW5nLCByZW1vdGVTaWduYXR1cmU/OiBzdHJpbmcpIHtcbiAgICBjb25zdCBwYXlsb2FkOiBEZWxldGlvblRvbWJzdG9uZSA9IHtcbiAgICAgIHBhdGg6IHZhdWx0UGF0aCxcbiAgICAgIGRlbGV0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICAgIHJlbW90ZVNpZ25hdHVyZSxcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KFxuICAgICAgdGhpcy5zeW5jU3VwcG9ydC5idWlsZERlbGV0aW9uUmVtb3RlUGF0aCh2YXVsdFBhdGgpLFxuICAgICAgdGhpcy5lbmNvZGVVdGY4KEpTT04uc3RyaW5naWZ5KHBheWxvYWQpKSxcbiAgICAgIFwiYXBwbGljYXRpb24vanNvbjsgY2hhcnNldD11dGYtOFwiLFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlQ29udGVudEZpbGUodGhpcy5zeW5jU3VwcG9ydC5idWlsZERlbGV0aW9uUmVtb3RlUGF0aCh2YXVsdFBhdGgpKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIFRvbWJzdG9uZSBjbGVhbnVwIHNob3VsZCBub3QgYnJlYWsgdGhlIG1haW4gc3luYyBmbG93LlxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVhZERlbGV0aW9uVG9tYnN0b25lKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHRoaXMuc3luY1N1cHBvcnQuYnVpbGREZWxldGlvblJlbW90ZVBhdGgodmF1bHRQYXRoKSksXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gNDA0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgdGhpcy5hc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2UsIFwiR0VUIHRvbWJzdG9uZVwiKTtcblxuICAgIHJldHVybiB0aGlzLnN5bmNTdXBwb3J0LnBhcnNlRGVsZXRpb25Ub21ic3RvbmVQYXlsb2FkKHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlcikpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWFkRGVsZXRpb25Ub21ic3RvbmVzKCkge1xuICAgIGNvbnN0IHRvbWJzdG9uZXMgPSBuZXcgTWFwPHN0cmluZywgRGVsZXRpb25Ub21ic3RvbmU+KCk7XG4gICAgY29uc3QgaW52ZW50b3J5ID0gYXdhaXQgdGhpcy5saXN0UmVtb3RlVHJlZSh0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkRGVsZXRpb25Gb2xkZXIoKSk7XG4gICAgZm9yIChjb25zdCByZW1vdGUgb2YgaW52ZW50b3J5LmZpbGVzLnZhbHVlcygpKSB7XG4gICAgICBjb25zdCB2YXVsdFBhdGggPSB0aGlzLnN5bmNTdXBwb3J0LnJlbW90ZURlbGV0aW9uUGF0aFRvVmF1bHRQYXRoKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgIGlmICghdmF1bHRQYXRoKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGUucmVtb3RlUGF0aCksXG4gICAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9tYnN0b25lID0gdGhpcy5zeW5jU3VwcG9ydC5wYXJzZURlbGV0aW9uVG9tYnN0b25lUGF5bG9hZCh0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpKTtcbiAgICAgIGlmICh0b21ic3RvbmUpIHtcbiAgICAgICAgdG9tYnN0b25lcy5zZXQodmF1bHRQYXRoLCB0b21ic3RvbmUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0b21ic3RvbmVzO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRWYXVsdEZpbGVCeVBhdGgocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKTtcbiAgICByZXR1cm4gZmlsZSBpbnN0YW5jZW9mIFRGaWxlID8gZmlsZSA6IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGU6IFRGaWxlKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmRlbGV0ZShmaWxlLCB0cnVlKTtcbiAgICB9IGNhdGNoIChkZWxldGVFcnJvcikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQudHJhc2goZmlsZSwgdHJ1ZSk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgdGhyb3cgZGVsZXRlRXJyb3I7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBlbnN1cmVMb2NhbFBhcmVudEZvbGRlcnMocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVBhdGgocGF0aCk7XG4gICAgY29uc3Qgc2VnbWVudHMgPSBub3JtYWxpemVkLnNwbGl0KFwiL1wiKS5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPiAwKTtcbiAgICBpZiAoc2VnbWVudHMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgY3VycmVudCA9IFwiXCI7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHNlZ21lbnRzLmxlbmd0aCAtIDE7IGluZGV4ICs9IDEpIHtcbiAgICAgIGN1cnJlbnQgPSBjdXJyZW50ID8gYCR7Y3VycmVudH0vJHtzZWdtZW50c1tpbmRleF19YCA6IHNlZ21lbnRzW2luZGV4XTtcbiAgICAgIGlmICghKGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIuZXhpc3RzKGN1cnJlbnQpKSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIubWtkaXIoY3VycmVudCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBjb25zdCBtc2cgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSk7XG4gICAgICAgICAgaWYgKCFtc2cuaW5jbHVkZXMoXCJhbHJlYWR5IGV4aXN0c1wiKSkge1xuICAgICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQodmF1bHRQYXRoOiBzdHJpbmcsIHJlbW90ZTogUmVtb3RlRmlsZVN0YXRlLCBleGlzdGluZ0ZpbGU/OiBURmlsZSkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGUucmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHRoaXMuYXNzZXJ0UmVzcG9uc2VTdWNjZXNzKHJlc3BvbnNlLCBcIkdFVFwiKTtcblxuICAgIGF3YWl0IHRoaXMuZW5zdXJlTG9jYWxQYXJlbnRGb2xkZXJzKHZhdWx0UGF0aCk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgIG10aW1lOiByZW1vdGUubGFzdE1vZGlmaWVkID4gMCA/IHJlbW90ZS5sYXN0TW9kaWZpZWQgOiBEYXRlLm5vdygpLFxuICAgIH07XG4gICAgY29uc3QgaXNNZCA9IHZhdWx0UGF0aC50b0xvd2VyQ2FzZSgpLmVuZHNXaXRoKFwiLm1kXCIpO1xuICAgIGNvbnN0IGN1cnJlbnQgPVxuICAgICAgZXhpc3RpbmdGaWxlID8/IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKHZhdWx0UGF0aCkgPz8gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHZhdWx0UGF0aCk7XG4gICAgaWYgKGN1cnJlbnQgJiYgY3VycmVudCBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICBpZiAoY3VycmVudC5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoY3VycmVudCwgdGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKSwgb3B0aW9ucyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnlCaW5hcnkoY3VycmVudCwgcmVzcG9uc2UuYXJyYXlCdWZmZXIsIG9wdGlvbnMpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgaWYgKGlzTWQpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKHZhdWx0UGF0aCwgdGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKSwgb3B0aW9ucyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVCaW5hcnkodmF1bHRQYXRoLCByZXNwb25zZS5hcnJheUJ1ZmZlciwgb3B0aW9ucyk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc3QgbXNnID0gZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpO1xuICAgICAgaWYgKG1zZy5pbmNsdWRlcyhcImFscmVhZHkgZXhpc3RzXCIpKSB7XG4gICAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgodmF1bHRQYXRoKTtcbiAgICAgICAgaWYgKGZpbGUgJiYgZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICAgICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpLCBvcHRpb25zKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5QmluYXJ5KGZpbGUsIHJlc3BvbnNlLmFycmF5QnVmZmVyLCBvcHRpb25zKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdmVyaWZ5UmVtb3RlQmluYXJ5Um91bmRUcmlwKHJlbW90ZVBhdGg6IHN0cmluZywgZXhwZWN0ZWQ6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmFycmF5QnVmZmVyc0VxdWFsKGV4cGVjdGVkLCByZXNwb25zZS5hcnJheUJ1ZmZlcik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHN0YXRSZW1vdGVGaWxlKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJQUk9QRklORFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICBEZXB0aDogXCIwXCIsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gNDA0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgdGhpcy5hc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2UsIGBQUk9QRklORCBmb3IgJHtyZW1vdGVQYXRofWApO1xuXG4gICAgY29uc3QgeG1sVGV4dCA9IHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlcik7XG4gICAgY29uc3QgZW50cmllcyA9IHRoaXMucGFyc2VQcm9wZmluZERpcmVjdG9yeUxpc3RpbmcoeG1sVGV4dCwgcmVtb3RlUGF0aCwgdHJ1ZSk7XG4gICAgcmV0dXJuIGVudHJpZXMuZmluZCgoZW50cnkpID0+ICFlbnRyeS5pc0NvbGxlY3Rpb24pPy5maWxlID8/IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZTogVEZpbGUsIHJlbW90ZVBhdGg6IHN0cmluZywgbWFya2Rvd25Db250ZW50Pzogc3RyaW5nKSB7XG4gICAgbGV0IGJpbmFyeTogQXJyYXlCdWZmZXI7XG5cbiAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgY29uc3QgY29udGVudCA9IG1hcmtkb3duQ29udGVudCA/PyAoYXdhaXQgdGhpcy5yZWFkTWFya2Rvd25Db250ZW50UHJlZmVyRWRpdG9yKGZpbGUpKTtcbiAgICAgIGlmICh0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgIHRoaXMudChcbiAgICAgICAgICAgIFwiXHU2MkQyXHU3RUREXHU2MjhBXHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU1MzYwXHU0RjREXHU3QjE0XHU4QkIwXHU0RTBBXHU0RjIwXHU0RTNBXHU4RkRDXHU3QUVGXHU2QjYzXHU2NTg3XHUzMDAyXCIsXG4gICAgICAgICAgICBcIlJlZnVzaW5nIHRvIHVwbG9hZCBhIGxhenktbm90ZSBwbGFjZWhvbGRlciBhcyByZW1vdGUgbm90ZSBjb250ZW50LlwiLFxuICAgICAgICAgICksXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGJpbmFyeSA9IHRoaXMuZW5jb2RlVXRmOChjb250ZW50KTtcbiAgICB9IGVsc2Uge1xuICAgICAgYmluYXJ5ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZEJpbmFyeShmaWxlKTtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBiaW5hcnksIHRoaXMuZ2V0TWltZVR5cGUoZmlsZS5leHRlbnNpb24pKTtcbiAgICBjb25zdCByZW1vdGUgPSBhd2FpdCB0aGlzLnN0YXRSZW1vdGVGaWxlKHJlbW90ZVBhdGgpO1xuICAgIGlmIChyZW1vdGUpIHtcbiAgICAgIHJldHVybiByZW1vdGU7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJlbW90ZVBhdGgsXG4gICAgICBsYXN0TW9kaWZpZWQ6IGZpbGUuc3RhdC5tdGltZSxcbiAgICAgIHNpemU6IGZpbGUuc3RhdC5zaXplLFxuICAgICAgc2lnbmF0dXJlOiB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkU3luY1NpZ25hdHVyZShmaWxlKSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVSZW1vdGVTeW5jZWRFbnRyeSh2YXVsdFBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5zeW5jSW5kZXguZ2V0KHZhdWx0UGF0aCk7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IGV4aXN0aW5nPy5yZW1vdGVQYXRoID8/IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKHZhdWx0UGF0aCk7XG4gICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGVQYXRoKTtcbiAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUodmF1bHRQYXRoKTtcbiAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVGaWxlT3BlbihmaWxlOiBURmlsZSB8IG51bGwpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHx8IGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzLnNldChmaWxlLnBhdGgsIERhdGUubm93KCkpO1xuICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG5cbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBjb25zdCBzdHViID0gdGhpcy5wYXJzZU5vdGVTdHViKGNvbnRlbnQpO1xuICAgIGlmICghc3R1Yikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZW1vdGUgPSBhd2FpdCB0aGlzLnN0YXRSZW1vdGVGaWxlKHN0dWIucmVtb3RlUGF0aCk7XG4gICAgICBjb25zdCB0b21ic3RvbmUgPSAhcmVtb3RlID8gYXdhaXQgdGhpcy5yZWFkRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKSA6IHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IHJlc29sdXRpb24gPSBhd2FpdCB0aGlzLnJlc29sdmVMYXp5Tm90ZVN0dWIoZmlsZSwgc3R1YiwgcmVtb3RlLCB0b21ic3RvbmUpO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcblxuICAgICAgaWYgKHJlc29sdXRpb24uYWN0aW9uID09PSBcImRlbGV0ZWRcIikge1xuICAgICAgICBuZXcgTm90aWNlKFxuICAgICAgICAgIHRoaXMudChcbiAgICAgICAgICAgIHJlc29sdXRpb24ucHVyZ2VkTWlzc2luZ1xuICAgICAgICAgICAgICA/IGBcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdThGREVcdTdFRURcdTdGM0FcdTU5MzFcdUZGMENcdTVERjJcdTc5RkJcdTk2NjRcdTY3MkNcdTU3MzBcdTU5MzFcdTY1NDhcdTUzNjBcdTRGNERcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YFxuICAgICAgICAgICAgICA6IGBcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTRFMERcdTVCNThcdTU3MjhcdUZGMENcdTVERjJcdTc5RkJcdTk2NjRcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICAgICAgIHJlc29sdXRpb24ucHVyZ2VkTWlzc2luZ1xuICAgICAgICAgICAgICA/IGBSZW1vdGUgbm90ZSB3YXMgbWlzc2luZyByZXBlYXRlZGx5LCByZW1vdmVkIGxvY2FsIGJyb2tlbiBwbGFjZWhvbGRlcjogJHtmaWxlLmJhc2VuYW1lfWBcbiAgICAgICAgICAgICAgOiBgUmVtb3RlIG5vdGUgbWlzc2luZywgcmVtb3ZlZCBsb2NhbCBwbGFjZWhvbGRlcjogJHtmaWxlLmJhc2VuYW1lfWAsXG4gICAgICAgICAgKSxcbiAgICAgICAgICByZXNvbHV0aW9uLnB1cmdlZE1pc3NpbmcgPyA4MDAwIDogNjAwMCxcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVzb2x1dGlvbi5hY3Rpb24gPT09IFwibWlzc2luZ1wiKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU4RkRDXHU3QUVGXHU2QjYzXHU2NTg3XHU0RTBEXHU1QjU4XHU1NzI4XHVGRjBDXHU1RjUzXHU1MjREXHU1MTQ4XHU0RkREXHU3NTU5XHU2NzJDXHU1NzMwXHU1MzYwXHU0RjREXHU3QjE0XHU4QkIwXHU0RUU1XHU5NjMyXHU0RTM0XHU2NUY2XHU1RjAyXHU1RTM4XHVGRjFCXHU4MkU1XHU1MThEXHU2QjIxXHU3ODZFXHU4QkE0XHU3RjNBXHU1OTMxXHVGRjBDXHU1QzA2XHU4MUVBXHU1MkE4XHU2RTA1XHU3NDA2XHU4QkU1XHU1MzYwXHU0RjREXHUzMDAyXCIsIFwiUmVtb3RlIG5vdGUgaXMgbWlzc2luZy4gVGhlIGxvY2FsIHBsYWNlaG9sZGVyIHdhcyBrZXB0IGZvciBub3cgaW4gY2FzZSB0aGlzIGlzIHRyYW5zaWVudDsgaXQgd2lsbCBiZSBjbGVhbmVkIGF1dG9tYXRpY2FsbHkgaWYgdGhlIHJlbW90ZSBpcyBzdGlsbCBtaXNzaW5nIG9uIHRoZSBuZXh0IGNvbmZpcm1hdGlvbi5cIiksIDgwMDApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIG5ldyBOb3RpY2UodGhpcy50KGBcdTVERjJcdTRFQ0VcdThGRENcdTdBRUZcdTYwNjJcdTU5MERcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YCwgYFJlc3RvcmVkIG5vdGUgZnJvbSByZW1vdGU6ICR7ZmlsZS5iYXNlbmFtZX1gKSwgNjAwMCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gaHlkcmF0ZSBub3RlIGZyb20gcmVtb3RlXCIsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1OEZEQ1x1N0FFRlx1NjA2Mlx1NTkwRFx1N0IxNFx1OEJCMFx1NTkzMVx1OEQyNVwiLCBcIkZhaWxlZCB0byByZXN0b3JlIG5vdGUgZnJvbSByZW1vdGVcIiksIGVycm9yKSwgODAwMCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBnZXRPcGVuTWFya2Rvd25Db250ZW50KG5vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBsZWF2ZXMgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFwibWFya2Rvd25cIik7XG4gICAgZm9yIChjb25zdCBsZWFmIG9mIGxlYXZlcykge1xuICAgICAgY29uc3QgdmlldyA9IGxlYWYudmlldztcbiAgICAgIGlmICghKHZpZXcgaW5zdGFuY2VvZiBNYXJrZG93blZpZXcpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXZpZXcuZmlsZSB8fCB2aWV3LmZpbGUucGF0aCAhPT0gbm90ZVBhdGgpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB2aWV3LmVkaXRvci5nZXRWYWx1ZSgpO1xuICAgIH1cblxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWFkTWFya2Rvd25Db250ZW50UHJlZmVyRWRpdG9yKGZpbGU6IFRGaWxlKSB7XG4gICAgY29uc3QgbGl2ZUNvbnRlbnQgPSB0aGlzLmdldE9wZW5NYXJrZG93bkNvbnRlbnQoZmlsZS5wYXRoKTtcbiAgICBpZiAobGl2ZUNvbnRlbnQgIT09IG51bGwpIHtcbiAgICAgIHJldHVybiBsaXZlQ29udGVudDtcbiAgICB9XG5cbiAgICByZXR1cm4gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUoZmlsZTogVEZpbGUsIG1hcmtkb3duQ29udGVudD86IHN0cmluZykge1xuICAgIGlmIChmaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiKSB7XG4gICAgICByZXR1cm4gdGhpcy5zeW5jU3VwcG9ydC5idWlsZFN5bmNTaWduYXR1cmUoZmlsZSk7XG4gICAgfVxuXG4gICAgY29uc3QgY29udGVudCA9IG1hcmtkb3duQ29udGVudCA/PyAoYXdhaXQgdGhpcy5yZWFkTWFya2Rvd25Db250ZW50UHJlZmVyRWRpdG9yKGZpbGUpKTtcbiAgICBjb25zdCBkaWdlc3QgPSAoYXdhaXQgdGhpcy5jb21wdXRlU2hhMjU2SGV4KHRoaXMuZW5jb2RlVXRmOChjb250ZW50KSkpLnNsaWNlKDAsIDE2KTtcbiAgICByZXR1cm4gYG1kOiR7Y29udGVudC5sZW5ndGh9OiR7ZGlnZXN0fWA7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlY29uY2lsZVJlbW90ZUltYWdlcygpIHtcbiAgICByZXR1cm4geyBkZWxldGVkRmlsZXM6IDAsIGRlbGV0ZWREaXJlY3RvcmllczogMCB9O1xuICB9XG5cbiAgcHJpdmF0ZSBtYXJrTWlzc2luZ0xhenlSZW1vdGUocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCBwcmV2aW91cyA9IHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3Rlcy5nZXQocGF0aCk7XG4gICAgY29uc3QgbmV4dDogTWlzc2luZ0xhenlSZW1vdGVSZWNvcmQgPSBwcmV2aW91c1xuICAgICAgPyB7XG4gICAgICAgICAgZmlyc3REZXRlY3RlZEF0OiBwcmV2aW91cy5maXJzdERldGVjdGVkQXQsXG4gICAgICAgICAgbGFzdERldGVjdGVkQXQ6IG5vdyxcbiAgICAgICAgICBtaXNzQ291bnQ6IHByZXZpb3VzLm1pc3NDb3VudCArIDEsXG4gICAgICAgIH1cbiAgICAgIDoge1xuICAgICAgICAgIGZpcnN0RGV0ZWN0ZWRBdDogbm93LFxuICAgICAgICAgIGxhc3REZXRlY3RlZEF0OiBub3csXG4gICAgICAgICAgbWlzc0NvdW50OiAxLFxuICAgICAgICB9O1xuICAgIHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3Rlcy5zZXQocGF0aCwgbmV4dCk7XG4gICAgcmV0dXJuIG5leHQ7XG4gIH1cblxuICBwcml2YXRlIGNsZWFyTWlzc2luZ0xhenlSZW1vdGUocGF0aDogc3RyaW5nKSB7XG4gICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzLmRlbGV0ZShwYXRoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTaGFyZWQgbG9naWMgZm9yIHJlc29sdmluZyBhIGxhenktbm90ZSBzdHViIGluIGJvdGggaGFuZGxlRmlsZU9wZW4gYW5kXG4gICAqIHN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50LiAgQ2FsbGVycyBwcm92aWRlIHRoZSBhbHJlYWR5LWxvb2tlZC11cCByZW1vdGVcbiAgICogc3RhdGUgKG9yIG51bGwpIGFuZCBhbiBvcHRpb25hbCB0b21ic3RvbmUuXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIHJlc29sdmVMYXp5Tm90ZVN0dWIoXG4gICAgZmlsZTogVEZpbGUsXG4gICAgc3R1YjogeyByZW1vdGVQYXRoOiBzdHJpbmcgfSxcbiAgICByZW1vdGU6IFJlbW90ZUZpbGVTdGF0ZSB8IG51bGwgfCB1bmRlZmluZWQsXG4gICAgdG9tYnN0b25lOiBEZWxldGlvblRvbWJzdG9uZSB8IHVuZGVmaW5lZCxcbiAgKTogUHJvbWlzZTx7IGFjdGlvbjogXCJkZWxldGVkXCIgfCBcInJlc3RvcmVkXCIgfCBcIm1pc3NpbmdcIjsgcHVyZ2VkTWlzc2luZz86IGJvb2xlYW4gfT4ge1xuICAgIGlmICghcmVtb3RlKSB7XG4gICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucmVtb3ZlTG9jYWxWYXVsdEZpbGUoZmlsZSk7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgICB0aGlzLmNsZWFyTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICAgICAgcmV0dXJuIHsgYWN0aW9uOiBcImRlbGV0ZWRcIiwgZGVsZXRlZFN0dWI6IHRydWUgfTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbWlzc2luZ1JlY29yZCA9IHRoaXMubWFya01pc3NpbmdMYXp5UmVtb3RlKGZpbGUucGF0aCk7XG4gICAgICBpZiAobWlzc2luZ1JlY29yZC5taXNzQ291bnQgPj0gdGhpcy5taXNzaW5nTGF6eVJlbW90ZUNvbmZpcm1hdGlvbnMpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5yZW1vdmVMb2NhbFZhdWx0RmlsZShmaWxlKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICAgIHRoaXMuY2xlYXJNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgICByZXR1cm4geyBhY3Rpb246IFwiZGVsZXRlZFwiLCBkZWxldGVkU3R1YjogdHJ1ZSwgcHVyZ2VkTWlzc2luZzogdHJ1ZSB9O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4geyBhY3Rpb246IFwibWlzc2luZ1wiIH07XG4gICAgfVxuXG4gICAgdGhpcy5jbGVhck1pc3NpbmdMYXp5UmVtb3RlKGZpbGUucGF0aCk7XG4gICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KGZpbGUucGF0aCwgcmVtb3RlLCBmaWxlKTtcbiAgICBjb25zdCByZWZyZXNoZWQgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChmaWxlLnBhdGgpO1xuICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgIGxvY2FsU2lnbmF0dXJlOiByZWZyZXNoZWQgPyB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkU3luY1NpZ25hdHVyZShyZWZyZXNoZWQpIDogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgIHJlbW90ZVNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgIHJlbW90ZVBhdGg6IHN0dWIucmVtb3RlUGF0aCxcbiAgICB9KTtcbiAgICByZXR1cm4geyBhY3Rpb246IFwicmVzdG9yZWRcIiB9O1xuICB9XG5cbiAgcHJpdmF0ZSBwYXJzZU5vdGVTdHViKGNvbnRlbnQ6IHN0cmluZykge1xuICAgIGNvbnN0IG1hdGNoID0gY29udGVudC5tYXRjaChcbiAgICAgIC9ePCEtLVxccypzZWN1cmUtd2ViZGF2LW5vdGUtc3R1YlxccypcXHI/XFxucmVtb3RlOlxccyooLis/KVxccj9cXG5wbGFjZWhvbGRlcjpcXHMqKC4qPylcXHI/XFxuLS0+L3MsXG4gICAgKTtcbiAgICBpZiAoIW1hdGNoKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgcmVtb3RlUGF0aDogbWF0Y2hbMV0udHJpbSgpLFxuICAgICAgcGxhY2Vob2xkZXI6IG1hdGNoWzJdLnRyaW0oKSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZE5vdGVTdHViKGZpbGU6IFRGaWxlKSB7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgcmV0dXJuIFtcbiAgICAgIGA8IS0tICR7U0VDVVJFX05PVEVfU1RVQn1gLFxuICAgICAgYHJlbW90ZTogJHtyZW1vdGVQYXRofWAsXG4gICAgICBgcGxhY2Vob2xkZXI6ICR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgXCItLT5cIixcbiAgICAgIFwiXCIsXG4gICAgICB0aGlzLnQoXG4gICAgICAgIGBcdThGRDlcdTY2MkZcdTRFMDBcdTdCQzdcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTdCMTRcdThCQjBcdTc2ODRcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTY1ODdcdTRFRjZcdTMwMDJcdTYyNTNcdTVGMDBcdThGRDlcdTdCQzdcdTdCMTRcdThCQjBcdTY1RjZcdUZGMENcdTYzRDJcdTRFRjZcdTRGMUFcdTRFQ0VcdThGRENcdTdBRUZcdTU0MENcdTZCNjVcdTc2RUVcdTVGNTVcdTYwNjJcdTU5MERcdTVCOENcdTY1NzRcdTUxODVcdTVCQjlcdTMwMDJgLFxuICAgICAgICBgVGhpcyBpcyBhIGxvY2FsIHBsYWNlaG9sZGVyIGZvciBhbiBvbi1kZW1hbmQgbm90ZS4gT3BlbmluZyB0aGUgbm90ZSByZXN0b3JlcyB0aGUgZnVsbCBjb250ZW50IGZyb20gdGhlIHJlbW90ZSBzeW5jIGZvbGRlci5gLFxuICAgICAgKSxcbiAgICBdLmpvaW4oXCJcXG5cIik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGV2aWN0U3RhbGVTeW5jZWROb3RlcyhzaG93Tm90aWNlOiBib29sZWFuKSB7XG4gICAgdHJ5IHtcbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLm5vdGVTdG9yYWdlTW9kZSAhPT0gXCJsYXp5LW5vdGVzXCIpIHtcbiAgICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NUY1M1x1NTI0RFx1NjcyQVx1NTQyRlx1NzUyOFx1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFx1NkEyMVx1NUYwRlx1MzAwMlwiLCBcIkxhenkgbm90ZSBtb2RlIGlzIG5vdCBlbmFibGVkLlwiKSwgNjAwMCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGZpbGVzID0gdGhpcy5zeW5jU3VwcG9ydC5jb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKS5maWx0ZXIoKGZpbGUpID0+IGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpO1xuICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICAgIGNvbnN0IHRocmVzaG9sZCA9IE1hdGgubWF4KDEsIHRoaXMuc2V0dGluZ3Mubm90ZUV2aWN0QWZ0ZXJEYXlzKSAqIDI0ICogNjAgKiA2MCAqIDEwMDA7XG4gICAgICBsZXQgZXZpY3RlZCA9IDA7XG5cbiAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuICAgICAgICBjb25zdCBhY3RpdmUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xuICAgICAgICBpZiAoYWN0aXZlPy5wYXRoID09PSBmaWxlLnBhdGgpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGxhc3RBY2Nlc3MgPSB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzLmdldChmaWxlLnBhdGgpID8/IDA7XG4gICAgICAgIGlmIChsYXN0QWNjZXNzICE9PSAwICYmIG5vdyAtIGxhc3RBY2Nlc3MgPCB0aHJlc2hvbGQpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICBpZiAodGhpcy5wYXJzZU5vdGVTdHViKGNvbnRlbnQpKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBiaW5hcnkgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5zeW5jU3VwcG9ydC5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgYXdhaXQgdGhpcy51cGxvYWRCaW5hcnkocmVtb3RlUGF0aCwgYmluYXJ5LCBcInRleHQvbWFya2Rvd247IGNoYXJzZXQ9dXRmLThcIik7XG4gICAgICAgIGNvbnN0IHZlcmlmaWVkID0gYXdhaXQgdGhpcy52ZXJpZnlSZW1vdGVCaW5hcnlSb3VuZFRyaXAocmVtb3RlUGF0aCwgYmluYXJ5KTtcbiAgICAgICAgaWYgKCF2ZXJpZmllZCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTY4MjFcdTlBOENcdTU5MzFcdThEMjVcdUZGMENcdTVERjJcdTUzRDZcdTZEODhcdTU2REVcdTY1MzZcdTY3MkNcdTU3MzBcdTdCMTRcdThCQjBcdTMwMDJcIiwgXCJSZW1vdGUgbm90ZSB2ZXJpZmljYXRpb24gZmFpbGVkLCBsb2NhbCBub3RlIGV2aWN0aW9uIHdhcyBjYW5jZWxsZWQuXCIpKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZW1vdGUgPSBhd2FpdCB0aGlzLnN0YXRSZW1vdGVGaWxlKHJlbW90ZVBhdGgpO1xuICAgICAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTUxNDNcdTY1NzBcdTYzNkVcdTdGM0FcdTU5MzFcdUZGMENcdTVERjJcdTUzRDZcdTZEODhcdTU2REVcdTY1MzZcdTY3MkNcdTU3MzBcdTdCMTRcdThCQjBcdTMwMDJcIiwgXCJSZW1vdGUgbm90ZSBtZXRhZGF0YSBpcyBtaXNzaW5nLCBsb2NhbCBub3RlIGV2aWN0aW9uIHdhcyBjYW5jZWxsZWQuXCIpKTtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdGhpcy5idWlsZE5vdGVTdHViKGZpbGUpKTtcbiAgICAgICAgY29uc3QgcmVmcmVzaGVkID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZWZyZXNoZWQgPyB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkU3luY1NpZ25hdHVyZShyZWZyZXNoZWQpIDogdGhpcy5zeW5jU3VwcG9ydC5idWlsZFN5bmNTaWduYXR1cmUoZmlsZSksXG4gICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiByZW1vdGU/LnNpZ25hdHVyZSA/PyBgJHtmaWxlLnN0YXQubXRpbWV9OiR7YmluYXJ5LmJ5dGVMZW5ndGh9YCxcbiAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICB9KTtcbiAgICAgICAgZXZpY3RlZCArPSAxO1xuICAgICAgfVxuXG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKFxuICAgICAgICAgIHRoaXMudChcbiAgICAgICAgICAgIGBcdTVERjJcdTU2REVcdTY1MzYgJHtldmljdGVkfSBcdTdCQzdcdTk1N0ZcdTY3MUZcdTY3MkFcdThCQkZcdTk1RUVcdTc2ODRcdTY3MkNcdTU3MzBcdTdCMTRcdThCQjBcdTMwMDJgLFxuICAgICAgICAgICAgYEV2aWN0ZWQgJHtldmljdGVkfSBzdGFsZSBsb2NhbCBub3RlKHMpLmAsXG4gICAgICAgICAgKSxcbiAgICAgICAgICA4MDAwLFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIHJldHVybiBldmljdGVkO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGV2aWN0IHN0YWxlIHN5bmNlZCBub3Rlc1wiLCBlcnJvcik7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTU2REVcdTY1MzZcdTY3MkNcdTU3MzBcdTdCMTRcdThCQjBcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gZXZpY3QgbG9jYWwgbm90ZXNcIiksIGVycm9yKSwgODAwMCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gMDtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGVuc3VyZVJlbW90ZURpcmVjdG9yaWVzKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHBhcnRzID0gcmVtb3RlUGF0aC5zcGxpdChcIi9cIikuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUubGVuZ3RoID4gMCk7XG4gICAgaWYgKHBhcnRzLmxlbmd0aCA8PSAxKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGV0IGN1cnJlbnQgPSBcIlwiO1xuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBwYXJ0cy5sZW5ndGggLSAxOyBpbmRleCArPSAxKSB7XG4gICAgICBjdXJyZW50ID0gY3VycmVudCA/IGAke2N1cnJlbnR9LyR7cGFydHNbaW5kZXhdfWAgOiBwYXJ0c1tpbmRleF07XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChjdXJyZW50KSxcbiAgICAgICAgbWV0aG9kOiBcIk1LQ09MXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGlmICghWzIwMCwgMjAxLCAyMDQsIDIwNywgMzAxLCAzMDIsIDMwNywgMzA4LCA0MDVdLmluY2x1ZGVzKHJlc3BvbnNlLnN0YXR1cykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBNS0NPTCBmYWlsZWQgZm9yICR7Y3VycmVudH0gd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBsaXN0UmVtb3RlVHJlZShyb290Rm9sZGVyOiBzdHJpbmcpOiBQcm9taXNlPFJlbW90ZUludmVudG9yeT4ge1xuICAgIGNvbnN0IGZpbGVzID0gbmV3IE1hcDxzdHJpbmcsIFJlbW90ZUZpbGVTdGF0ZT4oKTtcbiAgICBjb25zdCBkaXJlY3RvcmllcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IHBlbmRpbmcgPSBbbm9ybWFsaXplRm9sZGVyKHJvb3RGb2xkZXIpXTtcbiAgICBjb25zdCB2aXNpdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbiAgICB3aGlsZSAocGVuZGluZy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBjdXJyZW50ID0gbm9ybWFsaXplRm9sZGVyKHBlbmRpbmcucG9wKCkgPz8gcm9vdEZvbGRlcik7XG4gICAgICBpZiAodmlzaXRlZC5oYXMoY3VycmVudCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHZpc2l0ZWQuYWRkKGN1cnJlbnQpO1xuICAgICAgY29uc3QgZW50cmllcyA9IGF3YWl0IHRoaXMubGlzdFJlbW90ZURpcmVjdG9yeShjdXJyZW50KTtcbiAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgICAgICBpZiAoZW50cnkuaXNDb2xsZWN0aW9uKSB7XG4gICAgICAgICAgZGlyZWN0b3JpZXMuYWRkKGVudHJ5LnJlbW90ZVBhdGgpO1xuICAgICAgICAgIHBlbmRpbmcucHVzaChlbnRyeS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlbnRyeS5maWxlKSB7XG4gICAgICAgICAgZmlsZXMuc2V0KGVudHJ5LnJlbW90ZVBhdGgsIGVudHJ5LmZpbGUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgZmlsZXMsIGRpcmVjdG9yaWVzIH07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGxpc3RSZW1vdGVEaXJlY3RvcnkocmVtb3RlRGlyZWN0b3J5OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXF1ZXN0ZWRQYXRoID0gbm9ybWFsaXplRm9sZGVyKHJlbW90ZURpcmVjdG9yeSk7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlcXVlc3RlZFBhdGgpLFxuICAgICAgbWV0aG9kOiBcIlBST1BGSU5EXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIERlcHRoOiBcIjFcIixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MDQpIHtcbiAgICAgIHJldHVybiBbXSBhcyBBcnJheTx7IHJlbW90ZVBhdGg6IHN0cmluZzsgaXNDb2xsZWN0aW9uOiBib29sZWFuOyBmaWxlPzogUmVtb3RlRmlsZVN0YXRlIH0+O1xuICAgIH1cblxuICAgIHRoaXMuYXNzZXJ0UmVzcG9uc2VTdWNjZXNzKHJlc3BvbnNlLCBgUFJPUEZJTkQgZm9yICR7cmVxdWVzdGVkUGF0aH1gKTtcblxuICAgIGNvbnN0IHhtbFRleHQgPSB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpO1xuICAgIHJldHVybiB0aGlzLnBhcnNlUHJvcGZpbmREaXJlY3RvcnlMaXN0aW5nKHhtbFRleHQsIHJlcXVlc3RlZFBhdGgpO1xuICB9XG5cbiAgcHJpdmF0ZSBwYXJzZVByb3BmaW5kRGlyZWN0b3J5TGlzdGluZyh4bWxUZXh0OiBzdHJpbmcsIHJlcXVlc3RlZFBhdGg6IHN0cmluZywgaW5jbHVkZVJlcXVlc3RlZCA9IGZhbHNlKSB7XG4gICAgY29uc3QgcGFyc2VyID0gbmV3IERPTVBhcnNlcigpO1xuICAgIGNvbnN0IGRvY3VtZW50ID0gcGFyc2VyLnBhcnNlRnJvbVN0cmluZyh4bWxUZXh0LCBcImFwcGxpY2F0aW9uL3htbFwiKTtcbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJwYXJzZXJlcnJvclwiKS5sZW5ndGggPiAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiXHU2NUUwXHU2Q0Q1XHU4OUUzXHU2NzkwIFdlYkRBViBcdTc2RUVcdTVGNTVcdTZFMDVcdTUzNTVcdTMwMDJcIiwgXCJGYWlsZWQgdG8gcGFyc2UgdGhlIFdlYkRBViBkaXJlY3RvcnkgbGlzdGluZy5cIikpO1xuICAgIH1cblxuICAgIGNvbnN0IGVudHJpZXMgPSBuZXcgTWFwPHN0cmluZywgeyByZW1vdGVQYXRoOiBzdHJpbmc7IGlzQ29sbGVjdGlvbjogYm9vbGVhbjsgZmlsZT86IFJlbW90ZUZpbGVTdGF0ZSB9PigpO1xuICAgIGZvciAoY29uc3QgZWxlbWVudCBvZiBBcnJheS5mcm9tKGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiKlwiKSkpIHtcbiAgICAgIGlmIChlbGVtZW50LmxvY2FsTmFtZSAhPT0gXCJyZXNwb25zZVwiKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBocmVmID0gdGhpcy5nZXRYbWxMb2NhbE5hbWVUZXh0KGVsZW1lbnQsIFwiaHJlZlwiKTtcbiAgICAgIGlmICghaHJlZikge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuaHJlZlRvUmVtb3RlUGF0aChocmVmKTtcbiAgICAgIGlmICghcmVtb3RlUGF0aCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaXNDb2xsZWN0aW9uID0gdGhpcy54bWxUcmVlSGFzTG9jYWxOYW1lKGVsZW1lbnQsIFwiY29sbGVjdGlvblwiKTtcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gaXNDb2xsZWN0aW9uID8gbm9ybWFsaXplRm9sZGVyKHJlbW90ZVBhdGgpIDogcmVtb3RlUGF0aC5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpO1xuICAgICAgaWYgKFxuICAgICAgICAhaW5jbHVkZVJlcXVlc3RlZCAmJlxuICAgICAgICAoXG4gICAgICAgICAgbm9ybWFsaXplZFBhdGggPT09IHJlcXVlc3RlZFBhdGggfHxcbiAgICAgICAgICBub3JtYWxpemVkUGF0aCA9PT0gcmVxdWVzdGVkUGF0aC5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpXG4gICAgICAgIClcbiAgICAgICkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc2l6ZVRleHQgPSB0aGlzLmdldFhtbExvY2FsTmFtZVRleHQoZWxlbWVudCwgXCJnZXRjb250ZW50bGVuZ3RoXCIpO1xuICAgICAgY29uc3QgcGFyc2VkU2l6ZSA9IE51bWJlci5wYXJzZUludChzaXplVGV4dCwgMTApO1xuICAgICAgY29uc3Qgc2l6ZSA9IE51bWJlci5pc0Zpbml0ZShwYXJzZWRTaXplKSA/IHBhcnNlZFNpemUgOiAwO1xuICAgICAgY29uc3QgbW9kaWZpZWRUZXh0ID0gdGhpcy5nZXRYbWxMb2NhbE5hbWVUZXh0KGVsZW1lbnQsIFwiZ2V0bGFzdG1vZGlmaWVkXCIpO1xuICAgICAgY29uc3QgcGFyc2VkTXRpbWUgPSBEYXRlLnBhcnNlKG1vZGlmaWVkVGV4dCk7XG4gICAgICBjb25zdCBsYXN0TW9kaWZpZWQgPSBOdW1iZXIuaXNGaW5pdGUocGFyc2VkTXRpbWUpID8gcGFyc2VkTXRpbWUgOiAwO1xuXG4gICAgICBlbnRyaWVzLnNldChub3JtYWxpemVkUGF0aCwge1xuICAgICAgICByZW1vdGVQYXRoOiBub3JtYWxpemVkUGF0aCxcbiAgICAgICAgaXNDb2xsZWN0aW9uLFxuICAgICAgICBmaWxlOiBpc0NvbGxlY3Rpb25cbiAgICAgICAgICA/IHVuZGVmaW5lZFxuICAgICAgICAgIDoge1xuICAgICAgICAgICAgICByZW1vdGVQYXRoOiBub3JtYWxpemVkUGF0aCxcbiAgICAgICAgICAgICAgbGFzdE1vZGlmaWVkLFxuICAgICAgICAgICAgICBzaXplLFxuICAgICAgICAgICAgICBzaWduYXR1cmU6IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRSZW1vdGVTeW5jU2lnbmF0dXJlKHtcbiAgICAgICAgICAgICAgICBsYXN0TW9kaWZpZWQsXG4gICAgICAgICAgICAgICAgc2l6ZSxcbiAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIFsuLi5lbnRyaWVzLnZhbHVlcygpXTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0WG1sTG9jYWxOYW1lVGV4dChwYXJlbnQ6IEVsZW1lbnQsIGxvY2FsTmFtZTogc3RyaW5nKSB7XG4gICAgZm9yIChjb25zdCBlbGVtZW50IG9mIEFycmF5LmZyb20ocGFyZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiKlwiKSkpIHtcbiAgICAgIGlmIChlbGVtZW50LmxvY2FsTmFtZSA9PT0gbG9jYWxOYW1lKSB7XG4gICAgICAgIHJldHVybiBlbGVtZW50LnRleHRDb250ZW50Py50cmltKCkgPz8gXCJcIjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuXG4gIHByaXZhdGUgeG1sVHJlZUhhc0xvY2FsTmFtZShwYXJlbnQ6IEVsZW1lbnQsIGxvY2FsTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20ocGFyZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiKlwiKSkuc29tZSgoZWxlbWVudCkgPT4gZWxlbWVudC5sb2NhbE5hbWUgPT09IGxvY2FsTmFtZSk7XG4gIH1cblxuICBwcml2YXRlIGhyZWZUb1JlbW90ZVBhdGgoaHJlZjogc3RyaW5nKSB7XG4gICAgY29uc3QgYmFzZVVybCA9IGAke3RoaXMuc2V0dGluZ3Mud2ViZGF2VXJsLnJlcGxhY2UoL1xcLyskLywgXCJcIil9L2A7XG4gICAgY29uc3QgcmVzb2x2ZWQgPSBuZXcgVVJMKGhyZWYsIGJhc2VVcmwpO1xuICAgIGNvbnN0IGJhc2VQYXRoID0gbmV3IFVSTChiYXNlVXJsKS5wYXRobmFtZS5yZXBsYWNlKC9cXC8rJC8sIFwiL1wiKTtcbiAgICBjb25zdCBkZWNvZGVkUGF0aCA9IHRoaXMuZGVjb2RlUGF0aG5hbWUocmVzb2x2ZWQucGF0aG5hbWUpO1xuICAgIGlmICghZGVjb2RlZFBhdGguc3RhcnRzV2l0aChiYXNlUGF0aCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiBkZWNvZGVkUGF0aC5zbGljZShiYXNlUGF0aC5sZW5ndGgpLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG4gIH1cblxuICBwcml2YXRlIGRlY29kZVBhdGhuYW1lKHBhdGhuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gcGF0aG5hbWVcbiAgICAgIC5zcGxpdChcIi9cIilcbiAgICAgIC5tYXAoKHNlZ21lbnQpID0+IHtcbiAgICAgICAgaWYgKCFzZWdtZW50KSB7XG4gICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoc2VnbWVudCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIHJldHVybiBzZWdtZW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmpvaW4oXCIvXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZEV4cGVjdGVkUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlRmlsZVBhdGhzOiBTZXQ8c3RyaW5nPiwgcm9vdEZvbGRlcjogc3RyaW5nKSB7XG4gICAgY29uc3QgZXhwZWN0ZWQgPSBuZXcgU2V0PHN0cmluZz4oW25vcm1hbGl6ZUZvbGRlcihyb290Rm9sZGVyKV0pO1xuICAgIGZvciAoY29uc3QgcmVtb3RlUGF0aCBvZiByZW1vdGVGaWxlUGF0aHMpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gcmVtb3RlUGF0aC5zcGxpdChcIi9cIikuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUubGVuZ3RoID4gMCk7XG4gICAgICBsZXQgY3VycmVudCA9IFwiXCI7XG4gICAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgcGFydHMubGVuZ3RoIC0gMTsgaW5kZXggKz0gMSkge1xuICAgICAgICBjdXJyZW50ID0gY3VycmVudCA/IGAke2N1cnJlbnR9LyR7cGFydHNbaW5kZXhdfWAgOiBwYXJ0c1tpbmRleF07XG4gICAgICAgIGV4cGVjdGVkLmFkZChub3JtYWxpemVGb2xkZXIoY3VycmVudCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBleHBlY3RlZDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVjb25jaWxlRGlyZWN0b3JpZXMocmVtb3RlRGlyZWN0b3JpZXM6IFNldDxzdHJpbmc+KSB7XG4gICAgY29uc3Qgc3RhdHMgPSB7IGNyZWF0ZWRMb2NhbDogMCwgY3JlYXRlZFJlbW90ZTogMCwgZGVsZXRlZExvY2FsOiAwLCBkZWxldGVkUmVtb3RlOiAwIH07XG5cbiAgICBjb25zdCByZW1vdGVMb2NhbFBhdGhzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgZm9yIChjb25zdCByZW1vdGVEaXIgb2YgcmVtb3RlRGlyZWN0b3JpZXMpIHtcbiAgICAgIGNvbnN0IGxvY2FsUGF0aCA9IHRoaXMuc3luY1N1cHBvcnQucmVtb3RlUGF0aFRvVmF1bHRQYXRoKHJlbW90ZURpcik7XG4gICAgICBpZiAobG9jYWxQYXRoICE9PSBudWxsICYmIGxvY2FsUGF0aC5sZW5ndGggPiAwICYmICF0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBEaXJlY3RvcnlTeW5jUGF0aChsb2NhbFBhdGgpKSB7XG4gICAgICAgIHJlbW90ZUxvY2FsUGF0aHMuYWRkKG5vcm1hbGl6ZVBhdGgobG9jYWxQYXRoKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgbG9jYWxEaXJQYXRocyA9IHRoaXMuc3luY1N1cHBvcnQuY29sbGVjdExvY2FsU3luY2VkRGlyZWN0b3JpZXMoKTtcbiAgICBjb25zdCBrbm93bkRpclBhdGhzID0gdGhpcy5zeW5jZWREaXJlY3RvcmllcztcbiAgICBjb25zdCBuZXdTeW5jZWREaXJzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbiAgICBjb25zdCBsb2NhbE9ubHkgPSBbLi4ubG9jYWxEaXJQYXRoc10uZmlsdGVyKChwKSA9PiAhcmVtb3RlTG9jYWxQYXRocy5oYXMocCkpO1xuICAgIGNvbnN0IHJlbW90ZU9ubHkgPSBbLi4ucmVtb3RlTG9jYWxQYXRoc10uZmlsdGVyKChwKSA9PiAhbG9jYWxEaXJQYXRocy5oYXMocCkpO1xuXG4gICAgLy8gUHJvY2VzcyBsb2NhbC1vbmx5IGRpcmVjdG9yaWVzIChkZWVwZXN0IGZpcnN0IGZvciBzYWZlIGRlbGV0aW9uKVxuICAgIGZvciAoY29uc3QgZGlyUGF0aCBvZiBbLi4ubG9jYWxPbmx5XS5zb3J0KChhLCBiKSA9PiBiLmxlbmd0aCAtIGEubGVuZ3RoKSkge1xuICAgICAgaWYgKGtub3duRGlyUGF0aHMuaGFzKGRpclBhdGgpKSB7XG4gICAgICAgIC8vIFdhcyBzeW5jZWQgYmVmb3JlIGJ1dCBnb25lIGZyb20gcmVtb3RlIFx1MjE5MiBhbm90aGVyIGNsaWVudCBkZWxldGVkIGl0XG4gICAgICAgIGNvbnN0IGZvbGRlciA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChkaXJQYXRoKTtcbiAgICAgICAgaWYgKGZvbGRlciBpbnN0YW5jZW9mIFRGb2xkZXIgJiYgZm9sZGVyLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5kZWxldGUoZm9sZGVyLCB0cnVlKTtcbiAgICAgICAgICAgIHN0YXRzLmRlbGV0ZWRMb2NhbCArPSAxO1xuICAgICAgICAgIH0gY2F0Y2ggeyAvKiBza2lwIGlmIGRlbGV0aW9uIGZhaWxzICovIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBOb24tZW1wdHkgbG9jYWwgZGlyOiBrZWVwIGl0LCBmaWxlcyB3aWxsIHJlLXVwbG9hZCBvbiBuZXh0IHN5bmNcbiAgICAgICAgICBuZXdTeW5jZWREaXJzLmFkZChkaXJQYXRoKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gTmV3IGxvY2FsIGRpcmVjdG9yeSBub3QgeWV0IG9uIHJlbW90ZSBcdTIxOTIgY3JlYXRlIG9uIHJlbW90ZVxuICAgICAgICBjb25zdCByZW1vdGVEaXIgPSBub3JtYWxpemVGb2xkZXIodGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpICsgZGlyUGF0aDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmVuc3VyZVJlbW90ZURpcmVjdG9yaWVzKHJlbW90ZURpcik7XG4gICAgICAgICAgc3RhdHMuY3JlYXRlZFJlbW90ZSArPSAxO1xuICAgICAgICB9IGNhdGNoIHsgLyogc2tpcCBpZiBjcmVhdGlvbiBmYWlscyAqLyB9XG4gICAgICAgIG5ld1N5bmNlZERpcnMuYWRkKGRpclBhdGgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEJvdGggc2lkZXMgZXhpc3QgXHUyMTkyIGtlZXBcbiAgICBmb3IgKGNvbnN0IGRpclBhdGggb2YgbG9jYWxEaXJQYXRocykge1xuICAgICAgaWYgKHJlbW90ZUxvY2FsUGF0aHMuaGFzKGRpclBhdGgpKSB7XG4gICAgICAgIG5ld1N5bmNlZERpcnMuYWRkKGRpclBhdGgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFByb2Nlc3MgcmVtb3RlLW9ubHkgZGlyZWN0b3JpZXMgKGRlZXBlc3QgZmlyc3QgZm9yIHNhZmUgZGVsZXRpb24pXG4gICAgZm9yIChjb25zdCBkaXJQYXRoIG9mIFsuLi5yZW1vdGVPbmx5XS5zb3J0KChhLCBiKSA9PiBiLmxlbmd0aCAtIGEubGVuZ3RoKSkge1xuICAgICAgaWYgKGtub3duRGlyUGF0aHMuaGFzKGRpclBhdGgpKSB7XG4gICAgICAgIC8vIFdhcyBzeW5jZWQgYmVmb3JlIGJ1dCBnb25lIGxvY2FsbHkgXHUyMTkyIHRoaXMgY2xpZW50IGRlbGV0ZWQgaXRcbiAgICAgICAgY29uc3QgcmVtb3RlRGlyID0gbm9ybWFsaXplRm9sZGVyKHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKSArIGRpclBhdGg7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlRGlyKSxcbiAgICAgICAgICBtZXRob2Q6IFwiREVMRVRFXCIsXG4gICAgICAgICAgaGVhZGVyczogeyBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpIH0sXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoWzIwMCwgMjAyLCAyMDRdLmluY2x1ZGVzKHJlc3BvbnNlLnN0YXR1cykpIHtcbiAgICAgICAgICBzdGF0cy5kZWxldGVkUmVtb3RlICs9IDE7XG4gICAgICAgIH0gZWxzZSBpZiAoIVs0MDQsIDQwNSwgNDA5XS5pbmNsdWRlcyhyZXNwb25zZS5zdGF0dXMpKSB7XG4gICAgICAgICAgLy8gVW5leHBlY3RlZCBlcnJvciBcdTIxOTIga2VlcCB0cmFja2luZyB0byByZXRyeSBuZXh0IHN5bmNcbiAgICAgICAgICBuZXdTeW5jZWREaXJzLmFkZChkaXJQYXRoKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gTmV3IHJlbW90ZSBkaXJlY3Rvcnkgbm90IHlldCBsb2NhbCBcdTIxOTIgY3JlYXRlIGxvY2FsbHlcbiAgICAgICAgaWYgKCEoYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5leGlzdHMoZGlyUGF0aCkpKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIubWtkaXIoZGlyUGF0aCk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc3QgbXNnID0gZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpO1xuICAgICAgICAgICAgaWYgKCFtc2cuaW5jbHVkZXMoXCJhbHJlYWR5IGV4aXN0c1wiKSkge1xuICAgICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBzdGF0cy5jcmVhdGVkTG9jYWwgKz0gMTtcbiAgICAgICAgbmV3U3luY2VkRGlycy5hZGQoZGlyUGF0aCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5zeW5jZWREaXJlY3RvcmllcyA9IG5ld1N5bmNlZERpcnM7XG4gICAgcmV0dXJuIHN0YXRzO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVFeHRyYVJlbW90ZURpcmVjdG9yaWVzKHJlbW90ZURpcmVjdG9yaWVzOiBTZXQ8c3RyaW5nPiwgZXhwZWN0ZWREaXJlY3RvcmllczogU2V0PHN0cmluZz4pIHtcbiAgICBsZXQgZGVsZXRlZCA9IDA7XG4gICAgY29uc3QgY2FuZGlkYXRlcyA9IFsuLi5yZW1vdGVEaXJlY3Rvcmllc11cbiAgICAgIC5maWx0ZXIoKHJlbW90ZVBhdGgpID0+ICFleHBlY3RlZERpcmVjdG9yaWVzLmhhcyhyZW1vdGVQYXRoKSlcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBiLmxlbmd0aCAtIGEubGVuZ3RoIHx8IGIubG9jYWxlQ29tcGFyZShhKSk7XG5cbiAgICBmb3IgKGNvbnN0IHJlbW90ZVBhdGggb2YgY2FuZGlkYXRlcykge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICAgIG1ldGhvZDogXCJERUxFVEVcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgaWYgKFsyMDAsIDIwMiwgMjA0LCA0MDRdLmluY2x1ZGVzKHJlc3BvbnNlLnN0YXR1cykpIHtcbiAgICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gNDA0KSB7XG4gICAgICAgICAgZGVsZXRlZCArPSAxO1xuICAgICAgICB9XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoWzQwNSwgNDA5XS5pbmNsdWRlcyhyZXNwb25zZS5zdGF0dXMpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYERFTEVURSBkaXJlY3RvcnkgZmFpbGVkIGZvciAke3JlbW90ZVBhdGh9IHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIH1cblxuICAgIHJldHVybiBkZWxldGVkO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzUGVuZGluZ1Rhc2tzKCkge1xuXG4gICAgYXdhaXQgdGhpcy51cGxvYWRRdWV1ZS5wcm9jZXNzUGVuZGluZ1Rhc2tzKCk7XG4gIH1cblxuICBwcml2YXRlIHRyYWNrVmF1bHRNdXRhdGlvbihvcGVyYXRpb246ICgpID0+IFByb21pc2U8dm9pZD4pIHtcbiAgICBjb25zdCBwcm9taXNlID0gb3BlcmF0aW9uKClcbiAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIlNlY3VyZSBXZWJEQVYgdmF1bHQgbXV0YXRpb24gaGFuZGxpbmcgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIH0pXG4gICAgICAuZmluYWxseSgoKSA9PiB7XG4gICAgICAgIHRoaXMucGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlcy5kZWxldGUocHJvbWlzZSk7XG4gICAgICB9KTtcbiAgICB0aGlzLnBlbmRpbmdWYXVsdE11dGF0aW9uUHJvbWlzZXMuYWRkKHByb21pc2UpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB3YWl0Rm9yUGVuZGluZ1ZhdWx0TXV0YXRpb25zKCkge1xuICAgIHdoaWxlICh0aGlzLnBlbmRpbmdWYXVsdE11dGF0aW9uUHJvbWlzZXMuc2l6ZSA+IDApIHtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChbLi4udGhpcy5wZW5kaW5nVmF1bHRNdXRhdGlvblByb21pc2VzXSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwcmVwYXJlUGVuZGluZ1VwbG9hZHNGb3JTeW5jKHNob3dOb3RpY2U6IGJvb2xlYW4pIHtcblxuICAgIGF3YWl0IHRoaXMudXBsb2FkUXVldWUucHJvY2Vzc1BlbmRpbmdUYXNrcygpO1xuXG4gICAgaWYgKHRoaXMudXBsb2FkUXVldWUuaGFzUGVuZGluZ1dvcmsoKSkge1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy50KFxuICAgICAgICBcIlx1NjhDMFx1NkQ0Qlx1NTIzMFx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NEVDRFx1NTcyOFx1OEZEQlx1ODg0Q1x1NjIxNlx1N0I0OVx1NUY4NVx1OTFDRFx1OEJENVx1RkYwQ1x1NURGMlx1NjY4Mlx1N0YxM1x1NjcyQ1x1NkIyMVx1N0IxNFx1OEJCMFx1NTQwQ1x1NkI2NVx1RkYwQ1x1OTA3Rlx1NTE0RFx1NjVFN1x1NzI0OFx1N0IxNFx1OEJCMFx1ODk4Nlx1NzZENlx1NjVCMFx1NTZGRVx1NzI0N1x1NUYxNVx1NzUyOFx1MzAwMlwiLFxuICAgICAgICBcIkltYWdlIHVwbG9hZHMgYXJlIHN0aWxsIHJ1bm5pbmcgb3Igd2FpdGluZyBmb3IgcmV0cnksIHNvIG5vdGUgc3luYyB3YXMgZGVmZXJyZWQgdG8gYXZvaWQgb2xkIG5vdGUgY29udGVudCBvdmVyd3JpdGluZyBuZXcgaW1hZ2UgcmVmZXJlbmNlcy5cIixcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsIDgwMDApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRJbWFnZXNJbk5vdGUobm90ZUZpbGU6IFRGaWxlKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKG5vdGVGaWxlKTtcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50cyA9IGF3YWl0IHRoaXMuYnVpbGRVcGxvYWRSZXBsYWNlbWVudHMoY29udGVudCwgbm90ZUZpbGUpO1xuXG4gICAgICBpZiAocmVwbGFjZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NUY1M1x1NTI0RFx1N0IxNFx1OEJCMFx1NEUyRFx1NkNBMVx1NjcwOVx1NjI3RVx1NTIzMFx1NjcyQ1x1NTczMFx1NTZGRVx1NzI0N1x1MzAwMlwiLCBcIk5vIGxvY2FsIGltYWdlcyBmb3VuZCBpbiB0aGUgY3VycmVudCBub3RlLlwiKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbGV0IHVwZGF0ZWQgPSBjb250ZW50O1xuICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcbiAgICAgICAgdXBkYXRlZCA9IHVwZGF0ZWQuc3BsaXQocmVwbGFjZW1lbnQub3JpZ2luYWwpLmpvaW4ocmVwbGFjZW1lbnQucmV3cml0dGVuKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHVwZGF0ZWQgPT09IGNvbnRlbnQpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdTZDQTFcdTY3MDlcdTk3MDBcdTg5ODFcdTY1MzlcdTUxOTlcdTc2ODRcdTU2RkVcdTcyNDdcdTk0RkVcdTYzQTVcdTMwMDJcIiwgXCJObyBpbWFnZXMgd2VyZSByZXdyaXR0ZW4uXCIpKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkobm90ZUZpbGUsIHVwZGF0ZWQpO1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZUZpbGUucGF0aCwgXCJpbWFnZS1hZGRcIik7XG5cbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLmRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQpIHtcbiAgICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcbiAgICAgICAgICBpZiAocmVwbGFjZW1lbnQuc291cmNlRmlsZSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy50cmFzaElmRXhpc3RzKHJlcGxhY2VtZW50LnNvdXJjZUZpbGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBuZXcgTm90aWNlKHRoaXMudChgXHU1REYyXHU0RTBBXHU0RjIwICR7cmVwbGFjZW1lbnRzLmxlbmd0aH0gXHU1RjIwXHU1NkZFXHU3MjQ3XHU1MjMwIFdlYkRBVlx1MzAwMmAsIGBVcGxvYWRlZCAke3JlcGxhY2VtZW50cy5sZW5ndGh9IGltYWdlKHMpIHRvIFdlYkRBVi5gKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIHVwbG9hZCBmYWlsZWRcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU0RTBBXHU0RjIwXHU1OTMxXHU4RDI1XCIsIFwiVXBsb2FkIGZhaWxlZFwiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHByb2Nlc3NUYXNrKHRhc2s6IFVwbG9hZFRhc2spIHtcblxuICAgIGF3YWl0IHRoaXMudXBsb2FkUXVldWUucHJvY2Vzc1Rhc2sodGFzayk7XG4gIH1cblxuICBwcml2YXRlIGVzY2FwZUh0bWwodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiB2YWx1ZVxuICAgICAgLnJlcGxhY2UoLyYvZywgXCImYW1wO1wiKVxuICAgICAgLnJlcGxhY2UoL1wiL2csIFwiJnF1b3Q7XCIpXG4gICAgICAucmVwbGFjZSgvPC9nLCBcIiZsdDtcIilcbiAgICAgIC5yZXBsYWNlKC8+L2csIFwiJmd0O1wiKTtcbiAgfVxuXG4gIHByaXZhdGUgdW5lc2NhcGVIdG1sKHZhbHVlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdmFsdWVcbiAgICAgIC5yZXBsYWNlKC8mcXVvdDsvZywgXCJcXFwiXCIpXG4gICAgICAucmVwbGFjZSgvJmd0Oy9nLCBcIj5cIilcbiAgICAgIC5yZXBsYWNlKC8mbHQ7L2csIFwiPFwiKVxuICAgICAgLnJlcGxhY2UoLyZhbXA7L2csIFwiJlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmwocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMuYXNzZXJ0UmVzcG9uc2VTdWNjZXNzKHJlc3BvbnNlLCBcIkZldGNoIHNlY3VyZSBpbWFnZVwiKTtcblxuICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbcmVzcG9uc2UuYXJyYXlCdWZmZXJdLCB7XG4gICAgICB0eXBlOiByZXNwb25zZS5oZWFkZXJzW1wiY29udGVudC10eXBlXCJdID8/IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCIsXG4gICAgfSk7XG4gICAgY29uc3QgYmxvYlVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgdGhpcy5ldmljdEJsb2JVcmxzSWZOZWVkZWQoKTtcbiAgICB0aGlzLmJsb2JVcmxzLmFkZChibG9iVXJsKTtcbiAgICByZXR1cm4gYmxvYlVybDtcbiAgfVxuXG4gIHByaXZhdGUgZXZpY3RCbG9iVXJsc0lmTmVlZGVkKCkge1xuICAgIHdoaWxlICh0aGlzLmJsb2JVcmxzLnNpemUgPj0gdGhpcy5tYXhCbG9iVXJscykge1xuICAgICAgY29uc3Qgb2xkZXN0ID0gdGhpcy5ibG9iVXJscy52YWx1ZXMoKS5uZXh0KCkudmFsdWUhO1xuICAgICAgdGhpcy5ibG9iVXJscy5kZWxldGUob2xkZXN0KTtcbiAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwob2xkZXN0KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFycmF5QnVmZmVyVG9CYXNlNjQoYnVmZmVyOiBBcnJheUJ1ZmZlcikge1xuICAgIGNvbnN0IGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKTtcbiAgICBjb25zdCBjaHVua1NpemUgPSAweDgwMDA7XG4gICAgbGV0IGJpbmFyeSA9IFwiXCI7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGJ5dGVzLmxlbmd0aDsgaW5kZXggKz0gY2h1bmtTaXplKSB7XG4gICAgICBjb25zdCBjaHVuayA9IGJ5dGVzLnN1YmFycmF5KGluZGV4LCBpbmRleCArIGNodW5rU2l6ZSk7XG4gICAgICBiaW5hcnkgKz0gU3RyaW5nLmZyb21DaGFyQ29kZSguLi5jaHVuayk7XG4gICAgfVxuICAgIHJldHVybiBidG9hKGJpbmFyeSk7XG4gIH1cblxuICBwcml2YXRlIGJhc2U2NFRvQXJyYXlCdWZmZXIoYmFzZTY0OiBzdHJpbmcpIHtcbiAgICBjb25zdCBiaW5hcnkgPSBhdG9iKGJhc2U2NCk7XG4gICAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShiaW5hcnkubGVuZ3RoKTtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYmluYXJ5Lmxlbmd0aDsgaW5kZXggKz0gMSkge1xuICAgICAgYnl0ZXNbaW5kZXhdID0gYmluYXJ5LmNoYXJDb2RlQXQoaW5kZXgpO1xuICAgIH1cbiAgICByZXR1cm4gYnl0ZXMuYnVmZmVyLnNsaWNlKGJ5dGVzLmJ5dGVPZmZzZXQsIGJ5dGVzLmJ5dGVPZmZzZXQgKyBieXRlcy5ieXRlTGVuZ3RoKSBhcyBBcnJheUJ1ZmZlcjtcbiAgfVxuXG4gIHByaXZhdGUgYXJyYXlCdWZmZXJzRXF1YWwobGVmdDogQXJyYXlCdWZmZXIsIHJpZ2h0OiBBcnJheUJ1ZmZlcikge1xuICAgIGNvbnN0IGEgPSBuZXcgVWludDhBcnJheShsZWZ0KTtcbiAgICBjb25zdCBiID0gbmV3IFVpbnQ4QXJyYXkocmlnaHQpO1xuICAgIGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYS5sZW5ndGg7IGluZGV4ICs9IDEpIHtcbiAgICAgIGlmIChhW2luZGV4XSAhPT0gYltpbmRleF0pIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZENsaXBib2FyZEZpbGVOYW1lKG1pbWVUeXBlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBleHRlbnNpb24gPSBtaW1lVHlwZS5zcGxpdChcIi9cIilbMV0/LnJlcGxhY2UoXCJqcGVnXCIsIFwianBnXCIpIHx8IFwicG5nXCI7XG4gICAgcmV0dXJuIGBwYXN0ZWQtaW1hZ2UtJHtEYXRlLm5vdygpfS4ke2V4dGVuc2lvbn1gO1xuICB9XG5cbiAgcHJpdmF0ZSBlc2NhcGVSZWdFeHAodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgXCJcXFxcJCZcIik7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkUmVtb3RlUGF0aChmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGAke25vcm1hbGl6ZUZvbGRlcih0aGlzLnNldHRpbmdzLnJlbW90ZUZvbGRlcil9JHtmaWxlTmFtZX1gO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBidWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeShmaWxlTmFtZTogc3RyaW5nLCBiaW5hcnk6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgZXh0ZW5zaW9uID0gdGhpcy5nZXRFeHRlbnNpb25Gcm9tRmlsZU5hbWUoZmlsZU5hbWUpO1xuICAgIGlmICh0aGlzLnNldHRpbmdzLm5hbWluZ1N0cmF0ZWd5ID09PSBcImhhc2hcIikge1xuICAgICAgY29uc3QgaGFzaCA9IChhd2FpdCB0aGlzLmNvbXB1dGVTaGEyNTZIZXgoYmluYXJ5KSkuc2xpY2UoMCwgMTYpO1xuICAgICAgcmV0dXJuIGAke2hhc2h9LiR7ZXh0ZW5zaW9ufWA7XG4gICAgfVxuXG4gICAgcmV0dXJuIGAke0RhdGUubm93KCl9LSR7ZmlsZU5hbWV9YDtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgYmFzZSA9IHRoaXMuc2V0dGluZ3Mud2ViZGF2VXJsLnJlcGxhY2UoL1xcLyskLywgXCJcIik7XG4gICAgcmV0dXJuIGAke2Jhc2V9LyR7cmVtb3RlUGF0aC5zcGxpdChcIi9cIikubWFwKGVuY29kZVVSSUNvbXBvbmVudCkuam9pbihcIi9cIil9YDtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRBdXRoSGVhZGVyKCkge1xuICAgIGNvbnN0IHRva2VuID0gdGhpcy5hcnJheUJ1ZmZlclRvQmFzZTY0KHRoaXMuZW5jb2RlVXRmOChgJHt0aGlzLnNldHRpbmdzLnVzZXJuYW1lfToke3RoaXMuc2V0dGluZ3MucGFzc3dvcmR9YCkpO1xuICAgIHJldHVybiBgQmFzaWMgJHt0b2tlbn1gO1xuICB9XG5cbiAgcHJpdmF0ZSBlbnN1cmVDb25maWd1cmVkKCkge1xuICAgIGlmICghdGhpcy5zZXR0aW5ncy53ZWJkYXZVcmwgfHwgIXRoaXMuc2V0dGluZ3MudXNlcm5hbWUgfHwgIXRoaXMuc2V0dGluZ3MucGFzc3dvcmQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJXZWJEQVYgXHU5MTREXHU3RjZFXHU0RTBEXHU1QjhDXHU2NTc0XHUzMDAyXCIsIFwiV2ViREFWIHNldHRpbmdzIGFyZSBpbmNvbXBsZXRlLlwiKSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2U6IHsgc3RhdHVzOiBudW1iZXIgfSwgY29udGV4dDogc3RyaW5nKSB7XG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7Y29udGV4dH0gZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZ2V0TWltZVR5cGUoZXh0ZW5zaW9uOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gTUlNRV9NQVBbZXh0ZW5zaW9uLnRvTG93ZXJDYXNlKCldID8/IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCI7XG4gIH1cblxuICBwcml2YXRlIGdldE1pbWVUeXBlRnJvbUZpbGVOYW1lKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRNaW1lVHlwZSh0aGlzLmdldEV4dGVuc2lvbkZyb21GaWxlTmFtZShmaWxlTmFtZSkpO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRFeHRlbnNpb25Gcm9tRmlsZU5hbWUoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHBpZWNlcyA9IGZpbGVOYW1lLnNwbGl0KFwiLlwiKTtcbiAgICByZXR1cm4gcGllY2VzLmxlbmd0aCA+IDEgPyBwaWVjZXNbcGllY2VzLmxlbmd0aCAtIDFdLnRvTG93ZXJDYXNlKCkgOiBcInBuZ1wiO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwcmVwYXJlVXBsb2FkUGF5bG9hZChiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLmNvbXByZXNzSW1hZ2VzKSB7XG4gICAgICByZXR1cm4geyBiaW5hcnksIG1pbWVUeXBlLCBmaWxlTmFtZSB9O1xuICAgIH1cblxuICAgIGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdGhpcy5jb21wcmVzc0ltYWdlSWZOZWVkZWQoYmluYXJ5LCBtaW1lVHlwZSwgZmlsZU5hbWUpO1xuICAgIHJldHVybiBwcmVwYXJlZCA/PyB7IGJpbmFyeSwgbWltZVR5cGUsIGZpbGVOYW1lIH07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNvbXByZXNzSW1hZ2VJZk5lZWRlZChiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgaWYgKCEvXmltYWdlXFwvKHBuZ3xqcGVnfGpwZ3x3ZWJwKSQvaS50ZXN0KG1pbWVUeXBlKSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgdGhyZXNob2xkQnl0ZXMgPSB0aGlzLnNldHRpbmdzLmNvbXByZXNzVGhyZXNob2xkS2IgKiAxMDI0O1xuICAgIGNvbnN0IHNvdXJjZUJsb2IgPSBuZXcgQmxvYihbYmluYXJ5XSwgeyB0eXBlOiBtaW1lVHlwZSB9KTtcbiAgICBjb25zdCBpbWFnZSA9IGF3YWl0IHRoaXMubG9hZEltYWdlRWxlbWVudChzb3VyY2VCbG9iKTtcbiAgICBjb25zdCBsYXJnZXN0U2lkZSA9IE1hdGgubWF4KGltYWdlLm5hdHVyYWxXaWR0aCwgaW1hZ2UubmF0dXJhbEhlaWdodCk7XG4gICAgY29uc3QgbmVlZHNSZXNpemUgPSBsYXJnZXN0U2lkZSA+IHRoaXMuc2V0dGluZ3MubWF4SW1hZ2VEaW1lbnNpb247XG4gICAgY29uc3QgbmVlZHNDb21wcmVzcyA9IHNvdXJjZUJsb2Iuc2l6ZSA+IHRocmVzaG9sZEJ5dGVzIHx8IG5lZWRzUmVzaXplO1xuICAgIGlmICghbmVlZHNDb21wcmVzcykge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3Qgc2NhbGUgPSBuZWVkc1Jlc2l6ZSA/IHRoaXMuc2V0dGluZ3MubWF4SW1hZ2VEaW1lbnNpb24gLyBsYXJnZXN0U2lkZSA6IDE7XG4gICAgY29uc3QgdGFyZ2V0V2lkdGggPSBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKGltYWdlLm5hdHVyYWxXaWR0aCAqIHNjYWxlKSk7XG4gICAgY29uc3QgdGFyZ2V0SGVpZ2h0ID0gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChpbWFnZS5uYXR1cmFsSGVpZ2h0ICogc2NhbGUpKTtcbiAgICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiY2FudmFzXCIpO1xuICAgIGNhbnZhcy53aWR0aCA9IHRhcmdldFdpZHRoO1xuICAgIGNhbnZhcy5oZWlnaHQgPSB0YXJnZXRIZWlnaHQ7XG4gICAgY29uc3QgY29udGV4dCA9IGNhbnZhcy5nZXRDb250ZXh0KFwiMmRcIik7XG4gICAgaWYgKCFjb250ZXh0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb250ZXh0LmRyYXdJbWFnZShpbWFnZSwgMCwgMCwgdGFyZ2V0V2lkdGgsIHRhcmdldEhlaWdodCk7XG5cbiAgICBjb25zdCBvdXRwdXRNaW1lID0gbWltZVR5cGUudG9Mb3dlckNhc2UoKSA9PT0gXCJpbWFnZS9qcGdcIiA/IFwiaW1hZ2UvanBlZ1wiIDogbWltZVR5cGU7XG4gICAgY29uc3QgcXVhbGl0eSA9IE1hdGgubWF4KDAuNCwgTWF0aC5taW4oMC45OCwgdGhpcy5zZXR0aW5ncy5qcGVnUXVhbGl0eSAvIDEwMCkpO1xuICAgIGNvbnN0IGNvbXByZXNzZWRCbG9iID0gYXdhaXQgbmV3IFByb21pc2U8QmxvYiB8IG51bGw+KChyZXNvbHZlKSA9PiB7XG4gICAgICBjYW52YXMudG9CbG9iKHJlc29sdmUsIG91dHB1dE1pbWUsIHF1YWxpdHkpO1xuICAgIH0pO1xuXG4gICAgaWYgKCFjb21wcmVzc2VkQmxvYikge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaWYgKCFuZWVkc1Jlc2l6ZSAmJiBjb21wcmVzc2VkQmxvYi5zaXplID49IHNvdXJjZUJsb2Iuc2l6ZSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgbmV4dEJpbmFyeSA9IGF3YWl0IGNvbXByZXNzZWRCbG9iLmFycmF5QnVmZmVyKCk7XG4gICAgY29uc3QgbmV4dEV4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uRnJvbU1pbWVUeXBlKG91dHB1dE1pbWUpID8/IHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbUZpbGVOYW1lKGZpbGVOYW1lKTtcbiAgICBjb25zdCBuZXh0RmlsZU5hbWUgPSBmaWxlTmFtZS5yZXBsYWNlKC9cXC5bXi5dKyQvLCBcIlwiKSArIGAuJHtuZXh0RXh0ZW5zaW9ufWA7XG4gICAgcmV0dXJuIHtcbiAgICAgIGJpbmFyeTogbmV4dEJpbmFyeSxcbiAgICAgIG1pbWVUeXBlOiBvdXRwdXRNaW1lLFxuICAgICAgZmlsZU5hbWU6IG5leHRGaWxlTmFtZSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBsb2FkSW1hZ2VFbGVtZW50KGJsb2I6IEJsb2IpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2U8SFRNTEltYWdlRWxlbWVudD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgIGNvbnN0IGltYWdlID0gbmV3IEltYWdlKCk7XG4gICAgICBpbWFnZS5vbmxvYWQgPSAoKSA9PiB7XG4gICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwodXJsKTtcbiAgICAgICAgcmVzb2x2ZShpbWFnZSk7XG4gICAgICB9O1xuICAgICAgaW1hZ2Uub25lcnJvciA9IChlcnJvcikgPT4ge1xuICAgICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9O1xuICAgICAgaW1hZ2Uuc3JjID0gdXJsO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRlbnNpb25Gcm9tTWltZVR5cGUobWltZVR5cGU6IHN0cmluZykge1xuICAgIHJldHVybiBNSU1FX01BUFttaW1lVHlwZV0gPz8gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdHJhc2hJZkV4aXN0cyhmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LnRyYXNoKGZpbGUsIHRydWUpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oXCJGYWlsZWQgdG8gdHJhc2ggbG9jYWwgaW1hZ2UgYWZ0ZXIgdXBsb2FkXCIsIGVycm9yKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGZvcm1hdEVtYmVkTGFiZWwoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLnQoYFx1MzAxMFx1NUI4OVx1NTE2OFx1OEZEQ1x1N0EwQlx1NTZGRVx1NzI0N1x1RkY1QyR7ZmlsZU5hbWV9XHUzMDExYCwgYFtTZWN1cmUgcmVtb3RlIGltYWdlIHwgJHtmaWxlTmFtZX1dYCk7XG4gIH1cblxuICBwcml2YXRlIGZvcm1hdEZhaWxlZExhYmVsKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy50KGBcdTMwMTBcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTU5MzFcdThEMjVcdUZGNUMke2ZpbGVOYW1lfVx1MzAxMWAsIGBbSW1hZ2UgdXBsb2FkIGZhaWxlZCB8ICR7ZmlsZU5hbWV9XWApO1xuICB9XG5cbiAgYXN5bmMgbWlncmF0ZUFsbExlZ2FjeVNlY3VyZUltYWdlcygpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXBsb2FkQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgICAgY29uc3QgY2FuZGlkYXRlTG9jYWxJbWFnZXMgPSBuZXcgTWFwPHN0cmluZywgVEZpbGU+KCk7XG4gICAgICBsZXQgY2hhbmdlZEZpbGVzID0gMDtcbiAgICAgIGZvciAoY29uc3QgZmlsZSBvZiB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkpIHtcbiAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICAgIGNvbnN0IHJlcGxhY2VtZW50cyA9IGF3YWl0IHRoaXMuYnVpbGRVcGxvYWRSZXBsYWNlbWVudHMoY29udGVudCwgZmlsZSwgdXBsb2FkQ2FjaGUpO1xuICAgICAgICBmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIHJlcGxhY2VtZW50cykge1xuICAgICAgICAgIGlmIChyZXBsYWNlbWVudC5zb3VyY2VGaWxlKSB7XG4gICAgICAgICAgICBjYW5kaWRhdGVMb2NhbEltYWdlcy5zZXQocmVwbGFjZW1lbnQuc291cmNlRmlsZS5wYXRoLCByZXBsYWNlbWVudC5zb3VyY2VGaWxlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgdXBkYXRlZCA9IGNvbnRlbnQ7XG4gICAgICAgIGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgcmVwbGFjZW1lbnRzKSB7XG4gICAgICAgICAgdXBkYXRlZCA9IHVwZGF0ZWQuc3BsaXQocmVwbGFjZW1lbnQub3JpZ2luYWwpLmpvaW4ocmVwbGFjZW1lbnQucmV3cml0dGVuKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZWQgPSB1cGRhdGVkXG4gICAgICAgICAgLnJlcGxhY2UoXG4gICAgICAgICAgICAvPHNwYW4gY2xhc3M9XCJzZWN1cmUtd2ViZGF2LWVtYmVkXCIgZGF0YS1zZWN1cmUtd2ViZGF2PVwiKFteXCJdKylcIiBhcmlhLWxhYmVsPVwiKFteXCJdKilcIj4uKj88XFwvc3Bhbj4vZyxcbiAgICAgICAgICAgIChfbWF0Y2gsIHJlbW90ZVBhdGg6IHN0cmluZywgYWx0OiBzdHJpbmcpID0+XG4gICAgICAgICAgICAgIHRoaXMuaW1hZ2VTdXBwb3J0LmJ1aWxkU2VjdXJlSW1hZ2VDb2RlQmxvY2soXG4gICAgICAgICAgICAgICAgdGhpcy51bmVzY2FwZUh0bWwocmVtb3RlUGF0aCksXG4gICAgICAgICAgICAgICAgdGhpcy51bmVzY2FwZUh0bWwoYWx0KSB8fCB0aGlzLnVuZXNjYXBlSHRtbChyZW1vdGVQYXRoKSxcbiAgICAgICAgICAgICAgKSxcbiAgICAgICAgICApXG4gICAgICAgICAgLnJlcGxhY2UoXG4gICAgICAgICAgICAvIVxcW1teXFxdXSpdXFwod2ViZGF2LXNlY3VyZTpcXC9cXC8oW14pXSspXFwpL2csXG4gICAgICAgICAgICAoX21hdGNoLCByZW1vdGVQYXRoOiBzdHJpbmcpID0+XG4gICAgICAgICAgICAgIHRoaXMuaW1hZ2VTdXBwb3J0LmJ1aWxkU2VjdXJlSW1hZ2VDb2RlQmxvY2sodGhpcy51bmVzY2FwZUh0bWwocmVtb3RlUGF0aCksIHRoaXMudW5lc2NhcGVIdG1sKHJlbW90ZVBhdGgpKSxcbiAgICAgICAgICApO1xuXG4gICAgICAgIGlmICh1cGRhdGVkID09PSBjb250ZW50KSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdXBkYXRlZCk7XG4gICAgICAgIGNoYW5nZWRGaWxlcyArPSAxO1xuICAgICAgfVxuXG4gICAgICBpZiAoY2hhbmdlZEZpbGVzID09PSAwKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgXCJcdTY1NzRcdTVFOTNcdTkxQ0NcdTZDQTFcdTY3MDlcdTUzRDFcdTczQjBcdTUzRUZcdThGQzFcdTc5RkJcdTc2ODRcdTY1RTdcdTcyNDhcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTY4MDdcdTdCN0VcdTMwMDJcIixcbiAgICAgICAgICAgIFwiTm8gbGVnYWN5IHNlY3VyZSBpbWFnZSB0YWdzIHdlcmUgZm91bmQgaW4gdGhlIHZhdWx0LlwiLFxuICAgICAgICAgICksXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZGVsZXRlTG9jYWxBZnRlclVwbG9hZCkge1xuICAgICAgICBhd2FpdCB0aGlzLnRyYXNoTWlncmF0ZWRJbWFnZXNJZlNhZmUoY2FuZGlkYXRlTG9jYWxJbWFnZXMpO1xuICAgICAgfVxuXG4gICAgICBuZXcgTm90aWNlKFxuICAgICAgdGhpcy50KFxuICAgICAgICBgXHU1REYyXHU4RkMxXHU3OUZCICR7Y2hhbmdlZEZpbGVzfSBcdTdCQzdcdTdCMTRcdThCQjBcdTUyMzBcdTY1QjBcdTc2ODRcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTRFRTNcdTc4MDFcdTU3NTdcdTY4M0NcdTVGMEZcdTMwMDJgLFxuICAgICAgICBgTWlncmF0ZWQgJHtjaGFuZ2VkRmlsZXN9IG5vdGUocykgdG8gdGhlIG5ldyBzZWN1cmUgaW1hZ2UgY29kZS1ibG9jayBmb3JtYXQuYCxcbiAgICAgICksXG4gICAgICAgIDgwMDAsXG4gICAgICApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIG1pZ3JhdGUgc2VjdXJlIGltYWdlcyB0byBjb2RlIGJsb2Nrc1wiLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdThGQzFcdTc5RkJcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTY4M0NcdTVGMEZcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gbWlncmF0ZSBzZWN1cmUgaW1hZ2UgZm9ybWF0XCIpLCBlcnJvciksIDgwMDApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdHJhc2hNaWdyYXRlZEltYWdlc0lmU2FmZShjYW5kaWRhdGVMb2NhbEltYWdlczogTWFwPHN0cmluZywgVEZpbGU+KSB7XG4gICAgaWYgKGNhbmRpZGF0ZUxvY2FsSW1hZ2VzLnNpemUgPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCByZW1haW5pbmdSZWZzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgZm9yIChjb25zdCBub3RlIG9mIHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKSkge1xuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQobm90ZSk7XG4gICAgICBjb25zdCB3aWtpTWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKC8hXFxbXFxbKFteXFxdXSspXFxdXFxdL2cpXTtcbiAgICAgIGNvbnN0IG1hcmtkb3duTWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKC8hXFxbW15cXF1dKl1cXCgoW14pXSspXFwpL2cpXTtcblxuICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiB3aWtpTWF0Y2hlcykge1xuICAgICAgICBjb25zdCByYXdMaW5rID0gbWF0Y2hbMV0uc3BsaXQoXCJ8XCIpWzBdLnRyaW0oKTtcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5yZXNvbHZlTGlua2VkRmlsZShyYXdMaW5rLCBub3RlLnBhdGgpO1xuICAgICAgICBpZiAodGFyZ2V0ICYmIHRoaXMuaXNJbWFnZUZpbGUodGFyZ2V0KSkge1xuICAgICAgICAgIHJlbWFpbmluZ1JlZnMuYWRkKHRhcmdldC5wYXRoKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIG1hcmtkb3duTWF0Y2hlcykge1xuICAgICAgICBjb25zdCByYXdMaW5rID0gZGVjb2RlVVJJQ29tcG9uZW50KG1hdGNoWzFdLnRyaW0oKS5yZXBsYWNlKC9ePHw+JC9nLCBcIlwiKSk7XG4gICAgICAgIGlmICgvXihodHRwcz86fHdlYmRhdi1zZWN1cmU6fGRhdGE6KS9pLnRlc3QocmF3TGluaykpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMucmVzb2x2ZUxpbmtlZEZpbGUocmF3TGluaywgbm90ZS5wYXRoKTtcbiAgICAgICAgaWYgKHRhcmdldCAmJiB0aGlzLmlzSW1hZ2VGaWxlKHRhcmdldCkpIHtcbiAgICAgICAgICByZW1haW5pbmdSZWZzLmFkZCh0YXJnZXQucGF0aCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IFtwYXRoLCBmaWxlXSBvZiBjYW5kaWRhdGVMb2NhbEltYWdlcy5lbnRyaWVzKCkpIHtcbiAgICAgIGlmIChyZW1haW5pbmdSZWZzLmhhcyhwYXRoKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy50cmFzaElmRXhpc3RzKGZpbGUpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJ1bkNvbm5lY3Rpb25UZXN0KHNob3dNb2RhbCA9IGZhbHNlKSB7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xuXG4gICAgICBjb25zdCBwcm9iZU5hbWUgPSBgLnNlY3VyZS13ZWJkYXYtcHJvYmUtJHtEYXRlLm5vdygpfS50eHRgO1xuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRSZW1vdGVQYXRoKHByb2JlTmFtZSk7XG4gICAgICBjb25zdCB1cGxvYWRVcmwgPSB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpO1xuICAgICAgY29uc3QgcHJvYmVBcnJheUJ1ZmZlciA9IHRoaXMuZW5jb2RlVXRmOChgc2VjdXJlLXdlYmRhdiBwcm9iZSAke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKX1gKTtcblxuICAgICAgY29uc3QgcHV0UmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHVwbG9hZFVybCxcbiAgICAgICAgbWV0aG9kOiBcIlBVVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcInRleHQvcGxhaW47IGNoYXJzZXQ9dXRmLThcIixcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogcHJvYmVBcnJheUJ1ZmZlcixcbiAgICAgIH0pO1xuICAgICAgaWYgKHB1dFJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCBwdXRSZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgUFVUIGZhaWxlZCB3aXRoIHN0YXR1cyAke3B1dFJlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZ2V0UmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHVwbG9hZFVybCxcbiAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgaWYgKGdldFJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCBnZXRSZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgR0VUIGZhaWxlZCB3aXRoIHN0YXR1cyAke2dldFJlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZGVsZXRlUmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHVwbG9hZFVybCxcbiAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgaWYgKGRlbGV0ZVJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCBkZWxldGVSZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgREVMRVRFIGZhaWxlZCB3aXRoIHN0YXR1cyAke2RlbGV0ZVJlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbWVzc2FnZSA9IHRoaXMudChcbiAgICAgICAgYFdlYkRBViBcdTZENEJcdThCRDVcdTkwMUFcdThGQzdcdTMwMDJQVVQgJHtwdXRSZXNwb25zZS5zdGF0dXN9XHVGRjBDR0VUICR7Z2V0UmVzcG9uc2Uuc3RhdHVzfVx1RkYwQ0RFTEVURSAke2RlbGV0ZVJlc3BvbnNlLnN0YXR1c31cdTMwMDJgLFxuICAgICAgICBgV2ViREFWIHRlc3QgcGFzc2VkLiBQVVQgJHtwdXRSZXNwb25zZS5zdGF0dXN9LCBHRVQgJHtnZXRSZXNwb25zZS5zdGF0dXN9LCBERUxFVEUgJHtkZWxldGVSZXNwb25zZS5zdGF0dXN9LmAsXG4gICAgICApO1xuICAgICAgbmV3IE5vdGljZShtZXNzYWdlLCA2MDAwKTtcbiAgICAgIGlmIChzaG93TW9kYWwpIHtcbiAgICAgICAgbmV3IFJlc3VsdE1vZGFsKHRoaXMuYXBwLCB0aGlzLnQoXCJXZWJEQVYgXHU4RkRFXHU2M0E1XCIsIFwiV2ViREFWIENvbm5lY3Rpb25cIiksIG1lc3NhZ2UpLm9wZW4oKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiU2VjdXJlIFdlYkRBViB0ZXN0IGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICBjb25zdCBtZXNzYWdlID0gdGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIldlYkRBViBcdTZENEJcdThCRDVcdTU5MzFcdThEMjVcIiwgXCJXZWJEQVYgdGVzdCBmYWlsZWRcIiksIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UobWVzc2FnZSwgODAwMCk7XG4gICAgICBpZiAoc2hvd01vZGFsKSB7XG4gICAgICAgIG5ldyBSZXN1bHRNb2RhbCh0aGlzLmFwcCwgdGhpcy50KFwiV2ViREFWIFx1OEZERVx1NjNBNVwiLCBcIldlYkRBViBDb25uZWN0aW9uXCIpLCBtZXNzYWdlKS5vcGVuKCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBkZXNjcmliZUVycm9yKHByZWZpeDogc3RyaW5nLCBlcnJvcjogdW5rbm93bikge1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG4gICAgcmV0dXJuIGAke3ByZWZpeH06ICR7bWVzc2FnZX1gO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZXF1ZXN0VXJsKG9wdGlvbnM6IHtcbiAgICB1cmw6IHN0cmluZztcbiAgICBtZXRob2Q6IHN0cmluZztcbiAgICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgICBib2R5PzogQXJyYXlCdWZmZXI7XG4gICAgZm9sbG93UmVkaXJlY3RzPzogYm9vbGVhbjtcbiAgICByZWRpcmVjdENvdW50PzogbnVtYmVyO1xuICB9KTogUHJvbWlzZTx7IHN0YXR1czogbnVtYmVyOyBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+OyBhcnJheUJ1ZmZlcjogQXJyYXlCdWZmZXIgfT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb2JzaWRpYW5SZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogb3B0aW9ucy51cmwsXG4gICAgICBtZXRob2Q6IG9wdGlvbnMubWV0aG9kLFxuICAgICAgaGVhZGVyczogb3B0aW9ucy5oZWFkZXJzLFxuICAgICAgYm9keTogb3B0aW9ucy5ib2R5LFxuICAgICAgdGhyb3c6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogcmVzcG9uc2Uuc3RhdHVzLFxuICAgICAgaGVhZGVyczogcmVzcG9uc2UuaGVhZGVycyxcbiAgICAgIGFycmF5QnVmZmVyOiByZXNwb25zZS5hcnJheUJ1ZmZlcixcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBlbmNvZGVVdGY4KHZhbHVlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBieXRlcyA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSh2YWx1ZSk7XG4gICAgcmV0dXJuIGJ5dGVzLmJ1ZmZlci5zbGljZShieXRlcy5ieXRlT2Zmc2V0LCBieXRlcy5ieXRlT2Zmc2V0ICsgYnl0ZXMuYnl0ZUxlbmd0aCkgYXMgQXJyYXlCdWZmZXI7XG4gIH1cblxuICBwcml2YXRlIGRlY29kZVV0ZjgoYnVmZmVyOiBBcnJheUJ1ZmZlcikge1xuICAgIHJldHVybiBuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoYnVmZmVyKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY29tcHV0ZVNoYTI1NkhleChidWZmZXI6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgZGlnZXN0ID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3QoXCJTSEEtMjU2XCIsIGJ1ZmZlcik7XG4gICAgcmV0dXJuIEFycmF5LmZyb20obmV3IFVpbnQ4QXJyYXkoZGlnZXN0KSlcbiAgICAgIC5tYXAoKHZhbHVlKSA9PiB2YWx1ZS50b1N0cmluZygxNikucGFkU3RhcnQoMiwgXCIwXCIpKVxuICAgICAgLmpvaW4oXCJcIik7XG4gIH1cbn1cblxudHlwZSBVcGxvYWRSZXdyaXRlID0ge1xuICBvcmlnaW5hbDogc3RyaW5nO1xuICByZXdyaXR0ZW46IHN0cmluZztcbiAgc291cmNlRmlsZT86IFRGaWxlO1xufTtcblxuY2xhc3MgU2VjdXJlV2ViZGF2U2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuICBwbHVnaW46IFNlY3VyZVdlYmRhdkltYWdlc1BsdWdpbjtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBTZWN1cmVXZWJkYXZJbWFnZXNQbHVnaW4pIHtcbiAgICBzdXBlcihhcHAsIHBsdWdpbik7XG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gIH1cblxuICBkaXNwbGF5KCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XG4gICAgY29udGFpbmVyRWwuZW1wdHkoKTtcblxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIlNlY3VyZSBXZWJEQVYgSW1hZ2VzXCIgfSk7XG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJwXCIsIHtcbiAgICAgIHRleHQ6IHRoaXMucGx1Z2luLnQoXG4gICAgICAgIFwiXHU4RkQ5XHU0RTJBXHU2M0QyXHU0RUY2XHU1M0VBXHU2MjhBXHU1NkZFXHU3MjQ3XHU1MjY1XHU3OUJCXHU1MjMwXHU1MzU1XHU3MkVDXHU3Njg0XHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHVGRjBDXHU1RTc2XHU0RkREXHU1QjU4XHU0RTNBIHNlY3VyZS13ZWJkYXYgXHU4MUVBXHU1QjlBXHU0RTQ5XHU0RUUzXHU3ODAxXHU1NzU3XHVGRjFCXHU1MTc2XHU0RUQ2XHU3QjE0XHU4QkIwXHU1NDhDXHU5NjQ0XHU0RUY2XHU2MzA5XHU1MzlGXHU4REVGXHU1Rjg0XHU1MzlGXHU2ODM3XHU1NDBDXHU2QjY1XHUzMDAyXCIsXG4gICAgICAgIFwiVGhpcyBwbHVnaW4gc2VwYXJhdGVzIG9ubHkgaW1hZ2VzIGludG8gYSBkZWRpY2F0ZWQgcmVtb3RlIGZvbGRlciBhbmQgc3RvcmVzIHRoZW0gYXMgc2VjdXJlLXdlYmRhdiBjdXN0b20gY29kZSBibG9ja3MuIE5vdGVzIGFuZCBvdGhlciBhdHRhY2htZW50cyBhcmUgc3luY2VkIGFzLWlzIHdpdGggdGhlaXIgb3JpZ2luYWwgcGF0aHMuXCIsXG4gICAgICApLFxuICAgIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU1RjUzXHU1MjREXHU2M0QyXHU0RUY2XHU3MjQ4XHU2NzJDXCIsIFwiQ3VycmVudCBwbHVnaW4gdmVyc2lvblwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU1OTFBXHU3QUVGXHU0RjdGXHU3NTI4XHU2NUY2XHU1M0VGXHU1MTQ4XHU2ODM4XHU1QkY5XHU4RkQ5XHU5MUNDXHU3Njg0XHU3MjQ4XHU2NzJDXHU1M0Y3XHVGRjBDXHU5MDdGXHU1MTREXHU1NkUwXHU0RTNBXHU1QkEyXHU2MjM3XHU3QUVGXHU1MzQ3XHU3RUE3XHU0RTBEXHU1MjMwXHU0RjREXHU1QkZDXHU4MUY0XHU4ODRDXHU0RTNBXHU0RTBEXHU0RTAwXHU4MUY0XHUzMDAyXCIsXG4gICAgICAgICAgXCJDaGVjayB0aGlzIHZlcnNpb24gZmlyc3QgYWNyb3NzIGRldmljZXMgdG8gYXZvaWQgaW5jb25zaXN0ZW50IGJlaGF2aW9yIGNhdXNlZCBieSBpbmNvbXBsZXRlIHVwZ3JhZGVzLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+IHtcbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5tYW5pZmVzdC52ZXJzaW9uKTtcbiAgICAgICAgdGV4dC5zZXREaXNhYmxlZCh0cnVlKTtcbiAgICAgIH0pO1xuXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMucGx1Z2luLnQoXCJcdTc1NENcdTk3NjJcdThCRURcdThBMDBcIiwgXCJJbnRlcmZhY2UgbGFuZ3VhZ2VcIikgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdThCRURcdThBMDBcIiwgXCJMYW5ndWFnZVwiKSlcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdThCQkVcdTdGNkVcdTk4NzVcdTY1MkZcdTYzMDFcdTgxRUFcdTUyQThcdTMwMDFcdTRFMkRcdTY1ODdcdTMwMDFcdTgyRjFcdTY1ODdcdTUyMDdcdTYzNjJcdTMwMDJcIiwgXCJTd2l0Y2ggdGhlIHNldHRpbmdzIFVJIGJldHdlZW4gYXV0bywgQ2hpbmVzZSwgYW5kIEVuZ2xpc2guXCIpKVxuICAgICAgLmFkZERyb3Bkb3duKChkcm9wZG93bikgPT5cbiAgICAgICAgZHJvcGRvd25cbiAgICAgICAgICAuYWRkT3B0aW9uKFwiYXV0b1wiLCB0aGlzLnBsdWdpbi50KFwiXHU4MUVBXHU1MkE4XCIsIFwiQXV0b1wiKSlcbiAgICAgICAgICAuYWRkT3B0aW9uKFwiemhcIiwgXCJcdTRFMkRcdTY1ODdcIilcbiAgICAgICAgICAuYWRkT3B0aW9uKFwiZW5cIiwgXCJFbmdsaXNoXCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxhbmd1YWdlKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmxhbmd1YWdlID0gdmFsdWUgYXMgXCJhdXRvXCIgfCBcInpoXCIgfCBcImVuXCI7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiB0aGlzLnBsdWdpbi50KFwiXHU4RkRFXHU2M0E1XHU4QkJFXHU3RjZFXCIsIFwiQ29ubmVjdGlvblwiKSB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIldlYkRBViBcdTU3RkFcdTc4NDBcdTU3MzBcdTU3NDBcIiwgXCJXZWJEQVYgYmFzZSBVUkxcIikpXG4gICAgICAuc2V0RGVzYyh0aGlzLnBsdWdpbi50KFwiXHU2NzBEXHU1MkExXHU1NjY4XHU1N0ZBXHU3ODQwXHU1NzMwXHU1NzQwXHVGRjBDXHU0RjhCXHU1OTgyXHVGRjFBaHR0cDovL3lvdXItd2ViZGF2LWhvc3Q6cG9ydFwiLCBcIkJhc2Ugc2VydmVyIFVSTC4gRXhhbXBsZTogaHR0cDovL3lvdXItd2ViZGF2LWhvc3Q6cG9ydFwiKSlcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiaHR0cDovL3lvdXItd2ViZGF2LWhvc3Q6cG9ydFwiKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy53ZWJkYXZVcmwpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Mud2ViZGF2VXJsID0gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4RDI2XHU1M0Y3XCIsIFwiVXNlcm5hbWVcIikpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VybmFtZSkub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlcm5hbWUgPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NUJDNlx1NzgwMVwiLCBcIlBhc3N3b3JkXCIpKVxuICAgICAgLnNldERlc2ModGhpcy5wbHVnaW4udChcIlx1OUVEOFx1OEJBNFx1OTY5MFx1ODVDRlx1RkYwQ1x1NTNFRlx1NzBCOVx1NTFGQlx1NTNGM1x1NEZBN1x1NjMwOVx1OTRBRVx1NjYzRVx1NzkzQVx1NjIxNlx1OTY5MFx1ODVDRlx1MzAwMlwiLCBcIkhpZGRlbiBieSBkZWZhdWx0LiBVc2UgdGhlIGJ1dHRvbiBvbiB0aGUgcmlnaHQgdG8gc2hvdyBvciBoaWRlIGl0LlwiKSlcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PiB7XG4gICAgICAgIHRleHQuaW5wdXRFbC50eXBlID0gXCJwYXNzd29yZFwiO1xuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnBhc3N3b3JkKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXNzd29yZCA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAuYWRkRXh0cmFCdXR0b24oKGJ1dHRvbikgPT4ge1xuICAgICAgICBsZXQgdmlzaWJsZSA9IGZhbHNlO1xuICAgICAgICBidXR0b24uc2V0SWNvbihcImV5ZVwiKTtcbiAgICAgICAgYnV0dG9uLnNldFRvb2x0aXAodGhpcy5wbHVnaW4udChcIlx1NjYzRVx1NzkzQVx1NUJDNlx1NzgwMVwiLCBcIlNob3cgcGFzc3dvcmRcIikpO1xuICAgICAgICBidXR0b24ub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgY29uc3QgaW5wdXQgPSBidXR0b24uZXh0cmFTZXR0aW5nc0VsLnBhcmVudEVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3IoXCJpbnB1dFwiKTtcbiAgICAgICAgICBpZiAoIShpbnB1dCBpbnN0YW5jZW9mIEhUTUxJbnB1dEVsZW1lbnQpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdmlzaWJsZSA9ICF2aXNpYmxlO1xuICAgICAgICAgIGlucHV0LnR5cGUgPSB2aXNpYmxlID8gXCJ0ZXh0XCIgOiBcInBhc3N3b3JkXCI7XG4gICAgICAgICAgYnV0dG9uLnNldEljb24odmlzaWJsZSA/IFwiZXllLW9mZlwiIDogXCJleWVcIik7XG4gICAgICAgICAgYnV0dG9uLnNldFRvb2x0aXAodGhpcy5wbHVnaW4udCh2aXNpYmxlID8gXCJcdTk2OTBcdTg1Q0ZcdTVCQzZcdTc4MDFcIiA6IFwiXHU2NjNFXHU3OTNBXHU1QkM2XHU3ODAxXCIsIHZpc2libGUgPyBcIkhpZGUgcGFzc3dvcmRcIiA6IFwiU2hvdyBwYXNzd29yZFwiKSk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTU2RkVcdTcyNDdcdThGRENcdTdBMEJcdTc2RUVcdTVGNTVcIiwgXCJJbWFnZSByZW1vdGUgZm9sZGVyXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTRFMTNcdTk1RThcdTc1MjhcdTRFOEVcdTVCNThcdTY1M0VcdThGRENcdTdBMEJcdTU2RkVcdTcyNDdcdTc2ODQgV2ViREFWIFx1NzZFRVx1NUY1NVx1RkYwQ1x1NEY4Qlx1NTk4Mlx1RkYxQS9yZW1vdGUtaW1hZ2VzL1x1MzAwMlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NjIxMFx1NTI5Rlx1NTQwRVx1NEYxQVx1N0FDQlx1NTM3M1x1NTIyMFx1OTY2NFx1NjcyQ1x1NTczMFx1NTZGRVx1NzI0N1x1NjU4N1x1NEVGNlx1MzAwMlwiLFxuICAgICAgICAgIFwiRGVkaWNhdGVkIFdlYkRBViBmb2xkZXIgZm9yIHJlbW90ZSBpbWFnZXMsIGZvciBleGFtcGxlOiAvcmVtb3RlLWltYWdlcy8uIExvY2FsIGltYWdlIGZpbGVzIGFyZSBkZWxldGVkIGltbWVkaWF0ZWx5IGFmdGVyIHVwbG9hZCBzdWNjZWVkcy5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnJlbW90ZUZvbGRlcikub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmVtb3RlRm9sZGVyID0gbm9ybWFsaXplUGF0aCh2YWx1ZS50cmltKCkgfHwgXCIvcmVtb3RlLWltYWdlcy9cIik7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NkQ0Qlx1OEJENVx1OEZERVx1NjNBNVwiLCBcIlRlc3QgY29ubmVjdGlvblwiKSlcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdTRGN0ZcdTc1MjhcdTRFMzRcdTY1RjZcdTYzQTJcdTk0ODhcdTY1ODdcdTRFRjZcdTlBOENcdThCQzEgUFVUXHUzMDAxR0VUXHUzMDAxREVMRVRFIFx1NjYyRlx1NTQyNlx1NkI2M1x1NUUzOFx1MzAwMlwiLCBcIlZlcmlmeSBQVVQsIEdFVCwgYW5kIERFTEVURSB1c2luZyBhIHRlbXBvcmFyeSBwcm9iZSBmaWxlLlwiKSlcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodGhpcy5wbHVnaW4udChcIlx1NUYwMFx1NTlDQlx1NkQ0Qlx1OEJENVwiLCBcIlJ1biB0ZXN0XCIpKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnJ1bkNvbm5lY3Rpb25UZXN0KHRydWUpO1xuICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQoZmFsc2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMucGx1Z2luLnQoXCJcdTU0MENcdTZCNjVcdThCQkVcdTdGNkVcIiwgXCJTeW5jXCIpIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4RkRDXHU3QTBCXHU3QjE0XHU4QkIwXHU3NkVFXHU1RjU1XCIsIFwiUmVtb3RlIG5vdGVzIGZvbGRlclwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU3NTI4XHU0RThFXHU1QjU4XHU2NTNFXHU3QjE0XHU4QkIwXHU1NDhDXHU1MTc2XHU0RUQ2XHU5NzVFXHU1NkZFXHU3MjQ3XHU5NjQ0XHU0RUY2XHU1MzlGXHU2ODM3XHU1NDBDXHU2QjY1XHU1MjZGXHU2NzJDXHU3Njg0XHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHVGRjBDXHU0RjhCXHU1OTgyXHVGRjFBL3ZhdWx0LXN5bmMvXHUzMDAyXHU2M0QyXHU0RUY2XHU0RjFBXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU2NTc0XHU0RTJBIHZhdWx0XHVGRjBDXHU1RTc2XHU4REYzXHU4RkM3IC5vYnNpZGlhblx1MzAwMVx1NjNEMlx1NEVGNlx1NzZFRVx1NUY1NVx1NTQ4Q1x1NTZGRVx1NzI0N1x1NjU4N1x1NEVGNlx1MzAwMlwiLFxuICAgICAgICAgIFwiUmVtb3RlIGZvbGRlciB1c2VkIGZvciBub3RlcyBhbmQgb3RoZXIgbm9uLWltYWdlIGF0dGFjaG1lbnRzIHN5bmNlZCBhcy1pcywgZm9yIGV4YW1wbGU6IC92YXVsdC1zeW5jLy4gVGhlIHBsdWdpbiBzeW5jcyB0aGUgd2hvbGUgdmF1bHQgYW5kIGF1dG9tYXRpY2FsbHkgc2tpcHMgLm9ic2lkaWFuLCB0aGUgcGx1Z2luIGRpcmVjdG9yeSwgYW5kIGltYWdlIGZpbGVzLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIgPSBub3JtYWxpemVQYXRoKHZhbHVlLnRyaW0oKSB8fCBcIi92YXVsdC1zeW5jL1wiKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU0RTBEXHU1NDBDXHU2QjY1XHU3NkVFXHU1RjU1XCIsIFwiRXhjbHVkZWQgc3luYyBmb2xkZXJzXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdThGRDlcdTRFOUIgdmF1bHQgXHU3NkVFXHU1RjU1XHU0RTBEXHU0RjFBXHU4OEFCXHU1MTg1XHU1QkI5XHU1NDBDXHU2QjY1XHU0RTBBXHU0RjIwXHUzMDAxXHU0RUNFXHU4RkRDXHU3QUVGXHU2MDYyXHU1OTBEXHU2MjE2XHU4RkRCXHU4ODRDXHU3NkVFXHU1RjU1XHU1QkY5XHU4RDI2XHUzMDAyXHU2NTJGXHU2MzAxXHU5MDE3XHU1M0Y3XHU2MjE2XHU2MzYyXHU4ODRDXHU1MjA2XHU5Njk0XHVGRjBDXHU5RUQ4XHU4QkE0XHVGRjFBa2JcdTMwMDJcIixcbiAgICAgICAgICBcIlRoZXNlIHZhdWx0IGZvbGRlcnMgYXJlIG5vdCB1cGxvYWRlZCwgcmVzdG9yZWQgZnJvbSByZW1vdGUsIG9yIHJlY29uY2lsZWQgYXMgZGlyZWN0b3JpZXMuIFNlcGFyYXRlIGVudHJpZXMgd2l0aCBjb21tYXMgb3IgbmV3IGxpbmVzLiBEZWZhdWx0OiBrYi5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0QXJlYSgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImtiXCIpXG4gICAgICAgICAgLnNldFZhbHVlKCh0aGlzLnBsdWdpbi5zZXR0aW5ncy5leGNsdWRlZFN5bmNGb2xkZXJzID8/IFtdKS5qb2luKFwiXFxuXCIpKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmV4Y2x1ZGVkU3luY0ZvbGRlcnMgPSB2YWx1ZS5zcGxpdCgvWyxcXG5dLyk7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5ub3JtYWxpemVFZmZlY3RpdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU5ODkxXHU3Mzg3XCIsIFwiQXV0byBzeW5jIGZyZXF1ZW5jeVwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU0RUU1XHU1MjA2XHU5NDlGXHU0RTNBXHU1MzU1XHU0RjREXHU4QkJFXHU3RjZFXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU2NUY2XHU5NUY0XHUzMDAyXHU1ODZCIDAgXHU4ODY4XHU3OTNBXHU1MTczXHU5NUVEXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHUzMDAyXHU4RkQ5XHU5MUNDXHU3Njg0XHU1NDBDXHU2QjY1XHU2NjJGXHUyMDFDXHU1QkY5XHU4RDI2XHU1NDBDXHU2QjY1XHUyMDFEXHVGRjFBXHU0RjFBXHU2OEMwXHU2N0U1XHU2NzJDXHU1NzMwXHU0RTBFXHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHU1REVFXHU1RjAyXHVGRjBDXHU4ODY1XHU0RjIwXHU2NUIwXHU1ODlFXHU1NDhDXHU1M0Q4XHU2NkY0XHU2NTg3XHU0RUY2XHVGRjBDXHU1RTc2XHU1MjIwXHU5NjY0XHU4RkRDXHU3QUVGXHU1OTFBXHU0RjU5XHU1MTg1XHU1QkI5XHUzMDAyXCIsXG4gICAgICAgICAgXCJTZXQgdGhlIGF1dG9tYXRpYyBzeW5jIGludGVydmFsIGluIG1pbnV0ZXMuIFVzZSAwIHRvIHR1cm4gaXQgb2ZmLiBUaGlzIGlzIGEgcmVjb25jaWxpYXRpb24gc3luYzogaXQgY2hlY2tzIGxvY2FsIGFuZCByZW1vdGUgZGlmZmVyZW5jZXMsIHVwbG9hZHMgbmV3IG9yIGNoYW5nZWQgZmlsZXMsIGFuZCByZW1vdmVzIGV4dHJhIHJlbW90ZSBjb250ZW50LlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCIwXCIpXG4gICAgICAgICAgLnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvU3luY0ludGVydmFsTWludXRlcykpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gTnVtYmVyLnBhcnNlSW50KHZhbHVlLCAxMCk7XG4gICAgICAgICAgICBpZiAoIU51bWJlci5pc05hTihwYXJzZWQpKSB7XG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzID0gTWF0aC5tYXgoMCwgcGFyc2VkKTtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU3QjE0XHU4QkIwXHU2NzJDXHU1NzMwXHU0RkREXHU3NTU5XHU2QTIxXHU1RjBGXCIsIFwiTm90ZSBsb2NhbCByZXRlbnRpb24gbW9kZVwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU1QjhDXHU2NTc0XHU2NzJDXHU1NzMwXHVGRjFBXHU3QjE0XHU4QkIwXHU1OUNCXHU3RUM4XHU0RkREXHU3NTU5XHU1NzI4XHU2NzJDXHU1NzMwXHUzMDAyXHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXHVGRjFBXHU5NTdGXHU2NzFGXHU2NzJBXHU4QkJGXHU5NUVFXHU3Njg0IE1hcmtkb3duIFx1N0IxNFx1OEJCMFx1NEYxQVx1ODhBQlx1NjZGRlx1NjM2Mlx1NEUzQVx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1NjU4N1x1NEVGNlx1RkYwQ1x1NjI1M1x1NUYwMFx1NjVGNlx1NTE4RFx1NEVDRVx1OEZEQ1x1N0FFRlx1NjA2Mlx1NTkwRFx1MzAwMlwiLFxuICAgICAgICAgIFwiRnVsbCBsb2NhbDogbm90ZXMgYWx3YXlzIHN0YXkgbG9jYWwuIExhenkgbm90ZXM6IHN0YWxlIE1hcmtkb3duIG5vdGVzIGFyZSByZXBsYWNlZCB3aXRoIGxvY2FsIHBsYWNlaG9sZGVyIGZpbGVzIGFuZCByZXN0b3JlZCBmcm9tIHJlbW90ZSB3aGVuIG9wZW5lZC5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGREcm9wZG93bigoZHJvcGRvd24pID0+XG4gICAgICAgIGRyb3Bkb3duXG4gICAgICAgICAgLmFkZE9wdGlvbihcImZ1bGwtbG9jYWxcIiwgdGhpcy5wbHVnaW4udChcIlx1NUI4Q1x1NjU3NFx1NjcyQ1x1NTczMFwiLCBcIkZ1bGwgbG9jYWxcIikpXG4gICAgICAgICAgLmFkZE9wdGlvbihcImxhenktbm90ZXNcIiwgdGhpcy5wbHVnaW4udChcIlx1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFwiLCBcIkxhenkgbm90ZXNcIikpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVTdG9yYWdlTW9kZSlcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlU3RvcmFnZU1vZGUgPSB2YWx1ZSBhcyBcImZ1bGwtbG9jYWxcIiB8IFwibGF6eS1ub3Rlc1wiO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU3QjE0XHU4QkIwXHU2NzJDXHU1NzMwXHU1NkRFXHU2NTM2XHU1OTI5XHU2NTcwXCIsIFwiTm90ZSBldmljdGlvbiBkYXlzXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTRFQzVcdTU3MjhcdTIwMUNcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTdCMTRcdThCQjBcdTIwMURcdTZBMjFcdTVGMEZcdTRFMEJcdTc1MUZcdTY1NDhcdTMwMDJcdThEODVcdThGQzdcdThGRDlcdTRFMkFcdTU5MjlcdTY1NzBcdTY3MkFcdTYyNTNcdTVGMDBcdTc2ODQgTWFya2Rvd24gXHU3QjE0XHU4QkIwXHVGRjBDXHU0RjFBXHU1NzI4XHU1NDBDXHU2QjY1XHU1NDBFXHU4OEFCXHU2NkZGXHU2MzYyXHU0RTNBXHU2NzJDXHU1NzMwXHU1MzYwXHU0RjREXHU2NTg3XHU0RUY2XHUzMDAyXCIsXG4gICAgICAgICAgXCJVc2VkIG9ubHkgaW4gbGF6eSBub3RlIG1vZGUuIE1hcmtkb3duIG5vdGVzIG5vdCBvcGVuZWQgd2l0aGluIHRoaXMgbnVtYmVyIG9mIGRheXMgYXJlIHJlcGxhY2VkIHdpdGggbG9jYWwgcGxhY2Vob2xkZXIgZmlsZXMgYWZ0ZXIgc3luYy5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiMzBcIilcbiAgICAgICAgICAuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVFdmljdEFmdGVyRGF5cykpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gTnVtYmVyLnBhcnNlSW50KHZhbHVlLCAxMCk7XG4gICAgICAgICAgICBpZiAoIU51bWJlci5pc05hTihwYXJzZWQpKSB7XG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVFdmljdEFmdGVyRGF5cyA9IE1hdGgubWF4KDEsIHBhcnNlZCk7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NTQwQ1x1NkI2NVx1NzJCNlx1NjAwMVwiLCBcIlN5bmMgc3RhdHVzXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgYCR7dGhpcy5wbHVnaW4uZm9ybWF0TGFzdFN5bmNMYWJlbCgpfVxcbiR7dGhpcy5wbHVnaW4uZm9ybWF0U3luY1N0YXR1c0xhYmVsKCl9XFxuJHt0aGlzLnBsdWdpbi50KFwiXHU4QkY0XHU2NjBFXHVGRjFBXHU3QUNCXHU1MzczXHU1NDBDXHU2QjY1XHU0RjFBXHU2MjY3XHU4ODRDXHU2NzJDXHU1NzMwXHU0RTBFXHU4RkRDXHU3QUVGXHU3Njg0XHU1QkY5XHU4RDI2XHVGRjBDXHU1NDBDXHU2QjY1XHU3QjE0XHU4QkIwXHU0RTBFXHU5NzVFXHU1NkZFXHU3MjQ3XHU5NjQ0XHU0RUY2XHVGRjBDXHU1RTc2XHU2RTA1XHU3NDA2XHU4RkRDXHU3QUVGXHU1MTk3XHU0RjU5XHU2NTg3XHU0RUY2XHUzMDAyXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU0RUNEXHU3NTMxXHU3MkVDXHU3QUNCXHU5NjFGXHU1MjE3XHU1OTA0XHU3NDA2XHUzMDAyXCIsIFwiTm90ZTogU3luYyBub3cgcmVjb25jaWxlcyBsb2NhbCBhbmQgcmVtb3RlIGNvbnRlbnQsIHN5bmNzIG5vdGVzIGFuZCBub24taW1hZ2UgYXR0YWNobWVudHMsIGFuZCBjbGVhbnMgZXh0cmEgcmVtb3RlIGZpbGVzLiBJbWFnZSB1cGxvYWRzIGNvbnRpbnVlIHRvIGJlIGhhbmRsZWQgYnkgdGhlIHNlcGFyYXRlIHF1ZXVlLlwiKX1gLFxuICAgICAgICAgIGAke3RoaXMucGx1Z2luLmZvcm1hdExhc3RTeW5jTGFiZWwoKX1cXG4ke3RoaXMucGx1Z2luLmZvcm1hdFN5bmNTdGF0dXNMYWJlbCgpfVxcbiR7dGhpcy5wbHVnaW4udChcIlx1OEJGNFx1NjYwRVx1RkYxQVx1N0FDQlx1NTM3M1x1NTQwQ1x1NkI2NVx1NEYxQVx1NjI2N1x1ODg0Q1x1NjcyQ1x1NTczMFx1NEUwRVx1OEZEQ1x1N0FFRlx1NzY4NFx1NUJGOVx1OEQyNlx1RkYwQ1x1NTQwQ1x1NkI2NVx1N0IxNFx1OEJCMFx1NEUwRVx1OTc1RVx1NTZGRVx1NzI0N1x1OTY0NFx1NEVGNlx1RkYwQ1x1NUU3Nlx1NkUwNVx1NzQwNlx1OEZEQ1x1N0FFRlx1NTE5N1x1NEY1OVx1NjU4N1x1NEVGNlx1MzAwMlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NEVDRFx1NzUzMVx1NzJFQ1x1N0FDQlx1OTYxRlx1NTIxN1x1NTkwNFx1NzQwNlx1MzAwMlwiLCBcIk5vdGU6IFN5bmMgbm93IHJlY29uY2lsZXMgbG9jYWwgYW5kIHJlbW90ZSBjb250ZW50LCBzeW5jcyBub3RlcyBhbmQgbm9uLWltYWdlIGF0dGFjaG1lbnRzLCBhbmQgY2xlYW5zIGV4dHJhIHJlbW90ZSBmaWxlcy4gSW1hZ2UgdXBsb2FkcyBjb250aW51ZSB0byBiZSBoYW5kbGVkIGJ5IHRoZSBzZXBhcmF0ZSBxdWV1ZS5cIil9YCxcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodGhpcy5wbHVnaW4udChcIlx1N0FDQlx1NTM3M1x1NTQwQ1x1NkI2NVwiLCBcIlN5bmMgbm93XCIpKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50KHRydWUpO1xuICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZChmYWxzZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy5wbHVnaW4udChcIlx1NEUwMFx1NkIyMVx1NjAyN1x1NURFNVx1NTE3N1wiLCBcIk9uZS10aW1lIHRvb2xzXCIpIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4RkMxXHU3OUZCXHU2NTc0XHU1RTkzXHU1MzlGXHU3NTFGXHU1NkZFXHU3MjQ3XHU1RjE1XHU3NTI4XCIsIFwiTWlncmF0ZSBuYXRpdmUgaW1hZ2UgZW1iZWRzIGluIHZhdWx0XCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTYyNkJcdTYzQ0ZcdTY1NzRcdTVFOTNcdTYyNDBcdTY3MDkgTWFya2Rvd24gXHU3QjE0XHU4QkIwXHVGRjBDXHU2MjhBIE9ic2lkaWFuIFx1NTM5Rlx1NzUxRlx1NjcyQ1x1NTczMFx1NTZGRVx1NzI0N1x1NUYxNVx1NzUyOFx1RkYwOFx1NTk4MiAhW10oKSBcdTU0OEMgIVtbLi4uXV1cdUZGMDlcdTRFMEFcdTRGMjBcdTUyMzBcdThGRENcdTdBRUZcdTU2RkVcdTcyNDdcdTc2RUVcdTVGNTVcdUZGMENcdTVFNzZcdTY1MzlcdTUxOTlcdTRFM0Egc2VjdXJlLXdlYmRhdiBcdTRFRTNcdTc4MDFcdTU3NTdcdTMwMDJcdTY1RTdcdTcyNDggc3BhbiBcdTU0OENcdTY1RTlcdTY3MUYgd2ViZGF2LXNlY3VyZSBcdTk0RkVcdTYzQTVcdTRFNUZcdTRGMUFcdTRFMDBcdTVFNzZcdTY1MzZcdTY1NUJcdTUyMzBcdTY1QjBcdTY4M0NcdTVGMEZcdTMwMDJcIixcbiAgICAgICAgICBcIlNjYW4gYWxsIE1hcmtkb3duIG5vdGVzIGluIHRoZSB2YXVsdCwgdXBsb2FkIG5hdGl2ZSBsb2NhbCBpbWFnZSBlbWJlZHMgKHN1Y2ggYXMgIVtdKCkgYW5kICFbWy4uLl1dKSB0byB0aGUgcmVtb3RlIGltYWdlIGZvbGRlciwgYW5kIHJld3JpdGUgdGhlbSBhcyBzZWN1cmUtd2ViZGF2IGNvZGUgYmxvY2tzLiBMZWdhY3kgc3BhbiB0YWdzIGFuZCBlYXJseSB3ZWJkYXYtc2VjdXJlIGxpbmtzIGFyZSBhbHNvIG5vcm1hbGl6ZWQgdG8gdGhlIG5ldyBmb3JtYXQuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KHRoaXMucGx1Z2luLnQoXCJcdTVGMDBcdTU5Q0JcdThGQzFcdTc5RkJcIiwgXCJSdW4gbWlncmF0aW9uXCIpKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLm1pZ3JhdGVBbGxMZWdhY3lTZWN1cmVJbWFnZXMoKTtcbiAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKGZhbHNlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgfVxufVxuXG5jbGFzcyBSZXN1bHRNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgcHJpdmF0ZSByZWFkb25seSB0aXRsZVRleHQ6IHN0cmluZztcbiAgcHJpdmF0ZSByZWFkb25seSBib2R5VGV4dDogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCB0aXRsZVRleHQ6IHN0cmluZywgYm9keVRleHQ6IHN0cmluZykge1xuICAgIHN1cGVyKGFwcCk7XG4gICAgdGhpcy50aXRsZVRleHQgPSB0aXRsZVRleHQ7XG4gICAgdGhpcy5ib2R5VGV4dCA9IGJvZHlUZXh0O1xuICB9XG5cbiAgb25PcGVuKCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy50aXRsZVRleHQgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IHRoaXMuYm9keVRleHQgfSk7XG4gIH1cblxuICBvbkNsb3NlKCk6IHZvaWQge1xuICAgIHRoaXMuY29udGVudEVsLmVtcHR5KCk7XG4gIH1cbn1cbiIsICJpbXBvcnQgeyBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0LCBNYXJrZG93blJlbmRlckNoaWxkIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmV4cG9ydCBjb25zdCBTRUNVUkVfUFJPVE9DT0wgPSBcIndlYmRhdi1zZWN1cmU6XCI7XG5leHBvcnQgY29uc3QgU0VDVVJFX0NPREVfQkxPQ0sgPSBcInNlY3VyZS13ZWJkYXZcIjtcblxuZXhwb3J0IHR5cGUgU2VjdXJlV2ViZGF2SW1hZ2VCbG9jayA9IHtcbiAgcGF0aDogc3RyaW5nO1xuICBhbHQ6IHN0cmluZztcbn07XG5cbnR5cGUgU2VjdXJlV2ViZGF2SW1hZ2VTdXBwb3J0RGVwcyA9IHtcbiAgdDogKHpoOiBzdHJpbmcsIGVuOiBzdHJpbmcpID0+IHN0cmluZztcbiAgZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmw6IChyZW1vdGVQYXRoOiBzdHJpbmcpID0+IFByb21pc2U8c3RyaW5nPjtcbn07XG5cbmNsYXNzIFNlY3VyZVdlYmRhdlJlbmRlckNoaWxkIGV4dGVuZHMgTWFya2Rvd25SZW5kZXJDaGlsZCB7XG4gIGNvbnN0cnVjdG9yKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIHN1cGVyKGNvbnRhaW5lckVsKTtcbiAgfVxuXG4gIG9udW5sb2FkKCk6IHZvaWQge31cbn1cblxuLy8gS2VlcCBzZWN1cmUgaW1hZ2UgcGFyc2luZyBhbmQgcmVuZGVyaW5nIGlzb2xhdGVkIHNvIHN5bmMgY2hhbmdlcyBkbyBub3Rcbi8vIGFjY2lkZW50YWxseSBicmVhayB0aGUgZGlzcGxheSBwaXBlbGluZSBhZ2Fpbi5cbmV4cG9ydCBjbGFzcyBTZWN1cmVXZWJkYXZJbWFnZVN1cHBvcnQge1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGRlcHM6IFNlY3VyZVdlYmRhdkltYWdlU3VwcG9ydERlcHMpIHt9XG5cbiAgYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmw6IHN0cmluZywgYWx0OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5leHRyYWN0UmVtb3RlUGF0aChyZW1vdGVVcmwpO1xuICAgIGlmICghcmVtb3RlUGF0aCkge1xuICAgICAgcmV0dXJuIGAhW10oJHtyZW1vdGVVcmx9KWA7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayhyZW1vdGVQYXRoLCBhbHQpO1xuICB9XG5cbiAgYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayhyZW1vdGVQYXRoOiBzdHJpbmcsIGFsdDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZEFsdCA9IChhbHQgfHwgcmVtb3RlUGF0aCkucmVwbGFjZSgvXFxyP1xcbi9nLCBcIiBcIikudHJpbSgpO1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gcmVtb3RlUGF0aC5yZXBsYWNlKC9cXHI/XFxuL2csIFwiXCIpLnRyaW0oKTtcbiAgICByZXR1cm4gW2BcXGBcXGBcXGAke1NFQ1VSRV9DT0RFX0JMT0NLfWAsIGBwYXRoOiAke25vcm1hbGl6ZWRQYXRofWAsIGBhbHQ6ICR7bm9ybWFsaXplZEFsdH1gLCBcImBgYFwiXS5qb2luKFwiXFxuXCIpO1xuICB9XG5cbiAgcGFyc2VTZWN1cmVJbWFnZUJsb2NrKHNvdXJjZTogc3RyaW5nKTogU2VjdXJlV2ViZGF2SW1hZ2VCbG9jayB8IG51bGwge1xuICAgIGNvbnN0IHJlc3VsdDogU2VjdXJlV2ViZGF2SW1hZ2VCbG9jayA9IHsgcGF0aDogXCJcIiwgYWx0OiBcIlwiIH07XG4gICAgZm9yIChjb25zdCByYXdMaW5lIG9mIHNvdXJjZS5zcGxpdCgvXFxyP1xcbi8pKSB7XG4gICAgICBjb25zdCBsaW5lID0gcmF3TGluZS50cmltKCk7XG4gICAgICBpZiAoIWxpbmUpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHNlcGFyYXRvckluZGV4ID0gbGluZS5pbmRleE9mKFwiOlwiKTtcbiAgICAgIGlmIChzZXBhcmF0b3JJbmRleCA9PT0gLTEpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGtleSA9IGxpbmUuc2xpY2UoMCwgc2VwYXJhdG9ySW5kZXgpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgY29uc3QgdmFsdWUgPSBsaW5lLnNsaWNlKHNlcGFyYXRvckluZGV4ICsgMSkudHJpbSgpO1xuICAgICAgaWYgKGtleSA9PT0gXCJwYXRoXCIpIHtcbiAgICAgICAgcmVzdWx0LnBhdGggPSB2YWx1ZTtcbiAgICAgIH0gZWxzZSBpZiAoa2V5ID09PSBcImFsdFwiKSB7XG4gICAgICAgIHJlc3VsdC5hbHQgPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0LnBhdGggPyByZXN1bHQgOiBudWxsO1xuICB9XG5cbiAgYXN5bmMgcHJvY2Vzc1NlY3VyZUltYWdlcyhlbDogSFRNTEVsZW1lbnQsIGN0eDogTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dCkge1xuICAgIGNvbnN0IHNlY3VyZUNvZGVCbG9ja3MgPSBBcnJheS5mcm9tKGVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KGBwcmUgPiBjb2RlLmxhbmd1YWdlLSR7U0VDVVJFX0NPREVfQkxPQ0t9YCkpO1xuICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgc2VjdXJlQ29kZUJsb2Nrcy5tYXAoYXN5bmMgKGNvZGVFbCkgPT4ge1xuICAgICAgICBjb25zdCBwcmUgPSBjb2RlRWwucGFyZW50RWxlbWVudDtcbiAgICAgICAgaWYgKCEocHJlIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHx8IHByZS5oYXNBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXYtcmVuZGVyZWRcIikpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwYXJzZWQgPSB0aGlzLnBhcnNlU2VjdXJlSW1hZ2VCbG9jayhjb2RlRWwudGV4dENvbnRlbnQgPz8gXCJcIik7XG4gICAgICAgIGlmICghcGFyc2VkPy5wYXRoKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgcHJlLnNldEF0dHJpYnV0ZShcImRhdGEtc2VjdXJlLXdlYmRhdi1yZW5kZXJlZFwiLCBcInRydWVcIik7XG4gICAgICAgIGF3YWl0IHRoaXMucmVuZGVyU2VjdXJlSW1hZ2VJbnRvRWxlbWVudChwcmUsIHBhcnNlZC5wYXRoLCBwYXJzZWQuYWx0IHx8IHBhcnNlZC5wYXRoKTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zdCBzZWN1cmVOb2RlcyA9IEFycmF5LmZyb20oZWwucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXCJbZGF0YS1zZWN1cmUtd2ViZGF2XVwiKSk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICBzZWN1cmVOb2Rlcy5tYXAoYXN5bmMgKG5vZGUpID0+IHtcbiAgICAgICAgaWYgKG5vZGUgaW5zdGFuY2VvZiBIVE1MSW1hZ2VFbGVtZW50KSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5zd2FwSW1hZ2VTb3VyY2Uobm9kZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IG5vZGUuZ2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2XCIpO1xuICAgICAgICBpZiAoIXJlbW90ZVBhdGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xuICAgICAgICBpbWcuYWx0ID0gbm9kZS5nZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIpID8/IG5vZGUuZ2V0QXR0cmlidXRlKFwiYWx0XCIpID8/IFwiU2VjdXJlIFdlYkRBViBpbWFnZVwiO1xuICAgICAgICBpbWcuc2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2XCIsIHJlbW90ZVBhdGgpO1xuICAgICAgICBpbWcuY2xhc3NMaXN0LmFkZChcInNlY3VyZS13ZWJkYXYtaW1hZ2VcIiwgXCJpcy1sb2FkaW5nXCIpO1xuICAgICAgICBub2RlLnJlcGxhY2VXaXRoKGltZyk7XG4gICAgICAgIGF3YWl0IHRoaXMuc3dhcEltYWdlU291cmNlKGltZyk7XG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgY29uc3Qgc2VjdXJlTGlua3MgPSBBcnJheS5mcm9tKGVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEltYWdlRWxlbWVudD4oYGltZ1tzcmNePVwiJHtTRUNVUkVfUFJPVE9DT0x9Ly9cIl1gKSk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoc2VjdXJlTGlua3MubWFwKGFzeW5jIChpbWcpID0+IHRoaXMuc3dhcEltYWdlU291cmNlKGltZykpKTtcblxuICAgIGN0eC5hZGRDaGlsZChuZXcgU2VjdXJlV2ViZGF2UmVuZGVyQ2hpbGQoZWwpKTtcbiAgfVxuXG4gIGFzeW5jIHByb2Nlc3NTZWN1cmVDb2RlQmxvY2soc291cmNlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCwgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0KSB7XG4gICAgY29uc3QgcGFyc2VkID0gdGhpcy5wYXJzZVNlY3VyZUltYWdlQmxvY2soc291cmNlKTtcbiAgICBpZiAoIXBhcnNlZD8ucGF0aCkge1xuICAgICAgZWwuY3JlYXRlRWwoXCJkaXZcIiwge1xuICAgICAgICB0ZXh0OiB0aGlzLmRlcHMudChcIlx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NEVFM1x1NzgwMVx1NTc1N1x1NjgzQ1x1NUYwRlx1NjVFMFx1NjU0OFx1MzAwMlwiLCBcIkludmFsaWQgc2VjdXJlIGltYWdlIGNvZGUgYmxvY2sgZm9ybWF0LlwiKSxcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMucmVuZGVyU2VjdXJlSW1hZ2VJbnRvRWxlbWVudChlbCwgcGFyc2VkLnBhdGgsIHBhcnNlZC5hbHQgfHwgcGFyc2VkLnBhdGgpO1xuICAgIGN0eC5hZGRDaGlsZChuZXcgU2VjdXJlV2ViZGF2UmVuZGVyQ2hpbGQoZWwpKTtcbiAgfVxuXG4gIGV4dHJhY3RSZW1vdGVQYXRoKHNyYzogc3RyaW5nKSB7XG4gICAgY29uc3QgcHJlZml4ID0gYCR7U0VDVVJFX1BST1RPQ09MfS8vYDtcbiAgICBpZiAoIXNyYy5zdGFydHNXaXRoKHByZWZpeCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiBzcmMuc2xpY2UocHJlZml4Lmxlbmd0aCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlbmRlclNlY3VyZUltYWdlSW50b0VsZW1lbnQoZWw6IEhUTUxFbGVtZW50LCByZW1vdGVQYXRoOiBzdHJpbmcsIGFsdDogc3RyaW5nKSB7XG4gICAgY29uc3QgaW1nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImltZ1wiKTtcbiAgICBpbWcuYWx0ID0gYWx0O1xuICAgIGltZy5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIiwgcmVtb3RlUGF0aCk7XG4gICAgaW1nLmNsYXNzTGlzdC5hZGQoXCJzZWN1cmUtd2ViZGF2LWltYWdlXCIsIFwiaXMtbG9hZGluZ1wiKTtcbiAgICBlbC5lbXB0eSgpO1xuICAgIGVsLmFwcGVuZENoaWxkKGltZyk7XG4gICAgYXdhaXQgdGhpcy5zd2FwSW1hZ2VTb3VyY2UoaW1nKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc3dhcEltYWdlU291cmNlKGltZzogSFRNTEltYWdlRWxlbWVudCkge1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSBpbWcuZ2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2XCIpID8/IHRoaXMuZXh0cmFjdFJlbW90ZVBhdGgoaW1nLmdldEF0dHJpYnV0ZShcInNyY1wiKSA/PyBcIlwiKTtcbiAgICBpZiAoIXJlbW90ZVBhdGgpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpbWcuY2xhc3NMaXN0LmFkZChcInNlY3VyZS13ZWJkYXYtaW1hZ2VcIiwgXCJpcy1sb2FkaW5nXCIpO1xuICAgIGNvbnN0IG9yaWdpbmFsQWx0ID0gaW1nLmFsdDtcbiAgICBpbWcuYWx0ID0gb3JpZ2luYWxBbHQgfHwgdGhpcy5kZXBzLnQoXCJcdTUyQTBcdThGN0RcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTRFMkQuLi5cIiwgXCJMb2FkaW5nIHNlY3VyZSBpbWFnZS4uLlwiKTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBibG9iVXJsID0gYXdhaXQgdGhpcy5kZXBzLmZldGNoU2VjdXJlSW1hZ2VCbG9iVXJsKHJlbW90ZVBhdGgpO1xuICAgICAgaW1nLnNyYyA9IGJsb2JVcmw7XG4gICAgICBpbWcuYWx0ID0gb3JpZ2luYWxBbHQ7XG4gICAgICBpbWcuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgIGltZy5zdHlsZS5tYXhXaWR0aCA9IFwiMTAwJVwiO1xuICAgICAgaW1nLmNsYXNzTGlzdC5yZW1vdmUoXCJpcy1sb2FkaW5nXCIsIFwiaXMtZXJyb3JcIik7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIGltYWdlIGxvYWQgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIGltZy5yZXBsYWNlV2l0aCh0aGlzLmJ1aWxkRXJyb3JFbGVtZW50KHJlbW90ZVBhdGgsIGVycm9yKSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBidWlsZEVycm9yRWxlbWVudChyZW1vdGVQYXRoOiBzdHJpbmcsIGVycm9yOiB1bmtub3duKSB7XG4gICAgY29uc3QgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGVsLmNsYXNzTmFtZSA9IFwic2VjdXJlLXdlYmRhdi1pbWFnZSBpcy1lcnJvclwiO1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG4gICAgZWwudGV4dENvbnRlbnQgPSB0aGlzLmRlcHMudChcbiAgICAgIGBcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTUyQTBcdThGN0RcdTU5MzFcdThEMjVcdUZGMUEke3JlbW90ZVBhdGh9XHVGRjA4JHttZXNzYWdlfVx1RkYwOWAsXG4gICAgICBgU2VjdXJlIGltYWdlIGZhaWxlZDogJHtyZW1vdGVQYXRofSAoJHttZXNzYWdlfSlgLFxuICAgICk7XG4gICAgcmV0dXJuIGVsO1xuICB9XG59XG4iLCAiaW1wb3J0IHsgQXBwLCBFZGl0b3IsIE1hcmtkb3duVmlldywgTm90aWNlLCBUQWJzdHJhY3RGaWxlLCBURmlsZSB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5leHBvcnQgdHlwZSBVcGxvYWRUYXNrID0ge1xuICBpZDogc3RyaW5nO1xuICBub3RlUGF0aDogc3RyaW5nO1xuICBwbGFjZWhvbGRlcjogc3RyaW5nO1xuICBtaW1lVHlwZTogc3RyaW5nO1xuICBmaWxlTmFtZTogc3RyaW5nO1xuICBkYXRhQmFzZTY0OiBzdHJpbmc7XG4gIGF0dGVtcHRzOiBudW1iZXI7XG4gIGNyZWF0ZWRBdDogbnVtYmVyO1xuICBsYXN0RXJyb3I/OiBzdHJpbmc7XG59O1xuXG50eXBlIFNlY3VyZVdlYmRhdlVwbG9hZFF1ZXVlRGVwcyA9IHtcbiAgYXBwOiBBcHA7XG4gIHQ6ICh6aDogc3RyaW5nLCBlbjogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIHNldHRpbmdzOiAoKSA9PiB7IG1heFJldHJ5QXR0ZW1wdHM6IG51bWJlcjsgcmV0cnlEZWxheVNlY29uZHM6IG51bWJlciB9O1xuICBnZXRRdWV1ZTogKCkgPT4gVXBsb2FkVGFza1tdO1xuICBzZXRRdWV1ZTogKHF1ZXVlOiBVcGxvYWRUYXNrW10pID0+IHZvaWQ7XG4gIHNhdmVQbHVnaW5TdGF0ZTogKCkgPT4gUHJvbWlzZTx2b2lkPjtcbiAgc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jOiAobm90ZVBhdGg6IHN0cmluZywgcmVhc29uOiBcImltYWdlLWFkZFwiIHwgXCJpbWFnZS1yZW1vdmVcIikgPT4gdm9pZDtcbiAgcmVxdWVzdFVybDogKG9wdGlvbnM6IHtcbiAgICB1cmw6IHN0cmluZztcbiAgICBtZXRob2Q6IHN0cmluZztcbiAgICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgICBib2R5PzogQXJyYXlCdWZmZXI7XG4gICAgZm9sbG93UmVkaXJlY3RzPzogYm9vbGVhbjtcbiAgICByZWRpcmVjdENvdW50PzogbnVtYmVyO1xuICB9KSA9PiBQcm9taXNlPHsgc3RhdHVzOiBudW1iZXI7IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47IGFycmF5QnVmZmVyOiBBcnJheUJ1ZmZlciB9PjtcbiAgYnVpbGRVcGxvYWRVcmw6IChyZW1vdGVQYXRoOiBzdHJpbmcpID0+IHN0cmluZztcbiAgYnVpbGRBdXRoSGVhZGVyOiAoKSA9PiBzdHJpbmc7XG4gIHByZXBhcmVVcGxvYWRQYXlsb2FkOiAoXG4gICAgYmluYXJ5OiBBcnJheUJ1ZmZlcixcbiAgICBtaW1lVHlwZTogc3RyaW5nLFxuICAgIGZpbGVOYW1lOiBzdHJpbmcsXG4gICkgPT4gUHJvbWlzZTx7IGJpbmFyeTogQXJyYXlCdWZmZXI7IG1pbWVUeXBlOiBzdHJpbmc7IGZpbGVOYW1lOiBzdHJpbmcgfT47XG4gIGJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5OiAoZmlsZU5hbWU6IHN0cmluZywgYmluYXJ5OiBBcnJheUJ1ZmZlcikgPT4gUHJvbWlzZTxzdHJpbmc+O1xuICBidWlsZFJlbW90ZVBhdGg6IChmaWxlTmFtZTogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIGJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXA6IChyZW1vdGVVcmw6IHN0cmluZywgYWx0OiBzdHJpbmcpID0+IHN0cmluZztcbiAgZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWU6IChmaWxlTmFtZTogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIGFycmF5QnVmZmVyVG9CYXNlNjQ6IChidWZmZXI6IEFycmF5QnVmZmVyKSA9PiBzdHJpbmc7XG4gIGJhc2U2NFRvQXJyYXlCdWZmZXI6IChiYXNlNjQ6IHN0cmluZykgPT4gQXJyYXlCdWZmZXI7XG4gIGVzY2FwZUh0bWw6ICh2YWx1ZTogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIGVzY2FwZVJlZ0V4cDogKHZhbHVlOiBzdHJpbmcpID0+IHN0cmluZztcbiAgZGVzY3JpYmVFcnJvcjogKHByZWZpeDogc3RyaW5nLCBlcnJvcjogdW5rbm93bikgPT4gc3RyaW5nO1xufTtcblxuLy8gT3ducyB0aGUgcXVldWVkIGltYWdlIHVwbG9hZCB3b3JrZmxvdyBzbyBzeW5jIGFuZCBub3RlIGxvZ2ljIGNhbiBzdGF5IHNlcGFyYXRlLlxuZXhwb3J0IGNsYXNzIFNlY3VyZVdlYmRhdlVwbG9hZFF1ZXVlU3VwcG9ydCB7XG4gIHByaXZhdGUgcHJvY2Vzc2luZ1Rhc2tJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSByZXRyeVRpbWVvdXRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgcHJpdmF0ZSBwZW5kaW5nVGFza1Byb21pc2VzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8dm9pZD4+KCk7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBkZXBzOiBTZWN1cmVXZWJkYXZVcGxvYWRRdWV1ZURlcHMpIHt9XG5cbiAgZGlzcG9zZSgpIHtcbiAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnJldHJ5VGltZW91dHMudmFsdWVzKCkpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICB9XG4gICAgdGhpcy5yZXRyeVRpbWVvdXRzLmNsZWFyKCk7XG4gIH1cblxuICBoYXNQZW5kaW5nV29yaygpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5kZXBzLmdldFF1ZXVlKCkubGVuZ3RoID4gMCB8fFxuICAgICAgdGhpcy5wcm9jZXNzaW5nVGFza0lkcy5zaXplID4gMCB8fFxuICAgICAgdGhpcy5wZW5kaW5nVGFza1Byb21pc2VzLnNpemUgPiAwXG4gICAgKTtcbiAgfVxuXG4gIGhhc1BlbmRpbmdXb3JrRm9yTm90ZShub3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcXVldWUgPSB0aGlzLmRlcHMuZ2V0UXVldWUoKTtcbiAgICBpZiAocXVldWUuc29tZSgodGFzaykgPT4gdGFzay5ub3RlUGF0aCA9PT0gbm90ZVBhdGgpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHRhc2tJZCBvZiB0aGlzLnByb2Nlc3NpbmdUYXNrSWRzKSB7XG4gICAgICBjb25zdCB0YXNrID0gcXVldWUuZmluZCgoaXRlbSkgPT4gaXRlbS5pZCA9PT0gdGFza0lkKTtcbiAgICAgIGlmICh0YXNrPy5ub3RlUGF0aCA9PT0gbm90ZVBhdGgpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBbdGFza0lkXSBvZiB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMpIHtcbiAgICAgIGNvbnN0IHRhc2sgPSBxdWV1ZS5maW5kKChpdGVtKSA9PiBpdGVtLmlkID09PSB0YXNrSWQpO1xuICAgICAgaWYgKHRhc2s/Lm5vdGVQYXRoID09PSBub3RlUGF0aCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBhc3luYyBlbnF1ZXVlRWRpdG9ySW1hZ2VVcGxvYWQobm90ZUZpbGU6IFRGaWxlLCBlZGl0b3I6IEVkaXRvciwgaW1hZ2VGaWxlOiBGaWxlLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGFycmF5QnVmZmVyID0gYXdhaXQgaW1hZ2VGaWxlLmFycmF5QnVmZmVyKCk7XG4gICAgICBjb25zdCB0YXNrID0gdGhpcy5jcmVhdGVVcGxvYWRUYXNrKFxuICAgICAgICBub3RlRmlsZS5wYXRoLFxuICAgICAgICBhcnJheUJ1ZmZlcixcbiAgICAgICAgaW1hZ2VGaWxlLnR5cGUgfHwgdGhpcy5kZXBzLmdldE1pbWVUeXBlRnJvbUZpbGVOYW1lKGZpbGVOYW1lKSxcbiAgICAgICAgZmlsZU5hbWUsXG4gICAgICApO1xuICAgICAgdGhpcy5pbnNlcnRQbGFjZWhvbGRlcihlZGl0b3IsIHRhc2sucGxhY2Vob2xkZXIpO1xuICAgICAgdGhpcy5kZXBzLnNldFF1ZXVlKFsuLi50aGlzLmRlcHMuZ2V0UXVldWUoKSwgdGFza10pO1xuICAgICAgYXdhaXQgdGhpcy5kZXBzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgdm9pZCB0aGlzLnByb2Nlc3NQZW5kaW5nVGFza3MoKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXBzLnQoXCJcdTVERjJcdTUyQTBcdTUxNjVcdTU2RkVcdTcyNDdcdTgxRUFcdTUyQThcdTRFMEFcdTRGMjBcdTk2MUZcdTUyMTdcdTMwMDJcIiwgXCJJbWFnZSBhZGRlZCB0byB0aGUgYXV0by11cGxvYWQgcXVldWUuXCIpKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBxdWV1ZSBzZWN1cmUgaW1hZ2UgdXBsb2FkXCIsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgIHRoaXMuZGVwcy5kZXNjcmliZUVycm9yKFxuICAgICAgICAgIHRoaXMuZGVwcy50KFwiXHU1MkEwXHU1MTY1XHU1NkZFXHU3MjQ3XHU4MUVBXHU1MkE4XHU0RTBBXHU0RjIwXHU5NjFGXHU1MjE3XHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIHF1ZXVlIGltYWdlIGZvciBhdXRvLXVwbG9hZFwiKSxcbiAgICAgICAgICBlcnJvcixcbiAgICAgICAgKSxcbiAgICAgICAgODAwMCxcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgY3JlYXRlVXBsb2FkVGFzayhub3RlUGF0aDogc3RyaW5nLCBiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKTogVXBsb2FkVGFzayB7XG4gICAgY29uc3QgaWQgPSBgc2VjdXJlLXdlYmRhdi10YXNrLSR7RGF0ZS5ub3coKX0tJHtNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLCA4KX1gO1xuICAgIHJldHVybiB7XG4gICAgICBpZCxcbiAgICAgIG5vdGVQYXRoLFxuICAgICAgcGxhY2Vob2xkZXI6IHRoaXMuYnVpbGRQZW5kaW5nUGxhY2Vob2xkZXIoaWQsIGZpbGVOYW1lKSxcbiAgICAgIG1pbWVUeXBlLFxuICAgICAgZmlsZU5hbWUsXG4gICAgICBkYXRhQmFzZTY0OiB0aGlzLmRlcHMuYXJyYXlCdWZmZXJUb0Jhc2U2NChiaW5hcnkpLFxuICAgICAgYXR0ZW1wdHM6IDAsXG4gICAgICBjcmVhdGVkQXQ6IERhdGUubm93KCksXG4gICAgfTtcbiAgfVxuXG4gIGJ1aWxkUGVuZGluZ1BsYWNlaG9sZGVyKHRhc2tJZDogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3Qgc2FmZU5hbWUgPSB0aGlzLmRlcHMuZXNjYXBlSHRtbChmaWxlTmFtZSk7XG4gICAgcmV0dXJuIGA8c3BhbiBjbGFzcz1cInNlY3VyZS13ZWJkYXYtcGVuZGluZ1wiIGRhdGEtc2VjdXJlLXdlYmRhdi10YXNrPVwiJHt0YXNrSWR9XCIgYXJpYS1sYWJlbD1cIiR7c2FmZU5hbWV9XCI+JHt0aGlzLmRlcHMuZXNjYXBlSHRtbCh0aGlzLmRlcHMudChgXHUzMDEwXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU0RTJEXHVGRjVDJHtmaWxlTmFtZX1cdTMwMTFgLCBgW1VwbG9hZGluZyBpbWFnZSB8ICR7ZmlsZU5hbWV9XWApKX08L3NwYW4+YDtcbiAgfVxuXG4gIGJ1aWxkRmFpbGVkUGxhY2Vob2xkZXIoZmlsZU5hbWU6IHN0cmluZywgbWVzc2FnZT86IHN0cmluZykge1xuICAgIGNvbnN0IHNhZmVOYW1lID0gdGhpcy5kZXBzLmVzY2FwZUh0bWwoZmlsZU5hbWUpO1xuICAgIGNvbnN0IHNhZmVNZXNzYWdlID0gdGhpcy5kZXBzLmVzY2FwZUh0bWwobWVzc2FnZSA/PyB0aGlzLmRlcHMudChcIlx1NjcyQVx1NzdFNVx1OTUxOVx1OEJFRlwiLCBcIlVua25vd24gZXJyb3JcIikpO1xuICAgIGNvbnN0IGxhYmVsID0gdGhpcy5kZXBzLmVzY2FwZUh0bWwodGhpcy5kZXBzLnQoYFx1MzAxMFx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NTkzMVx1OEQyNVx1RkY1QyR7ZmlsZU5hbWV9XHUzMDExYCwgYFtJbWFnZSB1cGxvYWQgZmFpbGVkIHwgJHtmaWxlTmFtZX1dYCkpO1xuICAgIHJldHVybiBgPHNwYW4gY2xhc3M9XCJzZWN1cmUtd2ViZGF2LWZhaWxlZFwiIGFyaWEtbGFiZWw9XCIke3NhZmVOYW1lfVwiPiR7bGFiZWx9OiAke3NhZmVNZXNzYWdlfTwvc3Bhbj5gO1xuICB9XG5cbiAgYXN5bmMgcHJvY2Vzc1BlbmRpbmdUYXNrcygpIHtcbiAgICBjb25zdCBydW5uaW5nOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IHRhc2sgb2YgdGhpcy5kZXBzLmdldFF1ZXVlKCkpIHtcbiAgICAgIGlmICh0aGlzLnByb2Nlc3NpbmdUYXNrSWRzLmhhcyh0YXNrLmlkKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgcnVubmluZy5wdXNoKHRoaXMuc3RhcnRQZW5kaW5nVGFzayh0YXNrKSk7XG4gICAgfVxuXG4gICAgYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHJ1bm5pbmcpO1xuICB9XG5cbiAgc3RhcnRQZW5kaW5nVGFzayh0YXNrOiBVcGxvYWRUYXNrKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMuZ2V0KHRhc2suaWQpO1xuICAgIGlmIChleGlzdGluZykge1xuICAgICAgcmV0dXJuIGV4aXN0aW5nO1xuICAgIH1cblxuICAgIGNvbnN0IHByb21pc2UgPSB0aGlzLnByb2Nlc3NUYXNrKHRhc2spLmZpbmFsbHkoKCkgPT4ge1xuICAgICAgdGhpcy5wZW5kaW5nVGFza1Byb21pc2VzLmRlbGV0ZSh0YXNrLmlkKTtcbiAgICB9KTtcbiAgICB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMuc2V0KHRhc2suaWQsIHByb21pc2UpO1xuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgcHJvY2Vzc1Rhc2sodGFzazogVXBsb2FkVGFzaykge1xuICAgIHRoaXMucHJvY2Vzc2luZ1Rhc2tJZHMuYWRkKHRhc2suaWQpO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBiaW5hcnkgPSB0aGlzLmRlcHMuYmFzZTY0VG9BcnJheUJ1ZmZlcih0YXNrLmRhdGFCYXNlNjQpO1xuICAgICAgY29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLmRlcHMucHJlcGFyZVVwbG9hZFBheWxvYWQoXG4gICAgICAgIGJpbmFyeSxcbiAgICAgICAgdGFzay5taW1lVHlwZSB8fCB0aGlzLmRlcHMuZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUodGFzay5maWxlTmFtZSksXG4gICAgICAgIHRhc2suZmlsZU5hbWUsXG4gICAgICApO1xuICAgICAgY29uc3QgcmVtb3RlTmFtZSA9IGF3YWl0IHRoaXMuZGVwcy5idWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeShwcmVwYXJlZC5maWxlTmFtZSwgcHJlcGFyZWQuYmluYXJ5KTtcbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmRlcHMuYnVpbGRSZW1vdGVQYXRoKHJlbW90ZU5hbWUpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmRlcHMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5kZXBzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgICBtZXRob2Q6IFwiUFVUXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmRlcHMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogcHJlcGFyZWQubWltZVR5cGUsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IHByZXBhcmVkLmJpbmFyeSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVcGxvYWQgZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXBsYWNlZCA9IGF3YWl0IHRoaXMucmVwbGFjZVBsYWNlaG9sZGVyKFxuICAgICAgICB0YXNrLm5vdGVQYXRoLFxuICAgICAgICB0YXNrLmlkLFxuICAgICAgICB0YXNrLnBsYWNlaG9sZGVyLFxuICAgICAgICB0aGlzLmRlcHMuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChgd2ViZGF2LXNlY3VyZTovLyR7cmVtb3RlUGF0aH1gLCBwcmVwYXJlZC5maWxlTmFtZSksXG4gICAgICApO1xuICAgICAgaWYgKCFyZXBsYWNlZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgdGhpcy5kZXBzLnQoXG4gICAgICAgICAgICBcIlx1NEUwQVx1NEYyMFx1NjIxMFx1NTI5Rlx1RkYwQ1x1NEY0Nlx1NkNBMVx1NjcwOVx1NTcyOFx1N0IxNFx1OEJCMFx1NEUyRFx1NjI3RVx1NTIzMFx1NTNFRlx1NjZGRlx1NjM2Mlx1NzY4NFx1NTM2MFx1NEY0RFx1N0IyNlx1MzAwMlwiLFxuICAgICAgICAgICAgXCJVcGxvYWQgc3VjY2VlZGVkLCBidXQgbm8gbWF0Y2hpbmcgcGxhY2Vob2xkZXIgd2FzIGZvdW5kIGluIHRoZSBub3RlLlwiLFxuICAgICAgICAgICksXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuZGVwcy5zZXRRdWV1ZSh0aGlzLmRlcHMuZ2V0UXVldWUoKS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uaWQgIT09IHRhc2suaWQpKTtcbiAgICAgIGF3YWl0IHRoaXMuZGVwcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIHRoaXMuZGVwcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmModGFzay5ub3RlUGF0aCwgXCJpbWFnZS1hZGRcIik7XG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVwcy50KFwiXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU2MjEwXHU1MjlGXHUzMDAyXCIsIFwiSW1hZ2UgdXBsb2FkZWQgc3VjY2Vzc2Z1bGx5LlwiKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIHF1ZXVlZCB1cGxvYWQgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIHRhc2suYXR0ZW1wdHMgKz0gMTtcbiAgICAgIHRhc2subGFzdEVycm9yID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xuICAgICAgYXdhaXQgdGhpcy5kZXBzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuXG4gICAgICBpZiAodGFzay5hdHRlbXB0cyA+PSB0aGlzLmRlcHMuc2V0dGluZ3MoKS5tYXhSZXRyeUF0dGVtcHRzKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucmVwbGFjZVBsYWNlaG9sZGVyKFxuICAgICAgICAgIHRhc2subm90ZVBhdGgsXG4gICAgICAgICAgdGFzay5pZCxcbiAgICAgICAgICB0YXNrLnBsYWNlaG9sZGVyLFxuICAgICAgICAgIHRoaXMuYnVpbGRGYWlsZWRQbGFjZWhvbGRlcih0YXNrLmZpbGVOYW1lLCB0YXNrLmxhc3RFcnJvciksXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGVwcy5zZXRRdWV1ZSh0aGlzLmRlcHMuZ2V0UXVldWUoKS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uaWQgIT09IHRhc2suaWQpKTtcbiAgICAgICAgYXdhaXQgdGhpcy5kZXBzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMuZGVwcy5kZXNjcmliZUVycm9yKHRoaXMuZGVwcy50KFwiXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU2NzAwXHU3RUM4XHU1OTMxXHU4RDI1XCIsIFwiSW1hZ2UgdXBsb2FkIGZhaWxlZCBwZXJtYW5lbnRseVwiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuc2NoZWR1bGVSZXRyeSh0YXNrKTtcbiAgICAgIH1cbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy5wcm9jZXNzaW5nVGFza0lkcy5kZWxldGUodGFzay5pZCk7XG4gICAgfVxuICB9XG5cbiAgc2NoZWR1bGVSZXRyeSh0YXNrOiBVcGxvYWRUYXNrKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLnJldHJ5VGltZW91dHMuZ2V0KHRhc2suaWQpO1xuICAgIGlmIChleGlzdGluZykge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dChleGlzdGluZyk7XG4gICAgfVxuXG4gICAgY29uc3QgZGVsYXkgPSBNYXRoLm1heCgxLCB0aGlzLmRlcHMuc2V0dGluZ3MoKS5yZXRyeURlbGF5U2Vjb25kcykgKiAxMDAwICogdGFzay5hdHRlbXB0cztcbiAgICBjb25zdCB0aW1lb3V0SWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLnJldHJ5VGltZW91dHMuZGVsZXRlKHRhc2suaWQpO1xuICAgICAgdm9pZCB0aGlzLnN0YXJ0UGVuZGluZ1Rhc2sodGFzayk7XG4gICAgfSwgZGVsYXkpO1xuICAgIHRoaXMucmV0cnlUaW1lb3V0cy5zZXQodGFzay5pZCwgdGltZW91dElkKTtcbiAgfVxuXG4gIHByaXZhdGUgaW5zZXJ0UGxhY2Vob2xkZXIoZWRpdG9yOiBFZGl0b3IsIHBsYWNlaG9sZGVyOiBzdHJpbmcpIHtcbiAgICBlZGl0b3IucmVwbGFjZVNlbGVjdGlvbihgJHtwbGFjZWhvbGRlcn1cXG5gKTtcbiAgfVxuXG4gIGFzeW5jIHJlcGxhY2VQbGFjZWhvbGRlcihub3RlUGF0aDogc3RyaW5nLCB0YXNrSWQ6IHN0cmluZywgcGxhY2Vob2xkZXI6IHN0cmluZywgcmVwbGFjZW1lbnQ6IHN0cmluZykge1xuICAgIGNvbnN0IHJlcGxhY2VkSW5FZGl0b3IgPSB0aGlzLnJlcGxhY2VQbGFjZWhvbGRlckluT3BlbkVkaXRvcnMobm90ZVBhdGgsIHRhc2tJZCwgcGxhY2Vob2xkZXIsIHJlcGxhY2VtZW50KTtcbiAgICBpZiAocmVwbGFjZWRJbkVkaXRvcikge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgY29uc3QgZmlsZSA9IHRoaXMuZGVwcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKG5vdGVQYXRoKTtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZGVwcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBpZiAoY29udGVudC5pbmNsdWRlcyhwbGFjZWhvbGRlcikpIHtcbiAgICAgIGNvbnN0IHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGxhY2Vob2xkZXIsIHJlcGxhY2VtZW50KTtcbiAgICAgIGlmICh1cGRhdGVkICE9PSBjb250ZW50KSB7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVwcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIHVwZGF0ZWQpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBwYXR0ZXJuID0gbmV3IFJlZ0V4cChcbiAgICAgIGA8c3BhbltePl0qZGF0YS1zZWN1cmUtd2ViZGF2LXRhc2s9XCIke3RoaXMuZGVwcy5lc2NhcGVSZWdFeHAodGFza0lkKX1cIltePl0qPi4qPzxcXFxcL3NwYW4+YCxcbiAgICAgIFwic1wiLFxuICAgICk7XG4gICAgaWYgKHBhdHRlcm4udGVzdChjb250ZW50KSkge1xuICAgICAgY29uc3QgdXBkYXRlZCA9IGNvbnRlbnQucmVwbGFjZShwYXR0ZXJuLCByZXBsYWNlbWVudCk7XG4gICAgICBpZiAodXBkYXRlZCAhPT0gY29udGVudCkge1xuICAgICAgICBhd2FpdCB0aGlzLmRlcHMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB1cGRhdGVkKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcHJpdmF0ZSByZXBsYWNlUGxhY2Vob2xkZXJJbk9wZW5FZGl0b3JzKG5vdGVQYXRoOiBzdHJpbmcsIHRhc2tJZDogc3RyaW5nLCBwbGFjZWhvbGRlcjogc3RyaW5nLCByZXBsYWNlbWVudDogc3RyaW5nKSB7XG4gICAgbGV0IHJlcGxhY2VkID0gZmFsc2U7XG4gICAgY29uc3QgbGVhdmVzID0gdGhpcy5kZXBzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFwibWFya2Rvd25cIik7XG5cbiAgICBmb3IgKGNvbnN0IGxlYWYgb2YgbGVhdmVzKSB7XG4gICAgICBjb25zdCB2aWV3ID0gbGVhZi52aWV3O1xuICAgICAgaWYgKCEodmlldyBpbnN0YW5jZW9mIE1hcmtkb3duVmlldykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghdmlldy5maWxlIHx8IHZpZXcuZmlsZS5wYXRoICE9PSBub3RlUGF0aCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZWRpdG9yID0gdmlldy5lZGl0b3I7XG4gICAgICBjb25zdCBjb250ZW50ID0gZWRpdG9yLmdldFZhbHVlKCk7XG4gICAgICBsZXQgdXBkYXRlZCA9IGNvbnRlbnQ7XG5cbiAgICAgIGlmIChjb250ZW50LmluY2x1ZGVzKHBsYWNlaG9sZGVyKSkge1xuICAgICAgICB1cGRhdGVkID0gY29udGVudC5yZXBsYWNlKHBsYWNlaG9sZGVyLCByZXBsYWNlbWVudCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBwYXR0ZXJuID0gbmV3IFJlZ0V4cChcbiAgICAgICAgICBgPHNwYW5bXj5dKmRhdGEtc2VjdXJlLXdlYmRhdi10YXNrPVwiJHt0aGlzLmRlcHMuZXNjYXBlUmVnRXhwKHRhc2tJZCl9XCJbXj5dKj4uKj88XFxcXC9zcGFuPmAsXG4gICAgICAgICAgXCJzXCIsXG4gICAgICAgICk7XG4gICAgICAgIHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGF0dGVybiwgcmVwbGFjZW1lbnQpO1xuICAgICAgfVxuXG4gICAgICBpZiAodXBkYXRlZCAhPT0gY29udGVudCkge1xuICAgICAgICBlZGl0b3Iuc2V0VmFsdWUodXBkYXRlZCk7XG4gICAgICAgIHJlcGxhY2VkID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVwbGFjZWQ7XG4gIH1cbn1cbiIsICJpbXBvcnQgeyBBcHAsIFRGaWxlLCBURm9sZGVyLCBub3JtYWxpemVQYXRoIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmV4cG9ydCB0eXBlIERlbGV0aW9uVG9tYnN0b25lID0ge1xuICBwYXRoOiBzdHJpbmc7XG4gIGRlbGV0ZWRBdDogbnVtYmVyO1xuICByZW1vdGVTaWduYXR1cmU/OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgdHlwZSBSZW1vdGVGaWxlTGlrZSA9IHtcbiAgcmVtb3RlUGF0aDogc3RyaW5nO1xuICBsYXN0TW9kaWZpZWQ6IG51bWJlcjtcbiAgc2l6ZTogbnVtYmVyO1xuICBzaWduYXR1cmU6IHN0cmluZztcbn07XG5cbnR5cGUgU2VjdXJlV2ViZGF2U3luY1N1cHBvcnREZXBzID0ge1xuICBhcHA6IEFwcDtcbiAgZ2V0VmF1bHRTeW5jUmVtb3RlRm9sZGVyOiAoKSA9PiBzdHJpbmc7XG4gIGdldEV4Y2x1ZGVkU3luY0ZvbGRlcnM/OiAoKSA9PiBzdHJpbmdbXTtcbiAgZGVsZXRpb25Gb2xkZXJTdWZmaXg6IHN0cmluZztcbiAgZW5jb2RlQmFzZTY0VXJsOiAodmFsdWU6IHN0cmluZykgPT4gc3RyaW5nO1xuICBkZWNvZGVCYXNlNjRVcmw6ICh2YWx1ZTogc3RyaW5nKSA9PiBzdHJpbmc7XG59O1xuXG4vLyBLZWVwIHN5bmMgbWV0YWRhdGEgYW5kIHRvbWJzdG9uZSBydWxlcyBpc29sYXRlZCBzbyBxdWV1ZS9yZW5kZXJpbmcgY2hhbmdlc1xuLy8gZG8gbm90IGFjY2lkZW50YWxseSBhZmZlY3QgcmVjb25jaWxpYXRpb24gYmVoYXZpb3VyLlxuZXhwb3J0IGNsYXNzIFNlY3VyZVdlYmRhdlN5bmNTdXBwb3J0IHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBkZXBzOiBTZWN1cmVXZWJkYXZTeW5jU3VwcG9ydERlcHMpIHt9XG5cbiAgaXNFeGNsdWRlZFN5bmNQYXRoKHBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gbm9ybWFsaXplUGF0aChwYXRoKS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpLnJlcGxhY2UoL1xcLyskLywgXCJcIik7XG4gICAgaWYgKCFub3JtYWxpemVkUGF0aCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IGZvbGRlcnMgPSB0aGlzLmRlcHMuZ2V0RXhjbHVkZWRTeW5jRm9sZGVycz8uKCkgPz8gW107XG4gICAgcmV0dXJuIGZvbGRlcnMuc29tZSgoZm9sZGVyKSA9PiB7XG4gICAgICBjb25zdCBub3JtYWxpemVkRm9sZGVyID0gbm9ybWFsaXplUGF0aChmb2xkZXIpLnJlcGxhY2UoL15cXC8rLywgXCJcIikucmVwbGFjZSgvXFwvKyQvLCBcIlwiKTtcbiAgICAgIHJldHVybiBub3JtYWxpemVkRm9sZGVyLmxlbmd0aCA+IDAgJiYgKG5vcm1hbGl6ZWRQYXRoID09PSBub3JtYWxpemVkRm9sZGVyIHx8IG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoYCR7bm9ybWFsaXplZEZvbGRlcn0vYCkpO1xuICAgIH0pO1xuICB9XG5cbiAgc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IG5vcm1hbGl6ZVBhdGgocGF0aCk7XG4gICAgaWYgKFxuICAgICAgdGhpcy5pc0V4Y2x1ZGVkU3luY1BhdGgobm9ybWFsaXplZFBhdGgpIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwiLm9ic2lkaWFuL1wiKSB8fFxuICAgICAgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIi50cmFzaC9cIikgfHxcbiAgICAgIG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIuZ2l0L1wiKSB8fFxuICAgICAgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIm5vZGVfbW9kdWxlcy9cIikgfHxcbiAgICAgIG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCJfcGx1Z2luX3BhY2thZ2VzL1wiKSB8fFxuICAgICAgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIi50bXAtXCIpIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwiLm9ic2lkaWFuL3BsdWdpbnMvc2VjdXJlLXdlYmRhdi1pbWFnZXMvXCIpXG4gICAgKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gL1xcLihwbmd8anBlP2d8Z2lmfHdlYnB8Ym1wfHN2ZykkL2kudGVzdChub3JtYWxpemVkUGF0aCk7XG4gIH1cblxuICBzaG91bGRTa2lwRGlyZWN0b3J5U3luY1BhdGgoZGlyUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcCA9IG5vcm1hbGl6ZVBhdGgoZGlyUGF0aCk7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuaXNFeGNsdWRlZFN5bmNQYXRoKHApIHx8XG4gICAgICBwLnN0YXJ0c1dpdGgoXCIub2JzaWRpYW5cIikgfHxcbiAgICAgIHAuc3RhcnRzV2l0aChcIi50cmFzaFwiKSB8fFxuICAgICAgcC5zdGFydHNXaXRoKFwiLmdpdFwiKSB8fFxuICAgICAgcC5zdGFydHNXaXRoKFwibm9kZV9tb2R1bGVzXCIpIHx8XG4gICAgICBwLnN0YXJ0c1dpdGgoXCJfcGx1Z2luX3BhY2thZ2VzXCIpIHx8XG4gICAgICBwLnN0YXJ0c1dpdGgoXCIudG1wLVwiKVxuICAgICk7XG4gIH1cblxuICBjb2xsZWN0TG9jYWxTeW5jZWREaXJlY3RvcmllcygpIHtcbiAgICBjb25zdCBkaXJzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgZm9yIChjb25zdCBmIG9mIHRoaXMuZGVwcy5hcHAudmF1bHQuZ2V0QWxsRm9sZGVycygpKSB7XG4gICAgICBpZiAoZiBpbnN0YW5jZW9mIFRGb2xkZXIgJiYgIWYuaXNSb290KCkgJiYgIXRoaXMuc2hvdWxkU2tpcERpcmVjdG9yeVN5bmNQYXRoKGYucGF0aCkpIHtcbiAgICAgICAgZGlycy5hZGQobm9ybWFsaXplUGF0aChmLnBhdGgpKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGRpcnM7XG4gIH1cblxuICBjb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKSB7XG4gICAgcmV0dXJuIHRoaXMuZGVwcy5hcHAudmF1bHRcbiAgICAgIC5nZXRGaWxlcygpXG4gICAgICAuZmlsdGVyKChmaWxlKSA9PiAhdGhpcy5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKGZpbGUucGF0aCkpXG4gICAgICAuc29ydCgoYSwgYikgPT4gYS5wYXRoLmxvY2FsZUNvbXBhcmUoYi5wYXRoKSk7XG4gIH1cblxuICBidWlsZFN5bmNTaWduYXR1cmUoZmlsZTogVEZpbGUpIHtcbiAgICByZXR1cm4gYCR7ZmlsZS5zdGF0Lm10aW1lfToke2ZpbGUuc3RhdC5zaXplfWA7XG4gIH1cblxuICBidWlsZFJlbW90ZVN5bmNTaWduYXR1cmUocmVtb3RlOiBQaWNrPFJlbW90ZUZpbGVMaWtlLCBcImxhc3RNb2RpZmllZFwiIHwgXCJzaXplXCI+KSB7XG4gICAgcmV0dXJuIGAke3JlbW90ZS5sYXN0TW9kaWZpZWR9OiR7cmVtb3RlLnNpemV9YDtcbiAgfVxuXG4gIGJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aCh2YXVsdFBhdGg6IHN0cmluZykge1xuICAgIHJldHVybiBgJHt0aGlzLm5vcm1hbGl6ZUZvbGRlcih0aGlzLmRlcHMuZ2V0VmF1bHRTeW5jUmVtb3RlRm9sZGVyKCkpfSR7dmF1bHRQYXRofWA7XG4gIH1cblxuICBidWlsZERlbGV0aW9uRm9sZGVyKCkge1xuICAgIHJldHVybiBgJHt0aGlzLm5vcm1hbGl6ZUZvbGRlcih0aGlzLmRlcHMuZ2V0VmF1bHRTeW5jUmVtb3RlRm9sZGVyKCkpLnJlcGxhY2UoL1xcLyQvLCBcIlwiKX0ke3RoaXMuZGVwcy5kZWxldGlvbkZvbGRlclN1ZmZpeH1gO1xuICB9XG5cbiAgYnVpbGREZWxldGlvblJlbW90ZVBhdGgodmF1bHRQYXRoOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5idWlsZERlbGV0aW9uRm9sZGVyKCl9JHt0aGlzLmRlcHMuZW5jb2RlQmFzZTY0VXJsKHZhdWx0UGF0aCl9Lmpzb25gO1xuICB9XG5cbiAgcmVtb3RlRGVsZXRpb25QYXRoVG9WYXVsdFBhdGgocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgcm9vdCA9IHRoaXMuYnVpbGREZWxldGlvbkZvbGRlcigpO1xuICAgIGlmICghcmVtb3RlUGF0aC5zdGFydHNXaXRoKHJvb3QpIHx8ICFyZW1vdGVQYXRoLmVuZHNXaXRoKFwiLmpzb25cIikpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IGVuY29kZWQgPSByZW1vdGVQYXRoLnNsaWNlKHJvb3QubGVuZ3RoLCAtXCIuanNvblwiLmxlbmd0aCk7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiB0aGlzLmRlcHMuZGVjb2RlQmFzZTY0VXJsKGVuY29kZWQpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgcGFyc2VEZWxldGlvblRvbWJzdG9uZVBheWxvYWQocmF3OiBzdHJpbmcpOiBEZWxldGlvblRvbWJzdG9uZSB8IG51bGwge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdyk7XG4gICAgICBpZiAoIXBhcnNlZCB8fCB0eXBlb2YgcGFyc2VkLnBhdGggIT09IFwic3RyaW5nXCIgfHwgdHlwZW9mIHBhcnNlZC5kZWxldGVkQXQgIT09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICBpZiAocGFyc2VkLnJlbW90ZVNpZ25hdHVyZSAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiBwYXJzZWQucmVtb3RlU2lnbmF0dXJlICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcGF0aDogcGFyc2VkLnBhdGgsXG4gICAgICAgIGRlbGV0ZWRBdDogcGFyc2VkLmRlbGV0ZWRBdCxcbiAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiBwYXJzZWQucmVtb3RlU2lnbmF0dXJlLFxuICAgICAgfTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIHJlbW90ZVBhdGhUb1ZhdWx0UGF0aChyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCByb290ID0gdGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5kZXBzLmdldFZhdWx0U3luY1JlbW90ZUZvbGRlcigpKTtcbiAgICBpZiAoIXJlbW90ZVBhdGguc3RhcnRzV2l0aChyb290KSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlbW90ZVBhdGguc2xpY2Uocm9vdC5sZW5ndGgpLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG4gIH1cblxuICBzaG91bGREb3dubG9hZFJlbW90ZVZlcnNpb24obG9jYWxNdGltZTogbnVtYmVyLCByZW1vdGVNdGltZTogbnVtYmVyKSB7XG4gICAgcmV0dXJuIHJlbW90ZU10aW1lID4gbG9jYWxNdGltZSArIDIwMDA7XG4gIH1cblxuICBpc1RvbWJzdG9uZUF1dGhvcml0YXRpdmUoXG4gICAgdG9tYnN0b25lOiBEZWxldGlvblRvbWJzdG9uZSxcbiAgICByZW1vdGU/OiBQaWNrPFJlbW90ZUZpbGVMaWtlLCBcImxhc3RNb2RpZmllZFwiIHwgXCJzaWduYXR1cmVcIj4gfCBudWxsLFxuICApIHtcbiAgICBjb25zdCBncmFjZU1zID0gNTAwMDtcbiAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHRvbWJzdG9uZS5yZW1vdGVTaWduYXR1cmUpIHtcbiAgICAgIHJldHVybiByZW1vdGUuc2lnbmF0dXJlID09PSB0b21ic3RvbmUucmVtb3RlU2lnbmF0dXJlO1xuICAgIH1cblxuICAgIHJldHVybiByZW1vdGUubGFzdE1vZGlmaWVkIDw9IHRvbWJzdG9uZS5kZWxldGVkQXQgKyBncmFjZU1zO1xuICB9XG5cbiAgc2hvdWxkRGVsZXRlTG9jYWxGcm9tVG9tYnN0b25lKGZpbGU6IFRGaWxlLCB0b21ic3RvbmU6IERlbGV0aW9uVG9tYnN0b25lKSB7XG4gICAgY29uc3QgZ3JhY2VNcyA9IDUwMDA7XG4gICAgcmV0dXJuIGZpbGUuc3RhdC5tdGltZSA8PSB0b21ic3RvbmUuZGVsZXRlZEF0ICsgZ3JhY2VNcztcbiAgfVxuXG4gIHByaXZhdGUgbm9ybWFsaXplRm9sZGVyKGlucHV0OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gbm9ybWFsaXplRm9sZGVyKGlucHV0KTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplRm9sZGVyKGlucHV0OiBzdHJpbmcpIHtcbiAgcmV0dXJuIGlucHV0LnJlcGxhY2UoL15cXC8rLywgXCJcIikucmVwbGFjZSgvXFwvKyQvLCBcIlwiKSArIFwiL1wiO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUMsSUFBQUEsbUJB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QUFPLFlBQVksSUFBSTtBQUN2QixZQUFJO0FBQ0YsZ0JBQU0sS0FBSyxPQUFPLDZCQUE2QjtBQUFBLFFBQ2pELFVBQUU7QUFDQSxpQkFBTyxZQUFZLEtBQUs7QUFBQSxRQUMxQjtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNKO0FBQ0Y7QUFFQSxJQUFNLGNBQU4sY0FBMEIsdUJBQU07QUFBQSxFQUk5QixZQUFZLEtBQVUsV0FBbUIsVUFBa0I7QUFDekQsVUFBTSxHQUFHO0FBQ1QsU0FBSyxZQUFZO0FBQ2pCLFNBQUssV0FBVztBQUFBLEVBQ2xCO0FBQUEsRUFFQSxTQUFlO0FBQ2IsVUFBTSxFQUFFLFVBQVUsSUFBSTtBQUN0QixjQUFVLE1BQU07QUFDaEIsY0FBVSxTQUFTLE1BQU0sRUFBRSxNQUFNLEtBQUssVUFBVSxDQUFDO0FBQ2pELGNBQVUsU0FBUyxLQUFLLEVBQUUsTUFBTSxLQUFLLFNBQVMsQ0FBQztBQUFBLEVBQ2pEO0FBQUEsRUFFQSxVQUFnQjtBQUNkLFNBQUssVUFBVSxNQUFNO0FBQUEsRUFDdkI7QUFDRjsiLAogICJuYW1lcyI6IFsiaW1wb3J0X29ic2lkaWFuIiwgImltcG9ydF9vYnNpZGlhbiIsICJpbXBvcnRfb2JzaWRpYW4iLCAiZG9jdW1lbnQiLCAidG9tYnN0b25lIiwgInVwbG9hZGVkUmVtb3RlIiwgIm9ic2lkaWFuUmVxdWVzdFVybCJdCn0K
