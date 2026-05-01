const assert = require("assert");
const Module = require("module");
const { createMockObsidianModule, createMockApp, createMarkdownLeaf, Editor, Notice } = require("./support/mock-obsidian.cjs");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadPluginClass(requestUrlHandler) {
  const mockObsidian = createMockObsidianModule(requestUrlHandler);
  const originalLoad = Module._load;

  Object.assign(global, {
    App: mockObsidian.App,
    Editor: mockObsidian.Editor,
    MarkdownFileInfo: mockObsidian.MarkdownFileInfo,
    MarkdownRenderChild: mockObsidian.MarkdownRenderChild,
    MarkdownView: mockObsidian.MarkdownView,
    MarkdownPostProcessorContext: mockObsidian.MarkdownPostProcessorContext,
    Modal: mockObsidian.Modal,
    Notice: mockObsidian.Notice,
    Plugin: mockObsidian.Plugin,
    PluginSettingTab: mockObsidian.PluginSettingTab,
    Setting: mockObsidian.Setting,
    TAbstractFile: mockObsidian.TAbstractFile,
    TFile: mockObsidian.TFile,
    TFolder: mockObsidian.TFolder,
    window: {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
    },
  });

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "obsidian") {
      return mockObsidian;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const mainPath = require.resolve("../main.js");
    delete require.cache[mainPath];
    const pluginModule = require(mainPath);
    return pluginModule.default;
  } finally {
    Module._load = originalLoad;
  }
}

function createHarness(requestUrlHandler) {
  const PluginClass = loadPluginClass(requestUrlHandler);
  const plugin = new PluginClass();
  const app = createMockApp();
  plugin.app = app;
  plugin.savePluginState = async () => {};
  plugin.loadPluginState = async () => {};
  plugin.settings = {
    ...plugin.settings,
    webdavUrl: "http://mock-webdav",
    username: "user",
    password: "pass",
    remoteFolder: "/remote-images/",
    vaultSyncRemoteFolder: "/vault-sync/",
    compressImages: false,
    autoSyncIntervalMinutes: 0,
  };
  plugin.normalizeEffectiveSettings();
  plugin.initializeSupportModules();
  plugin.schedulePriorityNoteSync = () => {};
  plugin.uploadQueue.deps.schedulePriorityNoteSync = () => {};
  return { plugin, app };
}

function installMarkdownLeaf(app, file, editor) {
  app.workspace.leaves = [createMarkdownLeaf(file, editor)];
  app.workspace.activeFile = file;
}

function createRemoteFileState(remotePath, body, lastModified = Date.now()) {
  const binary = body instanceof ArrayBuffer ? body.slice(0) : new TextEncoder().encode(String(body)).buffer;
  return {
    remotePath,
    lastModified,
    size: binary.byteLength,
    signature: `${lastModified}:${binary.byteLength}`,
    body: binary,
  };
}

async function testPlaceholderReplacement() {
  const calls = [];
  const { plugin, app } = createHarness(async (options) => {
    calls.push(options);
    return { status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) };
  });

  const file = app.vault.addFile("Notes/test.md", "before", { mtime: 1000 });
  const editor = new Editor("intro\n");
  const task = plugin.uploadQueue.createUploadTask(file.path, new TextEncoder().encode("image-bytes").buffer, "image/png", "sample.png");
  editor.setValue(`intro\n${task.placeholder}\nend\n`);
  installMarkdownLeaf(app, file, editor);
  plugin.queue = [task];

  await plugin.uploadQueue.processTask(task);

  assert.equal(calls.length, 1, "upload should call PUT once");
  assert.equal(calls[0].method, "PUT", "upload should use PUT");
  const content = editor.getValue();
  assert.ok(!content.includes(task.placeholder), "placeholder should be replaced");
  assert.ok(content.includes("```secure-webdav"), "replacement should use secure-webdav code block");
  assert.ok(content.includes("path:"), "code block should contain path");
  assert.ok(content.includes("alt:"), "code block should contain alt");
  assert.equal(plugin.queue.length, 0, "queue item should be removed after success");
}

async function testImageSupportBlockRoundTrip() {
  const { plugin } = createHarness(async () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }));
  const markup = plugin.imageSupport.buildSecureImageMarkup("webdav-secure://remote-images/example.webp", "Example image");

  assert.ok(markup.includes("```secure-webdav"), "secure image markup should use the custom code block");
  assert.ok(markup.includes("path: remote-images/example.webp"), "secure image markup should keep the remote path");
  assert.ok(markup.includes("alt: Example image"), "secure image markup should keep alt text");

  const parsed = plugin.imageSupport.parseSecureImageBlock("path: remote-images/example.webp\nalt: Example image");
  assert.deepEqual(parsed, { path: "remote-images/example.webp", alt: "Example image" });

  const passthrough = plugin.imageSupport.buildSecureImageMarkup("https://example.com/image.png", "External");
  assert.equal(passthrough, "![](https://example.com/image.png)", "non secure URLs should pass through");
}

async function testSyncWaitsForImageQueue() {
  const { plugin } = createHarness(async () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }));
  const gate = deferred();
  let started = false;
  const task = plugin.uploadQueue.createUploadTask(
    "Notes/pending.md",
    new TextEncoder().encode("pending").buffer,
    "image/png",
    "pending.png",
  );
  plugin.queue = [task];
  plugin.uploadQueue.processTask = async () => {
    started = true;
    await gate.promise;
  };

  const syncPromise = plugin.syncConfiguredVaultContent(false);
  await delay(20);
  assert.ok(started, "sync should start pending upload before proceeding");

  let settled = false;
  syncPromise.then(() => {
    settled = true;
  });
  await delay(40);
  assert.equal(settled, false, "sync should wait for the image queue to settle");

  gate.resolve();
  await syncPromise;
  assert.ok(plugin.lastVaultSyncStatus.length > 0, "sync should leave a status message after deferring note sync");
}

