# Secure WebDAV Images 中文安装说明

## 插件简介

`Secure WebDAV Images` 是一个 Obsidian 插件，用来把笔记中的图片剥离到远端 WebDAV 图片目录，同时把笔记和其他非图片附件同步到单独的远端笔记目录。

它适合这类场景：

- vault 中图片很多，移动端越来越重
- 不希望把图片长期保存在本地
- 希望笔记和图片走不同的远端目录
- 希望同步时不仅能增量上传，还能清理远端残留文件

## 功能概览

- 图片上传到 WebDAV 图片目录
- 图片在笔记中保存为 `secure-webdav` 自定义代码块
- 阅读模式和当前编辑显示链路可以查看远程图片
- 笔记和非图片附件同步到单独的远端笔记目录
- 同步采用本地与远端对账模式
- 支持按需加载笔记和本地占位文件
- 支持整库迁移旧版原生图片引用
- 支持把网页文章中的 `http/https` 外链图片抓取并保存到自己的 WebDAV

## 安装方式

目前最适合通过“手动安装社区插件”的方式使用。

推荐优先下载 Release 里的安装压缩包：

```text
secure-webdav-images-0.0.7.zip
```

这个压缩包里已经包含安装所需的核心文件：

- `main.js`
- `manifest.json`
- `styles.css`
- `INSTALL.zh-CN.md`

### 方法一：从发布包手动安装

1. 打开插件仓库的 Release 页面。
2. 下载当前版本里的安装压缩包：

```text
secure-webdav-images-0.0.7.zip
```

3. 解压压缩包。
4. 打开你的 Obsidian vault 目录。
5. 进入：

```text
.obsidian/plugins/secure-webdav-images/
```

6. 如果目录不存在，就手动创建。
7. 把解压后目录中的这 3 个文件放进去：
   - `main.js`
   - `manifest.json`
   - `styles.css`
8. 重新启动 Obsidian，或重新加载社区插件。
9. 在 `设置 > 社区插件` 中启用 `Secure WebDAV Images`。

## 手机端安装

手机端安装的关键目标是“尽量少折腾文件”。

先确认你的手机端 Obsidian 版本不低于 `1.5.0`。如果你之前装过旧版本插件，建议先删除旧的 `secure-webdav-images` 插件目录，再覆盖安装新版本，避免因为旧的 `manifest.json` 缓存导致无法启用。

最推荐的方式也是下载安装压缩包，然后只把里面的 3 个核心文件放到插件目录。

### Android 安装步骤

1. 在手机浏览器中打开插件仓库的 Release 页面。
2. 下载：

```text
secure-webdav-images-0.0.7.zip
```

3. 用手机文件管理器解压压缩包。
4. 找到你的 Obsidian vault 目录。
5. 进入：

```text
<你的 Vault>/.obsidian/plugins/secure-webdav-images/
```

6. 如果目录不存在，就手动创建。
7. 把压缩包中的这 3 个文件复制进去：
   - `main.js`
   - `manifest.json`
   - `styles.css`
8. 打开 Obsidian。
9. 进入 `设置 > 社区插件`。
10. 关闭受限模式并启用插件。

### iPhone / iPad 安装思路

iOS 上手动安装插件会比桌面和 Android 更麻烦，因为文件管理和 App 沙盒限制更严格。

最稳的方式是：

1. 先在电脑上把插件安装到同一个 vault。
2. 确认插件目录已经存在：

```text
.obsidian/plugins/secure-webdav-images/
```

3. 再通过你的 vault 同步方式，把这个插件目录一起带到移动端。
4. 在移动端 Obsidian 中启用插件。

如果你必须在 iPhone / iPad 上纯手动安装，原则仍然一样：

- 下载安装压缩包
- 解压
- 把 `main.js`、`manifest.json`、`styles.css` 放进插件目录

但具体可操作性会取决于你使用的文件管理方式和 vault 存储位置。

### 手机端最简建议

如果你希望用户尽量少操作，可以直接让用户记住这一句话：

