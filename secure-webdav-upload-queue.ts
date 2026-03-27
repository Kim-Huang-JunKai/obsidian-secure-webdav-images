import { App, Editor, MarkdownView, Notice, TAbstractFile, TFile } from "obsidian";

export type UploadTask = {
  id: string;
  notePath: string;
  placeholder: string;
  mimeType: string;
  fileName: string;
  dataBase64: string;
  attempts: number;
  createdAt: number;
  lastError?: string;
};

type SecureWebdavUploadQueueDeps = {
  app: App;
  t: (zh: string, en: string) => string;
  settings: () => { maxRetryAttempts: number; retryDelaySeconds: number };
  getQueue: () => UploadTask[];
  setQueue: (queue: UploadTask[]) => void;
  savePluginState: () => Promise<void>;
  schedulePriorityNoteSync: (notePath: string, reason: "image-add" | "image-remove") => void;
  requestUrl: (options: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: ArrayBuffer;
    followRedirects?: boolean;
    redirectCount?: number;
  }) => Promise<{ status: number; headers: Record<string, string>; arrayBuffer: ArrayBuffer }>;
  buildUploadUrl: (remotePath: string) => string;
  buildAuthHeader: () => string;
  prepareUploadPayload: (
    binary: ArrayBuffer,
    mimeType: string,
    fileName: string,
  ) => Promise<{ binary: ArrayBuffer; mimeType: string; fileName: string }>;
  buildRemoteFileNameFromBinary: (fileName: string, binary: ArrayBuffer) => Promise<string>;
  buildRemotePath: (fileName: string) => string;
  buildSecureImageMarkup: (remoteUrl: string, alt: string) => string;
  getMimeTypeFromFileName: (fileName: string) => string;
  arrayBufferToBase64: (buffer: ArrayBuffer) => string;
  base64ToArrayBuffer: (base64: string) => ArrayBuffer;
  escapeHtml: (value: string) => string;
  escapeRegExp: (value: string) => string;
  describeError: (prefix: string, error: unknown) => string;
};

// Owns the queued image upload workflow so sync and note logic can stay separate.
export class SecureWebdavUploadQueueSupport {
  private processingTaskIds = new Set<string>();
  private retryTimeouts = new Map<string, number>();
  private pendingTaskPromises = new Map<string, Promise<void>>();

  constructor(private readonly deps: SecureWebdavUploadQueueDeps) {}

  dispose() {
    for (const timeoutId of this.retryTimeouts.values()) {
      window.clearTimeout(timeoutId);
    }
    this.retryTimeouts.clear();
  }

  hasPendingWork() {
    return (
      this.deps.getQueue().length > 0 ||
      this.processingTaskIds.size > 0 ||
      this.pendingTaskPromises.size > 0
    );
  }