async function testQueueDedupesActiveTask() {
  const { plugin } = createHarness(async () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }));
  const gate = deferred();
  let starts = 0;
  const task = plugin.uploadQueue.createUploadTask(
    "Notes/dedup.md",
    new TextEncoder().encode("dedupe").buffer,
    "image/png",
    "dedupe.png",
  );
  plugin.queue = [task];
  plugin.uploadQueue.processTask = async (incomingTask) => {
    starts += 1;
    assert.equal(incomingTask.id, task.id, "the same task should be reused while it is still running");
    await gate.promise;
  };

  const firstPass = plugin.uploadQueue.processPendingTasks();
  await delay(20);
  const secondPass = plugin.uploadQueue.processPendingTasks();
  await delay(20);

  assert.equal(starts, 1, "pending task should only start once even if the queue is processed twice");

  gate.resolve();
  await Promise.all([firstPass, secondPass]);
}

async function testPermanentUploadFailureRewritesPlaceholder() {
  const calls = [];
  const { plugin, app } = createHarness(async (options) => {
    calls.push(options);
    return { status: 500, headers: {}, arrayBuffer: new ArrayBuffer(0) };
  });
  plugin.settings.maxRetryAttempts = 1;

  const file = app.vault.addFile("Notes/failure.md", "before", { mtime: 1000 });
  const editor = new Editor("intro\n");
  const task = plugin.uploadQueue.createUploadTask(
    file.path,
    new TextEncoder().encode("broken-image").buffer,
    "image/png",
    "broken.png",
  );
  editor.setValue(`intro\n${task.placeholder}\nend\n`);
  installMarkdownLeaf(app, file, editor);
  plugin.queue = [task];

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await plugin.uploadQueue.processTask(task);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(calls.length, 1, "failed upload should still attempt the remote PUT once");
  assert.ok(!editor.getValue().includes(task.placeholder), "failed placeholder should replace the pending marker");
  assert.ok(editor.getValue().includes("secure-webdav-failed"), "permanent failure should render the failed placeholder");
  assert.ok(editor.getValue().includes("broken.png"), "failed placeholder should keep the image name");
  assert.ok(editor.getValue().includes("500"), "failed placeholder should include the failure reason");
  assert.equal(plugin.queue.length, 0, "permanent failure should remove the task from the queue");
}

async function testLazyStubRefusesUpload() {
  let requestCalls = 0;
  const { plugin, app } = createHarness(async () => {
    requestCalls += 1;
    return { status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) };
  });
  const file = app.vault.addFile("Notes/lazy.md", "", { mtime: 1000 });
  const stub = [
    "<!-- secure-webdav-note-stub",
    "remote: vault-sync/Notes/lazy.md",
    "placeholder: lazy",
    "-->",
    "",
    "This is a local placeholder.",
  ].join("\n");

  await assert.rejects(
    () => plugin.uploadContentFileToRemote(file, plugin.syncSupport.buildVaultSyncRemotePath("Notes/lazy.md"), stub),
    /Refusing to upload a lazy-note placeholder|拒绝把按需加载占位笔记上传为远端正文/,
  );
  assert.equal(requestCalls, 0, "lazy placeholder should never reach remote upload");
}

async function testRenameDoesNotRestoreOldPath() {
  const remoteStore = new Map();
  const { plugin, app } = createHarness(async (options) => {
    const { url, method, body } = options;

    if (method === "PUT") {
      remoteStore.set(url, { body: body ? body.slice(0) : new ArrayBuffer(0) });
      return { status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) };
    }

    if (method === "DELETE") {
      remoteStore.delete(url);
      return { status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) };
    }

    if (method === "GET") {
      const record = remoteStore.get(url);
      if (!record) {
        return { status: 404, headers: {}, arrayBuffer: new ArrayBuffer(0) };
      }

      return { status: 200, headers: {}, arrayBuffer: record.body };
    }

    return { status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) };
  });

  const oldPath = "Notes/old-title.md";
  const newPath = "Notes/new-title.md";
  const newFile = app.vault.addFile(newPath, "fresh content", { mtime: 2000 });
  const oldRemotePath = plugin.syncSupport.buildVaultSyncRemotePath(oldPath);
  const newRemotePath = plugin.syncSupport.buildVaultSyncRemotePath(newPath);
  const newLocalSignature = await plugin.buildCurrentLocalSignature(newFile, "fresh content");

  plugin.syncIndex.set(oldPath, {
    localSignature: "md:old",
    remoteSignature: "sig-old",
    remotePath: oldRemotePath,
  });
  plugin.uploadContentFileToRemote = async (incomingFile, incomingRemotePath, markdownContent) => {
    const content = markdownContent ?? (await plugin.readMarkdownContentPreferEditor(incomingFile));
    remoteStore.set(plugin.buildUploadUrl(incomingRemotePath), {
      body: new TextEncoder().encode(content).buffer,
    });
    return createRemoteFileState(incomingRemotePath, content, incomingFile.stat.mtime);
  };
  plugin.uploadQueue.deps.schedulePriorityNoteSync = () => {};

  await plugin.handleVaultRename(newFile, oldPath);
  await plugin.syncPendingVaultContent(false);
  const tombstonePath = plugin.syncSupport.buildDeletionRemotePath(oldPath);
  const tombstoneUrl = plugin.buildUploadUrl(tombstonePath);
  assert.ok(remoteStore.has(tombstoneUrl), "rename should write a remote tombstone");

  plugin.readDeletionTombstones = async () =>
    new Map([
      [
        oldPath,
        {
          path: oldPath,
          deletedAt: Date.now(),
          remoteSignature: "sig-old",
        },
      ],
    ]);
  plugin.listRemoteTree = async () => ({
    files: new Map([
      [oldRemotePath, { remotePath: oldRemotePath, lastModified: 1000, size: 16, signature: "sig-old" }],
      [newRemotePath, { remotePath: newRemotePath, lastModified: 2000, size: 13, signature: newLocalSignature }],
    ]),
    directories: new Set([plugin.normalizeFolder(plugin.settings.vaultSyncRemoteFolder)]),
  });

  const downloadedPaths = [];
  const originalDownload = plugin.downloadRemoteFileToVault.bind(plugin);
  plugin.downloadRemoteFileToVault = async (vaultPath, remote, existingFile) => {
    downloadedPaths.push(vaultPath);
    if (vaultPath === oldPath) {
      throw new Error("old path should not be restored");
    }

    return originalDownload(vaultPath, remote, existingFile);
  };

  const deletedRemotePaths = [];
  const originalDeleteRemote = plugin.deleteRemoteContentFile.bind(plugin);
  plugin.deleteRemoteContentFile = async (remotePath) => {
    deletedRemotePaths.push(remotePath);
    return originalDeleteRemote(remotePath);
  };

  await plugin.syncConfiguredVaultContent(false);

  assert.ok(deletedRemotePaths.includes(oldRemotePath), "sync should delete the old remote path");
  assert.ok(!downloadedPaths.includes(oldPath), "old renamed path should not return locally");
  assert.equal(app.vault.getAbstractFileByPath(oldPath), null, "old renamed path should stay absent locally");
  assert.ok(app.vault.getAbstractFileByPath(newPath), "new renamed path should remain locally");
  assert.ok(remoteStore.has(tombstoneUrl), "tombstone should remain stored in the mock remote");
}

