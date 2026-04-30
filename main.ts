import {
  App,
  Editor,
  MarkdownFileInfo,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  TFolder,
  normalizePath,
  requestUrl as obsidianRequestUrl,
} from "obsidian";
import { SECURE_CODE_BLOCK, SECURE_PROTOCOL, SecureWebdavImageSupport } from "./secure-webdav-image-support";
import { SecureWebdavUploadQueueSupport, type UploadTask } from "./secure-webdav-upload-queue";
import {
  SecureWebdavSyncSupport,
  type DeletionTombstone,
  normalizeFolder,
} from "./secure-webdav-sync-support";

type SecureWebdavSettings = {
  webdavUrl: string;
  username: string;
  password: string;
  remoteFolder: string;
  vaultSyncRemoteFolder: string;
  excludedSyncFolders: string[];
  namingStrategy: "timestamp" | "hash";
  deleteLocalAfterUpload: boolean;
  language: "auto" | "zh" | "en";
  noteStorageMode: "full-local" | "lazy-notes";
  noteEvictAfterDays: number;
  autoSyncIntervalMinutes: number;
  maxRetryAttempts: number;
  retryDelaySeconds: number;
  deleteRemoteWhenUnreferenced: boolean;
  compressImages: boolean;
  compressThresholdKb: number;
  maxImageDimension: number;
  jpegQuality: number;
};

type SyncIndexEntry = {
  localSignature: string;
  remoteSignature: string;
  remotePath: string;
};

type RemoteFileState = {
  remotePath: string;
  lastModified: number;
  size: number;
  signature: string;
};

type MissingLazyRemoteRecord = {
  firstDetectedAt: number;
  lastDetectedAt: number;
  missCount: number;
};

type PendingDeletionEntry = {
  remotePath: string;
  remoteSignature?: string;
};

type RemoteInventory = {
  files: Map<string, RemoteFileState>;
  directories: Set<string>;
};

const DEFAULT_SETTINGS: SecureWebdavSettings = {
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
};

const MIME_MAP: Record<string, string> = {
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
  "image/svg+xml": "svg",
};

const SECURE_NOTE_STUB = "secure-webdav-note-stub";

export default class SecureWebdavImagesPlugin extends Plugin {
  settings: SecureWebdavSettings = DEFAULT_SETTINGS;
  queue: UploadTask[] = [];
  private blobUrls = new Set<string>();
  private readonly maxBlobUrls = 100;
  private noteRemoteRefs = new Map<string, Set<string>>();
  private remoteCleanupInFlight = new Set<string>();
  private noteAccessTimestamps = new Map<string, number>();
  private syncIndex = new Map<string, SyncIndexEntry>();
  private syncedDirectories = new Set<string>();
  private missingLazyRemoteNotes = new Map<string, MissingLazyRemoteRecord>();
  private pendingVaultSyncPaths = new Set<string>();
  private pendingVaultDeletionPaths = new Map<string, PendingDeletionEntry>();
  private pendingVaultMutationPromises = new Set<Promise<void>>();
  private priorityNoteSyncTimeouts = new Map<string, number>();
  private priorityNoteSyncsInFlight = new Set<string>();
  private lastVaultSyncAt = 0;
  private lastVaultSyncStatus = "";
  private syncInProgress = false;
  private autoSyncTickInProgress = false;
  // Image parsing and rendering live in a dedicated helper so sync changes
  // do not accidentally break display behaviour again.
  private imageSupport!: SecureWebdavImageSupport;
  // Upload queue state is isolated so retries and placeholder replacement do
  // not keep sprawling across the main plugin class.
  private uploadQueue!: SecureWebdavUploadQueueSupport;
  // Sync metadata helpers are isolated so reconciliation rules stay explicit.
  private syncSupport!: SecureWebdavSyncSupport;

  private readonly deletionFolderSuffix = ".__secure-webdav-deletions__/";
  private readonly missingLazyRemoteConfirmations = 2;

  private initializeSupportModules() {
    // Keep runtime-only integration here: the image module owns parsing and
    // rendering, while the plugin still owns WebDAV access and lifecycle.
    this.imageSupport = new SecureWebdavImageSupport({
      t: this.t.bind(this),
      fetchSecureImageBlobUrl: this.fetchSecureImageBlobUrl.bind(this),
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
      describeError: this.describeError.bind(this),
    });
    this.syncSupport = new SecureWebdavSyncSupport({
      app: this.app,
      getVaultSyncRemoteFolder: () => this.settings.vaultSyncRemoteFolder,
      getExcludedSyncFolders: () => this.settings.excludedSyncFolders ?? [],
      deletionFolderSuffix: this.deletionFolderSuffix,
      encodeBase64Url: (value) =>
        this.arrayBufferToBase64(this.encodeUtf8(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""),
      decodeBase64Url: (value) => {
        const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
        return this.decodeUtf8(this.base64ToArrayBuffer(padded));
      },
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
      },
    });

    this.addCommand({
      id: "test-webdav-connection",
      name: "Test WebDAV connection",
      callback: () => {
        void this.runConnectionTest(true);
      },
    });

    this.addCommand({
      id: "sync-configured-vault-content-to-webdav",
      name: "Fast sync changed vault content to WebDAV",
      callback: () => {
        void this.runManualSync();
      },
    });

    this.addCommand({
      id: "full-reconcile-vault-content-to-webdav",
      name: "Full reconcile vault content with WebDAV",
      callback: () => {
        void this.runFullReconcileSync();
      },
    });

    const fastSyncRibbon = this.addRibbonIcon("zap", this.t("快速同步到 WebDAV", "Fast sync to WebDAV"), () => {
      void this.runManualSync();
    });
    fastSyncRibbon.addClass("secure-webdav-sync-ribbon");
    fastSyncRibbon.addClass("secure-webdav-fast-sync-ribbon");

    const fullSyncRibbon = this.addRibbonIcon("refresh-cw", this.t("完整同步到 WebDAV", "Full sync to WebDAV"), () => {
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
      }),
    );

    this.registerEvent(
      this.app.workspace.on("editor-paste", (evt, editor, info) => {
        void this.handleEditorPaste(evt, editor, info);
      }),
    );

    this.registerEvent(
      this.app.workspace.on("editor-drop", (evt, editor, info) => {
        void this.handleEditorDrop(evt, editor, info);
      }),
    );

