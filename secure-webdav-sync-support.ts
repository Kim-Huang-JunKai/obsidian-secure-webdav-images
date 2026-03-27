import { App, TFile, normalizePath } from "obsidian";

export type DeletionTombstone = {
  path: string;
  deletedAt: number;
  remoteSignature?: string;
};

export type RemoteFileLike = {
  remotePath: string;
  lastModified: number;
  size: number;
  signature: string;
};

type SecureWebdavSyncSupportDeps = {
  app: App;
  getVaultSyncRemoteFolder: () => string;
  deletionFolderSuffix: string;
  encodeBase64Url: (value: string) => string;
  decodeBase64Url: (value: string) => string;
};

// Keep sync metadata and tombstone rules isolated so queue/rendering changes
// do not accidentally affect reconciliation behaviour.
export class SecureWebdavSyncSupport {
  constructor(private readonly deps: SecureWebdavSyncSupportDeps) {}

  shouldSkipContentSyncPath(path: string) {
    const normalizedPath = normalizePath(path);
    if (
      normalizedPath.startsWith(".obsidian/") ||
      normalizedPath.startsWith(".trash/") ||
      normalizedPath.startsWith(".git/") ||
      normalizedPath.startsWith("node_modules/") ||
      normalizedPath.startsWith("_plugin_packages/") ||
      normalizedPath.startsWith(".tmp-") ||
      normalizedPath.startsWith(".obsidian/plugins/secure-webdav-images/")
    ) {
      return true;
    }

    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(normalizedPath);
  }

  collectVaultContentFiles() {
    return this.deps.app.vault
      .getFiles()
      .filter((file) => !this.shouldSkipContentSyncPath(file.path))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  buildSyncSignature(file: TFile) {
    return `${file.stat.mtime}:${file.stat.size}`;
  }

  buildRemoteSyncSignature(remote: Pick<RemoteFileLike, "lastModified" | "size">) {
    return `${remote.lastModified}:${remote.size}`;
  }

  buildVaultSyncRemotePath(vaultPath: string) {
    return `${this.normalizeFolder(this.deps.getVaultSyncRemoteFolder())}${vaultPath}`;
  }

  buildDeletionFolder() {
    return `${this.normalizeFolder(this.deps.getVaultSyncRemoteFolder()).replace(/\/$/, "")}${this.deps.deletionFolderSuffix}`;
  }

  buildDeletionRemotePath(vaultPath: string) {
    return `${this.buildDeletionFolder()}${this.deps.encodeBase64Url(vaultPath)}.json`;
  }

  remoteDeletionPathToVaultPath(remotePath: string) {
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

  parseDeletionTombstonePayload(raw: string): DeletionTombstone | null {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.path !== "string" || typeof parsed.deletedAt !== "number") {
        return null;
      }
      if (parsed.remoteSignature !== undefined && typeof parsed.remoteSignature !== "string") {
        return null;
      }
      return {
        path: parsed.path,
        deletedAt: parsed.deletedAt,
        remoteSignature: parsed.remoteSignature,
      };
    } catch {
      return null;
    }
  }

  remotePathToVaultPath(remotePath: string) {
    const root = this.normalizeFolder(this.deps.getVaultSyncRemoteFolder());
    if (!remotePath.startsWith(root)) {
      return null;
    }

    return remotePath.slice(root.length).replace(/^\/+/, "");
  }

  shouldDownloadRemoteVersion(localMtime: number, remoteMtime: number) {
    return remoteMtime > localMtime + 2000;
  }

  isTombstoneAuthoritative(
    tombstone: DeletionTombstone,
    remote?: Pick<RemoteFileLike, "lastModified" | "signature"> | null,
  ) {
    const graceMs = 5000;
    if (!remote) {
      return true;
    }

    if (tombstone.remoteSignature) {
      return remote.signature === tombstone.remoteSignature;
    }

    return remote.lastModified <= tombstone.deletedAt + graceMs;
  }

  shouldDeleteLocalFromTombstone(file: TFile, tombstone: DeletionTombstone) {
    const graceMs = 5000;
    return file.stat.mtime <= tombstone.deletedAt + graceMs;
  }

  private normalizeFolder(input: string) {
    return normalizeFolder(input);
  }
}

export function normalizeFolder(input: string) {
  return input.replace(/^\/+/, "").replace(/\/+$/, "") + "/";
}