async function testPriorityRenameSyncPushesMoveImmediately() {
  const remoteStore = new Map();
  const { plugin, app } = createHarness(async (options) => {
    const { url, method, body } = options;

    if (method === "PUT") {
      remoteStore.set(url, { body: body ? body.slice(0) : new ArrayBuffer(0) });
      return { status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) };
    }

    if (method === "DELETE") {
      remoteStore.delete(url);
      return { status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) };
    }

    if (method === "GET") {
      const record = remoteStore.get(url);
      if (!record) {
        return { status: 404, headers: {}, arrayBuffer: new ArrayBuffer(0) };
      }

      return { status: 200, headers: {}, arrayBuffer: record.body };
    }

    return { status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) };
  });

  const oldPath = "Notes/old.md";
  const newPath = "Notes/NewGroup/new.md";
  const newFile = app.vault.addFile(newPath, "fresh content", { mtime: 2000 });
  const oldRemotePath = plugin.syncSupport.buildVaultSyncRemotePath(oldPath);
  const newRemotePath = plugin.syncSupport.buildVaultSyncRemotePath(newPath);
  remoteStore.set(plugin.buildUploadUrl(oldRemotePath), {
    body: new TextEncoder().encode("fresh content").buffer,
  });

  plugin.syncIndex.set(oldPath, {
    localSignature: "md:old",
    remoteSignature: "sig-old",
    remotePath: oldRemotePath,
  });

  await plugin.handleVaultRename(newFile, oldPath);
  await plugin.flushPriorityRenameSync(oldPath);

  assert.ok(!remoteStore.has(plugin.buildUploadUrl(oldRemotePath)), "priority rename sync should delete the stale old remote path");
  assert.ok(remoteStore.has(plugin.buildUploadUrl(newRemotePath)), "priority rename sync should upload the moved file to the new remote path");
  assert.ok(remoteStore.has(plugin.buildUploadUrl(plugin.syncSupport.buildDeletionRemotePath(oldPath))), "priority rename sync should write a tombstone for the old path");
  assert.equal(plugin.pendingVaultRenamePaths.size, 0, "priority rename sync should clear the pending rename entry");
  assert.equal(plugin.pendingVaultDeletionPaths.size, 0, "priority rename sync should consume the stale deletion queue entry");
  assert.equal(plugin.syncIndex.get(newPath)?.remotePath, newRemotePath, "priority rename sync should refresh the sync index for the new path");
}