    await this.rebuildReferenceIndex();
    this.registerEvent(this.app.vault.on("modify", (file) => this.trackVaultMutation(() => this.handleVaultModify(file))));
    this.registerEvent(this.app.vault.on("delete", (file) => this.trackVaultMutation(() => this.handleVaultDelete(file))));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => this.trackVaultMutation(() => this.handleVaultRename(file, oldPath))),
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
      this.noteAccessTimestamps = new Map();
      this.syncIndex = new Map();
      this.syncedDirectories = new Set();
      this.missingLazyRemoteNotes = new Map();
      this.pendingVaultSyncPaths = new Set();
      this.pendingVaultDeletionPaths = new Map();
      return;
    }

    const candidate = loaded as Record<string, unknown>;
    if ("settings" in candidate || "queue" in candidate) {
      this.settings = { ...DEFAULT_SETTINGS, ...((candidate.settings as Partial<SecureWebdavSettings>) ?? {}) };
      this.queue = Array.isArray(candidate.queue) ? (candidate.queue as UploadTask[]) : [];
      this.noteAccessTimestamps = new Map(
        Object.entries((candidate.noteAccessTimestamps as Record<string, number> | undefined) ?? {}),
      );
      this.missingLazyRemoteNotes = new Map(
        Object.entries((candidate.missingLazyRemoteNotes as Record<string, MissingLazyRemoteRecord> | undefined) ?? {})
          .filter(([, value]) => {
            if (!value || typeof value !== "object") {
              return false;
            }
            const record = value as Record<string, unknown>;
            return (
              typeof record.firstDetectedAt === "number" &&
              typeof record.lastDetectedAt === "number" &&
              typeof record.missCount === "number"
            );
          })
          .map(([path, value]) => [path, value as MissingLazyRemoteRecord]),
      );
      this.pendingVaultSyncPaths = new Set(
        Array.isArray(candidate.pendingVaultSyncPaths)
          ? candidate.pendingVaultSyncPaths.filter((path): path is string => typeof path === "string")
          : [],
      );
      this.pendingVaultDeletionPaths = new Map();
      for (const [path, rawEntry] of Object.entries((candidate.pendingVaultDeletionPaths as Record<string, unknown> | undefined) ?? {})) {
        if (!rawEntry || typeof rawEntry !== "object") {
          continue;
        }
        const entry = rawEntry as Record<string, unknown>;
        const remotePath = typeof entry.remotePath === "string" && entry.remotePath.length > 0
          ? entry.remotePath
          : `${this.normalizeFolder(this.settings.vaultSyncRemoteFolder)}${path}`;
        const remoteSignature = typeof entry.remoteSignature === "string" ? entry.remoteSignature : undefined;
        this.pendingVaultDeletionPaths.set(path, { remotePath, remoteSignature });
      }
      this.syncIndex = new Map();
      for (const [path, rawEntry] of Object.entries((candidate.syncIndex as Record<string, unknown> | undefined) ?? {})) {
        const normalized = this.normalizeSyncIndexEntry(path, rawEntry);
        if (normalized) {
          this.syncIndex.set(path, normalized);
        }
      }
      this.lastVaultSyncAt =
        typeof candidate.lastVaultSyncAt === "number" ? candidate.lastVaultSyncAt : 0;
      this.lastVaultSyncStatus =
        typeof candidate.lastVaultSyncStatus === "string" ? candidate.lastVaultSyncStatus : "";
      this.syncedDirectories = new Set(
        Array.isArray(candidate.syncedDirectories) ? candidate.syncedDirectories as string[] : [],
      );
      this.normalizeEffectiveSettings();
      return;
    }

    this.settings = { ...DEFAULT_SETTINGS, ...(candidate as Partial<SecureWebdavSettings>) };
    this.queue = [];
    this.noteAccessTimestamps = new Map();
    this.syncIndex = new Map();
    this.syncedDirectories = new Set();
    this.missingLazyRemoteNotes = new Map();
    this.pendingVaultSyncPaths = new Set();
    this.pendingVaultDeletionPaths = new Map();
    this.lastVaultSyncAt = 0;
    this.lastVaultSyncStatus = "";
    this.normalizeEffectiveSettings();
  }

  private normalizeEffectiveSettings() {
    // Keep the public settings surface intentionally small and deterministic.
    this.settings.deleteLocalAfterUpload = true;
    this.settings.autoSyncIntervalMinutes = Math.max(0, Math.floor(this.settings.autoSyncIntervalMinutes || 0));
    const rawExcluded = this.settings.excludedSyncFolders as unknown;
    const excluded = Array.isArray(rawExcluded)
      ? rawExcluded
      : typeof rawExcluded === "string"
        ? rawExcluded.split(/[,\n]/)
        : DEFAULT_SETTINGS.excludedSyncFolders;
    this.settings.excludedSyncFolders = [
      ...new Set(
        excluded
          .map((value) => normalizePath(String(value).trim()).replace(/^\/+/, "").replace(/\/+$/, ""))
          .filter((value) => value.length > 0),
      ),
    ];
  }

  private normalizeFolder(input: string) {
    return normalizeFolder(input);
  }

  private setupAutoSync() {
    const minutes = this.settings.autoSyncIntervalMinutes;
    if (minutes <= 0) {
      return;
    }

    const intervalMs = minutes * 60 * 1000;
    this.registerInterval(
      window.setInterval(() => {
        void this.runAutoSyncTick();
      }, intervalMs),
    );
  }

  private async runAutoSyncTick() {
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
      lastVaultSyncStatus: this.lastVaultSyncStatus,
    });
  }

  async saveSettings() {
    await this.savePluginState();
  }

  private normalizeSyncIndexEntry(vaultPath: string, rawEntry: unknown): SyncIndexEntry | null {
    if (!rawEntry || typeof rawEntry !== "object") {
      return null;
    }

    const candidate = rawEntry as Record<string, unknown>;
    const remotePath =
      typeof candidate.remotePath === "string" && candidate.remotePath.length > 0
        ? candidate.remotePath
        : this.syncSupport.buildVaultSyncRemotePath(vaultPath);
    const localSignature =
      typeof candidate.localSignature === "string"
        ? candidate.localSignature
        : typeof candidate.signature === "string"
          ? candidate.signature
          : "";
    const remoteSignature =
      typeof candidate.remoteSignature === "string"
        ? candidate.remoteSignature
        : typeof candidate.signature === "string"
          ? candidate.signature
          : "";

    return {
      localSignature,
      remoteSignature,
      remotePath,
    };
  }

  t(zh: string, en: string) {
    return this.getLanguage() === "zh" ? zh : en;
  }

  private getLanguage() {
    if (this.settings.language === "auto") {
      const locale = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "en";
      return locale.startsWith("zh") ? "zh" : "en";
    }

    return this.settings.language;
  }

  formatLastSyncLabel() {
    if (!this.lastVaultSyncAt) {
      return this.t("上次同步：尚未执行", "Last sync: not run yet");
    }

    return this.t(
      `上次同步：${new Date(this.lastVaultSyncAt).toLocaleString()}`,
      `Last sync: ${new Date(this.lastVaultSyncAt).toLocaleString()}`,
    );
  }

  formatSyncStatusLabel() {
    return this.lastVaultSyncStatus
      ? this.t(`最近状态：${this.lastVaultSyncStatus}`, `Recent status: ${this.lastVaultSyncStatus}`)
      : this.t("最近状态：暂无", "Recent status: none");
  }

  async runManualSync() {
    await this.syncPendingVaultContent(true);
  }

  async runFullReconcileSync() {
    await this.syncConfiguredVaultContent(true);
  }

  private async rebuildReferenceIndex() {
    const next = new Map<string, Set<string>>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.read(file);
      next.set(file.path, this.extractRemotePathsFromText(content));
    }
    this.noteRemoteRefs = next;
  }

  private async handleVaultModify(file: TAbstractFile) {
    if (!(file instanceof TFile)) {
      return;
    }

    this.markPendingVaultSync(file.path);

    if (file.extension === "md") {
      const content = await this.app.vault.read(file);
      const nextRefs = this.extractRemotePathsFromText(content);
      const previousRefs = this.noteRemoteRefs.get(file.path) ?? new Set<string>();
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

  private async handleVaultDelete(file: TAbstractFile) {
    if (!(file instanceof TFile)) {
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

  private async handleVaultRename(file: TAbstractFile, oldPath: string) {
    if (!(file instanceof TFile)) {
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

  private markPendingVaultSync(path: string) {
    if (this.syncSupport.shouldSkipContentSyncPath(path)) {
      this.pendingVaultSyncPaths.delete(path);
      return;
    }

    this.pendingVaultDeletionPaths.delete(path);
    this.pendingVaultSyncPaths.add(path);
  }

  private markPendingVaultDeletion(path: string) {
    if (this.syncSupport.shouldSkipContentSyncPath(path)) {
      this.pendingVaultSyncPaths.delete(path);
      this.pendingVaultDeletionPaths.delete(path);
      return;
    }

    const existing = this.syncIndex.get(path);
    this.pendingVaultSyncPaths.delete(path);
    this.pendingVaultDeletionPaths.set(path, {
      remotePath: existing?.remotePath ?? this.syncSupport.buildVaultSyncRemotePath(path),
      remoteSignature: existing?.remoteSignature,
    });
  }

  private extractRemotePathsFromText(content: string) {
    const refs = new Set<string>();
    const spanRegex = /data-secure-webdav="([^"]+)"/g;
    const protocolRegex = /webdav-secure:\/\/([^\s)"]+)/g;
    const codeBlockRegex = /```secure-webdav\s+([\s\S]*?)```/g;
    let match: RegExpExecArray | null;

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

  private schedulePriorityNoteSync(notePath: string, reason: "image-add" | "image-remove") {
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

  private async flushPriorityNoteSync(notePath: string, reason: "image-add" | "image-remove") {
    if (this.priorityNoteSyncsInFlight.has(notePath)) {
      return;
    }

    if (
      this.uploadQueue.hasPendingWorkForNote(notePath) ||
      this.pendingVaultMutationPromises.size > 0 ||
      this.syncInProgress ||
      this.autoSyncTickInProgress
    ) {
      this.schedulePriorityNoteSync(notePath, reason);
      return;
    }

    const file = this.getVaultFileByPath(notePath);
    if (!(file instanceof TFile) || file.extension !== "md" || this.syncSupport.shouldSkipContentSyncPath(file.path)) {
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
        remotePath,
      });
      this.pendingVaultSyncPaths.delete(file.path);
      await this.deleteDeletionTombstone(file.path);
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.t(
        reason === "image-add"
          ? `已优先同步图片新增后的笔记：${file.basename}`
          : `已优先同步图片删除后的笔记：${file.basename}`,
        reason === "image-add"
          ? `Prioritized note sync finished after image add: ${file.basename}`
          : `Prioritized note sync finished after image removal: ${file.basename}`,
      );
      await this.savePluginState();
    } catch (error) {
      console.error("Priority note sync failed", error);
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.describeError(
        this.t(
          reason === "image-add" ? "图片新增后的笔记优先同步失败" : "图片删除后的笔记优先同步失败",
          reason === "image-add" ? "Priority note sync after image add failed" : "Priority note sync after image removal failed",
        ),
        error,
      );
      await this.savePluginState();
      this.schedulePriorityNoteSync(notePath, reason);
    } finally {
      this.priorityNoteSyncsInFlight.delete(notePath);
    }
  }


  private async buildUploadReplacements(content: string, noteFile: TFile, uploadCache?: Map<string, string>) {
    const seen = new Map<string, UploadRewrite>();
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
          sourceFile: file,
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
              rewritten: this.imageSupport.buildSecureImageMarkup(remoteUrl, altText),
            });
          } catch (e: any) {
            console.warn(`[secure-webdav-images] 跳过失败的远程图片 ${rawLink}`, e?.message);
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
          sourceFile: file,
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
          rewritten: this.imageSupport.buildSecureImageMarkup(remoteUrl, altText),
        });
      } catch (e: any) {
        console.warn(`[secure-webdav-images] 跳过失败的远程图片 ${rawLink}`, e?.message);
      }
    }

    return [...seen.values()];
  }

  private extractMarkdownAltText(markdownImage: string) {
    const match = markdownImage.match(/^!\[([^\]]*)\]/);
    return match?.[1]?.trim() ?? "";
  }

  private extractHtmlImageAltText(htmlImage: string) {
    const match = htmlImage.match(/\balt=["']([^"']*)["']/i);
    return match ? this.unescapeHtml(match[1].trim()) : "";
  }

  private isHttpUrl(value: string) {
    return /^https?:\/\//i.test(value);
  }

  private getDisplayNameFromUrl(rawUrl: string) {
    try {
      const url = new URL(rawUrl);
      const fileName = this.sanitizeFileName(url.pathname.split("/").pop() || "");
      if (fileName) {
        return fileName.replace(/\.[^.]+$/, "");
      }
    } catch {
      // Fall through to the generic label below.
    }

    return this.t("网页图片", "Web image");
  }

  private resolveLinkedFile(link: string, sourcePath: string): TFile | null {
    const cleaned = link.replace(/#.*/, "").trim();
    const target = this.app.metadataCache.getFirstLinkpathDest(cleaned, sourcePath);
    return target instanceof TFile ? target : null;
  }

  private isImageFile(file: TFile) {
    return /^(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.extension);
  }

  private async uploadVaultFile(file: TFile, uploadCache?: Map<string, string>) {
    if (uploadCache?.has(file.path)) {
      return uploadCache.get(file.path)!;
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

  private async uploadRemoteImageUrl(imageUrl: string, uploadCache?: Map<string, string>) {
    const cacheKey = `remote:${imageUrl}`;
    if (uploadCache?.has(cacheKey)) {
      return uploadCache.get(cacheKey)!;
    }

    this.ensureConfigured();
    const response = await this.requestUrl({
      url: imageUrl,
      method: "GET",
      followRedirects: true,
    });

    this.assertResponseSuccess(response, "Remote image download");

    const contentType = response.headers["content-type"] ?? "";
    if (!this.isImageContentType(contentType) && !this.looksLikeImageUrl(imageUrl)) {
      throw new Error(this.t("远程链接不是可识别的图片资源。", "The remote URL does not look like an image resource."));
    }

    const fileName = this.buildRemoteSourceFileName(imageUrl, contentType);
    const prepared = await this.prepareUploadPayload(
      response.arrayBuffer,
      this.normalizeImageMimeType(contentType, fileName),
      fileName,
    );
    const remoteName = await this.buildRemoteFileNameFromBinary(prepared.fileName, prepared.binary);
    const remotePath = this.buildRemotePath(remoteName);
    await this.uploadBinary(remotePath, prepared.binary, prepared.mimeType);
    const remoteUrl = `${SECURE_PROTOCOL}//${remotePath}`;
    uploadCache?.set(cacheKey, remoteUrl);
    return remoteUrl;
  }

  private isImageContentType(contentType: string) {
    return /^image\//i.test(contentType.trim());
  }

  private looksLikeImageUrl(rawUrl: string) {
    try {
      const url = new URL(rawUrl);
      return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  private buildRemoteSourceFileName(rawUrl: string, contentType: string) {
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

  private sanitizeFileName(fileName: string) {
    return fileName.replace(/[\\/:*?"<>|]+/g, "-").trim();
  }

  private getExtensionFromMimeType(contentType: string) {
    const mimeType = contentType.split(";")[0].trim().toLowerCase();
    return MIME_MAP[mimeType] ?? "";
  }

  private normalizeImageMimeType(contentType: string, fileName: string) {
    const mimeType = contentType.split(";")[0].trim().toLowerCase();
    if (mimeType && mimeType !== "application/octet-stream") {
      return mimeType;
    }

    return this.getMimeTypeFromFileName(fileName);
  }

  private async uploadBinary(remotePath: string, binary: ArrayBuffer, mimeType: string) {
    await this.ensureRemoteDirectories(remotePath);
    const response = await this.requestUrl({
      url: this.buildUploadUrl(remotePath),
      method: "PUT",
      headers: {
        Authorization: this.buildAuthHeader(),
        "Content-Type": mimeType,
      },
      body: binary,
    });

    this.assertResponseSuccess(response, "Upload");
  }

  private async handleEditorPaste(evt: ClipboardEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) {
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

  private async handleEditorDrop(evt: DragEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) {
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

  private extractImageFileFromClipboard(evt: ClipboardEvent) {
    const direct = Array.from(evt.clipboardData?.files ?? []).find((file) => file.type.startsWith("image/"));
    if (direct) {
      return direct;
    }

    const item = Array.from(evt.clipboardData?.items ?? []).find((entry) => entry.type.startsWith("image/"));
    return item?.getAsFile() ?? null;
  }

  private htmlContainsRemoteImages(html: string) {
    return /<img\b[^>]*src=["']https?:\/\/[^"']+["'][^>]*>/i.test(html);
  }

  private async handleHtmlPasteWithRemoteImages(noteFile: TFile, editor: Editor, html: string) {
    try {
      const rendered = await this.convertHtmlClipboardToSecureMarkdown(html, noteFile);
      if (!rendered.trim()) {
        return;
      }

      editor.replaceSelection(rendered);
      new Notice(this.t("已将网页图文粘贴并抓取远程图片。", "Pasted web content and captured remote images."));
    } catch (error) {
      console.error("Failed to paste HTML content with remote images", error);
      new Notice(
        this.describeError(
          this.t("处理网页图文粘贴失败", "Failed to process pasted web content"),
          error,
        ),
        8000,
      );
    }
  }

  private async convertHtmlClipboardToSecureMarkdown(html: string, noteFile: TFile) {
    const parser = new DOMParser();
    const document = parser.parseFromString(html, "text/html");
    const uploadCache = new Map<string, string>();
    const renderedBlocks: string[] = [];

    for (const node of Array.from(document.body.childNodes)) {
      const block = await this.renderPastedHtmlNode(node, noteFile, uploadCache, 0);
      if (block.trim()) {
        renderedBlocks.push(block.trim());
      }
    }

    return renderedBlocks.join("\n\n") + "\n";
  }

  private async renderPastedHtmlNode(
    node: Node,
    noteFile: TFile,
    uploadCache: Map<string, string>,
    listDepth: number,
  ): Promise<string> {
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
      const items: string[] = [];
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

    const inlineTags = new Set(["strong", "b", "em", "i", "span", "code", "small", "sup", "sub"]);
    if (inlineTags.has(tag)) {
      return (await this.renderPastedHtmlChildren(node, noteFile, uploadCache, listDepth)).join("");
    }

    const blockTags = new Set([
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
      "th",
    ]);
    if (blockTags.has(tag)) {
      const text = (await this.renderPastedHtmlChildren(node, noteFile, uploadCache, listDepth)).join("").trim();
      return text;
    }

    return (await this.renderPastedHtmlChildren(node, noteFile, uploadCache, listDepth)).join("");
  }

  private async renderPastedHtmlChildren(
    element: HTMLElement,
    noteFile: TFile,
    uploadCache: Map<string, string>,
    listDepth: number,
  ) {
    const parts: string[] = [];
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

  private normalizeClipboardText(value: string) {
    return value.replace(/\s+/g, " ");
  }

  private extractImageFileFromDrop(evt: DragEvent) {
    return Array.from(evt.dataTransfer?.files ?? []).find((file) => file.type.startsWith("image/")) ?? null;
  }

  private async enqueueEditorImageUpload(noteFile: TFile, editor: Editor, imageFile: File, fileName: string) {

    await this.uploadQueue.enqueueEditorImageUpload(noteFile, editor, imageFile, fileName);
  }

  async syncConfiguredVaultContent(showNotice = true) {
    if (this.syncInProgress) {
      if (showNotice) {
        new Notice(this.t("同步正在进行中。", "A sync is already in progress."), 4000);
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
        uploaded: 0, restoredFromRemote: 0, downloadedOrUpdated: 0, skipped: 0,
        deletedRemoteFiles: 0, deletedLocalFiles: 0, deletedLocalStubs: 0,
        missingRemoteBackedNotes: 0, purgedMissingLazyNotes: 0,
        deletedRemoteDirectories: 0, createdRemoteDirectories: 0,
        deletedLocalDirectories: 0, createdLocalDirectories: 0,
        evictedNotes: 0,
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
        `已双向同步：上传 ${counts.uploaded} 个文件，从远端拉取 ${counts.restoredFromRemote + counts.downloadedOrUpdated} 个文件，跳过 ${counts.skipped} 个未变化文件，删除远端内容 ${counts.deletedRemoteFiles} 个、本地内容 ${counts.deletedLocalFiles} 个${counts.deletedLocalStubs > 0 ? `（其中失效占位笔记 ${counts.deletedLocalStubs} 篇）` : ""}，${counts.deletedRemoteDirectories > 0 || counts.createdRemoteDirectories > 0 ? `删除远端目录 ${counts.deletedRemoteDirectories} 个、创建远端目录 ${counts.createdRemoteDirectories} 个、` : ""}${counts.deletedLocalDirectories > 0 || counts.createdLocalDirectories > 0 ? `删除本地目录 ${counts.deletedLocalDirectories} 个、创建本地目录 ${counts.createdLocalDirectories} 个、` : ""}${counts.evictedNotes > 0 ? `回收本地旧笔记 ${counts.evictedNotes} 篇、` : ""}${counts.missingRemoteBackedNotes > 0 ? `发现 ${counts.missingRemoteBackedNotes} 篇按需笔记缺少远端正文、` : ""}${counts.purgedMissingLazyNotes > 0 ? `确认清理失效占位笔记 ${counts.purgedMissingLazyNotes} 篇、` : ""}。`.replace(/、。/, "。"),
        `Bidirectional sync uploaded ${counts.uploaded} file(s), pulled ${counts.restoredFromRemote + counts.downloadedOrUpdated} file(s) from remote, skipped ${counts.skipped} unchanged file(s), deleted ${counts.deletedRemoteFiles} remote content file(s) and ${counts.deletedLocalFiles} local file(s)${counts.deletedLocalStubs > 0 ? ` (including ${counts.deletedLocalStubs} stale stub note(s))` : ""}${counts.deletedRemoteDirectories > 0 ? `, deleted ${counts.deletedRemoteDirectories} remote director${counts.deletedRemoteDirectories === 1 ? "y" : "ies"}` : ""}${counts.createdRemoteDirectories > 0 ? `, created ${counts.createdRemoteDirectories} remote director${counts.createdRemoteDirectories === 1 ? "y" : "ies"}` : ""}${counts.deletedLocalDirectories > 0 ? `, deleted ${counts.deletedLocalDirectories} local empty director${counts.deletedLocalDirectories === 1 ? "y" : "ies"}` : ""}${counts.createdLocalDirectories > 0 ? `, created ${counts.createdLocalDirectories} local director${counts.createdLocalDirectories === 1 ? "y" : "ies"}` : ""}${counts.evictedNotes > 0 ? `, and evicted ${counts.evictedNotes} stale local note(s)` : ""}${counts.missingRemoteBackedNotes > 0 ? `, while detecting ${counts.missingRemoteBackedNotes} lazy note(s) missing their remote content` : ""}${counts.purgedMissingLazyNotes > 0 ? `, and purged ${counts.purgedMissingLazyNotes} confirmed broken lazy placeholder(s)` : ""}.`,
      );
      await this.savePluginState();
      if (showNotice) {
        new Notice(this.lastVaultSyncStatus, 8000);
      }
    } catch (error) {
      console.error("Vault content sync failed", error);
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.describeError(this.t("内容同步失败", "Content sync failed"), error);
      await this.savePluginState();
      if (showNotice) {
        new Notice(this.lastVaultSyncStatus, 8000);
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  async syncPendingVaultContent(showNotice = true) {
    if (this.syncInProgress) {
      if (showNotice) {
        new Notice(this.t("同步正在进行中。", "A sync is already in progress."), 4000);
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
        `已快速同步：上传 ${counts.uploaded} 个文件，删除远端内容 ${counts.deletedRemoteFiles} 个，跳过 ${counts.skipped} 个文件。`,
        `Fast sync uploaded ${counts.uploaded} file(s), deleted ${counts.deletedRemoteFiles} remote content file(s), and skipped ${counts.skipped} file(s).`,
      );
      await this.savePluginState();
      if (showNotice) {
        new Notice(this.lastVaultSyncStatus, 6000);
      }
    } catch (error) {
      console.error("Fast vault content sync failed", error);
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.describeError(this.t("快速同步失败", "Fast sync failed"), error);
      await this.savePluginState();
      if (showNotice) {
        new Notice(this.lastVaultSyncStatus, 8000);
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  private async processPendingVaultDeletions(counts: { deletedRemoteFiles: number; skipped: number }) {
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

  private async processPendingVaultUploads(counts: { uploaded: number; skipped: number }) {
    for (const path of [...this.pendingVaultSyncPaths].sort((a, b) => a.localeCompare(b))) {
      if (this.syncSupport.shouldSkipContentSyncPath(path)) {
        this.pendingVaultSyncPaths.delete(path);
        counts.skipped += 1;
        continue;
      }

      const file = this.getVaultFileByPath(path);
      if (!(file instanceof TFile)) {
        this.markPendingVaultDeletion(path);
        this.pendingVaultSyncPaths.delete(path);
        counts.skipped += 1;
        continue;
      }

      const markdownContent = file.extension === "md" ? await this.readMarkdownContentPreferEditor(file) : undefined;
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
        remotePath,
      });
      await this.deleteDeletionTombstone(file.path);
      this.pendingVaultSyncPaths.delete(path);
      counts.uploaded += 1;
    }
  }

  private async reconcileOrphanedSyncEntries(
    remoteFiles: Map<string, RemoteFileState>,
    deletionTombstones: Map<string, DeletionTombstone>,
    counts: { uploaded: number; restoredFromRemote: number; downloadedOrUpdated: number; skipped: number; deletedRemoteFiles: number; deletedLocalFiles: number; deletedLocalStubs: number; missingRemoteBackedNotes: number; purgedMissingLazyNotes: number },
  ) {
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
        remotePath: remote.remotePath,
      });
      counts.restoredFromRemote += 1;
    }
  }

  private async reconcileRemoteOnlyFiles(
    remoteFiles: Map<string, RemoteFileState>,
    deletionTombstones: Map<string, DeletionTombstone>,
    counts: { uploaded: number; restoredFromRemote: number; downloadedOrUpdated: number; skipped: number; deletedRemoteFiles: number; deletedLocalFiles: number; deletedLocalStubs: number; missingRemoteBackedNotes: number; purgedMissingLazyNotes: number },
  ) {
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
        remotePath: remote.remotePath,
      });
      counts.restoredFromRemote += 1;
    }
  }

  private shouldDeleteLocalBecauseRemoteIsMissing(
    previous: SyncIndexEntry | undefined,
    localSignature: string,
    remotePath: string,
  ) {
    return previous?.remotePath === remotePath && previous.localSignature === localSignature;
  }

  private async reconcileLocalFiles(
    remoteFiles: Map<string, RemoteFileState>,
    deletionTombstones: Map<string, DeletionTombstone>,
    counts: { uploaded: number; restoredFromRemote: number; downloadedOrUpdated: number; skipped: number; deletedRemoteFiles: number; deletedLocalFiles: number; deletedLocalStubs: number; missingRemoteBackedNotes: number; purgedMissingLazyNotes: number },
  ): Promise<Set<string>> {
    const files = this.syncSupport.collectVaultContentFiles();
    const localRemotePaths = new Set<string>();

    for (const file of files) {
      const remotePath = this.syncSupport.buildVaultSyncRemotePath(file.path);
      localRemotePaths.add(remotePath);
      const remote = remoteFiles.get(remotePath);
      const remoteSignature = remote?.signature ?? "";
      const previous = this.syncIndex.get(file.path);
      const markdownContent = file.extension === "md" ? await this.readMarkdownContentPreferEditor(file) : null;
      const localSignature = await this.buildCurrentLocalSignature(file, markdownContent ?? undefined);

      if (file.extension === "md") {
        const stub = this.parseNoteStub(markdownContent ?? "");
        if (stub) {
          const stubRemote = remoteFiles.get(stub.remotePath);
          const tombstone = deletionTombstones.get(file.path);
          const resolution = await this.resolveLazyNoteStub(file, stub, stubRemote, tombstone);
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
            remotePath,
          });
          counts.skipped += 1;
          continue;
        }
      }

      const tombstone = deletionTombstones.get(file.path);
      const unchangedSinceLastSync = previous?.remotePath === remotePath && previous.localSignature === localSignature;
      if (tombstone) {
        if (
          unchangedSinceLastSync &&
          this.syncSupport.shouldDeleteLocalFromTombstone(file, tombstone) &&
          this.syncSupport.isTombstoneAuthoritative(tombstone, remote)
        ) {
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
          counts.skipped += 1;
          continue;
        }

        await this.deleteDeletionTombstone(file.path);
        deletionTombstones.delete(file.path);
      }

      if (!remote && this.shouldDeleteLocalBecauseRemoteIsMissing(previous, localSignature, remotePath)) {
        await this.removeLocalVaultFile(file);
        this.syncIndex.delete(file.path);
        counts.deletedLocalFiles += 1;
        continue;
      }

      if (!remote) {
        const uploadedRemote = await this.uploadContentFileToRemote(file, remotePath, markdownContent ?? undefined);
        this.syncIndex.set(file.path, {
          localSignature,
          remoteSignature: uploadedRemote.signature,
          remotePath,
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
            remotePath,
          });
          counts.downloadedOrUpdated += 1;
          continue;
        }

        const uploadedRemote = await this.uploadContentFileToRemote(file, remotePath, markdownContent ?? undefined);
        this.syncIndex.set(file.path, {
          localSignature,
          remoteSignature: uploadedRemote.signature,
          remotePath,
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
          remotePath,
        });
        counts.downloadedOrUpdated += 1;
        continue;
      }

      if (localChanged && !remoteChanged) {
        const uploadedRemote = await this.uploadContentFileToRemote(file, remotePath, markdownContent ?? undefined);
        this.syncIndex.set(file.path, {
          localSignature,
          remoteSignature: uploadedRemote.signature,
          remotePath,
        });
        remoteFiles.set(remotePath, uploadedRemote);
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
          remotePath,
        });
        counts.downloadedOrUpdated += 1;
        continue;
      }

      const uploadedRemote = await this.uploadContentFileToRemote(file, remotePath, markdownContent ?? undefined);
      this.syncIndex.set(file.path, {
        localSignature,
        remoteSignature: uploadedRemote.signature,
        remotePath,
      });
      remoteFiles.set(remotePath, uploadedRemote);
      await this.deleteDeletionTombstone(file.path);
      counts.uploaded += 1;
    }

    return localRemotePaths;
  }

  private async deleteRemoteContentFile(remotePath: string) {
    try {
      const response = await this.requestUrl({
        url: this.buildUploadUrl(remotePath),
        method: "DELETE",
        headers: {
          Authorization: this.buildAuthHeader(),
        },
      });

      if (response.status !== 404 && (response.status < 200 || response.status >= 300)) {
        throw new Error(`DELETE failed with status ${response.status}`);
      }
    } catch (error) {
      console.error("Failed to delete remote synced content", remotePath, error);
      throw error;
    }
  }

  private async writeDeletionTombstone(vaultPath: string, remoteSignature?: string) {
    const payload: DeletionTombstone = {
      path: vaultPath,
      deletedAt: Date.now(),
      remoteSignature,
    };
    await this.uploadBinary(
      this.syncSupport.buildDeletionRemotePath(vaultPath),
      this.encodeUtf8(JSON.stringify(payload)),
      "application/json; charset=utf-8",
    );
  }

  private async deleteDeletionTombstone(vaultPath: string) {
    try {
      await this.deleteRemoteContentFile(this.syncSupport.buildDeletionRemotePath(vaultPath));
    } catch {
      // Tombstone cleanup should not break the main sync flow.
    }
  }

  private async readDeletionTombstone(vaultPath: string) {
    const response = await this.requestUrl({
      url: this.buildUploadUrl(this.syncSupport.buildDeletionRemotePath(vaultPath)),
      method: "GET",
      headers: {
        Authorization: this.buildAuthHeader(),
      },
    });

    if (response.status === 404) {
      return null;
    }
    this.assertResponseSuccess(response, "GET tombstone");

    return this.syncSupport.parseDeletionTombstonePayload(this.decodeUtf8(response.arrayBuffer));
  }

  private async readDeletionTombstones() {
    const tombstones = new Map<string, DeletionTombstone>();
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
          Authorization: this.buildAuthHeader(),
        },
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

  private getVaultFileByPath(path: string) {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }

  private async removeLocalVaultFile(file: TFile) {
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

  private async ensureLocalParentFolders(path: string) {
    const normalized = normalizePath(path);
    const segments = normalized.split("/").filter((value) => value.length > 0);
    if (segments.length <= 1) {
      return;
    }

    let current = "";
    for (let index = 0; index < segments.length - 1; index += 1) {
      current = current ? `${current}/${segments[index]}` : segments[index];
      if (!(await this.app.vault.adapter.exists(current))) {
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

  private async downloadRemoteFileToVault(vaultPath: string, remote: RemoteFileState, existingFile?: TFile) {
    const response = await this.requestUrl({
      url: this.buildUploadUrl(remote.remotePath),
      method: "GET",
      headers: {
        Authorization: this.buildAuthHeader(),
      },
    });
    this.assertResponseSuccess(response, "GET");

    await this.ensureLocalParentFolders(vaultPath);
    const options = {
      mtime: remote.lastModified > 0 ? remote.lastModified : Date.now(),
    };
    const isMd = vaultPath.toLowerCase().endsWith(".md");
    const current =
      existingFile ?? this.getVaultFileByPath(vaultPath) ?? this.app.vault.getAbstractFileByPath(vaultPath);
    if (current && current instanceof TFile) {
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
        if (file && file instanceof TFile) {
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

  private async verifyRemoteBinaryRoundTrip(remotePath: string, expected: ArrayBuffer) {
    const response = await this.requestUrl({
      url: this.buildUploadUrl(remotePath),
      method: "GET",
      headers: {
        Authorization: this.buildAuthHeader(),
      },
    });

    if (response.status < 200 || response.status >= 300) {
      return false;
    }

    return this.arrayBuffersEqual(expected, response.arrayBuffer);
  }

  private async statRemoteFile(remotePath: string) {
    const response = await this.requestUrl({
      url: this.buildUploadUrl(remotePath),
      method: "PROPFIND",
      headers: {
        Authorization: this.buildAuthHeader(),
        Depth: "0",
      },
    });

    if (response.status === 404) {
      return null;
    }
    this.assertResponseSuccess(response, `PROPFIND for ${remotePath}`);

    const xmlText = this.decodeUtf8(response.arrayBuffer);
    const entries = this.parsePropfindDirectoryListing(xmlText, remotePath, true);
    return entries.find((entry) => !entry.isCollection)?.file ?? null;
  }

  private async uploadContentFileToRemote(file: TFile, remotePath: string, markdownContent?: string) {
    let binary: ArrayBuffer;

    if (file.extension === "md") {
      const content = markdownContent ?? (await this.readMarkdownContentPreferEditor(file));
      if (this.parseNoteStub(content)) {
        throw new Error(
          this.t(
            "拒绝把按需加载占位笔记上传为远端正文。",
            "Refusing to upload a lazy-note placeholder as remote note content.",
          ),
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
      signature: this.syncSupport.buildSyncSignature(file),
    };
  }

  private async deleteRemoteSyncedEntry(vaultPath: string) {
    const existing = this.syncIndex.get(vaultPath);
    const remotePath = existing?.remotePath ?? this.syncSupport.buildVaultSyncRemotePath(vaultPath);
    await this.deleteRemoteContentFile(remotePath);
    this.syncIndex.delete(vaultPath);
    await this.savePluginState();
  }

  private async handleFileOpen(file: TFile | null) {
    if (!(file instanceof TFile) || file.extension !== "md") {
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
      const tombstone = !remote ? await this.readDeletionTombstone(file.path) : undefined;
      const resolution = await this.resolveLazyNoteStub(file, stub, remote, tombstone);
      await this.savePluginState();

      if (resolution.action === "deleted") {
        new Notice(
          this.t(
            resolution.purgedMissing
              ? `远端正文连续缺失，已移除本地失效占位笔记：${file.basename}`
              : `远端正文不存在，已移除本地占位笔记：${file.basename}`,
            resolution.purgedMissing
              ? `Remote note was missing repeatedly, removed local broken placeholder: ${file.basename}`
              : `Remote note missing, removed local placeholder: ${file.basename}`,
          ),
          resolution.purgedMissing ? 8000 : 6000,
        );
        return;
      }

      if (resolution.action === "missing") {
        new Notice(this.t("远端正文不存在，当前先保留本地占位笔记以防临时异常；若再次确认缺失，将自动清理该占位。", "Remote note is missing. The local placeholder was kept for now in case this is transient; it will be cleaned automatically if the remote is still missing on the next confirmation."), 8000);
        return;
      }

      new Notice(this.t(`已从远端恢复笔记：${file.basename}`, `Restored note from remote: ${file.basename}`), 6000);
    } catch (error) {
      console.error("Failed to hydrate note from remote", error);
      new Notice(this.describeError(this.t("远端恢复笔记失败", "Failed to restore note from remote"), error), 8000);
    }
  }

  private getOpenMarkdownContent(notePath: string) {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) {
        continue;
      }

      if (!view.file || view.file.path !== notePath) {
        continue;
      }

      return view.editor.getValue();
    }

    return null;
  }

  private async readMarkdownContentPreferEditor(file: TFile) {
    const liveContent = this.getOpenMarkdownContent(file.path);
    if (liveContent !== null) {
      return liveContent;
    }

    return await this.app.vault.read(file);
  }

  private async buildCurrentLocalSignature(file: TFile, markdownContent?: string) {
    if (file.extension !== "md") {
      return this.syncSupport.buildSyncSignature(file);
    }

    const content = markdownContent ?? (await this.readMarkdownContentPreferEditor(file));
    const digest = (await this.computeSha256Hex(this.encodeUtf8(content))).slice(0, 16);
    return `md:${content.length}:${digest}`;
  }

  private async reconcileRemoteImages() {
    return { deletedFiles: 0, deletedDirectories: 0 };
  }

  private markMissingLazyRemote(path: string) {
    const now = Date.now();
    const previous = this.missingLazyRemoteNotes.get(path);
    const next: MissingLazyRemoteRecord = previous
      ? {
          firstDetectedAt: previous.firstDetectedAt,
          lastDetectedAt: now,
          missCount: previous.missCount + 1,
        }
      : {
          firstDetectedAt: now,
          lastDetectedAt: now,
          missCount: 1,
        };
    this.missingLazyRemoteNotes.set(path, next);
    return next;
  }

  private clearMissingLazyRemote(path: string) {
    this.missingLazyRemoteNotes.delete(path);
  }

  /**
   * Shared logic for resolving a lazy-note stub in both handleFileOpen and
   * syncConfiguredVaultContent.  Callers provide the already-looked-up remote
   * state (or null) and an optional tombstone.
   */
  private async resolveLazyNoteStub(
    file: TFile,
    stub: { remotePath: string },
    remote: RemoteFileState | null | undefined,
    tombstone: DeletionTombstone | undefined,
  ): Promise<{ action: "deleted" | "restored" | "missing"; purgedMissing?: boolean }> {
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
      remotePath: stub.remotePath,
    });
    return { action: "restored" };
  }

  private parseNoteStub(content: string) {
    const match = content.match(
      /^<!--\s*secure-webdav-note-stub\s*\r?\nremote:\s*(.+?)\r?\nplaceholder:\s*(.*?)\r?\n-->/s,
    );
    if (!match) {
      return null;
    }

    return {
      remotePath: match[1].trim(),
      placeholder: match[2].trim(),
    };
  }

  private buildNoteStub(file: TFile) {
    const remotePath = this.syncSupport.buildVaultSyncRemotePath(file.path);
    return [
      `<!-- ${SECURE_NOTE_STUB}`,
      `remote: ${remotePath}`,
      `placeholder: ${file.basename}`,
      "-->",
      "",
      this.t(
        `这是一篇按需加载笔记的本地占位文件。打开这篇笔记时，插件会从远端同步目录恢复完整内容。`,
        `This is a local placeholder for an on-demand note. Opening the note restores the full content from the remote sync folder.`,
      ),
    ].join("\n");
  }

  private async evictStaleSyncedNotes(showNotice: boolean) {
    try {
      if (this.settings.noteStorageMode !== "lazy-notes") {
        if (showNotice) {
          new Notice(this.t("当前未启用按需加载笔记模式。", "Lazy note mode is not enabled."), 6000);
        }
        return 0;
      }

      const files = this.syncSupport.collectVaultContentFiles().filter((file) => file.extension === "md");
      const now = Date.now();
      const threshold = Math.max(1, this.settings.noteEvictAfterDays) * 24 * 60 * 60 * 1000;
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
          throw new Error(this.t("远端正文校验失败，已取消回收本地笔记。", "Remote note verification failed, local note eviction was cancelled."));
        }
        const remote = await this.statRemoteFile(remotePath);
        if (!remote) {
          throw new Error(this.t("远端正文元数据缺失，已取消回收本地笔记。", "Remote note metadata is missing, local note eviction was cancelled."));
        }
        await this.app.vault.modify(file, this.buildNoteStub(file));
        const refreshed = this.getVaultFileByPath(file.path);
        this.syncIndex.set(file.path, {
          localSignature: refreshed ? this.syncSupport.buildSyncSignature(refreshed) : this.syncSupport.buildSyncSignature(file),
          remoteSignature: remote?.signature ?? `${file.stat.mtime}:${binary.byteLength}`,
          remotePath,
        });
        evicted += 1;
      }

      if (showNotice) {
        new Notice(
          this.t(
            `已回收 ${evicted} 篇长期未访问的本地笔记。`,
            `Evicted ${evicted} stale local note(s).`,
          ),
          8000,
        );
      }
      await this.savePluginState();
      return evicted;
    } catch (error) {
      console.error("Failed to evict stale synced notes", error);
      if (showNotice) {
        new Notice(this.describeError(this.t("回收本地笔记失败", "Failed to evict local notes"), error), 8000);
      }
      return 0;
    }
  }

  private async ensureRemoteDirectories(remotePath: string) {
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
          Authorization: this.buildAuthHeader(),
        },
      });

      if (![200, 201, 204, 207, 301, 302, 307, 308, 405].includes(response.status)) {
        throw new Error(`MKCOL failed for ${current} with status ${response.status}`);
      }
    }
  }

  private async listRemoteTree(rootFolder: string): Promise<RemoteInventory> {
    const files = new Map<string, RemoteFileState>();
    const directories = new Set<string>();
    const pending = [normalizeFolder(rootFolder)];
    const visited = new Set<string>();

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

  private async listRemoteDirectory(remoteDirectory: string) {
    const requestedPath = normalizeFolder(remoteDirectory);
    const response = await this.requestUrl({
      url: this.buildUploadUrl(requestedPath),
      method: "PROPFIND",
      headers: {
        Authorization: this.buildAuthHeader(),
        Depth: "1",
      },
    });

    if (response.status === 404) {
      return [] as Array<{ remotePath: string; isCollection: boolean; file?: RemoteFileState }>;
    }

    this.assertResponseSuccess(response, `PROPFIND for ${requestedPath}`);

    const xmlText = this.decodeUtf8(response.arrayBuffer);
    return this.parsePropfindDirectoryListing(xmlText, requestedPath);
  }

  private parsePropfindDirectoryListing(xmlText: string, requestedPath: string, includeRequested = false) {
    const parser = new DOMParser();
    const document = parser.parseFromString(xmlText, "application/xml");
    if (document.getElementsByTagName("parsererror").length > 0) {
      throw new Error(this.t("无法解析 WebDAV 目录清单。", "Failed to parse the WebDAV directory listing."));
    }

    const entries = new Map<string, { remotePath: string; isCollection: boolean; file?: RemoteFileState }>();
    for (const element of Array.from(document.getElementsByTagName("*"))) {
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
      if (
        !includeRequested &&
        (
          normalizedPath === requestedPath ||
          normalizedPath === requestedPath.replace(/\/+$/, "")
        )
      ) {
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
        file: isCollection
          ? undefined
          : {
              remotePath: normalizedPath,
              lastModified,
              size,
              signature: this.syncSupport.buildRemoteSyncSignature({
                lastModified,
                size,
              }),
            },
      });
    }

    return [...entries.values()];
  }

  private getXmlLocalNameText(parent: Element, localName: string) {
    for (const element of Array.from(parent.getElementsByTagName("*"))) {
      if (element.localName === localName) {
        return element.textContent?.trim() ?? "";
      }
    }

    return "";
  }

  private xmlTreeHasLocalName(parent: Element, localName: string) {
    return Array.from(parent.getElementsByTagName("*")).some((element) => element.localName === localName);
  }

  private hrefToRemotePath(href: string) {
    const baseUrl = `${this.settings.webdavUrl.replace(/\/+$/, "")}/`;
    const resolved = new URL(href, baseUrl);
    const basePath = new URL(baseUrl).pathname.replace(/\/+$/, "/");
    const decodedPath = this.decodePathname(resolved.pathname);
    if (!decodedPath.startsWith(basePath)) {
      return null;
    }

    return decodedPath.slice(basePath.length).replace(/^\/+/, "");
  }

  private decodePathname(pathname: string) {
    return pathname
      .split("/")
      .map((segment) => {
        if (!segment) {
          return "";
        }

        try {
          return decodeURIComponent(segment);
        } catch {
          return segment;
        }
      })
      .join("/");
  }

  private buildExpectedRemoteDirectories(remoteFilePaths: Set<string>, rootFolder: string) {
    const expected = new Set<string>([normalizeFolder(rootFolder)]);
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

  private async reconcileDirectories(remoteDirectories: Set<string>) {
    const stats = { createdLocal: 0, createdRemote: 0, deletedLocal: 0, deletedRemote: 0 };

    const remoteLocalPaths = new Set<string>();
    for (const remoteDir of remoteDirectories) {
      const localPath = this.syncSupport.remotePathToVaultPath(remoteDir);
      if (localPath !== null && localPath.length > 0 && !this.syncSupport.shouldSkipDirectorySyncPath(localPath)) {
        remoteLocalPaths.add(normalizePath(localPath));
      }
    }

    const localDirPaths = this.syncSupport.collectLocalSyncedDirectories();
    const knownDirPaths = this.syncedDirectories;
    const newSyncedDirs = new Set<string>();

    const localOnly = [...localDirPaths].filter((p) => !remoteLocalPaths.has(p));
    const remoteOnly = [...remoteLocalPaths].filter((p) => !localDirPaths.has(p));

    // Process local-only directories (deepest first for safe deletion)
    for (const dirPath of [...localOnly].sort((a, b) => b.length - a.length)) {
      if (knownDirPaths.has(dirPath)) {
        // Was synced before but gone from remote → another client deleted it
        const folder = this.app.vault.getAbstractFileByPath(dirPath);
        if (folder instanceof TFolder && folder.children.length === 0) {
          try {
            await this.app.vault.delete(folder, true);
            stats.deletedLocal += 1;
          } catch { /* skip if deletion fails */ }
        } else {
          // Non-empty local dir: keep it, files will re-upload on next sync
          newSyncedDirs.add(dirPath);
        }
      } else {
        // New local directory not yet on remote → create on remote
        const remoteDir = normalizeFolder(this.settings.vaultSyncRemoteFolder) + dirPath;
        try {
          await this.ensureRemoteDirectories(remoteDir);
          stats.createdRemote += 1;
        } catch { /* skip if creation fails */ }
        newSyncedDirs.add(dirPath);
      }
    }

    // Both sides exist → keep
    for (const dirPath of localDirPaths) {
      if (remoteLocalPaths.has(dirPath)) {
        newSyncedDirs.add(dirPath);
      }
    }

    // Process remote-only directories (deepest first for safe deletion)
    for (const dirPath of [...remoteOnly].sort((a, b) => b.length - a.length)) {
      if (knownDirPaths.has(dirPath)) {
        // Was synced before but gone locally → this client deleted it
        const remoteDir = normalizeFolder(this.settings.vaultSyncRemoteFolder) + dirPath;
        const response = await this.requestUrl({
          url: this.buildUploadUrl(remoteDir),
          method: "DELETE",
          headers: { Authorization: this.buildAuthHeader() },
        });
        if ([200, 202, 204].includes(response.status)) {
          stats.deletedRemote += 1;
        } else if (![404, 405, 409].includes(response.status)) {
          // Unexpected error → keep tracking to retry next sync
          newSyncedDirs.add(dirPath);
        }
      } else {
        // New remote directory not yet local → create locally
        if (!(await this.app.vault.adapter.exists(dirPath))) {
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

  private async deleteExtraRemoteDirectories(remoteDirectories: Set<string>, expectedDirectories: Set<string>) {
    let deleted = 0;
    const candidates = [...remoteDirectories]
      .filter((remotePath) => !expectedDirectories.has(remotePath))
      .sort((a, b) => b.length - a.length || b.localeCompare(a));

    for (const remotePath of candidates) {
      const response = await this.requestUrl({
        url: this.buildUploadUrl(remotePath),
        method: "DELETE",
        headers: {
          Authorization: this.buildAuthHeader(),
        },
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

  private async processPendingTasks() {

    await this.uploadQueue.processPendingTasks();
  }

  private trackVaultMutation(operation: () => Promise<void>) {
    const promise = operation()
      .catch((error) => {
        console.error("Secure WebDAV vault mutation handling failed", error);
      })
      .finally(() => {
        this.pendingVaultMutationPromises.delete(promise);
      });
    this.pendingVaultMutationPromises.add(promise);
  }

  private async waitForPendingVaultMutations() {
    while (this.pendingVaultMutationPromises.size > 0) {
      await Promise.allSettled([...this.pendingVaultMutationPromises]);
    }
  }

  private async preparePendingUploadsForSync(showNotice: boolean) {

    await this.uploadQueue.processPendingTasks();

    if (this.uploadQueue.hasPendingWork()) {
      this.lastVaultSyncAt = Date.now();
      this.lastVaultSyncStatus = this.t(
        "检测到图片上传仍在进行或等待重试，已暂缓本次笔记同步，避免旧版笔记覆盖新图片引用。",
        "Image uploads are still running or waiting for retry, so note sync was deferred to avoid old note content overwriting new image references.",
      );
      await this.savePluginState();
      if (showNotice) {
        new Notice(this.lastVaultSyncStatus, 8000);
      }
      return false;
    }

    return true;
  }

  private async uploadImagesInNote(noteFile: TFile) {
    try {
      const content = await this.app.vault.read(noteFile);
      const replacements = await this.buildUploadReplacements(content, noteFile);

      if (replacements.length === 0) {
        new Notice(this.t("当前笔记中没有找到本地图片。", "No local images found in the current note."));
        return;
      }

      let updated = content;
      for (const replacement of replacements) {
        updated = updated.split(replacement.original).join(replacement.rewritten);
      }

      if (updated === content) {
        new Notice(this.t("没有需要改写的图片链接。", "No images were rewritten."));
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

      new Notice(this.t(`已上传 ${replacements.length} 张图片到 WebDAV。`, `Uploaded ${replacements.length} image(s) to WebDAV.`));
    } catch (error) {
      console.error("Secure WebDAV upload failed", error);
      new Notice(this.describeError(this.t("上传失败", "Upload failed"), error), 8000);
    }
  }

  private async processTask(task: UploadTask) {

    await this.uploadQueue.processTask(task);
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private unescapeHtml(value: string) {
    return value
      .replace(/&quot;/g, "\"")
      .replace(/&gt;/g, ">")
      .replace(/&lt;/g, "<")
      .replace(/&amp;/g, "&");
  }

  private async fetchSecureImageBlobUrl(remotePath: string) {
    const response = await this.requestUrl({
      url: this.buildUploadUrl(remotePath),
      method: "GET",
      headers: {
        Authorization: this.buildAuthHeader(),
      },
    });

    this.assertResponseSuccess(response, "Fetch secure image");

    const blob = new Blob([response.arrayBuffer], {
      type: response.headers["content-type"] ?? "application/octet-stream",
    });
    const blobUrl = URL.createObjectURL(blob);
    this.evictBlobUrlsIfNeeded();
    this.blobUrls.add(blobUrl);
    return blobUrl;
  }

  private evictBlobUrlsIfNeeded() {
    while (this.blobUrls.size >= this.maxBlobUrls) {
      const oldest = this.blobUrls.values().next().value!;
      this.blobUrls.delete(oldest);
      URL.revokeObjectURL(oldest);
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  private arrayBuffersEqual(left: ArrayBuffer, right: ArrayBuffer) {
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

  private buildClipboardFileName(mimeType: string) {
    const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
    return `pasted-image-${Date.now()}.${extension}`;
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private buildRemotePath(fileName: string) {
    return `${normalizeFolder(this.settings.remoteFolder)}${fileName}`;
  }

  private async buildRemoteFileNameFromBinary(fileName: string, binary: ArrayBuffer) {
    const extension = this.getExtensionFromFileName(fileName);
    if (this.settings.namingStrategy === "hash") {
      const hash = (await this.computeSha256Hex(binary)).slice(0, 16);
      return `${hash}.${extension}`;
    }

    return `${Date.now()}-${fileName}`;
  }

  private buildUploadUrl(remotePath: string) {
    const base = this.settings.webdavUrl.replace(/\/+$/, "");
    return `${base}/${remotePath.split("/").map(encodeURIComponent).join("/")}`;
  }

  private buildAuthHeader() {
    const token = this.arrayBufferToBase64(this.encodeUtf8(`${this.settings.username}:${this.settings.password}`));
    return `Basic ${token}`;
  }

  private ensureConfigured() {
    if (!this.settings.webdavUrl || !this.settings.username || !this.settings.password) {
      throw new Error(this.t("WebDAV 配置不完整。", "WebDAV settings are incomplete."));
    }
  }

  private assertResponseSuccess(response: { status: number }, context: string) {
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`${context} failed with status ${response.status}`);
    }
  }

  private getMimeType(extension: string) {
    return MIME_MAP[extension.toLowerCase()] ?? "application/octet-stream";
  }

  private getMimeTypeFromFileName(fileName: string) {
    return this.getMimeType(this.getExtensionFromFileName(fileName));
  }

  private getExtensionFromFileName(fileName: string) {
    const pieces = fileName.split(".");
    return pieces.length > 1 ? pieces[pieces.length - 1].toLowerCase() : "png";
  }

  private async prepareUploadPayload(binary: ArrayBuffer, mimeType: string, fileName: string) {
    if (!this.settings.compressImages) {
      return { binary, mimeType, fileName };
    }

    const prepared = await this.compressImageIfNeeded(binary, mimeType, fileName);
    return prepared ?? { binary, mimeType, fileName };
  }

  private async compressImageIfNeeded(binary: ArrayBuffer, mimeType: string, fileName: string) {
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
    const compressedBlob = await new Promise<Blob | null>((resolve) => {
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
      fileName: nextFileName,
    };
  }

  private loadImageElement(blob: Blob) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
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

  private extensionFromMimeType(mimeType: string) {
    return MIME_MAP[mimeType] ?? null;
  }

  private async trashIfExists(file: TAbstractFile) {
    try {
      await this.app.vault.trash(file, true);
    } catch (error) {
      console.warn("Failed to trash local image after upload", error);
    }
  }

  private formatEmbedLabel(fileName: string) {
    return this.t(`【安全远程图片｜${fileName}】`, `[Secure remote image | ${fileName}]`);
  }

  private formatFailedLabel(fileName: string) {
    return this.t(`【图片上传失败｜${fileName}】`, `[Image upload failed | ${fileName}]`);
  }

  async migrateAllLegacySecureImages() {
    try {
      const uploadCache = new Map<string, string>();
      const candidateLocalImages = new Map<string, TFile>();
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

        updated = updated
          .replace(
            /<span class="secure-webdav-embed" data-secure-webdav="([^"]+)" aria-label="([^"]*)">.*?<\/span>/g,
            (_match, remotePath: string, alt: string) =>
              this.imageSupport.buildSecureImageCodeBlock(
                this.unescapeHtml(remotePath),
                this.unescapeHtml(alt) || this.unescapeHtml(remotePath),
              ),
          )
          .replace(
            /!\[[^\]]*]\(webdav-secure:\/\/([^)]+)\)/g,
            (_match, remotePath: string) =>
              this.imageSupport.buildSecureImageCodeBlock(this.unescapeHtml(remotePath), this.unescapeHtml(remotePath)),
          );

        if (updated === content) {
          continue;
        }

        await this.app.vault.modify(file, updated);
        changedFiles += 1;
      }

      if (changedFiles === 0) {
        new Notice(
          this.t(
            "整库里没有发现可迁移的旧版安全图片标签。",
            "No legacy secure image tags were found in the vault.",
          ),
        );
        return;
      }

      if (this.settings.deleteLocalAfterUpload) {
        await this.trashMigratedImagesIfSafe(candidateLocalImages);
      }

      new Notice(
      this.t(
        `已迁移 ${changedFiles} 篇笔记到新的安全图片代码块格式。`,
        `Migrated ${changedFiles} note(s) to the new secure image code-block format.`,
      ),
        8000,
      );
    } catch (error) {
      console.error("Failed to migrate secure images to code blocks", error);
      new Notice(this.describeError(this.t("迁移安全图片格式失败", "Failed to migrate secure image format"), error), 8000);
    }
  }

  private async trashMigratedImagesIfSafe(candidateLocalImages: Map<string, TFile>) {
    if (candidateLocalImages.size === 0) {
      return;
    }

    const remainingRefs = new Set<string>();
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
      const probeArrayBuffer = this.encodeUtf8(`secure-webdav probe ${new Date().toISOString()}`);

      const putResponse = await this.requestUrl({
        url: uploadUrl,
        method: "PUT",
        headers: {
          Authorization: this.buildAuthHeader(),
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: probeArrayBuffer,
      });
      if (putResponse.status < 200 || putResponse.status >= 300) {
        throw new Error(`PUT failed with status ${putResponse.status}`);
      }

      const getResponse = await this.requestUrl({
        url: uploadUrl,
        method: "GET",
        headers: {
          Authorization: this.buildAuthHeader(),
        },
      });
      if (getResponse.status < 200 || getResponse.status >= 300) {
        throw new Error(`GET failed with status ${getResponse.status}`);
      }

      const deleteResponse = await this.requestUrl({
        url: uploadUrl,
        method: "DELETE",
        headers: {
          Authorization: this.buildAuthHeader(),
        },
      });
      if (deleteResponse.status < 200 || deleteResponse.status >= 300) {
        throw new Error(`DELETE failed with status ${deleteResponse.status}`);
      }

      const message = this.t(
        `WebDAV 测试通过。PUT ${putResponse.status}，GET ${getResponse.status}，DELETE ${deleteResponse.status}。`,
        `WebDAV test passed. PUT ${putResponse.status}, GET ${getResponse.status}, DELETE ${deleteResponse.status}.`,
      );
      new Notice(message, 6000);
      if (showModal) {
        new ResultModal(this.app, this.t("WebDAV 连接", "WebDAV Connection"), message).open();
      }
      return true;
    } catch (error) {
      console.error("Secure WebDAV test failed", error);
      const message = this.describeError(this.t("WebDAV 测试失败", "WebDAV test failed"), error);
      new Notice(message, 8000);
      if (showModal) {
        new ResultModal(this.app, this.t("WebDAV 连接", "WebDAV Connection"), message).open();
      }
      return false;
    }
  }

  private describeError(prefix: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return `${prefix}: ${message}`;
  }

  private async requestUrl(options: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: ArrayBuffer;
    followRedirects?: boolean;
    redirectCount?: number;
  }): Promise<{ status: number; headers: Record<string, string>; arrayBuffer: ArrayBuffer }> {
    const response = await obsidianRequestUrl({
      url: options.url,
      method: options.method,
      headers: options.headers,
      body: options.body,
      throw: false,
    });

    return {
      status: response.status,
      headers: response.headers,
      arrayBuffer: response.arrayBuffer,
    };
  }

  private encodeUtf8(value: string) {
    const bytes = new TextEncoder().encode(value);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  private decodeUtf8(buffer: ArrayBuffer) {
    return new TextDecoder().decode(buffer);
  }

  private async computeSha256Hex(buffer: ArrayBuffer) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }
}

type UploadRewrite = {
  original: string;
  rewritten: string;
  sourceFile?: TFile;
};

class SecureWebdavSettingTab extends PluginSettingTab {
  plugin: SecureWebdavImagesPlugin;

  constructor(app: App, plugin: SecureWebdavImagesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Secure WebDAV Images" });
    containerEl.createEl("p", {
      text: this.plugin.t(
        "这个插件只把图片剥离到单独的远端目录，并保存为 secure-webdav 自定义代码块；其他笔记和附件按原路径原样同步。",
        "This plugin separates only images into a dedicated remote folder and stores them as secure-webdav custom code blocks. Notes and other attachments are synced as-is with their original paths.",
      ),
    });

    new Setting(containerEl)
      .setName(this.plugin.t("当前插件版本", "Current plugin version"))
      .setDesc(
        this.plugin.t(
          "多端使用时可先核对这里的版本号，避免因为客户端升级不到位导致行为不一致。",
          "Check this version first across devices to avoid inconsistent behavior caused by incomplete upgrades.",
        ),
      )
      .addText((text) => {
        text.setValue(this.plugin.manifest.version);
        text.setDisabled(true);
      });

    containerEl.createEl("h3", { text: this.plugin.t("界面语言", "Interface language") });

    new Setting(containerEl)
      .setName(this.plugin.t("语言", "Language"))
      .setDesc(this.plugin.t("设置页支持自动、中文、英文切换。", "Switch the settings UI between auto, Chinese, and English."))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("auto", this.plugin.t("自动", "Auto"))
          .addOption("zh", "中文")
          .addOption("en", "English")
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value as "auto" | "zh" | "en";
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    containerEl.createEl("h3", { text: this.plugin.t("连接设置", "Connection") });

    new Setting(containerEl)
      .setName(this.plugin.t("WebDAV 基础地址", "WebDAV base URL"))
      .setDesc(this.plugin.t("服务器基础地址，例如：http://your-webdav-host:port", "Base server URL. Example: http://your-webdav-host:port"))
      .addText((text) =>
        text
          .setPlaceholder("http://your-webdav-host:port")
          .setValue(this.plugin.settings.webdavUrl)
          .onChange(async (value) => {
            this.plugin.settings.webdavUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(this.plugin.t("账号", "Username"))
      .addText((text) =>
        text.setValue(this.plugin.settings.username).onChange(async (value) => {
          this.plugin.settings.username = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(this.plugin.t("密码", "Password"))
      .setDesc(this.plugin.t("默认隐藏，可点击右侧按钮显示或隐藏。", "Hidden by default. Use the button on the right to show or hide it."))
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(this.plugin.settings.password).onChange(async (value) => {
          this.plugin.settings.password = value;
          await this.plugin.saveSettings();
        });
      })
      .addExtraButton((button) => {
        let visible = false;
        button.setIcon("eye");
        button.setTooltip(this.plugin.t("显示密码", "Show password"));
        button.onClick(() => {
          const input = button.extraSettingsEl.parentElement?.querySelector("input");
          if (!(input instanceof HTMLInputElement)) {
            return;
          }

          visible = !visible;
          input.type = visible ? "text" : "password";
          button.setIcon(visible ? "eye-off" : "eye");
          button.setTooltip(this.plugin.t(visible ? "隐藏密码" : "显示密码", visible ? "Hide password" : "Show password"));
        });
      });

    new Setting(containerEl)
      .setName(this.plugin.t("图片远程目录", "Image remote folder"))
      .setDesc(
        this.plugin.t(
          "专门用于存放远程图片的 WebDAV 目录，例如：/remote-images/。图片上传成功后会立即删除本地图片文件。",
          "Dedicated WebDAV folder for remote images, for example: /remote-images/. Local image files are deleted immediately after upload succeeds.",
        ),
      )
      .addText((text) =>
        text.setValue(this.plugin.settings.remoteFolder).onChange(async (value) => {
          this.plugin.settings.remoteFolder = normalizePath(value.trim() || "/remote-images/");
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(this.plugin.t("测试连接", "Test connection"))
      .setDesc(this.plugin.t("使用临时探针文件验证 PUT、GET、DELETE 是否正常。", "Verify PUT, GET, and DELETE using a temporary probe file."))
      .addButton((button) =>
        button.setButtonText(this.plugin.t("开始测试", "Run test")).onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.runConnectionTest(true);
          } finally {
            button.setDisabled(false);
          }
        }),
      );

    containerEl.createEl("h3", { text: this.plugin.t("同步设置", "Sync") });

    new Setting(containerEl)
      .setName(this.plugin.t("远程笔记目录", "Remote notes folder"))
      .setDesc(
        this.plugin.t(
          "用于存放笔记和其他非图片附件原样同步副本的远端目录，例如：/vault-sync/。插件会自动同步整个 vault，并跳过 .obsidian、插件目录和图片文件。",
          "Remote folder used for notes and other non-image attachments synced as-is, for example: /vault-sync/. The plugin syncs the whole vault and automatically skips .obsidian, the plugin directory, and image files.",
        ),
      )
      .addText((text) =>
        text.setValue(this.plugin.settings.vaultSyncRemoteFolder).onChange(async (value) => {
          this.plugin.settings.vaultSyncRemoteFolder = normalizePath(value.trim() || "/vault-sync/");
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(this.plugin.t("不同步目录", "Excluded sync folders"))
      .setDesc(
        this.plugin.t(
          "这些 vault 目录不会被内容同步上传、从远端恢复或进行目录对账。支持逗号或换行分隔，默认：kb。",
          "These vault folders are not uploaded, restored from remote, or reconciled as directories. Separate entries with commas or new lines. Default: kb.",
        ),
      )
      .addTextArea((text) =>
        text
          .setPlaceholder("kb")
          .setValue((this.plugin.settings.excludedSyncFolders ?? []).join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.excludedSyncFolders = value.split(/[,\n]/);
            this.plugin.normalizeEffectiveSettings();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(this.plugin.t("自动同步频率", "Auto sync frequency"))
      .setDesc(
        this.plugin.t(
          "以分钟为单位设置自动同步时间。填 0 表示关闭自动同步。这里的同步是“对账同步”：会检查本地与远端目录差异，补传新增和变更文件，并删除远端多余内容。",
          "Set the automatic sync interval in minutes. Use 0 to turn it off. This is a reconciliation sync: it checks local and remote differences, uploads new or changed files, and removes extra remote content.",
        ),
      )
      .addText((text) =>
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.settings.autoSyncIntervalMinutes))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isNaN(parsed)) {
              this.plugin.settings.autoSyncIntervalMinutes = Math.max(0, parsed);
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName(this.plugin.t("笔记本地保留模式", "Note local retention mode"))
      .setDesc(
        this.plugin.t(
          "完整本地：笔记始终保留在本地。按需加载笔记：长期未访问的 Markdown 笔记会被替换为本地占位文件，打开时再从远端恢复。",
          "Full local: notes always stay local. Lazy notes: stale Markdown notes are replaced with local placeholder files and restored from remote when opened.",
        ),
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("full-local", this.plugin.t("完整本地", "Full local"))
          .addOption("lazy-notes", this.plugin.t("按需加载笔记", "Lazy notes"))
          .setValue(this.plugin.settings.noteStorageMode)
          .onChange(async (value) => {
            this.plugin.settings.noteStorageMode = value as "full-local" | "lazy-notes";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(this.plugin.t("笔记本地回收天数", "Note eviction days"))
      .setDesc(
        this.plugin.t(
          "仅在“按需加载笔记”模式下生效。超过这个天数未打开的 Markdown 笔记，会在同步后被替换为本地占位文件。",
          "Used only in lazy note mode. Markdown notes not opened within this number of days are replaced with local placeholder files after sync.",
        ),
      )
      .addText((text) =>
        text
          .setPlaceholder("30")
          .setValue(String(this.plugin.settings.noteEvictAfterDays))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isNaN(parsed)) {
              this.plugin.settings.noteEvictAfterDays = Math.max(1, parsed);
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName(this.plugin.t("同步状态", "Sync status"))
      .setDesc(
        this.plugin.t(
          `${this.plugin.formatLastSyncLabel()}\n${this.plugin.formatSyncStatusLabel()}\n${this.plugin.t("说明：快速同步只处理本机变更队列；完整对账会扫描本地与远端差异并清理远端冗余内容。图片上传仍由独立队列处理。", "Note: Fast sync only processes locally changed paths. Full reconcile scans local and remote differences and cleans extra remote content. Image uploads continue to be handled by the separate queue.")}`,
          `${this.plugin.formatLastSyncLabel()}\n${this.plugin.formatSyncStatusLabel()}\n${this.plugin.t("说明：快速同步只处理本机变更队列；完整对账会扫描本地与远端差异并清理远端冗余内容。图片上传仍由独立队列处理。", "Note: Fast sync only processes locally changed paths. Full reconcile scans local and remote differences and cleans extra remote content. Image uploads continue to be handled by the separate queue.")}`,
        ),
      )
      .addButton((button) =>
        button.setButtonText(this.plugin.t("快速同步", "Fast sync")).onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.syncPendingVaultContent(true);
            this.display();
          } finally {
            button.setDisabled(false);
          }
        }),
      )
      .addButton((button) =>
        button.setButtonText(this.plugin.t("完整对账", "Full reconcile")).onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.syncConfiguredVaultContent(true);
            this.display();
          } finally {
            button.setDisabled(false);
          }
        }),
      );

    containerEl.createEl("h3", { text: this.plugin.t("一次性工具", "One-time tools") });

    new Setting(containerEl)
      .setName(this.plugin.t("迁移整库原生图片引用", "Migrate native image embeds in vault"))
      .setDesc(
        this.plugin.t(
          "扫描整库所有 Markdown 笔记，把 Obsidian 原生本地图片引用（如 ![]() 和 ![[...]]）上传到远端图片目录，并改写为 secure-webdav 代码块。旧版 span 和早期 webdav-secure 链接也会一并收敛到新格式。",
          "Scan all Markdown notes in the vault, upload native local image embeds (such as ![]() and ![[...]]) to the remote image folder, and rewrite them as secure-webdav code blocks. Legacy span tags and early webdav-secure links are also normalized to the new format.",
        ),
      )
      .addButton((button) =>
        button.setButtonText(this.plugin.t("开始迁移", "Run migration")).onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.migrateAllLegacySecureImages();
          } finally {
            button.setDisabled(false);
          }
        }),
      );
  }
}

class ResultModal extends Modal {
  private readonly titleText: string;
  private readonly bodyText: string;

  constructor(app: App, titleText: string, bodyText: string) {
    super(app);
    this.titleText = titleText;
    this.bodyText = bodyText;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.titleText });
    contentEl.createEl("p", { text: this.bodyText });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
