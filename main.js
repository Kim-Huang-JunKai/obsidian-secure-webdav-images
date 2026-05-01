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
  buildRemoteEventFolder() {
    return `${this.normalizeFolder(this.deps.getVaultSyncRemoteFolder()).replace(/\/$/, "")}${this.deps.eventFolderSuffix}`;
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
  jpegQuality: 82,
  fastSyncRecentChangeLimit: 20
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
    this.pendingVaultRenamePaths = /* @__PURE__ */ new Map();
    this.pendingVaultMutationPromises = /* @__PURE__ */ new Set();
    this.priorityNoteSyncTimeouts = /* @__PURE__ */ new Map();
    this.priorityNoteSyncsInFlight = /* @__PURE__ */ new Set();
    this.priorityRenameSyncTimeouts = /* @__PURE__ */ new Map();
    this.priorityRenameSyncsInFlight = /* @__PURE__ */ new Set();
    this.lastVaultSyncAt = 0;
    this.lastVaultSyncStatus = "";
    this.syncInProgress = false;
    this.autoSyncTickInProgress = false;
    this.deletionFolderSuffix = ".__secure-webdav-deletions__/";
    this.eventFolderSuffix = ".__secure-webdav-events__/";
    this.missingLazyRemoteConfirmations = 2;
    this.clientId = "";
    this.recentVaultMutations = [];
    this.appliedRemoteEventIds = /* @__PURE__ */ new Set();
    this.lastFastSyncEventAt = 0;
    this.pendingRemoteEventWrites = [];
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
      eventFolderSuffix: this.eventFolderSuffix,
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
      for (const timeoutId of this.priorityRenameSyncTimeouts.values()) {
        window.clearTimeout(timeoutId);
      }
      this.priorityRenameSyncTimeouts.clear();
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
    for (const timeoutId of this.priorityRenameSyncTimeouts.values()) {
      window.clearTimeout(timeoutId);
    }
    this.priorityRenameSyncTimeouts.clear();
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
      this.pendingVaultRenamePaths = /* @__PURE__ */ new Map();
      this.clientId = this.generateClientId();
      this.recentVaultMutations = [];
      this.appliedRemoteEventIds = /* @__PURE__ */ new Set();
      this.lastFastSyncEventAt = 0;
      this.pendingRemoteEventWrites = [];
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
      this.pendingVaultRenamePaths = /* @__PURE__ */ new Map();
      for (const [oldPath, rawEntry] of Object.entries(candidate.pendingVaultRenamePaths ?? {})) {
        if (!rawEntry || typeof rawEntry !== "object") {
          continue;
        }
        const entry = rawEntry;
        const newPath = typeof entry.newPath === "string" ? entry.newPath : "";
        if (!newPath) {
          continue;
        }
        const oldRemotePath = typeof entry.oldRemotePath === "string" && entry.oldRemotePath.length > 0 ? entry.oldRemotePath : `${this.normalizeFolder(this.settings.vaultSyncRemoteFolder)}${oldPath}`;
        const oldRemoteSignature = typeof entry.oldRemoteSignature === "string" ? entry.oldRemoteSignature : void 0;
        const recordedAt = typeof entry.recordedAt === "number" ? entry.recordedAt : Date.now();
        this.pendingVaultRenamePaths.set(oldPath, {
          oldPath,
          newPath,
          oldRemotePath,
          oldRemoteSignature,
          recordedAt
        });
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
      this.clientId = typeof candidate.clientId === "string" && candidate.clientId.length > 0 ? candidate.clientId : this.generateClientId();
      this.recentVaultMutations = Array.isArray(candidate.recentVaultMutations) ? candidate.recentVaultMutations : [];
      this.appliedRemoteEventIds = new Set(
        Array.isArray(candidate.appliedRemoteEventIds) ? candidate.appliedRemoteEventIds : []
      );
      this.lastFastSyncEventAt = typeof candidate.lastFastSyncEventAt === "number" ? candidate.lastFastSyncEventAt : 0;
      this.pendingRemoteEventWrites = Array.isArray(candidate.pendingRemoteEventWrites) ? candidate.pendingRemoteEventWrites : [];
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
    this.pendingVaultRenamePaths = /* @__PURE__ */ new Map();
    this.lastVaultSyncAt = 0;
    this.lastVaultSyncStatus = "";
    this.clientId = this.generateClientId();
    this.recentVaultMutations = [];
    this.appliedRemoteEventIds = /* @__PURE__ */ new Set();
    this.lastFastSyncEventAt = 0;
    this.pendingRemoteEventWrites = [];
    this.normalizeEffectiveSettings();
  }
  normalizeEffectiveSettings() {
    this.settings.deleteLocalAfterUpload = true;
    this.settings.autoSyncIntervalMinutes = Math.max(0, Math.floor(this.settings.autoSyncIntervalMinutes || 0));
    this.settings.fastSyncRecentChangeLimit = Math.max(10, Math.min(20, Math.floor(this.settings.fastSyncRecentChangeLimit || 20)));
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
  generateClientId() {
    let hostname = "unknown";
    try {
      const os = require("os");
      hostname = os.hostname().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    } catch (_) {}
    return `${hostname}-kim`;
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
      pendingVaultRenamePaths: Object.fromEntries(this.pendingVaultRenamePaths.entries()),
      syncIndex: Object.fromEntries(this.syncIndex.entries()),
      syncedDirectories: [...this.syncedDirectories],
      lastVaultSyncAt: this.lastVaultSyncAt,
      lastVaultSyncStatus: this.lastVaultSyncStatus,
      clientId: this.clientId,
      recentVaultMutations: this.recentVaultMutations,
      appliedRemoteEventIds: [...this.appliedRemoteEventIds],
      lastFastSyncEventAt: this.lastFastSyncEventAt,
      pendingRemoteEventWrites: this.pendingRemoteEventWrites
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
    const isCreate = !this.syncIndex.has(file.path);
    const indexed = this.syncIndex.get(file.path);
    this.appendRecentMutation({
      kind: isCreate ? "create" : "modify",
      path: file.path,
      localSignature: indexed?.localSignature,
      remotePath: indexed?.remotePath,
      remoteSignature: indexed?.remoteSignature
    });
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
      const indexed = this.syncIndex.get(file.path);
      this.appendRecentMutation({
        kind: "delete",
        path: file.path,
        remotePath: indexed?.remotePath,
        remoteSignature: indexed?.remoteSignature
      });
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
      const indexed = this.syncIndex.get(oldPath);
      const trackedOldPath = this.recordPendingVaultRename(oldPath, file.path);
      this.markPendingVaultDeletion(oldPath);
      this.syncIndex.delete(oldPath);
      this.appendRecentMutation({
        kind: "rename",
        path: oldPath,
        oldPath,
        newPath: file.path,
        remotePath: indexed?.remotePath,
        remoteSignature: indexed?.remoteSignature
      });
      await this.savePluginState();
      this.schedulePriorityRenameSync(trackedOldPath);
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
  findPendingVaultRenameByNewPath(newPath) {
    return [...this.pendingVaultRenamePaths.values()].find((entry) => entry.newPath === newPath) ?? null;
  }
  recordPendingVaultRename(oldPath, newPath) {
    const normalizedOldPath = (0, import_obsidian4.normalizePath)(oldPath);
    const normalizedNewPath = (0, import_obsidian4.normalizePath)(newPath);
    const existing = this.findPendingVaultRenameByNewPath(normalizedOldPath);
    const previous = existing ?? this.pendingVaultRenamePaths.get(normalizedOldPath) ?? null;
    if (existing) {
      this.pendingVaultRenamePaths.delete(existing.oldPath);
    }
    const indexed = this.syncIndex.get(normalizedOldPath);
    const trackedOldPath = previous?.oldPath ?? normalizedOldPath;
    const oldRemotePath = previous?.oldRemotePath ?? indexed?.remotePath ?? this.syncSupport.buildVaultSyncRemotePath(normalizedOldPath);
    const oldRemoteSignature = previous?.oldRemoteSignature ?? indexed?.remoteSignature;
    const recordedAt = previous?.recordedAt ?? Date.now();
    this.pendingVaultRenamePaths.set(trackedOldPath, {
      oldPath: trackedOldPath,
      newPath: normalizedNewPath,
      oldRemotePath,
      oldRemoteSignature,
      recordedAt
    });
    return trackedOldPath;
  }
  appendRecentMutation(entry) {
    const now = Date.now();
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const id = `${now}-${this.clientId}-${entry.kind}-${randomSuffix}`;
    const mutation = {
      id,
      kind: entry.kind,
      path: entry.path,
      oldPath: entry.oldPath,
      newPath: entry.newPath,
      localSignature: entry.localSignature,
      remotePath: entry.remotePath,
      remoteSignature: entry.remoteSignature,
      recordedAt: now,
      source: "local-event",
      status: "pending"
    };
    this.recentVaultMutations.push(mutation);
    this.coalesceRecentMutations();
    if (this.recentVaultMutations.length > 200) {
      this.recentVaultMutations = this.recentVaultMutations.slice(-200);
    }
  }
  coalesceRecentMutations() {
    const mutations = this.recentVaultMutations;
    if (mutations.length <= 1) return;
    const survivors = [];
    const pathLastIndex = /* @__PURE__ */ new Map();
    const renameChainNewToOld = /* @__PURE__ */ new Map();
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      const key = m.kind === "rename" ? m.oldPath : m.path;
      pathLastIndex.set(key, i);
      if (m.kind === "rename" && m.newPath) {
        renameChainNewToOld.set(m.newPath, m.oldPath);
      }
    }
    const cancelled = /* @__PURE__ */ new Set();
    const seenPath = /* @__PURE__ */ new Map();
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      const key = m.kind === "rename" ? m.oldPath : m.path;
      if (cancelled.has(i)) continue;
      const prevIdx = seenPath.get(key);
      if (prevIdx !== void 0) {
        const prev = mutations[prevIdx];
        if (prev.kind === "create" && m.kind === "create") {
          cancelled.add(prevIdx);
        } else if (prev.kind === "create" && m.kind === "modify") {
          m.kind = "create";
          cancelled.add(prevIdx);
        } else if (prev.kind === "modify" && m.kind === "create") {
          cancelled.add(prevIdx);
        } else if (prev.kind === "create" && m.kind === "delete") {
          cancelled.add(prevIdx);
          cancelled.add(i);
          continue;
        } else if (prev.kind === "modify" && m.kind === "modify") {
          cancelled.add(prevIdx);
        } else if (prev.kind === "rename" && m.kind === "modify") {
          m.kind = "rename";
          m.localSignature = m.localSignature;
          cancelled.add(prevIdx);
        }
      }
      if (m.kind === "rename" && m.newPath) {
        let chainOrigin = m.oldPath;
        let depth = 0;
        while (renameChainNewToOld.has(chainOrigin) && depth < 10) {
          const older = renameChainNewToOld.get(chainOrigin);
          chainOrigin = older;
          depth++;
          for (let j = 0; j < i; j++) {
            const old = mutations[j];
            if (old.kind === "rename" && old.newPath === chainOrigin) {
              m.oldPath = old.oldPath;
              cancelled.add(j);
              break;
            }
          }
        }
      }
      seenPath.set(key, i);
    }
    for (let i = 0; i < mutations.length; i++) {
      if (!cancelled.has(i)) {
        survivors.push(mutations[i]);
      }
    }
    this.recentVaultMutations = survivors;
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
      const localSig = await this.buildCurrentLocalSignature(file, content);
      await this.writeRemoteSyncEvent({
        id: `${Date.now()}-${this.clientId}-modify-${Math.random().toString(36).slice(2, 8)}`,
        kind: "modify",
        path: file.path,
        remotePath,
        remoteSignature: uploadedRemote.signature,
        localSignature: localSig,
        occurredAt: Date.now()
      });
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
  schedulePriorityRenameSync(oldPath) {
    const existing = this.priorityRenameSyncTimeouts.get(oldPath);
    if (existing) {
      window.clearTimeout(existing);
    }
    const timeoutId = window.setTimeout(() => {
      this.priorityRenameSyncTimeouts.delete(oldPath);
      void this.flushPriorityRenameSync(oldPath);
    }, 700);
    this.priorityRenameSyncTimeouts.set(oldPath, timeoutId);
  }
  async flushPriorityRenameSync(oldPath) {
    if (this.priorityRenameSyncsInFlight.has(oldPath)) {
      return;
    }
    if (this.pendingVaultMutationPromises.size > 0 || this.uploadQueue.hasPendingWork() || this.syncInProgress || this.autoSyncTickInProgress) {
      this.schedulePriorityRenameSync(oldPath);
      return;
    }
    if (!this.pendingVaultRenamePaths.has(oldPath)) {
      return;
    }
    this.priorityRenameSyncsInFlight.add(oldPath);
    const counts = { uploaded: 0, deletedRemoteFiles: 0, skipped: 0 };
    try {
      this.ensureConfigured();
      await this.processPendingVaultRenames(counts, [oldPath]);
      if (counts.uploaded > 0 || counts.deletedRemoteFiles > 0) {
        this.lastVaultSyncAt = Date.now();
        this.lastVaultSyncStatus = this.t(
          `\u5DF2\u4F18\u5148\u540C\u6B65\u91CD\u547D\u540D/\u79FB\u52A8\uFF1A\u4E0A\u4F20 ${counts.uploaded} \u4E2A\u6587\u4EF6\uFF0C\u5220\u9664\u8FDC\u7AEF\u65E7\u8DEF\u5F84 ${counts.deletedRemoteFiles} \u4E2A\u3002`,
          `Prioritized rename/move sync uploaded ${counts.uploaded} file(s) and deleted ${counts.deletedRemoteFiles} stale remote path(s).`
        );
        await this.savePluginState();
      }
    } catch (error) {
      console.error("Priority rename sync failed", error);
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.describeError(
        this.t("\u91CD\u547D\u540D/\u79FB\u52A8\u540E\u7684\u4F18\u5148\u540C\u6B65\u5931\u8D25", "Priority sync after rename/move failed"),
        error
      );
      await this.savePluginState();
      this.schedulePriorityRenameSync(oldPath);
    } finally {
      this.priorityRenameSyncsInFlight.delete(oldPath);
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
      await this.processPendingVaultRenames(counts);
      await this.processPendingVaultDeletions(counts);
      const remoteInventory = await this.listRemoteTree(this.settings.vaultSyncRemoteFolder);
      const deletionTombstones = await this.readDeletionTombstones();
      const remoteFiles = remoteInventory.files;
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
    const counts = { uploaded: 0, deletedRemoteFiles: 0, skipped: 0, detectedLocalChanges: 0, downloadedRemote: 0, conflicts: 0 };
    try {
      this.ensureConfigured();
      await this.waitForPendingVaultMutations();
      const uploadsReady = await this.preparePendingUploadsForSync(showNotice);
      if (!uploadsReady) {
        return;
      }
      const limit = this.settings.fastSyncRecentChangeLimit;
      const remoteEvents = await this.listRecentRemoteSyncEvents(limit);
      await this.replayRemoteSyncEvents(remoteEvents, counts);
      await this.processPendingVaultRenames(counts);
      await this.processPendingVaultDeletions(counts);
      await this.processPendingVaultUploads(counts);
      if (this.appliedRemoteEventIds.size > 500) {
        const arr = [...this.appliedRemoteEventIds];
        this.appliedRemoteEventIds = new Set(arr.slice(-500));
      }
      this.lastFastSyncEventAt = Date.now();
      this.lastVaultSyncAt = Date.now();
      const parts = [];
      if (counts.uploaded > 0) parts.push(this.t(`\u4E0A\u4F20 ${counts.uploaded} \u4E2A\u6587\u4EF6`, `uploaded ${counts.uploaded} file(s)`));
      if (counts.deletedRemoteFiles > 0) parts.push(this.t(`\u5220\u9664\u8FDC\u7AEF ${counts.deletedRemoteFiles} \u4E2A`, `deleted ${counts.deletedRemoteFiles} remote`));
      if (counts.downloadedRemote > 0) parts.push(this.t(`\u62C9\u53D6\u8FDC\u7AEF ${counts.downloadedRemote} \u4E2A`, `pulled ${counts.downloadedRemote} remote`));
      if (counts.conflicts > 0) parts.push(this.t(`${counts.conflicts} \u4E2A\u51B2\u7A81`, `${counts.conflicts} conflict(s)`));
      if (counts.skipped > 0) parts.push(this.t(`\u8DF3\u8FC7 ${counts.skipped} \u4E2A`, `skipped ${counts.skipped}`));
      const summary = parts.length > 0 ? parts.join("\u3001") : this.t("\u65E0\u65B0\u53D8\u66F4", "No new changes");
      this.lastVaultSyncStatus = this.t(
        `\u5FEB\u901F\u540C\u6B65\u5B8C\u6210\uFF1A${summary}\u3002\u5904\u7406\u4E86 ${remoteEvents.length} \u6761\u8FDC\u7AEF\u4E8B\u4EF6\u3002`,
        `Fast sync done: ${summary}. Processed ${remoteEvents.length} remote event(s).`
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
  async processPendingVaultRenames(counts, targetOldPaths) {
    const requested = targetOldPaths ? new Set(targetOldPaths.map((path) => (0, import_obsidian4.normalizePath)(path))) : null;
    for (const [oldPath, entry] of [...this.pendingVaultRenamePaths.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (requested && !requested.has(oldPath)) {
        continue;
      }
      if (this.syncSupport.shouldSkipContentSyncPath(oldPath) || this.syncSupport.shouldSkipContentSyncPath(entry.newPath)) {
        this.pendingVaultRenamePaths.delete(oldPath);
        this.pendingVaultDeletionPaths.delete(oldPath);
        counts.skipped += 1;
        continue;
      }
      await this.writeDeletionTombstone(oldPath, entry.oldRemoteSignature);
      await this.deleteRemoteContentFile(entry.oldRemotePath);
      this.pendingVaultDeletionPaths.delete(oldPath);
      this.syncIndex.delete(oldPath);
      counts.deletedRemoteFiles += 1;
      const file = this.getVaultFileByPath(entry.newPath);
      if (!(file instanceof import_obsidian4.TFile)) {
        this.pendingVaultRenamePaths.delete(oldPath);
        counts.skipped += 1;
        continue;
      }
      const markdownContent = file.extension === "md" ? await this.readMarkdownContentPreferEditor(file) : void 0;
      if (file.extension === "md" && this.parseNoteStub(markdownContent ?? "")) {
        this.pendingVaultRenamePaths.delete(oldPath);
        this.pendingVaultSyncPaths.delete(file.path);
        counts.skipped += 1;
        continue;
      }
      const remotePath = this.syncSupport.buildVaultSyncRemotePath(file.path);
      const localSignature = await this.buildCurrentLocalSignature(file, markdownContent);
      let remoteAtNewPath = null;
      try {
        remoteAtNewPath = await this.statRemoteFile(remotePath);
      } catch {
        remoteAtNewPath = null;
      }
      if (remoteAtNewPath && remoteAtNewPath.signature !== localSignature) {
        await this.createLocalConflictCopy(file, markdownContent ?? void 0, "local");
      }
      const uploadedRemote = await this.uploadContentFileToRemote(file, remotePath, markdownContent);
      this.syncIndex.set(file.path, {
        localSignature,
        remoteSignature: uploadedRemote.signature,
        remotePath
      });
      this.pendingVaultSyncPaths.delete(file.path);
      this.pendingVaultRenamePaths.delete(oldPath);
      await this.deleteDeletionTombstone(file.path);
      counts.uploaded += 1;
      const recentMutation = this.recentVaultMutations.find((m) => m.kind === "rename" && m.oldPath === oldPath && m.status === "pending");
      if (recentMutation) {
        recentMutation.status = "applied";
        recentMutation.newPath = entry.newPath;
        recentMutation.remotePath = remotePath;
        recentMutation.remoteSignature = uploadedRemote.signature;
      }
      await this.writeRemoteSyncEvent({
        id: `${Date.now()}-${this.clientId}-rename-${Math.random().toString(36).slice(2, 8)}`,
        kind: "rename",
        path: oldPath,
        oldPath,
        newPath: entry.newPath,
        remotePath,
        remoteSignature: uploadedRemote.signature,
        localSignature,
        tombstonePath: this.syncSupport.buildDeletionRemotePath(oldPath),
        occurredAt: Date.now()
      });
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
      const recentMutation = this.recentVaultMutations.find((m) => m.path === path && m.kind === "delete" && m.status === "pending");
      if (recentMutation) {
        recentMutation.status = "applied";
      }
      await this.writeRemoteSyncEvent({
        id: `${Date.now()}-${this.clientId}-delete-${Math.random().toString(36).slice(2, 8)}`,
        kind: "delete",
        path,
        remotePath: entry.remotePath,
        remoteSignature: entry.remoteSignature,
        tombstonePath: this.syncSupport.buildDeletionRemotePath(path),
        occurredAt: Date.now()
      });
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
      const recentMutation = this.recentVaultMutations.find((m) => m.path === path && (m.kind === "create" || m.kind === "modify") && m.status === "pending");
      if (recentMutation) {
        recentMutation.status = "applied";
        recentMutation.remotePath = remotePath;
        recentMutation.remoteSignature = uploadedRemote.signature;
      }
      await this.writeRemoteSyncEvent({
        id: `${Date.now()}-${this.clientId}-${recentMutation?.kind || "modify"}-${Math.random().toString(36).slice(2, 8)}`,
        kind: recentMutation?.kind || "modify",
        path: file.path,
        remotePath,
        remoteSignature: uploadedRemote.signature,
        localSignature,
        occurredAt: Date.now()
      });
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
      if (this.pendingVaultRenamePaths.has(vaultPath)) {
        counts.skipped += 1;
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
  async replayRemoteSyncEvents(events, counts) {
    for (const event of events) {
      try {
        await this.replaySingleRemoteEvent(event, counts);
        this.appliedRemoteEventIds.add(event.id);
      } catch (err) {
        console.warn("Failed to replay remote event:", event.id, err);
        counts.skipped += 1;
      }
    }
  }
  async replaySingleRemoteEvent(event, counts) {
    if (event.kind === "create" || event.kind === "modify") {
      await this.replayRemoteCreateOrModify(event, counts);
    } else if (event.kind === "delete") {
      await this.replayRemoteDelete(event, counts);
    } else if (event.kind === "rename") {
      await this.replayRemoteRename(event, counts);
    }
  }
  async replayRemoteCreateOrModify(event, counts) {
    const vaultPath = this.syncSupport.remotePathToVaultPath(event.remotePath);
    if (!vaultPath || this.syncSupport.shouldSkipContentSyncPath(vaultPath)) {
      counts.skipped += 1;
      return;
    }
    const existingFile = this.getVaultFileByPath(vaultPath);
    const remotePath = event.remotePath;
    let remote;
    try {
      remote = await this.statRemoteFile(remotePath);
    } catch {
      counts.skipped += 1;
      return;
    }
    if (!remote) {
      counts.skipped += 1;
      return;
    }
    if (!existingFile) {
      await this.downloadRemoteFileToVault(vaultPath, remote);
      const downloaded = this.getVaultFileByPath(vaultPath);
      if (downloaded) {
        this.syncIndex.set(vaultPath, {
          localSignature: await this.buildCurrentLocalSignature(downloaded),
          remoteSignature: remote.signature,
          remotePath
        });
      }
      counts.downloadedRemote += 1;
      return;
    }
    const currentSig = await this.buildCurrentLocalSignature(existingFile);
    const indexed = this.syncIndex.get(vaultPath);
    const localUnchanged = indexed && currentSig === indexed.localSignature;
    if (localUnchanged) {
      await this.downloadRemoteFileToVault(vaultPath, remote, existingFile);
      this.syncIndex.set(vaultPath, {
        localSignature: await this.buildCurrentLocalSignature(existingFile),
        remoteSignature: remote.signature,
        remotePath
      });
      counts.downloadedRemote += 1;
      return;
    }
    await this.createLocalConflictCopy(existingFile, void 0, "remote");
    counts.conflicts += 1;
  }
  async replayRemoteDelete(event, counts) {
    const vaultPath = this.syncSupport.remotePathToVaultPath(event.remotePath);
    if (!vaultPath || this.syncSupport.shouldSkipContentSyncPath(vaultPath)) {
      counts.skipped += 1;
      return;
    }
    const existingFile = this.getVaultFileByPath(vaultPath);
    if (!existingFile) {
      counts.skipped += 1;
      return;
    }
    const currentSig = await this.buildCurrentLocalSignature(existingFile);
    const indexed = this.syncIndex.get(vaultPath);
    const localUnchanged = indexed && currentSig === indexed.localSignature;
    if (!localUnchanged) {
      counts.conflicts += 1;
      return;
    }
    let tombstone = null;
    if (event.tombstonePath) {
      try {
        const response = await this.requestUrl({
          url: this.buildUploadUrl(event.tombstonePath),
          method: "GET"
        });
        tombstone = this.syncSupport.parseDeletionTombstonePayload(this.decodeUtf8(response.arrayBuffer));
      } catch {}
    }
    if (tombstone && this.syncSupport.isTombstoneAuthoritative(tombstone, { remotePath: event.remotePath, lastModified: 0, size: 0, signature: event.remoteSignature })) {
      await this.removeLocalVaultFile(existingFile);
      this.syncIndex.delete(vaultPath);
      counts.deletedRemoteFiles += 1;
    } else {
      counts.skipped += 1;
    }
  }
  async replayRemoteRename(event, counts) {
    const oldVaultPath = this.syncSupport.remotePathToVaultPath(event.remotePath || "");
    const newVaultPath = event.newPath ? this.syncSupport.remotePathToVaultPath(
      this.syncSupport.buildVaultSyncRemotePath(event.newPath)
    ) : null;
    if (newVaultPath && this.syncSupport.shouldSkipContentSyncPath(newVaultPath)) {
      counts.skipped += 1;
      return;
    }
    if (oldVaultPath) {
      const oldFile = this.getVaultFileByPath(oldVaultPath);
      if (oldFile) {
        const currentSig = await this.buildCurrentLocalSignature(oldFile);
        const indexed = this.syncIndex.get(oldVaultPath);
        const localUnchanged = indexed && currentSig === indexed.localSignature;
        if (localUnchanged) {
          await this.removeLocalVaultFile(oldFile);
          this.syncIndex.delete(oldVaultPath);
        } else {
          counts.conflicts += 1;
        }
      }
    }
    if (newVaultPath) {
      const newRemotePath = this.syncSupport.buildVaultSyncRemotePath(event.newPath);
      let remote;
      try {
        remote = await this.statRemoteFile(newRemotePath);
      } catch {
        remote = null;
      }
      if (remote) {
        const newFile = this.getVaultFileByPath(newVaultPath);
        if (!newFile) {
          await this.downloadRemoteFileToVault(newVaultPath, remote);
          const downloaded = this.getVaultFileByPath(newVaultPath);
          if (downloaded) {
            this.syncIndex.set(newVaultPath, {
              localSignature: await this.buildCurrentLocalSignature(downloaded),
              remoteSignature: remote.signature,
              remotePath: newRemotePath
            });
          }
          counts.downloadedRemote += 1;
        }
      }
    }
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
  async ensureRemoteEventFolder() {
    const eventFolder = this.syncSupport.buildRemoteEventFolder();
    await this.ensureRemoteDirectories(eventFolder);
  }
  async writeRemoteSyncEvent(event) {
    const eventFolder = this.syncSupport.buildRemoteEventFolder();
    const eventFileName = `${event.id}.json`;
    const eventRemotePath = `${eventFolder}${eventFileName}`;
    const payload = JSON.stringify({
      id: event.id,
      clientId: this.clientId,
      kind: event.kind,
      scope: "vault-content",
      occurredAt: event.occurredAt || Date.now(),
      path: event.path,
      oldPath: event.oldPath,
      newPath: event.newPath,
      remotePath: event.remotePath,
      remoteSignature: event.remoteSignature,
      localSignature: event.localSignature,
      tombstonePath: event.tombstonePath,
      source: event.source || "local-sync",
      version: 1
    });
    try {
      await this.ensureRemoteEventFolder();
      await this.requestUrl({
        url: this.buildUploadUrl(eventRemotePath),
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: this.encodeUtf8(payload)
      });
    } catch (writeError) {
      console.warn("Failed to write remote sync event (non-fatal):", writeError);
      this.pendingRemoteEventWrites.push(event);
    }
  }
  async listRecentRemoteSyncEvents(limit) {
    const eventFolder = this.syncSupport.buildRemoteEventFolder();
    let listing;
    try {
      listing = await this.listRemoteDirectory(eventFolder);
    } catch {
      return [];
    }
    const fileEntries = listing.filter((entry) => !entry.isCollection && entry.remotePath.endsWith(".json"));
    fileEntries.sort((a, b) => {
      const ta = a.file?.lastModified ?? 0;
      const tb = b.file?.lastModified ?? 0;
      return tb - ta;
    });
    const candidates = fileEntries.slice(0, limit * 2);
    const events = [];
    for (const entry of candidates) {
      if (events.length >= limit) break;
      try {
        const response = await this.requestUrl({
          url: this.buildUploadUrl(entry.remotePath),
          method: "GET"
        });
        const raw = JSON.parse(this.decodeUtf8(response.arrayBuffer));
        if (!raw || typeof raw !== "object" || !raw.id || !raw.kind) continue;
        if (raw.clientId === this.clientId) continue;
        if (this.appliedRemoteEventIds.has(raw.id)) continue;
        events.push(raw);
      } catch {
        continue;
      }
    }
    events.sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0));
    return events.slice(0, limit);
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
    let remote = null;
    try {
      remote = await this.statRemoteFile(remotePath);
    } catch {
      remote = null;
    }
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
    new import_obsidian4.Setting(containerEl).setName(this.plugin.t("\u5FEB\u901F\u540C\u6B65\u4E8B\u4EF6\u6570\u91CF", "Fast sync event limit")).setDesc(
      this.plugin.t(
        "\u5FEB\u901F\u540C\u6B65\u53EA\u5904\u7406\u6700\u8FD1 N \u6761\u771F\u5B9E\u53D8\u66F4\u4E8B\u4EF6\uFF08\u5305\u542B\u65B0\u589E\u3001\u4FEE\u6539\u3001\u5220\u9664\u3001\u91CD\u547D\u540D\uFF09\u3002\u8303\u56F4 10-20\uFF0C\u9ED8\u8BA4 20\u3002\u5B8C\u6574\u540C\u6B65\u4ECD\u7528\u4E8E\u5168\u91CF\u5BF9\u8D26\u4E0E\u4FEE\u590D\u3002",
        "Fast sync only processes the most recent N real change events (create, modify, delete, rename). Range 10-20, default 20. Full sync remains available for complete reconciliation."
      )
    ).addText(
      (text) => text.setPlaceholder("20").setValue(String(this.plugin.settings.fastSyncRecentChangeLimit)).onChange(async (value) => {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isNaN(parsed)) {
          this.plugin.settings.fastSyncRecentChangeLimit = Math.max(10, Math.min(20, parsed));
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyIsICJzZWN1cmUtd2ViZGF2LWltYWdlLXN1cHBvcnQudHMiLCAic2VjdXJlLXdlYmRhdi11cGxvYWQtcXVldWUudHMiLCAic2VjdXJlLXdlYmRhdi1zeW5jLXN1cHBvcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIlx1RkVGRmltcG9ydCB7XG4gIEFwcCxcbiAgRWRpdG9yLFxuICBNYXJrZG93bkZpbGVJbmZvLFxuICBNYXJrZG93blZpZXcsXG4gIE1vZGFsLFxuICBOb3RpY2UsXG4gIFBsdWdpbixcbiAgUGx1Z2luU2V0dGluZ1RhYixcbiAgU2V0dGluZyxcbiAgVEFic3RyYWN0RmlsZSxcbiAgVEZpbGUsXG4gIFRGb2xkZXIsXG4gIG5vcm1hbGl6ZVBhdGgsXG4gIHJlcXVlc3RVcmwgYXMgb2JzaWRpYW5SZXF1ZXN0VXJsLFxufSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7IFNFQ1VSRV9DT0RFX0JMT0NLLCBTRUNVUkVfUFJPVE9DT0wsIFNlY3VyZVdlYmRhdkltYWdlU3VwcG9ydCB9IGZyb20gXCIuL3NlY3VyZS13ZWJkYXYtaW1hZ2Utc3VwcG9ydFwiO1xuaW1wb3J0IHsgU2VjdXJlV2ViZGF2VXBsb2FkUXVldWVTdXBwb3J0LCB0eXBlIFVwbG9hZFRhc2sgfSBmcm9tIFwiLi9zZWN1cmUtd2ViZGF2LXVwbG9hZC1xdWV1ZVwiO1xuaW1wb3J0IHtcbiAgU2VjdXJlV2ViZGF2U3luY1N1cHBvcnQsXG4gIHR5cGUgRGVsZXRpb25Ub21ic3RvbmUsXG4gIG5vcm1hbGl6ZUZvbGRlcixcbn0gZnJvbSBcIi4vc2VjdXJlLXdlYmRhdi1zeW5jLXN1cHBvcnRcIjtcblxudHlwZSBTZWN1cmVXZWJkYXZTZXR0aW5ncyA9IHtcbiAgd2ViZGF2VXJsOiBzdHJpbmc7XG4gIHVzZXJuYW1lOiBzdHJpbmc7XG4gIHBhc3N3b3JkOiBzdHJpbmc7XG4gIHJlbW90ZUZvbGRlcjogc3RyaW5nO1xuICB2YXVsdFN5bmNSZW1vdGVGb2xkZXI6IHN0cmluZztcbiAgZXhjbHVkZWRTeW5jRm9sZGVyczogc3RyaW5nW107XG4gIG5hbWluZ1N0cmF0ZWd5OiBcInRpbWVzdGFtcFwiIHwgXCJoYXNoXCI7XG4gIGRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQ6IGJvb2xlYW47XG4gIGxhbmd1YWdlOiBcImF1dG9cIiB8IFwiemhcIiB8IFwiZW5cIjtcbiAgbm90ZVN0b3JhZ2VNb2RlOiBcImZ1bGwtbG9jYWxcIiB8IFwibGF6eS1ub3Rlc1wiO1xuICBub3RlRXZpY3RBZnRlckRheXM6IG51bWJlcjtcbiAgYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXM6IG51bWJlcjtcbiAgbWF4UmV0cnlBdHRlbXB0czogbnVtYmVyO1xuICByZXRyeURlbGF5U2Vjb25kczogbnVtYmVyO1xuICBkZWxldGVSZW1vdGVXaGVuVW5yZWZlcmVuY2VkOiBib29sZWFuO1xuICBjb21wcmVzc0ltYWdlczogYm9vbGVhbjtcbiAgY29tcHJlc3NUaHJlc2hvbGRLYjogbnVtYmVyO1xuICBtYXhJbWFnZURpbWVuc2lvbjogbnVtYmVyO1xuICBqcGVnUXVhbGl0eTogbnVtYmVyO1xufTtcblxudHlwZSBTeW5jSW5kZXhFbnRyeSA9IHtcbiAgbG9jYWxTaWduYXR1cmU6IHN0cmluZztcbiAgcmVtb3RlU2lnbmF0dXJlOiBzdHJpbmc7XG4gIHJlbW90ZVBhdGg6IHN0cmluZztcbn07XG5cbnR5cGUgUmVtb3RlRmlsZVN0YXRlID0ge1xuICByZW1vdGVQYXRoOiBzdHJpbmc7XG4gIGxhc3RNb2RpZmllZDogbnVtYmVyO1xuICBzaXplOiBudW1iZXI7XG4gIHNpZ25hdHVyZTogc3RyaW5nO1xufTtcblxudHlwZSBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZCA9IHtcbiAgZmlyc3REZXRlY3RlZEF0OiBudW1iZXI7XG4gIGxhc3REZXRlY3RlZEF0OiBudW1iZXI7XG4gIG1pc3NDb3VudDogbnVtYmVyO1xufTtcblxudHlwZSBQZW5kaW5nRGVsZXRpb25FbnRyeSA9IHtcbiAgcmVtb3RlUGF0aDogc3RyaW5nO1xuICByZW1vdGVTaWduYXR1cmU/OiBzdHJpbmc7XG59O1xuXG50eXBlIFBlbmRpbmdSZW5hbWVFbnRyeSA9IHtcbiAgb2xkUGF0aDogc3RyaW5nO1xuICBuZXdQYXRoOiBzdHJpbmc7XG4gIG9sZFJlbW90ZVBhdGg6IHN0cmluZztcbiAgb2xkUmVtb3RlU2lnbmF0dXJlPzogc3RyaW5nO1xuICByZWNvcmRlZEF0OiBudW1iZXI7XG59O1xuXG50eXBlIFJlbW90ZUludmVudG9yeSA9IHtcbiAgZmlsZXM6IE1hcDxzdHJpbmcsIFJlbW90ZUZpbGVTdGF0ZT47XG4gIGRpcmVjdG9yaWVzOiBTZXQ8c3RyaW5nPjtcbn07XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFNlY3VyZVdlYmRhdlNldHRpbmdzID0ge1xuICB3ZWJkYXZVcmw6IFwiXCIsXG4gIHVzZXJuYW1lOiBcIlwiLFxuICBwYXNzd29yZDogXCJcIixcbiAgcmVtb3RlRm9sZGVyOiBcIi9yZW1vdGUtaW1hZ2VzL1wiLFxuICB2YXVsdFN5bmNSZW1vdGVGb2xkZXI6IFwiL3ZhdWx0LXN5bmMvXCIsXG4gIGV4Y2x1ZGVkU3luY0ZvbGRlcnM6IFtcImtiXCJdLFxuICBuYW1pbmdTdHJhdGVneTogXCJoYXNoXCIsXG4gIGRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQ6IHRydWUsXG4gIGxhbmd1YWdlOiBcImF1dG9cIixcbiAgbm90ZVN0b3JhZ2VNb2RlOiBcImZ1bGwtbG9jYWxcIixcbiAgbm90ZUV2aWN0QWZ0ZXJEYXlzOiAzMCxcbiAgYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXM6IDAsXG4gIG1heFJldHJ5QXR0ZW1wdHM6IDUsXG4gIHJldHJ5RGVsYXlTZWNvbmRzOiA1LFxuICBkZWxldGVSZW1vdGVXaGVuVW5yZWZlcmVuY2VkOiB0cnVlLFxuICBjb21wcmVzc0ltYWdlczogdHJ1ZSxcbiAgY29tcHJlc3NUaHJlc2hvbGRLYjogMzAwLFxuICBtYXhJbWFnZURpbWVuc2lvbjogMjIwMCxcbiAganBlZ1F1YWxpdHk6IDgyLFxufTtcblxuY29uc3QgTUlNRV9NQVA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIGpwZzogXCJpbWFnZS9qcGVnXCIsXG4gIGpwZWc6IFwiaW1hZ2UvanBlZ1wiLFxuICBwbmc6IFwiaW1hZ2UvcG5nXCIsXG4gIGdpZjogXCJpbWFnZS9naWZcIixcbiAgd2VicDogXCJpbWFnZS93ZWJwXCIsXG4gIHN2ZzogXCJpbWFnZS9zdmcreG1sXCIsXG4gIGJtcDogXCJpbWFnZS9ibXBcIixcbiAgXCJpbWFnZS9qcGVnXCI6IFwianBnXCIsXG4gIFwiaW1hZ2UvcG5nXCI6IFwicG5nXCIsXG4gIFwiaW1hZ2UvZ2lmXCI6IFwiZ2lmXCIsXG4gIFwiaW1hZ2Uvd2VicFwiOiBcIndlYnBcIixcbiAgXCJpbWFnZS9ibXBcIjogXCJibXBcIixcbiAgXCJpbWFnZS9zdmcreG1sXCI6IFwic3ZnXCIsXG59O1xuXG5jb25zdCBTRUNVUkVfTk9URV9TVFVCID0gXCJzZWN1cmUtd2ViZGF2LW5vdGUtc3R1YlwiO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTZWN1cmVXZWJkYXZJbWFnZXNQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogU2VjdXJlV2ViZGF2U2V0dGluZ3MgPSBERUZBVUxUX1NFVFRJTkdTO1xuICBxdWV1ZTogVXBsb2FkVGFza1tdID0gW107XG4gIHByaXZhdGUgYmxvYlVybHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSByZWFkb25seSBtYXhCbG9iVXJscyA9IDEwMDtcbiAgcHJpdmF0ZSBub3RlUmVtb3RlUmVmcyA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8c3RyaW5nPj4oKTtcbiAgcHJpdmF0ZSByZW1vdGVDbGVhbnVwSW5GbGlnaHQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBub3RlQWNjZXNzVGltZXN0YW1wcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG4gIHByaXZhdGUgc3luY0luZGV4ID0gbmV3IE1hcDxzdHJpbmcsIFN5bmNJbmRleEVudHJ5PigpO1xuICBwcml2YXRlIHN5bmNlZERpcmVjdG9yaWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgbWlzc2luZ0xhenlSZW1vdGVOb3RlcyA9IG5ldyBNYXA8c3RyaW5nLCBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZD4oKTtcbiAgcHJpdmF0ZSBwZW5kaW5nVmF1bHRTeW5jUGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBwZW5kaW5nVmF1bHREZWxldGlvblBhdGhzID0gbmV3IE1hcDxzdHJpbmcsIFBlbmRpbmdEZWxldGlvbkVudHJ5PigpO1xuICBwcml2YXRlIHBlbmRpbmdWYXVsdFJlbmFtZVBhdGhzID0gbmV3IE1hcDxzdHJpbmcsIFBlbmRpbmdSZW5hbWVFbnRyeT4oKTtcbiAgcHJpdmF0ZSBwZW5kaW5nVmF1bHRNdXRhdGlvblByb21pc2VzID0gbmV3IFNldDxQcm9taXNlPHZvaWQ+PigpO1xuICBwcml2YXRlIHByaW9yaXR5Tm90ZVN5bmNUaW1lb3V0cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG4gIHByaXZhdGUgcHJpb3JpdHlOb3RlU3luY3NJbkZsaWdodCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIHByaW9yaXR5UmVuYW1lU3luY1RpbWVvdXRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgcHJpdmF0ZSBwcmlvcml0eVJlbmFtZVN5bmNzSW5GbGlnaHQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBsYXN0VmF1bHRTeW5jQXQgPSAwO1xuICBwcml2YXRlIGxhc3RWYXVsdFN5bmNTdGF0dXMgPSBcIlwiO1xuICBwcml2YXRlIHN5bmNJblByb2dyZXNzID0gZmFsc2U7XG4gIHByaXZhdGUgYXV0b1N5bmNUaWNrSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICAvLyBJbWFnZSBwYXJzaW5nIGFuZCByZW5kZXJpbmcgbGl2ZSBpbiBhIGRlZGljYXRlZCBoZWxwZXIgc28gc3luYyBjaGFuZ2VzXG4gIC8vIGRvIG5vdCBhY2NpZGVudGFsbHkgYnJlYWsgZGlzcGxheSBiZWhhdmlvdXIgYWdhaW4uXG4gIHByaXZhdGUgaW1hZ2VTdXBwb3J0ITogU2VjdXJlV2ViZGF2SW1hZ2VTdXBwb3J0O1xuICAvLyBVcGxvYWQgcXVldWUgc3RhdGUgaXMgaXNvbGF0ZWQgc28gcmV0cmllcyBhbmQgcGxhY2Vob2xkZXIgcmVwbGFjZW1lbnQgZG9cbiAgLy8gbm90IGtlZXAgc3ByYXdsaW5nIGFjcm9zcyB0aGUgbWFpbiBwbHVnaW4gY2xhc3MuXG4gIHByaXZhdGUgdXBsb2FkUXVldWUhOiBTZWN1cmVXZWJkYXZVcGxvYWRRdWV1ZVN1cHBvcnQ7XG4gIC8vIFN5bmMgbWV0YWRhdGEgaGVscGVycyBhcmUgaXNvbGF0ZWQgc28gcmVjb25jaWxpYXRpb24gcnVsZXMgc3RheSBleHBsaWNpdC5cbiAgcHJpdmF0ZSBzeW5jU3VwcG9ydCE6IFNlY3VyZVdlYmRhdlN5bmNTdXBwb3J0O1xuXG4gIHByaXZhdGUgcmVhZG9ubHkgZGVsZXRpb25Gb2xkZXJTdWZmaXggPSBcIi5fX3NlY3VyZS13ZWJkYXYtZGVsZXRpb25zX18vXCI7XG4gIHByaXZhdGUgcmVhZG9ubHkgbWlzc2luZ0xhenlSZW1vdGVDb25maXJtYXRpb25zID0gMjtcblxuICBwcml2YXRlIGluaXRpYWxpemVTdXBwb3J0TW9kdWxlcygpIHtcbiAgICAvLyBLZWVwIHJ1bnRpbWUtb25seSBpbnRlZ3JhdGlvbiBoZXJlOiB0aGUgaW1hZ2UgbW9kdWxlIG93bnMgcGFyc2luZyBhbmRcbiAgICAvLyByZW5kZXJpbmcsIHdoaWxlIHRoZSBwbHVnaW4gc3RpbGwgb3ducyBXZWJEQVYgYWNjZXNzIGFuZCBsaWZlY3ljbGUuXG4gICAgdGhpcy5pbWFnZVN1cHBvcnQgPSBuZXcgU2VjdXJlV2ViZGF2SW1hZ2VTdXBwb3J0KHtcbiAgICAgIHQ6IHRoaXMudC5iaW5kKHRoaXMpLFxuICAgICAgZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmw6IHRoaXMuZmV0Y2hTZWN1cmVJbWFnZUJsb2JVcmwuYmluZCh0aGlzKSxcbiAgICB9KTtcbiAgICB0aGlzLnVwbG9hZFF1ZXVlID0gbmV3IFNlY3VyZVdlYmRhdlVwbG9hZFF1ZXVlU3VwcG9ydCh7XG4gICAgICBhcHA6IHRoaXMuYXBwLFxuICAgICAgdDogdGhpcy50LmJpbmQodGhpcyksXG4gICAgICBzZXR0aW5nczogKCkgPT4gdGhpcy5zZXR0aW5ncyxcbiAgICAgIGdldFF1ZXVlOiAoKSA9PiB0aGlzLnF1ZXVlLFxuICAgICAgc2V0UXVldWU6IChxdWV1ZSkgPT4ge1xuICAgICAgICB0aGlzLnF1ZXVlID0gcXVldWU7XG4gICAgICB9LFxuICAgICAgc2F2ZVBsdWdpblN0YXRlOiB0aGlzLnNhdmVQbHVnaW5TdGF0ZS5iaW5kKHRoaXMpLFxuICAgICAgc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jOiB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYy5iaW5kKHRoaXMpLFxuICAgICAgcmVxdWVzdFVybDogdGhpcy5yZXF1ZXN0VXJsLmJpbmQodGhpcyksXG4gICAgICBidWlsZFVwbG9hZFVybDogdGhpcy5idWlsZFVwbG9hZFVybC5iaW5kKHRoaXMpLFxuICAgICAgYnVpbGRBdXRoSGVhZGVyOiB0aGlzLmJ1aWxkQXV0aEhlYWRlci5iaW5kKHRoaXMpLFxuICAgICAgcHJlcGFyZVVwbG9hZFBheWxvYWQ6IHRoaXMucHJlcGFyZVVwbG9hZFBheWxvYWQuYmluZCh0aGlzKSxcbiAgICAgIGJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5OiB0aGlzLmJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5LmJpbmQodGhpcyksXG4gICAgICBidWlsZFJlbW90ZVBhdGg6IHRoaXMuYnVpbGRSZW1vdGVQYXRoLmJpbmQodGhpcyksXG4gICAgICBidWlsZFNlY3VyZUltYWdlTWFya3VwOiB0aGlzLmltYWdlU3VwcG9ydC5idWlsZFNlY3VyZUltYWdlTWFya3VwLmJpbmQodGhpcy5pbWFnZVN1cHBvcnQpLFxuICAgICAgZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWU6IHRoaXMuZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUuYmluZCh0aGlzKSxcbiAgICAgIGFycmF5QnVmZmVyVG9CYXNlNjQ6IHRoaXMuYXJyYXlCdWZmZXJUb0Jhc2U2NC5iaW5kKHRoaXMpLFxuICAgICAgYmFzZTY0VG9BcnJheUJ1ZmZlcjogdGhpcy5iYXNlNjRUb0FycmF5QnVmZmVyLmJpbmQodGhpcyksXG4gICAgICBlc2NhcGVIdG1sOiB0aGlzLmVzY2FwZUh0bWwuYmluZCh0aGlzKSxcbiAgICAgIGVzY2FwZVJlZ0V4cDogdGhpcy5lc2NhcGVSZWdFeHAuYmluZCh0aGlzKSxcbiAgICAgIGRlc2NyaWJlRXJyb3I6IHRoaXMuZGVzY3JpYmVFcnJvci5iaW5kKHRoaXMpLFxuICAgIH0pO1xuICAgIHRoaXMuc3luY1N1cHBvcnQgPSBuZXcgU2VjdXJlV2ViZGF2U3luY1N1cHBvcnQoe1xuICAgICAgYXBwOiB0aGlzLmFwcCxcbiAgICAgIGdldFZhdWx0U3luY1JlbW90ZUZvbGRlcjogKCkgPT4gdGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIsXG4gICAgICBnZXRFeGNsdWRlZFN5bmNGb2xkZXJzOiAoKSA9PiB0aGlzLnNldHRpbmdzLmV4Y2x1ZGVkU3luY0ZvbGRlcnMgPz8gW10sXG4gICAgICBkZWxldGlvbkZvbGRlclN1ZmZpeDogdGhpcy5kZWxldGlvbkZvbGRlclN1ZmZpeCxcbiAgICAgIGVuY29kZUJhc2U2NFVybDogKHZhbHVlKSA9PlxuICAgICAgICB0aGlzLmFycmF5QnVmZmVyVG9CYXNlNjQodGhpcy5lbmNvZGVVdGY4KHZhbHVlKSkucmVwbGFjZSgvXFwrL2csIFwiLVwiKS5yZXBsYWNlKC9cXC8vZywgXCJfXCIpLnJlcGxhY2UoLz0rJC9nLCBcIlwiKSxcbiAgICAgIGRlY29kZUJhc2U2NFVybDogKHZhbHVlKSA9PiB7XG4gICAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSB2YWx1ZS5yZXBsYWNlKC8tL2csIFwiK1wiKS5yZXBsYWNlKC9fL2csIFwiL1wiKTtcbiAgICAgICAgY29uc3QgcGFkZGVkID0gbm9ybWFsaXplZCArIFwiPVwiLnJlcGVhdCgoNCAtIChub3JtYWxpemVkLmxlbmd0aCAlIDQgfHwgNCkpICUgNCk7XG4gICAgICAgIHJldHVybiB0aGlzLmRlY29kZVV0ZjgodGhpcy5iYXNlNjRUb0FycmF5QnVmZmVyKHBhZGRlZCkpO1xuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIG9ubG9hZCgpIHtcbiAgICBhd2FpdCB0aGlzLmxvYWRQbHVnaW5TdGF0ZSgpO1xuICAgIHRoaXMuaW5pdGlhbGl6ZVN1cHBvcnRNb2R1bGVzKCk7XG5cbiAgICB0aGlzLmFkZFNldHRpbmdUYWIobmV3IFNlY3VyZVdlYmRhdlNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJ1cGxvYWQtY3VycmVudC1ub3RlLWxvY2FsLWltYWdlc1wiLFxuICAgICAgbmFtZTogXCJVcGxvYWQgbG9jYWwgaW1hZ2VzIGluIGN1cnJlbnQgbm90ZSB0byBXZWJEQVZcIixcbiAgICAgIGNoZWNrQ2FsbGJhY2s6IChjaGVja2luZykgPT4ge1xuICAgICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICAgICAgaWYgKCFmaWxlKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFjaGVja2luZykge1xuICAgICAgICAgIHZvaWQgdGhpcy51cGxvYWRJbWFnZXNJbk5vdGUoZmlsZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwidGVzdC13ZWJkYXYtY29ubmVjdGlvblwiLFxuICAgICAgbmFtZTogXCJUZXN0IFdlYkRBViBjb25uZWN0aW9uXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4ge1xuICAgICAgICB2b2lkIHRoaXMucnVuQ29ubmVjdGlvblRlc3QodHJ1ZSk7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInN5bmMtY29uZmlndXJlZC12YXVsdC1jb250ZW50LXRvLXdlYmRhdlwiLFxuICAgICAgbmFtZTogXCJGYXN0IHN5bmMgY2hhbmdlZCB2YXVsdCBjb250ZW50IHRvIFdlYkRBVlwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLnJ1bk1hbnVhbFN5bmMoKTtcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiZnVsbC1yZWNvbmNpbGUtdmF1bHQtY29udGVudC10by13ZWJkYXZcIixcbiAgICAgIG5hbWU6IFwiRnVsbCByZWNvbmNpbGUgdmF1bHQgY29udGVudCB3aXRoIFdlYkRBVlwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLnJ1bkZ1bGxSZWNvbmNpbGVTeW5jKCk7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgZmFzdFN5bmNSaWJib24gPSB0aGlzLmFkZFJpYmJvbkljb24oXCJ6YXBcIiwgdGhpcy50KFwiXHU1RkVCXHU5MDFGXHU1NDBDXHU2QjY1XHU1MjMwIFdlYkRBVlwiLCBcIkZhc3Qgc3luYyB0byBXZWJEQVZcIiksICgpID0+IHtcbiAgICAgIHZvaWQgdGhpcy5ydW5NYW51YWxTeW5jKCk7XG4gICAgfSk7XG4gICAgZmFzdFN5bmNSaWJib24uYWRkQ2xhc3MoXCJzZWN1cmUtd2ViZGF2LXN5bmMtcmliYm9uXCIpO1xuICAgIGZhc3RTeW5jUmliYm9uLmFkZENsYXNzKFwic2VjdXJlLXdlYmRhdi1mYXN0LXN5bmMtcmliYm9uXCIpO1xuXG4gICAgY29uc3QgZnVsbFN5bmNSaWJib24gPSB0aGlzLmFkZFJpYmJvbkljb24oXCJyZWZyZXNoLWN3XCIsIHRoaXMudChcIlx1NUI4Q1x1NjU3NFx1NTQwQ1x1NkI2NVx1NTIzMCBXZWJEQVZcIiwgXCJGdWxsIHN5bmMgdG8gV2ViREFWXCIpLCAoKSA9PiB7XG4gICAgICB2b2lkIHRoaXMucnVuRnVsbFJlY29uY2lsZVN5bmMoKTtcbiAgICB9KTtcbiAgICBmdWxsU3luY1JpYmJvbi5hZGRDbGFzcyhcInNlY3VyZS13ZWJkYXYtc3luYy1yaWJib25cIik7XG4gICAgZnVsbFN5bmNSaWJib24uYWRkQ2xhc3MoXCJzZWN1cmUtd2ViZGF2LWZ1bGwtc3luYy1yaWJib25cIik7XG5cbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Qb3N0UHJvY2Vzc29yKChlbCwgY3R4KSA9PiB7XG4gICAgICB2b2lkIHRoaXMuaW1hZ2VTdXBwb3J0LnByb2Nlc3NTZWN1cmVJbWFnZXMoZWwsIGN0eCk7XG4gICAgfSk7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihTRUNVUkVfQ09ERV9CTE9DSywgKHNvdXJjZSwgZWwsIGN0eCkgPT4ge1xuICAgICAgICB2b2lkIHRoaXMuaW1hZ2VTdXBwb3J0LnByb2Nlc3NTZWN1cmVDb2RlQmxvY2soc291cmNlLCBlbCwgY3R4KTtcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2gge1xuICAgICAgY29uc29sZS53YXJuKFwiW3NlY3VyZS13ZWJkYXYtaW1hZ2VzXSBjb2RlIGJsb2NrIHByb2Nlc3NvciBhbHJlYWR5IHJlZ2lzdGVyZWQsIHNraXBwaW5nXCIpO1xuICAgIH1cblxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImZpbGUtb3BlblwiLCAoZmlsZSkgPT4ge1xuICAgICAgICB2b2lkIHRoaXMuaGFuZGxlRmlsZU9wZW4oZmlsZSk7XG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFwiZWRpdG9yLXBhc3RlXCIsIChldnQsIGVkaXRvciwgaW5mbykgPT4ge1xuICAgICAgICB2b2lkIHRoaXMuaGFuZGxlRWRpdG9yUGFzdGUoZXZ0LCBlZGl0b3IsIGluZm8pO1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImVkaXRvci1kcm9wXCIsIChldnQsIGVkaXRvciwgaW5mbykgPT4ge1xuICAgICAgICB2b2lkIHRoaXMuaGFuZGxlRWRpdG9yRHJvcChldnQsIGVkaXRvciwgaW5mbyk7XG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgYXdhaXQgdGhpcy5yZWJ1aWxkUmVmZXJlbmNlSW5kZXgoKTtcbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oXCJtb2RpZnlcIiwgKGZpbGUpID0+IHRoaXMudHJhY2tWYXVsdE11dGF0aW9uKCgpID0+IHRoaXMuaGFuZGxlVmF1bHRNb2RpZnkoZmlsZSkpKSk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKFwiZGVsZXRlXCIsIChmaWxlKSA9PiB0aGlzLnRyYWNrVmF1bHRNdXRhdGlvbigoKSA9PiB0aGlzLmhhbmRsZVZhdWx0RGVsZXRlKGZpbGUpKSkpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLnZhdWx0Lm9uKFwicmVuYW1lXCIsIChmaWxlLCBvbGRQYXRoKSA9PiB0aGlzLnRyYWNrVmF1bHRNdXRhdGlvbigoKSA9PiB0aGlzLmhhbmRsZVZhdWx0UmVuYW1lKGZpbGUsIG9sZFBhdGgpKSksXG4gICAgKTtcblxuICAgIHRoaXMuc2V0dXBBdXRvU3luYygpO1xuXG4gICAgdm9pZCB0aGlzLnVwbG9hZFF1ZXVlLnByb2Nlc3NQZW5kaW5nVGFza3MoKTtcblxuICAgIHRoaXMucmVnaXN0ZXIoKCkgPT4ge1xuICAgICAgZm9yIChjb25zdCBibG9iVXJsIG9mIHRoaXMuYmxvYlVybHMpIHtcbiAgICAgICAgVVJMLnJldm9rZU9iamVjdFVSTChibG9iVXJsKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuYmxvYlVybHMuY2xlYXIoKTtcbiAgICAgIGZvciAoY29uc3QgdGltZW91dElkIG9mIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLnZhbHVlcygpKSB7XG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICAgIH1cbiAgICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLmNsZWFyKCk7XG4gICAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnByaW9yaXR5UmVuYW1lU3luY1RpbWVvdXRzLnZhbHVlcygpKSB7XG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICAgIH1cbiAgICAgIHRoaXMucHJpb3JpdHlSZW5hbWVTeW5jVGltZW91dHMuY2xlYXIoKTtcbiAgICAgIHRoaXMudXBsb2FkUXVldWUuZGlzcG9zZSgpO1xuICAgIH0pO1xuICB9XG5cbiAgb251bmxvYWQoKSB7XG4gICAgZm9yIChjb25zdCBibG9iVXJsIG9mIHRoaXMuYmxvYlVybHMpIHtcbiAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwoYmxvYlVybCk7XG4gICAgfVxuICAgIHRoaXMuYmxvYlVybHMuY2xlYXIoKTtcbiAgICB0aGlzLnVwbG9hZFF1ZXVlPy5kaXNwb3NlKCk7XG4gICAgZm9yIChjb25zdCB0aW1lb3V0SWQgb2YgdGhpcy5wcmlvcml0eU5vdGVTeW5jVGltZW91dHMudmFsdWVzKCkpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICB9XG4gICAgdGhpcy5wcmlvcml0eU5vdGVTeW5jVGltZW91dHMuY2xlYXIoKTtcbiAgICBmb3IgKGNvbnN0IHRpbWVvdXRJZCBvZiB0aGlzLnByaW9yaXR5UmVuYW1lU3luY1RpbWVvdXRzLnZhbHVlcygpKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgfVxuICAgIHRoaXMucHJpb3JpdHlSZW5hbWVTeW5jVGltZW91dHMuY2xlYXIoKTtcbiAgfVxuXG4gIGFzeW5jIGxvYWRQbHVnaW5TdGF0ZSgpIHtcbiAgICBjb25zdCBsb2FkZWQgPSBhd2FpdCB0aGlzLmxvYWREYXRhKCk7XG4gICAgaWYgKCFsb2FkZWQgfHwgdHlwZW9mIGxvYWRlZCAhPT0gXCJvYmplY3RcIikge1xuICAgICAgdGhpcy5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUyB9O1xuICAgICAgdGhpcy5xdWV1ZSA9IFtdO1xuICAgICAgdGhpcy5ub3RlQWNjZXNzVGltZXN0YW1wcyA9IG5ldyBNYXAoKTtcbiAgICAgIHRoaXMuc3luY0luZGV4ID0gbmV3IE1hcCgpO1xuICAgICAgdGhpcy5zeW5jZWREaXJlY3RvcmllcyA9IG5ldyBTZXQoKTtcbiAgICAgIHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3RlcyA9IG5ldyBNYXAoKTtcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzID0gbmV3IFNldCgpO1xuICAgICAgdGhpcy5wZW5kaW5nVmF1bHREZWxldGlvblBhdGhzID0gbmV3IE1hcCgpO1xuICAgICAgdGhpcy5wZW5kaW5nVmF1bHRSZW5hbWVQYXRocyA9IG5ldyBNYXAoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBjYW5kaWRhdGUgPSBsb2FkZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgaWYgKFwic2V0dGluZ3NcIiBpbiBjYW5kaWRhdGUgfHwgXCJxdWV1ZVwiIGluIGNhbmRpZGF0ZSkge1xuICAgICAgdGhpcy5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUywgLi4uKChjYW5kaWRhdGUuc2V0dGluZ3MgYXMgUGFydGlhbDxTZWN1cmVXZWJkYXZTZXR0aW5ncz4pID8/IHt9KSB9O1xuICAgICAgdGhpcy5xdWV1ZSA9IEFycmF5LmlzQXJyYXkoY2FuZGlkYXRlLnF1ZXVlKSA/IChjYW5kaWRhdGUucXVldWUgYXMgVXBsb2FkVGFza1tdKSA6IFtdO1xuICAgICAgdGhpcy5ub3RlQWNjZXNzVGltZXN0YW1wcyA9IG5ldyBNYXAoXG4gICAgICAgIE9iamVjdC5lbnRyaWVzKChjYW5kaWRhdGUubm90ZUFjY2Vzc1RpbWVzdGFtcHMgYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPiB8IHVuZGVmaW5lZCkgPz8ge30pLFxuICAgICAgKTtcbiAgICAgIHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3RlcyA9IG5ldyBNYXAoXG4gICAgICAgIE9iamVjdC5lbnRyaWVzKChjYW5kaWRhdGUubWlzc2luZ0xhenlSZW1vdGVOb3RlcyBhcyBSZWNvcmQ8c3RyaW5nLCBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZD4gfCB1bmRlZmluZWQpID8/IHt9KVxuICAgICAgICAgIC5maWx0ZXIoKFssIHZhbHVlXSkgPT4ge1xuICAgICAgICAgICAgaWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcmVjb3JkID0gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB0eXBlb2YgcmVjb3JkLmZpcnN0RGV0ZWN0ZWRBdCA9PT0gXCJudW1iZXJcIiAmJlxuICAgICAgICAgICAgICB0eXBlb2YgcmVjb3JkLmxhc3REZXRlY3RlZEF0ID09PSBcIm51bWJlclwiICYmXG4gICAgICAgICAgICAgIHR5cGVvZiByZWNvcmQubWlzc0NvdW50ID09PSBcIm51bWJlclwiXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcCgoW3BhdGgsIHZhbHVlXSkgPT4gW3BhdGgsIHZhbHVlIGFzIE1pc3NpbmdMYXp5UmVtb3RlUmVjb3JkXSksXG4gICAgICApO1xuICAgICAgdGhpcy5wZW5kaW5nVmF1bHRTeW5jUGF0aHMgPSBuZXcgU2V0KFxuICAgICAgICBBcnJheS5pc0FycmF5KGNhbmRpZGF0ZS5wZW5kaW5nVmF1bHRTeW5jUGF0aHMpXG4gICAgICAgICAgPyBjYW5kaWRhdGUucGVuZGluZ1ZhdWx0U3luY1BhdGhzLmZpbHRlcigocGF0aCk6IHBhdGggaXMgc3RyaW5nID0+IHR5cGVvZiBwYXRoID09PSBcInN0cmluZ1wiKVxuICAgICAgICAgIDogW10sXG4gICAgICApO1xuICAgICAgdGhpcy5wZW5kaW5nVmF1bHREZWxldGlvblBhdGhzID0gbmV3IE1hcCgpO1xuICAgICAgZm9yIChjb25zdCBbcGF0aCwgcmF3RW50cnldIG9mIE9iamVjdC5lbnRyaWVzKChjYW5kaWRhdGUucGVuZGluZ1ZhdWx0RGVsZXRpb25QYXRocyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCkgPz8ge30pKSB7XG4gICAgICAgIGlmICghcmF3RW50cnkgfHwgdHlwZW9mIHJhd0VudHJ5ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZW50cnkgPSByYXdFbnRyeSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHR5cGVvZiBlbnRyeS5yZW1vdGVQYXRoID09PSBcInN0cmluZ1wiICYmIGVudHJ5LnJlbW90ZVBhdGgubGVuZ3RoID4gMFxuICAgICAgICAgID8gZW50cnkucmVtb3RlUGF0aFxuICAgICAgICAgIDogYCR7dGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpfSR7cGF0aH1gO1xuICAgICAgICBjb25zdCByZW1vdGVTaWduYXR1cmUgPSB0eXBlb2YgZW50cnkucmVtb3RlU2lnbmF0dXJlID09PSBcInN0cmluZ1wiID8gZW50cnkucmVtb3RlU2lnbmF0dXJlIDogdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLnBlbmRpbmdWYXVsdERlbGV0aW9uUGF0aHMuc2V0KHBhdGgsIHsgcmVtb3RlUGF0aCwgcmVtb3RlU2lnbmF0dXJlIH0pO1xuICAgICAgfVxuICAgICAgdGhpcy5wZW5kaW5nVmF1bHRSZW5hbWVQYXRocyA9IG5ldyBNYXAoKTtcbiAgICAgIGZvciAoY29uc3QgW29sZFBhdGgsIHJhd0VudHJ5XSBvZiBPYmplY3QuZW50cmllcygoY2FuZGlkYXRlLnBlbmRpbmdWYXVsdFJlbmFtZVBhdGhzIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKSA/PyB7fSkpIHtcbiAgICAgICAgaWYgKCFyYXdFbnRyeSB8fCB0eXBlb2YgcmF3RW50cnkgIT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBlbnRyeSA9IHJhd0VudHJ5IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgICAgICBjb25zdCBuZXdQYXRoID0gdHlwZW9mIGVudHJ5Lm5ld1BhdGggPT09IFwic3RyaW5nXCIgPyBlbnRyeS5uZXdQYXRoIDogXCJcIjtcbiAgICAgICAgaWYgKCFuZXdQYXRoKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgb2xkUmVtb3RlUGF0aCA9IHR5cGVvZiBlbnRyeS5vbGRSZW1vdGVQYXRoID09PSBcInN0cmluZ1wiICYmIGVudHJ5Lm9sZFJlbW90ZVBhdGgubGVuZ3RoID4gMFxuICAgICAgICAgID8gZW50cnkub2xkUmVtb3RlUGF0aFxuICAgICAgICAgIDogYCR7dGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpfSR7b2xkUGF0aH1gO1xuICAgICAgICBjb25zdCBvbGRSZW1vdGVTaWduYXR1cmUgPSB0eXBlb2YgZW50cnkub2xkUmVtb3RlU2lnbmF0dXJlID09PSBcInN0cmluZ1wiID8gZW50cnkub2xkUmVtb3RlU2lnbmF0dXJlIDogdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCByZWNvcmRlZEF0ID0gdHlwZW9mIGVudHJ5LnJlY29yZGVkQXQgPT09IFwibnVtYmVyXCIgPyBlbnRyeS5yZWNvcmRlZEF0IDogRGF0ZS5ub3coKTtcbiAgICAgICAgdGhpcy5wZW5kaW5nVmF1bHRSZW5hbWVQYXRocy5zZXQob2xkUGF0aCwge1xuICAgICAgICAgIG9sZFBhdGgsXG4gICAgICAgICAgbmV3UGF0aCxcbiAgICAgICAgICBvbGRSZW1vdGVQYXRoLFxuICAgICAgICAgIG9sZFJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICByZWNvcmRlZEF0LFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHRoaXMuc3luY0luZGV4ID0gbmV3IE1hcCgpO1xuICAgICAgZm9yIChjb25zdCBbcGF0aCwgcmF3RW50cnldIG9mIE9iamVjdC5lbnRyaWVzKChjYW5kaWRhdGUuc3luY0luZGV4IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKSA/PyB7fSkpIHtcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IHRoaXMubm9ybWFsaXplU3luY0luZGV4RW50cnkocGF0aCwgcmF3RW50cnkpO1xuICAgICAgICBpZiAobm9ybWFsaXplZCkge1xuICAgICAgICAgIHRoaXMuc3luY0luZGV4LnNldChwYXRoLCBub3JtYWxpemVkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPVxuICAgICAgICB0eXBlb2YgY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNBdCA9PT0gXCJudW1iZXJcIiA/IGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jQXQgOiAwO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID1cbiAgICAgICAgdHlwZW9mIGNhbmRpZGF0ZS5sYXN0VmF1bHRTeW5jU3RhdHVzID09PSBcInN0cmluZ1wiID8gY2FuZGlkYXRlLmxhc3RWYXVsdFN5bmNTdGF0dXMgOiBcIlwiO1xuICAgICAgdGhpcy5zeW5jZWREaXJlY3RvcmllcyA9IG5ldyBTZXQoXG4gICAgICAgIEFycmF5LmlzQXJyYXkoY2FuZGlkYXRlLnN5bmNlZERpcmVjdG9yaWVzKSA/IGNhbmRpZGF0ZS5zeW5jZWREaXJlY3RvcmllcyBhcyBzdHJpbmdbXSA6IFtdLFxuICAgICAgKTtcbiAgICAgIHRoaXMubm9ybWFsaXplRWZmZWN0aXZlU2V0dGluZ3MoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnNldHRpbmdzID0geyAuLi5ERUZBVUxUX1NFVFRJTkdTLCAuLi4oY2FuZGlkYXRlIGFzIFBhcnRpYWw8U2VjdXJlV2ViZGF2U2V0dGluZ3M+KSB9O1xuICAgIHRoaXMucXVldWUgPSBbXTtcbiAgICB0aGlzLm5vdGVBY2Nlc3NUaW1lc3RhbXBzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuc3luY0luZGV4ID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuc3luY2VkRGlyZWN0b3JpZXMgPSBuZXcgU2V0KCk7XG4gICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzID0gbmV3IFNldCgpO1xuICAgIHRoaXMucGVuZGluZ1ZhdWx0RGVsZXRpb25QYXRocyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLnBlbmRpbmdWYXVsdFJlbmFtZVBhdGhzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gMDtcbiAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSBcIlwiO1xuICAgIHRoaXMubm9ybWFsaXplRWZmZWN0aXZlU2V0dGluZ3MoKTtcbiAgfVxuXG4gIHByaXZhdGUgbm9ybWFsaXplRWZmZWN0aXZlU2V0dGluZ3MoKSB7XG4gICAgLy8gS2VlcCB0aGUgcHVibGljIHNldHRpbmdzIHN1cmZhY2UgaW50ZW50aW9uYWxseSBzbWFsbCBhbmQgZGV0ZXJtaW5pc3RpYy5cbiAgICB0aGlzLnNldHRpbmdzLmRlbGV0ZUxvY2FsQWZ0ZXJVcGxvYWQgPSB0cnVlO1xuICAgIHRoaXMuc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXMgPSBNYXRoLm1heCgwLCBNYXRoLmZsb29yKHRoaXMuc2V0dGluZ3MuYXV0b1N5bmNJbnRlcnZhbE1pbnV0ZXMgfHwgMCkpO1xuICAgIGNvbnN0IHJhd0V4Y2x1ZGVkID0gdGhpcy5zZXR0aW5ncy5leGNsdWRlZFN5bmNGb2xkZXJzIGFzIHVua25vd247XG4gICAgY29uc3QgZXhjbHVkZWQgPSBBcnJheS5pc0FycmF5KHJhd0V4Y2x1ZGVkKVxuICAgICAgPyByYXdFeGNsdWRlZFxuICAgICAgOiB0eXBlb2YgcmF3RXhjbHVkZWQgPT09IFwic3RyaW5nXCJcbiAgICAgICAgPyByYXdFeGNsdWRlZC5zcGxpdCgvWyxcXG5dLylcbiAgICAgICAgOiBERUZBVUxUX1NFVFRJTkdTLmV4Y2x1ZGVkU3luY0ZvbGRlcnM7XG4gICAgdGhpcy5zZXR0aW5ncy5leGNsdWRlZFN5bmNGb2xkZXJzID0gW1xuICAgICAgLi4ubmV3IFNldChcbiAgICAgICAgZXhjbHVkZWRcbiAgICAgICAgICAubWFwKCh2YWx1ZSkgPT4gbm9ybWFsaXplUGF0aChTdHJpbmcodmFsdWUpLnRyaW0oKSkucmVwbGFjZSgvXlxcLysvLCBcIlwiKS5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpKVxuICAgICAgICAgIC5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPiAwKSxcbiAgICAgICksXG4gICAgXTtcbiAgfVxuXG4gIHByaXZhdGUgbm9ybWFsaXplRm9sZGVyKGlucHV0OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gbm9ybWFsaXplRm9sZGVyKGlucHV0KTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0dXBBdXRvU3luYygpIHtcbiAgICBjb25zdCBtaW51dGVzID0gdGhpcy5zZXR0aW5ncy5hdXRvU3luY0ludGVydmFsTWludXRlcztcbiAgICBpZiAobWludXRlcyA8PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaW50ZXJ2YWxNcyA9IG1pbnV0ZXMgKiA2MCAqIDEwMDA7XG4gICAgdGhpcy5yZWdpc3RlckludGVydmFsKFxuICAgICAgd2luZG93LnNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLnJ1bkF1dG9TeW5jVGljaygpO1xuICAgICAgfSwgaW50ZXJ2YWxNcyksXG4gICAgKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcnVuQXV0b1N5bmNUaWNrKCkge1xuICAgIGlmICh0aGlzLmF1dG9TeW5jVGlja0luUHJvZ3Jlc3MpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLmF1dG9TeW5jVGlja0luUHJvZ3Jlc3MgPSB0cnVlO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB0aGlzLnN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50KGZhbHNlKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy5hdXRvU3luY1RpY2tJblByb2dyZXNzID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc2F2ZVBsdWdpblN0YXRlKCkge1xuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEoe1xuICAgICAgc2V0dGluZ3M6IHRoaXMuc2V0dGluZ3MsXG4gICAgICBxdWV1ZTogdGhpcy5xdWV1ZSxcbiAgICAgIG5vdGVBY2Nlc3NUaW1lc3RhbXBzOiBPYmplY3QuZnJvbUVudHJpZXModGhpcy5ub3RlQWNjZXNzVGltZXN0YW1wcy5lbnRyaWVzKCkpLFxuICAgICAgbWlzc2luZ0xhenlSZW1vdGVOb3RlczogT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMubWlzc2luZ0xhenlSZW1vdGVOb3Rlcy5lbnRyaWVzKCkpLFxuICAgICAgcGVuZGluZ1ZhdWx0U3luY1BhdGhzOiBbLi4udGhpcy5wZW5kaW5nVmF1bHRTeW5jUGF0aHNdLFxuICAgICAgcGVuZGluZ1ZhdWx0RGVsZXRpb25QYXRoczogT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMucGVuZGluZ1ZhdWx0RGVsZXRpb25QYXRocy5lbnRyaWVzKCkpLFxuICAgICAgcGVuZGluZ1ZhdWx0UmVuYW1lUGF0aHM6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLnBlbmRpbmdWYXVsdFJlbmFtZVBhdGhzLmVudHJpZXMoKSksXG4gICAgICBzeW5jSW5kZXg6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLnN5bmNJbmRleC5lbnRyaWVzKCkpLFxuICAgICAgc3luY2VkRGlyZWN0b3JpZXM6IFsuLi50aGlzLnN5bmNlZERpcmVjdG9yaWVzXSxcbiAgICAgIGxhc3RWYXVsdFN5bmNBdDogdGhpcy5sYXN0VmF1bHRTeW5jQXQsXG4gICAgICBsYXN0VmF1bHRTeW5jU3RhdHVzOiB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsXG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzYXZlU2V0dGluZ3MoKSB7XG4gICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgfVxuXG4gIHByaXZhdGUgbm9ybWFsaXplU3luY0luZGV4RW50cnkodmF1bHRQYXRoOiBzdHJpbmcsIHJhd0VudHJ5OiB1bmtub3duKTogU3luY0luZGV4RW50cnkgfCBudWxsIHtcbiAgICBpZiAoIXJhd0VudHJ5IHx8IHR5cGVvZiByYXdFbnRyeSAhPT0gXCJvYmplY3RcIikge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgY2FuZGlkYXRlID0gcmF3RW50cnkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9XG4gICAgICB0eXBlb2YgY2FuZGlkYXRlLnJlbW90ZVBhdGggPT09IFwic3RyaW5nXCIgJiYgY2FuZGlkYXRlLnJlbW90ZVBhdGgubGVuZ3RoID4gMFxuICAgICAgICA/IGNhbmRpZGF0ZS5yZW1vdGVQYXRoXG4gICAgICAgIDogdGhpcy5zeW5jU3VwcG9ydC5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgodmF1bHRQYXRoKTtcbiAgICBjb25zdCBsb2NhbFNpZ25hdHVyZSA9XG4gICAgICB0eXBlb2YgY2FuZGlkYXRlLmxvY2FsU2lnbmF0dXJlID09PSBcInN0cmluZ1wiXG4gICAgICAgID8gY2FuZGlkYXRlLmxvY2FsU2lnbmF0dXJlXG4gICAgICAgIDogdHlwZW9mIGNhbmRpZGF0ZS5zaWduYXR1cmUgPT09IFwic3RyaW5nXCJcbiAgICAgICAgICA/IGNhbmRpZGF0ZS5zaWduYXR1cmVcbiAgICAgICAgICA6IFwiXCI7XG4gICAgY29uc3QgcmVtb3RlU2lnbmF0dXJlID1cbiAgICAgIHR5cGVvZiBjYW5kaWRhdGUucmVtb3RlU2lnbmF0dXJlID09PSBcInN0cmluZ1wiXG4gICAgICAgID8gY2FuZGlkYXRlLnJlbW90ZVNpZ25hdHVyZVxuICAgICAgICA6IHR5cGVvZiBjYW5kaWRhdGUuc2lnbmF0dXJlID09PSBcInN0cmluZ1wiXG4gICAgICAgICAgPyBjYW5kaWRhdGUuc2lnbmF0dXJlXG4gICAgICAgICAgOiBcIlwiO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgcmVtb3RlUGF0aCxcbiAgICB9O1xuICB9XG5cbiAgdCh6aDogc3RyaW5nLCBlbjogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0TGFuZ3VhZ2UoKSA9PT0gXCJ6aFwiID8gemggOiBlbjtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0TGFuZ3VhZ2UoKSB7XG4gICAgaWYgKHRoaXMuc2V0dGluZ3MubGFuZ3VhZ2UgPT09IFwiYXV0b1wiKSB7XG4gICAgICBjb25zdCBsb2NhbGUgPSB0eXBlb2YgbmF2aWdhdG9yICE9PSBcInVuZGVmaW5lZFwiID8gbmF2aWdhdG9yLmxhbmd1YWdlLnRvTG93ZXJDYXNlKCkgOiBcImVuXCI7XG4gICAgICByZXR1cm4gbG9jYWxlLnN0YXJ0c1dpdGgoXCJ6aFwiKSA/IFwiemhcIiA6IFwiZW5cIjtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zZXR0aW5ncy5sYW5ndWFnZTtcbiAgfVxuXG4gIGZvcm1hdExhc3RTeW5jTGFiZWwoKSB7XG4gICAgaWYgKCF0aGlzLmxhc3RWYXVsdFN5bmNBdCkge1xuICAgICAgcmV0dXJuIHRoaXMudChcIlx1NEUwQVx1NkIyMVx1NTQwQ1x1NkI2NVx1RkYxQVx1NUMxQVx1NjcyQVx1NjI2N1x1ODg0Q1wiLCBcIkxhc3Qgc3luYzogbm90IHJ1biB5ZXRcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMudChcbiAgICAgIGBcdTRFMEFcdTZCMjFcdTU0MENcdTZCNjVcdUZGMUEke25ldyBEYXRlKHRoaXMubGFzdFZhdWx0U3luY0F0KS50b0xvY2FsZVN0cmluZygpfWAsXG4gICAgICBgTGFzdCBzeW5jOiAke25ldyBEYXRlKHRoaXMubGFzdFZhdWx0U3luY0F0KS50b0xvY2FsZVN0cmluZygpfWAsXG4gICAgKTtcbiAgfVxuXG4gIGZvcm1hdFN5bmNTdGF0dXNMYWJlbCgpIHtcbiAgICByZXR1cm4gdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzXG4gICAgICA/IHRoaXMudChgXHU2NzAwXHU4RkQxXHU3MkI2XHU2MDAxXHVGRjFBJHt0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXN9YCwgYFJlY2VudCBzdGF0dXM6ICR7dGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzfWApXG4gICAgICA6IHRoaXMudChcIlx1NjcwMFx1OEZEMVx1NzJCNlx1NjAwMVx1RkYxQVx1NjY4Mlx1NjVFMFwiLCBcIlJlY2VudCBzdGF0dXM6IG5vbmVcIik7XG4gIH1cblxuICBhc3luYyBydW5NYW51YWxTeW5jKCkge1xuICAgIGF3YWl0IHRoaXMuc3luY1BlbmRpbmdWYXVsdENvbnRlbnQodHJ1ZSk7XG4gIH1cblxuICBhc3luYyBydW5GdWxsUmVjb25jaWxlU3luYygpIHtcbiAgICBhd2FpdCB0aGlzLnN5bmNDb25maWd1cmVkVmF1bHRDb250ZW50KHRydWUpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWJ1aWxkUmVmZXJlbmNlSW5kZXgoKSB7XG4gICAgY29uc3QgbmV4dCA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8c3RyaW5nPj4oKTtcbiAgICBmb3IgKGNvbnN0IGZpbGUgb2YgdGhpcy5hcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpKSB7XG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgIG5leHQuc2V0KGZpbGUucGF0aCwgdGhpcy5leHRyYWN0UmVtb3RlUGF0aHNGcm9tVGV4dChjb250ZW50KSk7XG4gICAgfVxuICAgIHRoaXMubm90ZVJlbW90ZVJlZnMgPSBuZXh0O1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVWYXVsdE1vZGlmeShmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMubWFya1BlbmRpbmdWYXVsdFN5bmMoZmlsZS5wYXRoKTtcblxuICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgIGNvbnN0IG5leHRSZWZzID0gdGhpcy5leHRyYWN0UmVtb3RlUGF0aHNGcm9tVGV4dChjb250ZW50KTtcbiAgICAgIGNvbnN0IHByZXZpb3VzUmVmcyA9IHRoaXMubm90ZVJlbW90ZVJlZnMuZ2V0KGZpbGUucGF0aCkgPz8gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgICB0aGlzLm5vdGVSZW1vdGVSZWZzLnNldChmaWxlLnBhdGgsIG5leHRSZWZzKTtcblxuICAgICAgY29uc3QgYWRkZWQgPSBbLi4ubmV4dFJlZnNdLmZpbHRlcigodmFsdWUpID0+ICFwcmV2aW91c1JlZnMuaGFzKHZhbHVlKSk7XG4gICAgICBjb25zdCByZW1vdmVkID0gWy4uLnByZXZpb3VzUmVmc10uZmlsdGVyKCh2YWx1ZSkgPT4gIW5leHRSZWZzLmhhcyh2YWx1ZSkpO1xuICAgICAgaWYgKGFkZGVkLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMoZmlsZS5wYXRoLCBcImltYWdlLWFkZFwiKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZW1vdmVkLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMoZmlsZS5wYXRoLCBcImltYWdlLXJlbW92ZVwiKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVWYXVsdERlbGV0ZShmaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKGZpbGUucGF0aCkpIHtcbiAgICAgIHRoaXMubWFya1BlbmRpbmdWYXVsdERlbGV0aW9uKGZpbGUucGF0aCk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgfVxuXG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIHRoaXMubm90ZVJlbW90ZVJlZnMuZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVWYXVsdFJlbmFtZShmaWxlOiBUQWJzdHJhY3RGaWxlLCBvbGRQYXRoOiBzdHJpbmcpIHtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgob2xkUGF0aCkpIHtcbiAgICAgIGNvbnN0IHRyYWNrZWRPbGRQYXRoID0gdGhpcy5yZWNvcmRQZW5kaW5nVmF1bHRSZW5hbWUob2xkUGF0aCwgZmlsZS5wYXRoKTtcbiAgICAgIHRoaXMubWFya1BlbmRpbmdWYXVsdERlbGV0aW9uKG9sZFBhdGgpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKG9sZFBhdGgpO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIHRoaXMuc2NoZWR1bGVQcmlvcml0eVJlbmFtZVN5bmModHJhY2tlZE9sZFBhdGgpO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKGZpbGUucGF0aCkpIHtcbiAgICAgIHRoaXMubWFya1BlbmRpbmdWYXVsdFN5bmMoZmlsZS5wYXRoKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgfVxuXG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIGNvbnN0IHJlZnMgPSB0aGlzLm5vdGVSZW1vdGVSZWZzLmdldChvbGRQYXRoKTtcbiAgICAgIGlmIChyZWZzKSB7XG4gICAgICAgIHRoaXMubm90ZVJlbW90ZVJlZnMuZGVsZXRlKG9sZFBhdGgpO1xuICAgICAgICB0aGlzLm5vdGVSZW1vdGVSZWZzLnNldChmaWxlLnBhdGgsIHJlZnMpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXRoaXMuc3luY1N1cHBvcnQuc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChmaWxlLnBhdGgpKSB7XG4gICAgICAgIHRoaXMuc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jKGZpbGUucGF0aCwgXCJpbWFnZS1hZGRcIik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBtYXJrUGVuZGluZ1ZhdWx0U3luYyhwYXRoOiBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKHBhdGgpKSB7XG4gICAgICB0aGlzLnBlbmRpbmdWYXVsdFN5bmNQYXRocy5kZWxldGUocGF0aCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5wZW5kaW5nVmF1bHREZWxldGlvblBhdGhzLmRlbGV0ZShwYXRoKTtcbiAgICB0aGlzLnBlbmRpbmdWYXVsdFN5bmNQYXRocy5hZGQocGF0aCk7XG4gIH1cblxuICBwcml2YXRlIG1hcmtQZW5kaW5nVmF1bHREZWxldGlvbihwYXRoOiBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKHBhdGgpKSB7XG4gICAgICB0aGlzLnBlbmRpbmdWYXVsdFN5bmNQYXRocy5kZWxldGUocGF0aCk7XG4gICAgICB0aGlzLnBlbmRpbmdWYXVsdERlbGV0aW9uUGF0aHMuZGVsZXRlKHBhdGgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5zeW5jSW5kZXguZ2V0KHBhdGgpO1xuICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzLmRlbGV0ZShwYXRoKTtcbiAgICB0aGlzLnBlbmRpbmdWYXVsdERlbGV0aW9uUGF0aHMuc2V0KHBhdGgsIHtcbiAgICAgIHJlbW90ZVBhdGg6IGV4aXN0aW5nPy5yZW1vdGVQYXRoID8/IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKHBhdGgpLFxuICAgICAgcmVtb3RlU2lnbmF0dXJlOiBleGlzdGluZz8ucmVtb3RlU2lnbmF0dXJlLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBmaW5kUGVuZGluZ1ZhdWx0UmVuYW1lQnlOZXdQYXRoKG5ld1BhdGg6IHN0cmluZykge1xuICAgIHJldHVybiBbLi4udGhpcy5wZW5kaW5nVmF1bHRSZW5hbWVQYXRocy52YWx1ZXMoKV0uZmluZCgoZW50cnkpID0+IGVudHJ5Lm5ld1BhdGggPT09IG5ld1BhdGgpID8/IG51bGw7XG4gIH1cblxuICBwcml2YXRlIHJlY29yZFBlbmRpbmdWYXVsdFJlbmFtZShvbGRQYXRoOiBzdHJpbmcsIG5ld1BhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRPbGRQYXRoID0gbm9ybWFsaXplUGF0aChvbGRQYXRoKTtcbiAgICBjb25zdCBub3JtYWxpemVkTmV3UGF0aCA9IG5vcm1hbGl6ZVBhdGgobmV3UGF0aCk7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmZpbmRQZW5kaW5nVmF1bHRSZW5hbWVCeU5ld1BhdGgobm9ybWFsaXplZE9sZFBhdGgpO1xuICAgIGNvbnN0IHByZXZpb3VzID0gZXhpc3RpbmcgPz8gdGhpcy5wZW5kaW5nVmF1bHRSZW5hbWVQYXRocy5nZXQobm9ybWFsaXplZE9sZFBhdGgpID8/IG51bGw7XG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICB0aGlzLnBlbmRpbmdWYXVsdFJlbmFtZVBhdGhzLmRlbGV0ZShleGlzdGluZy5vbGRQYXRoKTtcbiAgICB9XG5cbiAgICBjb25zdCBpbmRleGVkID0gdGhpcy5zeW5jSW5kZXguZ2V0KG5vcm1hbGl6ZWRPbGRQYXRoKTtcbiAgICBjb25zdCB0cmFja2VkT2xkUGF0aCA9IHByZXZpb3VzPy5vbGRQYXRoID8/IG5vcm1hbGl6ZWRPbGRQYXRoO1xuICAgIGNvbnN0IG9sZFJlbW90ZVBhdGggPSBwcmV2aW91cz8ub2xkUmVtb3RlUGF0aCA/PyBpbmRleGVkPy5yZW1vdGVQYXRoID8/IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKG5vcm1hbGl6ZWRPbGRQYXRoKTtcbiAgICBjb25zdCBvbGRSZW1vdGVTaWduYXR1cmUgPSBwcmV2aW91cz8ub2xkUmVtb3RlU2lnbmF0dXJlID8/IGluZGV4ZWQ/LnJlbW90ZVNpZ25hdHVyZTtcbiAgICBjb25zdCByZWNvcmRlZEF0ID0gcHJldmlvdXM/LnJlY29yZGVkQXQgPz8gRGF0ZS5ub3coKTtcblxuICAgIHRoaXMucGVuZGluZ1ZhdWx0UmVuYW1lUGF0aHMuc2V0KHRyYWNrZWRPbGRQYXRoLCB7XG4gICAgICBvbGRQYXRoOiB0cmFja2VkT2xkUGF0aCxcbiAgICAgIG5ld1BhdGg6IG5vcm1hbGl6ZWROZXdQYXRoLFxuICAgICAgb2xkUmVtb3RlUGF0aCxcbiAgICAgIG9sZFJlbW90ZVNpZ25hdHVyZSxcbiAgICAgIHJlY29yZGVkQXQsXG4gICAgfSk7XG4gICAgcmV0dXJuIHRyYWNrZWRPbGRQYXRoO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRyYWN0UmVtb3RlUGF0aHNGcm9tVGV4dChjb250ZW50OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZWZzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3Qgc3BhblJlZ2V4ID0gL2RhdGEtc2VjdXJlLXdlYmRhdj1cIihbXlwiXSspXCIvZztcbiAgICBjb25zdCBwcm90b2NvbFJlZ2V4ID0gL3dlYmRhdi1zZWN1cmU6XFwvXFwvKFteXFxzKVwiXSspL2c7XG4gICAgY29uc3QgY29kZUJsb2NrUmVnZXggPSAvYGBgc2VjdXJlLXdlYmRhdlxccysoW1xcc1xcU10qPylgYGAvZztcbiAgICBsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cbiAgICB3aGlsZSAoKG1hdGNoID0gc3BhblJlZ2V4LmV4ZWMoY29udGVudCkpICE9PSBudWxsKSB7XG4gICAgICByZWZzLmFkZCh0aGlzLnVuZXNjYXBlSHRtbChtYXRjaFsxXSkpO1xuICAgIH1cblxuICAgIHdoaWxlICgobWF0Y2ggPSBwcm90b2NvbFJlZ2V4LmV4ZWMoY29udGVudCkpICE9PSBudWxsKSB7XG4gICAgICByZWZzLmFkZCh0aGlzLnVuZXNjYXBlSHRtbChtYXRjaFsxXSkpO1xuICAgIH1cblxuICAgIHdoaWxlICgobWF0Y2ggPSBjb2RlQmxvY2tSZWdleC5leGVjKGNvbnRlbnQpKSAhPT0gbnVsbCkge1xuICAgICAgY29uc3QgcGFyc2VkID0gdGhpcy5pbWFnZVN1cHBvcnQucGFyc2VTZWN1cmVJbWFnZUJsb2NrKG1hdGNoWzFdKTtcbiAgICAgIGlmIChwYXJzZWQ/LnBhdGgpIHtcbiAgICAgICAgcmVmcy5hZGQocGFyc2VkLnBhdGgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZWZzO1xuICB9XG5cbiAgcHJpdmF0ZSBzY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZVBhdGg6IHN0cmluZywgcmVhc29uOiBcImltYWdlLWFkZFwiIHwgXCJpbWFnZS1yZW1vdmVcIikge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5wcmlvcml0eU5vdGVTeW5jVGltZW91dHMuZ2V0KG5vdGVQYXRoKTtcbiAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQoZXhpc3RpbmcpO1xuICAgIH1cblxuICAgIGNvbnN0IGRlbGF5TXMgPSByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCIgPyAxMjAwIDogNjAwO1xuICAgIGNvbnN0IHRpbWVvdXRJZCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLmRlbGV0ZShub3RlUGF0aCk7XG4gICAgICB2b2lkIHRoaXMuZmx1c2hQcmlvcml0eU5vdGVTeW5jKG5vdGVQYXRoLCByZWFzb24pO1xuICAgIH0sIGRlbGF5TXMpO1xuICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY1RpbWVvdXRzLnNldChub3RlUGF0aCwgdGltZW91dElkKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZmx1c2hQcmlvcml0eU5vdGVTeW5jKG5vdGVQYXRoOiBzdHJpbmcsIHJlYXNvbjogXCJpbWFnZS1hZGRcIiB8IFwiaW1hZ2UtcmVtb3ZlXCIpIHtcbiAgICBpZiAodGhpcy5wcmlvcml0eU5vdGVTeW5jc0luRmxpZ2h0Lmhhcyhub3RlUGF0aCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICB0aGlzLnVwbG9hZFF1ZXVlLmhhc1BlbmRpbmdXb3JrRm9yTm90ZShub3RlUGF0aCkgfHxcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlcy5zaXplID4gMCB8fFxuICAgICAgdGhpcy5zeW5jSW5Qcm9ncmVzcyB8fFxuICAgICAgdGhpcy5hdXRvU3luY1RpY2tJblByb2dyZXNzXG4gICAgKSB7XG4gICAgICB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyhub3RlUGF0aCwgcmVhc29uKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBmaWxlID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgobm90ZVBhdGgpO1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkgfHwgZmlsZS5leHRlbnNpb24gIT09IFwibWRcIiB8fCB0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgoZmlsZS5wYXRoKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY3NJbkZsaWdodC5hZGQobm90ZVBhdGgpO1xuICAgIHRyeSB7XG4gICAgICB0aGlzLmVuc3VyZUNvbmZpZ3VyZWQoKTtcblxuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMucmVhZE1hcmtkb3duQ29udGVudFByZWZlckVkaXRvcihmaWxlKTtcbiAgICAgIGlmICh0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5zeW5jU3VwcG9ydC5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgIGNvbnN0IHVwbG9hZGVkUmVtb3RlID0gYXdhaXQgdGhpcy51cGxvYWRDb250ZW50RmlsZVRvUmVtb3RlKGZpbGUsIHJlbW90ZVBhdGgsIGNvbnRlbnQpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICBsb2NhbFNpZ25hdHVyZTogYXdhaXQgdGhpcy5idWlsZEN1cnJlbnRMb2NhbFNpZ25hdHVyZShmaWxlLCBjb250ZW50KSxcbiAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiB1cGxvYWRlZFJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICB9KTtcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzLmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgYXdhaXQgdGhpcy5kZWxldGVEZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jQXQgPSBEYXRlLm5vdygpO1xuICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy50KFxuICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCJcbiAgICAgICAgICA/IGBcdTVERjJcdTRGMThcdTUxNDhcdTU0MENcdTZCNjVcdTU2RkVcdTcyNDdcdTY1QjBcdTU4OUVcdTU0MEVcdTc2ODRcdTdCMTRcdThCQjBcdUZGMUEke2ZpbGUuYmFzZW5hbWV9YFxuICAgICAgICAgIDogYFx1NURGMlx1NEYxOFx1NTE0OFx1NTQwQ1x1NkI2NVx1NTZGRVx1NzI0N1x1NTIyMFx1OTY2NFx1NTQwRVx1NzY4NFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCJcbiAgICAgICAgICA/IGBQcmlvcml0aXplZCBub3RlIHN5bmMgZmluaXNoZWQgYWZ0ZXIgaW1hZ2UgYWRkOiAke2ZpbGUuYmFzZW5hbWV9YFxuICAgICAgICAgIDogYFByaW9yaXRpemVkIG5vdGUgc3luYyBmaW5pc2hlZCBhZnRlciBpbWFnZSByZW1vdmFsOiAke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiUHJpb3JpdHkgbm90ZSBzeW5jIGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLmRlc2NyaWJlRXJyb3IoXG4gICAgICAgIHRoaXMudChcbiAgICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCIgPyBcIlx1NTZGRVx1NzI0N1x1NjVCMFx1NTg5RVx1NTQwRVx1NzY4NFx1N0IxNFx1OEJCMFx1NEYxOFx1NTE0OFx1NTQwQ1x1NkI2NVx1NTkzMVx1OEQyNVwiIDogXCJcdTU2RkVcdTcyNDdcdTUyMjBcdTk2NjRcdTU0MEVcdTc2ODRcdTdCMTRcdThCQjBcdTRGMThcdTUxNDhcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIixcbiAgICAgICAgICByZWFzb24gPT09IFwiaW1hZ2UtYWRkXCIgPyBcIlByaW9yaXR5IG5vdGUgc3luYyBhZnRlciBpbWFnZSBhZGQgZmFpbGVkXCIgOiBcIlByaW9yaXR5IG5vdGUgc3luYyBhZnRlciBpbWFnZSByZW1vdmFsIGZhaWxlZFwiLFxuICAgICAgICApLFxuICAgICAgICBlcnJvcixcbiAgICAgICk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgdGhpcy5zY2hlZHVsZVByaW9yaXR5Tm90ZVN5bmMobm90ZVBhdGgsIHJlYXNvbik7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMucHJpb3JpdHlOb3RlU3luY3NJbkZsaWdodC5kZWxldGUobm90ZVBhdGgpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgc2NoZWR1bGVQcmlvcml0eVJlbmFtZVN5bmMob2xkUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLnByaW9yaXR5UmVuYW1lU3luY1RpbWVvdXRzLmdldChvbGRQYXRoKTtcbiAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQoZXhpc3RpbmcpO1xuICAgIH1cblxuICAgIGNvbnN0IHRpbWVvdXRJZCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRoaXMucHJpb3JpdHlSZW5hbWVTeW5jVGltZW91dHMuZGVsZXRlKG9sZFBhdGgpO1xuICAgICAgdm9pZCB0aGlzLmZsdXNoUHJpb3JpdHlSZW5hbWVTeW5jKG9sZFBhdGgpO1xuICAgIH0sIDcwMCk7XG4gICAgdGhpcy5wcmlvcml0eVJlbmFtZVN5bmNUaW1lb3V0cy5zZXQob2xkUGF0aCwgdGltZW91dElkKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZmx1c2hQcmlvcml0eVJlbmFtZVN5bmMob2xkUGF0aDogc3RyaW5nKSB7XG4gICAgaWYgKHRoaXMucHJpb3JpdHlSZW5hbWVTeW5jc0luRmxpZ2h0LmhhcyhvbGRQYXRoKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlcy5zaXplID4gMCB8fFxuICAgICAgdGhpcy51cGxvYWRRdWV1ZS5oYXNQZW5kaW5nV29yaygpIHx8XG4gICAgICB0aGlzLnN5bmNJblByb2dyZXNzIHx8XG4gICAgICB0aGlzLmF1dG9TeW5jVGlja0luUHJvZ3Jlc3NcbiAgICApIHtcbiAgICAgIHRoaXMuc2NoZWR1bGVQcmlvcml0eVJlbmFtZVN5bmMob2xkUGF0aCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnBlbmRpbmdWYXVsdFJlbmFtZVBhdGhzLmhhcyhvbGRQYXRoKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMucHJpb3JpdHlSZW5hbWVTeW5jc0luRmxpZ2h0LmFkZChvbGRQYXRoKTtcbiAgICBjb25zdCBjb3VudHMgPSB7IHVwbG9hZGVkOiAwLCBkZWxldGVkUmVtb3RlRmlsZXM6IDAsIHNraXBwZWQ6IDAgfTtcbiAgICB0cnkge1xuICAgICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG4gICAgICBhd2FpdCB0aGlzLnByb2Nlc3NQZW5kaW5nVmF1bHRSZW5hbWVzKGNvdW50cywgW29sZFBhdGhdKTtcbiAgICAgIGlmIChjb3VudHMudXBsb2FkZWQgPiAwIHx8IGNvdW50cy5kZWxldGVkUmVtb3RlRmlsZXMgPiAwKSB7XG4gICAgICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgdGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzID0gdGhpcy50KFxuICAgICAgICAgIGBcdTVERjJcdTRGMThcdTUxNDhcdTU0MENcdTZCNjVcdTkxQ0RcdTU0N0RcdTU0MEQvXHU3OUZCXHU1MkE4XHVGRjFBXHU0RTBBXHU0RjIwICR7Y291bnRzLnVwbG9hZGVkfSBcdTRFMkFcdTY1ODdcdTRFRjZcdUZGMENcdTUyMjBcdTk2NjRcdThGRENcdTdBRUZcdTY1RTdcdThERUZcdTVGODQgJHtjb3VudHMuZGVsZXRlZFJlbW90ZUZpbGVzfSBcdTRFMkFcdTMwMDJgLFxuICAgICAgICAgIGBQcmlvcml0aXplZCByZW5hbWUvbW92ZSBzeW5jIHVwbG9hZGVkICR7Y291bnRzLnVwbG9hZGVkfSBmaWxlKHMpIGFuZCBkZWxldGVkICR7Y291bnRzLmRlbGV0ZWRSZW1vdGVGaWxlc30gc3RhbGUgcmVtb3RlIHBhdGgocykuYCxcbiAgICAgICAgKTtcbiAgICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIlByaW9yaXR5IHJlbmFtZSBzeW5jIGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLmRlc2NyaWJlRXJyb3IoXG4gICAgICAgIHRoaXMudChcIlx1OTFDRFx1NTQ3RFx1NTQwRC9cdTc5RkJcdTUyQThcdTU0MEVcdTc2ODRcdTRGMThcdTUxNDhcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIiwgXCJQcmlvcml0eSBzeW5jIGFmdGVyIHJlbmFtZS9tb3ZlIGZhaWxlZFwiKSxcbiAgICAgICAgZXJyb3IsXG4gICAgICApO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIHRoaXMuc2NoZWR1bGVQcmlvcml0eVJlbmFtZVN5bmMob2xkUGF0aCk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMucHJpb3JpdHlSZW5hbWVTeW5jc0luRmxpZ2h0LmRlbGV0ZShvbGRQYXRoKTtcbiAgICB9XG4gIH1cblxuXG4gIHByaXZhdGUgYXN5bmMgYnVpbGRVcGxvYWRSZXBsYWNlbWVudHMoY29udGVudDogc3RyaW5nLCBub3RlRmlsZTogVEZpbGUsIHVwbG9hZENhY2hlPzogTWFwPHN0cmluZywgc3RyaW5nPikge1xuICAgIGNvbnN0IHNlZW4gPSBuZXcgTWFwPHN0cmluZywgVXBsb2FkUmV3cml0ZT4oKTtcbiAgICBjb25zdCB3aWtpTWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKC8hXFxbXFxbKFteXFxdXSspXFxdXFxdL2cpXTtcbiAgICBjb25zdCBtYXJrZG93bk1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCgvIVxcW1teXFxdXSpdXFwoKFteKV0rKVxcKS9nKV07XG4gICAgY29uc3QgaHRtbEltYWdlTWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKC88aW1nXFxiW14+XSpzcmM9W1wiJ10oW15cIiddKylbXCInXVtePl0qPi9naSldO1xuXG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiB3aWtpTWF0Y2hlcykge1xuICAgICAgY29uc3QgcmF3TGluayA9IG1hdGNoWzFdLnNwbGl0KFwifFwiKVswXS50cmltKCk7XG4gICAgICBjb25zdCBmaWxlID0gdGhpcy5yZXNvbHZlTGlua2VkRmlsZShyYXdMaW5rLCBub3RlRmlsZS5wYXRoKTtcbiAgICAgIGlmICghZmlsZSB8fCAhdGhpcy5pc0ltYWdlRmlsZShmaWxlKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFzZWVuLmhhcyhtYXRjaFswXSkpIHtcbiAgICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRWYXVsdEZpbGUoZmlsZSwgdXBsb2FkQ2FjaGUpO1xuICAgICAgICBzZWVuLnNldChtYXRjaFswXSwge1xuICAgICAgICAgIG9yaWdpbmFsOiBtYXRjaFswXSxcbiAgICAgICAgICByZXdyaXR0ZW46IHRoaXMuaW1hZ2VTdXBwb3J0LmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsLCBmaWxlLmJhc2VuYW1lKSxcbiAgICAgICAgICBzb3VyY2VGaWxlOiBmaWxlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIG1hcmtkb3duTWF0Y2hlcykge1xuICAgICAgY29uc3QgcmF3TGluayA9IGRlY29kZVVSSUNvbXBvbmVudChtYXRjaFsxXS50cmltKCkucmVwbGFjZSgvXjx8PiQvZywgXCJcIikpO1xuICAgICAgaWYgKC9eKHdlYmRhdi1zZWN1cmU6fGRhdGE6KS9pLnRlc3QocmF3TGluaykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLmlzSHR0cFVybChyYXdMaW5rKSkge1xuICAgICAgICBpZiAoIXNlZW4uaGFzKG1hdGNoWzBdKSkge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFJlbW90ZUltYWdlVXJsKHJhd0xpbmssIHVwbG9hZENhY2hlKTtcbiAgICAgICAgICAgIGNvbnN0IGFsdFRleHQgPSB0aGlzLmV4dHJhY3RNYXJrZG93bkFsdFRleHQobWF0Y2hbMF0pIHx8IHRoaXMuZ2V0RGlzcGxheU5hbWVGcm9tVXJsKHJhd0xpbmspO1xuICAgICAgICAgICAgc2Vlbi5zZXQobWF0Y2hbMF0sIHtcbiAgICAgICAgICAgICAgb3JpZ2luYWw6IG1hdGNoWzBdLFxuICAgICAgICAgICAgICByZXdyaXR0ZW46IHRoaXMuaW1hZ2VTdXBwb3J0LmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsLCBhbHRUZXh0KSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKGBbc2VjdXJlLXdlYmRhdi1pbWFnZXNdIFx1OERGM1x1OEZDN1x1NTkzMVx1OEQyNVx1NzY4NFx1OEZEQ1x1N0EwQlx1NTZGRVx1NzI0NyAke3Jhd0xpbmt9YCwgZT8ubWVzc2FnZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBmaWxlID0gdGhpcy5yZXNvbHZlTGlua2VkRmlsZShyYXdMaW5rLCBub3RlRmlsZS5wYXRoKTtcbiAgICAgIGlmICghZmlsZSB8fCAhdGhpcy5pc0ltYWdlRmlsZShmaWxlKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFzZWVuLmhhcyhtYXRjaFswXSkpIHtcbiAgICAgICAgY29uc3QgcmVtb3RlVXJsID0gYXdhaXQgdGhpcy51cGxvYWRWYXVsdEZpbGUoZmlsZSwgdXBsb2FkQ2FjaGUpO1xuICAgICAgICBzZWVuLnNldChtYXRjaFswXSwge1xuICAgICAgICAgIG9yaWdpbmFsOiBtYXRjaFswXSxcbiAgICAgICAgICByZXdyaXR0ZW46IHRoaXMuaW1hZ2VTdXBwb3J0LmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsLCBmaWxlLmJhc2VuYW1lKSxcbiAgICAgICAgICBzb3VyY2VGaWxlOiBmaWxlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIGh0bWxJbWFnZU1hdGNoZXMpIHtcbiAgICAgIGNvbnN0IHJhd0xpbmsgPSB0aGlzLnVuZXNjYXBlSHRtbChtYXRjaFsxXS50cmltKCkpO1xuICAgICAgaWYgKCF0aGlzLmlzSHR0cFVybChyYXdMaW5rKSB8fCBzZWVuLmhhcyhtYXRjaFswXSkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlbW90ZVVybCA9IGF3YWl0IHRoaXMudXBsb2FkUmVtb3RlSW1hZ2VVcmwocmF3TGluaywgdXBsb2FkQ2FjaGUpO1xuICAgICAgICBjb25zdCBhbHRUZXh0ID0gdGhpcy5leHRyYWN0SHRtbEltYWdlQWx0VGV4dChtYXRjaFswXSkgfHwgdGhpcy5nZXREaXNwbGF5TmFtZUZyb21VcmwocmF3TGluayk7XG4gICAgICAgIHNlZW4uc2V0KG1hdGNoWzBdLCB7XG4gICAgICAgICAgb3JpZ2luYWw6IG1hdGNoWzBdLFxuICAgICAgICAgIHJld3JpdHRlbjogdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZU1hcmt1cChyZW1vdGVVcmwsIGFsdFRleHQpLFxuICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgICAgICBjb25zb2xlLndhcm4oYFtzZWN1cmUtd2ViZGF2LWltYWdlc10gXHU4REYzXHU4RkM3XHU1OTMxXHU4RDI1XHU3Njg0XHU4RkRDXHU3QTBCXHU1NkZFXHU3MjQ3ICR7cmF3TGlua31gLCBlPy5tZXNzYWdlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gWy4uLnNlZW4udmFsdWVzKCldO1xuICB9XG5cbiAgcHJpdmF0ZSBleHRyYWN0TWFya2Rvd25BbHRUZXh0KG1hcmtkb3duSW1hZ2U6IHN0cmluZykge1xuICAgIGNvbnN0IG1hdGNoID0gbWFya2Rvd25JbWFnZS5tYXRjaCgvXiFcXFsoW15cXF1dKilcXF0vKTtcbiAgICByZXR1cm4gbWF0Y2g/LlsxXT8udHJpbSgpID8/IFwiXCI7XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RIdG1sSW1hZ2VBbHRUZXh0KGh0bWxJbWFnZTogc3RyaW5nKSB7XG4gICAgY29uc3QgbWF0Y2ggPSBodG1sSW1hZ2UubWF0Y2goL1xcYmFsdD1bXCInXShbXlwiJ10qKVtcIiddL2kpO1xuICAgIHJldHVybiBtYXRjaCA/IHRoaXMudW5lc2NhcGVIdG1sKG1hdGNoWzFdLnRyaW0oKSkgOiBcIlwiO1xuICB9XG5cbiAgcHJpdmF0ZSBpc0h0dHBVcmwodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiAvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KHZhbHVlKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0RGlzcGxheU5hbWVGcm9tVXJsKHJhd1VybDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmF3VXJsKTtcbiAgICAgIGNvbnN0IGZpbGVOYW1lID0gdGhpcy5zYW5pdGl6ZUZpbGVOYW1lKHVybC5wYXRobmFtZS5zcGxpdChcIi9cIikucG9wKCkgfHwgXCJcIik7XG4gICAgICBpZiAoZmlsZU5hbWUpIHtcbiAgICAgICAgcmV0dXJuIGZpbGVOYW1lLnJlcGxhY2UoL1xcLlteLl0rJC8sIFwiXCIpO1xuICAgICAgfVxuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gRmFsbCB0aHJvdWdoIHRvIHRoZSBnZW5lcmljIGxhYmVsIGJlbG93LlxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnQoXCJcdTdGNTFcdTk4NzVcdTU2RkVcdTcyNDdcIiwgXCJXZWIgaW1hZ2VcIik7XG4gIH1cblxuICBwcml2YXRlIHJlc29sdmVMaW5rZWRGaWxlKGxpbms6IHN0cmluZywgc291cmNlUGF0aDogc3RyaW5nKTogVEZpbGUgfCBudWxsIHtcbiAgICBjb25zdCBjbGVhbmVkID0gbGluay5yZXBsYWNlKC8jLiovLCBcIlwiKS50cmltKCk7XG4gICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5hcHAubWV0YWRhdGFDYWNoZS5nZXRGaXJzdExpbmtwYXRoRGVzdChjbGVhbmVkLCBzb3VyY2VQYXRoKTtcbiAgICByZXR1cm4gdGFyZ2V0IGluc3RhbmNlb2YgVEZpbGUgPyB0YXJnZXQgOiBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBpc0ltYWdlRmlsZShmaWxlOiBURmlsZSkge1xuICAgIHJldHVybiAvXihwbmd8anBlP2d8Z2lmfHdlYnB8Ym1wfHN2ZykkL2kudGVzdChmaWxlLmV4dGVuc2lvbik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwbG9hZFZhdWx0RmlsZShmaWxlOiBURmlsZSwgdXBsb2FkQ2FjaGU/OiBNYXA8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgaWYgKHVwbG9hZENhY2hlPy5oYXMoZmlsZS5wYXRoKSkge1xuICAgICAgcmV0dXJuIHVwbG9hZENhY2hlLmdldChmaWxlLnBhdGgpITtcbiAgICB9XG5cbiAgICB0aGlzLmVuc3VyZUNvbmZpZ3VyZWQoKTtcbiAgICBjb25zdCBiaW5hcnkgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgIGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdGhpcy5wcmVwYXJlVXBsb2FkUGF5bG9hZChiaW5hcnksIHRoaXMuZ2V0TWltZVR5cGUoZmlsZS5leHRlbnNpb24pLCBmaWxlLm5hbWUpO1xuICAgIGNvbnN0IHJlbW90ZU5hbWUgPSBhd2FpdCB0aGlzLmJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5KHByZXBhcmVkLmZpbGVOYW1lLCBwcmVwYXJlZC5iaW5hcnkpO1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkUmVtb3RlUGF0aChyZW1vdGVOYW1lKTtcbiAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBwcmVwYXJlZC5iaW5hcnksIHByZXBhcmVkLm1pbWVUeXBlKTtcbiAgICBjb25zdCByZW1vdGVVcmwgPSBgJHtTRUNVUkVfUFJPVE9DT0x9Ly8ke3JlbW90ZVBhdGh9YDtcbiAgICB1cGxvYWRDYWNoZT8uc2V0KGZpbGUucGF0aCwgcmVtb3RlVXJsKTtcbiAgICByZXR1cm4gcmVtb3RlVXJsO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRSZW1vdGVJbWFnZVVybChpbWFnZVVybDogc3RyaW5nLCB1cGxvYWRDYWNoZT86IE1hcDxzdHJpbmcsIHN0cmluZz4pIHtcbiAgICBjb25zdCBjYWNoZUtleSA9IGByZW1vdGU6JHtpbWFnZVVybH1gO1xuICAgIGlmICh1cGxvYWRDYWNoZT8uaGFzKGNhY2hlS2V5KSkge1xuICAgICAgcmV0dXJuIHVwbG9hZENhY2hlLmdldChjYWNoZUtleSkhO1xuICAgIH1cblxuICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogaW1hZ2VVcmwsXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBmb2xsb3dSZWRpcmVjdHM6IHRydWUsXG4gICAgfSk7XG5cbiAgICB0aGlzLmFzc2VydFJlc3BvbnNlU3VjY2VzcyhyZXNwb25zZSwgXCJSZW1vdGUgaW1hZ2UgZG93bmxvYWRcIik7XG5cbiAgICBjb25zdCBjb250ZW50VHlwZSA9IHJlc3BvbnNlLmhlYWRlcnNbXCJjb250ZW50LXR5cGVcIl0gPz8gXCJcIjtcbiAgICBpZiAoIXRoaXMuaXNJbWFnZUNvbnRlbnRUeXBlKGNvbnRlbnRUeXBlKSAmJiAhdGhpcy5sb29rc0xpa2VJbWFnZVVybChpbWFnZVVybCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJcdThGRENcdTdBMEJcdTk0RkVcdTYzQTVcdTRFMERcdTY2MkZcdTUzRUZcdThCQzZcdTUyMkJcdTc2ODRcdTU2RkVcdTcyNDdcdThENDRcdTZFOTBcdTMwMDJcIiwgXCJUaGUgcmVtb3RlIFVSTCBkb2VzIG5vdCBsb29rIGxpa2UgYW4gaW1hZ2UgcmVzb3VyY2UuXCIpKTtcbiAgICB9XG5cbiAgICBjb25zdCBmaWxlTmFtZSA9IHRoaXMuYnVpbGRSZW1vdGVTb3VyY2VGaWxlTmFtZShpbWFnZVVybCwgY29udGVudFR5cGUpO1xuICAgIGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdGhpcy5wcmVwYXJlVXBsb2FkUGF5bG9hZChcbiAgICAgIHJlc3BvbnNlLmFycmF5QnVmZmVyLFxuICAgICAgdGhpcy5ub3JtYWxpemVJbWFnZU1pbWVUeXBlKGNvbnRlbnRUeXBlLCBmaWxlTmFtZSksXG4gICAgICBmaWxlTmFtZSxcbiAgICApO1xuICAgIGNvbnN0IHJlbW90ZU5hbWUgPSBhd2FpdCB0aGlzLmJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5KHByZXBhcmVkLmZpbGVOYW1lLCBwcmVwYXJlZC5iaW5hcnkpO1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLmJ1aWxkUmVtb3RlUGF0aChyZW1vdGVOYW1lKTtcbiAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBwcmVwYXJlZC5iaW5hcnksIHByZXBhcmVkLm1pbWVUeXBlKTtcbiAgICBjb25zdCByZW1vdGVVcmwgPSBgJHtTRUNVUkVfUFJPVE9DT0x9Ly8ke3JlbW90ZVBhdGh9YDtcbiAgICB1cGxvYWRDYWNoZT8uc2V0KGNhY2hlS2V5LCByZW1vdGVVcmwpO1xuICAgIHJldHVybiByZW1vdGVVcmw7XG4gIH1cblxuICBwcml2YXRlIGlzSW1hZ2VDb250ZW50VHlwZShjb250ZW50VHlwZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIC9eaW1hZ2VcXC8vaS50ZXN0KGNvbnRlbnRUeXBlLnRyaW0oKSk7XG4gIH1cblxuICBwcml2YXRlIGxvb2tzTGlrZUltYWdlVXJsKHJhd1VybDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmF3VXJsKTtcbiAgICAgIHJldHVybiAvXFwuKHBuZ3xqcGU/Z3xnaWZ8d2VicHxibXB8c3ZnKSQvaS50ZXN0KHVybC5wYXRobmFtZSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBidWlsZFJlbW90ZVNvdXJjZUZpbGVOYW1lKHJhd1VybDogc3RyaW5nLCBjb250ZW50VHlwZTogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmF3VXJsKTtcbiAgICAgIGNvbnN0IGNhbmRpZGF0ZSA9IHRoaXMuc2FuaXRpemVGaWxlTmFtZSh1cmwucGF0aG5hbWUuc3BsaXQoXCIvXCIpLnBvcCgpIHx8IFwiXCIpO1xuICAgICAgaWYgKGNhbmRpZGF0ZSAmJiAvXFwuW2EtejAtOV0rJC9pLnRlc3QoY2FuZGlkYXRlKSkge1xuICAgICAgICByZXR1cm4gY2FuZGlkYXRlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBleHRlbnNpb24gPSB0aGlzLmdldEV4dGVuc2lvbkZyb21NaW1lVHlwZShjb250ZW50VHlwZSkgfHwgXCJwbmdcIjtcbiAgICAgIHJldHVybiBjYW5kaWRhdGUgPyBgJHtjYW5kaWRhdGV9LiR7ZXh0ZW5zaW9ufWAgOiBgcmVtb3RlLWltYWdlLiR7ZXh0ZW5zaW9ufWA7XG4gICAgfSBjYXRjaCB7XG4gICAgICBjb25zdCBleHRlbnNpb24gPSB0aGlzLmdldEV4dGVuc2lvbkZyb21NaW1lVHlwZShjb250ZW50VHlwZSkgfHwgXCJwbmdcIjtcbiAgICAgIHJldHVybiBgcmVtb3RlLWltYWdlLiR7ZXh0ZW5zaW9ufWA7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBzYW5pdGl6ZUZpbGVOYW1lKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gZmlsZU5hbWUucmVwbGFjZSgvW1xcXFwvOio/XCI8PnxdKy9nLCBcIi1cIikudHJpbSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRFeHRlbnNpb25Gcm9tTWltZVR5cGUoY29udGVudFR5cGU6IHN0cmluZykge1xuICAgIGNvbnN0IG1pbWVUeXBlID0gY29udGVudFR5cGUuc3BsaXQoXCI7XCIpWzBdLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIHJldHVybiBNSU1FX01BUFttaW1lVHlwZV0gPz8gXCJcIjtcbiAgfVxuXG4gIHByaXZhdGUgbm9ybWFsaXplSW1hZ2VNaW1lVHlwZShjb250ZW50VHlwZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgbWltZVR5cGUgPSBjb250ZW50VHlwZS5zcGxpdChcIjtcIilbMF0udHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKG1pbWVUeXBlICYmIG1pbWVUeXBlICE9PSBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiKSB7XG4gICAgICByZXR1cm4gbWltZVR5cGU7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUoZmlsZU5hbWUpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRCaW5hcnkocmVtb3RlUGF0aDogc3RyaW5nLCBiaW5hcnk6IEFycmF5QnVmZmVyLCBtaW1lVHlwZTogc3RyaW5nKSB7XG4gICAgYXdhaXQgdGhpcy5lbnN1cmVSZW1vdGVEaXJlY3RvcmllcyhyZW1vdGVQYXRoKTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiUFVUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIFwiQ29udGVudC1UeXBlXCI6IG1pbWVUeXBlLFxuICAgICAgfSxcbiAgICAgIGJvZHk6IGJpbmFyeSxcbiAgICB9KTtcblxuICAgIHRoaXMuYXNzZXJ0UmVzcG9uc2VTdWNjZXNzKHJlc3BvbnNlLCBcIlVwbG9hZFwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlRWRpdG9yUGFzdGUoZXZ0OiBDbGlwYm9hcmRFdmVudCwgZWRpdG9yOiBFZGl0b3IsIGluZm86IE1hcmtkb3duVmlldyB8IE1hcmtkb3duRmlsZUluZm8pIHtcbiAgICBpZiAoZXZ0LmRlZmF1bHRQcmV2ZW50ZWQgfHwgIWluZm8uZmlsZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGltYWdlRmlsZSA9IHRoaXMuZXh0cmFjdEltYWdlRmlsZUZyb21DbGlwYm9hcmQoZXZ0KTtcbiAgICBpZiAoaW1hZ2VGaWxlKSB7XG4gICAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGNvbnN0IGZpbGVOYW1lID0gaW1hZ2VGaWxlLm5hbWUgfHwgdGhpcy5idWlsZENsaXBib2FyZEZpbGVOYW1lKGltYWdlRmlsZS50eXBlKTtcbiAgICAgIGF3YWl0IHRoaXMudXBsb2FkUXVldWUuZW5xdWV1ZUVkaXRvckltYWdlVXBsb2FkKGluZm8uZmlsZSwgZWRpdG9yLCBpbWFnZUZpbGUsIGZpbGVOYW1lKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBodG1sID0gZXZ0LmNsaXBib2FyZERhdGE/LmdldERhdGEoXCJ0ZXh0L2h0bWxcIik/LnRyaW0oKSA/PyBcIlwiO1xuICAgIGlmICghaHRtbCB8fCAhdGhpcy5odG1sQ29udGFpbnNSZW1vdGVJbWFnZXMoaHRtbCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICBhd2FpdCB0aGlzLmhhbmRsZUh0bWxQYXN0ZVdpdGhSZW1vdGVJbWFnZXMoaW5mby5maWxlLCBlZGl0b3IsIGh0bWwpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVFZGl0b3JEcm9wKGV2dDogRHJhZ0V2ZW50LCBlZGl0b3I6IEVkaXRvciwgaW5mbzogTWFya2Rvd25WaWV3IHwgTWFya2Rvd25GaWxlSW5mbykge1xuICAgIGlmIChldnQuZGVmYXVsdFByZXZlbnRlZCB8fCAhaW5mby5maWxlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaW1hZ2VGaWxlID0gdGhpcy5leHRyYWN0SW1hZ2VGaWxlRnJvbURyb3AoZXZ0KTtcbiAgICBpZiAoIWltYWdlRmlsZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IGZpbGVOYW1lID0gaW1hZ2VGaWxlLm5hbWUgfHwgdGhpcy5idWlsZENsaXBib2FyZEZpbGVOYW1lKGltYWdlRmlsZS50eXBlKTtcbiAgICBhd2FpdCB0aGlzLnVwbG9hZFF1ZXVlLmVucXVldWVFZGl0b3JJbWFnZVVwbG9hZChpbmZvLmZpbGUsIGVkaXRvciwgaW1hZ2VGaWxlLCBmaWxlTmFtZSk7XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RJbWFnZUZpbGVGcm9tQ2xpcGJvYXJkKGV2dDogQ2xpcGJvYXJkRXZlbnQpIHtcbiAgICBjb25zdCBkaXJlY3QgPSBBcnJheS5mcm9tKGV2dC5jbGlwYm9hcmREYXRhPy5maWxlcyA/PyBbXSkuZmluZCgoZmlsZSkgPT4gZmlsZS50eXBlLnN0YXJ0c1dpdGgoXCJpbWFnZS9cIikpO1xuICAgIGlmIChkaXJlY3QpIHtcbiAgICAgIHJldHVybiBkaXJlY3Q7XG4gICAgfVxuXG4gICAgY29uc3QgaXRlbSA9IEFycmF5LmZyb20oZXZ0LmNsaXBib2FyZERhdGE/Lml0ZW1zID8/IFtdKS5maW5kKChlbnRyeSkgPT4gZW50cnkudHlwZS5zdGFydHNXaXRoKFwiaW1hZ2UvXCIpKTtcbiAgICByZXR1cm4gaXRlbT8uZ2V0QXNGaWxlKCkgPz8gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgaHRtbENvbnRhaW5zUmVtb3RlSW1hZ2VzKGh0bWw6IHN0cmluZykge1xuICAgIHJldHVybiAvPGltZ1xcYltePl0qc3JjPVtcIiddaHR0cHM/OlxcL1xcL1teXCInXStbXCInXVtePl0qPi9pLnRlc3QoaHRtbCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUh0bWxQYXN0ZVdpdGhSZW1vdGVJbWFnZXMobm90ZUZpbGU6IFRGaWxlLCBlZGl0b3I6IEVkaXRvciwgaHRtbDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlbmRlcmVkID0gYXdhaXQgdGhpcy5jb252ZXJ0SHRtbENsaXBib2FyZFRvU2VjdXJlTWFya2Rvd24oaHRtbCwgbm90ZUZpbGUpO1xuICAgICAgaWYgKCFyZW5kZXJlZC50cmltKCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBlZGl0b3IucmVwbGFjZVNlbGVjdGlvbihyZW5kZXJlZCk7XG4gICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NURGMlx1NUMwNlx1N0Y1MVx1OTg3NVx1NTZGRVx1NjU4N1x1N0M5OFx1OEQzNFx1NUU3Nlx1NjI5M1x1NTNENlx1OEZEQ1x1N0EwQlx1NTZGRVx1NzI0N1x1MzAwMlwiLCBcIlBhc3RlZCB3ZWIgY29udGVudCBhbmQgY2FwdHVyZWQgcmVtb3RlIGltYWdlcy5cIikpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHBhc3RlIEhUTUwgY29udGVudCB3aXRoIHJlbW90ZSBpbWFnZXNcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgdGhpcy5kZXNjcmliZUVycm9yKFxuICAgICAgICAgIHRoaXMudChcIlx1NTkwNFx1NzQwNlx1N0Y1MVx1OTg3NVx1NTZGRVx1NjU4N1x1N0M5OFx1OEQzNFx1NTkzMVx1OEQyNVwiLCBcIkZhaWxlZCB0byBwcm9jZXNzIHBhc3RlZCB3ZWIgY29udGVudFwiKSxcbiAgICAgICAgICBlcnJvcixcbiAgICAgICAgKSxcbiAgICAgICAgODAwMCxcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjb252ZXJ0SHRtbENsaXBib2FyZFRvU2VjdXJlTWFya2Rvd24oaHRtbDogc3RyaW5nLCBub3RlRmlsZTogVEZpbGUpIHtcbiAgICBjb25zdCBwYXJzZXIgPSBuZXcgRE9NUGFyc2VyKCk7XG4gICAgY29uc3QgZG9jdW1lbnQgPSBwYXJzZXIucGFyc2VGcm9tU3RyaW5nKGh0bWwsIFwidGV4dC9odG1sXCIpO1xuICAgIGNvbnN0IHVwbG9hZENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgICBjb25zdCByZW5kZXJlZEJsb2Nrczogc3RyaW5nW10gPSBbXTtcblxuICAgIGZvciAoY29uc3Qgbm9kZSBvZiBBcnJheS5mcm9tKGRvY3VtZW50LmJvZHkuY2hpbGROb2RlcykpIHtcbiAgICAgIGNvbnN0IGJsb2NrID0gYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sTm9kZShub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIDApO1xuICAgICAgaWYgKGJsb2NrLnRyaW0oKSkge1xuICAgICAgICByZW5kZXJlZEJsb2Nrcy5wdXNoKGJsb2NrLnRyaW0oKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlbmRlcmVkQmxvY2tzLmpvaW4oXCJcXG5cXG5cIikgKyBcIlxcblwiO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZW5kZXJQYXN0ZWRIdG1sTm9kZShcbiAgICBub2RlOiBOb2RlLFxuICAgIG5vdGVGaWxlOiBURmlsZSxcbiAgICB1cGxvYWRDYWNoZTogTWFwPHN0cmluZywgc3RyaW5nPixcbiAgICBsaXN0RGVwdGg6IG51bWJlcixcbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUpIHtcbiAgICAgIHJldHVybiB0aGlzLm5vcm1hbGl6ZUNsaXBib2FyZFRleHQobm9kZS50ZXh0Q29udGVudCA/PyBcIlwiKTtcbiAgICB9XG5cbiAgICBpZiAoIShub2RlIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpKSB7XG4gICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG5cbiAgICBjb25zdCB0YWcgPSBub2RlLnRhZ05hbWUudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAodGFnID09PSBcImltZ1wiKSB7XG4gICAgICBjb25zdCBzcmMgPSB0aGlzLnVuZXNjYXBlSHRtbChub2RlLmdldEF0dHJpYnV0ZShcInNyY1wiKT8udHJpbSgpID8/IFwiXCIpO1xuICAgICAgaWYgKCF0aGlzLmlzSHR0cFVybChzcmMpKSB7XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBhbHQgPSAobm9kZS5nZXRBdHRyaWJ1dGUoXCJhbHRcIikgPz8gXCJcIikudHJpbSgpIHx8IHRoaXMuZ2V0RGlzcGxheU5hbWVGcm9tVXJsKHNyYyk7XG4gICAgICBjb25zdCByZW1vdGVVcmwgPSBhd2FpdCB0aGlzLnVwbG9hZFJlbW90ZUltYWdlVXJsKHNyYywgdXBsb2FkQ2FjaGUpO1xuICAgICAgcmV0dXJuIHRoaXMuaW1hZ2VTdXBwb3J0LmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsLCBhbHQpO1xuICAgIH1cblxuICAgIGlmICh0YWcgPT09IFwiYnJcIikge1xuICAgICAgcmV0dXJuIFwiXFxuXCI7XG4gICAgfVxuXG4gICAgaWYgKHRhZyA9PT0gXCJ1bFwiIHx8IHRhZyA9PT0gXCJvbFwiKSB7XG4gICAgICBjb25zdCBpdGVtczogc3RyaW5nW10gPSBbXTtcbiAgICAgIGxldCBpbmRleCA9IDE7XG4gICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIEFycmF5LmZyb20obm9kZS5jaGlsZHJlbikpIHtcbiAgICAgICAgaWYgKGNoaWxkLnRhZ05hbWUudG9Mb3dlckNhc2UoKSAhPT0gXCJsaVwiKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZW5kZXJlZCA9IChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxOb2RlKGNoaWxkLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCArIDEpKS50cmltKCk7XG4gICAgICAgIGlmICghcmVuZGVyZWQpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHByZWZpeCA9IHRhZyA9PT0gXCJvbFwiID8gYCR7aW5kZXh9LiBgIDogXCItIFwiO1xuICAgICAgICBpdGVtcy5wdXNoKGAke1wiICBcIi5yZXBlYXQoTWF0aC5tYXgoMCwgbGlzdERlcHRoKSl9JHtwcmVmaXh9JHtyZW5kZXJlZH1gKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGl0ZW1zLmpvaW4oXCJcXG5cIik7XG4gICAgfVxuXG4gICAgaWYgKHRhZyA9PT0gXCJsaVwiKSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGF3YWl0IHRoaXMucmVuZGVyUGFzdGVkSHRtbENoaWxkcmVuKG5vZGUsIG5vdGVGaWxlLCB1cGxvYWRDYWNoZSwgbGlzdERlcHRoKTtcbiAgICAgIHJldHVybiBwYXJ0cy5qb2luKFwiXCIpLnRyaW0oKTtcbiAgICB9XG5cbiAgICBpZiAoL15oWzEtNl0kLy50ZXN0KHRhZykpIHtcbiAgICAgIGNvbnN0IGxldmVsID0gTnVtYmVyLnBhcnNlSW50KHRhZ1sxXSwgMTApO1xuICAgICAgY29uc3QgdGV4dCA9IChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIikudHJpbSgpO1xuICAgICAgcmV0dXJuIHRleHQgPyBgJHtcIiNcIi5yZXBlYXQobGV2ZWwpfSAke3RleHR9YCA6IFwiXCI7XG4gICAgfVxuXG4gICAgaWYgKHRhZyA9PT0gXCJhXCIpIHtcbiAgICAgIGNvbnN0IGhyZWYgPSBub2RlLmdldEF0dHJpYnV0ZShcImhyZWZcIik/LnRyaW0oKSA/PyBcIlwiO1xuICAgICAgY29uc3QgdGV4dCA9IChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIikudHJpbSgpO1xuICAgICAgaWYgKGhyZWYgJiYgL15odHRwcz86XFwvXFwvL2kudGVzdChocmVmKSAmJiB0ZXh0KSB7XG4gICAgICAgIHJldHVybiBgWyR7dGV4dH1dKCR7aHJlZn0pYDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0ZXh0O1xuICAgIH1cblxuICAgIGNvbnN0IGlubGluZVRhZ3MgPSBuZXcgU2V0KFtcInN0cm9uZ1wiLCBcImJcIiwgXCJlbVwiLCBcImlcIiwgXCJzcGFuXCIsIFwiY29kZVwiLCBcInNtYWxsXCIsIFwic3VwXCIsIFwic3ViXCJdKTtcbiAgICBpZiAoaW5saW5lVGFncy5oYXModGFnKSkge1xuICAgICAgcmV0dXJuIChhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxDaGlsZHJlbihub2RlLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCkpLmpvaW4oXCJcIik7XG4gICAgfVxuXG4gICAgY29uc3QgYmxvY2tUYWdzID0gbmV3IFNldChbXG4gICAgICBcInBcIixcbiAgICAgIFwiZGl2XCIsXG4gICAgICBcImFydGljbGVcIixcbiAgICAgIFwic2VjdGlvblwiLFxuICAgICAgXCJmaWd1cmVcIixcbiAgICAgIFwiZmlnY2FwdGlvblwiLFxuICAgICAgXCJibG9ja3F1b3RlXCIsXG4gICAgICBcInByZVwiLFxuICAgICAgXCJ0YWJsZVwiLFxuICAgICAgXCJ0aGVhZFwiLFxuICAgICAgXCJ0Ym9keVwiLFxuICAgICAgXCJ0clwiLFxuICAgICAgXCJ0ZFwiLFxuICAgICAgXCJ0aFwiLFxuICAgIF0pO1xuICAgIGlmIChibG9ja1RhZ3MuaGFzKHRhZykpIHtcbiAgICAgIGNvbnN0IHRleHQgPSAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpLnRyaW0oKTtcbiAgICAgIHJldHVybiB0ZXh0O1xuICAgIH1cblxuICAgIHJldHVybiAoYXdhaXQgdGhpcy5yZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4obm9kZSwgbm90ZUZpbGUsIHVwbG9hZENhY2hlLCBsaXN0RGVwdGgpKS5qb2luKFwiXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZW5kZXJQYXN0ZWRIdG1sQ2hpbGRyZW4oXG4gICAgZWxlbWVudDogSFRNTEVsZW1lbnQsXG4gICAgbm90ZUZpbGU6IFRGaWxlLFxuICAgIHVwbG9hZENhY2hlOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuICAgIGxpc3REZXB0aDogbnVtYmVyLFxuICApIHtcbiAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIEFycmF5LmZyb20oZWxlbWVudC5jaGlsZE5vZGVzKSkge1xuICAgICAgY29uc3QgcmVuZGVyZWQgPSBhd2FpdCB0aGlzLnJlbmRlclBhc3RlZEh0bWxOb2RlKGNoaWxkLCBub3RlRmlsZSwgdXBsb2FkQ2FjaGUsIGxpc3REZXB0aCk7XG4gICAgICBpZiAoIXJlbmRlcmVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAocGFydHMubGVuZ3RoID4gMCAmJiAhcmVuZGVyZWQuc3RhcnRzV2l0aChcIlxcblwiKSAmJiAhcGFydHNbcGFydHMubGVuZ3RoIC0gMV0uZW5kc1dpdGgoXCJcXG5cIikpIHtcbiAgICAgICAgY29uc3QgcHJldmlvdXMgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXTtcbiAgICAgICAgY29uc3QgbmVlZHNTcGFjZSA9IC9cXFMkLy50ZXN0KHByZXZpb3VzKSAmJiAvXlxcUy8udGVzdChyZW5kZXJlZCk7XG4gICAgICAgIGlmIChuZWVkc1NwYWNlKSB7XG4gICAgICAgICAgcGFydHMucHVzaChcIiBcIik7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcGFydHMucHVzaChyZW5kZXJlZCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhcnRzO1xuICB9XG5cbiAgcHJpdmF0ZSBub3JtYWxpemVDbGlwYm9hcmRUZXh0KHZhbHVlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdmFsdWUucmVwbGFjZSgvXFxzKy9nLCBcIiBcIik7XG4gIH1cblxuICBwcml2YXRlIGV4dHJhY3RJbWFnZUZpbGVGcm9tRHJvcChldnQ6IERyYWdFdmVudCkge1xuICAgIHJldHVybiBBcnJheS5mcm9tKGV2dC5kYXRhVHJhbnNmZXI/LmZpbGVzID8/IFtdKS5maW5kKChmaWxlKSA9PiBmaWxlLnR5cGUuc3RhcnRzV2l0aChcImltYWdlL1wiKSkgPz8gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZW5xdWV1ZUVkaXRvckltYWdlVXBsb2FkKG5vdGVGaWxlOiBURmlsZSwgZWRpdG9yOiBFZGl0b3IsIGltYWdlRmlsZTogRmlsZSwgZmlsZU5hbWU6IHN0cmluZykge1xuXG4gICAgYXdhaXQgdGhpcy51cGxvYWRRdWV1ZS5lbnF1ZXVlRWRpdG9ySW1hZ2VVcGxvYWQobm90ZUZpbGUsIGVkaXRvciwgaW1hZ2VGaWxlLCBmaWxlTmFtZSk7XG4gIH1cblxuICBhc3luYyBzeW5jQ29uZmlndXJlZFZhdWx0Q29udGVudChzaG93Tm90aWNlID0gdHJ1ZSkge1xuICAgIGlmICh0aGlzLnN5bmNJblByb2dyZXNzKSB7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NTQwQ1x1NkI2NVx1NkI2M1x1NTcyOFx1OEZEQlx1ODg0Q1x1NEUyRFx1MzAwMlwiLCBcIkEgc3luYyBpcyBhbHJlYWR5IGluIHByb2dyZXNzLlwiKSwgNDAwMCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zeW5jSW5Qcm9ncmVzcyA9IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuZW5zdXJlQ29uZmlndXJlZCgpO1xuICAgICAgYXdhaXQgdGhpcy53YWl0Rm9yUGVuZGluZ1ZhdWx0TXV0YXRpb25zKCk7XG4gICAgICBjb25zdCB1cGxvYWRzUmVhZHkgPSBhd2FpdCB0aGlzLnByZXBhcmVQZW5kaW5nVXBsb2Fkc0ZvclN5bmMoc2hvd05vdGljZSk7XG4gICAgICBpZiAoIXVwbG9hZHNSZWFkeSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBhd2FpdCB0aGlzLnJlYnVpbGRSZWZlcmVuY2VJbmRleCgpO1xuXG4gICAgICBjb25zdCBjb3VudHMgPSB7XG4gICAgICAgIHVwbG9hZGVkOiAwLCByZXN0b3JlZEZyb21SZW1vdGU6IDAsIGRvd25sb2FkZWRPclVwZGF0ZWQ6IDAsIHNraXBwZWQ6IDAsXG4gICAgICAgIGRlbGV0ZWRSZW1vdGVGaWxlczogMCwgZGVsZXRlZExvY2FsRmlsZXM6IDAsIGRlbGV0ZWRMb2NhbFN0dWJzOiAwLFxuICAgICAgICBtaXNzaW5nUmVtb3RlQmFja2VkTm90ZXM6IDAsIHB1cmdlZE1pc3NpbmdMYXp5Tm90ZXM6IDAsXG4gICAgICAgIGRlbGV0ZWRSZW1vdGVEaXJlY3RvcmllczogMCwgY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzOiAwLFxuICAgICAgICBkZWxldGVkTG9jYWxEaXJlY3RvcmllczogMCwgY3JlYXRlZExvY2FsRGlyZWN0b3JpZXM6IDAsXG4gICAgICAgIGV2aWN0ZWROb3RlczogMCxcbiAgICAgIH07XG5cbiAgICAgIC8vIEV4cGxpY2l0IGxvY2FsIGRlbGV0ZXMvcmVuYW1lcyBtdXN0IGxhbmQgb24gdGhlIHJlbW90ZSBzaWRlIGJlZm9yZSB3ZVxuICAgICAgLy8gaW5zcGVjdCByZW1vdGUtb25seSBlbnRyaWVzLCBvdGhlcndpc2UgYSBqdXN0LW1vdmVkIG5vdGUgY2FuIGJlIHB1bGxlZFxuICAgICAgLy8gYmFjayBmcm9tIGl0cyBvbGQgcmVtb3RlIHBhdGggYW5kIGFwcGVhciBhcyBhIGR1cGxpY2F0ZSBsb2NhbCBmaWxlLlxuICAgICAgYXdhaXQgdGhpcy5wcm9jZXNzUGVuZGluZ1ZhdWx0UmVuYW1lcyhjb3VudHMpO1xuICAgICAgYXdhaXQgdGhpcy5wcm9jZXNzUGVuZGluZ1ZhdWx0RGVsZXRpb25zKGNvdW50cyk7XG5cbiAgICAgIGNvbnN0IHJlbW90ZUludmVudG9yeSA9IGF3YWl0IHRoaXMubGlzdFJlbW90ZVRyZWUodGhpcy5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpO1xuICAgICAgY29uc3QgZGVsZXRpb25Ub21ic3RvbmVzID0gYXdhaXQgdGhpcy5yZWFkRGVsZXRpb25Ub21ic3RvbmVzKCk7XG4gICAgICBjb25zdCByZW1vdGVGaWxlcyA9IHJlbW90ZUludmVudG9yeS5maWxlcztcblxuICAgICAgYXdhaXQgdGhpcy5yZWNvbmNpbGVPcnBoYW5lZFN5bmNFbnRyaWVzKHJlbW90ZUZpbGVzLCBkZWxldGlvblRvbWJzdG9uZXMsIGNvdW50cyk7XG4gICAgICBhd2FpdCB0aGlzLnJlY29uY2lsZVJlbW90ZU9ubHlGaWxlcyhyZW1vdGVGaWxlcywgZGVsZXRpb25Ub21ic3RvbmVzLCBjb3VudHMpO1xuICAgICAgYXdhaXQgdGhpcy5yZWNvbmNpbGVMb2NhbEZpbGVzKHJlbW90ZUZpbGVzLCBkZWxldGlvblRvbWJzdG9uZXMsIGNvdW50cyk7XG5cbiAgICAgIGNvbnN0IGRpclN0YXRzID0gYXdhaXQgdGhpcy5yZWNvbmNpbGVEaXJlY3RvcmllcyhyZW1vdGVJbnZlbnRvcnkuZGlyZWN0b3JpZXMpO1xuICAgICAgY291bnRzLmRlbGV0ZWRSZW1vdGVEaXJlY3RvcmllcyA9IGRpclN0YXRzLmRlbGV0ZWRSZW1vdGU7XG4gICAgICBjb3VudHMuY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzID0gZGlyU3RhdHMuY3JlYXRlZFJlbW90ZTtcbiAgICAgIGNvdW50cy5kZWxldGVkTG9jYWxEaXJlY3RvcmllcyA9IGRpclN0YXRzLmRlbGV0ZWRMb2NhbDtcbiAgICAgIGNvdW50cy5jcmVhdGVkTG9jYWxEaXJlY3RvcmllcyA9IGRpclN0YXRzLmNyZWF0ZWRMb2NhbDtcbiAgICAgIGF3YWl0IHRoaXMucmVjb25jaWxlUmVtb3RlSW1hZ2VzKCk7XG4gICAgICBjb3VudHMuZXZpY3RlZE5vdGVzID0gYXdhaXQgdGhpcy5ldmljdFN0YWxlU3luY2VkTm90ZXMoZmFsc2UpO1xuICAgICAgdGhpcy5wZW5kaW5nVmF1bHRTeW5jUGF0aHMuY2xlYXIoKTtcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0RGVsZXRpb25QYXRocy5jbGVhcigpO1xuXG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLnQoXG4gICAgICAgIGBcdTVERjJcdTUzQ0NcdTU0MTFcdTU0MENcdTZCNjVcdUZGMUFcdTRFMEFcdTRGMjAgJHtjb3VudHMudXBsb2FkZWR9IFx1NEUyQVx1NjU4N1x1NEVGNlx1RkYwQ1x1NEVDRVx1OEZEQ1x1N0FFRlx1NjJDOVx1NTNENiAke2NvdW50cy5yZXN0b3JlZEZyb21SZW1vdGUgKyBjb3VudHMuZG93bmxvYWRlZE9yVXBkYXRlZH0gXHU0RTJBXHU2NTg3XHU0RUY2XHVGRjBDXHU4REYzXHU4RkM3ICR7Y291bnRzLnNraXBwZWR9IFx1NEUyQVx1NjcyQVx1NTNEOFx1NTMxNlx1NjU4N1x1NEVGNlx1RkYwQ1x1NTIyMFx1OTY2NFx1OEZEQ1x1N0FFRlx1NTE4NVx1NUJCOSAke2NvdW50cy5kZWxldGVkUmVtb3RlRmlsZXN9IFx1NEUyQVx1MzAwMVx1NjcyQ1x1NTczMFx1NTE4NVx1NUJCOSAke2NvdW50cy5kZWxldGVkTG9jYWxGaWxlc30gXHU0RTJBJHtjb3VudHMuZGVsZXRlZExvY2FsU3R1YnMgPiAwID8gYFx1RkYwOFx1NTE3Nlx1NEUyRFx1NTkzMVx1NjU0OFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMCAke2NvdW50cy5kZWxldGVkTG9jYWxTdHVic30gXHU3QkM3XHVGRjA5YCA6IFwiXCJ9XHVGRjBDJHtjb3VudHMuZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzID4gMCB8fCBjb3VudHMuY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzID4gMCA/IGBcdTUyMjBcdTk2NjRcdThGRENcdTdBRUZcdTc2RUVcdTVGNTUgJHtjb3VudHMuZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzfSBcdTRFMkFcdTMwMDFcdTUyMUJcdTVFRkFcdThGRENcdTdBRUZcdTc2RUVcdTVGNTUgJHtjb3VudHMuY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzfSBcdTRFMkFcdTMwMDFgIDogXCJcIn0ke2NvdW50cy5kZWxldGVkTG9jYWxEaXJlY3RvcmllcyA+IDAgfHwgY291bnRzLmNyZWF0ZWRMb2NhbERpcmVjdG9yaWVzID4gMCA/IGBcdTUyMjBcdTk2NjRcdTY3MkNcdTU3MzBcdTc2RUVcdTVGNTUgJHtjb3VudHMuZGVsZXRlZExvY2FsRGlyZWN0b3JpZXN9IFx1NEUyQVx1MzAwMVx1NTIxQlx1NUVGQVx1NjcyQ1x1NTczMFx1NzZFRVx1NUY1NSAke2NvdW50cy5jcmVhdGVkTG9jYWxEaXJlY3Rvcmllc30gXHU0RTJBXHUzMDAxYCA6IFwiXCJ9JHtjb3VudHMuZXZpY3RlZE5vdGVzID4gMCA/IGBcdTU2REVcdTY1MzZcdTY3MkNcdTU3MzBcdTY1RTdcdTdCMTRcdThCQjAgJHtjb3VudHMuZXZpY3RlZE5vdGVzfSBcdTdCQzdcdTMwMDFgIDogXCJcIn0ke2NvdW50cy5taXNzaW5nUmVtb3RlQmFja2VkTm90ZXMgPiAwID8gYFx1NTNEMVx1NzNCMCAke2NvdW50cy5taXNzaW5nUmVtb3RlQmFja2VkTm90ZXN9IFx1N0JDN1x1NjMwOVx1OTcwMFx1N0IxNFx1OEJCMFx1N0YzQVx1NUMxMVx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1MzAwMWAgOiBcIlwifSR7Y291bnRzLnB1cmdlZE1pc3NpbmdMYXp5Tm90ZXMgPiAwID8gYFx1Nzg2RVx1OEJBNFx1NkUwNVx1NzQwNlx1NTkzMVx1NjU0OFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMCAke2NvdW50cy5wdXJnZWRNaXNzaW5nTGF6eU5vdGVzfSBcdTdCQzdcdTMwMDFgIDogXCJcIn1cdTMwMDJgLnJlcGxhY2UoL1x1MzAwMVx1MzAwMi8sIFwiXHUzMDAyXCIpLFxuICAgICAgICBgQmlkaXJlY3Rpb25hbCBzeW5jIHVwbG9hZGVkICR7Y291bnRzLnVwbG9hZGVkfSBmaWxlKHMpLCBwdWxsZWQgJHtjb3VudHMucmVzdG9yZWRGcm9tUmVtb3RlICsgY291bnRzLmRvd25sb2FkZWRPclVwZGF0ZWR9IGZpbGUocykgZnJvbSByZW1vdGUsIHNraXBwZWQgJHtjb3VudHMuc2tpcHBlZH0gdW5jaGFuZ2VkIGZpbGUocyksIGRlbGV0ZWQgJHtjb3VudHMuZGVsZXRlZFJlbW90ZUZpbGVzfSByZW1vdGUgY29udGVudCBmaWxlKHMpIGFuZCAke2NvdW50cy5kZWxldGVkTG9jYWxGaWxlc30gbG9jYWwgZmlsZShzKSR7Y291bnRzLmRlbGV0ZWRMb2NhbFN0dWJzID4gMCA/IGAgKGluY2x1ZGluZyAke2NvdW50cy5kZWxldGVkTG9jYWxTdHVic30gc3RhbGUgc3R1YiBub3RlKHMpKWAgOiBcIlwifSR7Y291bnRzLmRlbGV0ZWRSZW1vdGVEaXJlY3RvcmllcyA+IDAgPyBgLCBkZWxldGVkICR7Y291bnRzLmRlbGV0ZWRSZW1vdGVEaXJlY3Rvcmllc30gcmVtb3RlIGRpcmVjdG9yJHtjb3VudHMuZGVsZXRlZFJlbW90ZURpcmVjdG9yaWVzID09PSAxID8gXCJ5XCIgOiBcImllc1wifWAgOiBcIlwifSR7Y291bnRzLmNyZWF0ZWRSZW1vdGVEaXJlY3RvcmllcyA+IDAgPyBgLCBjcmVhdGVkICR7Y291bnRzLmNyZWF0ZWRSZW1vdGVEaXJlY3Rvcmllc30gcmVtb3RlIGRpcmVjdG9yJHtjb3VudHMuY3JlYXRlZFJlbW90ZURpcmVjdG9yaWVzID09PSAxID8gXCJ5XCIgOiBcImllc1wifWAgOiBcIlwifSR7Y291bnRzLmRlbGV0ZWRMb2NhbERpcmVjdG9yaWVzID4gMCA/IGAsIGRlbGV0ZWQgJHtjb3VudHMuZGVsZXRlZExvY2FsRGlyZWN0b3JpZXN9IGxvY2FsIGVtcHR5IGRpcmVjdG9yJHtjb3VudHMuZGVsZXRlZExvY2FsRGlyZWN0b3JpZXMgPT09IDEgPyBcInlcIiA6IFwiaWVzXCJ9YCA6IFwiXCJ9JHtjb3VudHMuY3JlYXRlZExvY2FsRGlyZWN0b3JpZXMgPiAwID8gYCwgY3JlYXRlZCAke2NvdW50cy5jcmVhdGVkTG9jYWxEaXJlY3Rvcmllc30gbG9jYWwgZGlyZWN0b3Ike2NvdW50cy5jcmVhdGVkTG9jYWxEaXJlY3RvcmllcyA9PT0gMSA/IFwieVwiIDogXCJpZXNcIn1gIDogXCJcIn0ke2NvdW50cy5ldmljdGVkTm90ZXMgPiAwID8gYCwgYW5kIGV2aWN0ZWQgJHtjb3VudHMuZXZpY3RlZE5vdGVzfSBzdGFsZSBsb2NhbCBub3RlKHMpYCA6IFwiXCJ9JHtjb3VudHMubWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzID4gMCA/IGAsIHdoaWxlIGRldGVjdGluZyAke2NvdW50cy5taXNzaW5nUmVtb3RlQmFja2VkTm90ZXN9IGxhenkgbm90ZShzKSBtaXNzaW5nIHRoZWlyIHJlbW90ZSBjb250ZW50YCA6IFwiXCJ9JHtjb3VudHMucHVyZ2VkTWlzc2luZ0xhenlOb3RlcyA+IDAgPyBgLCBhbmQgcHVyZ2VkICR7Y291bnRzLnB1cmdlZE1pc3NpbmdMYXp5Tm90ZXN9IGNvbmZpcm1lZCBicm9rZW4gbGF6eSBwbGFjZWhvbGRlcihzKWAgOiBcIlwifS5gLFxuICAgICAgKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cywgODAwMCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJWYXVsdCBjb250ZW50IHN5bmMgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY0F0ID0gRGF0ZS5ub3coKTtcbiAgICAgIHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cyA9IHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTUxODVcdTVCQjlcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIiwgXCJDb250ZW50IHN5bmMgZmFpbGVkXCIpLCBlcnJvcik7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMsIDgwMDApO1xuICAgICAgfVxuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLnN5bmNJblByb2dyZXNzID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc3luY1BlbmRpbmdWYXVsdENvbnRlbnQoc2hvd05vdGljZSA9IHRydWUpIHtcbiAgICBpZiAodGhpcy5zeW5jSW5Qcm9ncmVzcykge1xuICAgICAgaWYgKHNob3dOb3RpY2UpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdTU0MENcdTZCNjVcdTZCNjNcdTU3MjhcdThGREJcdTg4NENcdTRFMkRcdTMwMDJcIiwgXCJBIHN5bmMgaXMgYWxyZWFkeSBpbiBwcm9ncmVzcy5cIiksIDQwMDApO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuc3luY0luUHJvZ3Jlc3MgPSB0cnVlO1xuICAgIGNvbnN0IGNvdW50cyA9IHsgdXBsb2FkZWQ6IDAsIGRlbGV0ZWRSZW1vdGVGaWxlczogMCwgc2tpcHBlZDogMCwgZGV0ZWN0ZWRMb2NhbENoYW5nZXM6IDAgfTtcbiAgICB0cnkge1xuICAgICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG4gICAgICBhd2FpdCB0aGlzLndhaXRGb3JQZW5kaW5nVmF1bHRNdXRhdGlvbnMoKTtcbiAgICAgIGNvbnN0IHVwbG9hZHNSZWFkeSA9IGF3YWl0IHRoaXMucHJlcGFyZVBlbmRpbmdVcGxvYWRzRm9yU3luYyhzaG93Tm90aWNlKTtcbiAgICAgIGlmICghdXBsb2Fkc1JlYWR5KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5wcm9jZXNzUGVuZGluZ1ZhdWx0UmVuYW1lcyhjb3VudHMpO1xuICAgICAgYXdhaXQgdGhpcy5xdWV1ZUNoYW5nZWRMb2NhbEZpbGVzRm9yRmFzdFN5bmMoY291bnRzKTtcbiAgICAgIGF3YWl0IHRoaXMucHJvY2Vzc1BlbmRpbmdWYXVsdERlbGV0aW9ucyhjb3VudHMpO1xuICAgICAgYXdhaXQgdGhpcy5wcm9jZXNzUGVuZGluZ1ZhdWx0VXBsb2Fkcyhjb3VudHMpO1xuXG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLnQoXG4gICAgICAgIGBcdTVERjJcdTVGRUJcdTkwMUZcdTU0MENcdTZCNjVcdUZGMUFcdTUzRDFcdTczQjAgJHtjb3VudHMuZGV0ZWN0ZWRMb2NhbENoYW5nZXN9IFx1NEUyQVx1NjcyQ1x1NTczMFx1NTNEOFx1NTMxNlx1RkYwQ1x1NEUwQVx1NEYyMCAke2NvdW50cy51cGxvYWRlZH0gXHU0RTJBXHU2NTg3XHU0RUY2XHVGRjBDXHU1MjIwXHU5NjY0XHU4RkRDXHU3QUVGXHU1MTg1XHU1QkI5ICR7Y291bnRzLmRlbGV0ZWRSZW1vdGVGaWxlc30gXHU0RTJBXHVGRjBDXHU4REYzXHU4RkM3ICR7Y291bnRzLnNraXBwZWR9IFx1NEUyQVx1NjU4N1x1NEVGNlx1MzAwMmAsXG4gICAgICAgIGBGYXN0IHN5bmMgZm91bmQgJHtjb3VudHMuZGV0ZWN0ZWRMb2NhbENoYW5nZXN9IGxvY2FsIGNoYW5nZShzKSwgdXBsb2FkZWQgJHtjb3VudHMudXBsb2FkZWR9IGZpbGUocyksIGRlbGV0ZWQgJHtjb3VudHMuZGVsZXRlZFJlbW90ZUZpbGVzfSByZW1vdGUgY29udGVudCBmaWxlKHMpLCBhbmQgc2tpcHBlZCAke2NvdW50cy5za2lwcGVkfSBmaWxlKHMpLmAsXG4gICAgICApO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzLCA2MDAwKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhc3QgdmF1bHQgY29udGVudCBzeW5jIGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU1RkVCXHU5MDFGXHU1NDBDXHU2QjY1XHU1OTMxXHU4RDI1XCIsIFwiRmFzdCBzeW5jIGZhaWxlZFwiKSwgZXJyb3IpO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5sYXN0VmF1bHRTeW5jU3RhdHVzLCA4MDAwKTtcbiAgICAgIH1cbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy5zeW5jSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcXVldWVDaGFuZ2VkTG9jYWxGaWxlc0ZvckZhc3RTeW5jKGNvdW50czogeyBkZXRlY3RlZExvY2FsQ2hhbmdlczogbnVtYmVyOyBza2lwcGVkOiBudW1iZXIgfSkge1xuICAgIGNvbnN0IGZpbGVzID0gdGhpcy5zeW5jU3VwcG9ydC5jb2xsZWN0VmF1bHRDb250ZW50RmlsZXMoKTtcbiAgICBjb25zdCByZWNlbnRUb3VjaEdyYWNlTXMgPSAxMDAwO1xuICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgICBjb25zdCBwcmV2aW91cyA9IHRoaXMuc3luY0luZGV4LmdldChmaWxlLnBhdGgpO1xuICAgICAgY29uc3QgbWFya2Rvd25Db250ZW50ID0gZmlsZS5leHRlbnNpb24gPT09IFwibWRcIiA/IGF3YWl0IHRoaXMucmVhZE1hcmtkb3duQ29udGVudFByZWZlckVkaXRvcihmaWxlKSA6IHVuZGVmaW5lZDtcbiAgICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiICYmIHRoaXMucGFyc2VOb3RlU3R1YihtYXJrZG93bkNvbnRlbnQgPz8gXCJcIikpIHtcbiAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGxvY2FsU2lnbmF0dXJlID0gYXdhaXQgdGhpcy5idWlsZEN1cnJlbnRMb2NhbFNpZ25hdHVyZShmaWxlLCBtYXJrZG93bkNvbnRlbnQpO1xuICAgICAgY29uc3QgdG91Y2hlZFNpbmNlTGFzdFN5bmMgPVxuICAgICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA+IDAgJiYgZmlsZS5zdGF0Lm10aW1lID4gdGhpcy5sYXN0VmF1bHRTeW5jQXQgKyByZWNlbnRUb3VjaEdyYWNlTXM7XG4gICAgICBpZiAoIXByZXZpb3VzIHx8IHByZXZpb3VzLnJlbW90ZVBhdGggIT09IHJlbW90ZVBhdGggfHwgcHJldmlvdXMubG9jYWxTaWduYXR1cmUgIT09IGxvY2FsU2lnbmF0dXJlIHx8IHRvdWNoZWRTaW5jZUxhc3RTeW5jKSB7XG4gICAgICAgIGlmICghdGhpcy5wZW5kaW5nVmF1bHRTeW5jUGF0aHMuaGFzKGZpbGUucGF0aCkpIHtcbiAgICAgICAgICBjb3VudHMuZGV0ZWN0ZWRMb2NhbENoYW5nZXMgKz0gMTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm1hcmtQZW5kaW5nVmF1bHRTeW5jKGZpbGUucGF0aCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzUGVuZGluZ1ZhdWx0UmVuYW1lcyhcbiAgICBjb3VudHM6IHsgdXBsb2FkZWQ6IG51bWJlcjsgZGVsZXRlZFJlbW90ZUZpbGVzOiBudW1iZXI7IHNraXBwZWQ6IG51bWJlciB9LFxuICAgIHRhcmdldE9sZFBhdGhzPzogc3RyaW5nW10sXG4gICkge1xuICAgIGNvbnN0IHJlcXVlc3RlZCA9IHRhcmdldE9sZFBhdGhzID8gbmV3IFNldCh0YXJnZXRPbGRQYXRocy5tYXAoKHBhdGgpID0+IG5vcm1hbGl6ZVBhdGgocGF0aCkpKSA6IG51bGw7XG4gICAgZm9yIChjb25zdCBbb2xkUGF0aCwgZW50cnldIG9mIFsuLi50aGlzLnBlbmRpbmdWYXVsdFJlbmFtZVBhdGhzLmVudHJpZXMoKV0uc29ydCgoYSwgYikgPT4gYVswXS5sb2NhbGVDb21wYXJlKGJbMF0pKSkge1xuICAgICAgaWYgKHJlcXVlc3RlZCAmJiAhcmVxdWVzdGVkLmhhcyhvbGRQYXRoKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuc3luY1N1cHBvcnQuc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChvbGRQYXRoKSB8fCB0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgoZW50cnkubmV3UGF0aCkpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nVmF1bHRSZW5hbWVQYXRocy5kZWxldGUob2xkUGF0aCk7XG4gICAgICAgIHRoaXMucGVuZGluZ1ZhdWx0RGVsZXRpb25QYXRocy5kZWxldGUob2xkUGF0aCk7XG4gICAgICAgIGNvdW50cy5za2lwcGVkICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLndyaXRlRGVsZXRpb25Ub21ic3RvbmUob2xkUGF0aCwgZW50cnkub2xkUmVtb3RlU2lnbmF0dXJlKTtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlQ29udGVudEZpbGUoZW50cnkub2xkUmVtb3RlUGF0aCk7XG4gICAgICB0aGlzLnBlbmRpbmdWYXVsdERlbGV0aW9uUGF0aHMuZGVsZXRlKG9sZFBhdGgpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKG9sZFBhdGgpO1xuICAgICAgY291bnRzLmRlbGV0ZWRSZW1vdGVGaWxlcyArPSAxO1xuXG4gICAgICBjb25zdCBmaWxlID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgoZW50cnkubmV3UGF0aCk7XG4gICAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICAgIHRoaXMucGVuZGluZ1ZhdWx0UmVuYW1lUGF0aHMuZGVsZXRlKG9sZFBhdGgpO1xuICAgICAgICBjb3VudHMuc2tpcHBlZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbWFya2Rvd25Db250ZW50ID0gZmlsZS5leHRlbnNpb24gPT09IFwibWRcIiA/IGF3YWl0IHRoaXMucmVhZE1hcmtkb3duQ29udGVudFByZWZlckVkaXRvcihmaWxlKSA6IHVuZGVmaW5lZDtcbiAgICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiICYmIHRoaXMucGFyc2VOb3RlU3R1YihtYXJrZG93bkNvbnRlbnQgPz8gXCJcIikpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nVmF1bHRSZW5hbWVQYXRocy5kZWxldGUob2xkUGF0aCk7XG4gICAgICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzLmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgICBjb3VudHMuc2tpcHBlZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgICBjb25zdCBsb2NhbFNpZ25hdHVyZSA9IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUoZmlsZSwgbWFya2Rvd25Db250ZW50KTtcbiAgICAgIGxldCByZW1vdGVBdE5ld1BhdGg6IFJlbW90ZUZpbGVTdGF0ZSB8IG51bGwgPSBudWxsO1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmVtb3RlQXROZXdQYXRoID0gYXdhaXQgdGhpcy5zdGF0UmVtb3RlRmlsZShyZW1vdGVQYXRoKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZW1vdGVBdE5ld1BhdGggPSBudWxsO1xuICAgICAgfVxuICAgICAgaWYgKHJlbW90ZUF0TmV3UGF0aCAmJiByZW1vdGVBdE5ld1BhdGguc2lnbmF0dXJlICE9PSBsb2NhbFNpZ25hdHVyZSkge1xuICAgICAgICBhd2FpdCB0aGlzLmNyZWF0ZUxvY2FsQ29uZmxpY3RDb3B5KGZpbGUsIG1hcmtkb3duQ29udGVudCA/PyB1bmRlZmluZWQsIFwibG9jYWxcIik7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVwbG9hZGVkUmVtb3RlID0gYXdhaXQgdGhpcy51cGxvYWRDb250ZW50RmlsZVRvUmVtb3RlKGZpbGUsIHJlbW90ZVBhdGgsIG1hcmtkb3duQ29udGVudCk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5wZW5kaW5nVmF1bHRTeW5jUGF0aHMuZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICB0aGlzLnBlbmRpbmdWYXVsdFJlbmFtZVBhdGhzLmRlbGV0ZShvbGRQYXRoKTtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgIGNvdW50cy51cGxvYWRlZCArPSAxO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcHJvY2Vzc1BlbmRpbmdWYXVsdERlbGV0aW9ucyhjb3VudHM6IHsgZGVsZXRlZFJlbW90ZUZpbGVzOiBudW1iZXI7IHNraXBwZWQ6IG51bWJlciB9KSB7XG4gICAgZm9yIChjb25zdCBbcGF0aCwgZW50cnldIG9mIFsuLi50aGlzLnBlbmRpbmdWYXVsdERlbGV0aW9uUGF0aHMuZW50cmllcygpXS5zb3J0KChhLCBiKSA9PiBhWzBdLmxvY2FsZUNvbXBhcmUoYlswXSkpKSB7XG4gICAgICBpZiAodGhpcy5zeW5jU3VwcG9ydC5zaG91bGRTa2lwQ29udGVudFN5bmNQYXRoKHBhdGgpKSB7XG4gICAgICAgIHRoaXMucGVuZGluZ1ZhdWx0RGVsZXRpb25QYXRocy5kZWxldGUocGF0aCk7XG4gICAgICAgIGNvdW50cy5za2lwcGVkICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLndyaXRlRGVsZXRpb25Ub21ic3RvbmUocGF0aCwgZW50cnkucmVtb3RlU2lnbmF0dXJlKTtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlQ29udGVudEZpbGUoZW50cnkucmVtb3RlUGF0aCk7XG4gICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUocGF0aCk7XG4gICAgICB0aGlzLnBlbmRpbmdWYXVsdERlbGV0aW9uUGF0aHMuZGVsZXRlKHBhdGgpO1xuICAgICAgY291bnRzLmRlbGV0ZWRSZW1vdGVGaWxlcyArPSAxO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcHJvY2Vzc1BlbmRpbmdWYXVsdFVwbG9hZHMoY291bnRzOiB7IHVwbG9hZGVkOiBudW1iZXI7IHNraXBwZWQ6IG51bWJlciB9KSB7XG4gICAgZm9yIChjb25zdCBwYXRoIG9mIFsuLi50aGlzLnBlbmRpbmdWYXVsdFN5bmNQYXRoc10uc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSkge1xuICAgICAgaWYgKHRoaXMuc3luY1N1cHBvcnQuc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChwYXRoKSkge1xuICAgICAgICB0aGlzLnBlbmRpbmdWYXVsdFN5bmNQYXRocy5kZWxldGUocGF0aCk7XG4gICAgICAgIGNvdW50cy5za2lwcGVkICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBmaWxlID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgocGF0aCk7XG4gICAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzLmRlbGV0ZShwYXRoKTtcbiAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG1hcmtkb3duQ29udGVudCA9IGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIgPyBhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSkgOiB1bmRlZmluZWQ7XG4gICAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIiAmJiB0aGlzLnBhcnNlTm90ZVN0dWIobWFya2Rvd25Db250ZW50ID8/IFwiXCIpKSB7XG4gICAgICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzLmRlbGV0ZShwYXRoKTtcbiAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aChmaWxlLnBhdGgpO1xuICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCwgbWFya2Rvd25Db250ZW50KTtcbiAgICAgIGNvbnN0IGxvY2FsU2lnbmF0dXJlID0gYXdhaXQgdGhpcy5idWlsZEN1cnJlbnRMb2NhbFNpZ25hdHVyZShmaWxlLCBtYXJrZG93bkNvbnRlbnQpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiB1cGxvYWRlZFJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgIHRoaXMucGVuZGluZ1ZhdWx0U3luY1BhdGhzLmRlbGV0ZShwYXRoKTtcbiAgICAgIGNvdW50cy51cGxvYWRlZCArPSAxO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVjb25jaWxlT3JwaGFuZWRTeW5jRW50cmllcyhcbiAgICByZW1vdGVGaWxlczogTWFwPHN0cmluZywgUmVtb3RlRmlsZVN0YXRlPixcbiAgICBkZWxldGlvblRvbWJzdG9uZXM6IE1hcDxzdHJpbmcsIERlbGV0aW9uVG9tYnN0b25lPixcbiAgICBjb3VudHM6IHsgdXBsb2FkZWQ6IG51bWJlcjsgcmVzdG9yZWRGcm9tUmVtb3RlOiBudW1iZXI7IGRvd25sb2FkZWRPclVwZGF0ZWQ6IG51bWJlcjsgc2tpcHBlZDogbnVtYmVyOyBkZWxldGVkUmVtb3RlRmlsZXM6IG51bWJlcjsgZGVsZXRlZExvY2FsRmlsZXM6IG51bWJlcjsgZGVsZXRlZExvY2FsU3R1YnM6IG51bWJlcjsgbWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzOiBudW1iZXI7IHB1cmdlZE1pc3NpbmdMYXp5Tm90ZXM6IG51bWJlciB9LFxuICApIHtcbiAgICBjb25zdCBmaWxlcyA9IHRoaXMuc3luY1N1cHBvcnQuY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCk7XG4gICAgY29uc3QgY3VycmVudFBhdGhzID0gbmV3IFNldChmaWxlcy5tYXAoKGZpbGUpID0+IGZpbGUucGF0aCkpO1xuICAgIGZvciAoY29uc3QgcGF0aCBvZiBbLi4udGhpcy5zeW5jSW5kZXgua2V5cygpXSkge1xuICAgICAgaWYgKGN1cnJlbnRQYXRocy5oYXMocGF0aCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnN5bmNTdXBwb3J0LnNob3VsZFNraXBDb250ZW50U3luY1BhdGgocGF0aCkpIHtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKHBhdGgpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcHJldmlvdXMgPSB0aGlzLnN5bmNJbmRleC5nZXQocGF0aCk7XG4gICAgICBpZiAoIXByZXZpb3VzKSB7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShwYXRoKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlbW90ZSA9IHJlbW90ZUZpbGVzLmdldChwcmV2aW91cy5yZW1vdGVQYXRoKTtcbiAgICAgIGlmICghcmVtb3RlKSB7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZShwYXRoKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRvbWJzdG9uZSA9IGRlbGV0aW9uVG9tYnN0b25lcy5nZXQocGF0aCk7XG4gICAgICBpZiAodG9tYnN0b25lICYmIHRoaXMuc3luY1N1cHBvcnQuaXNUb21ic3RvbmVBdXRob3JpdGF0aXZlKHRvbWJzdG9uZSwgcmVtb3RlKSkge1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgcmVtb3RlRmlsZXMuZGVsZXRlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKHBhdGgpO1xuICAgICAgICBjb3VudHMuZGVsZXRlZFJlbW90ZUZpbGVzICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAodG9tYnN0b25lKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUocGF0aCk7XG4gICAgICAgIGRlbGV0aW9uVG9tYnN0b25lcy5kZWxldGUocGF0aCk7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMuZG93bmxvYWRSZW1vdGVGaWxlVG9WYXVsdChwYXRoLCByZW1vdGUpO1xuICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KHBhdGgsIHtcbiAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlUGF0aDogcmVtb3RlLnJlbW90ZVBhdGgsXG4gICAgICB9KTtcbiAgICAgIGNvdW50cy5yZXN0b3JlZEZyb21SZW1vdGUgKz0gMTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlY29uY2lsZVJlbW90ZU9ubHlGaWxlcyhcbiAgICByZW1vdGVGaWxlczogTWFwPHN0cmluZywgUmVtb3RlRmlsZVN0YXRlPixcbiAgICBkZWxldGlvblRvbWJzdG9uZXM6IE1hcDxzdHJpbmcsIERlbGV0aW9uVG9tYnN0b25lPixcbiAgICBjb3VudHM6IHsgdXBsb2FkZWQ6IG51bWJlcjsgcmVzdG9yZWRGcm9tUmVtb3RlOiBudW1iZXI7IGRvd25sb2FkZWRPclVwZGF0ZWQ6IG51bWJlcjsgc2tpcHBlZDogbnVtYmVyOyBkZWxldGVkUmVtb3RlRmlsZXM6IG51bWJlcjsgZGVsZXRlZExvY2FsRmlsZXM6IG51bWJlcjsgZGVsZXRlZExvY2FsU3R1YnM6IG51bWJlcjsgbWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzOiBudW1iZXI7IHB1cmdlZE1pc3NpbmdMYXp5Tm90ZXM6IG51bWJlciB9LFxuICApIHtcbiAgICBjb25zdCBmaWxlcyA9IHRoaXMuc3luY1N1cHBvcnQuY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCk7XG4gICAgY29uc3QgY3VycmVudFBhdGhzID0gbmV3IFNldChmaWxlcy5tYXAoKGZpbGUpID0+IGZpbGUucGF0aCkpO1xuICAgIGZvciAoY29uc3QgcmVtb3RlIG9mIFsuLi5yZW1vdGVGaWxlcy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5yZW1vdGVQYXRoLmxvY2FsZUNvbXBhcmUoYi5yZW1vdGVQYXRoKSkpIHtcbiAgICAgIGNvbnN0IHZhdWx0UGF0aCA9IHRoaXMuc3luY1N1cHBvcnQucmVtb3RlUGF0aFRvVmF1bHRQYXRoKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgIGlmICghdmF1bHRQYXRoIHx8IGN1cnJlbnRQYXRocy5oYXModmF1bHRQYXRoKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuc3luY1N1cHBvcnQuc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aCh2YXVsdFBhdGgpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5wZW5kaW5nVmF1bHRSZW5hbWVQYXRocy5oYXModmF1bHRQYXRoKSkge1xuICAgICAgICBjb3VudHMuc2tpcHBlZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9tYnN0b25lID0gZGVsZXRpb25Ub21ic3RvbmVzLmdldCh2YXVsdFBhdGgpO1xuICAgICAgaWYgKHRvbWJzdG9uZSkge1xuICAgICAgICBpZiAodGhpcy5zeW5jU3VwcG9ydC5pc1RvbWJzdG9uZUF1dGhvcml0YXRpdmUodG9tYnN0b25lLCByZW1vdGUpKSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgICAgcmVtb3RlRmlsZXMuZGVsZXRlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICBjb3VudHMuZGVsZXRlZFJlbW90ZUZpbGVzICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKHZhdWx0UGF0aCk7XG4gICAgICAgIGRlbGV0aW9uVG9tYnN0b25lcy5kZWxldGUodmF1bHRQYXRoKTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KHZhdWx0UGF0aCwgcmVtb3RlKTtcbiAgICAgIHRoaXMuc3luY0luZGV4LnNldCh2YXVsdFBhdGgsIHtcbiAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgcmVtb3RlUGF0aDogcmVtb3RlLnJlbW90ZVBhdGgsXG4gICAgICB9KTtcbiAgICAgIGNvdW50cy5yZXN0b3JlZEZyb21SZW1vdGUgKz0gMTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHNob3VsZFVwbG9hZExvY2FsV2hlblJlbW90ZUlzTWlzc2luZyhcbiAgICBmaWxlOiBURmlsZSxcbiAgICBwcmV2aW91czogU3luY0luZGV4RW50cnkgfCB1bmRlZmluZWQsXG4gICAgbG9jYWxTaWduYXR1cmU6IHN0cmluZyxcbiAgICByZW1vdGVQYXRoOiBzdHJpbmcsXG4gICkge1xuICAgIGlmIChwcmV2aW91cykge1xuICAgICAgcmV0dXJuIHByZXZpb3VzLnJlbW90ZVBhdGggIT09IHJlbW90ZVBhdGggfHwgcHJldmlvdXMubG9jYWxTaWduYXR1cmUgIT09IGxvY2FsU2lnbmF0dXJlO1xuICAgIH1cblxuICAgIGNvbnN0IGdyYWNlTXMgPSA1MDAwO1xuICAgIHJldHVybiAhdGhpcy5sYXN0VmF1bHRTeW5jQXQgfHwgZmlsZS5zdGF0Lm10aW1lID4gdGhpcy5sYXN0VmF1bHRTeW5jQXQgKyBncmFjZU1zO1xuICB9XG5cbiAgcHJpdmF0ZSBmb3JtYXRDb25mbGljdFRpbWVzdGFtcCgpIHtcbiAgICBjb25zdCB2YWx1ZSA9IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgcGFkID0gKGlucHV0OiBudW1iZXIpID0+IFN0cmluZyhpbnB1dCkucGFkU3RhcnQoMiwgXCIwXCIpO1xuICAgIHJldHVybiBgJHt2YWx1ZS5nZXRGdWxsWWVhcigpfSR7cGFkKHZhbHVlLmdldE1vbnRoKCkgKyAxKX0ke3BhZCh2YWx1ZS5nZXREYXRlKCkpfS0ke3BhZCh2YWx1ZS5nZXRIb3VycygpKX0ke3BhZCh2YWx1ZS5nZXRNaW51dGVzKCkpfSR7cGFkKHZhbHVlLmdldFNlY29uZHMoKSl9YDtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRDb25mbGljdENvcHlQYXRoKG9yaWdpbmFsUGF0aDogc3RyaW5nLCBsYWJlbDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVBhdGgob3JpZ2luYWxQYXRoKTtcbiAgICBjb25zdCBzbGFzaEluZGV4ID0gbm9ybWFsaXplZC5sYXN0SW5kZXhPZihcIi9cIik7XG4gICAgY29uc3QgZGlyID0gc2xhc2hJbmRleCA+PSAwID8gbm9ybWFsaXplZC5zbGljZSgwLCBzbGFzaEluZGV4ICsgMSkgOiBcIlwiO1xuICAgIGNvbnN0IG5hbWUgPSBzbGFzaEluZGV4ID49IDAgPyBub3JtYWxpemVkLnNsaWNlKHNsYXNoSW5kZXggKyAxKSA6IG5vcm1hbGl6ZWQ7XG4gICAgY29uc3QgZG90SW5kZXggPSBuYW1lLmxhc3RJbmRleE9mKFwiLlwiKTtcbiAgICBjb25zdCBzdGVtID0gZG90SW5kZXggPiAwID8gbmFtZS5zbGljZSgwLCBkb3RJbmRleCkgOiBuYW1lO1xuICAgIGNvbnN0IGV4dCA9IGRvdEluZGV4ID4gMCA/IG5hbWUuc2xpY2UoZG90SW5kZXgpIDogXCJcIjtcbiAgICBjb25zdCBzdWZmaXggPSBgLnN5bmMtY29uZmxpY3QtJHt0aGlzLmZvcm1hdENvbmZsaWN0VGltZXN0YW1wKCl9LSR7bGFiZWx9YDtcbiAgICByZXR1cm4gYCR7ZGlyfSR7c3RlbX0ke3N1ZmZpeH0ke2V4dH1gO1xuICB9XG5cbiAgcHJpdmF0ZSBmaW5kRXhpc3RpbmdDb25mbGljdENvcHlQYXRoKG9yaWdpbmFsUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVBhdGgob3JpZ2luYWxQYXRoKTtcbiAgICBjb25zdCBzbGFzaEluZGV4ID0gbm9ybWFsaXplZC5sYXN0SW5kZXhPZihcIi9cIik7XG4gICAgY29uc3QgZGlyID0gc2xhc2hJbmRleCA+PSAwID8gbm9ybWFsaXplZC5zbGljZSgwLCBzbGFzaEluZGV4ICsgMSkgOiBcIlwiO1xuICAgIGNvbnN0IG5hbWUgPSBzbGFzaEluZGV4ID49IDAgPyBub3JtYWxpemVkLnNsaWNlKHNsYXNoSW5kZXggKyAxKSA6IG5vcm1hbGl6ZWQ7XG4gICAgY29uc3QgZG90SW5kZXggPSBuYW1lLmxhc3RJbmRleE9mKFwiLlwiKTtcbiAgICBjb25zdCBzdGVtID0gZG90SW5kZXggPiAwID8gbmFtZS5zbGljZSgwLCBkb3RJbmRleCkgOiBuYW1lO1xuICAgIGNvbnN0IGV4dCA9IGRvdEluZGV4ID4gMCA/IG5hbWUuc2xpY2UoZG90SW5kZXgpIDogXCJcIjtcbiAgICBjb25zdCBwcmVmaXggPSBgJHtkaXJ9JHtzdGVtfS5zeW5jLWNvbmZsaWN0LWA7XG4gICAgcmV0dXJuIHRoaXMuYXBwLnZhdWx0LmdldEZpbGVzKClcbiAgICAgIC5tYXAoKGZpbGUpID0+IGZpbGUucGF0aClcbiAgICAgIC5maW5kKChwYXRoKSA9PiBwYXRoLnN0YXJ0c1dpdGgocHJlZml4KSAmJiAoIWV4dCB8fCBwYXRoLmVuZHNXaXRoKGV4dCkpKSA/PyBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjcmVhdGVMb2NhbENvbmZsaWN0Q29weShmaWxlOiBURmlsZSwgbWFya2Rvd25Db250ZW50OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBsYWJlbDogc3RyaW5nKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmZpbmRFeGlzdGluZ0NvbmZsaWN0Q29weVBhdGgoZmlsZS5wYXRoKTtcbiAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgIHJldHVybiBleGlzdGluZztcbiAgICB9XG5cbiAgICBsZXQgdGFyZ2V0UGF0aCA9IHRoaXMuYnVpbGRDb25mbGljdENvcHlQYXRoKGZpbGUucGF0aCwgbGFiZWwpO1xuICAgIGxldCBhdHRlbXB0ID0gMTtcbiAgICB3aGlsZSAodGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHRhcmdldFBhdGgpKSB7XG4gICAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGF0aCh0YXJnZXRQYXRoKTtcbiAgICAgIGNvbnN0IGRvdEluZGV4ID0gbm9ybWFsaXplZC5sYXN0SW5kZXhPZihcIi5cIik7XG4gICAgICB0YXJnZXRQYXRoID0gZG90SW5kZXggPiAwXG4gICAgICAgID8gYCR7bm9ybWFsaXplZC5zbGljZSgwLCBkb3RJbmRleCl9LSR7YXR0ZW1wdH0ke25vcm1hbGl6ZWQuc2xpY2UoZG90SW5kZXgpfWBcbiAgICAgICAgOiBgJHtub3JtYWxpemVkfS0ke2F0dGVtcHR9YDtcbiAgICAgIGF0dGVtcHQgKz0gMTtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLmVuc3VyZUxvY2FsUGFyZW50Rm9sZGVycyh0YXJnZXRQYXRoKTtcbiAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKHRhcmdldFBhdGgsIG1hcmtkb3duQ29udGVudCA/PyBhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVCaW5hcnkodGFyZ2V0UGF0aCwgYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZEJpbmFyeShmaWxlKSk7XG4gICAgfVxuXG4gICAgdGhpcy5tYXJrUGVuZGluZ1ZhdWx0U3luYyh0YXJnZXRQYXRoKTtcbiAgICByZXR1cm4gdGFyZ2V0UGF0aDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVjb25jaWxlTG9jYWxGaWxlcyhcbiAgICByZW1vdGVGaWxlczogTWFwPHN0cmluZywgUmVtb3RlRmlsZVN0YXRlPixcbiAgICBkZWxldGlvblRvbWJzdG9uZXM6IE1hcDxzdHJpbmcsIERlbGV0aW9uVG9tYnN0b25lPixcbiAgICBjb3VudHM6IHsgdXBsb2FkZWQ6IG51bWJlcjsgcmVzdG9yZWRGcm9tUmVtb3RlOiBudW1iZXI7IGRvd25sb2FkZWRPclVwZGF0ZWQ6IG51bWJlcjsgc2tpcHBlZDogbnVtYmVyOyBkZWxldGVkUmVtb3RlRmlsZXM6IG51bWJlcjsgZGVsZXRlZExvY2FsRmlsZXM6IG51bWJlcjsgZGVsZXRlZExvY2FsU3R1YnM6IG51bWJlcjsgbWlzc2luZ1JlbW90ZUJhY2tlZE5vdGVzOiBudW1iZXI7IHB1cmdlZE1pc3NpbmdMYXp5Tm90ZXM6IG51bWJlciB9LFxuICApOiBQcm9taXNlPFNldDxzdHJpbmc+PiB7XG4gICAgY29uc3QgZmlsZXMgPSB0aGlzLnN5bmNTdXBwb3J0LmNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpO1xuICAgIGNvbnN0IGxvY2FsUmVtb3RlUGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuICAgICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRWYXVsdFN5bmNSZW1vdGVQYXRoKGZpbGUucGF0aCk7XG4gICAgICBsb2NhbFJlbW90ZVBhdGhzLmFkZChyZW1vdGVQYXRoKTtcbiAgICAgIGNvbnN0IHJlbW90ZSA9IHJlbW90ZUZpbGVzLmdldChyZW1vdGVQYXRoKTtcbiAgICAgIGNvbnN0IHJlbW90ZVNpZ25hdHVyZSA9IHJlbW90ZT8uc2lnbmF0dXJlID8/IFwiXCI7XG4gICAgICBjb25zdCBwcmV2aW91cyA9IHRoaXMuc3luY0luZGV4LmdldChmaWxlLnBhdGgpO1xuICAgICAgY29uc3QgbWFya2Rvd25Db250ZW50ID0gZmlsZS5leHRlbnNpb24gPT09IFwibWRcIiA/IGF3YWl0IHRoaXMucmVhZE1hcmtkb3duQ29udGVudFByZWZlckVkaXRvcihmaWxlKSA6IG51bGw7XG4gICAgICBjb25zdCBsb2NhbFNpZ25hdHVyZSA9IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUoZmlsZSwgbWFya2Rvd25Db250ZW50ID8/IHVuZGVmaW5lZCk7XG5cbiAgICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICAgIGNvbnN0IHN0dWIgPSB0aGlzLnBhcnNlTm90ZVN0dWIobWFya2Rvd25Db250ZW50ID8/IFwiXCIpO1xuICAgICAgICBpZiAoc3R1Yikge1xuICAgICAgICAgIGNvbnN0IHN0dWJSZW1vdGUgPSByZW1vdGVGaWxlcy5nZXQoc3R1Yi5yZW1vdGVQYXRoKTtcbiAgICAgICAgICBjb25zdCB0b21ic3RvbmUgPSBkZWxldGlvblRvbWJzdG9uZXMuZ2V0KGZpbGUucGF0aCk7XG4gICAgICAgICAgY29uc3QgcmVzb2x1dGlvbiA9IGF3YWl0IHRoaXMucmVzb2x2ZUxhenlOb3RlU3R1YihmaWxlLCBzdHViLCBzdHViUmVtb3RlLCB0b21ic3RvbmUpO1xuICAgICAgICAgIGlmIChyZXNvbHV0aW9uLmFjdGlvbiA9PT0gXCJkZWxldGVkXCIpIHtcbiAgICAgICAgICAgIGNvdW50cy5kZWxldGVkTG9jYWxGaWxlcyArPSAxO1xuICAgICAgICAgICAgY291bnRzLmRlbGV0ZWRMb2NhbFN0dWJzICs9IDE7XG4gICAgICAgICAgICBpZiAocmVzb2x1dGlvbi5wdXJnZWRNaXNzaW5nKSB7XG4gICAgICAgICAgICAgIGNvdW50cy5wdXJnZWRNaXNzaW5nTGF6eU5vdGVzICs9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHJlc29sdXRpb24uYWN0aW9uID09PSBcIm1pc3NpbmdcIikge1xuICAgICAgICAgICAgY291bnRzLm1pc3NpbmdSZW1vdGVCYWNrZWROb3RlcyArPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogc3R1YlJlbW90ZT8uc2lnbmF0dXJlID8/IHByZXZpb3VzPy5yZW1vdGVTaWduYXR1cmUgPz8gXCJcIixcbiAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCB0b21ic3RvbmUgPSBkZWxldGlvblRvbWJzdG9uZXMuZ2V0KGZpbGUucGF0aCk7XG4gICAgICBjb25zdCB1bmNoYW5nZWRTaW5jZUxhc3RTeW5jID0gcHJldmlvdXM/LnJlbW90ZVBhdGggPT09IHJlbW90ZVBhdGggJiYgcHJldmlvdXMubG9jYWxTaWduYXR1cmUgPT09IGxvY2FsU2lnbmF0dXJlO1xuICAgICAgaWYgKHRvbWJzdG9uZSkge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdW5jaGFuZ2VkU2luY2VMYXN0U3luYyAmJlxuICAgICAgICAgIHRoaXMuc3luY1N1cHBvcnQuc2hvdWxkRGVsZXRlTG9jYWxGcm9tVG9tYnN0b25lKGZpbGUsIHRvbWJzdG9uZSkgJiZcbiAgICAgICAgICB0aGlzLnN5bmNTdXBwb3J0LmlzVG9tYnN0b25lQXV0aG9yaXRhdGl2ZSh0b21ic3RvbmUsIHJlbW90ZSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5yZW1vdmVMb2NhbFZhdWx0RmlsZShmaWxlKTtcbiAgICAgICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgICAgICBjb3VudHMuZGVsZXRlZExvY2FsRmlsZXMgKz0gMTtcbiAgICAgICAgICBpZiAocmVtb3RlKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZS5yZW1vdGVQYXRoKTtcbiAgICAgICAgICAgIHJlbW90ZUZpbGVzLmRlbGV0ZShyZW1vdGUucmVtb3RlUGF0aCk7XG4gICAgICAgICAgICBjb3VudHMuZGVsZXRlZFJlbW90ZUZpbGVzICs9IDE7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFwcmV2aW91cyB8fCB0aGlzLnN5bmNTdXBwb3J0LnNob3VsZERlbGV0ZUxvY2FsRnJvbVRvbWJzdG9uZShmaWxlLCB0b21ic3RvbmUpKSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5jcmVhdGVMb2NhbENvbmZsaWN0Q29weShmaWxlLCBtYXJrZG93bkNvbnRlbnQsIFwibG9jYWxcIik7XG4gICAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgZGVsZXRpb25Ub21ic3RvbmVzLmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXJlbW90ZSAmJiAhdGhpcy5zaG91bGRVcGxvYWRMb2NhbFdoZW5SZW1vdGVJc01pc3NpbmcoZmlsZSwgcHJldmlvdXMsIGxvY2FsU2lnbmF0dXJlLCByZW1vdGVQYXRoKSkge1xuICAgICAgICBjb3VudHMuc2tpcHBlZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgICAgY29uc3QgdXBsb2FkZWRSZW1vdGUgPSBhd2FpdCB0aGlzLnVwbG9hZENvbnRlbnRGaWxlVG9SZW1vdGUoZmlsZSwgcmVtb3RlUGF0aCwgbWFya2Rvd25Db250ZW50ID8/IHVuZGVmaW5lZCk7XG4gICAgICAgIHRoaXMuc3luY0luZGV4LnNldChmaWxlLnBhdGgsIHtcbiAgICAgICAgICBsb2NhbFNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHVwbG9hZGVkUmVtb3RlLnNpZ25hdHVyZSxcbiAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICB9KTtcbiAgICAgICAgcmVtb3RlRmlsZXMuc2V0KHJlbW90ZVBhdGgsIHVwbG9hZGVkUmVtb3RlKTtcbiAgICAgICAgY291bnRzLnVwbG9hZGVkICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXByZXZpb3VzKSB7XG4gICAgICAgIGlmIChsb2NhbFNpZ25hdHVyZSA9PT0gcmVtb3RlU2lnbmF0dXJlKSB7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwgeyBsb2NhbFNpZ25hdHVyZSwgcmVtb3RlU2lnbmF0dXJlLCByZW1vdGVQYXRoIH0pO1xuICAgICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgICBjb3VudHMuc2tpcHBlZCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuc3luY1N1cHBvcnQuc2hvdWxkRG93bmxvYWRSZW1vdGVWZXJzaW9uKGZpbGUuc3RhdC5tdGltZSwgcmVtb3RlLmxhc3RNb2RpZmllZCkpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgICAgICAgIGNvbnN0IHJlZnJlc2hlZCA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKGZpbGUucGF0aCk7XG4gICAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IGF3YWl0IHRoaXMuYnVpbGRDdXJyZW50TG9jYWxTaWduYXR1cmUocmVmcmVzaGVkKSA6IHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZSxcbiAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgY291bnRzLmRvd25sb2FkZWRPclVwZGF0ZWQgKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHVwbG9hZGVkUmVtb3RlID0gYXdhaXQgdGhpcy51cGxvYWRDb250ZW50RmlsZVRvUmVtb3RlKGZpbGUsIHJlbW90ZVBhdGgsIG1hcmtkb3duQ29udGVudCA/PyB1bmRlZmluZWQpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgbG9jYWxTaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlU2lnbmF0dXJlOiB1cGxvYWRlZFJlbW90ZS5zaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlbW90ZUZpbGVzLnNldChyZW1vdGVQYXRoLCB1cGxvYWRlZFJlbW90ZSk7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUoZmlsZS5wYXRoKTtcbiAgICAgICAgY291bnRzLnVwbG9hZGVkICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBsb2NhbENoYW5nZWQgPSBwcmV2aW91cy5sb2NhbFNpZ25hdHVyZSAhPT0gbG9jYWxTaWduYXR1cmUgfHwgcHJldmlvdXMucmVtb3RlUGF0aCAhPT0gcmVtb3RlUGF0aDtcbiAgICAgIGNvbnN0IHJlbW90ZUNoYW5nZWQgPSBwcmV2aW91cy5yZW1vdGVTaWduYXR1cmUgIT09IHJlbW90ZVNpZ25hdHVyZSB8fCBwcmV2aW91cy5yZW1vdGVQYXRoICE9PSByZW1vdGVQYXRoO1xuICAgICAgaWYgKCFsb2NhbENoYW5nZWQgJiYgIXJlbW90ZUNoYW5nZWQpIHtcbiAgICAgICAgY291bnRzLnNraXBwZWQgKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghbG9jYWxDaGFuZ2VkICYmIHJlbW90ZUNoYW5nZWQpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5kb3dubG9hZFJlbW90ZUZpbGVUb1ZhdWx0KGZpbGUucGF0aCwgcmVtb3RlLCBmaWxlKTtcbiAgICAgICAgY29uc3QgcmVmcmVzaGVkID0gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgoZmlsZS5wYXRoKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlOiByZWZyZXNoZWQgPyBhd2FpdCB0aGlzLmJ1aWxkQ3VycmVudExvY2FsU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiByZW1vdGVTaWduYXR1cmUsXG4gICAgICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICBjb3VudHMuZG93bmxvYWRlZE9yVXBkYXRlZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGxvY2FsQ2hhbmdlZCAmJiAhcmVtb3RlQ2hhbmdlZCkge1xuICAgICAgICBjb25zdCB1cGxvYWRlZFJlbW90ZSA9IGF3YWl0IHRoaXMudXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlLCByZW1vdGVQYXRoLCBtYXJrZG93bkNvbnRlbnQgPz8gdW5kZWZpbmVkKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgICAgIGxvY2FsU2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVNpZ25hdHVyZTogdXBsb2FkZWRSZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICByZW1vdGVGaWxlcy5zZXQocmVtb3RlUGF0aCwgdXBsb2FkZWRSZW1vdGUpO1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZURlbGV0aW9uVG9tYnN0b25lKGZpbGUucGF0aCk7XG4gICAgICAgIGNvdW50cy51cGxvYWRlZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5jcmVhdGVMb2NhbENvbmZsaWN0Q29weShmaWxlLCBtYXJrZG93bkNvbnRlbnQsIFwibG9jYWxcIik7XG4gICAgICBjb3VudHMuc2tpcHBlZCArPSAxO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGxvY2FsUmVtb3RlUGF0aHM7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSA0MDQgJiYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYERFTEVURSBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZGVsZXRlIHJlbW90ZSBzeW5jZWQgY29udGVudFwiLCByZW1vdGVQYXRoLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHdyaXRlRGVsZXRpb25Ub21ic3RvbmUodmF1bHRQYXRoOiBzdHJpbmcsIHJlbW90ZVNpZ25hdHVyZT86IHN0cmluZykge1xuICAgIGNvbnN0IHBheWxvYWQ6IERlbGV0aW9uVG9tYnN0b25lID0ge1xuICAgICAgcGF0aDogdmF1bHRQYXRoLFxuICAgICAgZGVsZXRlZEF0OiBEYXRlLm5vdygpLFxuICAgICAgcmVtb3RlU2lnbmF0dXJlLFxuICAgIH07XG4gICAgYXdhaXQgdGhpcy51cGxvYWRCaW5hcnkoXG4gICAgICB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkRGVsZXRpb25SZW1vdGVQYXRoKHZhdWx0UGF0aCksXG4gICAgICB0aGlzLmVuY29kZVV0ZjgoSlNPTi5zdHJpbmdpZnkocGF5bG9hZCkpLFxuICAgICAgXCJhcHBsaWNhdGlvbi9qc29uOyBjaGFyc2V0PXV0Zi04XCIsXG4gICAgKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZGVsZXRlRGVsZXRpb25Ub21ic3RvbmUodmF1bHRQYXRoOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVDb250ZW50RmlsZSh0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkRGVsZXRpb25SZW1vdGVQYXRoKHZhdWx0UGF0aCkpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gVG9tYnN0b25lIGNsZWFudXAgc2hvdWxkIG5vdCBicmVhayB0aGUgbWFpbiBzeW5jIGZsb3cuXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWFkRGVsZXRpb25Ub21ic3RvbmUodmF1bHRQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwodGhpcy5zeW5jU3VwcG9ydC5idWlsZERlbGV0aW9uUmVtb3RlUGF0aCh2YXVsdFBhdGgpKSxcbiAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MDQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICB0aGlzLmFzc2VydFJlc3BvbnNlU3VjY2VzcyhyZXNwb25zZSwgXCJHRVQgdG9tYnN0b25lXCIpO1xuXG4gICAgcmV0dXJuIHRoaXMuc3luY1N1cHBvcnQucGFyc2VEZWxldGlvblRvbWJzdG9uZVBheWxvYWQodGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlYWREZWxldGlvblRvbWJzdG9uZXMoKSB7XG4gICAgY29uc3QgdG9tYnN0b25lcyA9IG5ldyBNYXA8c3RyaW5nLCBEZWxldGlvblRvbWJzdG9uZT4oKTtcbiAgICBjb25zdCBpbnZlbnRvcnkgPSBhd2FpdCB0aGlzLmxpc3RSZW1vdGVUcmVlKHRoaXMuc3luY1N1cHBvcnQuYnVpbGREZWxldGlvbkZvbGRlcigpKTtcbiAgICBmb3IgKGNvbnN0IHJlbW90ZSBvZiBpbnZlbnRvcnkuZmlsZXMudmFsdWVzKCkpIHtcbiAgICAgIGNvbnN0IHZhdWx0UGF0aCA9IHRoaXMuc3luY1N1cHBvcnQucmVtb3RlRGVsZXRpb25QYXRoVG9WYXVsdFBhdGgocmVtb3RlLnJlbW90ZVBhdGgpO1xuICAgICAgaWYgKCF2YXVsdFBhdGgpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZS5yZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB0b21ic3RvbmUgPSB0aGlzLnN5bmNTdXBwb3J0LnBhcnNlRGVsZXRpb25Ub21ic3RvbmVQYXlsb2FkKHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlcikpO1xuICAgICAgaWYgKHRvbWJzdG9uZSkge1xuICAgICAgICB0b21ic3RvbmVzLnNldCh2YXVsdFBhdGgsIHRvbWJzdG9uZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRvbWJzdG9uZXM7XG4gIH1cblxuICBwcml2YXRlIGdldFZhdWx0RmlsZUJ5UGF0aChwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHBhdGgpO1xuICAgIHJldHVybiBmaWxlIGluc3RhbmNlb2YgVEZpbGUgPyBmaWxlIDogbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVtb3ZlTG9jYWxWYXVsdEZpbGUoZmlsZTogVEZpbGUpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuZGVsZXRlKGZpbGUsIHRydWUpO1xuICAgIH0gY2F0Y2ggKGRlbGV0ZUVycm9yKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC50cmFzaChmaWxlLCB0cnVlKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICB0aHJvdyBkZWxldGVFcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGVuc3VyZUxvY2FsUGFyZW50Rm9sZGVycyhwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGF0aChwYXRoKTtcbiAgICBjb25zdCBzZWdtZW50cyA9IG5vcm1hbGl6ZWQuc3BsaXQoXCIvXCIpLmZpbHRlcigodmFsdWUpID0+IHZhbHVlLmxlbmd0aCA+IDApO1xuICAgIGlmIChzZWdtZW50cy5sZW5ndGggPD0gMSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBjdXJyZW50ID0gXCJcIjtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgc2VnbWVudHMubGVuZ3RoIC0gMTsgaW5kZXggKz0gMSkge1xuICAgICAgY3VycmVudCA9IGN1cnJlbnQgPyBgJHtjdXJyZW50fS8ke3NlZ21lbnRzW2luZGV4XX1gIDogc2VnbWVudHNbaW5kZXhdO1xuICAgICAgaWYgKCEoYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5leGlzdHMoY3VycmVudCkpKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5ta2RpcihjdXJyZW50KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGNvbnN0IG1zZyA9IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKTtcbiAgICAgICAgICBpZiAoIW1zZy5pbmNsdWRlcyhcImFscmVhZHkgZXhpc3RzXCIpKSB7XG4gICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZG93bmxvYWRSZW1vdGVGaWxlVG9WYXVsdCh2YXVsdFBhdGg6IHN0cmluZywgcmVtb3RlOiBSZW1vdGVGaWxlU3RhdGUsIGV4aXN0aW5nRmlsZT86IFRGaWxlKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZS5yZW1vdGVQYXRoKSxcbiAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgdGhpcy5hc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2UsIFwiR0VUXCIpO1xuXG4gICAgYXdhaXQgdGhpcy5lbnN1cmVMb2NhbFBhcmVudEZvbGRlcnModmF1bHRQYXRoKTtcbiAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgbXRpbWU6IHJlbW90ZS5sYXN0TW9kaWZpZWQgPiAwID8gcmVtb3RlLmxhc3RNb2RpZmllZCA6IERhdGUubm93KCksXG4gICAgfTtcbiAgICBjb25zdCBpc01kID0gdmF1bHRQYXRoLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoXCIubWRcIik7XG4gICAgY29uc3QgY3VycmVudCA9XG4gICAgICBleGlzdGluZ0ZpbGUgPz8gdGhpcy5nZXRWYXVsdEZpbGVCeVBhdGgodmF1bHRQYXRoKSA/PyB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgodmF1bHRQYXRoKTtcbiAgICBpZiAoY3VycmVudCAmJiBjdXJyZW50IGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgIGlmIChjdXJyZW50LmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShjdXJyZW50LCB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpLCBvcHRpb25zKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeUJpbmFyeShjdXJyZW50LCByZXNwb25zZS5hcnJheUJ1ZmZlciwgb3B0aW9ucyk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBpZiAoaXNNZCkge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGUodmF1bHRQYXRoLCB0aGlzLmRlY29kZVV0ZjgocmVzcG9uc2UuYXJyYXlCdWZmZXIpLCBvcHRpb25zKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZUJpbmFyeSh2YXVsdFBhdGgsIHJlc3BvbnNlLmFycmF5QnVmZmVyLCBvcHRpb25zKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zdCBtc2cgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSk7XG4gICAgICBpZiAobXNnLmluY2x1ZGVzKFwiYWxyZWFkeSBleGlzdHNcIikpIHtcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aCh2YXVsdFBhdGgpO1xuICAgICAgICBpZiAoZmlsZSAmJiBmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgICAgICBpZiAoZmlsZS5leHRlbnNpb24gPT09IFwibWRcIikge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlciksIG9wdGlvbnMpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnlCaW5hcnkoZmlsZSwgcmVzcG9uc2UuYXJyYXlCdWZmZXIsIG9wdGlvbnMpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB2ZXJpZnlSZW1vdGVCaW5hcnlSb3VuZFRyaXAocmVtb3RlUGF0aDogc3RyaW5nLCBleHBlY3RlZDogQXJyYXlCdWZmZXIpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuYXJyYXlCdWZmZXJzRXF1YWwoZXhwZWN0ZWQsIHJlc3BvbnNlLmFycmF5QnVmZmVyKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc3RhdFJlbW90ZUZpbGUocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgbWV0aG9kOiBcIlBST1BGSU5EXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIERlcHRoOiBcIjBcIixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MDQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICB0aGlzLmFzc2VydFJlc3BvbnNlU3VjY2VzcyhyZXNwb25zZSwgYFBST1BGSU5EIGZvciAke3JlbW90ZVBhdGh9YCk7XG5cbiAgICBjb25zdCB4bWxUZXh0ID0gdGhpcy5kZWNvZGVVdGY4KHJlc3BvbnNlLmFycmF5QnVmZmVyKTtcbiAgICBjb25zdCBlbnRyaWVzID0gdGhpcy5wYXJzZVByb3BmaW5kRGlyZWN0b3J5TGlzdGluZyh4bWxUZXh0LCByZW1vdGVQYXRoLCB0cnVlKTtcbiAgICByZXR1cm4gZW50cmllcy5maW5kKChlbnRyeSkgPT4gIWVudHJ5LmlzQ29sbGVjdGlvbik/LmZpbGUgPz8gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkQ29udGVudEZpbGVUb1JlbW90ZShmaWxlOiBURmlsZSwgcmVtb3RlUGF0aDogc3RyaW5nLCBtYXJrZG93bkNvbnRlbnQ/OiBzdHJpbmcpIHtcbiAgICBsZXQgYmluYXJ5OiBBcnJheUJ1ZmZlcjtcblxuICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB7XG4gICAgICBjb25zdCBjb250ZW50ID0gbWFya2Rvd25Db250ZW50ID8/IChhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSkpO1xuICAgICAgaWYgKHRoaXMucGFyc2VOb3RlU3R1Yihjb250ZW50KSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgXCJcdTYyRDJcdTdFRERcdTYyOEFcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTUzNjBcdTRGNERcdTdCMTRcdThCQjBcdTRFMEFcdTRGMjBcdTRFM0FcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTMwMDJcIixcbiAgICAgICAgICAgIFwiUmVmdXNpbmcgdG8gdXBsb2FkIGEgbGF6eS1ub3RlIHBsYWNlaG9sZGVyIGFzIHJlbW90ZSBub3RlIGNvbnRlbnQuXCIsXG4gICAgICAgICAgKSxcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgYmluYXJ5ID0gdGhpcy5lbmNvZGVVdGY4KGNvbnRlbnQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBiaW5hcnkgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMudXBsb2FkQmluYXJ5KHJlbW90ZVBhdGgsIGJpbmFyeSwgdGhpcy5nZXRNaW1lVHlwZShmaWxlLmV4dGVuc2lvbikpO1xuICAgIGxldCByZW1vdGU6IFJlbW90ZUZpbGVTdGF0ZSB8IG51bGwgPSBudWxsO1xuICAgIHRyeSB7XG4gICAgICByZW1vdGUgPSBhd2FpdCB0aGlzLnN0YXRSZW1vdGVGaWxlKHJlbW90ZVBhdGgpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmVtb3RlID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKHJlbW90ZSkge1xuICAgICAgcmV0dXJuIHJlbW90ZTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIGxhc3RNb2RpZmllZDogZmlsZS5zdGF0Lm10aW1lLFxuICAgICAgc2l6ZTogZmlsZS5zdGF0LnNpemUsXG4gICAgICBzaWduYXR1cmU6IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRTeW5jU2lnbmF0dXJlKGZpbGUpLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZVJlbW90ZVN5bmNlZEVudHJ5KHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLnN5bmNJbmRleC5nZXQodmF1bHRQYXRoKTtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gZXhpc3Rpbmc/LnJlbW90ZVBhdGggPz8gdGhpcy5zeW5jU3VwcG9ydC5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgodmF1bHRQYXRoKTtcbiAgICBhd2FpdCB0aGlzLmRlbGV0ZVJlbW90ZUNvbnRlbnRGaWxlKHJlbW90ZVBhdGgpO1xuICAgIHRoaXMuc3luY0luZGV4LmRlbGV0ZSh2YXVsdFBhdGgpO1xuICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZUZpbGVPcGVuKGZpbGU6IFRGaWxlIHwgbnVsbCkge1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkgfHwgZmlsZS5leHRlbnNpb24gIT09IFwibWRcIikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMuc2V0KGZpbGUucGF0aCwgRGF0ZS5ub3coKSk7XG4gICAgYXdhaXQgdGhpcy5zYXZlUGx1Z2luU3RhdGUoKTtcblxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IHN0dWIgPSB0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCk7XG4gICAgaWYgKCFzdHViKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuc3RhdFJlbW90ZUZpbGUoc3R1Yi5yZW1vdGVQYXRoKTtcbiAgICAgIGNvbnN0IHRvbWJzdG9uZSA9ICFyZW1vdGUgPyBhd2FpdCB0aGlzLnJlYWREZWxldGlvblRvbWJzdG9uZShmaWxlLnBhdGgpIDogdW5kZWZpbmVkO1xuICAgICAgY29uc3QgcmVzb2x1dGlvbiA9IGF3YWl0IHRoaXMucmVzb2x2ZUxhenlOb3RlU3R1YihmaWxlLCBzdHViLCByZW1vdGUsIHRvbWJzdG9uZSk7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuXG4gICAgICBpZiAocmVzb2x1dGlvbi5hY3Rpb24gPT09IFwiZGVsZXRlZFwiKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgcmVzb2x1dGlvbi5wdXJnZWRNaXNzaW5nXG4gICAgICAgICAgICAgID8gYFx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1OEZERVx1N0VFRFx1N0YzQVx1NTkzMVx1RkYwQ1x1NURGMlx1NzlGQlx1OTY2NFx1NjcyQ1x1NTczMFx1NTkzMVx1NjU0OFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gXG4gICAgICAgICAgICAgIDogYFx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1NEUwRFx1NUI1OFx1NTcyOFx1RkYwQ1x1NURGMlx1NzlGQlx1OTY2NFx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gLFxuICAgICAgICAgICAgcmVzb2x1dGlvbi5wdXJnZWRNaXNzaW5nXG4gICAgICAgICAgICAgID8gYFJlbW90ZSBub3RlIHdhcyBtaXNzaW5nIHJlcGVhdGVkbHksIHJlbW92ZWQgbG9jYWwgYnJva2VuIHBsYWNlaG9sZGVyOiAke2ZpbGUuYmFzZW5hbWV9YFxuICAgICAgICAgICAgICA6IGBSZW1vdGUgbm90ZSBtaXNzaW5nLCByZW1vdmVkIGxvY2FsIHBsYWNlaG9sZGVyOiAke2ZpbGUuYmFzZW5hbWV9YCxcbiAgICAgICAgICApLFxuICAgICAgICAgIHJlc29sdXRpb24ucHVyZ2VkTWlzc2luZyA/IDgwMDAgOiA2MDAwLFxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXNvbHV0aW9uLmFjdGlvbiA9PT0gXCJtaXNzaW5nXCIpIHtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLnQoXCJcdThGRENcdTdBRUZcdTZCNjNcdTY1ODdcdTRFMERcdTVCNThcdTU3MjhcdUZGMENcdTVGNTNcdTUyNERcdTUxNDhcdTRGRERcdTc1NTlcdTY3MkNcdTU3MzBcdTUzNjBcdTRGNERcdTdCMTRcdThCQjBcdTRFRTVcdTk2MzJcdTRFMzRcdTY1RjZcdTVGMDJcdTVFMzhcdUZGMUJcdTgyRTVcdTUxOERcdTZCMjFcdTc4NkVcdThCQTRcdTdGM0FcdTU5MzFcdUZGMENcdTVDMDZcdTgxRUFcdTUyQThcdTZFMDVcdTc0MDZcdThCRTVcdTUzNjBcdTRGNERcdTMwMDJcIiwgXCJSZW1vdGUgbm90ZSBpcyBtaXNzaW5nLiBUaGUgbG9jYWwgcGxhY2Vob2xkZXIgd2FzIGtlcHQgZm9yIG5vdyBpbiBjYXNlIHRoaXMgaXMgdHJhbnNpZW50OyBpdCB3aWxsIGJlIGNsZWFuZWQgYXV0b21hdGljYWxseSBpZiB0aGUgcmVtb3RlIGlzIHN0aWxsIG1pc3Npbmcgb24gdGhlIG5leHQgY29uZmlybWF0aW9uLlwiKSwgODAwMCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbmV3IE5vdGljZSh0aGlzLnQoYFx1NURGMlx1NEVDRVx1OEZEQ1x1N0FFRlx1NjA2Mlx1NTkwRFx1N0IxNFx1OEJCMFx1RkYxQSR7ZmlsZS5iYXNlbmFtZX1gLCBgUmVzdG9yZWQgbm90ZSBmcm9tIHJlbW90ZTogJHtmaWxlLmJhc2VuYW1lfWApLCA2MDAwKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBoeWRyYXRlIG5vdGUgZnJvbSByZW1vdGVcIiwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiXHU4RkRDXHU3QUVGXHU2MDYyXHU1OTBEXHU3QjE0XHU4QkIwXHU1OTMxXHU4RDI1XCIsIFwiRmFpbGVkIHRvIHJlc3RvcmUgbm90ZSBmcm9tIHJlbW90ZVwiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGdldE9wZW5NYXJrZG93bkNvbnRlbnQobm90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IGxlYXZlcyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoXCJtYXJrZG93blwiKTtcbiAgICBmb3IgKGNvbnN0IGxlYWYgb2YgbGVhdmVzKSB7XG4gICAgICBjb25zdCB2aWV3ID0gbGVhZi52aWV3O1xuICAgICAgaWYgKCEodmlldyBpbnN0YW5jZW9mIE1hcmtkb3duVmlldykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghdmlldy5maWxlIHx8IHZpZXcuZmlsZS5wYXRoICE9PSBub3RlUGF0aCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHZpZXcuZWRpdG9yLmdldFZhbHVlKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZTogVEZpbGUpIHtcbiAgICBjb25zdCBsaXZlQ29udGVudCA9IHRoaXMuZ2V0T3Blbk1hcmtkb3duQ29udGVudChmaWxlLnBhdGgpO1xuICAgIGlmIChsaXZlQ29udGVudCAhPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGxpdmVDb250ZW50O1xuICAgIH1cblxuICAgIHJldHVybiBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBidWlsZEN1cnJlbnRMb2NhbFNpZ25hdHVyZShmaWxlOiBURmlsZSwgbWFya2Rvd25Db250ZW50Pzogc3RyaW5nKSB7XG4gICAgaWYgKGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHtcbiAgICAgIHJldHVybiB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkU3luY1NpZ25hdHVyZShmaWxlKTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50ID0gbWFya2Rvd25Db250ZW50ID8/IChhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkNvbnRlbnRQcmVmZXJFZGl0b3IoZmlsZSkpO1xuICAgIGNvbnN0IGRpZ2VzdCA9IChhd2FpdCB0aGlzLmNvbXB1dGVTaGEyNTZIZXgodGhpcy5lbmNvZGVVdGY4KGNvbnRlbnQpKSkuc2xpY2UoMCwgMTYpO1xuICAgIHJldHVybiBgbWQ6JHtjb250ZW50Lmxlbmd0aH06JHtkaWdlc3R9YDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVjb25jaWxlUmVtb3RlSW1hZ2VzKCkge1xuICAgIHJldHVybiB7IGRlbGV0ZWRGaWxlczogMCwgZGVsZXRlZERpcmVjdG9yaWVzOiAwIH07XG4gIH1cblxuICBwcml2YXRlIG1hcmtNaXNzaW5nTGF6eVJlbW90ZShwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgIGNvbnN0IHByZXZpb3VzID0gdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzLmdldChwYXRoKTtcbiAgICBjb25zdCBuZXh0OiBNaXNzaW5nTGF6eVJlbW90ZVJlY29yZCA9IHByZXZpb3VzXG4gICAgICA/IHtcbiAgICAgICAgICBmaXJzdERldGVjdGVkQXQ6IHByZXZpb3VzLmZpcnN0RGV0ZWN0ZWRBdCxcbiAgICAgICAgICBsYXN0RGV0ZWN0ZWRBdDogbm93LFxuICAgICAgICAgIG1pc3NDb3VudDogcHJldmlvdXMubWlzc0NvdW50ICsgMSxcbiAgICAgICAgfVxuICAgICAgOiB7XG4gICAgICAgICAgZmlyc3REZXRlY3RlZEF0OiBub3csXG4gICAgICAgICAgbGFzdERldGVjdGVkQXQ6IG5vdyxcbiAgICAgICAgICBtaXNzQ291bnQ6IDEsXG4gICAgICAgIH07XG4gICAgdGhpcy5taXNzaW5nTGF6eVJlbW90ZU5vdGVzLnNldChwYXRoLCBuZXh0KTtcbiAgICByZXR1cm4gbmV4dDtcbiAgfVxuXG4gIHByaXZhdGUgY2xlYXJNaXNzaW5nTGF6eVJlbW90ZShwYXRoOiBzdHJpbmcpIHtcbiAgICB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlTm90ZXMuZGVsZXRlKHBhdGgpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNoYXJlZCBsb2dpYyBmb3IgcmVzb2x2aW5nIGEgbGF6eS1ub3RlIHN0dWIgaW4gYm90aCBoYW5kbGVGaWxlT3BlbiBhbmRcbiAgICogc3luY0NvbmZpZ3VyZWRWYXVsdENvbnRlbnQuICBDYWxsZXJzIHByb3ZpZGUgdGhlIGFscmVhZHktbG9va2VkLXVwIHJlbW90ZVxuICAgKiBzdGF0ZSAob3IgbnVsbCkgYW5kIGFuIG9wdGlvbmFsIHRvbWJzdG9uZS5cbiAgICovXG4gIHByaXZhdGUgYXN5bmMgcmVzb2x2ZUxhenlOb3RlU3R1YihcbiAgICBmaWxlOiBURmlsZSxcbiAgICBzdHViOiB7IHJlbW90ZVBhdGg6IHN0cmluZyB9LFxuICAgIHJlbW90ZTogUmVtb3RlRmlsZVN0YXRlIHwgbnVsbCB8IHVuZGVmaW5lZCxcbiAgICB0b21ic3RvbmU6IERlbGV0aW9uVG9tYnN0b25lIHwgdW5kZWZpbmVkLFxuICApOiBQcm9taXNlPHsgYWN0aW9uOiBcImRlbGV0ZWRcIiB8IFwicmVzdG9yZWRcIiB8IFwibWlzc2luZ1wiOyBwdXJnZWRNaXNzaW5nPzogYm9vbGVhbiB9PiB7XG4gICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgIGlmICh0b21ic3RvbmUpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5yZW1vdmVMb2NhbFZhdWx0RmlsZShmaWxlKTtcbiAgICAgICAgdGhpcy5zeW5jSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gICAgICAgIHRoaXMuY2xlYXJNaXNzaW5nTGF6eVJlbW90ZShmaWxlLnBhdGgpO1xuICAgICAgICByZXR1cm4geyBhY3Rpb246IFwiZGVsZXRlZFwiLCBkZWxldGVkU3R1YjogdHJ1ZSB9O1xuICAgICAgfVxuXG4gICAgICBjb25zdCBtaXNzaW5nUmVjb3JkID0gdGhpcy5tYXJrTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICAgIGlmIChtaXNzaW5nUmVjb3JkLm1pc3NDb3VudCA+PSB0aGlzLm1pc3NpbmdMYXp5UmVtb3RlQ29uZmlybWF0aW9ucykge1xuICAgICAgICBhd2FpdCB0aGlzLnJlbW92ZUxvY2FsVmF1bHRGaWxlKGZpbGUpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgICAgdGhpcy5jbGVhck1pc3NpbmdMYXp5UmVtb3RlKGZpbGUucGF0aCk7XG4gICAgICAgIHJldHVybiB7IGFjdGlvbjogXCJkZWxldGVkXCIsIGRlbGV0ZWRTdHViOiB0cnVlLCBwdXJnZWRNaXNzaW5nOiB0cnVlIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7IGFjdGlvbjogXCJtaXNzaW5nXCIgfTtcbiAgICB9XG5cbiAgICB0aGlzLmNsZWFyTWlzc2luZ0xhenlSZW1vdGUoZmlsZS5wYXRoKTtcbiAgICBhd2FpdCB0aGlzLmRvd25sb2FkUmVtb3RlRmlsZVRvVmF1bHQoZmlsZS5wYXRoLCByZW1vdGUsIGZpbGUpO1xuICAgIGNvbnN0IHJlZnJlc2hlZCA9IHRoaXMuZ2V0VmF1bHRGaWxlQnlQYXRoKGZpbGUucGF0aCk7XG4gICAgdGhpcy5zeW5jSW5kZXguc2V0KGZpbGUucGF0aCwge1xuICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRTeW5jU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgcmVtb3RlU2lnbmF0dXJlOiByZW1vdGUuc2lnbmF0dXJlLFxuICAgICAgcmVtb3RlUGF0aDogc3R1Yi5yZW1vdGVQYXRoLFxuICAgIH0pO1xuICAgIHJldHVybiB7IGFjdGlvbjogXCJyZXN0b3JlZFwiIH07XG4gIH1cblxuICBwcml2YXRlIHBhcnNlTm90ZVN0dWIoY29udGVudDogc3RyaW5nKSB7XG4gICAgY29uc3QgbWF0Y2ggPSBjb250ZW50Lm1hdGNoKFxuICAgICAgL148IS0tXFxzKnNlY3VyZS13ZWJkYXYtbm90ZS1zdHViXFxzKlxccj9cXG5yZW1vdGU6XFxzKiguKz8pXFxyP1xcbnBsYWNlaG9sZGVyOlxccyooLio/KVxccj9cXG4tLT4vcyxcbiAgICApO1xuICAgIGlmICghbWF0Y2gpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICByZW1vdGVQYXRoOiBtYXRjaFsxXS50cmltKCksXG4gICAgICBwbGFjZWhvbGRlcjogbWF0Y2hbMl0udHJpbSgpLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkTm90ZVN0dWIoZmlsZTogVEZpbGUpIHtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5zeW5jU3VwcG9ydC5idWlsZFZhdWx0U3luY1JlbW90ZVBhdGgoZmlsZS5wYXRoKTtcbiAgICByZXR1cm4gW1xuICAgICAgYDwhLS0gJHtTRUNVUkVfTk9URV9TVFVCfWAsXG4gICAgICBgcmVtb3RlOiAke3JlbW90ZVBhdGh9YCxcbiAgICAgIGBwbGFjZWhvbGRlcjogJHtmaWxlLmJhc2VuYW1lfWAsXG4gICAgICBcIi0tPlwiLFxuICAgICAgXCJcIixcbiAgICAgIHRoaXMudChcbiAgICAgICAgYFx1OEZEOVx1NjYyRlx1NEUwMFx1N0JDN1x1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFx1NzY4NFx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1NjU4N1x1NEVGNlx1MzAwMlx1NjI1M1x1NUYwMFx1OEZEOVx1N0JDN1x1N0IxNFx1OEJCMFx1NjVGNlx1RkYwQ1x1NjNEMlx1NEVGNlx1NEYxQVx1NEVDRVx1OEZEQ1x1N0FFRlx1NTQwQ1x1NkI2NVx1NzZFRVx1NUY1NVx1NjA2Mlx1NTkwRFx1NUI4Q1x1NjU3NFx1NTE4NVx1NUJCOVx1MzAwMmAsXG4gICAgICAgIGBUaGlzIGlzIGEgbG9jYWwgcGxhY2Vob2xkZXIgZm9yIGFuIG9uLWRlbWFuZCBub3RlLiBPcGVuaW5nIHRoZSBub3RlIHJlc3RvcmVzIHRoZSBmdWxsIGNvbnRlbnQgZnJvbSB0aGUgcmVtb3RlIHN5bmMgZm9sZGVyLmAsXG4gICAgICApLFxuICAgIF0uam9pbihcIlxcblwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZXZpY3RTdGFsZVN5bmNlZE5vdGVzKHNob3dOb3RpY2U6IGJvb2xlYW4pIHtcbiAgICB0cnkge1xuICAgICAgaWYgKHRoaXMuc2V0dGluZ3Mubm90ZVN0b3JhZ2VNb2RlICE9PSBcImxhenktbm90ZXNcIikge1xuICAgICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1RjUzXHU1MjREXHU2NzJBXHU1NDJGXHU3NTI4XHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXHU2QTIxXHU1RjBGXHUzMDAyXCIsIFwiTGF6eSBub3RlIG1vZGUgaXMgbm90IGVuYWJsZWQuXCIpLCA2MDAwKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZmlsZXMgPSB0aGlzLnN5bmNTdXBwb3J0LmNvbGxlY3RWYXVsdENvbnRlbnRGaWxlcygpLmZpbHRlcigoZmlsZSkgPT4gZmlsZS5leHRlbnNpb24gPT09IFwibWRcIik7XG4gICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgICAgY29uc3QgdGhyZXNob2xkID0gTWF0aC5tYXgoMSwgdGhpcy5zZXR0aW5ncy5ub3RlRXZpY3RBZnRlckRheXMpICogMjQgKiA2MCAqIDYwICogMTAwMDtcbiAgICAgIGxldCBldmljdGVkID0gMDtcblxuICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICAgIGNvbnN0IGFjdGl2ZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgICAgIGlmIChhY3RpdmU/LnBhdGggPT09IGZpbGUucGF0aCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbGFzdEFjY2VzcyA9IHRoaXMubm90ZUFjY2Vzc1RpbWVzdGFtcHMuZ2V0KGZpbGUucGF0aCkgPz8gMDtcbiAgICAgICAgaWYgKGxhc3RBY2Nlc3MgIT09IDAgJiYgbm93IC0gbGFzdEFjY2VzcyA8IHRocmVzaG9sZCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICAgIGlmICh0aGlzLnBhcnNlTm90ZVN0dWIoY29udGVudCkpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGJpbmFyeSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWRCaW5hcnkoZmlsZSk7XG4gICAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkVmF1bHRTeW5jUmVtb3RlUGF0aChmaWxlLnBhdGgpO1xuICAgICAgICBhd2FpdCB0aGlzLnVwbG9hZEJpbmFyeShyZW1vdGVQYXRoLCBiaW5hcnksIFwidGV4dC9tYXJrZG93bjsgY2hhcnNldD11dGYtOFwiKTtcbiAgICAgICAgY29uc3QgdmVyaWZpZWQgPSBhd2FpdCB0aGlzLnZlcmlmeVJlbW90ZUJpbmFyeVJvdW5kVHJpcChyZW1vdGVQYXRoLCBiaW5hcnkpO1xuICAgICAgICBpZiAoIXZlcmlmaWVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1NjgyMVx1OUE4Q1x1NTkzMVx1OEQyNVx1RkYwQ1x1NURGMlx1NTNENlx1NkQ4OFx1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1MzAwMlwiLCBcIlJlbW90ZSBub3RlIHZlcmlmaWNhdGlvbiBmYWlsZWQsIGxvY2FsIG5vdGUgZXZpY3Rpb24gd2FzIGNhbmNlbGxlZC5cIikpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuc3RhdFJlbW90ZUZpbGUocmVtb3RlUGF0aCk7XG4gICAgICAgIGlmICghcmVtb3RlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIlx1OEZEQ1x1N0FFRlx1NkI2M1x1NjU4N1x1NTE0M1x1NjU3MFx1NjM2RVx1N0YzQVx1NTkzMVx1RkYwQ1x1NURGMlx1NTNENlx1NkQ4OFx1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1MzAwMlwiLCBcIlJlbW90ZSBub3RlIG1ldGFkYXRhIGlzIG1pc3NpbmcsIGxvY2FsIG5vdGUgZXZpY3Rpb24gd2FzIGNhbmNlbGxlZC5cIikpO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB0aGlzLmJ1aWxkTm90ZVN0dWIoZmlsZSkpO1xuICAgICAgICBjb25zdCByZWZyZXNoZWQgPSB0aGlzLmdldFZhdWx0RmlsZUJ5UGF0aChmaWxlLnBhdGgpO1xuICAgICAgICB0aGlzLnN5bmNJbmRleC5zZXQoZmlsZS5wYXRoLCB7XG4gICAgICAgICAgbG9jYWxTaWduYXR1cmU6IHJlZnJlc2hlZCA/IHRoaXMuc3luY1N1cHBvcnQuYnVpbGRTeW5jU2lnbmF0dXJlKHJlZnJlc2hlZCkgOiB0aGlzLnN5bmNTdXBwb3J0LmJ1aWxkU3luY1NpZ25hdHVyZShmaWxlKSxcbiAgICAgICAgICByZW1vdGVTaWduYXR1cmU6IHJlbW90ZT8uc2lnbmF0dXJlID8/IGAke2ZpbGUuc3RhdC5tdGltZX06JHtiaW5hcnkuYnl0ZUxlbmd0aH1gLFxuICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICBldmljdGVkICs9IDE7XG4gICAgICB9XG5cbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgdGhpcy50KFxuICAgICAgICAgICAgYFx1NURGMlx1NTZERVx1NjUzNiAke2V2aWN0ZWR9IFx1N0JDN1x1OTU3Rlx1NjcxRlx1NjcyQVx1OEJCRlx1OTVFRVx1NzY4NFx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1MzAwMmAsXG4gICAgICAgICAgICBgRXZpY3RlZCAke2V2aWN0ZWR9IHN0YWxlIGxvY2FsIG5vdGUocykuYCxcbiAgICAgICAgICApLFxuICAgICAgICAgIDgwMDAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5TdGF0ZSgpO1xuICAgICAgcmV0dXJuIGV2aWN0ZWQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZXZpY3Qgc3RhbGUgc3luY2VkIG5vdGVzXCIsIGVycm9yKTtcbiAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1NTZERVx1NjUzNlx1NjcyQ1x1NTczMFx1N0IxNFx1OEJCMFx1NTkzMVx1OEQyNVwiLCBcIkZhaWxlZCB0byBldmljdCBsb2NhbCBub3Rlc1wiKSwgZXJyb3IpLCA4MDAwKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZW5zdXJlUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgcGFydHMgPSByZW1vdGVQYXRoLnNwbGl0KFwiL1wiKS5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPiAwKTtcbiAgICBpZiAocGFydHMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgY3VycmVudCA9IFwiXCI7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHBhcnRzLmxlbmd0aCAtIDE7IGluZGV4ICs9IDEpIHtcbiAgICAgIGN1cnJlbnQgPSBjdXJyZW50ID8gYCR7Y3VycmVudH0vJHtwYXJ0c1tpbmRleF19YCA6IHBhcnRzW2luZGV4XTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0VXJsKHtcbiAgICAgICAgdXJsOiB0aGlzLmJ1aWxkVXBsb2FkVXJsKGN1cnJlbnQpLFxuICAgICAgICBtZXRob2Q6IFwiTUtDT0xcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgaWYgKCFbMjAwLCAyMDEsIDIwNCwgMjA3LCAzMDEsIDMwMiwgMzA3LCAzMDgsIDQwNV0uaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1LQ09MIGZhaWxlZCBmb3IgJHtjdXJyZW50fSB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGxpc3RSZW1vdGVUcmVlKHJvb3RGb2xkZXI6IHN0cmluZyk6IFByb21pc2U8UmVtb3RlSW52ZW50b3J5PiB7XG4gICAgY29uc3QgZmlsZXMgPSBuZXcgTWFwPHN0cmluZywgUmVtb3RlRmlsZVN0YXRlPigpO1xuICAgIGNvbnN0IGRpcmVjdG9yaWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgcGVuZGluZyA9IFtub3JtYWxpemVGb2xkZXIocm9vdEZvbGRlcildO1xuICAgIGNvbnN0IHZpc2l0ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuICAgIHdoaWxlIChwZW5kaW5nLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSBub3JtYWxpemVGb2xkZXIocGVuZGluZy5wb3AoKSA/PyByb290Rm9sZGVyKTtcbiAgICAgIGlmICh2aXNpdGVkLmhhcyhjdXJyZW50KSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgdmlzaXRlZC5hZGQoY3VycmVudCk7XG4gICAgICBjb25zdCBlbnRyaWVzID0gYXdhaXQgdGhpcy5saXN0UmVtb3RlRGlyZWN0b3J5KGN1cnJlbnQpO1xuICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG4gICAgICAgIGlmIChlbnRyeS5pc0NvbGxlY3Rpb24pIHtcbiAgICAgICAgICBkaXJlY3Rvcmllcy5hZGQoZW50cnkucmVtb3RlUGF0aCk7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKGVudHJ5LnJlbW90ZVBhdGgpO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGVudHJ5LmZpbGUpIHtcbiAgICAgICAgICBmaWxlcy5zZXQoZW50cnkucmVtb3RlUGF0aCwgZW50cnkuZmlsZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4geyBmaWxlcywgZGlyZWN0b3JpZXMgfTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgbGlzdFJlbW90ZURpcmVjdG9yeShyZW1vdGVEaXJlY3Rvcnk6IHN0cmluZykge1xuICAgIGNvbnN0IHJlcXVlc3RlZFBhdGggPSBub3JtYWxpemVGb2xkZXIocmVtb3RlRGlyZWN0b3J5KTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVxdWVzdGVkUGF0aCksXG4gICAgICBtZXRob2Q6IFwiUFJPUEZJTkRcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgRGVwdGg6IFwiMVwiLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDQwNCkge1xuICAgICAgcmV0dXJuIFtdIGFzIEFycmF5PHsgcmVtb3RlUGF0aDogc3RyaW5nOyBpc0NvbGxlY3Rpb246IGJvb2xlYW47IGZpbGU/OiBSZW1vdGVGaWxlU3RhdGUgfT47XG4gICAgfVxuXG4gICAgdGhpcy5hc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2UsIGBQUk9QRklORCBmb3IgJHtyZXF1ZXN0ZWRQYXRofWApO1xuXG4gICAgY29uc3QgeG1sVGV4dCA9IHRoaXMuZGVjb2RlVXRmOChyZXNwb25zZS5hcnJheUJ1ZmZlcik7XG4gICAgcmV0dXJuIHRoaXMucGFyc2VQcm9wZmluZERpcmVjdG9yeUxpc3RpbmcoeG1sVGV4dCwgcmVxdWVzdGVkUGF0aCk7XG4gIH1cblxuICBwcml2YXRlIHBhcnNlUHJvcGZpbmREaXJlY3RvcnlMaXN0aW5nKHhtbFRleHQ6IHN0cmluZywgcmVxdWVzdGVkUGF0aDogc3RyaW5nLCBpbmNsdWRlUmVxdWVzdGVkID0gZmFsc2UpIHtcbiAgICBjb25zdCBwYXJzZXIgPSBuZXcgRE9NUGFyc2VyKCk7XG4gICAgY29uc3QgZG9jdW1lbnQgPSBwYXJzZXIucGFyc2VGcm9tU3RyaW5nKHhtbFRleHQsIFwiYXBwbGljYXRpb24veG1sXCIpO1xuICAgIGlmIChkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcInBhcnNlcmVycm9yXCIpLmxlbmd0aCA+IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLnQoXCJcdTY1RTBcdTZDRDVcdTg5RTNcdTY3OTAgV2ViREFWIFx1NzZFRVx1NUY1NVx1NkUwNVx1NTM1NVx1MzAwMlwiLCBcIkZhaWxlZCB0byBwYXJzZSB0aGUgV2ViREFWIGRpcmVjdG9yeSBsaXN0aW5nLlwiKSk7XG4gICAgfVxuXG4gICAgY29uc3QgZW50cmllcyA9IG5ldyBNYXA8c3RyaW5nLCB7IHJlbW90ZVBhdGg6IHN0cmluZzsgaXNDb2xsZWN0aW9uOiBib29sZWFuOyBmaWxlPzogUmVtb3RlRmlsZVN0YXRlIH0+KCk7XG4gICAgZm9yIChjb25zdCBlbGVtZW50IG9mIEFycmF5LmZyb20oZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCIqXCIpKSkge1xuICAgICAgaWYgKGVsZW1lbnQubG9jYWxOYW1lICE9PSBcInJlc3BvbnNlXCIpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGhyZWYgPSB0aGlzLmdldFhtbExvY2FsTmFtZVRleHQoZWxlbWVudCwgXCJocmVmXCIpO1xuICAgICAgaWYgKCFocmVmKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5ocmVmVG9SZW1vdGVQYXRoKGhyZWYpO1xuICAgICAgaWYgKCFyZW1vdGVQYXRoKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBpc0NvbGxlY3Rpb24gPSB0aGlzLnhtbFRyZWVIYXNMb2NhbE5hbWUoZWxlbWVudCwgXCJjb2xsZWN0aW9uXCIpO1xuICAgICAgY29uc3Qgbm9ybWFsaXplZFBhdGggPSBpc0NvbGxlY3Rpb24gPyBub3JtYWxpemVGb2xkZXIocmVtb3RlUGF0aCkgOiByZW1vdGVQYXRoLnJlcGxhY2UoL1xcLyskLywgXCJcIik7XG4gICAgICBpZiAoXG4gICAgICAgICFpbmNsdWRlUmVxdWVzdGVkICYmXG4gICAgICAgIChcbiAgICAgICAgICBub3JtYWxpemVkUGF0aCA9PT0gcmVxdWVzdGVkUGF0aCB8fFxuICAgICAgICAgIG5vcm1hbGl6ZWRQYXRoID09PSByZXF1ZXN0ZWRQYXRoLnJlcGxhY2UoL1xcLyskLywgXCJcIilcbiAgICAgICAgKVxuICAgICAgKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzaXplVGV4dCA9IHRoaXMuZ2V0WG1sTG9jYWxOYW1lVGV4dChlbGVtZW50LCBcImdldGNvbnRlbnRsZW5ndGhcIik7XG4gICAgICBjb25zdCBwYXJzZWRTaXplID0gTnVtYmVyLnBhcnNlSW50KHNpemVUZXh0LCAxMCk7XG4gICAgICBjb25zdCBzaXplID0gTnVtYmVyLmlzRmluaXRlKHBhcnNlZFNpemUpID8gcGFyc2VkU2l6ZSA6IDA7XG4gICAgICBjb25zdCBtb2RpZmllZFRleHQgPSB0aGlzLmdldFhtbExvY2FsTmFtZVRleHQoZWxlbWVudCwgXCJnZXRsYXN0bW9kaWZpZWRcIik7XG4gICAgICBjb25zdCBwYXJzZWRNdGltZSA9IERhdGUucGFyc2UobW9kaWZpZWRUZXh0KTtcbiAgICAgIGNvbnN0IGxhc3RNb2RpZmllZCA9IE51bWJlci5pc0Zpbml0ZShwYXJzZWRNdGltZSkgPyBwYXJzZWRNdGltZSA6IDA7XG5cbiAgICAgIGVudHJpZXMuc2V0KG5vcm1hbGl6ZWRQYXRoLCB7XG4gICAgICAgIHJlbW90ZVBhdGg6IG5vcm1hbGl6ZWRQYXRoLFxuICAgICAgICBpc0NvbGxlY3Rpb24sXG4gICAgICAgIGZpbGU6IGlzQ29sbGVjdGlvblxuICAgICAgICAgID8gdW5kZWZpbmVkXG4gICAgICAgICAgOiB7XG4gICAgICAgICAgICAgIHJlbW90ZVBhdGg6IG5vcm1hbGl6ZWRQYXRoLFxuICAgICAgICAgICAgICBsYXN0TW9kaWZpZWQsXG4gICAgICAgICAgICAgIHNpemUsXG4gICAgICAgICAgICAgIHNpZ25hdHVyZTogdGhpcy5zeW5jU3VwcG9ydC5idWlsZFJlbW90ZVN5bmNTaWduYXR1cmUoe1xuICAgICAgICAgICAgICAgIGxhc3RNb2RpZmllZCxcbiAgICAgICAgICAgICAgICBzaXplLFxuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gWy4uLmVudHJpZXMudmFsdWVzKCldO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRYbWxMb2NhbE5hbWVUZXh0KHBhcmVudDogRWxlbWVudCwgbG9jYWxOYW1lOiBzdHJpbmcpIHtcbiAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgQXJyYXkuZnJvbShwYXJlbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCIqXCIpKSkge1xuICAgICAgaWYgKGVsZW1lbnQubG9jYWxOYW1lID09PSBsb2NhbE5hbWUpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQudGV4dENvbnRlbnQ/LnRyaW0oKSA/PyBcIlwiO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBcIlwiO1xuICB9XG5cbiAgcHJpdmF0ZSB4bWxUcmVlSGFzTG9jYWxOYW1lKHBhcmVudDogRWxlbWVudCwgbG9jYWxOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShwYXJlbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCIqXCIpKS5zb21lKChlbGVtZW50KSA9PiBlbGVtZW50LmxvY2FsTmFtZSA9PT0gbG9jYWxOYW1lKTtcbiAgfVxuXG4gIHByaXZhdGUgaHJlZlRvUmVtb3RlUGF0aChocmVmOiBzdHJpbmcpIHtcbiAgICBjb25zdCBiYXNlVXJsID0gYCR7dGhpcy5zZXR0aW5ncy53ZWJkYXZVcmwucmVwbGFjZSgvXFwvKyQvLCBcIlwiKX0vYDtcbiAgICBjb25zdCByZXNvbHZlZCA9IG5ldyBVUkwoaHJlZiwgYmFzZVVybCk7XG4gICAgY29uc3QgYmFzZVBhdGggPSBuZXcgVVJMKGJhc2VVcmwpLnBhdGhuYW1lLnJlcGxhY2UoL1xcLyskLywgXCIvXCIpO1xuICAgIGNvbnN0IGRlY29kZWRQYXRoID0gdGhpcy5kZWNvZGVQYXRobmFtZShyZXNvbHZlZC5wYXRobmFtZSk7XG4gICAgaWYgKCFkZWNvZGVkUGF0aC5zdGFydHNXaXRoKGJhc2VQYXRoKSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlY29kZWRQYXRoLnNsaWNlKGJhc2VQYXRoLmxlbmd0aCkucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgZGVjb2RlUGF0aG5hbWUocGF0aG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBwYXRobmFtZVxuICAgICAgLnNwbGl0KFwiL1wiKVxuICAgICAgLm1hcCgoc2VnbWVudCkgPT4ge1xuICAgICAgICBpZiAoIXNlZ21lbnQpIHtcbiAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudChzZWdtZW50KTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgcmV0dXJuIHNlZ21lbnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuam9pbihcIi9cIik7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkRXhwZWN0ZWRSZW1vdGVEaXJlY3RvcmllcyhyZW1vdGVGaWxlUGF0aHM6IFNldDxzdHJpbmc+LCByb290Rm9sZGVyOiBzdHJpbmcpIHtcbiAgICBjb25zdCBleHBlY3RlZCA9IG5ldyBTZXQ8c3RyaW5nPihbbm9ybWFsaXplRm9sZGVyKHJvb3RGb2xkZXIpXSk7XG4gICAgZm9yIChjb25zdCByZW1vdGVQYXRoIG9mIHJlbW90ZUZpbGVQYXRocykge1xuICAgICAgY29uc3QgcGFydHMgPSByZW1vdGVQYXRoLnNwbGl0KFwiL1wiKS5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZS5sZW5ndGggPiAwKTtcbiAgICAgIGxldCBjdXJyZW50ID0gXCJcIjtcbiAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBwYXJ0cy5sZW5ndGggLSAxOyBpbmRleCArPSAxKSB7XG4gICAgICAgIGN1cnJlbnQgPSBjdXJyZW50ID8gYCR7Y3VycmVudH0vJHtwYXJ0c1tpbmRleF19YCA6IHBhcnRzW2luZGV4XTtcbiAgICAgICAgZXhwZWN0ZWQuYWRkKG5vcm1hbGl6ZUZvbGRlcihjdXJyZW50KSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGV4cGVjdGVkO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWNvbmNpbGVEaXJlY3RvcmllcyhyZW1vdGVEaXJlY3RvcmllczogU2V0PHN0cmluZz4pIHtcbiAgICBjb25zdCBzdGF0cyA9IHsgY3JlYXRlZExvY2FsOiAwLCBjcmVhdGVkUmVtb3RlOiAwLCBkZWxldGVkTG9jYWw6IDAsIGRlbGV0ZWRSZW1vdGU6IDAgfTtcblxuICAgIGNvbnN0IHJlbW90ZUxvY2FsUGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBmb3IgKGNvbnN0IHJlbW90ZURpciBvZiByZW1vdGVEaXJlY3Rvcmllcykge1xuICAgICAgY29uc3QgbG9jYWxQYXRoID0gdGhpcy5zeW5jU3VwcG9ydC5yZW1vdGVQYXRoVG9WYXVsdFBhdGgocmVtb3RlRGlyKTtcbiAgICAgIGlmIChsb2NhbFBhdGggIT09IG51bGwgJiYgbG9jYWxQYXRoLmxlbmd0aCA+IDAgJiYgIXRoaXMuc3luY1N1cHBvcnQuc2hvdWxkU2tpcERpcmVjdG9yeVN5bmNQYXRoKGxvY2FsUGF0aCkpIHtcbiAgICAgICAgcmVtb3RlTG9jYWxQYXRocy5hZGQobm9ybWFsaXplUGF0aChsb2NhbFBhdGgpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBsb2NhbERpclBhdGhzID0gdGhpcy5zeW5jU3VwcG9ydC5jb2xsZWN0TG9jYWxTeW5jZWREaXJlY3RvcmllcygpO1xuICAgIGNvbnN0IGtub3duRGlyUGF0aHMgPSB0aGlzLnN5bmNlZERpcmVjdG9yaWVzO1xuICAgIGNvbnN0IG5ld1N5bmNlZERpcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuICAgIGNvbnN0IGxvY2FsT25seSA9IFsuLi5sb2NhbERpclBhdGhzXS5maWx0ZXIoKHApID0+ICFyZW1vdGVMb2NhbFBhdGhzLmhhcyhwKSk7XG4gICAgY29uc3QgcmVtb3RlT25seSA9IFsuLi5yZW1vdGVMb2NhbFBhdGhzXS5maWx0ZXIoKHApID0+ICFsb2NhbERpclBhdGhzLmhhcyhwKSk7XG5cbiAgICAvLyBMb2NhbC1vbmx5IGRpcmVjdG9yaWVzIGFyZSBrZXB0IGxvY2FsbHkgYW5kIGNyZWF0ZWQgcmVtb3RlbHkgaWYgbmVlZGVkLlxuICAgIGZvciAoY29uc3QgZGlyUGF0aCBvZiBbLi4ubG9jYWxPbmx5XS5zb3J0KChhLCBiKSA9PiBhLmxlbmd0aCAtIGIubGVuZ3RoKSkge1xuICAgICAgY29uc3QgcmVtb3RlRGlyID0gbm9ybWFsaXplRm9sZGVyKHRoaXMuc2V0dGluZ3MudmF1bHRTeW5jUmVtb3RlRm9sZGVyKSArIGRpclBhdGg7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLmVuc3VyZVJlbW90ZURpcmVjdG9yaWVzKHJlbW90ZURpcik7XG4gICAgICAgIHN0YXRzLmNyZWF0ZWRSZW1vdGUgKz0gMTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBEaXJlY3RvcnkgY3JlYXRpb24gZmFpbHVyZXMgc2hvdWxkIG5vdCBtYWtlIHJlY29uY2lsZSBkZXN0cnVjdGl2ZS5cbiAgICAgIH1cbiAgICAgIG5ld1N5bmNlZERpcnMuYWRkKGRpclBhdGgpO1xuICAgIH1cblxuICAgIC8vIEJvdGggc2lkZXMgZXhpc3QgXHUyMTkyIGtlZXBcbiAgICBmb3IgKGNvbnN0IGRpclBhdGggb2YgbG9jYWxEaXJQYXRocykge1xuICAgICAgaWYgKHJlbW90ZUxvY2FsUGF0aHMuaGFzKGRpclBhdGgpKSB7XG4gICAgICAgIG5ld1N5bmNlZERpcnMuYWRkKGRpclBhdGgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJlbW90ZS1vbmx5IGRpcmVjdG9yaWVzIGFyZSBrZXB0IHJlbW90ZWx5IGFuZCByZWNyZWF0ZWQgbG9jYWxseSBpZiBuZWVkZWQuXG4gICAgZm9yIChjb25zdCBkaXJQYXRoIG9mIFsuLi5yZW1vdGVPbmx5XS5zb3J0KChhLCBiKSA9PiBhLmxlbmd0aCAtIGIubGVuZ3RoKSkge1xuICAgICAgaWYgKCEoYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5leGlzdHMoZGlyUGF0aCkpKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5ta2RpcihkaXJQYXRoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGNvbnN0IG1zZyA9IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKTtcbiAgICAgICAgICBpZiAoIW1zZy5pbmNsdWRlcyhcImFscmVhZHkgZXhpc3RzXCIpKSB7XG4gICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgc3RhdHMuY3JlYXRlZExvY2FsICs9IDE7XG4gICAgICBuZXdTeW5jZWREaXJzLmFkZChkaXJQYXRoKTtcbiAgICB9XG5cbiAgICB0aGlzLnN5bmNlZERpcmVjdG9yaWVzID0gbmV3U3luY2VkRGlycztcbiAgICByZXR1cm4gc3RhdHM7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZUV4dHJhUmVtb3RlRGlyZWN0b3JpZXMocmVtb3RlRGlyZWN0b3JpZXM6IFNldDxzdHJpbmc+LCBleHBlY3RlZERpcmVjdG9yaWVzOiBTZXQ8c3RyaW5nPikge1xuICAgIGxldCBkZWxldGVkID0gMDtcbiAgICBjb25zdCBjYW5kaWRhdGVzID0gWy4uLnJlbW90ZURpcmVjdG9yaWVzXVxuICAgICAgLmZpbHRlcigocmVtb3RlUGF0aCkgPT4gIWV4cGVjdGVkRGlyZWN0b3JpZXMuaGFzKHJlbW90ZVBhdGgpKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGIubGVuZ3RoIC0gYS5sZW5ndGggfHwgYi5sb2NhbGVDb21wYXJlKGEpKTtcblxuICAgIGZvciAoY29uc3QgcmVtb3RlUGF0aCBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdGhpcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5idWlsZEF1dGhIZWFkZXIoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAoWzIwMCwgMjAyLCAyMDQsIDQwNF0uaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzKSkge1xuICAgICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSA0MDQpIHtcbiAgICAgICAgICBkZWxldGVkICs9IDE7XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChbNDA1LCA0MDldLmluY2x1ZGVzKHJlc3BvbnNlLnN0YXR1cykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHRocm93IG5ldyBFcnJvcihgREVMRVRFIGRpcmVjdG9yeSBmYWlsZWQgZm9yICR7cmVtb3RlUGF0aH0gd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlbGV0ZWQ7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHByb2Nlc3NQZW5kaW5nVGFza3MoKSB7XG5cbiAgICBhd2FpdCB0aGlzLnVwbG9hZFF1ZXVlLnByb2Nlc3NQZW5kaW5nVGFza3MoKTtcbiAgfVxuXG4gIHByaXZhdGUgdHJhY2tWYXVsdE11dGF0aW9uKG9wZXJhdGlvbjogKCkgPT4gUHJvbWlzZTx2b2lkPikge1xuICAgIGNvbnN0IHByb21pc2UgPSBvcGVyYXRpb24oKVxuICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiU2VjdXJlIFdlYkRBViB2YXVsdCBtdXRhdGlvbiBoYW5kbGluZyBmYWlsZWRcIiwgZXJyb3IpO1xuICAgICAgfSlcbiAgICAgIC5maW5hbGx5KCgpID0+IHtcbiAgICAgICAgdGhpcy5wZW5kaW5nVmF1bHRNdXRhdGlvblByb21pc2VzLmRlbGV0ZShwcm9taXNlKTtcbiAgICAgIH0pO1xuICAgIHRoaXMucGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlcy5hZGQocHJvbWlzZSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHdhaXRGb3JQZW5kaW5nVmF1bHRNdXRhdGlvbnMoKSB7XG4gICAgd2hpbGUgKHRoaXMucGVuZGluZ1ZhdWx0TXV0YXRpb25Qcm9taXNlcy5zaXplID4gMCkge1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKFsuLi50aGlzLnBlbmRpbmdWYXVsdE11dGF0aW9uUHJvbWlzZXNdKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHByZXBhcmVQZW5kaW5nVXBsb2Fkc0ZvclN5bmMoc2hvd05vdGljZTogYm9vbGVhbikge1xuXG4gICAgYXdhaXQgdGhpcy51cGxvYWRRdWV1ZS5wcm9jZXNzUGVuZGluZ1Rhc2tzKCk7XG5cbiAgICBpZiAodGhpcy51cGxvYWRRdWV1ZS5oYXNQZW5kaW5nV29yaygpKSB7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNBdCA9IERhdGUubm93KCk7XG4gICAgICB0aGlzLmxhc3RWYXVsdFN5bmNTdGF0dXMgPSB0aGlzLnQoXG4gICAgICAgIFwiXHU2OEMwXHU2RDRCXHU1MjMwXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU0RUNEXHU1NzI4XHU4RkRCXHU4ODRDXHU2MjE2XHU3QjQ5XHU1Rjg1XHU5MUNEXHU4QkQ1XHVGRjBDXHU1REYyXHU2NjgyXHU3RjEzXHU2NzJDXHU2QjIxXHU3QjE0XHU4QkIwXHU1NDBDXHU2QjY1XHVGRjBDXHU5MDdGXHU1MTREXHU2NUU3XHU3MjQ4XHU3QjE0XHU4QkIwXHU4OTg2XHU3NkQ2XHU2NUIwXHU1NkZFXHU3MjQ3XHU1RjE1XHU3NTI4XHUzMDAyXCIsXG4gICAgICAgIFwiSW1hZ2UgdXBsb2FkcyBhcmUgc3RpbGwgcnVubmluZyBvciB3YWl0aW5nIGZvciByZXRyeSwgc28gbm90ZSBzeW5jIHdhcyBkZWZlcnJlZCB0byBhdm9pZCBvbGQgbm90ZSBjb250ZW50IG92ZXJ3cml0aW5nIG5ldyBpbWFnZSByZWZlcmVuY2VzLlwiLFxuICAgICAgKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMubGFzdFZhdWx0U3luY1N0YXR1cywgODAwMCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwbG9hZEltYWdlc0luTm90ZShub3RlRmlsZTogVEZpbGUpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQobm90ZUZpbGUpO1xuICAgICAgY29uc3QgcmVwbGFjZW1lbnRzID0gYXdhaXQgdGhpcy5idWlsZFVwbG9hZFJlcGxhY2VtZW50cyhjb250ZW50LCBub3RlRmlsZSk7XG5cbiAgICAgIGlmIChyZXBsYWNlbWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50KFwiXHU1RjUzXHU1MjREXHU3QjE0XHU4QkIwXHU0RTJEXHU2Q0ExXHU2NzA5XHU2MjdFXHU1MjMwXHU2NzJDXHU1NzMwXHU1NkZFXHU3MjQ3XHUzMDAyXCIsIFwiTm8gbG9jYWwgaW1hZ2VzIGZvdW5kIGluIHRoZSBjdXJyZW50IG5vdGUuXCIpKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBsZXQgdXBkYXRlZCA9IGNvbnRlbnQ7XG4gICAgICBmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIHJlcGxhY2VtZW50cykge1xuICAgICAgICB1cGRhdGVkID0gdXBkYXRlZC5zcGxpdChyZXBsYWNlbWVudC5vcmlnaW5hbCkuam9pbihyZXBsYWNlbWVudC5yZXdyaXR0ZW4pO1xuICAgICAgfVxuXG4gICAgICBpZiAodXBkYXRlZCA9PT0gY29udGVudCkge1xuICAgICAgICBuZXcgTm90aWNlKHRoaXMudChcIlx1NkNBMVx1NjcwOVx1OTcwMFx1ODk4MVx1NjUzOVx1NTE5OVx1NzY4NFx1NTZGRVx1NzI0N1x1OTRGRVx1NjNBNVx1MzAwMlwiLCBcIk5vIGltYWdlcyB3ZXJlIHJld3JpdHRlbi5cIikpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShub3RlRmlsZSwgdXBkYXRlZCk7XG4gICAgICB0aGlzLnNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYyhub3RlRmlsZS5wYXRoLCBcImltYWdlLWFkZFwiKTtcblxuICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZGVsZXRlTG9jYWxBZnRlclVwbG9hZCkge1xuICAgICAgICBmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIHJlcGxhY2VtZW50cykge1xuICAgICAgICAgIGlmIChyZXBsYWNlbWVudC5zb3VyY2VGaWxlKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnRyYXNoSWZFeGlzdHMocmVwbGFjZW1lbnQuc291cmNlRmlsZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIG5ldyBOb3RpY2UodGhpcy50KGBcdTVERjJcdTRFMEFcdTRGMjAgJHtyZXBsYWNlbWVudHMubGVuZ3RofSBcdTVGMjBcdTU2RkVcdTcyNDdcdTUyMzAgV2ViREFWXHUzMDAyYCwgYFVwbG9hZGVkICR7cmVwbGFjZW1lbnRzLmxlbmd0aH0gaW1hZ2UocykgdG8gV2ViREFWLmApKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIlNlY3VyZSBXZWJEQVYgdXBsb2FkIGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVzY3JpYmVFcnJvcih0aGlzLnQoXCJcdTRFMEFcdTRGMjBcdTU5MzFcdThEMjVcIiwgXCJVcGxvYWQgZmFpbGVkXCIpLCBlcnJvciksIDgwMDApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcHJvY2Vzc1Rhc2sodGFzazogVXBsb2FkVGFzaykge1xuXG4gICAgYXdhaXQgdGhpcy51cGxvYWRRdWV1ZS5wcm9jZXNzVGFzayh0YXNrKTtcbiAgfVxuXG4gIHByaXZhdGUgZXNjYXBlSHRtbCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHZhbHVlXG4gICAgICAucmVwbGFjZSgvJi9nLCBcIiZhbXA7XCIpXG4gICAgICAucmVwbGFjZSgvXCIvZywgXCImcXVvdDtcIilcbiAgICAgIC5yZXBsYWNlKC88L2csIFwiJmx0O1wiKVxuICAgICAgLnJlcGxhY2UoLz4vZywgXCImZ3Q7XCIpO1xuICB9XG5cbiAgcHJpdmF0ZSB1bmVzY2FwZUh0bWwodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiB2YWx1ZVxuICAgICAgLnJlcGxhY2UoLyZxdW90Oy9nLCBcIlxcXCJcIilcbiAgICAgIC5yZXBsYWNlKC8mZ3Q7L2csIFwiPlwiKVxuICAgICAgLnJlcGxhY2UoLyZsdDsvZywgXCI8XCIpXG4gICAgICAucmVwbGFjZSgvJmFtcDsvZywgXCImXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBmZXRjaFNlY3VyZUltYWdlQmxvYlVybChyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCksXG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IHRoaXMuYnVpbGRBdXRoSGVhZGVyKCksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hc3NlcnRSZXNwb25zZVN1Y2Nlc3MocmVzcG9uc2UsIFwiRmV0Y2ggc2VjdXJlIGltYWdlXCIpO1xuXG4gICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtyZXNwb25zZS5hcnJheUJ1ZmZlcl0sIHtcbiAgICAgIHR5cGU6IHJlc3BvbnNlLmhlYWRlcnNbXCJjb250ZW50LXR5cGVcIl0gPz8gXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIixcbiAgICB9KTtcbiAgICBjb25zdCBibG9iVXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICB0aGlzLmV2aWN0QmxvYlVybHNJZk5lZWRlZCgpO1xuICAgIHRoaXMuYmxvYlVybHMuYWRkKGJsb2JVcmwpO1xuICAgIHJldHVybiBibG9iVXJsO1xuICB9XG5cbiAgcHJpdmF0ZSBldmljdEJsb2JVcmxzSWZOZWVkZWQoKSB7XG4gICAgd2hpbGUgKHRoaXMuYmxvYlVybHMuc2l6ZSA+PSB0aGlzLm1heEJsb2JVcmxzKSB7XG4gICAgICBjb25zdCBvbGRlc3QgPSB0aGlzLmJsb2JVcmxzLnZhbHVlcygpLm5leHQoKS52YWx1ZSE7XG4gICAgICB0aGlzLmJsb2JVcmxzLmRlbGV0ZShvbGRlc3QpO1xuICAgICAgVVJMLnJldm9rZU9iamVjdFVSTChvbGRlc3QpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXJyYXlCdWZmZXJUb0Jhc2U2NChidWZmZXI6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShidWZmZXIpO1xuICAgIGNvbnN0IGNodW5rU2l6ZSA9IDB4ODAwMDtcbiAgICBsZXQgYmluYXJ5ID0gXCJcIjtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYnl0ZXMubGVuZ3RoOyBpbmRleCArPSBjaHVua1NpemUpIHtcbiAgICAgIGNvbnN0IGNodW5rID0gYnl0ZXMuc3ViYXJyYXkoaW5kZXgsIGluZGV4ICsgY2h1bmtTaXplKTtcbiAgICAgIGJpbmFyeSArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKC4uLmNodW5rKTtcbiAgICB9XG4gICAgcmV0dXJuIGJ0b2EoYmluYXJ5KTtcbiAgfVxuXG4gIHByaXZhdGUgYmFzZTY0VG9BcnJheUJ1ZmZlcihiYXNlNjQ6IHN0cmluZykge1xuICAgIGNvbnN0IGJpbmFyeSA9IGF0b2IoYmFzZTY0KTtcbiAgICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KGJpbmFyeS5sZW5ndGgpO1xuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBiaW5hcnkubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgICBieXRlc1tpbmRleF0gPSBiaW5hcnkuY2hhckNvZGVBdChpbmRleCk7XG4gICAgfVxuICAgIHJldHVybiBieXRlcy5idWZmZXIuc2xpY2UoYnl0ZXMuYnl0ZU9mZnNldCwgYnl0ZXMuYnl0ZU9mZnNldCArIGJ5dGVzLmJ5dGVMZW5ndGgpIGFzIEFycmF5QnVmZmVyO1xuICB9XG5cbiAgcHJpdmF0ZSBhcnJheUJ1ZmZlcnNFcXVhbChsZWZ0OiBBcnJheUJ1ZmZlciwgcmlnaHQ6IEFycmF5QnVmZmVyKSB7XG4gICAgY29uc3QgYSA9IG5ldyBVaW50OEFycmF5KGxlZnQpO1xuICAgIGNvbnN0IGIgPSBuZXcgVWludDhBcnJheShyaWdodCk7XG4gICAgaWYgKGEubGVuZ3RoICE9PSBiLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBhLmxlbmd0aDsgaW5kZXggKz0gMSkge1xuICAgICAgaWYgKGFbaW5kZXhdICE9PSBiW2luZGV4XSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkQ2xpcGJvYXJkRmlsZU5hbWUobWltZVR5cGU6IHN0cmluZykge1xuICAgIGNvbnN0IGV4dGVuc2lvbiA9IG1pbWVUeXBlLnNwbGl0KFwiL1wiKVsxXT8ucmVwbGFjZShcImpwZWdcIiwgXCJqcGdcIikgfHwgXCJwbmdcIjtcbiAgICByZXR1cm4gYHBhc3RlZC1pbWFnZS0ke0RhdGUubm93KCl9LiR7ZXh0ZW5zaW9ufWA7XG4gIH1cblxuICBwcml2YXRlIGVzY2FwZVJlZ0V4cCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCBcIlxcXFwkJlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRSZW1vdGVQYXRoKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gYCR7bm9ybWFsaXplRm9sZGVyKHRoaXMuc2V0dGluZ3MucmVtb3RlRm9sZGVyKX0ke2ZpbGVOYW1lfWA7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGJ1aWxkUmVtb3RlRmlsZU5hbWVGcm9tQmluYXJ5KGZpbGVOYW1lOiBzdHJpbmcsIGJpbmFyeTogQXJyYXlCdWZmZXIpIHtcbiAgICBjb25zdCBleHRlbnNpb24gPSB0aGlzLmdldEV4dGVuc2lvbkZyb21GaWxlTmFtZShmaWxlTmFtZSk7XG4gICAgaWYgKHRoaXMuc2V0dGluZ3MubmFtaW5nU3RyYXRlZ3kgPT09IFwiaGFzaFwiKSB7XG4gICAgICBjb25zdCBoYXNoID0gKGF3YWl0IHRoaXMuY29tcHV0ZVNoYTI1NkhleChiaW5hcnkpKS5zbGljZSgwLCAxNik7XG4gICAgICByZXR1cm4gYCR7aGFzaH0uJHtleHRlbnNpb259YDtcbiAgICB9XG5cbiAgICByZXR1cm4gYCR7RGF0ZS5ub3coKX0tJHtmaWxlTmFtZX1gO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZFVwbG9hZFVybChyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBiYXNlID0gdGhpcy5zZXR0aW5ncy53ZWJkYXZVcmwucmVwbGFjZSgvXFwvKyQvLCBcIlwiKTtcbiAgICByZXR1cm4gYCR7YmFzZX0vJHtyZW1vdGVQYXRoLnNwbGl0KFwiL1wiKS5tYXAoZW5jb2RlVVJJQ29tcG9uZW50KS5qb2luKFwiL1wiKX1gO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZEF1dGhIZWFkZXIoKSB7XG4gICAgY29uc3QgdG9rZW4gPSB0aGlzLmFycmF5QnVmZmVyVG9CYXNlNjQodGhpcy5lbmNvZGVVdGY4KGAke3RoaXMuc2V0dGluZ3MudXNlcm5hbWV9OiR7dGhpcy5zZXR0aW5ncy5wYXNzd29yZH1gKSk7XG4gICAgcmV0dXJuIGBCYXNpYyAke3Rva2VufWA7XG4gIH1cblxuICBwcml2YXRlIGVuc3VyZUNvbmZpZ3VyZWQoKSB7XG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLndlYmRhdlVybCB8fCAhdGhpcy5zZXR0aW5ncy51c2VybmFtZSB8fCAhdGhpcy5zZXR0aW5ncy5wYXNzd29yZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKHRoaXMudChcIldlYkRBViBcdTkxNERcdTdGNkVcdTRFMERcdTVCOENcdTY1NzRcdTMwMDJcIiwgXCJXZWJEQVYgc2V0dGluZ3MgYXJlIGluY29tcGxldGUuXCIpKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzc2VydFJlc3BvbnNlU3VjY2VzcyhyZXNwb25zZTogeyBzdGF0dXM6IG51bWJlciB9LCBjb250ZXh0OiBzdHJpbmcpIHtcbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtjb250ZXh0fSBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBnZXRNaW1lVHlwZShleHRlbnNpb246IHN0cmluZykge1xuICAgIHJldHVybiBNSU1FX01BUFtleHRlbnNpb24udG9Mb3dlckNhc2UoKV0gPz8gXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIjtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0TWltZVR5cGVGcm9tRmlsZU5hbWUoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmdldE1pbWVUeXBlKHRoaXMuZ2V0RXh0ZW5zaW9uRnJvbUZpbGVOYW1lKGZpbGVOYW1lKSk7XG4gIH1cblxuICBwcml2YXRlIGdldEV4dGVuc2lvbkZyb21GaWxlTmFtZShmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcGllY2VzID0gZmlsZU5hbWUuc3BsaXQoXCIuXCIpO1xuICAgIHJldHVybiBwaWVjZXMubGVuZ3RoID4gMSA/IHBpZWNlc1twaWVjZXMubGVuZ3RoIC0gMV0udG9Mb3dlckNhc2UoKSA6IFwicG5nXCI7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHByZXBhcmVVcGxvYWRQYXlsb2FkKGJpbmFyeTogQXJyYXlCdWZmZXIsIG1pbWVUeXBlOiBzdHJpbmcsIGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBpZiAoIXRoaXMuc2V0dGluZ3MuY29tcHJlc3NJbWFnZXMpIHtcbiAgICAgIHJldHVybiB7IGJpbmFyeSwgbWltZVR5cGUsIGZpbGVOYW1lIH07XG4gICAgfVxuXG4gICAgY29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLmNvbXByZXNzSW1hZ2VJZk5lZWRlZChiaW5hcnksIG1pbWVUeXBlLCBmaWxlTmFtZSk7XG4gICAgcmV0dXJuIHByZXBhcmVkID8/IHsgYmluYXJ5LCBtaW1lVHlwZSwgZmlsZU5hbWUgfTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY29tcHJlc3NJbWFnZUlmTmVlZGVkKGJpbmFyeTogQXJyYXlCdWZmZXIsIG1pbWVUeXBlOiBzdHJpbmcsIGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICBpZiAoIS9eaW1hZ2VcXC8ocG5nfGpwZWd8anBnfHdlYnApJC9pLnRlc3QobWltZVR5cGUpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCB0aHJlc2hvbGRCeXRlcyA9IHRoaXMuc2V0dGluZ3MuY29tcHJlc3NUaHJlc2hvbGRLYiAqIDEwMjQ7XG4gICAgY29uc3Qgc291cmNlQmxvYiA9IG5ldyBCbG9iKFtiaW5hcnldLCB7IHR5cGU6IG1pbWVUeXBlIH0pO1xuICAgIGNvbnN0IGltYWdlID0gYXdhaXQgdGhpcy5sb2FkSW1hZ2VFbGVtZW50KHNvdXJjZUJsb2IpO1xuICAgIGNvbnN0IGxhcmdlc3RTaWRlID0gTWF0aC5tYXgoaW1hZ2UubmF0dXJhbFdpZHRoLCBpbWFnZS5uYXR1cmFsSGVpZ2h0KTtcbiAgICBjb25zdCBuZWVkc1Jlc2l6ZSA9IGxhcmdlc3RTaWRlID4gdGhpcy5zZXR0aW5ncy5tYXhJbWFnZURpbWVuc2lvbjtcbiAgICBjb25zdCBuZWVkc0NvbXByZXNzID0gc291cmNlQmxvYi5zaXplID4gdGhyZXNob2xkQnl0ZXMgfHwgbmVlZHNSZXNpemU7XG4gICAgaWYgKCFuZWVkc0NvbXByZXNzKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBzY2FsZSA9IG5lZWRzUmVzaXplID8gdGhpcy5zZXR0aW5ncy5tYXhJbWFnZURpbWVuc2lvbiAvIGxhcmdlc3RTaWRlIDogMTtcbiAgICBjb25zdCB0YXJnZXRXaWR0aCA9IE1hdGgubWF4KDEsIE1hdGgucm91bmQoaW1hZ2UubmF0dXJhbFdpZHRoICogc2NhbGUpKTtcbiAgICBjb25zdCB0YXJnZXRIZWlnaHQgPSBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKGltYWdlLm5hdHVyYWxIZWlnaHQgKiBzY2FsZSkpO1xuICAgIGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJjYW52YXNcIik7XG4gICAgY2FudmFzLndpZHRoID0gdGFyZ2V0V2lkdGg7XG4gICAgY2FudmFzLmhlaWdodCA9IHRhcmdldEhlaWdodDtcbiAgICBjb25zdCBjb250ZXh0ID0gY2FudmFzLmdldENvbnRleHQoXCIyZFwiKTtcbiAgICBpZiAoIWNvbnRleHQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnRleHQuZHJhd0ltYWdlKGltYWdlLCAwLCAwLCB0YXJnZXRXaWR0aCwgdGFyZ2V0SGVpZ2h0KTtcblxuICAgIGNvbnN0IG91dHB1dE1pbWUgPSBtaW1lVHlwZS50b0xvd2VyQ2FzZSgpID09PSBcImltYWdlL2pwZ1wiID8gXCJpbWFnZS9qcGVnXCIgOiBtaW1lVHlwZTtcbiAgICBjb25zdCBxdWFsaXR5ID0gTWF0aC5tYXgoMC40LCBNYXRoLm1pbigwLjk4LCB0aGlzLnNldHRpbmdzLmpwZWdRdWFsaXR5IC8gMTAwKSk7XG4gICAgY29uc3QgY29tcHJlc3NlZEJsb2IgPSBhd2FpdCBuZXcgUHJvbWlzZTxCbG9iIHwgbnVsbD4oKHJlc29sdmUpID0+IHtcbiAgICAgIGNhbnZhcy50b0Jsb2IocmVzb2x2ZSwgb3V0cHV0TWltZSwgcXVhbGl0eSk7XG4gICAgfSk7XG5cbiAgICBpZiAoIWNvbXByZXNzZWRCbG9iKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoIW5lZWRzUmVzaXplICYmIGNvbXByZXNzZWRCbG9iLnNpemUgPj0gc291cmNlQmxvYi5zaXplKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBuZXh0QmluYXJ5ID0gYXdhaXQgY29tcHJlc3NlZEJsb2IuYXJyYXlCdWZmZXIoKTtcbiAgICBjb25zdCBuZXh0RXh0ZW5zaW9uID0gdGhpcy5leHRlbnNpb25Gcm9tTWltZVR5cGUob3V0cHV0TWltZSkgPz8gdGhpcy5nZXRFeHRlbnNpb25Gcm9tRmlsZU5hbWUoZmlsZU5hbWUpO1xuICAgIGNvbnN0IG5leHRGaWxlTmFtZSA9IGZpbGVOYW1lLnJlcGxhY2UoL1xcLlteLl0rJC8sIFwiXCIpICsgYC4ke25leHRFeHRlbnNpb259YDtcbiAgICByZXR1cm4ge1xuICAgICAgYmluYXJ5OiBuZXh0QmluYXJ5LFxuICAgICAgbWltZVR5cGU6IG91dHB1dE1pbWUsXG4gICAgICBmaWxlTmFtZTogbmV4dEZpbGVOYW1lLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGxvYWRJbWFnZUVsZW1lbnQoYmxvYjogQmxvYikge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZTxIVE1MSW1hZ2VFbGVtZW50PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICAgICAgY29uc3QgaW1hZ2UgPSBuZXcgSW1hZ2UoKTtcbiAgICAgIGltYWdlLm9ubG9hZCA9ICgpID0+IHtcbiAgICAgICAgVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpO1xuICAgICAgICByZXNvbHZlKGltYWdlKTtcbiAgICAgIH07XG4gICAgICBpbWFnZS5vbmVycm9yID0gKGVycm9yKSA9PiB7XG4gICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwodXJsKTtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH07XG4gICAgICBpbWFnZS5zcmMgPSB1cmw7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGV4dGVuc2lvbkZyb21NaW1lVHlwZShtaW1lVHlwZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIE1JTUVfTUFQW21pbWVUeXBlXSA/PyBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB0cmFzaElmRXhpc3RzKGZpbGU6IFRBYnN0cmFjdEZpbGUpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQudHJhc2goZmlsZSwgdHJ1ZSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2FybihcIkZhaWxlZCB0byB0cmFzaCBsb2NhbCBpbWFnZSBhZnRlciB1cGxvYWRcIiwgZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZm9ybWF0RW1iZWRMYWJlbChmaWxlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMudChgXHUzMDEwXHU1Qjg5XHU1MTY4XHU4RkRDXHU3QTBCXHU1NkZFXHU3MjQ3XHVGRjVDJHtmaWxlTmFtZX1cdTMwMTFgLCBgW1NlY3VyZSByZW1vdGUgaW1hZ2UgfCAke2ZpbGVOYW1lfV1gKTtcbiAgfVxuXG4gIHByaXZhdGUgZm9ybWF0RmFpbGVkTGFiZWwoZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLnQoYFx1MzAxMFx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NTkzMVx1OEQyNVx1RkY1QyR7ZmlsZU5hbWV9XHUzMDExYCwgYFtJbWFnZSB1cGxvYWQgZmFpbGVkIHwgJHtmaWxlTmFtZX1dYCk7XG4gIH1cblxuICBhc3luYyBtaWdyYXRlQWxsTGVnYWN5U2VjdXJlSW1hZ2VzKCkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB1cGxvYWRDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgICBjb25zdCBjYW5kaWRhdGVMb2NhbEltYWdlcyA9IG5ldyBNYXA8c3RyaW5nLCBURmlsZT4oKTtcbiAgICAgIGxldCBjaGFuZ2VkRmlsZXMgPSAwO1xuICAgICAgZm9yIChjb25zdCBmaWxlIG9mIHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKSkge1xuICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgICAgY29uc3QgcmVwbGFjZW1lbnRzID0gYXdhaXQgdGhpcy5idWlsZFVwbG9hZFJlcGxhY2VtZW50cyhjb250ZW50LCBmaWxlLCB1cGxvYWRDYWNoZSk7XG4gICAgICAgIGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgcmVwbGFjZW1lbnRzKSB7XG4gICAgICAgICAgaWYgKHJlcGxhY2VtZW50LnNvdXJjZUZpbGUpIHtcbiAgICAgICAgICAgIGNhbmRpZGF0ZUxvY2FsSW1hZ2VzLnNldChyZXBsYWNlbWVudC5zb3VyY2VGaWxlLnBhdGgsIHJlcGxhY2VtZW50LnNvdXJjZUZpbGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGxldCB1cGRhdGVkID0gY29udGVudDtcbiAgICAgICAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMpIHtcbiAgICAgICAgICB1cGRhdGVkID0gdXBkYXRlZC5zcGxpdChyZXBsYWNlbWVudC5vcmlnaW5hbCkuam9pbihyZXBsYWNlbWVudC5yZXdyaXR0ZW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlZCA9IHVwZGF0ZWRcbiAgICAgICAgICAucmVwbGFjZShcbiAgICAgICAgICAgIC88c3BhbiBjbGFzcz1cInNlY3VyZS13ZWJkYXYtZW1iZWRcIiBkYXRhLXNlY3VyZS13ZWJkYXY9XCIoW15cIl0rKVwiIGFyaWEtbGFiZWw9XCIoW15cIl0qKVwiPi4qPzxcXC9zcGFuPi9nLFxuICAgICAgICAgICAgKF9tYXRjaCwgcmVtb3RlUGF0aDogc3RyaW5nLCBhbHQ6IHN0cmluZykgPT5cbiAgICAgICAgICAgICAgdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayhcbiAgICAgICAgICAgICAgICB0aGlzLnVuZXNjYXBlSHRtbChyZW1vdGVQYXRoKSxcbiAgICAgICAgICAgICAgICB0aGlzLnVuZXNjYXBlSHRtbChhbHQpIHx8IHRoaXMudW5lc2NhcGVIdG1sKHJlbW90ZVBhdGgpLFxuICAgICAgICAgICAgICApLFxuICAgICAgICAgIClcbiAgICAgICAgICAucmVwbGFjZShcbiAgICAgICAgICAgIC8hXFxbW15cXF1dKl1cXCh3ZWJkYXYtc2VjdXJlOlxcL1xcLyhbXildKylcXCkvZyxcbiAgICAgICAgICAgIChfbWF0Y2gsIHJlbW90ZVBhdGg6IHN0cmluZykgPT5cbiAgICAgICAgICAgICAgdGhpcy5pbWFnZVN1cHBvcnQuYnVpbGRTZWN1cmVJbWFnZUNvZGVCbG9jayh0aGlzLnVuZXNjYXBlSHRtbChyZW1vdGVQYXRoKSwgdGhpcy51bmVzY2FwZUh0bWwocmVtb3RlUGF0aCkpLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgaWYgKHVwZGF0ZWQgPT09IGNvbnRlbnQpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB1cGRhdGVkKTtcbiAgICAgICAgY2hhbmdlZEZpbGVzICs9IDE7XG4gICAgICB9XG5cbiAgICAgIGlmIChjaGFuZ2VkRmlsZXMgPT09IDApIHtcbiAgICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgICB0aGlzLnQoXG4gICAgICAgICAgICBcIlx1NjU3NFx1NUU5M1x1OTFDQ1x1NkNBMVx1NjcwOVx1NTNEMVx1NzNCMFx1NTNFRlx1OEZDMVx1NzlGQlx1NzY4NFx1NjVFN1x1NzI0OFx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NjgwN1x1N0I3RVx1MzAwMlwiLFxuICAgICAgICAgICAgXCJObyBsZWdhY3kgc2VjdXJlIGltYWdlIHRhZ3Mgd2VyZSBmb3VuZCBpbiB0aGUgdmF1bHQuXCIsXG4gICAgICAgICAgKSxcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5kZWxldGVMb2NhbEFmdGVyVXBsb2FkKSB7XG4gICAgICAgIGF3YWl0IHRoaXMudHJhc2hNaWdyYXRlZEltYWdlc0lmU2FmZShjYW5kaWRhdGVMb2NhbEltYWdlcyk7XG4gICAgICB9XG5cbiAgICAgIG5ldyBOb3RpY2UoXG4gICAgICB0aGlzLnQoXG4gICAgICAgIGBcdTVERjJcdThGQzFcdTc5RkIgJHtjaGFuZ2VkRmlsZXN9IFx1N0JDN1x1N0IxNFx1OEJCMFx1NTIzMFx1NjVCMFx1NzY4NFx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NEVFM1x1NzgwMVx1NTc1N1x1NjgzQ1x1NUYwRlx1MzAwMmAsXG4gICAgICAgIGBNaWdyYXRlZCAke2NoYW5nZWRGaWxlc30gbm90ZShzKSB0byB0aGUgbmV3IHNlY3VyZSBpbWFnZSBjb2RlLWJsb2NrIGZvcm1hdC5gLFxuICAgICAgKSxcbiAgICAgICAgODAwMCxcbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbWlncmF0ZSBzZWN1cmUgaW1hZ2VzIHRvIGNvZGUgYmxvY2tzXCIsIGVycm9yKTtcbiAgICAgIG5ldyBOb3RpY2UodGhpcy5kZXNjcmliZUVycm9yKHRoaXMudChcIlx1OEZDMVx1NzlGQlx1NUI4OVx1NTE2OFx1NTZGRVx1NzI0N1x1NjgzQ1x1NUYwRlx1NTkzMVx1OEQyNVwiLCBcIkZhaWxlZCB0byBtaWdyYXRlIHNlY3VyZSBpbWFnZSBmb3JtYXRcIiksIGVycm9yKSwgODAwMCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB0cmFzaE1pZ3JhdGVkSW1hZ2VzSWZTYWZlKGNhbmRpZGF0ZUxvY2FsSW1hZ2VzOiBNYXA8c3RyaW5nLCBURmlsZT4pIHtcbiAgICBpZiAoY2FuZGlkYXRlTG9jYWxJbWFnZXMuc2l6ZSA9PT0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHJlbWFpbmluZ1JlZnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBmb3IgKGNvbnN0IG5vdGUgb2YgdGhpcy5hcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpKSB7XG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChub3RlKTtcbiAgICAgIGNvbnN0IHdpa2lNYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtcXFsoW15cXF1dKylcXF1cXF0vZyldO1xuICAgICAgY29uc3QgbWFya2Rvd25NYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoLyFcXFtbXlxcXV0qXVxcKChbXildKylcXCkvZyldO1xuXG4gICAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIHdpa2lNYXRjaGVzKSB7XG4gICAgICAgIGNvbnN0IHJhd0xpbmsgPSBtYXRjaFsxXS5zcGxpdChcInxcIilbMF0udHJpbSgpO1xuICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnJlc29sdmVMaW5rZWRGaWxlKHJhd0xpbmssIG5vdGUucGF0aCk7XG4gICAgICAgIGlmICh0YXJnZXQgJiYgdGhpcy5pc0ltYWdlRmlsZSh0YXJnZXQpKSB7XG4gICAgICAgICAgcmVtYWluaW5nUmVmcy5hZGQodGFyZ2V0LnBhdGgpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWFya2Rvd25NYXRjaGVzKSB7XG4gICAgICAgIGNvbnN0IHJhd0xpbmsgPSBkZWNvZGVVUklDb21wb25lbnQobWF0Y2hbMV0udHJpbSgpLnJlcGxhY2UoL148fD4kL2csIFwiXCIpKTtcbiAgICAgICAgaWYgKC9eKGh0dHBzPzp8d2ViZGF2LXNlY3VyZTp8ZGF0YTopL2kudGVzdChyYXdMaW5rKSkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5yZXNvbHZlTGlua2VkRmlsZShyYXdMaW5rLCBub3RlLnBhdGgpO1xuICAgICAgICBpZiAodGFyZ2V0ICYmIHRoaXMuaXNJbWFnZUZpbGUodGFyZ2V0KSkge1xuICAgICAgICAgIHJlbWFpbmluZ1JlZnMuYWRkKHRhcmdldC5wYXRoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgW3BhdGgsIGZpbGVdIG9mIGNhbmRpZGF0ZUxvY2FsSW1hZ2VzLmVudHJpZXMoKSkge1xuICAgICAgaWYgKHJlbWFpbmluZ1JlZnMuaGFzKHBhdGgpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLnRyYXNoSWZFeGlzdHMoZmlsZSk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgcnVuQ29ubmVjdGlvblRlc3Qoc2hvd01vZGFsID0gZmFsc2UpIHtcbiAgICB0cnkge1xuICAgICAgdGhpcy5lbnN1cmVDb25maWd1cmVkKCk7XG5cbiAgICAgIGNvbnN0IHByb2JlTmFtZSA9IGAuc2VjdXJlLXdlYmRhdi1wcm9iZS0ke0RhdGUubm93KCl9LnR4dGA7XG4gICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5idWlsZFJlbW90ZVBhdGgocHJvYmVOYW1lKTtcbiAgICAgIGNvbnN0IHVwbG9hZFVybCA9IHRoaXMuYnVpbGRVcGxvYWRVcmwocmVtb3RlUGF0aCk7XG4gICAgICBjb25zdCBwcm9iZUFycmF5QnVmZmVyID0gdGhpcy5lbmNvZGVVdGY4KGBzZWN1cmUtd2ViZGF2IHByb2JlICR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpfWApO1xuXG4gICAgICBjb25zdCBwdXRSZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdXBsb2FkVXJsLFxuICAgICAgICBtZXRob2Q6IFwiUFVUXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwidGV4dC9wbGFpbjsgY2hhcnNldD11dGYtOFwiLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBwcm9iZUFycmF5QnVmZmVyLFxuICAgICAgfSk7XG4gICAgICBpZiAocHV0UmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHB1dFJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBQVVQgZmFpbGVkIHdpdGggc3RhdHVzICR7cHV0UmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBnZXRSZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdXBsb2FkVXJsLFxuICAgICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgICBpZiAoZ2V0UmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IGdldFJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBHRVQgZmFpbGVkIHdpdGggc3RhdHVzICR7Z2V0UmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBkZWxldGVSZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFVybCh7XG4gICAgICAgIHVybDogdXBsb2FkVXJsLFxuICAgICAgICBtZXRob2Q6IFwiREVMRVRFXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiB0aGlzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgICBpZiAoZGVsZXRlUmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IGRlbGV0ZVJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBERUxFVEUgZmFpbGVkIHdpdGggc3RhdHVzICR7ZGVsZXRlUmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBtZXNzYWdlID0gdGhpcy50KFxuICAgICAgICBgV2ViREFWIFx1NkQ0Qlx1OEJENVx1OTAxQVx1OEZDN1x1MzAwMlBVVCAke3B1dFJlc3BvbnNlLnN0YXR1c31cdUZGMENHRVQgJHtnZXRSZXNwb25zZS5zdGF0dXN9XHVGRjBDREVMRVRFICR7ZGVsZXRlUmVzcG9uc2Uuc3RhdHVzfVx1MzAwMmAsXG4gICAgICAgIGBXZWJEQVYgdGVzdCBwYXNzZWQuIFBVVCAke3B1dFJlc3BvbnNlLnN0YXR1c30sIEdFVCAke2dldFJlc3BvbnNlLnN0YXR1c30sIERFTEVURSAke2RlbGV0ZVJlc3BvbnNlLnN0YXR1c30uYCxcbiAgICAgICk7XG4gICAgICBuZXcgTm90aWNlKG1lc3NhZ2UsIDYwMDApO1xuICAgICAgaWYgKHNob3dNb2RhbCkge1xuICAgICAgICBuZXcgUmVzdWx0TW9kYWwodGhpcy5hcHAsIHRoaXMudChcIldlYkRBViBcdThGREVcdTYzQTVcIiwgXCJXZWJEQVYgQ29ubmVjdGlvblwiKSwgbWVzc2FnZSkub3BlbigpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWN1cmUgV2ViREFWIHRlc3QgZmFpbGVkXCIsIGVycm9yKTtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSB0aGlzLmRlc2NyaWJlRXJyb3IodGhpcy50KFwiV2ViREFWIFx1NkQ0Qlx1OEJENVx1NTkzMVx1OEQyNVwiLCBcIldlYkRBViB0ZXN0IGZhaWxlZFwiKSwgZXJyb3IpO1xuICAgICAgbmV3IE5vdGljZShtZXNzYWdlLCA4MDAwKTtcbiAgICAgIGlmIChzaG93TW9kYWwpIHtcbiAgICAgICAgbmV3IFJlc3VsdE1vZGFsKHRoaXMuYXBwLCB0aGlzLnQoXCJXZWJEQVYgXHU4RkRFXHU2M0E1XCIsIFwiV2ViREFWIENvbm5lY3Rpb25cIiksIG1lc3NhZ2UpLm9wZW4oKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGRlc2NyaWJlRXJyb3IocHJlZml4OiBzdHJpbmcsIGVycm9yOiB1bmtub3duKSB7XG4gICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcbiAgICByZXR1cm4gYCR7cHJlZml4fTogJHttZXNzYWdlfWA7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlcXVlc3RVcmwob3B0aW9uczoge1xuICAgIHVybDogc3RyaW5nO1xuICAgIG1ldGhvZDogc3RyaW5nO1xuICAgIGhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICAgIGJvZHk/OiBBcnJheUJ1ZmZlcjtcbiAgICBmb2xsb3dSZWRpcmVjdHM/OiBib29sZWFuO1xuICAgIHJlZGlyZWN0Q291bnQ/OiBudW1iZXI7XG4gIH0pOiBQcm9taXNlPHsgc3RhdHVzOiBudW1iZXI7IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47IGFycmF5QnVmZmVyOiBBcnJheUJ1ZmZlciB9PiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBvYnNpZGlhblJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiBvcHRpb25zLnVybCxcbiAgICAgIG1ldGhvZDogb3B0aW9ucy5tZXRob2QsXG4gICAgICBoZWFkZXJzOiBvcHRpb25zLmhlYWRlcnMsXG4gICAgICBib2R5OiBvcHRpb25zLmJvZHksXG4gICAgICB0aHJvdzogZmFsc2UsXG4gICAgfSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiByZXNwb25zZS5zdGF0dXMsXG4gICAgICBoZWFkZXJzOiByZXNwb25zZS5oZWFkZXJzLFxuICAgICAgYXJyYXlCdWZmZXI6IHJlc3BvbnNlLmFycmF5QnVmZmVyLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGVuY29kZVV0ZjgodmFsdWU6IHN0cmluZykge1xuICAgIGNvbnN0IGJ5dGVzID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKHZhbHVlKTtcbiAgICByZXR1cm4gYnl0ZXMuYnVmZmVyLnNsaWNlKGJ5dGVzLmJ5dGVPZmZzZXQsIGJ5dGVzLmJ5dGVPZmZzZXQgKyBieXRlcy5ieXRlTGVuZ3RoKSBhcyBBcnJheUJ1ZmZlcjtcbiAgfVxuXG4gIHByaXZhdGUgZGVjb2RlVXRmOChidWZmZXI6IEFycmF5QnVmZmVyKSB7XG4gICAgcmV0dXJuIG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShidWZmZXIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjb21wdXRlU2hhMjU2SGV4KGJ1ZmZlcjogQXJyYXlCdWZmZXIpIHtcbiAgICBjb25zdCBkaWdlc3QgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRpZ2VzdChcIlNIQS0yNTZcIiwgYnVmZmVyKTtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShuZXcgVWludDhBcnJheShkaWdlc3QpKVxuICAgICAgLm1hcCgodmFsdWUpID0+IHZhbHVlLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCBcIjBcIikpXG4gICAgICAuam9pbihcIlwiKTtcbiAgfVxufVxuXG50eXBlIFVwbG9hZFJld3JpdGUgPSB7XG4gIG9yaWdpbmFsOiBzdHJpbmc7XG4gIHJld3JpdHRlbjogc3RyaW5nO1xuICBzb3VyY2VGaWxlPzogVEZpbGU7XG59O1xuXG5jbGFzcyBTZWN1cmVXZWJkYXZTZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XG4gIHBsdWdpbjogU2VjdXJlV2ViZGF2SW1hZ2VzUGx1Z2luO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IFNlY3VyZVdlYmRhdkltYWdlc1BsdWdpbikge1xuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgfVxuXG4gIGRpc3BsYXkoKTogdm9pZCB7XG4gICAgY29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xuXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiU2VjdXJlIFdlYkRBViBJbWFnZXNcIiB9KTtcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcInBcIiwge1xuICAgICAgdGV4dDogdGhpcy5wbHVnaW4udChcbiAgICAgICAgXCJcdThGRDlcdTRFMkFcdTYzRDJcdTRFRjZcdTUzRUFcdTYyOEFcdTU2RkVcdTcyNDdcdTUyNjVcdTc5QkJcdTUyMzBcdTUzNTVcdTcyRUNcdTc2ODRcdThGRENcdTdBRUZcdTc2RUVcdTVGNTVcdUZGMENcdTVFNzZcdTRGRERcdTVCNThcdTRFM0Egc2VjdXJlLXdlYmRhdiBcdTgxRUFcdTVCOUFcdTRFNDlcdTRFRTNcdTc4MDFcdTU3NTdcdUZGMUJcdTUxNzZcdTRFRDZcdTdCMTRcdThCQjBcdTU0OENcdTk2NDRcdTRFRjZcdTYzMDlcdTUzOUZcdThERUZcdTVGODRcdTUzOUZcdTY4MzdcdTU0MENcdTZCNjVcdTMwMDJcIixcbiAgICAgICAgXCJUaGlzIHBsdWdpbiBzZXBhcmF0ZXMgb25seSBpbWFnZXMgaW50byBhIGRlZGljYXRlZCByZW1vdGUgZm9sZGVyIGFuZCBzdG9yZXMgdGhlbSBhcyBzZWN1cmUtd2ViZGF2IGN1c3RvbSBjb2RlIGJsb2Nrcy4gTm90ZXMgYW5kIG90aGVyIGF0dGFjaG1lbnRzIGFyZSBzeW5jZWQgYXMtaXMgd2l0aCB0aGVpciBvcmlnaW5hbCBwYXRocy5cIixcbiAgICAgICksXG4gICAgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTVGNTNcdTUyNERcdTYzRDJcdTRFRjZcdTcyNDhcdTY3MkNcIiwgXCJDdXJyZW50IHBsdWdpbiB2ZXJzaW9uXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTU5MUFcdTdBRUZcdTRGN0ZcdTc1MjhcdTY1RjZcdTUzRUZcdTUxNDhcdTY4MzhcdTVCRjlcdThGRDlcdTkxQ0NcdTc2ODRcdTcyNDhcdTY3MkNcdTUzRjdcdUZGMENcdTkwN0ZcdTUxNERcdTU2RTBcdTRFM0FcdTVCQTJcdTYyMzdcdTdBRUZcdTUzNDdcdTdFQTdcdTRFMERcdTUyMzBcdTRGNERcdTVCRkNcdTgxRjRcdTg4NENcdTRFM0FcdTRFMERcdTRFMDBcdTgxRjRcdTMwMDJcIixcbiAgICAgICAgICBcIkNoZWNrIHRoaXMgdmVyc2lvbiBmaXJzdCBhY3Jvc3MgZGV2aWNlcyB0byBhdm9pZCBpbmNvbnNpc3RlbnQgYmVoYXZpb3IgY2F1c2VkIGJ5IGluY29tcGxldGUgdXBncmFkZXMuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT4ge1xuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLm1hbmlmZXN0LnZlcnNpb24pO1xuICAgICAgICB0ZXh0LnNldERpc2FibGVkKHRydWUpO1xuICAgICAgfSk7XG5cbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy5wbHVnaW4udChcIlx1NzU0Q1x1OTc2Mlx1OEJFRFx1OEEwMFwiLCBcIkludGVyZmFjZSBsYW5ndWFnZVwiKSB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1OEJFRFx1OEEwMFwiLCBcIkxhbmd1YWdlXCIpKVxuICAgICAgLnNldERlc2ModGhpcy5wbHVnaW4udChcIlx1OEJCRVx1N0Y2RVx1OTg3NVx1NjUyRlx1NjMwMVx1ODFFQVx1NTJBOFx1MzAwMVx1NEUyRFx1NjU4N1x1MzAwMVx1ODJGMVx1NjU4N1x1NTIwN1x1NjM2Mlx1MzAwMlwiLCBcIlN3aXRjaCB0aGUgc2V0dGluZ3MgVUkgYmV0d2VlbiBhdXRvLCBDaGluZXNlLCBhbmQgRW5nbGlzaC5cIikpXG4gICAgICAuYWRkRHJvcGRvd24oKGRyb3Bkb3duKSA9PlxuICAgICAgICBkcm9wZG93blxuICAgICAgICAgIC5hZGRPcHRpb24oXCJhdXRvXCIsIHRoaXMucGx1Z2luLnQoXCJcdTgxRUFcdTUyQThcIiwgXCJBdXRvXCIpKVxuICAgICAgICAgIC5hZGRPcHRpb24oXCJ6aFwiLCBcIlx1NEUyRFx1NjU4N1wiKVxuICAgICAgICAgIC5hZGRPcHRpb24oXCJlblwiLCBcIkVuZ2xpc2hcIilcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubGFuZ3VhZ2UpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubGFuZ3VhZ2UgPSB2YWx1ZSBhcyBcImF1dG9cIiB8IFwiemhcIiB8IFwiZW5cIjtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMucGx1Z2luLnQoXCJcdThGREVcdTYzQTVcdThCQkVcdTdGNkVcIiwgXCJDb25uZWN0aW9uXCIpIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiV2ViREFWIFx1NTdGQVx1Nzg0MFx1NTczMFx1NTc0MFwiLCBcIldlYkRBViBiYXNlIFVSTFwiKSlcbiAgICAgIC5zZXREZXNjKHRoaXMucGx1Z2luLnQoXCJcdTY3MERcdTUyQTFcdTU2NjhcdTU3RkFcdTc4NDBcdTU3MzBcdTU3NDBcdUZGMENcdTRGOEJcdTU5ODJcdUZGMUFodHRwOi8veW91ci13ZWJkYXYtaG9zdDpwb3J0XCIsIFwiQmFzZSBzZXJ2ZXIgVVJMLiBFeGFtcGxlOiBodHRwOi8veW91ci13ZWJkYXYtaG9zdDpwb3J0XCIpKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJodHRwOi8veW91ci13ZWJkYXYtaG9zdDpwb3J0XCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLndlYmRhdlVybClcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy53ZWJkYXZVcmwgPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdThEMjZcdTUzRjdcIiwgXCJVc2VybmFtZVwiKSlcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZXJuYW1lKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VybmFtZSA9IHZhbHVlLnRyaW0oKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU1QkM2XHU3ODAxXCIsIFwiUGFzc3dvcmRcIikpXG4gICAgICAuc2V0RGVzYyh0aGlzLnBsdWdpbi50KFwiXHU5RUQ4XHU4QkE0XHU5NjkwXHU4NUNGXHVGRjBDXHU1M0VGXHU3MEI5XHU1MUZCXHU1M0YzXHU0RkE3XHU2MzA5XHU5NEFFXHU2NjNFXHU3OTNBXHU2MjE2XHU5NjkwXHU4NUNGXHUzMDAyXCIsIFwiSGlkZGVuIGJ5IGRlZmF1bHQuIFVzZSB0aGUgYnV0dG9uIG9uIHRoZSByaWdodCB0byBzaG93IG9yIGhpZGUgaXQuXCIpKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+IHtcbiAgICAgICAgdGV4dC5pbnB1dEVsLnR5cGUgPSBcInBhc3N3b3JkXCI7XG4gICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucGFzc3dvcmQpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnBhc3N3b3JkID0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC5hZGRFeHRyYUJ1dHRvbigoYnV0dG9uKSA9PiB7XG4gICAgICAgIGxldCB2aXNpYmxlID0gZmFsc2U7XG4gICAgICAgIGJ1dHRvbi5zZXRJY29uKFwiZXllXCIpO1xuICAgICAgICBidXR0b24uc2V0VG9vbHRpcCh0aGlzLnBsdWdpbi50KFwiXHU2NjNFXHU3OTNBXHU1QkM2XHU3ODAxXCIsIFwiU2hvdyBwYXNzd29yZFwiKSk7XG4gICAgICAgIGJ1dHRvbi5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICBjb25zdCBpbnB1dCA9IGJ1dHRvbi5leHRyYVNldHRpbmdzRWwucGFyZW50RWxlbWVudD8ucXVlcnlTZWxlY3RvcihcImlucHV0XCIpO1xuICAgICAgICAgIGlmICghKGlucHV0IGluc3RhbmNlb2YgSFRNTElucHV0RWxlbWVudCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB2aXNpYmxlID0gIXZpc2libGU7XG4gICAgICAgICAgaW5wdXQudHlwZSA9IHZpc2libGUgPyBcInRleHRcIiA6IFwicGFzc3dvcmRcIjtcbiAgICAgICAgICBidXR0b24uc2V0SWNvbih2aXNpYmxlID8gXCJleWUtb2ZmXCIgOiBcImV5ZVwiKTtcbiAgICAgICAgICBidXR0b24uc2V0VG9vbHRpcCh0aGlzLnBsdWdpbi50KHZpc2libGUgPyBcIlx1OTY5MFx1ODVDRlx1NUJDNlx1NzgwMVwiIDogXCJcdTY2M0VcdTc5M0FcdTVCQzZcdTc4MDFcIiwgdmlzaWJsZSA/IFwiSGlkZSBwYXNzd29yZFwiIDogXCJTaG93IHBhc3N3b3JkXCIpKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NTZGRVx1NzI0N1x1OEZEQ1x1N0EwQlx1NzZFRVx1NUY1NVwiLCBcIkltYWdlIHJlbW90ZSBmb2xkZXJcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1NEUxM1x1OTVFOFx1NzUyOFx1NEU4RVx1NUI1OFx1NjUzRVx1OEZEQ1x1N0EwQlx1NTZGRVx1NzI0N1x1NzY4NCBXZWJEQVYgXHU3NkVFXHU1RjU1XHVGRjBDXHU0RjhCXHU1OTgyXHVGRjFBL3JlbW90ZS1pbWFnZXMvXHUzMDAyXHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHU2MjEwXHU1MjlGXHU1NDBFXHU0RjFBXHU3QUNCXHU1MzczXHU1MjIwXHU5NjY0XHU2NzJDXHU1NzMwXHU1NkZFXHU3MjQ3XHU2NTg3XHU0RUY2XHUzMDAyXCIsXG4gICAgICAgICAgXCJEZWRpY2F0ZWQgV2ViREFWIGZvbGRlciBmb3IgcmVtb3RlIGltYWdlcywgZm9yIGV4YW1wbGU6IC9yZW1vdGUtaW1hZ2VzLy4gTG9jYWwgaW1hZ2UgZmlsZXMgYXJlIGRlbGV0ZWQgaW1tZWRpYXRlbHkgYWZ0ZXIgdXBsb2FkIHN1Y2NlZWRzLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucmVtb3RlRm9sZGVyKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZW1vdGVGb2xkZXIgPSBub3JtYWxpemVQYXRoKHZhbHVlLnRyaW0oKSB8fCBcIi9yZW1vdGUtaW1hZ2VzL1wiKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU2RDRCXHU4QkQ1XHU4RkRFXHU2M0E1XCIsIFwiVGVzdCBjb25uZWN0aW9uXCIpKVxuICAgICAgLnNldERlc2ModGhpcy5wbHVnaW4udChcIlx1NEY3Rlx1NzUyOFx1NEUzNFx1NjVGNlx1NjNBMlx1OTQ4OFx1NjU4N1x1NEVGNlx1OUE4Q1x1OEJDMSBQVVRcdTMwMDFHRVRcdTMwMDFERUxFVEUgXHU2NjJGXHU1NDI2XHU2QjYzXHU1RTM4XHUzMDAyXCIsIFwiVmVyaWZ5IFBVVCwgR0VULCBhbmQgREVMRVRFIHVzaW5nIGEgdGVtcG9yYXJ5IHByb2JlIGZpbGUuXCIpKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dCh0aGlzLnBsdWdpbi50KFwiXHU1RjAwXHU1OUNCXHU2RDRCXHU4QkQ1XCIsIFwiUnVuIHRlc3RcIikpLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZCh0cnVlKTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ucnVuQ29ubmVjdGlvblRlc3QodHJ1ZSk7XG4gICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZChmYWxzZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdGhpcy5wbHVnaW4udChcIlx1NTQwQ1x1NkI2NVx1OEJCRVx1N0Y2RVwiLCBcIlN5bmNcIikgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdThGRENcdTdBMEJcdTdCMTRcdThCQjBcdTc2RUVcdTVGNTVcIiwgXCJSZW1vdGUgbm90ZXMgZm9sZGVyXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTc1MjhcdTRFOEVcdTVCNThcdTY1M0VcdTdCMTRcdThCQjBcdTU0OENcdTUxNzZcdTRFRDZcdTk3NUVcdTU2RkVcdTcyNDdcdTk2NDRcdTRFRjZcdTUzOUZcdTY4MzdcdTU0MENcdTZCNjVcdTUyNkZcdTY3MkNcdTc2ODRcdThGRENcdTdBRUZcdTc2RUVcdTVGNTVcdUZGMENcdTRGOEJcdTU5ODJcdUZGMUEvdmF1bHQtc3luYy9cdTMwMDJcdTYzRDJcdTRFRjZcdTRGMUFcdTgxRUFcdTUyQThcdTU0MENcdTZCNjVcdTY1NzRcdTRFMkEgdmF1bHRcdUZGMENcdTVFNzZcdThERjNcdThGQzcgLm9ic2lkaWFuXHUzMDAxXHU2M0QyXHU0RUY2XHU3NkVFXHU1RjU1XHU1NDhDXHU1NkZFXHU3MjQ3XHU2NTg3XHU0RUY2XHUzMDAyXCIsXG4gICAgICAgICAgXCJSZW1vdGUgZm9sZGVyIHVzZWQgZm9yIG5vdGVzIGFuZCBvdGhlciBub24taW1hZ2UgYXR0YWNobWVudHMgc3luY2VkIGFzLWlzLCBmb3IgZXhhbXBsZTogL3ZhdWx0LXN5bmMvLiBUaGUgcGx1Z2luIHN5bmNzIHRoZSB3aG9sZSB2YXVsdCBhbmQgYXV0b21hdGljYWxseSBza2lwcyAub2JzaWRpYW4sIHRoZSBwbHVnaW4gZGlyZWN0b3J5LCBhbmQgaW1hZ2UgZmlsZXMuXCIsXG4gICAgICAgICksXG4gICAgICApXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy52YXVsdFN5bmNSZW1vdGVGb2xkZXIpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnZhdWx0U3luY1JlbW90ZUZvbGRlciA9IG5vcm1hbGl6ZVBhdGgodmFsdWUudHJpbSgpIHx8IFwiL3ZhdWx0LXN5bmMvXCIpO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTRFMERcdTU0MENcdTZCNjVcdTc2RUVcdTVGNTVcIiwgXCJFeGNsdWRlZCBzeW5jIGZvbGRlcnNcIikpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgdGhpcy5wbHVnaW4udChcbiAgICAgICAgICBcIlx1OEZEOVx1NEU5QiB2YXVsdCBcdTc2RUVcdTVGNTVcdTRFMERcdTRGMUFcdTg4QUJcdTUxODVcdTVCQjlcdTU0MENcdTZCNjVcdTRFMEFcdTRGMjBcdTMwMDFcdTRFQ0VcdThGRENcdTdBRUZcdTYwNjJcdTU5MERcdTYyMTZcdThGREJcdTg4NENcdTc2RUVcdTVGNTVcdTVCRjlcdThEMjZcdTMwMDJcdTY1MkZcdTYzMDFcdTkwMTdcdTUzRjdcdTYyMTZcdTYzNjJcdTg4NENcdTUyMDZcdTk2OTRcdUZGMENcdTlFRDhcdThCQTRcdUZGMUFrYlx1MzAwMlwiLFxuICAgICAgICAgIFwiVGhlc2UgdmF1bHQgZm9sZGVycyBhcmUgbm90IHVwbG9hZGVkLCByZXN0b3JlZCBmcm9tIHJlbW90ZSwgb3IgcmVjb25jaWxlZCBhcyBkaXJlY3Rvcmllcy4gU2VwYXJhdGUgZW50cmllcyB3aXRoIGNvbW1hcyBvciBuZXcgbGluZXMuIERlZmF1bHQ6IGtiLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHRBcmVhKCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwia2JcIilcbiAgICAgICAgICAuc2V0VmFsdWUoKHRoaXMucGx1Z2luLnNldHRpbmdzLmV4Y2x1ZGVkU3luY0ZvbGRlcnMgPz8gW10pLmpvaW4oXCJcXG5cIikpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZXhjbHVkZWRTeW5jRm9sZGVycyA9IHZhbHVlLnNwbGl0KC9bLFxcbl0vKTtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLm5vcm1hbGl6ZUVmZmVjdGl2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKHRoaXMucGx1Z2luLnQoXCJcdTgxRUFcdTUyQThcdTU0MENcdTZCNjVcdTk4OTFcdTczODdcIiwgXCJBdXRvIHN5bmMgZnJlcXVlbmN5XCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTRFRTVcdTUyMDZcdTk0OUZcdTRFM0FcdTUzNTVcdTRGNERcdThCQkVcdTdGNkVcdTgxRUFcdTUyQThcdTU0MENcdTZCNjVcdTY1RjZcdTk1RjRcdTMwMDJcdTU4NkIgMCBcdTg4NjhcdTc5M0FcdTUxNzNcdTk1RURcdTgxRUFcdTUyQThcdTU0MENcdTZCNjVcdTMwMDJcdThGRDlcdTkxQ0NcdTc2ODRcdTgxRUFcdTUyQThcdTU0MENcdTZCNjVcdTYyNjdcdTg4NENcdTIwMUNcdTVCOENcdTY1NzRcdTU0MENcdTZCNjVcdTIwMURcdUZGMUFcdTRGMUFcdTY4QzBcdTY3RTVcdTY3MkNcdTU3MzBcdTRFMEVcdThGRENcdTdBRUZcdTVERUVcdTVGMDJcdUZGMENcdTRFMEFcdTRGMjBcdTY3MkNcdTU3MzBcdTUzRDhcdTY2RjRcdUZGMENcdTVFNzZcdTYyQzlcdTUzRDZcdThGRENcdTdBRUZcdTY2RjRcdTY1QjBcdTMwMDJcIixcbiAgICAgICAgICBcIlNldCB0aGUgYXV0b21hdGljIHN5bmMgaW50ZXJ2YWwgaW4gbWludXRlcy4gVXNlIDAgdG8gdHVybiBpdCBvZmYuIEF1dG8gc3luYyBydW5zIHRoZSBmdWxsIHN5bmMgZmxvdzogaXQgY2hlY2tzIGxvY2FsIGFuZCByZW1vdGUgZGlmZmVyZW5jZXMsIHVwbG9hZHMgbG9jYWwgY2hhbmdlcywgYW5kIHB1bGxzIHJlbW90ZSB1cGRhdGVzLlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCIwXCIpXG4gICAgICAgICAgLnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvU3luY0ludGVydmFsTWludXRlcykpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gTnVtYmVyLnBhcnNlSW50KHZhbHVlLCAxMCk7XG4gICAgICAgICAgICBpZiAoIU51bWJlci5pc05hTihwYXJzZWQpKSB7XG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9TeW5jSW50ZXJ2YWxNaW51dGVzID0gTWF0aC5tYXgoMCwgcGFyc2VkKTtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU3QjE0XHU4QkIwXHU2NzJDXHU1NzMwXHU0RkREXHU3NTU5XHU2QTIxXHU1RjBGXCIsIFwiTm90ZSBsb2NhbCByZXRlbnRpb24gbW9kZVwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU1QjhDXHU2NTc0XHU2NzJDXHU1NzMwXHVGRjFBXHU3QjE0XHU4QkIwXHU1OUNCXHU3RUM4XHU0RkREXHU3NTU5XHU1NzI4XHU2NzJDXHU1NzMwXHUzMDAyXHU2MzA5XHU5NzAwXHU1MkEwXHU4RjdEXHU3QjE0XHU4QkIwXHVGRjFBXHU5NTdGXHU2NzFGXHU2NzJBXHU4QkJGXHU5NUVFXHU3Njg0IE1hcmtkb3duIFx1N0IxNFx1OEJCMFx1NEYxQVx1ODhBQlx1NjZGRlx1NjM2Mlx1NEUzQVx1NjcyQ1x1NTczMFx1NTM2MFx1NEY0RFx1NjU4N1x1NEVGNlx1RkYwQ1x1NjI1M1x1NUYwMFx1NjVGNlx1NTE4RFx1NEVDRVx1OEZEQ1x1N0FFRlx1NjA2Mlx1NTkwRFx1MzAwMlwiLFxuICAgICAgICAgIFwiRnVsbCBsb2NhbDogbm90ZXMgYWx3YXlzIHN0YXkgbG9jYWwuIExhenkgbm90ZXM6IHN0YWxlIE1hcmtkb3duIG5vdGVzIGFyZSByZXBsYWNlZCB3aXRoIGxvY2FsIHBsYWNlaG9sZGVyIGZpbGVzIGFuZCByZXN0b3JlZCBmcm9tIHJlbW90ZSB3aGVuIG9wZW5lZC5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGREcm9wZG93bigoZHJvcGRvd24pID0+XG4gICAgICAgIGRyb3Bkb3duXG4gICAgICAgICAgLmFkZE9wdGlvbihcImZ1bGwtbG9jYWxcIiwgdGhpcy5wbHVnaW4udChcIlx1NUI4Q1x1NjU3NFx1NjcyQ1x1NTczMFwiLCBcIkZ1bGwgbG9jYWxcIikpXG4gICAgICAgICAgLmFkZE9wdGlvbihcImxhenktbm90ZXNcIiwgdGhpcy5wbHVnaW4udChcIlx1NjMwOVx1OTcwMFx1NTJBMFx1OEY3RFx1N0IxNFx1OEJCMFwiLCBcIkxhenkgbm90ZXNcIikpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVTdG9yYWdlTW9kZSlcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub3RlU3RvcmFnZU1vZGUgPSB2YWx1ZSBhcyBcImZ1bGwtbG9jYWxcIiB8IFwibGF6eS1ub3Rlc1wiO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSh0aGlzLnBsdWdpbi50KFwiXHU3QjE0XHU4QkIwXHU2NzJDXHU1NzMwXHU1NkRFXHU2NTM2XHU1OTI5XHU2NTcwXCIsIFwiTm90ZSBldmljdGlvbiBkYXlzXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgXCJcdTRFQzVcdTU3MjhcdTIwMUNcdTYzMDlcdTk3MDBcdTUyQTBcdThGN0RcdTdCMTRcdThCQjBcdTIwMURcdTZBMjFcdTVGMEZcdTRFMEJcdTc1MUZcdTY1NDhcdTMwMDJcdThEODVcdThGQzdcdThGRDlcdTRFMkFcdTU5MjlcdTY1NzBcdTY3MkFcdTYyNTNcdTVGMDBcdTc2ODQgTWFya2Rvd24gXHU3QjE0XHU4QkIwXHVGRjBDXHU0RjFBXHU1NzI4XHU1NDBDXHU2QjY1XHU1NDBFXHU4OEFCXHU2NkZGXHU2MzYyXHU0RTNBXHU2NzJDXHU1NzMwXHU1MzYwXHU0RjREXHU2NTg3XHU0RUY2XHUzMDAyXCIsXG4gICAgICAgICAgXCJVc2VkIG9ubHkgaW4gbGF6eSBub3RlIG1vZGUuIE1hcmtkb3duIG5vdGVzIG5vdCBvcGVuZWQgd2l0aGluIHRoaXMgbnVtYmVyIG9mIGRheXMgYXJlIHJlcGxhY2VkIHdpdGggbG9jYWwgcGxhY2Vob2xkZXIgZmlsZXMgYWZ0ZXIgc3luYy5cIixcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiMzBcIilcbiAgICAgICAgICAuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVFdmljdEFmdGVyRGF5cykpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gTnVtYmVyLnBhcnNlSW50KHZhbHVlLCAxMCk7XG4gICAgICAgICAgICBpZiAoIU51bWJlci5pc05hTihwYXJzZWQpKSB7XG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm5vdGVFdmljdEFmdGVyRGF5cyA9IE1hdGgubWF4KDEsIHBhcnNlZCk7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1NTQwQ1x1NkI2NVx1NzJCNlx1NjAwMVwiLCBcIlN5bmMgc3RhdHVzXCIpKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIHRoaXMucGx1Z2luLnQoXG4gICAgICAgICAgYCR7dGhpcy5wbHVnaW4uZm9ybWF0TGFzdFN5bmNMYWJlbCgpfVxcbiR7dGhpcy5wbHVnaW4uZm9ybWF0U3luY1N0YXR1c0xhYmVsKCl9XFxuJHt0aGlzLnBsdWdpbi50KFwiXHU4QkY0XHU2NjBFXHVGRjFBXHU1RkVCXHU5MDFGXHU1NDBDXHU2QjY1XHU1M0VBXHU4RDFGXHU4RDIzXHU0RTBBXHU0RjIwXHU2NzJDXHU1NzMwXHU2NUIwXHU1ODlFL1x1NEZFRVx1NjUzOVx1NjU4N1x1NEVGNlx1RkYwQ1x1NUU3Nlx1NTkwNFx1NzQwNlx1NjYwRVx1Nzg2RVx1NTIyMFx1OTY2NFx1OTYxRlx1NTIxN1x1RkYxQlx1NUI4Q1x1NjU3NFx1NTQwQ1x1NkI2NVx1NjI0RFx1NEYxQVx1NTQwQ1x1NjVGNlx1NEUwQVx1NEYyMFx1NjcyQ1x1NTczMFx1NTNEOFx1NjZGNFx1NUU3Nlx1NEUwQlx1OEY3RFx1OEZEQ1x1N0FFRlx1NjZGNFx1NjVCMFx1MzAwMlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NEVDRFx1NzUzMVx1NzJFQ1x1N0FDQlx1OTYxRlx1NTIxN1x1NTkwNFx1NzQwNlx1MzAwMlwiLCBcIk5vdGU6IEZhc3Qgc3luYyBvbmx5IHVwbG9hZHMgbG9jYWwgYWRkaXRpb25zL2VkaXRzIGFuZCBwcm9jZXNzZXMgZXhwbGljaXQgZGVsZXRpb24gcXVldWVzLiBGdWxsIHN5bmMgaXMgdGhlIG1vZGUgdGhhdCBib3RoIHVwbG9hZHMgbG9jYWwgY2hhbmdlcyBhbmQgZG93bmxvYWRzIHJlbW90ZSB1cGRhdGVzLiBJbWFnZSB1cGxvYWRzIGNvbnRpbnVlIHRvIGJlIGhhbmRsZWQgYnkgdGhlIHNlcGFyYXRlIHF1ZXVlLlwiKX1gLFxuICAgICAgICAgIGAke3RoaXMucGx1Z2luLmZvcm1hdExhc3RTeW5jTGFiZWwoKX1cXG4ke3RoaXMucGx1Z2luLmZvcm1hdFN5bmNTdGF0dXNMYWJlbCgpfVxcbiR7dGhpcy5wbHVnaW4udChcIlx1OEJGNFx1NjYwRVx1RkYxQVx1NUZFQlx1OTAxRlx1NTQwQ1x1NkI2NVx1NTNFQVx1OEQxRlx1OEQyM1x1NEUwQVx1NEYyMFx1NjcyQ1x1NTczMFx1NjVCMFx1NTg5RS9cdTRGRUVcdTY1MzlcdTY1ODdcdTRFRjZcdUZGMENcdTVFNzZcdTU5MDRcdTc0MDZcdTY2MEVcdTc4NkVcdTUyMjBcdTk2NjRcdTk2MUZcdTUyMTdcdUZGMUJcdTVCOENcdTY1NzRcdTU0MENcdTZCNjVcdTYyNERcdTRGMUFcdTU0MENcdTY1RjZcdTRFMEFcdTRGMjBcdTY3MkNcdTU3MzBcdTUzRDhcdTY2RjRcdTVFNzZcdTRFMEJcdThGN0RcdThGRENcdTdBRUZcdTY2RjRcdTY1QjBcdTMwMDJcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTRFQ0RcdTc1MzFcdTcyRUNcdTdBQ0JcdTk2MUZcdTUyMTdcdTU5MDRcdTc0MDZcdTMwMDJcIiwgXCJOb3RlOiBGYXN0IHN5bmMgb25seSB1cGxvYWRzIGxvY2FsIGFkZGl0aW9ucy9lZGl0cyBhbmQgcHJvY2Vzc2VzIGV4cGxpY2l0IGRlbGV0aW9uIHF1ZXVlcy4gRnVsbCBzeW5jIGlzIHRoZSBtb2RlIHRoYXQgYm90aCB1cGxvYWRzIGxvY2FsIGNoYW5nZXMgYW5kIGRvd25sb2FkcyByZW1vdGUgdXBkYXRlcy4gSW1hZ2UgdXBsb2FkcyBjb250aW51ZSB0byBiZSBoYW5kbGVkIGJ5IHRoZSBzZXBhcmF0ZSBxdWV1ZS5cIil9YCxcbiAgICAgICAgKSxcbiAgICAgIClcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodGhpcy5wbHVnaW4udChcIlx1NUZFQlx1OTAxRlx1NTQwQ1x1NkI2NVwiLCBcIkZhc3Qgc3luY1wiKSkub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKHRydWUpO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zeW5jUGVuZGluZ1ZhdWx0Q29udGVudCh0cnVlKTtcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQoZmFsc2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSksXG4gICAgICApXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KHRoaXMucGx1Z2luLnQoXCJcdTVCOENcdTY1NzRcdTVCRjlcdThEMjZcIiwgXCJGdWxsIHJlY29uY2lsZVwiKSkub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKHRydWUpO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zeW5jQ29uZmlndXJlZFZhdWx0Q29udGVudCh0cnVlKTtcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBidXR0b24uc2V0RGlzYWJsZWQoZmFsc2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMucGx1Z2luLnQoXCJcdTRFMDBcdTZCMjFcdTYwMjdcdTVERTVcdTUxNzdcIiwgXCJPbmUtdGltZSB0b29sc1wiKSB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUodGhpcy5wbHVnaW4udChcIlx1OEZDMVx1NzlGQlx1NjU3NFx1NUU5M1x1NTM5Rlx1NzUxRlx1NTZGRVx1NzI0N1x1NUYxNVx1NzUyOFwiLCBcIk1pZ3JhdGUgbmF0aXZlIGltYWdlIGVtYmVkcyBpbiB2YXVsdFwiKSlcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICB0aGlzLnBsdWdpbi50KFxuICAgICAgICAgIFwiXHU2MjZCXHU2M0NGXHU2NTc0XHU1RTkzXHU2MjQwXHU2NzA5IE1hcmtkb3duIFx1N0IxNFx1OEJCMFx1RkYwQ1x1NjI4QSBPYnNpZGlhbiBcdTUzOUZcdTc1MUZcdTY3MkNcdTU3MzBcdTU2RkVcdTcyNDdcdTVGMTVcdTc1MjhcdUZGMDhcdTU5ODIgIVtdKCkgXHU1NDhDICFbWy4uLl1dXHVGRjA5XHU0RTBBXHU0RjIwXHU1MjMwXHU4RkRDXHU3QUVGXHU1NkZFXHU3MjQ3XHU3NkVFXHU1RjU1XHVGRjBDXHU1RTc2XHU2NTM5XHU1MTk5XHU0RTNBIHNlY3VyZS13ZWJkYXYgXHU0RUUzXHU3ODAxXHU1NzU3XHUzMDAyXHU2NUU3XHU3MjQ4IHNwYW4gXHU1NDhDXHU2NUU5XHU2NzFGIHdlYmRhdi1zZWN1cmUgXHU5NEZFXHU2M0E1XHU0RTVGXHU0RjFBXHU0RTAwXHU1RTc2XHU2NTM2XHU2NTVCXHU1MjMwXHU2NUIwXHU2ODNDXHU1RjBGXHUzMDAyXCIsXG4gICAgICAgICAgXCJTY2FuIGFsbCBNYXJrZG93biBub3RlcyBpbiB0aGUgdmF1bHQsIHVwbG9hZCBuYXRpdmUgbG9jYWwgaW1hZ2UgZW1iZWRzIChzdWNoIGFzICFbXSgpIGFuZCAhW1suLi5dXSkgdG8gdGhlIHJlbW90ZSBpbWFnZSBmb2xkZXIsIGFuZCByZXdyaXRlIHRoZW0gYXMgc2VjdXJlLXdlYmRhdiBjb2RlIGJsb2Nrcy4gTGVnYWN5IHNwYW4gdGFncyBhbmQgZWFybHkgd2ViZGF2LXNlY3VyZSBsaW5rcyBhcmUgYWxzbyBub3JtYWxpemVkIHRvIHRoZSBuZXcgZm9ybWF0LlwiLFxuICAgICAgICApLFxuICAgICAgKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dCh0aGlzLnBsdWdpbi50KFwiXHU1RjAwXHU1OUNCXHU4RkMxXHU3OUZCXCIsIFwiUnVuIG1pZ3JhdGlvblwiKSkub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKHRydWUpO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5taWdyYXRlQWxsTGVnYWN5U2VjdXJlSW1hZ2VzKCk7XG4gICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZChmYWxzZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KSxcbiAgICAgICk7XG4gIH1cbn1cblxuY2xhc3MgUmVzdWx0TW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHByaXZhdGUgcmVhZG9ubHkgdGl0bGVUZXh0OiBzdHJpbmc7XG4gIHByaXZhdGUgcmVhZG9ubHkgYm9keVRleHQ6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgdGl0bGVUZXh0OiBzdHJpbmcsIGJvZHlUZXh0OiBzdHJpbmcpIHtcbiAgICBzdXBlcihhcHApO1xuICAgIHRoaXMudGl0bGVUZXh0ID0gdGl0bGVUZXh0O1xuICAgIHRoaXMuYm9keVRleHQgPSBib2R5VGV4dDtcbiAgfVxuXG4gIG9uT3BlbigpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb250ZW50RWwuZW1wdHkoKTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IHRoaXMudGl0bGVUZXh0IH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiB0aGlzLmJvZHlUZXh0IH0pO1xuICB9XG5cbiAgb25DbG9zZSgpOiB2b2lkIHtcbiAgICB0aGlzLmNvbnRlbnRFbC5lbXB0eSgpO1xuICB9XG59XG4iLCAiaW1wb3J0IHsgTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dCwgTWFya2Rvd25SZW5kZXJDaGlsZCB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5leHBvcnQgY29uc3QgU0VDVVJFX1BST1RPQ09MID0gXCJ3ZWJkYXYtc2VjdXJlOlwiO1xuZXhwb3J0IGNvbnN0IFNFQ1VSRV9DT0RFX0JMT0NLID0gXCJzZWN1cmUtd2ViZGF2XCI7XG5cbmV4cG9ydCB0eXBlIFNlY3VyZVdlYmRhdkltYWdlQmxvY2sgPSB7XG4gIHBhdGg6IHN0cmluZztcbiAgYWx0OiBzdHJpbmc7XG59O1xuXG50eXBlIFNlY3VyZVdlYmRhdkltYWdlU3VwcG9ydERlcHMgPSB7XG4gIHQ6ICh6aDogc3RyaW5nLCBlbjogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIGZldGNoU2VjdXJlSW1hZ2VCbG9iVXJsOiAocmVtb3RlUGF0aDogc3RyaW5nKSA9PiBQcm9taXNlPHN0cmluZz47XG59O1xuXG5jbGFzcyBTZWN1cmVXZWJkYXZSZW5kZXJDaGlsZCBleHRlbmRzIE1hcmtkb3duUmVuZGVyQ2hpbGQge1xuICBjb25zdHJ1Y3Rvcihjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBzdXBlcihjb250YWluZXJFbCk7XG4gIH1cblxuICBvbnVubG9hZCgpOiB2b2lkIHt9XG59XG5cbi8vIEtlZXAgc2VjdXJlIGltYWdlIHBhcnNpbmcgYW5kIHJlbmRlcmluZyBpc29sYXRlZCBzbyBzeW5jIGNoYW5nZXMgZG8gbm90XG4vLyBhY2NpZGVudGFsbHkgYnJlYWsgdGhlIGRpc3BsYXkgcGlwZWxpbmUgYWdhaW4uXG5leHBvcnQgY2xhc3MgU2VjdXJlV2ViZGF2SW1hZ2VTdXBwb3J0IHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBkZXBzOiBTZWN1cmVXZWJkYXZJbWFnZVN1cHBvcnREZXBzKSB7fVxuXG4gIGJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAocmVtb3RlVXJsOiBzdHJpbmcsIGFsdDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMuZXh0cmFjdFJlbW90ZVBhdGgocmVtb3RlVXJsKTtcbiAgICBpZiAoIXJlbW90ZVBhdGgpIHtcbiAgICAgIHJldHVybiBgIVtdKCR7cmVtb3RlVXJsfSlgO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmJ1aWxkU2VjdXJlSW1hZ2VDb2RlQmxvY2socmVtb3RlUGF0aCwgYWx0KTtcbiAgfVxuXG4gIGJ1aWxkU2VjdXJlSW1hZ2VDb2RlQmxvY2socmVtb3RlUGF0aDogc3RyaW5nLCBhbHQ6IHN0cmluZykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRBbHQgPSAoYWx0IHx8IHJlbW90ZVBhdGgpLnJlcGxhY2UoL1xccj9cXG4vZywgXCIgXCIpLnRyaW0oKTtcbiAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IHJlbW90ZVBhdGgucmVwbGFjZSgvXFxyP1xcbi9nLCBcIlwiKS50cmltKCk7XG4gICAgcmV0dXJuIFtgXFxgXFxgXFxgJHtTRUNVUkVfQ09ERV9CTE9DS31gLCBgcGF0aDogJHtub3JtYWxpemVkUGF0aH1gLCBgYWx0OiAke25vcm1hbGl6ZWRBbHR9YCwgXCJgYGBcIl0uam9pbihcIlxcblwiKTtcbiAgfVxuXG4gIHBhcnNlU2VjdXJlSW1hZ2VCbG9jayhzb3VyY2U6IHN0cmluZyk6IFNlY3VyZVdlYmRhdkltYWdlQmxvY2sgfCBudWxsIHtcbiAgICBjb25zdCByZXN1bHQ6IFNlY3VyZVdlYmRhdkltYWdlQmxvY2sgPSB7IHBhdGg6IFwiXCIsIGFsdDogXCJcIiB9O1xuICAgIGZvciAoY29uc3QgcmF3TGluZSBvZiBzb3VyY2Uuc3BsaXQoL1xccj9cXG4vKSkge1xuICAgICAgY29uc3QgbGluZSA9IHJhd0xpbmUudHJpbSgpO1xuICAgICAgaWYgKCFsaW5lKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzZXBhcmF0b3JJbmRleCA9IGxpbmUuaW5kZXhPZihcIjpcIik7XG4gICAgICBpZiAoc2VwYXJhdG9ySW5kZXggPT09IC0xKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBrZXkgPSBsaW5lLnNsaWNlKDAsIHNlcGFyYXRvckluZGV4KS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICAgIGNvbnN0IHZhbHVlID0gbGluZS5zbGljZShzZXBhcmF0b3JJbmRleCArIDEpLnRyaW0oKTtcbiAgICAgIGlmIChrZXkgPT09IFwicGF0aFwiKSB7XG4gICAgICAgIHJlc3VsdC5wYXRoID0gdmFsdWU7XG4gICAgICB9IGVsc2UgaWYgKGtleSA9PT0gXCJhbHRcIikge1xuICAgICAgICByZXN1bHQuYWx0ID0gdmFsdWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdC5wYXRoID8gcmVzdWx0IDogbnVsbDtcbiAgfVxuXG4gIGFzeW5jIHByb2Nlc3NTZWN1cmVJbWFnZXMoZWw6IEhUTUxFbGVtZW50LCBjdHg6IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQpIHtcbiAgICBjb25zdCBzZWN1cmVDb2RlQmxvY2tzID0gQXJyYXkuZnJvbShlbC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihgcHJlID4gY29kZS5sYW5ndWFnZS0ke1NFQ1VSRV9DT0RFX0JMT0NLfWApKTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgIHNlY3VyZUNvZGVCbG9ja3MubWFwKGFzeW5jIChjb2RlRWwpID0+IHtcbiAgICAgICAgY29uc3QgcHJlID0gY29kZUVsLnBhcmVudEVsZW1lbnQ7XG4gICAgICAgIGlmICghKHByZSBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSB8fCBwcmUuaGFzQXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2LXJlbmRlcmVkXCIpKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcGFyc2VkID0gdGhpcy5wYXJzZVNlY3VyZUltYWdlQmxvY2soY29kZUVsLnRleHRDb250ZW50ID8/IFwiXCIpO1xuICAgICAgICBpZiAoIXBhcnNlZD8ucGF0aCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHByZS5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNlY3VyZS13ZWJkYXYtcmVuZGVyZWRcIiwgXCJ0cnVlXCIpO1xuICAgICAgICBhd2FpdCB0aGlzLnJlbmRlclNlY3VyZUltYWdlSW50b0VsZW1lbnQocHJlLCBwYXJzZWQucGF0aCwgcGFyc2VkLmFsdCB8fCBwYXJzZWQucGF0aCk7XG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgY29uc3Qgc2VjdXJlTm9kZXMgPSBBcnJheS5mcm9tKGVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFwiW2RhdGEtc2VjdXJlLXdlYmRhdl1cIikpO1xuICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgc2VjdXJlTm9kZXMubWFwKGFzeW5jIChub2RlKSA9PiB7XG4gICAgICAgIGlmIChub2RlIGluc3RhbmNlb2YgSFRNTEltYWdlRWxlbWVudCkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuc3dhcEltYWdlU291cmNlKG5vZGUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSBub2RlLmdldEF0dHJpYnV0ZShcImRhdGEtc2VjdXJlLXdlYmRhdlwiKTtcbiAgICAgICAgaWYgKCFyZW1vdGVQYXRoKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgaW1nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImltZ1wiKTtcbiAgICAgICAgaW1nLmFsdCA9IG5vZGUuZ2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiKSA/PyBub2RlLmdldEF0dHJpYnV0ZShcImFsdFwiKSA/PyBcIlNlY3VyZSBXZWJEQVYgaW1hZ2VcIjtcbiAgICAgICAgaW1nLnNldEF0dHJpYnV0ZShcImRhdGEtc2VjdXJlLXdlYmRhdlwiLCByZW1vdGVQYXRoKTtcbiAgICAgICAgaW1nLmNsYXNzTGlzdC5hZGQoXCJzZWN1cmUtd2ViZGF2LWltYWdlXCIsIFwiaXMtbG9hZGluZ1wiKTtcbiAgICAgICAgbm9kZS5yZXBsYWNlV2l0aChpbWcpO1xuICAgICAgICBhd2FpdCB0aGlzLnN3YXBJbWFnZVNvdXJjZShpbWcpO1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIGNvbnN0IHNlY3VyZUxpbmtzID0gQXJyYXkuZnJvbShlbC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxJbWFnZUVsZW1lbnQ+KGBpbWdbc3JjXj1cIiR7U0VDVVJFX1BST1RPQ09MfS8vXCJdYCkpO1xuICAgIGF3YWl0IFByb21pc2UuYWxsKHNlY3VyZUxpbmtzLm1hcChhc3luYyAoaW1nKSA9PiB0aGlzLnN3YXBJbWFnZVNvdXJjZShpbWcpKSk7XG5cbiAgICBjdHguYWRkQ2hpbGQobmV3IFNlY3VyZVdlYmRhdlJlbmRlckNoaWxkKGVsKSk7XG4gIH1cblxuICBhc3luYyBwcm9jZXNzU2VjdXJlQ29kZUJsb2NrKHNvdXJjZTogc3RyaW5nLCBlbDogSFRNTEVsZW1lbnQsIGN0eDogTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dCkge1xuICAgIGNvbnN0IHBhcnNlZCA9IHRoaXMucGFyc2VTZWN1cmVJbWFnZUJsb2NrKHNvdXJjZSk7XG4gICAgaWYgKCFwYXJzZWQ/LnBhdGgpIHtcbiAgICAgIGVsLmNyZWF0ZUVsKFwiZGl2XCIsIHtcbiAgICAgICAgdGV4dDogdGhpcy5kZXBzLnQoXCJcdTVCODlcdTUxNjhcdTU2RkVcdTcyNDdcdTRFRTNcdTc4MDFcdTU3NTdcdTY4M0NcdTVGMEZcdTY1RTBcdTY1NDhcdTMwMDJcIiwgXCJJbnZhbGlkIHNlY3VyZSBpbWFnZSBjb2RlIGJsb2NrIGZvcm1hdC5cIiksXG4gICAgICB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLnJlbmRlclNlY3VyZUltYWdlSW50b0VsZW1lbnQoZWwsIHBhcnNlZC5wYXRoLCBwYXJzZWQuYWx0IHx8IHBhcnNlZC5wYXRoKTtcbiAgICBjdHguYWRkQ2hpbGQobmV3IFNlY3VyZVdlYmRhdlJlbmRlckNoaWxkKGVsKSk7XG4gIH1cblxuICBleHRyYWN0UmVtb3RlUGF0aChzcmM6IHN0cmluZykge1xuICAgIGNvbnN0IHByZWZpeCA9IGAke1NFQ1VSRV9QUk9UT0NPTH0vL2A7XG4gICAgaWYgKCFzcmMuc3RhcnRzV2l0aChwcmVmaXgpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4gc3JjLnNsaWNlKHByZWZpeC5sZW5ndGgpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZW5kZXJTZWN1cmVJbWFnZUludG9FbGVtZW50KGVsOiBIVE1MRWxlbWVudCwgcmVtb3RlUGF0aDogc3RyaW5nLCBhbHQ6IHN0cmluZykge1xuICAgIGNvbnN0IGltZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbWdcIik7XG4gICAgaW1nLmFsdCA9IGFsdDtcbiAgICBpbWcuc2V0QXR0cmlidXRlKFwiZGF0YS1zZWN1cmUtd2ViZGF2XCIsIHJlbW90ZVBhdGgpO1xuICAgIGltZy5jbGFzc0xpc3QuYWRkKFwic2VjdXJlLXdlYmRhdi1pbWFnZVwiLCBcImlzLWxvYWRpbmdcIik7XG4gICAgZWwuZW1wdHkoKTtcbiAgICBlbC5hcHBlbmRDaGlsZChpbWcpO1xuICAgIGF3YWl0IHRoaXMuc3dhcEltYWdlU291cmNlKGltZyk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHN3YXBJbWFnZVNvdXJjZShpbWc6IEhUTUxJbWFnZUVsZW1lbnQpIHtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gaW1nLmdldEF0dHJpYnV0ZShcImRhdGEtc2VjdXJlLXdlYmRhdlwiKSA/PyB0aGlzLmV4dHJhY3RSZW1vdGVQYXRoKGltZy5nZXRBdHRyaWJ1dGUoXCJzcmNcIikgPz8gXCJcIik7XG4gICAgaWYgKCFyZW1vdGVQYXRoKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaW1nLmNsYXNzTGlzdC5hZGQoXCJzZWN1cmUtd2ViZGF2LWltYWdlXCIsIFwiaXMtbG9hZGluZ1wiKTtcbiAgICBjb25zdCBvcmlnaW5hbEFsdCA9IGltZy5hbHQ7XG4gICAgaW1nLmFsdCA9IG9yaWdpbmFsQWx0IHx8IHRoaXMuZGVwcy50KFwiXHU1MkEwXHU4RjdEXHU1Qjg5XHU1MTY4XHU1NkZFXHU3MjQ3XHU0RTJELi4uXCIsIFwiTG9hZGluZyBzZWN1cmUgaW1hZ2UuLi5cIik7XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgYmxvYlVybCA9IGF3YWl0IHRoaXMuZGVwcy5mZXRjaFNlY3VyZUltYWdlQmxvYlVybChyZW1vdGVQYXRoKTtcbiAgICAgIGltZy5zcmMgPSBibG9iVXJsO1xuICAgICAgaW1nLmFsdCA9IG9yaWdpbmFsQWx0O1xuICAgICAgaW1nLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgICBpbWcuc3R5bGUubWF4V2lkdGggPSBcIjEwMCVcIjtcbiAgICAgIGltZy5jbGFzc0xpc3QucmVtb3ZlKFwiaXMtbG9hZGluZ1wiLCBcImlzLWVycm9yXCIpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiU2VjdXJlIFdlYkRBViBpbWFnZSBsb2FkIGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICBpbWcucmVwbGFjZVdpdGgodGhpcy5idWlsZEVycm9yRWxlbWVudChyZW1vdGVQYXRoLCBlcnJvcikpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRFcnJvckVsZW1lbnQocmVtb3RlUGF0aDogc3RyaW5nLCBlcnJvcjogdW5rbm93bikge1xuICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBlbC5jbGFzc05hbWUgPSBcInNlY3VyZS13ZWJkYXYtaW1hZ2UgaXMtZXJyb3JcIjtcbiAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xuICAgIGVsLnRleHRDb250ZW50ID0gdGhpcy5kZXBzLnQoXG4gICAgICBgXHU1Qjg5XHU1MTY4XHU1NkZFXHU3MjQ3XHU1MkEwXHU4RjdEXHU1OTMxXHU4RDI1XHVGRjFBJHtyZW1vdGVQYXRofVx1RkYwOCR7bWVzc2FnZX1cdUZGMDlgLFxuICAgICAgYFNlY3VyZSBpbWFnZSBmYWlsZWQ6ICR7cmVtb3RlUGF0aH0gKCR7bWVzc2FnZX0pYCxcbiAgICApO1xuICAgIHJldHVybiBlbDtcbiAgfVxufVxuIiwgImltcG9ydCB7IEFwcCwgRWRpdG9yLCBNYXJrZG93blZpZXcsIE5vdGljZSwgVEFic3RyYWN0RmlsZSwgVEZpbGUgfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuZXhwb3J0IHR5cGUgVXBsb2FkVGFzayA9IHtcbiAgaWQ6IHN0cmluZztcbiAgbm90ZVBhdGg6IHN0cmluZztcbiAgcGxhY2Vob2xkZXI6IHN0cmluZztcbiAgbWltZVR5cGU6IHN0cmluZztcbiAgZmlsZU5hbWU6IHN0cmluZztcbiAgZGF0YUJhc2U2NDogc3RyaW5nO1xuICBhdHRlbXB0czogbnVtYmVyO1xuICBjcmVhdGVkQXQ6IG51bWJlcjtcbiAgbGFzdEVycm9yPzogc3RyaW5nO1xufTtcblxudHlwZSBTZWN1cmVXZWJkYXZVcGxvYWRRdWV1ZURlcHMgPSB7XG4gIGFwcDogQXBwO1xuICB0OiAoemg6IHN0cmluZywgZW46IHN0cmluZykgPT4gc3RyaW5nO1xuICBzZXR0aW5nczogKCkgPT4geyBtYXhSZXRyeUF0dGVtcHRzOiBudW1iZXI7IHJldHJ5RGVsYXlTZWNvbmRzOiBudW1iZXIgfTtcbiAgZ2V0UXVldWU6ICgpID0+IFVwbG9hZFRhc2tbXTtcbiAgc2V0UXVldWU6IChxdWV1ZTogVXBsb2FkVGFza1tdKSA9PiB2b2lkO1xuICBzYXZlUGx1Z2luU3RhdGU6ICgpID0+IFByb21pc2U8dm9pZD47XG4gIHNjaGVkdWxlUHJpb3JpdHlOb3RlU3luYzogKG5vdGVQYXRoOiBzdHJpbmcsIHJlYXNvbjogXCJpbWFnZS1hZGRcIiB8IFwiaW1hZ2UtcmVtb3ZlXCIpID0+IHZvaWQ7XG4gIHJlcXVlc3RVcmw6IChvcHRpb25zOiB7XG4gICAgdXJsOiBzdHJpbmc7XG4gICAgbWV0aG9kOiBzdHJpbmc7XG4gICAgaGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gICAgYm9keT86IEFycmF5QnVmZmVyO1xuICAgIGZvbGxvd1JlZGlyZWN0cz86IGJvb2xlYW47XG4gICAgcmVkaXJlY3RDb3VudD86IG51bWJlcjtcbiAgfSkgPT4gUHJvbWlzZTx7IHN0YXR1czogbnVtYmVyOyBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+OyBhcnJheUJ1ZmZlcjogQXJyYXlCdWZmZXIgfT47XG4gIGJ1aWxkVXBsb2FkVXJsOiAocmVtb3RlUGF0aDogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIGJ1aWxkQXV0aEhlYWRlcjogKCkgPT4gc3RyaW5nO1xuICBwcmVwYXJlVXBsb2FkUGF5bG9hZDogKFxuICAgIGJpbmFyeTogQXJyYXlCdWZmZXIsXG4gICAgbWltZVR5cGU6IHN0cmluZyxcbiAgICBmaWxlTmFtZTogc3RyaW5nLFxuICApID0+IFByb21pc2U8eyBiaW5hcnk6IEFycmF5QnVmZmVyOyBtaW1lVHlwZTogc3RyaW5nOyBmaWxlTmFtZTogc3RyaW5nIH0+O1xuICBidWlsZFJlbW90ZUZpbGVOYW1lRnJvbUJpbmFyeTogKGZpbGVOYW1lOiBzdHJpbmcsIGJpbmFyeTogQXJyYXlCdWZmZXIpID0+IFByb21pc2U8c3RyaW5nPjtcbiAgYnVpbGRSZW1vdGVQYXRoOiAoZmlsZU5hbWU6IHN0cmluZykgPT4gc3RyaW5nO1xuICBidWlsZFNlY3VyZUltYWdlTWFya3VwOiAocmVtb3RlVXJsOiBzdHJpbmcsIGFsdDogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIGdldE1pbWVUeXBlRnJvbUZpbGVOYW1lOiAoZmlsZU5hbWU6IHN0cmluZykgPT4gc3RyaW5nO1xuICBhcnJheUJ1ZmZlclRvQmFzZTY0OiAoYnVmZmVyOiBBcnJheUJ1ZmZlcikgPT4gc3RyaW5nO1xuICBiYXNlNjRUb0FycmF5QnVmZmVyOiAoYmFzZTY0OiBzdHJpbmcpID0+IEFycmF5QnVmZmVyO1xuICBlc2NhcGVIdG1sOiAodmFsdWU6IHN0cmluZykgPT4gc3RyaW5nO1xuICBlc2NhcGVSZWdFeHA6ICh2YWx1ZTogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIGRlc2NyaWJlRXJyb3I6IChwcmVmaXg6IHN0cmluZywgZXJyb3I6IHVua25vd24pID0+IHN0cmluZztcbn07XG5cbi8vIE93bnMgdGhlIHF1ZXVlZCBpbWFnZSB1cGxvYWQgd29ya2Zsb3cgc28gc3luYyBhbmQgbm90ZSBsb2dpYyBjYW4gc3RheSBzZXBhcmF0ZS5cbmV4cG9ydCBjbGFzcyBTZWN1cmVXZWJkYXZVcGxvYWRRdWV1ZVN1cHBvcnQge1xuICBwcml2YXRlIHByb2Nlc3NpbmdUYXNrSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgcmV0cnlUaW1lb3V0cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG4gIHByaXZhdGUgcGVuZGluZ1Rhc2tQcm9taXNlcyA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPHZvaWQ+PigpO1xuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgZGVwczogU2VjdXJlV2ViZGF2VXBsb2FkUXVldWVEZXBzKSB7fVxuXG4gIGRpc3Bvc2UoKSB7XG4gICAgZm9yIChjb25zdCB0aW1lb3V0SWQgb2YgdGhpcy5yZXRyeVRpbWVvdXRzLnZhbHVlcygpKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgfVxuICAgIHRoaXMucmV0cnlUaW1lb3V0cy5jbGVhcigpO1xuICB9XG5cbiAgaGFzUGVuZGluZ1dvcmsoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuZGVwcy5nZXRRdWV1ZSgpLmxlbmd0aCA+IDAgfHxcbiAgICAgIHRoaXMucHJvY2Vzc2luZ1Rhc2tJZHMuc2l6ZSA+IDAgfHxcbiAgICAgIHRoaXMucGVuZGluZ1Rhc2tQcm9taXNlcy5zaXplID4gMFxuICAgICk7XG4gIH1cblxuICBoYXNQZW5kaW5nV29ya0Zvck5vdGUobm90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHF1ZXVlID0gdGhpcy5kZXBzLmdldFF1ZXVlKCk7XG4gICAgaWYgKHF1ZXVlLnNvbWUoKHRhc2spID0+IHRhc2subm90ZVBhdGggPT09IG5vdGVQYXRoKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCB0YXNrSWQgb2YgdGhpcy5wcm9jZXNzaW5nVGFza0lkcykge1xuICAgICAgY29uc3QgdGFzayA9IHF1ZXVlLmZpbmQoKGl0ZW0pID0+IGl0ZW0uaWQgPT09IHRhc2tJZCk7XG4gICAgICBpZiAodGFzaz8ubm90ZVBhdGggPT09IG5vdGVQYXRoKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgW3Rhc2tJZF0gb2YgdGhpcy5wZW5kaW5nVGFza1Byb21pc2VzKSB7XG4gICAgICBjb25zdCB0YXNrID0gcXVldWUuZmluZCgoaXRlbSkgPT4gaXRlbS5pZCA9PT0gdGFza0lkKTtcbiAgICAgIGlmICh0YXNrPy5ub3RlUGF0aCA9PT0gbm90ZVBhdGgpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgYXN5bmMgZW5xdWV1ZUVkaXRvckltYWdlVXBsb2FkKG5vdGVGaWxlOiBURmlsZSwgZWRpdG9yOiBFZGl0b3IsIGltYWdlRmlsZTogRmlsZSwgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBhcnJheUJ1ZmZlciA9IGF3YWl0IGltYWdlRmlsZS5hcnJheUJ1ZmZlcigpO1xuICAgICAgY29uc3QgdGFzayA9IHRoaXMuY3JlYXRlVXBsb2FkVGFzayhcbiAgICAgICAgbm90ZUZpbGUucGF0aCxcbiAgICAgICAgYXJyYXlCdWZmZXIsXG4gICAgICAgIGltYWdlRmlsZS50eXBlIHx8IHRoaXMuZGVwcy5nZXRNaW1lVHlwZUZyb21GaWxlTmFtZShmaWxlTmFtZSksXG4gICAgICAgIGZpbGVOYW1lLFxuICAgICAgKTtcbiAgICAgIHRoaXMuaW5zZXJ0UGxhY2Vob2xkZXIoZWRpdG9yLCB0YXNrLnBsYWNlaG9sZGVyKTtcbiAgICAgIHRoaXMuZGVwcy5zZXRRdWV1ZShbLi4udGhpcy5kZXBzLmdldFF1ZXVlKCksIHRhc2tdKTtcbiAgICAgIGF3YWl0IHRoaXMuZGVwcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgIHZvaWQgdGhpcy5wcm9jZXNzUGVuZGluZ1Rhc2tzKCk7XG4gICAgICBuZXcgTm90aWNlKHRoaXMuZGVwcy50KFwiXHU1REYyXHU1MkEwXHU1MTY1XHU1NkZFXHU3MjQ3XHU4MUVBXHU1MkE4XHU0RTBBXHU0RjIwXHU5NjFGXHU1MjE3XHUzMDAyXCIsIFwiSW1hZ2UgYWRkZWQgdG8gdGhlIGF1dG8tdXBsb2FkIHF1ZXVlLlwiKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcXVldWUgc2VjdXJlIGltYWdlIHVwbG9hZFwiLCBlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKFxuICAgICAgICB0aGlzLmRlcHMuZGVzY3JpYmVFcnJvcihcbiAgICAgICAgICB0aGlzLmRlcHMudChcIlx1NTJBMFx1NTE2NVx1NTZGRVx1NzI0N1x1ODFFQVx1NTJBOFx1NEUwQVx1NEYyMFx1OTYxRlx1NTIxN1x1NTkzMVx1OEQyNVwiLCBcIkZhaWxlZCB0byBxdWV1ZSBpbWFnZSBmb3IgYXV0by11cGxvYWRcIiksXG4gICAgICAgICAgZXJyb3IsXG4gICAgICAgICksXG4gICAgICAgIDgwMDAsXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGNyZWF0ZVVwbG9hZFRhc2sobm90ZVBhdGg6IHN0cmluZywgYmluYXJ5OiBBcnJheUJ1ZmZlciwgbWltZVR5cGU6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZyk6IFVwbG9hZFRhc2sge1xuICAgIGNvbnN0IGlkID0gYHNlY3VyZS13ZWJkYXYtdGFzay0ke0RhdGUubm93KCl9LSR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMiwgOCl9YDtcbiAgICByZXR1cm4ge1xuICAgICAgaWQsXG4gICAgICBub3RlUGF0aCxcbiAgICAgIHBsYWNlaG9sZGVyOiB0aGlzLmJ1aWxkUGVuZGluZ1BsYWNlaG9sZGVyKGlkLCBmaWxlTmFtZSksXG4gICAgICBtaW1lVHlwZSxcbiAgICAgIGZpbGVOYW1lLFxuICAgICAgZGF0YUJhc2U2NDogdGhpcy5kZXBzLmFycmF5QnVmZmVyVG9CYXNlNjQoYmluYXJ5KSxcbiAgICAgIGF0dGVtcHRzOiAwLFxuICAgICAgY3JlYXRlZEF0OiBEYXRlLm5vdygpLFxuICAgIH07XG4gIH1cblxuICBidWlsZFBlbmRpbmdQbGFjZWhvbGRlcih0YXNrSWQ6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHNhZmVOYW1lID0gdGhpcy5kZXBzLmVzY2FwZUh0bWwoZmlsZU5hbWUpO1xuICAgIHJldHVybiBgPHNwYW4gY2xhc3M9XCJzZWN1cmUtd2ViZGF2LXBlbmRpbmdcIiBkYXRhLXNlY3VyZS13ZWJkYXYtdGFzaz1cIiR7dGFza0lkfVwiIGFyaWEtbGFiZWw9XCIke3NhZmVOYW1lfVwiPiR7dGhpcy5kZXBzLmVzY2FwZUh0bWwodGhpcy5kZXBzLnQoYFx1MzAxMFx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NEUyRFx1RkY1QyR7ZmlsZU5hbWV9XHUzMDExYCwgYFtVcGxvYWRpbmcgaW1hZ2UgfCAke2ZpbGVOYW1lfV1gKSl9PC9zcGFuPmA7XG4gIH1cblxuICBidWlsZEZhaWxlZFBsYWNlaG9sZGVyKGZpbGVOYW1lOiBzdHJpbmcsIG1lc3NhZ2U/OiBzdHJpbmcpIHtcbiAgICBjb25zdCBzYWZlTmFtZSA9IHRoaXMuZGVwcy5lc2NhcGVIdG1sKGZpbGVOYW1lKTtcbiAgICBjb25zdCBzYWZlTWVzc2FnZSA9IHRoaXMuZGVwcy5lc2NhcGVIdG1sKG1lc3NhZ2UgPz8gdGhpcy5kZXBzLnQoXCJcdTY3MkFcdTc3RTVcdTk1MTlcdThCRUZcIiwgXCJVbmtub3duIGVycm9yXCIpKTtcbiAgICBjb25zdCBsYWJlbCA9IHRoaXMuZGVwcy5lc2NhcGVIdG1sKHRoaXMuZGVwcy50KGBcdTMwMTBcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTU5MzFcdThEMjVcdUZGNUMke2ZpbGVOYW1lfVx1MzAxMWAsIGBbSW1hZ2UgdXBsb2FkIGZhaWxlZCB8ICR7ZmlsZU5hbWV9XWApKTtcbiAgICByZXR1cm4gYDxzcGFuIGNsYXNzPVwic2VjdXJlLXdlYmRhdi1mYWlsZWRcIiBhcmlhLWxhYmVsPVwiJHtzYWZlTmFtZX1cIj4ke2xhYmVsfTogJHtzYWZlTWVzc2FnZX08L3NwYW4+YDtcbiAgfVxuXG4gIGFzeW5jIHByb2Nlc3NQZW5kaW5nVGFza3MoKSB7XG4gICAgY29uc3QgcnVubmluZzogUHJvbWlzZTx2b2lkPltdID0gW107XG4gICAgZm9yIChjb25zdCB0YXNrIG9mIHRoaXMuZGVwcy5nZXRRdWV1ZSgpKSB7XG4gICAgICBpZiAodGhpcy5wcm9jZXNzaW5nVGFza0lkcy5oYXModGFzay5pZCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHJ1bm5pbmcucHVzaCh0aGlzLnN0YXJ0UGVuZGluZ1Rhc2sodGFzaykpO1xuICAgIH1cblxuICAgIGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChydW5uaW5nKTtcbiAgfVxuXG4gIHN0YXJ0UGVuZGluZ1Rhc2sodGFzazogVXBsb2FkVGFzaykge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5wZW5kaW5nVGFza1Byb21pc2VzLmdldCh0YXNrLmlkKTtcbiAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgIHJldHVybiBleGlzdGluZztcbiAgICB9XG5cbiAgICBjb25zdCBwcm9taXNlID0gdGhpcy5wcm9jZXNzVGFzayh0YXNrKS5maW5hbGx5KCgpID0+IHtcbiAgICAgIHRoaXMucGVuZGluZ1Rhc2tQcm9taXNlcy5kZWxldGUodGFzay5pZCk7XG4gICAgfSk7XG4gICAgdGhpcy5wZW5kaW5nVGFza1Byb21pc2VzLnNldCh0YXNrLmlkLCBwcm9taXNlKTtcbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIGFzeW5jIHByb2Nlc3NUYXNrKHRhc2s6IFVwbG9hZFRhc2spIHtcbiAgICB0aGlzLnByb2Nlc3NpbmdUYXNrSWRzLmFkZCh0YXNrLmlkKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgYmluYXJ5ID0gdGhpcy5kZXBzLmJhc2U2NFRvQXJyYXlCdWZmZXIodGFzay5kYXRhQmFzZTY0KTtcbiAgICAgIGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdGhpcy5kZXBzLnByZXBhcmVVcGxvYWRQYXlsb2FkKFxuICAgICAgICBiaW5hcnksXG4gICAgICAgIHRhc2subWltZVR5cGUgfHwgdGhpcy5kZXBzLmdldE1pbWVUeXBlRnJvbUZpbGVOYW1lKHRhc2suZmlsZU5hbWUpLFxuICAgICAgICB0YXNrLmZpbGVOYW1lLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IHJlbW90ZU5hbWUgPSBhd2FpdCB0aGlzLmRlcHMuYnVpbGRSZW1vdGVGaWxlTmFtZUZyb21CaW5hcnkocHJlcGFyZWQuZmlsZU5hbWUsIHByZXBhcmVkLmJpbmFyeSk7XG4gICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5kZXBzLmJ1aWxkUmVtb3RlUGF0aChyZW1vdGVOYW1lKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5kZXBzLnJlcXVlc3RVcmwoe1xuICAgICAgICB1cmw6IHRoaXMuZGVwcy5idWlsZFVwbG9hZFVybChyZW1vdGVQYXRoKSxcbiAgICAgICAgbWV0aG9kOiBcIlBVVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogdGhpcy5kZXBzLmJ1aWxkQXV0aEhlYWRlcigpLFxuICAgICAgICAgIFwiQ29udGVudC1UeXBlXCI6IHByZXBhcmVkLm1pbWVUeXBlLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBwcmVwYXJlZC5iaW5hcnksXG4gICAgICB9KTtcblxuICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVXBsb2FkIGZhaWxlZCB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVwbGFjZWQgPSBhd2FpdCB0aGlzLnJlcGxhY2VQbGFjZWhvbGRlcihcbiAgICAgICAgdGFzay5ub3RlUGF0aCxcbiAgICAgICAgdGFzay5pZCxcbiAgICAgICAgdGFzay5wbGFjZWhvbGRlcixcbiAgICAgICAgdGhpcy5kZXBzLmJ1aWxkU2VjdXJlSW1hZ2VNYXJrdXAoYHdlYmRhdi1zZWN1cmU6Ly8ke3JlbW90ZVBhdGh9YCwgcHJlcGFyZWQuZmlsZU5hbWUpLFxuICAgICAgKTtcbiAgICAgIGlmICghcmVwbGFjZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgIHRoaXMuZGVwcy50KFxuICAgICAgICAgICAgXCJcdTRFMEFcdTRGMjBcdTYyMTBcdTUyOUZcdUZGMENcdTRGNDZcdTZDQTFcdTY3MDlcdTU3MjhcdTdCMTRcdThCQjBcdTRFMkRcdTYyN0VcdTUyMzBcdTUzRUZcdTY2RkZcdTYzNjJcdTc2ODRcdTUzNjBcdTRGNERcdTdCMjZcdTMwMDJcIixcbiAgICAgICAgICAgIFwiVXBsb2FkIHN1Y2NlZWRlZCwgYnV0IG5vIG1hdGNoaW5nIHBsYWNlaG9sZGVyIHdhcyBmb3VuZCBpbiB0aGUgbm90ZS5cIixcbiAgICAgICAgICApLFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmRlcHMuc2V0UXVldWUodGhpcy5kZXBzLmdldFF1ZXVlKCkuZmlsdGVyKChpdGVtKSA9PiBpdGVtLmlkICE9PSB0YXNrLmlkKSk7XG4gICAgICBhd2FpdCB0aGlzLmRlcHMuc2F2ZVBsdWdpblN0YXRlKCk7XG4gICAgICB0aGlzLmRlcHMuc2NoZWR1bGVQcmlvcml0eU5vdGVTeW5jKHRhc2subm90ZVBhdGgsIFwiaW1hZ2UtYWRkXCIpO1xuICAgICAgbmV3IE5vdGljZSh0aGlzLmRlcHMudChcIlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NjIxMFx1NTI5Rlx1MzAwMlwiLCBcIkltYWdlIHVwbG9hZGVkIHN1Y2Nlc3NmdWxseS5cIikpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiU2VjdXJlIFdlYkRBViBxdWV1ZWQgdXBsb2FkIGZhaWxlZFwiLCBlcnJvcik7XG4gICAgICB0YXNrLmF0dGVtcHRzICs9IDE7XG4gICAgICB0YXNrLmxhc3RFcnJvciA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcbiAgICAgIGF3YWl0IHRoaXMuZGVwcy5zYXZlUGx1Z2luU3RhdGUoKTtcblxuICAgICAgaWYgKHRhc2suYXR0ZW1wdHMgPj0gdGhpcy5kZXBzLnNldHRpbmdzKCkubWF4UmV0cnlBdHRlbXB0cykge1xuICAgICAgICBhd2FpdCB0aGlzLnJlcGxhY2VQbGFjZWhvbGRlcihcbiAgICAgICAgICB0YXNrLm5vdGVQYXRoLFxuICAgICAgICAgIHRhc2suaWQsXG4gICAgICAgICAgdGFzay5wbGFjZWhvbGRlcixcbiAgICAgICAgICB0aGlzLmJ1aWxkRmFpbGVkUGxhY2Vob2xkZXIodGFzay5maWxlTmFtZSwgdGFzay5sYXN0RXJyb3IpLFxuICAgICAgICApO1xuICAgICAgICB0aGlzLmRlcHMuc2V0UXVldWUodGhpcy5kZXBzLmdldFF1ZXVlKCkuZmlsdGVyKChpdGVtKSA9PiBpdGVtLmlkICE9PSB0YXNrLmlkKSk7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVwcy5zYXZlUGx1Z2luU3RhdGUoKTtcbiAgICAgICAgbmV3IE5vdGljZSh0aGlzLmRlcHMuZGVzY3JpYmVFcnJvcih0aGlzLmRlcHMudChcIlx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1NjcwMFx1N0VDOFx1NTkzMVx1OEQyNVwiLCBcIkltYWdlIHVwbG9hZCBmYWlsZWQgcGVybWFuZW50bHlcIiksIGVycm9yKSwgODAwMCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnNjaGVkdWxlUmV0cnkodGFzayk7XG4gICAgICB9XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMucHJvY2Vzc2luZ1Rhc2tJZHMuZGVsZXRlKHRhc2suaWQpO1xuICAgIH1cbiAgfVxuXG4gIHNjaGVkdWxlUmV0cnkodGFzazogVXBsb2FkVGFzaykge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5yZXRyeVRpbWVvdXRzLmdldCh0YXNrLmlkKTtcbiAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQoZXhpc3RpbmcpO1xuICAgIH1cblxuICAgIGNvbnN0IGRlbGF5ID0gTWF0aC5tYXgoMSwgdGhpcy5kZXBzLnNldHRpbmdzKCkucmV0cnlEZWxheVNlY29uZHMpICogMTAwMCAqIHRhc2suYXR0ZW1wdHM7XG4gICAgY29uc3QgdGltZW91dElkID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgdGhpcy5yZXRyeVRpbWVvdXRzLmRlbGV0ZSh0YXNrLmlkKTtcbiAgICAgIHZvaWQgdGhpcy5zdGFydFBlbmRpbmdUYXNrKHRhc2spO1xuICAgIH0sIGRlbGF5KTtcbiAgICB0aGlzLnJldHJ5VGltZW91dHMuc2V0KHRhc2suaWQsIHRpbWVvdXRJZCk7XG4gIH1cblxuICBwcml2YXRlIGluc2VydFBsYWNlaG9sZGVyKGVkaXRvcjogRWRpdG9yLCBwbGFjZWhvbGRlcjogc3RyaW5nKSB7XG4gICAgZWRpdG9yLnJlcGxhY2VTZWxlY3Rpb24oYCR7cGxhY2Vob2xkZXJ9XFxuYCk7XG4gIH1cblxuICBhc3luYyByZXBsYWNlUGxhY2Vob2xkZXIobm90ZVBhdGg6IHN0cmluZywgdGFza0lkOiBzdHJpbmcsIHBsYWNlaG9sZGVyOiBzdHJpbmcsIHJlcGxhY2VtZW50OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXBsYWNlZEluRWRpdG9yID0gdGhpcy5yZXBsYWNlUGxhY2Vob2xkZXJJbk9wZW5FZGl0b3JzKG5vdGVQYXRoLCB0YXNrSWQsIHBsYWNlaG9sZGVyLCByZXBsYWNlbWVudCk7XG4gICAgaWYgKHJlcGxhY2VkSW5FZGl0b3IpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmRlcHMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChub3RlUGF0aCk7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmRlcHMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgaWYgKGNvbnRlbnQuaW5jbHVkZXMocGxhY2Vob2xkZXIpKSB7XG4gICAgICBjb25zdCB1cGRhdGVkID0gY29udGVudC5yZXBsYWNlKHBsYWNlaG9sZGVyLCByZXBsYWNlbWVudCk7XG4gICAgICBpZiAodXBkYXRlZCAhPT0gY29udGVudCkge1xuICAgICAgICBhd2FpdCB0aGlzLmRlcHMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB1cGRhdGVkKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcGF0dGVybiA9IG5ldyBSZWdFeHAoXG4gICAgICBgPHNwYW5bXj5dKmRhdGEtc2VjdXJlLXdlYmRhdi10YXNrPVwiJHt0aGlzLmRlcHMuZXNjYXBlUmVnRXhwKHRhc2tJZCl9XCJbXj5dKj4uKj88XFxcXC9zcGFuPmAsXG4gICAgICBcInNcIixcbiAgICApO1xuICAgIGlmIChwYXR0ZXJuLnRlc3QoY29udGVudCkpIHtcbiAgICAgIGNvbnN0IHVwZGF0ZWQgPSBjb250ZW50LnJlcGxhY2UocGF0dGVybiwgcmVwbGFjZW1lbnQpO1xuICAgICAgaWYgKHVwZGF0ZWQgIT09IGNvbnRlbnQpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5kZXBzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdXBkYXRlZCk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHByaXZhdGUgcmVwbGFjZVBsYWNlaG9sZGVySW5PcGVuRWRpdG9ycyhub3RlUGF0aDogc3RyaW5nLCB0YXNrSWQ6IHN0cmluZywgcGxhY2Vob2xkZXI6IHN0cmluZywgcmVwbGFjZW1lbnQ6IHN0cmluZykge1xuICAgIGxldCByZXBsYWNlZCA9IGZhbHNlO1xuICAgIGNvbnN0IGxlYXZlcyA9IHRoaXMuZGVwcy5hcHAud29ya3NwYWNlLmdldExlYXZlc09mVHlwZShcIm1hcmtkb3duXCIpO1xuXG4gICAgZm9yIChjb25zdCBsZWFmIG9mIGxlYXZlcykge1xuICAgICAgY29uc3QgdmlldyA9IGxlYWYudmlldztcbiAgICAgIGlmICghKHZpZXcgaW5zdGFuY2VvZiBNYXJrZG93blZpZXcpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXZpZXcuZmlsZSB8fCB2aWV3LmZpbGUucGF0aCAhPT0gbm90ZVBhdGgpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGVkaXRvciA9IHZpZXcuZWRpdG9yO1xuICAgICAgY29uc3QgY29udGVudCA9IGVkaXRvci5nZXRWYWx1ZSgpO1xuICAgICAgbGV0IHVwZGF0ZWQgPSBjb250ZW50O1xuXG4gICAgICBpZiAoY29udGVudC5pbmNsdWRlcyhwbGFjZWhvbGRlcikpIHtcbiAgICAgICAgdXBkYXRlZCA9IGNvbnRlbnQucmVwbGFjZShwbGFjZWhvbGRlciwgcmVwbGFjZW1lbnQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcGF0dGVybiA9IG5ldyBSZWdFeHAoXG4gICAgICAgICAgYDxzcGFuW14+XSpkYXRhLXNlY3VyZS13ZWJkYXYtdGFzaz1cIiR7dGhpcy5kZXBzLmVzY2FwZVJlZ0V4cCh0YXNrSWQpfVwiW14+XSo+Lio/PFxcXFwvc3Bhbj5gLFxuICAgICAgICAgIFwic1wiLFxuICAgICAgICApO1xuICAgICAgICB1cGRhdGVkID0gY29udGVudC5yZXBsYWNlKHBhdHRlcm4sIHJlcGxhY2VtZW50KTtcbiAgICAgIH1cblxuICAgICAgaWYgKHVwZGF0ZWQgIT09IGNvbnRlbnQpIHtcbiAgICAgICAgZWRpdG9yLnNldFZhbHVlKHVwZGF0ZWQpO1xuICAgICAgICByZXBsYWNlZCA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlcGxhY2VkO1xuICB9XG59XG4iLCAiaW1wb3J0IHsgQXBwLCBURmlsZSwgVEZvbGRlciwgbm9ybWFsaXplUGF0aCB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5leHBvcnQgdHlwZSBEZWxldGlvblRvbWJzdG9uZSA9IHtcbiAgcGF0aDogc3RyaW5nO1xuICBkZWxldGVkQXQ6IG51bWJlcjtcbiAgcmVtb3RlU2lnbmF0dXJlPzogc3RyaW5nO1xufTtcblxuZXhwb3J0IHR5cGUgUmVtb3RlRmlsZUxpa2UgPSB7XG4gIHJlbW90ZVBhdGg6IHN0cmluZztcbiAgbGFzdE1vZGlmaWVkOiBudW1iZXI7XG4gIHNpemU6IG51bWJlcjtcbiAgc2lnbmF0dXJlOiBzdHJpbmc7XG59O1xuXG50eXBlIFNlY3VyZVdlYmRhdlN5bmNTdXBwb3J0RGVwcyA9IHtcbiAgYXBwOiBBcHA7XG4gIGdldFZhdWx0U3luY1JlbW90ZUZvbGRlcjogKCkgPT4gc3RyaW5nO1xuICBnZXRFeGNsdWRlZFN5bmNGb2xkZXJzPzogKCkgPT4gc3RyaW5nW107XG4gIGRlbGV0aW9uRm9sZGVyU3VmZml4OiBzdHJpbmc7XG4gIGVuY29kZUJhc2U2NFVybDogKHZhbHVlOiBzdHJpbmcpID0+IHN0cmluZztcbiAgZGVjb2RlQmFzZTY0VXJsOiAodmFsdWU6IHN0cmluZykgPT4gc3RyaW5nO1xufTtcblxuLy8gS2VlcCBzeW5jIG1ldGFkYXRhIGFuZCB0b21ic3RvbmUgcnVsZXMgaXNvbGF0ZWQgc28gcXVldWUvcmVuZGVyaW5nIGNoYW5nZXNcbi8vIGRvIG5vdCBhY2NpZGVudGFsbHkgYWZmZWN0IHJlY29uY2lsaWF0aW9uIGJlaGF2aW91ci5cbmV4cG9ydCBjbGFzcyBTZWN1cmVXZWJkYXZTeW5jU3VwcG9ydCB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgZGVwczogU2VjdXJlV2ViZGF2U3luY1N1cHBvcnREZXBzKSB7fVxuXG4gIGlzRXhjbHVkZWRTeW5jUGF0aChwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IG5vcm1hbGl6ZVBhdGgocGF0aCkucmVwbGFjZSgvXlxcLysvLCBcIlwiKS5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpO1xuICAgIGlmICghbm9ybWFsaXplZFBhdGgpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCBmb2xkZXJzID0gdGhpcy5kZXBzLmdldEV4Y2x1ZGVkU3luY0ZvbGRlcnM/LigpID8/IFtdO1xuICAgIHJldHVybiBmb2xkZXJzLnNvbWUoKGZvbGRlcikgPT4ge1xuICAgICAgY29uc3Qgbm9ybWFsaXplZEZvbGRlciA9IG5vcm1hbGl6ZVBhdGgoZm9sZGVyKS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpLnJlcGxhY2UoL1xcLyskLywgXCJcIik7XG4gICAgICByZXR1cm4gbm9ybWFsaXplZEZvbGRlci5sZW5ndGggPiAwICYmIChub3JtYWxpemVkUGF0aCA9PT0gbm9ybWFsaXplZEZvbGRlciB8fCBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKGAke25vcm1hbGl6ZWRGb2xkZXJ9L2ApKTtcbiAgICB9KTtcbiAgfVxuXG4gIHNob3VsZFNraXBDb250ZW50U3luY1BhdGgocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZFBhdGggPSBub3JtYWxpemVQYXRoKHBhdGgpO1xuICAgIGlmIChcbiAgICAgIHRoaXMuaXNFeGNsdWRlZFN5bmNQYXRoKG5vcm1hbGl6ZWRQYXRoKSB8fFxuICAgICAgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIi5vYnNpZGlhbi9cIikgfHxcbiAgICAgIG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIudHJhc2gvXCIpIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwiLmdpdC9cIikgfHxcbiAgICAgIG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCJub2RlX21vZHVsZXMvXCIpIHx8XG4gICAgICBub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKFwiX3BsdWdpbl9wYWNrYWdlcy9cIikgfHxcbiAgICAgIG5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIudG1wLVwiKSB8fFxuICAgICAgbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIi5vYnNpZGlhbi9wbHVnaW5zL3NlY3VyZS13ZWJkYXYtaW1hZ2VzL1wiKVxuICAgICkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIC9cXC4ocG5nfGpwZT9nfGdpZnx3ZWJwfGJtcHxzdmcpJC9pLnRlc3Qobm9ybWFsaXplZFBhdGgpO1xuICB9XG5cbiAgc2hvdWxkU2tpcERpcmVjdG9yeVN5bmNQYXRoKGRpclBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHAgPSBub3JtYWxpemVQYXRoKGRpclBhdGgpO1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmlzRXhjbHVkZWRTeW5jUGF0aChwKSB8fFxuICAgICAgcC5zdGFydHNXaXRoKFwiLm9ic2lkaWFuXCIpIHx8XG4gICAgICBwLnN0YXJ0c1dpdGgoXCIudHJhc2hcIikgfHxcbiAgICAgIHAuc3RhcnRzV2l0aChcIi5naXRcIikgfHxcbiAgICAgIHAuc3RhcnRzV2l0aChcIm5vZGVfbW9kdWxlc1wiKSB8fFxuICAgICAgcC5zdGFydHNXaXRoKFwiX3BsdWdpbl9wYWNrYWdlc1wiKSB8fFxuICAgICAgcC5zdGFydHNXaXRoKFwiLnRtcC1cIilcbiAgICApO1xuICB9XG5cbiAgY29sbGVjdExvY2FsU3luY2VkRGlyZWN0b3JpZXMoKSB7XG4gICAgY29uc3QgZGlycyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGZvciAoY29uc3QgZiBvZiB0aGlzLmRlcHMuYXBwLnZhdWx0LmdldEFsbEZvbGRlcnMoKSkge1xuICAgICAgaWYgKGYgaW5zdGFuY2VvZiBURm9sZGVyICYmICFmLmlzUm9vdCgpICYmICF0aGlzLnNob3VsZFNraXBEaXJlY3RvcnlTeW5jUGF0aChmLnBhdGgpKSB7XG4gICAgICAgIGRpcnMuYWRkKG5vcm1hbGl6ZVBhdGgoZi5wYXRoKSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBkaXJzO1xuICB9XG5cbiAgY29sbGVjdFZhdWx0Q29udGVudEZpbGVzKCkge1xuICAgIHJldHVybiB0aGlzLmRlcHMuYXBwLnZhdWx0XG4gICAgICAuZ2V0RmlsZXMoKVxuICAgICAgLmZpbHRlcigoZmlsZSkgPT4gIXRoaXMuc2hvdWxkU2tpcENvbnRlbnRTeW5jUGF0aChmaWxlLnBhdGgpKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGEucGF0aC5sb2NhbGVDb21wYXJlKGIucGF0aCkpO1xuICB9XG5cbiAgYnVpbGRTeW5jU2lnbmF0dXJlKGZpbGU6IFRGaWxlKSB7XG4gICAgcmV0dXJuIGAke2ZpbGUuc3RhdC5tdGltZX06JHtmaWxlLnN0YXQuc2l6ZX1gO1xuICB9XG5cbiAgYnVpbGRSZW1vdGVTeW5jU2lnbmF0dXJlKHJlbW90ZTogUGljazxSZW1vdGVGaWxlTGlrZSwgXCJsYXN0TW9kaWZpZWRcIiB8IFwic2l6ZVwiPikge1xuICAgIHJldHVybiBgJHtyZW1vdGUubGFzdE1vZGlmaWVkfToke3JlbW90ZS5zaXplfWA7XG4gIH1cblxuICBidWlsZFZhdWx0U3luY1JlbW90ZVBhdGgodmF1bHRQYXRoOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5kZXBzLmdldFZhdWx0U3luY1JlbW90ZUZvbGRlcigpKX0ke3ZhdWx0UGF0aH1gO1xuICB9XG5cbiAgYnVpbGREZWxldGlvbkZvbGRlcigpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5ub3JtYWxpemVGb2xkZXIodGhpcy5kZXBzLmdldFZhdWx0U3luY1JlbW90ZUZvbGRlcigpKS5yZXBsYWNlKC9cXC8kLywgXCJcIil9JHt0aGlzLmRlcHMuZGVsZXRpb25Gb2xkZXJTdWZmaXh9YDtcbiAgfVxuXG4gIGJ1aWxkRGVsZXRpb25SZW1vdGVQYXRoKHZhdWx0UGF0aDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGAke3RoaXMuYnVpbGREZWxldGlvbkZvbGRlcigpfSR7dGhpcy5kZXBzLmVuY29kZUJhc2U2NFVybCh2YXVsdFBhdGgpfS5qc29uYDtcbiAgfVxuXG4gIHJlbW90ZURlbGV0aW9uUGF0aFRvVmF1bHRQYXRoKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHJvb3QgPSB0aGlzLmJ1aWxkRGVsZXRpb25Gb2xkZXIoKTtcbiAgICBpZiAoIXJlbW90ZVBhdGguc3RhcnRzV2l0aChyb290KSB8fCAhcmVtb3RlUGF0aC5lbmRzV2l0aChcIi5qc29uXCIpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBlbmNvZGVkID0gcmVtb3RlUGF0aC5zbGljZShyb290Lmxlbmd0aCwgLVwiLmpzb25cIi5sZW5ndGgpO1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gdGhpcy5kZXBzLmRlY29kZUJhc2U2NFVybChlbmNvZGVkKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIHBhcnNlRGVsZXRpb25Ub21ic3RvbmVQYXlsb2FkKHJhdzogc3RyaW5nKTogRGVsZXRpb25Ub21ic3RvbmUgfCBudWxsIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpO1xuICAgICAgaWYgKCFwYXJzZWQgfHwgdHlwZW9mIHBhcnNlZC5wYXRoICE9PSBcInN0cmluZ1wiIHx8IHR5cGVvZiBwYXJzZWQuZGVsZXRlZEF0ICE9PSBcIm51bWJlclwiKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgaWYgKHBhcnNlZC5yZW1vdGVTaWduYXR1cmUgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgcGFyc2VkLnJlbW90ZVNpZ25hdHVyZSAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHBhdGg6IHBhcnNlZC5wYXRoLFxuICAgICAgICBkZWxldGVkQXQ6IHBhcnNlZC5kZWxldGVkQXQsXG4gICAgICAgIHJlbW90ZVNpZ25hdHVyZTogcGFyc2VkLnJlbW90ZVNpZ25hdHVyZSxcbiAgICAgIH07XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cblxuICByZW1vdGVQYXRoVG9WYXVsdFBhdGgocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3Qgcm9vdCA9IHRoaXMubm9ybWFsaXplRm9sZGVyKHRoaXMuZGVwcy5nZXRWYXVsdFN5bmNSZW1vdGVGb2xkZXIoKSk7XG4gICAgaWYgKCFyZW1vdGVQYXRoLnN0YXJ0c1dpdGgocm9vdCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiByZW1vdGVQYXRoLnNsaWNlKHJvb3QubGVuZ3RoKS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpO1xuICB9XG5cbiAgc2hvdWxkRG93bmxvYWRSZW1vdGVWZXJzaW9uKGxvY2FsTXRpbWU6IG51bWJlciwgcmVtb3RlTXRpbWU6IG51bWJlcikge1xuICAgIHJldHVybiByZW1vdGVNdGltZSA+IGxvY2FsTXRpbWUgKyAyMDAwO1xuICB9XG5cbiAgaXNUb21ic3RvbmVBdXRob3JpdGF0aXZlKFxuICAgIHRvbWJzdG9uZTogRGVsZXRpb25Ub21ic3RvbmUsXG4gICAgcmVtb3RlPzogUGljazxSZW1vdGVGaWxlTGlrZSwgXCJsYXN0TW9kaWZpZWRcIiB8IFwic2lnbmF0dXJlXCI+IHwgbnVsbCxcbiAgKSB7XG4gICAgY29uc3QgZ3JhY2VNcyA9IDUwMDA7XG4gICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmICh0b21ic3RvbmUucmVtb3RlU2lnbmF0dXJlKSB7XG4gICAgICByZXR1cm4gcmVtb3RlLnNpZ25hdHVyZSA9PT0gdG9tYnN0b25lLnJlbW90ZVNpZ25hdHVyZTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVtb3RlLmxhc3RNb2RpZmllZCA8PSB0b21ic3RvbmUuZGVsZXRlZEF0ICsgZ3JhY2VNcztcbiAgfVxuXG4gIHNob3VsZERlbGV0ZUxvY2FsRnJvbVRvbWJzdG9uZShmaWxlOiBURmlsZSwgdG9tYnN0b25lOiBEZWxldGlvblRvbWJzdG9uZSkge1xuICAgIGNvbnN0IGdyYWNlTXMgPSA1MDAwO1xuICAgIHJldHVybiBmaWxlLnN0YXQubXRpbWUgPD0gdG9tYnN0b25lLmRlbGV0ZWRBdCArIGdyYWNlTXM7XG4gIH1cblxuICBwcml2YXRlIG5vcm1hbGl6ZUZvbGRlcihpbnB1dDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIG5vcm1hbGl6ZUZvbGRlcihpbnB1dCk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUZvbGRlcihpbnB1dDogc3RyaW5nKSB7XG4gIHJldHVybiBpbnB1dC5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpLnJlcGxhY2UoL1xcLyskLywgXCJcIikgKyBcIi9cIjtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFDLElBQUFBLG1CQWVNOzs7QUNmUCxzQkFBa0U7QUFFM0QsSUFBTSxrQkFBa0I7QUFDeEIsSUFBTSxvQkFBb0I7QUFZakMsSUFBTSwwQkFBTixjQUFzQyxvQ0FBb0I7QUFBQSxFQUN4RCxZQUFZLGFBQTBCO0FBQ3BDLFVBQU0sV0FBVztBQUFBLEVBQ25CO0FBQUEsRUFFQSxXQUFpQjtBQUFBLEVBQUM7QUFDcEI7QUFJTyxJQUFNLDJCQUFOLE1BQStCO0FBQUEsRUFDcEMsWUFBNkIsTUFBb0M7QUFBcEM7QUFBQSxFQUFxQztBQUFBLEVBRWxFLHVCQUF1QixXQUFtQixLQUFhO0FBQ3JELFVBQU0sYUFBYSxLQUFLLGtCQUFrQixTQUFTO0FBQ25ELFFBQUksQ0FBQyxZQUFZO0FBQ2YsYUFBTyxPQUFPLFNBQVM7QUFBQSxJQUN6QjtBQUVBLFdBQU8sS0FBSywwQkFBMEIsWUFBWSxHQUFHO0FBQUEsRUFDdkQ7QUFBQSxFQUVBLDBCQUEwQixZQUFvQixLQUFhO0FBQ3pELFVBQU0saUJBQWlCLE9BQU8sWUFBWSxRQUFRLFVBQVUsR0FBRyxFQUFFLEtBQUs7QUFDdEUsVUFBTSxpQkFBaUIsV0FBVyxRQUFRLFVBQVUsRUFBRSxFQUFFLEtBQUs7QUFDN0QsV0FBTyxDQUFDLFNBQVMsaUJBQWlCLElBQUksU0FBUyxjQUFjLElBQUksUUFBUSxhQUFhLElBQUksS0FBSyxFQUFFLEtBQUssSUFBSTtBQUFBLEVBQzVHO0FBQUEsRUFFQSxzQkFBc0IsUUFBK0M7QUFDbkUsVUFBTSxTQUFpQyxFQUFFLE1BQU0sSUFBSSxLQUFLLEdBQUc7QUFDM0QsZUFBVyxXQUFXLE9BQU8sTUFBTSxPQUFPLEdBQUc7QUFDM0MsWUFBTSxPQUFPLFFBQVEsS0FBSztBQUMxQixVQUFJLENBQUMsTUFBTTtBQUNUO0FBQUEsTUFDRjtBQUVBLFlBQU0saUJBQWlCLEtBQUssUUFBUSxHQUFHO0FBQ3ZDLFVBQUksbUJBQW1CLElBQUk7QUFDekI7QUFBQSxNQUNGO0FBRUEsWUFBTSxNQUFNLEtBQUssTUFBTSxHQUFHLGNBQWMsRUFBRSxLQUFLLEVBQUUsWUFBWTtBQUM3RCxZQUFNLFFBQVEsS0FBSyxNQUFNLGlCQUFpQixDQUFDLEVBQUUsS0FBSztBQUNsRCxVQUFJLFFBQVEsUUFBUTtBQUNsQixlQUFPLE9BQU87QUFBQSxNQUNoQixXQUFXLFFBQVEsT0FBTztBQUN4QixlQUFPLE1BQU07QUFBQSxNQUNmO0FBQUEsSUFDRjtBQUVBLFdBQU8sT0FBTyxPQUFPLFNBQVM7QUFBQSxFQUNoQztBQUFBLEVBRUEsTUFBTSxvQkFBb0IsSUFBaUIsS0FBbUM7QUFDNUUsVUFBTSxtQkFBbUIsTUFBTSxLQUFLLEdBQUcsaUJBQThCLHVCQUF1QixpQkFBaUIsRUFBRSxDQUFDO0FBQ2hILFVBQU0sUUFBUTtBQUFBLE1BQ1osaUJBQWlCLElBQUksT0FBTyxXQUFXO0FBQ3JDLGNBQU0sTUFBTSxPQUFPO0FBQ25CLFlBQUksRUFBRSxlQUFlLGdCQUFnQixJQUFJLGFBQWEsNkJBQTZCLEdBQUc7QUFDcEY7QUFBQSxRQUNGO0FBRUEsY0FBTSxTQUFTLEtBQUssc0JBQXNCLE9BQU8sZUFBZSxFQUFFO0FBQ2xFLFlBQUksQ0FBQyxRQUFRLE1BQU07QUFDakI7QUFBQSxRQUNGO0FBRUEsWUFBSSxhQUFhLCtCQUErQixNQUFNO0FBQ3RELGNBQU0sS0FBSyw2QkFBNkIsS0FBSyxPQUFPLE1BQU0sT0FBTyxPQUFPLE9BQU8sSUFBSTtBQUFBLE1BQ3JGLENBQUM7QUFBQSxJQUNIO0FBRUEsVUFBTSxjQUFjLE1BQU0sS0FBSyxHQUFHLGlCQUE4QixzQkFBc0IsQ0FBQztBQUN2RixVQUFNLFFBQVE7QUFBQSxNQUNaLFlBQVksSUFBSSxPQUFPLFNBQVM7QUFDOUIsWUFBSSxnQkFBZ0Isa0JBQWtCO0FBQ3BDLGdCQUFNLEtBQUssZ0JBQWdCLElBQUk7QUFDL0I7QUFBQSxRQUNGO0FBRUEsY0FBTSxhQUFhLEtBQUssYUFBYSxvQkFBb0I7QUFDekQsWUFBSSxDQUFDLFlBQVk7QUFDZjtBQUFBLFFBQ0Y7QUFFQSxjQUFNLE1BQU0sU0FBUyxjQUFjLEtBQUs7QUFDeEMsWUFBSSxNQUFNLEtBQUssYUFBYSxZQUFZLEtBQUssS0FBSyxhQUFhLEtBQUssS0FBSztBQUN6RSxZQUFJLGFBQWEsc0JBQXNCLFVBQVU7QUFDakQsWUFBSSxVQUFVLElBQUksdUJBQXVCLFlBQVk7QUFDckQsYUFBSyxZQUFZLEdBQUc7QUFDcEIsY0FBTSxLQUFLLGdCQUFnQixHQUFHO0FBQUEsTUFDaEMsQ0FBQztBQUFBLElBQ0g7QUFFQSxVQUFNLGNBQWMsTUFBTSxLQUFLLEdBQUcsaUJBQW1DLGFBQWEsZUFBZSxNQUFNLENBQUM7QUFDeEcsVUFBTSxRQUFRLElBQUksWUFBWSxJQUFJLE9BQU8sUUFBUSxLQUFLLGdCQUFnQixHQUFHLENBQUMsQ0FBQztBQUUzRSxRQUFJLFNBQVMsSUFBSSx3QkFBd0IsRUFBRSxDQUFDO0FBQUEsRUFDOUM7QUFBQSxFQUVBLE1BQU0sdUJBQXVCLFFBQWdCLElBQWlCLEtBQW1DO0FBQy9GLFVBQU0sU0FBUyxLQUFLLHNCQUFzQixNQUFNO0FBQ2hELFFBQUksQ0FBQyxRQUFRLE1BQU07QUFDakIsU0FBRyxTQUFTLE9BQU87QUFBQSxRQUNqQixNQUFNLEtBQUssS0FBSyxFQUFFLDRFQUFnQix5Q0FBeUM7QUFBQSxNQUM3RSxDQUFDO0FBQ0Q7QUFBQSxJQUNGO0FBRUEsVUFBTSxLQUFLLDZCQUE2QixJQUFJLE9BQU8sTUFBTSxPQUFPLE9BQU8sT0FBTyxJQUFJO0FBQ2xGLFFBQUksU0FBUyxJQUFJLHdCQUF3QixFQUFFLENBQUM7QUFBQSxFQUM5QztBQUFBLEVBRUEsa0JBQWtCLEtBQWE7QUFDN0IsVUFBTSxTQUFTLEdBQUcsZUFBZTtBQUNqQyxRQUFJLENBQUMsSUFBSSxXQUFXLE1BQU0sR0FBRztBQUMzQixhQUFPO0FBQUEsSUFDVDtBQUVBLFdBQU8sSUFBSSxNQUFNLE9BQU8sTUFBTTtBQUFBLEVBQ2hDO0FBQUEsRUFFQSxNQUFjLDZCQUE2QixJQUFpQixZQUFvQixLQUFhO0FBQzNGLFVBQU0sTUFBTSxTQUFTLGNBQWMsS0FBSztBQUN4QyxRQUFJLE1BQU07QUFDVixRQUFJLGFBQWEsc0JBQXNCLFVBQVU7QUFDakQsUUFBSSxVQUFVLElBQUksdUJBQXVCLFlBQVk7QUFDckQsT0FBRyxNQUFNO0FBQ1QsT0FBRyxZQUFZLEdBQUc7QUFDbEIsVUFBTSxLQUFLLGdCQUFnQixHQUFHO0FBQUEsRUFDaEM7QUFBQSxFQUVBLE1BQWMsZ0JBQWdCLEtBQXVCO0FBQ25ELFVBQU0sYUFBYSxJQUFJLGFBQWEsb0JBQW9CLEtBQUssS0FBSyxrQkFBa0IsSUFBSSxhQUFhLEtBQUssS0FBSyxFQUFFO0FBQ2pILFFBQUksQ0FBQyxZQUFZO0FBQ2Y7QUFBQSxJQUNGO0FBRUEsUUFBSSxVQUFVLElBQUksdUJBQXVCLFlBQVk7QUFDckQsVUFBTSxjQUFjLElBQUk7QUFDeEIsUUFBSSxNQUFNLGVBQWUsS0FBSyxLQUFLLEVBQUUsaURBQWMseUJBQXlCO0FBRTVFLFFBQUk7QUFDRixZQUFNLFVBQVUsTUFBTSxLQUFLLEtBQUssd0JBQXdCLFVBQVU7QUFDbEUsVUFBSSxNQUFNO0FBQ1YsVUFBSSxNQUFNO0FBQ1YsVUFBSSxNQUFNLFVBQVU7QUFDcEIsVUFBSSxNQUFNLFdBQVc7QUFDckIsVUFBSSxVQUFVLE9BQU8sY0FBYyxVQUFVO0FBQUEsSUFDL0MsU0FBUyxPQUFPO0FBQ2QsY0FBUSxNQUFNLG1DQUFtQyxLQUFLO0FBQ3RELFVBQUksWUFBWSxLQUFLLGtCQUFrQixZQUFZLEtBQUssQ0FBQztBQUFBLElBQzNEO0FBQUEsRUFDRjtBQUFBLEVBRVEsa0JBQWtCLFlBQW9CLE9BQWdCO0FBQzVELFVBQU0sS0FBSyxTQUFTLGNBQWMsS0FBSztBQUN2QyxPQUFHLFlBQVk7QUFDZixVQUFNLFVBQVUsaUJBQWlCLFFBQVEsTUFBTSxVQUFVLE9BQU8sS0FBSztBQUNyRSxPQUFHLGNBQWMsS0FBSyxLQUFLO0FBQUEsTUFDekIseURBQVksVUFBVSxTQUFJLE9BQU87QUFBQSxNQUNqQyx3QkFBd0IsVUFBVSxLQUFLLE9BQU87QUFBQSxJQUNoRDtBQUNBLFdBQU87QUFBQSxFQUNUO0FBQ0Y7OztBQ3BMQSxJQUFBQyxtQkFBd0U7QUFpRGpFLElBQU0saUNBQU4sTUFBcUM7QUFBQSxFQUsxQyxZQUE2QixNQUFtQztBQUFuQztBQUo3QixTQUFRLG9CQUFvQixvQkFBSSxJQUFZO0FBQzVDLFNBQVEsZ0JBQWdCLG9CQUFJLElBQW9CO0FBQ2hELFNBQVEsc0JBQXNCLG9CQUFJLElBQTJCO0FBQUEsRUFFSTtBQUFBLEVBRWpFLFVBQVU7QUFDUixlQUFXLGFBQWEsS0FBSyxjQUFjLE9BQU8sR0FBRztBQUNuRCxhQUFPLGFBQWEsU0FBUztBQUFBLElBQy9CO0FBQ0EsU0FBSyxjQUFjLE1BQU07QUFBQSxFQUMzQjtBQUFBLEVBRUEsaUJBQWlCO0FBQ2YsV0FDRSxLQUFLLEtBQUssU0FBUyxFQUFFLFNBQVMsS0FDOUIsS0FBSyxrQkFBa0IsT0FBTyxLQUM5QixLQUFLLG9CQUFvQixPQUFPO0FBQUEsRUFFcEM7QUFBQSxFQUVBLHNCQUFzQixVQUFrQjtBQUN0QyxVQUFNLFFBQVEsS0FBSyxLQUFLLFNBQVM7QUFDakMsUUFBSSxNQUFNLEtBQUssQ0FBQyxTQUFTLEtBQUssYUFBYSxRQUFRLEdBQUc7QUFDcEQsYUFBTztBQUFBLElBQ1Q7QUFFQSxlQUFXLFVBQVUsS0FBSyxtQkFBbUI7QUFDM0MsWUFBTSxPQUFPLE1BQU0sS0FBSyxDQUFDLFNBQVMsS0FBSyxPQUFPLE1BQU07QUFDcEQsVUFBSSxNQUFNLGFBQWEsVUFBVTtBQUMvQixlQUFPO0FBQUEsTUFDVDtBQUFBLElBQ0Y7QUFFQSxlQUFXLENBQUMsTUFBTSxLQUFLLEtBQUsscUJBQXFCO0FBQy9DLFlBQU0sT0FBTyxNQUFNLEtBQUssQ0FBQyxTQUFTLEtBQUssT0FBTyxNQUFNO0FBQ3BELFVBQUksTUFBTSxhQUFhLFVBQVU7QUFDL0IsZUFBTztBQUFBLE1BQ1Q7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVBLE1BQU0seUJBQXlCLFVBQWlCLFFBQWdCLFdBQWlCLFVBQWtCO0FBQ2pHLFFBQUk7QUFDRixZQUFNLGNBQWMsTUFBTSxVQUFVLFlBQVk7QUFDaEQsWUFBTSxPQUFPLEtBQUs7QUFBQSxRQUNoQixTQUFTO0FBQUEsUUFDVDtBQUFBLFFBQ0EsVUFBVSxRQUFRLEtBQUssS0FBSyx3QkFBd0IsUUFBUTtBQUFBLFFBQzVEO0FBQUEsTUFDRjtBQUNBLFdBQUssa0JBQWtCLFFBQVEsS0FBSyxXQUFXO0FBQy9DLFdBQUssS0FBSyxTQUFTLENBQUMsR0FBRyxLQUFLLEtBQUssU0FBUyxHQUFHLElBQUksQ0FBQztBQUNsRCxZQUFNLEtBQUssS0FBSyxnQkFBZ0I7QUFDaEMsV0FBSyxLQUFLLG9CQUFvQjtBQUM5QixVQUFJLHdCQUFPLEtBQUssS0FBSyxFQUFFLDRFQUFnQix1Q0FBdUMsQ0FBQztBQUFBLElBQ2pGLFNBQVMsT0FBTztBQUNkLGNBQVEsTUFBTSx1Q0FBdUMsS0FBSztBQUMxRCxVQUFJO0FBQUEsUUFDRixLQUFLLEtBQUs7QUFBQSxVQUNSLEtBQUssS0FBSyxFQUFFLDRFQUFnQix1Q0FBdUM7QUFBQSxVQUNuRTtBQUFBLFFBQ0Y7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUEsRUFFQSxpQkFBaUIsVUFBa0IsUUFBcUIsVUFBa0IsVUFBOEI7QUFDdEcsVUFBTSxLQUFLLHNCQUFzQixLQUFLLElBQUksQ0FBQyxJQUFJLEtBQUssT0FBTyxFQUFFLFNBQVMsRUFBRSxFQUFFLE1BQU0sR0FBRyxDQUFDLENBQUM7QUFDckYsV0FBTztBQUFBLE1BQ0w7QUFBQSxNQUNBO0FBQUEsTUFDQSxhQUFhLEtBQUssd0JBQXdCLElBQUksUUFBUTtBQUFBLE1BQ3REO0FBQUEsTUFDQTtBQUFBLE1BQ0EsWUFBWSxLQUFLLEtBQUssb0JBQW9CLE1BQU07QUFBQSxNQUNoRCxVQUFVO0FBQUEsTUFDVixXQUFXLEtBQUssSUFBSTtBQUFBLElBQ3RCO0FBQUEsRUFDRjtBQUFBLEVBRUEsd0JBQXdCLFFBQWdCLFVBQWtCO0FBQ3hELFVBQU0sV0FBVyxLQUFLLEtBQUssV0FBVyxRQUFRO0FBQzlDLFdBQU8sZ0VBQWdFLE1BQU0saUJBQWlCLFFBQVEsS0FBSyxLQUFLLEtBQUssV0FBVyxLQUFLLEtBQUssRUFBRSw2Q0FBVSxRQUFRLFVBQUssc0JBQXNCLFFBQVEsR0FBRyxDQUFDLENBQUM7QUFBQSxFQUN4TTtBQUFBLEVBRUEsdUJBQXVCLFVBQWtCLFNBQWtCO0FBQ3pELFVBQU0sV0FBVyxLQUFLLEtBQUssV0FBVyxRQUFRO0FBQzlDLFVBQU0sY0FBYyxLQUFLLEtBQUssV0FBVyxXQUFXLEtBQUssS0FBSyxFQUFFLDRCQUFRLGVBQWUsQ0FBQztBQUN4RixVQUFNLFFBQVEsS0FBSyxLQUFLLFdBQVcsS0FBSyxLQUFLLEVBQUUsbURBQVcsUUFBUSxVQUFLLDBCQUEwQixRQUFRLEdBQUcsQ0FBQztBQUM3RyxXQUFPLGtEQUFrRCxRQUFRLEtBQUssS0FBSyxLQUFLLFdBQVc7QUFBQSxFQUM3RjtBQUFBLEVBRUEsTUFBTSxzQkFBc0I7QUFDMUIsVUFBTSxVQUEyQixDQUFDO0FBQ2xDLGVBQVcsUUFBUSxLQUFLLEtBQUssU0FBUyxHQUFHO0FBQ3ZDLFVBQUksS0FBSyxrQkFBa0IsSUFBSSxLQUFLLEVBQUUsR0FBRztBQUN2QztBQUFBLE1BQ0Y7QUFFQSxjQUFRLEtBQUssS0FBSyxpQkFBaUIsSUFBSSxDQUFDO0FBQUEsSUFDMUM7QUFFQSxVQUFNLFFBQVEsV0FBVyxPQUFPO0FBQUEsRUFDbEM7QUFBQSxFQUVBLGlCQUFpQixNQUFrQjtBQUNqQyxVQUFNLFdBQVcsS0FBSyxvQkFBb0IsSUFBSSxLQUFLLEVBQUU7QUFDckQsUUFBSSxVQUFVO0FBQ1osYUFBTztBQUFBLElBQ1Q7QUFFQSxVQUFNLFVBQVUsS0FBSyxZQUFZLElBQUksRUFBRSxRQUFRLE1BQU07QUFDbkQsV0FBSyxvQkFBb0IsT0FBTyxLQUFLLEVBQUU7QUFBQSxJQUN6QyxDQUFDO0FBQ0QsU0FBSyxvQkFBb0IsSUFBSSxLQUFLLElBQUksT0FBTztBQUM3QyxXQUFPO0FBQUEsRUFDVDtBQUFBLEVBRUEsTUFBTSxZQUFZLE1BQWtCO0FBQ2xDLFNBQUssa0JBQWtCLElBQUksS0FBSyxFQUFFO0FBQ2xDLFFBQUk7QUFDRixZQUFNLFNBQVMsS0FBSyxLQUFLLG9CQUFvQixLQUFLLFVBQVU7QUFDNUQsWUFBTSxXQUFXLE1BQU0sS0FBSyxLQUFLO0FBQUEsUUFDL0I7QUFBQSxRQUNBLEtBQUssWUFBWSxLQUFLLEtBQUssd0JBQXdCLEtBQUssUUFBUTtBQUFBLFFBQ2hFLEtBQUs7QUFBQSxNQUNQO0FBQ0EsWUFBTSxhQUFhLE1BQU0sS0FBSyxLQUFLLDhCQUE4QixTQUFTLFVBQVUsU0FBUyxNQUFNO0FBQ25HLFlBQU0sYUFBYSxLQUFLLEtBQUssZ0JBQWdCLFVBQVU7QUFDdkQsWUFBTSxXQUFXLE1BQU0sS0FBSyxLQUFLLFdBQVc7QUFBQSxRQUMxQyxLQUFLLEtBQUssS0FBSyxlQUFlLFVBQVU7QUFBQSxRQUN4QyxRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsVUFDUCxlQUFlLEtBQUssS0FBSyxnQkFBZ0I7QUFBQSxVQUN6QyxnQkFBZ0IsU0FBUztBQUFBLFFBQzNCO0FBQUEsUUFDQSxNQUFNLFNBQVM7QUFBQSxNQUNqQixDQUFDO0FBRUQsVUFBSSxTQUFTLFNBQVMsT0FBTyxTQUFTLFVBQVUsS0FBSztBQUNuRCxjQUFNLElBQUksTUFBTSw2QkFBNkIsU0FBUyxNQUFNLEVBQUU7QUFBQSxNQUNoRTtBQUVBLFlBQU0sV0FBVyxNQUFNLEtBQUs7QUFBQSxRQUMxQixLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsUUFDTCxLQUFLLEtBQUssdUJBQXVCLG1CQUFtQixVQUFVLElBQUksU0FBUyxRQUFRO0FBQUEsTUFDckY7QUFDQSxVQUFJLENBQUMsVUFBVTtBQUNiLGNBQU0sSUFBSTtBQUFBLFVBQ1IsS0FBSyxLQUFLO0FBQUEsWUFDUjtBQUFBLFlBQ0E7QUFBQSxVQUNGO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFFQSxXQUFLLEtBQUssU0FBUyxLQUFLLEtBQUssU0FBUyxFQUFFLE9BQU8sQ0FBQyxTQUFTLEtBQUssT0FBTyxLQUFLLEVBQUUsQ0FBQztBQUM3RSxZQUFNLEtBQUssS0FBSyxnQkFBZ0I7QUFDaEMsV0FBSyxLQUFLLHlCQUF5QixLQUFLLFVBQVUsV0FBVztBQUM3RCxVQUFJLHdCQUFPLEtBQUssS0FBSyxFQUFFLDhDQUFXLDhCQUE4QixDQUFDO0FBQUEsSUFDbkUsU0FBUyxPQUFPO0FBQ2QsY0FBUSxNQUFNLHNDQUFzQyxLQUFLO0FBQ3pELFdBQUssWUFBWTtBQUNqQixXQUFLLFlBQVksaUJBQWlCLFFBQVEsTUFBTSxVQUFVLE9BQU8sS0FBSztBQUN0RSxZQUFNLEtBQUssS0FBSyxnQkFBZ0I7QUFFaEMsVUFBSSxLQUFLLFlBQVksS0FBSyxLQUFLLFNBQVMsRUFBRSxrQkFBa0I7QUFDMUQsY0FBTSxLQUFLO0FBQUEsVUFDVCxLQUFLO0FBQUEsVUFDTCxLQUFLO0FBQUEsVUFDTCxLQUFLO0FBQUEsVUFDTCxLQUFLLHVCQUF1QixLQUFLLFVBQVUsS0FBSyxTQUFTO0FBQUEsUUFDM0Q7QUFDQSxhQUFLLEtBQUssU0FBUyxLQUFLLEtBQUssU0FBUyxFQUFFLE9BQU8sQ0FBQyxTQUFTLEtBQUssT0FBTyxLQUFLLEVBQUUsQ0FBQztBQUM3RSxjQUFNLEtBQUssS0FBSyxnQkFBZ0I7QUFDaEMsWUFBSSx3QkFBTyxLQUFLLEtBQUssY0FBYyxLQUFLLEtBQUssRUFBRSxvREFBWSxpQ0FBaUMsR0FBRyxLQUFLLEdBQUcsR0FBSTtBQUFBLE1BQzdHLE9BQU87QUFDTCxhQUFLLGNBQWMsSUFBSTtBQUFBLE1BQ3pCO0FBQUEsSUFDRixVQUFFO0FBQ0EsV0FBSyxrQkFBa0IsT0FBTyxLQUFLLEVBQUU7QUFBQSxJQUN2QztBQUFBLEVBQ0Y7QUFBQSxFQUVBLGNBQWMsTUFBa0I7QUFDOUIsVUFBTSxXQUFXLEtBQUssY0FBYyxJQUFJLEtBQUssRUFBRTtBQUMvQyxRQUFJLFVBQVU7QUFDWixhQUFPLGFBQWEsUUFBUTtBQUFBLElBQzlCO0FBRUEsVUFBTSxRQUFRLEtBQUssSUFBSSxHQUFHLEtBQUssS0FBSyxTQUFTLEVBQUUsaUJBQWlCLElBQUksTUFBTyxLQUFLO0FBQ2hGLFVBQU0sWUFBWSxPQUFPLFdBQVcsTUFBTTtBQUN4QyxXQUFLLGNBQWMsT0FBTyxLQUFLLEVBQUU7QUFDakMsV0FBSyxLQUFLLGlCQUFpQixJQUFJO0FBQUEsSUFDakMsR0FBRyxLQUFLO0FBQ1IsU0FBSyxjQUFjLElBQUksS0FBSyxJQUFJLFNBQVM7QUFBQSxFQUMzQztBQUFBLEVBRVEsa0JBQWtCLFFBQWdCLGFBQXFCO0FBQzdELFdBQU8saUJBQWlCLEdBQUcsV0FBVztBQUFBLENBQUk7QUFBQSxFQUM1QztBQUFBLEVBRUEsTUFBTSxtQkFBbUIsVUFBa0IsUUFBZ0IsYUFBcUIsYUFBcUI7QUFDbkcsVUFBTSxtQkFBbUIsS0FBSyxnQ0FBZ0MsVUFBVSxRQUFRLGFBQWEsV0FBVztBQUN4RyxRQUFJLGtCQUFrQjtBQUNwQixhQUFPO0FBQUEsSUFDVDtBQUVBLFVBQU0sT0FBTyxLQUFLLEtBQUssSUFBSSxNQUFNLHNCQUFzQixRQUFRO0FBQy9ELFFBQUksRUFBRSxnQkFBZ0IseUJBQVE7QUFDNUIsYUFBTztBQUFBLElBQ1Q7QUFFQSxVQUFNLFVBQVUsTUFBTSxLQUFLLEtBQUssSUFBSSxNQUFNLEtBQUssSUFBSTtBQUNuRCxRQUFJLFFBQVEsU0FBUyxXQUFXLEdBQUc7QUFDakMsWUFBTSxVQUFVLFFBQVEsUUFBUSxhQUFhLFdBQVc7QUFDeEQsVUFBSSxZQUFZLFNBQVM7QUFDdkIsY0FBTSxLQUFLLEtBQUssSUFBSSxNQUFNLE9BQU8sTUFBTSxPQUFPO0FBQzlDLGVBQU87QUFBQSxNQUNUO0FBQUEsSUFDRjtBQUVBLFVBQU0sVUFBVSxJQUFJO0FBQUEsTUFDbEIsc0NBQXNDLEtBQUssS0FBSyxhQUFhLE1BQU0sQ0FBQztBQUFBLE1BQ3BFO0FBQUEsSUFDRjtBQUNBLFFBQUksUUFBUSxLQUFLLE9BQU8sR0FBRztBQUN6QixZQUFNLFVBQVUsUUFBUSxRQUFRLFNBQVMsV0FBVztBQUNwRCxVQUFJLFlBQVksU0FBUztBQUN2QixjQUFNLEtBQUssS0FBSyxJQUFJLE1BQU0sT0FBTyxNQUFNLE9BQU87QUFDOUMsZUFBTztBQUFBLE1BQ1Q7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVRLGdDQUFnQyxVQUFrQixRQUFnQixhQUFxQixhQUFxQjtBQUNsSCxRQUFJLFdBQVc7QUFDZixVQUFNLFNBQVMsS0FBSyxLQUFLLElBQUksVUFBVSxnQkFBZ0IsVUFBVTtBQUVqRSxlQUFXLFFBQVEsUUFBUTtBQUN6QixZQUFNLE9BQU8sS0FBSztBQUNsQixVQUFJLEVBQUUsZ0JBQWdCLGdDQUFlO0FBQ25DO0FBQUEsTUFDRjtBQUVBLFVBQUksQ0FBQyxLQUFLLFFBQVEsS0FBSyxLQUFLLFNBQVMsVUFBVTtBQUM3QztBQUFBLE1BQ0Y7QUFFQSxZQUFNLFNBQVMsS0FBSztBQUNwQixZQUFNLFVBQVUsT0FBTyxTQUFTO0FBQ2hDLFVBQUksVUFBVTtBQUVkLFVBQUksUUFBUSxTQUFTLFdBQVcsR0FBRztBQUNqQyxrQkFBVSxRQUFRLFFBQVEsYUFBYSxXQUFXO0FBQUEsTUFDcEQsT0FBTztBQUNMLGNBQU0sVUFBVSxJQUFJO0FBQUEsVUFDbEIsc0NBQXNDLEtBQUssS0FBSyxhQUFhLE1BQU0sQ0FBQztBQUFBLFVBQ3BFO0FBQUEsUUFDRjtBQUNBLGtCQUFVLFFBQVEsUUFBUSxTQUFTLFdBQVc7QUFBQSxNQUNoRDtBQUVBLFVBQUksWUFBWSxTQUFTO0FBQ3ZCLGVBQU8sU0FBUyxPQUFPO0FBQ3ZCLG1CQUFXO0FBQUEsTUFDYjtBQUFBLElBQ0Y7QUFFQSxXQUFPO0FBQUEsRUFDVDtBQUNGOzs7QUN6VUEsSUFBQUMsbUJBQW1EO0FBMEI1QyxJQUFNLDBCQUFOLE1BQThCO0FBQUEsRUFDbkMsWUFBNkIsTUFBbUM7QUFBbkM7QUFBQSxFQUFvQztBQUFBLEVBRWpFLG1CQUFtQixNQUFjO0FBQy9CLFVBQU0scUJBQWlCLGdDQUFjLElBQUksRUFBRSxRQUFRLFFBQVEsRUFBRSxFQUFFLFFBQVEsUUFBUSxFQUFFO0FBQ2pGLFFBQUksQ0FBQyxnQkFBZ0I7QUFDbkIsYUFBTztBQUFBLElBQ1Q7QUFFQSxVQUFNLFVBQVUsS0FBSyxLQUFLLHlCQUF5QixLQUFLLENBQUM7QUFDekQsV0FBTyxRQUFRLEtBQUssQ0FBQyxXQUFXO0FBQzlCLFlBQU0sdUJBQW1CLGdDQUFjLE1BQU0sRUFBRSxRQUFRLFFBQVEsRUFBRSxFQUFFLFFBQVEsUUFBUSxFQUFFO0FBQ3JGLGFBQU8saUJBQWlCLFNBQVMsTUFBTSxtQkFBbUIsb0JBQW9CLGVBQWUsV0FBVyxHQUFHLGdCQUFnQixHQUFHO0FBQUEsSUFDaEksQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLDBCQUEwQixNQUFjO0FBQ3RDLFVBQU0scUJBQWlCLGdDQUFjLElBQUk7QUFDekMsUUFDRSxLQUFLLG1CQUFtQixjQUFjLEtBQ3RDLGVBQWUsV0FBVyxZQUFZLEtBQ3RDLGVBQWUsV0FBVyxTQUFTLEtBQ25DLGVBQWUsV0FBVyxPQUFPLEtBQ2pDLGVBQWUsV0FBVyxlQUFlLEtBQ3pDLGVBQWUsV0FBVyxtQkFBbUIsS0FDN0MsZUFBZSxXQUFXLE9BQU8sS0FDakMsZUFBZSxXQUFXLHlDQUF5QyxHQUNuRTtBQUNBLGFBQU87QUFBQSxJQUNUO0FBRUEsV0FBTyxtQ0FBbUMsS0FBSyxjQUFjO0FBQUEsRUFDL0Q7QUFBQSxFQUVBLDRCQUE0QixTQUFpQjtBQUMzQyxVQUFNLFFBQUksZ0NBQWMsT0FBTztBQUMvQixXQUNFLEtBQUssbUJBQW1CLENBQUMsS0FDekIsRUFBRSxXQUFXLFdBQVcsS0FDeEIsRUFBRSxXQUFXLFFBQVEsS0FDckIsRUFBRSxXQUFXLE1BQU0sS0FDbkIsRUFBRSxXQUFXLGNBQWMsS0FDM0IsRUFBRSxXQUFXLGtCQUFrQixLQUMvQixFQUFFLFdBQVcsT0FBTztBQUFBLEVBRXhCO0FBQUEsRUFFQSxnQ0FBZ0M7QUFDOUIsVUFBTSxPQUFPLG9CQUFJLElBQVk7QUFDN0IsZUFBVyxLQUFLLEtBQUssS0FBSyxJQUFJLE1BQU0sY0FBYyxHQUFHO0FBQ25ELFVBQUksYUFBYSw0QkFBVyxDQUFDLEVBQUUsT0FBTyxLQUFLLENBQUMsS0FBSyw0QkFBNEIsRUFBRSxJQUFJLEdBQUc7QUFDcEYsYUFBSyxRQUFJLGdDQUFjLEVBQUUsSUFBSSxDQUFDO0FBQUEsTUFDaEM7QUFBQSxJQUNGO0FBQ0EsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVBLDJCQUEyQjtBQUN6QixXQUFPLEtBQUssS0FBSyxJQUFJLE1BQ2xCLFNBQVMsRUFDVCxPQUFPLENBQUMsU0FBUyxDQUFDLEtBQUssMEJBQTBCLEtBQUssSUFBSSxDQUFDLEVBQzNELEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxLQUFLLGNBQWMsRUFBRSxJQUFJLENBQUM7QUFBQSxFQUNoRDtBQUFBLEVBRUEsbUJBQW1CLE1BQWE7QUFDOUIsV0FBTyxHQUFHLEtBQUssS0FBSyxLQUFLLElBQUksS0FBSyxLQUFLLElBQUk7QUFBQSxFQUM3QztBQUFBLEVBRUEseUJBQXlCLFFBQXVEO0FBQzlFLFdBQU8sR0FBRyxPQUFPLFlBQVksSUFBSSxPQUFPLElBQUk7QUFBQSxFQUM5QztBQUFBLEVBRUEseUJBQXlCLFdBQW1CO0FBQzFDLFdBQU8sR0FBRyxLQUFLLGdCQUFnQixLQUFLLEtBQUsseUJBQXlCLENBQUMsQ0FBQyxHQUFHLFNBQVM7QUFBQSxFQUNsRjtBQUFBLEVBRUEsc0JBQXNCO0FBQ3BCLFdBQU8sR0FBRyxLQUFLLGdCQUFnQixLQUFLLEtBQUsseUJBQXlCLENBQUMsRUFBRSxRQUFRLE9BQU8sRUFBRSxDQUFDLEdBQUcsS0FBSyxLQUFLLG9CQUFvQjtBQUFBLEVBQzFIO0FBQUEsRUFFQSx3QkFBd0IsV0FBbUI7QUFDekMsV0FBTyxHQUFHLEtBQUssb0JBQW9CLENBQUMsR0FBRyxLQUFLLEtBQUssZ0JBQWdCLFNBQVMsQ0FBQztBQUFBLEVBQzdFO0FBQUEsRUFFQSw4QkFBOEIsWUFBb0I7QUFDaEQsVUFBTSxPQUFPLEtBQUssb0JBQW9CO0FBQ3RDLFFBQUksQ0FBQyxXQUFXLFdBQVcsSUFBSSxLQUFLLENBQUMsV0FBVyxTQUFTLE9BQU8sR0FBRztBQUNqRSxhQUFPO0FBQUEsSUFDVDtBQUVBLFVBQU0sVUFBVSxXQUFXLE1BQU0sS0FBSyxRQUFRLENBQUMsUUFBUSxNQUFNO0FBQzdELFFBQUk7QUFDRixhQUFPLEtBQUssS0FBSyxnQkFBZ0IsT0FBTztBQUFBLElBQzFDLFFBQVE7QUFDTixhQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Y7QUFBQSxFQUVBLDhCQUE4QixLQUF1QztBQUNuRSxRQUFJO0FBQ0YsWUFBTSxTQUFTLEtBQUssTUFBTSxHQUFHO0FBQzdCLFVBQUksQ0FBQyxVQUFVLE9BQU8sT0FBTyxTQUFTLFlBQVksT0FBTyxPQUFPLGNBQWMsVUFBVTtBQUN0RixlQUFPO0FBQUEsTUFDVDtBQUNBLFVBQUksT0FBTyxvQkFBb0IsVUFBYSxPQUFPLE9BQU8sb0JBQW9CLFVBQVU7QUFDdEYsZUFBTztBQUFBLE1BQ1Q7QUFDQSxhQUFPO0FBQUEsUUFDTCxNQUFNLE9BQU87QUFBQSxRQUNiLFdBQVcsT0FBTztBQUFBLFFBQ2xCLGlCQUFpQixPQUFPO0FBQUEsTUFDMUI7QUFBQSxJQUNGLFFBQVE7QUFDTixhQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Y7QUFBQSxFQUVBLHNCQUFzQixZQUFvQjtBQUN4QyxVQUFNLE9BQU8sS0FBSyxnQkFBZ0IsS0FBSyxLQUFLLHlCQUF5QixDQUFDO0FBQ3RFLFFBQUksQ0FBQyxXQUFXLFdBQVcsSUFBSSxHQUFHO0FBQ2hDLGFBQU87QUFBQSxJQUNUO0FBRUEsV0FBTyxXQUFXLE1BQU0sS0FBSyxNQUFNLEVBQUUsUUFBUSxRQUFRLEVBQUU7QUFBQSxFQUN6RDtBQUFBLEVBRUEsNEJBQTRCLFlBQW9CLGFBQXFCO0FBQ25FLFdBQU8sY0FBYyxhQUFhO0FBQUEsRUFDcEM7QUFBQSxFQUVBLHlCQUNFLFdBQ0EsUUFDQTtBQUNBLFVBQU0sVUFBVTtBQUNoQixRQUFJLENBQUMsUUFBUTtBQUNYLGFBQU87QUFBQSxJQUNUO0FBRUEsUUFBSSxVQUFVLGlCQUFpQjtBQUM3QixhQUFPLE9BQU8sY0FBYyxVQUFVO0FBQUEsSUFDeEM7QUFFQSxXQUFPLE9BQU8sZ0JBQWdCLFVBQVUsWUFBWTtBQUFBLEVBQ3REO0FBQUEsRUFFQSwrQkFBK0IsTUFBYSxXQUE4QjtBQUN4RSxVQUFNLFVBQVU7QUFDaEIsV0FBTyxLQUFLLEtBQUssU0FBUyxVQUFVLFlBQVk7QUFBQSxFQUNsRDtBQUFBLEVBRVEsZ0JBQWdCLE9BQWU7QUFDckMsV0FBTyxnQkFBZ0IsS0FBSztBQUFBLEVBQzlCO0FBQ0Y7QUFFTyxTQUFTLGdCQUFnQixPQUFlO0FBQzdDLFNBQU8sTUFBTSxRQUFRLFFBQVEsRUFBRSxFQUFFLFFBQVEsUUFBUSxFQUFFLElBQUk7QUFDekQ7OztBSHJHQSxJQUFNLG1CQUF5QztBQUFBLEVBQzdDLFdBQVc7QUFBQSxFQUNYLFVBQVU7QUFBQSxFQUNWLFVBQVU7QUFBQSxFQUNWLGNBQWM7QUFBQSxFQUNkLHVCQUF1QjtBQUFBLEVBQ3ZCLHFCQUFxQixDQUFDLElBQUk7QUFBQSxFQUMxQixnQkFBZ0I7QUFBQSxFQUNoQix3QkFBd0I7QUFBQSxFQUN4QixVQUFVO0FBQUEsRUFDVixpQkFBaUI7QUFBQSxFQUNqQixvQkFBb0I7QUFBQSxFQUNwQix5QkFBeUI7QUFBQSxFQUN6QixrQkFBa0I7QUFBQSxFQUNsQixtQkFBbUI7QUFBQSxFQUNuQiw4QkFBOEI7QUFBQSxFQUM5QixnQkFBZ0I7QUFBQSxFQUNoQixxQkFBcUI7QUFBQSxFQUNyQixtQkFBbUI7QUFBQSxFQUNuQixhQUFhO0FBQ2Y7QUFFQSxJQUFNLFdBQW1DO0FBQUEsRUFDdkMsS0FBSztBQUFBLEVBQ0wsTUFBTTtBQUFBLEVBQ04sS0FBSztBQUFBLEVBQ0wsS0FBSztBQUFBLEVBQ0wsTUFBTTtBQUFBLEVBQ04sS0FBSztBQUFBLEVBQ0wsS0FBSztBQUFBLEVBQ0wsY0FBYztBQUFBLEVBQ2QsYUFBYTtBQUFBLEVBQ2IsYUFBYTtBQUFBLEVBQ2IsY0FBYztBQUFBLEVBQ2QsYUFBYTtBQUFBLEVBQ2IsaUJBQWlCO0FBQ25CO0FBRUEsSUFBTSxtQkFBbUI7QUFFekIsSUFBcUIsMkJBQXJCLGNBQXNELHdCQUFPO0FBQUEsRUFBN0Q7QUFBQTtBQUNFLG9CQUFpQztBQUNqQyxpQkFBc0IsQ0FBQztBQUN2QixTQUFRLFdBQVcsb0JBQUksSUFBWTtBQUNuQyxTQUFpQixjQUFjO0FBQy9CLFNBQVEsaUJBQWlCLG9CQUFJLElBQXlCO0FBQ3RELFNBQVEsd0JBQXdCLG9CQUFJLElBQVk7QUFDaEQsU0FBUSx1QkFBdUIsb0JBQUksSUFBb0I7QUFDdkQsU0FBUSxZQUFZLG9CQUFJLElBQTRCO0FBQ3BELFNBQVEsb0JBQW9CLG9CQUFJLElBQVk7QUFDNUMsU0FBUSx5QkFBeUIsb0JBQUksSUFBcUM7QUFDMUUsU0FBUSx3QkFBd0Isb0JBQUksSUFBWTtBQUNoRCxTQUFRLDRCQUE0QixvQkFBSSxJQUFrQztBQUMxRSxTQUFRLDBCQUEwQixvQkFBSSxJQUFnQztBQUN0RSxTQUFRLCtCQUErQixvQkFBSSxJQUFtQjtBQUM5RCxTQUFRLDJCQUEyQixvQkFBSSxJQUFvQjtBQUMzRCxTQUFRLDRCQUE0QixvQkFBSSxJQUFZO0FBQ3BELFNBQVEsNkJBQTZCLG9CQUFJLElBQW9CO0FBQzdELFNBQVEsOEJBQThCLG9CQUFJLElBQVk7QUFDdEQsU0FBUSxrQkFBa0I7QUFDMUIsU0FBUSxzQkFBc0I7QUFDOUIsU0FBUSxpQkFBaUI7QUFDekIsU0FBUSx5QkFBeUI7QUFVakMsU0FBaUIsdUJBQXVCO0FBQ3hDLFNBQWlCLGlDQUFpQztBQUFBO0FBQUEsRUFFMUMsMkJBQTJCO0FBR2pDLFNBQUssZUFBZSxJQUFJLHlCQUF5QjtBQUFBLE1BQy9DLEdBQUcsS0FBSyxFQUFFLEtBQUssSUFBSTtBQUFBLE1BQ25CLHlCQUF5QixLQUFLLHdCQUF3QixLQUFLLElBQUk7QUFBQSxJQUNqRSxDQUFDO0FBQ0QsU0FBSyxjQUFjLElBQUksK0JBQStCO0FBQUEsTUFDcEQsS0FBSyxLQUFLO0FBQUEsTUFDVixHQUFHLEtBQUssRUFBRSxLQUFLLElBQUk7QUFBQSxNQUNuQixVQUFVLE1BQU0sS0FBSztBQUFBLE1BQ3JCLFVBQVUsTUFBTSxLQUFLO0FBQUEsTUFDckIsVUFBVSxDQUFDLFVBQVU7QUFDbkIsYUFBSyxRQUFRO0FBQUEsTUFDZjtBQUFBLE1BQ0EsaUJBQWlCLEtBQUssZ0JBQWdCLEtBQUssSUFBSTtBQUFBLE1BQy9DLDBCQUEwQixLQUFLLHlCQUF5QixLQUFLLElBQUk7QUFBQSxNQUNqRSxZQUFZLEtBQUssV0FBVyxLQUFLLElBQUk7QUFBQSxNQUNyQyxnQkFBZ0IsS0FBSyxlQUFlLEtBQUssSUFBSTtBQUFBLE1BQzdDLGlCQUFpQixLQUFLLGdCQUFnQixLQUFLLElBQUk7QUFBQSxNQUMvQyxzQkFBc0IsS0FBSyxxQkFBcUIsS0FBSyxJQUFJO0FBQUEsTUFDekQsK0JBQStCLEtBQUssOEJBQThCLEtBQUssSUFBSTtBQUFBLE1BQzNFLGlCQUFpQixLQUFLLGdCQUFnQixLQUFLLElBQUk7QUFBQSxNQUMvQyx3QkFBd0IsS0FBSyxhQUFhLHVCQUF1QixLQUFLLEtBQUssWUFBWTtBQUFBLE1BQ3ZGLHlCQUF5QixLQUFLLHdCQUF3QixLQUFLLElBQUk7QUFBQSxNQUMvRCxxQkFBcUIsS0FBSyxvQkFBb0IsS0FBSyxJQUFJO0FBQUEsTUFDdkQscUJBQXFCLEtBQUssb0JBQW9CLEtBQUssSUFBSTtBQUFBLE1BQ3ZELFlBQVksS0FBSyxXQUFXLEtBQUssSUFBSTtBQUFBLE1BQ3JDLGNBQWMsS0FBSyxhQUFhLEtBQUssSUFBSTtBQUFBLE1BQ3pDLGVBQWUsS0FBSyxjQUFjLEtBQUssSUFBSTtBQUFBLElBQzdDLENBQUM7QUFDRCxTQUFLLGNBQWMsSUFBSSx3QkFBd0I7QUFBQSxNQUM3QyxLQUFLLEtBQUs7QUFBQSxNQUNWLDBCQUEwQixNQUFNLEtBQUssU0FBUztBQUFBLE1BQzlDLHdCQUF3QixNQUFNLEtBQUssU0FBUyx1QkFBdUIsQ0FBQztBQUFBLE1BQ3BFLHNCQUFzQixLQUFLO0FBQUEsTUFDM0IsaUJBQWlCLENBQUMsVUFDaEIsS0FBSyxvQkFBb0IsS0FBSyxXQUFXLEtBQUssQ0FBQyxFQUFFLFFBQVEsT0FBTyxHQUFHLEVBQUUsUUFBUSxPQUFPLEdBQUcsRUFBRSxRQUFRLFFBQVEsRUFBRTtBQUFBLE1BQzdHLGlCQUFpQixDQUFDLFVBQVU7QUFDMUIsY0FBTSxhQUFhLE1BQU0sUUFBUSxNQUFNLEdBQUcsRUFBRSxRQUFRLE1BQU0sR0FBRztBQUM3RCxjQUFNLFNBQVMsYUFBYSxJQUFJLFFBQVEsS0FBSyxXQUFXLFNBQVMsS0FBSyxNQUFNLENBQUM7QUFDN0UsZUFBTyxLQUFLLFdBQVcsS0FBSyxvQkFBb0IsTUFBTSxDQUFDO0FBQUEsTUFDekQ7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxNQUFNLFNBQVM7QUFDYixVQUFNLEtBQUssZ0JBQWdCO0FBQzNCLFNBQUsseUJBQXlCO0FBRTlCLFNBQUssY0FBYyxJQUFJLHVCQUF1QixLQUFLLEtBQUssSUFBSSxDQUFDO0FBRTdELFNBQUssV0FBVztBQUFBLE1BQ2QsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLE1BQ04sZUFBZSxDQUFDLGFBQWE7QUFDM0IsY0FBTSxPQUFPLEtBQUssSUFBSSxVQUFVLGNBQWM7QUFDOUMsWUFBSSxDQUFDLE1BQU07QUFDVCxpQkFBTztBQUFBLFFBQ1Q7QUFFQSxZQUFJLENBQUMsVUFBVTtBQUNiLGVBQUssS0FBSyxtQkFBbUIsSUFBSTtBQUFBLFFBQ25DO0FBRUEsZUFBTztBQUFBLE1BQ1Q7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLFdBQVc7QUFBQSxNQUNkLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFVBQVUsTUFBTTtBQUNkLGFBQUssS0FBSyxrQkFBa0IsSUFBSTtBQUFBLE1BQ2xDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxXQUFXO0FBQUEsTUFDZCxJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsTUFDTixVQUFVLE1BQU07QUFDZCxhQUFLLEtBQUssY0FBYztBQUFBLE1BQzFCO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxXQUFXO0FBQUEsTUFDZCxJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsTUFDTixVQUFVLE1BQU07QUFDZCxhQUFLLEtBQUsscUJBQXFCO0FBQUEsTUFDakM7QUFBQSxJQUNGLENBQUM7QUFFRCxVQUFNLGlCQUFpQixLQUFLLGNBQWMsT0FBTyxLQUFLLEVBQUUseUNBQWdCLHFCQUFxQixHQUFHLE1BQU07QUFDcEcsV0FBSyxLQUFLLGNBQWM7QUFBQSxJQUMxQixDQUFDO0FBQ0QsbUJBQWUsU0FBUywyQkFBMkI7QUFDbkQsbUJBQWUsU0FBUyxnQ0FBZ0M7QUFFeEQsVUFBTSxpQkFBaUIsS0FBSyxjQUFjLGNBQWMsS0FBSyxFQUFFLHlDQUFnQixxQkFBcUIsR0FBRyxNQUFNO0FBQzNHLFdBQUssS0FBSyxxQkFBcUI7QUFBQSxJQUNqQyxDQUFDO0FBQ0QsbUJBQWUsU0FBUywyQkFBMkI7QUFDbkQsbUJBQWUsU0FBUyxnQ0FBZ0M7QUFFeEQsU0FBSyw4QkFBOEIsQ0FBQyxJQUFJLFFBQVE7QUFDOUMsV0FBSyxLQUFLLGFBQWEsb0JBQW9CLElBQUksR0FBRztBQUFBLElBQ3BELENBQUM7QUFDRCxRQUFJO0FBQ0YsV0FBSyxtQ0FBbUMsbUJBQW1CLENBQUMsUUFBUSxJQUFJLFFBQVE7QUFDOUUsYUFBSyxLQUFLLGFBQWEsdUJBQXVCLFFBQVEsSUFBSSxHQUFHO0FBQUEsTUFDL0QsQ0FBQztBQUFBLElBQ0gsUUFBUTtBQUNOLGNBQVEsS0FBSywwRUFBMEU7QUFBQSxJQUN6RjtBQUVBLFNBQUs7QUFBQSxNQUNILEtBQUssSUFBSSxVQUFVLEdBQUcsYUFBYSxDQUFDLFNBQVM7QUFDM0MsYUFBSyxLQUFLLGVBQWUsSUFBSTtBQUFBLE1BQy9CLENBQUM7QUFBQSxJQUNIO0FBRUEsU0FBSztBQUFBLE1BQ0gsS0FBSyxJQUFJLFVBQVUsR0FBRyxnQkFBZ0IsQ0FBQyxLQUFLLFFBQVEsU0FBUztBQUMzRCxhQUFLLEtBQUssa0JBQWtCLEtBQUssUUFBUSxJQUFJO0FBQUEsTUFDL0MsQ0FBQztBQUFBLElBQ0g7QUFFQSxTQUFLO0FBQUEsTUFDSCxLQUFLLElBQUksVUFBVSxHQUFHLGVBQWUsQ0FBQyxLQUFLLFFBQVEsU0FBUztBQUMxRCxhQUFLLEtBQUssaUJBQWlCLEtBQUssUUFBUSxJQUFJO0FBQUEsTUFDOUMsQ0FBQztBQUFBLElBQ0g7QUFFQSxVQUFNLEtBQUssc0JBQXNCO0FBQ2pDLFNBQUssY0FBYyxLQUFLLElBQUksTUFBTSxHQUFHLFVBQVUsQ0FBQyxTQUFTLEtBQUssbUJBQW1CLE1BQU0sS0FBSyxrQkFBa0IsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUNySCxTQUFLLGNBQWMsS0FBSyxJQUFJLE1BQU0sR0FBRyxVQUFVLENBQUMsU0FBUyxLQUFLLG1CQUFtQixNQUFNLEtBQUssa0JBQWtCLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDckgsU0FBSztBQUFBLE1BQ0gsS0FBSyxJQUFJLE1BQU0sR0FBRyxVQUFVLENBQUMsTUFBTSxZQUFZLEtBQUssbUJBQW1CLE1BQU0sS0FBSyxrQkFBa0IsTUFBTSxPQUFPLENBQUMsQ0FBQztBQUFBLElBQ3JIO0FBRUEsU0FBSyxjQUFjO0FBRW5CLFNBQUssS0FBSyxZQUFZLG9CQUFvQjtBQUUxQyxTQUFLLFNBQVMsTUFBTTtBQUNsQixpQkFBVyxXQUFXLEtBQUssVUFBVTtBQUNuQyxZQUFJLGdCQUFnQixPQUFPO0FBQUEsTUFDN0I7QUFDQSxXQUFLLFNBQVMsTUFBTTtBQUNwQixpQkFBVyxhQUFhLEtBQUsseUJBQXlCLE9BQU8sR0FBRztBQUM5RCxlQUFPLGFBQWEsU0FBUztBQUFBLE1BQy9CO0FBQ0EsV0FBSyx5QkFBeUIsTUFBTTtBQUNwQyxpQkFBVyxhQUFhLEtBQUssMkJBQTJCLE9BQU8sR0FBRztBQUNoRSxlQUFPLGFBQWEsU0FBUztBQUFBLE1BQy9CO0FBQ0EsV0FBSywyQkFBMkIsTUFBTTtBQUN0QyxXQUFLLFlBQVksUUFBUTtBQUFBLElBQzNCLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxXQUFXO0FBQ1QsZUFBVyxXQUFXLEtBQUssVUFBVTtBQUNuQyxVQUFJLGdCQUFnQixPQUFPO0FBQUEsSUFDN0I7QUFDQSxTQUFLLFNBQVMsTUFBTTtBQUNwQixTQUFLLGFBQWEsUUFBUTtBQUMxQixlQUFXLGFBQWEsS0FBSyx5QkFBeUIsT0FBTyxHQUFHO0FBQzlELGFBQU8sYUFBYSxTQUFTO0FBQUEsSUFDL0I7QUFDQSxTQUFLLHlCQUF5QixNQUFNO0FBQ3BDLGVBQVcsYUFBYSxLQUFLLDJCQUEyQixPQUFPLEdBQUc7QUFDaEUsYUFBTyxhQUFhLFNBQVM7QUFBQSxJQUMvQjtBQUNBLFNBQUssMkJBQTJCLE1BQU07QUFBQSxFQUN4QztBQUFBLEVBRUEsTUFBTSxrQkFBa0I7QUFDdEIsVUFBTSxTQUFTLE1BQU0sS0FBSyxTQUFTO0FBQ25DLFFBQUksQ0FBQyxVQUFVLE9BQU8sV0FBVyxVQUFVO0FBQ3pDLFdBQUssV0FBVyxFQUFFLEdBQUcsaUJBQWlCO0FBQ3RDLFdBQUssUUFBUSxDQUFDO0FBQ2QsV0FBSyx1QkFBdUIsb0JBQUksSUFBSTtBQUNwQyxXQUFLLFlBQVksb0JBQUksSUFBSTtBQUN6QixXQUFLLG9CQUFvQixvQkFBSSxJQUFJO0FBQ2pDLFdBQUsseUJBQXlCLG9CQUFJLElBQUk7QUFDdEMsV0FBSyx3QkFBd0Isb0JBQUksSUFBSTtBQUNyQyxXQUFLLDRCQUE0QixvQkFBSSxJQUFJO0FBQ3pDLFdBQUssMEJBQTBCLG9CQUFJLElBQUk7QUFDdkM7QUFBQSxJQUNGO0FBRUEsVUFBTSxZQUFZO0FBQ2xCLFFBQUksY0FBYyxhQUFhLFdBQVcsV0FBVztBQUNuRCxXQUFLLFdBQVcsRUFBRSxHQUFHLGtCQUFrQixHQUFLLFVBQVUsWUFBOEMsQ0FBQyxFQUFHO0FBQ3hHLFdBQUssUUFBUSxNQUFNLFFBQVEsVUFBVSxLQUFLLElBQUssVUFBVSxRQUF5QixDQUFDO0FBQ25GLFdBQUssdUJBQXVCLElBQUk7QUFBQSxRQUM5QixPQUFPLFFBQVMsVUFBVSx3QkFBK0QsQ0FBQyxDQUFDO0FBQUEsTUFDN0Y7QUFDQSxXQUFLLHlCQUF5QixJQUFJO0FBQUEsUUFDaEMsT0FBTyxRQUFTLFVBQVUsMEJBQWtGLENBQUMsQ0FBQyxFQUMzRyxPQUFPLENBQUMsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUNyQixjQUFJLENBQUMsU0FBUyxPQUFPLFVBQVUsVUFBVTtBQUN2QyxtQkFBTztBQUFBLFVBQ1Q7QUFDQSxnQkFBTSxTQUFTO0FBQ2YsaUJBQ0UsT0FBTyxPQUFPLG9CQUFvQixZQUNsQyxPQUFPLE9BQU8sbUJBQW1CLFlBQ2pDLE9BQU8sT0FBTyxjQUFjO0FBQUEsUUFFaEMsQ0FBQyxFQUNBLElBQUksQ0FBQyxDQUFDLE1BQU0sS0FBSyxNQUFNLENBQUMsTUFBTSxLQUFnQyxDQUFDO0FBQUEsTUFDcEU7QUFDQSxXQUFLLHdCQUF3QixJQUFJO0FBQUEsUUFDL0IsTUFBTSxRQUFRLFVBQVUscUJBQXFCLElBQ3pDLFVBQVUsc0JBQXNCLE9BQU8sQ0FBQyxTQUF5QixPQUFPLFNBQVMsUUFBUSxJQUN6RixDQUFDO0FBQUEsTUFDUDtBQUNBLFdBQUssNEJBQTRCLG9CQUFJLElBQUk7QUFDekMsaUJBQVcsQ0FBQyxNQUFNLFFBQVEsS0FBSyxPQUFPLFFBQVMsVUFBVSw2QkFBcUUsQ0FBQyxDQUFDLEdBQUc7QUFDakksWUFBSSxDQUFDLFlBQVksT0FBTyxhQUFhLFVBQVU7QUFDN0M7QUFBQSxRQUNGO0FBQ0EsY0FBTSxRQUFRO0FBQ2QsY0FBTSxhQUFhLE9BQU8sTUFBTSxlQUFlLFlBQVksTUFBTSxXQUFXLFNBQVMsSUFDakYsTUFBTSxhQUNOLEdBQUcsS0FBSyxnQkFBZ0IsS0FBSyxTQUFTLHFCQUFxQixDQUFDLEdBQUcsSUFBSTtBQUN2RSxjQUFNLGtCQUFrQixPQUFPLE1BQU0sb0JBQW9CLFdBQVcsTUFBTSxrQkFBa0I7QUFDNUYsYUFBSywwQkFBMEIsSUFBSSxNQUFNLEVBQUUsWUFBWSxnQkFBZ0IsQ0FBQztBQUFBLE1BQzFFO0FBQ0EsV0FBSywwQkFBMEIsb0JBQUksSUFBSTtBQUN2QyxpQkFBVyxDQUFDLFNBQVMsUUFBUSxLQUFLLE9BQU8sUUFBUyxVQUFVLDJCQUFtRSxDQUFDLENBQUMsR0FBRztBQUNsSSxZQUFJLENBQUMsWUFBWSxPQUFPLGFBQWEsVUFBVTtBQUM3QztBQUFBLFFBQ0Y7QUFDQSxjQUFNLFFBQVE7QUFDZCxjQUFNLFVBQVUsT0FBTyxNQUFNLFlBQVksV0FBVyxNQUFNLFVBQVU7QUFDcEUsWUFBSSxDQUFDLFNBQVM7QUFDWjtBQUFBLFFBQ0Y7QUFDQSxjQUFNLGdCQUFnQixPQUFPLE1BQU0sa0JBQWtCLFlBQVksTUFBTSxjQUFjLFNBQVMsSUFDMUYsTUFBTSxnQkFDTixHQUFHLEtBQUssZ0JBQWdCLEtBQUssU0FBUyxxQkFBcUIsQ0FBQyxHQUFHLE9BQU87QUFDMUUsY0FBTSxxQkFBcUIsT0FBTyxNQUFNLHVCQUF1QixXQUFXLE1BQU0scUJBQXFCO0FBQ3JHLGNBQU0sYUFBYSxPQUFPLE1BQU0sZUFBZSxXQUFXLE1BQU0sYUFBYSxLQUFLLElBQUk7QUFDdEYsYUFBSyx3QkFBd0IsSUFBSSxTQUFTO0FBQUEsVUFDeEM7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRixDQUFDO0FBQUEsTUFDSDtBQUNBLFdBQUssWUFBWSxvQkFBSSxJQUFJO0FBQ3pCLGlCQUFXLENBQUMsTUFBTSxRQUFRLEtBQUssT0FBTyxRQUFTLFVBQVUsYUFBcUQsQ0FBQyxDQUFDLEdBQUc7QUFDakgsY0FBTSxhQUFhLEtBQUssd0JBQXdCLE1BQU0sUUFBUTtBQUM5RCxZQUFJLFlBQVk7QUFDZCxlQUFLLFVBQVUsSUFBSSxNQUFNLFVBQVU7QUFBQSxRQUNyQztBQUFBLE1BQ0Y7QUFDQSxXQUFLLGtCQUNILE9BQU8sVUFBVSxvQkFBb0IsV0FBVyxVQUFVLGtCQUFrQjtBQUM5RSxXQUFLLHNCQUNILE9BQU8sVUFBVSx3QkFBd0IsV0FBVyxVQUFVLHNCQUFzQjtBQUN0RixXQUFLLG9CQUFvQixJQUFJO0FBQUEsUUFDM0IsTUFBTSxRQUFRLFVBQVUsaUJBQWlCLElBQUksVUFBVSxvQkFBZ0MsQ0FBQztBQUFBLE1BQzFGO0FBQ0EsV0FBSywyQkFBMkI7QUFDaEM7QUFBQSxJQUNGO0FBRUEsU0FBSyxXQUFXLEVBQUUsR0FBRyxrQkFBa0IsR0FBSSxVQUE0QztBQUN2RixTQUFLLFFBQVEsQ0FBQztBQUNkLFNBQUssdUJBQXVCLG9CQUFJLElBQUk7QUFDcEMsU0FBSyxZQUFZLG9CQUFJLElBQUk7QUFDekIsU0FBSyxvQkFBb0Isb0JBQUksSUFBSTtBQUNqQyxTQUFLLHlCQUF5QixvQkFBSSxJQUFJO0FBQ3RDLFNBQUssd0JBQXdCLG9CQUFJLElBQUk7QUFDckMsU0FBSyw0QkFBNEIsb0JBQUksSUFBSTtBQUN6QyxTQUFLLDBCQUEwQixvQkFBSSxJQUFJO0FBQ3ZDLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssc0JBQXNCO0FBQzNCLFNBQUssMkJBQTJCO0FBQUEsRUFDbEM7QUFBQSxFQUVRLDZCQUE2QjtBQUVuQyxTQUFLLFNBQVMseUJBQXlCO0FBQ3ZDLFNBQUssU0FBUywwQkFBMEIsS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLEtBQUssU0FBUywyQkFBMkIsQ0FBQyxDQUFDO0FBQzFHLFVBQU0sY0FBYyxLQUFLLFNBQVM7QUFDbEMsVUFBTSxXQUFXLE1BQU0sUUFBUSxXQUFXLElBQ3RDLGNBQ0EsT0FBTyxnQkFBZ0IsV0FDckIsWUFBWSxNQUFNLE9BQU8sSUFDekIsaUJBQWlCO0FBQ3ZCLFNBQUssU0FBUyxzQkFBc0I7QUFBQSxNQUNsQyxHQUFHLElBQUk7QUFBQSxRQUNMLFNBQ0csSUFBSSxDQUFDLGNBQVUsZ0NBQWMsT0FBTyxLQUFLLEVBQUUsS0FBSyxDQUFDLEVBQUUsUUFBUSxRQUFRLEVBQUUsRUFBRSxRQUFRLFFBQVEsRUFBRSxDQUFDLEVBQzFGLE9BQU8sQ0FBQyxVQUFVLE1BQU0sU0FBUyxDQUFDO0FBQUEsTUFDdkM7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBRVEsZ0JBQWdCLE9BQWU7QUFDckMsV0FBTyxnQkFBZ0IsS0FBSztBQUFBLEVBQzlCO0FBQUEsRUFFUSxnQkFBZ0I7QUFDdEIsVUFBTSxVQUFVLEtBQUssU0FBUztBQUM5QixRQUFJLFdBQVcsR0FBRztBQUNoQjtBQUFBLElBQ0Y7QUFFQSxVQUFNLGFBQWEsVUFBVSxLQUFLO0FBQ2xDLFNBQUs7QUFBQSxNQUNILE9BQU8sWUFBWSxNQUFNO0FBQ3ZCLGFBQUssS0FBSyxnQkFBZ0I7QUFBQSxNQUM1QixHQUFHLFVBQVU7QUFBQSxJQUNmO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyxrQkFBa0I7QUFDOUIsUUFBSSxLQUFLLHdCQUF3QjtBQUMvQjtBQUFBLElBQ0Y7QUFFQSxTQUFLLHlCQUF5QjtBQUM5QixRQUFJO0FBQ0YsWUFBTSxLQUFLLDJCQUEyQixLQUFLO0FBQUEsSUFDN0MsVUFBRTtBQUNBLFdBQUsseUJBQXlCO0FBQUEsSUFDaEM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLGtCQUFrQjtBQUN0QixVQUFNLEtBQUssU0FBUztBQUFBLE1BQ2xCLFVBQVUsS0FBSztBQUFBLE1BQ2YsT0FBTyxLQUFLO0FBQUEsTUFDWixzQkFBc0IsT0FBTyxZQUFZLEtBQUsscUJBQXFCLFFBQVEsQ0FBQztBQUFBLE1BQzVFLHdCQUF3QixPQUFPLFlBQVksS0FBSyx1QkFBdUIsUUFBUSxDQUFDO0FBQUEsTUFDaEYsdUJBQXVCLENBQUMsR0FBRyxLQUFLLHFCQUFxQjtBQUFBLE1BQ3JELDJCQUEyQixPQUFPLFlBQVksS0FBSywwQkFBMEIsUUFBUSxDQUFDO0FBQUEsTUFDdEYseUJBQXlCLE9BQU8sWUFBWSxLQUFLLHdCQUF3QixRQUFRLENBQUM7QUFBQSxNQUNsRixXQUFXLE9BQU8sWUFBWSxLQUFLLFVBQVUsUUFBUSxDQUFDO0FBQUEsTUFDdEQsbUJBQW1CLENBQUMsR0FBRyxLQUFLLGlCQUFpQjtBQUFBLE1BQzdDLGlCQUFpQixLQUFLO0FBQUEsTUFDdEIscUJBQXFCLEtBQUs7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsTUFBTSxlQUFlO0FBQ25CLFVBQU0sS0FBSyxnQkFBZ0I7QUFBQSxFQUM3QjtBQUFBLEVBRVEsd0JBQXdCLFdBQW1CLFVBQTBDO0FBQzNGLFFBQUksQ0FBQyxZQUFZLE9BQU8sYUFBYSxVQUFVO0FBQzdDLGFBQU87QUFBQSxJQUNUO0FBRUEsVUFBTSxZQUFZO0FBQ2xCLFVBQU0sYUFDSixPQUFPLFVBQVUsZUFBZSxZQUFZLFVBQVUsV0FBVyxTQUFTLElBQ3RFLFVBQVUsYUFDVixLQUFLLFlBQVkseUJBQXlCLFNBQVM7QUFDekQsVUFBTSxpQkFDSixPQUFPLFVBQVUsbUJBQW1CLFdBQ2hDLFVBQVUsaUJBQ1YsT0FBTyxVQUFVLGNBQWMsV0FDN0IsVUFBVSxZQUNWO0FBQ1IsVUFBTSxrQkFDSixPQUFPLFVBQVUsb0JBQW9CLFdBQ2pDLFVBQVUsa0JBQ1YsT0FBTyxVQUFVLGNBQWMsV0FDN0IsVUFBVSxZQUNWO0FBRVIsV0FBTztBQUFBLE1BQ0w7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUEsRUFFQSxFQUFFLElBQVksSUFBWTtBQUN4QixXQUFPLEtBQUssWUFBWSxNQUFNLE9BQU8sS0FBSztBQUFBLEVBQzVDO0FBQUEsRUFFUSxjQUFjO0FBQ3BCLFFBQUksS0FBSyxTQUFTLGFBQWEsUUFBUTtBQUNyQyxZQUFNLFNBQVMsT0FBTyxjQUFjLGNBQWMsVUFBVSxTQUFTLFlBQVksSUFBSTtBQUNyRixhQUFPLE9BQU8sV0FBVyxJQUFJLElBQUksT0FBTztBQUFBLElBQzFDO0FBRUEsV0FBTyxLQUFLLFNBQVM7QUFBQSxFQUN2QjtBQUFBLEVBRUEsc0JBQXNCO0FBQ3BCLFFBQUksQ0FBQyxLQUFLLGlCQUFpQjtBQUN6QixhQUFPLEtBQUssRUFBRSwwREFBYSx3QkFBd0I7QUFBQSxJQUNyRDtBQUVBLFdBQU8sS0FBSztBQUFBLE1BQ1YsaUNBQVEsSUFBSSxLQUFLLEtBQUssZUFBZSxFQUFFLGVBQWUsQ0FBQztBQUFBLE1BQ3ZELGNBQWMsSUFBSSxLQUFLLEtBQUssZUFBZSxFQUFFLGVBQWUsQ0FBQztBQUFBLElBQy9EO0FBQUEsRUFDRjtBQUFBLEVBRUEsd0JBQXdCO0FBQ3RCLFdBQU8sS0FBSyxzQkFDUixLQUFLLEVBQUUsaUNBQVEsS0FBSyxtQkFBbUIsSUFBSSxrQkFBa0IsS0FBSyxtQkFBbUIsRUFBRSxJQUN2RixLQUFLLEVBQUUsOENBQVcscUJBQXFCO0FBQUEsRUFDN0M7QUFBQSxFQUVBLE1BQU0sZ0JBQWdCO0FBQ3BCLFVBQU0sS0FBSyx3QkFBd0IsSUFBSTtBQUFBLEVBQ3pDO0FBQUEsRUFFQSxNQUFNLHVCQUF1QjtBQUMzQixVQUFNLEtBQUssMkJBQTJCLElBQUk7QUFBQSxFQUM1QztBQUFBLEVBRUEsTUFBYyx3QkFBd0I7QUFDcEMsVUFBTSxPQUFPLG9CQUFJLElBQXlCO0FBQzFDLGVBQVcsUUFBUSxLQUFLLElBQUksTUFBTSxpQkFBaUIsR0FBRztBQUNwRCxZQUFNLFVBQVUsTUFBTSxLQUFLLElBQUksTUFBTSxLQUFLLElBQUk7QUFDOUMsV0FBSyxJQUFJLEtBQUssTUFBTSxLQUFLLDJCQUEyQixPQUFPLENBQUM7QUFBQSxJQUM5RDtBQUNBLFNBQUssaUJBQWlCO0FBQUEsRUFDeEI7QUFBQSxFQUVBLE1BQWMsa0JBQWtCLE1BQXFCO0FBQ25ELFFBQUksRUFBRSxnQkFBZ0IseUJBQVE7QUFDNUI7QUFBQSxJQUNGO0FBRUEsU0FBSyxxQkFBcUIsS0FBSyxJQUFJO0FBRW5DLFFBQUksS0FBSyxjQUFjLE1BQU07QUFDM0IsWUFBTSxVQUFVLE1BQU0sS0FBSyxJQUFJLE1BQU0sS0FBSyxJQUFJO0FBQzlDLFlBQU0sV0FBVyxLQUFLLDJCQUEyQixPQUFPO0FBQ3hELFlBQU0sZUFBZSxLQUFLLGVBQWUsSUFBSSxLQUFLLElBQUksS0FBSyxvQkFBSSxJQUFZO0FBQzNFLFdBQUssZUFBZSxJQUFJLEtBQUssTUFBTSxRQUFRO0FBRTNDLFlBQU0sUUFBUSxDQUFDLEdBQUcsUUFBUSxFQUFFLE9BQU8sQ0FBQyxVQUFVLENBQUMsYUFBYSxJQUFJLEtBQUssQ0FBQztBQUN0RSxZQUFNLFVBQVUsQ0FBQyxHQUFHLFlBQVksRUFBRSxPQUFPLENBQUMsVUFBVSxDQUFDLFNBQVMsSUFBSSxLQUFLLENBQUM7QUFDeEUsVUFBSSxNQUFNLFNBQVMsR0FBRztBQUNwQixhQUFLLHlCQUF5QixLQUFLLE1BQU0sV0FBVztBQUFBLE1BQ3REO0FBQ0EsVUFBSSxRQUFRLFNBQVMsR0FBRztBQUN0QixhQUFLLHlCQUF5QixLQUFLLE1BQU0sY0FBYztBQUFBLE1BQ3pEO0FBQUEsSUFDRjtBQUVBLFVBQU0sS0FBSyxnQkFBZ0I7QUFBQSxFQUM3QjtBQUFBLEVBRUEsTUFBYyxrQkFBa0IsTUFBcUI7QUFDbkQsUUFBSSxFQUFFLGdCQUFnQix5QkFBUTtBQUM1QjtBQUFBLElBQ0Y7QUFFQSxRQUFJLENBQUMsS0FBSyxZQUFZLDBCQUEwQixLQUFLLElBQUksR0FBRztBQUMxRCxXQUFLLHlCQUF5QixLQUFLLElBQUk7QUFDdkMsV0FBSyxVQUFVLE9BQU8sS0FBSyxJQUFJO0FBQy9CLFlBQU0sS0FBSyxnQkFBZ0I7QUFBQSxJQUM3QjtBQUVBLFFBQUksS0FBSyxjQUFjLE1BQU07QUFDM0IsV0FBSyxlQUFlLE9BQU8sS0FBSyxJQUFJO0FBQUEsSUFDdEM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLGtCQUFrQixNQUFxQixTQUFpQjtBQUNwRSxRQUFJLEVBQUUsZ0JBQWdCLHlCQUFRO0FBQzVCO0FBQUEsSUFDRjtBQUVBLFFBQUksQ0FBQyxLQUFLLFlBQVksMEJBQTBCLE9BQU8sR0FBRztBQUN4RCxZQUFNLGlCQUFpQixLQUFLLHlCQUF5QixTQUFTLEtBQUssSUFBSTtBQUN2RSxXQUFLLHlCQUF5QixPQUFPO0FBQ3JDLFdBQUssVUFBVSxPQUFPLE9BQU87QUFDN0IsWUFBTSxLQUFLLGdCQUFnQjtBQUMzQixXQUFLLDJCQUEyQixjQUFjO0FBQUEsSUFDaEQ7QUFFQSxRQUFJLENBQUMsS0FBSyxZQUFZLDBCQUEwQixLQUFLLElBQUksR0FBRztBQUMxRCxXQUFLLHFCQUFxQixLQUFLLElBQUk7QUFDbkMsWUFBTSxLQUFLLGdCQUFnQjtBQUFBLElBQzdCO0FBRUEsUUFBSSxLQUFLLGNBQWMsTUFBTTtBQUMzQixZQUFNLE9BQU8sS0FBSyxlQUFlLElBQUksT0FBTztBQUM1QyxVQUFJLE1BQU07QUFDUixhQUFLLGVBQWUsT0FBTyxPQUFPO0FBQ2xDLGFBQUssZUFBZSxJQUFJLEtBQUssTUFBTSxJQUFJO0FBQUEsTUFDekM7QUFFQSxVQUFJLENBQUMsS0FBSyxZQUFZLDBCQUEwQixLQUFLLElBQUksR0FBRztBQUMxRCxhQUFLLHlCQUF5QixLQUFLLE1BQU0sV0FBVztBQUFBLE1BQ3REO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUVRLHFCQUFxQixNQUFjO0FBQ3pDLFFBQUksS0FBSyxZQUFZLDBCQUEwQixJQUFJLEdBQUc7QUFDcEQsV0FBSyxzQkFBc0IsT0FBTyxJQUFJO0FBQ3RDO0FBQUEsSUFDRjtBQUVBLFNBQUssMEJBQTBCLE9BQU8sSUFBSTtBQUMxQyxTQUFLLHNCQUFzQixJQUFJLElBQUk7QUFBQSxFQUNyQztBQUFBLEVBRVEseUJBQXlCLE1BQWM7QUFDN0MsUUFBSSxLQUFLLFlBQVksMEJBQTBCLElBQUksR0FBRztBQUNwRCxXQUFLLHNCQUFzQixPQUFPLElBQUk7QUFDdEMsV0FBSywwQkFBMEIsT0FBTyxJQUFJO0FBQzFDO0FBQUEsSUFDRjtBQUVBLFVBQU0sV0FBVyxLQUFLLFVBQVUsSUFBSSxJQUFJO0FBQ3hDLFNBQUssc0JBQXNCLE9BQU8sSUFBSTtBQUN0QyxTQUFLLDBCQUEwQixJQUFJLE1BQU07QUFBQSxNQUN2QyxZQUFZLFVBQVUsY0FBYyxLQUFLLFlBQVkseUJBQXlCLElBQUk7QUFBQSxNQUNsRixpQkFBaUIsVUFBVTtBQUFBLElBQzdCLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxnQ0FBZ0MsU0FBaUI7QUFDdkQsV0FBTyxDQUFDLEdBQUcsS0FBSyx3QkFBd0IsT0FBTyxDQUFDLEVBQUUsS0FBSyxDQUFDLFVBQVUsTUFBTSxZQUFZLE9BQU8sS0FBSztBQUFBLEVBQ2xHO0FBQUEsRUFFUSx5QkFBeUIsU0FBaUIsU0FBaUI7QUFDakUsVUFBTSx3QkFBb0IsZ0NBQWMsT0FBTztBQUMvQyxVQUFNLHdCQUFvQixnQ0FBYyxPQUFPO0FBQy9DLFVBQU0sV0FBVyxLQUFLLGdDQUFnQyxpQkFBaUI7QUFDdkUsVUFBTSxXQUFXLFlBQVksS0FBSyx3QkFBd0IsSUFBSSxpQkFBaUIsS0FBSztBQUNwRixRQUFJLFVBQVU7QUFDWixXQUFLLHdCQUF3QixPQUFPLFNBQVMsT0FBTztBQUFBLElBQ3REO0FBRUEsVUFBTSxVQUFVLEtBQUssVUFBVSxJQUFJLGlCQUFpQjtBQUNwRCxVQUFNLGlCQUFpQixVQUFVLFdBQVc7QUFDNUMsVUFBTSxnQkFBZ0IsVUFBVSxpQkFBaUIsU0FBUyxjQUFjLEtBQUssWUFBWSx5QkFBeUIsaUJBQWlCO0FBQ25JLFVBQU0scUJBQXFCLFVBQVUsc0JBQXNCLFNBQVM7QUFDcEUsVUFBTSxhQUFhLFVBQVUsY0FBYyxLQUFLLElBQUk7QUFFcEQsU0FBSyx3QkFBd0IsSUFBSSxnQkFBZ0I7QUFBQSxNQUMvQyxTQUFTO0FBQUEsTUFDVCxTQUFTO0FBQUEsTUFDVDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRixDQUFDO0FBQ0QsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVRLDJCQUEyQixTQUFpQjtBQUNsRCxVQUFNLE9BQU8sb0JBQUksSUFBWTtBQUM3QixVQUFNLFlBQVk7QUFDbEIsVUFBTSxnQkFBZ0I7QUFDdEIsVUFBTSxpQkFBaUI7QUFDdkIsUUFBSTtBQUVKLFlBQVEsUUFBUSxVQUFVLEtBQUssT0FBTyxPQUFPLE1BQU07QUFDakQsV0FBSyxJQUFJLEtBQUssYUFBYSxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDdEM7QUFFQSxZQUFRLFFBQVEsY0FBYyxLQUFLLE9BQU8sT0FBTyxNQUFNO0FBQ3JELFdBQUssSUFBSSxLQUFLLGFBQWEsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUFBLElBQ3RDO0FBRUEsWUFBUSxRQUFRLGVBQWUsS0FBSyxPQUFPLE9BQU8sTUFBTTtBQUN0RCxZQUFNLFNBQVMsS0FBSyxhQUFhLHNCQUFzQixNQUFNLENBQUMsQ0FBQztBQUMvRCxVQUFJLFFBQVEsTUFBTTtBQUNoQixhQUFLLElBQUksT0FBTyxJQUFJO0FBQUEsTUFDdEI7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVRLHlCQUF5QixVQUFrQixRQUFzQztBQUN2RixVQUFNLFdBQVcsS0FBSyx5QkFBeUIsSUFBSSxRQUFRO0FBQzNELFFBQUksVUFBVTtBQUNaLGFBQU8sYUFBYSxRQUFRO0FBQUEsSUFDOUI7QUFFQSxVQUFNLFVBQVUsV0FBVyxjQUFjLE9BQU87QUFDaEQsVUFBTSxZQUFZLE9BQU8sV0FBVyxNQUFNO0FBQ3hDLFdBQUsseUJBQXlCLE9BQU8sUUFBUTtBQUM3QyxXQUFLLEtBQUssc0JBQXNCLFVBQVUsTUFBTTtBQUFBLElBQ2xELEdBQUcsT0FBTztBQUNWLFNBQUsseUJBQXlCLElBQUksVUFBVSxTQUFTO0FBQUEsRUFDdkQ7QUFBQSxFQUVBLE1BQWMsc0JBQXNCLFVBQWtCLFFBQXNDO0FBQzFGLFFBQUksS0FBSywwQkFBMEIsSUFBSSxRQUFRLEdBQUc7QUFDaEQ7QUFBQSxJQUNGO0FBRUEsUUFDRSxLQUFLLFlBQVksc0JBQXNCLFFBQVEsS0FDL0MsS0FBSyw2QkFBNkIsT0FBTyxLQUN6QyxLQUFLLGtCQUNMLEtBQUssd0JBQ0w7QUFDQSxXQUFLLHlCQUF5QixVQUFVLE1BQU07QUFDOUM7QUFBQSxJQUNGO0FBRUEsVUFBTSxPQUFPLEtBQUssbUJBQW1CLFFBQVE7QUFDN0MsUUFBSSxFQUFFLGdCQUFnQiwyQkFBVSxLQUFLLGNBQWMsUUFBUSxLQUFLLFlBQVksMEJBQTBCLEtBQUssSUFBSSxHQUFHO0FBQ2hIO0FBQUEsSUFDRjtBQUVBLFNBQUssMEJBQTBCLElBQUksUUFBUTtBQUMzQyxRQUFJO0FBQ0YsV0FBSyxpQkFBaUI7QUFFdEIsWUFBTSxVQUFVLE1BQU0sS0FBSyxnQ0FBZ0MsSUFBSTtBQUMvRCxVQUFJLEtBQUssY0FBYyxPQUFPLEdBQUc7QUFDL0I7QUFBQSxNQUNGO0FBRUEsWUFBTSxhQUFhLEtBQUssWUFBWSx5QkFBeUIsS0FBSyxJQUFJO0FBQ3RFLFlBQU0saUJBQWlCLE1BQU0sS0FBSywwQkFBMEIsTUFBTSxZQUFZLE9BQU87QUFDckYsV0FBSyxVQUFVLElBQUksS0FBSyxNQUFNO0FBQUEsUUFDNUIsZ0JBQWdCLE1BQU0sS0FBSywyQkFBMkIsTUFBTSxPQUFPO0FBQUEsUUFDbkUsaUJBQWlCLGVBQWU7QUFBQSxRQUNoQztBQUFBLE1BQ0YsQ0FBQztBQUNELFdBQUssc0JBQXNCLE9BQU8sS0FBSyxJQUFJO0FBQzNDLFlBQU0sS0FBSyx3QkFBd0IsS0FBSyxJQUFJO0FBQzVDLFdBQUssa0JBQWtCLEtBQUssSUFBSTtBQUNoQyxXQUFLLHNCQUFzQixLQUFLO0FBQUEsUUFDOUIsV0FBVyxjQUNQLHVGQUFpQixLQUFLLFFBQVEsS0FDOUIsdUZBQWlCLEtBQUssUUFBUTtBQUFBLFFBQ2xDLFdBQVcsY0FDUCxtREFBbUQsS0FBSyxRQUFRLEtBQ2hFLHVEQUF1RCxLQUFLLFFBQVE7QUFBQSxNQUMxRTtBQUNBLFlBQU0sS0FBSyxnQkFBZ0I7QUFBQSxJQUM3QixTQUFTLE9BQU87QUFDZCxjQUFRLE1BQU0sNkJBQTZCLEtBQUs7QUFDaEQsV0FBSyxrQkFBa0IsS0FBSyxJQUFJO0FBQ2hDLFdBQUssc0JBQXNCLEtBQUs7QUFBQSxRQUM5QixLQUFLO0FBQUEsVUFDSCxXQUFXLGNBQWMseUZBQW1CO0FBQUEsVUFDNUMsV0FBVyxjQUFjLDhDQUE4QztBQUFBLFFBQ3pFO0FBQUEsUUFDQTtBQUFBLE1BQ0Y7QUFDQSxZQUFNLEtBQUssZ0JBQWdCO0FBQzNCLFdBQUsseUJBQXlCLFVBQVUsTUFBTTtBQUFBLElBQ2hELFVBQUU7QUFDQSxXQUFLLDBCQUEwQixPQUFPLFFBQVE7QUFBQSxJQUNoRDtBQUFBLEVBQ0Y7QUFBQSxFQUVRLDJCQUEyQixTQUFpQjtBQUNsRCxVQUFNLFdBQVcsS0FBSywyQkFBMkIsSUFBSSxPQUFPO0FBQzVELFFBQUksVUFBVTtBQUNaLGFBQU8sYUFBYSxRQUFRO0FBQUEsSUFDOUI7QUFFQSxVQUFNLFlBQVksT0FBTyxXQUFXLE1BQU07QUFDeEMsV0FBSywyQkFBMkIsT0FBTyxPQUFPO0FBQzlDLFdBQUssS0FBSyx3QkFBd0IsT0FBTztBQUFBLElBQzNDLEdBQUcsR0FBRztBQUNOLFNBQUssMkJBQTJCLElBQUksU0FBUyxTQUFTO0FBQUEsRUFDeEQ7QUFBQSxFQUVBLE1BQWMsd0JBQXdCLFNBQWlCO0FBQ3JELFFBQUksS0FBSyw0QkFBNEIsSUFBSSxPQUFPLEdBQUc7QUFDakQ7QUFBQSxJQUNGO0FBRUEsUUFDRSxLQUFLLDZCQUE2QixPQUFPLEtBQ3pDLEtBQUssWUFBWSxlQUFlLEtBQ2hDLEtBQUssa0JBQ0wsS0FBSyx3QkFDTDtBQUNBLFdBQUssMkJBQTJCLE9BQU87QUFDdkM7QUFBQSxJQUNGO0FBRUEsUUFBSSxDQUFDLEtBQUssd0JBQXdCLElBQUksT0FBTyxHQUFHO0FBQzlDO0FBQUEsSUFDRjtBQUVBLFNBQUssNEJBQTRCLElBQUksT0FBTztBQUM1QyxVQUFNLFNBQVMsRUFBRSxVQUFVLEdBQUcsb0JBQW9CLEdBQUcsU0FBUyxFQUFFO0FBQ2hFLFFBQUk7QUFDRixXQUFLLGlCQUFpQjtBQUN0QixZQUFNLEtBQUssMkJBQTJCLFFBQVEsQ0FBQyxPQUFPLENBQUM7QUFDdkQsVUFBSSxPQUFPLFdBQVcsS0FBSyxPQUFPLHFCQUFxQixHQUFHO0FBQ3hELGFBQUssa0JBQWtCLEtBQUssSUFBSTtBQUNoQyxhQUFLLHNCQUFzQixLQUFLO0FBQUEsVUFDOUIsbUZBQWtCLE9BQU8sUUFBUSx1RUFBZ0IsT0FBTyxrQkFBa0I7QUFBQSxVQUMxRSx5Q0FBeUMsT0FBTyxRQUFRLHdCQUF3QixPQUFPLGtCQUFrQjtBQUFBLFFBQzNHO0FBQ0EsY0FBTSxLQUFLLGdCQUFnQjtBQUFBLE1BQzdCO0FBQUEsSUFDRixTQUFTLE9BQU87QUFDZCxjQUFRLE1BQU0sK0JBQStCLEtBQUs7QUFDbEQsV0FBSyxrQkFBa0IsS0FBSyxJQUFJO0FBQ2hDLFdBQUssc0JBQXNCLEtBQUs7QUFBQSxRQUM5QixLQUFLLEVBQUUsbUZBQWtCLHdDQUF3QztBQUFBLFFBQ2pFO0FBQUEsTUFDRjtBQUNBLFlBQU0sS0FBSyxnQkFBZ0I7QUFDM0IsV0FBSywyQkFBMkIsT0FBTztBQUFBLElBQ3pDLFVBQUU7QUFDQSxXQUFLLDRCQUE0QixPQUFPLE9BQU87QUFBQSxJQUNqRDtBQUFBLEVBQ0Y7QUFBQSxFQUdBLE1BQWMsd0JBQXdCLFNBQWlCLFVBQWlCLGFBQW1DO0FBQ3pHLFVBQU0sT0FBTyxvQkFBSSxJQUEyQjtBQUM1QyxVQUFNLGNBQWMsQ0FBQyxHQUFHLFFBQVEsU0FBUyxvQkFBb0IsQ0FBQztBQUM5RCxVQUFNLGtCQUFrQixDQUFDLEdBQUcsUUFBUSxTQUFTLHdCQUF3QixDQUFDO0FBQ3RFLFVBQU0sbUJBQW1CLENBQUMsR0FBRyxRQUFRLFNBQVMseUNBQXlDLENBQUM7QUFFeEYsZUFBVyxTQUFTLGFBQWE7QUFDL0IsWUFBTSxVQUFVLE1BQU0sQ0FBQyxFQUFFLE1BQU0sR0FBRyxFQUFFLENBQUMsRUFBRSxLQUFLO0FBQzVDLFlBQU0sT0FBTyxLQUFLLGtCQUFrQixTQUFTLFNBQVMsSUFBSTtBQUMxRCxVQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssWUFBWSxJQUFJLEdBQUc7QUFDcEM7QUFBQSxNQUNGO0FBRUEsVUFBSSxDQUFDLEtBQUssSUFBSSxNQUFNLENBQUMsQ0FBQyxHQUFHO0FBQ3ZCLGNBQU0sWUFBWSxNQUFNLEtBQUssZ0JBQWdCLE1BQU0sV0FBVztBQUM5RCxhQUFLLElBQUksTUFBTSxDQUFDLEdBQUc7QUFBQSxVQUNqQixVQUFVLE1BQU0sQ0FBQztBQUFBLFVBQ2pCLFdBQVcsS0FBSyxhQUFhLHVCQUF1QixXQUFXLEtBQUssUUFBUTtBQUFBLFVBQzVFLFlBQVk7QUFBQSxRQUNkLENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRjtBQUVBLGVBQVcsU0FBUyxpQkFBaUI7QUFDbkMsWUFBTSxVQUFVLG1CQUFtQixNQUFNLENBQUMsRUFBRSxLQUFLLEVBQUUsUUFBUSxVQUFVLEVBQUUsQ0FBQztBQUN4RSxVQUFJLDJCQUEyQixLQUFLLE9BQU8sR0FBRztBQUM1QztBQUFBLE1BQ0Y7QUFFQSxVQUFJLEtBQUssVUFBVSxPQUFPLEdBQUc7QUFDM0IsWUFBSSxDQUFDLEtBQUssSUFBSSxNQUFNLENBQUMsQ0FBQyxHQUFHO0FBQ3ZCLGNBQUk7QUFDRixrQkFBTSxZQUFZLE1BQU0sS0FBSyxxQkFBcUIsU0FBUyxXQUFXO0FBQ3RFLGtCQUFNLFVBQVUsS0FBSyx1QkFBdUIsTUFBTSxDQUFDLENBQUMsS0FBSyxLQUFLLHNCQUFzQixPQUFPO0FBQzNGLGlCQUFLLElBQUksTUFBTSxDQUFDLEdBQUc7QUFBQSxjQUNqQixVQUFVLE1BQU0sQ0FBQztBQUFBLGNBQ2pCLFdBQVcsS0FBSyxhQUFhLHVCQUF1QixXQUFXLE9BQU87QUFBQSxZQUN4RSxDQUFDO0FBQUEsVUFDSCxTQUFTLEdBQVE7QUFDZixvQkFBUSxLQUFLLGlGQUFvQyxPQUFPLElBQUksR0FBRyxPQUFPO0FBQUEsVUFDeEU7QUFBQSxRQUNGO0FBQ0E7QUFBQSxNQUNGO0FBRUEsWUFBTSxPQUFPLEtBQUssa0JBQWtCLFNBQVMsU0FBUyxJQUFJO0FBQzFELFVBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxZQUFZLElBQUksR0FBRztBQUNwQztBQUFBLE1BQ0Y7QUFFQSxVQUFJLENBQUMsS0FBSyxJQUFJLE1BQU0sQ0FBQyxDQUFDLEdBQUc7QUFDdkIsY0FBTSxZQUFZLE1BQU0sS0FBSyxnQkFBZ0IsTUFBTSxXQUFXO0FBQzlELGFBQUssSUFBSSxNQUFNLENBQUMsR0FBRztBQUFBLFVBQ2pCLFVBQVUsTUFBTSxDQUFDO0FBQUEsVUFDakIsV0FBVyxLQUFLLGFBQWEsdUJBQXVCLFdBQVcsS0FBSyxRQUFRO0FBQUEsVUFDNUUsWUFBWTtBQUFBLFFBQ2QsQ0FBQztBQUFBLE1BQ0g7QUFBQSxJQUNGO0FBRUEsZUFBVyxTQUFTLGtCQUFrQjtBQUNwQyxZQUFNLFVBQVUsS0FBSyxhQUFhLE1BQU0sQ0FBQyxFQUFFLEtBQUssQ0FBQztBQUNqRCxVQUFJLENBQUMsS0FBSyxVQUFVLE9BQU8sS0FBSyxLQUFLLElBQUksTUFBTSxDQUFDLENBQUMsR0FBRztBQUNsRDtBQUFBLE1BQ0Y7QUFFQSxVQUFJO0FBQ0YsY0FBTSxZQUFZLE1BQU0sS0FBSyxxQkFBcUIsU0FBUyxXQUFXO0FBQ3RFLGNBQU0sVUFBVSxLQUFLLHdCQUF3QixNQUFNLENBQUMsQ0FBQyxLQUFLLEtBQUssc0JBQXNCLE9BQU87QUFDNUYsYUFBSyxJQUFJLE1BQU0sQ0FBQyxHQUFHO0FBQUEsVUFDakIsVUFBVSxNQUFNLENBQUM7QUFBQSxVQUNqQixXQUFXLEtBQUssYUFBYSx1QkFBdUIsV0FBVyxPQUFPO0FBQUEsUUFDeEUsQ0FBQztBQUFBLE1BQ0gsU0FBUyxHQUFRO0FBQ2YsZ0JBQVEsS0FBSyxpRkFBb0MsT0FBTyxJQUFJLEdBQUcsT0FBTztBQUFBLE1BQ3hFO0FBQUEsSUFDRjtBQUVBLFdBQU8sQ0FBQyxHQUFHLEtBQUssT0FBTyxDQUFDO0FBQUEsRUFDMUI7QUFBQSxFQUVRLHVCQUF1QixlQUF1QjtBQUNwRCxVQUFNLFFBQVEsY0FBYyxNQUFNLGdCQUFnQjtBQUNsRCxXQUFPLFFBQVEsQ0FBQyxHQUFHLEtBQUssS0FBSztBQUFBLEVBQy9CO0FBQUEsRUFFUSx3QkFBd0IsV0FBbUI7QUFDakQsVUFBTSxRQUFRLFVBQVUsTUFBTSx5QkFBeUI7QUFDdkQsV0FBTyxRQUFRLEtBQUssYUFBYSxNQUFNLENBQUMsRUFBRSxLQUFLLENBQUMsSUFBSTtBQUFBLEVBQ3REO0FBQUEsRUFFUSxVQUFVLE9BQWU7QUFDL0IsV0FBTyxnQkFBZ0IsS0FBSyxLQUFLO0FBQUEsRUFDbkM7QUFBQSxFQUVRLHNCQUFzQixRQUFnQjtBQUM1QyxRQUFJO0FBQ0YsWUFBTSxNQUFNLElBQUksSUFBSSxNQUFNO0FBQzFCLFlBQU0sV0FBVyxLQUFLLGlCQUFpQixJQUFJLFNBQVMsTUFBTSxHQUFHLEVBQUUsSUFBSSxLQUFLLEVBQUU7QUFDMUUsVUFBSSxVQUFVO0FBQ1osZUFBTyxTQUFTLFFBQVEsWUFBWSxFQUFFO0FBQUEsTUFDeEM7QUFBQSxJQUNGLFFBQVE7QUFBQSxJQUVSO0FBRUEsV0FBTyxLQUFLLEVBQUUsNEJBQVEsV0FBVztBQUFBLEVBQ25DO0FBQUEsRUFFUSxrQkFBa0IsTUFBYyxZQUFrQztBQUN4RSxVQUFNLFVBQVUsS0FBSyxRQUFRLE9BQU8sRUFBRSxFQUFFLEtBQUs7QUFDN0MsVUFBTSxTQUFTLEtBQUssSUFBSSxjQUFjLHFCQUFxQixTQUFTLFVBQVU7QUFDOUUsV0FBTyxrQkFBa0IseUJBQVEsU0FBUztBQUFBLEVBQzVDO0FBQUEsRUFFUSxZQUFZLE1BQWE7QUFDL0IsV0FBTyxrQ0FBa0MsS0FBSyxLQUFLLFNBQVM7QUFBQSxFQUM5RDtBQUFBLEVBRUEsTUFBYyxnQkFBZ0IsTUFBYSxhQUFtQztBQUM1RSxRQUFJLGFBQWEsSUFBSSxLQUFLLElBQUksR0FBRztBQUMvQixhQUFPLFlBQVksSUFBSSxLQUFLLElBQUk7QUFBQSxJQUNsQztBQUVBLFNBQUssaUJBQWlCO0FBQ3RCLFVBQU0sU0FBUyxNQUFNLEtBQUssSUFBSSxNQUFNLFdBQVcsSUFBSTtBQUNuRCxVQUFNLFdBQVcsTUFBTSxLQUFLLHFCQUFxQixRQUFRLEtBQUssWUFBWSxLQUFLLFNBQVMsR0FBRyxLQUFLLElBQUk7QUFDcEcsVUFBTSxhQUFhLE1BQU0sS0FBSyw4QkFBOEIsU0FBUyxVQUFVLFNBQVMsTUFBTTtBQUM5RixVQUFNLGFBQWEsS0FBSyxnQkFBZ0IsVUFBVTtBQUNsRCxVQUFNLEtBQUssYUFBYSxZQUFZLFNBQVMsUUFBUSxTQUFTLFFBQVE7QUFDdEUsVUFBTSxZQUFZLEdBQUcsZUFBZSxLQUFLLFVBQVU7QUFDbkQsaUJBQWEsSUFBSSxLQUFLLE1BQU0sU0FBUztBQUNyQyxXQUFPO0FBQUEsRUFDVDtBQUFBLEVBRUEsTUFBYyxxQkFBcUIsVUFBa0IsYUFBbUM7QUFDdEYsVUFBTSxXQUFXLFVBQVUsUUFBUTtBQUNuQyxRQUFJLGFBQWEsSUFBSSxRQUFRLEdBQUc7QUFDOUIsYUFBTyxZQUFZLElBQUksUUFBUTtBQUFBLElBQ2pDO0FBRUEsU0FBSyxpQkFBaUI7QUFDdEIsVUFBTSxXQUFXLE1BQU0sS0FBSyxXQUFXO0FBQUEsTUFDckMsS0FBSztBQUFBLE1BQ0wsUUFBUTtBQUFBLE1BQ1IsaUJBQWlCO0FBQUEsSUFDbkIsQ0FBQztBQUVELFNBQUssc0JBQXNCLFVBQVUsdUJBQXVCO0FBRTVELFVBQU0sY0FBYyxTQUFTLFFBQVEsY0FBYyxLQUFLO0FBQ3hELFFBQUksQ0FBQyxLQUFLLG1CQUFtQixXQUFXLEtBQUssQ0FBQyxLQUFLLGtCQUFrQixRQUFRLEdBQUc7QUFDOUUsWUFBTSxJQUFJLE1BQU0sS0FBSyxFQUFFLDhGQUFtQixzREFBc0QsQ0FBQztBQUFBLElBQ25HO0FBRUEsVUFBTSxXQUFXLEtBQUssMEJBQTBCLFVBQVUsV0FBVztBQUNyRSxVQUFNLFdBQVcsTUFBTSxLQUFLO0FBQUEsTUFDMUIsU0FBUztBQUFBLE1BQ1QsS0FBSyx1QkFBdUIsYUFBYSxRQUFRO0FBQUEsTUFDakQ7QUFBQSxJQUNGO0FBQ0EsVUFBTSxhQUFhLE1BQU0sS0FBSyw4QkFBOEIsU0FBUyxVQUFVLFNBQVMsTUFBTTtBQUM5RixVQUFNLGFBQWEsS0FBSyxnQkFBZ0IsVUFBVTtBQUNsRCxVQUFNLEtBQUssYUFBYSxZQUFZLFNBQVMsUUFBUSxTQUFTLFFBQVE7QUFDdEUsVUFBTSxZQUFZLEdBQUcsZUFBZSxLQUFLLFVBQVU7QUFDbkQsaUJBQWEsSUFBSSxVQUFVLFNBQVM7QUFDcEMsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVRLG1CQUFtQixhQUFxQjtBQUM5QyxXQUFPLFlBQVksS0FBSyxZQUFZLEtBQUssQ0FBQztBQUFBLEVBQzVDO0FBQUEsRUFFUSxrQkFBa0IsUUFBZ0I7QUFDeEMsUUFBSTtBQUNGLFlBQU0sTUFBTSxJQUFJLElBQUksTUFBTTtBQUMxQixhQUFPLG1DQUFtQyxLQUFLLElBQUksUUFBUTtBQUFBLElBQzdELFFBQVE7QUFDTixhQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Y7QUFBQSxFQUVRLDBCQUEwQixRQUFnQixhQUFxQjtBQUNyRSxRQUFJO0FBQ0YsWUFBTSxNQUFNLElBQUksSUFBSSxNQUFNO0FBQzFCLFlBQU0sWUFBWSxLQUFLLGlCQUFpQixJQUFJLFNBQVMsTUFBTSxHQUFHLEVBQUUsSUFBSSxLQUFLLEVBQUU7QUFDM0UsVUFBSSxhQUFhLGdCQUFnQixLQUFLLFNBQVMsR0FBRztBQUNoRCxlQUFPO0FBQUEsTUFDVDtBQUVBLFlBQU0sWUFBWSxLQUFLLHlCQUF5QixXQUFXLEtBQUs7QUFDaEUsYUFBTyxZQUFZLEdBQUcsU0FBUyxJQUFJLFNBQVMsS0FBSyxnQkFBZ0IsU0FBUztBQUFBLElBQzVFLFFBQVE7QUFDTixZQUFNLFlBQVksS0FBSyx5QkFBeUIsV0FBVyxLQUFLO0FBQ2hFLGFBQU8sZ0JBQWdCLFNBQVM7QUFBQSxJQUNsQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLGlCQUFpQixVQUFrQjtBQUN6QyxXQUFPLFNBQVMsUUFBUSxrQkFBa0IsR0FBRyxFQUFFLEtBQUs7QUFBQSxFQUN0RDtBQUFBLEVBRVEseUJBQXlCLGFBQXFCO0FBQ3BELFVBQU0sV0FBVyxZQUFZLE1BQU0sR0FBRyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsWUFBWTtBQUM5RCxXQUFPLFNBQVMsUUFBUSxLQUFLO0FBQUEsRUFDL0I7QUFBQSxFQUVRLHVCQUF1QixhQUFxQixVQUFrQjtBQUNwRSxVQUFNLFdBQVcsWUFBWSxNQUFNLEdBQUcsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLFlBQVk7QUFDOUQsUUFBSSxZQUFZLGFBQWEsNEJBQTRCO0FBQ3ZELGFBQU87QUFBQSxJQUNUO0FBRUEsV0FBTyxLQUFLLHdCQUF3QixRQUFRO0FBQUEsRUFDOUM7QUFBQSxFQUVBLE1BQWMsYUFBYSxZQUFvQixRQUFxQixVQUFrQjtBQUNwRixVQUFNLEtBQUssd0JBQXdCLFVBQVU7QUFDN0MsVUFBTSxXQUFXLE1BQU0sS0FBSyxXQUFXO0FBQUEsTUFDckMsS0FBSyxLQUFLLGVBQWUsVUFBVTtBQUFBLE1BQ25DLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxRQUNQLGVBQWUsS0FBSyxnQkFBZ0I7QUFBQSxRQUNwQyxnQkFBZ0I7QUFBQSxNQUNsQjtBQUFBLE1BQ0EsTUFBTTtBQUFBLElBQ1IsQ0FBQztBQUVELFNBQUssc0JBQXNCLFVBQVUsUUFBUTtBQUFBLEVBQy9DO0FBQUEsRUFFQSxNQUFjLGtCQUFrQixLQUFxQixRQUFnQixNQUF1QztBQUMxRyxRQUFJLElBQUksb0JBQW9CLENBQUMsS0FBSyxNQUFNO0FBQ3RDO0FBQUEsSUFDRjtBQUVBLFVBQU0sWUFBWSxLQUFLLDhCQUE4QixHQUFHO0FBQ3hELFFBQUksV0FBVztBQUNiLFVBQUksZUFBZTtBQUNuQixZQUFNLFdBQVcsVUFBVSxRQUFRLEtBQUssdUJBQXVCLFVBQVUsSUFBSTtBQUM3RSxZQUFNLEtBQUssWUFBWSx5QkFBeUIsS0FBSyxNQUFNLFFBQVEsV0FBVyxRQUFRO0FBQ3RGO0FBQUEsSUFDRjtBQUVBLFVBQU0sT0FBTyxJQUFJLGVBQWUsUUFBUSxXQUFXLEdBQUcsS0FBSyxLQUFLO0FBQ2hFLFFBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyx5QkFBeUIsSUFBSSxHQUFHO0FBQ2pEO0FBQUEsSUFDRjtBQUVBLFFBQUksZUFBZTtBQUNuQixVQUFNLEtBQUssZ0NBQWdDLEtBQUssTUFBTSxRQUFRLElBQUk7QUFBQSxFQUNwRTtBQUFBLEVBRUEsTUFBYyxpQkFBaUIsS0FBZ0IsUUFBZ0IsTUFBdUM7QUFDcEcsUUFBSSxJQUFJLG9CQUFvQixDQUFDLEtBQUssTUFBTTtBQUN0QztBQUFBLElBQ0Y7QUFFQSxVQUFNLFlBQVksS0FBSyx5QkFBeUIsR0FBRztBQUNuRCxRQUFJLENBQUMsV0FBVztBQUNkO0FBQUEsSUFDRjtBQUVBLFFBQUksZUFBZTtBQUNuQixVQUFNLFdBQVcsVUFBVSxRQUFRLEtBQUssdUJBQXVCLFVBQVUsSUFBSTtBQUM3RSxVQUFNLEtBQUssWUFBWSx5QkFBeUIsS0FBSyxNQUFNLFFBQVEsV0FBVyxRQUFRO0FBQUEsRUFDeEY7QUFBQSxFQUVRLDhCQUE4QixLQUFxQjtBQUN6RCxVQUFNLFNBQVMsTUFBTSxLQUFLLElBQUksZUFBZSxTQUFTLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxTQUFTLEtBQUssS0FBSyxXQUFXLFFBQVEsQ0FBQztBQUN2RyxRQUFJLFFBQVE7QUFDVixhQUFPO0FBQUEsSUFDVDtBQUVBLFVBQU0sT0FBTyxNQUFNLEtBQUssSUFBSSxlQUFlLFNBQVMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLFVBQVUsTUFBTSxLQUFLLFdBQVcsUUFBUSxDQUFDO0FBQ3ZHLFdBQU8sTUFBTSxVQUFVLEtBQUs7QUFBQSxFQUM5QjtBQUFBLEVBRVEseUJBQXlCLE1BQWM7QUFDN0MsV0FBTyxrREFBa0QsS0FBSyxJQUFJO0FBQUEsRUFDcEU7QUFBQSxFQUVBLE1BQWMsZ0NBQWdDLFVBQWlCLFFBQWdCLE1BQWM7QUFDM0YsUUFBSTtBQUNGLFlBQU0sV0FBVyxNQUFNLEtBQUsscUNBQXFDLE1BQU0sUUFBUTtBQUMvRSxVQUFJLENBQUMsU0FBUyxLQUFLLEdBQUc7QUFDcEI7QUFBQSxNQUNGO0FBRUEsYUFBTyxpQkFBaUIsUUFBUTtBQUNoQyxVQUFJLHdCQUFPLEtBQUssRUFBRSxvR0FBb0IsZ0RBQWdELENBQUM7QUFBQSxJQUN6RixTQUFTLE9BQU87QUFDZCxjQUFRLE1BQU0sbURBQW1ELEtBQUs7QUFDdEUsVUFBSTtBQUFBLFFBQ0YsS0FBSztBQUFBLFVBQ0gsS0FBSyxFQUFFLGdFQUFjLHNDQUFzQztBQUFBLFVBQzNEO0FBQUEsUUFDRjtBQUFBLFFBQ0E7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMscUNBQXFDLE1BQWMsVUFBaUI7QUFDaEYsVUFBTSxTQUFTLElBQUksVUFBVTtBQUM3QixVQUFNQyxZQUFXLE9BQU8sZ0JBQWdCLE1BQU0sV0FBVztBQUN6RCxVQUFNLGNBQWMsb0JBQUksSUFBb0I7QUFDNUMsVUFBTSxpQkFBMkIsQ0FBQztBQUVsQyxlQUFXLFFBQVEsTUFBTSxLQUFLQSxVQUFTLEtBQUssVUFBVSxHQUFHO0FBQ3ZELFlBQU0sUUFBUSxNQUFNLEtBQUsscUJBQXFCLE1BQU0sVUFBVSxhQUFhLENBQUM7QUFDNUUsVUFBSSxNQUFNLEtBQUssR0FBRztBQUNoQix1QkFBZSxLQUFLLE1BQU0sS0FBSyxDQUFDO0FBQUEsTUFDbEM7QUFBQSxJQUNGO0FBRUEsV0FBTyxlQUFlLEtBQUssTUFBTSxJQUFJO0FBQUEsRUFDdkM7QUFBQSxFQUVBLE1BQWMscUJBQ1osTUFDQSxVQUNBLGFBQ0EsV0FDaUI7QUFDakIsUUFBSSxLQUFLLGFBQWEsS0FBSyxXQUFXO0FBQ3BDLGFBQU8sS0FBSyx1QkFBdUIsS0FBSyxlQUFlLEVBQUU7QUFBQSxJQUMzRDtBQUVBLFFBQUksRUFBRSxnQkFBZ0IsY0FBYztBQUNsQyxhQUFPO0FBQUEsSUFDVDtBQUVBLFVBQU0sTUFBTSxLQUFLLFFBQVEsWUFBWTtBQUNyQyxRQUFJLFFBQVEsT0FBTztBQUNqQixZQUFNLE1BQU0sS0FBSyxhQUFhLEtBQUssYUFBYSxLQUFLLEdBQUcsS0FBSyxLQUFLLEVBQUU7QUFDcEUsVUFBSSxDQUFDLEtBQUssVUFBVSxHQUFHLEdBQUc7QUFDeEIsZUFBTztBQUFBLE1BQ1Q7QUFFQSxZQUFNLE9BQU8sS0FBSyxhQUFhLEtBQUssS0FBSyxJQUFJLEtBQUssS0FBSyxLQUFLLHNCQUFzQixHQUFHO0FBQ3JGLFlBQU0sWUFBWSxNQUFNLEtBQUsscUJBQXFCLEtBQUssV0FBVztBQUNsRSxhQUFPLEtBQUssYUFBYSx1QkFBdUIsV0FBVyxHQUFHO0FBQUEsSUFDaEU7QUFFQSxRQUFJLFFBQVEsTUFBTTtBQUNoQixhQUFPO0FBQUEsSUFDVDtBQUVBLFFBQUksUUFBUSxRQUFRLFFBQVEsTUFBTTtBQUNoQyxZQUFNLFFBQWtCLENBQUM7QUFDekIsVUFBSSxRQUFRO0FBQ1osaUJBQVcsU0FBUyxNQUFNLEtBQUssS0FBSyxRQUFRLEdBQUc7QUFDN0MsWUFBSSxNQUFNLFFBQVEsWUFBWSxNQUFNLE1BQU07QUFDeEM7QUFBQSxRQUNGO0FBRUEsY0FBTSxZQUFZLE1BQU0sS0FBSyxxQkFBcUIsT0FBTyxVQUFVLGFBQWEsWUFBWSxDQUFDLEdBQUcsS0FBSztBQUNyRyxZQUFJLENBQUMsVUFBVTtBQUNiO0FBQUEsUUFDRjtBQUVBLGNBQU0sU0FBUyxRQUFRLE9BQU8sR0FBRyxLQUFLLE9BQU87QUFDN0MsY0FBTSxLQUFLLEdBQUcsS0FBSyxPQUFPLEtBQUssSUFBSSxHQUFHLFNBQVMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxHQUFHLFFBQVEsRUFBRTtBQUN2RSxpQkFBUztBQUFBLE1BQ1g7QUFFQSxhQUFPLE1BQU0sS0FBSyxJQUFJO0FBQUEsSUFDeEI7QUFFQSxRQUFJLFFBQVEsTUFBTTtBQUNoQixZQUFNLFFBQVEsTUFBTSxLQUFLLHlCQUF5QixNQUFNLFVBQVUsYUFBYSxTQUFTO0FBQ3hGLGFBQU8sTUFBTSxLQUFLLEVBQUUsRUFBRSxLQUFLO0FBQUEsSUFDN0I7QUFFQSxRQUFJLFdBQVcsS0FBSyxHQUFHLEdBQUc7QUFDeEIsWUFBTSxRQUFRLE9BQU8sU0FBUyxJQUFJLENBQUMsR0FBRyxFQUFFO0FBQ3hDLFlBQU0sUUFBUSxNQUFNLEtBQUsseUJBQXlCLE1BQU0sVUFBVSxhQUFhLFNBQVMsR0FBRyxLQUFLLEVBQUUsRUFBRSxLQUFLO0FBQ3pHLGFBQU8sT0FBTyxHQUFHLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSSxJQUFJLEtBQUs7QUFBQSxJQUNqRDtBQUVBLFFBQUksUUFBUSxLQUFLO0FBQ2YsWUFBTSxPQUFPLEtBQUssYUFBYSxNQUFNLEdBQUcsS0FBSyxLQUFLO0FBQ2xELFlBQU0sUUFBUSxNQUFNLEtBQUsseUJBQXlCLE1BQU0sVUFBVSxhQUFhLFNBQVMsR0FBRyxLQUFLLEVBQUUsRUFBRSxLQUFLO0FBQ3pHLFVBQUksUUFBUSxnQkFBZ0IsS0FBSyxJQUFJLEtBQUssTUFBTTtBQUM5QyxlQUFPLElBQUksSUFBSSxLQUFLLElBQUk7QUFBQSxNQUMxQjtBQUNBLGFBQU87QUFBQSxJQUNUO0FBRUEsVUFBTSxhQUFhLG9CQUFJLElBQUksQ0FBQyxVQUFVLEtBQUssTUFBTSxLQUFLLFFBQVEsUUFBUSxTQUFTLE9BQU8sS0FBSyxDQUFDO0FBQzVGLFFBQUksV0FBVyxJQUFJLEdBQUcsR0FBRztBQUN2QixjQUFRLE1BQU0sS0FBSyx5QkFBeUIsTUFBTSxVQUFVLGFBQWEsU0FBUyxHQUFHLEtBQUssRUFBRTtBQUFBLElBQzlGO0FBRUEsVUFBTSxZQUFZLG9CQUFJLElBQUk7QUFBQSxNQUN4QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNGLENBQUM7QUFDRCxRQUFJLFVBQVUsSUFBSSxHQUFHLEdBQUc7QUFDdEIsWUFBTSxRQUFRLE1BQU0sS0FBSyx5QkFBeUIsTUFBTSxVQUFVLGFBQWEsU0FBUyxHQUFHLEtBQUssRUFBRSxFQUFFLEtBQUs7QUFDekcsYUFBTztBQUFBLElBQ1Q7QUFFQSxZQUFRLE1BQU0sS0FBSyx5QkFBeUIsTUFBTSxVQUFVLGFBQWEsU0FBUyxHQUFHLEtBQUssRUFBRTtBQUFBLEVBQzlGO0FBQUEsRUFFQSxNQUFjLHlCQUNaLFNBQ0EsVUFDQSxhQUNBLFdBQ0E7QUFDQSxVQUFNLFFBQWtCLENBQUM7QUFDekIsZUFBVyxTQUFTLE1BQU0sS0FBSyxRQUFRLFVBQVUsR0FBRztBQUNsRCxZQUFNLFdBQVcsTUFBTSxLQUFLLHFCQUFxQixPQUFPLFVBQVUsYUFBYSxTQUFTO0FBQ3hGLFVBQUksQ0FBQyxVQUFVO0FBQ2I7QUFBQSxNQUNGO0FBRUEsVUFBSSxNQUFNLFNBQVMsS0FBSyxDQUFDLFNBQVMsV0FBVyxJQUFJLEtBQUssQ0FBQyxNQUFNLE1BQU0sU0FBUyxDQUFDLEVBQUUsU0FBUyxJQUFJLEdBQUc7QUFDN0YsY0FBTSxXQUFXLE1BQU0sTUFBTSxTQUFTLENBQUM7QUFDdkMsY0FBTSxhQUFhLE1BQU0sS0FBSyxRQUFRLEtBQUssTUFBTSxLQUFLLFFBQVE7QUFDOUQsWUFBSSxZQUFZO0FBQ2QsZ0JBQU0sS0FBSyxHQUFHO0FBQUEsUUFDaEI7QUFBQSxNQUNGO0FBRUEsWUFBTSxLQUFLLFFBQVE7QUFBQSxJQUNyQjtBQUVBLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFUSx1QkFBdUIsT0FBZTtBQUM1QyxXQUFPLE1BQU0sUUFBUSxRQUFRLEdBQUc7QUFBQSxFQUNsQztBQUFBLEVBRVEseUJBQXlCLEtBQWdCO0FBQy9DLFdBQU8sTUFBTSxLQUFLLElBQUksY0FBYyxTQUFTLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxTQUFTLEtBQUssS0FBSyxXQUFXLFFBQVEsQ0FBQyxLQUFLO0FBQUEsRUFDckc7QUFBQSxFQUVBLE1BQWMseUJBQXlCLFVBQWlCLFFBQWdCLFdBQWlCLFVBQWtCO0FBRXpHLFVBQU0sS0FBSyxZQUFZLHlCQUF5QixVQUFVLFFBQVEsV0FBVyxRQUFRO0FBQUEsRUFDdkY7QUFBQSxFQUVBLE1BQU0sMkJBQTJCLGFBQWEsTUFBTTtBQUNsRCxRQUFJLEtBQUssZ0JBQWdCO0FBQ3ZCLFVBQUksWUFBWTtBQUNkLFlBQUksd0JBQU8sS0FBSyxFQUFFLG9EQUFZLGdDQUFnQyxHQUFHLEdBQUk7QUFBQSxNQUN2RTtBQUNBO0FBQUEsSUFDRjtBQUVBLFNBQUssaUJBQWlCO0FBQ3RCLFFBQUk7QUFDRixXQUFLLGlCQUFpQjtBQUN0QixZQUFNLEtBQUssNkJBQTZCO0FBQ3hDLFlBQU0sZUFBZSxNQUFNLEtBQUssNkJBQTZCLFVBQVU7QUFDdkUsVUFBSSxDQUFDLGNBQWM7QUFDakI7QUFBQSxNQUNGO0FBQ0EsWUFBTSxLQUFLLHNCQUFzQjtBQUVqQyxZQUFNLFNBQVM7QUFBQSxRQUNiLFVBQVU7QUFBQSxRQUFHLG9CQUFvQjtBQUFBLFFBQUcscUJBQXFCO0FBQUEsUUFBRyxTQUFTO0FBQUEsUUFDckUsb0JBQW9CO0FBQUEsUUFBRyxtQkFBbUI7QUFBQSxRQUFHLG1CQUFtQjtBQUFBLFFBQ2hFLDBCQUEwQjtBQUFBLFFBQUcsd0JBQXdCO0FBQUEsUUFDckQsMEJBQTBCO0FBQUEsUUFBRywwQkFBMEI7QUFBQSxRQUN2RCx5QkFBeUI7QUFBQSxRQUFHLHlCQUF5QjtBQUFBLFFBQ3JELGNBQWM7QUFBQSxNQUNoQjtBQUtBLFlBQU0sS0FBSywyQkFBMkIsTUFBTTtBQUM1QyxZQUFNLEtBQUssNkJBQTZCLE1BQU07QUFFOUMsWUFBTSxrQkFBa0IsTUFBTSxLQUFLLGVBQWUsS0FBSyxTQUFTLHFCQUFxQjtBQUNyRixZQUFNLHFCQUFxQixNQUFNLEtBQUssdUJBQXVCO0FBQzdELFlBQU0sY0FBYyxnQkFBZ0I7QUFFcEMsWUFBTSxLQUFLLDZCQUE2QixhQUFhLG9CQUFvQixNQUFNO0FBQy9FLFlBQU0sS0FBSyx5QkFBeUIsYUFBYSxvQkFBb0IsTUFBTTtBQUMzRSxZQUFNLEtBQUssb0JBQW9CLGFBQWEsb0JBQW9CLE1BQU07QUFFdEUsWUFBTSxXQUFXLE1BQU0sS0FBSyxxQkFBcUIsZ0JBQWdCLFdBQVc7QUFDNUUsYUFBTywyQkFBMkIsU0FBUztBQUMzQyxhQUFPLDJCQUEyQixTQUFTO0FBQzNDLGFBQU8sMEJBQTBCLFNBQVM7QUFDMUMsYUFBTywwQkFBMEIsU0FBUztBQUMxQyxZQUFNLEtBQUssc0JBQXNCO0FBQ2pDLGFBQU8sZUFBZSxNQUFNLEtBQUssc0JBQXNCLEtBQUs7QUFDNUQsV0FBSyxzQkFBc0IsTUFBTTtBQUNqQyxXQUFLLDBCQUEwQixNQUFNO0FBRXJDLFdBQUssa0JBQWtCLEtBQUssSUFBSTtBQUNoQyxXQUFLLHNCQUFzQixLQUFLO0FBQUEsUUFDOUIsb0RBQVksT0FBTyxRQUFRLDJEQUFjLE9BQU8scUJBQXFCLE9BQU8sbUJBQW1CLHlDQUFXLE9BQU8sT0FBTyxtRkFBa0IsT0FBTyxrQkFBa0IseUNBQVcsT0FBTyxpQkFBaUIsVUFBSyxPQUFPLG9CQUFvQixJQUFJLDBEQUFhLE9BQU8saUJBQWlCLGtCQUFRLEVBQUUsU0FBSSxPQUFPLDJCQUEyQixLQUFLLE9BQU8sMkJBQTJCLElBQUksd0NBQVUsT0FBTyx3QkFBd0IscURBQWEsT0FBTyx3QkFBd0Isa0JBQVEsRUFBRSxHQUFHLE9BQU8sMEJBQTBCLEtBQUssT0FBTywwQkFBMEIsSUFBSSx3Q0FBVSxPQUFPLHVCQUF1QixxREFBYSxPQUFPLHVCQUF1QixrQkFBUSxFQUFFLEdBQUcsT0FBTyxlQUFlLElBQUksOENBQVcsT0FBTyxZQUFZLGtCQUFRLEVBQUUsR0FBRyxPQUFPLDJCQUEyQixJQUFJLGdCQUFNLE9BQU8sd0JBQXdCLDhFQUFrQixFQUFFLEdBQUcsT0FBTyx5QkFBeUIsSUFBSSxnRUFBYyxPQUFPLHNCQUFzQixrQkFBUSxFQUFFLFNBQUksUUFBUSxNQUFNLFFBQUc7QUFBQSxRQUM1NEIsK0JBQStCLE9BQU8sUUFBUSxvQkFBb0IsT0FBTyxxQkFBcUIsT0FBTyxtQkFBbUIsaUNBQWlDLE9BQU8sT0FBTywrQkFBK0IsT0FBTyxrQkFBa0IsK0JBQStCLE9BQU8saUJBQWlCLGlCQUFpQixPQUFPLG9CQUFvQixJQUFJLGVBQWUsT0FBTyxpQkFBaUIseUJBQXlCLEVBQUUsR0FBRyxPQUFPLDJCQUEyQixJQUFJLGFBQWEsT0FBTyx3QkFBd0IsbUJBQW1CLE9BQU8sNkJBQTZCLElBQUksTUFBTSxLQUFLLEtBQUssRUFBRSxHQUFHLE9BQU8sMkJBQTJCLElBQUksYUFBYSxPQUFPLHdCQUF3QixtQkFBbUIsT0FBTyw2QkFBNkIsSUFBSSxNQUFNLEtBQUssS0FBSyxFQUFFLEdBQUcsT0FBTywwQkFBMEIsSUFBSSxhQUFhLE9BQU8sdUJBQXVCLHdCQUF3QixPQUFPLDRCQUE0QixJQUFJLE1BQU0sS0FBSyxLQUFLLEVBQUUsR0FBRyxPQUFPLDBCQUEwQixJQUFJLGFBQWEsT0FBTyx1QkFBdUIsa0JBQWtCLE9BQU8sNEJBQTRCLElBQUksTUFBTSxLQUFLLEtBQUssRUFBRSxHQUFHLE9BQU8sZUFBZSxJQUFJLGlCQUFpQixPQUFPLFlBQVkseUJBQXlCLEVBQUUsR0FBRyxPQUFPLDJCQUEyQixJQUFJLHFCQUFxQixPQUFPLHdCQUF3QiwrQ0FBK0MsRUFBRSxHQUFHLE9BQU8seUJBQXlCLElBQUksZ0JBQWdCLE9BQU8sc0JBQXNCLDBDQUEwQyxFQUFFO0FBQUEsTUFDMTNDO0FBQ0EsWUFBTSxLQUFLLGdCQUFnQjtBQUMzQixVQUFJLFlBQVk7QUFDZCxZQUFJLHdCQUFPLEtBQUsscUJBQXFCLEdBQUk7QUFBQSxNQUMzQztBQUFBLElBQ0YsU0FBUyxPQUFPO0FBQ2QsY0FBUSxNQUFNLDZCQUE2QixLQUFLO0FBQ2hELFdBQUssa0JBQWtCLEtBQUssSUFBSTtBQUNoQyxXQUFLLHNCQUFzQixLQUFLLGNBQWMsS0FBSyxFQUFFLHdDQUFVLHFCQUFxQixHQUFHLEtBQUs7QUFDNUYsWUFBTSxLQUFLLGdCQUFnQjtBQUMzQixVQUFJLFlBQVk7QUFDZCxZQUFJLHdCQUFPLEtBQUsscUJBQXFCLEdBQUk7QUFBQSxNQUMzQztBQUFBLElBQ0YsVUFBRTtBQUNBLFdBQUssaUJBQWlCO0FBQUEsSUFDeEI7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLHdCQUF3QixhQUFhLE1BQU07QUFDL0MsUUFBSSxLQUFLLGdCQUFnQjtBQUN2QixVQUFJLFlBQVk7QUFDZCxZQUFJLHdCQUFPLEtBQUssRUFBRSxvREFBWSxnQ0FBZ0MsR0FBRyxHQUFJO0FBQUEsTUFDdkU7QUFDQTtBQUFBLElBQ0Y7QUFFQSxTQUFLLGlCQUFpQjtBQUN0QixVQUFNLFNBQVMsRUFBRSxVQUFVLEdBQUcsb0JBQW9CLEdBQUcsU0FBUyxHQUFHLHNCQUFzQixFQUFFO0FBQ3pGLFFBQUk7QUFDRixXQUFLLGlCQUFpQjtBQUN0QixZQUFNLEtBQUssNkJBQTZCO0FBQ3hDLFlBQU0sZUFBZSxNQUFNLEtBQUssNkJBQTZCLFVBQVU7QUFDdkUsVUFBSSxDQUFDLGNBQWM7QUFDakI7QUFBQSxNQUNGO0FBRUEsWUFBTSxLQUFLLDJCQUEyQixNQUFNO0FBQzVDLFlBQU0sS0FBSyxrQ0FBa0MsTUFBTTtBQUNuRCxZQUFNLEtBQUssNkJBQTZCLE1BQU07QUFDOUMsWUFBTSxLQUFLLDJCQUEyQixNQUFNO0FBRTVDLFdBQUssa0JBQWtCLEtBQUssSUFBSTtBQUNoQyxXQUFLLHNCQUFzQixLQUFLO0FBQUEsUUFDOUIsb0RBQVksT0FBTyxvQkFBb0IscURBQWEsT0FBTyxRQUFRLGlFQUFlLE9BQU8sa0JBQWtCLDZCQUFTLE9BQU8sT0FBTztBQUFBLFFBQ2xJLG1CQUFtQixPQUFPLG9CQUFvQiw4QkFBOEIsT0FBTyxRQUFRLHFCQUFxQixPQUFPLGtCQUFrQix3Q0FBd0MsT0FBTyxPQUFPO0FBQUEsTUFDak07QUFDQSxZQUFNLEtBQUssZ0JBQWdCO0FBQzNCLFVBQUksWUFBWTtBQUNkLFlBQUksd0JBQU8sS0FBSyxxQkFBcUIsR0FBSTtBQUFBLE1BQzNDO0FBQUEsSUFDRixTQUFTLE9BQU87QUFDZCxjQUFRLE1BQU0sa0NBQWtDLEtBQUs7QUFDckQsV0FBSyxrQkFBa0IsS0FBSyxJQUFJO0FBQ2hDLFdBQUssc0JBQXNCLEtBQUssY0FBYyxLQUFLLEVBQUUsd0NBQVUsa0JBQWtCLEdBQUcsS0FBSztBQUN6RixZQUFNLEtBQUssZ0JBQWdCO0FBQzNCLFVBQUksWUFBWTtBQUNkLFlBQUksd0JBQU8sS0FBSyxxQkFBcUIsR0FBSTtBQUFBLE1BQzNDO0FBQUEsSUFDRixVQUFFO0FBQ0EsV0FBSyxpQkFBaUI7QUFBQSxJQUN4QjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsa0NBQWtDLFFBQTJEO0FBQ3pHLFVBQU0sUUFBUSxLQUFLLFlBQVkseUJBQXlCO0FBQ3hELFVBQU0scUJBQXFCO0FBQzNCLGVBQVcsUUFBUSxPQUFPO0FBQ3hCLFlBQU0sYUFBYSxLQUFLLFlBQVkseUJBQXlCLEtBQUssSUFBSTtBQUN0RSxZQUFNLFdBQVcsS0FBSyxVQUFVLElBQUksS0FBSyxJQUFJO0FBQzdDLFlBQU0sa0JBQWtCLEtBQUssY0FBYyxPQUFPLE1BQU0sS0FBSyxnQ0FBZ0MsSUFBSSxJQUFJO0FBQ3JHLFVBQUksS0FBSyxjQUFjLFFBQVEsS0FBSyxjQUFjLG1CQUFtQixFQUFFLEdBQUc7QUFDeEUsZUFBTyxXQUFXO0FBQ2xCO0FBQUEsTUFDRjtBQUVBLFlBQU0saUJBQWlCLE1BQU0sS0FBSywyQkFBMkIsTUFBTSxlQUFlO0FBQ2xGLFlBQU0sdUJBQ0osS0FBSyxrQkFBa0IsS0FBSyxLQUFLLEtBQUssUUFBUSxLQUFLLGtCQUFrQjtBQUN2RSxVQUFJLENBQUMsWUFBWSxTQUFTLGVBQWUsY0FBYyxTQUFTLG1CQUFtQixrQkFBa0Isc0JBQXNCO0FBQ3pILFlBQUksQ0FBQyxLQUFLLHNCQUFzQixJQUFJLEtBQUssSUFBSSxHQUFHO0FBQzlDLGlCQUFPLHdCQUF3QjtBQUFBLFFBQ2pDO0FBQ0EsYUFBSyxxQkFBcUIsS0FBSyxJQUFJO0FBQUEsTUFDckM7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYywyQkFDWixRQUNBLGdCQUNBO0FBQ0EsVUFBTSxZQUFZLGlCQUFpQixJQUFJLElBQUksZUFBZSxJQUFJLENBQUMsYUFBUyxnQ0FBYyxJQUFJLENBQUMsQ0FBQyxJQUFJO0FBQ2hHLGVBQVcsQ0FBQyxTQUFTLEtBQUssS0FBSyxDQUFDLEdBQUcsS0FBSyx3QkFBd0IsUUFBUSxDQUFDLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLENBQUMsRUFBRSxjQUFjLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRztBQUNuSCxVQUFJLGFBQWEsQ0FBQyxVQUFVLElBQUksT0FBTyxHQUFHO0FBQ3hDO0FBQUEsTUFDRjtBQUVBLFVBQUksS0FBSyxZQUFZLDBCQUEwQixPQUFPLEtBQUssS0FBSyxZQUFZLDBCQUEwQixNQUFNLE9BQU8sR0FBRztBQUNwSCxhQUFLLHdCQUF3QixPQUFPLE9BQU87QUFDM0MsYUFBSywwQkFBMEIsT0FBTyxPQUFPO0FBQzdDLGVBQU8sV0FBVztBQUNsQjtBQUFBLE1BQ0Y7QUFFQSxZQUFNLEtBQUssdUJBQXVCLFNBQVMsTUFBTSxrQkFBa0I7QUFDbkUsWUFBTSxLQUFLLHdCQUF3QixNQUFNLGFBQWE7QUFDdEQsV0FBSywwQkFBMEIsT0FBTyxPQUFPO0FBQzdDLFdBQUssVUFBVSxPQUFPLE9BQU87QUFDN0IsYUFBTyxzQkFBc0I7QUFFN0IsWUFBTSxPQUFPLEtBQUssbUJBQW1CLE1BQU0sT0FBTztBQUNsRCxVQUFJLEVBQUUsZ0JBQWdCLHlCQUFRO0FBQzVCLGFBQUssd0JBQXdCLE9BQU8sT0FBTztBQUMzQyxlQUFPLFdBQVc7QUFDbEI7QUFBQSxNQUNGO0FBRUEsWUFBTSxrQkFBa0IsS0FBSyxjQUFjLE9BQU8sTUFBTSxLQUFLLGdDQUFnQyxJQUFJLElBQUk7QUFDckcsVUFBSSxLQUFLLGNBQWMsUUFBUSxLQUFLLGNBQWMsbUJBQW1CLEVBQUUsR0FBRztBQUN4RSxhQUFLLHdCQUF3QixPQUFPLE9BQU87QUFDM0MsYUFBSyxzQkFBc0IsT0FBTyxLQUFLLElBQUk7QUFDM0MsZUFBTyxXQUFXO0FBQ2xCO0FBQUEsTUFDRjtBQUVBLFlBQU0sYUFBYSxLQUFLLFlBQVkseUJBQXlCLEtBQUssSUFBSTtBQUN0RSxZQUFNLGlCQUFpQixNQUFNLEtBQUssMkJBQTJCLE1BQU0sZUFBZTtBQUNsRixVQUFJLGtCQUEwQztBQUM5QyxVQUFJO0FBQ0YsMEJBQWtCLE1BQU0sS0FBSyxlQUFlLFVBQVU7QUFBQSxNQUN4RCxRQUFRO0FBQ04sMEJBQWtCO0FBQUEsTUFDcEI7QUFDQSxVQUFJLG1CQUFtQixnQkFBZ0IsY0FBYyxnQkFBZ0I7QUFDbkUsY0FBTSxLQUFLLHdCQUF3QixNQUFNLG1CQUFtQixRQUFXLE9BQU87QUFBQSxNQUNoRjtBQUVBLFlBQU0saUJBQWlCLE1BQU0sS0FBSywwQkFBMEIsTUFBTSxZQUFZLGVBQWU7QUFDN0YsV0FBSyxVQUFVLElBQUksS0FBSyxNQUFNO0FBQUEsUUFDNUI7QUFBQSxRQUNBLGlCQUFpQixlQUFlO0FBQUEsUUFDaEM7QUFBQSxNQUNGLENBQUM7QUFDRCxXQUFLLHNCQUFzQixPQUFPLEtBQUssSUFBSTtBQUMzQyxXQUFLLHdCQUF3QixPQUFPLE9BQU87QUFDM0MsWUFBTSxLQUFLLHdCQUF3QixLQUFLLElBQUk7QUFDNUMsYUFBTyxZQUFZO0FBQUEsSUFDckI7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLDZCQUE2QixRQUF5RDtBQUNsRyxlQUFXLENBQUMsTUFBTSxLQUFLLEtBQUssQ0FBQyxHQUFHLEtBQUssMEJBQTBCLFFBQVEsQ0FBQyxFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxDQUFDLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUc7QUFDbEgsVUFBSSxLQUFLLFlBQVksMEJBQTBCLElBQUksR0FBRztBQUNwRCxhQUFLLDBCQUEwQixPQUFPLElBQUk7QUFDMUMsZUFBTyxXQUFXO0FBQ2xCO0FBQUEsTUFDRjtBQUVBLFlBQU0sS0FBSyx1QkFBdUIsTUFBTSxNQUFNLGVBQWU7QUFDN0QsWUFBTSxLQUFLLHdCQUF3QixNQUFNLFVBQVU7QUFDbkQsV0FBSyxVQUFVLE9BQU8sSUFBSTtBQUMxQixXQUFLLDBCQUEwQixPQUFPLElBQUk7QUFDMUMsYUFBTyxzQkFBc0I7QUFBQSxJQUMvQjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsMkJBQTJCLFFBQStDO0FBQ3RGLGVBQVcsUUFBUSxDQUFDLEdBQUcsS0FBSyxxQkFBcUIsRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUMsR0FBRztBQUNyRixVQUFJLEtBQUssWUFBWSwwQkFBMEIsSUFBSSxHQUFHO0FBQ3BELGFBQUssc0JBQXNCLE9BQU8sSUFBSTtBQUN0QyxlQUFPLFdBQVc7QUFDbEI7QUFBQSxNQUNGO0FBRUEsWUFBTSxPQUFPLEtBQUssbUJBQW1CLElBQUk7QUFDekMsVUFBSSxFQUFFLGdCQUFnQix5QkFBUTtBQUM1QixhQUFLLHNCQUFzQixPQUFPLElBQUk7QUFDdEMsZUFBTyxXQUFXO0FBQ2xCO0FBQUEsTUFDRjtBQUVBLFlBQU0sa0JBQWtCLEtBQUssY0FBYyxPQUFPLE1BQU0sS0FBSyxnQ0FBZ0MsSUFBSSxJQUFJO0FBQ3JHLFVBQUksS0FBSyxjQUFjLFFBQVEsS0FBSyxjQUFjLG1CQUFtQixFQUFFLEdBQUc7QUFDeEUsYUFBSyxzQkFBc0IsT0FBTyxJQUFJO0FBQ3RDLGVBQU8sV0FBVztBQUNsQjtBQUFBLE1BQ0Y7QUFFQSxZQUFNLGFBQWEsS0FBSyxZQUFZLHlCQUF5QixLQUFLLElBQUk7QUFDdEUsWUFBTSxpQkFBaUIsTUFBTSxLQUFLLDBCQUEwQixNQUFNLFlBQVksZUFBZTtBQUM3RixZQUFNLGlCQUFpQixNQUFNLEtBQUssMkJBQTJCLE1BQU0sZUFBZTtBQUNsRixXQUFLLFVBQVUsSUFBSSxLQUFLLE1BQU07QUFBQSxRQUM1QjtBQUFBLFFBQ0EsaUJBQWlCLGVBQWU7QUFBQSxRQUNoQztBQUFBLE1BQ0YsQ0FBQztBQUNELFlBQU0sS0FBSyx3QkFBd0IsS0FBSyxJQUFJO0FBQzVDLFdBQUssc0JBQXNCLE9BQU8sSUFBSTtBQUN0QyxhQUFPLFlBQVk7QUFBQSxJQUNyQjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsNkJBQ1osYUFDQSxvQkFDQSxRQUNBO0FBQ0EsVUFBTSxRQUFRLEtBQUssWUFBWSx5QkFBeUI7QUFDeEQsVUFBTSxlQUFlLElBQUksSUFBSSxNQUFNLElBQUksQ0FBQyxTQUFTLEtBQUssSUFBSSxDQUFDO0FBQzNELGVBQVcsUUFBUSxDQUFDLEdBQUcsS0FBSyxVQUFVLEtBQUssQ0FBQyxHQUFHO0FBQzdDLFVBQUksYUFBYSxJQUFJLElBQUksR0FBRztBQUMxQjtBQUFBLE1BQ0Y7QUFFQSxVQUFJLEtBQUssWUFBWSwwQkFBMEIsSUFBSSxHQUFHO0FBQ3BELGFBQUssVUFBVSxPQUFPLElBQUk7QUFDMUI7QUFBQSxNQUNGO0FBRUEsWUFBTSxXQUFXLEtBQUssVUFBVSxJQUFJLElBQUk7QUFDeEMsVUFBSSxDQUFDLFVBQVU7QUFDYixhQUFLLFVBQVUsT0FBTyxJQUFJO0FBQzFCO0FBQUEsTUFDRjtBQUVBLFlBQU0sU0FBUyxZQUFZLElBQUksU0FBUyxVQUFVO0FBQ2xELFVBQUksQ0FBQyxRQUFRO0FBQ1gsYUFBSyxVQUFVLE9BQU8sSUFBSTtBQUMxQjtBQUFBLE1BQ0Y7QUFFQSxZQUFNLFlBQVksbUJBQW1CLElBQUksSUFBSTtBQUM3QyxVQUFJLGFBQWEsS0FBSyxZQUFZLHlCQUF5QixXQUFXLE1BQU0sR0FBRztBQUM3RSxjQUFNLEtBQUssd0JBQXdCLE9BQU8sVUFBVTtBQUNwRCxvQkFBWSxPQUFPLE9BQU8sVUFBVTtBQUNwQyxhQUFLLFVBQVUsT0FBTyxJQUFJO0FBQzFCLGVBQU8sc0JBQXNCO0FBQzdCO0FBQUEsTUFDRjtBQUVBLFVBQUksV0FBVztBQUNiLGNBQU0sS0FBSyx3QkFBd0IsSUFBSTtBQUN2QywyQkFBbUIsT0FBTyxJQUFJO0FBQUEsTUFDaEM7QUFFQSxZQUFNLEtBQUssMEJBQTBCLE1BQU0sTUFBTTtBQUNqRCxXQUFLLFVBQVUsSUFBSSxNQUFNO0FBQUEsUUFDdkIsZ0JBQWdCLE9BQU87QUFBQSxRQUN2QixpQkFBaUIsT0FBTztBQUFBLFFBQ3hCLFlBQVksT0FBTztBQUFBLE1BQ3JCLENBQUM7QUFDRCxhQUFPLHNCQUFzQjtBQUFBLElBQy9CO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyx5QkFDWixhQUNBLG9CQUNBLFFBQ0E7QUFDQSxVQUFNLFFBQVEsS0FBSyxZQUFZLHlCQUF5QjtBQUN4RCxVQUFNLGVBQWUsSUFBSSxJQUFJLE1BQU0sSUFBSSxDQUFDLFNBQVMsS0FBSyxJQUFJLENBQUM7QUFDM0QsZUFBVyxVQUFVLENBQUMsR0FBRyxZQUFZLE9BQU8sQ0FBQyxFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxXQUFXLGNBQWMsRUFBRSxVQUFVLENBQUMsR0FBRztBQUN2RyxZQUFNLFlBQVksS0FBSyxZQUFZLHNCQUFzQixPQUFPLFVBQVU7QUFDMUUsVUFBSSxDQUFDLGFBQWEsYUFBYSxJQUFJLFNBQVMsR0FBRztBQUM3QztBQUFBLE1BQ0Y7QUFFQSxVQUFJLEtBQUssWUFBWSwwQkFBMEIsU0FBUyxHQUFHO0FBQ3pEO0FBQUEsTUFDRjtBQUVBLFVBQUksS0FBSyx3QkFBd0IsSUFBSSxTQUFTLEdBQUc7QUFDL0MsZUFBTyxXQUFXO0FBQ2xCO0FBQUEsTUFDRjtBQUVBLFlBQU0sWUFBWSxtQkFBbUIsSUFBSSxTQUFTO0FBQ2xELFVBQUksV0FBVztBQUNiLFlBQUksS0FBSyxZQUFZLHlCQUF5QixXQUFXLE1BQU0sR0FBRztBQUNoRSxnQkFBTSxLQUFLLHdCQUF3QixPQUFPLFVBQVU7QUFDcEQsc0JBQVksT0FBTyxPQUFPLFVBQVU7QUFDcEMsaUJBQU8sc0JBQXNCO0FBQzdCO0FBQUEsUUFDRjtBQUVBLGNBQU0sS0FBSyx3QkFBd0IsU0FBUztBQUM1QywyQkFBbUIsT0FBTyxTQUFTO0FBQUEsTUFDckM7QUFFQSxZQUFNLEtBQUssMEJBQTBCLFdBQVcsTUFBTTtBQUN0RCxXQUFLLFVBQVUsSUFBSSxXQUFXO0FBQUEsUUFDNUIsZ0JBQWdCLE9BQU87QUFBQSxRQUN2QixpQkFBaUIsT0FBTztBQUFBLFFBQ3hCLFlBQVksT0FBTztBQUFBLE1BQ3JCLENBQUM7QUFDRCxhQUFPLHNCQUFzQjtBQUFBLElBQy9CO0FBQUEsRUFDRjtBQUFBLEVBRVEscUNBQ04sTUFDQSxVQUNBLGdCQUNBLFlBQ0E7QUFDQSxRQUFJLFVBQVU7QUFDWixhQUFPLFNBQVMsZUFBZSxjQUFjLFNBQVMsbUJBQW1CO0FBQUEsSUFDM0U7QUFFQSxVQUFNLFVBQVU7QUFDaEIsV0FBTyxDQUFDLEtBQUssbUJBQW1CLEtBQUssS0FBSyxRQUFRLEtBQUssa0JBQWtCO0FBQUEsRUFDM0U7QUFBQSxFQUVRLDBCQUEwQjtBQUNoQyxVQUFNLFFBQVEsb0JBQUksS0FBSztBQUN2QixVQUFNLE1BQU0sQ0FBQyxVQUFrQixPQUFPLEtBQUssRUFBRSxTQUFTLEdBQUcsR0FBRztBQUM1RCxXQUFPLEdBQUcsTUFBTSxZQUFZLENBQUMsR0FBRyxJQUFJLE1BQU0sU0FBUyxJQUFJLENBQUMsQ0FBQyxHQUFHLElBQUksTUFBTSxRQUFRLENBQUMsQ0FBQyxJQUFJLElBQUksTUFBTSxTQUFTLENBQUMsQ0FBQyxHQUFHLElBQUksTUFBTSxXQUFXLENBQUMsQ0FBQyxHQUFHLElBQUksTUFBTSxXQUFXLENBQUMsQ0FBQztBQUFBLEVBQy9KO0FBQUEsRUFFUSxzQkFBc0IsY0FBc0IsT0FBZTtBQUNqRSxVQUFNLGlCQUFhLGdDQUFjLFlBQVk7QUFDN0MsVUFBTSxhQUFhLFdBQVcsWUFBWSxHQUFHO0FBQzdDLFVBQU0sTUFBTSxjQUFjLElBQUksV0FBVyxNQUFNLEdBQUcsYUFBYSxDQUFDLElBQUk7QUFDcEUsVUFBTSxPQUFPLGNBQWMsSUFBSSxXQUFXLE1BQU0sYUFBYSxDQUFDLElBQUk7QUFDbEUsVUFBTSxXQUFXLEtBQUssWUFBWSxHQUFHO0FBQ3JDLFVBQU0sT0FBTyxXQUFXLElBQUksS0FBSyxNQUFNLEdBQUcsUUFBUSxJQUFJO0FBQ3RELFVBQU0sTUFBTSxXQUFXLElBQUksS0FBSyxNQUFNLFFBQVEsSUFBSTtBQUNsRCxVQUFNLFNBQVMsa0JBQWtCLEtBQUssd0JBQXdCLENBQUMsSUFBSSxLQUFLO0FBQ3hFLFdBQU8sR0FBRyxHQUFHLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxHQUFHO0FBQUEsRUFDckM7QUFBQSxFQUVRLDZCQUE2QixjQUFzQjtBQUN6RCxVQUFNLGlCQUFhLGdDQUFjLFlBQVk7QUFDN0MsVUFBTSxhQUFhLFdBQVcsWUFBWSxHQUFHO0FBQzdDLFVBQU0sTUFBTSxjQUFjLElBQUksV0FBVyxNQUFNLEdBQUcsYUFBYSxDQUFDLElBQUk7QUFDcEUsVUFBTSxPQUFPLGNBQWMsSUFBSSxXQUFXLE1BQU0sYUFBYSxDQUFDLElBQUk7QUFDbEUsVUFBTSxXQUFXLEtBQUssWUFBWSxHQUFHO0FBQ3JDLFVBQU0sT0FBTyxXQUFXLElBQUksS0FBSyxNQUFNLEdBQUcsUUFBUSxJQUFJO0FBQ3RELFVBQU0sTUFBTSxXQUFXLElBQUksS0FBSyxNQUFNLFFBQVEsSUFBSTtBQUNsRCxVQUFNLFNBQVMsR0FBRyxHQUFHLEdBQUcsSUFBSTtBQUM1QixXQUFPLEtBQUssSUFBSSxNQUFNLFNBQVMsRUFDNUIsSUFBSSxDQUFDLFNBQVMsS0FBSyxJQUFJLEVBQ3ZCLEtBQUssQ0FBQyxTQUFTLEtBQUssV0FBVyxNQUFNLE1BQU0sQ0FBQyxPQUFPLEtBQUssU0FBUyxHQUFHLEVBQUUsS0FBSztBQUFBLEVBQ2hGO0FBQUEsRUFFQSxNQUFjLHdCQUF3QixNQUFhLGlCQUE0QyxPQUFlO0FBQzVHLFVBQU0sV0FBVyxLQUFLLDZCQUE2QixLQUFLLElBQUk7QUFDNUQsUUFBSSxVQUFVO0FBQ1osYUFBTztBQUFBLElBQ1Q7QUFFQSxRQUFJLGFBQWEsS0FBSyxzQkFBc0IsS0FBSyxNQUFNLEtBQUs7QUFDNUQsUUFBSSxVQUFVO0FBQ2QsV0FBTyxLQUFLLElBQUksTUFBTSxzQkFBc0IsVUFBVSxHQUFHO0FBQ3ZELFlBQU0saUJBQWEsZ0NBQWMsVUFBVTtBQUMzQyxZQUFNLFdBQVcsV0FBVyxZQUFZLEdBQUc7QUFDM0MsbUJBQWEsV0FBVyxJQUNwQixHQUFHLFdBQVcsTUFBTSxHQUFHLFFBQVEsQ0FBQyxJQUFJLE9BQU8sR0FBRyxXQUFXLE1BQU0sUUFBUSxDQUFDLEtBQ3hFLEdBQUcsVUFBVSxJQUFJLE9BQU87QUFDNUIsaUJBQVc7QUFBQSxJQUNiO0FBRUEsVUFBTSxLQUFLLHlCQUF5QixVQUFVO0FBQzlDLFFBQUksS0FBSyxjQUFjLE1BQU07QUFDM0IsWUFBTSxLQUFLLElBQUksTUFBTSxPQUFPLFlBQVksbUJBQW1CLE1BQU0sS0FBSyxnQ0FBZ0MsSUFBSSxDQUFDO0FBQUEsSUFDN0csT0FBTztBQUNMLFlBQU0sS0FBSyxJQUFJLE1BQU0sYUFBYSxZQUFZLE1BQU0sS0FBSyxJQUFJLE1BQU0sV0FBVyxJQUFJLENBQUM7QUFBQSxJQUNyRjtBQUVBLFNBQUsscUJBQXFCLFVBQVU7QUFDcEMsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVBLE1BQWMsb0JBQ1osYUFDQSxvQkFDQSxRQUNzQjtBQUN0QixVQUFNLFFBQVEsS0FBSyxZQUFZLHlCQUF5QjtBQUN4RCxVQUFNLG1CQUFtQixvQkFBSSxJQUFZO0FBRXpDLGVBQVcsUUFBUSxPQUFPO0FBQ3hCLFlBQU0sYUFBYSxLQUFLLFlBQVkseUJBQXlCLEtBQUssSUFBSTtBQUN0RSx1QkFBaUIsSUFBSSxVQUFVO0FBQy9CLFlBQU0sU0FBUyxZQUFZLElBQUksVUFBVTtBQUN6QyxZQUFNLGtCQUFrQixRQUFRLGFBQWE7QUFDN0MsWUFBTSxXQUFXLEtBQUssVUFBVSxJQUFJLEtBQUssSUFBSTtBQUM3QyxZQUFNLGtCQUFrQixLQUFLLGNBQWMsT0FBTyxNQUFNLEtBQUssZ0NBQWdDLElBQUksSUFBSTtBQUNyRyxZQUFNLGlCQUFpQixNQUFNLEtBQUssMkJBQTJCLE1BQU0sbUJBQW1CLE1BQVM7QUFFL0YsVUFBSSxLQUFLLGNBQWMsTUFBTTtBQUMzQixjQUFNLE9BQU8sS0FBSyxjQUFjLG1CQUFtQixFQUFFO0FBQ3JELFlBQUksTUFBTTtBQUNSLGdCQUFNLGFBQWEsWUFBWSxJQUFJLEtBQUssVUFBVTtBQUNsRCxnQkFBTUMsYUFBWSxtQkFBbUIsSUFBSSxLQUFLLElBQUk7QUFDbEQsZ0JBQU0sYUFBYSxNQUFNLEtBQUssb0JBQW9CLE1BQU0sTUFBTSxZQUFZQSxVQUFTO0FBQ25GLGNBQUksV0FBVyxXQUFXLFdBQVc7QUFDbkMsbUJBQU8scUJBQXFCO0FBQzVCLG1CQUFPLHFCQUFxQjtBQUM1QixnQkFBSSxXQUFXLGVBQWU7QUFDNUIscUJBQU8sMEJBQTBCO0FBQUEsWUFDbkM7QUFDQTtBQUFBLFVBQ0Y7QUFDQSxjQUFJLFdBQVcsV0FBVyxXQUFXO0FBQ25DLG1CQUFPLDRCQUE0QjtBQUFBLFVBQ3JDO0FBQ0EsZUFBSyxVQUFVLElBQUksS0FBSyxNQUFNO0FBQUEsWUFDNUI7QUFBQSxZQUNBLGlCQUFpQixZQUFZLGFBQWEsVUFBVSxtQkFBbUI7QUFBQSxZQUN2RTtBQUFBLFVBQ0YsQ0FBQztBQUNELGlCQUFPLFdBQVc7QUFDbEI7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUVBLFlBQU0sWUFBWSxtQkFBbUIsSUFBSSxLQUFLLElBQUk7QUFDbEQsWUFBTSx5QkFBeUIsVUFBVSxlQUFlLGNBQWMsU0FBUyxtQkFBbUI7QUFDbEcsVUFBSSxXQUFXO0FBQ2IsWUFDRSwwQkFDQSxLQUFLLFlBQVksK0JBQStCLE1BQU0sU0FBUyxLQUMvRCxLQUFLLFlBQVkseUJBQXlCLFdBQVcsTUFBTSxHQUMzRDtBQUNBLGdCQUFNLEtBQUsscUJBQXFCLElBQUk7QUFDcEMsZUFBSyxVQUFVLE9BQU8sS0FBSyxJQUFJO0FBQy9CLGlCQUFPLHFCQUFxQjtBQUM1QixjQUFJLFFBQVE7QUFDVixrQkFBTSxLQUFLLHdCQUF3QixPQUFPLFVBQVU7QUFDcEQsd0JBQVksT0FBTyxPQUFPLFVBQVU7QUFDcEMsbUJBQU8sc0JBQXNCO0FBQUEsVUFDL0I7QUFDQTtBQUFBLFFBQ0Y7QUFFQSxZQUFJLENBQUMsWUFBWSxLQUFLLFlBQVksK0JBQStCLE1BQU0sU0FBUyxHQUFHO0FBQ2pGLGdCQUFNLEtBQUssd0JBQXdCLE1BQU0saUJBQWlCLE9BQU87QUFDakUsaUJBQU8sV0FBVztBQUNsQjtBQUFBLFFBQ0Y7QUFFQSxjQUFNLEtBQUssd0JBQXdCLEtBQUssSUFBSTtBQUM1QywyQkFBbUIsT0FBTyxLQUFLLElBQUk7QUFBQSxNQUNyQztBQUVBLFVBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxxQ0FBcUMsTUFBTSxVQUFVLGdCQUFnQixVQUFVLEdBQUc7QUFDckcsZUFBTyxXQUFXO0FBQ2xCO0FBQUEsTUFDRjtBQUVBLFVBQUksQ0FBQyxRQUFRO0FBQ1gsY0FBTSxpQkFBaUIsTUFBTSxLQUFLLDBCQUEwQixNQUFNLFlBQVksbUJBQW1CLE1BQVM7QUFDMUcsYUFBSyxVQUFVLElBQUksS0FBSyxNQUFNO0FBQUEsVUFDNUI7QUFBQSxVQUNBLGlCQUFpQixlQUFlO0FBQUEsVUFDaEM7QUFBQSxRQUNGLENBQUM7QUFDRCxvQkFBWSxJQUFJLFlBQVksY0FBYztBQUMxQyxlQUFPLFlBQVk7QUFDbkI7QUFBQSxNQUNGO0FBRUEsVUFBSSxDQUFDLFVBQVU7QUFDYixZQUFJLG1CQUFtQixpQkFBaUI7QUFDdEMsZUFBSyxVQUFVLElBQUksS0FBSyxNQUFNLEVBQUUsZ0JBQWdCLGlCQUFpQixXQUFXLENBQUM7QUFDN0UsZ0JBQU0sS0FBSyx3QkFBd0IsS0FBSyxJQUFJO0FBQzVDLGlCQUFPLFdBQVc7QUFDbEI7QUFBQSxRQUNGO0FBRUEsWUFBSSxLQUFLLFlBQVksNEJBQTRCLEtBQUssS0FBSyxPQUFPLE9BQU8sWUFBWSxHQUFHO0FBQ3RGLGdCQUFNLEtBQUssMEJBQTBCLEtBQUssTUFBTSxRQUFRLElBQUk7QUFDNUQsZ0JBQU0sWUFBWSxLQUFLLG1CQUFtQixLQUFLLElBQUk7QUFDbkQsZUFBSyxVQUFVLElBQUksS0FBSyxNQUFNO0FBQUEsWUFDNUIsZ0JBQWdCLFlBQVksTUFBTSxLQUFLLDJCQUEyQixTQUFTLElBQUk7QUFBQSxZQUMvRTtBQUFBLFlBQ0E7QUFBQSxVQUNGLENBQUM7QUFDRCxpQkFBTyx1QkFBdUI7QUFDOUI7QUFBQSxRQUNGO0FBRUEsY0FBTSxpQkFBaUIsTUFBTSxLQUFLLDBCQUEwQixNQUFNLFlBQVksbUJBQW1CLE1BQVM7QUFDMUcsYUFBSyxVQUFVLElBQUksS0FBSyxNQUFNO0FBQUEsVUFDNUI7QUFBQSxVQUNBLGlCQUFpQixlQUFlO0FBQUEsVUFDaEM7QUFBQSxRQUNGLENBQUM7QUFDRCxvQkFBWSxJQUFJLFlBQVksY0FBYztBQUMxQyxjQUFNLEtBQUssd0JBQXdCLEtBQUssSUFBSTtBQUM1QyxlQUFPLFlBQVk7QUFDbkI7QUFBQSxNQUNGO0FBRUEsWUFBTSxlQUFlLFNBQVMsbUJBQW1CLGtCQUFrQixTQUFTLGVBQWU7QUFDM0YsWUFBTSxnQkFBZ0IsU0FBUyxvQkFBb0IsbUJBQW1CLFNBQVMsZUFBZTtBQUM5RixVQUFJLENBQUMsZ0JBQWdCLENBQUMsZUFBZTtBQUNuQyxlQUFPLFdBQVc7QUFDbEI7QUFBQSxNQUNGO0FBRUEsVUFBSSxDQUFDLGdCQUFnQixlQUFlO0FBQ2xDLGNBQU0sS0FBSywwQkFBMEIsS0FBSyxNQUFNLFFBQVEsSUFBSTtBQUM1RCxjQUFNLFlBQVksS0FBSyxtQkFBbUIsS0FBSyxJQUFJO0FBQ25ELGFBQUssVUFBVSxJQUFJLEtBQUssTUFBTTtBQUFBLFVBQzVCLGdCQUFnQixZQUFZLE1BQU0sS0FBSywyQkFBMkIsU0FBUyxJQUFJO0FBQUEsVUFDL0U7QUFBQSxVQUNBO0FBQUEsUUFDRixDQUFDO0FBQ0QsZUFBTyx1QkFBdUI7QUFDOUI7QUFBQSxNQUNGO0FBRUEsVUFBSSxnQkFBZ0IsQ0FBQyxlQUFlO0FBQ2xDLGNBQU0saUJBQWlCLE1BQU0sS0FBSywwQkFBMEIsTUFBTSxZQUFZLG1CQUFtQixNQUFTO0FBQzFHLGFBQUssVUFBVSxJQUFJLEtBQUssTUFBTTtBQUFBLFVBQzVCO0FBQUEsVUFDQSxpQkFBaUIsZUFBZTtBQUFBLFVBQ2hDO0FBQUEsUUFDRixDQUFDO0FBQ0Qsb0JBQVksSUFBSSxZQUFZLGNBQWM7QUFDMUMsY0FBTSxLQUFLLHdCQUF3QixLQUFLLElBQUk7QUFDNUMsZUFBTyxZQUFZO0FBQ25CO0FBQUEsTUFDRjtBQUVBLFlBQU0sS0FBSyx3QkFBd0IsTUFBTSxpQkFBaUIsT0FBTztBQUNqRSxhQUFPLFdBQVc7QUFDbEI7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVBLE1BQWMsd0JBQXdCLFlBQW9CO0FBQ3hELFFBQUk7QUFDRixZQUFNLFdBQVcsTUFBTSxLQUFLLFdBQVc7QUFBQSxRQUNyQyxLQUFLLEtBQUssZUFBZSxVQUFVO0FBQUEsUUFDbkMsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLFVBQ1AsZUFBZSxLQUFLLGdCQUFnQjtBQUFBLFFBQ3RDO0FBQUEsTUFDRixDQUFDO0FBRUQsVUFBSSxTQUFTLFdBQVcsUUFBUSxTQUFTLFNBQVMsT0FBTyxTQUFTLFVBQVUsTUFBTTtBQUNoRixjQUFNLElBQUksTUFBTSw2QkFBNkIsU0FBUyxNQUFNLEVBQUU7QUFBQSxNQUNoRTtBQUFBLElBQ0YsU0FBUyxPQUFPO0FBQ2QsY0FBUSxNQUFNLDBDQUEwQyxZQUFZLEtBQUs7QUFDekUsWUFBTTtBQUFBLElBQ1I7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLHVCQUF1QixXQUFtQixpQkFBMEI7QUFDaEYsVUFBTSxVQUE2QjtBQUFBLE1BQ2pDLE1BQU07QUFBQSxNQUNOLFdBQVcsS0FBSyxJQUFJO0FBQUEsTUFDcEI7QUFBQSxJQUNGO0FBQ0EsVUFBTSxLQUFLO0FBQUEsTUFDVCxLQUFLLFlBQVksd0JBQXdCLFNBQVM7QUFBQSxNQUNsRCxLQUFLLFdBQVcsS0FBSyxVQUFVLE9BQU8sQ0FBQztBQUFBLE1BQ3ZDO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsd0JBQXdCLFdBQW1CO0FBQ3ZELFFBQUk7QUFDRixZQUFNLEtBQUssd0JBQXdCLEtBQUssWUFBWSx3QkFBd0IsU0FBUyxDQUFDO0FBQUEsSUFDeEYsUUFBUTtBQUFBLElBRVI7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLHNCQUFzQixXQUFtQjtBQUNyRCxVQUFNLFdBQVcsTUFBTSxLQUFLLFdBQVc7QUFBQSxNQUNyQyxLQUFLLEtBQUssZUFBZSxLQUFLLFlBQVksd0JBQXdCLFNBQVMsQ0FBQztBQUFBLE1BQzVFLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxRQUNQLGVBQWUsS0FBSyxnQkFBZ0I7QUFBQSxNQUN0QztBQUFBLElBQ0YsQ0FBQztBQUVELFFBQUksU0FBUyxXQUFXLEtBQUs7QUFDM0IsYUFBTztBQUFBLElBQ1Q7QUFDQSxTQUFLLHNCQUFzQixVQUFVLGVBQWU7QUFFcEQsV0FBTyxLQUFLLFlBQVksOEJBQThCLEtBQUssV0FBVyxTQUFTLFdBQVcsQ0FBQztBQUFBLEVBQzdGO0FBQUEsRUFFQSxNQUFjLHlCQUF5QjtBQUNyQyxVQUFNLGFBQWEsb0JBQUksSUFBK0I7QUFDdEQsVUFBTSxZQUFZLE1BQU0sS0FBSyxlQUFlLEtBQUssWUFBWSxvQkFBb0IsQ0FBQztBQUNsRixlQUFXLFVBQVUsVUFBVSxNQUFNLE9BQU8sR0FBRztBQUM3QyxZQUFNLFlBQVksS0FBSyxZQUFZLDhCQUE4QixPQUFPLFVBQVU7QUFDbEYsVUFBSSxDQUFDLFdBQVc7QUFDZDtBQUFBLE1BQ0Y7QUFFQSxZQUFNLFdBQVcsTUFBTSxLQUFLLFdBQVc7QUFBQSxRQUNyQyxLQUFLLEtBQUssZUFBZSxPQUFPLFVBQVU7QUFBQSxRQUMxQyxRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsVUFDUCxlQUFlLEtBQUssZ0JBQWdCO0FBQUEsUUFDdEM7QUFBQSxNQUNGLENBQUM7QUFDRCxVQUFJLFNBQVMsU0FBUyxPQUFPLFNBQVMsVUFBVSxLQUFLO0FBQ25EO0FBQUEsTUFDRjtBQUVBLFlBQU0sWUFBWSxLQUFLLFlBQVksOEJBQThCLEtBQUssV0FBVyxTQUFTLFdBQVcsQ0FBQztBQUN0RyxVQUFJLFdBQVc7QUFDYixtQkFBVyxJQUFJLFdBQVcsU0FBUztBQUFBLE1BQ3JDO0FBQUEsSUFDRjtBQUVBLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFUSxtQkFBbUIsTUFBYztBQUN2QyxVQUFNLE9BQU8sS0FBSyxJQUFJLE1BQU0sc0JBQXNCLElBQUk7QUFDdEQsV0FBTyxnQkFBZ0IseUJBQVEsT0FBTztBQUFBLEVBQ3hDO0FBQUEsRUFFQSxNQUFjLHFCQUFxQixNQUFhO0FBQzlDLFFBQUk7QUFDRixZQUFNLEtBQUssSUFBSSxNQUFNLE9BQU8sTUFBTSxJQUFJO0FBQUEsSUFDeEMsU0FBUyxhQUFhO0FBQ3BCLFVBQUk7QUFDRixjQUFNLEtBQUssSUFBSSxNQUFNLE1BQU0sTUFBTSxJQUFJO0FBQUEsTUFDdkMsUUFBUTtBQUNOLGNBQU07QUFBQSxNQUNSO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMseUJBQXlCLE1BQWM7QUFDbkQsVUFBTSxpQkFBYSxnQ0FBYyxJQUFJO0FBQ3JDLFVBQU0sV0FBVyxXQUFXLE1BQU0sR0FBRyxFQUFFLE9BQU8sQ0FBQyxVQUFVLE1BQU0sU0FBUyxDQUFDO0FBQ3pFLFFBQUksU0FBUyxVQUFVLEdBQUc7QUFDeEI7QUFBQSxJQUNGO0FBRUEsUUFBSSxVQUFVO0FBQ2QsYUFBUyxRQUFRLEdBQUcsUUFBUSxTQUFTLFNBQVMsR0FBRyxTQUFTLEdBQUc7QUFDM0QsZ0JBQVUsVUFBVSxHQUFHLE9BQU8sSUFBSSxTQUFTLEtBQUssQ0FBQyxLQUFLLFNBQVMsS0FBSztBQUNwRSxVQUFJLENBQUUsTUFBTSxLQUFLLElBQUksTUFBTSxRQUFRLE9BQU8sT0FBTyxHQUFJO0FBQ25ELFlBQUk7QUFDRixnQkFBTSxLQUFLLElBQUksTUFBTSxRQUFRLE1BQU0sT0FBTztBQUFBLFFBQzVDLFNBQVMsR0FBRztBQUNWLGdCQUFNLE1BQU0sYUFBYSxRQUFRLEVBQUUsVUFBVSxPQUFPLENBQUM7QUFDckQsY0FBSSxDQUFDLElBQUksU0FBUyxnQkFBZ0IsR0FBRztBQUNuQyxrQkFBTTtBQUFBLFVBQ1I7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLDBCQUEwQixXQUFtQixRQUF5QixjQUFzQjtBQUN4RyxVQUFNLFdBQVcsTUFBTSxLQUFLLFdBQVc7QUFBQSxNQUNyQyxLQUFLLEtBQUssZUFBZSxPQUFPLFVBQVU7QUFBQSxNQUMxQyxRQUFRO0FBQUEsTUFDUixTQUFTO0FBQUEsUUFDUCxlQUFlLEtBQUssZ0JBQWdCO0FBQUEsTUFDdEM7QUFBQSxJQUNGLENBQUM7QUFDRCxTQUFLLHNCQUFzQixVQUFVLEtBQUs7QUFFMUMsVUFBTSxLQUFLLHlCQUF5QixTQUFTO0FBQzdDLFVBQU0sVUFBVTtBQUFBLE1BQ2QsT0FBTyxPQUFPLGVBQWUsSUFBSSxPQUFPLGVBQWUsS0FBSyxJQUFJO0FBQUEsSUFDbEU7QUFDQSxVQUFNLE9BQU8sVUFBVSxZQUFZLEVBQUUsU0FBUyxLQUFLO0FBQ25ELFVBQU0sVUFDSixnQkFBZ0IsS0FBSyxtQkFBbUIsU0FBUyxLQUFLLEtBQUssSUFBSSxNQUFNLHNCQUFzQixTQUFTO0FBQ3RHLFFBQUksV0FBVyxtQkFBbUIsd0JBQU87QUFDdkMsVUFBSSxRQUFRLGNBQWMsTUFBTTtBQUM5QixjQUFNLEtBQUssSUFBSSxNQUFNLE9BQU8sU0FBUyxLQUFLLFdBQVcsU0FBUyxXQUFXLEdBQUcsT0FBTztBQUFBLE1BQ3JGLE9BQU87QUFDTCxjQUFNLEtBQUssSUFBSSxNQUFNLGFBQWEsU0FBUyxTQUFTLGFBQWEsT0FBTztBQUFBLE1BQzFFO0FBQ0E7QUFBQSxJQUNGO0FBQ0EsUUFBSTtBQUNGLFVBQUksTUFBTTtBQUNSLGNBQU0sS0FBSyxJQUFJLE1BQU0sT0FBTyxXQUFXLEtBQUssV0FBVyxTQUFTLFdBQVcsR0FBRyxPQUFPO0FBQUEsTUFDdkYsT0FBTztBQUNMLGNBQU0sS0FBSyxJQUFJLE1BQU0sYUFBYSxXQUFXLFNBQVMsYUFBYSxPQUFPO0FBQUEsTUFDNUU7QUFBQSxJQUNGLFNBQVMsR0FBRztBQUNWLFlBQU0sTUFBTSxhQUFhLFFBQVEsRUFBRSxVQUFVLE9BQU8sQ0FBQztBQUNyRCxVQUFJLElBQUksU0FBUyxnQkFBZ0IsR0FBRztBQUNsQyxjQUFNLE9BQU8sS0FBSyxJQUFJLE1BQU0sc0JBQXNCLFNBQVM7QUFDM0QsWUFBSSxRQUFRLGdCQUFnQix3QkFBTztBQUNqQyxjQUFJLEtBQUssY0FBYyxNQUFNO0FBQzNCLGtCQUFNLEtBQUssSUFBSSxNQUFNLE9BQU8sTUFBTSxLQUFLLFdBQVcsU0FBUyxXQUFXLEdBQUcsT0FBTztBQUFBLFVBQ2xGLE9BQU87QUFDTCxrQkFBTSxLQUFLLElBQUksTUFBTSxhQUFhLE1BQU0sU0FBUyxhQUFhLE9BQU87QUFBQSxVQUN2RTtBQUNBO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFDQSxZQUFNO0FBQUEsSUFDUjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsNEJBQTRCLFlBQW9CLFVBQXVCO0FBQ25GLFVBQU0sV0FBVyxNQUFNLEtBQUssV0FBVztBQUFBLE1BQ3JDLEtBQUssS0FBSyxlQUFlLFVBQVU7QUFBQSxNQUNuQyxRQUFRO0FBQUEsTUFDUixTQUFTO0FBQUEsUUFDUCxlQUFlLEtBQUssZ0JBQWdCO0FBQUEsTUFDdEM7QUFBQSxJQUNGLENBQUM7QUFFRCxRQUFJLFNBQVMsU0FBUyxPQUFPLFNBQVMsVUFBVSxLQUFLO0FBQ25ELGFBQU87QUFBQSxJQUNUO0FBRUEsV0FBTyxLQUFLLGtCQUFrQixVQUFVLFNBQVMsV0FBVztBQUFBLEVBQzlEO0FBQUEsRUFFQSxNQUFjLGVBQWUsWUFBb0I7QUFDL0MsVUFBTSxXQUFXLE1BQU0sS0FBSyxXQUFXO0FBQUEsTUFDckMsS0FBSyxLQUFLLGVBQWUsVUFBVTtBQUFBLE1BQ25DLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxRQUNQLGVBQWUsS0FBSyxnQkFBZ0I7QUFBQSxRQUNwQyxPQUFPO0FBQUEsTUFDVDtBQUFBLElBQ0YsQ0FBQztBQUVELFFBQUksU0FBUyxXQUFXLEtBQUs7QUFDM0IsYUFBTztBQUFBLElBQ1Q7QUFDQSxTQUFLLHNCQUFzQixVQUFVLGdCQUFnQixVQUFVLEVBQUU7QUFFakUsVUFBTSxVQUFVLEtBQUssV0FBVyxTQUFTLFdBQVc7QUFDcEQsVUFBTSxVQUFVLEtBQUssOEJBQThCLFNBQVMsWUFBWSxJQUFJO0FBQzVFLFdBQU8sUUFBUSxLQUFLLENBQUMsVUFBVSxDQUFDLE1BQU0sWUFBWSxHQUFHLFFBQVE7QUFBQSxFQUMvRDtBQUFBLEVBRUEsTUFBYywwQkFBMEIsTUFBYSxZQUFvQixpQkFBMEI7QUFDakcsUUFBSTtBQUVKLFFBQUksS0FBSyxjQUFjLE1BQU07QUFDM0IsWUFBTSxVQUFVLG1CQUFvQixNQUFNLEtBQUssZ0NBQWdDLElBQUk7QUFDbkYsVUFBSSxLQUFLLGNBQWMsT0FBTyxHQUFHO0FBQy9CLGNBQU0sSUFBSTtBQUFBLFVBQ1IsS0FBSztBQUFBLFlBQ0g7QUFBQSxZQUNBO0FBQUEsVUFDRjtBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBRUEsZUFBUyxLQUFLLFdBQVcsT0FBTztBQUFBLElBQ2xDLE9BQU87QUFDTCxlQUFTLE1BQU0sS0FBSyxJQUFJLE1BQU0sV0FBVyxJQUFJO0FBQUEsSUFDL0M7QUFFQSxVQUFNLEtBQUssYUFBYSxZQUFZLFFBQVEsS0FBSyxZQUFZLEtBQUssU0FBUyxDQUFDO0FBQzVFLFFBQUksU0FBaUM7QUFDckMsUUFBSTtBQUNGLGVBQVMsTUFBTSxLQUFLLGVBQWUsVUFBVTtBQUFBLElBQy9DLFFBQVE7QUFDTixlQUFTO0FBQUEsSUFDWDtBQUNBLFFBQUksUUFBUTtBQUNWLGFBQU87QUFBQSxJQUNUO0FBRUEsV0FBTztBQUFBLE1BQ0w7QUFBQSxNQUNBLGNBQWMsS0FBSyxLQUFLO0FBQUEsTUFDeEIsTUFBTSxLQUFLLEtBQUs7QUFBQSxNQUNoQixXQUFXLEtBQUssWUFBWSxtQkFBbUIsSUFBSTtBQUFBLElBQ3JEO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyx3QkFBd0IsV0FBbUI7QUFDdkQsVUFBTSxXQUFXLEtBQUssVUFBVSxJQUFJLFNBQVM7QUFDN0MsVUFBTSxhQUFhLFVBQVUsY0FBYyxLQUFLLFlBQVkseUJBQXlCLFNBQVM7QUFDOUYsVUFBTSxLQUFLLHdCQUF3QixVQUFVO0FBQzdDLFNBQUssVUFBVSxPQUFPLFNBQVM7QUFDL0IsVUFBTSxLQUFLLGdCQUFnQjtBQUFBLEVBQzdCO0FBQUEsRUFFQSxNQUFjLGVBQWUsTUFBb0I7QUFDL0MsUUFBSSxFQUFFLGdCQUFnQiwyQkFBVSxLQUFLLGNBQWMsTUFBTTtBQUN2RDtBQUFBLElBQ0Y7QUFFQSxTQUFLLHFCQUFxQixJQUFJLEtBQUssTUFBTSxLQUFLLElBQUksQ0FBQztBQUNuRCxVQUFNLEtBQUssZ0JBQWdCO0FBRTNCLFVBQU0sVUFBVSxNQUFNLEtBQUssSUFBSSxNQUFNLEtBQUssSUFBSTtBQUM5QyxVQUFNLE9BQU8sS0FBSyxjQUFjLE9BQU87QUFDdkMsUUFBSSxDQUFDLE1BQU07QUFDVDtBQUFBLElBQ0Y7QUFFQSxRQUFJO0FBQ0YsWUFBTSxTQUFTLE1BQU0sS0FBSyxlQUFlLEtBQUssVUFBVTtBQUN4RCxZQUFNLFlBQVksQ0FBQyxTQUFTLE1BQU0sS0FBSyxzQkFBc0IsS0FBSyxJQUFJLElBQUk7QUFDMUUsWUFBTSxhQUFhLE1BQU0sS0FBSyxvQkFBb0IsTUFBTSxNQUFNLFFBQVEsU0FBUztBQUMvRSxZQUFNLEtBQUssZ0JBQWdCO0FBRTNCLFVBQUksV0FBVyxXQUFXLFdBQVc7QUFDbkMsWUFBSTtBQUFBLFVBQ0YsS0FBSztBQUFBLFlBQ0gsV0FBVyxnQkFDUCxpSUFBd0IsS0FBSyxRQUFRLEtBQ3JDLCtHQUFxQixLQUFLLFFBQVE7QUFBQSxZQUN0QyxXQUFXLGdCQUNQLHlFQUF5RSxLQUFLLFFBQVEsS0FDdEYsbURBQW1ELEtBQUssUUFBUTtBQUFBLFVBQ3RFO0FBQUEsVUFDQSxXQUFXLGdCQUFnQixNQUFPO0FBQUEsUUFDcEM7QUFDQTtBQUFBLE1BQ0Y7QUFFQSxVQUFJLFdBQVcsV0FBVyxXQUFXO0FBQ25DLFlBQUksd0JBQU8sS0FBSyxFQUFFLHNRQUErQyxxTEFBcUwsR0FBRyxHQUFJO0FBQzdQO0FBQUEsTUFDRjtBQUVBLFVBQUksd0JBQU8sS0FBSyxFQUFFLHlEQUFZLEtBQUssUUFBUSxJQUFJLDhCQUE4QixLQUFLLFFBQVEsRUFBRSxHQUFHLEdBQUk7QUFBQSxJQUNyRyxTQUFTLE9BQU87QUFDZCxjQUFRLE1BQU0sc0NBQXNDLEtBQUs7QUFDekQsVUFBSSx3QkFBTyxLQUFLLGNBQWMsS0FBSyxFQUFFLG9EQUFZLG9DQUFvQyxHQUFHLEtBQUssR0FBRyxHQUFJO0FBQUEsSUFDdEc7QUFBQSxFQUNGO0FBQUEsRUFFUSx1QkFBdUIsVUFBa0I7QUFDL0MsVUFBTSxTQUFTLEtBQUssSUFBSSxVQUFVLGdCQUFnQixVQUFVO0FBQzVELGVBQVcsUUFBUSxRQUFRO0FBQ3pCLFlBQU0sT0FBTyxLQUFLO0FBQ2xCLFVBQUksRUFBRSxnQkFBZ0IsZ0NBQWU7QUFDbkM7QUFBQSxNQUNGO0FBRUEsVUFBSSxDQUFDLEtBQUssUUFBUSxLQUFLLEtBQUssU0FBUyxVQUFVO0FBQzdDO0FBQUEsTUFDRjtBQUVBLGFBQU8sS0FBSyxPQUFPLFNBQVM7QUFBQSxJQUM5QjtBQUVBLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFQSxNQUFjLGdDQUFnQyxNQUFhO0FBQ3pELFVBQU0sY0FBYyxLQUFLLHVCQUF1QixLQUFLLElBQUk7QUFDekQsUUFBSSxnQkFBZ0IsTUFBTTtBQUN4QixhQUFPO0FBQUEsSUFDVDtBQUVBLFdBQU8sTUFBTSxLQUFLLElBQUksTUFBTSxLQUFLLElBQUk7QUFBQSxFQUN2QztBQUFBLEVBRUEsTUFBYywyQkFBMkIsTUFBYSxpQkFBMEI7QUFDOUUsUUFBSSxLQUFLLGNBQWMsTUFBTTtBQUMzQixhQUFPLEtBQUssWUFBWSxtQkFBbUIsSUFBSTtBQUFBLElBQ2pEO0FBRUEsVUFBTSxVQUFVLG1CQUFvQixNQUFNLEtBQUssZ0NBQWdDLElBQUk7QUFDbkYsVUFBTSxVQUFVLE1BQU0sS0FBSyxpQkFBaUIsS0FBSyxXQUFXLE9BQU8sQ0FBQyxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQ2xGLFdBQU8sTUFBTSxRQUFRLE1BQU0sSUFBSSxNQUFNO0FBQUEsRUFDdkM7QUFBQSxFQUVBLE1BQWMsd0JBQXdCO0FBQ3BDLFdBQU8sRUFBRSxjQUFjLEdBQUcsb0JBQW9CLEVBQUU7QUFBQSxFQUNsRDtBQUFBLEVBRVEsc0JBQXNCLE1BQWM7QUFDMUMsVUFBTSxNQUFNLEtBQUssSUFBSTtBQUNyQixVQUFNLFdBQVcsS0FBSyx1QkFBdUIsSUFBSSxJQUFJO0FBQ3JELFVBQU0sT0FBZ0MsV0FDbEM7QUFBQSxNQUNFLGlCQUFpQixTQUFTO0FBQUEsTUFDMUIsZ0JBQWdCO0FBQUEsTUFDaEIsV0FBVyxTQUFTLFlBQVk7QUFBQSxJQUNsQyxJQUNBO0FBQUEsTUFDRSxpQkFBaUI7QUFBQSxNQUNqQixnQkFBZ0I7QUFBQSxNQUNoQixXQUFXO0FBQUEsSUFDYjtBQUNKLFNBQUssdUJBQXVCLElBQUksTUFBTSxJQUFJO0FBQzFDLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFUSx1QkFBdUIsTUFBYztBQUMzQyxTQUFLLHVCQUF1QixPQUFPLElBQUk7QUFBQSxFQUN6QztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLE1BQWMsb0JBQ1osTUFDQSxNQUNBLFFBQ0EsV0FDa0Y7QUFDbEYsUUFBSSxDQUFDLFFBQVE7QUFDWCxVQUFJLFdBQVc7QUFDYixjQUFNLEtBQUsscUJBQXFCLElBQUk7QUFDcEMsYUFBSyxVQUFVLE9BQU8sS0FBSyxJQUFJO0FBQy9CLGFBQUssdUJBQXVCLEtBQUssSUFBSTtBQUNyQyxlQUFPLEVBQUUsUUFBUSxXQUFXLGFBQWEsS0FBSztBQUFBLE1BQ2hEO0FBRUEsWUFBTSxnQkFBZ0IsS0FBSyxzQkFBc0IsS0FBSyxJQUFJO0FBQzFELFVBQUksY0FBYyxhQUFhLEtBQUssZ0NBQWdDO0FBQ2xFLGNBQU0sS0FBSyxxQkFBcUIsSUFBSTtBQUNwQyxhQUFLLFVBQVUsT0FBTyxLQUFLLElBQUk7QUFDL0IsYUFBSyx1QkFBdUIsS0FBSyxJQUFJO0FBQ3JDLGVBQU8sRUFBRSxRQUFRLFdBQVcsYUFBYSxNQUFNLGVBQWUsS0FBSztBQUFBLE1BQ3JFO0FBRUEsYUFBTyxFQUFFLFFBQVEsVUFBVTtBQUFBLElBQzdCO0FBRUEsU0FBSyx1QkFBdUIsS0FBSyxJQUFJO0FBQ3JDLFVBQU0sS0FBSywwQkFBMEIsS0FBSyxNQUFNLFFBQVEsSUFBSTtBQUM1RCxVQUFNLFlBQVksS0FBSyxtQkFBbUIsS0FBSyxJQUFJO0FBQ25ELFNBQUssVUFBVSxJQUFJLEtBQUssTUFBTTtBQUFBLE1BQzVCLGdCQUFnQixZQUFZLEtBQUssWUFBWSxtQkFBbUIsU0FBUyxJQUFJLE9BQU87QUFBQSxNQUNwRixpQkFBaUIsT0FBTztBQUFBLE1BQ3hCLFlBQVksS0FBSztBQUFBLElBQ25CLENBQUM7QUFDRCxXQUFPLEVBQUUsUUFBUSxXQUFXO0FBQUEsRUFDOUI7QUFBQSxFQUVRLGNBQWMsU0FBaUI7QUFDckMsVUFBTSxRQUFRLFFBQVE7QUFBQSxNQUNwQjtBQUFBLElBQ0Y7QUFDQSxRQUFJLENBQUMsT0FBTztBQUNWLGFBQU87QUFBQSxJQUNUO0FBRUEsV0FBTztBQUFBLE1BQ0wsWUFBWSxNQUFNLENBQUMsRUFBRSxLQUFLO0FBQUEsTUFDMUIsYUFBYSxNQUFNLENBQUMsRUFBRSxLQUFLO0FBQUEsSUFDN0I7QUFBQSxFQUNGO0FBQUEsRUFFUSxjQUFjLE1BQWE7QUFDakMsVUFBTSxhQUFhLEtBQUssWUFBWSx5QkFBeUIsS0FBSyxJQUFJO0FBQ3RFLFdBQU87QUFBQSxNQUNMLFFBQVEsZ0JBQWdCO0FBQUEsTUFDeEIsV0FBVyxVQUFVO0FBQUEsTUFDckIsZ0JBQWdCLEtBQUssUUFBUTtBQUFBLE1BQzdCO0FBQUEsTUFDQTtBQUFBLE1BQ0EsS0FBSztBQUFBLFFBQ0g7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0YsRUFBRSxLQUFLLElBQUk7QUFBQSxFQUNiO0FBQUEsRUFFQSxNQUFjLHNCQUFzQixZQUFxQjtBQUN2RCxRQUFJO0FBQ0YsVUFBSSxLQUFLLFNBQVMsb0JBQW9CLGNBQWM7QUFDbEQsWUFBSSxZQUFZO0FBQ2QsY0FBSSx3QkFBTyxLQUFLLEVBQUUsd0ZBQWtCLGdDQUFnQyxHQUFHLEdBQUk7QUFBQSxRQUM3RTtBQUNBLGVBQU87QUFBQSxNQUNUO0FBRUEsWUFBTSxRQUFRLEtBQUssWUFBWSx5QkFBeUIsRUFBRSxPQUFPLENBQUMsU0FBUyxLQUFLLGNBQWMsSUFBSTtBQUNsRyxZQUFNLE1BQU0sS0FBSyxJQUFJO0FBQ3JCLFlBQU0sWUFBWSxLQUFLLElBQUksR0FBRyxLQUFLLFNBQVMsa0JBQWtCLElBQUksS0FBSyxLQUFLLEtBQUs7QUFDakYsVUFBSSxVQUFVO0FBRWQsaUJBQVcsUUFBUSxPQUFPO0FBQ3hCLGNBQU0sU0FBUyxLQUFLLElBQUksVUFBVSxjQUFjO0FBQ2hELFlBQUksUUFBUSxTQUFTLEtBQUssTUFBTTtBQUM5QjtBQUFBLFFBQ0Y7QUFFQSxjQUFNLGFBQWEsS0FBSyxxQkFBcUIsSUFBSSxLQUFLLElBQUksS0FBSztBQUMvRCxZQUFJLGVBQWUsS0FBSyxNQUFNLGFBQWEsV0FBVztBQUNwRDtBQUFBLFFBQ0Y7QUFFQSxjQUFNLFVBQVUsTUFBTSxLQUFLLElBQUksTUFBTSxLQUFLLElBQUk7QUFDOUMsWUFBSSxLQUFLLGNBQWMsT0FBTyxHQUFHO0FBQy9CO0FBQUEsUUFDRjtBQUVBLGNBQU0sU0FBUyxNQUFNLEtBQUssSUFBSSxNQUFNLFdBQVcsSUFBSTtBQUNuRCxjQUFNLGFBQWEsS0FBSyxZQUFZLHlCQUF5QixLQUFLLElBQUk7QUFDdEUsY0FBTSxLQUFLLGFBQWEsWUFBWSxRQUFRLDhCQUE4QjtBQUMxRSxjQUFNLFdBQVcsTUFBTSxLQUFLLDRCQUE0QixZQUFZLE1BQU07QUFDMUUsWUFBSSxDQUFDLFVBQVU7QUFDYixnQkFBTSxJQUFJLE1BQU0sS0FBSyxFQUFFLHNIQUF1QixxRUFBcUUsQ0FBQztBQUFBLFFBQ3RIO0FBQ0EsY0FBTSxTQUFTLE1BQU0sS0FBSyxlQUFlLFVBQVU7QUFDbkQsWUFBSSxDQUFDLFFBQVE7QUFDWCxnQkFBTSxJQUFJLE1BQU0sS0FBSyxFQUFFLDRIQUF3QixxRUFBcUUsQ0FBQztBQUFBLFFBQ3ZIO0FBQ0EsY0FBTSxLQUFLLElBQUksTUFBTSxPQUFPLE1BQU0sS0FBSyxjQUFjLElBQUksQ0FBQztBQUMxRCxjQUFNLFlBQVksS0FBSyxtQkFBbUIsS0FBSyxJQUFJO0FBQ25ELGFBQUssVUFBVSxJQUFJLEtBQUssTUFBTTtBQUFBLFVBQzVCLGdCQUFnQixZQUFZLEtBQUssWUFBWSxtQkFBbUIsU0FBUyxJQUFJLEtBQUssWUFBWSxtQkFBbUIsSUFBSTtBQUFBLFVBQ3JILGlCQUFpQixRQUFRLGFBQWEsR0FBRyxLQUFLLEtBQUssS0FBSyxJQUFJLE9BQU8sVUFBVTtBQUFBLFVBQzdFO0FBQUEsUUFDRixDQUFDO0FBQ0QsbUJBQVc7QUFBQSxNQUNiO0FBRUEsVUFBSSxZQUFZO0FBQ2QsWUFBSTtBQUFBLFVBQ0YsS0FBSztBQUFBLFlBQ0gsc0JBQU8sT0FBTztBQUFBLFlBQ2QsV0FBVyxPQUFPO0FBQUEsVUFDcEI7QUFBQSxVQUNBO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFDQSxZQUFNLEtBQUssZ0JBQWdCO0FBQzNCLGFBQU87QUFBQSxJQUNULFNBQVMsT0FBTztBQUNkLGNBQVEsTUFBTSxzQ0FBc0MsS0FBSztBQUN6RCxVQUFJLFlBQVk7QUFDZCxZQUFJLHdCQUFPLEtBQUssY0FBYyxLQUFLLEVBQUUsb0RBQVksNkJBQTZCLEdBQUcsS0FBSyxHQUFHLEdBQUk7QUFBQSxNQUMvRjtBQUNBLGFBQU87QUFBQSxJQUNUO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyx3QkFBd0IsWUFBb0I7QUFDeEQsVUFBTSxRQUFRLFdBQVcsTUFBTSxHQUFHLEVBQUUsT0FBTyxDQUFDLFVBQVUsTUFBTSxTQUFTLENBQUM7QUFDdEUsUUFBSSxNQUFNLFVBQVUsR0FBRztBQUNyQjtBQUFBLElBQ0Y7QUFFQSxRQUFJLFVBQVU7QUFDZCxhQUFTLFFBQVEsR0FBRyxRQUFRLE1BQU0sU0FBUyxHQUFHLFNBQVMsR0FBRztBQUN4RCxnQkFBVSxVQUFVLEdBQUcsT0FBTyxJQUFJLE1BQU0sS0FBSyxDQUFDLEtBQUssTUFBTSxLQUFLO0FBQzlELFlBQU0sV0FBVyxNQUFNLEtBQUssV0FBVztBQUFBLFFBQ3JDLEtBQUssS0FBSyxlQUFlLE9BQU87QUFBQSxRQUNoQyxRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsVUFDUCxlQUFlLEtBQUssZ0JBQWdCO0FBQUEsUUFDdEM7QUFBQSxNQUNGLENBQUM7QUFFRCxVQUFJLENBQUMsQ0FBQyxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssR0FBRyxFQUFFLFNBQVMsU0FBUyxNQUFNLEdBQUc7QUFDNUUsY0FBTSxJQUFJLE1BQU0sb0JBQW9CLE9BQU8sZ0JBQWdCLFNBQVMsTUFBTSxFQUFFO0FBQUEsTUFDOUU7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyxlQUFlLFlBQThDO0FBQ3pFLFVBQU0sUUFBUSxvQkFBSSxJQUE2QjtBQUMvQyxVQUFNLGNBQWMsb0JBQUksSUFBWTtBQUNwQyxVQUFNLFVBQVUsQ0FBQyxnQkFBZ0IsVUFBVSxDQUFDO0FBQzVDLFVBQU0sVUFBVSxvQkFBSSxJQUFZO0FBRWhDLFdBQU8sUUFBUSxTQUFTLEdBQUc7QUFDekIsWUFBTSxVQUFVLGdCQUFnQixRQUFRLElBQUksS0FBSyxVQUFVO0FBQzNELFVBQUksUUFBUSxJQUFJLE9BQU8sR0FBRztBQUN4QjtBQUFBLE1BQ0Y7QUFFQSxjQUFRLElBQUksT0FBTztBQUNuQixZQUFNLFVBQVUsTUFBTSxLQUFLLG9CQUFvQixPQUFPO0FBQ3RELGlCQUFXLFNBQVMsU0FBUztBQUMzQixZQUFJLE1BQU0sY0FBYztBQUN0QixzQkFBWSxJQUFJLE1BQU0sVUFBVTtBQUNoQyxrQkFBUSxLQUFLLE1BQU0sVUFBVTtBQUM3QjtBQUFBLFFBQ0Y7QUFFQSxZQUFJLE1BQU0sTUFBTTtBQUNkLGdCQUFNLElBQUksTUFBTSxZQUFZLE1BQU0sSUFBSTtBQUFBLFFBQ3hDO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFFQSxXQUFPLEVBQUUsT0FBTyxZQUFZO0FBQUEsRUFDOUI7QUFBQSxFQUVBLE1BQWMsb0JBQW9CLGlCQUF5QjtBQUN6RCxVQUFNLGdCQUFnQixnQkFBZ0IsZUFBZTtBQUNyRCxVQUFNLFdBQVcsTUFBTSxLQUFLLFdBQVc7QUFBQSxNQUNyQyxLQUFLLEtBQUssZUFBZSxhQUFhO0FBQUEsTUFDdEMsUUFBUTtBQUFBLE1BQ1IsU0FBUztBQUFBLFFBQ1AsZUFBZSxLQUFLLGdCQUFnQjtBQUFBLFFBQ3BDLE9BQU87QUFBQSxNQUNUO0FBQUEsSUFDRixDQUFDO0FBRUQsUUFBSSxTQUFTLFdBQVcsS0FBSztBQUMzQixhQUFPLENBQUM7QUFBQSxJQUNWO0FBRUEsU0FBSyxzQkFBc0IsVUFBVSxnQkFBZ0IsYUFBYSxFQUFFO0FBRXBFLFVBQU0sVUFBVSxLQUFLLFdBQVcsU0FBUyxXQUFXO0FBQ3BELFdBQU8sS0FBSyw4QkFBOEIsU0FBUyxhQUFhO0FBQUEsRUFDbEU7QUFBQSxFQUVRLDhCQUE4QixTQUFpQixlQUF1QixtQkFBbUIsT0FBTztBQUN0RyxVQUFNLFNBQVMsSUFBSSxVQUFVO0FBQzdCLFVBQU1ELFlBQVcsT0FBTyxnQkFBZ0IsU0FBUyxpQkFBaUI7QUFDbEUsUUFBSUEsVUFBUyxxQkFBcUIsYUFBYSxFQUFFLFNBQVMsR0FBRztBQUMzRCxZQUFNLElBQUksTUFBTSxLQUFLLEVBQUUsa0VBQXFCLCtDQUErQyxDQUFDO0FBQUEsSUFDOUY7QUFFQSxVQUFNLFVBQVUsb0JBQUksSUFBbUY7QUFDdkcsZUFBVyxXQUFXLE1BQU0sS0FBS0EsVUFBUyxxQkFBcUIsR0FBRyxDQUFDLEdBQUc7QUFDcEUsVUFBSSxRQUFRLGNBQWMsWUFBWTtBQUNwQztBQUFBLE1BQ0Y7QUFFQSxZQUFNLE9BQU8sS0FBSyxvQkFBb0IsU0FBUyxNQUFNO0FBQ3JELFVBQUksQ0FBQyxNQUFNO0FBQ1Q7QUFBQSxNQUNGO0FBRUEsWUFBTSxhQUFhLEtBQUssaUJBQWlCLElBQUk7QUFDN0MsVUFBSSxDQUFDLFlBQVk7QUFDZjtBQUFBLE1BQ0Y7QUFFQSxZQUFNLGVBQWUsS0FBSyxvQkFBb0IsU0FBUyxZQUFZO0FBQ25FLFlBQU0saUJBQWlCLGVBQWUsZ0JBQWdCLFVBQVUsSUFBSSxXQUFXLFFBQVEsUUFBUSxFQUFFO0FBQ2pHLFVBQ0UsQ0FBQyxxQkFFQyxtQkFBbUIsaUJBQ25CLG1CQUFtQixjQUFjLFFBQVEsUUFBUSxFQUFFLElBRXJEO0FBQ0E7QUFBQSxNQUNGO0FBRUEsWUFBTSxXQUFXLEtBQUssb0JBQW9CLFNBQVMsa0JBQWtCO0FBQ3JFLFlBQU0sYUFBYSxPQUFPLFNBQVMsVUFBVSxFQUFFO0FBQy9DLFlBQU0sT0FBTyxPQUFPLFNBQVMsVUFBVSxJQUFJLGFBQWE7QUFDeEQsWUFBTSxlQUFlLEtBQUssb0JBQW9CLFNBQVMsaUJBQWlCO0FBQ3hFLFlBQU0sY0FBYyxLQUFLLE1BQU0sWUFBWTtBQUMzQyxZQUFNLGVBQWUsT0FBTyxTQUFTLFdBQVcsSUFBSSxjQUFjO0FBRWxFLGNBQVEsSUFBSSxnQkFBZ0I7QUFBQSxRQUMxQixZQUFZO0FBQUEsUUFDWjtBQUFBLFFBQ0EsTUFBTSxlQUNGLFNBQ0E7QUFBQSxVQUNFLFlBQVk7QUFBQSxVQUNaO0FBQUEsVUFDQTtBQUFBLFVBQ0EsV0FBVyxLQUFLLFlBQVkseUJBQXlCO0FBQUEsWUFDbkQ7QUFBQSxZQUNBO0FBQUEsVUFDRixDQUFDO0FBQUEsUUFDSDtBQUFBLE1BQ04sQ0FBQztBQUFBLElBQ0g7QUFFQSxXQUFPLENBQUMsR0FBRyxRQUFRLE9BQU8sQ0FBQztBQUFBLEVBQzdCO0FBQUEsRUFFUSxvQkFBb0IsUUFBaUIsV0FBbUI7QUFDOUQsZUFBVyxXQUFXLE1BQU0sS0FBSyxPQUFPLHFCQUFxQixHQUFHLENBQUMsR0FBRztBQUNsRSxVQUFJLFFBQVEsY0FBYyxXQUFXO0FBQ25DLGVBQU8sUUFBUSxhQUFhLEtBQUssS0FBSztBQUFBLE1BQ3hDO0FBQUEsSUFDRjtBQUVBLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFUSxvQkFBb0IsUUFBaUIsV0FBbUI7QUFDOUQsV0FBTyxNQUFNLEtBQUssT0FBTyxxQkFBcUIsR0FBRyxDQUFDLEVBQUUsS0FBSyxDQUFDLFlBQVksUUFBUSxjQUFjLFNBQVM7QUFBQSxFQUN2RztBQUFBLEVBRVEsaUJBQWlCLE1BQWM7QUFDckMsVUFBTSxVQUFVLEdBQUcsS0FBSyxTQUFTLFVBQVUsUUFBUSxRQUFRLEVBQUUsQ0FBQztBQUM5RCxVQUFNLFdBQVcsSUFBSSxJQUFJLE1BQU0sT0FBTztBQUN0QyxVQUFNLFdBQVcsSUFBSSxJQUFJLE9BQU8sRUFBRSxTQUFTLFFBQVEsUUFBUSxHQUFHO0FBQzlELFVBQU0sY0FBYyxLQUFLLGVBQWUsU0FBUyxRQUFRO0FBQ3pELFFBQUksQ0FBQyxZQUFZLFdBQVcsUUFBUSxHQUFHO0FBQ3JDLGFBQU87QUFBQSxJQUNUO0FBRUEsV0FBTyxZQUFZLE1BQU0sU0FBUyxNQUFNLEVBQUUsUUFBUSxRQUFRLEVBQUU7QUFBQSxFQUM5RDtBQUFBLEVBRVEsZUFBZSxVQUFrQjtBQUN2QyxXQUFPLFNBQ0osTUFBTSxHQUFHLEVBQ1QsSUFBSSxDQUFDLFlBQVk7QUFDaEIsVUFBSSxDQUFDLFNBQVM7QUFDWixlQUFPO0FBQUEsTUFDVDtBQUVBLFVBQUk7QUFDRixlQUFPLG1CQUFtQixPQUFPO0FBQUEsTUFDbkMsUUFBUTtBQUNOLGVBQU87QUFBQSxNQUNUO0FBQUEsSUFDRixDQUFDLEVBQ0EsS0FBSyxHQUFHO0FBQUEsRUFDYjtBQUFBLEVBRVEsK0JBQStCLGlCQUE4QixZQUFvQjtBQUN2RixVQUFNLFdBQVcsb0JBQUksSUFBWSxDQUFDLGdCQUFnQixVQUFVLENBQUMsQ0FBQztBQUM5RCxlQUFXLGNBQWMsaUJBQWlCO0FBQ3hDLFlBQU0sUUFBUSxXQUFXLE1BQU0sR0FBRyxFQUFFLE9BQU8sQ0FBQyxVQUFVLE1BQU0sU0FBUyxDQUFDO0FBQ3RFLFVBQUksVUFBVTtBQUNkLGVBQVMsUUFBUSxHQUFHLFFBQVEsTUFBTSxTQUFTLEdBQUcsU0FBUyxHQUFHO0FBQ3hELGtCQUFVLFVBQVUsR0FBRyxPQUFPLElBQUksTUFBTSxLQUFLLENBQUMsS0FBSyxNQUFNLEtBQUs7QUFDOUQsaUJBQVMsSUFBSSxnQkFBZ0IsT0FBTyxDQUFDO0FBQUEsTUFDdkM7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVBLE1BQWMscUJBQXFCLG1CQUFnQztBQUNqRSxVQUFNLFFBQVEsRUFBRSxjQUFjLEdBQUcsZUFBZSxHQUFHLGNBQWMsR0FBRyxlQUFlLEVBQUU7QUFFckYsVUFBTSxtQkFBbUIsb0JBQUksSUFBWTtBQUN6QyxlQUFXLGFBQWEsbUJBQW1CO0FBQ3pDLFlBQU0sWUFBWSxLQUFLLFlBQVksc0JBQXNCLFNBQVM7QUFDbEUsVUFBSSxjQUFjLFFBQVEsVUFBVSxTQUFTLEtBQUssQ0FBQyxLQUFLLFlBQVksNEJBQTRCLFNBQVMsR0FBRztBQUMxRyx5QkFBaUIsUUFBSSxnQ0FBYyxTQUFTLENBQUM7QUFBQSxNQUMvQztBQUFBLElBQ0Y7QUFFQSxVQUFNLGdCQUFnQixLQUFLLFlBQVksOEJBQThCO0FBQ3JFLFVBQU0sZ0JBQWdCLEtBQUs7QUFDM0IsVUFBTSxnQkFBZ0Isb0JBQUksSUFBWTtBQUV0QyxVQUFNLFlBQVksQ0FBQyxHQUFHLGFBQWEsRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLGlCQUFpQixJQUFJLENBQUMsQ0FBQztBQUMzRSxVQUFNLGFBQWEsQ0FBQyxHQUFHLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsY0FBYyxJQUFJLENBQUMsQ0FBQztBQUc1RSxlQUFXLFdBQVcsQ0FBQyxHQUFHLFNBQVMsRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sR0FBRztBQUN4RSxZQUFNLFlBQVksZ0JBQWdCLEtBQUssU0FBUyxxQkFBcUIsSUFBSTtBQUN6RSxVQUFJO0FBQ0YsY0FBTSxLQUFLLHdCQUF3QixTQUFTO0FBQzVDLGNBQU0saUJBQWlCO0FBQUEsTUFDekIsUUFBUTtBQUFBLE1BRVI7QUFDQSxvQkFBYyxJQUFJLE9BQU87QUFBQSxJQUMzQjtBQUdBLGVBQVcsV0FBVyxlQUFlO0FBQ25DLFVBQUksaUJBQWlCLElBQUksT0FBTyxHQUFHO0FBQ2pDLHNCQUFjLElBQUksT0FBTztBQUFBLE1BQzNCO0FBQUEsSUFDRjtBQUdBLGVBQVcsV0FBVyxDQUFDLEdBQUcsVUFBVSxFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxHQUFHO0FBQ3pFLFVBQUksQ0FBRSxNQUFNLEtBQUssSUFBSSxNQUFNLFFBQVEsT0FBTyxPQUFPLEdBQUk7QUFDbkQsWUFBSTtBQUNGLGdCQUFNLEtBQUssSUFBSSxNQUFNLFFBQVEsTUFBTSxPQUFPO0FBQUEsUUFDNUMsU0FBUyxHQUFHO0FBQ1YsZ0JBQU0sTUFBTSxhQUFhLFFBQVEsRUFBRSxVQUFVLE9BQU8sQ0FBQztBQUNyRCxjQUFJLENBQUMsSUFBSSxTQUFTLGdCQUFnQixHQUFHO0FBQ25DLGtCQUFNO0FBQUEsVUFDUjtBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQ0EsWUFBTSxnQkFBZ0I7QUFDdEIsb0JBQWMsSUFBSSxPQUFPO0FBQUEsSUFDM0I7QUFFQSxTQUFLLG9CQUFvQjtBQUN6QixXQUFPO0FBQUEsRUFDVDtBQUFBLEVBRUEsTUFBYyw2QkFBNkIsbUJBQWdDLHFCQUFrQztBQUMzRyxRQUFJLFVBQVU7QUFDZCxVQUFNLGFBQWEsQ0FBQyxHQUFHLGlCQUFpQixFQUNyQyxPQUFPLENBQUMsZUFBZSxDQUFDLG9CQUFvQixJQUFJLFVBQVUsQ0FBQyxFQUMzRCxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxjQUFjLENBQUMsQ0FBQztBQUUzRCxlQUFXLGNBQWMsWUFBWTtBQUNuQyxZQUFNLFdBQVcsTUFBTSxLQUFLLFdBQVc7QUFBQSxRQUNyQyxLQUFLLEtBQUssZUFBZSxVQUFVO0FBQUEsUUFDbkMsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLFVBQ1AsZUFBZSxLQUFLLGdCQUFnQjtBQUFBLFFBQ3RDO0FBQUEsTUFDRixDQUFDO0FBRUQsVUFBSSxDQUFDLEtBQUssS0FBSyxLQUFLLEdBQUcsRUFBRSxTQUFTLFNBQVMsTUFBTSxHQUFHO0FBQ2xELFlBQUksU0FBUyxXQUFXLEtBQUs7QUFDM0IscUJBQVc7QUFBQSxRQUNiO0FBQ0E7QUFBQSxNQUNGO0FBRUEsVUFBSSxDQUFDLEtBQUssR0FBRyxFQUFFLFNBQVMsU0FBUyxNQUFNLEdBQUc7QUFDeEM7QUFBQSxNQUNGO0FBRUEsWUFBTSxJQUFJLE1BQU0sK0JBQStCLFVBQVUsZ0JBQWdCLFNBQVMsTUFBTSxFQUFFO0FBQUEsSUFDNUY7QUFFQSxXQUFPO0FBQUEsRUFDVDtBQUFBLEVBRUEsTUFBYyxzQkFBc0I7QUFFbEMsVUFBTSxLQUFLLFlBQVksb0JBQW9CO0FBQUEsRUFDN0M7QUFBQSxFQUVRLG1CQUFtQixXQUFnQztBQUN6RCxVQUFNLFVBQVUsVUFBVSxFQUN2QixNQUFNLENBQUMsVUFBVTtBQUNoQixjQUFRLE1BQU0sZ0RBQWdELEtBQUs7QUFBQSxJQUNyRSxDQUFDLEVBQ0EsUUFBUSxNQUFNO0FBQ2IsV0FBSyw2QkFBNkIsT0FBTyxPQUFPO0FBQUEsSUFDbEQsQ0FBQztBQUNILFNBQUssNkJBQTZCLElBQUksT0FBTztBQUFBLEVBQy9DO0FBQUEsRUFFQSxNQUFjLCtCQUErQjtBQUMzQyxXQUFPLEtBQUssNkJBQTZCLE9BQU8sR0FBRztBQUNqRCxZQUFNLFFBQVEsV0FBVyxDQUFDLEdBQUcsS0FBSyw0QkFBNEIsQ0FBQztBQUFBLElBQ2pFO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyw2QkFBNkIsWUFBcUI7QUFFOUQsVUFBTSxLQUFLLFlBQVksb0JBQW9CO0FBRTNDLFFBQUksS0FBSyxZQUFZLGVBQWUsR0FBRztBQUNyQyxXQUFLLGtCQUFrQixLQUFLLElBQUk7QUFDaEMsV0FBSyxzQkFBc0IsS0FBSztBQUFBLFFBQzlCO0FBQUEsUUFDQTtBQUFBLE1BQ0Y7QUFDQSxZQUFNLEtBQUssZ0JBQWdCO0FBQzNCLFVBQUksWUFBWTtBQUNkLFlBQUksd0JBQU8sS0FBSyxxQkFBcUIsR0FBSTtBQUFBLE1BQzNDO0FBQ0EsYUFBTztBQUFBLElBQ1Q7QUFFQSxXQUFPO0FBQUEsRUFDVDtBQUFBLEVBRUEsTUFBYyxtQkFBbUIsVUFBaUI7QUFDaEQsUUFBSTtBQUNGLFlBQU0sVUFBVSxNQUFNLEtBQUssSUFBSSxNQUFNLEtBQUssUUFBUTtBQUNsRCxZQUFNLGVBQWUsTUFBTSxLQUFLLHdCQUF3QixTQUFTLFFBQVE7QUFFekUsVUFBSSxhQUFhLFdBQVcsR0FBRztBQUM3QixZQUFJLHdCQUFPLEtBQUssRUFBRSx3RkFBa0IsNENBQTRDLENBQUM7QUFDakY7QUFBQSxNQUNGO0FBRUEsVUFBSSxVQUFVO0FBQ2QsaUJBQVcsZUFBZSxjQUFjO0FBQ3RDLGtCQUFVLFFBQVEsTUFBTSxZQUFZLFFBQVEsRUFBRSxLQUFLLFlBQVksU0FBUztBQUFBLE1BQzFFO0FBRUEsVUFBSSxZQUFZLFNBQVM7QUFDdkIsWUFBSSx3QkFBTyxLQUFLLEVBQUUsNEVBQWdCLDJCQUEyQixDQUFDO0FBQzlEO0FBQUEsTUFDRjtBQUVBLFlBQU0sS0FBSyxJQUFJLE1BQU0sT0FBTyxVQUFVLE9BQU87QUFDN0MsV0FBSyx5QkFBeUIsU0FBUyxNQUFNLFdBQVc7QUFFeEQsVUFBSSxLQUFLLFNBQVMsd0JBQXdCO0FBQ3hDLG1CQUFXLGVBQWUsY0FBYztBQUN0QyxjQUFJLFlBQVksWUFBWTtBQUMxQixrQkFBTSxLQUFLLGNBQWMsWUFBWSxVQUFVO0FBQUEsVUFDakQ7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUVBLFVBQUksd0JBQU8sS0FBSyxFQUFFLHNCQUFPLGFBQWEsTUFBTSwwQ0FBaUIsWUFBWSxhQUFhLE1BQU0sc0JBQXNCLENBQUM7QUFBQSxJQUNySCxTQUFTLE9BQU87QUFDZCxjQUFRLE1BQU0sK0JBQStCLEtBQUs7QUFDbEQsVUFBSSx3QkFBTyxLQUFLLGNBQWMsS0FBSyxFQUFFLDRCQUFRLGVBQWUsR0FBRyxLQUFLLEdBQUcsR0FBSTtBQUFBLElBQzdFO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyxZQUFZLE1BQWtCO0FBRTFDLFVBQU0sS0FBSyxZQUFZLFlBQVksSUFBSTtBQUFBLEVBQ3pDO0FBQUEsRUFFUSxXQUFXLE9BQWU7QUFDaEMsV0FBTyxNQUNKLFFBQVEsTUFBTSxPQUFPLEVBQ3JCLFFBQVEsTUFBTSxRQUFRLEVBQ3RCLFFBQVEsTUFBTSxNQUFNLEVBQ3BCLFFBQVEsTUFBTSxNQUFNO0FBQUEsRUFDekI7QUFBQSxFQUVRLGFBQWEsT0FBZTtBQUNsQyxXQUFPLE1BQ0osUUFBUSxXQUFXLEdBQUksRUFDdkIsUUFBUSxTQUFTLEdBQUcsRUFDcEIsUUFBUSxTQUFTLEdBQUcsRUFDcEIsUUFBUSxVQUFVLEdBQUc7QUFBQSxFQUMxQjtBQUFBLEVBRUEsTUFBYyx3QkFBd0IsWUFBb0I7QUFDeEQsVUFBTSxXQUFXLE1BQU0sS0FBSyxXQUFXO0FBQUEsTUFDckMsS0FBSyxLQUFLLGVBQWUsVUFBVTtBQUFBLE1BQ25DLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxRQUNQLGVBQWUsS0FBSyxnQkFBZ0I7QUFBQSxNQUN0QztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssc0JBQXNCLFVBQVUsb0JBQW9CO0FBRXpELFVBQU0sT0FBTyxJQUFJLEtBQUssQ0FBQyxTQUFTLFdBQVcsR0FBRztBQUFBLE1BQzVDLE1BQU0sU0FBUyxRQUFRLGNBQWMsS0FBSztBQUFBLElBQzVDLENBQUM7QUFDRCxVQUFNLFVBQVUsSUFBSSxnQkFBZ0IsSUFBSTtBQUN4QyxTQUFLLHNCQUFzQjtBQUMzQixTQUFLLFNBQVMsSUFBSSxPQUFPO0FBQ3pCLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFUSx3QkFBd0I7QUFDOUIsV0FBTyxLQUFLLFNBQVMsUUFBUSxLQUFLLGFBQWE7QUFDN0MsWUFBTSxTQUFTLEtBQUssU0FBUyxPQUFPLEVBQUUsS0FBSyxFQUFFO0FBQzdDLFdBQUssU0FBUyxPQUFPLE1BQU07QUFDM0IsVUFBSSxnQkFBZ0IsTUFBTTtBQUFBLElBQzVCO0FBQUEsRUFDRjtBQUFBLEVBRVEsb0JBQW9CLFFBQXFCO0FBQy9DLFVBQU0sUUFBUSxJQUFJLFdBQVcsTUFBTTtBQUNuQyxVQUFNLFlBQVk7QUFDbEIsUUFBSSxTQUFTO0FBQ2IsYUFBUyxRQUFRLEdBQUcsUUFBUSxNQUFNLFFBQVEsU0FBUyxXQUFXO0FBQzVELFlBQU0sUUFBUSxNQUFNLFNBQVMsT0FBTyxRQUFRLFNBQVM7QUFDckQsZ0JBQVUsT0FBTyxhQUFhLEdBQUcsS0FBSztBQUFBLElBQ3hDO0FBQ0EsV0FBTyxLQUFLLE1BQU07QUFBQSxFQUNwQjtBQUFBLEVBRVEsb0JBQW9CLFFBQWdCO0FBQzFDLFVBQU0sU0FBUyxLQUFLLE1BQU07QUFDMUIsVUFBTSxRQUFRLElBQUksV0FBVyxPQUFPLE1BQU07QUFDMUMsYUFBUyxRQUFRLEdBQUcsUUFBUSxPQUFPLFFBQVEsU0FBUyxHQUFHO0FBQ3JELFlBQU0sS0FBSyxJQUFJLE9BQU8sV0FBVyxLQUFLO0FBQUEsSUFDeEM7QUFDQSxXQUFPLE1BQU0sT0FBTyxNQUFNLE1BQU0sWUFBWSxNQUFNLGFBQWEsTUFBTSxVQUFVO0FBQUEsRUFDakY7QUFBQSxFQUVRLGtCQUFrQixNQUFtQixPQUFvQjtBQUMvRCxVQUFNLElBQUksSUFBSSxXQUFXLElBQUk7QUFDN0IsVUFBTSxJQUFJLElBQUksV0FBVyxLQUFLO0FBQzlCLFFBQUksRUFBRSxXQUFXLEVBQUUsUUFBUTtBQUN6QixhQUFPO0FBQUEsSUFDVDtBQUVBLGFBQVMsUUFBUSxHQUFHLFFBQVEsRUFBRSxRQUFRLFNBQVMsR0FBRztBQUNoRCxVQUFJLEVBQUUsS0FBSyxNQUFNLEVBQUUsS0FBSyxHQUFHO0FBQ3pCLGVBQU87QUFBQSxNQUNUO0FBQUEsSUFDRjtBQUVBLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFUSx1QkFBdUIsVUFBa0I7QUFDL0MsVUFBTSxZQUFZLFNBQVMsTUFBTSxHQUFHLEVBQUUsQ0FBQyxHQUFHLFFBQVEsUUFBUSxLQUFLLEtBQUs7QUFDcEUsV0FBTyxnQkFBZ0IsS0FBSyxJQUFJLENBQUMsSUFBSSxTQUFTO0FBQUEsRUFDaEQ7QUFBQSxFQUVRLGFBQWEsT0FBZTtBQUNsQyxXQUFPLE1BQU0sUUFBUSx1QkFBdUIsTUFBTTtBQUFBLEVBQ3BEO0FBQUEsRUFFUSxnQkFBZ0IsVUFBa0I7QUFDeEMsV0FBTyxHQUFHLGdCQUFnQixLQUFLLFNBQVMsWUFBWSxDQUFDLEdBQUcsUUFBUTtBQUFBLEVBQ2xFO0FBQUEsRUFFQSxNQUFjLDhCQUE4QixVQUFrQixRQUFxQjtBQUNqRixVQUFNLFlBQVksS0FBSyx5QkFBeUIsUUFBUTtBQUN4RCxRQUFJLEtBQUssU0FBUyxtQkFBbUIsUUFBUTtBQUMzQyxZQUFNLFFBQVEsTUFBTSxLQUFLLGlCQUFpQixNQUFNLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDOUQsYUFBTyxHQUFHLElBQUksSUFBSSxTQUFTO0FBQUEsSUFDN0I7QUFFQSxXQUFPLEdBQUcsS0FBSyxJQUFJLENBQUMsSUFBSSxRQUFRO0FBQUEsRUFDbEM7QUFBQSxFQUVRLGVBQWUsWUFBb0I7QUFDekMsVUFBTSxPQUFPLEtBQUssU0FBUyxVQUFVLFFBQVEsUUFBUSxFQUFFO0FBQ3ZELFdBQU8sR0FBRyxJQUFJLElBQUksV0FBVyxNQUFNLEdBQUcsRUFBRSxJQUFJLGtCQUFrQixFQUFFLEtBQUssR0FBRyxDQUFDO0FBQUEsRUFDM0U7QUFBQSxFQUVRLGtCQUFrQjtBQUN4QixVQUFNLFFBQVEsS0FBSyxvQkFBb0IsS0FBSyxXQUFXLEdBQUcsS0FBSyxTQUFTLFFBQVEsSUFBSSxLQUFLLFNBQVMsUUFBUSxFQUFFLENBQUM7QUFDN0csV0FBTyxTQUFTLEtBQUs7QUFBQSxFQUN2QjtBQUFBLEVBRVEsbUJBQW1CO0FBQ3pCLFFBQUksQ0FBQyxLQUFLLFNBQVMsYUFBYSxDQUFDLEtBQUssU0FBUyxZQUFZLENBQUMsS0FBSyxTQUFTLFVBQVU7QUFDbEYsWUFBTSxJQUFJLE1BQU0sS0FBSyxFQUFFLCtDQUFpQixpQ0FBaUMsQ0FBQztBQUFBLElBQzVFO0FBQUEsRUFDRjtBQUFBLEVBRVEsc0JBQXNCLFVBQThCLFNBQWlCO0FBQzNFLFFBQUksU0FBUyxTQUFTLE9BQU8sU0FBUyxVQUFVLEtBQUs7QUFDbkQsWUFBTSxJQUFJLE1BQU0sR0FBRyxPQUFPLHVCQUF1QixTQUFTLE1BQU0sRUFBRTtBQUFBLElBQ3BFO0FBQUEsRUFDRjtBQUFBLEVBRVEsWUFBWSxXQUFtQjtBQUNyQyxXQUFPLFNBQVMsVUFBVSxZQUFZLENBQUMsS0FBSztBQUFBLEVBQzlDO0FBQUEsRUFFUSx3QkFBd0IsVUFBa0I7QUFDaEQsV0FBTyxLQUFLLFlBQVksS0FBSyx5QkFBeUIsUUFBUSxDQUFDO0FBQUEsRUFDakU7QUFBQSxFQUVRLHlCQUF5QixVQUFrQjtBQUNqRCxVQUFNLFNBQVMsU0FBUyxNQUFNLEdBQUc7QUFDakMsV0FBTyxPQUFPLFNBQVMsSUFBSSxPQUFPLE9BQU8sU0FBUyxDQUFDLEVBQUUsWUFBWSxJQUFJO0FBQUEsRUFDdkU7QUFBQSxFQUVBLE1BQWMscUJBQXFCLFFBQXFCLFVBQWtCLFVBQWtCO0FBQzFGLFFBQUksQ0FBQyxLQUFLLFNBQVMsZ0JBQWdCO0FBQ2pDLGFBQU8sRUFBRSxRQUFRLFVBQVUsU0FBUztBQUFBLElBQ3RDO0FBRUEsVUFBTSxXQUFXLE1BQU0sS0FBSyxzQkFBc0IsUUFBUSxVQUFVLFFBQVE7QUFDNUUsV0FBTyxZQUFZLEVBQUUsUUFBUSxVQUFVLFNBQVM7QUFBQSxFQUNsRDtBQUFBLEVBRUEsTUFBYyxzQkFBc0IsUUFBcUIsVUFBa0IsVUFBa0I7QUFDM0YsUUFBSSxDQUFDLGdDQUFnQyxLQUFLLFFBQVEsR0FBRztBQUNuRCxhQUFPO0FBQUEsSUFDVDtBQUVBLFVBQU0saUJBQWlCLEtBQUssU0FBUyxzQkFBc0I7QUFDM0QsVUFBTSxhQUFhLElBQUksS0FBSyxDQUFDLE1BQU0sR0FBRyxFQUFFLE1BQU0sU0FBUyxDQUFDO0FBQ3hELFVBQU0sUUFBUSxNQUFNLEtBQUssaUJBQWlCLFVBQVU7QUFDcEQsVUFBTSxjQUFjLEtBQUssSUFBSSxNQUFNLGNBQWMsTUFBTSxhQUFhO0FBQ3BFLFVBQU0sY0FBYyxjQUFjLEtBQUssU0FBUztBQUNoRCxVQUFNLGdCQUFnQixXQUFXLE9BQU8sa0JBQWtCO0FBQzFELFFBQUksQ0FBQyxlQUFlO0FBQ2xCLGFBQU87QUFBQSxJQUNUO0FBRUEsVUFBTSxRQUFRLGNBQWMsS0FBSyxTQUFTLG9CQUFvQixjQUFjO0FBQzVFLFVBQU0sY0FBYyxLQUFLLElBQUksR0FBRyxLQUFLLE1BQU0sTUFBTSxlQUFlLEtBQUssQ0FBQztBQUN0RSxVQUFNLGVBQWUsS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLE1BQU0sZ0JBQWdCLEtBQUssQ0FBQztBQUN4RSxVQUFNLFNBQVMsU0FBUyxjQUFjLFFBQVE7QUFDOUMsV0FBTyxRQUFRO0FBQ2YsV0FBTyxTQUFTO0FBQ2hCLFVBQU0sVUFBVSxPQUFPLFdBQVcsSUFBSTtBQUN0QyxRQUFJLENBQUMsU0FBUztBQUNaLGFBQU87QUFBQSxJQUNUO0FBRUEsWUFBUSxVQUFVLE9BQU8sR0FBRyxHQUFHLGFBQWEsWUFBWTtBQUV4RCxVQUFNLGFBQWEsU0FBUyxZQUFZLE1BQU0sY0FBYyxlQUFlO0FBQzNFLFVBQU0sVUFBVSxLQUFLLElBQUksS0FBSyxLQUFLLElBQUksTUFBTSxLQUFLLFNBQVMsY0FBYyxHQUFHLENBQUM7QUFDN0UsVUFBTSxpQkFBaUIsTUFBTSxJQUFJLFFBQXFCLENBQUMsWUFBWTtBQUNqRSxhQUFPLE9BQU8sU0FBUyxZQUFZLE9BQU87QUFBQSxJQUM1QyxDQUFDO0FBRUQsUUFBSSxDQUFDLGdCQUFnQjtBQUNuQixhQUFPO0FBQUEsSUFDVDtBQUVBLFFBQUksQ0FBQyxlQUFlLGVBQWUsUUFBUSxXQUFXLE1BQU07QUFDMUQsYUFBTztBQUFBLElBQ1Q7QUFFQSxVQUFNLGFBQWEsTUFBTSxlQUFlLFlBQVk7QUFDcEQsVUFBTSxnQkFBZ0IsS0FBSyxzQkFBc0IsVUFBVSxLQUFLLEtBQUsseUJBQXlCLFFBQVE7QUFDdEcsVUFBTSxlQUFlLFNBQVMsUUFBUSxZQUFZLEVBQUUsSUFBSSxJQUFJLGFBQWE7QUFDekUsV0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLE1BQ1IsVUFBVTtBQUFBLE1BQ1YsVUFBVTtBQUFBLElBQ1o7QUFBQSxFQUNGO0FBQUEsRUFFUSxpQkFBaUIsTUFBWTtBQUNuQyxXQUFPLElBQUksUUFBMEIsQ0FBQyxTQUFTLFdBQVc7QUFDeEQsWUFBTSxNQUFNLElBQUksZ0JBQWdCLElBQUk7QUFDcEMsWUFBTSxRQUFRLElBQUksTUFBTTtBQUN4QixZQUFNLFNBQVMsTUFBTTtBQUNuQixZQUFJLGdCQUFnQixHQUFHO0FBQ3ZCLGdCQUFRLEtBQUs7QUFBQSxNQUNmO0FBQ0EsWUFBTSxVQUFVLENBQUMsVUFBVTtBQUN6QixZQUFJLGdCQUFnQixHQUFHO0FBQ3ZCLGVBQU8sS0FBSztBQUFBLE1BQ2Q7QUFDQSxZQUFNLE1BQU07QUFBQSxJQUNkLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxzQkFBc0IsVUFBa0I7QUFDOUMsV0FBTyxTQUFTLFFBQVEsS0FBSztBQUFBLEVBQy9CO0FBQUEsRUFFQSxNQUFjLGNBQWMsTUFBcUI7QUFDL0MsUUFBSTtBQUNGLFlBQU0sS0FBSyxJQUFJLE1BQU0sTUFBTSxNQUFNLElBQUk7QUFBQSxJQUN2QyxTQUFTLE9BQU87QUFDZCxjQUFRLEtBQUssNENBQTRDLEtBQUs7QUFBQSxJQUNoRTtBQUFBLEVBQ0Y7QUFBQSxFQUVRLGlCQUFpQixVQUFrQjtBQUN6QyxXQUFPLEtBQUssRUFBRSxtREFBVyxRQUFRLFVBQUssMEJBQTBCLFFBQVEsR0FBRztBQUFBLEVBQzdFO0FBQUEsRUFFUSxrQkFBa0IsVUFBa0I7QUFDMUMsV0FBTyxLQUFLLEVBQUUsbURBQVcsUUFBUSxVQUFLLDBCQUEwQixRQUFRLEdBQUc7QUFBQSxFQUM3RTtBQUFBLEVBRUEsTUFBTSwrQkFBK0I7QUFDbkMsUUFBSTtBQUNGLFlBQU0sY0FBYyxvQkFBSSxJQUFvQjtBQUM1QyxZQUFNLHVCQUF1QixvQkFBSSxJQUFtQjtBQUNwRCxVQUFJLGVBQWU7QUFDbkIsaUJBQVcsUUFBUSxLQUFLLElBQUksTUFBTSxpQkFBaUIsR0FBRztBQUNwRCxjQUFNLFVBQVUsTUFBTSxLQUFLLElBQUksTUFBTSxLQUFLLElBQUk7QUFDOUMsY0FBTSxlQUFlLE1BQU0sS0FBSyx3QkFBd0IsU0FBUyxNQUFNLFdBQVc7QUFDbEYsbUJBQVcsZUFBZSxjQUFjO0FBQ3RDLGNBQUksWUFBWSxZQUFZO0FBQzFCLGlDQUFxQixJQUFJLFlBQVksV0FBVyxNQUFNLFlBQVksVUFBVTtBQUFBLFVBQzlFO0FBQUEsUUFDRjtBQUVBLFlBQUksVUFBVTtBQUNkLG1CQUFXLGVBQWUsY0FBYztBQUN0QyxvQkFBVSxRQUFRLE1BQU0sWUFBWSxRQUFRLEVBQUUsS0FBSyxZQUFZLFNBQVM7QUFBQSxRQUMxRTtBQUVBLGtCQUFVLFFBQ1A7QUFBQSxVQUNDO0FBQUEsVUFDQSxDQUFDLFFBQVEsWUFBb0IsUUFDM0IsS0FBSyxhQUFhO0FBQUEsWUFDaEIsS0FBSyxhQUFhLFVBQVU7QUFBQSxZQUM1QixLQUFLLGFBQWEsR0FBRyxLQUFLLEtBQUssYUFBYSxVQUFVO0FBQUEsVUFDeEQ7QUFBQSxRQUNKLEVBQ0M7QUFBQSxVQUNDO0FBQUEsVUFDQSxDQUFDLFFBQVEsZUFDUCxLQUFLLGFBQWEsMEJBQTBCLEtBQUssYUFBYSxVQUFVLEdBQUcsS0FBSyxhQUFhLFVBQVUsQ0FBQztBQUFBLFFBQzVHO0FBRUYsWUFBSSxZQUFZLFNBQVM7QUFDdkI7QUFBQSxRQUNGO0FBRUEsY0FBTSxLQUFLLElBQUksTUFBTSxPQUFPLE1BQU0sT0FBTztBQUN6Qyx3QkFBZ0I7QUFBQSxNQUNsQjtBQUVBLFVBQUksaUJBQWlCLEdBQUc7QUFDdEIsWUFBSTtBQUFBLFVBQ0YsS0FBSztBQUFBLFlBQ0g7QUFBQSxZQUNBO0FBQUEsVUFDRjtBQUFBLFFBQ0Y7QUFDQTtBQUFBLE1BQ0Y7QUFFQSxVQUFJLEtBQUssU0FBUyx3QkFBd0I7QUFDeEMsY0FBTSxLQUFLLDBCQUEwQixvQkFBb0I7QUFBQSxNQUMzRDtBQUVBLFVBQUk7QUFBQSxRQUNKLEtBQUs7QUFBQSxVQUNILHNCQUFPLFlBQVk7QUFBQSxVQUNuQixZQUFZLFlBQVk7QUFBQSxRQUMxQjtBQUFBLFFBQ0U7QUFBQSxNQUNGO0FBQUEsSUFDRixTQUFTLE9BQU87QUFDZCxjQUFRLE1BQU0sa0RBQWtELEtBQUs7QUFDckUsVUFBSSx3QkFBTyxLQUFLLGNBQWMsS0FBSyxFQUFFLGdFQUFjLHVDQUF1QyxHQUFHLEtBQUssR0FBRyxHQUFJO0FBQUEsSUFDM0c7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLDBCQUEwQixzQkFBMEM7QUFDaEYsUUFBSSxxQkFBcUIsU0FBUyxHQUFHO0FBQ25DO0FBQUEsSUFDRjtBQUVBLFVBQU0sZ0JBQWdCLG9CQUFJLElBQVk7QUFDdEMsZUFBVyxRQUFRLEtBQUssSUFBSSxNQUFNLGlCQUFpQixHQUFHO0FBQ3BELFlBQU0sVUFBVSxNQUFNLEtBQUssSUFBSSxNQUFNLEtBQUssSUFBSTtBQUM5QyxZQUFNLGNBQWMsQ0FBQyxHQUFHLFFBQVEsU0FBUyxvQkFBb0IsQ0FBQztBQUM5RCxZQUFNLGtCQUFrQixDQUFDLEdBQUcsUUFBUSxTQUFTLHdCQUF3QixDQUFDO0FBRXRFLGlCQUFXLFNBQVMsYUFBYTtBQUMvQixjQUFNLFVBQVUsTUFBTSxDQUFDLEVBQUUsTUFBTSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEtBQUs7QUFDNUMsY0FBTSxTQUFTLEtBQUssa0JBQWtCLFNBQVMsS0FBSyxJQUFJO0FBQ3hELFlBQUksVUFBVSxLQUFLLFlBQVksTUFBTSxHQUFHO0FBQ3RDLHdCQUFjLElBQUksT0FBTyxJQUFJO0FBQUEsUUFDL0I7QUFBQSxNQUNGO0FBRUEsaUJBQVcsU0FBUyxpQkFBaUI7QUFDbkMsY0FBTSxVQUFVLG1CQUFtQixNQUFNLENBQUMsRUFBRSxLQUFLLEVBQUUsUUFBUSxVQUFVLEVBQUUsQ0FBQztBQUN4RSxZQUFJLG1DQUFtQyxLQUFLLE9BQU8sR0FBRztBQUNwRDtBQUFBLFFBQ0Y7QUFFQSxjQUFNLFNBQVMsS0FBSyxrQkFBa0IsU0FBUyxLQUFLLElBQUk7QUFDeEQsWUFBSSxVQUFVLEtBQUssWUFBWSxNQUFNLEdBQUc7QUFDdEMsd0JBQWMsSUFBSSxPQUFPLElBQUk7QUFBQSxRQUMvQjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBRUEsZUFBVyxDQUFDLE1BQU0sSUFBSSxLQUFLLHFCQUFxQixRQUFRLEdBQUc7QUFDekQsVUFBSSxjQUFjLElBQUksSUFBSSxHQUFHO0FBQzNCO0FBQUEsTUFDRjtBQUVBLFlBQU0sS0FBSyxjQUFjLElBQUk7QUFBQSxJQUMvQjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sa0JBQWtCLFlBQVksT0FBTztBQUN6QyxRQUFJO0FBQ0YsV0FBSyxpQkFBaUI7QUFFdEIsWUFBTSxZQUFZLHdCQUF3QixLQUFLLElBQUksQ0FBQztBQUNwRCxZQUFNLGFBQWEsS0FBSyxnQkFBZ0IsU0FBUztBQUNqRCxZQUFNLFlBQVksS0FBSyxlQUFlLFVBQVU7QUFDaEQsWUFBTSxtQkFBbUIsS0FBSyxXQUFXLHdCQUF1QixvQkFBSSxLQUFLLEdBQUUsWUFBWSxDQUFDLEVBQUU7QUFFMUYsWUFBTSxjQUFjLE1BQU0sS0FBSyxXQUFXO0FBQUEsUUFDeEMsS0FBSztBQUFBLFFBQ0wsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLFVBQ1AsZUFBZSxLQUFLLGdCQUFnQjtBQUFBLFVBQ3BDLGdCQUFnQjtBQUFBLFFBQ2xCO0FBQUEsUUFDQSxNQUFNO0FBQUEsTUFDUixDQUFDO0FBQ0QsVUFBSSxZQUFZLFNBQVMsT0FBTyxZQUFZLFVBQVUsS0FBSztBQUN6RCxjQUFNLElBQUksTUFBTSwwQkFBMEIsWUFBWSxNQUFNLEVBQUU7QUFBQSxNQUNoRTtBQUVBLFlBQU0sY0FBYyxNQUFNLEtBQUssV0FBVztBQUFBLFFBQ3hDLEtBQUs7QUFBQSxRQUNMLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxVQUNQLGVBQWUsS0FBSyxnQkFBZ0I7QUFBQSxRQUN0QztBQUFBLE1BQ0YsQ0FBQztBQUNELFVBQUksWUFBWSxTQUFTLE9BQU8sWUFBWSxVQUFVLEtBQUs7QUFDekQsY0FBTSxJQUFJLE1BQU0sMEJBQTBCLFlBQVksTUFBTSxFQUFFO0FBQUEsTUFDaEU7QUFFQSxZQUFNLGlCQUFpQixNQUFNLEtBQUssV0FBVztBQUFBLFFBQzNDLEtBQUs7QUFBQSxRQUNMLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxVQUNQLGVBQWUsS0FBSyxnQkFBZ0I7QUFBQSxRQUN0QztBQUFBLE1BQ0YsQ0FBQztBQUNELFVBQUksZUFBZSxTQUFTLE9BQU8sZUFBZSxVQUFVLEtBQUs7QUFDL0QsY0FBTSxJQUFJLE1BQU0sNkJBQTZCLGVBQWUsTUFBTSxFQUFFO0FBQUEsTUFDdEU7QUFFQSxZQUFNLFVBQVUsS0FBSztBQUFBLFFBQ25CLDRDQUFtQixZQUFZLE1BQU0sYUFBUSxZQUFZLE1BQU0sZ0JBQVcsZUFBZSxNQUFNO0FBQUEsUUFDL0YsMkJBQTJCLFlBQVksTUFBTSxTQUFTLFlBQVksTUFBTSxZQUFZLGVBQWUsTUFBTTtBQUFBLE1BQzNHO0FBQ0EsVUFBSSx3QkFBTyxTQUFTLEdBQUk7QUFDeEIsVUFBSSxXQUFXO0FBQ2IsWUFBSSxZQUFZLEtBQUssS0FBSyxLQUFLLEVBQUUsdUJBQWEsbUJBQW1CLEdBQUcsT0FBTyxFQUFFLEtBQUs7QUFBQSxNQUNwRjtBQUNBLGFBQU87QUFBQSxJQUNULFNBQVMsT0FBTztBQUNkLGNBQVEsTUFBTSw2QkFBNkIsS0FBSztBQUNoRCxZQUFNLFVBQVUsS0FBSyxjQUFjLEtBQUssRUFBRSxtQ0FBZSxvQkFBb0IsR0FBRyxLQUFLO0FBQ3JGLFVBQUksd0JBQU8sU0FBUyxHQUFJO0FBQ3hCLFVBQUksV0FBVztBQUNiLFlBQUksWUFBWSxLQUFLLEtBQUssS0FBSyxFQUFFLHVCQUFhLG1CQUFtQixHQUFHLE9BQU8sRUFBRSxLQUFLO0FBQUEsTUFDcEY7QUFDQSxhQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Y7QUFBQSxFQUVRLGNBQWMsUUFBZ0IsT0FBZ0I7QUFDcEQsVUFBTSxVQUFVLGlCQUFpQixRQUFRLE1BQU0sVUFBVSxPQUFPLEtBQUs7QUFDckUsV0FBTyxHQUFHLE1BQU0sS0FBSyxPQUFPO0FBQUEsRUFDOUI7QUFBQSxFQUVBLE1BQWMsV0FBVyxTQU9rRTtBQUN6RixVQUFNLFdBQVcsVUFBTSxpQkFBQUUsWUFBbUI7QUFBQSxNQUN4QyxLQUFLLFFBQVE7QUFBQSxNQUNiLFFBQVEsUUFBUTtBQUFBLE1BQ2hCLFNBQVMsUUFBUTtBQUFBLE1BQ2pCLE1BQU0sUUFBUTtBQUFBLE1BQ2QsT0FBTztBQUFBLElBQ1QsQ0FBQztBQUVELFdBQU87QUFBQSxNQUNMLFFBQVEsU0FBUztBQUFBLE1BQ2pCLFNBQVMsU0FBUztBQUFBLE1BQ2xCLGFBQWEsU0FBUztBQUFBLElBQ3hCO0FBQUEsRUFDRjtBQUFBLEVBRVEsV0FBVyxPQUFlO0FBQ2hDLFVBQU0sUUFBUSxJQUFJLFlBQVksRUFBRSxPQUFPLEtBQUs7QUFDNUMsV0FBTyxNQUFNLE9BQU8sTUFBTSxNQUFNLFlBQVksTUFBTSxhQUFhLE1BQU0sVUFBVTtBQUFBLEVBQ2pGO0FBQUEsRUFFUSxXQUFXLFFBQXFCO0FBQ3RDLFdBQU8sSUFBSSxZQUFZLEVBQUUsT0FBTyxNQUFNO0FBQUEsRUFDeEM7QUFBQSxFQUVBLE1BQWMsaUJBQWlCLFFBQXFCO0FBQ2xELFVBQU0sU0FBUyxNQUFNLE9BQU8sT0FBTyxPQUFPLFdBQVcsTUFBTTtBQUMzRCxXQUFPLE1BQU0sS0FBSyxJQUFJLFdBQVcsTUFBTSxDQUFDLEVBQ3JDLElBQUksQ0FBQyxVQUFVLE1BQU0sU0FBUyxFQUFFLEVBQUUsU0FBUyxHQUFHLEdBQUcsQ0FBQyxFQUNsRCxLQUFLLEVBQUU7QUFBQSxFQUNaO0FBQ0Y7QUFRQSxJQUFNLHlCQUFOLGNBQXFDLGtDQUFpQjtBQUFBLEVBR3BELFlBQVksS0FBVSxRQUFrQztBQUN0RCxVQUFNLEtBQUssTUFBTTtBQUNqQixTQUFLLFNBQVM7QUFBQSxFQUNoQjtBQUFBLEVBRUEsVUFBZ0I7QUFDZCxVQUFNLEVBQUUsWUFBWSxJQUFJO0FBQ3hCLGdCQUFZLE1BQU07QUFFbEIsZ0JBQVksU0FBUyxNQUFNLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUMzRCxnQkFBWSxTQUFTLEtBQUs7QUFBQSxNQUN4QixNQUFNLEtBQUssT0FBTztBQUFBLFFBQ2hCO0FBQUEsUUFDQTtBQUFBLE1BQ0Y7QUFBQSxJQUNGLENBQUM7QUFFRCxRQUFJLHlCQUFRLFdBQVcsRUFDcEIsUUFBUSxLQUFLLE9BQU8sRUFBRSx3Q0FBVSx3QkFBd0IsQ0FBQyxFQUN6RDtBQUFBLE1BQ0MsS0FBSyxPQUFPO0FBQUEsUUFDVjtBQUFBLFFBQ0E7QUFBQSxNQUNGO0FBQUEsSUFDRixFQUNDLFFBQVEsQ0FBQyxTQUFTO0FBQ2pCLFdBQUssU0FBUyxLQUFLLE9BQU8sU0FBUyxPQUFPO0FBQzFDLFdBQUssWUFBWSxJQUFJO0FBQUEsSUFDdkIsQ0FBQztBQUVILGdCQUFZLFNBQVMsTUFBTSxFQUFFLE1BQU0sS0FBSyxPQUFPLEVBQUUsNEJBQVEsb0JBQW9CLEVBQUUsQ0FBQztBQUVoRixRQUFJLHlCQUFRLFdBQVcsRUFDcEIsUUFBUSxLQUFLLE9BQU8sRUFBRSxnQkFBTSxVQUFVLENBQUMsRUFDdkMsUUFBUSxLQUFLLE9BQU8sRUFBRSxvR0FBb0IsNERBQTRELENBQUMsRUFDdkc7QUFBQSxNQUFZLENBQUMsYUFDWixTQUNHLFVBQVUsUUFBUSxLQUFLLE9BQU8sRUFBRSxnQkFBTSxNQUFNLENBQUMsRUFDN0MsVUFBVSxNQUFNLGNBQUksRUFDcEIsVUFBVSxNQUFNLFNBQVMsRUFDekIsU0FBUyxLQUFLLE9BQU8sU0FBUyxRQUFRLEVBQ3RDLFNBQVMsT0FBTyxVQUFVO0FBQ3pCLGFBQUssT0FBTyxTQUFTLFdBQVc7QUFDaEMsY0FBTSxLQUFLLE9BQU8sYUFBYTtBQUMvQixhQUFLLFFBQVE7QUFBQSxNQUNmLENBQUM7QUFBQSxJQUNMO0FBRUYsZ0JBQVksU0FBUyxNQUFNLEVBQUUsTUFBTSxLQUFLLE9BQU8sRUFBRSw0QkFBUSxZQUFZLEVBQUUsQ0FBQztBQUV4RSxRQUFJLHlCQUFRLFdBQVcsRUFDcEIsUUFBUSxLQUFLLE9BQU8sRUFBRSxtQ0FBZSxpQkFBaUIsQ0FBQyxFQUN2RCxRQUFRLEtBQUssT0FBTyxFQUFFLGtHQUEyQyx3REFBd0QsQ0FBQyxFQUMxSDtBQUFBLE1BQVEsQ0FBQyxTQUNSLEtBQ0csZUFBZSw4QkFBOEIsRUFDN0MsU0FBUyxLQUFLLE9BQU8sU0FBUyxTQUFTLEVBQ3ZDLFNBQVMsT0FBTyxVQUFVO0FBQ3pCLGFBQUssT0FBTyxTQUFTLFlBQVksTUFBTSxLQUFLO0FBQzVDLGNBQU0sS0FBSyxPQUFPLGFBQWE7QUFBQSxNQUNqQyxDQUFDO0FBQUEsSUFDTDtBQUVGLFFBQUkseUJBQVEsV0FBVyxFQUNwQixRQUFRLEtBQUssT0FBTyxFQUFFLGdCQUFNLFVBQVUsQ0FBQyxFQUN2QztBQUFBLE1BQVEsQ0FBQyxTQUNSLEtBQUssU0FBUyxLQUFLLE9BQU8sU0FBUyxRQUFRLEVBQUUsU0FBUyxPQUFPLFVBQVU7QUFDckUsYUFBSyxPQUFPLFNBQVMsV0FBVyxNQUFNLEtBQUs7QUFDM0MsY0FBTSxLQUFLLE9BQU8sYUFBYTtBQUFBLE1BQ2pDLENBQUM7QUFBQSxJQUNIO0FBRUYsUUFBSSx5QkFBUSxXQUFXLEVBQ3BCLFFBQVEsS0FBSyxPQUFPLEVBQUUsZ0JBQU0sVUFBVSxDQUFDLEVBQ3ZDLFFBQVEsS0FBSyxPQUFPLEVBQUUsZ0hBQXNCLG9FQUFvRSxDQUFDLEVBQ2pILFFBQVEsQ0FBQyxTQUFTO0FBQ2pCLFdBQUssUUFBUSxPQUFPO0FBQ3BCLFdBQUssU0FBUyxLQUFLLE9BQU8sU0FBUyxRQUFRLEVBQUUsU0FBUyxPQUFPLFVBQVU7QUFDckUsYUFBSyxPQUFPLFNBQVMsV0FBVztBQUNoQyxjQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsTUFDakMsQ0FBQztBQUFBLElBQ0gsQ0FBQyxFQUNBLGVBQWUsQ0FBQyxXQUFXO0FBQzFCLFVBQUksVUFBVTtBQUNkLGFBQU8sUUFBUSxLQUFLO0FBQ3BCLGFBQU8sV0FBVyxLQUFLLE9BQU8sRUFBRSw0QkFBUSxlQUFlLENBQUM7QUFDeEQsYUFBTyxRQUFRLE1BQU07QUFDbkIsY0FBTSxRQUFRLE9BQU8sZ0JBQWdCLGVBQWUsY0FBYyxPQUFPO0FBQ3pFLFlBQUksRUFBRSxpQkFBaUIsbUJBQW1CO0FBQ3hDO0FBQUEsUUFDRjtBQUVBLGtCQUFVLENBQUM7QUFDWCxjQUFNLE9BQU8sVUFBVSxTQUFTO0FBQ2hDLGVBQU8sUUFBUSxVQUFVLFlBQVksS0FBSztBQUMxQyxlQUFPLFdBQVcsS0FBSyxPQUFPLEVBQUUsVUFBVSw2QkFBUyw0QkFBUSxVQUFVLGtCQUFrQixlQUFlLENBQUM7QUFBQSxNQUN6RyxDQUFDO0FBQUEsSUFDSCxDQUFDO0FBRUgsUUFBSSx5QkFBUSxXQUFXLEVBQ3BCLFFBQVEsS0FBSyxPQUFPLEVBQUUsd0NBQVUscUJBQXFCLENBQUMsRUFDdEQ7QUFBQSxNQUNDLEtBQUssT0FBTztBQUFBLFFBQ1Y7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0YsRUFDQztBQUFBLE1BQVEsQ0FBQyxTQUNSLEtBQUssU0FBUyxLQUFLLE9BQU8sU0FBUyxZQUFZLEVBQUUsU0FBUyxPQUFPLFVBQVU7QUFDekUsYUFBSyxPQUFPLFNBQVMsbUJBQWUsZ0NBQWMsTUFBTSxLQUFLLEtBQUssaUJBQWlCO0FBQ25GLGNBQU0sS0FBSyxPQUFPLGFBQWE7QUFBQSxNQUNqQyxDQUFDO0FBQUEsSUFDSDtBQUVGLFFBQUkseUJBQVEsV0FBVyxFQUNwQixRQUFRLEtBQUssT0FBTyxFQUFFLDRCQUFRLGlCQUFpQixDQUFDLEVBQ2hELFFBQVEsS0FBSyxPQUFPLEVBQUUsd0hBQW1DLDJEQUEyRCxDQUFDLEVBQ3JIO0FBQUEsTUFBVSxDQUFDLFdBQ1YsT0FBTyxjQUFjLEtBQUssT0FBTyxFQUFFLDRCQUFRLFVBQVUsQ0FBQyxFQUFFLFFBQVEsWUFBWTtBQUMxRSxlQUFPLFlBQVksSUFBSTtBQUN2QixZQUFJO0FBQ0YsZ0JBQU0sS0FBSyxPQUFPLGtCQUFrQixJQUFJO0FBQUEsUUFDMUMsVUFBRTtBQUNBLGlCQUFPLFlBQVksS0FBSztBQUFBLFFBQzFCO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDSDtBQUVGLGdCQUFZLFNBQVMsTUFBTSxFQUFFLE1BQU0sS0FBSyxPQUFPLEVBQUUsNEJBQVEsTUFBTSxFQUFFLENBQUM7QUFFbEUsUUFBSSx5QkFBUSxXQUFXLEVBQ3BCLFFBQVEsS0FBSyxPQUFPLEVBQUUsd0NBQVUscUJBQXFCLENBQUMsRUFDdEQ7QUFBQSxNQUNDLEtBQUssT0FBTztBQUFBLFFBQ1Y7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0YsRUFDQztBQUFBLE1BQVEsQ0FBQyxTQUNSLEtBQUssU0FBUyxLQUFLLE9BQU8sU0FBUyxxQkFBcUIsRUFBRSxTQUFTLE9BQU8sVUFBVTtBQUNsRixhQUFLLE9BQU8sU0FBUyw0QkFBd0IsZ0NBQWMsTUFBTSxLQUFLLEtBQUssY0FBYztBQUN6RixjQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsTUFDakMsQ0FBQztBQUFBLElBQ0g7QUFFRixRQUFJLHlCQUFRLFdBQVcsRUFDcEIsUUFBUSxLQUFLLE9BQU8sRUFBRSxrQ0FBUyx1QkFBdUIsQ0FBQyxFQUN2RDtBQUFBLE1BQ0MsS0FBSyxPQUFPO0FBQUEsUUFDVjtBQUFBLFFBQ0E7QUFBQSxNQUNGO0FBQUEsSUFDRixFQUNDO0FBQUEsTUFBWSxDQUFDLFNBQ1osS0FDRyxlQUFlLElBQUksRUFDbkIsVUFBVSxLQUFLLE9BQU8sU0FBUyx1QkFBdUIsQ0FBQyxHQUFHLEtBQUssSUFBSSxDQUFDLEVBQ3BFLFNBQVMsT0FBTyxVQUFVO0FBQ3pCLGFBQUssT0FBTyxTQUFTLHNCQUFzQixNQUFNLE1BQU0sT0FBTztBQUM5RCxhQUFLLE9BQU8sMkJBQTJCO0FBQ3ZDLGNBQU0sS0FBSyxPQUFPLGFBQWE7QUFBQSxNQUNqQyxDQUFDO0FBQUEsSUFDTDtBQUVGLFFBQUkseUJBQVEsV0FBVyxFQUNwQixRQUFRLEtBQUssT0FBTyxFQUFFLHdDQUFVLHFCQUFxQixDQUFDLEVBQ3REO0FBQUEsTUFDQyxLQUFLLE9BQU87QUFBQSxRQUNWO0FBQUEsUUFDQTtBQUFBLE1BQ0Y7QUFBQSxJQUNGLEVBQ0M7QUFBQSxNQUFRLENBQUMsU0FDUixLQUNHLGVBQWUsR0FBRyxFQUNsQixTQUFTLE9BQU8sS0FBSyxPQUFPLFNBQVMsdUJBQXVCLENBQUMsRUFDN0QsU0FBUyxPQUFPLFVBQVU7QUFDekIsY0FBTSxTQUFTLE9BQU8sU0FBUyxPQUFPLEVBQUU7QUFDeEMsWUFBSSxDQUFDLE9BQU8sTUFBTSxNQUFNLEdBQUc7QUFDekIsZUFBSyxPQUFPLFNBQVMsMEJBQTBCLEtBQUssSUFBSSxHQUFHLE1BQU07QUFDakUsZ0JBQU0sS0FBSyxPQUFPLGFBQWE7QUFBQSxRQUNqQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0w7QUFFRixRQUFJLHlCQUFRLFdBQVcsRUFDcEIsUUFBUSxLQUFLLE9BQU8sRUFBRSxvREFBWSwyQkFBMkIsQ0FBQyxFQUM5RDtBQUFBLE1BQ0MsS0FBSyxPQUFPO0FBQUEsUUFDVjtBQUFBLFFBQ0E7QUFBQSxNQUNGO0FBQUEsSUFDRixFQUNDO0FBQUEsTUFBWSxDQUFDLGFBQ1osU0FDRyxVQUFVLGNBQWMsS0FBSyxPQUFPLEVBQUUsNEJBQVEsWUFBWSxDQUFDLEVBQzNELFVBQVUsY0FBYyxLQUFLLE9BQU8sRUFBRSx3Q0FBVSxZQUFZLENBQUMsRUFDN0QsU0FBUyxLQUFLLE9BQU8sU0FBUyxlQUFlLEVBQzdDLFNBQVMsT0FBTyxVQUFVO0FBQ3pCLGFBQUssT0FBTyxTQUFTLGtCQUFrQjtBQUN2QyxjQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsTUFDakMsQ0FBQztBQUFBLElBQ0w7QUFFRixRQUFJLHlCQUFRLFdBQVcsRUFDcEIsUUFBUSxLQUFLLE9BQU8sRUFBRSxvREFBWSxvQkFBb0IsQ0FBQyxFQUN2RDtBQUFBLE1BQ0MsS0FBSyxPQUFPO0FBQUEsUUFDVjtBQUFBLFFBQ0E7QUFBQSxNQUNGO0FBQUEsSUFDRixFQUNDO0FBQUEsTUFBUSxDQUFDLFNBQ1IsS0FDRyxlQUFlLElBQUksRUFDbkIsU0FBUyxPQUFPLEtBQUssT0FBTyxTQUFTLGtCQUFrQixDQUFDLEVBQ3hELFNBQVMsT0FBTyxVQUFVO0FBQ3pCLGNBQU0sU0FBUyxPQUFPLFNBQVMsT0FBTyxFQUFFO0FBQ3hDLFlBQUksQ0FBQyxPQUFPLE1BQU0sTUFBTSxHQUFHO0FBQ3pCLGVBQUssT0FBTyxTQUFTLHFCQUFxQixLQUFLLElBQUksR0FBRyxNQUFNO0FBQzVELGdCQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsUUFDakM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNMO0FBRUYsUUFBSSx5QkFBUSxXQUFXLEVBQ3BCLFFBQVEsS0FBSyxPQUFPLEVBQUUsNEJBQVEsYUFBYSxDQUFDLEVBQzVDO0FBQUEsTUFDQyxLQUFLLE9BQU87QUFBQSxRQUNWLEdBQUcsS0FBSyxPQUFPLG9CQUFvQixDQUFDO0FBQUEsRUFBSyxLQUFLLE9BQU8sc0JBQXNCLENBQUM7QUFBQSxFQUFLLEtBQUssT0FBTyxFQUFFLGlaQUF1RSw0T0FBNE8sQ0FBQztBQUFBLFFBQ25aLEdBQUcsS0FBSyxPQUFPLG9CQUFvQixDQUFDO0FBQUEsRUFBSyxLQUFLLE9BQU8sc0JBQXNCLENBQUM7QUFBQSxFQUFLLEtBQUssT0FBTyxFQUFFLGlaQUF1RSw0T0FBNE8sQ0FBQztBQUFBLE1BQ3JaO0FBQUEsSUFDRixFQUNDO0FBQUEsTUFBVSxDQUFDLFdBQ1YsT0FBTyxjQUFjLEtBQUssT0FBTyxFQUFFLDRCQUFRLFdBQVcsQ0FBQyxFQUFFLFFBQVEsWUFBWTtBQUMzRSxlQUFPLFlBQVksSUFBSTtBQUN2QixZQUFJO0FBQ0YsZ0JBQU0sS0FBSyxPQUFPLHdCQUF3QixJQUFJO0FBQzlDLGVBQUssUUFBUTtBQUFBLFFBQ2YsVUFBRTtBQUNBLGlCQUFPLFlBQVksS0FBSztBQUFBLFFBQzFCO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDSCxFQUNDO0FBQUEsTUFBVSxDQUFDLFdBQ1YsT0FBTyxjQUFjLEtBQUssT0FBTyxFQUFFLDRCQUFRLGdCQUFnQixDQUFDLEVBQUUsUUFBUSxZQUFZO0FBQ2hGLGVBQU8sWUFBWSxJQUFJO0FBQ3ZCLFlBQUk7QUFDRixnQkFBTSxLQUFLLE9BQU8sMkJBQTJCLElBQUk7QUFDakQsZUFBSyxRQUFRO0FBQUEsUUFDZixVQUFFO0FBQ0EsaUJBQU8sWUFBWSxLQUFLO0FBQUEsUUFDMUI7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNIO0FBRUYsZ0JBQVksU0FBUyxNQUFNLEVBQUUsTUFBTSxLQUFLLE9BQU8sRUFBRSxrQ0FBUyxnQkFBZ0IsRUFBRSxDQUFDO0FBRTdFLFFBQUkseUJBQVEsV0FBVyxFQUNwQixRQUFRLEtBQUssT0FBTyxFQUFFLGdFQUFjLHNDQUFzQyxDQUFDLEVBQzNFO0FBQUEsTUFDQyxLQUFLLE9BQU87QUFBQSxRQUNWO0FBQUEsUUFDQTtBQUFBLE1BQ0Y7QUFBQSxJQUNGLEVBQ0M7QUFBQSxNQUFVLENBQUMsV0FDVixPQUFPLGNBQWMsS0FBSyxPQUFPLEVBQUUsNEJBQVEsZUFBZSxDQUFDLEVBQUUsUUFBUSxZQUFZO0FBQy9FLGVBQU8sWUFBWSxJQUFJO0FBQ3ZCLFlBQUk7QUFDRixnQkFBTSxLQUFLLE9BQU8sNkJBQTZCO0FBQUEsUUFDakQsVUFBRTtBQUNBLGlCQUFPLFlBQVksS0FBSztBQUFBLFFBQzFCO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDSDtBQUFBLEVBQ0o7QUFDRjtBQUVBLElBQU0sY0FBTixjQUEwQix1QkFBTTtBQUFBLEVBSTlCLFlBQVksS0FBVSxXQUFtQixVQUFrQjtBQUN6RCxVQUFNLEdBQUc7QUFDVCxTQUFLLFlBQVk7QUFDakIsU0FBSyxXQUFXO0FBQUEsRUFDbEI7QUFBQSxFQUVBLFNBQWU7QUFDYixVQUFNLEVBQUUsVUFBVSxJQUFJO0FBQ3RCLGNBQVUsTUFBTTtBQUNoQixjQUFVLFNBQVMsTUFBTSxFQUFFLE1BQU0sS0FBSyxVQUFVLENBQUM7QUFDakQsY0FBVSxTQUFTLEtBQUssRUFBRSxNQUFNLEtBQUssU0FBUyxDQUFDO0FBQUEsRUFDakQ7QUFBQSxFQUVBLFVBQWdCO0FBQ2QsU0FBSyxVQUFVLE1BQU07QUFBQSxFQUN2QjtBQUNGOyIsCiAgIm5hbWVzIjogWyJpbXBvcnRfb2JzaWRpYW4iLCAiaW1wb3J0X29ic2lkaWFuIiwgImltcG9ydF9vYnNpZGlhbiIsICJkb2N1bWVudCIsICJ0b21ic3RvbmUiLCAib2JzaWRpYW5SZXF1ZXN0VXJsIl0KfQo=