async function testFullSyncRenameDoesNotRestoreOldPath() {
  const remoteStore = new Map();
  const { plugin, app } = createHarness(async (options) => {
    const { url, method, body } = options;

    if (method === "PUT") {
      remoteStore.set(url, { body: body ? body.slice(0) : new ArrayBuffer(0) });
      return { status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) };
    }

    if (method === "DELETE") {
      remoteStore.delete(url);
      return { status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) };
    }

    if (method === "GET") {
      const record = remoteStore.get(url);
      if (!record) {
        return { status: 404, headers: {}, arrayBuffer: new ArrayBuffer(0) };
      }

      return { status: 200, headers: {}, arrayBuffer: record.body };
    }

    return { status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) };
  });

  const oldPath = "Notes/old-folder.md";
  const newPath = "Notes/NewGroup/new-folder.md";
  const newFile = app.vault.addFile(newPath, "fresh content", { mtime: 2000 });
  await app.vault.createFolder("Notes");
  await app.vault.createFolder("Notes/NewGroup");

  const oldRemotePath = plugin.syncSupport.buildVaultSyncRemotePath(oldPath);
  const newRemotePath = plugin.syncSupport.buildVaultSyncRemotePath(newPath);
  const oldRemoteUrl = plugin.buildUploadUrl(oldRemotePath);
  remoteStore.set(oldRemoteUrl, { body: new TextEncoder().encode("fresh content").buffer });

  plugin.syncIndex.set(oldPath, {
    localSignature: "md:old",
    remoteSignature: "sig-old",
    remotePath: oldRemotePath,
  });
  plugin.listRemoteTree = async () => {
    const files = new Map();
    if (remoteStore.has(oldRemoteUrl)) {
      files.set(oldRemotePath, {
        remotePath: oldRemotePath,
        lastModified: 1000,
        size: 13,
        signature: "sig-old",
      });
    }
    return {
      files,
      directories: new Set([plugin.normalizeFolder(plugin.settings.vaultSyncRemoteFolder)]),
    };
  };
  plugin.readDeletionTombstones = async () => new Map();
  plugin.reconcileDirectories = async () => ({ createdLocal: 0, createdRemote: 0, deletedLocal: 0, deletedRemote: 0 });
  plugin.reconcileRemoteImages = async () => ({ deletedFiles: 0, deletedDirectories: 0 });
  plugin.evictStaleSyncedNotes = async () => 0;
  plugin.uploadContentFileToRemote = async (incomingFile, incomingRemotePath, markdownContent) => {
    const content = markdownContent ?? (await plugin.readMarkdownContentPreferEditor(incomingFile));
    remoteStore.set(plugin.buildUploadUrl(incomingRemotePath), {
      body: new TextEncoder().encode(content).buffer,
    });
    return createRemoteFileState(incomingRemotePath, content, incomingFile.stat.mtime);
  };

  await plugin.handleVaultRename(newFile, oldPath);

  const downloadedPaths = [];
  plugin.downloadRemoteFileToVault = async (vaultPath) => {
    downloadedPaths.push(vaultPath);
    if (vaultPath === oldPath) {
      throw new Error("old path should not be restored during full sync");
    }
  };

  await plugin.syncConfiguredVaultContent(false);

  assert.ok(!downloadedPaths.includes(oldPath), "full sync should not redownload the renamed old path");
  assert.equal(app.vault.getAbstractFileByPath(oldPath), null, "renamed old path should remain absent locally");
  assert.ok(app.vault.getAbstractFileByPath(newPath), "renamed new path should stay in place locally");
  assert.ok(remoteStore.has(plugin.buildUploadUrl(newRemotePath)), "full sync should upload the renamed file to its new remote path");
  assert.ok(remoteStore.has(plugin.buildUploadUrl(plugin.syncSupport.buildDeletionRemotePath(oldPath))), "full sync should write a tombstone for the renamed old path");
  assert.ok(!remoteStore.has(oldRemoteUrl), "full sync should delete the old remote path before reconciliation");
}

async function testDeletionTombstoneDeletesStaleCopy() {
  const deletedPaths = [];
  const { plugin, app } = createHarness(async () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }));

  const file = app.vault.addFile("Notes/stale.md", "stale body", { mtime: 1000 });
  const remotePath = plugin.syncSupport.buildVaultSyncRemotePath(file.path);
  const remoteState = createRemoteFileState(remotePath, "stale body", 1500);
  const tombstone = {
    path: file.path,
    deletedAt: 2500,
    remoteSignature: remoteState.signature,
  };

  plugin.listRemoteTree = async () => ({
    files: new Map([[remotePath, remoteState]]),
    directories: new Set([plugin.normalizeFolder(plugin.settings.vaultSyncRemoteFolder)]),
  });
  plugin.readDeletionTombstones = async () => new Map([[file.path, tombstone]]);
  plugin.deleteRemoteContentFile = async (remotePathToDelete) => {
    deletedPaths.push(remotePathToDelete);
  };
  plugin.reconcileDirectories = async () => ({ createdLocal: 0, createdRemote: 0, deletedLocal: 0, deletedRemote: 0 });
  plugin.reconcileRemoteImages = async () => ({ deletedFiles: 0, deletedDirectories: 0 });
  plugin.evictStaleSyncedNotes = async () => 0;
  plugin.syncIndex.set(file.path, {
    localSignature: await plugin.buildCurrentLocalSignature(file, "stale body"),
    remoteSignature: remoteState.signature,
    remotePath,
  });

  await plugin.syncConfiguredVaultContent(false);

  assert.equal(app.vault.getAbstractFileByPath(file.path), null, "stale local copy should be removed");
  assert.ok(deletedPaths.includes(remotePath), "matching remote content should be deleted");
  assert.ok(
    !deletedPaths.includes(plugin.syncSupport.buildDeletionRemotePath(file.path)),
    "authoritative tombstone should stay in place after it deletes the stale copy",
  );
  assert.equal(plugin.syncIndex.has(file.path), false, "sync index should drop the deleted note");
}

async function testFreshLocalEditWinsOverTombstone() {
  const deletedPaths = [];
  const uploadedPaths = [];
  const { plugin, app } = createHarness(async () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }));

  const file = app.vault.addFile("Notes/keep.md", "fresh local edit", { mtime: 9000 });
  const remotePath = plugin.syncSupport.buildVaultSyncRemotePath(file.path);
  const remoteState = createRemoteFileState(remotePath, "original remote body", 1500);
  const tombstone = {
    path: file.path,
    deletedAt: 2000,
    remoteSignature: remoteState.signature,
  };

  plugin.listRemoteTree = async () => ({
    files: new Map([[remotePath, remoteState]]),
    directories: new Set([plugin.normalizeFolder(plugin.settings.vaultSyncRemoteFolder)]),
  });
  plugin.readDeletionTombstones = async () => new Map([[file.path, tombstone]]);
  plugin.uploadContentFileToRemote = async (incomingFile, incomingRemotePath, markdownContent) => {
    uploadedPaths.push(incomingRemotePath);
    const content = markdownContent ?? (await plugin.readMarkdownContentPreferEditor(incomingFile));
    const nextRemote = createRemoteFileState(incomingRemotePath, content, incomingFile.stat.mtime);
    remoteState.body = nextRemote.body;
    remoteState.lastModified = nextRemote.lastModified;
    remoteState.size = nextRemote.size;
    remoteState.signature = nextRemote.signature;
    return nextRemote;
  };
  plugin.deleteRemoteContentFile = async (remotePathToDelete) => {
    deletedPaths.push(remotePathToDelete);
  };
  plugin.reconcileDirectories = async () => ({ createdLocal: 0, createdRemote: 0, deletedLocal: 0, deletedRemote: 0 });
  plugin.reconcileRemoteImages = async () => ({ deletedFiles: 0, deletedDirectories: 0 });
  plugin.evictStaleSyncedNotes = async () => 0;
  plugin.syncIndex.set(file.path, {
    localSignature: await plugin.buildCurrentLocalSignature(file, "original remote body"),
    remoteSignature: remoteState.signature,
    remotePath,
  });

  await plugin.syncConfiguredVaultContent(false);

  assert.ok(app.vault.getAbstractFileByPath(file.path), "newer local edit should be preserved");
  assert.ok(deletedPaths.length >= 1, "the tombstone should be cleaned up");
  assert.ok(
    deletedPaths.every((path) => path === plugin.syncSupport.buildDeletionRemotePath(file.path)),
    "only the tombstone should be cleaned up",
  );
  assert.deepEqual(uploadedPaths, [remotePath], "fresh local content should be re-uploaded instead of deleted");
  assert.equal(plugin.syncIndex.get(file.path)?.remotePath, remotePath, "sync index should keep the note mapped to the same remote path");
}

