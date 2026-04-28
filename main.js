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
      await this.syncPendingVaultContent(false);
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
    const counts = { uploaded: 0, deletedRemoteFiles: 0, skipped: 0 };
    try {
      this.ensureConfigured();
      await this.waitForPendingVaultMutations();
      const uploadsReady = await this.preparePendingUploadsForSync(showNotice);
      if (!uploadsReady) {
        return;
      }
      await this.processPendingVaultDeletions(counts);
      await this.processPendingVaultUploads(counts);
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.t(
        `\u5DF2\u5FEB\u901F\u540C\u6B65\uFF1A\u4E0A\u4F20 ${counts.uploaded} \u4E2A\u6587\u4EF6\uFF0C\u5220\u9664\u8FDC\u7AEF\u5185\u5BB9 ${counts.deletedRemoteFiles} \u4E2A\uFF0C\u8DF3\u8FC7 ${counts.skipped} \u4E2A\u6587\u4EF6\u3002`,
        `Fast sync uploaded ${counts.uploaded} file(s), deleted ${counts.deletedRemoteFiles} remote content file(s), and skipped ${counts.skipped} file(s).`
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
        this.markPendingVaultDeletion(path);
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
${this.plugin.t("\u8BF4\u660E\uFF1A\u5FEB\u901F\u540C\u6B65\u53EA\u5904\u7406\u672C\u673A\u53D8\u66F4\u961F\u5217\uFF1B\u5B8C\u6574\u5BF9\u8D26\u4F1A\u626B\u63CF\u672C\u5730\u4E0E\u8FDC\u7AEF\u5DEE\u5F02\u5E76\u6E05\u7406\u8FDC\u7AEF\u5197\u4F59\u5185\u5BB9\u3002\u56FE\u7247\u4E0A\u4F20\u4ECD\u7531\u72EC\u7ACB\u961F\u5217\u5904\u7406\u3002", "Note: Fast sync only processes locally changed paths. Full reconcile scans local and remote differences and cleans extra remote content. Image uploads continue to be handled by the separate queue.")}`,
        `${this.plugin.formatLastSyncLabel()}
${this.plugin.formatSyncStatusLabel()}
${this.plugin.t("\u8BF4\u660E\uFF1A\u5FEB\u901F\u540C\u6B65\u53EA\u5904\u7406\u672C\u673A\u53D8\u66F4\u961F\u5217\uFF1B\u5B8C\u6574\u5BF9\u8D26\u4F1A\u626B\u63CF\u672C\u5730\u4E0E\u8FDC\u7AEF\u5DEE\u5F02\u5E76\u6E05\u7406\u8FDC\u7AEF\u5197\u4F59\u5185\u5BB9\u3002\u56FE\u7247\u4E0A\u4F20\u4ECD\u7531\u72EC\u7ACB\u961F\u5217\u5904\u7406\u3002", "Note: Fast sync only processes locally changed paths. Full reconcile scans local and remote differences and cleans extra remote content. Image uploads continue to be handled by the separate queue.")}`
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyIsICJzZWN1cmUtd2ViZGF2LWltYWdlLXN1cHBvcnQudHMiLCAic2VjdXJlLXdlYmRhdi11cGxvYWQtcXVldWUudHMiLCAic2VjdXJlLXdlYmRhdi1zeW5jLXN1cHBvcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIlx1RkVGRmltcG9ydCB7XG4gIEFwcCxcbiAgRWRpdG9yLFxuICBNYXJrZG93bkZpbGVJbmZvLFxuICBNYXJrZG93blZpZXcsXG4gIE1vZGFsLFxuICBOb3RpY2UsXG4gIFBsdWdpbixcbiAgUGx1Z2luU2V0dGluZ1RhYixcbiAgU2V0dGluZyxcbiAgVEFic3RyYWN0RmlsZSxcbiAgVEZpbGUsXG4gIFRGb2xkZXIsXG4gIG5vcm1hbGl6ZVBhdGgsXG4gIHJlcXVlc3RVcmwgYXMgb2JzaWRpYW5SZXF1ZXN0VXJsLFxufSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7IFNFQ1VSRV9DT0RFX0JMT0NLLCBTRUNVUkVfUFJPVE9DT0wsIFNlY3VyZVdlYmRhdkltYWdlU3VwcG9ydCB9IGZyb20gXCIuL3NlY3VyZS13ZWJkYXYtaW1hZ2Utc3VwcG9ydFwiO1xuaW1wb3J0IHsgU2VjdXJlV2ViZGF2VXBsb2FkUXVldWVTdXBwb3J0LCB0eXBlIFVwbG9hZFRhc2sgfSBmcm9tIFwiLi9zZWN1cmUtd2ViZGF2LXVwbG9hZC1xdWV1ZVwiO1xuaW1wb3J0IHtcbiAgU2VjdXJlV2ViZGF2U3luY1N1cHBvcnQsXG4gIHR5cGUgRGVsZXRpb25Ub21ic3RvbmUsXG4gIG5vcm1hbGl6ZUZvbGRlcixcbn0gZnJvbSBcIi4vc2VjdXJlLXdlYmRhdi1zeW5jLXN1cHBvcnRcIjtcblxudHlwZSBTZWN1cmVXZWJkYXZTZXR0aW5ncyA9IHtcbiAgd2ViZGF2VXJsOiBzdHJpbmc7XG4gIHVzZXJuYW1lOiBzdHJpbmc7XG4gIHBhc3N3b3JkOiBzdHJpbmc7XG4gIHJlbW90ZUZvbGRlcjogc3RyaW5nO1xuICB2YXVsdFN5bmNSZW1vdGVGb2xkZXI6IHN0cmluZztcbiAgZXhjbHVkZWRTeW5jRm9sZGVyczogc3RyaW5nW107XG4gIG5hbWluZ1N0cmF0ZWd5OiBcInRpbWVzdGFtcFwiIHwgXCJoYXNoXCI7XG4gIGRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQ6IGJvb2xlYW47XG4gIGxhbmd1YWdlOiBcImF1dG9cIiB8IFwiemhcIiB8IFwiZW5cIjtcbiAgbm90ZVN0b3JhZ2VNb2RlOiBcImZ1bGwtbG9jYWxcIiB8IFwibGF6eS1ub3Rlc1wiO1xuICBub3RlRXZpY3RBZnRlckRheXM6IG51bWJlcjtcbiAgYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXM6IG51bWJlcjtcbiAgbWF4UmV0cnlBdHRlbXB0czogbnVtYmVyO1xuICByZXRyeURlbGF5U2Vjb25kczogbnVtYmVyO1xuICBkZWxldGVSZW1vdGVXaGVuVW5yZWZlcmVuY2VkOiBib29sZWFuO1xuICBjb21wcmVzc0ltYWdlczogYm9vbGVhbjtcbiAgY29tcHJlc3NUaHJlc2hvbGRLYjogbnVtYmVyO1xuICBtYXhJbWFnZURpbWVuc2lvbjogbnVtYmVyO1xuICBqcGVnUXVhbGl0eTogbnVtYmVyO1xufTtcblxudHlwZSBTeW5jSW5kZXhFbnRyeSA9IHtcbiAgbG9jYWxTaWduYXR1cmU6IHN0cmluZztcbiAgcmVtb3RlU2lnbmF0dXJlOiBzdHJpbmc7XG4gIHJlbW90ZVBhdGg6IHN0cmluZztcbn07XG5cbnR5cGUgUmVtb3RlRmlsZVN0YXRlID0ge1xuICByZW1vdGVQYXRoOiBzdHJpbmc7XG4gIGxhc3RNb2RpZmllZDogbnVtYmVyO1xuICBzaXplOiBudW1iZXI7XG4gIHNpZ25hdHVyZTogc3RyaW5nO1xufTtcblxudHlwZSBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZCA9IHtcbiAgZmlyc3REZXRlY3RlZEF0OiBudW1iZXI7XG4gIGxhc3REZXRlY3RlZEF0OiBudW1iZXI7XG4gIG1pc3NDb3VudDogbnVtYmVyO1xufTtcblxudHlwZSBQZW5kaW5nRGVsZXRpb25FbnRyeSA9IHtcbiAgcmVtb3RlUGF0aDogc3RyaW5nO1xuICByZW1vdGVTaWduYXR1cmU/OiBzdHJpbmc7XG59O1xuXG50eXBlIFJlbW90ZUludmVudG9yeSA9IHtcbiAgZmlsZXM6IE1hcDxzdHJpbmcsIFJlbW90ZUZpbGVTdGF0ZT47XG4gIGRpcmVjdG9yaWVzOiBTZXQ8c3RyaW5nPjtcbn07XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFNlY3VyZVdlYmRhdlNldHRpbmdzID0ge1xuICB3ZWJkYXZVcmw6IFwiXCIsXG4gIHVzZXJuYW1lOiBcIlwiLFxuICBwYXNzd29yZDogXCJcIixcbiAgcmVtb3RlRm9sZGVyOiBcIi9yZW1vdGUtaW1hZ2VzL1wiLFxuICB2YXVsdFN5bmNSZW1vdGVGb2xkZXI6IFwiL3ZhdWx0LXN5bmMvXCIsXG4gIGV4Y2x1ZGVkU3luY0ZvbGRlcnM6IFtcImtiXCJdLFxuICBuYW1pbmdTdHJhdGVneTogXCJoYXNoXCIsXG4gIGRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQ6IHRydWUsXG4gIGxhbmd1YWdlOiBcImF1dG9cIixcbiAgbm90ZVN0b3JhZ2VNb2RlOiBcImZ1bGwtbG9jYWxcIixcbiAgbm90ZUV2aWN0QWZ0ZXJEYXlzOiAzMCxcbiAgYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXM6IDAsXG4gIG1heFJldHJ5QXR0ZW1wdHM6IDUsXG4gIHJldHJ5RGVsYXlTZWNvbmRzOiA1LFxuICBkZWxldGVSZW1vdGVXaGVuVW5yZWZlcmVuY2VkOiB0cnVlLFxuICBjb21wcmVzc0ltYWdlczogdHJ1ZSxcbiAgY29tcHJlc3NUaHJlc2hvbGRLYjogMzAwLFxuICBtYXhJbWFnZURpbWVuc2lvbjogMjIwMCxcbiAganBlZ1F1YWxpdHk6IDgyLFxufTtcblxuY29uc3QgTUlNRV9NQVA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIGpwZzogXCJpbWFnZS9qcGVnXCIsXG4gIGpwZWc6IFwiaW1hZ2UvanBlZ1wiLFxuICBwbmc6IFwiaW1hZ2UvcG5nXCIsXG4gIGdpZjogXCJpbWFnZS9naWZcIixcbiAgd2VicDogXCJpbWFnZS93ZWJwXCIsXG4gIHN2ZzogXCJpbWFnZS9zdmcreG1sXCIsXG4gIGJtcDogXCJpbWFnZS9ibXBcIixcbiAgXCJpbWFnZS9qcGVnXCI6IFwianBnXCIsXG4gIFwiaW1hZ2UvcG5nXCI6IFwicG5nXCIsXG4gIFwiaW1hZ2UvZ2lmXCI6IFwiZ2lmXCIsXG4gIFwiaW1hZ2Uvd2VicFwiOiBcIndlYnBcIixcbiAgXCJpbWFnZS9ibXBcIjogXCJibXBcIixcbiAgXCJpbWFnZS9zdmcreG1sXCI6IFwic3ZnXCIsXG59O1xuXG5jb25zdCBTRUNVUkVfTk9URV9TVFVCID0gXCJzZWN1cmUtd2ViZGF2LW5vdGUtc3R1YlwiO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTZWN1cmVXZWJkYXZJbWFnZXNQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogU2VjdXJlV2ViZGF2U2V0dGluZ3MgPSBERUZBVUxUX1NFVFRJTkdTO1xuICBxdWV1ZTogVXBsb2FkVGFza1tdID0gW107XG4gIHByaXZhdGUgYmxvYlVybHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSByZWFkb25seSBtYXhCbG9iVXJscyA9IDEwMDtcbiAgcHJpdmF0ZSBub3RlUmVtb3RlUmVmcyA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8c3RyaW5nPj4oKTtcbiAgcHJpdmF0ZSByZW1vdGVDbGVhbnVwSW5GbGlnaHQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBub3RlQWNjZXNzVGltZXN0YW1wcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG4gIHByaXZhdGUgc3luY0luZGV4ID0gbmV3IE1hcDxzdHJpbmcsIFN5bmNJbmRleEVudHJ5PigpO1xuICBwcml2YXRlIHN5bmNlZERpcmVjdG9yaWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgbWlzc2luZ0xhenlSZW1vdGVOb3RlcyA9IG5ldyBNYXA8c3RyaW5nLCBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZD4oKTtcbiAgcHJpdmF0ZSBwZW5kaW5nVmF1bHRTeW5jUGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBwZW5kaW5nVmF1bHREZWxldGlvblBhdGhzID0gbmV3IE1hcDxzdHJpbmcsIFBlbmRpbmdEZWxldGlvbkVudHJ5PigpO1xuICBwcml2YXRlIHBlbmRpbmdWYXVsdE11dGF0aW9uUHJvbWlzZXMgPSBuZXcgU2V0PFByb21pc2U8dm9pZD4+KCk7XG4gIHByaXZhdGUgcHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgcHJpdmF0ZSBwcmlvcml0eU5vdGVTeW5jc0luRmxpZ2h0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgbGFzdFZhdWx0U3luY0F0ID0gMDtcbiAgcHJpdmF0ZSBsYXN0VmF1bHRTeW5jU3RhdHVzID0gXCJcIjtcbiAgcHJpdmF0ZSBzeW5jSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICBwcml2YXRlIGF1dG9TeW5jVGlja0luUHJvZ3Jlc3MgPSBmYWxzZTtcbiAgLy8gSW1hZ2UgcGFyc2luZyBhbmQgcmVuZGVyaW5nIGxpdmUgaW4gYSBkZWRpY2F0ZWQgaGVscGVyIHNvIHN5bmMgY2hhbmdlc1xuICAvLyBkbyBub3QgYWNjaWRlbnRhbGx5IGJyZWFrIGRpc3BsYXkgYmVoYXZpb3VyIGFnYWluLlxuICBwcml2YXRlIGltYWdlU3VwcG9ydCE6IFNlY3VyZVdlYmRhdkltYWdlU3VwcG9ydDtcbiAgLy8gVXBsb2FkIHF1ZXVlIHN0YXRlIGlzIGlzb2xhdGVkIHNvIHJldHJpZXMgYW5kIHBsYWNlaG9sZGVyIHJlcGxhY2VtZW50IGRvXG4gIC8vIG5vdCBrZWVwIHNwcmF3bGluZyBhY3Jvc3MgdGhlIG1haW4gcGx1Z2luIGNsYXNzLlxuICBwcml2YXRlIHVwbG9hZFF1ZXVlITogU2VjdXJlV2ViZGF2VXBsb2FkUXVldWVTdXBwb3J0O1xuICAvLyBTeW5jIG1ldGFkYXRhIGhlbHBlcnMgYXJlIGlzb2xhdGVkIHNvIHJlY29uY2lsaWF0aW9uIHJ1bGVzIHN0YXkgZXhwbGljaXQuXG4gIHByaXZhdGUgc3luY1N1cHBvcnQhOiBTZWN1cmVXZWJkYXZTeW5jU3VwcG9ydDtcblxuICBwcml2YXRlIHJlYWRvbmx5IGRlbGV0aW9uRm9sZGVyU3VmZml4ID0gXCIuX19zZWN1cmUtd2ViZGF2LWRlbGV0aW9uc19fL1wiO1xuICBwcml2YXRlIHJlYWRvbmx5IG1pc3NpbmdMYXp5UmVtb3RlQ29uZmlybWF0aW9ucyA9IDI7XG5cbiAgcHJpdmF0ZSBpbml0aWFsaXplU3VwcG9ydE1vZHVsZXMoKSB7XG4gICAgLy8gS2VlcCBydW50aW1lLW9ubHkgaW50ZWdyYXRpb24gaGVyZTogdGhlIGltYWdlIG1vZHVsZSBvd25zIHBhcnNpbmcgYW5kXG4gICAgLy8gcmVuZGVyaW5nLCB3aGlsZSB0aGUgcGx1Z2luIHN0aWxsIG93bnMgV2ViREFWIGFjY2VzcyBhbmQgbGlmZWN5Y2xlLlxuICAgIHRoaXMuaW1hZ2VTdXBwb3J0ID0gbmV3IFNlY3VyZVdlYmRhdkltYWdlU3VwcG9ydCh7XG4gICAgICB0OiB0aGlzLnQuYmluZCh0aGlzKSxcbiAgICAgIGZldGNoU2VjdXJlSW1hZ2VCbG9iVXJsOiB0aGlzLmZldGNoU2VjdXJlSW1hZ2VCbG9iVXJsLmJpbmQodGhpcyksXG4gICAgfSk7XG4gICAgdGhpcy51cGxvYWRRdWV1ZSA9IG5ldyBTZWN1cmVXZWJkYXZVcGxvYWRRdWV1ZVN1cHBvcnQoe1xuICAgICAgYXBwOiB0aGlzLmFwcCxcbiAgICAgIHQ6IHRoaXMudC5iaW5kKHRoaXMpLFxuICAgICAgc2V0dGluZ3M6ICgpID0+IHRoaXMuc2V0dGluZ3MsXG4gICAgICBnZXRRdWV1ZTogKCkgPT4gdGhpcy5xdWV1ZSxcbiAgICAgIHNldFF1ZXVlOiAocXVldWUpID0+IHtcbiAgICAgICAgdGhpcy5xdWV1ZSA9IHF1ZXVlO1xuICAgICAgfSxcbiAgICAgIHNhdmVQbHVnaW5TdGF0ZTogdGhpcy5zYXZlUGx1Z2luU3RhdGUuYmluZCh0aGlzKSxcbiAgICAgIHNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYzogdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMuYmluZCh0aGlzKSxcbiAgICAgIHJlcXVlc3RVcmw6IHRoaXMucmVxdWVzdFVybC5iaW5kKHRoaXMpLFxuICAgICAgYnVpbGRVcGxvYWRVcmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwuYmluZCh0aGlzKSxcbiAgICAgIGJ1aWxkQXV0aEhlYWRlcjogdGhpcy5idWlsZEF1dGhIZWFkZXIuYmluZCh0aGlzKSxcbiAgICAgIHByZXBhcmVVcGxvYWRQYXlsb2FkOiB0aGlzLnByZXBhcmVVcGxvYWRQYXlsb2FkLmJpbmQodGhpcyksXG4gICAgICBidWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeTogdGhpcy5idWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeS5iaW5kKHRoaXMpLFxuICAgICAgYnVpbGRSZW1vdGVQYXRoOiB0aGlzLmJ1aWxkUmVtb3RlUGF0aC5iaW5kKHRoaXMpLFxuICAgICAgYnVpbGRTZWN1cmVJbWFnZU1hcmt1cDogdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cC5iaW5kKHRoaXMuaW1hZ2VTdXBwb3J0KSxcbiAgICAgIGdldE1pbWVUeXBlRnJvbUZpbGVOYW1lOiB0aGlzLmdldE1pbWVUeXBlRnJvbUZpbGVOYW1lLmJpbmQodGhpcyksXG4gICAgICBhcnJheUJ1ZmZlclRvQmFzZTY0OiB0aGlzLmFycmF5QnVmZmVyVG9CYXNlNjQuYmluZCh0aGlzKSxcbiAgICAgIGJhc2U2NFRvQXJyYXlCdWZmZXI6IHRoaXMuYmFzZTY0VG9BcnJheUJ1ZmZlci5iaW5kKHRoaXMpLFxuICAgICAgZXNjYXBlSHRtbDogdGhpcy5lc2NhcGVIdG1sLmJpbmQodGhpcyksXG4gICAgICBlc2NhcGVSZWdFeHA6IHRoaXMuZXNjYXBlUmVnRXhwLmJpbmQodGhpcyksXG4gICAgICBkZXNjcmliZUVycm9yOiB0aGlzLmRlc2NyaWJlRXJyb3IuYmluZCh0aGlzKSxcbiAgICB9KTtcbiAgICB0aGlzLnN5bmNTdXBwb3J0ID0gbmV3IFNlY3VyZVdlYmRhdlN5bmNTdXBwb3J0KHtcbiAgICAgIGFwcDogdGhpcy5hcHAsXG4gICAgICBnZXRWYXVsdFN5bmNSZW1vdGVGb2xkZXI6ICgpID0+IHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyLFxuICAgICAgZ2V0RXhjbHVkZWRTeW5jRm9sZGVyczogKCkgPT4gdGhpcy5zZXR0aW5ncy5leGNsdWRlZFN5bmNGb2xkZXJzID8/IFtdLFxuICAgICAgZGVsZXRpb25Gb2xkZXJTdWZmaXg6IHRoaXMuZGVsZXRpb25Gb2xkZXJTdWZmaXgsXG4gICAgICBlbmNvZGVCYXNlNjRVcmw6ICh2YWx1ZSkgPT5cbiAgICAgICAgdGhpcy5hcnJheUJ1ZmZlclRvQmFzZTY0KHRoaXMuZW5jb2RlVXRmOCh2YWx1ZSkpLnJlcGxhY2UoL1xcKy9nLCBcIi1cIikucmVwbGFjZSgvXFwvL2csIFwiX1wiKS5yZXBsYWNlKC89KyQvZywgXCJcIiksXG4gICAgICBkZWNvZGVCYXNlNjRVcmw6ICh2YWx1ZSkgPT4ge1xuICAgICAgICBjb25zdCBub3JtYWxpemVkID0gdmFsdWUucmVwbGFjZSgvLS9nLCBcIitcIikucmVwbGFjZSgvXy9nLCBcIi9cIik7XG4gICAgICAgIGNvbnN0IHBhZGRlZCA9IG5vcm1hbGl6ZWQgKyBcIj1cIi5yZXBlYXQoKDQgLSAobm9ybWFsaXplZC5sZW5ndGggJSA0IHx8IDQpKSAlIDQpO1xuICAgICAgICByZXR1cm4gdGhpcy5kZWNvZGVVdGY4KHRoaXMuYmFzZTY0VG9BcnJheUJ1ZmZlcihwYWRkZWQpKTtcbiAgICAgIH0sXG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgYXdhaXQgdGhpcy5sb2FkUGx1Z2luU3RhdGUoKTtcbiAgICB0aGlzLmluaXRpYWxpemVTdXBwb3J0TW9kdWxlcygpO1xuXG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBTZWN1cmVXZWJkYXZTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwidXBsb2FkLWN1cnJlbnQtbm90ZS1sb2NhbC1pbWFnZXNcIixcbiAgICAgIG5hbWU6IFwiVXBsb2FkIGxvY2FsIGltYWdlcyBpbiBjdXJyZW50IG5vdGUgdG8gV2ViREFWXCIsXG4gICAgICBjaGVja0NhbGxiYWNrOiAoY2hlY2tpbmcpID0+IHtcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgICAgIGlmICghZmlsZSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghY2hlY2tpbmcpIHtcbiAgICAgICAgICB2b2lkIHRoaXMudXBsb2FkSW1hZ2VzSW5Ob3RlKGZpbGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInRlc3Qtd2ViZGF2LWNvbm5lY3Rpb25cIixcbiAgICAgIG5hbWU6IFwiVGVzdCBXZWJEQVYgY29ubmVjdGlvblwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLnJ1bkNvbm5lY3Rpb25UZXN0KHRydWUpO1xuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJzeW5jLWNvbmZpZ3VyZWQtdmF1bHQtY29udGVudC10by13ZWJkYXZcIixcbiAgICAgIG5hbWU6IFwiRmFzdCBzeW5jIGNoYW5nZWQgdmF1bHQgY29udGVudCB0byBXZWJEQVZcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5ydW5NYW51YWxTeW5jKCk7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcImZ1bGwtcmVjb25jaWxlLXZhdWx0LWNvbnRlbnQtdG8td2ViZGF2XCIsXG4gICAgICBuYW1lOiBcIkZ1bGwgcmVjb25jaWxlIHZhdWx0IGNvbnRlbnQgd2l0aCBXZWJEQVZcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5ydW5GdWxsUmVjb25jaWxlU3luYygpO1xuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHJpYmJvbiA9IHRoaXMuYWRkUmliYm9uSWNvbihcInJlZnJlc2gtY3dcIiwgdGhpcy50KFwiXHU3QUNCXHU1MzczXHU1NDBDXHU2QjY1XHU1MjMwIFdlYkRBVlwiLCBcIlN5bmMgdG8gV2ViREFWIG5vd1wiKSwgKCkgPT4ge1xuICAgICAgdm9pZCB0aGlzLnJ1bk1hbnVhbFN5bmMoKTtcbiAgICB9KTtcbiAgICByaWJib24uYWRkQ2xhc3MoXCJzZWN1cmUtd2ViZGF2LXN5bmMtcmliYm9uXCIpO1xuXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duUG9zdFByb2Nlc3NvcigoZWwsIGN0eCkgPT4ge1xuICAgICAgdm9pZCB0aGlzLmltYWdlU3VwcG9ydC5wcm9jZXNzU2VjdXJlSW1hZ2VzKGVsLCBjdHgpO1xuICAgIH0pO1xuICAgIHRyeSB7XG4gICAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoU0VDVVJFX0NPREVfQkxPQ0ssIChzb3VyY2UsIGVsLCBjdHgpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmltYWdlU3VwcG9ydC5wcm9jZXNzU2VjdXJlQ29kZUJsb2NrKHNvdXJjZSwgZWwsIGN0eCk7XG4gICAgICB9KTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIGNvbnNvbGUud2FybihcIltzZWN1cmUtd2ViZGF2LWltYWdlc10gY29kZSBibG9jayBwcm9jZXNzb3IgYWxyZWFkeSByZWdpc3RlcmVkLCBza2lwcGluZ1wiKTtcbiAgICB9XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJmaWxlLW9wZW5cIiwgKGZpbGUpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmhhbmRsZUZpbGVPcGVuKGZpbGUpO1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImVkaXRvci1wYXN0ZVwiLCAoZXZ0LCBlZGl0b3IsIGluZm8pID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmhhbmRsZUVkaXRvclBhc3RlKGV2dCwgZWRpdG9yLCBpbmZvKTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJlZGl0b3ItZHJvcFwiLCAoZXZ0LCBlZGl0b3IsIGluZm8pID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmhhbmRsZUVkaXRvckRyb3AoZXZ0LCBlZGl0b3IsIGluZm8pO1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIGF3YWl0IHRoaXMucmVidWlsZFJlZmVyZW5jZUluZGV4KCk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwibW9kaWZ5XCIsIChmaWxlKSA9PiB0aGlzLnRyYWNrVmF1bHRNdXRhdGlvbigoKSA9PiB0aGlzLmhhbmRsZVZhdWx0TW9kaWZ5KGZpbGUpKSkpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihcImRlbGV0ZVwiLCAoZmlsZSkgPT4gdGhpcy50cmFja1ZhdWx0TXV0YXRpb24oKCkgPT4gdGhpcy5oYW5kbGVWYXVsdERlbGV0ZShmaWxlKSkpKTtcbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC52YXVsdC5vbihcInJlbmFtZVwiLCAoZmlsZSwgb2xkUGF0aCkgPT4gdGhpcy50cmFja1ZhdWx0TXV0YXRpb24oKCkgPT4gdGhpcy5oYW5kbGVWYXVsdFJlbmFtZShmaWxlLCBvbGRQYXRoKSkpLFxuICAgICk7XG5cbiAgICB0aGlzLnNldHVwQXV0b1N5bmMoKTtcblxuICAgIHZvaWQgdGhpcy51cGxvYWRRdWV1ZS5wcm9jZXNzUGVuZGluZ1Rhc2tzKCk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyKCgpID0+IHtcbiAgICAgIGZvciAoY29uc3QgYmxvYlVybCBvZiB0aGlzLmJsb2JVcmxzKSB7XG4gICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwoYmxvYlVybCk7XG4gICAgICB9XG4gICAgICB0aGlzLmJsb2JVcmxzLmNsZWFyKCk7XG4gICAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy52YWx1ZXMoKSkge1xuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgICB9XG4gICAgICB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy5jbGVhcigpO1xuICAgICAgdGhpcy51cGxvYWRRdWV1ZS5kaXNwb3NlKCk7XG4gICAgfSk7XG4gIH1cblxuICBvbnVubG9hZCgpIHtcbiAgICBmb3IgKGNvbnN0IGJsb2JVcmwgb2YgdGhpcy5ibG9iVXJscykge1xuICAgICAgVVJMLnJldm9rZU9iamVjdFVSTChibG9iVXJsKTtcbiAgICB9XG4gICAgdGhpcy5ibG9iVXJscy5jbGVhcigpO1xuICAgIHRoaXMudXBsb2FkUXVldWU/LmRpc3Bvc2UoKTtcbiAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy52YWx1ZXMoKSkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xuICAgIH1cbiAgICB0aGlzLnByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cy5jbGVhcigpO1xuICB9XG5cbiAgYXN5bmMgbG9hZFBsdWdpblN0YXRlKCkge1xuICAgIGNvbnN0IGxvYWRlZCA9IGF3YWl0IHRoaXMubG9hZERhdGEoKTtcbiAgICBpZiAoIWxvYWRlZCB8fCB0eXBlb2YgbG9hZGVkICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICB0aGlzLnNldHRpbmdzID0geyAuLi5ERUZBVUxUX1NFVFRJTkdTIH07XG4gICAgICB0aGlzLnF1ZXVlID0gW107XG4gICAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzID0gbmV3IE1hcCgpO1xuICAgICAgdGhpcy5zeW5jSW5kZXggPSBuZXcgTWFwKCk7XG4gICAgICB0aGlzLnN5bmNlZERpcmVjdG9yaWVzID0gbmV3IFNldCgpO1xuICAgICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzID0gbmV3IE1hcCgpO1xuICAgICAgdGhpcy5wZW5kaW5nVmF1bHRTeW5jUGF0aHMgPSBuZXcgU2V0KCk7XG4gICAgICB0aGlzLnBlbmRpbmdWYXVsdERlbGV0aW9uUGF0aHMgPSBuZXcgTWFwKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY2FuZGlkYXRlID0gbG9hZGVkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIGlmIChcInNldHRpbmdzXCIgaW4gY2FuZGlkYXRlIHx8IFwicXVldWVcIiBpbiBjYW5kaWRhdGUpIHtcbiAgICAgIHRoaXMuc2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MsIC4uLigoY2FuZGlkYXRlLnNldHRpbmdzIGFzIFBhcnRpYWw8U2VjdXJlV2ViZGF2U2V0dGluZ3M+KSA/PyB7fSkgfTtcbiAgICAgIHRoaXMucXVldWUgPSBBcnJheS5pc0FycmF5KGNhbmRpZGF0ZS5xdWV1ZSkgPyAoY2FuZGlkYXRlLnF1ZXVlIGFzIFVwbG9hZFRhc2tbXSkgOiBbXTtcbiAgICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMgPSBuZXcgTWFwKFxuICAgICAgICBPYmplY3QuZW50cmllcygoY2FuZGlkYXRlLm5vdGVBY2Nlc3NUaW1lc3RhbXBzIGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfCB1bmRlZmluZWQpID8/IHt9KSxcbiAgICAgICk7XG4gICAgICB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgPSBuZXcgTWFwKFxuICAgICAgICBPYmplY3QuZW50cmllcygoY2FuZGlkYXRlLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMgYXMgUmVjb3JkPHN0cmluZywgTWlzc2luZ0xhenlSZW1vdGVSZWNvcmQ+IHwgdW5kZWZpbmVkKSA/PyB7fSlcbiAgICAgICAgICAuZmlsdGVyKChbLCB2YWx1ZV0pID0+IHtcbiAgICAgICAgICAgIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlY29yZCA9IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdHlwZW9mIHJlY29yZC5maXJzdERldGVjdGVkQXQgPT09IFwibnVtYmVyXCIgJiZcbiAgICAgICAgICAgICAgdHlwZW9mIHJlY29yZC5sYXN0RGV0ZWN0ZWRBdCA9PT0gXCJudW1iZXJcIiAmJlxuICAgICAgICAgICAgICB0eXBlb2YgcmVjb3JkLm1pc3NDb3VudCA9PT0gXCJudW1iZXJcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoKFtwYXRoLCB2YWx1ZV0pID0+IFtwYXRoLCB2YWx1ZSBhcyBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZF0pLFxuICAgICAgKTtcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzID0gbmV3IFNldChcbiAgICAgICAgQXJyYXkuaXNBcnJheShjYW5kaWRhdGUucGVuZGluZ1ZhdWx0U3luY1BhdGhzKVxuICAgICAgICAgID8gY2FuZGlkYXRlLnBlbmRpbmdWYXVsdFN5bmNQYXRocy5maWx0ZXIoKHBhdGgpOiBwYXRoIGlzIHN0cmluZyA9PiB0eXBlb2YgcGF0aCA9PT0gXCJzdHJpbmdcIilcbiAgICAgICAgICA6IFtdLFxuICAgICAgKTtcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0RGVsZXRpb25QYXRocyA9IG5ldyBNYXAoKTtcbiAgICAgIGZvciAoY29uc3QgW3BhdGgsIHJhd0VudHJ5XSBvZiBPYmplY3QuZW50cmllcygoY2FuZGlkYXRlLnBlbmRpbmdWYXVsdERlbGV0aW9uUGF0aHMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpID8/IHt9KSkge1xuICAgICAgICBpZiAoIXJhd0VudHJ5IHx8IHR5cGVvZiByYXdFbnRyeSAhPT0gXCJvYmplY3RcIikge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGVudHJ5ID0gcmF3RW50cnkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0eXBlb2YgZW50cnkucmVtb3RlUGF0aCA9PT0gXCJzdHJpbmdcIiAmJiBlbnRyeS5yZW1vdGVQYXRoLmxlbmd0aCA+IDBcbiAgICAgICAgICA/IGVudHJ5LnJlbW90ZVBhdGhcbiAgICAgICAgICA6IGAke3RoaXMubm9ybWFsaXplRm9sZGVyKHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKX0ke3BhdGh9YDtcbiAgICAgICAgY29uc3QgcmVtb3RlU2lnbmF0dXJlID0gdHlwZW9mIGVudHJ5LnJlbW90ZVNpZ25hdHVyZSA9PT0gXCJzdHJpbmdcIiA/IGVudHJ5LnJlbW90ZVNpZ25hdHVyZSA6IHVuZGVmaW5lZDtcbiAgICAgICAgdGhpcy5wZW5kaW5nVmF1bHREZWxldGlvblBhdGhzLnNldChwYXRoLCB7IHJlbW90ZVBhdGgsIHJlbW90ZVNpZ25hdHVyZSB9KTtcbiAgICAgIH1cbiAgICAgIHRoaXMuc3luY0luZGV4ID0gbmV3IE1hcCgpO1xuICAgICAgZm9yIChjb25zdCBbcGF0aCwgcmF3RW50cnldIG9mIE9iamVjdC5lbnRyaWVzKChjYW5kaWRhdGUuc3luY0luZGV4IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKSA/PyB7fSkpIHtcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IHRoaXMubm9ybWFsaXplU3luY0luZGV4RW50cnkocGF0aCwgcmF3RW50cnkpO1xuICAgICAgICBpZiAobm9ybWFsaXplZCkge1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChwYXRoLCBub3JtYWxpemVkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPVxuICAgICAgICB0eXBlb2YgY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNBdCA9PT0gXCJudW1iZXJcIiA/IGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jQXQgOiAwO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID1cbiAgICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jU3RhdHVzID09PSBcInN0cmluZ1wiID8gY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNTdGF0dXMgOiBcIlwiO1xuICAgICAgdGhpcy5zeW5jZWREaXJlY3RvcmllcyA9IG5ldyBTZXQoXG4gICAgICAgIEFycmF5LmlzQXJyYXkoY2FuZGlkYXRlLnN5bmNlZERpcmVjdG9yaWVzKSA/IGNhbmRpZGF0ZS5zeW5jZWREaXJlY3RvcmllcyBhcyBzdHJpbmdbXSA6IFtdLFxuICAgICAgKTtcbiAgICAgIHRoaXMubm9ybWFsaXplRWZmZWN0aXZlU2V0dGluZ3MoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnNldHRpbmdzID0geyAuLi5ERUZBVUxUX1NFVFRJTkdTLCAuLi4oY2FuZGlkYXRlIGFzIFBhcnRpYWw8U2VjdXJlV2ViZGF2U2V0dGluZ3M+KSB9O1xuICAgIHRoaXMucXVldWUgPSBbXTtcbiAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuc3luY0luZGV4ID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuc3luY2VkRGlyZWN0b3JpZXMgPSBuZXcgU2V0KCk7XG4gICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzID0gbmV3IFNldCgpO1xuICAgIHRoaXMucGVuZGluZ1ZhdWx0RGVsZXRpb25QYXRocyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IDA7XG4gICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gXCJcIjtcbiAgICB0aGlzLm5vcm1hbGl6ZUVmZmVjdGl2ZVNldHRpbmdzKCk7XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUVmZmVjdGl2ZVNldHRpbmdzKCkge1xuICAgIC8vIEtlZXAgdGhlIHB1YmxpYyBzZXR0aW5ncyBzdXJmYWNlIGludGVudGlvbmFsbHkgc21hbGwgYW5kIGRldGVybWluaXN0aWMuXG4gICAgdGhpcy5zZXR0aW5ncy5kZWxldGVMb2NhbEFmdGVyVXBsb2FkID0gdHJ1ZTtcbiAgICB0aGlzLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzID0gTWF0aC5tYXgoMCwgTWF0aC5mbG9vcih0aGlzLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzIHx8IDApKTtcbiAgICBjb25zdCByYXdFeGNsdWRlZCA9IHRoaXMuc2V0dGluZ3MuZXhjbHVkZWRTeW5jRm9sZGVycyBhcyB1bmtub3duO1xuICAgIGNvbnN0IGV4Y2x1ZGVkID0gQXJyYXkuaXNBcnJheShyYXdFeGNsdWRlZClcbiAgICAgID8gcmF3RXhjbHVkZWRcbiAgICAgIDogdHlwZW9mIHJhd0V4Y2x1ZGVkID09PSBcInN0cmluZ1wiXG4gICAgICAgID8gcmF3RXhjbHVkZWQuc3BsaXQoL1ssXFxuXS8pXG4gICAgICAgIDogREVGQVVMVF9TRVRUSU5HUy5leGNsdWRlZFN5bmNGb2xkZXJzO1xuICAgIHRoaXMuc2V0dGluZ3MuZXhjbHVkZWRTeW5jRm9sZGVycyA9IFtcbiAgICAgIC4uLm5ldyBTZXQoXG4gICAgICAgIGV4Y2x1ZGVkXG4gICAgICAgICAgLm1hcCgodmFsdWUpID0+IG5vcm1hbGl6ZVBhdGgoU3RyaW5nKHZhbHVlKS50cmltKCkpLnJlcGxhY2UoL15cXC8rLywgXCJcIikucmVwbGFjZSgvXFwvKyQvLCBcIlwiKSlcbiAgICAgICAgICAuZmlsdGVyKCh2YWx1ZSkgPT4gdmFsdWUubGVuZ3RoID4gMCksXG4gICAgICApLFxuICAgIF07XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUZvbGRlcihpbnB1dDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIG5vcm1hbGl6ZUZvbGRlcihpbnB1dCk7XG4gIH1cblxuICBwcml2YXRlIHNldHVwQXV0b1N5bmMoKSB7XG4gICAgY29uc3QgbWludXRlcyA9IHRoaXMuc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXM7XG4gICAgaWYgKG1pbnV0ZXMgPD0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGludGVydmFsTXMgPSBtaW51dGVzICogNjAgKiAxMDAwO1xuICAgIHRoaXMucmVnaXN0ZXJJbnRlcnZhbChcbiAgICAgIHdpbmRvdy5zZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgIHZvaWQgdGhpcy5ydW5BdXRvU3luY1RpY2soKTtcbiAgICAgIH0sIGludGVydmFsTXMpLFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJ1bkF1dG9TeW5jVGljaygpIHtcbiAgICBpZiAodGhpcy5hdXRvU3luY1RpY2tJblByb2dyZXNzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5hdXRvU3luY1RpY2tJblByb2dyZXNzID0gdHJ1ZTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5zeW5jUGVuZGluZ1ZhdWx0Q29udGVudChmYWxzZSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMuYXV0b1N5bmNUaWNrSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHNhdmVQbHVnaW5TdGF0ZSgpIHtcbiAgICBhd2FpdCB0aGlzLnNhdmVEYXRhKHtcbiAgICAgIHNldHRpbmdzOiB0aGlzLnNldHRpbmdzLFxuICAgICAgcXVldWU6IHRoaXMucXVldWUsXG4gICAgICBub3RlQWNjZXNzVGltZXN0YW1wczogT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMuZW50cmllcygpKSxcbiAgICAgIG1pc3NpbmdMYXp5UmVtb3RlTm90ZXM6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMuZW50cmllcygpKSxcbiAgICAgIHBlbmRpbmdWYXVsdFN5bmNQYXRoczogWy4uLnRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzXSxcbiAgICAgIHBlbmRpbmdWYXVsdERlbGV0aW9uUGF0aHM6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLnBlbmRpbmdWYXVsdERlbGV0aW9uUGF0aHMuZW50cmllcygpKSxcbiAgICAgIHN5bmNJbmRleDogT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMuc3luY0luZGV4LmVudHJpZXMoKSksXG4gICAgICBzeW5jZWREaXJlY3RvcmllczogWy4uLnRoaXMuc3luY2VkRGlyZWN0b3JpZXNdLFxuICAgICAgbGFzdFZhdWx0U3luY0F0OiB0aGlzLmxhc3RWYXVsdFN5bmNBdCxcbiAgICAgIGxhc3RWYXVsdFN5bmNTdGF0dXM6IHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyxcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcbiAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVTeW5jSW5kZXhFbnRyeSh2YXVsdFBhdGg6IHN0cmluZywgcmF3RW50cnk6IHVua25vd24pOiBTeW5jSW5kZXhFbnRyeSB8IG51bGwge1xuICAgIGlmICghcmF3RW50cnkgfHwgdHlwZW9mIHJhd0VudHJ5ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBjYW5kaWRhdGUgPSByYXdFbnRyeSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICBjb25zdCByZW1vdGVQYXRoID1cbiAgICAgIHR5cGVvZiBjYW5kaWRhdGUucmVtb3RlUGF0aCA9PT0gXCJzdHJpbmdcIiAmJiBjYW5kaWRhdGUucmVtb3RlUGF0aC5sZW5ndGggPiAwXG4gICAgICAgID8gY2FuZGlkYXRlLnJlbW90ZVBhdGhcbiAgICAgICAgOiB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aCh2YXVsdFBhdGgpO1xuICAgIGNvbnN0IGxvY2FsU2lnbmF0dXJlID1cbiAgICAgIHR5cGVvZiBjYW5kaWRhdGUubG9jYWxTaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgPyBjYW5kaWRhdGUubG9jYWxTaWduYXR1cmVcbiAgICAgICAgOiB0eXBlb2YgY2FuZGlkYXRlLnNpZ25hdHVyZSA9PT0gXCJzdHJpbmdcIlxuICAgICAgICAgID8gY2FuZGlkYXRlLnNpZ25hdHVyZVxuICAgICAgICAgIDogXCJcIjtcbiAgICBjb25zdCByZW1vdGVTaWduYXR1cmUgPVxuICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5yZW1vdGVTaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgPyBjYW5kaWRhdGUucmVtb3RlU2lnbmF0dXJlXG4gICAgICAgIDogdHlwZW9mIGNhbmRpZGF0ZS5zaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgICA/IGNhbmRpZGF0ZS5zaWduYXR1cmVcbiAgICAgICAgICA6IFwiXCI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICByZW1vdGVQYXRoLFxuICAgIH07XG4gIH1cblxuICB0KHpoOiBzdHJpbmcsIGVuOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRMYW5ndWFnZSgpID09PSBcInpoXCIgPyB6aCA6IGVuO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRMYW5ndWFnZSgpIHtcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5sYW5ndWFnZSA9PT0gXCJhdXRvXCIpIHtcbiAgICAgIGNvbnN0IGxvY2FsZSA9IHR5cGVvZiBuYXZpZ2F0b3IgIT09IFwidW5kZWZpbmVkXCIgPyBuYXZpZ2F0b3IubGFuZ3VhZ2UudG9Mb3dlckNhc2UoKSA6IFwiZW5cIjtcbiAgICAgIHJldHVybiBsb2NhbGUuc3RhcnRzV2l0aChcInpoXCIpID8gXCJ6aFwiIDogXCJlblwiO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNldHRpbmdzLmxhbmd1YWdlO1xuICB9XG5cbiAgZm9ybWF0TGFzdFN5bmNMYWJlbCgpIHtcbiAgICBpZiAoIXRoaXMubGFzdFZhdWx0U3luY0F0KSB7XG4gICAgICByZXR1cm4gdGhpcy50KFwiXHU0RTBBXHU2QjIxXHU1NDBDXHU2QjY1XHVGRjFBXHU1QzFBXHU2NzJBXHU2MjY3XHU4ODRDXCIsIFwiTGFzdCBzeW5jOiBub3QgcnVuIHlldFwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy50KFxuICAgICAgYFx1NEUwQVx1NkIyMVx1NTQwQ1x1NkI2NVx1RkYxQSR7bmV3IERhdGUodGhpcy5sYXN0VmF1bHRTeW5jQXQpLnRvTG9jYWxlU3RyaW5nKCl9YCxcbiAgICAgIGBMYXN0IHN5bmM6ICR7bmV3IERhdGUodGhpcy5sYXN0VmF1bHRTeW5jQXQpLnRvTG9jYWxlU3RyaW5nKCl9YCxcbiAgICApO1xuICB9XG5cbiAgZm9ybWF0U3luY1N0YXR1c0xhYmVsKCkge1xuICAgIHJldHVybiB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXNcbiAgICAgID8gdGhpcy50KGBcdTY3MDBcdThGRDFcdTcyQjZcdTYwMDFcdUZGMUEke3RoaXMubGFzdFZhdWx0U3luY1N0YXR1c31gLCBgUmVjZW50IHN0YXR1czogJHt0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXN9YClcbiAgICAgIDogdGhpcy50KFwiXHU2NzAwXHU4RkQxXHU3MkI2XHU2MDAxXHVGRjFBXHU2NjgyXHU2NUUwXCIsIFwiUmVjZW50IHN0YXR1czogbm9uZVwiKTtcbiAgfVxuXG4gIGFzeW5jIHJ1bk1hbnVhbFN5bmMoKSB7XG4gICAgYXdhaXQgdGhpcy5zeW5jUGVuZGluZ1ZhdWx0Q29udGVudCh0cnVlKTtcbiAgfVxuXG4gIGFzeW5jIHJ1bkZ1bGxSZWNvbmNpbGVTeW5jKCkge1xuICAgIGF3YWl0IHRoaXMuc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQodHJ1ZSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlYnVpbGRSZWZlcmVuY2VJbmRleCgpIHtcbiAgICBjb25zdCBuZXh0ID0gbmV3IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PigpO1xuICAgIGZvciAoY29uc3QgZmlsZSBvZiB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkpIHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgbmV4dC5zZXQoZmlsZS5wYXRoLCB0aGlzLmV4dHJhY3RSZW1vdGVQYXRoc0Zyb21UZXh0KGNvbnRlbnQpKTtcbiAgICB9XG4gICAgdGhpcy5ub3RlUmVtb3RlUmVmcyA9IG5leHQ7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZVZhdWx0TW9kaWZ5KGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5tYXJrUGVuZGluZ1ZhdWx0U3luYyhmaWxlLnBhdGgpO1xuXG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgY29uc3QgbmV4dFJlZnMgPSB0aGlzLmV4dHJhY3RSZW1vdGVQYXRoc0Zyb21UZXh0KGNvbnRlbnQpO1xuICAgICAgY29uc3QgcHJldmlvdXNSZWZzID0gdGhpcy5ub3RlUmVtb3RlUmVmcy5nZXQoZmlsZS5wYXRoKSA/PyBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICAgIHRoaXMubm90ZVJlbW90ZVJlZnMuc2V0KGZpbGUucGF0aCwgbmV4dFJlZnMpO1xuXG4gICAgICBjb25zdCBhZGRlZCA9IFsuLi5uZXh0UmVmc10uZmlsdGVyKCh2YWx1ZSkgPT4gIXByZXZpb3VzUmVmcy5oYXModmFsdWUpKTtcbiAgICAgIGNvbnN0IHJlbW92ZWQgPSBbLi4ucHJldmlvdXNSZWZzXS5maWx0ZXIoKHZhbHVlKSA9PiAhbmV4dFJlZnMuaGFzKHZhbHVlKSk7XG4gICAgICBpZiAoYWRkZWQubGVuZ3RoID4gMCkge1xuICAgICAgICB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyhmaWxlLnBhdGgsIFwiaW1hZ2UtYWRkXCIpO1xuICAgICAgfVxuICAgICAgaWYgKHJlbW92ZWQubGVuZ3RoID4gMCkge1xuICAgICAgICB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyhmaWxlLnBhdGgsIFwiaW1hZ2UtcmVtb3ZlXCIpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZVZhdWx0RGVsZXRlKGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgoZmlsZS5wYXRoKSkge1xuICAgICAgdGhpcy5tYXJrUGVuZGluZ1ZhdWx0RGVsZXRpb24oZmlsZS5wYXRoKTtcbiAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICB9XG5cbiAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgdGhpcy5ub3RlUmVtb3RlUmVmcy5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZVZhdWx0UmVuYW1lKGZpbGU6IFRBYnN0cmFjdEZpbGUsIG9sZFBhdGg6IHN0cmluZykge1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuc3luY1N1cHBvcnQuc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChvbGRQYXRoKSkge1xuICAgICAgdGhpcy5tYXJrUGVuZGluZ1ZhdWx0RGVsZXRpb24ob2xkUGF0aCk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUob2xkUGF0aCk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKGZpbGUucGF0aCkpIHtcbiAgICAgIHRoaXMubWFya1BlbmRpbmdWYXVsdFN5bmMoZmlsZS5wYXRoKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgfVxuXG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIGNvbnN0IHJlZnMgPSB0aGlzLm5vdGVSZW1vdGVSZWZzLmdldChvbGRQYXRoKTtcbiAgICAgIGlmIChyZWZzKSB7XG4gICAgICAgIHRoaXMubm90ZVJlbW90ZVJlZnMuZGVsZXRlKG9sZFBhdGgpO1xuICAgICAgICB0aGlzLm5vdGVSZW1vdGVSZWZzLnNldChmaWxlLnBhdGgsIHJlZnMpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXRoaXMuc3luY1N1cHBvcnQuc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChmaWxlLnBhdGgpKSB7XG4gICAgICAgIHRoaXMuc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jKGZpbGUucGF0aCwgXCJpbWFnZS1hZGRcIik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBtYXJrUGVuZGluZ1ZhdWx0U3luYyhwYXRoOiBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKHBhdGgpKSB7XG4gICAgICB0aGlzLnBlbmRpbmdWYXVsdFN5bmNQYXRocy5kZWxldGUocGF0aCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5wZW5kaW5nVmF1bHREZWxldGlvblBhdGhzLmRlbGV0ZShwYXRoKTtcbiAgICB0aGlzLnBlbmRpbmdWYXVsdFN5bmNQYXRocy5hZGQocGF0aCk7XG4gIH1cblxuICBwcml2YXRlIG1hcmtQZW5kaW5nVmF1bHREZWxldGlvbihwYXRoOiBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKHBhdGgpKSB7XG4gICAgICB0aGlzLnBlbmRpbmdWYXVsdFN5bmNQYXRocy5kZWxldGUocGF0aCk7XG4gICAgICB0aGlzLnBlbmRpbmdWYXVsdERlbGV0aW9uUGF0aHMuZGVsZXRlKHBhdGgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5zeW5jSW5kZXguZ2V0KHBhdGgpO1xuICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzLmRlbGV0ZShwYXRoKTtcbiAgICB0aGlzLnBlbmRpbmdWYXVsdERlbGV0aW9uUGF0aHMuc2V0KHBhdGgsIHtcbiAgICAgIHJlbW90ZVBhdGg6IGV4aXN0aW5nPy5yZW1vdGVQYXRoID8/IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKHBhdGgpLFxuICAgICAgcmVtb3RlU2lnbmF0dXJlOiBleGlzdGluZz8ucmVtb3RlU2lnbmF0dXJlLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRyYWN0UmVtb3RlUGF0aHNGcm9tVGV4dChjb250ZW50OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZWZzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3Qgc3BhblJlZ2V4ID0gL2RhdGEtc2VjdXJlLXdlYmRhdj1cIihbXlwiXSspXCIvZztcbiAgICBjb25zdCBwcm90b2NvbFJlZ2V4ID0gL3dlYmRhdi1zZWN1cmU6XFwvXFwvKFteXFxzKVwiXSspL2c7XG4gICAgY29uc3QgY29kZUJsb2NrUmVnZXggPSAvYGBgc2VjdXJlLXdlYmRhdlxccysoW1xcc1xcU10qPylgYGAvZztcbiAgICBsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cbiAgICB3aGlsZSAoKG1hdGNoID0gc3BhblJlZ2V4LmV4ZWMoY29udGVudCkpICE9PSBudWxsKSB7XG4gICAgICByZWZzLmFkZCh0aGlzLnVuZXNjYXBlSHRtbChtYXRjaFsxXSkpO1xuICAgIH1cblxuICAgIHdoaWxlICgobWF0Y2ggPSBwcm90b2NvbFJlZ2V4LmV4ZWMoY29udGVudCkpICE9PSBudWxsKSB7XG4gICAgICByZWZzLmFkZCh0aGlzLnVuZXNjYXBlSHRtbChtYXRjaFsxXSkpO1xuICAgIH1cblxuICAgIHdoaWxlICgobWF0Y2ggPSBjb2RlQmxvY2tSZWdleC5leGVjKGNvbnRlbnQpKSAhPT0gbnVsbCkge1xuICAgICAgY29uc3QgcGFyc2VkID0gdGhpcy5pbWFnZVN1cHBvcnQucGFyc2VTZWN1cmVJbWFnZUJsb2NrKG1hdGNoWzFdKTtcbiAgICAgIGlmIChwYXJzZWQ/LnBhdGgpIHtcbiAgICAgICAgcmVmcy5hZGQocGFyc2VkLnBhdGgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZWZzO1xuICB9XG5cbiAgcHJpdmF0ZSBzY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZVBhdGg6IHN0cmluZywgcmVhc29uOiBcImltYWdlLWFkZFwiIHwgXCJpbWFnZS1yZW1vdmVcIikge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5wcmlvcml0eU5vdGVTeW5jVGltZW91dHMuZ2V0KG5vdGVQYXRoKTtcbiAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQoZXhpc3RpbmcpO1xuICAgIH1cblxuICAgIGNvbnN0IGRlbGF5TXMgPSByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCIgPyAxMjAwIDogNjAwO1xuICAgIGNvbnN0IHRpbWVvdXRJZCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLmRlbGV0ZShub3RlUGF0aCk7XG4gICAgICB2b2lkIHRoaXMuZmx1c2hQcmlvcml0eU5vdGVTeW5jKG5vdGVQYXRoLCByZWFzb24pO1xuICAgIH0sIGRlbGF5TXMpO1xuICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLnNldChub3RlUGF0aCwgdGltZW91dElkKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZmx1c2hQcmlvcml0eU5vdGVTeW5jKG5vdGVQYXRoOiBzdHJpbmcsIHJlYXNvbjogXCJpbWFnZS1hZGRcIiB8IFwiaW1hZ2UtcmVtb3ZlXCIpIHtcbiAgICBpZiAodGhpcy5wcmlvcml0eU5vdGVTeW5jc0luRmxpZ2h0Lmhhcyhub3RlUGF0aCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICB0aGlzLnVwbG9hZFF1ZXVlLmhhc1BlbmRpbmdXb3JrRm9yTm90ZShub3RlUGF0aCkgfHxcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlcy5zaXplID4gMCB8fFxuICAgICAgdGhpcy5zeW5jSW5Qcm9ncmVzcyB8fFxuICAgICAgdGhpcy5hdXRvU3luY1RpY2tJblByb2dyZXNzXG4gICAgKSB7XG4gICAgICB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyhub3RlUGF0aCwgcmVhc29uKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBmaWxlID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgobm90ZVBhdGgpO1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkgfHwgZmlsZS5leHRlbnNpb24gIT09IFwibWRcIiB8fCB0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgoZmlsZS5wYXRoKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY3NJbkZsaWdodC5hZGQobm90ZVBhdGgpO1xuICAgIHRyeSB7XG4gICAgICB0aGlzLmVuc3VyZUNvbmZpZ3VyZWQoKTtcblxuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMucmVhZE1hcmtkb3duQ29udGVudFByZWZlckVkaXRvcihmaWxlKTtcbiAgICAgIGlmICh0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5zeW5jU3VwcG9ydC5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgIGNvbnN0IHVwbG9hZGVkUmVtb3RlID0gYXdhaXQgdGhpcy51cGxvYWRDb250ZW50RmlsZVRvUmVtb3RlKGZpbGUsIHJlbW90ZVBhdGgsIGNvbnRlbnQpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICBsb2NhbFNpZ25hdHVyZTogYXdhaXQgdGhpcy5idWlsZEN1cnJlbnRMb2NhbFNpZ25hdHVyZShmaWxlLCBjb250ZW50KSxcbiAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiB1cGxvYWRlZFJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICB9KTtcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzLmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy50KFxuICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCJcbiAgICAgICAgICA/IGBcdTVERjJcdTRGMThcdTUxNDhcdTU0MENcdTZCNjVcdTU2RkVcdTcyNDdcdTY1QjBcdTU4OUVcdTU0MEVcdTc2ODRcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YFxuICAgICAgICAgIDogYFx1NURGMlx1NEYxOFx1NTE0OFx1NTQwQ1x1NkI2NVx1NTZGRVx1NzI0N1x1NTIyMFx1OTY2NFx1NTQwRVx1NzY4NFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCJcbiAgICAgICAgICA/IGBQcmlvcml0aXplZCBub3RlIHN5bmMgZmluaXNoZWQgYWZ0ZXIgaW1hZ2UgYWRkOiAke2ZpbGUuYmFzZW5hbWV9YFxuICAgICAgICAgIDogYFByaW9yaXRpemVkIG5vdGUgc3luYyBmaW5pc2hlZCBhZnRlciBpbWFnZSByZW1vdmFsOiAke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiUHJpb3JpdHkgbm90ZSBzeW5jIGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLmRlc2NyaWJlRXJyb3IoXG4gICAgICAgIHRoaXMudChcbiAgICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCIgPyBcIlx1NTZGRVx1NzI0N1x1NjVCMFx1NTg5RVx1NTQwRVx1NzY4NFx1N0IxNFx1OEJCMFx1NEYxOFx1NTE0OFx1NTQwQ1x1NkI2NVx1NTkzMVx1OEQyNVwiIDogXCJcdTU2RkVcdTcyNDdcdTUyMjBcdTk2NjRcdTU0MEVcdTc2ODRcdTdCMTRcdThCQjBcdTRGMThcdTUxNDhcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIixcbiAgICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCIgPyBcIlByaW9yaXR5IG5vdGUgc3luYyBhZnRlciBpbWFnZSBhZGQgZmFpbGVkXCIgOiBcIlByaW9yaXR5IG5vdGUgc3luYyBhZnRlciBpbWFnZSByZW1vdmFsIGZhaWxlZFwiLFxuICAgICAgICApLFxuICAgICAgICBlcnJvcixcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZVBhdGgsIHJlYXNvbik7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY3NJbkZsaWdodC5kZWxldGUobm90ZVBhdGgpO1xuICAgIH1cbiAgfVxuXG5cbiAgcHJpdmF0ZSBhc3luYyBidWlsZFVwbG9hZFJlcGxhY2VtZW50cyhjb250ZW50OiBzdHJpbmcsIG5vdGVGaWxlOiBURmlsZSwgdXBsb2FkQ2FjaGU/OiBNYXA8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgY29uc3Qgc2VlbiA9IG5ldyBNYXA8c3RyaW5nLCBVcGxvYWRSZXdyaXRlPigpO1xuICAgIGNvbnN0IHdpa2lNYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtcXFsoW15cXF1dKylcXF1cXF0vZyldO1xuICAgIGNvbnN0IG1hcmtkb3duTWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKC8hXFxbW15cXF1dKl1cXCgoW14pXSspXFwpL2cpXTtcbiAgICBjb25zdCBodG1sSW1hZ2VNYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLzxpbWdcXGJbXj5dKnNyYz1bXCInXShbXlwiJ10rKVtcIiddW14+XSo+L2dpKV07XG5cbiAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIHdpa2lNYXRjaGVzKSB7XG4gICAgICBjb25zdCByYXdMaW5rID0gbWF0Y2hbMV0uc3BsaXQoXCJ8XCIpWzBdLnRyaW0oKTtcbiAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGVGaWxlLnBhdGgpO1xuICAgICAgaWYgKCFmaWxlIHx8ICF0aGlzLmlzSW1hZ2VGaWxlKGZpbGUpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFZhdWx0RmlsZShmaWxlLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgICAgb3JpZ2luYWw6IG1hdGNoWzBdLFxuICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGZpbGUuYmFzZW5hbWUpLFxuICAgICAgICAgIHNvdXJjZUZpbGU6IGZpbGUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWFya2Rvd25NYXRjaGVzKSB7XG4gICAgICBjb25zdCByYXdMaW5rID0gZGVjb2RlVVJJQ29tcG9uZW50KG1hdGNoWzFdLnRyaW0oKS5yZXBsYWNlKC9ePHw+JC9nLCBcIlwiKSk7XG4gICAgICBpZiAoL14od2ViZGF2LXNlY3VyZTp8ZGF0YTopL2kudGVzdChyYXdMaW5rKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuaXNIdHRwVXJsKHJhd0xpbmspKSB7XG4gICAgICAgIGlmICghc2Vlbi5oYXMobWF0Y2hbMF0pKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlbW90ZVVybCA9IGF3YWl0IHRoaXMudXBsb2FkUmVtb3RlSW1hZ2VVcmwocmF3TGluaywgdXBsb2FkQ2FjaGUpO1xuICAgICAgICAgICAgY29uc3QgYWx0VGV4dCA9IHRoaXMuZXh0cmFjdE1hcmtkb3duQWx0VGV4dChtYXRjaFswXSkgfHwgdGhpcy5nZXREaXNwbGF5TmFtZUZyb21VcmwocmF3TGluayk7XG4gICAgICAgICAgICBzZWVuLnNldChtYXRjaFswXSwge1xuICAgICAgICAgICAgICBvcmlnaW5hbDogbWF0Y2hbMF0sXG4gICAgICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGFsdFRleHQpLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFtzZWN1cmUtd2ViZGF2LWltYWdlc10gXHU4REYzXHU4RkM3XHU1OTMxXHU4RDI1XHU3Njg0XHU4RkRDXHU3QTBCXHU1NkZFXHU3MjQ3ICR7cmF3TGlua31gLCBlPy5tZXNzYWdlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGVGaWxlLnBhdGgpO1xuICAgICAgaWYgKCFmaWxlIHx8ICF0aGlzLmlzSW1hZ2VGaWxlKGZpbGUpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFZhdWx0RmlsZShmaWxlLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgICAgb3JpZ2luYWw6IG1hdGNoWzBdLFxuICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGZpbGUuYmFzZW5hbWUpLFxuICAgICAgICAgIHNvdXJjZUZpbGU6IGZpbGUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgaHRtbEltYWdlTWF0Y2hlcykge1xuICAgICAgY29uc3QgcmF3TGluayA9IHRoaXMudW5lc2NhcGVIdG1sKG1hdGNoWzFdLnRyaW0oKSk7XG4gICAgICBpZiAoIXRoaXMuaXNIdHRwVXJsKHJhd0xpbmspIHx8IHNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRSZW1vdGVJbWFnZVVybChyYXdMaW5rLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIGNvbnN0IGFsdFRleHQgPSB0aGlzLmV4dHJhY3RIdG1sSW1hZ2VBbHRUZXh0KG1hdGNoWzBdKSB8fCB0aGlzLmdldERpc3BsYXlOYW1lRnJvbVVybChyYXdMaW5rKTtcbiAgICAgICAgc2Vlbi5zZXQobWF0Y2hbMF0sIHtcbiAgICAgICAgICBvcmlnaW5hbDogbWF0Y2hbMF0sXG4gICAgICAgICAgcmV3cml0dGVuOiB0aGlzLmltYWdlU3VwcG9ydC5idWlsZFNlY3VyZUltYWdlTWFya3VwKHJlbW90ZVVybCwgYWx0VGV4dCksXG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgW3NlY3VyZS13ZWJkYXYtaW1hZ2VzXSBcdThERjNcdThGQzdcdTU5MzFcdThEMjVcdTc2ODRcdThGRENcdTdBMEJcdTU2RkVcdTcyNDcgJHtyYXdMaW5rfWAsIGU/Lm1lc3NhZ2UpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBbLi4uc2Vlbi52YWx1ZXMoKV07XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RNYXJrZG93bkFsdFRleHQobWFya2Rvd25JbWFnZTogc3RyaW5nKSB7XG4gICAgY29uc3QgbWF0Y2ggPSBtYXJrZG93bkltYWdlLm1hdGNoKC9eIVxcWyhbXlxcXV0qKVxcXS8pO1xuICAgIHJldHVybiBtYXRjaD8uWzFdPy50cmltKCkgPz8gXCJcIjtcbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdEh0bWxJbWFnZUFsdFRleHQoaHRtbEltYWdlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtYXRjaCA9IGh0bWxJbWFnZS5tYXRjaCgvXFxiYWx0PVtcIiddKFteXCInXSopW1wiJ10vaSk7XG4gICAgcmV0dXJuIG1hdGNoID8gdGhpcy51bmVzY2FwZUh0bWwobWF0Y2hbMV0udHJpbSgpKSA6IFwiXCI7XG4gIH1cblxuICBwcml2YXRlIGlzSHR0cFVybCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIC9eaHR0cHM/OlxcL1xcLy9pLnRlc3QodmFsdWUpO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXREaXNwbGF5TmFtZUZyb21VcmwocmF3VXJsOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXJsID0gbmV3IFVSTChyYXdVcmwpO1xuICAgICAgY29uc3QgZmlsZU5hbWUgPSB0aGlzLnNhbml0aXplRmlsZU5hbWUodXJsLnBhdGhuYW1lLnNwbGl0KFwiL1wiKS5wb3AoKSB8fCBcIlwiKTtcbiAgICAgIGlmIChmaWxlTmFtZSkge1xuICAgICAgICByZXR1cm4gZmlsZU5hbWUucmVwbGFjZSgvXFwuW14uXSskLywgXCJcIik7XG4gICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBGYWxsIHRocm91Z2ggdG8gdGhlIGdlbmVyaWMgbGFiZWwgYmVsb3cuXG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMudChcIlx1N0Y1MVx1OTg3NVx1NTZGRVx1NzI0N1wiLCBcIldlYiBpbWFnZVwiKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVzb2x2ZUxpbmtlZEZpbGUobGluazogc3RyaW5nLCBzb3VyY2VQYXRoOiBzdHJpbmcpOiBURmlsZSB8IG51bGwge1xuICAgIGNvbnN0IGNsZWFuZWQgPSBsaW5rLnJlcGxhY2UoLyMuKi8sIFwiXCIpLnRyaW0oKTtcbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpcnN0TGlua3BhdGhEZXN0KGNsZWFuZWQsIHNvdXJjZVBhdGgpO1xuICAgIHJldHVybiB0YXJnZXQgaW5zdGFuY2VvZiBURmlsZSA/IHRhcmdldCA6IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGlzSW1hZ2VGaWxlKGZpbGU6IFRGaWxlKSB7XG4gICAgcmV0dXJuIC9eKHBuZ3xqcGU/Z3xnaWZ8d2VicHxibXB8c3ZnKSQvaS50ZXN0KGZpbGUuZXh0ZW5zaW9uKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkVmF1bHRGaWxlKGZpbGU6IFRGaWxlLCB1cGxvYWRDYWNoZT86IE1hcDxzdHJpbmcsIHN0cmluZz4pIHtcbiAgICBpZiAodXBsb2FkQ2FjaGU/LmhhcyhmaWxlLnBhdGgpKSB7XG4gICAgICByZXR1cm4gdXBsb2FkQ2FjaGUuZ2V0KGZpbGUucGF0aCkhO1xuICAgIH1cblxuICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xuICAgIGNvbnN0IGJpbmFyeSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWRCaW5hcnkoZmlsZSk7XG4gICAgY29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLnByZXBhcmVVcGxvYWRQYXlsb2FkKGJpbmFyeSwgdGhpcy5nZXRNaW1lVHlwZShmaWxlLmV4dGVuc2lvbiksIGZpbGUubmFtZSk7XG4gICAgY29uc3QgcmVtb3RlTmFtZSA9IGF3YWl0IHRoaXMuYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnkocHJlcGFyZWQuZmlsZU5hbWUsIHByZXBhcmVkLmJpbmFyeSk7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRSZW1vdGVQYXRoKHJlbW90ZU5hbWUpO1xuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KHJlbW90ZVBhdGgsIHByZXBhcmVkLmJpbmFyeSwgcHJlcGFyZWQubWltZVR5cGUpO1xuICAgIGNvbnN0IHJlbW90ZVVybCA9IGAke1NFQ1VSRV9QUk9UT0NPTH0vLyR7cmVtb3RlUGF0aH1gO1xuICAgIHVwbG9hZENhY2hlPy5zZXQoZmlsZS5wYXRoLCByZW1vdGVVcmwpO1xuICAgIHJldHVybiByZW1vdGVVcmw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwbG9hZFJlbW90ZUltYWdlVXJsKGltYWdlVXJsOiBzdHJpbmcsIHVwbG9hZENhY2hlPzogTWFwPHN0cmluZywgc3RyaW5nPikge1xuICAgIGNvbnN0IGNhY2hlS2V5ID0gYHJlbW90ZToke2ltYWdlVXJsfWA7XG4gICAgaWYgKHVwbG9hZENhY2hlPy5oYXMoY2FjaGVLZXkpKSB7XG4gICAgICByZXR1cm4gdXBsb2FkQ2FjaGUuZ2V0KGNhY2hlS2V5KSE7XG4gICAgfVxuXG4gICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiBpbWFnZVVybCxcbiAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgIGZvbGxvd1JlZGlyZWN0czogdHJ1ZSxcbiAgICB9KTtcblxuICAgIHRoaXMuYXNzZXJ0UmVzcG9uc2VTdWNjZXNzKHJlc3BvbnNlLCBcIlJlbW90ZSBpbWFnZSBkb3dubG9hZFwiKTtcblxuICAgIGNvbnN0IGNvbnRlbnRUeXBlID0gcmVzcG9uc2UuaGVhZGVyc1tcImNvbnRlbnQtdHlwZVwiXSA/PyBcIlwiO1xuICAgIGlmICghdGhpcy5pc0ltYWdlQ29udGVudFR5cGUoY29udGVudFR5cGUpICYmICF0aGlzLmxvb2tzTGlrZUltYWdlVXJsKGltYWdlVXJsKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1OEZEQ1x1N0EwQlx1OTRGRVx1NjNBNVx1NEUwRFx1NjYyRlx1NTNFRlx1OEJDNlx1NTIyQlx1NzY4NFx1NTZGRVx1NzI0N1x1OEQ0NFx1NkU5MFx1MzAwMlwiLCBcIlRoZSByZW1vdGUgVVJMIGRvZXMgbm90IGxvb2sgbGlrZSBhbiBpbWFnZSByZXNvdXJjZS5cIikpO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbGVOYW1lID0gdGhpcy5idWlsZFJlbW90ZVNvdXJjZUZpbGVOYW1lKGltYWdlVXJsLCBjb250ZW50VHlwZSk7XG4gICAgY29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLnByZXBhcmVVcGxvYWRQYXlsb2FkKFxuICAgICAgcmVzcG9uc2UuYXJyYXlCdWZmZXIsXG4gICAgICB0aGlzLm5vcm1hbGl6ZUltYWdlTWltZVR5cGUoY29udGVudFR5cGUsIGZpbGVOYW1lKSxcbiAgICAgIGZpbGVOYW1lLFxuICAgICk7XG4gICAgY29uc3QgcmVtb3RlTmFtZSA9IGF3YWl0IHRoaXMuYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnkocHJlcGFyZWQuZmlsZU5hbWUsIHByZXBhcmVkLmJpbmFyeSk7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuYnVpbGRSZW1vdGVQYXRoKHJlbW90ZU5hbWUpO1xuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KHJlbW90ZVBhdGgsIHByZXBhcmVkLmJpbmFyeSwgcHJlcGFyZWQubWltZVR5cGUpO1xuICAgIGNvbnN0IHJlbW90ZVVybCA9IGAke1NFQ1VSRV9QUk9UT0NPTH0vLyR7cmVtb3RlUGF0aH1gO1xuICAgIHVwbG9hZENhY2hlPy5zZXQoY2FjaGVLZXksIHJlbW90ZVVybCk7XG4gICAgcmV0dXJuIHJlbW90ZVVybDtcbiAgfVxuXG4gIHByaXZhdGUgaXNJbWFnZUNvbnRlbnRUeXBlKGNvbnRlbnRUeXBlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gL15pbWFnZVxcLy9pLnRlc3QoY29udGVudFR5cGUudHJpbSgpKTtcbiAgfVxuXG4gIHByaXZhdGUgbG9va3NMaWtlSW1hZ2VVcmwocmF3VXJsOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXJsID0gbmV3IFVSTChyYXdVcmwpO1xuICAgICAgcmV0dXJuIC9cXC4ocG5nfGpwZT9nfGdpZnx3ZWJwfGJtcHxzdmcpJC9pLnRlc3QodXJsLnBhdGhuYW1lKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkUmVtb3RlU291cmNlRmlsZU5hbWUocmF3VXJsOiBzdHJpbmcsIGNvbnRlbnRUeXBlOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdXJsID0gbmV3IFVSTChyYXdVcmwpO1xuICAgICAgY29uc3QgY2FuZGlkYXRlID0gdGhpcy5zYW5pdGl6ZUZpbGVOYW1lKHVybC5wYXRobmFtZS5zcGxpdChcIi9cIikucG9wKCkgfHwgXCJcIik7XG4gICAgICBpZiAoY2FuZGlkYXRlICYmIC9cXC5bYS16MC05XSskL2kudGVzdChjYW5kaWRhdGUpKSB7XG4gICAgICAgIHJldHVybiBjYW5kaWRhdGU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbU1pbWVUeXBlKGNvbnRlbnRUeXBlKSB8fCBcInBuZ1wiO1xuICAgICAgcmV0dXJuIGNhbmRpZGF0ZSA/IGAke2NhbmRpZGF0ZX0uJHtleHRlbnNpb259YCA6IGByZW1vdGUtaW1hZ2UuJHtleHRlbnNpb259YDtcbiAgICB9IGNhdGNoIHtcbiAgICAgIGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbU1pbWVUeXBlKGNvbnRlbnRUeXBlKSB8fCBcInBuZ1wiO1xuICAgICAgcmV0dXJuIGByZW1vdGUtaW1hZ2UuJHtleHRlbnNpb259YDtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHNhbml0aXplRmlsZU5hbWUoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBmaWxlTmFtZS5yZXBsYWNlKC9bXFxcXC86Kj9cIjw+fF0rL2csIFwiLVwiKS50cmltKCk7XG4gIH1cblxuICBwcml2YXRlIGdldEV4dGVuc2lvbkZyb21NaW1lVHlwZShjb250ZW50VHlwZTogc3RyaW5nKSB7XG4gICAgY29uc3QgbWltZVR5cGUgPSBjb250ZW50VHlwZS5zcGxpdChcIjtcIilbMF0udHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgcmV0dXJuIE1JTUVfTUFQW21pbWVUeXBlXSA/PyBcIlwiO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVJbWFnZU1pbWVUeXBlKGNvbnRlbnRUeXBlOiBzdHJpbmcsIGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtaW1lVHlwZSA9IGNvbnRlbnRUeXBlLnNwbGl0KFwiO1wiKVswXS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAobWltZVR5cGUgJiYgbWltZVR5cGUgIT09IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCIpIHtcbiAgICAgIHJldHVybiBtaW1lVHlwZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5nZXRNaW1lVHlwZUZyb21GaWxlTmFtZShmaWxlTmFtZSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwbG9hZEJpbmFyeShyZW1vdGVQYXRoOiBzdHJpbmcsIGJpbmFyeTogQXJyYXlCdWZmZXIsIG1pbWVUeXBlOiBzdHJpbmcpIHtcbiAgICBhd2FpdCB0aGlzLmVuc3VyZVJlbW90ZURpcmVjdG9yaWVzKHJlbW90ZVBhdGgpO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJQVVRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgXCJDb250ZW50LVR5cGVcIjogbWltZVR5cGUsXG4gICAgICB9LFxuICAgICAgYm9keTogYmluYXJ5LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2UsIFwiVXBsb2FkXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVFZGl0b3JQYXN0ZShldnQ6IENsaXBib2FyZEV2ZW50LCBlZGl0b3I6IEVkaXRvciwgaW5mbzogTWFya2Rvd25WaWV3IHwgTWFya2Rvd25GaWxlSW5mbykge1xuICAgIGlmIChldnQuZGVmYXVsdFByZXZlbnRlZCB8fCAhaW5mby5maWxlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaW1hZ2VGaWxlID0gdGhpcy5leHRyYWN0SW1hZ2VGaWxlRnJvbUNsaXBib2FyZChldnQpO1xuICAgIGlmIChpbWFnZUZpbGUpIHtcbiAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgY29uc3QgZmlsZU5hbWUgPSBpbWFnZUZpbGUubmFtZSB8fCB0aGlzLmJ1aWxkQ2xpcGJvYXJkRmlsZU5hbWUoaW1hZ2VGaWxlLnR5cGUpO1xuICAgICAgYXdhaXQgdGhpcy51cGxvYWRRdWV1ZS5lbnF1ZXVlRWRpdG9ySW1hZ2VVcGxvYWQoaW5mby5maWxlLCBlZGl0b3IsIGltYWdlRmlsZSwgZmlsZU5hbWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGh0bWwgPSBldnQuY2xpcGJvYXJkRGF0YT8uZ2V0RGF0YShcInRleHQvaHRtbFwiKT8udHJpbSgpID8/IFwiXCI7XG4gICAgaWYgKCFodG1sIHx8ICF0aGlzLmh0bWxDb250YWluc1JlbW90ZUltYWdlcyhodG1sKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGF3YWl0IHRoaXMuaGFuZGxlSHRtbFBhc3RlV2l0aFJlbW90ZUltYWdlcyhpbmZvLmZpbGUsIGVkaXRvciwgaHRtbCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUVkaXRvckRyb3AoZXZ0OiBEcmFnRXZlbnQsIGVkaXRvcjogRWRpdG9yLCBpbmZvOiBNYXJrZG93blZpZXcgfCBNYXJrZG93bkZpbGVJbmZvKSB7XG4gICAgaWYgKGV2dC5kZWZhdWx0UHJldmVudGVkIHx8ICFpbmZvLmZpbGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpbWFnZUZpbGUgPSB0aGlzLmV4dHJhY3RJbWFnZUZpbGVGcm9tRHJvcChldnQpO1xuICAgIGlmICghaW1hZ2VGaWxlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3QgZmlsZU5hbWUgPSBpbWFnZUZpbGUubmFtZSB8fCB0aGlzLmJ1aWxkQ2xpcGJvYXJkRmlsZU5hbWUoaW1hZ2VGaWxlLnR5cGUpO1xuICAgIGF3YWl0IHRoaXMudXBsb2FkUXVldWUuZW5xdWV1ZUVkaXRvckltYWdlVXBsb2FkKGluZm8uZmlsZSwgZWRpdG9yLCBpbWFnZUZpbGUsIGZpbGVOYW1lKTtcbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdEltYWdlRmlsZUZyb21DbGlwYm9hcmQoZXZ0OiBDbGlwYm9hcmRFdmVudCkge1xuICAgIGNvbnN0IGRpcmVjdCA9IEFycmF5LmZyb20oZXZ0LmNsaXBib2FyZERhdGE/LmZpbGVzID8/IFtdKS5maW5kKChmaWxlKSA9PiBmaWxlLnR5cGUuc3RhcnRzV2l0aChcImltYWdlL1wiKSk7XG4gICAgaWYgKGRpcmVjdCkge1xuICAgICAgcmV0dXJuIGRpcmVjdDtcbiAgICB9XG5cbiAgICBjb25zdCBpdGVtID0gQXJyYXkuZnJvbShldnQuY2xpcGJvYXJkRGF0YT8uaXRlbXMgPz8gW10pLmZpbmQoKGVudHJ5KSA9PiBlbnRyeS50eXBlLnN0YXJ0c1dpdGgoXCJpbWFnZS9cIikpO1xuICAgIHJldHVybiBpdGVtPy5nZXRBc0ZpbGUoKSA/PyBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBodG1sQ29udGFpbnNSZW1vdGVJbWFnZXMoaHRtbDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIC88aW1nXFxiW14+XSpzcmM9W1wiJ11odHRwcz86XFwvXFwvW15cIiddK1tcIiddW14+XSo+L2kudGVzdChodG1sKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlSHRtbFBhc3RlV2l0aFJlbW90ZUltYWdlcyhub3RlRmlsZTogVEZpbGUsIGVkaXRvcjogRWRpdG9yLCBodG1sOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVuZGVyZWQgPSBhd2FpdCB0aGlzLmNvbnZlcnRIdG1sQ2xpcGJvYXJkVG9TZWN1cmVNYXJrZG93bihodG1sLCBub3RlRmlsZSk7XG4gICAgICBpZiAoIXJlbmRlcmVkLnRyaW0oKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGVkaXRvci5yZXBsYWNlU2VsZWN0aW9uKHJlbmRlcmVkKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1REYyXHU1QzA2XHU3RjUxXHU5ODc1XHU1NkZFXHU2NTg3XHU3Qzk4XHU4RDM0XHU1RTc2XHU2MjkzXHU1M0Q2XHU4RkRDXHU3QTBCXHU1NkZFXHU3MjQ3XHUzMDAyXCIsIFwiUGFzdGVkIHdlYiBjb250ZW50IGFuZCBjYXB0dXJlZCByZW1vdGUgaW1hZ2VzLlwiKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcGFzdGUgSFRNTCBjb250ZW50IHdpdGggcmVtb3RlIGltYWdlc1wiLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKFxuICAgICAgICB0aGlzLmRlc2NyaWJlRXJyb3IoXG4gICAgICAgICAgdGhpcy50KFwiXHU1OTA0XHU3NDA2XHU3RjUxXHU5ODc1XHU1NkZFXHU2NTg3XHU3Qzk4XHU4RDM0XHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIHByb2Nlc3MgcGFzdGVkIHdlYiBjb250ZW50XCIpLFxuICAgICAgICAgIGVycm9yLFxuICAgICAgICApLFxuICAgICAgICA4MDAwLFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNvbnZlcnRIdG1sQ2xpcGJvYXJkVG9TZWN1cmVNYXJrZG93bihodG1sOiBzdHJpbmcsIG5vdGVGaWxlOiBURmlsZSkge1xuICAgIGNvbnN0IHBhcnNlciA9IG5ldyBET01QYXJzZXIoKTtcbiAgICBjb25zdCBkb2N1bWVudCA9IHBhcnNlci5wYXJzZUZyb21TdHJpbmcoaHRtbCwgXCJ0ZXh0L2h0bWxcIik7XG4gICAgY29uc3QgdXBsb2FkQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgIGNvbnN0IHJlbmRlcmVkQmxvY2tzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBub2RlIG9mIEFycmF5LmZyb20oZG9jdW1lbnQuYm9keS5jaGlsZE5vZGVzKSkge1xuICAgICAgY29uc3QgYmxvY2sgPSBhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxOb2RlKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgMCk7XG4gICAgICBpZiAoYmxvY2sudHJpbSgpKSB7XG4gICAgICAgIHJlbmRlcmVkQmxvY2tzLnB1c2goYmxvY2sudHJpbSgpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVuZGVyZWRCbG9ja3Muam9pbihcIlxcblxcblwiKSArIFwiXFxuXCI7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlbmRlclBhc3RlZEh0bWxOb2RlKFxuICAgIG5vZGU6IE5vZGUsXG4gICAgbm90ZUZpbGU6IFRGaWxlLFxuICAgIHVwbG9hZENhY2hlOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuICAgIGxpc3REZXB0aDogbnVtYmVyLFxuICApOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSkge1xuICAgICAgcmV0dXJuIHRoaXMubm9ybWFsaXplQ2xpcGJvYXJkVGV4dChub2RlLnRleHRDb250ZW50ID8/IFwiXCIpO1xuICAgIH1cblxuICAgIGlmICghKG5vZGUgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkpIHtcbiAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cblxuICAgIGNvbnN0IHRhZyA9IG5vZGUudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmICh0YWcgPT09IFwiaW1nXCIpIHtcbiAgICAgIGNvbnN0IHNyYyA9IHRoaXMudW5lc2NhcGVIdG1sKG5vZGUuZ2V0QXR0cmlidXRlKFwic3JjXCIpPy50cmltKCkgPz8gXCJcIik7XG4gICAgICBpZiAoIXRoaXMuaXNIdHRwVXJsKHNyYykpIHtcbiAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFsdCA9IChub2RlLmdldEF0dHJpYnV0ZShcImFsdFwiKSA/PyBcIlwiKS50cmltKCkgfHwgdGhpcy5nZXREaXNwbGF5TmFtZUZyb21Vcmwoc3JjKTtcbiAgICAgIGNvbnN0IHJlbW90ZVVybCA9IGF3YWl0IHRoaXMudXBsb2FkUmVtb3RlSW1hZ2VVcmwoc3JjLCB1cGxvYWRDYWNoZSk7XG4gICAgICByZXR1cm4gdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGFsdCk7XG4gICAgfVxuXG4gICAgaWYgKHRhZyA9PT0gXCJiclwiKSB7XG4gICAgICByZXR1cm4gXCJcXG5cIjtcbiAgICB9XG5cbiAgICBpZiAodGFnID09PSBcInVsXCIgfHwgdGFnID09PSBcIm9sXCIpIHtcbiAgICAgIGNvbnN0IGl0ZW1zOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgbGV0IGluZGV4ID0gMTtcbiAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgQXJyYXkuZnJvbShub2RlLmNoaWxkcmVuKSkge1xuICAgICAgICBpZiAoY2hpbGQudGFnTmFtZS50b0xvd2VyQ2FzZSgpICE9PSBcImxpXCIpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJlbmRlcmVkID0gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbE5vZGUoY2hpbGQsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoICsgMSkpLnRyaW0oKTtcbiAgICAgICAgaWYgKCFyZW5kZXJlZCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcHJlZml4ID0gdGFnID09PSBcIm9sXCIgPyBgJHtpbmRleH0uIGAgOiBcIi0gXCI7XG4gICAgICAgIGl0ZW1zLnB1c2goYCR7XCIgIFwiLnJlcGVhdChNYXRoLm1heCgwLCBsaXN0RGVwdGgpKX0ke3ByZWZpeH0ke3JlbmRlcmVkfWApO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gaXRlbXMuam9pbihcIlxcblwiKTtcbiAgICB9XG5cbiAgICBpZiAodGFnID09PSBcImxpXCIpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpO1xuICAgICAgcmV0dXJuIHBhcnRzLmpvaW4oXCJcIikudHJpbSgpO1xuICAgIH1cblxuICAgIGlmICgvXmhbMS02XSQvLnRlc3QodGFnKSkge1xuICAgICAgY29uc3QgbGV2ZWwgPSBOdW1iZXIucGFyc2VJbnQodGFnWzFdLCAxMCk7XG4gICAgICBjb25zdCB0ZXh0ID0gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKSkuam9pbihcIlwiKS50cmltKCk7XG4gICAgICByZXR1cm4gdGV4dCA/IGAke1wiI1wiLnJlcGVhdChsZXZlbCl9ICR7dGV4dH1gIDogXCJcIjtcbiAgICB9XG5cbiAgICBpZiAodGFnID09PSBcImFcIikge1xuICAgICAgY29uc3QgaHJlZiA9IG5vZGUuZ2V0QXR0cmlidXRlKFwiaHJlZlwiKT8udHJpbSgpID8/IFwiXCI7XG4gICAgICBjb25zdCB0ZXh0ID0gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKSkuam9pbihcIlwiKS50cmltKCk7XG4gICAgICBpZiAoaHJlZiAmJiAvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KGhyZWYpICYmIHRleHQpIHtcbiAgICAgICAgcmV0dXJuIGBbJHt0ZXh0fV0oJHtocmVmfSlgO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRleHQ7XG4gICAgfVxuXG4gICAgY29uc3QgaW5saW5lVGFncyA9IG5ldyBTZXQoW1wic3Ryb25nXCIsIFwiYlwiLCBcImVtXCIsIFwiaVwiLCBcInNwYW5cIiwgXCJjb2RlXCIsIFwic21hbGxcIiwgXCJzdXBcIiwgXCJzdWJcIl0pO1xuICAgIGlmIChpbmxpbmVUYWdzLmhhcyh0YWcpKSB7XG4gICAgICByZXR1cm4gKGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKSkuam9pbihcIlwiKTtcbiAgICB9XG5cbiAgICBjb25zdCBibG9ja1RhZ3MgPSBuZXcgU2V0KFtcbiAgICAgIFwicFwiLFxuICAgICAgXCJkaXZcIixcbiAgICAgIFwiYXJ0aWNsZVwiLFxuICAgICAgXCJzZWN0aW9uXCIsXG4gICAgICBcImZpZ3VyZVwiLFxuICAgICAgXCJmaWdjYXB0aW9uXCIsXG4gICAgICBcImJsb2NrcXVvdGVcIixcbiAgICAgIFwicHJlXCIsXG4gICAgICBcInRhYmxlXCIsXG4gICAgICBcInRoZWFkXCIsXG4gICAgICBcInRib2R5XCIsXG4gICAgICBcInRyXCIsXG4gICAgICBcInRkXCIsXG4gICAgICBcInRoXCIsXG4gICAgXSk7XG4gICAgaWYgKGJsb2NrVGFncy5oYXModGFnKSkge1xuICAgICAgY29uc3QgdGV4dCA9IChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIikudHJpbSgpO1xuICAgICAgcmV0dXJuIHRleHQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihcbiAgICBlbGVtZW50OiBIVE1MRWxlbWVudCxcbiAgICBub3RlRmlsZTogVEZpbGUsXG4gICAgdXBsb2FkQ2FjaGU6IE1hcDxzdHJpbmcsIHN0cmluZz4sXG4gICAgbGlzdERlcHRoOiBudW1iZXIsXG4gICkge1xuICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgQXJyYXkuZnJvbShlbGVtZW50LmNoaWxkTm9kZXMpKSB7XG4gICAgICBjb25zdCByZW5kZXJlZCA9IGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbE5vZGUoY2hpbGQsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKTtcbiAgICAgIGlmICghcmVuZGVyZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAwICYmICFyZW5kZXJlZC5zdGFydHNXaXRoKFwiXFxuXCIpICYmICFwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXS5lbmRzV2l0aChcIlxcblwiKSkge1xuICAgICAgICBjb25zdCBwcmV2aW91cyA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdO1xuICAgICAgICBjb25zdCBuZWVkc1NwYWNlID0gL1xcUyQvLnRlc3QocHJldmlvdXMpICYmIC9eXFxTLy50ZXN0KHJlbmRlcmVkKTtcbiAgICAgICAgaWYgKG5lZWRzU3BhY2UpIHtcbiAgICAgICAgICBwYXJ0cy5wdXNoKFwiIFwiKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBwYXJ0cy5wdXNoKHJlbmRlcmVkKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcGFydHM7XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUNsaXBib2FyZFRleHQodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9cXHMrL2csIFwiIFwiKTtcbiAgfVxuXG4gIHByaXZhdGUgZXh0cmFjdEltYWdlRmlsZUZyb21Ecm9wKGV2dDogRHJhZ0V2ZW50KSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20oZXZ0LmRhdGFUcmFuc2Zlcj8uZmlsZXMgPz8gW10pLmZpbmQoKGZpbGUpID0+IGZpbGUudHlwZS5zdGFydHNXaXRoKFwiaW1hZ2UvXCIpKSA/PyBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBlbnF1ZXVlRWRpdG9ySW1hZ2VVcGxvYWQobm90ZUZpbGU6IFRGaWxlLCBlZGl0b3I6IEVkaXRvciwgaW1hZ2VGaWxlOiBGaWxlLCBmaWxlTmFtZTogc3RyaW5nKSB7XG5cbiAgICBhd2FpdCB0aGlzLnVwbG9hZFF1ZXVlLmVucXVldWVFZGl0b3JJbWFnZVVwbG9hZChub3RlRmlsZSwgZWRpdG9yLCBpbWFnZUZpbGUsIGZpbGVOYW1lKTtcbiAgfVxuXG4gIGFzeW5jIHN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50KHNob3dOb3RpY2UgPSB0cnVlKSB7XG4gICAgaWYgKHRoaXMuc3luY0luUHJvZ3Jlc3MpIHtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1NDBDXHU2QjY1XHU2QjYzXHU1NzI4XHU4RkRCXHU4ODRDXHU0RTJEXHUzMDAyXCIsIFwiQSBzeW5jIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MuXCIpLCA0MDAwKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnN5bmNJblByb2dyZXNzID0gdHJ1ZTtcbiAgICB0cnkge1xuICAgICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG4gICAgICBhd2FpdCB0aGlzLndhaXRGb3JQZW5kaW5nVmF1bHRNdXRhdGlvbnMoKTtcbiAgICAgIGNvbnN0IHVwbG9hZHNSZWFkeSA9IGF3YWl0IHRoaXMucHJlcGFyZVBlbmRpbmdVcGxvYWRzRm9yU3luYyhzaG93Tm90aWNlKTtcbiAgICAgIGlmICghdXBsb2Fkc1JlYWR5KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHRoaXMucmVidWlsZFJlZmVyZW5jZUluZGV4KCk7XG5cbiAgICAgIGNvbnN0IHJlbW90ZUludmVudG9yeSA9IGF3YWl0IHRoaXMubGlzdFJlbW90ZVRyZWUodGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpO1xuICAgICAgY29uc3QgZGVsZXRpb25Ub21ic3RvbmVzID0gYXdhaXQgdGhpcy5yZWFkRGVsZXRpb25Ub21ic3RvbmVzKCk7XG4gICAgICBjb25zdCByZW1vdGVGaWxlcyA9IHJlbW90ZUludmVudG9yeS5maWxlcztcbiAgICAgIGNvbnN0IGNvdW50cyA9IHtcbiAgICAgICAgdXBsb2FkZWQ6IDAsIHJlc3RvcmVkRnJvbVJlbW90ZTogMCwgZG93bmxvYWRlZE9yVXBkYXRlZDogMCwgc2tpcHBlZDogMCxcbiAgICAgICAgZGVsZXRlZFJlbW90ZUZpbGVzOiAwLCBkZWxldGVkTG9jYWxGaWxlczogMCwgZGVsZXRlZExvY2FsU3R1YnM6IDAsXG4gICAgICAgIG1pc3NpbmdSZW1vdGVCYWNrZWROb3RlczogMCwgcHVyZ2VkTWlzc2luZ0xhenlOb3RlczogMCxcbiAgICAgICAgZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzOiAwLCBjcmVhdGVkUmVtb3RlRGlyZWN0b3JpZXM6IDAsXG4gICAgICAgIGRlbGV0ZWRMb2NhbERpcmVjdG9yaWVzOiAwLCBjcmVhdGVkTG9jYWxEaXJlY3RvcmllczogMCxcbiAgICAgICAgZXZpY3RlZE5vdGVzOiAwLFxuICAgICAgfTtcblxuICAgICAgYXdhaXQgdGhpcy5yZWNvbmNpbGVPcnBoYW5lZFN5bmNFbnRyaWVzKHJlbW90ZUZpbGVzLCBkZWxldGlvblRvbWJzdG9uZXMsIGNvdW50cyk7XG4gICAgICBhd2FpdCB0aGlzLnJlY29uY2lsZVJlbW90ZU9ubHlGaWxlcyhyZW1vdGVGaWxlcywgZGVsZXRpb25Ub21ic3RvbmVzLCBjb3VudHMpO1xuICAgICAgYXdhaXQgdGhpcy5yZWNvbmNpbGVMb2NhbEZpbGVzKHJlbW90ZUZpbGVzLCBkZWxldGlvblRvbWJzdG9uZXMsIGNvdW50cyk7XG5cbiAgICAgIGNvbnN0IGRpclN0YXRzID0gYXdhaXQgdGhpcy5yZWNvbmNpbGVEaXJlY3RvcmllcyhyZW1vdGVJbnZlbnRvcnkuZGlyZWN0b3JpZXMpO1xuICAgICAgY291bnRzLmRlbGV0ZWRSZW1vdGVEaXJlY3RvcmllcyA9IGRpclN0YXRzLmRlbGV0ZWRSZW1vdGU7XG4gICAgICBjb3VudHMuY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzID0gZGlyU3RhdHMuY3JlYXRlZFJlbW90ZTtcbiAgICAgIGNvdW50cy5kZWxldGVkTG9jYWxEaXJlY3RvcmllcyA9IGRpclN0YXRzLmRlbGV0ZWRMb2NhbDtcbiAgICAgIGNvdW50cy5jcmVhdGVkTG9jYWxEaXJlY3RvcmllcyA9IGRpclN0YXRzLmNyZWF0ZWRMb2NhbDtcbiAgICAgIGF3YWl0IHRoaXMucmVjb25jaWxlUmVtb3RlSW1hZ2VzKCk7XG4gICAgICBjb3VudHMuZXZpY3RlZE5vdGVzID0gYXdhaXQgdGhpcy5ldmljdFN0YWxlU3luY2VkTm90ZXMoZmFsc2UpO1xuICAgICAgdGhpcy5wZW5kaW5nVmF1bHRTeW5jUGF0aHMuY2xlYXIoKTtcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0RGVsZXRpb25QYXRocy5jbGVhcigpO1xuXG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLnQoXG4gICAgICAgIGBcdTVERjJcdTUzQ0NcdTU0MTFcdTU0MENcdTZCNjVcdUZGMUFcdTRFMEFcdTRGMjAgJHtjb3VudHMudXBsb2FkZWR9IFx1NEUyQVx1NjU4N1x1NEVGNlx1RkYwQ1x1NEVDRVx1OEZEQ1x1N0FFRlx1NjJDOVx1NTNENiAke2NvdW50cy5yZXN0b3JlZEZyb21SZW1vdGUgKyBjb3VudHMuZG93bmxvYWRlZE9yVXBkYXRlZH0gXHU0RTJBXHU2NTg3XHU0RUY2XHVGRjBDXHU4REYzXHU4RkM3ICR7Y291bnRzLnNraXBwZWR9IFx1NEUyQVx1NjcyQVx1NTNEOFx1NTMxNlx1NjU4N1x1NEVGNlx1RkYwQ1x1NTIyMFx1OTY2NFx1OEZEQ1x1N0FFRlx1NTE4NVx1NUJCOSAke2NvdW50cy5kZWxldGVkUmVtb3RlRmlsZXN9IFx1NEUyQVx1MzAwMVx1NjcyQ1x1NTczMFx1NTE4NVx1NUJCOSAke2NvdW50cy5kZWxldGVkTG9jYWxGaWxlc30gXHU0RTJBJHtjb3VudHMuZGVsZXRlZExvY2FsU3R1YnMgPiAwID8gYFx1RkYwOFx1NTE3Nlx1NEUyRFx1NTkzMVx1NjU0OFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMCAke2NvdW50cy5kZWxldGVkTG9jYWxTdHVic30gXHU3QkM3XHVGRjA5YCA6IFwiXCJ9XHVGRjBDJHtjb3VudHMuZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzID4gMCB8fCBjb3VudHMuY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzID4gMCA/IGBcdTUyMjBcdTk2NjRcdThGRENcdTdBRUZcdTc2RUVcdTVGNTUgJHtjb3VudHMuZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzfSBcdTRFMkFcdTMwMDFcdTUyMUJcdTVFRkFcdThGRENcdTdBRUZcdTc2RUVcdTVGNTUgJHtjb3VudHMuY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzfSBcdTRFMkFcdTMwMDFgIDogXCJcIn0ke2NvdW50cy5kZWxldGVkTG9jYWxEaXJlY3RvcmllcyA+IDAgfHwgY291bnRzLmNyZWF0ZWRMb2NhbERpcmVjdG9yaWVzID4gMCA/IGBcdTUyMjBcdTk2NjRcdTY3MkNcdTU3MzBcdTc2RUVcdTVGNTUgJHtjb3VudHMuZGVsZXRlZExvY2FsRGlyZWN0b3JpZXN9IFx1NEUyQVx1MzAwMVx1NTIxQlx1NUVGQVx1NjcyQ1x1NTczMFx1NzZFRVx1NUY1NSAke2NvdW50cy5jcmVhdGVkTG9jYWxEaXJlY3Rvcmllc30gXHU0RTJBXHUzMDAxYCA6IFwiXCJ9JHtjb3VudHMuZXZpY3RlZE5vdGVzID4gMCA/IGBcdTU2REVcdTY1MzZcdTY3MkNcdTU3MzBcdTY1RTdcdTdCMTRcdThCQjAgJHtjb3VudHMuZXZpY3RlZE5vdGVzfSBcdTdCQzdcdTMwMDFgIDogXCJcIn0ke2NvdW50cy5taXNzaW5nUmVtb3RlQmFja2VkTm90ZXMgPiAwID8gYFx1NTNEMVx1NzNCMCAke2NvdW50cy5taXNzaW5nUmVtb3RlQmFja2VkTm90ZXN9IFx1N0JDN1x1NjMwOVx1OTcwMFx1N0IxNFx1OEJCMFx1N0YzQVx1NUMxMVx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1MzAwMWAgOiBcIlwifSR7Y291bnRzLnB1cmdlZE1pc3NpbmdMYXp5Tm90ZXMgPiAwID8gYFx1Nzg2RVx1OEJBNFx1NkUwNVx1NzQwNlx1NTkzMVx1NjU0OFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMCAke2NvdW50cy5wdXJnZWRNaXNzaW5nTGF6eU5vdGVzfSBcdTdCQzdcdTMwMDFgIDogXCJcIn1cdTMwMDJgLnJlcGxhY2UoL1x1MzAwMVx1MzAwMi8sIFwiXHUzMDAyXCIpLFxuICAgICAgICBgQmlkaXJlY3Rpb25hbCBzeW5jIHVwbG9hZGVkICR7Y291bnRzLnVwbG9hZGVkfSBmaWxlKHMpLCBwdWxsZWQgJHtjb3VudHMucmVzdG9yZWRGcm9tUmVtb3RlICsgY291bnRzLmRvd25sb2FkZWRPclVwZGF0ZWR9IGZpbGUocykgZnJvbSByZW1vdGUsIHNraXBwZWQgJHtjb3VudHMuc2tpcHBlZH0gdW5jaGFuZ2VkIGZpbGUocyksIGRlbGV0ZWQgJHtjb3VudHMuZGVsZXRlZFJlbW90ZUZpbGVzfSByZW1vdGUgY29udGVudCBmaWxlKHMpIGFuZCAke2NvdW50cy5kZWxldGVkTG9jYWxGaWxlc30gbG9jYWwgZmlsZShzKSR7Y291bnRzLmRlbGV0ZWRMb2NhbFN0dWJzID4gMCA/IGAgKGluY2x1ZGluZyAke2NvdW50cy5kZWxldGVkTG9jYWxTdHVic30gc3RhbGUgc3R1YiBub3RlKHMpKWAgOiBcIlwifSR7Y291bnRzLmRlbGV0ZWRSZW1vdGVEaXJlY3RvcmllcyA+IDAgPyBgLCBkZWxldGVkICR7Y291bnRzLmRlbGV0ZWRSZW1vdGVEaXJlY3Rvcmllc30gcmVtb3RlIGRpcmVjdG9yJHtjb3VudHMuZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzID09PSAxID8gXCJ5XCIgOiBcImllc1wifWAgOiBcIlwifSR7Y291bnRzLmNyZWF0ZWRSZW1vdGVEaXJlY3RvcmllcyA+IDAgPyBgLCBjcmVhdGVkICR7Y291bnRzLmNyZWF0ZWRSZW1vdGVEaXJlY3Rvcmllc30gcmVtb3RlIGRpcmVjdG9yJHtjb3VudHMuY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzID09PSAxID8gXCJ5XCIgOiBcImllc1wifWAgOiBcIlwifSR7Y291bnRzLmRlbGV0ZWRMb2NhbERpcmVjdG9yaWVzID4gMCA/IGAsIGRlbGV0ZWQgJHtjb3VudHMuZGVsZXRlZExvY2FsRGlyZWN0b3JpZXN9IGxvY2FsIGVtcHR5IGRpcmVjdG9yJHtjb3VudHMuZGVsZXRlZExvY2FsRGlyZWN0b3JpZXMgPT09IDEgPyBcInlcIiA6IFwiaWVzXCJ9YCA6IFwiXCJ9JHtjb3VudHMuY3JlYXRlZExvY2FsRGlyZWN0b3JpZXMgPiAwID8gYCwgY3JlYXRlZCAke2NvdW50cy5jcmVhdGVkTG9jYWxEaXJlY3Rvcmllc30gbG9jYWwgZGlyZWN0b3Ike2NvdW50cy5jcmVhdGVkTG9jYWxEaXJlY3RvcmllcyA9PT0gMSA/IFwieVwiIDogXCJpZXNcIn1gIDogXCJcIn0ke2NvdW50cy5ldmljdGVkTm90ZXMgPiAwID8gYCwgYW5kIGV2aWN0ZWQgJHtjb3VudHMuZXZpY3RlZE5vdGVzfSBzdGFsZSBsb2NhbCBub3RlKHMpYCA6IFwiXCJ9JHtjb3VudHMubWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzID4gMCA/IGAsIHdoaWxlIGRldGVjdGluZyAke2NvdW50cy5taXNzaW5nUmVtb3RlQmFja2VkTm90ZXN9IGxhenkgbm90ZShzKSBtaXNzaW5nIHRoZWlyIHJlbW90ZSBjb250ZW50YCA6IFwiXCJ9JHtjb3VudHMucHVyZ2VkTWlzc2luZ0xhenlOb3RlcyA+IDAgPyBgLCBhbmQgcHVyZ2VkICR7Y291bnRzLnB1cmdlZE1pc3NpbmdMYXp5Tm90ZXN9IGNvbmZpcm1lZCBicm9rZW4gbGF6eSBwbGFjZWhvbGRlcihzKWAgOiBcIlwifS5gLFxuICAgICAgKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cywgODAwMCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJWYXVsdCBjb250ZW50IHN5bmMgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gRGF0ZS5ub3coKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9IHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTUxODVcdTVCQjlcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIiwgXCJDb250ZW50IHN5bmMgZmFpbGVkXCIpLCBlcnJvcik7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsIDgwMDApO1xuICAgICAgfVxuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLnN5bmNJblByb2dyZXNzID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc3luY1BlbmRpbmdWYXVsdENvbnRlbnQoc2hvd05vdGljZSA9IHRydWUpIHtcbiAgICBpZiAodGhpcy5zeW5jSW5Qcm9ncmVzcykge1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdTU0MENcdTZCNjVcdTZCNjNcdTU3MjhcdThGREJcdTg4NENcdTRFMkRcdTMwMDJcIiwgXCJBIHN5bmMgaXMgYWxyZWFkeSBpbiBwcm9ncmVzcy5cIiksIDQwMDApO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuc3luY0luUHJvZ3Jlc3MgPSB0cnVlO1xuICAgIGNvbnN0IGNvdW50cyA9IHsgdXBsb2FkZWQ6IDAsIGRlbGV0ZWRSZW1vdGVGaWxlczogMCwgc2tpcHBlZDogMCB9O1xuICAgIHRyeSB7XG4gICAgICB0aGlzLmVuc3VyZUNvbmZpZ3VyZWQoKTtcbiAgICAgIGF3YWl0IHRoaXMud2FpdEZvclBlbmRpbmdWYXVsdE11dGF0aW9ucygpO1xuICAgICAgY29uc3QgdXBsb2Fkc1JlYWR5ID0gYXdhaXQgdGhpcy5wcmVwYXJlUGVuZGluZ1VwbG9hZHNGb3JTeW5jKHNob3dOb3RpY2UpO1xuICAgICAgaWYgKCF1cGxvYWRzUmVhZHkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLnByb2Nlc3NQZW5kaW5nVmF1bHREZWxldGlvbnMoY291bnRzKTtcbiAgICAgIGF3YWl0IHRoaXMucHJvY2Vzc1BlbmRpbmdWYXVsdFVwbG9hZHMoY291bnRzKTtcblxuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy50KFxuICAgICAgICBgXHU1REYyXHU1RkVCXHU5MDFGXHU1NDBDXHU2QjY1XHVGRjFBXHU0RTBBXHU0RjIwICR7Y291bnRzLnVwbG9hZGVkfSBcdTRFMkFcdTY1ODdcdTRFRjZcdUZGMENcdTUyMjBcdTk2NjRcdThGRENcdTdBRUZcdTUxODVcdTVCQjkgJHtjb3VudHMuZGVsZXRlZFJlbW90ZUZpbGVzfSBcdTRFMkFcdUZGMENcdThERjNcdThGQzcgJHtjb3VudHMuc2tpcHBlZH0gXHU0RTJBXHU2NTg3XHU0RUY2XHUzMDAyYCxcbiAgICAgICAgYEZhc3Qgc3luYyB1cGxvYWRlZCAke2NvdW50cy51cGxvYWRlZH0gZmlsZShzKSwgZGVsZXRlZCAke2NvdW50cy5kZWxldGVkUmVtb3RlRmlsZXN9IHJlbW90ZSBjb250ZW50IGZpbGUocyksIGFuZCBza2lwcGVkICR7Y291bnRzLnNraXBwZWR9IGZpbGUocykuYCxcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsIDYwMDApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFzdCB2YXVsdCBjb250ZW50IHN5bmMgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gRGF0ZS5ub3coKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9IHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTVGRUJcdTkwMUZcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIiwgXCJGYXN0IHN5bmMgZmFpbGVkXCIpLCBlcnJvcik7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsIDgwMDApO1xuICAgICAgfVxuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLnN5bmNJblByb2dyZXNzID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzUGVuZGluZ1ZhdWx0RGVsZXRpb25zKGNvdW50czogeyBkZWxldGVkUmVtb3RlRmlsZXM6IG51bWJlcjsgc2tpcHBlZDogbnVtYmVyIH0pIHtcbiAgICBmb3IgKGNvbnN0IFtwYXRoLCBlbnRyeV0gb2YgWy4uLnRoaXMucGVuZGluZ1ZhdWx0RGVsZXRpb25QYXRocy5lbnRyaWVzKCldLnNvcnQoKGEsIGIpID0+IGFbMF0ubG9jYWxlQ29tcGFyZShiWzBdKSkpIHtcbiAgICAgIGlmICh0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgocGF0aCkpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nVmF1bHREZWxldGlvblBhdGhzLmRlbGV0ZShwYXRoKTtcbiAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMud3JpdGVEZWxldGlvblRvbWJzdG9uZShwYXRoLCBlbnRyeS5yZW1vdGVTaWduYXR1cmUpO1xuICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShlbnRyeS5yZW1vdGVQYXRoKTtcbiAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShwYXRoKTtcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0RGVsZXRpb25QYXRocy5kZWxldGUocGF0aCk7XG4gICAgICBjb3VudHMuZGVsZXRlZFJlbW90ZUZpbGVzICs9IDE7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzUGVuZGluZ1ZhdWx0VXBsb2Fkcyhjb3VudHM6IHsgdXBsb2FkZWQ6IG51bWJlcjsgc2tpcHBlZDogbnVtYmVyIH0pIHtcbiAgICBmb3IgKGNvbnN0IHBhdGggb2YgWy4uLnRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzXS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpKSB7XG4gICAgICBpZiAodGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKHBhdGgpKSB7XG4gICAgICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzLmRlbGV0ZShwYXRoKTtcbiAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChwYXRoKTtcbiAgICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHtcbiAgICAgICAgdGhpcy5tYXJrUGVuZGluZ1ZhdWx0RGVsZXRpb24ocGF0aCk7XG4gICAgICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzLmRlbGV0ZShwYXRoKTtcbiAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG1hcmtkb3duQ29udGVudCA9IGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIgPyBhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSkgOiB1bmRlZmluZWQ7XG4gICAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIiAmJiB0aGlzLnBhcnNlTm90ZVN0dWIobWFya2Rvd25Db250ZW50ID8/IFwiXCIpKSB7XG4gICAgICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzLmRlbGV0ZShwYXRoKTtcbiAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aChmaWxlLnBhdGgpO1xuICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCwgbWFya2Rvd25Db250ZW50KTtcbiAgICAgIGNvbnN0IGxvY2FsU2lnbmF0dXJlID0gYXdhaXQgdGhpcy5idWlsZEN1cnJlbnRMb2NhbFNpZ25hdHVyZShmaWxlLCBtYXJrZG93bkNvbnRlbnQpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiB1cGxvYWRlZFJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzLmRlbGV0ZShwYXRoKTtcbiAgICAgIGNvdW50cy51cGxvYWRlZCArPSAxO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVjb25jaWxlT3JwaGFuZWRTeW5jRW50cmllcyhcbiAgICByZW1vdGVGaWxlczogTWFwPHN0cmluZywgUmVtb3RlRmlsZVN0YXRlPixcbiAgICBkZWxldGlvblRvbWJzdG9uZXM6IE1hcDxzdHJpbmcsIERlbGV0aW9uVG9tYnN0b25lPixcbiAgICBjb3VudHM6IHsgdXBsb2FkZWQ6IG51bWJlcjsgcmVzdG9yZWRGcm9tUmVtb3RlOiBudW1iZXI7IGRvd25sb2FkZWRPclVwZGF0ZWQ6IG51bWJlcjsgc2tpcHBlZDogbnVtYmVyOyBkZWxldGVkUmVtb3RlRmlsZXM6IG51bWJlcjsgZGVsZXRlZExvY2FsRmlsZXM6IG51bWJlcjsgZGVsZXRlZExvY2FsU3R1YnM6IG51bWJlcjsgbWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzOiBudW1iZXI7IHB1cmdlZE1pc3NpbmdMYXp5Tm90ZXM6IG51bWJlciB9LFxuICApIHtcbiAgICBjb25zdCBmaWxlcyA9IHRoaXMuc3luY1N1cHBvcnQuY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCk7XG4gICAgY29uc3QgY3VycmVudFBhdGhzID0gbmV3IFNldChmaWxlcy5tYXAoKGZpbGUpID0+IGZpbGUucGF0aCkpO1xuICAgIGZvciAoY29uc3QgcGF0aCBvZiBbLi4udGhpcy5zeW5jSW5kZXgua2V5cygpXSkge1xuICAgICAgaWYgKGN1cnJlbnRQYXRocy5oYXMocGF0aCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgocGF0aCkpIHtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKHBhdGgpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcHJldmlvdXMgPSB0aGlzLnN5bmNJbmRleC5nZXQocGF0aCk7XG4gICAgICBpZiAoIXByZXZpb3VzKSB7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShwYXRoKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlbW90ZSA9IHJlbW90ZUZpbGVzLmdldChwcmV2aW91cy5yZW1vdGVQYXRoKTtcbiAgICAgIGlmICghcmVtb3RlKSB7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShwYXRoKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRvbWJzdG9uZSA9IGRlbGV0aW9uVG9tYnN0b25lcy5nZXQocGF0aCk7XG4gICAgICBpZiAodG9tYnN0b25lICYmIHRoaXMuc3luY1N1cHBvcnQuaXNUb21ic3RvbmVBdXRob3JpdGF0aXZlKHRvbWJzdG9uZSwgcmVtb3RlKSkge1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgcmVtb3RlRmlsZXMuZGVsZXRlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKHBhdGgpO1xuICAgICAgICBjb3VudHMuZGVsZXRlZFJlbW90ZUZpbGVzICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUocGF0aCk7XG4gICAgICAgIGRlbGV0aW9uVG9tYnN0b25lcy5kZWxldGUocGF0aCk7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMuZG93bmxvYWRSZW1vdGVGaWxlVG9WYXVsdChwYXRoLCByZW1vdGUpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KHBhdGgsIHtcbiAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlUGF0aDogcmVtb3RlLnJlbW90ZVBhdGgsXG4gICAgICB9KTtcbiAgICAgIGNvdW50cy5yZXN0b3JlZEZyb21SZW1vdGUgKz0gMTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlY29uY2lsZVJlbW90ZU9ubHlGaWxlcyhcbiAgICByZW1vdGVGaWxlczogTWFwPHN0cmluZywgUmVtb3RlRmlsZVN0YXRlPixcbiAgICBkZWxldGlvblRvbWJzdG9uZXM6IE1hcDxzdHJpbmcsIERlbGV0aW9uVG9tYnN0b25lPixcbiAgICBjb3VudHM6IHsgdXBsb2FkZWQ6IG51bWJlcjsgcmVzdG9yZWRGcm9tUmVtb3RlOiBudW1iZXI7IGRvd25sb2FkZWRPclVwZGF0ZWQ6IG51bWJlcjsgc2tpcHBlZDogbnVtYmVyOyBkZWxldGVkUmVtb3RlRmlsZXM6IG51bWJlcjsgZGVsZXRlZExvY2FsRmlsZXM6IG51bWJlcjsgZGVsZXRlZExvY2FsU3R1YnM6IG51bWJlcjsgbWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzOiBudW1iZXI7IHB1cmdlZE1pc3NpbmdMYXp5Tm90ZXM6IG51bWJlciB9LFxuICApIHtcbiAgICBjb25zdCBmaWxlcyA9IHRoaXMuc3luY1N1cHBvcnQuY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCk7XG4gICAgY29uc3QgY3VycmVudFBhdGhzID0gbmV3IFNldChmaWxlcy5tYXAoKGZpbGUpID0+IGZpbGUucGF0aCkpO1xuICAgIGZvciAoY29uc3QgcmVtb3RlIG9mIFsuLi5yZW1vdGVGaWxlcy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5yZW1vdGVQYXRoLmxvY2FsZUNvbXBhcmUoYi5yZW1vdGVQYXRoKSkpIHtcbiAgICAgIGNvbnN0IHZhdWx0UGF0aCA9IHRoaXMuc3luY1N1cHBvcnQucmVtb3RlUGF0aFRvVmF1bHRQYXRoKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgIGlmICghdmF1bHRQYXRoIHx8IGN1cnJlbnRQYXRocy5oYXModmF1bHRQYXRoKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuc3luY1N1cHBvcnQuc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aCh2YXVsdFBhdGgpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB0b21ic3RvbmUgPSBkZWxldGlvblRvbWJzdG9uZXMuZ2V0KHZhdWx0UGF0aCk7XG4gICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgIGlmICh0aGlzLnN5bmNTdXBwb3J0LmlzVG9tYnN0b25lQXV0aG9yaXRhdGl2ZSh0b21ic3RvbmUsIHJlbW90ZSkpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICByZW1vdGVGaWxlcy5kZWxldGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICAgIGNvdW50cy5kZWxldGVkUmVtb3RlRmlsZXMgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUodmF1bHRQYXRoKTtcbiAgICAgICAgZGVsZXRpb25Ub21ic3RvbmVzLmRlbGV0ZSh2YXVsdFBhdGgpO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQodmF1bHRQYXRoLCByZW1vdGUpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KHZhdWx0UGF0aCwge1xuICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICByZW1vdGVQYXRoOiByZW1vdGUucmVtb3RlUGF0aCxcbiAgICAgIH0pO1xuICAgICAgY291bnRzLnJlc3RvcmVkRnJvbVJlbW90ZSArPSAxO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVjb25jaWxlTG9jYWxGaWxlcyhcbiAgICByZW1vdGVGaWxlczogTWFwPHN0cmluZywgUmVtb3RlRmlsZVN0YXRlPixcbiAgICBkZWxldGlvblRvbWJzdG9uZXM6IE1hcDxzdHJpbmcsIERlbGV0aW9uVG9tYnN0b25lPixcbiAgICBjb3VudHM6IHsgdXBsb2FkZWQ6IG51bWJlcjsgcmVzdG9yZWRGcm9tUmVtb3RlOiBudW1iZXI7IGRvd25sb2FkZWRPclVwZGF0ZWQ6IG51bWJlcjsgc2tpcHBlZDogbnVtYmVyOyBkZWxldGVkUmVtb3RlRmlsZXM6IG51bWJlcjsgZGVsZXRlZExvY2FsRmlsZXM6IG51bWJlcjsgZGVsZXRlZExvY2FsU3R1YnM6IG51bWJlcjsgbWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzOiBudW1iZXI7IHB1cmdlZE1pc3NpbmdMYXp5Tm90ZXM6IG51bWJlciB9LFxuICApOiBQcm9taXNlPFNldDxzdHJpbmc+PiB7XG4gICAgY29uc3QgZmlsZXMgPSB0aGlzLnN5bmNTdXBwb3J0LmNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpO1xuICAgIGNvbnN0IGxvY2FsUmVtb3RlUGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgICBsb2NhbFJlbW90ZVBhdGhzLmFkZChyZW1vdGVQYXRoKTtcbiAgICAgIGNvbnN0IHJlbW90ZSA9IHJlbW90ZUZpbGVzLmdldChyZW1vdGVQYXRoKTtcbiAgICAgIGNvbnN0IHJlbW90ZVNpZ25hdHVyZSA9IHJlbW90ZT8uc2lnbmF0dXJlID8/IFwiXCI7XG4gICAgICBjb25zdCBwcmV2aW91cyA9IHRoaXMuc3luY0luZGV4LmdldChmaWxlLnBhdGgpO1xuICAgICAgY29uc3QgbWFya2Rvd25Db250ZW50ID0gZmlsZS5leHRlbnNpb24gPT09IFwibWRcIiA/IGF3YWl0IHRoaXMucmVhZE1hcmtkb3duQ29udGVudFByZWZlckVkaXRvcihmaWxlKSA6IG51bGw7XG4gICAgICBjb25zdCBsb2NhbFNpZ25hdHVyZSA9IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUoZmlsZSwgbWFya2Rvd25Db250ZW50ID8/IHVuZGVmaW5lZCk7XG5cbiAgICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICAgIGNvbnN0IHN0dWIgPSB0aGlzLnBhcnNlTm90ZVN0dWIobWFya2Rvd25Db250ZW50ID8/IFwiXCIpO1xuICAgICAgICBpZiAoc3R1Yikge1xuICAgICAgICAgIGNvbnN0IHN0dWJSZW1vdGUgPSByZW1vdGVGaWxlcy5nZXQoc3R1Yi5yZW1vdGVQYXRoKTtcbiAgICAgICAgICBjb25zdCB0b21ic3RvbmUgPSBkZWxldGlvblRvbWJzdG9uZXMuZ2V0KGZpbGUucGF0aCk7XG4gICAgICAgICAgY29uc3QgcmVzb2x1dGlvbiA9IGF3YWl0IHRoaXMucmVzb2x2ZUxhenlOb3RlU3R1YihmaWxlLCBzdHViLCBzdHViUmVtb3RlLCB0b21ic3RvbmUpO1xuICAgICAgICAgIGlmIChyZXNvbHV0aW9uLmFjdGlvbiA9PT0gXCJkZWxldGVkXCIpIHtcbiAgICAgICAgICAgIGNvdW50cy5kZWxldGVkTG9jYWxGaWxlcyArPSAxO1xuICAgICAgICAgICAgY291bnRzLmRlbGV0ZWRMb2NhbFN0dWJzICs9IDE7XG4gICAgICAgICAgICBpZiAocmVzb2x1dGlvbi5wdXJnZWRNaXNzaW5nKSB7XG4gICAgICAgICAgICAgIGNvdW50cy5wdXJnZWRNaXNzaW5nTGF6eU5vdGVzICs9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHJlc29sdXRpb24uYWN0aW9uID09PSBcIm1pc3NpbmdcIikge1xuICAgICAgICAgICAgY291bnRzLm1pc3NpbmdSZW1vdGVCYWNrZWROb3RlcyArPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogc3R1YlJlbW90ZT8uc2lnbmF0dXJlID8/IHByZXZpb3VzPy5yZW1vdGVTaWduYXR1cmUgPz8gXCJcIixcbiAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCB0b21ic3RvbmUgPSBkZWxldGlvblRvbWJzdG9uZXMuZ2V0KGZpbGUucGF0aCk7XG4gICAgICBjb25zdCB1bmNoYW5nZWRTaW5jZUxhc3RTeW5jID0gcHJldmlvdXMgPyBwcmV2aW91cy5sb2NhbFNpZ25hdHVyZSA9PT0gbG9jYWxTaWduYXR1cmUgOiBmYWxzZTtcbiAgICAgIGlmICh0b21ic3RvbmUpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHVuY2hhbmdlZFNpbmNlTGFzdFN5bmMgJiZcbiAgICAgICAgICB0aGlzLnN5bmNTdXBwb3J0LnNob3VsZERlbGV0ZUxvY2FsRnJvbVRvbWJzdG9uZShmaWxlLCB0b21ic3RvbmUpICYmXG4gICAgICAgICAgdGhpcy5zeW5jU3VwcG9ydC5pc1RvbWJzdG9uZUF1dGhvcml0YXRpdmUodG9tYnN0b25lLCByZW1vdGUpXG4gICAgICAgICkge1xuICAgICAgICAgIGF3YWl0IHRoaXMucmVtb3ZlTG9jYWxWYXVsdEZpbGUoZmlsZSk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICAgICAgY291bnRzLmRlbGV0ZWRMb2NhbEZpbGVzICs9IDE7XG4gICAgICAgICAgaWYgKHJlbW90ZSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgICAgICByZW1vdGVGaWxlcy5kZWxldGUocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgICAgICAgY291bnRzLmRlbGV0ZWRSZW1vdGVGaWxlcyArPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgZGVsZXRpb25Ub21ic3RvbmVzLmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoLCBtYXJrZG93bkNvbnRlbnQgPz8gdW5kZWZpbmVkKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICByZW1vdGVGaWxlcy5zZXQocmVtb3RlUGF0aCwgdXBsb2FkZWRSZW1vdGUpO1xuICAgICAgICBjb3VudHMudXBsb2FkZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghcHJldmlvdXMpIHtcbiAgICAgICAgaWYgKGxvY2FsU2lnbmF0dXJlID09PSByZW1vdGVTaWduYXR1cmUpIHtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7IGxvY2FsU2lnbmF0dXJlLCByZW1vdGVTaWduYXR1cmUsIHJlbW90ZVBhdGggfSk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgICAgIGNvdW50cy5za2lwcGVkICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5zeW5jU3VwcG9ydC5zaG91bGREb3dubG9hZFJlbW90ZVZlcnNpb24oZmlsZS5zdGF0Lm10aW1lLCByZW1vdGUubGFzdE1vZGlmaWVkKSkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuZG93bmxvYWRSZW1vdGVGaWxlVG9WYXVsdChmaWxlLnBhdGgsIHJlbW90ZSwgZmlsZSk7XG4gICAgICAgICAgY29uc3QgcmVmcmVzaGVkID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICBsb2NhbFNpZ25hdHVyZTogcmVmcmVzaGVkID8gYXdhaXQgdGhpcy5idWlsZEN1cnJlbnRMb2NhbFNpZ25hdHVyZShyZWZyZXNoZWQpIDogcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBjb3VudHMuZG93bmxvYWRlZE9yVXBkYXRlZCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCwgbWFya2Rvd25Db250ZW50ID8/IHVuZGVmaW5lZCk7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICB9KTtcbiAgICAgICAgcmVtb3RlRmlsZXMuc2V0KHJlbW90ZVBhdGgsIHVwbG9hZGVkUmVtb3RlKTtcbiAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgICBjb3VudHMudXBsb2FkZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGxvY2FsQ2hhbmdlZCA9IHByZXZpb3VzLmxvY2FsU2lnbmF0dXJlICE9PSBsb2NhbFNpZ25hdHVyZSB8fCBwcmV2aW91cy5yZW1vdGVQYXRoICE9PSByZW1vdGVQYXRoO1xuICAgICAgY29uc3QgcmVtb3RlQ2hhbmdlZCA9IHByZXZpb3VzLnJlbW90ZVNpZ25hdHVyZSAhPT0gcmVtb3RlU2lnbmF0dXJlIHx8IHByZXZpb3VzLnJlbW90ZVBhdGggIT09IHJlbW90ZVBhdGg7XG4gICAgICBpZiAoIWxvY2FsQ2hhbmdlZCAmJiAhcmVtb3RlQ2hhbmdlZCkge1xuICAgICAgICBjb3VudHMuc2tpcHBlZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFsb2NhbENoYW5nZWQgJiYgcmVtb3RlQ2hhbmdlZCkge1xuICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgICAgICBjb25zdCByZWZyZXNoZWQgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChmaWxlLnBhdGgpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUocmVmcmVzaGVkKSA6IHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvdW50cy5kb3dubG9hZGVkT3JVcGRhdGVkICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAobG9jYWxDaGFuZ2VkICYmICFyZW1vdGVDaGFuZ2VkKSB7XG4gICAgICAgIGNvbnN0IHVwbG9hZGVkUmVtb3RlID0gYXdhaXQgdGhpcy51cGxvYWRDb250ZW50RmlsZVRvUmVtb3RlKGZpbGUsIHJlbW90ZVBhdGgsIG1hcmtkb3duQ29udGVudCA/PyB1bmRlZmluZWQpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiB1cGxvYWRlZFJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlbW90ZUZpbGVzLnNldChyZW1vdGVQYXRoLCB1cGxvYWRlZFJlbW90ZSk7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgY291bnRzLnVwbG9hZGVkICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5zeW5jU3VwcG9ydC5zaG91bGREb3dubG9hZFJlbW90ZVZlcnNpb24oZmlsZS5zdGF0Lm10aW1lLCByZW1vdGUubGFzdE1vZGlmaWVkKSkge1xuICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgICAgICBjb25zdCByZWZyZXNoZWQgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChmaWxlLnBhdGgpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUocmVmcmVzaGVkKSA6IHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvdW50cy5kb3dubG9hZGVkT3JVcGRhdGVkICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoLCBtYXJrZG93bkNvbnRlbnQgPz8gdW5kZWZpbmVkKTtcbiAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgfSk7XG4gICAgICByZW1vdGVGaWxlcy5zZXQocmVtb3RlUGF0aCwgdXBsb2FkZWRSZW1vdGUpO1xuICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgY291bnRzLnVwbG9hZGVkICs9IDE7XG4gICAgfVxuXG4gICAgcmV0dXJuIGxvY2FsUmVtb3RlUGF0aHM7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSA0MDQgJiYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYERFTEVURSBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZGVsZXRlIHJlbW90ZSBzeW5jZWQgY29udGVudFwiLCByZW1vdGVQYXRoLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHdyaXRlRGVsZXRpb25Ub21ic3RvbmUodmF1bHRQYXRoOiBzdHJpbmcsIHJlbW90ZVNpZ25hdHVyZT86IHN0cmluZykge1xuICAgIGNvbnN0IHBheWxvYWQ6IERlbGV0aW9uVG9tYnN0b25lID0ge1xuICAgICAgcGF0aDogdmF1bHRQYXRoLFxuICAgICAgZGVsZXRlZEF0OiBEYXRlLm5vdygpLFxuICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgIH07XG4gICAgYXdhaXQgdGhpcy51cGxvYWRCaW5hcnkoXG4gICAgICB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkRGVsZXRpb25SZW1vdGVQYXRoKHZhdWx0UGF0aCksXG4gICAgICB0aGlzLmVuY29kZVV0ZjgoSlNPTi5zdHJpbmdpZnkocGF5bG9hZCkpLFxuICAgICAgXCJhcHBsaWNhdGlvbi9qc29uOyBjaGFyc2V0PXV0Zi04XCIsXG4gICAgKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUodmF1bHRQYXRoOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZSh0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkRGVsZXRpb25SZW1vdGVQYXRoKHZhdWx0UGF0aCkpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gVG9tYnN0b25lIGNsZWFudXAgc2hvdWxkIG5vdCBicmVhayB0aGUgbWFpbiBzeW5jIGZsb3cuXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWFkRGVsZXRpb25Ub21ic3RvbmUodmF1bHRQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwodGhpcy5zeW5jU3VwcG9ydC5idWlsZERlbGV0aW9uUmVtb3RlUGF0aCh2YXVsdFBhdGgpKSxcbiAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MDQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICB0aGlzLmFzc2VydFJlc3BvbnNlU3VjY2VzcyhyZXNwb25zZSwgXCJHRVQgdG9tYnN0b25lXCIpO1xuXG4gICAgcmV0dXJuIHRoaXMuc3luY1N1cHBvcnQucGFyc2VEZWxldGlvblRvbWJzdG9uZVBheWxvYWQodGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlYWREZWxldGlvblRvbWJzdG9uZXMoKSB7XG4gICAgY29uc3QgdG9tYnN0b25lcyA9IG5ldyBNYXA8c3RyaW5nLCBEZWxldGlvblRvbWJzdG9uZT4oKTtcbiAgICBjb25zdCBpbnZlbnRvcnkgPSBhd2FpdCB0aGlzLmxpc3RSZW1vdGVUcmVlKHRoaXMuc3luY1N1cHBvcnQuYnVpbGREZWxldGlvbkZvbGRlcigpKTtcbiAgICBmb3IgKGNvbnN0IHJlbW90ZSBvZiBpbnZlbnRvcnkuZmlsZXMudmFsdWVzKCkpIHtcbiAgICAgIGNvbnN0IHZhdWx0UGF0aCA9IHRoaXMuc3luY1N1cHBvcnQucmVtb3RlRGVsZXRpb25QYXRoVG9WYXVsdFBhdGgocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgaWYgKCF2YXVsdFBhdGgpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZS5yZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB0b21ic3RvbmUgPSB0aGlzLnN5bmNTdXBwb3J0LnBhcnNlRGVsZXRpb25Ub21ic3RvbmVQYXlsb2FkKHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlcikpO1xuICAgICAgaWYgKHRvbWJzdG9uZSkge1xuICAgICAgICB0b21ic3RvbmVzLnNldCh2YXVsdFBhdGgsIHRvbWJzdG9uZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRvbWJzdG9uZXM7XG4gIH1cblxuICBwcml2YXRlIGdldFZhdWx0RmlsZUJ5UGF0aChwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHBhdGgpO1xuICAgIHJldHVybiBmaWxlIGluc3RhbmNlb2YgVEZpbGUgPyBmaWxlIDogbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVtb3ZlTG9jYWxWYXVsdEZpbGUoZmlsZTogVEZpbGUpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuZGVsZXRlKGZpbGUsIHRydWUpO1xuICAgIH0gY2F0Y2ggKGRlbGV0ZUVycm9yKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC50cmFzaChmaWxlLCB0cnVlKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICB0aHJvdyBkZWxldGVFcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGVuc3VyZUxvY2FsUGFyZW50Rm9sZGVycyhwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGF0aChwYXRoKTtcbiAgICBjb25zdCBzZWdtZW50cyA9IG5vcm1hbGl6ZWQuc3BsaXQoXCIvXCIpLmZpbHRlcigodmFsdWUpID0+IHZhbHVlLmxlbmd0aCA+IDApO1xuICAgIGlmIChzZWdtZW50cy5sZW5ndGggPD0gMSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBjdXJyZW50ID0gXCJcIjtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgc2VnbWVudHMubGVuZ3RoIC0gMTsgaW5kZXggKz0gMSkge1xuICAgICAgY3VycmVudCA9IGN1cnJlbnQgPyBgJHtjdXJyZW50fS8ke3NlZ21lbnRzW2luZGV4XX1gIDogc2VnbWVudHNbaW5kZXhdO1xuICAgICAgaWYgKCEoYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5leGlzdHMoY3VycmVudCkpKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5ta2RpcihjdXJyZW50KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGNvbnN0IG1zZyA9IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKTtcbiAgICAgICAgICBpZiAoIW1zZy5pbmNsdWRlcyhcImFscmVhZHkgZXhpc3RzXCIpKSB7XG4gICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZG93bmxvYWRSZW1vdGVGaWxlVG9WYXVsdCh2YXVsdFBhdGg6IHN0cmluZywgcmVtb3RlOiBSZW1vdGVGaWxlU3RhdGUsIGV4aXN0aW5nRmlsZT86IFRGaWxlKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZS5yZW1vdGVQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgdGhpcy5hc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2UsIFwiR0VUXCIpO1xuXG4gICAgYXdhaXQgdGhpcy5lbnN1cmVMb2NhbFBhcmVudEZvbGRlcnModmF1bHRQYXRoKTtcbiAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgbXRpbWU6IHJlbW90ZS5sYXN0TW9kaWZpZWQgPiAwID8gcmVtb3RlLmxhc3RNb2RpZmllZCA6IERhdGUubm93KCksXG4gICAgfTtcbiAgICBjb25zdCBpc01kID0gdmF1bHRQYXRoLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoXCIubWRcIik7XG4gICAgY29uc3QgY3VycmVudCA9XG4gICAgICBleGlzdGluZ0ZpbGUgPz8gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgodmF1bHRQYXRoKSA/PyB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgodmF1bHRQYXRoKTtcbiAgICBpZiAoY3VycmVudCAmJiBjdXJyZW50IGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgIGlmIChjdXJyZW50LmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShjdXJyZW50LCB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpLCBvcHRpb25zKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeUJpbmFyeShjdXJyZW50LCByZXNwb25zZS5hcnJheUJ1ZmZlciwgb3B0aW9ucyk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBpZiAoaXNNZCkge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGUodmF1bHRQYXRoLCB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpLCBvcHRpb25zKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZUJpbmFyeSh2YXVsdFBhdGgsIHJlc3BvbnNlLmFycmF5QnVmZmVyLCBvcHRpb25zKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zdCBtc2cgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSk7XG4gICAgICBpZiAobXNnLmluY2x1ZGVzKFwiYWxyZWFkeSBleGlzdHNcIikpIHtcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aCh2YXVsdFBhdGgpO1xuICAgICAgICBpZiAoZmlsZSAmJiBmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgICAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlciksIG9wdGlvbnMpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnlCaW5hcnkoZmlsZSwgcmVzcG9uc2UuYXJyYXlCdWZmZXIsIG9wdGlvbnMpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB2ZXJpZnlSZW1vdGVCaW5hcnlSb3VuZFRyaXAocmVtb3RlUGF0aDogc3RyaW5nLCBleHBlY3RlZDogQXJyYXlCdWZmZXIpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuYXJyYXlCdWZmZXJzRXF1YWwoZXhwZWN0ZWQsIHJlc3BvbnNlLmFycmF5QnVmZmVyKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc3RhdFJlbW90ZUZpbGUocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIlBST1BGSU5EXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIERlcHRoOiBcIjBcIixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MDQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICB0aGlzLmFzc2VydFJlc3BvbnNlU3VjY2VzcyhyZXNwb25zZSwgYFBST1BGSU5EIGZvciAke3JlbW90ZVBhdGh9YCk7XG5cbiAgICBjb25zdCB4bWxUZXh0ID0gdGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKTtcbiAgICBjb25zdCBlbnRyaWVzID0gdGhpcy5wYXJzZVByb3BmaW5kRGlyZWN0b3J5TGlzdGluZyh4bWxUZXh0LCByZW1vdGVQYXRoLCB0cnVlKTtcbiAgICByZXR1cm4gZW50cmllcy5maW5kKChlbnRyeSkgPT4gIWVudHJ5LmlzQ29sbGVjdGlvbik/LmZpbGUgPz8gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlOiBURmlsZSwgcmVtb3RlUGF0aDogc3RyaW5nLCBtYXJrZG93bkNvbnRlbnQ/OiBzdHJpbmcpIHtcbiAgICBsZXQgYmluYXJ5OiBBcnJheUJ1ZmZlcjtcblxuICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICBjb25zdCBjb250ZW50ID0gbWFya2Rvd25Db250ZW50ID8/IChhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSkpO1xuICAgICAgaWYgKHRoaXMucGFyc2VOb3RlU3R1Yihjb250ZW50KSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgXCJcdTYyRDJcdTdFRERcdTYyOEFcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTUzNjBcdTRGNERcdTdCMTRcdThCQjBcdTRFMEFcdTRGMjBcdTRFM0FcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTMwMDJcIixcbiAgICAgICAgICAgIFwiUmVmdXNpbmcgdG8gdXBsb2FkIGEgbGF6eS1ub3RlIHBsYWNlaG9sZGVyIGFzIHJlbW90ZSBub3RlIGNvbnRlbnQuXCIsXG4gICAgICAgICAgKSxcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgYmluYXJ5ID0gdGhpcy5lbmNvZGVVdGY4KGNvbnRlbnQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBiaW5hcnkgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KHJlbW90ZVBhdGgsIGJpbmFyeSwgdGhpcy5nZXRNaW1lVHlwZShmaWxlLmV4dGVuc2lvbikpO1xuICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuc3RhdFJlbW90ZUZpbGUocmVtb3RlUGF0aCk7XG4gICAgaWYgKHJlbW90ZSkge1xuICAgICAgcmV0dXJuIHJlbW90ZTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIGxhc3RNb2RpZmllZDogZmlsZS5zdGF0Lm10aW1lLFxuICAgICAgc2l6ZTogZmlsZS5zdGF0LnNpemUsXG4gICAgICBzaWduYXR1cmU6IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRTeW5jU2lnbmF0dXJlKGZpbGUpLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZVJlbW90ZVN5bmNlZEVudHJ5KHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLnN5bmNJbmRleC5nZXQodmF1bHRQYXRoKTtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gZXhpc3Rpbmc/LnJlbW90ZVBhdGggPz8gdGhpcy5zeW5jU3VwcG9ydC5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgodmF1bHRQYXRoKTtcbiAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZVBhdGgpO1xuICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZSh2YXVsdFBhdGgpO1xuICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUZpbGVPcGVuKGZpbGU6IFRGaWxlIHwgbnVsbCkge1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkgfHwgZmlsZS5leHRlbnNpb24gIT09IFwibWRcIikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMuc2V0KGZpbGUucGF0aCwgRGF0ZS5ub3coKSk7XG4gICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcblxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IHN0dWIgPSB0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCk7XG4gICAgaWYgKCFzdHViKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuc3RhdFJlbW90ZUZpbGUoc3R1Yi5yZW1vdGVQYXRoKTtcbiAgICAgIGNvbnN0IHRvbWJzdG9uZSA9ICFyZW1vdGUgPyBhd2FpdCB0aGlzLnJlYWREZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpIDogdW5kZWZpbmVkO1xuICAgICAgY29uc3QgcmVzb2x1dGlvbiA9IGF3YWl0IHRoaXMucmVzb2x2ZUxhenlOb3RlU3R1YihmaWxlLCBzdHViLCByZW1vdGUsIHRvbWJzdG9uZSk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuXG4gICAgICBpZiAocmVzb2x1dGlvbi5hY3Rpb24gPT09IFwiZGVsZXRlZFwiKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgcmVzb2x1dGlvbi5wdXJnZWRNaXNzaW5nXG4gICAgICAgICAgICAgID8gYFx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1OEZERVx1N0VFRFx1N0YzQVx1NTkzMVx1RkYwQ1x1NURGMlx1NzlGQlx1OTY2NFx1NjcyQ1x1NTczMFx1NTkzMVx1NjU0OFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gXG4gICAgICAgICAgICAgIDogYFx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1NEUwRFx1NUI1OFx1NTcyOFx1RkYwQ1x1NURGMlx1NzlGQlx1OTY2NFx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgICAgICAgcmVzb2x1dGlvbi5wdXJnZWRNaXNzaW5nXG4gICAgICAgICAgICAgID8gYFJlbW90ZSBub3RlIHdhcyBtaXNzaW5nIHJlcGVhdGVkbHksIHJlbW92ZWQgbG9jYWwgYnJva2VuIHBsYWNlaG9sZGVyOiAke2ZpbGUuYmFzZW5hbWV9YFxuICAgICAgICAgICAgICA6IGBSZW1vdGUgbm90ZSBtaXNzaW5nLCByZW1vdmVkIGxvY2FsIHBsYWNlaG9sZGVyOiAke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICAgICApLFxuICAgICAgICAgIHJlc29sdXRpb24ucHVyZ2VkTWlzc2luZyA/IDgwMDAgOiA2MDAwLFxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXNvbHV0aW9uLmFjdGlvbiA9PT0gXCJtaXNzaW5nXCIpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTRFMERcdTVCNThcdTU3MjhcdUZGMENcdTVGNTNcdTUyNERcdTUxNDhcdTRGRERcdTc1NTlcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTdCMTRcdThCQjBcdTRFRTVcdTk2MzJcdTRFMzRcdTY1RjZcdTVGMDJcdTVFMzhcdUZGMUJcdTgyRTVcdTUxOERcdTZCMjFcdTc4NkVcdThCQTRcdTdGM0FcdTU5MzFcdUZGMENcdTVDMDZcdTgxRUFcdTUyQThcdTZFMDVcdTc0MDZcdThCRTVcdTUzNjBcdTRGNERcdTMwMDJcIiwgXCJSZW1vdGUgbm90ZSBpcyBtaXNzaW5nLiBUaGUgbG9jYWwgcGxhY2Vob2xkZXIgd2FzIGtlcHQgZm9yIG5vdyBpbiBjYXNlIHRoaXMgaXMgdHJhbnNpZW50OyBpdCB3aWxsIGJlIGNsZWFuZWQgYXV0b21hdGljYWxseSBpZiB0aGUgcmVtb3RlIGlzIHN0aWxsIG1pc3Npbmcgb24gdGhlIG5leHQgY29uZmlybWF0aW9uLlwiKSwgODAwMCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbmV3IE5vdGljZSh0aGlzLnQoYFx1NURGMlx1NEVDRVx1OEZEQ1x1N0FFRlx1NjA2Mlx1NTkwRFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gLCBgUmVzdG9yZWQgbm90ZSBmcm9tIHJlbW90ZTogJHtmaWxlLmJhc2VuYW1lfWApLCA2MDAwKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBoeWRyYXRlIG5vdGUgZnJvbSByZW1vdGVcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU4RkRDXHU3QUVGXHU2MDYyXHU1OTBEXHU3QjE0XHU4QkIwXHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIHJlc3RvcmUgbm90ZSBmcm9tIHJlbW90ZVwiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGdldE9wZW5NYXJrZG93bkNvbnRlbnQobm90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IGxlYXZlcyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoXCJtYXJrZG93blwiKTtcbiAgICBmb3IgKGNvbnN0IGxlYWYgb2YgbGVhdmVzKSB7XG4gICAgICBjb25zdCB2aWV3ID0gbGVhZi52aWV3O1xuICAgICAgaWYgKCEodmlldyBpbnN0YW5jZW9mIE1hcmtkb3duVmlldykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghdmlldy5maWxlIHx8IHZpZXcuZmlsZS5wYXRoICE9PSBub3RlUGF0aCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHZpZXcuZWRpdG9yLmdldFZhbHVlKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZTogVEZpbGUpIHtcbiAgICBjb25zdCBsaXZlQ29udGVudCA9IHRoaXMuZ2V0T3Blbk1hcmtkb3duQ29udGVudChmaWxlLnBhdGgpO1xuICAgIGlmIChsaXZlQ29udGVudCAhPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGxpdmVDb250ZW50O1xuICAgIH1cblxuICAgIHJldHVybiBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBidWlsZEN1cnJlbnRMb2NhbFNpZ25hdHVyZShmaWxlOiBURmlsZSwgbWFya2Rvd25Db250ZW50Pzogc3RyaW5nKSB7XG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHtcbiAgICAgIHJldHVybiB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkU3luY1NpZ25hdHVyZShmaWxlKTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50ID0gbWFya2Rvd25Db250ZW50ID8/IChhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSkpO1xuICAgIGNvbnN0IGRpZ2VzdCA9IChhd2FpdCB0aGlzLmNvbXB1dGVTaGEyNTZIZXgodGhpcy5lbmNvZGVVdGY4KGNvbnRlbnQpKSkuc2xpY2UoMCwgMTYpO1xuICAgIHJldHVybiBgbWQ6JHtjb250ZW50Lmxlbmd0aH06JHtkaWdlc3R9YDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVjb25jaWxlUmVtb3RlSW1hZ2VzKCkge1xuICAgIHJldHVybiB7IGRlbGV0ZWRGaWxlczogMCwgZGVsZXRlZERpcmVjdG9yaWVzOiAwIH07XG4gIH1cblxuICBwcml2YXRlIG1hcmtNaXNzaW5nTGF6eVJlbW90ZShwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgIGNvbnN0IHByZXZpb3VzID0gdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzLmdldChwYXRoKTtcbiAgICBjb25zdCBuZXh0OiBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZCA9IHByZXZpb3VzXG4gICAgICA/IHtcbiAgICAgICAgICBmaXJzdERldGVjdGVkQXQ6IHByZXZpb3VzLmZpcnN0RGV0ZWN0ZWRBdCxcbiAgICAgICAgICBsYXN0RGV0ZWN0ZWRBdDogbm93LFxuICAgICAgICAgIG1pc3NDb3VudDogcHJldmlvdXMubWlzc0NvdW50ICsgMSxcbiAgICAgICAgfVxuICAgICAgOiB7XG4gICAgICAgICAgZmlyc3REZXRlY3RlZEF0OiBub3csXG4gICAgICAgICAgbGFzdERldGVjdGVkQXQ6IG5vdyxcbiAgICAgICAgICBtaXNzQ291bnQ6IDEsXG4gICAgICAgIH07XG4gICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzLnNldChwYXRoLCBuZXh0KTtcbiAgICByZXR1cm4gbmV4dDtcbiAgfVxuXG4gIHByaXZhdGUgY2xlYXJNaXNzaW5nTGF6eVJlbW90ZShwYXRoOiBzdHJpbmcpIHtcbiAgICB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMuZGVsZXRlKHBhdGgpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNoYXJlZCBsb2dpYyBmb3IgcmVzb2x2aW5nIGEgbGF6eS1ub3RlIHN0dWIgaW4gYm90aCBoYW5kbGVGaWxlT3BlbiBhbmRcbiAgICogc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQuICBDYWxsZXJzIHByb3ZpZGUgdGhlIGFscmVhZHktbG9va2VkLXVwIHJlbW90ZVxuICAgKiBzdGF0ZSAob3IgbnVsbCkgYW5kIGFuIG9wdGlvbmFsIHRvbWJzdG9uZS5cbiAgICovXG4gIHByaXZhdGUgYXN5bmMgcmVzb2x2ZUxhenlOb3RlU3R1YihcbiAgICBmaWxlOiBURmlsZSxcbiAgICBzdHViOiB7IHJlbW90ZVBhdGg6IHN0cmluZyB9LFxuICAgIHJlbW90ZTogUmVtb3RlRmlsZVN0YXRlIHwgbnVsbCB8IHVuZGVmaW5lZCxcbiAgICB0b21ic3RvbmU6IERlbGV0aW9uVG9tYnN0b25lIHwgdW5kZWZpbmVkLFxuICApOiBQcm9taXNlPHsgYWN0aW9uOiBcImRlbGV0ZWRcIiB8IFwicmVzdG9yZWRcIiB8IFwibWlzc2luZ1wiOyBwdXJnZWRNaXNzaW5nPzogYm9vbGVhbiB9PiB7XG4gICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgIGlmICh0b21ic3RvbmUpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5yZW1vdmVMb2NhbFZhdWx0RmlsZShmaWxlKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICAgIHRoaXMuY2xlYXJNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgICByZXR1cm4geyBhY3Rpb246IFwiZGVsZXRlZFwiLCBkZWxldGVkU3R1YjogdHJ1ZSB9O1xuICAgICAgfVxuXG4gICAgICBjb25zdCBtaXNzaW5nUmVjb3JkID0gdGhpcy5tYXJrTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICAgIGlmIChtaXNzaW5nUmVjb3JkLm1pc3NDb3VudCA+PSB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlQ29uZmlybWF0aW9ucykge1xuICAgICAgICBhd2FpdCB0aGlzLnJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGUpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgICAgdGhpcy5jbGVhck1pc3NpbmdMYXp5UmVtb3RlKGZpbGUucGF0aCk7XG4gICAgICAgIHJldHVybiB7IGFjdGlvbjogXCJkZWxldGVkXCIsIGRlbGV0ZWRTdHViOiB0cnVlLCBwdXJnZWRNaXNzaW5nOiB0cnVlIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7IGFjdGlvbjogXCJtaXNzaW5nXCIgfTtcbiAgICB9XG5cbiAgICB0aGlzLmNsZWFyTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgIGNvbnN0IHJlZnJlc2hlZCA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKGZpbGUucGF0aCk7XG4gICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRTeW5jU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgcmVtb3RlU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgcmVtb3RlUGF0aDogc3R1Yi5yZW1vdGVQYXRoLFxuICAgIH0pO1xuICAgIHJldHVybiB7IGFjdGlvbjogXCJyZXN0b3JlZFwiIH07XG4gIH1cblxuICBwcml2YXRlIHBhcnNlTm90ZVN0dWIoY29udGVudDogc3RyaW5nKSB7XG4gICAgY29uc3QgbWF0Y2ggPSBjb250ZW50Lm1hdGNoKFxuICAgICAgL148IS0tXFxzKnNlY3VyZS13ZWJkYXYtbm90ZS1zdHViXFxzKlxccj9cXG5yZW1vdGU6XFxzKiguKz8pXFxyP1xcbnBsYWNlaG9sZGVyOlxccyooLio/KVxccj9cXG4tLT4vcyxcbiAgICApO1xuICAgIGlmICghbWF0Y2gpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICByZW1vdGVQYXRoOiBtYXRjaFsxXS50cmltKCksXG4gICAgICBwbGFjZWhvbGRlcjogbWF0Y2hbMl0udHJpbSgpLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkTm90ZVN0dWIoZmlsZTogVEZpbGUpIHtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5zeW5jU3VwcG9ydC5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgoZmlsZS5wYXRoKTtcbiAgICByZXR1cm4gW1xuICAgICAgYDwhLS0gJHtTRUNVUkVfTk9URV9TVFVCfWAsXG4gICAgICBgcmVtb3RlOiAke3JlbW90ZVBhdGh9YCxcbiAgICAgIGBwbGFjZWhvbGRlcjogJHtmaWxlLmJhc2VuYW1lfWAsXG4gICAgICBcIi0tPlwiLFxuICAgICAgXCJcIixcbiAgICAgIHRoaXMudChcbiAgICAgICAgYFx1OEZEOVx1NjYyRlx1NEUwMFx1N0JDN1x1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFx1NzY4NFx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1NjU4N1x1NEVGNlx1MzAwMlx1NjI1M1x1NUYwMFx1OEZEOVx1N0JDN1x1N0IxNFx1OEJCMFx1NjVGNlx1RkYwQ1x1NjNEMlx1NEVGNlx1NEYxQVx1NEVDRVx1OEZEQ1x1N0FFRlx1NTQwQ1x1NkI2NVx1NzZFRVx1NUY1NVx1NjA2Mlx1NTkwRFx1NUI4Q1x1NjU3NFx1NTE4NVx1NUJCOVx1MzAwMmAsXG4gICAgICAgIGBUaGlzIGlzIGEgbG9jYWwgcGxhY2Vob2xkZXIgZm9yIGFuIG9uLWRlbWFuZCBub3RlLiBPcGVuaW5nIHRoZSBub3RlIHJlc3RvcmVzIHRoZSBmdWxsIGNvbnRlbnQgZnJvbSB0aGUgcmVtb3RlIHN5bmMgZm9sZGVyLmAsXG4gICAgICApLFxuICAgIF0uam9pbihcIlxcblwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZXZpY3RTdGFsZVN5bmNlZE5vdGVzKHNob3dOb3RpY2U6IGJvb2xlYW4pIHtcbiAgICB0cnkge1xuICAgICAgaWYgKHRoaXMuc2V0dGluZ3Mubm90ZVN0b3JhZ2VNb2RlICE9PSBcImxhenktbm90ZXNcIikge1xuICAgICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1RjUzXHU1MjREXHU2NzJBXHU1NDJGXHU3NTI4XHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXHU2QTIxXHU1RjBGXHUzMDAyXCIsIFwiTGF6eSBub3RlIG1vZGUgaXMgbm90IGVuYWJsZWQuXCIpLCA2MDAwKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZmlsZXMgPSB0aGlzLnN5bmNTdXBwb3J0LmNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpLmZpbHRlcigoZmlsZSkgPT4gZmlsZS5leHRlbnNpb24gPT09IFwibWRcIik7XG4gICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgICAgY29uc3QgdGhyZXNob2xkID0gTWF0aC5tYXgoMSwgdGhpcy5zZXR0aW5ncy5ub3RlRXZpY3RBZnRlckRheXMpICogMjQgKiA2MCAqIDYwICogMTAwMDtcbiAgICAgIGxldCBldmljdGVkID0gMDtcblxuICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICAgIGNvbnN0IGFjdGl2ZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgICAgIGlmIChhY3RpdmU/LnBhdGggPT09IGZpbGUucGF0aCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbGFzdEFjY2VzcyA9IHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMuZ2V0KGZpbGUucGF0aCkgPz8gMDtcbiAgICAgICAgaWYgKGxhc3RBY2Nlc3MgIT09IDAgJiYgbm93IC0gbGFzdEFjY2VzcyA8IHRocmVzaG9sZCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICAgIGlmICh0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCkpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGJpbmFyeSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWRCaW5hcnkoZmlsZSk7XG4gICAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aChmaWxlLnBhdGgpO1xuICAgICAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBiaW5hcnksIFwidGV4dC9tYXJrZG93bjsgY2hhcnNldD11dGYtOFwiKTtcbiAgICAgICAgY29uc3QgdmVyaWZpZWQgPSBhd2FpdCB0aGlzLnZlcmlmeVJlbW90ZUJpbmFyeVJvdW5kVHJpcChyZW1vdGVQYXRoLCBiaW5hcnkpO1xuICAgICAgICBpZiAoIXZlcmlmaWVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1NjgyMVx1OUE4Q1x1NTkzMVx1OEQyNVx1RkYwQ1x1NURGMlx1NTNENlx1NkQ4OFx1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1MzAwMlwiLCBcIlJlbW90ZSBub3RlIHZlcmlmaWNhdGlvbiBmYWlsZWQsIGxvY2FsIG5vdGUgZXZpY3Rpb24gd2FzIGNhbmNlbGxlZC5cIikpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuc3RhdFJlbW90ZUZpbGUocmVtb3RlUGF0aCk7XG4gICAgICAgIGlmICghcmVtb3RlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1NTE0M1x1NjU3MFx1NjM2RVx1N0YzQVx1NTkzMVx1RkYwQ1x1NURGMlx1NTNENlx1NkQ4OFx1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1MzAwMlwiLCBcIlJlbW90ZSBub3RlIG1ldGFkYXRhIGlzIG1pc3NpbmcsIGxvY2FsIG5vdGUgZXZpY3Rpb24gd2FzIGNhbmNlbGxlZC5cIikpO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB0aGlzLmJ1aWxkTm90ZVN0dWIoZmlsZSkpO1xuICAgICAgICBjb25zdCByZWZyZXNoZWQgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChmaWxlLnBhdGgpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRTeW5jU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkU3luY1NpZ25hdHVyZShmaWxlKSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHJlbW90ZT8uc2lnbmF0dXJlID8/IGAke2ZpbGUuc3RhdC5tdGltZX06JHtiaW5hcnkuYnl0ZUxlbmd0aH1gLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICBldmljdGVkICs9IDE7XG4gICAgICB9XG5cbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgYFx1NURGMlx1NTZERVx1NjUzNiAke2V2aWN0ZWR9IFx1N0JDN1x1OTU3Rlx1NjcxRlx1NjcyQVx1OEJCRlx1OTVFRVx1NzY4NFx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1MzAwMmAsXG4gICAgICAgICAgICBgRXZpY3RlZCAke2V2aWN0ZWR9IHN0YWxlIGxvY2FsIG5vdGUocykuYCxcbiAgICAgICAgICApLFxuICAgICAgICAgIDgwMDAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgcmV0dXJuIGV2aWN0ZWQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZXZpY3Qgc3RhbGUgc3luY2VkIG5vdGVzXCIsIGVycm9yKTtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1NTkzMVx1OEQyNVwiLCBcIkZhaWxlZCB0byBldmljdCBsb2NhbCBub3Rlc1wiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZW5zdXJlUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcGFydHMgPSByZW1vdGVQYXRoLnNwbGl0KFwiL1wiKS5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPiAwKTtcbiAgICBpZiAocGFydHMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgY3VycmVudCA9IFwiXCI7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHBhcnRzLmxlbmd0aCAtIDE7IGluZGV4ICs9IDEpIHtcbiAgICAgIGN1cnJlbnQgPSBjdXJyZW50ID8gYCR7Y3VycmVudH0vJHtwYXJ0c1tpbmRleF19YCA6IHBhcnRzW2luZGV4XTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKGN1cnJlbnQpLFxuICAgICAgICBtZXRob2Q6IFwiTUtDT0xcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgaWYgKCFbMjAwLCAyMDEsIDIwNCwgMjA3LCAzMDEsIDMwMiwgMzA3LCAzMDgsIDQwNV0uaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1LQ09MIGZhaWxlZCBmb3IgJHtjdXJyZW50fSB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGxpc3RSZW1vdGVUcmVlKHJvb3RGb2xkZXI6IHN0cmluZyk6IFByb21pc2U8UmVtb3RlSW52ZW50b3J5PiB7XG4gICAgY29uc3QgZmlsZXMgPSBuZXcgTWFwPHN0cmluZywgUmVtb3RlRmlsZVN0YXRlPigpO1xuICAgIGNvbnN0IGRpcmVjdG9yaWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgcGVuZGluZyA9IFtub3JtYWxpemVGb2xkZXIocm9vdEZvbGRlcildO1xuICAgIGNvbnN0IHZpc2l0ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuICAgIHdoaWxlIChwZW5kaW5nLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSBub3JtYWxpemVGb2xkZXIocGVuZGluZy5wb3AoKSA/PyByb290Rm9sZGVyKTtcbiAgICAgIGlmICh2aXNpdGVkLmhhcyhjdXJyZW50KSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgdmlzaXRlZC5hZGQoY3VycmVudCk7XG4gICAgICBjb25zdCBlbnRyaWVzID0gYXdhaXQgdGhpcy5saXN0UmVtb3RlRGlyZWN0b3J5KGN1cnJlbnQpO1xuICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG4gICAgICAgIGlmIChlbnRyeS5pc0NvbGxlY3Rpb24pIHtcbiAgICAgICAgICBkaXJlY3Rvcmllcy5hZGQoZW50cnkucmVtb3RlUGF0aCk7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKGVudHJ5LnJlbW90ZVBhdGgpO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGVudHJ5LmZpbGUpIHtcbiAgICAgICAgICBmaWxlcy5zZXQoZW50cnkucmVtb3RlUGF0aCwgZW50cnkuZmlsZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4geyBmaWxlcywgZGlyZWN0b3JpZXMgfTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgbGlzdFJlbW90ZURpcmVjdG9yeShyZW1vdGVEaXJlY3Rvcnk6IHN0cmluZykge1xuICAgIGNvbnN0IHJlcXVlc3RlZFBhdGggPSBub3JtYWxpemVGb2xkZXIocmVtb3RlRGlyZWN0b3J5KTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVxdWVzdGVkUGF0aCksXG4gICAgICBtZXRob2Q6IFwiUFJPUEZJTkRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgRGVwdGg6IFwiMVwiLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDQwNCkge1xuICAgICAgcmV0dXJuIFtdIGFzIEFycmF5PHsgcmVtb3RlUGF0aDogc3RyaW5nOyBpc0NvbGxlY3Rpb246IGJvb2xlYW47IGZpbGU/OiBSZW1vdGVGaWxlU3RhdGUgfT47XG4gICAgfVxuXG4gICAgdGhpcy5hc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2UsIGBQUk9QRklORCBmb3IgJHtyZXF1ZXN0ZWRQYXRofWApO1xuXG4gICAgY29uc3QgeG1sVGV4dCA9IHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlcik7XG4gICAgcmV0dXJuIHRoaXMucGFyc2VQcm9wZmluZERpcmVjdG9yeUxpc3RpbmcoeG1sVGV4dCwgcmVxdWVzdGVkUGF0aCk7XG4gIH1cblxuICBwcml2YXRlIHBhcnNlUHJvcGZpbmREaXJlY3RvcnlMaXN0aW5nKHhtbFRleHQ6IHN0cmluZywgcmVxdWVzdGVkUGF0aDogc3RyaW5nLCBpbmNsdWRlUmVxdWVzdGVkID0gZmFsc2UpIHtcbiAgICBjb25zdCBwYXJzZXIgPSBuZXcgRE9NUGFyc2VyKCk7XG4gICAgY29uc3QgZG9jdW1lbnQgPSBwYXJzZXIucGFyc2VGcm9tU3RyaW5nKHhtbFRleHQsIFwiYXBwbGljYXRpb24veG1sXCIpO1xuICAgIGlmIChkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcInBhcnNlcmVycm9yXCIpLmxlbmd0aCA+IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJcdTY1RTBcdTZDRDVcdTg5RTNcdTY3OTAgV2ViREFWIFx1NzZFRVx1NUY1NVx1NkUwNVx1NTM1NVx1MzAwMlwiLCBcIkZhaWxlZCB0byBwYXJzZSB0aGUgV2ViREFWIGRpcmVjdG9yeSBsaXN0aW5nLlwiKSk7XG4gICAgfVxuXG4gICAgY29uc3QgZW50cmllcyA9IG5ldyBNYXA8c3RyaW5nLCB7IHJlbW90ZVBhdGg6IHN0cmluZzsgaXNDb2xsZWN0aW9uOiBib29sZWFuOyBmaWxlPzogUmVtb3RlRmlsZVN0YXRlIH0+KCk7XG4gICAgZm9yIChjb25zdCBlbGVtZW50IG9mIEFycmF5LmZyb20oZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCIqXCIpKSkge1xuICAgICAgaWYgKGVsZW1lbnQubG9jYWxOYW1lICE9PSBcInJlc3BvbnNlXCIpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGhyZWYgPSB0aGlzLmdldFhtbExvY2FsTmFtZVRleHQoZWxlbWVudCwgXCJocmVmXCIpO1xuICAgICAgaWYgKCFocmVmKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5ocmVmVG9SZW1vdGVQYXRoKGhyZWYpO1xuICAgICAgaWYgKCFyZW1vdGVQYXRoKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBpc0NvbGxlY3Rpb24gPSB0aGlzLnhtbFRyZWVIYXNMb2NhbE5hbWUoZWxlbWVudCwgXCJjb2xsZWN0aW9uXCIpO1xuICAgICAgY29uc3Qgbm9ybWFsaXplZFBhdGggPSBpc0NvbGxlY3Rpb24gPyBub3JtYWxpemVGb2xkZXIocmVtb3RlUGF0aCkgOiByZW1vdGVQYXRoLnJlcGxhY2UoL1xcLyskLywgXCJcIik7XG4gICAgICBpZiAoXG4gICAgICAgICFpbmNsdWRlUmVxdWVzdGVkICYmXG4gICAgICAgIChcbiAgICAgICAgICBub3JtYWxpemVkUGF0aCA9PT0gcmVxdWVzdGVkUGF0aCB8fFxuICAgICAgICAgIG5vcm1hbGl6ZWRQYXRoID09PSByZXF1ZXN0ZWRQYXRoLnJlcGxhY2UoL1xcLyskLywgXCJcIilcbiAgICAgICAgKVxuICAgICAgKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzaXplVGV4dCA9IHRoaXMuZ2V0WG1sTG9jYWxOYW1lVGV4dChlbGVtZW50LCBcImdldGNvbnRlbnRsZW5ndGhcIik7XG4gICAgICBjb25zdCBwYXJzZWRTaXplID0gTnVtYmVyLnBhcnNlSW50KHNpemVUZXh0LCAxMCk7XG4gICAgICBjb25zdCBzaXplID0gTnVtYmVyLmlzRmluaXRlKHBhcnNlZFNpemUpID8gcGFyc2VkU2l6ZSA6IDA7XG4gICAgICBjb25zdCBtb2RpZmllZFRleHQgPSB0aGlzLmdldFhtbExvY2FsTmFtZVRleHQoZWxlbWVudCwgXCJnZXRsYXN0bW9kaWZpZWRcIik7XG4gICAgICBjb25zdCBwYXJzZWRNdGltZSA9IERhdGUucGFyc2UobW9kaWZpZWRUZXh0KTtcbiAgICAgIGNvbnN0IGxhc3RNb2RpZmllZCA9IE51bWJlci5pc0Zpbml0ZShwYXJzZWRNdGltZSkgPyBwYXJzZWRNdGltZSA6IDA7XG5cbiAgICAgIGVudHJpZXMuc2V0KG5vcm1hbGl6ZWRQYXRoLCB7XG4gICAgICAgIHJlbW90ZVBhdGg6IG5vcm1hbGl6ZWRQYXRoLFxuICAgICAgICBpc0NvbGxlY3Rpb24sXG4gICAgICAgIGZpbGU6IGlzQ29sbGVjdGlvblxuICAgICAgICAgID8gdW5kZWZpbmVkXG4gICAgICAgICAgOiB7XG4gICAgICAgICAgICAgIHJlbW90ZVBhdGg6IG5vcm1hbGl6ZWRQYXRoLFxuICAgICAgICAgICAgICBsYXN0TW9kaWZpZWQsXG4gICAgICAgICAgICAgIHNpemUsXG4gICAgICAgICAgICAgIHNpZ25hdHVyZTogdGhpcy5zeW5jU3VwcG9ydC5idWlsZFJlbW90ZVN5bmNTaWduYXR1cmUoe1xuICAgICAgICAgICAgICAgIGxhc3RNb2RpZmllZCxcbiAgICAgICAgICAgICAgICBzaXplLFxuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gWy4uLmVudHJpZXMudmFsdWVzKCldO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRYbWxMb2NhbE5hbWVUZXh0KHBhcmVudDogRWxlbWVudCwgbG9jYWxOYW1lOiBzdHJpbmcpIHtcbiAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgQXJyYXkuZnJvbShwYXJlbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCIqXCIpKSkge1xuICAgICAgaWYgKGVsZW1lbnQubG9jYWxOYW1lID09PSBsb2NhbE5hbWUpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQudGV4dENvbnRlbnQ/LnRyaW0oKSA/PyBcIlwiO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBcIlwiO1xuICB9XG5cbiAgcHJpdmF0ZSB4bWxUcmVlSGFzTG9jYWxOYW1lKHBhcmVudDogRWxlbWVudCwgbG9jYWxOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShwYXJlbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCIqXCIpKS5zb21lKChlbGVtZW50KSA9PiBlbGVtZW50LmxvY2FsTmFtZSA9PT0gbG9jYWxOYW1lKTtcbiAgfVxuXG4gIHByaXZhdGUgaHJlZlRvUmVtb3RlUGF0aChocmVmOiBzdHJpbmcpIHtcbiAgICBjb25zdCBiYXNlVXJsID0gYCR7dGhpcy5zZXR0aW5ncy53ZWJkYXZVcmwucmVwbGFjZSgvXFwvKyQvLCBcIlwiKX0vYDtcbiAgICBjb25zdCByZXNvbHZlZCA9IG5ldyBVUkwoaHJlZiwgYmFzZVVybCk7XG4gICAgY29uc3QgYmFzZVBhdGggPSBuZXcgVVJMKGJhc2VVcmwpLnBhdGhuYW1lLnJlcGxhY2UoL1xcLyskLywgXCIvXCIpO1xuICAgIGNvbnN0IGRlY29kZWRQYXRoID0gdGhpcy5kZWNvZGVQYXRobmFtZShyZXNvbHZlZC5wYXRobmFtZSk7XG4gICAgaWYgKCFkZWNvZGVkUGF0aC5zdGFydHNXaXRoKGJhc2VQYXRoKSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlY29kZWRQYXRoLnNsaWNlKGJhc2VQYXRoLmxlbmd0aCkucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgZGVjb2RlUGF0aG5hbWUocGF0aG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBwYXRobmFtZVxuICAgICAgLnNwbGl0KFwiL1wiKVxuICAgICAgLm1hcCgoc2VnbWVudCkgPT4ge1xuICAgICAgICBpZiAoIXNlZ21lbnQpIHtcbiAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudChzZWdtZW50KTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgcmV0dXJuIHNlZ21lbnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuam9pbihcIi9cIik7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkRXhwZWN0ZWRSZW1vdGVEaXJlY3RvcmllcyhyZW1vdGVGaWxlUGF0aHM6IFNldDxzdHJpbmc+LCByb290Rm9sZGVyOiBzdHJpbmcpIHtcbiAgICBjb25zdCBleHBlY3RlZCA9IG5ldyBTZXQ8c3RyaW5nPihbbm9ybWFsaXplRm9sZGVyKHJvb3RGb2xkZXIpXSk7XG4gICAgZm9yIChjb25zdCByZW1vdGVQYXRoIG9mIHJlbW90ZUZpbGVQYXRocykge1xuICAgICAgY29uc3QgcGFydHMgPSByZW1vdGVQYXRoLnNwbGl0KFwiL1wiKS5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPiAwKTtcbiAgICAgIGxldCBjdXJyZW50ID0gXCJcIjtcbiAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBwYXJ0cy5sZW5ndGggLSAxOyBpbmRleCArPSAxKSB7XG4gICAgICAgIGN1cnJlbnQgPSBjdXJyZW50ID8gYCR7Y3VycmVudH0vJHtwYXJ0c1tpbmRleF19YCA6IHBhcnRzW2luZGV4XTtcbiAgICAgICAgZXhwZWN0ZWQuYWRkKG5vcm1hbGl6ZUZvbGRlcihjdXJyZW50KSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGV4cGVjdGVkO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWNvbmNpbGVEaXJlY3RvcmllcyhyZW1vdGVEaXJlY3RvcmllczogU2V0PHN0cmluZz4pIHtcbiAgICBjb25zdCBzdGF0cyA9IHsgY3JlYXRlZExvY2FsOiAwLCBjcmVhdGVkUmVtb3RlOiAwLCBkZWxldGVkTG9jYWw6IDAsIGRlbGV0ZWRSZW1vdGU6IDAgfTtcblxuICAgIGNvbnN0IHJlbW90ZUxvY2FsUGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBmb3IgKGNvbnN0IHJlbW90ZURpciBvZiByZW1vdGVEaXJlY3Rvcmllcykge1xuICAgICAgY29uc3QgbG9jYWxQYXRoID0gdGhpcy5zeW5jU3VwcG9ydC5yZW1vdGVQYXRoVG9WYXVsdFBhdGgocmVtb3RlRGlyKTtcbiAgICAgIGlmIChsb2NhbFBhdGggIT09IG51bGwgJiYgbG9jYWxQYXRoLmxlbmd0aCA+IDAgJiYgIXRoaXMuc3luY1N1cHBvcnQuc2hvdWxkU2tpcERpcmVjdG9yeVN5bmNQYXRoKGxvY2FsUGF0aCkpIHtcbiAgICAgICAgcmVtb3RlTG9jYWxQYXRocy5hZGQobm9ybWFsaXplUGF0aChsb2NhbFBhdGgpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBsb2NhbERpclBhdGhzID0gdGhpcy5zeW5jU3VwcG9ydC5jb2xsZWN0TG9jYWxTeW5jZWREaXJlY3RvcmllcygpO1xuICAgIGNvbnN0IGtub3duRGlyUGF0aHMgPSB0aGlzLnN5bmNlZERpcmVjdG9yaWVzO1xuICAgIGNvbnN0IG5ld1N5bmNlZERpcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuICAgIGNvbnN0IGxvY2FsT25seSA9IFsuLi5sb2NhbERpclBhdGhzXS5maWx0ZXIoKHApID0+ICFyZW1vdGVMb2NhbFBhdGhzLmhhcyhwKSk7XG4gICAgY29uc3QgcmVtb3RlT25seSA9IFsuLi5yZW1vdGVMb2NhbFBhdGhzXS5maWx0ZXIoKHApID0+ICFsb2NhbERpclBhdGhzLmhhcyhwKSk7XG5cbiAgICAvLyBQcm9jZXNzIGxvY2FsLW9ubHkgZGlyZWN0b3JpZXMgKGRlZXBlc3QgZmlyc3QgZm9yIHNhZmUgZGVsZXRpb24pXG4gICAgZm9yIChjb25zdCBkaXJQYXRoIG9mIFsuLi5sb2NhbE9ubHldLnNvcnQoKGEsIGIpID0+IGIubGVuZ3RoIC0gYS5sZW5ndGgpKSB7XG4gICAgICBpZiAoa25vd25EaXJQYXRocy5oYXMoZGlyUGF0aCkpIHtcbiAgICAgICAgLy8gV2FzIHN5bmNlZCBiZWZvcmUgYnV0IGdvbmUgZnJvbSByZW1vdGUgXHUyMTkyIGFub3RoZXIgY2xpZW50IGRlbGV0ZWQgaXRcbiAgICAgICAgY29uc3QgZm9sZGVyID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGRpclBhdGgpO1xuICAgICAgICBpZiAoZm9sZGVyIGluc3RhbmNlb2YgVEZvbGRlciAmJiBmb2xkZXIuY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmRlbGV0ZShmb2xkZXIsIHRydWUpO1xuICAgICAgICAgICAgc3RhdHMuZGVsZXRlZExvY2FsICs9IDE7XG4gICAgICAgICAgfSBjYXRjaCB7IC8qIHNraXAgaWYgZGVsZXRpb24gZmFpbHMgKi8gfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE5vbi1lbXB0eSBsb2NhbCBkaXI6IGtlZXAgaXQsIGZpbGVzIHdpbGwgcmUtdXBsb2FkIG9uIG5leHQgc3luY1xuICAgICAgICAgIG5ld1N5bmNlZERpcnMuYWRkKGRpclBhdGgpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBOZXcgbG9jYWwgZGlyZWN0b3J5IG5vdCB5ZXQgb24gcmVtb3RlIFx1MjE5MiBjcmVhdGUgb24gcmVtb3RlXG4gICAgICAgIGNvbnN0IHJlbW90ZURpciA9IG5vcm1hbGl6ZUZvbGRlcih0aGlzLnNldHRpbmdzLnZhdWx0U3luY1JlbW90ZUZvbGRlcikgKyBkaXJQYXRoO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuZW5zdXJlUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlRGlyKTtcbiAgICAgICAgICBzdGF0cy5jcmVhdGVkUmVtb3RlICs9IDE7XG4gICAgICAgIH0gY2F0Y2ggeyAvKiBza2lwIGlmIGNyZWF0aW9uIGZhaWxzICovIH1cbiAgICAgICAgbmV3U3luY2VkRGlycy5hZGQoZGlyUGF0aCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQm90aCBzaWRlcyBleGlzdCBcdTIxOTIga2VlcFxuICAgIGZvciAoY29uc3QgZGlyUGF0aCBvZiBsb2NhbERpclBhdGhzKSB7XG4gICAgICBpZiAocmVtb3RlTG9jYWxQYXRocy5oYXMoZGlyUGF0aCkpIHtcbiAgICAgICAgbmV3U3luY2VkRGlycy5hZGQoZGlyUGF0aCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUHJvY2VzcyByZW1vdGUtb25seSBkaXJlY3RvcmllcyAoZGVlcGVzdCBmaXJzdCBmb3Igc2FmZSBkZWxldGlvbilcbiAgICBmb3IgKGNvbnN0IGRpclBhdGggb2YgWy4uLnJlbW90ZU9ubHldLnNvcnQoKGEsIGIpID0+IGIubGVuZ3RoIC0gYS5sZW5ndGgpKSB7XG4gICAgICBpZiAoa25vd25EaXJQYXRocy5oYXMoZGlyUGF0aCkpIHtcbiAgICAgICAgLy8gV2FzIHN5bmNlZCBiZWZvcmUgYnV0IGdvbmUgbG9jYWxseSBcdTIxOTIgdGhpcyBjbGllbnQgZGVsZXRlZCBpdFxuICAgICAgICBjb25zdCByZW1vdGVEaXIgPSBub3JtYWxpemVGb2xkZXIodGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpICsgZGlyUGF0aDtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVEaXIpLFxuICAgICAgICAgIG1ldGhvZDogXCJERUxFVEVcIixcbiAgICAgICAgICBoZWFkZXJzOiB7IEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCkgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChbMjAwLCAyMDIsIDIwNF0uaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzKSkge1xuICAgICAgICAgIHN0YXRzLmRlbGV0ZWRSZW1vdGUgKz0gMTtcbiAgICAgICAgfSBlbHNlIGlmICghWzQwNCwgNDA1LCA0MDldLmluY2x1ZGVzKHJlc3BvbnNlLnN0YXR1cykpIHtcbiAgICAgICAgICAvLyBVbmV4cGVjdGVkIGVycm9yIFx1MjE5MiBrZWVwIHRyYWNraW5nIHRvIHJldHJ5IG5leHQgc3luY1xuICAgICAgICAgIG5ld1N5bmNlZERpcnMuYWRkKGRpclBhdGgpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBOZXcgcmVtb3RlIGRpcmVjdG9yeSBub3QgeWV0IGxvY2FsIFx1MjE5MiBjcmVhdGUgbG9jYWxseVxuICAgICAgICBpZiAoIShhd2FpdCB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLmV4aXN0cyhkaXJQYXRoKSkpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5ta2RpcihkaXJQYXRoKTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zdCBtc2cgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSk7XG4gICAgICAgICAgICBpZiAoIW1zZy5pbmNsdWRlcyhcImFscmVhZHkgZXhpc3RzXCIpKSB7XG4gICAgICAgICAgICAgIHRocm93IGU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHN0YXRzLmNyZWF0ZWRMb2NhbCArPSAxO1xuICAgICAgICBuZXdTeW5jZWREaXJzLmFkZChkaXJQYXRoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLnN5bmNlZERpcmVjdG9yaWVzID0gbmV3U3luY2VkRGlycztcbiAgICByZXR1cm4gc3RhdHM7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZUV4dHJhUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlRGlyZWN0b3JpZXM6IFNldDxzdHJpbmc+LCBleHBlY3RlZERpcmVjdG9yaWVzOiBTZXQ8c3RyaW5nPikge1xuICAgIGxldCBkZWxldGVkID0gMDtcbiAgICBjb25zdCBjYW5kaWRhdGVzID0gWy4uLnJlbW90ZURpcmVjdG9yaWVzXVxuICAgICAgLmZpbHRlcigocmVtb3RlUGF0aCkgPT4gIWV4cGVjdGVkRGlyZWN0b3JpZXMuaGFzKHJlbW90ZVBhdGgpKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGIubGVuZ3RoIC0gYS5sZW5ndGggfHwgYi5sb2NhbGVDb21wYXJlKGEpKTtcblxuICAgIGZvciAoY29uc3QgcmVtb3RlUGF0aCBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAoWzIwMCwgMjAyLCAyMDQsIDQwNF0uaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzKSkge1xuICAgICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSA0MDQpIHtcbiAgICAgICAgICBkZWxldGVkICs9IDE7XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChbNDA1LCA0MDldLmluY2x1ZGVzKHJlc3BvbnNlLnN0YXR1cykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHRocm93IG5ldyBFcnJvcihgREVMRVRFIGRpcmVjdG9yeSBmYWlsZWQgZm9yICR7cmVtb3RlUGF0aH0gd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlbGV0ZWQ7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHByb2Nlc3NQZW5kaW5nVGFza3MoKSB7XG5cbiAgICBhd2FpdCB0aGlzLnVwbG9hZFF1ZXVlLnByb2Nlc3NQZW5kaW5nVGFza3MoKTtcbiAgfVxuXG4gIHByaXZhdGUgdHJhY2tWYXVsdE11dGF0aW9uKG9wZXJhdGlvbjogKCkgPT4gUHJvbWlzZTx2b2lkPikge1xuICAgIGNvbnN0IHByb21pc2UgPSBvcGVyYXRpb24oKVxuICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiU2VjdXJlIFdlYkRBViB2YXVsdCBtdXRhdGlvbiBoYW5kbGluZyBmYWlsZWRcIiwgZXJyb3IpO1xuICAgICAgfSlcbiAgICAgIC5maW5hbGx5KCgpID0+IHtcbiAgICAgICAgdGhpcy5wZW5kaW5nVmF1bHRNdXRhdGlvblByb21pc2VzLmRlbGV0ZShwcm9taXNlKTtcbiAgICAgIH0pO1xuICAgIHRoaXMucGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlcy5hZGQocHJvbWlzZSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHdhaXRGb3JQZW5kaW5nVmF1bHRNdXRhdGlvbnMoKSB7XG4gICAgd2hpbGUgKHRoaXMucGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlcy5zaXplID4gMCkge1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKFsuLi50aGlzLnBlbmRpbmdWYXVsdE11dGF0aW9uUHJvbWlzZXNdKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHByZXBhcmVQZW5kaW5nVXBsb2Fkc0ZvclN5bmMoc2hvd05vdGljZTogYm9vbGVhbikge1xuXG4gICAgYXdhaXQgdGhpcy51cGxvYWRRdWV1ZS5wcm9jZXNzUGVuZGluZ1Rhc2tzKCk7XG5cbiAgICBpZiAodGhpcy51cGxvYWRRdWV1ZS5oYXNQZW5kaW5nV29yaygpKSB7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLnQoXG4gICAgICAgIFwiXHU2OEMwXHU2RDRCXHU1MjMwXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU0RUNEXHU1NzI4XHU4RkRCXHU4ODRDXHU2MjE2XHU3QjQ5XHU1Rjg1XHU5MUNEXHU4QkQ1XHVGRjBDXHU1REYyXHU2NjgyXHU3RjEzXHU2NzJDXHU2QjIxXHU3QjE0XHU4QkIwXHU1NDBDXHU2QjY1XHVGRjBDXHU5MDdGXHU1MTREXHU2NUU3XHU3MjQ4XHU3QjE0XHU4QkIwXHU4OTg2XHU3NkQ2XHU2NUIwXHU1NkZFXHU3MjQ3XHU1RjE1XHU3NTI4XHUzMDAyXCIsXG4gICAgICAgIFwiSW1hZ2UgdXBsb2FkcyBhcmUgc3RpbGwgcnVubmluZyBvciB3YWl0aW5nIGZvciByZXRyeSwgc28gbm90ZSBzeW5jIHdhcyBkZWZlcnJlZCB0byBhdm9pZCBvbGQgbm90ZSBjb250ZW50IG92ZXJ3cml0aW5nIG5ldyBpbWFnZSByZWZlcmVuY2VzLlwiLFxuICAgICAgKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cywgODAwMCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwbG9hZEltYWdlc0luTm90ZShub3RlRmlsZTogVEZpbGUpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQobm90ZUZpbGUpO1xuICAgICAgY29uc3QgcmVwbGFjZW1lbnRzID0gYXdhaXQgdGhpcy5idWlsZFVwbG9hZFJlcGxhY2VtZW50cyhjb250ZW50LCBub3RlRmlsZSk7XG5cbiAgICAgIGlmIChyZXBsYWNlbWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1RjUzXHU1MjREXHU3QjE0XHU4QkIwXHU0RTJEXHU2Q0ExXHU2NzA5XHU2MjdFXHU1MjMwXHU2NzJDXHU1NzMwXHU1NkZFXHU3MjQ3XHUzMDAyXCIsIFwiTm8gbG9jYWwgaW1hZ2VzIGZvdW5kIGluIHRoZSBjdXJyZW50IG5vdGUuXCIpKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBsZXQgdXBkYXRlZCA9IGNvbnRlbnQ7XG4gICAgICBmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIHJlcGxhY2VtZW50cykge1xuICAgICAgICB1cGRhdGVkID0gdXBkYXRlZC5zcGxpdChyZXBsYWNlbWVudC5vcmlnaW5hbCkuam9pbihyZXBsYWNlbWVudC5yZXdyaXR0ZW4pO1xuICAgICAgfVxuXG4gICAgICBpZiAodXBkYXRlZCA9PT0gY29udGVudCkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NkNBMVx1NjcwOVx1OTcwMFx1ODk4MVx1NjUzOVx1NTE5OVx1NzY4NFx1NTZGRVx1NzI0N1x1OTRGRVx1NjNBNVx1MzAwMlwiLCBcIk5vIGltYWdlcyB3ZXJlIHJld3JpdHRlbi5cIikpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShub3RlRmlsZSwgdXBkYXRlZCk7XG4gICAgICB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyhub3RlRmlsZS5wYXRoLCBcImltYWdlLWFkZFwiKTtcblxuICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZGVsZXRlTG9jYWxBZnRlclVwbG9hZCkge1xuICAgICAgICBmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIHJlcGxhY2VtZW50cykge1xuICAgICAgICAgIGlmIChyZXBsYWNlbWVudC5zb3VyY2VGaWxlKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnRyYXNoSWZFeGlzdHMocmVwbGFjZW1lbnQuc291cmNlRmlsZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIG5ldyBOb3RpY2UodGhpcy50KGBcdTVERjJcdTRFMEFcdTRGMjAgJHtyZXBsYWNlbWVudHMubGVuZ3RofSBcdTVGMjBcdTU2RkVcdTcyNDdcdTUyMzAgV2ViREFWXHUzMDAyYCwgYFVwbG9hZGVkICR7cmVwbGFjZW1lbnRzLmxlbmd0aH0gaW1hZ2UocykgdG8gV2ViREFWLmApKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIlNlY3VyZSBXZWJEQVYgdXBsb2FkIGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTRFMEFcdTRGMjBcdTU5MzFcdThEMjVcIiwgXCJVcGxvYWQgZmFpbGVkXCIpLCBlcnJvciksIDgwMDApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcHJvY2Vzc1Rhc2sodGFzazogVXBsb2FkVGFzaykge1xuXG4gICAgYXdhaXQgdGhpcy51cGxvYWRRdWV1ZS5wcm9jZXNzVGFzayh0YXNrKTtcbiAgfVxuXG4gIHByaXZhdGUgZXNjYXBlSHRtbCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHZhbHVlXG4gICAgICAucmVwbGFjZSgvJi9nLCBcIiZhbXA7XCIpXG4gICAgICAucmVwbGFjZSgvXCIvZywgXCImcXVvdDtcIilcbiAgICAgIC5yZXBsYWNlKC88L2csIFwiJmx0O1wiKVxuICAgICAgLnJlcGxhY2UoLz4vZywgXCImZ3Q7XCIpO1xuICB9XG5cbiAgcHJpdmF0ZSB1bmVzY2FwZUh0bWwodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiB2YWx1ZVxuICAgICAgLnJlcGxhY2UoLyZxdW90Oy9nLCBcIlxcXCJcIilcbiAgICAgIC5yZXBsYWNlKC8mZ3Q7L2csIFwiPlwiKVxuICAgICAgLnJlcGxhY2UoLyZsdDsvZywgXCI8XCIpXG4gICAgICAucmVwbGFjZSgvJmFtcDsvZywgXCImXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBmZXRjaFNlY3VyZUltYWdlQmxvYlVybChyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2UsIFwiRmV0Y2ggc2VjdXJlIGltYWdlXCIpO1xuXG4gICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtyZXNwb25zZS5hcnJheUJ1ZmZlcl0sIHtcbiAgICAgIHR5cGU6IHJlc3BvbnNlLmhlYWRlcnNbXCJjb250ZW50LXR5cGVcIl0gPz8gXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIixcbiAgICB9KTtcbiAgICBjb25zdCBibG9iVXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICB0aGlzLmV2aWN0QmxvYlVybHNJZk5lZWRlZCgpO1xuICAgIHRoaXMuYmxvYlVybHMuYWRkKGJsb2JVcmwpO1xuICAgIHJldHVybiBibG9iVXJsO1xuICB9XG5cbiAgcHJpdmF0ZSBldmljdEJsb2JVcmxzSWZOZWVkZWQoKSB7XG4gICAgd2hpbGUgKHRoaXMuYmxvYlVybHMuc2l6ZSA+PSB0aGlzLm1heEJsb2JVcmxzKSB7XG4gICAgICBjb25zdCBvbGRlc3QgPSB0aGlzLmJsb2JVcmxzLnZhbHVlcygpLm5leHQoKS52YWx1ZSE7XG4gICAgICB0aGlzLmJsb2JVcmxzLmRlbGV0ZShvbGRlc3QpO1xuICAgICAgVVJMLnJldm9rZU9iamVjdFVSTChvbGRlc3QpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXJyYXlCdWZmZXJUb0Jhc2U2NChidWZmZXI6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShidWZmZXIpO1xuICAgIGNvbnN0IGNodW5rU2l6ZSA9IDB4ODAwMDtcbiAgICBsZXQgYmluYXJ5ID0gXCJcIjtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYnl0ZXMubGVuZ3RoOyBpbmRleCArPSBjaHVua1NpemUpIHtcbiAgICAgIGNvbnN0IGNodW5rID0gYnl0ZXMuc3ViYXJyYXkoaW5kZXgsIGluZGV4ICsgY2h1bmtTaXplKTtcbiAgICAgIGJpbmFyeSArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKC4uLmNodW5rKTtcbiAgICB9XG4gICAgcmV0dXJuIGJ0b2EoYmluYXJ5KTtcbiAgfVxuXG4gIHByaXZhdGUgYmFzZTY0VG9BcnJheUJ1ZmZlcihiYXNlNjQ6IHN0cmluZykge1xuICAgIGNvbnN0IGJpbmFyeSA9IGF0b2IoYmFzZTY0KTtcbiAgICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KGJpbmFyeS5sZW5ndGgpO1xuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBiaW5hcnkubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgICBieXRlc1tpbmRleF0gPSBiaW5hcnkuY2hhckNvZGVBdChpbmRleCk7XG4gICAgfVxuICAgIHJldHVybiBieXRlcy5idWZmZXIuc2xpY2UoYnl0ZXMuYnl0ZU9mZnNldCwgYnl0ZXMuYnl0ZU9mZnNldCArIGJ5dGVzLmJ5dGVMZW5ndGgpIGFzIEFycmF5QnVmZmVyO1xuICB9XG5cbiAgcHJpdmF0ZSBhcnJheUJ1ZmZlcnNFcXVhbChsZWZ0OiBBcnJheUJ1ZmZlciwgcmlnaHQ6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgYSA9IG5ldyBVaW50OEFycmF5KGxlZnQpO1xuICAgIGNvbnN0IGIgPSBuZXcgVWludDhBcnJheShyaWdodCk7XG4gICAgaWYgKGEubGVuZ3RoICE9PSBiLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBhLmxlbmd0aDsgaW5kZXggKz0gMSkge1xuICAgICAgaWYgKGFbaW5kZXhdICE9PSBiW2luZGV4XSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkQ2xpcGJvYXJkRmlsZU5hbWUobWltZVR5cGU6IHN0cmluZykge1xuICAgIGNvbnN0IGV4dGVuc2lvbiA9IG1pbWVUeXBlLnNwbGl0KFwiL1wiKVsxXT8ucmVwbGFjZShcImpwZWdcIiwgXCJqcGdcIikgfHwgXCJwbmdcIjtcbiAgICByZXR1cm4gYHBhc3RlZC1pbWFnZS0ke0RhdGUubm93KCl9LiR7ZXh0ZW5zaW9ufWA7XG4gIH1cblxuICBwcml2YXRlIGVzY2FwZVJlZ0V4cCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCBcIlxcXFwkJlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRSZW1vdGVQYXRoKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gYCR7bm9ybWFsaXplRm9sZGVyKHRoaXMuc2V0dGluZ3MucmVtb3RlRm9sZGVyKX0ke2ZpbGVOYW1lfWA7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5KGZpbGVOYW1lOiBzdHJpbmcsIGJpbmFyeTogQXJyYXlCdWZmZXIpIHtcbiAgICBjb25zdCBleHRlbnNpb24gPSB0aGlzLmdldEV4dGVuc2lvbkZyb21GaWxlTmFtZShmaWxlTmFtZSk7XG4gICAgaWYgKHRoaXMuc2V0dGluZ3MubmFtaW5nU3RyYXRlZ3kgPT09IFwiaGFzaFwiKSB7XG4gICAgICBjb25zdCBoYXNoID0gKGF3YWl0IHRoaXMuY29tcHV0ZVNoYTI1NkhleChiaW5hcnkpKS5zbGljZSgwLCAxNik7XG4gICAgICByZXR1cm4gYCR7aGFzaH0uJHtleHRlbnNpb259YDtcbiAgICB9XG5cbiAgICByZXR1cm4gYCR7RGF0ZS5ub3coKX0tJHtmaWxlTmFtZX1gO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZFVwbG9hZFVybChyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBiYXNlID0gdGhpcy5zZXR0aW5ncy53ZWJkYXZVcmwucmVwbGFjZSgvXFwvKyQvLCBcIlwiKTtcbiAgICByZXR1cm4gYCR7YmFzZX0vJHtyZW1vdGVQYXRoLnNwbGl0KFwiL1wiKS5tYXAoZW5jb2RlVVJJQ29tcG9uZW50KS5qb2luKFwiL1wiKX1gO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZEF1dGhIZWFkZXIoKSB7XG4gICAgY29uc3QgdG9rZW4gPSB0aGlzLmFycmF5QnVmZmVyVG9CYXNlNjQodGhpcy5lbmNvZGVVdGY4KGAke3RoaXMuc2V0dGluZ3MudXNlcm5hbWV9OiR7dGhpcy5zZXR0aW5ncy5wYXNzd29yZH1gKSk7XG4gICAgcmV0dXJuIGBCYXNpYyAke3Rva2VufWA7XG4gIH1cblxuICBwcml2YXRlIGVuc3VyZUNvbmZpZ3VyZWQoKSB7XG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLndlYmRhdlVybCB8fCAhdGhpcy5zZXR0aW5ncy51c2VybmFtZSB8fCAhdGhpcy5zZXR0aW5ncy5wYXNzd29yZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIldlYkRBViBcdTkxNERcdTdGNkVcdTRFMERcdTVCOENcdTY1NzRcdTMwMDJcIiwgXCJXZWJEQVYgc2V0dGluZ3MgYXJlIGluY29tcGxldGUuXCIpKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzc2VydFJlc3BvbnNlU3VjY2VzcyhyZXNwb25zZTogeyBzdGF0dXM6IG51bWJlciB9LCBjb250ZXh0OiBzdHJpbmcpIHtcbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtjb250ZXh0fSBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBnZXRNaW1lVHlwZShleHRlbnNpb246IHN0cmluZykge1xuICAgIHJldHVybiBNSU1FX01BUFtleHRlbnNpb24udG9Mb3dlckNhc2UoKV0gPz8gXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIjtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmdldE1pbWVUeXBlKHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbUZpbGVOYW1lKGZpbGVOYW1lKSk7XG4gIH1cblxuICBwcml2YXRlIGdldEV4dGVuc2lvbkZyb21GaWxlTmFtZShmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcGllY2VzID0gZmlsZU5hbWUuc3BsaXQoXCIuXCIpO1xuICAgIHJldHVybiBwaWVjZXMubGVuZ3RoID4gMSA/IHBpZWNlc1twaWVjZXMubGVuZ3RoIC0gMV0udG9Mb3dlckNhc2UoKSA6IFwicG5nXCI7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHByZXBhcmVVcGxvYWRQYXlsb2FkKGJpbmFyeTogQXJyYXlCdWZmZXIsIG1pbWVUeXBlOiBzdHJpbmcsIGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBpZiAoIXRoaXMuc2V0dGluZ3MuY29tcHJlc3NJbWFnZXMpIHtcbiAgICAgIHJldHVybiB7IGJpbmFyeSwgbWltZVR5cGUsIGZpbGVOYW1lIH07XG4gICAgfVxuXG4gICAgY29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLmNvbXByZXNzSW1hZ2VJZk5lZWRlZChiaW5hcnksIG1pbWVUeXBlLCBmaWxlTmFtZSk7XG4gICAgcmV0dXJuIHByZXBhcmVkID8/IHsgYmluYXJ5LCBtaW1lVHlwZSwgZmlsZU5hbWUgfTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY29tcHJlc3NJbWFnZUlmTmVlZGVkKGJpbmFyeTogQXJyYXlCdWZmZXIsIG1pbWVUeXBlOiBzdHJpbmcsIGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBpZiAoIS9eaW1hZ2VcXC8ocG5nfGpwZWd8anBnfHdlYnApJC9pLnRlc3QobWltZVR5cGUpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCB0aHJlc2hvbGRCeXRlcyA9IHRoaXMuc2V0dGluZ3MuY29tcHJlc3NUaHJlc2hvbGRLYiAqIDEwMjQ7XG4gICAgY29uc3Qgc291cmNlQmxvYiA9IG5ldyBCbG9iKFtiaW5hcnldLCB7IHR5cGU6IG1pbWVUeXBlIH0pO1xuICAgIGNvbnN0IGltYWdlID0gYXdhaXQgdGhpcy5sb2FkSW1hZ2VFbGVtZW50KHNvdXJjZUJsb2IpO1xuICAgIGNvbnN0IGxhcmdlc3RTaWRlID0gTWF0aC5tYXgoaW1hZ2UubmF0dXJhbFdpZHRoLCBpbWFnZS5uYXR1cmFsSGVpZ2h0KTtcbiAgICBjb25zdCBuZWVkc1Jlc2l6ZSA9IGxhcmdlc3RTaWRlID4gdGhpcy5zZXR0aW5ncy5tYXhJbWFnZURpbWVuc2lvbjtcbiAgICBjb25zdCBuZWVkc0NvbXByZXNzID0gc291cmNlQmxvYi5zaXplID4gdGhyZXNob2xkQnl0ZXMgfHwgbmVlZHNSZXNpemU7XG4gICAgaWYgKCFuZWVkc0NvbXByZXNzKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBzY2FsZSA9IG5lZWRzUmVzaXplID8gdGhpcy5zZXR0aW5ncy5tYXhJbWFnZURpbWVuc2lvbiAvIGxhcmdlc3RTaWRlIDogMTtcbiAgICBjb25zdCB0YXJnZXRXaWR0aCA9IE1hdGgubWF4KDEsIE1hdGgucm91bmQoaW1hZ2UubmF0dXJhbFdpZHRoICogc2NhbGUpKTtcbiAgICBjb25zdCB0YXJnZXRIZWlnaHQgPSBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKGltYWdlLm5hdHVyYWxIZWlnaHQgKiBzY2FsZSkpO1xuICAgIGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJjYW52YXNcIik7XG4gICAgY2FudmFzLndpZHRoID0gdGFyZ2V0V2lkdGg7XG4gICAgY2FudmFzLmhlaWdodCA9IHRhcmdldEhlaWdodDtcbiAgICBjb25zdCBjb250ZXh0ID0gY2FudmFzLmdldENvbnRleHQoXCIyZFwiKTtcbiAgICBpZiAoIWNvbnRleHQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnRleHQuZHJhd0ltYWdlKGltYWdlLCAwLCAwLCB0YXJnZXRXaWR0aCwgdGFyZ2V0SGVpZ2h0KTtcblxuICAgIGNvbnN0IG91dHB1dE1pbWUgPSBtaW1lVHlwZS50b0xvd2VyQ2FzZSgpID09PSBcImltYWdlL2pwZ1wiID8gXCJpbWFnZS9qcGVnXCIgOiBtaW1lVHlwZTtcbiAgICBjb25zdCBxdWFsaXR5ID0gTWF0aC5tYXgoMC40LCBNYXRoLm1pbigwLjk4LCB0aGlzLnNldHRpbmdzLmpwZWdRdWFsaXR5IC8gMTAwKSk7XG4gICAgY29uc3QgY29tcHJlc3NlZEJsb2IgPSBhd2FpdCBuZXcgUHJvbWlzZTxCbG9iIHwgbnVsbD4oKHJlc29sdmUpID0+IHtcbiAgICAgIGNhbnZhcy50b0Jsb2IocmVzb2x2ZSwgb3V0cHV0TWltZSwgcXVhbGl0eSk7XG4gICAgfSk7XG5cbiAgICBpZiAoIWNvbXByZXNzZWRCbG9iKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoIW5lZWRzUmVzaXplICYmIGNvbXByZXNzZWRCbG9iLnNpemUgPj0gc291cmNlQmxvYi5zaXplKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBuZXh0QmluYXJ5ID0gYXdhaXQgY29tcHJlc3NlZEJsb2IuYXJyYXlCdWZmZXIoKTtcbiAgICBjb25zdCBuZXh0RXh0ZW5zaW9uID0gdGhpcy5leHRlbnNpb25Gcm9tTWltZVR5cGUob3V0cHV0TWltZSkgPz8gdGhpcy5nZXRFeHRlbnNpb25Gcm9tRmlsZU5hbWUoZmlsZU5hbWUpO1xuICAgIGNvbnN0IG5leHRGaWxlTmFtZSA9IGZpbGVOYW1lLnJlcGxhY2UoL1xcLlteLl0rJC8sIFwiXCIpICsgYC4ke25leHRFeHRlbnNpb259YDtcbiAgICByZXR1cm4ge1xuICAgICAgYmluYXJ5OiBuZXh0QmluYXJ5LFxuICAgICAgbWltZVR5cGU6IG91dHB1dE1pbWUsXG4gICAgICBmaWxlTmFtZTogbmV4dEZpbGVOYW1lLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGxvYWRJbWFnZUVsZW1lbnQoYmxvYjogQmxvYikge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZTxIVE1MSW1hZ2VFbGVtZW50PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICAgICAgY29uc3QgaW1hZ2UgPSBuZXcgSW1hZ2UoKTtcbiAgICAgIGltYWdlLm9ubG9hZCA9ICgpID0+IHtcbiAgICAgICAgVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpO1xuICAgICAgICByZXNvbHZlKGltYWdlKTtcbiAgICAgIH07XG4gICAgICBpbWFnZS5vbmVycm9yID0gKGVycm9yKSA9PiB7XG4gICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwodXJsKTtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH07XG4gICAgICBpbWFnZS5zcmMgPSB1cmw7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGV4dGVuc2lvbkZyb21NaW1lVHlwZShtaW1lVHlwZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIE1JTUVfTUFQW21pbWVUeXBlXSA/PyBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB0cmFzaElmRXhpc3RzKGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQudHJhc2goZmlsZSwgdHJ1ZSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2FybihcIkZhaWxlZCB0byB0cmFzaCBsb2NhbCBpbWFnZSBhZnRlciB1cGxvYWRcIiwgZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZm9ybWF0RW1iZWRMYWJlbChmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMudChgXHUzMDEwXHU1Qjg5XHU1MTY4XHU4RkRDXHU3QTBCXHU1NkZFXHU3MjQ3XHVGRjVDJHtmaWxlTmFtZX1cdTMwMTFgLCBgW1NlY3VyZSByZW1vdGUgaW1hZ2UgfCAke2ZpbGVOYW1lfV1gKTtcbiAgfVxuXG4gIHByaXZhdGUgZm9ybWF0RmFpbGVkTGFiZWwoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLnQoYFx1MzAxMFx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NTkzMVx1OEQyNVx1RkY1QyR7ZmlsZU5hbWV9XHUzMDExYCwgYFtJbWFnZSB1cGxvYWQgZmFpbGVkIHwgJHtmaWxlTmFtZX1dYCk7XG4gIH1cblxuICBhc3luYyBtaWdyYXRlQWxsTGVnYWN5U2VjdXJlSW1hZ2VzKCkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB1cGxvYWRDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgICBjb25zdCBjYW5kaWRhdGVMb2NhbEltYWdlcyA9IG5ldyBNYXA8c3RyaW5nLCBURmlsZT4oKTtcbiAgICAgIGxldCBjaGFuZ2VkRmlsZXMgPSAwO1xuICAgICAgZm9yIChjb25zdCBmaWxlIG9mIHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKSkge1xuICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgICAgY29uc3QgcmVwbGFjZW1lbnRzID0gYXdhaXQgdGhpcy5idWlsZFVwbG9hZFJlcGxhY2VtZW50cyhjb250ZW50LCBmaWxlLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgcmVwbGFjZW1lbnRzKSB7XG4gICAgICAgICAgaWYgKHJlcGxhY2VtZW50LnNvdXJjZUZpbGUpIHtcbiAgICAgICAgICAgIGNhbmRpZGF0ZUxvY2FsSW1hZ2VzLnNldChyZXBsYWNlbWVudC5zb3VyY2VGaWxlLnBhdGgsIHJlcGxhY2VtZW50LnNvdXJjZUZpbGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGxldCB1cGRhdGVkID0gY29udGVudDtcbiAgICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcbiAgICAgICAgICB1cGRhdGVkID0gdXBkYXRlZC5zcGxpdChyZXBsYWNlbWVudC5vcmlnaW5hbCkuam9pbihyZXBsYWNlbWVudC5yZXdyaXR0ZW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlZCA9IHVwZGF0ZWRcbiAgICAgICAgICAucmVwbGFjZShcbiAgICAgICAgICAgIC88c3BhbiBjbGFzcz1cInNlY3VyZS13ZWJkYXYtZW1iZWRcIiBkYXRhLXNlY3VyZS13ZWJkYXY9XCIoW15cIl0rKVwiIGFyaWEtbGFiZWw9XCIoW15cIl0qKVwiPi4qPzxcXC9zcGFuPi9nLFxuICAgICAgICAgICAgKF9tYXRjaCwgcmVtb3RlUGF0aDogc3RyaW5nLCBhbHQ6IHN0cmluZykgPT5cbiAgICAgICAgICAgICAgdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayhcbiAgICAgICAgICAgICAgICB0aGlzLnVuZXNjYXBlSHRtbChyZW1vdGVQYXRoKSxcbiAgICAgICAgICAgICAgICB0aGlzLnVuZXNjYXBlSHRtbChhbHQpIHx8IHRoaXMudW5lc2NhcGVIdG1sKHJlbW90ZVBhdGgpLFxuICAgICAgICAgICAgICApLFxuICAgICAgICAgIClcbiAgICAgICAgICAucmVwbGFjZShcbiAgICAgICAgICAgIC8hXFxbW15cXF1dKl1cXCh3ZWJkYXYtc2VjdXJlOlxcL1xcLyhbXildKylcXCkvZyxcbiAgICAgICAgICAgIChfbWF0Y2gsIHJlbW90ZVBhdGg6IHN0cmluZykgPT5cbiAgICAgICAgICAgICAgdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayh0aGlzLnVuZXNjYXBlSHRtbChyZW1vdGVQYXRoKSwgdGhpcy51bmVzY2FwZUh0bWwocmVtb3RlUGF0aCkpLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgaWYgKHVwZGF0ZWQgPT09IGNvbnRlbnQpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB1cGRhdGVkKTtcbiAgICAgICAgY2hhbmdlZEZpbGVzICs9IDE7XG4gICAgICB9XG5cbiAgICAgIGlmIChjaGFuZ2VkRmlsZXMgPT09IDApIHtcbiAgICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgICB0aGlzLnQoXG4gICAgICAgICAgICBcIlx1NjU3NFx1NUU5M1x1OTFDQ1x1NkNBMVx1NjcwOVx1NTNEMVx1NzNCMFx1NTNFRlx1OEZDMVx1NzlGQlx1NzY4NFx1NjVFN1x1NzI0OFx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NjgwN1x1N0I3RVx1MzAwMlwiLFxuICAgICAgICAgICAgXCJObyBsZWdhY3kgc2VjdXJlIGltYWdlIHRhZ3Mgd2VyZSBmb3VuZCBpbiB0aGUgdmF1bHQuXCIsXG4gICAgICAgICAgKSxcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5kZWxldGVMb2NhbEFmdGVyVXBsb2FkKSB7XG4gICAgICAgIGF3YWl0IHRoaXMudHJhc2hNaWdyYXRlZEltYWdlc0lmU2FmZShjYW5kaWRhdGVMb2NhbEltYWdlcyk7XG4gICAgICB9XG5cbiAgICAgIG5ldyBOb3RpY2UoXG4gICAgICB0aGlzLnQoXG4gICAgICAgIGBcdTVERjJcdThGQzFcdTc5RkIgJHtjaGFuZ2VkRmlsZXN9IFx1N0JDN1x1N0IxNFx1OEJCMFx1NTIzMFx1NjVCMFx1NzY4NFx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NEVFM1x1NzgwMVx1NTc1N1x1NjgzQ1x1NUYwRlx1MzAwMmAsXG4gICAgICAgIGBNaWdyYXRlZCAke2NoYW5nZWRGaWxlc30gbm90ZShzKSB0byB0aGUgbmV3IHNlY3VyZSBpbWFnZSBjb2RlLWJsb2NrIGZvcm1hdC5gLFxuICAgICAgKSxcbiAgICAgICAgODAwMCxcbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbWlncmF0ZSBzZWN1cmUgaW1hZ2VzIHRvIGNvZGUgYmxvY2tzXCIsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1OEZDMVx1NzlGQlx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NjgzQ1x1NUYwRlx1NTkzMVx1OEQyNVwiLCBcIkZhaWxlZCB0byBtaWdyYXRlIHNlY3VyZSBpbWFnZSBmb3JtYXRcIiksIGVycm9yKSwgODAwMCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB0cmFzaE1pZ3JhdGVkSW1hZ2VzSWZTYWZlKGNhbmRpZGF0ZUxvY2FsSW1hZ2VzOiBNYXA8c3RyaW5nLCBURmlsZT4pIHtcbiAgICBpZiAoY2FuZGlkYXRlTG9jYWxJbWFnZXMuc2l6ZSA9PT0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHJlbWFpbmluZ1JlZnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBmb3IgKGNvbnN0IG5vdGUgb2YgdGhpcy5hcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpKSB7XG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChub3RlKTtcbiAgICAgIGNvbnN0IHdpa2lNYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtcXFsoW15cXF1dKylcXF1cXF0vZyldO1xuICAgICAgY29uc3QgbWFya2Rvd25NYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtbXlxcXV0qXVxcKChbXildKylcXCkvZyldO1xuXG4gICAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIHdpa2lNYXRjaGVzKSB7XG4gICAgICAgIGNvbnN0IHJhd0xpbmsgPSBtYXRjaFsxXS5zcGxpdChcInxcIilbMF0udHJpbSgpO1xuICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGUucGF0aCk7XG4gICAgICAgIGlmICh0YXJnZXQgJiYgdGhpcy5pc0ltYWdlRmlsZSh0YXJnZXQpKSB7XG4gICAgICAgICAgcmVtYWluaW5nUmVmcy5hZGQodGFyZ2V0LnBhdGgpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWFya2Rvd25NYXRjaGVzKSB7XG4gICAgICAgIGNvbnN0IHJhd0xpbmsgPSBkZWNvZGVVUklDb21wb25lbnQobWF0Y2hbMV0udHJpbSgpLnJlcGxhY2UoL148fD4kL2csIFwiXCIpKTtcbiAgICAgICAgaWYgKC9eKGh0dHBzPzp8d2ViZGF2LXNlY3VyZTp8ZGF0YTopL2kudGVzdChyYXdMaW5rKSkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5yZXNvbHZlTGlua2VkRmlsZShyYXdMaW5rLCBub3RlLnBhdGgpO1xuICAgICAgICBpZiAodGFyZ2V0ICYmIHRoaXMuaXNJbWFnZUZpbGUodGFyZ2V0KSkge1xuICAgICAgICAgIHJlbWFpbmluZ1JlZnMuYWRkKHRhcmdldC5wYXRoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgW3BhdGgsIGZpbGVdIG9mIGNhbmRpZGF0ZUxvY2FsSW1hZ2VzLmVudHJpZXMoKSkge1xuICAgICAgaWYgKHJlbWFpbmluZ1JlZnMuaGFzKHBhdGgpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLnRyYXNoSWZFeGlzdHMoZmlsZSk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgcnVuQ29ubmVjdGlvblRlc3Qoc2hvd01vZGFsID0gZmFsc2UpIHtcbiAgICB0cnkge1xuICAgICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG5cbiAgICAgIGNvbnN0IHByb2JlTmFtZSA9IGAuc2VjdXJlLXdlYmRhdi1wcm9iZS0ke0RhdGUubm93KCl9LnR4dGA7XG4gICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5idWlsZFJlbW90ZVBhdGgocHJvYmVOYW1lKTtcbiAgICAgIGNvbnN0IHVwbG9hZFVybCA9IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCk7XG4gICAgICBjb25zdCBwcm9iZUFycmF5QnVmZmVyID0gdGhpcy5lbmNvZGVVdGY4KGBzZWN1cmUtd2ViZGF2IHByb2JlICR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpfWApO1xuXG4gICAgICBjb25zdCBwdXRSZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdXBsb2FkVXJsLFxuICAgICAgICBtZXRob2Q6IFwiUFVUXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwidGV4dC9wbGFpbjsgY2hhcnNldD11dGYtOFwiLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBwcm9iZUFycmF5QnVmZmVyLFxuICAgICAgfSk7XG4gICAgICBpZiAocHV0UmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHB1dFJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBQVVQgZmFpbGVkIHdpdGggc3RhdHVzICR7cHV0UmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBnZXRSZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdXBsb2FkVXJsLFxuICAgICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgICBpZiAoZ2V0UmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IGdldFJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBHRVQgZmFpbGVkIHdpdGggc3RhdHVzICR7Z2V0UmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBkZWxldGVSZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdXBsb2FkVXJsLFxuICAgICAgICBtZXRob2Q6IFwiREVMRVRFXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgICBpZiAoZGVsZXRlUmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IGRlbGV0ZVJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBERUxFVEUgZmFpbGVkIHdpdGggc3RhdHVzICR7ZGVsZXRlUmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBtZXNzYWdlID0gdGhpcy50KFxuICAgICAgICBgV2ViREFWIFx1NkQ0Qlx1OEJENVx1OTAxQVx1OEZDN1x1MzAwMlBVVCAke3B1dFJlc3BvbnNlLnN0YXR1c31cdUZGMENHRVQgJHtnZXRSZXNwb25zZS5zdGF0dXN9XHVGRjBDREVMRVRFICR7ZGVsZXRlUmVzcG9uc2Uuc3RhdHVzfVx1MzAwMmAsXG4gICAgICAgIGBXZWJEQVYgdGVzdCBwYXNzZWQuIFBVVCAke3B1dFJlc3BvbnNlLnN0YXR1c30sIEdFVCAke2dldFJlc3BvbnNlLnN0YXR1c30sIERFTEVURSAke2RlbGV0ZVJlc3BvbnNlLnN0YXR1c30uYCxcbiAgICAgICk7XG4gICAgICBuZXcgTm90aWNlKG1lc3NhZ2UsIDYwMDApO1xuICAgICAgaWYgKHNob3dNb2RhbCkge1xuICAgICAgICBuZXcgUmVzdWx0TW9kYWwodGhpcy5hcHAsIHRoaXMudChcIldlYkRBViBcdThGREVcdTYzQTVcIiwgXCJXZWJEQVYgQ29ubmVjdGlvblwiKSwgbWVzc2FnZSkub3BlbigpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIHRlc3QgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSB0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiV2ViREFWIFx1NkQ0Qlx1OEJENVx1NTkzMVx1OEQyNVwiLCBcIldlYkRBViB0ZXN0IGZhaWxlZFwiKSwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZShtZXNzYWdlLCA4MDAwKTtcbiAgICAgIGlmIChzaG93TW9kYWwpIHtcbiAgICAgICAgbmV3IFJlc3VsdE1vZGFsKHRoaXMuYXBwLCB0aGlzLnQoXCJXZWJEQVYgXHU4RkRFXHU2M0E1XCIsIFwiV2ViREFWIENvbm5lY3Rpb25cIiksIG1lc3NhZ2UpLm9wZW4oKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGRlc2NyaWJlRXJyb3IocHJlZml4OiBzdHJpbmcsIGVycm9yOiB1bmtub3duKSB7XG4gICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcbiAgICByZXR1cm4gYCR7cHJlZml4fTogJHttZXNzYWdlfWA7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlcXVlc3RVcmwob3B0aW9uczoge1xuICAgIHVybDogc3RyaW5nO1xuICAgIG1ldGhvZDogc3RyaW5nO1xuICAgIGhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICAgIGJvZHk/OiBBcnJheUJ1ZmZlcjtcbiAgICBmb2xsb3dSZWRpcmVjdHM/OiBib29sZWFuO1xuICAgIHJlZGlyZWN0Q291bnQ/OiBudW1iZXI7XG4gIH0pOiBQcm9taXNlPHsgc3RhdHVzOiBudW1iZXI7IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47IGFycmF5QnVmZmVyOiBBcnJheUJ1ZmZlciB9PiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBvYnNpZGlhblJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiBvcHRpb25zLnVybCxcbiAgICAgIG1ldGhvZDogb3B0aW9ucy5tZXRob2QsXG4gICAgICBoZWFkZXJzOiBvcHRpb25zLmhlYWRlcnMsXG4gICAgICBib2R5OiBvcHRpb25zLmJvZHksXG4gICAgICB0aHJvdzogZmFsc2UsXG4gICAgfSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiByZXNwb25zZS5zdGF0dXMsXG4gICAgICBoZWFkZXJzOiByZXNwb25zZS5oZWFkZXJzLFxuICAgICAgYXJyYXlCdWZmZXI6IHJlc3BvbnNlLmFycmF5QnVmZmVyLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGVuY29kZVV0ZjgodmFsdWU6IHN0cmluZykge1xuICAgIGNvbnN0IGJ5dGVzID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKHZhbHVlKTtcbiAgICByZXR1cm4gYnl0ZXMuYnVmZmVyLnNsaWNlKGJ5dGVzLmJ5dGVPZmZzZXQsIGJ5dGVzLmJ5dGVPZmZzZXQgKyBieXRlcy5ieXRlTGVuZ3RoKSBhcyBBcnJheUJ1ZmZlcjtcbiAgfVxuXG4gIHByaXZhdGUgZGVjb2RlVXRmOChidWZmZXI6IEFycmF5QnVmZmVyKSB7XG4gICAgcmV0dXJuIG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShidWZmZXIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjb21wdXRlU2hhMjU2SGV4KGJ1ZmZlcjogQXJyYXlCdWZmZXIpIHtcbiAgICBjb25zdCBkaWdlc3QgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRpZ2VzdChcIlNIQS0yNTZcIiwgYnVmZmVyKTtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShuZXcgVWludDhBcnJheShkaWdlc3QpKVxuICAgICAgLm1hcCgodmFsdWUpID0+IHZhbHVlLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCBcIjBcIikpXG4gICAgICAuam9pbihcIlwiKTtcbiAgfVxufVxuXG50eXBlIFVwbG9hZFJld3JpdGUgPSB7XG4gIG9yaWdpbmFsOiBzdHJpbmc7XG4gIHJld3JpdHRlbjogc3RyaW5nO1xuICBzb3VyY2VGaWxlPzogVEZpbGU7XG59O1xuXG5jbGFzcyBTZWN1cmVXZWJkYXZTZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XG4gIHBsdWdpbjogU2VjdXJlV2ViZGF2SW1hZ2VzUGx1Z2luO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IFNlY3VyZVdlYmRhdkltYWdlc1BsdWdpbikge1xuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgfVxuXG4gIGRpc3BsYXkoKTogdm9pZCB7XG4gICAgY29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xuXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiU2VjdXJlIFdlYkRBViBJbWFnZXNcIiB9KTtcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcInBcIiwge1xuICAgICAgdGV4dDogdGhpcy5wbHVnaW4udChcbiAgICAgICAgXCJcdThGRDlcdTRFMkFcdTYzRDJcdTRFRjZcdTUzRUFcdTYyOEFcdTU2RkVcdTcyNDdcdTUyNjVcdTc5QkJcdTUyMzBcdTUzNTVcdTcyRUNcdTc2ODRcdThGRENcdTdBRUZcdTc2RUVcdTVGNTVcdUZGMENcdTVFNzZcdTRGRERcdTVCNThcdTRFM0Egc2VjdXJlLXdlYmRhdiBcdTgxRUFcdTVCOUFcdTRFNDlcdTRFRTNcdTc4MDFcdTU3NTdcdUZGMUJcdTUxNzZcdTRFRDZcdTdCMTRcdThCQjBcdTU0OENcdTk2NDRcdTRFRjZcdTYzMDlcdTUzOUZcdThERUZcdTVGODRcdTUzOUZcdTY4MzdcdTU0MENcdTZCNjVcdTMwMDJcIixcbiAgICAgICAgXCJUaGlzIHBsdWdpbiBzZXBhcmF0ZXMgb25seSBpbWFnZXMgaW50byBhIGRlZGljYXRlZCByZW1vdGUgZm9sZGVyIGFuZCBzdG9yZXMgdGhlbSBhcyBzZWN1cmUtd2ViZGF2IGN1c3RvbSBjb2RlIGJsb2Nrcy4gTm90ZXMgYW5kIG90aGVyIGF0dGFjaG1lbnRzIGFyZSBzeW5jZWQgYXMtaXMgd2l0aCB0aGVpciBvcmlnaW5hbCBwYXRocy5cIixcbiAgICAgICksXG4gICAgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTVGNTNcdTUyNERcdTYzRDJcdTRFRjZcdTcyNDhcdTY3MkNcIiwgXCJDdXJyZW50IHBsdWdpbiB2ZXJzaW9uXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTU5MUFcdTdBRUZcdTRGN0ZcdTc1MjhcdTY1RjZcdTUzRUZcdTUxNDhcdTY4MzhcdTVCRjlcdThGRDlcdTkxQ0NcdTc2ODRcdTcyNDhcdTY3MkNcdTUzRjdcdUZGMENcdTkwN0ZcdTUxNERcdTU2RTBcdTRFM0FcdTVCQTJcdTYyMzdcdTdBRUZcdTUzNDdcdTdFQTdcdTRFMERcdTUyMzBcdTRGNERcdTVCRkNcdTgxRjRcdTg4NENcdTRFM0FcdTRFMERcdTRFMDBcdTgxRjRcdTMwMDJcIixcbiAgICAgICAgICBcIkNoZWNrIHRoaXMgdmVyc2lvbiBmaXJzdCBhY3Jvc3MgZGV2aWNlcyB0byBhdm9pZCBpbmNvbnNpc3RlbnQgYmVoYXZpb3IgY2F1c2VkIGJ5IGluY29tcGxldGUgdXBncmFkZXMuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT4ge1xuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLm1hbmlmZXN0LnZlcnNpb24pO1xuICAgICAgICB0ZXh0LnNldERpc2FibGVkKHRydWUpO1xuICAgICAgfSk7XG5cbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy5wbHVnaW4udChcIlx1NzU0Q1x1OTc2Mlx1OEJFRFx1OEEwMFwiLCBcIkludGVyZmFjZSBsYW5ndWFnZVwiKSB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1OEJFRFx1OEEwMFwiLCBcIkxhbmd1YWdlXCIpKVxuICAgICAgLnNldERlc2ModGhpcy5wbHVnaW4udChcIlx1OEJCRVx1N0Y2RVx1OTg3NVx1NjUyRlx1NjMwMVx1ODFFQVx1NTJBOFx1MzAwMVx1NEUyRFx1NjU4N1x1MzAwMVx1ODJGMVx1NjU4N1x1NTIwN1x1NjM2Mlx1MzAwMlwiLCBcIlN3aXRjaCB0aGUgc2V0dGluZ3MgVUkgYmV0d2VlbiBhdXRvLCBDaGluZXNlLCBhbmQgRW5nbGlzaC5cIikpXG4gICAgICAuYWRkRHJvcGRvd24oKGRyb3Bkb3duKSA9PlxuICAgICAgICBkcm9wZG93blxuICAgICAgICAgIC5hZGRPcHRpb24oXCJhdXRvXCIsIHRoaXMucGx1Z2luLnQoXCJcdTgxRUFcdTUyQThcIiwgXCJBdXRvXCIpKVxuICAgICAgICAgIC5hZGRPcHRpb24oXCJ6aFwiLCBcIlx1NEUyRFx1NjU4N1wiKVxuICAgICAgICAgIC5hZGRPcHRpb24oXCJlblwiLCBcIkVuZ2xpc2hcIilcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubGFuZ3VhZ2UpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubGFuZ3VhZ2UgPSB2YWx1ZSBhcyBcImF1dG9cIiB8IFwiemhcIiB8IFwiZW5cIjtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMucGx1Z2luLnQoXCJcdThGREVcdTYzQTVcdThCQkVcdTdGNkVcIiwgXCJDb25uZWN0aW9uXCIpIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiV2ViREFWIFx1NTdGQVx1Nzg0MFx1NTczMFx1NTc0MFwiLCBcIldlYkRBViBiYXNlIFVSTFwiKSlcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdTY3MERcdTUyQTFcdTU2NjhcdTU3RkFcdTc4NDBcdTU3MzBcdTU3NDBcdUZGMENcdTRGOEJcdTU5ODJcdUZGMUFodHRwOi8veW91ci13ZWJkYXYtaG9zdDpwb3J0XCIsIFwiQmFzZSBzZXJ2ZXIgVVJMLiBFeGFtcGxlOiBodHRwOi8veW91ci13ZWJkYXYtaG9zdDpwb3J0XCIpKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJodHRwOi8veW91ci13ZWJkYXYtaG9zdDpwb3J0XCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLndlYmRhdlVybClcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy53ZWJkYXZVcmwgPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdThEMjZcdTUzRjdcIiwgXCJVc2VybmFtZVwiKSlcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZXJuYW1lKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VybmFtZSA9IHZhbHVlLnRyaW0oKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU1QkM2XHU3ODAxXCIsIFwiUGFzc3dvcmRcIikpXG4gICAgICAuc2V0RGVzYyh0aGlzLnBsdWdpbi50KFwiXHU5RUQ4XHU4QkE0XHU5NjkwXHU4NUNGXHVGRjBDXHU1M0VGXHU3MEI5XHU1MUZCXHU1M0YzXHU0RkE3XHU2MzA5XHU5NEFFXHU2NjNFXHU3OTNBXHU2MjE2XHU5NjkwXHU4NUNGXHUzMDAyXCIsIFwiSGlkZGVuIGJ5IGRlZmF1bHQuIFVzZSB0aGUgYnV0dG9uIG9uIHRoZSByaWdodCB0byBzaG93IG9yIGhpZGUgaXQuXCIpKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+IHtcbiAgICAgICAgdGV4dC5pbnB1dEVsLnR5cGUgPSBcInBhc3N3b3JkXCI7XG4gICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucGFzc3dvcmQpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnBhc3N3b3JkID0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC5hZGRFeHRyYUJ1dHRvbigoYnV0dG9uKSA9PiB7XG4gICAgICAgIGxldCB2aXNpYmxlID0gZmFsc2U7XG4gICAgICAgIGJ1dHRvbi5zZXRJY29uKFwiZXllXCIpO1xuICAgICAgICBidXR0b24uc2V0VG9vbHRpcCh0aGlzLnBsdWdpbi50KFwiXHU2NjNFXHU3OTNBXHU1QkM2XHU3ODAxXCIsIFwiU2hvdyBwYXNzd29yZFwiKSk7XG4gICAgICAgIGJ1dHRvbi5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICBjb25zdCBpbnB1dCA9IGJ1dHRvbi5leHRyYVNldHRpbmdzRWwucGFyZW50RWxlbWVudD8ucXVlcnlTZWxlY3RvcihcImlucHV0XCIpO1xuICAgICAgICAgIGlmICghKGlucHV0IGluc3RhbmNlb2YgSFRNTElucHV0RWxlbWVudCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB2aXNpYmxlID0gIXZpc2libGU7XG4gICAgICAgICAgaW5wdXQudHlwZSA9IHZpc2libGUgPyBcInRleHRcIiA6IFwicGFzc3dvcmRcIjtcbiAgICAgICAgICBidXR0b24uc2V0SWNvbih2aXNpYmxlID8gXCJleWUtb2ZmXCIgOiBcImV5ZVwiKTtcbiAgICAgICAgICBidXR0b24uc2V0VG9vbHRpcCh0aGlzLnBsdWdpbi50KHZpc2libGUgPyBcIlx1OTY5MFx1ODVDRlx1NUJDNlx1NzgwMVwiIDogXCJcdTY2M0VcdTc5M0FcdTVCQzZcdTc4MDFcIiwgdmlzaWJsZSA/IFwiSGlkZSBwYXNzd29yZFwiIDogXCJTaG93IHBhc3N3b3JkXCIpKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NTZGRVx1NzI0N1x1OEZEQ1x1N0EwQlx1NzZFRVx1NUY1NVwiLCBcIkltYWdlIHJlbW90ZSBmb2xkZXJcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1NEUxM1x1OTVFOFx1NzUyOFx1NEU4RVx1NUI1OFx1NjUzRVx1OEZEQ1x1N0EwQlx1NTZGRVx1NzI0N1x1NzY4NCBXZWJEQVYgXHU3NkVFXHU1RjU1XHVGRjBDXHU0RjhCXHU1OTgyXHVGRjFBL3JlbW90ZS1pbWFnZXMvXHUzMDAyXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU2MjEwXHU1MjlGXHU1NDBFXHU0RjFBXHU3QUNCXHU1MzczXHU1MjIwXHU5NjY0XHU2NzJDXHU1NzMwXHU1NkZFXHU3MjQ3XHU2NTg3XHU0RUY2XHUzMDAyXCIsXG4gICAgICAgICAgXCJEZWRpY2F0ZWQgV2ViREFWIGZvbGRlciBmb3IgcmVtb3RlIGltYWdlcywgZm9yIGV4YW1wbGU6IC9yZW1vdGUtaW1hZ2VzLy4gTG9jYWwgaW1hZ2UgZmlsZXMgYXJlIGRlbGV0ZWQgaW1tZWRpYXRlbHkgYWZ0ZXIgdXBsb2FkIHN1Y2NlZWRzLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucmVtb3RlRm9sZGVyKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZW1vdGVGb2xkZXIgPSBub3JtYWxpemVQYXRoKHZhbHVlLnRyaW0oKSB8fCBcIi9yZW1vdGUtaW1hZ2VzL1wiKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU2RDRCXHU4QkQ1XHU4RkRFXHU2M0E1XCIsIFwiVGVzdCBjb25uZWN0aW9uXCIpKVxuICAgICAgLnNldERlc2ModGhpcy5wbHVnaW4udChcIlx1NEY3Rlx1NzUyOFx1NEUzNFx1NjVGNlx1NjNBMlx1OTQ4OFx1NjU4N1x1NEVGNlx1OUE4Q1x1OEJDMSBQVVRcdTMwMDFHRVRcdTMwMDFERUxFVEUgXHU2NjJGXHU1NDI2XHU2QjYzXHU1RTM4XHUzMDAyXCIsIFwiVmVyaWZ5IFBVVCwgR0VULCBhbmQgREVMRVRFIHVzaW5nIGEgdGVtcG9yYXJ5IHByb2JlIGZpbGUuXCIpKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dCh0aGlzLnBsdWdpbi50KFwiXHU1RjAwXHU1OUNCXHU2RDRCXHU4QkQ1XCIsIFwiUnVuIHRlc3RcIikpLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZCh0cnVlKTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ucnVuQ29ubmVjdGlvblRlc3QodHJ1ZSk7XG4gICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZChmYWxzZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy5wbHVnaW4udChcIlx1NTQwQ1x1NkI2NVx1OEJCRVx1N0Y2RVwiLCBcIlN5bmNcIikgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdThGRENcdTdBMEJcdTdCMTRcdThCQjBcdTc2RUVcdTVGNTVcIiwgXCJSZW1vdGUgbm90ZXMgZm9sZGVyXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTc1MjhcdTRFOEVcdTVCNThcdTY1M0VcdTdCMTRcdThCQjBcdTU0OENcdTUxNzZcdTRFRDZcdTk3NUVcdTU2RkVcdTcyNDdcdTk2NDRcdTRFRjZcdTUzOUZcdTY4MzdcdTU0MENcdTZCNjVcdTUyNkZcdTY3MkNcdTc2ODRcdThGRENcdTdBRUZcdTc2RUVcdTVGNTVcdUZGMENcdTRGOEJcdTU5ODJcdUZGMUEvdmF1bHQtc3luYy9cdTMwMDJcdTYzRDJcdTRFRjZcdTRGMUFcdTgxRUFcdTUyQThcdTU0MENcdTZCNjVcdTY1NzRcdTRFMkEgdmF1bHRcdUZGMENcdTVFNzZcdThERjNcdThGQzcgLm9ic2lkaWFuXHUzMDAxXHU2M0QyXHU0RUY2XHU3NkVFXHU1RjU1XHU1NDhDXHU1NkZFXHU3MjQ3XHU2NTg3XHU0RUY2XHUzMDAyXCIsXG4gICAgICAgICAgXCJSZW1vdGUgZm9sZGVyIHVzZWQgZm9yIG5vdGVzIGFuZCBvdGhlciBub24taW1hZ2UgYXR0YWNobWVudHMgc3luY2VkIGFzLWlzLCBmb3IgZXhhbXBsZTogL3ZhdWx0LXN5bmMvLiBUaGUgcGx1Z2luIHN5bmNzIHRoZSB3aG9sZSB2YXVsdCBhbmQgYXV0b21hdGljYWxseSBza2lwcyAub2JzaWRpYW4sIHRoZSBwbHVnaW4gZGlyZWN0b3J5LCBhbmQgaW1hZ2UgZmlsZXMuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnZhdWx0U3luY1JlbW90ZUZvbGRlciA9IG5vcm1hbGl6ZVBhdGgodmFsdWUudHJpbSgpIHx8IFwiL3ZhdWx0LXN5bmMvXCIpO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTRFMERcdTU0MENcdTZCNjVcdTc2RUVcdTVGNTVcIiwgXCJFeGNsdWRlZCBzeW5jIGZvbGRlcnNcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1OEZEOVx1NEU5QiB2YXVsdCBcdTc2RUVcdTVGNTVcdTRFMERcdTRGMUFcdTg4QUJcdTUxODVcdTVCQjlcdTU0MENcdTZCNjVcdTRFMEFcdTRGMjBcdTMwMDFcdTRFQ0VcdThGRENcdTdBRUZcdTYwNjJcdTU5MERcdTYyMTZcdThGREJcdTg4NENcdTc2RUVcdTVGNTVcdTVCRjlcdThEMjZcdTMwMDJcdTY1MkZcdTYzMDFcdTkwMTdcdTUzRjdcdTYyMTZcdTYzNjJcdTg4NENcdTUyMDZcdTk2OTRcdUZGMENcdTlFRDhcdThCQTRcdUZGMUFrYlx1MzAwMlwiLFxuICAgICAgICAgIFwiVGhlc2UgdmF1bHQgZm9sZGVycyBhcmUgbm90IHVwbG9hZGVkLCByZXN0b3JlZCBmcm9tIHJlbW90ZSwgb3IgcmVjb25jaWxlZCBhcyBkaXJlY3Rvcmllcy4gU2VwYXJhdGUgZW50cmllcyB3aXRoIGNvbW1hcyBvciBuZXcgbGluZXMuIERlZmF1bHQ6IGtiLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHRBcmVhKCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwia2JcIilcbiAgICAgICAgICAuc2V0VmFsdWUoKHRoaXMucGx1Z2luLnNldHRpbmdzLmV4Y2x1ZGVkU3luY0ZvbGRlcnMgPz8gW10pLmpvaW4oXCJcXG5cIikpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZXhjbHVkZWRTeW5jRm9sZGVycyA9IHZhbHVlLnNwbGl0KC9bLFxcbl0vKTtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLm5vcm1hbGl6ZUVmZmVjdGl2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTgxRUFcdTUyQThcdTU0MENcdTZCNjVcdTk4OTFcdTczODdcIiwgXCJBdXRvIHN5bmMgZnJlcXVlbmN5XCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTRFRTVcdTUyMDZcdTk0OUZcdTRFM0FcdTUzNTVcdTRGNERcdThCQkVcdTdGNkVcdTgxRUFcdTUyQThcdTU0MENcdTZCNjVcdTY1RjZcdTk1RjRcdTMwMDJcdTU4NkIgMCBcdTg4NjhcdTc5M0FcdTUxNzNcdTk1RURcdTgxRUFcdTUyQThcdTU0MENcdTZCNjVcdTMwMDJcdThGRDlcdTkxQ0NcdTc2ODRcdTU0MENcdTZCNjVcdTY2MkZcdTIwMUNcdTVCRjlcdThEMjZcdTU0MENcdTZCNjVcdTIwMURcdUZGMUFcdTRGMUFcdTY4QzBcdTY3RTVcdTY3MkNcdTU3MzBcdTRFMEVcdThGRENcdTdBRUZcdTc2RUVcdTVGNTVcdTVERUVcdTVGMDJcdUZGMENcdTg4NjVcdTRGMjBcdTY1QjBcdTU4OUVcdTU0OENcdTUzRDhcdTY2RjRcdTY1ODdcdTRFRjZcdUZGMENcdTVFNzZcdTUyMjBcdTk2NjRcdThGRENcdTdBRUZcdTU5MUFcdTRGNTlcdTUxODVcdTVCQjlcdTMwMDJcIixcbiAgICAgICAgICBcIlNldCB0aGUgYXV0b21hdGljIHN5bmMgaW50ZXJ2YWwgaW4gbWludXRlcy4gVXNlIDAgdG8gdHVybiBpdCBvZmYuIFRoaXMgaXMgYSByZWNvbmNpbGlhdGlvbiBzeW5jOiBpdCBjaGVja3MgbG9jYWwgYW5kIHJlbW90ZSBkaWZmZXJlbmNlcywgdXBsb2FkcyBuZXcgb3IgY2hhbmdlZCBmaWxlcywgYW5kIHJlbW92ZXMgZXh0cmEgcmVtb3RlIGNvbnRlbnQuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcIjBcIilcbiAgICAgICAgICAuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzKSlcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXJzZWQgPSBOdW1iZXIucGFyc2VJbnQodmFsdWUsIDEwKTtcbiAgICAgICAgICAgIGlmICghTnVtYmVyLmlzTmFOKHBhcnNlZCkpIHtcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXMgPSBNYXRoLm1heCgwLCBwYXJzZWQpO1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTdCMTRcdThCQjBcdTY3MkNcdTU3MzBcdTRGRERcdTc1NTlcdTZBMjFcdTVGMEZcIiwgXCJOb3RlIGxvY2FsIHJldGVudGlvbiBtb2RlXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTVCOENcdTY1NzRcdTY3MkNcdTU3MzBcdUZGMUFcdTdCMTRcdThCQjBcdTU5Q0JcdTdFQzhcdTRGRERcdTc1NTlcdTU3MjhcdTY3MkNcdTU3MzBcdTMwMDJcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTdCMTRcdThCQjBcdUZGMUFcdTk1N0ZcdTY3MUZcdTY3MkFcdThCQkZcdTk1RUVcdTc2ODQgTWFya2Rvd24gXHU3QjE0XHU4QkIwXHU0RjFBXHU4OEFCXHU2NkZGXHU2MzYyXHU0RTNBXHU2NzJDXHU1NzMwXHU1MzYwXHU0RjREXHU2NTg3XHU0RUY2XHVGRjBDXHU2MjUzXHU1RjAwXHU2NUY2XHU1MThEXHU0RUNFXHU4RkRDXHU3QUVGXHU2MDYyXHU1OTBEXHUzMDAyXCIsXG4gICAgICAgICAgXCJGdWxsIGxvY2FsOiBub3RlcyBhbHdheXMgc3RheSBsb2NhbC4gTGF6eSBub3Rlczogc3RhbGUgTWFya2Rvd24gbm90ZXMgYXJlIHJlcGxhY2VkIHdpdGggbG9jYWwgcGxhY2Vob2xkZXIgZmlsZXMgYW5kIHJlc3RvcmVkIGZyb20gcmVtb3RlIHdoZW4gb3BlbmVkLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZERyb3Bkb3duKChkcm9wZG93bikgPT5cbiAgICAgICAgZHJvcGRvd25cbiAgICAgICAgICAuYWRkT3B0aW9uKFwiZnVsbC1sb2NhbFwiLCB0aGlzLnBsdWdpbi50KFwiXHU1QjhDXHU2NTc0XHU2NzJDXHU1NzMwXCIsIFwiRnVsbCBsb2NhbFwiKSlcbiAgICAgICAgICAuYWRkT3B0aW9uKFwibGF6eS1ub3Rlc1wiLCB0aGlzLnBsdWdpbi50KFwiXHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXCIsIFwiTGF6eSBub3Rlc1wiKSlcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mubm90ZVN0b3JhZ2VNb2RlKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVTdG9yYWdlTW9kZSA9IHZhbHVlIGFzIFwiZnVsbC1sb2NhbFwiIHwgXCJsYXp5LW5vdGVzXCI7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTdCMTRcdThCQjBcdTY3MkNcdTU3MzBcdTU2REVcdTY1MzZcdTU5MjlcdTY1NzBcIiwgXCJOb3RlIGV2aWN0aW9uIGRheXNcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1NEVDNVx1NTcyOFx1MjAxQ1x1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFx1MjAxRFx1NkEyMVx1NUYwRlx1NEUwQlx1NzUxRlx1NjU0OFx1MzAwMlx1OEQ4NVx1OEZDN1x1OEZEOVx1NEUyQVx1NTkyOVx1NjU3MFx1NjcyQVx1NjI1M1x1NUYwMFx1NzY4NCBNYXJrZG93biBcdTdCMTRcdThCQjBcdUZGMENcdTRGMUFcdTU3MjhcdTU0MENcdTZCNjVcdTU0MEVcdTg4QUJcdTY2RkZcdTYzNjJcdTRFM0FcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTY1ODdcdTRFRjZcdTMwMDJcIixcbiAgICAgICAgICBcIlVzZWQgb25seSBpbiBsYXp5IG5vdGUgbW9kZS4gTWFya2Rvd24gbm90ZXMgbm90IG9wZW5lZCB3aXRoaW4gdGhpcyBudW1iZXIgb2YgZGF5cyBhcmUgcmVwbGFjZWQgd2l0aCBsb2NhbCBwbGFjZWhvbGRlciBmaWxlcyBhZnRlciBzeW5jLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCIzMFwiKVxuICAgICAgICAgIC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4uc2V0dGluZ3Mubm90ZUV2aWN0QWZ0ZXJEYXlzKSlcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXJzZWQgPSBOdW1iZXIucGFyc2VJbnQodmFsdWUsIDEwKTtcbiAgICAgICAgICAgIGlmICghTnVtYmVyLmlzTmFOKHBhcnNlZCkpIHtcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Mubm90ZUV2aWN0QWZ0ZXJEYXlzID0gTWF0aC5tYXgoMSwgcGFyc2VkKTtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU1NDBDXHU2QjY1XHU3MkI2XHU2MDAxXCIsIFwiU3luYyBzdGF0dXNcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBgJHt0aGlzLnBsdWdpbi5mb3JtYXRMYXN0U3luY0xhYmVsKCl9XFxuJHt0aGlzLnBsdWdpbi5mb3JtYXRTeW5jU3RhdHVzTGFiZWwoKX1cXG4ke3RoaXMucGx1Z2luLnQoXCJcdThCRjRcdTY2MEVcdUZGMUFcdTVGRUJcdTkwMUZcdTU0MENcdTZCNjVcdTUzRUFcdTU5MDRcdTc0MDZcdTY3MkNcdTY3M0FcdTUzRDhcdTY2RjRcdTk2MUZcdTUyMTdcdUZGMUJcdTVCOENcdTY1NzRcdTVCRjlcdThEMjZcdTRGMUFcdTYyNkJcdTYzQ0ZcdTY3MkNcdTU3MzBcdTRFMEVcdThGRENcdTdBRUZcdTVERUVcdTVGMDJcdTVFNzZcdTZFMDVcdTc0MDZcdThGRENcdTdBRUZcdTUxOTdcdTRGNTlcdTUxODVcdTVCQjlcdTMwMDJcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTRFQ0RcdTc1MzFcdTcyRUNcdTdBQ0JcdTk2MUZcdTUyMTdcdTU5MDRcdTc0MDZcdTMwMDJcIiwgXCJOb3RlOiBGYXN0IHN5bmMgb25seSBwcm9jZXNzZXMgbG9jYWxseSBjaGFuZ2VkIHBhdGhzLiBGdWxsIHJlY29uY2lsZSBzY2FucyBsb2NhbCBhbmQgcmVtb3RlIGRpZmZlcmVuY2VzIGFuZCBjbGVhbnMgZXh0cmEgcmVtb3RlIGNvbnRlbnQuIEltYWdlIHVwbG9hZHMgY29udGludWUgdG8gYmUgaGFuZGxlZCBieSB0aGUgc2VwYXJhdGUgcXVldWUuXCIpfWAsXG4gICAgICAgICAgYCR7dGhpcy5wbHVnaW4uZm9ybWF0TGFzdFN5bmNMYWJlbCgpfVxcbiR7dGhpcy5wbHVnaW4uZm9ybWF0U3luY1N0YXR1c0xhYmVsKCl9XFxuJHt0aGlzLnBsdWdpbi50KFwiXHU4QkY0XHU2NjBFXHVGRjFBXHU1RkVCXHU5MDFGXHU1NDBDXHU2QjY1XHU1M0VBXHU1OTA0XHU3NDA2XHU2NzJDXHU2NzNBXHU1M0Q4XHU2NkY0XHU5NjFGXHU1MjE3XHVGRjFCXHU1QjhDXHU2NTc0XHU1QkY5XHU4RDI2XHU0RjFBXHU2MjZCXHU2M0NGXHU2NzJDXHU1NzMwXHU0RTBFXHU4RkRDXHU3QUVGXHU1REVFXHU1RjAyXHU1RTc2XHU2RTA1XHU3NDA2XHU4RkRDXHU3QUVGXHU1MTk3XHU0RjU5XHU1MTg1XHU1QkI5XHUzMDAyXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU0RUNEXHU3NTMxXHU3MkVDXHU3QUNCXHU5NjFGXHU1MjE3XHU1OTA0XHU3NDA2XHUzMDAyXCIsIFwiTm90ZTogRmFzdCBzeW5jIG9ubHkgcHJvY2Vzc2VzIGxvY2FsbHkgY2hhbmdlZCBwYXRocy4gRnVsbCByZWNvbmNpbGUgc2NhbnMgbG9jYWwgYW5kIHJlbW90ZSBkaWZmZXJlbmNlcyBhbmQgY2xlYW5zIGV4dHJhIHJlbW90ZSBjb250ZW50LiBJbWFnZSB1cGxvYWRzIGNvbnRpbnVlIHRvIGJlIGhhbmRsZWQgYnkgdGhlIHNlcGFyYXRlIHF1ZXVlLlwiKX1gLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dCh0aGlzLnBsdWdpbi50KFwiXHU1RkVCXHU5MDFGXHU1NDBDXHU2QjY1XCIsIFwiRmFzdCBzeW5jXCIpKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnN5bmNQZW5kaW5nVmF1bHRDb250ZW50KHRydWUpO1xuICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZChmYWxzZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KSxcbiAgICAgIClcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodGhpcy5wbHVnaW4udChcIlx1NUI4Q1x1NjU3NFx1NUJGOVx1OEQyNlwiLCBcIkZ1bGwgcmVjb25jaWxlXCIpKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50KHRydWUpO1xuICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZChmYWxzZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy5wbHVnaW4udChcIlx1NEUwMFx1NkIyMVx1NjAyN1x1NURFNVx1NTE3N1wiLCBcIk9uZS10aW1lIHRvb2xzXCIpIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU4RkMxXHU3OUZCXHU2NTc0XHU1RTkzXHU1MzlGXHU3NTFGXHU1NkZFXHU3MjQ3XHU1RjE1XHU3NTI4XCIsIFwiTWlncmF0ZSBuYXRpdmUgaW1hZ2UgZW1iZWRzIGluIHZhdWx0XCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTYyNkJcdTYzQ0ZcdTY1NzRcdTVFOTNcdTYyNDBcdTY3MDkgTWFya2Rvd24gXHU3QjE0XHU4QkIwXHVGRjBDXHU2MjhBIE9ic2lkaWFuIFx1NTM5Rlx1NzUxRlx1NjcyQ1x1NTczMFx1NTZGRVx1NzI0N1x1NUYxNVx1NzUyOFx1RkYwOFx1NTk4MiAhW10oKSBcdTU0OEMgIVtbLi4uXV1cdUZGMDlcdTRFMEFcdTRGMjBcdTUyMzBcdThGRENcdTdBRUZcdTU2RkVcdTcyNDdcdTc2RUVcdTVGNTVcdUZGMENcdTVFNzZcdTY1MzlcdTUxOTlcdTRFM0Egc2VjdXJlLXdlYmRhdiBcdTRFRTNcdTc4MDFcdTU3NTdcdTMwMDJcdTY1RTdcdTcyNDggc3BhbiBcdTU0OENcdTY1RTlcdTY3MUYgd2ViZGF2LXNlY3VyZSBcdTk0RkVcdTYzQTVcdTRFNUZcdTRGMUFcdTRFMDBcdTVFNzZcdTY1MzZcdTY1NUJcdTUyMzBcdTY1QjBcdTY4M0NcdTVGMEZcdTMwMDJcIixcbiAgICAgICAgICBcIlNjYW4gYWxsIE1hcmtkb3duIG5vdGVzIGluIHRoZSB2YXVsdCwgdXBsb2FkIG5hdGl2ZSBsb2NhbCBpbWFnZSBlbWJlZHMgKHN1Y2ggYXMgIVtdKCkgYW5kICFbWy4uLl1dKSB0byB0aGUgcmVtb3RlIGltYWdlIGZvbGRlciwgYW5kIHJld3JpdGUgdGhlbSBhcyBzZWN1cmUtd2ViZGF2IGNvZGUgYmxvY2tzLiBMZWdhY3kgc3BhbiB0YWdzIGFuZCBlYXJseSB3ZWJkYXYtc2VjdXJlIGxpbmtzIGFyZSBhbHNvIG5vcm1hbGl6ZWQgdG8gdGhlIG5ldyBmb3JtYXQuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KHRoaXMucGx1Z2luLnQoXCJcdTVGMDBcdTU5Q0JcdThGQzFcdTc5RkJcIiwgXCJSdW4gbWlncmF0aW9uXCIpKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQodHJ1ZSk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLm1pZ3JhdGVBbGxMZWdhY3lTZWN1cmVJbWFnZXMoKTtcbiAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKGZhbHNlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgfVxufVxuXG5jbGFzcyBSZXN1bHRNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgcHJpdmF0ZSByZWFkb25seSB0aXRsZVRleHQ6IHN0cmluZztcbiAgcHJpdmF0ZSByZWFkb25seSBib2R5VGV4dDogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCB0aXRsZVRleHQ6IHN0cmluZywgYm9keVRleHQ6IHN0cmluZykge1xuICAgIHN1cGVyKGFwcCk7XG4gICAgdGhpcy50aXRsZVRleHQgPSB0aXRsZVRleHQ7XG4gICAgdGhpcy5ib2R5VGV4dCA9IGJvZHlUZXh0O1xuICB9XG5cbiAgb25PcGVuKCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy50aXRsZVRleHQgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IHRoaXMuYm9keVRleHQgfSk7XG4gIH1cblxuICBvbkNsb3NlKCk6IHZvaWQge1xuICAgIHRoaXMuY29udGVudEVsLmVtcHR5KCk7XG4gIH1cbn1cbiIsICJpbXBvcnQgeyBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0LCBNYXJrZG93blJlbmRlckNoaWxkIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmV4cG9ydCBjb25zdCBTRUNVUkVfUFJPVE9DT0wgPSBcIndlYmRhdi1zZWN1cmU6XCI7XG5leHBvcnQgY29uc3QgU0VDVVJFX0NPREVfQkxPQ0sgPSBcInNlY3VyZS13ZWJkYXZcIjtcblxuZXhwb3J0IHR5cGUgU2VjdXJlV2ViZGF2SW1hZ2VCbG9jayA9IHtcbiAgcGF0aDogc3RyaW5nO1xuICBhbHQ6IHN0cmluZztcbn07XG5cbnR5cGUgU2VjdXJlV2ViZGF2SW1hZ2VTdXBwb3J0RGVwcyA9IHtcbiAgdDogKHpoOiBzdHJpbmcsIGVuOiBzdHJpbmcpID0+IHN0cmluZztcbiAgZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmw6IChyZW1vdGVQYXRoOiBzdHJpbmcpID0+IFByb21pc2U8c3RyaW5nPjtcbn07XG5cbmNsYXNzIFNlY3VyZVdlYmRhdlJlbmRlckNoaWxkIGV4dGVuZHMgTWFya2Rvd25SZW5kZXJDaGlsZCB7XG4gIGNvbnN0cnVjdG9yKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIHN1cGVyKGNvbnRhaW5lckVsKTtcbiAgfVxuXG4gIG9udW5sb2FkKCk6IHZvaWQge31cbn1cblxuLy8gS2VlcCBzZWN1cmUgaW1hZ2UgcGFyc2luZyBhbmQgcmVuZGVyaW5nIGlzb2xhdGVkIHNvIHN5bmMgY2hhbmdlcyBkbyBub3Rcbi8vIGFjY2lkZW50YWxseSBicmVhayB0aGUgZGlzcGxheSBwaXBlbGluZSBhZ2Fpbi5cbmV4cG9ydCBjbGFzcyBTZWN1cmVXZWJkYXZJbWFnZVN1cHBvcnQge1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGRlcHM6IFNlY3VyZVdlYmRhdkltYWdlU3VwcG9ydERlcHMpIHt9XG5cbiAgYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmw6IHN0cmluZywgYWx0OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5leHRyYWN0UmVtb3RlUGF0aChyZW1vdGVVcmwpO1xuICAgIGlmICghcmVtb3RlUGF0aCkge1xuICAgICAgcmV0dXJuIGAhW10oJHtyZW1vdGVVcmx9KWA7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayhyZW1vdGVQYXRoLCBhbHQpO1xuICB9XG5cbiAgYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayhyZW1vdGVQYXRoOiBzdHJpbmcsIGFsdDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZEFsdCA9IChhbHQgfHwgcmVtb3RlUGF0aCkucmVwbGFjZSgvXFxyP1xcbi9nLCBcIiBcIikudHJpbSgpO1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gcmVtb3RlUGF0aC5yZXBsYWNlKC9cXHI/XFxuL2csIFwiXCIpLnRyaW0oKTtcbiAgICByZXR1cm4gW2BcXGBcXGBcXGAke1NFQ1VSRV9DT0RFX0JMT0NLfWAsIGBwYXRoOiAke25vcm1hbGl6ZWRQYXRofWAsIGBhbHQ6ICR7bm9ybWFsaXplZEFsdH1gLCBcImBgYFwiXS5qb2luKFwiXFxuXCIpO1xuICB9XG5cbiAgcGFyc2VTZWN1cmVJbWFnZUJsb2NrKHNvdXJjZTogc3RyaW5nKTogU2VjdXJlV2ViZGF2SW1hZ2VCbG9jayB8IG51bGwge1xuICAgIGNvbnN0IHJlc3VsdDogU2VjdXJlV2ViZGF2SW1hZ2VCbG9jayA9IHsgcGF0aDogXCJcIiwgYWx0OiBcIlwiIH07XG4gICAgZm9yIChjb25zdCByYXdMaW5lIG9mIHNvdXJjZS5zcGxpdCgvXFxyP1xcbi8pKSB7XG4gICAgICBjb25zdCBsaW5lID0gcmF3TGluZS50cmltKCk7XG4gICAgICBpZiAoIWxpbmUpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHNlcGFyYXRvckluZGV4ID0gbGluZS5pbmRleE9mKFwiOlwiKTtcbiAgICAgIGlmIChzZXBhcmF0b3JJbmRleCA9PT0gLTEpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGtleSA9IGxpbmUuc2xpY2UoMCwgc2VwYXJhdG9ySW5kZXgpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgY29uc3QgdmFsdWUgPSBsaW5lLnNsaWNlKHNlcGFyYXRvckluZGV4ICsgMSkudHJpbSgpO1xuICAgICAgaWYgKGtleSA9PT0gXCJwYXRoXCIpIHtcbiAgICAgICAgcmVzdWx0LnBhdGggPSB2YWx1ZTtcbiAgICAgIH0gZWxzZSBpZiAoa2V5ID09PSBcImFsdFwiKSB7XG4gICAgICAgIHJlc3VsdC5hbHQgPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0LnBhdGggPyByZXN1bHQgOiBudWxsO1xuICB9XG5cbiAgYXN5bmMgcHJvY2Vzc1NlY3VyZUltYWdlcyhlbDogSFRNTEVsZW1lbnQsIGN0eDogTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dCkge1xuICAgIGNvbnN0IHNlY3VyZUNvZGVCbG9ja3MgPSBBcnJheS5mcm9tKGVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KGBwcmUgPiBjb2RlLmxhbmd1YWdlLSR7U0VDVVJFX0NPREVfQkxPQ0t9YCkpO1xuICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgc2VjdXJlQ29kZUJsb2Nrcy5tYXAoYXN5bmMgKGNvZGVFbCkgPT4ge1xuICAgICAgICBjb25zdCBwcmUgPSBjb2RlRWwucGFyZW50RWxlbWVudDtcbiAgICAgICAgaWYgKCEocHJlIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHx8IHByZS5oYXNBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXYtcmVuZGVyZWRcIikpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwYXJzZWQgPSB0aGlzLnBhcnNlU2VjdXJlSW1hZ2VCbG9jayhjb2RlRWwudGV4dENvbnRlbnQgPz8gXCJcIik7XG4gICAgICAgIGlmICghcGFyc2VkPy5wYXRoKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgcHJlLnNldEF0dHJpYnV0ZShcImRhdGEtc2VjdXJlLXdlYmRhdi1yZW5kZXJlZFwiLCBcInRydWVcIik7XG4gICAgICAgIGF3YWl0IHRoaXMucmVuZGVyU2VjdXJlSW1hZ2VJbnRvRWxlbWVudChwcmUsIHBhcnNlZC5wYXRoLCBwYXJzZWQuYWx0IHx8IHBhcnNlZC5wYXRoKTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zdCBzZWN1cmVOb2RlcyA9IEFycmF5LmZyb20oZWwucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXCJbZGF0YS1zZWN1cmUtd2ViZGF2XVwiKSk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICBzZWN1cmVOb2Rlcy5tYXAoYXN5bmMgKG5vZGUpID0+IHtcbiAgICAgICAgaWYgKG5vZGUgaW5zdGFuY2VvZiBIVE1MSW1hZ2VFbGVtZW50KSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5zd2FwSW1hZ2VTb3VyY2Uobm9kZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IG5vZGUuZ2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2XCIpO1xuICAgICAgICBpZiAoIXJlbW90ZVBhdGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xuICAgICAgICBpbWcuYWx0ID0gbm9kZS5nZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIpID8/IG5vZGUuZ2V0QXR0cmlidXRlKFwiYWx0XCIpID8/IFwiU2VjdXJlIFdlYkRBViBpbWFnZVwiO1xuICAgICAgICBpbWcuc2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2XCIsIHJlbW90ZVBhdGgpO1xuICAgICAgICBpbWcuY2xhc3NMaXN0LmFkZChcInNlY3VyZS13ZWJkYXYtaW1hZ2VcIiwgXCJpcy1sb2FkaW5nXCIpO1xuICAgICAgICBub2RlLnJlcGxhY2VXaXRoKGltZyk7XG4gICAgICAgIGF3YWl0IHRoaXMuc3dhcEltYWdlU291cmNlKGltZyk7XG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgY29uc3Qgc2VjdXJlTGlua3MgPSBBcnJheS5mcm9tKGVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEltYWdlRWxlbWVudD4oYGltZ1tzcmNePVwiJHtTRUNVUkVfUFJPVE9DT0x9Ly9cIl1gKSk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoc2VjdXJlTGlua3MubWFwKGFzeW5jIChpbWcpID0+IHRoaXMuc3dhcEltYWdlU291cmNlKGltZykpKTtcblxuICAgIGN0eC5hZGRDaGlsZChuZXcgU2VjdXJlV2ViZGF2UmVuZGVyQ2hpbGQoZWwpKTtcbiAgfVxuXG4gIGFzeW5jIHByb2Nlc3NTZWN1cmVDb2RlQmxvY2soc291cmNlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCwgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0KSB7XG4gICAgY29uc3QgcGFyc2VkID0gdGhpcy5wYXJzZVNlY3VyZUltYWdlQmxvY2soc291cmNlKTtcbiAgICBpZiAoIXBhcnNlZD8ucGF0aCkge1xuICAgICAgZWwuY3JlYXRlRWwoXCJkaXZcIiwge1xuICAgICAgICB0ZXh0OiB0aGlzLmRlcHMudChcIlx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NEVFM1x1NzgwMVx1NTc1N1x1NjgzQ1x1NUYwRlx1NjVFMFx1NjU0OFx1MzAwMlwiLCBcIkludmFsaWQgc2VjdXJlIGltYWdlIGNvZGUgYmxvY2sgZm9ybWF0LlwiKSxcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMucmVuZGVyU2VjdXJlSW1hZ2VJbnRvRWxlbWVudChlbCwgcGFyc2VkLnBhdGgsIHBhcnNlZC5hbHQgfHwgcGFyc2VkLnBhdGgpO1xuICAgIGN0eC5hZGRDaGlsZChuZXcgU2VjdXJlV2ViZGF2UmVuZGVyQ2hpbGQoZWwpKTtcbiAgfVxuXG4gIGV4dHJhY3RSZW1vdGVQYXRoKHNyYzogc3RyaW5nKSB7XG4gICAgY29uc3QgcHJlZml4ID0gYCR7U0VDVVJFX1BST1RPQ09MfS8vYDtcbiAgICBpZiAoIXNyYy5zdGFydHNXaXRoKHByZWZpeCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiBzcmMuc2xpY2UocHJlZml4Lmxlbmd0aCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlbmRlclNlY3VyZUltYWdlSW50b0VsZW1lbnQoZWw6IEhUTUxFbGVtZW50LCByZW1vdGVQYXRoOiBzdHJpbmcsIGFsdDogc3RyaW5nKSB7XG4gICAgY29uc3QgaW1nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImltZ1wiKTtcbiAgICBpbWcuYWx0ID0gYWx0O1xuICAgIGltZy5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXZcIiwgcmVtb3RlUGF0aCk7XG4gICAgaW1nLmNsYXNzTGlzdC5hZGQoXCJzZWN1cmUtd2ViZGF2LWltYWdlXCIsIFwiaXMtbG9hZGluZ1wiKTtcbiAgICBlbC5lbXB0eSgpO1xuICAgIGVsLmFwcGVuZENoaWxkKGltZyk7XG4gICAgYXdhaXQgdGhpcy5zd2FwSW1hZ2VTb3VyY2UoaW1nKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc3dhcEltYWdlU291cmNlKGltZzogSFRNTEltYWdlRWxlbWVudCkge1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSBpbWcuZ2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2XCIpID8/IHRoaXMuZXh0cmFjdFJlbW90ZVBhdGgoaW1nLmdldEF0dHJpYnV0ZShcInNyY1wiKSA/PyBcIlwiKTtcbiAgICBpZiAoIXJlbW90ZVBhdGgpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpbWcuY2xhc3NMaXN0LmFkZChcInNlY3VyZS13ZWJkYXYtaW1hZ2VcIiwgXCJpcy1sb2FkaW5nXCIpO1xuICAgIGNvbnN0IG9yaWdpbmFsQWx0ID0gaW1nLmFsdDtcbiAgICBpbWcuYWx0ID0gb3JpZ2luYWxBbHQgfHwgdGhpcy5kZXBzLnQoXCJcdTUyQTBcdThGN0RcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTRFMkQuLi5cIiwgXCJMb2FkaW5nIHNlY3VyZSBpbWFnZS4uLlwiKTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBibG9iVXJsID0gYXdhaXQgdGhpcy5kZXBzLmZldGNoU2VjdXJlSW1hZ2VCbG9iVXJsKHJlbW90ZVBhdGgpO1xuICAgICAgaW1nLnNyYyA9IGJsb2JVcmw7XG4gICAgICBpbWcuYWx0ID0gb3JpZ2luYWxBbHQ7XG4gICAgICBpbWcuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgIGltZy5zdHlsZS5tYXhXaWR0aCA9IFwiMTAwJVwiO1xuICAgICAgaW1nLmNsYXNzTGlzdC5yZW1vdmUoXCJpcy1sb2FkaW5nXCIsIFwiaXMtZXJyb3JcIik7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIGltYWdlIGxvYWQgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIGltZy5yZXBsYWNlV2l0aCh0aGlzLmJ1aWxkRXJyb3JFbGVtZW50KHJlbW90ZVBhdGgsIGVycm9yKSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBidWlsZEVycm9yRWxlbWVudChyZW1vdGVQYXRoOiBzdHJpbmcsIGVycm9yOiB1bmtub3duKSB7XG4gICAgY29uc3QgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGVsLmNsYXNzTmFtZSA9IFwic2VjdXJlLXdlYmRhdi1pbWFnZSBpcy1lcnJvclwiO1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG4gICAgZWwudGV4dENvbnRlbnQgPSB0aGlzLmRlcHMudChcbiAgICAgIGBcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTUyQTBcdThGN0RcdTU5MzFcdThEMjVcdUZGMUEke3JlbW90ZVBhdGh9XHVGRjA4JHttZXNzYWdlfVx1RkYwOWAsXG4gICAgICBgU2VjdXJlIGltYWdlIGZhaWxlZDogJHtyZW1vdGVQYXRofSAoJHttZXNzYWdlfSlgLFxuICAgICk7XG4gICAgcmV0dXJuIGVsO1xuICB9XG59XG4iLCAiaW1wb3J0IHsgQXBwLCBFZGl0b3IsIE1hcmtkb3duVmlldywgTm90aWNlLCBUQWJzdHJhY3RGaWxlLCBURmlsZSB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5leHBvcnQgdHlwZSBVcGxvYWRUYXNrID0ge1xuICBpZDogc3RyaW5nO1xuICBub3RlUGF0aDogc3RyaW5nO1xuICBwbGFjZWhvbGRlcjogc3RyaW5nO1xuICBtaW1lVHlwZTogc3RyaW5nO1xuICBmaWxlTmFtZTogc3RyaW5nO1xuICBkYXRhQmFzZTY0OiBzdHJpbmc7XG4gIGF0dGVtcHRzOiBudW1iZXI7XG4gIGNyZWF0ZWRBdDogbnVtYmVyO1xuICBsYXN0RXJyb3I/OiBzdHJpbmc7XG59O1xuXG50eXBlIFNlY3VyZVdlYmRhdlVwbG9hZFF1ZXVlRGVwcyA9IHtcbiAgYXBwOiBBcHA7XG4gIHQ6ICh6aDogc3RyaW5nLCBlbjogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIHNldHRpbmdzOiAoKSA9PiB7IG1heFJldHJ5QXR0ZW1wdHM6IG51bWJlcjsgcmV0cnlEZWxheVNlY29uZHM6IG51bWJlciB9O1xuICBnZXRRdWV1ZTogKCkgPT4gVXBsb2FkVGFza1tdO1xuICBzZXRRdWV1ZTogKHF1ZXVlOiBVcGxvYWRUYXNrW10pID0+IHZvaWQ7XG4gIHNhdmVQbHVnaW5TdGF0ZTogKCkgPT4gUHJvbWlzZTx2b2lkPjtcbiAgc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jOiAobm90ZVBhdGg6IHN0cmluZywgcmVhc29uOiBcImltYWdlLWFkZFwiIHwgXCJpbWFnZS1yZW1vdmVcIikgPT4gdm9pZDtcbiAgcmVxdWVzdFVybDogKG9wdGlvbnM6IHtcbiAgICB1cmw6IHN0cmluZztcbiAgICBtZXRob2Q6IHN0cmluZztcbiAgICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgICBib2R5PzogQXJyYXlCdWZmZXI7XG4gICAgZm9sbG93UmVkaXJlY3RzPzogYm9vbGVhbjtcbiAgICByZWRpcmVjdENvdW50PzogbnVtYmVyO1xuICB9KSA9PiBQcm9taXNlPHsgc3RhdHVzOiBudW1iZXI7IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47IGFycmF5QnVmZmVyOiBBcnJheUJ1ZmZlciB9PjtcbiAgYnVpbGRVcGxvYWRVcmw6IChyZW1vdGVQYXRoOiBzdHJpbmcpID0+IHN0cmluZztcbiAgYnVpbGRBdXRoSGVhZGVyOiAoKSA9PiBzdHJpbmc7XG4gIHByZXBhcmVVcGxvYWRQYXlsb2FkOiAoXG4gICAgYmluYXJ5OiBBcnJheUJ1ZmZlcixcbiAgICBtaW1lVHlwZTogc3RyaW5nLFxuICAgIGZpbGVOYW1lOiBzdHJpbmcsXG4gICkgPT4gUHJvbWlzZTx7IGJpbmFyeTogQXJyYXlCdWZmZXI7IG1pbWVUeXBlOiBzdHJpbmc7IGZpbGVOYW1lOiBzdHJpbmcgfT47XG4gIGJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5OiAoZmlsZU5hbWU6IHN0cmluZywgYmluYXJ5OiBBcnJheUJ1ZmZlcikgPT4gUHJvbWlzZTxzdHJpbmc+O1xuICBidWlsZFJlbW90ZVBhdGg6IChmaWxlTmFtZTogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIGJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXA6IChyZW1vdGVVcmw6IHN0cmluZywgYWx0OiBzdHJpbmcpID0+IHN0cmluZztcbiAgZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWU6IChmaWxlTmFtZTogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIGFycmF5QnVmZmVyVG9CYXNlNjQ6IChidWZmZXI6IEFycmF5QnVmZmVyKSA9PiBzdHJpbmc7XG4gIGJhc2U2NFRvQXJyYXlCdWZmZXI6IChiYXNlNjQ6IHN0cmluZykgPT4gQXJyYXlCdWZmZXI7XG4gIGVzY2FwZUh0bWw6ICh2YWx1ZTogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIGVzY2FwZVJlZ0V4cDogKHZhbHVlOiBzdHJpbmcpID0+IHN0cmluZztcbiAgZGVzY3JpYmVFcnJvcjogKHByZWZpeDogc3RyaW5nLCBlcnJvcjogdW5rbm93bikgPT4gc3RyaW5nO1xufTtcblxuLy8gT3ducyB0aGUgcXVldWVkIGltYWdlIHVwbG9hZCB3b3JrZmxvdyBzbyBzeW5jIGFuZCBub3RlIGxvZ2ljIGNhbiBzdGF5IHNlcGFyYXRlLlxuZXhwb3J0IGNsYXNzIFNlY3VyZVdlYmRhdlVwbG9hZFF1ZXVlU3VwcG9ydCB7XG4gIHByaXZhdGUgcHJvY2Vzc2luZ1Rhc2tJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSByZXRyeVRpbWVvdXRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgcHJpdmF0ZSBwZW5kaW5nVGFza1Byb21pc2VzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8dm9pZD4+KCk7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBkZXBzOiBTZWN1cmVXZWJkYXZVcGxvYWRRdWV1ZURlcHMpIHt9XG5cbiAgZGlzcG9zZSgpIHtcbiAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnJldHJ5VGltZW91dHMudmFsdWVzKCkpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICB9XG4gICAgdGhpcy5yZXRyeVRpbWVvdXRzLmNsZWFyKCk7XG4gIH1cblxuICBoYXNQZW5kaW5nV29yaygpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5kZXBzLmdldFF1ZXVlKCkubGVuZ3RoID4gMCB8fFxuICAgICAgdGhpcy5wcm9jZXNzaW5nVGFza0lkcy5zaXplID4gMCB8fFxuICAgICAgdGhpcy5wZW5kaW5nVGFza1Byb21pc2VzLnNpemUgPiAwXG4gICAgKTtcbiAgfVxuXG4gIGhhc1BlbmRpbmdXb3JrRm9yTm90ZShub3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcXVldWUgPSB0aGlzLmRlcHMuZ2V0UXVldWUoKTtcbiAgICBpZiAocXVldWUuc29tZSgodGFzaykgPT4gdGFzay5ub3RlUGF0aCA9PT0gbm90ZVBhdGgpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHRhc2tJZCBvZiB0aGlzLnByb2Nlc3NpbmdUYXNrSWRzKSB7XG4gICAgICBjb25zdCB0YXNrID0gcXVldWUuZmluZCgoaXRlbSkgPT4gaXRlbS5pZCA9PT0gdGFza0lkKTtcbiAgICAgIGlmICh0YXNrPy5ub3RlUGF0aCA9PT0gbm90ZVBhdGgpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBbdGFza0lkXSBvZiB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMpIHtcbiAgICAgIGNvbnN0IHRhc2sgPSBxdWV1ZS5maW5kKChpdGVtKSA9PiBpdGVtLmlkID09PSB0YXNrSWQpO1xuICAgICAgaWYgKHRhc2s/Lm5vdGVQYXRoID09PSBub3RlUGF0aCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBhc3luYyBlbnF1ZXVlRWRpdG9ySW1hZ2VVcGxvYWQobm90ZUZpbGU6IFRGaWxlLCBlZGl0b3I6IEVkaXRvciwgaW1hZ2VGaWxlOiBGaWxlLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGFycmF5QnVmZmVyID0gYXdhaXQgaW1hZ2VGaWxlLmFycmF5QnVmZmVyKCk7XG4gICAgICBjb25zdCB0YXNrID0gdGhpcy5jcmVhdGVVcGxvYWRUYXNrKFxuICAgICAgICBub3RlRmlsZS5wYXRoLFxuICAgICAgICBhcnJheUJ1ZmZlcixcbiAgICAgICAgaW1hZ2VGaWxlLnR5cGUgfHwgdGhpcy5kZXBzLmdldE1pbWVUeXBlRnJvbUZpbGVOYW1lKGZpbGVOYW1lKSxcbiAgICAgICAgZmlsZU5hbWUsXG4gICAgICApO1xuICAgICAgdGhpcy5pbnNlcnRQbGFjZWhvbGRlcihlZGl0b3IsIHRhc2sucGxhY2Vob2xkZXIpO1xuICAgICAgdGhpcy5kZXBzLnNldFF1ZXVlKFsuLi50aGlzLmRlcHMuZ2V0UXVldWUoKSwgdGFza10pO1xuICAgICAgYXdhaXQgdGhpcy5kZXBzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgdm9pZCB0aGlzLnByb2Nlc3NQZW5kaW5nVGFza3MoKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXBzLnQoXCJcdTVERjJcdTUyQTBcdTUxNjVcdTU2RkVcdTcyNDdcdTgxRUFcdTUyQThcdTRFMEFcdTRGMjBcdTk2MUZcdTUyMTdcdTMwMDJcIiwgXCJJbWFnZSBhZGRlZCB0byB0aGUgYXV0by11cGxvYWQgcXVldWUuXCIpKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBxdWV1ZSBzZWN1cmUgaW1hZ2UgdXBsb2FkXCIsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgIHRoaXMuZGVwcy5kZXNjcmliZUVycm9yKFxuICAgICAgICAgIHRoaXMuZGVwcy50KFwiXHU1MkEwXHU1MTY1XHU1NkZFXHU3MjQ3XHU4MUVBXHU1MkE4XHU0RTBBXHU0RjIwXHU5NjFGXHU1MjE3XHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIHF1ZXVlIGltYWdlIGZvciBhdXRvLXVwbG9hZFwiKSxcbiAgICAgICAgICBlcnJvcixcbiAgICAgICAgKSxcbiAgICAgICAgODAwMCxcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgY3JlYXRlVXBsb2FkVGFzayhub3RlUGF0aDogc3RyaW5nLCBiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKTogVXBsb2FkVGFzayB7XG4gICAgY29uc3QgaWQgPSBgc2VjdXJlLXdlYmRhdi10YXNrLSR7RGF0ZS5ub3coKX0tJHtNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLCA4KX1gO1xuICAgIHJldHVybiB7XG4gICAgICBpZCxcbiAgICAgIG5vdGVQYXRoLFxuICAgICAgcGxhY2Vob2xkZXI6IHRoaXMuYnVpbGRQZW5kaW5nUGxhY2Vob2xkZXIoaWQsIGZpbGVOYW1lKSxcbiAgICAgIG1pbWVUeXBlLFxuICAgICAgZmlsZU5hbWUsXG4gICAgICBkYXRhQmFzZTY0OiB0aGlzLmRlcHMuYXJyYXlCdWZmZXJUb0Jhc2U2NChiaW5hcnkpLFxuICAgICAgYXR0ZW1wdHM6IDAsXG4gICAgICBjcmVhdGVkQXQ6IERhdGUubm93KCksXG4gICAgfTtcbiAgfVxuXG4gIGJ1aWxkUGVuZGluZ1BsYWNlaG9sZGVyKHRhc2tJZDogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3Qgc2FmZU5hbWUgPSB0aGlzLmRlcHMuZXNjYXBlSHRtbChmaWxlTmFtZSk7XG4gICAgcmV0dXJuIGA8c3BhbiBjbGFzcz1cInNlY3VyZS13ZWJkYXYtcGVuZGluZ1wiIGRhdGEtc2VjdXJlLXdlYmRhdi10YXNrPVwiJHt0YXNrSWR9XCIgYXJpYS1sYWJlbD1cIiR7c2FmZU5hbWV9XCI+JHt0aGlzLmRlcHMuZXNjYXBlSHRtbCh0aGlzLmRlcHMudChgXHUzMDEwXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU0RTJEXHVGRjVDJHtmaWxlTmFtZX1cdTMwMTFgLCBgW1VwbG9hZGluZyBpbWFnZSB8ICR7ZmlsZU5hbWV9XWApKX08L3NwYW4+YDtcbiAgfVxuXG4gIGJ1aWxkRmFpbGVkUGxhY2Vob2xkZXIoZmlsZU5hbWU6IHN0cmluZywgbWVzc2FnZT86IHN0cmluZykge1xuICAgIGNvbnN0IHNhZmVOYW1lID0gdGhpcy5kZXBzLmVzY2FwZUh0bWwoZmlsZU5hbWUpO1xuICAgIGNvbnN0IHNhZmVNZXNzYWdlID0gdGhpcy5kZXBzLmVzY2FwZUh0bWwobWVzc2FnZSA/PyB0aGlzLmRlcHMudChcIlx1NjcyQVx1NzdFNVx1OTUxOVx1OEJFRlwiLCBcIlVua25vd24gZXJyb3JcIikpO1xuICAgIGNvbnN0IGxhYmVsID0gdGhpcy5kZXBzLmVzY2FwZUh0bWwodGhpcy5kZXBzLnQoYFx1MzAxMFx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NTkzMVx1OEQyNVx1RkY1QyR7ZmlsZU5hbWV9XHUzMDExYCwgYFtJbWFnZSB1cGxvYWQgZmFpbGVkIHwgJHtmaWxlTmFtZX1dYCkpO1xuICAgIHJldHVybiBgPHNwYW4gY2xhc3M9XCJzZWN1cmUtd2ViZGF2LWZhaWxlZFwiIGFyaWEtbGFiZWw9XCIke3NhZmVOYW1lfVwiPiR7bGFiZWx9OiAke3NhZmVNZXNzYWdlfTwvc3Bhbj5gO1xuICB9XG5cbiAgYXN5bmMgcHJvY2Vzc1BlbmRpbmdUYXNrcygpIHtcbiAgICBjb25zdCBydW5uaW5nOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IHRhc2sgb2YgdGhpcy5kZXBzLmdldFF1ZXVlKCkpIHtcbiAgICAgIGlmICh0aGlzLnByb2Nlc3NpbmdUYXNrSWRzLmhhcyh0YXNrLmlkKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgcnVubmluZy5wdXNoKHRoaXMuc3RhcnRQZW5kaW5nVGFzayh0YXNrKSk7XG4gICAgfVxuXG4gICAgYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHJ1bm5pbmcpO1xuICB9XG5cbiAgc3RhcnRQZW5kaW5nVGFzayh0YXNrOiBVcGxvYWRUYXNrKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMuZ2V0KHRhc2suaWQpO1xuICAgIGlmIChleGlzdGluZykge1xuICAgICAgcmV0dXJuIGV4aXN0aW5nO1xuICAgIH1cblxuICAgIGNvbnN0IHByb21pc2UgPSB0aGlzLnByb2Nlc3NUYXNrKHRhc2spLmZpbmFsbHkoKCkgPT4ge1xuICAgICAgdGhpcy5wZW5kaW5nVGFza1Byb21pc2VzLmRlbGV0ZSh0YXNrLmlkKTtcbiAgICB9KTtcbiAgICB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMuc2V0KHRhc2suaWQsIHByb21pc2UpO1xuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgcHJvY2Vzc1Rhc2sodGFzazogVXBsb2FkVGFzaykge1xuICAgIHRoaXMucHJvY2Vzc2luZ1Rhc2tJZHMuYWRkKHRhc2suaWQpO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBiaW5hcnkgPSB0aGlzLmRlcHMuYmFzZTY0VG9BcnJheUJ1ZmZlcih0YXNrLmRhdGFCYXNlNjQpO1xuICAgICAgY29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLmRlcHMucHJlcGFyZVVwbG9hZFBheWxvYWQoXG4gICAgICAgIGJpbmFyeSxcbiAgICAgICAgdGFzay5taW1lVHlwZSB8fCB0aGlzLmRlcHMuZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUodGFzay5maWxlTmFtZSksXG4gICAgICAgIHRhc2suZmlsZU5hbWUsXG4gICAgICApO1xuICAgICAgY29uc3QgcmVtb3RlTmFtZSA9IGF3YWl0IHRoaXMuZGVwcy5idWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeShwcmVwYXJlZC5maWxlTmFtZSwgcHJlcGFyZWQuYmluYXJ5KTtcbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmRlcHMuYnVpbGRSZW1vdGVQYXRoKHJlbW90ZU5hbWUpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmRlcHMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5kZXBzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgICBtZXRob2Q6IFwiUFVUXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmRlcHMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogcHJlcGFyZWQubWltZVR5cGUsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IHByZXBhcmVkLmJpbmFyeSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVcGxvYWQgZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXBsYWNlZCA9IGF3YWl0IHRoaXMucmVwbGFjZVBsYWNlaG9sZGVyKFxuICAgICAgICB0YXNrLm5vdGVQYXRoLFxuICAgICAgICB0YXNrLmlkLFxuICAgICAgICB0YXNrLnBsYWNlaG9sZGVyLFxuICAgICAgICB0aGlzLmRlcHMuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChgd2ViZGF2LXNlY3VyZTovLyR7cmVtb3RlUGF0aH1gLCBwcmVwYXJlZC5maWxlTmFtZSksXG4gICAgICApO1xuICAgICAgaWYgKCFyZXBsYWNlZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgdGhpcy5kZXBzLnQoXG4gICAgICAgICAgICBcIlx1NEUwQVx1NEYyMFx1NjIxMFx1NTI5Rlx1RkYwQ1x1NEY0Nlx1NkNBMVx1NjcwOVx1NTcyOFx1N0IxNFx1OEJCMFx1NEUyRFx1NjI3RVx1NTIzMFx1NTNFRlx1NjZGRlx1NjM2Mlx1NzY4NFx1NTM2MFx1NEY0RFx1N0IyNlx1MzAwMlwiLFxuICAgICAgICAgICAgXCJVcGxvYWQgc3VjY2VlZGVkLCBidXQgbm8gbWF0Y2hpbmcgcGxhY2Vob2xkZXIgd2FzIGZvdW5kIGluIHRoZSBub3RlLlwiLFxuICAgICAgICAgICksXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuZGVwcy5zZXRRdWV1ZSh0aGlzLmRlcHMuZ2V0UXVldWUoKS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uaWQgIT09IHRhc2suaWQpKTtcbiAgICAgIGF3YWl0IHRoaXMuZGVwcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIHRoaXMuZGVwcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmModGFzay5ub3RlUGF0aCwgXCJpbWFnZS1hZGRcIik7XG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVwcy50KFwiXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU2MjEwXHU1MjlGXHUzMDAyXCIsIFwiSW1hZ2UgdXBsb2FkZWQgc3VjY2Vzc2Z1bGx5LlwiKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIHF1ZXVlZCB1cGxvYWQgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIHRhc2suYXR0ZW1wdHMgKz0gMTtcbiAgICAgIHRhc2subGFzdEVycm9yID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xuICAgICAgYXdhaXQgdGhpcy5kZXBzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuXG4gICAgICBpZiAodGFzay5hdHRlbXB0cyA+PSB0aGlzLmRlcHMuc2V0dGluZ3MoKS5tYXhSZXRyeUF0dGVtcHRzKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucmVwbGFjZVBsYWNlaG9sZGVyKFxuICAgICAgICAgIHRhc2subm90ZVBhdGgsXG4gICAgICAgICAgdGFzay5pZCxcbiAgICAgICAgICB0YXNrLnBsYWNlaG9sZGVyLFxuICAgICAgICAgIHRoaXMuYnVpbGRGYWlsZWRQbGFjZWhvbGRlcih0YXNrLmZpbGVOYW1lLCB0YXNrLmxhc3RFcnJvciksXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGVwcy5zZXRRdWV1ZSh0aGlzLmRlcHMuZ2V0UXVldWUoKS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uaWQgIT09IHRhc2suaWQpKTtcbiAgICAgICAgYXdhaXQgdGhpcy5kZXBzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMuZGVwcy5kZXNjcmliZUVycm9yKHRoaXMuZGVwcy50KFwiXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU2NzAwXHU3RUM4XHU1OTMxXHU4RDI1XCIsIFwiSW1hZ2UgdXBsb2FkIGZhaWxlZCBwZXJtYW5lbnRseVwiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuc2NoZWR1bGVSZXRyeSh0YXNrKTtcbiAgICAgIH1cbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy5wcm9jZXNzaW5nVGFza0lkcy5kZWxldGUodGFzay5pZCk7XG4gICAgfVxuICB9XG5cbiAgc2NoZWR1bGVSZXRyeSh0YXNrOiBVcGxvYWRUYXNrKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLnJldHJ5VGltZW91dHMuZ2V0KHRhc2suaWQpO1xuICAgIGlmIChleGlzdGluZykge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dChleGlzdGluZyk7XG4gICAgfVxuXG4gICAgY29uc3QgZGVsYXkgPSBNYXRoLm1heCgxLCB0aGlzLmRlcHMuc2V0dGluZ3MoKS5yZXRyeURlbGF5U2Vjb25kcykgKiAxMDAwICogdGFzay5hdHRlbXB0cztcbiAgICBjb25zdCB0aW1lb3V0SWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLnJldHJ5VGltZW91dHMuZGVsZXRlKHRhc2suaWQpO1xuICAgICAgdm9pZCB0aGlzLnN0YXJ0UGVuZGluZ1Rhc2sodGFzayk7XG4gICAgfSwgZGVsYXkpO1xuICAgIHRoaXMucmV0cnlUaW1lb3V0cy5zZXQodGFzay5pZCwgdGltZW91dElkKTtcbiAgfVxuXG4gIHByaXZhdGUgaW5zZXJ0UGxhY2Vob2xkZXIoZWRpdG9yOiBFZGl0b3IsIHBsYWNlaG9sZGVyOiBzdHJpbmcpIHtcbiAgICBlZGl0b3IucmVwbGFjZVNlbGVjdGlvbihgJHtwbGFjZWhvbGRlcn1cXG5gKTtcbiAgfVxuXG4gIGFzeW5jIHJlcGxhY2VQbGFjZWhvbGRlcihub3RlUGF0aDogc3RyaW5nLCB0YXNrSWQ6IHN0cmluZywgcGxhY2Vob2xkZXI6IHN0cmluZywgcmVwbGFjZW1lbnQ6IHN0cmluZykge1xuICAgIGNvbnN0IHJlcGxhY2VkSW5FZGl0b3IgPSB0aGlzLnJlcGxhY2VQbGFjZWhvbGRlckluT3BlbkVkaXRvcnMobm90ZVBhdGgsIHRhc2tJZCwgcGxhY2Vob2xkZXIsIHJlcGxhY2VtZW50KTtcbiAgICBpZiAocmVwbGFjZWRJbkVkaXRvcikge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgY29uc3QgZmlsZSA9IHRoaXMuZGVwcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKG5vdGVQYXRoKTtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZGVwcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBpZiAoY29udGVudC5pbmNsdWRlcyhwbGFjZWhvbGRlcikpIHtcbiAgICAgIGNvbnN0IHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGxhY2Vob2xkZXIsIHJlcGxhY2VtZW50KTtcbiAgICAgIGlmICh1cGRhdGVkICE9PSBjb250ZW50KSB7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVwcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIHVwZGF0ZWQpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBwYXR0ZXJuID0gbmV3IFJlZ0V4cChcbiAgICAgIGA8c3BhbltePl0qZGF0YS1zZWN1cmUtd2ViZGF2LXRhc2s9XCIke3RoaXMuZGVwcy5lc2NhcGVSZWdFeHAodGFza0lkKX1cIltePl0qPi4qPzxcXFxcL3NwYW4+YCxcbiAgICAgIFwic1wiLFxuICAgICk7XG4gICAgaWYgKHBhdHRlcm4udGVzdChjb250ZW50KSkge1xuICAgICAgY29uc3QgdXBkYXRlZCA9IGNvbnRlbnQucmVwbGFjZShwYXR0ZXJuLCByZXBsYWNlbWVudCk7XG4gICAgICBpZiAodXBkYXRlZCAhPT0gY29udGVudCkge1xuICAgICAgICBhd2FpdCB0aGlzLmRlcHMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB1cGRhdGVkKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcHJpdmF0ZSByZXBsYWNlUGxhY2Vob2xkZXJJbk9wZW5FZGl0b3JzKG5vdGVQYXRoOiBzdHJpbmcsIHRhc2tJZDogc3RyaW5nLCBwbGFjZWhvbGRlcjogc3RyaW5nLCByZXBsYWNlbWVudDogc3RyaW5nKSB7XG4gICAgbGV0IHJlcGxhY2VkID0gZmFsc2U7XG4gICAgY29uc3QgbGVhdmVzID0gdGhpcy5kZXBzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFwibWFya2Rvd25cIik7XG5cbiAgICBmb3IgKGNvbnN0IGxlYWYgb2YgbGVhdmVzKSB7XG4gICAgICBjb25zdCB2aWV3ID0gbGVhZi52aWV3O1xuICAgICAgaWYgKCEodmlldyBpbnN0YW5jZW9mIE1hcmtkb3duVmlldykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghdmlldy5maWxlIHx8IHZpZXcuZmlsZS5wYXRoICE9PSBub3RlUGF0aCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZWRpdG9yID0gdmlldy5lZGl0b3I7XG4gICAgICBjb25zdCBjb250ZW50ID0gZWRpdG9yLmdldFZhbHVlKCk7XG4gICAgICBsZXQgdXBkYXRlZCA9IGNvbnRlbnQ7XG5cbiAgICAgIGlmIChjb250ZW50LmluY2x1ZGVzKHBsYWNlaG9sZGVyKSkge1xuICAgICAgICB1cGRhdGVkID0gY29udGVudC5yZXBsYWNlKHBsYWNlaG9sZGVyLCByZXBsYWNlbWVudCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBwYXR0ZXJuID0gbmV3IFJlZ0V4cChcbiAgICAgICAgICBgPHNwYW5bXj5dKmRhdGEtc2VjdXJlLXdlYmRhdi10YXNrPVwiJHt0aGlzLmRlcHMuZXNjYXBlUmVnRXhwKHRhc2tJZCl9XCJbXj5dKj4uKj88XFxcXC9zcGFuPmAsXG4gICAgICAgICAgXCJzXCIsXG4gICAgICAgICk7XG4gICAgICAgIHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGF0dGVybiwgcmVwbGFjZW1lbnQpO1xuICAgICAgfVxuXG4gICAgICBpZiAodXBkYXRlZCAhPT0gY29udGVudCkge1xuICAgICAgICBlZGl0b3Iuc2V0VmFsdWUodXBkYXRlZCk7XG4gICAgICAgIHJlcGxhY2VkID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVwbGFjZWQ7XG4gIH1cbn1cbiIsICJpbXBvcnQgeyBBcHAsIFRGaWxlLCBURm9sZGVyLCBub3JtYWxpemVQYXRoIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmV4cG9ydCB0eXBlIERlbGV0aW9uVG9tYnN0b25lID0ge1xuICBwYXRoOiBzdHJpbmc7XG4gIGRlbGV0ZWRBdDogbnVtYmVyO1xuICByZW1vdGVTaWduYXR1cmU/OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgdHlwZSBSZW1vdGVGaWxlTGlrZSA9IHtcbiAgcmVtb3RlUGF0aDogc3RyaW5nO1xuICBsYXN0TW9kaWZpZWQ6IG51bWJlcjtcbiAgc2l6ZTogbnVtYmVyO1xuICBzaWduYXR1cmU6IHN0cmluZztcbn07XG5cbnR5cGUgU2VjdXJlV2ViZGF2U3luY1N1cHBvcnREZXBzID0ge1xuICBhcHA6IEFwcDtcbiAgZ2V0VmF1bHRTeW5jUmVtb3RlRm9sZGVyOiAoKSA9PiBzdHJpbmc7XG4gIGdldEV4Y2x1ZGVkU3luY0ZvbGRlcnM/OiAoKSA9PiBzdHJpbmdbXTtcbiAgZGVsZXRpb25Gb2xkZXJTdWZmaXg6IHN0cmluZztcbiAgZW5jb2RlQmFzZTY0VXJsOiAodmFsdWU6IHN0cmluZykgPT4gc3RyaW5nO1xuICBkZWNvZGVCYXNlNjRVcmw6ICh2YWx1ZTogc3RyaW5nKSA9PiBzdHJpbmc7XG59O1xuXG4vLyBLZWVwIHN5bmMgbWV0YWRhdGEgYW5kIHRvbWJzdG9uZSBydWxlcyBpc29sYXRlZCBzbyBxdWV1ZS9yZW5kZXJpbmcgY2hhbmdlc1xuLy8gZG8gbm90IGFjY2lkZW50YWxseSBhZmZlY3QgcmVjb25jaWxpYXRpb24gYmVoYXZpb3VyLlxuZXhwb3J0IGNsYXNzIFNlY3VyZVdlYmRhdlN5bmNTdXBwb3J0IHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBkZXBzOiBTZWN1cmVXZWJkYXZTeW5jU3VwcG9ydERlcHMpIHt9XG5cbiAgaXNFeGNsdWRlZFN5bmNQYXRoKHBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gbm9ybWFsaXplUGF0aChwYXRoKS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpLnJlcGxhY2UoL1xcLyskLywgXCJcIik7XG4gICAgaWYgKCFub3JtYWxpemVkUGF0aCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IGZvbGRlcnMgPSB0aGlzLmRlcHMuZ2V0RXhjbHVkZWRTeW5jRm9sZGVycz8uKCkgPz8gW107XG4gICAgcmV0dXJuIGZvbGRlcnMuc29tZSgoZm9sZGVyKSA9PiB7XG4gICAgICBjb25zdCBub3JtYWxpemVkRm9sZGVyID0gbm9ybWFsaXplUGF0aChmb2xkZXIpLnJlcGxhY2UoL15cXC8rLywgXCJcIikucmVwbGFjZSgvXFwvKyQvLCBcIlwiKTtcbiAgICAgIHJldHVybiBub3JtYWxpemVkRm9sZGVyLmxlbmd0aCA+IDAgJiYgKG5vcm1hbGl6ZWRQYXRoID09PSBub3JtYWxpemVkRm9sZGVyIHx8IG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoYCR7bm9ybWFsaXplZEZvbGRlcn0vYCkpO1xuICAgIH0pO1xuICB9XG5cbiAgc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IG5vcm1hbGl6ZVBhdGgocGF0aCk7XG4gICAgaWYgKFxuICAgICAgdGhpcy5pc0V4Y2x1ZGVkU3luY1BhdGgobm9ybWFsaXplZFBhdGgpIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwiLm9ic2lkaWFuL1wiKSB8fFxuICAgICAgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIi50cmFzaC9cIikgfHxcbiAgICAgIG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIuZ2l0L1wiKSB8fFxuICAgICAgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIm5vZGVfbW9kdWxlcy9cIikgfHxcbiAgICAgIG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCJfcGx1Z2luX3BhY2thZ2VzL1wiKSB8fFxuICAgICAgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIi50bXAtXCIpIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwiLm9ic2lkaWFuL3BsdWdpbnMvc2VjdXJlLXdlYmRhdi1pbWFnZXMvXCIpXG4gICAgKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gL1xcLihwbmd8anBlP2d8Z2lmfHdlYnB8Ym1wfHN2ZykkL2kudGVzdChub3JtYWxpemVkUGF0aCk7XG4gIH1cblxuICBzaG91bGRTa2lwRGlyZWN0b3J5U3luY1BhdGgoZGlyUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcCA9IG5vcm1hbGl6ZVBhdGgoZGlyUGF0aCk7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuaXNFeGNsdWRlZFN5bmNQYXRoKHApIHx8XG4gICAgICBwLnN0YXJ0c1dpdGgoXCIub2JzaWRpYW5cIikgfHxcbiAgICAgIHAuc3RhcnRzV2l0aChcIi50cmFzaFwiKSB8fFxuICAgICAgcC5zdGFydHNXaXRoKFwiLmdpdFwiKSB8fFxuICAgICAgcC5zdGFydHNXaXRoKFwibm9kZV9tb2R1bGVzXCIpIHx8XG4gICAgICBwLnN0YXJ0c1dpdGgoXCJfcGx1Z2luX3BhY2thZ2VzXCIpIHx8XG4gICAgICBwLnN0YXJ0c1dpdGgoXCIudG1wLVwiKVxuICAgICk7XG4gIH1cblxuICBjb2xsZWN0TG9jYWxTeW5jZWREaXJlY3RvcmllcygpIHtcbiAgICBjb25zdCBkaXJzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgZm9yIChjb25zdCBmIG9mIHRoaXMuZGVwcy5hcHAudmF1bHQuZ2V0QWxsRm9sZGVycygpKSB7XG4gICAgICBpZiAoZiBpbnN0YW5jZW9mIFRGb2xkZXIgJiYgIWYuaXNSb290KCkgJiYgIXRoaXMuc2hvdWxkU2tpcERpcmVjdG9yeVN5bmNQYXRoKGYucGF0aCkpIHtcbiAgICAgICAgZGlycy5hZGQobm9ybWFsaXplUGF0aChmLnBhdGgpKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGRpcnM7XG4gIH1cblxuICBjb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKSB7XG4gICAgcmV0dXJuIHRoaXMuZGVwcy5hcHAudmF1bHRcbiAgICAgIC5nZXRGaWxlcygpXG4gICAgICAuZmlsdGVyKChmaWxlKSA9PiAhdGhpcy5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKGZpbGUucGF0aCkpXG4gICAgICAuc29ydCgoYSwgYikgPT4gYS5wYXRoLmxvY2FsZUNvbXBhcmUoYi5wYXRoKSk7XG4gIH1cblxuICBidWlsZFN5bmNTaWduYXR1cmUoZmlsZTogVEZpbGUpIHtcbiAgICByZXR1cm4gYCR7ZmlsZS5zdGF0Lm10aW1lfToke2ZpbGUuc3RhdC5zaXplfWA7XG4gIH1cblxuICBidWlsZFJlbW90ZVN5bmNTaWduYXR1cmUocmVtb3RlOiBQaWNrPFJlbW90ZUZpbGVMaWtlLCBcImxhc3RNb2RpZmllZFwiIHwgXCJzaXplXCI+KSB7XG4gICAgcmV0dXJuIGAke3JlbW90ZS5sYXN0TW9kaWZpZWR9OiR7cmVtb3RlLnNpemV9YDtcbiAgfVxuXG4gIGJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aCh2YXVsdFBhdGg6IHN0cmluZykge1xuICAgIHJldHVybiBgJHt0aGlzLm5vcm1hbGl6ZUZvbGRlcih0aGlzLmRlcHMuZ2V0VmF1bHRTeW5jUmVtb3RlRm9sZGVyKCkpfSR7dmF1bHRQYXRofWA7XG4gIH1cblxuICBidWlsZERlbGV0aW9uRm9sZGVyKCkge1xuICAgIHJldHVybiBgJHt0aGlzLm5vcm1hbGl6ZUZvbGRlcih0aGlzLmRlcHMuZ2V0VmF1bHRTeW5jUmVtb3RlRm9sZGVyKCkpLnJlcGxhY2UoL1xcLyQvLCBcIlwiKX0ke3RoaXMuZGVwcy5kZWxldGlvbkZvbGRlclN1ZmZpeH1gO1xuICB9XG5cbiAgYnVpbGREZWxldGlvblJlbW90ZVBhdGgodmF1bHRQYXRoOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5idWlsZERlbGV0aW9uRm9sZGVyKCl9JHt0aGlzLmRlcHMuZW5jb2RlQmFzZTY0VXJsKHZhdWx0UGF0aCl9Lmpzb25gO1xuICB9XG5cbiAgcmVtb3RlRGVsZXRpb25QYXRoVG9WYXVsdFBhdGgocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgcm9vdCA9IHRoaXMuYnVpbGREZWxldGlvbkZvbGRlcigpO1xuICAgIGlmICghcmVtb3RlUGF0aC5zdGFydHNXaXRoKHJvb3QpIHx8ICFyZW1vdGVQYXRoLmVuZHNXaXRoKFwiLmpzb25cIikpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IGVuY29kZWQgPSByZW1vdGVQYXRoLnNsaWNlKHJvb3QubGVuZ3RoLCAtXCIuanNvblwiLmxlbmd0aCk7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiB0aGlzLmRlcHMuZGVjb2RlQmFzZTY0VXJsKGVuY29kZWQpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgcGFyc2VEZWxldGlvblRvbWJzdG9uZVBheWxvYWQocmF3OiBzdHJpbmcpOiBEZWxldGlvblRvbWJzdG9uZSB8IG51bGwge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdyk7XG4gICAgICBpZiAoIXBhcnNlZCB8fCB0eXBlb2YgcGFyc2VkLnBhdGggIT09IFwic3RyaW5nXCIgfHwgdHlwZW9mIHBhcnNlZC5kZWxldGVkQXQgIT09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICBpZiAocGFyc2VkLnJlbW90ZVNpZ25hdHVyZSAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiBwYXJzZWQucmVtb3RlU2lnbmF0dXJlICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcGF0aDogcGFyc2VkLnBhdGgsXG4gICAgICAgIGRlbGV0ZWRBdDogcGFyc2VkLmRlbGV0ZWRBdCxcbiAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiBwYXJzZWQucmVtb3RlU2lnbmF0dXJlLFxuICAgICAgfTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIHJlbW90ZVBhdGhUb1ZhdWx0UGF0aChyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCByb290ID0gdGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5kZXBzLmdldFZhdWx0U3luY1JlbW90ZUZvbGRlcigpKTtcbiAgICBpZiAoIXJlbW90ZVBhdGguc3RhcnRzV2l0aChyb290KSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlbW90ZVBhdGguc2xpY2Uocm9vdC5sZW5ndGgpLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG4gIH1cblxuICBzaG91bGREb3dubG9hZFJlbW90ZVZlcnNpb24obG9jYWxNdGltZTogbnVtYmVyLCByZW1vdGVNdGltZTogbnVtYmVyKSB7XG4gICAgcmV0dXJuIHJlbW90ZU10aW1lID4gbG9jYWxNdGltZSArIDIwMDA7XG4gIH1cblxuICBpc1RvbWJzdG9uZUF1dGhvcml0YXRpdmUoXG4gICAgdG9tYnN0b25lOiBEZWxldGlvblRvbWJzdG9uZSxcbiAgICByZW1vdGU/OiBQaWNrPFJlbW90ZUZpbGVMaWtlLCBcImxhc3RNb2RpZmllZFwiIHwgXCJzaWduYXR1cmVcIj4gfCBudWxsLFxuICApIHtcbiAgICBjb25zdCBncmFjZU1zID0gNTAwMDtcbiAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHRvbWJzdG9uZS5yZW1vdGVTaWduYXR1cmUpIHtcbiAgICAgIHJldHVybiByZW1vdGUuc2lnbmF0dXJlID09PSB0b21ic3RvbmUucmVtb3RlU2lnbmF0dXJlO1xuICAgIH1cblxuICAgIHJldHVybiByZW1vdGUubGFzdE1vZGlmaWVkIDw9IHRvbWJzdG9uZS5kZWxldGVkQXQgKyBncmFjZU1zO1xuICB9XG5cbiAgc2hvdWxkRGVsZXRlTG9jYWxGcm9tVG9tYnN0b25lKGZpbGU6IFRGaWxlLCB0b21ic3RvbmU6IERlbGV0aW9uVG9tYnN0b25lKSB7XG4gICAgY29uc3QgZ3JhY2VNcyA9IDUwMDA7XG4gICAgcmV0dXJuIGZpbGUuc3RhdC5tdGltZSA8PSB0b21ic3RvbmUuZGVsZXRlZEF0ICsgZ3JhY2VNcztcbiAgfVxuXG4gIHByaXZhdGUgbm9ybWFsaXplRm9sZGVyKGlucHV0OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gbm9ybWFsaXplRm9sZGVyKGlucHV0KTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplRm9sZGVyKGlucHV0OiBzdHJpbmcpIHtcbiAgcmV0dXJuIGlucHV0LnJlcGxhY2UoL15cXC8rLywgXCJcIikucmVwbGFjZSgvXFwvKyQvLCBcIlwiKSArIFwiL1wiO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUMsSUFBQUEsbUJBZU07OztBQ2ZQLHNCQUFrRTtBQUUzRCxJQUFNLGtCQUFrQjtBQUN4QixJQUFNLG9CQUFvQjtBQVlqQyxJQUFNLDBCQUFOLGNBQXNDLG9DQUFvQjtBQUFBLEVBQ3hELFlBQVksYUFBMEI7QUFDcEMsVUFBTSxXQUFXO0FBQUEsRUFDbkI7QUFBQSxFQUVBLFdBQWlCO0FBQUEsRUFBQztBQUNwQjtBQUlPLElBQU0sMkJBQU4sTUFBK0I7QUFBQSxFQUNwQyxZQUE2QixNQUFvQztBQUFwQztBQUFBLEVBQXFDO0FBQUEsRUFFbEUsdUJBQXVCLFdBQW1CLEtBQWE7QUFDckQsVUFBTSxhQUFhLEtBQUssa0JBQWtCLFNBQVM7QUFDbkQsUUFBSSxDQUFDLFlBQVk7QUFDZixhQUFPLE9BQU8sU0FBUztBQUFBLElBQ3pCO0FBRUEsV0FBTyxLQUFLLDBCQUEwQixZQUFZLEdBQUc7QUFBQSxFQUN2RDtBQUFBLEVBRUEsMEJBQTBCLFlBQW9CLEtBQWE7QUFDekQsVUFBTSxpQkFBaUIsT0FBTyxZQUFZLFFBQVEsVUFBVSxHQUFHLEVBQUUsS0FBSztBQUN0RSxVQUFNLGlCQUFpQixXQUFXLFFBQVEsVUFBVSxFQUFFLEVBQUUsS0FBSztBQUM3RCxXQUFPLENBQUMsU0FBUyxpQkFBaUIsSUFBSSxTQUFTLGNBQWMsSUFBSSxRQUFRLGFBQWEsSUFBSSxLQUFLLEVBQUUsS0FBSyxJQUFJO0FBQUEsRUFDNUc7QUFBQSxFQUVBLHNCQUFzQixRQUErQztBQUNuRSxVQUFNLFNBQWlDLEVBQUUsTUFBTSxJQUFJLEtBQUssR0FBRztBQUMzRCxl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V0FBVyxDQUFDLEVBQUUsUUFBUSxZQUFZO0FBQzNFLGVBQU8sWUFBWSxJQUFJO0FBQ3ZCLFlBQUk7QUFDRixnQkFBTSxLQUFLLE9BQU8sd0JBQXdCLElBQUk7QUFDOUMsZUFBSyxRQUFRO0FBQUEsUUFDZixVQUFFO0FBQ0EsaUJBQU8sWUFBWSxLQUFLO0FBQUEsUUFDMUI7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNILEVBQ0M7QUFBQSxNQUFVLENBQUMsV0FDVixPQUFPLGNBQWMsS0FBSyxPQUFPLEVBQUUsNEJBQVEsZ0JBQWdCLENBQUMsRUFBRSxRQUFRLFlBQVk7QUFDaEYsZUFBTyxZQUFZLElBQUk7QUFDdkIsWUFBSTtBQUNGLGdCQUFNLEtBQUssT0FBTywyQkFBMkIsSUFBSTtBQUNqRCxlQUFLLFFBQVE7QUFBQSxRQUNmLFVBQUU7QUFDQSxpQkFBTyxZQUFZLEtBQUs7QUFBQSxRQUMxQjtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0g7QUFFRixnQkFBWSxTQUFTLE1BQU0sRUFBRSxNQUFNLEtBQUssT0FBTyxFQUFFLGtDQUFTLGdCQUFnQixFQUFFLENBQUM7QUFFN0UsUUFBSSx5QkFBUSxXQUFXLEVBQ3BCLFFBQVEsS0FBSyxPQUFPLEVBQUUsZ0VBQWMsc0NBQXNDLENBQUMsRUFDM0U7QUFBQSxNQUNDLEtBQUssT0FBTztBQUFBLFFBQ1Y7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0YsRUFDQztBQUFBLE1BQVUsQ0FBQyxXQUNWLE9BQU8sY0FBYyxLQUFLLE9BQU8sRUFBRSw0QkFBUSxlQUFlLENBQUMsRUFBRSxRQUFRLFlBQVk7QUFDL0UsZUFBTyxZQUFZLElBQUk7QUFDdkIsWUFBSTtBQUNGLGdCQUFNLEtBQUssT0FBTyw2QkFBNkI7QUFBQSxRQUNqRCxVQUFFO0FBQ0EsaUJBQU8sWUFBWSxLQUFLO0FBQUEsUUFDMUI7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDSjtBQUNGO0FBRUEsSUFBTSxjQUFOLGNBQTBCLHVCQUFNO0FBQUEsRUFJOUIsWUFBWSxLQUFVLFdBQW1CLFVBQWtCO0FBQ3pELFVBQU0sR0FBRztBQUNULFNBQUssWUFBWTtBQUNqQixTQUFLLFdBQVc7QUFBQSxFQUNsQjtBQUFBLEVBRUEsU0FBZTtBQUNiLFVBQU0sRUFBRSxVQUFVLElBQUk7QUFDdEIsY0FBVSxNQUFNO0FBQ2hCLGNBQVUsU0FBUyxNQUFNLEVBQUUsTUFBTSxLQUFLLFVBQVUsQ0FBQztBQUNqRCxjQUFVLFNBQVMsS0FBSyxFQUFFLE1BQU0sS0FBSyxTQUFTLENBQUM7QUFBQSxFQUNqRDtBQUFBLEVBRUEsVUFBZ0I7QUFDZCxTQUFLLFVBQVUsTUFBTTtBQUFBLEVBQ3ZCO0FBQ0Y7IiwKICAibmFtZXMiOiBbImltcG9ydF9vYnNpZGlhbiIsICJpbXBvcnRfb2JzaWRpYW4iLCAiaW1wb3J0X29ic2lkaWFuIiwgImRvY3VtZW50IiwgInRvbWJzdG9uZSIsICJ1cGxvYWRlZFJlbW90ZSIsICJvYnNpZGlhblJlcXVlc3RVcmwiXQp9Cg==
