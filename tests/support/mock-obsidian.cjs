const path = require("path");

function normalizePath(value) {
  return String(value).replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

class TAbstractFile {
  constructor(filePath) {
    this.path = normalizePath(filePath);
    this.name = path.posix.basename(this.path);
    this.parent = null;
  }
}

class TFile extends TAbstractFile {
  constructor(filePath, content = "", options = {}) {
    super(filePath);
    this.extension = this.name.includes(".") ? this.name.split(".").pop() || "" : "";
    this.basename = this.extension ? this.name.slice(0, -(this.extension.length + 1)) : this.name;
    this.stat = {
      mtime: options.mtime ?? Date.now(),
      size: options.size ?? 0,
    };
    this.content = content;
    this.binary = options.binary ?? null;
    if (typeof content === "string") {
      this.stat.size = options.size ?? Buffer.byteLength(content, "utf8");
    }
  }
}

class Editor {
  constructor(initialValue = "") {
    this.value = initialValue;
  }

  getValue() {
    return this.value;
  }

  setValue(nextValue) {
    this.value = nextValue;
  }

  replaceSelection(text) {
    this.value += text;
  }
}

class MarkdownView {
  constructor(file, editor) {
    this.file = file;
    this.editor = editor;
  }
}

class MarkdownRenderChild {
  constructor(el) {
    this.el = el;
  }

  onunload() {}
}

class MarkdownPostProcessorContext {
  addChild(child) {
    this.child = child;
  }
}

class Plugin {
  constructor() {
    this.app = null;
  }

  addCommand() {}

  addRibbonIcon() {
    return { addClass() {} };
  }

  addSettingTab() {}

  register() {}

  registerEvent() {}

  registerInterval(id) {
    return id;
  }

  loadData() {
    return Promise.resolve(null);
  }

  saveData() {
    return Promise.resolve();
  }
}

class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
  }

  display() {}
}

class Modal {
  constructor(app) {
    this.app = app;
  }

  open() {}

  close() {}
}

class Setting {
  constructor(containerEl) {
    this.containerEl = containerEl;
  }

  setName() {
    return this;
  }

  setDesc() {
    return this;
  }

  addText() {
    return this;
  }

  addButton() {
    return this;
  }

  addToggle() {
    return this;
  }

  addDropdown() {
    return this;
  }

  addSlider() {
    return this;
  }
}

class Notice {
  constructor(message) {
    Notice.messages.push(message);
    this.message = message;
  }

  static messages = [];
}

class MockVault {
  constructor() {
    this.files = new Map();
    this.folders = new Set();
  }

  addFile(filePath, content = "", options = {}) {
    const file = new TFile(filePath, content, options);
    this.files.set(file.path, file);
    return file;
  }

  getFiles() {
    return [...this.files.values()];
  }

  getMarkdownFiles() {
    return this.getFiles().filter((file) => file.extension.toLowerCase() === "md");
  }

  getAbstractFileByPath(filePath) {
    const normalized = normalizePath(filePath);
    return this.files.get(normalized) ?? (this.folders.has(normalized) ? { path: normalized } : null);
  }

  async read(file) {
    return file.content ?? "";
  }

  async readBinary(file) {
    if (file.binary instanceof ArrayBuffer) {
      return file.binary;
    }

    return new TextEncoder().encode(file.content ?? "").buffer;
  }

  async modify(file, content, options = {}) {
    file.content = content;
    file.binary = null;
    file.stat = {
      mtime: options.mtime ?? Date.now(),
      size: Buffer.byteLength(content, "utf8"),
    };
  }

  async modifyBinary(file, binary, options = {}) {
    file.binary = binary.slice(0);
    file.content = "";
    file.stat = {
      mtime: options.mtime ?? Date.now(),
      size: binary.byteLength,
    };
  }

  async create(filePath, content, options = {}) {
    const file = this.addFile(filePath, content, options);
    return file;
  }

  async createBinary(filePath, binary, options = {}) {
    const file = this.addFile(filePath, "", { ...options, binary });
    file.stat.size = binary.byteLength;
    return file;
  }

  async delete(file) {
    this.files.delete(file.path);
  }

  async trash(file) {
    this.files.delete(file.path);
  }

  async createFolder(folderPath) {
    this.folders.add(normalizePath(folderPath));
  }
}

class MockWorkspace {
  constructor() {
    this.leaves = [];
    this.activeFile = null;
  }

  getLeavesOfType(type) {
    if (type === "markdown") {
      return this.leaves;
    }

    return [];
  }

  getActiveFile() {
    return this.activeFile;
  }

  on() {}
}

function createMockObsidianModule(requestUrlHandler) {
  return {
    App: class App {},
    Editor,
    MarkdownFileInfo: class MarkdownFileInfo {},
    MarkdownRenderChild,
    MarkdownView,
    MarkdownPostProcessorContext,
    Modal,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    TAbstractFile,
    TFile,
    normalizePath,
    requestUrl: requestUrlHandler,
  };
}

function createMockApp() {
  const vault = new MockVault();
  const workspace = new MockWorkspace();
  return { vault, workspace };
}

function createMarkdownLeaf(file, editor) {
  return { view: new MarkdownView(file, editor) };
}

module.exports = {
  createMockObsidianModule,
  createMockApp,
  createMarkdownLeaf,
  Editor,
  MarkdownView,
  Notice,
  TFile,
  TAbstractFile,
  normalizePath,
};