async function testMissingRemotePreservesUnchangedTrackedLocalFile() {
  const uploadedPaths = [];
  const { plugin, app } = createHarness(async () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }));

  const file = app.vault.addFile("Archive/old.md", "old body", { mtime: 1000 });
  const remotePath = plugin.syncSupport.buildVaultSyncRemotePath(file.path);
  const localSignature = await plugin.buildCurrentLocalSignature(file, "old body");

  plugin.syncIndex.set(file.path, {
    localSignature,
    remoteSignature: "remote-old",
    remotePath,
  });
  plugin.listRemoteTree = async () => ({
    files: new Map(),
    directories: new Set([plugin.normalizeFolder(plugin.settings.vaultSyncRemoteFolder)]),
  });
  plugin.readDeletionTombstones = async () => new Map();
  plugin.uploadContentFileToRemote = async (_file, incomingRemotePath) => {
    uploadedPaths.push(incomingRemotePath);
    throw new Error("stale local file should not be uploaded");
  };
  plugin.reconcileDirectories = async () => ({ createdLocal: 0, createdRemote: 0, deletedLocal: 0, deletedRemote: 0 });
  plugin.reconcileRemoteImages = async () => ({ deletedFiles: 0, deletedDirectories: 0 });
  plugin.evictStaleSyncedNotes = async () => 0;

  await plugin.syncConfiguredVaultContent(false);

  assert.ok(app.vault.getAbstractFileByPath(file.path), "missing remote should not delete unchanged local content without a tombstone");
  assert.deepEqual(uploadedPaths, [], "unchanged local copy should not be re-uploaded when remote is missing");
  assert.equal(plugin.syncIndex.has(file.path), true, "sync index should keep the preserved local copy");
}

async function testMissingRemoteUploadsNewLocalFileAfterLastSync() {
  const uploadedPaths = [];
  const { plugin, app } = createHarness(async () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }));

  plugin.lastVaultSyncAt = 1000;
  const file = app.vault.addFile("Archive/new.md", "new body", { mtime: 10000 });
  const remotePath = plugin.syncSupport.buildVaultSyncRemotePath(file.path);

  plugin.listRemoteTree = async () => ({
    files: new Map(),
    directories: new Set([plugin.normalizeFolder(plugin.settings.vaultSyncRemoteFolder)]),
  });
  plugin.readDeletionTombstones = async () => new Map();
  plugin.uploadContentFileToRemote = async (incomingFile, incomingRemotePath, markdownContent) => {
    uploadedPaths.push(incomingRemotePath);
    return createRemoteFileState(incomingRemotePath, markdownContent ?? incomingFile.content ?? "", incomingFile.stat.mtime);
  };
  plugin.reconcileDirectories = async () => ({ createdLocal: 0, createdRemote: 0, deletedLocal: 0, deletedRemote: 0 });
  plugin.reconcileRemoteImages = async () => ({ deletedFiles: 0, deletedDirectories: 0 });
  plugin.evictStaleSyncedNotes = async () => 0;

  await plugin.syncConfiguredVaultContent(false);

  assert.deepEqual(uploadedPaths, [remotePath], "new local file created after the last sync should upload");
  assert.equal(plugin.syncIndex.get(file.path)?.remotePath, remotePath, "sync index should track the uploaded new file");
}

async function testTombstoneDeletesOldLocalWithoutSyncIndex() {
  const uploadedPaths = [];
  const { plugin, app } = createHarness(async () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }));

  const file = app.vault.addFile("Archive/tombstoned.md", "deleted elsewhere", { mtime: 1000 });
  const tombstone = {
    path: file.path,
    deletedAt: 5000,
    remoteSignature: "deleted-remote",
  };

  plugin.listRemoteTree = async () => ({
    files: new Map(),
    directories: new Set([plugin.normalizeFolder(plugin.settings.vaultSyncRemoteFolder)]),
  });
  plugin.readDeletionTombstones = async () => new Map([[file.path, tombstone]]);
  plugin.uploadContentFileToRemote = async (_file, incomingRemotePath) => {
    uploadedPaths.push(incomingRemotePath);
    throw new Error("tombstoned local file should not be uploaded");
  };
  plugin.reconcileDirectories = async () => ({ createdLocal: 0, createdRemote: 0, deletedLocal: 0, deletedRemote: 0 });
  plugin.reconcileRemoteImages = async () => ({ deletedFiles: 0, deletedDirectories: 0 });
  plugin.evictStaleSyncedNotes = async () => 0;

  await plugin.syncConfiguredVaultContent(false);

  assert.ok(app.vault.getAbstractFileByPath(file.path), "local file without sync index should be preserved instead of deleted");
  assert.deepEqual(uploadedPaths, [], "authoritative tombstone should not be overwritten by old local files");
  assert.ok(
    app.vault.getFiles().some((entry) => entry.path.startsWith("Archive/tombstoned.sync-conflict-") && entry.path.endsWith(".md")),
    "tombstone conflict should create a local conflict copy",
  );
}