  hasPendingWorkForNote(notePath: string) {
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

  async enqueueEditorImageUpload(noteFile: TFile, editor: Editor, imageFile: File, fileName: string) {
    try {
      const arrayBuffer = await imageFile.arrayBuffer();
      const task = this.createUploadTask(
        noteFile.path,
        arrayBuffer,
        imageFile.type || this.deps.getMimeTypeFromFileName(fileName),
        fileName,
      );
      this.insertPlaceholder(editor, task.placeholder);
      this.deps.setQueue([...this.deps.getQueue(), task]);
      await this.deps.savePluginState();
      void this.processPendingTasks();
      new Notice(this.deps.t("已加入图片自动上传队列。", "Image added to the auto-upload queue."));
    } catch (error) {
      console.error("Failed to queue secure image upload", error);
      new Notice(
        this.deps.describeError(
          this.deps.t("加入图片自动上传队列失败", "Failed to queue image for auto-upload"),
          error,
        ),
        8000,
      );
    }
  }

  createUploadTask(notePath: string, binary: ArrayBuffer, mimeType: string, fileName: string): UploadTask {
    const id = `secure-webdav-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      id,
      notePath,
      placeholder: this.buildPendingPlaceholder(id, fileName),
      mimeType,
      fileName,
      dataBase64: this.deps.arrayBufferToBase64(binary),
      attempts: 0,
      createdAt: Date.now(),
    };
  }

  buildPendingPlaceholder(taskId: string, fileName: string) {
    const safeName = this.deps.escapeHtml(fileName);
    return `<span class="secure-webdav-pending" data-secure-webdav-task="${taskId}" aria-label="${safeName}">${this.deps.escapeHtml(this.deps.t(`【图片上传中｜${fileName}】`, `[Uploading image | ${fileName}]`))}</span>`;
  }

  buildFailedPlaceholder(fileName: string, message?: string) {
    const safeName = this.deps.escapeHtml(fileName);
    const safeMessage = this.deps.escapeHtml(message ?? this.deps.t("未知错误", "Unknown error"));
    const label = this.deps.escapeHtml(this.deps.t(`【图片上传失败｜${fileName}】`, `[Image upload failed | ${fileName}]`));
    return `<span class="secure-webdav-failed" aria-label="${safeName}">${label}: ${safeMessage}</span>`;
  }

  async processPendingTasks() {
    const running: Promise<void>[] = [];
    for (const task of this.deps.getQueue()) {
      if (this.processingTaskIds.has(task.id)) {
        continue;
      }

      running.push(this.startPendingTask(task));
    }

    await Promise.allSettled(running);
  }

  startPendingTask(task: UploadTask) {
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

  async processTask(task: UploadTask) {
    this.processingTaskIds.add(task.id);
    try {
      const binary = this.deps.base64ToArrayBuffer(task.dataBase64);
      const prepared = await this.deps.prepareUploadPayload(
        binary,
        task.mimeType || this.deps.getMimeTypeFromFileName(task.fileName),
        task.fileName,
      );
      const remoteName = await this.deps.buildRemoteFileNameFromBinary(prepared.fileName, prepared.binary);
      const remotePath = this.deps.buildRemotePath(remoteName);
      const response = await this.deps.requestUrl({
        url: this.deps.buildUploadUrl(remotePath),
        method: "PUT",
        headers: {
          Authorization: this.deps.buildAuthHeader(),
          "Content-Type": prepared.mimeType,
        },
        body: prepared.binary,
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      const replaced = await this.replacePlaceholder(
        task.notePath,
        task.id,
        task.placeholder,
        this.deps.buildSecureImageMarkup(`webdav-secure://${remotePath}`, prepared.fileName),
      );
      if (!replaced) {
        throw new Error(
          this.deps.t(
            "上传成功，但没有在笔记中找到可替换的占位符。",
            "Upload succeeded, but no matching placeholder was found in the note.",
          ),
        );
      }

      this.deps.setQueue(this.deps.getQueue().filter((item) => item.id !== task.id));
      await this.deps.savePluginState();
      this.deps.schedulePriorityNoteSync(task.notePath, "image-add");
      new Notice(this.deps.t("图片上传成功。", "Image uploaded successfully."));
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
          this.buildFailedPlaceholder(task.fileName, task.lastError),
        );
        this.deps.setQueue(this.deps.getQueue().filter((item) => item.id !== task.id));
        await this.deps.savePluginState();
        new Notice(this.deps.describeError(this.deps.t("图片上传最终失败", "Image upload failed permanently"), error), 8000);
      } else {
        this.scheduleRetry(task);
      }
    } finally {
      this.processingTaskIds.delete(task.id);
    }
  }

  scheduleRetry(task: UploadTask) {
    const existing = this.retryTimeouts.get(task.id);
    if (existing) {
      window.clearTimeout(existing);
    }

    const delay = Math.max(1, this.deps.settings().retryDelaySeconds) * 1000 * task.attempts;
    const timeoutId = window.setTimeout(() => {
      this.retryTimeouts.delete(task.id);
      void this.startPendingTask(task);
    }, delay);
    this.retryTimeouts.set(task.id, timeoutId);
  }

  private insertPlaceholder(editor: Editor, placeholder: string) {
    editor.replaceSelection(`${placeholder}\n`);
  }

  async replacePlaceholder(notePath: string, taskId: string, placeholder: string, replacement: string) {
    const replacedInEditor = this.replacePlaceholderInOpenEditors(notePath, taskId, placeholder, replacement);
    if (replacedInEditor) {
      return true;
    }

    const file = this.deps.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) {
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
      "s",
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

  private replacePlaceholderInOpenEditors(notePath: string, taskId: string, placeholder: string, replacement: string) {
    let replaced = false;
    const leaves = this.deps.app.workspace.getLeavesOfType("markdown");

    for (const leaf of leaves) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) {
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
          "s",
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
}
