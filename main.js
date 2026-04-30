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
    this.pendingVaultSyncPaths = /* @__PURE__ */ new Set();
    this.pendingVaultDeletionPaths = /* @__PURE__ */ new Map();
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
      name: "Fast sync changed vault content to WebDAV",
      callback: () => {
        void this.runManualSync();
      }
    });
    this.addCommand({
      id: "full-reconcile-vault-content-to-webdav",
      name: "Full reconcile vault content with WebDAV",
      callback: () => {
        void this.runFullReconcileSync();
      }
    });
    const fastSyncRibbon = this.addRibbonIcon("zap", this.t("\u5FEB\u901F\u540C\u6B65\u5230 WebDAV", "Fast sync to WebDAV"), () => {
      void this.runManualSync();
    });
    fastSyncRibbon.addClass("secure-webdav-sync-ribbon");
    fastSyncRibbon.addClass("secure-webdav-fast-sync-ribbon");
    const fullSyncRibbon = this.addRibbonIcon("refresh-cw", this.t("\u5B8C\u6574\u540C\u6B65\u5230 WebDAV", "Full sync to WebDAV"), () => {
      void this.runFullReconcileSync();
    });
    fullSyncRibbon.addClass("secure-webdav-sync-ribbon");
    fullSyncRibbon.addClass("secure-webdav-full-sync-ribbon");
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
      this.pendingVaultSyncPaths = /* @__PURE__ */ new Set();
      this.pendingVaultDeletionPaths = /* @__PURE__ */ new Map();
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
      this.pendingVaultSyncPaths = new Set(
        Array.isArray(candidate.pendingVaultSyncPaths) ? candidate.pendingVaultSyncPaths.filter((path) => typeof path === "string") : []
      );
      this.pendingVaultDeletionPaths = /* @__PURE__ */ new Map();
      for (const [path, rawEntry] of Object.entries(candidate.pendingVaultDeletionPaths ?? {})) {
        if (!rawEntry || typeof rawEntry !== "object") {
          continue;
        }
        const entry = rawEntry;
        const remotePath = typeof entry.remotePath === "string" && entry.remotePath.length > 0 ? entry.remotePath : `${this.normalizeFolder(this.settings.vaultSyncRemoteFolder)}${path}`;
        const remoteSignature = typeof entry.remoteSignature === "string" ? entry.remoteSignature : void 0;
        this.pendingVaultDeletionPaths.set(path, { remotePath, remoteSignature });
      }
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
    this.pendingVaultSyncPaths = /* @__PURE__ */ new Set();
    this.pendingVaultDeletionPaths = /* @__PURE__ */ new Map();
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
      pendingVaultSyncPaths: [...this.pendingVaultSyncPaths],
      pendingVaultDeletionPaths: Object.fromEntries(this.pendingVaultDeletionPaths.entries()),
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
    await this.syncPendingVaultContent(true);
  }
  async runFullReconcileSync() {
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
    if (!(file instanceof import_obsidian4.TFile)) {
      return;
    }
    this.markPendingVaultSync(file.path);
    if (file.extension === "md") {
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
    await this.savePluginState();
  }
  async handleVaultDelete(file) {
    if (!(file instanceof import_obsidian4.TFile)) {
      return;
    }
    if (!this.syncSupport.shouldSkipContentSyncPath(file.path)) {
      this.markPendingVaultDeletion(file.path);
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
      this.markPendingVaultDeletion(oldPath);
      this.syncIndex.delete(oldPath);
      await this.savePluginState();
    }
    if (!this.syncSupport.shouldSkipContentSyncPath(file.path)) {
      this.markPendingVaultSync(file.path);
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
  markPendingVaultSync(path) {
    if (this.syncSupport.shouldSkipContentSyncPath(path)) {
      this.pendingVaultSyncPaths.delete(path);
      return;
    }
    this.pendingVaultDeletionPaths.delete(path);
    this.pendingVaultSyncPaths.add(path);
  }
  markPendingVaultDeletion(path) {
    if (this.syncSupport.shouldSkipContentSyncPath(path)) {
      this.pendingVaultSyncPaths.delete(path);
      this.pendingVaultDeletionPaths.delete(path);
      return;
    }
    const existing = this.syncIndex.get(path);
    this.pendingVaultSyncPaths.delete(path);
    this.pendingVaultDeletionPaths.set(path, {
      remotePath: existing?.remotePath ?? this.syncSupport.buildVaultSyncRemotePath(path),
      remoteSignature: existing?.remoteSignature
    });
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
      this.pendingVaultSyncPaths.delete(file.path);
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
      this.pendingVaultSyncPaths.clear();
      this.pendingVaultDeletionPaths.clear();
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
  async syncPendingVaultContent(showNotice = true) {
    if (this.syncInProgress) {
      if (showNotice) {
        new import_obsidian4.Notice(this.t("\u540C\u6B65\u6B63\u5728\u8FDB\u884C\u4E2D\u3002", "A sync is already in progress."), 4e3);
      }
      return;
    }
    this.syncInProgress = true;
    const counts = { uploaded: 0, deletedRemoteFiles: 0, skipped: 0, detectedLocalChanges: 0 };
    try {
      this.ensureConfigured();
      await this.waitForPendingVaultMutations();
      const uploadsReady = await this.preparePendingUploadsForSync(showNotice);
      if (!uploadsReady) {
        return;
      }
      await this.queueChangedLocalFilesForFastSync(counts);
      await this.processPendingVaultDeletions(counts);
      await this.processPendingVaultUploads(counts);
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.t(
        `\u5DF2\u5FEB\u901F\u540C\u6B65\uFF1A\u53D1\u73B0 ${counts.detectedLocalChanges} \u4E2A\u672C\u5730\u53D8\u5316\uFF0C\u4E0A\u4F20 ${counts.uploaded} \u4E2A\u6587\u4EF6\uFF0C\u5220\u9664\u8FDC\u7AEF\u5185\u5BB9 ${counts.deletedRemoteFiles} \u4E2A\uFF0C\u8DF3\u8FC7 ${counts.skipped} \u4E2A\u6587\u4EF6\u3002`,
        `Fast sync found ${counts.detectedLocalChanges} local change(s), uploaded ${counts.uploaded} file(s), deleted ${counts.deletedRemoteFiles} remote content file(s), and skipped ${counts.skipped} file(s).`
      );
      await this.savePluginState();
      if (showNotice) {
        new import_obsidian4.Notice(this.lastVaultSyncStatus, 6e3);
      }
    } catch (error) {
      console.error("Fast vault content sync failed", error);
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.describeError(this.t("\u5FEB\u901F\u540C\u6B65\u5931\u8D25", "Fast sync failed"), error);
      await this.savePluginState();
      if (showNotice) {
        new import_obsidian4.Notice(this.lastVaultSyncStatus, 8e3);
      }
    } finally {
      this.syncInProgress = false;
    }
  }
  async queueChangedLocalFilesForFastSync(counts) {
    const files = this.syncSupport.collectVaultContentFiles();
    const recentTouchGraceMs = 1e3;
    for (const file of files) {
      const remotePath = this.syncSupport.buildVaultSyncRemotePath(file.path);
      const previous = this.syncIndex.get(file.path);
      const markdownContent = file.extension === "md" ? await this.readMarkdownContentPreferEditor(file) : void 0;
      if (file.extension === "md" && this.parseNoteStub(markdownContent ?? "")) {
        counts.skipped += 1;
        continue;
      }
      const localSignature = await this.buildCurrentLocalSignature(file, markdownContent);
      const touchedSinceLastSync = this.lastVaultSyncAt > 0 && file.stat.mtime > this.lastVaultSyncAt + recentTouchGraceMs;
      if (!previous || previous.remotePath !== remotePath || previous.localSignature !== localSignature || touchedSinceLastSync) {
        if (!this.pendingVaultSyncPaths.has(file.path)) {
          counts.detectedLocalChanges += 1;
        }
        this.markPendingVaultSync(file.path);
      }
    }
  }
  async processPendingVaultDeletions(counts) {
    for (const [path, entry] of [...this.pendingVaultDeletionPaths.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (this.syncSupport.shouldSkipContentSyncPath(path)) {
        this.pendingVaultDeletionPaths.delete(path);
        counts.skipped += 1;
        continue;
      }
      await this.writeDeletionTombstone(path, entry.remoteSignature);
      await this.deleteRemoteContentFile(entry.remotePath);
      this.syncIndex.delete(path);
      this.pendingVaultDeletionPaths.delete(path);
      counts.deletedRemoteFiles += 1;
    }
  }
  async processPendingVaultUploads(counts) {
    for (const path of [...this.pendingVaultSyncPaths].sort((a, b) => a.localeCompare(b))) {
      if (this.syncSupport.shouldSkipContentSyncPath(path)) {
        this.pendingVaultSyncPaths.delete(path);
        counts.skipped += 1;
        continue;
      }
      const file = this.getVaultFileByPath(path);
      if (!(file instanceof import_obsidian4.TFile)) {
        this.pendingVaultSyncPaths.delete(path);
        counts.skipped += 1;
        continue;
      }
      const markdownContent = file.extension === "md" ? await this.readMarkdownContentPreferEditor(file) : void 0;
      if (file.extension === "md" && this.parseNoteStub(markdownContent ?? "")) {
        this.pendingVaultSyncPaths.delete(path);
        counts.skipped += 1;
        continue;
      }
      const remotePath = this.syncSupport.buildVaultSyncRemotePath(file.path);
      const uploadedRemote = await this.uploadContentFileToRemote(file, remotePath, markdownContent);
      const localSignature = await this.buildCurrentLocalSignature(file, markdownContent);
      this.syncIndex.set(file.path, {
        localSignature,
        remoteSignature: uploadedRemote.signature,
        remotePath
      });
      await this.deleteDeletionTombstone(file.path);
      this.pendingVaultSyncPaths.delete(path);
      counts.uploaded += 1;
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
  shouldUploadLocalWhenRemoteIsMissing(file, previous, localSignature, remotePath) {
    if (previous) {
      return previous.remotePath !== remotePath || previous.localSignature !== localSignature;
    }
    const graceMs = 5e3;
    return !this.lastVaultSyncAt || file.stat.mtime > this.lastVaultSyncAt + graceMs;
  }
  formatConflictTimestamp() {
    const value = /* @__PURE__ */ new Date();
    const pad = (input) => String(input).padStart(2, "0");
    return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}-${pad(value.getHours())}${pad(value.getMinutes())}${pad(value.getSeconds())}`;
  }
  buildConflictCopyPath(originalPath, label) {
    const normalized = (0, import_obsidian4.normalizePath)(originalPath);
    const slashIndex = normalized.lastIndexOf("/");
    const dir = slashIndex >= 0 ? normalized.slice(0, slashIndex + 1) : "";
    const name = slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
    const dotIndex = name.lastIndexOf(".");
    const stem = dotIndex > 0 ? name.slice(0, dotIndex) : name;
    const ext = dotIndex > 0 ? name.slice(dotIndex) : "";
    const suffix = `.sync-conflict-${this.formatConflictTimestamp()}-${label}`;
    return `${dir}${stem}${suffix}${ext}`;
  }
  findExistingConflictCopyPath(originalPath) {
    const normalized = (0, import_obsidian4.normalizePath)(originalPath);
    const slashIndex = normalized.lastIndexOf("/");
    const dir = slashIndex >= 0 ? normalized.slice(0, slashIndex + 1) : "";
    const name = slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
    const dotIndex = name.lastIndexOf(".");
    const stem = dotIndex > 0 ? name.slice(0, dotIndex) : name;
    const ext = dotIndex > 0 ? name.slice(dotIndex) : "";
    const prefix = `${dir}${stem}.sync-conflict-`;
    return this.app.vault.getFiles().map((file) => file.path).find((path) => path.startsWith(prefix) && (!ext || path.endsWith(ext))) ?? null;
  }
  async createLocalConflictCopy(file, markdownContent, label) {
    const existing = this.findExistingConflictCopyPath(file.path);
    if (existing) {
      return existing;
    }
    let targetPath = this.buildConflictCopyPath(file.path, label);
    let attempt = 1;
    while (this.app.vault.getAbstractFileByPath(targetPath)) {
      const normalized = (0, import_obsidian4.normalizePath)(targetPath);
      const dotIndex = normalized.lastIndexOf(".");
      targetPath = dotIndex > 0 ? `${normalized.slice(0, dotIndex)}-${attempt}${normalized.slice(dotIndex)}` : `${normalized}-${attempt}`;
      attempt += 1;
    }
    await this.ensureLocalParentFolders(targetPath);
    if (file.extension === "md") {
      await this.app.vault.create(targetPath, markdownContent ?? await this.readMarkdownContentPreferEditor(file));
    } else {
      await this.app.vault.createBinary(targetPath, await this.app.vault.readBinary(file));
    }
    this.markPendingVaultSync(targetPath);
    return targetPath;
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
      const unchangedSinceLastSync = previous?.remotePath === remotePath && previous.localSignature === localSignature;
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
        if (!previous || this.syncSupport.shouldDeleteLocalFromTombstone(file, tombstone)) {
          await this.createLocalConflictCopy(file, markdownContent, "local");
          counts.skipped += 1;
          continue;
        }
        await this.deleteDeletionTombstone(file.path);
        deletionTombstones.delete(file.path);
      }
      if (!remote && !this.shouldUploadLocalWhenRemoteIsMissing(file, previous, localSignature, remotePath)) {
        counts.skipped += 1;
        continue;
      }
      if (!remote) {
        const uploadedRemote = await this.uploadContentFileToRemote(file, remotePath, markdownContent ?? void 0);
        this.syncIndex.set(file.path, {
          localSignature,
          remoteSignature: uploadedRemote.signature,
          remotePath
        });
        remoteFiles.set(remotePath, uploadedRemote);
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
        const uploadedRemote = await this.uploadContentFileToRemote(file, remotePath, markdownContent ?? void 0);
        this.syncIndex.set(file.path, {
          localSignature,
          remoteSignature: uploadedRemote.signature,
          remotePath
        });
        remoteFiles.set(remotePath, uploadedRemote);
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
        const uploadedRemote = await this.uploadContentFileToRemote(file, remotePath, markdownContent ?? void 0);
        this.syncIndex.set(file.path, {
          localSignature,
          remoteSignature: uploadedRemote.signature,
          remotePath
        });
        remoteFiles.set(remotePath, uploadedRemote);
        await this.deleteDeletionTombstone(file.path);
        counts.uploaded += 1;
        continue;
      }
      await this.createLocalConflictCopy(file, markdownContent, "local");
      counts.skipped += 1;
      continue;
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
    for (const dirPath of [...localOnly].sort((a, b) => a.length - b.length)) {
      const remoteDir = normalizeFolder(this.settings.vaultSyncRemoteFolder) + dirPath;
      try {
        await this.ensureRemoteDirectories(remoteDir);
        stats.createdRemote += 1;
      } catch {
      }
      newSyncedDirs.add(dirPath);
    }
    for (const dirPath of localDirPaths) {
      if (remoteLocalPaths.has(dirPath)) {
        newSyncedDirs.add(dirPath);
      }
    }
    for (const dirPath of [...remoteOnly].sort((a, b) => a.length - b.length)) {
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
        "\u4EE5\u5206\u949F\u4E3A\u5355\u4F4D\u8BBE\u7F6E\u81EA\u52A8\u540C\u6B65\u65F6\u95F4\u3002\u586B 0 \u8868\u793A\u5173\u95ED\u81EA\u52A8\u540C\u6B65\u3002\u8FD9\u91CC\u7684\u81EA\u52A8\u540C\u6B65\u6267\u884C\u201C\u5B8C\u6574\u540C\u6B65\u201D\uFF1A\u4F1A\u68C0\u67E5\u672C\u5730\u4E0E\u8FDC\u7AEF\u5DEE\u5F02\uFF0C\u4E0A\u4F20\u672C\u5730\u53D8\u66F4\uFF0C\u5E76\u62C9\u53D6\u8FDC\u7AEF\u66F4\u65B0\u3002",
        "Set the automatic sync interval in minutes. Use 0 to turn it off. Auto sync runs the full sync flow: it checks local and remote differences, uploads local changes, and pulls remote updates."
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
${this.plugin.t("\u8BF4\u660E\uFF1A\u5FEB\u901F\u540C\u6B65\u53EA\u8D1F\u8D23\u4E0A\u4F20\u672C\u5730\u65B0\u589E/\u4FEE\u6539\u6587\u4EF6\uFF0C\u5E76\u5904\u7406\u660E\u786E\u5220\u9664\u961F\u5217\uFF1B\u5B8C\u6574\u540C\u6B65\u624D\u4F1A\u540C\u65F6\u4E0A\u4F20\u672C\u5730\u53D8\u66F4\u5E76\u4E0B\u8F7D\u8FDC\u7AEF\u66F4\u65B0\u3002\u56FE\u7247\u4E0A\u4F20\u4ECD\u7531\u72EC\u7ACB\u961F\u5217\u5904\u7406\u3002", "Note: Fast sync only uploads local additions/edits and processes explicit deletion queues. Full sync is the mode that both uploads local changes and downloads remote updates. Image uploads continue to be handled by the separate queue.")}`,
        `${this.plugin.formatLastSyncLabel()}
${this.plugin.formatSyncStatusLabel()}
${this.plugin.t("\u8BF4\u660E\uFF1A\u5FEB\u901F\u540C\u6B65\u53EA\u8D1F\u8D23\u4E0A\u4F20\u672C\u5730\u65B0\u589E/\u4FEE\u6539\u6587\u4EF6\uFF0C\u5E76\u5904\u7406\u660E\u786E\u5220\u9664\u961F\u5217\uFF1B\u5B8C\u6574\u540C\u6B65\u624D\u4F1A\u540C\u65F6\u4E0A\u4F20\u672C\u5730\u53D8\u66F4\u5E76\u4E0B\u8F7D\u8FDC\u7AEF\u66F4\u65B0\u3002\u56FE\u7247\u4E0A\u4F20\u4ECD\u7531\u72EC\u7ACB\u961F\u5217\u5904\u7406\u3002", "Note: Fast sync only uploads local additions/edits and processes explicit deletion queues. Full sync is the mode that both uploads local changes and downloads remote updates. Image uploads continue to be handled by the separate queue.")}`
      )
    ).addButton(
      (button) => button.setButtonText(this.plugin.t("\u5FEB\u901F\u540C\u6B65", "Fast sync")).onClick(async () => {
        button.setDisabled(true);
        try {
          await this.plugin.syncPendingVaultContent(true);
          this.display();
        } finally {
          button.setDisabled(false);
        }
      })
    ).addButton(
      (button) => button.setButtonText(this.plugin.t("\u5B8C\u6574\u5BF9\u8D26", "Full reconcile")).onClick(async () => {
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyIsICJzZWN1cmUtd2ViZGF2LWltYWdlLXN1cHBvcnQudHMiLCAic2VjdXJlLXdlYmRhdi11cGxvYWQtcXVldWUudHMiLCAic2VjdXJlLXdlYmRhdi1zeW5jLXN1cHBvcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIlx1RkVGRmltcG9ydCB7XG4gIEFwcCxcbiAgRWRpdG9yLFxuICBNYXJrZG93bkZpbGVJbmZvLFxuICBNYXJrZG93blZpZXcsXG4gIE1vZGFsLFxuICBOb3RpY2UsXG4gIFBsdWdpbixcbiAgUGx1Z2luU2V0dGluZ1RhYixcbiAgU2V0dGluZyxcbiAgVEFic3RyYWN0RmlsZSxcbiAgVEZpbGUsXG4gIFRGb2xkZXIsXG4gIG5vcm1hbGl6ZVBhdGgsXG4gIHJlcXVlc3RVcmwgYXMgb2JzaWRpYW5SZXF1ZXN0VXJsLFxufSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7IFNFQ1VSRV9DT0RFX0JMT0NLLCBTRUNVUkVfUFJPVE9DT0wsIFNlY3VyZVdlYmRhdkltYWdlU3VwcG9ydCB9IGZyb20gXCIuL3NlY3VyZS13ZWJkYXYtaW1hZ2Utc3VwcG9ydFwiO1xuaW1wb3J0IHsgU2VjdXJlV2ViZGF2VXBsb2FkUXVldWVTdXBwb3J0LCB0eXBlIFVwbG9hZFRhc2sgfSBmcm9tIFwiLi9zZWN1cmUtd2ViZGF2LXVwbG9hZC1xdWV1ZVwiO1xuaW1wb3J0IHtcbiAgU2VjdXJlV2ViZGF2U3luY1N1cHBvcnQsXG4gIHR5cGUgRGVsZXRpb25Ub21ic3RvbmUsXG4gIG5vcm1hbGl6ZUZvbGRlcixcbn0gZnJvbSBcIi4vc2VjdXJlLXdlYmRhdi1zeW5jLXN1cHBvcnRcIjtcblxudHlwZSBTZWN1cmVXZWJkYXZTZXR0aW5ncyA9IHtcbiAgd2ViZGF2VXJsOiBzdHJpbmc7XG4gIHVzZXJuYW1lOiBzdHJpbmc7XG4gIHBhc3N3b3JkOiBzdHJpbmc7XG4gIHJlbW90ZUZvbGRlcjogc3RyaW5nO1xuICB2YXVsdFN5bmNSZW1vdGVGb2xkZXI6IHN0cmluZztcbiAgZXhjbHVkZWRTeW5jRm9sZGVyczogc3RyaW5nW107XG4gIG5hbWluZ1N0cmF0ZWd5OiBcInRpbWVzdGFtcFwiIHwgXCJoYXNoXCI7XG4gIGRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQ6IGJvb2xlYW47XG4gIGxhbmd1YWdlOiBcImF1dG9cIiB8IFwiemhcIiB8IFwiZW5cIjtcbiAgbm90ZVN0b3JhZ2VNb2RlOiBcImZ1bGwtbG9jYWxcIiB8IFwibGF6eS1ub3Rlc1wiO1xuICBub3RlRXZpY3RBZnRlckRheXM6IG51bWJlcjtcbiAgYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXM6IG51bWJlcjtcbiAgbWF4UmV0cnlBdHRlbXB0czogbnVtYmVyO1xuICByZXRyeURlbGF5U2Vjb25kczogbnVtYmVyO1xuICBkZWxldGVSZW1vdGVXaGVuVW5yZWZlcmVuY2VkOiBib29sZWFuO1xuICBjb21wcmVzc0ltYWdlczogYm9vbGVhbjtcbiAgY29tcHJlc3NUaHJlc2hvbGRLYjogbnVtYmVyO1xuICBtYXhJbWFnZURpbWVuc2lvbjogbnVtYmVyO1xuICBqcGVnUXVhbGl0eTogbnVtYmVyO1xufTtcblxudHlwZSBTeW5jSW5kZXhFbnRyeSA9IHtcbiAgbG9jYWxTaWduYXR1cmU6IHN0cmluZztcbiAgcmVtb3RlU2lnbmF0dXJlOiBzdHJpbmc7XG4gIHJlbW90ZVBhdGg6IHN0cmluZztcbn07XG5cbnR5cGUgUmVtb3RlRmlsZVN0YXRlID0ge1xuICByZW1vdGVQYXRoOiBzdHJpbmc7XG4gIGxhc3RNb2RpZmllZDogbnVtYmVyO1xuICBzaXplOiBudW1iZXI7XG4gIHNpZ25hdHVyZTogc3RyaW5nO1xufTtcblxudHlwZSBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZCA9IHtcbiAgZmlyc3REZXRlY3RlZEF0OiBudW1iZXI7XG4gIGxhc3REZXRlY3RlZEF0OiBudW1iZXI7XG4gIG1pc3NDb3VudDogbnVtYmVyO1xufTtcblxudHlwZSBQZW5kaW5nRGVsZXRpb25FbnRyeSA9IHtcbiAgcmVtb3RlUGF0aDogc3RyaW5nO1xuICByZW1vdGVTaWduYXR1cmU/OiBzdHJpbmc7XG59O1xuXG50eXBlIFJlbW90ZUludmVudG9yeSA9IHtcbiAgZmlsZXM6IE1hcDxzdHJpbmcsIFJlbW90ZUZpbGVTdGF0ZT47XG4gIGRpcmVjdG9yaWVzOiBTZXQ8c3RyaW5nPjtcbn07XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFNlY3VyZVdlYmRhdlNldHRpbmdzID0ge1xuICB3ZWJkYXZVcmw6IFwiXCIsXG4gIHVzZXJuYW1lOiBcIlwiLFxuICBwYXNzd29yZDogXCJcIixcbiAgcmVtb3RlRm9sZGVyOiBcIi9yZW1vdGUtaW1hZ2VzL1wiLFxuICB2YXVsdFN5bmNSZW1vdGVGb2xkZXI6IFwiL3ZhdWx0LXN5bmMvXCIsXG4gIGV4Y2x1ZGVkU3luY0ZvbGRlcnM6IFtcImtiXCJdLFxuICBuYW1pbmdTdHJhdGVneTogXCJoYXNoXCIsXG4gIGRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQ6IHRydWUsXG4gIGxhbmd1YWdlOiBcImF1dG9cIixcbiAgbm90ZVN0b3JhZ2VNb2RlOiBcImZ1bGwtbG9jYWxcIixcbiAgbm90ZUV2aWN0QWZ0ZXJEYXlzOiAzMCxcbiAgYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXM6IDAsXG4gIG1heFJldHJ5QXR0ZW1wdHM6IDUsXG4gIHJldHJ5RGVsYXlTZWNvbmRzOiA1LFxuICBkZWxldGVSZW1vdGVXaGVuVW5yZWZlcmVuY2VkOiB0cnVlLFxuICBjb21wcmVzc0ltYWdlczogdHJ1ZSxcbiAgY29tcHJlc3NUaHJlc2hvbGRLYjogMzAwLFxuICBtYXhJbWFnZURpbWVuc2lvbjogMjIwMCxcbiAganBlZ1F1YWxpdHk6IDgyLFxufTtcblxuY29uc3QgTUlNRV9NQVA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIGpwZzogXCJpbWFnZS9qcGVnXCIsXG4gIGpwZWc6IFwiaW1hZ2UvanBlZ1wiLFxuICBwbmc6IFwiaW1hZ2UvcG5nXCIsXG4gIGdpZjogXCJpbWFnZS9naWZcIixcbiAgd2VicDogXCJpbWFnZS93ZWJwXCIsXG4gIHN2ZzogXCJpbWFnZS9zdmcreG1sXCIsXG4gIGJtcDogXCJpbWFnZS9ibXBcIixcbiAgXCJpbWFnZS9qcGVnXCI6IFwianBnXCIsXG4gIFwiaW1hZ2UvcG5nXCI6IFwicG5nXCIsXG4gIFwiaW1hZ2UvZ2lmXCI6IFwiZ2lmXCIsXG4gIFwiaW1hZ2Uvd2VicFwiOiBcIndlYnBcIixcbiAgXCJpbWFnZS9ibXBcIjogXCJibXBcIixcbiAgXCJpbWFnZS9zdmcreG1sXCI6IFwic3ZnXCIsXG59O1xuXG5jb25zdCBTRUNVUkVfTk9URV9TVFVCID0gXCJzZWN1cmUtd2ViZGF2LW5vdGUtc3R1YlwiO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTZWN1cmVXZWJkYXZJbWFnZXNQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogU2VjdXJlV2ViZGF2U2V0dGluZ3MgPSBERUZBVUxUX1NFVFRJTkdTO1xuICBxdWV1ZTogVXBsb2FkVGFza1tdID0gW107XG4gIHByaXZhdGUgYmxvYlVybHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSByZWFkb25seSBtYXhCbG9iVXJscyA9IDEwMDtcbiAgcHJpdmF0ZSBub3RlUmVtb3RlUmVmcyA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8c3RyaW5nPj4oKTtcbiAgcHJpdmF0ZSByZW1vdGVDbGVhbnVwSW5GbGlnaHQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBub3RlQWNjZXNzVGltZXN0YW1wcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG4gIHByaXZhdGUgc3luY0luZGV4ID0gbmV3IE1hcDxzdHJpbmcsIFN5bmNJbmRleEVudHJ5PigpO1xuICBwcml2YXRlIHN5bmNlZERpcmVjdG9yaWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgbWlzc2luZ0xhenlSZW1vdGVOb3RlcyA9IG5ldyBNYXA8c3RyaW5nLCBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZD4oKTtcbiAgcHJpdmF0ZSBwZW5kaW5nVmF1bHRTeW5jUGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBwZW5kaW5nVmF1bHREZWxldGlvblBhdGhzID0gbmV3IE1hcDxzdHJpbmcsIFBlbmRpbmdEZWxldGlvbkVudHJ5PigpO1xuICBwcml2YXRlIHBlbmRpbmdWYXVsdE11dGF0aW9uUHJvbWlzZXMgPSBuZXcgU2V0PFByb21pc2U8dm9pZD4+KCk7XG4gIHByaXZhdGUgcHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgcHJpdmF0ZSBwcmlvcml0eU5vdGVTeW5jc0luRmxpZ2h0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgbGFzdFZhdWx0U3luY0F0ID0gMDtcbiAgcHJpdmF0ZSBsYXN0VmF1bHRTeW5jU3RhdHVzID0gXCJcIjtcbiAgcHJpdmF0ZSBzeW5jSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICBwcml2YXRlIGF1dG9TeW5jVGlja0luUHJvZ3Jlc3MgPSBmYWxzZTtcbiAgLy8gSW1hZ2UgcGFyc2luZyBhbmQgcmVuZGVyaW5nIGxpdmUgaW4gYSBkZWRpY2F0ZWQgaGVscGVyIHNvIHN5bmMgY2hhbmdlc1xuICAvLyBkbyBub3QgYWNjaWRlbnRhbGx5IGJyZWFrIGRpc3BsYXkgYmVoYXZpb3VyIGFnYWluLlxuICBwcml2YXRlIGltYWdlU3VwcG9ydCE6IFNlY3VyZVdlYmRhdkltYWdlU3VwcG9ydDtcbiAgLy8gVXBsb2FkIHF1ZXVlIHN0YXRlIGlzIGlzb2xhdGVkIHNvIHJldHJpZXMgYW5kIHBsYWNlaG9sZGVyIHJlcGxhY2VtZW50IGRvXG4gIC8vIG5vdCBrZWVwIHNwcmF3bGluZyBhY3Jvc3MgdGhlIG1haW4gcGx1Z2luIGNsYXNzLlxuICBwcml2YXRlIHVwbG9hZFF1ZXVlITogU2VjdXJlV2ViZGF2VXBsb2FkUXVldWVTdXBwb3J0O1xuICAvLyBTeW5jIG1ldGFkYXRhIGhlbHBlcnMgYXJlIGlzb2xhdGVkIHNvIHJlY29uY2lsaWF0aW9uIHJ1bGVzIHN0YXkgZXhwbGljaXQuXG4gIHByaXZhdGUgc3luY1N1cHBvcnQhOiBTZWN1cmVXZWJkYXZTeW5jU3VwcG9ydDtcblxuICBwcml2YXRlIHJlYWRvbmx5IGRlbGV0aW9uRm9sZGVyU3VmZml4ID0gXCIuX19zZWN1cmUtd2ViZGF2LWRlbGV0aW9uc19fL1wiO1xuICBwcml2YXRlIHJlYWRvbmx5IG1pc3NpbmdMYXp5UmVtb3RlQ29uZmlybWF0aW9ucyA9IDI7XG5cbiAgcHJpdmF0ZSBpbml0aWFsaXplU3VwcG9ydE1vZHVsZXMoKSB7XG4gICAgLy8gS2VlcCBydW50aW1lLW9ubHkgaW50ZWdyYXRpb24gaGVyZTogdGhlIGltYWdlIG1vZHVsZSBvd25zIHBhcnNpbmcgYW5kXG4gICAgLy8gcmVuZGVyaW5nLCB3aGlsZSB0aGUgcGx1Z2luIHN0aWxsIG93bnMgV2ViREFWIGFjY2VzcyBhbmQgbGlmZWN5Y2xlLlxuICAgIHRoaXMuaW1hZ2VTdXBwb3J0ID0gbmV3IFNlY3VyZVdlYmRhdkltYWdlU3VwcG9ydCh7XG4gICAgICB0OiB0aGlzLnQuYmluZCh0aGlzKSxcbiAgICAgIGZldGNoU2VjdXJlSW1hZ2VCbG9iVXJsOiB0aGlzLmZldGNoU2VjdXJlSW1hZ2VCbG9iVXJsLmJpbmQodGhpcyksXG4gICAgfSk7XG4gICAgdGhpcy51cGxvYWRRdWV1ZSA9IG5ldyBTZWN1cmVXZWJkYXZVcGxvYWRRdWV1ZVN1cHBvcnQoe1xuICAgICAgYXBwOiB0aGlzLmFwcCxcbiAgICAgIHQ6IHRoaXMudC5iaW5kKHRoaXMpLFxuICAgICAgc2V0dGluZ3M6ICgpID0+IHRoaXMuc2V0dGluZ3MsXG4gICAgICBnZXRRdWV1ZTogKCkgPT4gdGhpcy5xdWV1ZSxcbiAgICAgIHNldFF1ZXVlOiAocXVldWUpID0+IHtcbiAgICAgICAgdGhpcy5xdWV1ZSA9IHF1ZXVlO1xuICAgICAgfSxcbiAgICAgIHNhdmVQbHVnaW5TdGF0ZTogdGhpcy5zYXZlUGx1Z2luU3RhdGUuYmluZCh0aGlzKSxcbiAgICAgIHNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYzogdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMuYmluZCh0aGlzKSxcbiAgICAgIHJlcXVlc3RVcmw6IHRoaXMucmVxdWVzdFVybC5iaW5kKHRoaXMpLFxuICAgICAgYnVpbGRVcGxvYWRVcmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwuYmluZCh0aGlzKSxcbiAgICAgIGJ1aWxkQXV0aEhlYWRlcjogdGhpcy5idWlsZEF1dGhIZWFkZXIuYmluZCh0aGlzKSxcbiAgICAgIHByZXBhcmVVcGxvYWRQYXlsb2FkOiB0aGlzLnByZXBhcmVVcGxvYWRQYXlsb2FkLmJpbmQodGhpcyksXG4gICAgICBidWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeTogdGhpcy5idWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeS5iaW5kKHRoaXMpLFxuICAgICAgYnVpbGRSZW1vdGVQYXRoOiB0aGlzLmJ1aWxkUmVtb3RlUGF0aC5iaW5kKHRoaXMpLFxuICAgICAgYnVpbGRTZWN1cmVJbWFnZU1hcmt1cDogdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cC5iaW5kKHRoaXMuaW1hZ2VTdXBwb3J0KSxcbiAgICAgIGdldE1pbWVUeXBlRnJvbUZpbGVOYW1lOiB0aGlzLmdldE1pbWVUeXBlRnJvbUZpbGVOYW1lLmJpbmQodGhpcyksXG4gICAgICBhcnJheUJ1ZmZlclRvQmFzZTY0OiB0aGlzLmFycmF5QnVmZmVyVG9CYXNlNjQuYmluZCh0aGlzKSxcbiAgICAgIGJhc2U2NFRvQXJyYXlCdWZmZXI6IHRoaXMuYmFzZTY0VG9BcnJheUJ1ZmZlci5iaW5kKHRoaXMpLFxuICAgICAgZXNjYXBlSHRtbDogdGhpcy5lc2NhcGVIdG1sLmJpbmQodGhpcyksXG4gICAgICBlc2NhcGVSZWdFeHA6IHRoaXMuZXNjYXBlUmVnRXhwLmJpbmQodGhpcyksXG4gICAgICBkZXNjcmliZUVycm9yOiB0aGlzLmRlc2NyaWJlRXJyb3IuYmluZCh0aGlzKSxcbiAgICB9KTtcbiAgICB0aGlzLnN5bmNTdXBwb3J0ID0gbmV3IFNlY3VyZVdlYmRhdlN5bmNTdXBwb3J0KHtcbiAgICAgIGFwcDogdGhpcy5hcHAsXG4gICAgICBnZXRWYXVsdFN5bmNSZW1vdGVGb2xkZXI6ICgpID0+IHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyLFxuICAgICAgZ2V0RXhjbHVkZWRTeW5jRm9sZGVyczogKCkgPT4gdGhpcy5zZXR0aW5ncy5leGNsdWRlZFN5bmNGb2xkZXJzID8/IFtdLFxuICAgICAgZGVsZXRpb25Gb2xkZXJTdWZmaXg6IHRoaXMuZGVsZXRpb25Gb2xkZXJTdWZmaXgsXG4gICAgICBlbmNvZGVCYXNlNjRVcmw6ICh2YWx1ZSkgPT5cbiAgICAgICAgdGhpcy5hcnJheUJ1ZmZlclRvQmFzZTY0KHRoaXMuZW5jb2RlVXRmOCh2YWx1ZSkpLnJlcGxhY2UoL1xcKy9nLCBcIi1cIikucmVwbGFjZSgvXFwvL2csIFwiX1wiKS5yZXBsYWNlKC89KyQvZywgXCJcIiksXG4gICAgICBkZWNvZGVCYXNlNjRVcmw6ICh2YWx1ZSkgPT4ge1xuICAgICAgICBjb25zdCBub3JtYWxpemVkID0gdmFsdWUucmVwbGFjZSgvLS9nLCBcIitcIikucmVwbGFjZSgvXy9nLCBcIi9cIik7XG4gICAgICAgIGNvbnN0IHBhZGRlZCA9IG5vcm1hbGl6ZWQgKyBcIj1cIi5yZXBlYXQoKDQgLSAobm9ybWFsaXplZC5sZW5ndGggJSA0IHx8IDQpKSAlIDQpO1xuICAgICAgICByZXR1cm4gdGhpcy5kZWNvZGVVdGY4KHRoaXMuYmFzZTY0VG9BcnJheUJ1ZmZlcihwYWRkZWQpKTtcbiAgICAgIH0sXG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgYXdhaXQgdGhpcy5sb2FkUGx1Z2luU3RhdGUoKTtcbiAgICB0aGlzLmluaXRpYWxpemVTdXBwb3J0TW9kdWxlcygpO1xuXG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBTZWN1cmVXZWJkYXZTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwidXBsb2FkLWN1cnJlbnQtbm90ZS1sb2NhbC1pbWFnZXNcIixcbiAgICAgIG5hbWU6IFwiVXBsb2FkIGxvY2FsIGltYWdlcyBpbiBjdXJyZW50IG5vdGUgdG8gV2ViREFWXCIsXG4gICAgICBjaGVja0NhbGxiYWNrOiAoY2hlY2tpbmcpID0+IHtcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgICAgIGlmICghZmlsZSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghY2hlY2tpbmcpIHtcbiAgICAgICAgICB2b2lkIHRoaXMudXBsb2FkSW1hZ2VzSW5Ob3RlKGZpbGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInRlc3Qtd2ViZGF2LWNvbm5lY3Rpb25cIixcbiAgICAgIG5hbWU6IFwiVGVzdCBXZWJEQVYgY29ubmVjdGlvblwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLnJ1bkNvbm5lY3Rpb25UZXN0KHRydWUpO1xuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJzeW5jLWNvbmZpZ3VyZWQtdmF1bHQtY29udGVudC10by13ZWJkYXZcIixcbiAgICAgIG5hbWU6IFwiRmFzdCBzeW5jIGNoYW5nZWQgdmF1bHQgY29udGVudCB0byBXZWJEQVZcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5ydW5NYW51YWxTeW5jKCk7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcImZ1bGwtcmVjb25jaWxlLXZhdWx0LWNvbnRlbnQtdG8td2ViZGF2XCIsXG4gICAgICBuYW1lOiBcIkZ1bGwgcmVjb25jaWxlIHZhdWx0IGNvbnRlbnQgd2l0aCBXZWJEQVZcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5ydW5GdWxsUmVjb25jaWxlU3luYygpO1xuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGZhc3RTeW5jUmliYm9uID0gdGhpcy5hZGRSaWJib25JY29uKFwiemFwXCIsIHRoaXMudChcIlx1NUZFQlx1OTAxRlx1NTQwQ1x1NkI2NVx1NTIzMCBXZWJEQVZcIiwgXCJGYXN0IHN5bmMgdG8gV2ViREFWXCIpLCAoKSA9PiB7XG4gICAgICB2b2lkIHRoaXMucnVuTWFudWFsU3luYygpO1xuICAgIH0pO1xuICAgIGZhc3RTeW5jUmliYm9uLmFkZENsYXNzKFwic2VjdXJlLXdlYmRhdi1zeW5jLXJpYmJvblwiKTtcbiAgICBmYXN0U3luY1JpYmJvbi5hZGRDbGFzcyhcInNlY3VyZS13ZWJkYXYtZmFzdC1zeW5jLXJpYmJvblwiKTtcblxuICAgIGNvbnN0IGZ1bGxTeW5jUmliYm9uID0gdGhpcy5hZGRSaWJib25JY29uKFwicmVmcmVzaC1jd1wiLCB0aGlzLnQoXCJcdTVCOENcdTY1NzRcdTU0MENcdTZCNjVcdTUyMzAgV2ViREFWXCIsIFwiRnVsbCBzeW5jIHRvIFdlYkRBVlwiKSwgKCkgPT4ge1xuICAgICAgdm9pZCB0aGlzLnJ1bkZ1bGxSZWNvbmNpbGVTeW5jKCk7XG4gICAgfSk7XG4gICAgZnVsbFN5bmNSaWJib24uYWRkQ2xhc3MoXCJzZWN1cmUtd2ViZGF2LXN5bmMtcmliYm9uXCIpO1xuICAgIGZ1bGxTeW5jUmliYm9uLmFkZENsYXNzKFwic2VjdXJlLXdlYmRhdi1mdWxsLXN5bmMtcmliYm9uXCIpO1xuXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duUG9zdFByb2Nlc3NvcigoZWwsIGN0eCkgPT4ge1xuICAgICAgdm9pZCB0aGlzLmltYWdlU3VwcG9ydC5wcm9jZXNzU2VjdXJlSW1hZ2VzKGVsLCBjdHgpO1xuICAgIH0pO1xuICAgIHRyeSB7XG4gICAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoU0VDVVJFX0NPREVfQkxPQ0ssIChzb3VyY2UsIGVsLCBjdHgpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmltYWdlU3VwcG9ydC5wcm9jZXNzU2VjdXJlQ29kZUJsb2NrKHNvdXJjZSwgZWwsIGN0eCk7XG4gICAgICB9KTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIGNvbnNvbGUud2FybihcIltzZWN1cmUtd2ViZGF2LWltYWdlc10gY29kZSBibG9jayBwcm9jZXNzb3IgYWxyZWFkeSByZWdpc3RlcmVkLCBza2lwcGluZ1wiKTtcbiAgICB9XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJmaWxlLW9wZW5cIiwgKGZpbGUpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmhhbmRsZUZpbGVPcGVuKGZpbGUpO1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImVkaXRvci1wYXN0ZVwiLCAoZXZ0LCBlZGl0b3IsIGluZm8pID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmhhbmRsZUVkaXRvclBhc3RlKGV2dCwgZWRpdG9yLCBpbmZvKTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJlZGl0b3ItZHJvcFwiLCAoZXZ0LCBlZGl0b3IsIGluZm8pID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmhhbmRsZUVkaXRvckRyb3AoZXZ0LCBlZGl0b3IsIGluZm8pO1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIGF3YWl0IHRoaXMucmVidWlsZFJlZmVyZW5jZUluZGV4KCk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwibW9kaWZ5XCIsIChmaWxlKSA9PiB0aGlzLnRyYWNrVmF1bHRNdXRhdGlvbigoKSA9PiB0aGlzLmhhbmRsZVZhdWx0TW9kaWZ5KGZpbGUpKSkpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcImRlbGV0ZVwiLCAoZmlsZSkgPT4gdGhpcy50cmFja1ZhdWx0TXV0YXRpb24oKCkgPT4gdGhpcy5oYW5kbGVWYXVsdERlbGV0ZShmaWxlKSkpKTtcbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC52YXVsdC5vbihcInJlbmFtZVwiLCAoZmlsZSwgb2xkUGF0aCkgPT4gdGhpcy50cmFja1ZhdWx0TXV0YXRpb24oKCkgPT4gdGhpcy5oYW5kbGVWYXVsdFJlbmFtZShmaWxlLCBvbGRQYXRoKSkpLFxuICAgICk7XG5cbiAgICB0aGlzLnNldHVwQXV0b1N5bmMoKTtcblxuICAgIHZvaWQgdGhpcy51cGxvYWRRdWV1ZS5wcm9jZXNzUGVuZGluZ1Rhc2tzKCk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyKCgpID0+IHtcbiAgICAgIGZvciAoY29uc3QgYmxvYlVybCBvZiB0aGlzLmJsb2JVcmxzKSB7XG4gICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwoYmxvYlVybCk7XG4gICAgICB9XG4gICAgICB0aGlzLmJsb2JVcmxzLmNsZWFyKCk7XG4gICAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy52YWx1ZXMoKSkge1xuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgICB9XG4gICAgICB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy5jbGVhcigpO1xuICAgICAgdGhpcy51cGxvYWRRdWV1ZS5kaXNwb3NlKCk7XG4gICAgfSk7XG4gIH1cblxuICBvbnVubG9hZCgpIHtcbiAgICBmb3IgKGNvbnN0IGJsb2JVcmwgb2YgdGhpcy5ibG9iVXJscykge1xuICAgICAgVVJMLnJldm9rZU9iamVjdFVSTChibG9iVXJsKTtcbiAgICB9XG4gICAgdGhpcy5ibG9iVXJscy5jbGVhcigpO1xuICAgIHRoaXMudXBsb2FkUXVldWU/LmRpc3Bvc2UoKTtcbiAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy52YWx1ZXMoKSkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xuICAgIH1cbiAgICB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy5jbGVhcigpO1xuICB9XG5cbiAgYXN5bmMgbG9hZFBsdWdpblN0YXRlKCkge1xuICAgIGNvbnN0IGxvYWRlZCA9IGF3YWl0IHRoaXMubG9hZERhdGEoKTtcbiAgICBpZiAoIWxvYWRlZCB8fCB0eXBlb2YgbG9hZGVkICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICB0aGlzLnNldHRpbmdzID0geyAuLi5ERUZBVUxUX1NFVFRJTkdTIH07XG4gICAgICB0aGlzLnF1ZXVlID0gW107XG4gICAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzID0gbmV3IE1hcCgpO1xuICAgICAgdGhpcy5zeW5jSW5kZXggPSBuZXcgTWFwKCk7XG4gICAgICB0aGlzLnN5bmNlZERpcmVjdG9yaWVzID0gbmV3IFNldCgpO1xuICAgICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzID0gbmV3IE1hcCgpO1xuICAgICAgdGhpcy5wZW5kaW5nVmF1bHRTeW5jUGF0aHMgPSBuZXcgU2V0KCk7XG4gICAgICB0aGlzLnBlbmRpbmdWYXVsdERlbGV0aW9uUGF0aHMgPSBuZXcgTWFwKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY2FuZGlkYXRlID0gbG9hZGVkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIGlmIChcInNldHRpbmdzXCIgaW4gY2FuZGlkYXRlIHx8IFwicXVldWVcIiBpbiBjYW5kaWRhdGUpIHtcbiAgICAgIHRoaXMuc2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MsIC4uLigoY2FuZGlkYXRlLnNldHRpbmdzIGFzIFBhcnRpYWw8U2VjdXJlV2ViZGF2U2V0dGluZ3M+KSA/PyB7fSkgfTtcbiAgICAgIHRoaXMucXVldWUgPSBBcnJheS5pc0FycmF5KGNhbmRpZGF0ZS5xdWV1ZSkgPyAoY2FuZGlkYXRlLnF1ZXVlIGFzIFVwbG9hZFRhc2tbXSkgOiBbXTtcbiAgICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMgPSBuZXcgTWFwKFxuICAgICAgICBPYmplY3QuZW50cmllcygoY2FuZGlkYXRlLm5vdGVBY2Nlc3NUaW1lc3RhbXBzIGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfCB1bmRlZmluZWQpID8/IHt9KSxcbiAgICAgICk7XG4gICAgICB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgPSBuZXcgTWFwKFxuICAgICAgICBPYmplY3QuZW50cmllcygoY2FuZGlkYXRlLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgYXMgUmVjb3JkPHN0cmluZywgTWlzc2luZ0xhenlSZW1vdGVSZWNvcmQ+IHwgdW5kZWZpbmVkKSA/PyB7fSlcbiAgICAgICAgICAuZmlsdGVyKChbLCB2YWx1ZV0pID0+IHtcbiAgICAgICAgICAgIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlY29yZCA9IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdHlwZW9mIHJlY29yZC5maXJzdERldGVjdGVkQXQgPT09IFwibnVtYmVyXCIgJiZcbiAgICAgICAgICAgICAgdHlwZW9mIHJlY29yZC5sYXN0RGV0ZWN0ZWRBdCA9PT0gXCJudW1iZXJcIiAmJlxuICAgICAgICAgICAgICB0eXBlb2YgcmVjb3JkLm1pc3NDb3VudCA9PT0gXCJudW1iZXJcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoKFtwYXRoLCB2YWx1ZV0pID0+IFtwYXRoLCB2YWx1ZSBhcyBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZF0pLFxuICAgICAgKTtcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzID0gbmV3IFNldChcbiAgICAgICAgQXJyYXkuaXNBcnJheShjYW5kaWRhdGUucGVuZGluZ1ZhdWx0U3luY1BhdGhzKVxuICAgICAgICAgID8gY2FuZGlkYXRlLnBlbmRpbmdWYXVsdFN5bmNQYXRocy5maWx0ZXIoKHBhdGgpOiBwYXRoIGlzIHN0cmluZyA9PiB0eXBlb2YgcGF0aCA9PT0gXCJzdHJpbmdcIilcbiAgICAgICAgICA6IFtdLFxuICAgICAgKTtcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0RGVsZXRpb25QYXRocyA9IG5ldyBNYXAoKTtcbiAgICAgIGZvciAoY29uc3QgW3BhdGgsIHJhd0VudHJ5XSBvZiBPYmplY3QuZW50cmllcygoY2FuZGlkYXRlLnBlbmRpbmdWYXVsdERlbGV0aW9uUGF0aHMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpID8/IHt9KSkge1xuICAgICAgICBpZiAoIXJhd0VudHJ5IHx8IHR5cGVvZiByYXdFbnRyeSAhPT0gXCJvYmplY3RcIikge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGVudHJ5ID0gcmF3RW50cnkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0eXBlb2YgZW50cnkucmVtb3RlUGF0aCA9PT0gXCJzdHJpbmdcIiAmJiBlbnRyeS5yZW1vdGVQYXRoLmxlbmd0aCA+IDBcbiAgICAgICAgICA/IGVudHJ5LnJlbW90ZVBhdGhcbiAgICAgICAgICA6IGAke3RoaXMubm9ybWFsaXplRm9sZGVyKHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKX0ke3BhdGh9YDtcbiAgICAgICAgY29uc3QgcmVtb3RlU2lnbmF0dXJlID0gdHlwZW9mIGVudHJ5LnJlbW90ZVNpZ25hdHVyZSA9PT0gXCJzdHJpbmdcIiA/IGVudHJ5LnJlbW90ZVNpZ25hdHVyZSA6IHVuZGVmaW5lZDtcbiAgICAgICAgdGhpcy5wZW5kaW5nVmF1bHREZWxldGlvblBhdGhzLnNldChwYXRoLCB7IHJlbW90ZVBhdGgsIHJlbW90ZVNpZ25hdHVyZSB9KTtcbiAgICAgIH1cbiAgICAgIHRoaXMuc3luY0luZGV4ID0gbmV3IE1hcCgpO1xuICAgICAgZm9yIChjb25zdCBbcGF0aCwgcmF3RW50cnldIG9mIE9iamVjdC5lbnRyaWVzKChjYW5kaWRhdGUuc3luY0luZGV4IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKSA/PyB7fSkpIHtcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IHRoaXMubm9ybWFsaXplU3luY0luZGV4RW50cnkocGF0aCwgcmF3RW50cnkpO1xuICAgICAgICBpZiAobm9ybWFsaXplZCkge1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChwYXRoLCBub3JtYWxpemVkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPVxuICAgICAgICB0eXBlb2YgY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNBdCA9PT0gXCJudW1iZXJcIiA/IGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jQXQgOiAwO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID1cbiAgICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jU3RhdHVzID09PSBcInN0cmluZ1wiID8gY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNTdGF0dXMgOiBcIlwiO1xuICAgICAgdGhpcy5zeW5jZWREaXJlY3RvcmllcyA9IG5ldyBTZXQoXG4gICAgICAgIEFycmF5LmlzQXJyYXkoY2FuZGlkYXRlLnN5bmNlZERpcmVjdG9yaWVzKSA/IGNhbmRpZGF0ZS5zeW5jZWREaXJlY3RvcmllcyBhcyBzdHJpbmdbXSA6IFtdLFxuICAgICAgKTtcbiAgICAgIHRoaXMubm9ybWFsaXplRWZmZWN0aXZlU2V0dGluZ3MoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnNldHRpbmdzID0geyAuLi5ERUZBVUxUX1NFVFRJTkdTLCAuLi4oY2FuZGlkYXRlIGFzIFBhcnRpYWw8U2VjdXJlV2ViZGF2U2V0dGluZ3M+KSB9O1xuICAgIHRoaXMucXVldWUgPSBbXTtcbiAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuc3luY0luZGV4ID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuc3luY2VkRGlyZWN0b3JpZXMgPSBuZXcgU2V0KCk7XG4gICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzID0gbmV3IFNldCgpO1xuICAgIHRoaXMucGVuZGluZ1ZhdWx0RGVsZXRpb25QYXRocyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IDA7XG4gICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gXCJcIjtcbiAgICB0aGlzLm5vcm1hbGl6ZUVmZmVjdGl2ZVNldHRpbmdzKCk7XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUVmZmVjdGl2ZVNldHRpbmdzKCkge1xuICAgIC8vIEtlZXAgdGhlIHB1YmxpYyBzZXR0aW5ncyBzdXJmYWNlIGludGVudGlvbmFsbHkgc21hbGwgYW5kIGRldGVybWluaXN0aWMuXG4gICAgdGhpcy5zZXR0aW5ncy5kZWxldGVMb2NhbEFmdGVyVXBsb2FkID0gdHJ1ZTtcbiAgICB0aGlzLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzID0gTWF0aC5tYXgoMCwgTWF0aC5mbG9vcih0aGlzLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzIHx8IDApKTtcbiAgICBjb25zdCByYXdFeGNsdWRlZCA9IHRoaXMuc2V0dGluZ3MuZXhjbHVkZWRTeW5jRm9sZGVycyBhcyB1bmtub3duO1xuICAgIGNvbnN0IGV4Y2x1ZGVkID0gQXJyYXkuaXNBcnJheShyYXdFeGNsdWRlZClcbiAgICAgID8gcmF3RXhjbHVkZWRcbiAgICAgIDogdHlwZW9mIHJhd0V4Y2x1ZGVkID09PSBcInN0cmluZ1wiXG4gICAgICAgID8gcmF3RXhjbHVkZWQuc3BsaXQoL1ssXFxuXS8pXG4gICAgICAgIDogREVGQVVMVF9TRVRUSU5HUy5leGNsdWRlZFN5bmNGb2xkZXJzO1xuICAgIHRoaXMuc2V0dGluZ3MuZXhjbHVkZWRTeW5jRm9sZGVycyA9IFtcbiAgICAgIC4uLm5ldyBTZXQoXG4gICAgICAgIGV4Y2x1ZGVkXG4gICAgICAgICAgLm1hcCgodmFsdWUpID0+IG5vcm1hbGl6ZVBhdGgoU3RyaW5nKHZhbHVlKS50cmltKCkpLnJlcGxhY2UoL15cXC8rLywgXCJcIikucmVwbGFjZSgvXFwvKyQvLCBcIlwiKSlcbiAgICAgICAgICAuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUubGVuZ3RoID4gMCksXG4gICAgICApLFxuICAgIF07XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUZvbGRlcihpbnB1dDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIG5vcm1hbGl6ZUZvbGRlcihpbnB1dCk7XG4gIH1cblxuICBwcml2YXRlIHNldHVwQXV0b1N5bmMoKSB7XG4gICAgY29uc3QgbWludXRlcyA9IHRoaXMuc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXM7XG4gICAgaWYgKG1pbnV0ZXMgPD0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGludGVydmFsTXMgPSBtaW51dGVzICogNjAgKiAxMDAwO1xuICAgIHRoaXMucmVnaXN0ZXJJbnRlcnZhbChcbiAgICAgIHdpbmRvdy5zZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5ydW5BdXRvU3luY1RpY2soKTtcbiAgICAgIH0sIGludGVydmFsTXMpLFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJ1bkF1dG9TeW5jVGljaygpIHtcbiAgICBpZiAodGhpcy5hdXRvU3luY1RpY2tJblByb2dyZXNzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5hdXRvU3luY1RpY2tJblByb2dyZXNzID0gdHJ1ZTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5zeW5jQ29uZmlndXJlZFZhdWx0Q29udGVudChmYWxzZSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMuYXV0b1N5bmNUaWNrSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHNhdmVQbHVnaW5TdGF0ZSgpIHtcbiAgICBhd2FpdCB0aGlzLnNhdmVEYXRhKHtcbiAgICAgIHNldHRpbmdzOiB0aGlzLnNldHRpbmdzLFxuICAgICAgcXVldWU6IHRoaXMucXVldWUsXG4gICAgICBub3RlQWNjZXNzVGltZXN0YW1wczogT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMuZW50cmllcygpKSxcbiAgICAgIG1pc3NpbmdMYXp5UmVtb3RlTm90ZXM6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMuZW50cmllcygpKSxcbiAgICAgIHBlbmRpbmdWYXVsdFN5bmNQYXRoczogWy4uLnRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzXSxcbiAgICAgIHBlbmRpbmdWYXVsdERlbGV0aW9uUGF0aHM6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLnBlbmRpbmdWYXVsdERlbGV0aW9uUGF0aHMuZW50cmllcygpKSxcbiAgICAgIHN5bmNJbmRleDogT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMuc3luY0luZGV4LmVudHJpZXMoKSksXG4gICAgICBzeW5jZWREaXJlY3RvcmllczogWy4uLnRoaXMuc3luY2VkRGlyZWN0b3JpZXNdLFxuICAgICAgbGFzdFZhdWx0U3luY0F0OiB0aGlzLmxhc3RWYXVsdFN5bmNBdCxcbiAgICAgIGxhc3RWYXVsdFN5bmNTdGF0dXM6IHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyxcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcbiAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVTeW5jSW5kZXhFbnRyeSh2YXVsdFBhdGg6IHN0cmluZywgcmF3RW50cnk6IHVua25vd24pOiBTeW5jSW5kZXhFbnRyeSB8IG51bGwge1xuICAgIGlmICghcmF3RW50cnkgfHwgdHlwZW9mIHJhd0VudHJ5ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBjYW5kaWRhdGUgPSByYXdFbnRyeSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICBjb25zdCByZW1vdGVQYXRoID1cbiAgICAgIHR5cGVvZiBjYW5kaWRhdGUucmVtb3RlUGF0aCA9PT0gXCJzdHJpbmdcIiAmJiBjYW5kaWRhdGUucmVtb3RlUGF0aC5sZW5ndGggPiAwXG4gICAgICAgID8gY2FuZGlkYXRlLnJlbW90ZVBhdGhcbiAgICAgICAgOiB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aCh2YXVsdFBhdGgpO1xuICAgIGNvbnN0IGxvY2FsU2lnbmF0dXJlID1cbiAgICAgIHR5cGVvZiBjYW5kaWRhdGUubG9jYWxTaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgPyBjYW5kaWRhdGUubG9jYWxTaWduYXR1cmVcbiAgICAgICAgOiB0eXBlb2YgY2FuZGlkYXRlLnNpZ25hdHVyZSA9PT0gXCJzdHJpbmdcIlxuICAgICAgICAgID8gY2FuZGlkYXRlLnNpZ25hdHVyZVxuICAgICAgICAgIDogXCJcIjtcbiAgICBjb25zdCByZW1vdGVTaWduYXR1cmUgPVxuICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5yZW1vdGVTaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgPyBjYW5kaWRhdGUucmVtb3RlU2lnbmF0dXJlXG4gICAgICAgIDogdHlwZW9mIGNhbmRpZGF0ZS5zaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgICA/IGNhbmRpZGF0ZS5zaWduYXR1cmVcbiAgICAgICAgICA6IFwiXCI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICByZW1vdGVQYXRoLFxuICAgIH07XG4gIH1cblxuICB0KHpoOiBzdHJpbmcsIGVuOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRMYW5ndWFnZSgpID09PSBcInpoXCIgPyB6aCA6IGVuO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRMYW5ndWFnZSgpIHtcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5sYW5ndWFnZSA9PT0gXCJhdXRvXCIpIHtcbiAgICAgIGNvbnN0IGxvY2FsZSA9IHR5cGVvZiBuYXZpZ2F0b3IgIT09IFwidW5kZWZpbmVkXCIgPyBuYXZpZ2F0b3IubGFuZ3VhZ2UudG9Mb3dlckNhc2UoKSA6IFwiZW5cIjtcbiAgICAgIHJldHVybiBsb2NhbGUuc3RhcnRzV2l0aChcInpoXCIpID8gXCJ6aFwiIDogXCJlblwiO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNldHRpbmdzLmxhbmd1YWdlO1xuICB9XG5cbiAgZm9ybWF0TGFzdFN5bmNMYWJlbCgpIHtcbiAgICBpZiAoIXRoaXMubGFzdFZhdWx0U3luY0F0KSB7XG4gICAgICByZXR1cm4gdGhpcy50KFwiXHU0RTBBXHU2QjIxXHU1NDBDXHU2QjY1XHVGRjFBXHU1QzFBXHU2NzJBXHU2MjY3XHU4ODRDXCIsIFwiTGFzdCBzeW5jOiBub3QgcnVuIHlldFwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy50KFxuICAgICAgYFx1NEUwQVx1NkIyMVx1NTQwQ1x1NkI2NVx1RkYxQSR7bmV3IERhdGUodGhpcy5sYXN0VmF1bHRTeW5jQXQpLnRvTG9jYWxlU3RyaW5nKCl9YCxcbiAgICAgIGBMYXN0IHN5bmM6ICR7bmV3IERhdGUodGhpcy5sYXN0VmF1bHRTeW5jQXQpLnRvTG9jYWxlU3RyaW5nKCl9YCxcbiAgICApO1xuICB9XG5cbiAgZm9ybWF0U3luY1N0YXR1c0xhYmVsKCkge1xuICAgIHJldHVybiB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXNcbiAgICAgID8gdGhpcy50KGBcdTY3MDBcdThGRDFcdTcyQjZcdTYwMDFcdUZGMUEke3RoaXMubGFzdFZhdWx0U3luY1N0YXR1c31gLCBgUmVjZW50IHN0YXR1czogJHt0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXN9YClcbiAgICAgIDogdGhpcy50KFwiXHU2NzAwXHU4RkQxXHU3MkI2XHU2MDAxXHVGRjFBXHU2NjgyXHU2NUUwXCIsIFwiUmVjZW50IHN0YXR1czogbm9uZVwiKTtcbiAgfVxuXG4gIGFzeW5jIHJ1bk1hbnVhbFN5bmMoKSB7XG4gICAgYXdhaXQgdGhpcy5zeW5jUGVuZGluZ1ZhdWx0Q29udGVudCh0cnVlKTtcbiAgfVxuXG4gIGFzeW5jIHJ1bkZ1bGxSZWNvbmNpbGVTeW5jKCkge1xuICAgIGF3YWl0IHRoaXMuc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQodHJ1ZSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlYnVpbGRSZWZlcmVuY2VJbmRleCgpIHtcbiAgICBjb25zdCBuZXh0ID0gbmV3IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PigpO1xuICAgIGZvciAoY29uc3QgZmlsZSBvZiB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkpIHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgbmV4dC5zZXQoZmlsZS5wYXRoLCB0aGlzLmV4dHJhY3RSZW1vdGVQYXRoc0Zyb21UZXh0KGNvbnRlbnQpKTtcbiAgICB9XG4gICAgdGhpcy5ub3RlUmVtb3RlUmVmcyA9IG5leHQ7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZVZhdWx0TW9kaWZ5KGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5tYXJrUGVuZGluZ1ZhdWx0U3luYyhmaWxlLnBhdGgpO1xuXG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgY29uc3QgbmV4dFJlZnMgPSB0aGlzLmV4dHJhY3RSZW1vdGVQYXRoc0Zyb21UZXh0KGNvbnRlbnQpO1xuICAgICAgY29uc3QgcHJldmlvdXNSZWZzID0gdGhpcy5ub3RlUmVtb3RlUmVmcy5nZXQoZmlsZS5wYXRoKSA/PyBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICAgIHRoaXMubm90ZVJlbW90ZVJlZnMuc2V0KGZpbGUucGF0aCwgbmV4dFJlZnMpO1xuXG4gICAgICBjb25zdCBhZGRlZCA9IFsuLi5uZXh0UmVmc10uZmlsdGVyKCh2YWx1ZSkgPT4gIXByZXZpb3VzUmVmcy5oYXModmFsdWUpKTtcbiAgICAgIGNvbnN0IHJlbW92ZWQgPSBbLi4ucHJldmlvdXNSZWZzXS5maWx0ZXIoKHZhbHVlKSA9PiAhbmV4dFJlZnMuaGFzKHZhbHVlKSk7XG4gICAgICBpZiAoYWRkZWQubGVuZ3RoID4gMCkge1xuICAgICAgICB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyhmaWxlLnBhdGgsIFwiaW1hZ2UtYWRkXCIpO1xuICAgICAgfVxuICAgICAgaWYgKHJlbW92ZWQubGVuZ3RoID4gMCkge1xuICAgICAgICB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyhmaWxlLnBhdGgsIFwiaW1hZ2UtcmVtb3ZlXCIpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZVZhdWx0RGVsZXRlKGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgoZmlsZS5wYXRoKSkge1xuICAgICAgdGhpcy5tYXJrUGVuZGluZ1ZhdWx0RGVsZXRpb24oZmlsZS5wYXRoKTtcbiAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICB9XG5cbiAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgdGhpcy5ub3RlUmVtb3RlUmVmcy5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZVZhdWx0UmVuYW1lKGZpbGU6IFRBYnN0cmFjdEZpbGUsIG9sZFBhdGg6IHN0cmluZykge1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuc3luY1N1cHBvcnQuc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChvbGRQYXRoKSkge1xuICAgICAgdGhpcy5tYXJrUGVuZGluZ1ZhdWx0RGVsZXRpb24ob2xkUGF0aCk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUob2xkUGF0aCk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKGZpbGUucGF0aCkpIHtcbiAgICAgIHRoaXMubWFya1BlbmRpbmdWYXVsdFN5bmMoZmlsZS5wYXRoKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgfVxuXG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIGNvbnN0IHJlZnMgPSB0aGlzLm5vdGVSZW1vdGVSZWZzLmdldChvbGRQYXRoKTtcbiAgICAgIGlmIChyZWZzKSB7XG4gICAgICAgIHRoaXMubm90ZVJlbW90ZVJlZnMuZGVsZXRlKG9sZFBhdGgpO1xuICAgICAgICB0aGlzLm5vdGVSZW1vdGVSZWZzLnNldChmaWxlLnBhdGgsIHJlZnMpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXRoaXMuc3luY1N1cHBvcnQuc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChmaWxlLnBhdGgpKSB7XG4gICAgICAgIHRoaXMuc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jKGZpbGUucGF0aCwgXCJpbWFnZS1hZGRcIik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBtYXJrUGVuZGluZ1ZhdWx0U3luYyhwYXRoOiBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKHBhdGgpKSB7XG4gICAgICB0aGlzLnBlbmRpbmdWYXVsdFN5bmNQYXRocy5kZWxldGUocGF0aCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5wZW5kaW5nVmF1bHREZWxldGlvblBhdGhzLmRlbGV0ZShwYXRoKTtcbiAgICB0aGlzLnBlbmRpbmdWYXVsdFN5bmNQYXRocy5hZGQocGF0aCk7XG4gIH1cblxuICBwcml2YXRlIG1hcmtQZW5kaW5nVmF1bHREZWxldGlvbihwYXRoOiBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKHBhdGgpKSB7XG4gICAgICB0aGlzLnBlbmRpbmdWYXVsdFN5bmNQYXRocy5kZWxldGUocGF0aCk7XG4gICAgICB0aGlzLnBlbmRpbmdWYXVsdERlbGV0aW9uUGF0aHMuZGVsZXRlKHBhdGgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5zeW5jSW5kZXguZ2V0KHBhdGgpO1xuICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzLmRlbGV0ZShwYXRoKTtcbiAgICB0aGlzLnBlbmRpbmdWYXVsdERlbGV0aW9uUGF0aHMuc2V0KHBhdGgsIHtcbiAgICAgIHJlbW90ZVBhdGg6IGV4aXN0aW5nPy5yZW1vdGVQYXRoID8/IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKHBhdGgpLFxuICAgICAgcmVtb3RlU2lnbmF0dXJlOiBleGlzdGluZz8ucmVtb3RlU2lnbmF0dXJlLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRyYWN0UmVtb3RlUGF0aHNGcm9tVGV4dChjb250ZW50OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZWZzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3Qgc3BhblJlZ2V4ID0gL2RhdGEtc2VjdXJlLXdlYmRhdj1cIihbXlwiXSspXCIvZztcbiAgICBjb25zdCBwcm90b2NvbFJlZ2V4ID0gL3dlYmRhdi1zZWN1cmU6XFwvXFwvKFteXFxzKVwiXSspL2c7XG4gICAgY29uc3QgY29kZUJsb2NrUmVnZXggPSAvYGBgc2VjdXJlLXdlYmRhdlxccysoW1xcc1xcU10qPylgYGAvZztcbiAgICBsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cbiAgICB3aGlsZSAoKG1hdGNoID0gc3BhblJlZ2V4LmV4ZWMoY29udGVudCkpICE9PSBudWxsKSB7XG4gICAgICByZWZzLmFkZCh0aGlzLnVuZXNjYXBlSHRtbChtYXRjaFsxXSkpO1xuICAgIH1cblxuICAgIHdoaWxlICgobWF0Y2ggPSBwcm90b2NvbFJlZ2V4LmV4ZWMoY29udGVudCkpICE9PSBudWxsKSB7XG4gICAgICByZWZzLmFkZCh0aGlzLnVuZXNjYXBlSHRtbChtYXRjaFsxXSkpO1xuICAgIH1cblxuICAgIHdoaWxlICgobWF0Y2ggPSBjb2RlQmxvY2tSZWdleC5leGVjKGNvbnRlbnQpKSAhPT0gbnVsbCkge1xuICAgICAgY29uc3QgcGFyc2VkID0gdGhpcy5pbWFnZVN1cHBvcnQucGFyc2VTZWN1cmVJbWFnZUJsb2NrKG1hdGNoWzFdKTtcbiAgICAgIGlmIChwYXJzZWQ/LnBhdGgpIHtcbiAgICAgICAgcmVmcy5hZGQocGFyc2VkLnBhdGgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZWZzO1xuICB9XG5cbiAgcHJpdmF0ZSBzY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZVBhdGg6IHN0cmluZywgcmVhc29uOiBcImltYWdlLWFkZFwiIHwgXCJpbWFnZS1yZW1vdmVcIikge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5wcmlvcml0eU5vdGVTeW5jVGltZW91dHMuZ2V0KG5vdGVQYXRoKTtcbiAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQoZXhpc3RpbmcpO1xuICAgIH1cblxuICAgIGNvbnN0IGRlbGF5TXMgPSByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCIgPyAxMjAwIDogNjAwO1xuICAgIGNvbnN0IHRpbWVvdXRJZCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLmRlbGV0ZShub3RlUGF0aCk7XG4gICAgICB2b2lkIHRoaXMuZmx1c2hQcmlvcml0eU5vdGVTeW5jKG5vdGVQYXRoLCByZWFzb24pO1xuICAgIH0sIGRlbGF5TXMpO1xuICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLnNldChub3RlUGF0aCwgdGltZW91dElkKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZmx1c2hQcmlvcml0eU5vdGVTeW5jKG5vdGVQYXRoOiBzdHJpbmcsIHJlYXNvbjogXCJpbWFnZS1hZGRcIiB8IFwiaW1hZ2UtcmVtb3ZlXCIpIHtcbiAgICBpZiAodGhpcy5wcmlvcml0eU5vdGVTeW5jc0luRmxpZ2h0Lmhhcyhub3RlUGF0aCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICB0aGlzLnVwbG9hZFF1ZXVlLmhhc1BlbmRpbmdXb3JrRm9yTm90ZShub3RlUGF0aCkgfHxcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlcy5zaXplID4gMCB8fFxuICAgICAgdGhpcy5zeW5jSW5Qcm9ncmVzcyB8fFxuICAgICAgdGhpcy5hdXRvU3luY1RpY2tJblByb2dyZXNzXG4gICAgKSB7XG4gICAgICB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyhub3RlUGF0aCwgcmVhc29uKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBmaWxlID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgobm90ZVBhdGgpO1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkgfHwgZmlsZS5leHRlbnNpb24gIT09IFwibWRcIiB8fCB0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgoZmlsZS5wYXRoKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY3NJbkZsaWdodC5hZGQobm90ZVBhdGgpO1xuICAgIHRyeSB7XG4gICAgICB0aGlzLmVuc3VyZUNvbmZpZ3VyZWQoKTtcblxuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMucmVhZE1hcmtkb3duQ29udGVudFByZWZlckVkaXRvcihmaWxlKTtcbiAgICAgIGlmICh0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5zeW5jU3VwcG9ydC5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgIGNvbnN0IHVwbG9hZGVkUmVtb3RlID0gYXdhaXQgdGhpcy51cGxvYWRDb250ZW50RmlsZVRvUmVtb3RlKGZpbGUsIHJlbW90ZVBhdGgsIGNvbnRlbnQpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICBsb2NhbFNpZ25hdHVyZTogYXdhaXQgdGhpcy5idWlsZEN1cnJlbnRMb2NhbFNpZ25hdHVyZShmaWxlLCBjb250ZW50KSxcbiAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiB1cGxvYWRlZFJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICB9KTtcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzLmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy50KFxuICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCJcbiAgICAgICAgICA/IGBcdTVERjJcdTRGMThcdTUxNDhcdTU0MENcdTZCNjVcdTU2RkVcdTcyNDdcdTY1QjBcdTU4OUVcdTU0MEVcdTc2ODRcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YFxuICAgICAgICAgIDogYFx1NURGMlx1NEYxOFx1NTE0OFx1NTQwQ1x1NkI2NVx1NTZGRVx1NzI0N1x1NTIyMFx1OTY2NFx1NTQwRVx1NzY4NFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCJcbiAgICAgICAgICA/IGBQcmlvcml0aXplZCBub3RlIHN5bmMgZmluaXNoZWQgYWZ0ZXIgaW1hZ2UgYWRkOiAke2ZpbGUuYmFzZW5hbWV9YFxuICAgICAgICAgIDogYFByaW9yaXRpemVkIG5vdGUgc3luYyBmaW5pc2hlZCBhZnRlciBpbWFnZSByZW1vdmFsOiAke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiUHJpb3JpdHkgbm90ZSBzeW5jIGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLmRlc2NyaWJlRXJyb3IoXG4gICAgICAgIHRoaXMudChcbiAgICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCIgPyBcIlx1NTZGRVx1NzI0N1x1NjVCMFx1NTg5RVx1NTQwRVx1NzY4NFx1N0IxNFx1OEJCMFx1NEYxOFx1NTE0OFx1NTQwQ1x1NkI2NVx1NTkzMVx1OEQyNVwiIDogXCJcdTU2RkVcdTcyNDdcdTUyMjBcdTk2NjRcdTU0MEVcdTc2ODRcdTdCMTRcdThCQjBcdTRGMThcdTUxNDhcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIixcbiAgICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCIgPyBcIlByaW9yaXR5IG5vdGUgc3luYyBhZnRlciBpbWFnZSBhZGQgZmFpbGVkXCIgOiBcIlByaW9yaXR5IG5vdGUgc3luYyBhZnRlciBpbWFnZSByZW1vdmFsIGZhaWxlZFwiLFxuICAgICAgICApLFxuICAgICAgICBlcnJvcixcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZVBhdGgsIHJlYXNvbik7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY3NJbkZsaWdodC5kZWxldGUobm90ZVBhdGgpO1xuICAgIH1cbiAgfVxuXG5cbiAgcHJpdmF0ZSBhc3luYyBidWlsZFVwbG9hZFJlcGxhY2VtZW50cyhjb250ZW50OiBzdHJpbmcsIG5vdGVGaWxlOiBURmlsZSwgdXBsb2FkQ2FjaGU/OiBNYXA8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgY29uc3Qgc2VlbiA9IG5ldyBNYXA8c3RyaW5nLCBVcGxvYWRSZXdyaXRlPigpO1xuICAgIGNvbnN0IHdpa2lNYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtcXFsoW15cXF1dKylcXF1cXF0vZyldO1xuICAgIGNvbnN0IG1hcmtkb3duTWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKC8hXFxbW15cXF1dKl1cXCgoW14pXSspXFwpL2cpXTtcbiAgICBjb25zdCBodG1sSW1hZ2VNYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLzxpbWdcXGJbXj5dKnNyYz1bXCInXShbXlwiJ10rKVtcIiddW14+XSo+L2dpKV07XG5cbiAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIHdpa2lNYXRjaGVzKSB7XG4gICAgICBjb25zdCByYXdMaW5rID0gbWF0Y2hbMV0uc3BsaXQoXCJ8XCIpWzBdLnRyaW0oKTtcbiAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGVGaWxlLnBhdGgpO1xuICAgICAgaWYgKCFmaWxlIHx8ICF0aGlzLmlzSW1hZ2VGaWxlKGZpbGUpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFZhdWx0RmlsZShmaWxlLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgICAgb3JpZ2luYWw6IG1hdGNoWzBdLFxuICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGZpbGUuYmFzZW5hbWUpLFxuICAgICAgICAgIHNvdXJjZUZpbGU6IGZpbGUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWFya2Rvd25NYXRjaGVzKSB7XG4gICAgICBjb25zdCByYXdMaW5rID0gZGVjb2RlVVJJQ29tcG9uZW50KG1hdGNoWzFdLnRyaW0oKS5yZXBsYWNlKC9ePHw+JC9nLCBcIlwiKSk7XG4gICAgICBpZiAoL14od2ViZGF2LXNlY3VyZTp8ZGF0YTopL2kudGVzdChyYXdMaW5rKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuaXNIdHRwVXJsKHJhd0xpbmspKSB7XG4gICAgICAgIGlmICghc2Vlbi5oYXMobWF0Y2hbMF0pKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlbW90ZVVybCA9IGF3YWl0IHRoaXMudXBsb2FkUmVtb3RlSW1hZ2VVcmwocmF3TGluaywgdXBsb2FkQ2FjaGUpO1xuICAgICAgICAgICAgY29uc3QgYWx0VGV4dCA9IHRoaXMuZXh0cmFjdE1hcmtkb3duQWx0VGV4dChtYXRjaFswXSkgfHwgdGhpcy5nZXREaXNwbGF5TmFtZUZyb21VcmwocmF3TGluayk7XG4gICAgICAgICAgICBzZWVuLnNldChtYXRjaFswXSwge1xuICAgICAgICAgICAgICBvcmlnaW5hbDogbWF0Y2hbMF0sXG4gICAgICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGFsdFRleHQpLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFtzZWN1cmUtd2ViZGF2LWltYWdlc10gXHU4REYzXHU4RkM3XHU1OTMxXHU4RDI1XHU3Njg0XHU4RkRDXHU3QTBCXHU1NkZFXHU3MjQ3ICR7cmF3TGlua31gLCBlPy5tZXNzYWdlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGVGaWxlLnBhdGgpO1xuICAgICAgaWYgKCFmaWxlIHx8ICF0aGlzLmlzSW1hZ2VGaWxlKGZpbGUpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFZhdWx0RmlsZShmaWxlLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgICAgb3JpZ2luYWw6IG1hdGNoWzBdLFxuICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGZpbGUuYmFzZW5hbWUpLFxuICAgICAgICAgIHNvdXJjZUZpbGU6IGZpbGUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgaHRtbEltYWdlTWF0Y2hlcykge1xuICAgICAgY29uc3QgcmF3TGluayA9IHRoaXMudW5lc2NhcGVIdG1sKG1hdGNoWzFdLnRyaW0oKSk7XG4gICAgICBpZiAoIXRoaXMuaXNIdHRwVXJsKHJhd0xpbmspIHx8IHNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRSZW1vdGVJbWFnZVVybChyYXdMaW5rLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIGNvbnN0IGFsdFRleHQgPSB0aGlzLmV4dHJhY3RIdG1sSW1hZ2VBbHRUZXh0KG1hdGNoWzBdKSB8fCB0aGlzLmdldERpc3BsYXlOYW1lRnJvbVVybChyYXdMaW5rKTtcbiAgICAgICAgc2Vlbi5zZXQobWF0Y2hbMF0sIHtcbiAgICAgICAgICBvcmlnaW5hbDogbWF0Y2hbMF0sXG4gICAgICAgICAgcmV3cml0dGVuOiB0aGlzLmltYWdlU3VwcG9ydC5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgYWx0VGV4dCksXG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgW3NlY3VyZS13ZWJkYXYtaW1hZ2VzXSBcdThERjNcdThGQzdcdTU5MzFcdThEMjVcdTc2ODRcdThGRENcdTdBMEJcdTU2RkVcdTcyNDcgJHtyYXdMaW5rfWAsIGU/Lm1lc3NhZ2UpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBbLi4uc2Vlbi52YWx1ZXMoKV07XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RNYXJrZG93bkFsdFRleHQobWFya2Rvd25JbWFnZTogc3RyaW5nKSB7XG4gICAgY29uc3QgbWF0Y2ggPSBtYXJrZG93bkltYWdlLm1hdGNoKC9eIVxcWyhbXlxcXV0qKVxcXS8pO1xuICAgIHJldHVybiBtYXRjaD8uWzFdPy50cmltKCkgPz8gXCJcIjtcbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdEh0bWxJbWFnZUFsdFRleHQoaHRtbEltYWdlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtYXRjaCA9IGh0bWxJbWFnZS5tYXRjaCgvXFxiYWx0PVtcIiddKFteXCInXSopW1wiJ10vaSk7XG4gICAgcmV0dXJuIG1hdGNoID8gdGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0udHJpbSgpKSA6IFwiXCI7XG4gIH1cblxuICBwcml2YXRlIGlzSHR0cFVybCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIC9eaHR0cHM/OlxcL1xcLy9pLnRlc3QodmFsdWUpO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXREaXNwbGF5TmFtZUZyb21VcmwocmF3VXJsOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXJsID0gbmV3IFVSTChyYXdVcmwpO1xuICAgICAgY29uc3QgZmlsZU5hbWUgPSB0aGlzLnNhbml0aXplRmlsZU5hbWUodXJsLnBhdGhuYW1lLnNwbGl0KFwiL1wiKS5wb3AoKSB8fCBcIlwiKTtcbiAgICAgIGlmIChmaWxlTmFtZSkge1xuICAgICAgICByZXR1cm4gZmlsZU5hbWUucmVwbGFjZSgvXFwuW14uXSskLywgXCJcIik7XG4gICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBGYWxsIHRocm91Z2ggdG8gdGhlIGdlbmVyaWMgbGFiZWwgYmVsb3cuXG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMudChcIlx1N0Y1MVx1OTg3NVx1NTZGRVx1NzI0N1wiLCBcIldlYiBpbWFnZVwiKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVzb2x2ZUxpbmtlZEZpbGUobGluazogc3RyaW5nLCBzb3VyY2VQYXRoOiBzdHJpbmcpOiBURmlsZSB8IG51bGwge1xuICAgIGNvbnN0IGNsZWFuZWQgPSBsaW5rLnJlcGxhY2UoLyMuKi8sIFwiXCIpLnRyaW0oKTtcbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpcnN0TGlua3BhdGhEZXN0KGNsZWFuZWQsIHNvdXJjZVBhdGgpO1xuICAgIHJldHVybiB0YXJnZXQgaW5zdGFuY2VvZiBURmlsZSA/IHRhcmdldCA6IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGlzSW1hZ2VGaWxlKGZpbGU6IFRGaWxlKSB7XG4gICAgcmV0dXJuIC9eKHBuZ3xqcGU/Z3xnaWZ8d2VicHxibXB8c3ZnKSQvaS50ZXN0KGZpbGUuZXh0ZW5zaW9uKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkVmF1bHRGaWxlKGZpbGU6IFRGaWxlLCB1cGxvYWRDYWNoZT86IE1hcDxzdHJpbmcsIHN0cmluZz4pIHtcbiAgICBpZiAodXBsb2FkQ2FjaGU/LmhhcyhmaWxlLnBhdGgpKSB7XG4gICAgICByZXR1cm4gdXBsb2FkQ2FjaGUuZ2V0KGZpbGUucGF0aCkhO1xuICAgIH1cblxuICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xuICAgIGNvbnN0IGJpbmFyeSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWRCaW5hcnkoZmlsZSk7XG4gICAgY29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLnByZXBhcmVVcGxvYWRQYXlsb2FkKGJpbmFyeSwgdGhpcy5nZXRNaW1lVHlwZShmaWxlLmV4dGVuc2lvbiksIGZpbGUubmFtZSk7XG4gICAgY29uc3QgcmVtb3RlTmFtZSA9IGF3YWl0IHRoaXMuYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnkocHJlcGFyZWQuZmlsZU5hbWUsIHByZXBhcmVkLmJpbmFyeSk7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRSZW1vdGVQYXRoKHJlbW90ZU5hbWUpO1xuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KHJlbW90ZVBhdGgsIHByZXBhcmVkLmJpbmFyeSwgcHJlcGFyZWQubWltZVR5cGUpO1xuICAgIGNvbnN0IHJlbW90ZVVybCA9IGAke1NFQ1VSRV9QUk9UT0NPTH0vLyR7cmVtb3RlUGF0aH1gO1xuICAgIHVwbG9hZENhY2hlPy5zZXQoZmlsZS5wYXRoLCByZW1vdGVVcmwpO1xuICAgIHJldHVybiByZW1vdGVVcmw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwbG9hZFJlbW90ZUltYWdlVXJsKGltYWdlVXJsOiBzdHJpbmcsIHVwbG9hZENhY2hlPzogTWFwPHN0cmluZywgc3RyaW5nPikge1xuICAgIGNvbnN0IGNhY2hlS2V5ID0gYHJlbW90ZToke2ltYWdlVXJsfWA7XG4gICAgaWYgKHVwbG9hZENhY2hlPy5oYXMoY2FjaGVLZXkpKSB7XG4gICAgICByZXR1cm4gdXBsb2FkQ2FjaGUuZ2V0KGNhY2hlS2V5KSE7XG4gICAgfVxuXG4gICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiBpbWFnZVVybCxcbiAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgIGZvbGxvd1JlZGlyZWN0czogdHJ1ZSxcbiAgICB9KTtcblxuICAgIHRoaXMuYXNzZXJ0UmVzcG9uc2VTdWNjZXNzKHJlc3BvbnNlLCBcIlJlbW90ZSBpbWFnZSBkb3dubG9hZFwiKTtcblxuICAgIGNvbnN0IGNvbnRlbnRUeXBlID0gcmVzcG9uc2UuaGVhZGVyc1tcImNvbnRlbnQtdHlwZVwiXSA/PyBcIlwiO1xuICAgIGlmICghdGhpcy5pc0ltYWdlQ29udGVudFR5cGUoY29udGVudFR5cGUpICYmICF0aGlzLmxvb2tzTGlrZUltYWdlVXJsKGltYWdlVXJsKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1OEZEQ1x1N0EwQlx1OTRGRVx1NjNBNVx1NEUwRFx1NjYyRlx1NTNFRlx1OEJDNlx1NTIyQlx1NzY4NFx1NTZGRVx1NzI0N1x1OEQ0NFx1NkU5MFx1MzAwMlwiLCBcIlRoZSByZW1vdGUgVVJMIGRvZXMgbm90IGxvb2sgbGlrZSBhbiBpbWFnZSByZXNvdXJjZS5cIikpO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbGVOYW1lID0gdGhpcy5idWlsZFJlbW90ZVNvdXJjZUZpbGVOYW1lKGltYWdlVXJsLCBjb250ZW50VHlwZSk7XG4gICAgY29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLnByZXBhcmVVcGxvYWRQYXlsb2FkKFxuICAgICAgcmVzcG9uc2UuYXJyYXlCdWZmZXIsXG4gICAgICB0aGlzLm5vcm1hbGl6ZUltYWdlTWltZVR5cGUoY29udGVudFR5cGUsIGZpbGVOYW1lKSxcbiAgICAgIGZpbGVOYW1lLFxuICAgICk7XG4gICAgY29uc3QgcmVtb3RlTmFtZSA9IGF3YWl0IHRoaXMuYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnkocHJlcGFyZWQuZmlsZU5hbWUsIHByZXBhcmVkLmJpbmFyeSk7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRSZW1vdGVQYXRoKHJlbW90ZU5hbWUpO1xuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KHJlbW90ZVBhdGgsIHByZXBhcmVkLmJpbmFyeSwgcHJlcGFyZWQubWltZVR5cGUpO1xuICAgIGNvbnN0IHJlbW90ZVVybCA9IGAke1NFQ1VSRV9QUk9UT0NPTH0vLyR7cmVtb3RlUGF0aH1gO1xuICAgIHVwbG9hZENhY2hlPy5zZXQoY2FjaGVLZXksIHJlbW90ZVVybCk7XG4gICAgcmV0dXJuIHJlbW90ZVVybDtcbiAgfVxuXG4gIHByaXZhdGUgaXNJbWFnZUNvbnRlbnRUeXBlKGNvbnRlbnRUeXBlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gL15pbWFnZVxcLy9pLnRlc3QoY29udGVudFR5cGUudHJpbSgpKTtcbiAgfVxuXG4gIHByaXZhdGUgbG9va3NMaWtlSW1hZ2VVcmwocmF3VXJsOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXJsID0gbmV3IFVSTChyYXdVcmwpO1xuICAgICAgcmV0dXJuIC9cXC4ocG5nfGpwZT9nfGdpZnx3ZWJwfGJtcHxzdmcpJC9pLnRlc3QodXJsLnBhdGhuYW1lKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkUmVtb3RlU291cmNlRmlsZU5hbWUocmF3VXJsOiBzdHJpbmcsIGNvbnRlbnRUeXBlOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXJsID0gbmV3IFVSTChyYXdVcmwpO1xuICAgICAgY29uc3QgY2FuZGlkYXRlID0gdGhpcy5zYW5pdGl6ZUZpbGVOYW1lKHVybC5wYXRobmFtZS5zcGxpdChcIi9cIikucG9wKCkgfHwgXCJcIik7XG4gICAgICBpZiAoY2FuZGlkYXRlICYmIC9cXC5bYS16MC05XSskL2kudGVzdChjYW5kaWRhdGUpKSB7XG4gICAgICAgIHJldHVybiBjYW5kaWRhdGU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbU1pbWVUeXBlKGNvbnRlbnRUeXBlKSB8fCBcInBuZ1wiO1xuICAgICAgcmV0dXJuIGNhbmRpZGF0ZSA/IGAke2NhbmRpZGF0ZX0uJHtleHRlbnNpb259YCA6IGByZW1vdGUtaW1hZ2UuJHtleHRlbnNpb259YDtcbiAgICB9IGNhdGNoIHtcbiAgICAgIGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbU1pbWVUeXBlKGNvbnRlbnRUeXBlKSB8fCBcInBuZ1wiO1xuICAgICAgcmV0dXJuIGByZW1vdGUtaW1hZ2UuJHtleHRlbnNpb259YDtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHNhbml0aXplRmlsZU5hbWUoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBmaWxlTmFtZS5yZXBsYWNlKC9bXFxcXC86Kj9cIjw+fF0rL2csIFwiLVwiKS50cmltKCk7XG4gIH1cblxuICBwcml2YXRlIGdldEV4dGVuc2lvbkZyb21NaW1lVHlwZShjb250ZW50VHlwZTogc3RyaW5nKSB7XG4gICAgY29uc3QgbWltZVR5cGUgPSBjb250ZW50VHlwZS5zcGxpdChcIjtcIilbMF0udHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgcmV0dXJuIE1JTUVfTUFQW21pbWVUeXBlXSA/PyBcIlwiO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVJbWFnZU1pbWVUeXBlKGNvbnRlbnRUeXBlOiBzdHJpbmcsIGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtaW1lVHlwZSA9IGNvbnRlbnRUeXBlLnNwbGl0KFwiO1wiKVswXS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAobWltZVR5cGUgJiYgbWltZVR5cGUgIT09IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCIpIHtcbiAgICAgIHJldHVybiBtaW1lVHlwZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5nZXRNaW1lVHlwZUZyb21GaWxlTmFtZShmaWxlTmFtZSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwbG9hZEJpbmFyeShyZW1vdGVQYXRoOiBzdHJpbmcsIGJpbmFyeTogQXJyYXlCdWZmZXIsIG1pbWVUeXBlOiBzdHJpbmcpIHtcbiAgICBhd2FpdCB0aGlzLmVuc3VyZVJlbW90ZURpcmVjdG9yaWVzKHJlbW90ZVBhdGgpO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJQVVRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgXCJDb250ZW50LVR5cGVcIjogbWltZVR5cGUsXG4gICAgICB9LFxuICAgICAgYm9keTogYmluYXJ5LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2UsIFwiVXBsb2FkXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVFZGl0b3JQYXN0ZShldnQ6IENsaXBib2FyZEV2ZW50LCBlZGl0b3I6IEVkaXRvciwgaW5mbzogTWFya2Rvd25WaWV3IHwgTWFya2Rvd25GaWxlSW5mbykge1xuICAgIGlmIChldnQuZGVmYXVsdFByZXZlbnRlZCB8fCAhaW5mby5maWxlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaW1hZ2VGaWxlID0gdGhpcy5leHRyYWN0SW1hZ2VGaWxlRnJvbUNsaXBib2FyZChldnQpO1xuICAgIGlmIChpbWFnZUZpbGUpIHtcbiAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgY29uc3QgZmlsZU5hbWUgPSBpbWFnZUZpbGUubmFtZSB8fCB0aGlzLmJ1aWxkQ2xpcGJvYXJkRmlsZU5hbWUoaW1hZ2VGaWxlLnR5cGUpO1xuICAgICAgYXdhaXQgdGhpcy51cGxvYWRRdWV1ZS5lbnF1ZXVlRWRpdG9ySW1hZ2VVcGxvYWQoaW5mby5maWxlLCBlZGl0b3IsIGltYWdlRmlsZSwgZmlsZU5hbWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGh0bWwgPSBldnQuY2xpcGJvYXJkRGF0YT8uZ2V0RGF0YShcInRleHQvaHRtbFwiKT8udHJpbSgpID8/IFwiXCI7XG4gICAgaWYgKCFodG1sIHx8ICF0aGlzLmh0bWxDb250YWluc1JlbW90ZUltYWdlcyhodG1sKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGF3YWl0IHRoaXMuaGFuZGxlSHRtbFBhc3RlV2l0aFJlbW90ZUltYWdlcyhpbmZvLmZpbGUsIGVkaXRvciwgaHRtbCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUVkaXRvckRyb3AoZXZ0OiBEcmFnRXZlbnQsIGVkaXRvcjogRWRpdG9yLCBpbmZvOiBNYXJrZG93blZpZXcgfCBNYXJrZG93bkZpbGVJbmZvKSB7XG4gICAgaWYgKGV2dC5kZWZhdWx0UHJldmVudGVkIHx8ICFpbmZvLmZpbGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbWFnZUZpbGUgPSB0aGlzLmV4dHJhY3RJbWFnZUZpbGVGcm9tRHJvcChldnQpO1xuICAgIGlmICghaW1hZ2VGaWxlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3QgZmlsZU5hbWUgPSBpbWFnZUZpbGUubmFtZSB8fCB0aGlzLmJ1aWxkQ2xpcGJvYXJkRmlsZU5hbWUoaW1hZ2VGaWxlLnR5cGUpO1xuICAgIGF3YWl0IHRoaXMudXBsb2FkUXVldWUuZW5xdWV1ZUVkaXRvckltYWdlVXBsb2FkKGluZm8uZmlsZSwgZWRpdG9yLCBpbWFnZUZpbGUsIGZpbGVOYW1lKTtcbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdEltYWdlRmlsZUZyb21DbGlwYm9hcmQoZXZ0OiBDbGlwYm9hcmRFdmVudCkge1xuICAgIGNvbnN0IGRpcmVjdCA9IEFycmF5LmZyb20oZXZ0LmNsaXBib2FyZERhdGE/LmZpbGVzID8/IFtdKS5maW5kKChmaWxlKSA9PiBmaWxlLnR5cGUuc3RhcnRzV2l0aChcImltYWdlL1wiKSk7XG4gICAgaWYgKGRpcmVjdCkge1xuICAgICAgcmV0dXJuIGRpcmVjdDtcbiAgICB9XG5cbiAgICBjb25zdCBpdGVtID0gQXJyYXkuZnJvbShldnQuY2xpcGJvYXJkRGF0YT8uaXRlbXMgPz8gW10pLmZpbmQoKGVudHJ5KSA9PiBlbnRyeS50eXBlLnN0YXJ0c1dpdGgoXCJpbWFnZS9cIikpO1xuICAgIHJldHVybiBpdGVtPy5nZXRBc0ZpbGUoKSA/PyBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBodG1sQ29udGFpbnNSZW1vdGVJbWFnZXMoaHRtbDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIC88aW1nXFxiW14+XSpzcmM9W1wiJ11odHRwcz86XFwvXFwvW15cIiddK1tcIiddW14+XSo+L2kudGVzdChodG1sKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlSHRtbFBhc3RlV2l0aFJlbW90ZUltYWdlcyhub3RlRmlsZTogVEZpbGUsIGVkaXRvcjogRWRpdG9yLCBodG1sOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVuZGVyZWQgPSBhd2FpdCB0aGlzLmNvbnZlcnRIdG1sQ2xpcGJvYXJkVG9TZWN1cmVNYXJrZG93bihodG1sLCBub3RlRmlsZSk7XG4gICAgICBpZiAoIXJlbmRlcmVkLnRyaW0oKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGVkaXRvci5yZXBsYWNlU2VsZWN0aW9uKHJlbmRlcmVkKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1REYyXHU1QzA2XHU3RjUxXHU5ODc1XHU1NkZFXHU2NTg3XHU3Qzk4XHU4RDM0XHU1RTc2XHU2MjkzXHU1M0Q2XHU4RkRDXHU3QTBCXHU1NkZFXHU3MjQ3XHUzMDAyXCIsIFwiUGFzdGVkIHdlYiBjb250ZW50IGFuZCBjYXB0dXJlZCByZW1vdGUgaW1hZ2VzLlwiKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcGFzdGUgSFRNTCBjb250ZW50IHdpdGggcmVtb3RlIGltYWdlc1wiLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKFxuICAgICAgICB0aGlzLmRlc2NyaWJlRXJyb3IoXG4gICAgICAgICAgdGhpcy50KFwiXHU1OTA0XHU3NDA2XHU3RjUxXHU5ODc1XHU1NkZFXHU2NTg3XHU3Qzk4XHU4RDM0XHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIHByb2Nlc3MgcGFzdGVkIHdlYiBjb250ZW50XCIpLFxuICAgICAgICAgIGVycm9yLFxuICAgICAgICApLFxuICAgICAgICA4MDAwLFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNvbnZlcnRIdG1sQ2xpcGJvYXJkVG9TZWN1cmVNYXJrZG93bihodG1sOiBzdHJpbmcsIG5vdGVGaWxlOiBURmlsZSkge1xuICAgIGNvbnN0IHBhcnNlciA9IG5ldyBET01QYXJzZXIoKTtcbiAgICBjb25zdCBkb2N1bWVudCA9IHBhcnNlci5wYXJzZUZyb21TdHJpbmcoaHRtbCwgXCJ0ZXh0L2h0bWxcIik7XG4gICAgY29uc3QgdXBsb2FkQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgIGNvbnN0IHJlbmRlcmVkQmxvY2tzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBub2RlIG9mIEFycmF5LmZyb20oZG9jdW1lbnQuYm9keS5jaGlsZE5vZGVzKSkge1xuICAgICAgY29uc3QgYmxvY2sgPSBhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxOb2RlKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgMCk7XG4gICAgICBpZiAoYmxvY2sudHJpbSgpKSB7XG4gICAgICAgIHJlbmRlcmVkQmxvY2tzLnB1c2goYmxvY2sudHJpbSgpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVuZGVyZWRCbG9ja3Muam9pbihcIlxcblxcblwiKSArIFwiXFxuXCI7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlbmRlclBhc3RlZEh0bWxOb2RlKFxuICAgIG5vZGU6IE5vZGUsXG4gICAgbm90ZUZpbGU6IFRGaWxlLFxuICAgIHVwbG9hZENhY2hlOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuICAgIGxpc3REZXB0aDogbnVtYmVyLFxuICApOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSkge1xuICAgICAgcmV0dXJuIHRoaXMubm9ybWFsaXplQ2xpcGJvYXJkVGV4dChub2RlLnRleHRDb250ZW50ID8/IFwiXCIpO1xuICAgIH1cblxuICAgIGlmICghKG5vZGUgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkpIHtcbiAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cblxuICAgIGNvbnN0IHRhZyA9IG5vZGUudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmICh0YWcgPT09IFwiaW1nXCIpIHtcbiAgICAgIGNvbnN0IHNyYyA9IHRoaXMudW5lc2NhcGVIdG1sKG5vZGUuZ2V0QXR0cmlidXRlKFwic3JjXCIpPy50cmltKCkgPz8gXCJcIik7XG4gICAgICBpZiAoIXRoaXMuaXNIdHRwVXJsKHNyYykpIHtcbiAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFsdCA9IChub2RlLmdldEF0dHJpYnV0ZShcImFsdFwiKSA/PyBcIlwiKS50cmltKCkgfHwgdGhpcy5nZXREaXNwbGF5TmFtZUZyb21Vcmwoc3JjKTtcbiAgICAgIGNvbnN0IHJlbW90ZVVybCA9IGF3YWl0IHRoaXMudXBsb2FkUmVtb3RlSW1hZ2VVcmwoc3JjLCB1cGxvYWRDYWNoZSk7XG4gICAgICByZXR1cm4gdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGFsdCk7XG4gICAgfVxuXG4gICAgaWYgKHRhZyA9PT0gXCJiclwiKSB7XG4gICAgICByZXR1cm4gXCJcXG5cIjtcbiAgICB9XG5cbiAgICBpZiAodGFnID09PSBcInVsXCIgfHwgdGFnID09PSBcIm9sXCIpIHtcbiAgICAgIGNvbnN0IGl0ZW1zOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgbGV0IGluZGV4ID0gMTtcbiAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgQXJyYXkuZnJvbShub2RlLmNoaWxkcmVuKSkge1xuICAgICAgICBpZiAoY2hpbGQudGFnTmFtZS50b0xvd2VyQ2FzZSgpICE9PSBcImxpXCIpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJlbmRlcmVkID0gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbE5vZGUoY2hpbGQsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoICsgMSkpLnRyaW0oKTtcbiAgICAgICAgaWYgKCFyZW5kZXJlZCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcHJlZml4ID0gdGFnID09PSBcIm9sXCIgPyBgJHtpbmRleH0uIGAgOiBcIi0gXCI7XG4gICAgICAgIGl0ZW1zLnB1c2goYCR7XCIgIFwiLnJlcGVhdChNYXRoLm1heCgwLCBsaXN0RGVwdGgpKX0ke3ByZWZpeH0ke3JlbmRlcmVkfWApO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gaXRlbXMuam9pbihcIlxcblwiKTtcbiAgICB9XG5cbiAgICBpZiAodGFnID09PSBcImxpXCIpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpO1xuICAgICAgcmV0dXJuIHBhcnRzLmpvaW4oXCJcIikudHJpbSgpO1xuICAgIH1cblxuICAgIGlmICgvXmhbMS02XSQvLnRlc3QodGFnKSkge1xuICAgICAgY29uc3QgbGV2ZWwgPSBOdW1iZXIucGFyc2VJbnQodGFnWzFdLCAxMCk7XG4gICAgICBjb25zdCB0ZXh0ID0gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKSkuam9pbihcIlwiKS50cmltKCk7XG4gICAgICByZXR1cm4gdGV4dCA/IGAke1wiI1wiLnJlcGVhdChsZXZlbCl9ICR7dGV4dH1gIDogXCJcIjtcbiAgICB9XG5cbiAgICBpZiAodGFnID09PSBcImFcIikge1xuICAgICAgY29uc3QgaHJlZiA9IG5vZGUuZ2V0QXR0cmlidXRlKFwiaHJlZlwiKT8udHJpbSgpID8/IFwiXCI7XG4gICAgICBjb25zdCB0ZXh0ID0gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKSkuam9pbihcIlwiKS50cmltKCk7XG4gICAgICBpZiAoaHJlZiAmJiAvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KGhyZWYpICYmIHRleHQpIHtcbiAgICAgICAgcmV0dXJuIGBbJHt0ZXh0fV0oJHtocmVmfSlgO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRleHQ7XG4gICAgfVxuXG4gICAgY29uc3QgaW5saW5lVGFncyA9IG5ldyBTZXQoW1wic3Ryb25nXCIsIFwiYlwiLCBcImVtXCIsIFwiaVwiLCBcInNwYW5cIiwgXCJjb2RlXCIsIFwic21hbGxcIiwgXCJzdXBcIiwgXCJzdWJcIl0pO1xuICAgIGlmIChpbmxpbmVUYWdzLmhhcyh0YWcpKSB7XG4gICAgICByZXR1cm4gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKSkuam9pbihcIlwiKTtcbiAgICB9XG5cbiAgICBjb25zdCBibG9ja1RhZ3MgPSBuZXcgU2V0KFtcbiAgICAgIFwicFwiLFxuICAgICAgXCJkaXZcIixcbiAgICAgIFwiYXJ0aWNsZVwiLFxuICAgICAgXCJzZWN0aW9uXCIsXG4gICAgICBcImZpZ3VyZVwiLFxuICAgICAgXCJmaWdjYXB0aW9uXCIsXG4gICAgICBcImJsb2NrcXVvdGVcIixcbiAgICAgIFwicHJlXCIsXG4gICAgICBcInRhYmxlXCIsXG4gICAgICBcInRoZWFkXCIsXG4gICAgICBcInRib2R5XCIsXG4gICAgICBcInRyXCIsXG4gICAgICBcInRkXCIsXG4gICAgICBcInRoXCIsXG4gICAgXSk7XG4gICAgaWYgKGJsb2NrVGFncy5oYXModGFnKSkge1xuICAgICAgY29uc3QgdGV4dCA9IChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIikudHJpbSgpO1xuICAgICAgcmV0dXJuIHRleHQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihcbiAgICBlbGVtZW50OiBIVE1MRWxlbWVudCxcbiAgICBub3RlRmlsZTogVEZpbGUsXG4gICAgdXBsb2FkQ2FjaGU6IE1hcDxzdHJpbmcsIHN0cmluZz4sXG4gICAgbGlzdERlcHRoOiBudW1iZXIsXG4gICkge1xuICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgQXJyYXkuZnJvbShlbGVtZW50LmNoaWxkTm9kZXMpKSB7XG4gICAgICBjb25zdCByZW5kZXJlZCA9IGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbE5vZGUoY2hpbGQsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKTtcbiAgICAgIGlmICghcmVuZGVyZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAwICYmICFyZW5kZXJlZC5zdGFydHNXaXRoKFwiXFxuXCIpICYmICFwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXS5lbmRzV2l0aChcIlxcblwiKSkge1xuICAgICAgICBjb25zdCBwcmV2aW91cyA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdO1xuICAgICAgICBjb25zdCBuZWVkc1NwYWNlID0gL1xcUyQvLnRlc3QocHJldmlvdXMpICYmIC9eXFxTLy50ZXN0KHJlbmRlcmVkKTtcbiAgICAgICAgaWYgKG5lZWRzU3BhY2UpIHtcbiAgICAgICAgICBwYXJ0cy5wdXNoKFwiIFwiKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBwYXJ0cy5wdXNoKHJlbmRlcmVkKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcGFydHM7XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUNsaXBib2FyZFRleHQodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9cXHMrL2csIFwiIFwiKTtcbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdEltYWdlRmlsZUZyb21Ecm9wKGV2dDogRHJhZ0V2ZW50KSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20oZXZ0LmRhdGFUcmFuc2Zlcj8uZmlsZXMgPz8gW10pLmZpbmQoKGZpbGUpID0+IGZpbGUudHlwZS5zdGFydHNXaXRoKFwiaW1hZ2UvXCIpKSA/PyBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBlbnF1ZXVlRWRpdG9ySW1hZ2VVcGxvYWQobm90ZUZpbGU6IFRGaWxlLCBlZGl0b3I6IEVkaXRvciwgaW1hZ2VGaWxlOiBGaWxlLCBmaWxlTmFtZTogc3RyaW5nKSB7XG5cbiAgICBhd2FpdCB0aGlzLnVwbG9hZFF1ZXVlLmVucXVldWVFZGl0b3JJbWFnZVVwbG9hZChub3RlRmlsZSwgZWRpdG9yLCBpbWFnZUZpbGUsIGZpbGVOYW1lKTtcbiAgfVxuXG4gIGFzeW5jIHN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50KHNob3dOb3RpY2UgPSB0cnVlKSB7XG4gICAgaWYgKHRoaXMuc3luY0luUHJvZ3Jlc3MpIHtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1NDBDXHU2QjY1XHU2QjYzXHU1NzI4XHU4RkRCXHU4ODRDXHU0RTJEXHUzMDAyXCIsIFwiQSBzeW5jIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MuXCIpLCA0MDAwKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnN5bmNJblByb2dyZXNzID0gdHJ1ZTtcbiAgICB0cnkge1xuICAgICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG4gICAgICBhd2FpdCB0aGlzLndhaXRGb3JQZW5kaW5nVmF1bHRNdXRhdGlvbnMoKTtcbiAgICAgIGNvbnN0IHVwbG9hZHNSZWFkeSA9IGF3YWl0IHRoaXMucHJlcGFyZVBlbmRpbmdVcGxvYWRzRm9yU3luYyhzaG93Tm90aWNlKTtcbiAgICAgIGlmICghdXBsb2Fkc1JlYWR5KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHRoaXMucmVidWlsZFJlZmVyZW5jZUluZGV4KCk7XG5cbiAgICAgIGNvbnN0IHJlbW90ZUludmVudG9yeSA9IGF3YWl0IHRoaXMubGlzdFJlbW90ZVRyZWUodGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpO1xuICAgICAgY29uc3QgZGVsZXRpb25Ub21ic3RvbmVzID0gYXdhaXQgdGhpcy5yZWFkRGVsZXRpb25Ub21ic3RvbmVzKCk7XG4gICAgICBjb25zdCByZW1vdGVGaWxlcyA9IHJlbW90ZUludmVudG9yeS5maWxlcztcbiAgICAgIGNvbnN0IGNvdW50cyA9IHtcbiAgICAgICAgdXBsb2FkZWQ6IDAsIHJlc3RvcmVkRnJvbVJlbW90ZTogMCwgZG93bmxvYWRlZE9yVXBkYXRlZDogMCwgc2tpcHBlZDogMCxcbiAgICAgICAgZGVsZXRlZFJlbW90ZUZpbGVzOiAwLCBkZWxldGVkTG9jYWxGaWxlczogMCwgZGVsZXRlZExvY2FsU3R1YnM6IDAsXG4gICAgICAgIG1pc3NpbmdSZW1vdGVCYWNrZWROb3RlczogMCwgcHVyZ2VkTWlzc2luZ0xhenlOb3RlczogMCxcbiAgICAgICAgZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzOiAwLCBjcmVhdGVkUmVtb3RlRGlyZWN0b3JpZXM6IDAsXG4gICAgICAgIGRlbGV0ZWRMb2NhbERpcmVjdG9yaWVzOiAwLCBjcmVhdGVkTG9jYWxEaXJlY3RvcmllczogMCxcbiAgICAgICAgZXZpY3RlZE5vdGVzOiAwLFxuICAgICAgfTtcblxuICAgICAgYXdhaXQgdGhpcy5yZWNvbmNpbGVPcnBoYW5lZFN5bmNFbnRyaWVzKHJlbW90ZUZpbGVzLCBkZWxldGlvblRvbWJzdG9uZXMsIGNvdW50cyk7XG4gICAgICBhd2FpdCB0aGlzLnJlY29uY2lsZVJlbW90ZU9ubHlGaWxlcyhyZW1vdGVGaWxlcywgZGVsZXRpb25Ub21ic3RvbmVzLCBjb3VudHMpO1xuICAgICAgYXdhaXQgdGhpcy5yZWNvbmNpbGVMb2NhbEZpbGVzKHJlbW90ZUZpbGVzLCBkZWxldGlvblRvbWJzdG9uZXMsIGNvdW50cyk7XG5cbiAgICAgIGNvbnN0IGRpclN0YXRzID0gYXdhaXQgdGhpcy5yZWNvbmNpbGVEaXJlY3RvcmllcyhyZW1vdGVJbnZlbnRvcnkuZGlyZWN0b3JpZXMpO1xuICAgICAgY291bnRzLmRlbGV0ZWRSZW1vdGVEaXJlY3RvcmllcyA9IGRpclN0YXRzLmRlbGV0ZWRSZW1vdGU7XG4gICAgICBjb3VudHMuY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzID0gZGlyU3RhdHMuY3JlYXRlZFJlbW90ZTtcbiAgICAgIGNvdW50cy5kZWxldGVkTG9jYWxEaXJlY3RvcmllcyA9IGRpclN0YXRzLmRlbGV0ZWRMb2NhbDtcbiAgICAgIGNvdW50cy5jcmVhdGVkTG9jYWxEaXJlY3RvcmllcyA9IGRpclN0YXRzLmNyZWF0ZWRMb2NhbDtcbiAgICAgIGF3YWl0IHRoaXMucmVjb25jaWxlUmVtb3RlSW1hZ2VzKCk7XG4gICAgICBjb3VudHMuZXZpY3RlZE5vdGVzID0gYXdhaXQgdGhpcy5ldmljdFN0YWxlU3luY2VkTm90ZXMoZmFsc2UpO1xuICAgICAgdGhpcy5wZW5kaW5nVmF1bHRTeW5jUGF0aHMuY2xlYXIoKTtcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0RGVsZXRpb25QYXRocy5jbGVhcigpO1xuXG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLnQoXG4gICAgICAgIGBcdTVERjJcdTUzQ0NcdTU0MTFcdTU0MENcdTZCNjVcdUZGMUFcdTRFMEFcdTRGMjAgJHtjb3VudHMudXBsb2FkZWR9IFx1NEUyQVx1NjU4N1x1NEVGNlx1RkYwQ1x1NEVDRVx1OEZEQ1x1N0FFRlx1NjJDOVx1NTNENiAke2NvdW50cy5yZXN0b3JlZEZyb21SZW1vdGUgKyBjb3VudHMuZG93bmxvYWRlZE9yVXBkYXRlZH0gXHU0RTJBXHU2NTg3XHU0RUY2XHVGRjBDXHU4REYzXHU4RkM3ICR7Y291bnRzLnNraXBwZWR9IFx1NEUyQVx1NjcyQVx1NTNEOFx1NTMxNlx1NjU4N1x1NEVGNlx1RkYwQ1x1NTIyMFx1OTY2NFx1OEZEQ1x1N0FFRlx1NTE4NVx1NUJCOSAke2NvdW50cy5kZWxldGVkUmVtb3RlRmlsZXN9IFx1NEUyQVx1MzAwMVx1NjcyQ1x1NTczMFx1NTE4NVx1NUJCOSAke2NvdW50cy5kZWxldGVkTG9jYWxGaWxlc30gXHU0RTJBJHtjb3VudHMuZGVsZXRlZExvY2FsU3R1YnMgPiAwID8gYFx1RkYwOFx1NTE3Nlx1NEUyRFx1NTkzMVx1NjU0OFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMCAke2NvdW50cy5kZWxldGVkTG9jYWxTdHVic30gXHU3QkM3XHVGRjA5YCA6IFwiXCJ9XHVGRjBDJHtjb3VudHMuZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzID4gMCB8fCBjb3VudHMuY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzID4gMCA/IGBcdTUyMjBcdTk2NjRcdThGRENcdTdBRUZcdTc2RUVcdTVGNTUgJHtjb3VudHMuZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzfSBcdTRFMkFcdTMwMDFcdTUyMUJcdTVFRkFcdThGRENcdTdBRUZcdTc2RUVcdTVGNTUgJHtjb3VudHMuY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzfSBcdTRFMkFcdTMwMDFgIDogXCJcIn0ke2NvdW50cy5kZWxldGVkTG9jYWxEaXJlY3RvcmllcyA+IDAgfHwgY291bnRzLmNyZWF0ZWRMb2NhbERpcmVjdG9yaWVzID4gMCA/IGBcdTUyMjBcdTk2NjRcdTY3MkNcdTU3MzBcdTc2RUVcdTVGNTUgJHtjb3VudHMuZGVsZXRlZExvY2FsRGlyZWN0b3JpZXN9IFx1NEUyQVx1MzAwMVx1NTIxQlx1NUVGQVx1NjcyQ1x1NTczMFx1NzZFRVx1NUY1NSAke2NvdW50cy5jcmVhdGVkTG9jYWxEaXJlY3Rvcmllc30gXHU0RTJBXHUzMDAxYCA6IFwiXCJ9JHtjb3VudHMuZXZpY3RlZE5vdGVzID4gMCA/IGBcdTU2REVcdTY1MzZcdTY3MkNcdTU3MzBcdTY1RTdcdTdCMTRcdThCQjAgJHtjb3VudHMuZXZpY3RlZE5vdGVzfSBcdTdCQzdcdTMwMDFgIDogXCJcIn0ke2NvdW50cy5taXNzaW5nUmVtb3RlQmFja2VkTm90ZXMgPiAwID8gYFx1NTNEMVx1NzNCMCAke2NvdW50cy5taXNzaW5nUmVtb3RlQmFja2VkTm90ZXN9IFx1N0JDN1x1NjMwOVx1OTcwMFx1N0IxNFx1OEJCMFx1N0YzQVx1NUMxMVx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1MzAwMWAgOiBcIlwifSR7Y291bnRzLnB1cmdlZE1pc3NpbmdMYXp5Tm90ZXMgPiAwID8gYFx1Nzg2RVx1OEJBNFx1NkUwNVx1NzQwNlx1NTkzMVx1NjU0OFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMCAke2NvdW50cy5wdXJnZWRNaXNzaW5nTGF6eU5vdGVzfSBcdTdCQzdcdTMwMDFgIDogXCJcIn1cdTMwMDJgLnJlcGxhY2UoL1x1MzAwMVx1MzAwMi8sIFwiXHUzMDAyXCIpLFxuICAgICAgICBgQmlkaXJlY3Rpb25hbCBzeW5jIHVwbG9hZGVkICR7Y291bnRzLnVwbG9hZGVkfSBmaWxlKHMpLCBwdWxsZWQgJHtjb3VudHMucmVzdG9yZWRGcm9tUmVtb3RlICsgY291bnRzLmRvd25sb2FkZWRPclVwZGF0ZWR9IGZpbGUocykgZnJvbSByZW1vdGUsIHNraXBwZWQgJHtjb3VudHMuc2tpcHBlZH0gdW5jaGFuZ2VkIGZpbGUocyksIGRlbGV0ZWQgJHtjb3VudHMuZGVsZXRlZFJlbW90ZUZpbGVzfSByZW1vdGUgY29udGVudCBmaWxlKHMpIGFuZCAke2NvdW50cy5kZWxldGVkTG9jYWxGaWxlc30gbG9jYWwgZmlsZShzKSR7Y291bnRzLmRlbGV0ZWRMb2NhbFN0dWJzID4gMCA/IGAgKGluY2x1ZGluZyAke2NvdW50cy5kZWxldGVkTG9jYWxTdHVic30gc3RhbGUgc3R1YiBub3RlKHMpKWAgOiBcIlwifSR7Y291bnRzLmRlbGV0ZWRSZW1vdGVEaXJlY3RvcmllcyA+IDAgPyBgLCBkZWxldGVkICR7Y291bnRzLmRlbGV0ZWRSZW1vdGVEaXJlY3Rvcmllc30gcmVtb3RlIGRpcmVjdG9yJHtjb3VudHMuZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzID09PSAxID8gXCJ5XCIgOiBcImllc1wifWAgOiBcIlwifSR7Y291bnRzLmNyZWF0ZWRSZW1vdGVEaXJlY3RvcmllcyA+IDAgPyBgLCBjcmVhdGVkICR7Y291bnRzLmNyZWF0ZWRSZW1vdGVEaXJlY3Rvcmllc30gcmVtb3RlIGRpcmVjdG9yJHtjb3VudHMuY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzID09PSAxID8gXCJ5XCIgOiBcImllc1wifWAgOiBcIlwifSR7Y291bnRzLmRlbGV0ZWRMb2NhbERpcmVjdG9yaWVzID4gMCA/IGAsIGRlbGV0ZWQgJHtjb3VudHMuZGVsZXRlZExvY2FsRGlyZWN0b3JpZXN9IGxvY2FsIGVtcHR5IGRpcmVjdG9yJHtjb3VudHMuZGVsZXRlZExvY2FsRGlyZWN0b3JpZXMgPT09IDEgPyBcInlcIiA6IFwiaWVzXCJ9YCA6IFwiXCJ9JHtjb3VudHMuY3JlYXRlZExvY2FsRGlyZWN0b3JpZXMgPiAwID8gYCwgY3JlYXRlZCAke2NvdW50cy5jcmVhdGVkTG9jYWxEaXJlY3Rvcmllc30gbG9jYWwgZGlyZWN0b3Ike2NvdW50cy5jcmVhdGVkTG9jYWxEaXJlY3RvcmllcyA9PT0gMSA/IFwieVwiIDogXCJpZXNcIn1gIDogXCJcIn0ke2NvdW50cy5ldmljdGVkTm90ZXMgPiAwID8gYCwgYW5kIGV2aWN0ZWQgJHtjb3VudHMuZXZpY3RlZE5vdGVzfSBzdGFsZSBsb2NhbCBub3RlKHMpYCA6IFwiXCJ9JHtjb3VudHMubWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzID4gMCA/IGAsIHdoaWxlIGRldGVjdGluZyAke2NvdW50cy5taXNzaW5nUmVtb3RlQmFja2VkTm90ZXN9IGxhenkgbm90ZShzKSBtaXNzaW5nIHRoZWlyIHJlbW90ZSBjb250ZW50YCA6IFwiXCJ9JHtjb3VudHMucHVyZ2VkTWlzc2luZ0xhenlOb3RlcyA+IDAgPyBgLCBhbmQgcHVyZ2VkICR7Y291bnRzLnB1cmdlZE1pc3NpbmdMYXp5Tm90ZXN9IGNvbmZpcm1lZCBicm9rZW4gbGF6eSBwbGFjZWhvbGRlcihzKWAgOiBcIlwifS5gLFxuICAgICAgKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cywgODAwMCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJWYXVsdCBjb250ZW50IHN5bmMgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gRGF0ZS5ub3coKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9IHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTUxODVcdTVCQjlcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIiwgXCJDb250ZW50IHN5bmMgZmFpbGVkXCIpLCBlcnJvcik7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsIDgwMDApO1xuICAgICAgfVxuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLnN5bmNJblByb2dyZXNzID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc3luY1BlbmRpbmdWYXVsdENvbnRlbnQoc2hvd05vdGljZSA9IHRydWUpIHtcbiAgICBpZiAodGhpcy5zeW5jSW5Qcm9ncmVzcykge1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdTU0MENcdTZCNjVcdTZCNjNcdTU3MjhcdThGREJcdTg4NENcdTRFMkRcdTMwMDJcIiwgXCJBIHN5bmMgaXMgYWxyZWFkeSBpbiBwcm9ncmVzcy5cIiksIDQwMDApO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuc3luY0luUHJvZ3Jlc3MgPSB0cnVlO1xuICAgIGNvbnN0IGNvdW50cyA9IHsgdXBsb2FkZWQ6IDAsIGRlbGV0ZWRSZW1vdGVGaWxlczogMCwgc2tpcHBlZDogMCwgZGV0ZWN0ZWRMb2NhbENoYW5nZXM6IDAgfTtcbiAgICB0cnkge1xuICAgICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG4gICAgICBhd2FpdCB0aGlzLndhaXRGb3JQZW5kaW5nVmF1bHRNdXRhdGlvbnMoKTtcbiAgICAgIGNvbnN0IHVwbG9hZHNSZWFkeSA9IGF3YWl0IHRoaXMucHJlcGFyZVBlbmRpbmdVcGxvYWRzRm9yU3luYyhzaG93Tm90aWNlKTtcbiAgICAgIGlmICghdXBsb2Fkc1JlYWR5KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5xdWV1ZUNoYW5nZWRMb2NhbEZpbGVzRm9yRmFzdFN5bmMoY291bnRzKTtcbiAgICAgIGF3YWl0IHRoaXMucHJvY2Vzc1BlbmRpbmdWYXVsdERlbGV0aW9ucyhjb3VudHMpO1xuICAgICAgYXdhaXQgdGhpcy5wcm9jZXNzUGVuZGluZ1ZhdWx0VXBsb2Fkcyhjb3VudHMpO1xuXG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLnQoXG4gICAgICAgIGBcdTVERjJcdTVGRUJcdTkwMUZcdTU0MENcdTZCNjVcdUZGMUFcdTUzRDFcdTczQjAgJHtjb3VudHMuZGV0ZWN0ZWRMb2NhbENoYW5nZXN9IFx1NEUyQVx1NjcyQ1x1NTczMFx1NTNEOFx1NTMxNlx1RkYwQ1x1NEUwQVx1NEYyMCAke2NvdW50cy51cGxvYWRlZH0gXHU0RTJBXHU2NTg3XHU0RUY2XHVGRjBDXHU1MjIwXHU5NjY0XHU4RkRDXHU3QUVGXHU1MTg1XHU1QkI5ICR7Y291bnRzLmRlbGV0ZWRSZW1vdGVGaWxlc30gXHU0RTJBXHVGRjBDXHU4REYzXHU4RkM3ICR7Y291bnRzLnNraXBwZWR9IFx1NEUyQVx1NjU4N1x1NEVGNlx1MzAwMmAsXG4gICAgICAgIGBGYXN0IHN5bmMgZm91bmQgJHtjb3VudHMuZGV0ZWN0ZWRMb2NhbENoYW5nZXN9IGxvY2FsIGNoYW5nZShzKSwgdXBsb2FkZWQgJHtjb3VudHMudXBsb2FkZWR9IGZpbGUocyksIGRlbGV0ZWQgJHtjb3VudHMuZGVsZXRlZFJlbW90ZUZpbGVzfSByZW1vdGUgY29udGVudCBmaWxlKHMpLCBhbmQgc2tpcHBlZCAke2NvdW50cy5za2lwcGVkfSBmaWxlKHMpLmAsXG4gICAgICApO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzLCA2MDAwKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhc3QgdmF1bHQgY29udGVudCBzeW5jIGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU1RkVCXHU5MDFGXHU1NDBDXHU2QjY1XHU1OTMxXHU4RDI1XCIsIFwiRmFzdCBzeW5jIGZhaWxlZFwiKSwgZXJyb3IpO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzLCA4MDAwKTtcbiAgICAgIH1cbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy5zeW5jSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcXVldWVDaGFuZ2VkTG9jYWxGaWxlc0ZvckZhc3RTeW5jKGNvdW50czogeyBkZXRlY3RlZExvY2FsQ2hhbmdlczogbnVtYmVyOyBza2lwcGVkOiBudW1iZXIgfSkge1xuICAgIGNvbnN0IGZpbGVzID0gdGhpcy5zeW5jU3VwcG9ydC5jb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKTtcbiAgICBjb25zdCByZWNlbnRUb3VjaEdyYWNlTXMgPSAxMDAwO1xuICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgICBjb25zdCBwcmV2aW91cyA9IHRoaXMuc3luY0luZGV4LmdldChmaWxlLnBhdGgpO1xuICAgICAgY29uc3QgbWFya2Rvd25Db250ZW50ID0gZmlsZS5leHRlbnNpb24gPT09IFwibWRcIiA/IGF3YWl0IHRoaXMucmVhZE1hcmtkb3duQ29udGVudFByZWZlckVkaXRvcihmaWxlKSA6IHVuZGVmaW5lZDtcbiAgICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiICYmIHRoaXMucGFyc2VOb3RlU3R1YihtYXJrZG93bkNvbnRlbnQgPz8gXCJcIikpIHtcbiAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGxvY2FsU2lnbmF0dXJlID0gYXdhaXQgdGhpcy5idWlsZEN1cnJlbnRMb2NhbFNpZ25hdHVyZShmaWxlLCBtYXJrZG93bkNvbnRlbnQpO1xuICAgICAgY29uc3QgdG91Y2hlZFNpbmNlTGFzdFN5bmMgPVxuICAgICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA+IDAgJiYgZmlsZS5zdGF0Lm10aW1lID4gdGhpcy5sYXN0VmF1bHRTeW5jQXQgKyByZWNlbnRUb3VjaEdyYWNlTXM7XG4gICAgICBpZiAoIXByZXZpb3VzIHx8IHByZXZpb3VzLnJlbW90ZVBhdGggIT09IHJlbW90ZVBhdGggfHwgcHJldmlvdXMubG9jYWxTaWduYXR1cmUgIT09IGxvY2FsU2lnbmF0dXJlIHx8IHRvdWNoZWRTaW5jZUxhc3RTeW5jKSB7XG4gICAgICAgIGlmICghdGhpcy5wZW5kaW5nVmF1bHRTeW5jUGF0aHMuaGFzKGZpbGUucGF0aCkpIHtcbiAgICAgICAgICBjb3VudHMuZGV0ZWN0ZWRMb2NhbENoYW5nZXMgKz0gMTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm1hcmtQZW5kaW5nVmF1bHRTeW5jKGZpbGUucGF0aCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzUGVuZGluZ1ZhdWx0RGVsZXRpb25zKGNvdW50czogeyBkZWxldGVkUmVtb3RlRmlsZXM6IG51bWJlcjsgc2tpcHBlZDogbnVtYmVyIH0pIHtcbiAgICBmb3IgKGNvbnN0IFtwYXRoLCBlbnRyeV0gb2YgWy4uLnRoaXMucGVuZGluZ1ZhdWx0RGVsZXRpb25QYXRocy5lbnRyaWVzKCldLnNvcnQoKGEsIGIpID0+IGFbMF0ubG9jYWxlQ29tcGFyZShiWzBdKSkpIHtcbiAgICAgIGlmICh0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgocGF0aCkpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nVmF1bHREZWxldGlvblBhdGhzLmRlbGV0ZShwYXRoKTtcbiAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMud3JpdGVEZWxldGlvblRvbWJzdG9uZShwYXRoLCBlbnRyeS5yZW1vdGVTaWduYXR1cmUpO1xuICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShlbnRyeS5yZW1vdGVQYXRoKTtcbiAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShwYXRoKTtcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0RGVsZXRpb25QYXRocy5kZWxldGUocGF0aCk7XG4gICAgICBjb3VudHMuZGVsZXRlZFJlbW90ZUZpbGVzICs9IDE7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzUGVuZGluZ1ZhdWx0VXBsb2Fkcyhjb3VudHM6IHsgdXBsb2FkZWQ6IG51bWJlcjsgc2tpcHBlZDogbnVtYmVyIH0pIHtcbiAgICBmb3IgKGNvbnN0IHBhdGggb2YgWy4uLnRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzXS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpKSB7XG4gICAgICBpZiAodGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKHBhdGgpKSB7XG4gICAgICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzLmRlbGV0ZShwYXRoKTtcbiAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChwYXRoKTtcbiAgICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nVmF1bHRTeW5jUGF0aHMuZGVsZXRlKHBhdGgpO1xuICAgICAgICBjb3VudHMuc2tpcHBlZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbWFya2Rvd25Db250ZW50ID0gZmlsZS5leHRlbnNpb24gPT09IFwibWRcIiA/IGF3YWl0IHRoaXMucmVhZE1hcmtkb3duQ29udGVudFByZWZlckVkaXRvcihmaWxlKSA6IHVuZGVmaW5lZDtcbiAgICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiICYmIHRoaXMucGFyc2VOb3RlU3R1YihtYXJrZG93bkNvbnRlbnQgPz8gXCJcIikpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nVmF1bHRTeW5jUGF0aHMuZGVsZXRlKHBhdGgpO1xuICAgICAgICBjb3VudHMuc2tpcHBlZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoLCBtYXJrZG93bkNvbnRlbnQpO1xuICAgICAgY29uc3QgbG9jYWxTaWduYXR1cmUgPSBhd2FpdCB0aGlzLmJ1aWxkQ3VycmVudExvY2FsU2lnbmF0dXJlKGZpbGUsIG1hcmtkb3duQ29udGVudCk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIH0pO1xuICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgdGhpcy5wZW5kaW5nVmF1bHRTeW5jUGF0aHMuZGVsZXRlKHBhdGgpO1xuICAgICAgY291bnRzLnVwbG9hZGVkICs9IDE7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWNvbmNpbGVPcnBoYW5lZFN5bmNFbnRyaWVzKFxuICAgIHJlbW90ZUZpbGVzOiBNYXA8c3RyaW5nLCBSZW1vdGVGaWxlU3RhdGU+LFxuICAgIGRlbGV0aW9uVG9tYnN0b25lczogTWFwPHN0cmluZywgRGVsZXRpb25Ub21ic3RvbmU+LFxuICAgIGNvdW50czogeyB1cGxvYWRlZDogbnVtYmVyOyByZXN0b3JlZEZyb21SZW1vdGU6IG51bWJlcjsgZG93bmxvYWRlZE9yVXBkYXRlZDogbnVtYmVyOyBza2lwcGVkOiBudW1iZXI7IGRlbGV0ZWRSZW1vdGVGaWxlczogbnVtYmVyOyBkZWxldGVkTG9jYWxGaWxlczogbnVtYmVyOyBkZWxldGVkTG9jYWxTdHViczogbnVtYmVyOyBtaXNzaW5nUmVtb3RlQmFja2VkTm90ZXM6IG51bWJlcjsgcHVyZ2VkTWlzc2luZ0xhenlOb3RlczogbnVtYmVyIH0sXG4gICkge1xuICAgIGNvbnN0IGZpbGVzID0gdGhpcy5zeW5jU3VwcG9ydC5jb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKTtcbiAgICBjb25zdCBjdXJyZW50UGF0aHMgPSBuZXcgU2V0KGZpbGVzLm1hcCgoZmlsZSkgPT4gZmlsZS5wYXRoKSk7XG4gICAgZm9yIChjb25zdCBwYXRoIG9mIFsuLi50aGlzLnN5bmNJbmRleC5rZXlzKCldKSB7XG4gICAgICBpZiAoY3VycmVudFBhdGhzLmhhcyhwYXRoKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuc3luY1N1cHBvcnQuc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChwYXRoKSkge1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUocGF0aCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBwcmV2aW91cyA9IHRoaXMuc3luY0luZGV4LmdldChwYXRoKTtcbiAgICAgIGlmICghcHJldmlvdXMpIHtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKHBhdGgpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVtb3RlID0gcmVtb3RlRmlsZXMuZ2V0KHByZXZpb3VzLnJlbW90ZVBhdGgpO1xuICAgICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKHBhdGgpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldChwYXRoKTtcbiAgICAgIGlmICh0b21ic3RvbmUgJiYgdGhpcy5zeW5jU3VwcG9ydC5pc1RvbWJzdG9uZUF1dGhvcml0YXRpdmUodG9tYnN0b25lLCByZW1vdGUpKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlQ29udGVudEZpbGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICByZW1vdGVGaWxlcy5kZWxldGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUocGF0aCk7XG4gICAgICAgIGNvdW50cy5kZWxldGVkUmVtb3RlRmlsZXMgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICh0b21ic3RvbmUpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShwYXRoKTtcbiAgICAgICAgZGVsZXRpb25Ub21ic3RvbmVzLmRlbGV0ZShwYXRoKTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KHBhdGgsIHJlbW90ZSk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5zZXQocGF0aCwge1xuICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICByZW1vdGVQYXRoOiByZW1vdGUucmVtb3RlUGF0aCxcbiAgICAgIH0pO1xuICAgICAgY291bnRzLnJlc3RvcmVkRnJvbVJlbW90ZSArPSAxO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVjb25jaWxlUmVtb3RlT25seUZpbGVzKFxuICAgIHJlbW90ZUZpbGVzOiBNYXA8c3RyaW5nLCBSZW1vdGVGaWxlU3RhdGU+LFxuICAgIGRlbGV0aW9uVG9tYnN0b25lczogTWFwPHN0cmluZywgRGVsZXRpb25Ub21ic3RvbmU+LFxuICAgIGNvdW50czogeyB1cGxvYWRlZDogbnVtYmVyOyByZXN0b3JlZEZyb21SZW1vdGU6IG51bWJlcjsgZG93bmxvYWRlZE9yVXBkYXRlZDogbnVtYmVyOyBza2lwcGVkOiBudW1iZXI7IGRlbGV0ZWRSZW1vdGVGaWxlczogbnVtYmVyOyBkZWxldGVkTG9jYWxGaWxlczogbnVtYmVyOyBkZWxldGVkTG9jYWxTdHViczogbnVtYmVyOyBtaXNzaW5nUmVtb3RlQmFja2VkTm90ZXM6IG51bWJlcjsgcHVyZ2VkTWlzc2luZ0xhenlOb3RlczogbnVtYmVyIH0sXG4gICkge1xuICAgIGNvbnN0IGZpbGVzID0gdGhpcy5zeW5jU3VwcG9ydC5jb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKTtcbiAgICBjb25zdCBjdXJyZW50UGF0aHMgPSBuZXcgU2V0KGZpbGVzLm1hcCgoZmlsZSkgPT4gZmlsZS5wYXRoKSk7XG4gICAgZm9yIChjb25zdCByZW1vdGUgb2YgWy4uLnJlbW90ZUZpbGVzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLnJlbW90ZVBhdGgubG9jYWxlQ29tcGFyZShiLnJlbW90ZVBhdGgpKSkge1xuICAgICAgY29uc3QgdmF1bHRQYXRoID0gdGhpcy5zeW5jU3VwcG9ydC5yZW1vdGVQYXRoVG9WYXVsdFBhdGgocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgaWYgKCF2YXVsdFBhdGggfHwgY3VycmVudFBhdGhzLmhhcyh2YXVsdFBhdGgpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKHZhdWx0UGF0aCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRvbWJzdG9uZSA9IGRlbGV0aW9uVG9tYnN0b25lcy5nZXQodmF1bHRQYXRoKTtcbiAgICAgIGlmICh0b21ic3RvbmUpIHtcbiAgICAgICAgaWYgKHRoaXMuc3luY1N1cHBvcnQuaXNUb21ic3RvbmVBdXRob3JpdGF0aXZlKHRvbWJzdG9uZSwgcmVtb3RlKSkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlQ29udGVudEZpbGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICAgIHJlbW90ZUZpbGVzLmRlbGV0ZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgICAgY291bnRzLmRlbGV0ZWRSZW1vdGVGaWxlcyArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZSh2YXVsdFBhdGgpO1xuICAgICAgICBkZWxldGlvblRvbWJzdG9uZXMuZGVsZXRlKHZhdWx0UGF0aCk7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMuZG93bmxvYWRSZW1vdGVGaWxlVG9WYXVsdCh2YXVsdFBhdGgsIHJlbW90ZSk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5zZXQodmF1bHRQYXRoLCB7XG4gICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICByZW1vdGVTaWduYXR1cmU6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVBhdGg6IHJlbW90ZS5yZW1vdGVQYXRoLFxuICAgICAgfSk7XG4gICAgICBjb3VudHMucmVzdG9yZWRGcm9tUmVtb3RlICs9IDE7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBzaG91bGRVcGxvYWRMb2NhbFdoZW5SZW1vdGVJc01pc3NpbmcoXG4gICAgZmlsZTogVEZpbGUsXG4gICAgcHJldmlvdXM6IFN5bmNJbmRleEVudHJ5IHwgdW5kZWZpbmVkLFxuICAgIGxvY2FsU2lnbmF0dXJlOiBzdHJpbmcsXG4gICAgcmVtb3RlUGF0aDogc3RyaW5nLFxuICApIHtcbiAgICBpZiAocHJldmlvdXMpIHtcbiAgICAgIHJldHVybiBwcmV2aW91cy5yZW1vdGVQYXRoICE9PSByZW1vdGVQYXRoIHx8IHByZXZpb3VzLmxvY2FsU2lnbmF0dXJlICE9PSBsb2NhbFNpZ25hdHVyZTtcbiAgICB9XG5cbiAgICBjb25zdCBncmFjZU1zID0gNTAwMDtcbiAgICByZXR1cm4gIXRoaXMubGFzdFZhdWx0U3luY0F0IHx8IGZpbGUuc3RhdC5tdGltZSA+IHRoaXMubGFzdFZhdWx0U3luY0F0ICsgZ3JhY2VNcztcbiAgfVxuXG4gIHByaXZhdGUgZm9ybWF0Q29uZmxpY3RUaW1lc3RhbXAoKSB7XG4gICAgY29uc3QgdmFsdWUgPSBuZXcgRGF0ZSgpO1xuICAgIGNvbnN0IHBhZCA9IChpbnB1dDogbnVtYmVyKSA9PiBTdHJpbmcoaW5wdXQpLnBhZFN0YXJ0KDIsIFwiMFwiKTtcbiAgICByZXR1cm4gYCR7dmFsdWUuZ2V0RnVsbFllYXIoKX0ke3BhZCh2YWx1ZS5nZXRNb250aCgpICsgMSl9JHtwYWQodmFsdWUuZ2V0RGF0ZSgpKX0tJHtwYWQodmFsdWUuZ2V0SG91cnMoKSl9JHtwYWQodmFsdWUuZ2V0TWludXRlcygpKX0ke3BhZCh2YWx1ZS5nZXRTZWNvbmRzKCkpfWA7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkQ29uZmxpY3RDb3B5UGF0aChvcmlnaW5hbFBhdGg6IHN0cmluZywgbGFiZWw6IHN0cmluZykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVQYXRoKG9yaWdpbmFsUGF0aCk7XG4gICAgY29uc3Qgc2xhc2hJbmRleCA9IG5vcm1hbGl6ZWQubGFzdEluZGV4T2YoXCIvXCIpO1xuICAgIGNvbnN0IGRpciA9IHNsYXNoSW5kZXggPj0gMCA/IG5vcm1hbGl6ZWQuc2xpY2UoMCwgc2xhc2hJbmRleCArIDEpIDogXCJcIjtcbiAgICBjb25zdCBuYW1lID0gc2xhc2hJbmRleCA+PSAwID8gbm9ybWFsaXplZC5zbGljZShzbGFzaEluZGV4ICsgMSkgOiBub3JtYWxpemVkO1xuICAgIGNvbnN0IGRvdEluZGV4ID0gbmFtZS5sYXN0SW5kZXhPZihcIi5cIik7XG4gICAgY29uc3Qgc3RlbSA9IGRvdEluZGV4ID4gMCA/IG5hbWUuc2xpY2UoMCwgZG90SW5kZXgpIDogbmFtZTtcbiAgICBjb25zdCBleHQgPSBkb3RJbmRleCA+IDAgPyBuYW1lLnNsaWNlKGRvdEluZGV4KSA6IFwiXCI7XG4gICAgY29uc3Qgc3VmZml4ID0gYC5zeW5jLWNvbmZsaWN0LSR7dGhpcy5mb3JtYXRDb25mbGljdFRpbWVzdGFtcCgpfS0ke2xhYmVsfWA7XG4gICAgcmV0dXJuIGAke2Rpcn0ke3N0ZW19JHtzdWZmaXh9JHtleHR9YDtcbiAgfVxuXG4gIHByaXZhdGUgZmluZEV4aXN0aW5nQ29uZmxpY3RDb3B5UGF0aChvcmlnaW5hbFBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVQYXRoKG9yaWdpbmFsUGF0aCk7XG4gICAgY29uc3Qgc2xhc2hJbmRleCA9IG5vcm1hbGl6ZWQubGFzdEluZGV4T2YoXCIvXCIpO1xuICAgIGNvbnN0IGRpciA9IHNsYXNoSW5kZXggPj0gMCA/IG5vcm1hbGl6ZWQuc2xpY2UoMCwgc2xhc2hJbmRleCArIDEpIDogXCJcIjtcbiAgICBjb25zdCBuYW1lID0gc2xhc2hJbmRleCA+PSAwID8gbm9ybWFsaXplZC5zbGljZShzbGFzaEluZGV4ICsgMSkgOiBub3JtYWxpemVkO1xuICAgIGNvbnN0IGRvdEluZGV4ID0gbmFtZS5sYXN0SW5kZXhPZihcIi5cIik7XG4gICAgY29uc3Qgc3RlbSA9IGRvdEluZGV4ID4gMCA/IG5hbWUuc2xpY2UoMCwgZG90SW5kZXgpIDogbmFtZTtcbiAgICBjb25zdCBleHQgPSBkb3RJbmRleCA+IDAgPyBuYW1lLnNsaWNlKGRvdEluZGV4KSA6IFwiXCI7XG4gICAgY29uc3QgcHJlZml4ID0gYCR7ZGlyfSR7c3RlbX0uc3luYy1jb25mbGljdC1gO1xuICAgIHJldHVybiB0aGlzLmFwcC52YXVsdC5nZXRGaWxlcygpXG4gICAgICAubWFwKChmaWxlKSA9PiBmaWxlLnBhdGgpXG4gICAgICAuZmluZCgocGF0aCkgPT4gcGF0aC5zdGFydHNXaXRoKHByZWZpeCkgJiYgKCFleHQgfHwgcGF0aC5lbmRzV2l0aChleHQpKSkgPz8gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY3JlYXRlTG9jYWxDb25mbGljdENvcHkoZmlsZTogVEZpbGUsIG1hcmtkb3duQ29udGVudDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgbGFiZWw6IHN0cmluZykge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5maW5kRXhpc3RpbmdDb25mbGljdENvcHlQYXRoKGZpbGUucGF0aCk7XG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICByZXR1cm4gZXhpc3Rpbmc7XG4gICAgfVxuXG4gICAgbGV0IHRhcmdldFBhdGggPSB0aGlzLmJ1aWxkQ29uZmxpY3RDb3B5UGF0aChmaWxlLnBhdGgsIGxhYmVsKTtcbiAgICBsZXQgYXR0ZW1wdCA9IDE7XG4gICAgd2hpbGUgKHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aCh0YXJnZXRQYXRoKSkge1xuICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVBhdGgodGFyZ2V0UGF0aCk7XG4gICAgICBjb25zdCBkb3RJbmRleCA9IG5vcm1hbGl6ZWQubGFzdEluZGV4T2YoXCIuXCIpO1xuICAgICAgdGFyZ2V0UGF0aCA9IGRvdEluZGV4ID4gMFxuICAgICAgICA/IGAke25vcm1hbGl6ZWQuc2xpY2UoMCwgZG90SW5kZXgpfS0ke2F0dGVtcHR9JHtub3JtYWxpemVkLnNsaWNlKGRvdEluZGV4KX1gXG4gICAgICAgIDogYCR7bm9ybWFsaXplZH0tJHthdHRlbXB0fWA7XG4gICAgICBhdHRlbXB0ICs9IDE7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5lbnN1cmVMb2NhbFBhcmVudEZvbGRlcnModGFyZ2V0UGF0aCk7XG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZSh0YXJnZXRQYXRoLCBtYXJrZG93bkNvbnRlbnQgPz8gYXdhaXQgdGhpcy5yZWFkTWFya2Rvd25Db250ZW50UHJlZmVyRWRpdG9yKGZpbGUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlQmluYXJ5KHRhcmdldFBhdGgsIGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWRCaW5hcnkoZmlsZSkpO1xuICAgIH1cblxuICAgIHRoaXMubWFya1BlbmRpbmdWYXVsdFN5bmModGFyZ2V0UGF0aCk7XG4gICAgcmV0dXJuIHRhcmdldFBhdGg7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlY29uY2lsZUxvY2FsRmlsZXMoXG4gICAgcmVtb3RlRmlsZXM6IE1hcDxzdHJpbmcsIFJlbW90ZUZpbGVTdGF0ZT4sXG4gICAgZGVsZXRpb25Ub21ic3RvbmVzOiBNYXA8c3RyaW5nLCBEZWxldGlvblRvbWJzdG9uZT4sXG4gICAgY291bnRzOiB7IHVwbG9hZGVkOiBudW1iZXI7IHJlc3RvcmVkRnJvbVJlbW90ZTogbnVtYmVyOyBkb3dubG9hZGVkT3JVcGRhdGVkOiBudW1iZXI7IHNraXBwZWQ6IG51bWJlcjsgZGVsZXRlZFJlbW90ZUZpbGVzOiBudW1iZXI7IGRlbGV0ZWRMb2NhbEZpbGVzOiBudW1iZXI7IGRlbGV0ZWRMb2NhbFN0dWJzOiBudW1iZXI7IG1pc3NpbmdSZW1vdGVCYWNrZWROb3RlczogbnVtYmVyOyBwdXJnZWRNaXNzaW5nTGF6eU5vdGVzOiBudW1iZXIgfSxcbiAgKTogUHJvbWlzZTxTZXQ8c3RyaW5nPj4ge1xuICAgIGNvbnN0IGZpbGVzID0gdGhpcy5zeW5jU3VwcG9ydC5jb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKTtcbiAgICBjb25zdCBsb2NhbFJlbW90ZVBhdGhzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbiAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aChmaWxlLnBhdGgpO1xuICAgICAgbG9jYWxSZW1vdGVQYXRocy5hZGQocmVtb3RlUGF0aCk7XG4gICAgICBjb25zdCByZW1vdGUgPSByZW1vdGVGaWxlcy5nZXQocmVtb3RlUGF0aCk7XG4gICAgICBjb25zdCByZW1vdGVTaWduYXR1cmUgPSByZW1vdGU/LnNpZ25hdHVyZSA/PyBcIlwiO1xuICAgICAgY29uc3QgcHJldmlvdXMgPSB0aGlzLnN5bmNJbmRleC5nZXQoZmlsZS5wYXRoKTtcbiAgICAgIGNvbnN0IG1hcmtkb3duQ29udGVudCA9IGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIgPyBhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSkgOiBudWxsO1xuICAgICAgY29uc3QgbG9jYWxTaWduYXR1cmUgPSBhd2FpdCB0aGlzLmJ1aWxkQ3VycmVudExvY2FsU2lnbmF0dXJlKGZpbGUsIG1hcmtkb3duQ29udGVudCA/PyB1bmRlZmluZWQpO1xuXG4gICAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgICBjb25zdCBzdHViID0gdGhpcy5wYXJzZU5vdGVTdHViKG1hcmtkb3duQ29udGVudCA/PyBcIlwiKTtcbiAgICAgICAgaWYgKHN0dWIpIHtcbiAgICAgICAgICBjb25zdCBzdHViUmVtb3RlID0gcmVtb3RlRmlsZXMuZ2V0KHN0dWIucmVtb3RlUGF0aCk7XG4gICAgICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldChmaWxlLnBhdGgpO1xuICAgICAgICAgIGNvbnN0IHJlc29sdXRpb24gPSBhd2FpdCB0aGlzLnJlc29sdmVMYXp5Tm90ZVN0dWIoZmlsZSwgc3R1Yiwgc3R1YlJlbW90ZSwgdG9tYnN0b25lKTtcbiAgICAgICAgICBpZiAocmVzb2x1dGlvbi5hY3Rpb24gPT09IFwiZGVsZXRlZFwiKSB7XG4gICAgICAgICAgICBjb3VudHMuZGVsZXRlZExvY2FsRmlsZXMgKz0gMTtcbiAgICAgICAgICAgIGNvdW50cy5kZWxldGVkTG9jYWxTdHVicyArPSAxO1xuICAgICAgICAgICAgaWYgKHJlc29sdXRpb24ucHVyZ2VkTWlzc2luZykge1xuICAgICAgICAgICAgICBjb3VudHMucHVyZ2VkTWlzc2luZ0xhenlOb3RlcyArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChyZXNvbHV0aW9uLmFjdGlvbiA9PT0gXCJtaXNzaW5nXCIpIHtcbiAgICAgICAgICAgIGNvdW50cy5taXNzaW5nUmVtb3RlQmFja2VkTm90ZXMgKz0gMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHN0dWJSZW1vdGU/LnNpZ25hdHVyZSA/PyBwcmV2aW91cz8ucmVtb3RlU2lnbmF0dXJlID8/IFwiXCIsXG4gICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGNvdW50cy5za2lwcGVkICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldChmaWxlLnBhdGgpO1xuICAgICAgY29uc3QgdW5jaGFuZ2VkU2luY2VMYXN0U3luYyA9IHByZXZpb3VzPy5yZW1vdGVQYXRoID09PSByZW1vdGVQYXRoICYmIHByZXZpb3VzLmxvY2FsU2lnbmF0dXJlID09PSBsb2NhbFNpZ25hdHVyZTtcbiAgICAgIGlmICh0b21ic3RvbmUpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHVuY2hhbmdlZFNpbmNlTGFzdFN5bmMgJiZcbiAgICAgICAgICB0aGlzLnN5bmNTdXBwb3J0LnNob3VsZERlbGV0ZUxvY2FsRnJvbVRvbWJzdG9uZShmaWxlLCB0b21ic3RvbmUpICYmXG4gICAgICAgICAgdGhpcy5zeW5jU3VwcG9ydC5pc1RvbWJzdG9uZUF1dGhvcml0YXRpdmUodG9tYnN0b25lLCByZW1vdGUpXG4gICAgICAgICkge1xuICAgICAgICAgIGF3YWl0IHRoaXMucmVtb3ZlTG9jYWxWYXVsdEZpbGUoZmlsZSk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICAgICAgY291bnRzLmRlbGV0ZWRMb2NhbEZpbGVzICs9IDE7XG4gICAgICAgICAgaWYgKHJlbW90ZSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgICAgICByZW1vdGVGaWxlcy5kZWxldGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICAgICAgY291bnRzLmRlbGV0ZWRSZW1vdGVGaWxlcyArPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghcHJldmlvdXMgfHwgdGhpcy5zeW5jU3VwcG9ydC5zaG91bGREZWxldGVMb2NhbEZyb21Ub21ic3RvbmUoZmlsZSwgdG9tYnN0b25lKSkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuY3JlYXRlTG9jYWxDb25mbGljdENvcHkoZmlsZSwgbWFya2Rvd25Db250ZW50LCBcImxvY2FsXCIpO1xuICAgICAgICAgIGNvdW50cy5za2lwcGVkICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCk7XG4gICAgICAgIGRlbGV0aW9uVG9tYnN0b25lcy5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFyZW1vdGUgJiYgIXRoaXMuc2hvdWxkVXBsb2FkTG9jYWxXaGVuUmVtb3RlSXNNaXNzaW5nKGZpbGUsIHByZXZpb3VzLCBsb2NhbFNpZ25hdHVyZSwgcmVtb3RlUGF0aCkpIHtcbiAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghcmVtb3RlKSB7XG4gICAgICAgIGNvbnN0IHVwbG9hZGVkUmVtb3RlID0gYXdhaXQgdGhpcy51cGxvYWRDb250ZW50RmlsZVRvUmVtb3RlKGZpbGUsIHJlbW90ZVBhdGgsIG1hcmtkb3duQ29udGVudCA/PyB1bmRlZmluZWQpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiB1cGxvYWRlZFJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlbW90ZUZpbGVzLnNldChyZW1vdGVQYXRoLCB1cGxvYWRlZFJlbW90ZSk7XG4gICAgICAgIGNvdW50cy51cGxvYWRlZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFwcmV2aW91cykge1xuICAgICAgICBpZiAobG9jYWxTaWduYXR1cmUgPT09IHJlbW90ZVNpZ25hdHVyZSkge1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHsgbG9jYWxTaWduYXR1cmUsIHJlbW90ZVNpZ25hdHVyZSwgcmVtb3RlUGF0aCB9KTtcbiAgICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCk7XG4gICAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLnN5bmNTdXBwb3J0LnNob3VsZERvd25sb2FkUmVtb3RlVmVyc2lvbihmaWxlLnN0YXQubXRpbWUsIHJlbW90ZS5sYXN0TW9kaWZpZWQpKSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KGZpbGUucGF0aCwgcmVtb3RlLCBmaWxlKTtcbiAgICAgICAgICBjb25zdCByZWZyZXNoZWQgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChmaWxlLnBhdGgpO1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZWZyZXNoZWQgPyBhd2FpdCB0aGlzLmJ1aWxkQ3VycmVudExvY2FsU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGNvdW50cy5kb3dubG9hZGVkT3JVcGRhdGVkICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoLCBtYXJrZG93bkNvbnRlbnQgPz8gdW5kZWZpbmVkKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICByZW1vdGVGaWxlcy5zZXQocmVtb3RlUGF0aCwgdXBsb2FkZWRSZW1vdGUpO1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCk7XG4gICAgICAgIGNvdW50cy51cGxvYWRlZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbG9jYWxDaGFuZ2VkID0gcHJldmlvdXMubG9jYWxTaWduYXR1cmUgIT09IGxvY2FsU2lnbmF0dXJlIHx8IHByZXZpb3VzLnJlbW90ZVBhdGggIT09IHJlbW90ZVBhdGg7XG4gICAgICBjb25zdCByZW1vdGVDaGFuZ2VkID0gcHJldmlvdXMucmVtb3RlU2lnbmF0dXJlICE9PSByZW1vdGVTaWduYXR1cmUgfHwgcHJldmlvdXMucmVtb3RlUGF0aCAhPT0gcmVtb3RlUGF0aDtcbiAgICAgIGlmICghbG9jYWxDaGFuZ2VkICYmICFyZW1vdGVDaGFuZ2VkKSB7XG4gICAgICAgIGNvdW50cy5za2lwcGVkICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIWxvY2FsQ2hhbmdlZCAmJiByZW1vdGVDaGFuZ2VkKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuZG93bmxvYWRSZW1vdGVGaWxlVG9WYXVsdChmaWxlLnBhdGgsIHJlbW90ZSwgZmlsZSk7XG4gICAgICAgIGNvbnN0IHJlZnJlc2hlZCA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVmcmVzaGVkID8gYXdhaXQgdGhpcy5idWlsZEN1cnJlbnRMb2NhbFNpZ25hdHVyZShyZWZyZXNoZWQpIDogcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICB9KTtcbiAgICAgICAgY291bnRzLmRvd25sb2FkZWRPclVwZGF0ZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChsb2NhbENoYW5nZWQgJiYgIXJlbW90ZUNoYW5nZWQpIHtcbiAgICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCwgbWFya2Rvd25Db250ZW50ID8/IHVuZGVmaW5lZCk7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICB9KTtcbiAgICAgICAgcmVtb3RlRmlsZXMuc2V0KHJlbW90ZVBhdGgsIHVwbG9hZGVkUmVtb3RlKTtcbiAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgICBjb3VudHMudXBsb2FkZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMuY3JlYXRlTG9jYWxDb25mbGljdENvcHkoZmlsZSwgbWFya2Rvd25Db250ZW50LCBcImxvY2FsXCIpO1xuICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHJldHVybiBsb2NhbFJlbW90ZVBhdGhzO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICAgIG1ldGhvZDogXCJERUxFVEVcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gNDA0ICYmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBERUxFVEUgZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGRlbGV0ZSByZW1vdGUgc3luY2VkIGNvbnRlbnRcIiwgcmVtb3RlUGF0aCwgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB3cml0ZURlbGV0aW9uVG9tYnN0b25lKHZhdWx0UGF0aDogc3RyaW5nLCByZW1vdGVTaWduYXR1cmU/OiBzdHJpbmcpIHtcbiAgICBjb25zdCBwYXlsb2FkOiBEZWxldGlvblRvbWJzdG9uZSA9IHtcbiAgICAgIHBhdGg6IHZhdWx0UGF0aCxcbiAgICAgIGRlbGV0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICAgIHJlbW90ZVNpZ25hdHVyZSxcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KFxuICAgICAgdGhpcy5zeW5jU3VwcG9ydC5idWlsZERlbGV0aW9uUmVtb3RlUGF0aCh2YXVsdFBhdGgpLFxuICAgICAgdGhpcy5lbmNvZGVVdGY4KEpTT04uc3RyaW5naWZ5KHBheWxvYWQpKSxcbiAgICAgIFwiYXBwbGljYXRpb24vanNvbjsgY2hhcnNldD11dGYtOFwiLFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlQ29udGVudEZpbGUodGhpcy5zeW5jU3VwcG9ydC5idWlsZERlbGV0aW9uUmVtb3RlUGF0aCh2YXVsdFBhdGgpKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIFRvbWJzdG9uZSBjbGVhbnVwIHNob3VsZCBub3QgYnJlYWsgdGhlIG1haW4gc3luYyBmbG93LlxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVhZERlbGV0aW9uVG9tYnN0b25lKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHRoaXMuc3luY1N1cHBvcnQuYnVpbGREZWxldGlvblJlbW90ZVBhdGgodmF1bHRQYXRoKSksXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gNDA0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgdGhpcy5hc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2UsIFwiR0VUIHRvbWJzdG9uZVwiKTtcblxuICAgIHJldHVybiB0aGlzLnN5bmNTdXBwb3J0LnBhcnNlRGVsZXRpb25Ub21ic3RvbmVQYXlsb2FkKHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlcikpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWFkRGVsZXRpb25Ub21ic3RvbmVzKCkge1xuICAgIGNvbnN0IHRvbWJzdG9uZXMgPSBuZXcgTWFwPHN0cmluZywgRGVsZXRpb25Ub21ic3RvbmU+KCk7XG4gICAgY29uc3QgaW52ZW50b3J5ID0gYXdhaXQgdGhpcy5saXN0UmVtb3RlVHJlZSh0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkRGVsZXRpb25Gb2xkZXIoKSk7XG4gICAgZm9yIChjb25zdCByZW1vdGUgb2YgaW52ZW50b3J5LmZpbGVzLnZhbHVlcygpKSB7XG4gICAgICBjb25zdCB2YXVsdFBhdGggPSB0aGlzLnN5bmNTdXBwb3J0LnJlbW90ZURlbGV0aW9uUGF0aFRvVmF1bHRQYXRoKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgIGlmICghdmF1bHRQYXRoKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGUucmVtb3RlUGF0aCksXG4gICAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9tYnN0b25lID0gdGhpcy5zeW5jU3VwcG9ydC5wYXJzZURlbGV0aW9uVG9tYnN0b25lUGF5bG9hZCh0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpKTtcbiAgICAgIGlmICh0b21ic3RvbmUpIHtcbiAgICAgICAgdG9tYnN0b25lcy5zZXQodmF1bHRQYXRoLCB0b21ic3RvbmUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0b21ic3RvbmVzO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRWYXVsdEZpbGVCeVBhdGgocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKTtcbiAgICByZXR1cm4gZmlsZSBpbnN0YW5jZW9mIFRGaWxlID8gZmlsZSA6IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGU6IFRGaWxlKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmRlbGV0ZShmaWxlLCB0cnVlKTtcbiAgICB9IGNhdGNoIChkZWxldGVFcnJvcikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQudHJhc2goZmlsZSwgdHJ1ZSk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgdGhyb3cgZGVsZXRlRXJyb3I7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBlbnN1cmVMb2NhbFBhcmVudEZvbGRlcnMocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVBhdGgocGF0aCk7XG4gICAgY29uc3Qgc2VnbWVudHMgPSBub3JtYWxpemVkLnNwbGl0KFwiL1wiKS5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPiAwKTtcbiAgICBpZiAoc2VnbWVudHMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgY3VycmVudCA9IFwiXCI7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHNlZ21lbnRzLmxlbmd0aCAtIDE7IGluZGV4ICs9IDEpIHtcbiAgICAgIGN1cnJlbnQgPSBjdXJyZW50ID8gYCR7Y3VycmVudH0vJHtzZWdtZW50c1tpbmRleF19YCA6IHNlZ21lbnRzW2luZGV4XTtcbiAgICAgIGlmICghKGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIuZXhpc3RzKGN1cnJlbnQpKSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIubWtkaXIoY3VycmVudCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBjb25zdCBtc2cgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSk7XG4gICAgICAgICAgaWYgKCFtc2cuaW5jbHVkZXMoXCJhbHJlYWR5IGV4aXN0c1wiKSkge1xuICAgICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQodmF1bHRQYXRoOiBzdHJpbmcsIHJlbW90ZTogUmVtb3RlRmlsZVN0YXRlLCBleGlzdGluZ0ZpbGU/OiBURmlsZSkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGUucmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHRoaXMuYXNzZXJ0UmVzcG9uc2VTdWNjZXNzKHJlc3BvbnNlLCBcIkdFVFwiKTtcblxuICAgIGF3YWl0IHRoaXMuZW5zdXJlTG9jYWxQYXJlbnRGb2xkZXJzKHZhdWx0UGF0aCk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgIG10aW1lOiByZW1vdGUubGFzdE1vZGlmaWVkID4gMCA/IHJlbW90ZS5sYXN0TW9kaWZpZWQgOiBEYXRlLm5vdygpLFxuICAgIH07XG4gICAgY29uc3QgaXNNZCA9IHZhdWx0UGF0aC50b0xvd2VyQ2FzZSgpLmVuZHNXaXRoKFwiLm1kXCIpO1xuICAgIGNvbnN0IGN1cnJlbnQgPVxuICAgICAgZXhpc3RpbmdGaWxlID8/IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKHZhdWx0UGF0aCkgPz8gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHZhdWx0UGF0aCk7XG4gICAgaWYgKGN1cnJlbnQgJiYgY3VycmVudCBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICBpZiAoY3VycmVudC5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoY3VycmVudCwgdGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKSwgb3B0aW9ucyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnlCaW5hcnkoY3VycmVudCwgcmVzcG9uc2UuYXJyYXlCdWZmZXIsIG9wdGlvbnMpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgaWYgKGlzTWQpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKHZhdWx0UGF0aCwgdGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKSwgb3B0aW9ucyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVCaW5hcnkodmF1bHRQYXRoLCByZXNwb25zZS5hcnJheUJ1ZmZlciwgb3B0aW9ucyk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc3QgbXNnID0gZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpO1xuICAgICAgaWYgKG1zZy5pbmNsdWRlcyhcImFscmVhZHkgZXhpc3RzXCIpKSB7XG4gICAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgodmF1bHRQYXRoKTtcbiAgICAgICAgaWYgKGZpbGUgJiYgZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICAgICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpLCBvcHRpb25zKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5QmluYXJ5KGZpbGUsIHJlc3BvbnNlLmFycmF5QnVmZmVyLCBvcHRpb25zKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdmVyaWZ5UmVtb3RlQmluYXJ5Um91bmRUcmlwKHJlbW90ZVBhdGg6IHN0cmluZywgZXhwZWN0ZWQ6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmFycmF5QnVmZmVyc0VxdWFsKGV4cGVjdGVkLCByZXNwb25zZS5hcnJheUJ1ZmZlcik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHN0YXRSZW1vdGVGaWxlKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJQUk9QRklORFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICBEZXB0aDogXCIwXCIsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gNDA0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgdGhpcy5hc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2UsIGBQUk9QRklORCBmb3IgJHtyZW1vdGVQYXRofWApO1xuXG4gICAgY29uc3QgeG1sVGV4dCA9IHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlcik7XG4gICAgY29uc3QgZW50cmllcyA9IHRoaXMucGFyc2VQcm9wZmluZERpcmVjdG9yeUxpc3RpbmcoeG1sVGV4dCwgcmVtb3RlUGF0aCwgdHJ1ZSk7XG4gICAgcmV0dXJuIGVudHJpZXMuZmluZCgoZW50cnkpID0+ICFlbnRyeS5pc0NvbGxlY3Rpb24pPy5maWxlID8/IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZTogVEZpbGUsIHJlbW90ZVBhdGg6IHN0cmluZywgbWFya2Rvd25Db250ZW50Pzogc3RyaW5nKSB7XG4gICAgbGV0IGJpbmFyeTogQXJyYXlCdWZmZXI7XG5cbiAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgY29uc3QgY29udGVudCA9IG1hcmtkb3duQ29udGVudCA/PyAoYXdhaXQgdGhpcy5yZWFkTWFya2Rvd25Db250ZW50UHJlZmVyRWRpdG9yKGZpbGUpKTtcbiAgICAgIGlmICh0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgIHRoaXMudChcbiAgICAgICAgICAgIFwiXHU2MkQyXHU3RUREXHU2MjhBXHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU1MzYwXHU0RjREXHU3QjE0XHU4QkIwXHU0RTBBXHU0RjIwXHU0RTNBXHU4RkRDXHU3QUVGXHU2QjYzXHU2NTg3XHUzMDAyXCIsXG4gICAgICAgICAgICBcIlJlZnVzaW5nIHRvIHVwbG9hZCBhIGxhenktbm90ZSBwbGFjZWhvbGRlciBhcyByZW1vdGUgbm90ZSBjb250ZW50LlwiLFxuICAgICAgICAgICksXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGJpbmFyeSA9IHRoaXMuZW5jb2RlVXRmOChjb250ZW50KTtcbiAgICB9IGVsc2Uge1xuICAgICAgYmluYXJ5ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZEJpbmFyeShmaWxlKTtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBiaW5hcnksIHRoaXMuZ2V0TWltZVR5cGUoZmlsZS5leHRlbnNpb24pKTtcbiAgICBjb25zdCByZW1vdGUgPSBhd2FpdCB0aGlzLnN0YXRSZW1vdGVGaWxlKHJlbW90ZVBhdGgpO1xuICAgIGlmIChyZW1vdGUpIHtcbiAgICAgIHJldHVybiByZW1vdGU7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJlbW90ZVBhdGgsXG4gICAgICBsYXN0TW9kaWZpZWQ6IGZpbGUuc3RhdC5tdGltZSxcbiAgICAgIHNpemU6IGZpbGUuc3RhdC5zaXplLFxuICAgICAgc2lnbmF0dXJlOiB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkU3luY1NpZ25hdHVyZShmaWxlKSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVSZW1vdGVTeW5jZWRFbnRyeSh2YXVsdFBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5zeW5jSW5kZXguZ2V0KHZhdWx0UGF0aCk7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IGV4aXN0aW5nPy5yZW1vdGVQYXRoID8/IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKHZhdWx0UGF0aCk7XG4gICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGVQYXRoKTtcbiAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUodmF1bHRQYXRoKTtcbiAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVGaWxlT3BlbihmaWxlOiBURmlsZSB8IG51bGwpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHx8IGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzLnNldChmaWxlLnBhdGgsIERhdGUubm93KCkpO1xuICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG5cbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBjb25zdCBzdHViID0gdGhpcy5wYXJzZU5vdGVTdHViKGNvbnRlbnQpO1xuICAgIGlmICghc3R1Yikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZW1vdGUgPSBhd2FpdCB0aGlzLnN0YXRSZW1vdGVGaWxlKHN0dWIucmVtb3RlUGF0aCk7XG4gICAgICBjb25zdCB0b21ic3RvbmUgPSAhcmVtb3RlID8gYXdhaXQgdGhpcy5yZWFkRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKSA6IHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IHJlc29sdXRpb24gPSBhd2FpdCB0aGlzLnJlc29sdmVMYXp5Tm90ZVN0dWIoZmlsZSwgc3R1YiwgcmVtb3RlLCB0b21ic3RvbmUpO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcblxuICAgICAgaWYgKHJlc29sdXRpb24uYWN0aW9uID09PSBcImRlbGV0ZWRcIikge1xuICAgICAgICBuZXcgTm90aWNlKFxuICAgICAgICAgIHRoaXMudChcbiAgICAgICAgICAgIHJlc29sdXRpb24ucHVyZ2VkTWlzc2luZ1xuICAgICAgICAgICAgICA/IGBcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdThGREVcdTdFRURcdTdGM0FcdTU5MzFcdUZGMENcdTVERjJcdTc5RkJcdTk2NjRcdTY3MkNcdTU3MzBcdTU5MzFcdTY1NDhcdTUzNjBcdTRGNERcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YFxuICAgICAgICAgICAgICA6IGBcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTRFMERcdTVCNThcdTU3MjhcdUZGMENcdTVERjJcdTc5RkJcdTk2NjRcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICAgICAgIHJlc29sdXRpb24ucHVyZ2VkTWlzc2luZ1xuICAgICAgICAgICAgICA/IGBSZW1vdGUgbm90ZSB3YXMgbWlzc2luZyByZXBlYXRlZGx5LCByZW1vdmVkIGxvY2FsIGJyb2tlbiBwbGFjZWhvbGRlcjogJHtmaWxlLmJhc2VuYW1lfWBcbiAgICAgICAgICAgICAgOiBgUmVtb3RlIG5vdGUgbWlzc2luZywgcmVtb3ZlZCBsb2NhbCBwbGFjZWhvbGRlcjogJHtmaWxlLmJhc2VuYW1lfWAsXG4gICAgICAgICAgKSxcbiAgICAgICAgICByZXNvbHV0aW9uLnB1cmdlZE1pc3NpbmcgPyA4MDAwIDogNjAwMCxcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVzb2x1dGlvbi5hY3Rpb24gPT09IFwibWlzc2luZ1wiKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU4RkRDXHU3QUVGXHU2QjYzXHU2NTg3XHU0RTBEXHU1QjU4XHU1NzI4XHVGRjBDXHU1RjUzXHU1MjREXHU1MTQ4XHU0RkREXHU3NTU5XHU2NzJDXHU1NzMwXHU1MzYwXHU0RjREXHU3QjE0XHU4QkIwXHU0RUU1XHU5NjMyXHU0RTM0XHU2NUY2XHU1RjAyXHU1RTM4XHVGRjFCXHU4MkU1XHU1MThEXHU2QjIxXHU3ODZFXHU4QkE0XHU3RjNBXHU1OTMxXHVGRjBDXHU1QzA2XHU4MUVBXHU1MkE4XHU2RTA1XHU3NDA2XHU4QkU1XHU1MzYwXHU0RjREXHUzMDAyXCIsIFwiUmVtb3RlIG5vdGUgaXMgbWlzc2luZy4gVGhlIGxvY2FsIHBsYWNlaG9sZGVyIHdhcyBrZXB0IGZvciBub3cgaW4gY2FzZSB0aGlzIGlzIHRyYW5zaWVudDsgaXQgd2lsbCBiZSBjbGVhbmVkIGF1dG9tYXRpY2FsbHkgaWYgdGhlIHJlbW90ZSBpcyBzdGlsbCBtaXNzaW5nIG9uIHRoZSBuZXh0IGNvbmZpcm1hdGlvbi5cIiksIDgwMDApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIG5ldyBOb3RpY2UodGhpcy50KGBcdTVERjJcdTRFQ0VcdThGRENcdTdBRUZcdTYwNjJcdTU5MERcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YCwgYFJlc3RvcmVkIG5vdGUgZnJvbSByZW1vdGU6ICR7ZmlsZS5iYXNlbmFtZX1gKSwgNjAwMCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gaHlkcmF0ZSBub3RlIGZyb20gcmVtb3RlXCIsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1OEZEQ1x1N0FFRlx1NjA2Mlx1NTkwRFx1N0IxNFx1OEJCMFx1NTkzMVx1OEQyNVwiLCBcIkZhaWxlZCB0byByZXN0b3JlIG5vdGUgZnJvbSByZW1vdGVcIiksIGVycm9yKSwgODAwMCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBnZXRPcGVuTWFya2Rvd25Db250ZW50KG5vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBsZWF2ZXMgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFwibWFya2Rvd25cIik7XG4gICAgZm9yIChjb25zdCBsZWFmIG9mIGxlYXZlcykge1xuICAgICAgY29uc3QgdmlldyA9IGxlYWYudmlldztcbiAgICAgIGlmICghKHZpZXcgaW5zdGFuY2VvZiBNYXJrZG93blZpZXcpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXZpZXcuZmlsZSB8fCB2aWV3LmZpbGUucGF0aCAhPT0gbm90ZVBhdGgpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB2aWV3LmVkaXRvci5nZXRWYWx1ZSgpO1xuICAgIH1cblxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWFkTWFya2Rvd25Db250ZW50UHJlZmVyRWRpdG9yKGZpbGU6IFRGaWxlKSB7XG4gICAgY29uc3QgbGl2ZUNvbnRlbnQgPSB0aGlzLmdldE9wZW5NYXJrZG93bkNvbnRlbnQoZmlsZS5wYXRoKTtcbiAgICBpZiAobGl2ZUNvbnRlbnQgIT09IG51bGwpIHtcbiAgICAgIHJldHVybiBsaXZlQ29udGVudDtcbiAgICB9XG5cbiAgICByZXR1cm4gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUoZmlsZTogVEZpbGUsIG1hcmtkb3duQ29udGVudD86IHN0cmluZykge1xuICAgIGlmIChmaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiKSB7XG4gICAgICByZXR1cm4gdGhpcy5zeW5jU3VwcG9ydC5idWlsZFN5bmNTaWduYXR1cmUoZmlsZSk7XG4gICAgfVxuXG4gICAgY29uc3QgY29udGVudCA9IG1hcmtkb3duQ29udGVudCA/PyAoYXdhaXQgdGhpcy5yZWFkTWFya2Rvd25Db250ZW50UHJlZmVyRWRpdG9yKGZpbGUpKTtcbiAgICBjb25zdCBkaWdlc3QgPSAoYXdhaXQgdGhpcy5jb21wdXRlU2hhMjU2SGV4KHRoaXMuZW5jb2RlVXRmOChjb250ZW50KSkpLnNsaWNlKDAsIDE2KTtcbiAgICByZXR1cm4gYG1kOiR7Y29udGVudC5sZW5ndGh9OiR7ZGlnZXN0fWA7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlY29uY2lsZVJlbW90ZUltYWdlcygpIHtcbiAgICByZXR1cm4geyBkZWxldGVkRmlsZXM6IDAsIGRlbGV0ZWREaXJlY3RvcmllczogMCB9O1xuICB9XG5cbiAgcHJpdmF0ZSBtYXJrTWlzc2luZ0xhenlSZW1vdGUocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCBwcmV2aW91cyA9IHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3Rlcy5nZXQocGF0aCk7XG4gICAgY29uc3QgbmV4dDogTWlzc2luZ0xhenlSZW1vdGVSZWNvcmQgPSBwcmV2aW91c1xuICAgICAgPyB7XG4gICAgICAgICAgZmlyc3REZXRlY3RlZEF0OiBwcmV2aW91cy5maXJzdERldGVjdGVkQXQsXG4gICAgICAgICAgbGFzdERldGVjdGVkQXQ6IG5vdyxcbiAgICAgICAgICBtaXNzQ291bnQ6IHByZXZpb3VzLm1pc3NDb3VudCArIDEsXG4gICAgICAgIH1cbiAgICAgIDoge1xuICAgICAgICAgIGZpcnN0RGV0ZWN0ZWRBdDogbm93LFxuICAgICAgICAgIGxhc3REZXRlY3RlZEF0OiBub3csXG4gICAgICAgICAgbWlzc0NvdW50OiAxLFxuICAgICAgICB9O1xuICAgIHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3Rlcy5zZXQocGF0aCwgbmV4dCk7XG4gICAgcmV0dXJuIG5leHQ7XG4gIH1cblxuICBwcml2YXRlIGNsZWFyTWlzc2luZ0xhenlSZW1vdGUocGF0aDogc3RyaW5nKSB7XG4gICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzLmRlbGV0ZShwYXRoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTaGFyZWQgbG9naWMgZm9yIHJlc29sdmluZyBhIGxhenktbm90ZSBzdHViIGluIGJvdGggaGFuZGxlRmlsZU9wZW4gYW5kXG4gICAqIHN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50LiAgQ2FsbGVycyBwcm92aWRlIHRoZSBhbHJlYWR5LWxvb2tlZC11cCByZW1vdGVcbiAgICogc3RhdGUgKG9yIG51bGwpIGFuZCBhbiBvcHRpb25hbCB0b21ic3RvbmUuXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIHJlc29sdmVMYXp5Tm90ZVN0dWIoXG4gICAgZmlsZTogVEZpbGUsXG4gICAgc3R1YjogeyByZW1vdGVQYXRoOiBzdHJpbmcgfSxcbiAgICByZW1vdGU6IFJlbW90ZUZpbGVTdGF0ZSB8IG51bGwgfCB1bmRlZmluZWQsXG4gICAgdG9tYnN0b25lOiBEZWxldGlvblRvbWJzdG9uZSB8IHVuZGVmaW5lZCxcbiAgKTogUHJvbWlzZTx7IGFjdGlvbjogXCJkZWxldGVkXCIgfCBcInJlc3RvcmVkXCIgfCBcIm1pc3NpbmdcIjsgcHVyZ2VkTWlzc2luZz86IGJvb2xlYW4gfT4ge1xuICAgIGlmICghcmVtb3RlKSB7XG4gICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucmVtb3ZlTG9jYWxWYXVsdEZpbGUoZmlsZSk7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgICB0aGlzLmNsZWFyTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICAgICAgcmV0dXJuIHsgYWN0aW9uOiBcImRlbGV0ZWRcIiwgZGVsZXRlZFN0dWI6IHRydWUgfTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbWlzc2luZ1JlY29yZCA9IHRoaXMubWFya01pc3NpbmdMYXp5UmVtb3RlKGZpbGUucGF0aCk7XG4gICAgICBpZiAobWlzc2luZ1JlY29yZC5taXNzQ291bnQgPj0gdGhpcy5taXNzaW5nTGF6eVJlbW90ZUNvbmZpcm1hdGlvbnMpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5yZW1vdmVMb2NhbFZhdWx0RmlsZShmaWxlKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICAgIHRoaXMuY2xlYXJNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgICByZXR1cm4geyBhY3Rpb246IFwiZGVsZXRlZFwiLCBkZWxldGVkU3R1YjogdHJ1ZSwgcHVyZ2VkTWlzc2luZzogdHJ1ZSB9O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4geyBhY3Rpb246IFwibWlzc2luZ1wiIH07XG4gICAgfVxuXG4gICAgdGhpcy5jbGVhck1pc3NpbmdMYXp5UmVtb3RlKGZpbGUucGF0aCk7XG4gICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KGZpbGUucGF0aCwgcmVtb3RlLCBmaWxlKTtcbiAgICBjb25zdCByZWZyZXNoZWQgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChmaWxlLnBhdGgpO1xuICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgIGxvY2FsU2lnbmF0dXJlOiByZWZyZXNoZWQgPyB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkU3luY1NpZ25hdHVyZShyZWZyZXNoZWQpIDogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgIHJlbW90ZVNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgIHJlbW90ZVBhdGg6IHN0dWIucmVtb3RlUGF0aCxcbiAgICB9KTtcbiAgICByZXR1cm4geyBhY3Rpb246IFwicmVzdG9yZWRcIiB9O1xuICB9XG5cbiAgcHJpdmF0ZSBwYXJzZU5vdGVTdHViKGNvbnRlbnQ6IHN0cmluZykge1xuICAgIGNvbnN0IG1hdGNoID0gY29udGVudC5tYXRjaChcbiAgICAgIC9ePCEtLVxccypzZWN1cmUtd2ViZGF2LW5vdGUtc3R1YlxccypcXHI/XFxucmVtb3RlOlxccyooLis/KVxccj9cXG5wbGFjZWhvbGRlcjpcXHMqKC4qPylcXHI/XFxuLS0+L3MsXG4gICAgKTtcbiAgICBpZiAoIW1hdGNoKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgcmVtb3RlUGF0aDogbWF0Y2hbMV0udHJpbSgpLFxuICAgICAgcGxhY2Vob2xkZXI6IG1hdGNoWzJdLnRyaW0oKSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZE5vdGVTdHViKGZpbGU6IFRGaWxlKSB7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgcmV0dXJuIFtcbiAgICAgIGA8IS0tICR7U0VDVVJFX05PVEVfU1RVQn1gLFxuICAgICAgYHJlbW90ZTogJHtyZW1vdGVQYXRofWAsXG4gICAgICBgcGxhY2Vob2xkZXI6ICR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgXCItLT5cIixcbiAgICAgIFwiXCIsXG4gICAgICB0aGlzLnQoXG4gICAgICAgIGBcdThGRDlcdTY2MkZcdTRFMDBcdTdCQzdcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTdCMTRcdThCQjBcdTc2ODRcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTY1ODdcdTRFRjZcdTMwMDJcdTYyNTNcdTVGMDBcdThGRDlcdTdCQzdcdTdCMTRcdThCQjBcdTY1RjZcdUZGMENcdTYzRDJcdTRFRjZcdTRGMUFcdTRFQ0VcdThGRENcdTdBRUZcdTU0MENcdTZCNjVcdTc2RUVcdTVGNTVcdTYwNjJcdTU5MERcdTVCOENcdTY1NzRcdTUxODVcdTVCQjlcdTMwMDJgLFxuICAgICAgICBgVGhpcyBpcyBhIGxvY2FsIHBsYWNlaG9sZGVyIGZvciBhbiBvbi1kZW1hbmQgbm90ZS4gT3BlbmluZyB0aGUgbm90ZSByZXN0b3JlcyB0aGUgZnVsbCBjb250ZW50IGZyb20gdGhlIHJlbW90ZSBzeW5jIGZvbGRlci5gLFxuICAgICAgKSxcbiAgICBdLmpvaW4oXCJcXG5cIik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGV2aWN0U3RhbGVTeW5jZWROb3RlcyhzaG93Tm90aWNlOiBib29sZWFuKSB7XG4gICAgdHJ5IHtcbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLm5vdGVTdG9yYWdlTW9kZSAhPT0gXCJsYXp5LW5vdGVzXCIpIHtcbiAgICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NUY1M1x1NTI0RFx1NjcyQVx1NTQyRlx1NzUyOFx1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFx1NkEyMVx1NUYwRlx1MzAwMlwiLCBcIkxhenkgbm90ZSBtb2RlIGlzIG5vdCBlbmFibGVkLlwiKSwgNjAwMCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGZpbGVzID0gdGhpcy5zeW5jU3VwcG9ydC5jb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKS5maWx0ZXIoKGZpbGUpID0+IGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpO1xuICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICAgIGNvbnN0IHRocmVzaG9sZCA9IE1hdGgubWF4KDEsIHRoaXMuc2V0dGluZ3Mubm90ZUV2aWN0QWZ0ZXJEYXlzKSAqIDI0ICogNjAgKiA2MCAqIDEwMDA7XG4gICAgICBsZXQgZXZpY3RlZCA9IDA7XG5cbiAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuICAgICAgICBjb25zdCBhY3RpdmUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xuICAgICAgICBpZiAoYWN0aXZlPy5wYXRoID09PSBmaWxlLnBhdGgpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGxhc3RBY2Nlc3MgPSB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzLmdldChmaWxlLnBhdGgpID8/IDA7XG4gICAgICAgIGlmIChsYXN0QWNjZXNzICE9PSAwICYmIG5vdyAtIGxhc3RBY2Nlc3MgPCB0aHJlc2hvbGQpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICBpZiAodGhpcy5wYXJzZU5vdGVTdHViKGNvbnRlbnQpKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBiaW5hcnkgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5zeW5jU3VwcG9ydC5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgYXdhaXQgdGhpcy51cGxvYWRCaW5hcnkocmVtb3RlUGF0aCwgYmluYXJ5LCBcInRleHQvbWFya2Rvd247IGNoYXJzZXQ9dXRmLThcIik7XG4gICAgICAgIGNvbnN0IHZlcmlmaWVkID0gYXdhaXQgdGhpcy52ZXJpZnlSZW1vdGVCaW5hcnlSb3VuZFRyaXAocmVtb3RlUGF0aCwgYmluYXJ5KTtcbiAgICAgICAgaWYgKCF2ZXJpZmllZCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTY4MjFcdTlBOENcdTU5MzFcdThEMjVcdUZGMENcdTVERjJcdTUzRDZcdTZEODhcdTU2REVcdTY1MzZcdTY3MkNcdTU3MzBcdTdCMTRcdThCQjBcdTMwMDJcIiwgXCJSZW1vdGUgbm90ZSB2ZXJpZmljYXRpb24gZmFpbGVkLCBsb2NhbCBub3RlIGV2aWN0aW9uIHdhcyBjYW5jZWxsZWQuXCIpKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZW1vdGUgPSBhd2FpdCB0aGlzLnN0YXRSZW1vdGVGaWxlKHJlbW90ZVBhdGgpO1xuICAgICAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTUxNDNcdTY1NzBcdTYzNkVcdTdGM0FcdTU5MzFcdUZGMENcdTVERjJcdTUzRDZcdTZEODhcdTU2REVcdTY1MzZcdTY3MkNcdTU3MzBcdTdCMTRcdThCQjBcdTMwMDJcIiwgXCJSZW1vdGUgbm90ZSBtZXRhZGF0YSBpcyBtaXNzaW5nLCBsb2NhbCBub3RlIGV2aWN0aW9uIHdhcyBjYW5jZWxsZWQuXCIpKTtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdGhpcy5idWlsZE5vdGVTdHViKGZpbGUpKTtcbiAgICAgICAgY29uc3QgcmVmcmVzaGVkID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZWZyZXNoZWQgPyB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkU3luY1NpZ25hdHVyZShyZWZyZXNoZWQpIDogdGhpcy5zeW5jU3VwcG9ydC5idWlsZFN5bmNTaWduYXR1cmUoZmlsZSksXG4gICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiByZW1vdGU/LnNpZ25hdHVyZSA/PyBgJHtmaWxlLnN0YXQubXRpbWV9OiR7YmluYXJ5LmJ5dGVMZW5ndGh9YCxcbiAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICB9KTtcbiAgICAgICAgZXZpY3RlZCArPSAxO1xuICAgICAgfVxuXG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKFxuICAgICAgICAgIHRoaXMudChcbiAgICAgICAgICAgIGBcdTVERjJcdTU2REVcdTY1MzYgJHtldmljdGVkfSBcdTdCQzdcdTk1N0ZcdTY3MUZcdTY3MkFcdThCQkZcdTk1RUVcdTc2ODRcdTY3MkNcdTU3MzBcdTdCMTRcdThCQjBcdTMwMDJgLFxuICAgICAgICAgICAgYEV2aWN0ZWQgJHtldmljdGVkfSBzdGFsZSBsb2NhbCBub3RlKHMpLmAsXG4gICAgICAgICAgKSxcbiAgICAgICAgICA4MDAwLFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIHJldHVybiBldmljdGVkO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGV2aWN0IHN0YWxlIHN5bmNlZCBub3Rlc1wiLCBlcnJvcik7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTU2REVcdTY1MzZcdTY3MkNcdTU3MzBcdTdCMTRcdThCQjBcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gZXZpY3QgbG9jYWwgbm90ZXNcIiksIGVycm9yKSwgODAwMCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gMDtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGVuc3VyZVJlbW90ZURpcmVjdG9yaWVzKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHBhcnRzID0gcmVtb3RlUGF0aC5zcGxpdChcIi9cIikuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUubGVuZ3RoID4gMCk7XG4gICAgaWYgKHBhcnRzLmxlbmd0aCA8PSAxKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGV0IGN1cnJlbnQgPSBcIlwiO1xuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBwYXJ0cy5sZW5ndGggLSAxOyBpbmRleCArPSAxKSB7XG4gICAgICBjdXJyZW50ID0gY3VycmVudCA/IGAke2N1cnJlbnR9LyR7cGFydHNbaW5kZXhdfWAgOiBwYXJ0c1tpbmRleF07XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChjdXJyZW50KSxcbiAgICAgICAgbWV0aG9kOiBcIk1LQ09MXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGlmICghWzIwMCwgMjAxLCAyMDQsIDIwNywgMzAxLCAzMDIsIDMwNywgMzA4LCA0MDVdLmluY2x1ZGVzKHJlc3BvbnNlLnN0YXR1cykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBNS0NPTCBmYWlsZWQgZm9yICR7Y3VycmVudH0gd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBsaXN0UmVtb3RlVHJlZShyb290Rm9sZGVyOiBzdHJpbmcpOiBQcm9taXNlPFJlbW90ZUludmVudG9yeT4ge1xuICAgIGNvbnN0IGZpbGVzID0gbmV3IE1hcDxzdHJpbmcsIFJlbW90ZUZpbGVTdGF0ZT4oKTtcbiAgICBjb25zdCBkaXJlY3RvcmllcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IHBlbmRpbmcgPSBbbm9ybWFsaXplRm9sZGVyKHJvb3RGb2xkZXIpXTtcbiAgICBjb25zdCB2aXNpdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbiAgICB3aGlsZSAocGVuZGluZy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBjdXJyZW50ID0gbm9ybWFsaXplRm9sZGVyKHBlbmRpbmcucG9wKCkgPz8gcm9vdEZvbGRlcik7XG4gICAgICBpZiAodmlzaXRlZC5oYXMoY3VycmVudCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHZpc2l0ZWQuYWRkKGN1cnJlbnQpO1xuICAgICAgY29uc3QgZW50cmllcyA9IGF3YWl0IHRoaXMubGlzdFJlbW90ZURpcmVjdG9yeShjdXJyZW50KTtcbiAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgICAgICBpZiAoZW50cnkuaXNDb2xsZWN0aW9uKSB7XG4gICAgICAgICAgZGlyZWN0b3JpZXMuYWRkKGVudHJ5LnJlbW90ZVBhdGgpO1xuICAgICAgICAgIHBlbmRpbmcucHVzaChlbnRyeS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlbnRyeS5maWxlKSB7XG4gICAgICAgICAgZmlsZXMuc2V0KGVudHJ5LnJlbW90ZVBhdGgsIGVudHJ5LmZpbGUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgZmlsZXMsIGRpcmVjdG9yaWVzIH07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGxpc3RSZW1vdGVEaXJlY3RvcnkocmVtb3RlRGlyZWN0b3J5OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXF1ZXN0ZWRQYXRoID0gbm9ybWFsaXplRm9sZGVyKHJlbW90ZURpcmVjdG9yeSk7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlcXVlc3RlZFBhdGgpLFxuICAgICAgbWV0aG9kOiBcIlBST1BGSU5EXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIERlcHRoOiBcIjFcIixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MDQpIHtcbiAgICAgIHJldHVybiBbXSBhcyBBcnJheTx7IHJlbW90ZVBhdGg6IHN0cmluZzsgaXNDb2xsZWN0aW9uOiBib29sZWFuOyBmaWxlPzogUmVtb3RlRmlsZVN0YXRlIH0+O1xuICAgIH1cblxuICAgIHRoaXMuYXNzZXJ0UmVzcG9uc2VTdWNjZXNzKHJlc3BvbnNlLCBgUFJPUEZJTkQgZm9yICR7cmVxdWVzdGVkUGF0aH1gKTtcblxuICAgIGNvbnN0IHhtbFRleHQgPSB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpO1xuICAgIHJldHVybiB0aGlzLnBhcnNlUHJvcGZpbmREaXJlY3RvcnlMaXN0aW5nKHhtbFRleHQsIHJlcXVlc3RlZFBhdGgpO1xuICB9XG5cbiAgcHJpdmF0ZSBwYXJzZVByb3BmaW5kRGlyZWN0b3J5TGlzdGluZyh4bWxUZXh0OiBzdHJpbmcsIHJlcXVlc3RlZFBhdGg6IHN0cmluZywgaW5jbHVkZVJlcXVlc3RlZCA9IGZhbHNlKSB7XG4gICAgY29uc3QgcGFyc2VyID0gbmV3IERPTVBhcnNlcigpO1xuICAgIGNvbnN0IGRvY3VtZW50ID0gcGFyc2VyLnBhcnNlRnJvbVN0cmluZyh4bWxUZXh0LCBcImFwcGxpY2F0aW9uL3htbFwiKTtcbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJwYXJzZXJlcnJvclwiKS5sZW5ndGggPiAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy50KFwiXHU2NUUwXHU2Q0Q1XHU4OUUzXHU2NzkwIFdlYkRBViBcdTc2RUVcdTVGNTVcdTZFMDVcdTUzNTVcdTMwMDJcIiwgXCJGYWlsZWQgdG8gcGFyc2UgdGhlIFdlYkRBViBkaXJlY3RvcnkgbGlzdGluZy5cIikpO1xuICAgIH1cblxuICAgIGNvbnN0IGVudHJpZXMgPSBuZXcgTWFwPHN0cmluZywgeyByZW1vdGVQYXRoOiBzdHJpbmc7IGlzQ29sbGVjdGlvbjogYm9vbGVhbjsgZmlsZT86IFJlbW90ZUZpbGVTdGF0ZSB9PigpO1xuICAgIGZvciAoY29uc3QgZWxlbWVudCBvZiBBcnJheS5mcm9tKGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiKlwiKSkpIHtcbiAgICAgIGlmIChlbGVtZW50LmxvY2FsTmFtZSAhPT0gXCJyZXNwb25zZVwiKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBocmVmID0gdGhpcy5nZXRYbWxMb2NhbE5hbWVUZXh0KGVsZW1lbnQsIFwiaHJlZlwiKTtcbiAgICAgIGlmICghaHJlZikge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuaHJlZlRvUmVtb3RlUGF0aChocmVmKTtcbiAgICAgIGlmICghcmVtb3RlUGF0aCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaXNDb2xsZWN0aW9uID0gdGhpcy54bWxUcmVlSGFzTG9jYWxOYW1lKGVsZW1lbnQsIFwiY29sbGVjdGlvblwiKTtcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gaXNDb2xsZWN0aW9uID8gbm9ybWFsaXplRm9sZGVyKHJlbW90ZVBhdGgpIDogcmVtb3RlUGF0aC5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpO1xuICAgICAgaWYgKFxuICAgICAgICAhaW5jbHVkZVJlcXVlc3RlZCAmJlxuICAgICAgICAoXG4gICAgICAgICAgbm9ybWFsaXplZFBhdGggPT09IHJlcXVlc3RlZFBhdGggfHxcbiAgICAgICAgICBub3JtYWxpemVkUGF0aCA9PT0gcmVxdWVzdGVkUGF0aC5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpXG4gICAgICAgIClcbiAgICAgICkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc2l6ZVRleHQgPSB0aGlzLmdldFhtbExvY2FsTmFtZVRleHQoZWxlbWVudCwgXCJnZXRjb250ZW50bGVuZ3RoXCIpO1xuICAgICAgY29uc3QgcGFyc2VkU2l6ZSA9IE51bWJlci5wYXJzZUludChzaXplVGV4dCwgMTApO1xuICAgICAgY29uc3Qgc2l6ZSA9IE51bWJlci5pc0Zpbml0ZShwYXJzZWRTaXplKSA/IHBhcnNlZFNpemUgOiAwO1xuICAgICAgY29uc3QgbW9kaWZpZWRUZXh0ID0gdGhpcy5nZXRYbWxMb2NhbE5hbWVUZXh0KGVsZW1lbnQsIFwiZ2V0bGFzdG1vZGlmaWVkXCIpO1xuICAgICAgY29uc3QgcGFyc2VkTXRpbWUgPSBEYXRlLnBhcnNlKG1vZGlmaWVkVGV4dCk7XG4gICAgICBjb25zdCBsYXN0TW9kaWZpZWQgPSBOdW1iZXIuaXNGaW5pdGUocGFyc2VkTXRpbWUpID8gcGFyc2VkTXRpbWUgOiAwO1xuXG4gICAgICBlbnRyaWVzLnNldChub3JtYWxpemVkUGF0aCwge1xuICAgICAgICByZW1vdGVQYXRoOiBub3JtYWxpemVkUGF0aCxcbiAgICAgICAgaXNDb2xsZWN0aW9uLFxuICAgICAgICBmaWxlOiBpc0NvbGxlY3Rpb25cbiAgICAgICAgICA/IHVuZGVmaW5lZFxuICAgICAgICAgIDoge1xuICAgICAgICAgICAgICByZW1vdGVQYXRoOiBub3JtYWxpemVkUGF0aCxcbiAgICAgICAgICAgICAgbGFzdE1vZGlmaWVkLFxuICAgICAgICAgICAgICBzaXplLFxuICAgICAgICAgICAgICBzaWduYXR1cmU6IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRSZW1vdGVTeW5jU2lnbmF0dXJlKHtcbiAgICAgICAgICAgICAgICBsYXN0TW9kaWZpZWQsXG4gICAgICAgICAgICAgICAgc2l6ZSxcbiAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIFsuLi5lbnRyaWVzLnZhbHVlcygpXTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0WG1sTG9jYWxOYW1lVGV4dChwYXJlbnQ6IEVsZW1lbnQsIGxvY2FsTmFtZTogc3RyaW5nKSB7XG4gICAgZm9yIChjb25zdCBlbGVtZW50IG9mIEFycmF5LmZyb20ocGFyZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiKlwiKSkpIHtcbiAgICAgIGlmIChlbGVtZW50LmxvY2FsTmFtZSA9PT0gbG9jYWxOYW1lKSB7XG4gICAgICAgIHJldHVybiBlbGVtZW50LnRleHRDb250ZW50Py50cmltKCkgPz8gXCJcIjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuXG4gIHByaXZhdGUgeG1sVHJlZUhhc0xvY2FsTmFtZShwYXJlbnQ6IEVsZW1lbnQsIGxvY2FsTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20ocGFyZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiKlwiKSkuc29tZSgoZWxlbWVudCkgPT4gZWxlbWVudC5sb2NhbE5hbWUgPT09IGxvY2FsTmFtZSk7XG4gIH1cblxuICBwcml2YXRlIGhyZWZUb1JlbW90ZVBhdGgoaHJlZjogc3RyaW5nKSB7XG4gICAgY29uc3QgYmFzZVVybCA9IGAke3RoaXMuc2V0dGluZ3Mud2ViZGF2VXJsLnJlcGxhY2UoL1xcLyskLywgXCJcIil9L2A7XG4gICAgY29uc3QgcmVzb2x2ZWQgPSBuZXcgVVJMKGhyZWYsIGJhc2VVcmwpO1xuICAgIGNvbnN0IGJhc2VQYXRoID0gbmV3IFVSTChiYXNlVXJsKS5wYXRobmFtZS5yZXBsYWNlKC9cXC8rJC8sIFwiL1wiKTtcbiAgICBjb25zdCBkZWNvZGVkUGF0aCA9IHRoaXMuZGVjb2RlUGF0aG5hbWUocmVzb2x2ZWQucGF0aG5hbWUpO1xuICAgIGlmICghZGVjb2RlZFBhdGguc3RhcnRzV2l0aChiYXNlUGF0aCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiBkZWNvZGVkUGF0aC5zbGljZShiYXNlUGF0aC5sZW5ndGgpLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG4gIH1cblxuICBwcml2YXRlIGRlY29kZVBhdGhuYW1lKHBhdGhuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gcGF0aG5hbWVcbiAgICAgIC5zcGxpdChcIi9cIilcbiAgICAgIC5tYXAoKHNlZ21lbnQpID0+IHtcbiAgICAgICAgaWYgKCFzZWdtZW50KSB7XG4gICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoc2VnbWVudCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIHJldHVybiBzZWdtZW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmpvaW4oXCIvXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZEV4cGVjdGVkUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlRmlsZVBhdGhzOiBTZXQ8c3RyaW5nPiwgcm9vdEZvbGRlcjogc3RyaW5nKSB7XG4gICAgY29uc3QgZXhwZWN0ZWQgPSBuZXcgU2V0PHN0cmluZz4oW25vcm1hbGl6ZUZvbGRlcihyb290Rm9sZGVyKV0pO1xuICAgIGZvciAoY29uc3QgcmVtb3RlUGF0aCBvZiByZW1vdGVGaWxlUGF0aHMpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gcmVtb3RlUGF0aC5zcGxpdChcIi9cIikuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUubGVuZ3RoID4gMCk7XG4gICAgICBsZXQgY3VycmVudCA9IFwiXCI7XG4gICAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgcGFydHMubGVuZ3RoIC0gMTsgaW5kZXggKz0gMSkge1xuICAgICAgICBjdXJyZW50ID0gY3VycmVudCA/IGAke2N1cnJlbnR9LyR7cGFydHNbaW5kZXhdfWAgOiBwYXJ0c1tpbmRleF07XG4gICAgICAgIGV4cGVjdGVkLmFkZChub3JtYWxpemVGb2xkZXIoY3VycmVudCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBleHBlY3RlZDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVjb25jaWxlRGlyZWN0b3JpZXMocmVtb3RlRGlyZWN0b3JpZXM6IFNldDxzdHJpbmc+KSB7XG4gICAgY29uc3Qgc3RhdHMgPSB7IGNyZWF0ZWRMb2NhbDogMCwgY3JlYXRlZFJlbW90ZTogMCwgZGVsZXRlZExvY2FsOiAwLCBkZWxldGVkUmVtb3RlOiAwIH07XG5cbiAgICBjb25zdCByZW1vdGVMb2NhbFBhdGhzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgZm9yIChjb25zdCByZW1vdGVEaXIgb2YgcmVtb3RlRGlyZWN0b3JpZXMpIHtcbiAgICAgIGNvbnN0IGxvY2FsUGF0aCA9IHRoaXMuc3luY1N1cHBvcnQucmVtb3RlUGF0aFRvVmF1bHRQYXRoKHJlbW90ZURpcik7XG4gICAgICBpZiAobG9jYWxQYXRoICE9PSBudWxsICYmIGxvY2FsUGF0aC5sZW5ndGggPiAwICYmICF0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBEaXJlY3RvcnlTeW5jUGF0aChsb2NhbFBhdGgpKSB7XG4gICAgICAgIHJlbW90ZUxvY2FsUGF0aHMuYWRkKG5vcm1hbGl6ZVBhdGgobG9jYWxQYXRoKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgbG9jYWxEaXJQYXRocyA9IHRoaXMuc3luY1N1cHBvcnQuY29sbGVjdExvY2FsU3luY2VkRGlyZWN0b3JpZXMoKTtcbiAgICBjb25zdCBrbm93bkRpclBhdGhzID0gdGhpcy5zeW5jZWREaXJlY3RvcmllcztcbiAgICBjb25zdCBuZXdTeW5jZWREaXJzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbiAgICBjb25zdCBsb2NhbE9ubHkgPSBbLi4ubG9jYWxEaXJQYXRoc10uZmlsdGVyKChwKSA9PiAhcmVtb3RlTG9jYWxQYXRocy5oYXMocCkpO1xuICAgIGNvbnN0IHJlbW90ZU9ubHkgPSBbLi4ucmVtb3RlTG9jYWxQYXRoc10uZmlsdGVyKChwKSA9PiAhbG9jYWxEaXJQYXRocy5oYXMocCkpO1xuXG4gICAgLy8gTG9jYWwtb25seSBkaXJlY3RvcmllcyBhcmUga2VwdCBsb2NhbGx5IGFuZCBjcmVhdGVkIHJlbW90ZWx5IGlmIG5lZWRlZC5cbiAgICBmb3IgKGNvbnN0IGRpclBhdGggb2YgWy4uLmxvY2FsT25seV0uc29ydCgoYSwgYikgPT4gYS5sZW5ndGggLSBiLmxlbmd0aCkpIHtcbiAgICAgIGNvbnN0IHJlbW90ZURpciA9IG5vcm1hbGl6ZUZvbGRlcih0aGlzLnNldHRpbmdzLnZhdWx0U3luY1JlbW90ZUZvbGRlcikgKyBkaXJQYXRoO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5lbnN1cmVSZW1vdGVEaXJlY3RvcmllcyhyZW1vdGVEaXIpO1xuICAgICAgICBzdGF0cy5jcmVhdGVkUmVtb3RlICs9IDE7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gRGlyZWN0b3J5IGNyZWF0aW9uIGZhaWx1cmVzIHNob3VsZCBub3QgbWFrZSByZWNvbmNpbGUgZGVzdHJ1Y3RpdmUuXG4gICAgICB9XG4gICAgICBuZXdTeW5jZWREaXJzLmFkZChkaXJQYXRoKTtcbiAgICB9XG5cbiAgICAvLyBCb3RoIHNpZGVzIGV4aXN0IFx1MjE5MiBrZWVwXG4gICAgZm9yIChjb25zdCBkaXJQYXRoIG9mIGxvY2FsRGlyUGF0aHMpIHtcbiAgICAgIGlmIChyZW1vdGVMb2NhbFBhdGhzLmhhcyhkaXJQYXRoKSkge1xuICAgICAgICBuZXdTeW5jZWREaXJzLmFkZChkaXJQYXRoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSZW1vdGUtb25seSBkaXJlY3RvcmllcyBhcmUga2VwdCByZW1vdGVseSBhbmQgcmVjcmVhdGVkIGxvY2FsbHkgaWYgbmVlZGVkLlxuICAgIGZvciAoY29uc3QgZGlyUGF0aCBvZiBbLi4ucmVtb3RlT25seV0uc29ydCgoYSwgYikgPT4gYS5sZW5ndGggLSBiLmxlbmd0aCkpIHtcbiAgICAgIGlmICghKGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIuZXhpc3RzKGRpclBhdGgpKSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIubWtkaXIoZGlyUGF0aCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBjb25zdCBtc2cgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSk7XG4gICAgICAgICAgaWYgKCFtc2cuaW5jbHVkZXMoXCJhbHJlYWR5IGV4aXN0c1wiKSkge1xuICAgICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHN0YXRzLmNyZWF0ZWRMb2NhbCArPSAxO1xuICAgICAgbmV3U3luY2VkRGlycy5hZGQoZGlyUGF0aCk7XG4gICAgfVxuXG4gICAgdGhpcy5zeW5jZWREaXJlY3RvcmllcyA9IG5ld1N5bmNlZERpcnM7XG4gICAgcmV0dXJuIHN0YXRzO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVFeHRyYVJlbW90ZURpcmVjdG9yaWVzKHJlbW90ZURpcmVjdG9yaWVzOiBTZXQ8c3RyaW5nPiwgZXhwZWN0ZWREaXJlY3RvcmllczogU2V0PHN0cmluZz4pIHtcbiAgICBsZXQgZGVsZXRlZCA9IDA7XG4gICAgY29uc3QgY2FuZGlkYXRlcyA9IFsuLi5yZW1vdGVEaXJlY3Rvcmllc11cbiAgICAgIC5maWx0ZXIoKHJlbW90ZVBhdGgpID0+ICFleHBlY3RlZERpcmVjdG9yaWVzLmhhcyhyZW1vdGVQYXRoKSlcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBiLmxlbmd0aCAtIGEubGVuZ3RoIHx8IGIubG9jYWxlQ29tcGFyZShhKSk7XG5cbiAgICBmb3IgKGNvbnN0IHJlbW90ZVBhdGggb2YgY2FuZGlkYXRlcykge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICAgIG1ldGhvZDogXCJERUxFVEVcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgaWYgKFsyMDAsIDIwMiwgMjA0LCA0MDRdLmluY2x1ZGVzKHJlc3BvbnNlLnN0YXR1cykpIHtcbiAgICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gNDA0KSB7XG4gICAgICAgICAgZGVsZXRlZCArPSAxO1xuICAgICAgICB9XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoWzQwNSwgNDA5XS5pbmNsdWRlcyhyZXNwb25zZS5zdGF0dXMpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYERFTEVURSBkaXJlY3RvcnkgZmFpbGVkIGZvciAke3JlbW90ZVBhdGh9IHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIH1cblxuICAgIHJldHVybiBkZWxldGVkO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzUGVuZGluZ1Rhc2tzKCkge1xuXG4gICAgYXdhaXQgdGhpcy51cGxvYWRRdWV1ZS5wcm9jZXNzUGVuZGluZ1Rhc2tzKCk7XG4gIH1cblxuICBwcml2YXRlIHRyYWNrVmF1bHRNdXRhdGlvbihvcGVyYXRpb246ICgpID0+IFByb21pc2U8dm9pZD4pIHtcbiAgICBjb25zdCBwcm9taXNlID0gb3BlcmF0aW9uKClcbiAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIlNlY3VyZSBXZWJEQVYgdmF1bHQgbXV0YXRpb24gaGFuZGxpbmcgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIH0pXG4gICAgICAuZmluYWxseSgoKSA9PiB7XG4gICAgICAgIHRoaXMucGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlcy5kZWxldGUocHJvbWlzZSk7XG4gICAgICB9KTtcbiAgICB0aGlzLnBlbmRpbmdWYXVsdE11dGF0aW9uUHJvbWlzZXMuYWRkKHByb21pc2UpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB3YWl0Rm9yUGVuZGluZ1ZhdWx0TXV0YXRpb25zKCkge1xuICAgIHdoaWxlICh0aGlzLnBlbmRpbmdWYXVsdE11dGF0aW9uUHJvbWlzZXMuc2l6ZSA+IDApIHtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChbLi4udGhpcy5wZW5kaW5nVmF1bHRNdXRhdGlvblByb21pc2VzXSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwcmVwYXJlUGVuZGluZ1VwbG9hZHNGb3JTeW5jKHNob3dOb3RpY2U6IGJvb2xlYW4pIHtcblxuICAgIGF3YWl0IHRoaXMudXBsb2FkUXVldWUucHJvY2Vzc1BlbmRpbmdUYXNrcygpO1xuXG4gICAgaWYgKHRoaXMudXBsb2FkUXVldWUuaGFzUGVuZGluZ1dvcmsoKSkge1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy50KFxuICAgICAgICBcIlx1NjhDMFx1NkQ0Qlx1NTIzMFx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NEVDRFx1NTcyOFx1OEZEQlx1ODg0Q1x1NjIxNlx1N0I0OVx1NUY4NVx1OTFDRFx1OEJENVx1RkYwQ1x1NURGMlx1NjY4Mlx1N0YxM1x1NjcyQ1x1NkIyMVx1N0IxNFx1OEJCMFx1NTQwQ1x1NkI2NVx1RkYwQ1x1OTA3Rlx1NTE0RFx1NjVFN1x1NzI0OFx1N0IxNFx1OEJCMFx1ODk4Nlx1NzZENlx1NjVCMFx1NTZGRVx1NzI0N1x1NUYxNVx1NzUyOFx1MzAwMlwiLFxuICAgICAgICBcIkltYWdlIHVwbG9hZHMgYXJlIHN0aWxsIHJ1bm5pbmcgb3Igd2FpdGluZyBmb3IgcmV0cnksIHNvIG5vdGUgc3luYyB3YXMgZGVmZXJyZWQgdG8gYXZvaWQgb2xkIG5vdGUgY29udGVudCBvdmVyd3JpdGluZyBuZXcgaW1hZ2UgcmVmZXJlbmNlcy5cIixcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsIDgwMDApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRJbWFnZXNJbk5vdGUobm90ZUZpbGU6IFRGaWxlKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKG5vdGVGaWxlKTtcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50cyA9IGF3YWl0IHRoaXMuYnVpbGRVcGxvYWRSZXBsYWNlbWVudHMoY29udGVudCwgbm90ZUZpbGUpO1xuXG4gICAgICBpZiAocmVwbGFjZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NUY1M1x1NTI0RFx1N0IxNFx1OEJCMFx1NEUyRFx1NkNBMVx1NjcwOVx1NjI3RVx1NTIzMFx1NjcyQ1x1NTczMFx1NTZGRVx1NzI0N1x1MzAwMlwiLCBcIk5vIGxvY2FsIGltYWdlcyBmb3VuZCBpbiB0aGUgY3VycmVudCBub3RlLlwiKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbGV0IHVwZGF0ZWQgPSBjb250ZW50O1xuICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcbiAgICAgICAgdXBkYXRlZCA9IHVwZGF0ZWQuc3BsaXQocmVwbGFjZW1lbnQub3JpZ2luYWwpLmpvaW4ocmVwbGFjZW1lbnQucmV3cml0dGVuKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHVwZGF0ZWQgPT09IGNvbnRlbnQpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdTZDQTFcdTY3MDlcdTk3MDBcdTg5ODFcdTY1MzlcdTUxOTlcdTc2ODRcdTU2RkVcdTcyNDdcdTk0RkVcdTYzQTVcdTMwMDJcIiwgXCJObyBpbWFnZXMgd2VyZSByZXdyaXR0ZW4uXCIpKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkobm90ZUZpbGUsIHVwZGF0ZWQpO1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZUZpbGUucGF0aCwgXCJpbWFnZS1hZGRcIik7XG5cbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLmRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQpIHtcbiAgICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcbiAgICAgICAgICBpZiAocmVwbGFjZW1lbnQuc291cmNlRmlsZSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy50cmFzaElmRXhpc3RzKHJlcGxhY2VtZW50LnNvdXJjZUZpbGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBuZXcgTm90aWNlKHRoaXMudChgXHU1REYyXHU0RTBBXHU0RjIwICR7cmVwbGFjZW1lbnRzLmxlbmd0aH0gXHU1RjIwXHU1NkZFXHU3MjQ3XHU1MjMwIFdlYkRBVlx1MzAwMmAsIGBVcGxvYWRlZCAke3JlcGxhY2VtZW50cy5sZW5ndGh9IGltYWdlKHMpIHRvIFdlYkRBVi5gKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIHVwbG9hZCBmYWlsZWRcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU0RTBBXHU0RjIwXHU1OTMxXHU4RDI1XCIsIFwiVXBsb2FkIGZhaWxlZFwiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHByb2Nlc3NUYXNrKHRhc2s6IFVwbG9hZFRhc2spIHtcblxuICAgIGF3YWl0IHRoaXMudXBsb2FkUXVldWUucHJvY2Vzc1Rhc2sodGFzayk7XG4gIH1cblxuICBwcml2YXRlIGVzY2FwZUh0bWwodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiB2YWx1ZVxuICAgICAgLnJlcGxhY2UoLyYvZywgXCImYW1wO1wiKVxuICAgICAgLnJlcGxhY2UoL1wiL2csIFwiJnF1b3Q7XCIpXG4gICAgICAucmVwbGFjZSgvPC9nLCBcIiZsdDtcIilcbiAgICAgIC5yZXBsYWNlKC8+L2csIFwiJmd0O1wiKTtcbiAgfVxuXG4gIHByaXZhdGUgdW5lc2NhcGVIdG1sKHZhbHVlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdmFsdWVcbiAgICAgIC5yZXBsYWNlKC8mcXVvdDsvZywgXCJcXFwiXCIpXG4gICAgICAucmVwbGFjZSgvJmd0Oy9nLCBcIj5cIilcbiAgICAgIC5yZXBsYWNlKC8mbHQ7L2csIFwiPFwiKVxuICAgICAgLnJlcGxhY2UoLyZhbXA7L2csIFwiJlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmwocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMuYXNzZXJ0UmVzcG9uc2VTdWNjZXNzKHJlc3BvbnNlLCBcIkZldGNoIHNlY3VyZSBpbWFnZVwiKTtcblxuICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbcmVzcG9uc2UuYXJyYXlCdWZmZXJdLCB7XG4gICAgICB0eXBlOiByZXNwb25zZS5oZWFkZXJzW1wiY29udGVudC10eXBlXCJdID8/IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCIsXG4gICAgfSk7XG4gICAgY29uc3QgYmxvYlVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgdGhpcy5ldmljdEJsb2JVcmxzSWZOZWVkZWQoKTtcbiAgICB0aGlzLmJsb2JVcmxzLmFkZChibG9iVXJsKTtcbiAgICByZXR1cm4gYmxvYlVybDtcbiAgfVxuXG4gIHByaXZhdGUgZXZpY3RCbG9iVXJsc0lmTmVlZGVkKCkge1xuICAgIHdoaWxlICh0aGlzLmJsb2JVcmxzLnNpemUgPj0gdGhpcy5tYXhCbG9iVXJscykge1xuICAgICAgY29uc3Qgb2xkZXN0ID0gdGhpcy5ibG9iVXJscy52YWx1ZXMoKS5uZXh0KCkudmFsdWUhO1xuICAgICAgdGhpcy5ibG9iVXJscy5kZWxldGUob2xkZXN0KTtcbiAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwob2xkZXN0KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFycmF5QnVmZmVyVG9CYXNlNjQoYnVmZmVyOiBBcnJheUJ1ZmZlcikge1xuICAgIGNvbnN0IGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKTtcbiAgICBjb25zdCBjaHVua1NpemUgPSAweDgwMDA7XG4gICAgbGV0IGJpbmFyeSA9IFwiXCI7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGJ5dGVzLmxlbmd0aDsgaW5kZXggKz0gY2h1bmtTaXplKSB7XG4gICAgICBjb25zdCBjaHVuayA9IGJ5dGVzLnN1YmFycmF5KGluZGV4LCBpbmRleCArIGNodW5rU2l6ZSk7XG4gICAgICBiaW5hcnkgKz0gU3RyaW5nLmZyb21DaGFyQ29kZSguLi5jaHVuayk7XG4gICAgfVxuICAgIHJldHVybiBidG9hKGJpbmFyeSk7XG4gIH1cblxuICBwcml2YXRlIGJhc2U2NFRvQXJyYXlCdWZmZXIoYmFzZTY0OiBzdHJpbmcpIHtcbiAgICBjb25zdCBiaW5hcnkgPSBhdG9iKGJhc2U2NCk7XG4gICAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShiaW5hcnkubGVuZ3RoKTtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYmluYXJ5Lmxlbmd0aDsgaW5kZXggKz0gMSkge1xuICAgICAgYnl0ZXNbaW5kZXhdID0gYmluYXJ5LmNoYXJDb2RlQXQoaW5kZXgpO1xuICAgIH1cbiAgICByZXR1cm4gYnl0ZXMuYnVmZmVyLnNsaWNlKGJ5dGVzLmJ5dGVPZmZzZXQsIGJ5dGVzLmJ5dGVPZmZzZXQgKyBieXRlcy5ieXRlTGVuZ3RoKSBhcyBBcnJheUJ1ZmZlcjtcbiAgfVxuXG4gIHByaXZhdGUgYXJyYXlCdWZmZXJzRXF1YWwobGVmdDogQXJyYXlCdWZmZXIsIHJpZ2h0OiBBcnJheUJ1ZmZlcikge1xuICAgIGNvbnN0IGEgPSBuZXcgVWludDhBcnJheShsZWZ0KTtcbiAgICBjb25zdCBiID0gbmV3IFVpbnQ4QXJyYXkocmlnaHQpO1xuICAgIGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYS5sZW5ndGg7IGluZGV4ICs9IDEpIHtcbiAgICAgIGlmIChhW2luZGV4XSAhPT0gYltpbmRleF0pIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZENsaXBib2FyZEZpbGVOYW1lKG1pbWVUeXBlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBleHRlbnNpb24gPSBtaW1lVHlwZS5zcGxpdChcIi9cIilbMV0/LnJlcGxhY2UoXCJqcGVnXCIsIFwianBnXCIpIHx8IFwicG5nXCI7XG4gICAgcmV0dXJuIGBwYXN0ZWQtaW1hZ2UtJHtEYXRlLm5vdygpfS4ke2V4dGVuc2lvbn1gO1xuICB9XG5cbiAgcHJpdmF0ZSBlc2NhcGVSZWdFeHAodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgXCJcXFxcJCZcIik7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkUmVtb3RlUGF0aChmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGAke25vcm1hbGl6ZUZvbGRlcih0aGlzLnNldHRpbmdzLnJlbW90ZUZvbGRlcil9JHtmaWxlTmFtZX1gO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBidWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeShmaWxlTmFtZTogc3RyaW5nLCBiaW5hcnk6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgZXh0ZW5zaW9uID0gdGhpcy5nZXRFeHRlbnNpb25Gcm9tRmlsZU5hbWUoZmlsZU5hbWUpO1xuICAgIGlmICh0aGlzLnNldHRpbmdzLm5hbWluZ1N0cmF0ZWd5ID09PSBcImhhc2hcIikge1xuICAgICAgY29uc3QgaGFzaCA9IChhd2FpdCB0aGlzLmNvbXB1dGVTaGEyNTZIZXgoYmluYXJ5KSkuc2xpY2UoMCwgMTYpO1xuICAgICAgcmV0dXJuIGAke2hhc2h9LiR7ZXh0ZW5zaW9ufWA7XG4gICAgfVxuXG4gICAgcmV0dXJuIGAke0RhdGUubm93KCl9LSR7ZmlsZU5hbWV9YDtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgYmFzZSA9IHRoaXMuc2V0dGluZ3Mud2ViZGF2VXJsLnJlcGxhY2UoL1xcLyskLywgXCJcIik7XG4gICAgcmV0dXJuIGAke2Jhc2V9LyR7cmVtb3RlUGF0aC5zcGxpdChcIi9cIikubWFwKGVuY29kZVVSSUNvbXBvbmVudCkuam9pbihcIi9cIil9YDtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRBdXRoSGVhZGVyKCkge1xuICAgIGNvbnN0IHRva2VuID0gdGhpcy5hcnJheUJ1ZmZlclRvQmFzZTY0KHRoaXMuZW5jb2RlVXRmOChgJHt0aGlzLnNldHRpbmdzLnVzZXJuYW1lfToke3RoaXMuc2V0dGluZ3MucGFzc3dvcmR9YCkpO1xuICAgIHJldHVybiBgQmFzaWMgJHt0b2tlbn1gO1xuICB9XG5cbiAgcHJpdmF0ZSBlbnN1cmVDb25maWd1cmVkKCkge1xuICAgIGlmICghdGhpcy5zZXR0aW5ncy53ZWJkYXZVcmwgfHwgIXRoaXMuc2V0dGluZ3MudXNlcm5hbWUgfHwgIXRoaXMuc2V0dGluZ3MucGFzc3dvcmQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJXZWJEQVYgXHU5MTREXHU3RjZFXHU0RTBEXHU1QjhDXHU2NTc0XHUzMDAyXCIsIFwiV2ViREFWIHNldHRpbmdzIGFyZSBpbmNvbXBsZXRlLlwiKSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2U6IHsgc3RhdHVzOiBudW1iZXIgfSwgY29udGV4dDogc3RyaW5nKSB7XG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7Y29udGV4dH0gZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZ2V0TWltZVR5cGUoZXh0ZW5zaW9uOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gTUlNRV9NQVBbZXh0ZW5zaW9uLnRvTG93ZXJDYXNlKCldID8/IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCI7XG4gIH1cblxuICBwcml2YXRlIGdldE1pbWVUeXBlRnJvbUZpbGVOYW1lKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRNaW1lVHlwZSh0aGlzLmdldEV4dGVuc2lvbkZyb21GaWxlTmFtZShmaWxlTmFtZSkpO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRFeHRlbnNpb25Gcm9tRmlsZU5hbWUoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHBpZWNlcyA9IGZpbGVOYW1lLnNwbGl0KFwiLlwiKTtcbiAgICByZXR1cm4gcGllY2VzLmxlbmd0aCA+IDEgPyBwaWVjZXNbcGllY2VzLmxlbmd0aCAtIDFdLnRvTG93ZXJDYXNlKCkgOiBcInBuZ1wiO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwcmVwYXJlVXBsb2FkUGF5bG9hZChiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLmNvbXByZXNzSW1hZ2VzKSB7XG4gICAgICByZXR1cm4geyBiaW5hcnksIG1pbWVUeXBlLCBmaWxlTmFtZSB9O1xuICAgIH1cblxuICAgIGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdGhpcy5jb21wcmVzc0ltYWdlSWZOZWVkZWQoYmluYXJ5LCBtaW1lVHlwZSwgZmlsZU5hbWUpO1xuICAgIHJldHVybiBwcmVwYXJlZCA/PyB7IGJpbmFyeSwgbWltZVR5cGUsIGZpbGVOYW1lIH07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNvbXByZXNzSW1hZ2VJZk5lZWRlZChiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgaWYgKCEvXmltYWdlXFwvKHBuZ3xqcGVnfGpwZ3x3ZWJwKSQvaS50ZXN0KG1pbWVUeXBlKSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgdGhyZXNob2xkQnl0ZXMgPSB0aGlzLnNldHRpbmdzLmNvbXByZXNzVGhyZXNob2xkS2IgKiAxMDI0O1xuICAgIGNvbnN0IHNvdXJjZUJsb2IgPSBuZXcgQmxvYihbYmluYXJ5XSwgeyB0eXBlOiBtaW1lVHlwZSB9KTtcbiAgICBjb25zdCBpbWFnZSA9IGF3YWl0IHRoaXMubG9hZEltYWdlRWxlbWVudChzb3VyY2VCbG9iKTtcbiAgICBjb25zdCBsYXJnZXN0U2lkZSA9IE1hdGgubWF4KGltYWdlLm5hdHVyYWxXaWR0aCwgaW1hZ2UubmF0dXJhbEhlaWdodCk7XG4gICAgY29uc3QgbmVlZHNSZXNpemUgPSBsYXJnZXN0U2lkZSA+IHRoaXMuc2V0dGluZ3MubWF4SW1hZ2VEaW1lbnNpb247XG4gICAgY29uc3QgbmVlZHNDb21wcmVzcyA9IHNvdXJjZUJsb2Iuc2l6ZSA+IHRocmVzaG9sZEJ5dGVzIHx8IG5lZWRzUmVzaXplO1xuICAgIGlmICghbmVlZHNDb21wcmVzcykge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3Qgc2NhbGUgPSBuZWVkc1Jlc2l6ZSA/IHRoaXMuc2V0dGluZ3MubWF4SW1hZ2VEaW1lbnNpb24gLyBsYXJnZXN0U2lkZSA6IDE7XG4gICAgY29uc3QgdGFyZ2V0V2lkdGggPSBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKGltYWdlLm5hdHVyYWxXaWR0aCAqIHNjYWxlKSk7XG4gICAgY29uc3QgdGFyZ2V0SGVpZ2h0ID0gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChpbWFnZS5uYXR1cmFsSGVpZ2h0ICogc2NhbGUpKTtcbiAgICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiY2FudmFzXCIpO1xuICAgIGNhbnZhcy53aWR0aCA9IHRhcmdldFdpZHRoO1xuICAgIGNhbnZhcy5oZWlnaHQgPSB0YXJnZXRIZWlnaHQ7XG4gICAgY29uc3QgY29udGV4dCA9IGNhbnZhcy5nZXRDb250ZXh0KFwiMmRcIik7XG4gICAgaWYgKCFjb250ZXh0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb250ZXh0LmRyYXdJbWFnZShpbWFnZSwgMCwgMCwgdGFyZ2V0V2lkdGgsIHRhcmdldEhlaWdodCk7XG5cbiAgICBjb25zdCBvdXRwdXRNaW1lID0gbWltZVR5cGUudG9Mb3dlckNhc2UoKSA9PT0gXCJpbWFnZS9qcGdcIiA/IFwiaW1hZ2UvanBlZ1wiIDogbWltZVR5cGU7XG4gICAgY29uc3QgcXVhbGl0eSA9IE1hdGgubWF4KDAuNCwgTWF0aC5taW4oMC45OCwgdGhpcy5zZXR0aW5ncy5qcGVnUXVhbGl0eSAvIDEwMCkpO1xuICAgIGNvbnN0IGNvbXByZXNzZWRCbG9iID0gYXdhaXQgbmV3IFByb21pc2U8QmxvYiB8IG51bGw+KChyZXNvbHZlKSA9PiB7XG4gICAgICBjYW52YXMudG9CbG9iKHJlc29sdmUsIG91dHB1dE1pbWUsIHF1YWxpdHkpO1xuICAgIH0pO1xuXG4gICAgaWYgKCFjb21wcmVzc2VkQmxvYikge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaWYgKCFuZWVkc1Jlc2l6ZSAmJiBjb21wcmVzc2VkQmxvYi5zaXplID49IHNvdXJjZUJsb2Iuc2l6ZSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgbmV4dEJpbmFyeSA9IGF3YWl0IGNvbXByZXNzZWRCbG9iLmFycmF5QnVmZmVyKCk7XG4gICAgY29uc3QgbmV4dEV4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uRnJvbU1pbWVUeXBlKG91dHB1dE1pbWUpID8/IHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbUZpbGVOYW1lKGZpbGVOYW1lKTtcbiAgICBjb25zdCBuZXh0RmlsZU5hbWUgPSBmaWxlTmFtZS5yZXBsYWNlKC9cXC5bXi5dKyQvLCBcIlwiKSArIGAuJHtuZXh0RXh0ZW5zaW9ufWA7XG4gICAgcmV0dXJuIHtcbiAgICAgIGJpbmFyeTogbmV4dEJpbmFyeSxcbiAgICAgIG1pbWVUeXBlOiBvdXRwdXRNaW1lLFxuICAgICAgZmlsZU5hbWU6IG5leHRGaWxlTmFtZSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBsb2FkSW1hZ2VFbGVtZW50KGJsb2I6IEJsb2IpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2U8SFRNTEltYWdlRWxlbWVudD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgIGNvbnN0IGltYWdlID0gbmV3IEltYWdlKCk7XG4gICAgICBpbWFnZS5vbmxvYWQgPSAoKSA9PiB7XG4gICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwodXJsKTtcbiAgICAgICAgcmVzb2x2ZShpbWFnZSk7XG4gICAgICB9O1xuICAgICAgaW1hZ2Uub25lcnJvciA9IChlcnJvcikgPT4ge1xuICAgICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9O1xuICAgICAgaW1hZ2Uuc3JjID0gdXJsO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRlbnNpb25Gcm9tTWltZVR5cGUobWltZVR5cGU6IHN0cmluZykge1xuICAgIHJldHVybiBNSU1FX01BUFttaW1lVHlwZV0gPz8gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdHJhc2hJZkV4aXN0cyhmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LnRyYXNoKGZpbGUsIHRydWUpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oXCJGYWlsZWQgdG8gdHJhc2ggbG9jYWwgaW1hZ2UgYWZ0ZXIgdXBsb2FkXCIsIGVycm9yKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGZvcm1hdEVtYmVkTGFiZWwoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLnQoYFx1MzAxMFx1NUI4OVx1NTE2OFx1OEZEQ1x1N0EwQlx1NTZGRVx1NzI0N1x1RkY1QyR7ZmlsZU5hbWV9XHUzMDExYCwgYFtTZWN1cmUgcmVtb3RlIGltYWdlIHwgJHtmaWxlTmFtZX1dYCk7XG4gIH1cblxuICBwcml2YXRlIGZvcm1hdEZhaWxlZExhYmVsKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy50KGBcdTMwMTBcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTU5MzFcdThEMjVcdUZGNUMke2ZpbGVOYW1lfVx1MzAxMWAsIGBbSW1hZ2UgdXBsb2FkIGZhaWxlZCB8ICR7ZmlsZU5hbWV9XWApO1xuICB9XG5cbiAgYXN5bmMgbWlncmF0ZUFsbExlZ2FjeVNlY3VyZUltYWdlcygpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXBsb2FkQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgICAgY29uc3QgY2FuZGlkYXRlTG9jYWxJbWFnZXMgPSBuZXcgTWFwPHN0cmluZywgVEZpbGU+KCk7XG4gICAgICBsZXQgY2hhbmdlZEZpbGVzID0gMDtcbiAgICAgIGZvciAoY29uc3QgZmlsZSBvZiB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkpIHtcbiAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICAgIGNvbnN0IHJlcGxhY2VtZW50cyA9IGF3YWl0IHRoaXMuYnVpbGRVcGxvYWRSZXBsYWNlbWVudHMoY29udGVudCwgZmlsZSwgdXBsb2FkQ2FjaGUpO1xuICAgICAgICBmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIHJlcGxhY2VtZW50cykge1xuICAgICAgICAgIGlmIChyZXBsYWNlbWVudC5zb3VyY2VGaWxlKSB7XG4gICAgICAgICAgICBjYW5kaWRhdGVMb2NhbEltYWdlcy5zZXQocmVwbGFjZW1lbnQuc291cmNlRmlsZS5wYXRoLCByZXBsYWNlbWVudC5zb3VyY2VGaWxlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgdXBkYXRlZCA9IGNvbnRlbnQ7XG4gICAgICAgIGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgcmVwbGFjZW1lbnRzKSB7XG4gICAgICAgICAgdXBkYXRlZCA9IHVwZGF0ZWQuc3BsaXQocmVwbGFjZW1lbnQub3JpZ2luYWwpLmpvaW4ocmVwbGFjZW1lbnQucmV3cml0dGVuKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZWQgPSB1cGRhdGVkXG4gICAgICAgICAgLnJlcGxhY2UoXG4gICAgICAgICAgICAvPHNwYW4gY2xhc3M9XCJzZWN1cmUtd2ViZGF2LWVtYmVkXCIgZGF0YS1zZWN1cmUtd2ViZGF2PVwiKFteXCJdKylcIiBhcmlhLWxhYmVsPVwiKFteXCJdKilcIj4uKj88XFwvc3Bhbj4vZyxcbiAgICAgICAgICAgIChfbWF0Y2gsIHJlbW90ZVBhdGg6IHN0cmluZywgYWx0OiBzdHJpbmcpID0+XG4gICAgICAgICAgICAgIHRoaXMuaW1hZ2VTdXBwb3J0LmJ1aWxkU2VjdXJlSW1hZ2VDb2RlQmxvY2soXG4gICAgICAgICAgICAgICAgdGhpcy51bmVzY2FwZUh0bWwocmVtb3RlUGF0aCksXG4gICAgICAgICAgICAgICAgdGhpcy51bmVzY2FwZUh0bWwoYWx0KSB8fCB0aGlzLnVuZXNjYXBlSHRtbChyZW1vdGVQYXRoKSxcbiAgICAgICAgICAgICAgKSxcbiAgICAgICAgICApXG4gICAgICAgICAgLnJlcGxhY2UoXG4gICAgICAgICAgICAvIVxcW1teXFxdXSpdXFwod2ViZGF2LXNlY3VyZTpcXC9cXC8oW14pXSspXFwpL2csXG4gICAgICAgICAgICAoX21hdGNoLCByZW1vdGVQYXRoOiBzdHJpbmcpID0+XG4gICAgICAgICAgICAgIHRoaXMuaW1hZ2VTdXBwb3J0LmJ1aWxkU2VjdXJlSW1hZ2VDb2RlQmxvY2sodGhpcy51bmVzY2FwZUh0bWwocmVtb3RlUGF0aCksIHRoaXMudW5lc2NhcGVIdG1sKHJlbW90ZVBhdGgpKSxcbiAgICAgICAgICApO1xuXG4gICAgICAgIGlmICh1cGRhdGVkID09PSBjb250ZW50KSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdXBkYXRlZCk7XG4gICAgICAgIGNoYW5nZWRGaWxlcyArPSAxO1xuICAgICAgfVxuXG4gICAgICBpZiAoY2hhbmdlZEZpbGVzID09PSAwKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgXCJcdTY1NzRcdTVFOTNcdTkxQ0NcdTZDQTFcdTY3MDlcdTUzRDFcdTczQjBcdTUzRUZcdThGQzFcdTc5RkJcdTc2ODRcdTY1RTdcdTcyNDhcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTY4MDdcdTdCN0VcdTMwMDJcIixcbiAgICAgICAgICAgIFwiTm8gbGVnYWN5IHNlY3VyZSBpbWFnZSB0YWdzIHdlcmUgZm91bmQgaW4gdGhlIHZhdWx0LlwiLFxuICAgICAgICAgICksXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZGVsZXRlTG9jYWxBZnRlclVwbG9hZCkge1xuICAgICAgICBhd2FpdCB0aGlzLnRyYXNoTWlncmF0ZWRJbWFnZXNJZlNhZmUoY2FuZGlkYXRlTG9jYWxJbWFnZXMpO1xuICAgICAgfVxuXG4gICAgICBuZXcgTm90aWNlKFxuICAgICAgdGhpcy50KFxuICAgICAgICBgXHU1REYyXHU4RkMxXHU3OUZCICR7Y2hhbmdlZEZpbGVzfSBcdTdCQzdcdTdCMTRcdThCQjBcdTUyMzBcdTY1QjBcdTc2ODRcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTRFRTNcdTc4MDFcdTU3NTdcdTY4M0NcdTVGMEZcdTMwMDJgLFxuICAgICAgICBgTWlncmF0ZWQgJHtjaGFuZ2VkRmlsZXN9IG5vdGUocykgdG8gdGhlIG5ldyBzZWN1cmUgaW1hZ2UgY29kZS1ibG9jayBmb3JtYXQuYCxcbiAgICAgICksXG4gICAgICAgIDgwMDAsXG4gICAgICApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIG1pZ3JhdGUgc2VjdXJlIGltYWdlcyB0byBjb2RlIGJsb2Nrc1wiLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdThGQzFcdTc5RkJcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTY4M0NcdTVGMEZcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gbWlncmF0ZSBzZWN1cmUgaW1hZ2UgZm9ybWF0XCIpLCBlcnJvciksIDgwMDApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdHJhc2hNaWdyYXRlZEltYWdlc0lmU2FmZShjYW5kaWRhdGVMb2NhbEltYWdlczogTWFwPHN0cmluZywgVEZpbGU+KSB7XG4gICAgaWYgKGNhbmRpZGF0ZUxvY2FsSW1hZ2VzLnNpemUgPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCByZW1haW5pbmdSZWZzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgZm9yIChjb25zdCBub3RlIG9mIHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKSkge1xuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQobm90ZSk7XG4gICAgICBjb25zdCB3aWtpTWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKC8hXFxbXFxbKFteXFxdXSspXFxdXFxdL2cpXTtcbiAgICAgIGNvbnN0IG1hcmtkb3duTWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKC8hXFxbW15cXF1dKl1cXCgoW14pXSspXFwpL2cpXTtcblxuICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiB3aWtpTWF0Y2hlcykge1xuICAgICAgICBjb25zdCByYXdMaW5rID0gbWF0Y2hbMV0uc3BsaXQoXCJ8XCIpWzBdLnRyaW0oKTtcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5yZXNvbHZlTGlua2VkRmlsZShyYXdMaW5rLCBub3RlLnBhdGgpO1xuICAgICAgICBpZiAodGFyZ2V0ICYmIHRoaXMuaXNJbWFnZUZpbGUodGFyZ2V0KSkge1xuICAgICAgICAgIHJlbWFpbmluZ1JlZnMuYWRkKHRhcmdldC5wYXRoKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIG1hcmtkb3duTWF0Y2hlcykge1xuICAgICAgICBjb25zdCByYXdMaW5rID0gZGVjb2RlVVJJQ29tcG9uZW50KG1hdGNoWzFdLnRyaW0oKS5yZXBsYWNlKC9ePHw+JC9nLCBcIlwiKSk7XG4gICAgICAgIGlmICgvXihodHRwcz86fHdlYmRhdi1zZWN1cmU6fGRhdGE6KS9pLnRlc3QocmF3TGluaykpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMucmVzb2x2ZUxpbmtlZEZpbGUocmF3TGluaywgbm90ZS5wYXRoKTtcbiAgICAgICAgaWYgKHRhcmdldCAmJiB0aGlzLmlzSW1hZ2VGaWxlKHRhcmdldCkpIHtcbiAgICAgICAgICByZW1haW5pbmdSZWZzLmFkZCh0YXJnZXQucGF0aCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IFtwYXRoLCBmaWxlXSBvZiBjYW5kaWRhdGVMb2NhbEltYWdlcy5lbnRyaWVzKCkpIHtcbiAgICAgIGlmIChyZW1haW5pbmdSZWZzLmhhcyhwYXRoKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy50cmFzaElmRXhpc3RzKGZpbGUpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJ1bkNvbm5lY3Rpb25UZXN0KHNob3dNb2RhbCA9IGZhbHNlKSB7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xuXG4gICAgICBjb25zdCBwcm9iZU5hbWUgPSBgLnNlY3VyZS13ZWJkYXYtcHJvYmUtJHtEYXRlLm5vdygpfS50eHRgO1xuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRSZW1vdGVQYXRoKHByb2JlTmFtZSk7XG4gICAgICBjb25zdCB1cGxvYWRVcmwgPSB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpO1xuICAgICAgY29uc3QgcHJvYmVBcnJheUJ1ZmZlciA9IHRoaXMuZW5jb2RlVXRmOChgc2VjdXJlLXdlYmRhdiBwcm9iZSAke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKX1gKTtcblxuICAgICAgY29uc3QgcHV0UmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHVwbG9hZFVybCxcbiAgICAgICAgbWV0aG9kOiBcIlBVVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcInRleHQvcGxhaW47IGNoYXJzZXQ9dXRmLThcIixcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogcHJvYmVBcnJheUJ1ZmZlcixcbiAgICAgIH0pO1xuICAgICAgaWYgKHB1dFJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCBwdXRSZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgUFVUIGZhaWxlZCB3aXRoIHN0YXR1cyAke3B1dFJlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZ2V0UmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHVwbG9hZFVybCxcbiAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgaWYgKGdldFJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCBnZXRSZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgR0VUIGZhaWxlZCB3aXRoIHN0YXR1cyAke2dldFJlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZGVsZXRlUmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHVwbG9hZFVybCxcbiAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgaWYgKGRlbGV0ZVJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCBkZWxldGVSZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgREVMRVRFIGZhaWxlZCB3aXRoIHN0YXR1cyAke2RlbGV0ZVJlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbWVzc2FnZSA9IHRoaXMudChcbiAgICAgICAgYFdlYkRBViBcdTZENEJcdThCRDVcdTkwMUFcdThGQzdcdTMwMDJQVVQgJHtwdXRSZXNwb25zZS5zdGF0dXN9XHVGRjBDR0VUICR7Z2V0UmVzcG9uc2Uuc3RhdHVzfVx1RkYwQ0RFTEVURSAke2RlbGV0ZVJlc3BvbnNlLnN0YXR1c31cdTMwMDJgLFxuICAgICAgICBgV2ViREFWIHRlc3QgcGFzc2VkLiBQVVQgJHtwdXRSZXNwb25zZS5zdGF0dXN9LCBHRVQgJHtnZXRSZXNwb25zZS5zdGF0dXN9LCBERUxFVEUgJHtkZWxldGVSZXNwb25zZS5zdGF0dXN9LmAsXG4gICAgICApO1xuICAgICAgbmV3IE5vdGljZShtZXNzYWdlLCA2MDAwKTtcbiAgICAgIGlmIChzaG93TW9kYWwpIHtcbiAgICAgICAgbmV3IFJlc3VsdE1vZGFsKHRoaXMuYXBwLCB0aGlzLnQoXCJXZWJEQVYgXHU4RkRFXHU2M0E1XCIsIFwiV2ViREFWIENvbm5lY3Rpb25cIiksIG1lc3NhZ2UpLm9wZW4oKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiU2VjdXJlIFdlYkRBViB0ZXN0IGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICBjb25zdCBtZXNzYWdlID0gdGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIldlYkRBViBcdTZENEJcdThCRDVcdTU5MzFcdThEMjVcIiwgXCJXZWJEQVYgdGVzdCBmYWlsZWRcIiksIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UobWVzc2FnZSwgODAwMCk7XG4gICAgICBpZiAoc2hvd01vZGFsKSB7XG4gICAgICAgIG5ldyBSZXN1bHRNb2RhbCh0aGlzLmFwcCwgdGhpcy50KFwiV2ViREFWIFx1OEZERVx1NjNBNVwiLCBcIldlYkRBViBDb25uZWN0aW9uXCIpLCBtZXNzYWdlKS5vcGVuKCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBkZXNjcmliZUVycm9yKHByZWZpeDogc3RyaW5nLCBlcnJvcjogdW5rbm93bikge1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG4gICAgcmV0dXJuIGAke3ByZWZpeH06ICR7bWVzc2FnZX1gO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZXF1ZXN0VXJsKG9wdGlvbnM6IHtcbiAgICB1cmw6IHN0cmluZztcbiAgICBtZXRob2Q6IHN0cmluZztcbiAgICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgICBib2R5PzogQXJyYXlCdWZmZXI7XG4gICAgZm9sbG93UmVkaXJlY3RzPzogYm9vbGVhbjtcbiAgICByZWRpcmVjdENvdW50PzogbnVtYmVyO1xuICB9KTogUHJvbWlzZTx7IHN0YXR1czogbnVtYmVyOyBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+OyBhcnJheUJ1ZmZlcjogQXJyYXlCdWZmZXIgfT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb2JzaWRpYW5SZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogb3B0aW9ucy51cmwsXG4gICAgICBtZXRob2Q6IG9wdGlvbnMubWV0aG9kLFxuICAgICAgaGVhZGVyczogb3B0aW9ucy5oZWFkZXJzLFxuICAgICAgYm9keTogb3B0aW9ucy5ib2R5LFxuICAgICAgdGhyb3c6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogcmVzcG9uc2Uuc3RhdHVzLFxuICAgICAgaGVhZGVyczogcmVzcG9uc2UuaGVhZGVycyxcbiAgICAgIGFycmF5QnVmZmVyOiByZXNwb25zZS5hcnJheUJ1ZmZlcixcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBlbmNvZGVVdGY4KHZhbHVlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBieXRlcyA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSh2YWx1ZSk7XG4gICAgcmV0dXJuIGJ5dGVzLmJ1ZmZlci5zbGljZShieXRlcy5ieXRlT2Zmc2V0LCBieXRlcy5ieXRlT2Zmc2V0ICsgYnl0ZXMuYnl0ZUxlbmd0aCkgYXMgQXJyYXlCdWZmZXI7XG4gIH1cblxuICBwcml2YXRlIGRlY29kZVV0ZjgoYnVmZmVyOiBBcnJheUJ1ZmZlcikge1xuICAgIHJldHVybiBuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoYnVmZmVyKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY29tcHV0ZVNoYTI1NkhleChidWZmZXI6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgZGlnZXN0ID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3QoXCJTSEEtMjU2XCIsIGJ1ZmZlcik7XG4gICAgcmV0dXJuIEFycmF5LmZyb20obmV3IFVpbnQ4QXJyYXkoZGlnZXN0KSlcbiAgICAgIC5tYXAoKHZhbHVlKSA9PiB2YWx1ZS50b1N0cmluZygxNikucGFkU3RhcnQoMiwgXCIwXCIpKVxuICAgICAgLmpvaW4oXCJcIik7XG4gIH1cbn1cblxudHlwZSBVcGxvYWRSZXdyaXRlID0ge1xuICBvcmlnaW5hbDogc3RyaW5nO1xuICByZXdyaXR0ZW46IHN0cmluZztcbiAgc291cmNlRmlsZT86IFRGaWxlO1xufTtcblxuY2xhc3MgU2VjdXJlV2ViZGF2U2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuICBwbHVnaW46IFNlY3VyZVdlYmRhdkltYWdlc1BsdWdpbjtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBTZWN1cmVXZWJkYXZJbWFnZXNQbHVnaW4pIHtcbiAgICBzdXBlcihhcHAsIHBsdWdpbik7XG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gIH1cblxuICBkaXNwbGF5KCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XG4gICAgY29udGFpbmVyRWwuZW1wdHkoKTtcblxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIlNlY3VyZSBXZWJEQVYgSW1hZ2VzXCIgfSk7XG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJwXCIsIHtcbiAgICAgIHRleHQ6IHRoaXMucGx1Z2luLnQoXG4gICAgICAgIFwiXHU4RkQ5XHU0RTJBXHU2M0QyXHU0RUY2XHU1M0VBXHU2MjhBXHU1NkZFXHU3MjQ3XHU1MjY1XHU3OUJCXHU1MjMwXHU1MzU1XHU3MkVDXHU3Njg0XHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHVGRjBDXHU1RTc2XHU0RkREXHU1QjU4XHU0RTNBIHNlY3VyZS13ZWJkYXYgXHU4MUVBXHU1QjlBXHU0RTQ5XHU0RUUzXHU3ODAxXHU1NzU3XHVGRjFCXHU1MTc2XHU0RUQ2XHU3QjE0XHU4QkIwXHU1NDhDXHU5NjQ0XHU0RUY2XHU2MzA5XHU1MzlGXHU4REVGXHU1Rjg0XHU1MzlGXHU2ODM3XHU1NDBDXHU2QjY1XHUzMDAyXCIsXG4gICAgICAgIFwiVGhpcyBwbHVnaW4gc2VwYXJhdGVzIG9ubHkgaW1hZ2VzIGludG8gYSBkZWRpY2F0ZWQgcmVtb3RlIGZvbGRlciBhbmQgc3RvcmVzIHRoZW0gYXMgc2VjdXJlLXdlYmRhdiBjdXN0b20gY29kZSBibG9ja3MuIE5vdGVzIGFuZCBvdGhlciBhdHRhY2htZW50cyBhcmUgc3luY2VkIGFzLWlzIHdpdGggdGhlaXIgb3JpZ2luYWwgcGF0aHMuXCIsXG4gICAgICApLFxuICAgIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU1RjUzXHU1MjREXHU2M0QyXHU0RUY2XHU3MjQ4XHU2NzJDXCIsIFwiQ3VycmVudCBwbHVnaW4gdmVyc2lvblwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU1OTFBXHU3QUVGXHU0RjdGXHU3NTI4XHU2NUY2XHU1M0VGXHU1MTQ4XHU2ODM4XHU1QkY5XHU4RkQ5XHU5MUNDXHU3Njg0XHU3MjQ4XHU2NzJDXHU1M0Y3XHVGRjBDXHU5MDdGXHU1MTREXHU1NkUwXHU0RTNBXHU1QkEyXHU2MjM3XHU3QUVGXHU1MzQ3XHU3RUE3XHU0RTBEXHU1MjMwXHU0RjREXHU1QkZDXHU4MUY0XHU4ODRDXHU0RTNBXHU0RTBEXHU0RTAwXHU4MUY0XHUzMDAyXCIsXG4gICAgICAgICAgXCJDaGVjayB0aGlzIHZlcnNpb24gZmlyc3QgYWNyb3NzIGRldmljZXMgdG8gYXZvaWQgaW5jb25zaXN0ZW50IGJlaGF2aW9yIGNhdXNlZCBieSBpbmNvbXBsZXRlIHVwZ3JhZGVzLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+IHtcbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5tYW5pZmVzdC52ZXJzaW9uKTtcbiAgICAgICAgdGV4dC5zZXREaXNhYmxlZCh0cnVlKTtcbiAgICAgIH0pO1xuXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMucGx1Z2luLnQoXCJcdTc1NENcdTk3NjJcdThCRURcdThBMDBcIiwgXCJJbnRlcmZhY2UgbGFuZ3VhZ2VcIikgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdThCRURcdThBMDBcIiwgXCJMYW5ndWFnZVwiKSlcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdThCQkVcdTdGNkVcdTk4NzVcdTY1MkZcdTYzMDFcdTgxRUFcdTUyQThcdTMwMDFcdTRFMkRcdTY1ODdcdTMwMDFcdTgyRjFcdTY1ODdcdTUyMDdcdTYzNjJcdTMwMDJcIiwgXCJTd2l0Y2ggdGhlIHNldHRpbmdzIFVJIGJldHdlZW4gYXV0bywgQ2hpbmVzZSwgYW5kIEVuZ2xpc2guXCIpKVxuICAgICAgLmFkZERyb3Bkb3duKChkcm9wZG93bikgPT5cbiAgICAgICAgZHJvcGRvd25cbiAgICAgICAgICAuYWRkT3B0aW9uKFwiYXV0b1wiLCB0aGlzLnBsdWdpbi50KFwiXHU4MUVBXHU1MkE4XCIsIFwiQXV0b1wiKSlcbiAgICAgICAgICAuYWRkT3B0aW9uKFwiemhcIiwgXCJcdTRFMkRcdTY1ODdcIilcbiAgICAgICAgICAuYWRkT3B0aW9uKFwiZW5cIiwgXCJFbmdsaXNoXCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxhbmd1YWdlKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmxhbmd1YWdlID0gdmFsdWUgYXMgXCJhdXRvXCIgfCBcInpoXCIgfCBcImVuXCI7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiB0aGlzLnBsdWdpbi50KFwiXHU4RkRFXHU2M0E1XHU4QkJFXHU3RjZFXCIsIFwiQ29ubmVjdGlvblwiKSB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIldlYkRBViBcdTU3RkFcdTc4NDBcdTU3MzBcdTU3NDBcIiwgXCJXZWJEQVYgYmFzZSBVUkxcIikpXG4gICAgICAuc2V0RGVzYyh0aGlzLnBsdWdpbi50KFwiXHU2NzBEXHU1MkExXHU1NjY4XHU1N0ZBXHU3ODQwXHU1NzMwXHU1NzQwXHVGRjBDXHU0RjhCXHU1OTgyXHVGRjFBaHR0cDovL3lvdXItd2ViZGF2LWhvc3Q6cG9ydFwiLCBcIkJhc2Ugc2VydmVyIFVSTC4gRXhhbXBsZTogaHR0cDovL3lvdXItd2ViZGF2LWhvc3Q6cG9ydFwiKSlcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiaHR0cDovL3lvdXItd2ViZGF2LWhvc3Q6cG9ydFwiKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy53ZWJkYXZVcmwpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Mud2ViZGF2VXJsID0gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4RDI2XHU1M0Y3XCIsIFwiVXNlcm5hbWVcIikpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VybmFtZSkub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlcm5hbWUgPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NUJDNlx1NzgwMVwiLCBcIlBhc3N3b3JkXCIpKVxuICAgICAgLnNldERlc2ModGhpcy5wbHVnaW4udChcIlx1OUVEOFx1OEJBNFx1OTY5MFx1ODVDRlx1RkYwQ1x1NTNFRlx1NzBCOVx1NTFGQlx1NTNGM1x1NEZBN1x1NjMwOVx1OTRBRVx1NjYzRVx1NzkzQVx1NjIxNlx1OTY5MFx1ODVDRlx1MzAwMlwiLCBcIkhpZGRlbiBieSBkZWZhdWx0LiBVc2UgdGhlIGJ1dHRvbiBvbiB0aGUgcmlnaHQgdG8gc2hvdyBvciBoaWRlIGl0LlwiKSlcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PiB7XG4gICAgICAgIHRleHQuaW5wdXRFbC50eXBlID0gXCJwYXNzd29yZFwiO1xuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnBhc3N3b3JkKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXNzd29yZCA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAuYWRkRXh0cmFCdXR0b24oKGJ1dHRvbikgPT4ge1xuICAgICAgICBsZXQgdmlzaWJsZSA9IGZhbHNlO1xuICAgICAgICBidXR0b24uc2V0SWNvbihcImV5ZVwiKTtcbiAgICAgICAgYnV0dG9uLnNldFRvb2x0aXAodGhpcy5wbHVnaW4udChcIlx1NjYzRVx1NzkzQVx1NUJDNlx1NzgwMVwiLCBcIlNob3cgcGFzc3dvcmRcIikpO1xuICAgICAgICBidXR0b24ub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgY29uc3QgaW5wdXQgPSBidXR0b24uZXh0cmFTZXR0aW5nc0VsLnBhcmVudEVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3IoXCJpbnB1dFwiKTtcbiAgICAgICAgICBpZiAoIShpbnB1dCBpbnN0YW5jZW9mIEhUTUxJbnB1dEVsZW1lbnQpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdmlzaWJsZSA9ICF2aXNpYmxlO1xuICAgICAgICAgIGlucHV0LnR5cGUgPSB2aXNpYmxlID8gXCJ0ZXh0XCIgOiBcInBhc3N3b3JkXCI7XG4gICAgICAgICAgYnV0dG9uLnNldEljb24odmlzaWJsZSA/IFwiZXllLW9mZlwiIDogXCJleWVcIik7XG4gICAgICAgICAgYnV0dG9uLnNldFRvb2x0aXAodGhpcy5wbHVnaW4udCh2aXNpYmxlID8gXCJcdTk2OTBcdTg1Q0ZcdTVCQzZcdTc4MDFcIiA6IFwiXHU2NjNFXHU3OTNBXHU1QkM2XHU3ODAxXCIsIHZpc2libGUgPyBcIkhpZGUgcGFzc3dvcmRcIiA6IFwiU2hvdyBwYXNzd29yZFwiKSk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTU2RkVcdTcyNDdcdThGRENcdTdBMEJcdTc2RUVcdTVGNTVcIiwgXCJJbWFnZSByZW1vdGUgZm9sZGVyXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTRFMTNcdTk1RThcdTc1MjhcdTRFOEVcdTVCNThcdTY1M0VcdThGRENcdTdBMEJcdTU2RkVcdTcyNDdcdTc2ODQgV2ViREFWIFx1NzZFRVx1NUY1NVx1RkYwQ1x1NEY4Qlx1NTk4Mlx1RkYxQS9yZW1vdGUtaW1hZ2VzL1x1MzAwMlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NjIxMFx1NTI5Rlx1NTQwRVx1NEYxQVx1N0FDQlx1NTM3M1x1NTIyMFx1OTY2NFx1NjcyQ1x1NTczMFx1NTZGRVx1NzI0N1x1NjU4N1x1NEVGNlx1MzAwMlwiLFxuICAgICAgICAgIFwiRGVkaWNhdGVkIFdlYkRBViBmb2xkZXIgZm9yIHJlbW90ZSBpbWFnZXMsIGZvciBleGFtcGxlOiAvcmVtb3RlLWltYWdlcy8uIExvY2FsIGltYWdlIGZpbGVzIGFyZSBkZWxldGVkIGltbWVkaWF0ZWx5IGFmdGVyIHVwbG9hZCBzdWNjZWVkcy5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnJlbW90ZUZvbGRlcikub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmVtb3RlRm9sZGVyID0gbm9ybWFsaXplUGF0aCh2YWx1ZS50cmltKCkgfHwgXCIvcmVtb3RlLWltYWdlcy9cIik7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NkQ0Qlx1OEJENVx1OEZERVx1NjNBNVwiLCBcIlRlc3QgY29ubmVjdGlvblwiKSlcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdTRGN0ZcdTc1MjhcdTRFMzRcdTY1RjZcdTYzQTJcdTk0ODhcdTY1ODdcdTRFRjZcdTlBOENcdThCQzEgUFVUXHUzMDAxR0VUXHUzMDAxREVMRVRFIFx1NjYyRlx1NTQyNlx1NkI2M1x1NUUzOFx1MzAwMlwiLCBcIlZlcmlmeSBQVVQsIEdFVCwgYW5kIERFTEVURSB1c2luZyBhIHRlbXBvcmFyeSBwcm9iZSBmaWxlLlwiKSlcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodGhpcy5wbHVnaW4udChcIlx1NUYwMFx1NTlDQlx1NkQ0Qlx1OEJENVwiLCBcIlJ1biB0ZXN0XCIpKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnJ1bkNvbm5lY3Rpb25UZXN0KHRydWUpO1xuICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQoZmFsc2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMucGx1Z2luLnQoXCJcdTU0MENcdTZCNjVcdThCQkVcdTdGNkVcIiwgXCJTeW5jXCIpIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4RkRDXHU3QTBCXHU3QjE0XHU4QkIwXHU3NkVFXHU1RjU1XCIsIFwiUmVtb3RlIG5vdGVzIGZvbGRlclwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU3NTI4XHU0RThFXHU1QjU4XHU2NTNFXHU3QjE0XHU4QkIwXHU1NDhDXHU1MTc2XHU0RUQ2XHU5NzVFXHU1NkZFXHU3MjQ3XHU5NjQ0XHU0RUY2XHU1MzlGXHU2ODM3XHU1NDBDXHU2QjY1XHU1MjZGXHU2NzJDXHU3Njg0XHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHVGRjBDXHU0RjhCXHU1OTgyXHVGRjFBL3ZhdWx0LXN5bmMvXHUzMDAyXHU2M0QyXHU0RUY2XHU0RjFBXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU2NTc0XHU0RTJBIHZhdWx0XHVGRjBDXHU1RTc2XHU4REYzXHU4RkM3IC5vYnNpZGlhblx1MzAwMVx1NjNEMlx1NEVGNlx1NzZFRVx1NUY1NVx1NTQ4Q1x1NTZGRVx1NzI0N1x1NjU4N1x1NEVGNlx1MzAwMlwiLFxuICAgICAgICAgIFwiUmVtb3RlIGZvbGRlciB1c2VkIGZvciBub3RlcyBhbmQgb3RoZXIgbm9uLWltYWdlIGF0dGFjaG1lbnRzIHN5bmNlZCBhcy1pcywgZm9yIGV4YW1wbGU6IC92YXVsdC1zeW5jLy4gVGhlIHBsdWdpbiBzeW5jcyB0aGUgd2hvbGUgdmF1bHQgYW5kIGF1dG9tYXRpY2FsbHkgc2tpcHMgLm9ic2lkaWFuLCB0aGUgcGx1Z2luIGRpcmVjdG9yeSwgYW5kIGltYWdlIGZpbGVzLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIgPSBub3JtYWxpemVQYXRoKHZhbHVlLnRyaW0oKSB8fCBcIi92YXVsdC1zeW5jL1wiKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU0RTBEXHU1NDBDXHU2QjY1XHU3NkVFXHU1RjU1XCIsIFwiRXhjbHVkZWQgc3luYyBmb2xkZXJzXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdThGRDlcdTRFOUIgdmF1bHQgXHU3NkVFXHU1RjU1XHU0RTBEXHU0RjFBXHU4OEFCXHU1MTg1XHU1QkI5XHU1NDBDXHU2QjY1XHU0RTBBXHU0RjIwXHUzMDAxXHU0RUNFXHU4RkRDXHU3QUVGXHU2MDYyXHU1OTBEXHU2MjE2XHU4RkRCXHU4ODRDXHU3NkVFXHU1RjU1XHU1QkY5XHU4RDI2XHUzMDAyXHU2NTJGXHU2MzAxXHU5MDE3XHU1M0Y3XHU2MjE2XHU2MzYyXHU4ODRDXHU1MjA2XHU5Njk0XHVGRjBDXHU5RUQ4XHU4QkE0XHVGRjFBa2JcdTMwMDJcIixcbiAgICAgICAgICBcIlRoZXNlIHZhdWx0IGZvbGRlcnMgYXJlIG5vdCB1cGxvYWRlZCwgcmVzdG9yZWQgZnJvbSByZW1vdGUsIG9yIHJlY29uY2lsZWQgYXMgZGlyZWN0b3JpZXMuIFNlcGFyYXRlIGVudHJpZXMgd2l0aCBjb21tYXMgb3IgbmV3IGxpbmVzLiBEZWZhdWx0OiBrYi5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0QXJlYSgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImtiXCIpXG4gICAgICAgICAgLnNldFZhbHVlKCh0aGlzLnBsdWdpbi5zZXR0aW5ncy5leGNsdWRlZFN5bmNGb2xkZXJzID8/IFtdKS5qb2luKFwiXFxuXCIpKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmV4Y2x1ZGVkU3luY0ZvbGRlcnMgPSB2YWx1ZS5zcGxpdCgvWyxcXG5dLyk7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5ub3JtYWxpemVFZmZlY3RpdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU5ODkxXHU3Mzg3XCIsIFwiQXV0byBzeW5jIGZyZXF1ZW5jeVwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU0RUU1XHU1MjA2XHU5NDlGXHU0RTNBXHU1MzU1XHU0RjREXHU4QkJFXHU3RjZFXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU2NUY2XHU5NUY0XHUzMDAyXHU1ODZCIDAgXHU4ODY4XHU3OTNBXHU1MTczXHU5NUVEXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHUzMDAyXHU4RkQ5XHU5MUNDXHU3Njg0XHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHU2MjY3XHU4ODRDXHUyMDFDXHU1QjhDXHU2NTc0XHU1NDBDXHU2QjY1XHUyMDFEXHVGRjFBXHU0RjFBXHU2OEMwXHU2N0U1XHU2NzJDXHU1NzMwXHU0RTBFXHU4RkRDXHU3QUVGXHU1REVFXHU1RjAyXHVGRjBDXHU0RTBBXHU0RjIwXHU2NzJDXHU1NzMwXHU1M0Q4XHU2NkY0XHVGRjBDXHU1RTc2XHU2MkM5XHU1M0Q2XHU4RkRDXHU3QUVGXHU2NkY0XHU2NUIwXHUzMDAyXCIsXG4gICAgICAgICAgXCJTZXQgdGhlIGF1dG9tYXRpYyBzeW5jIGludGVydmFsIGluIG1pbnV0ZXMuIFVzZSAwIHRvIHR1cm4gaXQgb2ZmLiBBdXRvIHN5bmMgcnVucyB0aGUgZnVsbCBzeW5jIGZsb3c6IGl0IGNoZWNrcyBsb2NhbCBhbmQgcmVtb3RlIGRpZmZlcmVuY2VzLCB1cGxvYWRzIGxvY2FsIGNoYW5nZXMsIGFuZCBwdWxscyByZW1vdGUgdXBkYXRlcy5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiMFwiKVxuICAgICAgICAgIC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXMpKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IE51bWJlci5wYXJzZUludCh2YWx1ZSwgMTApO1xuICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNOYU4ocGFyc2VkKSkge1xuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvU3luY0ludGVydmFsTWludXRlcyA9IE1hdGgubWF4KDAsIHBhcnNlZCk7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1N0IxNFx1OEJCMFx1NjcyQ1x1NTczMFx1NEZERFx1NzU1OVx1NkEyMVx1NUYwRlwiLCBcIk5vdGUgbG9jYWwgcmV0ZW50aW9uIG1vZGVcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1NUI4Q1x1NjU3NFx1NjcyQ1x1NTczMFx1RkYxQVx1N0IxNFx1OEJCMFx1NTlDQlx1N0VDOFx1NEZERFx1NzU1OVx1NTcyOFx1NjcyQ1x1NTczMFx1MzAwMlx1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFx1RkYxQVx1OTU3Rlx1NjcxRlx1NjcyQVx1OEJCRlx1OTVFRVx1NzY4NCBNYXJrZG93biBcdTdCMTRcdThCQjBcdTRGMUFcdTg4QUJcdTY2RkZcdTYzNjJcdTRFM0FcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTY1ODdcdTRFRjZcdUZGMENcdTYyNTNcdTVGMDBcdTY1RjZcdTUxOERcdTRFQ0VcdThGRENcdTdBRUZcdTYwNjJcdTU5MERcdTMwMDJcIixcbiAgICAgICAgICBcIkZ1bGwgbG9jYWw6IG5vdGVzIGFsd2F5cyBzdGF5IGxvY2FsLiBMYXp5IG5vdGVzOiBzdGFsZSBNYXJrZG93biBub3RlcyBhcmUgcmVwbGFjZWQgd2l0aCBsb2NhbCBwbGFjZWhvbGRlciBmaWxlcyBhbmQgcmVzdG9yZWQgZnJvbSByZW1vdGUgd2hlbiBvcGVuZWQuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkRHJvcGRvd24oKGRyb3Bkb3duKSA9PlxuICAgICAgICBkcm9wZG93blxuICAgICAgICAgIC5hZGRPcHRpb24oXCJmdWxsLWxvY2FsXCIsIHRoaXMucGx1Z2luLnQoXCJcdTVCOENcdTY1NzRcdTY3MkNcdTU3MzBcIiwgXCJGdWxsIGxvY2FsXCIpKVxuICAgICAgICAgIC5hZGRPcHRpb24oXCJsYXp5LW5vdGVzXCIsIHRoaXMucGx1Z2luLnQoXCJcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTdCMTRcdThCQjBcIiwgXCJMYXp5IG5vdGVzXCIpKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlU3RvcmFnZU1vZGUpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Mubm90ZVN0b3JhZ2VNb2RlID0gdmFsdWUgYXMgXCJmdWxsLWxvY2FsXCIgfCBcImxhenktbm90ZXNcIjtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1N0IxNFx1OEJCMFx1NjcyQ1x1NTczMFx1NTZERVx1NjUzNlx1NTkyOVx1NjU3MFwiLCBcIk5vdGUgZXZpY3Rpb24gZGF5c1wiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU0RUM1XHU1NzI4XHUyMDFDXHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXHUyMDFEXHU2QTIxXHU1RjBGXHU0RTBCXHU3NTFGXHU2NTQ4XHUzMDAyXHU4RDg1XHU4RkM3XHU4RkQ5XHU0RTJBXHU1OTI5XHU2NTcwXHU2NzJBXHU2MjUzXHU1RjAwXHU3Njg0IE1hcmtkb3duIFx1N0IxNFx1OEJCMFx1RkYwQ1x1NEYxQVx1NTcyOFx1NTQwQ1x1NkI2NVx1NTQwRVx1ODhBQlx1NjZGRlx1NjM2Mlx1NEUzQVx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1NjU4N1x1NEVGNlx1MzAwMlwiLFxuICAgICAgICAgIFwiVXNlZCBvbmx5IGluIGxhenkgbm90ZSBtb2RlLiBNYXJrZG93biBub3RlcyBub3Qgb3BlbmVkIHdpdGhpbiB0aGlzIG51bWJlciBvZiBkYXlzIGFyZSByZXBsYWNlZCB3aXRoIGxvY2FsIHBsYWNlaG9sZGVyIGZpbGVzIGFmdGVyIHN5bmMuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcIjMwXCIpXG4gICAgICAgICAgLnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlRXZpY3RBZnRlckRheXMpKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IE51bWJlci5wYXJzZUludCh2YWx1ZSwgMTApO1xuICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNOYU4ocGFyc2VkKSkge1xuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlRXZpY3RBZnRlckRheXMgPSBNYXRoLm1heCgxLCBwYXJzZWQpO1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTU0MENcdTZCNjVcdTcyQjZcdTYwMDFcIiwgXCJTeW5jIHN0YXR1c1wiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIGAke3RoaXMucGx1Z2luLmZvcm1hdExhc3RTeW5jTGFiZWwoKX1cXG4ke3RoaXMucGx1Z2luLmZvcm1hdFN5bmNTdGF0dXNMYWJlbCgpfVxcbiR7dGhpcy5wbHVnaW4udChcIlx1OEJGNFx1NjYwRVx1RkYxQVx1NUZFQlx1OTAxRlx1NTQwQ1x1NkI2NVx1NTNFQVx1OEQxRlx1OEQyM1x1NEUwQVx1NEYyMFx1NjcyQ1x1NTczMFx1NjVCMFx1NTg5RS9cdTRGRUVcdTY1MzlcdTY1ODdcdTRFRjZcdUZGMENcdTVFNzZcdTU5MDRcdTc0MDZcdTY2MEVcdTc4NkVcdTUyMjBcdTk2NjRcdTk2MUZcdTUyMTdcdUZGMUJcdTVCOENcdTY1NzRcdTU0MENcdTZCNjVcdTYyNERcdTRGMUFcdTU0MENcdTY1RjZcdTRFMEFcdTRGMjBcdTY3MkNcdTU3MzBcdTUzRDhcdTY2RjRcdTVFNzZcdTRFMEJcdThGN0RcdThGRENcdTdBRUZcdTY2RjRcdTY1QjBcdTMwMDJcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTRFQ0RcdTc1MzFcdTcyRUNcdTdBQ0JcdTk2MUZcdTUyMTdcdTU5MDRcdTc0MDZcdTMwMDJcIiwgXCJOb3RlOiBGYXN0IHN5bmMgb25seSB1cGxvYWRzIGxvY2FsIGFkZGl0aW9ucy9lZGl0cyBhbmQgcHJvY2Vzc2VzIGV4cGxpY2l0IGRlbGV0aW9uIHF1ZXVlcy4gRnVsbCBzeW5jIGlzIHRoZSBtb2RlIHRoYXQgYm90aCB1cGxvYWRzIGxvY2FsIGNoYW5nZXMgYW5kIGRvd25sb2FkcyByZW1vdGUgdXBkYXRlcy4gSW1hZ2UgdXBsb2FkcyBjb250aW51ZSB0byBiZSBoYW5kbGVkIGJ5IHRoZSBzZXBhcmF0ZSBxdWV1ZS5cIil9YCxcbiAgICAgICAgICBgJHt0aGlzLnBsdWdpbi5mb3JtYXRMYXN0U3luY0xhYmVsKCl9XFxuJHt0aGlzLnBsdWdpbi5mb3JtYXRTeW5jU3RhdHVzTGFiZWwoKX1cXG4ke3RoaXMucGx1Z2luLnQoXCJcdThCRjRcdTY2MEVcdUZGMUFcdTVGRUJcdTkwMUZcdTU0MENcdTZCNjVcdTUzRUFcdThEMUZcdThEMjNcdTRFMEFcdTRGMjBcdTY3MkNcdTU3MzBcdTY1QjBcdTU4OUUvXHU0RkVFXHU2NTM5XHU2NTg3XHU0RUY2XHVGRjBDXHU1RTc2XHU1OTA0XHU3NDA2XHU2NjBFXHU3ODZFXHU1MjIwXHU5NjY0XHU5NjFGXHU1MjE3XHVGRjFCXHU1QjhDXHU2NTc0XHU1NDBDXHU2QjY1XHU2MjREXHU0RjFBXHU1NDBDXHU2NUY2XHU0RTBBXHU0RjIwXHU2NzJDXHU1NzMwXHU1M0Q4XHU2NkY0XHU1RTc2XHU0RTBCXHU4RjdEXHU4RkRDXHU3QUVGXHU2NkY0XHU2NUIwXHUzMDAyXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU0RUNEXHU3NTMxXHU3MkVDXHU3QUNCXHU5NjFGXHU1MjE3XHU1OTA0XHU3NDA2XHUzMDAyXCIsIFwiTm90ZTogRmFzdCBzeW5jIG9ubHkgdXBsb2FkcyBsb2NhbCBhZGRpdGlvbnMvZWRpdHMgYW5kIHByb2Nlc3NlcyBleHBsaWNpdCBkZWxldGlvbiBxdWV1ZXMuIEZ1bGwgc3luYyBpcyB0aGUgbW9kZSB0aGF0IGJvdGggdXBsb2FkcyBsb2NhbCBjaGFuZ2VzIGFuZCBkb3dubG9hZHMgcmVtb3RlIHVwZGF0ZXMuIEltYWdlIHVwbG9hZHMgY29udGludWUgdG8gYmUgaGFuZGxlZCBieSB0aGUgc2VwYXJhdGUgcXVldWUuXCIpfWAsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KHRoaXMucGx1Z2luLnQoXCJcdTVGRUJcdTkwMUZcdTU0MENcdTZCNjVcIiwgXCJGYXN0IHN5bmNcIikpLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZCh0cnVlKTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc3luY1BlbmRpbmdWYXVsdENvbnRlbnQodHJ1ZSk7XG4gICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcbiAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKGZhbHNlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pLFxuICAgICAgKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dCh0aGlzLnBsdWdpbi50KFwiXHU1QjhDXHU2NTc0XHU1QkY5XHU4RDI2XCIsIFwiRnVsbCByZWNvbmNpbGVcIikpLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZCh0cnVlKTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQodHJ1ZSk7XG4gICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcbiAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKGZhbHNlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiB0aGlzLnBsdWdpbi50KFwiXHU0RTAwXHU2QjIxXHU2MDI3XHU1REU1XHU1MTc3XCIsIFwiT25lLXRpbWUgdG9vbHNcIikgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdThGQzFcdTc5RkJcdTY1NzRcdTVFOTNcdTUzOUZcdTc1MUZcdTU2RkVcdTcyNDdcdTVGMTVcdTc1MjhcIiwgXCJNaWdyYXRlIG5hdGl2ZSBpbWFnZSBlbWJlZHMgaW4gdmF1bHRcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1NjI2Qlx1NjNDRlx1NjU3NFx1NUU5M1x1NjI0MFx1NjcwOSBNYXJrZG93biBcdTdCMTRcdThCQjBcdUZGMENcdTYyOEEgT2JzaWRpYW4gXHU1MzlGXHU3NTFGXHU2NzJDXHU1NzMwXHU1NkZFXHU3MjQ3XHU1RjE1XHU3NTI4XHVGRjA4XHU1OTgyICFbXSgpIFx1NTQ4QyAhW1suLi5dXVx1RkYwOVx1NEUwQVx1NEYyMFx1NTIzMFx1OEZEQ1x1N0FFRlx1NTZGRVx1NzI0N1x1NzZFRVx1NUY1NVx1RkYwQ1x1NUU3Nlx1NjUzOVx1NTE5OVx1NEUzQSBzZWN1cmUtd2ViZGF2IFx1NEVFM1x1NzgwMVx1NTc1N1x1MzAwMlx1NjVFN1x1NzI0OCBzcGFuIFx1NTQ4Q1x1NjVFOVx1NjcxRiB3ZWJkYXYtc2VjdXJlIFx1OTRGRVx1NjNBNVx1NEU1Rlx1NEYxQVx1NEUwMFx1NUU3Nlx1NjUzNlx1NjU1Qlx1NTIzMFx1NjVCMFx1NjgzQ1x1NUYwRlx1MzAwMlwiLFxuICAgICAgICAgIFwiU2NhbiBhbGwgTWFya2Rvd24gbm90ZXMgaW4gdGhlIHZhdWx0LCB1cGxvYWQgbmF0aXZlIGxvY2FsIGltYWdlIGVtYmVkcyAoc3VjaCBhcyAhW10oKSBhbmQgIVtbLi4uXV0pIHRvIHRoZSByZW1vdGUgaW1hZ2UgZm9sZGVyLCBhbmQgcmV3cml0ZSB0aGVtIGFzIHNlY3VyZS13ZWJkYXYgY29kZSBibG9ja3MuIExlZ2FjeSBzcGFuIHRhZ3MgYW5kIGVhcmx5IHdlYmRhdi1zZWN1cmUgbGlua3MgYXJlIGFsc28gbm9ybWFsaXplZCB0byB0aGUgbmV3IGZvcm1hdC5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodGhpcy5wbHVnaW4udChcIlx1NUYwMFx1NTlDQlx1OEZDMVx1NzlGQlwiLCBcIlJ1biBtaWdyYXRpb25cIikpLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZCh0cnVlKTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ubWlncmF0ZUFsbExlZ2FjeVNlY3VyZUltYWdlcygpO1xuICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQoZmFsc2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSksXG4gICAgICApO1xuICB9XG59XG5cbmNsYXNzIFJlc3VsdE1vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIHJlYWRvbmx5IHRpdGxlVGV4dDogc3RyaW5nO1xuICBwcml2YXRlIHJlYWRvbmx5IGJvZHlUZXh0OiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHRpdGxlVGV4dDogc3RyaW5nLCBib2R5VGV4dDogc3RyaW5nKSB7XG4gICAgc3VwZXIoYXBwKTtcbiAgICB0aGlzLnRpdGxlVGV4dCA9IHRpdGxlVGV4dDtcbiAgICB0aGlzLmJvZHlUZXh0ID0gYm9keVRleHQ7XG4gIH1cblxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG4gICAgY29udGVudEVsLmVtcHR5KCk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiB0aGlzLnRpdGxlVGV4dCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogdGhpcy5ib2R5VGV4dCB9KTtcbiAgfVxuXG4gIG9uQ2xvc2UoKTogdm9pZCB7XG4gICAgdGhpcy5jb250ZW50RWwuZW1wdHkoKTtcbiAgfVxufVxuIiwgImltcG9ydCB7IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQsIE1hcmtkb3duUmVuZGVyQ2hpbGQgfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuZXhwb3J0IGNvbnN0IFNFQ1VSRV9QUk9UT0NPTCA9IFwid2ViZGF2LXNlY3VyZTpcIjtcbmV4cG9ydCBjb25zdCBTRUNVUkVfQ09ERV9CTE9DSyA9IFwic2VjdXJlLXdlYmRhdlwiO1xuXG5leHBvcnQgdHlwZSBTZWN1cmVXZWJkYXZJbWFnZUJsb2NrID0ge1xuICBwYXRoOiBzdHJpbmc7XG4gIGFsdDogc3RyaW5nO1xufTtcblxudHlwZSBTZWN1cmVXZWJkYXZJbWFnZVN1cHBvcnREZXBzID0ge1xuICB0OiAoemg6IHN0cmluZywgZW46IHN0cmluZykgPT4gc3RyaW5nO1xuICBmZXRjaFNlY3VyZUltYWdlQmxvYlVybDogKHJlbW90ZVBhdGg6IHN0cmluZykgPT4gUHJvbWlzZTxzdHJpbmc+O1xufTtcblxuY2xhc3MgU2VjdXJlV2ViZGF2UmVuZGVyQ2hpbGQgZXh0ZW5kcyBNYXJrZG93blJlbmRlckNoaWxkIHtcbiAgY29uc3RydWN0b3IoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgc3VwZXIoY29udGFpbmVyRWwpO1xuICB9XG5cbiAgb251bmxvYWQoKTogdm9pZCB7fVxufVxuXG4vLyBLZWVwIHNlY3VyZSBpbWFnZSBwYXJzaW5nIGFuZCByZW5kZXJpbmcgaXNvbGF0ZWQgc28gc3luYyBjaGFuZ2VzIGRvIG5vdFxuLy8gYWNjaWRlbnRhbGx5IGJyZWFrIHRoZSBkaXNwbGF5IHBpcGVsaW5lIGFnYWluLlxuZXhwb3J0IGNsYXNzIFNlY3VyZVdlYmRhdkltYWdlU3VwcG9ydCB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgZGVwczogU2VjdXJlV2ViZGF2SW1hZ2VTdXBwb3J0RGVwcykge31cblxuICBidWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybDogc3RyaW5nLCBhbHQ6IHN0cmluZykge1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmV4dHJhY3RSZW1vdGVQYXRoKHJlbW90ZVVybCk7XG4gICAgaWYgKCFyZW1vdGVQYXRoKSB7XG4gICAgICByZXR1cm4gYCFbXSgke3JlbW90ZVVybH0pYDtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5idWlsZFNlY3VyZUltYWdlQ29kZUJsb2NrKHJlbW90ZVBhdGgsIGFsdCk7XG4gIH1cblxuICBidWlsZFNlY3VyZUltYWdlQ29kZUJsb2NrKHJlbW90ZVBhdGg6IHN0cmluZywgYWx0OiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkQWx0ID0gKGFsdCB8fCByZW1vdGVQYXRoKS5yZXBsYWNlKC9cXHI/XFxuL2csIFwiIFwiKS50cmltKCk7XG4gICAgY29uc3Qgbm9ybWFsaXplZFBhdGggPSByZW1vdGVQYXRoLnJlcGxhY2UoL1xccj9cXG4vZywgXCJcIikudHJpbSgpO1xuICAgIHJldHVybiBbYFxcYFxcYFxcYCR7U0VDVVJFX0NPREVfQkxPQ0t9YCwgYHBhdGg6ICR7bm9ybWFsaXplZFBhdGh9YCwgYGFsdDogJHtub3JtYWxpemVkQWx0fWAsIFwiYGBgXCJdLmpvaW4oXCJcXG5cIik7XG4gIH1cblxuICBwYXJzZVNlY3VyZUltYWdlQmxvY2soc291cmNlOiBzdHJpbmcpOiBTZWN1cmVXZWJkYXZJbWFnZUJsb2NrIHwgbnVsbCB7XG4gICAgY29uc3QgcmVzdWx0OiBTZWN1cmVXZWJkYXZJbWFnZUJsb2NrID0geyBwYXRoOiBcIlwiLCBhbHQ6IFwiXCIgfTtcbiAgICBmb3IgKGNvbnN0IHJhd0xpbmUgb2Ygc291cmNlLnNwbGl0KC9cXHI/XFxuLykpIHtcbiAgICAgIGNvbnN0IGxpbmUgPSByYXdMaW5lLnRyaW0oKTtcbiAgICAgIGlmICghbGluZSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc2VwYXJhdG9ySW5kZXggPSBsaW5lLmluZGV4T2YoXCI6XCIpO1xuICAgICAgaWYgKHNlcGFyYXRvckluZGV4ID09PSAtMSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qga2V5ID0gbGluZS5zbGljZSgwLCBzZXBhcmF0b3JJbmRleCkudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgICBjb25zdCB2YWx1ZSA9IGxpbmUuc2xpY2Uoc2VwYXJhdG9ySW5kZXggKyAxKS50cmltKCk7XG4gICAgICBpZiAoa2V5ID09PSBcInBhdGhcIikge1xuICAgICAgICByZXN1bHQucGF0aCA9IHZhbHVlO1xuICAgICAgfSBlbHNlIGlmIChrZXkgPT09IFwiYWx0XCIpIHtcbiAgICAgICAgcmVzdWx0LmFsdCA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQucGF0aCA/IHJlc3VsdCA6IG51bGw7XG4gIH1cblxuICBhc3luYyBwcm9jZXNzU2VjdXJlSW1hZ2VzKGVsOiBIVE1MRWxlbWVudCwgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0KSB7XG4gICAgY29uc3Qgc2VjdXJlQ29kZUJsb2NrcyA9IEFycmF5LmZyb20oZWwucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oYHByZSA+IGNvZGUubGFuZ3VhZ2UtJHtTRUNVUkVfQ09ERV9CTE9DS31gKSk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICBzZWN1cmVDb2RlQmxvY2tzLm1hcChhc3luYyAoY29kZUVsKSA9PiB7XG4gICAgICAgIGNvbnN0IHByZSA9IGNvZGVFbC5wYXJlbnRFbGVtZW50O1xuICAgICAgICBpZiAoIShwcmUgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkgfHwgcHJlLmhhc0F0dHJpYnV0ZShcImRhdGEtc2VjdXJlLXdlYmRhdi1yZW5kZXJlZFwiKSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IHRoaXMucGFyc2VTZWN1cmVJbWFnZUJsb2NrKGNvZGVFbC50ZXh0Q29udGVudCA/PyBcIlwiKTtcbiAgICAgICAgaWYgKCFwYXJzZWQ/LnBhdGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBwcmUuc2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2LXJlbmRlcmVkXCIsIFwidHJ1ZVwiKTtcbiAgICAgICAgYXdhaXQgdGhpcy5yZW5kZXJTZWN1cmVJbWFnZUludG9FbGVtZW50KHByZSwgcGFyc2VkLnBhdGgsIHBhcnNlZC5hbHQgfHwgcGFyc2VkLnBhdGgpO1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIGNvbnN0IHNlY3VyZU5vZGVzID0gQXJyYXkuZnJvbShlbC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcIltkYXRhLXNlY3VyZS13ZWJkYXZdXCIpKTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgIHNlY3VyZU5vZGVzLm1hcChhc3luYyAobm9kZSkgPT4ge1xuICAgICAgICBpZiAobm9kZSBpbnN0YW5jZW9mIEhUTUxJbWFnZUVsZW1lbnQpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLnN3YXBJbWFnZVNvdXJjZShub2RlKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZW1vdGVQYXRoID0gbm9kZS5nZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIik7XG4gICAgICAgIGlmICghcmVtb3RlUGF0aCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGltZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbWdcIik7XG4gICAgICAgIGltZy5hbHQgPSBub2RlLmdldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIikgPz8gbm9kZS5nZXRBdHRyaWJ1dGUoXCJhbHRcIikgPz8gXCJTZWN1cmUgV2ViREFWIGltYWdlXCI7XG4gICAgICAgIGltZy5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIiwgcmVtb3RlUGF0aCk7XG4gICAgICAgIGltZy5jbGFzc0xpc3QuYWRkKFwic2VjdXJlLXdlYmRhdi1pbWFnZVwiLCBcImlzLWxvYWRpbmdcIik7XG4gICAgICAgIG5vZGUucmVwbGFjZVdpdGgoaW1nKTtcbiAgICAgICAgYXdhaXQgdGhpcy5zd2FwSW1hZ2VTb3VyY2UoaW1nKTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zdCBzZWN1cmVMaW5rcyA9IEFycmF5LmZyb20oZWwucXVlcnlTZWxlY3RvckFsbDxIVE1MSW1hZ2VFbGVtZW50PihgaW1nW3NyY149XCIke1NFQ1VSRV9QUk9UT0NPTH0vL1wiXWApKTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChzZWN1cmVMaW5rcy5tYXAoYXN5bmMgKGltZykgPT4gdGhpcy5zd2FwSW1hZ2VTb3VyY2UoaW1nKSkpO1xuXG4gICAgY3R4LmFkZENoaWxkKG5ldyBTZWN1cmVXZWJkYXZSZW5kZXJDaGlsZChlbCkpO1xuICB9XG5cbiAgYXN5bmMgcHJvY2Vzc1NlY3VyZUNvZGVCbG9jayhzb3VyY2U6IHN0cmluZywgZWw6IEhUTUxFbGVtZW50LCBjdHg6IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQpIHtcbiAgICBjb25zdCBwYXJzZWQgPSB0aGlzLnBhcnNlU2VjdXJlSW1hZ2VCbG9jayhzb3VyY2UpO1xuICAgIGlmICghcGFyc2VkPy5wYXRoKSB7XG4gICAgICBlbC5jcmVhdGVFbChcImRpdlwiLCB7XG4gICAgICAgIHRleHQ6IHRoaXMuZGVwcy50KFwiXHU1Qjg5XHU1MTY4XHU1NkZFXHU3MjQ3XHU0RUUzXHU3ODAxXHU1NzU3XHU2ODNDXHU1RjBGXHU2NUUwXHU2NTQ4XHUzMDAyXCIsIFwiSW52YWxpZCBzZWN1cmUgaW1hZ2UgY29kZSBibG9jayBmb3JtYXQuXCIpLFxuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5yZW5kZXJTZWN1cmVJbWFnZUludG9FbGVtZW50KGVsLCBwYXJzZWQucGF0aCwgcGFyc2VkLmFsdCB8fCBwYXJzZWQucGF0aCk7XG4gICAgY3R4LmFkZENoaWxkKG5ldyBTZWN1cmVXZWJkYXZSZW5kZXJDaGlsZChlbCkpO1xuICB9XG5cbiAgZXh0cmFjdFJlbW90ZVBhdGgoc3JjOiBzdHJpbmcpIHtcbiAgICBjb25zdCBwcmVmaXggPSBgJHtTRUNVUkVfUFJPVE9DT0x9Ly9gO1xuICAgIGlmICghc3JjLnN0YXJ0c1dpdGgocHJlZml4KSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIHNyYy5zbGljZShwcmVmaXgubGVuZ3RoKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVuZGVyU2VjdXJlSW1hZ2VJbnRvRWxlbWVudChlbDogSFRNTEVsZW1lbnQsIHJlbW90ZVBhdGg6IHN0cmluZywgYWx0OiBzdHJpbmcpIHtcbiAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xuICAgIGltZy5hbHQgPSBhbHQ7XG4gICAgaW1nLnNldEF0dHJpYnV0ZShcImRhdGEtc2VjdXJlLXdlYmRhdlwiLCByZW1vdGVQYXRoKTtcbiAgICBpbWcuY2xhc3NMaXN0LmFkZChcInNlY3VyZS13ZWJkYXYtaW1hZ2VcIiwgXCJpcy1sb2FkaW5nXCIpO1xuICAgIGVsLmVtcHR5KCk7XG4gICAgZWwuYXBwZW5kQ2hpbGQoaW1nKTtcbiAgICBhd2FpdCB0aGlzLnN3YXBJbWFnZVNvdXJjZShpbWcpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzd2FwSW1hZ2VTb3VyY2UoaW1nOiBIVE1MSW1hZ2VFbGVtZW50KSB7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IGltZy5nZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIikgPz8gdGhpcy5leHRyYWN0UmVtb3RlUGF0aChpbWcuZ2V0QXR0cmlidXRlKFwic3JjXCIpID8/IFwiXCIpO1xuICAgIGlmICghcmVtb3RlUGF0aCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGltZy5jbGFzc0xpc3QuYWRkKFwic2VjdXJlLXdlYmRhdi1pbWFnZVwiLCBcImlzLWxvYWRpbmdcIik7XG4gICAgY29uc3Qgb3JpZ2luYWxBbHQgPSBpbWcuYWx0O1xuICAgIGltZy5hbHQgPSBvcmlnaW5hbEFsdCB8fCB0aGlzLmRlcHMudChcIlx1NTJBMFx1OEY3RFx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NEUyRC4uLlwiLCBcIkxvYWRpbmcgc2VjdXJlIGltYWdlLi4uXCIpO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGJsb2JVcmwgPSBhd2FpdCB0aGlzLmRlcHMuZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmwocmVtb3RlUGF0aCk7XG4gICAgICBpbWcuc3JjID0gYmxvYlVybDtcbiAgICAgIGltZy5hbHQgPSBvcmlnaW5hbEFsdDtcbiAgICAgIGltZy5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgICAgaW1nLnN0eWxlLm1heFdpZHRoID0gXCIxMDAlXCI7XG4gICAgICBpbWcuY2xhc3NMaXN0LnJlbW92ZShcImlzLWxvYWRpbmdcIiwgXCJpcy1lcnJvclwiKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIlNlY3VyZSBXZWJEQVYgaW1hZ2UgbG9hZCBmYWlsZWRcIiwgZXJyb3IpO1xuICAgICAgaW1nLnJlcGxhY2VXaXRoKHRoaXMuYnVpbGRFcnJvckVsZW1lbnQocmVtb3RlUGF0aCwgZXJyb3IpKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkRXJyb3JFbGVtZW50KHJlbW90ZVBhdGg6IHN0cmluZywgZXJyb3I6IHVua25vd24pIHtcbiAgICBjb25zdCBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgZWwuY2xhc3NOYW1lID0gXCJzZWN1cmUtd2ViZGF2LWltYWdlIGlzLWVycm9yXCI7XG4gICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcbiAgICBlbC50ZXh0Q29udGVudCA9IHRoaXMuZGVwcy50KFxuICAgICAgYFx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NTJBMFx1OEY3RFx1NTkzMVx1OEQyNVx1RkYxQSR7cmVtb3RlUGF0aH1cdUZGMDgke21lc3NhZ2V9XHVGRjA5YCxcbiAgICAgIGBTZWN1cmUgaW1hZ2UgZmFpbGVkOiAke3JlbW90ZVBhdGh9ICgke21lc3NhZ2V9KWAsXG4gICAgKTtcbiAgICByZXR1cm4gZWw7XG4gIH1cbn1cbiIsICJpbXBvcnQgeyBBcHAsIEVkaXRvciwgTWFya2Rvd25WaWV3LCBOb3RpY2UsIFRBYnN0cmFjdEZpbGUsIFRGaWxlIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmV4cG9ydCB0eXBlIFVwbG9hZFRhc2sgPSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5vdGVQYXRoOiBzdHJpbmc7XG4gIHBsYWNlaG9sZGVyOiBzdHJpbmc7XG4gIG1pbWVUeXBlOiBzdHJpbmc7XG4gIGZpbGVOYW1lOiBzdHJpbmc7XG4gIGRhdGFCYXNlNjQ6IHN0cmluZztcbiAgYXR0ZW1wdHM6IG51bWJlcjtcbiAgY3JlYXRlZEF0OiBudW1iZXI7XG4gIGxhc3RFcnJvcj86IHN0cmluZztcbn07XG5cbnR5cGUgU2VjdXJlV2ViZGF2VXBsb2FkUXVldWVEZXBzID0ge1xuICBhcHA6IEFwcDtcbiAgdDogKHpoOiBzdHJpbmcsIGVuOiBzdHJpbmcpID0+IHN0cmluZztcbiAgc2V0dGluZ3M6ICgpID0+IHsgbWF4UmV0cnlBdHRlbXB0czogbnVtYmVyOyByZXRyeURlbGF5U2Vjb25kczogbnVtYmVyIH07XG4gIGdldFF1ZXVlOiAoKSA9PiBVcGxvYWRUYXNrW107XG4gIHNldFF1ZXVlOiAocXVldWU6IFVwbG9hZFRhc2tbXSkgPT4gdm9pZDtcbiAgc2F2ZVBsdWdpblN0YXRlOiAoKSA9PiBQcm9taXNlPHZvaWQ+O1xuICBzY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmM6IChub3RlUGF0aDogc3RyaW5nLCByZWFzb246IFwiaW1hZ2UtYWRkXCIgfCBcImltYWdlLXJlbW92ZVwiKSA9PiB2b2lkO1xuICByZXF1ZXN0VXJsOiAob3B0aW9uczoge1xuICAgIHVybDogc3RyaW5nO1xuICAgIG1ldGhvZDogc3RyaW5nO1xuICAgIGhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICAgIGJvZHk/OiBBcnJheUJ1ZmZlcjtcbiAgICBmb2xsb3dSZWRpcmVjdHM/OiBib29sZWFuO1xuICAgIHJlZGlyZWN0Q291bnQ/OiBudW1iZXI7XG4gIH0pID0+IFByb21pc2U8eyBzdGF0dXM6IG51bWJlcjsgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPjsgYXJyYXlCdWZmZXI6IEFycmF5QnVmZmVyIH0+O1xuICBidWlsZFVwbG9hZFVybDogKHJlbW90ZVBhdGg6IHN0cmluZykgPT4gc3RyaW5nO1xuICBidWlsZEF1dGhIZWFkZXI6ICgpID0+IHN0cmluZztcbiAgcHJlcGFyZVVwbG9hZFBheWxvYWQ6IChcbiAgICBiaW5hcnk6IEFycmF5QnVmZmVyLFxuICAgIG1pbWVUeXBlOiBzdHJpbmcsXG4gICAgZmlsZU5hbWU6IHN0cmluZyxcbiAgKSA9PiBQcm9taXNlPHsgYmluYXJ5OiBBcnJheUJ1ZmZlcjsgbWltZVR5cGU6IHN0cmluZzsgZmlsZU5hbWU6IHN0cmluZyB9PjtcbiAgYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnk6IChmaWxlTmFtZTogc3RyaW5nLCBiaW5hcnk6IEFycmF5QnVmZmVyKSA9PiBQcm9taXNlPHN0cmluZz47XG4gIGJ1aWxkUmVtb3RlUGF0aDogKGZpbGVOYW1lOiBzdHJpbmcpID0+IHN0cmluZztcbiAgYnVpbGRTZWN1cmVJbWFnZU1hcmt1cDogKHJlbW90ZVVybDogc3RyaW5nLCBhbHQ6IHN0cmluZykgPT4gc3RyaW5nO1xuICBnZXRNaW1lVHlwZUZyb21GaWxlTmFtZTogKGZpbGVOYW1lOiBzdHJpbmcpID0+IHN0cmluZztcbiAgYXJyYXlCdWZmZXJUb0Jhc2U2NDogKGJ1ZmZlcjogQXJyYXlCdWZmZXIpID0+IHN0cmluZztcbiAgYmFzZTY0VG9BcnJheUJ1ZmZlcjogKGJhc2U2NDogc3RyaW5nKSA9PiBBcnJheUJ1ZmZlcjtcbiAgZXNjYXBlSHRtbDogKHZhbHVlOiBzdHJpbmcpID0+IHN0cmluZztcbiAgZXNjYXBlUmVnRXhwOiAodmFsdWU6IHN0cmluZykgPT4gc3RyaW5nO1xuICBkZXNjcmliZUVycm9yOiAocHJlZml4OiBzdHJpbmcsIGVycm9yOiB1bmtub3duKSA9PiBzdHJpbmc7XG59O1xuXG4vLyBPd25zIHRoZSBxdWV1ZWQgaW1hZ2UgdXBsb2FkIHdvcmtmbG93IHNvIHN5bmMgYW5kIG5vdGUgbG9naWMgY2FuIHN0YXkgc2VwYXJhdGUuXG5leHBvcnQgY2xhc3MgU2VjdXJlV2ViZGF2VXBsb2FkUXVldWVTdXBwb3J0IHtcbiAgcHJpdmF0ZSBwcm9jZXNzaW5nVGFza0lkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIHJldHJ5VGltZW91dHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICBwcml2YXRlIHBlbmRpbmdUYXNrUHJvbWlzZXMgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTx2b2lkPj4oKTtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGRlcHM6IFNlY3VyZVdlYmRhdlVwbG9hZFF1ZXVlRGVwcykge31cblxuICBkaXNwb3NlKCkge1xuICAgIGZvciAoY29uc3QgdGltZW91dElkIG9mIHRoaXMucmV0cnlUaW1lb3V0cy52YWx1ZXMoKSkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xuICAgIH1cbiAgICB0aGlzLnJldHJ5VGltZW91dHMuY2xlYXIoKTtcbiAgfVxuXG4gIGhhc1BlbmRpbmdXb3JrKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmRlcHMuZ2V0UXVldWUoKS5sZW5ndGggPiAwIHx8XG4gICAgICB0aGlzLnByb2Nlc3NpbmdUYXNrSWRzLnNpemUgPiAwIHx8XG4gICAgICB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMuc2l6ZSA+IDBcbiAgICApO1xuICB9XG5cbiAgaGFzUGVuZGluZ1dvcmtGb3JOb3RlKG5vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBxdWV1ZSA9IHRoaXMuZGVwcy5nZXRRdWV1ZSgpO1xuICAgIGlmIChxdWV1ZS5zb21lKCh0YXNrKSA9PiB0YXNrLm5vdGVQYXRoID09PSBub3RlUGF0aCkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgdGFza0lkIG9mIHRoaXMucHJvY2Vzc2luZ1Rhc2tJZHMpIHtcbiAgICAgIGNvbnN0IHRhc2sgPSBxdWV1ZS5maW5kKChpdGVtKSA9PiBpdGVtLmlkID09PSB0YXNrSWQpO1xuICAgICAgaWYgKHRhc2s/Lm5vdGVQYXRoID09PSBub3RlUGF0aCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IFt0YXNrSWRdIG9mIHRoaXMucGVuZGluZ1Rhc2tQcm9taXNlcykge1xuICAgICAgY29uc3QgdGFzayA9IHF1ZXVlLmZpbmQoKGl0ZW0pID0+IGl0ZW0uaWQgPT09IHRhc2tJZCk7XG4gICAgICBpZiAodGFzaz8ubm90ZVBhdGggPT09IG5vdGVQYXRoKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGFzeW5jIGVucXVldWVFZGl0b3JJbWFnZVVwbG9hZChub3RlRmlsZTogVEZpbGUsIGVkaXRvcjogRWRpdG9yLCBpbWFnZUZpbGU6IEZpbGUsIGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgYXJyYXlCdWZmZXIgPSBhd2FpdCBpbWFnZUZpbGUuYXJyYXlCdWZmZXIoKTtcbiAgICAgIGNvbnN0IHRhc2sgPSB0aGlzLmNyZWF0ZVVwbG9hZFRhc2soXG4gICAgICAgIG5vdGVGaWxlLnBhdGgsXG4gICAgICAgIGFycmF5QnVmZmVyLFxuICAgICAgICBpbWFnZUZpbGUudHlwZSB8fCB0aGlzLmRlcHMuZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUoZmlsZU5hbWUpLFxuICAgICAgICBmaWxlTmFtZSxcbiAgICAgICk7XG4gICAgICB0aGlzLmluc2VydFBsYWNlaG9sZGVyKGVkaXRvciwgdGFzay5wbGFjZWhvbGRlcik7XG4gICAgICB0aGlzLmRlcHMuc2V0UXVldWUoWy4uLnRoaXMuZGVwcy5nZXRRdWV1ZSgpLCB0YXNrXSk7XG4gICAgICBhd2FpdCB0aGlzLmRlcHMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICB2b2lkIHRoaXMucHJvY2Vzc1BlbmRpbmdUYXNrcygpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlcHMudChcIlx1NURGMlx1NTJBMFx1NTE2NVx1NTZGRVx1NzI0N1x1ODFFQVx1NTJBOFx1NEUwQVx1NEYyMFx1OTYxRlx1NTIxN1x1MzAwMlwiLCBcIkltYWdlIGFkZGVkIHRvIHRoZSBhdXRvLXVwbG9hZCBxdWV1ZS5cIikpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHF1ZXVlIHNlY3VyZSBpbWFnZSB1cGxvYWRcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgdGhpcy5kZXBzLmRlc2NyaWJlRXJyb3IoXG4gICAgICAgICAgdGhpcy5kZXBzLnQoXCJcdTUyQTBcdTUxNjVcdTU2RkVcdTcyNDdcdTgxRUFcdTUyQThcdTRFMEFcdTRGMjBcdTk2MUZcdTUyMTdcdTU5MzFcdThEMjVcIiwgXCJGYWlsZWQgdG8gcXVldWUgaW1hZ2UgZm9yIGF1dG8tdXBsb2FkXCIpLFxuICAgICAgICAgIGVycm9yLFxuICAgICAgICApLFxuICAgICAgICA4MDAwLFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBjcmVhdGVVcGxvYWRUYXNrKG5vdGVQYXRoOiBzdHJpbmcsIGJpbmFyeTogQXJyYXlCdWZmZXIsIG1pbWVUeXBlOiBzdHJpbmcsIGZpbGVOYW1lOiBzdHJpbmcpOiBVcGxvYWRUYXNrIHtcbiAgICBjb25zdCBpZCA9IGBzZWN1cmUtd2ViZGF2LXRhc2stJHtEYXRlLm5vdygpfS0ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIsIDgpfWA7XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkLFxuICAgICAgbm90ZVBhdGgsXG4gICAgICBwbGFjZWhvbGRlcjogdGhpcy5idWlsZFBlbmRpbmdQbGFjZWhvbGRlcihpZCwgZmlsZU5hbWUpLFxuICAgICAgbWltZVR5cGUsXG4gICAgICBmaWxlTmFtZSxcbiAgICAgIGRhdGFCYXNlNjQ6IHRoaXMuZGVwcy5hcnJheUJ1ZmZlclRvQmFzZTY0KGJpbmFyeSksXG4gICAgICBhdHRlbXB0czogMCxcbiAgICAgIGNyZWF0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICB9O1xuICB9XG5cbiAgYnVpbGRQZW5kaW5nUGxhY2Vob2xkZXIodGFza0lkOiBzdHJpbmcsIGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBzYWZlTmFtZSA9IHRoaXMuZGVwcy5lc2NhcGVIdG1sKGZpbGVOYW1lKTtcbiAgICByZXR1cm4gYDxzcGFuIGNsYXNzPVwic2VjdXJlLXdlYmRhdi1wZW5kaW5nXCIgZGF0YS1zZWN1cmUtd2ViZGF2LXRhc2s9XCIke3Rhc2tJZH1cIiBhcmlhLWxhYmVsPVwiJHtzYWZlTmFtZX1cIj4ke3RoaXMuZGVwcy5lc2NhcGVIdG1sKHRoaXMuZGVwcy50KGBcdTMwMTBcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTRFMkRcdUZGNUMke2ZpbGVOYW1lfVx1MzAxMWAsIGBbVXBsb2FkaW5nIGltYWdlIHwgJHtmaWxlTmFtZX1dYCkpfTwvc3Bhbj5gO1xuICB9XG5cbiAgYnVpbGRGYWlsZWRQbGFjZWhvbGRlcihmaWxlTmFtZTogc3RyaW5nLCBtZXNzYWdlPzogc3RyaW5nKSB7XG4gICAgY29uc3Qgc2FmZU5hbWUgPSB0aGlzLmRlcHMuZXNjYXBlSHRtbChmaWxlTmFtZSk7XG4gICAgY29uc3Qgc2FmZU1lc3NhZ2UgPSB0aGlzLmRlcHMuZXNjYXBlSHRtbChtZXNzYWdlID8/IHRoaXMuZGVwcy50KFwiXHU2NzJBXHU3N0U1XHU5NTE5XHU4QkVGXCIsIFwiVW5rbm93biBlcnJvclwiKSk7XG4gICAgY29uc3QgbGFiZWwgPSB0aGlzLmRlcHMuZXNjYXBlSHRtbCh0aGlzLmRlcHMudChgXHUzMDEwXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU1OTMxXHU4RDI1XHVGRjVDJHtmaWxlTmFtZX1cdTMwMTFgLCBgW0ltYWdlIHVwbG9hZCBmYWlsZWQgfCAke2ZpbGVOYW1lfV1gKSk7XG4gICAgcmV0dXJuIGA8c3BhbiBjbGFzcz1cInNlY3VyZS13ZWJkYXYtZmFpbGVkXCIgYXJpYS1sYWJlbD1cIiR7c2FmZU5hbWV9XCI+JHtsYWJlbH06ICR7c2FmZU1lc3NhZ2V9PC9zcGFuPmA7XG4gIH1cblxuICBhc3luYyBwcm9jZXNzUGVuZGluZ1Rhc2tzKCkge1xuICAgIGNvbnN0IHJ1bm5pbmc6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuICAgIGZvciAoY29uc3QgdGFzayBvZiB0aGlzLmRlcHMuZ2V0UXVldWUoKSkge1xuICAgICAgaWYgKHRoaXMucHJvY2Vzc2luZ1Rhc2tJZHMuaGFzKHRhc2suaWQpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBydW5uaW5nLnB1c2godGhpcy5zdGFydFBlbmRpbmdUYXNrKHRhc2spKTtcbiAgICB9XG5cbiAgICBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQocnVubmluZyk7XG4gIH1cblxuICBzdGFydFBlbmRpbmdUYXNrKHRhc2s6IFVwbG9hZFRhc2spIHtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMucGVuZGluZ1Rhc2tQcm9taXNlcy5nZXQodGFzay5pZCk7XG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICByZXR1cm4gZXhpc3Rpbmc7XG4gICAgfVxuXG4gICAgY29uc3QgcHJvbWlzZSA9IHRoaXMucHJvY2Vzc1Rhc2sodGFzaykuZmluYWxseSgoKSA9PiB7XG4gICAgICB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMuZGVsZXRlKHRhc2suaWQpO1xuICAgIH0pO1xuICAgIHRoaXMucGVuZGluZ1Rhc2tQcm9taXNlcy5zZXQodGFzay5pZCwgcHJvbWlzZSk7XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICBhc3luYyBwcm9jZXNzVGFzayh0YXNrOiBVcGxvYWRUYXNrKSB7XG4gICAgdGhpcy5wcm9jZXNzaW5nVGFza0lkcy5hZGQodGFzay5pZCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGJpbmFyeSA9IHRoaXMuZGVwcy5iYXNlNjRUb0FycmF5QnVmZmVyKHRhc2suZGF0YUJhc2U2NCk7XG4gICAgICBjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRoaXMuZGVwcy5wcmVwYXJlVXBsb2FkUGF5bG9hZChcbiAgICAgICAgYmluYXJ5LFxuICAgICAgICB0YXNrLm1pbWVUeXBlIHx8IHRoaXMuZGVwcy5nZXRNaW1lVHlwZUZyb21GaWxlTmFtZSh0YXNrLmZpbGVOYW1lKSxcbiAgICAgICAgdGFzay5maWxlTmFtZSxcbiAgICAgICk7XG4gICAgICBjb25zdCByZW1vdGVOYW1lID0gYXdhaXQgdGhpcy5kZXBzLmJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5KHByZXBhcmVkLmZpbGVOYW1lLCBwcmVwYXJlZC5iaW5hcnkpO1xuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuZGVwcy5idWlsZFJlbW90ZVBhdGgocmVtb3RlTmFtZSk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZGVwcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmRlcHMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICAgIG1ldGhvZDogXCJQVVRcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuZGVwcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBwcmVwYXJlZC5taW1lVHlwZSxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogcHJlcGFyZWQuYmluYXJ5LFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVwbG9hZCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlcGxhY2VkID0gYXdhaXQgdGhpcy5yZXBsYWNlUGxhY2Vob2xkZXIoXG4gICAgICAgIHRhc2subm90ZVBhdGgsXG4gICAgICAgIHRhc2suaWQsXG4gICAgICAgIHRhc2sucGxhY2Vob2xkZXIsXG4gICAgICAgIHRoaXMuZGVwcy5idWlsZFNlY3VyZUltYWdlTWFya3VwKGB3ZWJkYXYtc2VjdXJlOi8vJHtyZW1vdGVQYXRofWAsIHByZXBhcmVkLmZpbGVOYW1lKSxcbiAgICAgICk7XG4gICAgICBpZiAoIXJlcGxhY2VkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICB0aGlzLmRlcHMudChcbiAgICAgICAgICAgIFwiXHU0RTBBXHU0RjIwXHU2MjEwXHU1MjlGXHVGRjBDXHU0RjQ2XHU2Q0ExXHU2NzA5XHU1NzI4XHU3QjE0XHU4QkIwXHU0RTJEXHU2MjdFXHU1MjMwXHU1M0VGXHU2NkZGXHU2MzYyXHU3Njg0XHU1MzYwXHU0RjREXHU3QjI2XHUzMDAyXCIsXG4gICAgICAgICAgICBcIlVwbG9hZCBzdWNjZWVkZWQsIGJ1dCBubyBtYXRjaGluZyBwbGFjZWhvbGRlciB3YXMgZm91bmQgaW4gdGhlIG5vdGUuXCIsXG4gICAgICAgICAgKSxcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5kZXBzLnNldFF1ZXVlKHRoaXMuZGVwcy5nZXRRdWV1ZSgpLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5pZCAhPT0gdGFzay5pZCkpO1xuICAgICAgYXdhaXQgdGhpcy5kZXBzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgdGhpcy5kZXBzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyh0YXNrLm5vdGVQYXRoLCBcImltYWdlLWFkZFwiKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXBzLnQoXCJcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTYyMTBcdTUyOUZcdTMwMDJcIiwgXCJJbWFnZSB1cGxvYWRlZCBzdWNjZXNzZnVsbHkuXCIpKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIlNlY3VyZSBXZWJEQVYgcXVldWVkIHVwbG9hZCBmYWlsZWRcIiwgZXJyb3IpO1xuICAgICAgdGFzay5hdHRlbXB0cyArPSAxO1xuICAgICAgdGFzay5sYXN0RXJyb3IgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG4gICAgICBhd2FpdCB0aGlzLmRlcHMuc2F2ZVBsdWdpblN0YXRlKCk7XG5cbiAgICAgIGlmICh0YXNrLmF0dGVtcHRzID49IHRoaXMuZGVwcy5zZXR0aW5ncygpLm1heFJldHJ5QXR0ZW1wdHMpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5yZXBsYWNlUGxhY2Vob2xkZXIoXG4gICAgICAgICAgdGFzay5ub3RlUGF0aCxcbiAgICAgICAgICB0YXNrLmlkLFxuICAgICAgICAgIHRhc2sucGxhY2Vob2xkZXIsXG4gICAgICAgICAgdGhpcy5idWlsZEZhaWxlZFBsYWNlaG9sZGVyKHRhc2suZmlsZU5hbWUsIHRhc2subGFzdEVycm9yKSxcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5kZXBzLnNldFF1ZXVlKHRoaXMuZGVwcy5nZXRRdWV1ZSgpLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5pZCAhPT0gdGFzay5pZCkpO1xuICAgICAgICBhd2FpdCB0aGlzLmRlcHMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXBzLmRlc2NyaWJlRXJyb3IodGhpcy5kZXBzLnQoXCJcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTY3MDBcdTdFQzhcdTU5MzFcdThEMjVcIiwgXCJJbWFnZSB1cGxvYWQgZmFpbGVkIHBlcm1hbmVudGx5XCIpLCBlcnJvciksIDgwMDApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5zY2hlZHVsZVJldHJ5KHRhc2spO1xuICAgICAgfVxuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLnByb2Nlc3NpbmdUYXNrSWRzLmRlbGV0ZSh0YXNrLmlkKTtcbiAgICB9XG4gIH1cblxuICBzY2hlZHVsZVJldHJ5KHRhc2s6IFVwbG9hZFRhc2spIHtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMucmV0cnlUaW1lb3V0cy5nZXQodGFzay5pZCk7XG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KGV4aXN0aW5nKTtcbiAgICB9XG5cbiAgICBjb25zdCBkZWxheSA9IE1hdGgubWF4KDEsIHRoaXMuZGVwcy5zZXR0aW5ncygpLnJldHJ5RGVsYXlTZWNvbmRzKSAqIDEwMDAgKiB0YXNrLmF0dGVtcHRzO1xuICAgIGNvbnN0IHRpbWVvdXRJZCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRoaXMucmV0cnlUaW1lb3V0cy5kZWxldGUodGFzay5pZCk7XG4gICAgICB2b2lkIHRoaXMuc3RhcnRQZW5kaW5nVGFzayh0YXNrKTtcbiAgICB9LCBkZWxheSk7XG4gICAgdGhpcy5yZXRyeVRpbWVvdXRzLnNldCh0YXNrLmlkLCB0aW1lb3V0SWQpO1xuICB9XG5cbiAgcHJpdmF0ZSBpbnNlcnRQbGFjZWhvbGRlcihlZGl0b3I6IEVkaXRvciwgcGxhY2Vob2xkZXI6IHN0cmluZykge1xuICAgIGVkaXRvci5yZXBsYWNlU2VsZWN0aW9uKGAke3BsYWNlaG9sZGVyfVxcbmApO1xuICB9XG5cbiAgYXN5bmMgcmVwbGFjZVBsYWNlaG9sZGVyKG5vdGVQYXRoOiBzdHJpbmcsIHRhc2tJZDogc3RyaW5nLCBwbGFjZWhvbGRlcjogc3RyaW5nLCByZXBsYWNlbWVudDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVwbGFjZWRJbkVkaXRvciA9IHRoaXMucmVwbGFjZVBsYWNlaG9sZGVySW5PcGVuRWRpdG9ycyhub3RlUGF0aCwgdGFza0lkLCBwbGFjZWhvbGRlciwgcmVwbGFjZW1lbnQpO1xuICAgIGlmIChyZXBsYWNlZEluRWRpdG9yKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBjb25zdCBmaWxlID0gdGhpcy5kZXBzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgobm90ZVBhdGgpO1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5kZXBzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGlmIChjb250ZW50LmluY2x1ZGVzKHBsYWNlaG9sZGVyKSkge1xuICAgICAgY29uc3QgdXBkYXRlZCA9IGNvbnRlbnQucmVwbGFjZShwbGFjZWhvbGRlciwgcmVwbGFjZW1lbnQpO1xuICAgICAgaWYgKHVwZGF0ZWQgIT09IGNvbnRlbnQpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5kZXBzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdXBkYXRlZCk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHBhdHRlcm4gPSBuZXcgUmVnRXhwKFxuICAgICAgYDxzcGFuW14+XSpkYXRhLXNlY3VyZS13ZWJkYXYtdGFzaz1cIiR7dGhpcy5kZXBzLmVzY2FwZVJlZ0V4cCh0YXNrSWQpfVwiW14+XSo+Lio/PFxcXFwvc3Bhbj5gLFxuICAgICAgXCJzXCIsXG4gICAgKTtcbiAgICBpZiAocGF0dGVybi50ZXN0KGNvbnRlbnQpKSB7XG4gICAgICBjb25zdCB1cGRhdGVkID0gY29udGVudC5yZXBsYWNlKHBhdHRlcm4sIHJlcGxhY2VtZW50KTtcbiAgICAgIGlmICh1cGRhdGVkICE9PSBjb250ZW50KSB7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVwcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIHVwZGF0ZWQpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBwcml2YXRlIHJlcGxhY2VQbGFjZWhvbGRlckluT3BlbkVkaXRvcnMobm90ZVBhdGg6IHN0cmluZywgdGFza0lkOiBzdHJpbmcsIHBsYWNlaG9sZGVyOiBzdHJpbmcsIHJlcGxhY2VtZW50OiBzdHJpbmcpIHtcbiAgICBsZXQgcmVwbGFjZWQgPSBmYWxzZTtcbiAgICBjb25zdCBsZWF2ZXMgPSB0aGlzLmRlcHMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoXCJtYXJrZG93blwiKTtcblxuICAgIGZvciAoY29uc3QgbGVhZiBvZiBsZWF2ZXMpIHtcbiAgICAgIGNvbnN0IHZpZXcgPSBsZWFmLnZpZXc7XG4gICAgICBpZiAoISh2aWV3IGluc3RhbmNlb2YgTWFya2Rvd25WaWV3KSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCF2aWV3LmZpbGUgfHwgdmlldy5maWxlLnBhdGggIT09IG5vdGVQYXRoKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBlZGl0b3IgPSB2aWV3LmVkaXRvcjtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBlZGl0b3IuZ2V0VmFsdWUoKTtcbiAgICAgIGxldCB1cGRhdGVkID0gY29udGVudDtcblxuICAgICAgaWYgKGNvbnRlbnQuaW5jbHVkZXMocGxhY2Vob2xkZXIpKSB7XG4gICAgICAgIHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGxhY2Vob2xkZXIsIHJlcGxhY2VtZW50KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHBhdHRlcm4gPSBuZXcgUmVnRXhwKFxuICAgICAgICAgIGA8c3BhbltePl0qZGF0YS1zZWN1cmUtd2ViZGF2LXRhc2s9XCIke3RoaXMuZGVwcy5lc2NhcGVSZWdFeHAodGFza0lkKX1cIltePl0qPi4qPzxcXFxcL3NwYW4+YCxcbiAgICAgICAgICBcInNcIixcbiAgICAgICAgKTtcbiAgICAgICAgdXBkYXRlZCA9IGNvbnRlbnQucmVwbGFjZShwYXR0ZXJuLCByZXBsYWNlbWVudCk7XG4gICAgICB9XG5cbiAgICAgIGlmICh1cGRhdGVkICE9PSBjb250ZW50KSB7XG4gICAgICAgIGVkaXRvci5zZXRWYWx1ZSh1cGRhdGVkKTtcbiAgICAgICAgcmVwbGFjZWQgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZXBsYWNlZDtcbiAgfVxufVxuIiwgImltcG9ydCB7IEFwcCwgVEZpbGUsIFRGb2xkZXIsIG5vcm1hbGl6ZVBhdGggfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuZXhwb3J0IHR5cGUgRGVsZXRpb25Ub21ic3RvbmUgPSB7XG4gIHBhdGg6IHN0cmluZztcbiAgZGVsZXRlZEF0OiBudW1iZXI7XG4gIHJlbW90ZVNpZ25hdHVyZT86IHN0cmluZztcbn07XG5cbmV4cG9ydCB0eXBlIFJlbW90ZUZpbGVMaWtlID0ge1xuICByZW1vdGVQYXRoOiBzdHJpbmc7XG4gIGxhc3RNb2RpZmllZDogbnVtYmVyO1xuICBzaXplOiBudW1iZXI7XG4gIHNpZ25hdHVyZTogc3RyaW5nO1xufTtcblxudHlwZSBTZWN1cmVXZWJkYXZTeW5jU3VwcG9ydERlcHMgPSB7XG4gIGFwcDogQXBwO1xuICBnZXRWYXVsdFN5bmNSZW1vdGVGb2xkZXI6ICgpID0+IHN0cmluZztcbiAgZ2V0RXhjbHVkZWRTeW5jRm9sZGVycz86ICgpID0+IHN0cmluZ1tdO1xuICBkZWxldGlvbkZvbGRlclN1ZmZpeDogc3RyaW5nO1xuICBlbmNvZGVCYXNlNjRVcmw6ICh2YWx1ZTogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIGRlY29kZUJhc2U2NFVybDogKHZhbHVlOiBzdHJpbmcpID0+IHN0cmluZztcbn07XG5cbi8vIEtlZXAgc3luYyBtZXRhZGF0YSBhbmQgdG9tYnN0b25lIHJ1bGVzIGlzb2xhdGVkIHNvIHF1ZXVlL3JlbmRlcmluZyBjaGFuZ2VzXG4vLyBkbyBub3QgYWNjaWRlbnRhbGx5IGFmZmVjdCByZWNvbmNpbGlhdGlvbiBiZWhhdmlvdXIuXG5leHBvcnQgY2xhc3MgU2VjdXJlV2ViZGF2U3luY1N1cHBvcnQge1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGRlcHM6IFNlY3VyZVdlYmRhdlN5bmNTdXBwb3J0RGVwcykge31cblxuICBpc0V4Y2x1ZGVkU3luY1BhdGgocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZFBhdGggPSBub3JtYWxpemVQYXRoKHBhdGgpLnJlcGxhY2UoL15cXC8rLywgXCJcIikucmVwbGFjZSgvXFwvKyQvLCBcIlwiKTtcbiAgICBpZiAoIW5vcm1hbGl6ZWRQYXRoKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgZm9sZGVycyA9IHRoaXMuZGVwcy5nZXRFeGNsdWRlZFN5bmNGb2xkZXJzPy4oKSA/PyBbXTtcbiAgICByZXR1cm4gZm9sZGVycy5zb21lKChmb2xkZXIpID0+IHtcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWRGb2xkZXIgPSBub3JtYWxpemVQYXRoKGZvbGRlcikucmVwbGFjZSgvXlxcLysvLCBcIlwiKS5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpO1xuICAgICAgcmV0dXJuIG5vcm1hbGl6ZWRGb2xkZXIubGVuZ3RoID4gMCAmJiAobm9ybWFsaXplZFBhdGggPT09IG5vcm1hbGl6ZWRGb2xkZXIgfHwgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChgJHtub3JtYWxpemVkRm9sZGVyfS9gKSk7XG4gICAgfSk7XG4gIH1cblxuICBzaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKHBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gbm9ybWFsaXplUGF0aChwYXRoKTtcbiAgICBpZiAoXG4gICAgICB0aGlzLmlzRXhjbHVkZWRTeW5jUGF0aChub3JtYWxpemVkUGF0aCkgfHxcbiAgICAgIG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIub2JzaWRpYW4vXCIpIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwiLnRyYXNoL1wiKSB8fFxuICAgICAgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIi5naXQvXCIpIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwibm9kZV9tb2R1bGVzL1wiKSB8fFxuICAgICAgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIl9wbHVnaW5fcGFja2FnZXMvXCIpIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwiLnRtcC1cIikgfHxcbiAgICAgIG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIub2JzaWRpYW4vcGx1Z2lucy9zZWN1cmUtd2ViZGF2LWltYWdlcy9cIilcbiAgICApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiAvXFwuKHBuZ3xqcGU/Z3xnaWZ8d2VicHxibXB8c3ZnKSQvaS50ZXN0KG5vcm1hbGl6ZWRQYXRoKTtcbiAgfVxuXG4gIHNob3VsZFNraXBEaXJlY3RvcnlTeW5jUGF0aChkaXJQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBwID0gbm9ybWFsaXplUGF0aChkaXJQYXRoKTtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5pc0V4Y2x1ZGVkU3luY1BhdGgocCkgfHxcbiAgICAgIHAuc3RhcnRzV2l0aChcIi5vYnNpZGlhblwiKSB8fFxuICAgICAgcC5zdGFydHNXaXRoKFwiLnRyYXNoXCIpIHx8XG4gICAgICBwLnN0YXJ0c1dpdGgoXCIuZ2l0XCIpIHx8XG4gICAgICBwLnN0YXJ0c1dpdGgoXCJub2RlX21vZHVsZXNcIikgfHxcbiAgICAgIHAuc3RhcnRzV2l0aChcIl9wbHVnaW5fcGFja2FnZXNcIikgfHxcbiAgICAgIHAuc3RhcnRzV2l0aChcIi50bXAtXCIpXG4gICAgKTtcbiAgfVxuXG4gIGNvbGxlY3RMb2NhbFN5bmNlZERpcmVjdG9yaWVzKCkge1xuICAgIGNvbnN0IGRpcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBmb3IgKGNvbnN0IGYgb2YgdGhpcy5kZXBzLmFwcC52YXVsdC5nZXRBbGxGb2xkZXJzKCkpIHtcbiAgICAgIGlmIChmIGluc3RhbmNlb2YgVEZvbGRlciAmJiAhZi5pc1Jvb3QoKSAmJiAhdGhpcy5zaG91bGRTa2lwRGlyZWN0b3J5U3luY1BhdGgoZi5wYXRoKSkge1xuICAgICAgICBkaXJzLmFkZChub3JtYWxpemVQYXRoKGYucGF0aCkpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZGlycztcbiAgfVxuXG4gIGNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpIHtcbiAgICByZXR1cm4gdGhpcy5kZXBzLmFwcC52YXVsdFxuICAgICAgLmdldEZpbGVzKClcbiAgICAgIC5maWx0ZXIoKGZpbGUpID0+ICF0aGlzLnNob3VsZFNraXBDb250ZW50U3luY1BhdGgoZmlsZS5wYXRoKSlcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBhLnBhdGgubG9jYWxlQ29tcGFyZShiLnBhdGgpKTtcbiAgfVxuXG4gIGJ1aWxkU3luY1NpZ25hdHVyZShmaWxlOiBURmlsZSkge1xuICAgIHJldHVybiBgJHtmaWxlLnN0YXQubXRpbWV9OiR7ZmlsZS5zdGF0LnNpemV9YDtcbiAgfVxuXG4gIGJ1aWxkUmVtb3RlU3luY1NpZ25hdHVyZShyZW1vdGU6IFBpY2s8UmVtb3RlRmlsZUxpa2UsIFwibGFzdE1vZGlmaWVkXCIgfCBcInNpemVcIj4pIHtcbiAgICByZXR1cm4gYCR7cmVtb3RlLmxhc3RNb2RpZmllZH06JHtyZW1vdGUuc2l6ZX1gO1xuICB9XG5cbiAgYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGAke3RoaXMubm9ybWFsaXplRm9sZGVyKHRoaXMuZGVwcy5nZXRWYXVsdFN5bmNSZW1vdGVGb2xkZXIoKSl9JHt2YXVsdFBhdGh9YDtcbiAgfVxuXG4gIGJ1aWxkRGVsZXRpb25Gb2xkZXIoKSB7XG4gICAgcmV0dXJuIGAke3RoaXMubm9ybWFsaXplRm9sZGVyKHRoaXMuZGVwcy5nZXRWYXVsdFN5bmNSZW1vdGVGb2xkZXIoKSkucmVwbGFjZSgvXFwvJC8sIFwiXCIpfSR7dGhpcy5kZXBzLmRlbGV0aW9uRm9sZGVyU3VmZml4fWA7XG4gIH1cblxuICBidWlsZERlbGV0aW9uUmVtb3RlUGF0aCh2YXVsdFBhdGg6IHN0cmluZykge1xuICAgIHJldHVybiBgJHt0aGlzLmJ1aWxkRGVsZXRpb25Gb2xkZXIoKX0ke3RoaXMuZGVwcy5lbmNvZGVCYXNlNjRVcmwodmF1bHRQYXRoKX0uanNvbmA7XG4gIH1cblxuICByZW1vdGVEZWxldGlvblBhdGhUb1ZhdWx0UGF0aChyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCByb290ID0gdGhpcy5idWlsZERlbGV0aW9uRm9sZGVyKCk7XG4gICAgaWYgKCFyZW1vdGVQYXRoLnN0YXJ0c1dpdGgocm9vdCkgfHwgIXJlbW90ZVBhdGguZW5kc1dpdGgoXCIuanNvblwiKSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgZW5jb2RlZCA9IHJlbW90ZVBhdGguc2xpY2Uocm9vdC5sZW5ndGgsIC1cIi5qc29uXCIubGVuZ3RoKTtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIHRoaXMuZGVwcy5kZWNvZGVCYXNlNjRVcmwoZW5jb2RlZCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cblxuICBwYXJzZURlbGV0aW9uVG9tYnN0b25lUGF5bG9hZChyYXc6IHN0cmluZyk6IERlbGV0aW9uVG9tYnN0b25lIHwgbnVsbCB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KTtcbiAgICAgIGlmICghcGFyc2VkIHx8IHR5cGVvZiBwYXJzZWQucGF0aCAhPT0gXCJzdHJpbmdcIiB8fCB0eXBlb2YgcGFyc2VkLmRlbGV0ZWRBdCAhPT0gXCJudW1iZXJcIikge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIGlmIChwYXJzZWQucmVtb3RlU2lnbmF0dXJlICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIHBhcnNlZC5yZW1vdGVTaWduYXR1cmUgIT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICByZXR1cm4ge1xuICAgICAgICBwYXRoOiBwYXJzZWQucGF0aCxcbiAgICAgICAgZGVsZXRlZEF0OiBwYXJzZWQuZGVsZXRlZEF0LFxuICAgICAgICByZW1vdGVTaWduYXR1cmU6IHBhcnNlZC5yZW1vdGVTaWduYXR1cmUsXG4gICAgICB9O1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgcmVtb3RlUGF0aFRvVmF1bHRQYXRoKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHJvb3QgPSB0aGlzLm5vcm1hbGl6ZUZvbGRlcih0aGlzLmRlcHMuZ2V0VmF1bHRTeW5jUmVtb3RlRm9sZGVyKCkpO1xuICAgIGlmICghcmVtb3RlUGF0aC5zdGFydHNXaXRoKHJvb3QpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVtb3RlUGF0aC5zbGljZShyb290Lmxlbmd0aCkucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcbiAgfVxuXG4gIHNob3VsZERvd25sb2FkUmVtb3RlVmVyc2lvbihsb2NhbE10aW1lOiBudW1iZXIsIHJlbW90ZU10aW1lOiBudW1iZXIpIHtcbiAgICByZXR1cm4gcmVtb3RlTXRpbWUgPiBsb2NhbE10aW1lICsgMjAwMDtcbiAgfVxuXG4gIGlzVG9tYnN0b25lQXV0aG9yaXRhdGl2ZShcbiAgICB0b21ic3RvbmU6IERlbGV0aW9uVG9tYnN0b25lLFxuICAgIHJlbW90ZT86IFBpY2s8UmVtb3RlRmlsZUxpa2UsIFwibGFzdE1vZGlmaWVkXCIgfCBcInNpZ25hdHVyZVwiPiB8IG51bGwsXG4gICkge1xuICAgIGNvbnN0IGdyYWNlTXMgPSA1MDAwO1xuICAgIGlmICghcmVtb3RlKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAodG9tYnN0b25lLnJlbW90ZVNpZ25hdHVyZSkge1xuICAgICAgcmV0dXJuIHJlbW90ZS5zaWduYXR1cmUgPT09IHRvbWJzdG9uZS5yZW1vdGVTaWduYXR1cmU7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlbW90ZS5sYXN0TW9kaWZpZWQgPD0gdG9tYnN0b25lLmRlbGV0ZWRBdCArIGdyYWNlTXM7XG4gIH1cblxuICBzaG91bGREZWxldGVMb2NhbEZyb21Ub21ic3RvbmUoZmlsZTogVEZpbGUsIHRvbWJzdG9uZTogRGVsZXRpb25Ub21ic3RvbmUpIHtcbiAgICBjb25zdCBncmFjZU1zID0gNTAwMDtcbiAgICByZXR1cm4gZmlsZS5zdGF0Lm10aW1lIDw9IHRvbWJzdG9uZS5kZWxldGVkQXQgKyBncmFjZU1zO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVGb2xkZXIoaW5wdXQ6IHN0cmluZykge1xuICAgIHJldHVybiBub3JtYWxpemVGb2xkZXIoaW5wdXQpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVGb2xkZXIoaW5wdXQ6IHN0cmluZykge1xuICByZXR1cm4gaW5wdXQucmVwbGFjZSgvXlxcLysvLCBcIlwiKS5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpICsgXCIvXCI7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQyxJQUFBQSxtQkFlTTs7O0FDZlAsc0JBQWtFO0FB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QzNFLGVBQU8sWUFBWSxJQUFJO0FBQ3ZCLFlBQUk7QUFDRixnQkFBTSxLQUFLLE9BQU8sd0JBQXdCLElBQUk7QUFDOUMsZUFBSyxRQUFRO0FBQUEsUUFDZixVQUFFO0FBQ0EsaUJBQU8sWUFBWSxLQUFLO0FBQUEsUUFDMUI7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNILEVBQ0M7QUFBQSxNQUFVLENBQUMsV0FDVixPQUFPLGNBQWMsS0FBSyxPQUFPLEVBQUUsNEJBQVEsZ0JBQWdCLENBQUMsRUFBRSxRQUFRLFlBQVk7QUFDaEYsZUFBTyxZQUFZLElBQUk7QUFDdkIsWUFBSTtBQUNGLGdCQUFNLEtBQUssT0FBTywyQkFBMkIsSUFBSTtBQUNqRCxlQUFLLFFBQVE7QUFBQSxRQUNmLFVBQUU7QUFDQSxpQkFBTyxZQUFZLEtBQUs7QUFBQSxRQUMxQjtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0g7QUFFRixnQkFBWSxTQUFTLE1BQU0sRUFBRSxNQUFNLEtBQUssT0FBTyxFQUFFLGtDQUFTLGdCQUFnQixFQUFFLENBQUM7QUFFN0UsUUFBSSx5QkFBUSxXQUFXLEVBQ3BCLFFBQVEsS0FBSyxPQUFPLEVBQUUsZ0VBQWMsc0NBQXNDLENBQUMsRUFDM0U7QUFBQSxNQUNDLEtBQUssT0FBTztBQUFBLFFBQ1Y7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0YsRUFDQztBQUFBLE1BQVUsQ0FBQyxXQUNWLE9BQU8sY0FBYyxLQUFLLE9BQU8sRUFBRSw0QkFBUSxlQUFlLENBQUMsRUFBRSxRQUFRLFlBQVk7QUFDL0UsZUFBTyxZQUFZLElBQUk7QUFDdkIsWUFBSTtBQUNGLGdCQUFNLEtBQUssT0FBTyw2QkFBNkI7QUFBQSxRQUNqRCxVQUFFO0FBQ0EsaUJBQU8sWUFBWSxLQUFLO0FBQUEsUUFDMUI7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDSjtBQUNGO0FBRUEsSUFBTSxjQUFOLGNBQTBCLHVCQUFNO0FBQUEsRUFJOUIsWUFBWSxLQUFVLFdBQW1CLFVBQWtCO0FBQ3pELFVBQU0sR0FBRztBQUNULFNBQUssWUFBWTtBQUNqQixTQUFLLFdBQVc7QUFBQSxFQUNsQjtBQUFBLEVBRUEsU0FBZTtBQUNiLFVBQU0sRUFBRSxVQUFVLElBQUk7QUFDdEIsY0FBVSxNQUFNO0FBQ2hCLGNBQVUsU0FBUyxNQUFNLEVBQUUsTUFBTSxLQUFLLFVBQVUsQ0FBQztBQUNqRCxjQUFVLFNBQVMsS0FBSyxFQUFFLE1BQU0sS0FBSyxTQUFTLENBQUM7QUFBQSxFQUNqRDtBQUFBLEVBRUEsVUFBZ0I7QUFDZCxTQUFLLFVBQVUsTUFBTTtBQUFBLEVBQ3ZCO0FBQ0Y7IiwKICAibmFtZXMiOiBbImltcG9ydF9vYnNpZGlhbiIsICJpbXBvcnRfb2JzaWRpYW4iLCAiaW1wb3J0X29ic2lkaWFuIiwgImRvY3VtZW50IiwgInRvbWJzdG9uZSIsICJvYnNpZGlhblJlcXVlc3RVcmwiXQp9Cg==