async function testTombstonePreservesOlderLocalConflict() {
  const uploadedPaths = [];
  const { plugin, app } = createHarness(async () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }));

  const file = app.vault.addFile("Archive/conflict.md", "local body", { mtime: 1000 });
  const remotePath = plugin.syncSupport.buildVaultSyncRemotePath(file.path);
  const tombstone = {
    path: file.path,
    deletedAt: 5000,
    remoteSignature: "deleted-remote",
  };

  plugin.syncIndex.set(file.path, {
    localSignature: "previous-local",
    remoteSignature: "deleted-remote",
    remotePath,
  });
  plugin.listRemoteTree = async () => ({
    files: new Map(),
    directories: new Set([plugin.normalizeFolder(plugin.settings.vaultSyncRemoteFolder)]),
  });
  plugin.readDeletionTombstones = async () => new Map([[file.path, tombstone]]);
  plugin.uploadContentFileToRemote = async (_file, incomingRemotePath) => {
    uploadedPaths.push(incomingRemotePath);
    throw new Error("older local conflict should not be uploaded");
  };
  plugin.reconcileDirectories = async () => ({ createdLocal: 0, createdRemote: 0, deletedLocal: 0, deletedRemote: 0 });
  plugin.reconcileRemoteImages = async () => ({ deletedFiles: 0, deletedDirectories: 0 });
  plugin.evictStaleSyncedNotes = async () => 0;

  await plugin.syncConfiguredVaultContent(false);

  assert.ok(app.vault.getAbstractFileByPath(file.path), "older local conflict should be kept for manual review");
  assert.deepEqual(uploadedPaths, [], "older local conflict should not overwrite the tombstone");
  assert.ok(
    app.vault.getFiles().some((entry) => entry.path.startsWith("Archive/conflict.sync-conflict-") && entry.path.endsWith(".md")),
    "older local tombstone conflict should create a conflict copy",
  );
}

async function testBothSidesChangedCreatesConflictCopy() {
  const uploadedPaths = [];
  const downloadedPaths = [];
  const { plugin, app } = createHarness(async () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }));

  const file = app.vault.addFile("Notes/both.md", "local edit", { mtime: 5000 });
  const remotePath = plugin.syncSupport.buildVaultSyncRemotePath(file.path);
  const remoteState = createRemoteFileState(remotePath, "remote edit", 6000);

  plugin.syncIndex.set(file.path, {
    localSignature: "md:old",
    remoteSignature: "remote-old",
    remotePath,
  });
  plugin.listRemoteTree = async () => ({
    files: new Map([[remotePath, remoteState]]),
    directories: new Set([plugin.normalizeFolder(plugin.settings.vaultSyncRemoteFolder)]),
  });
  plugin.readDeletionTombstones = async () => new Map();
  plugin.uploadContentFileToRemote = async (_file, incomingRemotePath) => {
    uploadedPaths.push(incomingRemotePath);
    throw new Error("both-sided conflict should not upload over remote");
  };
  plugin.downloadRemoteFileToVault = async (vaultPath) => {
    downloadedPaths.push(vaultPath);
    throw new Error("both-sided conflict should not overwrite local");
  };
  plugin.reconcileDirectories = async () => ({ createdLocal: 0, createdRemote: 0, deletedLocal: 0, deletedRemote: 0 });
  plugin.reconcileRemoteImages = async () => ({ deletedFiles: 0, deletedDirectories: 0 });
  plugin.evictStaleSyncedNotes = async () => 0;

  await plugin.syncConfiguredVaultContent(false);

  assert.equal(app.vault.getAbstractFileByPath(file.path)?.content, "local edit", "local edit should stay in place");
  assert.deepEqual(uploadedPaths, [], "both-sided conflict should not upload");
  assert.deepEqual(downloadedPaths, [], "both-sided conflict should not download over local");
  assert.ok(
    app.vault.getFiles().some((entry) => entry.path.startsWith("Notes/both.sync-conflict-") && entry.path.endsWith(".md")),
    "both-sided conflict should create a local conflict copy",
  );
}

async function testFastSyncUploadsPendingAndScannedLocalChanges() {
  const uploadedPaths = [];
  const { plugin, app } = createHarness(async () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }));

  const changedFile = app.vault.addFile("Notes/changed.md", "changed", { mtime: 5000 });
  const unchangedFile = app.vault.addFile("Notes/unchanged.md", "unchanged", { mtime: 5000 });
  const changedRemotePath = plugin.syncSupport.buildVaultSyncRemotePath(changedFile.path);
  const unchangedRemotePath = plugin.syncSupport.buildVaultSyncRemotePath(unchangedFile.path);

  plugin.syncIndex.set(unchangedFile.path, {
    localSignature: await plugin.buildCurrentLocalSignature(unchangedFile, "unchanged"),
    remoteSignature: "unchanged-remote",
    remotePath: unchangedRemotePath,
  });
  plugin.pendingVaultSyncPaths.add(changedFile.path);
  plugin.uploadContentFileToRemote = async (file, remotePath, markdownContent) => {
    uploadedPaths.push(remotePath);
    return createRemoteFileState(remotePath, markdownContent ?? file.content ?? "", file.stat.mtime);
  };
  plugin.deleteDeletionTombstone = async () => {};

  await plugin.syncPendingVaultContent(false);

  assert.deepEqual(uploadedPaths.sort(), [changedRemotePath].sort(), "fast sync should upload queued files from pending set");
  assert.equal(plugin.pendingVaultSyncPaths.size, 0, "successful fast sync should clear uploaded paths");
  assert.equal(plugin.syncIndex.get(changedFile.path)?.remotePath, changedRemotePath, "fast sync should refresh the sync index");
  assert.ok(/快速同步|Fast sync/.test(plugin.lastVaultSyncStatus), "fast sync should leave a fast-sync status");
}