```text
下载 secure-webdav-images-0.0.7.zip，解压后把 main.js、manifest.json、styles.css 放进 .obsidian/plugins/secure-webdav-images/
```

### 方法二：开发环境本地安装

如果你是在本地开发或测试插件，可以直接使用源码目录。

1. 把插件源码放到：

```text
.obsidian/plugins/secure-webdav-images/
```

2. 在插件目录运行：

```bash
npm install
npm run build
```

3. 打开 Obsidian。
4. 到 `设置 > 社区插件` 启用插件。

如果你修改了源码，记得重新运行：

```bash
npm run build
```

## 在 Obsidian 中启用插件

1. 打开 Obsidian。
2. 进入 `设置`。
3. 打开 `社区插件`。
4. 关闭 `受限模式`。
5. 在插件列表中找到 `Secure WebDAV Images`。
6. 开启插件。

启用后，你就可以在插件设置页里看到它的配置项。

## 首次配置

启用后，请先填写这些配置：

- `WebDAV 基础地址`
- `账号`
- `密码`
- `图片远程目录`
- `远程笔记目录`

建议：

- 图片目录和笔记目录分开设置
- 不要把图片目录和笔记目录设成同一个远端路径

### 示例

```text
WebDAV 基础地址: http://your-webdav-host:port
图片远程目录: remote-images
远程笔记目录: remote-notes
```

## 安装后建议先做什么

### 1. 测试 WebDAV 连接

在命令面板运行：

```text
Test WebDAV connection
```

这个命令会测试：

- 上传
- 读取
- 删除

如果通过，说明 WebDAV 链路可用。

### 2. 迁移旧笔记中的图片

如果你以前的笔记里还是原生图片引用：

- `![](...)`
- `![[...]]`

可以到插件设置页点击：

```text
迁移整库原生图片引用
```

它会把旧图片上传到远端图片目录，并改写为新的安全代码块格式。

### 3. 同步笔记内容

在命令面板运行：

```text
Sync vault content to WebDAV
```

它会同步笔记和非图片附件，并清理远端多余内容。

## 常用命令

### `Upload local images in current note to WebDAV`

作用：

- 只处理当前笔记中的本地图片
- 上传成功后删除本地图片
- 把图片改写为 `secure-webdav` 代码块

### `Test WebDAV connection`

作用：

- 快速验证 WebDAV 是否可用

### `Sync vault content to WebDAV`

作用：

- 对账同步笔记和非图片附件
- 上传新增
- 覆盖修改
- 删除远端残留
- 清理无引用远端图片

## 本地占位文件与按需加载

插件支持“按需加载笔记”模式。

当你把 `笔记本地保留模式` 设置为：

```text
按需加载笔记
```

并设置 `笔记本地回收天数` 后：

- 长时间未访问的 Markdown 笔记会在同步后变成本地占位文件
- 真正打开这篇笔记时，插件会从远端笔记目录恢复完整内容

这项功能主要用于减轻移动端本地空间压力。

## 文件放置位置说明

安装后，插件文件应该位于：

```text
你的 Vault/.obsidian/plugins/secure-webdav-images/
```

正常情况下，目录中至少会有：

- `main.js`
- `manifest.json`
- `styles.css`

如果是源码开发环境，还会有：

- `main.ts`
- `package.json`
- `node_modules`

## 常见问题

### 插件启用后看不到设置项

先检查：

- 是否关闭了受限模式
- 插件是否已成功启用
- `manifest.json`、`main.js`、`styles.css` 是否都在插件目录里

### 插件能上传，但图片不显示

通常先检查：

- 图片是否已经上传到远端
- 笔记是否已经改写为 `secure-webdav` 格式
- 当前是否启用了插件
- WebDAV 读取是否正常

### 同步后为什么本地图片没有了

这是插件的设计行为：

- 图片上传成功后立即删除本地图片
- 笔记只保留远端图片引用

## 开发与构建

在插件目录运行：

```bash
npm install
npm run build
npx tsc --noEmit
```