async function testFastSyncUploadsRecentlyTouchedFiles() {
  const uploadedPaths = [];
  const { plugin, app } = createHarness(async () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }));

  const file = app.vault.addFile("Notes/touched.md", "same body", { mtime: 12_000 });
  const remotePath = plugin.syncSupport.buildVaultSyncRemotePath(file.path);
  const localSignature = await plugin.buildCurrentLocalSignature(file, "same body");

  plugin.lastVaultSyncAt = 8_000;
  plugin.syncIndex.set(file.path, {
    localSignature,
    remoteSignature: "remote-old",
    remotePath,
  });
  plugin.pendingVaultSyncPaths.add(file.path);
  plugin.uploadContentFileToRemote = async (incomingFile, incomingRemotePath, markdownContent) => {
    uploadedPaths.push(incomingRemotePath);
    return createRemoteFileState(incomingRemotePath, markdownContent ?? incomingFile.content ?? "", incomingFile.stat.mtime);
  };
  plugin.deleteDeletionTombstone = async () => {};

  await plugin.syncPendingVaultContent(false);

  assert.deepEqual(uploadedPaths, [remotePath], "fast sync should upload files in the pending set");
  assert.equal(plugin.pendingVaultSyncPaths.size, 0, "touched file should clear from pending uploads after sync");
  assert.ok(/快速同步|Fast sync/.test(plugin.lastVaultSyncStatus), "fast sync status should mention fast sync");
}

async function testFastSyncDoesNotConvertMissingUploadToDeletion() {
  const deletedPaths = [];
  const { plugin } = createHarness(async () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }));

  plugin.pendingVaultSyncPaths.add("Notes/missing.md");
  plugin.deleteRemoteContentFile = async (remotePath) => {
    deletedPaths.push(remotePath);
  };

  await plugin.syncPendingVaultContent(false);

  assert.deepEqual(deletedPaths, [], "missing pending upload should not become a remote deletion");
  assert.equal(plugin.pendingVaultDeletionPaths.size, 0, "missing pending upload should not create a deletion tombstone");
}

async function testFastSyncDeletesPendingRemote() {
  const deletedPaths = [];
  const tombstones = [];
  const { plugin } = createHarness(async () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }));
  const vaultPath = "Notes/deleted.md";
  const remotePath = plugin.syncSupport.buildVaultSyncRemotePath(vaultPath);

  plugin.pendingVaultDeletionPaths.set(vaultPath, { remotePath, remoteSignature: "remote-old" });
  plugin.writeDeletionTombstone = async (path, remoteSignature) => {
    tombstones.push({ path, remoteSignature });
  };
  plugin.deleteRemoteContentFile = async (path) => {
    deletedPaths.push(path);
  };

  await plugin.syncPendingVaultContent(false);

  assert.deepEqual(tombstones, [{ path: vaultPath, remoteSignature: "remote-old" }], "fast sync should write a deletion tombstone");
  assert.deepEqual(deletedPaths, [remotePath], "fast sync should delete the queued remote file");
  assert.equal(plugin.pendingVaultDeletionPaths.size, 0, "successful fast sync should clear deletion paths");
}

async function testFastSyncSkipsExcludedPaths() {
  const uploadedPaths = [];
  const { plugin, app } = createHarness(async () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }));

  const excludedFile = app.vault.addFile("kb/raw.md", "local wiki data", { mtime: 5000 });
  plugin.pendingVaultSyncPaths.add(excludedFile.path);
  plugin.uploadContentFileToRemote = async (_file, remotePath) => {
    uploadedPaths.push(remotePath);
    return createRemoteFileState(remotePath, "should not upload");
  };

  await plugin.syncPendingVaultContent(false);

  assert.deepEqual(uploadedPaths, [], "fast sync should not upload excluded folders");
  assert.equal(plugin.pendingVaultSyncPaths.size, 0, "excluded queued paths should be discarded");
}

async function testAutoSyncUsesFullSync() {
  const { plugin } = createHarness(async () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }));
  const calls = [];

  plugin.syncPendingVaultContent = async () => {
    calls.push("fast");
  };
  plugin.syncConfiguredVaultContent = async () => {
    calls.push("full");
  };

  await plugin.runAutoSyncTick();

  assert.deepEqual(calls, ["full"], "auto sync should run full sync instead of fast sync");
}

async function testReconcileDirectoriesPreservesLocalEmptyDir() {
  const mkcolCalls = [];
  const deleteCalls = [];
  const { plugin, app } = createHarness(async (options) => {
    const { url, method } = options;
    if (method === "MKCOL") mkcolCalls.push(url);
    if (method === "DELETE") { deleteCalls.push(url); return { status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }; }
    return { status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) };
  });
  await app.vault.createFolder("Archive");
  plugin.syncedDirectories = new Set(["Archive"]);

  const stats = await plugin.reconcileDirectories(new Set());

  assert.equal(stats.deletedLocal, 0, "directory reconcile should not delete local dirs");
  assert.ok(app.vault.folders.has("Archive"), "Archive folder should remain locally");
  assert.ok(mkcolCalls.length > 0, "local-only dir should be recreated remotely");
}

async function testReconcileDirectoriesCreatesRemoteDir() {
  const mkcolCalls = [];
  const { plugin, app } = createHarness(async (options) => {
    const { url, method } = options;
    if (method === "MKCOL") mkcolCalls.push(url);
    return { status: 201, headers: {}, arrayBuffer: new ArrayBuffer(0) };
  });
  await app.vault.createFolder("NewFolder");
  plugin.syncedDirectories = new Set();

  const stats = await plugin.reconcileDirectories(new Set());

  assert.equal(stats.createdRemote, 1, "should create 1 remote dir");
  assert.ok(mkcolCalls.length > 0, "should call MKCOL");
}

async function testReconcileDirectoriesPreservesRemoteDir() {
  const deleteCalls = [];
  const { plugin, app } = createHarness(async (options) => {
    const { url, method } = options;
    if (method === "DELETE") { deleteCalls.push(url); return { status: 204, headers: {}, arrayBuffer: new ArrayBuffer(0) }; }
    return { status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) };
  });
  plugin.syncedDirectories = new Set(["RemovedFolder"]);
  const rootFolder = plugin.normalizeFolder(plugin.settings.vaultSyncRemoteFolder);
  const remoteDirs = new Set([rootFolder, rootFolder + "RemovedFolder/"]);

  const stats = await plugin.reconcileDirectories(remoteDirs);

  assert.equal(stats.deletedRemote, 0, "directory reconcile should not delete remote dirs");
  assert.equal(stats.createdLocal, 1, "remote-only dir should be recreated locally");
  assert.equal(deleteCalls.length, 0, "remote-only dir should not be deleted");
  assert.ok(app.vault.folders.has("RemovedFolder"), "RemovedFolder should be restored locally");
}

async function testReconcileDirectoriesCreatesLocalDir() {
  const { plugin, app } = createHarness(async () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }));
  plugin.syncedDirectories = new Set();
  const rootFolder = plugin.normalizeFolder(plugin.settings.vaultSyncRemoteFolder);
  const remoteDirs = new Set([rootFolder, rootFolder + "NewFromRemote/"]);

  const stats = await plugin.reconcileDirectories(remoteDirs);

  assert.equal(stats.createdLocal, 1, "should create 1 local dir");
  assert.ok(app.vault.folders.has("NewFromRemote"), "NewFromRemote folder should exist locally");
}

async function testReconcileDirectoriesKeepsNonEmptyLocalDir() {
  const { plugin, app } = createHarness(async () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0) }));
  await app.vault.createFolder("HasFiles");
  app.vault.addFile("HasFiles/note.md", "content", { mtime: Date.now() });
  plugin.syncedDirectories = new Set(["HasFiles"]);

  const stats = await plugin.reconcileDirectories(new Set());

  assert.equal(stats.deletedLocal, 0, "should not delete non-empty dir");
  assert.ok(app.vault.folders.has("HasFiles"), "HasFiles folder should remain locally");
}

async function run() {
  const tests = [
    ["图片上传后占位替换", testPlaceholderReplacement],
    ["图片模块代码块生成与解析", testImageSupportBlockRoundTrip],
    ["同步等待图片队列", testSyncWaitsForImageQueue],
    ["队列不会重复启动同一任务", testQueueDedupesActiveTask],
    ["上传永久失败会清空队列并替换失败占位", testPermanentUploadFailureRewritesPlaceholder],
    ["懒加载占位不会上传成正文", testLazyStubRefusesUpload],
    ["重命名不会恢复旧路径", testRenameDoesNotRestoreOldPath],
    ["重命名：立即优先同步旧路径删除和新路径上传", testPriorityRenameSyncPushesMoveImmediately],
    ["完整同步：重命名后不会把旧路径重新下载回来", testFullSyncRenameDoesNotRestoreOldPath],
    ["墓碑会删除过时本地副本", testDeletionTombstoneDeletesStaleCopy],
    ["本地新修改会覆盖墓碑而不是被误删", testFreshLocalEditWinsOverTombstone],
    ["完整同步：远端缺失时保留未改动本地副本", testMissingRemotePreservesUnchangedTrackedLocalFile],
    ["完整同步：远端缺失时上传上次同步后的新增本地文件", testMissingRemoteUploadsNewLocalFileAfterLastSync],
    ["完整同步：墓碑不会删除没有本地索引的本地正文", testTombstoneDeletesOldLocalWithoutSyncIndex],
    ["完整同步：墓碑遇到更旧本地冲突时保留本地", testTombstonePreservesOlderLocalConflict],
    ["完整同步：本地和远端同时变化时创建冲突副本", testBothSidesChangedCreatesConflictCopy],
    ["目录同步：保留远端缺失的本地空目录", testReconcileDirectoriesPreservesLocalEmptyDir],
    ["快速同步：上传队列文件和扫描到的本地变化", testFastSyncUploadsPendingAndScannedLocalChanges],
    ["快速同步：会补传上次同步后被本地触碰的文件", testFastSyncUploadsRecentlyTouchedFiles],
    ["快速同步：缺失的上传队列项不会变成删除", testFastSyncDoesNotConvertMissingUploadToDeletion],
    ["快速同步：删除队列会写墓碑并删除远端", testFastSyncDeletesPendingRemote],
    ["快速同步：默认跳过 kb 目录", testFastSyncSkipsExcludedPaths],
    ["自动同步：执行完整同步而不是快速同步", testAutoSyncUsesFullSync],
    ["目录同步：新本地目录上传到远端", testReconcileDirectoriesCreatesRemoteDir],
    ["目录同步：保留本地缺失的远端目录", testReconcileDirectoriesPreservesRemoteDir],
    ["目录同步：远端新目录在本地创建", testReconcileDirectoriesCreatesLocalDir],
    ["目录同步：非空本地目录不会被删除", testReconcileDirectoriesKeepsNonEmptyLocalDir],
  ];

  const failures = [];
  for (const [name, testFn] of tests) {
    try {
      Notice.messages.length = 0;
      await testFn();
      console.log(`PASS ${name}`);
    } catch (error) {
      failures.push({ name, error });
      console.error(`FAIL ${name}`);
      console.error(error);
    }
  }

  if (failures.length > 0) {
    process.exitCode = 1;
    console.error(`\n${failures.length} test(s) failed.`);
  } else {
    console.log("\nAll regression tests passed.");
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
